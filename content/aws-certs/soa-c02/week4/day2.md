# Day 2 - CloudTrail Lake, Insights, EventBridge 연동

📅 날짜: Week 4 (Day 2)
🎯 주제: CloudTrail의 고급 분석·이상감지·실시간 대응
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- CloudTrail Lake로 SQL 기반 감사 분석을 한다
- CloudTrail Insights로 비정상 API 패턴을 자동 감지한다
- EventBridge로 CloudTrail 이벤트에 실시간 대응한다

---

## 🧩 사전 지식 (CS 기초)

- **Data lake**: 다양한 형식의 데이터를 그대로 저장하고 분석. Schema-on-read
- **Event-driven architecture**: 이벤트 발생 → 비동기로 다른 서비스 트리거
- **SIEM (Security Information and Event Management)**: 로그 통합·분석·경보. Splunk, Sumo Logic, OpenSearch
- **Anomaly detection in events**: API 호출량의 비정상 spike 감지
- **Threat hunting**: 보안 위협을 능동적으로 추적

---

## 📖 이론 내용

### 1. CloudTrail Lake - SQL로 감사 분석

#### 개념
- CloudTrail 이벤트를 별도 데이터 레이크에 누적
- SQL로 쿼리 (S3 export + Athena 없이)
- 최대 **10년** 보존
- 멀티 계정·멀티 리전·외부 데이터 소스 통합 가능

#### 일반 Trail vs Lake

| 항목 | 일반 Trail | CloudTrail Lake |
|------|-----------|-----------------|
| 저장소 | S3 (JSON.gz) | 데이터 레이크 (전용) |
| 분석 | S3 + Athena 또는 외부 | 콘솔에서 SQL 직접 |
| 보존 기간 | 영구 (S3 lifecycle) | 1년~10년 |
| 비용 | S3 + 별도 분석 | Ingest($2.5/GB) + Query 스캔 |
| 외부 데이터 | 불가 | 가능 (다른 클라우드, on-prem) |

#### Event Data Store
- Lake의 컨테이너. 한 ED Store에 한 데이터 종류
- 종류:
  - **CloudTrail Events** (Management/Data/Insights)
  - **Config Configuration Items**
  - **외부 이벤트 (커스텀 schema)**

#### 쿼리 예시
```sql
-- 지난 7일간 콘솔 로그인 실패 Top 10
SELECT userIdentity.userName, count(*) as fail_count
FROM <event-data-store-id>
WHERE eventName = 'ConsoleLogin'
  AND errorMessage IS NOT NULL
  AND eventTime > '2026-05-15'
GROUP BY userIdentity.userName
ORDER BY fail_count DESC
LIMIT 10;

-- IAM Role 삭제 이벤트 추적
SELECT eventTime, userIdentity.arn, requestParameters
FROM <event-data-store-id>
WHERE eventName = 'DeleteRole'
ORDER BY eventTime DESC;

-- 특정 사용자가 만진 모든 리소스
SELECT eventName, resources, eventTime
FROM <event-data-store-id>
WHERE userIdentity.userName = 'alice'
  AND eventTime > '2026-05-01';
```

### 2. CloudTrail Insights

#### 개념
- API 호출량(`ApiCallRateInsight`) 또는 에러율(`ApiErrorRateInsight`)의 비정상 spike를 ML로 감지
- 7일 정상 데이터로 baseline 학습
- 비정상 발견 시 별도 "Insight 이벤트" 발행

#### 사용 사례
- 누군가 침투해 EC2를 대량 생성 → API 호출량 spike → Insight 알림
- IAM 정책 변경 실수로 인한 대량 에러 → Insight 알림
- DDoS 봇이 무한 List 호출 → 패턴 감지

#### 활성화
```bash
aws cloudtrail put-insight-selectors \
  --trail-name org-master-trail \
  --insight-selectors '[
    {"InsightType":"ApiCallRateInsight"},
    {"InsightType":"ApiErrorRateInsight"}
  ]'
```

#### 비용
- 분석되는 이벤트 100K개당 $0.35
- Insight 이벤트는 별도 메트릭으로 발행 → CloudWatch 알람 가능

### 3. EventBridge + CloudTrail 통합

#### 동작 원리
- 모든 CloudTrail 이벤트는 EventBridge default bus로 자동 전송
- Rule로 패턴 매칭 → Target(SNS, Lambda, SSM Automation 등) 실행
- **거의 실시간** (수 초 ~ 1분)

#### 자주 쓰는 보안 Rule 패턴

**Root 사용자 사용**
```json
{
  "source": ["aws.signin"],
  "detail": { "userIdentity": { "type": ["Root"] } }
}
```

**IAM 정책 변경**
```json
{
  "source": ["aws.iam"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": ["AttachRolePolicy", "PutRolePolicy", "DeletePolicy", "CreateAccessKey"]
  }
}
```

**Security Group 모든 트래픽 허용**
```json
{
  "source": ["aws.ec2"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": ["AuthorizeSecurityGroupIngress"],
    "requestParameters": {
      "ipPermissions": {
        "items": { "ipRanges": { "items": { "cidrIp": ["0.0.0.0/0"] } } }
      }
    }
  }
}
```

**KMS 키 삭제 예약**
```json
{
  "source": ["aws.kms"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": ["ScheduleKeyDeletion", "DisableKey"]
  }
}
```

#### 자동 복구 패턴
```
CloudTrail 이벤트 (예: SG에 0.0.0.0/0 추가)
       ↓
EventBridge Rule 매칭
       ↓
SSM Automation Runbook 실행
       ↓
자동으로 해당 SG 규칙 제거 + SNS 알림
```

### 4. CloudTrail 검색·필터 비교

| 도구 | 용도 | 비용 |
|------|------|------|
| **Event History (콘솔)** | 90일 내 빠른 조회 | 무료 |
| **lookup-events API** | 프로그래밍 조회 | 무료 |
| **Athena on S3** | 장기 데이터 SQL | S3 스캔 비용 |
| **CloudTrail Lake** | 전용 SQL 분석 | Ingest + Query |
| **CloudWatch Logs Insights** | Logs 통합 시 빠른 쿼리 | Logs Insights 비용 |
| **SIEM (Splunk 등)** | 외부 통합 분석 | 외부 도구 비용 |

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Federated query** | Lake에서 외부 SQL 도구 연동 | 통합 감사 |
| **Lake Cross-Account** | 한 Lake에 여러 계정 데이터 통합 | 멀티 계정 |
| **Insights 학습 기간** | 7일 baseline 학습 | 즉시 동작 X |
| **Custom Insights Rule** | API ARN/Service 단위 필터 | 노이즈 감소 |
| **Channel** | 외부 이벤트 소스 → Lake | Cloud Asset Inventory 등 |

> ⚠️ **함정 1**: CloudTrail Insights는 활성화 후 7일 학습 후 동작. 새 계정에서 즉시 알람 X.
>
> ⚠️ **함정 2**: Lake와 일반 Trail은 서로 별도 청구. 둘 다 쓰면 비용 2배.
>
> 💡 **암기 팁**: 분석 빈도 = Lake, 보관 + 외부 분석 = S3 + Athena, 실시간 대응 = EventBridge.

### 관련 서비스 Cross-Reference

- **Lake → Week 9 보안 운영** (Security Hub finding과 연계)
- **Insights → Week 9 GuardDuty** (두 도구 모두 ML 기반 이상 감지)
- **EventBridge → Week 5 SSM** (Automation Runbook 트리거)
- **EventBridge → Week 6 CFn** (Stack 변경 알림)

---

## 🏗️ 아키텍처 다이어그램

```
CloudTrail 3-Layer 분석 아키텍처
==========================================================

   [모든 AWS API 호출]
            │
            ▼
   ┌──────────────────┐
   │   CloudTrail     │
   └──┬───────┬───────┘
      │       │
      │       └─────────────────────────┐
      │                                  │
      ▼                                  ▼
  ┌────────────────┐               ┌────────────┐
  │ Standard Trail │               │EventBridge │
  │  → S3          │               │  default   │
  │  → CW Logs     │               │   bus      │
  └─┬──────────────┘               └─────┬──────┘
    │                                    │
    ▼                                    ▼
  [장기 보관 + 무결성]            [Rule 매칭]
  [Athena 분석]                    [SNS/Lambda/SSM]
  
  
  ┌──────────────────┐
  │ CloudTrail Lake  │  ← 별도 활성화
  │  - SQL 쿼리      │  ← 10년 보존
  │  - 멀티 계정 통합 │  ← 외부 데이터 소스
  └──────────────────┘
  
  
  ┌──────────────────┐
  │CloudTrail Insights│ ← 별도 활성화 ($0.35/100K)
  │ - 7일 baseline   │
  │ - API rate spike │
  │ - Error spike    │
  └──────────────────┘
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **CloudTrail Lake** = 콘솔에서 SQL 쿼리, 10년 보존, 멀티 계정 통합
2. ⭐ **CloudTrail Insights** = ML 기반 API 호출량/에러율 이상 감지, 7일 학습
3. ⭐ **EventBridge로 거의 실시간 대응** — Root 로그인, SG 0.0.0.0/0 추가 등
4. ⭐ **Lake와 일반 Trail은 별도 청구** — 동시 사용 시 비용 주의
5. ⭐ **자동 복구 패턴**: EventBridge → SSM Automation

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. CloudTrail Lake Event Data Store 생성
aws cloudtrail create-event-data-store \
  --name "org-audit-lake" \
  --advanced-event-selectors '[
    {
      "Name": "Log all CloudTrail events",
      "FieldSelectors": [
        {"Field":"eventCategory","Equals":["Management","Data"]}
      ]
    }
  ]' \
  --retention-period 2555 \
  --multi-region-enabled \
  --organization-enabled

# 2. Lake에 SQL 쿼리 실행
QUERY_ID=$(aws cloudtrail start-query \
  --query-statement "SELECT eventTime, eventName, userIdentity.arn FROM <store-id> WHERE eventName='DeleteRole' AND eventTime > '2026-05-15' ORDER BY eventTime DESC LIMIT 100" \
  --query 'QueryId' --output text)

aws cloudtrail get-query-results --query-id $QUERY_ID

# 3. CloudTrail Insights 활성화
aws cloudtrail put-insight-selectors \
  --trail-name org-master-trail \
  --insight-selectors '[
    {"InsightType":"ApiCallRateInsight"},
    {"InsightType":"ApiErrorRateInsight"}
  ]'

# 4. EventBridge Rule: Root 사용자 로그인
aws events put-rule \
  --name "alert-root-login" \
  --description "Alert when root user logs in" \
  --event-pattern '{
    "source": ["aws.signin"],
    "detail-type": ["AWS Console Sign In via CloudTrail"],
    "detail": {"userIdentity": {"type": ["Root"]}}
  }' \
  --state ENABLED

aws events put-targets \
  --rule alert-root-login \
  --targets "Id=1,Arn=arn:aws:sns:ap-northeast-2:123:security-alerts"

# 5. EventBridge Rule: SG에 0.0.0.0/0 추가 시 자동 차단
aws events put-rule \
  --name "block-open-sg" \
  --event-pattern '{
    "source": ["aws.ec2"],
    "detail-type": ["AWS API Call via CloudTrail"],
    "detail": {
      "eventName": ["AuthorizeSecurityGroupIngress"],
      "requestParameters": {
        "ipPermissions": {"items": {"ipRanges": {"items": {"cidrIp": ["0.0.0.0/0"]}}}}
      }
    }
  }'

aws events put-targets \
  --rule block-open-sg \
  --targets 'Id=1,Arn=arn:aws:ssm:ap-northeast-2:123:automation-definition/RevokeSGIngress'

# 6. 모든 IAM 정책 변경 → CloudWatch Logs 알람
# (Logs 통합된 Trail의 Metric Filter)
aws logs put-metric-filter \
  --log-group-name CloudTrail/orgtrail \
  --filter-name "iam-policy-changes" \
  --filter-pattern '{ ($.eventName="AttachRolePolicy") || ($.eventName="PutRolePolicy") || ($.eventName="DeletePolicy") || ($.eventName="CreateAccessKey") }' \
  --metric-transformations metricName=IAMPolicyChanges,metricNamespace=Security,metricValue=1
```

---

## 📝 연습 문제

**문제 1.** 회사가 지난 1년치 CloudTrail 이벤트를 SQL로 분석해야 한다. 가장 적합한 도구는?

A) Event History (콘솔)
B) CloudTrail Lake — Event Data Store로 SQL 쿼리, 10년 보존
C) Logs Insights
D) DynamoDB

**정답: B**
해설: Event History 90일까지만. Lake는 콘솔에서 직접 SQL 쿼리 + 장기 보존 + 멀티 계정 통합. S3 + Athena 패턴도 가능하지만 Lake가 더 간편.

---

**문제 2.** 누군가 한 계정에서 비정상적으로 많은 RunInstances API를 호출한다. 자동 감지하려면?

A) Logs Insights 주기 실행
B) CloudTrail Insights 활성화 - API call rate spike 자동 감지
C) Manual review
D) Config

**정답: B**
해설: CloudTrail Insights는 정확히 이런 상황을 위해 존재. ML이 baseline에서 벗어난 호출량/에러율 자동 감지. 단, 7일 학습 기간 필요.

---

**문제 3.** Root 사용자가 콘솔 로그인하면 SNS 알림 + SSM Automation으로 MFA 강제 정책 적용을 자동화하려 한다. 어떤 도구 조합?

A) CloudWatch Alarm + Lambda
B) EventBridge Rule(CloudTrail 이벤트 패턴) → SNS + SSM Automation Runbook
C) Config Rule
D) CloudTrail Insights

**정답: B**
해설: EventBridge는 CloudTrail 이벤트를 거의 실시간 처리 가능. Rule에 패턴 매칭 + 여러 Target(SNS + SSM)에 fan-out.

---

**문제 4.** 회사 운영자가 "CloudTrail Lake가 일반 Trail의 대체"인 줄 알고 둘 다 활성화했다. 결과는?

A) 비용 중복 — Lake는 이벤트 ingest 비용, 일반 Trail은 S3 비용 별도 발생. 필요한 경우만 둘 다 운영
B) 자동 통합
C) Lake가 우선
D) Trail이 우선

**정답: A**
해설: 두 시스템은 독립적. Lake는 분석 우선, Trail은 영구 보관·외부 도구 통합 우선. 비용·요구사항 따라 선택.

---

**문제 5.** EventBridge로 CloudTrail 이벤트를 받으려면 별도 활성화가 필요한가?

A) 예, Trail에 EventBridge 옵션 활성화
B) 아니오, 모든 CloudTrail 이벤트는 자동으로 default event bus로 전송 — Rule만 만들면 됨
C) Lake 활성화 필요
D) CloudWatch Logs 통합 필요

**정답: B**
해설: CloudTrail 이벤트는 EventBridge default bus로 자동 전송. Rule만 만들면 패턴 매칭 후 Target 실행. 별도 활성화 불필요.

---

## 📌 오늘의 요약

1. CloudTrail Lake: SQL 분석 전용 데이터 레이크. 10년 보존, 멀티 계정 통합, 외부 데이터 가능
2. CloudTrail Insights: ML 기반 API 이상 감지(호출량/에러율). 7일 학습 후 동작
3. EventBridge로 CloudTrail 이벤트 거의 실시간 처리 — 별도 활성화 불필요
4. 자동 복구 패턴: CloudTrail → EventBridge → SSM Automation Runbook
5. Lake와 일반 Trail은 별도 청구. 필요에 따라 선택 (분석 = Lake, 보관 + 외부 = Trail)
