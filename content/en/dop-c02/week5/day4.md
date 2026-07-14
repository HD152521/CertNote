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

## 📝 연습 문제

**문제 1.** V2 Pipeline에서 Build Action(CodeBuild)이 출력한 IMAGE_TAG 값을 같은 실행의 Deploy Action에서 사용하려면?

A) S3에 저장하고 Deploy Action이 읽는다  
B) buildspec.yml의 env.exported-variables에 IMAGE_TAG를 선언하고 Deploy Action 설정에서 `#{BuildVariables.IMAGE_TAG}`로 참조한다  
C) Pipeline 입력 변수에 미리 선언한다  
D) Lambda Invoke Action으로 중간에 S3에 저장한다  

**정답: B**  
해설: CodeBuild의 `env.exported-variables`에 선언된 환경 변수는 V2 Pipeline의 Action 출력 변수로 자동 노출된다. 참조 형식은 `#{ActionNamespace.VARIABLE_NAME}`이다. 이 변수는 파이프라인 실행 내에서 이후 모든 Action에서 참조 가능하다. S3(A, D)나 입력 변수(C)를 사용하면 빌드 전에 값을 알 수 없으므로 동적으로 생성되는 IMAGE_TAG에는 적합하지 않다.

---

**문제 2.** 모노레포에서 `services/payment/` 변경만 payment-pipeline을 트리거하고, `shared/lib/` 변경은 모든 서비스 파이프라인을 트리거해야 한다. 가장 적절한 구성은?

A) 각 서비스 파이프라인에 Lambda Invoke Action을 추가해 변경 파일을 확인한다  
B) payment-pipeline의 트리거에 `filePaths.includes: ["services/payment/**", "shared/lib/**"]`를 설정하고, 다른 서비스 파이프라인도 동일하게 각각 서비스 경로와 shared/lib/**를 포함한다  
C) 단일 파이프라인에 조건 분기를 추가한다  
D) GitHub Actions의 path filter를 사용하고 CodePipeline은 GitHub Actions 완료 후 시작한다  

**정답: B**  
해설: V2 filePaths 필터를 각 서비스 파이프라인에 독립적으로 설정하는 것이 표준이다. `shared/lib/**`를 모든 서비스 파이프라인의 includes에 추가하면, shared/lib 변경 시 모든 서비스 파이프라인이 동시에 시작된다. 각 파이프라인이 독립적이므로 하나가 실패해도 다른 서비스에 영향 없다. A는 불필요한 실행을 먼저 시작한 후 중단하는 비효율적 방식이다.

---

**문제 3.** "모든 commit을 빌드해야 하지만 prod 배포는 가장 최근 commit만 해야 한다"는 요구사항을 구현하는 방법은?

A) Execution Mode SUPERSEDED  
B) Execution Mode QUEUED + Deploy Stage의 beforeEntry 조건에서 이 실행이 큐의 마지막인지 확인하는 Lambda Rule  
C) Execution Mode PARALLEL + 별도 조율 Lambda  
D) 두 개의 파이프라인 (빌드 파이프라인 + 배포 파이프라인)  

**정답: B**  
해설: QUEUED는 모든 commit을 순서대로 빌드(완전한 이력 보존)하면서, Deploy Stage에서 "큐의 마지막 실행인지" 확인하는 자동 게이트를 추가한다. 마지막 실행이 아니면 SKIP하고, 마지막 실행만 실제 배포를 진행한다. SUPERSEDED(A)는 새 commit이 이전 실행을 취소하므로 모든 commit 빌드가 보장되지 않는다. D의 두 파이프라인 방식도 가능하지만 더 복잡하다.

---

**문제 4.** PARALLEL Execution Mode를 사용할 때 가장 주의해야 할 점은?

A) 실행 비용이 2배가 된다  
B) 여러 실행이 동시에 같은 prod 리소스(ECS Service, CloudFormation Stack)를 수정하려 하면 충돌이 발생한다  
C) IAM 권한이 자동으로 제한된다  
D) Artifact 저장 용량이 부족해진다  

**정답: B**  
해설: PARALLEL 모드에서 두 실행이 동시에 같은 CloudFormation 스택을 업데이트하려 하면 "UPDATE_IN_PROGRESS: Another update is in progress" 오류가 발생한다. PARALLEL은 각 실행이 독립된 대상(예: 각 PR이 별도 스테이징 환경, 스택 이름에 PR 번호 포함)에 배포할 때만 안전하다. 공유 리소스가 있는 환경에서는 QUEUED나 SUPERSEDED를 사용해야 한다.

---

**문제 5.** CDK Pipelines의 self-mutating 특성이 실제로 해결하는 문제는?

A) 파이프라인 비용을 자동으로 최적화한다  
B) 파이프라인 정의 코드(CDK 코드)가 변경됐을 때 파이프라인이 스스로를 업데이트해서 콘솔에서 수동으로 파이프라인 구조를 변경할 필요가 없다  
C) 자동으로 보안 취약점을 수정한다  
D) CloudFormation 스택 드리프트를 감지한다  

**정답: B**  
해설: Self-mutating은 파이프라인 코드 자체(CDK 코드)가 git commit으로 관리되고, 그 변경이 자동으로 실제 파이프라인에 반영된다는 의미다. 예를 들어 CDK 코드에 새 Stage를 추가하면 git push → 기존 파이프라인 실행 → synth → 자신의 CloudFormation 스택 업데이트 → 파이프라인이 새 Stage를 포함한 상태로 재실행된다. 파이프라인 구조 변경이 코드 리뷰 프로세스를 거치게 된다는 것이 핵심 가치다.

---

**문제 6.** V2 Pipeline에서 Stage 진입 전 CloudWatch 알람 상태를 자동으로 확인하고 ALARM 상태면 Stage를 건너뛰려면?

A) Lambda Invoke Action을 Stage 앞에 추가  
B) Stage의 beforeEntry 조건에 CloudWatch Alarm Rule Provider를 설정하고 result를 SKIP으로 설정  
C) Manual Approval Action으로 사람이 알람 상태를 확인 후 승인  
D) EventBridge Rule로 알람 상태를 모니터링하고 파이프라인을 중단  

**정답: B**  
해설: V2의 Stage 조건(`beforeEntry`) + CloudWatch Alarm Rule Provider 조합이 이 요구사항의 정확한 구현이다. SKIP으로 설정하면 알람이 ALARM 상태일 때 해당 Stage를 건너뛰고 다음 Stage로 진행한다(파이프라인이 중단되지 않음). FAIL로 설정하면 파이프라인 전체가 실패한다. CloudWatch Alarm Rule Provider는 Lambda 없이 직접 알람 상태를 체크하는 단순한 방법이다.

---

**문제 7.** V2 Pipeline에서 지원하는 트리거 이벤트 유형 중 지원하지 않는 것은?

A) git push to specific branch with file path filter  
B) git tag push with pattern matching  
C) pull request opened or updated  
D) git push with commit message containing a specific keyword  

**정답: D**  
해설: V2 트리거는 (A) 브랜치 패턴 + 파일 경로 패턴, (B) 태그 패턴, (C) PR 이벤트(OPEN, UPDATED, CLOSED)를 지원한다. 커밋 메시지 내용(D)을 기반으로 트리거하는 기능은 CodePipeline V2에서 지원하지 않는다. 커밋 메시지 기반 트리거가 필요하면 Lambda가 push 이벤트를 받아 메시지를 파싱한 후 조건부로 `start-pipeline-execution`을 호출하는 커스텀 트리거 패턴이 필요하다.
