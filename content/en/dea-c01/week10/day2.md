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

## 📝 연습 문제

**문제 1.** 한 팀이 기존에 사용하던 Apache Airflow DAG을 거의 수정 없이 AWS에서 관리형으로 운영하고자 한다. 가장 적합한 서비스는?

A) AWS Step Functions  
B) Amazon EventBridge Scheduler  
C) AWS Batch  
D) Amazon MWAA  

**정답: D**  
해설: Amazon MWAA(Managed Workflows for Apache Airflow)는 관리형 Airflow로 기존 DAG을 거의 그대로 운영할 수 있습니다. Step Functions는 상태 기계 기반으로 DAG 문법이 다르고, EventBridge·Batch는 Airflow 호환 워크플로 엔진이 아닙니다.

---

**문제 2.** 보안 감사 결과 "특정 IAM 사용자가 언제 어떤 Glue API를 호출했는지" 추적할 수 있어야 한다는 요구가 나왔다. 가장 적합한 서비스는?

A) Amazon CloudWatch Alarm  
B) AWS CloudTrail  
C) AWS X-Ray  
D) Amazon Macie  

**정답: B**  
해설: CloudTrail은 계정 내 API 호출(누가·언제·무엇을)을 기록하는 감사 로그 서비스입니다. CloudWatch Alarm은 지표 임계치 알림, X-Ray는 분산 추적, Macie는 민감정보 탐지로 목적이 다릅니다.

---

**문제 3.** S3에 저장하는 데이터를 암호화하되 키 회전, 키별 접근 통제, 키 사용 내역 감사가 모두 필요하다. 가장 적합한 방식은?

A) 암호화하지 않고 버킷을 프라이빗으로만 둔다  
B) SSE-S3(S3 관리형 키)  
C) SSE-KMS(고객 관리 KMS 키)  
D) 클라이언트가 평문으로 업로드 후 IAM으로만 보호  

**정답: C**  
해설: SSE-KMS의 고객 관리 키(CMK)는 키 정책으로 접근을 통제하고 자동 회전을 지원하며 CloudTrail로 키 사용을 감사할 수 있습니다. SSE-S3는 키 통제·감사가 제한적이고, 나머지는 암호화 요구를 충족하지 못합니다.

---

**문제 4.** 여러 S3 버킷에 고객 PII가 어디에 얼마나 있는지 파악되지 않아 컴플라이언스 위험이 있다. 민감 데이터를 자동으로 발견·분류하려 한다. 가장 적합한 서비스는?

A) Amazon Macie  
B) AWS Config  
C) Amazon GuardDuty  
D) AWS Trusted Advisor  

**정답: A**  
해설: Amazon Macie는 머신러닝으로 S3 내 PII·금융정보 등 민감 데이터를 자동 발견·분류합니다. Config는 리소스 구성 추적, GuardDuty는 위협 탐지, Trusted Advisor는 모범 사례 점검으로 민감정보 분류 기능이 없습니다.

---

**문제 5.** Glue ETL 잡이 적재 전에 "order_id가 비어 있지 않고 amount가 0 이상이며 order_id가 거의 고유한지"를 자동 검증하고, 규칙 위반 데이터는 격리하려 한다. 가장 적합한 기능은?

A) CloudWatch Logs Insights  
B) S3 수명주기 정책  
C) Redshift VACUUM  
D) Glue Data Quality 규칙(DQDL)  

**정답: D**  
해설: Glue Data Quality는 DQDL로 완전성(IsComplete)·유효성(ColumnValues)·고유성(Uniqueness) 등 규칙을 정의해 검증하고 위반 데이터를 격리할 수 있습니다. 나머지는 로그 조회·스토리지 관리·테이블 정리 용도로 품질 검증 기능이 아닙니다.

---
