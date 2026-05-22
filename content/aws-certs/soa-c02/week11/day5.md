# Day 5 - Week 11 복습 (성능·비용 운영 시나리오)

📅 날짜: Week 11 (Day 5)
🎯 주제: 비용·성능 최적화 핵심 정리 + 시나리오 10문항
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Week 11에서 다룬 비용·성능 도구의 역할을 한 문장씩 정리한다
- 도구별 "출제 키워드 → 정답 서비스" 매핑을 암기한다
- 시나리오 10문항으로 실전 감각을 점검한다

---

## 🧩 사전 지식 (CS 기초)

- **Right Sizing**: 실제 사용량에 맞춰 인스턴스/스토리지 규모 조정
- **Commitment**: 약정 (SP/RI는 사용 안 해도 비용 발생)
- **Allocation Tag**: 비용 분배 태그. 활성화해야 Cost Explorer에서 grouping 가능
- **Coverage vs Utilization**: 약정의 적용 범위 vs 약정의 실제 사용률

---

## 📖 이론 내용

### 1. Week 11 한 줄 요약

| Day | 서비스 | 한 줄 요약 |
|-----|--------|------------|
| Day 1 | **Compute Optimizer** | EC2/ASG/EBS/Lambda Right Sizing 권장. 14일 데이터 필요 |
| Day 2 | **Trusted Advisor** | 5개 카테고리 (비용/성능/보안/내결함성/서비스 한도) 자동 체크 |
| Day 3 | **Cost Explorer / Budgets / Tag** | 비용 분석 + 알림 + 분배. 13개월 무료 |
| Day 4 | **SP / RI / Spot** | 약정 할인 + Spot 90% 할인 + Capacity Reservation |

### 2. "출제 키워드 → 정답 서비스" 매핑

| 키워드 | 정답 |
|--------|------|
| "인스턴스 크기 권장" | Compute Optimizer |
| "비용·성능·보안 통합 자동 점검" | Trusted Advisor |
| "비용 알림 임계 80% 도달" | AWS Budgets |
| "비용을 팀/프로젝트별로 grouping" | Cost Allocation Tag + Cost Explorer |
| "패밀리 변경 자유로운 약정" | Compute Savings Plans 또는 Convertible RI |
| "특정 AZ에 인스턴스 용량 보장 (할인 X)" | EC2 Capacity Reservation |
| "Spot 회수 2분 알림" | EventBridge → Lambda/Lifecycle Hook |
| "약정 활용률(%) 분석" | Cost Explorer Utilization 리포트 |
| "RDS/Redshift 약정" | Reserved Instances (SP 미지원) |
| "Service Quota 초과 경고" | Trusted Advisor Service Limits |

### 3. 비용 최적화 의사결정 흐름

```
1단계: Right Sizing
   Compute Optimizer 권장 → 인스턴스 다운사이즈
   gp2 → gp3 / io1 → gp3 마이그레이션

2단계: 약정 할인 (Baseline)
   24/7 안정 워크로드 60-70% → Compute SP 3년

3단계: 변동 워크로드
   On-Demand 20-30% + Spot 10-20%

4단계: 모니터링
   Cost Explorer / Budgets / Anomaly Detection
```

### 4. Service Quota & 한도 관리

- **Service Quotas**: 서비스 한도 조회/증가 요청 통합 콘솔
- **Trusted Advisor Service Limits**: 80% 도달 시 경고
- **CloudWatch Usage Metrics**: AWS/Usage namespace로 모니터링
- 시험 함정: "한도 자동 증가" 같은 건 없음. 수동 요청 필요

### 5. Anomaly Detection

- **Cost Anomaly Detection**: ML로 비용 이상치 자동 탐지
- Monitor 종류: AWS Services / Linked Account / Cost Allocation Tag / Cost Category
- 임계 설정 후 SNS/이메일 알림

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Compute Optimizer 활성화** | Organizations 단위로 일괄 활성화 가능 | 멀티 계정 |
| **TA Business/Enterprise** | 5개 전체 카테고리는 Business 이상 | Basic은 일부만 |
| **Cost Allocation Tag 활성화** | Billing 콘솔에서 별도 활성화 필요 | 태그만 달면 X |
| **Budgets Action** | 임계 도달 시 IAM 정책 attach / EC2 stop 가능 | 신규 기능 |
| **Spot Placement Score** | 특정 리전/AZ의 Spot 가용성 예측 | 신규 |
| **Cost Optimization Hub** | 권장 통합 (CO + TA + SP) | 2023년 출시 |

> ⚠️ **함정 1**: TA의 "Cost Optimization" 체크는 Business 플랜 이상에서만 전체 활성.
>
> ⚠️ **함정 2**: SP 약정은 사용 안 해도 비용 발생. baseline에만 적용.
>
> ⚠️ **함정 3**: Anomaly Detection은 detection이지 차단(block)이 아님. Budgets Action만 차단 가능.
>
> 💡 **암기 팁**: **권장**(Compute Optimizer) → **점검**(Trusted Advisor) → **분석**(Cost Explorer) → **알림**(Budgets) → **약정**(SP/RI) → **변동**(Spot)

---

## 🏗️ 아키텍처 다이어그램

```
Week 11 비용·성능 운영 풀스택
==========================================================

  [수집/관측]              [권장/점검]            [의사결정]
  ─────────────            ─────────────         ─────────────
  CloudWatch                Compute               SP/RI 약정
  Metrics ─────► Compute    Optimizer  ──►       구매
                 Optimizer
                                                  Mixed
  Trusted ─────► 5개 카테고리                     Instances
  Advisor                                          ASG + Spot
                            
  CUR/Cost ────► Cost                              gp2→gp3
  Explorer       Explorer    ──►                  마이그레이션
                                                   
                            
  Anomaly ─────► Budgets    ──► SNS / Action
  Detection
```

---

## ⭐ 핵심 포인트 (Week 11 총정리)

1. ⭐ **Compute Optimizer = Right Sizing 권장 (EC2/ASG/EBS/Lambda)**
2. ⭐ **Trusted Advisor 5개 카테고리** — Cost / Performance / Security / Fault Tolerance / Service Limits
3. ⭐ **Budgets = 알림 + Action**, Cost Anomaly Detection = ML 이상 탐지
4. ⭐ **Compute SP** = EC2/Fargate/Lambda 모두 자동 할인, 가장 유연
5. ⭐ **Spot = 90% 할인 + 2분 알림**, Capacity Reservation = 용량 보장만(할인 X)

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Compute Optimizer 권장 통합 조회 (모든 리소스)
aws compute-optimizer get-recommendation-summaries \
  --query 'recommendationSummaries[*].[recommendationResourceType,summaries]'

# 2. Trusted Advisor Cost 카테고리 체크
aws support describe-trusted-advisor-checks --language en \
  --query 'checks[?category==`cost_optimizing`].[id,name]'

# 3. Cost Explorer 월별 비용 + Service 그룹
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-05-31 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE

# 4. Budget 생성 (월 $1000 + 80% 알림)
aws budgets create-budget \
  --account-id 123456789012 \
  --budget '{"BudgetName":"Monthly1000","BudgetLimit":{"Amount":"1000","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
  --notifications-with-subscribers '[{
    "Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":80},
    "Subscribers":[{"SubscriptionType":"EMAIL","Address":"ops@example.com"}]
  }]'

# 5. Cost Anomaly Detection 모니터 생성
aws ce create-anomaly-monitor \
  --anomaly-monitor '{"MonitorName":"ServiceMonitor","MonitorType":"DIMENSIONAL","MonitorDimension":"SERVICE"}'

# 6. SP 권장사항 + 활용도
aws ce get-savings-plans-purchase-recommendation \
  --savings-plans-type COMPUTE_SP \
  --term-in-years THREE_YEARS \
  --payment-option NO_UPFRONT \
  --lookback-period-in-days SIXTY_DAYS

aws ce get-savings-plans-utilization \
  --time-period Start=2026-04-01,End=2026-05-31 \
  --granularity MONTHLY

# 7. Spot Placement Score (특정 인스턴스 가용성 예측)
aws ec2 get-spot-placement-scores \
  --instance-types m5.large m5a.large m6i.large \
  --target-capacity 100 \
  --region-names ap-northeast-2
```

---

## 📝 시나리오 연습 문제 (Week 11 종합 10문항)

**문제 1.** 회사가 EC2 인스턴스 200대 운영 중이며, 어떤 인스턴스가 over-provisioned인지 알고 싶다. 가장 적합한 도구?

A) CloudWatch Dashboard 수동 분석
B) Compute Optimizer - ML 기반 Right Sizing 권장
C) Trusted Advisor Performance
D) Cost Explorer

**정답: B**
해설: CO는 14일 이상 메트릭으로 인스턴스별 권장. TA는 일반적인 체크라 인스턴스 단위 권장은 약함.

---

**문제 2.** 운영팀이 매월 $5,000 예산을 초과하지 않도록 하고, 80% 도달 시 알림 + 100% 도달 시 일부 EC2 자동 중지를 원한다.

A) Cost Explorer만 사용
B) AWS Budgets + Budget Action (IAM 정책 부착 / EC2 stop)
C) CloudWatch Alarm
D) SNS 수동 모니터

**정답: B**
해설: Budgets Action으로 임계 도달 시 자동 차단 액션 가능 (EC2 stop, RDS stop, IAM Deny 정책 부착 등).

---

**문제 3.** 회사가 CloudOps 팀과 DevOps 팀의 비용을 별도 추적하려 한다. 어떻게?

A) 계정 분리
B) Cost Allocation Tag (Team 키) + Cost Explorer Group By Tag
C) Budgets 별도 생성
D) CUR 수동 분석

**정답: B**
해설: 태그 + Billing 콘솔에서 활성화 후 Cost Explorer로 그룹핑. 가장 가벼운 방법.

---

**문제 4.** 회사가 2년간 EC2를 안정 운영하며 패밀리·리전이 자주 바뀐다. 최적 약정?

A) Standard RI
B) Compute Savings Plans 3년
C) On-Demand
D) Spot

**정답: B**
해설: Compute SP는 리전·패밀리·서비스 무관 자동 적용. Standard RI는 묶임.

---

**문제 5.** EMR 빅데이터 배치를 야간에 100대 노드로 처리한다. 비용 최소화는?

A) On-Demand
B) Standard RI
C) Spot Fleet + capacityOptimized 전략 (배치는 회수 견딤)
D) Compute SP

**정답: C**
해설: 일시적 + 무상태 + 회수 견딤 = Spot 최적. capacityOptimized로 안정성도 확보.

---

**문제 6.** 회사가 12개월간 모든 AWS 서비스 한도(Quota)가 80%에 근접하면 자동 경고를 원한다.

A) CloudWatch Custom Metric
B) Trusted Advisor Service Limits + CloudWatch Events
C) Config Rule
D) Service Quotas만 사용

**정답: B**
해설: TA의 Service Limits 체크가 80% 도달 시 발생. CloudWatch Events(EventBridge)로 알림 자동화. 단 Business 플랜 이상 필요.

---

**문제 7.** 회사 비용이 어느 날 갑자기 평소 대비 3배 증가했다. 사후 자동 탐지를 원한다.

A) Budgets
B) Cost Anomaly Detection (ML 이상치 탐지)
C) Trusted Advisor
D) CloudWatch Alarm

**정답: B**
해설: Anomaly Detection은 ML로 평소 패턴 학습 후 이상치 탐지. Budgets는 절대 임계 기반.

---

**문제 8.** 회사가 신규 m7i 인스턴스를 BCP용으로 특정 AZ에 항상 즉시 가용하게 확보하고 싶다. 비용 절감이 아닌 가용성이 목표.

A) Standard RI (할인은 되지만 가용성 보장 아님)
B) EC2 Capacity Reservation (용량 보장, 할인 X)
C) Spot
D) On-Demand

**정답: B**
해설: Capacity Reservation의 정확한 사용 사례. SP/RI는 할인이지 용량 예약 아님.

---

**문제 9.** RDS PostgreSQL을 24/7 운영. 약정 할인을 받고 싶다.

A) Compute Savings Plans
B) EC2 Instance Savings Plans
C) Reserved Instances (RDS RI)
D) Spot

**정답: C**
해설: SP는 EC2/Fargate/Lambda만. RDS·Redshift·ElastiCache·OpenSearch는 각 서비스의 RI.

---

**문제 10.** EBS 비용 절감을 위해 gp2 → gp3 마이그레이션 후보를 자동 식별하려면?

A) CLI 수동
B) Compute Optimizer EBS Volume 권장 + Trusted Advisor Cost
C) Cost Explorer
D) Config

**정답: B**
해설: CO가 EBS 볼륨 단위로 gp3 마이그레이션 권장. TA Cost도 idle/over-provisioned EBS 탐지.

---

## 📌 오늘의 요약

1. **Compute Optimizer = Right Sizing**, Trusted Advisor = 5개 통합 점검
2. **Budgets = 알림 + Action**, Cost Anomaly Detection = ML 이상 탐지
3. **Compute SP = 가장 유연한 약정**, RDS/Redshift는 RI
4. **Spot = 90% 할인 + 2분 알림**, Capacity Reservation = 용량 보장만
5. 시험 키워드: "권장/Right Sizing"→CO, "5개 카테고리"→TA, "이상 탐지"→Anomaly, "용량 보장"→Capacity Reservation
