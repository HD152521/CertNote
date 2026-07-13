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

## 📝 연습 문제

**문제 1.** 여러 작업이 순서·조건·재시도로 엮이는데, 한 작업이 다시 자신을 의존하는 순환은 허용되지 않는다. 이런 워크플로를 표현하는 보편 모델은?

A) 순환 연결 리스트  
B) DAG(방향성 비순환 그래프)  
C) 해시 테이블  
D) 이진 탐색 트리  

**정답: B**  
해설: 오케스트레이션은 작업을 노드, 의존성을 화살표로 하는 DAG로 표현한다. 비순환이라 위상 정렬이 가능해 실행 순서를 정하고 독립 작업을 병렬화할 수 있다. 순환이 있으면 시작점을 정할 수 없어 정렬이 불가능하다.

---

**문제 2.** 한 팀이 이미 온프레미스에서 Apache Airflow DAG를 다수 운영 중이며, 일부 작업은 GCP와 사내 DB도 조율한다. 이를 AWS로 옮기되 기존 DAG 자산을 최대한 재사용하려 한다. 가장 적합한 것은?

A) AWS Glue Workflows  
B) S3 이벤트 + Lambda 체인  
C) EventBridge 스케줄러 단독  
D) Amazon MWAA  

**정답: D**  
해설: MWAA는 관리형 Apache Airflow로 기존 Airflow DAG를 거의 그대로 재사용할 수 있고, 풍부한 프로바이더로 GCP·온프레미스 등 멀티 환경을 한 DAG에서 조율한다. Glue Workflows는 Glue 리소스에 국한되고, Lambda 체인이나 EventBridge 단독으로는 복잡한 Airflow 자산을 대체하기 어렵다.

---

**문제 3.** "Glue 작업 실행 → 검증 Lambda → 검증 통과 시 Redshift 적재, 실패 시 SNS 알림"을 분기와 재시도를 포함해 서버리스로 구성하려 한다. 가장 적합한 것은?

A) AWS Step Functions  
B) Amazon MWAA  
C) cron으로 각 작업 개별 트리거  
D) 단일 거대 Lambda 함수  

**정답: A**  
해설: Step Functions는 Glue/Lambda/SNS와 네이티브 통합되고 Choice(분기), Retry/Catch(재시도·에러 처리)를 선언적으로 표현하며 서버리스라 운영 부담이 적다. MWAA는 상시 비용·운영이 크고, cron은 의존성·재시도 관리가 빈약하며, 단일 거대 Lambda는 15분 한계와 가시성 문제가 있다.

---

**문제 4.** Glue 크롤러로 스키마를 갱신한 뒤, 그 완료를 기점으로 Glue 작업 두 개를 순차 실행하는 단순 파이프라인이 있고 다른 AWS 서비스는 끼지 않는다. 추가 서비스 없이 가장 간단히 구성하는 방법은?

A) Amazon MWAA 환경을 새로 프로비저닝  
B) Glue Workflows의 트리거로 크롤러·작업을 체인  
C) EMR Step으로 구성  
D) Kinesis Data Streams로 연결  

**정답: B**  
해설: 흐름이 전부 Glue 크롤러·작업으로 완결되므로 Glue 내장 Glue Workflows의 트리거(완료 이벤트 기반)로 묶으면 추가 서비스 없이 가장 간단하다. MWAA는 과한 운영 부담이고, EMR Step·Kinesis는 이 시나리오와 무관하다.

---

**문제 5.** Step Functions의 Standard와 Express 워크플로에 관한 설명으로 옳은 것은?

A) Express는 최대 1년까지 실행할 수 있다  
B) 둘 다 실행 시간 제한이 없다  
C) Standard는 장기 실행(최대 1년)·정확히 1회 실행에 적합하고, Express는 5분 이내 대량 고빈도 이벤트 처리에 적합하다  
D) Standard는 5분, Express는 무제한이다  

**정답: C**  
해설: Standard는 최대 1년 실행·exactly-once·단계별 과금으로 장기·내구성 ETL에 맞고, Express는 최대 5분·대량 고빈도·실행시간 과금으로 이벤트 스트림 고속 처리에 맞는다. 나머지 보기는 두 타입의 실행 시간 특성을 잘못 기술했다.

---
