# Day 36 - KMS: CMK, 봉투 암호화, Key Rotation

📅 날짜: Week 8 (Day 1)
🎯 주제: AWS Key Management Service
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- KMS 키 종류 4가지와 비용/관리 차이를 안다
- 봉투 암호화(Envelope Encryption) 원리를 설명한다
- 키 정책 / IAM 정책 / Grant 평가 흐름을 안다

---

## 🧩 사전 지식 (CS 기초)

- **대칭 키 vs 비대칭 키**: 같은 키 / 키 쌍. 대칭은 빠르고 단순, 비대칭은 서명·교환.
- **봉투 암호화**: 데이터를 DEK로 암호화하고 DEK를 KEK(마스터 키)로 암호화. 성능·관리 둘 다 해결.
- **HSM**: 하드웨어 보안 모듈. 키가 칩 안에서만 사용.

---

## 📖 이론 내용

### 1. KMS 키 종류

| 종류 | 관리 | 사용 |
|------|------|-----|
| **AWS Owned** | AWS, 보이지 않음 | 일부 서비스 기본 |
| **AWS Managed** | AWS, 보이지만 사용자 정책 X | `aws/s3`, `aws/ebs` |
| **Customer Managed Key (CMK)** | 고객 | 정책·회전·삭제 통제 |
| **CloudHSM** | 고객 HSM | FIPS 140-2 Level 3 |

### 2. 키 유형 (Customer Managed)

- **Symmetric** (AES-256): 대부분.
- **Asymmetric** (RSA/ECC): 디지털 서명, 키 교환.
- **HMAC**: 무결성 검증.

### 3. 봉투 암호화

```
GenerateDataKey → {plaintext DEK, encrypted DEK}
1) plaintext DEK로 데이터 암호화 (앱이 직접)
2) plaintext DEK는 폐기
3) encrypted DEK를 데이터와 함께 저장
복호화 시: Decrypt(encrypted DEK) → plaintext DEK → 데이터 복호화
```

- 데이터 크기와 무관하게 호출 횟수 적음 → 비용·성능 ↑.

### 4. Key Policy + IAM + Grant

- **Key Policy**가 1차. 최소 한 명의 사용자에게 admin 권한 필요.
- IAM 정책으로 추가 권한 가능.
- **Grant**: 임시 위임. AWS 서비스가 자동 사용(예: RDS 백업 시 임시 grant).

### 5. Key Rotation

- **AWS Managed**: 자동 1년.
- **Customer Managed Symmetric**: 활성/비활성 + 자동 회전 옵션 (1년).
- **Asymmetric / 외부 키**: 수동 회전(별칭 갱신).

### 6. 키 삭제

- 즉시 삭제 불가. **7~30일 대기 후** 삭제.
- 그동안 비활성화 가능.

### 7. Cross-region & Cross-account

- **Multi-Region Keys**: 같은 keyId를 여러 리전에 동기화.
- **VPC Endpoint**: 사설 접근.
- 다른 계정 사용: Key Policy + IAM 정책 양쪽 허용.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **External Key Store (XKS)** | 고객 HSM과 KMS 통합 | 규제 |
| **Bring Your Own Key (BYOK)** | 키 자료 가져오기 | 컴플라이언스 |
| **kms:ViaService** | 특정 AWS 서비스만 키 사용 | 정책 세분화 |
| **EncryptionContext** | AAD. 복호화 시 동일 컨텍스트 요구 | 추가 보안 |
| **DEK Caching** | SDK가 캐시 → 호출 비용 ↓ | 운영 |

> ⚠️ **함정**: "KMS 키를 즉시 삭제" → 불가. 7~30일 대기. 정말 즉시 차단은 **비활성화**.

> 💡 **암기 팁**: Symmetric = 대부분 / Asymmetric = 서명·교환 / HMAC = 무결성 / CloudHSM = FIPS L3.

### 관련 서비스 Cross-Reference

- S3 SSE-KMS → Week 4
- RDS / EBS / DDB 암호화 → Week 5
- Secrets Manager → Day 2

---

## 🏗️ 아키텍처 다이어그램

```
[ 봉투 암호화 흐름 ]

  App
   │ 1) GenerateDataKey(KMS CMK)
   │← {plaintext DEK, encrypted DEK}
   │ 2) plaintext DEK로 큰 데이터 암호화 (AES-256-GCM)
   │ 3) 저장: ciphertext + encrypted DEK
   │ 4) 메모리에서 plaintext DEK 삭제

복호화:
   │ Decrypt(encrypted DEK) → plaintext DEK → 데이터 복호화
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **CMK**가 정책·회전·삭제 통제의 표준.
2. ⭐ 봉투 암호화 = 데이터는 DEK / DEK는 KMS가 보호.
3. ⭐ Key Policy + IAM + Grant 다층 평가.
4. ⭐ 자동 회전 1년 (CMK symmetric).
5. ⭐ 키 삭제는 7~30일 대기.

---

## 💻 실제 예시 - AWS CLI

```bash
# CMK 생성
aws kms create-key --description "saa-app" --key-spec SYMMETRIC_DEFAULT \
  --key-usage ENCRYPT_DECRYPT

# 별칭
aws kms create-alias --alias-name alias/saa-app --target-key-id ...

# 자동 회전 활성
aws kms enable-key-rotation --key-id ...

# 봉투 암호화용 DEK
aws kms generate-data-key --key-id alias/saa-app --key-spec AES_256
```

---

## 📝 연습 문제

**문제 1.** 회사가 KMS 키를 정책·회전 직접 통제:

A) AWS Owned B) AWS Managed C) Customer Managed (CMK) D) S3 SSE-S3

**정답: C**.

---

**문제 2.** 대용량 파일 암호화 시 KMS API 호출을 줄이는 방법:

A) 모든 바이트를 KMS로 전송 B) 봉투 암호화 (DEK 사용) C) IAM 정책 D) IAM Role

**정답: B**.

---

**문제 3.** FIPS 140-2 Level 3 단독 HSM 필요:

A) KMS CMK B) CloudHSM C) Secrets Manager D) STS

**정답: B**.

---

**문제 4.** KMS 키 즉시 삭제:

A) 가능 B) 7~30일 대기 후 삭제 / 즉시는 비활성화 C) 30~90일 D) 1시간 후

**정답: B**.

---

**문제 5.** 다중 리전에서 같은 keyId로 암호·복호화:

A) Cross-region Replication B) Multi-Region Keys C) Backup Snapshot D) KMS Alias

**정답: B**.

---

## 📌 오늘의 요약

1. KMS 키 종류 4가지: Owned/Managed/CMK/CloudHSM.
2. 봉투 암호화 = DEK + KEK 분리.
3. Key Policy + IAM + Grant 평가.
4. 자동 회전 1년, 삭제는 7~30일 대기.
5. Multi-Region Keys로 멀티 리전 운영.
