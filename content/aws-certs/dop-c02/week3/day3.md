# Day 3 - 시크릿 관리의 설계 원칙: Secrets Manager vs Parameter Store를 가르는 기준

2019년 Capital One 유출 사고의 근본 원인은 EC2 IMDS(Instance Metadata Service)를 통한 IAM 자격 증명 탈취였다. 하지만 그 이전에 수많은 기업이 겪은 자격 증명 노출 사고의 공통 원인은 훨씬 단순했다 — 소스 코드에 비밀번호가 평문으로 적혀 있었다. `env.variables`에 `DB_PASS: mysecretpassword`처럼. 이 문제를 구조적으로 막는 것이 `env.secrets-manager`와 `env.parameter-store`의 존재 이유다.

시크릿 관리는 "어디에 저장하느냐"만의 문제가 아니다. "누가 언제 가져가느냐", "키가 바뀔 때 어떻게 되느냐", "돈을 얼마나 내느냐"가 모두 설계 결정이다. AWS는 두 서비스로 이 스펙트럼을 커버한다 — Secrets Manager(자동 회전, 비쌈)와 SSM Parameter Store(단순, 저렴 또는 무료).

## Secrets Manager vs Parameter Store: 결정 트리

| 항목 | AWS Secrets Manager | SSM Parameter Store |
|------|---------------------|---------------------|
| 자동 회전 | ✅ Lambda 기반 | ❌ (수동 또는 외부 자동화) |
| 크기 한도 | 64 KB | Standard 4 KB / Advanced 8 KB |
| 버전 관리 | AWSCURRENT / AWSPENDING / AWSPREVIOUS | VersionId (정수 증가) |
| 비용 | 시크릿당 월 $0.40 + API $0.05/10,000건 | Standard 무료 / Advanced $0.05/파라미터/월 |
| Resource Policy | ✅ (Cross-account 공유) | Advanced만 |
| RDS 네이티브 통합 | ✅ (RDS, Redshift, DocumentDB) | ❌ |
| KMS 암호화 | 항상 (CMK 선택) | SecureString 시 선택 |
| Lambda Extension | ✅ | ✅ (동일 Extension) |

**결정 규칙**:
- RDS/Redshift/DocumentDB 비밀번호 + 자동 회전 필요 → **Secrets Manager**
- 단순 설정값(DB 호스트, 환경 플래그) → **Parameter Store Standard (무료)**
- 비밀이지만 회전 불필요 → **Parameter Store SecureString (KMS 암호화)**
- 100개 이상 + 대부분 회전 불필요 → **혼합** (회전 필요한 것만 Secrets Manager)

> 💡 **관련 이론**: 비밀 관리는 **Principle of Least Privilege**의 확장이다. 비밀을 아는 사람/시스템이 적을수록 공격 표면이 줄어든다. Secrets Manager의 Resource Policy와 Parameter Store의 IAM 경로 기반 권한(`/myapp/prod/*`)은 이 원칙의 실천 도구다. 비밀에 접근하는 모든 경로에 최소 권한 IAM 정책이 있어야 한다.

## CodeBuild 자동 주입: env 블록의 내부 동작

```yaml
version: 0.2
env:
  parameter-store:
    DB_HOST: /myapp/prod/db-host          # String or SecureString
    LOG_LEVEL: /myapp/prod/log-level
  secrets-manager:
    DB_PASS: prod/db:password::AWSCURRENT
    API_KEY: prod/api-key
    #         secretId:jsonKey:versionStage:versionId
    # jsonKey가 없으면 전체 시크릿 값 (문자열)
    # jsonKey가 있으면 JSON에서 해당 키 값만 추출
```

빌드가 시작될 때 CodeBuild는 이 블록을 파싱하고, 지정된 서비스에 API 호출을 해서 값을 가져온다. **이 fetch는 빌드 시작 시점에 단 1회** 일어난다. 이후 빌드 전체에서 환경 변수로 사용 가능하다.

**필요한 IAM 권한:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["ssm:GetParameters", "ssm:GetParameter"],
      "Resource": "arn:aws:ssm:ap-northeast-2:123456789:parameter/myapp/prod/*"
    },
    {
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "arn:aws:secretsmanager:ap-northeast-2:123456789:secret:prod/*"
    },
    {
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "arn:aws:kms:ap-northeast-2:123456789:key/<cmk-key-id>"
    }
  ]
}
```

`kms:Decrypt`가 필요한 경우: SecureString 파라미터가 CMK로 암호화된 경우, 또는 Secrets Manager 시크릿이 CMK로 암호화된 경우. AWS 관리형 키(`alias/aws/ssm`, `alias/aws/secretsmanager`)는 서비스 역할에 암묵적으로 허용되어 별도 권한이 필요 없다.

> ⚠️ **함정**: 가장 흔한 실수 — `secretsmanager:GetSecretValue` 권한은 있는데 `kms:Decrypt`가 없어서 `AccessDenied: not authorized to decrypt` 오류. CMK를 쓴다면 KMS 권한을 반드시 별도로 추가해야 한다. 에러 메시지가 "Secrets Manager"를 언급하지만 실제 문제는 KMS에 있다.

## Secrets Manager 회전 메커니즘: PENDING → CURRENT → PREVIOUS

회전(Rotation)은 시크릿 값을 주기적으로 새 값으로 교체하는 프로세스다. 이 프로세스가 안전하게 이루어지려면 "구 값을 쓰는 시스템"과 "새 값 생성" 사이에 충돌이 없어야 한다.

**Single User Rotation 4단계:**
```
1. createSecret: 새 비밀번호 생성 → AWSPENDING 라벨
2. setSecret:    DB 사용자 비밀번호를 새 값으로 업데이트
3. testSecret:   새 비밀번호로 DB 연결 검증
4. finishSecret: AWSPENDING → AWSCURRENT, AWSCURRENT → AWSPREVIOUS
```

**Multi-User Rotation (Alternating Users):**
- 두 DB 사용자 계정(user1, user2)을 번갈아 사용
- user1이 CURRENT일 때 user2의 비밀번호를 교체하고 PENDING으로 준비
- 교체 완료 후 user2를 CURRENT로, user1을 PREVIOUS로
- 어느 시점에도 "유효한 비밀번호를 모르는" 순간이 없음 → Zero-downtime

```bash
# RDS 통합 Rotation 설정
aws secretsmanager rotate-secret \
  --secret-id prod/myapp-rds \
  --rotation-rules AutomaticallyAfterDays=30 \
  --rotation-lambda-arn arn:aws:lambda:...:function:SecretsManagerRDSPostgreSQLRotationMultiUser
```

> 💡 **관련 이론**: Multi-User Rotation은 분산 시스템의 **Blue/Green 배포 패턴**을 자격 증명에 적용한 것이다. 항상 두 개의 유효한 자격 증명이 존재하고, 시스템은 현재 CURRENT를 사용하며, 새 자격 증명이 준비되면 전환한다. 이것은 소프트웨어 배포의 "구 버전과 새 버전이 동시에 존재하는 기간"과 동일한 논리다.

> 📚 **사례**: 2023년 GitLab의 보안 인시던트 보고서에 따르면, 자동 회전이 설정되지 않은 장기 유효 자격 증명이 공격자에게 수개월간 노출된 사례가 있었다. 회전 주기가 30일이었다면 최대 노출 기간이 30일로 제한됐을 것이다. Secrets Manager의 자동 회전은 "최대 노출 기간"을 설정 가능한 숫자로 만드는 핵심 보안 제어다.

## Parameter Store SecureString: 계층적 네이밍과 경로 권한

```bash
# 생성
aws ssm put-parameter \
  --name /myapp/prod/db-pass \
  --value "supersecret" \
  --type SecureString \
  --key-id alias/myapp-cmk   # CMK 사용. 기본값은 alias/aws/ssm

# 조회
aws ssm get-parameter \
  --name /myapp/prod/db-pass \
  --with-decryption

# 경로 일괄 조회
aws ssm get-parameters-by-path \
  --path /myapp/prod \
  --recursive \
  --with-decryption
```

계층적 네이밍(`/app/env/key`)의 장점: IAM 정책에서 경로 prefix로 권한을 부여할 수 있다.

```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParametersByPath", "ssm:GetParameter"],
  "Resource": "arn:aws:ssm:*:*:parameter/myapp/prod/*"
}
```

이 정책 하나로 `/myapp/prod/` 아래 모든 파라미터에 접근 가능. `/myapp/dev/*`에는 접근 불가. 환경 분리가 IAM 경로 구조로 자연스럽게 이루어진다.

> 🔍 **더 깊이**: Parameter Store는 내부적으로 DynamoDB 기반으로 동작한다고 알려져 있다(AWS 공식 확인은 없지만 행동 패턴으로 추측). Standard tier는 GetParameter API가 스로틀링되는데 기본 한도가 **40 TPS**(1초에 40번)다. 빌드가 동시에 수십 개 돌아가고 각 빌드가 Parameter Store에서 여러 값을 가져오면 스로틀링이 발생한다. Advanced tier는 1000 TPS까지 지원한다. 대규모 병렬 빌드 환경에서는 이 한도를 확인해야 한다.

## Cross-Account 시크릿 공유: 패턴과 필수 요소

멀티 계정 환경에서 공유 시크릿을 관리하는 패턴:

```json
// Secrets Manager Resource Policy (시크릿 소유 계정 A)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::BUILDER-ACCOUNT-B:role/CodeBuildServiceRole"
    },
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*"
  }]
}
```

Cross-account 접근에 필요한 요소 3가지:
1. **시크릿 Resource Policy**: 소비자 계정 Role을 허용
2. **KMS 키 Policy**: 소비자 계정 Role에 Decrypt 허용
3. **소비자 계정 IAM Policy**: 해당 ARN에 GetSecretValue 허용

VPC Peering이나 PrivateLink는 필요 없다 — Secrets Manager API는 AWS 공개 API 엔드포인트를 통해 접근한다.

> 🎯 **시나리오**: 3개 계정(dev, staging, prod)이 있고, 공통 API 키를 "secrets" 전용 계정에서 관리한다. 각 계정의 CodeBuild는 이 키를 참조해야 한다. 설계: (1) secrets 계정에 Secrets Manager 시크릿 생성 (2) Resource Policy로 dev/staging/prod 계정의 CodeBuildRole을 허용 (3) KMS 키 Policy도 동일하게 Cross-account grant (4) 각 buildspec에서 `env.secrets-manager: arn:aws:secretsmanager:...:secret:shared/api-key`로 ARN 전체 지정. 이 패턴이 멀티 계정 시크릿 공유의 표준이다.

## Lambda와 ECS에서의 시크릿 패턴: 런타임 주입

CodeBuild에서 빌드 시점 주입이 아니라, 실제 애플리케이션 런타임에서 시크릿을 가져오는 두 가지 패턴:

**Lambda: AWS Parameters and Secrets Lambda Extension**
```
# Extension이 설치되면 localhost에 HTTP 서버가 열린다
GET http://localhost:2773/secretsmanager/get?secretId=prod/db

Headers:
  X-Aws-Parameters-Secrets-Token: <session-token>
```

```python
import urllib.request
import json
import os

def get_secret(secret_id):
    url = f"http://localhost:2773/secretsmanager/get?secretId={secret_id}"
    req = urllib.request.Request(url, headers={
        "X-Aws-Parameters-Secrets-Token": os.environ["AWS_SESSION_TOKEN"]
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(json.loads(resp.read())["SecretString"])
```

Extension은 TTL 기반 캐시를 가진다. 같은 Lambda 실행 환경(warm 상태)에서는 캐시에서 반환하고, TTL(기본 300초)이 지나면 다시 API를 호출한다. 이것이 "Lambda 환경 변수에 시크릿을 넣는 것"보다 좋은 이유 — 환경 변수는 콘솔에서 볼 수 있고, 회전된 값이 반영되지 않지만, Extension은 캐시 만료 후 자동 갱신된다.

**ECS: Task Definition secrets 블록**
```json
{
  "containerDefinitions": [{
    "name": "web",
    "image": "myapp:latest",
    "secrets": [
      {
        "name": "DB_PASS",
        "valueFrom": "arn:aws:secretsmanager:ap-northeast-2:123456789:secret:prod/db:password::"
      },
      {
        "name": "DB_HOST",
        "valueFrom": "arn:aws:ssm:ap-northeast-2:123456789:parameter/myapp/prod/db-host"
      }
    ]
  }]
}
```

ECS Task Execution Role에 Secrets Manager와 KMS 권한 필요. **단점**: 컨테이너 환경 변수에 평문으로 주입되어, `docker inspect`나 ECS console에서 값이 보인다. 이를 해결하려면 컨테이너 내에서 Extension 패턴을 사용해야 한다.

> 💡 **관련 이론**: Lambda Extension은 **사이드카 패턴(Sidecar Pattern)**의 구현이다. 마이크로서비스에서 메인 서비스와 별도로 실행되는 프로세스가 공통 기능(로깅, 시크릿 관리, 헬스체크)을 담당한다. Kubernetes에서는 사이드카 컨테이너로 구현하고, Lambda에서는 Extension 프로세스로 구현한다. 같은 개념의 다른 형태다.

## 비용 최적화: 100개 시크릿의 비용 계산

현실적인 비용 계산:

| 구성 | 월 비용 |
|------|---------|
| 100개 모두 Secrets Manager | $0.40 × 100 = $40/월 |
| 100개 모두 Parameter Store Advanced | $0.05 × 100 = $5/월 |
| 100개 Parameter Store Standard + 0 | $0/월 |
| 10개 Secrets Manager + 90개 Param Standard | $0.40 × 10 = $4/월 |

API 호출 비용:
- Secrets Manager: $0.05/10,000 calls
- Parameter Store Standard: **무료** (단, TPS 한도 있음)
- Parameter Store Advanced: $0.05/10,000 calls

결론: 자동 회전이 필요한 것만 Secrets Manager, 나머지는 Parameter Store Standard가 비용 최적화의 표준이다.

> 🔍 **더 깊이**: 비용 계산에서 자주 놓치는 것은 **회전 Lambda 호출 비용**이다. 시크릿 100개를 30일마다 회전하면, 한 달에 회전 Lambda가 400회 이상 호출된다(4단계 × 100개). Lambda 호출 비용은 매우 낮지만, 회전 자체가 RDS API 호출, 검증 DB 연결 등을 포함하므로 회전 과정의 전체 비용을 추적하는 것이 좋다. AWS Cost Explorer에서 Secrets Manager 비용을 별도 태그로 추적하면 정확한 파악이 가능하다.

## 빌드 안정성과 회전 충돌: 실제로 어떻게 되는가

**Q: 빌드 실행 중에 시크릿이 회전되면?**

A: CodeBuild가 빌드 시작 시 `GetSecretValue(versionStage=AWSCURRENT)`를 호출해 환경 변수에 설정한다. 이 값은 빌드가 끝날 때까지 변하지 않는다. 회전은 빌드 환경 변수에 영향을 주지 않는다.

**Q: 빌드가 DB 마이그레이션을 실행하는 중에 회전이 일어나면?**

A: 빌드 시작 시 가져온 AWSCURRENT 값으로 연결하고 있다. 회전이 진행되면 새 비밀번호가 AWSPENDING이 되고 검증 후 AWSCURRENT가 된다. 이 시점에 기존 DB 세션은 이미 연결된 상태이므로 유지된다. 단, 빌드가 중간에 새 연결을 시도하면 구 비밀번호로 연결 시도 → 실패할 수 있다. AWSPREVIOUS가 grace period 동안 유효하게 유지되는 이유가 이 충돌을 방지하기 위해서다.

## 실무 예시: RDS 비밀번호 전체 회전 파이프라인

```bash
# 1) RDS와 통합된 시크릿 생성
aws secretsmanager create-secret \
  --name prod/myapp-rds \
  --secret-string '{"username":"admin","password":"initial","engine":"postgres","host":"mydb.ap-northeast-2.rds.amazonaws.com","port":5432,"dbname":"myapp"}' \
  --kms-key-id alias/myapp-secrets

# 2) 30일 자동 회전 설정
aws secretsmanager rotate-secret \
  --secret-id prod/myapp-rds \
  --rotation-rules AutomaticallyAfterDays=30 \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:123456789:function:SecretsManagerRDSPostgreSQLRotationSingleUser

# 3) buildspec
cat > buildspec.yml << 'EOF'
version: 0.2
env:
  secrets-manager:
    DB_PASS: prod/myapp-rds:password
    DB_HOST: prod/myapp-rds:host
    DB_NAME: prod/myapp-rds:dbname
    DB_USER: prod/myapp-rds:username
phases:
  build:
    commands:
      - PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f migrations/migrate.sql
      - echo "Migration complete"
EOF
```

---

## 📝 연습 문제

**문제 1.** 100개 설정값 중 10개는 30일마다 자동 회전이 필요한 DB 비밀번호이고, 나머지 90개는 호스트 이름, 환경 플래그 같은 일반 설정값이다. 비용 최적화 구성은?

A) 100개 모두 Secrets Manager ($40/월)
B) 10개 Secrets Manager + 90개 Parameter Store Standard ($4/월)
C) 100개 Parameter Store Advanced ($5/월)
D) 100개 Parameter Store Standard + 직접 회전 스크립트 ($0/월이나 회전 안 됨)

**정답: B**
해설: 자동 회전이 필요한 10개만 Secrets Manager($0.40/개/월 = $4/월), 나머지 90개는 Parameter Store Standard(무료)를 쓰는 것이 최적이다. D는 비용은 가장 낮지만 자동 회전이 없어 요구사항을 충족하지 못한다.

---

**문제 2.** CodeBuild Service Role에 `secretsmanager:GetSecretValue`를 부여했는데 "AccessDenied" 에러가 난다. 가장 가능성 높은 원인과 해결책은?

A) Secrets Manager 서비스 한도 초과 → Support에 한도 증가 요청
B) 시크릿이 CMK로 암호화 → Service Role에 해당 CMK에 대한 `kms:Decrypt` 추가
C) buildspec version이 0.1 → 0.2로 변경
D) 서브넷 설정 오류 → VPC 모드 비활성화

**정답: B**
해설: CMK(Customer Managed Key)로 암호화된 시크릿은 GetSecretValue 호출 후 복호화 단계에서 KMS API를 별도로 호출한다. 이 KMS 호출에 대한 `kms:Decrypt` 권한이 Service Role에 없으면 AccessDenied가 발생한다. AWS 관리형 키를 사용하면 이 권한이 암묵적으로 허용된다.

---

**문제 3.** Secrets Manager의 Multi-User Rotation이 Single User Rotation보다 나은 이유는?

A) 비용이 더 저렴하다
B) 회전 중에도 항상 유효한 자격 증명이 존재해 애플리케이션 다운타임이 없다
C) 설정이 더 간단하다
D) Cross-account 회전을 지원한다

**정답: B**
해설: Single User Rotation은 회전 Lambda가 DB 비밀번호를 변경하는 순간 구 비밀번호가 무효화되는 아주 짧은 "창"이 생길 수 있다. Multi-User는 항상 두 사용자 계정이 존재하고, 현재 CURRENT 계정이 활성인 동안 PENDING 계정의 비밀번호를 교체하기 때문에 이 창이 없다. 고가용성 애플리케이션의 표준 선택이다.

---

**문제 4.** Lambda 함수에서 Secrets Manager 시크릿을 가장 권장되는 방식으로 사용하는 방법은?

A) Lambda 환경 변수에 시크릿 직접 저장 (KMS 암호화 포함)
B) 매 함수 호출마다 SDK로 GetSecretValue 호출
C) AWS Parameters and Secrets Lambda Extension을 Layer로 추가하고 localhost HTTP로 접근
D) S3에 시크릿 파일 저장 후 함수 시작 시 다운로드

**정답: C**
해설: Lambda Extension은 TTL 기반 캐시를 제공해 불필요한 API 호출을 줄이고, 회전된 시크릿을 자동 갱신한다. A는 콘솔에서 값이 보이고 회전 시 함수를 재배포해야 한다. B는 매 호출마다 API 호출로 스로틀링 위험이 있다. D는 관리가 복잡하다.

---

**문제 5.** 빌드가 진행되는 동안 Secrets Manager에서 시크릿이 회전됐다. 빌드에 미치는 영향은?

A) 빌드가 즉시 실패한다
B) 환경 변수는 빌드 시작 시 1회 가져온 값이라 영향 없다; 단 빌드 내에서 SDK로 새 연결을 시도하면 AWSPREVIOUS grace period가 적용된다
C) CodeBuild가 자동으로 새 값을 환경 변수에 주입한다
D) 빌드가 재시작된다

**정답: B**
해설: `env.secrets-manager` 블록의 값은 빌드 시작 시 단 1회 fetch된다. 빌드 도중 회전이 일어나도 이미 환경 변수에 있는 값은 변하지 않는다. 빌드 코드가 중간에 SDK로 GetSecretValue를 다시 호출하면 새 AWSCURRENT를 받는다. AWSPREVIOUS는 회전 직후에도 일정 기간 유효하게 유지되어 진행 중인 연결의 갑작스러운 실패를 방지한다.

---

**문제 6.** Cross-account에서 Secrets Manager 시크릿을 가져오는 데 필요하지 않은 것은?

A) 시크릿 Resource Policy에서 소비자 계정 Role 허용
B) KMS 키 Policy에서 Cross-account Decrypt 허용
C) 소비자 계정 Role에 GetSecretValue IAM 권한
D) VPC Peering 또는 PrivateLink

**정답: D**
해설: Secrets Manager는 AWS 공개 API 엔드포인트를 통해 접근한다. Cross-account 접근에 네트워크 레벨의 VPC 연결은 필요 없다. 필요한 것은 세 가지 IAM/Policy 설정(Resource Policy, KMS Key Policy, 소비자 Role IAM Policy)이다. VPC Endpoint를 쓰면 트래픽이 AWS 내부망을 통하지만 필수는 아니다.

---

**문제 7.** Parameter Store Standard와 Advanced의 가장 중요한 차이 두 가지는?

A) Standard는 KMS 암호화 불가, Advanced는 가능
B) Standard는 파라미터당 4KB/무료/Resource Policy 없음; Advanced는 8KB/월 $0.05/Resource Policy 지원
C) Advanced만 `env.parameter-store`에서 참조 가능
D) Standard는 ap-northeast-2에서만 동작

**정답: B**
해설: Standard와 Advanced의 실질적 차이: (1) 값 크기(4KB vs 8KB), (2) 비용(무료 vs $0.05/파라미터/월), (3) Resource Policy(없음 vs 있음). KMS SecureString은 Standard에서도 지원된다. Cross-account 시크릿 공유를 Parameter Store로 하려면 Advanced가 필요하다(Resource Policy).

---
