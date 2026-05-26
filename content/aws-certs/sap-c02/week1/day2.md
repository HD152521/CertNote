# Day 2 - IAM·STS·Federation: 권한이라는 단어를 여섯 층으로 쪼개기

SAA에서 IAM은 "User, Group, Role, Policy"라는 네 단어로 정리할 수 있었다. Pro에서는 이게 안 통한다. 한 시나리오에 IAM User 정책, IAM Role 정책, Resource-based 정책, Permission Boundary, SCP, Session 정책이 동시에 등장하고 — "**이 사용자가 이 액션을 호출할 수 있는가**"를 묻는 문제가 자주 나온다. 답을 맞히려면 권한 평가의 **6단계 우선순위**를 알아야 한다.

이 글에서는 IAM의 표면을 한 번 더 벗기고, 그 아래에서 실제로 결정이 일어나는 평가 엔진을 본다. 그리고 STS와 Federation이 왜 "엔터프라이즈 멀티 계정 환경의 척추"인지, Capital One·Uber 같은 사고에서 무엇이 망가졌었는지를 짚는다.

## IAM의 6층 권한 평가: AWS 콘솔이 보여주지 않는 내부

`aws s3 ls s3://my-bucket`을 칠 때 AWS는 다음 6개 정책을 동시에 평가한다.

```
[1. SCP (Service Control Policy)]              ← Organizations 레벨, deny가 모든 걸 이긴다
       ↓
[2. Permission Boundary]                       ← IAM 엔터티(User·Role)의 최대 권한 한계
       ↓
[3. Identity-based Policy]                     ← User·Group·Role에 붙은 정책
       ↓
[4. Resource-based Policy]                     ← S3 버킷 정책, KMS 키 정책 등
       ↓
[5. Session Policy]                            ← AssumeRole·GetFederationToken 시 인라인 첨부
       ↓
[6. VPC Endpoint Policy]                       ← VPC Endpoint 경유 트래픽에만 적용
```

평가 규칙은 단순하지만 정확하다.

1. **명시적 Deny는 모든 Allow를 이긴다** (explicit deny wins)
2. **모든 관련 정책이 Allow하지 않으면 기본은 Deny** (implicit deny)
3. **SCP·Permission Boundary는 권한을 부여하지 않고 한계만 설정** (deny-only)
4. **Resource-based Policy는 cross-account 경우 신뢰의 양쪽이 모두 Allow해야** (같은 계정 내에서는 둘 중 하나만 Allow면 충분)

> 🔍 **더 깊이**: SCP와 Permission Boundary는 둘 다 "권한의 최대치"를 설정하는 가드레일이지만 적용 범위가 다르다. **SCP**는 Organizations의 OU·Account 레벨에 붙어 그 계정 안의 **모든 IAM 엔터티**(root 포함)에 적용된다. **Permission Boundary**는 특정 IAM User·Role에만 붙는다. 즉 SCP는 "이 계정에서는 절대 us-east-1 외 리전 못 씀"을 강제하고, Permission Boundary는 "이 개발자 Role은 절대 IAM·Organizations API 못 호출"을 강제한다. 둘 다 Allow가 아니라 **권한 상한선**이다.

> 💡 **관련 이론**: 이 평가 구조는 **Role-Based Access Control (RBAC, NIST RBAC 표준 INCITS 359-2004)**과 **Attribute-Based Access Control (ABAC, NIST SP 800-162)**의 하이브리드다. IAM Policy의 `Condition` 절은 ABAC를 구현하고(`aws:RequestTag/Project=Phoenix`), 정책 첨부는 RBAC를 구현한다. AWS가 2018년 ABAC를 본격 도입한 이유는 **계정 수가 폭증할 때 RBAC만으로는 정책 관리가 폭발**하기 때문이다. 100개 프로젝트 × 4개 환경(dev/stg/prod/test) = 400개 Role이 필요하지만, ABAC라면 1개 Role + 태그 기반 조건으로 끝난다.

> 🎯 **시나리오**: "한 데이터 분석가가 S3 버킷에 접근이 안 된다고 호소한다. IAM 정책은 `s3:*` Allow, 버킷 정책도 Allow. 무엇이 원인일까?" — 답은 보통 **SCP가 리전·서비스 제한**을 걸었거나, **Permission Boundary가 s3:GetObject만 허용**하거나, **버킷이 KMS 암호화되어 있는데 KMS 키 정책이 Deny**된 경우다. Pro 시험은 이런 "왜 안 되는가" 디버깅 시나리오를 자주 묻는다.

### Cross-Account 접근: 두 쪽 모두 동의해야 한다

같은 계정 안에서는 Identity Policy OR Resource Policy 중 하나만 Allow면 충분하지만, **다른 계정에서 접근할 때는 양쪽 모두 Allow**가 필요하다.

```
[Account A: 사용자 Alice]                  [Account B: S3 Bucket]
    Identity Policy: Allow s3:GetObject       Bucket Policy: Allow A의 Alice
              ↓                                          ↓
         양쪽 모두 Allow → 접근 허용
```

이게 핀테크·금융권 멀티 계정 환경에서 자주 사고가 나는 지점이다. 한쪽만 Allow하면 막히고, 양쪽 모두 Allow하면 권한 누설 위험이 커진다. 그래서 **IAM Access Analyzer**가 2019년에 출시되어 "이 리소스에 외부 계정이 접근 가능한가"를 자동 점검한다.

## STS의 진짜 역할: 임시 자격증명의 발급기

`AssumeRole`이라는 단어를 SAA에서도 봤지만, Pro에서는 **STS의 5가지 API**를 모두 구별해야 한다.

| API | 호출 주체 | 반환 자격증명 유효 시간 | 사용처 |
|-----|-----------|------------------------|--------|
| `AssumeRole` | IAM User/Role | 15분 ~ 12시간 | 크로스 계정 접근, EC2 Instance Role |
| `AssumeRoleWithSAML` | SAML IdP (AD FS, Okta) | 15분 ~ 12시간 | 엔터프라이즈 SSO |
| `AssumeRoleWithWebIdentity` | OIDC(Google, Facebook, GitHub Actions) | 15분 ~ 12시간 | 모바일 앱, CI/CD |
| `GetFederationToken` | IAM User | 15분 ~ 36시간 | 외부 사용자에게 임시 권한 |
| `GetSessionToken` | IAM User | 15분 ~ 36시간 | MFA 기반 세션 강화 |

> 🔍 **더 깊이**: 임시 자격증명의 핵심은 **세션 토큰(Session Token)**이다. 일반 `AccessKeyId` + `SecretAccessKey`만으로 호출하면 무한히 유효한 자격증명이 되지만, `SessionToken`이 추가되면 STS가 발급한 만료 시한이 강제된다. 또 임시 자격증명은 STS가 내부적으로 발급하는 **JWT 유사 구조**로, AWS Signature V4 서명에 SessionToken을 추가 헤더로 포함해 전송한다. 이게 IMDSv2가 SSRF 공격을 막는 메커니즘과 직결된다(EC2 메타데이터 서비스가 임시 자격증명만 발급, IMDSv2는 PUT 토큰을 강제).

> 📚 **사례**: 2019년 7월 Capital One 사건. 공격자가 SSRF 취약점으로 `http://169.254.169.254/latest/meta-data/iam/security-credentials/`에 접근해 EC2 Instance Role의 **임시 자격증명을 탈취**했다. 그 자격증명에는 S3 버킷에 광범위한 접근 권한이 있었고, 1억 600만 명의 데이터가 유출됐다. AWS는 이 사건의 직접적 결과로 **IMDSv2**(2019년 11월)와 **IAM Access Analyzer**(2019년 12월)를 출시했고, 2024년부터는 신규 EC2 인스턴스에서 IMDSv2를 기본으로 강제한다. [DOJ 공소장](https://www.justice.gov/usao-edva/press-release/file/1188626/download).

### AssumeRole의 신뢰 정책(Trust Policy)

Role을 만들 때 두 가지 정책을 동시에 정의한다.

```json
// Trust Policy (누가 이 Role을 assume할 수 있는가)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::123456789012:root"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "unique-external-id-xyz"
      }
    }
  }]
}

// Permission Policy (이 Role을 가진 자가 무엇을 할 수 있는가)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::data-bucket/*"
  }]
}
```

`ExternalId`는 **"confused deputy" 공격을 막는 장치**다. 만약 A사가 B사에게 자기 계정의 Role을 assume할 수 있게 허락하면, 악의적인 제3자 C가 B사의 ID를 사칭해 A의 Role을 assume할 수 있다. ExternalId는 A가 B에게만 알려준 secret이라, C가 모르면 assume이 실패한다.

> ⚠️ **함정**: Pro 시험에서 "**third-party SaaS가 우리 AWS 계정에 접근하게 하려면**"이라는 시나리오가 나오면 답은 거의 항상 **Cross-Account Role + ExternalId**다. IAM User를 만들어 액세스 키를 주는 답은 오답이다(액세스 키는 정적이고 회수 어려움). Datadog, Snowflake, Splunk 같은 SaaS가 모두 이 패턴을 쓴다.

## Federation의 두 갈래: SAML과 OIDC

엔터프라이즈는 자체 ID 시스템(Active Directory, Okta, Azure AD)을 가지고 있다. 이걸 AWS에 매번 다시 만들지 않고 **연합(Federation)**한다.

### SAML 2.0 기반 Federation

SAML(Security Assertion Markup Language) 2.0은 2005년 OASIS 표준으로 채택된 XML 기반 인증·인가 프로토콜이다.

```
[사용자] → [AD FS / Okta]
              ↓ SAMLResponse (XML, 서명됨)
         [AWS Sign-in Endpoint]
              ↓ AssumeRoleWithSAML
         [STS: 임시 자격증명 발급]
              ↓
         [AWS Console / API 사용]
```

> 💡 **관련 이론**: SAML 2.0은 **XML Digital Signature**(W3C XMLDSIG)와 **XML Encryption**(W3C XMLENC)을 기반으로 한다. IdP가 SAMLResponse를 X.509 인증서의 private key로 서명하고, SP(AWS)가 public key로 검증한다. 단 SAML은 XML 파싱의 복잡성 때문에 **XML Signature Wrapping 공격**이라는 고유의 보안 문제가 있다. 2012년 USENIX 학회에서 11개의 SaaS·SAML 구현에서 이 취약점이 발견됐고, AWS도 그중 하나였다. AWS는 이후 strict XML schema validation으로 패치.

### OIDC(OpenID Connect) 기반 Federation

OIDC는 OAuth 2.0 위에 인증 레이어를 얹은 표준이다. JSON 기반이라 SAML보다 가볍고, 모바일·SPA에 적합하다.

```
[사용자] → [Google / GitHub / Cognito]
                  ↓ id_token (JWT)
            [AssumeRoleWithWebIdentity]
                  ↓
            [STS: 임시 자격증명]
```

GitHub Actions가 AWS에 배포할 때 이 방식을 쓴다. **OIDC trust**를 한 번 설정해두면 GitHub Actions의 워크플로우가 별도의 long-lived AWS credential 없이 매번 임시 토큰을 받아 배포한다. 2021년 GitHub이 OIDC를 출시한 이후 "AWS Access Key를 GitHub Secrets에 저장하던 관행"이 빠르게 사라졌다.

> 📚 **사례**: 2017년 Uber 데이터 유출 사고는 직원이 GitHub 공개 저장소에 AWS Access Key를 푸시한 게 원인이었다. 5,700만 사용자 데이터가 유출됐다. 이후 GitHub은 secret scanning을 도입했고, AWS는 IAM Access Analyzer로 노출된 키를 자동 탐지한다. 현재 GitHub Actions에서 OIDC를 쓰면 이런 사고 자체가 불가능해진다(static credential이 아예 없으므로).

### IAM Identity Center (구 AWS SSO)

AWS Identity Center는 SAML 기반의 multi-account SSO 솔루션이다. Organizations와 통합되어 한 번 로그인하면 여러 계정·여러 Role을 콘솔에서 자유롭게 전환할 수 있다.

```
[직원] → [Identity Center 로그인]
              ↓
        [Permission Set 선택]
              ↓
        [임시 자격증명으로 대상 계정에 AssumeRole]
              ↓
        [콘솔 / CLI 사용]
```

**Permission Set**은 Identity Center 고유 개념으로, "여러 계정에 동일한 IAM Role을 일괄 배포"하는 템플릿이다. 예를 들어 "Developer Permission Set"을 정의하면 Identity Center가 모든 dev 계정에 동일한 Role을 자동 생성·유지한다.

> 🔍 **더 깊이**: Identity Center는 내부적으로 **두 가지 ID 소스**를 지원한다. ① **Identity Center 자체 디렉토리** (소규모) ② **외부 IdP** (AD/Okta/Azure AD via SAML 또는 SCIM). SCIM(System for Cross-domain Identity Management, RFC 7644)은 Azure AD 같은 외부 IdP에서 사용자가 추가·삭제되면 자동으로 AWS에 동기화하는 표준 프로토콜이다. 이게 없으면 직원이 퇴사해도 AWS에서 권한이 살아 있는 ghost user 문제가 생긴다.

## Permission Boundary: 위임의 안전판

대규모 조직에서 자주 마주치는 시나리오: "개발자가 자기 Lambda Role을 직접 만들 수 있게 하고 싶다. 하지만 개발자가 IAM Admin 권한을 부여하면 위험하다."

답은 Permission Boundary다. 관리자가 개발자에게 "IAM Role을 만들 수는 있지만, **이 boundary 이상의 권한은 절대 못 부여**"한다는 제약을 같이 건다.

```json
// 개발자에게 부여하는 정책
{
  "Effect": "Allow",
  "Action": "iam:CreateRole",
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/DevBoundary"
    }
  }
}
```

이렇게 하면 개발자가 IAM Role을 만들 때 반드시 `DevBoundary`를 첨부하도록 강제되고, 그 boundary 이상의 권한은 자동으로 차단된다.

> 🎯 **시나리오**: 한 게임사가 100명의 개발자에게 자유로운 Lambda 개발 환경을 주려고 한다. 개발자가 직접 Role을 만들고 권한을 부여하지만, **IAM Admin·Organizations·Billing 권한은 절대 안 됨**. — 답은 Permission Boundary로 IAM·Organizations·Billing API를 deny한 boundary를 강제 첨부. SCP만으로는 부족한데, 개발자가 자기 Role에 admin 권한을 줄 가능성이 있기 때문. SCP + Permission Boundary 2중 가드레일이 정공.

## 6층 권한 평가의 실전: 디버깅 매트릭스

| 증상 | 의심해야 할 정책 | 진단 방법 |
|------|------------------|-----------|
| 모든 API 호출이 막힘 | SCP | Organizations 콘솔에서 SCP 확인 |
| 특정 서비스만 막힘 | Permission Boundary, SCP | IAM 시뮬레이터, Access Analyzer |
| 특정 리전만 막힘 | SCP의 `Condition: aws:RequestedRegion` | SCP JSON 직접 확인 |
| 크로스 계정 접근 막힘 | 양쪽 정책 모두 | CloudTrail의 `errorMessage` |
| KMS 암호화 객체 못 읽음 | KMS Key Policy | KMS 콘솔, `kms:Decrypt` 정책 |
| AssumeRole 실패 | Trust Policy, ExternalId | CloudTrail의 `sts:AssumeRole` 이벤트 |

CLI로 정책 시뮬레이션이 가능하다.

```bash
# 특정 사용자가 특정 액션을 호출할 수 있는지 시뮬레이션
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::123456789012:user/Alice \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::data-bucket/file.txt
```

## ABAC vs RBAC: 조직 규모에 따른 선택

| 항목 | RBAC | ABAC |
|------|------|------|
| 정의 | Role(역할)별 정책 부여 | 속성(태그)별 정책 부여 |
| 적합 규모 | 소규모 (< 50 Role) | 대규모 |
| 정책 수 | 역할 × 환경 폭증 | 단일 정책 + 태그 |
| 권한 누설 위험 | 정책 복제 시 실수 | 태그 누락 시 |
| AWS 도입 | 초기부터 | 2018년 ABAC 기능 추가 |

> 🔍 **더 깊이**: AWS ABAC의 핵심 Condition Key는 `aws:RequestTag/key`(요청자가 만들려는 리소스의 태그), `aws:ResourceTag/key`(이미 존재하는 리소스의 태그), `aws:PrincipalTag/key`(요청자 본인의 태그)다. 이 세 가지를 조합하면 "Project=Phoenix 태그를 가진 사용자는 Project=Phoenix 태그를 가진 EC2만 시작·중지할 수 있다"는 정책을 단 하나의 정책으로 표현할 수 있다. 100개 프로젝트라도 정책은 그대로다. 단 태그 누락은 곧 권한 차단이 되므로, Tag Policy(Organizations 기능)와 함께 강제해야 한다.

## 정리하며

IAM은 SAA에서 "정책 = JSON" 정도였지만 Pro에서는 **6층 평가 엔진**이라는 깊이로 다뤄야 한다. SCP·Permission Boundary·Identity Policy·Resource Policy·Session Policy·VPC Endpoint Policy가 동시에 작동하고, explicit deny는 모든 allow를 이기며, cross-account는 양쪽 모두의 동의가 필요하다.

STS는 임시 자격증명의 발급기이고, AssumeRole의 다섯 변형(AssumeRole, WithSAML, WithWebIdentity, GetFederationToken, GetSessionToken)을 시나리오 키워드로 구별해야 한다. Federation은 SAML(엔터프라이즈)과 OIDC(모바일·CI/CD)로 갈리며, Identity Center는 multi-account SSO의 표준 답이다. 마지막으로 Permission Boundary는 "개발자에게 자유와 안전을 동시에" 제공하는 위임의 안전판.

다음 글에서는 IAM이 결정한 권한 위에서 트래픽이 흐르는 통로 — VPC·서브넷·라우팅·보안 그룹을 Pro 깊이로 본다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 Organizations에 50개 계정을 운영한다. 한 개발자 계정에서 IAM User Alice가 `s3:GetObject` 권한을 가진 정책을 부여받았지만 객체를 가져올 수 없다. CloudTrail에는 `AccessDenied`로 기록된다. 가장 가능성 높은 원인은?

A) Identity Policy가 잘못됨
B) Organizations의 SCP가 해당 리전·서비스를 deny
C) S3 버킷이 다른 계정에 있고 버킷 정책이 명시적으로 허용하지 않음
D) IAM User에 MFA가 비활성

**정답: C** (또는 B도 가능, 시나리오에 따라)
해설: Identity Policy는 Allow되어 있으므로 A는 제외. MFA(D)는 Condition으로 명시되지 않는 한 무관. B는 SCP가 의심되지만 같은 리전·서비스가 동작한다는 정보가 없음. **Cross-account 접근의 경우 Identity Policy + Resource Policy 양쪽 Allow가 필수**이므로 C가 가장 유력. 추가로 KMS 암호화 버킷이면 KMS Key Policy도 필요. 진단: CloudTrail의 `errorMessage`에 "explicit deny in a resource policy" 또는 "deny in a service control policy"가 명시되므로 그것으로 식별.

---

**문제 2.** 한 SaaS 회사가 자기 고객의 AWS 계정에서 데이터를 수집해야 한다. 가장 안전하고 표준적인 방법은?

A) 고객이 IAM User를 만들어 Access Key를 SaaS에 제공
B) 고객 계정에 Cross-Account Role을 만들고 SaaS 계정에 AssumeRole + ExternalId 부여
C) 고객의 root credential 공유
D) 고객 계정에 SaaS의 IAM User를 직접 생성

**정답: B**
해설: 키워드는 "표준" + "SaaS가 고객 계정 접근". A의 Access Key는 정적이며 누설·회수 어려움. B는 Cross-Account Role + ExternalId가 confused deputy 공격을 막는 표준 패턴(Datadog·Snowflake·CloudHealth 모두 채택). ExternalId는 SaaS가 고객마다 고유한 secret을 생성해 Trust Policy의 Condition에 포함시켜, 다른 고객이 자기 ID로 다른 고객의 Role을 assume하지 못하게 막는다.

---

**문제 3.** 한 회사가 개발자에게 "자기 팀의 Lambda Role을 자유롭게 만들되 절대 IAM·Organizations 권한은 부여하지 못하게"하려 한다. 가장 적합한 방법은?

A) 개발자에게 IAM Admin 권한 + 모니터링
B) Permission Boundary로 IAM·Organizations API를 deny한 boundary를 강제 첨부
C) SCP로 IAM·Organizations API deny
D) 매 Role 생성 시 보안팀 승인 워크플로우

**정답: B**
해설: B의 Permission Boundary는 개발자가 만드는 Role의 권한 상한선을 설정한다. 개발자가 자기 Role에 admin 권한을 부여하려 해도 boundary가 막는다. C의 SCP는 계정 전체에 적용되어 개발자뿐 아니라 보안팀까지 막힘. D는 운영 부담이 큼. 보통은 **SCP(계정 차원) + Permission Boundary(위임 차원)**를 2중으로 적용한다.

---

**문제 4.** 한 회사가 GitHub Actions에서 AWS Lambda에 배포한다. 보안팀이 "long-lived AWS Access Key를 GitHub Secrets에 저장하지 말라"고 요구한다. 어떻게 해야 하는가?

A) IAM User를 만들고 Access Key를 90일마다 회전
B) AWS OIDC Identity Provider를 구성하고 GitHub Actions가 AssumeRoleWithWebIdentity 호출
C) Lambda를 콘솔에서 수동 배포
D) S3 버킷에 ZIP을 올리고 Lambda가 트리거

**정답: B**
해설: B는 GitHub Actions가 매번 OIDC id_token을 받아 STS에서 임시 자격증명을 발급받는 표준 패턴. AWS는 OIDC Provider만 한 번 등록하면 됨. A는 키 회전 부담 + 누설 위험 여전. 트레이드오프: OIDC trust 설정 시 GitHub repo·branch를 Condition으로 제한해야 함(다른 organization이 같은 repo 이름으로 위장 가능).

---

**문제 5.** 한 회사가 Organizations에 200개 계정을 운영하며, 직원이 여러 계정에 SSO로 접근해야 한다. Active Directory가 ID 소스다. 가장 적절한 솔루션은?

A) 각 계정마다 IAM User 생성
B) IAM Identity Center + AD Connector + Permission Set
C) 각 계정마다 SAML IdP 설정
D) Cognito User Pool로 통합

**정답: B**
해설: B는 Identity Center가 Organizations와 통합되어 한 번 설정으로 모든 계정에 Permission Set을 자동 배포. AD Connector(또는 AWS Managed AD)로 기존 AD를 ID 소스로 사용. C는 200개 계정 각각 설정해야 해서 운영 부담 극심. 트레이드오프: Identity Center 자체는 무료지만, Managed AD는 시간당 비용이 있어 작은 조직은 AD Connector가 더 저렴.

---

**문제 6.** 한 회사가 Cross-Account로 S3 버킷에 접근할 수 있는 모든 외부 Principal을 찾고 싶다. 가장 효율적인 방법은?

A) 모든 버킷 정책을 수동 검토
B) IAM Access Analyzer를 활성화하고 External Finding 확인
C) CloudTrail 로그를 grep
D) AWS Config Custom Rule 작성

**정답: B**
해설: Access Analyzer는 2019년 출시 이후 Zelkova라는 정형 검증 엔진으로 모든 Resource Policy를 분석해 외부 접근 가능성을 자동 식별. Organizations 단위로 활성화하면 모든 계정의 결과를 통합 조회 가능.

---

**문제 7.** 한 시스템에서 사용자가 S3 객체를 못 가져온다. Identity Policy `s3:*`, 버킷 정책 Allow, KMS 키 정책 누락. CloudTrail에는 `KMS.NotFoundException`이 보인다. 무엇이 문제인가?

A) S3 버킷 정책이 KMS 키를 명시하지 않음
B) KMS 키 정책이 사용자에게 `kms:Decrypt` 권한을 부여하지 않음
C) S3 버킷이 잘못된 리전에 있음
D) IAM User에 MFA가 비활성

**정답: B**
해설: S3 객체가 KMS 암호화된 경우, S3는 객체를 가져온 후 KMS에서 데이터 키를 복호화하려고 시도한다. 이때 사용자의 권한이 **`kms:Decrypt`까지 포함**되어야 한다. Cross-account KMS 접근은 양쪽(IAM 정책 + KMS 키 정책) 모두 Allow 필요. CloudTrail의 `KMS.NotFoundException`은 "권한이 없어 KMS 키를 찾을 수 없는 것처럼 보이게" 반환되는 메시지(security through obscurity).
