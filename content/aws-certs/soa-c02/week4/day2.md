# Day 23 - CloudTrail Lake 심화: SQL 감사 분석, Insights 이상 탐지, 크로스 계정 쿼리

CloudTrail의 S3 + Athena 패턴은 강력하지만 마찰이 있다. Athena 테이블을 만들고, 파티션을 설정하고, 쿼리를 작성하고, 결과를 해석하는 과정이 감사가 급할 때 시간을 잡아먹는다. CloudTrail Lake는 이 마찰을 제거한다. 이벤트 데이터를 전용 레이크에 직접 저장하고, 콘솔에서 SQL을 바로 실행한다. 오늘은 SOA 운영자 시각에서 CloudTrail Lake의 Event Data Store 설계, SQL 쿼리 패턴, Insights의 ML 기반 이상 탐지 원리, 그리고 Organization 규모의 크로스 계정 활용까지 실무 중심으로 깊이 다룬다.

## CloudTrail Lake 설계 철학: 저장과 분석의 통합

기존 Trail(S3 저장)은 "저장과 분석을 분리"하는 구조다. 이벤트가 S3에 JSON.gz로 쌓이면, Athena가 그것을 읽어 쿼리한다. 이 분리가 유연성을 주지만, Athena 테이블·파티션 관리라는 운영 부담이 생긴다.

CloudTrail Lake는 이벤트를 **컬럼형 저장소(Columnar Storage)**에 직접 수집한다. 컬럼형은 특정 필드만 스캔할 때 I/O가 훨씬 적다. `eventName = 'ConsoleLogin'`만 조건으로 걸면 다른 컬럼은 읽지 않아 쿼리가 빠르고 비용이 낮다.

| 항목 | 일반 Trail (S3 + Athena) | CloudTrail Lake |
|------|------------------------|-----------------|
| 저장 형식 | JSON.gz (행 기반) | 컬럼형 저장소 |
| 분석 준비 | Glue Crawler + Athena 테이블 생성 | 즉시 SQL 실행 가능 |
| 최대 보존 기간 | 무제한 (S3 Lifecycle) | **7년 (2555일)** |
| 쿼리 비용 | 스캔 TB당 $5 (Athena) | 스캔 TB당 $5 (Lake) |
| 수집 비용 | Trail 관리 이벤트: 무료 (첫 copy), 추가 Trail $2/100K | $2.50/GB Ingest |
| 외부 이벤트 수집 | 불가 | ✅ 가능 (다른 클라우드, 온프레미스) |
| 멀티 계정 통합 | Organization Trail (별도 설정) | Organization-enabled EDS |
| 크로스 계정 쿼리 | 불가 | ✅ 계정 간 EDS 쿼리 가능 |
| Insights | Trail 설정 필요 | EDS에 직접 활성화 가능 |

> ⚠️ **함정**: Lake와 Trail은 독립 청구된다. 같은 이벤트를 Trail(S3)에도 저장하고 Lake에도 수집하면 이중 비용이다. 보안 감사가 주목적이면 Lake, 장기 아카이브 + SIEM 연동이 목적이면 Trail+S3, 둘 다 필요하면 비용을 인지하고 운영한다. Organization Trail로 중앙화하면 Trail 자체 비용은 낮아지지만 Lake Ingest 비용은 별도다.

## Event Data Store(EDS): Lake의 핵심 컨테이너

Lake 안에서 실제 이벤트를 저장하는 단위가 **Event Data Store(EDS)**다. 하나의 EDS는 한 종류의 이벤트 스트림을 담는다. 여러 EDS를 만들어 Management Events·Data Events·Insights Events를 분리 저장하는 것이 설계 모범 사례다.

### EDS 설정 핵심 파라미터

```bash
aws cloudtrail create-event-data-store \
  --name "org-management-events-7yr" \
  --advanced-event-selectors '[
    {
      "Name": "All Management Events",
      "FieldSelectors": [
        {"Field": "eventCategory", "Equals": ["Management"]}
      ]
    }
  ]' \
  --retention-period 2555 \
  --multi-region-enabled \
  --organization-enabled \
  --termination-protection-enabled \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/mrk-abc123
```

| 파라미터 | 값 | 의미 |
|---------|---|------|
| `retention-period` | 90~2555일 | 90일: 최소, 2555일(7년): 최대 (규제 요건별 선택) |
| `multi-region-enabled` | true | 모든 리전 이벤트 수집 (false면 EDS 생성 리전만) |
| `organization-enabled` | true | Organization 전체 계정 이벤트 수집 |
| `termination-protection-enabled` | true | 실수로 EDS 삭제 방지 (감사 데이터 보호) |
| `kms-key-id` | CMK ARN | EDS 저장 데이터 암호화 (규제 컴플라이언스) |

> 💡 **관련 이론**: EDS의 `termination-protection`은 데이터베이스의 **Delete Protection** 기능과 동일한 패턴이다. RDS의 `DeletionProtection`, S3의 Object Lock, DynamoDB의 `DeletionProtection`이 모두 같은 원칙을 따른다. 감사 데이터는 "실수로 삭제할 수 없어야 한다"는 요구사항이 규제(PCI-DSS 10.7: 감사 로그 1년 이상 보관, HIPAA §164.312: 최소 6년 보관)에서 나온다. `termination-protection`을 끄려면 별도 비활성화 API를 먼저 호출해야 해 "2단계 삭제"를 강제한다.

### Advanced Event Selector: 정밀한 이벤트 필터링

EDS가 수집할 이벤트를 정밀하게 필터링해 비용을 제어한다.

```bash
# S3 민감 버킷의 Data Events만 수집
aws cloudtrail create-event-data-store \
  --name "sensitive-s3-data-events" \
  --advanced-event-selectors '[
    {
      "Name": "S3 PII buckets - Object level",
      "FieldSelectors": [
        {"Field": "eventCategory", "Equals": ["Data"]},
        {"Field": "resources.type", "Equals": ["AWS::S3::Object"]},
        {"Field": "resources.ARN", "StartsWith": [
          "arn:aws:s3:::pii-data-prod/",
          "arn:aws:s3:::financial-records/"
        ]},
        {"Field": "readOnly", "Equals": ["false"]}
      ]
    }
  ]' \
  --retention-period 365
```

`readOnly: false`로 쓰기(PutObject, DeleteObject)만 캡처하면 읽기 이벤트 대비 수집 데이터 양이 대폭 줄어든다.

**필터링 가능한 필드**:

| 필드 | 설명 | 예시 값 |
|------|------|--------|
| `eventCategory` | 이벤트 분류 | Management, Data, Insight |
| `eventSource` | 서비스 | s3.amazonaws.com, iam.amazonaws.com |
| `eventName` | API 작업명 | PutObject, DeleteBucket, AssumeRole |
| `readOnly` | 읽기/쓰기 | true(읽기), false(쓰기) |
| `resources.type` | 리소스 타입 | AWS::S3::Object, AWS::Lambda::Function |
| `resources.ARN` | 리소스 ARN | arn:aws:s3:::bucket-name/prefix |
| `userIdentity.type` | 호출자 유형 | IAMUser, AssumedRole, Root |
| `errorCode` | 오류 코드 | AccessDenied, ThrottlingException |

> 🔍 **더 깊이**: Data Events는 기본적으로 비활성화돼 있고, 활성화하면 비용이 크게 늘어난다. S3 Object 레벨 로깅은 대규모 버킷에서 하루 수억 건의 이벤트가 발생할 수 있다. Advanced Event Selector로 "민감 버킷만", "쓰기만", "특정 prefix만"으로 좁히는 것이 비용 제어의 핵심이다. 무분별하게 모든 S3 Data Events를 Lake에 수집하면 월 수천 달러의 Ingest 비용이 발생할 수 있다.

## SQL 쿼리 심화: 실전 감사 시나리오

CloudTrail Lake의 SQL은 Presto/Trino 기반이다. 표준 ANSI SQL에 가깝고, JSON 파싱, Window Function, 집계 함수를 지원한다.

### 쿼리 기본 구조

```sql
SELECT <컬럼 목록>
FROM <event-data-store-id>
WHERE <조건>
  AND eventTime > DATE_ADD('day', -N, NOW())
ORDER BY <정렬>
LIMIT <행 수>;
```

`<event-data-store-id>`는 실제 EDS의 UUID 형태 ID다(예: `1234abcd-12ab-34cd-56ef-1234567890ab`).

### 실전 쿼리 패턴 모음

**패턴 1: 루트 계정 로그인 추적 (보안팀 1순위)**
```sql
SELECT
  eventTime,
  userIdentity.type,
  sourceIPAddress,
  userAgent,
  additionalEventData
FROM 1234abcd-12ab-34cd-56ef-1234567890ab
WHERE eventName = 'ConsoleLogin'
  AND userIdentity.type = 'Root'
  AND eventTime > DATE_ADD('day', -90, NOW())
ORDER BY eventTime DESC;
```
Root 로그인은 어떤 이유에서든 즉시 알림이 필요하다. EventBridge Rule + SNS와 함께 사용한다.

**패턴 2: IAM 권한 상승 추적 (인사이더 위협)**
```sql
SELECT
  eventTime,
  userIdentity.arn AS actor,
  eventName,
  requestParameters,
  sourceIPAddress
FROM 1234abcd-12ab-34cd-56ef-1234567890ab
WHERE eventName IN (
  'AttachRolePolicy',
  'PutRolePolicy',
  'CreatePolicy',
  'CreatePolicyVersion',
  'SetDefaultPolicyVersion',
  'CreateAccessKey',
  'UpdateAssumeRolePolicy',
  'AddUserToGroup',
  'PutGroupPolicy',
  'AttachGroupPolicy'
)
  AND eventTime > DATE_ADD('day', -7, NOW())
ORDER BY eventTime DESC;
```

**패턴 3: S3 대량 다운로드 탐지 (데이터 유출 의심)**
```sql
SELECT
  userIdentity.arn,
  requestParameters.bucketName,
  COUNT(*) AS download_count,
  MIN(eventTime) AS first_download,
  MAX(eventTime) AS last_download
FROM 1234abcd-12ab-34cd-56ef-1234567890ab
WHERE eventName IN ('GetObject', 'HeadObject')
  AND eventTime > DATE_ADD('hour', -24, NOW())
GROUP BY userIdentity.arn, requestParameters.bucketName
HAVING COUNT(*) > 1000
ORDER BY download_count DESC;
```

**패턴 4: 비정상 AssumeRole (자격증명 탈취 의심)**
```sql
SELECT
  userIdentity.arn AS source_identity,
  requestParameters.roleArn AS assumed_role,
  COUNT(*) AS assume_count,
  COUNT(DISTINCT sourceIPAddress) AS distinct_ips,
  MIN(eventTime) AS first_seen,
  MAX(eventTime) AS last_seen
FROM 1234abcd-12ab-34cd-56ef-1234567890ab
WHERE eventName = 'AssumeRole'
  AND errorCode IS NULL
  AND eventTime > DATE_ADD('hour', -1, NOW())
GROUP BY userIdentity.arn, requestParameters.roleArn
HAVING COUNT(*) > 20 OR COUNT(DISTINCT sourceIPAddress) > 3
ORDER BY assume_count DESC;
```
같은 자격증명이 여러 IP에서 빠르게 역할을 맡는 패턴은 자격증명 공유 또는 탈취의 신호다.

**패턴 5: 특정 사용자 전체 활동 타임라인 (사고 조사)**
```sql
SELECT
  eventTime,
  eventSource,
  eventName,
  sourceIPAddress,
  userAgent,
  requestParameters,
  responseElements,
  errorCode,
  errorMessage
FROM 1234abcd-12ab-34cd-56ef-1234567890ab
WHERE (
  userIdentity.arn LIKE '%:user/alice%'
  OR userIdentity.sessionContext.sessionIssuer.arn LIKE '%:user/alice%'
)
  AND eventTime BETWEEN '2026-05-01T00:00:00Z' AND '2026-05-27T23:59:59Z'
ORDER BY eventTime ASC
LIMIT 500;
```

> 📚 **사례**: 2024년 국내 한 핀테크 스타트업에서 퇴직 직원의 자격증명이 만료되지 않아 발생한 내부자 위협 사고. 해당 직원은 퇴직 후 3일간 자신의 IAM Access Key로 S3에서 고객 데이터를 다운로드했다. CloudTrail Lake의 "패턴 3"과 유사한 쿼리로 이상 다운로드 행위를 탐지했다. `GetObject` 호출이 퇴직 전 일평균 10건이던 것이 퇴직 당일 갑자기 50,000건으로 급증했다. Insights가 이 이상을 자동 감지하고 EventBridge → Slack 알림을 전달해 15분 이내 IAM Key를 비활성화했다.

### Lake 직접 쿼리 vs Athena 경유: 선택 기준

| 상황 | 추천 | 이유 |
|------|------|------|
| 빠른 보안 조사 (지금 당장 쿼리) | Lake 직접 | 준비 시간 없음 |
| S3에 있는 오래된 로그 분석 | Athena | S3 데이터는 Lake에 없음 |
| 외부 BI 도구 연동 (Tableau 등) | Athena | JDBC/ODBC 드라이버 지원 |
| Lake → Athena 데이터 내보내기 | Lake Export → S3 → Athena | Lake 데이터를 외부 분석에 |
| 실시간 대시보드 (OpenSearch) | Trail → CW Logs → OpenSearch | Lake는 실시간 스트리밍 불가 |

> 🔍 **더 깊이**: CloudTrail Lake의 쿼리 엔진은 Presto/Trino 기반이지만, 쿼리 결과 최대 1,000행 제한이 있다. 더 많은 결과가 필요하면 `LIMIT`을 나눠 페이지네이션하거나, Lake의 "쿼리 결과를 S3로 내보내기" 기능을 사용한다. 쿼리 비용은 스캔된 데이터 양 기준(TB당 $5)이므로 `eventTime` 범위를 좁히고 필요한 컬럼만 SELECT하는 것이 비용 절감의 핵심이다. `SELECT *`보다 필요한 컬럼만 명시하면 컬럼형 저장소의 장점을 최대한 활용한다.

## CloudTrail Insights: ML 기반 이상 탐지 내부 동작

### 두 가지 Insights 유형

**ApiCallRateInsight**: 특정 API의 호출 *속도(Rate)*가 비정상적으로 증가할 때 감지한다.
- 예: `RunInstances`가 평소 시간당 5회이던 것이 갑자기 500회로 증가 → 크립토 마이닝 공격 또는 자격증명 탈취

**ApiErrorRateInsight**: 특정 API의 오류율이 비정상적으로 증가할 때 감지한다.
- 예: `GetObject` AccessDenied 오류가 평소 분당 1건이던 것이 분당 1,000건으로 증가 → IAM 정책 오류 또는 무차별 접근 시도

### 내부 동작 메커니즘

```
[1단계: Baseline 학습]
Insights 활성화 후 → 7일간 정상 패턴 학습
각 API별 시간대별 호출 속도/오류율의 통계적 분포 계산
(평균, 표준편차, 계절성 패턴 등)

[2단계: 실시간 비교]
매 분 단위로 현재 호출 패턴을 Baseline과 비교
통계적으로 유의미한 이탈(Statistical Anomaly) 감지 시 Insight 이벤트 생성

[3단계: Insight 이벤트 발생]
Insight 이벤트 → Trail S3(별도 저장) + EventBridge 전달
source: aws.cloudtrail
detail-type: AWS Insight via CloudTrail
```

> 💡 **관련 이론**: CloudTrail Insights의 이상 탐지는 **시계열 이상 탐지(Time Series Anomaly Detection)**의 일종이다. 통계적 공정 관리(Statistical Process Control, SPC)의 Shewhart Control Chart(1924)에서 유래한 "정상 변동 범위를 벗어난 관측값을 이상으로 판정"하는 원리를 따른다. 현대 ML에서는 Isolation Forest, LSTM Autoencoder, 또는 CloudWatch Anomaly Detection이 사용하는 Random Cut Forest(Amazon 개발, 2016) 알고리즘이 같은 목적에 사용된다. Insights는 AWS 내부적으로 어떤 알고리즘을 쓰는지 공개하지 않지만, 7일 학습 기간과 분 단위 평가 구조를 보면 시계열 통계 기반임을 알 수 있다.

### Insights 활성화 및 비용

```bash
# Trail에 Insights 활성화
aws cloudtrail put-insight-selectors \
  --trail-name "my-org-trail" \
  --insight-selectors '[
    {"InsightType": "ApiCallRateInsight"},
    {"InsightType": "ApiErrorRateInsight"}
  ]'

# EDS에 직접 Insights 활성화
aws cloudtrail create-event-data-store \
  --name "insights-eds" \
  --advanced-event-selectors '[
    {
      "Name": "Insight Events",
      "FieldSelectors": [
        {"Field": "eventCategory", "Equals": ["Insight"]}
      ]
    }
  ]' \
  --retention-period 90
```

**Insights 비용**: 분석 대상 Management Events **100,000건당 $0.35**.
대형 계정에서 하루 Management Events 100만 건이면 Insights 비용 = $3.50/일 = $105/월.

> ⚠️ **함정 두 가지**:
> 1. Insights는 활성화 후 **7일이 지나야** baseline이 구축된다. 신규 Trail에 바로 켜면 첫 7일간 이상 탐지가 작동하지 않는다. 중요 환경은 7일 이상 전에 미리 활성화해 두어야 한다.
> 2. Insights는 **관리 이벤트(Management Events)**만 분석한다. S3 Data Events의 이상 호출(예: 갑자기 대량 GetObject)은 Insights로 감지되지 않는다. 이런 케이스는 CloudWatch Metric Filter + Alarm 또는 Lambda로 직접 탐지 로직을 구현해야 한다.

### EventBridge + Insights: 자동 대응 파이프라인

```json
// EventBridge Rule for CloudTrail Insights
{
  "source": ["aws.cloudtrail"],
  "detail-type": ["AWS Insight via CloudTrail"],
  "detail": {
    "insightDetails": {
      "insightType": ["ApiCallRateInsight"],
      "insightContext": {
        "requestFrequency": [{
          "average": [{"numeric": [">", 100]}]
        }]
      }
    }
  }
}
```

Insights 이벤트 구조의 주요 필드:
- `insightDetails.insightType`: ApiCallRateInsight 또는 ApiErrorRateInsight
- `insightDetails.eventName`: 이상이 감지된 API 이름
- `insightDetails.insightContext.requestFrequency.average`: 이상 기간의 평균 호출량
- `insightDetails.insightContext.baselineRequestFrequency.average`: 정상 기간 평균

## Organization Trail + Lake 통합: 전사 감사 아키텍처

단일 계정이 아닌 AWS Organizations 전체를 감사하려면 Organization Trail과 Organization-enabled EDS가 필요하다.

### Organization Trail 구성

```bash
# 관리 계정 또는 위임된 CloudTrail 관리자 계정에서 실행
aws cloudtrail create-trail \
  --name "org-master-trail" \
  --s3-bucket-name "org-audit-logs-archive" \
  --is-organization-trail \
  --is-multi-region-trail \
  --enable-log-file-validation \
  --include-global-service-events \
  --cloud-watch-logs-log-group-arn arn:aws:logs:ap-northeast-2:111122223333:log-group:/aws/cloudtrail/org \
  --cloud-watch-logs-role-arn arn:aws:iam::111122223333:role/CloudTrailToCloudWatchLogs

aws cloudtrail start-logging --name "org-master-trail"
```

Organization Trail의 특징:
- 관리 계정에서 생성하면 모든 멤버 계정에 자동 적용
- 멤버 계정에서 삭제·수정 불가 (관리 계정만 가능)
- 새 계정이 Organization에 추가되면 자동으로 Trail 적용
- 신뢰된 액세스(Trusted Access) 위임으로 보안 계정에서 관리 가능

```bash
# CloudTrail 관리를 보안 계정으로 위임
aws organizations enable-aws-service-access \
  --service-principal cloudtrail.amazonaws.com

aws cloudtrail register-organization-delegated-admin \
  --member-account-id 999988887777  # 보안(Audit) 계정 ID
```

### 크로스 계정 Lake 쿼리

Organization-enabled EDS는 모든 멤버 계정의 이벤트를 하나의 EDS에서 쿼리할 수 있다.

```sql
-- Organization 전체에서 특정 기간 루트 계정 사용 조회
SELECT
  recipientAccountId AS account_id,
  eventTime,
  userIdentity.type,
  sourceIPAddress,
  userAgent
FROM org-eds-uuid-here
WHERE userIdentity.type = 'Root'
  AND eventTime > DATE_ADD('day', -30, NOW())
ORDER BY eventTime DESC;

-- 계정별 IAM 변경 건수 집계 (전사 컴플라이언스 현황)
SELECT
  recipientAccountId AS account_id,
  COUNT(*) AS iam_changes,
  COUNT(DISTINCT userIdentity.arn) AS distinct_actors
FROM org-eds-uuid-here
WHERE eventSource = 'iam.amazonaws.com'
  AND eventName NOT LIKE 'Get%'
  AND eventName NOT LIKE 'List%'
  AND eventName NOT LIKE 'Describe%'
  AND eventTime > DATE_ADD('day', -7, NOW())
GROUP BY recipientAccountId
ORDER BY iam_changes DESC;
```

`recipientAccountId` 필드가 어느 계정의 이벤트인지 구분한다.

> 📚 **사례**: 2023년 AWS re:Invent에서 발표된 한 글로벌 금융기관 사례. 50개 AWS 계정을 운영하는 이 기관은 기존에 계정별 S3+Athena로 감사 로그를 분석했다. 보안 사고 조사 시 50개 계정의 Athena를 순차적으로 쿼리하는 데 하루가 걸렸다. Organization-enabled CloudTrail Lake를 도입한 후, 동일한 조사를 단일 SQL 쿼리로 10분 내에 완료할 수 있게 됐다. 평균 사고 조사 시간(MTTR) 75% 단축.

## CloudTrail Lake vs Athena: 언제 무엇을 쓰나

SOA 운영자 관점에서 상황별 최적 도구 선택:

| 상황 | 도구 | 이유 |
|------|------|------|
| 지금 당장 이상 API 조회 | Lake 직접 쿼리 | 준비 시간 0, 즉시 실행 |
| 3년 전 감사 데이터 SQL | Lake (보존 3년 이상 설정 시) | 장기 보관 + 직접 쿼리 |
| S3에 있는 기존 로그 분석 | Athena | Lake 수집 전 데이터는 S3에 있음 |
| 기존 SIEM 연동 (Splunk, QRadar) | Trail → S3 → SIEM 에이전트 | SIEM이 S3에서 직접 Pull |
| CloudWatch 알람 기반 탐지 | Trail → CW Logs → Metric Filter | CW Alarm + SNS 파이프라인 |
| ML 기반 이상 탐지 | Trail Insights | 별도 구현 없이 바로 사용 |
| 실시간 이벤트 대응 자동화 | EventBridge (Trail 무관) | CloudTrail 이벤트 자동 수신 |

---

## 📝 연습 문제

**문제 1.** 회사가 CloudTrail Lake를 도입하려 한다. 기존 Trail(S3 저장)과 Lake를 모두 운영할 경우 발생하는 문제와 선택 기준은?

A) Lake가 Trail보다 저장 비용이 저렴하므로 Trail을 반드시 종료해야 한다
B) 동일 이벤트에 Trail 수집 비용과 Lake Ingest 비용이 별도로 발생해 이중 청구된다. 용도에 따라 하나를 선택하거나 둘 다 필요한 경우 비용을 인지한다
C) Lake가 켜지면 Trail이 자동 비활성화된다
D) Lake와 Trail은 서로 다른 이벤트를 수집해 중복이 없다

**정답: B**
해설: CloudTrail Lake와 Trail(S3)은 완전히 독립적인 서비스다. 둘 다 활성화하면 같은 이벤트를 두 군데에 수집하므로 Trail 비용 + Lake Ingest 비용이 이중으로 발생한다. 선택 기준: 즉각 SQL 분석이 주목적 → Lake, 장기 아카이브 + SIEM 연동 → Trail+S3, 두 가지 모두 필요하면 비용을 인지하고 둘 다 운영. Lake가 Trail보다 비용이 항상 저렴하지 않으며(Ingest $2.50/GB는 경우에 따라 더 비쌀 수 있음), 자동 비활성화는 없다.

---

**문제 2.** CloudTrail Insights가 "RunInstances API 호출량 100배 급증"을 감지하지 못했다. 가장 가능성 높은 원인은?

A) RunInstances는 Insights 감지 대상이 아니다
B) Insights 활성화 후 7일이 지나지 않아 Baseline이 구축되지 않았다
C) ApiErrorRateInsight만 활성화하고 ApiCallRateInsight는 활성화하지 않았다
D) Insights는 Data Events만 분석한다

**정답: B 또는 C (둘 다 가능, B가 더 일반적)**
해설: B - Insights는 활성화 후 7일이 지나야 정상 baseline이 구축된다. 신규 Trail에 바로 켜면 처음 7일간 이상 감지가 작동하지 않는다. C - RunInstances의 양 증가는 ApiCallRateInsight가 탐지한다. ApiErrorRateInsight만 켰다면 API 호출량 급증은 감지하지 못한다. D는 틀렸다 — Insights는 Management Events를 분석한다(RunInstances는 Management Event).

---

**문제 3.** 보안팀이 "특정 IAM 사용자(alice)가 지난 달 어떤 S3 버킷에서 무엇을 했는지"를 조사하려 한다. CloudTrail Lake에서 가장 적합한 쿼리 접근은?

A) `WHERE userIdentity.userName = 'alice'`로만 조회한다
B) `WHERE (userIdentity.arn LIKE '%alice%' OR userIdentity.sessionContext.sessionIssuer.arn LIKE '%alice%') AND eventSource = 's3.amazonaws.com'`로 조회한다
C) CloudTrail은 S3 이벤트를 기록하지 않는다
D) alice의 IAM Access Key ID로만 검색한다

**정답: B**
해설: IAM 사용자가 직접 호출할 때는 `userIdentity.arn`에 `:user/alice`가 포함된다. 하지만 alice가 역할을 Assume한 후 작업하면 `userIdentity.type = 'AssumedRole'`이 되어 `userIdentity.sessionContext.sessionIssuer.arn`에서 alice를 찾아야 한다. 완전한 조사를 위해 두 조건을 OR로 조합한다. `userName`은 IAM User 유형일 때만 존재하고 AssumedRole에는 없어 불완전하다.

---

**문제 4.** Organization 전체 50개 계정의 CloudTrail 이벤트를 단일 SQL로 쿼리하려 한다. 어떤 구성이 필요한가?

A) 각 계정에 Athena 테이블을 만들고 UNION ALL로 조합한다
B) Organization-enabled Event Data Store를 관리 계정 또는 위임된 관리자 계정에서 생성한다
C) 모든 계정의 Trail을 동일 S3 버킷으로 수집하면 Lake가 자동으로 통합된다
D) CloudWatch Logs Insights로 크로스 계정 쿼리가 가능하다

**정답: B**
해설: Organization-enabled EDS를 생성하면 Organization 전체 계정의 이벤트가 하나의 EDS에 수집된다. 이후 `recipientAccountId` 필드로 계정을 구분하며 단일 SQL로 전체를 쿼리할 수 있다. A는 UNION ALL 방식으로 가능하지만 테이블 관리 부담이 크다. C는 같은 S3로 수집해도 Lake가 자동 통합되지 않는다. D는 CW Logs Insights는 Log Group 기반이고 크로스 계정 네이티브 지원이 제한적이다.

---

**문제 5.** CloudTrail 이벤트를 EventBridge로 받기 위해 별도 Trail 설정이 필요한가?

A) Trail에서 "EventBridge 전달" 옵션을 명시적으로 활성화해야 한다
B) 아니다. CloudTrail 이벤트는 자동으로 EventBridge default bus에 전달된다. EventBridge Rule만 만들면 된다
C) CloudWatch Logs 통합이 먼저 필요하다
D) CloudTrail Lake가 활성화돼야 EventBridge 전달이 가능하다

**정답: B**
해설: CloudTrail 이벤트는 Trail 유무와 관계없이 자동으로 EventBridge default event bus로 전달된다. EventBridge에서 Rule을 만들어 `source: aws.cloudtrail`과 특정 `eventName`으로 패턴을 매칭하면 된다. 이것이 CloudTrail + EventBridge 통합의 핵심 편의성이다. Trail은 이벤트를 S3/CW Logs에 "저장"하는 것이고, EventBridge 전달은 별개의 "실시간 이벤트 라우팅" 채널이다.

---

**문제 6.** 한 운영자가 CloudTrail Lake 쿼리를 실행했는데 예상보다 비용이 높다. 비용을 줄이기 위한 가장 효과적인 방법은?

A) 더 짧은 보존 기간으로 EDS를 재생성한다
B) `eventTime` 범위를 좁히고 `SELECT *` 대신 필요한 컬럼만 명시한다
C) Athena로 전환한다
D) Lake를 비활성화하고 Trail+Athena로 돌아간다

**정답: B**
해설: Lake 쿼리 비용은 스캔된 데이터 양(TB) 기준이다. 비용 절감의 핵심은 두 가지다. 첫째, `eventTime` 범위를 좁히면 스캔 범위가 줄어든다(예: 30일 → 7일). 둘째, `SELECT *`는 모든 컬럼을 스캔하지만, 컬럼형 저장소는 필요한 컬럼만 명시하면 해당 컬럼만 스캔한다. 이 두 가지로 쿼리 비용을 80~90% 줄이는 것이 가능하다. 보존 기간은 저장 비용에 영향을 주지만 쿼리 비용에는 직접 영향이 없다.
