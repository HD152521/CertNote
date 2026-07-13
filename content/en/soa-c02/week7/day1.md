# Day 1 - Elastic Beanstalk and Five Deployment Policies: The True Cost of Zero Downtime

When first selecting "Deployment policy" in the Beanstalk console, five options appear equivalent: All at once, Rolling, Rolling with additional batch, Immutable, Blue-Green. The names sound similar, yet they determine whether you experience five minutes of downtime, whether your 30-minute deployment costs twice as much, and whether a single alarm instantly triggers rollback.

This article begins with why Beanstalk as a PaaS intentionally creates EC2/ALB/ASG inside customer accounts, then examines the five policies across four trade-off axes: speed, cost, downtime, and rollback. The goal isn't memorizing tables for exams but developing the operator's instinct to judge "which policy fits this release?"

## Why Beanstalk Straddles PaaS and IaaS

Viewing Beanstalk merely as "Heroku for AWS" captures only half the picture. When launched January 2011, AWS already sold EC2, RDS, ELB, and SQS separately; developers complained: "Manually clicking these together in the console is exhausting." Heroku (2007) and Google App Engine (2008) dominated the PaaS market. AWS answered with Beanstalk, making an interesting choice: **infrastructure remains visible within customer accounts**.

Heroku hides EC2 behind "Dynos" abstraction; customers never see it. Beanstalk reversed this. `aws ec2 describe-instances` displays EC2; ALB, ASG, RDS all remain customer account resources. This embodies the **PaaS convenience + IaaS control trade-off**. In exam scenarios choosing between Beanstalk and ECS: Beanstalk fits "automate existing EC2 workloads"; ECS/Fargate fits "rewrite with container standards."

> 💡 **Related Theory**: NIST SP 800-145 defines PaaS as "customers deploy applications but don't control underlying cloud infrastructure (network, servers, OS, storage)." Beanstalk **partially violates** this definition—customers can SSH into EC2 and manually modify security groups. Some literature calls Beanstalk "Managed IaaS" or "Application Platform." For exams, PaaS is correct; understanding actual responsibility models as IaaS-like prevents trap answers.

> 🔍 **Deeper Dive**: Beanstalk's internals run atop CloudFormation. Running `eb create` internally creates a CloudFormation stack (named `awseb-e-xxx-stack`), which provisions EC2, ALB, ASG, SG. Running `aws cloudformation describe-stack-events` shows Beanstalk environment creation step-by-step. Two implications: ① Beanstalk environment problems → CloudFormation events are first-order diagnosis. ② Manually modifying Beanstalk resources in console → stack drift → overwritten on next deployment.

## The Real Trade-Offs Across Five Deployment Policies

Everyone memorizes deployment policy comparison tables. The problem: when judging "which fits?" from scenarios, most focus on only two axes (downtime, cost). Reality encompasses **speed, capacity, cost, rollback speed, and failure impact scope**—five axes all different.

| Policy | Deploy Time | Downtime | Temp Capacity | Temp Cost | Rollback Speed | Failure Impact |
|--------|-------------|----------|---------------|-----------|---|---|
| **All at once** | 1-2m | **Yes** | 0% (full stop) | None | Redeploy needed (5m) | 100% users |
| **Rolling** | 5-10m | None | Temp **decrease** | None | Redeploy needed | Batch % of users |
| **Rolling with batch** | 7-15m | None | Maintained | Batch +α | Redeploy needed | Batch % of users |
| **Immutable** | 10-20m | None | Maintained | **2x** (temp) | Fast (old ASG alive) | 0% (post-validation switch) |
| **Blue-Green (URL Swap)** | 15-30m + DNS TTL | None | Maintained | **2x** (parallel) | Instant (CNAME revert) | 0% (post-validation switch) |

Many say "never use All at once in production," but it's actually **most rational for dev/staging**. No traffic impact, fastest deployment, failure = redeploy again. When operators choose policies, the key metric is "environment tier × failure cost."

### Why Rolling's "Capacity Decrease" Is Dangerous

Rolling often gets pitched as "zero downtime, no extra cost—great option." In reality, **overlapping with traffic spikes creates downtime-equivalent effects**. With 4-instance ASG and 50% batch Rolling, only 2 instances handle traffic during deployment. If traffic spikes to 1.2x normal, response time explodes; ELB health checks start failing. Failed health checks signal ASG to "replace instances," launching replacements even of deployed instances, trapping deployment in **infinite loop**.

> 📚 **Case Study**: Atlassian's April 5, 2022 14-day outage—one root cause was "script error + partial capacity during deployment." Maintenance script unintentionally queued ~400 customer sites for permanent deletion; recovery required gradual deployment at 48 hours per site. Multi-stage deployment seemed safe; during disaster recovery, **throughput became the bottleneck**. [Atlassian official post-incident review](https://www.atlassian.com/engineering/post-incident-review-april-2022-outage). After that, Atlassian increased auto-recovery tool parallelism 100x.

> ⚠️ **Gotcha**: Health check grace period set too short during Rolling → new instances fail health checks before warming up → deployment halts. Beanstalk default grace period: 300s. JVM apps (Spring Boot, etc.) commonly need 60-90s cold start; 600s+ is safer.

### The "2x Cost" Trap of Immutable

Immutable policy: "keep old ASG, create new ASG, validate, then switch traffic." New ASG spawns same instance count as old, hence "2x cost" explanation. This 2x applies **during validation only** (usually 5-15m). AWS charges per hour (t/m/c series hourly; some nano/micro second-based). A 30-minute deployment bills over 1 hour of instance time.

Teams deploying 100x monthly face non-trivial costs (t3.medium 4-instance × 1 hour × 100 = ~$16/month). Operators should understand "Immutable cost scales with deployment frequency," not "Immutable is expensive."

### Blue-Green URL Swap's DNS TTL Trap

Beanstalk Blue-Green creates two environments, then swaps CNAMEs via `swap-environment-cnames`. CloudFront or Route 53 Alias enables relatively fast switches, but **clients and ISPs cache DNS**, so all users reaching new environment takes TTL duration.

Beanstalk default CNAME TTL: 60s. Some ISPs violate RFC 2181, using longer TTL. Some Korean mobile carriers cache 5m; some corporate DNS resolvers cache 30m. Thus **Blue-Green enables instant rollback, but actual traffic shift is gradual**. Exams frequently trap: "Blue-Green = instant 100% switch." That's misleading.

> 💡 **Related Theory**: DNS TTL vs. consistency trade-off defined in RFC 1035 (1987) and RFC 2181 (1997). Short TTL enables fast propagation but burdens authoritative servers; long TTL reduces load but delays changes. AWS Global Accelerator uses BGP Anycast static IPs instead of DNS specifically to bypass this trade-off. Anycast switches via BGP routing table updates (typically seconds), not waiting for DNS TTL.

## Comparison with CodeDeploy and Kubernetes Rolling Updates

Beanstalk deployment policies aren't AWS-only inventions. Comparing to other systems reveals essentials.

| System | All at once | Rolling | Blue-Green | Canary |
|--------|-------------|---------|------------|--------|
| **Beanstalk** | All at once | Rolling/RWB | Immutable, URL Swap | (unsupported directly) |
| **CodeDeploy EC2** | AllAtOnce | HalfAtATime/OneAtATime | Blue-Green via ASG | (indirect) |
| **Kubernetes** | Recreate | RollingUpdate(maxSurge/maxUnavailable) | Two Deployments + Service switch | Argo Rollouts, Flagger |
| **GCP App Engine** | (none, always zero-downtime) | Traffic splitting (progressive) | Version separation + 100% traffic switch | Traffic splitting (weighted) |
| **Azure App Service** | (restart) | Slot deployment | Deployment Slot Swap | Traffic Routing(%) |

GCP App Engine and Azure Deployment Slot most resemble Beanstalk Blue-Green. Azure **Slot Swap** is more elegant—it changes routing tables at IP level, bypassing DNS TTL issues. AWS achieves similar effect via ALB Target Group weights; Beanstalk avoids this mechanism to guarantee stronger environment isolation (completely separate ASG, DB, configuration).

Kubernetes's `maxSurge` and `maxUnavailable` precisely generalize Rolling with additional batch. `maxSurge=25%` allows +25% temporary instances; `maxUnavailable=0%` forbids capacity decrease. Thus "K8s RollingUpdate with maxSurge=25%, maxUnavailable=0% = Beanstalk Rolling with additional batch 25%" behave identically.

## Worker Tier: The Small Invention of SQS Daemon

Worker Tier represents Beanstalk's underrated strength. Typical Worker pattern (EC2 directly polling SQS) embeds SQS SDK, retry logic, and DLQ handling into code. Beanstalk Worker **separates this as sidecar daemon**.

```
[SQS Queue] ──┐
              │ poll
              ▼
        [SQS Daemon] ── HTTP POST localhost:80 ──→ [Web App (any language)]
              │                                          │
              │ ◄────────── HTTP 200 ─────────────────── │
              ▼
        DeleteMessage
```

SQS Daemon receives message, HTTP POSTs to local app (usually port 80); app returns 200 → auto-delete, 4xx/5xx → visibility timeout → retry. **App code needs only one HTTP handler**. This design aligns perfectly with 12-factor apps' "Process Type" (Worker and Web share code, differ in entry point).

> 🔍 **Deeper Dive**: SQS Daemon includes HTTP headers: `X-Aws-Sqsd-Msgid`, `X-Aws-Sqsd-Queue`, `X-Aws-Sqsd-First-Received-At`, `X-Aws-Sqsd-Receive-Count`. Apps can examine `Receive-Count` to adapt strategy by retry count (e.g., ≥3 → static analysis → immediate DLQ move). Defining periodic tasks via `cron.yaml` internally creates lock messages for leader election (preventing concurrent runs across instances).

## RDS Externalization: Lessons Learned Only After Failure

Creating Beanstalk environment with "Add DB" option generates RDS with environment. Tempting but **environment termination deletes RDS**. Common prod incident: "staging cleanup accidentally deleted prod DB backup."

Recommended pattern: separate RDS into external CloudFormation/Terraform stack, inject endpoint via Beanstalk environment variables (`RDS_ENDPOINT`, `RDS_PASSWORD`). Even safer: **credentials in Secrets Manager, retrieve via IAM permission**.

```bash
# Recommended: inject external RDS endpoint via environment variable
aws elasticbeanstalk update-environment \
  --environment-name MyApp-prod \
  --option-settings \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DB_HOST,Value=mydb.xxx.rds.amazonaws.com \
    Namespace=aws:elasticbeanstalk:application:environment,OptionName=DB_SECRET_ARN,Value=arn:aws:secretsmanager:...:secret:db-creds
```

> 📚 **Case Study**: 2017 Travis CI experienced production environment migration data loss; partial cause was "unclear DB separation by environment → staging cleanup affected prod." Subsequently, many adopted: **always separate DB from environment stack**. AWS Well-Architected Framework Reliability Pillar explicitly codifies: "data lifecycle decoupled from compute lifecycle."

## .ebextensions and .platform/hooks

Beanstalk OS-level automation evolved through two mechanisms.

**`.ebextensions/*.config`** predates Amazon Linux 2, defining packages, environment variables, container_commands in YAML/JSON. Amazon Linux 2 (Platform v3) changed some behaviors.

**`.platform/hooks/`** introduced with Amazon Linux 2, executing shell scripts by deployment stage based on directory structure.

```
.platform/
  hooks/
    prebuild/     # before app build
    predeploy/    # before deployment
    postdeploy/   # after deployment
  confighooks/
    prebuild/
    predeploy/
    postdeploy/
```

Most common migration trap: `container_commands`. Platform v2 executed `container_commands` from staging directory; v3 requires migration to prebuild/predeploy. Not simple lift-and-shift.

## Summary

Two key takeaways: First, Beanstalk compromises PaaS convenience with IaaS control, exposing EC2, ALB, RDS in customer accounts. Second, five deployment policies aren't simple "options" but coordinates across a five-axis trade-off: **speed, capacity, cost, rollback, and failure impact**.

Next, we'll examine CodeDeploy—unlike Beanstalk bundling environments, it focuses on "code-only deployment." AppSpec hook execution order, Lambda Canary weight mechanics, ECS Blue-Green Target Group switching—see how different compute platforms implement the same deployment abstraction.

---

## 📝 Practice Questions

**Question 1.** Production environment requires zero downtime, maintained capacity, and minimal additional cost. Which Beanstalk deployment policy fits?

A) All at once  
B) Rolling  
C) Rolling with additional batch  
D) Immutable  

**Answer: C**

**Explanation:** Five-axis trade-off logic: no downtime (A fails), maintained capacity (B has temp decrease), minimal cost (D doubles cost). Rolling with additional batch replaces batch-by-batch + temp instances maintaining capacity while minimizing cost per batch. Immutable is safer but violates "minimal cost." If scenario adds "traffic spike expected," Immutable becomes correct (Rolling risks health check failure).

---

**Question 2.** After deploying new version, operator wants instant 100% rollback to previous version on alarm. Fastest rollback guarantee?

A) All at once + auto-rollback  
B) Rolling + CloudWatch Alarm  
C) Immutable or Blue-Green URL Swap  
D) Rolling with additional batch + DLM  

**Answer: C**

**Explanation:** Immutable keeps old ASG alive; instant traffic revert (~minutes). Blue-Green URL Swap reverts CNAME instantly (within DNS TTL). Both key: old version instances actually alive. All at once/Rolling: old instances already gone; rollback = redeploy (5-10m). Trap: Blue-Green enables instant routing change, not instant 100% traffic transition—some users may remain on new environment within DNS TTL.

---

**Question 3.** Created RDS within Beanstalk environment; terminating environment also deleted DB. How to prevent data loss?

A) Set RDS DeletionPolicy: Retain  
B) Separate RDS into external stack; inject endpoint/credentials via environment variables/Secrets Manager  
C) Enable RDS Multi-AZ  
D) Enable automated backups  

**Answer: B**

**Explanation:** Core principle: "decouple data lifecycle from environment lifecycle." Beanstalk-embedded RDS defaults to deletion-on-environment-termination; DeletionPolicy is CloudFormation option, not available via Beanstalk console. Multi-AZ/backups provide availability/recovery, not environment-termination protection (snapshots may also vanish per retention policy). Best practice: RDS stack → Beanstalk stack endpoint injection. Safer: Secrets Manager + IAM database authentication. AWS Well-Architected Reliability Pillar explicit requirement.

---

**Question 4.** Beanstalk Worker Tier message processing flow?

A) Lambda processes SQS trigger  
B) SQS Queue → SQS Daemon → local app HTTP POST → 200 auto-deletes message  
C) Kinesis Stream → KCL Worker  
D) SNS Subscription direct processing  

**Answer: B**

**Explanation:** Worker Tier uses SQS Daemon sidecar receiving messages, HTTP POST to local app (port 80). App returns 200 → DeleteMessage called; 4xx/5xx → visibility timeout → retry. Key advantage: no SQS SDK in app code—unified web handlers. Trap: "Lambda processes" frequently appears but Lambda is separate service. Beanstalk Worker remains daemon-based on EC2. `cron.yaml` enables periodic tasks.

---

**Question 5.** Execute database migration via `.ebextensions/*.config` once across all instances?

A) Add command simply to container_commands  
B) Add `leader_only: true` option to container_commands  
C) Use BeforeInstall hook  
D) Add to User Data  

**Answer: B**

**Explanation:** `container_commands` with `leader_only: true` executes once on ASG leader instance only. Standard pattern for migrations, seed data. Trap: "User Data" adds it—but User Data runs every instance, every time, causing N migrations → unique constraint errors or duplicate data. Migrating to Amazon Linux 2 Platform v3 requires moving from `container_commands` to `.platform/hooks/prebuild/` or `predeploy/`.

---

**Question 6.** After Beanstalk Blue-Green URL Swap, some users remain on old environment >5m. Most likely cause?

A) Beanstalk bug  
B) ALB Target Group configuration error  
C) Client or ISP DNS cache ignoring or extending CNAME TTL  
D) Insufficient IAM permissions  

**Answer: C**

**Explanation:** Beanstalk CNAME default TTL: 60s. ISPs/corporate resolvers violating RFC 2181, caching longer. Korean mobile carriers cached 5m; corporate DNS cached 30m reported. Solutions: ① Route 53 Alias Records (<60s capable), ② CloudFront origin + Origin Failover, ③ ALB Weighted Target Groups bypassing DNS. Trap: "Blue-Green = instant 100% switch." Routing intent instant; traffic arrival gradual.

---

**Question 7.** ASG-based Rolling deployment halted by repeated health check failures. Most likely cause and fix?

A) Beanstalk bug—redeploy  
B) Health Check Grace Period shorter than app warmup—extend Grace Period ≥600s  
C) ALB issue—switch to NLB  
D) Corrupted AMI—rebuild AMI  

**Answer: B**

**Explanation:** Classic Rolling trap. JVM apps (Spring Boot, Tomcat) need 60-90s cold start; large apps 2-3m. Beanstalk default 300s may be insufficient. Grace Period suspends ELB health checks; must accommodate warmup + margin. Additionally, ELB Health Check Path should be lightweight `/health`, not deep check querying DB (do deep checks asynchronously). Tests frequently combine Rolling with "capacity decrease + health checks."

