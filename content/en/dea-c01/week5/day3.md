# Day 3 - Orchestration: Step Functions, MWAA, and Glue Workflows Selection Criteria

Until now, each tool (Glue, EMR, Lambda) does "one thing." But real data pipelines aren't single tasks — they're "receive data from S3 → transform via Glue → pass validation Lambda → on failure send alert → on success load to Redshift," multiple stages linked by order, conditions, and retries. Defining and coordinating this flow is **orchestration**.

Without orchestration, you trigger jobs manually or via cron and manually dig through logs on failure before rerunning. An orchestrator defines work flow as code, automatically managing dependencies, retries, branching, parallelism, and alerts. AWS offers three main choices, and exams persistently ask "which tool for this situation."

## Orchestration's Core Concept: DAG

All three tools express work flow as **DAG (Directed Acyclic Graph)**. Work is nodes, dependencies are arrows, no cycles — A can't wait for B while B waits for A (no deadlock).

```
Extract ──► Transform ──┬──► Load ──► Alert
                        └──► Quality Check ──► Isolate on Failure
```

> 💡 **Related Theory**: DAG became orchestration's universal model because **topological sorting** is possible. Acyclic graphs let you order work as "all dependencies met," and independent work runs safely in parallel. Cycles make starting point undefined, sorting impossible. That Airflow, Step Functions, and Glue Workflows all chose DAG is no accident—it's this mathematical property.

## AWS Step Functions: Serverless State Machine

**Step Functions** is a serverless workflow orchestrator. Workflows are defined as **state machines**, each step is a Lambda call, Glue job, ECS task, wait, Choice (branching), Parallel, Map, etc. JSON-based **ASL (Amazon States Language)** describes the flow.

```json
{
  "Comment": "ETL pipeline",
  "StartAt": "RunGlueJob",
  "States": {
    "RunGlueJob": {
      "Type": "Task",
      "Resource": "arn:aws:states:::glue:startJobRun.sync",
      "Parameters": { "JobName": "daily-transform" },
      "Retry": [{
        "ErrorEquals": ["States.ALL"],
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }],
      "Next": "ValidateData"
    },
    "ValidateData": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:function:validate",
      "Next": "CheckResult"
    },
    "CheckResult": {
      "Type": "Choice",
      "Choices": [{
        "Variable": "$.isValid", "BooleanEquals": true,
        "Next": "LoadToRedshift"
      }],
      "Default": "NotifyFailure"
    },
    "LoadToRedshift": { "Type": "Task", "Resource": "...", "End": true },
    "NotifyFailure": { "Type": "Task", "Resource": "...", "End": true }
  }
}
```

The key is **`.sync` integration**. `glue:startJobRun.sync` starts a Glue job and waits for completion. No polling code needed. Retries (`Retry`), error handling (`Catch`), branching (`Choice`) — all declarative.

Step Functions has two workflow types.

| Type | Characteristics | Use |
|------|-----------------|-----|
| Standard | Up to 1 year execution, exactly-once, per-step billing | Long-term, durability-critical ETL |
| Express | Up to 5 minutes, high-frequency bulk, execution-time billing | Fast event stream processing |

> 🎯 **Scenario**: "Glue job → validate → conditional load → failure alert" with AWS services, branching, retries, and no infrastructure desired. Answer: **Step Functions Standard**. Native integration with Glue/Lambda/SNS, branching via `Choice`, error handling via `Retry`/`Catch` declarations, serverless. Visual workflow console shows execution history at a glance.

## Amazon MWAA: Managed Apache Airflow

**MWAA (Managed Workflows for Apache Airflow)** is the managed version of open-source **Apache Airflow**. Airflow is the de facto standard orchestrator in data engineering, defining **DAGs in Python code**.

```python
# Airflow DAG: ETL flow defined in Python
from airflow import DAG
from airflow.providers.amazon.aws.operators.glue import GlueJobOperator
from datetime import datetime

with DAG("daily_etl", start_date=datetime(2026, 6, 1),
         schedule_interval="0 2 * * *", catchup=False) as dag:

    transform = GlueJobOperator(
        task_id="transform",
        job_name="daily-transform",
    )
    # >> operator defines dependencies
    transform  # connects to downstream task
```

MWAA excels at **complex dependencies, rich operator ecosystem, dynamic DAG generation in Python, multi-cloud/on-prem hybrid**. Airflow's hundreds of providers let you orchestrate AWS, Snowflake, GCP, Databricks, on-prem DBs in one DAG. Teams migrating from on-prem Airflow to AWS find it natural.

But MWAA **isn't serverless**. Environments (workers/scheduler) run continuously, incurring idle costs, and you manage environment class (small/medium/large) and worker scaling. Higher operational burden and cost than Step Functions.

> 🔍 **Deeper Dive**: Airflow's `schedule_interval` and `catchup` are common traps. `catchup=True` (default) **backfills** every schedule period from `start_date` to now. Deploy with past dates and hundreds of runs spike simultaneously. Unintended backfill is risky—set `catchup=False`. Also, Airflow triggers by "logical date" (end of interval), confusing with intuition.

## Glue Workflows: Glue's Lightweight Orchestration

**Glue Workflows** is built-in orchestration for Glue. Chain Glue **crawlers, jobs, and triggers** into one workflow. Triggers start next steps based on schedule, on-demand, or events (previous job completion).

```
[Schedule Trigger] → Crawler (schema refresh)
                        ↓ (completion event)
                     Glue Job A (transform)
                        ↓ (completion event)
                     Glue Job B (aggregate)
```

Glue Workflows' advantage: **pure Glue pipelines are self-contained without extra services**. If flow is entirely Crawler → Job → Job, no separate orchestrator needed. Disadvantage: **nearly confined to Glue resources**—weak on complex branching logic or orchestrating diverse non-Glue services.

## Which of Three? Decision Criteria

The exam's final judgment table.

| Situation | Choice |
|-----------|--------|
| AWS service-centric, serverless, declarative branching/retries | **Step Functions** |
| Short, high-frequency event processing (under 5 min) | **Step Functions Express** |
| Existing Airflow DAG migration, complex Python logic | **MWAA** |
| Multi-cloud/on-prem hybrid, rich operators needed | **MWAA** |
| Pure Glue crawler/job pipeline, no extra services | **Glue Workflows** |
| Minimize operational burden and idle cost | **Step Functions** or **Glue Workflows** |

Intuitive summary: **Step Functions = AWS native serverless**, **MWAA = standard Airflow, complex, multi-environment**, **Glue Workflows = Glue-only lightweight**.

> ⚠️ **Gotcha**: Memorizing "complex multi-step = MWAA" fails. If the workflow is all AWS services and serverless/low-ops is desired, Step Functions is better. MWAA's decisive clues are "existing Airflow," "multi-cloud/on-prem hybrid," "dynamic DAG in Python." Choosing MWAA just for "many steps" saddled you with heavy operational burden.

## Summary

Orchestration links work in a DAG, automating order, dependencies, retries, and branching. **Step Functions** is AWS native, serverless, declares branching and retries, minimal operations. **MWAA** is standard Airflow, strong on complex Python and multi-environment, but continuous cost and operations follow. **Glue Workflows** is lightweight, pure-Glue pipelines without extra services. Selection hinge on "AWS native, Airflow asset, or Glue-only." Tomorrow we cover file format and partitioning that control pipeline performance and cost.

---

## 📝 Practice Questions

**Question 1.** Multiple tasks are linked by order, conditions, and retries, but a cycle in which a task depends on itself again is not allowed. What is the universal model for expressing such a workflow?

A) Circular linked list  
B) DAG (directed acyclic graph)  
C) Hash table  
D) Binary search tree  

**Answer: B**  
Explanation: Orchestration represents tasks as nodes and dependencies as arrows in a DAG. Because it is acyclic, topological sorting is possible, which determines the execution order and allows independent tasks to run in parallel. If there is a cycle, no starting point can be determined, so sorting is impossible.

---

**Question 2.** A team already operates many Apache Airflow DAGs on premises, and some tasks also coordinate GCP and an in-house database. They want to move this to AWS while reusing their existing DAG assets as much as possible. What is the most suitable option?

A) AWS Glue Workflows  
B) S3 events + Lambda chain  
C) EventBridge scheduler alone  
D) Amazon MWAA  

**Answer: D**  
Explanation: MWAA is managed Apache Airflow, so existing Airflow DAGs can be reused almost as they are, and its rich providers let a single DAG coordinate multiple environments such as GCP and on premises. Glue Workflows is limited to Glue resources, and a Lambda chain or EventBridge alone cannot easily replace complex Airflow assets.

---

**Question 3.** You want to build "run a Glue job → validation Lambda → load into Redshift if validation passes, SNS notification if it fails" in a serverless way, including branching and retries. What is the most suitable option?

A) AWS Step Functions  
B) Amazon MWAA  
C) Trigger each job individually with cron  
D) A single giant Lambda function  

**Answer: A**  
Explanation: Step Functions integrates natively with Glue/Lambda/SNS, expresses Choice (branching) and Retry/Catch (retries and error handling) declaratively, and is serverless, so the operational burden is low. MWAA has ongoing cost and heavy operations, cron has poor dependency and retry management, and a single giant Lambda has the 15-minute limit and visibility problems.

---

**Question 4.** There is a simple pipeline that, after a Glue crawler updates the schema, runs two Glue jobs sequentially upon its completion, and no other AWS services are involved. What is the simplest way to build it without adding any services?

A) Provision a new Amazon MWAA environment  
B) Chain the crawler and jobs with Glue Workflows triggers  
C) Build it with EMR Steps  
D) Connect them with Kinesis Data Streams  

**Answer: B**  
Explanation: Because the entire flow consists of Glue crawlers and jobs, linking them with the triggers of the built-in Glue Workflows (based on completion events) is the simplest and requires no additional services. MWAA is excessive operational burden, and EMR Steps and Kinesis are unrelated to this scenario.

---

**Question 5.** Which statement about Step Functions Standard and Express workflows is correct?

A) Express can run for up to 1 year  
B) Neither has an execution time limit  
C) Standard is suited to long-running (up to 1 year), exactly-once execution, and Express is suited to high-volume, high-frequency event processing of 5 minutes or less  
D) Standard is 5 minutes and Express is unlimited  

**Answer: C**  
Explanation: Standard is suited to long-running, durable ETL with up to 1 year of execution, exactly-once execution, and per-step billing, while Express is suited to fast processing of event streams with up to 5 minutes of execution, high volume and high frequency, and billing by execution duration. The other options misdescribe the execution time characteristics of the two types.

---
