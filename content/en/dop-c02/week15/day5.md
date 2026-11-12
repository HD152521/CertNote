# Day 5 - Week 15 Synthesis: Reading Signals and Trade-Off Judgment

Pro exam scenarios test not knowledge amount but **signal-reading speed and trade-off judgment.** Same "deployment" question, one single constraint word—"regulated", "no internet outbound", "no static keys", "minimum overhead", "least cost", "across all accounts"—determines the answer. Four choices: two fail outright, remaining two both work but only one fits the constraint. Today: the four scenarios from Week 15 (multi-account, hybrid, containers, serverless incident) span domains; we install a **5-step scenario-solving system** to narrow solution space and drill cross-domain scenario chains.

## Scenario Problem-Solving: Five Steps to Trim Cognitive Load

Long scenarios blow cognitive budget. Instead, break into five phases:

1. **Mark constraint words**: "regulated", "zero internet", "no static keys", "minimum overhead", "least cost", "all accounts" — underline first.
2. **Domain ID**: CI/CD domain? IaC? Monitoring, security, resilience, incident?
3. **Narrow to 2 choices**: Keep "works + fits constraint"; discard "doesn't work" or "overkill."
4. **Final decision via trade-off**: Remaining pair, compare ops burden·cost·security — Pro almost always prefers managed, standard, minimal ops.
5. **Below 50% confidence: flag and skip.** Time-preserve is passing skill.

> 💡 **Related theory**: This is cognitive psychology's **chunking** and **recognition-primed decision (RPD).** Experts don't analyze whole problems; they recognize familiar **patterns** (cues), immediately shrink solution space, then compare only inside that space (Gary Klein). "No internet outbound → PrivateLink", "all accounts → StackSets/Delegated Admin" pre-mapped. Exams: 75 problems × 180 min = 2:24/problem average. Analyzing from scratch every time runs dry. **Signal recognition shrinks analysis from "infinite" to "these three."**

## Signal ↔ Answer Fast Map (Week 15 Unified)

| Signal | Answer Keyword | Source |
|--------|---|---|
| Cross-Account Pipeline + KMS error | KMS CMK key policy + Cross-Account Role | Day1 |
| Lambda 5min 50% two-stage | `Canary50Percent5Minutes` | Day1 |
| EC2 + DC single deploy | CodeDeploy On-Prem + single AppSpec | Day2 |
| Burst quickly, diverse instances, Spot | Karpenter | Day3 |
| Git revert rollback | GitOps (Argo CD/Flux) | Day3 |
| Container compute 30-40% down | Graviton + Spot + Fargate Spot | Day3 |
| Auto-remediation entry | EventBridge → Step Functions/SSM | Day4 |
| Runbook >5min, audit | Step Functions Standard | Day4 |
| DLQ re-drive no infinite loop | retry count + human gate | Day4 |
| Slack restricted CLI | AWS Chatbot + constrained Role | Day4 |
| No static keys on-prem | IAM Roles Anywhere | Day2 |
| No static keys CI | OIDC (`AssumeRoleWithWebIdentity`) | Day1 |
| DX encrypted | MACsec / IPSec over DX | Day2 |
| Minimum ops overhead | Managed / Fargate / GitOps | Common |

> ⚠️ **Gotcha**: **Multi-signal scenarios hide real pivot in second constraint.** Example: "no static keys" hits both Roles Anywhere and Pod Identity. If context is EKS pods, answer is Pod Identity. If context is on-prem DC machines, Roles Anywhere. "No static keys" alone doesn't suffice — read every constraint, find intersection.

## Managed vs Self-Build — Pro's Default Bias

Pro prefers managed: **eliminate undifferentiated heavy lifting (AWS Well-Architected).** Self-build (Jenkins, custom auto-scaler, hand credential-rotation) works but inherits patch, scale, failure toil. Two "working" choices, one is managed (CodePipeline, Karpenter, Pod Identity, Incident Manager): nearly always that one. Exception: explicit constraint ("keep Jenkins asset", "need custom control") → hand over to incrementally migrate (CodePipeline + Jenkins Action) or low-abstraction (EKS node control).

## Cross-Domain Common Axis — Four Domains, Five Pillars

Week 15's four scenarios look separate; really they rest on **five pillars**.

```
Unified Core (spans four domains)
├─ IaC          : CDK / CloudFormation / Terraform, code everything
├─ Pipeline    : CodePipeline standard (Tooling Hub) + governance gates
├─ Observability: CloudWatch + ADOT (OpenTelemetry) + X-Ray (metrics·logs·traces)
├─ Security    : GuardDuty/Security Hub/Config → Audit account aggregate
└─ Cost        : Tag-force + Cost Categories + Anomaly Detect
```

- **Multi-account (Day1)**: Enforce these five pillars account-wide via OU/StackSets.
- **Hybrid (Day2)**: Extend same five to internet-blocked on-prem (PrivateLink, SSM, Roles Anywhere).
- **Containers (Day3)**: Scale the five across hundreds (Karpenter, GitOps, Container Insights, Kubecost).
- **Serverless Incident (Day4)**: Signal from security/observability → auto-response (EventBridge, Step Functions).

> 🔍 **Deeper**: These five pillars are **AWS Well-Architected's operational axis** almost one-to-one. IaC+Pipeline = Operational Excellence, Security aggregate = Security, Cost = Cost Optimization, Observability spans Operational Excellence+Reliability. Pro rarely asks single-service; instead "implement these five in that domain," so multi-domain questions → multi-pillar answers (tag-force + Cost Categories + Delegated Admin). Single-service-only choice is often trap.

## Time Allocation — Passing is Time Management, Not Perfection

75 problems, 180 min; 2:24 average, but long scenarios eat 5min. Strategy: **Mark and skip below 50% confidence immediately.** First pass: quick ones, lock wins. Final 30min: marked questions + sprawling scenarios. "Don't drown in one problem" is passing skill.

> 🎯 **Scenario**: "Global fintech, 60 accounts, on-prem DC, EKS, serverless. One query: new microservice launch must auto-provision ① account + pipeline ② internet-blocked DC link ③ container cost cut ④ security auto-response. What stack?" — 5-step: Constraints underline ("60 accounts auto", "zero-internet DC", "cost cut", "security auto") → four domains → each domain's pillar map: ① AFT/Control Tower + Service Catalog + Permission Boundary, ② SSM Hybrid + Roles Anywhere + PrivateLink + (DX MACsec if encrypt required), ③ Karpenter + Graviton/Spot + GitOps, ④ EventBridge → Step Functions → Incident Manager. Multi-pillar (IaC, pipeline, observability, security, cost) threaded through four domains.

## Summary

Today synthesized Week 15: five-step scenario-solve, signal↔answer map, managed bias, five pillars across four domains. The thread: **all complex ops problems reduce to "implement these five (IaC, pipeline, observability, security, cost) in that domain (multi-account, hybrid, containers, incident).** Read signals, apply map, within 2 minutes, move on or flag.

Next: Week 16 continues domain 3 (resilience) and domain 4 (monitoring).

---

## 📝 Scenario Review: 12 Questions

**Question 1.** A fintech operates 60 AWS accounts. It must automatically deploy the same Config rule security baseline to every account, and the baseline must also apply automatically to new accounts that join the OU in the future. What is the most suitable combination?

A) An IAM administrator manually configures the same Config rules in each account console, with an onboarding checklist to prevent omissions when new accounts join

B) AWS Organizations + CloudFormation StackSets Service-Managed (Auto-Deployment Enabled), deployed with the OU as the target

C) EventBridge Scheduler triggers a Lambda function daily to scan for new accounts and synchronize the Config rules through the API

D) Set up a Config Aggregator in the Audit account to aggregate findings from all accounts into one dashboard and notify on non-compliance

**Answer: B**

Explanation: Service-Managed StackSets integrate with Organizations so that AWS manages the execution role, and they support OU targeting and Auto-Deployment — when a new account enters the OU, the baseline is deployed automatically. "Apply automatically to new accounts too" is always Service-Managed + Auto-Deployment. Manual work (A) and scripts (C) risk omissions, and a Config Aggregator (D) only collects findings for viewing and does not deploy rules.

---

**Question 2.** You want to patch-manage 5,000 servers in a data center with completely blocked internet access the same way as EC2. The data center servers must also retrieve Secrets Manager secrets over a private path. What is the most suitable combination?

A) Run Ansible yourself + receive patch metadata from the internet through a NAT Gateway and inject secrets as environment variables

B) SSM Hybrid Activation and then Patch Manager + access an Interface VPC Endpoint (PrivateLink) for Secrets Manager over Direct Connect

C) Put patch scripts in an AppSpec hook with the CodeDeploy on-premises agent and roll them out to the 5,000 servers

D) A Lambda function connects to each server over SSH to run patch commands and passes secrets through Lambda environment variables

**Answer: B**

Explanation: Once data center servers are registered with SSM Hybrid Activation, they become Patch Manager targets with mi-xxxx IDs, just like EC2. In an internet-blocked environment, access Secrets Manager through an Interface VPC Endpoint (PrivateLink) via DX/TGW — traffic does not go out to the internet (DNS is resolved with Route 53 Resolver). Ansible + NAT (A) requires an internet path, CodeDeploy (C) is for deployment and not patch management, and Lambda + SSH (D) requires inbound access, which is unsuitable for a secured environment.

---

**Question 3.** An EKS cluster has very large traffic fluctuations, so minute-level node scaling is not enough. To launch a variety of instance types dynamically and make aggressive use of Spot as well, what should you use?

A) Cluster Autoscaler — predefine ASGs for multiple instance types and scale the relevant ASG at minute granularity when pending pods appear

B) Karpenter

C) A Lambda function watches CloudWatch metrics and dynamically updates ASG scheduled actions to reserve and adjust capacity by time of day

D) Manually configure mixed Spot/On-Demand requests with EC2 Fleet and have operators manage the type pools directly

**Answer: B**

Explanation: Cluster Autoscaler presupposes ASGs, works at minute granularity, and has fixed types. Karpenter launches EC2 directly without ASGs, dynamically selects the cheapest, best-fitting instances within seconds through bin-packing based on pending pod requirements, and reduces cost through consolidation. "Fast scale + diverse instances + Spot flexibility" is Karpenter. Scheduled actions (C) and a manual Fleet (D) are not dynamic scheduling.

---

**Question 4.** For a new EKS cluster, what is the currently recommended standard for granting per-pod IAM more simply, without setting up the IRSA OIDC provider?

A) Combine the permissions for all pods into the node instance profile and have pods share those credentials through IMDS

B) Create an IAM user for each pod and inject long-term access keys as a Kubernetes Secret

C) EKS Pod Identity

D) Have each pod manually call STS GetSessionToken at startup to receive and cache MFA-based temporary credentials

**Answer: C**

Explanation: EKS Pod Identity directly links namespace/ServiceAccount/role through the Pod Identity Agent add-on and an association, without OIDC setup, and since the trust policy only needs `pods.eks.amazonaws.com`, roles are easy to reuse across multiple clusters — it is the follow-on standard that simplifies identity. A node profile (A) violates least privilege, and IAM user keys (B) and manual STS (D) are anti-patterns.

---

**Question 5.** GuardDuty detects EC2 instance credential exfiltration (InstanceCredentialExfiltration). Without human intervention, the flow must go through (1) immediately deactivating the keys, (2) analyzing the impact with CloudTrail, and (3) automatically opening an incident.

A) Implement key deactivation, CloudTrail queries, and incident opening sequentially in a single Lambda function

B) EventBridge → Step Functions (runbook) → Incident Manager Response Plan

C) A Config auto-remediation rule automatically corrects the resource configuration of the leaked credentials and notifies via SNS

D) Set a metric filter + CloudWatch alarm on CloudTrail to alert the SRE on suspicious API calls

**Answer: B**

Explanation: EventBridge receives the GuardDuty finding and routes it to a Step Functions runbook, which runs key deactivation → CloudTrail Lake impact query → Incident Manager incident opening in order (with retry and audit guarantees). A standalone Lambda function (A) risks partial execution and lacks auditing, Config (C) is for correcting resource configuration, and a CloudTrail alarm alone (D) cannot execute a response.

---

**Question 6.** You need to provide a standard pipeline to 50 microservice teams, where teams must be able to create it themselves (self-service) and must not deviate from the company standard.

A) Keep pipeline definitions in Git with GitOps (Argo CD), and have each team copy the manifests and operate them in self-service

B) Run Jenkins centrally and enforce a standard pipeline with per-team folder permissions + shared libraries

C) AWS Service Catalog portfolio + CDK Pipelines templates

D) Each team manually writes a CodeCatalyst blueprint, with the security team reviewing standards compliance via PR each time

**Answer: C**

Explanation: If you publish a vetted CDK Pipelines template in a Service Catalog portfolio, developers pick a product and create the pipeline in self-service, while the standard that only approved templates are used is maintained (the Golden Path). GitOps alone (A) is not a self-service mechanism for pipeline standards, and central Jenkins (B) and manual authoring (D) cannot satisfy self-service and standardization at the same time.

---

**Question 7.** You use Direct Connect at 10 Gbps, and regulations require line encryption. What satisfies this with the least change?

A) Turn on S3 SSE-KMS so that transferred data is encrypted with a CMK when stored

B) Enforce TLS 1.3 on all application traffic and add mutual authentication with mTLS

C) Apply MACsec or IPsec over DX

D) Cancel DX and replace it entirely with Site-to-Site VPN to encrypt the line with IPsec tunnels

**Answer: C**

Explanation: DX is a private dedicated line, but it is not encrypted by itself — if line encryption is required, add MACsec (Layer 2) or IPsec over DX (Layer 3). SSE-KMS (A) is S3 encryption at rest, TLS (B) is at the application layer so it is hard to say it directly satisfies "line encryption is mandatory," and replacing everything with VPN (D) is an excessive change that throws away DX's bandwidth and latency advantages.

---

**Question 8.** When the SQS DLQ accumulates messages, you need to perform an automatic re-drive while preventing infinite loops (poison messages).

A) Increase the Lambda timeout and memory to secure processing time and reduce the batch size to spread the load

B) Apply a short TTL to DLQ messages so that old poison messages expire automatically and disappear

C) Record a reprocessing count in message attributes, and when it exceeds a threshold, stop automatic reprocessing and hand it over to a human

D) Wrap the re-drive in a Step Functions Express workflow to add fast retries and state tracking

**Answer: C**

Explanation: Because delivery is at-least-once, the same message can repeat, and exactly-once is theoretically impossible. Recording a retry count in a message attribute and stopping when it exceeds a threshold prevents infinite loops as a dedup guard ("at-least-once + idempotent = effectively-once"). A timeout (A), TTL (B), and Express (D) cannot prevent the infinite loop itself.

---

**Question 9.** SREs must be able to safely run restricted AWS CLI commands from a Slack channel.

A) Send commands to Lambda through a Slack Incoming Webhook and have Lambda run the CLI with an assumed role

B) AWS Chatbot + a restricted IAM role

C) Store a Slack Bot OAuth token on EC2 and have the bot receive channel commands with that token and run the CLI

D) Share an IAM Identity Center console SSO link in the channel so that the SRE clicks it and takes action in the console

**Answer: B**

Explanation: AWS Chatbot lets you run AWS CLI commands directly from a Slack/Teams channel within the scope of a restricted IAM role — diagnosing and taking action in chat without opening the console. Webhook + Lambda (A) requires separate permission controls for arbitrary command execution, storing an OAuth token (C) is the static-secret anti-pattern, and sharing a console SSO link (D) is not restricted execution within chat.

---

**Question 10.** There is pressure to cut container workload costs by 30% or more. What is the single best action?

A) Purchase a large 1-year or 3-year Compute Savings Plan/Reserved Instance commitment to lower the On-Demand unit price

B) Apply Graviton (arm64) node groups + Spot/Fargate Spot

C) Move the workload to a cheaper Region such as us-east-1 to save on the Regional unit price difference

D) Switch container logs from CloudWatch to S3 Infrequent Access and shorten the retention period

**Answer: B**

Explanation: Graviton is ARM (RISC)-based with power efficiency and AWS's own design, giving a lower unit price and 30-40% savings, and Spot offers up to a 90% discount (prepare for interruptions with PDBs and topology spread). The combination of the two is the single best lever for container compute cost. RI alone (A) loses flexibility, and moving Regions (C) and S3 IA (D) are not key levers for the compute unit price.

---

**Question 11.** How can you grant temporary credentials for AWS API calls to 5,000 servers in an internet-blocked data center, using the corporate PKI (X.509 certificates) without storing static access keys?

A) Issue long-term IAM user keys, deploy them to each server, and replace them every 90 days with a rotation script

B) IAM Roles Anywhere — register the corporate CA as a trust anchor, authenticate with server certificates, and obtain short-lived STS credentials

C) Integrate the corporate PKI as an OIDC IdP in a Cognito identity pool so that servers receive temporary credentials

D) Imitate an EC2 instance profile by standing up an IMDS proxy in the data center, and have servers retrieve credentials from that endpoint

**Answer: B**

Explanation: IAM Roles Anywhere proves identity with X.509 certificates from the corporate PKI and receives temporary credentials — no static keys exist on the servers (PKI chain of trust per RFC 5280, the short-lived credential principle). Long-term keys (A) carry Codecov-style leak risk, Cognito (C) is for app users, and an instance profile (D) is EC2-only, so it cannot be used for on-premises data center servers.

---

**Question 12.** An organization runs a mix of EKS (payments) and ECS Fargate (general). It needs manifest changes to be rolled back automatically with a single Git revert, and ECS Fargate needs canary traffic shifting and instant rollback. What is the standard combination for each?

A) For EKS, operators roll back directly with kubectl apply, and for ECS, gradually replace with the service's default Rolling Update

B) For EKS, GitOps (Argo CD/Flux) reconciles manifests (rollback = git revert); for ECS Fargate, CodeDeploy Blue/Green + two ALB target groups/listeners

C) For both, detect changes with CloudFormation drift detection and roll back with update-stack to the previous stack version

D) For EKS, use Lambda alias weights, and for ECS, use Route 53 weighted records to split canary traffic

**Answer: B**

Explanation: For EKS, if you make Git the single source of truth with GitOps, then when you git revert the manifest to a previous commit, Argo CD automatically returns the cluster to that state (closed-loop reconciliation). Canary traffic shifting and instant rollback on ECS Fargate require the CodeDeploy controller (`type=CODE_DEPLOY`) + two ALB target groups/listeners (the default Rolling is not enough). Manual kubectl and Rolling (A), Drift Detection (C), and Lambda aliases and Route 53 (D) are not the standard for each requirement.

---

## 📌 Today's Summary

Today we tied the 39% covered by Domains 1+2 into five threads. First, the split across the Code* family follows the Continuous Delivery stage model plus separation of concerns; V2 variables, triggers, and execution modes are Pro-exam regulars, and CodeCommit is excluded from new environments. Second, deployment strategy is the math of minimizing "affected users × exposure time" in different ways — the structural difference between Canary (two steps) and Linear (even increments), and the per-platform mechanism differences (Lambda Alias / ECS ALB Listener / EC2 ASG), are the core; and as the TSB and big-bang lessons show, All-at-once is the wrong answer whenever the clue is risk minimization. Third, the build is the starting point of the chain of trust; in the context of SolarWinds, SLSA, and SBOM, integrity is guaranteed by signing (Signer/Notation), not by KMS (encryption). Fourth, IaC is a declarative convergence loop plus idempotency, and drift is detected and remediated automatically via EventBridge/Config. Fifth, configuration separates into Parameter Store (settings), Secrets Manager (rotation), and AppConfig (polling, validation, gradual rollout) — and each clue is itself the answer.
