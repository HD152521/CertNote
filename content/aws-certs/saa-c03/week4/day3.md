# Day 18 - S3 보안: 정책, 암호화, Block Public Access

📅 날짜: Week 4 (Day 3)
🎯 주제: S3 보안 설계
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- 버킷 정책 / ACL / Block Public Access 우선순위를 안다
- SSE-S3 / SSE-KMS / SSE-C / 클라이언트 측 암호화를 구분한다
- 정적 웹사이트 + CloudFront 패턴의 보안 모델을 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **At-rest vs In-transit 암호화**: 저장 vs 전송 중. 둘 다 필요.
- **봉투 암호화(Envelope Encryption)**: 데이터를 데이터 키로 암호화하고, 데이터 키를 마스터 키로 암호화. KMS의 핵심.
- **암호화 강도와 키 관리**: 알고리즘(AES-256)은 같아도 누가 키 관리하느냐가 다르다.

---

## 📖 이론 내용

### 1. S3 접근 제어 4계층

1. **IAM 정책** (사용자/Role 신원)
2. **버킷 정책** (리소스 기반)
3. **ACL** (객체/버킷 단위 — 레거시)
4. **Block Public Access** (안전망)

> 평가: 정책 어느 하나에 Deny면 → 거부. 모두에서 Allow면 허용.

### 2. Block Public Access (BPA)

- **계정 전체** 또는 **버킷 단위** 활성화 가능.
- ACL의 public / 버킷 정책의 public을 강제 차단.
- 디폴트 신규 버킷에는 켜져 있음.

### 3. S3 암호화 옵션

| 방식 | 키 관리 | 사용 |
|------|---------|-----|
| **SSE-S3** | AWS 완전 관리 (AES-256) | 기본 (현재 모든 객체 자동) |
| **SSE-KMS** | KMS 키 (감사, 회전) | 정책으로 키 정책까지 통제 |
| **SSE-C** | 고객이 키 제공 (HTTPS 헤더) | 키를 AWS에 두고 싶지 않을 때 |
| **CSE (Client-side)** | 고객 측 SDK 암호화 | 끝까지 고객 통제 |
| **DSSE-KMS** | 이중 KMS 암호화 | FIPS 등 강력한 규제 |

> 2023년부터 **모든 신규 객체는 자동 SSE-S3**. 더 강한 보안은 SSE-KMS / SSE-C / CSE.

### 4. HTTPS 강제 (In-transit)

버킷 정책으로 `aws:SecureTransport=false`인 요청 Deny:
```json
{
  "Effect":"Deny",
  "Principal":"*",
  "Action":"s3:*",
  "Resource":["arn:aws:s3:::b","arn:aws:s3:::b/*"],
  "Condition":{"Bool":{"aws:SecureTransport":"false"}}
}
```

### 5. 정적 웹사이트 호스팅

- 버킷 → "Static website hosting" 활성.
- 보통 **CloudFront + OAC** 조합으로 사설 버킷 노출 (Day 4).
- 직접 노출 시 BPA 일부 해제 필요.

### 6. Cross-Origin Resource Sharing (CORS)

- 다른 도메인 브라우저 요청을 허용. 버킷 단위 설정.
- 시나리오: 프론트엔드 도메인이 S3 정적 자원 호출.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Object Ownership "Bucket owner enforced"** | ACL 비활성 권장 | 보안 강화 |
| **S3 Access Points** | 큰 버킷의 prefix별 다른 정책 | 멀티 테넌트 |
| **VPC Endpoint Policy** | 사설 접근 + endpoint별 추가 제한 | 데이터 유출 차단 |
| **Bucket Keys** | KMS 호출 줄여 비용 절감 | SSE-KMS 비용 ↓ |
| **MFA Delete** | 영구 삭제 시 MFA 강제 | 컴플라이언스 |

> ⚠️ **함정**: "버킷 정책에 Allow 줬는데 외부에서 403". → Block Public Access가 막고 있을 가능성, Account-level SCP, VPC Endpoint Policy 등 확인.

> 💡 **암기 팁**: 보안 강도 순 **CSE > SSE-C > DSSE-KMS > SSE-KMS > SSE-S3**.

### 관련 서비스 Cross-Reference

- KMS 자체 → Week 8
- IAM 정책 평가 → Week 1
- CloudFront OAC → Day 4

---

## 🏗️ 아키텍처 다이어그램

```
[ S3 접근 평가 ]

  Request
    ↓
   Block Public Access?       (Deny 시 끝)
    ↓
   SCP / IAM Identity Policy
    ↓
   VPC Endpoint Policy (사설 접근 시)
    ↓
   Bucket Policy / ACL
    ↓
   Object ACL (Object Ownership 설정에 따라)
    ↓
   KMS Key Policy (SSE-KMS면)
    ↓
   Allow!
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **BPA가 모든 public을 강제 차단** (계정/버킷 둘 다 가능).
2. ⭐ **SSE-S3는 현재 디폴트**. 더 강하면 SSE-KMS.
3. ⭐ **HTTPS 강제는 aws:SecureTransport Deny 정책**.
4. ⭐ **Object Ownership = Bucket owner enforced** 권장 (ACL 비활성).
5. ⭐ **사설 접근**: VPC Endpoint + Endpoint Policy로 데이터 유출 차단.

---

## 💻 실제 예시 - AWS CLI

```bash
# BPA 켜기
aws s3api put-public-access-block --bucket my-saa-bucket-2026 \
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 기본 암호화 SSE-KMS
aws s3api put-bucket-encryption --bucket my-saa-bucket-2026 \
  --server-side-encryption-configuration '{
    "Rules":[{
      "ApplyServerSideEncryptionByDefault":{
        "SSEAlgorithm":"aws:kms",
        "KMSMasterKeyID":"arn:aws:kms:ap-northeast-2:111122223333:key/abc"
      },
      "BucketKeyEnabled": true
    }]
  }'

# HTTPS 강제 정책
aws s3api put-bucket-policy --bucket my-saa-bucket-2026 \
  --policy file://https-only.json
```

---

## 📝 연습 문제

**문제 1.** 우발적 public 공개를 시스템적으로 막으려면?

A) IAM 정책만 B) 버킷 정책 Deny C) Block Public Access 활성 D) MFA Delete

**정답: C**.

---

**문제 2.** KMS 키 회전·감사·세밀 통제가 필요한 암호화:

A) SSE-S3 B) SSE-KMS C) SSE-C D) CSE

**정답: B**.

---

**문제 3.** 모든 요청을 HTTPS만 허용:

A) BPA B) `aws:SecureTransport=false` Deny 정책 C) CloudFront만 사용 D) ACL public-read

**정답: B**.

---

**문제 4.** 큰 버킷 안 prefix별로 다른 정책을 적용해야 한다:

A) S3 Access Points B) Lifecycle Rules C) Versioning D) ACL

**정답: A**.

---

**문제 5.** KMS 호출 비용을 줄이면서 SSE-KMS를 사용:

A) DSSE-KMS B) S3 Bucket Keys 활성 C) SSE-S3로 변경 D) IAM 정책 강화

**정답: B**.

---

## 📌 오늘의 요약

1. 접근 평가: BPA → IAM/SCP → VPC EP → Bucket Policy → ACL → KMS.
2. SSE-S3 디폴트, SSE-KMS가 표준 보강.
3. HTTPS 강제는 SecureTransport Deny.
4. Object Ownership = Bucket Owner Enforced(ACL OFF) 권장.
5. Access Points로 prefix별 정책 분리.
