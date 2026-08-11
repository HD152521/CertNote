# Day 3 - 데이터 수집: Kinesis·Glue·배치 vs 스트리밍

## 📌 핵심 정리

- Kinesis는 하나가 아니라 **4종**이다 — Data Streams, Data Firehose, Managed Service for Flink, Video Streams.
- 결정 분기: **여러 소비자·재처리(replay)가 필요하면 KDS, 코드 없이 목적지 적재만이면 Firehose**.
- Glue는 세 덩어리다 — **Data Catalog**(메타데이터) · **Crawler**(스키마 자동 추론) · **ETL Job**(서버리스 Spark).
- 대부분의 모델 재학습은 **배치**다. 스트리밍은 실시간 피처나 즉시 점수가 필요할 때만 쓴다.
- 실시간과 정확성을 둘 다 원하면 **람다 아키텍처**(스피드 레이어 + 배치 레이어). 단 두 경로의 피처 로직이 어긋나면 skew가 생긴다.

## Kinesis 4종 구분: Specialty 단골

학습 데이터는 어딘가에서 흘러들어와야 한다. 클릭 로그·IoT 센서·거래 이벤트는 실시간 스트림으로 쏟아지고, 운영 DB나 외부 시스템의 데이터는 주기적 배치로 들어온다. "Kinesis"는 이름만 보고 헷갈리기 쉬워 정확히 구분해야 한다.

| 서비스 | 역할 | 핵심 특징 | 대표 ML 용도 |
|---|---|---|---|
| **Data Streams (KDS)** | 실시간 스트림 수집·저장 | 샤드 기반, 소비자 코드 필요, 데이터 보관(최대 365일), replay 가능 | 다소비자 이벤트 버스, 재처리 |
| **Data Firehose** | 스트림 → 목적지 적재 | 완전관리형, S3/Redshift/OpenSearch로 자동 배달, 버퍼링·포맷 변환 | 데이터레이크 축적 |
| **Managed Service for Flink** | 스트림 실시간 분석 | SQL/Flink로 윈도우 집계·이상 탐지 | 실시간 피처 계산 |
| **Video Streams** | 비디오 스트림 수집 | 영상 ML 입력 | 얼굴 인식, 영상 분석 |

### KDS vs Firehose 결정 트리

```
스트림 데이터를 어떻게 쓸 것인가?
├─ 목적지(S3/Redshift/OpenSearch)로 자동 적재만 필요 → Firehose
│    · 소비자 코드 없음  · 버퍼링(크기 또는 시간)  · Parquet 변환·압축 가능
└─ 여러 소비자가 같은 스트림을 다르게 처리
   또는 커스텀 처리·장애 시 재생(replay)이 필요   → Data Streams
        · 샤드 관리  · 보관(retention)  · 소비자별 독립 오프셋
```

```python
import boto3, json
kinesis = boto3.client("kinesis")

# Data Streams에 이벤트 넣기 — PartitionKey로 샤드 분배
kinesis.put_record(
    StreamName="clickstream",
    Data=json.dumps({"user_id": "u123", "event": "click", "ts": 1719300000}),
    PartitionKey="u123",     # 같은 키는 같은 샤드 → 순서 보장 단위
)
```

```python
# Firehose: 코드 없이 S3로 자동 배달 + 버퍼링 설정 (전송 스트림 구성 예)
firehose = boto3.client("firehose")
firehose.put_record(
    DeliveryStreamName="to-datalake",
    Record={"Data": json.dumps({"user_id": "u123", "amount": 42.0}) + "\n"},
)
# Firehose가 버퍼(예: 5MB 또는 60초)를 채우면 S3에 Parquet으로 변환·압축 적재
```

> 💡 **개념**: KDS는 샤드(shard) 단위로 처리량을 확장한다. 샤드 하나가 쓰기 1MB/s·1,000 records/s, 읽기 2MB/s를 처리하므로 트래픽이 늘면 샤드를 늘려야 한다(또는 on-demand 모드). 또한 KDS는 데이터를 보관(retention)해 여러 소비자가 같은 데이터를 독립적으로 읽고 재처리할 수 있다(replay). 반면 Firehose는 보관·재생이 없고 목적지 적재만 책임지는 "fire and forget" 파이프다.

> ⚠️ **함정**: "실시간이니까 무조건 KDS"는 오답 유도다. 지문에 소비자가 하나뿐이고 "코드 없이", "관리 부담 최소"라는 단서가 있으면 Firehose가 정답이다. 반대로 "재처리", "여러 팀이 각자 소비"가 보이면 Firehose는 탈락한다.

## Glue: 서버리스 ETL과 데이터 카탈로그

AWS Glue는 세 가지를 묶은 서버리스 서비스다.

1. **Glue Data Catalog** — 데이터의 메타데이터(스키마·위치·파티션) 중앙 저장소. Athena·Redshift Spectrum·EMR이 공유한다.
2. **Glue Crawler** — S3 등을 스캔해 스키마를 자동 추론하고 카탈로그에 테이블로 등록한다.
3. **Glue ETL Jobs** — Spark(또는 Python shell) 기반 서버리스 변환 작업.

```python
# Glue ETL 잡 (PySpark) — 카탈로그 테이블을 읽어 정제 후 Parquet로 저장
import sys
from awsglue.context import GlueContext
from awsglue.transforms import DropNullFields
from pyspark.context import SparkContext

glueContext = GlueContext(SparkContext.getOrCreate())

# 카탈로그에 크롤러가 등록한 테이블을 DynamicFrame으로 로드
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="raw_db", table_name="clickstream"
)
clean = DropNullFields.apply(frame=dyf)          # 결측 컬럼 제거

# 학습용 피처 위치에 Parquet으로 저장 (파티셔닝)
glueContext.write_dynamic_frame.from_options(
    frame=clean,
    connection_type="s3",
    connection_options={"path": "s3://my-lake/features/", "partitionKeys": ["dt"]},
    format="parquet",
)
```

> 💡 **개념**: Glue의 DynamicFrame은 Spark DataFrame의 ML/ETL 친화 확장으로, 스키마가 제각각인 반정형 데이터(JSON 등)를 스키마 강제 없이 다룰 수 있다(스키마 불일치 행을 버리지 않고 보존). 정형 변환이 끝나면 `toDF()`로 일반 Spark DataFrame으로 바꿔 익숙한 연산을 쓴다. Crawler가 채운 Data Catalog 덕에 Athena로 즉시 SQL 탐색이 가능해, ML 전처리 전 데이터 이해(EDA) 단계가 빨라진다.

### 수집·카탈로그 관련 도구 헷갈림 정리

| 도구 | 하는 일 | 하지 않는 일 |
|---|---|---|
| Glue Crawler | 스키마 추론 + 카탈로그 테이블 등록 | 데이터 이동·변환을 하지 않는다 |
| Glue ETL Job | Spark로 정제·조인·집계·포맷 변환 | 실시간 스트림 수집을 담당하지 않는다 |
| Kinesis Firehose | 스트림을 목적지로 적재 | 보관·재생·다소비자를 지원하지 않는다 |
| Athena | 카탈로그 기반 SQL 조회 | 대규모 반복 ETL 실행 엔진이 아니다 |
| DMS | DB → 데이터레이크 마이그레이션·CDC | 피처 엔지니어링을 하지 않는다 |

## 배치 수집 경로: 스트림이 아닌 데이터는 어떻게 들어오나

모든 데이터가 스트림으로 오는 것은 아니다. 운영 DB·외부 파일·온프레미스 저장소에서 들어오는 경로도 알아 둬야 한다.

| 도구 | 하는 일 | 언제 고르나 |
|---|---|---|
| **AWS DMS** | DB → S3/Redshift 마이그레이션 및 CDC(변경 데이터 캡처) | 운영 RDB의 변경분을 계속 데이터레이크로 흘려보낼 때 |
| **AWS DataSync** | 온프레미스 NFS/SMB ↔ S3/EFS/FSx 대량 전송 | 사내 파일 서버의 학습 데이터를 주기적으로 옮길 때 |
| **AWS Snow 패밀리** | 물리 장비로 대용량 오프라인 전송 | 네트워크로 옮기기엔 데이터가 너무 크거나 회선이 느릴 때 |
| **AWS Batch / EMR** | 대량 배치 연산 실행 | 수집 후 무거운 변환·집계를 돌릴 때 |
| **S3 직접 업로드** | 가장 단순한 적재 | 파일이 이미 손에 있고 규모가 작을 때 |

> ⚠️ **함정**: "페타바이트를 옮겨야 한다"는 지문에서 네트워크 전송(DataSync)만 보고 고르면 회선 속도라는 제약을 놓친다. 전송에 몇 주가 걸린다는 단서가 있으면 Snow 계열이 정답 후보다.

## 스트리밍 수집에서 자주 깨지는 것

스트리밍은 배치보다 운영 난이도가 높다. 시험에도 이 어려움이 그대로 나온다.

- **순서(ordering)**: KDS는 **같은 샤드 안에서만** 순서를 보장한다. 사용자별 순서가 중요하면 `PartitionKey`를 사용자 ID로 둬야 한다.
- **중복(at-least-once)**: 재시도로 같은 레코드가 두 번 들어올 수 있다. 소비자 쪽에서 멱등 처리를 해야 한다.
- **지연 도착(late arrival)**: 네트워크 지연으로 늦게 온 이벤트가 이미 닫힌 윈도우에 속할 수 있다. Flink의 워터마크 개념이 이를 다룬다.
- **핫 샤드(hot shard)**: PartitionKey가 한쪽으로 쏠리면 특정 샤드만 포화된다. 키 설계가 곧 처리량 설계다.
- **용량 관리**: 프로비저닝 모드는 샤드 수를 직접 관리하고, on-demand 모드는 트래픽에 맞춰 자동 조절한다.

## 배치 학습 데이터 vs 스트리밍 학습 데이터

ML 데이터 수집은 두 패턴으로 나뉜다.

| 구분 | 배치(Batch) | 스트리밍(Streaming) |
|---|---|---|
| 도착 방식 | 주기적 대량 적재(매일/매시) | 이벤트가 도착하는 즉시 |
| 대표 도구 | Glue, EMR, Batch, S3 | Kinesis, MSK(Kafka) |
| 지연(latency) | 분~시간 | 초~밀리초 |
| 학습 적합 | 대부분의 모델 재학습 | 실시간 피처·온라인 학습 |
| 신선도 | 오래됨 허용 | 최신성이 곧 가치 |
| 운영 난이도 | 낮음(실패 시 재실행) | 높음(순서·중복·지연 처리) |

- 대부분의 ML 학습은 **배치**다. 매일 밤 누적된 데이터로 모델을 재학습하는 식이다.
- 스트리밍이 꼭 필요한 경우는 두 가지다. ① 실시간 피처(최근 5분 거래 횟수)를 추론에 써야 할 때, ② 사기 탐지처럼 즉시 점수가 필요할 때.

```
[람다 아키텍처]

이벤트 ──┬─▶ KDS ─▶ Flink(윈도우 집계) ─▶ 실시간 피처 ─▶ 추론 엔드포인트
         │            (스피드 레이어: 저지연·근사)
         └─▶ Firehose ─▶ S3 데이터레이크 ─▶ 배치 재학습 ─▶ 모델 갱신
                      (배치 레이어: 정확·완전)
```

> 💡 **개념**: 람다 아키텍처는 같은 데이터를 **스피드 레이어**(스트리밍, 저지연 근사)와 **배치 레이어**(주기적, 정확·완전)로 동시에 처리해 둘의 장점을 합친다. ML에서는 Firehose로 모든 이벤트를 S3에 축적(배치 재학습용)하면서, KDS+Flink로 실시간 피처를 계산(즉시 추론용)하는 형태로 자주 쓰인다. 다만 두 경로의 피처 계산 로직이 어긋나면 training-serving skew가 생기므로 일관성 관리가 중요하다.

> ⚠️ **함정**: 람다 아키텍처의 진짜 비용은 인프라가 아니라 **로직 이중 관리**다. 실시간 경로와 배치 경로에서 "최근 5분 거래 횟수"를 다르게 계산하면 모델은 학습 때 본 적 없는 값을 추론 때 받는다. Feature Store로 정의를 한 곳에 모으는 것이 정석 대응이다.

## Firehose의 변환 기능

Firehose는 "그냥 배달"만 하지 않는다. 배달 도중 가벼운 가공을 끼워 넣을 수 있어서, 단순 적재 시나리오의 정답 범위가 생각보다 넓다.

- **Lambda 변환**: 배달 전에 Lambda를 호출해 레코드를 정제·필터링·형식 변경한다.
- **포맷 변환**: JSON 레코드를 **Parquet/ORC**로 바꿔 적재한다(Glue Data Catalog의 스키마를 참조).
- **버퍼링**: 크기(예: 5MB) 또는 시간(예: 60초) 조건 중 먼저 도달하는 쪽에서 배달한다. 버퍼를 키우면 파일이 커져 작은 파일 문제가 줄지만 지연이 늘어난다.
- **압축·암호화**: GZIP 등 압축과 KMS 암호화를 배달 시점에 적용한다.
- **오류 처리**: 배달 실패 레코드를 별도 S3 접두사로 떨어뜨려 나중에 재처리한다.

> ⚠️ **함정**: "가벼운 변환이 필요하니 Firehose는 못 쓴다"고 단정하지 마라. 레코드 단위의 단순 변환이면 Firehose + Lambda로 충분하고, 조인·집계처럼 여러 레코드를 가로지르는 연산이 필요해야 Glue ETL이나 Flink가 등장한다.

## 수집 파이프라인 설계 사고

시험 시나리오를 풀 때 순서대로 묻자.

1. **데이터가 스트림인가 배치인가?**
2. 스트림이면 **단순 적재(Firehose)인가, 커스텀·다소비자(KDS)인가?**
3. **변환이 필요한가?** → Glue ETL / EMR / SageMaker Processing
4. **스키마를 모르는가?** → Glue Crawler로 카탈로그부터
5. **목적지가 데이터레이크(S3)인가 분석 저장소(Redshift/OpenSearch)인가?**

이 다섯 질문이면 대부분의 수집 문제가 풀린다.

내일은 이렇게 모은 데이터에 **정답을 붙이는 일**(SageMaker Ground Truth, 액티브 러닝, 레이블 품질)을 다룬다.

## 📖 용어

- **샤드(shard)** : Kinesis Data Streams의 처리량 단위. 늘리면 쓰기·읽기 용량이 함께 늘어난다.
- **PartitionKey** : 레코드를 어느 샤드에 넣을지 정하는 키. 같은 키는 같은 샤드로 가서 순서가 보장된다.
- **retention(보관 기간)** : 스트림이 데이터를 붙들고 있는 기간. 이 기간 안이면 소비자가 다시 읽을 수 있다.
- **replay(재생)** : 이미 처리한 구간을 처음부터 다시 읽어 재처리하는 것. 장애 복구·로직 수정 후 필수.
- **Glue Data Catalog** : 데이터의 스키마·위치·파티션을 담은 중앙 메타데이터 저장소.
- **Glue Crawler** : 저장소를 훑어 스키마를 추론하고 카탈로그에 테이블로 등록해 주는 도구.
- **DynamicFrame** : Glue가 제공하는 Spark DataFrame 확장. 스키마가 들쭉날쭉한 데이터를 버리지 않고 다룬다.
- **람다 아키텍처** : 같은 데이터를 실시간 경로와 배치 경로로 동시에 처리해 신선도와 정확성을 함께 얻는 설계.
- **CDC(변경 데이터 캡처)** : 운영 DB에서 바뀐 행만 뽑아 계속 흘려보내는 방식. DMS가 대표 도구다.
- **MSK** : AWS의 관리형 Apache Kafka. Kinesis 대신 Kafka 생태계를 쓰고 싶을 때의 선택지.

## 📝 연습 문제

**문제 1.** IoT 센서 스트림을 별도 변환·코드 없이 그대로 S3 데이터레이크에 Parquet으로 자동 적재하기만 하면 된다. 가장 적합한 서비스는?

A) Kinesis Data Streams + 커스텀 소비자  
B) Kinesis Data Firehose  
C) Kinesis Video Streams  
D) Glue Crawler  

**정답: B**  
해설: Firehose는 완전관리형으로 코드 없이 스트림을 S3 등 목적지로 버퍼링·포맷 변환(Parquet)해 자동 배달하는 데 특화돼 있다. Data Streams는 소비자 코드와 샤드 관리가 필요하고, Video Streams는 영상용, Crawler는 적재가 아니라 스키마 추론 도구다.

---

**문제 2.** 하나의 클릭스트림을 ① 실시간 대시보드, ② 사기 탐지 모델, ③ 추후 재처리를 위해 각각 독립적으로 소비하고, 장애 시 데이터를 다시 읽어야 한다. 적합한 서비스는?

A) Kinesis Data Firehose  
B) S3 단독  
C) Kinesis Data Streams  
D) Glue ETL Job  

**정답: C**  
해설: 여러 소비자가 같은 스트림을 독립적으로 읽고 데이터 보관·재생(replay)이 필요한 경우는 Data Streams의 핵심 사용처다. Firehose는 보관·다소비자·재생을 지원하지 않는 단순 적재 파이프이고, S3·Glue ETL은 실시간 다소비 스트리밍 요건을 충족하지 못한다.

---

**문제 3.** 스키마를 모르는 대량의 JSON 로그가 S3에 쌓여 있다. Athena로 SQL 탐색을 시작하기 전에 테이블과 스키마를 자동으로 만들고 싶다. 사용할 도구는?

A) Glue Crawler  
B) Kinesis Firehose  
C) SageMaker Ground Truth  
D) EFS  

**정답: A**  
해설: Glue Crawler는 S3를 스캔해 스키마를 자동 추론하고 Glue Data Catalog에 테이블로 등록해, Athena가 즉시 SQL로 조회할 수 있게 한다. Firehose는 적재, Ground Truth는 데이터 레이블링, EFS는 파일 스토리지로 스키마 추론과 무관하다.

---

**문제 4.** 대부분의 ML 모델 재학습이 스트리밍이 아니라 배치 방식으로 이뤄지는 가장 큰 이유는?

A) 스트리밍이 항상 더 비싸기 때문  
B) Kinesis가 학습을 지원하지 않기 때문  
C) 배치가 항상 더 정확하기 때문  
D) 재학습은 보통 누적된 대량 데이터를 주기적으로 처리하면 충분하고, 밀리초 단위 신선도가 필요 없기 때문  

**정답: D**  
해설: 모델 재학습은 매일/매시 누적된 데이터를 주기적으로 돌리면 충분한 경우가 대부분이라 저지연이 불필요해 배치가 자연스럽다. 스트리밍은 실시간 피처나 즉시 점수가 필요한 특수 상황에 쓴다. 비용·정확도는 상황에 따라 다르고, Kinesis로도 데이터를 모아 학습에 쓸 수 있다.

---

**문제 5.** 같은 이벤트 데이터를 실시간 피처 계산(즉시 추론용)과 주기적 모델 재학습(정확·완전)에 모두 활용하기 위한 아키텍처 패턴은?

A) 모든 처리를 단일 배치 잡으로 통합  
B) 람다 아키텍처 — 스트리밍(스피드) 레이어와 배치 레이어를 병행  
C) 스트리밍만 사용  
D) 데이터를 복제하지 않고 한 경로만 사용  

**정답: B**  
해설: 람다 아키텍처는 스피드 레이어(스트리밍, 저지연 근사)와 배치 레이어(주기적, 정확·완전)를 병행해 실시간성과 정확성을 동시에 얻는다. ML에서는 Firehose로 S3에 축적해 재학습하고 KDS+Flink로 실시간 피처를 계산하는 식이다. 단일 경로만으로는 두 요구를 동시에 만족하기 어렵다.

---
