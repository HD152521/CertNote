# Day 4 - S3 스토리지 관리와 비용 최적화

## 📌 핵심 정리

- 스토리지 클래스는 **저장 단가 ↔ 검색 요금·최소 보관 기간·검색 지연**의 교환이다. 자주 읽는 데이터를 IA·Glacier 에 두면 검색 요금 때문에 오히려 비싸진다.
- 최소 보관 기간은 Standard-IA·One Zone-IA 30일, Glacier Instant·Flexible Retrieval 90일, Deep Archive 180일이다. 그 전에 지우거나 옮기면 남은 기간만큼 과금된다.
- **수명주기 정책**으로 전환·만료를 자동화한다. 불완전 멀티파트 업로드 정리와 비현행 버전 만료 규칙은 거의 모든 버킷에 필요하다.
- 접근 패턴을 모르거나 변하면 **Intelligent-Tiering**(검색 요금 없음, 객체당 모니터링 요금), 패턴이 뚜렷하면 수명주기 전환이 더 싸다.
- Glacier Flexible Retrieval·Deep Archive 로 넘어간 객체는 **복원 전에는 읽을 수 없다.** Athena 는 이 객체들을 건너뛴다. 즉시 조회가 필요하면 Glacier Instant Retrieval 까지만 내린다.

## 비용은 어디서 나오나

데이터 레이크는 시간이 갈수록 커지고, 데이터의 접근 빈도는 시간이 갈수록 떨어진다. S3 요금은 네 갈래로 나오며, 스토리지 클래스는 이 넷의 비율을 바꾼다.

| 과금 항목 | 단위 | 줄이는 방법 |
|------|------|------|
| 저장 | GB-월(클래스별 단가) | 압축·컬럼형 포맷, 낮은 클래스로 전환, 만료 |
| 요청 | 요청 건수(PUT·GET·LIST, 수명주기 전환 요청) | 파일을 크게, 작은 파일 병합 |
| 검색(retrieval) | 읽어 낸 GB(IA·Glacier 계열) | 자주 읽는 데이터는 Standard 에 둔다 |
| 조기 삭제 | 최소 보관 기간의 남은 일수 | 수명이 짧은 데이터는 낮은 클래스로 보내지 않는다 |

여기에 객체당 요금이 붙는 경우가 둘 있다. Intelligent-Tiering 의 모니터링·자동화 요금, 그리고 Glacier Flexible Retrieval·Deep Archive 의 객체당 메타데이터 오버헤드다. 둘 다 **객체 수**에 비례하므로 작은 파일이 많은 레이크에서 문제가 된다.

## S3 스토리지 클래스

| 클래스 | 설계 대상 | 가용성(설계) | AZ | 최소 보관 | 최소 과금 크기 | 검색 |
|------|------|------|------|------|------|------|
| S3 Standard | 자주 접근(월 1회 초과) | 99.99% | 3개 이상 | 없음 | 없음 | 즉시, 검색 요금 없음 |
| S3 Intelligent-Tiering | 패턴을 모르거나 변함 | 99.9% | 3개 이상 | 없음 | 없음 | 즉시(선택형 아카이브 계층 제외), 검색 요금 없음 |
| S3 Standard-IA | 가끔 접근(월 1회 수준), 즉시 필요 | 99.9% | 3개 이상 | 30일 | 128KB | 즉시, GB당 검색 요금 |
| S3 One Zone-IA | 재생성 가능한 비핵심 데이터 | 99.5% | 1개 | 30일 | 128KB | 즉시, GB당 검색 요금 |
| S3 Glacier Instant Retrieval | 분기 1회 수준, 즉시 필요 | 99.9% | 3개 이상 | 90일 | 128KB | 밀리초, GB당 검색 요금 |
| S3 Glacier Flexible Retrieval | 연 1회 수준, 분~시간 허용 | 99.99%(복원 후) | 3개 이상 | 90일 | 해당 없음(객체당 40KB 오버헤드) | 복원 필요 |
| S3 Glacier Deep Archive | 연 1회 미만, 장기 규제 보관 | 99.99%(복원 후) | 3개 이상 | 180일 | 해당 없음(객체당 40KB 오버헤드) | 복원 필요 |

- 내구성은 모든 클래스가 99.999999999%(11 9's)로 같다. 클래스 사이에서 달라지는 것은 **가용성과 AZ 수**다. One Zone-IA 만 AZ 하나에 저장되어 그 AZ 가 물리적으로 소실되면 데이터를 잃는다.
- "최소 과금 크기 128KB"는 그보다 작은 객체도 128KB 로 과금한다는 뜻이다. 수 KB 짜리 파일을 IA 로 보내면 Standard 보다 비쌀 수 있다.
- Glacier Flexible Retrieval·Deep Archive 는 객체마다 40KB 가 덧붙는다. 32KB 는 해당 Glacier 단가로, 8KB 는 Standard 단가로 과금된다(객체 이름과 메타데이터를 실시간으로 나열할 수 있게 유지하는 비용이다).

> 💡 **관련 이론**: IA(Infrequent Access) 계열은 저장 단가를 낮춘 대신 읽을 때 GB당 검색 요금을 받는다. 그래서 손익분기는 "얼마나 자주, 얼마나 많이 읽는가"에 달려 있다. 매일 대시보드가 훑는 Curated 데이터를 IA 로 내리면 검색 요금이 저장 절감액을 넘는다. 클래스는 데이터의 나이가 아니라 **접근 빈도**로 고른다.

## 아카이브 계층의 복원

Glacier Flexible Retrieval 과 Deep Archive 의 객체는 실시간으로 읽을 수 없다. `RestoreObject` 로 **임시 사본**을 만들어 달라고 요청하고, 기다린 뒤, 지정한 일수 동안만 읽는다.

| 복원 옵션 | Glacier Flexible Retrieval | Glacier Deep Archive |
|------|------|------|
| Expedited | 1~5분 | 제공 안 함 |
| Standard(기본) | 3~5시간 | 12시간 이내 |
| Bulk | 5~12시간 | 48시간 이내 |

```bash
# Deep Archive 객체를 Bulk 로 복원 요청하고 임시 사본을 7일간 유지
aws s3api restore-object \
  --bucket acme-datalake-raw-prod \
  --key raw/orders/dt=2023-01-15/part-0000.json.gz \
  --restore-request '{"Days": 7, "GlacierJobParameters": {"Tier": "Bulk"}}'
```

- 복원해도 객체의 스토리지 클래스는 그대로다. 복원 기간에는 **아카이브 요금 + 임시 사본의 Standard 요금**을 함께 낸다.
- Flexible Retrieval 의 Bulk 복원은 무료이고, Expedited 는 프리미엄 요금이다. Expedited 는 수요가 몰리면 거절될 수 있어, 확실히 필요하면 프로비저닝된 용량을 산다.
- 객체가 수천만 개면 복원 요청 자체가 일이다. S3 Batch Operations 로 한 번에 요청한다.
- 클래스를 영구히 되돌리려면 복원한 뒤 원하는 클래스로 **복사(copy)** 해야 한다. 수명주기 전환은 아래로만 흐른다.

## 데이터 레이크 존별 스토리지 매핑

| 존 | 접근 패턴 | 권장 |
|------|------|------|
| Raw | 재처리 때만 드물게, 하지만 그때는 바로 필요 | Standard → 일정 기간 뒤 Standard-IA 또는 Glacier Instant Retrieval |
| Clean | ETL 이 정기적으로 읽음 | Standard 또는 Intelligent-Tiering |
| Curated | BI·대시보드가 자주 읽음 | Standard |
| 장기 규제 보관(원본 로그 등) | 거의 읽지 않음, 지연 허용 | Glacier Deep Archive |

- Athena·Redshift Spectrum 으로 조회할 가능성이 남아 있는 데이터는 **Glacier Instant Retrieval 까지만** 내린다. Flexible Retrieval·Deep Archive 로 넘어간 객체는 Athena 가 **오류 없이 건너뛰므로** "오래된 파티션이 조용히 결과에서 빠지는" 사고가 난다.
- 복원한 객체를 Athena 로 읽으려면 테이블 속성 `read_restored_glacier_objects` 를 `true` 로 설정해야 한다(엔진 버전 3, Hive 테이블). 복원 자체는 Athena 가 해 주지 않는다.
- 오픈 테이블 포맷(Iceberg 등)의 데이터 파일은 수명주기로 아카이브하거나 만료시키지 않는다. 메타데이터가 가리키는 파일이 읽히지 않으면 테이블이 깨진다.

## 수명주기(Lifecycle) 정책

수명주기 규칙은 객체의 나이에 따라 **전환(transition)** 하거나 **만료(expiration)** 시킨다. 버킷 하나에 구성 하나, 규칙은 1,000개까지다.

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
      "Expiration": { "Days": 2555 },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
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

전환은 **폭포수 모델**이다. 위에서 아래로만 내려간다.

```text
Standard → Standard-IA → Intelligent-Tiering → One Zone-IA → Glacier Instant Retrieval
        → Glacier Flexible Retrieval → Glacier Deep Archive
(위 단계에서 아래 단계로 건너뛰는 것은 가능, 거슬러 올라가는 것은 불가)
```

규칙을 짤 때 걸리는 제약은 다음과 같다.

| 제약 | 내용 |
|------|------|
| 필터 | 프리픽스, 객체 태그, 객체 크기(`ObjectSizeGreaterThan`/`ObjectSizeLessThan`)와 그 조합 |
| 작은 객체 | **128KB 미만 객체는 기본적으로 어떤 클래스로도 전환되지 않는다.** 전환 요청 비용이 절감액을 넘기 때문이다. 크기 필터로 바꿀 수 있다 |
| 최소 보관 기간 | 한 규칙 안에서 최소 보관 기간을 채우기 전에 다음 클래스로 넘기는 설정은 만들 수 없다(예: 4일째 Glacier Instant Retrieval 로 보냈다면 Deep Archive 전환은 94일째 이후) |
| 날짜 계산 | 생성 시각에 일수를 더한 뒤 다음 날 자정(UTC)으로 올림한다 |
| 과금 시점 | Glacier 전환은 비동기지만, 규칙 조건을 충족한 날부터 대상 클래스 요금으로 과금된다 |

- 128KB 기본 동작은 2024년 9월에 바뀐 것이다. 그 전에는 128KB 미만 객체도 Glacier Flexible Retrieval·Deep Archive 로는 전환됐다. 오래된 자료는 옛 동작으로 설명할 수 있다.
- 전환은 객체 하나가 요청 하나다. 작은 파일 수억 개를 전환하면 **전환 요청 비용**이 절감액을 넘는다. 먼저 합치고 나서 내린다.

## 버전 관리 버킷에서의 수명주기

버전 관리가 켜진 버킷에서는 "만료"의 뜻이 달라진다.

| 액션 | 버전 관리 없음 | 버전 관리 켜짐 |
|------|------|------|
| `Expiration` | 객체를 영구 삭제 | 삭제 마커를 추가한다. 기존 버전은 **비현행 버전으로 남는다** |
| `NoncurrentVersionExpiration` | 효과 없음 | 비현행 버전을 영구 삭제 |
| `NoncurrentVersionTransition` | 효과 없음 | 비현행 버전을 다른 클래스로 전환 |
| `ExpiredObjectDeleteMarker` | 해당 없음 | 버전이 하나도 남지 않은 삭제 마커를 제거 |

- 버전 관리 버킷에 `Expiration` 만 걸면 **요금이 줄지 않는다.** 데이터가 비현행 버전으로 그대로 남기 때문이다. `NoncurrentVersionExpiration` 을 함께 건다.
- `NewerNoncurrentVersions` 로 "최근 N개 비현행 버전은 남긴다"를 지정할 수 있다(1~100).
- 만료 규칙은 **불완전 멀티파트 업로드를 지우지 않는다.** 별도의 `AbortIncompleteMultipartUpload` 규칙이 필요하다. 이 액션과 `ExpiredObjectDeleteMarker` 는 태그 필터가 있는 규칙에는 쓸 수 없다.

> ⚠️ **함정**: 덮어쓰기가 잦은 ETL 출력 버킷에 버전 관리를 켜면, 잡이 돌 때마다 이전 출력 전체가 비현행 버전으로 쌓인다. 콘솔에는 최신 객체만 보이니 "데이터는 100GB 인데 요금은 몇 TB 치"가 된다. 버전 관리 + 비현행 버전 만료 규칙은 한 세트다.

## S3 Intelligent-Tiering

접근 패턴을 예측하기 어려운 데이터는 S3 가 객체별 접근을 지켜보며 계층을 옮기게 한다. 계층이 바뀌어도 스토리지 클래스는 Intelligent-Tiering 그대로다.

| 접근 계층 | 이동 조건 | 접근 |
|------|------|------|
| Frequent Access(자동) | 기본. 업로드·전환 직후 | 즉시 |
| Infrequent Access(자동) | 30일 연속 미접근 | 즉시 |
| Archive Instant Access(자동) | 90일 연속 미접근 | 즉시 |
| Archive Access(선택) | 90일 이상 미접근(최대 730일까지 설정) | 복원 필요, Flexible Retrieval 과 같은 성능 |
| Deep Archive Access(선택) | 180일 이상 미접근(최대 730일까지 설정) | 복원 필요, Deep Archive 와 같은 성능 |

- 자동 3계층은 모두 즉시 읽힌다. 아래 계층에 있던 객체를 읽으면 Frequent Access 로 되돌아간다.
- **검색 요금이 없고 최소 보관 기간도 없다.** 대신 객체당 월 모니터링·자동화 요금을 낸다.
- **128KB 미만 객체는 모니터링되지 않고** 항상 Frequent Access 계층에 머문다. 작은 파일뿐인 프리픽스에는 효과가 없다.
- 선택형 아카이브 계층은 켜야만 쓰이고, 켜면 그 계층의 객체는 **복원해야 읽힌다.** Athena 로 조회하는 데이터에는 켜지 않는다.
- `GetObject` 는 접근으로 치지만 `HeadObject`·목록 조회·태그 조회는 접근으로 치지 않는다.

```bash
# 버킷의 Intelligent-Tiering 객체에 선택형 아카이브 계층 활성화
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

| 판단 기준 | 수명주기 전환 | Intelligent-Tiering |
|------|------|------|
| 접근 패턴 | 나이에 따라 뚜렷이 줄어듦 | 모르거나 불규칙, 변함 |
| 다시 읽을 때 | IA·Glacier 는 검색 요금 | 검색 요금 없음, 자동으로 상위 계층 복귀 |
| 고정 비용 | 전환 요청 비용(1회) | 객체당 모니터링 요금(매월) |
| 조기 삭제 요금 | 있음 | 없음 |
| 작은 객체 | 128KB 미만은 기본 전환 제외 | 128KB 미만은 계층 이동 없음 |

Intelligent-Tiering 은 "잘못 예측했을 때의 벌금을 없애는 보험"이다. 패턴이 확실하면(30일 뒤에는 거의 안 본다) 보험료인 모니터링 요금 없이 수명주기로 직접 내리는 편이 싸다. 패턴이 불확실하면 IA 로 내렸다가 다시 읽혀 검색 요금을 내는 위험이 더 크므로 Intelligent-Tiering 이 낫다.

## 비용 가시성 도구

| 도구 | 답해 주는 질문 | 출력 |
|------|------|------|
| S3 Storage Lens | 조직·계정·버킷·프리픽스 단위로 어디에 얼마나 쌓였나, 불완전 멀티파트·비현행 버전은 얼마나 되나 | 대시보드, 지표 내보내기 |
| S3 Inventory | 버킷에 어떤 객체가 어떤 클래스·크기·암호화 상태로 있나 | 일·주 단위 목록 파일(CSV·ORC·Parquet) → Athena 로 분석 |
| 스토리지 클래스 분석 | 이 데이터는 언제 Standard-IA 로 내리는 것이 좋은가 | 접근 패턴 분석 결과 |

- Inventory 는 `ListObjects` 를 수억 번 호출하지 않고 객체 목록을 얻는 방법이다. Athena 로 "프리픽스별 평균 객체 크기"를 뽑으면 작은 파일 문제의 위치가 드러난다.
- 스토리지 클래스 분석은 Standard 와 Standard-IA 사이의 판단을 돕는다. 수명주기 일수를 감으로 정하지 않게 해 준다.

근본적인 절감 순서는 **① 저장량 자체를 줄인다(Parquet + 압축) → ② 객체 수를 줄인다(컴팩션) → ③ 필요 없는 것을 지운다(만료, 비현행 버전, 불완전 업로드) → ④ 남은 것을 맞는 클래스로 보낸다**이다. ④부터 손대면 작은 파일의 전환 요청 비용과 최소 과금 크기에 걸린다.

## 증상 → 원인 → 조치

| 증상 | 원인 | 조치 |
|------|------|------|
| IA 로 옮겼더니 요금이 늘었다 | 자주 읽혀 검색 요금 발생, 또는 128KB 미만 객체가 128KB 로 과금 | Standard 로 되돌림, 접근 패턴 확인 |
| 수명주기 전환 후 요청 요금 급증 | 작은 객체 대량 전환 | 컴팩션 후 전환, 크기 필터 |
| 만료 규칙을 걸었는데 용량이 그대로 | 버전 관리 버킷의 비현행 버전 | `NoncurrentVersionExpiration` 추가 |
| 객체 목록 합계보다 요금이 크다 | 불완전 멀티파트 업로드, 비현행 버전 | `AbortIncompleteMultipartUpload`, Storage Lens 로 확인 |
| Athena 결과에서 오래된 날짜가 빠진다 | 해당 객체가 Glacier Flexible Retrieval·Deep Archive 로 전환됨 | 복원 후 `read_restored_glacier_objects`, 이후에는 Instant Retrieval 까지만 |
| 한 달 만에 지운 데이터에 추가 요금 | 최소 보관 기간 미충족 | 수명이 짧은 데이터는 Standard 유지 |
| Intelligent-Tiering 인데 절감이 없다 | 객체가 128KB 미만 | 병합 후 적용 |

## 지문 단서 → 정답 판별표

| 지문 단서 | 정답 |
|------|------|
| "접근 패턴을 예측할 수 없다 / 운영 부담 없이 자동으로" | Intelligent-Tiering |
| "30일 후에는 거의 접근하지 않는다(패턴이 명확)" | 수명주기 전환 |
| "드물게 읽지만 읽을 때는 밀리초 안에" | Standard-IA 또는 Glacier Instant Retrieval(분기 1회 수준이면 후자) |
| "재생성할 수 있는 데이터를 가장 싸게, 즉시 접근" | One Zone-IA |
| "7~10년 규제 보관, 복원에 반나절 걸려도 된다" | Glacier Deep Archive |
| "아카이브에서 몇 분 안에 꺼내야 한다" | Glacier Flexible Retrieval + Expedited |
| "실패한 대용량 업로드의 숨은 비용" | `AbortIncompleteMultipartUpload` |
| "버전 관리 버킷의 스토리지 비용이 계속 증가" | `NoncurrentVersionExpiration` |
| "어느 버킷·프리픽스가 비용을 쓰는지 조직 전체로 파악" | S3 Storage Lens |
| "객체별 클래스·크기 목록을 SQL 로 분석" | S3 Inventory + Athena |

내일은 이번 주의 네 주제를 하나의 레이크 운영 시나리오로 묶어 복습한다.

## 📖 용어

- **스토리지 클래스** : 접근 빈도와 검색 지연에 따라 저장 단가가 달라지는 S3 의 저장 등급.
- **검색 요금(retrieval fee)** : IA·Glacier 계열에서 데이터를 읽어 낼 때 GB당 부과되는 요금.
- **최소 보관 기간** : 그 전에 삭제·전환하면 남은 기간만큼 과금되는 기간. 클래스마다 30·90·180일이다.
- **수명주기 정책** : 객체의 나이에 따라 클래스를 전환하거나 삭제하는 버킷 단위 규칙 모음.
- **전환(transition)과 만료(expiration)** : 다른 스토리지 클래스로 옮기는 것과 삭제하는 것.
- **비현행 버전(noncurrent version)** : 버전 관리 버킷에서 덮어쓰이거나 삭제되어 최신이 아니게 된 객체 버전. 요금은 계속 나온다.
- **삭제 마커** : 버전 관리 버킷에서 삭제 요청 시 추가되는 표식. 객체가 없는 것처럼 보이게 할 뿐 데이터를 지우지는 않는다.
- **불완전 멀티파트 업로드** : 완료되지 않은 멀티파트 업로드가 남긴 파트. 목록에 보이지 않지만 저장 요금이 나온다.
- **복원(restore)** : 아카이브된 객체의 임시 사본을 만들어 일정 기간 읽을 수 있게 하는 작업.
- **S3 Inventory** : 버킷의 객체와 메타데이터 목록을 정기적으로 파일로 내보내는 기능.

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
