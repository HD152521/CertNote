# Day 4 - Parameter Store + Secrets Manager 자동 회전

📅 날짜: Week 9 (Day 4)
🎯 주제: 시크릿·구성의 안전한 저장 + 회전 자동화
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Parameter Store와 Secrets Manager 비용·기능 비교 (재정리)
- Secrets Manager Rotation Lambda 패턴 (Single/Multi-User)
- Cross-Account 시크릿 공유 패턴
- KMS Customer Managed Key 운영

---

## 🧩 사전 지식 (CS 기초)

- **Credential rotation**: 자격 증명 주기적 교체. 노출 영향 최소화.
- **Zero-downtime rotation**: 다운타임 없는 회전 (alternating users).
- **Envelope encryption**: 데이터 키 + 마스터 키. KMS의 기본.
- **KMS Grant**: 임시 키 사용 권한.

---

## 📖 이론 내용

### 1. 비용·기능 재정리

| 항목 | Parameter Store Standard | Parameter Store Advanced | Secrets Manager |
|------|--------------------------|---------------------------|-----------------|
| 크기 한도 | 4KB | 8KB | 64KB |
| 시크릿당 월 비용 | 무료 | $0.05 | $0.40 |
| API 호출 비용 | 무료 (제한적 throttle) | $0.05/10000 | $0.05/10000 |
| 자동 회전 | ❌ | ❌ | ✅ |
| 정책 (Resource Policy) | ❌ | ✅ | ✅ |
| TTL/Expiration | ❌ | ✅ | ✅ (정책 가능) |
| KMS 암호화 | SecureString | SecureString | 항상 |
| 버전 관리 | ✅ (Standard도) | ✅ | ✅ (AWSCURRENT 등) |
| 사용 사례 | DB host, 환경 플래그 | 큰 구성, TTL 필요 | DB 비번, API 키, 회전 필요 |

### 2. Secrets Manager Rotation

**Single User:**
1. AWSPENDING 라벨로 새 비번 생성
2. 외부 시스템(DB)의 같은 사용자 비번 교체
3. 검증 (테스트 연결)
4. AWSCURRENT 라벨 교체 (구버전 → AWSPREVIOUS)

**Multi-User (Alternating):**
- 두 DB 사용자 alpha, beta
- AWSCURRENT가 alpha → 회전 시 beta의 비번 교체 + AWSCURRENT를 beta로 전환
- 다음 회전 시 alpha 다시 사용
- **Zero-downtime** (alpha 사용 중이라도 새 연결은 beta로)

**Rotation Lambda Template:**
AWS가 RDS PostgreSQL/MySQL, Redshift, DocumentDB용 표준 템플릿 제공:
- `SecretsManagerRDSPostgreSQLRotationSingleUser`
- `SecretsManagerRDSMySQLRotationMultiUser`
- ...

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/myapp-rds \
  --rotation-lambda-arn arn:aws:lambda:...:function:SecretsManagerRDSPostgreSQLRotationSingleUser \
  --rotation-rules AutomaticallyAfterDays=30
```

### 3. RDS와 통합된 시크릿 자동 관리

```bash
aws rds create-db-instance \
  --db-instance-identifier prod-db \
  --engine postgres \
  --manage-master-user-password \
  --master-user-secret-kms-key-id alias/rds-secrets
```

`--manage-master-user-password` 플래그가:
- Secrets Manager에 자동 시크릿 생성
- 7일마다 자동 회전
- IAM Role 자동 구성

### 4. Cross-Account 시크릿 공유

**소유 계정 — Resource Policy:**
```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::CONSUMER-ACCT:role/AppRole"},
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*"
  }]
}
```

**소유 계정 — KMS Key Policy:**
```json
{
  "Sid": "AllowConsumer",
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::CONSUMER-ACCT:role/AppRole"},
  "Action": ["kms:Decrypt","kms:DescribeKey"],
  "Resource": "*"
}
```

**소비자 계정 — IAM:**
```json
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "arn:aws:secretsmanager:ap-northeast-2:OWNER:secret:shared/api-key-*"
}
```

> ⚠️ 시크릿이 **기본 KMS 키(`alias/aws/secretsmanager`)로 암호화**됐다면 Cross-Account 불가 — Customer Managed Key 필수.

### 5. Cross-Region Replication

```bash
aws secretsmanager replicate-secret-to-regions \
  --secret-id prod/myapp \
  --add-replica-regions Region=us-east-1,KmsKeyId=alias/secrets-use1
```

DR + 글로벌 앱.

### 6. Parameter Store Hierarchical Naming

```
/myapp/prod/db-host
/myapp/prod/db-port
/myapp/staging/db-host
/myapp/staging/db-port
```

```bash
# Path 기반 조회
aws ssm get-parameters-by-path --path /myapp/prod --recursive --with-decryption

# IAM 권한도 Path 단위
"Resource": "arn:aws:ssm:*:*:parameter/myapp/prod/*"
```

### 7. Secret 값에 JSON 사용

```json
{
  "username": "admin",
  "password": "supersecret",
  "host": "db.example.com",
  "port": 5432,
  "engine": "postgres",
  "dbname": "myapp"
}
```

buildspec에서:
```yaml
env:
  secrets-manager:
    DB_HOST: prod/db:host       # JSON 키 명시
    DB_PASS: prod/db:password
    DB_NAME: prod/db:dbname
```

---

## 🧠 알아두면 좋은 심화 이론

### KMS Key Policy vs IAM Policy

KMS 키는 **두 정책 모두 허용**해야 함:
- 키 자체의 Resource Policy
- 사용자의 IAM Policy

> ⚠️ AWS 관리형 키(`aws/secretsmanager`)는 Key Policy 수정 불가 → Cross-Account 불가능. CMK 필수.

### Rotation Lambda VPC

DB가 Private 서브넷에 있으면 Rotation Lambda도 VPC 모드 + Private 서브넷 + NAT/Endpoint 필요.

### Cache Lambda Extension

`AWS Parameters and Secrets Lambda Extension`:
- Parameter Store + Secrets Manager 통합 캐시
- 환경 변수로 캐시 TTL 조절
- `GET http://localhost:2773/secretsmanager/get?secretId=...`

### 비용 최적화 시나리오

- 100개 단순 설정 + 5개 회전 비밀번호
- 단순 설정 → Parameter Store Standard (무료)
- 비밀번호 → Secrets Manager ($0.40 × 5 = $2/월)
- 모두 Secrets Manager 시 $42/월

### IAM 인증 (DB)

Secrets Manager 회전 대신 RDS IAM 인증 사용:
- IAM Role의 단기 토큰으로 DB 접속 (15분 유효)
- 비밀번호 자체 없음
- Lambda/EC2 Role에 `rds-db:connect` 권한
- 한계: 일부 DB 엔진/대규모 연결에 제약

### 관련 서비스 Cross-Reference

- **CodeBuild 시크릿 주입** → Week 3 Day 3
- **Lambda Extension** → Week 7 Day 2
- **ECS Task secrets** → Week 6 Day 2
- **KMS Multi-Region Key** → Week 13 Day 2

---

## 🏗️ 아키텍처 다이어그램

```
Secret Management End-to-End
==================================================

  Build/Runtime
   ├─ CodeBuild env.secrets-manager: prod/db:password
   ├─ Lambda Extension: localhost:2773/secretsmanager/get
   └─ ECS Task Definition secrets[]: valueFrom=arn:...secret:prod/db:password::

  Storage
   ├─ Parameter Store /myapp/prod/db-host (Standard, free)
   ├─ Parameter Store /myapp/prod/log-level (Standard)
   └─ Secrets Manager prod/db (rotates every 30d)
        ├─ KMS CMK alias/myapp-secrets
        ├─ Rotation Lambda (alternating users)
        └─ Cross-Region replica us-east-1

  Cross-Account share
   Resource Policy + KMS Key Policy grants consumer account
   Consumer IAM allows GetSecretValue + Decrypt
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ Secrets Manager = 자동 회전, Parameter Store = 단순/저비용
2. ⭐ Multi-User Rotation으로 zero-downtime 회전
3. ⭐ Cross-Account 시크릿은 **CMK 필수** (관리형 키 불가)
4. ⭐ KMS는 Key Policy + IAM Policy 양쪽 허용 필요
5. ⭐ RDS `--manage-master-user-password` 옵션으로 자동 시크릿 + 회전

---

## 💻 실제 예시 - 전체 자동화

```bash
# 1) CMK + Secret 생성
aws kms create-key --description "myapp secrets" --tags TagKey=Project,TagValue=myapp
aws kms create-alias --alias-name alias/myapp-secrets --target-key-id KEY_ID

aws secretsmanager create-secret \
  --name prod/myapp-rds \
  --kms-key-id alias/myapp-secrets \
  --secret-string '{"username":"alpha","password":"initial","engine":"postgres","host":"...","port":5432,"dbname":"myapp"}'

# 2) Multi-User Rotation
aws secretsmanager rotate-secret \
  --secret-id prod/myapp-rds \
  --rotation-rules AutomaticallyAfterDays=30 \
  --rotation-lambda-arn arn:aws:lambda:...:function:SecretsManagerRDSPostgreSQLRotationMultiUser

# 3) Cross-Account 공유 (KMS Key Policy + Resource Policy)
aws secretsmanager put-resource-policy \
  --secret-id prod/myapp-rds \
  --resource-policy '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::CONSUMER:role/AppRole"},
      "Action":"secretsmanager:GetSecretValue",
      "Resource":"*"
    }]
  }'

# 4) Lambda Extension 사용
# Layer: arn:aws:lambda:ap-northeast-2:738900069198:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11
```

---

## 📝 연습 문제

**문제 1.** RDS DB 비밀번호를 30일마다 zero-downtime 회전하려면?

A) Secrets Manager + Multi-User Rotation Lambda
B) Parameter Store SecureString
C) Single User Rotation
D) IAM 인증

**정답: A**
해설: Multi-User가 zero-downtime의 표준.

---

**문제 2.** Cross-Account에서 다른 계정의 시크릿을 사용하려면 필수가 아닌 것은?

A) Resource Policy
B) KMS CMK (관리형 키는 Key Policy 수정 불가)
C) 소비자 계정 IAM 권한
D) VPC Peering

**정답: D**
해설: VPC 불필요. 정책만 정확하면 됨.

---

**문제 3.** Parameter Store SecureString을 CMK로 암호화한 시크릿을 CodeBuild에서 사용하려면 IAM에 필요한 것은?

A) ssm:GetParameter
B) ssm:GetParameter + kms:Decrypt
C) kms:Decrypt만
D) secretsmanager:GetSecretValue

**정답: B**
해설: 두 권한 모두 필요. 가장 흔한 함정.

---

**문제 4.** 100개 설정값 + 5개 비밀번호의 비용 최적화는?

A) 모두 Secrets Manager
B) Parameter Store Standard 100개 + Secrets Manager 5개
C) 모두 Parameter Store Advanced
D) S3 객체

**정답: B**
해설: 회전 필요한 것만 Secrets Manager.

---

**문제 5.** RDS `--manage-master-user-password`의 효과는?

A) IAM Role 생성
B) Secrets Manager 자동 시크릿 + 7일 자동 회전 + 통합 관리
C) VPC 자동 생성
D) Snapshot 활성

**정답: B**
해설: RDS-Secrets Manager 네이티브 통합.

---

**문제 6.** Secrets Manager 회전 라벨 3종은?

A) AWSCURRENT / AWSPENDING / AWSPREVIOUS
B) v1 / v2 / v3
C) PROD / STAGING / DEV
D) LATEST / PREVIOUS / PENDING

**정답: A**
해설: AWS 표준 라벨.

---

**문제 7.** Lambda Extension 사용 이점이 아닌 것은?

A) 캐시로 API 호출 감소
B) 단일 함수 인스턴스 내 공유
C) Cold start 단축
D) API 호출 가속

**정답: C**
해설: Extension이 cold start 단축은 아님 — 호출 빈도/비용 감소.

---

## 📌 오늘의 요약

1. Secrets Manager(회전) vs Parameter Store(단순/저비용)
2. Multi-User Rotation으로 zero-downtime 회전
3. Cross-Account 시크릿은 CMK 필수 + Resource Policy + KMS Key Policy
4. RDS `--manage-master-user-password`로 통합 관리
5. Lambda Extension으로 캐시 + 호출 비용 절감
