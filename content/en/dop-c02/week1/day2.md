# Day 2 - Well-Architected Framework: Rereading It Through the Six Lenses of DevOps

Many people have seen the Well-Architected Framework once for the SAA exam, but viewed through Professional DevOps eyes it becomes an entirely different tool. Today's topic is how to use the 6 Pillars not as "items to memorize" but as "a thinking framework that instantly classifies any scenario."

The reason DOP-C02 scenario questions are hard is that 2-3 of the answer options all technically work. To find "**the most suitable one**" among them, you must first pin down which Pillar the scenario is asking about. This classification ability is precisely the passing threshold.

## The History of the W-AF — From Internal Document to Industry Standard

In 2012, AWS solutions architects began compiling "the same questions customers keep asking." Giving a different answer every time to "how should we design this well?" was inefficient, so they consolidated it into an internal best-practice document. It was published externally in 2015, the 5 Pillars were established in 2016, and Sustainability was added in 2021, completing the 6 Pillars. This evolution itself reflects shifting priorities in cloud design — at first only stability and performance mattered, Cost Optimization was strengthened as cost pressure arrived, and Sustainability entered with the ESG era.

What makes the W-AF special from a DevOps perspective is that **DevOps Guidance was published separately as one of the W-AF's lenses** (2023). In other words, AWS views "DevOps as a cross-cutting concern spanning every Pillar of the W-AF." It is not a matter of Operational Excellence alone.

> 💡 **Related theory**: The W-AF is close to a cloud version of ISO 9126 (the software quality model). ISO 9126 classified software quality along 6 axes — functionality, reliability, usability, efficiency, maintainability, portability — and the W-AF is its cloud version. It also interlocks with ITIL v4's "Service Value System" — ITIL's Continual Improvement principle is reflected in the W-AF's review cycle.

## Reinterpreting the 6 Pillars From a DevOps Perspective

### 1. Operational Excellence — The Home Turf of DevOps

"Run and monitor systems to deliver business value, and continually improve processes and procedures." This is almost identical to the definition of DevOps itself.

Key design principles:
- **Perform operations as code** (Pipeline-as-Code, IaC, Runbook as code)
- **Make frequent, small, reversible changes** (reducing DORA's Lead Time)
- **Refine operations procedures frequently** (game days, chaos engineering)
- **Anticipate failure** (Fault Injection Simulator, Chaos Monkey)
- **Learn from all operational failures** (Correction of Errors, blameless postmortem)

AWS tool mapping:
- **Prepare phase**: CloudFormation, CDK, AWS Config (compliance baseline)
- **Operate phase**: CloudWatch, X-Ray, ADOT, Systems Manager
- **Evolve phase**: AWS DevOps Guru, Compute Optimizer

> 🔍 **Going deeper**: "Operations as code" is not just IaC. It includes **Runbook as code** as well. An SSM Automation Document is defined in YAML/JSON and lives in git, so procedures a human would click through in the console are expressed as code. As a result, when the same incident recurs, the identical recovery procedure runs automatically. This is the decisive mechanism behind "MTTR from 1 hour → 5 minutes."

### 2. Security — The Starting Point of DevSecOps

Traditional security was "the security team inspects after deployment," but DevSecOps is "**shift left**" — pull security to the left of the pipeline (the development stage). SAST (static analysis) becomes a phase in CodeBuild, DAST (dynamic analysis) runs automatically in the staging environment, and container image scanning (ECR Scan, Inspector) runs at build time.

AWS tool mapping:
- **Identity & Access**: IAM, IAM Identity Center (formerly SSO), Permissions Boundary
- **Detective controls**: GuardDuty, Security Hub, Macie, CloudTrail
- **Infrastructure protection**: VPC, WAF, Shield, Network Firewall
- **Data protection**: KMS, ACM, Secrets Manager
- **Incident response**: Detective, Security Lake, IR Runbook

> 📚 **Case study**: The 2019 Capital One incident (data breach affecting 106 million customers) shows what happens when security's shift left is absent. A WAF with an SSRF vulnerability + IMDSv1 + overly broad IAM permissions combined to cause the incident — and every one of these elements could have been automatically detected in the CI/CD stage. AWS released IMDSv2 right after this incident and added automatic IMDSv1 detection rules to Inspector v2 (2021).

> 💡 **Related theory**: The 5 functions of the NIST CSF (Cybersecurity Framework) — Identify, Protect, Detect, Respond, Recover — map almost 1:1 to the best practices of the W-AF Security Pillar. DOP-C02 doesn't ask about NIST terminology directly, but classifications like "Detective control vs Preventive control" appear frequently.

### 3. Reliability — DR and Automatic Recovery

"Workload performs its intended function correctly and consistently when expected." The core is twofold — **prevent failures from happening** (prevention) and **recover automatically even when they do** (self-healing).

Key design principles:
- **Automatically recover from failure** (Auto Scaling, Lambda retry, Step Functions)
- **Test recovery procedures** (Resilience Hub, Fault Injection Simulator)
- **Scale horizontally** (not one giant instance — many small instances)
- **Stop guessing capacity** (Auto Scaling + predictive scaling)
- **Manage change in automation** (IaC + CI/CD)

AWS tool mapping:
- **Foundations**: Service Quotas, Trusted Advisor
- **Workload architecture**: Multi-AZ, Multi-Region (Aurora Global DB, DynamoDB Global Tables)
- **Change management**: the Code* series, CloudFormation drift
- **Failure management**: CloudWatch Alarms, SSM Automation, Route 53 health checks

> 🔍 **Going deeper**: AWS's Reliability philosophy is evolving toward "**cell-based architecture**." A region is divided into multiple independent cells, and a failure in one cell is isolated so it doesn't propagate to others. AWS has been applying this gradually internally since the 2017 S3 us-east-1 outage. It doesn't appear directly on the exam, but the same concept shows up under the keyword "minimizing blast radius."

### 4. Performance Efficiency

"Use computing resources efficiently to meet system requirements." The core is not simply "fast" but "**only as much as needed, efficiently**."

Key design principles:
- **Democratize advanced technologies** (delegate complexity to managed services)
- **Go global in minutes** (CloudFront, Global Accelerator)
- **Use serverless architectures** (remove operational burden with Lambda, Fargate, S3)
- **Experiment more often** (AppConfig feature flags, Evidently A/B tests)
- **Mechanical sympathy** (choose tools that fit workload characteristics — GPU, Graviton)

What matters from a DevOps perspective is "**experimentation infrastructure**." Define A/B tests as code with AWS Evidently, do gradual rollouts with AppConfig, and measure real-user performance with CloudWatch RUM.

> 💡 **Related theory**: "Mechanical sympathy" is a term coined by Martin Thompson in 2011, meaning "understand hardware characteristics and write code that fits them." On AWS, choosing an instance family per workload (C5: compute-intensive, R5: memory, M5: balanced, X1: in-memory DB) is exactly this concept. With the arrival of Graviton (ARM), the price-performance trade-off re-emerged.

### 5. Cost Optimization

"Run systems to deliver business value at the lowest price point." The part directly connected to DevOps is "**automated cost governance**."

Key design principles:
- **Implement cloud financial management** (FinOps, AWS Budgets)
- **Adopt a consumption model** (pay only for what you use)
- **Measure overall efficiency** (cost per transaction, not just total cost)
- **Stop spending money on undifferentiated heavy lifting** (prefer managed services)
- **Analyze and attribute expenditure** (Cost Allocation Tags, Cost Categories)

AWS tool mapping:
- **Awareness**: Cost Explorer, Budgets, AWS Cost Anomaly Detection
- **Optimization**: Compute Optimizer, Trusted Advisor, Savings Plans, Spot
- **Lifecycle**: S3 Intelligent-Tiering, Lifecycle Policy

> 🎯 **Scenario**: If a company presents a scenario like "an analytics workload used only at night," the answer lies on the Cost Optimization side. The pattern: ① switch EC2 → Spot instances ② turn it on only at night with Scheduled Scaling ③ move cold data S3 → IA/Glacier ④ eliminate idle cost with Lambda or Fargate.

### 6. Sustainability — Added in 2021

Minimizing carbon footprint. From a DevOps perspective:
- Region selection (regions with a high share of renewable energy — Stockholm, Dublin, Oregon)
- Workload efficiency (remove idle instances, use Spot/Graviton)
- Data lifecycle management (remove unnecessary logs and backups)

AWS has committed to 100% renewable energy by 2025 and net-zero carbon by 2040. Its direct weight on the exam is low, but options like "which region is the most eco-friendly" occasionally appear.

## Trade-offs Between the 6 Pillars — The Real Depth of the Exam

The truly hard part of the W-AF is that the 6 Pillars **conflict with each other**. Strengthening one weakens another.

| Conflict | Description | Example |
|------|------|------|
| Reliability ↔ Cost | Multi-AZ/Region increases stability but costs 2-3x | RDS Multi-AZ vs Single-AZ |
| Security ↔ Operational Excellence | Strong security makes automation harder | Cross-account automated deployment vs IAM separation |
| Performance ↔ Cost | High-performance instances are expensive | C5n vs C5 |
| Reliability ↔ Performance | Synchronous replication increases stability but also latency | RDS Multi-AZ sync replication |
| Sustainability ↔ Performance | Eco-friendly regions can be far from users | Stockholm region vs users in Seoul |

This trade-off is the essence of exam scenarios. For example, when "**RTO of 5 minutes AND cost minimization**" are demanded simultaneously, the Pilot Light DR pattern (minimal resources normally, rapid expansion during an incident) is the correct answer. Take either one to the extreme and you ruin both.

> ⚠️ **Pitfall**: If an option on the exam claims to be "**a solution that satisfies all Pillars simultaneously**," it's almost always a trap. No such thing exists in reality. Identify the priority stated in the scenario (e.g., "stability over cost") and pick the answer that matches that priority.

## DevOps Guidance — The W-AF Lens Published in 2023

In 2023, AWS published **DevOps Guidance** as one of the W-AF's lenses. It is not a new addition to the 6 Pillars, but guidance added from a DevOps perspective across all 6 Pillars.

The 4 areas of DevOps Guidance:
1. **Organizational Adoption** — team structure, responsibility sharing, cultural change
2. **Development Lifecycle** — Source, Build, Test, Release, Deploy
3. **Quality Assurance** — automated testing, observability, chaos engineering
4. **Automated Governance** — Policy as Code, AWS Config, Service Control Policy

The significance of this lens's appearance is large — AWS has officially acknowledged that "DevOps is a cross-cutting concern important enough to need its own lens within the W-AF." The DOP-C02 exam doesn't ask about this lens's content directly, but it underlies the background thinking of its scenarios.

> 📚 **Case study**: When a global fintech ran a self-assessment with the DevOps Guidance lens, its lowest score came in the "Organizational Adoption" area. All the tools were there (CodePipeline, X-Ray, GuardDuty), but team responsibilities weren't clear, so every incident wasted time on "whose turn is it to answer." The solution: unify SLO + Error Budget + Incident Manager runbooks. Six months later, MTTR dropped from 4 hours → 30 minutes.

## Trusted Advisor — The Tool for Automated W-AF Diagnosis

The tool that automatically diagnoses the 6 Pillars from the console is **Trusted Advisor**. Its 250+ checks are classified into 5 categories (Cost, Performance, Security, Fault Tolerance, Service Limits).

| Category | W-AF Pillar mapping | Example checks |
|----------|------------------|-----------|
| Cost Optimization | Cost Optimization | Unused EIPs, low-utilization EC2 |
| Performance | Performance Efficiency | High-CPU instances, EBS utilization |
| Security | Security | Root without MFA, 0.0.0.0/0 SGs |
| Fault Tolerance | Reliability | Single-AZ RDS, missing ASG |
| Service Limits | Reliability + Cost | Approaching API rate limits |

The full set of checks is enabled on Business/Enterprise Support plans; the Developer plan provides only the basic 7. Through EventBridge integration, check results can be wired into automation workflows (e.g., on discovering a 0.0.0.0/0 SG, send a Slack alert + auto-fix via Lambda).

> 🔍 **Going deeper**: AWS Trusted Advisor and AWS Config Rules look similar but differ. Trusted Advisor checks 250+ best practices defined by AWS; Config Rules check arbitrary rules defined by the customer. On the exam, if the keyword is "AWS-managed best practice check," it's Trusted Advisor; if it's "custom compliance rule," it's Config.

## The W-AF Tool — Automated Reviews

The AWS Well-Architected Tool in the console lets you register a workload, answer the 6 Pillars' questions, and get a risk score. It's also available via CLI:

```bash
# Create a workload
aws wellarchitected create-workload \
  --workload-name "prod-payment-api" \
  --description "Payment processing API" \
  --environment PRODUCTION \
  --aws-regions ap-northeast-2 us-east-1 \
  --lenses wellarchitected serverless devops

# Proceed with the review
aws wellarchitected list-answers \
  --workload-id $WORKLOAD_ID \
  --lens-alias wellarchitected

# Automation: extract the improvement plan
aws wellarchitected get-workload --workload-id $WORKLOAD_ID \
  | jq '.Workload.RiskCounts'
# Example output: {"UNANSWERED": 0, "HIGH": 3, "MEDIUM": 7, "NONE": 21, "NOT_APPLICABLE": 5}
```

Here the 3 HIGH risks are the priority. Clicking each HIGH in the AWS Console shows a concrete improvement plan (e.g., "Enable Multi-AZ for RDS").

## Wrapping Up — The 6-Pillar Mapping Method for Scenario Solving

When you receive a scenario in the exam room, classify it like this:

1. **Keyword scan**: "cost minimization" → Cost / "RTO/RPO" → Reliability / "latency" → Performance / "audit trail" → Security / "automation" → Operational Excellence / "carbon" → Sustainability
2. **Recognize the trade-off**: when two Pillars are mentioned together, confirm the priority
3. **Narrow down AWS tool candidates**: pick candidates from the per-Pillar tool map
4. **Compare the 2-3 remaining options**: choose the most suitable one from a trade-off perspective

Once these 4 steps become familiar, scenario questions become a simple pattern-recognition task.

In the next article, we lay out the full map of AWS's DevOps tools — the Code* series, CDK, SSM, CloudWatch, X-Ray, and more — at a glance, to get a feel for which tool is used where.

---

## 📝 연습 문제

**문제 1.** A company demands "guarantee user response times of 50ms or less, while simultaneously minimizing cost." Which is the most accurate analysis of the W-AF Pillar trade-off in this scenario?

A) A conflict between Performance and Security
B) A conflict between Performance and Cost Optimization — guaranteeing 50ms requires CloudFront/Global Accelerator, which incurs additional cost
C) A conflict between Reliability and Performance
D) A conflict between Sustainability and Cost

**정답: B**
해설: "Response time of 50ms" is a Performance Efficiency requirement; "cost minimization" is a Cost Optimization requirement. The two are a trade-off. Guaranteeing 50ms for global users requires CloudFront (edge caching) or Global Accelerator (Anycast), both of which incur additional cost. The compromise is usually "CloudFront only for users in key markets, direct origin access for other regions." If an option claims "a single solution that satisfies both simultaneously," it's a trap.

---

**문제 2.** Which is the most accurate difference between Trusted Advisor and AWS Config Rules?

A) Trusted Advisor is real-time, Config Rules are periodic
B) Trusted Advisor checks best practices defined by AWS; Config Rules check arbitrary compliance rules defined by the customer
C) Trusted Advisor is free, Config Rules are paid
D) They are the same tool under different names

**정답: B**
해설: The essential difference is "**who defines the rules**." Trusted Advisor checks AWS's own 250+ best practices (root without MFA, 0.0.0.0/0 SGs, etc.). Config Rules are defined by the customer for their own environment (e.g., "all EBS volumes must be KMS-encrypted," "all EC2 instances must carry the company prefix tag"). On the exam, "AWS-managed check" means Trusted Advisor; "custom compliance" means Config Rules. A is a wrong classification (both are periodic), and C is also not true (the full Trusted Advisor check set requires Business/Enterprise Support).

---

**문제 3.** Which of the W-AF's 6 Pillars explicitly lists "Make frequent, small, reversible changes" as a design principle?

A) Reliability
B) Security
C) Operational Excellence
D) Performance Efficiency

**정답: C**
해설: This principle is a design principle of Operational Excellence. It's exactly the same idea as DORA's "small batch size + fast lead time" — the insight that **the smaller the unit of change, the easier debugging and rollback are**. The AWS implementation is automation with CodePipeline + CodeDeploy and separating deployment from release with feature flags. Reliability's representative principle is "Automatically recover from failure," Security's is "Implement security at all layers," and Performance's is "Use serverless architectures."

---

**문제 4.** A company ran the W-AF Tool on its environment and got 5 HIGH risks and 12 MEDIUM risks. What is the most appropriate order of prioritization?

A) Handle all HIGH first, then handle MEDIUM
B) Among the HIGHs, Security-related ones first, then Reliability, then the rest
C) Start with the MEDIUMs that cost the least
D) Start with MEDIUM and work gradually up to HIGH

**정답: B**
해설: The W-AF only gives HIGH/MEDIUM/LOW scores, but **practical priority differs by Pillar**. A Security HIGH can lead to an immediate incident (exposed IAM, no MFA), a Reliability HIGH leads directly to business interruption (Single-AZ RDS, missing ASG), while a Cost HIGH is wasted money but not an immediate incident. AWS Well-Architected best practice guidance also recommends prioritizing Security/Reliability. C and D are wrong priorities; A looks right at first glance but ignores "prioritization within the HIGHs."

---

**문제 5.** Which is the most accurate description of the significance of the DevOps Guidance lens being added to the W-AF in 2023?

A) DevOps was merged into the Operational Excellence Pillar
B) DevOps became important enough as a cross-cutting concern spanning all 6 Pillars to need its own separate lens
C) A DevOps Pillar was newly added, making it 7 Pillars
D) DevOps is no longer a separate concept

**정답: B**
해설: DevOps Guidance is not a separate Pillar but a **lens**. A lens is additional guidance that reinterprets the W-AF's 6 Pillars from the perspective of a specific domain (Serverless, ML, DevOps, etc.). The DevOps lens applies cross-cutting across all 6 Pillars through 4 areas (Organizational Adoption, Development Lifecycle, QA, Automated Governance). C is factually wrong (still 6 Pillars), and A is also inaccurate (Operational Excellence still exists as is).

---

**문제 6.** A company operates a service for EU users where both GDPR compliance and response-time reduction matter. Which is the most suitable design?

A) Single deployment in us-east-1, accelerated with CloudFront
B) Deploy in eu-west-1 (Ireland) + CloudFront EU edge, with KMS keys also created in an EU region
C) Deploy in ap-northeast-2, then Global Accelerator
D) Deploy in sa-east-1

**정답: B**
해설: GDPR requires "EU citizens' data stored in the EU or in regions with an adequacy decision" (Security Pillar). For response time, place the origin in an EU region and accelerate with CloudFront EU edges (Performance Pillar). KMS keys must also be in an EU region to satisfy data sovereignty (Security). A stores data in the US, potentially violating GDPR; C is a non-EU region, violating GDPR; D is a South American region. Also, among EU regions, Dublin (eu-west-1) or Stockholm (eu-north-1, 100% renewable energy) satisfies Sustainability as well.

---

**문제 7.** Which AWS tool combination best fits the Cost Optimization Pillar's "Adopt a consumption model" principle?

A) Reserved Instances + Savings Plans
B) Lambda + Fargate Spot + S3 Intelligent-Tiering + Aurora Serverless v2
C) EC2 Dedicated Hosts + Provisioned IOPS EBS
D) Outposts + Snowball

**정답: B**
해설: "Consumption model" means **you incur cost only for what you use**. Lambda bills per execution time, Fargate Spot per container run time, S3 Intelligent-Tiering moves objects between tiers automatically, and Aurora Serverless v2 auto-scales in ACU (Aurora Capacity Unit) increments. All of them have near-zero idle cost. A is commitment-based (not consumption), C is dedicated resources, D is on-premises hardware cost. On the exam, the key phrase is "pay-only-for-what-you-use."
