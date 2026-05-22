# Day 56 - Savings Plans·RI 전략 완전 정복

📅 Week 12 (Day 1)
🎯 주제: 약정 기반 비용 절감
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- SP·RI 유형과 적용 우선순위를 안다
- Compute SP vs EC2 Instance SP 트레이드오프
- Convertible vs Standard RI 차이
- Organization 차원 공유 (Linked Account)

---

## 🧩 사전 지식 (CS 기초)

- **약정**: 1년/3년 기간 선결제·반결제·후결제
- **할인율**: All Upfront > Partial > No Upfront
- **표준 EC2 요금 비교 기준**: On-Demand

---

## 📖 이론 내용

### 1. Savings Plans (SP) 유형

| 유형 | 적용 | 할인 |
|------|------|------|
| **Compute SP** | EC2·Fargate·Lambda (리전·OS·인스턴스 family 무관) | 최대 66% |
| **EC2 Instance SP** | 특정 리전·family 한정 | 최대 72% |
| **SageMaker SP** | SageMaker Training·Inference·Notebook 등 | 최대 64% |

- 단위: **$/시간 약정**
- 1년 / 3년, All/Partial/No Upfront

### 2. RI (Reserved Instance) 유형

| 유형 | 특징 |
|------|------|
| **Standard RI** | 가장 큰 할인 (최대 72%) — family·OS 변경 ✗ (Size는 일부 가능) |
| **Convertible RI** | family·OS·tenancy 변경 가능, 할인 ↓ (최대 66%) |

- **Scope**: Region(유연) vs AZ(용량 예약 포함)
- **EC2·RDS·ElastiCache·OpenSearch·Redshift·DynamoDB·MemoryDB** 별 RI

### 3. Capacity Reservation

- 용량만 예약 (할인 없음)
- **ODCR**: On-Demand Capacity Reservation
- **Zonal RI** 또는 **CR + SP** 조합으로 할인 + 용량

### 4. 우선순위 (Billing 적용 순서)

```
1. Zonal RI (capacity + 할인)
2. Standard/Convertible Regional RI
3. Savings Plans (EC2 Instance → Compute → SageMaker)
4. On-Demand (남은 사용량)
```

### 5. Organization 공유

- Org 통합 결제 시 SP·RI는 **다른 계정에서도 적용** (Sharing 활성 시)
- 위임 관리자에서 통제

### 6. Spot

- 별도 — 최대 90% 할인, 중단 2분 알림
- Spot Fleet·EC2 Fleet·ASG에 통합
- **SageMaker Managed Spot Training**·**EMR Spot**·**Batch Spot**

---

## 🧠 심화 이론

### 선택 의사결정 트리

```
사용량 패턴 안정? ─ Yes ─▶ 워크로드 유연성 필요?
   │                       ├─ Yes (다양한 family) ─▶ Compute SP
   │                       └─ No  (특정 family)    ─▶ EC2 Instance SP / Standard RI
   └─ No  ─▶ 중단 허용? ─ Yes ─▶ Spot
                           └─ No  ─▶ On-Demand
```

### 함정 포인트

- **"Lambda·Fargate도 할인"** → Compute SP만
- **"family 변경 자유"** → Convertible RI
- **"용량 보장 + 할인"** → Zonal RI 또는 ODCR + SP
- **"3년 약정 최대 할인"** → All Upfront

---

## 🏗️ 다이어그램 — 적용 우선순위

```
사용 시간(시간당) ──▶ 1. Zonal RI 차감
                  ──▶ 2. Regional RI
                  ──▶ 3. EC2 Instance SP
                  ──▶ 4. Compute SP
                  ──▶ 5. SageMaker SP
                  ──▶ 6. On-Demand 청구
```

---

## ⭐ 핵심 포인트

1. ⭐ Compute SP = 유연 (EC2·Fargate·Lambda) / EC2 Instance SP = 가장 큰 할인
2. ⭐ Standard RI > Convertible RI 할인율
3. ⭐ Zonal RI = 용량 보장 / Regional RI = 유연
4. ⭐ 적용 순서: RI → SP → On-Demand
5. ⭐ Org 통합 결제로 SP·RI 공유
6. ⭐ Spot = 90% / 중단 2분 알림

---

## 💻 CLI 예시

```bash
# Savings Plans 추천
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years ONE_YEAR \
  --payment-option ALL_UPFRONT \
  --lookback-period-in-days SIXTY_DAYS
```

---

## 📝 연습 문제

**문제 1.** EC2 + Lambda + Fargate 통합 할인.

A) EC2 Instance SP
B) Compute Savings Plans
C) Standard RI
D) Spot

**정답: B**

---

**문제 2.** 특정 m6i family·리전 고정 — 최대 할인.

A) Compute SP
B) EC2 Instance SP (또는 Standard RI)
C) Convertible RI
D) Spot

**정답: B**

---

**문제 3.** 향후 family 변경 가능성 있음.

A) Standard RI
B) Convertible RI
C) EC2 Instance SP
D) Spot

**정답: B**

---

**문제 4.** 용량 보장 + 할인 동시.

A) Compute SP
B) Zonal RI (또는 ODCR + SP)
C) Regional RI
D) Spot

**정답: B**

---

**문제 5.** 중단 허용 배치 워크로드.

A) Spot
B) Standard RI
C) Compute SP
D) On-Demand

**정답: A**

---

**문제 6.** Linked Account에서 모회사 SP 활용 가능?

A) 불가능
B) Org 통합 결제 + Sharing 활성 시 가능
C) RI만 가능
D) On-Demand만

**정답: B**

---

## 📌 오늘의 요약

1. SP 3종(Compute·EC2·SM), RI 2종(Standard·Convertible)
2. 적용 순서: RI → SP → On-Demand
3. Zonal RI = 용량 / Regional RI = 유연
4. Org 통합 결제로 공유
5. Spot = 중단 OK 워크로드
