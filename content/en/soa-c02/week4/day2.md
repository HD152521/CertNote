# Day 2 - CloudTrail Lake Advanced: SQL Audit Analysis, Insights Anomaly Detection, Cross-Account Queries

CloudTrail's S3 + Athena pattern is powerful but has friction. Building Athena tables, setting up partitions, writing queries, and interpreting results consume time when audits are urgent. CloudTrail Lake removes this friction. It stores event data directly in a dedicated lake and runs SQL instantly from the console. Today, from the SOA operator's perspective, we dive deep into Event Data Store design, SQL query patterns, how ML-based Insights detects anomalies, cross-account usage at organizational scale, and practical implementation.

## CloudTrail Lake Design Philosophy: Unified Storage and Analysis

Traditional Trail (S3 storage) separates "storage and analysis." Events accumulate in S3 as JSON.gz, then Athena reads and queries them. This separation provides flexibility but adds operational burden: Athena table and partition management.

CloudTrail Lake ingests events directly into **Columnar Storage**. Columnar format dramatically reduces I/O when scanning specific fields. If you filter only `eventName = 'ConsoleLogin'`, other columns aren't read—queries are faster and cheaper.

| Item | Standard Trail (S3 + Athena) | CloudTrail Lake |
|------|------------------------|-----------------|
| Storage format | JSON.gz (row-based) | Columnar store |
| Analysis prep | Glue Crawler + Athena table creation | Ready for SQL immediately |
| Max retention | Unlimited (S3 Lifecycle) | **7 years (2555 days)** |
| Query cost | Per TB scanned: $5 (Athena) | Per TB scanned: $5 (Lake) |
| Ingest cost | Management free (first copy), extra Trail $2/100K | $2.50/GB Ingest |
| External events | Not possible | ✅ Possible (other clouds, on-prem) |
| Multi-account | Organization Trail (separate setup) | Organization-enabled EDS |
| Cross-account query | Not possible | ✅ Query EDS across accounts |
| Insights | Requires Trail setup | Direct EDS activation |

> ⚠️ **Pitfall**: Lake and Trail are billed separately. If same events go to both Trail (S3) and Lake, you pay double. For security audit: Lake. For long-term archive + SIEM integration: Trail+S3. For both: understand the dual cost. Organization Trail lowers Trail cost, but Lake Ingest cost is separate.

## Event Data Store (EDS): Core Container of Lake

**Event Data Store** is the unit that stores events within Lake. One EDS holds one stream of events. Best practice: create multiple EDS—separate Management Events, Data Events, and Insights Events.

### EDS Core Parameters

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

| Parameter | Value | Meaning |
|---------|---|------|
| `retention-period` | 90~2555 days | 90 minimum, 2555 (7yr) maximum (choose per regulatory need) |
| `multi-region-enabled` | true | Collect from all regions (false = EDS region only) |
| `organization-enabled` | true | Collect entire Organization account events |
| `termination-protection-enabled` | true | Prevent accidental EDS deletion (audit data protection) |
| `kms-key-id` | CMK ARN | Encrypt stored EDS data (regulatory compliance) |

> 💡 **Related Theory**: EDS `termination-protection` is the same pattern as database **Delete Protection**. RDS `DeletionProtection`, S3 Object Lock, DynamoDB `DeletionProtection` follow the same principle. Audit data must "not be accidentally deleted"—this requirement originates from regulations (PCI-DSS 10.7: 1+ year log retention, HIPAA §164.312: 6+ year retention). Disabling `termination-protection` requires a separate API call first, enforcing "two-step deletion."

### Advanced Event Selector: Precise Filtering

Fine-filter EDS events to control costs.

```bash
# Collect Data Events only from sensitive S3 buckets
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

`readOnly: false` captures writes (PutObject, DeleteObject) only, drastically reducing data volume vs. all read events.

**Filterable fields**:

| Field | Description | Example Values |
|------|------|--------|
| `eventCategory` | Event classification | Management, Data, Insight |
| `eventSource` | Service | s3.amazonaws.com, iam.amazonaws.com |
| `eventName` | API action | PutObject, DeleteBucket, AssumeRole |
| `readOnly` | Read/write | true (read), false (write) |
| `resources.type` | Resource type | AWS::S3::Object, AWS::Lambda::Function |
| `resources.ARN` | Resource ARN | arn:aws:s3:::bucket-name/prefix |
| `userIdentity.type` | Caller type | IAMUser, AssumedRole, Root |
| `errorCode` | Error code | AccessDenied, ThrottlingException |

> 🔍 **Deeper Dive**: Data Events are disabled by default; enabling incurs large costs. S3 object logging on large buckets generates billions of events daily. Advanced Event Selector narrowing to "sensitive buckets only," "writes only," "specific prefix only" is critical for cost control. Unfiltered S3 Data Events collection can cost thousands monthly in Ingest charges.

## SQL Query Advanced: Real-World Audit Scenarios

CloudTrail Lake SQL is Presto/Trino-based. Close to standard ANSI SQL, supporting JSON parsing, Window Functions, and aggregates.

### Basic Query Structure

```sql
SELECT <column list>
FROM <event-data-store-id>
WHERE <conditions>
  AND eventTime > DATE_ADD('day', -N, NOW())
ORDER BY <sorting>
LIMIT <rows>;
```

`<event-data-store-id>` is the actual UUID-form EDS ID (e.g., `1234abcd-12ab-34cd-56ef-1234567890ab`).

### Real Query Patterns

**Pattern 1: Root Account Login Tracking (Security First Priority)**
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
Root logins demand immediate alert regardless. Pair with EventBridge Rule + SNS.

**Pattern 2: IAM Privilege Escalation (Insider Threat)**
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

**Pattern 3: Large S3 Download Detection (Data Exfil Suspect)**
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

**Pattern 4: Abnormal AssumeRole (Credential Theft Suspect)**
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
Rapid role assumption from multiple IPs signals credential share or theft.

**Pattern 5: Specific User Activity Timeline (Incident Investigation)**
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

> 📚 **Case Study**: 2024 fintech startup insider threat. Departed employee's credentials expired after 3 days post-departure. That employee downloaded customer data from S3 for 3 days. Query Pattern 3 detected anomalous download. `GetObject` jumped from 10/day average to 50,000/day post-departure. Insights auto-detected the anomaly and EventBridge → Slack alert triggered in 15 minutes; IAM Key disabled within 15 minutes total response time.

### Lake Direct Query vs. Athena: Selection

| Situation | Recommendation | Why |
|------|------|------|
| Fast security investigation (query now) | Lake direct | Zero prep time |
| Analyze old S3 logs | Athena | S3 data not in Lake |
| BI tool integration (Tableau) | Athena | JDBC/ODBC driver support |
| Export Lake → Athena | Lake Export → S3 → Athena | Lake data to external analysis |
| Real-time dashboard (OpenSearch) | Trail → CW Logs → OpenSearch | Lake no real-time streaming |

> 🔍 **Deeper Dive**: CloudTrail Lake query engine (Presto/Trino) has 1,000-row result maximum. For more results, paginate with separate `LIMIT` queries or use Lake's "export results to S3" feature. Query cost is per data scanned (TB at $5); narrowing `eventTime` range and selecting only needed columns cuts costs. `SELECT *` scans all; columnar storage benefits maximized by naming specific columns.

## CloudTrail Insights: ML-Based Anomaly Detection Internals

### Two Insights Types

**ApiCallRateInsight**: Detects when specific API call *rate* spikes abnormally.
- Example: `RunInstances` normally 5/hour → suddenly 500/hour → crypto mining attack or credential theft

**ApiErrorRateInsight**: Detects when specific API error rate spikes abnormally.
- Example: `GetObject` AccessDenied normally 1/minute → suddenly 1,000/minute → IAM policy error or brute-force access

### Internal Operation Mechanism

```
[Stage 1: Baseline Learning]
Insights activated → 7 days normal pattern learning
Calculate statistical distribution per API per hour
(mean, std deviation, seasonality, etc.)

[Stage 2: Real-time Comparison]
Every minute, compare current pattern to Baseline
Statistically significant deviation → Insight event generated

[Stage 3: Insight Event Creation]
Insight event → Trail S3 (separate storage) + EventBridge delivery
source: aws.cloudtrail
detail-type: AWS Insight via CloudTrail
```

> 💡 **Related Theory**: CloudTrail Insights anomaly detection is **Time Series Anomaly Detection**. Originates from Statistical Process Control (Shewhart Control Chart, 1924): "observations outside normal variance range = anomaly." Modern ML uses Isolation Forest, LSTM Autoencoder, or Random Cut Forest (Amazon 2016, used by CloudWatch Anomaly Detection). AWS doesn't disclose Insights algorithm, but 7-day learning + minute-level evaluation suggests statistical time-series basis.

### Insights Activation and Cost

```bash
# Enable Insights on Trail
aws cloudtrail put-insight-selectors \
  --trail-name "my-org-trail" \
  --insight-selectors '[
    {"InsightType": "ApiCallRateInsight"},
    {"InsightType": "ApiErrorRateInsight"}
  ]'

# Enable Insights directly on EDS
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

**Insights cost**: $0.35 per 100,000 Management Events analyzed.
Large account with 1M Management Events/day = $3.50/day = $105/month.

> ⚠️ **Two Pitfalls**:
> 1. Insights needs **7+ days** baseline construction. Enabling on new Trail immediately won't detect anomalies the first week. Pre-enable in important environments 7+ days before.
> 2. Insights analyzes **Management Events only**. Abnormal S3 Data Event spikes (sudden GetObject surge) are NOT detected by Insights. Use CloudWatch Metric Filter + Alarm or custom Lambda for such cases.

### EventBridge + Insights: Auto-Response Pipeline

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

Key fields in Insights event structure:
- `insightDetails.insightType`: ApiCallRateInsight or ApiErrorRateInsight
- `insightDetails.eventName`: API name where anomaly detected
- `insightDetails.insightContext.requestFrequency.average`: anomaly period average call count
- `insightDetails.insightContext.baselineRequestFrequency.average`: normal period average

## Organization Trail + Lake Integration: Enterprise Audit Architecture

To audit all of AWS Organizations, not single account, use Organization Trail + Organization-enabled EDS.

### Organization Trail Setup

```bash
# Run in management account or delegated CloudTrail admin account
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

Organization Trail traits:
- Created in management account, auto-applies to all member accounts
- Member accounts cannot delete/modify (management account only)
- New account added to Organization → Trail auto-applied
- Trusted Access delegation → Security account can manage

```bash
# Delegate CloudTrail management to security account
aws organizations enable-aws-service-access \
  --service-principal cloudtrail.amazonaws.com

aws cloudtrail register-organization-delegated-admin \
  --member-account-id 999988887777  # Audit account ID
```

### Cross-Account Lake Query

Organization-enabled EDS queries all member account events in single EDS.

```sql
-- Root account usage across entire Organization in last 30 days
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

-- IAM changes per account aggregate (enterprise compliance status)
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

`recipientAccountId` field identifies which account the event came from.

> 📚 **Case Study**: 2023 AWS re:Invent speaker story. Global finance company running 50 AWS accounts. Before: investigated security incident sequentially across 50 Athena accounts = 1 day. After: Organization-enabled CloudTrail Lake → single SQL query investigation = 10 minutes. Average incident investigation time (MTTR) 75% reduction.

## CloudTrail Lake vs Athena: When to Use What

SOA operator's situation-based tool choice:

| Situation | Tool | Why |
|------|------|------|
| Immediate anomaly API query | Lake direct | Zero prep, instant execution |
| Audit data 3+ years old | Lake (3+ year retention set) | Long-term keep + direct query |
| Existing S3 logs analysis | Athena | Lake doesn't have pre-collection data |
| Legacy SIEM integration (Splunk, QRadar) | Trail → S3 → SIEM pull | SIEM pulls S3 directly |
| CloudWatch alarm-based detection | Trail → CW Logs → Metric Filter | CW Alarm + SNS pipeline |
| ML-based anomaly detection | Trail Insights | Use out-of-box, no implementation |
| Real-time event automation | EventBridge (Trail-agnostic) | CloudTrail auto-feeds EventBridge |

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
