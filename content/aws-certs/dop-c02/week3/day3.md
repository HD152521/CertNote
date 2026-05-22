# Day 3 - 시크릿 주입 - Secrets Manager, Parameter Store

📅 날짜: Week 3 (Day 3)
🎯 주제: 빌드/런타임 시크릿 관리의 표준 패턴
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Secrets Manager vs Parameter Store의 트레이드오프를 정확히 안다
- CodeBuild에서 시크릿을 환경 변수로 자동 주입하는 방법
- 시크릿 회전(Rotation)과 빌드 안정성
- Parameter Store의 SecureString과 KMS 키 동작
- Cross-Account 시크릿 공유

---

## 🧩 사전 지식 (CS 기초)

- **Envelope Encryption**: 데이터 키로 데이터 암호화, 마스터 키로 데이터 키 암호화. KMS의 기본.
- **KMS CMK / KMS Key**: Customer Managed Key. 회전·접근 제어 가능.
- **AWS Managed Key (alias/aws/...)**: AWS가 관리하는 서비스별 기본 키.
- **Rotation**: 시크릿 값을 주기적으로 교체. 노출돼도 영향 최소화.
- **In-flight vs at-rest encryption**: 전송 중 vs 저장 중 암호화.

---

## 📖 이론 내용

### 1. Secrets Manager vs Parameter Store

| 항목 | Secrets Manager | SSM Parameter Store |
|------|------------------|---------------------|
| 자동 회전 | ✅ (Lambda Rotation) | ❌ (수동 또는 외부) |
| 크기 한도 | 64KB | Standard 4KB / Advanced 8KB |
| 비용 | 시크릿당 월 $0.40 + API | Standard 무료, Advanced 유료 |
| 버전 관리 | ✅ (AWSCURRENT/AWSPREVIOUS/AWSPENDING) | ✅ (Standard도 버전) |
| 정책 | Resource Policy 지원 | Resource Policy (Advanced만) |
| RDS 통합 | ✅ 네이티브 | ❌ |
| KMS 암호화 | 항상 (CMK 선택) | SecureString 시 |

> 💡 **결정 트리**: RDS/Redshift 자동 회전 필요? → Secrets Manager. 단순 설정값(예: DB 호스트 이름, 환경 플래그)? → Parameter Store.

### 2. CodeBuild 자동 주입 — env 블록

```yaml
version: 0.2
env:
  parameter-store:
    DB_HOST: /myapp/prod/db-host        # SSM Parameter
    LOG_LEVEL: /myapp/prod/log-level
  secrets-manager:
    DB_PASS: prod/db:password::AWSCURRENT
    API_KEY: prod/api-key
    #         secret-id:json-key:version-stage:version-id
```

**Service Role 권한 필요:**
```json
{
  "Effect": "Allow",
  "Action": [
    "ssm:GetParameters",
    "ssm:GetParameter"
  ],
  "Resource": "arn:aws:ssm:*:*:parameter/myapp/*"
},
{
  "Effect": "Allow",
  "Action": [
    "secretsmanager:GetSecretValue",
    "secretsmanager:DescribeSecret"
  ],
  "Resource": "arn:aws:secretsmanager:*:*:secret:prod/*"
},
{
  "Effect": "Allow",
  "Action": "kms:Decrypt",
  "Resource": "arn:aws:kms:*:*:key/<cmk-id>"
}
```

> ⚠️ **함정**: SecureString을 KMS Customer Managed Key로 암호화했다면 빌드 Role에 `kms:Decrypt` 권한 추가 필수.

### 3. Secrets Manager Rotation

**Single User Rotation:**
1. AWSPENDING 라벨로 새 시크릿 생성
2. DB 사용자 비밀번호 업데이트
3. 새 시크릿 검증
4. AWSCURRENT 라벨 교체 (구버전은 AWSPREVIOUS)

**Multi-User Rotation (Alternating Users):**
- 두 사용자 계정을 번갈아 사용
- 다운타임 거의 0
- 권장 패턴 (특히 stateful 워크로드)

**Rotation Lambda:**
- AWS가 RDS/Redshift/DocumentDB 표준 템플릿 제공
- 사용자 정의 Lambda 작성 가능 (다른 시스템)

### 4. 빌드 안정성과 회전 충돌

**문제**: 빌드 중간에 시크릿이 회전되면 어떤 일이 발생하나?

- CodeBuild env 블록은 **빌드 시작 시점**에 한 번 가져옴 → 빌드 도중 회전은 영향 없음
- 단, 빌드가 시크릿을 외부 시스템에 사용 (예: DB 마이그레이션)할 때 시작 직후 회전이 일어나면 충돌 가능
- 해결: AWSPREVIOUS도 일정 시간 유효 (회전 직후 grace period)

### 5. Parameter Store SecureString

```bash
# 생성 (KMS CMK 사용)
aws ssm put-parameter \
  --name /myapp/prod/db-pass \
  --value "supersecret" \
  --type SecureString \
  --key-id alias/myapp-cmk

# 조회
aws ssm get-parameter \
  --name /myapp/prod/db-pass \
  --with-decryption
```

- `String` / `StringList` / `SecureString`
- `SecureString`은 KMS로 암호화 (기본 alias/aws/ssm 또는 CMK 지정)
- Hierarchical naming: `/app/env/key` 형식 권장 — Path 기반 권한 부여

### 6. Cross-Account 시크릿 공유

```json
// Secrets Manager Resource Policy (소유 계정)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::BUILDER-ACCT:role/CodeBuildRole"},
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "arn:aws:secretsmanager:ap-northeast-2:OWNER:secret:shared/api-key"
  }]
}
```

KMS 키도 마찬가지로 Cross-Account grant 필요.

---

## 🧠 알아두면 좋은 심화 이론

### CodeBuild + Parameter Store 비용 최적화

- Parameter Store **Standard tier는 GetParameter 무료** (Throttle은 있음)
- Advanced tier: 파라미터당 $0.05/월 + API $0.05/10000건
- Secrets Manager: 시크릿당 $0.40/월

100개 시크릿 = Secrets Manager $40/월 vs Parameter Store Standard $0
회전 필요한 것만 Secrets Manager, 나머지는 Parameter Store가 비용 효율적.

### Hierarchical Parameter — Path 권한

```json
{
  "Effect": "Allow",
  "Action": "ssm:GetParametersByPath",
  "Resource": "arn:aws:ssm:*:*:parameter/myapp/prod/*"
}
```

`aws ssm get-parameters-by-path --path /myapp/prod --recursive` 한 번에 가져오기.

### Lambda 환경에서의 시크릿 패턴

- Lambda 환경 변수에 직접 시크릿 넣지 말 것 (KMS 암호화해도 콘솔에 노출)
- AWS Parameters and Secrets Lambda Extension (Lambda Layer)
- 코드에서 `http://localhost:2773/secretsmanager/get?secretId=...` 호출
- 같은 함수 인스턴스 내 캐시

### ECS Task Definition에서 시크릿 주입

```json
{
  "containerDefinitions": [{
    "secrets": [
      {
        "name": "DB_PASS",
        "valueFrom": "arn:aws:secretsmanager:...:secret:prod/db:password::"
      }
    ]
  }]
}
```

Task Execution Role에 권한 필요. **Container 환경 변수로 평문 노출** 단점 있음 (대안: SSM Agent / Extension).

### 관련 서비스 Cross-Reference

- **KMS** → Week 9 Day 4
- **Lambda Layer Extension** → Week 7 Day 1
- **ECS Secrets** → Week 6 Day 2
- **Cross-Account KMS** → Week 8 Day 2

---

## 🏗️ 아키텍처 다이어그램

```
Secret Injection Patterns
==================================================

  Build time (CodeBuild)
   buildspec.yml
     env.secrets-manager: prod/db
              |
              v
        IAM Role: GetSecretValue + KMS Decrypt
              |
              v
        Env var DB_PASS (in-memory only)

  Runtime (Lambda)
   Layer: AWS Parameters and Secrets Lambda Extension
              |
              v
   GET http://localhost:2773/secretsmanager/get?secretId=...
              |
              v
   In-memory cache (per execution env)
              |
              v
   App code uses DB_PASS

  Runtime (ECS Fargate)
   Task Definition secrets[] -> Task Execution Role
              |
              v
   ECS Agent fetches and injects as env var
              |
              v
   Container env DB_PASS (warning: visible in container env)

  Rotation
   EventBridge schedule -> Secrets Manager Rotation Lambda
              |
              v
   1) PENDING 라벨로 새 비번 생성
   2) DB 사용자 업데이트
   3) 검증
   4) CURRENT 교체
              |
              v
   ECS Service: 다음 task가 새 비번 자동 사용
   Lambda: 다음 cold start 또는 캐시 만료 시
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **자동 회전 = Secrets Manager**, 단순 파라미터 = Parameter Store
2. ⭐ env.secrets-manager 사용 시 IAM에 `secretsmanager:GetSecretValue` + `kms:Decrypt` 권한
3. ⭐ Secrets Manager 비용은 시크릿당 월 $0.40 — 100개면 $40, Parameter Store Standard 무료
4. ⭐ Lambda는 환경 변수보다 **AWS Parameters and Secrets Lambda Extension** 권장
5. ⭐ 회전 라벨: AWSCURRENT / AWSPENDING / AWSPREVIOUS — Multi-User Rotation은 다운타임 거의 0

---

## 💻 실제 예시 - RDS 비밀번호 자동 회전

```bash
# 1) RDS와 통합된 시크릿 생성 (마스터 비밀번호)
aws secretsmanager create-secret \
  --name prod/myapp-rds \
  --description "RDS master credentials" \
  --secret-string '{"username":"admin","password":"initial","engine":"postgres","host":"...","port":5432,"dbname":"myapp"}' \
  --kms-key-id alias/myapp-secrets

# 2) Rotation Lambda 자동 생성 (AWS 템플릿)
aws secretsmanager rotate-secret \
  --secret-id prod/myapp-rds \
  --rotation-rules AutomaticallyAfterDays=30 \
  --rotation-lambda-arn arn:aws:lambda:...:function:SecretsManagerRDSPostgreSQLRotationSingleUser

# 3) buildspec에서 사용
cat <<EOF > buildspec.yml
version: 0.2
env:
  secrets-manager:
    DB_PASS: prod/myapp-rds:password
    DB_HOST: prod/myapp-rds:host
    DB_NAME: prod/myapp-rds:dbname
phases:
  build:
    commands:
      - psql "host=\$DB_HOST dbname=\$DB_NAME user=admin password=\$DB_PASS" -f migrate.sql
EOF
```

**출력 예시 (DescribeSecret):**
```json
{
  "Name": "prod/myapp-rds",
  "RotationEnabled": true,
  "RotationLambdaARN": "arn:aws:lambda:...",
  "RotationRules": {"AutomaticallyAfterDays": 30},
  "LastRotatedDate": "2026-05-15T03:00:00Z",
  "NextRotationDate": "2026-06-14T03:00:00Z",
  "VersionIdsToStages": {
    "abc-123": ["AWSCURRENT"],
    "def-456": ["AWSPREVIOUS"]
  }
}
```

---

## 📝 연습 문제

**문제 1.** 100개 환경 설정값 + 10개 회전 필요 비밀번호. 가장 비용 효율적인 구성은?

A) 모두 Secrets Manager — 시크릿당 $0.40 × 110 = $44/월
B) Parameter Store Standard에 100개 설정 + Secrets Manager에 10개 비밀번호 = $4/월
C) 모두 Parameter Store Advanced
D) 모두 환경 변수에 평문

**정답: B**
해설: Parameter Store Standard 무료 + Secrets Manager는 회전 필요한 것만. 시험에서 비용 시나리오 자주 등장.

---

**문제 2.** CodeBuild Role에 `secretsmanager:GetSecretValue`만 부여했는데도 시크릿 가져오기 실패. 원인은?

A) Service Role에 `kms:Decrypt` 권한 누락 (CMK로 암호화된 시크릿)
B) Region 불일치
C) Secrets Manager 한도 초과
D) S3 접근 권한 누락

**정답: A**
해설: CMK 사용 시 KMS Decrypt가 필수. 가장 흔한 실수.

---

**문제 3.** Lambda에서 시크릿을 사용하는 가장 권장되는 패턴은?

A) 환경 변수에 시크릿 직접 입력
B) AWS Parameters and Secrets Lambda Extension Layer로 캐시 + 단일 가져오기
C) 매 호출마다 SDK로 GetSecretValue
D) Lambda Layer에 시크릿 zip 포함

**정답: B**
해설: Extension은 캐시 + 단일 fetch + 처리량 효율. C는 throttle 위험.

---

**문제 4.** Secrets Manager의 Multi-User Rotation을 선택하는 이유는?

A) 더 빠른 회전
B) 두 사용자 계정을 번갈아 사용 → 회전 중 다운타임 거의 0
C) 비용 절감
D) Cross-Region 지원

**정답: B**
해설: Single User는 짧은 다운타임 가능. Multi-User가 진정한 zero-downtime.

---

**문제 5.** Parameter Store SecureString을 SecureString이 아닌 일반 String으로 만든 후의 영향은?

A) KMS 암호화 안 됨 — 콘솔/API에서 평문 노출
B) 자동으로 SecureString으로 승격
C) Secrets Manager로 자동 이전
D) 변화 없음

**정답: A**
해설: String은 평문. 시크릿이라면 반드시 SecureString.

---

**문제 6.** Cross-Account에서 다른 계정의 Secrets Manager 시크릿을 사용하려면 필수가 아닌 것은?

A) 시크릿 Resource Policy로 소비자 계정 Role 허용
B) KMS 키도 Cross-Account grant
C) 소비자 계정 Role에 GetSecretValue + Decrypt 권한
D) VPC Peering

**정답: D**
해설: VPC 불필요 — API 엔드포인트로 접근. 정책만 정확하면 됨.

---

**문제 7.** 빌드 도중에 시크릿이 회전되면 빌드는 어떻게 되는가?

A) 즉시 실패
B) CodeBuild는 빌드 시작 시점에 시크릿을 한 번 가져옴 — 이미 환경 변수에 주입된 값은 영향 없음
C) AWS Support에 문의 필요
D) 빌드가 자동 재시도

**정답: B**
해설: 빌드 시작 시점 fetch + AWSPREVIOUS grace period로 충돌 거의 없음.

---

## 📌 오늘의 요약

1. Secrets Manager = 자동 회전, Parameter Store = 단순/저비용
2. CodeBuild env 블록으로 자동 주입, IAM에 GetSecretValue + KMS Decrypt 필요
3. Multi-User Rotation으로 zero-downtime 회전
4. Lambda는 환경 변수 대신 Parameters and Secrets Lambda Extension
5. 100개 시크릿 비용 차이는 $40 vs $0 — Parameter Store Standard 적극 활용
