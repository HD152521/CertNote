# Day 3 - Kinesis Data Firehose: 전달 스트림과 적재

## 📌 핵심 정리

- Firehose(현재 명칭 Amazon Data Firehose) = 샤드·컨슈머 코드 없이 스트림을 목적지에 쌓아 주는 **완전관리형 근실시간 적재 파이프**다.
- 버퍼는 **크기 또는 시간 중 먼저 찬 쪽**에서 비워진다. 크기를 키우면 큰 파일·고효율, 시간을 줄이면 저지연·작은 파일이다.
- 적재 전에 **Lambda 변환**과 **Parquet/ORC 포맷 변환**(Glue 카탈로그 스키마 참조)을 끼울 수 있다.
- 목적지는 빌트인이다: S3, Redshift(S3 경유 COPY), OpenSearch, Splunk, HTTP 엔드포인트 등.
- Firehose 자체는 보존·재처리를 제공하지 않는다. 변환·적재 실패분은 S3 오류 위치로 빠지므로 그 경로를 반드시 감시한다.

## KDS vs Firehose: 가장 중요한 구분

어제 본 Kinesis Data Streams는 강력하지만 손이 많이 간다. 샤드 수를 계산하고, 컨슈머 코드(KCL/Lambda)를 짜고, 체크포인트를 관리하고, S3에 어떻게 쌓을지도 직접 구현해야 한다. "그냥 스트리밍 데이터를 S3나 Redshift에 알아서 적재해줬으면" 싶을 때가 많다. 그 요구에 답하는 것이 **Amazon Kinesis Data Firehose**(현재 명칭 Amazon Data Firehose)다.

Firehose의 한 줄 정의는 "완전관리형 적재(delivery) 파이프"다. 프로듀서가 데이터를 밀어넣으면 Firehose가 알아서 버퍼링하고, 선택적으로 변환·압축·포맷 변환을 거쳐, 목적지에 자동으로 적재한다. 샤드도, 컨슈머 코드도, 스케일링도 신경 쓸 필요가 없다.

DEA-C01에서 이 둘의 차이는 시나리오 문제의 판단 기준이 된다. 차이를 표로 정리한다.

| 항목 | Kinesis Data Streams | Kinesis Data Firehose |
|------|---------------------|----------------------|
| 성격 | 실시간 스트림(파이프) | 적재(delivery) 파이프 |
| 관리 | 샤드·컨슈머 직접 관리 | 완전관리형, 서버리스 |
| 지연 | 실시간(밀리초~초) | 근실시간(버퍼만큼 지연, S3 기본 300초) |
| 데이터 보존/재처리 | 가능(최대 365일) | 불가(목적지로 흘려보냄) |
| 커스텀 컨슈머 | 가능(여러 앱이 읽음) | 정해진 목적지로만 적재 |
| 목적지 | 직접 구현 | S3/Redshift/OpenSearch/Splunk 등 빌트인 |

> 💡 **관련 이론**: 한 줄로 외우면 "복잡한 실시간 처리·여러 컨슈머·재처리가 필요하면 KDS, 단순히 목적지에 적재만 하면 되면 Firehose"다. 더 강력한 조합은 둘을 잇는 것이다. KDS를 소스로 두고 Firehose가 그 스트림을 읽어 S3로 적재하면, 한쪽에서는 Lambda·KCL로 실시간 분석을 하면서 다른 한쪽에서는 Firehose가 원본을 데이터 레이크에 자동 보관하는 패턴이 된다. 시험에서 "실시간 분석 + 원본 보관" 둘 다 나오면 이 조합이 정답인 경우가 많다.

## 버퍼링: Firehose의 심장

Firehose는 레코드를 하나씩 보내지 않는다. **버퍼(buffer)** 에 모아뒀다가 한꺼번에 목적지에 전달한다. 버퍼 플러시 조건은 두 가지이며, **둘 중 먼저 도달하는 쪽**에서 전달이 일어난다.

```
- 버퍼 크기(Buffer size):     예) 5 MB  (S3 기준 1~128 MB)
- 버퍼 시간(Buffer interval): 예) 300초 (S3 기준 0~900초, 기본 300초)
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

"작은 파일 문제(small files problem)"는 데이터 레이크의 고질병이다. Athena·Spark 같은 쿼리 엔진은 파일 하나당 오버헤드가 있어서, 수많은 작은 파일은 큰 파일 몇 개보다 훨씬 느리고 비싸다. Firehose의 버퍼 크기를 충분히 키우면(예: 128MB) 적은 수의 큰 파일로 적재돼 다운스트림 쿼리 성능이 개선된다. 시험에서 "Athena 쿼리가 느리다 + Firehose 적재" 시나리오면 버퍼 크기를 키우라는 방향을 떠올려야 한다.

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

Firehose의 Redshift 적재가 "S3 경유 후 COPY"라는 점은 시험 포인트다. Redshift는 단건 INSERT가 매우 비효율적인 MPP(대규모 병렬 처리) 데이터 웨어하우스라서, 대량 로드는 항상 S3에서 COPY로 병렬 적재하는 것이 정석이다. Firehose는 이 모범 사례를 내부적으로 자동 구현한다. COPY가 실패해도 데이터는 먼저 써 둔 중간 S3 버킷에 남아 있으므로 다시 적재할 수 있다.

## 오류 처리

변환 Lambda가 실패하거나 목적지 적재가 실패하면, Firehose는 데이터를 버리지 않고 지정된 **S3 백업/에러 prefix**로 보낸다. 덕분에 실패한 레코드를 나중에 조사·재처리할 수 있다. 이 백업 버킷 설정이 운영 안정성의 핵심이다. 단, 목적지가 S3인데 S3 전달 자체가 실패하는 경우는 보낼 곳이 없어 예외다(아래 "전달 보장과 목적지별 실패 처리" 참고).

## 소스는 세 가지, 이름은 두 가지

Firehose 스트림에 데이터를 넣는 길은 셋이다. 어느 것을 고르느냐에 따라 한도와 실패 시 동작이 달라진다.

| 소스 | 넣는 방법 | 특징 |
|------|------|------|
| Direct PUT | SDK 의 `PutRecord`/`PutRecordBatch`, Kinesis Agent, CloudWatch Logs·IoT·EventBridge 같은 AWS 서비스 연동 | 스트림별 처리량 쿼터가 있다(리전마다 기본값이 다르고, 스로틀이 생기면 서비스가 자동으로 올려 주며 상향 요청도 가능) |
| Kinesis Data Streams | Firehose 가 KDS 의 컨슈머가 되어 읽어 감 | Direct PUT 쿼터가 적용되지 않고 KDS 유입량에 맞춰 확장. 목적지 장애 시 KDS 보존 기간만큼 버틴다 |
| Amazon MSK | Firehose 가 Kafka 토픽을 읽어 감 | 커넥터를 직접 운영하지 않고 토픽을 S3 등에 적재 |

- `PutRecordBatch` 는 호출당 500 레코드 또는 4MiB 중 작은 쪽까지 담는다. 레코드 하나의 상한은 base64 인코딩 전 1,000KiB 다.
- 2024년에 서비스 이름이 **Amazon Kinesis Data Firehose → Amazon Data Firehose** 로 바뀌었다. 문서는 "전달 스트림(delivery stream)"을 "Firehose 스트림"이라고 부르지만 API 이름(`CreateDeliveryStream`)은 그대로다. 시험 지문에는 옛 이름이 여전히 나온다.

## 목적지별 버퍼 힌트

버퍼 범위는 목적지마다 다르다. "Firehose 는 60초"라고 하나로 외우면 틀린다.

| 목적지 | 버퍼 크기(기본) | 버퍼 간격(기본) |
|------|------|------|
| Amazon S3 | 1~128MB (5MB) | 0~900초 (300초) |
| Amazon Redshift | 1~128MB (5MB) | 0~900초 (300초) |
| OpenSearch Service / Serverless | 1~100MB (5MB) | 0~900초 (300초) |
| Splunk | 1~5MB (5MB) | 0~60초 (60초) |
| HTTP 엔드포인트 | 1~64MB (5MB) | 0~900초 (60초) |

- 간격을 **0초**로 두면 버퍼링 없이 수 초 안에 전달한다(제로 버퍼링). 과거에는 최소 60초였고, 예전 자료의 "Firehose 는 최소 60초 지연"은 여기서 나온 말이다.
- S3 목적지에서 간격을 60초 미만으로 잡으면 Firehose 가 멀티파트 업로드를 써서 지연을 줄이는 대신 S3 PUT 요청 비용이 늘어난다.
- 제로 버퍼링은 **동적 파티셔닝과 함께 쓸 수 없고**, S3 백업 쪽 버퍼(60~900초)에도 적용되지 않는다.
- 버퍼 힌트는 말 그대로 "힌트"다. 목적지 전달이 유입을 따라가지 못하면 Firehose 가 따라잡기 위해 버퍼 크기를 동적으로 키운다.
- 크기와 간격은 한쪽을 지정하면 다른 쪽도 함께 지정해야 한다.

> ⚠️ **함정**: "Athena 쿼리가 느리다"의 처방으로 "버퍼 간격을 줄인다"를 고르면 반대 방향이다. 간격을 줄이면 파일이 더 작고 많아진다. 작은 파일 문제의 처방은 버퍼 **크기**를 키우고 간격도 넉넉히 두는 것이다. 유입량이 적으면 크기 조건에 닿기 전에 시간 조건이 먼저 차므로, 간격이 짧으면 크기를 아무리 키워도 소용없다.

## 변환 Lambda 의 한도와 반환 규약

Firehose 는 버퍼에 모은 레코드 묶음으로 Lambda 를 **동기 호출**한다. 그래서 Lambda 의 동기 호출 한도가 그대로 제약이 된다.

| 항목 | 값 |
|------|------|
| 변환용 버퍼 크기 힌트 | 0.2~3MB (기본 1MB) |
| 변환용 버퍼 간격 힌트 | 0~900초 (기본 60초) |
| 요청·응답 페이로드 | 각각 6MB 이하 (Lambda 동기 호출 한도) |
| 한 번 호출의 최대 실행 시간 | 5분 |
| 호출 실패 시 재시도 | 기본 3회, 그래도 실패하면 그 묶음을 건너뜀 |
| 실패 레코드의 행방 | S3 버킷의 `processing-failed` 폴더 |

- 응답은 받은 레코드마다 `recordId`, `result`, `data` 를 돌려줘야 한다. `result` 는 셋 중 하나다.
  - `Ok` : 변환 성공. `data` 가 목적지로 간다.
  - `Dropped` : 의도적으로 버림. 오류가 아니며 목적지에도, 오류 폴더에도 가지 않는다.
  - `ProcessingFailed` : 변환 실패. 오류 폴더로 간다.
- 변환이 레코드를 **부풀리면** 응답이 6MB 를 넘어 호출 전체가 실패할 수 있다. 보강(enrichment)으로 필드를 많이 붙이는 함수라면 변환용 버퍼를 줄인다.
- Firehose 는 S3 에 쓸 때 레코드를 구분자 없이 이어 붙인다. JSON 을 줄 단위로 읽게 하려면 변환 함수에서 개행을 붙이거나(본문 예시), 개행 구분자 추가 옵션을 켠다. 이걸 빠뜨리면 Athena 가 파일의 첫 레코드만 읽는다.
- 변환을 켜면 **원본 레코드 백업**(source record backup)을 별도 S3 경로에 남길 수 있다. 변환 로직에 버그가 있었을 때 원본으로 되돌아갈 근거가 된다.

## 포맷 변환을 켤 때 걸리는 제약

| 제약 | 내용 |
|------|------|
| 입력 포맷 | JSON 만. CSV·로그 텍스트는 변환 Lambda 로 먼저 JSON 으로 바꾼다 |
| 목적지 | S3 만. 포맷 변환을 켜면 Redshift·OpenSearch·Splunk 를 목적지로 둘 수 없다 |
| 스키마 | Glue Data Catalog 테이블을 참조. 스키마에 없는 속성은 결과에서 빠진다 |
| 버퍼 크기 | 64MB 미만으로 설정 불가, 켜는 순간 기본값이 128MB 가 된다 |
| 압축 | S3 압축 설정(`CompressionFormat`)은 `UNCOMPRESSED` 로 두고, 직렬화 단계에서 Snappy 가 기본 적용된다(GZIP 선택 가능) |
| 역직렬화기 | OpenX JSON SerDe 또는 Hive JSON SerDe. 타임스탬프 형식에 따라 고른다 |
| JSON 배열 | `[{...},{...}]` 형태는 입력으로 유효하지 않다. `{...}{...}` 처럼 객체를 이어 보낸다 |

- 버퍼 하한이 64MB 인 이유는 컬럼형 파일이 작으면 의미가 없기 때문이다. 유입량이 적은 스트림에서 포맷 변환을 켜면 시간 조건이 찰 때까지 데이터가 도착하지 않는다는 점을 감안한다.

## 동적 파티셔닝: 레코드 내용으로 폴더 나누기

기본 접두사는 `YYYY/MM/dd/HH`(UTC) 이고, 이는 **Firehose 가 받은 시각**이다. 이벤트가 실제로 일어난 시각이나 `customer_id` 같은 필드로 나누려면 동적 파티셔닝을 쓴다.

```
Prefix:
  events/customer_id=!{partitionKeyFromQuery:customer_id}/dt=!{partitionKeyFromQuery:dt}/
ErrorOutputPrefix:
  errors/!{firehose:error-output-type}/

파티셔닝 키 추출 (인라인 파싱, jq 식)
  customer_id : .customer_id
  dt          : .event_timestamp | strftime("%Y-%m-%d")
```

- 키를 뽑는 방법은 두 가지다. JSON 이면 **인라인 파싱(jq 식)**, 압축·암호화됐거나 JSON 이 아니면 **Lambda** 가 키를 계산해 돌려준다.
- 파티션마다 버퍼가 따로 생긴다. 한 스트림에서 동시에 열려 있을 수 있는 **활성 파티션은 기본 500개**(상향 요청 가능)이고, 넘치면 초과 레코드가 오류 접두사로 떨어진다.
- 그래서 `user_id` 처럼 값 종류가 많은 필드를 파티션 키로 쓰면 안 된다. 활성 파티션 한도를 넘기고, 넘기지 않더라도 파티션마다 파일이 잘게 쪼개진다. 날짜·리전·테넌트처럼 종류가 적은 값이 맞다.
- 동적 파티셔닝에서는 전달 지연이 설정한 버퍼 시간의 최대 1.5배까지 늘 수 있고, 제로 버퍼링은 쓸 수 없다. 처리한 데이터량에 따른 추가 요금도 붙는다.
- 접두사를 `key=value/` 형태(Hive 스타일)로 쓰면 Athena·Glue 가 파티션으로 인식한다.

## 전달 보장과 목적지별 실패 처리

"Firehose 는 데이터를 잃지 않는다"는 절반만 맞다. 실패 종류에 따라 행방이 다르다.

| 실패 지점 | Firehose 의 동작 | 데이터 행방 |
|------|------|------|
| 변환 Lambda 실패 | 호출 재시도(기본 3회) 후 건너뜀 | S3 `processing-failed` |
| 포맷 변환 실패 | 해당 레코드 제외 | S3 오류 위치 |
| S3 전달 실패(권한·버킷 삭제 등) | Direct PUT 은 최대 24시간 재시도, KDS·MSK 소스는 스트림 보존 기간까지 재시도 | **재시도 기간을 넘기면 유실** |
| Redshift COPY 실패 | 지정한 재시도 시간(0~7,200초) 동안 재시도 후 그 묶음을 건너뜀 | 데이터는 중간 S3 에 남고, 건너뛴 객체 목록이 `errors/` 의 매니페스트 파일로 남아 수동 COPY 가능 |
| OpenSearch 색인 실패 | 재시도 시간(0~7,200초) 후 건너뜀 | S3 `AmazonOpenSearchService_failed/` |
| Splunk·HTTP 엔드포인트 | 응답(확인)을 기다리며 재시도 시간 동안 재시도 | S3 백업 버킷 |

- S3 가 목적지일 때 "S3 전달 자체가 실패"하면 갈 곳이 없다. IAM 역할 권한이나 버킷 정책을 잘못 바꾼 채 하루가 지나면 Direct PUT 데이터는 사라진다. `DeliveryToS3.Success` 같은 전달 지표와 데이터 신선도 지표에 알람을 거는 이유다.
- 전달은 **at-least-once** 다. 전달 요청이 시간 초과됐다가 뒤늦게 성공하면 재시도분과 겹쳐 중복이 생길 수 있다(S3 목적지는 예외). Redshift·OpenSearch 쪽에서는 키 기준으로 중복을 흡수하도록 설계한다.
- KDS 를 소스로 두면 목적지 장애가 길어져도 KDS 보존 기간을 늘려 버틸 수 있다. "실시간 분석 + 원본 보관" 조합이 내구성 면에서도 유리한 이유다.

## 비용 구조와 대안 비교

- 기본 요금은 **수집한 데이터량**에 비례한다. Direct PUT 과 KDS 소스는 레코드 크기를 **5KB 단위로 올림**해서 계산하므로(MSK 소스는 올림 없음), 200바이트짜리 레코드를 한 건씩 보내면 실제 크기의 수십 배로 과금된다. 프로듀서에서 여러 건을 묶어 한 레코드로 보내는 것이 요금 최적화다.
- 포맷 변환, 동적 파티셔닝, VPC 내 전달은 선택 기능이고 처리량에 따라 추가 요금이 붙는다. VPC 전달은 스트림이 활성인 동안 AZ 시간 요금도 있다.
- 그 외에는 스트림이 떠 있는 시간에 대한 요금이 없다. 유입이 없으면 수집 요금도 없다는 점이 KDS 프로비저닝 모드(샤드 시간 과금)와 다르다.

| 요구 | Firehose | 대안 | 대안을 고르는 조건 |
|------|------|------|------|
| 스트림 → S3 적재 | 설정만으로 끝남 | Glue 스트리밍 ETL | 조인·복잡한 변환·여러 싱크가 필요할 때 |
| 스트림 → Redshift | S3 스테이징 후 COPY | Redshift 스트리밍 수집 | S3 를 거치지 않고 KDS·MSK 에서 구체화된 뷰로 바로 받아 더 낮은 지연이 필요할 때 |
| 레코드별 가벼운 가공 | 변환 Lambda | KDS + Lambda 컨슈머 | 가공 결과를 여러 곳으로 분기하거나 재처리가 필요할 때 |
| 윈도우 집계 후 적재 | 불가(집계 기능 없음) | Managed Service for Apache Flink → Firehose/S3 | 상태 있는 연산이 필요할 때 |

## 지문 단서 → 정답 판별표

| 지문 단서 | 정답 | 이유 |
|------|------|------|
| "JSON 스트림을 Athena 로 싸게 조회" | Firehose 포맷 변환(Parquet) + Glue 테이블 | 적재 시점에 컬럼형으로 |
| "CSV 로 들어오는 스트림을 Parquet 으로" | 변환 Lambda(CSV→JSON) + 포맷 변환 | 포맷 변환 입력은 JSON 만 |
| "고객 ID 별·이벤트 날짜별 S3 폴더로 자동 분리" | 동적 파티셔닝 | 레코드 내용 기반 접두사 |
| "S3 에 쌓인 JSON 을 Athena 가 한 줄만 읽는다" | 레코드 사이 개행 구분자 추가 | 기본은 구분자 없이 이어 붙임 |
| "Redshift 적재가 실패한 데이터를 복구" | `errors/` 매니페스트로 수동 COPY | 원본은 중간 S3 에 남아 있음 |
| "목적지 장애가 하루 넘게 이어져도 유실 방지" | KDS 를 소스로 두고 보존 기간 연장 | Direct PUT 은 24시간까지만 재시도 |
| "변환 후에도 원본을 보관" | 원본 레코드 백업 활성화 | 변환 버그 대비 |
| "수 초 안에 목적지 도착" | 버퍼 간격 0초(제로 버퍼링) | 단, 작은 파일·요청 비용 증가 감수 |
| "여러 애플리케이션이 같은 데이터를 각자 소비" | KDS (+ Firehose 는 그중 한 소비자) | Firehose 는 정해진 목적지로만 전달 |

내일은 스트리밍 수집의 마지막 조각, Apache Kafka 를 관리형으로 제공하는 Amazon MSK 를 Kinesis 와 비교한다.

## 📖 용어

- **Firehose 스트림(전달 스트림)** : Firehose 의 기본 단위. 데이터를 받아 버퍼링한 뒤 정해 둔 목적지로 넘긴다.
- **버퍼 힌트** : 얼마나 모았다가 보낼지 정하는 크기·시간 설정. 둘 중 먼저 찬 조건에서 전달된다.
- **근실시간(near real-time)** : 버퍼만큼 늦게 도착하는 수준. 초~분 단위 지연을 뜻한다.
- **제로 버퍼링** : 버퍼 간격을 0초로 두어 모으지 않고 수 초 안에 전달하는 설정.
- **Direct PUT** : 프로듀서가 Firehose API 로 직접 레코드를 넣는 방식.
- **레코드 포맷 변환** : 들어온 JSON 을 적재 전에 Parquet·ORC 로 바꾸는 기능. Glue 테이블의 스키마를 쓴다.
- **동적 파티셔닝** : 레코드 안의 값으로 S3 폴더(접두사)를 나눠 적재하는 기능.
- **작은 파일 문제** : 잘게 쪼개진 파일이 너무 많아 쿼리 엔진이 느려지는 현상.
- **COPY** : S3 의 파일을 Redshift 로 병렬 적재하는 명령. Firehose 가 Redshift 에 넣을 때 내부적으로 쓴다.
- **매니페스트 파일** : 적재할(또는 건너뛴) S3 객체 목록을 적은 파일. 실패분을 수동으로 다시 넣을 때 쓴다.

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
해설: Firehose는 변환 실패·적재 실패 레코드를 폐기하지 않고 지정한 S3 백업(에러) 위치로 보내, 이후 조사·재처리가 가능하게 한다(단, S3 전달 자체가 재시도 기간을 넘겨 실패하면 유실될 수 있다). 즉시 폐기·스트림 중단·프로듀서 동기 예외는 모두 Firehose의 동작이 아니며 운영 안정성에도 어긋난다.

---
