# Day 3 - Kinesis Data Firehose: 전달 스트림과 적재

어제 본 Kinesis Data Streams는 강력하지만 손이 많이 간다. 샤드 수를 계산하고, 컨슈머 코드(KCL/Lambda)를 짜고, 체크포인트를 관리하고, S3에 어떻게 쌓을지도 직접 구현해야 한다. "그냥 스트리밍 데이터를 S3나 Redshift에 알아서 적재해줬으면" 싶을 때가 많다. 그 요구에 답하는 것이 **Amazon Kinesis Data Firehose**(현재 명칭 Amazon Data Firehose)다.

Firehose의 한 줄 정의는 "완전관리형 적재(delivery) 파이프"다. 프로듀서가 데이터를 밀어넣으면 Firehose가 알아서 버퍼링하고, 선택적으로 변환·압축·포맷 변환을 거쳐, 목적지에 자동으로 적재한다. 샤드도, 컨슈머 코드도, 스케일링도 신경 쓸 필요가 없다.

## KDS vs Firehose: 가장 중요한 구분

DEA-C01에서 이 둘의 차이는 거의 단골 문제다. 핵심을 표로 잡아두자.

| 항목 | Kinesis Data Streams | Kinesis Data Firehose |
|------|---------------------|----------------------|
| 성격 | 실시간 스트림(파이프) | 적재(delivery) 파이프 |
| 관리 | 샤드·컨슈머 직접 관리 | 완전관리형, 서버리스 |
| 지연 | 실시간(밀리초~초) | 근실시간(최소 ~60초 버퍼) |
| 데이터 보존/재처리 | 가능(최대 365일) | 불가(목적지로 흘려보냄) |
| 커스텀 컨슈머 | 가능(여러 앱이 읽음) | 정해진 목적지로만 적재 |
| 목적지 | 직접 구현 | S3/Redshift/OpenSearch/Splunk 등 빌트인 |

> 💡 **관련 이론**: 한 줄로 외우면 "복잡한 실시간 처리·여러 컨슈머·재처리가 필요하면 KDS, 단순히 목적지에 적재만 하면 되면 Firehose"다. 더 강력한 조합은 둘을 잇는 것이다. KDS를 소스로 두고 Firehose가 그 스트림을 읽어 S3로 적재하면, 한쪽에서는 Lambda·KCL로 실시간 분석을 하면서 다른 한쪽에서는 Firehose가 원본을 데이터 레이크에 자동 보관하는 패턴이 된다. 시험에서 "실시간 분석 + 원본 보관" 둘 다 나오면 이 조합이 정답인 경우가 많다.

## 버퍼링: Firehose의 심장

Firehose는 레코드를 하나씩 보내지 않는다. **버퍼(buffer)** 에 모아뒀다가 한꺼번에 목적지에 전달한다. 버퍼 플러시 조건은 두 가지이며, **둘 중 먼저 도달하는 쪽**에서 전달이 일어난다.

```
- 버퍼 크기(Buffer size):     예) 5 MB  (S3 기준 1~128 MB)
- 버퍼 시간(Buffer interval): 예) 300초 (S3 기준 60~900초)
```

버퍼 크기를 크게 하면 한 파일이 커지고(다운스트림 쿼리 효율↑) 비용 효율이 좋지만 지연이 늘고, 버퍼 시간을 짧게 하면 빨리 도착하지만 작은 파일이 많아진다. 이 트레이드오프 조절이 Firehose 설계의 핵심이다.

```python
import boto3
firehose = boto3.client("firehose")

firehose.create_delivery_stream(
    DeliveryStreamName="events-to-s3",
    S3DestinationConfiguration={
        "RoleARN": "arn:aws:iam::123456789012:role/firehose-role",
        "BucketARN": "arn:aws:s3:::my-data-lake",
        "Prefix": "events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/",
        "BufferingHints": {"SizeInMBs": 5, "IntervalInSeconds": 300},
        "CompressionFormat": "GZIP"
    }
)
```

> 💡 **관련 이론**: "작은 파일 문제(small files problem)"는 데이터 레이크의 고질병이다. Athena·Spark 같은 쿼리 엔진은 파일 하나당 오버헤드가 있어서, 수많은 작은 파일은 큰 파일 몇 개보다 훨씬 느리고 비싸다. Firehose의 버퍼 크기를 충분히 키우면(예: 128MB) 적은 수의 큰 파일로 적재돼 다운스트림 쿼리 성능이 개선된다. 시험에서 "Athena 쿼리가 느리다 + Firehose 적재" 시나리오면 버퍼 크기를 키우라는 방향을 떠올려야 한다.

## 변환: Lambda로 즉석 가공

Firehose는 적재 전에 **Lambda로 레코드를 변환(transform)** 할 수 있다. 들어온 레코드를 Lambda가 받아 정제·필터·포맷 변경한 뒤 돌려주면, 그 결과가 목적지에 적재된다. 로그를 표준 JSON으로 정규화하거나, 민감 필드를 마스킹하거나, 잘못된 레코드를 걸러내는 데 쓴다.

```python
import base64, json

def handler(event, context):
    output = []
    for record in event["records"]:
        payload = json.loads(base64.b64decode(record["data"]))
        payload["ingested_at"] = context.aws_request_id   # 가공 예시
        transformed = json.dumps(payload) + "\n"           # 개행 추가 → 줄 단위 적재
        output.append({
            "recordId": record["recordId"],
            "result": "Ok",                  # Ok / Dropped / ProcessingFailed
            "data": base64.b64encode(transformed.encode()).decode()
        })
    return {"records": output}
```

또한 Firehose는 빌트인으로 JSON을 **Parquet/ORC 컬럼형 포맷으로 변환**할 수 있다(Data Format Conversion). 이때 Glue Data Catalog의 스키마를 참조한다. 컬럼형으로 적재하면 Athena 쿼리가 훨씬 빠르고 저렴해진다.

## 목적지별 적재

Firehose의 강점은 목적지가 빌트인이라는 점이다.

- **S3**: 가장 흔한 목적지. 데이터 레이크의 raw 영역에 GZIP/Parquet로 적재.
- **Redshift**: 내부적으로 먼저 S3에 쓴 뒤 `COPY` 명령으로 Redshift에 로드한다. 직접 INSERT가 아니다.
- **OpenSearch**: 로그·검색 인덱싱.
- **Splunk / 서드파티 HTTP 엔드포인트**.

```sql
-- Firehose가 Redshift 적재 시 내부적으로 실행하는 형태
COPY events FROM 's3://my-data-lake/redshift-staging/manifest'
IAM_ROLE 'arn:aws:iam::123456789012:role/redshift-copy'
FORMAT AS JSON 'auto';
```

> 💡 **관련 이론**: Firehose의 Redshift 적재가 "S3 경유 후 COPY"라는 점은 시험 포인트다. Redshift는 단건 INSERT가 매우 비효율적인 MPP(대규모 병렬 처리) 데이터 웨어하우스라서, 대량 로드는 항상 S3에서 COPY로 병렬 적재하는 것이 정석이다. Firehose는 이 모범 사례를 내부적으로 자동 구현한다. 적재 실패 시 데이터는 지정한 S3 백업 버킷으로 빠지므로 유실되지 않는다.

## 오류 처리

변환 Lambda가 실패하거나 목적지 적재가 실패하면, Firehose는 데이터를 버리지 않고 지정된 **S3 백업/에러 prefix**로 보낸다. 덕분에 실패한 레코드를 나중에 조사·재처리할 수 있다. 이 백업 버킷 설정이 운영 안정성의 핵심이다.

## 정리

- Firehose = 완전관리형 근실시간 적재 파이프 (샤드·컨슈머 코드 불필요)
- 버퍼(크기 OR 시간, 먼저 도달하는 쪽)로 플러시 → 크기↑면 큰 파일·고효율, 시간↓면 저지연
- Lambda 변환 + Parquet/ORC 포맷 변환(Glue 카탈로그 참조)
- 목적지 빌트인: S3, Redshift(S3 경유 COPY), OpenSearch, Splunk
- 실패 레코드는 S3 백업으로 → 유실 방지

## 📝 연습 문제

**문제 1.** 스트리밍 이벤트를 추가 코드 없이 S3 데이터 레이크에 자동 적재만 하면 되고, 커스텀 실시간 처리나 재처리는 필요 없다. 가장 적절한 서비스는?

A) Kinesis Data Firehose 전달 스트림  
B) Kinesis Data Streams + KCL 컨슈머 직접 구현  
C) Amazon MSK  
D) SQS + Lambda  

**정답: A**  
해설: 단순 적재만 필요하고 커스텀 처리·재처리가 불필요하면 완전관리형 Firehose가 정답이다. 샤드·컨슈머 코드·스케일링이 모두 자동이며 S3 적재가 빌트인이다. KDS+KCL은 컨슈머 코드를 직접 짜야 해 과한 선택이고, MSK는 운영 부담이 큰 Kafka이며, SQS+Lambda는 적재 로직을 직접 구현해야 한다.

---

**문제 2.** Firehose로 S3에 적재된 데이터를 Athena로 쿼리하니 수많은 작은 파일 때문에 느리다. 가장 효과적인 개선책은?

A) 버퍼 시간을 60초로 줄인다  
B) 압축을 끈다  
C) 버퍼 크기를 더 크게(예: 128MB) 설정해 큰 파일로 적재한다  
D) 목적지를 OpenSearch로 바꾼다  

**정답: C**  
해설: 작은 파일 문제는 버퍼 크기를 키워 적은 수의 큰 파일로 적재하면 완화된다. Athena 같은 엔진은 파일당 오버헤드가 있어 큰 파일이 유리하다. 버퍼 시간을 줄이면 오히려 더 작고 많은 파일이 생긴다. 압축 해제는 스캔량을 늘려 더 비싸지고, 목적지 변경은 Athena 쿼리 요구와 맞지 않는다.

---

**문제 3.** Firehose가 Redshift로 데이터를 적재하는 방식으로 옳은 것은?

A) Redshift에 레코드별 단건 INSERT를 실행한다  
B) 먼저 S3에 스테이징한 뒤 COPY 명령으로 Redshift에 병렬 로드한다  
C) Redshift Spectrum으로 S3를 직접 쿼리한다  
D) DynamoDB를 경유해 적재한다  

**정답: B**  
해설: Firehose는 데이터를 먼저 S3에 쓴 뒤 COPY로 Redshift에 적재한다. Redshift는 MPP 웨어하우스로 단건 INSERT가 매우 비효율적이라 S3에서 COPY로 병렬 로드하는 것이 정석이며, Firehose가 이를 자동화한다. Spectrum은 외부 테이블 쿼리 기능으로 적재가 아니고, DynamoDB 경유는 존재하지 않는 경로다.

---

**문제 4.** 실시간으로 이상 거래를 탐지하는 분석 앱을 운영하면서, 동시에 모든 원본 거래 이벤트를 S3 데이터 레이크에 보관해야 한다. 가장 적절한 아키텍처는?

A) Firehose 하나로 실시간 탐지와 보관을 모두 처리  
B) Snowball로 거래를 배송  
C) SQS로 거래를 받아 Lambda가 S3에 저장  
D) KDS를 소스로 두고, 분석 앱은 KDS를 직접 소비하며 Firehose가 같은 KDS를 읽어 S3로 적재  

**정답: D**  
해설: 실시간 커스텀 분석(이상 탐지)과 원본 보관을 동시에 요구하므로, KDS를 소스로 두고 분석 앱이 직접 실시간 소비하면서 Firehose가 같은 스트림을 읽어 S3로 자동 적재하는 조합이 정석이다. Firehose 단독은 커스텀 실시간 분석을 못 하고, SQS+Lambda는 재처리·멀티 컨슈머가 약하며, Snowball은 배치 마이그레이션 도구다.

---

**문제 5.** Firehose의 변환 Lambda가 일부 레코드에서 실패하거나 목적지 적재가 실패할 때, 데이터 유실을 막기 위한 Firehose의 기본 동작은?

A) 실패한 레코드를 즉시 폐기한다  
B) 실패한 레코드를 지정된 S3 백업/에러 prefix로 보낸다  
C) 전체 전달 스트림을 중단한다  
D) 프로듀서에게 동기적으로 예외를 던진다  

**정답: B**  
해설: Firehose는 변환 실패·적재 실패 레코드를 폐기하지 않고 지정한 S3 백업(에러) 위치로 보내, 이후 조사·재처리가 가능하게 한다. 따라서 데이터가 유실되지 않는다. 즉시 폐기·스트림 중단·프로듀서 동기 예외는 모두 Firehose의 동작이 아니며 운영 안정성에도 어긋난다.

---
