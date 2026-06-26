# Day 4 - S3 스토리지 관리와 비용 최적화

데이터레이크는 시간이 지날수록 용량이 커지고, 데이터의 접근 빈도는 시간에 따라 변합니다. 오늘은 S3 스토리지 클래스, 수명주기 정책, Intelligent-Tiering을 활용한 비용 최적화를 다룹니다.

## S3 스토리지 클래스

S3는 접근 패턴과 비용에 따라 여러 스토리지 클래스를 제공합니다.

| 클래스 | 용도 | 특징 |
|--------|------|------|
| S3 Standard | 자주 접근하는 핫 데이터 | 가장 높은 스토리지 비용, 검색 무료 |
| S3 Standard-IA | 가끔 접근(월 1회 미만) | 저장 저렴, 검색 비용 발생, 최소 30일 보관 |
| S3 One Zone-IA | 재생성 가능한 비핵심 데이터 | 단일 AZ, IA보다 저렴, 가용성 낮음 |
| S3 Glacier Instant Retrieval | 분기 1회 접근, 즉시 검색 필요 | IA보다 저렴, 밀리초 검색 |
| S3 Glacier Flexible Retrieval | 아카이브, 분~시간 검색 허용 | 매우 저렴, 검색 지연 |
| S3 Glacier Deep Archive | 장기 규제 보관 | 최저 비용, 12시간급 검색 |
| S3 Intelligent-Tiering | 접근 패턴이 불규칙/예측 불가 | 자동 계층 이동, 모니터링 요금 |

> 💡 **관련 이론**: IA(Infrequent Access) 계열은 저장 단가는 낮지만 데이터를 읽을 때 GB당 검색 요금이 붙습니다. 자주 읽는 데이터를 IA에 두면 오히려 비용이 더 들 수 있으므로, 접근 빈도에 맞춰 선택해야 합니다.

## 데이터레이크 존별 스토리지 매핑

- **Raw 존**: 재처리용으로 드물게 접근 → Standard-IA 또는 Glacier IR.
- **Clean 존**: ETL이 정기적으로 읽음 → Standard 또는 Intelligent-Tiering.
- **Curated 존**: BI/대시보드가 자주 읽음 → Standard.
- **장기 규제 보관(원본 로그 등)**: Glacier Deep Archive.

## 수명주기(Lifecycle) 정책

수명주기 규칙은 객체 생성 후 경과 시간에 따라 **전환(transition)**하거나 **만료(expiration)**시킵니다. 데이터의 가치가 시간에 따라 떨어지는 데이터레이크에 필수입니다.

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

주의사항:
- 전환에도 **전환 요청 비용**이 발생하므로, 객체 수가 매우 많으면(작은 파일 폭증 시) 전환 비용이 절감액을 넘을 수 있음.
- IA/Glacier에는 **최소 보관 기간**(IA 30일, Glacier 90일, Deep Archive 180일)이 있어 조기 삭제 시 위약 요금 발생.
- **불완전 멀티파트 업로드 정리** 규칙은 거의 모든 버킷에 권장(숨은 비용 제거).

> 💡 **관련 이론**: 만료된 객체의 버전(버전 관리 활성 버킷)은 별도로 `NoncurrentVersionExpiration` 규칙으로 정리해야 합니다. 그렇지 않으면 이전 버전이 무한히 쌓여 비용이 증가합니다.

## S3 Intelligent-Tiering

접근 패턴을 예측하기 어려운 데이터에는 **Intelligent-Tiering**이 적합합니다. S3가 객체별 접근을 모니터링해 자동으로 계층을 이동시킵니다.

- Frequent Access → 30일 미접근 시 Infrequent Access → 90일 미접근 시 Archive Instant Access 계층으로 자동 이동.
- 선택적으로 Deep Archive 비동기 계층까지 활성화 가능.
- 검색 요금이 없고(아카이브 즉시 계층 제외), 객체당 소액의 **모니터링·자동화 요금**만 부과.

```bash
# 버킷 수준 Intelligent-Tiering 아카이브 계층 구성
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

> 💡 **관련 이론**: Intelligent-Tiering은 접근 패턴이 불규칙하거나 알 수 없을 때 최적입니다. 접근 패턴이 명확히 예측되면(예: 30일 후 거의 안 봄) 수명주기 전환이 모니터링 요금이 없어 더 저렴할 수 있습니다.

## 비용 가시성과 추가 절감 기법

- **S3 Storage Lens**: 계정·버킷·프리픽스 수준 사용량과 절감 기회(미사용 IA, 불완전 업로드 등) 대시보드.
- **S3 Inventory**: 객체 메타데이터 목록(크기·스토리지 클래스·암호화)을 Parquet/CSV로 정기 출력 → 분석으로 최적화 대상 식별.
- **압축·컬럼 포맷**: Parquet + ZSTD/Snappy로 저장량 자체를 축소(가장 효과적인 절감).
- **작은 파일 병합(compaction)**: 요청 수·전환 비용·메타데이터 오버헤드 절감.
- **요청 비용 관리**: GET/PUT 요청 자체에 비용이 있으므로 큰 파일·캐싱으로 요청 수 절감.

## 핵심 정리

- 접근 빈도에 맞춰 스토리지 클래스 선택, IA/Glacier는 검색 비용과 최소 보관 기간 고려.
- 수명주기 정책으로 전환·만료 자동화, 불완전 멀티파트와 비현행 버전 정리 필수.
- 접근 패턴이 불규칙하면 Intelligent-Tiering, 예측 가능하면 수명주기 전환이 더 저렴할 수 있음.
- Storage Lens/Inventory로 가시성 확보, 압축·compaction이 근본 절감.

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
