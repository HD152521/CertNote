# Day 4 - Full Exam Scenarios (Domains 1-6 Integrated)

Final review before exam. Today: five scenarios that weave all six domains. Each question has **one constraint word** that signals answer. Solve by mark-domain-narrow-decide in under 2 minutes.

---

## Scenario 1: Global Fintech SaaS, 60 Accounts, Auto-Provision, Zero-Internet DC, No Downtime Deploy

A fintech firm runs 60 accounts via Control Tower, on-prem DC with zero internet, mobile app in production. They need:
- New microservice launch: auto-provision account + pipeline + DC link
- DB change: deploy with zero downtime to 60 DBs simultaneously
- Incident: security breach detected, need remediation + audit within 5min
- Cost: enforce 90-day spend budgets per account

**Signal words**: "60 accounts auto", "zero internet DC", "zero downtime", "within 5min", "enforce budget"

**Step 1: Constraints** → Multi-account (AFT), Hybrid network (PrivateLink + Roles Anywhere), Deployment strategy (Blue/Green), Incident automation (EventBridge + Step Functions), Cost control (Cost Categories + Anomaly Detect).

**Step 2: Domain ID** → Domain 1 (pipeline) + Domain 2 (IaC) + Domain 2 (config) + Domain 3 (deployment) + Domain 5 (incident) + Domain 6 (cost/compliance).

**Step 3: Narrow to two** → (A) AFT + CodePipeline + Direct Connect MACsec + CodeDeploy Blue/Green Lambda Canary + EventBridge + Budget Alerts = all correct. (B) Service Catalog + Jenkins + SSM Hybrid + manual blue-green + Lambda = works but has manual, less managed.

**Step 4: Final decision** → Pro prefers managed. Answer: AFT + CodePipeline + DX + CodeDeploy Canary + EventBridge auto-remediate (Lambda revoke credentials) + Cost Categories + AWS Budgets. Five pillars (IaC via AFT, pipeline via CodePipeline, observability via CloudWatch, security via GuardDuty→EventBridge, cost via Budgets).

---

## Scenario 2: E-Commerce Platform, ECS Fargate Cluster, 50% Cost Cut, 30-sec Failover, Feature Flags

E-commerce platform, ECS on Fargate. Competitor pressure: cut infra cost 50%, keep latency <200ms p99, feature flag gates new checkout flow, canary 5% traffic.

**Signal words**: "50% cost cut", "30-sec failover", "feature flags", "canary 5%"

**Step 1: Constraints** → Cost (Spot + Graviton), Resilience (RTO 30sec), Config (AppConfig feature flags), Deployment (Canary 5%).

**Step 2: Domain ID** → Domain 3 (containers + cost), Domain 3 (resilience), Domain 2 (config), Domain 1 (deployment strategy).

**Step 3: Narrow to two** → (A) Karpenter Spot + Graviton + AppConfig with Lambda validation + CodeDeploy ECS Canary 5% + ALB target group = correct, hits all signals. (B) EC2 ASG Reserved Instances + Parameter Store + manual feature flag toggle + CodeDeploy Rolling = works but no Spot, no Graviton, no 30-sec failover, no validation.

**Step 4: Final decision** → Karpenter Spot Graviton + AppConfig (staged rollout, auto-rollback on alarm) + CodeDeploy Canary 5% (Lambda Alias weighted 95%→5%, ALB shift if alarm clears). RTO 30sec via immediate Spot node spin-up + ALB re-registration. Cost: Spot ~60% discount, Graviton ~25% discount = >50% combined. Automated: feature flag bad value? AppConfig rolls back. Deploy bad? CodeDeploy alarm rolls back.

---

## Scenario 3: Data Warehouse, Quarterly Rebalance, 48h RTO, Cross-Region Failover, Cost Per Query

Data warehouse, batch-heavy (nightly runs), 48h RTO acceptable, cross-region hot standby, cost billed per query.

**Signal words**: "48h RTO", "quarterly rebalance", "cross-region", "cost per query"

**Step 1: Constraints** → Resilience (48h RTO = Pilot Light or Warm Standby, not Active-Active), Cost (Redshift on-demand vs Spectrum, Athena per-query billing).

**Step 2: Domain ID** → Domain 3 (resilience, RTO/RPO), Domain 6 (cost optimization).

**Step 3: Narrow to two** → (A) Redshift primary cluster + cross-region standby with 6-hour sync (manual restore on failover) + Redshift Spectrum queries S3 (per-query cost) = matches 48h RTO + cost-per-query. (B) Redshift Active-Active + EventBridge auto-failover + Redshift RA3 (managed scale) = overkill (cost 3x), RTO <1min (not needed), exceeds budget.

**Step 4: Final decision** → Redshift Pilot Light: primary cluster in us-east-1, standby cluster in us-west-2 running 24/7 (minimal, ~30% cost), automated snapshot sync every 6h. RTO: restore from snapshot + load data ≈ 12h (within 48h acceptable). On failover: switch connection string, Redshift Spectrum queries run against S3 until primary restored. Cost: Spectrum avoids full RA3 management overhead. Quarterly rebalance: ANALYZE tables during maintenance window, maintain statistics for query planner.

---

## Scenario 4: Compliance-Heavy Telco, Audit Trail, Incident Auto-Response, Zero Secrets in Code

Telco regulated by HIPAA/FCC, all code deployed to production, must trace "who changed what when," incident detected (GuardDuty finding) must auto-respond within 2min without human.

**Signal words**: "audit trail", "auto-respond 2min", "zero secrets in code", "regulated"

**Step 1: Constraints** → Security (audit trail, no hardcoded secrets), Incident (auto-respond, MTTR 2min), Compliance (regulated, evidence required).

**Step 2: Domain ID** → Domain 5 (incident response), Domain 6 (security, secrets management, compliance logging).

**Step 3: Narrow to two** → (A) CodePipeline (OIDC + Secrets Manager for creds) + GuardDuty (finding on suspicious API) + EventBridge → Step Functions (Standard, allows Long Wait for human approval gate) + Incident Manager escalate if unresolved → CloudTrail immutable log + Config Rules enforce compliance = fully automated, auditable. (B) Jenkins (hard secrets in environment) + manual incident response + email alerts + local logging = not auditable, slow, hardcoded secrets.

**Step 4: Final decision** → CodePipeline OIDC (no static keys) + Secrets Manager (rotated daily) + SBOM scan (prove supply chain integrity) + GuardDuty monitoring + EventBridge HIGH/CRITICAL finding trigger → Step Functions Standard (long-running, audit trail, human loop if auto-remediation fails) → Lambda auto-revokes credentials, SSM Document patches, no action needed from on-call unless auto-remediate fails (escalate at 2min). CloudTrail protected by S3 MFA Delete + Object Lock (immutable, compliance proof). Regulated firms love this: "show me the evidence" → CloudTrail log proves "this credential was revoked at 14:35:22 UTC, no data was leaked beyond 14:35:27 UTC (5-sec window)."

---

## Scenario 5: Microservices Startup, 20 Services, Single Region, Cost-Conscious, Developer-First CI/CD

Startup: 20 microservices (monorepo), single AWS region (dev budget), need fast feedback to developers (CI should be <5min), cheap (Fargate Spot OK, no reserved capacity).

**Signal words**: "monorepo", "20 services", "single region", "cost", "<5min CI"

**Step 1: Constraints** → Pipeline (monorepo path filter), Cost (Spot, no reserved), Speed (short CI), Deployment (auto-scale on demand).

**Step 2: Domain ID** → Domain 1 (pipeline, V2 filePaths trigger), Domain 3 (cost, containers, Karpenter), Domain 2 (IaC, CDK fast feedback).

**Step 3: Narrow to two** → (A) CodePipeline V2 (filePaths `services/X/**` trigger) + CodeBuild on Fargate (5-min compile+test per service) + ECR push + ECS deploy Canary (Karpenter Spot node) = CI 5min, cost-optimized. (B) Jenkins in EC2 (persistent overhead, no spot scaling) + manual webhook + ECS OnDemand (3x cost) = slower, more expensive.

**Step 4: Final decision** → CodePipeline V2 with filePaths trigger (only changed service's pipeline runs, saves time·cost). CodeBuild with provisioned concurrency off (serverless), runs in VPC with Fargate compute (cheaper than EC2). ECS deploy to Karpenter cluster (auto-spins Spot nodes, parks unused). CDK for IaC (Typescript, familiar to dev team), fast synth+deploy (5min). Cost: Spot 60% discount + Fargate Spot 70% discount = startup-friendly. Feedback: developer pushes to `services/payments/**`, within 2min Pipeline V2 detects, builds, tests; 5min total. Developer sees pass/fail before next commit.

---

## Summary: Five Scenarios, Five Signals

| Scenario | Key Signals | Domains | Answer Keywords |
|---|---|---|---|
| 1. Fintech 60 accounts | "60 accounts", "zero internet", "5min incident" | 1+2+3+5+6 | AFT, CodePipeline, DX MACsec, CodeDeploy Canary, EventBridge, Cost Categories |
| 2. E-Commerce Fargate | "50% cost", "30s failover", "canary 5%", "feature flags" | 1+2+3 | Karpenter Spot, Graviton, AppConfig, CodeDeploy Canary, ALB weight shift |
| 3. Data Warehouse | "48h RTO", "cost per query", "cross-region" | 3+6 | Redshift Pilot Light, Spectrum, 6h sync snapshot |
| 4. Telco Compliance | "audit trail", "2min auto-respond", "zero secrets" | 5+6 | CodePipeline OIDC, Secrets Manager, GuardDuty, Step Functions Standard, EventBridge, CloudTrail MFA Delete |
| 5. Startup Monorepo | "monorepo", "20 services", "<5min CI", "cost" | 1+2+3 | CodePipeline V2 filePaths, CodeBuild Fargate, ECS Karpenter Spot, CDK |

---

## 📝 Practice Questions

### Domain 1: SDLC Automation (11 questions)

**Question 1.** You want to provide a standard CI/CD pipeline to 50 microservice teams in self-service while enforcing company standards. What is the most suitable approach?

A) Publish CDK Pipelines templates in a Service Catalog portfolio — developers get self-service, and the templates are vetted and standardized

B) Let each team configure Jenkins freely

C) Enforce all standards with GitOps alone

D) Replace the pipeline with Step Functions

**Answer: A**

Explanation: Service Catalog publishes vetted templates (products) as a portfolio, satisfying "self-service + enforced standards" (the Golden Path) at the same time. Free Jenkins configuration (B) breaks the standard, GitOps alone (C) makes it hard to enforce governance over pipeline creation, and Step Functions (D) is an orchestration tool, not a catalog of standard pipelines.

---

**Question 2.** What must be in place when a CodePipeline in the Tooling account deploys cross-account to a Spoke account?

A) IAM user access keys

B) A cross-account deploy role in the Spoke + a customer managed KMS key for the artifact S3 bucket (with the key policy allowing the Spoke to decrypt)

C) VPC peering

D) A Route 53 record

**Answer: B**

Explanation: A cross-account pipeline needs both (1) a deploy role in the Spoke that trusts the Tooling account and (2) **the Spoke's decrypt permission in the key policy** of the KMS CMK that encrypts the artifacts. Forgetting KMS is the number-one trap. IAM keys (A) are the static key anti-pattern, and VPC peering (C) and Route 53 (D) have nothing to do with deployment permissions.

---

**Question 3.** You want to deploy a Lambda function in two steps: "send only 50% for 5 minutes, then the remaining 50% if there are no problems."

A) AllAtOnce  B) `Linear10PercentEvery2Minutes`  C) `Canary50Percent5Minutes`  D) Rolling

**Answer: C**

Explanation: "A small percentage → everything in two steps" is the definition of Canary. Exposing 50% for 5 minutes and then switching is `Canary50Percent5Minutes`. Linear (B) is equal increments of N%, so it is not "two steps," AllAtOnce (A) is not gradual, and Rolling (D) is not a Lambda traffic-shifting method.

---

**Question 4.** You want to deploy an ECS service with Blue/Green and test the new version before switching production traffic.

A) ECS rolling update  B) CodeDeploy + two ALB listeners (Test/Prod) + two target groups  C) Lambda alias  D) Route 53 weighted

**Answer: B**

Explanation: ECS Blue/Green is a structure in which CodeDeploy launches a new task set, validates it through the ALB's test listener, and then switches the production listener to the new target group. Rolling (A) is not Blue/Green and has no separate test listener. Lambda aliases (C) are for Lambda, and Route 53 weighted (D) is at the DNS level, so it is not the standard for ECS container traffic shifting.

---

**Question 5.** CodeBuild in a private VPC with internet access blocked must access ECR, S3, and Secrets Manager. What is the most appropriate approach?

A) Go through the internet via a NAT Gateway  B) Private access to each service through VPC endpoints (PrivateLink)  C) Direct Connect  D) Internet Gateway

**Answer: B**

Explanation: To reach AWS services from a VPC with the internet blocked, VPC endpoints (Gateway type for S3/DynamoDB, Interface type for ECR/Secrets and so on) are the answer — traffic flows over the AWS private network. NAT (A) and IGW (D) go through the internet and violate the "blocked" requirement, and Direct Connect (C) is for on-premises connectivity.

---

**Question 6.** You want to automatically check code quality and security vulnerabilities when a PR is opened.

A) A Lambda trigger only  B) CodeGuru Reviewer + running SAST (Snyk and similar) in CodeBuild  C) Inspector  D) Macie

**Answer: B**

Explanation: PR-time code review is a combination of CodeGuru Reviewer (automatic comments) and in-build SAST (static analysis). Inspector (C) covers runtime/image vulnerabilities and Macie (D) covers S3 PII, so neither inspects PR code.

---

**Question 7.** You want to verify at deployment time that a container image has not been tampered with since it was built.

A) S3 ACL  B) AWS Signer + ECR Image Signing + Notation verification at deployment  C) IAM policy  D) KMS encryption

**Answer: B**

Explanation: Proving integrity and provenance is the domain of signing. KMS (D) is encryption (confidentiality), not integrity — the lesson of the SolarWinds supply chain attack. ACLs (A) and IAM (C) are only access control.

---

**Question 8.** You want to automatically block deployments during production change-freeze periods (such as year-end).

A) Manual approval only  B) Integrate SSM Change Calendar as a pipeline gate  C) IAM Deny  D) Manually disable the pipeline

**Answer: B**

Explanation: SSM Change Calendar defines OPEN/CLOSED windows, and the pipeline queries it to block automatically during freeze periods. Manual approval (A) requires a human to block each time, and IAM Deny (C) and manual disabling (D) are not automatic, reusable freeze mechanisms.

---

**Question 9.** You want GitHub Actions to deploy to AWS without static access keys.

A) IAM user keys  B) IAM OIDC provider + `AssumeRoleWithWebIdentity`  C) IAM Roles Anywhere  D) Cognito

**Answer: B**

Explanation: If you register an IAM OIDC provider to trust the GitHub Actions OIDC token and allow only a specific repo/branch in the trust policy, it deploys with short-lived STS credentials — eliminating static keys. Roles Anywhere (C) is for on-premises machines (X.509 certificates), not GitHub Actions, and Cognito (D) is for app user authentication.

---

**Question 10.** You want to roll back automatically if an error-rate alarm fires during a Lambda canary deployment.

A) Roll back directly with EventBridge  B) Integrate a CloudWatch alarm with the CodeDeploy deployment (enable alarm-based automatic rollback)  C) Lambda DLQ  D) Step Functions

**Answer: B**

Explanation: CodeDeploy lets you attach CloudWatch alarms to a deployment, and if an alarm enters the ALARM state during the deployment, it automatically rolls back to the previous version. EventBridge (A) is an entry point and has no built-in rollback mechanism, and a DLQ (C) and Step Functions (D) are not the standard path for rollback automation.

---

**Question 11.** You want to run CodePipeline only when a specific path in a monorepo changes and pass dynamic variables.

A) V1 source  B) CodePipeline V2 triggers (filePaths filter) + variables  C) Lambda custom action  D) Manual EventBridge configuration

**Answer: B**

Explanation: Path filters and dynamic variables are CodePipeline V2 features. V1 (A) does not have them. Lambda (C) and manual EventBridge (D) are anti-patterns that reimplement what V2 provides natively.

---

### Domain 2: IaC (9 questions)

**Question 12.** You want to deploy the same security baseline to 60 accounts and apply it automatically to accounts that newly join the OU.

A) StackSets Service-Managed + Auto-Deployment (Enabled)  B) Manually run a CDK app per account  C) A Lambda batch script  D) Manual Terraform apply

**Answer: A**

Explanation: Service-Managed StackSets integrate with Organizations to support OU targeting and Auto-Deployment (automatically including new accounts). Whenever the clue is "new accounts automatically," it is always this. Manual work/scripts (B, C, D) risk omissions.

---

**Question 13.** You want to preview which resources will be created, modified, or deleted before applying a CloudFormation change.

A) Drift Detection  B) Change set  C) Stack policy  D) Rollback configuration

**Answer: B**

Explanation: A change set previews the impact (create/modify/delete) before applying. Drift Detection (A) detects external changes after the fact, a stack policy (C) protects resources, and a rollback configuration (D) sets up rollback on failure.

---

**Question 14.** During a CloudFormation stack deployment, you must call an external SaaS API to register a resource.

A) Macro  B) Custom resource (Lambda-backed)  C) Module  D) Hook

**Answer: B**

Explanation: A custom resource uses Lambda to insert arbitrary logic (such as an external API call) into the CloudFormation lifecycle (Create/Update/Delete). A macro (A) transforms templates, a module (C) is a reuse unit, and a hook (D) is pre-deployment validation.

---

**Question 15.** You want a CI/CD pipeline that updates itself as the code changes.

A) Manually modify the pipeline in the console  B) CDK Pipelines (self-mutate)  C) CodeBuild only  D) Step Functions

**Answer: B**

Explanation: With CDK Pipelines, the pipeline definition lives in code and it updates itself (self-mutate) in the first stage — adding a new stage is reflected by merging code. Manual changes (A) are not automated, and CodeBuild only (C) and Step Functions (D) are not self-mutating pipelines.

---

**Question 16.** You want multiple teams to share Terraform state safely and prevent concurrent modification conflicts.

A) Local state  B) S3 backend + DynamoDB state locking + KMS encryption  C) Commit the state to CodeCommit  D) Git LFS

**Answer: B**

Explanation: The standard Terraform remote backend is S3 (storage) + DynamoDB (state lock to prevent concurrent apply conflicts) + KMS (encryption). Local state (A) cannot be shared, and committing state to Git (C, D) is an anti-pattern with secret exposure and no locking.

---

**Question 17.** You want to rotate RDS credentials automatically every 90 days without changing application code.

A) Parameter Store SecureString  B) Secrets Manager + rotation Lambda  C) Environment variables  D) S3 + KMS

**Answer: B**

Explanation: Only Secrets Manager has built-in automatic rotation (a rotation Lambda function). The app looks up the secret by ID, so the code does not change even when it rotates. Parameter Store (A) has no rotation (you have to build it yourself). Environment variables (C) and S3 (D) lack rotation and auditing.

---

**Question 18.** You want to roll out feature flags gradually and block incorrect configuration values before deployment.

A) Parameter Store  B) AppConfig + Validator (JSON Schema/Lambda) + Deployment Strategy  C) Secrets Manager  D) DynamoDB

**Answer: B**

Explanation: Only AppConfig has built-in Validators (pre-validation), Deployment Strategies (gradual rollout), and CloudWatch alarm automatic rollback. Note that it is a polling model. The rest have no built-in validation, gradual rollout, or rollback.

---

**Question 19.** You want to patch-manage 5,000 on-premises servers the same way as EC2.

A) Operate Ansible separately  B) Register on-premises servers as managed instances with SSM Hybrid Activation + Patch Manager  C) CodeDeploy only  D) Lambda + SSH

**Answer: B**

Explanation: If you register the SSM Agent on on-premises servers with SSM Hybrid Activation, they are managed like EC2 and use Patch Manager, Run Command, and State Manager in the same way. Ansible (A) is not AWS-integrated management, CodeDeploy only (C) is not patch baseline management, and Lambda + SSH (D) carries a heavy operational burden.

---

**Question 20.** You want to periodically and automatically detect whether resources managed by CloudFormation were changed externally in the console.

A) Config rule only  B) Run Drift Detection periodically with an EventBridge scheduled rule + notify the result  C) Build your own Lambda diff  D) IAM CloudTrail

**Answer: B**

Explanation: Automatic drift detection is a pattern of running Drift Detection periodically on an EventBridge schedule and notifying the result (or using Config's drift rule). Building your own Lambda (C) is an operational burden, and CloudTrail (D) records API calls rather than judging drift.

---

### Domain 3: Resilience (7 questions)

**Question 21.** Multi-Region DR for a relational DB with an RTO of 1 minute and an RPO under 1 second.

A) RDS cross-Region read replica  B) Aurora Global Database  C) DynamoDB Streams  D) S3 CRR

**Answer: B**

Explanation: Aurora Global Database provides multi-Region DR with an RPO typically under 1 second and an RTO of about 1 minute. A cross-Region read replica (A) has a worse RPO/RTO, DynamoDB (C) is key-value (not SQL), and S3 CRR (D) is object storage.

---

**Question 22.** You need a key-value store that is read and written simultaneously in two Regions.

A) RDS Multi-AZ  B) DynamoDB Global Tables  C) Aurora  D) ElastiCache

**Answer: B**

Explanation: DynamoDB Global Tables is an Active-Active multi-Region key-value store (with LWW conflict resolution). Multi-AZ (A) is single-Region, the secondary in Aurora (C) is read-only, and ElastiCache (D) is a cache.

---

**Question 23.** Provide global users with failover within 1 second and fixed IPs that do not change.

A) Route 53 failover  B) AWS Global Accelerator  C) CloudFront  D) NLB

**Answer: B**

Explanation: Global Accelerator provides two static Anycast IPs and about 1-second failover over the AWS backbone (bypassing DNS TTL caching). Route 53 (A) is slow due to DNS caching and the IP changes.

---

**Question 24.** What is the key characteristic of the Pilot Light DR strategy?

A) Equivalent infrastructure always running in both Regions  B) Replicate only the core DB, keep the application tier off normally, and boot it during an outage  C) Keep backups only  D) Active-Active

**Answer: B**

Explanation: Pilot Light means "keep only the pilot flame lit" — core data (the DB) is continuously replicated but the application is kept off to lower cost, and during an outage the application is booted and scaled (RTO in the tens of minutes). Active-Active (A, D) is a more expensive hot setup, and backups only (C) is Backup & Restore.

---

**Question 25.** You must guarantee replication of S3 objects to another Region with a 15-minute SLA.

A) Default CRR  B) S3 Replication Time Control (RTC)  C) Lifecycle  D) Snowball

**Answer: B**

Explanation: RTC adds a 15-minute replication SLA and replication metrics to CRR. Default CRR (A) has no SLA guarantee, Lifecycle (C) is for storage transitions, and Snowball (D) is offline bulk transfer.

---

**Question 26.** You want to automate DR failover while ensuring the failover procedure is not affected by a primary Region outage.

A) Place Lambda only in the primary Region  B) Run Route 53/GA health checks + EventBridge + Step Functions in the DR Region  C) Manual failover  D) Global Accelerator only

**Answer: B**

Explanation: Failover automation (detection to orchestration) must run in the DR Region, not the primary Region that could go down (the lesson of the 2021 us-east-1 outage). Lambda in the primary Region (A) is useless if that Region dies, and manual failover (C) is slow and error-prone.

---

**Question 27.** You want to verify in a controlled way that your resilience design works in a real outage.

A) Synthetics  B) AWS Fault Injection Simulator (FIS)  C) Inspector  D) GuardDuty

**Answer: B**

Explanation: FIS is chaos engineering that deliberately injects failures and keeps them safely controlled with stop conditions. Synthetics (A) monitors normal behavior, Inspector (C) covers vulnerabilities, and GuardDuty (D) is threat detection.

---

### Domain 4: Monitoring/Logging (8 questions)

**Question 28.** Consolidate the metrics, logs, and traces of 30 accounts into a single dashboard.

A) Collect with Lambda  B) CloudWatch cross-account observability (OAM, sink/link)  C) S3 + Athena  D) Grafana only

**Answer: B**

Explanation: OAM links source accounts (links) to a monitoring account (sink) to provide consolidated observability through cross-account reads. Lambda collection (A) and Grafana only (D) are operational burdens, and S3 + Athena (C) is not a real-time dashboard.

---

**Question 29.** Publish high-cardinality custom metrics from Lambda in a cost- and performance-efficient way.

A) Repeated PutMetricData  B) Embedded Metric Format (EMF)  C) X-Ray  D) Logs Insights

**Answer: B**

Explanation: EMF includes metrics in structured logs and CloudWatch extracts them automatically — removing the synchronous PutMetricData (A) reduces latency and cost. X-Ray (C) is for traces and Insights (D) is for queries.

---

**Question 30.** Branch container logs to CloudWatch, S3, and OpenSearch simultaneously.

A) CloudWatch Agent  B) FireLens (Fluent Bit) → Firehose multi-branching  C) Self-managed Logstash  D) X-Ray

**Answer: B**

Explanation: FireLens (Fluent Bit/Fluentd) is the standard for branching ECS/EKS logs to multiple destinations. The CloudWatch Agent (A) is centered on a single destination, and X-Ray (D) is for traces.

---

**Question 31.** Trace causality to find where requests between microservices slow down.

A) CloudWatch Logs  B) X-Ray (or ADOT)  C) Inspector  D) Detective

**Answer: B**

Explanation: Distributed tracing is X-Ray (AWS native) or ADOT (OpenTelemetry, vendor-neutral). Logs (A) are individual events and cannot thread together the path, and Detective (D) is security causality analysis.

---

**Question 32.** Monitor availability by periodically running synthetic tests of API/UI behavior even when there are no users.

A) RUM  B) CloudWatch Synthetics canary  C) Inspector  D) X-Ray

**Answer: B**

Explanation: A Synthetics canary sends synthetic requests from scripts to monitor availability and latency. RUM (A) is real user data, so it is unsuitable for "even without users."

---

**Question 33.** Collect real end users' page performance and errors from the browser.

A) Synthetics  B) CloudWatch RUM  C) X-Ray  D) Container Insights

**Answer: B**

Explanation: RUM (Real User Monitoring) collects performance and errors from real users' browsers. Synthetics (A) uses synthetic (fake) requests.

---

**Question 34.** Retain several TB of logs long-term at low cost with occasional large-scale analysis (Logs Insights cost is a burden).

A) Permanent Logs retention + Insights  B) Subscription Filter → Firehose → S3 + Athena  C) Lambda export  D) Glue crawler only

**Answer: B**

Explanation: Logs Insights is billed by scanned data, so repeated large queries are expensive. The answer is tiering: archive to S3 at low cost with a Subscription Filter and analyze with Athena when needed.

---

**Question 35.** You want managed observability compatible with open-source Prometheus/Grafana.

A) CloudWatch only  B) Amazon Managed Service for Prometheus + Amazon Managed Grafana  C) OpenSearch  D) Kinesis

**Answer: B**

Explanation: AMP and AMG are managed services compatible with Prometheus/Grafana that let you reuse open-source assets. CloudWatch (A) is native rather than compatible, and OpenSearch (C) is for log search.

---

### Domain 5: Incident Response (7 questions)

**Question 36.** What is the standard entry point for automated response to security and operational signals?

A) SNS  B) EventBridge  C) Direct Lambda invocation  D) CloudTrail

**Answer: B**

Explanation: EventBridge is the hub of automated response, providing event pattern filtering, multiple targets, cross-account delivery, and retries. SNS (A) is simple notification fan-out, and CloudTrail (D) is a record.

---

**Question 37.** Build a complex incident runbook that needs multiple steps, retries, and an audit trail.

A) Lambda alone  B) Step Functions Standard  C) Express only  D) SSM Run Command

**Answer: B**

Explanation: Step Functions Standard provides multi-step workflows, branching, retries, long executions, and execution-history auditing. Lambda alone (A) has the 15-minute and state management limits, and Express (C) is for short-lived, high-frequency workloads (limited audit history).

---

**Question 38.** Require human approval just before a risky action during an SSM runbook execution.

A) A separate approval stage  B) The `aws:approve` step in SSM Automation  C) Build your own Lambda approval logic  D) Step Functions Choice

**Answer: B**

Explanation: The `aws:approve` action in SSM Automation inserts a human approval gate in the middle of a workflow. Building your own (C) is unnecessary operational burden, and Choice (D) is branching, not approval.

---

**Question 39.** Safely run restricted AWS CLI commands from Slack and receive notifications.

A) Your own webhook  B) AWS Chatbot + a restricted IAM role  C) Direct OAuth  D) Direct SSO

**Answer: B**

Explanation: AWS Chatbot integrates with Slack/Teams, runs commands only within the scope of a restricted IAM role, and delivers notifications. A custom webhook/OAuth (A, C) has a heavy security and operational burden.

---

**Question 40.** Automate on-call paging and post-incident analysis when an incident occurs.

A) SNS only  B) AWS Systems Manager Incident Manager  C) Chatbot only  D) External PagerDuty only

**Answer: B**

Explanation: Incident Manager provides response plans, escalation, on-call paging, runbook integration, and post-incident analysis. SNS and Chatbot (A, C) are notification only, and external PagerDuty (D) is a weaker fit than an AWS-native integrated solution.

---

**Question 41.** Automatically reprocess (re-drive) SQS DLQ messages while preventing infinite loops.

A) TTL only  B) Set a message receive-count threshold and, when exceeded, hand over to a human/quarantine  C) Lambda timeout  D) Express SFN

**Answer: B**

Explanation: The key to preventing runaway automation is a retry-count threshold plus a human gate when it is exceeded (preventing runaway automation). TTL (A) and a timeout (C) alone cannot stop infinite reprocessing.

---

**Question 42.** Receive AWS-side events such as scheduled EC2 maintenance and route automated responses.

A) CloudWatch alarm  B) EventBridge default bus + AWS Health events  C) Config  D) GuardDuty

**Answer: B**

Explanation: AWS service events (including Health) come into the default event bus and are routed with EventBridge rules. An alarm (A) is a metric threshold, Config (C) is configuration compliance, and GuardDuty (D) is threats.

---

### Domain 6: Security/Compliance (8 questions)

**Question 43.** Enable GuardDuty in 60 accounts and automatically include new accounts as well.

A) StackSets only  B) Delegated Administrator + Org Auto-Enable  C) A Lambda function that enables it daily  D) Config rule

**Answer: B**

Explanation: The multi-account standard for GuardDuty is delegating to the Audit account + Auto-Enable (new accounts automatically). StackSets (A) and Lambda (C) carry a heavier operational burden than native Organizations integration.

---

**Question 44.** Aggregate Security Hub findings from all Regions into a single Region.

A) Lambda fan-in  B) Security Hub Region Aggregator  C) S3 export  D) EventBridge fan-in

**Answer: B**

Explanation: The Region Aggregator gathers multi-Region findings into one Region. Lambda/EventBridge fan-in (A, D) is a reimplementation anti-pattern.

---

**Question 45.** Automatically block an S3 bucket when it becomes public.

A) A Lambda function that checks daily  B) AWS Config rule (`s3-bucket-public-read-prohibited`) + SSM document auto-remediation  C) S3 Lifecycle  D) GuardDuty

**Answer: B**

Explanation: A Config rule detects non-compliance and an SSM document fixes it automatically (blocking public access). A daily Lambda (A) adds delay and operational burden, and Lifecycle (C) and GuardDuty (D) are irrelevant.

---

**Question 46.** Automatically collect and report SOC 2 audit evidence (Config, CloudTrail, and Security Hub are enabled).

A) CloudTrail Lake only  B) AWS Audit Manager (SOC 2 framework)  C) Config + Athena  D) Macie

**Answer: B**

Explanation: Audit Manager automatically collects evidence per framework and creates an assessment report (assuming the source services are enabled). CloudTrail Lake (A) is queryable log storage, not an evidence management framework.

---

**Question 47.** Automatically scan and prioritize software vulnerabilities (CVEs) in EC2, Lambda, and ECR.

A) GuardDuty  B) Amazon Inspector  C) Macie  D) Security Hub

**Answer: B**

Explanation: Inspector scans and prioritizes by comparing packages and the OS of EC2/Lambda/ECR against CVEs. GuardDuty (A) is behavior detection, Macie (C) is PII, and Security Hub (D) is aggregation.

---

**Question 48.** Automatically detect and report whether S3 contains PII.

A) Athena regular expressions  B) Amazon Macie  C) Inspector  D) GuardDuty

**Answer: B**

Explanation: Macie classifies and detects PII and sensitive data in S3 objects using ML. Athena regular expressions (A) are a build-it-yourself burden, and Inspector (C) and GuardDuty (D) are not data classification.

---

**Question 49.** Verify before deployment whether an IAM policy could allow external sharing.

A) IAM Policy Simulator  B) IAM Access Analyzer (external access findings + custom policy checks)  C) Config only  D) Audit Manager

**Answer: B**

Explanation: Access Analyzer discovers whether resources are exposed externally and pre-validates policies with policy validation and custom policy checks. The Simulator (A) simulates permission evaluation and is not external exposure analysis.

---

**Question 50.** Let on-premises servers call AWS APIs without static access keys.

A) IAM user keys  B) IAM Roles Anywhere (X.509 certificate + trust anchor)  C) Cognito  D) STS GetSessionToken

**Answer: B**

Explanation: Roles Anywhere trusts an on-premises server's X.509 certificate through a trust anchor and issues short-lived STS credentials — eliminating static keys. Distinguish them as: CI such as GitHub Actions uses OIDC, and on-premises machines use Roles Anywhere. IAM keys (A) are an anti-pattern.

---

## 📌 Today's Summary

All five scenarios test not an understanding of the six domains but **clue recognition and trade-off judgment**. First, mark the constraint words ("60 accounts", "5 minutes", "zero cost"). Second, domain ID (which part of the question does each domain cover?). Third, narrow to two choices (something that works vs something that works and fits the constraints). Fourth, the Professional bias (managed > self-built). Fifth, compare the two choices (pick one). These 5 steps are the key to solving 75 questions in 2 minutes each.
