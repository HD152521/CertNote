# Day 2 - Secrets Manager·Parameter Store·CloudHSM: 비밀과 구성을 다루는 세 가지 도구

소프트웨어 보안 사고의 통계를 보면 "암호화 알고리즘이 깨졌다"는 사례는 거의 없는 반면, "비밀번호·API 키·DB 자격증명이 코드 저장소에 평문으로 커밋됐다"는 사례는 매주 어디선가 일어난다. GitHub의 자체 통계에 따르면 2023년 한 해 동안 공개 저장소에 노출된 시크릿이 1,250만 건이 넘었고, 그 중 91%가 24시간 내에 봇에 의해 자동 수집됐다. 즉 시크릿은 "노출되는 즉시 탈취된다"고 가정하는 게 현실적이다.

이 문제에 대한 클라우드 시대의 답이 **중앙 시크릿 매니저** 다. 비밀을 코드·환경변수·설정 파일에 박지 말고 별도 서비스에 저장하고, 애플리케이션이 시작할 때 IAM 권한으로 가져오게 한다. 그러면 비밀이 코드 저장소·CI 로그·컨테이너 이미지 어디에도 평문으로 남지 않고, 회전·감사·접근 통제가 한 곳에서 가능해진다. AWS는 이 문제를 두 가지 서비스로 분리했다 — **Secrets Manager**(2018년 4월 출시, 자동 회전·고가용성 비밀 관리)와 **Systems Manager Parameter Store**(2016년 출시, 구성·평문 파라미터 무료 저장). 그리고 그 아래에는 가장 엄격한 컴플라이언스 요구를 충족하는 **CloudHSM** 이 있다. 이 글에서는 세 서비스가 어떤 문제에 답하는지, 어떻게 골라야 하는지, 그리고 가장 자주 마주치는 시나리오를 본다.

## Secrets Manager의 핵심 가치: 자동 회전과 RDS 통합

Secrets Manager의 가장 큰 차별점은 **자동 회전(automatic rotation)** 이다. 단순히 "비밀을 KMS로 암호화해 저장한다"가 전부라면 Parameter Store SecureString으로도 충분하지만, "30일마다 RDS 비밀번호를 자동으로 바꾸고, 그 시점에 애플리케이션이 끊김 없이 새 비밀번호를 받아 쓰게 한다"는 요구는 Secrets Manager만 깔끔하게 처리할 수 있다.

자동 회전은 내부적으로 Lambda 함수를 트리거해서 동작한다. AWS는 RDS / Aurora / Redshift / DocumentDB 같은 주요 데이터베이스에 대해 미리 만들어진 회전 Lambda 템플릿을 제공하고, 사용자가 "회전 활성화" 버튼만 누르면 4단계 라이프사이클이 자동으로 실행된다.

```
[ Secrets Manager 회전 4단계 ]

1) createSecret
   ├─ 새 비밀번호 생성 (랜덤)
   ├─ AWSPENDING 버전으로 저장
   │  (AWSCURRENT는 아직 옛 비밀번호)

2) setSecret
   ├─ RDS API로 새 비밀번호를 DB에 적용
   │  (RDS user의 패스워드 변경)
   ├─ 이 시점 DB는 옛 + 새 비밀번호 둘 다 받음(짧은 기간)

3) testSecret
   ├─ 새 비밀번호로 DB 연결 테스트
   │  실패하면 롤백

4) finishSecret
   ├─ AWSPENDING → AWSCURRENT 승격
   ├─ 옛 비밀번호 → AWSPREVIOUS (롤백용)
```

이 라이프사이클의 핵심 통찰은 **AWSCURRENT가 즉시 바뀌지 않고 testSecret이 성공한 후에만 승격된다** 는 점이다. 만약 새 비밀번호 생성은 됐지만 DB 적용이 실패하면, AWSCURRENT는 옛 비밀번호 그대로 유지되므로 애플리케이션이 멈추지 않는다. 또한 AWSPREVIOUS가 일정 기간 살아 있으므로, 회전 시점에 마침 활성 커넥션을 들고 있던 클라이언트도 다음 reconnect 때까지는 옛 비밀번호로 계속 동작한다. 이게 "다운타임 없는 회전"이 가능한 이유다.

| 버전 라벨 | 의미 | 수명 |
|----------|------|------|
| `AWSCURRENT` | 지금 유효한 비밀 | 다음 회전까지 |
| `AWSPENDING` | 회전 중인 새 비밀 (검증 대기) | 회전 라이프사이클 중 |
| `AWSPREVIOUS` | 직전 비밀 (롤백·전환 대기용) | 일정 기간 |

> 💡 **관련 이론**: Secrets Manager의 회전 모델은 **dual-credential pattern** 또는 **blue-green credentials** 라고 부른다. 데이터베이스나 서비스가 두 개의 자격증명을 동시에 받아들이는 짧은 윈도우를 두고, 그 윈도우에서 점진적으로 새 자격증명으로 전환한다. 이게 가능한 이유는 RDS user가 본질적으로 ALTER USER로 비밀번호를 바꿀 수 있고, 기존 커넥션은 비밀번호 변경 후에도 끊기지 않기 때문이다. 같은 패턴을 Kubernetes Secrets + cert-manager, HashiCorp Vault의 dynamic credentials 등에서도 볼 수 있다.

> 🔍 **더 깊이**: RDS Proxy + Secrets Manager 조합은 자동 회전을 한 단계 더 안전하게 만든다. RDS Proxy가 클라이언트와 RDS 사이에 들어가서 connection pooling을 하고, Secrets Manager에서 비밀번호를 직접 가져와 클라이언트와 DB 양쪽에 다른 자격증명으로 동작할 수 있다. 그래서 회전이 일어나도 클라이언트는 RDS Proxy의 자격증명만 알면 되고, RDS Proxy가 백엔드 비밀번호 변경을 흡수한다. Aurora Serverless v2처럼 connection 수가 자주 변하는 환경에서는 거의 필수 패턴이다.

> 📚 **사례**: 2020년 한 모바일 게임 회사가 Aurora MySQL 비밀번호를 90일마다 수동으로 회전하던 운영 절차를 Secrets Manager 자동 회전으로 전환했다. 그 전에는 회전 시점마다 SRE가 새 비밀번호를 ConfigMap에 반영하고 Pod를 재배포했는데, 한 번 실패하면 대규모 장애가 났다. Secrets Manager 도입 후 회전 절차가 완전 자동화됐고, 회전 실패 시 testSecret 단계에서 자동 롤백돼 운영 사고가 18개월간 0건이 됐다. 다만 한 번 트러블슈팅에 어려움을 겪은 건 "회전 Lambda가 RDS와 다른 VPC에 있어 네트워크 문제로 setSecret 실패"였는데, Lambda를 RDS와 같은 VPC subnet에 배치하는 게 운영 표준이 됐다.

## Parameter Store: 비용 0의 구성 저장소

Systems Manager Parameter Store는 Secrets Manager보다 2년 먼저 출시됐고, 기본 사용량이 무료다. "비밀이 아닌 구성"(예: DB 호스트명, S3 버킷 이름, 환경 변수)을 저장하는 데 가장 적합하고, SecureString 타입으로 KMS 암호화도 지원한다. 그래서 "자동 회전이 꼭 필요한 비밀만 Secrets Manager에 두고, 나머지 구성은 Parameter Store에 둔다"는 분업이 가장 흔한 패턴이다.

| 항목 | Standard | Advanced |
|------|----------|----------|
| 파라미터 수 | 계정·region당 10,000개 | 100,000개 |
| 값 크기 | 4KB | 8KB |
| 정책(만료·자동 알림) | X | O |
| 비용 | 무료 | 파라미터당 $0.05/월 + 호출 비용 |
| 처리량 | 기본 40 TPS (증설 가능) | 동일 |
| SecureString (KMS) | 가능 | 가능 |

Standard tier가 무료라는 건 운영 비용 측면에서 결정적이다. 100개 마이크로서비스가 각자 환경별로 20개 구성을 갖는다면 2,000개 파라미터가 필요한데, Secrets Manager로 모두 저장하면 비밀당 $0.40/월 × 2,000 = $800/월이 든다. Parameter Store Standard로는 $0이다. 그래서 "회전이 필요한 진짜 비밀(DB 비밀번호, API 키)"과 "단순 구성(DB 호스트, 큐 이름)"을 구분해서 저장하는 게 합리적이다.

```
[ 흔한 분업 패턴 ]

Secrets Manager (회전 필요한 비밀)
   ├─ /prod/rds/admin-password
   ├─ /prod/stripe/api-key
   └─ /prod/oauth/client-secret

Parameter Store (구성 + 가벼운 시크릿)
   ├─ /prod/app/db-host
   ├─ /prod/app/s3-bucket-name
   ├─ /prod/app/feature-flags/new-checkout (값: true/false)
   └─ /prod/app/log-level (값: INFO)
```

Parameter Store가 가진 또 하나의 장점은 **계층형 네임스페이스** 다. `/prod/app/db-host`처럼 슬래시로 구조화된 이름을 쓸 수 있고, `GetParametersByPath` API로 특정 경로 하위 전체를 한 번에 가져올 수 있다. 그래서 애플리케이션이 시작할 때 `aws ssm get-parameters-by-path --path /prod/app --recursive --with-decryption`으로 모든 구성을 한 번에 로드하는 패턴이 가능하다. Secrets Manager는 이런 계층 조회가 약하고 각 비밀을 개별 조회해야 한다.

> ⚠️ **함정**: "비밀번호를 SecureString으로 Parameter Store에 저장했으니 회전도 자동으로 된다"는 오해가 흔하다. SecureString은 KMS 암호화만 제공할 뿐 회전 기능은 없다. 회전이 필요하면 별도 Lambda를 만들어서 EventBridge cron으로 트리거해야 하는데, 이 과정에서 dual-credential pattern을 직접 구현해야 한다. 실수 한 번이면 다운타임이므로, 회전이 정말 필요한 비밀은 Secrets Manager로 가는 게 운영 부담이 훨씬 적다.

> 🔍 **더 깊이**: Parameter Store와 Secrets Manager는 사실 일부 기능이 겹친다. 2018년 Secrets Manager 출시 이후 AWS는 한동안 두 서비스 모두 발전시키다가, 2020년부터 "비밀 = Secrets Manager, 구성 = Parameter Store"로 가이드를 명확히 했다. 그래서 Parameter Store에 Secrets Manager 비밀을 참조하는 기능(`{{resolve:secretsmanager:...}}`)이 추가됐고, 반대로 Secrets Manager는 RDS 외 다른 데이터베이스(자체 회전 Lambda)와 사용자 정의 회전을 지원하게 됐다. 결과적으로 두 서비스가 같은 시크릿을 두 곳에서 가리키는 패턴(Parameter Store 이름에 Secrets Manager ARN 저장)도 흔하다.

## Secrets Manager의 고급 기능: 멀티 리전 복제와 리소스 정책

엔터프라이즈 환경에서 Secrets Manager가 Parameter Store보다 결정적으로 우위에 있는 두 가지 기능이 **멀티 리전 복제** 와 **리소스 정책** 이다.

멀티 리전 복제는 2021년 3월에 추가됐다. 한 region에서 비밀을 만들고 "ap-northeast-2와 us-west-2에 복제" 옵션을 켜면, 원본이 변경될 때마다 (회전 포함) 자동으로 복제본도 업데이트된다. DR 시나리오에서 active-passive 또는 active-active 모두 활용 가능하고, 복제본 region에서 직접 GetSecretValue를 호출할 수 있어 latency도 낮다. Parameter Store는 이런 자동 복제가 없고 직접 스크립트로 동기화해야 한다.

리소스 정책은 비밀 자체에 정책을 붙여서 다른 계정 Principal에 접근을 허용하는 기능이다. 예를 들어 SaaS 회사가 고객 계정에 비밀 일부를 공유하고 싶을 때, 비밀의 리소스 정책에 고객 계정 root를 Principal로 허용하면 된다. 그러면 고객은 자기 계정 IAM Role에 `secretsmanager:GetSecretValue` 권한만 부여하면 SaaS 회사의 비밀을 직접 가져올 수 있다.

```json
// Secrets Manager 리소스 정책 예시 (다른 계정 허용)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCustomerAccess",
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::222222222222:root"},
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*",
    "Condition": {
      "StringEquals": {"secretsmanager:VersionStage": "AWSCURRENT"}
    }
  }]
}
```

비밀의 KMS 키도 함께 공유해야 한다는 점이 함정이다. Secrets Manager는 비밀을 KMS로 암호화하므로, 다른 계정이 비밀을 가져오려면 (1) Secrets Manager 리소스 정책 + (2) KMS 키 정책에서 둘 다 그 계정을 허용해야 한다. 이 두 단계 중 하나를 빼먹으면 `AccessDenied`가 나는데 어디가 막혔는지 메시지로는 구분이 안 돼서 트러블슈팅이 까다롭다.

> 📚 **사례**: 2022년 한 결제 SaaS가 고객사에 "테스트용 시크릿 키"를 공유하는 데 Secrets Manager 크로스 계정 패턴을 사용했다. 처음엔 리소스 정책만 설정하고 KMS는 AWS Managed Key(`aws/secretsmanager`)를 썼는데, AWS Managed Key는 크로스 계정 공유가 불가능해서 모든 고객이 `KMSAccessDeniedException`을 받았다. CMK로 전환하고 키 정책에 고객 계정 root를 추가한 후 정상 동작했다. 이후 회사 표준 가이드에 "크로스 계정 공유가 필요한 비밀은 반드시 CMK 사용"이 들어갔다.

## CloudHSM: 컴플라이언스가 요구할 때만

CloudHSM은 AWS가 운영하는 고객 전용 하드웨어 보안 모듈이다. KMS도 내부적으로 HSM 위에서 동작하지만 multi-tenant인 반면, CloudHSM은 **single-tenant** 로 한 고객의 워크로드만 그 HSM 클러스터에서 동작한다. FIPS 140-2 Level 3 인증을 고객 명의로 받으며, AWS 직원도 키 자료에 접근할 수 없는 게 가장 큰 특징이다.

| 항목 | KMS CMK | CloudHSM |
|------|---------|----------|
| 테넌시 | Multi-tenant | Single-tenant |
| FIPS 인증 | 140-2 Level 3 (AWS 명의) | 140-2 Level 3 (고객 명의) |
| 키 제어 | AWS도 운영 권한 보유 | AWS 직원 접근 불가 |
| AWS 서비스 통합 | 거의 모든 서비스 | KMS XKS 경유 또는 PKCS#11/JCE 직접 |
| 운영 부담 | 거의 없음 | 클러스터 관리·HA 직접 설계 |
| 비용 | 키당 $1/월 + 호출 | HSM 인스턴스 시간당 $1.45 |
| 사용처 | 대부분의 시나리오 | 강한 규제(금융·정부)·SSL offload·IBM HSM 마이그레이션 |

CloudHSM의 운영 모델은 KMS와 완전히 다르다. CloudHSM 클러스터를 VPC 안에 생성하고, HSM 인스턴스를 여러 AZ에 분산 배치해 직접 고가용성을 설계해야 한다. 클라이언트 인증서를 관리하고, PKCS#11 / JCE / OpenSSL Dynamic Engine 같은 표준 인터페이스로 직접 통신한다. 비용도 인스턴스당 시간 단위로 부과되므로(2 AZ 운영 시 월 $2,000 이상), "꼭 필요한 경우"가 아니면 KMS가 절대적으로 유리하다.

CloudHSM이 답인 시나리오는 보통 세 가지다. ① 규제가 "AWS 직원도 키에 접근할 수 없어야 한다"고 명시적으로 요구할 때 (일부 금융·정부·헬스케어). ② 기존 온프레미스 HSM(IBM 4768, Thales nShield)에서 클라우드로 마이그레이션할 때. ③ SSL/TLS 키를 HSM에서 사용해 웹 서버의 private key가 절대 메모리에 평문으로 노출되지 않게 해야 할 때. 그 외에는 KMS CMK + Customer Managed Key 정책으로 거의 모든 컴플라이언스 요구를 만족할 수 있다.

> 💡 **관련 이론**: FIPS 140-2 Level 1~4는 NIST가 정의한 암호 모듈 보안 등급이다. Level 1은 소프트웨어, Level 2는 변조 흔적 남는 하드웨어, Level 3은 변조 방지(tamper-resistant) 하드웨어 + 사용자 인증, Level 4는 변조 즉시 키 자료 소거. 대부분의 상업적 HSM은 Level 3이고, Level 4는 군용·국가 기밀급이다. PCI DSS 같은 카드 산업 규정은 Level 2 이상을 요구하고, 일부 정부 규정(예: 한국 ISMS-P 일부 요건)은 Level 3 이상을 요구한다. CloudHSM이 Level 3이라는 게 보통 충분한 이유다.

> 🔍 **더 깊이**: 2022년 출시된 **KMS External Key Store(XKS)** 는 KMS와 CloudHSM(또는 외부 KMIP 서버)을 연결하는 다리 역할을 한다. 키 자료는 외부 HSM에 있고 KMS는 프록시로 동작해서, 외부 HSM에 자기 키를 두면서도 KMS의 풍부한 서비스 통합(S3, EBS, RDS 등)을 그대로 쓸 수 있다. "키는 우리가 직접 관리한다" + "AWS 서비스는 그대로 쓰고 싶다"는 규제 요구에 답하는 패턴인데, 외부 HSM이 다운되면 KMS도 그 키로는 동작 못 한다는 위험이 있어 가용성 설계가 추가로 필요하다.

## EC2·Lambda·ECS에서의 표준 사용 패턴

세 서비스를 컴퓨트에서 어떻게 가져오는지가 실무에서 가장 자주 다루는 부분이다.

**Lambda** 는 환경 변수에 ARN만 넣어두고 코드에서 SDK로 직접 가져오는 패턴이 가장 흔하다. Cold start 시 한 번 가져와 메모리에 캐시한다.

```python
import boto3, json, os
from functools import lru_cache

@lru_cache(maxsize=1)
def get_db_password():
    client = boto3.client("secretsmanager")
    resp = client.get_secret_value(SecretId=os.environ["DB_SECRET_ARN"])
    return json.loads(resp["SecretString"])["password"]
```

다만 비밀이 회전돼도 Lambda가 cold start를 다시 안 하면 옛 값을 그대로 들고 있을 수 있다. 그래서 2022년 출시된 **AWS Parameters and Secrets Lambda Extension** 이 사실상 표준이 됐다. 익스텐션이 로컬 HTTP 캐시를 제공하고, TTL(기본 5분)이 지나면 자동으로 새로 가져온다. 코드는 `http://localhost:2773/secretsmanager/get?secretId=...`로 호출하면 되고, IAM 권한과 캐싱을 익스텐션이 다 해준다.

**ECS Task** 는 task definition의 `secrets` 섹션에 ARN을 넣으면 컨테이너 시작 시 환경 변수로 주입된다. 코드 변경 없이 비밀을 받을 수 있다.

```json
{
  "containerDefinitions": [{
    "name": "app",
    "secrets": [
      {"name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:..."}
    ]
  }]
}
```

**EC2** 는 IAM Instance Profile로 권한을 받고 UserData에서 가져오는 게 표준이다. 또는 EC2 자체에 보안 요건이 강하면 EC2 Instance Connect, SSM Session Manager로 비밀번호 없이 접속하는 게 더 안전하다.

> ⚠️ **함정**: Lambda 환경 변수에 비밀 자체를 평문으로 넣는 안티패턴이 매우 흔하다. Lambda 환경 변수는 KMS로 암호화되지만 콘솔과 CloudTrail에서 평문으로 보일 수 있고, IaC(Terraform/CDK)로 배포하면 state 파일에도 평문으로 남는다. 항상 "환경 변수에는 ARN만, 코드에서 SDK로 fetch"가 정답이다.

## CLI로 직접 만져보기

```bash
# Secrets Manager 시크릿 생성 (RDS 비밀번호 형식)
aws secretsmanager create-secret \
  --name prod/rds/admin \
  --secret-string '{"username":"admin","password":"InitialPass!"}' \
  --kms-key-id alias/saa-app \
  --tags Key=Environment,Value=production

# RDS 자동 회전 (30일, AWS 제공 Lambda 사용)
aws secretsmanager rotate-secret \
  --secret-id prod/rds/admin \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:111:function:SecretsManagerRDSPostgreSQLRotationSingleUser \
  --rotation-rules AutomaticallyAfterDays=30

# 멀티 리전 복제
aws secretsmanager replicate-secret-to-regions \
  --secret-id prod/rds/admin \
  --add-replica-regions Region=us-west-2,KmsKeyId=alias/saa-app-uswest2

# 비밀 가져오기 (AWSCURRENT 자동)
aws secretsmanager get-secret-value --secret-id prod/rds/admin

# 이전 버전 가져오기 (롤백용)
aws secretsmanager get-secret-value --secret-id prod/rds/admin --version-stage AWSPREVIOUS

# Parameter Store Standard SecureString
aws ssm put-parameter \
  --name /prod/app/api-key \
  --value "secret-value" \
  --type SecureString \
  --key-id alias/saa-app

# 계층 조회로 한 번에 다 가져오기
aws ssm get-parameters-by-path \
  --path /prod/app \
  --recursive \
  --with-decryption

# Parameter Store에서 Secrets Manager 참조
aws ssm put-parameter \
  --name /prod/app/db-secret-ref \
  --value "{{resolve:secretsmanager:prod/rds/admin:SecretString:password}}" \
  --type String

# CloudHSM 클러스터 생성
aws cloudhsmv2 create-cluster \
  --hsm-type hsm1.medium \
  --subnet-ids subnet-aaa subnet-bbb

# CloudHSM 인스턴스 추가 (AZ별)
aws cloudhsmv2 create-hsm \
  --cluster-id cluster-1234 \
  --availability-zone ap-northeast-2a
```

## 정리하며

비밀과 구성을 다루는 AWS의 세 도구는 명확한 분업 구조를 가진다. **Secrets Manager** 는 자동 회전과 RDS·DocumentDB 통합이 필요한 진짜 비밀에, **Parameter Store** 는 무료로 저장하는 구성과 가벼운 시크릿에, **CloudHSM** 은 컴플라이언스가 단독 HSM을 요구할 때 쓴다. 시험에서는 키워드 매칭으로 빠르게 풀리지만(자동 회전 → Secrets Manager, 무료 → Parameter Store, FIPS L3 + 전용 → CloudHSM), 실무에서는 두 가지 함정이 가장 흔하다 — ① 비밀을 코드/환경변수에 평문으로 넣는 안티패턴, ② SecureString을 회전 가능한 것으로 오해하는 실수. 회전이 필요한 비밀은 무조건 Secrets Manager로 가는 게 운영 부담이 가장 적다.

다음 글에서는 사용자 자체를 관리하는 도구 — Cognito User Pool과 Identity Pool을 본다. KMS·Secrets Manager가 "내부 시스템의 비밀"을 다룬다면, Cognito는 "최종 사용자의 인증·인가"를 다루고, 두 영역의 도구가 합쳐져야 풀스택 보안이 완성된다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 RDS PostgreSQL의 admin 비밀번호를 30일마다 자동 회전하고, 회전 도중 애플리케이션 다운타임이 없어야 한다. 가장 적합한 솔루션은?

A) Parameter Store SecureString + cron Lambda로 회전
B) Secrets Manager + AWS 제공 RDS rotation Lambda + 30일 일정
C) CloudHSM에 비밀번호 저장 후 매 30일 수동 변경
D) EC2 환경 변수에 비밀번호 박고 cron으로 회전

**정답: B**

해설: Secrets Manager는 RDS / Aurora / Redshift / DocumentDB에 대해 AWS가 제공하는 회전 Lambda 템플릿을 그대로 쓸 수 있고, AWSPENDING → testSecret → AWSCURRENT 승격의 4단계 라이프사이클로 다운타임 없는 회전을 보장한다. testSecret 실패 시 자동 롤백되므로 운영 안전성도 높다. A는 직접 dual-credential 패턴을 구현해야 해서 위험. C는 회전 자동화 안 됨. D는 보안 안티패턴.

---

**문제 2.** 한 SaaS 회사가 마이크로서비스 200개를 운영하면서 환경별 구성(DB 호스트, 큐 이름, feature flag 등)을 중앙 관리하려고 한다. 대부분은 비밀이 아닌 일반 구성이고, 비용을 최소화하고 싶다. 가장 적합한 서비스는?

A) Secrets Manager에 모두 저장
B) Parameter Store Standard (무료 + SecureString 지원)
C) CloudHSM
D) DynamoDB에 자체 테이블 만들기

**정답: B**

해설: Parameter Store Standard tier는 무료이고 계층형 네임스페이스(`/prod/app/...`)와 `GetParametersByPath` 일괄 조회를 지원한다. 200개 서비스가 각자 수십 개 구성을 가져도 비용이 0이다. Secrets Manager로 모두 저장하면 비밀당 $0.40/월이라 비용이 수백~수천 달러 누적. 비밀번호 같은 진짜 비밀만 Secrets Manager로 분리하고 나머지는 Parameter Store에 두는 분업이 표준 패턴이다.

---

**문제 3.** 한 회사가 us-east-1에서 운영 중인데 ap-northeast-2로 DR을 준비한다. RDS 비밀번호를 두 region에서 동일하게 유지하고, us-east-1에서 회전되면 ap-northeast-2에도 즉시 반영되어야 한다. 가장 적합한 방법은?

A) Secrets Manager Replication으로 ap-northeast-2 복제 추가
B) Parameter Store에 저장하고 cron으로 동기화
C) S3에 JSON 파일로 비밀 저장 후 CRR로 복제
D) us-east-1 비밀을 매번 직접 조회

**정답: A**

해설: Secrets Manager의 멀티 리전 복제(2021년 출시)는 정확히 이 시나리오를 위해 설계됐다. 원본이 회전되면 복제본도 자동 업데이트되고, 복제본 region에서 직접 GetSecretValue 가능해 latency도 낮다. B는 동기화 스크립트 직접 구현 필요. C는 보안·운영 모두 안티패턴. D는 region 간 latency·가용성 문제.

---

**문제 4.** 한 금융 회사가 규제 요구로 "키 자료에 AWS 직원도 접근할 수 없어야 하며, FIPS 140-2 Level 3 인증을 회사 명의로 받아야 한다"는 요구를 받았다. 가장 적합한 서비스는?

A) KMS Customer Managed Key
B) Secrets Manager
C) CloudHSM
D) Parameter Store SecureString

**정답: C**

해설: CloudHSM은 single-tenant HSM이고 FIPS 140-2 Level 3 인증을 고객 명의로 받는다. AWS 직원도 키 자료에 접근할 수 없다는 게 KMS와의 결정적 차이다. KMS도 내부적으로 HSM 위에서 동작하지만 multi-tenant고 인증이 AWS 명의다. 일반적으로 이 정도 규제가 없으면 KMS CMK가 비용·운영 모두 유리하지만, 요구 사항이 명시적이면 CloudHSM이 답이다.

---

**문제 5.** 한 Lambda 함수가 Secrets Manager에서 DB 비밀번호를 가져온다. 30일마다 비밀이 회전되는데, Lambda가 가끔 옛 비밀번호로 호출해 인증 실패가 발생한다. 가장 좋은 해결책은?

A) Lambda를 매번 cold start 시키기
B) AWS Parameters and Secrets Lambda Extension 사용 (TTL 캐싱 + 자동 갱신)
C) Lambda 환경 변수에 비밀번호 직접 박기
D) 회전을 끄고 수동 관리

**정답: B**

해설: AWS Parameters and Secrets Lambda Extension은 2022년 출시된 표준 도구다. 로컬 HTTP 캐시(localhost:2773)를 제공하고 TTL(기본 5분)이 지나면 자동으로 새 값을 가져온다. 코드 한 줄로 캐싱과 회전 대응이 동시에 된다. A는 비용·latency 폭증. C는 회전과 모순되는 안티패턴. D는 회전의 보안 이점 포기.

---

**문제 6.** 한 시스템이 Parameter Store SecureString에 API 키를 저장했다. 90일마다 자동 회전이 필요하지만 SecureString은 회전 기능이 없다는 걸 알았다. 가장 적절한 조치는?

A) Secrets Manager로 마이그레이션 + AWS Lambda rotation
B) SecureString을 평문 String으로 바꾸기
C) Lambda에서 매일 새 키 생성해 SecureString을 직접 수정 (dual-credential 미지원)
D) KMS Multi-Region Keys로 전환

**정답: A**

해설: SecureString은 KMS 암호화만 제공하고 회전 기능은 없다. 자동 회전이 필요하면 Secrets Manager로 옮기는 게 표준이고, 사용자 정의 회전 Lambda를 직접 작성하거나 외부 시스템(예: Stripe API key) rotation 함수를 등록할 수 있다. C는 dual-credential 없이 직접 키만 교체하면 회전 시점에 활성 호출이 실패한다. B·D는 문제와 무관.

---

**문제 7.** 한 회사가 EKS Pod에서 Secrets Manager의 비밀을 가져오려 한다. 가장 권장되는 방식은?

A) Pod 환경 변수에 비밀 평문 박기
B) IRSA(IAM Roles for Service Accounts) + AWS SDK로 직접 GetSecretValue 또는 Secrets Store CSI Driver로 마운트
C) ConfigMap에 평문 저장
D) Node IAM Role로 모든 Pod에 권한 부여

**정답: B**

해설: IRSA는 Pod별로 IAM 권한을 세분화하는 표준 패턴이고, Secrets Store CSI Driver는 Secrets Manager의 비밀을 파일 시스템으로 마운트해서 코드 변경 없이 사용 가능하게 한다. A·C는 보안 안티패턴, D는 권한 분리 불가(모든 Pod가 같은 권한). EKS 환경의 표준 권장은 IRSA + CSI Driver 조합이다.

---

해설 보강: Secrets Manager·Parameter Store·CloudHSM은 시험에서는 키워드 매칭으로 빠르게 풀리지만, 실무에서는 "비밀 분류(진짜 비밀 vs 단순 구성) + 회전 자동화 + 멀티 리전 + 캐싱"의 4가지 축으로 설계가 결정된다. 회전이 필요한 비밀은 Secrets Manager, 일반 구성은 Parameter Store, 컴플라이언스가 강제하면 CloudHSM이라는 분업 원칙을 기억하면 90%의 시나리오는 자동으로 풀린다.
