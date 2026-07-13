# Day 3 - EMR, Glue, MWAA: Big Data Orchestration and Distributed Processing Engines

Engineers designing big data processing for the first time typically start by asking, "Which service should we use? EMR? Glue? Athena?" But these three aren't competitors—they're the same engine (Apache Spark) wrapped in different operational models. EMR lets you directly operate Spark as a cluster; Glue abstracts Spark serverlessly; Athena exposes only SQL on top of Spark/Presto. So the real question becomes: "How much direct control of the cluster does this workload need, and how much operational burden are we willing to offload to AWS?"

In SAP-C02 exams, this domain tests operational architecture: "running heavy Spark jobs across tens of thousands of nodes processing petabytes cost-optimally," "orchestrating pipelines with hundreds of interdependent steps," "keeping jobs alive through Spot interruptions and node failures." Today we'll dissect how EMR, Glue, and MWAA work internally, why they're architected that way, and build intuition for solving these scenarios.

## Why Distributed Processing — MapReduce to Spark History

Big data processing originated with Google's 2004 MapReduce paper. The core idea was simple: split vast data into chunks, scatter them across thousands of commodity servers (Map), have each independently process their chunk, then combine results (Reduce). Linear scaling from one supercomputer to thousands of cheap servers. Doug Cutting implemented this as open-source Hadoop—HDFS for distributed storage (Google GFS's open-source version), YARN for resource management.

The problem: MapReduce wrote all intermediate results to disk. Iterative algorithms (machine learning, graph processing) cycle over the same data dozens of times; writing to/reading from HDFS each cycle created an I/O bottleneck. In 2009, Matei Zaharia at UC Berkeley's AMPLab created **Spark**, inverting this. Spark keeps intermediate results in memory (in-memory computing) and expresses computation as **RDD (Resilient Distributed Dataset)**, an immutable abstraction. RDDs don't hold actual data—only the "lineage" of how they're built. If a node dies and some partitions vanish, Spark recomputes just that portion along the lineage, restoring it. This fault-tolerance without checkpointing made Spark the standard.

> 💡 **Related Theory**: Spark's core is **lazy evaluation** and **DAG execution**. Transformations like `map` and `filter` don't execute immediately—only recorded in the lineage. Only when an action (count, collect, save) runs does Spark see the whole transformation chain, build an optimal plan (DAG), and execute it once. This enables operator fusion (merging unnecessary steps) and shuffle minimization. With DataFrame API, you add the **Catalyst optimizer** and **Tungsten execution engine**, so declaratively-written SQL-like code gets column pruning, predicate pushdown, and code generation, running far faster than RDD. So practically and on exams, "DataFrame/Spark SQL over RDD" is standard.

> 🔍 **Deep Dive**: **Shuffle** is the most expensive operation in distributed processing because it is why. Wide transformations (`groupBy`, `join`, `reduceByKey`) must group equal keys on the same node. This triggers all-to-all network communication between every node, writes intermediate results to disk (shuffle write), then reads them (shuffle read). Slow 100-million-row joins usually stem from shuffle, not computation itself. Optimization hinges on reducing shuffle—small tables use **broadcast join** (replicate to all nodes, kill shuffle), pre-align partitioning for co-location, avoid `repartition` overuse. Redshift's distribution key (Day 42) follows the identical principle: minimize inter-node shuffle.

## EMR — Managed Hadoop/Spark Cluster

EMR (Elastic MapReduce) runs the Hadoop ecosystem (Spark, Hive, Presto/Trino, HBase, Flink, Hudi) on EC2 clusters as a managed service. It eliminates hand-installing, tuning, and patching Hadoop on EC2; clicks or one API call spin up dozens to thousands of nodes in minutes. Understanding EMR hinges on **three node roles**.

- **Master (Primary) Node**: Manages the cluster. YARN ResourceManager, HDFS NameNode, job scheduling live here. Only one (or three in HA setup) exists; if it dies, the whole cluster suffers—**never run it on Spot**.
- **Core Nodes**: Act as HDFS DataNodes (store data) while running tasks. They hold HDFS data, so a Spot interruption loses data and triggers replication/recovery overhead. Usually run On-Demand or conservative Spot ratios.
- **Task Nodes**: Execute tasks only, no HDFS storage. Data is transient—interruption causes no loss—**perfect Spot candidates**. Cost optimization's heart is "fill Task nodes with Spot."

This role separation starts EMR cost optimization. Keep Master/Core minimal on stable On-Demand; elastically scale heavy compute with cheap Spot Task nodes.

> 💡 **Related Theory**: Where EMR places data determines architecture. Traditional Hadoop pursues **data locality**—execute computation where data lives (on Core nodes' local HDFS). In cloud, **EMRFS** becomes standard: data lives on S3. This separates compute and storage (like RA3 on Day 42), letting jobs terminate clusters entirely post-run (zero compute cost) and multiple clusters share the same S3 data. Downside: S3 has higher latency than HDFS, but EMRFS's S3 optimization committer and Parquet column pruning offset this considerably. From SAP's angle: "kill cluster post-job to cut costs" almost always means S3-based transient cluster.

> 🔍 **Deep Dive**: **Instance Fleets vs Instance Groups**. Two ways to configure EMR nodes. Instance Groups pin each group to a single instance type—simple but fails when that type's Spot inventory dries up. **Instance Fleets** mix multiple instance types (m5.xlarge, m5a.xlarge, m4.xlarge) in one group with weights and target capacity (e.g., "fill 32 vCPU"). EMR auto-fills with the cheapest available, auto-substituting if one type's Spot interrupts. So "Spot-resilient, cost-optimal" in exams almost always means **Instance Fleets + Spot multi-type**.

> 📚 **Case Study**: Yelp, an early large-scale EMR operator, ran hundreds of clusters daily, ingesting petabytes of logs via Spark/MapReduce. Core pattern: "transient cluster per job"—data lives permanently on S3; only when processing does a cluster spin up, fill Task nodes with Spot, then terminate immediately, minimizing compute costs. Lessons: (1) transient per-job clusters beat long-running for cost/isolation, (2) S3 as source of truth makes clusters disposable. SAP exams repeat this "cost-optimal batch" pattern.

## EMR Deployment Models — EC2, EKS, Serverless

EMR offers the same engine in three runtimes. Choice reflects "control vs. operational burden" tradeoff.

- **EMR on EC2** (traditional): The cluster described above. Maximum control (custom AMI, bootstrap actions, all Hadoop components). Largest cluster management responsibility.
- **EMR on EKS**: Run Spark jobs as Pods on existing EKS (Kubernetes) clusters. Fits organizations that standardized on EKS for containers and now want to integrate Spark workloads with the same infrastructure, IAM, and observability. Big data and app teams share the same Kubernetes resource pool, raising utilization.
- **EMR Serverless** (2022): No cluster sizing, no node management. Submit jobs; AWS spins up necessary workers, runs, then reclaims. Optimal for variable workloads or cluster-operation-averse teams. Over/under-provisioning from capacity miscalculation vanishes.

> ⚠️ **Trap**: "EMR Serverless is always cheaper and better"—false. Serverless bills per vCPU-memory-hour of worker runtime; sustained workloads can cost more than well-tuned EC2 clusters (especially Spot Fleets). Serverless trades lower operational burden for fractionally higher unit cost. Long-running, 24-hour steady workloads may favor EC2. Components like HBase need long-lived clusters; Serverless can't run them. In exams: "sporadic, variable, ops-averse" = Serverless; "sustained, 24/7, special components" = EC2.

## EMR vs Glue vs Athena — Same Spark, Different Ops Models

Decision criteria in one table. Core variables: startup, ops burden, workload weight.

| Aspect | EMR (on EC2) | Glue | Athena |
|--------|--------------|------|--------|
| Engine | Full Hadoop/Spark/Hive/Presto/HBase | Serverless Spark (+ Python Shell, Ray) | Presto/Trino (SQL), Spark (analytics) |
| Ops Model | Direct cluster management | Serverless (DPU) | Fully serverless |
| Startup | 5–10 min (cluster boot) | ~1 min (warm pool: seconds) | Instant |
| Billing | Cluster uptime (EC2) | DPU-hours | S3 scan volume |
| Best For | Heavy repeat, custom tuning, special components | Light–medium ETL, catalog integration | Ad-hoc SQL, BI |
| Control | Maximum | Medium (abstracted) | Minimal (SQL only) |

Decision flow: "SQL sufficient and ad-hoc" = **Athena**. "Structured ETL but no cluster ops" = **Glue**. "Heavy repeat, custom Spark tuning, full Hive/HBase/Flink stack needed" = **EMR**. All three share Glue Data Catalog as common metastore, so the same table definition appears across all three engines.

> 🔍 **Deep Dive**: How **Glue Job Bookmark** enables incremental processing. Daily ETL that reprocesses yesterday's files wastes cost and duplicates results. Job Bookmark stores "how far we got" state (S3 object last-modified time/path, JDBC source column value) per run as checkpoint. Next run processes only new data after that mark. It's the streaming-offset-management idea adapted for batch. In exams, "daily Glue job reprocesses already-done data / want incremental only" signals Job Bookmark enable. (Antipattern: enable bookmark but write job logic that reads everything from scratch anyway—pointless.)

## Glue's Other Components — Crawler, Catalog, DataBrew

Glue isn't just ETL jobs; it's a data integration platform. **Glue Data Catalog** is a Hive Metastore-compatible metadata repository holding table schemas, partitions, locations—shared by Athena, EMR, Redshift Spectrum, and Glue (the true hub here). **Glue Crawler** scans S3 and JDBC sources, infers schemas, auto-registers tables/partitions in the catalog. **Glue DataBrew** is a code-free visual tool to craft data-cleaning/transformation recipes, letting data analysts self-serve cleaning without engineers.

> 💡 **Related Theory**: Glue Data Catalog's **Hive Metastore compatibility** is the ecosystem's linchpin. Hive Metastore (2008) standardized "what columns a table has, what file format/path" in Hadoop. AWS implemented this interface precisely, so the same Parquet file in S3 can be SQL-queried via Athena, transformed via EMR Spark, and joined via Redshift Spectrum—all as "the same table." Centralizing metadata and swappable engines builds the lakehouse architecture's foundation.

## MWAA — Orchestrate Pipelines with Airflow

Data pipelines flow ingest → store → process → ingest → analyze, with many steps holding **dependencies**. "Glue job must finish before EMR starts, then Athena CTAS runs, retry on failure, trigger at specific time." Managing dependencies, scheduling, retries, and observability is orchestration; the de facto standard is Apache Airflow. **MWAA (Managed Workflows for Apache Airflow)** is AWS's managed Airflow, handling webserver, scheduler, workers.

Airflow's core model is **DAG (Directed Acyclic Graph)**. Workflows express as "acyclic directed graphs," explicitly stating step dependencies. No cycles matter because A→B→A deadlocks forever. DAGs are Python code, so conditional branches, dynamic task generation, and external integrations flow from code's expressiveness. Rich Operator set (EMR, Glue, Athena, Step Functions, etc.) weaves multi-service pipelines in one DAG.

> 💡 **Related Theory**: DAG is computer science's universal abstraction for dependency and scheduling. Build systems (Makefile, Bazel), package resolution, Spark execution plans, even Git commit graphs are DAGs. The core operation is **topological sort**—"order as: 'run tasks whose prerequisites finished'." Airflow's scheduler does exactly this every moment: find tasks where upstream succeeded (dependencies met), queue them for execution. Cycles break topological sorts, hence "Acyclic" in DAG.

## MWAA vs Step Functions — Two Orchestration Philosophies

AWS has two orchestration tools: MWAA (Airflow) and Step Functions. Different philosophies.

| Aspect | MWAA (Airflow) | Step Functions |
|--------|----------------|----------------|
| Definition | Python DAG (code) | ASL (Amazon States Language) JSON |
| Integration | Operator ecosystem (diverse external) | 200+ AWS services natively |
| Ops | Airflow environment mgmt (managed but env cost/version) | Fully serverless, zero ops |
| Portability | Airflow OSS—on-prem, multi-cloud migration | AWS-only |
| Billing | Environment uptime (always-on cost) | State transition per execution |
| Strength | Complex data pipelines, rich community | Event-driven, serverless workflows, deep AWS integration |

Pick MWAA if: already using Airflow, need multi-cloud portability, complex Python logic, rich data Operators. Pick Step Functions if: pure AWS, serverless zero-ops, event-driven, no always-on cost. In exams: "Python DAG / Airflow migration / portability" = MWAA; "serverless / AWS deep integration / zero ops / state-transition billing" = Step Functions.

> ⚠️ **Trap**: MWAA is "managed" but not free. Airflow environment (webserver, scheduler, minimum worker) runs always, costing per-hour whether or not jobs run. Step Functions bill per state transition; no workflow execution = cost near zero. "Sporadic workload, minimize always-on cost" signals Step Functions (or EventBridge + Step Functions), not MWAA. "Complex data DAG with existing Airflow assets" is MWAA's legitimate domain.

## Versus Other Clouds — Same Engine, Different Names

This domain builds on open-source standards (Spark, Airflow, Kafka, Hive), so multi-cloud mappings are clear.

| Role | AWS | GCP | Azure |
|------|-----|-----|-------|
| Managed Spark/Hadoop cluster | EMR | Dataproc | HDInsight / Synapse Spark |
| Serverless ETL | Glue | Dataflow (Beam) / Dataproc Serverless | Data Factory / Synapse |
| Serverless SQL on object storage | Athena | BigQuery (external tables) | Synapse Serverless SQL |
| Managed Airflow | MWAA | Cloud Composer | Data Factory Managed Airflow |
| Metadata Catalog | Glue Catalog | Dataplex / Data Catalog | Purview |

Core insight: all these services wrap the same open-source (Spark, Airflow, Hive Metastore), so **maintaining catalog (metadata) standards lets you swap processing engines relatively freely**. Multi-cloud and hybrid strategies standardize on Airflow (MWAA/Composer) and Iceberg/Hive Metastore-compatible catalogs.

## Summary

EMR, Glue, Athena are **not competitors but the same Spark/Presto engine wrapped differently on a control-vs-burden axis**. EMR: full control (cluster). Glue: serverless ETL (DPU). Athena: SQL (scan billing). EMR cost optimization's heart: fill Task nodes with Spot, use Instance Fleets for Spot-interruption resilience, keep data on S3 (EMRFS) and operate transient clusters. MWAA (Airflow DAG) and Step Functions (ASL) orchestrate pipelines; former emphasizes portability, complex logic, and persistent assets; latter emphasizes serverless, AWS integration, zero ops.

SAP exam recurring mappings: (1) "EMR Task cost optimal + Spot resilient" → Instance Fleets + Spot multi-type. (2) "Kill cluster post-job to cut costs" → S3 (EMRFS) transient cluster. (3) "Variable Spark, no cluster ops" → EMR Serverless. (4) "Light ETL, no cluster ops" → Glue. (5) "Process incremental only" → Glue Job Bookmark. (6) "Python DAG, portability" → MWAA. (7) "Serverless, AWS integration, zero ops, zero always-on cost" → Step Functions. (8) "Ad-hoc SQL" → Athena. Next day covers data governance (Lake Formation) and real-time streaming (MSK).

---

## 📝 연습 문제

**문제 1.** 매일 페타바이트급 로그를 Spark로 배치 처리한다. 데이터는 S3에 영구 보관돼 있고, 처리는 하루 2~3시간만 한다. 비용을 최소화하면서 Spot 중단에도 잡이 죽지 않게 하려면?

A) 상시(long-running) EMR 클러스터를 On-Demand로 유지
B) 잡 단위 transient EMR 클러스터 + Task 노드를 Instance Fleets Spot 다중 타입으로 구성, 끝나면 종료
C) 모든 노드(Master·Core·Task)를 Spot으로 구성
D) Redshift에 적재 후 SQL로 처리

**정답: B**

해설: 데이터가 S3에 있으므로 처리할 때만 클러스터를 띄우고 끝나면 종료하는 transient cluster가 비용 최적이다. Task 노드는 HDFS 데이터를 들고 있지 않아 Spot 중단에 안전하고, Instance Fleets로 여러 인스턴스 타입을 섞으면 한 타입의 Spot이 마르거나 중단돼도 다른 타입으로 자동 대체되어 강건하다. A는 안 쓰는 시간에도 비용이 계속 나간다. C는 Master/Core를 Spot으로 돌리는 치명적 실수 — Master가 중단되면 클러스터 전체가 죽고 Core가 중단되면 HDFS 데이터가 사라진다. D는 배치 Spark 처리를 위해 굳이 DW에 적재할 이유가 없고 변환 유연성도 떨어진다.

---

**문제 2.** 하루에 몇 번, 불규칙하게 도는 Spark 잡이 있다. 클러스터 사이징과 노드 관리를 하고 싶지 않고, 안 돌 때 비용을 최소화하려면?

A) EMR on EC2 상시 클러스터
B) EMR Serverless
C) EMR on EKS 전용 노드 풀
D) Glue Crawler

**정답: B**

해설: EMR Serverless는 클러스터·노드 개념 없이 잡을 제출하면 필요한 워커를 자동으로 띄우고 끝나면 회수하며, 워커 실행 시간만 과금한다. 간헐적·가변 워크로드에서 용량 산정 실수와 유휴 비용을 없애준다. A는 안 쓰는 시간에 상시 비용이 발생하고 사이징 관리가 필요. C는 EKS 클러스터·노드 풀을 직접 관리해야 해 "관리하기 싫다"는 조건에 어긋남(이미 EKS 표준화된 조직의 통합용). D는 ETL 잡 실행이 아니라 스키마를 추론해 카탈로그에 등록하는 도구로 목적이 다르다.

---

**문제 3.** 매일 도는 Glue ETL 잡이 어제 이미 처리한 S3 파일을 또 처리해 비용이 늘고 결과가 중복된다. 새로 들어온 데이터만 처리하게 하려면?

A) Crawler를 매번 다시 실행
B) Glue Job Bookmark 활성화
C) Athena에서 WHERE로 필터
D) S3 라이프사이클로 오래된 파일 삭제

**정답: B**

해설: Job Bookmark는 잡 실행마다 "어디까지 처리했는지"의 상태를 체크포인트로 저장하고, 다음 실행은 그 이후의 새 데이터만 처리한다(스트리밍 오프셋과 같은 발상의 배치 버전). A(Crawler)는 스키마·파티션을 카탈로그에 등록하는 도구로 증분 처리와 무관. C는 처리 자체는 매번 전체를 읽으므로 비용 절감이 안 됨. D는 데이터 손실 위험이 있고 증분 처리 문제를 해결하지 못한다.

---

**문제 4.** 수십 개 단계가 의존성을 갖는 데이터 파이프라인을 오케스트레이션해야 한다. 팀은 이미 온프레미스에서 Apache Airflow를 쓰고 있고, 추후 다른 클라우드로 이전할 가능성도 고려해 이식성을 원한다. 가장 적합한 것은?

A) Step Functions (ASL)
B) MWAA
C) Glue Workflow
D) EventBridge 규칙 체인

**정답: B**

해설: MWAA는 Apache Airflow 매니지드 서비스로, 기존 Airflow DAG(Python)를 거의 그대로 옮길 수 있고 Airflow가 OSS이므로 다른 클라우드(GCP Composer 등)나 온프렘으로의 이식성이 좋다. A(Step Functions)는 ASL JSON 기반으로 AWS 종속이라 이식성 조건에 어긋남. C(Glue Workflow)는 Glue 잡 위주의 단순 오케스트레이션으로 복잡한 다중 서비스 DAG·이식성에 부족. D는 단순 이벤트 연결이지 복잡한 의존성 그래프 오케스트레이션 도구가 아니다.

---

**문제 5.** 순수 AWS 환경에서 이벤트 기반 워크플로우를 만든다. 간헐적으로만 실행되며, 워크플로우가 안 돌 때 상시 비용이 발생하지 않기를 원하고, 다수의 AWS 서비스를 세밀하게 통합해야 한다. 가장 적합한 것은?

A) MWAA
B) Step Functions
C) 상시 EC2에서 cron + 스크립트
D) Jenkins on EC2

**정답: B**

해설: Step Functions는 완전 서버리스로 상태 전이(state transition)당 과금되어 워크플로우가 안 돌면 비용이 0에 수렴하고, 200개 이상 AWS 서비스를 네이티브로 통합한다. 이벤트 기반·간헐적·AWS 종속 환경에 최적. A(MWAA)는 Airflow 환경(웹서버·스케줄러)이 잡이 없어도 상시 떠 있어 시간당 비용이 계속 발생하므로 "상시 비용 회피" 조건에 불리. C·D는 인프라를 직접 운영해야 하고 상시 비용·관리 부담이 크다. 함정: "간헐적 + 상시 비용 회피 + AWS 통합"은 Step Functions, "복잡 데이터 DAG + 기존 Airflow 자산 + 이식성"은 MWAA.

---

**문제 6.** 데이터 분석가들이 엔지니어의 도움 없이 시각적으로 데이터를 정제·변환하고 싶어 한다. 코드 작성 없이 클렌징 레시피를 만들 수 있는 도구는?

A) EMR Notebooks
B) Glue DataBrew
C) Glue Job (PySpark)
D) Athena CTAS

**정답: B**

해설: Glue DataBrew는 코드 없이(노코드) 시각적 인터페이스로 데이터 프로파일링·정제·변환 레시피를 만드는 도구로, 데이터 분석가가 엔지니어 없이 클렌징을 수행하는 데 최적이다. A(EMR Notebooks)는 Jupyter 기반으로 코드 작성이 필요. C(Glue Job)는 PySpark/Scala 코드 작성이 필요. D(Athena CTAS)는 SQL 작성이 필요하다. "노코드·시각적·분석가 셀프서비스"는 DataBrew.

---

**문제 7.** 한 조직이 이미 EKS로 컨테이너 플랫폼을 표준화했고, 앱 워크로드와 빅데이터 Spark 워크로드를 같은 Kubernetes 자원 풀·IAM·관측 도구로 통합해 자원 활용률을 높이려 한다. 가장 적합한 EMR 배포 모델은?

A) EMR on EC2
B) EMR on EKS
C) EMR Serverless
D) 별도 Hadoop 클러스터를 직접 구축

**정답: B**

해설: EMR on EKS는 Spark 잡을 기존 EKS 클러스터 위에서 Pod로 실행해, 빅데이터 팀과 앱 팀이 같은 K8s 자원 풀·IAM·로깅/모니터링을 공유하고 자원 활용률을 높인다. 이미 EKS를 표준화한 조직의 통합 시나리오에 정확히 부합한다. A(on EC2)는 별도 EMR 전용 클러스터를 띄워 EKS 통합 이점이 없음. C(Serverless)는 K8s 자원 풀 공유·통합과 무관. D는 매니지드 이점을 버리는 선택이다.

---

## 📌 Today's Summary

1. **Distributed processing history** — MapReduce (2004, disk-based) → Spark (2009, in-memory + RDD lineage). DataFrame/Catalyst faster than RDD
2. **Shuffle is the most expensive operation** — Wide transformation all-to-all communication. Reduce with broadcast join, co-location
3. **EMR node roles** — Master (never Spot), Core (HDFS, conservative), Task (Spot optimal). Cost = Task-Spot + Instance Fleets
4. **EMR deployment models** — on EC2 (full control), on EKS (K8s integrate), Serverless (variable, ops-free). S3 (EMRFS) transient cluster is cost standard
5. **EMR vs Glue vs Athena** — Same engine, control-burden axis. Full / serverless ETL / SQL
6. **Glue components** — Catalog (Hive Metastore hub), Crawler (schema infer), DataBrew (code-free), Job Bookmark (incremental)
7. **MWAA (Airflow DAG)** — Topological sort-based dependency orchestration. Portability, complex logic, always-on asset
8. **MWAA vs Step Functions** — Python DAG/portability/always-on vs ASL/AWS integrate/serverless/state-transition billing
9. **Multi-cloud map** — EMR=Dataproc=HDInsight, MWAA=Composer. Catalog standardization enables engine swaps
