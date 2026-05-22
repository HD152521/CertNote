# Day 1 - KMS (Key Policy, Grant, 회전, CloudHSM)

📅 날짜: Week 9 (Day 1)
🎯 주제: AWS의 마스터 키 관리 시스템
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- KMS Key 종류(AWS managed / Customer managed / AWS owned)와 차이를 안다
- Key Policy + Grant + IAM 정책의 평가 흐름을 이해한다
- 키 회전, 다중 리전 키, CloudHSM의 사용 사례를 익힌다

---

## 🧩 사전 지식 (CS 기초)

- **대칭키 vs 비대칭키**: 같은 키로 암/복호화 vs 공/사키 쌍
- **Envelope encryption**: 데이터 키로 데이터 암호화 + 마스터 키로 데이터 키 암호화
- **HSM (Hardware Security Module)**: 물리 보안 모듈. 키가 절대 외부로 나가지 않음
- **FIPS 140-2 Level 3**: 미국 정부 보안 표준
- **Key rotation**: 주기적 키 교체. 손상 시 영향 최소화

---

## 📖 이론 내용

### 1. KMS Key 종류

| 종류 | 관리 주체 | 비용 | 키 정책 제어 |
|------|-----------|------|--------------|
| **AWS Owned** | AWS, 여러 고객 공유 | 무료 | 없음 |
| **AWS Managed** | AWS, 계정별 자동 (`aws/s3` 등) | 무료 | 제한적 |
| **Customer Managed (CMK)** | 고객 | $1/월/key + API 호출 | 완전 제어 |

#### 주의 - 용어 변경
- 과거 "CMK (Customer Master Key)" → 현재 "**KMS Key**"
- 시험에서는 둘 다 등장

### 2. Envelope Encryption

```
[데이터]
    │ 1. Data Key (DEK) 생성
    ▼
[데이터 + DEK로 암호화 → 암호화된 데이터]
[DEK + KMS Master Key로 암호화 → 암호화된 DEK]
    │
    ▼
저장: (암호화된 데이터, 암호화된 DEK) 함께
```

#### 복호화 시
1. KMS에 `Decrypt(암호화된 DEK)` 요청 → 평문 DEK 받음
2. 평문 DEK로 암호화된 데이터 복호화

#### 왜 이렇게?
- KMS는 **최대 4KB**만 직접 암/복호화
- 큰 데이터는 DEK로 로컬에서 처리 → 성능 ↑
- DEK는 짧으니 KMS로 안전하게 보호

### 3. Key Policy

#### Key Policy의 특수성
- **모든 KMS Key는 Key Policy 필요** — 기본 명시 없으면 아무도 못 씀
- Key Policy = Resource-based Policy (S3 버킷 정책과 비슷)
- 다른 정책(IAM/Grant)이 작동하려면 Key Policy가 우선 허용

#### 기본 Key Policy
```json
{
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
      "Action": "kms:*",
      "Resource": "*"
    }
  ]
}
```
→ "이 계정의 IAM 정책에 권한 있으면 사용 가능". `root`는 계정을 의미 (실제 루트 사용자만이 아님).

#### Cross-Account 사용
- 다른 계정 IAM이 사용하려면 Key Policy에 명시 + 사용자 측 IAM 정책에 명시 둘 다 필요

### 4. Grant (임시 위임)

#### 개념
- Key Policy 수정 없이 **임시·세분화된 권한 위임**
- 자동화·서비스 통합에 활용

#### Key Policy vs Grant vs IAM

| 도구 | 동작 | 사용 사례 |
|------|------|-----------|
| **Key Policy** | Key 자체 권한. 모든 요청의 기준 | 정적 권한 |
| **IAM Policy** | 사용자/Role 단위 권한. Key Policy 허용 전제 | 사용자 그룹 |
| **Grant** | 임시·세분화. Key Policy를 우회 | EBS 암호화, RDS 등 자동화 |

#### Grant 예시
```bash
aws kms create-grant \
  --key-id arn:aws:kms:ap-northeast-2:123:key/abc \
  --grantee-principal "arn:aws:iam::123:role/MyLambda" \
  --operations "Decrypt" "GenerateDataKey" \
  --constraints 'EncryptionContextEquals={Project=MyApp}'
```

### 5. Key Rotation (키 회전)

#### Customer Managed Key
- **자동 회전**: 활성화 시 매년 자동 (옵션)
- **수동 회전**: 새 키 만들고 alias 이동 (직접)
- 회전 시: 새 backing key 생성, 과거 데이터는 과거 backing key로 복호화 가능

```bash
aws kms enable-key-rotation --key-id abc
```

#### AWS Managed Key
- 자동 회전 매년 (활성화/비활성화 불가)

#### Imported Key Material
- 외부에서 키 가져오기 (BYOK)
- 자동 회전 X (수동만)
- 만료 일자 설정 가능

### 6. Multi-Region Key

#### 개념
- 한 키를 여러 리전에 복제 (같은 Key ID)
- 다른 리전에서 같은 키로 복호화 가능 → DR 시 데이터 이동 자유

#### vs Cross-Region Replication
- 일반 KMS Key는 리전 종속 — 다른 리전에서 복호화 불가
- Multi-Region Key는 키 자체가 멀티 리전

#### 사용 사례
- Global DynamoDB Table
- S3 Cross-Region Replication
- Multi-Region 백업

### 7. CloudHSM

#### KMS vs CloudHSM

| 항목 | KMS | CloudHSM |
|------|-----|----------|
| 관리 | AWS 공유 인프라 | 단독 HSM 인스턴스 |
| FIPS Level | 140-2 L2 (HSM 자체는 L3) | 140-2 L3 |
| 키 제어 | AWS 관리 (정책 통제) | 고객 100% 제어 |
| 비용 | 저렴 | 비쌈 (시간당 $1.45+) |
| 통합 | AWS 서비스 네이티브 | 표준 PKCS#11 |
| 사용 사례 | 일반 | 규제 산업, BYOK 엄격 |

#### CloudHSM 사용 패턴
- Custom Key Store: KMS 인터페이스로 쓰되 키는 CloudHSM에
- 직접 PKCS#11 API로 통합

### 8. KMS 운영 함정

#### Key 삭제 (시험 빈출)
- KMS Key는 즉시 삭제 X
- **7~30일 대기 기간** 후 삭제 (취소 가능)
- 삭제된 키로 암호화된 데이터는 영구 복호화 불가 (재해)

#### Encryption Context
- 추가 인증 데이터 (AAD)
- 키-값 쌍으로 암/복호화 시 함께 전달
- 같은 context로 복호화해야 성공

```bash
aws kms encrypt \
  --key-id abc \
  --plaintext "secret" \
  --encryption-context "Project=Web,User=Alice"

# 복호화 시 같은 context 필요
aws kms decrypt \
  --ciphertext-blob fileb://cipher \
  --encryption-context "Project=Web,User=Alice"
```

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Asymmetric KMS Key** | RSA/ECC 비대칭 키 (서명/검증) | 일반 대칭은 AES-256 |
| **AWS KMS XKS** | 외부 키 저장소 통합 (3rd party HSM) | 고급 옵션 |
| **Key Spec** | SYMMETRIC_DEFAULT, RSA_2048, ECC_NIST_P256 등 | 용도별 |
| **EBS Encryption by Default** | 계정·리전 단위 기본 암호화 | 모범 사례 |
| **AWS Encryption SDK** | 클라이언트 측 라이브러리 | 앱 통합 |

> ⚠️ **함정 1**: Key Policy에 명시 없으면 IAM에 권한 있어도 사용 불가 — KMS만의 특이점.
>
> ⚠️ **함정 2**: 삭제 대기 기간 중인 키는 사용 불가. 영구 복호화 불가 위험 → 신중히.
>
> 💡 **암기 팁**: KMS(AWS 통합·저렴) ↔ CloudHSM(단독·규제). Multi-Region Key(DR), Grant(임시 위임).

### 관련 서비스 Cross-Reference

- **KMS → Week 4 CloudTrail** (KMS 사용 로깅)
- **KMS → Week 9 Day 2 Secrets Manager** (자동 회전)
- **KMS → Week 5 SSM Parameter Store** (SecureString)
- **KMS → Week 10 백업** (Multi-Region Key)

---

## 🏗️ 아키텍처 다이어그램

```
Envelope Encryption
==========================================================

   [큰 데이터 1GB]
       │
       │ 1. GenerateDataKey(KeyId)
       ▼
   ┌─────────────────────────────┐
   │ KMS Key (Master)            │
   │   → Plain DEK + Cipher DEK  │
   └─────────────────────────────┘
       │
       ▼
   [Plain DEK로 데이터 암호화]
   [Cipher DEK + 암호화 데이터 함께 저장]

   복호화:
   [Cipher DEK]
       │ kms:Decrypt
       ▼
   [Plain DEK]
       │
       ▼
   [데이터 복호화]
```

```
정책 평가 흐름
==========================================================

   API 요청: kms:Decrypt
       │
       ▼
   ┌──────────────────────────┐
   │ 1. Key Policy 확인        │ ← Allow 없으면 즉시 거부
   └──────────┬───────────────┘
              ▼
   ┌──────────────────────────┐
   │ 2. IAM Policy 확인        │
   └──────────┬───────────────┘
              ▼
   ┌──────────────────────────┐
   │ 3. Grant 확인 (있다면)    │
   └──────────┬───────────────┘
              ▼
   ┌──────────────────────────┐
   │ 4. Encryption Context 검증│
   └──────────┬───────────────┘
              ▼
            [허용/거부]
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Key Policy는 모든 KMS 요청의 기준** — IAM 권한 있어도 Key Policy 허용 없으면 불가
2. ⭐ **삭제 대기 기간 7~30일** — 즉시 삭제 불가. 복호화 영구 불가 위험
3. ⭐ **Envelope Encryption** — KMS는 4KB까지만, 큰 데이터는 DEK
4. ⭐ **Multi-Region Key** — Cross-Region DR/복제 시 유일한 옵션
5. ⭐ **CloudHSM = FIPS 140-2 L3 + 단독 HSM** (규제 산업)

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. Customer Managed Key 생성
KEY_ID=$(aws kms create-key \
  --description "MyApp Encryption Key" \
  --key-usage ENCRYPT_DECRYPT \
  --key-spec SYMMETRIC_DEFAULT \
  --query 'KeyMetadata.KeyId' --output text)

aws kms create-alias \
  --alias-name alias/myapp \
  --target-key-id $KEY_ID

# 2. 자동 회전 활성화
aws kms enable-key-rotation --key-id $KEY_ID

# 3. Key Policy 업데이트 (Cross-Account 허용)
cat > key-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::123456789012:root"},
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow CrossAccount Decrypt",
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::222233334444:role/BackupReader"},
      "Action": ["kms:Decrypt", "kms:DescribeKey"],
      "Resource": "*"
    }
  ]
}
EOF

aws kms put-key-policy \
  --key-id $KEY_ID \
  --policy-name default \
  --policy file://key-policy.json

# 4. Envelope Encryption 직접 (실무 패턴)
# Data Key 생성
DEK_RESPONSE=$(aws kms generate-data-key \
  --key-id alias/myapp \
  --key-spec AES_256 \
  --encryption-context "Project=MyApp")

echo $DEK_RESPONSE | jq -r '.Plaintext' | base64 -d > /tmp/plain-dek
echo $DEK_RESPONSE | jq -r '.CiphertextBlob' | base64 -d > /tmp/cipher-dek

# 로컬 OpenSSL로 데이터 암호화 (DEK 사용)
openssl enc -aes-256-cbc -in data.txt -out data.enc -pass file:/tmp/plain-dek

# 5. Grant 생성 (Lambda에 임시 권한)
aws kms create-grant \
  --key-id alias/myapp \
  --grantee-principal "arn:aws:iam::123:role/MyLambda" \
  --operations "Decrypt" "GenerateDataKey" \
  --constraints 'EncryptionContextEquals={Project=MyApp}'

# 6. Multi-Region Key 생성
PRIMARY_KEY=$(aws kms create-key \
  --multi-region \
  --description "Multi-Region Key for DR" \
  --query 'KeyMetadata.KeyId' --output text)

# 다른 리전에 복제
aws kms replicate-key \
  --key-id $PRIMARY_KEY \
  --replica-region us-east-1

# 7. 키 삭제 (대기 기간 설정)
aws kms schedule-key-deletion \
  --key-id $KEY_ID \
  --pending-window-in-days 30

# 취소
aws kms cancel-key-deletion --key-id $KEY_ID

# 8. 키 사용 감사 (CloudTrail)
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=$KEY_ID \
  --max-items 50
```

---

## 📝 연습 문제

**문제 1.** IAM 사용자가 KMS Key를 사용하려는데 거부됐다. IAM 정책에는 `kms:*` 허용. 가능한 원인은?

A) MFA
B) Key Policy에 해당 사용자/계정에 대한 명시적 Allow 없음 — KMS만의 특이점
C) 리전
D) 네트워크

**정답: B**
해설: KMS는 Key Policy가 1순위. 기본 Key Policy의 `arn:aws:iam::<account>:root` Allow가 없으면 IAM 권한 무의미. Resource-based Policy처럼 동작.

---

**문제 2.** 큰 파일(1GB)을 KMS로 암호화하려는데 4KB 한도 에러가 발생한다. 해결책은?

A) 파일 분할
B) Envelope Encryption — GenerateDataKey로 DEK 받고, DEK로 파일 암호화, Cipher DEK 함께 저장
C) S3 직접
D) DynamoDB

**정답: B**
해설: KMS의 표준 사용법. KMS는 작은 데이터만 직접. 큰 데이터는 DEK + 로컬 암호화 + 마스터 키로 DEK 보호.

---

**문제 3.** 회사가 KMS Key 삭제를 시도했는데 "Pending Deletion" 상태로 7일 후 삭제 예약됐다. 그 동안 이 키를 다시 사용할 수 있나?

A) 가능
B) 불가능 — Pending Deletion 동안 키 비활성. 삭제 취소(`cancel-key-deletion`) 필요
C) 자동 부활
D) 30일 후 자동 복구

**정답: B**
해설: Pending Deletion 동안 키는 비활성 → 새 암/복호화 불가. 취소하려면 명시적 cancel 명령. 완전 삭제 후엔 영구 복호화 불가.

---

**문제 4.** Global DynamoDB Table을 멀티 리전에서 같은 KMS 키로 암/복호화하려 한다. 어떤 KMS 키?

A) 일반 Customer Managed Key
B) Multi-Region Key — 여러 리전에 복제 가능
C) AWS Managed Key
D) CloudHSM

**정답: B**
해설: 일반 KMS Key는 리전 종속. Multi-Region Key가 Global Table·Cross-Region Backup 같은 멀티 리전 시나리오에 유일한 해법.

---

**문제 5.** 회사가 PCI-DSS 요건으로 키를 자사가 완전히 통제하고 외부로 절대 나가지 않게 하려 한다. 어떤 도구?

A) KMS
B) CloudHSM — FIPS 140-2 L3, 고객 단독 HSM, 100% 제어
C) Parameter Store
D) Secrets Manager

**정답: B**
해설: CloudHSM은 단독 HSM 인스턴스, FIPS L3, 고객이 키 완전 통제. KMS는 AWS 공유 인프라(HSM 자체는 L3이지만 멀티 테넌트). 규제 산업 BYOK에 사용.

---

## 📌 오늘의 요약

1. KMS Key 종류: AWS Owned(공유) / AWS Managed(자동) / Customer Managed(완전 제어, $1/월)
2. Envelope Encryption: KMS는 4KB까지, 큰 데이터는 DEK + 로컬 암호화
3. Key Policy가 1순위 — IAM 권한 있어도 Key Policy 명시 없으면 거부
4. 삭제 대기 7~30일 + 영구 복호화 불가 위험 — 신중히
5. Multi-Region Key(DR) / Grant(임시 위임) / CloudHSM(규제 산업) 구분
