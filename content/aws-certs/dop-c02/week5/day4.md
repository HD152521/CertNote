# Day 4 - 동적 파이프라인: V2 변수 시스템, 트리거 필터, Execution Mode의 설계

같은 코드베이스에서 서로 다른 환경(staging, prod)에 배포해야 한다. 수십 개의 마이크로서비스가 단일 저장소에 있고, 각 서비스의 변경이 해당 서비스 파이프라인만 실행해야 한다. 여러 PR이 동시에 진행되는데 각 PR의 빌드가 서로를 취소해서는 안 된다. 이 세 가지 요구사항을 V1 CodePipeline으로 해결하려면 복잡한 우회책이 필요하다. V2는 이 세 가지를 각각 입력 변수 시스템, 트리거 필터, Execution Mode로 직접 지원한다.

오늘은 V2의 동적 파이프라인 기능이 왜 그렇게 설계됐는지, 그리고 어떤 상황에서 어떤 기능을 쓰는지를 구체적인 시나리오와 함께 본다.

> 💡 **관련 이론**: V1에서 V2로의 전환은 단순한 기능 추가가 아니라 설계 철학의 전환이다. V1 파이프라인은 "고정된 워크플로"—같은 코드, 같은 환경, 같은 방식으로 실행된다. V2는 "매개변수화된 워크플로"—같은 파이프라인 정의를 다른 입력값으로 실행할 수 있다. 이 차이는 소프트웨어 설계의 **Template Method Pattern**과 유사하다. V1이 구체 클래스(Concrete Class)라면, V2는 추상 클래스(Abstract Class)에 해당한다—변수를 주입받아 다양한 동작을 표현한다. 이 방향은 Infrastructure as Code의 진화 방향과 일치한다: Terraform의 `variable`, Helm의 `values.yaml`, CDK의 `Props` 모두 같은 철학이다.

## V2 변수 시스템: 파이프라인을 매개변수화하기

**입력 변수(Pipeline Variables)**는 파이프라인 실행 시작 시 외부에서 주입되는 값이다. 동일한 파이프라인을 `Environment=staging`과 `Environment=prod`로 각각 실행해서 서로 다른 환경에 배포하는 데 사용된다.

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

실행 시 변수 주입:
```bash
# 스테이징 배포 (자동 트리거 기본값)
aws codepipeline start-pipeline-execution \
  --name checkout-pipeline

# 프로덕션 배포 (수동 실행)
aws codepipeline start-pipeline-execution \
  --name checkout-pipeline \
  --variables \
    name=Environment,value=prod \
    name=Reason,value="Hotfix for checkout failure"
```

**Action 변수 (Action Output Variables)**는 각 Action이 자동으로 노출하는 값들이다.

| Action 종류 | 변수 | 참조 형식 |
|-------------|------|----------|
| Source (CodeStar/GitHub) | CommitId, BranchName, CommitMessage, FullRepositoryName | `#{SourceVariables.CommitId}` |
| Source (ECR) | ImageDigest, ImageTag, ImageURI, RegistryId, RepositoryName | `#{SourceVariables.ImageTag}` |
| Source (S3) | ETag, VersionId | `#{SourceVariables.VersionId}` |
| Build (CodeBuild) | exported-variables에 정의한 모든 변수 | `#{BuildVariables.IMAGE_TAG}` |
| CloudFormation | StackName | `#{DeployVariables.StackName}` |
| Lambda Invoke | outputVariables에 보낸 값 | `#{LambdaAction.SMOKE_STATUS}` |
| Step Functions | 없음 (실행 ARN만) | - |

**메타 변수**:
- `#{codepipeline.PipelineExecutionId}` — 현재 실행의 UUID
- `#{codepipeline.PipelineName}` — 파이프라인 이름
- `#{codepipeline.PipelineVersion}` — 파이프라인 버전

```yaml
# buildspec.yml — exported-variables 사용법
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

Deploy Action에서 변수 참조:
```json
{
  "configuration": {
    "StackName": "checkout-#{variables.Environment}",
    "ParameterOverrides": "{\"ImageTag\": \"#{BuildVariables.IMAGE_TAG}\", \"DeployTimestamp\": \"#{BuildVariables.BUILD_TIMESTAMP}\"}",
    "Tags": "[{\"Key\":\"CommitId\",\"Value\":\"#{SourceVariables.CommitId}\"},{\"Key\":\"Pipeline\",\"Value\":\"#{codepipeline.PipelineName}\"}]"
  }
}
```

> 💡 **관련 이론**: V2 변수 시스템은 **데이터 바인딩(Data Binding)** 패턴이다. 선언적(Declarative) 프로그래밍에서 "변수 X는 나중에 결정될 값"을 표현하는 방식과 같다. Terraform의 `var.environment`, Helm의 `{{ .Values.image.tag }}`, CloudFormation의 `!Ref` 파라미터와 동일한 개념이다. 차이는 CodePipeline 변수가 파이프라인 실행 시간(runtime)에 결정된다는 점—각 실행이 독립적인 변수 값을 갖는다. 특히 Action Output Variables는 파이프라인 내부의 데이터 흐름을 명시적으로 표현한다. "빌드가 만든 IMAGE_TAG를 배포가 사용한다"는 의존 관계가 코드에서 명확하게 보인다. 이것이 "동적 파이프라인(Dynamic Pipeline)"이라는 표현의 의미다.

> ⚠️ **함정**: `allowedPattern`이 있는 변수에 패턴에 맞지 않는 값을 주입하면 실행 시작 시 즉시 실패한다. `^(staging|prod)$`로 설정된 Environment 변수에 `"production"`을 넣으면 실행이 시작되지 않는다. 또한 Action Output Variables의 Namespace는 Action 설정의 `namespace` 필드에서 정의하고, 이 이름이 `#{Namespace.VARIABLE}` 형식에서 사용된다. 기본 Namespace를 사용하면 Action 이름이 Namespace가 되지 않으므로 명시적으로 Namespace를 설정하는 것이 좋다.

## 트리거 필터: 모노레포의 해답

모노레포(monorepo)에서 트리거 필터가 없으면 한 개발자가 Readme를 수정해도 전체 마이크로서비스 파이프라인이 실행된다. V2의 트리거 필터는 이 문제를 해결한다.

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

**모노레포 서비스별 파이프라인 패턴**:

```
my-org/services-monorepo/
├── services/
│   ├── checkout/          ← checkout-pipeline이 트리거
│   ├── inventory/         ← inventory-pipeline이 트리거
│   ├── notifications/     ← notifications-pipeline이 트리거
│   └── payment/           ← payment-pipeline이 트리거
├── shared/
│   ├── lib/               ← 공유 라이브러리 (모든 파이프라인 트리거)
│   └── proto/             ← Protobuf 정의 (모든 파이프라인 트리거)
└── infrastructure/        ← infra-pipeline이 트리거
    ├── terraform/
    └── cloudformation/
```

checkout-pipeline 트리거 설정:
```json
"filePaths": {
  "includes": ["services/checkout/**", "shared/lib/**", "shared/proto/**"]
}
```

`shared/lib/`가 변경되면 네 개의 서비스 파이프라인이 동시에 시작된다. 각 파이프라인이 독립적이므로 서로 영향 없이 병렬로 실행된다.

> 🔍 **더 깊이**: 트리거 필터의 내부 구현은 git의 `diff --name-only`와 유사하다. Push 이벤트에서 변경된 파일 목록을 필터 패턴과 glob matching한다. AWS 내부적으로 EventBridge Pipes가 GitHub Webhook → EventBridge Event → 필터 평가 → 파이프라인 시작의 체인을 처리한다. 주의사항: merge commit은 실제로 변경된 파일이 많더라도 merge commit 자체의 변경은 merge된 브랜치의 전체 diff를 포함한다. 따라서 하나의 PR merge가 예상보다 많은 파이프라인을 트리거할 수 있다. `filePaths.excludes`는 `includes`와 AND가 아니라 subtract 관계다—includes에 매칭된 파일에서 excludes 패턴을 제거한 파일이 남아있을 때 트리거된다. 둘 다 빈 집합이면 트리거되지 않는다.

> 💡 **관련 이론**: 모노레포 트리거 필터는 **이벤트 필터링(Event Filtering)** 패턴의 구현이다. 이벤트 소스(git push)에서 모든 이벤트가 발행되지만, 소비자(파이프라인)는 자신에게 관련된 이벤트만 처리한다. 이것은 Pub/Sub 패턴에서 Topic 기반 필터링(여기서는 브랜치/파일 경로)과 동일한 원리다. EventBridge의 Event Pattern이 이 필터링을 담당한다—CodeStarSourceConnection이 push 이벤트를 EventBridge에 발행하고, 각 파이프라인 트리거가 자신의 필터 패턴으로 이벤트를 선별한다. 이 설계 덕분에 파이프라인이 추가/제거될 때 저장소 구성을 변경할 필요 없이 파이프라인 측 필터만 변경하면 된다.

## Execution Mode: 동시성 제어의 세 가지 철학

같은 파이프라인이 연속으로 실행될 때 어떻게 처리할 것인가? 이 질문에 대한 세 가지 다른 답이 Execution Mode다.

```
Execution Mode 비교

SUPERSEDED (기본):
  실행 1 ─[Build]─[Test]─[Deploy]
  실행 2 ─[Build] → 실행 1 취소
  실행 3 ─[Build] → 실행 2 취소
  결과: 실행 3만 완료. 실행 1, 2는 취소.

  사용: "마지막 commit만 prod에 있으면 된다"

QUEUED:
  실행 1 ─[Build]─[Test]─[Deploy]─ 완료
  실행 2 대기 ──────────────────────── ─[Build]─[Test]─[Deploy]─ 완료
  실행 3 대기 ──────────────────────────────────────────────────── ─[Build]─...

  사용: "모든 commit의 배포 이력이 필요하다"

PARALLEL:
  실행 1 ─[Build]─[Test]─[Deploy]─
  실행 2 ─[Build]─[Test]─[Deploy]─ (동시)
  실행 3 ─[Build]─[Test]─[Deploy]─ (동시)
  결과: 셋 다 동시에 진행.

  사용: "각 PR을 독립 환경에서 빌드/배포"
```

```bash
# Execution Mode 변경
aws codepipeline update-pipeline \
  --pipeline '{
    "name": "checkout-pipeline",
    "executionMode": "QUEUED",
    ...
  }'
```

**QUEUED + 조건부 Deploy 패턴**: "모든 commit을 빌드하되, Deploy는 큐의 마지막 commit만"이라는 요구사항.

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

CheckIfLatestExecution Lambda가 "이 실행이 현재 파이프라인의 마지막 실행인가"를 확인해서 최신이 아니면 Deploy Stage를 SKIP한다.

> ⚠️ **함정**: PARALLEL Execution Mode를 프로덕션 배포 파이프라인에 적용하면 두 실행이 동시에 같은 ECS Service나 CloudFormation Stack을 수정하려 할 수 있다. CloudFormation은 동시 업데이트를 허용하지 않아서 두 번째 실행이 "UPDATE_IN_PROGRESS: Another update is in progress" 오류로 실패한다. PARALLEL은 각 실행이 독립된 대상(예: 각 PR이 별도 네임스페이스의 ECS Service)에 배포할 때만 안전하다. 공유 리소스가 있는 prod 배포에는 QUEUED나 SUPERSEDED를 사용해야 한다. PR 환경 배포에 PARALLEL을 쓸 때는 파이프라인 변수(`#{variables.PRNumber}`)를 스택 이름에 포함시켜 각 PR이 독립된 스택을 갖도록 해야 한다.

> 📚 **사례**: Shopify의 Execution Mode 전략. Shopify는 수천 개의 마이크로서비스를 운영하면서 서비스 유형별로 다른 Execution Mode를 적용한다. 결제 서비스(Payment)는 QUEUED—모든 commit의 배포 이력을 감사 목적으로 보존해야 하기 때문. 프론트엔드 서비스는 SUPERSEDED—마지막 commit만 중요하고, 이전 commit의 배포가 새 commit의 배포를 지연시키면 안 되기 때문. 테스트 환경은 PARALLEL—각 PR이 독립 환경에서 테스트되어야 하기 때문. "어떤 Execution Mode를 선택하는가"는 서비스의 비즈니스 요구사항(감사 추적 vs 배포 속도 vs 격리)을 반영하는 아키텍처 결정이다.

## Stage 조건 (beforeEntry/success/failure): 자동 게이트

V2의 Stage 조건은 "사람의 Manual Approval 없이 자동화된 게이트"를 파이프라인에 넣는 방법이다. 2024년에 추가된 기능으로 세 가지 조건 타입이 있다.

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

- `beforeEntry`: Stage 진입 전 체크. 실패 시 Stage 전체를 SKIP 또는 FAIL.
- `onSuccess`: Stage 완료 후 체크. 실패 시 이전 상태로 ROLLBACK.
- `onFailure`: Stage 실패 시 동작 정의.

CloudWatch Alarm Rule Provider를 사용하면 Lambda 없이 직접 알람 상태를 체크할 수 있다:

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

`WaitTime: 300`은 5분 동안 알람이 OK 상태를 유지하면 게이트 통과. 알람이 ALARM 상태이거나 5분 내에 OK가 되지 않으면 실패.

> 💡 **관련 이론**: Stage 조건은 **Circuit Breaker 패턴**의 파이프라인 레벨 구현이다. Circuit Breaker는 Martin Fowler가 정리한 마이크로서비스 패턴으로, "시스템이 불안정한 상태일 때 추가적인 요청을 차단해 상황을 악화시키지 않는다"는 원칙이다. CloudWatch Alarm이 ALARM 상태(에러율 급증)일 때 `beforeEntry` 조건이 배포를 차단하는 것이 Circuit Breaker의 "OPEN" 상태와 정확히 일치한다. 현재 시스템이 문제가 있는데 새 버전을 배포하면 문제가 악화될 수 있다—Circuit Breaker는 이 상황을 자동으로 막는다. WaitTime이 Circuit Breaker의 "Half-Open" 상태 타임아웃과 유사하다.

> 📚 **사례**: Stripe의 Safe Deploy 패턴(2023 AWS re:Invent 발표). Stripe는 결제 서비스의 특성상 배포 실패가 직접적인 매출 손실로 이어진다. 이를 방지하기 위해 모든 prod 배포에 4단계 자동 게이트를 도입했다. (1) beforeEntry: 현재 에러율 < 0.1%, (2) 배포 완료 1분 후: 에러율 여전히 < 0.1%, (3) 배포 완료 5분 후: 에러율 < 0.1% + P99 레이턴시 기준선 이하, (4) 배포 완료 30분 후: 모든 CloudWatch 알람 OK. 어느 게이트에서든 실패하면 자동 롤백. 이 자동화로 배포 관련 사고가 70% 감소했다고 발표했다. 핵심은 "사람이 판단하는 시간 없이 자동으로"—배포 후 문제가 생기면 30초 이내 자동 롤백이 완료된다.

## CDK Pipelines: 파이프라인 자체가 코드가 되는 방식

CDK Pipelines는 CDK로 CodePipeline을 정의할 수 있게 해주는 고수준 구성(Construct)이다. 가장 특징적인 것은 **self-mutating** 동작—파이프라인 정의가 변경되면 파이프라인이 스스로를 업데이트한다.

```typescript
import * as cdk from 'aws-cdk-lib';
import { CodePipeline, CodePipelineSource, ShellStep, ManualApprovalStep } from 'aws-cdk-lib/pipelines';

export class PipelineStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const pipeline = new CodePipeline(this, 'Pipeline', {
      pipelineName: 'checkout-pipeline',
      selfMutation: true,           // 파이프라인 자체를 first stage로
      crossAccountKeys: true,       // Cross-Account용 KMS CMK 자동 생성
      dockerEnabledForSynth: true,  // synth 단계에서 Docker 사용
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

    // 스테이징 환경
    const stagingStage = pipeline.addStage(
      new CheckoutAppStage(this, 'Staging', {
        env: {
          account: process.env.CDK_STAGING_ACCOUNT,
          region: 'ap-northeast-2'
        }
      })
    );

    // Wave: 여러 환경을 병렬 배포
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

    // 프로덕션 (수동 승인 포함)
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

Self-mutating의 동작 원리:

```
1. 개발자가 PipelineStack 코드를 변경 (새 Stage 추가)
2. git push to main
3. 기존 파이프라인이 트리거됨
4. Synth 단계에서 새 CDK 코드를 synth → 새 CloudFormation 템플릿 생성
5. Self-Mutation 단계에서 파이프라인 자신의 CloudFormation 스택을 업데이트
6. 파이프라인이 새 정의로 재시작됨 (새 Stage가 포함된 상태로)
7. 나머지 배포 Stage 진행
```

이 덕분에 파이프라인 구조 자체도 git으로 관리되고, PR로 리뷰받을 수 있다. 파이프라인 변경이 code review 없이 콘솔에서 직접 이루어지던 문제가 해결된다.

> 💡 **관련 이론**: CDK Pipelines의 self-mutating은 **부트스트랩 문제(Bootstrap Problem)**의 우아한 해결책이다. "파이프라인 자체를 파이프라인으로 배포하려면, 처음에는 파이프라인이 없는데 어떻게 하나?" 1회성 수동 배포(`cdk deploy PipelineStack`)로 파이프라인을 처음 만들고, 이후부터는 파이프라인이 스스로를 업데이트한다. 이것은 컴파일러가 자기 자신으로 컴파일되는 **Self-hosting Compiler** 개념과 유사하다. CDK의 `crossAccountKeys: true`는 Cross-Account 배포를 위해 CMK를 자동 생성하고, `Wave`는 여러 Stage를 병렬로 배포하는 논리적 그룹이다. CDK에서 CodePipeline V2 타입을 사용하면 V2의 변수 시스템과 트리거 필터도 TypeScript로 정의할 수 있다.

> 🔍 **더 깊이**: CDK Pipelines의 `crossAccountKeys: true`가 생성하는 것. 이 옵션이 활성화되면 CDK가 자동으로 KMS CMK를 생성하고, 각 Spoke 계정의 크로스 계정 역할이 이 키를 사용해 Artifact를 복호화할 수 있도록 KMS Key Policy를 설정한다. Day 2에서 수동으로 구성했던 4종 권한 체인(Pipeline Service Role, Trust Policy, S3 Bucket Policy, KMS Key Policy)을 CDK Pipelines가 자동으로 처리한다. 이것이 CDK Pipelines를 Cross-Account 배포의 표준으로 선택하는 이유 중 하나다—IAM 설정 실수를 코드 레벨에서 방지한다.

## EventBridge Pipes: 비표준 트리거 처리

V2 트리거 필터로 커버할 수 없는 트리거—SQS 큐에 메시지가 오면, DynamoDB 테이블에 특정 항목이 추가되면, 특정 CloudWatch 알람이 OK로 바뀌면—을 처리하는 방법이 EventBridge Pipes다.

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

이 패턴을 쓰는 경우:
- 다른 파이프라인의 성공 이벤트가 이 파이프라인을 트리거 (파이프라인 체인)
- 온프레미스 시스템이 SQS에 메시지를 보내면 파이프라인 시작
- 특정 S3 이벤트(s3:ObjectCreated, 특정 키 패턴)가 파이프라인 트리거

## CodePipeline의 한계와 선택 기준

V2 파이프라인이 강력해졌지만 여전히 한계가 있다. 시험에서 "어느 경우에 GitHub Actions가 맞고 어느 경우에 CodePipeline이 맞는가"를 물을 때 이 한계를 알아야 한다.

| 요구사항 | CodePipeline V2 | GitHub Actions |
|---------|----------------|----------------|
| AWS 리소스 배포 (Cross-Account) | 네이티브 지원 | OIDC 연동 필요 |
| 매트릭스 빌드 (OS × 언어 버전) | 어색 (Action 반복 필요) | 네이티브 (matrix: 키워드) |
| PR별 독립 테스트 환경 | PARALLEL 모드 + 조건 필요 | 자동 격리 |
| 모노레포 경로 필터 | V2 filePaths (네이티브) | on.push.paths |
| 빌드 결과를 PR 상태에 표시 | 제한적 | 네이티브 (commit status) |
| 사내 네트워크 접근 | Self-hosted CodeBuild (복잡) | Self-hosted Runner (간단) |
| 멀티 클라우드 | 어색 | 자연스러움 |
| AWS 서비스 통합 (CloudTrail, SSM) | 완전한 네이티브 | OIDC + 별도 설정 |

현실적인 권장 패턴: **PR 빌드/테스트는 GitHub Actions, Prod 배포는 CodePipeline.** GitHub Actions로 빌드하고 ECR에 이미지를 푸시하면, ECR 이벤트가 CodePipeline을 트리거해서 Prod 배포를 진행한다.

> 🎯 **시나리오**: 한 팀이 100개의 마이크로서비스를 단일 모노레포에서 관리한다. 각 서비스는 별도 ECS 클러스터에 배포된다. 요구사항: (1) 각 서비스 디렉토리 변경만 해당 서비스 파이프라인 트리거, (2) PR 생성 시 임시 스테이징 환경 자동 배포, (3) main 머지 시 자동 prod 배포, (4) prod 배포 전 CloudWatch 알람 자동 확인. 해법: (1) V2 filePaths 필터로 서비스별 트리거 분리, (2) GitHub Actions로 PR 환경 배포(CodePipeline보다 PR 통합이 자연스러움), (3) main 브랜치 트리거 V2 파이프라인, (4) beforeEntry CloudWatch Alarm Rule로 배포 전 자동 게이트. 이 조합이 각 도구의 강점을 활용하는 현실적인 아키텍처다.

> 🎯 **시나리오**: 결제 서비스 팀이 "배포 프리즈(freeze)" 정책을 자동화하고 싶다. 매년 11월 25-28일(블랙프라이데이) 동안 배포를 자동으로 차단하고, 11월 29일 0시에 자동 해제해야 한다. Manual Approval만으로는 실수로 승인할 수 있다. 해결책: EventBridge Scheduler로 두 가지 시간 기반 작업을 예약한다. (1) 11월 25일 0시: Lambda 함수 실행 → `disable-stage-transition` API 호출로 Deploy Stage 전환을 차단. (2) 11월 29일 0시: 다른 Lambda → `enable-stage-transition` API 호출로 재활성화. 파이프라인이 실행되어도 Deploy Stage로 진입하지 못해서 실수로 승인이 불가능하다. V2의 Stage 조건에 날짜 기반 Lambda Rule을 추가하는 방법도 있지만 Scheduler 기반이 더 명확하다.

## 정리하며

V2 파이프라인의 세 가지 핵심 기능은 각각 다른 문제를 해결한다. **변수 시스템**은 동일 파이프라인을 여러 환경에 재사용하는 매개변수화를 가능하게 한다. **트리거 필터**는 모노레포에서 서비스별 파이프라인 독립 실행을 지원한다. **Execution Mode**는 동시 실행의 충돌(SUPERSEDED), 완전한 이력 보존(QUEUED), PR별 독립 환경(PARALLEL) 중 요구에 맞는 것을 선택하게 한다.

Stage 조건(beforeEntry)은 Circuit Breaker 패턴을 파이프라인에 구현해 자동화된 배포 게이트를 제공한다. CDK Pipelines는 파이프라인 자체를 코드로 버전 관리하고 self-mutating으로 선언적 파이프라인 관리를 실현한다. `crossAccountKeys: true` 옵션이 Cross-Account KMS 설정을 자동화한다.

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
