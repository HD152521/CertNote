# Day 1 - 도메인 1·2 통합 복습: 수집·변환 + 스토어 관리

마지막 주차입니다. 오늘은 시험 비중이 가장 큰 두 영역을 한 흐름으로 복습합니다. **도메인 1(데이터 수집과 변환, 약 34%)**과 **도메인 2(스토어 관리, 약 26%)**를 합치면 시험의 60% 가까이를 차지합니다. 개별 서비스 암기보다 "데이터가 들어와 적재되고 변환되어 저장되는 파이프라인"으로 묶어서 보는 것이 합격의 핵심입니다.

## 도메인 1: 수집(Ingestion) 패턴 정리

수집은 크게 **스트리밍**과 **배치**로 나뉩니다. 시험은 "실시간/초 단위 지연"이라는 키워드가 보이면 스트리밍, "주기적/대량/시간 단위"가 보이면 배치를 묻습니다.

| 요구사항 키워드 | 적합 서비스 | 이유 |
|----------------|------------|------|
| 실시간 스트리밍, 커스텀 컨슈머, 순서 보장 | Kinesis Data Streams | 샤드 기반, 보존 후 재처리 가능 |
| 스트리밍을 S3/Redshift로 무관리 적재 | Data Firehose | 완전관리형, 버퍼링·변환·배달 |
| Kafka 호환 스트리밍 | Amazon MSK | 오픈소스 Kafka 마이그레이션 |
| 대량 파일 일괄 적재 | S3 + Glue | 배치 ETL의 기본 |
| DB 변경분(CDC) 실시간 복제 | AWS DMS | 소스 DB → 타깃 지속 복제 |

> 💡 **관련 이론**: Kinesis Data Streams는 "직접 소비·재처리·순서"가 필요할 때, Firehose는 "무관리 적재"가 목적일 때 고릅니다. Firehose는 샤드/컨슈머 개념이 없고 버퍼 크기·시간으로 목적지에 자동 배달합니다.

## 도메인 1: 변환(Transformation) 정리

변환 엔진 선택은 "서버리스 여부 + 데이터 규모 + 코드 스타일"로 갈립니다.

- **AWS Glue**: 서버리스 Spark ETL. 작은~중간 규모, 스케줄·트리거 기반 ETL의 기본 선택. **Glue 북마크(job bookmark)**로 이미 처리한 데이터를 건너뛰는 증분 ETL이 핵심 기능.
- **Amazon EMR**: 관리형 Hadoop/Spark 클러스터. 대규모, 세밀한 튜닝, 기존 Spark/Hive 코드 재사용 시. 비용 최적화는 Spot 인스턴스 + 인스턴스 플릿.
- **Glue Studio / DataBrew**: 시각적/노코드 변환. DataBrew는 분석가용 데이터 정제·프로파일링.

```python
# Glue 북마크: 마지막 실행 이후 신규 데이터만 처리 (증분 ETL)
job.init(args['JOB_NAME'], args)
dyf = glueContext.create_dynamic_frame.from_catalog(
    database="raw", table_name="events",
    transformation_ctx="dyf"  # 북마크가 이 ctx 기준으로 상태 추적
)
# ... 변환 ...
job.commit()  # commit 시점에 북마크 상태 저장
```

> 💡 **관련 이론**: Glue 북마크는 `transformation_ctx`와 `job.commit()`이 함께 있어야 동작합니다. "증분 ETL", "이미 처리한 데이터 재처리 방지", "스케줄 잡이 매번 전체를 다시 읽음" 같은 문제는 북마크 활성화로 푸는 것이 정답입니다.

## 도메인 2: 데이터 스토어 선택

스토어는 "구조/접근 패턴/쿼리 방식"으로 매핑합니다.

| 요구사항 | 서비스 | 핵심 |
|---------|--------|------|
| 비정형/반정형 레이크, 무한 확장, 저렴 | Amazon S3 | 데이터레이크 기반 스토리지 |
| 대규모 분석 쿼리, 컬럼형 MPP DW | Amazon Redshift | 페타바이트급 OLAP |
| S3 직접 SQL 쿼리, 서버리스 | Amazon Athena | Presto 기반, 인프라 무관리 |
| 키-값 초저지연, 서버리스 | DynamoDB | 단일 자릿수 ms 지연 |
| 관계형 OLTP | RDS / Aurora | 트랜잭션 처리 |

## 도메인 2: Redshift 운영 핵심

Redshift는 시험에서 분배 키와 정렬 키를 자주 묻습니다.

- **분배 스타일(DISTSTYLE)**: `KEY`(조인 컬럼 기준 동일 노드 배치로 셔플 감소), `ALL`(작은 차원 테이블 전체 복제), `EVEN`(균등 분산), `AUTO`(Redshift가 자동 선택).
- **정렬 키(SORTKEY)**: 범위 필터·시간 범위 쿼리 가속. 존 맵으로 블록 스킵.
- **Redshift Spectrum**: S3의 외부 데이터를 로드 없이 Redshift에서 쿼리. 핫 데이터는 Redshift, 콜드 데이터는 S3에 두는 계층 분리.

```sql
CREATE TABLE fact_sales (
  sale_id bigint, customer_id bigint, sale_ts timestamp, amount decimal(10,2)
)
DISTSTYLE KEY DISTKEY (customer_id)   -- 고객 차원과 조인 최적화
SORTKEY (sale_ts);                    -- 시간 범위 쿼리 가속
```

> 💡 **관련 이론**: 큰 팩트 테이블과 작은 차원 테이블 조인에서 차원이 작으면 `DISTSTYLE ALL`, 두 큰 테이블 조인이면 공통 조인 키로 양쪽에 `DISTKEY`를 둬 노드 간 데이터 이동(셔플)을 없앱니다.

## 도메인 2: Lake Formation과 카탈로그

데이터레이크의 권한·메타데이터 관리입니다.

- **Glue Data Catalog**: Athena·Redshift Spectrum·EMR이 공유하는 중앙 메타스토어. 크롤러가 스키마를 자동 추론.
- **Lake Formation**: 데이터레이크의 **중앙 집중식 세분화 권한**. 테이블·컬럼·행·셀 수준 권한과 LF-Tag 기반 정책. S3 객체별 IAM 정책을 일일이 쓰는 대신 중앙에서 데이터 권한을 관리.

> 💡 **관련 이론**: "여러 팀이 S3 데이터레이크를 공유하는데 컬럼/행 단위로 접근을 통제하고 한곳에서 관리하고 싶다"는 시나리오의 정답은 거의 항상 Lake Formation입니다. IAM 버킷 정책만으로는 컬럼·행 수준 제어가 불가능합니다.

## 두 도메인을 잇는 파이프라인 그림

전형적 시험 시나리오 흐름:

1. **수집**: Kinesis/Firehose(스트리밍) 또는 DMS(CDC) → S3 raw 존
2. **카탈로그**: Glue 크롤러가 스키마 추론 → Data Catalog 등록
3. **변환**: Glue 잡(북마크로 증분) 또는 EMR → S3 curated 존(Parquet)
4. **저장/조회**: Athena로 즉석 쿼리, 또는 Redshift로 로드해 BI
5. **거버넌스**: Lake Formation으로 팀별 세분화 권한

## 핵심 정리

- 수집은 스트리밍(Kinesis/Firehose/MSK)과 배치(S3+Glue)·CDC(DMS)로 키워드 매핑.
- 변환은 서버리스면 Glue, 대규모·튜닝이면 EMR. 증분 ETL은 Glue 북마크.
- 스토어는 레이크=S3, 분석 DW=Redshift, 서버리스 SQL=Athena, 키-값=DynamoDB.
- Redshift는 DISTKEY/SORTKEY로 셔플·스캔을 줄이고, Spectrum으로 S3 계층 분리.
- 중앙 세분화 권한은 Lake Formation, 공유 메타스토어는 Glue Data Catalog.

## 📝 연습 문제

**문제 1.** 스케줄로 매시간 실행되는 Glue 잡이 S3의 신규 파일만 처리해야 하는데, 매번 전체 데이터를 다시 읽어 비용과 시간이 과도하다. 가장 적절한 해결책은?

A) EMR 클러스터로 전환한다  
B) Glue 잡 북마크를 활성화하고 transformation_ctx와 job.commit()을 사용한다  
C) S3 버킷을 매시간 비운다  
D) Athena CTAS로 매번 전체를 다시 만든다  

**정답: B**  
해설: Glue 북마크는 이미 처리한 데이터를 추적해 증분 처리를 지원합니다. transformation_ctx로 상태를 추적하고 job.commit() 시점에 저장합니다. 나머지는 증분 처리를 해결하지 못하거나 비용·복잡도를 키웁니다.

---

**문제 2.** 여러 분석 팀이 동일한 S3 데이터레이크를 공유하면서, 특정 테이블의 일부 컬럼(예: 주민번호)은 일부 팀에게만 보이도록 중앙에서 통제하려 한다. 가장 적합한 서비스는?

A) S3 버킷 정책에 팀별 컬럼 규칙을 작성  
B) AWS Lake Formation의 컬럼 수준 권한  
C) EC2 보안 그룹  
D) CloudFront 서명 URL  

**정답: B**  
해설: Lake Formation은 테이블·컬럼·행·셀 수준의 세분화 권한을 중앙에서 관리합니다. S3 버킷 정책은 객체 수준까지만 제어하므로 컬럼 단위 통제가 불가능합니다. 보안 그룹·CloudFront는 데이터 권한과 무관합니다.

---

**문제 3.** 초당 수만 건의 IoT 이벤트를 실시간으로 받아 추가 인프라 관리 없이 자동으로 S3에 Parquet로 버퍼링·변환·적재하려 한다. 가장 적합한 서비스는?

A) Amazon Data Firehose  
B) Amazon RDS  
C) AWS Batch  
D) Amazon SQS 표준 큐  

**정답: A**  
해설: Data Firehose는 완전관리형으로 스트리밍 데이터를 버퍼링하고 포맷 변환(예: Parquet) 후 S3/Redshift 등에 자동 배달합니다. 샤드·컨슈머 관리가 없습니다. RDS/Batch는 스트리밍 적재 용도가 아니며, SQS는 변환·적재 기능이 없습니다.

---

**문제 4.** 페타바이트급 팩트 테이블을 작은 날짜 차원 테이블과 자주 조인한다. 노드 간 데이터 이동(셔플)을 최소화하기 위한 Redshift 분배 설정으로 가장 적절한 것은?

A) 두 테이블 모두 DISTSTYLE EVEN  
B) 모든 테이블에 SORTKEY만 지정  
C) 작은 차원 테이블에 DISTSTYLE ALL  
D) 팩트 테이블을 DynamoDB로 이전  

**정답: C**  
해설: 작은 차원 테이블을 DISTSTYLE ALL로 모든 노드에 복제하면 조인 시 셔플 없이 로컬에서 조인할 수 있습니다. EVEN은 셔플을 유발하고, SORTKEY는 분배가 아닌 스캔 최적화이며, DynamoDB는 대규모 분석 조인에 부적합합니다.

---

**문제 5.** 데이터 분석가가 S3에 저장된 로그를 클러스터나 서버를 띄우지 않고 표준 SQL로 즉석 조회하려 한다. 비용은 스캔한 데이터량 기준으로만 내고 싶다. 가장 적합한 서비스는?

A) Amazon EMR  
B) Amazon EC2에 직접 설치한 Presto  
C) AWS Glue 크롤러  
D) Amazon Athena  

**정답: D**  
해설: Athena는 서버리스로 S3 데이터를 표준 SQL로 쿼리하며 스캔한 데이터량 기준으로 과금합니다. EMR/EC2는 클러스터 운영이 필요하고, Glue 크롤러는 쿼리 엔진이 아니라 스키마 추론 도구입니다.

---
