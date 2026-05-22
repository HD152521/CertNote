# Day 79 - 도메인 4 종합: 지속적 개선 (25%)

📅 Week 16 (Day 4)
🎯 주제: 운영·비용·성능·보안 지속 개선
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- 운영 자동화·관측성·SRE 패턴
- 비용·성능·복원력 지속 최적화

---

## 📌 도메인 4 핵심 (한 페이지)

### 관측성

- **CloudWatch**: 메트릭·로그·알람·대시보드·Synthetics·RUM·Application Insights
- **X-Ray**·**ADOT**·**ServiceLens**: 분산 추적
- **CloudTrail Lake**·**Config**·**Audit Manager**: 감사·컴플라이언스

### 자동화

- **Systems Manager**: Patch·Session·Run Command·Inventory·OpsCenter·Incident Manager·Automation
- **EventBridge**: 이벤트 기반 자동 대응
- **Lambda**: 운영 액션
- **Step Functions**: 복잡 자동화
- **AWS Backup**: 백업 정책

### 배포

- **CodePipeline·CodeDeploy**: Blue/Green·Canary
- **CloudFormation**: IaC + StackSets (Org)
- **CDK·SAM·Terraform**

### 비용

- **Compute Optimizer**: Right-size 권고
- **Cost Explorer·CUR·Budgets·Anomaly Detection**
- **Trusted Advisor**: 5 카테고리
- **SP·RI·Spot**

### 복원력

- **Resilience Hub**: 정책·격차
- **FIS**: 카오스
- **DRS·MGN**
- **Route 53 ARC**

### 보안

- **Security Hub·GuardDuty·Macie·Inspector·Detective·Audit Manager**

---

## 🧠 시나리오 매핑

| 시나리오 | 답 |
|----------|-----|
| EC2 Right-size 권고 | Compute Optimizer |
| 예산 초과 자동 정지 | Budgets Action |
| 사고 자동 페이저·런북 | Incident Manager |
| 무중단 배포 | CodeDeploy Blue/Green |
| 패치 자동화 | SSM Patch Manager |
| 키 자동 로테이션 | Secrets Manager |
| 멀티 계정 보안 통합 | Security Hub Org |
| 분기 Game Day | FIS |
| 워크로드 RTO 평가 | Resilience Hub |
| 비정상 비용 탐지 | Cost Anomaly Detection |

---

## 📝 연습 문제

**문제 1.** EC2 over-provisioned 자동 권고.

A) Trusted Advisor
B) Compute Optimizer
C) X-Ray
D) Config

**정답: B**

---

**문제 2.** 무중단 ECS 배포.

A) Rolling
B) CodeDeploy Blue/Green
C) ASG 직접
D) CFN Update

**정답: B**

---

**문제 3.** 사고 시 페이저·런북·소통.

A) Chatbot
B) Incident Manager
C) Health Dashboard
D) EventBridge

**정답: B**

---

**문제 4.** 패치 자동 그룹별 진행.

A) Run Command 수동
B) SSM Patch Manager + Maintenance Window
C) CFN
D) EC2 자체

**정답: B**

---

**문제 5.** 분기별 의도적 장애 + 안전 중단.

A) AWS Backup
B) FIS + Stop Condition
C) Resilience Hub
D) Trusted Advisor

**정답: B**

---

**문제 6.** 비용 이상 자동 알림.

A) Budgets만
B) Cost Anomaly Detection
C) Trusted Advisor
D) CUR

**정답: B**

---

## 📌 오늘의 요약

1. CloudWatch·X-Ray·CT·Config 관측·감사
2. SSM·Lambda·SF·EventBridge 자동화
3. CodePipeline·CodeDeploy·CFN 배포
4. CO·CE·Budgets·Anomaly 비용
5. Resilience Hub·FIS·DRS·ARC 복원력
