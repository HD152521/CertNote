# Day 2 - Integrated Review of Domains 3 & 4: Operations & Support, Security & Governance

Yesterday we reviewed the data flow through the pipeline. Today we tie together the two domains that keep that pipeline **reliably running** (Domain 3, ~22%) and **safely protected** (Domain 4, ~18%). These two domains frequently appear as operational scenarios: "How do you know if something failed and recover?" and "Who can access data and how is it encrypted?"

## Domain 3: Orchestration

Orchestration is stitching together multiple tasks in the right order with dependencies.

| Requirement | Service | Characteristic |
|---------|--------|------|
| Data workflow scheduling & dependencies (Airflow-like) | Amazon MWAA | Managed Apache Airflow, DAG-based |
| Serverless state machine, visual branching & retry | AWS Step Functions | Coordinate Lambda/Glue/EMR + branching/retry |
| Glue-only jobs and workflows | Glue Workflows | Native Glue triggers and orchestration |
| Simple cron-based time trigger | EventBridge Scheduler | Time-driven events |

> 💡 **Related theory**: If you want to reuse existing Airflow DAGs unchanged, MWAA is your answer. If you need to orchestrate heterogeneous AWS services (Lambda, ECS, Glue) with branching, retry, and parallelism, Step Functions is the choice. For Glue jobs alone, Glue Workflows is sufficient.

## Domain 3: Monitoring and Logging

- **CloudWatch Metrics/Alarms**: Alert on job failure rate, latency, resource utilization thresholds.
- **CloudWatch Logs**: Aggregate and search Glue, Lambda, EMR execution logs with Logs Insights queries.
- **CloudTrail**: Audit log of API calls (who, what, when). Bridges security and governance.
- **EventBridge**: React to job state changes — alert or trigger downstream actions.

```text
Pipeline observability trinity:
- Metric   → CloudWatch Alarm "alert when threshold exceeded"
- Log      → CloudWatch Logs Insights "trace root cause"
- Audit    → CloudTrail "who called this API"
```

> 💡 **Related theory**: Root-cause troubleshooting → CloudWatch Logs; threshold-based alerts → CloudWatch Alarm; API call tracking → CloudTrail. Keeping these three distinct is a Domain 3 scoring point.

## Domain 3: Data Quality

- **Glue Data Quality**: Define rules (DQDL) on a dataset to validate completeness, validity, and uniqueness. Halt the job or quarantine violating rows on rule failure.
- **DataBrew**: Visual profiling to spot missing values, anomalies, and distributions.
- **Idempotence & retry**: Design jobs to be idempotent so safe re-processing after failure.

```python
# Glue Data Quality rule (DQDL) example
ruleset = """
Rules = [
   IsComplete "order_id",
   ColumnValues "amount" >= 0,
   Uniqueness "order_id" > 0.99
]
"""
# Pass rules → load; fail → quarantine bucket
```

## Domain 4: Authentication & Authorization (IAM)

- **IAM Roles**: Grant services (Glue, EMR, Lambda) minimum-privilege permissions. Never hardcode human credentials in code.
- **Principle of Least Privilege**: Allow only the actions and resources needed. Avoid `*` wildcards.
- **Resource-based policies**: S3 bucket policies, KMS key policies — permissions from the resource side.
- **Lake Formation permissions vs IAM**: Data lake data access → Lake Formation; service/API operational permissions → IAM.

> 💡 **Related theory**: "A Glue job needs to access S3 and KMS" → grant those permissions to the job's IAM execution role. Hardcoding access keys in the script is always wrong.

## Domain 4: Encryption (KMS)

- **At-rest encryption**: S3 (SSE-KMS/SSE-S3), Redshift, RDS, EBS — all support KMS encryption.
- **In-transit encryption**: TLS/HTTPS.
- **SSE-KMS vs SSE-S3**: Use SSE-KMS if you need key rotation, per-key access control, and key-usage audit. Use SSE-S3 for simple, AWS-managed encryption.
- **Customer-Managed Keys (CMK)**: Fine-grained access via key policy; audit key usage with CloudTrail.

| Keyword | Answer |
|--------|------|
| Key rotation, per-key access control, audit required | SSE-KMS (customer-managed key) |
| Simplest managed encryption | SSE-S3 |
| Client encrypts before upload | Client-side encryption |

## Domain 4: Sensitive Data Detection & Protection

- **Amazon Macie**: Machine learning finds **PII** (personally identifiable information), credit card numbers, and other sensitive data in S3 automatically and classifies them. Solves "we don't know where our PII is."
- **Masking/tokenization**: Glue, Athena, Redshift Dynamic Data Masking hides sensitive columns from output.
- **Data classification chain**: Find (Macie) → classify → grant access (Lake Formation) → encrypt (KMS).

> 💡 **Related theory**: When you see "sensitive data scattered across S3, auto-find and classify," the answer is Amazon Macie. Remember the division of labor: Macie finds/classifies; Lake Formation/IAM control access; KMS and masking protect the data.

## Operations & Security Pipeline

1. **Operations**: MWAA/Step Functions orchestrate the pipeline → CloudWatch tracks metrics/logs → Alarm on failure → auto-retry.
2. **Quality**: Glue Data Quality validates before load, quarantines violating rows.
3. **Security**: IAM role least-privilege → KMS encrypts at rest and in transit.
4. **Governance**: Macie finds sensitive data → Lake Formation grants fine-grained access → CloudTrail audits all calls.

## Key Takeaways

- Orchestration: Airflow-as-is → MWAA; heterogeneous coordination → Step Functions; Glue-only → Glue Workflows.
- Monitoring trinity: metric/alarm, log/insights, audit/CloudTrail — each has its role.
- Data quality: Glue Data Quality (DQDL) rules validate and quarantine.
- Permissions: IAM role least-privilege; data lake access granularity → Lake Formation.
- Encryption: KMS for control/audit (SSE-KMS); Macie for PII auto-discovery.

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
