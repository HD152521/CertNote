# Day 46 - EC2 비용 비교, Savings Plans, RI 전략

📅 날짜: Week 10 (Day 1)
🎯 주제: 컴퓨팅 비용 최적화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- On-Demand / RI / SP / Spot 비용 트레이드오프를 정리한다
- 워크로드 패턴별 정답 옵션을 매핑한다
- Right-sizing / Graviton / Spot 전략을 이해한다

---

## 🧩 사전 지식 (CS 기초)

- **선매(Reserved) vs Spot**: 약정 vs 즉시 시장 가격. RI/SP는 사용 보장의 대가로 할인.
- **고정 vs 변동 비용**: 약정은 고정, On-Demand는 변동. CFO 관점에서 다르게 다룸.
- **Right-sizing**: 워크로드에 맞는 적정 크기. 과대 프로비저닝이 가장 흔한 낭비.

---

## 📖 이론 내용

### 1. 비용 옵션 비교 (다시)

| 옵션 | 약정 | 할인 | 유연성 |
|------|------|------|---------|
| On-Demand | 없음 | 0% | 최대 |
| **Compute Savings Plan** | 1y/3y | ~66% | **패밀리/리전/OS/Tenancy 자유** |
| EC2 Instance SP | 1y/3y | ~72% | 패밀리 고정, 크기 자유 |
| Reserved Instance (Standard) | 1y/3y | ~72% | 인스턴스 타입 고정 |
| Convertible RI | 1y/3y | ~54% | 다른 RI로 교환 가능 |
| Spot | - | ~90% | 언제든 종료 가능 |

### 2. SP vs RI 차이

- SP는 "$/hr 약정" → 어떤 인스턴스 써도 그 약정 한도까지 할인.
- RI는 특정 타입에 묶임.
- **신규는 거의 SP**. RI는 RDS/Redshift/ElastiCache용으로 남아있음 (이 서비스들은 SP 미지원).

### 3. 워크로드 매칭

| 워크로드 | 권장 |
|----------|------|
| 24/7 안정 | SP / RI 3y |
| 변동 | SP 1y + On-Demand 베이스 |
| 배치·내성 | Spot |
| 한 번 / 짧음 | On-Demand |
| 라이선스 BYOL | Dedicated Host |

### 4. Spot 운영 패턴

- **Spot Fleet / EC2 Fleet**: 여러 타입·AZ 분산.
- **Capacity Rebalancing**: 회수 임박 시 사전 대체.
- **Spot 알림 2분 전**.
- Spot 가격 변동이 작은 타입(Spot Price History) 활용.

### 5. Graviton 활용

- ARM Graviton 인스턴스 = **~40% 가성비**.
- 컨테이너, 자바, Go, Python, 노드 워크로드 호환성 좋음.

### 6. Compute Optimizer

- ML 기반 right-sizing 추천. EC2/EBS/Lambda/ASG/ECS.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **SP 적용 우선순위** | EC2 SP > Compute SP > On-Demand | 결제 |
| **Convertible RI 교환** | 동일/상위 가치만 | 함정 |
| **Capacity Reservation + SP** | 용량 + 할인 | 분리 |
| **Spot 인스턴스 + ASG** | mixed instances policy | 비용 ↓ |
| **EC2 → Fargate 전환** | 운영 ↓ + 단가 ↑ trade-off | 비용 검토 |

> ⚠️ **함정**: "한 번 산 SP를 환불할 수 있나?" → SP는 환불 불가. RI는 일부 마켓플레이스 매도 가능(Standard).

> 💡 **암기 팁**: 디폴트 = **Compute SP 1년** (균형). 절대 안 멈춤 / 패밀리 고정 = EC2 SP 3년.

### 관련 서비스 Cross-Reference

- ASG Mixed Instances → Week 3
- Capacity Reservation → Week 3
- Compute Optimizer → Week 9

---

## 🏗️ 아키텍처 다이어그램

```
[ 비용 계층 결합 ]

  Baseline (24/7) ── Compute SP 3y
        │
  변동 부분 ── Compute SP 1y
        │
  배치/실험 ── Spot (Fleet)
        │
  남는 spike ── On-Demand
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Compute SP**가 가장 유연한 컴퓨팅 할인.
2. ⭐ Spot은 stateless·중단 OK 워크로드에 90% 할인.
3. ⭐ **Graviton**으로 40% 가성비.
4. ⭐ Compute Optimizer로 right-sizing.
5. ⭐ RDS·Redshift·ElastiCache는 여전히 **RI**.

---

## 💻 실제 예시 - AWS CLI

```bash
# SP 추천 보기
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years ONE_YEAR --payment-option NO_UPFRONT

# Compute Optimizer 권장
aws compute-optimizer get-ec2-instance-recommendations \
  --recommendation-preferences EnhancedInfrastructureMetrics=ACTIVE
```

---

## 📝 연습 문제

**문제 1.** 24/7 워크로드 + 패밀리 변경 자유:

A) RI Standard B) Compute Savings Plan C) Spot D) On-Demand

**정답: B**.

---

**문제 2.** ML 학습 야간 배치, 90% 절감:

A) Spot B) RI 3y C) On-Demand D) Convertible RI

**정답: A**.

---

**문제 3.** RDS 비용 약정:

A) Compute SP B) EC2 SP C) RI D) Spot

**정답: C** — RDS는 RI만.

---

**문제 4.** EC2 인스턴스 크기를 ML로 right-sizing 추천:

A) Trusted Advisor 일부 + Compute Optimizer B) Macie C) Inspector D) Config

**정답: A**.

---

**문제 5.** SP 환불:

A) 자유 환불 B) 환불 불가 C) 50% 페널티 D) 1회 가능

**정답: B**.

---

## 📌 오늘의 요약

1. SP가 신규 컴퓨팅 할인의 디폴트.
2. RDS/Redshift/ElastiCache는 RI 유지.
3. Spot은 stateless·중단 가능 워크로드.
4. Graviton + Compute Optimizer로 가성비 ↑.
5. 비용 계층: SP baseline + Spot 변동 + On-Demand spike.
