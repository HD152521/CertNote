# Day 5 - Week 5 복습 + 시나리오 문제 10개

📅 날짜: Week 5 (Day 5)
🎯 주제: CodePipeline 통합 시나리오

---

## 📖 Week 5 핵심 요약

### 1줄 요약

1. Pipeline / Stage / Action / Transition 계층 + 6 카테고리 Action
2. Cross-Account 4종 권한: AssumeRole + Trust + S3 Policy + KMS Key Policy
3. Lambda Invoke는 PutJobResult 필수, 15분 초과는 Step Functions
4. V2 변수 시스템과 트리거 필터로 모노레포·동적 파이프라인
5. CDK Pipelines로 self-mutating IaC

### 헷갈리기 쉬운 비교표

| A | B | 시험 포인트 |
|---|---|-------------|
| runOrder 동일 | 다름 | 병렬 vs 직렬 |
| Action roleArn | Configuration.RoleArn | Action 가정 vs CFN 실행 |
| SUPERSEDED | QUEUED | 무효화 vs 보존 |
| Lambda Action | Step Functions Action | 15분 한도 |
| Branch Protection (GitHub) | Approval Rule (CodeCommit) | 머지 게이트 |
| Manual Approval | beforeEntry condition | 사람 vs 자동 게이트 |

---

## 🧠 실전 시나리오 문제 10개

### 시나리오 1
Tooling 계정의 Pipeline이 Prod 계정 ECS에 배포한다. "S3 GetObject은 되지만 Artifact 추출 시 KMS error"가 발생. 원인은?

A) IAM Identity Policy 부족
B) KMS Key Policy에 Spoke 계정 Decrypt grant 누락 + Spoke Role에 kms:Decrypt 권한 누락
C) S3 Bucket Policy
D) VPC Endpoint 부재

**정답: B**
해설: 가장 흔한 함정. S3와 KMS는 별도 정책 양쪽 다 grant 필요.

---

### 시나리오 2
한 commit이 services/checkout/와 services/inventory/ 양쪽을 건드린다. 두 서비스의 별도 파이프라인이 동시에 시작되어야 한다. 가장 적절한 구성은?

A) V2 트리거의 filePaths includes 별도 정의된 두 파이프라인
B) 단일 파이프라인에 두 빌드 Action
C) Lambda로 매번 분기
D) 모노레포 분리

**정답: A**
해설: V2 trigger filePath가 모노레포 표준.

---

### 시나리오 3
"매 commit을 보존하면서 빌드, 단 deploy는 마지막만." 가장 적절한 구성은?

A) Execution Mode QUEUED + Deploy Stage 진입 전 SkipCondition으로 최신 실행만 통과
B) PARALLEL
C) SUPERSEDED
D) Pipeline 두 개

**정답: A**
해설: QUEUED + 조건부 게이트가 응용 패턴.

---

### 시나리오 4
PR 머지 시 자동 빌드 + Slack에 상태 알림 + main에 한해 staging 배포. 가장 적절한 구성은?

A) GitHub Branch Protection + GitHub Actions로 PR 빌드 + main 머지 시 CodePipeline 트리거 + CodeStar Notifications → Chatbot → Slack
B) 모두 Lambda로 처리
C) CodeCommit으로 이전
D) 수동 처리

**정답: A**
해설: 각 도구의 강점 결합.

---

### 시나리오 5
"prod 배포 전 CloudWatch 알람이 OK 상태인지 자동 확인" 패턴은?

A) Manual Approval만
B) Stage beforeEntry condition + Lambda Rule이 알람 상태 조회 후 FAIL이면 Stage 건너뜀
C) Lambda Action만
D) X-Ray만

**정답: B**
해설: V2 beforeEntry conditions가 표준.

---

### 시나리오 6
Lambda Invoke Action에서 20분 작업이 필요. 가장 적절한 구성은?

A) Step Functions Action으로 변경 + 워크플로 안에서 Lambda 호출
B) Lambda timeout을 20분으로 (실제로 15분 한도)
C) Pipeline timeout 늘리기
D) Custom Action Provider

**정답: A**
해설: Lambda 15분 한도, Step Functions이 정공법.

---

### 시나리오 7
"수동 승인 SNS 알림이 10명 운영자에게 가야 한다. Slack 채널에도." 가장 적절한 구성은?

A) Manual Approval → SNS Topic → 이메일 구독 10명 + AWS Chatbot Slack 구독
B) Lambda 10번 호출
C) 각자 콘솔 모니터링
D) Pipeline 분리

**정답: A**
해설: SNS의 multi-subscriber 패턴.

---

### 시나리오 8
CloudFormation StackSets Action으로 모든 OU에 배포. 새 멤버 계정 추가 시 자동 적용되려면?

A) OrganizationsAutoDeployment: Enabled
B) Lambda로 매번 확장
C) 수동 추가
D) IAM Identity Center

**정답: A**
해설: StackSets Auto-deployment가 새 계정에 자동 적용.

---

### 시나리오 9
"빌드 결과 IMAGE_TAG를 다음 Deploy Stage가 사용해야 한다." V2에서 가장 적절한 방법은?

A) S3에 저장 후 다음 Stage가 읽음
B) CodeBuild의 exported-variables + V2 변수 `#{BuildVariables.IMAGE_TAG}`
C) 환경 변수 ssh
D) 메모리 공유

**정답: B**
해설: V2 변수 시스템.

---

### 시나리오 10
"CDK로 Pipeline 자체를 IaC 관리하고, Pipeline 코드 변경이 자동 반영되길 원한다."

A) CDK Pipelines의 self-mutating 패턴
B) CloudFormation Update Stack
C) Lambda로 변경 적용
D) 수동 변경

**정답: A**
해설: CDK Pipelines가 자기 자신을 첫 Stage로.

---

## 📌 Week 5 요약

1. Pipeline 계층 구조와 6 카테고리 Action 외우기
2. Cross-Account 4종 권한 (AssumeRole + Trust + S3 + KMS)
3. Lambda Invoke / Step Functions / Manual Approval로 임의 로직 통합
4. V2 변수 + 트리거 필터 + Execution Mode
5. CDK Pipelines로 self-mutating IaC

---

## 🔜 다음 주 예고 (Week 6)

**컨테이너 CI/CD - ECR, ECS, EKS, GitOps**

- Day 1: ECR — 이미지 스캔, 수명 주기, 복제
- Day 2: ECS 자동 배포 - Task Definition 자동화
- Day 3: EKS CI/CD - Helm, ArgoCD, Flux
- Day 4: App Runner / Copilot
- Day 5: 시나리오 문제 10개

---

> 💪 Week 5 완료! 파이프라인 설계의 모든 도구를 손에 쥐었습니다.
