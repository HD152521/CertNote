# Day 1 - CloudTrail: Design Principles of API Audit Logs and the Organization Trail

At 4 AM, the phone rings from the security team. "Some IAM account made the production S3 bucket public. Can you trace who did it?" At this moment, whether CloudTrail is on, whether the Trail is stored in S3, and whether Log File Validation is enabled decide whether the incident gets resolved. CloudTrail is the audit log of every API call that happens in AWS. Today's goal is to understand this service's design principles and practical patterns from the operator's point of view.

## The Theoretical Background of Audit Logging: Non-repudiation and Append-only

The two most important properties of an audit log are **Non-repudiation** and **Tamper-evidence**.

Non-repudiation is a cryptography term. You must be able to technically refute the claim "I did not do that action." Digital signatures provide this property. In CloudTrail, IAM credentials (accessKeyId, sessionToken, userAgent) are included in every event, proving the fact that "this API was called with this credential."

Tamper-evidence is the property that you must be able to detect that a log has been tampered with. CloudTrail Log File Validation implements this with a SHA-256 hash chain.

> 💡 **Related theory**: Audit logging requirements are explicitly demanded by all major compliance frameworks, including ISO 27001 A.12.4 (Logging and Monitoring), NIST SP 800-92 (Guide to Computer Security Log Management), SOC 2 CC7.2 (System Operations), and PCI-DSS Requirement 10 (Track and Monitor). "Who did what and when" is a common requirement of security incident response, legal disputes, and regulatory audits.

## What CloudTrail Records and What It Does Not

CloudTrail records **AWS API calls**. Button clicks in the console, CLI command execution, SDK calls, and calls between AWS services (such as an S3 event triggering a Lambda) are all API calls internally.

What it records:
- Caller (userIdentity): ARN, accessKeyId, sessionToken, sourceIPAddress
- Time (eventTime): ISO 8601 UTC
- API (eventName): `RunInstances`, `PutObject`, `AttachRolePolicy`, etc.
- Target resource (resources, requestParameters)
- Result (errorCode, errorMessage or responseElements)
- Region (awsRegion), service (eventSource)

What it does not record:
- The **contents** of S3 objects — only the fact of access is recorded, not the actual data
- CloudWatch Metrics data
- CloudWatch Logs contents
- OS-level operations that happen inside an EC2 instance

## Event Types: Management, Data, Insights

```
CloudTrail event types
├── Management Events (ON by default, free)
│   ├── Write: Create, Delete, Update, Put, Attach, Detach
│   └── Read: Describe, List, Get
├── Data Events (OFF by default, paid: $0.10/100K)
│   ├── S3: GetObject, PutObject, DeleteObject
│   ├── Lambda: Invoke
│   ├── DynamoDB: GetItem, PutItem, DeleteItem
│   └── Others: CloudTrail Lake, SNS, SQS, Cognito, etc.
└── Insights Events (enabled separately, paid: $0.35/100K)
    ├── ApiCallRateInsight: call volume spike
    └── ApiErrorRateInsight: error rate spike
```

**Management Events** are the lifecycle and configuration changes of resources. `RunInstances` (launching EC2), `CreateBucket` (creating an S3 bucket), `AttachRolePolicy` (granting an IAM policy). These events are actions that change infrastructure state, so they are on by default and free.

**Data Events** are actions that access the data inside a resource. Downloading a specific object from an S3 bucket (`GetObject`), invoking a Lambda function (`Invoke`), reading a specific item from DynamoDB (`GetItem`). These events are very high in volume (a production S3 bucket can see thousands of GetObject calls per second), so they are off by default and incur a separate cost.

> ⚠️ **Trap**: When a requirement says "track S3 object access," enabling Data Events is always the answer. With Management Events alone, only configuration changes such as `PutBucketPolicy` (bucket policy change) are tracked, and actual object access (GetObject, PutObject) is not. A question testing this distinction can appear on the exam.

The 2019 Capital One data breach. A former AWS employee used an SSRF vulnerability to steal temporary IAM credentials from the EC2 metadata and downloaded a large amount of data from S3 buckets. If S3 Data Events are turned on, such `GetObject` call patterns (abnormally large volume, IAM credentials different from usual) are left as records and can be used as grounds for detection. In 2020, an S3 protection feature that analyzes S3 data events was added to GuardDuty.

## Trail Structure and Multi-Region Configuration

A Trail is a configuration that defines "which events to store where."

```bash
# Create a Multi-Region Trail (recommended standard)
aws cloudtrail create-trail \
  --name "org-master-trail" \
  --s3-bucket-name "org-cloudtrail-archive-111122223333" \
  --is-multi-region-trail \
  --include-global-service-events \
  --enable-log-file-validation \
  --kms-key-id "arn:aws:kms:ap-northeast-2:111122223333:key/abc-def"

aws cloudtrail start-logging --name "org-master-trail"
```

`--is-multi-region-trail`: Collects events from all Regions. New Regions are included automatically.

`--include-global-service-events`: Includes events from global services such as IAM, STS, and CloudFront. Without this, key security events such as IAM user creation and STS AssumeRole are missed.

`--enable-log-file-validation`: Generates SHA-256 hash digest files. Enables tamper detection.

`--kms-key-id`: SSE-KMS encryption. The default is SSE-S3. If there is a compliance requirement, specify a KMS key.

## S3 Storage Structure and Log File Validation

CloudTrail logs are stored in S3 as JSON.gz files every 5 minutes. Path structure:

```
s3://org-cloudtrail-archive-111122223333/
  AWSLogs/
    111122223333/                  ← Account ID
      CloudTrail/
        ap-northeast-2/
          2026/05/26/
            111122223333_CloudTrail_ap-northeast-2_20260526T1200Z_AbCdEfGh.json.gz
      CloudTrail-Digest/           ← Log File Validation digests
        ap-northeast-2/
          2026/05/26/
            111122223333_CloudTrail-Digest_ap-northeast-2_...json
```

Digest files are generated every hour. A digest contains the SHA-256 hash values of all log files in that time slot and also includes the hash of the previous digest file, forming a **hash chain**. If a log file in the middle is deleted or modified, `aws cloudtrail validate-logs` detects it.

```bash
# Verify log integrity for a specific period
aws cloudtrail validate-logs \
  --trail-arn "arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-master-trail" \
  --start-time "2026-05-01T00:00:00Z" \
  --end-time "2026-05-26T23:59:59Z"
# Output: "Results requested for 2026-05-01T00:00:00Z to 2026-05-26T23:59:59Z
#        Digest files: 600, valid: 600, INVALID: 0
#        Log files: 7200, valid: 7200, INVALID: 0"
```

If there is tampering, the "INVALID" count goes up and you can tell which file is the problem.

The hash algorithm of Log File Validation is SHA-256, and the digest file itself is signed with the CloudTrail service's RSA private key. During verification, the signature is checked with AWS's public key. Thanks to this structure, even an AWS employee who manipulates a digest file would be detected by a signature mismatch. However, if the S3 bucket holding the digest files is itself deleted, verification is impossible. That is why using S3 Object Lock (WORM: Write Once Read Many) and MFA Delete together is the standard.

## Organization Trail: The Standard for Multi-Account Auditing

In an environment using AWS Organizations, creating a Trail in each account increases management burden and cost. An Organization Trail, created once in the management account (Management Account), **automatically collects events from every member account** in the organization. Not only current accounts but also **accounts added in the future are automatically included**.

```bash
# Create an Organization Trail in the management account
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
- Member account users **cannot see or modify** the Organization Trail (only the management account can)
- Member account events are stored in the central S3 bucket of the Log Archive Account
- Path: `AWSLogs/{org-id}/{member-account-id}/CloudTrail/...`

![Structure in which the management account's Organization Trail gathers member account logs and sends them to a central archive account](/diagrams/en/org-trail-central.svg)

A centralized log archive is a core design pattern of AWS Landing Zone (now Control Tower). The reason for having a separate Log Archive Account is "to prevent an attacker from deleting logs from a compromised workload account." Even if an attacker compromises account A, they cannot erase the logs without permissions on the Log Archive Account's S3 bucket. This is the security value of account separation.

## EventBridge Integration: Real-Time Security Response

All CloudTrail events are automatically sent to the EventBridge default bus. You only need to create a Rule, with no separate enabling.

The most commonly used security Rule patterns:

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

// Adding an allow-all rule to a security group
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

If you connect SNS, Lambda, or SSM Automation as targets of these Rules, detection → response is automated.

As a hypothetical case, at a Korean startup (anonymous) in 2021, an intern developer accidentally added a `0.0.0.0/0:3306` (MySQL allow-all) rule to an RDS security group. An EventBridge Rule detected `AuthorizeSecurityGroupIngress`, and an SSM Automation Runbook automatically removed that rule within 2 minutes. The intern learned of the mistake the next day through a Slack alert. It is a case where CloudTrail + EventBridge's "detect and auto-remediate" pattern worked.

## Enabling S3 Data Events: A Cost Optimization Pattern

Turning on Data Events for every S3 bucket makes cost explode. The selective enabling pattern is important.

```bash
# Enable Data Events only for specific sensitive buckets
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

If you specify only the service ARN like `"arn:aws:lambda"`, it tracks every Lambda function invocation in that Region. For S3, you can control cost by selecting per bucket and tracking only the buckets that hold PII and financial data.

## CloudTrail and CloudWatch Integration: Metric Filter Alarms

If you integrate CloudTrail with CloudWatch Logs, you can create alarms from log patterns.

```bash
# Integrate the Trail with CloudWatch Logs
aws cloudtrail update-trail \
  --name "org-master-trail" \
  --cloud-watch-logs-log-group-arn \
    "arn:aws:logs:ap-northeast-2:111122223333:log-group:CloudTrail/org:*" \
  --cloud-watch-logs-role-arn \
    "arn:aws:iam::111122223333:role/CloudTrail_CWLogs_Role"

# Metric Filter for the IAM policy change alarm
aws logs put-metric-filter \
  --log-group-name "CloudTrail/org" \
  --filter-name "IAMPolicyChanges" \
  --filter-pattern '{ ($.eventName = AttachRolePolicy) ||
                      ($.eventName = PutRolePolicy) ||
                      ($.eventName = CreateAccessKey) ||
                      ($.eventName = DeletePolicy) }' \
  --metric-transformations \
    metricName=IAMPolicyChanges,metricNamespace=Security,metricValue=1

# Create an alarm on that metric
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
| Long-term retention | Trail → S3 | Log Router → Cloud Storage | Diagnostic Setting → Storage |
| Organization integration | Organization Trail | Organization audit logs aggregated automatically | Tenant-level Activity Log |
| Integrity verification | Log File Validation (SHA-256) | CMEK + separate verification tools | Immutable Storage policy |
| ML-based anomaly detection | CloudTrail Insights | Cloud Security Command Center | Microsoft Sentinel |
| SQL analysis | CloudTrail Lake | BigQuery Export | Log Analytics Workspace |

GCP differs from CloudTrail's 90 days in that Admin Activity logs are on by default, free, and retained for 400 days. In Azure, the subscription-level Activity Log is retained free for 90 days.

## Summary

CloudTrail is not a tool only for "post-incident analysis." Integrated with EventBridge, "real-time detection and response" becomes possible, and integrated with CloudWatch Logs, it becomes "pattern-based alarms." Unifying multiple accounts with an Organization Trail automates "company-wide auditing." Understanding these three roles and judging which event type (Management vs Data vs Insights) is needed when is the core of the exam.

---

## 📝 Practice Questions

**Question 1.** The security team needs to trace "who downloaded customer PII data from the production S3 bucket." What CloudTrail setting is needed?

A) Enabling only Management Events is enough
B) Enable S3 Data Events — track GetObject/PutObject on specific buckets
C) Enable CloudTrail Insights
D) GuardDuty S3 Protection alone is enough

**Answer: B**
Explanation: An S3 object download (GetObject) is a Data Event. Management Events track only control plane operations such as `PutBucketPolicy` and `CreateBucket`. Data Events must be enabled on the target bucket for object-level access to be recorded. Since it incurs cost ($0.10/100K events), it is efficient to enable it selectively only for sensitive buckets.

---

**Question 2.** A company operates 30 AWS accounts. How do you collect API calls from all accounts centrally and also automatically include accounts added in the future?

A) Deploy the same Trail configuration to each account with a CloudFormation StackSet
B) Create an Organization Trail in the Organizations management account → store it in the central S3 of the Log Archive Account
C) Forward events to the central account with EventBridge cross-account rules
D) Consolidate the logs of all accounts with CloudWatch Logs

**Answer: B**
Explanation: An Organization Trail automatically includes all current member accounts in the organization + accounts added in the future. Member account users can neither see nor modify this Trail. A StackSet deploys only to current accounts and requires manual deployment to future accounts. The Organization Trail is exactly the answer for this requirement.

---

**Question 3.** What is the purpose of CloudTrail Log File Validation?

A) Reducing S3 storage cost
B) A compliance feature that detects whether log files have been tampered with, using a SHA-256 hash chain
C) Increasing real-time event streaming speed
D) Enabling CloudWatch Logs integration

**Answer: B**
Explanation: Log File Validation generates a digest file every hour and records the SHA-256 hash of each log file. The digest file itself is also signed with AWS's RSA key. With `aws cloudtrail validate-logs`, you can verify the integrity of all log files in a specified period. It is essential for proving log integrity in compliance audits (SOC 2, PCI-DSS, HIPAA).

---

**Question 4.** You want to receive an SNS notification immediately when the Root user logs in to the console. What configuration is needed?

A) CloudWatch Alarm + CloudTrail metric
B) EventBridge Rule (aws.signin source + Root userIdentity pattern) → SNS Target
C) Enable CloudTrail Insights
D) Detect Root login with a Config Rule

**Answer: B**
Explanation: All CloudTrail events are automatically delivered to the EventBridge default bus. If you set the pattern `source: aws.signin`, `detail.userIdentity.type: Root` in an EventBridge Rule, the Rule triggers immediately on a Root login. Connecting SNS as the target sends email/SMS notifications. CloudTrail Insights detects anomalies in API call volume patterns and is not suited to real-time response to individual events.

---

**Question 5.** You searched for an event from 6 months ago in the CloudTrail Event History console and it is not there. Why?

A) The Region filter is set incorrectly
B) Event History keeps events free for only up to 90 days. Data from 6 months ago is permanently lost if there was no Trail
C) That event is a Data Event and needs a separate lookup
D) IAM permissions are insufficient

**Answer: B**
Explanation: Event History is enabled automatically when an account is created, but it keeps only 90 days. If you did not create a Trail and store events in S3, events older than 90 days cannot be looked up. If a Trail existed, you can download the S3 objects directly or query them with Athena or CloudTrail Lake. "Losing events from 6 months ago because no Trail was created" is a situation that often occurs in real operations during security audits.

---

**Question 6.** Which most accurately describes the difference between Management Events and Data Events?

A) Management Events are paid, Data Events are free
B) Management Events are resource lifecycle and configuration changes (Create/Delete/Update), and Data Events are access to data inside resources (S3 GetObject, Lambda Invoke, DynamoDB GetItem). Management is ON by default and free, Data is OFF by default and paid
C) Management Events record only console actions, and Data Events record only API calls
D) Neither type is recorded without a Trail

**Answer: B**
Explanation: Management Events are control plane operations such as creating/deleting/modifying/configuring AWS resources. They are on by default and free. Data Events are data plane operations such as S3 object access, Lambda invocations, and DynamoDB item-level access. They are very high in volume, so they are off by default and incur a per-event cost. Management Events can be looked up free for 90 days in Event History and are recorded even without a Trail.
