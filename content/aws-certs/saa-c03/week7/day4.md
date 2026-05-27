# Day 34 - Kinesis: 실시간 스트림이 큐와 어떻게 다른 문제를 푸는가

Day 1~3에서 본 SQS·SNS·EventBridge는 모두 **메시지 단위**로 동작한다. 한 메시지가 발생 → 라우팅 → 컨슈머가 받아 처리 → 끝. 메시지의 보존은 길어도 14일이고, 컨슈머가 한 번 처리하면 메시지는 사라지거나(SQS) 다시 볼 수 없다(SNS·EventBridge Archive 제외). 그런데 현대 시스템에서 발생하는 데이터 중 큰 부분은 이 모델로 풀 수 없다.

생각해보자. 한 e-commerce 회사가 사용자 클릭 데이터를 초당 50만 건 생성한다. 이 데이터를 ① 실시간 추천 모델이 즉시 처리하고, ② 사기 탐지 시스템이 또 즉시 처리하고, ③ 분석팀이 30분 단위 윈도우로 집계하고, ④ 데이터 웨어하우스에 적재해 다음 주에 다시 분석한다. 같은 데이터를 4번, 서로 다른 시점에, 서로 다른 속도로 소비해야 한다. SQS는 1회 소비 모델이라 적합하지 않고, SNS fanout으로 4개 큐에 복사하면 작동은 하지만 보존이 14일이라 다음 주 재분석이 어려우며, EventBridge는 처리량 quota(account당 ~10K TPS)에 막힌다.

**Kinesis**(2013년 11월 출시)는 이 시나리오에 답한다. 본질적으로 큐가 아니라 **로그(append-only ordered log)** 모델이고, 이 모델은 2011년 LinkedIn의 Jay Kreps가 만든 Apache Kafka에서 처음 검증된 패턴이다. 한 번 쓴 데이터는 보존 기간 동안(최대 365일) 그대로 남고, 여러 컨슈머가 각자의 위치(offset)에서 독립적으로 읽으며, 필요하면 과거 위치로 돌아가 다시 처리할 수 있다. Kinesis 패밀리는 이 로그 모델을 코어로 하면서 자동 적재(Firehose)·실시간 분석(Managed Flink)·Kafka 호환(MSK)으로 확장됐다. 이 글은 Kinesis가 왜 SQS와 다른 도구이며 어떤 시나리오에 어떤 변종을 써야 하는지 본다.

## Kinesis 패밀리: 네 가지 변종과 각자의 자리

| 서비스 | 출시 | 모델 | 핵심 사용 케이스 |
|--------|------|------|----------------|
| **Kinesis Data Streams (KDS)** | 2013.11 | Real-time log, 샤드 기반 | 실시간 ingest, 다중 컨슈머 |
| **Kinesis Data Firehose** | 2015.10 | Managed delivery (sink) | S3/Redshift/OpenSearch 자동 적재 |
| **Managed Service for Apache Flink** (구 Kinesis Data Analytics) | 2016.08, 2023 리브랜딩 | Stream processing | 윈도우 집계, 실시간 ETL |
| **Kinesis Video Streams** | 2017.11 | Video ingest | 비디오 스트림 (SAA 범위 밖) |
| **MSK (Managed Streaming for Kafka)** | 2018.11 | Managed Apache Kafka | Kafka 마이그레이션, 호환 필요 |

이 네 가지 중 시험과 실무에서 가장 자주 등장하는 분기점은 **KDS vs Firehose**다. 한 줄 요약: KDS는 "내가 컨슈머를 짠다(원시 스트림)", Firehose는 "AWS가 컨슈머를 짠다(자동 적재 파이프라인)". KDS는 실시간성과 다중 컨슈머 + replay가 필요할 때, Firehose는 단순히 데이터를 어딘가에 떨어뜨리는 게 목표일 때.

> 💡 **관련 이론**: 로그 기반 시스템의 이론적 기반은 2013년 Jay Kreps의 *The Log: What every software engineer should know about real-time data's unifying abstraction* 글이 정립했다. 핵심 통찰: "데이터베이스의 transaction log, 메시지 큐, pub/sub, change data capture는 모두 같은 추상화(append-only ordered log)의 변종이다." Kafka·Kinesis·Pulsar는 이 추상화를 first-class로 만든 시스템이고, 그래서 "데이터의 source of truth"로 쓰일 수 있다 — 큐로는 불가능한 일이다.

> 🔍 **더 깊이**: Kinesis와 Kafka의 핵심 설계 차이는 "샤드(KDS) vs 파티션(Kafka)"에 있다. 둘 다 처리량 단위로 데이터를 분할하지만 KDS의 샤드는 매니지드 서비스의 quota 단위(1MB/s in, 2MB/s out)로 표준화돼 있고, Kafka 파티션은 클러스터 용량에 따라 자유롭다. 그 대가로 KDS는 운영 부담이 거의 0(샤드 split/merge API 호출만)이지만 Kafka는 broker·zookeeper(또는 KRaft) 운영이 필요하다. AWS의 MSK는 Kafka 호환성을 유지하면서 broker만 매니지드로 옮긴 절충안.

## Data Streams: 샤드, 파티션 키, 그리고 Hot Shard 문제

KDS의 모든 처리량은 **샤드(shard)** 단위로 결정된다. 한 샤드는 정확한 quota를 가진다.

```
[ 한 샤드의 quota ]

쓰기: 1 MB/s OR 1,000 records/s (중 작은 쪽)
읽기: 2 MB/s OR 5 GetRecords calls/s (Standard consumer 공유)
       또는 컨슈머별 2 MB/s (Enhanced Fan-out, 컨슈머당 독립)

샤드를 N개 두면 처리량이 N배가 된다.
```

레코드를 쓸 때마다 **PartitionKey**를 지정해야 하고, KDS는 PartitionKey를 MD5 해싱해 어떤 샤드에 갈지 결정한다. 같은 PartitionKey의 레코드들은 항상 같은 샤드에 들어가고, 한 샤드 안의 레코드는 **엄격한 순서**가 보장된다. 즉 "사용자 ID를 PartitionKey로 쓰면 한 사용자의 이벤트는 시간 순서대로 처리된다"는 보장.

이게 양날의 검이다. PartitionKey 설계가 잘못되면 **Hot Shard** 문제가 터진다. 예를 들어 "고객 ID를 PartitionKey로" 쓰는데 한 대형 고객이 트래픽의 50%를 차지하면, 그 고객의 모든 데이터가 한 샤드에 몰려 1MB/s 한도를 넘고 `ProvisionedThroughputExceeded` 에러가 난다. 다른 샤드들은 놀고 있는데 한 샤드만 죽는 것. 운영에서 가장 자주 보는 KDS 사고가 이거다.

해결책: PartitionKey를 더 잘게 쪼개거나(예: `customerId + ":" + Math.floor(timestamp/1000)`), explicit hash key로 직접 샤드 분배를 제어하거나, 데이터 모델 자체를 재설계. AWS는 2016년 **Enhanced Monitoring**(per-shard metric)을 출시해 어떤 샤드가 hot인지 보이게 만들었고, 2022년 **On-Demand 모드**를 추가해 트래픽에 따라 자동으로 샤드를 분할하는 옵션을 제공한다.

| 모드 | 처리량 | 운영 | 비용 모델 | 적합 |
|------|--------|------|----------|------|
| **Provisioned** | 샤드 수 × 1MB/s | 직접 샤드 관리 (split/merge) | 샤드 시간당 + PUT payload | 예측 가능 트래픽 |
| **On-Demand** | 자동 (default 200MB/s in, 400MB/s out, 자동 확장) | AWS가 샤드 자동 조정 | GB·요청당 (비싸지만 단순) | 가변/모르는 트래픽 |

> ⚠️ **함정**: On-Demand가 "샤드를 신경 안 써도 된다"는 뜻은 아니다. 자동 확장은 5분 단위로 일어나고 폭발적 스파이크에는 따라가지 못해 throttle이 발생할 수 있다. AWS 문서는 "전월 최고 처리량의 2배까지는 즉시 흡수 가능하지만 그 이상은 시간이 걸린다"고 명시한다. 갑작스러운 50배 스파이크가 예상되면 미리 PutRecord로 워밍업하거나 Provisioned 모드로 미리 샤드를 잡는 게 안전하다.

> 🔍 **더 깊이**: KDS의 보존 기간은 24시간(기본)에서 최대 365일까지(2020년 확장 전엔 7일이 최대였다). 365일 보존을 켜면 GB·시간 비용이 크게 늘지만, "실시간 처리 + 장기 replay"가 한 서비스에서 가능해진다. 이게 Kafka 시절엔 어려운 일이었다(Kafka도 무제한 보존이 가능하지만 디스크 비용을 직접 관리). 365일 보존 + Glue Schema Registry + Athena 직접 쿼리(KDS source) 조합은 "스트림 데이터 lake"의 매니지드 구현이다.

## Standard Consumer vs Enhanced Fan-out: 컨슈머 모델 두 가지

KDS의 컨슈머는 두 가지 모델 중 하나를 쓴다.

**Standard Consumer (Shared Throughput)**: 모든 컨슈머가 샤드당 2MB/s를 **공유**한다. 컨슈머가 GetRecords API를 polling으로 호출(권장 1초 간격). 컨슈머가 1개일 땐 2MB/s를 다 쓰지만, 5개 컨슈머가 같은 샤드를 읽으면 각자 0.4MB/s씩 나눠 갖는다. 비용은 거의 0(샤드 시간 비용에 포함).

**Enhanced Fan-out (EFO)**: 컨슈머마다 **독립적인 2MB/s**를 받고, KDS가 push 모델로 HTTP/2 stream을 통해 메시지를 보낸다(SubscribeToShard API). 컨슈머가 늘어도 처리량이 분배되지 않고, latency도 polling보다 낮다(평균 70ms). 단 컨슈머-샤드 시간당 추가 비용 발생.

```
[ Standard vs EFO ]

Standard:
  [샤드 1]─2MB/s─┬─polling─[Consumer A] (1MB/s)
                  └─polling─[Consumer B] (1MB/s)
                  
EFO:
  [샤드 1]─push─[Consumer A] (2MB/s 전용)
        ─push─[Consumer B] (2MB/s 전용)
        ─push─[Consumer C] (2MB/s 전용)
        (각자 독립 stream, 최대 20 consumer per shard)
```

언제 EFO를 쓰는가: ① 한 스트림을 3개 이상 컨슈머가 동시에 처리해야 할 때, ② latency가 중요할 때(예: 실시간 부정거래 탐지), ③ Standard에서 polling 비용이 컨슈머 운영 비용의 큰 부분을 차지할 때.

Lambda를 KDS 컨슈머로 쓰면 자동으로 EFO를 선택할 수 있다 (Event Source Mapping의 `StartingPosition` + `MaximumBatchingWindowInSeconds` 등 옵션). 2018년 출시.

> 📚 **사례**: 2019년 Lyft의 엔지니어링 블로그는 실시간 가격 책정(surge pricing) 시스템이 Standard consumer로는 latency가 충분히 낮지 않아 EFO로 전환한 사례를 공개했다. 폴링 간격을 줄이면 throttle이 늘고 안 줄이면 latency가 늘어나는 dilemma를 push 모델이 해결했다. 비용은 ~3배 늘었지만 surge pricing 정확도 개선의 가치가 훨씬 컸다고 평가.

## Firehose: "AWS가 컨슈머를 짜준다"

KDS가 강력하지만 단점도 분명하다 — 컨슈머 코드를 직접 짜야 하고, KCL(Kinesis Client Library) 같은 SDK로 체크포인트·샤드 할당·재처리 로직을 관리해야 한다. 분석 적재 같은 단순한 케이스에 이건 과한 운영 부담이다.

**Kinesis Data Firehose**는 "이미 만들어진 컨슈머"다. 데이터를 받아서 정해진 sink(S3·Redshift·OpenSearch·Splunk·외부 HTTP)에 자동으로 적재한다. 샤드도 없고, 컨슈머 코드도 없고, 그냥 PUT만 하면 된다.

```
[ Firehose 동작 모델 ]

Producer
   │ PutRecord (또는 KDS source)
   ▼
Firehose Stream
   │
   ├─ (옵션) Lambda 변환 (JSON → 가공)
   ├─ (옵션) Format Conversion (JSON → Parquet/ORC)
   ├─ (옵션) Dynamic Partitioning (S3 prefix를 데이터 기반으로)
   ├─ 버퍼링 (60s ~ 900s OR 1MB ~ 128MB, 둘 중 먼저 도달)
   │
   └─ Sink (S3 / Redshift via S3 / OpenSearch / Splunk / HTTP / Snowflake)
        + (옵션) 백업 S3 (변환 실패 또는 모든 원본 보관)
```

Firehose는 **near-real-time**이다. 진짜 실시간이 아니라 버퍼링 시간(최소 60초)이 있다. 이게 시험 함정인데 "실시간 분석 = Firehose"가 정답이 되는 경우는 없다 — "실시간"이면 KDS + Lambda 또는 Managed Flink가 맞다. Firehose는 "분 단위 적재"가 키워드다.

Firehose의 진짜 가치는 ① 버퍼링 자동, ② 변환 자동(Lambda), ③ 포맷 변환 자동(Parquet/ORC), ④ 동적 파티셔닝(S3 prefix를 `year=2026/month=05/day=27` 식으로 자동 생성), ⑤ 실패 격리(변환 실패 데이터를 별도 S3 백업 버킷에 자동 저장). 이걸 다 직접 짜면 Lambda 수백 줄인데 Firehose는 설정 몇 줄.

```bash
aws firehose create-delivery-stream \
  --delivery-stream-name clickstream-to-s3 \
  --extended-s3-destination-configuration '{
    "RoleARN": "arn:...:role/firehose-role",
    "BucketARN": "arn:aws:s3:::analytics-lake",
    "Prefix": "clickstream/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/",
    "ErrorOutputPrefix": "errors/!{firehose:error-output-type}/",
    "BufferingHints": {"SizeInMBs": 64, "IntervalInSeconds": 60},
    "DataFormatConversionConfiguration": {
      "Enabled": true,
      "OutputFormatConfiguration": {"Serializer": {"ParquetSerDe": {}}},
      "SchemaConfiguration": {"DatabaseName": "analytics", "TableName": "clickstream"}
    },
    "ProcessingConfiguration": {
      "Enabled": true,
      "Processors": [{
        "Type": "Lambda",
        "Parameters": [{"ParameterName": "LambdaArn", "ParameterValue": "arn:...:function:enrich"}]
      }]
    }
  }'
```

이 한 설정으로 Lambda enrichment + Parquet 변환 + S3 동적 파티션 적재 + Glue 카탈로그 등록 + 에러 격리가 다 자동화된다. Athena로 즉시 쿼리 가능한 분석 데이터 레이크가 완성된다.

> 💡 **관련 이론**: "Data Lake에 데이터를 적재할 때 Parquet/ORC 같은 columnar format을 쓴다"는 건 2010년대 빅데이터의 정설이다. Parquet는 2013년 Twitter+Cloudera가 만든 포맷으로, 같은 데이터를 JSON으로 저장한 것 대비 ① 압축률 5-10배, ② 컬럼별 스캔 가능해 쿼리 비용 1/10, ③ predicate pushdown으로 통계 기반 partition pruning. Firehose가 이 변환을 매니지드로 하므로 분석 비용이 극적으로 줄어든다 — Athena는 GB 스캔당 과금이라 Parquet 적용 후 비용이 1/20이 된 사례도 흔하다.

> 🔍 **더 깊이**: Firehose의 Dynamic Partitioning(2021년 출시)은 record 안의 필드 값으로 S3 prefix를 만든다. 예를 들어 `customer_tier` 필드 값에 따라 `customer_tier=premium/`이나 `customer_tier=free/`로 자동 분기. 이게 왜 중요하냐면 Athena 쿼리에서 `WHERE customer_tier='premium'`을 쓰면 해당 파티션만 스캔해 비용이 극적으로 줄기 때문이다. 옛날엔 Lambda로 직접 prefix를 만들거나 적재 후 Spark 작업으로 repartition해야 했는데 Firehose가 이걸 적재 시점에 해준다.

## Managed Service for Apache Flink: 진짜 스트림 처리

KDS가 데이터 운반, Firehose가 적재라면 **Managed Flink**(2023년 리브랜딩 전 이름은 Kinesis Data Analytics)는 **스트림 처리 엔진**이다. 윈도우 집계, 조인, 패턴 매칭, 이상 탐지 같은 연산을 SQL 또는 Java/Scala/Python(PyFlink) 코드로 정의한다.

Apache Flink는 2014년 출시된 오픈소스 스트림 처리 엔진으로, 분산 시스템에서 가장 어려운 문제인 **exactly-once stream processing + event time semantics + late event handling**을 표준 수준으로 푼 첫 시스템 중 하나다. AWS는 2016년 SQL-only인 KDA로 시작했다가 2020년 Flink 지원을 추가하고 2023년 통째로 Managed Flink로 리브랜딩했다.

스트림 처리의 핵심 개념:

- **Event time vs Processing time**: 이벤트가 *발생한* 시각 vs 처리되는 시각. 네트워크 지연·역순 도착 때문에 둘이 다를 수 있고, 정확한 윈도우 집계는 event time 기준이어야 한다.
- **Watermark**: "이 시간 이전의 데이터는 더 안 올 것이다"라는 시스템의 추정. Watermark 기반으로 윈도우를 닫는다.
- **Window types**: Tumbling(고정 크기, 겹침 없음), Sliding(겹침), Session(활동 간격 기반).
- **State backend**: 윈도우 집계 상태를 어디 저장할지(RocksDB on-heap, S3 checkpoint).

```sql
-- "1분 tumbling window로 user별 클릭 수 집계, event time 기준"
CREATE TABLE clicks (
    user_id STRING,
    event_time TIMESTAMP(3),
    WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
) WITH ('connector' = 'kinesis', 'stream' = 'clicks');

SELECT 
    user_id,
    TUMBLE_START(event_time, INTERVAL '1' MINUTE) AS window_start,
    COUNT(*) AS click_count
FROM clicks
GROUP BY user_id, TUMBLE(event_time, INTERVAL '1' MINUTE);
```

이게 SQL 7줄로 표현되지만 직접 구현하면 Lambda 수천 줄 + DynamoDB 상태 관리 + 정확성 보장 코드가 필요하다. Flink는 이걸 매니지드로 푼다.

> 📚 **사례**: 2020년 Uber 엔지니어링 블로그가 자체 데이터 플랫폼에 Flink를 도입한 결과를 공개했다. 가장 큰 변화는 "동일 데이터를 batch + streaming 두 파이프라인으로 운영하던 lambda architecture를 stream-only(kappa architecture)로 단순화"였다. Flink의 exactly-once + event time 의미론이 batch와 동등한 정확성을 보장해줘서 가능했다. AWS 환경에서도 같은 패턴이 가능하지만 Managed Flink가 비싸기 때문에 워크로드 ROI를 따져야 한다.

## MSK: Kafka가 필요할 때

Kafka는 Kinesis의 오픈소스 형제다. API와 운영 모델이 다르지만 본질적으로 같은 로그 모델을 공유한다. 그러면 왜 굳이 MSK를 쓸까.

1. **기존 Kafka 자산 보호**: 회사가 이미 Kafka 기반 시스템(Spark Streaming, Flink, Confluent Schema Registry, Debezium CDC)을 가지고 있으면 코드 변경 없이 이동 가능.
2. **풍부한 생태계**: Kafka Connect(수백 개 connector), Kafka Streams, KSQL, Schema Registry 등 풍부한 에코시스템.
3. **세밀한 제어**: 파티션 수, replication factor, retention, broker config 직접 제어. Kinesis는 매니지드로 추상화돼 있다.
4. **MirrorMaker로 멀티 리전**: Kafka의 MirrorMaker2 패턴으로 active-active 멀티 리전 토픽 가능.

MSK의 단점은 **운영 부담이 Kinesis보다 크다**는 것. Broker가 EC2 인스턴스로 실제 존재하고, partition 수 계획·broker scaling·재밸런싱·storage scaling 등을 직접 신경 써야 한다. AWS는 2022년 **MSK Serverless**를 출시해 일부 운영 부담을 줄였지만 여전히 Kinesis보다는 손이 많이 간다.

| 항목 | Kinesis Data Streams | MSK | MSK Serverless |
|------|---------------------|-----|---------------|
| API | AWS SDK only | Apache Kafka API | Apache Kafka API |
| 처리량 단위 | 샤드 | Partition (broker capacity) | 자동 |
| 운영 | 거의 0 | broker scaling, partition 관리 | 거의 0 |
| 가격 | 샤드 시간당 + PUT | broker 시간당 + storage | 처리량 기반 |
| 최대 보존 | 365일 | 무제한 (스토리지 한도) | 무제한 |
| 컨슈머 SDK | KCL | Kafka consumer (다양한 언어) | Kafka consumer |
| 멀티 리전 | 직접 구현 | MirrorMaker2 | 미지원 |

## SQS vs Kinesis: 시험 최빈출 분기점

이 비교가 SAA 시험에서 가장 자주 나오는 분기점 중 하나다. 키워드 매핑을 명확히 해둘 필요가 있다.

| 시나리오 키워드 | 답 |
|--------------|-----|
| "디커플링", "작업 큐", "비동기 처리" | **SQS** |
| "한 메시지를 한 번만 처리" | **SQS** |
| "여러 시스템이 같은 데이터를 독립 소비" | **Kinesis** (또는 SNS fanout) |
| "재생", "replay", "과거 데이터 다시 처리" | **Kinesis** |
| "엄격한 순서", "high TPS" | **Kinesis** (FIFO SQS는 300 TPS 한계) |
| "윈도우 집계", "실시간 분석" | **Kinesis + Managed Flink** |
| "수십만 TPS" | **Kinesis** (SQS도 가능하지만 큐 모델 부적합) |
| "분 단위 적재 to S3" | **Firehose** |
| "초 단위 실시간 처리" | **KDS** (Firehose는 분 단위) |

특히 헷갈리는 케이스: "한 이벤트를 3개 시스템이 독립 처리"라면 SNS fanout과 Kinesis 둘 다 가능하다. 분기점은 ① 처리량(높으면 Kinesis), ② replay 필요성(있으면 Kinesis), ③ 순서 보장 필요성(있으면 Kinesis), ④ 운영 단순성(중요하면 SNS).

```
[ Lambda Architecture (전통적) ]

데이터 ─┬─ Kinesis ── Stream Layer (실시간) ── 실시간 뷰
        └─ S3      ── Batch Layer (정확성)    ── 마스터 뷰
                                                  ↓
                              두 뷰를 조인해서 사용자에게 노출


[ Kappa Architecture (현대적) ]

데이터 ── Kinesis (365일 보존) ── Managed Flink (실시간 + 재처리 가능)
                                       ↓
                                   서빙 레이어
```

> 💡 **관련 이론**: Lambda vs Kappa Architecture는 빅데이터 진영의 오래된 논쟁이다. 2011년 Nathan Marz가 *Big Data* 책에서 제안한 Lambda는 batch와 stream을 둘 다 운영하는 패턴이고, 2014년 Jay Kreps가 *Questioning the Lambda Architecture* 글에서 비판하며 "충분히 긴 retention의 로그(=Kafka) 하나로 둘 다 가능하다"는 Kappa를 제안했다. 365일 보존 KDS는 Kappa를 AWS 환경에서 가능하게 만든 핵심 빌딩 블록이다.

## 다른 스트리밍 시스템과의 비교

| 시스템 | 강점 | 약점 | 적합 시나리오 |
|--------|------|------|-------------|
| **Kinesis Data Streams** | 매니지드, 365일 보존, EFO | 샤드 수동 관리(Provisioned), 운영 부담 0 | AWS-native 실시간 |
| **MSK / Kafka** | 풍부한 생태계, 무제한 보존, 표준 API | broker 운영 | 기존 Kafka 자산, 복잡한 stream processing |
| **Apache Pulsar** | tiered storage, multi-tenancy | 클라우드 매니지드 한정적 | 대규모 멀티 테넌트 |
| **Google Pub/Sub** | 7일 보존, 자동 스케일 | replay 제한 | GCP 환경 |
| **Azure Event Hubs** | Kafka API 호환, 자동 스케일 | Azure 한정 | Azure 환경 |
| **Redpanda** | Kafka API 호환, C++ 구현으로 매우 빠름 | 운영 직접 | 저지연 + Kafka 호환 |

KDS는 "AWS에 있고 운영을 안 하고 싶다 + 365일까지 보존이면 충분 + Kafka 생태계가 필요 없다"면 가장 단순한 답이다. MSK는 그 반대 — 기존 Kafka 자산이 있거나 Kafka Streams·KSQL 같은 생태계가 필요할 때.

> 📚 **사례**: 2023년 Netflix는 자체 Keystone 데이터 파이프라인에서 KDS와 자체 Kafka 클러스터를 병행 운영하는 구조를 공개했다. KDS는 "단순한 ingest + S3 적재" 워크로드(트래픽의 70%)에 쓰고, Kafka는 "복잡한 stream processing + 멀티 리전 미러링" 워크로드(30%)에 썼다. 같은 회사 안에서도 워크로드 특성에 따라 골라 쓰는 게 표준이고, "이 회사는 Kafka를 쓴다/안 쓴다" 같은 이분법은 현실과 거리가 있다.

## 운영 안티패턴 정리

KDS·Firehose 운영에서 자주 보이는 안티패턴들.

1. **PartitionKey를 user-id 같은 unbalanced 값으로** → Hot Shard. 해결: composite key 또는 explicit hash key.
2. **샤드 수를 트래픽 최고치 기준으로** → 평소 비용 과다. 해결: On-Demand 모드 또는 시간대별 resharding.
3. **Standard consumer 5개 이상으로 같은 스트림 읽기** → 컨슈머별 처리량 부족. 해결: EFO.
4. **Firehose 버퍼링을 60초로 고정** → 작은 객체 다수 → Athena 쿼리 비용 폭증. 해결: 트래픽 보고 300~900초로 늘리거나 size 기반 트리거.
5. **Firehose 변환 Lambda에서 동기 API 호출** → 변환 latency가 버퍼링 시간보다 길어져 backpressure. 해결: Lambda를 가볍게 유지하고 enrichment는 후속 단계로.
6. **KDS retention을 기본 24시간 그대로** → replay 불가능. 해결: 최소 7일, 가능하면 30일 이상.

> ⚠️ **함정**: KDS Provisioned 모드에서 샤드 수를 늘리면 처리량이 즉시 N배가 되지만, **데이터 분포가 자동으로 재조정되지는 않는다**. 새 데이터부터 새 샤드 키 공간을 사용하고, 기존 샤드의 데이터는 그대로 남는다. Hot Shard를 해결하려면 split-shard 또는 merge-shard API로 명시적으로 키 공간을 재분배해야 한다.

## 정리하며

Kinesis는 단순한 "더 빠른 SQS"가 아니라 본질적으로 다른 추상화(append-only ordered log)다. 그래서 다중 컨슈머·재생·순서·고처리량 시나리오에 SQS와 SNS가 풀 수 없는 답을 준다. Data Streams는 raw stream, Firehose는 자동 적재, Managed Flink는 stream processing, MSK는 Kafka 호환 — 네 가지가 각자의 자리를 가진다.

시험 관점에서는 ① "여러 컨슈머 독립 + replay + 고처리량" → KDS, ② "분 단위 S3/Redshift/OpenSearch 적재" → Firehose, ③ "윈도우 집계, 실시간 분석" → Managed Flink, ④ "Kafka 호환 필요" → MSK가 키워드 매핑. 운영 관점에서는 PartitionKey 설계와 샤드 모드 선택이 가장 큰 사고 원인이다.

다음 글에서는 Week 7 전체를 종합한 메시징·이벤트·스트리밍 아키텍처 의사결정 프레임워크를 시나리오 중심으로 본다. SQS·SNS·EventBridge·KDS·Firehose·Step Functions를 언제 어떻게 조합하는지가 SAA 시험의 종합 시나리오 영역이다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 클릭스트림 데이터를 ① 실시간 추천 모델, ② 부정거래 탐지, ③ 30분 윈도우 집계, ④ S3 데이터 레이크 네 곳에서 독립적으로 처리하길 원한다. 같은 데이터를 며칠 뒤 재분석할 수도 있어야 한다. 가장 적합한 인프라는?

A) SQS 4개 큐 + 각 컨슈머
B) SNS 토픽 + SQS 4개 fanout
C) Kinesis Data Streams (30일 보존) + 4개 컨슈머 (③은 Managed Flink, ④는 Firehose)
D) EventBridge 1개 bus + 4개 rule

**정답: C**

해설: 다중 컨슈머 + 재처리(replay) + 고처리량 = KDS의 정의. 30일 보존이면 며칠 뒤 재분석 가능. ③ 윈도우 집계는 Managed Flink, ④ S3 적재는 Firehose로 KDS에 직접 연결. A는 1회 소비 모델이라 4개로 복제해도 replay 불가, 클릭스트림 처리량이 SQS 큐 모델에 부적합. B는 SNS 보존 0, fanout은 되지만 재분석 불가. D는 EventBridge 처리량 quota(account ~10K TPS)에 부딪힐 가능성 + replay 제한.

---

**문제 2.** Kinesis Data Streams에 customerId를 PartitionKey로 쓰는 시스템이 `ProvisionedThroughputExceeded` 에러를 자주 본다. 분석 결과 한 대형 고객이 트래픽의 40%를 차지한다. 가장 적절한 해결책은?

A) 샤드 수를 2배로 늘림
B) On-Demand 모드로 변경
C) PartitionKey를 `customerId + ":" + Math.floor(timestamp/1000)` 같은 composite로 변경
D) Firehose로 마이그레이션

**정답: C**

해설: Hot Shard 문제의 근본 원인은 PartitionKey 분포 불균형. 샤드를 늘려도(A) 한 PartitionKey의 모든 데이터는 같은 샤드로 가므로 해결 안 됨. composite key로 같은 customerId 데이터를 여러 샤드에 분산시켜야 한다(다만 그 customerId 안의 순서 보장은 깨진다는 트레이드오프). B는 On-Demand로 가도 한 샤드 한도(1MB/s)는 같으므로 해결 안 됨. D는 Firehose로 가면 다중 컨슈머·실시간 처리 모델을 잃음.

---

**문제 3.** 로그 데이터를 S3에 Parquet 형식으로 자동 적재하면서 Lambda로 가공·enrichment까지 하려 한다. 가장 단순한 아키텍처는?

A) KDS + Lambda consumer로 직접 S3 PUT
B) Firehose + Lambda 변환 + Parquet format conversion + Dynamic Partitioning
C) SQS + Lambda + S3
D) EventBridge + S3 target

**정답: B**

해설: Firehose는 Lambda 변환·Parquet 변환·Dynamic Partitioning·에러 격리를 다 매니지드로 제공. 설정만으로 분석 데이터 레이크 완성. A는 가능하지만 buffering·batching·Parquet 변환·partition 관리를 다 직접 코드로 해야 함. C는 SQS는 스트림 모델 아니고 S3 적재 자동화 없음. D는 EventBridge S3 target은 객체 메타데이터 이벤트용이지 데이터 적재용 아님.

---

**문제 4.** 한 스트림을 6개 마이크로서비스가 동시에 처리하는데, 각 컨슈머가 처리량 1MB/s 이상이 필요하고 latency도 100ms 이내여야 한다. 가장 적합한 설정은?

A) Standard consumer 6개로 polling
B) Enhanced Fan-out (EFO) 컨슈머로 등록
C) Firehose 6개 stream
D) SQS 6개 큐

**정답: B**

해설: Standard consumer는 샤드당 2MB/s를 모든 컨슈머가 공유하므로 6개면 컨슈머당 0.33MB/s만 받음(요구 1MB/s 미달). EFO는 컨슈머별 독립 2MB/s + push 모델로 70ms 평균 latency. A는 throughput·latency 둘 다 부족. C는 Firehose는 sink 모델이지 일반 컨슈머가 아님. D는 KDS 스트림을 SQS로 옮길 수 없고 모델이 다름.

---

**문제 5.** 한 회사가 기존 온프레 Kafka 클러스터에서 운영하던 stream processing 시스템을 AWS로 옮긴다. Kafka Connect, Kafka Streams, Confluent Schema Registry를 그대로 쓰고 싶다. 가장 적합한 서비스는?

A) Kinesis Data Streams
B) MSK (Managed Streaming for Kafka)
C) Kinesis Firehose
D) EventBridge

**정답: B**

해설: MSK는 Apache Kafka API 그대로 지원하므로 Kafka Connect·Kafka Streams·Schema Registry 코드를 거의 변경 없이 사용 가능. KDS는 AWS SDK 전용이라 Kafka 생태계 도구 사용 불가. C·D는 모델 자체가 다름. MSK Serverless를 쓰면 운영 부담도 줄일 수 있다.

---

**문제 6.** Firehose가 S3에 적재하는 객체가 너무 작아 Athena 쿼리 시 S3 LIST·GET 비용이 폭증하고 있다. 가장 적절한 해결책은?

A) Athena 쿼리를 더 자주 실행
B) Firehose 버퍼링 시간을 60초에서 600~900초로 늘리거나 size 임계를 64MB 이상으로 변경
C) Firehose 대신 KDS + Lambda로 직접 적재
D) S3 Intelligent-Tiering 적용

**정답: B**

해설: Firehose가 작은 객체를 많이 만드는 건 buffer hint가 너무 짧기 때문. 버퍼 시간이나 크기를 늘리면 큰 객체로 통합되어 Athena 스캔 성능과 비용이 개선된다(Athena는 큰 파일이 작은 파일보다 훨씬 효율적). A는 비용 증가 방향. C는 코드 운영 부담만 늘고 본질은 같음. D는 storage 클래스 문제가 아니라 객체 수 문제.

---

**문제 7.** "10분 슬라이딩 윈도우로 사용자별 click 평균을 계산해 DynamoDB에 업데이트"를 가장 적게 코딩하는 방법은?

A) Lambda + DynamoDB로 자체 윈도우 로직 구현
B) Managed Service for Apache Flink + SQL (windowing query) + DynamoDB sink
C) Firehose → S3 → Athena 스케줄 쿼리
D) Step Functions Wait state

**정답: B**

해설: 윈도우 집계는 stream processing의 정석 사용 케이스고 Flink가 표준 솔루션. SQL 7~10줄로 sliding window + group by 표현 가능. A는 watermark·late event·exactly-once를 직접 구현해야 해서 복잡하고 오류 많음. C는 batch 처리이고 실시간 윈도우와 다름. D는 SFN은 워크플로우 오케스트레이션이지 데이터 처리 엔진이 아님.

---

해설 보강: Kinesis 패밀리의 핵심 메시지는 "**메시지 큐와 로그는 다른 추상화**"라는 것이다. SQS 모델로는 풀 수 없는 다중 컨슈머·재생·고처리량·순서 시나리오에 KDS가 답하고, 그 위에 Firehose(자동 적재)·Flink(실시간 처리)·MSK(Kafka 호환)가 변종으로 존재한다. 운영에서 가장 자주 사고를 만드는 셋은 ① PartitionKey 불균형으로 인한 Hot Shard, ② Standard consumer를 너무 많이 붙여 throughput 부족, ③ Firehose 버퍼링 짧게 잡아 작은 객체 폭증 — 이 셋을 알면 KDS·Firehose 운영의 70%를 미리 막을 수 있다.
