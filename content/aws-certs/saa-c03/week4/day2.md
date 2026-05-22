# Day 17 - S3 스토리지 클래스 & 수명 주기

📅 날짜: Week 4 (Day 2)
🎯 주제: 비용 최적화의 핵심 — 클래스 선택과 자동 전환
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- S3 스토리지 클래스 8종을 사용 패턴별로 매핑한다
- 수명 주기 규칙(Lifecycle Rule)로 자동 전환·삭제를 설정한다
- Intelligent-Tiering 같은 신상 클래스 동작을 안다

---

## 🧩 사전 지식 (CS 기초)

- **Hot / Warm / Cold 데이터**: 접근 빈도에 따른 분류. Hot은 빠른 액세스, Cold는 거의 안 봄.
- **TCO(Total Cost of Ownership)**: 저장 + 요청 + 검색 + 전송 비용 모두 합쳐서 봐야 함.
- **Read-Once Workload**: 한 번만 읽고 끝. Glacier 같은 곳에 적합.

---

## 📖 이론 내용

### 1. S3 스토리지 클래스 8종

| 클래스 | 가용성/AZ | 검색 시간 | 사용 사례 |
|--------|-----------|-----------|-----------|
| **Standard** | 99.99% / 3+AZ | 즉시 | 자주 액세스 |
| **Intelligent-Tiering** | 99.9% | 즉시 | 액세스 패턴 모름 |
| **Standard-IA** | 99.9% / 3+AZ | 즉시 (검색비) | 자주 안 보는데 빨라야 |
| **One Zone-IA** | 99.5% / 1 AZ | 즉시 | 재생성 가능 데이터 |
| **Glacier Instant Retrieval** | 99.9% | 즉시 | 분기에 한 번 / ms |
| **Glacier Flexible Retrieval** | 99.99% | 1분~12시간 | 백업/장기 |
| **Glacier Deep Archive** | 99.99% | 12시간 | 규제 보관 7~10년 |
| **Reduced Redundancy** | - | - | (Deprecated) |

내구성은 **모든 클래스 11 9's (99.999999999%)**.

### 2. Intelligent-Tiering 동작

- 자동으로 액세스 모니터링 → 30/90/180일 후 IA/Archive/Deep Archive 티어로 이동.
- **검색 비용 없음**(Archive Access는 분당 액세스 비용).
- 객체 모니터링 비용(객체당 적은 금액).
- **128KB 미만은 항상 Frequent** 티어에 머무름.

### 3. Lifecycle Rule

- **Transition**: 일정 일수 후 다른 클래스로 이동.
- **Expiration**: 일정 일수 후 삭제.
- **Noncurrent Version Expiration**: 옛 버전 정리.
- **AbortIncompleteMultipartUpload**: 멀티파트 미완료 정리.

**전형적 패턴**:
```
0~30일   Standard
30~90일  Standard-IA
90~365일 Glacier Flexible
365일+   Deep Archive
2555일   삭제
```

### 4. 클래스 선택 함정

- "한 달에 한 번도 안 본다" → IA로는 부족, **Glacier Instant**.
- "30일 보존 후 즉시 삭제" → Lifecycle Expiration.
- "재생성 가능 + 비용 ↓" → One Zone-IA.
- "패턴 모름" → **Intelligent-Tiering**.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **최소 보관 기간** | IA/Glacier는 30/90/180일 미만 삭제 시 일할 청구 | 짧은 수명 데이터에 불리 |
| **최소 객체 크기** | IA/Glacier는 128KB 미만에 128KB 청구 | 작은 객체에 비효율 |
| **Glacier 검색 종류** | Expedited(1-5분) / Standard(3-5h) / Bulk(5-12h) | 비용/지연 trade-off |
| **S3 Glacier ≠ S3 Glacier Storage Class** | 옛 Glacier(Vault)는 별도. 시험은 클래스 위주 | 혼동 함정 |
| **Storage Lens** | 조직/계정/버킷 단위 분석 + 권장 | 비용 최적화 도구 |

> ⚠️ **함정**: "30일 보관 후 자주 안 보는 객체를 IA로 옮긴다" → IA는 30일 후만 가능(최소). 시험에서 "1일 뒤 IA" 시나리오는 함정.

> 💡 **암기 팁**: "패턴 모르면 Intelligent-Tiering", "재생성 가능하면 One Zone", "장기 보관은 Deep Archive".

### 관련 서비스 Cross-Reference

- 보안·암호화 → Day 3
- CloudFront 캐시 → Day 4
- Glacier Vault Lock → 규제 보관
- Storage Lens → Week 10 비용 최적화

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 Lifecycle 흐름 ]

   Standard
      │ 30d
      ▼
   Standard-IA  (자주 안 보지만 즉시 필요)
      │ 90d
      ▼
   Glacier Flexible Retrieval (검색 비용 ↑, 1분~12h)
      │ 365d
      ▼
   Glacier Deep Archive (규제 7-10년)
      │ 2555d
      ▼
   Expire (삭제)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **내구성은 모두 11 9's**, 가용성은 클래스마다 다름.
2. ⭐ **One Zone-IA = 단일 AZ + 저비용** (재생성 가능 데이터).
3. ⭐ **Intelligent-Tiering = 패턴 모를 때 정답**.
4. ⭐ **Glacier Instant**는 분기에 한 번 정도 + ms 검색.
5. ⭐ **Lifecycle**: 30일/90일 미만은 IA/Glacier 이동 안 됨(과금 함정).

---

## 💻 실제 예시 - AWS CLI

```bash
# Lifecycle 규칙 설정
cat > lc.json <<'EOF'
{
 "Rules": [{
   "ID": "archive-old",
   "Status": "Enabled",
   "Filter": {"Prefix": "logs/"},
   "Transitions": [
     {"Days":30,"StorageClass":"STANDARD_IA"},
     {"Days":90,"StorageClass":"GLACIER"},
     {"Days":365,"StorageClass":"DEEP_ARCHIVE"}
   ],
   "Expiration": {"Days": 2555}
 }]
}
EOF
aws s3api put-bucket-lifecycle-configuration \
  --bucket my-saa-bucket-2026 --lifecycle-configuration file://lc.json

# Intelligent-Tiering 활성화
aws s3api put-object --bucket my-saa-bucket-2026 --key data.csv \
  --body data.csv --storage-class INTELLIGENT_TIERING
```

---

## 📝 연습 문제

**문제 1.** 액세스 패턴이 예측 안 되는 워크로드, 비용 자동 최적화:

A) Standard B) Intelligent-Tiering C) Glacier D) One Zone-IA

**정답: B**.

---

**문제 2.** 재생성 가능한 처리된 결과물, 비용 최저:

A) Standard-IA B) One Zone-IA C) Glacier Instant D) Deep Archive

**정답: B**.

---

**문제 3.** 분기에 한 번 ms 단위 즉시 검색이 필요한 보관 데이터:

A) Glacier Flexible B) Glacier Instant Retrieval C) Deep Archive D) Standard-IA

**정답: B**.

---

**문제 4.** 30일 미만 자주 변경되는 데이터를 IA로 이동하면?

A) 비용 절감 B) 30일 최소 기간 청구 → 오히려 비용 ↑ C) 영향 없음 D) 자동 Standard 유지

**정답: B**.

---

**문제 5.** 7년 규제 보관용 가장 저렴한 클래스:

A) Glacier Flexible B) Glacier Deep Archive C) Standard-IA D) One Zone-IA

**정답: B**.

---

## 📌 오늘의 요약

1. 클래스 선택은 액세스 빈도·검색 지연·재생성 가능성·내구성 요건 4가지.
2. 패턴 모르면 Intelligent-Tiering.
3. One Zone-IA는 재생성 가능 데이터에만.
4. Glacier Instant(분기 검색) / Flexible(분/시간) / Deep Archive(반나절).
5. Lifecycle은 30/90/180일 최소 보관 기간 함정 주의.
