# Day 4 - Dynamic Pipeline: V2 Variable System, Trigger Filters, and Execution Mode Design

Deploy the same codebase to different environments (staging, prod). Dozens of microservices live in single repository, and each service change must trigger only that service's pipeline. Multiple PRs proceed simultaneously but each PR's build shouldn't cancel another's. These three requirements need complex workarounds with V1 CodePipeline. V2 supports all three natively: input variable system, trigger filters, and Execution Mode respectively.

Today we understand why V2's dynamic pipeline features were designed this way, and in what situation to use which feature with concrete scenarios.

> 💡 **Related theory**: V1 to V2 transition is not merely feature addition but philosophy shift. V1 pipeline is "fixed workflow"—same code, same environment, same execution method. V2 is "parameterized workflow"—same pipeline definition executes with different input values. This difference resembles software design's **Template Method Pattern**. If V1 is Concrete Class, V2 is Abstract Class—receives variable injection to express diverse behavior. This direction aligns with Infrastructure as Code's evolution: Terraform's `variable`, Helm's `values.yaml`, CDK's `Props` all share this philosophy. Difference is CodePipeline variables determined at pipeline runtime—each execution has independent variable values.

## V2 Variable System: Parameterizing the Pipeline

**Input Variables (Pipeline Variables)** are values injected externally at pipeline execution start. Use same pipeline with `Environment=staging` and `Environment=prod` to deploy to different environments separately.

```json
{
  "name": "checkout-pipeline",
  "pipelineType": "V2",
  "variables": [
    {
      "name": "Environment",
      "defaultValue": "staging",
      "description": "Target deployment environment",
      "allowedPattern": "^(staging|prod)$"
    },
    {
      "name": "Reason",
      "defaultValue": "",
      "description": "Deployment reason (for audit log)"
    },
    {
      "name": "SkipTests",
      "defaultValue": "false",
      "description": "Skip integration tests (emergency use)",
      "allowedPattern": "^(true|false)$"
    }
  ]
}
```

Injecting variables at execution:
```bash
# Staging deploy (auto-trigger default)
aws codepipeline start-pipeline-execution \
  --name checkout-pipeline

# Production deploy (manual execution)
aws codepipeline start-pipeline-execution \
  --name checkout-pipeline \
  --variables \
    name=Environment,value=prod \
    name=Reason,value="Hotfix for checkout failure"
```

**Action Variables (Action Output Variables)** are values automatically exposed by each Action.

| Action Type | Variable | Reference Format |
|---|---|---|
| Source (CodeStar/GitHub) | CommitId, BranchName, CommitMessage, FullRepositoryName | `#{SourceVariables.CommitId}` |
| Source (ECR) | ImageDigest, ImageTag, ImageURI, RegistryId, RepositoryName | `#{SourceVariables.ImageTag}` |
| Source (S3) | ETag, VersionId | `#{SourceVariables.VersionId}` |
| Build (CodeBuild) | All variables defined in exported-variables | `#{BuildVariables.IMAGE_TAG}` |
| CloudFormation | StackName | `#{DeployVariables.StackName}` |
| Lambda Invoke | Values sent in outputVariables | `#{LambdaAction.SMOKE_STATUS}` |
| Step Functions | None (execution ARN only) | - |

**Meta variables**:
- `#{codepipeline.PipelineExecutionId}` — current execution UUID
- `#{codepipeline.PipelineName}` — pipeline name
- `#{codepipeline.PipelineVersion}` — pipeline version

```yaml
# buildspec.yml — exported-variables usage
version: 0.2

env:
  exported-variables:
    - IMAGE_TAG
    - IMAGE_URI
    - BUILD_TIMESTAMP
    - CHANGELOG_URL

phases:
  pre_build:
    commands:
      - export IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
      - export IMAGE_URI="${ECR_REGISTRY}/checkout:${IMAGE_TAG}"
      - export BUILD_TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
  build:
    commands:
      - docker build -t $IMAGE_URI .
  post_build:
    commands:
      - docker push $IMAGE_URI
      - export CHANGELOG_URL="https://github.com/my-org/checkout/compare/${BEFORE_SHA}...${IMAGE_TAG}"
      - printf '[{"name":"web","imageUri":"%s"}]' "$IMAGE_URI" > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
    - cloudformation/template.yaml
```

Referencing variables in Deploy Action:
```json
{
  "configuration": {
    "StackName": "checkout-#{variables.Environment}",
    "ParameterOverrides": "{\"ImageTag\": \"#{BuildVariables.IMAGE_TAG}\", \"DeployTimestamp\": \"#{BuildVariables.BUILD_TIMESTAMP}\"}",
    "Tags": "[{\"Key\":\"CommitId\",\"Value\":\"#{SourceVariables.CommitId}\"},{\"Key\":\"Pipeline\",\"Value\":\"#{codepipeline.PipelineName}\"}]"
  }
}
```

> 💡 **Related theory**: V2 variable system is **Data Binding** pattern. In Declarative programming, expressing "variable X will be determined later" is standard approach. Terraform's `var.environment`, Helm's `{{ .Values.image.tag }}`, CloudFormation's `!Ref` parameter all share identical concept. Difference is CodePipeline variables determined at pipeline runtime—each execution has independent variable values. Particularly, Action Output Variables explicitly express data flow within pipeline. "Build creates IMAGE_TAG, Deploy uses it" dependency becomes clear in code. This is meaning of "Dynamic Pipeline."

> ⚠️ **Pitfall**: Variable with `allowedPattern` fails immediately at execution start if value doesn't match. Setting `^(staging|prod)$` and providing `"production"` prevents execution start. Also, Action Output Variables' Namespace defined by Action configuration's `namespace` field, and this name used in `#{Namespace.VARIABLE}` format. Using default Namespace doesn't use Action name as Namespace, so explicitly setting Namespace is good practice.

## Trigger Filters: Monorepo Answer

Without trigger filter in monorepo, one developer modifying Readme triggers all microservice pipelines. V2 trigger filter solves this.

```json
{
  "triggers": [
    {
      "providerType": "CodeStarSourceConnection",
      "gitConfiguration": {
        "sourceActionName": "Source",
        "push": [
          {
            "branches": {
              "includes": ["main", "release/*"],
              "excludes": ["release/2020-*", "release/2021-*"]
            },
            "filePaths": {
              "includes": [
                "services/checkout/**",
                "shared/lib/**",
                "shared/proto/**"
              ],
              "excludes": [
                "services/checkout/docs/**",
                "services/checkout/**/*.md",
                "services/checkout/**/*.txt"
              ]
            }
          },
          {
            "tags": {
              "includes": ["v*.*.*", "release-*"],
              "excludes": ["v*.*.*-beta"]
            }
          }
        ],
        "pullRequest": [
          {
            "events": ["OPEN", "UPDATED", "CLOSED"],
            "branches": {
              "includes": ["main"]
            },
            "filePaths": {
              "includes": ["services/checkout/**"]
            }
          }
        ]
      }
    }
  ]
}
```

**Monorepo service-per-pipeline pattern**:

```
my-org/services-monorepo/
├── services/
│   ├── checkout/          ← checkout-pipeline triggers
│   ├── inventory/         ← inventory-pipeline triggers
│   ├── notifications/     ← notifications-pipeline triggers
│   └── payment/           ← payment-pipeline triggers
├── shared/
│   ├── lib/               ← shared library (all pipelines trigger)
│   └── proto/             ← Protobuf definition (all pipelines trigger)
└── infrastructure/        ← infra-pipeline triggers
    ├── terraform/
    └── cloudformation/
```

checkout-pipeline trigger config:
```json
"filePaths": {
  "includes": ["services/checkout/**", "shared/lib/**", "shared/proto/**"]
}
```

When `shared/lib/` changes, four service pipelines start simultaneously. Each pipeline is independent, so run in parallel without affecting each other.

> 🔍 **Deeper**: Trigger filter internal implementation resembles git's `diff --name-only`. Changed file list from push event is glob-matched against filter patterns. Internally, EventBridge Pipes handles GitHub Webhook → EventBridge Event → filter evaluation → pipeline start chain. Caveat: merge commit contains actual changed files even if many; merge commit itself's change includes entire merged branch diff. One PR merge can trigger more pipelines than expected. `filePaths.excludes` is subtract relationship with `includes`, not AND—file matching `includes` minus `excludes` pattern remains when triggering. Both empty means no trigger.

> 💡 **Related theory**: Monorepo trigger filter is **Event Filtering** pattern implementation. All events published from source (git push) but consumers (pipelines) process only relevant events. This is Pub/Sub pattern's Topic-based filtering (here: branch/file path)—EventBridge's Event Pattern handles this. CodeStarSourceConnection publishes push events to EventBridge, each pipeline trigger filters events—so adding/removing pipelines needs no repository change, only pipeline-side filter change.

## Execution Mode: Three Philosophies of Concurrency Control

When same pipeline executes continuously, how to handle? Three different answers are Execution Modes.

```
Execution Mode Comparison

SUPERSEDED (default):
  Execution 1 ─[Build]─[Test]─[Deploy]
  Execution 2 ─[Build] → Execution 1 canceled
  Execution 3 ─[Build] → Execution 2 canceled
  Result: Only Execution 3 completes. 1, 2 canceled.

  Use: "only latest commit needs prod"

QUEUED:
  Execution 1 ─[Build]─[Test]─[Deploy]─ Complete
  Execution 2 Wait ──────────────────────── ─[Build]─[Test]─[Deploy]─ Complete
  Execution 3 Wait ──────────────────────────────────────────────────── ─[Build]─...

  Use: "need deployment history for all commits"

PARALLEL:
  Execution 1 ─[Build]─[Test]─[Deploy]─
  Execution 2 ─[Build]─[Test]─[Deploy]─ (simultaneous)
  Execution 3 ─[Build]─[Test]─[Deploy]─ (simultaneous)
  Result: All three progress simultaneously.

  Use: "build/deploy each PR in independent environment"
```

```bash
# Change Execution Mode
aws codepipeline update-pipeline \
  --pipeline '{
    "name": "checkout-pipeline",
    "executionMode": "QUEUED",
    ...
  }'
```

**QUEUED + Conditional Deploy pattern**: "build all commits but Deploy only latest commit in queue."

```json
{
  "name": "Deploy",
  "beforeEntry": {
    "conditions": [{
      "result": "SKIP",
      "rules": [{
        "name": "IsLatestExecution",
        "ruleTypeId": {
          "category": "Rule",
          "owner": "AWS",
          "provider": "LambdaInvoke",
          "version": "1"
        },
        "configuration": {
          "FunctionName": "CheckIfLatestExecution",
          "UserParameters": "{\"pipelineName\":\"checkout-pipeline\"}"
        }
      }]
    }]
  }
}
```

CheckIfLatestExecution Lambda verifies "is this execution current pipeline's latest" and SKIPs Deploy Stage if not latest.

> ⚠️ **Pitfall**: Applying PARALLEL Execution Mode to production deployment pipeline risks two executions simultaneously modifying same ECS Service or CloudFormation Stack. CloudFormation disallows concurrent updates—second execution fails with "UPDATE_IN_PROGRESS: Another update is in progress" error. PARALLEL is safe only when each execution targets independent resources (e.g., each PR has separate namespace ECS Service). Must use QUEUED or SUPERSEDED with shared resource prod deployment. When using PARALLEL for PR environment deployment, include pipeline variable (`#{variables.PRNumber}`) in stack name so each PR has independent stack.

> 📚 **Case study**: Shopify's Execution Mode strategy. Shopify operates thousands of microservices applying different Execution Mode per service type. Payment service uses QUEUED—must preserve complete deployment history for audit. Frontend service uses SUPERSEDED—only latest commit matters, previous deployment shouldn't delay new deployment. Test environment uses PARALLEL—each PR needs independent environment testing. "What Execution Mode to choose" is architectural decision reflecting service's business requirement (audit trail vs deploy speed vs isolation).

## Stage Conditions (beforeEntry/success/failure): Automated Gates

V2 Stage conditions are "automated gates without human Manual Approval." 2024-added feature with three condition types.

```json
{
  "name": "Deploy",
  "beforeEntry": {
    "conditions": [{
      "result": "FAIL",
      "rules": [{
        "name": "CloudWatchAlarmCheck",
        "ruleTypeId": {
          "category": "Rule",
          "owner": "AWS",
          "provider": "CloudWatchAlarm",
          "version": "1"
        },
        "configuration": {
          "AlarmName": "checkout-service-error-rate-alarm",
          "WaitTime": "300"
        }
      }]
    }]
  },
  "onSuccess": {
    "conditions": [{
      "result": "ROLLBACK",
      "rules": [{
        "name": "PostDeployHealthCheck",
        "ruleTypeId": {
          "category": "Rule",
          "owner": "AWS",
          "provider": "LambdaInvoke",
          "version": "1"
        },
        "configuration": {
          "FunctionName": "PostDeployHealthGate",
          "WaitTime": "900"
        }
      }]
    }]
  },
  "onFailure": {
    "conditions": [{
      "result": "ROLLBACK",
      "rules": []
    }]
  }
}
```

- `beforeEntry`: Check before Stage entry. SKIP or FAIL entire Stage on failure.
- `onSuccess`: Check after Stage completion. ROLLBACK to previous state on failure.
- `onFailure`: Define behavior on Stage failure.

CloudWatch Alarm Rule Provider allows checking alarm status directly without Lambda:

```json
{
  "ruleTypeId": {
    "category": "Rule",
    "owner": "AWS",
    "provider": "CloudWatchAlarm",
    "version": "1"
  },
  "configuration": {
    "AlarmName": "production-5xx-rate",
    "WaitTime": "300"
  }
}
```

`WaitTime: 300` means alarm OK state for 5 minutes passes gate. If alarm ALARM state or doesn't reach OK within 5 minutes, fails.

> 💡 **Related theory**: Stage conditions are **Circuit Breaker pattern** pipeline-level implementation. Circuit Breaker is Martin Fowler-documented microservice pattern: "when system unstable, block additional requests preventing situation worsening." CloudWatch Alarm ALARM state (error rate spike) triggering `beforeEntry` condition block matches Circuit Breaker's "OPEN" state precisely. Current system has problems—deploying new version worsens problems—Circuit Breaker automatically prevents this. WaitTime resembles Circuit Breaker's "Half-Open" state timeout.

> 📚 **Case study**: Stripe's Safe Deploy pattern (2023 AWS re:Invent). Stripe's payment service nature means deployment failure directly translates to revenue loss. Applied 4-stage automated gate to all prod deployments. (1) beforeEntry: current error rate < 0.1%, (2) 1 min post-deploy: error rate still < 0.1%, (3) 5 min post-deploy: error rate < 0.1% + P99 latency within baseline, (4) 30 min post-deploy: all CloudWatch alarms OK. Any gate failure triggers auto-rollback. This automation reduced deployment-related incidents 70%. Core is "no human judgment time needed"—within 30 seconds of deployment problem, auto-rollback completes.

## CDK Pipelines: When Pipeline Definition Itself Becomes Code

CDK Pipelines is high-level Construct allowing CodePipeline definition via CDK. Most distinctive is **self-mutating** behavior—pipeline definition changes self-update the pipeline.

```typescript
import * as cdk from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines';

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'checkout-pipeline',
      selfMutation: true,           // pipeline itself as first stage
      crossAccountKeys: true,       // auto-create KMS CMK for Cross-Account
      dockerEnabledForSynth: true,  // use Docker in synth stage
      synth: new ShellStep('Synth', {
        input: CodePipelineSource.gitHub('my-org/checkout', 'main', {
          authentication: cdk.SecretValue.secretsManager('github-token')
        }),
        commands: [
          'npm ci',
          'npm run build',
          'npm test',
          'npx cdk synth'
        ],
        primaryOutputDirectory: 'cdk.out'
      }),
      pipelineType: cdk.aws_codepipeline.PipelineType.V2
    });

    // Staging environment
    const stagingStage = pipeline.addStage(
      new CheckoutAppStage(this, 'Staging', {
        env: {
          account: process.env.CDK_STAGING_ACCOUNT,
          region: 'ap-northeast-2'
        }
      })
    );

    // Wave: deploy multiple environments in parallel
    const wave = pipeline.addWave('Global-Deploy');
    wave.addStage(
      new CheckoutAppStage(this, 'ProdUS', {
        env: { account: process.env.CDK_PROD_ACCOUNT, region: 'us-east-1' }
      })
    );
    wave.addStage(
      new CheckoutAppStage(this, 'ProdEU', {
        env: { account: process.env.CDK_PROD_ACCOUNT, region: 'eu-west-1' }
      })
    );

    // Production (with manual approval)
    pipeline.addStage(
      new CheckoutAppStage(this, 'ProdKR', {
        env: { account: process.env.CDK_PROD_ACCOUNT, region: 'ap-northeast-2' }
      }),
      {
        pre: [new ManualApprovalStep('ApproveKRProd', {
          comment: 'Approve production deployment to Korea'
        })]
      }
    );
  }
}
```

Self-mutating mechanics:

```
1. Developer changes PipelineStack code (adds new Stage)
2. git push to main
3. Existing pipeline triggers
4. Synth stage synthesizes new CDK code → generates new CloudFormation template
5. Self-Mutation stage updates pipeline's own CloudFormation stack
6. Pipeline restarts with new definition (new Stage included)
7. Remaining deploy Stage proceeds
```

This means pipeline structure itself version-controlled via git and receives PR review. Previous problem of console-based direct pipeline change without code review is solved.

> 💡 **Related theory**: CDK Pipelines self-mutating is elegant **Bootstrap Problem** solution. "To deploy pipeline via pipeline, initially without pipeline—how?" One-time manual deploy (`cdk deploy PipelineStack`) creates pipeline, then pipeline self-updates thereafter. Resembles **Self-hosting Compiler** concept—compiler compiles itself. CDK's `crossAccountKeys: true` auto-creates CMK and configures KMS Key Policy for Cross-Account deploy—previously manual 4-part chain becomes automated. Cross-Account deployment mistake prevention at code level is why CDK Pipelines becomes Cross-Account standard choice.

> 🔍 **Deeper**: What CDK Pipelines's `crossAccountKeys: true` creates. Activating this option auto-creates KMS CMK, and configures KMS Key Policy so each Spoke account's cross-account Role can decrypt Artifact. CDK Pipelines auto-handles 4-part permission chain (Pipeline Service Role, Trust Policy, S3 Bucket Policy, KMS Key Policy) that Day 2 manual configuration required. IAM setup mistakes prevented at code level—this is another reason choosing CDK Pipelines for Cross-Account deployment.

## EventBridge Pipes: Non-Standard Trigger Handling

V2 trigger filter can't cover non-standard triggers—SQS queue receives message, DynamoDB table gets specific item, specific CloudWatch alarm becomes OK. EventBridge Pipes handles these.

```json
{
  "Name": "SQSToPipelineTrigger",
  "Source": "arn:aws:sqs:ap-northeast-2:111:deploy-trigger-queue",
  "Target": "arn:aws:codepipeline:ap-northeast-2:111:checkout-pipeline",
  "TargetParameters": {
    "CodePipelineParameters": {
      "Variables": [
        {
          "Name": "Environment",
          "Value": "<$.body.environment>"
        },
        {
          "Name": "Reason",
          "Value": "<$.body.reason>"
        }
      ]
    }
  }
}
```

Use cases:
- Another pipeline's success event triggers this pipeline (pipeline chain)
- On-premises system sends SQS message triggering pipeline
- Specific S3 event (s3:ObjectCreated, specific key pattern) triggers pipeline

## CodePipeline Limitations and Selection Criteria

Despite V2's power, limitations remain. Exam asks "when GitHub Actions fits, when CodePipeline"—understanding these limits matters.

| Requirement | CodePipeline V2 | GitHub Actions |
|---|---|---|
| AWS resource deploy (Cross-Account) | Native support | OIDC federation required |
| Matrix build (OS × language version) | Awkward (Action repetition) | Native support (matrix: keyword) |
| Independent test environment per PR | PARALLEL mode + conditions needed | Auto-isolated |
| Monorepo path filter | V2 filePaths (native) | on.push.paths |
| Display build result on PR status | Limited | Native (commit status) |
| Internal network access | Self-hosted CodeBuild (complex) | Self-hosted Runner (simple) |
| Multi-cloud | Awkward | Natural |
| AWS service integration (CloudTrail, SSM) | Complete native | OIDC + separate setup |

Practical recommendation: **PR build/test via GitHub Actions, Prod deploy via CodePipeline.** GitHub Actions builds and pushes to ECR, ECR event triggers CodePipeline for Prod deployment.

> 🎯 **Scenario**: Team manages 100 microservices in single monorepo. Each service deploys to separate ECS cluster. Requirements: (1) Only service directory change triggers that service pipeline, (2) PR creation auto-deploys temp staging environment, (3) Main merge auto-deploys prod, (4) Pre-deploy auto-check CloudWatch alarms. Solution: (1) V2 filePaths filter separates service triggers, (2) GitHub Actions deploys PR environment (more natural PR integration than CodePipeline), (3) Main branch trigger V2 pipeline, (4) beforeEntry CloudWatch Alarm Rule automated gate. This combination leverages each tool's strengths—realistic architecture.

> 🎯 **Scenario**: Payment service team wants automated "deployment freeze" policy. Every Nov 25-28 (Black Friday) auto-block deployments, auto-unblock Nov 29 0:00. Manual Approval can't prevent accidental approval. Solution: EventBridge Scheduler schedules two Lambda functions. (1) Nov 25 0:00: Lambda calls `disable-stage-transition` API blocking Deploy Stage transition. (2) Nov 29 0:00: Lambda calls `enable-stage-transition` re-enabling. Even pipeline executions can't enter Deploy Stage—accidental approval prevented. V2 Stage conditions with Lambda Rule can add date-based block, but Scheduler cleaner.

## Summary

V2 pipeline's three key features each solve different problems. **Variable system** enables parameter reuse of same pipeline across environments. **Trigger filter** supports independent service execution in monorepo. **Execution Mode** chooses between concurrent collision handling (SUPERSEDED), complete history preservation (QUEUED), PR-independent environment (PARALLEL).

Stage conditions (beforeEntry) implement Circuit Breaker pattern for automated deployment gate. CDK Pipelines version-control pipeline itself as code via self-mutating and achieve declarative pipeline management. `crossAccountKeys: true` auto-handles Cross-Account KMS setup.

---

## 📝 Practice Questions

**Question 1.** In a V2 pipeline, how can the IMAGE_TAG value output by a build action (CodeBuild) be used in the deploy action of the same execution?

A) Store it in S3 and have the deploy action read it  
B) Declare IMAGE_TAG in env.exported-variables of buildspec.yml and reference it in the deploy action configuration as `#{BuildVariables.IMAGE_TAG}`  
C) Declare it in advance in the pipeline input variables  
D) Store it in S3 in between with a Lambda invoke action  

**Answer: B**  
Explanation: Environment variables declared in `env.exported-variables` of CodeBuild are automatically exposed as action output variables of the V2 pipeline. The reference format is `#{ActionNamespace.VARIABLE_NAME}`. This variable can be referenced by all subsequent actions within the pipeline execution. With S3 (A, D) or input variables (C), the value cannot be known before the build, so they are not suitable for a dynamically generated IMAGE_TAG.

---

**Question 2.** In a monorepo, only changes to `services/payment/` should trigger payment-pipeline, and changes to `shared/lib/` should trigger all service pipelines. What is the most appropriate configuration?

A) Add a Lambda invoke action to each service pipeline to check the changed files  
B) Set `filePaths.includes: ["services/payment/**", "shared/lib/**"]` in the trigger of payment-pipeline, and likewise include each service path and shared/lib/** in the other service pipelines  
C) Add conditional branching to a single pipeline  
D) Use the GitHub Actions path filter and start CodePipeline after GitHub Actions completes  

**Answer: B**  
Explanation: The standard is to set the V2 filePaths filter independently on each service pipeline. If you add `shared/lib/**` to the includes of all service pipelines, all service pipelines start at the same time when shared/lib changes. Because each pipeline is independent, a failure in one does not affect the other services. A is an inefficient approach that starts unnecessary executions first and then stops them.

---

**Question 3.** How do you implement the requirement "every commit must be built, but only the most recent commit should be deployed to prod"?

A) Execution Mode SUPERSEDED  
B) Execution mode QUEUED + a Lambda rule in the Deploy stage beforeEntry condition that checks whether this execution is the last in the queue  
C) Execution mode PARALLEL + a separate coordination Lambda  
D) Two pipelines (a build pipeline + a deploy pipeline)  

**Answer: B**  
Explanation: QUEUED builds every commit in order (preserving a complete history) while adding an automatic gate in the Deploy stage that checks whether it is "the last execution in the queue." If it is not the last execution, it is skipped, and only the last execution actually proceeds with the deployment. With SUPERSEDED (A), a new commit cancels the previous execution, so building every commit is not guaranteed. The two-pipeline approach in D is also possible but more complex.

---

**Question 4.** What is the most important thing to watch out for when using the PARALLEL execution mode?

A) Execution cost doubles  
B) Conflicts occur when multiple executions try to modify the same prod resource (ECS service, CloudFormation stack) at the same time  
C) IAM permissions are automatically restricted  
D) Artifact storage capacity runs out  

**Answer: B**  
Explanation: In PARALLEL mode, if two executions try to update the same CloudFormation stack at the same time, the error "UPDATE_IN_PROGRESS: Another update is in progress" occurs. PARALLEL is safe only when each execution deploys to an independent target (for example, each PR gets a separate staging environment, with the PR number in the stack name). In environments with shared resources, use QUEUED or SUPERSEDED.

---

**Question 5.** What problem does the self-mutating nature of CDK Pipelines actually solve?

A) It automatically optimizes pipeline cost  
B) When the pipeline definition code (CDK code) changes, the pipeline updates itself, so there is no need to manually change the pipeline structure in the console  
C) It automatically fixes security vulnerabilities  
D) It detects CloudFormation stack drift  

**Answer: B**  
Explanation: Self-mutating means the pipeline code itself (CDK code) is managed through git commits, and those changes are automatically reflected in the actual pipeline. For example, if you add a new stage to the CDK code: git push → the existing pipeline runs → synth → updates its own CloudFormation stack → the pipeline re-runs with the new stage included. The key value is that changes to the pipeline structure go through the code review process.

---

**Question 6.** In a V2 pipeline, how do you automatically check the CloudWatch alarm state before entering a stage and skip the stage if it is in the ALARM state?

A) Add a Lambda invoke action before the stage  
B) Set the CloudWatch alarm rule provider in the stage beforeEntry condition and set the result to SKIP  
C) A person checks the alarm state with a manual approval action and approves  
D) Monitor the alarm state with an EventBridge rule and stop the pipeline  

**Answer: B**  
Explanation: The combination of the V2 stage condition (`beforeEntry`) + the CloudWatch alarm rule provider is the exact implementation of this requirement. If set to SKIP, the stage is skipped when the alarm is in the ALARM state and the pipeline proceeds to the next stage (the pipeline is not stopped). If set to FAIL, the entire pipeline fails. The CloudWatch alarm rule provider is a simple way to check the alarm state directly without Lambda.

---

**Question 7.** Which of the trigger event types supported by a V2 pipeline is not supported?

A) git push to specific branch with file path filter  
B) git tag push with pattern matching  
C) pull request opened or updated  
D) git push with commit message containing a specific keyword  

**Answer: D**  
Explanation: V2 triggers support (A) branch patterns + file path patterns, (B) tag patterns, and (C) PR events (OPEN, UPDATED, CLOSED). Triggering based on the content of the commit message (D) is not supported in CodePipeline V2. If a commit message-based trigger is needed, you need a custom trigger pattern in which Lambda receives the push event, parses the message, and conditionally calls `start-pipeline-execution`.
