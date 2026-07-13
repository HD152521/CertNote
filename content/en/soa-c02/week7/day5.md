# Day 5 - Week 7 Comprehensive Review: Scenario-Based Deployment and Provisioning Decision-Making

Week 7 examined "how to deploy safely" from five perspectives. Beanstalk's PaaS trade-offs, CodeDeploy's narrow responsibility (code only), EC2 Image Builder's immutable infrastructure enforcement, the OpsWorks-to-SSM paradigm shift, and Launch Template + Mixed Instances Policy balancing cost and availability. Though each section covered different tools, they share one fundamental question: **"What trade-off is right for this workload?"**

This section brings together the five core decision axes from the previous sections and presents 12 problem scenarios showing how SOA-C02 actually tests this material. The goal is not to memorize tables but to develop the decision-making intuition that determines "why A is correct and B is a trap." By reviewing this once more before the exam, the answers will naturally come to mind.

## Five Decision Axes from Week 7, Reconsidered

All tools covered this week reduce to five decision axes:

| Decision Axis | Question | Week 7 Tool Mapping |
|---------|------|------------------|
| **Downtime allowed?** | Must it be zero, or is a few minutes acceptable? | All at once vs Rolling vs Immutable |
| **Temporary capacity cost?** | Is 2x acceptable, or minimize overhead? | Rolling vs Immutable vs Blue-Green |
| **Rollback speed?** | Immediate vs redeployment time | Immutable/Blue-Green vs Rolling |
| **Infrastructure ownership** | Auto-provisioned vs existing resources | Beanstalk vs CodeDeploy vs CloudFormation |
| **Change scope** | Code only vs entire environment vs AMI | CodeDeploy vs Beanstalk vs Image Builder |

With these 5 axes, you can decompose almost any scenario automatically. For example, "zero-downtime + minimal cost + existing EC2 infrastructure" initially seems ambiguous (CodeDeploy + Blue-Green vs Beanstalk + Rolling with batch?), but the "existing infrastructure" clue points clearly to CodeDeploy.

> 💡 **Related Theory**: This decision-axis approach mirrors the Architecture Decision Record (ADR) standard template. Michael Nygard's 2011 ADR format follows Context → Decision → Consequences, explicitly documenting trade-offs for each decision. Practicing scenario decomposition like an ADR is a core cloud architect thought pattern for both exams and real-world work.

## Beanstalk vs CodeDeploy vs CloudFormation: Responsibility Boundaries Clarified

| Decision Criteria | Beanstalk | CodeDeploy | CloudFormation |
|----------|-----------|------------|----------------|
| **Infrastructure creation** | Automatic (EC2/ALB/RDS) | External (user responsibility) | Automatic (all resources) |
| **Code deployment** | Integrated | Core function | Separate (custom resource) |
| **Rollback scope** | Entire environment | Revision | Entire stack |
| **Deployment hooks** | .ebextensions, .platform | AppSpec hooks (13 steps) | UpdatePolicy + WaitCondition |
| **Language awareness** | Yes (Node/Python/Java/...) | No (language-agnostic) | No (language-agnostic) |
| **Use case** | Simple web app PaaS | Existing EC2/Lambda/ECS fleet | Complete IaC |

In production, you combine all three. CloudFormation provisions VPC/ALB/ASG infrastructure, CodeDeploy handles code on top of it, and Beanstalk is reserved for small workloads where you want infrastructure bundled with the application. Image Builder creates the AMI for the ASG.

## Five Beanstalk Deployment Policies Reconsidered

| Policy | Downtime | Temp Capacity | Temp Cost | Rollback Speed | Recommended Use |
|------|----------|-----------|-----------|-----------|----------|
| **All at once** | **Present** | 0% (full stop) | None | Redeploy required | dev/staging |
| **Rolling** | None | Temporarily **reduced** | None | Redeploy required | Production without traffic spikes |
| **Rolling with batch** | None | Maintained | Batch-only | Redeploy required | Balanced production |
| **Immutable** | None | Maintained | **2x** | Fast (old ASG survives) | Production where stability is critical |
| **Blue-Green (URL Swap)** | None | Maintained | **2x** | Immediate (CNAME switch) | Instant rollback required |

Critical trap: "Blue-Green = instant 100% switchover" is incorrect. CNAME switch is instant, but DNS TTL means some users stay on the old environment during the window. Beanstalk's default CNAME TTL is 60 seconds, but some ISPs and internal DNS servers cache longer, so actual 100% switchover can take 5-30 minutes.

## CodeDeploy Core Summary

EC2 hook sequence:
```
ApplicationStop → DownloadBundle(auto) → BeforeInstall → Install(auto) → 
AfterInstall → ApplicationStart → ValidateService
[Blue-Green only]
→ BeforeBlockTraffic → BlockTraffic(auto) → AfterBlockTraffic →
  BeforeAllowTraffic → AllowTraffic(auto) → AfterAllowTraffic
```

Deployment methods by compute platform:
- **EC2**: In-place or Blue-Green (ALB Target Group switch)
- **Lambda**: Alias weight gradual adjustment (Canary, Linear, AllAtOnce)
- **ECS**: Blue-Green (two Target Groups + Production Listener + Test Listener)

Two auto-rollback triggers:
- **DEPLOYMENT_FAILURE**: Hook failure/timeout (immediate detection)
- **DEPLOYMENT_STOP_ON_ALARM**: CloudWatch Alarm occurrence (minimum 1-3 minute delay)

## Image Builder + Golden AMI + SSM Parameter Pattern

```
[Image Builder Pipeline] (monthly cron)
        ↓
   Create new AMI
        ↓ (EventBridge)
[Lambda] → Update SSM Parameter
        /golden-ami/al2/latest = ami-XXXX
        ↓
[Launch Template]
   ImageId: '{{resolve:ssm:/golden-ami/al2/latest}}'
        ↓
[Auto Scaling Group]
   Next Instance Refresh or scale-out uses new AMI
```

The elegance of this pattern: **reference indirection**. If the Launch Template refers to an AMI via SSM Parameter instead of directly, you don't need to create a new Launch Template version each time the AMI changes. Just update the SSM Parameter; the next instance creation automatically uses the new AMI.

## Launch Configuration → Launch Template Migration

| Item | LC (deprecated) | LT (standard) |
|------|-----------------|-----------|
| Version management | None | $Latest, $Default, etc. aliases |
| Partial updates | Impossible (recreate) | Possible |
| Mixed Instances | Not supported | Supported |
| SSM Parameter reference | Not supported | Supported (`{{resolve:ssm:...}}`) |
| New EC2 features | Unsupported (frozen) | Supported |
| New console creation | Impossible after 2022.12 | Standard |

## Mixed Instances Policy + Spot Strategy

```yaml
MixedInstancesPolicy:
  LaunchTemplate:
    LaunchTemplateSpecification:
      LaunchTemplateName: web-lt
      Version: $Latest
    Overrides:
      - InstanceType: m5.large
      - InstanceType: m5a.large
      - InstanceType: m6i.large
  InstancesDistribution:
    OnDemandBaseCapacity: 2           # Minimum on-demand guaranteed
    OnDemandPercentageAboveBaseCapacity: 30
    SpotAllocationStrategy: capacity-optimized   # or price-capacity-optimized
```

Spot Allocation Strategy priority:
1. **capacity-optimized** — Minimizes interruption risk (most workloads)
2. **price-capacity-optimized** — Cost + capacity balance (added 2022)
3. ~~lowest-price~~ — High interruption risk (not recommended)

Spot interruption graceful shutdown:
- EventBridge Rule (`EC2 Spot Instance Interruption Warning`) → Lambda → ALB deregister + SSM Run Command for graceful shutdown signal
- Or ASG Lifecycle Hook to buy time before termination
- IMDS `/latest/meta-data/spot/instance-action` detects faster (~10 seconds) than EventBridge

## OpsWorks → SSM Migration

OpsWorks Stacks EOL: May 26, 2024. AWS-recommended migration:
- **Run Command**: One-off command execution
- **State Manager**: Periodic desired state application (replaces Chef Solo)
- **Patch Manager**: Automated patching
- **SSM Document `aws:applyChefRecipes` action**: Reuse existing Chef cookbooks

Long-term, Image Builder-based immutable infrastructure is the recommended path.

## Proton vs Service Catalog Positioning

| Item | Service Catalog | AWS Proton |
|------|-----------------|------------|
| Target audience | IT users (general infra requests) | Developers (entire service workflow) |
| IaC | CloudFormation | CloudFormation, Terraform |
| CI/CD integration | None (separate) | Built-in (CodePipeline) |
| Abstraction | Product (single stack) | Environment + Service (separated) |
| Use case | "Create one VPC for me" | "Git push my microservice → infra + CI/CD auto-provisioned" |

> 💡 **Related Theory**: Proton is AWS's native implementation of Spotify's Backstage "Internal Developer Platform (IDP)" concept. It aligns with CNCF Platform Working Group reference architecture — Platform Engineers define the golden path, Developers self-serve within it.

---

## 📝 12 Scenario Practice Problems

**Problem 1.** You need production deployment with zero downtime, maintaining capacity, and minimizing additional cost. Which Beanstalk deployment policy is best?

A) All at once
B) Rolling
C) Rolling with additional batch
D) Immutable

**Answer: C**
Explanation: Decomposing four axes — no downtime (A fails), maintained capacity (B decreases temporarily, fails), minimal cost (D costs 2x, fails). Rolling with additional batch replaces instances in batches while maintaining capacity; extra cost is only for the batch-sized temporary instances. Trap: if "traffic spike expected" is added to the scenario, the answer becomes Immutable (Rolling derivatives risk health check failures under load).

---

**Problem 2.** You want to route 10% traffic to a new Lambda version for 5 minutes of validation, then 100% switchover. Operations team demands automatic validation and rollback. Best approach?

A) Lambda environment variable ACTIVE_VERSION flag with code branching + manual value change after 5 minutes + CloudWatch metric visual inspection
B) CodeDeploy Lambda + Deployment Config `CodeDeployDefault.LambdaCanary10Percent5Minutes` + BeforeAllowTraffic/AfterAllowTraffic Hooks + CloudWatch Alarm-based auto-rollback
C) API Gateway Stage variable pointing to lambdaAlias with Canary deployment + 10% traffic for 5 minutes + promote
D) ASG Lifecycle Hook keeping new instances pending + 10% weight validation + InService transition

**Answer: B**
Explanation: CodeDeploy has exactly this Lambda Canary Config. Alias weight automatically adjusts V1:90%/V2:10% → V2:100% after 5 minutes. BeforeAllowTraffic Lambda hook performs pre-validation before accepting traffic; AfterAllowTraffic does post-validation. CloudWatch Alarm attached to Deployment Group auto-rolls back on alarm. Trap: confuse Canary (fixed ratio → 100%, two-stage) with Linear (multi-stage gradual increase).

---

**Problem 3.** In AppSpec.yml, which hook runs right after new version files are copied to the destination directory, where you set permissions, create symlinks, and substitute environment-specific config?

A) BeforeInstall
B) AfterInstall
C) ApplicationStart
D) ValidateService

**Answer: B**
Explanation: Hook sequence: ApplicationStop → DownloadBundle(auto) → BeforeInstall → Install(auto) → AfterInstall → ApplicationStart → ValidateService. AfterInstall runs exactly after files are copied. BeforeInstall runs before — backup, install system packages. This separation exists because "tasks without files" and "tasks requiring files" are fundamentally different.

---

**Problem 4.** Company wants to build a new Golden AMI monthly; new ASG instances should auto-use it without manual intervention. What's the AWS-recommended standard pattern?

A) Operations team manually creates AMI monthly and updates Launch Template ImageId directly + publish new version + update ASG Default version in a documented runbook
B) Image Builder Pipeline cron creates new AMI → EventBridge + Lambda updates SSM Parameter Store → Launch Template ImageId references `{{resolve:ssm:/golden-ami/al2/latest}}` → Instance Refresh or natural replacement applies it
C) CloudFormation StackSet recreates entire ASG monthly + ChangeSet injects new AMI ID + simultaneous rollout across regions
D) Lambda runs `yum update` via SSM Run Command on all live instances for in-place package update

**Answer: B**
Explanation: Golden AMI standard: Image Builder + SSM Parameter + Launch Template indirect reference. No need for new Launch Template version when AMI changes; just update the SSM Parameter. Next instance automatically uses the new AMI. Trap: D is mutable infrastructure anti-pattern (configuration drift accumulates); C is over-engineering.

---

**Problem 5.** Beanstalk environment termination deleted the embedded RDS database and caused data loss. How to prevent this?

A) Add DeletionPolicy: Retain to RDS in `.ebextensions` so the DB survives environment termination (actually, Beanstalk-managed resources can't be controlled this way from console)
B) Separate RDS to its own external CloudFormation/Terraform Stack; inject endpoint and credentials via Beanstalk environment variables or Secrets Manager
C) Enable RDS Multi-AZ to place standby replica in another AZ with auto-failover for availability
D) Extend RDS automated backup retention to 35 days and daily copy snapshots to another account

**Answer: B**
Explanation: Core principle: "data lifecycle and compute lifecycle must be separated" (AWS Well-Architected Reliability Pillar). Beanstalk-embedded RDS defaults to delete-on-environment-termination; DeletionPolicy is CloudFormation-level, not controllable from Beanstalk console. Multi-AZ/backups address availability/recovery, not environment-termination protection (backup retention policies also follow environment deletion).

---

**Problem 6.** Auto Scaling Group needs minimum 2 on-demand instances guaranteed, above that 30% on-demand + 70% Spot for cost reduction, and minimize Spot interruptions.

A) Define Spot Fleet directly with target capacity and on-demand base + diversified allocation for pool spread + separate Lambda for desired capacity scaling
B) Mixed Instances Policy + InstancesDistribution.OnDemandBaseCapacity=2 + OnDemandPercentageAboveBaseCapacity=30 + SpotAllocationStrategy=capacity-optimized
C) Separate on-demand ASG and Spot-only ASG, attach to same Target Group, manually adjust desired capacity 2:5 ratio
D) Single EC2 Fleet API call with type=instant mode to provision 2 on-demand + Spot instances at once

**Answer: B**
Explanation: Mixed Instances Policy's InstancesDistribution is exactly for this trade-off. OnDemandBaseCapacity guarantees 2 + OnDemandPercentageAboveBaseCapacity sets ratio (30%) + SpotAllocationStrategy=capacity-optimized launches from the pool with highest current capacity (minimizes interruption). lowest-price clusters on cheapest pool, spiking interruption — not recommended. Multiple instance types in Overrides (m5, m5a, m6i) enhance availability.

---

**Problem 7.** CodeDeploy deployment should auto-rollback to previous version if CloudWatch HighErrorRate Alarm triggers. Configuration?

A) CloudWatch Events rule captures HighErrorRate Alarm state change → triggers Lambda → Lambda calls StopDeployment + CreateDeployment with prior revision for manual rollback
B) Deployment Group's auto-rollback-configuration includes `DEPLOYMENT_STOP_ON_ALARM` events + alarm-configuration registers the Alarm + ignorePollAlarmFailure=false ensures safe conservative behavior
C) CloudWatch Synthetics Canary monitors endpoint every minute, fails trigger Alarm → SNS notifies operations for manual intervention
D) IAM identity-based policy conditions deny deploy action when error rate is high

**Answer: B**
Explanation: CodeDeploy native feature. AutoRollbackConfiguration.events: `DEPLOYMENT_FAILURE` (hook failure), `DEPLOYMENT_STOP_ON_ALARM` (external alarm), `DEPLOYMENT_STOP_ON_REQUEST` (manual). AlarmConfiguration registers Alarm ARNs. ignorePollAlarmFailure=false means safe abort if CloudWatch temporarily unavailable. Trap: Alarm-based rollback has 3+ minute minimum delay (metric evaluation × 3 datapoints), so it's a safety net, not first line of defense.

---

**Problem 8.** Automate graceful shutdown (ALB Target Group deregister, complete pending requests, backup logs) 2 minutes before Spot instance interruption.

A) Instance internal Cron polls Spot status API every 5 seconds, detects imminent interruption, executes ALB deregister + log backup script
B) EventBridge Rule (source=aws.ec2, detail-type="EC2 Spot Instance Interruption Warning") → Lambda or ASG Lifecycle Hook → ALB deregister + SSM Run Command for graceful signal. For faster detection, instance can additionally poll IMDS `/latest/meta-data/spot/instance-action`
C) CloudWatch Alarm on instance CPU/network metric → threshold breach triggers SNS → Lambda for graceful shutdown
D) Instance daemon only polls IMDS `/latest/meta-data/spot/instance-action`, executes shutdown on non-404 response

**Answer: B**
Explanation: Standard: EventBridge + Lambda or ASG Lifecycle Hook. EventBridge delivers notification ~10 seconds after warning (usually sufficient). Critical timing? Instance IMDS polling is faster. ASG + Mixed Instances + Lifecycle Hook provides consistent handling. Trap: 5-second Cron polling risks IMDS rate limit and cost waste.

---

**Problem 9.** OpsWorks Stacks reaches EOL May 26, 2024. Migrate existing Chef cookbook assets to AWS with minimal infrastructure management burden.

A) Keep OpsWorks Stacks running post-EOL with unchanged Chef cookbooks (accepting lost AWS support)
B) Migrate to AWS Systems Manager — Run Command (one-off), State Manager (periodic desired state, replaces Chef Solo), Patch Manager (automated patching). Reuse existing cookbooks via SSM Document's `aws:applyChefRecipes` action. Long-term: transition to Image Builder immutable infrastructure
C) Move to Elastic Beanstalk, port Chef cookbooks to `.ebextensions`/`.platform` hooks, manage whole environment as PaaS
D) Rewrite cookbook provisioning logic as Lambda functions, execute periodically via EventBridge schedule for desired state

**Answer: B**
Explanation: AWS official migration path. SSM replaces all OpsWorks features minus Chef Server infrastructure — only requires SSM Agent. Existing Chef cookbooks immediately reusable via `aws:applyChefRecipes` SSM Document action — allows gradual migration. Long-term immutable infrastructure (Image Builder + ASG) is recommended path. OpsWorks for Chef Automate still available (managed service with cost, not EOL).

---

**Problem 10.** Platform Engineering team building IDP where developers Git push and automatically get standard Fargate Service + ALB + RDS + CodePipeline provisioned. Best AWS-native tool?

A) Service Catalog defines Portfolio and Products (CloudFormation stacks) for developer self-service. Provides standardized provisioning but lacks Git push triggering and CodePipeline integration; separate configuration needed
B) AWS Proton — Environment Template (shared infra) + Service Template (service-level + CodePipeline integration) + CFN/Terraform support
C) Elastic Beanstalk deploys services as environments with ALB/RDS via `.ebextensions`. Single-app PaaS abstraction, not suited for Platform team providing golden path template reuse across services
D) OpsWorks Stacks with Chef layers for service composition. Chef configuration management tool, not Git push self-service IDP, and 2024.5.26 EOL

**Answer: B**
Explanation: Proton is exactly for Internal Developer Platform / Platform Engineering model. Platform team authors Environment Template + Service Template; developers instantiate Service → CodePipeline auto-integrated. CodePipeline integration is the key differentiator — Service Catalog only provisions, doesn't orchestrate CI/CD. Think Spotify Backstage in AWS-native form.

---

**Problem 11.** Apply new Launch Template version (new Golden AMI reference) to running ASG, safely gradually replace all instances, auto-rollback if CloudWatch Alarm triggers mid-process.

A) Set desired-capacity to 0, terminate all old instances, scale back to original count for bulk recreation
B) EC2 Auto Scaling Instance Refresh — Rolling strategy + MinHealthyPercentage=90 + CheckpointPercentages=[20,50,100] + CheckpointDelay=600 + CloudWatch Alarm integration for auto-rollback
C) CloudFormation stack UpdatePolicy: AutoScalingRollingUpdate, redeploy entire stack to replace instances
D) CodeDeploy In-place deployment to push new AMI-based application bundle to existing instances sequentially + ALB health checks for validation

**Answer: B**
Explanation: Instance Refresh exact use case. CheckpointPercentages enables canary-like deployment within one ASG (20% wait → 50% wait → 100%). MinHealthyPercentage ensures availability. Auto-rollback integrates CloudWatch Alarms to roll back Launch Template version on metric anomaly. Trap: Without Instance Refresh, Launch Template change alone still causes eventual replacement but isn't forced. desired-capacity = 0 causes downtime.

---

**Problem 12.** ASG scale-out cold start (AMI fetch + cloud-init + app startup) takes 3-5 minutes; too slow for traffic spikes. Reduce to 30-60 seconds without major cost increase. Also, predictable patterns (weekday 09:00 spikes) need additional policy.

A) Raise min capacity to peak level, always maintain on-demand instances ready (extra idle compute costs spike dramatically)
B) Enable ASG Warm Pool (instances pre-created in Stopped state; scale-out only requires boot) + add Predictive Scaling for pattern-based pre-provisioning. Stopped instances incur no compute charges, only EBS, so cost-efficient
C) Rewrite workload as Lambda with provisioned concurrency for instant invocation (cold start eliminated by serverless model)
D) Apply Predictive Scaling only (14-day learning + 48-hour forecast); doesn't directly address boot time reduction

**Answer: B**
Explanation: Warm Pool (launched 2021) is the cold-start standard. Pre-created instances complete AMI fetch + cloud-init in Stopped state; boot is 30-60 seconds. Stopped = no compute charges, only EBS (GB/month) — cost-efficient. Predictive Scaling (ML 14-day learning + 48h forecast) handles patterns; combine with Warm Pool for optimal — Predictive pre-reserves capacity + Warm Pool speeds boot. Unexpected spikes get Target Tracking as fallback.

---

## Closing Thoughts

Week 7 covered five seemingly different tools (Beanstalk, CodeDeploy, Image Builder, OpsWorks/SSM, Launch Template/ASG), but the core question remained constant: trade-offs across five axes. Downtime tolerance, temporary capacity cost, rollback speed, infrastructure ownership model, and change scope. Exam scenarios test these axes. Developing fast decomposition intuition — "which axis is decisive in this scenario?" — is stronger than memorizing tool names and hook sequences for both exams and real-world architecture.

Next week (Week 8) transitions to networking operations: VPC troubleshooting, Flow Logs, VPC Endpoints, Transit Gateway — 18% of the CloudOps exam domain. Deployment automation was "how to safely push code;" networking is "how to safely flow traffic."

---

## 🔮 Next Week Preview (Week 8 - VPC Networking Operations)

- **Day 1**: VPC fundamentals — subnets, route tables, NACL vs Security Group core differences, IPv6 dual-stack
- **Day 2**: VPC Flow Logs analysis, Traffic Mirroring, Reachability Analyzer for routing validation
- **Day 3**: NAT Gateway, VPC Endpoint (Interface/Gateway), PrivateLink for secure inter-service communication
- **Day 4**: Transit Gateway hub-spoke, Site-to-Site VPN, Direct Connect, Route 53 operations (Latency/Geolocation/Weighted routing)
- **Day 5**: Week 8 review + 12 scenario problems

> 💡 Networking troubleshooting is the trickiest CloudOps domain. NACL vs SG stateless/stateful distinction, VPC Endpoint policies, Transit Gateway route precedence are high-frequency test topics.
