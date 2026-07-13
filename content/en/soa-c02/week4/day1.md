# Day 1 - CloudTrail: API Audit Logging Design Principles and Organization Trail

At 4 AM, the security team calls. "Some IAM account made a production S3 bucket public. Can we track who did it?" Whether CloudTrail is on or off, whether the Trail stores in S3 or not, and whether Log File Validation is enabled—these determine whether the incident can be solved. CloudTrail is the audit log of every API call that happens in AWS. From an operator's perspective, understanding the design principles of this service and practical patterns is today's goal.

## Theoretical Foundation of Audit Logging: Non-repudiation and Append-only

The two most important properties of audit logs are **Non-repudiation** and **Tamper-evidence**.

Non-repudiation is a cryptographic term. "I didn't perform that action"—this claim must be technically refutable. Digital signatures provide this property. In CloudTrail, IAM credentials (accessKeyId, sessionToken, userAgent) are included in every event, establishing that "this API was called with these credentials."

Tamper-evidence is the property that log tampering must be detectable. CloudTrail Log File Validation implements this through SHA-256 hash chains.

> 💡 **Related Theory**: Audit logging requirements are explicitly mandated by major compliance frameworks: ISO 27001 A.12.4 (Logging and Monitoring), NIST SP 800-92 (Guide to Computer Security Log Management), SOC 2 CC7.2 (System Operations), and PCI-DSS Requirement 10 (Track and Monitor). "Who did what when"—this is a common requirement for security incident response, legal disputes, and regulatory audits.

## What CloudTrail Records and What It Doesn't

CloudTrail records **AWS API calls**. Console button clicks, CLI commands, SDK calls, service-to-service calls (S3 events triggering Lambda, etc.)—all are internally API calls.

What it records:
- Caller (userIdentity): ARN, accessKeyId, sessionToken, sourceIPAddress
- Time (eventTime): ISO 8601 UTC
- API (eventName): `RunInstances`, `PutObject`, `AttachRolePolicy`, etc.
- Target resources (resources, requestParameters)
- Results (errorCode, errorMessage, or responseElements)
- Region (awsRegion), service (eventSource)

What it does NOT record:
- S3 object **content**—only access fact, not actual data
- CloudWatch Metrics data
- CloudWatch Logs content
- OS-level operations inside EC2 instances

## Event Types: Management, Data, Insights

```
CloudTrail Event Types
├── Management Events (default ON, free)
│   ├── Write: Create, Delete, Update, Put, Attach, Detach
│   └── Read: Describe, List, Get
├── Data Events (default OFF, $0.10/100K)
│   ├── S3: GetObject, PutObject, DeleteObject
│   ├── Lambda: Invoke
│   ├── DynamoDB: GetItem, PutItem, DeleteItem
│   └── Other: CloudTrail Lake, SNS, SQS, Cognito, etc.
└── Insights Events (separate activation, $0.35/100K)
    ├── ApiCallRateInsight: call volume spike
    └── ApiErrorRateInsight: error rate spike
```

**Management Events** are resource lifecycle and configuration changes. `RunInstances` (start EC2), `CreateBucket` (create S3 bucket), `AttachRolePolicy` (grant IAM policy). These events change infrastructure state, so they're enabled by default and free.

**Data Events** are actions accessing data within resources. Downloading a specific object from an S3 bucket (`GetObject`), invoking a Lambda function (`Invoke`), or reading a specific item from DynamoDB (`GetItem`). These events occur in very high volumes (production S3 buckets can have thousands of GetObject calls per second), so they're disabled by default and incur separate costs.

> ⚠️ **Pitfall**: When a requirement says "track S3 object access," Data Events activation is always the answer. Management Events alone track configuration changes like `PutBucketPolicy`, not actual object access (GetObject, PutObject). Exams frequently test this distinction.

> 📚 **Case Study**: 2019 Capital One data breach incident. A former AWS employee exploited an SSRF vulnerability to steal EC2 metadata and accessed 700+ S3 buckets. Post-incident analysis showed that had S3 Data Events been enabled, the `GetObject` calling pattern (abnormally high volume, unusual IAM credential) could have been detected within hours. After this incident, AWS strengthened GuardDuty S3 Data Event monitoring, and activating CloudTrail Data Events became a best practice requirement.

## Trail Structure and Multi-Region Configuration

A Trail defines "which events to collect and where to store them."

```bash
# Create Multi-Region Trail (recommended standard)
aws cloudtrail create-trail \
  --name "org-master-trail" \
  --s3-bucket-name "org-cloudtrail-archive-111122223333" \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation \
  --kms-key-id "arn:aws:kms:ap-northeast-2:111122223333:key/abc-def"

aws cloudtrail start-logging --name "org-master-trail"
```

`--is-multi-region-trail`: Collect events from all regions. New regions automatically included.

`--include-global-service-events`: Include global service events like IAM, STS, CloudFront. Without this, critical security events like IAM user creation and STS AssumeRole are missed.

`--enable-log-file-validation`: Generate SHA-256 digest files. Tamper detection becomes possible.

`--kms-key-id`: SSE-KMS encryption. Default is SSE-S3. Specify CMK if compliance requires it.

## S3 Storage Structure and Log File Validation

CloudTrail logs are stored as JSON.gz files in S3 every 5 minutes. Path structure:

```
s3://org-cloudtrail-archive-111122223333/
  AWSLogs/
    111122223333/                  ← Account ID
      CloudTrail/
        ap-northeast-2/
          2026/05/26/
            111122223333_CloudTrail_ap-northeast-2_20260526T1200Z_AbCdEfGh.json.gz
      CloudTrail-Digest/           ← Log File Validation digest
        ap-northeast-2/
          2026/05/26/
            111122223333_CloudTrail-Digest_ap-northeast-2_...json
```

Digest files are generated hourly. They contain SHA-256 hash values of all log files for that hour, and also include the hash of the previous digest file, forming a **hash chain**. If a log file is deleted or modified, `aws cloudtrail validate-logs` detects it.

```bash
# Validate log integrity for a specific period
aws cloudtrail validate-logs \
  --trail-arn "arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-master-trail" \
  --start-time "2026-05-01T00:00:00Z" \
  --end-time "2026-05-26T23:59:59Z"
# Output: "Results requested for 2026-05-01T00:00:00Z to 2026-05-26T23:59:59Z
#        Digest files: 600, valid: 600, INVALID: 0
#        Log files: 7200, valid: 7200, INVALID: 0"
```

If tampering occurred, the "INVALID" count increases and identifies problematic files.

> 🔍 **Deeper Dive**: Log File Validation uses SHA-256 hash algorithm, and digest files themselves are signed with CloudTrail service's RSA private key. During validation, AWS's public key verifies the signature. This structure ensures that even AWS employees tampering with digest files would be detected by signature mismatch. However, if the S3 bucket containing digest files is deleted, validation is impossible. That's why S3 Object Lock (WORM: Write Once Read Many) and MFA Delete are used together as the standard.

## Organization Trail: Multi-Account Audit Standard

In AWS Organizations environments, creating Trails per account increases management burden and costs. Organization Trail—created once in the Management Account—automatically collects events from **all member accounts**. Not only current accounts but also **future accounts added to the organization are automatically included**.

```bash
# Create Organization Trail in management account
aws cloudtrail create-trail \
  --name "organization-trail" \
  --s3-bucket-name "log-archive-cloudtrail" \
  --is-organization-trail \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation

aws cloudtrail start-logging --name "organization-trail"
```

Member account characteristics:
- Member account users **cannot view or modify** Organization Trail (management account only)
- Member account events stored in Log Archive Account's central S3 bucket
- Path: `AWSLogs/{org-id}/{member-account-id}/CloudTrail/...`

```
[Management Account] Create Organization Trail
       │
       ▼ (automatic collection)
[Member Account A] [Member Account B] [Member Account C] ...future accounts...
       │           │           │
       └───────────┴───────────┘
                   │
                   ▼
         [Log Archive Account]
          Central S3 bucket
          - Object Lock (WORM)
          - SSE-KMS
          - Log File Validation
```

> 💡 **Related Theory**: Centralized log archiving is a core design pattern of AWS Landing Zone (currently Control Tower). The reason for separate Log Archive Account is "prevent attackers who compromise a workload account from deleting logs." Even if an attacker compromises Account A, without permissions to Log Archive Account's S3 bucket, logs cannot be deleted. This is the security value of account separation.

## EventBridge Integration: Real-time Security Response

CloudTrail events are automatically sent to the EventBridge default bus. No separate activation needed—just create a Rule.

Most common security Rule patterns:

```json
// Root user console login
{
  "source": ["aws.signin"],
  "detail-type": ["AWS Console Sign In via CloudTrail"],
  "detail": { "userIdentity": { "type": ["Root"] } }
}

// IAM policy changes (privilege escalation risk)
{
  "source": ["aws.iam"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": [
      "AttachRolePolicy", "PutRolePolicy", "CreatePolicy",
      "CreateAccessKey", "UpdateAccessKey", "DeletePolicy"
    ]
  }
}

// Add full-allow rule to security group
{
  "source": ["aws.ec2"],
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventName": ["AuthorizeSecurityGroupIngress"],
    "requestParameters": {
      "ipPermissions": {
        "items": {
          "ipRanges": { "items": { "cidrIp": ["0.0.0.0/0"] } }
        }
      }
    }
  }
}
```

Connect these Rules to SNS, Lambda, or SSM Automation as targets for detection → response automation.

> 📚 **Case Study**: 2021 incident at a Korean startup (anonymous). An intern developer accidentally added `0.0.0.0/0:3306` (MySQL full allow) rule to RDS security group. An EventBridge Rule detected `AuthorizeSecurityGroupIngress`, and an SSM Automation Runbook removed the offending rule within 2 minutes. The intern learned of his mistake the next day via Slack notification. This is CloudTrail + EventBridge's "detect and auto-remediate" pattern in action.

## S3 Data Events Activation: Cost Optimization Patterns

Enabling Data Events for all S3 buckets causes costs to explode. Selective activation patterns are critical.

```bash
# Enable Data Events for sensitive buckets only
aws cloudtrail put-event-selectors \
  --trail-name "org-master-trail" \
  --event-selectors '[
    {
      "ReadWriteType": "All",
      "IncludeManagementEvents": true,
      "DataResources": [
        {
          "Type": "AWS::S3::Object",
          "Values": [
            "arn:aws:s3:::financial-data-bucket/",
            "arn:aws:s3:::pii-data-bucket/",
            "arn:aws:s3:::audit-logs-bucket/"
          ]
        },
        {
          "Type": "AWS::Lambda::Function",
          "Values": ["arn:aws:lambda"]
        }
      ]
    }
  ]'
```

Specifying just the service ARN like `"arn:aws:lambda"` tracks all Lambda function invocations in that region. For S3, select per-bucket to track only buckets with PII or financial data, controlling costs.

## CloudTrail and CloudWatch Integration: Metric Filter Alarms

Connecting CloudTrail to CloudWatch Logs enables creating alarms based on log patterns.

```bash
# Connect Trail to CloudWatch Logs
aws cloudtrail update-trail \
  --name "org-master-trail" \
  --cloud-watch-logs-log-group-arn \
    "arn:aws:logs:ap-northeast-2:111122223333:log-group:CloudTrail/org:*" \
  --cloud-watch-logs-role-arn \
    "arn:aws:iam::111122223333:role/CloudTrail_CWLogs_Role"

# Metric Filter for IAM policy changes
aws logs put-metric-filter \
  --log-group-name "CloudTrail/org" \
  --filter-name "IAMPolicyChanges" \
  --filter-pattern '{ ($.eventName = AttachRolePolicy) ||
                      ($.eventName = PutRolePolicy) ||
                      ($.eventName = CreateAccessKey) ||
                      ($.eventName = DeletePolicy) }' \
  --metric-transformations \
    metricName=IAMPolicyChanges,metricNamespace=Security,metricValue=1

# Create alarm on that metric
aws cloudwatch put-metric-alarm \
  --alarm-name "IAM-Policy-Changes" \
  --metric-name "IAMPolicyChanges" \
  --namespace "Security" \
  --period 300 \
  --evaluation-periods 1 \
  --datapoints-to-alarm 1 \
  --statistic Sum \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --alarm-actions "arn:aws:sns:ap-northeast-2:111122223333:security-alerts"
```

## Comparison with Other Platforms

| Item | CloudTrail | GCP Cloud Audit Logs | Azure Activity Log |
|------|-----------|---------------------|-------------------|
| Default retention | 90 days (Event History) | 400 days | 90 days |
| Long-term storage | Trail → S3 | Log Router → Cloud Storage | Diagnostic Setting → Storage |
| Org integration | Organization Trail | Org audit logs auto-aggregated | Tenant-level Activity Log |
| Integrity validation | Log File Validation (SHA-256) | CMEK + separate validation tool | Immutable Storage policy |
| ML-based anomaly detection | CloudTrail Insights | Cloud Security Command Center | Microsoft Sentinel |
| SQL analysis | CloudTrail Lake | BigQuery Export | Log Analytics Workspace |

GCP's Admin Activity Logs are enabled by default, free, and retained for 400 days—different from CloudTrail's 90 days. Azure's subscription-level Activity Log has 90 days free retention.

## Wrapping Up

CloudTrail is not just for post-incident analysis. Integrated with EventBridge, it enables "real-time detection and response." Integrated with CloudWatch Logs, it becomes "pattern-based alarms." Consolidated with Organization Trail, "enterprise-wide auditing" is automated. Understanding these three roles and determining when which event type (Management vs Data vs Insights) is needed is the exam's core point.

---

## 📝 연습 문제

**문제 1.** 보안팀이 "누가 프로덕션 S3 버킷에서 고객 PII 데이터를 다운로드했는지" 추적해야 한다. 필요한 CloudTrail 설정은?

A) Management Events만 활성화하면 충분하다
B) S3 Data Events 활성화 — 특정 버킷의 GetObject/PutObject 추적
C) CloudTrail Insights 활성화
D) GuardDuty S3 Protection만으로 충분하다

**정답: B**
해설: S3 객체 다운로드(GetObject)는 Data Event다. Management Events는 `PutBucketPolicy`, `CreateBucket` 같은 컨트롤 플레인 작업만 추적한다. Data Events를 대상 버킷에 활성화해야 객체 레벨 접근이 기록된다. 비용($0.10/100K events)이 발생하므로 민감 버킷만 선택적으로 활성화하는 것이 효율적이다.

---

**문제 2.** 회사가 30개 AWS 계정을 운영한다. 모든 계정의 API 호출을 중앙에서 수집하고, 미래에 추가되는 계정도 자동으로 포함하려면?

A) 각 계정에 동일한 Trail 설정을 CloudFormation StackSet으로 배포
B) Organizations 관리 계정에서 Organization Trail 생성 → Log Archive Account의 중앙 S3로 저장
C) EventBridge cross-account 규칙으로 이벤트를 중앙 계정으로 전달
D) CloudWatch Logs로 모든 계정의 로그를 통합

**정답: B**
해설: Organization Trail은 현재 조직 내 모든 멤버 계정 + 미래에 추가되는 계정을 자동으로 포함한다. 멤버 계정 사용자는 이 Trail을 볼 수도, 수정할 수도 없다. StackSet은 현재 계정에만 배포되고 미래 계정에는 수동 배포가 필요하다. Organization Trail이 이 요구사항에 정확히 맞는 답이다.

---

**문제 3.** CloudTrail Log File Validation의 목적은?

A) S3 저장 비용 절감
B) 로그 파일이 변조됐는지 SHA-256 해시 체인으로 감지하는 컴플라이언스 기능
C) 실시간 이벤트 스트리밍 속도 향상
D) CloudWatch Logs 통합 활성화

**정답: B**
해설: Log File Validation은 1시간마다 다이제스트 파일을 생성하고, 각 로그 파일의 SHA-256 해시를 기록한다. 다이제스트 파일 자체도 AWS의 RSA 키로 서명된다. `aws cloudtrail validate-logs`로 지정 기간의 모든 로그 파일 무결성을 검증할 수 있다. 컴플라이언스 감사(SOC 2, PCI-DSS, HIPAA)에서 로그 무결성 입증에 필수다.

---

**문제 4.** Root 사용자가 콘솔에 로그인하면 즉시 SNS 알림을 받으려 한다. 어떤 구성이 필요한가?

A) CloudWatch Alarm + CloudTrail 메트릭
B) EventBridge Rule(aws.signin source + Root userIdentity 패턴) → SNS Target
C) CloudTrail Insights 활성화
D) Config Rule로 Root 로그인 탐지

**정답: B**
해설: CloudTrail의 모든 이벤트는 EventBridge default bus로 자동 전달된다. EventBridge Rule에서 `source: aws.signin`, `detail.userIdentity.type: Root` 패턴을 설정하면 Root 로그인 시 즉시 Rule이 트리거된다. SNS를 타겟으로 연결하면 이메일/SMS 알림이 전송된다. CloudTrail Insights는 API 호출량 패턴 이상을 감지하는 것으로 개별 이벤트 실시간 대응에 적합하지 않다.

---

**문제 5.** CloudTrail Event History 콘솔에서 6개월 전 이벤트를 검색했는데 없다. 이유는?

A) 리전 필터가 잘못 설정됐다
B) Event History는 90일까지만 무료 보관한다. 6개월 데이터는 Trail이 없었다면 영구 소실됐다
C) 해당 이벤트는 Data Event라 별도 조회가 필요하다
D) IAM 권한이 부족하다

**정답: B**
해설: Event History는 계정 생성 시 자동으로 활성화되지만 90일만 보관한다. Trail을 만들어 S3에 저장하지 않았다면 90일 이후 이벤트는 조회 불가다. Trail이 있었다면 S3 객체를 직접 다운로드하거나 Athena, CloudTrail Lake로 쿼리하면 된다. "Trail을 만들지 않아 6개월 전 이벤트를 잃어버린 경우"는 실제 운영에서 보안 감사 시 자주 발생하는 상황이다.

---

**문제 6.** Management Events와 Data Events의 차이를 가장 정확히 설명한 것은?

A) Management Events는 유료, Data Events는 무료다
B) Management Events는 리소스 생명주기 및 설정 변경(Create/Delete/Update), Data Events는 리소스 내부 데이터 접근(S3 GetObject, Lambda Invoke, DynamoDB GetItem)이다. Management는 기본 ON 무료, Data는 기본 OFF 유료
C) Management Events는 콘솔 작업만, Data Events는 API 호출만 기록한다
D) 두 종류 모두 Trail 없이는 기록되지 않는다

**정답: B**
해설: Management Events는 AWS 리소스의 생성/삭제/수정/설정 같은 컨트롤 플레인 작업이다. 기본으로 켜져 있고 무료다. Data Events는 S3 객체 접근, Lambda 호출, DynamoDB Item 수준 접근처럼 데이터 플레인 작업이다. 양이 매우 많아 기본으로 꺼져 있고 건당 비용이 발생한다. Management Events는 Event History에서 90일 무료 조회 가능하고, Trail 없이도 기록된다.
