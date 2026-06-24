# Day 1 - 데이터 수집: S3 데이터 레이크, Kinesis, 배치 수집, 데이터 포맷

머신러닝 파이프라인의 첫 번째 관문은 "데이터를 어디서, 어떻게 가져오는가"다. 모델 아키텍처가 아무리 정교해도 데이터가 들어오지 않으면 아무것도 학습할 수 없다. MLA-C01 시험에서 도메인 1(Data Preparation for Machine Learning)이 전체의 약 28%를 차지하는데, 그 출발점이 바로 **수집(ingestion)**이다.

오늘은 데이터가 AWS 안으로 들어오는 세 가지 경로 — 데이터 레이크의 중심인 S3, 실시간 스트리밍의 Kinesis, 그리고 주기적인 배치 수집 — 을 본다. 마지막으로 ML 학습 성능을 좌우하는 데이터 포맷(Parquet/CSV/JSON) 선택까지 다룬다.

## S3: ML 데이터 레이크의 중심

AWS에서 ML 데이터의 사실상 단일 진실 공급원(single source of truth)은 **Amazon S3**다. SageMaker의 학습 잡, Glue의 ETL, Athena의 쿼리가 모두 S3를 입출력으로 사용한다. S3가 ML 데이터 레이크의 중심인 이유는 세 가지다.

1. **사실상 무제한 용량**: 객체 하나당 최대 5TB, 버킷당 객체 수 제한 없음. 페타바이트 규모 학습 데이터도 수용.
2. **컴퓨트와 스토리지 분리**: 데이터를 S3에 두고, 필요할 때만 SageMaker/EMR/Glue 컴퓨트를 붙인다. 비용이 사용량에 비례.
3. **광범위한 통합**: 거의 모든 AWS 분석/ML 서비스가 S3를 네이티브로 읽고 쓴다.

데이터 레이크는 보통 **존(zone)**으로 계층화한다.

| 존 | 별칭 | 내용 | 포맷 |
|------|------|------|------|
| Raw | Bronze / Landing | 원본 그대로 수집된 데이터 | 원본(JSON, CSV, 로그) |
| Cleaned | Silver | 정제·검증된 데이터 | Parquet |
| Curated | Gold | 피처 엔지니어링 완료, 학습 직전 | Parquet |

> 💡 **관련 이론**: 이 Bronze/Silver/Gold 계층화는 Databricks가 대중화한 **메달리온 아키텍처(Medallion Architecture)**다. 핵심 발상은 "원본을 절대 덮어쓰지 말고, 각 변환 단계를 별도 존에 보존하라"이다. 이렇게 하면 변환 로직에 버그가 발견됐을 때 Raw로 돌아가 재처리할 수 있고, 데이터 lineage(계보) 추적이 쉬워진다. 불변성(immutability)을 데이터 레이아웃 수준에서 강제하는 패턴이다.

S3 스토리지 클래스도 ML 맥락에서 중요하다. 자주 학습에 쓰는 데이터는 **S3 Standard**, 가끔 재학습용으로 보관하는 과거 데이터는 **S3 Intelligent-Tiering**(접근 패턴 자동 분석)이나 **Glacier**가 적합하다.

```python
import boto3

s3 = boto3.client("s3")

# 학습 데이터 업로드 (curated 존)
s3.upload_file(
    Filename="train.parquet",
    Bucket="ml-datalake-prod",
    Key="curated/customer-churn/year=2026/month=06/train.parquet",
)
```

> 🔍 **더 깊이**: 위 Key의 `year=2026/month=06/` 부분이 바로 **Hive 스타일 파티셔닝**이다. Athena와 Glue가 이 `키=값` 디렉터리 구조를 읽어 파티션을 자동 인식한다. 파티셔닝은 Day 4에서 깊게 다룬다.

## Kinesis: 실시간 스트리밍 수집

배치로는 부족한 경우 — 클릭스트림, IoT 센서, 실시간 사기 탐지 — 에는 **Kinesis** 제품군을 쓴다. 시험은 4개 변형의 용도를 정확히 구분하는지 묻는다.

| 서비스 | 용도 | 핵심 특징 |
|------|------|------|
| **Kinesis Data Streams (KDS)** | 저지연 커스텀 스트림 처리 | 샤드 기반, 데이터 보관 1~365일, 소비자가 직접 처리 |
| **Kinesis Data Firehose** | 스트림 → 저장소(S3/Redshift/OpenSearch) 적재 | 완전관리형, 서버리스, near-real-time(버퍼링) |
| **Kinesis Data Analytics** | 스트림에 대한 SQL/Flink 실시간 분석 | 윈도우 집계 |
| **Kinesis Video Streams** | 비디오 스트림 수집 | ML 비전 파이프라인 입력 |

ML 데이터 수집에서 가장 자주 나오는 조합은 **KDS → Firehose → S3**다. 또는 단순히 **Firehose → S3**로 직접 적재한다. Firehose는 버퍼 크기(예: 5MB)나 버퍼 시간(예: 60초) 중 먼저 도달하는 조건에 따라 S3에 배치로 떨군다.

```python
import boto3, json

firehose = boto3.client("firehose")

firehose.put_record(
    DeliveryStreamName="clickstream-to-s3",
    Record={"Data": json.dumps({"user": "u123", "event": "click"}) + "\n"},
)
```

> 🔍 **더 깊이**: KDS는 **샤드(shard)** 단위로 처리량을 정한다. 샤드 하나당 쓰기 1MB/s(또는 1,000 레코드/s), 읽기 2MB/s. 처리량이 부족하면 샤드를 늘려야(resharding) 한다. 반면 Firehose는 서버리스라 샤드 관리가 없는 대신, "실시간"이 아니라 버퍼링된 "near-real-time"이다. 시험에서 "관리 부담 최소화 + S3 적재"면 Firehose, "1초 미만 커스텀 처리 + 다중 소비자"면 KDS가 답이다.

> 💡 **관련 이론**: Kinesis는 분산 로그(distributed log) 추상화를 따른다. 같은 패러다임의 오픈소스가 Apache Kafka다. 핵심은 데이터를 **append-only 로그**에 순서대로 쓰고, 여러 소비자가 각자의 오프셋(체크포인트)을 들고 독립적으로 읽는 것이다. 이 덕분에 한 스트림을 실시간 대시보드와 ML 피처 파이프라인이 동시에 소비할 수 있다.

## 배치 수집: DataSync, Transfer Family, DMS, Glue

실시간이 필요 없는 대부분의 ML 데이터는 배치로 수집한다.

| 서비스 | 출처 → 대상 | 용도 |
|------|------|------|
| **AWS DataSync** | 온프레미스 NFS/SMB → S3/EFS | 대용량 파일 일회성·주기적 마이그레이션 |
| **AWS Transfer Family** | SFTP/FTPS 클라이언트 → S3 | 파트너가 SFTP로 데이터 전송 |
| **AWS DMS** | 관계형 DB(RDS/온프레) → S3/Redshift | DB 데이터를 분석/ML용으로 복제 |
| **AWS Glue (배치 ETL)** | 다양한 소스 → S3 | 변환 포함 정기 수집 (Day 2) |
| **Snowball/Snowmobile** | 페타바이트급 물리 이전 | 네트워크로는 비현실적인 규모 |

> 🔍 **더 깊이**: 시험 단골 함정 — "온프레미스 100TB를 S3로, 인터넷 회선 100Mbps". 100TB를 100Mbps로 보내면 약 92일 걸린다. 이 경우 **Snowball**(물리 디바이스 배송)이 정답이다. 회선이 충분하면 DataSync. DMS는 "관계형 DB의 지속적 복제(CDC, Change Data Capture)"가 키워드일 때 답이다.

## 데이터 포맷: Parquet vs CSV vs JSON

ML 학습 성능과 비용을 좌우하는 결정이다. 시험에 매우 자주 나온다.

| 포맷 | 저장 방식 | 압축 | 스키마 | 적합 |
|------|------|------|------|------|
| **CSV** | 행 기반(row) | 약함 | 없음 | 소규모, 사람이 읽기 |
| **JSON** | 행 기반 | 약함 | 유연(nested) | 반정형, API 응답, 로그 |
| **Parquet** | **열 기반(columnar)** | 강함(Snappy/GZIP) | 내장 | **대규모 ML/분석** |
| **ORC** | 열 기반 | 강함 | 내장 | Hive 생태계 |
| **Avro** | 행 기반 | 중간 | 내장(진화 지원) | 스트리밍, 스키마 진화 |

**Parquet이 ML의 기본 선택지인 이유**:

- **열 기반 저장**: 학습에 필요한 피처 컬럼만 읽으면 되므로 I/O가 급감. 100개 컬럼 중 5개만 쓰면 5개만 스캔.
- **컬럼 단위 압축**: 같은 타입의 값이 인접해 압축률이 높다. CSV 대비 보통 2~10배 작다.
- **predicate pushdown**: Athena/Spark가 "이 파티션·이 값만" 필요할 때 불필요한 데이터 블록을 건너뛴다.
- **스키마 내장**: 타입 정보가 파일에 들어 있어 별도 스키마 파일이 불필요.

```python
import pandas as pd

# CSV → Parquet 변환 (Snappy 압축)
df = pd.read_csv("raw/transactions.csv")
df.to_parquet("curated/transactions.parquet", compression="snappy", index=False)
```

> 💡 **관련 이론**: 열 기반 저장(columnar storage)의 핵심은 **OLAP(분석) 워크로드 최적화**다. 분석 쿼리는 "수백만 행 × 소수 컬럼의 집계"가 전형적인데, 행 기반 저장은 필요 없는 컬럼까지 디스크에서 읽어야 한다. 열 기반은 컬럼을 따로 저장해 필요한 것만 읽고, 같은 타입이 인접해 run-length/dictionary 인코딩으로 압축률도 높다. 반대로 OLTP(트랜잭션)는 "한 행 전체"를 자주 다뤄 행 기반이 유리하다. ML 학습은 대부분 OLAP 성격이라 Parquet이 맞다.

> ⚠️ **함정**: JSON은 사람이 읽기 좋고 nested 구조에 강하지만, 학습 데이터 포맷으로는 비효율적이다. 텍스트라 용량이 크고, 매번 파싱 비용이 들며, 컬럼 단위 스킵이 불가능하다. Raw 존에는 JSON으로 받더라도, Cleaned/Curated 존으로 갈 때 Parquet으로 변환하는 게 표준 패턴이다.

## 정리하며

ML 데이터 수집의 핵심은 **S3 데이터 레이크를 중심**에 두고, 실시간이면 **Kinesis(Firehose→S3가 가장 흔함)**, 배치면 **DataSync/DMS/Transfer Family**를 선택하며, 저장 포맷은 대규모 학습에 **Parquet**을 기본으로 쓰는 것이다.

다음 글에서는 수집된 데이터를 **AWS Glue**로 카탈로그화하고 ETL로 변환하는 방법을 본다.

---

## 📝 연습 문제

**문제 1.** 한 팀이 웹사이트 클릭스트림을 수집해 S3에 적재하려 한다. 인프라 관리 부담을 최소화하면서 near-real-time으로 S3에 저장하고 싶다. 가장 적합한 서비스는?

A) Kinesis Data Streams로 직접 S3에 쓰기  
B) Kinesis Data Firehose로 S3에 적재  
C) AWS DMS로 클릭스트림 복제  
D) AWS Snowball로 데이터 이전  

**정답: B**  
해설: Firehose는 완전관리형 서버리스로 샤드 관리가 필요 없고, 버퍼 크기/시간 조건에 따라 S3에 자동 배치 적재한다. "관리 부담 최소화 + S3 적재"의 정석 답이다. Kinesis Data Streams(A)는 S3에 직접 쓰지 못하며 소비자 애플리케이션을 직접 구현해야 해 관리 부담이 크다. DMS(C)는 관계형 DB 복제용이라 클릭스트림에 부적합. Snowball(D)은 물리 디바이스 기반 대용량 일회성 이전용이다.

---

**문제 2.** 100개 컬럼을 가진 5TB 데이터셋에서 ML 학습에 5개 컬럼만 사용한다. 학습 시 I/O 비용과 스캔량을 최소화하는 저장 포맷은?

A) CSV (GZIP 압축)  
B) JSON  
C) Parquet  
D) 압축하지 않은 텍스트  

**정답: C**  
해설: Parquet은 열 기반 저장이라 필요한 5개 컬럼만 읽으면 되므로 I/O가 크게 줄고, 컬럼 단위 압축과 predicate pushdown까지 지원한다. CSV(A)는 GZIP으로 압축해도 행 기반이라 100개 컬럼 전체를 읽어야 한다. JSON(B)은 텍스트 기반이라 용량이 크고 파싱 비용이 든다. 압축하지 않은 텍스트(D)는 가장 비효율적이다.

---

**문제 3.** 온프레미스 데이터센터에 200TB의 학습용 이미지가 있고, 인터넷 회선은 50Mbps다. 이 데이터를 S3로 옮기는 가장 현실적인 방법은?

A) AWS DataSync로 인터넷을 통해 전송  
B) AWS Snowball 디바이스로 물리 이전  
C) Kinesis Data Firehose로 스트리밍  
D) S3 멀티파트 업로드 스크립트  

**정답: B**  
해설: 200TB를 50Mbps로 전송하면 1년 이상 걸려 비현실적이다. 이런 페타바이트급/대용량 + 느린 회선 시나리오는 Snowball(물리 디바이스 배송)이 정답이다. DataSync(A)와 멀티파트 업로드(D)는 회선이 충분할 때만 유효하다. Firehose(C)는 스트리밍 수집용이지 대용량 일회성 마이그레이션 도구가 아니다.

---

**문제 4.** ML 데이터 레이크를 구축하며 원본 데이터를 안전하게 보존하면서 변환 단계를 추적하려 한다. 가장 적절한 설계 원칙은?

A) 원본을 변환 결과로 덮어써 스토리지를 절약한다  
B) Raw/Cleaned/Curated 존으로 계층화하고 원본은 절대 덮어쓰지 않는다  
C) 모든 데이터를 하나의 버킷 루트에 평면적으로 저장한다  
D) 변환 후 원본을 즉시 삭제한다  

**정답: B**  
해설: 메달리온 아키텍처(Bronze/Silver/Gold = Raw/Cleaned/Curated)는 원본을 불변으로 보존하고 각 변환 단계를 별도 존에 둔다. 변환 로직 버그 발견 시 Raw로 돌아가 재처리할 수 있고 데이터 계보 추적이 쉽다. 원본 덮어쓰기(A)나 삭제(D)는 재처리 불가능성과 데이터 손실 위험을 낳는다. 평면 저장(C)은 파티셔닝·관리가 어렵다.

---

**문제 5.** 다음 중 Kinesis Data Streams가 Kinesis Data Firehose보다 더 적합한 시나리오는?

A) S3에 데이터를 적재하되 관리 부담을 최소화하고 싶다  
B) 1초 미만 지연으로 커스텀 처리하고 여러 소비자가 같은 스트림을 독립적으로 읽어야 한다  
C) Redshift로 자동 적재만 하면 된다  
D) 서버리스로 인프라 없이 운영하고 싶다  

**정답: B**  
해설: KDS는 샤드 기반 저지연(1초 미만) 처리와 다중 소비자(각자 오프셋 보유)를 지원해, 한 스트림을 실시간 대시보드와 ML 파이프라인이 동시에 소비하는 시나리오에 적합하다. A·C·D는 모두 완전관리형·서버리스로 저장소 적재에 초점을 둔 Firehose의 강점이다.

---
