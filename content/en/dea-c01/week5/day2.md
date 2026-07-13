# Day 2 - Lambda Transformation and Lightweight Processing: Event-Driven ETL's Limits and Fit

If EMR and Glue are "heavy engines for distributed large-scale processing," **AWS Lambda** is the opposite philosophy. No servers running, tiny code snippets execute the instant an event fires, then vanish. In data engineering, Lambda isn't "massive transformation"—it's "lightweight, instant, event-reactive transformation."

Today's core question is simple: **when is Lambda appropriate, and when isn't it?** Wrong Lambda choices hit time and memory walls, causing mid-task failure. Understanding that boundary precisely is critical for exams and real work.

## Lambda's Essence: Event-Driven, Stateless, Short-Lived

Lambda is defined by three traits.

| Trait | Meaning |
|-------|---------|
| Event-driven | S3 PUT, Kinesis records, SQS messages etc. trigger the function |
| Stateless | Each invocation runs independently; no persistent in-memory state |
| Short-lived | Max 15 minutes execution then forced termination |

Lambda shines in data pipelines with **S3 event-based transformation**. A new file lands on S3, Lambda triggers instantly to transform, validate, and route it.

```python
# Lambda triggered by S3 file arrival: JSON → clean → different bucket
import json
import boto3

s3 = boto3.client("s3")

def lambda_handler(event, context):
    for record in event["Records"]:
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]

        obj = s3.get_object(Bucket=bucket, Key=key)
        data = json.loads(obj["Body"].read())

        # Lightweight transform: field cleaning and validation
        cleaned = [r for r in data if r.get("amount", 0) > 0]

        s3.put_object(
            Bucket="curated-bucket",
            Key=f"cleaned/{key}",
            Body=json.dumps(cleaned),
        )
    return {"processed": len(event["Records"])}
```

This pattern is powerful because **idle cost is zero**. No files, no execution, no charge. No need to keep Glue clusters running all night—process files only when they arrive, charged per 100ms.

> 💡 **Related Theory**: Lambda is the canonical **FaaS (Function as a Service)** implementation, the apex of compute abstraction. Compute progresses: physical servers → VMs (EC2) → containers (ECS) → functions (Lambda), with management units shrinking from "machines" to "code snippets." Higher abstraction cuts operational burden but adds runtime environment constraints and execution limits. Lambda's 15-minute cap is the direct result of this tradeoff.

## Lambda's Limits: Time, Memory, Payload

When using Lambda for ETL, memorize these hard limits. They determine suitability.

| Item | Limit | Implication |
|------|-------|-------------|
| Max execution time | 15 minutes | Long-running large-scale processing impossible |
| Memory | 128MB ~ 10,240MB(10GB) | Data too large for memory is unfit |
| /tmp temp disk | 512MB ~ 10GB | Large file buffering has limits |
| Sync payload | 6MB (request/response) | Large data needs S3 transit |
| Deployment package | 50MB (zipped) / 250MB (unzipped) | Large libraries need container images (10GB) |

Lambda's CPU is allocated proportional to memory. Raise memory and CPU rises too. Slow CPU-bound work gets faster via more memory, sometimes lowering total cost. This is Lambda's core cost-tuning insight.

> ⚠️ **Gotcha**: If you pick Lambda for "aggregate 100GB daily logs from S3," you'll be wrong. A single invocation with 15-min and 10GB memory limits can't handle massive data at once. Huge batch jobs need Glue or EMR. Lambda is strictly for "small file unit, short transform."

## Fit vs Unfit: Lambda Use Cases

Draw the line clearly.

**Fit**
- Immediate transform/validate/convert small-to-medium files arriving on S3
- Lightweight real-time processing of Kinesis/DynamoDB Streams records
- Trigger, route, notify "glue" code between pipeline stages
- Short work fetching external data via API
- Firehose record-level transform (per-record)

**Unfit**
- Processing longer than 15 minutes
- Single-shot handling of massive data (tens GB+) that won't fit memory
- Complex shuffle and join for large-scale distributed aggregation
- Stateful windowed aggregation requiring accumulated state (→ Flink)

```python
# Kinesis Firehose transform Lambda: transform records, return status
import base64
import json

def lambda_handler(event, context):
    output = []
    for record in event["records"]:
        payload = json.loads(base64.b64decode(record["data"]))
        payload["processed_at"] = context.aws_request_id
        transformed = base64.b64encode(
            (json.dumps(payload) + "\n").encode("utf-8")
        ).decode("utf-8")
        output.append({
            "recordId": record["recordId"],
            "result": "Ok",
            "data": transformed,
        })
    return {"records": output}
```

Firehose transform must return `recordId` and `result` (Ok/Dropped/ProcessingFailed) for each record. Firehose needs to track per-record success/failure.

> 🔍 **Deeper Dive**: Lambda's first invocation is slow due to **cold start** — spinning up a fresh execution environment (container). Later invocations reuse the warm environment and are faster. Data pipelines aren't usually sensitive to this latency, but if latency matters, **Provisioned Concurrency** can pre-warm environments. VPC-attached Lambda used to suffer long cold starts, but ENI improvements have greatly mitigated it.

## Concurrency and Throughput: Flow in Parallel

Lambda's strength is **automatic horizontal scaling**. If 1,000 files land on S3 simultaneously, Lambda can invoke up to 1,000 instances in parallel (within account limits). For "many small file transforms," you get near-infinite parallelism without distributed clusters.

Protect downstreams via **Reserved Concurrency** or **function concurrency limits**. Without caps, Lambda invoking thousands of times to RDS kills the DB with connection storms.

```bash
# Cap concurrent function executions to 50 to protect downstream DB
aws lambda put-function-concurrency \
  --function-name s3-transform \
  --reserved-concurrent-executions 50
```

> 🎯 **Scenario**: Thousands of IoT devices endlessly upload tiny JSON files to S3. Each under 1MB, transform is just cleaning. Optimal architecture: (1) **S3 event → Lambda** trigger transforms instantly, (2) save transformed Parquet to curation bucket, (3) **Reserved Concurrency** limits downstream load, (4) failures isolated to **DLQ (SQS)** for reprocessing. Zero idle cost, auto-scales with traffic. If files grow massive or complex aggregation needed, switch to Glue/EMR.

## Error Handling: Retries and DLQ

Lambda's retry behavior depends on invocation type. Async invocations (S3 events) retry up to 2 times by default, and if still failing, can send failed events to **DLQ (Dead Letter Queue)** or **Lambda Destinations**. Without this, failed events silently vanish—exactly what data pipelines must avoid.

Stream sources (Kinesis/DynamoDB Streams) behave differently. One record failing may block the shard, so options like `BisectBatchOnFunctionError`, `MaximumRetryAttempts`, and failure destination prevent "poison pill" records from halting the entire pipeline.

## Summary

Lambda is a lightweight, event-driven, stateless transform tool with 15-minute cap. Ideal for "small and short" work like S3-arrival instant transform, Firehose record transform, and pipeline glue code. Zero idle cost and auto horizontal scaling are strengths. Large-scale, long-running, complex aggregation must go to Glue/EMR. Memorize limits (time, memory, payload), isolate failures with DLQ—these are reliability's core. Tomorrow we orchestrate multiple processing stages.

---

## 📝 연습 문제

**문제 1.** 매일 S3에 도착하는 단일 200GB 압축 로그 파일을 디코드하고 복잡한 집계를 수행해야 한다. 다음 중 가장 적절하지 않은 선택은?

A) AWS Lambda 단일 함수로 전체 파일을 처리  
B) AWS Glue Spark 작업  
C) Amazon EMR Spark 클러스터  
D) EMR Serverless  

**정답: A**  
해설: 단일 Lambda 호출은 최대 15분·메모리 10GB 한계가 있어 200GB 파일을 한 번에 디코드·집계할 수 없다. 대규모 복잡 집계는 Glue나 EMR(Serverless 포함) 같은 분산 엔진이 적합하다. Lambda는 작은 파일 단위의 짧은 변환에 한정해야 한다.

---

**문제 2.** Kinesis Data Firehose의 데이터 변환 Lambda에서 각 레코드를 반환할 때 반드시 포함해야 하는 필드는?

A) bucket과 key  
B) recordId와 result  
C) timestamp와 shardId  
D) partitionKey만  

**정답: B**  
해설: Firehose 변환 Lambda는 각 레코드에 대해 원본 `recordId`와 처리 `result`(Ok/Dropped/ProcessingFailed), 그리고 변환된 `data`를 반환해야 Firehose가 레코드별 성공·실패를 추적할 수 있다. bucket/key는 S3 이벤트 구조이고 나머지는 무관하다.

---

**문제 3.** Lambda 함수가 CPU 바운드 작업으로 자주 타임아웃에 가깝게 느리게 동작한다. 비용까지 함께 개선할 수 있는 1차적 튜닝은?

A) 메모리 할당을 늘려 비례 증가하는 CPU로 실행 시간을 단축한다  
B) 동시성을 0으로 설정한다  
C) /tmp 디스크를 512MB로 줄인다  
D) 페이로드 크기를 6MB 이상으로 늘린다  

**정답: A**  
해설: Lambda는 메모리에 비례해 CPU가 할당되므로, CPU 바운드 작업은 메모리를 늘리면 실행 시간이 단축되고 때로는 총비용까지 감소한다. 동시성을 0으로 하면 함수가 실행되지 않고, 페이로드 한계는 6MB이며 이를 늘릴 수 없다.

---

**문제 4.** S3 이벤트로 비동기 트리거되는 Lambda가 간헐적으로 실패한다. 실패 이벤트가 조용히 유실되지 않도록 보장하는 가장 적절한 방법은?

A) 함수 메모리를 최대로 설정  
B) DLQ(SQS) 또는 Lambda Destinations로 실패 이벤트를 격리  
C) 동기 호출로 전환  
D) Reserved Concurrency를 0으로 설정  

**정답: B**  
해설: 비동기 호출은 기본 재시도 후에도 실패하면 이벤트가 사라질 수 있으므로, DLQ(SQS/SNS)나 Lambda Destinations로 실패 이벤트를 격리해 재처리·조사할 수 있게 해야 한다. 메모리 증가나 동기 전환은 유실 방지의 본질적 해법이 아니다.

---

**문제 5.** 다음 중 Lambda 기반 변환이 가장 적합한 워크로드는?

A) 수십 GB를 메모리에 올려 복잡한 셔플 조인을 수행하는 배치  
B) 사용자 세션 단위로 상태를 누적하는 장시간 윈도우 집계  
C) S3에 도착하는 1MB 미만 파일을 즉시 정제·포맷 변환하는 이벤트 기반 처리  
D) 30분 이상 걸리는 대규모 머신러닝 학습  

**정답: C**  
해설: Lambda는 이벤트 기반·무상태·짧은 수명에 최적이라, 작은 파일이 S3에 도착하는 즉시 정제·변환하는 워크로드에 이상적이다. 대용량 셔플 조인(Glue/EMR), stateful 윈도우 집계(Flink), 장시간 ML 학습(EMR/SageMaker)은 모두 15분·메모리 한계로 Lambda에 부적합하다.

---
