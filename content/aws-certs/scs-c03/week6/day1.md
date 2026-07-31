# Day 1 - Secrets Manager: 자동 회전(Lambda), Parameter Store 비교, 교차계정 시크릿

시크릿(secret)은 "노출되면 곧바로 침해로 이어지는 자격증명"이다. DB 비밀번호, API 키, OAuth 토큰, TLS 개인키가 여기에 속한다. 보안 시험의 관점에서 시크릿 관리의 본질은 단순한 "암호화 저장"이 아니라 *수명주기 전체의 통제*다. 저장 시 암호화, 접근 시 IAM 인가, 사용 후 회전(rotation), 폐기 시 삭제 유예 — 이 네 단계를 모두 관리해야 한다. AWS Secrets Manager는 이 수명주기를 자동화하기 위해 설계된 서비스다.

## 왜 코드/환경변수에 시크릿을 박으면 안 되는가

시크릿을 소스 코드, Git 저장소, EC2 사용자 데이터, 컨테이너 환경변수에 하드코딩하면 세 가지 문제가 발생한다. 첫째, 코드 접근 권한을 가진 모두가 시크릿을 본다(최소 권한 위반). 둘째, 회전이 불가능하다 — 바꾸려면 재배포해야 한다. 셋째, 감사가 안 된다 — 누가 언제 시크릿을 읽었는지 추적할 수 없다. Secrets Manager는 이 세 가지를 모두 해결한다: KMS로 봉투 암호화하고, IAM/리소스 정책으로 접근을 제어하며, CloudTrail로 `GetSecretValue` 호출을 기록한다.

> 💡 **관련 이론**: 시크릿 관리는 *secret zero* 문제로 귀결된다. "시크릿을 안전하게 가져오려면 또 다른 자격증명이 필요한데, 그 자격증명은 어떻게 보호하나?"라는 무한 후퇴다. AWS는 이를 IAM 역할(role)로 끊는다 — EC2/Lambda/ECS는 인스턴스 메타데이터 또는 태스크 역할로 임시 자격증명을 받고, 그 임시 자격증명으로 Secrets Manager를 호출한다. 즉 "기계 신원(machine identity)"이 secret zero를 대체한다. 디스크에 영속 시크릿이 없다.

## 시크릿이 새는 실제 경로

시크릿 관리의 필요성은 추상적 원칙이 아니라 반복된 사고에서 나왔다. 유출 경로는 대체로 네 가지로 수렴한다.

| 유출 경로 | 전형적 형태 | 대응 통제 |
|-----------|-------------|-----------|
| 소스 코드·형상관리 | Git 커밋에 박힌 액세스 키, `.env` 파일 커밋 | 시크릿 외부화, 커밋 훅·저장소 스캐닝 |
| 빌드·CI 로그 | 파이프라인이 환경변수를 그대로 로그에 출력 | 로그 마스킹, OIDC 기반 단기 자격증명 |
| 인스턴스 메타데이터 | SSRF로 IMDS를 찔러 역할의 임시 자격증명 탈취 | IMDSv2 강제, 역할 권한 최소화 |
| 백업·아티팩트 | DB 덤프·컨테이너 이미지 레이어에 남은 자격증명 | 회전, 이미지 스캐닝, 빌드 시 시크릿 미포함 |

> 📚 **사례**: 2019년 Capital One 침해는 시크릿과 기계 신원의 경계가 무너졌을 때 무슨 일이 벌어지는지 보여주는 표준 교재다. 공격자는 애플리케이션의 SSRF 취약점을 이용해 EC2의 인스턴스 메타데이터 서비스(IMDSv1)를 호출했고, 거기서 얻은 EC2 역할의 임시 자격증명으로 S3 데이터를 읽어냈다. 배울 점은 두 가지다. 첫째, 시크릿을 코드에서 걷어내 역할 기반으로 바꾸는 것만으로는 부족하고 *그 역할 자격증명을 꺼낼 수 있는 경로*(SSRF → IMDSv1)까지 막아야 한다. 둘째, 역할에 붙은 권한이 넓으면 탈취 한 번이 전체 데이터로 번진다. AWS가 이후 세션 토큰을 요구하는 IMDSv2를 밀고, 시험이 "SSRF 방어 = IMDSv2 강제 + 역할 최소권한"을 반복해 묻는 배경이 이 사건이다.

> 📚 **사례**: 공개 저장소에 실수로 커밋된 AWS 장기 액세스 키가 자동 스캐너에 수집되어 곧바로 남용되는 패턴은 오래된 단골 사고다. AWS는 이를 완화하려 공개 저장소를 상시 스캔해 노출된 키를 탐지하면 해당 계정에 격리용 관리형 정책(`AWSCompromisedKeyQuarantine` 계열)을 자동 부착하고 소유자에게 통보한다. 그러나 이것은 어디까지나 사후 안전망이다. 근본 대응은 "장기 액세스 키를 아예 발급하지 않는 것"(역할·OIDC 페더레이션)과 "시크릿을 코드 밖으로 빼는 것" 두 가지이며, 시험도 노출 사고의 정답을 항상 *키 회전 + 장기 키 제거 + 역할 전환*으로 잡는다.

## Secrets Manager의 저장·암호화 모델

시크릿 값은 항상 KMS 키로 암호화되어 저장된다. 기본은 AWS 관리형 키 `aws/secretsmanager`지만, 시험에서 권장되는 것은 **고객 관리형 KMS 키(CMK)**다. CMK를 쓰면 키 정책으로 "어떤 보안 주체가 이 시크릿을 복호화할 수 있는가"를 추가로 통제할 수 있고, 교차계정 공유 시 필수가 된다.

```bash
aws secretsmanager create-secret \
  --name prod/db/mysql \
  --description "Production MySQL master credentials" \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234 \
  --secret-string '{"username":"admin","password":"P@ssw0rd!","host":"db.internal","port":3306}'
```

시크릿 값은 JSON 구조로 저장하는 것이 관례다 — 회전 Lambda와 RDS 통합이 `username`/`password` 등 표준 키를 기대하기 때문이다.

### 버전과 스테이징 라벨: 시크릿은 덮어쓰기가 아니라 버전이다

Secrets Manager는 값을 덮어쓰지 않는다. `PutSecretValue`를 호출하면 새 **버전(VersionId)**이 생기고, 그 버전에 **스테이징 라벨(staging label)**이 붙는다. 애플리케이션이 `GetSecretValue`를 라벨 지정 없이 호출하면 `AWSCURRENT` 라벨이 붙은 버전을 받는다.

```
VersionId: 8f3c...   label: AWSPREVIOUS   ← 직전 값 (비교·롤백 근거)
VersionId: a91d...   label: AWSCURRENT    ← 지금 유효한 값 (기본 조회 대상)
VersionId: c5e7...   label: AWSPENDING    ← 회전 중 검증 대기 값
```

라벨은 값에 고정된 것이 아니라 **버전 사이를 이동한다**. 회전이 끝나면 `AWSCURRENT`가 새 버전으로 옮겨 붙고 옛 버전에는 `AWSPREVIOUS`가 붙는다. 이 구조 덕분에 회전 직후 장애가 나면 직전 값을 근거로 원인을 좁힐 수 있다. 커스텀 라벨(예: `CANARY`)을 직접 붙여 일부 워크로드만 새 값을 먼저 쓰게 하는 것도 가능하다.

```bash
# 현재 값 조회 (기본 = AWSCURRENT)
aws secretsmanager get-secret-value --secret-id prod/db/mysql

# 직전 값 조회 — 회전 직후 장애 시 원인 비교에 쓴다
aws secretsmanager get-secret-value \
  --secret-id prod/db/mysql \
  --version-stage AWSPREVIOUS

# 버전과 라벨의 현재 배치 확인
aws secretsmanager list-secret-version-ids \
  --secret-id prod/db/mysql --include-deprecated
```

> 🔍 **더 깊이**: `GetSecretValue`가 라벨 기반이라는 점은 캐싱 설계와 직결된다. 애플리케이션이 특정 VersionId를 고정해 캐싱하면 회전이 일어나도 옛 값을 계속 들고 있게 되고, 회전이 완료되어 옛 자격증명이 무효화되는 순간 인증이 깨진다. 반대로 라벨(`AWSCURRENT`)로 조회하고 캐시 TTL을 회전 주기보다 충분히 짧게 잡으면 회전이 애플리케이션에 자연스럽게 전파된다. "회전은 켰는데 주기적으로 인증 오류가 튄다"는 운영 증상의 상당수가 이 캐싱 축의 실수이지, 회전 로직 자체의 문제가 아니다.

## 접근 통제: IAM 정책 + 리소스 정책

Secrets Manager 접근은 두 축으로 통제된다. **자격증명 기반 정책**(IAM)은 "이 주체가 어떤 시크릿에 무엇을 할 수 있나", **리소스 기반 정책**(시크릿에 직접 붙는 정책)은 "이 시크릿에 누가 접근할 수 있나"를 정의한다. 교차계정 접근은 반드시 리소스 정책이 있어야 한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowAppRoleRead",
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
    "Resource": "arn:aws:secretsmanager:ap-northeast-2:111122223333:secret:prod/db/mysql-*",
    "Condition": {
      "StringEquals": { "aws:PrincipalTag/team": "payments" }
    }
  }]
}
```

> ⚠️ **함정**: 시크릿 ARN 끝의 `-??????` 6자리 무작위 접미사를 잊지 말 것. Secrets Manager는 같은 이름의 시크릿이 삭제·재생성될 때를 구분하려 ARN 끝에 6자 무작위 접미사를 붙인다. IAM 정책 Resource에 `prod/db/mysql`만 쓰면 매칭이 안 된다 — `prod/db/mysql-*`처럼 와일드카드를 붙여야 접미사까지 매칭된다.

## 자동 회전(Rotation): Lambda 기반 4단계

회전은 Secrets Manager의 핵심 가치다. 시크릿이 주기적으로 자동 교체되면 유출된 자격증명의 유효 수명이 짧아진다. 회전은 Lambda 함수가 수행하며, AWS는 RDS·Redshift·DocumentDB용 회전 Lambda 템플릿을 제공한다.

회전 Lambda는 **4단계 step**으로 호출된다:

```
createSecret  → 새 시크릿 값 생성, AWSPENDING 버전 스테이지에 저장
setSecret     → 대상 서비스(예: DB)에 새 자격증명을 실제로 적용(ALTER USER 등)
testSecret    → AWSPENDING 자격증명으로 실제 연결/쿼리 테스트
finishSecret  → AWSPENDING 스테이지를 AWSCURRENT로 승격(이전 CURRENT는 AWSPREVIOUS로)
```

```
[AWSPREVIOUS] ← [AWSCURRENT] ← [AWSPENDING]
   직전 값        현재 사용값      회전 중 신규값
```

> 💡 **관련 이론**: 이 4단계는 *원자적 교체(atomic swap)*를 흉내 낸다. 핵심은 testSecret이 성공해야만 finishSecret로 승격된다는 점이다 — 새 자격증명이 실제로 동작함을 검증한 뒤에야 트래픽을 옮긴다. 만약 setSecret이 DB에 적용됐지만 testSecret이 실패하면, AWSCURRENT는 아직 옛 값을 가리키므로 애플리케이션은 멈추지 않는다. 이것은 무중단 배포의 blue/green 전환과 같은 원리다 — 검증 전까지 트래픽 컷오버를 미룬다.

### 단일 사용자 vs 교대(alternating) 사용자 전략

RDS 회전은 두 가지 전략이 있다:
- **single-user**: 같은 DB 사용자의 비밀번호만 바꾼다. 간단하지만, 비밀번호 변경과 애플리케이션의 캐시 갱신 사이에 짧은 인증 실패 창이 생길 수 있다. 회전 Lambda가 마스터 자격증명을 쓰지 않고 자기 자신을 회전한다.
- **alternating-users**: 두 개의 사용자(예: `app_user_1`, `app_user_2`)를 번갈아 쓴다. 회전 시 사용 중이 아닌 사용자의 비밀번호를 바꾼 뒤 전환하므로 다운타임이 거의 없다. 단, 회전 Lambda가 **마스터(슈퍼유저) 자격증명**을 별도 시크릿으로 가져야 한다(`masterarn` 참조).

> 🎯 **시나리오**: "RDS 비밀번호 회전 중 짧은 인증 오류가 발생하면 안 된다(무중단)"는 빈출이다. 정답은 alternating-users 전략이며, 이를 위해 회전 Lambda에 마스터 자격증명 시크릿을 연결해야 한다. single-user는 구현이 쉽지만 갱신 타이밍에 따라 순간 인증 실패가 가능하다.

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/db/mysql \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:111122223333:function:SecretsManagerRDSMySQLRotation \
  --rotation-rules '{"AutomaticallyAfterDays":30}'
```

회전 Lambda는 VPC 안의 프라이빗 DB에 접근해야 하므로 보통 **DB와 같은 VPC**에 배치되고, Secrets Manager API를 호출하려면 **VPC 엔드포인트(또는 NAT)**가 필요하다. 이 네트워크 경로를 누락하면 회전이 타임아웃으로 실패한다.

### 회전 전략 비교

| 전략 | 동작 | 마스터 시크릿 참조 | 인증 실패 창 | 적합한 곳 |
|------|------|------------------|-------------|-----------|
| single-user | 같은 DB 사용자의 비밀번호를 교체 | 불필요(자기 자신을 회전) | 존재 가능(변경과 캐시 갱신 사이) | 짧은 단절을 감내할 수 있는 배치·내부 도구 |
| alternating-users | 두 사용자를 번갈아 사용, 쉬는 쪽을 먼저 갱신 | **필요**(슈퍼유저로 상대 사용자 비밀번호 변경) | 사실상 없음 | 무중단이 요구되는 프로덕션 |

alternating-users가 항상 우월한 것은 아니다. 마스터(슈퍼유저) 자격증명을 별도 시크릿으로 보관해야 하므로 *더 강력한 시크릿을 하나 더 만드는* 셈이고, 그 시크릿이 침해되면 피해가 훨씬 크다. 그래서 실무에서는 마스터 시크릿을 별도 CMK로 암호화하고 회전 Lambda 역할에만 Decrypt를 허용하는 식으로 격리한다. "무중단이 필요한가"와 "마스터 자격증명을 자동화에 맡길 수 있는가"의 교환이다.

### 회전 네트워크 경로: 실패의 대부분은 여기서 난다

```
[ 회전 Lambda가 필요로 하는 두 갈래 경로 ]

               ┌─────────────── VPC (프라이빗 서브넷) ────────────────┐
               │                                                     │
               │   Rotation Lambda ──(1) SQL: ALTER USER ...──→ RDS  │
  Secrets      │        │                                            │
  Manager ←────┼────────┘ (2) GetSecretValue / PutSecretValue        │
   API         │        └─→ Interface VPC Endpoint (secretsmanager)  │
               │             또는 NAT Gateway → 인터넷 경유           │
               └─────────────────────────────────────────────────────┘

  (1)만 되고 (2)가 안 되면 → createSecret/finishSecret에서 타임아웃
  (2)만 되고 (1)이 안 되면 → setSecret/testSecret에서 DB 연결 실패
```

Lambda를 VPC에 붙이는 순간 퍼블릭 인터넷으로의 기본 경로가 사라진다. 그래서 두 번째 경로(Secrets Manager API)를 잊는 것이 가장 흔한 실패 원인이다. 인터페이스 엔드포인트를 쓸 때는 엔드포인트의 보안 그룹이 Lambda ENI로부터의 443을 허용해야 하고, 프라이빗 DNS가 켜져 있어야 `secretsmanager.<region>.amazonaws.com`이 엔드포인트로 해석된다.

### 회전 실패를 어떻게 알아채는가

회전은 백그라운드에서 일어나므로 실패해도 조용하다. 세 가지 관측면을 미리 걸어 둔다.

| 관측면 | 무엇을 보는가 | 신호의 의미 |
|--------|---------------|-------------|
| CloudTrail | `RotationSucceeded` / `RotationFailed` 이벤트 | 회전 시도 자체의 성공·실패 |
| Lambda CloudWatch 로그 | 4단계 중 어디서 예외가 났는지 | 실패 지점(step) 특정 |
| `DescribeSecret` | `LastRotatedDate` / `NextRotationDate` | 예정 시각이 지났는데 갱신 안 됨 = 실패 누적 |

```bash
# 회전 상태 점검 — 마지막 회전 시각과 규칙을 함께 본다
aws secretsmanager describe-secret --secret-id prod/db/mysql \
  --query '{Rotation:RotationEnabled,LastRotated:LastRotatedDate,Next:NextRotationDate,Lambda:RotationLambdaARN}'

# 스케줄과 무관하게 즉시 한 번 회전 (검증용)
aws secretsmanager rotate-secret --secret-id prod/db/mysql --rotate-immediately

# 회전이 중간에 멈춰 AWSPENDING이 남았을 때 정리
aws secretsmanager cancel-rotate-secret --secret-id prod/db/mysql
```

> 🎯 **시나리오**: "회전을 활성화했는데 값이 바뀌지 않고 `NextRotationDate`만 계속 밀린다. 원인을 찾아라"는 전형적 진단 문항이다. 점검 순서는 정해져 있다 — (1) CloudTrail에서 `RotationFailed`를 확인해 회전이 시도되기는 했는지 본다. (2) Lambda 로그에서 어느 step에서 예외가 났는지 본다. (3) `setSecret`/`testSecret`에서 멈췄으면 Lambda→DB 방향(보안 그룹·서브넷 라우팅·DB 사용자 권한)을, `createSecret`/`finishSecret`에서 멈췄으면 Lambda→Secrets Manager 방향(VPC 엔드포인트·프라이빗 DNS)과 실행 역할의 `secretsmanager:PutSecretValue`·`UpdateSecretVersionStage`, KMS `Decrypt`/`GenerateDataKey` 권한을 본다. 결국 원인은 **네트워크 경로 아니면 권한** 둘 중 하나로 수렴한다.

## Parameter Store와의 비교: 언제 무엇을

AWS Systems Manager Parameter Store도 비밀값을 `SecureString`으로 KMS 암호화해 저장할 수 있다. 시험은 둘의 선택 기준을 묻는다.

| 항목 | Secrets Manager | Parameter Store (SecureString) |
|------|-----------------|--------------------------------|
| 자동 회전 | 내장(Lambda 통합) | 없음(직접 구현 필요) |
| 교차계정 공유 | 리소스 정책 지원 | 표준 파라미터는 미지원(Advanced도 제한적) |
| 비용 | 시크릿당 월정액 + API 호출 | Standard 무료, Advanced 유료 |
| 크기 한도 | 최대 64KB | Standard 4KB / Advanced 8KB |
| 랜덤 비밀번호 생성 | `GetRandomPassword` 내장 | 없음 |
| RDS/Redshift 통합 | 1급 통합 | 없음 |
| 용도 | 회전·교차계정이 필요한 진짜 시크릿 | 설정값, 회전 불필요한 단순 비밀, 비기밀 구성 |

> ⚠️ **함정**: "비용 최소화 + 회전 불필요한 단순 API 키 저장"이면 Parameter Store SecureString이 정답이다. 반대로 "DB 비밀번호 자동 회전" 또는 "교차계정 시크릿 공유"가 요구되면 Secrets Manager다. 흥미롭게도 Parameter Store는 Secrets Manager 시크릿을 `/aws/reference/secretsmanager/{secret-name}` 경로로 *참조*할 수 있어, 두 서비스를 함께 쓰는 패턴도 가능하다.

## 애플리케이션은 시크릿을 어떻게 받아 가는가

시험은 "시크릿을 저장했다"에서 끝나지 않고 "런타임이 그것을 어떻게 집어 가는가"를 묻는다. 주입 방식마다 노출면이 다르기 때문이다.

| 주입 방식 | 동작 | 노출면 |
|-----------|------|--------|
| SDK로 `GetSecretValue` 직접 호출 | 애플리케이션 코드가 런타임에 조회 | 가장 좁다. 값이 프로세스 메모리에만 존재 |
| ECS 태스크 정의의 `secrets` 필드 | ECS 에이전트가 조회해 컨테이너 환경변수로 주입 | 환경변수는 컨테이너 메타데이터·크래시 덤프에 노출될 수 있음 |
| Lambda 확장(Parameters and Secrets Extension) | 확장이 로컬 HTTP 엔드포인트로 캐싱 제공 | 좁다. 호출 횟수·지연도 함께 개선 |
| EKS Secrets Store CSI 드라이버 | 시크릿을 파드의 볼륨 파일로 마운트 | 파일 권한·노드 침해 시 노출 |

어떤 방식이든 공통 원칙은 같다. 값을 디스크에 영속시키지 말고, 로그에 찍지 말고, 캐시 TTL을 회전 주기보다 짧게 둔다.

> ⚠️ **함정**: "환경변수로 주입했으니 안전하다"는 흔한 오해다. 환경변수는 그 자체로 암호화된 저장소가 아니라 프로세스 컨텍스트이고, 컨테이너 메타데이터 조회·크래시 덤프·자식 프로세스 상속을 통해 새어 나갈 수 있다. Lambda 환경변수는 저장 시 KMS로 암호화되지만 실행 시점에는 프로세스에 평문으로 존재한다. 정확한 이해는 "환경변수를 절대 쓰지 말라"가 아니라 **"코드 하드코딩보다는 낫고 SDK 직접 조회보다는 노출면이 넓다"**는 서열이다.

## 교차계정 시크릿 공유

계정 A의 시크릿을 계정 B의 역할이 읽게 하려면 **두 가지**가 모두 필요하다:

1. **시크릿 리소스 정책**: 계정 B 주체를 허용
2. **KMS 키 정책**: 계정 B 주체가 그 키로 복호화하도록 허용 — AWS 관리형 키 `aws/secretsmanager`는 키 정책을 수정할 수 없으므로 **반드시 CMK여야 한다**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "CrossAccountRead",
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::444455556666:role/AppReader" },
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*"
  }]
}
```

그리고 KMS CMK 키 정책에 계정 B의 `kms:Decrypt`를 허용해야 한다. 계정 B 역할의 IAM 정책에도 `secretsmanager:GetSecretValue`와 `kms:Decrypt`가 있어야 한다(세 정책이 교집합으로 인가된다).

> 🎯 **시나리오**: "교차계정 시크릿 공유 시 계정 B에서 `AccessDeniedException`(KMS) 발생"의 전형적 원인은, 시크릿이 AWS 관리형 키로 암호화되어 있어서다. 관리형 키는 키 정책을 편집할 수 없어 외부 계정 복호화를 허용할 방법이 없다. 해결책: 시크릿을 CMK로 재암호화하고 키 정책에 계정 B의 Decrypt를 추가한다.

```
[ 교차계정 시크릿 조회가 통과해야 하는 세 관문 ]

계정 B의 역할 ──GetSecretValue──→ ┌ (1) 계정 B IAM 정책: 이 역할이 호출해도 되나?
                                  ├ (2) 계정 A 시크릿 리소스 정책: 이 주체를 받아 주나?
                                  └ (3) 계정 A CMK 키 정책: 이 주체가 복호화해도 되나?

  셋 중 하나라도 빠지면 AccessDenied.
  단, (3)에서 막히면 오류가 KMS를 가리키고 (1)(2)에서 막히면 Secrets Manager를 가리킨다.
  ▶ 오류 문구가 어느 서비스를 가리키는지가 진단의 첫 단서다.
```

### 조직 단위로 넓히기: `aws:PrincipalOrgID`

계정을 하나씩 열거하는 리소스 정책은 계정이 늘어날 때마다 고쳐야 한다. Organizations를 쓴다면 조직 ID 조건으로 한 번에 묶고, 동시에 조직 밖·비TLS 접근을 Deny로 못 박는다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOrgReadOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-abcd1234ef" }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "secretsmanager:*",
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

`Principal: "*"`에 조건으로 조직을 묶는 이 형태는 "조직 안의 주체라면, 그리고 자기 계정 IAM 정책이 허용한다면"이라는 뜻이다. `Principal: "*"`만 보고 공개 정책이라고 오독하지 말 것 — 인가는 `Condition`과 요청자 계정의 IAM 정책이 함께 결정한다. 반대로 조건 없는 `Principal: "*"`는 진짜로 위험하다.

### 다중 리전 복제

`ReplicateSecretToRegions`로 시크릿을 다른 리전에 복제하면, 주 리전의 값이 바뀔 때 복제본이 자동으로 따라온다. 리전 장애 시 복제본을 독립 시크릿으로 승격할 수 있다. 복제본은 대상 리전의 KMS 키로 다시 암호화되므로, 대상 리전에도 대응 CMK와 그 키 정책이 필요하다.

```bash
aws secretsmanager replicate-secret-to-regions \
  --secret-id prod/db/mysql \
  --add-replica-regions \
    Region=ap-southeast-1,KmsKeyId=arn:aws:kms:ap-southeast-1:111122223333:key/wxyz-9876
```

> ⚠️ **함정**: 복제본에는 회전을 따로 걸지 않는다. 회전은 **주 리전 시크릿**에서만 수행되고 그 결과가 복제본으로 전파된다. "각 리전에서 독립적으로 회전을 설정한다"는 보기는 오답이다. 또한 복제본은 읽기 대상일 뿐이므로, 복제본에 직접 `PutSecretValue`를 시도하는 설계도 잘못이다.

## 삭제 유예와 복구

`DeleteSecret`은 즉시 삭제가 아니라 **7~30일 복구 대기 기간**을 둔다(기본 30일). 이 기간 동안 `RestoreSecret`으로 복구 가능하다. 실수나 악의적 삭제로부터 보호하는 안전장치다. 즉시 삭제가 정말 필요하면 `--force-delete-without-recovery`를 쓰지만, 시험에서는 "실수 삭제 방지"를 위해 기본 유예 기간을 권장한다.

> 🔍 **더 깊이**: Secrets Manager에는 자동 캐싱 클라이언트 라이브러리가 있어, 애플리케이션이 매 호출마다 `GetSecretValue`를 때리지 않고 메모리에 캐싱하다가 회전 시점에만 갱신한다. 이것은 비용(API 호출당 과금)과 가용성(Secrets Manager 장애 시에도 캐시된 값으로 동작)을 모두 개선한다. 캐시 TTL을 회전 주기보다 짧게 잡는 것이 핵심이다 — 그래야 회전된 새 자격증명을 제때 집어온다.

## 로그로 읽는 시크릿 접근

`GetSecretValue`는 CloudTrail **관리 이벤트**로 기본 기록된다(S3 객체 읽기처럼 별도 데이터 이벤트를 켤 필요가 없다). 이벤트 하나에서 읽어야 할 항목은 정해져 있다.

```
eventName        : GetSecretValue           ← 무엇을 했나
userIdentity     : AssumedRole + 세션 이름  ← 누가 (어느 역할, 어느 세션)
sourceIPAddress  : 10.0.3.11 / 공인 IP      ← 어디서
requestParameters.secretId                   ← 어떤 시크릿을
errorCode        : AccessDeniedException     ← 실패했다면 왜 (없으면 성공)
```

조사관이 이 이벤트에 던지는 질문은 세 가지다. (1) 이 역할이 원래 이 시크릿을 읽던 주체인가 — 아니라면 권한 확대의 징후다. (2) `sourceIPAddress`가 평소 워크로드 대역인가 — 개발자 노트북이나 낯선 공인 IP라면 자격증명 탈취를 의심한다. (3) 짧은 시간에 여러 시크릿을 훑는 패턴인가 — 이는 침해 이후 자격증명 수집(credential harvesting) 단계의 전형이다.

CloudTrail만으로 상시 감시하기 어렵다면 GuardDuty를 켜 둔다. GuardDuty는 CloudTrail 이벤트를 학습해 "평소와 다른 주체·위치에서의 API 호출"을 이상 행위로 띄운다. 그 finding을 EventBridge로 흘려 자동 대응(세션 무효화, 해당 시크릿 즉시 회전)에 연결하는 것이 표준 배선이다.

> 🎯 **시나리오**: "개발자 계정이 침해된 정황이 있다. 시크릿에 대한 즉각 대응 순서는?"이 나오면 답은 순서를 가진다 — (1) 탈취 의심 주체의 권한 차단(역할 신뢰 정책 수정, 세션 무효화), (2) 노출 가능성이 있는 모든 시크릿을 **즉시 회전**(`rotate-secret --rotate-immediately`), (3) CloudTrail로 실제 조회된 시크릿을 확정해 피해 범위를 좁힘, (4) 대상 서비스(DB 등)의 기존 세션 강제 종료. "시크릿을 삭제한다"는 오답이다. 삭제는 복구 대기 기간 때문에 즉시 효과가 없고 애플리케이션만 멈춘다. **유출된 자격증명의 해독제는 삭제가 아니라 회전이다.**

## 한 줄 요약

시크릿 관리는 "암호화해서 어딘가에 넣어 두는 일"이 아니라 **생성·배포·회전·감사·폐기라는 수명주기를 자동화하는 일**이다. Secrets Manager는 회전(Lambda 4단계)과 교차계정 공유(리소스 정책 + CMK 키 정책)라는 두 능력으로 값을 매기고, 그 둘이 필요 없으면 Parameter Store SecureString이 더 싸고 단순한 정답이다. 시험의 갈림길은 언제나 같은 세 질문으로 압축된다 — *회전이 필요한가, 교차계정인가, 비용이 우선인가.*

---

## 📝 연습 문제

**문제 1.** RDS MySQL 마스터 비밀번호를 자동 회전하되, 회전 중 단 한 건의 인증 실패도 발생하면 안 된다. 가장 적절한 회전 전략은?

A) single-user 회전 — 같은 사용자의 비밀번호만 교체  
B) alternating-users 회전 — 두 사용자를 번갈아 쓰고 마스터 자격증명 시크릿을 회전 Lambda에 연결  
C) 회전을 비활성화하고 수동으로 분기마다 교체  
D) Parameter Store SecureString으로 옮긴 뒤 회전  

**정답: B**  
해설: alternating-users 전략은 현재 사용 중이 아닌 사용자의 비밀번호를 먼저 바꾼 뒤 전환하므로 인증 실패 창이 사실상 없다. 이를 위해 회전 Lambda는 슈퍼유저(마스터) 자격증명을 별도 시크릿으로 참조해야 한다. single-user는 비밀번호 변경과 캐시 갱신 사이에 순간 실패가 가능하고, 수동 회전은 자동화 요구에 어긋나며, Parameter Store는 자동 회전 기능 자체가 없다.

---

**문제 2.** 계정 A의 시크릿을 계정 B의 IAM 역할이 읽으려 하자 KMS 관련 `AccessDeniedException`이 발생한다. 시크릿은 `aws/secretsmanager` 관리형 키로 암호화되어 있다. 올바른 조치는?

A) 계정 B 역할에 `secretsmanager:GetSecretValue`만 추가하면 된다  
B) 시크릿을 고객 관리형 KMS 키(CMK)로 암호화하고, 그 키 정책에 계정 B의 kms:Decrypt를 허용한다  
C) 시크릿 복구 대기 기간을 늘린다  
D) 시크릿을 계정 B로 복제한다  

**정답: B**  
해설: 교차계정 복호화에는 시크릿 리소스 정책, KMS 키 정책, 계정 B IAM 정책 세 가지가 모두 필요하다. AWS 관리형 키 `aws/secretsmanager`는 키 정책을 편집할 수 없어 외부 계정에 Decrypt를 부여할 방법이 없다. 따라서 CMK로 재암호화하고 키 정책에 계정 B 주체의 kms:Decrypt를 추가해야 한다. GetSecretValue만으로는 복호화 단계에서 막히고, 복구 기간이나 복제는 무관하다.

---

**문제 3.** 회전 Lambda의 4단계 중, 새 자격증명이 실제로 동작하는지 검증한 뒤에야 현재 버전으로 승격되도록 보장하는 메커니즘은?

A) createSecret이 AWSCURRENT를 즉시 갱신한다  
B) testSecret이 AWSPENDING 자격증명으로 연결을 검증하고, 성공해야만 finishSecret이 AWSPENDING을 AWSCURRENT로 승격한다  
C) setSecret이 검증과 승격을 동시에 수행한다  
D) finishSecret이 먼저 승격한 뒤 testSecret으로 사후 검증한다  

**정답: B**  
해설: 회전은 createSecret(신규 생성, AWSPENDING) → setSecret(대상에 적용) → testSecret(AWSPENDING으로 실제 검증) → finishSecret(승격) 순서다. testSecret이 성공해야 finishSecret이 AWSPENDING을 AWSCURRENT로 올린다. 검증 실패 시 AWSCURRENT는 옛 값을 유지하므로 애플리케이션이 멈추지 않는다. createSecret/setSecret은 승격하지 않으며, 승격을 검증보다 먼저 하면 무중단 보장이 깨진다.

---

**문제 4.** 회전이 필요 없고 비용을 최소화하면서 단순 API 키 하나를 KMS 암호화해 저장하려 한다. 가장 적절한 서비스는?

A) Secrets Manager — 회전 기능을 끄고 사용  
B) Parameter Store의 SecureString 파라미터(Standard 티어)  
C) S3 객체로 SSE-KMS 저장  
D) DynamoDB 항목에 평문 저장  

**정답: B**  
해설: 회전·교차계정 공유가 불필요하고 비용이 우선이면 Parameter Store SecureString(Standard 티어, 무료)이 최적이다. KMS로 암호화 저장하고 IAM으로 접근을 통제한다. Secrets Manager는 시크릿당 월정액이 들어 단순 저장에는 과하고, S3/DynamoDB는 시크릿 전용 수명주기 기능이 없다. DynamoDB 평문 저장은 보안상 부적절하다.

---

**문제 5.** IAM 정책에서 `Resource`를 `arn:aws:secretsmanager:...:secret:prod/db/mysql`로 정확히 지정했는데도 `GetSecretValue`가 거부된다. 가장 가능성 높은 원인은?

A) 시크릿 ARN 끝의 6자 무작위 접미사가 매칭되지 않아서 — `prod/db/mysql-*`처럼 와일드카드를 붙여야 한다  
B) KMS 키가 비활성화되어서  
C) 시크릿 복구 대기 중이라서  
D) Parameter Store와 이름이 충돌해서  

**정답: A**  
해설: Secrets Manager는 같은 이름의 시크릿이 삭제·재생성될 때를 구분하려 ARN 끝에 `-` + 6자 무작위 문자를 붙인다. 정책 Resource에 접미사 없는 정확한 이름만 쓰면 실제 ARN과 매칭되지 않아 거부된다. `prod/db/mysql-*` 또는 `prod/db/mysql-??????`로 접미사를 포함해야 한다. KMS 비활성화는 복호화 단계에서 다른 오류를 내고, 복구 대기·이름 충돌은 이 증상의 원인이 아니다.

---
