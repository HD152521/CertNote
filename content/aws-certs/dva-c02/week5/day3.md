# Day 23 - S3 보안: 버킷 정책, ACL, 암호화

📅 날짜: 2026년 6월 16일 (화요일)  
🎯 주제: S3 보안  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- S3 버킷 정책, ACL, 퍼블릭 액세스 차단을 이해한다
- S3 암호화 방식(SSE-S3, SSE-KMS, SSE-C)을 구분한다
- HTTP 강제 차단 정책을 작성한다

---

## 📖 이론 내용

### 1. S3 접근 제어

#### 버킷 정책 (Bucket Policy)
JSON 형식 리소스 기반 정책, 교차 계정 접근 허용 가능:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::my-bucket/*",
      "Condition": {
        "StringEquals": {"aws:PrincipalOrgID": "o-xxxx"}
      }
    }
  ]
}
```

#### ACL (Access Control List)
- 레거시 방식, 현재 권장하지 않음
- 객체 수준 적용 가능

#### ⭐ 퍼블릭 액세스 차단 (Block Public Access)
- 계정/버킷 수준 설정
- **버킷 정책의 퍼블릭 허용도 무시 (최우선 적용)**

### 2. S3 암호화 방식

#### SSE-S3 (S3 관리형 키)
- AWS가 키를 완전 관리
- 헤더: `x-amz-server-side-encryption: AES256`
- **가장 간단, 기본값, 추가 비용 없음**

#### SSE-KMS (KMS 관리형 키)
- AWS KMS로 키 관리
- 키 사용 **감사 로그** (CloudTrail)
- 헤더: `x-amz-server-side-encryption: aws:kms`
- **⭐ KMS 호출 한도**: 초당 5,500~30,000 요청 (병목 가능)

#### SSE-C (고객 제공 키)
- 고객이 키 제공, AWS가 암호화
- 키는 AWS에 저장되지 않음
- **HTTPS 필수** (키 전송 보안)
- 매 요청마다 키 제공 필요

#### 클라이언트 사이드 암호화
- 클라이언트가 암호화 후 업로드
- AWS는 암호화된 데이터만 저장

#### 전송 중 암호화 강제
```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::bucket", "arn:aws:s3:::bucket/*"],
  "Condition": {"Bool": {"aws:SecureTransport": "false"}}
}
```

---

## 🧠 알아두면 좋은 심화 이론

### 암호화 옵션 전체 정리 (시험 매우 빈출)

| 방식 | 키 관리 | 사용 헤더 | 특징 |
|------|---------|-----------|------|
| **SSE-S3** | AWS 완전 관리 | `AES256` | 기본·무료·간단 |
| **SSE-KMS** | KMS (계정 키) | `aws:kms` | 감사 로그·세밀한 정책·KMS API 한도 주의 |
| **DSSE-KMS** | KMS 이중 암호화 | `aws:kms:dsse` | FIPS 140-2 Level 3 수준·국방·정부 |
| **SSE-C** | 고객 키 제공 | x-amz-server-side-encryption-customer-* | HTTPS 필수·AWS 키 저장 X |
| **CSE** | 클라이언트 직접 | - | AWS는 암호문만 봄 |

> ⚠️ **함정**: 2023년부터 **모든 새 객체는 기본적으로 SSE-S3로 자동 암호화**. 명시적 비활성화 불가. 시험에 "S3 객체가 암호화되어 있나?" → 항상 YES.

### S3 Bucket Key (SSE-KMS 비용 최적화)

- KMS API 호출을 객체별 → 버킷별로 줄여 **최대 99% KMS 비용 절감**
- 시험: "SSE-KMS 사용 중 KMS 비용 폭증" → S3 Bucket Key 활성화

### Bucket Owner Enforced (2021~) - ACL 사실상 폐기

```
Object Ownership 설정 3종:
1. Bucket Owner Enforced (권장)      → ACL 비활성화
2. Bucket Owner Preferred           → ACL 가능 (소유권은 버킷 소유자)
3. Object Writer (레거시 기본)      → 업로더가 소유자
```

> 💡 신규 버킷은 **Bucket Owner Enforced** 강제 — IAM/버킷 정책만으로 권한 관리. 시험에 ACL 시나리오 → "현재는 비권장, 비활성화 강제 권장".

### Block Public Access (BPA) 4가지 옵션

| 옵션 | 차단 대상 |
|------|----------|
| BlockPublicAcls | 새 ACL이 퍼블릭 허용 |
| IgnorePublicAcls | 기존 ACL의 퍼블릭 무시 |
| BlockPublicPolicy | 새 버킷 정책 퍼블릭 허용 |
| RestrictPublicBuckets | 퍼블릭 버킷에 익명 접근 차단 |

기본값: **4개 모두 활성화** (2023~ 모든 신규 버킷). 명시적으로 끄지 않으면 퍼블릭 호스팅 불가.

### S3 Access Points + VPC Limit

- Access Point에 `vpc-restriction` 정책 → 특정 VPC에서만 접근
- 인터넷 차단 + 같은 버킷의 다른 액세스 포인트는 영향 없음

### VPC Endpoint for S3 (2종)

| 유형 | 사용 |
|------|------|
| **Gateway Endpoint** | 무료, 라우팅 테이블에 추가, 같은 리전만 |
| **Interface Endpoint (PrivateLink)** | 비용 발생, 사설 IP 가짐, 온프레미스에서도 접근 |

> 시험 시나리오: "EC2에서 NAT 없이 S3 접근" → Gateway Endpoint (가장 저렴).

### 정책 평가 - S3 특화

```
요청 → 명시적 Deny? → 거부
      ↓ NO
      Block Public Access? → 거부 (퍼블릭 요청 시)
      ↓ NO
      버킷 정책 Allow? → IAM 정책 Allow? → 둘 다 OK → 허용
      ↓
      ACL? (Bucket Owner Enforced면 무시)
      ↓
      기본 거부
```

### Cross-Account Encryption 주의점 (시험 함정)

- 다른 계정이 KMS로 암호화된 객체 업로드 시:
  - 대상 계정에 `kms:Decrypt` 권한 필요 (다운로드 시)
  - 키 정책에도 다른 계정 Principal 추가 필요
- CRR로 KMS 객체 복제 시: 대상 리전 KMS 키 별도, **`kms:Encrypt` 권한** 필요

### CORS in S3 (시험 가끔)

```json
[{
  "AllowedOrigins": ["https://mywebsite.com"],
  "AllowedMethods": ["GET", "PUT"],
  "AllowedHeaders": ["*"],
  "MaxAgeSeconds": 3000
}]
```

브라우저가 S3 직접 호출 시(예: presigned URL 업로드) CORS 설정 필요.

### 관련 서비스 Cross-Reference

- **KMS 정책 ↔ S3 정책** → [Week 9 Day 1] 이중 권한 모델
- **CloudTrail Data Events for S3** → [Week 10 Day 4] (객체 수준 감사)
- **Macie** → S3 PII 자동 탐지
- **GuardDuty for S3** → 이상 접근 패턴 감지

---

## 아키텍처 다이어그램

```
S3 암호화 비교
================================

[SSE-S3]
데이터 --> S3 서비스 --> AES256 암호화 --> 저장
              AWS가 키 완전 관리

[SSE-KMS]
데이터 --> S3 --> KMS --> 데이터 키 생성 --> 암호화 --> 저장
                  |
                  CloudTrail 감사 로그!

[SSE-C]
데이터+키 --> S3 암호화 --> 저장 (키 저장 안 함)
HTTPS 필수!

퍼블릭 액세스 제어 계층
================================

계정 수준 퍼블릭 액세스 차단 (최우선!)
        |
버킷 수준 퍼블릭 액세스 차단
        |
버킷 정책 / ACL / IAM 정책
```

---

## ⭐ 핵심 포인트

1. ⭐ **SSE-KMS KMS 한도**: 고성능 환경에서 병목 가능
2. ⭐ **SSE-C**: HTTPS 필수, 매 요청마다 키 제공
3. ⭐ **퍼블릭 액세스 차단 우선**: 버킷 정책 허용도 무시
4. ⭐ **기본 암호화**: 버킷 기본 암호화로 새 객체 자동 암호화
5. ⭐ **HTTPS 강제**: aws:SecureTransport false 조건에 Deny

---

## 📝 연습 문제

**문제 1.** SSE-KMS 성능 문제의 원인은?

A) 데이터 크기 제한  
B) KMS API 호출 한도 초과  
C) 리전 제한  
D) 네트워크 대역폭  

**정답: B** - SSE-KMS는 암호화/복호화마다 KMS API를 호출하며 초당 한도가 있어 고성능 환경에서 병목이 될 수 있습니다.

---

**문제 2.** SSE-C의 필수 요구 사항은?

A) KMS 키 생성  
B) HTTPS 사용  
C) 버킷 버전 관리  
D) CloudTrail 활성화  

**정답: B** - SSE-C에서 고객이 매 요청 키를 제공하므로 키를 안전하게 전송하기 위해 HTTPS가 필수입니다.

---

**문제 3.** 퍼블릭 액세스 차단 활성화 시 버킷 정책의 퍼블릭 허용은?

A) 버킷 정책이 우선  
B) 퍼블릭 액세스 차단이 우선, 버킷 정책 허용 무시  
C) 두 설정 병합  
D) 오류 발생  

**정답: B** - 퍼블릭 액세스 차단이 버킷 정책보다 우선 적용됩니다.

---

**문제 4.** 키 사용 감사 로그가 필요할 때 사용하는 암호화 방식은?

A) SSE-S3  
B) SSE-KMS  
C) SSE-C  
D) 클라이언트 사이드  

**정답: B** - SSE-KMS는 KMS 키 사용 내역이 CloudTrail에 자동 기록됩니다.

---

**문제 5.** HTTP S3 요청을 차단하는 조건은?

A) aws:SecureTransport: true 에서 Allow  
B) aws:SecureTransport: false 에서 Deny  
C) s3:HttpOnly: true 에서 Allow  
D) aws:Protocol: https 에서 Allow  

**정답: B** - aws:SecureTransport가 false(HTTP)인 요청에 Deny를 설정하면 HTTP를 차단합니다.

---

## 📌 오늘의 요약

1. 버킷 정책: JSON 리소스 기반 정책, 교차 계정 지원, ACL은 레거시
2. 퍼블릭 액세스 차단이 버킷 정책보다 우선 적용됨
3. SSE-S3(간단), SSE-KMS(감사 로그, KMS 한도), SSE-C(고객 키, HTTPS 필수)
4. SSE-KMS의 KMS API 호출 한도가 고성능 환경에서 병목 가능
5. HTTPS 강제: aws:SecureTransport false 조건에 Deny 적용
