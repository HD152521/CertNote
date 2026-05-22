# Day 51 - KMS 심화: Key Policy, Grant, 멀티 리전 키

📅 Week 11 (Day 1)
🎯 주제: 암호화 키 관리
⏱️ 약 90분 (출퇴근 15-20분 핵심)

---

## 🎯 학습 목표

- KMS의 키 종류와 사용 시나리오를 안다
- Key Policy·IAM·Grant 권한 모델
- Multi-Region Key·Imported Key·Custom Key Store

---

## 🧩 사전 지식 (CS 기초)

- **Symmetric**: 같은 키로 암·복호화 (AES-256)
- **Envelope Encryption**: 데이터 키로 데이터 암호화 → 데이터 키는 KMS 키로 암호화
- **HSM**: Hardware Security Module — 하드웨어 키 격리

---

## 📖 이론 내용

### 1. KMS 키 유형

| 유형 | 특징 |
|------|------|
| **AWS Managed Key (aws/service)** | 서비스가 자동 생성·관리 |
| **Customer Managed Key (CMK)** | 사용자 생성·키 정책·로테이션 제어 |
| **AWS Owned Key** | 사용자 보이지 않음 |
| **Imported Key Material (BYOK)** | 외부 키 자료 가져오기 (만료 가능) |
| **Custom Key Store** | CloudHSM 클러스터 또는 외부 HSM 연동 |

### 2. 권한 모델 — 3중 체크

1. **Key Policy** (필수) — 키 자체에 붙는 정책
2. **IAM Policy** — 호출자에 붙는 정책 (Key Policy가 허용해야 함)
3. **Grants** — 임시·세분화·취소 가능 (서비스 자동 사용)

> Key Policy에 IAM 위임이 명시되어 있어야 IAM Policy로 KMS 권한 부여 가능

### 3. 로테이션

- **자동 로테이션**: 1년 (Symmetric CMK만, AWS Managed는 1년 자동)
- **Manual 로테이션**: 신규 키 생성 + alias 이동
- **Imported Key**: 자동 로테이션 불가

### 4. Multi-Region Key

- 동일 키 자료를 여러 리전에 복제
- DR·Cross-Region 복호화 가능
- 각 리전 별 별도 정책 가능
- Replica Key는 Primary와 동일 키 ID 끝(suffix 동일)

### 5. Envelope Encryption 흐름

```
GenerateDataKey → 평문 DEK + 암호화된 DEK
   ↓
[데이터 ← 평문 DEK로 암호화]
   ↓
[저장: 암호화 데이터 + 암호화된 DEK]
```

복호화 시: 암호화된 DEK → KMS Decrypt → 평문 DEK → 데이터 복호화

### 6. Key Spec / Usage

| Spec | 용도 |
|------|------|
| SYMMETRIC_DEFAULT | 일반 암·복호화 |
| RSA_2048/3072/4096 | 비대칭 (서명·암호화) |
| ECC_NIST_P256 | 서명만 |
| HMAC_256 | MAC 생성·검증 |

---

## 🧠 심화 이론

### 함정 포인트

- **"Key Policy 없이 IAM만으로 권한"** → ✗ (Key Policy가 IAM 위임 명시 필수)
- **"Cross-Region 복호화"** → Multi-Region Key (Cross-Region Copy 시 자동 복호화)
- **"7-30일 삭제 대기"** → KMS 키 삭제는 PendingDeletion 기간 (즉시 불가)

### 암기팁

- **3중 체크**: Key Policy + IAM + (옵션) Grant
- **MRK**: 같은 키 ID, 다른 리전
- **CloudHSM**: 단일 테넌트·FIPS 140-2 L3

---

## 🏗️ 아키텍처 — Cross-Region DR with MRK

```
[us-east-1 RDS Snapshot ← MRK Primary]
              │
        [Snapshot Copy]
              ▼
[ap-northeast-2 RDS ← MRK Replica]
        (별도 호출 없이 복호화)
```

---

## ⭐ 핵심 포인트

1. ⭐ Key Policy 필수 + IAM 위임 명시
2. ⭐ Grant = 임시·취소·서비스 자동
3. ⭐ Multi-Region Key = 동일 ID·여러 리전
4. ⭐ Envelope Encryption (DEK + CMK)
5. ⭐ Imported Key는 자동 로테이션 불가
6. ⭐ CloudHSM = 단일 테넌트, KMS Custom Key Store 백엔드

---

## 💻 CLI 예시

```bash
# CMK 생성 + 자동 로테이션
aws kms create-key --description "app-cmk"
aws kms enable-key-rotation --key-id <key-id>

# Multi-Region Primary
aws kms create-key --multi-region

# Replica 생성
aws kms replicate-key \
  --key-id arn:aws:kms:us-east-1:...:key/mrk-... \
  --replica-region ap-northeast-2
```

---

## 📝 연습 문제

**문제 1.** us-east-1 S3 객체를 ap-northeast-2로 복제·즉시 복호화.

A) 동일 키 import
B) Multi-Region Key
C) Cross-Region Snapshot
D) KMS Grant

**정답: B**

---

**문제 2.** Lambda가 KMS 사용 — Key Policy에 어떻게 부여하나.

A) IAM Policy만으로 가능
B) Key Policy에서 IAM 위임(`kms:*` Principal=Account Root) 명시 후 IAM에서 Lambda 역할에 권한
C) Grant만
D) SCP

**정답: B**

---

**문제 3.** EBS 자동 암호화 + 자체 키.

A) AWS Managed Key
B) Customer Managed Key
C) Imported Key Material
D) 없음

**정답: B** — 자체 관리 필요 시 CMK

---

**문제 4.** 키 자료를 외부에서 직접 제공 + 만료일 설정.

A) AWS Owned
B) Imported Key Material (BYOK)
C) CMK 일반
D) Grant

**정답: B**

---

**문제 5.** FIPS 140-2 L3 + 단일 테넌트 HSM 필요.

A) KMS CMK
B) CloudHSM (또는 KMS Custom Key Store 백엔드)
C) Imported Key
D) Secrets Manager

**정답: B**

---

**문제 6.** 서비스가 일시적으로 키 사용하고 즉시 회수.

A) IAM Role
B) KMS Grant
C) STS AssumeRole
D) Key Policy 수정

**정답: B**

---

## 📌 오늘의 요약

1. Key Policy + IAM + Grant 3중 체크
2. MRK로 Cross-Region DR
3. BYOK = Imported, 자동 로테이션 불가
4. Envelope Encryption = DEK + CMK
5. CloudHSM = 단일 테넌트 HSM
