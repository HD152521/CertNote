# Day 3 - Cost Explorer, AWS Budgets, Cost Allocation Tag

📅 날짜: Week 11 (Day 3)
🎯 주제: 비용 가시화·예산 통제·태그 기반 분배
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Cost Explorer로 비용을 다차원 분석한다
- AWS Budgets로 예산 알람과 자동 차단을 구성한다
- Cost Allocation Tag로 팀/프로젝트별 비용 분배를 한다

---

## 🧩 사전 지식 (CS 기초)

- **Chargeback / Showback**: 부서에 비용 청구 vs 표시
- **Unit economics**: 단위(사용자/요청)당 비용
- **Cost driver**: 비용을 좌우하는 핵심 요인 (트래픽, 저장 등)
- **FinOps**: 클라우드 재무 운영. 개발자 + 재무 협업

---

## 📖 이론 내용

### 1. AWS Cost Explorer

#### 개념
- AWS 비용·사용량 시각화 도구
- 일별/월별/시간별 분석
- 최대 13개월 + 12개월 forecast

#### 주요 기능
- **Group by**: Service, Region, AZ, Instance Type, Linked Account, Tag 등
- **Filter**: 특정 조건만
- **Forecast**: 미래 예측 (ML 기반)
- **RI/SP Recommendations**: 약정 권장
- **Resource-level data**: 일부 서비스 (시간당 비용)

#### 시간 단위
- 일별: 기본 (Last 13 months)
- 시간별: $0.01/1000 UsageRecord (별도 활성화)
- 분 단위: 없음

#### Save Reports
- 자주 보는 리포트 저장
- 대시보드 위젯으로 추가 가능

### 2. AWS Budgets

#### 개념
- 예산 한도 설정 + 초과·임박 시 알림
- 4가지 Budget Type:
  - **Cost Budget**: 비용 한도
  - **Usage Budget**: 사용량 한도 (GB, 시간)
  - **Reservation Budget**: RI 활용도
  - **Savings Plans Budget**: SP 활용도

#### Budget Actions (자동 대응)
- 임계값 도달 시 자동 조치:
  - IAM 정책 변경 (특정 사용자 권한 축소)
  - SCP 적용
  - EC2/RDS 인스턴스 자동 중지

#### 알람 임계값
- 절대값 또는 % (예: 예산의 80%/100%)
- Forecast 기반 (예: 예측 100% 초과 시)

### 3. Cost Allocation Tag

#### 활성화
- 모든 태그가 자동 청구 분석에 포함되는 게 아님
- **Cost Allocation Tag로 명시 활성화** 필요
- 활성화 후 24~48시간 후 청구서에 표시

#### 종류
- **AWS-generated**: `aws:createdBy` 등 자동
- **User-defined**: 사용자 태그 (예: `Project`, `Environment`)

#### 표준 태그 정책 (Best Practice)
```
Project       (예: payment, web, mobile)
Environment   (dev/stage/prod)
Owner         (팀명 또는 이메일)
CostCenter    (재무 코드)
Application   (앱 이름)
```

#### Organizations Tag Policy
- 조직 전체에 태그 표준 강제
- 비표준 태그 자동 차단

### 4. Cost Explorer 활용 패턴

#### 비용 spike 원인 찾기
```
Group by: Service
   → 가장 큰 비중 서비스 식별
Group by: Linked Account (멀티 계정)
   → 어느 계정에서 spike
Group by: Tag (Project)
   → 어느 프로젝트
Group by: Usage Type
   → 어떤 사용 (전송? 저장? 컴퓨팅?)
```

#### 가장 비싼 리소스 식별
- Resource-level (시간당) 활성화
- Instance ID 단위 분석
- 미사용·과다 인스턴스 발견

#### RI/SP 권장
- Cost Explorer → Recommendations
- 12개월 사용 패턴 분석 → 약정 ROI 계산

### 5. AWS Cost and Usage Report (CUR)

#### 개념
- 가장 상세한 청구 데이터 (시간 단위, 리소스 단위)
- S3에 저장 → Athena/QuickSight로 분석

#### Cost Explorer vs CUR

| 항목 | Cost Explorer | CUR |
|------|---------------|-----|
| 인터페이스 | 콘솔 GUI | S3 raw 데이터 |
| 분석 | 미리 정의된 차원 | 임의 SQL |
| 비용 | 무료 (시간별은 유료) | 무료 (저장만) |
| 사용 사례 | 일상 분석 | 심층 분석, 사내 도구 |

### 6. AWS Billing Conductor

#### 개념
- 멀티 계정 환경에서 사내 청구 정책 커스텀
- 마진 추가, 통합 계정에 청구

#### 사용 사례
- SI/MSP: 고객별 청구
- 사내: 부서별 마진 추가

### 7. AWS Billing & Cost Management 콘솔

#### 주요 기능
- 청구서 (Bills)
- 결제 방법
- 크레딧
- 세금 설정
- 다중 통화

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Free Tier Alerts** | 무료 한도 도달 알림 | Budget 활용 |
| **Forecast 정확도** | 충분한 이력 데이터 필요 (3개월+) | 신규 워크로드는 부정확 |
| **Reserved Instance Marketplace** | 미사용 RI 판매·구매 | 비용 회수 |
| **Spot Pricing History** | Spot 가격 추세 분석 | 입찰 전략 |
| **AWS Migration Hub** | 마이그레이션 비용 추정 | 사전 계획 |

> ⚠️ **함정 1**: Cost Allocation Tag 활성화 전 데이터는 청구 분석에 표시 안 됨 — 가능한 빨리 활성화.
>
> ⚠️ **함정 2**: Budget Actions에 SCP 사용 시 의도치 않은 영향 — 단계적 적용 권장.
>
> 💡 **암기 팁**: Cost Explorer(분석) ↔ Budgets(예산·자동 차단) ↔ CUR(심층) ↔ Anomaly Detection(spike).

### 관련 서비스 Cross-Reference

- **Cost Allocation Tag → Week 1 Day 4 Organizations Tag Policy**
- **Budgets → Week 11 Day 2 Cost Anomaly**
- **CUR → Week 4 CloudTrail Lake** (비슷한 SQL 분석)
- **Cost Explorer → Week 11 Day 4 Savings Plans**

---

## 🏗️ 아키텍처 다이어그램

```
비용 분석·통제 통합 흐름
==========================================================

   [AWS 사용]
        │
        ▼
   ┌─────────────────────────────┐
   │  Billing 데이터             │
   │  - Service / Region / Tag   │
   │  - Linked Account           │
   └────┬────────────────────────┘
        │
        ├──→ [Cost Explorer]    분석/시각화
        ├──→ [AWS Budgets]      한도 설정 + 알림 + Action
        ├──→ [Cost Anomaly]     ML 기반 spike 감지
        └──→ [CUR + S3]         심층 SQL 분석
                  │
                  ▼
              [Athena + QuickSight]
              [사내 BI 도구]


   Cost Allocation Tag 흐름:
   ────────────────────────
   리소스 태그 부여
        ↓
   Cost Allocation Tag 활성화
        ↓
   24-48시간 후 청구 데이터에 표시
        ↓
   Cost Explorer Group by Tag
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Cost Explorer = 비용 시각화 + Forecast + RI/SP 권장**
2. ⭐ **AWS Budgets = 예산 알림 + Budget Actions로 자동 대응** (IAM/SCP/Stop)
3. ⭐ **Cost Allocation Tag 활성화 전 데이터는 분석 표시 X** — 빨리 활성화
4. ⭐ **CUR = 시간·리소스 단위 raw 데이터** + S3 + Athena
5. ⭐ **Cost Anomaly Detection으로 spike 자동 감지** — ML 기반

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Cost Explorer - Service별 일별 비용 (지난 30일)
aws ce get-cost-and-usage \
  --time-period Start=$(date -d '30 days ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --query 'ResultsByTime[*].[TimePeriod.Start,Groups[*].[Keys[0],Metrics.UnblendedCost.Amount]]' \
  --output json

# 2. Tag별 비용 분석
aws ce get-cost-and-usage \
  --time-period Start=2026-05-01,End=2026-05-31 \
  --granularity MONTHLY \
  --metrics UnblendedCost \
  --group-by Type=TAG,Key=Project \
  --filter '{"Tags":{"Key":"Environment","Values":["prod"]}}'

# 3. Forecast (다음 30일 예측)
aws ce get-cost-forecast \
  --time-period Start=$(date +%Y-%m-%d),End=$(date -d '+30 days' +%Y-%m-%d) \
  --metric UNBLENDED_COST \
  --granularity DAILY

# 4. Cost Allocation Tag 활성화
aws ce update-cost-allocation-tags-status \
  --cost-allocation-tags-status '[
    {"TagKey":"Project","Status":"Active"},
    {"TagKey":"Environment","Status":"Active"},
    {"TagKey":"Owner","Status":"Active"}
  ]'

# 5. Budget 생성 (월 $5,000 한도)
aws budgets create-budget \
  --account-id 123456789012 \
  --budget '{
    "BudgetName": "MonthlyTotal",
    "BudgetLimit": {"Amount": "5000", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST",
    "CostFilters": {"TagKeyValue": ["user:Project$prod-web"]}
  }' \
  --notifications-with-subscribers '[
    {
      "Notification": {
        "NotificationType": "ACTUAL",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 80,
        "ThresholdType": "PERCENTAGE"
      },
      "Subscribers": [{"SubscriptionType":"EMAIL","Address":"finops@company.com"}]
    },
    {
      "Notification": {
        "NotificationType": "FORECASTED",
        "ComparisonOperator": "GREATER_THAN",
        "Threshold": 100,
        "ThresholdType": "PERCENTAGE"
      },
      "Subscribers": [{"SubscriptionType":"EMAIL","Address":"finops@company.com"}]
    }
  ]'

# 6. Budget Action (예산 초과 시 SCP 적용)
aws budgets create-budget-action \
  --account-id 123456789012 \
  --budget-name MonthlyTotal \
  --notification-type ACTUAL \
  --action-type APPLY_SCP_POLICY \
  --action-threshold ActionThresholdValue=100,ActionThresholdType=PERCENTAGE \
  --definition '{
    "ScpActionDefinition": {
      "PolicyId": "p-deny-ec2",
      "TargetIds": ["ou-abc"]
    }
  }' \
  --execution-role-arn arn:aws:iam::123:role/BudgetActionRole \
  --approval-model MANUAL \
  --subscribers '[{"Address":"finops@company.com","SubscriptionType":"EMAIL"}]'

# 7. CUR 설정 (S3 + Athena)
aws cur put-report-definition \
  --report-definition '{
    "ReportName": "monthly-cur",
    "TimeUnit": "HOURLY",
    "Format": "Parquet",
    "Compression": "Parquet",
    "AdditionalSchemaElements": ["RESOURCES"],
    "S3Bucket": "my-cur-bucket",
    "S3Prefix": "cur",
    "S3Region": "ap-northeast-2",
    "AdditionalArtifacts": ["ATHENA"],
    "RefreshClosedReports": true,
    "ReportVersioning": "OVERWRITE_REPORT"
  }'

# 8. 비용 spike 가장 큰 day 찾기
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-05-22 \
  --granularity DAILY \
  --metrics UnblendedCost \
  --query 'sort_by(ResultsByTime, &Total.UnblendedCost.Amount)[-5:].[TimePeriod.Start,Total.UnblendedCost.Amount]'
```

---

## 📝 연습 문제

**문제 1.** 회사가 프로젝트별 비용 분석을 시작하려 한다. 어떤 단계가 필요한가?

A) Cost Explorer 활성화
B) 모든 리소스에 `Project` 태그 부여 + Cost Allocation Tag로 활성화 (24-48시간 후 분석 가능)
C) CUR
D) Budgets

**정답: B**
해설: 태그 부여 + Cost Allocation Tag로 명시 활성화가 핵심. 일반 태그는 자동 청구 분석 포함 X. 활성화 후 24-48시간 대기.

---

**문제 2.** 회사가 월 예산 $10,000 도달 시 자동으로 새 EC2 생성을 차단하려 한다. 어떤 도구?

A) Cost Explorer
B) AWS Budgets + Budget Actions (SCP 자동 적용 또는 IAM 정책 변경)
C) CloudWatch
D) Lambda

**정답: B**
해설: Budget Actions가 정확한 도구. 임계값 도달 시 SCP/IAM 자동 적용, EC2/RDS 자동 중지 등.

---

**문제 3.** 시간별·리소스 단위 가장 상세한 청구 데이터를 SQL로 분석하려면?

A) Cost Explorer
B) Cost and Usage Report (CUR) + S3 + Athena
C) CloudWatch
D) Budgets

**정답: B**
해설: CUR이 가장 상세 (시간/리소스 단위). S3 저장 후 Athena SQL 분석. Cost Explorer는 콘솔 시각화.

---

**문제 4.** 비용이 갑자기 spike 발생했을 때 자동 알림받으려면?

A) Budgets만
B) AWS Cost Anomaly Detection - ML 기반 자동 감지
C) Trusted Advisor
D) CloudWatch

**정답: B**
해설: Cost Anomaly Detection이 ML로 정상 패턴 학습 → 비정상 spike 자동 알림. Budgets는 정해진 임계값만.

---

**문제 5.** 회사 운영자가 RI 권장사항을 받고 약정 결정을 하려 한다. 어디서?

A) Cost Explorer → Recommendations (RI/Savings Plans 권장 자동)
B) Budgets
C) Trusted Advisor만
D) Lambda

**정답: A**
해설: Cost Explorer 내장 Recommendations이 12개월 사용 패턴 분석 → 최적 RI/SP 권장. 예상 절감액·ROI 표시.

---

## 📌 오늘의 요약

1. Cost Explorer = 비용 시각화 + Forecast + RI/SP 권장. Group by 차원 다양
2. AWS Budgets = 예산 + 알림 + Budget Actions(자동 SCP/IAM/Stop)
3. Cost Allocation Tag = 태그 활성화 후 청구 분석에 표시 (24-48시간 대기)
4. CUR = 시간·리소스 단위 raw 데이터. S3 + Athena로 심층 분석
5. Cost Anomaly Detection으로 비용 spike 자동 감지 (ML 기반)
