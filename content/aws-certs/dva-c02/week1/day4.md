# Day 4 - AWS CLI와 SDK: 자격증명 체이닝부터 SigV4까지

개발자가 AWS와 처음 친해지는 도구는 보통 셋이다. **AWS CLI**(터미널에서), **AWS SDK**(코드 안에서), **CloudShell**(브라우저에서). 세 도구가 결국 같은 HTTPS API를 호출하지만, 자격증명 체이닝과 region 결정의 디테일에서 갈린다. 이 디테일이 시험에서 "왜 우리 코드가 한 환경에서는 되는데 다른 환경에서는 안 되나"라는 질문으로 나온다.

오늘은 그 세 도구의 내부 동작 — credential provider chain, named profile, SDK retry 알고리즘, SigV4 서명 — 을 본다. CLI 명령 몇 개를 외우는 게 아니라, 모든 SDK에서 동일하게 적용되는 메커니즘을 이해하는 게 목표다. 일단 메커니즘을 잡으면 어떤 언어 SDK에서도 같은 디버깅 흐름이 통한다.

## AWS CLI v2: 단순한 명령어 도구가 아니다

AWS CLI v1(2013 출시, Python 기반)은 2020년 v2로 대체됐다. v2의 가장 큰 변화는 ① **컨테이너화된 Python 런타임 번들**(시스템 Python에 의존하지 않음), ② **SSO 로그인 통합**(`aws configure sso`), ③ **Auto-prompt 모드**(`aws --cli-auto-prompt`), ④ **클라이언트 측 페이저**(긴 출력 자동 less 처리)다.

CLI는 명령어를 받으면 다음 순서로 실행한다.

```
1. ~/.aws/config에서 region, output format 결정
2. credential provider chain에서 AK/SK/SessionToken 획득
3. service endpoint 결정 (region + service)
4. JSON 요청 생성, SigV4로 서명
5. HTTPS로 endpoint 호출
6. 응답 JSON을 --output(table/json/text/yaml)으로 포맷
```

왜 CLI v1에서 v2로 옮겼는지 알면 도구 설계 관점이 보인다. v1은 시스템에 설치된 Python에 의존했기 때문에, Python 2.7 EOL(2020년 1월)과 함께 충돌이 잦았다. macOS의 시스템 Python을 손대면 Homebrew와 충돌하고, Linux는 ABI 호환 문제로 보안 패치가 어려웠다. v2는 Python 인터프리터를 정적 번들로 묶어 사용자 시스템과 분리했다. AWS는 이 결정으로 매년 수천 건의 GitHub 이슈를 줄였다고 [회고](https://aws.amazon.com/blogs/developer/aws-cli-v2-is-now-generally-available/)했다.

> 🔍 **더 깊이**: CLI v2의 자격증명 체이닝은 다음 순서로 자격증명을 찾는다. 첫 번째로 발견된 것을 사용. (1) 명령줄 옵션(`--profile`), (2) 환경변수(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`), (3) `~/.aws/credentials`의 default profile, (4) `~/.aws/config`의 SSO profile, (5) Web Identity Token File(`AWS_WEB_IDENTITY_TOKEN_FILE`, EKS IRSA), (6) ECS task role(`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`), (7) EC2 인스턴스 메타데이터(IMDSv2). 같은 순서가 모든 SDK(boto3, AWS SDK for Java, Go, .NET 등)에서 일관되게 적용되도록 [AWS SDK Credential Provider 표준](https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html)이 정의돼 있다.

> 💡 **관련 이론**: credential provider chain은 본질적으로 **Chain of Responsibility 패턴**(GoF, 1994)이다. 각 provider가 "내가 처리할 수 있나?"를 보고 못 하면 다음으로 넘긴다. 이 패턴 덕분에 새 provider(예: Pod Identity)가 추가될 때 기존 코드 변경 없이 chain에 끼워 넣을 수 있다. boto3 소스의 `credentials.py`를 보면 `CredentialResolver` 클래스가 정확히 이 패턴으로 구현돼 있다.

## Named Profile: 멀티 계정 다루기

실무에서 거의 모든 개발자가 여러 AWS 계정을 동시에 다룬다. `~/.aws/config`와 `~/.aws/credentials`의 named profile이 이를 해결한다.

```ini
# ~/.aws/config
[default]
region = ap-northeast-2
output = json

[profile dev]
region = ap-northeast-2
role_arn = arn:aws:iam::111111111111:role/DevRole
source_profile = default

[profile prod]
region = us-east-1
role_arn = arn:aws:iam::222222222222:role/ProdRole
source_profile = default
mfa_serial = arn:aws:iam::333333333333:mfa/alice
duration_seconds = 3600

[profile sso-admin]
sso_session = mycompany
sso_account_id = 444444444444
sso_role_name = AdministratorAccess
region = us-east-1

[sso-session mycompany]
sso_start_url = https://mycompany.awsapps.com/start
sso_region = us-east-1
sso_registration_scopes = sso:account:access
```

`source_profile`이 핵심이다. dev profile을 쓰면 CLI는 먼저 default profile의 자격증명을 사용해 `sts:AssumeRole`을 호출하고, 받은 임시 자격증명으로 진짜 API를 호출한다. `mfa_serial`이 있으면 token code를 요구하므로 prod 같은 위험한 계정엔 MFA를 강제할 수 있다.

```bash
# 명령마다 profile 지정
aws s3 ls --profile prod

# 환경변수로 한 세션 동안 고정
export AWS_PROFILE=prod
aws s3 ls

# SSO 로그인 (8시간 유효)
aws sso login --profile sso-admin
```

> ⚠️ **함정**: `~/.aws/credentials`에 있는 access key는 plain text로 저장된다. 디스크 암호화가 안 된 노트북이 분실되면 그대로 키 유출이다. AWS는 IAM User access key 대신 **IAM Identity Center(SSO)** + `aws configure sso`를 강력히 권장한다. SSO는 자격증명을 OS keyring(macOS Keychain, Windows Credential Manager, Linux libsecret)에 암호화 저장하고, 토큰이 만료되면 브라우저로 재인증을 유도한다.

> 📚 **사례**: 2019년 Capital One 사건에서 공격자는 EC2 메타데이터의 IAM Role 임시 키를 훔쳤지만, 만약 그 자리에 노트북 `~/.aws/credentials`의 영구 키가 있었다면 회전이 안 된 채로 수개월 후에 발견됐을 것이다. 2021년 Twitch 소스 코드 유출 사건도 GitHub에 push된 `.aws/credentials`가 한 원인이었다. AWS는 이후 GitHub과 협력해 [Push Protection](https://github.blog/2022-04-04-push-protection-github-advanced-security/)을 통해 AKIA 패턴 키가 push되면 자동 차단한다.

## SDK의 retry 동작: AIMD와 exponential backoff

API 호출이 throttling이나 일시적 오류를 반환하면 SDK는 자동으로 재시도한다. 이 retry 알고리즘이 시험에 직접은 안 나오지만, DynamoDB ProvisionedThroughputExceededException, Lambda 429, S3 SlowDown 같은 시나리오의 답에 깔려 있다.

| Retry 모드 | 기본 시도 횟수 | 알고리즘 | 도입 |
|------|------|------|------|
| Legacy (구) | 4회 | exponential backoff | SDK 초기 |
| Standard (기본) | 3회 (총 4회 호출) | exponential + jitter | 2019 |
| Adaptive (실험) | 3회 | client-side rate limiting + retry | 2020 |

**Standard 모드**는 exponential backoff with jitter를 쓴다. 첫 retry는 0~1초, 두 번째는 0~2초, 세 번째는 0~4초 무작위 대기. jitter가 없으면 모든 클라이언트가 같은 시점에 재시도해 다시 한꺼번에 throttling을 받는 "thundering herd" 문제가 생긴다. 이 알고리즘은 AWS Architecture Blog의 [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)에 자세히 나와 있다.

**Adaptive 모드**는 token bucket 알고리즘으로 클라이언트가 자기 호출 속도를 동적으로 제한한다. 서버 throttle을 받기 전에 미리 늦춘다. 단점은 처리량이 제한될 수 있어서, 기본은 standard다.

> 💡 **관련 이론**: AIMD(Additive Increase, Multiplicative Decrease)는 TCP의 congestion control(Jacobson 1988)에서 출발한 알고리즘이다. throughput을 천천히 늘리되, 손실을 감지하면 빠르게 줄인다. AWS SDK의 adaptive retry는 이와 유사한 철학을 client-side rate limiting에 적용한다. RFC 7567(IETF AQM Working Group, 2015)이 비슷한 메커니즘의 표준화 작업을 다룬다. 더 흥미로운 점은 jitter를 안 쓰면 "thundering herd"가 다시 발생한다는 사실이 [Polly Vavilala et al., SIGCOMM 2017]의 데이터센터 트래픽 분석에서도 재확인됐다는 것이다.

> 🔍 **더 깊이**: SDK retry 결정은 HTTP 상태 코드와 에러 코드로 갈린다. (1) 5xx, 429, 502, 503, 504는 재시도. (2) `ThrottlingException`, `Throttling`, `RequestLimitExceeded`, `RequestThrottled`, `ProvisionedThroughputExceededException`은 재시도. (3) 4xx 중 400 BadRequest, 403 AccessDenied, 404 NotFound는 재시도 안 함(영구 오류). 단 DynamoDB의 `TransactionConflictException`처럼 retryable한 4xx도 있어서 서비스별 예외가 존재한다. boto3 소스의 `retries/special.py`에 모든 retryable 에러 목록이 있다.

> ⚠️ **함정**: Lambda 함수에서 SDK retry를 그대로 두면 함수 timeout과 충돌한다. 기본 timeout 3초인 Lambda 안에서 DynamoDB가 throttling을 반환하면 SDK가 0~1초 + 0~2초 = 최대 3초 대기하다 Lambda가 먼저 죽는다. 이런 경우 `AWS_MAX_ATTEMPTS=1`로 SDK retry를 끄고, 함수 호출자(Step Functions, EventBridge Pipes, SQS DLQ)에서 retry하는 것이 맞다.

## SigV4: 모든 API 호출의 서명

AWS API 호출은 거의 모두 SigV4 서명을 거친다(예외: presigned URL의 query string 서명, IoT의 MQTT 등). SigV4가 어떻게 동작하는지 모르면 "왜 timestamp가 15분 이상 빗나가면 403이 나오는지", "왜 presigned URL이 5분만 유효한지" 같은 디버깅이 안 된다.

```
SigV4 서명 단계:
1. Canonical Request 생성
   - HTTP method, canonical URI, canonical query string
   - canonical headers, signed headers, body hash (SHA256)

2. String to Sign 생성
   - "AWS4-HMAC-SHA256"
   - timestamp (X-Amz-Date)
   - credential scope (date/region/service/aws4_request)
   - SHA256(Canonical Request)

3. Signing Key 유도 (5단계 HMAC)
   kDate    = HMAC("AWS4" + SecretAccessKey, Date)
   kRegion  = HMAC(kDate, Region)
   kService = HMAC(kRegion, Service)
   kSigning = HMAC(kService, "aws4_request")
   
4. 최종 서명 = HMAC-SHA256(kSigning, String to Sign)

5. Authorization 헤더에 포함하거나, presigned URL의 query string에 박음
```

> 🔍 **더 깊이**: SigV4의 5단계 키 유도는 보안 측면에서 의도된 설계다. **kDate**, **kRegion** 등을 분리하면 SecretAccessKey 노출 없이 "이 날짜·이 리전·이 서비스에만 유효한" 중간 키를 만들어 쓸 수 있다. 외부 서비스(예: CloudFront → Lambda@Edge)에 일부 권한만 위임할 때 이 derived key를 전달하는 패턴이 가능. timestamp 15분 skew 제한은 replay attack 방지 — 공격자가 패킷을 가로채도 15분 후엔 못 쓴다. NTP로 클라이언트 시계가 어긋나면 흔히 보는 `SignatureDoesNotMatch` 에러의 원인이다.

> 📚 **사례**: 2024년 후반 AWS는 **SigV4a**(Signature Version 4 Asymmetric)을 출시했다. ECDSA 기반 비대칭 서명으로, 같은 서명이 여러 리전 endpoint에 동시에 유효하다. **Multi-Region Access Point**(S3)나 cross-region 트래픽에서 매 리전마다 서명을 다시 만들지 않고 한 번에 처리할 수 있게 한다. SigV4가 HMAC 대칭키 기반이라 리전마다 다른 서명을 만들어야 했던 한계를 ECDSA로 풀었다.

> 💡 **관련 이론**: HMAC은 RFC 2104(Krawczyk et al., 1997)에서 정의된 메시지 인증 코드다. `HMAC(K, m) = H((K ⊕ opad) || H((K ⊕ ipad) || m))` 구조로, 단순한 해시 연쇄가 가진 length extension 공격에 안전하다. SigV4가 5단계 HMAC 체인을 쓰는 이유는 key derivation function(KDF)의 표준 패턴이고, NIST SP 800-108(KDF in counter mode)과 유사한 보안 속성을 제공한다.

## Presigned URL: 임시 권한을 URL로 패키징

S3 presigned URL은 SDK가 SigV4 서명을 URL의 query string에 박아서 만든 시간 제한 링크다. 받는 쪽은 AWS 자격증명 없이 그 URL만으로 객체에 접근할 수 있다.

```python
import boto3
s3 = boto3.client('s3')
url = s3.generate_presigned_url(
    'put_object',
    Params={'Bucket': 'my-bucket', 'Key': 'upload.bin'},
    ExpiresIn=300  # 5분
)
# 클라이언트가 이 URL로 직접 PUT 가능
```

핵심 제약: **presigned URL의 유효 기간은 발급자의 자격증명 유효 기간을 넘을 수 없다**. EC2 인스턴스 프로파일로 발급한 자격증명이 1시간 후 만료된다면 ExpiresIn=86400(24시간)을 적어도 1시간 후에 죽는다. 시험에 단골로 나온다.

> ⚠️ **함정**: presigned URL이 만들어진 후 발급자의 IAM 권한이 줄어들면, URL은 만료 전에도 무효화된다. SDK는 발급 시점의 권한만으로 서명하지만, 실제 사용 시 AWS는 현재 권한도 같이 평가한다. 그래서 "presigned URL을 생성한 직후 권한을 회수했더니 URL이 갑자기 죽었다"는 디버깅 시나리오가 가능하다.

## CloudShell: 브라우저 안의 EC2

CloudShell은 2020년 12월 출시된 브라우저 기반 셸이다. 별도 EC2를 띄울 필요 없이 콘솔에서 즉시 `aws` 명령을 칠 수 있다. 내부적으로는 Amazon Linux 2 기반 컨테이너가 사용자별로 격리되어 있고, 자격증명은 콘솔 로그인 세션에서 자동 상속된다.

| 특징 | 값 |
|------|------|
| 영구 스토리지 | 1GB (홈 디렉토리) |
| 메모리 | 4GB |
| 세션 idle timeout | 20-30분 |
| 비활성 후 자동 삭제 | 120일 |
| 무료 사용 시간 | 무제한 (호출한 AWS API 비용만 별도) |

CloudShell의 자격증명은 콘솔 세션에서 derived된 임시 자격증명이므로 IAM Role과 동일하게 만료된다. 그래서 `aws sts get-caller-identity`를 치면 `assumed-role` ARN이 나온다. CloudShell은 시험에는 거의 안 나오지만 실무에서 "급한 SQL 한 줄 돌리기"엔 매우 편하다.

## 디버깅: 무엇이 어디서 깨졌는지

CLI/SDK 디버깅의 황금 도구는 `--debug` 플래그다.

```bash
aws s3 ls --debug 2>&1 | grep -E "(endpoint|signature|Status|provider)"
```

이걸 치면 ① 어느 credential provider에서 자격증명을 가져왔는지, ② 어느 endpoint로 호출했는지, ③ SigV4 서명의 canonical request 전문, ④ HTTP 응답 코드와 헤더가 다 나온다. boto3에서는 `boto3.set_stream_logger('', logging.DEBUG)`로 같은 정보를 얻을 수 있다.

```python
import boto3
import logging
boto3.set_stream_logger('', logging.DEBUG)

s3 = boto3.client('s3')
print(s3.list_buckets())
```

실무에서 가장 흔한 디버깅 시나리오는 "왜 자격증명이 예상과 다르게 잡혔나"다. `--debug` 출력에서 `Found credentials in environment variables.` 또는 `Found credentials in shared credentials file.` 같은 라인을 찾으면 어느 provider가 이겼는지 즉시 알 수 있다. 그다음으로는 `Endpoint: https://s3.ap-northeast-2.amazonaws.com` 라인으로 region 결정이 맞는지 확인한다. 마지막으로 `StringToSign:` 블록을 캡처해 자기 코드로 같은 서명을 재현해보면 SDK 외부에서 직접 SigV4를 구현할 때 도움 된다.

## SDK 비교: 언어별 핵심 차이

| SDK | 버전 | 특징 |
|------|------|------|
| boto3 (Python) | 1.x | 가장 풍부한 문서, async는 aioboto3 별도 |
| AWS SDK for JavaScript v3 | 3.x | 모듈형 import(트리 셰이킹), TypeScript first |
| AWS SDK for Java v2 | 2.x | NIO 기반 비동기, builder 패턴 |
| AWS SDK for Go v2 | 2.x | context.Context 기반 cancellation |
| AWS SDK for .NET | 3.x | async/await native, IConfiguration 통합 |
| AWS SDK for Rust | beta | tokio 기반, type-safe |

v2/v3는 v1과 비교해 (1) 비동기 first, (2) 모듈 분리(필요한 client만 import), (3) middleware 시스템(retry, signing, logging이 chainable handler로) 등을 공유한다.

JavaScript SDK v2 → v3 마이그레이션이 특히 큰 이슈인데, v3가 클라이언트별로 npm 패키지를 분리(`@aws-sdk/client-s3`, `@aws-sdk/client-dynamodb` 등)하면서 트리 셰이킹으로 Lambda 패키지 크기가 절반 이하로 줄었다. v2가 모든 서비스를 한 번에 import해서 Node.js Lambda의 cold start에 직접 영향을 줬는데, v3는 필요한 client만 가져오므로 cold start 30~50ms 단축이 일반적이다.

> 💡 **암기 팁**: SDK 버전 표기가 헷갈리는 패턴이다. **Python → boto3가 v1.x**(boto가 v1이었고 boto3가 사실상 v2 역할), **JavaScript는 v3가 모듈형**, **Java/Go/.NET은 v2가 최신**. AWS 공식 문서에서 "SDK v2"라고 하면 JavaScript는 아니고 다른 언어다.

## 정리하며

오늘 본 그림은 CLI/SDK가 결국 같은 메커니즘 — credential provider chain, region 결정, SigV4 서명, retry — 위에서 동작한다는 것이다. Named profile로 멀티 계정을 다루고, IAM Identity Center로 장기 키 없이 SSO를 쓰고, `--debug`로 흐름을 추적하는 패턴들이 모든 SDK에서 동일하게 작동한다.

다음 글에서는 이 1주차 내용을 시험 문제로 정리하고 약점을 짚는다.

---

## 📝 연습 문제

**문제 1.** EC2 인스턴스 안에서 boto3가 자격증명을 어디서 찾는가?

A) 항상 `~/.aws/credentials`에서만
B) 환경변수 → ~/.aws/credentials → IMDS(EC2 인스턴스 메타데이터) 순서
C) 항상 IMDS에서만
D) 코드에 박힌 access key만

**정답: B**
해설: boto3의 credential provider chain은 명령줄 옵션 → 환경변수 → 설정 파일 → 컨테이너/EC2 메타데이터 순서다. 환경변수나 ~/.aws/credentials에 키가 있으면 그것을 우선 쓰고, 없으면 IMDS로 떨어진다. 이 순서가 시험에 자주 나오는데, 핵심은 "**가장 명시적인 것이 우선**"이다. 실무에서 EC2에 attach한 Role이 있는데 SDK가 다른 키를 쓰고 있다면 환경변수나 ~/.aws/credentials를 의심한다.

---

**문제 2.** `aws s3 ls --profile prod` 명령이 `prod` profile이 dev 계정의 access key로 prod 계정의 Role을 assume하도록 설정돼 있다. 이 호출의 흐름은?

A) prod 계정의 IAM User로 직접 호출
B) dev 계정의 access key로 STS AssumeRole 호출 → 임시 자격증명으로 S3 호출
C) prod 계정의 Root account로 호출
D) AWS CLI가 자동으로 cross-account 권한을 부여

**정답: B**
해설: source_profile + role_arn 패턴은 표준 cross-account 위임이다. CLI는 (1) source_profile(dev)의 자격증명을 로드, (2) `sts:AssumeRole(RoleArn=ProdRoleArn)` 호출, (3) 반환된 임시 자격증명으로 진짜 API 호출. dev User에는 `sts:AssumeRole` 권한이, prod Role의 Trust Policy에는 dev 계정의 User를 허용하는 항목이 필요하다. 양쪽이 다 맞아야 동작한다.

---

**문제 3.** boto3가 `SignatureDoesNotMatch` 에러를 반환했다. 가장 가능성 높은 원인은?

A) IAM 권한이 부족함
B) 클라이언트 시계가 NTP 동기화를 잃고 AWS 서버 시간과 15분 이상 차이남
C) 네트워크 연결 끊김
D) SDK 버전이 너무 오래됨

**정답: B**
해설: SigV4 서명에는 `X-Amz-Date` 헤더가 들어가고, AWS 서버는 이 timestamp가 자기 시간과 15분(900초) 이상 차이나면 거부한다. 이는 replay attack 방지 메커니즘이다. NTP 동기화가 끊긴 컨테이너, 시계가 망가진 Docker 컨테이너, 가상머신의 clock drift가 흔한 원인. `date -u`로 UTC 시간을 확인하고 `chronyd` 또는 `ntpd`로 동기화하면 해결된다. A는 `AccessDenied`로 다른 에러.

---

**문제 4.** AWS CLI v2의 SSO 로그인(`aws configure sso`)이 IAM User access key보다 안전한 이유는?

A) 더 빠르다
B) 장기 키가 디스크에 평문으로 저장되지 않고, 토큰이 만료되면 브라우저 재인증을 강제하며, 자격증명은 OS keyring에 암호화 저장
C) AWS가 무료로 제공
D) MFA가 자동 적용

**정답: B**
해설: SSO 모델은 (1) 사용자가 브라우저로 IdP에서 인증, (2) CLI가 받은 OIDC 토큰을 OS keyring에 저장, (3) AssumeRoleWithWebIdentity로 임시 자격증명 발급, (4) 토큰이 8시간 후 만료되면 다시 브라우저 인증 요구. 디스크에 평문 키가 절대 남지 않고, 노트북 분실 시 OS 잠금이 풀리지 않으면 키도 노출되지 않는다. D는 SSO 자체가 MFA를 강제하는 건 아니고, IdP 정책에 따라 결정된다.

---

**문제 5.** Lambda 함수에서 SDK retry 동작을 customize하려면?

A) Lambda 환경변수 `AWS_RETRY_MODE=adaptive`와 `AWS_MAX_ATTEMPTS=5`로 설정
B) SDK retry는 Lambda에서 비활성화됨
C) Lambda runtime을 변경
D) IAM 권한에 retry 권한 추가

**정답: A**
해설: AWS SDK는 모든 언어에서 `AWS_RETRY_MODE`(legacy/standard/adaptive)와 `AWS_MAX_ATTEMPTS`(총 시도 횟수) 환경변수를 인식한다. Lambda 환경변수로 설정하면 함수 안의 모든 SDK 호출에 적용된다. adaptive 모드는 client-side rate limiting을 추가하지만, 일반적으로는 standard가 권장된다. Lambda timeout에 가까운 함수에선 retry로 시간 초과될 위험이 있으니 max attempts를 줄이는 것이 안전하다.

---

**문제 6.** CloudShell 안에서 `aws sts get-caller-identity`를 실행하면 ARN이 무엇으로 나오는가?

A) IAM User ARN
B) assumed-role ARN (콘솔 로그인 세션에서 derived된 임시 자격증명)
C) Root account ARN
D) CloudShell의 서비스 ARN

**정답: B**
해설: CloudShell의 자격증명은 콘솔 로그인 세션에서 자동 상속된다. 콘솔에 IAM User로 로그인했다면 그 User에 STS GetSessionToken을 적용한 임시 자격증명, IAM Identity Center로 로그인했다면 그 SSO Role의 임시 자격증명이다. 둘 다 `aws sts get-caller-identity`에 `assumed-role/...`로 표시된다. CloudShell은 별도 인스턴스 프로파일을 갖지 않는다.

---

**문제 7.** `aws s3 cp` 명령으로 5GB 파일을 업로드하는 중 네트워크가 일시 끊겼다. CLI v2는 어떻게 처리하나?

A) 처음부터 다시 업로드
B) 멀티파트 업로드를 활용해 끊긴 part부터 자동 재시도, 진행 상황은 보존
C) 즉시 실패
D) S3 Transfer Acceleration이 자동 활성화

**정답: B**
해설: AWS CLI는 8MB(기본 multipart_threshold) 이상 파일을 자동으로 멀티파트 업로드로 처리한다. 각 part는 독립적으로 업로드되며 실패 시 그 part만 재시도된다. SDK retry chain이 동작해 transient error는 자동 복구. 만약 CLI 프로세스 자체가 종료되면 진행 중이던 multipart upload는 incomplete 상태로 S3에 남는데, 이게 청구되므로 lifecycle rule(`AbortIncompleteMultipartUpload`)로 자동 정리하는 것이 표준 패턴이다.

---

**문제 8.** Presigned URL의 ExpiresIn=86400(24시간)을 설정했는데 1시간 후 만료된다. 이유는?

A) S3가 24시간 presigned URL을 지원하지 않음
B) 발급자(EC2 인스턴스 프로파일)의 임시 자격증명이 1시간 후 만료되므로, presigned URL도 그 시점에 무효화됨
C) SDK 버그
D) S3 lifecycle 설정

**정답: B**
해설: presigned URL은 발급자의 자격증명으로 SigV4 서명된다. 그 자격증명이 만료되면 URL의 서명도 더 이상 검증되지 않는다. EC2 인스턴스 프로파일은 1시간 임시 자격증명을 자동 갱신하지만, 갱신된 자격증명은 새로 발급한 presigned URL에만 적용된다. 24시간 유효 URL이 필요하면 (1) IAM User access key로 서명하거나(보안 위험), (2) 발급자의 자격증명을 12시간 Role로 assume하고 거기서 발급한다.
