# Day 41 - KMS: 키 관리 서비스

📅 날짜: 2026년 7월 12일 (일요일)  
🎯 주제: AWS Key Management Service  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- KMS의 키 유형과 키 관리 방법을 이해한다
- Envelope Encryption 개념을 파악한다
- KMS API 호출 패턴을 학습한다

---

## 📖 이론 내용

### 1. AWS KMS란?

AWS 서비스의 암호화 키를 생성하고 관리하는 완전 관리형 서비스입니다.

**KMS 키 유형:**
- **AWS Managed Key**: AWS 서비스가 자동 생성/관리, 무료 (예: aws/s3, aws/rds)
- **Customer Managed Key (CMK)**: 고객이 생성/관리, 월 $1
- **AWS Owned Key**: AWS가 소유, 고객에게 보이지 않음

**키 사양:**
- 대칭: AES-256 (가장 일반적)
- 비대칭: RSA, ECC (디지털 서명 등)

### 2. KMS 핵심 API

```python
import boto3

kms = boto3.client('kms')

# 데이터 암호화 (최대 4KB)
response = kms.encrypt(
    KeyId='arn:aws:kms:ap-northeast-2:123456789:key/key-id',
    Plaintext=b'Hello World'
)
ciphertext = response['CiphertextBlob']

# 데이터 복호화
response = kms.decrypt(
    CiphertextBlob=ciphertext
)
plaintext = response['Plaintext']

# 데이터 키 생성 (Envelope Encryption)
response = kms.generate_data_key(
    KeyId='arn:aws:kms:ap-northeast-2:123456789:key/key-id',
    KeySpec='AES_256'
)
plaintext_key = response['Plaintext']      # 암호화에 사용 후 메모리에서 삭제
encrypted_key = response['CiphertextBlob'] # 저장
```

### 3. Envelope Encryption (봉투 암호화)

KMS의 4KB 제한을 넘는 데이터 암호화 방법:

```
봉투 암호화 흐름
================================

[암호화]
1. KMS에서 데이터 키 생성 (GenerateDataKey)
   → 평문 데이터 키 + 암호화된 데이터 키 반환
2. 평문 데이터 키로 실제 데이터 암호화 (로컬)
3. 평문 데이터 키 메모리에서 삭제
4. 암호화된 데이터 + 암호화된 데이터 키 저장

[복호화]
1. 암호화된 데이터 키를 KMS로 복호화
2. 복호화된 데이터 키로 실제 데이터 복호화 (로컬)
3. 데이터 키 삭제
```

**장점:**
- 대용량 데이터 암호화 가능
- KMS API 호출 최소화 (비용 절감)
- 네트워크 트래픽 감소

### 4. KMS 키 정책

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789:root"
      },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow Lambda to use key",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::123456789:role/LambdaRole"
      },
      "Action": [
        "kms:Decrypt",
        "kms:GenerateDataKey"
      ],
      "Resource": "*"
    }
  ]
}
```

### 5. KMS 로테이션

```bash
# 자동 키 로테이션 활성화 (1년마다)
aws kms enable-key-rotation --key-id key-id

# 수동 로테이션 확인
aws kms get-key-rotation-status --key-id key-id
```

**AWS Managed Key**: 자동 로테이션 (3년마다)  
**Customer Managed Key**: 수동 또는 자동 로테이션 설정 가능

---

## 🧠 알아두면 좋은 심화 이론

### KMS Key 유형 정확히 (시험 함정 다수)

| 유형 | 가격 | 키 정책 제어 | 자동 회전 |
|------|------|--------------|-----------|
| **AWS Owned Key** | 무료 | ❌ 보이지 않음 | AWS 관리 |
| **AWS Managed Key** (`aws/<service>`) | 무료 | 보기만 가능, 수정 X | 자동 (1년 / 변경됨) |
| **Customer Managed Key** | $1/월 + API 호출 | 완전 제어 | 옵션 (1년 자동) |
| **Imported Key Material** | $1/월 | 일부 제어 | 불가 (재가져오기) |
| **CloudHSM Key Store** | 별도 | 완전 제어 | - |

> ⚠️ **2022년 변경**: AWS Managed Key의 자동 회전 주기가 **365일**로 변경됨 (이전 1095일/3년). 시험에 옛 자료의 "3년"은 더 이상 정답 아님.

### 키 사양 (Key Spec) - 시험에 출제

| Key Spec | 대칭/비대칭 | 용도 |
|----------|------------|------|
| `SYMMETRIC_DEFAULT` (AES-256) | 대칭 | 일반 암호화 (가장 일반적) |
| `RSA_2048`, `RSA_3072`, `RSA_4096` | 비대칭 | 암호화·서명·검증 |
| `ECC_NIST_P256`, `ECC_NIST_P384` | 비대칭 | 서명·검증 (암호화 불가) |
| `HMAC_*` | HMAC | MAC 생성·검증 (2022~) |
| `SM2` | 비대칭 (중국 표준) | 중국 리전 |

### Multi-Region Keys (시험 신규)

- 같은 키 ID로 여러 리전에서 사용 → 복호화 호환
- 사용: S3 CRR, DynamoDB Global Tables, Global Active-Active
- 일반 키는 리전에 종속 → 다른 리전에서 복호화 불가

### Key Policy + IAM + Grant (3-Way 권한 모델)

```
Key Policy (필수, 키 자체에 부착)
  ↓
IAM Policy (별도 권한)
  ↓
Grant (API로 임시 권한 부여, 일회용)
```

> ⚠️ **함정**: Key Policy에 IAM root principal 허용 statement가 **없으면** IAM 권한이 효력 없음. 기본 키 정책에는 들어있지만, 커스텀 정책 만들 때 빠뜨리기 쉬움.

### KMS Grant (시험 가끔 출제)

- 임시·제한된 권한 (Lambda 함수가 다른 사용자 대신 일시 키 사용)
- `CreateGrant` API
- Key Policy 수정 없이 권한 부여
- 사용 사례: ENI 생성 시 KMS Grant (EC2 자동)

### KMS API Quota (시험 함정)

- 키당 **5,500~30,000 RPS** (리전·키 타입에 따라)
- 초과 시 throttling
- 대응: **S3 Bucket Key**, **DAX/캐싱**, **Envelope Encryption**

### 봉투 암호화 - 상세 흐름 (시험 시나리오 자주)

```
[암호화]
1. GenerateDataKey(KeyId, Spec=AES_256)
   → 응답: Plaintext (DEK), CiphertextBlob (암호화된 DEK)
2. Plaintext DEK로 로컬에서 데이터 암호화
3. Plaintext DEK 메모리 wipe
4. 저장: [암호화된 데이터 + 암호화된 DEK]

[복호화]
1. 저장된 암호화된 DEK를 Decrypt 호출
   → Plaintext DEK 반환
2. Plaintext DEK로 로컬 데이터 복호화
3. Plaintext DEK 즉시 삭제
```

### Encryption SDK (AWS Encryption SDK) - 시험에 가끔

- 라이브러리로 봉투 암호화 자동 처리
- 메시지 포맷 표준화 (헤더에 암호화된 DEK 포함)
- Java, Python, C, JavaScript 지원

### Key Aliases (시험에 가끔)

```
alias/myapp/prod  → arn:aws:kms:...:key/abc-123
```

- 가독성 + 키 교체 시 코드 변경 X
- 한 키에 여러 alias 가능
- AWS 서비스 키는 `alias/aws/<service>` (예: `alias/aws/s3`)

### KMS 삭제 (소프트 삭제)

- `ScheduleKeyDeletion` → 7~30일 후 삭제 (대기 기간)
- 대기 중 취소 가능
- 즉시 삭제 불가 (실수 방지)

### CloudHSM vs KMS (시험 가끔 출제)

| 항목 | KMS | CloudHSM |
|------|-----|----------|
| 관리 수준 | 완전 관리형 | 고객 관리 |
| 키 격리 | 멀티 테넌트 (논리적) | 싱글 테넌트 (전용 HW) |
| 표준 | FIPS 140-2 Level 2-3 | **FIPS 140-2 Level 3** |
| API | AWS SDK | PKCS#11, JCE, KSP |
| 비용 | 키당 $1 + API | 인스턴스당 ~$1.45/h |
| 사용 | 일반 | 규제 강한 산업 (금융, 정부) |

### 관련 서비스 Cross-Reference

- **봉투 암호화 ↔ S3, EBS, RDS** → 모든 AWS 저장 암호화의 표준
- **S3 Bucket Key** → [Week 5 Day 3] KMS 비용 99% 절감
- **CRR + Multi-Region Key** → [Week 5 Day 2]
- **DynamoDB ↔ KMS** → 기본적으로 AWS owned key, CMK도 선택 가능

---

## 아키텍처 다이어그램

```
KMS Envelope Encryption 흐름
================================

[애플리케이션]
     |
     | 1. GenerateDataKey 요청
     v
[KMS]
     |
     | 2. 평문 DEK + 암호화된 DEK 반환
     v
[애플리케이션]
     |
     | 3. 평문 DEK로 데이터 암호화 (로컬)
     |    평문 DEK 메모리에서 삭제
     |
     | 4. 암호화된 데이터 + 암호화된 DEK 저장
     v
[S3 / DynamoDB / 기타 스토리지]

복호화 시:
  암호화된 DEK → KMS Decrypt → 평문 DEK → 데이터 복호화
```

---

## ⭐ 핵심 포인트

1. ⭐ **KMS 직접 암호화**: 최대 4KB 제한
2. ⭐ **Envelope Encryption**: 4KB 초과 데이터, GenerateDataKey 사용
3. ⭐ **CMK**: 고객 관리 키, 키 정책으로 세밀한 제어
4. ⭐ **키 로테이션**: AWS Managed는 자동(3년), CMK는 설정 가능(1년)
5. ⭐ **키 정책 필수**: KMS 키에 IAM 정책만으로는 접근 불가, 키 정책 필요

---

## 📝 연습 문제

**문제 1.** 10MB 파일을 KMS로 암호화하는 올바른 방법은?

A) kms:Encrypt API 직접 사용  
B) Envelope Encryption (GenerateDataKey)  
C) S3 서버 측 암호화  
D) 불가능  

**정답: B** - KMS 직접 암호화는 최대 4KB까지만 가능합니다. 10MB 파일은 Envelope Encryption을 사용해야 합니다.

---

**문제 2.** Envelope Encryption에서 평문 데이터 키는 언제 삭제해야 하는가?

A) 데이터를 S3에 저장한 후  
B) 데이터 암호화 직후 메모리에서 삭제  
C) 애플리케이션 종료 시  
D) 삭제할 필요 없음  

**정답: B** - 평문 데이터 키는 데이터를 암호화한 후 즉시 메모리에서 삭제해야 합니다.

---

**문제 3.** Customer Managed Key의 특징은?

A) 무료, AWS가 자동 관리  
B) 월 $1, 고객이 생성/관리, 키 정책 제어  
C) 완전히 사용자 하드웨어에 저장  
D) 자동으로 매월 로테이션  

**정답: B** - CMK는 월 $1이며 고객이 생성/관리하고 키 정책으로 세밀하게 제어할 수 있습니다.

---

**문제 4.** KMS 키에 접근하기 위한 필수 조건은?

A) IAM 정책만으로 충분  
B) 키 정책 + IAM 정책 모두 필요  
C) 키 정책만으로 충분  
D) VPC 엔드포인트 필요  

**정답: B** - KMS 키에 접근하려면 키 정책에서 허용하고 IAM 정책에서도 허용해야 합니다.

---

**문제 5.** AWS Managed Key의 자동 로테이션 주기는?

A) 1년  
B) 2년  
C) 3년  
D) 5년  

**정답: C** - AWS Managed Key는 3년마다 자동으로 로테이션됩니다.

---

## 📌 오늘의 요약

1. KMS: 완전 관리형 키 관리, AWS Managed / Customer Managed 키
2. 직접 암호화: 최대 4KB, KMS API 직접 호출
3. Envelope Encryption: 4KB 초과 데이터, 데이터 키로 로컬 암호화
4. 키 정책: KMS 접근에 필수, IAM 정책과 함께 사용
5. 키 로테이션: AWS Managed 3년 자동, CMK 1년 자동 설정 가능
