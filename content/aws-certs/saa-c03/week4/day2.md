# Day 2 - S3 스토리지 클래스와 수명 주기: 데이터 온도 관리의 경제학

데이터에는 온도가 있다. 방금 업로드된 로그 파일은 뜨겁다(Hot). 30일이 지난 로그는 가끔 분석에 쓰인다(Warm). 1년 이상 된 로그는 규제 감사 때나 볼까 말까 한다(Cold). 그리고 5년이 지난 로그는 법적 의무로만 보관하는 Ice 단계다.

S3의 8가지 스토리지 클래스는 이 온도 스펙트럼에 대응하는 비용·가용성·검색 시간의 트레이드오프 설계다. 잘못된 클래스 선택은 조용히 비용을 먹는다. 뜨거운 데이터를 Glacier에 넣으면 검색 비용이 과도하게 발생하고, 차가운 데이터를 Standard에 두면 저장 비용을 낭비한다. 이 글에서는 각 클래스의 내부 설계 원리, 비용 구조의 함정, 수명 주기 정책의 최적 설계 패턴을 다룬다.

## 스토리지 클래스의 설계 원리: 무엇을 교환하는가

S3 스토리지 클래스의 가격 구조는 세 가지 비용 차원으로 이루어진다.

**저장 비용(Storage cost)**: GB당 월 비용. Cold 클래스일수록 낮다.

**요청 비용(Request cost)**: API 호출당 비용. Standard보다 Glacier 계열이 GET 요청 비용이 높다.

**검색 비용(Retrieval cost)**: 데이터를 꺼낼 때 드는 추가 비용. Glacier 계열에서 발생하며, 빠를수록 비싸다.

여기에 **최소 보관 기간(Minimum storage duration)**과 **최소 객체 크기(Minimum billable object size)**가 추가 함정이다.

```
[ S3 비용 구조 비교 (ap-northeast-2, 2025년 기준 참고) ]

클래스               | 저장($/GB/월) | GET 요청     | 검색비 | 최소 기간
Standard             | ~$0.025      | $0.0004/1K   | 없음   | 없음
Intelligent-Tiering  | 모니터링비+  | Tier별 다름  | 없음   | 없음
Standard-IA          | ~$0.0138     | $0.001/1K    | $0.01/GB | 30일
One Zone-IA          | ~$0.011      | $0.001/1K    | $0.01/GB | 30일
Glacier Instant      | ~$0.005      | $0.01/1K     | $0.03/GB | 90일
Glacier Flexible     | ~$0.004      | $0.0004/1K   | $0.01/GB(Std) | 90일
Glacier Deep Archive | ~$0.00099    | $0.0004/1K   | $0.02/GB(Std) | 180일
```

핵심은 **저장 비용을 아끼려면 검색 비용을 더 내야 한다**는 트레이드오프다. 비용 최적화의 목표는 전체 TCO(Total Cost of Ownership = 저장 + 요청 + 검색 + 전송)를 최소화하는 것이지, 저장 단가만 낮추는 게 아니다.

## 각 클래스의 설계 의도와 내부 원리

### Standard: 기본값의 의미

S3 Standard는 3개 이상의 AZ에 데이터를 복제하고, 임의의 두 AZ가 동시에 손실되어도 데이터를 복구할 수 있는 내구성을 제공한다. 11개의 9(99.999999999%)라는 내구성은 연간 0.000000001%의 손실 확률을 의미한다. 10만 개의 1MB 파일을 1,000만 년 보관해도 한 개 파일을 잃을 확률이다.

Standard는 검색 시간이 ms 단위이고, 추가 검색 비용이 없다. 액세스 패턴에 제약이 없다. 초당 수천 번 읽어도, 한 달에 한 번 읽어도 같은 저장 단가다. 모든 워크로드의 시작점이다.

> 💡 **관련 이론**: 11개의 9 내구성은 **Erasure Coding** 기술로 달성된다. S3는 객체를 다수의 청크로 분할하고, 추가 패리티 청크를 생성해 여러 서버·디바이스·시설에 분산한다. Reed-Solomon 코드의 원리로, k개의 데이터 청크와 m개의 패리티 청크에서 m개의 청크가 손실되어도 원래 k개를 복구할 수 있다. 이것이 단순 복제(3개 복사본)보다 저장 효율이 높으면서도 더 높은 내구성을 제공하는 이유다.

### Standard-IA: "Infrequent Access"의 비용 구조

Standard-IA는 "자주 접근하지 않지만, 접근할 때는 즉시 필요한" 데이터를 위한 클래스다. 저장 단가가 Standard의 약 55%지만, 검색 시 GB당 비용이 추가된다.

최소 보관 기간이 30일이라는 점이 핵심 함정이다. 객체를 1일만 보관하고 삭제해도 30일치 저장 비용이 청구된다. 따라서 Standard-IA는 **실제로 30일 이상 보관하고, 월 2-3회 미만 접근하는** 데이터에만 비용 효율적이다. 접근 빈도가 월 1회 이상이면 Standard가 더 저렴할 수 있다.

최소 객체 크기도 128KB다. 1KB 파일을 Standard-IA에 저장하면 128KB로 청구된다. 수백만 개의 소형 파일은 Standard나 Intelligent-Tiering이 낫다.

### One Zone-IA: 단일 AZ의 의미

One Zone-IA는 Standard-IA의 저렴한 버전이지만, **데이터가 단일 AZ에만 저장**된다. 해당 AZ 장애 시 데이터를 잃을 수 있다.

"재생성 가능한 데이터"에만 쓴다. CloudFront 캐시 무효화 후 EC2에서 생성하는 썸네일, 다른 소스에서 다시 계산할 수 있는 집계 결과, On-Demand로 재생성 가능한 보고서 등이 해당한다. 원본 데이터나 한 번 잃으면 복구 불가한 데이터에는 절대 쓰면 안 된다.

> ⚠️ **함정**: "비용을 줄이기 위해 One Zone-IA로 이동하자"는 제안에서 "재생성 가능 여부"를 확인해야 한다. 시험에서 "AZ 장애 시 데이터 손실 가능성이 있어도 괜찮다"는 명시적 조건 없이 One Zone-IA를 선택하면 오답이다.

### Intelligent-Tiering: ML 기반 자동 최적화

Intelligent-Tiering은 객체의 접근 패턴을 모니터링하고, 자동으로 가장 비용 효율적인 티어로 이동시킨다.

```
[ Intelligent-Tiering 티어 구조 ]

Frequent Access     ← 기본 (자동)
    ↓ 30일 미접근
Infrequent Access   ← 자동 이동 (검색 비용 없음!)
    ↓ 90일 추가 미접근
Archive Instant Access  ← 자동 (ms 검색, 검색비 있음)
    ↓ 180일 추가 미접근
Archive Access      ← 선택 사항 (3-5시간 검색, 검색비 있음)
    ↓ 옵션
Deep Archive Access ← 선택 사항 (12시간 검색, 검색비 있음)
```

핵심 장점: Frequent ↔ Infrequent Access 자동 이동에는 **검색 비용이 없다**. 객체 모니터링 비용(객체당 월 약 $0.0025/1,000 objects)만 추가로 낸다. 128KB 미만의 작은 객체는 항상 Frequent Access 티어에 머문다(모니터링 비용만 내고 IA로 이동하지 않음 → 작은 파일 많으면 손해).

Intelligent-Tiering이 가장 유리한 케이스는 **접근 패턴이 예측 불가하거나, 팀이 적극적으로 수명 주기를 관리할 의지가 없는 경우**다. 수동 Lifecycle 정책을 완벽하게 설계하고 관리할 수 있다면 수동 Lifecycle이 더 최적화될 수 있다.

> 🔍 **더 깊이**: Intelligent-Tiering의 "30일 미접근 → Infrequent Access 이동"은 단순 타이머가 아니다. S3는 객체별 마지막 접근 시간을 추적한다. 접근이 있으면 즉시 Frequent Access로 되돌린다. 이 되돌림에 추가 비용이 없다. 반면 직접 Lifecycle으로 Standard → Standard-IA로 이동한 객체는 다시 Standard로 Lifecycle 이동하는 것이 불가능하다(수동 CopyObject로만 가능). Intelligent-Tiering은 이 되돌림을 자동으로 처리한다는 장점이 있다.

### Glacier 3종: 아카이브 스토리지의 스펙트럼

Glacier 시리즈는 "거의 안 보지만 오래 보관해야 하는" 데이터를 위한 아카이브 스토리지다. 세 가지 검색 속도로 비용을 조절한다.

**Glacier Instant Retrieval**: 저장 단가가 Standard-IA보다 낮으면서 **검색 시간은 ms 단위**다. 분기에 한 번 정도 접근하는 의료 영상이나 뉴스 아카이브처럼, 접근 빈도는 낮지만 접근 시 즉시 필요한 데이터에 적합하다. 최소 보관 기간 90일.

**Glacier Flexible Retrieval**: 세 가지 검색 옵션이 있다.
- Expedited(긴급): 1-5분, 가장 비쌈
- Standard(표준): 3-5시간, 중간
- Bulk(대량): 5-12시간, 가장 저렴

백업, 재해 복구용 데이터처럼 미리 계획해서 검색할 수 있는 데이터에 적합하다.

**Glacier Deep Archive**: S3에서 가장 저렴한 클래스. 저장 단가가 Standard의 약 4%다. Standard 검색(기본) 12시간, Bulk 검색 48시간. 최소 보관 기간 180일. 7-10년 규제 보관이 필요한 금융·의료 데이터에 쓴다.

> 📚 **사례**: Netflix는 원본 마스터 비디오 파일(최고 품질, 4K HDR, 수 TB)을 Glacier Deep Archive에 보관한다. 이 파일들은 새 포맷이 등장하거나 콘텐츠 재마스터링이 필요할 때만 꺼내므로, 수년에 한 번 접근한다. Standard에 보관 대비 비용이 약 25분의 1 수준이다. 유사하게, 할리우드 스튜디오들이 디지털 마스터 보관소로 S3 Glacier Deep Archive를 사용한다.

> 💡 **관련 이론**: Glacier의 검색 지연은 의도된 설계다. 빠른 검색을 위해서는 데이터가 즉시 접근 가능한 스토리지에 있어야 하는데, 이는 비용이 높다. Glacier의 데이터는 비용이 낮은 고밀도 스토리지(HDD)에 저장되고, 검색 요청이 오면 테이프나 HDD에서 데이터를 읽어 임시 고속 스토리지로 복사한 후 접근을 허용한다. Expedited 검색이 Standard보다 비싼 이유는 즉각적인 고속 스토리지 할당이 필요하기 때문이다.

## 수명 주기 정책: 자동화의 설계

수명 주기 정책(Lifecycle Configuration)은 S3 객체를 시간 경과에 따라 자동으로 다른 클래스로 이동하거나 삭제하는 규칙이다.

### 전환 규칙(Transition)의 최소 일수 제약

```
[ 유효한 Lifecycle 전환 경로 ]

Standard → Standard-IA    (최소 30일)
Standard → One Zone-IA    (최소 30일)
Standard → Glacier Instant (최소 90일)
Standard → Glacier Flexible (최소 90일)
Standard → Deep Archive   (최소 90일)

Standard-IA → Glacier Instant (추가 30일 이상)
Standard-IA → Glacier Flexible (추가 30일 이상)
Standard-IA → Deep Archive   (추가 30일 이상)

Intelligent-Tiering → Glacier Flexible (90일 이상)
Intelligent-Tiering → Deep Archive   (90일 이상)
```

반대 방향(예: Glacier → Standard) 이동은 Lifecycle로 불가능하다. 검색 후 CopyObject로 수동 이동해야 한다.

### 실용적인 Lifecycle 패턴

**패턴 1: 로그 파일 (수명 1년, 분석은 첫 30일 집중)**
```json
{
  "Rules": [{
    "ID": "log-lifecycle",
    "Status": "Enabled",
    "Filter": {"Prefix": "logs/"},
    "Transitions": [
      {"Days": 30, "StorageClass": "STANDARD_IA"},
      {"Days": 90, "StorageClass": "GLACIER"},
      {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
    ],
    "Expiration": {"Days": 2555}
  }]
}
```

**패턴 2: 버전 관리 버킷의 비용 제어**
```json
{
  "Rules": [{
    "ID": "version-cleanup",
    "Status": "Enabled",
    "Filter": {},
    "NoncurrentVersionTransitions": [
      {"NoncurrentDays": 30, "StorageClass": "STANDARD_IA"},
      {"NoncurrentDays": 90, "StorageClass": "GLACIER"}
    ],
    "NoncurrentVersionExpiration": {"NoncurrentDays": 365},
    "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
  }]
}
```

**패턴 3: 미완료 멀티파트 업로드 정리 (필수 설정)**
```json
{
  "Rules": [{
    "ID": "cleanup-incomplete-multipart",
    "Status": "Enabled",
    "Filter": {},
    "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
  }]
}
```

> ⚠️ **함정 2종**: 첫째, Lifecycle 전환을 설정해도 **객체가 최소 보관 기간보다 일찍 삭제되면 남은 기간의 비용을 냄**. 3일 된 파일을 Standard-IA로 이동하면 이론상 불가(30일 최소)지만, Lifecycle으로는 기술적으로 가능하고 그 경우 30일치가 청구된다. 둘째, Lifecycle **전환은 자정(UTC)에 실행**된다. 설정 후 즉시 이동하지 않는다.

## S3 Storage Lens: 조직 전체의 스토리지 가시성

Storage Lens는 다중 계정 AWS Organizations 환경에서 S3 사용 패턴을 조직 단위로 분석하는 도구다. 버킷별 비용, 데이터 보호 수준, 접근 패턴을 한눈에 보여준다.

자동화된 권장 사항이 핵심이다:
- "이 버킷의 80% 데이터가 90일 이상 미접근이므로 Glacier 전환 시 월 $X 절감 가능"
- "이 버킷에 버전 관리가 없어 보호 수준이 낮음"
- "미완료 멀티파트 업로드가 Y GB로 비용 낭비 중"

## 다른 클라우드와의 비교

| 클래스 유형 | AWS S3 | GCP Cloud Storage | Azure Blob Storage |
|------------|--------|-------------------|-------------------|
| Hot | Standard | Standard | Hot |
| Warm | Standard-IA / One Zone-IA | Nearline (30일 최소) | Cool (30일 최소) |
| Cold | Glacier Instant | Coldline (90일 최소) | Cold (90일 최소) |
| Archive | Glacier Deep Archive | Archive (365일 최소) | Archive (180일 최소) |
| Auto-tiering | Intelligent-Tiering | Autoclass | 없음(직접 설정) |

GCP Autoclass는 Intelligent-Tiering과 유사하게 접근 패턴 기반 자동 티어링을 지원한다. Azure는 아직 자동 티어링이 없어 직접 Lifecycle Policy를 관리해야 한다.

주목할 차이: GCP Archive의 최소 보관 기간은 365일이지만 AWS Glacier Deep Archive는 180일이다. 장기 보관 규정 설계 시 이 차이가 의미 있다.

## CLI로 이해 굳히기

```bash
# 버킷의 현재 수명 주기 규칙 조회
aws s3api get-bucket-lifecycle-configuration --bucket my-bucket

# 복합 Lifecycle 규칙 적용
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-bucket \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "logs-tiering",
        "Status": "Enabled",
        "Filter": {"Prefix": "logs/"},
        "Transitions": [
          {"Days": 30, "StorageClass": "STANDARD_IA"},
          {"Days": 90, "StorageClass": "GLACIER"},
          {"Days": 365, "StorageClass": "DEEP_ARCHIVE"}
        ],
        "Expiration": {"Days": 2555}
      },
      {
        "ID": "cleanup-multipart",
        "Status": "Enabled",
        "Filter": {},
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
      },
      {
        "ID": "old-versions",
        "Status": "Enabled",
        "Filter": {},
        "NoncurrentVersionExpiration": {"NoncurrentDays": 90}
      }
    ]
  }'

# 객체를 특정 스토리지 클래스로 업로드
aws s3 cp data.csv s3://my-bucket/data.csv \
  --storage-class INTELLIGENT_TIERING

# 기존 객체를 다른 클래스로 이동 (CopyObject + 클래스 변경)
aws s3 cp s3://my-bucket/old-data.csv s3://my-bucket/old-data.csv \
  --storage-class GLACIER \
  --metadata-directive COPY

# Storage Lens 조직 요약 보기
aws s3control list-storage-lens-configurations \
  --account-id 123456789012

# Glacier 객체 복원 요청 (Standard 검색, 7일 접근)
aws s3api restore-object \
  --bucket my-bucket \
  --key archived/data.csv \
  --restore-request '{
    "Days": 7,
    "GlacierJobParameters": {"Tier": "Standard"}
  }'
```

## 스토리지 클래스 선택 결정 프레임워크

시험에서 스토리지 클래스 문제는 다음 4가지를 확인하면 풀린다.

```
1. 접근 빈도?
   - 자주(일/주): Standard
   - 가끔(월): Standard-IA
   - 거의 안 함(분기): Glacier Instant
   - 연 1-2회: Glacier Flexible
   - 연 1회 미만: Glacier Deep Archive
   - 모름: Intelligent-Tiering

2. 검색 시 즉시 필요한가?
   - 즉시 필요: Standard, Standard-IA, One Zone-IA, Glacier Instant
   - 시간 기다릴 수 있음: Glacier Flexible (분~시간)
   - 반나절 기다릴 수 있음: Glacier Deep Archive

3. 데이터가 재생성 가능한가?
   - NO: 절대 One Zone-IA 쓰지 말 것
   - YES: One Zone-IA 고려 가능

4. 보관 기간?
   - 30일 미만 빈번한 변경: Standard (IA 최소 기간 함정)
   - 7년+ 규제: Glacier Deep Archive
```

## 정리하며

S3 스토리지 클래스는 "저장 비용 ↓ = 검색 비용·시간 ↑"라는 트레이드오프 위에 설계됐다. 핵심은 전체 TCO를 최적화하는 것이지 저장 단가만 낮추는 것이 아니다.

수명 주기 정책은 이 최적화를 자동화한다. 가장 중요한 설정은 미완료 멀티파트 업로드 정리, 버전 관리 버킷의 이전 버전 만료, 그리고 장기 데이터의 점진적 Glacier 이동이다. 수명 주기 정책이 없으면 모든 데이터가 Standard에 축적되어 비용이 증가한다.

---

## 📝 연습 문제

**문제 1.** 의료 영상(MRI, CT) 데이터를 보관한다. 영상은 진료 후 3개월간 자주 조회되다가, 이후에는 1년에 1-2번 정도만 의사의 요청으로 즉시 제공해야 한다. 5년 이상 보관이 법적 의무다. 가장 비용 효율적인 수명 주기 설계는?

A) 영구적으로 Standard 유지
B) 생성 후 30일 → Standard-IA, 90일 → Glacier Instant Retrieval, 5년 후 삭제
C) 생성 즉시 Glacier Flexible Retrieval
D) 생성 후 90일 → Glacier Deep Archive, 5년 후 삭제

**정답: B**
해설: 첫 3개월(90일) 간 자주 접근 → Standard 또는 Standard-IA(30일 이후). 이후 연 1-2회 접근 시 즉시 필요 → Glacier Instant Retrieval(검색 ms). 90일 후 전환이 Glacier Instant 최소 보관 기간(90일)을 충족한다. 5년 후 삭제는 법적 의무 충족 후 불필요한 비용 방지. C는 초기 3개월 자주 접근 시 Glacier Flexible의 검색 비용(시간+비용)이 과도하게 발생한다. D는 즉시 검색 불가(12시간 대기).

---

**문제 2.** 회사의 데이터 분석 파이프라인이 S3에 저장된 로그를 처리한다. 데이터 팀이 어떤 로그가 자주 분석될지 예측하기 어렵다. 로그는 평균 300KB 크기이며, 일부는 생성 후 몇 시간 만에 분석되고 일부는 몇 달이 지나도 거의 접근이 없다. 가장 적합한 스토리지 클래스는?

A) Standard (모든 데이터를 항상 즉시 접근 가능하게)
B) Standard-IA (30일 후 자동 전환)
C) Intelligent-Tiering
D) Glacier Instant Retrieval

**정답: C**
해설: 접근 패턴이 예측 불가능하고 객체 크기가 300KB(128KB 이상, Intelligent-Tiering 효율 적용)인 경우 Intelligent-Tiering이 최적이다. 자주 접근되면 Frequent Access에, 30일 미접근 시 Infrequent Access로 자동 이동하며 검색 비용 없이 자동 최적화된다. Standard는 미접근 데이터에 비용 낭비. Standard-IA는 패턴 예측 없이 일괄 적용하면 자주 접근하는 객체의 검색 비용이 발생한다. Glacier Instant는 자주 접근하는 데이터에 저장 비용 낭비.

---

**문제 3.** 개발팀이 S3에 대량의 썸네일 이미지를 저장한다. 썸네일은 원본 이미지에서 언제든 재생성 가능하며, 사용자가 요청할 때만 접근된다. 사용자 접근은 주 1-2회 정도다. 비용을 최소화하고 싶다. 어떤 클래스가 적합한가?

A) S3 Standard
B) S3 Glacier Deep Archive
C) S3 One Zone-IA
D) S3 Intelligent-Tiering

**정답: C**
해설: "재생성 가능한 데이터" + "단일 AZ 장애 허용" + "즉시 검색 필요(사용자 요청 시 바로 제공)" + "자주 접근(주 1-2회, Standard-IA 30일 최소 보관 기간 고려)"이 조건이다. One Zone-IA는 재생성 가능한 데이터에서 단일 AZ로 비용을 절감하며 즉시 검색이 가능하다. 주 1-2회 접근이면 Standard-IA의 GB당 검색비가 발생하지만, One Zone-IA가 여전히 Standard보다 저렴하다. Glacier는 즉시 검색 불가(Deep Archive 12시간). 시험에서 "재생성 가능 + 비용 최소화 + 즉시 접근"이 동시에 나오면 One Zone-IA다.

---

**문제 4.** 법무팀이 금융 거래 기록을 정확히 7년간 보관해야 하며, 그 기간 동안 감사 시 12시간 이내에 데이터를 제공할 수 있어야 한다. 월 보관 비용을 최소화해야 한다. 적합한 솔루션은?

A) S3 Standard → Lifecycle 7년 후 삭제
B) S3 Glacier Flexible Retrieval → Lifecycle 7년 후 삭제
C) S3 Glacier Deep Archive → Lifecycle 7년 후 삭제
D) S3 Standard-IA → Lifecycle 7년 후 삭제

**정답: C**
해설: 7년 장기 보관 + 12시간 이내 검색(Standard 검색 12시간, Bulk 검색 48시간) + 비용 최소화. Glacier Deep Archive는 S3에서 가장 저렴한 클래스이며 Standard 검색 시 12시간 내 데이터를 제공한다. 최소 보관 기간 180일은 7년 보관 요건에서 문제없다. B(Glacier Flexible)는 더 비싸고 "비용 최소화" 요건에 맞지 않는다. A와 D는 7년간 불필요하게 높은 저장 비용이 발생한다.

---

**문제 5.** S3 버킷에 버전 관리가 활성화되어 있다. 오래된 버전들이 누적되어 스토리지 비용이 증가하고 있다. 현재 버전은 보호하면서 90일 이상 된 이전 버전만 삭제하는 Lifecycle 정책을 설정하려면?

A) Expiration: Days=90 (모든 객체 90일 후 삭제)
B) NoncurrentVersionExpiration: NoncurrentDays=90
C) AbortIncompleteMultipartUpload: DaysAfterInitiation=90
D) Transition: Days=90, StorageClass=GLACIER (이전 버전 아카이브)

**정답: B**
해설: `NoncurrentVersionExpiration`은 버전 관리가 활성화된 버킷에서 현재 버전이 아닌(noncurrent) 이전 버전들에 대해 만료 정책을 적용한다. 현재 버전은 그대로 보호된다. A의 `Expiration: Days=90`은 모든 객체(현재 버전 포함)를 90일 후 삭제하는 설정이다. C는 멀티파트 업로드 정리다. D는 이전 버전을 아카이브하는 것으로 삭제하지 않아 비용이 계속 발생한다.

---

**문제 6.** 미국에 본사를 둔 기업이 ap-northeast-2 서울 버킷의 객체들 중 일부는 자주 접근하고 일부는 몇 달째 접근이 없다. S3 Storage Lens 분석 결과 전체 데이터의 60%가 90일 이상 미접근이다. 가장 효과적인 비용 최적화 방법은?

A) 모든 객체를 즉시 Glacier로 이동
B) Intelligent-Tiering 스토리지 클래스로 일괄 전환
C) Standard에서 90일 접근 없는 객체를 수동으로 Glacier로 이동
D) 버킷을 One Zone으로 이전

**정답: B**
해설: 접근 패턴이 섞여 있고(일부 자주, 일부 90일 미접근) 패턴이 동적으로 변할 수 있는 경우, Intelligent-Tiering이 자동으로 각 객체를 최적 티어에 배치한다. 자주 접근하는 40%는 Frequent Access에, 미접근 60%는 자동으로 Infrequent Access로 이동한다. A는 자주 접근하는 40%에서 Glacier 검색 비용이 폭발한다. C는 수동 관리의 부담이 크고, 패턴이 변하면 재이동이 필요하다. D는 One Zone 전환이 데이터 손실 위험을 수반한다.