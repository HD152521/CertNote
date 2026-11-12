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

## 📝 Practice Questions

**Question 1.** A company wants to adopt CloudTrail Lake. What problem arises if it operates both the existing Trail (stored in S3) and Lake, and what are the selection criteria?

A) Lake has lower storage cost than Trail, so the Trail must be shut down
B) Trail collection cost and Lake Ingest cost are charged separately for the same events, causing double billing. Choose one based on the use case, or if both are needed, be aware of the cost
C) When Lake is turned on, the Trail is disabled automatically
D) Lake and Trail collect different events, so there is no duplication

**Answer: B**
Explanation: CloudTrail Lake and a Trail (S3) are completely independent services. If both are enabled, the same events are collected in two places, so Trail cost + Lake Ingest cost are charged twice. Selection criteria: if the main purpose is immediate SQL analysis → Lake; if long-term archive + SIEM integration → Trail+S3; if both are needed, be aware of the cost and run both. Lake is not always cheaper than a Trail (Ingest at $2.50/GB can be more expensive in some cases), and there is no automatic disabling.

---

**Question 2.** CloudTrail Insights failed to detect a "100x spike in RunInstances API call volume." What is the most likely cause?

A) RunInstances is not a target of Insights detection
B) 7 days had not passed since enabling Insights, so the baseline was not established
C) Only ApiErrorRateInsight was enabled, and ApiCallRateInsight was not
D) Insights analyzes only Data Events

**Answer: B or C (both are possible, B is more common)**
Explanation: B - Insights builds a normal baseline only after 7 days have passed since it was enabled. If you turn it on right away for a new Trail, anomaly detection does not work for the first 7 days. C - An increase in RunInstances volume is detected by ApiCallRateInsight. If only ApiErrorRateInsight is on, a spike in API call volume is not detected. D is wrong — Insights analyzes Management Events (RunInstances is a Management Event).

---

**Question 3.** The security team wants to investigate "what a specific IAM user (alice) did in which S3 buckets last month." What is the most appropriate query approach in CloudTrail Lake?

A) Query only with `WHERE userIdentity.userName = 'alice'`
B) Query with `WHERE (userIdentity.arn LIKE '%alice%' OR userIdentity.sessionContext.sessionIssuer.arn LIKE '%alice%') AND eventSource = 's3.amazonaws.com'`
C) CloudTrail does not record S3 events
D) Search only by alice's IAM Access Key ID

**Answer: B**
Explanation: When an IAM user makes a call directly, `userIdentity.arn` contains `:user/alice`. However, if alice assumes a role and then works, `userIdentity.type = 'AssumedRole'`, so you must find alice in `userIdentity.sessionContext.sessionIssuer.arn`. For a complete investigation, combine the two conditions with OR. `userName` exists only for the IAM User type and not for AssumedRole, so it is incomplete.

---

**Question 4.** You want to query CloudTrail events for all 50 accounts in the Organization with a single SQL statement. What configuration is needed?

A) Create an Athena table in each account and combine them with UNION ALL
B) Create an Organization-enabled Event Data Store in the management account or a delegated administrator account
C) If all accounts' Trails are collected into the same S3 bucket, Lake integrates them automatically
D) Cross-account queries are possible with CloudWatch Logs Insights

**Answer: B**
Explanation: If you create an Organization-enabled EDS, events from all accounts in the Organization are collected into a single EDS. You can then distinguish accounts by the `recipientAccountId` field and query everything with a single SQL statement. A is possible with the UNION ALL approach, but the table management burden is large. For C, even if collected into the same S3 bucket, Lake does not integrate automatically. For D, CloudWatch Logs Insights is Log Group-based and has limited native cross-account support.

---

**Question 5.** Is a separate Trail configuration needed to receive CloudTrail events in EventBridge?

A) You must explicitly enable the "EventBridge delivery" option on the Trail
B) No. CloudTrail events are delivered automatically to the EventBridge default bus. You only need to create an EventBridge Rule
C) CloudWatch Logs integration is needed first
D) CloudTrail Lake must be enabled for EventBridge delivery to work

**Answer: B**
Explanation: CloudTrail events are delivered automatically to the EventBridge default event bus regardless of whether a Trail exists. You only need to create a Rule in EventBridge and match a pattern with `source: aws.cloudtrail` and a specific `eventName`. This is the key convenience of the CloudTrail + EventBridge integration. A Trail "stores" events in S3/CW Logs, while EventBridge delivery is a separate "real-time event routing" channel.

---

**Question 6.** An operator ran a CloudTrail Lake query, and the cost was higher than expected. What is the most effective way to reduce cost?

A) Recreate the EDS with a shorter retention period
B) Narrow the `eventTime` range and specify only the needed columns instead of `SELECT *`
C) Switch to Athena
D) Disable Lake and go back to Trail+Athena

**Answer: B**
Explanation: Lake query cost is based on the amount of data scanned (TB). There are two keys to reducing cost. First, narrowing the `eventTime` range reduces the scan range (e.g., 30 days → 7 days). Second, `SELECT *` scans all columns, but in columnar storage, specifying only the needed columns scans only those columns. These two measures can cut query cost by 80 to 90%. The retention period affects storage cost but has no direct effect on query cost.
