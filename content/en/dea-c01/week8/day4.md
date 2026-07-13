# Day 4 - Cost and Performance Operations: Monitoring, Sizing, Auto Scaling

Data pipelines running well yet unsustainable if costs uncontrolled. Today we visualize costs (allocation tags), right-size resources (sizing), auto-scale to load, and optimize during operations.

## Cost Visibility: Allocation Tags and Cost Explorer

First step to reduce costs: "what uses how much?"

- **Cost Allocation Tags**: Tag resources with `Project`, `Environment`, `Team`, `Pipeline` etc.; activate in billing console; break down costs by tag.
- **Cost Explorer**: Visualize cost trends by service, tag, period; forecast.
- **AWS Budgets**: Alert on budget thresholds (e.g., 80% of $5k monthly) or trigger actions.
- **Cost Anomaly Detection**: ML auto-detects and notifies unusual cost spikes.

```text
Tagging strategy example:
  Project=orders-pipeline
  Environment=prod
  CostCenter=data-eng
→ Cost Explorer breaks down "data-eng's prod orders-pipeline cost"
```

> 💡 **Related Theory**: Custom tags apply **after** activation; no retroactive application. Establish tagging policy early, apply consistently.

## Resource Sizing

Services have different cost levers:

- **Glue**: DPU (Data Processing Unit) count and worker type (Standard / G.1X / G.2X). Small data reduces workers; small jobs without Spark use **Python Shell (0.0625 DPU)** far cheaper.
- **EMR**: Instance type/count. Separate core/task nodes; match family to workload (memory vs. CPU).
- **Lambda**: Memory setting determines CPU too. Increase memory cutting runtime, sometimes lowers total cost (Power Tuning).
- **Redshift**: Node type/count or Serverless RPU.

```text
Under-provisioned: OOM, throttle, latency → SLA breach
Over-provisioned: idle resources → waste
Goal: size exactly to workload profile + auto scaling absorbs variance
```

## Auto Scaling

Fixed capacity wastes at baseline, shortfalls at peaks. Auto scaling follows load:

- **Glue Auto Scaling**: Dynamically adjust workers per stage (`--enable-auto-scaling`); set max workers as ceiling.
- **EMR Managed Scaling**: Cluster auto-adjusts core/task nodes based on YARN pending, memory; set min/max.
- **Kinesis On-Demand**: Auto-expand shards by throughput (no manual shard sizing).
- **Redshift Concurrency Scaling**: Temporary clusters absorb read query spikes.

> 💡 **Related Theory**: Auto scaling absorbs "variation," not "wrong baseline." Size baseline first, then scale for variance.

## Purchase Options for Cost Savings

- **Spot Instances**: Suited to fault-tolerant workloads like EMR task nodes. ~90% savings but reclaim-able → keep important data on core nodes.
- **Savings Plans / Reserved**: Discounted commitment on predictable baseline usage.
- **On-Demand**: Unpredictable, short-term workloads.

Typical pattern: EMR core nodes On-Demand/committed for stability, task nodes Spot for cost savings.

## Storage and Query Operations Optimization

- **S3 Lifecycle**: Transition old raw data Standard-IA → Glacier, clean incomplete multipart uploads.
- **Columnar format, compression, partitioning**: Athena/Spectrum bill on scanned bytes; Parquet+compression+partition pruning cuts costs directly.
- **Small file compaction**: Remove request costs and metadata overhead from file explosion.
- **Athena Workgroup**: Per-query scan ceiling (per-query data limit) stops runaway costs; track per-workgroup.

## Key Takeaways

- Visibility: allocation tags (apply after activation) + Cost Explorer + Budgets + Cost Anomaly Detection.
- Sizing adjusts service levers (Glue DPU/workers, EMR instances, Lambda memory) to workload.
- Auto scaling (Glue Auto Scaling, EMR Managed Scaling, Kinesis On-Demand) absorbs variation; baseline sizing first.
- Spot (task nodes) + committed (baseline) mix; scan-billed services cut costs via Parquet, partitions, workgroup limits.

## 📝 연습 문제

**문제 1.** 데이터 팀이 프로젝트별·환경별 AWS 비용을 분해해서 보고 싶을 때 가장 먼저 해야 할 일은?

A) 모든 리소스를 한 계정으로 통합  
B) 모든 인스턴스를 Spot으로 전환  
C) Cost Allocation Tags를 일관되게 달고 청구 콘솔에서 활성화  
D) CloudTrail 데이터 이벤트 활성화  

**정답: C**  
해설: 비용 할당 태그(Project, Environment 등)를 일관되게 달고 활성화하면 Cost Explorer에서 태그별로 비용을 분해할 수 있습니다. 계정 통합·Spot 전환은 분해 가시화와 무관하고, CloudTrail 데이터 이벤트는 비용 분석이 아니라 API 감사 용도입니다.

---

**문제 2.** Glue 잡 실행 중 스테이지별 필요량에 따라 워커 수를 동적으로 늘리고 줄여 비용과 성능을 모두 잡는 기능은?

A) Glue Auto Scaling  
B) Job Bookmark  
C) Partition Projection  
D) DynamicFrame  

**정답: A**  
해설: Glue Auto Scaling(`--enable-auto-scaling`)은 잡 실행 중 워크로드에 맞춰 워커를 동적으로 조절하고 최대 워커 수만 상한으로 지정합니다. Job Bookmark는 증분 처리 상태, Partition Projection은 Athena 파티션 계산, DynamicFrame은 데이터 추상화입니다.

---

**문제 3.** EMR 클러스터에서 비용을 크게 절감하면서도 중단 가능성에 견디도록 구성하는 전형적 패턴은?

A) 모든 노드를 Spot으로 구성  
B) 모든 노드를 On-Demand로 구성  
C) 코어 노드를 Spot, 태스크 노드를 On-Demand  
D) 코어 노드는 On-Demand/약정, 태스크 노드는 Spot  

**정답: D**  
해설: HDFS 데이터를 보유하는 코어 노드는 안정적인 On-Demand/약정으로 두고, 상태가 없는 태스크 노드를 Spot으로 구성하면 회수되어도 데이터 손실 없이 비용을 절감합니다. 코어를 Spot으로 두면 회수 시 데이터 손실 위험이 큽니다.

---

**문제 4.** Athena와 Redshift Spectrum의 쿼리 비용을 직접적으로 줄이는 가장 효과적인 방법은?

A) 모든 데이터를 CSV로 저장  
B) Parquet 컬럼 포맷 + 압축 + 파티션 프루닝으로 스캔 바이트 감소  
C) 쿼리를 더 자주 실행  
D) 결과를 항상 JSON으로 출력  

**정답: B**  
해설: Athena/Spectrum은 스캔한 바이트로 과금되므로, 컬럼 포맷(Parquet)·압축·파티션 프루닝으로 읽는 데이터양을 줄이면 비용이 직접 감소합니다. CSV/JSON은 스캔량을 늘리고, 쿼리를 자주 실행하면 비용이 증가합니다.

---

**문제 5.** AWS 비용에서 평소와 다른 비정상적인 급증을 머신러닝으로 자동 탐지하고 통보하는 서비스는?

A) AWS Budgets  
B) Trusted Advisor  
C) Compute Optimizer  
D) Cost Anomaly Detection  

**정답: D**  
해설: Cost Anomaly Detection은 ML로 비용 패턴을 학습해 비정상적 급증을 자동 탐지·통보합니다. Budgets는 사전 설정한 임계값 기반 알림, Trusted Advisor는 모범사례 점검, Compute Optimizer는 리소스 사이징 권고로 동적 이상 탐지와는 다릅니다.

---
