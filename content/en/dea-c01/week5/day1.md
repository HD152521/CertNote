# Day 1 - Amazon EMR: Spark, Hive and Cluster Operations, Plus EMR Serverless

Until last week, Glue represented "ETL without worrying about servers." But when data scales into terabytes, when you need complex ML preprocessing or big-data ecosystem tools like Hive, HBase, and Presto, you need greater freedom and control. That's where **Amazon EMR (Elastic MapReduce)** comes in.

EMR is, simply put, a "managed Hadoop/Spark cluster." It automatically provisions and operates open-source big-data frameworks — Apache Spark, Hive, Presto, HBase, Flink — bundled on EC2. If Glue is "an abstracted ETL function," EMR is more like "a distributed computing cluster you operate directly." On exams, the selection criteria between these two are always a hot topic.

## EMR Cluster Structure: Three Node Roles

An EMR cluster is a collection of nodes (EC2 instances), each with a role.

| Node Type | Role | Count |
|-----------|------|-------|
| Primary (Master) | Coordinate cluster, distribute work, manage metadata | 1 (or 3 for HA) |
| Core | Store data (HDFS) + compute simultaneously | 1+ |
| Task | Compute-only, no HDFS storage | 0+ (optional) |

The key distinction: **Core nodes hold HDFS data, Task nodes only compute**. This difference directly affects cost strategy. Task nodes don't store data, so they can disappear without data loss. Therefore, **using spot instances on Task nodes is the safe standard pattern**. Conversely, if you put Core nodes on spot, node reclamation might lose HDFS blocks, requiring recalculation.

> 💡 **Related Theory**: EMR's node distinction comes from Hadoop's **MapReduce architecture**. Hadoop originally followed the **data locality** principle: perform computation on nodes where data lives — "move compute to data." Moving massive data over the network costs far more than sending small code to where data resides. Core nodes handling both storage and compute trace this principle.

## Spark on EMR: In-Memory Distributed Processing

The most widely used engine on EMR is **Apache Spark**. Spark's essence is keeping intermediate results in memory, not disk. Unlike traditional MapReduce, which writes and reads intermediate results to HDFS at each stage, Spark processes in memory—making it tens of times faster for iterative operations (ML, graphs).

```python
# EMR Spark: Read from S3, transform, save as Parquet
from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("daily-etl").getOrCreate()

df = spark.read.json("s3://raw-bucket/events/2026/06/26/")
result = (df
    .filter(df.amount > 0)
    .groupBy("region", "product_id")
    .agg({"amount": "sum"})
    .withColumnRenamed("sum(amount)", "total_sales"))

result.write.mode("overwrite").parquet("s3://curated-bucket/sales/")
```

Spark's speed also comes from **lazy evaluation**. Transformations like `filter` and `groupBy` aren't executed immediately; they accumulate as an execution plan (DAG). Only when an action like `write` or `count` is called does Spark optimize the entire DAG and run it once. This lets you merge or skip unnecessary intermediate steps.

> 🔍 **Deeper Dive**: Spark's underlying data structure is the **RDD (Resilient Distributed Dataset)**. "Resilient" because each RDD remembers its lineage — how it was created. If a node dies and some partitions vanish, you can recalculate just those partitions following the lineage. No need to checkpoint everything; faults are tolerated smartly. DataFrame and SQL are higher-level abstractions layered on RDD.

## EMR Storage: HDFS vs EMRFS

EMR can use two storage tiers.

| Storage | Location | Characteristics |
|---------|----------|-----------------|
| HDFS | Local disk on Core nodes | Fast but vanishes when cluster terminates (temporary) |
| EMRFS | S3 | Permanent storage, separate from cluster, compute-storage separation |

Modern EMR best practice: **use EMRFS (S3) as permanent storage**. With data on S3, you can spin up the cluster when needed and tear it down when done (transient cluster). Compute and storage separate—no need to keep the cluster running 24/7, just pay when working. HDFS is only for performance-critical temporary storage like shuffle intermediate results or repeated operation scratchpad.

> ⚠️ **Gotcha**: If you think "EMR = permanently store data in HDFS," you'll fail exams. When you terminate a transient cluster, HDFS disappears. Permanent data must go to S3 (EMRFS); this is the core of cost optimization.

## Cluster Purchase Options: On-Demand vs Spot vs Instance Fleets

Cost is half of EMR exam questions. The key is which pricing model to use for nodes.

- **On-Demand**: Full price, never reclaimed. Suitable for Primary/Core nodes needing stability.
- **Spot instances**: Up to 90% cheaper but AWS can terminate within 2 minutes if capacity is needed. **Perfect for Task nodes**.
- **Reserved/Savings Plans**: Cost savings for long-term always-on clusters.

EMR offers two ways to define node groups.

| Approach | Description |
|----------|-------------|
| Instance Groups | Single instance type per group (traditional) |
| Instance Fleets | Multiple instance types and purchase options per group, flexible capacity fallback |

**Instance Fleets** lets you list multiple candidates: "if m5.xlarge spot is unavailable, use m5.2xlarge or c5.xlarge instead." This resilience to spot reclamation is the modern recommended approach for spot-heavy clusters.

> 🎯 **Scenario**: A large batch ETL runs only 1-2 hours at 2 AM daily. Cost-optimal setup: (1) **Transient cluster** spins up at start, auto-terminates at end, (2) data **permanently on S3 (EMRFS)**, (3) Primary and Core nodes **on-demand** for stability, (4) Task nodes **Instance Fleets + spot** for cheap compute scaling. Submit work via **EMR Steps**, auto-terminate cluster on last step completion.

## EMR Serverless: Eliminate the Cluster Itself

If deciding cluster size, choosing node types, and planning spot strategy sounds burdensome, **EMR Serverless** is the answer. No cluster provisioning—submit a Spark or Hive app and EMR auto-provisions workers, runs it, and reclaims them. You pay only for vCPU, memory, and time used.

```bash
# Submit a Spark job to EMR Serverless app
aws emr-serverless start-job-run \
  --application-id 00abc123 \
  --execution-role-arn arn:aws:iam::111122223333:role/emr-serverless-role \
  --job-driver '{
    "sparkSubmit": {
      "entryPoint": "s3://scripts/daily-etl.py"
    }
  }'
```

EMR Serverless suits sporadic or hard-to-predict workloads, and when you don't want to spend time sizing and tuning clusters. Conversely, if you need resident services like HBase or must keep clusters on 24/7 for fine-tuning, traditional EMR on EC2 is right.

## When Glue, When EMR?

This is the exam's critical decision point.

| Situation | Choice |
|-----------|--------|
| Serverless ETL, quick dev, DPU-unit billing | **Glue** |
| Brief, sporadic ETL, minimal operations | **Glue** or **EMR Serverless** |
| Large-scale (TB+) complex processing, fine Spark tuning needed | **EMR** |
| Diverse big-data ecosystem tools (Hive/HBase/Presto/Flink) | **EMR** |
| Extreme cost control via spot, full cluster control | **EMR** |
| Large-scale ML preprocessing, custom libraries | **EMR** |

In summary: **Glue is simple, fast, serverless ETL**; **EMR is scale, control, framework diversity**. If "minimal operations overhead" is emphasized, lean Glue. If "cost control and big-data framework choice" is emphasized, lean EMR.

## Summary

EMR is a managed big-data cluster where the Core/Task node distinction is key to spot cost strategy. Store data permanently on S3 (EMRFS) to separate compute from storage, use transient clusters to cut costs. If cluster operations seem burdensome, use EMR Serverless. Glue vs EMR is a balance between "operational simplicity" and "control and scale." Tomorrow we cover a lighter transform tool: Lambda.

---

## 📝 연습 문제

**문제 1.** EMR 클러스터에서 비용을 절감하기 위해 스팟 인스턴스를 적용하려 한다. 데이터 손실 위험 없이 스팟을 쓰기에 가장 적합한 노드는?

A) Primary(마스터) 노드  
B) Core 노드  
C) Task 노드  
D) 모든 노드에 동일하게  

**정답: C**  
해설: Task 노드는 HDFS 데이터를 저장하지 않고 연산만 수행하므로, 스팟 회수로 갑자기 사라져도 데이터 손실이 없다. Core 노드는 HDFS 블록을 보관하므로 스팟 회수 시 데이터 재계산이 필요할 수 있고, Primary는 클러스터 조정을 담당해 사라지면 전체가 멈춘다.

---

**문제 2.** 매일 새벽에 1~2시간만 도는 대규모 배치 ETL을 가장 비용 효율적으로 EMR에서 운영하려 한다. 적절하지 않은 설계는?

A) 작업이 끝나면 자동 종료되는 Transient 클러스터 사용  
B) 데이터를 S3(EMRFS)에 영구 저장  
C) 영구 데이터를 Core 노드의 HDFS에 보관하고 클러스터를 계속 켜둔다  
D) Task 노드를 Instance Fleets + 스팟으로 확장  

**정답: C**  
해설: HDFS는 클러스터 종료 시 소멸하는 임시 저장소이고, 클러스터를 계속 켜두면 간헐적 작업에 비해 비용이 크다. 영구 데이터는 S3(EMRFS)에 두고 Transient 클러스터로 작업 시에만 띄우는 것이 정석이다. 나머지는 모두 올바른 비용 최적화 패턴이다.

---

**문제 3.** Apache Spark가 전통 MapReduce보다 반복 연산(머신러닝 등)에서 훨씬 빠른 핵심 이유는?

A) 모든 데이터를 항상 HDFS에 저장하기 때문  
B) 중간 결과를 메모리에 유지하고 지연 평가로 DAG를 최적화하기 때문  
C) 단일 노드에서만 실행되기 때문  
D) 데이터를 압축하지 않기 때문  

**정답: B**  
해설: Spark는 단계마다 디스크에 쓰는 MapReduce와 달리 중간 결과를 인메모리로 유지하고, 변환을 지연 평가하여 액션 시점에 전체 실행 계획(DAG)을 최적화한다. 이 두 특성이 반복 연산 성능의 핵심이다. Spark는 분산 처리 엔진이며 HDFS·S3 등 다양한 스토리지를 쓴다.

---

**문제 4.** 운영팀이 클러스터 사이징과 스팟 전략을 관리할 인력이 없고, 워크로드는 간헐적이며 예측이 어렵다. 클러스터 프로비저닝 없이 Spark 작업을 제출하고 사용량만큼 과금받고 싶다. 가장 적합한 것은?

A) EMR Serverless  
B) EMR on EC2 (Instance Groups, 24시간 상시)  
C) Redshift  
D) DynamoDB  

**정답: A**  
해설: EMR Serverless는 클러스터를 직접 띄우지 않고 Spark/Hive 애플리케이션을 제출하면 필요한 워커를 자동 프로비저닝·회수하며 사용한 vCPU·메모리·시간만큼 과금한다. 간헐적·예측 불가 워크로드와 운영 최소화 요구에 부합한다. EMR on EC2 상시 클러스터는 운영 부담과 유휴 비용이 크다.

---

**문제 5.** 다음 중 Glue 대신 EMR을 선택할 가장 타당한 이유는?

A) 가장 빠르게 서버리스로 단순 ETL을 개발하고 싶다  
B) Hive, HBase, Presto 등 다양한 빅데이터 생태계 도구를 함께 쓰고 Spark를 세밀히 튜닝하며 스팟으로 비용을 극단적으로 제어해야 한다  
C) 운영 오버헤드를 최소화하고 인프라를 전혀 다루고 싶지 않다  
D) DPU 단위의 자동 과금만 원한다  

**정답: B**  
해설: EMR은 다양한 빅데이터 프레임워크 지원, 클러스터 완전 제어, 스팟 활용을 통한 비용 제어, 세밀한 Spark 튜닝이 강점이다. 서버리스·빠른 개발·운영 최소화·DPU 과금은 모두 Glue의 강점이므로 Glue를 택할 이유에 해당한다.

---
