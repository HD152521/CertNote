# Day 5 - Week 4 Review: CloudTrail, Config, and the Audit Stack Together

The tools of Week 4 answer a different question from CloudWatch. If CloudWatch shows "what is happening right now" in real time, this week's tools handle the after-the-fact, normative questions: "who did what in the past, is the current state compliant with the rules, and how do we submit the evidence to an external auditor?" For security incident response and compliance, after-the-fact tracing and an evidence system matter as much as real-time detection. Today we re-examine what layers CloudTrail, CloudTrail Lake, AWS Config, and Audit Manager form, and wrap up with 10 exam-style scenarios.

## The Concept Map of Week 4

```
[AWS API call occurs]
        │
        ▼
[CloudTrail]  ─→  Event History (90 days free, immutable)
        │                │
        │                ▼
        │         [S3 Trail]  ─→  Log File Validation (SHA-256 hash chain)
        │                │              → Athena query analysis
        │                │              → SIEM integration (Splunk, Sumo Logic)
        │                ▼
        │       [CloudTrail Lake]  ─→  SQL queries (Event Data Store)
        │                │              → 7-year retention / Organization integration
        │                │              → Can ingest external events
        │                ▼
        │       [Insights Events]  ─→  ML: ApiCallRateInsight / ApiErrorRateInsight
        │                              → Needs 7 days of baseline learning
        │
        ▼
[EventBridge default bus]  ─→  Rule pattern matching → SNS / Lambda / SSM
        (all API calls delivered automatically)
        │
        ▼
[AWS Config]  ─→  Configuration Item (resource state snapshot)
        │              → Resource Timeline (change history visualization)
        │
        ▼
  [Config Rules]  ─→  Evaluation trigger (Configuration change | Periodic)
        │              → NON_COMPLIANT detection
        │              → SNS notification
        ▼
[Auto Remediation]  ─→  Automatic SSM Automation Runbook execution
        │
        ▼
[Conformance Pack]  ─→  A bundle of Rules (based on HIPAA/PCI/NIST)
        │              → Deployed across the whole Organization
        ▼
[AWS Audit Manager]  ─→  Framework → Control → Data Source → Assessment
                         → Automatic evidence collection (Config/CloudTrail/Security Hub)
                         → PDF/CSV report output
```

> 💡 **Related theory**: The design of this stack implements the **Defense in Depth** principle of security engineering and the theory of **Audit Trail**. NIST SP 800-92 "Guide to Computer Security Log Management" presents as a core principle that "it must always be possible to reconstruct who did what and when (accountability)." It is a layered structure in which CloudTrail provides the raw data for this accountability, Log File Validation provides tamper-evidence, Config provides state tracking, and Audit Manager provides compliance reporting.

## Key Comparison Tables

**CloudTrail vs AWS Config**

| Item | CloudTrail | AWS Config |
|------|-----------|------------|
| What it tracks | API calls (actions) | Resource configuration (state) |
| Question | "Who did what" | "What state is it in now" |
| Unit of data | Event (JSON) | Configuration Item |
| Retention | 90 days by default (History), permanent with a Trail | Permanent storage in S3 |
| Cost | Management free, Data $0.10/100K | $0.003 per CI + $0.001 per Rule |
| Alarm integration | EventBridge pattern matching → SNS/Lambda | Rule evaluation → SNS or Auto Remediation |
| Tamper detection | Log File Validation (SHA-256) | No tamper detection feature |

**CloudTrail Lake vs S3 Trail + Athena**

| Item | CloudTrail Lake | S3 + Athena |
|------|-----------------|-------------|
| Analysis | Direct SQL in the console (Event Data Store ID) | Athena table + partition setup |
| Maximum retention | 7 years (2555 days) | Permanent (S3 lifecycle policy) |
| Query cost | $5 per TB scanned | $5 per TB scanned (same) |
| External events | Possible (other clouds, on-prem) | Not possible |
| Multi-account | Organization-enabled EDS | Organization Trail + S3 |
| Operational burden | Low (AWS managed) | High (ETL, partition, and schema management) |
| Duplicate cost | Caution: double billing when used together with a Trail | Single billing when only a Trail is used |

The columnar storage design of CloudTrail Lake is the standard approach of OLAP (Online Analytical Processing) databases. Where row-based storage (OLTP) is optimized for quickly reading all the columns of a specific row, columnar storage greatly reduces I/O and cost for analytic queries that scan only specific columns (for example, `eventName`, `sourceIPAddress`). Apache Parquet, Google BigQuery, and Amazon Redshift work on the same principle. Most audit queries are column-oriented patterns that "find all rows with a specific eventName," so Lake's columnar storage is advantageous.

**Comparing Config Rule Evaluation Triggers**

| Trigger type | When it runs | Example Rules that fit |
|------------|---------|----------------|
| Configuration change | Immediately upon detecting a resource configuration change | `s3-bucket-public-read-prohibited`, `ec2-imdsv2-check` |
| Periodic (1h/3h/6h/12h/24h) | Full evaluation at each configured interval | `iam-password-policy`, Rules based on the user list |
| Hybrid (both) | On change + at each interval | Important Rules that must also catch drift after a change |

The Configuration change trigger evaluates the Rule right after AWS Config consumes CloudTrail events, detects a resource change, and creates a CI (Configuration Item). Therefore, if CloudTrail is not working properly, the configuration change trigger of Config Rules is also delayed. The Periodic trigger does not have this dependency and runs on Config's internal scheduler. Rules based on external system state (Credential report, IAM user list) need checking even without a "configuration change," so Periodic is right.

**Audit Manager vs Config vs Trusted Advisor**

| Item | AWS Config | AWS Audit Manager | AWS Trusted Advisor |
|------|-----------|-------------------|---------------------|
| Main role | Resource state evaluation, Rule violation detection | Compliance evidence collection, report automation | AWS best-practice recommendations |
| Output | Rule evaluation results, NON_COMPLIANT list | PDF/CSV audit reports, evidence per Control | Check results, recommendations |
| Framework concept | Conformance Pack (similar) | Central (HIPAA, PCI-DSS, SOC 2, etc.) | None |
| Auditor support | None | Auditor account invitation and review workflow | None |
| Automatic remediation | Auto Remediation yes | None (reports only) | None |
| Cost | CI + Rule billed separately | Billed per Assessment | Included in Business/Enterprise Support |

The "Continuous Compliance" concept that Audit Manager automates has its theoretical basis in NIST SP 800-137 "Information Security Continuous Monitoring." The key is the shift from an annual snapshot audit to continuous evidence collection. PCI-DSS v4.0 (released in 2022) changed in the direction of explicitly recommending continuous monitoring, and running Audit Manager Assessments continuously is the standard implementation that meets this requirement.

## Comparison with Other Cloud Platforms

| Capability | AWS | GCP | Azure |
|------|-----|-----|-------|
| API audit logs | CloudTrail | Cloud Audit Logs | Azure Activity Log |
| Resource state tracking | AWS Config | Asset Inventory | Azure Resource Graph |
| SQL audit analysis | CloudTrail Lake | BigQuery Audit | Log Analytics |
| Compliance evaluation | Config Rules | Security Command Center | Azure Policy |
| Audit report automation | Audit Manager | Compliance Reports Manager | Microsoft Purview Compliance Manager |
| Organization audit | Organization Trail | Org-level Audit Logs | Management Group policy |
| Anomaly detection | CloudTrail Insights | Security Command Center AI | Microsoft Sentinel |

GCP's Cloud Audit Logs is similar to CloudTrail, but differs in that Data Access logs are disabled by default and, when enabled, are included in Cloud Logging costs. Azure Activity Log keeps subscription-level control plane operations for 90 days (default), and for long-term retention you must export to a Log Analytics Workspace or Storage Account, which is similar to the CloudTrail S3 Trail. The structure is the same across all three platforms: "a default audit log exists, but data plane (object access) logs require separate enablement + additional cost."

## Internals of Organization Trail and Governance Patterns

When an Organization Trail is turned on, every event occurring in member accounts is aggregated into an S3 bucket in the management account. Member account users cannot modify or delete this Trail. This lock mechanism is the core of security governance.

```
[Management Account]
  └─ Create Organization Trail
       ├─ S3 bucket: s3://org-audit-logs/
       │    └─ Prefix: AWSLogs/{org-id}/{account-id}/
       └─ Applied automatically to all member accounts
            ├─ Account A: Trail READ-ONLY (cannot delete/modify)
            ├─ Account B: Trail READ-ONLY
            └─ Account C: Trail READ-ONLY (applied automatically to new accounts)
```

As a hypothetical case, in 2021 a Korean SI company, Company B, had a member account administrator accidentally delete a Trail, leaving 2 weeks without audit logs. The log gap for that period was found in an external security audit, and considerable manpower was spent manually preparing additional explanatory materials. Afterward, they enabled an Organization Trail and applied an SCP that denies the `cloudtrail:DeleteTrail` and `cloudtrail:StopLogging` actions in member accounts. Even when an Organization Trail exists, doubly blocking Trail tampering with an additional SCP is the standard governance pattern.

## CloudTrail Insights: The Limits of ML-Based Anomaly Detection and Suitable Use Cases

Insights learns the past 7 days of data as a baseline, and generates an Insight event when the current API call volume or error rate deviates in a statistically significant way. There are two types.

- **ApiCallRateInsight**: the call volume of a specific API spikes relative to the baseline
- **ApiErrorRateInsight**: the error rate of a specific API surges relative to the baseline

> ⚠️ **Pitfall**: Insights only does meaningful detection **after the 7-day learning period**. Right after you deploy a service or the traffic pattern changes completely, there are many false positives. Also, Insights works only in accounts where a Trail is enabled. And Insights itself has a separate cost ($0.35/100K analyzed events). For small accounts, it is good to compare cost efficiency with GuardDuty's CloudTrail-based threat detection. GuardDuty automatically analyzes CloudTrail and generates Findings, so it complements Insights.

The ML algorithm of CloudTrail Insights is not public, but the algorithms suited to detecting anomalies in API call volume are CUSUM (Cumulative Sum Control Chart) and EWMA (Exponentially Weighted Moving Average). CUSUM is a statistical method that cumulatively detects a change in the mean in a time series, proposed by Page (1954). It is effective at detecting small, persistent changes (the low and slow data exfiltration often seen in APT attacks). It is likely that this approach is used for CloudTrail Insights to detect an increase in S3 GetObject that happens little by little overnight.

## Failure Patterns of Auto Remediation and SSM Automation

Auto Remediation automatically runs an SSM Automation Runbook when a Config Rule detects NON_COMPLIANT. In practice, 90% of "it does not work" cases come from one of three causes.

1. **Insufficient AutomationAssumeRole permissions**: the IAM Role used when the Runbook runs lacks permission to modify the target resource
2. **Runbook parameter mapping error**: the resource ARN from the Config Rule is not passed correctly as an input parameter of the Runbook
3. **The resource was already deleted**: the resource disappeared between the time the Rule evaluated it and the time the Runbook ran

As a hypothetical case, in 2023 Company C in the financial sector connected Auto Remediation to the `s3-bucket-public-read-prohibited` Rule. It worked well in the test environment but not in production. The investigation found that the AutomationAssumeRole's permission to modify S3 bucket policy (`s3:PutBucketPublicAccessBlock`) existed for the test environment buckets, but the production buckets had a different Resource ARN pattern, so the permission was missing. The cause was identified by the message "AutomationExecution failed: Access Denied" in the "Remediation Execution Status" tab of the Config console. Using `Resource: "*"` in the AutomationAssumeRole goes against the principle of least privilege, but separating roles per rule is safer to prevent ARN pattern mistakes.

---

## 📝 Practice Questions

**Question 1.** A security team needs to trace "who downloaded customer PII data from the production S3 bucket." What CloudTrail setting is needed?

A) Enabling only Management Events is enough, because all S3 access including `GetObject` is recorded as control plane events
B) Enable S3 Data Events: track GetObject/PutObject of specific buckets
C) Enable CloudTrail Insights to detect abnormal download spikes with ML, which identifies who downloaded
D) Turn on GuardDuty S3 Protection to turn suspicious data access into Findings and pinpoint even the downloader

**Answer: B**
Explanation: Downloading an S3 object (GetObject) is a Data Event. Management Events track only control plane operations such as `PutBucketPolicy` and `CreateBucket`. You must enable Data Events on the target bucket for object-level access to be recorded. Since this incurs cost ($0.10/100K events), it is efficient to enable it selectively only for sensitive buckets.

---

**Question 2.** You want to automate an immediate SNS notification + Slack notice when the Root user logs in to the console. Which combination of tools is the most suitable?

A) Send CloudTrail logs to CloudWatch Logs, then send SNS with a `{ $.userIdentity.type = "Root" }` Metric Filter + CloudWatch Alarm
B) EventBridge Rule (CloudTrail event pattern `userIdentity.type = Root`) → SNS + Lambda (Slack)
C) Evaluate Root usage with the Config Rule `root-account-mfa-enabled` and notify via SNS on NON_COMPLIANT
D) Add Audit Manager's Root access Control to an Assessment to collect and report logins as evidence

**Answer: B**
Explanation: CloudTrail automatically delivers all API calls (including console logins) to the EventBridge default bus. Matching the pattern `userIdentity.type = Root` in an EventBridge Rule filters only Root logins. Specifying SNS and Lambda (calling the Slack webhook) as Targets enables real-time multi-channel notification. The Metric Filter path in A also works, but it goes through CloudTrail→CloudWatch Logs delivery, the Metric Filter, and the Alarm, so the delay is large and multi-channel Slack integration is cumbersome; EventBridge, which matches event patterns directly, is the standard for real-time multi-channel response. A Config Rule is a tool for evaluating resource state, and Audit Manager is for evidence collection and reporting, so they are unsuitable for real-time event response.

---

**Question 3.** A company wants to handle "automatically block when an S3 public bucket is created" without operator intervention. What is the most suitable combination?

A) Use CloudTrail Insights to detect a spike in the call volume of the public-bucket-creation API and trigger a blocking Lambda through EventBridge
B) Config Rule `s3-bucket-public-read-prohibited` + Auto Remediation `AWS-DisableS3BucketPublicReadWrite`
C) Turn public exposure into a Finding with GuardDuty S3 Threat Detection and automatically apply Public Access Block
D) Classify the sensitive data of public buckets with Amazon Macie and then automatically block public access on risky buckets

**Answer: B**
Explanation: This is the standard pattern of continuous compliance + auto remediation. The Config Rule evaluates immediately when the bucket configuration changes (Configuration change trigger) → detects NON_COMPLIANT → automatically runs the SSM Runbook `AWS-DisableS3BucketPublicReadWrite` → blocks public access. GuardDuty detects threats but has no automatic remediation feature. Macie specializes in data classification and PII detection.

---

**Question 4.** You must analyze one year of CloudTrail data with SQL for an external audit. What is the most suitable tool?

A) Filter Event History in the console: export the immutable 90-day events to CSV and analyze one year of data with an external SQL tool
B) CloudTrail Lake: direct SQL queries in the console, 7-year retention, no ETL needed
C) Load the Trail events into DynamoDB Streams and then query one year with PartiQL
D) Without an S3 Trail, run Athena alone and query CloudTrail Event History directly as a table

**Answer: B**
Explanation: Event History provides only 90 days. Analysis beyond 90 days needs Lake or S3+Athena. Lake allows direct SQL in the console + external data integration + multi-account support and needs no separate ETL pipeline. S3+Athena is also valid but requires partition setup and schema management. When fast analysis is needed in a large multi-account environment, Lake has a lower operational burden.

---

**Question 5.** Which service is most suitable for automatically detecting an abnormally large number of EC2 RunInstances calls?

A) Evaluate new instances with the Config Rule `ec2-instance-no-public-ip` and mark abnormal creation as NON_COMPLIANT
B) CloudTrail Insights (ApiCallRateInsight: detects a spike after learning a 7-day baseline)
C) Send CloudTrail logs to CloudWatch Logs and periodically aggregate the RunInstances surge with a Logs Insights `stats count(*) by bin(5m)` query
D) Collect RunInstances calls as evidence with Audit Manager's EC2 Control and identify call volume anomalies in a report

**Answer: B**
Explanation: CloudTrail Insights was designed for exactly this scenario. ApiCallRateInsight generates an Insight event when the call volume of a specific API (`RunInstances`) becomes statistically significantly higher than the 7-day baseline. A Config Rule evaluates resource state and does not detect call volume spikes. However, you should be aware that a 7-day learning period is needed and meaningful detection is not possible during that period.

---

**Question 6.** A company must submit HIPAA compliance evidence to an external auditor. What is the most efficient tool?

A) Export the HIPAA-related Rule evaluation results of the Config Aggregator to CSV and manually map and organize them per Control
B) Run an Assessment with Audit Manager's prebuilt HIPAA Framework → automatic evidence collection → PDF/CSV report
C) Extract HIPAA-related API calls from CloudTrail Lake with SQL, convert them to Excel, and submit as audit evidence
D) Capture Trusted Advisor's security check results and the Security Hub score and bundle them as compliance evidence

**Answer: B**
Explanation: This is the core use case of Audit Manager. When you select the HIPAA Framework and enable an Assessment, it automatically maps and collects Config Rule results, CloudTrail API calls, and Security Hub Findings to each Control. At audit time, just clicking the "Generate report" button produces a PDF/CSV with the evidence organized. This approach is the implementation of "continuous compliance."

---

**Question 7.** You want to see non-compliant resources across multiple accounts at a glance. Which configuration is the standard?

A) Log in to each account's console, check the NON_COMPLIANT list on the Config dashboard, and compile it in a spreadsheet
B) Place a Config Aggregator in the Audit Account and consolidate the data of all accounts and Regions
C) Gather each account's Config metrics into central dashboard widgets with CloudWatch Cross-Account Observability (OAM) to display non-compliance status
D) Run SQL on a CloudTrail Lake Organization EDS to back-calculate non-compliant resources from resource change events

**Answer: B**
Explanation: A Config Aggregator consolidates the Config data of multiple accounts and Regions into a single view. Placing it in the Audit Account is the standard Landing Zone pattern. With the `describe-aggregate-compliance-by-config-rules` API, you can query in a consolidated way which resource in which account violates which Rule. When integrated with Organizations, new accounts are automatically included in the Aggregator when added.

---

**Question 8.** Auto Remediation is configured, but NON_COMPLIANT resources are not being remediated automatically. What is the troubleshooting order?

A) Delete and recreate the Config Rule and reattach Remediation to reset the evaluation cache
B) Check Remediation Execution Status in the Config console → review the IAM permissions of the AutomationAssumeRole → check the Runbook execution logs
C) Reconfigure Config's S3 Delivery Channel to resolve remediation failures caused by Configuration Item delivery delays
D) Stop and restart the Configuration Recorder to force a resync of resource state records

**Answer: B**
Explanation: Auto Remediation = running an SSM Automation Runbook. 90% of failures are IAM permission problems. Check the failure message in the Config console's Remediation tab → "Remediation Execution Status." If it says "AutomationExecution failed: Access Denied," add permission to modify the target resource to the AutomationAssumeRole. If the error is in the Runbook itself, check the detailed logs in the Execution history of the SSM Automation console.

---

**Question 9.** You want to automatically block EC2 launches when the 200-core limit of a Microsoft Windows BYOL license is exceeded. Which tool is needed?

A) Periodically evaluate the total vCPUs of running Windows instances with a Config Rule and block with NON_COMPLIANT when over 200 cores
B) License Manager Configuration + LicenseCountHardLimit = true + AMI association
C) Monitor core usage with Trusted Advisor's license check and notify with a recommendation when nearing the limit
D) Set the Windows core quota to 200 in Service Quotas to reject RunInstances that exceed it

**Answer: B**
Explanation: This is the exact use case of License Manager. If you turn on the `--license-count-hard-limit` flag when creating a License Configuration, then when launching EC2 with that AMI, RunInstances itself fails once the license count reaches the limit. If Hard Limit is false, it only sends a notification when exceeded and allows the launch. A Config Rule has no such blocking capability.

---

**Question 10.** You must prove the integrity of a Trail to an external auditor. What feature is needed, and how do you verify?

A) Enable versioning on the Trail S3 bucket to keep previous versions of all log files and prove integrity through the change history
B) Enable Log File Validation → hourly digest files + a SHA-256 hash chain → verify with the `aws cloudtrail validate-logs` command
C) Enable MFA Delete on the Trail bucket to block deleting or overwriting log files, thereby guaranteeing integrity
D) Encrypt the Trail logs with SSE-KMS and restrict access with a key policy to prove the logs were not tampered with

**Answer: B**
Explanation: When you enable Log File Validation, CloudTrail generates every hour a digest file containing the SHA-256 hashes of that hour's log files, and the digest files themselves are linked in a chain structure. The `aws cloudtrail validate-logs --trail-arn ... --start-time ...` command mathematically proves that no log was tampered with. S3 versioning helps restore deleted files but has no tamper-detection feature. MFA Delete is deletion protection and KMS encryption is confidentiality protection, so their purposes differ.

---

## Week 5 Preview: The Core Weapon of CloudOps, AWS Systems Manager

In Week 5, if CloudWatch and CloudTrail track "what is happening" and "who did it," **Systems Manager (SSM)** is the operational execution engine that automates "how to fix and maintain."

- Day 1: SSM overview, Agent installation patterns, Fleet Manager, Inventory collection
- Day 2: Run Command, State Manager (enforcing Desired State), Maintenance Window
- Day 3: Patch Manager: baselines, patch groups, patch compliance
- Day 4: Parameter Store (SecureString/KMS), Session Manager (an SSH replacement without a VPN), Automation Runbook
- Day 5: Week 5 review + 10 scenario questions

SSM is, together with CloudWatch, one of the top single-weight services in SOA-C02. Auto Remediation, Patch Manager, Run Command, and Parameter Store are staple exam scenarios. CloudTrail's Auto Remediation Runbook, Config's Remediation Execution, and CloudWatch Alarm's EC2 Action are all connected to SSM, so when Week 5 ends, Weeks 3-5 connect into one complete operations automation loop.
