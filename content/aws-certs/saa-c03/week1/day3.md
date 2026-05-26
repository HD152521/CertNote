# Day 3 - IAM 심화: STS, 권한 경계, 그리고 Confused Deputy의 그림자

Day 2에서 본 IAM은 4대 엔터티와 정책 평가 로직이 핵심이었다. 그런데 실제 운영에 들어가면 곧 한 단계 더 깊은 질문이 떠오른다. "다른 계정의 Lambda가 우리 S3를 읽어야 한다", "사용자가 만든 Role이 너무 강하다", "외부 SaaS가 우리 AWS에 안전하게 들어오려면 어떻게 해야 하나" 같은 질문이다. 답은 모두 **STS(Security Token Service)** 와 **Permissions Boundary**, 그리고 **External ID** 라는 도구에 있다.

이 글은 IAM의 진짜 보안 모델 — Role 빌리기, 권한 상한 강제, 위임 신뢰 — 를 다룬다. 시험에서 가장 많이 틀리는 영역이고, 실무에서도 가장 자주 사고가 나는 영역이다. 한 가지 미리 짚어둘 것은, IAM은 2010년에야 처음 나왔고 STS는 2011년에 뒤이어 등장했다는 점이다. 그 전까지 AWS의 "다른 계정 위임"이라는 게 그냥 root key 공유였다는 사실을 떠올려보면 — 이 도구들이 왜 이렇게 보수적으로 설계됐는지가 보인다.

## STS는 무엇을 발급하는가

STS는 AWS의 **임시 자격 증명 발급 서비스**다. 핵심 API 다섯 개를 알면 끝이다.

| API | 호출자 | 용도 |
|-----|--------|------|
| `AssumeRole` | IAM User / Role | 같은 계정 또는 cross-account Role 빌리기 |
| `AssumeRoleWithSAML` | SAML 페더레이션 사용자 | 회사 IdP(AD FS, Okta) 로그인 후 |
| `AssumeRoleWithWebIdentity` | OIDC 토큰 보유자 | Google/Facebook 로그인, EKS IRSA, GitHub Actions OIDC |
| `GetSessionToken` | IAM User (보통 MFA용) | 본인의 권한 그대로 임시 토큰 |
| `GetFederationToken` | IAM User | 외부 사용자에게 권한 위임 시 (대개 IAM Identity Center로 대체) |

STS가 발급하는 자격 증명은 항상 3종 세트다.

```
AccessKeyId      : ASIA로 시작 (영구 키는 AKIA로 시작)
SecretAccessKey  : HMAC 시드
SessionToken     : 만료 시각 + 서명 메타데이터
```

만료 시간은 기본 1시간이고, Role마다 `MaxSessionDuration`을 1~12시간 사이로 설정 가능하다. Role chaining(Role A를 빌려서 Role B를 빌리는 것)은 최대 1시간으로 강제된다 — 이게 보안 경계 차원에서 의도된 제한이다. 무한 chaining을 허용하면 한 번 발급된 토큰의 권한 폭이 시간상으로 무한히 늘어날 수 있고, 감사 추적도 끊기기 때문이다.

> 🔍 **더 깊이**: STS는 글로벌 엔드포인트 `sts.amazonaws.com`(us-east-1로 라우팅)과 리전 엔드포인트 `sts.ap-northeast-2.amazonaws.com`을 둘 다 제공한다. 글로벌 엔드포인트는 us-east-1 장애 시 같이 죽으므로 실무에선 **리전 엔드포인트를 명시적으로 사용**하는 게 표준이다. AWS SDK는 기본적으로 환경변수 `AWS_STS_REGIONAL_ENDPOINTS=regional`을 권장한다. 2017년 S3 us-east-1 대장애 때 STS도 같이 흔들려서 다른 리전의 워크로드까지 인증 실패가 발생한 사건이 이 패턴의 직접적 계기다. 동일한 이유로 SigV4 서명 검증 자체는 리전별로 독립이지만, "토큰을 새로 발급받는 단계"가 글로벌 엔드포인트에 묶이면 단일 장애점이 된다.

> 💡 **관련 이론**: STS는 사실상 **Capability-based security** 의 구현이다. 1966년 Dennis & Van Horn 논문 "Programming Semantics for Multiprogrammed Computations"에서 처음 제시된 이 개념은 "권한을 신원에 묶지 말고 양도 가능한 토큰에 묶자"는 아이디어다. JWT(RFC 7519), OAuth 2.0 Access Token(RFC 6749), Kerberos Ticket(RFC 4120)이 모두 같은 가족이다. STS 토큰은 OAuth 2.0의 단명 토큰과 거의 같은 보안 속성을 갖는다. ACL 기반(누가 무엇에 접근 가능한가 — 신원 중심) vs Capability 기반(이 토큰을 가진 자에게 권한 — 토큰 중심)의 비교는 1972년 Saltzer가 "Protection and the Control of Information Sharing in Multics"에서 정리한 고전 주제다.

> 🔍 **더 깊이**: STS 토큰의 만료 1시간 기본값은 우연이 아니다. NIST SP 800-63B의 세션 관리 가이드에서 권장하는 "재인증 주기"와 거의 일치한다. 너무 짧으면(예: 5분) 콜드 스타트마다 STS 호출이 폭증해 throttling(`Rate exceeded`)이 발생하고, 너무 길면(예: 12시간) 키 노출 시 공격 윈도우가 길어진다. 1시간은 그 trade-off의 산업 표준값에 가깝다.

## Trust Policy: Role을 누가 빌릴 수 있는가

Role에는 두 종류의 정책이 붙는다. **Permissions Policy**(이 Role이 무엇을 할 수 있는가)와 **Trust Policy**(누가 이 Role을 빌릴 수 있는가). Trust Policy는 사실상 Role의 Resource Policy다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::111122223333:root"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"sts:ExternalId": "unique-uuid-per-tenant"},
      "Bool": {"aws:MultiFactorAuthPresent": "true"}
    }
  }]
}
```

여기서 `Principal: "arn:aws:iam::111122223333:root"`는 "계정 111122223333의 어떤 신원이든 들어와도 된다"는 뜻이지 root 사용자만 허용한다는 뜻이 아니다. 자주 헷갈리는 부분이다. 실제로 호출자 계정 안에서 누가 빌릴 수 있는지는 그 쪽 계정의 IAM 정책이 결정한다. 즉 양쪽 계정의 정책이 모두 `sts:AssumeRole`을 명시적으로 허용해야 비로소 Role이 빌려진다.

> ⚠️ **함정**: `"Principal": {"AWS": "*"}`로 두면 모든 AWS 계정이 이 Role을 빌릴 수 있다는 끔찍한 설정이 된다. 시험에선 "어떤 Trust Policy가 가장 위험한가" 류로 출제되고, 답은 거의 항상 `*` 또는 `Condition` 없는 광역 위임이다. 실무에서도 Datadog/PagerDuty 설정 가이드를 복붙하다가 External ID를 빼먹는 일이 흔히 벌어진다.

## Confused Deputy 문제와 External ID

Confused Deputy는 1988년 Norm Hardy가 "The Confused Deputy: or why capabilities might have been invented"에서 명명한 보안 취약점이다. 권한 있는 중개자(Deputy)가 자신의 권한을 잘못 위임받아 의도치 않은 행위를 하는 상황을 말한다. Hardy가 든 원래 예는 "컴파일러가 청구 파일을 덮어쓴 사건"이었지만, 클라우드 SaaS 시나리오에서 이 문제는 거의 매번 등장한다.

예를 들어 Datadog이 우리 AWS 계정의 CloudWatch 로그를 수집한다고 하자. Datadog의 AWS 계정 안 Role에 `sts:AssumeRole` 권한을 주면 Datadog은 우리 Role을 빌려 우리 로그를 읽는다. 그런데 만약 다른 Datadog 고객 X가 우리 Role의 ARN을 알아내서 자기 Datadog 콘솔에서 "이 Role을 모니터링 대상으로 등록"하면? Datadog은 X의 요청으로 우리 Role을 빌리려 시도할 수 있다 — 이게 Confused Deputy. Deputy(Datadog)의 권한이 "원래 의도된 위임자(우리)"가 아닌 "타인(X)"에 의해 trigger된 것이다.

해결책이 **External ID**다. Trust Policy에 `sts:ExternalId`를 조건으로 걸고, 그 값을 우리 ↔ Datadog 사이에만 공유되는 비밀로 설정한다. X가 우리 Role ARN을 알아도 External ID를 모르면 AssumeRole이 실패한다.

```json
"Condition": {
  "StringEquals": {"sts:ExternalId": "550e8400-e29b-41d4-a716-446655440000"}
}
```

External ID는 비밀일 필요는 없고(추측 불가능하면 됨), Role ARN과 1:1로 묶이는 게 핵심이다. 보통 UUIDv4 같은 충돌 확률이 사실상 0인 식별자를 쓴다.

> 📚 **사례**: 2018년 한 보안 연구자가 여러 SaaS 모니터링 도구의 Role 등록 절차에 External ID가 누락된 걸 발견하고 PoC를 공개했다. 이후 AWS는 "Cross-Account Role + External ID"를 ISV 인증의 기본 요건으로 만들었고, 현재 AWS Marketplace에 올라오는 모든 third-party 통합은 External ID를 강제로 요구한다. 더 오래된 사례로는 2014년 Code Spaces 사고 — AWS root 자격 증명이 노출돼 모든 S3 버킷·EBS 스냅샷이 12시간 만에 삭제됐고 회사가 문을 닫았다. Cross-account를 직접 위임하지 않더라도 "위임 가능한 토큰을 광역으로 부여"하는 패턴이 얼마나 위험한지를 보여주는 사건이다.

> 💡 **관련 이론**: Confused Deputy 문제는 capability-based security의 출발점이기도 하다. ACL이 "누가 무엇에 접근 가능한가"를 신원 기준으로 묶는 데 반해, capability는 "이 토큰을 가진 자에게 권한"이라 위임 시 신원 정보를 명시적으로 동반해야 한다. External ID는 그 신원 정보의 한 형태다. OAuth 2.0의 `state` 파라미터(RFC 6749 § 10.12), SAML의 `Audience` 제한자, OIDC의 `aud` claim도 같은 원리로 confused deputy를 방지하는 메커니즘이다.

## Permissions Boundary: 권한의 상한선

Permissions Boundary는 User나 Role에 첨부하는 **권한의 상한선**이다. 실효 권한 = (Identity Policy) ∩ (Permissions Boundary). 즉 Identity Policy가 `s3:*`을 줘도 Boundary에 `s3:GetObject`만 있으면 Get만 된다.

이게 필요한 시나리오는 명확하다. 개발자에게 "Role을 마음대로 만들어 써라"고 권한을 주고 싶지만 그 Role이 root급 권한을 갖는 것은 막고 싶을 때. 정책으로 "Role을 만들 때 반드시 X Boundary를 첨부해야 한다"는 조건을 걸면 된다.

```json
{
  "Effect": "Allow",
  "Action": ["iam:CreateRole", "iam:PutRolePolicy"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::111122223333:policy/DevBoundary"
    }
  }
}
```

| 메커니즘 | 적용 | 효과 |
|---------|------|------|
| Identity Policy | User/Group/Role | 가능한 권한 정의 |
| Permissions Boundary | User/Role | 가능한 권한의 상한 |
| SCP | Organizations OU/Account | 계정 전체 상한 |
| Session Policy | AssumeRole 시 | 그 세션만의 추가 축소 |
| Resource Policy | 리소스 | 리소스 측 허용 |

실효 권한 = 위 5개의 교집합 + 어디든 명시적 Deny 우선. 수학적으로 보면 `Effective = IdentityPolicy ∩ Boundary ∩ SCP ∩ SessionPolicy ∩ ResourcePolicy` 같은 구조이고, 그 위에 `Deny` 우선이라는 단락 평가가 얹힌다.

> ⚠️ **함정**: Permissions Boundary는 권한을 "주지" 않는다. 상한선만 정한다. Identity Policy가 `s3:GetObject`를 안 줬으면 Boundary가 `s3:*`이어도 Get은 안 된다. 시험에선 "Boundary를 붙였더니 어떤 권한이 활성화되었다"는 보기가 함정으로 자주 등장한다. 또 하나: Boundary는 IAM Principal에만 붙고 Resource에는 못 붙는다. 리소스 측 상한은 SCP나 Resource Policy로 다뤄야 한다.

> 🔍 **더 깊이**: Boundary와 SCP가 둘 다 "상한"이지만 적용 지점이 다르다. **SCP는 호출 시점에 호출자 계정의 모든 Principal에 적용**, **Boundary는 그 Principal 개별에 적용**. 즉 SCP는 굵은 그물, Boundary는 가는 그물이다. 큰 조직에서는 "Organizations SCP로 회사 정책 강제 → 각 계정 안에서 Boundary로 팀별 한도 강제 → Identity Policy로 실제 권한 부여"의 3단 구조가 표준 패턴이다.

## ABAC: 태그 기반 접근 제어

전통적인 RBAC는 Role마다 다른 정책을 만든다. 사용자 100명, 프로젝트 50개면 정책 5000개가 필요할 수 있다. ABAC는 정책 하나로 끝낸다.

```json
{
  "Effect": "Allow",
  "Action": "ec2:StartInstances",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Project": "${aws:PrincipalTag/Project}"
    }
  }
}
```

이 정책 한 장이 "내 Project 태그와 같은 태그가 붙은 EC2만 시작 가능"을 표현한다. 사용자가 늘어도 정책 변경 없이 태그만 관리하면 된다. 단점은 모든 리소스에 일관된 태깅 정책이 필요하다는 것 — 이게 ABAC가 실패하는 가장 흔한 이유다. 태그를 빼먹은 리소스는 권한이 막히거나, 반대로 잘못된 태그가 광범위한 권한을 열어준다.

> 💡 **관련 이론**: ABAC는 NIST SP 800-162 "Guide to Attribute Based Access Control"에서 표준화된 모델이다. RBAC가 정적인 직무 기반(NIST RBAC, INCITS 359-2012)인 데 비해 ABAC는 동적 속성 기반이라 자동화·스케일에 강하다. AWS 외에도 Google IAM의 Conditions, Azure Conditional Access가 같은 패턴이다. ABAC의 한계는 정책 디버깅 — 권한이 막혔을 때 "왜 막혔는지"를 추적하려면 Principal 태그·Resource 태그·Condition 키 셋을 모두 추적해야 해서, RBAC보다 트러블슈팅이 어렵다. 그래서 실무에서는 RBAC 뼈대에 ABAC 보조라는 하이브리드가 흔하다.

> 📚 **사례**: 한 핀테크 회사가 ABAC로 전환하면서 정책 수를 800개에서 6개로 줄였지만, 첫 달에 신규 EC2 출시가 "Project 태그가 자동 채워지지 않음"이라는 이유로 막혀버린 사고가 있었다. 결국 EventBridge + Lambda로 "리소스 생성 시 기본 태그 강제 부여"라는 자동화를 추가하고 나서야 ABAC가 안정화됐다. ABAC는 태깅 거버넌스가 90%다.

## 페더레이션: SAML 2.0 vs OIDC

기업 사용자는 보통 AWS 계정을 직접 만들지 않는다. 사내 IdP(Active Directory, Okta, Auth0)에서 한 번 로그인하고 AWS Role을 빌려쓴다. 이를 **Identity Federation** 이라 한다.

| 프로토콜 | 출시 | 토큰 형식 | 주 용도 |
|---------|------|-----------|---------|
| SAML 2.0 | 2005 (OASIS) | XML | 전통 기업 IdP (AD FS, Okta) |
| OIDC | 2014 (OpenID Foundation) | JWT | 웹·모바일·SaaS |

SAML은 XML이라 무겁고 파싱 취약점도 자주 나왔지만(2018 Duo Security 발견 SAML XML Signature wrapping, CVE-2018-0114 등) 여전히 엔터프라이즈에선 표준이다. OIDC는 JWT 기반으로 가볍고 모바일 친화적이라 신규 통합은 거의 OIDC다. JWT는 RFC 7519, OIDC는 OpenID Connect Core 1.0 스펙으로 정의돼 있다.

EKS의 IRSA(IAM Roles for Service Accounts), GitHub Actions의 OIDC 통합이 모두 OIDC 기반이다. 이 패턴이 중요한 이유는 **장기 자격 증명을 코드/CI에 안 두기 위함**이다. GitHub Actions에서 AWS에 배포할 때 Access Key를 Secret으로 두는 대신 OIDC 토큰으로 Role을 빌리면 키 회전 부담이 사라진다.

```yaml
# GitHub Actions OIDC 예
permissions:
  id-token: write   # OIDC 토큰 발급
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::111122223333:role/GHActionsDeploy
      aws-region: ap-northeast-2
```

이때 IAM Role의 Trust Policy에 GitHub OIDC Issuer를 등록하고, `sub` claim을 특정 repo와 branch로 제한한다.

```json
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:sub":
      "repo:myorg/myrepo:ref:refs/heads/main"
  }
}
```

`sub` claim에 repo와 branch가 박혀 있다는 게 핵심. 다른 repo가 같은 OIDC 토큰을 발급받아도 sub가 다르므로 Role 빌리기가 실패한다. 즉 GitHub 측 토큰이 Role의 사용 범위를 자체적으로 제한한다.

> 📚 **사례**: 2022년 Travis CI 침해 사고에서 공격자는 770개 이상의 사용자 토큰을 탈취해 GitHub repo에 접근했다. 그 결과 다수의 AWS Access Key가 노출되었다. 만약 OIDC 페더레이션을 썼다면 노출될 장기 토큰이 애초에 존재하지 않았다. 이후 GitHub Actions의 OIDC 사용이 사실상 표준이 됐다. 같은 해 CircleCI도 비슷한 침해를 겪었고, 두 사건 모두 "장기 secret을 CI에 두지 마라"는 교훈을 산업 전체에 각인시켰다.

> 🔍 **더 깊이**: AssumeRoleWithWebIdentity는 OIDC 토큰의 서명을 IdP의 JWKS(JSON Web Key Set, RFC 7517) 엔드포인트에서 가져온 공개키로 검증한다. AWS는 이 JWKS를 IAM Identity Provider 객체로 등록해두고 캐시한다. IdP가 키를 회전(rollover)하면 AWS도 자동으로 새 키를 가져오지만, JWKS URL 자체가 바뀌면 수동 업데이트가 필요하다. 이게 "GitHub Actions에서 OIDC가 갑자기 실패한다"는 실무 트러블의 흔한 원인이다.

## 정책 평가의 전체 흐름

```
[ Request: principal P, action A, resource R ]
          │
          ▼
   1. Organizations SCP 체크 → Deny면 끝
          │ Allow
          ▼
   2. Resource-based Policy 체크 (cross-account면 필수)
          │
          ▼
   3. Identity-based Policy 체크
          │
          ▼
   4. Permissions Boundary 체크
          │
          ▼
   5. Session Policy 체크 (AssumeRole 시)
          │
          ▼
   6. 어디든 Deny 있으면 → DENY
   7. 모든 단계 통과하면 → ALLOW
   8. 명시 Allow 없으면 → DENY (default)
```

> 🔍 **더 깊이**: 같은 계정 내에서 Resource Policy와 Identity Policy는 합집합(OR)으로 결합되지만, 교차 계정에서는 교집합(AND)으로 결합된다. KMS만 예외다 — KMS는 키 정책(Key Policy)에서 명시적으로 권한을 위임받지 않으면 IAM 정책이 아무리 강해도 키를 못 쓴다. 이건 KMS의 "key policy must allow"라는 독특한 모델로 시험 단골이다. 같은 모델이 적용되는 또 다른 서비스로 Secrets Manager, S3(특정 액션), Lambda(Resource Policy)가 있다.

> 💡 **관련 이론**: 이 평가 알고리즘은 OASIS XACML 3.0의 `deny-overrides` 결합 알고리즘에 가장 가깝다. XACML은 PEP(정책 시행점), PDP(정책 결정점), PIP(정책 정보점), PAP(정책 관리점) 4축으로 권한 시스템을 분리하는데, AWS IAM도 거의 같은 구조다 — API Gateway/SDK가 PEP, IAM 평가 엔진이 PDP, CloudTrail/IAM Identity Source가 PIP, IAM 콘솔이 PAP다. 다른 점은 XACML이 obligation(권한 부여 시 추가로 수행할 작업)을 정의하는 반면 IAM은 그 개념이 없다는 것.

## IAM Access Analyzer: 사용 안 하는 권한 찾기

Access Analyzer는 두 가지를 한다. 첫째, **외부 접근 발견**(External Access Findings) — 내 리소스가 다른 계정/공개 인터넷에 노출되어 있는지 자동 탐지. 둘째, **사용 안 되는 권한 발견**(Unused Access) — 지난 N일간 호출되지 않은 권한을 식별. 이게 최소 권한을 자동화하는 진짜 도구다.

| 기능 | 설명 |
|------|------|
| External Access | S3 버킷, KMS 키, IAM Role, Lambda 등 외부 접근 가능 리소스 탐지 |
| Unused Access | 90일간 미사용 권한·Role·Access Key 자동 탐지 |
| Policy Validation | IAM 정책 작성 시 문법·논리 오류 자동 진단 |
| Policy Generation | CloudTrail 로그 기반으로 실제 사용한 권한만 모아 정책 생성 |

내부적으로 Access Analyzer는 정형 검증(formal verification) 기반이다. 정책을 SMT(Satisfiability Modulo Theories) 문제로 변환해서 "이 정책이 외부 노출을 허용하는 입력이 존재하는가"를 풀어낸다. AWS의 Zelkova 엔진이 그 역할을 하고, 이는 2018년 USENIX Security에서 발표된 "Semantic-based Automated Reasoning for AWS Access Policies"가 토대다. 그래서 단순 패턴 매칭이 아니라 정책의 의미론적 동치성까지 따져준다.

## 정리하며

오늘의 핵심은 세 개다. 첫째, STS는 모든 임시 자격 증명의 출발점이고 5개 API가 시나리오별로 다르게 쓰인다. 둘째, Permissions Boundary는 권한의 상한이지 권한 부여가 아니다. 셋째, Cross-account 위임에는 External ID로 Confused Deputy를 차단해야 한다. 다음 글에서는 이 IAM 위에 **Organizations + SCP + Control Tower**로 다계정을 거버넌스하는 패턴을 본다. SAA 시험은 단순히 "IAM이 뭐냐"보다 "어떤 조합으로 어떤 위협을 막느냐"를 묻는 쪽이라, 이 도구들의 적용 맥락을 시나리오 단어로 익혀두는 게 가장 빠른 길이다.

---

## 📝 연습 문제

**문제 1.** 외부 SaaS 모니터링 도구가 내 AWS 계정의 CloudWatch 로그를 읽으려 한다. Confused Deputy 공격을 막기 위한 가장 적절한 조치는?

A) Access Key를 SaaS에 제공
B) Cross-Account Role + External ID 조건 추가
C) root 자격 증명을 공유
D) S3 Public 액세스 허용

**정답: B**
해설: SaaS 통합의 보안 표준. External ID는 우리와 SaaS 간 사전 공유 비밀로, 다른 SaaS 고객이 우리 Role ARN을 알아도 빌릴 수 없게 막는다. A는 키 회전 문제, C는 보안 사고로 직행, D는 무관한 답이다. AWS Marketplace 인증 ISV는 모두 External ID를 강제로 요구한다. 추가 안전망으로 Trust Policy의 Condition에 `aws:SourceAccount`나 `aws:SourceArn`을 같이 거는 패턴도 있다. 특히 AWS 서비스(SNS → Lambda 등)가 위임 호출자인 경우 External ID가 안 통하므로 `aws:SourceArn`이 사실상 표준이다.

---

**문제 2.** 개발자에게 IAM Role 생성 권한을 주되, `*:*` 권한을 가진 Role을 못 만들게 하려면?

A) CloudTrail로 사후 감지
B) Permissions Boundary를 강제 첨부 조건으로 정책에 명시
C) 개발자 권한을 모두 회수
D) Organizations SCP만 사용

**정답: B**
해설: `iam:CreateRole` 호출 시 `iam:PermissionsBoundary` 조건을 강제하면 그 Boundary를 안 붙인 Role은 생성 불가. 만들어진 Role의 실효 권한은 Boundary와의 교집합으로 자동 한정된다. A는 예방이 아닌 사후 대응. C는 업무 정지. D는 계정 단위라 개인 Role마다 다르게 제어하기 부적합하다. SCP와 Boundary를 같이 쓰는 게 더 안전한데, SCP는 "계정 전체 큰 그물", Boundary는 "Principal 개별 가는 그물"로 역할이 다르다.

---

**문제 3.** GitHub Actions에서 AWS에 배포할 때 가장 안전한 자격 증명 방식은?

A) IAM User Access Key를 Secret으로 저장
B) OIDC 페더레이션으로 Role을 임시로 빌림
C) root Access Key 사용
D) EC2를 띄워 SSH 키로 배포

**정답: B**
해설: OIDC 페더레이션은 GitHub에서 발급한 단명 토큰으로 AWS Role을 빌리는 방식. 장기 자격 증명이 없으므로 노출 위험이 0이다. A는 Travis CI 침해 사례처럼 Secret이 유출되면 키도 같이 새는 구조. C와 D는 보안 베스트 프랙티스 위반. Trust Policy의 `sub` claim 제한으로 repo·branch 단위까지 좁힐 수 있어 권한 분리도 정밀하게 된다. 시험뿐만 아니라 SOC 2·ISO 27001 같은 컴플라이언스 감사에서도 OIDC가 표준 요구사항으로 굳어지는 중이다.

---

**문제 4.** Cross-account에서 S3에 접근하려면?

A) 양쪽 계정 모두 Allow 정책 필요
B) 버킷 정책에서만 Allow하면 충분
C) 호출자 계정 정책에서만 Allow하면 충분
D) Organizations 가입이 필수

**정답: A**
해설: Cross-account는 양쪽 모두에서 명시적 Allow 필요. 소유 계정의 Resource Policy + 호출 계정의 Identity Policy 둘 다. 같은 계정이면 합집합이지만 교차 계정은 교집합. 단, KMS는 더 엄격해서 키 정책에서 명시 위임 안 하면 IAM 정책이 아무리 강해도 안 통한다. S3의 경우 객체 소유권(Object Ownership) 설정이 `BucketOwnerEnforced`라면 ACL이 무효화되므로 정책 일원화가 더 깔끔해진다.

---

**문제 5.** ABAC의 가장 큰 장점은?

A) 정책 수가 사용자 수에 비례해 증가
B) 사용자·리소스 태그로 동적 접근 제어, 정책 수가 일정하게 유지
C) 모든 권한을 단일 Role에 통합
D) MFA를 자동으로 활성화

**정답: B**
해설: ABAC는 NIST SP 800-162 표준 모델로, 태그 같은 속성을 매칭해 권한을 결정하므로 사용자·프로젝트가 늘어도 정책 변경 없이 확장된다. 단점은 태깅 일관성 — 태그가 빠지면 권한이 누락된다. AWS Config Rules로 태그 부재를 모니터링하는 게 표준 보완책이다. 또 Service Catalog로 "태그 강제 부여된 리소스만 사용자 생성 가능"으로 묶는 것도 흔한 거버넌스 패턴이다.

---

**문제 6.** 한 회사가 STS 글로벌 엔드포인트(`sts.amazonaws.com`)를 쓰고 있다. us-east-1에 장애가 발생하면?

A) 영향 없음
B) 다른 리전 워크로드의 신규 자격 증명 발급이 실패할 수 있음
C) 모든 리전이 정상 동작
D) STS는 장애가 발생하지 않음

**정답: B**
해설: 글로벌 엔드포인트는 us-east-1로 라우팅되므로 us-east-1 장애 시 신규 AssumeRole이 막힐 수 있다. 2017년 us-east-1 S3 장애 때 실제로 STS도 흔들렸다. 베스트 프랙티스는 리전 엔드포인트(`sts.ap-northeast-2.amazonaws.com`)를 명시적으로 쓰는 것이고, SDK 환경변수 `AWS_STS_REGIONAL_ENDPOINTS=regional`로 강제할 수 있다. 동일 패턴이 IAM(전역 컨트롤 플레인)에도 있어서, IAM 변경(정책 작성, 사용자 생성)은 us-east-1 장애에 영향을 받지만 이미 발급된 토큰의 검증(데이터 플레인)은 각 리전 독립이라 살아남는다.

---

**문제 7.** KMS 키에 대한 권한 부여 시 옳은 것은?

A) IAM 정책만 있으면 충분
B) Key Policy가 권한 위임을 명시해야 IAM 정책이 효과를 가짐
C) Resource Policy만 있으면 됨
D) SCP만으로 충분

**정답: B**
해설: KMS는 "key policy must allow"라는 독특한 모델. Key Policy에서 명시 위임하지 않으면 IAM 정책이 아무리 강해도 키를 못 쓴다. 이게 KMS가 다른 서비스와 가장 다른 점이고 시험 단골 함정이다. Day 8(KMS 심화)에서 이 모델을 자세히 다룬다. 이 설계는 의도된 것으로, 데이터 암호화 키가 IAM 관리자의 "관리 권한"만으로 부주의하게 열리지 않게 하려는 분리(separation of duties) 장치다. PCI-DSS, FIPS 140-2의 키 관리 요구사항과 직접 연결된다.
