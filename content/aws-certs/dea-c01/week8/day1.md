# Day 1 - 파이프라인 모니터링: CloudWatch 지표·로그·알람

데이터 파이프라인은 "돌아가게 만드는 것"보다 "계속 돌아가는지 확인하는 것"이 더 어렵습니다. 오늘은 CloudWatch를 중심으로 Glue, EMR, Kinesis 같은 데이터 서비스를 어떻게 관측(observability)하고 지연을 추적하는지 다룹니다.

## 관측성의 세 기둥과 CloudWatch

운영 가시성은 보통 **지표(metrics)**, **로그(logs)**, **추적(traces)** 세 기둥으로 설명합니다. AWS에서는 이 셋이 각각 CloudWatch Metrics, CloudWatch Logs, AWS X-Ray로 매핑됩니다. 데이터 파이프라인 모니터링의 출발점은 거의 항상 CloudWatch입니다. 대부분의 AWS 서비스가 운영 지표를 별도 설정 없이 CloudWatch 네임스페이스로 자동 게시하기 때문입니다.

- **CloudWatch Metrics**: 시계열 수치(잡 실행 수, 처리 레코드 수, 지연 등). 네임스페이스/차원으로 구분.
- **CloudWatch Logs**: 텍스트 로그 스트림(잡 stdout, 드라이버/익스큐터 로그, Lambda 출력).
- **CloudWatch Alarms**: 지표가 임계값을 넘으면 SNS로 알림하거나 자동 액션 실행.

> 💡 **관련 이론**: CloudWatch 지표에는 표준 해상도(1분)와 고해상도(1초)가 있습니다. 빠르게 변하는 스트리밍 지연을 잡으려면 고해상도 커스텀 지표를, 일반 배치 잡은 표준 해상도를 사용합니다.

## 커스텀 지표와 EMF

서비스 기본 지표만으로 부족할 때는 애플리케이션에서 직접 커스텀 지표를 게시합니다. `PutMetricData` API를 쓰거나, 더 효율적으로는 **EMF(Embedded Metric Format)** 로그를 출력하면 CloudWatch가 자동으로 지표를 추출합니다.

```json
{
  "_aws": {
    "Timestamp": 1750000000000,
    "CloudWatchMetrics": [{
      "Namespace": "DataPipeline",
      "Dimensions": [["PipelineName"]],
      "Metrics": [{ "Name": "RecordsProcessed", "Unit": "Count" }]
    }]
  },
  "PipelineName": "orders-etl",
  "RecordsProcessed": 18420
}
```

EMF는 로그 한 줄로 지표와 풍부한 컨텍스트를 동시에 남길 수 있어 Lambda·컨테이너 기반 파이프라인에서 선호됩니다.

## Glue 모니터링

Glue 잡은 기본적으로 다음 지표를 게시합니다.

- `glue.driver.aggregate.numCompletedTasks` / `numFailedTasks`: 태스크 성공·실패 수.
- `glue.driver.aggregate.elapsedTime`: 잡 경과 시간.
- `glue.driver.ExecutorAllocationManager.executors`: 활성 익스큐터 수(스케일링 관찰).
- `glue.driver.aggregate.shuffleBytesWritten`: 셔플량(데이터 스큐·조인 비용 단서).

```python
# Glue 잡에서 Job Bookmark + 연속 로깅(Continuous Logging) 활성화
job = Job(glueContext)
job.init(args['JOB_NAME'], args)
# --enable-continuous-cloudwatch-log, --enable-metrics 를 잡 파라미터로 지정
```

연속 로깅(Continuous Logging)을 켜면 잡이 끝나기 전에도 실시간 로그가 CloudWatch Logs로 흘러가, 장시간 잡의 진행 상황을 추적할 수 있습니다.

> 💡 **관련 이론**: Glue Job Bookmark는 모니터링 지표는 아니지만, 재처리 시 이미 처리한 데이터를 건너뛰어 멱등성을 돕는 상태입니다. 실패 후 재시작 시 중복 처리를 방지합니다.

## EMR 모니터링

EMR은 클러스터·노드·YARN 수준 지표를 CloudWatch에 게시합니다.

- `YARNMemoryAvailablePercentage`, `MemoryAvailableMB`: 메모리 여유(스케일링·실패 단서).
- `ContainerPendingRatio`: 대기 중 컨테이너 비율 → 리소스 부족 신호.
- `AppsRunning`, `AppsFailed`: 애플리케이션 상태.
- `IsIdle`: 유휴 여부(비용 절감용 자동 종료 판단).

Spark UI와 EMR 단계(step) 로그는 S3에 보관하도록 설정해 클러스터 종료 후에도 디버깅할 수 있게 합니다.

## Kinesis 모니터링과 지연 추적

스트리밍에서는 "지금 얼마나 뒤처져 있는가"가 핵심입니다.

- **`GetRecords.IteratorAgeMilliseconds`**: 컨슈머가 읽는 레코드가 얼마나 오래된 것인지. 이 값이 계속 커지면 컨슈머가 유입 속도를 못 따라가는 것(처리 지연의 핵심 지표).
- `IncomingRecords` / `IncomingBytes`: 유입량.
- `WriteProvisionedThroughputExceeded` / `ReadProvisionedThroughputExceeded`: 샤드 처리량 초과(스로틀링) → 샤드 증설 또는 On-Demand 전환 신호.

```text
알람 예: IteratorAgeMilliseconds > 60000 (1분) 동안 5분 지속 → SNS 통보
의미: 컨슈머 지연 누적, 샤드/병렬도/처리 로직 점검 필요
```

## 알람 설계 원칙

- **증상 기반 알람**: 사용자에게 영향을 주는 증상(지연 증가, 실패율 상승)에 알람을 걸고, 단순 리소스 수치는 대시보드로만 본다.
- **복합 알람(Composite Alarm)**: 여러 알람을 AND/OR로 묶어 알람 폭주(alarm storm)를 줄인다.
- **`TreatMissingData`**: 데이터 누락을 `breaching`으로 볼지 `notBreaching`으로 볼지 명시. 잡이 아예 안 돌아 지표가 안 올라오는 상황을 놓치지 않으려면 `breaching`이 안전한 경우가 많다.

## 핵심 정리

- 관측성 = 지표(Metrics) + 로그(Logs) + 추적(X-Ray), 데이터 파이프라인의 출발점은 CloudWatch.
- Glue: 연속 로깅 + `--enable-metrics`로 실시간 추적, 태스크 실패·셔플 지표 관찰.
- EMR: YARN 메모리·대기 컨테이너·IsIdle로 리소스·비용 판단, 로그는 S3 보관.
- Kinesis 지연의 핵심 지표는 `IteratorAgeMilliseconds`, 스로틀링은 ProvisionedThroughputExceeded.

## 📝 연습 문제

**문제 1.** Kinesis Data Streams 컨슈머가 유입 속도를 따라가지 못해 처리 지연이 누적되고 있는지 가장 직접적으로 나타내는 CloudWatch 지표는?

A) IncomingBytes  
B) GetRecords.IteratorAgeMilliseconds  
C) WriteProvisionedThroughputExceeded  
D) PutRecord.Success  

**정답: B**  
해설: IteratorAgeMilliseconds는 컨슈머가 현재 읽고 있는 레코드의 나이를 나타내며, 값이 계속 커지면 컨슈머가 뒤처지고 있다는 핵심 신호입니다. IncomingBytes는 유입량, WriteProvisionedThroughputExceeded는 쓰기 스로틀링, PutRecord.Success는 생산자 성공률로 컨슈머 지연을 직접 나타내지 않습니다.

---

**문제 2.** Glue ETL 잡이 장시간 실행되는 동안 잡이 끝나기 전에도 실시간으로 로그를 CloudWatch Logs에서 확인하려면 어떤 기능을 활성화해야 하는가?

A) Job Bookmark  
B) Partition Projection  
C) DynamicFrame  
D) Continuous Logging(연속 로깅)  

**정답: D**  
해설: 연속 로깅을 활성화하면 잡 완료 전에도 드라이버·익스큐터 로그가 실시간으로 CloudWatch Logs로 전송됩니다. Job Bookmark는 재처리 시 중복 방지용 상태, Partition Projection은 Athena 파티션 계산, DynamicFrame은 Glue의 데이터 추상화로 실시간 로깅과 무관합니다.

---

**문제 3.** Lambda나 컨테이너 기반 파이프라인에서 로그 한 줄에 지표와 풍부한 컨텍스트를 함께 남기고 CloudWatch가 자동으로 지표를 추출하게 하는 방식은?

A) PutMetricData를 호출마다 동기 실행  
B) X-Ray 세그먼트  
C) EMF(Embedded Metric Format)  
D) CloudTrail 데이터 이벤트  

**정답: C**  
해설: EMF는 구조화된 JSON 로그를 출력하면 CloudWatch가 자동으로 커스텀 지표를 추출하는 방식으로, 별도 API 호출 없이 지표와 컨텍스트를 동시에 기록합니다. PutMetricData 동기 호출은 지연·비용 부담이 크고, X-Ray는 추적, CloudTrail은 API 감사 용도입니다.

---

**문제 4.** 여러 개의 개별 알람이 동시에 울려 알림이 폭주(alarm storm)하는 것을 줄이기 위해, 알람들을 AND/OR 논리로 묶어 하나의 상위 상태로 평가하는 CloudWatch 기능은?

A) Composite Alarm(복합 알람)  
B) Metric Math  
C) Anomaly Detection  
D) Dashboard Widget  

**정답: A**  
해설: 복합 알람은 여러 알람의 상태를 불리언 식으로 결합해 단일 알람으로 평가하므로 알람 폭주를 줄이고 의미 있는 상황에서만 통보할 수 있습니다. Metric Math는 지표 계산, Anomaly Detection은 동적 임계값, Dashboard는 시각화 용도입니다.

---

**문제 5.** EMR 클러스터가 작업을 마치고 더 이상 처리할 것이 없어 비용만 발생하는 상태인지 판단해 자동 종료 결정을 돕는 CloudWatch 지표로 가장 적절한 것은?

A) IsIdle  
B) ContainerPendingRatio  
C) AppsRunning  
D) IncomingRecords  

**정답: A**  
해설: IsIdle은 클러스터가 유휴 상태인지 나타내어 비용 절감을 위한 자동 종료 판단에 사용됩니다. ContainerPendingRatio는 리소스 부족, AppsRunning은 실행 중 앱 수를 나타내며, IncomingRecords는 Kinesis 지표로 EMR과 무관합니다.

---
