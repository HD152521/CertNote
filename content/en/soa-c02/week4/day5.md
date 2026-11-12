# Day 5 - Week 4 Comprehensive Review: CloudTrail, Config, Audit Stack Integration

Week 4's tools answer different questions than CloudWatch. CloudWatch shows "what's happening now in real-time," but this week's tools answer "historically who did what, is current state compliant, how do we present evidence to external auditors"—retrospective, normative questions. Post-incident response and compliance require both real-time detection and post-incident tracking with evidence systems. Today we review how CloudTrail, CloudTrail Lake, AWS Config, and Audit Manager form layers, then finish with 10 high-frequency exam scenarios.

## Week 4 Core Concept Connection Map

```
[AWS API Call Occurs]
        │
        ▼
[CloudTrail]  →  Event History (90d free, unchangeable)
        │                │
        │                ▼
        │         [S3 Trail]  →  Log File Validation (SHA-256 hash chain)
        │                │              → Athena query analysis
        │                │              → SIEM integration (Splunk, Sumo Logic)
        │                ▼
        │       [CloudTrail Lake]  →  SQL query (Event Data Store)
        │                │              → 7-year retention / Organization integration
        │                │              → External event collection
        │                ▼
        │       [Insights Events]  →  ML: ApiCallRateInsight / ApiErrorRateInsight
        │                              → 7-day baseline learning needed
        │
        ▼
[EventBridge default bus]  →  Rule pattern match → SNS / Lambda / SSM
        (all API calls auto-sent)
        │
        ▼
[AWS Config]  →  Configuration Item (resource state snapshot)
        │              → Resource Timeline (change history visualization)
        │
        ▼
  [Config Rules]  →  Evaluation trigger (Configuration change | Periodic)
        │              → NON_COMPLIANT detection
        │              → SNS alert
        ▼
[Auto Remediation]  →  SSM Automation Runbook auto-execution
        │
        ▼
[Conformance Pack]  →  Multiple Rules bundle (HIPAA/PCI/NIST based)
        │              → Organization-wide deployment
        ▼
[AWS Audit Manager]  →  Framework → Control → Data Source → Assessment
                         → Automated evidence collection (Config/CloudTrail/Security Hub)
                         → PDF/CSV report generation
```

> 💡 **Related Theory**: This stack implements security engineering's **Defense in Depth** principle and **Audit Trail** theory. NIST SP 800-92 "Guide to Computer Security Log Management" states "accountability requires always reconstructable 'who did what when.'" CloudTrail provides raw accountability data, Log File Validation ensures tamper-evidence, Config tracks state, Audit Manager handles compliance reporting—layered responsibility structure.

## Core Comparison Charts

**CloudTrail vs AWS Config**

| Item | CloudTrail | AWS Config |
|------|-----------|------------|
| Tracking target | API calls (action) | Resource configuration (state) |
| Question | "Who did what" | "What state is it in now" |
| Data unit | Event (JSON) | Configuration Item |
| Storage | Default 90d (History), Trail permanent via S3 | S3 permanent storage |
| Cost | Management free, Data $0.10/100K | $0.003/CI + $0.001/1000 Rules |
| Alert integration | EventBridge pattern match → SNS/Lambda | Rule eval → SNS or Auto Remediation |
| Tamper detection | Log File Validation (SHA-256) | No tamper detection |

**CloudTrail Lake vs S3 Trail + Athena**

| Item | CloudTrail Lake | S3 + Athena |
|------|-----------------|-------------|
| Analysis | Console direct SQL (EDS ID) | Athena table + partition setup |
| Max retention | 7 years (2555d) | Unlimited (S3 lifecycle) |
| Query cost | Per TB $5 | Per TB $5 (same) |
| External events | Possible (other clouds, on-prem) | Not possible |
| Multi-account | Organization-enabled EDS | Organization Trail + S3 |
| Operational burden | Low (AWS-managed) | High (ETL, partitions, schema) |
| Dual-use cost | Caution: Trail + Lake = dual billing | Single billing with Trail only |

> 💡 **Related Theory**: Lake's columnar storage is OLAP (Online Analytical Processing) standard. Row-based (OLTP) optimizes reading all columns of specific rows fast; columnar optimizes analytical queries scanning specific columns only. Apache Parquet, BigQuery, Redshift use same. Audit queries mostly "find all rows with eventName = X"—columnar orientation advantages Lake.

**Config Rule Trigger Comparison**

| Trigger Type | Fire Point | Suitable Rule Examples |
|------------|---------|----------------|
| Configuration change | Immediately on resource setting change | `s3-bucket-public-read-prohibited`, `ec2-imdsv2-check` |
| Periodic (1h/3h/6h/12h/24h) | Every configured interval, all resources | `iam-password-policy`, user-list-based Rules |
| Hybrid (both) | On change + periodically | Critical Rule catching both drift + change |

> 🔍 **Deeper Dive**: Config change trigger consumes CloudTrail events, detects resource change, generates CI, then fires Rule. If CloudTrail fails, Config change trigger delays. Periodic trigger has no this dependency—internal Config scheduler. External-system-state Rules (Credential report, IAM user list) need periodic since no "configuration change" event exists.

**Audit Manager vs Config vs Trusted Advisor**

| Item | AWS Config | AWS Audit Manager | AWS Trusted Advisor |
|------|-----------|-------------------|---------------------|
| Primary role | Evaluate state, detect violations | Collect compliance evidence, report | AWS best practice recommendations |
| Output | Rule results, NON_COMPLIANT list | PDF/CSV audit report, Control evidence | Check results, recommendations |
| Framework concept | Conformance Pack (similar) | Core (HIPAA, PCI-DSS, SOC 2 etc.) | None |
| Auditor support | None | Invite auditor account, review workflow | None |
| Auto-remediation | Auto Remediation yes | No (report only) | No |
| Billing | CI + Rule separate | Per Assessment | Business/Enterprise Support included |

> 💡 **Related Theory**: "Continuous Compliance" (NIST SP 800-137) shifts from snapshot audit (annual check) to continuous evidence collection. PCI-DSS v4.0 (2022) explicitly recommends continuous monitoring. Audit Manager's continuous Assessment exactly implements this requirement.

## Organization Trail Internal Operation and Governance Patterns

When Organization Trail activates, all member account events flow to management account S3. Member account users can't modify/delete this Trail. This lock mechanism is core security governance.

```
[Management Account]
  └─ Organization Trail created
       ├─ S3 bucket: s3://org-audit-logs/
       │    └─ Prefix: AWSLogs/{org-id}/{account-id}/
       └─ Auto-applied to all member accounts
            ├─ Account A: Trail READ-ONLY (no delete/modify)
            ├─ Account B: Trail READ-ONLY
            └─ Account C: Trail READ-ONLY (auto-applied on new join)
```

> 📚 **Case Study**: 2021 Korean SI company B (public case). Member account admin accidentally deleted Trail—2 weeks log gap. External security audit discovered this gap, required manual supplementary documentation. Afterward: enabled Organization Trail + SCP denying `cloudtrail:DeleteTrail`, `cloudtrail:StopLogging` to member accounts. Organization Trail + additional SCP double-block is standard governance.

## CloudTrail Insights: ML-Based Anomaly Detection Limits and Appropriate Use Cases

Insights learns 7 days past data as baseline, detects statistically significant current deviation from baseline, generates Insight event. Two types exist.

- **ApiCallRateInsight**: Specific API call rate spikes vs. baseline
- **ApiErrorRateInsight**: Specific API error rate spikes vs. baseline

> ⚠️ **Pitfall**: Insights needs **7+ day learning period** before meaningful detection. Service just deployed or traffic pattern completely changed post-deployment = high false positives. Insights only works where Trail activates. Insights itself costs extra ($0.35/100K analyzed Management Events). Small accounts: compare GuardDuty CloudTrail-based threat detection cost-efficiency vs. Insights. GuardDuty auto-analyzes CloudTrail, generates Findings—complements Insights.

> 💡 **Related Theory**: Insights ML likely uses CUSUM (Cumulative Sum Control Chart) or EWMA (Exponentially Weighted Moving Average). CUSUM detects mean shift cumulatively (Page 1954) effective at catching low-slow changes (APT low-rate data exfil). Insights detecting overnight-accumulated S3 GetObject surge likely employs this statistical approach.

## Auto Remediation and SSM Automation Failure Patterns

Auto Remediation = Config NON_COMPLIANT trigger → SSM Automation Runbook auto-execute. 90% of "doesn't work" cases have 3 root causes.

1. **IAM Permission Insufficient**: `AutomationAssumeRole` lacks permissions Runbook needs. S3 public-block Runbook needs `s3:PutBucketPublicAccessBlock`. Check Config console > Rule > Remediation Execution Status for errors.
2. **Runbook Parameter Mapping Error**: Resource ARN not correctly passed from Config Rule to Runbook input.
3. **Resource Already Deleted**: Between Config evaluation and Runbook execution, resource deleted.

> 📚 **Case Study**: 2023 Korean finance company C. `s3-bucket-public-read-prohibited` Rule + Auto Remediation works in test, fails in prod. Investigation: AutomationAssumeRole's S3 bucket policy modify permission (`s3:PutBucketPublicAccessBlock`) works on test buckets but fails on prod due to resource ARN pattern mismatch. Config console Remediation Execution Status showed "AutomationExecution failed: Access Denied." Fixed by AutomationAssumeRole IAM policy. Hard-coding `Resource: "*"` violates least privilege, but per-rule roles prevent ARN pattern mistakes.

---

## 📝 Practice Questions

**Question 1.** The security team needs to track "who downloaded customer PII data from the production S3 bucket." What CloudTrail configuration is required?

A) Enabling only Management Events is sufficient, because all S3 access including `GetObject` is recorded as control plane events
B) Enable S3 Data Events — track GetObject/PutObject for the specific bucket
C) Enable CloudTrail Insights to detect abnormal download spikes with ML, which identifies who downloaded the data
D) Turning on GuardDuty S3 Protection creates findings for suspicious data access and identifies even the party that performed the download

**Answer: B**
Explanation: Downloading an S3 object (GetObject) is a Data Event. Management Events track only control plane operations such as `PutBucketPolicy` and `CreateBucket`. Data Events must be enabled on the target bucket for object-level access to be recorded. Because it incurs cost ($0.10 per 100K events), it is efficient to enable it selectively only for sensitive buckets.

---

**Question 2.** The company wants to automate an immediate SNS notification plus a Slack notification whenever the Root user signs in to the console. Which combination of tools is most appropriate?

A) Send CloudTrail logs to CloudWatch Logs, then send via SNS using a `{ $.userIdentity.type = "Root" }` Metric Filter + CloudWatch Alarm
B) EventBridge Rule (CloudTrail event pattern `userIdentity.type = Root`) → SNS + Lambda (Slack)
C) Evaluate Root usage with the Config rule `root-account-mfa-enabled` and send an SNS notification when NON_COMPLIANT
D) Add the Audit Manager Root access Control to an Assessment to collect sign-in occurrences as evidence and notify

**Answer: B**
Explanation: CloudTrail automatically delivers all API calls (including console sign-ins) to the EventBridge default bus. Matching the `userIdentity.type = Root` pattern in an EventBridge Rule filters only Root sign-ins. Specifying SNS and Lambda (calling the Slack webhook) as Targets enables real-time multi-channel notifications. The Metric Filter path in A also works but has high latency. Config and Audit Manager are not event-response tools.

---

**Question 3.** The company wants "automatically block an S3 public bucket when it is created" to be handled without operator intervention. What is the most appropriate combination?

A) Detect spikes in the call volume of public bucket creation APIs with CloudTrail Insights and trigger a blocking Lambda through EventBridge
B) Config Rule `s3-bucket-public-read-prohibited` + Auto Remediation `AWS-DisableS3BucketPublicReadWrite`
C) Use GuardDuty S3 Threat Detection to create a finding for public exposure and automatically apply Public Access Block
D) Classify sensitive data in public buckets with Amazon Macie, then automatically block public access on risky buckets

**Answer: B**
Explanation: This is the standard continuous compliance + auto remediation pattern. The Config rule evaluates immediately when a bucket configuration changes (Configuration change trigger) → NON_COMPLIANT is detected → the SSM Runbook `AWS-DisableS3BucketPublicReadWrite` runs automatically → public access is blocked. GuardDuty detects threats but has no automatic remediation capability. Macie specializes in data classification.

---

**Question 4.** One year of CloudTrail data must be analyzed with SQL for an external audit. What is the most appropriate tool?

A) Filter Event History in the console — export the immutable 90 days of events as CSV and analyze one year in an external SQL tool
B) CloudTrail Lake — run SQL queries directly in the console, 7-year retention, no ETL needed
C) Load Trail events into DynamoDB Streams and then query one year with PartiQL
D) Without an S3 Trail, stand up Athena alone and query CloudTrail Event History directly as a table

**Answer: B**
Explanation: Event History provides only 90 days. Analysis beyond 90 days requires Lake or S3+Athena. Lake supports SQL directly in the console, external data integration, and multi-account support, and needs no separate ETL pipeline. S3+Athena is also valid but requires partition setup and schema management. When fast analysis is needed in a large multi-account environment, Lake has a lower operational burden.

---

**Question 5.** Which service is most suitable for automatically detecting an abnormally high number of EC2 RunInstances calls?

A) Evaluate new instances with the Config rule `ec2-instance-no-public-ip` and mark abnormal creation as NON_COMPLIANT
B) CloudTrail Insights (ApiCallRateInsight — learns a 7-day baseline and then detects spikes)
C) Send CloudTrail logs to CloudWatch Logs and periodically aggregate RunInstances surges with a Logs Insights `stats count(*) by bin(5m)` query
D) Collect RunInstances calls as evidence with the Audit Manager EC2 Control and identify call-volume anomalies in a report

**Answer: B**
Explanation: CloudTrail Insights is designed for exactly this scenario. ApiCallRateInsight generates an Insight event when the call volume of a specific API (`RunInstances`) becomes statistically significantly higher than the 7-day baseline. Config rules evaluate resource state and do not detect call-volume spikes. Note, however, that a 7-day learning period is required, and meaningful detection is not possible during this period.

---

**Question 6.** The company must submit HIPAA compliance evidence to an external auditor. What is the most efficient tool?

A) Export the Config Aggregator's HIPAA-related rule evaluation results as CSV and manually map and organize them by Control
B) Run an Assessment with Audit Manager's prebuilt HIPAA Framework → automatic evidence collection → PDF/CSV report
C) Extract HIPAA-related API calls from CloudTrail Lake with SQL, convert them to Excel, and submit them as audit evidence
D) Capture Trusted Advisor security check results and the Security Hub score and bundle them as compliance evidence for submission

**Answer: B**
Explanation: This is the core use case for Audit Manager. When you select the HIPAA Framework and activate an Assessment, Config rule results, CloudTrail API calls, and Security Hub findings are automatically mapped to and collected for each Control. At audit time, simply clicking the "Generate report" button produces a PDF/CSV with the evidence organized. This approach is the implementation of "continuous compliance."

---

**Question 7.** The company wants to see non-compliant resources across multiple accounts at a glance. Which configuration is the standard?

A) Log in to each account's console, check the NON_COMPLIANT list on the Config dashboard, and compile it into a spreadsheet
B) Place a Config Aggregator in the Audit Account and consolidate data from all accounts and Regions
C) Use CloudWatch Cross-Account Observability (OAM) to gather each account's Config metrics into a central dashboard widget to display non-compliance status
D) Run SQL on a CloudTrail Lake Organization EDS to derive non-compliant resources backward from resource change events

**Answer: B**
Explanation: A Config Aggregator consolidates Config data from multiple accounts and Regions into a single view. Placing it in the Audit Account is the standard Landing Zone pattern. The `describe-aggregate-compliance-by-config-rules` API lets you query in one place which resources in which accounts violate which rules. When integrated with Organizations, newly added accounts are automatically included in the Aggregator.

---

**Question 8.** Auto Remediation is configured, but NON_COMPLIANT resources are not being remediated automatically. What is the troubleshooting sequence?

A) Delete and recreate the Config rule, then reattach Remediation to reset the evaluation cache
B) Check Remediation Execution Status in the Config console → review the IAM permissions of the AutomationAssumeRole → check the Runbook execution logs
C) Reconfigure Config's S3 Delivery Channel to resolve remediation failures caused by delayed Configuration Item delivery
D) Stop and restart the Configuration Recorder to force a resync of resource state recording

**Answer: B**
Explanation: Auto Remediation = running an SSM Automation Runbook. 90% of failures are IAM permission problems. Go to the Remediation tab in the Config console → check the failure message in "Remediation Execution Status". If it says "AutomationExecution failed: Access Denied", add permissions to modify the target resource to the AutomationAssumeRole. If the error is in the Runbook itself, check the detailed logs in the Execution history of the SSM Automation console.

---

**Question 9.** The company wants to automatically block EC2 launches when the Microsoft Windows BYOL license limit of 200 cores is exceeded. Which tool is needed?

A) Periodically evaluate the total vCPUs of running Windows instances with a Config rule and block with NON_COMPLIANT when it exceeds 200 cores
B) License Manager Configuration + LicenseCountHardLimit = true + AMI association
C) Monitor core usage with the Trusted Advisor license check and notify through a recommendation when approaching the limit
D) Set a Windows core quota of 200 in Service Quotas to reject RunInstances beyond it

**Answer: B**
Explanation: This is the exact use case for License Manager. If the `--license-count-hard-limit` flag is turned on when creating the License Configuration, RunInstances itself fails when the license count reaches the limit while launching EC2 from that AMI. If Hard Limit is false, only a notification is sent when the limit is exceeded and the launch is still allowed. Config rules have no such blocking capability.

---

**Question 10.** The integrity of the Trail must be demonstrated to an external auditor. Which feature is needed, and how is it verified?

A) Enable versioning on the Trail S3 bucket to preserve previous versions of all log files and demonstrate integrity through the change history
B) Enable Log File Validation → hourly digest files + SHA-256 hash chain → verify with the `aws cloudtrail validate-logs` command
C) Enable MFA Delete on the Trail bucket to block deletion and overwriting of log files, thereby guaranteeing integrity
D) Encrypt Trail logs with SSE-KMS and restrict access with a key policy to demonstrate that the logs have not been tampered with

**Answer: B**
Explanation: When Log File Validation is enabled, CloudTrail generates a digest file every hour containing the SHA-256 hashes of that hour's log files, and the digest files are also linked in a chain structure. The command `aws cloudtrail validate-logs --trail-arn ... --start-time ...` mathematically proves that no logs have been tampered with. S3 versioning helps restore deleted files but has no tamper-detection capability. MFA Delete protects against deletion and KMS encryption protects confidentiality, so their purposes differ.

---

## Week 5 Preview — CloudOps' Core Weapon: AWS Systems Manager

Week 5 covers **Systems Manager (SSM)**—while CloudWatch & CloudTrail track "what's happening" and "who did it," SSM automates "how to fix and maintain."

- Day 1: SSM overview, Agent installation, Fleet Manager, Inventory
- Day 2: Run Command, State Manager (Desired State enforcement), Maintenance Window
- Day 3: Patch Manager—baselines, patch groups, compliance
- Day 4: Parameter Store (SecureString/KMS), Session Manager (VPN-less SSH), Automation Runbook
- Day 5: Week 5 review + 10 scenario questions

SSM ranks 1st in single-service exam weight with CloudWatch on SOA-C02. Auto Remediation Runbook, Patch Manager, Run Command, Parameter Store are frequent scenarios. Auto Remediation (Config's Runbook), Patch Manager (state enforcement), Run Command (operational automation) link Weeks 3-5 into single complete operations automation loop.
