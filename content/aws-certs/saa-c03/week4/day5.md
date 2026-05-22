# Day 20 - Week 4 복습 + 시나리오 문제 10

📅 날짜: Week 4 (Day 5)
🎯 주제: S3 + CloudFront + 스토리지 종합 복습
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 객체 스토리지 + CDN + 하이브리드 패턴을 시나리오로 풀 수 있다
- 비용·내구성·검색 지연을 trade-off로 비교한다

---

## 🧩 사전 지식 (CS 기초)

- **TCO 사고법**: 단가만 보면 함정. 검색·전송·요청까지 합산.
- **DR과 백업 차이**: 백업은 복구점 / DR은 서비스 가용성.

---

## 📖 한 주 핵심 정리

1. S3 객체 최대 5TB, 단일 PUT 5GB, 강한 일관성.
2. 클래스 8종: Standard / Intelligent / IA / One Zone-IA / Glacier Instant / Flexible / Deep Archive.
3. BPA + 버킷 정책 + KMS가 보안 3총사.
4. CloudFront + OAC가 S3 안전 노출 표준.
5. Storage Gateway는 영구 하이브리드, DataSync는 마이그, Snow는 오프라인.
6. Signed URL / Geo Restriction / WAF로 콘텐츠 보호.

### 헷갈리기 쉬운 비교표

| 항목 | A | B |
|------|---|---|
| **S3 Standard-IA vs Glacier Instant** | 즉시·자주 안봄 | 즉시·분기 한 번 |
| **OAI vs OAC** | 레거시 | 신규 권장 (KMS·SigV4) |
| **CloudFront Functions vs Lambda@Edge** | JS 경량 | Node/Python 무거움 |
| **DataSync vs Storage Gateway vs Snow** | 마이그/복제 | 영구 하이브리드 | 오프라인 페타 |
| **SSE-S3 vs SSE-KMS** | AWS 키 | KMS 키 회전·감사 |

---

## 🏗️ 한 주 통합 아키텍처

```
[ 글로벌 정적·동적 분리 ]

   Users (Global)
     ↓
   Route 53
     ↓
   CloudFront
     ├─ /static/* → S3 (OAC, SSE-KMS, BPA)
     ├─ /api/*    → ALB → ECS
     └─ /img/*    → S3 with Signed URL

   온프레미스
     └─ S3 File Gateway → S3 Lifecycle → Deep Archive
```

---

## 📝 시나리오 연습 문제 10

**문제 1.** S3 객체에 사용자가 PUT 직후 GET. 결과?

A) Eventually consistent → 옛 값 가능 B) 강한 일관성 → 즉시 최신 C) 5분 지연 D) Replication 필요

**정답: B**.

---

**문제 2.** "검색 비용·지연 없이 자주는 안 보는 데이터":

A) IA B) One Zone-IA C) Glacier Instant D) Deep Archive

**정답: A** — 즉시 액세스 + 자주 안 봄.

---

**문제 3.** 패턴 모름:

A) Standard B) Intelligent-Tiering C) IA D) Glacier

**정답: B**.

---

**문제 4.** S3 public 누출 우려를 시스템적으로 차단:

A) IAM Boundary B) Block Public Access C) Versioning D) MFA Delete

**정답: B**.

---

**문제 5.** S3를 CloudFront로 노출하고 직접 액세스는 막기:

A) OAI B) OAC C) NACL D) Signed URL

**정답: B**.

---

**문제 6.** 본사 NFS 공유를 S3로 자동 백업:

A) DataSync 1회 B) S3 File Gateway C) Snow D) Direct Connect

**정답: B**.

---

**문제 7.** 100TB 일회성 마이그레이션, 네트워크 불충분:

A) DataSync B) Storage Gateway C) Snowball Edge D) VPN

**정답: C**.

---

**문제 8.** 7년 규제 보관 최저 비용:

A) Glacier Flexible B) Glacier Deep Archive C) One Zone-IA D) Standard

**정답: B**.

---

**문제 9.** 카드 번호 같은 필드만 추가 암호화:

A) SSE-KMS B) Field-Level Encryption (CloudFront) C) BPA D) Signed URL

**정답: B**.

---

**문제 10.** CloudFront에서 단순 URL 재작성을 가장 저렴·빠르게:

A) Lambda@Edge B) CloudFront Functions C) Origin Shield D) ALB Listener

**정답: B**.

---

## 📌 오늘의 요약 + 다음 주 예고

1. SAA에서 데이터 계층 비중이 매우 큼 — 클래스·암호화·CloudFront 패턴 자주.
2. 다음 주: **데이터베이스** — RDS / Aurora / DynamoDB / ElastiCache 선택과 설계.
