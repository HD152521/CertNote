# Day 2 - Secrets Manager 운영 (자동 회전, Cross-Region Replication)

📅 날짜: Week 9 (Day 2)
🎯 주제: 시크릿 자동 회전과 멀티 리전 운영
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Secrets Manager의 자동 회전 동작과 Lambda Hook을 이해한다
- Cross-Region Replication과 Cross-Account 공유를 구성한다
- Parameter Store와의 비교에서 Secrets Manager를 선택해야 할 시점을 안다

---

## 🧩 사전 지식 (CS 기초)

- **Secret rotation**: 주기적으로 비밀번호/키를 교체. 손상 시 영향 최소화
- **Dual phase rotation**: 새 비밀 적용 + 구 비밀 무효화 두 단계
- **Replication lag**: 복제 지연 — 멀티 리전 동기화 시간
- **Resource policy**: 리소스에 붙는 권한 정책 (S3 버킷 정책처럼)

---

## 📖 이론 내용

### 1. Secrets Manager 핵심

#### 비용
- 시크릿당 월 $0.40
- API 호출 10K당 $0.05
- Parameter Store보다 비쌈 — 자동 회전이 필요할 때만

#### 저장 가능한 시크릿
- DB 자격증명 (RDS, Redshift, DocumentDB)
- API 키
- OAuth 토큰
- 어떤 텍스트도 가능 (key-value JSON 또는 plain)

#### 암호화
- KMS Key로 자동 암호화
- 기본 `aws/secretsmanager` 키 또는 Customer Managed Key

### 2. Secret 버전 관리

#### Versioning
- 같은 시크릿의 여러 버전 보존
- VersionStage 라벨로 식별: `AWSCURRENT`, `AWSPREVIOUS`, `AWSPENDING`

#### 회전 시 라벨 흐름
```
[회전 시작]
AWSCURRENT  v1 → v1 (현재)
                    ↓
AWSPENDING  -   → v2 (새 시크릿, 검증 중)

[회전 완료 후]
AWSCURRENT  -   → v2 (새 시크릿)
AWSPREVIOUS v1 → v1 (직전)
AWSPENDING  -   (제거)
```

### 3. 자동 회전

#### RDS/Aurora/DocumentDB/Redshift
- AWS 제공 회전 Lambda 사용
- 기본 회전 주기: 30~365일

#### 다른 시크릿 (Custom Rotation)
- 사용자 정의 Lambda 작성
- 4단계 호출:
  1. **createSecret**: 새 시크릿 생성
  2. **setSecret**: 새 시크릿을 시스템에 적용
  3. **testSecret**: 새 시크릿으로 정상 동작 검증
  4. **finishSecret**: AWSCURRENT를 새 버전으로 이동

#### 회전 전략

| 전략 | 동작 | 사용 사례 |
|------|------|-----------|
| **Single user** | 한 사용자 비밀번호만 회전 | 단순 |
| **Alternating users** | 두 사용자 번갈아 회전 | 무중단 (한쪽 사용 중에 다른쪽 회전) |

### 4. Cross-Region Replication

#### 동작
- Primary Region의 시크릿을 다른 리전에 자동 복제
- Replica는 읽기 전용
- 회전은 Primary에서만 → 자동으로 Replica 업데이트

#### 사용 사례
- Multi-Region 애플리케이션
- DR 대비 (Primary 리전 다운 시 Replica 사용)
- 지역별 지연 최소화

```bash
aws secretsmanager replicate-secret-to-regions \
  --secret-id my-secret \
  --add-replica-regions Region=us-east-1,KmsKeyId=alias/my-key
```

### 5. Cross-Account Access

#### Resource Policy
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::222233334444:role/ReadOnlyRole"},
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*"
  }]
}
```
- Source 계정의 Secret + Resource Policy
- Destination 계정의 IAM Role + 정책
- KMS Key Policy도 함께 (암호화된 경우)

### 6. Parameter Store vs Secrets Manager

| 항목 | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| 비용 | Standard 무료, Advanced $0.05/월 | $0.40/시크릿/월 |
| 값 크기 | 4KB/8KB | 64KB |
| 자동 회전 | X | O (RDS 등 통합) |
| Cross-Region 복제 | X | O |
| 버전 관리 | O (자동) | O (라벨) |
| 사용 사례 | 일반 설정·단순 시크릿 | DB 자격증명, OAuth |

#### 선택 기준
- 자동 회전 필요 → **Secrets Manager**
- Cross-Region 복제 필요 → **Secrets Manager**
- 일반 설정·단순 시크릿 → **Parameter Store**
- 둘 다 활용도 흔함 (혼합 사용)

### 7. 통합 사용 패턴

#### Lambda에서 시크릿 사용
```python
import boto3
import json
from botocore.exceptions import ClientError

def get_secret(secret_name):
    client = boto3.client('secretsmanager')
    try:
        response = client.get_secret_value(SecretId=secret_name)
        return json.loads(response['SecretString'])
    except ClientError as e:
        raise e

# Lambda Extension 사용 시 캐싱 + 자동 새로 고침
# 환경 변수 PARAMETERS_SECRETS_EXTENSION_HTTP_PORT=2773 등
```

#### Lambda Extension - Cache + 자동 새로 고침
- Lambda Layer로 통합
- 시크릿을 인메모리 캐싱 → 매 호출마다 API 호출 X
- TTL 후 자동 새로 고침 → 회전된 시크릿 반영

#### CloudFormation 동적 참조
```yaml
DatabasePassword:
  Type: String
  Default: '{{resolve:secretsmanager:my-db-secret:SecretString:password}}'
```

### 8. RDS 통합 자동 회전 예시

```bash
# RDS에 연결된 시크릿 생성 + 회전 설정
aws secretsmanager create-secret \
  --name "rds-prod-db-master" \
  --description "Prod DB master credentials" \
  --secret-string '{"username":"admin","password":"Init1!","engine":"mysql","host":"prod-db.xyz.amazonaws.com","port":3306,"dbInstanceIdentifier":"prod-db"}' \
  --kms-key-id alias/my-key

# 회전 활성화 (AWS 제공 Lambda Single User 전략)
aws secretsmanager rotate-secret \
  --secret-id rds-prod-db-master \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:123:function:SecretsManagerRDSMySQLRotationSingleUser \
  --rotation-rules AutomaticallyAfterDays=30
```

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **Secret Recovery** | 7~30일 대기 후 삭제 | KMS 키와 비슷 |
| **Force Delete** | `--force-delete-without-recovery` | 위험, 운영 금지 |
| **Tagging** | 태그 기반 권한 (ABAC) | 멀티 팀 운영 |
| **Resource Policy + IAM** | 둘 다 필요 (Cross-Account) | 흔한 함정 |
| **PowerTools Lambda Layer** | 시크릿 캐싱 라이브러리 | 성능 |

> ⚠️ **함정 1**: Secrets Manager 시크릿 삭제는 7~30일 대기 (`--recovery-window-in-days`). 즉시 삭제는 옵션이지만 위험.
>
> ⚠️ **함정 2**: Cross-Region Replica는 읽기 전용. 쓰기/회전은 Primary에서만.
>
> 💡 **암기 팁**: 자동 회전 + Cross-Region = Secrets Manager. 그 외 = Parameter Store가 저렴.

### 관련 서비스 Cross-Reference

- **Secrets Manager → Week 5 Parameter Store** (비교)
- **Secrets Manager → Week 9 Day 1 KMS** (암호화 키)
- **Secrets Manager → Week 10** (Multi-Region DR)
- **Secrets Manager → RDS Day** (자동 회전 통합)

---

## 🏗️ 아키텍처 다이어그램

```
RDS Secret 자동 회전
==========================================================

   [Scheduled (매 30일)]
       │
       ▼
   ┌──────────────────────────────┐
   │  Secrets Manager Lambda      │
   │  (AWS 제공: RDS Single User) │
   └──────┬───────────────────────┘
          │
          ▼ 4단계
   1. createSecret
      └─ 새 비밀번호 생성 → AWSPENDING
   2. setSecret
      └─ RDS에 새 비밀번호 적용
   3. testSecret
      └─ 새 비밀번호로 연결 검증
   4. finishSecret
      └─ AWSCURRENT 라벨 새 버전으로 이동

   회전 중 앱:
   - 캐시된 시크릿 사용 (잠시 구 비밀번호)
   - 다음 fetch에서 새 비밀번호 받음
```

```
Cross-Region Replication
==========================================================

   [ap-northeast-2 - Primary]
   ┌──────────────────────┐
   │  Secret (master)     │
   │  - 회전 가능          │
   │  - 쓰기 가능          │
   └──────┬───────────────┘
          │ 자동 복제
   ┌──────┴────────┬──────────┐
   ▼               ▼          ▼
   [us-east-1]   [eu-west-1] [ap-southeast-1]
   Replica       Replica     Replica
   (읽기 전용)
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **Secrets Manager = 자동 회전 + Cross-Region** — 이게 필요하면 선택
2. ⭐ **RDS·Aurora·DocumentDB 자동 회전 Lambda는 AWS 제공** — 직접 작성 불필요
3. ⭐ **Custom Rotation 4단계**: createSecret → setSecret → testSecret → finishSecret
4. ⭐ **Replica는 읽기 전용** — 회전은 Primary에서만
5. ⭐ **Cross-Account는 Resource Policy + IAM Policy + KMS Key Policy** 모두 필요

---

## 💻 실제 예시 - AWS CLI

```bash
# 1. 시크릿 생성
aws secretsmanager create-secret \
  --name "prod/web/db-password" \
  --description "Prod DB master credentials" \
  --secret-string '{"username":"admin","password":"InitialPass!"}' \
  --kms-key-id alias/myapp \
  --tags 'Key=Environment,Value=prod'

# 2. 자동 회전 설정 (RDS 통합)
aws secretsmanager rotate-secret \
  --secret-id prod/web/db-password \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:123:function:SecretsManagerRDSMySQLRotationSingleUser \
  --rotation-rules AutomaticallyAfterDays=30

# 3. Cross-Region 복제
aws secretsmanager replicate-secret-to-regions \
  --secret-id prod/web/db-password \
  --add-replica-regions \
    Region=us-east-1,KmsKeyId=alias/myapp-replica \
    Region=eu-west-1,KmsKeyId=alias/myapp-replica

# 4. Cross-Account 접근 허용 (Resource Policy)
aws secretsmanager put-resource-policy \
  --secret-id prod/web/db-password \
  --resource-policy '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::222233334444:role/AppRole"},
      "Action":["secretsmanager:GetSecretValue","secretsmanager:DescribeSecret"],
      "Resource":"*"
    }]
  }'

# 5. 시크릿 조회
aws secretsmanager get-secret-value \
  --secret-id prod/web/db-password \
  --query 'SecretString' --output text | jq

# 특정 버전·라벨 조회
aws secretsmanager get-secret-value \
  --secret-id prod/web/db-password \
  --version-stage AWSPREVIOUS

# 6. 수동 회전 (즉시)
aws secretsmanager rotate-secret \
  --secret-id prod/web/db-password

# 7. 시크릿 삭제 (대기 기간)
aws secretsmanager delete-secret \
  --secret-id prod/web/db-password \
  --recovery-window-in-days 30

# 복구
aws secretsmanager restore-secret \
  --secret-id prod/web/db-password

# 8. 모든 시크릿의 회전 상태 (운영 점검)
aws secretsmanager list-secrets \
  --query 'SecretList[*].[Name,RotationEnabled,LastRotatedDate,RotationRules.AutomaticallyAfterDays]' \
  --output table
```

---

## 📝 연습 문제

**문제 1.** Lambda 함수가 매 호출마다 Secrets Manager에서 시크릿을 fetch 한다. 성능 저하 발생. 해결책은?

A) DynamoDB 캐싱
B) AWS Parameters and Secrets Lambda Extension - 인메모리 캐싱 + 자동 새로 고침
C) S3 캐싱
D) 환경 변수에 박기

**정답: B**
해설: Lambda Extension이 시크릿 캐싱 표준 패턴. TTL 후 자동 새로 고침 → 회전된 시크릿도 반영. 성능 + 보안 + 자동성.

---

**문제 2.** RDS 비밀번호 자동 회전을 30일마다 하려 한다. 가장 적합한 도구는?

A) Parameter Store
B) Secrets Manager + AWS 제공 Rotation Lambda (RDS 통합)
C) Lambda 직접 작성
D) Manual

**정답: B**
해설: Parameter Store는 자동 회전 X. Secrets Manager + AWS 제공 RDS Rotation Lambda가 표준 — 직접 작성 불필요.

---

**문제 3.** Multi-Region 애플리케이션이 같은 시크릿을 각 리전에서 빠르게 접근하려 한다. 어떤 기능?

A) S3 Cross-Region Replication
B) Secrets Manager Cross-Region Replication
C) DynamoDB Global Table
D) Lambda

**정답: B**
해설: Secrets Manager의 표준 기능. Primary 리전에서 시크릿 + 회전 관리, 다른 리전에 자동 읽기 전용 복제.

---

**문제 4.** Custom Rotation Lambda 작성 시 4단계 순서는?

A) setSecret → createSecret → testSecret → finishSecret
B) createSecret → setSecret → testSecret → finishSecret (표준 순서)
C) testSecret → createSecret → setSecret → finishSecret
D) finishSecret → testSecret → setSecret → createSecret

**정답: B**
해설: 표준 4단계. 새 비밀 생성 → 시스템에 적용 → 검증 → AWSCURRENT 이동. 한 단계라도 실패하면 회전 중단.

---

**문제 5.** 회사가 Cross-Account로 시크릿을 공유하려 한다. 어떤 설정이 모두 필요한가?

A) Resource Policy만
B) Resource Policy + Destination 계정 IAM 정책 + KMS Key Policy (암호화된 경우)
C) IAM 정책만
D) Lambda 트리거

**정답: B**
해설: Cross-Account 시크릿 공유 표준. 세 정책 모두 일치해야. KMS 키도 같은 계정의 키 정책에 다른 계정 명시 필요.

---

## 📌 오늘의 요약

1. Secrets Manager = 자동 회전 + Cross-Region. 필요 없으면 Parameter Store가 저렴
2. RDS/Aurora/DocumentDB/Redshift 회전 Lambda는 AWS 제공 — 직접 작성 불필요
3. Custom Rotation 4단계: createSecret → setSecret → testSecret → finishSecret
4. Replica는 읽기 전용. 회전·쓰기는 Primary에서만
5. Cross-Account = Resource Policy + IAM + KMS Key Policy 세트
