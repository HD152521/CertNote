# Day 3 - STS와 정책 조건: 임시 자격증명의 깊은 세계

어제 Role을 보며 "STS가 임시 자격증명을 발급한다"고 한 줄로 넘어갔다. 그런데 그 임시 자격증명이 정확히 어떤 구조이고, 어떻게 검증되고, 어떻게 만료되는지를 모르면 실무에서 만나는 가장 흔한 IAM 문제들 — "왜 SDK가 갑자기 401을 던지지?", "왜 federation 토큰이 1시간 후에 죽지?", "왜 Lambda가 자기 함수 ARN을 모르지?" — 를 풀 수 없다.

오늘은 STS의 4개 API를 깊이 보고, 정책의 Condition 키들을 ABAC 관점에서 분석하고, 리소스 기반 정책의 cross-account 패턴 — 특히 confused deputy 문제와 External ID — 를 본다. 시험에 가장 자주 나오는 영역 중 하나이면서, 실무에서 IAM이 깨질 때 90%가 이 영역이다.

## STS: Security Token Service의 정체

STS는 **임시 자격증명을 발급하는 글로벌 서비스**다. 2011년 출시됐고, 처음엔 `sts.amazonaws.com`(글로벌)만 있었지만 2018년부터 리전별 endpoint(`sts.ap-northeast-2.amazonaws.com`)가 권장된다. 이유는 latency와 신뢰성. 글로벌 endpoint는 us-east-1에 물리적으로 위치하므로, us-east-1 장애 시 글로벌 endpoint도 죽는다. 리전 endpoint를 쓰면 그 리전 안에서만 의존성이 닫힌다.

STS가 왜 별도의 서비스로 분리됐는지를 보면 클라우드 자격증명 모델의 본질이 보인다. 전통적인 시스템에서는 인증(authentication)과 인가(authorization)가 한 곳에 묶여 있었다(LDAP, AD, Kerberos KDC). 그런데 AWS처럼 수백 개 서비스에 수억 개 자원이 흩어진 환경에서는 그 모델이 안 통한다. 그래서 AWS는 인증의 결과를 **검증 가능한 토큰**으로 만들어 흘려보내고, 각 서비스가 그 토큰만 보고 권한 평가를 한다. STS가 토큰 발급자(token issuer)이고, IAM은 권한 정책 저장소이고, 각 서비스(S3, DynamoDB...)는 token verifier 역할을 한다. 이게 OAuth2/OIDC 모델과 정확히 같은 구조다.

STS의 핵심 API는 다섯 가지다.

| API | 입력 | 출력 | 용도 |
|------|------|------|------|
| `AssumeRole` | RoleArn, RoleSessionName | 임시 자격증명 (15분~12시간) | 같은 계정·cross-account Role 전환 |
| `AssumeRoleWithSAML` | RoleArn, PrincipalArn, SAMLAssertion | 임시 자격증명 (15분~12시간) | AD/Okta SAML federation |
| `AssumeRoleWithWebIdentity` | RoleArn, WebIdentityToken | 임시 자격증명 (15분~12시간) | Google/Facebook/Cognito OIDC, EKS IRSA |
| `GetSessionToken` | (DurationSeconds, MFA token) | 임시 자격증명 (15분~36시간) | IAM User의 MFA 강화 세션 |
| `GetFederationToken` | Name, Policy | 임시 자격증명 (15분~36시간) | 커스텀 federation broker |
| `GetCallerIdentity` | (none) | 현재 호출자의 ARN | 디버깅 |

> 🔍 **더 깊이**: AssumeRole이 반환하는 자격증명은 ① AccessKeyId(시작이 `ASIA`로 다름, 영구 키는 `AKIA`), ② SecretAccessKey, ③ **SessionToken**(JWT 비슷한 구조의 base64 문자열) 3종 세트다. SDK가 API를 호출할 때 SigV4 서명에 모든 3개를 사용한다. AWS 서비스는 받은 SessionToken을 STS 공개키로 검증해 만료 여부와 권한을 확인한다. 영구 키와 달리 임시 키는 STS 측에서 즉시 revoke가 가능하다(`aws sts revoke-credentials` 또는 `revoke older sessions` 액션). 더 흥미로운 점은 SessionToken 안에 원래 Role의 권한 스냅샷이 박혀 있어, 발급 이후 Role의 Permission Policy를 바꿔도 그 세션엔 반영되지 않는다. AWS가 검증을 분산할 수 있는 이유다.

> 💡 **관련 이론**: STS의 임시 자격증명은 OAuth 2.0의 access token, Kerberos의 ticket-granting ticket과 같은 계열의 메커니즘이다. 모두 "단기 유효 토큰 + 갱신 메커니즘"이라는 패턴을 공유한다. 보안 측면에서 이 패턴이 우월한 이유는 **유출되어도 자동으로 무효화된다**는 점. 1시간 후 자동 만료되는 토큰을 훔쳐도 다음 시간엔 못 쓴다. 반면 IAM User의 access key는 명시적으로 회전하지 않는 한 영구 유효하다. 이 차이가 Capital One 사고(IMDSv1으로 EC2의 영구 access key를 훔침)와 Twitter 해킹(직원 세션이 1시간으로 제한됐다면 피해 축소) 양쪽의 핵심이다.

> 🔍 **더 깊이**: AccessKeyId의 prefix가 자격증명 종류를 알려준다. `AKIA`는 영구 IAM User key, `ASIA`는 STS 임시 키, `AROA`는 Role 식별자, `AGPA`는 Group, `AIDA`는 User. 보안 도구가 GitHub에 키가 노출됐는지 검사할 때 이 prefix로 정규식을 짠다. truffleHog, GitGuardian 같은 도구가 정확히 이 패턴을 본다. `ASIA`로 시작하는 키가 노출되면 정상적으론 곧 만료되지만, 발급 후 12시간 이내라면 여전히 위험하다.

## AssumeRole의 Trust Policy: 누가 이 Role을 빌릴 수 있는가

Role을 만들 때 함께 정의하는 Trust Policy는 "**누가** 이 Role을 assume할 수 있는가"를 결정한다. 이건 일반 Permission Policy와 다른 종류의 정책이다. Permission Policy가 "이 Role을 쓰는 사람이 무엇을 할 수 있나"를 정한다면, Trust Policy는 그 한 단계 위의 게이트키퍼다.

```json
// Trust Policy 예시: EC2 서비스가 이 Role을 assume할 수 있음
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}

// Cross-Account: 다른 계정의 모든 User/Role이 assume 가능
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::123456789012:root"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"sts:ExternalId": "my-shared-secret-12345"},
    "Bool": {"aws:MultiFactorAuthPresent": "true"}
  }
}
```

`Principal`이 누구를 허용할지를 결정한다. `Service`는 AWS 서비스(예: `ec2.amazonaws.com`, `lambda.amazonaws.com`), `AWS`는 같은 또는 다른 계정의 IAM 엔터티, `Federated`는 SAML/OIDC provider다. Trust Policy가 막으면 Permission Policy가 아무리 넓어도 assume이 안 된다.

서비스 principal의 이름이 직관과 다르게 잡힌 경우가 있다. 예를 들어 ECS Task Role의 Trust Principal은 `ecs.amazonaws.com`이 아니라 `ecs-tasks.amazonaws.com`이다. Lambda는 `lambda.amazonaws.com`이지만 Lambda@Edge용 Role은 `lambda.amazonaws.com`과 `edgelambda.amazonaws.com` 두 개를 동시에 trust해야 한다. RDS Enhanced Monitoring은 `monitoring.rds.amazonaws.com`이라는 이상한 이름을 쓴다. 이런 비대칭은 AWS의 서비스 진화 역사에서 비롯됐고, 시험에 종종 함정으로 나온다.

> ⚠️ **함정**: Trust Policy의 Principal에 `"AWS": "arn:aws:iam::123456789012:root"`을 적었다고 해서 "그 계정의 root user만" 허용하는 게 아니다. **그 계정 안의 모든 IAM 엔터티가 잠재적 허용 대상**이라는 뜻이다. 실제 assume이 일어나려면 그 엔터티가 자기 계정 안에서 `sts:AssumeRole` 권한도 가져야 한다(양쪽 평가). 그래서 cross-account는 항상 양쪽 정책이 모두 허용해야 동작한다.

## Confused Deputy 문제와 External ID

이게 시험에 자주 나오면서 실무에서도 자주 사고 나는 부분이다. 시나리오를 보자. SaaS 백업 회사 SaaS-Backup이 우리 S3에 백업 데이터를 쓰기 위해 우리 계정에 Role을 만든다. Trust Policy의 Principal은 SaaS-Backup의 계정 ID로 잡는다.

문제는 SaaS-Backup이 다른 고객 X도 받았을 때다. 공격자 X가 SaaS-Backup에게 "우리 백업도 처리해줘"라고 요청하면서 우리 Role의 ARN을 넣어버린다면? SaaS-Backup은 자기 계정으로 AssumeRole을 호출할 권한이 있으므로 우리 Role을 빌려 우리 S3에 X의 백업을 덮어쓸 수 있다. **SaaS가 "고객을 헷갈려서" 다른 고객의 자원에 접근**하는 이 현상을 confused deputy라고 한다. 이 용어는 1988년 Norm Hardy가 capability security 맥락에서 처음 명명했고, 본질은 "권한을 가진 대리인(deputy)이 누구를 위해 일하는지 모를 때 생기는 권한 오남용"이다.

해결책이 **External ID**다. 우리 Role의 Trust Policy에 `sts:ExternalId` Condition을 추가해 우리만 아는 비밀 문자열을 강제한다. SaaS-Backup이 우리 Role을 assume하려면 우리가 알려준 External ID를 같이 보내야 한다. X는 우리 External ID를 모르므로 SaaS-Backup이 X의 요청을 처리하려 해도 우리 Role 검증에 실패한다.

> ⚠️ **함정**: External ID는 흔히 "비밀번호"로 오해되지만, 실은 "**고객 식별자**"에 가깝다. 강력한 무작위성보다 "각 고객마다 다른 값"이 핵심이다. SaaS 측에서는 고객별 External ID를 DB에 저장해 매번 다르게 사용한다. AWS는 모든 third-party SaaS Role 설정 시 External ID를 강제로 사용하라고 권장한다. Datadog, New Relic, Splunk, Snowflake 모두 가입 시 External ID를 자동 생성해서 보여준다.

> 📚 **사례**: 2023년 5월에 일부 보안 연구자들이 AWS의 SaaS 통합 패턴에서 External ID를 안 쓰거나, 모든 고객에게 같은 External ID를 부여하는 third-party 벤더들을 찾아냈다. 이들은 confused deputy 공격에 무방비였고, 일부는 다른 고객의 S3 데이터에 접근 가능했다. AWS는 이후 [공식 가이드](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html)에서 "고객별로 다른, 추측 불가능한 External ID"를 명시적으로 요구하기 시작했다.

## Condition: ABAC의 엔진

Policy의 Condition 절은 IAM 평가의 가장 강력한 부분이다. AWS는 수백 개의 condition key를 제공하는데, 시험에 자주 나오는 것들을 분류해두면 빠르다.

| 카테고리 | 키 | 예시 |
|------|------|------|
| 글로벌 (모든 서비스) | `aws:RequestedRegion` | `"StringEquals": "ap-northeast-2"` |
|  | `aws:SourceIp` | `"IpAddress": "203.0.113.0/24"` |
|  | `aws:SourceVpc` | `"StringEquals": "vpc-abc123"` |
|  | `aws:SecureTransport` | `"Bool": "true"` (HTTPS 강제) |
|  | `aws:MultiFactorAuthPresent` | `"Bool": "true"` |
|  | `aws:MultiFactorAuthAge` | `"NumericLessThan": "3600"` (MFA 1시간 이내) |
|  | `aws:PrincipalTag/Dept` | `"StringEquals": "Engineering"` |
|  | `aws:RequestTag/Env` | `"StringEquals": "prod"` |
|  | `aws:CurrentTime` | `"DateGreaterThan": "2026-01-01T00:00:00Z"` |
|  | `aws:UserAgent` | `"StringLike": "aws-cli/*"` |
| S3 서비스 | `s3:prefix` | "사용자별 폴더 강제" |
|  | `s3:x-amz-server-side-encryption` | `"StringEquals": "AES256"` |
|  | `s3:RequestObjectTag/Sensitivity` | `"StringEquals": "Public"` |
| EC2 서비스 | `ec2:InstanceType` | "t3 패밀리만 허용" |
|  | `ec2:ResourceTag/Owner` | 인스턴스 태그 기준 |

> 🔍 **더 깊이**: `aws:PrincipalTag`와 `aws:RequestTag`의 조합은 ABAC의 핵심이다. Engineering 부서 사용자는 `Dept=Engineering` 태그를 갖고, Engineering이 만드는 자원도 `Dept=Engineering` 태그를 가져야 한다고 강제하면, 단일 정책으로 부서별 자원 분리를 구현할 수 있다. Identity와 자원에 같은 태그가 붙어 있을 때만 액션을 허용하는 패턴: `"Condition": {"StringEquals": {"aws:RequestTag/Dept": "${aws:PrincipalTag/Dept}"}}`. RBAC라면 부서마다 Group과 Policy를 만들어야 하는데, ABAC로는 정책 하나로 끝난다. NIST는 SP 800-162에서 ABAC를 RBAC 다음 세대로 명시했고, AWS는 2017년 이를 IAM에 도입했다.

> 💡 **관련 이론**: SigV4 서명 알고리즘(AWS API의 표준 인증)은 HMAC-SHA256 기반이다. 클라이언트가 ① canonical request(method, URI, headers, body hash), ② string-to-sign(timestamp, scope, canonical request hash), ③ signing key(SecretAccessKey를 다섯 단계 HMAC로 derive)를 만들어 최종 서명을 생성한다. 임시 자격증명에서는 SessionToken을 `X-Amz-Security-Token` 헤더로 같이 보낸다. SigV4는 RFC 형태로 표준화되진 않았지만 [공식 가이드](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_aws-signing.html)가 그 자리를 한다. 2024년 후반에 출시된 **SigV4a**는 동일 서명으로 여러 리전 endpoint에 동시에 호출 가능한 새 버전이고, S3 Multi-Region Access Point에서 쓰인다. 서명 자체에 리전을 박지 않고 별도 ECDSA 키를 derive해 multi-region 검증을 가능케 한다.

> ⚠️ **함정**: `aws:SourceIp`는 **AWS 서비스를 경유하면 동작하지 않는다**. 예를 들어 Lambda가 S3를 호출할 때 `aws:SourceIp`로 사내 IP만 허용하는 정책은 막혀 버린다. Lambda → S3는 AWS 내부망에서 호출되므로 SourceIp가 사내 IP가 아닌 AWS 내부 IP다. 이런 경우 `aws:SourceVpc`나 `aws:SourceVpce`(VPC Endpoint) 키를 써야 한다. 실제 시험에 자주 나온다.

## IRSA: EKS의 IAM 통합

EKS(Kubernetes on AWS)에서 Pod에 IAM 권한을 주는 표준 방법이 IRSA(IAM Roles for Service Accounts)다. 핵심 아이디어는 Kubernetes Service Account를 OIDC 토큰의 issuer로 만들고, AWS가 그 OIDC provider를 신뢰해서 AssumeRoleWithWebIdentity를 허용하는 것이다.

```
1. Pod 시작 → Service Account의 OIDC 토큰을 자동 주입 (kube-apiserver가 sign)
2. AWS SDK가 환경변수 AWS_ROLE_ARN, AWS_WEB_IDENTITY_TOKEN_FILE 확인
3. SDK가 STS AssumeRoleWithWebIdentity 호출 (OIDC 토큰 함께)
4. STS가 OIDC JWKS endpoint에서 EKS 클러스터 공개키 조회 → 토큰 서명 검증
5. STS가 임시 자격증명 발급 (15분 ~ Role MaxSessionDuration)
6. SDK가 만료 5분 전에 자동 재호출로 갱신
7. Pod 안의 코드가 그 자격증명으로 AWS API 호출
```

이 메커니즘 덕분에 노드 단위가 아닌 **Pod 단위 권한 분리**가 가능해진다. 같은 워커 노드 위에 있는 두 Pod이 완전히 다른 IAM Role을 가질 수 있다. 2023년 출시된 **EKS Pod Identity**는 OIDC를 거치지 않는 더 단순한 대안으로, eks-pod-identity-agent라는 데몬셋이 메타데이터 endpoint를 노출해 SDK가 직접 받아간다. 차이가 중요한데, IRSA는 클러스터 외부 OIDC provider 설정이 필요하고 multi-cluster 환경에서 관리가 복잡한 반면, Pod Identity는 EKS 콘솔에서 클릭으로 끝난다. 단 Pod Identity는 IRSA보다 늦게 나와서 일부 third-party 운영자(Karpenter, Cluster Autoscaler 구버전)와 호환되지 않는다.

> 🔍 **더 깊이**: IRSA의 OIDC 검증 흐름은 standard JWT 검증이다. STS는 EKS 클러스터의 OIDC issuer URL(예: `oidc.eks.ap-northeast-2.amazonaws.com/id/ABCDEF1234`)에서 JWKS를 가져와 캐싱하고, 토큰의 서명을 검증한다. 토큰의 `sub` 클레임이 `system:serviceaccount:default:my-sa` 형태라서, IAM Role의 Trust Policy에서 `oidc.eks...:sub` Condition으로 특정 Service Account만 허용할 수 있다. 만약 Condition을 빼면 클러스터의 모든 Pod이 그 Role을 빌릴 수 있어 큰 보안 구멍이 된다. 시험에 자주 나오는 함정.

## Cross-Account의 4가지 패턴

| 패턴 | 메커니즘 | 적합한 경우 |
|------|------|------|
| Role chaining | A 계정 사용자 → B 계정 Role assume → C 계정 Role assume | 다단 위임 |
| Resource-based policy | B 계정 S3 버킷 정책에 A 계정 사용자를 Principal로 명시 | S3/SQS/SNS/Lambda 등 |
| RAM (Resource Access Manager) | 자원을 다른 계정과 공유 (Transit Gateway, Subnet 등) | 인프라 공유 |
| AWS Organizations + delegated admin | 마스터 계정이 멤버 계정에 위임 | Security Hub, GuardDuty 중앙 관리 |

Role chaining에는 숨은 제약이 있다. **체이닝된 세션은 최대 1시간**이다. A 계정에서 B Role을 assume할 때 `DurationSeconds=12*3600`을 줘도, B Role을 통해 C Role을 다시 assume하면 그 세션은 자동으로 1시간 제한이다. AWS가 무한 chaining 공격을 막기 위해 둔 제약인데, 장기 배치 워크로드에서 갑자기 토큰이 만료되는 원인이 되곤 한다. 해결: chaining 대신 처음부터 가장 깊은 Role을 직접 assume하거나, SDK의 자동 refresh 로직을 신뢰한다.

Resource-based policy는 두 방향에서 평가된다는 점이 중요하다. A 계정의 사용자가 B 계정의 S3 버킷에 접근하려면 ① A 계정의 IAM 정책이 S3 접근을 허용하고, ② B 계정의 버킷 정책이 A 계정을 허용해야 한다. **OR가 아니라 AND**다. 단 같은 계정 안의 resource-based policy는 OR로 평가되는데(IAM Policy가 허용하지 않아도 Bucket Policy가 허용하면 OK), cross-account는 AND다. 이 비대칭이 종종 정답을 가른다.

> 📚 **사례**: 2020년 7월 Twitter 해킹. 공격자들이 사회공학으로 직원 자격증명을 탈취해 admin 도구에 접근, 130개 계정(Obama, Biden, Musk 등)을 비트코인 사기에 동원했다. AWS 사고는 아니지만, 직접적 교훈은 **세션 길이 제한과 MFA**다. 만약 사용자 세션이 1시간 max, MFA 강제였다면 공격 시간 창이 훨씬 좁았을 것이다. AWS에서는 IAM Role의 `MaxSessionDuration`을 짧게(1시간) 유지하고, Trust Policy에 `aws:MultiFactorAuthPresent` 조건을 거는 것이 표준 가이드다.

> 📚 **사례**: 2022년 3월 Okta 해킹. Lapsus$ 그룹이 Okta의 third-party support 직원 노트북을 통해 일부 고객 데이터에 접근했다. Okta는 즉시 모든 영향 세션을 revoke했지만, 일부 OIDC 토큰은 expiration까지 유효했다. 교훈: federation을 쓰면 IdP가 뚫렸을 때 다운스트림 AWS 세션을 강제 만료하는 메커니즘이 필요하다. AWS는 이후 IAM Role의 `aws:TokenIssueTime` Condition을 활용해 "특정 시점 이전 발급 토큰 거부" 패턴을 권장하기 시작했다.

## 권한 평가 알고리즘의 정확한 순서

시험에 가장 자주 나오면서 가장 자주 틀리는 게 IAM 평가 순서다. AWS는 [공식 문서](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)에서 명시적으로 정의한다.

```
1. SCP (Service Control Policy) — Organizations에서 강제. 거부면 즉시 거부.
2. Resource-based policy — S3 버킷 정책 등. 같은 계정이면 OR, cross-account면 AND.
3. Identity-based policy — User/Group/Role의 attached policies.
4. Permission boundary — Role/User에 설정된 상한. 거부면 즉시 거부.
5. Session policy — AssumeRole 시 inline으로 좁힌 범위. 거부면 즉시 거부.
6. Explicit Deny — 어떤 단계에서든 Deny가 나오면 최종 결과는 Deny.
```

Explicit Deny가 모든 Allow를 이긴다는 점, 그리고 SCP/Permission Boundary는 **상한을 정한다**는 점(권한을 부여하지 않고 차감만 한다)이 핵심이다. SCP를 처음 도입하는 조직이 가장 자주 하는 실수가 "SCP에 Allow를 적었으니 권한이 생긴다"는 오해다. SCP는 차단만 한다.

## 정리하며

오늘의 핵심은 네 가지다. 첫째, STS는 임시 자격증명의 공장이고 AssumeRole·AssumeRoleWithSAML·AssumeRoleWithWebIdentity가 그 3대 주력 API다. 둘째, Condition 절은 IAM이 ABAC로 진화한 엔진이고, `aws:PrincipalTag`와 `aws:RequestTag`의 조합으로 정책 폭발 없이 부서별 자원 분리가 가능하다. 셋째, cross-account 시나리오의 confused deputy 문제는 External ID로 해결한다. 넷째, IAM 평가는 SCP → Resource-based → Identity-based → Boundary → Session policy 순으로 흐르고, Explicit Deny가 모든 Allow를 이긴다.

다음 글에서는 이 위에 올라가는 AWS CLI, SDK, CloudShell의 실전 사용 — 자격증명 체이닝, 프로필 관리, 서명 디버깅 — 을 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 외부 SaaS 백업 서비스에게 자기 S3에 백업 데이터를 쓰게 하려고 한다. 가장 안전한 설정은?

A) IAM User를 만들어 access key를 SaaS에게 전달
B) IAM Role을 만들고 Trust Policy에 SaaS의 계정 ID와 External ID 조건을 함께 명시
C) S3 버킷을 public으로 설정
D) S3 presigned URL을 SaaS에게 매시간 갱신해 전달

**정답: B**
해설: External ID는 confused deputy 문제를 막는다. SaaS의 계정 ID만 신뢰하면, SaaS가 다른 고객 요청을 처리하다 우리 Role을 잘못 빌릴 수 있다. External ID로 "이건 우리 고객의 요청이다"를 검증한다. A는 장기 키 유출 위험, C는 데이터 노출, D는 매시간 갱신이 운영 부담 + presigned URL은 키 노출과 본질적으로 같다. 실무에서는 External ID를 16자리 이상 무작위 문자열로 만들고 절대 GitHub이나 Jira 티켓에 평문으로 두지 않는다.

---

**문제 2.** Lambda 함수에서 `boto3.client('s3').list_buckets()`가 `ExpiredToken` 에러를 반환했다. 가장 가능성 높은 원인은?

A) Lambda 함수의 IAM Role이 잘못 설정됐다
B) Lambda가 8시간 넘게 실행되면서 STS 자격증명 갱신에 실패했다 (Lambda max 15분)
C) Lambda 함수 코드 내부에서 `assume_role`을 호출하고 받은 임시 자격증명을 1시간 이상 후에 사용했다
D) S3 버킷이 다른 리전에 있다

**정답: C**
해설: Lambda 함수가 IMDS-like 메커니즘으로 자동으로 받는 자격증명은 SDK가 만료 전 자동 갱신한다. 하지만 코드 안에서 명시적으로 `sts.assume_role()`을 호출해 받은 임시 자격증명은 자동 갱신되지 않는다. 1시간이 지나면 만료된다. 해결책은 SDK의 `boto3.Session(profile_name='...')` 또는 `sts.assume_role` 시 더 긴 `DurationSeconds`(최대 12시간)를 명시하거나, 만료 시간 추적 후 재발급. B는 Lambda max 실행 시간이 15분이라 불가능한 시나리오.

---

**문제 3.** 다음 Trust Policy가 의미하는 것은?
```json
{"Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}
```

A) EC2 인스턴스 안의 OS가 root 권한을 가짐
B) ec2.amazonaws.com 서비스가 이 Role을 assume할 수 있어, EC2 인스턴스에 attach 가능
C) EC2가 만든 AMI에 IAM 권한이 박힌다
D) 잘못된 정책이다

**정답: B**
해설: AWS 서비스 자체가 Role을 assume할 수 있게 하려면 Trust Policy의 Principal에 서비스 이름을 명시한다. `ec2.amazonaws.com`은 EC2가 이 Role을 인스턴스 프로파일로 attach해 사용할 수 있다는 뜻. 비슷하게 Lambda 실행 역할은 `lambda.amazonaws.com`, ECS Task Role은 `ecs-tasks.amazonaws.com`(주의: `ecs.amazonaws.com`이 아님)이다.

---

**문제 4.** ABAC 패턴: 모든 자원에 `Project` 태그가 붙고, IAM Principal에도 `Project` 태그가 있다. "자기 프로젝트 자원에만 접근 가능"을 표현하는 Condition은?

A) `"StringEquals": {"aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"}`
B) `"StringEquals": {"aws:PrincipalTag/Project": "AllProjects"}`
C) `"StringNotEquals": {"aws:RequestTag/Project": "*"}`
D) `"Bool": {"aws:PrincipalTag/Project": "true"}`

**정답: A**
해설: ABAC의 표준 패턴이다. `aws:ResourceTag/Project`는 호출 대상 자원의 태그, `${aws:PrincipalTag/Project}`는 호출자의 태그를 변수로 치환. 두 값이 같을 때만 허용. 이 단일 정책이 1000개 프로젝트, 1만 명 사용자에서도 동작하므로 RBAC의 role explosion을 해결한다. 단, ABAC가 작동하려면 모든 자원에 일관된 태그가 강제돼야 한다(SCP나 IaC로 강제).

---

**문제 5.** STS Regional endpoint(`sts.ap-northeast-2.amazonaws.com`) 대신 글로벌 endpoint(`sts.amazonaws.com`)를 쓰면 어떤 위험이 있나?

A) 비용이 더 비싸다
B) us-east-1 장애 시 글로벌 endpoint도 영향을 받아 다른 리전 워크로드도 자격증명 발급에 실패할 수 있다
C) 처리량 제한이 더 낮다
D) FIPS 인증을 받을 수 없다

**정답: B**
해설: STS 글로벌 endpoint는 물리적으로 us-east-1에 있다. 2017년 S3 us-east-1 장애 같은 사건이 발생하면 글로벌 endpoint를 통한 STS 호출도 실패한다. AWS는 2018년부터 모든 SDK가 기본적으로 리전 endpoint를 쓰도록 권장하고 있다(boto3는 1.18.0부터, AWS SDK for Java v2는 처음부터 기본). `AWS_STS_REGIONAL_ENDPOINTS=regional` 환경변수로 강제 가능. 글로벌 endpoint 토큰은 모든 리전에서 유효하지만, 리전 endpoint 토큰도 기본은 모든 리전에서 유효하다(legacy 동작 외).

---

**문제 6.** EKS Pod에서 AWS API를 호출하려고 한다. 가장 안전한 방법은?

A) Pod 안의 환경변수에 IAM User access key를 주입
B) 워커 노드의 인스턴스 프로파일에 모든 권한을 부여 (모든 Pod이 공유)
C) IRSA(IAM Roles for Service Accounts) 또는 EKS Pod Identity로 Pod별 Role 부여
D) AWS Secrets Manager에 키를 저장하고 Pod이 부팅 시 다운로드

**정답: C**
해설: IRSA는 Pod 단위로 IAM Role을 부여한다. Service Account → OIDC token → STS AssumeRoleWithWebIdentity 경로로 임시 자격증명을 받으므로 장기 키가 없다. B는 같은 노드의 모든 Pod이 같은 권한을 공유해 least privilege 위배. A·D는 결국 장기 키 노출 위험. 2023년 EKS Pod Identity가 출시되며 IRSA보다 더 단순한 구성으로 같은 효과를 낼 수 있다(OIDC 설정 불필요).

---

**문제 7.** AssumeRole 호출 시 RoleSessionName의 역할은?

A) Role의 ARN을 결정
B) CloudTrail 감사 로그에서 어떤 세션인지 추적하기 위한 식별자
C) 임시 자격증명의 만료 시간
D) MFA 토큰의 검증 키

**정답: B**
해설: RoleSessionName은 CloudTrail 로그에 그대로 기록되는 식별자다. 한 Role이 여러 사용자에게 공유될 때 누가 언제 무엇을 했는지 추적할 수 있게 한다. 예: 50명 개발자가 같은 `DevRole`을 assume한다면, 각자 `alice@company.com`, `bob@company.com` 같은 RoleSessionName을 사용해 누구의 액션인지 식별. CloudTrail의 `userIdentity.sessionContext.sessionIssuer.userName`과 `userIdentity.arn`을 함께 보면 정확한 흐름이 나온다.

---

**문제 8.** A 계정의 사용자가 B 계정의 S3 버킷에 접근해야 한다. 어떤 정책 조합이 필요한가?

A) B 계정의 버킷 정책에 A 계정 Principal 허용만으로 충분
B) A 계정 사용자의 IAM 정책에 S3 접근 허용만으로 충분
C) A 계정 사용자의 IAM 정책 + B 계정 버킷 정책 둘 다 허용 (AND)
D) SCP를 양쪽 계정에 적용

**정답: C**
해설: Cross-account의 핵심 원칙. Resource-based policy가 있어도 cross-account에서는 양쪽이 모두 허용해야 한다(AND). 같은 계정 안이라면 OR(둘 중 하나만 있어도 OK)이지만 cross-account는 AND. 이 비대칭이 시험과 실무 양쪽에서 자주 함정으로 등장한다.
