# Day 3 - The AWS DevOps Tool Map: The Code* Series and the Real Picture Beyond It

Ask most people "what are the AWS DevOps tools?" and they'll answer "CodeCommit, CodeBuild, CodeDeploy, CodePipeline." That's not wrong, but it's **an answer that misses more than half the picture**. The AWS DevOps ecosystem has more than 30 services spread across every stage of the SDLC, and unless you can see how they interlock on a single map, you can't answer the exam scenario question "which combination of these services is most appropriate?"

Today we draw that map — a tool catalog spanning all of Domains 1 through 6, organized as a flow of "which service is responsible for which capability, where."

## The Birth of the Code* Series — From Jenkins Alternative to Integrated Platform

At re:Invent in November 2014, AWS announced CodeCommit, CodeDeploy, and CodePipeline simultaneously. Until then, AWS had focused on IaaS infrastructure (EC2, S3, RDS), and its stance on CI/CD was that customers should stand up Jenkins on their own. But the demand kept growing — "if we're deploying to AWS anyway, why do we have to run a separate Jenkins server?" — and the answer was the Code* series.

| Service | Launch | Replaces |
|--------|------|-----------|
| CodeDeploy | 2014.11 | Capistrano, Fabric, Ansible |
| CodePipeline | 2015.07 | Jenkins, Bamboo, GoCD |
| CodeCommit | 2015.07 | GitHub Enterprise, GitLab, Bitbucket |
| CodeBuild | 2016.12 | Jenkins agents, Travis CI |
| CodeStar | 2017.04 (now deprecating) | — |
| CodeArtifact | 2020.06 | JFrog Artifactory, Sonatype Nexus |
| CodeGuru | 2020.06 | SonarQube, Snyk |
| CodeCatalyst | 2022.12 | GitHub, GitLab (integrated platform) |

Two patterns are worth noting in this evolution. First, **AWS released the tools for each stage as separate services** (CodeBuild on its own, CodeDeploy on its own). This is the exact opposite of the GitLab/GitHub "everything integrated in one platform" model. Second, with the arrival of CodeCatalyst in 2022, AWS also signaled a move toward an integrated platform. That said, the exam's weight still centers on the decomposed Code* model.

> 💡 **Related theory**: The Unix philosophy of "Do one thing and do it well" is directly reflected in the AWS Code* series. Each service handles one stage only and is loosely coupled to the others via IAM and events. This contrasts with GitHub Actions' "write everything in one yaml" approach. The trade-off: the decomposed Code* model has a steeper learning curve but enables fine-grained IAM control, while the integrated model lets you start fast but makes permission separation hard.

## The Six SDLC Stages and Tool Mapping

```
[ AWS tool map by SDLC stage ]

PLAN     →  CODE      →  BUILD     →  TEST      →  RELEASE     →  DEPLOY      →  OPERATE
 |           |             |             |              |               |               |
Issues      CodeCommit    CodeBuild    CodeBuild      CodePipeline    CodeDeploy      CloudWatch
JIRA/       GitHub        GitHub       Inspector      CodeArtifact    ECS deploy      X-Ray
Linear      GitLab        Actions      CodeGuru       (versioning)    Lambda alias    Systems Manager
            S3 (artifact) Docker       SAST/DAST                      EB/AppRunner    DevOps Guru
                          ECR build                                                   Incident Manager
```

The essentials of each stage:

### Plan
AWS has no issue tracker of its own. Use external tools like JIRA, Linear, or Asana, integrated via EventBridge. CodeCatalyst has its own issue tracker and is closer to the integrated platform model.

### Code (source management)
- **CodeCommit**: Git-compatible managed repository (note: new sign-ups restricted since 2024, with the center of gravity shifting toward GitHub integration)
- **GitHub Actions ↔ AWS OIDC**: The most common modern pattern. Receive a GitHub OIDC token via an IAM Identity Provider and AssumeRole — no static keys needed.
- **GitLab + AWS**: Supports a similar OIDC pattern

### Build
- **CodeBuild**: Managed builds based on buildspec.yml. Define container image builds, unit tests, and static analysis per phase.
- **Amazon EC2 Image Builder**: Automates AMI build pipelines (replaces Packer)
- **ECR**: Container registry + automated vulnerability scanning
- **CodeArtifact**: Private package repository for npm/pip/Maven/NuGet

### Test
- Integrated inside CodeBuild (no separate service)
- **CodeGuru Reviewer**: Automated code review (Java/Python static analysis)
- **CodeGuru Profiler**: Runtime performance profiling
- **Inspector v2**: Automated vulnerability scanning for containers/EC2/Lambda
- **AWS Device Farm**: Automated mobile app testing

### Release
- **CodePipeline**: The orchestrator across all stages. Stage → Action structure.
- **CodeArtifact**: Versioning for build artifacts
- **S3**: Artifact storage (CodePipeline's internal artifact store)

### Deploy
- **CodeDeploy**: Deployment automation for EC2/On-Prem/Lambda/ECS. Based on AppSpec.yml.
- **Elastic Beanstalk**: Full-stack PaaS (Heroku-style)
- **App Runner**: Container PaaS (Cloud Run/Render-style)
- **AWS Proton**: Self-service infrastructure templates (a Platform Engineering tool)

### Operate
- The **CloudWatch** family: Metrics, Logs, Alarms, Dashboards, Synthetics, RUM, Evidently, Insights
- **X-Ray + ADOT**: Distributed tracing
- The **Systems Manager** family: Parameter Store, Run Command, Patch Manager, Session Manager, Automation, AppConfig
- **EventBridge + Chatbot**: Event-driven automation
- **Incident Manager**: Incident response workflows

## Inside CodePipeline — What Action Providers Really Are

CodePipeline is not merely a trigger tool. Internally it has a plugin architecture called the **action provider model**.

```
[ CodePipeline structure ]

Pipeline
  └─ Stage (serial execution)
       ├─ Stage: Source
       │    └─ Action: CodeCommit / S3 / ECR / GitHub
       ├─ Stage: Build
       │    └─ Action: CodeBuild / Jenkins
       ├─ Stage: Test
       │    └─ Action (parallel): CodeBuild / DeviceFarm / 3rd party
       └─ Stage: Deploy
            └─ Action: CodeDeploy / ECS / CFN / Lambda invoke / Step Functions
```

Each Action is one of **three types**:
- **AWS managed**: CodeCommit, CodeBuild, CodeDeploy, etc. (direct connection to AWS services)
- **Custom action**: Define arbitrary work via Lambda invoke
- **3rd party**: GitHub, Jenkins, BlazeMeter, etc. (AWS Marketplace)

Data between Actions is passed as **artifacts**. The Source Action uploads its output to S3 as a zip, the Build Action downloads that zip, processes it, and puts the result back into S3. This S3 bucket is the "pipeline artifact bucket," encrypted with a KMS key.

> 🔍 **Going deeper**: All of a pipeline's artifact passing is S3 PutObject/GetObject calls. So the "handoff time" from one stage to the next is really S3 upload/download time. A large monorepo (e.g., a 500MB monorepo) loses tens of seconds at every stage transition. Fixes: 1) split artifacts into smaller pieces, 2) have the Build Action zip only what the next stage needs, 3) leverage CodeBuild local cache (as a cache, not as an artifact).

> 💡 **Related theory**: The action provider model is essentially the same as Jenkins's plugin model, but **the isolation model differs**. Jenkins plugins run together inside the JVM, so one dying plugin can take down the whole master. CodePipeline actions execute as separate IAM principals, each isolated. The trade-off: CodePipeline wins on security, Jenkins wins on flexibility.

## Inside CodeBuild — A Docker-Based Isolated Environment

For every build, CodeBuild **spins up a Docker container, runs the phases of buildspec.yml**, and destroys the container when finished. This is the core of its isolation and idempotency.

```
[ Lifecycle of a single CodeBuild build ]

1. Trigger (CodePipeline / EventBridge / API)
2. Container provisioning (usually 5-30 seconds)
3. INSTALL phase   → install dependencies
4. PRE_BUILD phase → logins, environment variable setup
5. BUILD phase     → the actual build/tests
6. POST_BUILD phase → artifact cleanup
7. Artifact upload → S3
8. Container destroy
```

Each phase is a sequence of shell commands. If one command fails, that phase fails, and without an `on-failure` option the entire build fails.

> 📚 **Case study**: A company building Docker images with CodeBuild suffered 20-minute builds because the base image was re-pulled every time. Analysis showed the container was destroyed after every build, wiping the Docker layer cache. Fixes: ① store docker layers with S3 cache ② move base images to ECR to avoid Docker Hub pull rate limits ③ enable the local NVMe SSD cache option. Result: build time dropped from 20 minutes to 4.

> ⚠️ **Pitfall**: CodeBuild by default **runs without a dedicated VPC** (it uses an AWS-managed VPC). So to reach an internal package repository (an Artifactory inside your VPC) or RDS, you need a separate VPC configuration plus ENI creation. That ENI creation adds 30-60 seconds to build start time. When the exam gives a "access resources inside a VPC while minimizing build time" scenario, the answer is "VPC configuration + ENI warm-up" or "use a package mirror reachable from outside the VPC."

## Systems Manager — The Most Underrated Weapon in the DevOps Domain

Systems Manager (SSM) is one of the deepest and most frequently tested services on the exam. It is not just "the place where Parameter Store lives."

| Capability | Purpose | DevOps scenario |
|------|------|----------------|
| **Parameter Store** | Store configuration values (hierarchical paths) | Per-env DB connection strings, feature flags |
| **Secrets Manager** | Secrets + automatic rotation (a separate service) | DB password and API key rotation |
| **Run Command** | Execute commands across many EC2 instances | Bulk patching, log collection |
| **Patch Manager** | OS patch automation | Patch baselines, maintenance windows |
| **Session Manager** | Browser-based SSH (no need to open port 22) | Eliminating bastions |
| **State Manager** | Maintain desired state (prevent configuration drift) | "Install the CloudWatch agent on all EC2 instances" |
| **Inventory** | Automatically collect software inventories for EC2/on-premises | Asset management, compliance |
| **Compliance** | Patch + Config unified compliance | Regulatory reports |
| **Automation** | Automated runbook execution | "Restart the ASG on failure" |
| **AppConfig** | Feature flags + gradual rollouts | A/B testing, dark launches |
| **OpsCenter** | Unified operational event workflows | Centralized incident management |
| **Distributor** | Software package distribution | Distributing internal agents |

**SSM Automation** in particular is central to the exam. Nearly every answer in automated incident-recovery scenarios ends with "EventBridge → SSM Automation Runbook."

> 🎯 **Scenario**: If the exam asks for "automatic recovery when an RDS Read Replica's replication lag exceeds 60 seconds," the answer is this combination: ① CloudWatch Alarm (ReplicaLag > 60) ② EventBridge rule (alarm state change) ③ SSM Automation runbook (`AWS-RestartRdsInstance` or custom) ④ notify the ops team via SNS. Every step can be defined as code (JSON/YAML).

## The CloudWatch Family — Not a Single Service but an Ecosystem

CloudWatch is not one service but a **bundle of 10+ sub-services**.

| Sub-service | Purpose |
|------------|------|
| Metrics | Metric collection/storage (custom + AWS-managed) |
| Logs | Log collection (CloudWatch Logs Agent, CloudWatch Agent) |
| Alarms | Metric-based alerting |
| Dashboards | Visualization |
| Logs Insights | Log querying (KQL-like) |
| Synthetics | URL canaries (external monitoring) |
| RUM | Real User Monitoring (JS SDK) |
| Evidently | A/B testing + feature flags (separate from AppConfig) |
| Container Insights | Metrics dedicated to ECS/EKS/Fargate |
| Lambda Insights | Metrics dedicated to Lambda |
| Application Insights | Automatic anomaly detection |
| Contributor Insights | Top-talker analysis |
| ServiceLens | Unified X-Ray + CloudWatch view |

The heart of this ecosystem is **EMF (Embedded Metric Format)**. If a Lambda function or ECS container prints a log in a specific JSON format to stdout, CloudWatch automatically extracts it as a metric. That means you can create custom metrics without any separate CloudWatch API calls.

```json
// EMF format example (printed to stdout)
{
  "_aws": {
    "Timestamp": 1640000000000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp",
      "Dimensions": [["Endpoint"]],
      "Metrics": [{"Name": "Latency", "Unit": "Milliseconds"}]
    }]
  },
  "Endpoint": "/api/users",
  "Latency": 42
}
```

> 🔍 **Going deeper**: EMF's key advantage is that "the metric and the log are stored together as the same data." While querying logs with CloudWatch Logs Insights, if you notice "latency spiked at this moment," you can jump straight to the metric chart of the same data. With no separate metric API calls, cost drops too (no $0.01-per-metric-call — it's folded into logs cost).

## X-Ray vs ADOT — The Two Branches of Distributed Tracing

AWS distributed tracing offers two choices.

**X-Ray**: The AWS-native tracing service. Easy SDK integration and automatic connection to IAM and CloudWatch. The downside: it's not the OpenTelemetry standard, so it's vendor lock-in.

**ADOT (AWS Distro for OpenTelemetry)**: An implementation of the OpenTelemetry standard. Being a CNCF standard, it can send data to Jaeger, Tempo, Grafana, and so on — or to X-Ray.

Keywords for distinguishing them on the exam:
- "Maintain the OpenTelemetry standard" → ADOT
- "Multi-cloud environment" → ADOT
- "AWS-only, easiest way to start" → X-Ray
- "Export data to Jaeger/Tempo" → ADOT

> 💡 **Related theory**: OpenTelemetry is the standard formed in 2019 when OpenTracing (2016) and OpenCensus (Google, 2018) merged under the CNCF. It also incorporates the W3C Trace Context standard (the traceparent header). It is the key standard for reducing cloud vendor lock-in, and AWS is pushing ADOT while not deprecating X-Ray. The exam requires knowing both.

## EventBridge — The Connective Tissue of Automation

EventBridge (formerly CloudWatch Events) is the glue of AWS automation. Over 90 AWS services emit events to EventBridge, which matches those events against rules and delivers them to targets (Lambda, SSM Automation, Step Functions, etc.).

```
[ EventBridge flow ]

Source                Bus               Rule              Target
------                ---               ----              ------
EC2 state change  →  default        →  pattern match  →  Lambda
S3 PutObject      →  custom bus     →  schedule cron  →  SSM Automation
Code* events      →  partner bus    →  archive replay →  Step Functions
SaaS (PagerDuty)  →                                      SNS / SQS
```

Three core patterns:
1. **Event pattern matching**: Filter events with JSON patterns (e.g., `{"source":["aws.ec2"],"detail":{"state":["stopped"]}}`)
2. **Schedule rule**: Periodic execution via cron expressions (CloudWatch Events Cron)
3. **EventBridge Pipes** (2022): Source → (Filter → Enrich → Target) — Kafka-like stream processing

> 📚 **Case study**: A company built a workflow that runs daily at 3 a.m.: RDS snapshot → cross-region copy → automatic deletion after 7 days. Tool combination: ① EventBridge schedule (`cron(0 3 * * ? *)`) → ② Lambda (create snapshot) → ③ Lambda (copy to DR region) → ④ EventBridge rule (snapshot complete) → ⑤ SSM Automation runbook (tag for deletion after 7 days). Everything is defined as code (CDK) and lives in git.

## DevOps Guru — ML-Based Anomaly Detection

AWS DevOps Guru (launched 2020) runs machine learning over CloudWatch metrics to automatically detect anomalies. Even without user-configured alarm thresholds, it automatically discovers "this metric is behaving differently than usual."

On the exam, when the keyword is "which tool automatically detects operational anomalies," the answer is DevOps Guru. Note, however, that its cost is high and real-world adoption is not that widespread (a per-instance monthly fee).

## AWS Proton — A Platform Engineering Tool

Proton is AWS's tool for "internal developer platforms (IDPs)." A platform team defines and registers environment templates (CloudFormation/Terraform), and developers self-service: click "create project" and a standard environment is provisioned automatically. Its exam weight is low, but it can appear because it reflects the Platform Engineering trend.

## Summary — Key Tools by Domain

| Domain | Weight | Key tools |
|--------|------|-----------|
| 1. SDLC Automation | 22% | CodePipeline, CodeBuild, CodeDeploy, CodeCommit, CodeArtifact |
| 2. Configuration Management & IaC | 17% | CloudFormation, CDK, SAM, SSM Parameter Store, AppConfig |
| 3. Resilience | 15% | Route 53, Multi-Region, Aurora Global, DynamoDB Global, Resilience Hub, FIS |
| 4. Monitoring & Logging | 15% | CloudWatch (the whole family), X-Ray, ADOT, OpenSearch |
| 5. Incident & Event Response | 14% | EventBridge, SSM Automation, Chatbot, Incident Manager, Lambda |
| 6. Security & Compliance | 17% | GuardDuty, Security Hub, Config, Inspector, Macie, Audit Manager, IAM |

This table needs to come to mind right before the exam.

## Wrapping Up

Today's picture is simple. **AWS DevOps is an ecosystem of 30+ services**, and the exam asks which combination best fits the scenario. The Code* series is a starting point, not the end. SSM Automation, EventBridge, the CloudWatch family, X-Ray/ADOT, Inspector, Config — all of these are essential vocabulary for solving scenarios.

In the next post we move into multi-account strategy (Organizations, Control Tower, IAM Identity Center). Nearly every scenario on the Professional exam assumes a multi-account environment as a baseline, so without this foundation you can't understand the topics that follow.

---

## 📝 Practice Questions

**Question 1.** What is the mechanism by which one CodePipeline Stage's output is passed to the next Stage?

A) HTTP POST request
B) Zip file handoff via the S3 artifact bucket
C) DynamoDB stream
D) Kafka topic

**Answer: B**
Explanation: Every CodePipeline artifact is **stored as a zip in an S3 bucket**, and the next Stage retrieves it with GetObject. This S3 is the "pipeline artifact bucket," encrypted with a KMS key. For a large monorepo, this S3 upload/download time can exceed the build time itself, so artifact size optimization matters. When the exam asks about the "artifact passing mechanism" or "cross-region pipelines," S3 + KMS is the key.

---

**Question 2.** CodeBuild needs to access an RDS instance inside a VPC. What is the most accurate configuration?

A) CodeBuild always runs inside a VPC, so no extra configuration is needed
B) Specify a VPC configuration on the CodeBuild project + Security Group + Subnet, noting that ENI creation adds 30-60 seconds to build start
C) Expose RDS publicly
D) Access it indirectly through Lambda

**Answer: B**
Explanation: CodeBuild **runs in an AWS-managed VPC by default**. To access internal VPC resources (RDS, Artifactory), you must specify a VPC configuration on the project, and creating the ENI at build start then takes 30-60 seconds. For "VPC-internal access + minimize build time" exam scenarios, the answer is the ENI warm-up pattern or using a mirror reachable from outside the VPC. C is forbidden for security reasons; D is a workaround anti-pattern.

---

**Question 3.** What is the biggest advantage of CloudWatch EMF (Embedded Metric Format)?

A) Reduces Lambda cold starts
B) Creates custom metrics from stdout output alone, cutting cost by eliminating separate API calls
C) Automatic integration with X-Ray
D) Stores metrics in DynamoDB

**Answer: B**
Explanation: EMF is the mechanism by which CloudWatch automatically extracts metrics when you print a specific JSON format to stdout. With no separate PutMetricData API calls: ① cost savings (no per-metric API call charge) ② logs and metrics are aligned on the same timestamp, making debugging easier ③ prevents metric loss in short-lifecycle environments like Lambda/Fargate. When the exam keyword is "cost-efficient custom metrics from Lambda," EMF is the answer.

---

**Question 4.** What is the typical flow of an automated recovery scenario combining SSM Automation with EventBridge?

A) CloudWatch Alarm → EventBridge → SSM Automation Runbook → SNS
B) Lambda → SSM Parameter Store → CloudWatch
C) IAM Role → CodePipeline → CodeDeploy
D) Route 53 → CloudFront → S3

**Answer: A**
Explanation: The standard automated-recovery pattern: ① a CloudWatch Alarm detects a metric-based anomaly ② the alarm state change emits an event to EventBridge ③ an EventBridge rule matches and invokes an SSM Automation Runbook ④ the runbook automatically executes recovery procedures (EC2 restart, ASG scale-out, etc.) ⑤ results are reported to the ops team via SNS. Every step is defined as code (JSON/YAML) and lives in git. Almost all "automated remediation" exam scenarios follow this pattern.

---

**Question 5.** Which of the following is the most accurate match for a scenario where you must choose between X-Ray and ADOT?

A) Multi-cloud environment + maintaining the OpenTelemetry standard → X-Ray
B) AWS-only + fastest way to start → ADOT
C) Export trace data to both Jaeger and X-Ray → ADOT
D) Tracing just one Lambda function → both are identical

**Answer: C**
Explanation: ADOT implements the OpenTelemetry standard, so it can export freely to Jaeger, Tempo, Grafana, and more. Multi-cloud and multi-backend scenarios call for ADOT. X-Ray is AWS-native — the easiest starting point but vendor lock-in. A and B have their matches swapped. D is simply not true — even for the same Lambda, ADOT offers richer export options than X-Ray.

---

**Question 6.** For which scenario is AWS DevOps Guru the best fit?

A) Manual threshold-based alarms
B) Automatically detecting anomalies with machine learning, with no user-configured thresholds needed
C) Cost optimization
D) Simple log search

**Answer: B**
Explanation: DevOps Guru runs ML over CloudWatch metrics to automatically detect anomalies. Even without pre-configured thresholds like "CPU > 80%," it detects "patterns different from usual." Its high cost limits real-world adoption, but the keyword "ML-based operational anomaly detection" always means DevOps Guru. A is CloudWatch Alarms, C is Cost Explorer, D is CloudWatch Logs Insights.

---

**Question 7.** What is the essential reason for using Lambda in a CodePipeline Custom Action?

A) Lambda is the fastest
B) To implement in code arbitrary logic that AWS-managed actions cannot express (e.g., external API calls, custom approval flows)
C) IAM permission separation is easier
D) It is the cheapest

**Answer: B**
Explanation: The essence of a custom action (Lambda invoke) is implementing "**workflows that AWS-managed actions alone cannot express**." Examples: automatically creating external ITSM tickets, custom approval algorithms (checking JIRA status), data transformation. The Lambda calls the PutJobSuccessResult / PutJobFailureResult APIs to report results back to CodePipeline. A, C, and D are secondary benefits, not the essential reason.

---

**Question 8.** Which way of operating CodePipeline best fits the "Pipeline-as-Code" principle?

A) Creating it via GUI in the AWS Console
B) Keeping the pipeline definition in git via CDK / CloudFormation / Terraform
C) Recreating it each time with the AWS CLI
D) Generating it dynamically with Lambda

**Answer: B**
Explanation: The core of Pipeline-as-Code is that "**the pipeline definition itself lives in git as code**." Define it with CDK Pipelines (`@aws-cdk/pipelines`), CloudFormation, or the Terraform aws_codepipeline resource. Changes go through PR + review; rollback is a git revert. A leaves only GUI state, not code (no version control); C is ephemeral; D is dynamic generation, but if the definition doesn't live in git it violates the IaC principle.
