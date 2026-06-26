# Day 1 - Amazon Redshift: 분산/정렬 키와 워크로드 최적화

Amazon Redshift는 페타바이트급 컬럼형 MPP(Massively Parallel Processing) 데이터웨어하우스입니다. 오늘은 데이터 분산(distribution), 정렬(sort) 키, RA3/Spectrum 아키텍처, 그리고 WLM·동시성 스케일링을 통한 워크로드 최적화를 다룹니다.

## Redshift 아키텍처 개요

Redshift 클러스터는 **리더 노드(leader node)** 하나와 여러 **컴퓨트 노드(compute node)**로 구성됩니다. 리더 노드는 쿼리를 파싱·계획하고 컴퓨트 노드에 작업을 분배합니다. 각 컴퓨트 노드는 다시 여러 **슬라이스(slice)**로 나뉘며, 슬라이스가 병렬 처리의 최소 단위입니다. 데이터는 슬라이스에 분산 저장되고, 각 슬라이스가 자신이 가진 데이터를 병렬로 처리합니다.

> 💡 **관련 이론**: MPP는 데이터를 여러 노드/슬라이스에 나눠 동시에 처리하는 구조입니다. 데이터를 슬라이스에 얼마나 고르게 분배하느냐(분산 키)가 병렬 처리 효율을 좌우합니다.

## 분산 스타일 (Distribution Style)

테이블 행이 슬라이스에 어떻게 배치되는지 결정합니다. 세 가지 주요 방식이 있습니다.

```sql
-- KEY 분산: 지정 컬럼 해시로 같은 값은 같은 슬라이스에 배치
CREATE TABLE orders (
  order_id   BIGINT,
  customer_id BIGINT,
  amount     DECIMAL(12,2)
)
DISTSTYLE KEY
DISTKEY (customer_id);

-- ALL 분산: 테이블 전체를 모든 노드에 복제 (작은 차원 테이블용)
CREATE TABLE dim_region (region_id INT, region_name VARCHAR(50))
DISTSTYLE ALL;

-- EVEN 분산: 라운드로빈으로 균등 분배 (조인 키가 명확치 않을 때)
CREATE TABLE event_log (event_id BIGINT, payload VARCHAR(2000))
DISTSTYLE EVEN;
```

- **KEY**: 조인·집계에 자주 쓰는 컬럼을 지정. 조인하는 두 테이블이 같은 DISTKEY면 데이터가 같은 슬라이스에 있어 **네트워크 재분배(redistribution) 없이** 조인(co-located join)됩니다.
- **ALL**: 작은 차원 테이블을 모든 노드에 복제해 조인 시 재분배를 없앱니다. 큰 테이블에 쓰면 저장·쓰기 비용이 폭증하므로 금물.
- **EVEN**: 균등 분배하지만 조인 시 재분배가 발생할 수 있음. 명확한 조인 키가 없을 때 기본 선택.
- **AUTO**(기본): Redshift가 테이블 크기에 따라 ALL→KEY/EVEN으로 자동 전환.

> 💡 **관련 이론**: 데이터 스큐(skew) — KEY 분산에서 특정 값이 과도하게 많으면 한 슬라이스에 데이터가 몰려 병렬성이 깨집니다. 카디널리티가 높고 고르게 분포한 컬럼을 DISTKEY로 선택해야 합니다.

## 정렬 키 (Sort Key)

정렬 키는 디스크에 데이터를 정렬해 저장하여, 범위 필터 시 불필요한 블록을 건너뛰게(zone map 기반 블록 스킵) 합니다.

```sql
CREATE TABLE sales (
  sale_date  DATE,
  region     VARCHAR(20),
  amount     DECIMAL(12,2)
)
DISTKEY (region)
COMPOUND SORTKEY (sale_date, region);
```

- **COMPOUND**: 지정한 컬럼 순서대로 정렬. 첫 번째 컬럼 필터에 가장 효과적. 날짜 범위 쿼리에 강함.
- **INTERLEAVED**: 여러 컬럼에 동등한 가중치. 다양한 컬럼 조합으로 필터할 때 유리하지만 VACUUM REINDEX 비용이 큼.

각 블록의 최소/최대값을 기록한 **zone map** 덕분에, `WHERE sale_date BETWEEN ...` 같은 조건이 정렬 키와 일치하면 관련 없는 블록을 통째로 스킵합니다.

## RA3 노드와 Redshift Spectrum

- **RA3 노드**: 컴퓨트와 스토리지를 분리한 세대. 데이터는 **Redshift Managed Storage(RMS, S3 기반)**에 저장되고, 로컬 SSD는 캐시로 사용됩니다. 스토리지가 자동 확장되므로 컴퓨트만 필요에 맞춰 조정할 수 있습니다. (구형 DC2는 컴퓨트·스토리지 결합형.)
- **Redshift Spectrum**: 데이터를 Redshift에 적재하지 않고 **S3에 있는 외부 테이블을 직접 쿼리**합니다. Glue Data Catalog를 메타스토어로 사용하며, 스캔한 S3 데이터량 기준으로 과금됩니다.

```sql
-- Spectrum 외부 스키마 + S3 데이터 직접 조인
CREATE EXTERNAL SCHEMA spectrum_ext
FROM DATA CATALOG DATABASE 'datalake_db'
IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftSpectrumRole';

SELECT d.region, SUM(s.amount)
FROM spectrum_ext.raw_events s   -- S3의 외부 테이블
JOIN dim_region d ON s.region_id = d.region_id  -- Redshift 내부 테이블
GROUP BY d.region;
```

핫 데이터는 Redshift에, 콜드/대용량 이력은 S3 + Spectrum으로 두는 **레이크하우스** 패턴이 일반적입니다.

## WLM과 동시성 스케일링

**워크로드 관리(WLM)**는 쿼리를 큐로 분류해 메모리·동시성을 제어합니다.

- **자동 WLM(Auto WLM)**: Redshift가 메모리·동시성을 자동 조정. 대부분 권장.
- **수동 WLM**: 큐별로 메모리 비율·동시성 슬롯을 직접 지정.
- **쿼리 모니터링 규칙(QMR)**: 특정 임계(예: 실행 시간, 스캔 행 수) 초과 쿼리를 중단·로깅.
- **SQA(Short Query Acceleration)**: 짧은 쿼리를 전용 큐로 빠르게 처리.

```sql
-- 우선순위 지정 (Auto WLM에서 큐 우선순위 활용)
SET query_group TO 'critical_dashboards';
```

**동시성 스케일링(Concurrency Scaling)**은 읽기 쿼리가 몰릴 때 일시적으로 추가 클러스터를 자동 기동해 큐 대기를 없앱니다. 사용한 만큼 과금되며, 하루 일정 시간(클러스터 사용 시간당 적립)은 무료 크레딧으로 충당됩니다.

> 💡 **관련 이론**: 동시성 스케일링은 "스토리지·기본 클러스터는 그대로 두고 읽기 동시성만 탄력 확장"하는 모델입니다. 쓰기보다 동시 읽기 폭증(대시보드 새벽 갱신 등)에 효과적입니다.

## 기타 최적화

- **COPY 명령**: S3에서 병렬 적재. 여러 파일로 나눠야 슬라이스가 병렬로 읽음.
- **VACUUM / ANALYZE**: 삭제 공간 회수·정렬 재정리(VACUUM), 통계 갱신(ANALYZE). RA3·Auto는 상당 부분 자동화.
- **압축 인코딩**: `COPY ... COMPUPDATE`로 컬럼별 최적 인코딩 자동 선택.
- **머티리얼라이즈드 뷰**: 반복 집계를 사전 계산, 자동 새로고침 가능.

## 핵심 정리

- 분산 키는 병렬성·조인 효율을 좌우. KEY(co-located join), ALL(작은 차원), EVEN(기본).
- 정렬 키 + zone map으로 범위 필터 시 블록 스킵. 날짜는 보통 COMPOUND 첫 컬럼.
- RA3는 컴퓨트·스토리지 분리, Spectrum은 S3 외부 테이블 직접 쿼리.
- Auto WLM + 동시성 스케일링으로 읽기 동시성 폭증을 탄력 대응.

## 📝 연습 문제

**문제 1.** 두 큰 테이블을 customer_id로 자주 조인할 때, 네트워크 재분배 없이 조인(co-located join)되도록 하려면 어떤 설정이 가장 적절한가?

A) 두 테이블 모두 DISTSTYLE EVEN  
B) 두 테이블 모두 customer_id를 DISTKEY로 지정  
C) 두 테이블 모두 DISTSTYLE ALL  
D) 한 테이블만 customer_id를 SORTKEY로 지정  

**정답: B**  
해설: 같은 DISTKEY(customer_id)를 가지면 동일 키 값이 같은 슬라이스에 위치해 재분배 없이 조인됩니다. EVEN은 재분배가 발생하고, 큰 테이블에 ALL은 저장·쓰기 비용이 폭증하며, SORTKEY는 정렬용으로 분산과 무관합니다.

---

**문제 2.** 작은 차원 테이블을 큰 팩트 테이블과 조인할 때 재분배를 없애기 위한 분산 스타일로 가장 적절한 것은?

A) DISTSTYLE ALL  
B) DISTSTYLE EVEN  
C) DISTSTYLE KEY (팩트 키 기준)  
D) 분산 스타일 미지정  

**정답: A**  
해설: ALL 분산은 작은 테이블을 모든 노드에 복제해 조인 시 데이터 이동을 없앱니다. 큰 테이블에는 비용 문제로 부적합하지만 작은 차원 테이블에는 이상적입니다. EVEN/KEY는 재분배가 발생할 수 있습니다.

---

**문제 3.** Redshift에서 데이터를 클러스터에 적재하지 않고 S3에 저장된 외부 테이블을 직접 쿼리하며, 스캔한 데이터량 기준으로 과금되는 기능은?

A) 동시성 스케일링  
B) 머티리얼라이즈드 뷰  
C) Redshift Spectrum  
D) 자동 WLM  

**정답: C**  
해설: Redshift Spectrum은 Glue Data Catalog를 메타스토어로 사용해 S3의 외부 테이블을 직접 쿼리하고 스캔량으로 과금합니다. 동시성 스케일링은 읽기 동시성 확장, 머티리얼라이즈드 뷰는 사전 집계, WLM은 큐 관리입니다.

---

**문제 4.** 정렬 키와 zone map이 쿼리 성능을 높이는 원리로 가장 정확한 것은?

A) 데이터를 모든 노드에 복제해 조인을 없앤다  
B) 쿼리를 짧은 큐로 분류해 우선 처리한다  
C) 컬럼 인코딩을 자동으로 선택한다  
D) 블록의 최소/최대값을 기록해 범위 조건과 무관한 블록을 스킵한다  

**정답: D**  
해설: 정렬 키로 데이터를 정렬 저장하고 각 블록의 min/max를 zone map에 기록하면, 범위 필터 시 관련 없는 블록을 통째로 스킵해 스캔량을 줄입니다. A는 ALL 분산, B는 SQA, C는 압축 인코딩에 대한 설명입니다.

---

**문제 5.** 매일 새벽 대시보드 갱신으로 읽기 쿼리가 일시적으로 폭증해 큐 대기가 길어진다. 추가 비용을 최소화하면서 대기를 줄이는 가장 적절한 기능은?

A) DC2 노드로 전환  
B) 동시성 스케일링 활성화  
C) 모든 테이블을 DISTSTYLE ALL로 변경  
D) INTERLEAVED 정렬 키로 변경  

**정답: B**  
해설: 동시성 스케일링은 읽기 폭증 시 임시 클러스터를 자동 기동해 큐 대기를 없애고 사용한 만큼만 과금(일부 무료 크레딧)합니다. DC2 전환은 분리형 이점을 잃고, ALL/INTERLEAVED 변경은 동시성 문제 해결과 무관합니다.

---
