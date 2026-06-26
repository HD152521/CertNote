# Day 5 - Week 7 종합: 분석 스토어 복습

이번 주는 분석 데이터 스토어(Redshift, Athena, DynamoDB, RDS/Aurora)와 워크로드별 스토어 선택을 다뤘습니다. 오늘은 핵심을 통합 정리하고, 시험에서 자주 나오는 "워크로드→스토어 매핑"과 비교 포인트를 점검합니다.

## 한눈에 보는 분석 스토어 비교

```text
서비스         모델          과금          최적 워크로드
Redshift      컬럼형 MPP     프로비저닝/RA3  대량 집계·복잡 조인 DW
Redshift      외부 S3 쿼리   스캔량         적재 없이 S3 대용량 이력 조회
 Spectrum
Athena        서버리스 SQL   스캔량(TB)     S3 애드혹·간헐적 SQL
DynamoDB      NoSQL KV       처리량/온디맨드 키 기반 ms 조회·고동시성
RDS/Aurora    행 기반 OLTP   인스턴스       정규화 트랜잭션·ACID
```

> 💡 **관련 이론**: 컬럼형(Redshift/Parquet)은 "많은 행의 몇 컬럼 집계"에, 행 기반(RDS/Aurora)은 "한 행의 모든 컬럼 트랜잭션"에 강합니다. 워크로드의 읽기 패턴이 스토어 선택의 1순위 기준입니다.

## Redshift 복습 포인트

- **분산 키(DISTKEY)**: KEY(co-located join), ALL(작은 차원 복제), EVEN(기본). 스큐를 피하는 고른 분포 컬럼 선택.
- **정렬 키(SORTKEY)**: zone map으로 범위 필터 시 블록 스킵. COMPOUND(앞 컬럼 우선) vs INTERLEAVED(다축).
- **RA3**: 컴퓨트·스토리지 분리, RMS(S3) 자동 확장.
- **Spectrum**: S3 외부 테이블 직접 쿼리(스캔량 과금).
- **Auto WLM + 동시성 스케일링**: 읽기 동시성 폭증을 탄력 대응.

```sql
CREATE TABLE fact_sales (sale_date DATE, region VARCHAR(20), amount DECIMAL(12,2))
DISTKEY (region)
COMPOUND SORTKEY (sale_date);
```

## Athena 복습 포인트

- 서버리스 + **스캔량 과금** → 적게 스캔 = 싸고 빠름.
- **절감 3종**: 파티셔닝(+프로젝션), Parquet/압축, 필요 컬럼만 SELECT.
- **CTAS/INSERT INTO**: 포맷 변환·파티셔닝 경량 ETL.
- **페더레이션 쿼리**: RDS·DynamoDB 등 이종 소스를 ETL 없이 조인.
- **워크그룹**: 쿼리당 스캔 한도·비용·격리.

## DynamoDB 복습 포인트 (분석 관점)

- PK 해시로 파티션 결정 → 핫 파티션 회피(고른 키·write sharding).
- **GSI**(새 조회 축, 비동기) vs **LSI**(같은 PK 다른 SK, 생성 시 정의).
- 대량 분석은 **Streams/Kinesis/S3 export**로 분석 스토어로 이동(CQRS형 분리).

```text
DynamoDB(OLTP) → Streams/Export → S3 + Athena / Redshift(OLAP)
```

## RDS/Aurora & 스토어 선택 복습

- Aurora: 컴퓨트·스토리지 분리, 6사본/3AZ, 읽기 복제본으로 분석 부하 분리.
- **제로 ETL(Aurora/RDS/DynamoDB → Redshift)**: 관리형 CDC, 코드리스 거의 실시간 복제.
- **DMS**: 이종 DB 마이그레이션·CDC(인스턴스 운영).

> 💡 **관련 이론**: "운영(OLTP)과 분석(OLAP)은 서로 다른 엔진에 둔다"가 데이터 엔지니어링 대원칙입니다. 둘을 연결하는 수단이 ETL(Glue/DMS) 또는 제로 ETL이며, 최근 흐름은 관리형 제로 ETL로 파이프라인 운영 부담을 줄이는 방향입니다.

## 워크로드 → 스토어 의사결정 (시험 빈출)

```text
정규화·트랜잭션·ACID ................ RDS / Aurora
키 기반 ms 조회·고동시성·서버리스 ... DynamoDB
대량 집계·복잡 조인 정형 DW ......... Redshift
적재 없이 S3 대용량 이력 조인 ....... Redshift Spectrum
S3 애드혹·간헐적 서버리스 SQL ....... Athena
운영 DB→실시간 분석 연결 ............ 제로 ETL(→ Redshift)
이종 DB 마이그레이션·CDC ............ DMS
```

## 시험 대비 핵심 함정

- "작은 차원 테이블 조인 최적화" → **DISTSTYLE ALL** (큰 테이블에 ALL 금물).
- "Athena 비용 절감" → 스캔량을 줄이는 모든 것(파티션/Parquet/컬럼 프로젝션).
- "파티션 수만 개 병목" → **파티션 프로젝션**.
- "DynamoDB 대량 집계 분석" → 직접 X, **Streams/export로 OLAP 스토어**.
- "Aurora→Redshift 실시간, ETL 운영 부담 X" → **제로 ETL**.
- "Oracle→Aurora 마이그레이션 + CDC" → **DMS**.

## 핵심 정리

- 읽기 패턴(컬럼 집계 vs 행 트랜잭션 vs 키 조회 vs 검색)이 스토어 선택 1순위.
- Redshift는 분산/정렬 키·RA3·Spectrum·WLM으로 대량 분석 최적화.
- Athena는 스캔량 과금이라 파티션·포맷·컬럼 프로젝션이 곧 비용.
- DynamoDB 분석은 변경분을 분석 스토어로 내보내는 CQRS형 패턴.
- 운영↔분석 연결은 제로 ETL(관리형 CDC) 또는 DMS로.

## 📝 연습 문제

**문제 1.** "S3에 쌓인 데이터를 인프라 프로비저닝 없이 간헐적으로 표준 SQL로 분석"하려는 요구에 가장 적합한 서비스는?

A) Amazon Redshift (프로비저닝 클러스터)  
B) Amazon Athena  
C) Amazon Aurora  
D) Amazon DynamoDB  

**정답: B**  
해설: Athena는 서버리스로 S3 데이터를 SQL로 직접 쿼리하고 스캔량으로 과금되어, 간헐적·애드혹 분석에 인프라 운영 없이 적합합니다. 프로비저닝 Redshift는 상시 클러스터, Aurora는 OLTP, DynamoDB는 키 조회용입니다.

---

**문제 2.** Redshift에서 두 대형 팩트/차원 테이블을 동일 키로 자주 조인할 때 재분배를 피하는 최적 설정은?

A) 두 테이블 모두 동일 컬럼을 DISTKEY로 지정  
B) 두 테이블 모두 DISTSTYLE EVEN  
C) 두 테이블 모두 INTERLEAVED SORTKEY  
D) 한 테이블만 DISTSTYLE ALL (둘 다 대형)  

**정답: A**  
해설: 동일 컬럼을 DISTKEY로 지정하면 같은 키 값이 같은 슬라이스에 배치되어 재분배 없는 co-located join이 됩니다. EVEN은 재분배, INTERLEAVED는 정렬 다축이며 분산과 무관하고, 대형 테이블에 ALL은 비용이 과합니다.

---

**문제 3.** DynamoDB에 저장된 운영 데이터를 대규모로 집계·리포팅해야 한다. 권장 접근은?

A) DynamoDB에서 풀 스캔으로 직접 집계  
B) GSI를 수십 개 만들어 모든 집계를 인덱스로 처리  
C) Streams/S3 export로 S3·Redshift에 옮겨 Athena/Redshift로 분석  
D) LSI를 추가해 집계 전용 축을 만든다  

**정답: C**  
해설: DynamoDB는 대량 집계·애드혹 분석에 부적합하므로, Streams나 S3 export로 변경분을 분석 스토어(S3+Athena/Redshift)로 옮겨 분석하는 CQRS형 분리가 정석입니다. 풀 스캔·과도한 인덱스는 비용·성능 면에서 부적절합니다.

---

**문제 4.** Aurora의 운영 데이터를 ETL 파이프라인 운영 부담 없이 Redshift에서 거의 실시간으로 분석하려면?

A) AWS DMS로 매시간 배치 마이그레이션  
B) 제로 ETL(Zero-ETL) 통합  
C) Athena 페더레이션 쿼리  
D) Redshift Spectrum 외부 스키마  

**정답: B**  
해설: 제로 ETL 통합은 AWS 관리형 CDC로 Aurora 데이터를 코드리스·거의 실시간으로 Redshift에 복제합니다. DMS는 인스턴스 운영 부담이 있고, 페더레이션·Spectrum은 적재 없이 외부를 쿼리하는 방식으로 요구와 다릅니다.

---

**문제 5.** Athena에서 파티션이 수만 개로 늘어 카탈로그 조회와 MSCK REPAIR가 병목이 될 때 가장 적절한 해결책은?

A) 동시성 스케일링 활성화  
B) DISTSTYLE ALL 적용  
C) 파티션 프로젝션(Partition Projection)  
D) 모든 파일을 CSV로 변환  

**정답: C**  
해설: 파티션 프로젝션은 파티션을 카탈로그에 등록하지 않고 범위·포맷 규칙으로 계산해 대량 파티션 환경의 조회 병목을 제거합니다. 동시성 스케일링·DISTSTYLE은 Redshift 개념이고, CSV 전환은 스캔량을 늘려 역효과입니다.

---
