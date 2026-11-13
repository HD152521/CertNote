# Day 4 - Full Mock Exam: A Comprehensive Check of the 6 Domains at Real 75-Question Pace

Today is the grand wrap-up of the 16 weeks of study. The real DOP-C02 is an exam of 75 questions (65 scored + 10 unscored) in 180 minutes, and the passing line is 750 out of 1000 points (about 75%). The real value of a mock exam is not the score itself but **three things it reveals**. First, pace (a feel for about 2 minutes 24 seconds per question); second, domain weaknesses (in which area does your accuracy collapse); and third, **trap pattern recognition** (why you were drawn to an attractive wrong answer). The 50 questions in this article reflect the real exam's domain weighting as is, and the explanation of each question digs into not only "why the correct answer is right" but also **"why the wrong answers are attractive traps"**, training the ability to decide by clues after narrowing down to the last 2 in the exam room.

Let's engrave the solving tips once more. (1) **Circle the qualifiers** such as "MOST cost-effective," "LEAST operational overhead," "MINIMUM changes," and "automatically": when two options both work, the qualifier decides the answer. (2) A service name you see for the first time is usually a trap wrong answer. (3) If you agonize for more than 2 minutes, mark it immediately, move on, and come back at the end. (4) No blank answers: even with a 50% chance, always fill in an answer.

## Exam Mechanics - Unscored Questions and the Meaning of the Score Scale

> 🔍 **Going deeper**: In an AWS exam, **10 of the 75 questions are unscored pilot questions** (for collecting statistics for future exams; the test taker does not know which ones are unscored). So you must assume "every question counts toward the score" and solve them all seriously. The score is a **scaled score (100-1000)**, a value in which the raw score (the number correct) is adjusted for the difficulty of the exam version. That is, 750 is not "exactly N of 65 questions" but a statistically adjusted passing line, and getting about **72-75% of the scored questions** right is usually considered the safe zone. The result report shows "meets/does not meet (competency)" for each domain, but domain scores do not directly decide a pass (only the total score decides pass/fail); they are used only to identify weak domains. If you score under 75% on the mock exam, there is still time to reinforce the lacking domains with day1-3.

---

## 📝 Mock Exam: 50 Questions

### Domain 1: SDLC Automation (11 questions)

**Question 1.** You want to provide a standard CI/CD pipeline as self-service to 50 microservice teams while enforcing company standards. What is the most suitable?

A) Publish a CDK Pipelines template in a Service Catalog Portfolio - developers self-serve, and the template is validated and standardized

B) Each team freely configures Jenkins

C) Enforce all standards with GitOps alone

D) Replace the pipeline with Step Functions

**Answer: A**

Explanation: Service Catalog publishes validated templates (Products) as a Portfolio, satisfying "self-service + standards enforcement" (Golden Path) at the same time. Free Jenkins configuration (B) breaks the standards, GitOps alone (C) makes it hard to enforce governance over pipeline creation, and Step Functions (D) is an orchestration tool, not a standard pipeline catalog.

---

**Question 2.** What must be in place when a CodePipeline in the Tooling account deploys cross-account to a Spoke account?

A) IAM User access keys

B) The Spoke's Cross-Account Deploy Role + a Customer Managed KMS Key for the artifact S3 bucket (key policy allows the Spoke to decrypt)

C) VPC Peering

D) A Route 53 record

**Answer: B**

Explanation: A cross-account pipeline needs both (1) a Deploy Role in the Spoke that trusts Tooling and (2) **allowing the Spoke to decrypt in the key policy** of the KMS CMK that encrypts the artifacts. Forgetting KMS is the number 1 trap. IAM keys (A) are a static-key anti-pattern, and VPC Peering (C) and Route 53 (D) have nothing to do with deployment permissions.

---

**Question 3.** You want to deploy a Lambda function in two stages: "send only 50% for 5 minutes, then the remaining 50% if there are no problems."

A) AllAtOnce  B) `Linear10PercentEvery2Minutes`  C) `Canary50Percent5Minutes`  D) Rolling

**Answer: C**

Explanation: "A small portion → everything in 2 stages" is the definition of Canary. Exposing 50% for 5 minutes and then switching is `Canary50Percent5Minutes`. Linear (B) shifts evenly by N% increments, so it is not "two stages," AllAtOnce (A) is not gradual, and Rolling (D) is not a Lambda traffic-shifting method.

---

**Question 4.** You deploy an ECS service with Blue/Green and want to test the new version before switching production traffic.

A) ECS rolling update  B) CodeDeploy + two ALB Listeners (Test/Prod) + two Target Groups  C) Lambda Alias  D) Route 53 Weighted

**Answer: B**

Explanation: ECS Blue/Green is a structure in which CodeDeploy brings up a new Task Set, validates it through the ALB's test listener, and then switches the production listener to the new Target Group. Rolling (A) is not Blue/Green and has no separate test listener. Lambda Alias (C) is for Lambda, and Route 53 Weighted (D) is at the DNS level, so it is not the standard for ECS container traffic shifting.

---

**Question 5.** CodeBuild must access ECR, S3, and Secrets Manager from a private VPC with the internet blocked. What is most appropriate?

A) Go through the internet via a NAT Gateway  B) Private access to each service with VPC Endpoints (PrivateLink)  C) Direct Connect  D) Internet Gateway

**Answer: B**

Explanation: To reach AWS services from a VPC with the internet blocked, VPC Endpoints (Gateway type for S3/DynamoDB, Interface type for ECR/Secrets and so on) are the answer: traffic flows over the AWS private network. NAT (A) and IGW (D) go through the internet, violating the "blocked" requirement, and Direct Connect (C) is for on-premises connectivity.

---

**Question 6.** You want to automatically check code quality and security vulnerabilities when a PR is opened.

A) Lambda trigger only  B) CodeGuru Reviewer + running SAST (Snyk and so on) in CodeBuild  C) Inspector  D) Macie

**Answer: B**

Explanation: Code review at PR time is the combination of CodeGuru Reviewer (automatic comments) and SAST (static analysis) in the build. Inspector (C) is for runtime/image vulnerabilities and Macie (D) is for S3 PII, so neither inspects PR code.

---

**Question 7.** You want to verify at deployment that a container image has not been tampered with since it was built.

A) S3 ACL  B) AWS Signer + ECR Image Signing + Notation verification at deployment  C) IAM Policy  D) KMS encryption

**Answer: B**

Explanation: Proving integrity and provenance is the domain of signing. KMS (D) is encryption (confidentiality), not integrity: the lesson of the SolarWinds supply chain attack. ACLs (A) and IAM (C) are only access control.

---

**Question 8.** You want to automatically block deployments during a production change freeze period (such as year-end).

A) Manual Approval only  B) Integrate SSM Change Calendar as a pipeline gate  C) IAM Deny  D) Manually disable the pipeline

**Answer: B**

Explanation: SSM Change Calendar defines OPEN/CLOSED windows, and the pipeline queries it and blocks automatically during the freeze period. Manual Approval (A) requires a human to block each time, and IAM Deny (C) and manual disabling (D) are not automatic, reusable freeze mechanisms.

---

**Question 9.** You want GitHub Actions to deploy to AWS without static access keys.

A) IAM User keys  B) IAM OIDC Provider + `AssumeRoleWithWebIdentity`  C) IAM Roles Anywhere  D) Cognito

**Answer: B**

Explanation: If you register an IAM OIDC Provider to trust GitHub Actions' OIDC token and allow only a specific repo/branch in the trust policy, it deploys with short-lived STS credentials: static keys removed. Roles Anywhere (C) is for on-premises machines (X.509 certificates), not GitHub Actions, and Cognito (D) is app user authentication.

---

**Question 10.** You want to roll back automatically if the error-rate alarm fires during a Lambda Canary deployment.

A) Roll back directly with EventBridge  B) Link a CloudWatch Alarm to the CodeDeploy deployment (enable alarm-based automatic rollback)  C) Lambda DLQ  D) Step Functions

**Answer: B**

Explanation: CodeDeploy links a CloudWatch Alarm to the deployment, and if the alarm goes into the ALARM state during the deployment it automatically rolls back to the previous version. EventBridge (A) is an entry point and does not have a built-in rollback mechanism, and DLQ (C) and Step Functions (D) are not the standard path for rollback automation.

---

**Question 11.** You want a CodePipeline to run only when a specific path in a monorepo changes and to pass dynamic variables.

A) V1 Source  B) CodePipeline V2 Triggers (filePaths filter) + Variables  C) Lambda Custom Action  D) Manual EventBridge configuration

**Answer: B**

Explanation: Path filters and dynamic variables are CodePipeline V2 features. V1 (A) does not have them. Lambda (C) and manual EventBridge (D) are anti-patterns that reimplement what V2 provides natively.

---

### Domain 2: IaC (9 questions)

**Question 12.** You want to deploy the same security baseline to 60 accounts and apply it automatically to accounts newly entering the OU as well.

A) StackSets Service-Managed + Auto-Deployment (Enabled)  B) Manually run a CDK App per account  C) A Lambda bulk script  D) Manual Terraform apply

**Answer: A**

Explanation: Service-Managed StackSets integrate with Organizations and support OU targeting and Auto-Deployment (automatic inclusion of new accounts). If you see the clue "new accounts automatically," it is always this. Manual/script approaches (B, C, D) risk omissions.

---

**Question 13.** You want to preview which resources will be created, modified, or deleted before applying a CloudFormation change.

A) Drift Detection  B) Change Set  C) Stack Policy  D) Rollback Configuration

**Answer: B**

Explanation: A Change Set shows the impact (create/modify/delete) before applying. Drift Detection (A) detects external changes after the fact, a Stack Policy (C) protects resources, and Rollback Configuration (D) is a rollback setting on failure.

---

**Question 14.** During a CloudFormation stack deployment, you must call an external SaaS API to register a resource.

A) Macro  B) Custom Resource (Lambda-backed)  C) Module  D) Hook

**Answer: B**

Explanation: A Custom Resource uses Lambda to insert arbitrary logic (such as calling an external API) into the CloudFormation lifecycle (Create/Update/Delete). A Macro (A) is template transformation, a Module (C) is a unit of reuse, and a Hook (D) is pre-deployment validation.

---

**Question 15.** You want a CI/CD in which the pipeline itself updates itself as the code changes.

A) Manually edit the pipeline in the console  B) CDK Pipelines (Self-Mutate)  C) CodeBuild only  D) Step Functions

**Answer: B**

Explanation: With CDK Pipelines, the pipeline definition is in code and it updates itself (self-mutate) in the first stage: adding a new stage is reflected by merging code. Manual (A) is not automatic, and CodeBuild only (C) and Step Functions (D) are not self-mutating pipelines.

---

**Question 16.** You want multiple teams to share Terraform State safely and prevent concurrent modification conflicts.

A) Local State  B) S3 backend + DynamoDB state locking + KMS encryption  C) Commit State to CodeCommit  D) Git LFS

**Answer: B**

Explanation: The Terraform remote backend standard is S3 (storage) + DynamoDB (state lock to prevent concurrent apply conflicts) + KMS (encryption). Local (A) cannot be shared, and committing State to Git (C, D) is an anti-pattern with secret exposure and no locking.

---

**Question 17.** You want to rotate RDS credentials automatically every 90 days without the application code having to change.

A) Parameter Store SecureString  B) Secrets Manager + Rotation Lambda  C) Environment variables  D) S3 + KMS

**Answer: B**

Explanation: Only Secrets Manager has built-in automatic rotation (Rotation Lambda). The app looks up by secret ID, so the code is unchanged even when rotation occurs. Parameter Store (A) has no rotation (you bear the burden of implementing it). ENV (C) and S3 (D) lack rotation and auditing.

---

**Question 18.** You want to roll out feature flags gradually and block incorrect configuration values before deployment.

A) Parameter Store  B) AppConfig + Validator (JSON Schema/Lambda) + Deployment Strategy  C) Secrets Manager  D) DynamoDB

**Answer: B**

Explanation: Only AppConfig has built-in Validator (pre-validation), Deployment Strategy (gradual), and CloudWatch Alarm automatic rollback. Note that it is a polling model. The others do not have built-in validation, gradual rollout, or rollback.

---

**Question 19.** You want to manage patching of 5,000 on-premises servers the same way as EC2.

A) Operate Ansible separately  B) Register on-premises servers as Managed Instances with SSM Hybrid Activation + Patch Manager  C) CodeDeploy only  D) Lambda + SSH

**Answer: B**

Explanation: If you register the SSM Agent on on-premises servers with SSM Hybrid Activation, they are managed like EC2 and you use Patch Manager, Run Command, and State Manager in the same way. Ansible (A) is not AWS-integrated management, CodeDeploy only (C) is not patch baseline management, and Lambda + SSH (D) has a large operational burden.

---

**Question 20.** You want to periodically and automatically detect whether resources managed by CloudFormation have been changed externally in the console.

A) Config Rule only  B) Run Drift Detection periodically with an EventBridge Scheduled Rule + notify on results  C) Implement a Lambda diff yourself  D) IAM CloudTrail

**Answer: B**

Explanation: Automatic drift detection is the pattern of running Drift Detection periodically on an EventBridge schedule and notifying on the results (or using Config's drift rules). A custom Lambda implementation (C) is an operational burden, and CloudTrail (D) is an API record, not a drift determination.

---

### Domain 3: Resilience (7 questions)

**Question 21.** Multi-Region DR for a relational DB with an RTO of 1 minute and an RPO of under 1 second.

A) RDS Cross-Region Read Replica  B) Aurora Global Database  C) DynamoDB Streams  D) S3 CRR

**Answer: B**

Explanation: Aurora Global Database provides multi-Region DR with an RPO usually under 1 second and an RTO in the order of minutes. A Cross-Region RR (A) has worse RPO/RTO, DynamoDB (C) is key-value (not SQL), and S3 CRR (D) is object storage.

---

**Question 22.** You need a key-value store that reads and writes simultaneously in two Regions.

A) RDS Multi-AZ  B) DynamoDB Global Tables  C) Aurora  D) ElastiCache

**Answer: B**

Explanation: DynamoDB Global Tables is Active-Active multi-Region key-value (LWW conflict resolution). Multi-AZ (A) is single-Region, Aurora's (C) secondary is read-only, and ElastiCache (D) is a cache.

---

**Question 23.** Provide global users with failover within 1 second and a fixed IP that does not change.

A) Route 53 Failover  B) AWS Global Accelerator  C) CloudFront  D) NLB

**Answer: B**

Explanation: Global Accelerator provides 2 fixed Anycast IPs and ~1-second failover over the AWS backbone (bypassing DNS TTL caching). Route 53 (A) is slow because of DNS caching and the IP changes.

---

**Question 24.** What is the key characteristic of the Pilot Light DR strategy?

A) Equivalent infrastructure always running in both Regions  B) Only the core DB is replicated and the app tier is kept off normally, booted at the time of failure  C) Keeping only backups  D) Active-Active

**Answer: B**

Explanation: Pilot Light means "keep only the pilot flame lit": the core data (DB) is replicated at all times but the app is kept off to lower cost, and at the time of failure the app is booted and scaled (RTO in the tens of minutes). Active-Active (A, D) is a more expensive hot setup, and keeping only backups (C) is Backup & Restore.

---

**Question 25.** You must guarantee replication of S3 objects to another Region with a 15-minute SLA.

A) Default CRR  B) S3 Replication Time Control (RTC)  C) Lifecycle  D) Snowball

**Answer: B**

Explanation: RTC is a feature that adds a 15-minute replication SLA and replication metrics to CRR. Default CRR (A) has no SLA guarantee, Lifecycle (C) is storage transition, and Snowball (D) is offline bulk transfer.

---

**Question 26.** You want to automate DR failover but make sure the failover procedure is not affected by a failure of the primary Region.

A) Put Lambda only in the primary Region  B) Run Route 53/GA Health Check + EventBridge + Step Functions in the DR Region  C) Manual failover  D) Global Accelerator only

**Answer: B**

Explanation: Failover automation (detection → orchestration) must run in the DR Region, not the primary Region that can die (the lesson of the 2021 us-east-1 outage). Lambda in the primary Region (A) is useless if that Region dies, and manual (C) is slow and error-prone.

---

**Question 27.** You want to verify in a controlled way that your resilience design works in a real failure.

A) Synthetics  B) AWS Fault Injection Simulator (FIS)  C) Inspector  D) GuardDuty

**Answer: B**

Explanation: FIS uses chaos engineering to inject failures on purpose and safely controls them with a Stop Condition. Synthetics (A) monitors normal operation, Inspector (C) is vulnerabilities, and GuardDuty (D) is threat detection.

---

### Domain 4: Monitoring/Logging (8 questions)

**Question 28.** Integrate the metrics, logs, and traces of 30 accounts into a single dashboard.

A) Collect with Lambda  B) CloudWatch Cross-Account Observability (OAM, Sink/Link)  C) S3 + Athena  D) Grafana only

**Answer: B**

Explanation: OAM links source accounts (Link) to a monitoring account (Sink) to provide integrated observability through cross-account reads. Lambda collection (A) and Grafana only (D) are an operational burden, and S3 + Athena (C) is not a real-time dashboard.

---

**Question 29.** Publish high-cardinality custom metrics from Lambda in a cost- and performance-efficient way.

A) Repeated PutMetricData  B) Embedded Metric Format (EMF)  C) X-Ray  D) Logs Insights

**Answer: B**

Explanation: EMF embeds metrics in structured logs and CloudWatch extracts them automatically: removing the synchronous PutMetricData (A) reduces latency and cost. X-Ray (C) is tracing and Insights (D) is querying.

---

**Question 30.** Branch container logs to CloudWatch, S3, and OpenSearch at the same time.

A) CloudWatch Agent  B) FireLens (Fluent Bit) → Firehose multi-branch  C) Self-managed Logstash  D) X-Ray

**Answer: B**

Explanation: FireLens (Fluent Bit/Fluentd) is the standard for branching ECS/EKS logs to multiple destinations. The CloudWatch Agent (A) is centered on a single destination, and X-Ray (D) is tracing.

---

**Question 31.** Trace the causality of where requests between microservices slow down.

A) CloudWatch Logs  B) X-Ray (or ADOT)  C) Inspector  D) Detective

**Answer: B**

Explanation: Distributed tracing is X-Ray (AWS-native) or ADOT (OpenTelemetry, vendor-neutral). Logs (A) are individual events and cannot stitch together the path, and Detective (D) is security causality analysis.

---

**Question 32.** Monitor availability by periodically running synthetic tests of API/UI behavior even when there are no users.

A) RUM  B) CloudWatch Synthetics Canary  C) Inspector  D) X-Ray

**Answer: B**

Explanation: A Synthetics Canary sends synthetic requests from a script to monitor availability and latency. RUM (A) is real user data, so it is unsuitable for "even with no users."

---

**Question 33.** Collect page performance and errors of real end users from the browser.

A) Synthetics  B) CloudWatch RUM  C) X-Ray  D) Container Insights

**Answer: B**

Explanation: RUM (Real User Monitoring) collects performance and errors from real users' browsers. Synthetics (A) uses synthetic (fake) requests.

---

**Question 34.** Retain several TB of logs at low cost for the long term and occasionally run large-scale analysis (the cost of Logs Insights is a burden).

A) Retain Logs permanently + Insights  B) Subscription Filter → Firehose → S3 + Athena  C) Lambda export  D) Glue Crawler only

**Answer: B**

Explanation: Logs Insights is billed by the amount scanned, so repeated large queries are expensive. The tiered approach of retaining at low cost in S3 with a Subscription Filter and analyzing with Athena when needed is the answer.

---

**Question 35.** You want managed observability compatible with open-source Prometheus/Grafana.

A) CloudWatch only  B) Amazon Managed Prometheus + Managed Grafana  C) OpenSearch  D) Kinesis

**Answer: B**

Explanation: AMP and AMG are managed services compatible with Prometheus/Grafana, reusing open-source assets. CloudWatch (A) is native, not compatible, and OpenSearch (C) is log search.

---

### Domain 5: Incidents (7 questions)

**Question 36.** What is the standard entry point for automated response to security and operational signals?

A) SNS  B) EventBridge  C) Direct Lambda invocation  D) CloudTrail

**Answer: B**

Explanation: EventBridge is the hub of automated response, providing event pattern filtering, multiple targets, cross-account, and retries. SNS (A) is simple notification fan-out, and CloudTrail (D) is a record.

---

**Question 37.** You are building a complex incident Runbook that needs multiple steps, retries, and an audit trail.

A) Lambda alone  B) Step Functions Standard  C) Express only  D) SSM Run Command

**Answer: B**

Explanation: Step Functions Standard provides multi-step, branching, retries, long execution, and execution history for auditing. Lambda alone (A) has the 15-minute and state-management limits, and Express (C) is for short, high-frequency use (limited audit history).

---

**Question 38.** You want to obtain human approval just before a risky action during an SSM Runbook execution.

A) A separate Approval Stage  B) The `aws:approve` step of SSM Automation  C) Implement your own approval logic in Lambda  D) Step Functions Choice

**Answer: B**

Explanation: The `aws:approve` action of SSM Automation inserts a human approval gate in the middle of a workflow. A custom implementation (C) is unnecessary operational burden, and Choice (D) is branching, not approval.

---

**Question 39.** Safely run limited AWS CLI commands from Slack and receive notifications.

A) Your own Webhook  B) AWS Chatbot + a restricted IAM Role  C) Direct OAuth  D) Direct SSO

**Answer: B**

Explanation: AWS Chatbot integrates with Slack/Teams and runs commands only within the scope of a restricted IAM Role and delivers notifications. A custom Webhook/OAuth (A, C) carries a large security and operational burden.

---

**Question 40.** Automate on-call paging and Post-Incident Analysis when an incident occurs.

A) SNS only  B) AWS Systems Manager Incident Manager  C) Chatbot only  D) External PagerDuty only

**Answer: B**

Explanation: Incident Manager provides Response Plans, escalation, on-call paging, runbook integration, and Post-Incident Analysis. SNS and Chatbot (A, C) are notification only, and external PagerDuty only (D) is a weaker clue compared with an AWS-native integrated solution.

---

**Question 41.** Automatically reprocess (re-drive) SQS DLQ messages while preventing infinite loops.

A) TTL only  B) Set a receive count threshold for messages and, when exceeded, human intervention/isolation  C) Lambda timeout  D) Express SFN

**Answer: B**

Explanation: Preventing runaway automation hinges on a retry count threshold + a human gate when exceeded (preventing runaway automation). TTL (A) or a timeout (C) alone cannot prevent infinite reprocessing.

---

**Question 42.** Receive AWS-side events such as scheduled EC2 maintenance and route the automated response.

A) CloudWatch Alarm  B) EventBridge default bus + AWS Health events  C) Config  D) GuardDuty

**Answer: B**

Explanation: AWS service events (including Health) come into the default event bus and are routed with an EventBridge Rule. An Alarm (A) is a metric threshold, Config (C) is configuration compliance, and GuardDuty (D) is threats.

---

### Domain 6: Security/Compliance (8 questions)

**Question 43.** Enable GuardDuty in 60 accounts and include new accounts automatically.

A) StackSets only  B) Delegated Administrator + Org Auto-Enable  C) Lambda enabling it daily  D) Config Rule

**Answer: B**

Explanation: The GuardDuty multi-account standard is delegating to the Audit account + Auto-Enable (new accounts automatically). StackSets (A) and Lambda (C) have a larger operational burden than native Org integration.

---

**Question 44.** Aggregate Security Hub Findings from all Regions into a single Region.

A) Lambda fan-in  B) Security Hub Region Aggregator  C) S3 export  D) EventBridge fan-in

**Answer: B**

Explanation: A Region Aggregator gathers multi-Region Findings into one Region. Lambda/EventBridge fan-in (A, D) is a reimplementation anti-pattern.

---

**Question 45.** Automatically block an S3 bucket if it becomes public.

A) A daily Lambda check  B) AWS Config Rule (`s3-bucket-public-read-prohibited`) + SSM Document Auto-Remediation  C) S3 Lifecycle  D) GuardDuty

**Answer: B**

Explanation: A Config Rule detects non-compliance and automatically remediates (blocks public access) with an SSM Document. A daily Lambda (A) has delay and operational burden, and Lifecycle (C) and GuardDuty (D) are unrelated.

---

**Question 46.** Automatically collect and report SOC 2 audit evidence (Config, CloudTrail, and SH enabled).

A) CloudTrail Lake only  B) AWS Audit Manager (SOC 2 framework)  C) Config + Athena  D) Macie

**Answer: B**

Explanation: Audit Manager automatically collects evidence per framework and produces an Assessment Report (assuming the source services are enabled). CloudTrail Lake (A) is queryable log storage, not an evidence management framework.

---

**Question 47.** Automatically scan and prioritize software vulnerabilities (CVEs) in EC2, Lambda, and ECR.

A) GuardDuty  B) Amazon Inspector  C) Macie  D) Security Hub

**Answer: B**

Explanation: Inspector scans and prioritizes packages and OS in EC2/Lambda/ECR by matching them against CVEs. GuardDuty (A) is behavior detection, Macie (C) is PII, and Security Hub (D) is aggregation.

---

**Question 48.** Automatically detect and report whether S3 contains PII.

A) Athena regex  B) Amazon Macie  C) Inspector  D) GuardDuty

**Answer: B**

Explanation: Macie classifies and detects PII and sensitive data in S3 objects with ML. Athena regex (A) is an implementation burden, and Inspector (C) and GuardDuty (D) are not data classification.

---

**Question 49.** Verify before deployment whether an IAM policy has the potential for external sharing.

A) IAM Policy Simulator  B) IAM Access Analyzer (external access findings + Custom Policy Checks)  C) Config only  D) Audit Manager

**Answer: B**

Explanation: Access Analyzer finds whether resources are exposed externally and pre-validates policies with Policy Validation and Custom Policy Checks. Simulator (A) is a permission evaluation simulation, not external exposure analysis.

---

**Question 50.** Let on-premises servers call AWS APIs without static access keys.

A) IAM User keys  B) IAM Roles Anywhere (X.509 certificate + Trust Anchor)  C) Cognito  D) STS GetSessionToken

**Answer: B**

Explanation: Roles Anywhere trusts the on-premises server's X.509 certificate through a Trust Anchor and issues short-lived STS credentials: static keys removed. Distinguish CI such as GitHub Actions (OIDC) from on-premises machines (Roles Anywhere). IAM keys (A) are an anti-pattern.

---

## 📊 Weakness Analysis Guide

After grading, calculate the accuracy per domain and decide the final reinforcement areas with the following criteria.

| Accuracy | Verdict | Action |
|--------|------|------|
| 90%+ | Stable | ⭐ Only a light review of key points |
| 75-89% | Passing range | Wrong-answer notebook + recheck trap patterns |
| 60-74% | At risk | Reread the day1-3 narrative of that domain + read the boxes closely |
| <60% | Needs reinforcement | Restudy that Week's main material (starting from concepts) |

> 🎯 **Scenario (a weakness diagnosis example)**: If you keep getting "Inspector vs GuardDuty vs Macie" wrong in Domain 6, it is not simple lack of memorization but **the classification of "what does it look at (the signal source)" has not taken hold**. Review day3's detection service division-of-labor table (behavior/CVE/PII/exposure/causality) again, and train to map immediately by the noun clues in the question (CVE, PII, external exposure, signs of compromise). If you keep getting Canary/Linear wrong in Domain 1, re-engrave the structural difference from day1: "Canary = 2 stages, Linear = even increments." It is efficient to narrow weaknesses down not to "which domain" but to "which conceptual axis."

---

## ⭐ Key Points

1. ⭐ Securing a feel for pace (2 min 24 s per question) is the biggest takeaway: mark anything over 2 minutes immediately.
2. ⭐ You must analyze "why the wrong answers are attractive traps" so that you win after narrowing to 2 in the exam room.
3. ⭐ Qualifiers (MOST/LEAST/cost-effective/automatically) break ties between options.
4. ⭐ For domains with accuracy under 75%, reinforce with the day1-3 narrative before day5.
5. ⭐ Narrow weaknesses down to "conceptual axes" (classification, structure, cost), not domains.

---

## 📌 Today's Summary

1. The real exam is 75 questions (including 10 unscored), 180 minutes, with a passing score of 750 (scaled), and the 50 mock questions here reflect the domain weighting.
2. Analyze the trap reason behind each wrong answer to train the ability to "narrow down to the last 2."
3. Identify weaknesses by per-domain accuracy but narrow them down by "conceptual axis."
4. Intensively reinforce domains under 75% with day1-3 before day5.
5. Next (day5) wraps up with a D-Day checklist and a short final mock.
