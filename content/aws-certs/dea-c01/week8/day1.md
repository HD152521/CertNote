# Day 1 - 파이프라인 모니터링: CloudWatch 지표·로그·알람

## 📌 핵심 정리

- 관측성 = 지표(CloudWatch Metrics) + 로그(CloudWatch Logs) + 추적(X-Ray). 데이터 파이프라인 모니터링의 출발점은 CloudWatch 다.
- 알람은 `기간 × 평가 기간 수` 안에서 `Datapoints to Alarm` 개가 임계값을 넘을 때 울린다. 지표가 아예 안 올라오는 상황은 `TreatMissingData` 로 따로 정해야 잡힌다.
- Glue 는 30초마다, EMR 은 5분마다 지표를 보낸다. Glue 는 태스크 실패·셔플·익스큐터 수, EMR 은 YARN 메모리·대기 컨테이너·`IsIdle` 을 본다.
- 스트리밍 지연의 핵심 지표는 `GetRecords.IteratorAgeMilliseconds`(통계는 Maximum), 스로틀은 `Read/WriteProvisionedThroughputExceeded` 다.
- 커스텀 지표는 `PutMetricData` 보다 로그 한 줄로 지표까지 남기는 EMF 가 Lambda·컨테이너 파이프라인에 맞고, 알람 폭주는 복합 알람으로 묶는다.

## 관측성의 세 기둥과 CloudWatch

데이터 파이프라인은 "돌아가게 만드는 것"보다 "계속 돌아가는지 확인하는 것"이 더 어렵다. 오늘은 CloudWatch 를 중심으로 Glue, EMR, Kinesis 를 어떻게 관측하고 지연을 추적하는지 본다.

- 운영 가시성은 보통 **지표(metrics)**, **로그(logs)**, **추적(traces)** 세 기둥으로 설명한다. AWS 에서는 각각 CloudWatch Metrics, CloudWatch Logs, AWS X-Ray 다.
- 대부분의 AWS 서비스가 운영 지표를 별도 설정 없이 자기 네임스페이스로 게시하므로, 파이프라인 모니터링은 거의 항상 CloudWatch 에서 시작한다.

| 구성 요소 | 담는 것 | 파이프라인에서의 쓰임 |
|------|------|------|
| CloudWatch Metrics | 시계열 수치(네임스페이스·차원으로 구분) | 잡 실패 수, 처리 레코드 수, 지연 |
| CloudWatch Logs | 텍스트 로그 스트림 | 잡 stdout, 드라이버·익스큐터 로그, Lambda 출력 |
| CloudWatch Alarms | 지표와 임계값의 비교 결과 | SNS 통보, 자동 액션 |
| AWS X-Ray | 요청 한 건이 거친 구간별 시간 | Lambda·API 가 끼어 있는 구간의 병목 추적 |

## 지표의 구조: 네임스페이스·차원·해상도·보존

- 지표는 **이름 + 네임스페이스 + 차원(dimension)** 의 조합으로 식별된다. 차원 조합이 다르면 이름이 같아도 다른 지표다. 한 지표에 차원을 30개까지 붙일 수 있다.
- AWS 서비스 지표는 차원을 생략해 조회하면 합쳐 주는 경우가 있지만, **커스텀 지표는 차원을 가로질러 집계해 주지 않는다.** 게시한 차원 조합 그대로만 조회된다. "차원 하나만 지정했더니 데이터가 안 나온다"의 원인이다.
- 해상도는 두 가지다. 표준 해상도는 1분 단위, 고해상도는 1초 단위이며 커스텀 지표만 고해상도로 게시할 수 있다.
- 지표는 지울 수 없고, 새 데이터가 들어오지 않으면 15개월 뒤 만료된다. 오래될수록 굵게 뭉쳐서 보관된다.

| 데이터 포인트의 주기 | 보관 기간 |
|------|------|
| 60초 미만(고해상도) | 3시간 |
| 1분 | 15일 |
| 5분 | 63일 |
| 1시간 | 455일(15개월) |

- 알람 주기는 지표 해상도보다 짧게 잡으면 의미가 없다. 5분마다 올라오는 지표에 1분 알람을 걸면 대부분의 구간이 "데이터 없음"이 된다.
- 고해상도 지표에는 10초·30초 주기의 고해상도 알람을 걸 수 있고, 이 알람은 일반 알람보다 비싸다.

> 💡 **관련 이론**: 빠르게 변하는 스트리밍 지연을 초 단위로 잡으려면 고해상도 커스텀 지표를, 일반 배치 잡은 표준 해상도를 쓴다. 고해상도는 3시간만 초 단위로 남으므로 "어젯밤 추이"를 보는 용도로는 어차피 1분 집계가 된다.

## 커스텀 지표: PutMetricData, EMF, 지표 필터

서비스 기본 지표만으로 부족하면 애플리케이션이 직접 지표를 만든다. 방법이 세 가지다.

| 방법 | 동작 | 맞는 상황 | 약점 |
|------|------|------|------|
| `PutMetricData` API | 코드가 CloudWatch 를 직접 호출 | 호출 빈도가 낮은 배치 잡 | 호출마다 과금, 동기 호출이면 지연이 얹힘 |
| EMF(Embedded Metric Format) | 정해진 구조의 JSON 로그를 찍으면 CloudWatch 가 지표를 뽑아냄 | Lambda·컨테이너처럼 로그가 이미 흘러가는 환경 | 로그 수집 경로가 있어야 함 |
| 지표 필터(metric filter) | 기존 로그에서 패턴이 맞는 줄을 세어 지표로 만듦 | 코드를 못 고치는 잡의 `ERROR` 건수 | 패턴 매칭만 가능, 필터 생성 이전 로그에는 소급 안 됨 |

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

- EMF 는 로그 한 줄로 지표와 컨텍스트(어느 파이프라인, 어느 배치)를 함께 남긴다. 지표가 튀었을 때 같은 로그에서 원인을 바로 찾을 수 있다.
- 차원에 요청 ID 처럼 값이 무한히 늘어나는 필드를 넣으면 차원 조합마다 지표가 하나씩 생겨 비용이 불어난다. 차원은 파이프라인 이름·환경처럼 가짓수가 적은 값으로 한정한다.

## 알람은 어떻게 평가되나

| 설정 | 의미 |
|------|------|
| Period | 데이터 포인트 하나를 만드는 집계 구간 |
| Evaluation Periods (N) | 최근 몇 개 구간을 볼지 |
| Datapoints to Alarm (M) | 그중 몇 개가 임계값을 넘어야 ALARM 인지("M out of N") |
| TreatMissingData | 데이터 포인트가 없는 구간을 무엇으로 볼지 |

- 알람 상태는 `OK`, `ALARM`, `INSUFFICIENT_DATA` 셋이다. 액션은 **상태가 바뀔 때** 한 번 실행된다(Auto Scaling 액션만 예외).
- 누락 데이터 처리 값은 넷이고 기본값은 `missing` 이다.

| 값 | 누락 구간의 취급 | 맞는 지표 |
|------|------|------|
| `missing`(기본) | 평가 범위가 전부 비면 `INSUFFICIENT_DATA` | 일반적인 경우 |
| `notBreaching` | 정상으로 간주 | 오류가 났을 때만 올라오는 지표(스로틀 건수 등) |
| `breaching` | 위반으로 간주 | 항상 올라와야 하는 지표(하트비트, 처리 건수) |
| `ignore` | 현재 상태 유지 | 간헐적으로만 보고되는 지표 |

- 잡이 아예 돌지 않으면 실패 지표도 올라오지 않는다. 기본값이라면 알람은 `INSUFFICIENT_DATA` 로 갈 뿐 통보가 없다. "밤새 파이프라인이 멈췄는데 알람이 조용했다"는 사고의 전형이다. 처리 건수 같은 지표에 `breaching` 을 주거나 `INSUFFICIENT_DATA` 전이에도 액션을 건다.
- **복합 알람(Composite Alarm)** 은 다른 알람들의 상태를 AND/OR 로 묶는다. 하위 알람에는 통보를 걸지 않고 복합 알람에만 걸면 알람 폭주가 줄어든다. 복합 알람은 SNS 통보는 되지만 EC2·Auto Scaling 액션은 실행하지 못한다.
- 알람은 증상(지연 증가, 실패율 상승)에 걸고, 단순 리소스 수치는 대시보드로 본다.

```bash
# 컨슈머 지연이 1분을 넘는 상태가 5분 지속되면 통보
aws cloudwatch put-metric-alarm \
  --alarm-name orders-stream-consumer-lag \
  --namespace AWS/Kinesis \
  --metric-name GetRecords.IteratorAgeMilliseconds \
  --dimensions Name=StreamName,Value=orders \
  --statistic Maximum --period 60 \
  --evaluation-periods 5 --datapoints-to-alarm 5 \
  --threshold 60000 --comparison-operator GreaterThanThreshold \
  --treat-missing-data breaching \
  --alarm-actions arn:aws:sns:ap-northeast-2:111122223333:data-oncall
```

- 이 지표는 컨슈머가 `GetRecords` 를 호출해야 생긴다. 컨슈머가 죽으면 지표가 끊기므로 `breaching` 으로 둬야 "컨슈머 정지"도 같은 알람으로 잡힌다.

## Glue 모니터링

Glue 잡은 잡 지표를 켜면(`--enable-metrics`) `Glue` 네임스페이스로 **30초마다** 지표를 보낸다. 차원은 `JobName`, `JobRunId`, `Type`(count 또는 gauge) 이다. 커스텀 지표로 잡히므로 CloudWatch 요금이 붙을 수 있다.

| 지표 | 알려 주는 것 |
|------|------|
| `glue.driver.aggregate.numCompletedTasks` / `numFailedTasks` | 진행 상황, 데이터·스크립트 이상으로 인한 태스크 실패 |
| `glue.driver.aggregate.numKilledTasks` | OOM 등으로 죽은 태스크(스큐 의심) |
| `glue.driver.aggregate.elapsedTime` | ETL 경과 시간(부트스트랩 제외). 평소보다 느린 실행 감지 |
| `glue.driver.aggregate.bytesRead` / `recordsRead` | 읽은 양. 북마크가 건너뛰었는지, 같은 데이터를 다시 읽는지 |
| `glue.driver.aggregate.shuffleBytesWritten` | 셔플량. 큰 조인·groupBy·repartition 의 비용 |
| `glue.driver.jvm.heap.usage` / `glue.ALL.jvm.heap.usage` | 드라이버·익스큐터 힙 사용률(0~1). OOM 전조 |
| `glue.driver.ExecutorAllocationManager.executors.numberAllExecutors` | 지금 돌고 있는 익스큐터 수 |
| `glue.driver.ExecutorAllocationManager.executors.numberMaxNeededExecutors` | 현재 부하에 필요한 최대 익스큐터 수 |

- 마지막 두 지표를 겹쳐 본다. "필요한 수"가 "돌고 있는 수"보다 계속 크면 DPU 가 부족한 것이고, 반대로 한참 작으면 과하게 잡은 것이다.
- 드라이버 힙만 치솟으면 드라이버로 데이터를 끌어오는 코드(`collect`)나 작은 파일 수십만 개의 목록 조회를 의심한다. 특정 익스큐터만 치솟으면 스큐다.
- **로그**: Glue 5.0 부터는 모든 잡이 실시간으로 로그를 남긴다. 4.0 이하에서는 **연속 로깅(Continuous Logging)** 을 켜야(`--enable-continuous-cloudwatch-log`) 잡이 끝나기 전에 로그가 CloudWatch Logs 로 흘러가고, 끄면 잡이 끝난 뒤에야 볼 수 있다. 시험 자료는 대개 "연속 로깅을 켠다"로 묻는다.
- 기본 로그 그룹은 `/aws-glue/jobs/output`(사용자 stdout·stderr)과 `/aws-glue/jobs/error`(시스템·Spark 로그)다.

```python
# 잡 스크립트 안에서 실시간으로 드라이버 로그 스트림에 남기기
logger = glueContext.get_logger()
logger.info("orders partition dt=2026-06-26 loaded")
logger.error("schema mismatch: email column missing")
```

> 💡 **관련 이론**: Glue Job Bookmark 는 모니터링 지표가 아니라, 이미 처리한 데이터를 건너뛰게 해 재실행 시 중복 처리를 막는 상태다. 다만 `bytesRead` 지표가 갑자기 0 에 가까워지거나 평소의 몇 배가 되면 북마크가 꼬였다는 단서가 된다.

## EMR 모니터링

EMR 은 클러스터 지표를 `AWS/ElasticMapReduce` 네임스페이스로 **5분마다** 보낸다. 간격은 바꿀 수 없고 지표 자체에는 요금이 없다.

| 지표 | 의미 | 쓰는 곳 |
|------|------|------|
| `YARNMemoryAvailablePercentage` | YARN 에 남은 메모리 비율 | 확장 판단, 실패 전조 |
| `ContainerPendingRatio` | 대기 컨테이너 ÷ 할당된 컨테이너(비율이 아니라 숫자) | 리소스 부족 신호 |
| `AppsPending` / `AppsRunning` / `AppsFailed` | YARN 애플리케이션 상태 | 진행·건강 |
| `HDFSUtilization` | HDFS 사용률 | 코어 노드 증설 판단 |
| `MRUnhealthyNodes` / `MRLostNodes` | 디스크가 찼거나 통신이 끊긴 노드 수 | 노드 장애 |
| `IsIdle` | 태스크·잡이 없으면 1 | 유휴 클러스터 감지 |

- `IsIdle` 은 5분마다 **그 순간**만 본다. 값이 1 이라고 5분 내내 놀았다는 뜻이 아니므로, 30분처럼 여러 번 연속으로 1 일 때 알람을 건다.
- 유휴 클러스터를 직접 끄는 기능은 **자동 종료 정책(auto-termination policy)** 이다. 지정한 유휴 시간이 지나면 EMR 이 클러스터를 종료한다.
- 클러스터가 사라지면 노드의 로그도 사라진다. 스텝 로그와 Spark 이벤트 로그를 S3 에 보관하도록 설정해야 종료 후에도 디버깅할 수 있다.

## Kinesis 모니터링과 지연 추적

스트리밍에서는 "지금 얼마나 뒤처져 있는가"가 핵심이다.

| 지표 | 의미 | 조치 방향 |
|------|------|------|
| `GetRecords.IteratorAgeMilliseconds` | 마지막으로 읽은 레코드가 스트림에 들어온 지 얼마나 됐는지. 0 이면 완전히 따라잡은 상태 | 컨슈머 처리량 확대, 오류 재시도 정체 확인 |
| `IncomingBytes` / `IncomingRecords` | 유입량 | 샤드 수 재계산의 근거 |
| `WriteProvisionedThroughputExceeded` | 스로틀로 거부된 쓰기 레코드 수 | 샤드 증설, 파티션 키 분포 점검 |
| `ReadProvisionedThroughputExceeded` | 스로틀된 `GetRecords` 호출 수 | 컨슈머 수 줄이기, 향상된 팬아웃 |
| `PutRecords.ThrottledRecords` / `FailedRecords` | 배치 안에서 거부된 레코드 | 프로듀서의 부분 실패 재전송 확인 |
| `SubscribeToShardEvent.MillisBehindLatest` | 향상된 팬아웃 컨슈머가 스트림 끝에서 얼마나 떨어져 있는지 | 컨슈머별 지연 |

- 스트림 수준 지표는 1분마다 무료로 올라온다. **샤드 수준 지표(향상된 모니터링)** 는 `EnableEnhancedMonitoring` 으로 따로 켜야 하고 샤드·지표 단위로 과금된다. "특정 샤드만 뜨거운지"는 이것을 켜야 보인다.
- 이터레이터 에이지 알람은 **Maximum** 통계에 건다. Average 는 잘 따라오는 샤드에 가려 뒤처진 샤드를 숨긴다.
- 이 값이 보존 기간의 절반을 넘으면 레코드가 만료돼 사라질 위험이 있다. 스로틀 알람보다 이 알람이 먼저다.

## 로그에서 답 찾기

- 로그 그룹의 보존 기간을 정하지 않으면 로그가 만료 없이 쌓인다. 잡마다 보존 기간을 정해 저장 비용을 통제한다.
- **Logs Insights** 는 로그 그룹을 쿼리 언어로 조회한다. 스캔한 로그 양만큼 과금되므로 시간 범위를 좁혀서 돌린다.
- **구독 필터(subscription filter)** 는 로그를 실시간으로 Lambda·Kinesis·Firehose 로 넘긴다. 로그를 S3 에 장기 보관하거나 OpenSearch 로 보낼 때 쓴다.

```text
# Logs Insights: 최근 실행에서 5분 단위 오류 건수
fields @timestamp, @message
| filter @message like /Exception|ERROR/
| stats count(*) as errors by bin(5m)
| sort errors desc
```

## 증상 → 원인 → 조치

| 증상 | 가능성 높은 원인 | 조치 |
|------|------|------|
| 파이프라인이 멈췄는데 알람이 안 울림 | 지표가 끊겨 `INSUFFICIENT_DATA` 로만 감 | `TreatMissingData=breaching` 또는 처리 건수 하한 알람 |
| 알람이 한꺼번에 수십 개 울림 | 원인 하나가 여러 지표에 번짐 | 복합 알람으로 묶고 통보는 상위 알람에만 |
| Glue 잡이 평소의 몇 배 걸림, 익스큐터 일부만 바쁨 | 데이터 스큐 | 셔플 지표·익스큐터별 힙 확인, 키 분산 |
| EMR 스텝이 대기만 함 | YARN 메모리 부족 | `ContainerPendingRatio`·`YARNMemoryAvailablePercentage` 확인 후 확장 |
| 이터레이터 에이지가 계속 증가 | 컨슈머 처리 속도 부족 또는 오류 재시도로 정체 | 컨슈머 로그·오류율 확인, 샤드·병렬도 확대 |
| 커스텀 지표 요금 급증 | 차원에 고유값이 많은 필드 사용 | 차원을 가짓수 적은 값으로 축소 |

## 지문 단서 → 정답 판별표

| 지문 단서 | 정답 |
|------|------|
| "컨슈머가 뒤처지는지 가장 직접 보여 주는 지표" | `GetRecords.IteratorAgeMilliseconds` |
| "잡이 끝나기 전에 로그를 실시간으로" | Glue 연속 로깅 |
| "로그 한 줄로 지표와 컨텍스트를 함께" | EMF |
| "코드를 고치지 않고 기존 로그의 오류 건수를 지표로" | CloudWatch Logs 지표 필터 |
| "여러 알람을 AND/OR 로 묶어 알림 폭주 억제" | 복합 알람 |
| "유휴 EMR 클러스터 감지" | `IsIdle`(또는 자동 종료 정책) |
| "특정 샤드만 스로틀되는지 확인" | 샤드 수준 향상된 모니터링 |
| "누가 설정을 바꿨는지" | CloudWatch 가 아니라 CloudTrail(Day 3) |

내일은 파이프라인이 멀쩡히 돌아도 내용이 틀릴 수 있다는 문제, 즉 Glue Data Quality 와 검증 게이트를 다룬다.

## 📖 용어

- **네임스페이스** : 지표를 담는 그릇. AWS 서비스는 `AWS/Kinesis` 처럼 자기 네임스페이스를 쓴다.
- **차원(dimension)** : 지표에 붙는 이름·값 쌍. 같은 지표 이름이라도 차원이 다르면 별개의 지표다.
- **EMF** : 정해진 구조의 JSON 로그를 찍으면 CloudWatch 가 알아서 지표를 뽑아 주는 형식.
- **지표 필터** : 로그에서 패턴이 맞는 줄을 세어 지표로 바꿔 주는 설정.
- **Datapoints to Alarm** : 평가 구간 가운데 몇 개가 임계값을 넘어야 알람이 울리는지 정하는 값.
- **TreatMissingData** : 데이터가 안 올라온 구간을 정상·위반·무시 중 무엇으로 볼지 정하는 알람 설정.
- **복합 알람** : 다른 알람들의 상태를 AND/OR 로 묶어 하나로 평가하는 알람.
- **연속 로깅** : Glue 잡이 끝나기 전에도 로그를 실시간으로 CloudWatch Logs 에 보내는 기능.
- **이터레이터 에이지** : 컨슈머가 방금 읽은 레코드가 스트림에 들어온 지 얼마나 지났는지. 클수록 밀려 있다.
- **향상된 모니터링** : Kinesis 지표를 샤드 단위로 받아 보는 유료 옵션.

## 📝 연습 문제

**문제 1.** Kinesis Data Streams 컨슈머가 유입 속도를 따라가지 못해 처리 지연이 누적되고 있는지 가장 직접적으로 나타내는 CloudWatch 지표는?

A) IncomingBytes  
B) GetRecords.IteratorAgeMilliseconds  
C) WriteProvisionedThroughputExceeded  
D) PutRecord.Success  

**정답: B**  
해설: IteratorAgeMilliseconds는 컨슈머가 현재 읽고 있는 레코드의 나이를 나타내며, 값이 계속 커지면 컨슈머가 뒤처지고 있다는 핵심 신호이다. IncomingBytes는 유입량, WriteProvisionedThroughputExceeded는 쓰기 스로틀링, PutRecord.Success는 생산자 성공률로 컨슈머 지연을 직접 나타내지 않는다.

---

**문제 2.** Glue ETL 잡이 장시간 실행되는 동안 잡이 끝나기 전에도 실시간으로 로그를 CloudWatch Logs에서 확인하려면 어떤 기능을 활성화해야 하는가?

A) Job Bookmark  
B) Partition Projection  
C) DynamicFrame  
D) Continuous Logging(연속 로깅)  

**정답: D**  
해설: 연속 로깅을 활성화하면 잡 완료 전에도 드라이버·익스큐터 로그가 실시간으로 CloudWatch Logs로 전송된다. Job Bookmark는 재처리 시 중복 방지용 상태, Partition Projection은 Athena 파티션 계산, DynamicFrame은 Glue의 데이터 추상화로 실시간 로깅과 무관하다.

---

**문제 3.** Lambda나 컨테이너 기반 파이프라인에서 로그 한 줄에 지표와 풍부한 컨텍스트를 함께 남기고 CloudWatch가 자동으로 지표를 추출하게 하는 방식은?

A) PutMetricData를 호출마다 동기 실행  
B) X-Ray 세그먼트  
C) EMF(Embedded Metric Format)  
D) CloudTrail 데이터 이벤트  

**정답: C**  
해설: EMF는 구조화된 JSON 로그를 출력하면 CloudWatch가 자동으로 커스텀 지표를 추출하는 방식으로, 별도 API 호출 없이 지표와 컨텍스트를 동시에 기록한다. PutMetricData 동기 호출은 지연·비용 부담이 크고, X-Ray는 추적, CloudTrail은 API 감사 용도이다.

---

**문제 4.** 여러 개의 개별 알람이 동시에 울려 알림이 폭주(alarm storm)하는 것을 줄이기 위해, 알람들을 AND/OR 논리로 묶어 하나의 상위 상태로 평가하는 CloudWatch 기능은?

A) Composite Alarm(복합 알람)  
B) Metric Math  
C) Anomaly Detection  
D) Dashboard Widget  

**정답: A**  
해설: 복합 알람은 여러 알람의 상태를 불리언 식으로 결합해 단일 알람으로 평가하므로 알람 폭주를 줄이고 의미 있는 상황에서만 통보할 수 있다. Metric Math는 지표 계산, Anomaly Detection은 동적 임계값, Dashboard는 시각화 용도이다.

---

**문제 5.** EMR 클러스터가 작업을 마치고 더 이상 처리할 것이 없어 비용만 발생하는 상태인지 판단해 자동 종료 결정을 돕는 CloudWatch 지표로 가장 적절한 것은?

A) IsIdle  
B) ContainerPendingRatio  
C) AppsRunning  
D) IncomingRecords  

**정답: A**  
해설: IsIdle은 클러스터가 유휴 상태인지 나타내어 비용 절감을 위한 자동 종료 판단에 사용된다. ContainerPendingRatio는 리소스 부족, AppsRunning은 실행 중 앱 수를 나타내며, IncomingRecords는 Kinesis 지표로 EMR과 무관하다.

---
