# Day 5 - Week 1 Wrap-Up: Cementing the DevOps Thinking Frame with Scenarios

Week 1 was the week of abstractions. The five axes of CALMS, the four DORA metrics, the six pillars of Well-Architected, the AWS DevOps tool map, and multi-account governance. Taken separately, each is a massive book of its own, but within DOP-C02 scenarios, two or three of them always show up bundled together. Accelerating from "one deployment per quarter → one per day" is not solved by just installing Automation tooling — blast radius, account separation, signature verification, rollback automation, and observability all get pulled up along with it.

Today we cement that bundled problem-solving with 12 scenarios. Each question was built by weaving together two or three concepts from Days 1-4, and the explanations are written assuming you'll face exactly the same form of question in the exam room. In the end, what Week 1 wants to teach is one sentence: "**DevOps is a system for flowing code quickly and safely**, and AWS's tools, account structures, and metrics are the parts for translating that system into code."

## One-Page Compact — Week 1 Essentials

### CALMS 5-Axis Diagnostic Table (the weakest axis is your next priority)

| Axis | Diagnostic question | Symptoms when weak | Top-priority AWS tools |
|----|----------|-------------------|----------------|
| **C**ulture | Who gets blamed during incidents? | Incident cover-ups, repeated identical incidents | Blameless COE, Incident Manager, Chatbot |
| **A**utomation | How many manual steps remain? | Frequency stagnation, MTTR explosion, human error | CodePipeline + CodeBuild + CodeDeploy + SSM Automation |
| **L**ean | How many days until PR merge? | WIP accumulation, runaway lead time | Trunk-based dev, AppConfig feature flags |
| **M**easurement | How do you know a change's effect? | "Gut feel" decisions, KPI gaming | CloudWatch Metrics + EMF + DORA dashboard |
| **S**haring | Do one team's insights flow onward? | Same mistakes recur in other teams | Service Catalog, Proton, Wiki |

### DORA 4 Metrics → Prescription Mapping

| Metric | Signal of weakness | First-line prescription (AWS) |
|------|------------|---------------|
| Deployment Frequency ↓ | Once per quarter, once per month | CodePipeline automation + small batches + AppConfig flags |
| Lead Time ↑ | Commit→prod 2 weeks+ | Remove Manual Approval + CodeBuild cache + monorepo split |
| Change Failure Rate ↑ | 30%+ incident rate | Canary + CloudWatch alarm auto-rollback + pre-deploy hooks |
| MTTR ↑ | Days after an incident | EventBridge → SSM Runbook + Incident Manager |

### W-AF 6 Pillars → Scenario Keywords

| Pillar | Scenario keywords | DevOps perspective |
|--------|----------------|------------|
| Operational Excellence | "automation," "observability," "runbooks" | CALMS's A + M |
| Security | "least privilege," "shift-left," "auditing" | DevSecOps |
| Reliability | "RTO/RPO," "Multi-AZ/Region," "self-healing" | Auto-rollback + chaos |
| Performance | "latency," "throughput" | Profiler, instance types |
| Cost | "waste," "budget," "Spot" | Right-sizing, autoscale |
| Sustainability | "carbon," "renewable energy" | Region selection, ARM/Graviton |

### Standard Multi-Account Structure

- **OUs**: Security / Infrastructure / Workloads(Prod/Non-Prod) / Sandbox
- **The 3 standard accounts**: Management (billing+SCP), Log Archive (immutable), Audit (SecurityHub/GuardDuty aggregation)
- **SCP**: deny-only guardrail (not a permission grant). Applies even to root. Excluding global services via `NotAction` is mandatory.
- **Cross-account**: STS AssumeRole + ExternalId / resource policies / RAM
- **CI/CD**: Shared Services (Hub) → environment account (Spoke) deployment via AssumeRole

## The 4-Step Flow for Solving Week 1 Scenarios

In the exam room, consciously walk through these four steps.

1. **Classify the W-AF Pillar**: "Which pillar is this scenario asking about?" (Reliability? Cost? Security?)
2. **Diagnose with CALMS/DORA**: Which axis is weak and which metric is broken?
3. **Shortlist AWS tool candidates**: 3-4 candidates from the per-domain tool map
4. **Pick the single answer via trade-offs**: priorities, blast radius, cost, operational burden

> 🎯 **Scenario**: A report comes in that "there are so many Slack alerts they're being ignored." What is the problem? Not the tooling — it's **a broken Measurement definition**. Making every metric an alert without SLOs/SLIs produced alert fatigue. The answer is not adding tools but defining SLOs + reducing noise with Composite Alarms + Error Budget-based classification. A case where CALMS's M axis was quantitatively satisfied but qualitatively collapsed.

---

## 📝 종합 시나리오 12개

**문제 1.** A large fintech is pushing to accelerate from "one deployment per quarter → one per week." Current state: dev/staging/prod separated only by VPC in a single AWS account, humans deploying directly from the console with no CodePipeline, and an average of 8 hours to recover when incidents occur. Which CALMS diagnosis + prioritized prescription is most appropriate?

A) Lean axis weak → consolidate into a monorepo to reduce PR merge lead time; transitioning to trunk-based dev is the top priority
B) Automation axis weak → adopting the three Code* services (Pipeline+Build+Deploy) is the top priority, followed by multi-account separation → Measurement (CloudWatch)
C) Sharing weak → first build a cross-team knowledge-sharing system with a Confluence wiki + Service Catalog
D) Culture weak → bringing in external consulting to adopt a blameless postmortem culture is the fundamental cure for the 8-hour MTTR

**정답: B**
해설: The weakest axis drags down everything else. Manual console deployment = absence of Automation. Without Automation, Lean (small batches), MTTR reduction, and data collection are all blocked. Priority number one is CodePipeline + CodeBuild + CodeDeploy. **However, running everything up to prod in a single account is itself a blast radius risk**, so in the same phase you must separate with Organizations + account-per-stage (so an explosion in one account doesn't spread to other environments). Then CloudWatch measurement, then AppConfig flags. This ordering is the exam's priority pattern.

---

**문제 2.** A company deploys identical workloads to us-east-1 and eu-west-1. Its users are global and GDPR compliance is mandatory. Operating in a single account, it is highly concerned about blast radius during incidents. After adopting Organizations, which OU structure is most appropriate?

A) Region-based OUs (split into a us-east-1 OU and eu-west-1 OU to isolate GDPR data sovereignty per region)
B) Environment-based OUs (Prod/Non-Prod inside a Workloads OU, with each account operating multi-region)
C) Service-based OUs (Payment OU, User OU to separate SCP and billing boundaries by domain)
D) Team-based OUs (Team-A OU, Team-B OU mapped 1:1 to the org chart to clarify ownership)

**정답: B**
해설: The AWS-recommended OU structure is **environment-based** (Prod / Non-Prod / Security / Infrastructure / Sandbox). You operate multi-region within one account; you don't split OUs by region. ① IAM and SCPs are account-scoped, so region splits still make permission consolidation hard ② during a region failover you can move naturally to another region ③ cost allocation is also clearer environment-based. GDPR is solved with separate KMS keys + S3 bucket region policies + Macie — unrelated to OU separation. The only case where region-based OUs make sense is **when data sovereignty regulation forces you to operate the region itself in isolation**, and even then account-level separation is usually sufficient.

---

**문제 3.** A company is adopting the SaaS monitoring tool Datadog. Datadog needs access to metrics in our AWS account. From a security + automation standpoint, what is the most appropriate setup?

A) Create an IAM User for Datadog and hand the access key to Datadog
B) Create an IAM Role for Datadog and specify Datadog's AWS account + an ExternalId (a secret only we know) in the trust policy
C) Provide root credentials for Datadog
D) Create a separate AWS account for Datadog and copy all resources into it

**정답: B**
해설: The canonical pattern for cross-account third-party integration. ① IAM User access keys are static credentials with exposure risk (the trap in A) ② root is absolutely forbidden (C) ③ copying accounts is meaningless (D) ④ the answer is **an IAM Role + Datadog's AWS account ARN + ExternalId in the trust policy**. The ExternalId prevents the **confused deputy attack** — a secret isolating us so other customers using the same Datadog account cannot access our resources. You receive your unique ExternalId from the Datadog console and put it in the trust policy. This same pattern applies identically to every third-party SaaS integration: PagerDuty, New Relic, Sumo Logic, and so on.

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::464622532012:root"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"sts:ExternalId": "DD-abc123xyz-our-secret"}
  }
}
```

---

**문제 4.** A company reported this problem: "deployment frequency is Elite-level at 5 per day, but Change Failure Rate is 40%." Which of the following actions is most effective?

A) Reduce deployment frequency to once per day, batching changes together to secure QA verification time
B) Add a manual approval gate + Change Advisory Board (CAB) review to every deployment to block failures in advance
C) Adopt CodeDeploy Blue/Green + CloudWatch alarm-based automatic rollback + Canary deployments
D) Stop DORA measurement and switch the tracked metric from CFR to average code change volume per deployment

**정답: C**
해설: DORA's core finding is that "**speed and stability are not a trade-off but positively correlated**." Reducing frequency is the wrong prescription (A). Manual approvals only lengthen lead time and don't truly prevent incidents — the approver makes the same mistakes too (B). The answer is strengthening automation: gradual traffic shifting with CodeDeploy Blue/Green (e.g., `Linear10PercentEvery1Minute`), automatic rollback when a CloudWatch alarm detects a threshold violation, and Canary via Lambda weighted aliases. Mathematically, with a 10% Canary exposed for 5 minutes, user impact drops to **under 1/20** of a full deployment, while automatic rollback operates without human intervention. D puts the cart before the horse.

> 🎯 **Scenario**: At 2:47 a.m., a payment service deployed to prod sprang a memory leak, and within 12 minutes all the ECS tasks died from OOM. People were asleep, but a CloudWatch Composite Alarm (error rate + memory utilization) triggered within 9 minutes, and CodeDeploy automatically rolled back to the previous task definition. MTTR: 11 minutes. The same incident took 4 hours last year. The difference was exactly one thing — whether **Blue/Green + Auto-rollback** had been adopted.

---

**문제 5.** A global company deploying across 5 regions wants to manage all accounts' CloudTrail logs with centralization + tamper prevention. What is the most appropriate architecture?

A) Create an individual CloudTrail trail in each account, store it in that same account's S3, and rely on bucket versioning against tampering
B) Create an Organization Trail in the management account → store in the Log Archive account's S3 bucket → block bucket tampering with SCPs + S3 Object Lock (Compliance mode)
C) Cross-account replicate every account's CloudTrail into a single account's S3 bucket + nightly batch synchronization
D) Instead of CloudTrail, record API calls directly to CloudWatch Logs and audit with Logs Insights

**정답: B**
해설: The standard pattern. ① An **Organization Trail** — a single trail in the management account automatically captures events from every member account and every region (new accounts and new regions included automatically) ② the **Log Archive account's** S3 bucket is the store (account separation isolates permissions; even root is blocked by SCP) ③ **SCPs** block deletion/tampering of the Log Archive account's bucket ④ **S3 Object Lock Compliance mode** physically prevents object deletion within the retention period (even root can't delete). A scatters logs across accounts making unified search hard, C is a complex home-grown implementation (Organization Trail already does that job), D cannot replace CloudTrail itself (which serves as the API audit trail).

> 🔍 **Going deeper**: Object Lock has two modes: Governance and Compliance. Governance allows deletion by users holding the `s3:BypassGovernanceRetention` permission (bypassable via IAM). Compliance means that during the retention period, **even the AWS root account cannot delete**. For audit and litigation-response (legal hold) scenarios, Compliance is the answer. But misconfigure it and you can never delete — choose the retention period carefully.

---

**문제 6.** A company is building CI/CD in a multi-account environment. CodePipeline lives in the Shared Services account, and the deployment target is the Prod account. It must deploy to an ECS service in the Prod account and uses artifacts encrypted with a KMS key. What is the most accurate permission setup?

A) The Shared Services account's pipeline role accesses the Prod account's ECS and KMS directly
B) Create a CrossAccountDeployRole in the Prod account (trust: Shared Services) + allow the Prod account to use the Shared Services KMS key in the key policy + the Prod account role holds ECS UpdateService permission + grant the Prod account read in the S3 artifact bucket policy
C) Store the Prod account's root credentials in Shared Services
D) Just setting up SSO with IAM Identity Center solves it automatically

**정답: B**
해설: The canonical pattern for cross-account CI/CD. All four permission boundaries must be aligned. ① **Trust relationship**: create CrossAccountDeployRole in the Prod account, naming the Shared Services account in the trust policy ② **KMS key policy**: the Shared Services KMS key policy must state that the Prod account's role can `Decrypt`/`GenerateDataKey` (IAM policy alone does not enable KMS cross-account access — the key policy is the gate) ③ **IAM permission**: the Prod account role holds deployment permissions such as ECS UpdateService and ECR pull ④ **S3 bucket policy**: the artifact bucket allows Prod account reads. A is impossible — direct cross-account access doesn't work (AssumeRole required); C — root is absolutely forbidden; D — IAM Identity Center is SSO for human users, not machine workflows (CodePipeline operates with its own service role).

---

**문제 7.** A company wants to enforce "no EC2/RDS/S3 operations in any region other than ap-northeast-2 and us-east-1" across all accounts. What must you absolutely watch out for when writing the SCP?

A) SCPs don't support the `aws:RequestedRegion` condition key, so region restriction is only possible via IAM permission boundaries
B) Excluding global services (IAM, CloudFront, Route 53, Organizations, Support, etc.) via `NotAction` is mandatory — otherwise even IAM operations get blocked and the account becomes inoperable
C) SCPs don't apply to member accounts' root users, so deployment can bypass via root, neutralizing the SCP
D) You must set the EC2/RDS Service Quotas to 0 in the target regions for the SCP to enforce the region block

**정답: B**
해설: A staple exam trap. **Global services like IAM, CloudFront, Route 53, and Organizations have no concept of region**, so the `aws:RequestedRegion` condition evaluates differently than intended for global service APIs (global services are internally routed to us-east-1). When writing a region-restriction SCP, you must exclude global services via `NotAction` so IAM operations don't get blocked too. A is false (the `aws:RequestedRegion` condition key is supported), C is wrong (SCPs apply to root too — except the management account's root), D is irrelevant.

```json
{
  "Effect": "Deny",
  "NotAction": [
    "iam:*", "organizations:*", "cloudfront:*",
    "route53:*", "support:*", "sts:*",
    "s3:ListAllMyBuckets", "globalaccelerator:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {
      "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
    }
  }
}
```

> ⚠️ **Pitfall**: In 2022 a large enterprise misapplied a region SCP, blocking IAM operations and leaving the account inoperable for 6 hours. They recovered by detaching the SCP using the management account's root — but if the same SCP had also applied to the management account, even that would have been blocked, requiring recovery through AWS Support. **Always test SCP changes in a sandbox OU first.**

---

**문제 8.** A company runs an EKS cluster in the Prod account and deploys GitOps-style via ArgoCD. In a single-cluster scenario, where is the most appropriate place to put ArgoCD?

A) Inside the same Prod cluster (the archetypal pull-based GitOps)
B) In a separate Shared Services account, accessing the Prod account's EKS API cross-account via IRSA (Hub-Spoke)
C) Install a separate ArgoCD per environment account + operate duplicate synchronization with ApplicationSet
D) Instead of ArgoCD, push-based deployment via CodePipeline + a kubectl ECS deploy action

**정답: A**
해설: For a single cluster and single environment, the orthodox GitOps pattern is **putting ArgoCD inside the same cluster**. ① ArgoCD polls Git and ② accesses the same cluster's Kubernetes API via an in-cluster service account ③ credentials never leave the cluster ④ cluster multi-tenancy isolation is also possible via ArgoCD Projects. In multi-cluster, multi-account setups, B (Hub-Spoke) is also a common pattern, but then the Shared Services ArgoCD must hold every cluster's credentials, complicating the security boundary. C is duplicated operational burden. D violates the GitOps principles themselves (pull-based, Git as SSOT).

> 🔍 **Going deeper**: The trickiest part of ArgoCD Hub-Spoke is **the EKS API access path**. Options: ① the Shared Services ArgoCD assumes an IAM Role registered in each Spoke cluster's `aws-auth` ConfigMap → refreshes kubeconfig ② the ArgoCD pod receives a cross-account role via EKS Pod Identity or IRSA ③ registration via the cluster generator of ArgoCD ApplicationSet. In every option, the Spoke clusters' RBAC must be carefully separated — if one ArgoCD becomes cluster-admin of every cluster, a single security incident brings down everything.

---

**문제 9.** A company received the requirement "visualize DORA metrics on a dashboard." What is the most appropriate data pipeline in an AWS environment?

A) Output hard-coded values from a Lambda
B) CodePipeline/CodeDeploy events → EventBridge → Lambda (processing) → CloudWatch Custom Metric (EMF) → CloudWatch Dashboard, or EventBridge → Firehose → S3 → Athena → QuickSight
C) Manual entry into an Excel file
D) Forecast the metrics with Amazon Forecast

**정답: B**
해설: AWS does not measure DORA for you, so you need your own pipeline. AWS defines only the "measurement frame"; implementation is the customer's job. Both standard patterns are correct answers.

**Path 1 (real-time):** EventBridge → Lambda → CloudWatch Custom Metric (EMF format)
- Pros: near real-time, connects directly to alarms, low operational burden
- Cons: CloudWatch Metric's 15-month retention limit, complex joins are hard

**Path 2 (analytical):** EventBridge → Kinesis Firehose → S3 → Athena → QuickSight
- Pros: indefinite retention, complex SQL possible, cost-efficient
- Cons: minutes of latency, more complex infrastructure

Google's **Four Keys** project (`github.com/GoogleCloudPlatform/fourkeys`) is the reference implementation — originally GCP-based but portable to AWS. C lacks automation; D is an ML forecasting tool (unrelated to DORA measurement).

---

**문제 10.** A company wants to enforce an automatic "read-only mode during specific hours (weekends, 0-6 a.m.)" on the Production account. What is the most appropriate mechanism?

A) Put an `aws:CurrentTime` datetime condition in an IAM Policy and attach it individually to every user in the account
B) Write an SCP with `Deny` + an `aws:CurrentTime` condition and apply it to the OU → blocking all write APIs during those hours. But exclude global services + exclude the emergency access role via ArnNotLike
C) Disable Route 53 routing during those hours on an EventBridge schedule to cut off traffic itself
D) Automatically shut down Prod EC2/ECS instances during those hours via a scheduled Lambda to physically prevent changes

**정답: B**
해설: Implement time-based blocking with the SCP `aws:CurrentTime` condition. An SCP is a governance tool affecting the whole account, applied consistently to every user/role. A (IAM Policy) is possible too, but attaching it to every user individually risks omissions. The key trap — **you must exclude the emergency access role via ArnNotLike**. When a real incident hits in the middle of the night, the SREs must be able to get in.

```json
{
  "Effect": "Deny",
  "NotAction": ["iam:*", "organizations:*", "cloudfront:*", "route53:*"],
  "Resource": "*",
  "Condition": {
    "DateGreaterThan": {"aws:CurrentTime": "2026-06-15T00:00:00Z"},
    "DateLessThan": {"aws:CurrentTime": "2026-06-17T00:00:00Z"},
    "ArnNotLike": {
      "aws:PrincipalArn": "arn:aws:iam::*:role/EmergencyAccessRole"
    }
  }
}
```

> 🎯 **Scenario**: A game company used an SCP to block prod deployments after 5 p.m. on Fridays. Then a situation arose early Saturday morning requiring a security patch, and with all deployments blocked, they stayed exposed for 30 minutes. Lesson — **a "deploy freeze" must be a two-way policy, not one-way**. Block routine changes, but the standard pattern is to carve out a dedicated role for security hotfixes (e.g., `SecurityHotfixRole`) via ArnNotLike.

---

**문제 11.** Which organizational model most accurately implements Werner Vogels's "You Build It, You Run It" principle in an AWS environment?

A) A central DevOps team manages every service's pipelines and CloudWatch alarms
B) Stream-aligned teams (2-Pizza Teams) own their service's CodePipeline, CloudWatch, X-Ray, and SLOs entirely, while a Platform team provides common infrastructure (Service Catalog, IDP, Account Vending)
C) Outsource operations to an external MSP
D) Clearly separate the development team from the operations team

**정답: B**
해설: The combination of the AWS Werner Vogels model + Team Topologies (Skelton & Pais). ① A **stream-aligned team** owns its service's entire lifecycle (development + deployment + operations + on-call) ② a **Platform team** provides common tooling that reduces friction on top (standard stacks via Service Catalog, an IDP via Proton, Account Vending via AFT/Control Tower) ③ an **Enabling team** consults on new technology adoption (e.g., introducing an ML platform) ④ a **Complicated-subsystem team** handles specialized areas (e.g., PCI-DSS payments). A disperses ownership through centralization, C severs learning by outsourcing responsibility, D is the very silo the DevOps movement set out to break.

> 💡 **Related theory**: The IDP (Internal Developer Platform) built by Platform teams is best exemplified by Backstage (Spotify, open-sourced 2020). AWS provides similar capabilities with AWS Proton, implementing Team Topologies' cognitive load reduction principle: "stream-aligned teams must be able to obtain infrastructure via self-service."

---

**문제 12.** A company received the demand: "one team ran up \$30,000 in a month in a sandbox account. Make sure it never happens again." What is the most effective combination of actions?

A) Send SNS/email alerts via AWS Budgets at a \$5,000 threshold and have the team lead respond manually
B) ① Restrict instance types via Service Catalog ② SCP with an InstanceType condition on `ec2:RunInstances` (allow only `t3.*`, `t4g.*`) ③ AWS Budgets Action that auto-attaches an IAM policy when \$5,000 is exceeded (blocking further permissions) ④ enable Cost Anomaly Detection
C) A person opens Cost Explorer daily to check costs and escalates via Slack on anomalies
D) Close the sandbox account and move experimental workloads to an approval-based Non-Prod account

**정답: B**
해설: **Defense in depth** is the correct answer for cost governance. ① Service Catalog offers only the recommended path (but bypassable) ② SCP is the enforced guardrail (not bypassable) ③ Budgets Action is automated after-the-fact response ④ Anomaly Detection is ML-based anomaly detection. A (alerts only) is useless while people sleep, C (manual) accumulates human error, D (closure) negates the very reason a sandbox exists. The key is the three-tier structure: "**prevention (SCP) + detection (Anomaly) + automated response (Budgets Action)**."

> 📚 **Case study**: In 2020 a startup accidentally left 8 `p4d.24xlarge` instances running in a sandbox and was billed \$58,000 over a weekend. The postmortem found ① alarms existed but arrived only by email and went unseen ② no Budgets Action configured ③ no SCP instance-type restrictions. They negotiated a partial refund with AWS Support, but afterwards applied `Deny` + `ec2:InstanceType` conditions in SCPs as standard. When "preventing recurrence of a cost incident" appears on the exam, the SCP + Budgets Action combination is almost always the answer.

---

## Week 1 Close — The Bridge to Next Week

The five things we've covered so far — the DevOps operating model, CALMS/DORA, W-AF, the tool map, and multi-account — form **the background for all of DOP-C02 Domains 1-6**. Starting next week we dive into Domain 1 (SDLC) in earnest, and every CodePipeline / CodeBuild / CodeDeploy scenario you'll meet there is solved on top of these two questions:

1. "How **quickly and safely** will we flow this change through?" (DORA)
2. "When an incident happens, within **how narrow a scope** will it stop?" (blast radius + multi-account)

Keep these two questions in mind, and next week's topics — trunk-based development, OIDC federation, CodeArtifact, code signing — will start to look not like "tools to memorize separately" but like "different parts of the same thinking frame."
