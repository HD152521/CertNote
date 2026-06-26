# Day 3 - 로깅·감사·트러블슈팅: CloudTrail과 실패 복구

파이프라인이 멈췄을 때 "무슨 일이 있었는가"를 재구성하는 능력이 운영의 절반입니다. 오늘은 CloudTrail로 누가 무엇을 했는지 감사하고, 파이프라인을 체계적으로 디버깅하며, 실패에서 복구하고 DLQ(데드레터 큐)를 처리하는 방법을 다룹니다.

## CloudTrail: 누가·언제·무엇을

CloudTrail은 계정의 **API 호출 감사 로그**입니다. CloudWatch가 "시스템이 어떻게 동작하는가(지표·로그)"라면, CloudTrail은 "누가 어떤 작업을 호출했는가"를 기록합니다.

- **관리 이벤트(Management Events)**: 리소스 생성·수정·삭제, IAM 변경 등 제어 평면 작업. 기본 활성.
- **데이터 이벤트(Data Events)**: S3 객체 GET/PUT, Lambda Invoke 등 데이터 평면 작업. 양이 많아 기본 비활성이며 선택적으로 켬.
- **인사이트 이벤트(Insights)**: 비정상적 API 호출 급증 등 자동 탐지.

```text
질문: "어제 새벽 curated 테이블이 누가 DROP 했지?"
→ CloudTrail에서 glue:DeleteTable / athena 쿼리 이벤트를 시간·자격증명(userIdentity)으로 추적
```

> 💡 **관련 이론**: CloudWatch Logs와 CloudTrail은 역할이 다릅니다. CloudWatch Logs는 애플리케이션이 쓴 로그, CloudTrail은 AWS API 호출 기록입니다. 보안·감사·"누가 했나" 질문은 CloudTrail로 답합니다.

조직 전체의 CloudTrail 로그는 중앙 S3 버킷에 모으고, 감사용으로 변경 불가능하게(객체 잠금/별도 계정) 보관하는 것이 모범 사례입니다.

## 파이프라인 디버깅 워크플로우

장애가 났을 때 무작정 코드를 보지 말고 위에서 아래로 좁혀 갑니다.

1. **오케스트레이터부터**: Step Functions 실행 그래프 / Airflow(MWAA) DAG에서 어느 태스크가 실패했는지 확인.
2. **실패 태스크의 로그**: 해당 Glue/EMR/Lambda 잡의 CloudWatch Logs에서 예외 스택 확인.
3. **입력 데이터 점검**: 스키마 변경, 빈 파티션, 깨진 파일 여부.
4. **권한·리소스 점검**: IAM 거부, 스로틀링, 메모리 부족(OOM) 여부.
5. **CloudTrail로 변경 추적**: 최근 누군가 테이블·정책·설정을 바꿨는지.

```text
Step Functions 실행 → ❌ TransformJob 실패
  → CloudWatch Logs(Glue): "AnalysisException: cannot resolve 'email'"
  → 원인: 업스트림 스키마에서 email 컬럼명이 user_email로 변경됨
  → 조치: 매핑 수정 + 스키마 검증 게이트 추가
```

## 흔한 실패 유형과 단서

- **스로틀링**: `ProvisionedThroughputExceededException`, `Rate exceeded` → 백오프·재시도, 용량 증설.
- **메모리 부족(OOM)**: Spark 익스큐터 OOM → 파티션 수 조정, 익스큐터 메모리 상향, 데이터 스큐 해소.
- **권한 거부**: `AccessDenied` → IAM/Lake Formation 권한, KMS 키 권한 확인.
- **데이터 스큐**: 특정 키에 데이터 집중 → 일부 태스크만 오래 걸림(`shuffleBytes` 지표로 단서).

## 재시도와 실패 복구

분산 시스템에서 일시적 오류는 정상입니다. 핵심은 **재시도 가능한 오류와 영구 오류를 구분**하는 것입니다.

```json
// Step Functions 재시도/캐치 (개념 예시)
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

- **지수 백오프 + 지터**: 재시도 간격을 점점 늘리고 무작위성을 더해 동시 재시도 폭주(thundering herd)를 방지.
- **최대 재시도 후 캐치**: 영구 실패는 격리·통보 경로로 보냄.

> 💡 **관련 이론**: 재시도는 멱등 작업에서만 안전합니다. 비멱등 작업(예: "잔액 증가")을 무턱대고 재시도하면 중복 적용됩니다. 멱등 키나 조건부 쓰기로 보호하세요.

## DLQ(데드레터 큐) 처리

처리에 반복 실패한 메시지를 정상 큐에 영원히 남겨두면 컨슈머가 막힙니다. **DLQ**는 일정 횟수 이상 실패한 메시지를 따로 빼두는 큐입니다.

- **SQS**: 원본 큐의 `maxReceiveCount`를 초과한 메시지를 DLQ로 이동.
- **Lambda(비동기 호출)**: 실패 시 SQS/SNS DLQ 또는 더 일반적인 **Lambda Destinations**(onFailure)로 보냄.
- **Kinesis/이벤트 소스 매핑**: `OnFailure` 대상으로 실패 배치 메타데이터를 SQS/SNS에 기록.

```text
정상 큐 → 컨슈머 처리 실패 N회 → DLQ
DLQ → (운영자/재처리 잡) → 원인 분석 → 수정 후 재투입(redrive)
```

SQS의 **DLQ redrive** 기능으로 원인 수정 후 DLQ의 메시지를 원본 큐로 다시 보내 재처리할 수 있습니다.

## 핵심 정리

- CloudTrail = "누가 무슨 API를 호출했나"(감사), CloudWatch Logs = "애플리케이션이 무엇을 출력했나".
- 디버깅은 오케스트레이터 → 실패 태스크 로그 → 입력 데이터 → 권한 → CloudTrail 순으로 좁힌다.
- 재시도는 일시적 오류에 지수 백오프+지터로, 영구 실패는 캐치로 격리. 멱등 작업에서만 안전.
- DLQ로 반복 실패 메시지를 격리하고, 원인 수정 후 redrive로 재처리.

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
