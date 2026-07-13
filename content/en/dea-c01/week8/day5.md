# Day 5 - Week 8 Comprehensive Review: Data Operations and Support Recap

This week covered data pipeline "operations" post-construction: monitoring, quality, troubleshooting, cost. Today we tie four topics into one operations scenario. Data operations and support is large DEA-C01 exam domain.

## 1. Pipeline Monitoring (Day 1)

- **Observability 3 pillars**: Metrics (CloudWatch Metrics) + Logs (CloudWatch Logs) + Traces (X-Ray).
- **Glue**: Continuous logging + `--enable-metrics`; watch task failures, shuffle metrics.
- **EMR**: YARN memory, `ContainerPendingRatio`, `IsIdle` for resource/cost judgment; save logs to S3.
- **Kinesis latency**: `IteratorAgeMilliseconds` key; throttling: `ProvisionedThroughputExceeded`.
- **Custom metrics**: EMF logs metric+context simultaneously; composite alarms reduce alarm storms.

> 💡 **Related Theory**: "Symptom-based alarms" on user impact (delay, failure rate) vs. dashboarding simple resource stats reduces alarm fatigue.

## 2. Data Quality and Validation (Day 2)

- **6 dimensions**: Completeness, accuracy, consistency, validity, uniqueness, timeliness.
- **Glue Data Quality**: DQDL rules, recommendation, static + dynamic anomaly detection.
- **Quality gate**: Step Functions Choice blocks downstream on miss → quarantine.
- **Reprocessing**: Idempotency (upsert/deterministic overwrite) + raw preservation + partition-level.
- **Shift-left**: Quality upstream minimizes contamination spread, reprocessing cost.

## 3. Logging, Audit, Troubleshooting (Day 3)

- **CloudTrail** = "who called which API" (audit) vs **CloudWatch Logs** = app output.
- **Debug sequence**: Orchestrator → failed task logs → input data → permissions → CloudTrail.
- **Retry**: Transient errors with exponential backoff+jitter; permanent failures to isolation. Safe only on idempotent.
- **DLQ**: Isolate `maxReceiveCount`-exceeding messages; redrive after fix.

## 4. Cost and Performance Operations (Day 4)

- **Visibility**: Allocation tags (apply post-activation) + Cost Explorer + Budgets + Cost Anomaly Detection.
- **Sizing**: Glue DPU/workers (small jobs Python Shell), EMR instances, Lambda memory.
- **Auto scaling**: Glue Auto Scaling, EMR Managed Scaling, Kinesis On-Demand, Redshift Concurrency Scaling. Baseline sizing first.
- **Purchase options**: Core On-Demand/committed + task Spot. Scan-billed services cut via Parquet, partitions, workgroup limits.

> 💡 **Related Theory**: Auto scaling absorbs "variation," not "wrong baseline." Sizing → scaling sequence is law.

## Integrated Scenario: Overnight Order ETL Operations

```text
00:00 EventBridge schedule → Step Functions pipeline start
  1) Glue collection job (continuous logging + Auto Scaling + metrics enabled)
  2) Glue Data Quality eval (DQDL + anomaly detection)
       └─ score < 0.95 → quarantine + SNS + pipeline stop
  3) EMR transformation (core On-Demand, task Spot, Managed Scaling)
  4) Curated load + Athena validation query

On failure:
  - CloudWatch alarm (IteratorAge/failure rate) → SNS → on-call
  - Step Functions identify failed task → logs → check input/permissions
  - Transient error: Retry (exponential backoff), permanent: Catch → isolate
  - "Config changed?" → CloudTrail trace

Cost operations:
  - Tag all resources Project/Environment
  - Budgets 80% alert, Cost Anomaly auto-detect spikes
  - Monthly Cost Explorer review adjusts sizing
```

## Exam Points Summary

- "Who/audit" → **CloudTrail**; "how system operated" → **CloudWatch Logs/Metrics**.
- Streaming latency core: **IteratorAgeMilliseconds**.
- Data quality rule language: **DQDL**; variable data: **anomaly detection**.
- Retry safe on **idempotent work only**; repeat failures → **DLQ**.
- Cost visibility: **allocation tags**; variance: **auto scaling**; baseline: **sizing/commitments**.

## 📝 연습 문제

**문제 1.** 다음 중 "어제 누가 prod Glue 테이블을 삭제했는지"와 "어젯밤 Kinesis 컨슈머가 얼마나 지연됐는지"를 각각 확인하기 위한 올바른 도구 조합은?

A) 둘 다 CloudWatch Logs  
B) 삭제는 CloudTrail, 지연은 CloudWatch IteratorAgeMilliseconds  
C) 삭제는 X-Ray, 지연은 CloudTrail  
D) 둘 다 Cost Explorer  

**정답: B**  
해설: API 호출 감사("누가 삭제")는 CloudTrail, 스트리밍 지연 측정은 CloudWatch의 IteratorAgeMilliseconds 지표입니다. CloudWatch Logs만으로는 감사가 부족하고, X-Ray는 추적, Cost Explorer는 비용 분석 도구입니다.

---

**문제 2.** 야간 ETL에서 Glue Data Quality 점수가 임계값 미만일 때 권장되는 파이프라인 동작은?

A) curated에 그대로 적재하고 나중에 정정  
B) 임계값을 자동으로 낮춰 통과시킴  
C) Step Functions Choice로 다운스트림을 막고 데이터를 격리 + 통보  
D) 잡을 즉시 삭제  

**정답: C**  
해설: 검증 게이트는 미달 데이터의 다운스트림 진행을 막고 격리 버킷으로 보낸 뒤 통보해 오염 전파를 차단합니다. 그대로 적재·임계값 하향은 품질 게이트를 무력화하고, 잡 삭제는 재처리 기회를 잃습니다.

---

**문제 3.** 비용을 절감하기 위해 EMR 태스크 노드를 Spot으로 전환할 때 함께 적용해야 하는 원칙으로 가장 적절한 것은?

A) HDFS 데이터를 보유하는 코어 노드는 안정적인 옵션으로 유지  
B) 코어 노드도 모두 Spot으로 전환  
C) 자동 스케일링을 비활성화  
D) 모든 데이터를 태스크 노드 로컬에 저장  

**정답: A**  
해설: 태스크 노드는 상태가 없어 Spot 회수에 견딜 수 있지만, HDFS 데이터를 보유한 코어 노드는 On-Demand/약정으로 유지해야 회수 시 데이터 손실을 막습니다. 코어 Spot 전환·로컬 저장은 데이터 손실 위험을 키웁니다.

---

**문제 4.** 일시적 오류가 잦은 외부 API 호출 태스크를 자동 재시도하도록 구성할 때, 안전성을 위해 반드시 전제되어야 하는 조건은?

A) 태스크가 비멱등이어야 한다  
B) 재시도 간격이 항상 0이어야 한다  
C) 로그를 비활성화해야 한다  
D) 태스크가 멱등(idempotent)이어야 한다  

**정답: D**  
해설: 재시도는 같은 작업이 여러 번 실행될 수 있으므로, 멱등 작업에서만 안전합니다. 비멱등 작업은 중복 적용으로 데이터가 오염되고, 재시도 간격 0은 폭주를 유발하며, 로그 비활성화는 디버깅을 어렵게 합니다.

---

**문제 5.** 자동 스케일링을 도입했는데도 평소 비용이 여전히 과도하다면 가장 먼저 점검해야 할 것은?

A) 더 많은 알람을 추가한다  
B) 모든 태그를 제거한다  
C) 베이스라인 리소스 사이징(워커/인스턴스/메모리)이 적정한지 점검한다  
D) 자동 스케일링 상한을 무한대로 올린다  

**정답: C**  
해설: 자동 스케일링은 변동을 흡수할 뿐 잘못된 베이스라인을 고치지 못하므로, 평상시 비용이 높으면 베이스라인 사이징을 먼저 재조정해야 합니다. 알람 추가·태그 제거·스케일링 상한 상향은 근본 원인인 과대 베이스라인을 해결하지 못합니다.

---
