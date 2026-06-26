# Day 5 - Week 2 종합: 데이터 수집 1 복습

이번 주는 데이터 엔지니어링의 출발점인 "수집(ingestion)"을 배치와 스트리밍으로 나눠 훑었다. 오늘은 흩어진 조각을 하나의 의사결정 지도로 묶는다. DEA-C01 수집 도메인 문제의 9할은 "이 시나리오에 어떤 서비스를 골라야 하나"이고, 그 답은 항상 키워드에서 나온다. 이 종합편의 목표는 시나리오 → 서비스 매핑을 반사적으로 떠올리게 만드는 것이다.

## 한 장으로 보는 수집 서비스 지도

```
                        데이터 수집
                            │
        ┌───────────────────┴───────────────────┐
      배치(Batch)                          스트리밍(Streaming)
        │                                       │
  ┌─────┼─────────┬──────────┐         ┌────────┼──────────┬─────────┐
S3 업로드  DataSync  Transfer   Snow     KDS      Firehose    MSK
(단발/소량) (반복/대량) Family    (PB/느린  (실시간   (근실시간    (기존
           동기화·검증 (SFTP 수신) 회선)    멀티컨슈머 단순적재)    Kafka)
                                          ·재처리)
```

## 배치 4종 복습

| 서비스 | 한 줄 정의 | 결정 키워드 |
|--------|-----------|-------------|
| S3 업로드 | 데이터 레이크 착륙장 | 단발·소량, 멀티파트(대용량), Lifecycle abort |
| DataSync | 온프레미스↔AWS 자동 동기화 | 대량·반복 스케줄·무결성 검증·메타데이터 보존·충분한 회선 |
| Transfer Family | SFTP/FTPS 수신 게이트웨이 | 외부 파트너가 표준 프로토콜로 밀어넣음, 코드 변경 최소 |
| Snow 패밀리 | 물리 배송 마이그레이션 | 페타바이트급·느린 회선·일회성 |

> 💡 **관련 이론**: 배치 선택의 두 축은 "데이터양"과 "회선 상황"이다. 회선이 충분하면 온라인(DataSync), 부족하거나 데이터가 너무 크면 오프라인(Snow). 그리고 "내가 끌어오는가(DataSync) vs 외부가 밀어넣는가(Transfer Family)"라는 방향 축이 추가된다. 이 두 축만 잡으면 배치 문제는 거의 다 풀린다.

## 스트리밍 3종 복습

```
KDS      : 실시간 파이프. 샤드 단위. 멀티 컨슈머·재처리 가능. 컨슈머 코드 직접 작성.
Firehose : 근실시간 적재 파이프. 버퍼링 후 S3/Redshift/OpenSearch에 자동 적재. 코드 거의 없음.
MSK      : 관리형 Apache Kafka. 표준 오픈소스·이식성. 기존 Kafka 자산 이전에 최적.
```

핵심 구분 세 가지를 다시 못 박자.

1. **KDS vs Firehose** — 복잡한 실시간 처리·여러 컨슈머·재처리면 KDS, 단순 적재면 Firehose. 둘을 잇는 조합(KDS 소스 → Firehose가 S3 적재)은 "실시간 분석 + 원본 보관" 시나리오의 정답.
2. **Kinesis vs MSK** — "기존 Apache Kafka"가 보이면 MSK, "최소 운영·AWS 네이티브·단순 적재"면 Kinesis.
3. **로그 모델 공통점** — KDS·Kafka는 모두 append-only 로그라 소비해도 안 사라지고 멀티 컨슈머·재처리가 된다. SQS와 다르다.

```python
# 종합 패턴: KDS(실시간 분석) + Firehose(원본 S3 보관) 동시 운용
import boto3
firehose = boto3.client("firehose")

firehose.create_delivery_stream(
    DeliveryStreamName="raw-archive",
    DeliveryStreamType="KinesisStreamAsSource",          # 소스를 KDS로 지정
    KinesisStreamSourceConfiguration={
        "KinesisStreamARN": "arn:aws:kinesis:...:stream/clickstream",
        "RoleARN": "arn:aws:iam::123456789012:role/firehose-role"
    },
    S3DestinationConfiguration={
        "BucketARN": "arn:aws:s3:::my-data-lake",
        "RoleARN": "arn:aws:iam::123456789012:role/firehose-role",
        "BufferingHints": {"SizeInMBs": 128, "IntervalInSeconds": 300},
        "CompressionFormat": "GZIP"
    }
)
# 같은 clickstream을 실시간 분석 Lambda가 별도로 소비 → 분석 + 보관 동시 달성
```

> 💡 **관련 이론**: 잘 설계된 스트리밍 아키텍처는 "수집 → 처리 → 적재"가 느슨하게 결합된다. KDS/MSK가 수집·버퍼 역할을 하면서 여러 다운스트림(실시간 분석, 데이터 레이크 적재, 검색 인덱싱)을 동시에 먹인다. 이 분리 덕분에 한 컨슈머가 느려져도 다른 컨슈머나 프로듀서가 막히지 않는다. 로그 기반 스트림이 단순 큐보다 데이터 플랫폼에 적합한 이유다.

## 자주 틀리는 함정 정리

- **멀티파트 미완료 조각** → 보이지 않는 S3 비용, Lifecycle abort 규칙으로 해결
- **핫 샤드/핫 파티션** → 편향된 파티션 키, 카디널리티 높은 키로 교체
- **작은 파일 문제** → Firehose 버퍼 크기를 키워 큰 파일로 적재
- **Firehose는 재처리 불가** → 재처리·멀티 컨슈머가 필요하면 KDS
- **병렬성 상한 = 샤드/파티션 수** → 컨슈머만 늘려도 소용없음
- **Redshift 적재는 S3 경유 COPY** → 단건 INSERT 아님

## 다음 주 예고

Week 3는 수집된 데이터를 저장·정리하는 영역(데이터 레이크와 스토리지, 카탈로그)으로 넘어간다. 오늘 만든 "어떻게 들여오나"의 지도가, 다음 주 "어디에 어떻게 쌓나"와 자연스럽게 이어진다. 수집 도메인의 키워드 매핑을 확실히 체화하고 넘어가자.

## 📝 연습 문제

**문제 1.** 다음 중 KDS를 Firehose보다 우선해야 하는 시나리오는?

A) 여러 컨슈머가 같은 데이터를 독립적으로 소비하고, 버그 수정 후 과거 데이터를 재처리해야 한다  
B) 스트리밍 데이터를 추가 코드 없이 S3에 적재만 하면 된다  
C) 운영 부담을 최소화하고 싶다  
D) 데이터를 곧바로 Redshift에 적재만 하면 된다  

**정답: A**  
해설: 멀티 컨슈머 독립 소비와 재처리(replay)는 KDS의 핵심 강점이다. Firehose는 보존·재처리가 없고 정해진 목적지로만 흘려보낸다. A·C·D는 모두 단순 적재·최소 운영으로 Firehose가 더 적합한 경우다.

---

**문제 2.** 온프레미스 파일 서버의 데이터를 매일 야간에 변경분만 무결성 검증과 함께 S3로 동기화한다. 회선 대역폭은 충분하다. 가장 적절한 서비스는?

A) Snowball Edge  
B) Transfer Family  
C) AWS DataSync  
D) Kinesis Data Firehose  

**정답: C**  
해설: 대량·반복 스케줄·증분·무결성 검증 + 충분한 회선은 DataSync의 정석이다. 회선이 충분하므로 물리 배송(Snowball)은 불필요하다. Transfer Family는 외부가 SFTP로 밀어넣는 수신 패턴이고, Firehose는 스트리밍 적재 도구로 온프레미스 파일 동기화와 맞지 않는다.

---

**문제 3.** 한 회사가 기존 Apache Kafka 기반 파이프라인과 Kafka Connect 커넥터를 운영 중이며, 이를 AWS로 코드 변경 최소화하며 옮기려 한다. 동시에 클러스터 운영 부담도 줄이고 싶다. 가장 적절한 선택은?

A) Kinesis Data Streams로 재작성  
B) Amazon MSK(필요 시 MSK Serverless)  
C) SQS로 마이그레이션  
D) Snowmobile로 이전  

**정답: B**  
해설: 기존 Kafka 자산을 코드 변경 없이 이전하려면 표준 Kafka API를 제공하는 MSK가 정답이며, 운영 부담을 더 줄이려면 용량을 자동 관리하는 MSK Serverless를 고른다. KDS 재작성은 코드 변경이 크고, SQS는 Kafka 모델이 아니며, Snowmobile은 데이터 물리 이전 장비로 스트리밍 플랫폼이 아니다.

---

**문제 4.** Firehose로 S3에 적재한 데이터를 Athena로 분석하는데, 수많은 작은 파일과 행 기반 JSON 때문에 쿼리가 느리고 비싸다. 두 가지 개선 방향으로 옳은 것은?

A) 버퍼 시간을 줄이고 압축을 끈다  
B) 파티션 키를 country로 바꾼다  
C) 목적지를 OpenSearch로 바꾼다  
D) 버퍼 크기를 키워 큰 파일로 만들고, Parquet/ORC 컬럼형으로 포맷 변환한다  

**정답: D**  
해설: 작은 파일 문제는 버퍼 크기를 키워 큰 파일로 적재하면 완화되고, 컬럼형(Parquet/ORC) 변환은 Athena 스캔량을 줄여 속도·비용을 모두 개선한다. 버퍼 시간 단축·압축 해제는 오히려 악화시키고, OpenSearch 변경은 Athena 요구와 무관하며, 파티션 키는 스트림 분산 개념으로 Athena 파일 문제와 관계없다.

---

**문제 5.** KDS와 Amazon MSK가 공통으로 가진, 단순 메시지 큐(SQS)와 구별되는 특성은?

A) append-only 로그로 보존 기간 동안 데이터를 보관해 여러 컨슈머의 독립 재소비·재처리가 가능하다  
B) 메시지를 소비하면 즉시 삭제된다  
C) 처리량이 고정되어 확장할 수 없다  
D) 단일 컨슈머만 지원한다  

**정답: A**  
해설: KDS와 MSK(Kafka)는 모두 분산 append-only 로그로, 소비해도 데이터가 사라지지 않고 보존 기간 안에서 여러 컨슈머가 각자 위치(체크포인트/오프셋)로 독립 재소비·재처리할 수 있다. SQS는 소비 시 삭제되는 큐다. 두 서비스 모두 샤드/파티션 추가로 확장 가능하고 멀티 컨슈머를 지원하므로 나머지 보기는 틀렸다.

---
