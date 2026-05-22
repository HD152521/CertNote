# Day 5 - Week 9 복습 + 시나리오 문제 10개

📅 날짜: Week 9 (Day 5)

---

## 📖 Week 9 핵심 요약

1. SSM 5종 + Session Manager로 SSH 제거 + Patch Manager 자동화
2. State Manager로 원하는 상태 정기 강제 + Inventory → Athena
3. AppConfig 5요소(App+Env+Profile+Strategy+Version) + Validator + Monitor 자동 롤백
4. Secrets Manager 회전 vs Parameter Store 단순/저비용
5. Cross-Account 시크릿은 CMK 필수

---

## 🧠 시나리오 10개

### 1
"수백 EC2에 OS 패치 자동, 토요일 새벽만."
A) Run Command 매번 수동
B) Patch Manager + Patch Baseline + Patch Group + Maintenance Window
C) Lambda 매일 호출
D) SSH 스크립트

**정답: B**

### 2
"피처를 코드 배포 없이 10% → 100%, 5xx 발생 시 자동 롤백."
A) Parameter Store
B) AppConfig + Linear Strategy + Environment Alarm Monitor
C) S3 객체 + Lambda
D) Pipeline 재배포

**정답: B**

### 3
"RDS Master Password 30일 zero-downtime 회전."
A) Single User Rotation
B) Multi-User Rotation (alternating users)
C) Parameter Store
D) Lambda 수동

**정답: B**

### 4
"100 설정값 + 5 비밀번호의 비용 최적화."
A) 모두 Secrets Manager $44/월
B) Parameter Store Standard 100 ($0) + Secrets Manager 5 ($2/월)
C) Parameter Store Advanced 전체
D) 환경 변수

**정답: B**

### 5
"Cross-Account에서 다른 계정 시크릿을 가져왔지만 KMS error. 원인?"
A) 시크릿이 AWS 관리형 키로 암호화 → CMK로 재생성 필요
B) IAM Policy
C) VPC Peering
D) Region

**정답: A**

### 6
"SSH 키 관리 부담 제거 + 모든 세션 감사."
A) Bastion EC2 + SSH 키 회전
B) Session Manager + CloudWatch Logs + S3
C) VPN
D) IAM User

**정답: B**

### 7
"새 EC2가 시작될 때마다 CloudWatch Agent 자동 설치."
A) AMI에 굽기 (가능하나 업데이트 어려움)
B) State Manager Association + AWS-ConfigureAWSPackage
C) Lambda 트리거
D) Userdata 매번 수정

**정답: B**

### 8
"100만 EC2 인벤토리를 SQL로 분석."
A) DynamoDB
B) Resource Data Sync → S3 → Athena
C) CloudWatch Logs Insights
D) Trusted Advisor

**정답: B**

### 9
"Lambda에서 시크릿을 매번 SDK로 가져와 비용·throttle 문제."
A) DynamoDB 캐시
B) AWS Parameters and Secrets Lambda Extension (localhost:2773 + 캐시)
C) S3 캐시
D) Layer 시크릿 포함

**정답: B**

### 10
"신규 멤버 계정이 OU에 추가될 때 자동으로 SSM Patch Baseline 적용."
A) Lambda
B) StackSets로 Patch Baseline + Patch Group 자동 배포 (Service-managed AutoDeployment)
C) IAM
D) State Manager만

**정답: B**

---

## 🔜 Week 10 예고

**모니터링 심화 - CloudWatch**

> 💪 Week 9 완료!
