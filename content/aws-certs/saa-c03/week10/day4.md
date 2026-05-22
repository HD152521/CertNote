# Day 49 - Cost Explorer, Budgets, Compute Optimizer

📅 날짜: Week 10 (Day 4)
🎯 주제: 비용 가시화·예산 관리
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Cost Explorer / Budgets / CUR / Billing Conductor를 안다
- Compute Optimizer / Storage Lens / Trusted Advisor 협업을 안다
- 멀티 계정 비용 분리·할당 전략을 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **Showback vs Chargeback**: 비용을 부서별로 보여만 줌 vs 실제 청구.
- **태깅 전략**: Project/Env/Owner/CostCenter 태그가 표준.
- **이상 탐지(Anomaly Detection)**: 평소 대비 갑작스러운 비용 증가 감지.

---

## 📖 이론 내용

### 1. Cost Explorer

- **CUR(Cost and Usage Report)**를 기반으로 시각화·예측.
- 필터/그룹: 서비스/리전/계정/태그/Usage Type 등.
- **Forecast**(예측), **Anomaly Detection**.
- API로 조회 가능.

### 2. AWS Budgets

- **Cost / Usage / RI Coverage / SP Coverage / Coverage Utilization** 예산.
- 임계 80% / 100% 알림 (SNS, 이메일, Chatbot).
- **Budget Actions**: 80% 도달 시 IAM 정책 자동 attach (예: 정지).

### 3. CUR (Cost and Usage Report)

- 세분화된 청구 데이터를 S3로.
- Athena/Redshift/QuickSight에서 분석.
- 시간 단위 / 리소스 단위 가능.

### 4. Cost Allocation Tags

- **사용자 정의 / AWS 생성** 태그. Org 관리 계정에서 활성.
- 활성화 후 청구서·Cost Explorer에서 그룹 가능.

### 5. AWS Billing Conductor

- 멀티 계정 환경에서 **사용자 정의 청구**.
- 리셀러·내부 부서 청구에 사용.

### 6. Trusted Advisor + Compute Optimizer + Storage Lens

- **TA**: 사용 안 하는 EIP / EBS, 저활용 EC2.
- **Compute Optimizer**: ML right-sizing EC2/EBS/Lambda/ASG/ECS.
- **Storage Lens**: S3 가시화 + 권장.

### 7. 멀티 계정 거버넌스

- Consolidated Billing → 볼륨 디스카운트 + SP/RI 공유.
- Org 단위 SCP로 비싼 인스턴스 막기.
- 비용 부서별 분리는 OU + 태그.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Cost Categories** | 비용을 회사 정의 카테고리로 자동 분류 | 거버넌스 |
| **Budgets Action 자동화** | IAM 정책/SCP 자동 attach | 강제 보호 |
| **CUR + Athena + QuickSight** | 세분화 분석 | 풍부 |
| **Service Quotas** | 한도 관리 | 비용 보호 |
| **AWS Cost Anomaly Detection** | ML 이상 탐지 | 자동 알림 |

> ⚠️ **함정**: "예산 초과 시 IAM 사용자 자동 비활성" → **Budget Actions**로 가능.

> 💡 **암기 팁**: 가시화 = Cost Explorer / 예산·차단 = Budgets / 분석 원본 = CUR.

### 관련 서비스 Cross-Reference

- Organizations → Week 1
- Trusted Advisor → Week 9
- Compute Optimizer → Day 1

---

## 🏗️ 아키텍처 다이어그램

```
[ FinOps 표준 ]

  Org Management Account
    ├─ Consolidated Billing
    ├─ Cost Explorer / Forecast / Anomaly
    ├─ Budgets (Cost/Usage/Coverage)
    │     └─ Action: IAM Deny if 100%
    └─ CUR → S3 → Athena → QuickSight

  Workload Accounts
    ├─ Cost Allocation Tags
    ├─ Trusted Advisor / Compute Optimizer
    └─ Storage Lens
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Cost Explorer = 가시화·예측·이상 탐지.
2. ⭐ Budgets + Actions로 자동 보호.
3. ⭐ CUR로 세분화 분석.
4. ⭐ Compute Optimizer right-sizing.
5. ⭐ Org 단위 태그 활성으로 비용 분리.

---

## 💻 실제 예시 - AWS CLI

```bash
# 예산 만들기 (월 1000 USD)
aws budgets create-budget --account-id 111122223333 --budget '{
  "BudgetName":"monthly-1000",
  "BudgetLimit":{"Amount":"1000","Unit":"USD"},
  "TimeUnit":"MONTHLY","BudgetType":"COST"
}'

# Anomaly Monitor
aws ce create-anomaly-monitor --anomaly-monitor '{
  "MonitorName":"by-service","MonitorType":"DIMENSIONAL",
  "MonitorDimension":"SERVICE"
}'

# 활성 태그
aws ce update-cost-allocation-tags-status --cost-allocation-tags-status '[
  {"TagKey":"Project","Status":"Active"},
  {"TagKey":"Env","Status":"Active"}
]'
```

---

## 📝 연습 문제

**문제 1.** 갑작스러운 비용 증가 ML 탐지:

A) Budgets B) Cost Anomaly Detection C) Trusted Advisor D) Macie

**정답: B**.

---

**문제 2.** 예산 100% 도달 시 IAM 자동 비활성:

A) Budgets Actions B) Lambda 폴링 C) Config Rule D) SCP

**정답: A**.

---

**문제 3.** 부서별 비용 분리:

A) IAM 사용자 키 B) Cost Allocation Tags 활성 C) Config D) NAT

**정답: B**.

---

**문제 4.** EC2 right-sizing ML 추천:

A) Trusted Advisor B) Compute Optimizer C) Cost Explorer D) Macie

**정답: B**.

---

**문제 5.** 세분화 청구 데이터 Athena 분석:

A) Cost Explorer 화면 캡처 B) CUR → S3 → Athena C) Trusted Advisor D) Budgets

**정답: B**.

---

## 📌 오늘의 요약

1. Cost Explorer 가시화, Budgets 예산·차단, CUR 분석.
2. Compute Optimizer + TA + Storage Lens 협업.
3. Cost Allocation Tags로 부서 분리.
4. Cost Categories / Anomaly Detection도 함께.
5. Billing Conductor로 내부 청구.
