# Day 3 - Logging, Audit, and Troubleshooting: CloudTrail and Failure Recovery

"What happened?" reconstruction when pipelines stop is half of operations. Today we audit via CloudTrail, systematically debug pipelines, recover from failures, and handle DLQ (dead letter queue).

## CloudTrail: Who, When, What

CloudTrail is account **API call audit log**. Where CloudWatch shows "how system operates" (metrics/logs), CloudTrail shows "who called which operation."

- **Management Events**: Control plane operations—resource create/modify/delete, IAM changes. Enabled by default.
- **Data Events**: Data plane operations—S3 object GET/PUT, Lambda Invoke, etc. Large volume; default disabled; selectively enable.
- **Insights Events**: Auto-detect anomalous API call spikes.

```text
Question: "Who dropped prod curated table last night?"
→ CloudTrail: find glue:DeleteTable / athena query events by timestamp and userIdentity
```

> 💡 **Related Theory**: CloudWatch Logs and CloudTrail have different roles. CloudWatch Logs = application writes, CloudTrail = AWS API calls. Security, audit, "who did this" questions use CloudTrail.

Best practice: centralize organization's CloudTrail logs in central S3 bucket, immutably store (object lock/separate account) for audit.

## Pipeline Debugging Workflow

Don't dive into code when pipeline fails; narrow top-to-bottom:

1. **Orchestrator first**: Step Functions execution graph / Airflow(MWAA) DAG identify which task failed.
2. **Failed task logs**: CloudWatch Logs for that Glue/EMR/Lambda job; find exception stack.
3. **Input data check**: Schema change, empty partition, corrupted file.
4. **Permissions and resources**: IAM denied, throttled, OOM (out of memory).
5. **CloudTrail for change tracking**: Recently someone modified table/policy/config?

```text
Step Functions execution → ❌ TransformJob fails
  → CloudWatch Logs(Glue): "AnalysisException: cannot resolve 'email'"
  → Root cause: upstream schema changed email column to user_email
  → Action: fix mapping + add schema validation gate
```

## Common Failure Types and Clues

- **Throttling**: `ProvisionedThroughputExceededException`, `Rate exceeded` → backoff/retry, increase capacity.
- **OOM**: Spark executor OOM → adjust partition count, increase executor memory, resolve data skew.
- **Permission denied**: `AccessDenied` → check IAM/Lake Formation permissions, KMS key permissions.
- **Data skew**: Data concentrated in specific key → some tasks run long (`shuffleBytes` metric clue).

## Retry and Failure Recovery

Transient errors normal in distributed systems. Core is **distinguishing retryable from permanent errors**.

```json
// Step Functions Retry/Catch (concept example)
"Retry": [{
  "ErrorEquals": ["States.TaskFailed", "ThrottlingException"],
  "IntervalSeconds": 5,
  "BackoffRate": 2.0,
  "MaxAttempts": 3
}],
"Catch": [{
  "ErrorEquals": ["States.ALL"],
  "Next": "QuarantineAndNotify"
}]
```

- **Exponential backoff + jitter**: Increase retry intervals, add randomness to prevent thundering herd.
- **Catch after max retries**: Permanent failure goes to isolation/notify path.

> 💡 **Related Theory**: Retries safe only on idempotent work. Retrying non-idempotent work (e.g., "increase balance") applies duplicates. Protect with idempotent keys or conditional writes.

## DLQ (Dead Letter Queue) Handling

Messages repeatedly failing if left in normal queue blocks consumers. **DLQ** separates messages failing repeated attempts.

- **SQS**: Messages exceeding `maxReceiveCount` move to DLQ.
- **Lambda (async invoke)**: Failure sends to SQS/SNS DLQ, or more common **Lambda Destinations** (onFailure).
- **Kinesis/event source mapping**: `OnFailure` target records failed batch metadata to SQS/SNS.

```text
Normal queue → consumer fails N times → DLQ
DLQ → (operator/reprocessing job) → root cause → fix, redrive
```

SQS **DLQ redrive** lets messages from DLQ return to original queue for reprocessing after fix.

## Key Takeaways

- CloudTrail = "who called which API" (audit); CloudWatch Logs = "what did application write."
- Debug top-to-bottom: orchestrator → failed task logs → input → permissions → CloudTrail.
- Retry transient errors with exponential backoff+jitter; catch permanent with isolation. Safe only on idempotent work.
- DLQ isolates repeat-fail messages; redrive after fix to reprocess.

## 📝 연습 문제

**문제 1.** "지난 밤 누가 Glue Data Catalog의 테이블을 삭제했는가"를 자격증명과 시각까지 추적하려면 어떤 서비스를 봐야 하는가?

A) CloudWatch Logs  
B) CloudTrail  
C) X-Ray  
D) Glue Data Quality  

**정답: B**  
해설: CloudTrail은 AWS API 호출을 자격증명(userIdentity)·시간과 함께 기록하므로 "누가 무엇을 했는가"를 감사할 수 있습니다. CloudWatch Logs는 애플리케이션 로그, X-Ray는 분산 추적, Glue Data Quality는 데이터 품질 평가로 API 감사 용도가 아닙니다.

---

**문제 2.** SQS 큐에서 컨슈머가 특정 메시지 처리를 반복적으로 실패해 큐 전체 처리가 막히는 것을 방지하기 위한 메커니즘은?

A) FIFO 큐 전환  
B) 가시성 타임아웃을 0으로 설정  
C) 메시지 보존 기간 단축  
D) 데드레터 큐(DLQ) + maxReceiveCount  

**정답: D**  
해설: maxReceiveCount를 초과해 반복 실패한 메시지를 DLQ로 이동시키면 정상 큐가 막히지 않고, 이후 원인 수정 후 redrive로 재처리할 수 있습니다. FIFO 전환·가시성 타임아웃 0·보존 기간 단축은 반복 실패 메시지 격리 문제를 해결하지 못합니다.

---

**문제 3.** Step Functions에서 일시적 오류(예: ThrottlingException)에 대응할 때, 재시도 폭주(thundering herd)를 줄이기 위해 권장되는 전략은?

A) 즉시 무한 재시도  
B) 고정 간격 1초 재시도  
C) 지수 백오프 + 지터  
D) 재시도 없이 즉시 실패 처리  

**정답: C**  
해설: 지수 백오프는 재시도 간격을 점점 늘리고 지터(무작위성)는 여러 클라이언트의 동시 재시도를 분산시켜 폭주를 방지합니다. 무한·고정 간격 재시도는 부하를 가중시키고, 재시도 없는 즉시 실패는 일시적 오류 복구 기회를 버립니다.

---

**문제 4.** 비멱등 작업(예: "계좌 잔액을 100 증가")을 자동 재시도할 때 발생할 수 있는 가장 큰 위험은?

A) 동일 작업이 중복 적용되어 데이터가 잘못된다  
B) 작업이 느려진다  
C) 로그가 사라진다  
D) IAM 권한이 변경된다  

**정답: A**  
해설: 비멱등 작업을 재시도하면 같은 작업이 여러 번 적용되어(예: 잔액이 두 번 증가) 데이터 무결성이 깨집니다. 멱등 키나 조건부 쓰기로 보호해야 재시도가 안전합니다. 느려짐·로그 소실·권한 변경은 핵심 위험이 아닙니다.

---

**문제 5.** 파이프라인 장애를 디버깅할 때 가장 먼저 확인하기에 적절한 위치는?

A) 개별 익스큐터의 GC 로그  
B) S3 버킷의 요청 비용  
C) VPC 플로우 로그  
D) 오케스트레이터(Step Functions/MWAA)에서 어느 태스크가 실패했는지  

**정답: D**  
해설: 디버깅은 위에서 아래로 좁히는 것이 효율적이므로, 먼저 오케스트레이터에서 실패 지점을 식별한 뒤 해당 태스크의 로그·입력·권한을 확인합니다. GC 로그·요청 비용·플로우 로그는 범위를 좁힌 뒤 필요 시 보는 세부 단서입니다.

---
