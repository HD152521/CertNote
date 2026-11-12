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

## 📝 Practice Questions

**Question 1.** The security team needs to trace "who downloaded customer PII data from a production S3 bucket." What CloudTrail configuration is required?

A) Enabling only Management Events is enough
B) Enable S3 Data Events — track GetObject/PutObject for the specific bucket
C) Enable CloudTrail Insights
D) GuardDuty S3 Protection alone is enough

**Answer: B**
Explanation: Downloading an S3 object (GetObject) is a Data Event. Management Events track only control plane operations such as `PutBucketPolicy` and `CreateBucket`. You must enable Data Events on the target bucket for object-level access to be recorded. Because it incurs cost ($0.10/100K events), it is efficient to enable it selectively only for sensitive buckets.

---

**Question 2.** A company operates 30 AWS accounts. How can it collect API calls from all accounts centrally and automatically include accounts added in the future?

A) Deploy the same Trail configuration to each account with a CloudFormation StackSet
B) Create an Organization Trail in the Organizations management account → store it in the central S3 bucket of the Log Archive Account
C) Forward events to the central account with an EventBridge cross-account rule
D) Consolidate the logs of all accounts with CloudWatch Logs

**Answer: B**
Explanation: An Organization Trail automatically includes all current member accounts in the organization plus accounts added in the future. Member account users can neither see nor modify this Trail. A StackSet deploys only to current accounts, and future accounts need manual deployment. An Organization Trail is exactly the right answer for this requirement.

---

**Question 3.** What is the purpose of CloudTrail Log File Validation?

A) Reduce S3 storage cost
B) A compliance feature that detects whether log files were tampered with using a SHA-256 hash chain
C) Speed up real-time event streaming
D) Enable CloudWatch Logs integration

**Answer: B**
Explanation: Log File Validation generates a digest file every hour and records the SHA-256 hash of each log file. The digest file itself is also signed with an AWS RSA key. With `aws cloudtrail validate-logs`, you can verify the integrity of all log files for a specified period. It is essential for proving log integrity in compliance audits (SOC 2, PCI-DSS, HIPAA).

---

**Question 4.** You want to receive an SNS notification immediately when the Root user logs in to the console. What configuration is needed?

A) CloudWatch Alarm + CloudTrail metric
B) EventBridge Rule (aws.signin source + Root userIdentity pattern) → SNS Target
C) Enable CloudTrail Insights
D) Detect Root login with a Config Rule

**Answer: B**
Explanation: All CloudTrail events are delivered automatically to the EventBridge default bus. If you set a pattern of `source: aws.signin` and `detail.userIdentity.type: Root` in an EventBridge Rule, the Rule triggers immediately on a Root login. Connecting SNS as the target sends email/SMS notifications. CloudTrail Insights detects anomalies in API call volume patterns and is not suitable for real-time response to individual events.

---

**Question 5.** You searched for an event from 6 months ago in the CloudTrail Event History console, and it is not there. Why?

A) The Region filter is set incorrectly
B) Event History retains events free for only 90 days. If no Trail existed, the 6-month-old data is permanently lost
C) That event is a Data Event and needs to be looked up separately
D) Insufficient IAM permissions

**Answer: B**
Explanation: Event History is enabled automatically when the account is created, but it retains only 90 days. If you did not create a Trail and store it in S3, events older than 90 days cannot be looked up. If a Trail existed, you can download the S3 objects directly or query them with Athena or CloudTrail Lake. "Losing events from 6 months ago because no Trail was created" is a situation that frequently occurs during security audits in real operations.

---

**Question 6.** Which option most accurately explains the difference between Management Events and Data Events?

A) Management Events are paid, Data Events are free
B) Management Events are resource lifecycle and configuration changes (Create/Delete/Update); Data Events are access to data inside resources (S3 GetObject, Lambda Invoke, DynamoDB GetItem). Management is ON by default and free; Data is OFF by default and paid
C) Management Events record only console operations, and Data Events record only API calls
D) Neither type is recorded without a Trail

**Answer: B**
Explanation: Management Events are control plane operations such as creating/deleting/modifying/configuring AWS resources. They are on by default and free. Data Events are data plane operations such as S3 object access, Lambda invocations, and DynamoDB item-level access. Because the volume is very large, they are off by default and incur a per-event charge. Management Events can be looked up free for 90 days in Event History and are recorded even without a Trail.
