# Day 4 - S3 Storage Management and Cost Optimization

Data lakes grow over time, and data access frequency changes. Today we cover S3 storage classes, lifecycle policies, and cost optimization using Intelligent-Tiering.

## S3 Storage Classes

S3 offers multiple storage classes based on access patterns and costs.

| Class | Purpose | Characteristics |
|-------|---------|-----------------|
| S3 Standard | Frequently accessed hot data | Highest storage cost, no retrieval fee |
| S3 Standard-IA | Infrequent access (< once/month) | Low storage, retrieval cost, minimum 30 days |
| S3 One Zone-IA | Reproducible non-critical data | Single AZ, cheaper than IA, lower availability |
| S3 Glacier Instant Retrieval | Quarterly access, instant retrieval needed | Cheaper than IA, millisecond retrieval |
| S3 Glacier Flexible Retrieval | Archive, minutes-to-hours retrieval acceptable | Very cheap, retrieval delay |
| S3 Glacier Deep Archive | Long-term regulatory retention | Lowest cost, ~12-hour retrieval |
| S3 Intelligent-Tiering | Unpredictable/irregular access patterns | Auto tier movement, monitoring fee |

> 💡 **Related Theory**: IA (Infrequent Access) classes have low storage unit price but incur per-GB retrieval fees when data is read. Storing frequently-read data in IA can cost more than Standard, so choose based on access frequency.

## Data Lake Zone-to-Storage Mapping

- **Raw Zone**: Rarely accessed for reprocessing → Standard-IA or Glacier IR.
- **Clean Zone**: ETL reads periodically → Standard or Intelligent-Tiering.
- **Curated Zone**: BI/dashboards read frequently → Standard.
- **Long-term regulatory retention (original logs, etc.)**: Glacier Deep Archive.

## Lifecycle Policies

Lifecycle rules **transition** objects to different classes or **expire** them based on time since creation. Essential for data lakes where data value diminishes over time.

```json
{
  "Rules": [
    {
      "ID": "raw-tiering",
      "Filter": { "Prefix": "raw/" },
      "Status": "Enabled",
      "Transitions": [
        { "Days": 30,  "StorageClass": "STANDARD_IA" },
        { "Days": 90,  "StorageClass": "GLACIER" },
        { "Days": 365, "StorageClass": "DEEP_ARCHIVE" }
      ],
      "Expiration": { "Days": 2555 }
    },
    {
      "ID": "cleanup-incomplete-uploads",
      "Filter": {},
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket acme-datalake-raw-prod \
  --lifecycle-configuration file://lifecycle.json
```

Important considerations:
- Transitions incur **transition request costs**. With very many small objects, transition costs can exceed savings.
- IA/Glacier have **minimum retention periods** (IA 30 days, Glacier 90 days, Deep Archive 180 days); early deletion incurs penalties.
- **Abort incomplete multipart uploads** rule is recommended for nearly all buckets (eliminates hidden costs).

> 💡 **Related Theory**: Expired object versions (in versioned buckets) require separate `NoncurrentVersionExpiration` rules for cleanup. Otherwise, old versions accumulate indefinitely, increasing costs.

## S3 Intelligent-Tiering

**Intelligent-Tiering** is ideal for data with unpredictable access patterns. S3 monitors per-object access and automatically moves between tiers.

- Frequent Access → Infrequent Access (after 30 days without access) → Archive Instant Access (after 90 days without access).
- Optionally enable Deep Archive async tier.
- No retrieval fees (except Archive Instant tier), only small per-object **monitoring and automation fees**.

```bash
# Configure Intelligent-Tiering archive tiers at bucket level
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket acme-datalake-clean-prod \
  --id archive-config \
  --intelligent-tiering-configuration '{
    "Id": "archive-config",
    "Status": "Enabled",
    "Tierings": [
      {"Days": 90, "AccessTier": "ARCHIVE_ACCESS"},
      {"Days": 180, "AccessTier": "DEEP_ARCHIVE_ACCESS"}
    ]
  }'
```

> 💡 **Related Theory**: Intelligent-Tiering is optimal for irregular or unpredictable access patterns. If patterns are clearly predictable (e.g., never accessed after 30 days), lifecycle transitions may be cheaper since they have no monitoring fees.

## Cost Visibility and Additional Savings Techniques

- **S3 Storage Lens**: Account, bucket, and prefix-level usage and savings opportunities dashboard (unused IA, incomplete uploads, etc.).
- **S3 Inventory**: Periodically output object metadata lists (size, storage class, encryption) as Parquet/CSV → identify optimization targets through analysis.
- **Compression and columnar format**: Parquet + ZSTD/Snappy reduces storage volume itself (most effective savings).
- **Compaction (merging small files)**: Reduces request counts, transition costs, and metadata overhead.
- **Request cost management**: GET/PUT requests themselves have costs; reduce request volume via large files and caching.

## Key Takeaways

- Choose storage class based on access frequency; consider IA/Glacier retrieval costs and minimum retention periods.
- Automate transitions and expirations via lifecycle policies; clean up incomplete multiparts and noncurrent versions.
- For irregular patterns, Intelligent-Tiering; for predictable patterns, lifecycle transitions may be cheaper.
- Use Storage Lens/Inventory for visibility; compression and compaction are foundational savings.

## 📝 연습 문제

**문제 1.** 접근 패턴을 예측하기 어렵고 검색 요금 없이 객체별로 자동으로 계층을 이동시키고 싶을 때 가장 적합한 S3 스토리지 클래스는?

A) S3 Standard  
B) S3 Glacier Deep Archive  
C) S3 Intelligent-Tiering  
D) S3 One Zone-IA  

**정답: C**  
해설: Intelligent-Tiering은 객체별 접근을 모니터링해 자동으로 계층을 이동시키며 검색 요금이 없어 접근 패턴이 불규칙·예측 불가일 때 최적입니다. 나머지는 접근 패턴이 명확하거나 고정 용도에 적합합니다.

---

**문제 2.** 자주 읽히는 Curated 존 데이터를 비용 절감 목적으로 Standard-IA에 두었더니 오히려 비용이 증가했다. 가장 큰 원인은?

A) IA는 내구성이 낮다  
B) IA는 GB당 검색(retrieval) 요금이 발생한다  
C) IA는 암호화를 지원하지 않는다  
D) IA는 파티션 프루닝을 막는다  

**정답: B**  
해설: IA 계열은 저장 단가는 낮지만 데이터를 읽을 때 GB당 검색 요금이 부과됩니다. 자주 읽는 데이터를 IA에 두면 검색 비용이 누적되어 Standard보다 비쌀 수 있습니다. 내구성·암호화·프루닝과는 무관합니다.

---

**문제 3.** S3 수명주기 정책에서 거의 모든 버킷에 권장되며 숨은 비용을 제거하는 규칙은?

A) 불완전 멀티파트 업로드 정리(AbortIncompleteMultipartUpload)  
B) 모든 객체를 Standard로 즉시 전환  
C) 버킷 버전 관리 비활성화  
D) 객체를 1일 후 즉시 만료  

**정답: A**  
해설: 실패한 멀티파트 업로드의 파트는 보이지 않게 스토리지 비용을 발생시키므로, AbortIncompleteMultipartUpload 규칙으로 정리하는 것이 거의 모든 버킷에 권장됩니다. 나머지는 일반 권장 사항이 아니거나 데이터 손실 위험이 있습니다.

---

**문제 4.** 접근 패턴이 "30일 후 거의 보지 않음"으로 명확히 예측될 때, Intelligent-Tiering 대비 더 저렴할 수 있는 이유로 옳은 것은?

A) 수명주기 전환은 모니터링/자동화 요금이 없기 때문  
B) Intelligent-Tiering은 내구성이 낮기 때문  
C) 수명주기는 검색이 항상 무료이기 때문  
D) Intelligent-Tiering은 암호화 비용이 추가되기 때문  

**정답: A**  
해설: Intelligent-Tiering은 객체당 모니터링·자동화 요금이 부과됩니다. 접근 패턴이 명확하면 수명주기 전환 규칙으로 직접 IA/Glacier로 보내는 편이 모니터링 요금이 없어 더 저렴할 수 있습니다. 나머지는 사실과 다릅니다.

---

**문제 5.** 계정·버킷·프리픽스 수준에서 스토리지 사용량과 절감 기회(미사용 IA, 불완전 업로드 등)를 시각화해 비용 최적화 대상을 찾는 S3 기능은?

A) S3 Transfer Acceleration  
B) S3 Storage Lens  
C) S3 Object Lock  
D) S3 Replication  

**정답: B**  
해설: S3 Storage Lens는 조직·버킷·프리픽스 수준 사용량과 절감 권고를 제공하는 가시성 대시보드입니다. Transfer Acceleration은 전송 속도, Object Lock은 변경 방지, Replication은 복제 기능으로 비용 가시성과 무관합니다.

---
