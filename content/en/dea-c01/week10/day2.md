# Day 2 - Integrated Review of Domains 3 & 4: Operations & Support + Security & Governance

## 📌 Key Takeaways

- Domain 3 (operations and support, 22%) and Domain 4 (security and governance, 18%) ask "how do you detect and recover from failures" and "who accesses the data and how is it encrypted."
- For orchestration: an existing Airflow DAG = MWAA, coordinating heterogeneous AWS services = Step Functions, Glue-only = Glue Workflows.
- Observability has three branches: threshold alerts = CloudWatch Alarm, root cause tracing = CloudWatch Logs Insights, who made the call = CloudTrail. Data quality is verified, and bad data isolated, with Glue Data Quality (DQDL) rules.
- Permissions live in different layers: services and APIs get least-privilege IAM roles, tables, columns, and rows are handled by Lake Formation, and encryption keys are governed by KMS key policies. The data is readable only if all three gates are passed.
- When you need key control and auditing, use SSE-KMS (customer managed key); automatic detection of sensitive data is Macie; hiding values at query time is Lake Formation filters and Redshift dynamic data masking.

## Viewing Operations and Security as One Bundle

Yesterday we reviewed the pipeline through which data flows. Today we bundle the areas that **run that pipeline reliably** and **protect it safely**. The two domains connect on a single pipeline like this.

1. **Operations**: MWAA/Step Functions coordinate the pipeline → CloudWatch monitors metrics and logs → alarms and retries on failure
2. **Quality**: validate before loading with Glue Data Quality rules, isolate violating data
3. **Security**: least-privilege IAM roles → encrypt stored data with KMS, encrypt the in-transit segment with TLS
4. **Governance**: detect sensitive information with Macie → fine-grained access with Lake Formation → audit with CloudTrail

Expanded into the exam guide's tasks, it looks like this.

| Exam guide task | What it asks | Where to go back |
|------|------|------|
| 3.1 Automating processing | MWAA and Step Functions orchestration, diagnosing workflow failures, Lambda and EventBridge automation, Athena queries | Week 5 Day 3, Week 7 Day 2 |
| 3.2 Data analysis | QuickSight visualization, Redshift and Athena SQL and views, provisioned versus serverless trade-offs | Week 7 |
| 3.3 Maintenance and monitoring | Extracting logs for audits, notifications, performance diagnosis, CloudTrail, CloudWatch Logs, log analysis | Week 8 Days 1 and 3 |
| 3.4 Data quality | Quality checks during processing, rule definition, consistency investigation, sampling, data skew | Week 4 Day 4, Week 8 Day 2 |
| 4.1 Authentication | Security groups, IAM roles, Secrets Manager credential rotation, PrivateLink | Week 9 Day 1 |
| 4.2 Authorization | Custom IAM policies, credential storage, Redshift permissions, Lake Formation | Week 6 Day 2, Week 9 Day 1 |
| 4.3 Encryption and masking | KMS, cross-account encryption, in-transit encryption, masking and anonymization | Week 9 Days 2 and 3 |
| 4.4 Audit logs | CloudTrail, CloudTrail Lake, CloudWatch Logs, log analysis | Week 8 Day 3, Week 9 Day 4 |
| 4.5 Privacy and governance | Redshift data sharing, identifying PII, blocking replication to disallowed Regions, AWS Config | Week 9 Days 3 and 4 |

## Domain 3: Orchestration

Orchestration is tying multiple jobs together according to order and dependencies.

| Requirement | Service | Characteristics |
|---------|--------|------|
| Data workflow scheduling and dependencies (Airflow) | Amazon MWAA | Managed Apache Airflow, DAG-based |
| Serverless state machine, visual branching and retries | AWS Step Functions | Coordinates steps across Lambda, Glue, EMR, and others |
| Flows dedicated to Glue jobs and crawlers | Glue Workflows | Built-in Glue triggers and workflows |
| Simple cron schedule trigger | EventBridge Scheduler | Time-based events |

> 💡 **Related theory**: If you "want to keep using an existing Airflow DAG as is," MWAA is the answer; to "coordinate heterogeneous AWS services (Lambda, ECS, Glue) with branching, retries, and parallelism," Step Functions is the answer. If you are only chaining Glue jobs, Glue Workflows is enough.

This is another point where the choice splits from an operations standpoint (Week 5 Day 5).

- **Idle cost**: MWAA is billed while the environment is up. Step Functions Standard is billed by the number of state transitions, and Express by the number of executions, duration, and memory. For "a short flow that runs once a day, with no idle cost," it is Step Functions.
- **Waiting for completion**: The integration pattern that waits until a Glue job or EMR step finishes (`.sync`) works only in Standard. Express runs for at most 5 minutes, so it is not the default for ETL orchestration.
- **Where retries live**: If you stack Step Functions `Retry` and the Glue job's own retry, they multiply. Put retries in one layer only, and branch to notification (SNS) or compensation handling with `Catch`.
- **Diagnosing MWAA failures**: If a DAG does not appear in the list or a task does not start, check in CloudWatch Logs the DAG path in S3, the permissions of the environment execution role, and errors from installing required packages.

## Domain 3: Monitoring and Logging

- **CloudWatch Metrics/Alarms**: Threshold alarms on job failure rate, latency, and resource usage.
- **CloudWatch Logs**: Aggregation of Glue, Lambda, and EMR execution logs and Logs Insights queries.
- **CloudTrail**: API call audit log (who did what and when). Also connected to security and governance.
- **EventBridge**: Notifications and follow-up triggers from job state change events.

```text
The three kinds of pipeline observability:
- Metric  → "notify when a threshold is exceeded" with a CloudWatch Alarm
- Log     → "trace the cause" with CloudWatch Logs Insights
- Audit   → "who performed this action" with CloudTrail
```

> 💡 **Related theory**: Separate them this way: "trace why it failed" is CloudWatch Logs, "threshold-based alert" is a CloudWatch Alarm, and "trace who called this API" is CloudTrail. Not mixing these three up is a scoring point in Domain 3.

Even when everyone says "leave a record," each tool records something different.

| Tool | What it records | Default behavior and limits |
|------|------|------|
| CloudWatch Logs | Logs the application wrote (Glue, Lambda, and EMR execution logs) | A metric filter turns a log pattern into a metric so you can set an alarm |
| CloudWatch Logs Insights | Interactive queries over log groups | A query tool, not a storage tool |
| CloudTrail event history | The last 90 days of **management events** | Viewed in the console with no extra setup. There are no data events |
| CloudTrail trail | Continuously delivers events to S3 (and CloudWatch Logs if needed) | By default, only management events are recorded. **Data events** such as S3 object-level operations **must be turned on yourself** |
| CloudTrail Lake | Collects events in an event data store and queries them with SQL | Usable without a trail, and keeps events from multiple accounts and Regions for years |
| AWS Config | The history of **when and how a resource configuration changed** | It shows what state something was in, not who called what |

- "Who read the S3 object" is a **data event**, not a management event. If you have not turned on data events for that bucket in the trail, there is no record. They are off by default because the volume adds cost.
- If you need audit records older than 90 days, use a trail (store in S3 and analyze with Athena) or CloudTrail Lake. If the cue is "query audit logs centrally with SQL," it is CloudTrail Lake.
- When log volume is very large, the analysis tool changes. Ad hoc exploration is Logs Insights, large volumes of logs piled up in S3 are Athena, search and dashboards are OpenSearch Service, and transforming and aggregating very large logs is EMR.

## Domain 3: Data Quality

- **Glue Data Quality**: Define rules (DQDL) on a dataset to verify completeness, validity, and duplicates. When a rule is violated, stop the job or isolate the data.
- **DataBrew**: Use profiling to visually grasp missing values, outliers, and distributions.
- **Idempotency and retries**: Design jobs to be idempotent so reprocessing after a failure is safe.

```python
# Glue Data Quality rule (DQDL) example
ruleset = """
Rules = [
   IsComplete "order_id",
   ColumnValues "amount" >= 0,
   Uniqueness "order_id" > 0.99
]
"""
# If the rules pass, load; if they fail, route to the quarantine bucket
```

The quality task contains two more concepts besides defining rules.

| Concept | Content | How it is used on the exam |
|------|------|------|
| Sampling | Inspect only part of the data instead of all of it. There are random sampling, stratified sampling that preserves group proportions, and systematic sampling that picks at regular intervals | The basis for reducing the cost of profiling large volumes. DataBrew builds a Recipe from a sample and applies it to everything with a Job |
| Data skew | A phenomenon where rows pile up on particular keys so that only some partitions or tasks take long or run out of memory | Mitigated with salting (adding a random suffix to the key to spread it), repartitioning, and processing the skewed keys separately |
| Two entry points | Evaluation against a Data Catalog table (checking stored data) and evaluation inside an ETL job (blocking before load) | If it says "block before loading," it is evaluation inside the job |

- Whether the schema is right (shape) and whether the values are right (content) are different problems. Negative amounts, duplicate keys, and NULLs are caught by Data Quality, not by Schema Registry (Week 4 Day 4).

## Domain 3: The Scale Between Provisioned and Serverless

The analysis task asks not about service names but "when do you keep always-on capacity and when do you pay for what you use."

| Axis | Provisioned (Redshift provisioned cluster, EMR on EC2, MWAA) | Serverless (Athena, Glue, Redshift Serverless, EMR Serverless) |
|------|------|------|
| Billing | Time kept running | What you use (scan volume, DPU and RPU hours, and so on) |
| Favorable workload | Steady all-day load, predictable performance | Intermittent, unpredictable load |
| Tuning knobs | Node type and count, Spot, detailed settings | Almost none. Fix the data side (format, partitions) |
| Operational burden | Sizing, patching, scaling | Low |

- Athena cost control is done in a **workgroup**. A query that exceeds the per-query scan limit is canceled. A workgroup-wide usage limit only notifies via SNS when the threshold is crossed; it does not automatically cancel running queries.
- Visualization is QuickSight. If a dashboard queries the source every time and is slow or expensive, importing the data into the in-memory engine (SPICE) becomes the answer.

## Domain 4: Authentication and Authorization (IAM)

- **IAM roles**: Grant services (Glue/EMR/Lambda) least privilege. Do not keep human credentials in code.
- **Least privilege principle**: Allow only the necessary actions and resources. No overuse of `*`.
- **Resource-based policies**: S3 bucket policies, KMS key policies, and so on allow access from the resource side.
- **Relationship between Lake Formation permissions and IAM**: Access to data lake data is handled by LF, and service operation permissions by IAM.

If "a Glue job must access S3 and KMS," grant those permissions to the job's execution role (IAM Role). A choice that hardcodes access keys in the job script is wrong.

- In policy evaluation, an **explicit deny takes precedence over any allow**. For a principal in a different account to get access, both sides (the requester's IAM policy and the resource-side policy) must allow it.
- Credentials such as database passwords are kept in a store, not in code.

| Distinction | AWS Secrets Manager | Systems Manager Parameter Store |
|------|------|------|
| Main use | Secrets such as DB credentials and API keys | Configuration values and secrets (SecureString) |
| Automatic rotation | Supported (set a rotation schedule) | No built-in feature |
| Cue | "Rotate credentials periodically" | "Store configuration values in a hierarchy," minimal cost |

- Permissions inside Redshift are granted with `GRANT` to the database's users, groups, and roles, not through IAM. To let data be read across accounts or clusters without copying, use **Redshift data sharing**.
- The network layer is also part of authentication. If you cannot connect to a data source, look at the security group's inbound rules; if you must reach an AWS service without going through the internet, look at a VPC endpoint (PrivateLink).

## Domain 4: Encryption (KMS)

- **Encryption at rest**: S3 (SSE-S3/SSE-KMS), Redshift, RDS, EBS, and Kinesis all support server-side encryption, and when you need key control, you specify a KMS key.
- **Encryption in transit**: TLS/HTTPS.
- **SSE-KMS vs SSE-S3**: Use SSE-KMS when you need to manage, audit, and rotate keys yourself and need per-key access control; use SSE-S3 for simple managed encryption.
- **Customer managed key (CMK)**: Fine-grained control over who can encrypt and decrypt through the key policy, and auditing of key use through CloudTrail.

| Keyword | Answer |
|--------|------|
| Key rotation, per-key access control, auditing required | SSE-KMS (customer managed key) |
| Simplest managed encryption | SSE-S3 |
| Client encrypts itself before uploading | Client-side encryption |

What you can do with a KMS key differs by who manages it.

| Key type | Edit key policy | Automatic rotation | Cross-account use |
|------|------|------|------|
| AWS owned key | Not possible (not visible) | The service decides | Not applicable |
| AWS managed key (`aws/s3` and so on) | Not possible | Automatic every year. It cannot be turned off and the period cannot be changed | Not possible |
| Customer managed key | Possible | Optional. When on, the default period is 365 days and you can specify the period yourself | Possible if the key policy allows the other account |

- The rotation period of AWS managed keys changed from 3 years to 1 year in May 2022. Exam material may still say 3 years.
- Even when a key is rotated, the **key ID and ARN stay the same**. The old key material is kept, so past ciphertext is decrypted as before, and existing data is not re-encrypted. There is no need to change application code.
- Automatic rotation works only for symmetric encryption keys that use key material created by KMS. For asymmetric keys, HMAC keys, and keys in custom key stores, you rotate manually by creating a new key and moving the alias.
- Since January 5, 2023, S3 encrypts all new objects with SSE-S3 by default. Read the question not as "fix an unencrypted bucket" but as "who controls the key."
- When objects are read and written in bulk with SSE-KMS, KMS request cost and the per-second request limit become a problem. Turning on an **S3 Bucket Key** creates data keys from a bucket-level key and greatly reduces KMS requests (it cannot be used with DSSE-KMS).
- A trap in cross-account sharing: even if you open the bucket policy, if the object is encrypted with the AWS managed key (`aws/s3`), the other account cannot decrypt it. You must encrypt with a customer managed key and add the other account to the key policy.
- The in-transit segment is enforced through settings. S3 rejects requests where `aws:SecureTransport` is false in the bucket policy, and Redshift accepts only TLS connections through `require_ssl` in the parameter group.

## Domain 4: Sensitive Data Detection and Data Protection

- **Amazon Macie**: Uses machine learning and pattern matching to automatically discover and classify sensitive data such as **PII (personally identifiable information)** and credit card numbers in S3. It solves "we don't know where the sensitive data is."
- **Masking/tokenization**: Hide sensitive columns at output with Glue, Athena, and Redshift Dynamic Data Masking.
- **Data classification**: A protection chain running discovery (Macie) → classification → permissions (Lake Formation) → encryption (KMS).

For the scenario "sensitive information (PII) is scattered all over our S3 buckets and we want to find and classify it automatically," the answer is Amazon Macie. Macie is "detection/classification"; access control is Lake Formation/IAM, and protection is handled by KMS and masking, a division of roles.

When several choices say "handles sensitive information," separate them by **where and when** they act.

| Tool | Where it acts | What it does | Original data |
|------|------|------|------|
| Amazon Macie | S3 buckets | Analyzes objects and reports the location of sensitive data as findings. Also evaluates the public and shared status of buckets | Does not change it |
| Glue's sensitive data detection transform | During ETL job execution | Finds PII and writes the result masked (fully or partially) or replaced with a hash | A processed copy is created |
| Lake Formation data filters | At query time (Athena, Redshift Spectrum, EMR, and so on) | Hides columns, rows, and cells from certain principals | Does not change it |
| Redshift dynamic data masking | At Redshift query time | Attaches a masking policy to users and roles so the same column looks different to different people | Does not change it |

- Macie detects in two ways. **Automated sensitive data discovery** samples representative objects from buckets and scans broadly, while a **discovery job** analyzes specified buckets deeply. For in-house formats that the built-in (managed) identifiers do not catch, use regex-based custom identifiers.
- Macie sends findings to EventBridge. "If PII is found, quarantine and notify automatically" is the combination Macie → EventBridge → Lambda/SNS.
- A data sovereignty requirement ("backups and replicas must not go to a disallowed Region") is a matter of **blocking**, not detection. Apply a policy that denies operations in that Region using a Region condition (`aws:RequestedRegion`).

## The Three Gates a Single Query Must Pass

A confusing type in security questions is "I granted the permission but still get `AccessDenied`." A single query that reads a Lake Formation managed table with Athena passes through three layers in turn.

```text
① IAM          permission to run the query and read the catalog + lakeformation:GetDataAccess
      ↓
② Lake Formation   has SELECT on the table, columns, and rows been granted to that principal?
      ↓            (if it passes, it issues temporary credentials for the registered S3 location)
③ KMS          if the object is SSE-KMS, can it be decrypted with that key (key policy)?
```

- For data in a location registered with Lake Formation, you do not give the user role S3 read permissions directly. Instead, `lakeformation:GetDataAccess` must be in IAM. The bucket where query results are written is separate, so S3 permissions on that side are still required.
- Unregistered locations are controlled the old way, by IAM and bucket policies alone. **Hybrid access mode** enforces Lake Formation permissions only on principals that have opted in for the same table, while the rest keep accessing through IAM permissions, which lets you migrate gradually without breaking existing workloads.
- Which gate blocked you can be sorted out from the deny events in CloudTrail (the error code and the calling API).

## Symptom → Cause → Action

| Symptom | Cause | Action |
|------|------|------|
| A Glue job gets `AccessDenied` while reading S3 | It has bucket permissions but no permission to use the KMS key | Give the job execution role `kms:Decrypt` (`kms:GenerateDataKey` for writing), and allow that role in the key policy |
| "Insufficient Lake Formation permissions" in Athena | IAM is sufficient but SELECT was not granted in LF | Grant table and column permissions in LF |
| Another account cannot open objects in a shared bucket | The objects are encrypted with an AWS managed key | Encrypt with a customer managed key and allow the other account in the key policy |
| CloudTrail has no record of who deleted an S3 object | Data events were not turned on | Record data events for that bucket in the trail |
| You cannot find the API call record from four months ago | Event history covers only 90 days | Store in S3 with a trail, or use CloudTrail Lake |
| The job succeeded but the dashboard numbers are wrong | Value validity was not checked | A Glue Data Quality gate before loading |
| No alarm fired and the failure was learned of afterward | The failure was left only in logs, not in a metric | Turn the log pattern into a metric with a metric filter, or send job state change events through EventBridge → SNS |
| Only a few Spark tasks never finish | Data skew | Salting, repartitioning |
| KMS throttling and request cost are high on an SSE-KMS bucket | KMS is called for every object | Enable the S3 Bucket Key |
| A sensitive column is visible to all analysts | Only bucket-level permissions exist | LF column permissions and data filters; for Redshift, dynamic data masking |

## Scenario → Answer Decision Table

| Scenario | Decisive cue | Answer |
|------|------|------|
| Pull the list of Glue APIs called by a particular role last month | Who, when, which API | CloudTrail |
| Gather audit events from several accounts in one place and query them with SQL | Centralized, SQL | CloudTrail Lake |
| See when and how a security group rule changed | Configuration change history | AWS Config |
| Find the stack trace of a failed Glue job | Execution log, cause | CloudWatch Logs (Logs Insights) |
| Notify the owner immediately when a job fails | State change, notification | EventBridge rule → SNS |
| Change a DB password automatically every 30 days | Credential rotation | Secrets Manager |
| Each team may see different rows (by region) | Row level | Lake Formation data filter |
| Grant permissions on hundreds of tables at once by classification | Tag-based, scalability | LF-Tag based access control |
| Call center staff see only the last four digits of the card number (Redshift) | Role-based hiding at query time | Dynamic data masking |
| Convert the email column to a hash before loading into the lake | Processing during ETL | Glue sensitive data detection transform |
| Audit key usage and let only a specific role decrypt | Key policy, auditing | SSE-KMS customer managed key |
| Another account queries the production cluster's data without copying (Redshift) | Live sharing, no copy | Redshift data sharing |

Tomorrow we match the real exam pace with comprehensive scenarios that mix all four domains.

## 📖 Glossary

- **Management events / data events**: Calls that create and change resources, versus calls that read and write the data inside resources. CloudTrail records only the former by default.
- **Metric filter**: A setting that turns the number of times a particular pattern appears in a log into a CloudWatch metric. It is the path for putting an alarm on logs.
- **Data skew**: A phenomenon where data piles up on particular keys so that only some tasks slow down or fail.
- **Salting**: A technique that appends a random value to a skewed key to spread it across several partitions.
- **Key policy**: The resource-based policy attached to a KMS key. It decides who can encrypt and decrypt with that key.
- **Envelope encryption**: A method where data is encrypted with a data key and the data key is encrypted with a KMS key. This is how SSE-KMS works.
- **S3 Bucket Key**: A bucket-level key used briefly in SSE-KMS so that KMS is not called for every object. It reduces KMS request cost.
- **Data filter**: In Lake Formation, a definition of which rows and columns to show a principal. It is the unit of row-, column-, and cell-level security.
- **Dynamic data masking**: A method that leaves the stored value as is and shows masked results depending on who is querying.
- **Hybrid access mode**: A Lake Formation setting that keeps both the Lake Formation permission path and the IAM permission path on the same catalog resource.

## 📝 Practice Questions

**Question 1.** A team wants to run its existing Apache Airflow DAGs as a managed service on AWS with almost no modification. Which service is the most suitable?

A) AWS Step Functions  
B) Amazon EventBridge Scheduler  
C) AWS Batch  
D) Amazon MWAA  

**Answer: D**  
Explanation: Amazon MWAA (Managed Workflows for Apache Airflow) is managed Airflow and can run existing DAGs almost as they are. Step Functions is based on state machines and uses a different syntax from DAGs, and EventBridge and Batch are not Airflow-compatible workflow engines.

---

**Question 2.** A security audit requires the ability to trace "when a specific IAM user called which Glue API." Which service is the most suitable?

A) Amazon CloudWatch Alarm  
B) AWS CloudTrail  
C) AWS X-Ray  
D) Amazon Macie  

**Answer: B**  
Explanation: CloudTrail is an audit logging service that records API calls in the account (who, when, and what). CloudWatch Alarms notify on metric thresholds, X-Ray provides distributed tracing, and Macie detects sensitive data, so their purposes differ.

---

**Question 3.** You must encrypt data stored in S3 and also need key rotation, per-key access control, and auditing of key usage. Which approach is the most suitable?

A) Do not encrypt and just keep the bucket private  
B) SSE-S3 (S3-managed keys)  
C) SSE-KMS (customer managed KMS key)  
D) The client uploads in plaintext and protection relies on IAM only  

**Answer: C**  
Explanation: With SSE-KMS, a customer managed key (CMK) controls access through the key policy, supports automatic rotation, and allows key usage to be audited with CloudTrail. SSE-S3 offers limited key control and auditing, and the other options do not meet the encryption requirement.

---

**Question 4.** There is compliance risk because it is unclear where and how much customer PII exists across multiple S3 buckets. You want to automatically discover and classify the sensitive data. Which service is the most suitable?

A) Amazon Macie  
B) AWS Config  
C) Amazon GuardDuty  
D) AWS Trusted Advisor  

**Answer: A**  
Explanation: Amazon Macie uses machine learning to automatically discover and classify sensitive data such as PII and financial information in S3. Config tracks resource configuration, GuardDuty detects threats, and Trusted Advisor checks best practices, so none of them can classify sensitive data.

---

**Question 5.** You want a Glue ETL job to automatically validate before loading that "order_id is not empty, amount is greater than or equal to 0, and order_id is nearly unique," and to quarantine data that violates the rules. Which feature is the most suitable?

A) CloudWatch Logs Insights  
B) S3 lifecycle policy  
C) Redshift VACUUM  
D) Glue Data Quality rules (DQDL)  

**Answer: D**  
Explanation: Glue Data Quality lets you define and validate rules such as completeness (IsComplete), validity (ColumnValues), and uniqueness (Uniqueness) with DQDL, and can quarantine data that violates them. The others are for log queries, storage management, and table cleanup, and are not data quality validation features.

---
