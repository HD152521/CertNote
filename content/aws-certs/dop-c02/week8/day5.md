# Day 5 - Week 8 복습 + 시나리오 문제 10개

📅 날짜: Week 8 (Day 5)
🎯 주제: IaC 통합 시나리오

---

## 📖 Week 8 핵심 요약

1. Nested(강결합) vs Cross-Stack(독립, Export/ImportValue)
2. StackSets Service-managed + Auto-deployment + OU 단위
3. Drift는 탐지만, Change Set은 미리보기, Custom Resource는 확장
4. CDK L1/L2/L3 + Pipelines self-mutating + Aspects
5. Terraform tfstate는 S3+DynamoDB 잠금

### 비교표

| A | B | 시험 포인트 |
|---|---|-------------|
| Nested | Cross-Stack | 결합도 |
| Self-managed | Service-managed | IAM 사전 vs 자동 |
| DeletionPolicy Retain | Snapshot | 보존 vs 백업 |
| L2 grant* | 수동 IAM | 의도 기반 |
| Drift detect | Config Rule | IaC vs 규정 |

---

## 🧠 시나리오 10개

### 1
"100 계정 OU에 GuardDuty 자동 활성화."

A) Lambda로 매 계정 호출
B) StackSets Service-managed + AutoDeployment
C) Self-managed
D) Trusted Advisor

**정답: B**

### 2
"prod DB 실수 삭제 방지."

A) IAM
B) DeletionPolicy: Snapshot + UpdateReplacePolicy: Snapshot + Termination Protection
C) Backup만
D) Stack Policy만

**정답: B**

### 3
"멀티 계정 CDK Pipeline의 핵심 설정."

A) crossAccountKeys: true + 각 계정 bootstrap with --trust
B) Lambda 호출
C) Region 변경
D) IAM User 공유

**정답: A**

### 4
"Slack 채널을 CFN으로 자동 생성."

A) Custom::SlackChannel + Lambda Provider + ResponseURL PUT
B) AWS::Slack::Channel
C) S3 객체
D) EventBridge

**정답: A**

### 5
"CFN 템플릿에 DB 비번 평문 없이."

A) `{{resolve:secretsmanager:...}}` 동적 참조
B) Parameter NoEcho
C) S3 객체
D) Env var

**정답: A**

### 6
"매일 모든 Stack의 Drift 점검 + 알림."

A) EventBridge Schedule → Lambda → DetectStackDrift → SNS
B) Config Rule만
C) Trusted Advisor
D) Backup

**정답: A**

### 7
"CDK에서 모든 리소스에 자동 태그."

A) 각 Construct 수동
B) `Aspects.of(app).add(new TagAspect())`
C) Lambda 호출
D) Terraform

**정답: B**

### 8
"StackSets에서 OU의 특정 계정 제외."

A) Self-managed로 전환
B) AccountFilterType: DIFFERENCE + Accounts 명시
C) IAM 정책
D) Lambda 우회

**정답: B**

### 9
"CDK Pipelines에서 prod에만 수동 승인 + 배포 후 SmokeTest."

A) `pre: [new ManualApprovalStep()], post: [new ShellStep()]`
B) 별도 Pipeline
C) Lambda Layer
D) Config Rule

**정답: A**

### 10
"Change Set에서 Replacement: True 표시. 의미는?"

A) 정상 업데이트
B) 리소스가 교체됨 → 다운타임/데이터 손실 위험 — 사전 검토 필수
C) 무시 가능
D) 비용 절감

**정답: B**

---

## 📌 Week 8 요약

1. CFN Nested/Cross-Stack + StackSets로 멀티 계정 거버넌스
2. Drift/Change Set/Custom Resource/Hooks가 IaC 운영의 디테일
3. CDK L1/L2/L3 + Pipelines self-mutating + Aspects가 모던 패턴
4. Terraform은 멀티 클라우드 + tfstate S3+Dynamo 잠금

## 🔜 Week 9 예고

**구성 관리 - SSM, AppConfig, Parameter Store, Secrets Manager**

---

> 💪 Week 8 완료!
