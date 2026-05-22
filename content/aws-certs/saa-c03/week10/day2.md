# Day 47 - S3 비용 최적화, Intelligent-Tiering

📅 날짜: Week 10 (Day 2)
🎯 주제: 스토리지 비용 최적화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- S3 스토리지 클래스 + Lifecycle로 비용을 최소화한다
- Intelligent-Tiering / Storage Lens / Inventory를 활용한다
- EBS / EFS / FSx 비용 최적화 포인트를 안다

---

## 🧩 사전 지식 (CS 기초)

- **TCO 함수**: 저장 + 요청 + 검색 + 전송 + 키. 단가만 보면 함정.
- **저장 vs 처리 비용**: Glacier는 저장 ↓ 검색 ↑. 균형이 핵심.

---

## 📖 이론 내용

### 1. S3 비용 구성요소

- **Storage** ($/GB-month).
- **Requests** (PUT, GET, LIST...).
- **Data Transfer Out** (인터넷·다른 리전).
- **Retrieval** (Glacier 등).
- **Management** (Inventory, Lens, Replication).

### 2. 비용 절감 체크리스트

- 액세스 패턴 모르면 **Intelligent-Tiering**.
- 재생성 가능하면 **One Zone-IA**.
- 30/90/180일 최소 보관 함정 주의.
- **Lifecycle**으로 자동 전환·삭제·incomplete multipart 정리.
- **Bucket Keys**로 KMS 호출 비용 절감.
- **Inventory**로 큰 객체·오래된 객체 가시화.
- **Storage Lens**로 조직 단위 분석.

### 3. CloudFront로 S3 전송 비용 절감

- S3 직접 다운로드보다 CloudFront 경유가 더 저렴할 수 있음(글로벌 분포 시).
- **Origin Shield** + 캐시 히트 ↑.

### 4. 데이터 전송 비용 함정

- 같은 리전 다른 AZ는 cross-AZ 비용.
- 다른 리전·인터넷으로 나가는 트래픽이 비싸.
- **VPC Endpoint(S3/DDB Gateway = 무료)** → NAT 비용 절감.

### 5. EBS / EFS / FSx 절감

- **gp3로 통일** (gp2 → gp3 가성비 ↑).
- 사용 안 하는 EBS 볼륨·스냅샷 정리 (TA에 표시).
- **EBS Snapshot Archive** 75% ↓.
- **EFS IA / Archive 클래스** 자동 전환.
- FSx Lustre **Scratch vs Persistent** (Scratch가 ↓ 비용).

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Storage Lens 무료/유료** | 기본 대시보드 무료, 고급 메트릭 유료 | 거버넌스 |
| **Requester Pays** | 다운로드 비용을 요청자가 부담 | 데이터 공개 |
| **Replication** | CRR/SRR 비용 발생 | 필요한 것만 |
| **Cold Multipart Cleanup** | 미완료 파트 → Lifecycle | 숨은 비용 |
| **S3 Tables / Vectors** | 신규 서비스 | 시험 가벼움 |

> ⚠️ **함정**: "30일 미만 자주 변경되는 데이터를 IA로 이동" → IA 30일 최소 보관 청구로 오히려 비싸.

> 💡 **암기 팁**: 패턴 모름 → Intelligent-Tiering / 재생성 가능 → One Zone-IA / 장기 → Deep Archive.

### 관련 서비스 Cross-Reference

- S3 스토리지 클래스 → Week 4
- EBS → Week 3
- VPC Endpoint → Week 2

---

## 🏗️ 아키텍처 다이어그램

```
[ 자동화된 데이터 라이프사이클 ]

  Upload → S3 Standard
              │ 30d Lifecycle
              ▼
       Standard-IA
              │ 90d
              ▼
        Glacier Flexible
              │ 365d
              ▼
        Deep Archive
              │ 2555d
              ▼
            삭제

  + Intelligent-Tiering 활성: 위 흐름 자동
  + Bucket Keys ON
  + Inventory + Lens 분석
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ 패턴 모름 = **Intelligent-Tiering**.
2. ⭐ Lifecycle은 30/90/180일 최소 보관 함정.
3. ⭐ **Bucket Keys**로 KMS 비용 ↓.
4. ⭐ **VPC Endpoint(S3/DDB) 무료**로 NAT 비용 절감.
5. ⭐ gp3 통일 + 사용 안 하는 EBS/스냅샷 정리.

---

## 💻 실제 예시 - AWS CLI

```bash
# Storage Lens 대시보드 (기본 무료)
aws s3control put-storage-lens-configuration \
  --account-id 111122223333 --config-id default \
  --storage-lens-configuration file://lens.json

# Inventory 활성화
aws s3api put-bucket-inventory-configuration \
  --bucket my-saa-bucket-2026 --id daily \
  --inventory-configuration file://inv.json
```

---

## 📝 연습 문제

**문제 1.** 액세스 패턴 모르는 워크로드, 비용 자동 최적화:

A) Intelligent-Tiering B) Standard-IA C) Glacier Instant D) One Zone-IA

**정답: A**.

---

**문제 2.** SSE-KMS 비용 절감:

A) SSE-S3로 변경 B) Bucket Keys 활성 C) IAM 정책 강화 D) BPA

**정답: B**.

---

**문제 3.** NAT Gateway로 S3 트래픽 많이 나감:

A) Interface Endpoint B) S3 Gateway Endpoint (무료) C) PrivateLink 결제 D) Direct Connect

**정답: B**.

---

**문제 4.** 7년 규제 보관 최저:

A) Glacier Flexible B) Deep Archive C) IA D) Standard

**정답: B**.

---

**문제 5.** EBS gp2 → gp3 효과:

A) 더 비쌈 B) 비용 ↓ + 성능 ↑ C) 동일 D) 호환 불가

**정답: B**.

---

## 📌 오늘의 요약

1. S3 클래스 + Lifecycle + Intelligent-Tiering이 비용의 핵심.
2. 최소 보관 함정·Multipart 청소 잊지 말기.
3. Bucket Keys + S3 Gateway Endpoint 무료.
4. gp3 통일 + 미사용 EBS/Snapshot 정리.
5. Storage Lens / Inventory로 가시화.
