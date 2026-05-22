# Day 4 - 동적 파이프라인 - V2 + 변수, 트리거 필터링

📅 날짜: Week 5 (Day 4)
🎯 주제: V2 파이프라인의 유연성 — 입력 변수, 경로 필터, 다중 실행 모드
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- V2 Pipeline의 입력 변수와 Action 변수 시스템을 능숙히 사용한다
- Git 트리거의 브랜치/태그/경로 필터로 모노레포 시나리오 해결
- Execution Mode 3종(SUPERSEDED/QUEUED/PARALLEL)을 시나리오에 매핑
- CodePipeline의 한계와 보완 패턴 (Lambda 트리거, EventBridge Pipes)

---

## 🧩 사전 지식 (CS 기초)

- **Monorepo**: 여러 프로젝트를 한 저장소에. 트리거 필터로 영향받는 프로젝트만 빌드.
- **Trunk-based + path filter**: 모노레포 + main 단일 브랜치 + 경로 필터로 마이크로서비스별 파이프라인.
- **Concurrency Control**: 동시 실행 제어. SUPERSEDED는 마지막만, QUEUED는 순차.
- **Idempotent pipeline**: 동일 commit 재실행 시 동일 결과.

---

## 📖 이론 내용

### 1. V2 입력 변수 (Pipeline Variables)

파이프라인 실행 시작 시 입력받는 변수.

```json
{
  "name": "MyApp",
  "pipelineType": "V2",
  "variables": [
    {
      "name": "Environment",
      "defaultValue": "staging",
      "description": "Target environment",
      "allowedPattern": "^(staging|prod)$"
    }
  ],
  ...
}
```

**시작 시 변수 지정:**
```bash
aws codepipeline start-pipeline-execution \
  --name MyApp \
  --variables name=Environment,value=prod
```

Action에서 참조: `#{variables.Environment}` 또는 `#{Pipeline.Variables.Environment}`.

### 2. Action 출력 변수

각 Action 종류별 자동 노출 변수:

| Action 종류 | 변수 |
|-------------|------|
| Source (CodeCommit) | `CommitId`, `CommitMessage`, `CommitterDate`, `RepositoryName`, `BranchName` |
| Source (GitHub via CodeStar) | `CommitId`, `BranchName`, `FullRepositoryName` |
| Source (ECR) | `ImageDigest`, `ImageTag`, `ImageURI`, `RegistryId`, `RepositoryName` |
| Source (S3) | `ETag`, `VersionId` |
| CodeBuild | `exported-variables`에 정의한 모든 변수 |
| CloudFormation | `StackName` |
| Lambda Invoke | `outputVariables`에 보낸 값 |

참조: `#{SourceVariables.CommitId}`, `#{BuildVariables.VERSION}`.

### 3. Trigger 필터링 (V2)

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
              "excludes": ["release/2020-*"]
            },
            "filePaths": {
              "includes": ["src/checkout/**", "lib/shared/**"],
              "excludes": ["src/checkout/docs/**"]
            }
          }
        ],
        "pullRequest": [
          {
            "events": ["OPEN", "UPDATED"],
            "branches": {"includes": ["main"]}
          }
        ]
      }
    }
  ]
}
```

**모노레포 패턴:**
- 서비스마다 파이프라인 분리
- 각 파이프라인의 filePaths에 그 서비스 디렉토리
- 한 commit이 여러 서비스 건드리면 여러 파이프라인 동시 시작

### 4. Execution Mode 3종

| 모드 | 동작 | 사용 사례 |
|------|------|-----------|
| **SUPERSEDED** | 새 실행이 진행 중 실행을 무효화 (이전 commit 빌드 중단) | 빠른 main 브랜치 |
| **QUEUED** | 큐에 쌓아 FIFO 순차 실행 | 모든 commit 빌드 보존 |
| **PARALLEL** | 여러 실행 동시 진행 | 다중 PR 빌드 |

```bash
aws codepipeline update-pipeline \
  --pipeline file://pipeline.json
# pipeline.json: "executionMode": "QUEUED"
```

> ⚠️ PARALLEL 모드는 동일 리소스를 두 실행이 동시에 변경하지 않도록 주의 (예: 같은 prod stack에 동시 deploy).

### 5. Stage 수준 조건 (Conditions, 2024+)

```json
{
  "name": "DeployProd",
  "beforeEntry": {
    "conditions": [{
      "result": "FAIL",
      "rules": [{
        "name": "AlarmCheck",
        "ruleTypeId": {
          "category": "Rule",
          "owner": "AWS",
          "provider": "LambdaInvoke",
          "version": "1"
        },
        "configuration": {"FunctionName": "AlarmGate"}
      }]
    }]
  }
}
```

Stage 진입 전 자동 검증 → 실패면 Stage 건너뜀.

### 6. CodePipeline의 한계와 보완

**한계:**
- 동시 PR 빌드는 GitHub Actions가 더 강력
- 동적 매트릭스(언어 버전 × 운영체제 × 아키텍처)는 어색
- 빌드 결과를 즉시 PR 코멘트로 반영 어려움
- 1000+ 마이크로서비스 환경에서 1000+ Pipeline 관리 부담

**보완 패턴:**
- 외부 GitHub Actions 사용 + CodePipeline은 prod 배포만
- Lambda + EventBridge Pipes로 커스텀 파이프라인 워크플로
- CDK Pipelines로 Pipeline 자체를 IaC + 자동 self-mutation

---

## 🧠 알아두면 좋은 심화 이론

### CDK Pipelines

```typescript
import { CodePipeline, CodePipelineSource, ShellStep } from 'aws-cdk-lib/pipelines';

const pipeline = new CodePipeline(this, 'Pipeline', {
  pipelineName: 'MyApp',
  synth: new ShellStep('Synth', {
    input: CodePipelineSource.gitHub('my-org/my-app', 'main'),
    commands: ['npm ci', 'npm run build', 'npx cdk synth'],
  }),
});

pipeline.addStage(new MyAppStage(this, 'Dev', { env: { account: 'DEV', region: 'ap-northeast-2' }}));
pipeline.addStage(new MyAppStage(this, 'Prod', { env: { account: 'PRD', region: 'ap-northeast-2' }}), {
  pre: [new ManualApprovalStep('Approve')]
});
```

CDK가 자동으로 Pipeline 자체를 self-mutate → 코드 변경이 다음 실행에 반영.

### EventBridge Pipes로 트리거 우회

특이한 트리거 (예: SQS 큐에 메시지가 오면 파이프라인 시작):
- EventBridge Pipes로 SQS → Lambda → StartPipelineExecution
- Pipeline 자체엔 트리거 없이 외부에서 시작

### Pipeline에서 외부 Git 직접 처리

CodeStar Connections로 GitHub/Bitbucket/GitLab 통합:
- OAuth 1회 인증
- Webhook 자동 구성
- 토큰 자동 관리

### 알아두면 좋은 V2 한계

- Pipeline 내 Stage 50개, Action 200개 한도
- Action input artifact 10개 한도
- Variable name 길이 100자
- 비활성 Pipeline도 월 $1 청구 (V1은 첫 30일 무료, V2는 없음)

### 관련 서비스 Cross-Reference

- **CDK Pipelines** → Week 8 Day 4
- **EventBridge Pipes** → Week 12 Day 1
- **GitHub Actions** → Week 2 Day 2
- **모노레포 + ECR** → Week 6 Day 1

---

## 🏗️ 아키텍처 다이어그램

```
V2 Pipeline with Variables and Trigger Filters
==================================================

  Monorepo: my-org/services-monorepo
  ├── services/
  │   ├── checkout/
  │   ├── inventory/
  │   └── notifications/
  └── shared/

  CheckoutPipeline (V2)
   Triggers:
     branches: [main]
     filePaths: ["services/checkout/**", "shared/**"]
   Variables:
     Environment (staging|prod), defaultValue=staging

  Stage flow:
     Source ─► Build ─► Test ─► [Lambda: smoke]
                                    │
                                    │ outputVariables: SMOKE_OK
                                    ▼
                               [Manual Approval]
                                    │
                                    ▼
                          [BeforeEntry condition: AlarmCheck Lambda]
                                    │
                                    ▼
                               Deploy ─► uses #{variables.Environment}

  Execution mode = QUEUED → 매 commit 보존

  When commit touches services/checkout/* AND services/inventory/*:
     - CheckoutPipeline starts
     - InventoryPipeline starts (parallel)
   Both can deploy concurrently to their own resources.
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ V2 변수: 입력 변수 + Action 변수 + Pipeline 메타. `#{Namespace.Variable}` 참조
2. ⭐ Trigger filter (branches/filePaths)로 모노레포 마이크로서비스별 파이프라인
3. ⭐ Execution Mode: SUPERSEDED(기본) / QUEUED(보존) / PARALLEL(다중 PR)
4. ⭐ Stage `beforeEntry` 조건으로 자동 게이트(알람 체크 등)
5. ⭐ CDK Pipelines가 Pipeline 자체를 self-mutating IaC로 만듦

---

## 💻 실제 예시 - 모노레포 V2 Pipeline

```json
{
  "name": "checkout-pipeline",
  "pipelineType": "V2",
  "executionMode": "QUEUED",
  "variables": [
    {
      "name": "Environment",
      "defaultValue": "staging",
      "allowedPattern": "^(staging|prod)$"
    },
    {
      "name": "Reason",
      "defaultValue": ""
    }
  ],
  "triggers": [{
    "providerType": "CodeStarSourceConnection",
    "gitConfiguration": {
      "sourceActionName": "Source",
      "push": [{
        "branches": {"includes": ["main"]},
        "filePaths": {
          "includes": ["services/checkout/**", "shared/lib/**"]
        }
      }]
    }
  }],
  "stages": [
    {
      "name": "Source",
      "actions": [{
        "name": "Source",
        "actionTypeId": {"category":"Source","owner":"AWS","provider":"CodeStarSourceConnection","version":"1"},
        "configuration": {
          "ConnectionArn": "arn:aws:codestar-connections:...:connection/...",
          "FullRepositoryId": "my-org/services-monorepo",
          "BranchName": "main"
        },
        "outputArtifacts": [{"name":"SourceArtifact"}]
      }]
    },
    {
      "name": "Build",
      "actions": [{
        "name": "Build",
        "actionTypeId": {"category":"Build","owner":"AWS","provider":"CodeBuild","version":"1"},
        "configuration": {
          "ProjectName": "checkout-build",
          "EnvironmentVariables": "[{\"name\":\"ENV\",\"value\":\"#{variables.Environment}\"}]"
        },
        "inputArtifacts": [{"name":"SourceArtifact"}],
        "outputArtifacts": [{"name":"BuildArtifact"}]
      }]
    },
    {
      "name": "Deploy",
      "beforeEntry": {
        "conditions": [{
          "result": "FAIL",
          "rules": [{
            "name": "AlarmCheck",
            "ruleTypeId": {"category":"Rule","owner":"AWS","provider":"LambdaInvoke","version":"1"},
            "configuration": {"FunctionName": "PreDeployAlarmGate"}
          }]
        }]
      },
      "actions": [{
        "name": "Deploy",
        "actionTypeId": {"category":"Deploy","owner":"AWS","provider":"CloudFormation","version":"1"},
        "configuration": {
          "StackName": "checkout-#{variables.Environment}",
          "TemplatePath": "BuildArtifact::template.yaml",
          "ActionMode": "CREATE_UPDATE",
          "RoleArn": "arn:aws:iam::SPOKE-ACCT:role/CFNExecRole"
        },
        "inputArtifacts": [{"name":"BuildArtifact"}]
      }]
    }
  ]
}
```

---

## 📝 연습 문제

**문제 1.** 모노레포에서 한 서비스의 변경만 그 서비스 파이프라인을 트리거하려면?

A) Webhook 폴링
B) V2 Trigger의 filePaths includes 조건
C) Lambda로 변경 감지 후 StartPipelineExecution
D) GitHub Actions만 사용

**정답: B**
해설: V2 filePaths 필터가 표준. C도 가능하지만 V2 네이티브가 정답.

---

**문제 2.** 모든 commit을 빌드하고 싶고, 새 commit이 진행 중 실행을 죽이지 않게 하려면?

A) Execution Mode SUPERSEDED
B) Execution Mode QUEUED
C) Execution Mode PARALLEL
D) 트리거 비활성화

**정답: B**
해설: QUEUED는 FIFO 순차. 모든 commit 보존.

---

**문제 3.** V2 Pipeline에서 Build Action의 환경 변수에 사용자 입력 값을 주입하려면?

A) `#{variables.Environment}` 같은 변수 참조
B) Lambda로 매번 변경
C) 환경 변수 정적 정의
D) Pipeline 재생성

**정답: A**
해설: V2 변수 시스템.

---

**문제 4.** Stage 진입 전 알람 상태를 자동 체크하려면?

A) Manual Approval 추가
B) Stage `beforeEntry` conditions + Lambda Rule
C) EventBridge로 외부 처리
D) Trusted Advisor

**정답: B**
해설: 2024+ V2 기능 — beforeEntry conditions.

---

**문제 5.** PARALLEL 실행 모드의 위험은?

A) 비용 절감
B) 두 실행이 같은 prod 리소스에 동시 접근 시 충돌 가능
C) 자동 직렬화
D) IAM 권한 부족

**정답: B**
해설: PARALLEL은 동시성 관리 책임이 사용자. 같은 자원 충돌 주의.

---

**문제 6.** CDK Pipelines의 self-mutating 특성은?

A) 자기 자신을 Stage로 갖고 코드 변경이 다음 실행에 반영
B) 자기 자신을 삭제
C) 매번 새 파이프라인 생성
D) Lambda로 변환

**정답: A**
해설: CDK Pipelines의 핵심 특징.

---

**문제 7.** Action 출력 변수의 표준 참조 형식은?

A) `${ActionName.VAR}`
B) `#{ActionName.VAR}`
C) `$[VAR]`
D) `%VAR%`

**정답: B**
해설: V2 표준 변수 구문.

---

## 📌 오늘의 요약

1. V2 변수 시스템 = 입력 변수 + Action 출력 변수 + 메타 (`#{Namespace.Name}`)
2. Trigger 필터로 모노레포 마이크로서비스별 파이프라인
3. Execution Mode 3종 — QUEUED는 보존, PARALLEL은 다중 PR
4. Stage `beforeEntry` 조건으로 자동 게이트
5. CDK Pipelines로 self-mutating IaC 파이프라인
