# Day 2 - CodeDeploy: The Decision to Deploy Code Only and AppSpec's 13-Stage Lifecycle

If Beanstalk began with PaaS philosophy ("bundle environment together"), CodeDeploy starts from opposite conviction: **Build infrastructure yourself. I'll safely deploy code only.** Launched November 2014, this service extracted external version from Amazon's internal Apollo deployment system (millions of deployments annually). Whether EC2 exists, is on-premises, Lambda, or ECS Task—CodeDeploy solves one problem: "How to safely place new code atop already-running compute?"

This article examines how In-place vs Blue-Green trade-offs manifest across EC2, Lambda, ECS; why AppSpec.yml's 13 lifecycle hooks follow that specific order; and what signals trigger auto-rollback. Goal isn't memorizing hook names for exams but understanding design intent: "Why do BeforeInstall and AfterInstall exist separately?"

## Why CodeDeploy Chose "Code Only"

By 2014, AWS already had Beanstalk (2011), OpsWorks (2013), CloudFormation (2011). All three touched "code deployment," yet none cleanly addressed three scenarios:

First, **deploy to on-premises servers**. Beanstalk and OpsWorks worked AWS-only. Second, **progressive deployment to existing EC2 fleet**. Beanstalk bundled environments; couldn't import existing EC2. Third, **rollback code without infrastructure changes**. CloudFormation meant full stack update (5+ min); Beanstalk environment swap felt heavyweight.

CodeDeploy solved these by intentionally owning only "code + deployment logic." EC2/ASG/ALB assumed pre-existing. Core abstraction reduced to three: **Application (logical group) + Deployment Group (where) + Revision (what)**.

> 💡 **Related Theory**: This separation mirrors 12-factor app's "Build, Release, Run" stages (Factor V). Build = code → S3 zip (Revision), Release = Revision + config → Deployment, Run = Deployment Group EC2/Lambda/ECS. Same Revision deploying dev/staging/prod Deployment Groups sequentially becomes possible. Heroku's "release" concept and Kubernetes "Deployment + ReplicaSet" embody identical abstraction, different naming.

> 🔍 **Deeper Dive**: CodeDeploy Agent runs as Ruby daemon, polling CodeDeploy control plane every minute. Detecting new deployment, Agent fetches revision from S3/GitHub, extracts under `/opt/codedeploy-agent/deployment-root/<deployment-group-id>/<deployment-id>/`, executes AppSpec hooks. Polling model works if EC2 has internet access (or VPC endpoint to codedeploy-commands, codedeploy-commands-secure); operates private subnet without NAT Gateway. Agent logs at `/var/log/aws/codedeploy-agent/codedeploy-agent.log`—first-order ops debugging source.

## In-place vs Blue-Green: Same Words, Different Meaning

CodeDeploy's In-place and Blue-Green resemble Beanstalk's Rolling/Immutable but differ crucially. **CodeDeploy Blue-Green auto-replicates new ASG.** Beanstalk Blue-Green requires "manually create two separate environments, operate both"; CodeDeploy Blue-Green automates "copy Launch Template → spawn Green ASG → validate → traffic switch → terminate old ASG" within single deployment.

| Item | In-place | Blue-Green (EC2/ASG) |
|------|----------|----------------------|
| **Instance Replacement** | None (new code on same EC2) | Yes (new ASG created) |
| **Deployment Time** | Fast (5-10m) | Slow (15-30m) |
| **Rollback Speed** | Redeploy needed | Instant (Target Group revert) |
| **Cost** | None additional | Temp 2x |
| **AMI Change Response** | Not possible | Possible (new ASG uses new AMI) |
| **Stateful Workload** | Possible | Data migration needed |

Interesting: **Blue-Green isn't always safer**. Workloads with local disk cache, session storage, log buffers lose that state in Blue-Green. In-place keeps same EC2, preserving disk state. Real-world ops: stateless web apps → Blue-Green; stateful background workers → In-place.

> 📚 **Case Study**: Netflix designing Spinnaker (Asgard successor) faced this trade-off exactly. Eventually adopted Blue-Green ("Red/Black") standard, but separated stateful services (Cassandra, Memcached) via separate tooling. Meaning: even same organization splits deployment strategies per workload characteristics—normal. [Global Continuous Delivery with Spinnaker](https://netflixtechblog.com/global-continuous-delivery-with-spinnaker-2a6896c23ba7).

> ⚠️ **Gotcha**: CodeDeploy Blue-Green `terminationWaitTimeInMinutes: 0` terminates old ASG immediately post-traffic-switch. Problems discovered within 5 min can't instantly rollback—old instances gone. Ops recommendation: minimum 5-15 min; cautious 60 min. Cost increases proportionally.

## Why AppSpec's 13 Hooks Follow That Order

EC2/On-Premises lifecycle's 13 hooks aren't mere list—they're **state machine**. Each stage must complete before next; failure at any triggers deployment halt and rollback.

```
[1] ApplicationStop          ← Stop current version (graceful shutdown)
[2] DownloadBundle           ← AWS automatic (Agent S3 fetch revision)
[3] BeforeInstall            ← Pre-install (backup, DB migration dry-run)
[4] Install                  ← AWS automatic (file copy)
[5] AfterInstall             ← Post-install (permissions, symlinks, config substitution)
[6] ApplicationStart         ← Start new version (systemctl start app)
[7] ValidateService          ← Instance self-validation (port listen check)
─────── Blue-Green only ───────
[8]  BeforeBlockTraffic      ← Before old instance traffic blockage
[9]  BlockTraffic            ← AWS automatic (Target Group deregister)
[10] AfterBlockTraffic       ← After blockage (drain confirmation)
[11] BeforeAllowTraffic      ← Before new instance traffic enable (warm-up)
[12] AllowTraffic            ← AWS automatic (Target Group register)
[13] AfterAllowTraffic       ← After enable (smoke test)
```

Order fascinates because **BeforeInstall and AfterInstall split**. Could merge into single stage but didn't—"pre-copy tasks" and "post-copy tasks" fundamentally differ. BeforeInstall typically backs up existing directories (`/var/www/html`) or installs system packages the new version needs (`yum install nginx`). AfterInstall grants permissions on copied files (`chown -R nginx:nginx`) and substitutes environment-specific configs (`sed -i 's/PLACEHOLDER/prod-value/'`).

ValidateService and AfterAllowTraffic embody similar split. **ValidateService checks only itself**—port open? health endpoint returns 200? **AfterAllowTraffic checks entire system post-actual-traffic**—real response time normal? downstream calls succeed? This separation catches "my node healthy but downstream dead."

> 🔍 **Deeper Dive**: AppSpec hooks default to root execution but `runas: ec2-user` switches user. Trap: `runas` uses `setuid`, not `su -` environment initialization. So ec2-user's PATH/HOME remain root's. Script expecting `~/.bashrc` vars fails. Safe pattern: script first line explicitly `source /home/ec2-user/.bashrc` or hardcode vars.

## DownloadBundle and Install Remain "AWS Automatic"

Of 13 hooks, 5 users can't touch: DownloadBundle, Install, BlockTraffic, AllowTraffic, plus lifecycle transitions outside hooks. Why not expose them?

Answer: **idempotency and atomicity guarantee**. DownloadBundle extracts S3 zip to staging directory; user involvement breaks the invariant "files live here." All downstream scripts assume staging path—broken invariant collapses entire model. Install copies staging → destination with AWS-standardized permission/owner/symlink handling, ensuring consistent OS/filesystem operation.

BlockTraffic and AllowTraffic invoke ALB APIs (`DeregisterTargets`, `RegisterTargets`). User involvement desynchronizes ALB and CodeDeploy state. CodeDeploy must track its own API call results to decide next-stage entry.

> 💡 **Related Theory**: This design mirrors Kubernetes admission controller / mutating webhook pattern. User hooks enable "observation + side effects"; core system state changes remain control-plane-exclusive. Distributed systems minimizing "control plane state ≠ data plane state" mismatch follow this: Raft/Paxos where leader alone commits log entries.

## Lambda CodeDeploy: Alias Weighting Trick

Lambda deployment uses entirely different mechanism achieving same effect. EC2: "gradually replace some of many servers"; Lambda: "distribute traffic between versions of single function with weights." Lambda itself infinitely scales as single logical entity—no fleet-replacement concept.

```
[Caller] → Lambda Alias "prod"
               ├─ Version 1 (weight 90%)
               └─ Version 2 (weight 10%)  ← Canary in progress
```

Power of structure: **callers know only Alias**. API Gateway, EventBridge, S3 triggers all append `:prod` alias suffix. CodeDeploy adjusts weights between two versions progressively.

Lambda Deployment Config weight changes:

| Config | Pattern | Total Duration |
|--------|---------|---|
| **Canary10Percent5Minutes** | V2 10% → wait 5m → V2 100% | 5m |
| **Canary10Percent30Minutes** | V2 10% → wait 30m → V2 100% | 30m |
| **Linear10PercentEvery1Minute** | +10% every minute (10/20/30/...) | 10m |
| **Linear10PercentEvery10Minutes** | +10% every 10m | 100m |
| **AllAtOnce** | Instant V2 100% | 0m |

Canary: "fixed rate → stability check → 100%" (two-stage). Linear: "gradual increase per interval" (multi-stage). Linear seems safer but **concurrent V1/V2 duration creates data migration compatibility issues**. V1 and V2 writing different schemas to table breaks both. Thus Linear requires backward-compatible schema changes (additions only, no deletions).

> 📚 **Case Study**: Lambda Canary shined at Coca-Cola Freestyle dispenser backend. 50K dispensers worldwide calling Lambda functions; failure cost ties to revenue. Applied Canary10Percent10Minutes to all deployments. Post-incident when CloudWatch detected 4xx spike during deployment → auto-rollback, ops reported "manual validation time reduced to zero." AWS re:Invent 2018 SVS343.

> ⚠️ **Gotcha**: Lambda weights decide per invocation—"User A always V2" false. "This call 90% V1, 10% V2" true. Same user can hop V1 → V2 → V1, breaking session state / cache consistency. Need sticky user routing? API Gateway routes by user ID to separate aliases.

## ECS Blue-Green: Two Target Groups and Test Listener

ECS Blue-Green leverages ALB's **two Target Groups + two Listeners**. Traffic switch = ALB listener rule change, no DNS TTL delay.

```
ALB
 ├─ Production Listener (port 80)
 │   └─ Forward → TargetGroup-Blue (current ops)
 └─ Test Listener (port 8080)
     └─ Forward → TargetGroup-Green (validating)

Deployment flow:
  ① New ECS Task Set registered to TargetGroup-Green
  ② AfterAllowTestTraffic hook: test via port 8080
  ③ BeforeAllowTraffic hook: final validation pre-production-switch
  ④ Production Listener switches to TargetGroup-Green (instant 100% traffic)
  ⑤ AfterAllowTraffic hook: validate with production traffic
  ⑥ After wait: TargetGroup-Blue Task Set terminates
```

ECS Blue-Green's power: **AfterAllowTestTraffic hook**. Before production traffic, send synthetic test traffic on separate port. Ops pre-built smoke test suite runs auto—regression caught before user exposure. EC2 Blue-Green has BeforeAllowTraffic, but ECS separates listener further, clarifying test traffic isolation.

> 💡 **Related Theory**: Implements Martin Fowler's "QA in Production" or Charity Majors' "Test in Production" pattern. Core: "staging doesn't sufficiently reproduce production," thus deploy safely then gradually expose. ECS Blue-Green Test Listener is infrastructure-level implementation of this philosophy.

## Auto-Rollback: Subtle Difference Between Two Triggers

CodeDeploy auto-rollback monitors two events.

**DEPLOYMENT_FAILURE** fires on hook failure, timeout, or instance health check failure. CodeDeploy's control-plane signal.

**DEPLOYMENT_STOP_ON_ALARM** fires when CloudWatch Alarm transitions to ALARM during deployment. External signal.

Difference: **time resolution**. DEPLOYMENT_FAILURE detected instantly (seconds) on failure; CloudWatch Alarm delayed by evaluation period (typically 1 min × 3 datapoints) = minimum 3 min. Thus "Alarm-based auto-rollback" is safety net, not primary defense.

Ops recommended pattern:

```bash
# AlarmConfiguration: alarms to monitor during deployment
aws deploy update-deployment-group \
  --application-name MyWebApp \
  --current-deployment-group-name prod \
  --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM \
  --alarm-configuration enabled=true,ignorePollAlarmFailure=false,alarms='[
    {"name":"HighErrorRate-5xx"},
    {"name":"HighLatency-p99"},
    {"name":"DependencyFailure"}
  ]'
```

`ignorePollAlarmFailure=false` critical. If CloudWatch temporarily unavailable: proceed deployment unknown-alarm-state (`true`) or safely halt (`false`)? Ops: `false` (conservative).

> 🔍 **Deeper Dive**: CodeDeploy auto-rollback actually "redeploys previous revision." Creates new deployment, specifying `revision` as prior successful revision. Thus rollback executes all lifecycle hooks. If previous ApplicationStop script fails on current state, rollback fails. Ops incident: "rollback failed, manual intervention needed"—usually this case. Defense: idempotent ApplicationStop (returns 0 already-stopped) + sufficient timeout.

## Beanstalk vs CodeDeploy vs CloudFormation Responsibility Boundaries

Three services handle "deployment" but responsibility differs.

| Responsibility | Beanstalk | CodeDeploy | CloudFormation |
|---|---|---|---|
| **Infrastructure Creation** | ✅ Auto (EC2/ALB/RDS) | ❌ User | ✅ Auto (all resources) |
| **Code Deploy** | ✅ Integrated | ✅ Core | ❌ (needs CFN custom resource) |
| **Rollback Unit** | Entire environment | Revision | Entire stack |
| **Deploy Hook** | .ebextensions, .platform | AppSpec hooks | UpdatePolicy + WaitCondition |
| **Runtime Awareness** | ✅ (Node/Python/Java/...) | ❌ (agnostic) | ❌ (agnostic) |

CodeDeploy's "runtime agnosticism" is strength and weakness. Unlike Beanstalk auto-creating Python venv, AppSpec scripts must include `python -m venv`. Conversely, unified abstraction for any language—Go binary, Java jar, Python wheel, C++ executable all same AppSpec structure.

Real-world: combine all three. CloudFormation creates VPC/ALB/ASG, CodeDeploy deploys code atop. Beanstalk for small workloads wanting bundled infrastructure. AWS Well-Architected Framework Operational Excellence Pillar recommends this combined pattern.

## Summary

Two insights: First, CodeDeploy's narrow responsibility ("code only") lets it treat EC2, on-prem, Lambda, ECS with unified abstraction. Second, AppSpec's 13 stages aren't listing—they're state machine guaranteeing idempotent + atomic operation; order must be externally understood via design intent.

Next, we add code build atop CodeDeploy (CodeBuild), then orchestrate entire flow (CodePipeline). "Code push → build → test → multi-stage deployment" as AWS native CI/CD implementation—trade-offs vs GitHub Actions, Jenkins.

---

## 📝 Practice Questions

**Question 1.** AppSpec.yml hook order: after new version files copied to destination directory, permission setting, symlink creation, environment-specific config substitution occurs at?

A) BeforeInstall  
B) AfterInstall  
C) ApplicationStart  
D) ValidateService  

**Answer: B**

**Explanation:** 13-stage order: ApplicationStop → DownloadBundle(auto) → BeforeInstall → Install(auto) → AfterInstall → ApplicationStart → ValidateService. Post-copy exactly AfterInstall. BeforeInstall happens "pre-copy" (backup, install system packages). Separation: "pre-file tasks" vs "post-file tasks" fundamentally differ—permission-setting requires files present.

---

**Question 2.** Deploy Lambda new version: first 10% traffic for 5 minutes to verify stability, then 100%. Correct Deployment Configuration?

A) CodeDeployDefault.LambdaCanary10Percent5Minutes  
B) CodeDeployDefault.LambdaLinear10PercentEvery1Minute  
C) CodeDeployDefault.LambdaAllAtOnce  
D) CodeDeployDefault.HalfAtATime  

**Answer: A**

**Explanation:** Canary: "fixed rate duration → 100%" (two-stage). Linear: "increment per interval" (multi-stage), unclear stability-check window. AllAtOnce: instant 100%, no validation time. HalfAtATime: EC2 term, not Lambda. Trap: Canary vs Linear seem similar but "two-stage vs multi-stage" differs fundamentally.

---

**Question 3.** EC2 Blue-Green: new ASG spawned, code installed, ALB Target Group register pre-operation. Ops verify script before traffic switch hook?

A) ApplicationStart  
B) ValidateService  
C) BeforeAllowTraffic  
D) AfterAllowTraffic  

**Answer: C**

**Explanation:** ValidateService = instance self-check (port open); happens pre-registration but not "pre-switch" intent. BeforeAllowTraffic = Blue-Green exclusive, exact "pre-registration" timing. AfterAllowTraffic = post-registration. Split: "pre-production-traffic" vs "post-production-traffic" enable different validations.

---

**Question 4.** Ops config CodeDeploy auto-rollback on 5x 5xx error spike during deployment. How?

A) Separate Lambda from CloudWatch Events  
B) Deployment Group auto-rollback-configuration add `DEPLOYMENT_STOP_ON_ALARM`, alarm-configuration register CloudWatch Alarm  
C) CloudWatch Synthetics only  
D) IAM policy  

**Answer: B**

**Explanation:** CodeDeploy native. AutoRollbackConfiguration events: `DEPLOYMENT_FAILURE` (hook fail), `DEPLOYMENT_STOP_ON_ALARM` (external alarm), `DEPLOYMENT_STOP_ON_REQUEST` (manual). AlarmConfiguration registers Alarm ARNs. `ignorePollAlarmFailure=false` safely halts if CloudWatch unreachable. Trap: Alarm rollback has 3+ min delay (metric eval + periods), safety net not primary defense.

---

**Question 5.** EC2 CodeDeploy most-safe production deployment (1 per time, slowest)? Config?

A) CodeDeployDefault.AllAtOnce  
B) CodeDeployDefault.HalfAtATime  
C) CodeDeployDefault.OneAtATime  
D) CodeDeployDefault.LambdaCanary10Percent5Minutes  

**Answer: C**

**Explanation:** OneAtATime: one instance at time, safest, slowest. HalfAtATime: 50% capacity risk. AllAtOnce: downtime. LambdaCanary: Lambda-only. Trap: "safest" + "EC2" = OneAtATime. Caveat: 100-instance fleet = 100+ hours deployment; real ops use Custom Config (5-10% increments).

---

**Question 6.** ECS Blue-Green: production traffic pre-switch, validate synthetic test traffic on separate port (8080) hook?

A) BeforeInstall  
B) AfterInstall  
C) AfterAllowTestTraffic  
D) AfterAllowTraffic  

**Answer: C**

**Explanation:** ECS Blue-Green: production listener (80), test listener (8080). New Task Set registers to test listener; AfterAllowTestTraffic runs smoke test via 8080. BeforeAllowTraffic: production-switch pre; AfterAllowTraffic: production post. ECS exclusive structure (EC2/Lambda absent), exam point.

---

**Question 7.** Lambda Canary deployment: same user receives V1 response, next call V2 response. Cause?

A) CodeDeploy bug  
B) Lambda weights per-invocation random; same user can hop V1/V2  
C) API Gateway cache  
D) IAM insufficient  

**Answer: B**

**Explanation:** Lambda alias weight per-invocation probabilistic. "User A always V2" false; "this call 90% V1, 10% V2" true. Same user multiple calls = V1/V2 hopping possible. Session/cache consistency needed? API Gateway user-ID hash routing separate aliases or backend state-compatibility guarantee. Canary requires backward-compatible changes.

