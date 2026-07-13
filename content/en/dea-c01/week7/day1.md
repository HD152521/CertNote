# Day 1 - Amazon Redshift: Distribution and Sort Keys and Workload Optimization

Amazon Redshift is a petabyte-scale columnar MPP (Massively Parallel Processing) data warehouse. Today we cover data distribution, sort keys, RA3/Spectrum architecture, and workload optimization through WLM and concurrency scaling.

## Redshift Architecture Overview

A Redshift cluster consists of one **leader node** and multiple **compute nodes**. The leader node parses queries, plans them, and distributes work to compute nodes. Each compute node further divides into multiple **slices**, which are the minimum parallelization unit. Data is distributed across slices, and each slice processes its data in parallel.

> 💡 **Related Theory**: MPP divides data across multiple nodes/slices for simultaneous processing. How evenly data is distributed to slices (distribution key) determines parallel processing efficiency.

## Distribution Styles

Determines how table rows are placed across slices. Three main methods:

```sql
-- KEY distribution: hash specified column, same values go to same slice
CREATE TABLE orders (
  order_id   BIGINT,
  customer_id BIGINT,
  amount     DECIMAL(12,2)
)
DISTSTYLE KEY
DISTKEY (customer_id);

-- ALL distribution: replicate entire table to all nodes (for small dimension tables)
CREATE TABLE dim_region (region_id INT, region_name VARCHAR(50))
DISTSTYLE ALL;

-- EVEN distribution: round-robin even distribution (when join key unclear)
CREATE TABLE event_log (event_id BIGINT, payload VARCHAR(2000))
DISTSTYLE EVEN;
```

- **KEY**: Specify column frequently used in joins/aggregations. When two joining tables share the same DISTKEY, data resides on the same slice for **co-located join without network redistribution**.
- **ALL**: Replicate small dimension table to all nodes to eliminate redistribution. Using on large tables causes storage and write cost explosion.
- **EVEN**: Distributes evenly but redistribution may occur on joins. Default when no clear join key exists.
- **AUTO** (default): Redshift auto-switches from ALL to KEY/EVEN based on table size.

> 💡 **Related Theory**: Data skew — when KEY distribution has excessive values for one key, data concentrates in one slice, breaking parallelism. Choose DISTKEY with high cardinality and even distribution.

## Sort Key

Sort keys order data on disk to skip unnecessary blocks during range filters (zone map based block skipping).

```sql
CREATE TABLE sales (
  sale_date  DATE,
  region     VARCHAR(20),
  amount     DECIMAL(12,2)
)
DISTKEY (region)
COMPOUND SORTKEY (sale_date, region);
```

- **COMPOUND**: Columns sorted in specified order. Most effective for first column filter. Strong for date range queries.
- **INTERLEAVED**: Equal weight on multiple columns. Useful for filtering by various column combinations, but VACUUM REINDEX cost is high.

A **zone map** recording min/max values per block lets conditions like `WHERE sale_date BETWEEN ...` matching the sort key skip entire blocks.

## RA3 Nodes and Redshift Spectrum

- **RA3 Nodes**: Latest generation separating compute and storage. Data is stored in **Redshift Managed Storage (RMS, S3-based)**, local SSD used as cache. Storage auto-scales, so you adjust only compute. (Older DC2 combines compute and storage.)
- **Redshift Spectrum**: Query **external tables directly on S3** without loading into Redshift. Uses Glue Data Catalog as metastore; billed on scanned S3 data volume.

```sql
-- Spectrum external schema + S3 data direct join
CREATE EXTERNAL SCHEMA spectrum_ext
FROM DATA CATALOG DATABASE 'datalake_db'
IAM_ROLE 'arn:aws:iam::123456789012:role/RedshiftSpectrumRole';

SELECT d.region, SUM(s.amount)
FROM spectrum_ext.raw_events s   -- External table on S3
JOIN dim_region d ON s.region_id = d.region_id  -- Internal Redshift table
GROUP BY d.region;
```

Common pattern: hot data in Redshift, cold/historical bulk on S3 + Spectrum (**lakehouse** pattern).

## WLM and Concurrency Scaling

**Workload Management (WLM)** classifies queries into queues to control memory and concurrency.

- **Auto WLM**: Redshift automatically adjusts memory and concurrency. Most recommended.
- **Manual WLM**: Specify memory ratio and concurrency slots per queue.
- **Query Monitoring Rules (QMR)**: Stop and log queries exceeding thresholds (e.g., runtime, rows scanned).
- **SQA (Short Query Acceleration)**: Process short queries in dedicated queue fast-track.

```sql
-- Set priority (leverage queue priority in Auto WLM)
SET query_group TO 'critical_dashboards';
```

**Concurrency Scaling** automatically launches temporary clusters when read queries spike, eliminating queue wait. Billed per-cluster-hour, with some free credits based on cluster usage.

> 💡 **Related Theory**: Concurrency scaling is "keep storage and base cluster, elastically expand read concurrency only." Effective for read spikes (e.g., dashboard refreshes at dawn) over write surges.

## Other Optimizations

- **COPY Command**: Parallel load from S3. Splitting into multiple files lets slices read in parallel.
- **VACUUM / ANALYZE**: Reclaim deleted space and re-sort (VACUUM), update statistics (ANALYZE). RA3/Auto automate much.
- **Compression encoding**: `COPY ... COMPUPDATE` auto-selects optimal per-column encoding.
- **Materialized views**: Pre-compute repeated aggregations, auto-refresh possible.

## Key Takeaways

- Distribution key determines parallelism and join efficiency. KEY (co-located join), ALL (small dimensions), EVEN (default).
- Sort key + zone map skip blocks on range filter. Date usually first COMPOUND column.
- RA3 separates compute/storage, Spectrum queries S3 external tables.
- Auto WLM + concurrency scaling elastically handle read spikes.

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
