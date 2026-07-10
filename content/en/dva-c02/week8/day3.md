# Day 3 - CodePipeline: The Conductor of CI/CD Flow

Once you've built tools for building, testing, and deploying separately, the next problem is "how do I automatically connect these?" Having someone manually press "start testing" each time a build finishes, then "start deployment" each time testing passes, creates the tragedy where someone must stay awake until 3am before production release. CodePipeline is the tool that ends that tragedy. Once you define the flow "source change detection → build → test → approval → deploy," every subsequent code push automatically flows to production without manual intervention.

On the DVA-C02 exam, CodePipeline itself's syntax is not heavily tested. Instead, **how it combines with other Code* services**, **when manual approval becomes necessary**, **how artifacts flow between stages**, and **V2 pipeline's variables and trigger filtering** released in 2023 are the focus points. This article covers CodePipeline's internal operation model, the essence of the artifact system, and cross-account/region patterns.

## CodePipeline's Essence: Workflow Engine, Not Build Tool

CodePipeline is not a build tool. CodeBuild does building, CodeDeploy/CloudFormation/ECS handle deployment. CodePipeline's role is executing those **in order**, **conditionally**, **in parallel** — a workflow engine. If Step Functions serves general business workflows, CodePipeline specializes in CI/CD workflows.

> 💡 **Related theory**: Workflow engine history traces to 1990s BPEL (Business Process Execution Language). "Call multiple systems sequentially/in parallel and decide next steps by result" is the shared root of nearly all workflow tools. CodePipeline simplifies that model for CI/CD — a three-layer structure of Stage (step) → Action (task) → Transition (move). Each Action invokes an external service. GitHub Actions' jobs → steps, GitLab CI's stages → jobs, Jenkins's stages → steps all share the same abstraction.

CodePipeline's data model:

```
Pipeline (entire workflow)
  └── Stage (logical step: Source, Build, Deploy, etc.)
        └── Action (concrete task: run CodeBuild, run CodeDeploy, manual approval)
              ├── Input Artifacts (previous stage output)
              ├── Output Artifacts (this stage output, pass to next)
              ├── Configuration (action-specific parameters)
              └── Role ARN (IAM role this action uses)
```

> 🔍 **Going deeper**: Multiple Actions within one Stage run **in parallel by default**. To force sequential, specify different `runOrder` properties (runOrder 1 → 2 → 3). This appears on exam surprisingly often — "run build and security scan simultaneously in one stage, both must pass before proceeding to next stage" scenarios depend on this.

```json
{
  "name": "BuildAndScan",
  "actions": [
    {
      "name": "Build",
      "runOrder": 1,
      "actionTypeId": { "category": "Build", "provider": "CodeBuild" }
    },
    {
      "name": "SecurityScan",
      "runOrder": 1,    // Same runOrder = parallel
      "actionTypeId": { "category": "Test", "provider": "CodeBuild" }
    },
    {
      "name": "UploadResult",
      "runOrder": 2,    // After above two complete
      "actionTypeId": { "category": "Invoke", "provider": "Lambda" }
    }
  ]
}
```

## Six Action Categories: What Does Each Do?

CodePipeline categorizes actions into six types. Exam occasionally directly asks "which doesn't belong in Source category?" etc.

| Category | Role | Example Provider |
|----------|------|--------------|
| **Source** | Fetch code/artifacts | CodeCommit, GitHub, GitHub Enterprise, BitBucket, S3, ECR, Service Catalog |
| **Build** | Generate build output | CodeBuild, Jenkins, TeamCity |
| **Test** | Run tests | CodeBuild, Device Farm, BlazeMeter, Ghost Inspector |
| **Approval** | Manual approval gate | Manual, ServiceNow Change |
| **Deploy** | Execute deployment | CodeDeploy, CloudFormation, Elastic Beanstalk, ECS, S3, AppConfig, Service Catalog, AWS OpsWorks |
| **Invoke** | Call arbitrary function | Lambda, Step Functions |

> ⚠️ **Trap**: "Invoke" category was added relatively recently (2018 Lambda, 2022 Step Functions). When "I want arbitrary validation logic in pipeline middle" appears on exam, Lambda Invoke is the answer. Simple validation uses Manual Approval (person decides), but "automated validation from external API" uses Lambda Invoke.

> 📚 **Case study**: Capital One announced at re:Invent 2019 automating internal compliance review via Lambda Invoke action. Lambda queries ServiceNow change ticket status before deploy — only proceeds if "approved" status. Eliminates inefficiency of person switching between ServiceNow and CodePipeline consoles.

## Artifacts: How Do Stage Data Flow?

One of CodePipeline's most important concepts is artifacts. Stage A's output becomes Stage B's input, a mechanism based on S3 — a frequent exam focus point.

```
[Source Stage]
   Output Artifact: "SourceOutput"
       │ (zipped to S3 artifact bucket)
       ▼
[Build Stage]
   Input Artifact: "SourceOutput"
       │ (downloaded from S3, unpacked to build working directory)
   Output Artifact: "BuildOutput"
       │ (files from artifacts: section rezipped, stored to S3)
       ▼
[Deploy Stage]
   Input Artifact: "BuildOutput"
```

> 🔍 **Going deeper**: Artifacts store in **one S3 bucket per account/region** (name: `codepipeline-<region>-<random>`). AWS auto-creates on first pipeline, but explicit bucket can be specified. This bucket's access control matters — build outputs (source zip, Docker image metadata) can expose if access isn't restricted. AWS Trusted Advisor's security check frequently flags this bucket under "Amazon S3 Bucket Permissions."

> ⚠️ **Trap**: Artifact bucket **must be same region as pipeline**. Cross-Region deployment requires separate artifact buckets per region; CodePipeline replicates automatically. Without knowing this, trying to "reference us-east-1 artifact directly in ap-northeast-2 deploy" fails.

```yaml
# Cross-Region deployment artifact bucket config (CloudFormation excerpt)
Pipeline:
  Type: AWS::CodePipeline::Pipeline
  Properties:
    ArtifactStores:
      - Region: us-east-1
        ArtifactStore:
          Type: S3
          Location: !Ref PrimaryArtifactBucket
      - Region: ap-northeast-2
        ArtifactStore:
          Type: S3
          Location: !Ref SeoulArtifactBucket   # Seoul region separate bucket
```

## Triggers: Four Ways Pipeline Starts

How CodePipeline triggers is frequently confusing. Four methods with different recommended usage and latency.

| Method | Latency | Recommended For | Exam Keyword |
|--------|---------|-------------|-------------|
| **EventBridge** (AWS sources default) | Seconds | CodeCommit, ECR, S3 changes | "Immediate auto-start" |
| **GitHub Webhook** | Seconds | GitHub push | "GitHub integration" |
| **Polling** | Max 1 minute | Legacy, non-recommended | "Polling non-recommended" |
| **Manual/CLI** | Immediate | Debugging, hotfixes | "Manual restart" |

> 💡 **Related theory**: Pre-2019, CodePipeline defaulted to polling (check S3/GitHub for changes every minute). AWS switched to EventBridge push model for ① latency reduction ② API cost savings ③ GitHub rate limit avoidance. Polling still works but explicitly non-recommended. When "most efficient trigger" appears on exam, EventBridge is the answer.

## CodePipeline V2: Variables, Trigger Filtering, Execution Mode

October 2023 V2 release addressed V1's core limitations. Biggest V1 inconveniences: ① no dynamic variable passing between stages ② all pushes trigger pipeline ③ poor concurrent execution control. V2 solved all three.

### 1. Variables (Pipeline Variables)

```yaml
# Define variables at pipeline start
variables:
  - name: Environment
    defaultValue: dev
    description: "Target environment"
  - name: ImageTag
    defaultValue: latest

# Usage
configuration:
  ProjectName: my-build
  EnvironmentVariables: |
    [{"name":"ENV","value":"#{variables.Environment}","type":"PLAINTEXT"}]
```

Additionally, stage action variables can be referenced in other stages:

```
Source action output: #{SourceVariables.CommitId}
Build action output:  #{BuildVariables.IMAGE_TAG}     (CodeBuild's exported-variables)
```

> 🔍 **Going deeper**: `#{SourceVariables.CommitId}` was possible in V1 but only from some sources. V2 gives all actions consistent variable model. Common pattern: build's exported-variables automatically flow to deploy stage — build-time IMAGE_TAG dynamically injected into ECS task definition.

### 2. Trigger Filtering

V1: any push triggered pipeline. V2: filter by branch/file pattern.

```yaml
triggers:
  - providerType: CodeStarSourceConnection
    gitConfiguration:
      sourceActionName: Source
      push:
        - branches:
            includes: ["main", "release/**"]
            excludes: ["release/experimental"]
          filePaths:
            includes: ["src/**", "package.json"]
            excludes: ["docs/**", "**/*.md"]
        - tags:
            includes: ["v*.*.*"]
```

> ⚠️ **Trap**: Trigger filtering works only with V2 + CodeStar Source Connection (GitHub, BitBucket, GitLab). CodeCommit sources don't support it. When "CodeCommit + specific branch only trigger" appears on exam, the answer is EventBridge rule filtering, not pipeline trigger filtering.

### 3. Execution Mode

```yaml
executionMode: SUPERSEDED    # Default. New run cancels waiting prior runs
# or
executionMode: QUEUED        # Run incoming executions one at a time
# or
executionMode: PARALLEL      # Multiple runs proceed simultaneously
```

> 📚 **Case study**: PARALLEL mode (released 2024) is useful validating multiple PRs simultaneously in monorepo. Caveat: if deploy stage touches same resource (e.g., same ECS service), race condition happens. Common pattern: separate deploy as second pipeline with SUPERSEDED mode, keep Source/Build/Test with PARALLEL.

## Manual Approval: When Person Becomes Final Gate

Automation is powerful, but production deploy sometimes needs human eyes. Compliance requirements, change management approval, business-hours-only deployment, etc.

```yaml
- name: ProductionApproval
  actions:
    - name: Approve
      actionTypeId:
        category: Approval
        owner: AWS
        provider: Manual
      configuration:
        NotificationArn: arn:aws:sns:ap-northeast-2:111122223333:approvals
        CustomData: "Please review staging environment at https://staging.example.com"
        ExternalEntityLink: "https://staging.example.com"
```

Approval mechanism details:

- IAM `codepipeline:PutApprovalResult` permission required to approve
- SNS notification includes approval URL (console-specific deep link)
- **Auto-reject if no response within 7 days** (timeout)
- Rejection marks stage Failed, skips subsequent stages

> 🔍 **Going deeper**: Manual Approval's 7-day timeout is immutable hard limit. For shorter/longer timeout, use EventBridge monitoring "STARTED" state → Lambda calling auto-reject N hours later, or approval action polling external system (JIRA, ServiceNow) status.

> ⚠️ **Trap**: Can IAM user approving their own change? **Basically yes by default**, but `aws:userId` condition can enforce "approver must differ from changer" (separation of duties). Enterprise compliance usually grants approval rights only to separate group (release manager).

## Cross-Account/Region Pattern: Multiaccount Org Standard

As enterprises grow, dev/staging/prod accounts split, with access control separated. For CodePipeline to cross-account manipulate resources, explicit permission chain required.

```
[Source Account: 111111111111]
  - CodePipeline execution
  - Artifact bucket
  - KMS CMK (enable cross-account use)

[Target Account: 222222222222 (prod)]
  - CrossAccountDeployRole (trusts Source account)
  - CodeDeploy / CloudFormation for actual deploy

[Source Pipeline] →
   Assume CrossAccountDeployRole (STS) →
   [Perform deploy in Target account]
```

Required configuration:

1. **Source account**: Pipeline service role has `sts:AssumeRole` permission for Target account role
2. **Target account**: CrossAccountDeployRole trust policy lists Source account
3. **KMS CMK**: Key Policy grants both accounts permission (artifact requires encryption for cross-account passing)
4. **S3 Artifact Bucket**: Bucket policy grants Target account read

> 💡 **Related theory**: This pattern is part of AWS's "Well-Architected Multi-Account Strategy." Post-Control Tower (2019), standardized at org level, combined with Organizations' SCP. Core philosophy: "separate permissions at account boundary, automate via IAM cross-account role explicit delegation."

> 📚 **Case study**: AWS re:Invent 2022 session DOP312, Liberty Mutual operates 350+ AWS accounts, unified all application deployments from single source account via CodePipeline cross-account. Key insight: "account boundary limits blast radius, role chain keeps automation."

## EventBridge Integration: Pipeline State as External Stream

All CodePipeline state changes (start, stage advance, success, failure) auto-publish to EventBridge. Standard hook for notifications, metrics, automation.

```json
{
  "source": ["aws.codepipeline"],
  "detail-type": [
    "CodePipeline Pipeline Execution State Change",
    "CodePipeline Stage Execution State Change",
    "CodePipeline Action Execution State Change"
  ],
  "detail": {
    "state": ["FAILED"]
  }
}
```

Patterns this enables:

- Failure → Slack via AWS Chatbot
- Failure → Auto-create JIRA incident (Lambda → JIRA API)
- All prod deployments → Security audit S3 (Firehose)
- Daily pipeline success rate metric (CloudWatch Custom Metric)

> 🔍 **Going deeper**: CodeStar Notifications wraps friendlier UI over EventBridge. If goal is "Slack/Chime notification," CodeStar Notifications is faster. For "complex conditional automation," direct EventBridge rules more flexible. When "Slack alert + minimum setup," CodeStar Notifications wins. When "JIRA ticket on failure," EventBridge + Lambda.

## Pipeline-as-Code: Manage via CloudFormation/CDK

Pipeline itself is best managed as code. Console-created pipelines are hard to replicate across environments, lose change history.

```python
# AWS CDK example (Python)
from aws_cdk import (
    Stack, aws_codepipeline as codepipeline,
    aws_codepipeline_actions as actions,
    aws_codebuild as codebuild,
)

class PipelineStack(Stack):
    def __init__(self, scope, id, **kwargs):
        super().__init__(scope, id, **kwargs)

        source_output = codepipeline.Artifact()
        build_output = codepipeline.Artifact()

        pipeline = codepipeline.Pipeline(self, "MyPipeline",
            pipeline_name="my-app",
            stages=[
                codepipeline.StageProps(
                    stage_name="Source",
                    actions=[actions.CodeCommitSourceAction(
                        action_name="Source",
                        repository=repo,
                        output=source_output,
                        branch="main",
                    )]
                ),
                codepipeline.StageProps(
                    stage_name="Build",
                    actions=[actions.CodeBuildAction(
                        action_name="Build",
                        project=build_project,
                        input=source_output,
                        outputs=[build_output],
                    )]
                ),
                codepipeline.StageProps(
                    stage_name="Deploy",
                    actions=[actions.CloudFormationCreateUpdateStackAction(
                        action_name="DeployInfra",
                        stack_name="my-app-infra",
                        template_path=build_output.at_path("template.yaml"),
                        admin_permissions=False,
                    )]
                ),
            ]
        )
```

> 💡 **Related theory**: "Pipeline-as-Code" is part of GitOps philosophy. Weaveworks proposed 2017: "keep desired state of operations environment in git, auto-reconcile difference from actual state." CodePipeline is the actuator in that reconciliation loop. ArgoCD/Flux play the same role in K8s.

## Wrapping Up

CodePipeline doesn't build or deploy directly. It's merely the conductor calling other tools in set order/conditions. That simple role's importance: "define release steps once, humans unnecessary thereafter" — that promise becomes possible. V2's variables and trigger filtering extend that promise to more sophisticated workflows.

Next article covers the final safety net of automated pipeline — **CloudFormation's Change Set and drift detection**. How to validate infrastructure matches code, and how to preview code changes' production impact beforehand.

---

## 📝 연습 문제

**문제 1.** In one CodePipeline stage, two actions (build and security scan) should run in parallel. To achieve this, what's needed?

A) Place two actions in separate stages
B) Set both actions' runOrder to same value (e.g., 1)
C) Set actions' runOrder to different values (1, 2)
D) Separate into different pipelines

**정답: B**

해설: Actions in same stage with identical `runOrder` run in parallel. Different runOrder means sequential (lower first). A) Separate stages always sequential. C) runOrder 1 then 2 = sequential. D) Separate pipelines are independent runs — doesn't solve parallel gate problem. When "parallel within stage" is keyword, runOrder matching is the answer.

---

**문제 2.** How does artifact (build output) pass between CodePipeline stages?

A) Direct memory transfer
B) Per-account/region one S3 artifact bucket, zip-stored, next stage downloads
C) DynamoDB stream
D) AWS Step Functions state object

**정답: B**

해설: CodePipeline zips each action's output artifact and stores to S3 artifact bucket, next action downloads as input. Bucket auto-created pipeline creation but explicit possible. This mechanism means ① artifact security (bucket policy, KMS) matters ② cross-region deploy needs separate buckets per region. A/C/D mechanisms themselves wrong. Frequent exam question.

---

**문제 3.** Which statement about CodePipeline V2 **trigger filtering** is correct?

A) CodeCommit source supports branch pattern filtering
B) GitHub source (CodeStar Source Connection) supports branch/file/tag pattern filtering
C) S3 source supports object path filtering
D) ECR source supports image tag filtering

**정답: B**

해설: V2 trigger filtering only for **CodeStar Source Connection sources** (GitHub, GitLab, BitBucket). Branch (includes/excludes), file path (includes/excludes), tag patterns supported. A) CodeCommit needs EventBridge rule filtering (no direct pipeline trigger filter support). C) S3 detects object changes, path pattern via EventBridge. D) ECR via EventBridge too. When "V2 trigger filtering + monorepo," GitHub source + file path is answer.

---

**문제 4.** To enforce **person approval before production CodeDeploy deploy**, what's the best configuration?

A) Lambda Invoke action sending Slack, auto-proceed
B) Manual Approval category action with SNS topic notification
C) CloudWatch Alarm based auto-stop
D) EventBridge rule querying external system

**정답: B**

해설: Manual Approval precisely for "person decision before production." SNS notifies approver, approver responds via console/CLI with PutApprovalResult. 7-day auto-reject if no response. A) Slack message doesn't enforce person approval gate. C) Alarm is auto-stop, not person decision. D) External query possible but manual approval is standard. When "person approval gate," Manual Approval is always standard answer.

---

**문제 5.** Source account CodePipeline **deploying to different AWS account's ECS service**. Which is NOT mandatory?

A) Target account has IAM Role trusting Source account
B) Source account pipeline role has sts:AssumeRole permission for Target role
C) Artifact S3 bucket KMS CMK cross-account Key Policy setup
D) ECS container has CodeDeploy Agent installed

**정답: D**

해설: ECS doesn't need CodeDeploy Agent — ECS service handles task definition change. Cross-Account deploy essentials: A) Target's cross-account role B) Source's AssumeRole permission C) CMK cross-account policy (KMS encrypts artifact). Plus artifact bucket policy Target read. D) is EC2-only. "ECS + Agent" is always trap on exam.

---

**문제 6.** To alert Slack on pipeline failure, best configuration?

A) EventBridge rule FAILED detection → SNS → email → person copy-paste to Slack
B) CodeStar Notifications + AWS Chatbot Slack integration
C) Direct Slack URL registration in pipeline console
D) CloudTrail logs queried by CloudWatch Logs Insight every 5 min

**정답: B**

해설: CodeStar Notifications pre-connected to AWS Chatbot, Chatbot natively integrates Slack/Chime. Rich card message to channel without Lambda. A) Email then manual copy-paste to Slack. C) No such console option. D) Polling approach very inefficient. When "minimum setup + Slack," CodeStar Notifications + Chatbot is standard.

---

**문题 7.** CodePipeline V2 **execution mode** where new run auto-cancels waiting prior run?

A) QUEUED
B) PARALLEL
C) SUPERSEDED
D) BLOCKING

**정答: C**

해説: SUPERSEDED is V1 default behavior, named explicitly in V2. Cancels intermediate runs when fast pushes happen — only latest matters, saves resources. QUEUED processes all (no cancellation), PARALLEL all simultaneous. BLOCKING doesn't exist. When "execution mode" keyword appears, SUPERSEDED/QUEUED/PARALLEL trio is answer source.
