# Day 3 - AWS 데이터 서비스 조감도

AWS의 데이터 관련 서비스는 수십 개다. 처음 콘솔을 열면 Kinesis, Glue, EMR, Redshift, Athena, Lake Formation… 비슷해 보이는 이름들이 쏟아져 막막하다. 하지만 이들을 **데이터가 흐르는 순서**대로 줄 세우면 지도가 그려진다. 데이터는 항상 **수집 → 저장 → 처리 → 분석**의 흐름을 따르고, 그 전체를 가로질러 **거버넌스(보안·카탈로그)**가 감싼다.

오늘은 이 5개 카테고리에 어떤 서비스가 어디에 속하는지 지도를 그린다. 개별 서비스의 깊은 디테일은 이후 주차에서 다루고, 오늘은 "이 서비스가 파이프라인의 어느 단계에 있는가"를 머릿속에 배치하는 것이 목표다. 시험 문제의 절반은 "이 시나리오에 맞는 서비스는?"이고, 그 답은 이 지도에서 나온다.

## 데이터 흐름이 곧 서비스 지도

```
[수집]      [저장]        [처리]          [분석]
 Kinesis  →  S3       →   Glue        →  Athena
 MSK         Redshift     EMR            Redshift
 DMS         DynamoDB     Lambda         QuickSight
 DataSync                 EMR Serverless OpenSearch
   │            │            │               │
   └────────────┴────────────┴───────────────┘
         [거버넌스] Lake Formation · Glue Catalog · IAM · KMS
```

이 한 장이 DEA-C01 서비스 지식의 뼈대다. 데이터는 왼쪽(수집)에서 오른쪽(분석)으로 흐르고, 아래의 거버넌스 계층이 전 구간의 권한·카탈로그·암호화를 관장한다.

> 💡 **관련 이론**: 이 흐름을 산업 표준 용어로 "데이터 파이프라인의 단계"라 한다. 각 단계는 느슨하게 결합(loosely coupled)되어야 한다. 예를 들어 수집(Kinesis)과 처리(Lambda) 사이에 S3나 스트림 버퍼를 두면, 처리 단계가 느려도 수집이 막히지 않는다. 이 "버퍼로 단계를 분리"하는 패턴이 견고한 파이프라인 설계의 핵심이다.

## 수집(Ingestion): 데이터를 들여오기

원천에서 AWS로 데이터를 가져오는 입구다. 원천의 성격에 따라 도구가 갈린다.

| 서비스 | 용도 | 언제 |
|--------|------|------|
| Kinesis Data Streams | 실시간 스트림 수집 | 낮은 지연, 다중 소비자 |
| Kinesis Data Firehose | 스트림 → S3/Redshift 적재 | 준실시간 자동 배달 |
| Amazon MSK | 관리형 Apache Kafka | 기존 Kafka 생태계 |
| AWS DMS | DB 마이그레이션/복제 | RDS·온프렘 DB를 S3/Redshift로 |
| AWS DataSync | 대용량 파일 전송 | 온프렘 NFS/SMB → S3 |

핵심 구분: **실시간 이벤트 스트림은 Kinesis/MSK**, **기존 데이터베이스의 변경을 가져오려면 DMS(CDC 포함)**, **온프렘 파일 덩어리는 DataSync**다.

> 💡 **관련 이론**: DMS의 진가는 CDC(Change Data Capture)에 있다. 운영 DB의 트랜잭션 로그를 읽어 "변경분만" 지속적으로 복제하므로, 전체를 매번 덤프하지 않고도 분석 환경을 최신으로 유지한다. OLTP에 부하를 거의 주지 않으면서 OLAP로 데이터를 흘려보내는 표준 방식이다.

## 저장(Storage): 데이터를 담기

수집한 데이터가 머무는 곳. Day 1의 OLTP/OLAP, 레이크/웨어하우스 구분이 그대로 적용된다.

| 서비스 | 유형 | 역할 |
|--------|------|------|
| Amazon S3 | 객체 스토리지 | 데이터레이크의 토대, 모든 원시 데이터 |
| Amazon Redshift | 데이터 웨어하우스(OLAP) | 정제된 정형 데이터 대규모 분석 |
| Amazon DynamoDB | NoSQL(OLTP) | 키-값, 저지연 대량 읽기/쓰기 |
| Amazon RDS/Aurora | 관계형(OLTP) | 트랜잭션 운영 DB |

**S3가 모든 것의 중심**이다. 데이터레이크의 토대이자, 거의 모든 처리·분석 서비스의 입출력 지점이다. "어디에 저장할까"가 막연하면 일단 S3가 기본값이다.

```bash
# S3는 데이터레이크의 토대 — 파티션 구조로 저장
aws s3 cp orders.parquet \
  s3://datalake/raw/orders/year=2026/month=06/day=25/

# Athena가 이 S3 위에서 바로 SQL 조회 (별도 적재 불필요)
# Glue Catalog가 스키마를 알고 있으면 즉시 쿼리 가능
```

> 💡 **관련 이론**: S3 스토리지 클래스(Standard, Intelligent-Tiering, Glacier 등)와 수명주기 정책은 비용 최적화의 핵심이다. 자주 안 쓰는 과거 데이터를 자동으로 저렴한 계층으로 옮기는 것이 데이터 엔지니어의 일상 업무이며, 시험에서도 비중 있게 다뤄진다.

## 처리(Processing): 데이터를 변환하기

원시 데이터를 분석 가능한 형태로 정제·변환하는 엔진들이다. 데이터 양과 작업 성격으로 고른다.

| 서비스 | 엔진 | 적합한 작업 |
|--------|------|------------|
| AWS Glue | 서버리스 Spark | 관리형 ETL, 카탈로그 통합 |
| Amazon EMR | Hadoop/Spark 클러스터 | 대규모·커스텀 빅데이터 처리 |
| AWS Lambda | 함수 | 가벼운 이벤트 기반 변환 |
| Glue / EMR Serverless | 서버리스 | 클러스터 관리 없이 Spark |

**Glue는 "관리형 ETL의 기본값"**이다. 서버 관리 없이 Spark 기반 변환을 돌리고, 데이터 카탈로그·크롤러·스케줄러가 통합돼 있다. **EMR은 더 큰 제어와 규모**가 필요하거나 기존 Hadoop/Spark 코드를 그대로 옮길 때 쓴다. **Lambda는 작은 단위의 이벤트 기반 변환**(파일 하나 도착 시 가공 등)에 적합하다.

> 💡 **관련 이론**: Glue Crawler는 S3 데이터를 스캔해 스키마를 자동 추론하고 Glue Data Catalog에 테이블로 등록한다. 이 카탈로그가 Athena·Redshift Spectrum·EMR이 공유하는 "공통 메타데이터 사전"이 된다. 즉 한 번 카탈로그에 등록하면 여러 분석 엔진이 같은 정의로 같은 데이터를 본다.

## 분석(Analytics): 데이터에서 답 얻기

정제된 데이터에 질문을 던지는 소비 계층이다.

| 서비스 | 용도 |
|--------|------|
| Amazon Athena | S3 위 서버리스 SQL 쿼리 |
| Amazon Redshift | 대규모 웨어하우스 쿼리 |
| Amazon QuickSight | BI 대시보드·시각화 |
| Amazon OpenSearch | 로그·텍스트 검색, 실시간 분석 |

**Athena는 S3에 적재된 데이터를 옮기지 않고 그 자리에서 SQL로 조회**하는 서버리스 도구다. 인프라가 없고 스캔한 데이터량만큼 과금돼, 가끔 하는 애드혹 분석에 이상적이다. 자주·빠르게 대규모로 조회한다면 데이터를 Redshift에 적재한다. 최종 결과를 사람이 보는 대시보드로 만들려면 QuickSight다.

## 거버넌스(Governance): 전 구간을 통제하기

수집부터 분석까지 모든 단계를 가로지르는 보안·카탈로그·권한 계층이다.

| 서비스 | 역할 |
|--------|------|
| AWS Lake Formation | 데이터레이크 중앙 권한·거버넌스 |
| AWS Glue Data Catalog | 통합 메타데이터 카탈로그 |
| AWS IAM | 신원·접근 권한 |
| AWS KMS | 암호화 키 관리 |

**Lake Formation은 S3 데이터레이크에 "테이블·컬럼·행 단위"의 세밀한 권한**을 부여한다. IAM이 "이 사람이 이 S3 버킷에 접근 가능한가"라면, Lake Formation은 "이 사람이 이 테이블의 이 컬럼까지 볼 수 있는가"를 통제한다.

> 💡 **관련 이론**: 거버넌스가 별도 카테고리인 이유는, 데이터 파이프라인에서 보안·권한·계보(lineage)는 한 단계의 문제가 아니라 전 구간을 관통하는 횡단 관심사(cross-cutting concern)이기 때문이다. 누가 어떤 데이터에 접근했고, 그 데이터가 어디서 와서 어디로 갔는지(data lineage)를 추적하는 것이 거버넌스의 본질이다.

## 정리하며

오늘 그린 지도의 핵심은 하나다. AWS 데이터 서비스는 **수집 → 저장 → 처리 → 분석**의 흐름에 배치되고, **거버넌스**가 그 전체를 감싼다. 막연한 시나리오 문제를 만나면 "이건 흐름의 어느 단계인가"를 먼저 묻고, 그 단계의 후보 서비스 중에서 "실시간이냐 배치냐, 관리형이냐 제어냐, 양이 얼마냐"로 좁히면 된다.

다음 글에서는 이 파이프라인을 흐르는 데이터가 어떤 "형태"로 저장되는지 — CSV·JSON·Parquet·ORC·Avro와 컬럼형 vs 행형, 스키마 진화 — 를 본다.

---

## 📝 연습 문제

**문제 1.** AWS 데이터 파이프라인을 이해하는 기본 골격인 4단계 흐름을 순서대로 올바르게 나열한 것은?

A) 분석 → 처리 → 저장 → 수집  
B) 수집 → 저장 → 처리 → 분석  
C) 저장 → 수집 → 분석 → 처리  
D) 처리 → 수집 → 분석 → 저장  

**정답: B**  
해설: 데이터는 원천에서 들여오는 수집(Kinesis/DMS 등) → 담아두는 저장(S3/Redshift) → 변환하는 처리(Glue/EMR) → 답을 얻는 분석(Athena/QuickSight)의 순서로 흐른다. 거버넌스(Lake Formation/IAM/KMS)는 이 전 구간을 가로질러 감싼다. 나머지 보기는 흐름의 순서가 뒤바뀌어 있다.

---

**문제 2.** 운영 중인 RDS 데이터베이스의 변경분(CDC)을 운영 부하 없이 지속적으로 분석 환경(S3/Redshift)으로 복제하려 한다. 가장 적합한 수집 서비스는?

A) AWS DataSync  
B) AWS DMS  
C) Kinesis Data Streams  
D) Amazon QuickSight  

**정답: B**  
해설: DMS는 데이터베이스 마이그레이션·복제 서비스로, CDC를 통해 트랜잭션 로그에서 변경분만 읽어 OLTP에 거의 부하를 주지 않고 분석 환경으로 흘려보낸다. DataSync는 온프렘 파일 전송, Kinesis는 실시간 이벤트 스트림, QuickSight는 BI 시각화 도구다.

---

**문제 3.** S3에 적재된 데이터를 별도 인프라 없이, 데이터를 옮기지 않고 그 자리에서 SQL로 애드혹 조회하며 스캔량만큼 과금받는 서비스는?

A) Amazon Redshift  
B) Amazon Athena  
C) Amazon EMR  
D) AWS Glue  

**정답: B**  
해설: Athena는 S3 위에서 동작하는 서버리스 SQL 쿼리 엔진으로, 데이터를 적재·이동하지 않고 그 자리에서 조회하며 스캔한 데이터량만큼 과금한다. Redshift는 데이터를 적재해야 하는 웨어하우스, EMR은 빅데이터 클러스터, Glue는 ETL 처리 엔진이다.

---

**문제 4.** 여러 분석 엔진(Athena, Redshift Spectrum, EMR)이 같은 데이터를 동일한 스키마 정의로 공유하도록 메타데이터를 중앙 관리하는 서비스는?

A) AWS Glue Data Catalog  
B) Amazon S3  
C) AWS KMS  
D) Amazon DynamoDB  

**정답: A**  
해설: Glue Data Catalog는 통합 메타데이터 카탈로그로, Crawler가 등록한 테이블 정의를 Athena·Redshift Spectrum·EMR 등이 공통으로 참조한다. S3는 데이터 저장소, KMS는 암호화 키 관리, DynamoDB는 NoSQL 데이터베이스다.

---

**문제 5.** IAM이 "버킷 접근 가능 여부"를 통제한다면, S3 데이터레이크에서 테이블·컬럼·행 단위의 세밀한 접근 권한을 중앙에서 부여하는 거버넌스 서비스는?

A) AWS KMS  
B) AWS Lake Formation  
C) Amazon OpenSearch  
D) AWS DataSync  

**정답: B**  
해설: Lake Formation은 데이터레이크에 테이블·컬럼·행 수준의 세밀한 권한을 중앙에서 부여하는 거버넌스 서비스다. IAM이 리소스(버킷) 단위 접근을 다룬다면 Lake Formation은 그 안의 데이터 단위를 통제한다. KMS는 암호화 키, OpenSearch는 검색 분석, DataSync는 파일 전송 도구다.

---
