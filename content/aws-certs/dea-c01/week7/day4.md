# Day 4 - RDS/Aurora & 스토어 선택: OLTP, 제로 ETL, 워크로드→스토어 결정

오늘은 관계형 OLTP 스토어인 Amazon RDS/Aurora를 분석 데이터 흐름 관점에서 보고, **제로 ETL(Aurora→Redshift)** 통합을 다룬 뒤, "워크로드를 보고 스토어를 고르는" 의사결정 프레임을 정리합니다.

## RDS와 Aurora 개요

- **Amazon RDS**: MySQL, PostgreSQL, MariaDB, Oracle, SQL Server 등 관리형 관계형 DB. 패치·백업·복구를 자동화한 전통적 엔진 호스팅.
- **Amazon Aurora**: MySQL/PostgreSQL 호환의 클라우드 네이티브 엔진. 스토리지가 6개 사본(3 AZ)으로 자동 복제되고, 컴퓨트·스토리지가 분리되어 스토리지가 자동 확장(최대 128TiB)됩니다. RDS보다 높은 성능·가용성을 제공.

```text
Aurora: 단일 쓰기 인스턴스 + 다수 읽기 복제본(reader)
        └── 공유 분산 스토리지(6 copies / 3 AZ) — 복제 지연 최소
```

> 💡 **관련 이론**: RDS/Aurora는 본질적으로 **행 기반 OLTP**입니다. 정규화된 스키마, 트랜잭션(ACID), 단건/소량 행 처리에 최적이며, 대규모 컬럼 집계·스캔 분석에는 Redshift/Athena가 적합합니다.

## OLTP vs OLAP

| 구분 | OLTP (RDS/Aurora/DynamoDB) | OLAP (Redshift/Athena) |
|------|----------------------------|------------------------|
| 목적 | 트랜잭션 처리, 운영 | 분석, 집계, 리포팅 |
| 저장 | 행 기반 | 컬럼 기반 |
| 쿼리 | 소량 행 읽기/쓰기, 짧은 응답 | 대량 스캔·집계 |
| 정규화 | 정규화 | 비정규화/스타 스키마 |

분석을 위해 OLTP 데이터를 OLAP 스토어로 옮기는 것이 전통적 ETL입니다. 하지만 이 ETL 파이프라인은 운영·지연·비용 부담이 큽니다.

## 읽기 복제본과 분석 부하 분리

운영 DB에 직접 무거운 분석 쿼리를 던지면 트랜잭션 성능이 저하됩니다. **읽기 복제본(read replica)**으로 분석·리포팅 부하를 분리하는 것이 1차 패턴입니다. 다만 복제본도 행 기반이라 대규모 집계에는 여전히 비효율적입니다.

## 제로 ETL: Aurora → Redshift

**제로 ETL(Zero-ETL) 통합**은 Aurora(및 RDS MySQL/PostgreSQL, DynamoDB)의 데이터를 **파이프라인 구축 없이** Redshift로 거의 실시간 복제합니다. CDC를 AWS가 관리해주므로, Glue 잡·DMS 파이프라인을 직접 운영하지 않아도 됩니다.

```text
Aurora MySQL/PostgreSQL
   │  (Zero-ETL 통합 — 관리형 CDC, 수 초~수 분 지연)
   ▼
Amazon Redshift  ──►  복제된 데이터로 즉시 분석/집계
```

- 운영 트랜잭션이 발생하면 변경분이 Redshift에 거의 실시간 반영.
- ETL 코드·스케줄러·DMS 인스턴스 운영 부담 제거.
- 분석은 Redshift에서, 운영은 Aurora에서 → 워크로드 격리.
- 유사하게 **DynamoDB → Redshift 제로 ETL**, **DynamoDB → OpenSearch 제로 ETL**도 제공.

> 💡 **관련 이론**: 제로 ETL은 "ETL을 없앤다"기보다 **AWS가 CDC 복제를 관리형으로 대신**하는 것입니다. 직접 DMS/Glue를 운영하던 부담을 줄여, 운영 OLTP와 분석 OLAP를 낮은 지연으로 연결합니다.

## DMS와의 비교

- **AWS DMS(Database Migration Service)**: 이종 DB 간 마이그레이션·지속 복제(CDC). 소스/타깃 조합이 유연(예: Oracle→Aurora). 인스턴스를 프로비저닝·운영해야 함.
- **제로 ETL**: 특정 소스(Aurora/RDS/DynamoDB)→Redshift/OpenSearch에 한정되지만 완전관리형·코드리스.

마이그레이션이나 폭넓은 소스 조합이면 DMS, Aurora→Redshift 분석 연결이면 제로 ETL이 적합합니다.

## 워크로드 → 스토어 결정 프레임

접근 패턴을 먼저 정의하고 스토어를 매핑합니다.

```text
정규화 트랜잭션, 조인, ACID, 소량 행 ......... RDS / Aurora
키 기반 고속 조회, 대규모 동시성, 서버리스 .... DynamoDB
대량 집계·BI·복잡 조인(정형 DW) .............. Redshift
S3 데이터 애드혹 SQL, 서버리스, 간헐적 ........ Athena
전문 검색·로그 분석·관측성 ................... OpenSearch
인메모리 캐시·초저지연 ....................... ElastiCache
그래프 관계 탐색 ............................. Neptune
시계열(IoT 메트릭) ........................... Timestream
```

선택 기준 요약:
- **접근 패턴**: 키 조회 vs 집계 vs 검색 vs 관계.
- **데이터 형태**: 정형/반정형/비정형.
- **지연·동시성**: ms급 OLTP vs 분석 처리량.
- **운영 모델**: 서버리스 선호 시 Athena/DynamoDB 온디맨드.
- **비용 모델**: 스캔량(Athena) vs 프로비저닝(Redshift) vs 처리량(DynamoDB).

## 핵심 정리

- RDS/Aurora는 행 기반 OLTP. Aurora는 컴퓨트·스토리지 분리, 6사본 자동복제로 고가용·고성능.
- 분석 부하는 읽기 복제본으로 분리하거나, 더 나아가 제로 ETL로 Redshift에 거의 실시간 복제.
- 제로 ETL = AWS 관리형 CDC(코드리스). 폭넓은 마이그레이션은 DMS.
- 스토어 선택은 접근 패턴·데이터 형태·지연·운영/비용 모델로 결정.

## 📝 연습 문제

**문제 1.** 다음 중 행 기반 OLTP에 최적화되어 정규화된 트랜잭션·ACID 워크로드에 가장 적합한 스토어는?

A) Amazon Redshift  
B) Amazon Athena  
C) Amazon Aurora  
D) Amazon OpenSearch  

**정답: C**  
해설: Aurora(및 RDS)는 행 기반 관계형 OLTP로 정규화 스키마·트랜잭션·소량 행 처리에 최적입니다. Redshift는 컬럼형 OLAP, Athena는 S3 서버리스 분석, OpenSearch는 검색·로그 분석용입니다.

---

**문제 2.** Aurora의 데이터를 별도 ETL 파이프라인(DMS/Glue) 구축 없이 Redshift로 거의 실시간 복제해 분석하려면 무엇을 사용하는가?

A) 제로 ETL(Zero-ETL) 통합  
B) DynamoDB Streams  
C) Redshift Spectrum  
D) Athena 페더레이션 쿼리  

**정답: A**  
해설: 제로 ETL 통합은 AWS가 CDC 복제를 관리형으로 수행해 Aurora 데이터를 코드리스로 Redshift에 거의 실시간 반영합니다. Streams는 DynamoDB 변경 캡처, Spectrum은 S3 외부 테이블 쿼리, 페더레이션은 Athena의 이종 소스 조인입니다.

---

**문제 3.** 운영 Aurora 인스턴스에 무거운 BI 리포팅 쿼리가 트랜잭션 성능을 저하시킨다. 가장 먼저 고려할 1차 완화책은?

A) 모든 테이블을 비정규화한다  
B) 읽기 복제본(read replica)으로 분석 부하를 분리한다  
C) DynamoDB로 마이그레이션한다  
D) 정렬 키를 추가한다  

**정답: B**  
해설: 읽기 복제본으로 분석·리포팅 쿼리를 분리하면 쓰기 트랜잭션 성능 저하를 막을 수 있는 1차 패턴입니다. 대규모 집계가 지속되면 Redshift로 옮기는 것이 다음 단계입니다. 비정규화·DynamoDB 이전·정렬 키는 부적절하거나 관계없습니다.

---

**문제 4.** Oracle DB를 Aurora PostgreSQL로 마이그레이션하면서 마이그레이션 중 지속적 변경 복제(CDC)가 필요하다. 가장 적절한 서비스는?

A) 제로 ETL 통합  
B) AWS DMS(Database Migration Service)  
C) Athena CTAS  
D) Kinesis Data Firehose  

**정답: B**  
해설: DMS는 이종 DB 간 마이그레이션과 지속 복제(CDC)를 지원하며 Oracle→Aurora 같은 폭넓은 소스/타깃 조합을 다룹니다. 제로 ETL은 Aurora/RDS/DynamoDB→Redshift/OpenSearch에 한정되고, CTAS·Firehose는 마이그레이션 용도가 아닙니다.

---

**문제 5.** "사용자 ID 기반 한 자릿수 ms 조회, 예측 불가한 대규모 동시성, 서버리스 운영"이 핵심 요구일 때 가장 적합한 스토어는?

A) Amazon Redshift  
B) Amazon Aurora  
C) Amazon DynamoDB  
D) Amazon Athena  

**정답: C**  
해설: 키 기반 초저지연 조회, 대규모 동시성, 온디맨드 서버리스 운영은 DynamoDB의 핵심 강점입니다. Redshift/Athena는 분석 OLAP, Aurora는 관계형 트랜잭션 워크로드에 적합합니다.

---
