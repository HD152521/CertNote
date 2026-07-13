# Day 4 - OpsWorks EOL and Launch Template: Mixed Instances Policy's True Value

Operations automation history swings like pendulum. Initially SSH scripts, then Chef/Puppet, Docker rejected mutable config itself, Kubernetes brought back declarative. AWS followed. OpsWorks for Chef Automate (2017) and Puppet Enterprise once provided "AWS-managed Chef/Puppet," but **OpsWorks Stacks reached EOL May 26, 2024**, AWS recommending Systems Manager migration.

This article examines why OpsWorks ceded ground to SSM; Launch Configuration → Launch Template succession and fundamental differences; Mixed Instances Policy + Spot cost pattern. AWS Proton and Service Catalog position. Goal: trend awareness "why pendulum swung to SSM" rather than tool name memorization.

## Why OpsWorks Gave Ground to SSM

2013 OpsWorks launch: AWS infrastructure automation was CloudFormation alone. CloudFormation strong on provisioning (VPC/EC2/RDS), weak on "install/configure OS/app/middleware inside EC2." OpsWorks filled that gap—Chef recipe-based OS/app/middleware-config managed service.

Problem: post-2014 AWS deployed multiple tools same responsibility. Systems Manager Run Command (2015), State Manager (2017), Patch Manager (2017), Session Manager (2018) launched, all atop SSM Agent. SSM advantage: **language-agnostic + AWS-native + single agent all functions**. OpsWorks forced Chef DSL, required separate Chef/Puppet Server nodes; SSM needs only SSM Agent, no infra overhead.

| Item | OpsWorks Stacks | SSM (Run + State + Patch) |
|------|---|---|
| **Language** | Chef DSL (Ruby) | Bash/PowerShell/Python |
| **Agent** | Chef Client | SSM Agent (default AL2+) |
| **Extra Infrastructure** | Chef Server node | None |
| **AWS Integration** | Separate | Native (IAM, CloudWatch Logs, S3) |
| **Stateful Apply** | Chef Solo periodic | State Manager association |
| **On-Premises** | Possible (license) | Hybrid Activation |
| **Status** | 2024.5.26 EOL | Primary tool |

Core trend: "tool consolidation." Single EC2 running Chef + SSM + CloudWatch agents = high complexity. Converging to SSM agent alone simplifies debugging, security, updates.

> 💡 **Related Theory**: Same "sidecar proliferation" problem in distributed systems. Early Service Mesh: Envoy + Istio + Prometheus + Jaeger sidecar overhead exploded. Answer: eBPF-based unified data plane (Cilium, Pixie). AWS same answer: SSM Agent alone handles command execution, state management, patching, session access, inventory, vulnerability reporting.

> 🔍 **Deeper Dive**: SSM State Manager does exactly OpsWorks "Chef Solo periodic" model. Connect SSM Document (JSON/YAML) as "association" to EC2 group; SSM runs every 30min maintaining desired state. Document actions include `aws:runShellScript`, `aws:applyAnsiblePlaybooks`, `aws:applyChefRecipes`—existing Chef cookbook works in SSM Document. OpsWorks → SSM progressive migration enabled.

## OpsWorks Stacks EOL Signals

OpsWorks EOL ≠ simple discontinuation—**symbolizes mutable infrastructure paradigm retreat**. Chef/Puppet core: "converge existing server to desired state." New package needed? Modify cookbook, Chef Client applies change. Instance lives, transforms.

Immutable infrastructure (Day 3 Image Builder): opposite. Never modify instance; change needed → build new AMI, replace instance wholesale. Configuration drift impossible.

AWS migration paths reflect paradigm difference. Two options:

1. **Run Command + State Manager + Patch Manager**: maintain mutable infrastructure, tool-swap to SSM. Teams large Chef asset base select.
2. **EC2 Image Builder + Launch Template + ASG Instance Refresh**: convert immutable infrastructure. New instance replacement applies changes. Long-term recommended.

> 📚 **Case Study**: Slack ran tens-of-thousands EC2 via Chef since 2014; ~2020 switched Spotify Backstage + EC2 Image Builder-based immutable infrastructure. Post-report: "configuration drift incidents dropped 90%"; security patch time averaged 7 days → 1 day. Lyft, Pinterest, Airbnb followed.

## Launch Configuration vs Launch Template: Why LC Dead

Launch Configuration (2009 with ASG), Launch Template (November 2017). Similar job, LT solved almost LC's every weakness.

| Item | LC | LT |
|------|---|---|
| **Versioning** | ❌ (modify = new LC) | ✅ (v1, v2, v3, $Latest, $Default) |
| **Partial Edit** | ❌ | ✅ (change field = new version) |
| **ASG-Only** | ❌ (ASG exclusive) | ✅ (EC2 Fleet, Spot Fleet, run-instances) |
| **Mixed Instances** | ❌ | ✅ |
| **T2/T3 Unlimited** | ❌ | ✅ |
| **Placement Group** | ❌ | ✅ |
| **Tag Specification** | Limited | ✅ (instances, volumes) |
| **IMDS v2 Enforce** | ❌ | ✅ |
| **Post-2022 New Features** | ❌ (frozen) | ✅ |
| **AWS Recommendation** | Deprecated | Standard |

LC's fatal flaw: **no versioning**. Modify LC? Create new LC, reattach to ASG—"rollback to previous" basic operation hard. LT stores multiple versions in single LT, references via `$Latest`, `$Default` aliases making rollback natural.

**New feature support halt**: AWS effectively stopped LC development. All new features (IMDS v2 enforcement, capacity reservation priority, hibernation) added to LT only. LC usage accumulates feature debt.

> ⚠️ **Gotcha**: December 2022 post-AWS Console LC creation blocked; 2024 onward existing LC gradual deprecation in some regions. Exam scenario "modernize existing LC-based ASG" → "migrate to LT." AWS CLI `create-launch-template` + `update-auto-scaling-group --launch-template` enables.

## Mixed Instances Policy: Simultaneous Cost + Availability

Mixed Instances Policy allows **multiple instance types + On-demand/Spot mix** same ASG. Two core values.

**Cost Saving**: Spot to 90% discount vs On-demand. Workload partly Spot-shifting saves millions monthly.

**Availability Boost**: Single type dependency = scale-out fails when type unavailable. Multiple candidates: AWS fills from available.

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
      - InstanceType: m6a.large
  InstancesDistribution:
    OnDemandBaseCapacity: 2              # Always ≥2 On-demand
    OnDemandPercentageAboveBaseCapacity: 30   # Above: 30% On-demand, 70% Spot
    SpotAllocationStrategy: capacity-optimized
    SpotInstancePools: 4
```

`SpotAllocationStrategy` unexpectedly critical.

| Strategy | Behavior | Recommended |
|---|---|---|
| **capacity-optimized** | Launch from pool with most capacity—minimize interruption | Most workloads |
| **capacity-optimized-prioritized** | Above + Overrides priority | Prefer type |
| **price-capacity-optimized** | Price + capacity balance (2022+) | Cost optimization |
| **lowest-price** (legacy) | Cheapest N pools—high interruption risk | NOT recommended |

`capacity-optimized` or `price-capacity-optimized` nearly always correct. `lowest-price` concentrates demand on cheapest pool, exhausting capacity fast → Spot interruption spike.

> 📚 **Case Study**: Pinterest 2021 ML training workload lowest-price → capacity-optimized: Spot interruption rate 12% → 1.4%. Maintaining same cost savings, avg training completion 4h → 1.5h. Fewer interruptions = fewer restarts = cost vanishes. [Capacity-Optimized Allocation Strategy](https://aws.amazon.com/blogs/compute/introducing-the-capacity-optimized-allocation-strategy-for-amazon-ec2-spot-instances/) AWS official.

> 🔍 **Deeper Dive**: Spot 2-min warning exposed via IMDS `/latest/meta-data/spot/instance-action` too. Instance `curl http://169.254.169.254/latest/meta-data/spot/instance-action` 1s polling catches soonest. EventBridge ~10s delay; critical timing → IMDS polling faster. Netflix container scheduler detects via IMDS, pre-migrates Pod to different node.

## Auto Scaling Algorithms: 4 Policy Internal Operations

Auto Scaling 4 policies surface-similar; internals differ.

**Target Tracking** PID controller (industrial control system standard). Error (goal - current) → proportional/integral/derivative → capacity adjust. AWS auto-generates two Alarms (scale-out, scale-in). Simple, intuitive—90% default answer.

**Step Scaling** per-threshold capacity delta definition. Example: CPU 60% → +1, 80% → +3, 90% → +10. Traffic-spike workloads faster than Target Tracking.

**Simple Scaling** Step simplified (single threshold). cooldown prevents next scaling. legacy; Target/Step replacement.

**Predictive Scaling** ML model (2018+, AWS proprietary forecasting) learns 14-day history, predicts 48h capacity. Daily 02:00 UTC forecast recalc. Daily/weekly patterns (e.g., weekday 09:00 spike) powerful.

```bash
# Target Tracking (most common)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name cpu-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification":{"PredefinedMetricType":"ASGAverageCPUUtilization"},
    "TargetValue":50.0,
    "DisableScaleIn":false
  }'

# Predictive Scaling
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name predictive-cpu \
  --policy-type PredictiveScaling \
  --predictive-scaling-configuration '{
    "MetricSpecifications":[{
      "TargetValue":50,
      "PredefinedMetricPairSpecification":{"PredefinedMetricType":"ASGCPUUtilization"}
    }],
    "Mode":"ForecastAndScale",
    "SchedulingBufferTime":300
  }'
```

> 💡 **Related Theory**: Target Tracking PID 1890s+ industrial control standard. Auto cruise control, HVAC temperature, airplane autopilot all PID. AWS applied to cloud capacity; Kubernetes HPA adopts same. Control theory stability theorems justify cooldown period—too short: oscillation, too long: response delay.

> ⚠️ **Gotcha**: Predictive needs ≥24h (recommend 14d) metric history for meaningful forecast. New ASG immediate enable = first days reactive like Target Tracking. `Mode=ForecastOnly` predicts only, capacity unchanged—validates quality pre-change recommended.

## Warm Pool: Cold-Start Alternative

Warm Pool (2021) enables ASG pre-create stopped instances; scale-out boot-only-activate. Cold start (AMI fetch + cloud-init + app) 3-5m → 30-60s possible.

```bash
aws autoscaling put-warm-pool \
  --auto-scaling-group-name web-asg \
  --min-size 5 \
  --max-group-prepared-capacity 20 \
  --pool-state Stopped \
  --instance-reuse-policy 'ReuseOnScaleIn=true'
```

Stopped EC2 no compute billing, EBS only (GB·month), cost-effective. `pool-state: Running` faster boot but computes. Common compromise: `Stopped` + Lifecycle Hook pre-warm then stop.

`ReuseOnScaleIn=true` interesting. Scale-in returns instance to Warm Pool vs terminating. Next scale-out reuses faster. Disk state remains—app must idempotent.

## Lifecycle Hook: Graceful Shutdown Standard

ASG Lifecycle Hook grants external system intervention during instance start/stop. Active hook pauses instance `Pending:Wait` or `Terminating:Wait`, continues after `complete-lifecycle-action` API or timeout.

```bash
aws autoscaling put-lifecycle-hook \
  --auto-scaling-group-name web-asg \
  --lifecycle-hook-name terminate-graceful \
  --lifecycle-transition autoscaling:EC2_INSTANCE_TERMINATING \
  --heartbeat-timeout 300 \
  --default-result CONTINUE \
  --notification-target-arn arn:aws:sns:ap-northeast-2:123:terminate-topic \
  --role-arn arn:aws:iam::123:role/ASGNotificationRole
```

Common pattern:
1. ASG terminates instance
2. Lifecycle Hook SNS → Lambda
3. Lambda deregister ALB Target Group → block new requests
4. Lambda SSM Run Command graceful-shutdown signal
5. App complete in-flight, flush logs/metrics, sync local-cache cloud
6. Lambda `complete-lifecycle-action`
7. Or heartbeat-timeout (e.g., 5m) auto-proceeds

`default-result` `CONTINUE` vs `ABANDON` operational importance. `CONTINUE` timeout proceeds termination; `ABANDON` reverts instance to running. Choose based on graceful-shutdown timeout safety.

> 📚 **Case Study**: Datadog Agent leverages ASG Lifecycle Hook. Termination hook forces Agent metric flush before shutdown; without, recent 1m loses. AWS Well-Architected Operational Excellence specifies "Graceful instance termination."

## Proton vs Service Catalog: Two Self-Service Tool Position

AWS offers two in-house self-service (provisioning).

| Item | Service Catalog | AWS Proton |
|------|---|---|
| **Launch** | 2014 | 2020 |
| **Target** | IT users (includes developers) | Developers |
| **IaC Engine** | CloudFormation | CFN, Terraform |
| **CI/CD Integration** | None (separate) | Built-in (CodePipeline) |
| **Abstraction Unit** | Product (single stack) | Environment + Service |
| **Use Flow** | "Create VPC" infra requests | "Deploy microservice pipeline" |
| **Rollback** | Stack rollback | Version + auto rollout |

Service Catalog = **infrastructure request** tool. "Create standard VPC" self-service. Proton = **full-stack workflow** tool. Developer Git push → infra + build + deploy + monitor auto.

Proton abstraction core: **Environment Template** + **Service Template** separation.

- **Environment Template** (Platform Team writes): "Standard VPC + EKS + Aurora + monitoring" shared. Teams share once.
- **Service Template** (Platform Team): "Fargate + ALB + CodePipeline" per-service. Developer Git-link → instantiate.

Separation means "**Developer instantiates Service only, never Environment**." Non-standard infrastructure impossible—standardization enforced.

> 💡 **Related Theory**: Proton model = Spotify Backstage-created "Internal Developer Platform (IDP)" category AWS-native implementation. CNCF platform WG reference architecture nearly identical—Platform Engineer golden path; Developer self-service within. Humanitec, Backstage, Crossplane competitive.

## Summary

Three insights: First, OpsWorks EOL signals mutable → immutable + SSM consolidation paradigm shift final. Second, LC → LT: versioning, Mixed Instances, new feature support natural migration. Third, Mixed Instances Policy + capacity-optimized Spot nearly standard cost + availability pattern.

Next: SOA-C02 scenarios focus. Exam trade-off scenarios—Beanstalk, CodeDeploy, Image Builder, Launch Template, ASG judgment sense refined.

---

## 📝 Practice Questions

**Question 1.** OpsWorks Stacks years-long Chef-based ops; 2024 May EOL AWS notice. Recommended migration?

A) Continue OpsWorks  
B) SSM (Run Command one-time, State Manager persistent, Patch Manager, optionally `aws:applyChefRecipes` action cookbook reuse)  
C) Elastic Beanstalk  
D) ECS container  

**Answer: B**

---

**Question 2.** ASG always ≥2 On-demand, above: 30% + 70% Spot cost-saving. Setting?

A) Spot only  
B) Mixed Instances Policy + InstancesDistribution.OnDemandBaseCapacity=2 + OnDemandPercentageAboveBaseCapacity=30 + SpotAllocationStrategy=capacity-optimized  
C) Separate 2x ASG  
D) EC2 Fleet  

**Answer: B**

---

**Question 3.** Existing LC-based ASG; frequent future AMI updates expected. Recommended?

A) Modify LC  
B) New LC replace  
C) LT migration → versioning + SSM refs + Mixed Instances + new features → Instance Refresh progressive  
D) Recreate all instances  

**Answer: C**

---

**Question 4.** Spot 2-min pre-termination: ALB deregister, complete requests, backup logs. Standard?

A) Cron 5s check  
B) EventBridge (EC2 Spot interrupt) + Lambda ALB deregister + SSM graceful, or ASG Lifecycle Hook terminate  
C) CloudWatch Alarm  
D) IMDS polling  

**Answer: B**

---

**Question 5.** Platform team building IDP (Git push → auto infra + CI/CD). Best AWS?

A) Service Catalog (infra only, no CI/CD)  
B) AWS Proton (Environment + Service Template + CodePipeline integration)  
C) Beanstalk (single app PaaS)  
D) OpsWorks  

**Answer: B**

---

**Question 6.** Scale-out 3-5m cold start; cost-minimal 30-60s?

A) Always-large On-demand (cost spike)  
B) ASG Warm Pool — pre-created Stopped, boot-only on scale; no compute billing  
C) Lambda  
D) Predictive only  

**Answer: B**

---

**Question 7.** Workload daily/weekly pattern (e.g., weekday 09:00 spike). Best scaling?

A) Simple  
B) Step  
C) Target Tracking  
D) Predictive  

**Answer: D**

