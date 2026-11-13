# Day 5 - Week 15 Wrap-Up: The Art of Reading Clues Across Cases and Judging Trade-offs

Scenario questions on the Pro exam are decided not by how much you know but by **how fast you read clues and how well you judge trade-offs**. Even for the same "deployment" question, one or two constraint words such as "regulated", "no internet outbound", "no static keys", "minimum operational overhead", "least cost", or "across all accounts" decide the answer. Of four options, two don't even work, and the other two both work but only one fits the constraints. Today we cut across the four cases Week 15 covered (multi-account in Day 1, hybrid in Day 2, containers in Day 3, serverless incidents in Day 4), build a solving system that narrows clues to a domain, a domain to candidates, and candidates to an answer, and then sharpen it with integrated scenarios.

## The 5 Steps of Solving a Scenario - A Procedure to Cut Cognitive Load

The most common failure in front of a long scenario is "burning time trying to understand the whole thing at once." Instead, split the cognitive load with these 5 steps.

1. **Mark the constraint words**: first find and underline "regulated", "zero internet", "no static keys", "minimum overhead", "least cost", "all accounts", and so on.
2. **Identify the domain**: is it CI/CD, IaC, or monitoring, security, resilience, incidents?
3. **Narrow to 2 candidates**: keep only candidates that "work and fit the constraints," and remove options that don't work or are clearly overkill (elimination).
4. **Pick the final 1 by trade-off**: compare the remaining two on operational burden, cost, and security. Pro almost always prefers managed, standard, minimal-burden choices.
5. **If your confidence is 50% or less, mark it and pass**: preserving time is the skill that gets you through.

> 💡 **Related theory**: This procedure applies **chunking** and **recognition-primed decision making** from cognitive psychology. Experts don't analyze a problem whole; they first recognize familiar patterns (clues) to narrow the solution space and then compare only within it (Gary Klein's RPD model). Building clue-to-answer mappings in advance, such as "no internet outbound → PrivateLink" and "all accounts → StackSets/Delegated Admin," amounts to transplanting an expert's pattern library. The exam is 75 questions x 180 minutes = an average of 2 minutes 24 seconds per question, so reasoning from zero on every question runs out of time. Narrowing candidates instantly through clue recognition is the core of time economics.

## Quick Clue → Answer Mapping (Week 15 Consolidated)

| Clue | Answer keyword | Source |
|------|-------------|------|
| "across all accounts / new accounts auto" | Service-Managed StackSets + Auto-Deployment / Delegated Admin | Day1 |
| "self-service standard pipeline" | Service Catalog Portfolio + CDK Pipelines | Day1 |
| "developer-created Role must not exceed policy" | Permission Boundary (enforce `iam:PermissionsBoundary`) | Day1 |
| "no internet outbound / zero internet" | PrivateLink / VPC Endpoint (+ Route 53 Resolver) | Day2 |
| "no static keys (on-prem/CI)" | IAM Roles Anywhere | Day2 |
| "no OIDC setup, pod IAM (new EKS)" | EKS Pod Identity | Day3 |
| "DX must be encrypted" | MACsec / IPSec over DX | Day2 |
| "EC2 + DC single deploy" | CodeDeploy On-Prem (single AppSpec) | Day2 |
| "burst quickly, diverse instances, Spot" | Karpenter | Day3 |
| "Git revert rollback" | GitOps (Argo CD/Flux) | Day3 |
| "container cost 30~40% down" | Graviton + Spot/Fargate Spot | Day3 |
| "auto remediation entry point" | EventBridge → Step Functions/SSM Automation | Day4 |
| "Runbook >5min, audit" | Step Functions Standard | Day4 |
| "DLQ re-drive without infinite loop" | Record retry count + hand to a human at the threshold | Day4 |
| "Slack restricted CLI" | AWS Chatbot + restricted IAM Role | Day4 |
| "minimum operational overhead" | Managed services / Fargate / GitOps | Common |

> ⚠️ **Pitfall**: If you apply the clue mapping mechanically and miss a **compound clue**, you get it wrong. For example, you see only "no static keys" and pick IAM Roles Anywhere, but if the question is in an EKS pod context, the answer is Pod Identity/IRSA. You see only "no internet" and pick PrivateLink, but if there is an extra clue that DNS resolution fails, a Route 53 Resolver Endpoint may be the real crux. In Pro questions, **the second clue is often the real differentiator**: use the first clue to narrow the domain, and the second clue to choose the exact service within that domain. Don't stop after one clue; mark all the constraint words and find the intersection.

## Managed vs Self-Built - The Pro Exam's Default Bias

> The Pro exam's preference for managed services rests on a clear operating philosophy: **eliminating undifferentiated heavy lifting**. The Operational Excellence pillar of the AWS Well-Architected Framework advises pushing operational work that doesn't create business value onto managed services. Self-built options (self-run Jenkins, a custom autoscaler, custom credential rotation) work, but you take on the toil of patching, scaling, and incident response. So when one of the "two working options" is managed (CodePipeline, Karpenter, Pod Identity, Incident Manager), it is almost always the answer. There are exception clues, though: when an explicit constraint such as "keep existing Jenkins assets" or "specific custom control required" appears, a gradual migration (CodePipeline + Jenkins Action) or a stronger-control choice like EKS becomes the answer. The default is managed; with a clue, the exception applies.

## The Common Axes Across Cases - Five Pillars Linking the Four Domains

The four cases of Week 15 look different on the surface, but they actually stand on the same five pillars. Seeing these common axes speeds up decomposition of any scenario.

```
Common core (cutting across the four cases)
├─ IaC           : Everything as code with CDK / CloudFormation / Terraform
├─ Pipeline      : CodePipeline standard (Tooling Account Hub) + governance gates
├─ Observability : CloudWatch + ADOT (OpenTelemetry) + X-Ray (metrics, logs, traces)
├─ Security      : GuardDuty / Security Hub / Config aggregated into the Audit account
└─ Cost          : Enforced tags + Cost Categories + Anomaly Detection
```

- **Multi-account (Day 1)** is a governance problem of enforcing these five pillars on every account via OUs/StackSets.
- **Hybrid (Day 2)** is a boundary problem of extending the same five pillars to internet isolation and on-premises (PrivateLink, SSM, Roles Anywhere).
- **Containers (Day 3)** is a scale problem of solving the pipeline, observability, and cost pillars at hundreds of containers (Karpenter, GitOps, Container Insights).
- **Serverless incidents (Day 4)** is a response problem of taking signals from the security and observability pillars and closing them with automatic recovery (EventBridge, Step Functions).

> These five pillars correspond almost one-to-one with the operating axes of the AWS Well-Architected Framework: IaC and pipelines map to Operational Excellence, security aggregation to Security, cost to Cost Optimization, and observability cuts across Operational Excellence and Reliability. That is why the Pro exam asks not only about specific service knowledge but "how do you weave these five axes into one system." So when one question touches several domains at once (for example, "visualize container cost across all accounts in a multi-account environment"), the answer is not one axis but a combination of axes (enforced tags + Cost Categories + Delegated Admin). Options that answer with a single service are usually traps.

## Time Allocation - Passing Is About Time Management, Not Accuracy

With 75 questions in 180 minutes you get an average of 2 minutes 24 seconds, but long scenarios can take 4 to 5 minutes. Strategy: if you don't know it or are under 50% confident, **Mark for Review immediately and pass**. If you cling to one question and burn 5 minutes, you can't get to the next two. On the first pass, skim the whole exam quickly and solve the sure ones first, and allocate the last 30 minutes to the marked questions plus rechecking very long scenarios. "Preserving time beats one perfect question" is the skill that gets you through.

> 🎯 **Scenario**: "A regulated-industry company operates 60 accounts, an on-premises DC, EKS, and serverless. The single question: 'When launching a new microservice, provide all of (1) automatic account and pipeline provisioning, (2) integration with an internet-isolated DC, (3) container cost optimization, and (4) automatic security incident response as standards.' Where do you start decomposing?" → In 5 steps: mark the constraint words ("regulated", "zero internet DC", "cost", "auto response"), split into four domains, then apply the clue-to-answer mapping for each domain: (1) AFT/Control Tower + Service Catalog + Permission Boundary, (2) SSM Hybrid + Roles Anywhere + PrivateLink + (MACsec if DX encryption is required), (3) Karpenter + Graviton/Spot + GitOps, (4) EventBridge → Step Functions → Incident Manager. The common pillars (IaC, observability, security aggregation, cost) run through all four domains. Remember that for compound questions the answer is a combination of axes, not a single service.

---

## 📝 12 Integrated Scenario Questions

**Question 1.** A fintech operates 60 AWS accounts. It must automatically deploy the same Config Rule security baseline to all accounts, and it must also be applied automatically to new accounts that join the OU in the future. What is the best combination?

A) An IAM administrator manually configures the same Config Rules in each account's console, using an onboarding checklist to prevent omissions when a new account joins

B) Deploy with AWS Organizations + CloudFormation StackSets Service-Managed (Auto-Deployment Enabled) targeting the OU

C) EventBridge Scheduler triggers a Lambda daily that scans for new accounts and syncs and deploys Config Rules through the API

D) Set up a Config Aggregator in the Audit account to aggregate findings from all accounts into one dashboard and alert on noncompliance

**Answer: B**

Explanation: Service-Managed StackSets integrate with Organizations so AWS manages the execution roles, and they support OU targeting and Auto-Deployment: when a new account joins the OU, the baseline is deployed automatically. "Applied automatically to new accounts too" is always Service-Managed + Auto-Deployment. Manual (A) and scripts (C) risk omissions, and a Config Aggregator (D) only collects findings for viewing; it doesn't deploy Rules.

---

**Question 2.** You want to patch-manage 5,000 servers in a fully internet-isolated data center the same way as EC2. The DC servers must also retrieve Secrets Manager secrets over a private path. What is the best combination?

A) Self-run Ansible + a NAT Gateway to fetch patch metadata from the internet and inject secrets as environment variables

B) SSM Hybrid Activation followed by Patch Manager + an Interface VPC Endpoint (PrivateLink) for Secrets Manager accessed over DX

C) Use the CodeDeploy On-Prem agent to put patch scripts in AppSpec hooks and roll them out to the 5,000 servers

D) A Lambda connects to each server over SSH to run patch commands and passes secrets through Lambda environment variables

**Answer: B**

Explanation: Once DC servers are registered with SSM Hybrid Activation, they become Patch Manager targets like EC2 under mi-xxxx IDs. For Secrets Manager access in an internet-isolated environment, use an Interface VPC Endpoint (PrivateLink) over DX/TGW, so traffic never goes out to the internet (DNS resolved via Route 53 Resolver). Ansible + NAT (A) requires an internet path, CodeDeploy (C) is for deployment and not patch management, and Lambda + SSH (D) requires inbound access, which is unsuitable for a secured environment.

---

**Question 3.** An EKS cluster has very large traffic swings, so minute-level node scaling isn't enough. To dynamically launch diverse instance types and make aggressive use of Spot as well, what should you use?

A) Cluster Autoscaler - predefine ASGs per instance type and scale the matching ASG at minute granularity when pending pods appear

B) Karpenter

C) A Lambda watches CloudWatch metrics and dynamically updates ASG Scheduled Actions to reserve and adjust capacity by time of day

D) Manually configure mixed Spot/On-Demand requests with EC2 Fleet and have operators manage the type pool directly

**Answer: B**

Explanation: Cluster Autoscaler presumes ASGs, works at minute granularity, and has fixed types. Karpenter launches EC2 directly without ASGs, dynamically selects the cheapest well-fitting instance in seconds through bin-packing based on pending pod requirements, and reduces cost with consolidation. "Fast scaling + diverse instances + Spot flexibility" is Karpenter. Scheduled Actions (C) and a manual Fleet (D) are not dynamic scheduling.

---

**Question 4.** What is the currently recommended standard for granting per-pod IAM more simply on a new EKS cluster, without setting up an IRSA OIDC Provider?

A) Combine permissions for all pods onto the node Instance Profile and let pods share those credentials through IMDS

B) Create an IAM User per pod and inject long-term access keys as Kubernetes Secrets

C) EKS Pod Identity

D) Have pods manually call STS GetSessionToken at startup to receive MFA-based temporary credentials and cache them

**Answer: C**

Explanation: EKS Pod Identity directly links namespace/ServiceAccount/Role through the Pod Identity Agent add-on + association without an OIDC setup, and with only `pods.eks.amazonaws.com` in the trust policy, Roles are easy to reuse across multiple clusters. It is the successor standard that simplifies identity. A node profile (A) violates least privilege, and IAM User keys (B) and manual STS (D) are anti-patterns.

---

**Question 5.** GuardDuty detected EC2 instance credential exfiltration (InstanceCredentialExfiltration). Without human intervention it must (1) disable the keys immediately, (2) analyze impact with CloudTrail, and (3) open an incident automatically.

A) Implement key disabling, a CloudTrail query, and incident opening sequentially in a single Lambda function

B) EventBridge → Step Functions (Runbook) → Incident Manager Response Plan

C) Use a Config Auto-Remediation rule to automatically correct the resource settings of the leaked credentials and notify via SNS

D) Set a metric filter on CloudTrail + a CloudWatch alarm to alert the SRE on suspicious API calls

**Answer: B**

Explanation: EventBridge receives the GuardDuty finding and routes it to a Step Functions Runbook, which executes key disabling → a CloudTrail Lake impact query → Incident Manager incident opening in order (with retries and audit guaranteed). A standalone Lambda (A) risks partial execution and lacks audit, Config (C) is for correcting resource settings, and a CloudTrail alarm alone (D) can't execute a response.

---

**Question 6.** You must provide a standard pipeline to 50 microservice teams, where teams can create it themselves (self-service) and must not deviate from the company standard.

A) Keep the pipeline definition in Git with GitOps (Argo CD) and have each team clone the manifest and operate it self-service

B) Run Jenkins centrally and enforce a standard pipeline with per-team folder permissions + a shared library

C) AWS Service Catalog Portfolio + CDK Pipelines template

D) Each team manually writes a CodeCatalyst Blueprint, with the security team reviewing standards compliance via PR every time

**Answer: C**

Explanation: Publishing a vetted CDK Pipelines template in a Service Catalog Portfolio lets developers pick a Product and create a pipeline self-service while still keeping the standard that only approved templates are used (Golden Path). GitOps alone (A) is not a self-service mechanism for pipeline standards, and central Jenkins (B) and manual authoring (D) don't satisfy self-service and standardization at the same time.

---

**Question 7.** You use a Direct Connect 10Gbps connection and regulations require line encryption. What satisfies this with minimal change?

A) Turn on S3 SSE-KMS so transferred data is encrypted with a CMK when stored

B) Enforce TLS 1.3 on all application traffic and add mutual authentication with mTLS

C) Apply MACsec or IPSec over DX

D) Terminate DX and fully replace it with Site-to-Site VPN so the line is encrypted with IPSec tunnels

**Answer: C**

Explanation: DX is a private dedicated line, but it is not encrypted by itself. If line encryption is needed, add MACsec (Layer 2) or IPSec over DX (Layer 3). SSE-KMS (A) is S3 at-rest encryption and TLS (B) is at the application layer, so neither directly meets "line encryption required," and a full VPN replacement (D) is an excessive change that throws away DX's bandwidth and latency advantages.

---

**Question 8.** When an SQS DLQ accumulates, you want to re-drive automatically but must prevent an infinite loop (poison message).

A) Increase the Lambda timeout and memory to allow more processing time and reduce the batch size to spread load

B) Put a short TTL on DLQ messages so old poison messages expire and disappear automatically

C) Record a reprocessing count in the message attributes and, when it exceeds a threshold, stop automatic reprocessing and hand it to a human

D) Wrap the re-drive in a Step Functions Express workflow to add fast retries and state tracking

**Answer: C**

Explanation: Delivery is at-least-once, so the same message can repeat, and exactly-once is theoretically impossible. Recording the retry count in the message attributes and stopping when it exceeds a threshold prevents an infinite loop as a dedup guard ("at-least-once + idempotent = effectively-once"). Timeout (A), TTL (B), and Express (D) don't prevent the infinite loop itself.

---

**Question 9.** SREs must be able to safely run a restricted AWS CLI from a Slack channel.

A) Send commands to a Lambda through a Slack Incoming Webhook, and the Lambda runs the CLI with an assumed Role

B) AWS Chatbot + a restricted IAM Role

C) Store a Slack Bot OAuth token on EC2 and have the bot receive channel commands with that token and run the CLI

D) Share an IAM Identity Center console SSO link in the channel so the SRE clicks it and takes action in the console

**Answer: B**

Explanation: AWS Chatbot lets you run the AWS CLI directly from a Slack/Teams channel within the scope of a restricted IAM Role, diagnosing and acting from chat without opening the console. Webhook + Lambda (A) needs separate permission control for arbitrary command execution, storing an OAuth token (C) is the static-secret anti-pattern, and sharing a Console SSO link (D) is not restricted execution within chat.

---

**Question 10.** There is pressure to cut container workload cost by 30% or more. What is the single best action?

A) Buy a large 1-year or 3-year Compute Savings Plan/Reserved Instance commitment to lower the On-Demand unit price

B) Apply Graviton (arm64) node groups + Spot/Fargate Spot

C) Move the workload to a cheaper Region such as us-east-1 to save on the Regional price difference

D) Switch container logs from CloudWatch to S3 Infrequent Access and shorten the retention period

**Answer: B**

Explanation: Graviton is ARM (RISC) based with power efficiency and AWS's own design, giving a lower unit price and 30-40% savings, and Spot is up to 90% off (prepare for interruptions with PDBs and Topology Spread). The combination is the single best lever for container compute cost. RI alone (A) loses flexibility, and moving Regions (C) and S3 IA (D) are not core levers on the compute unit price.

---

**Question 11.** In an internet-isolated DC with 5,000 servers, how can you give them temporary credentials for AWS API calls using the corporate PKI (X.509 certificates) without placing static access keys on them?

A) Issue IAM User long-term keys, deploy them to each server, and replace them with a rotation script every 90 days

B) IAM Roles Anywhere - register the corporate CA as a Trust Anchor, authenticate with the server certificate, and obtain short-lived STS credentials

C) Integrate the corporate PKI into a Cognito Identity Pool as an OIDC IdP so servers receive temporary credentials

D) Imitate an EC2 Instance Profile by standing up an IMDS proxy in the DC and have servers look up credentials from that endpoint

**Answer: B**

Explanation: IAM Roles Anywhere proves identity with an X.509 certificate from the corporate PKI and receives temporary credentials, so no static keys exist on the server (PKI trust chain RFC 5280, the short-lived credential principle). Long-term keys (A) carry Codecov-style leak risk, Cognito (C) is for app users, and an Instance Profile (D) is EC2-only and can't be used for on-premises DC servers.

---

**Question 12.** An organization runs a mix of EKS (payments) and ECS Fargate (general). It needs manifest changes to roll back automatically with one Git revert, and ECS Fargate needs Canary traffic shifting and instant rollback. What is the standard combination for each?

A) For EKS, operators roll back directly with kubectl apply, and for ECS, gradual replacement with the service's default Rolling Update

B) EKS reconciles manifests with GitOps (Argo CD/Flux) (rollback = git revert), and ECS Fargate uses CodeDeploy Blue/Green + two ALB Target Groups/Listeners

C) Both detect changes with CloudFormation Drift Detection and roll back with update-stack to the previous stack version

D) EKS splits Canary traffic with Lambda Alias weights, and ECS with Route 53 Weighted records

**Answer: B**

Explanation: For EKS, with GitOps making Git the single source of truth, when you git revert a manifest to a previous commit, Argo CD automatically returns the cluster to that state (closed-loop reconciliation). Canary traffic shifting and instant rollback on ECS Fargate require the CodeDeploy controller (`type=CODE_DEPLOY`) + two Target Groups/Listeners on the ALB (default Rolling isn't enough). Manual kubectl and Rolling (A), Drift Detection (C), and Lambda Alias and Route 53 (D) are not the standard for each requirement.

---

## 📌 Today's Summary

There are five key points today. First, Pro scenarios are solved in 5 steps: mark the clues → identify the domain → 2 candidates → trade-off → (if confidence is low) mark and pass; narrowing the solution space instantly through clue recognition (RPD) is the core of time economics. Second, the mappings are: "all accounts/new accounts" = Service-Managed StackSets + Auto-Deployment/Delegated Admin, "no internet" = PrivateLink (+ Resolver), "no static keys" = Roles Anywhere/Pod Identity, "burst + Spot" = Karpenter, "git revert" = GitOps, and "auto remediation" = EventBridge → Step Functions. Third, in compound clues the second clue can be the real differentiator, so mark all the constraints and find the intersection. Fourth, Pro's default is eliminating undifferentiated heavy lifting (preferring managed), with an exception when there is a "keep existing assets / custom control" clue. Fifth, passing is about time management, not accuracy: the habit of passing with Mark for Review and preserving time is decisive.
