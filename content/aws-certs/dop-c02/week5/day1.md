# Day 1 - CodePipeline 구조 - Stage, Action, Artifact

📅 날짜: Week 5 (Day 1)
🎯 주제: CodePipeline 모델의 핵심 — 단계·액션·산출물의 흐름
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Pipeline / Stage / Action / Transition의 계층을 안다
- Input/Output Artifact가 S3 + KMS로 저장되는 방식을 이해한다
- Action 카테고리 6종(Source/Build/Test/Deploy/Approval/Invoke)
- Transition 비활성화, 재실행, 부분 시작의 의미

---

## 🧩 사전 지식 (CS 기초)

- **Pipeline as Code**: Jenkinsfile, GitHub Actions YAML 등 파이프라인을 코드로.
- **DAG (Directed Acyclic Graph)**: 단방향 비순환 그래프. CI/CD 단계 의존 표현.
- **Idempotent execution**: 같은 입력에 같은 결과. 재실행 안전.
- **Artifact compression**: 대용량 객체의 효율적 저장. zip + S3.
- **KMS Key Policy**: 키를 누가 사용할 수 있는지 정의. IAM과 별개로 검증.

---

## 📖 이론 내용

### 1. CodePipeline 계층 구조

```
Pipeline (전체 워크플로)
├── Stage 1 (예: Source)
│   ├── Action: SourceCheckout (Source category, GitHub provider)
│   └── (Stage 내 Action 병렬 가능)
├── Stage 2 (예: Build)
│   ├── Action: BuildApp (Build category, CodeBuild provider)
│   └── Action: BuildDocs (병렬)
├── Transition (Stage 사이 자동 전이, 수동 비활성화 가능)
├── Stage 3 (예: Test)
│   └── Action: IntegrationTest
├── Stage 4 (예: Approval)
│   └── Action: ManualApproval
└── Stage 5 (예: Deploy)
    └── Action: DeployToProd
```

### 2. Action 6 카테고리

| 카테고리 | 대표 Provider |
|----------|---------------|
| **Source** | CodeCommit, GitHub (via CodeStar Connections), S3, ECR, Bitbucket, CodeArtifact |
| **Build** | CodeBuild, Jenkins, GitHub Actions, custom |
| **Test** | CodeBuild, third-party (Ghost Inspector, Runscope, etc.) |
| **Deploy** | CodeDeploy, CloudFormation, ECS, Elastic Beanstalk, S3, Service Catalog, AppConfig, OpsWorks |
| **Approval** | Manual (SNS 알림) |
| **Invoke** | Lambda, Step Functions |

### 3. Artifact — Input vs Output

각 Action은:
- `inputArtifacts: []` — 받을 산출물 이름
- `outputArtifacts: []` — 생성할 산출물 이름

```json
{
  "name": "BuildApp",
  "actionTypeId": {
    "category": "Build",
    "owner": "AWS",
    "provider": "CodeBuild",
    "version": "1"
  },
  "inputArtifacts": [{"name": "SourceArtifact"}],
  "outputArtifacts": [{"name": "BuildArtifact"}],
  "configuration": {"ProjectName": "MyAppBuild"}
}
```

**저장 위치**: Artifact Store S3 버킷 (Pipeline 생성 시 자동) + KMS 키.

### 4. Cross-Account Artifact

다른 계정의 Action이 동일 산출물을 사용하려면:
- Artifact S3 버킷 정책에 다른 계정 액세스
- KMS Key Policy에 다른 계정 grant
- 다른 계정의 IAM Role이 `kms:Decrypt` 허용

### 5. Transition

각 Stage 사이의 전이 게이트:
- 기본 활성 — 이전 Stage 성공 시 자동 다음 Stage
- 수동 비활성화 가능 (예: 주말에는 prod 배포 중지)
- 일시 정지 시 이전 Stage는 계속 실행

```bash
aws codepipeline disable-stage-transition \
  --pipeline-name MyApp \
  --stage-name Deploy \
  --transition-type Inbound \
  --reason "Weekend freeze"
```

### 6. Pipeline Execution Mode

- **SUPERSEDED** (기본): 새 실행이 이전 실행을 무효화
- **QUEUED** (V2): 큐에 쌓아 순차 실행
- **PARALLEL** (V2): 동시 실행 (서로 다른 commit)

### 7. V1 vs V2 Pipeline

| 기능 | V1 | V2 |
|------|----|----|
| 변수 | 제한적 | 풍부 (입력 변수, Action 변수) |
| 트리거 | Webhook on push | 브랜치/태그/경로 필터 |
| Execution Mode | SUPERSEDED only | + QUEUED, PARALLEL |
| 비용 | 활성 파이프라인 월 $1 | $1 (V2) + 실행당 추가 |

> 2024+: V2가 모든 신규 권장. V1 → V2 마이그레이션 도구 존재.

---

## 🧠 알아두면 좋은 심화 이론

### Artifact 크기 한도

- 각 Action의 input/output Artifact 크기: **5GB** (확장 가능 요청)
- CodeBuild 산출물 → S3 → 다음 Action 입력 (zip 압축)
- 큰 산출물은 ECR (컨테이너) 또는 S3 직접 (Pipeline 외부)로 분리

### Action 병렬 vs 직렬

- 한 Stage 내 Action들은 `runOrder` 같으면 병렬, 다르면 직렬
- 다른 Stage 간엔 항상 직렬 (Transition으로 연결)

```json
{"name": "lint", "runOrder": 1},
{"name": "unit_test", "runOrder": 1},      // 위와 병렬
{"name": "integration", "runOrder": 2}      // lint+unit 후
```

### Action Retry

V2에서 Action 실패 시 자동 재시도 지원 (Action 설정). 비결정적 빌드 실패에 유용.

### Pipeline 자체의 IAM Role

- Pipeline Service Role: CodePipeline이 Action을 호출할 권한
- Action별 별도 Role 가능 (Cross-Account 시 필수)
- Service Role + Action Role 조합으로 보안 분리

### EventBridge로 Pipeline 시작

```json
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Repository State Change"],
  "detail": {
    "event": ["referenceUpdated"],
    "referenceType": ["branch"],
    "referenceName": ["main"]
  }
}
```

기본 폴링보다 즉각적 + API 비용 절감.

### 관련 서비스 Cross-Reference

- **CodeStar Connections** → Week 2 Day 2
- **CloudFormation Action** → Week 8 Day 1
- **Manual Approval Action** → Week 5 Day 3
- **Step Functions Action** → Week 5 Day 3

---

## 🏗️ 아키텍처 다이어그램

```
CodePipeline Anatomy
==================================================

  Source Stage          Build Stage           Test Stage          Approval         Deploy Stage
  +-----------+         +-----------+         +-----------+       +--------+       +---------+
  | GitHub    | ───►    | CodeBuild | ───►    | CodeBuild | ───►  | Manual | ───►  |Code     |
  | Source    |         | Compile   |         | E2E       |       | Approve|       |Deploy   |
  |           |         |           |         |           |       |        |       | (prod)  |
  +-----+-----+         +-----+-----+         +-----+-----+       +---+----+       +---------+
        |                     |                     |                 |
   outputs:                outputs:              outputs:        notify SNS
   SourceArtifact          BuildArtifact         TestReport
        |                     |                     |
        └──────────► Artifact S3 (encrypted by KMS) ────────────────────────────►

  Each Stage:
   - Multiple Actions possible (runOrder controls parallel/serial)
   - Transition between Stages (can be disabled)
   - Input/Output Artifacts referenced by name

  V2 features:
   - Variables: #{SourceVariables.CommitId}, #{BuildVariables.IMAGE_TAG}
   - Trigger filters: branch=main, path=src/**
   - Execution modes: SUPERSEDED / QUEUED / PARALLEL
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Artifact는 S3 + KMS로 저장 — Cross-Account 시 KMS Key Policy도 grant
2. ⭐ Stage 내 Action은 `runOrder` 같으면 병렬, 다르면 직렬
3. ⭐ Transition 수동 비활성화로 일시 freeze 가능
4. ⭐ V2 Pipeline = 변수 + 트리거 필터 + 다중 실행 모드 (2024+ 표준)
5. ⭐ Pipeline Service Role + Action별 Role 분리가 보안 모범사례

---

## 💻 실제 예시 - Pipeline 정의

```yaml
# pipeline.yaml (CloudFormation)
Resources:
  MyPipeline:
    Type: AWS::CodePipeline::Pipeline
    Properties:
      Name: MyApp-Prod
      PipelineType: V2
      RoleArn: !GetAtt PipelineRole.Arn
      ArtifactStore:
        Type: S3
        Location: !Ref ArtifactBucket
        EncryptionKey:
          Id: !GetAtt ArtifactKMSKey.Arn
          Type: KMS
      Triggers:
        - ProviderType: CodeStarSourceConnection
          GitConfiguration:
            SourceActionName: SourceCheckout
            Push:
              - Branches:
                  Includes: [main]
                FilePaths:
                  Includes: ["src/**"]
                  Excludes: ["docs/**"]
      Stages:
        - Name: Source
          Actions:
            - Name: SourceCheckout
              ActionTypeId:
                Category: Source
                Owner: AWS
                Provider: CodeStarSourceConnection
                Version: 1
              OutputArtifacts:
                - Name: SourceArtifact
              Configuration:
                ConnectionArn: !Ref GitHubConnection
                FullRepositoryId: my-org/my-app
                BranchName: main
        - Name: Build
          Actions:
            - Name: BuildApp
              ActionTypeId:
                Category: Build
                Owner: AWS
                Provider: CodeBuild
                Version: 1
              InputArtifacts:
                - Name: SourceArtifact
              OutputArtifacts:
                - Name: BuildArtifact
              Configuration:
                ProjectName: MyAppBuild
              RunOrder: 1
            - Name: BuildDocs
              ActionTypeId: {...}
              RunOrder: 1   # 병렬 실행
        - Name: Test
          Actions: [{...}]
        - Name: Approve
          Actions:
            - Name: ManualApproval
              ActionTypeId:
                Category: Approval
                Owner: AWS
                Provider: Manual
                Version: 1
              Configuration:
                NotificationArn: !Ref ApprovalTopic
                CustomData: "Approve prod deployment"
        - Name: Deploy
          Actions: [{...}]
```

---

## 📝 연습 문제

**문제 1.** 같은 Stage 내 두 Action을 병렬로 실행하려면?

A) 동일 runOrder
B) 서로 다른 Stage로 분리
C) Transition 비활성화
D) Lambda Action으로 변환

**정답: A**
해설: runOrder 동일 = 병렬.

---

**문제 2.** 다른 계정의 Action이 Artifact를 사용하려면 필수가 아닌 것은?

A) Artifact S3 버킷 정책
B) KMS Key Policy grant
C) 다른 계정의 IAM Role에 S3+KMS 권한
D) Cross-Region VPC Peering

**정답: D**
해설: 네트워크 불필요. IAM + S3 + KMS만으로 충분.

---

**문제 3.** Pipeline V2의 추가 기능이 아닌 것은?

A) 변수 시스템
B) 트리거 경로/브랜치 필터
C) QUEUED / PARALLEL 실행 모드
D) Stage 자동 생성

**정답: D**
해설: Stage는 항상 명시. 자동 생성 없음.

---

**문제 4.** 주말에 prod 배포를 일시 차단하려면?

A) Pipeline 삭제
B) Deploy Stage의 Inbound Transition 비활성화 → 자동 시작 차단, 이전 Stage는 계속
C) Action 삭제
D) IAM Role 박탈

**정답: B**
해설: Transition 비활성화가 표준.

---

**문제 5.** Artifact 크기 한도는?

A) 100MB
B) 1GB
C) 5GB (확장 가능)
D) 무제한

**정답: C**
해설: 기본 5GB. 더 큰 산출물은 S3 직접 사용.

---

**문제 6.** Pipeline이 자동으로 시작되지 않는다. 가장 흔한 원인은?

A) S3 Source의 EventBridge Rule 또는 GitHub Webhook 미구성
B) IAM Role 누락 (가능하지만 가장 흔한 건 트리거)
C) KMS 키 없음
D) Stage 부족

**정답: A**
해설: 트리거 구성이 트러블슈팅 1순위.

---

**문제 7.** Pipeline의 Service Role과 Action Role의 관계는?

A) 동일
B) Service Role은 Pipeline이 Action을 호출, Action Role은 cross-account 등 특수 권한 위임용
C) Action Role은 사용 안 함
D) IAM User만 가능

**정답: B**
해설: 두 Role의 역할 분리 — 보안 모범사례.

---

## 📌 오늘의 요약

1. Pipeline / Stage / Action / Transition 계층 외우기
2. Action 6 카테고리: Source / Build / Test / Deploy / Approval / Invoke
3. Artifact는 S3 + KMS, Cross-Account 시 둘 다 grant
4. runOrder 동일 = 병렬, 다르면 직렬
5. V2 Pipeline이 변수·필터·다중 실행 모드의 모던 표준
