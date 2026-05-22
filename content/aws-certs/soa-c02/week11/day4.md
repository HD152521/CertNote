# Day 4 - Savings Plans, Reserved Instances, Spot 운영

📅 날짜: Week 11 (Day 4)
🎯 주제: 약정 할인과 Spot으로 컴퓨팅 비용 70% 절감
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Savings Plans 3종과 RI의 차이를 이해한다
- Spot 인스턴스 운영과 회수 처리 패턴을 안다
- 멀티 옵션 조합으로 최적 비용 구조 설계

---

## 🧩 사전 지식 (CS 기초)

- **Commitment-based discount**: 약정 기반 할인
- **Capacity Reservation**: 용량 예약 (할인은 별도)
- **Bidding 모델**: Spot은 자동 가격 책정 (구식 bidding 없음)
- **Workload elasticity**: 워크로드의 변동성. 비용 전략의 기준

---

## 📖 이론 내용

### 1. Savings Plans (SP)

#### 3종

| 종류 | 적용 대상 | 할인율 | 유연성 |
|------|-----------|--------|--------|
| **Compute Savings Plans** | EC2 + Fargate + Lambda. 모든 리전·인스턴스 패밀리 | 최대 66% | 가장 유연 |
| **EC2 Instance Savings Plans** | 특정 리전 + 특정 패밀리 (예: ap-northeast-2의 c5) | 최대 72% | 제한적 |
| **SageMaker Savings Plans** | SageMaker 학습/추론 | 최대 64% | SageMaker 전용 |

#### 약정
- 1년 또는 3년
- 시간당 약정($X/시간 사용 commit)
- 결제: All Upfront / Partial Upfront / No Upfront

#### 동작
- 약정한 시간당 사용량까지 SP 할인 적용
- 초과 사용분은 On-Demand 가격

### 2. Reserved Instances (RI)

#### 종류

| 종류 | 의미 |
|------|------|
| **Standard RI** | 가장 큰 할인 (최대 72%), 약정 후 변경 어려움 |
| **Convertible RI** | 인스턴스 패밀리·크기·OS 변경 가능 (최대 66%) |
| **Regional vs Zonal** | 리전 전체 vs 특정 AZ |

#### 약정
- 1년 또는 3년
- Upfront 옵션 (All/Partial/No)
- RDS, Redshift, ElastiCache, OpenSearch도 RI 있음

#### RI vs SP

| 항목 | RI | Savings Plans |
|------|-----|----------------|
| 적용 범위 | 특정 서비스(EC2, RDS 등) | EC2/Fargate/Lambda |
| 유연성 | 변경 어려움(Convertible 제외) | 매우 유연 |
| 운영 부담 | 패밀리 변경 시 재구매 | 자동 적용 |
| 사용 추세 | SP로 이동 중 | 권장 |

→ 신규 약정은 거의 SP. RI는 RDS·Redshift 등 SP 미지원 서비스용.

### 3. Spot Instances

#### 개념
- EC2 미사용 용량을 최대 90% 할인
- AWS가 2분 전 알림 후 회수 가능
- 짧고 분산된 워크로드에 적합

#### 적합 워크로드
- 빅데이터 처리 (EMR, Hadoop)
- CI/CD 빌드
- 컨테이너 오케스트레이션 (Fargate Spot, EKS Spot)
- 배치 작업
- 무상태 웹 서버 (Auto Scaling 혼합)

#### 비적합
- Stateful (DB, 캐시)
- 짧은 startup 시간 어려운 워크로드

#### Spot 회수 처리
- 2분 알림: EventBridge `EC2 Spot Instance Interruption Warning`
- Graceful shutdown: Lambda 또는 Lifecycle Hook
- 작업 분산: 진행 중 작업 다른 인스턴스로

### 4. Spot Fleet & EC2 Fleet

#### EC2 Fleet
- 단일 호출로 다양한 인스턴스 + Spot/On-demand 혼합
- Capacity Optimized 전략으로 안정성 ↑

#### Allocation Strategy

| 전략 | 동작 |
|------|------|
| **lowestPrice** | 가장 저렴 (회수 위험 ↑) |
| **diversified** | 여러 풀에 분산 (안정성) |
| **capacityOptimized** | 가용성 가장 높은 풀 (권장) |
| **priceCapacityOptimized** | 가격 + 가용성 균형 (최신 권장) |

### 5. Capacity Reservation

#### 개념
- 특정 AZ에 인스턴스 용량 예약 (할인 X)
- 가용성 보장 (특히 신규 인스턴스 타입)
- SP/RI와 조합 가능 → 할인 + 용량 보장

#### 사용 사례
- DR 사이트의 즉시 가용 인스턴스 보장
- 이벤트 (블랙프라이데이) 대비
- 신규 리전의 가용성 부족

### 6. 비용 최적화 의사결정 트리

```
워크로드의 안정성·변동성·SLA?
    │
    ├─ 24/7 안정 운영 (변경 없음)
    │   → Standard RI (3년) 또는 EC2 Instance SP
    │     최대 72% 할인
    │
    ├─ 24/7 운영 + 패밀리 변경 가능성
    │   → Compute Savings Plans (3년)
    │     최대 66% + 유연성
    │
    ├─ 가변 워크로드 + 무상태
    │   → On-demand + Spot 혼합 (Mixed Instances ASG)
    │     평균 50~70% 절감
    │
    └─ Stateful + 일회성
        → On-demand (할인 없음)
```

### 7. Fargate Spot, Lambda

#### Fargate Spot
- ECS Fargate의 Spot 가격 (70% 할인)
- Spot 회수 처리 동일

#### Lambda
- Compute Savings Plans 적용 가능
- 비용 절감 효과 명확하면 약정

### 8. 운영 자동화 패턴

#### Spot 회수 대응
```bash
# EventBridge Rule
aws events put-rule \
  --name SpotInterruption \
  --event-pattern '{"source":["aws.ec2"],"detail-type":["EC2 Spot Instance Interruption Warning"]}'

# Lambda 트리거 (graceful shutdown)
aws events put-targets \
  --rule SpotInterruption \
  --targets "Id=1,Arn=arn:aws:lambda:ap-northeast-2:123:function:GracefulShutdown"
```

#### ASG Lifecycle Hook
- 종료 전 Heartbeat 시간 확보
- ELB deregister → 로그 백업 → 종료

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **SP/RI 자동 적용** | 약정 사용량 내에서 자동 할인 | 별도 작업 X |
| **RI Marketplace** | 미사용 RI 판매·구매 | 비용 회수 |
| **Cost Explorer SP/RI Coverage** | 약정 활용도 분석 | 운영 점검 |
| **Cost Explorer SP/RI Utilization** | 약정 사용량 % | 약정 적정성 |
| **AWS Cost Optimization Hub** | 비용 권장 통합 (Compute Optimizer + TA + 약정) | 신기능 |

> ⚠️ **함정 1**: SP/RI는 약정. 사용 안 해도 비용 발생. 최소 baseline에만 적용.
>
> ⚠️ **함정 2**: Standard RI 변경 어려움 — 워크로드 변동성 있으면 Convertible 또는 SP.
>
> 💡 **암기 팁**: 안정 워크로드 = RI/SP, 변동 = On-demand + Spot. SP가 거의 모든 경우 RI보다 유연.

### 관련 서비스 Cross-Reference

- **SP/RI → Week 11 Day 3 Cost Explorer Recommendations**
- **Spot → Week 7 Day 4 Mixed Instances**
- **Fargate Spot → Week 7 ECS**
- **Capacity Reservation → Week 10 DR**

---

## 🏗️ 아키텍처 다이어그램

```
비용 최적화 3층 구조
==========================================================

   Layer 3: Spot (최대 90% 할인)
   ─────────────────────────────
   변동·무상태 워크로드
   (배치, 빌드, 캐시)
       │
       │ Capacity Optimized Spot Allocation
       │
   Layer 2: On-Demand + 일부 (변동분)
   ─────────────────────────────
   예측 어려운 워크로드
       │
       │ 정상 가격
       │
   Layer 1: Savings Plans / RI (baseline)
   ─────────────────────────────
   안정 운영 워크로드
   (24/7 운영, 예측 가능)
   할인 최대 72%

   비율 권장:
   - Baseline: 60-70% SP/RI
   - 변동: 20-30% On-Demand
   - 무상태 일부: 10-20% Spot
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Compute SP = 최대 유연 (EC2/Fargate/Lambda 모두)**, EC2 Instance SP = 더 큰 할인 (특정 패밀리)
2. ⭐ **Standard RI = 변경 어려움 (큰 할인), Convertible RI = 유연성**
3. ⭐ **Spot 회수 2분 알림 → EventBridge → Graceful Shutdown**
4. ⭐ **Mixed Instances ASG = On-Demand + Spot 혼합** (Mixed Instances Policy)
5. ⭐ **Capacity Reservation = 용량 보장만**, 할인 X. SP/RI와 조합

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Savings Plans 권장사항 조회
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years THREE_YEARS \
  --payment-option NO_UPFRONT \
  --lookback-period-in-days SIXTY_DAYS \
  --query 'SavingsPlansPurchaseRecommendation.SavingsPlansPurchaseRecommendationSummary'

# 2. RI 권장사항
aws ce get-reservation-purchase-recommendation \
  --service AmazonEC2 \
  --lookback-period-in-days SIXTY_DAYS \
  --term-in-years THREE_YEARS \
  --payment-option PARTIAL_UPFRONT

# 3. SP 활용도 분석
aws ce get-savings-plans-utilization \
  --time-period Start=2026-04-01,End=2026-05-31 \
  --granularity MONTHLY \
  --query 'SavingsPlansUtilizationsByTime[*].[TimePeriod.Start,Utilization.UtilizationPercentage]'

# 4. RI Coverage 분석
aws ce get-reservation-coverage \
  --time-period Start=2026-04-01,End=2026-05-31 \
  --granularity MONTHLY \
  --metrics CoverageHoursPercentage \
  --group-by Type=DIMENSION,Key=INSTANCE_TYPE

# 5. Spot Fleet 생성 (Capacity Optimized)
aws ec2 create-fleet \
  --launch-template-configs '[{
    "LaunchTemplateSpecification":{"LaunchTemplateName":"web-lt","Version":"$Latest"},
    "Overrides":[
      {"InstanceType":"m5.large","SubnetId":"subnet-a"},
      {"InstanceType":"m5a.large","SubnetId":"subnet-a"},
      {"InstanceType":"m6i.large","SubnetId":"subnet-b"}
    ]
  }]' \
  --target-capacity-specification 'TotalTargetCapacity=10,OnDemandTargetCapacity=2,DefaultTargetCapacityType=spot' \
  --spot-options 'AllocationStrategy=capacityOptimized'

# 6. Spot 회수 알림 → Lambda
aws events put-rule \
  --name "SpotInterruption" \
  --event-pattern '{
    "source":["aws.ec2"],
    "detail-type":["EC2 Spot Instance Interruption Warning"]
  }'

aws events put-targets \
  --rule SpotInterruption \
  --targets "Id=1,Arn=arn:aws:lambda:ap-northeast-2:123:function:GracefulShutdown"

# 7. EC2 Capacity Reservation
aws ec2 create-capacity-reservation \
  --instance-type m5.large \
  --instance-platform "Linux/UNIX" \
  --availability-zone ap-northeast-2a \
  --instance-count 10 \
  --end-date-type unlimited

# 8. ASG Mixed Instances + Spot
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name web-mixed \
  --min-size 2 --max-size 20 --desired-capacity 10 \
  --mixed-instances-policy '{
    "LaunchTemplate":{
      "LaunchTemplateSpecification":{"LaunchTemplateName":"web-lt","Version":"$Latest"},
      "Overrides":[
        {"InstanceType":"m5.large"},
        {"InstanceType":"m5a.large"},
        {"InstanceType":"m6i.large"}
      ]
    },
    "InstancesDistribution":{
      "OnDemandBaseCapacity":2,
      "OnDemandPercentageAboveBaseCapacity":20,
      "SpotAllocationStrategy":"capacityOptimized"
    }
  }' \
  --vpc-zone-identifier "subnet-a,subnet-b"
```

---

## 📝 연습 문제

**문제 1.** 회사가 EC2/Fargate/Lambda를 모두 사용하며 패밀리·리전이 자주 바뀐다. 가장 적합한 약정?

A) Standard RI
B) Compute Savings Plans (가장 유연 - 모든 컴퓨팅 서비스, 모든 리전·패밀리)
C) EC2 Instance Savings Plans
D) Convertible RI

**정답: B**
해설: Compute SP가 가장 유연. EC2/Fargate/Lambda 모두 적용 + 리전/패밀리 무관. 할인율은 EC2 Instance SP가 더 크지만 제약 많음.

---

**문제 2.** Spot 인스턴스 회수 시 graceful shutdown(ALB deregister, 로그 백업)을 자동화하려면?

A) Cron job
B) EventBridge Rule (EC2 Spot Instance Interruption Warning) → Lambda 또는 ASG Lifecycle Hook
C) CloudWatch Alarm
D) IMDS 폴링

**정답: B**
해설: AWS의 2분 알림을 EventBridge로 수신. Lambda나 Lifecycle Hook으로 정리 작업 자동화.

---

**문제 3.** 회사가 신규 m6i 인스턴스 타입을 운영 환경에서 사용하려는데 AZ에 용량 부족 경고를 받았다. 사전 보장하려면?

A) RI 구매 (가용성 보장 X)
B) EC2 Capacity Reservation - 특정 AZ에 용량 예약 (할인 X)
C) Spot
D) ASG

**정답: B**
해설: Capacity Reservation의 정확한 사용 사례. 신규 인스턴스 가용성 보장. 할인은 별도 (SP/RI와 조합).

---

**문제 4.** 회사가 빅데이터 배치 작업으로 매일 새벽 100대 인스턴스 필요. 비용 최적은?

A) On-Demand
B) Spot Fleet + Capacity Optimized 전략 (배치는 회수 견딤, 최대 90% 할인)
C) Standard RI
D) Compute SP

**정답: B**
해설: 일시적 + 무상태 워크로드는 Spot 최적. Capacity Optimized 전략으로 안정성 ↑. RI/SP는 24/7 워크로드용.

---

**문제 5.** 회사가 3년 약정 후 워크로드를 새 패밀리(c5 → c7g Graviton)로 변경하려 한다. 어떤 옵션이 가능?

A) Standard RI (변경 어려움)
B) Compute Savings Plans (모든 패밀리 자동 적용) 또는 Convertible RI (수동 변경)
C) Spot
D) On-Demand

**정답: B**
해설: Compute SP는 패밀리·리전 무관 자동 적용. Convertible RI는 수동 교환 가능. Standard RI는 거의 묶임.

---

## 📌 오늘의 요약

1. Compute SP(가장 유연) / EC2 Instance SP(더 큰 할인) / Standard RI(큰 할인 + 묶임)
2. Spot = 최대 90% 할인 + 2분 회수 알림. EventBridge로 graceful shutdown
3. Mixed Instances ASG로 On-Demand + Spot 혼합 — capacityOptimized 전략 권장
4. Capacity Reservation = 용량 보장만, 할인은 SP/RI와 조합
5. 신규 약정은 거의 SP. RI는 RDS/Redshift 등 SP 미지원 서비스용
