# Day 58 - Cost Explorer, Budgets, CUR

📅 Week 12 (Day 3)
🎯 주제: 비용 가시성·예산·상세 분석
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- Cost Explorer·Budgets·CUR의 역할과 차이
- 예산 알림·예산 액션·SP/RI 활용도
- Cost Allocation Tag

---

## 🧩 사전 지식 (CS 기초)

- **CUR**: Cost and Usage Report — 가장 상세한 시간단위 비용 데이터
- **Cost Allocation Tag**: 비용을 태그별로 분리
- **FinOps**: 클라우드 비용 운영

---

## 📖 이론 내용

### 1. Cost Explorer (CE)

- **시각화·12-13개월 데이터** (기본), 38개월까지
- 일·월·서비스·태그·계정 등 차원 분석
- **Forecast** — 향후 12개월 예측
- **Savings Plans·RI 활용도·Coverage 리포트**

### 2. AWS Budgets

| 예산 유형 | 내용 |
|-----------|------|
| **Cost Budget** | 금액 한도 |
| **Usage Budget** | 사용량 (시간·GB 등) |
| **RI Utilization / Coverage** | RI 활용도 한도 |
| **SP Utilization / Coverage** | SP 활용도 한도 |

- **Budget Actions**: SCP 적용·IAM 정책 적용·EC2/RDS 중지 (자동 대응)
- SNS·이메일 알림

### 3. Cost and Usage Report (CUR)

- **시간 단위, 모든 청구 항목**
- S3로 전달 → **Athena·Redshift·QuickSight** 직접 분석
- **CUR 2.0** — 새로운 스키마
- Org 통합 결제 계정에서 생성·공유

### 4. Cost Allocation Tags

- **User-defined**·**AWS-generated**
- Billing 콘솔에서 활성화 (활성 후부터 분리)
- 키 예: Project, Env, Owner, CostCenter

### 5. Anomaly Detection

- ML 기반 비용 이상 자동 탐지
- 서비스·계정·태그·SP 차원
- 이메일·SNS

### 6. AWS Cost Categories

- 비용 그룹화 규칙 (예: "팀 A" = 특정 태그/계정 조합)

---

## 🧠 심화 이론

### 함정 포인트

- **"한도 초과 시 자동 EC2 중지"** → Budgets Action (IAM Policy·SCP·중지)
- **"시간 단위 상세 데이터"** → CUR (CE는 일 단위가 최소)
- **"비정상 비용 자동 탐지"** → Cost Anomaly Detection
- **"태그별 비용 분리 안 됨"** → 태그 활성화 안 했거나, 활성 전 비용

### 트레이드오프

- CE = 시각화·빠른 진단
- CUR = 상세·SQL·BI
- Budgets = 알림·자동 대응

---

## 🏗️ 아키텍처 — FinOps 자동화

```
[CUR → S3] → [Athena·QuickSight 대시보드]
                       │
[Budgets] → [SNS·이메일·Lambda]
                       │
                  [예산 초과 시 SCP 강제]
[Cost Anomaly Detection] → 알림
[Cost Categories] → 팀별 청구
```

---

## ⭐ 핵심 포인트

1. ⭐ CE = 시각화·Forecast / Budgets = 알림·Action / CUR = 상세 데이터
2. ⭐ Budgets Action으로 자동 정지
3. ⭐ CUR → Athena·QuickSight 분석
4. ⭐ Cost Allocation Tag 활성화 후부터 분리
5. ⭐ Cost Anomaly Detection ML 기반

---

## 💻 CLI 예시

```bash
# Budget 생성
aws budgets create-budget \
  --account-id 123456789012 \
  --budget file://budget.json \
  --notifications-with-subscribers file://notifications.json
```

---

## 📝 연습 문제

**문제 1.** 시간 단위 상세 청구 + Athena 분석.

A) Cost Explorer
B) CUR
C) Budgets
D) Trusted Advisor

**정답: B**

---

**문제 2.** 월 비용이 임계 초과 시 자동 EC2 중지.

A) CloudWatch Alarm
B) Budgets Action
C) Config Remediation
D) Lambda Schedule

**정답: B**

---

**문제 3.** 비정상 비용 자동 탐지·알림.

A) Trusted Advisor
B) Cost Anomaly Detection
C) CloudWatch
D) GuardDuty

**정답: B**

---

**문제 4.** 부서별 비용 분리.

A) 계정 분리
B) Cost Allocation Tag + Cost Categories
C) Region 분리
D) IAM 분리

**정답: B**

---

**문제 5.** SP·RI 활용도 시각화.

A) CUR만
B) Cost Explorer Coverage·Utilization 리포트
C) Compute Optimizer
D) Trusted Advisor

**정답: B**

---

**문제 6.** 12개월 후 비용 예측.

A) CUR
B) CE Forecast
C) Budgets
D) Anomaly Detection

**정답: B**

---

## 📌 오늘의 요약

1. CE = 시각화·Forecast
2. Budgets = 알림·Action(자동 중지)
3. CUR = 시간 단위 상세·Athena
4. Cost Allocation Tag·Categories
5. Anomaly Detection ML 알림
