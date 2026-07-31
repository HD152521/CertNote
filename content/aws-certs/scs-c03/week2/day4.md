# Day 4 - IAM Identity Center와 페더레이션: SAML, OIDC, 그리고 ABAC

지금까지(day1~3)는 "권한을 어떻게 제한하는가"를 다뤘다. 오늘은 "사람에게 어떻게 접근을 부여하는가"의 현대적 정답을 본다. 수백 개 계정에서 수천 명의 직원에게 각각 IAM 사용자를 만들어주는 것은 악몽이다. 장기 자격증명(access key)은 유출 위험이 크고, 퇴사자 정리도 어렵다.

해법은 **페더레이션(federation)**이다. 회사의 기존 ID 시스템(Active Directory, Okta, Azure AD 등)을 신뢰의 원천으로 삼고, AWS는 그 신뢰를 받아 **임시 자격증명**을 발급한다. 이를 매니지드로 묶은 것이 **IAM Identity Center**(구 AWS SSO)다. Specialty 시험에서 SAML/OIDC 흐름과 ABAC는 반드시 출제된다.

## 왜 IAM 사용자를 버려야 하는가

먼저 동기를 확실히 하자. IAM 사용자의 문제점:

- **장기 자격증명**: access key는 회전하지 않으면 영구 유효 → 유출 시 치명적
- **계정마다 중복**: 200개 계정이면 사용자당 200개 IAM 사용자
- **ID 소스 이중화**: 회사 HR/AD와 AWS가 따로 놀아 퇴사자 권한 잔존
- **MFA 관리 분산**: 계정마다 따로 설정

> 💡 **관련 이론**: 페더레이션의 핵심은 **신뢰의 단일 출처(single source of truth)**다. ID 관리 이론에서 이를 **identity federation**이라 하며, 한 곳(IdP, Identity Provider)에서 인증하고 그 결과를 여러 서비스(SP, Service Provider/RP, Relying Party)가 신뢰하는 모델이다. 자격증명을 한 곳에서만 관리하므로 퇴사자 비활성화가 즉시 모든 곳에 반영된다. AWS는 이 패턴을 STS의 임시 자격증명으로 구현한다 — 영구 키가 아예 없다.

## SAML 2.0 페더레이션의 흐름

전통적 엔터프라이즈(AD FS, Okta) 환경에서 쓰는 SAML 흐름이다.

```
1. 사용자가 회사 포털(IdP)에 로그인
2. IdP가 SAML Assertion(서명된 XML) 발급
   → 사용자의 신원 + 부여할 IAM 롤 정보 포함
3. 사용자가 이 Assertion을 AWS STS에 제출
   (sts:AssumeRoleWithSAML)
4. AWS가 IdP를 신뢰하는지 확인 (SAML Identity Provider 등록 필요)
5. STS가 임시 자격증명 발급 (기본 1시간, 최대 12시간)
6. 사용자가 그 자격증명으로 AWS 접근
```

AWS 쪽에는 두 가지가 필요하다.

```json
// 1) IAM에 SAML Identity Provider 등록 (IdP 메타데이터 XML 업로드)
// 2) AssumeRoleWithSAML을 허용하는 신뢰 정책(trust policy)을 롤에 부착
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT:saml-provider/MyCompanyIdP" },
    "Action": "sts:AssumeRoleWithSAML",
    "Condition": {
      "StringEquals": { "SAML:aud": "https://signin.aws.amazon.com/saml" }
    }
  }]
}
```

> ⚠️ **함정**: `sts:AssumeRoleWithSAML`은 신뢰 정책의 `Principal`이 `Federated`로 SAML provider를 가리켜야 한다. 일반 `AssumeRole`(다른 IAM 롤이 전환)이나 `AssumeRoleWithWebIdentity`(OIDC)와 혼동하면 안 된다. 시험에서 세 가지 STS API를 구분하는 문제가 자주 나온다: `AssumeRole`(IAM 주체), `AssumeRoleWithSAML`(엔터프라이즈 SAML IdP), `AssumeRoleWithWebIdentity`(OIDC — 모바일 앱, Cognito, GitHub Actions 등).

### STS API 다섯 개를 한 표로

시험은 "이 상황에서 쓰는 API는?"을 반복해서 묻는다. 다섯 개를 구분 기준과 함께 외운다.

| API | 입력 자격증명 | 대표 상황 | 결과 프린시펄 형태 |
|-----|---------------|-----------|--------------------|
| `AssumeRole` | 이미 유효한 AWS 자격증명 | 교차 계정 전환, 롤 체이닝, EC2→다른 롤 | `assumed-role/RoleName/SessionName` |
| `AssumeRoleWithSAML` | SAML 2.0 Assertion | AD FS·Okta 등 엔터프라이즈 IdP | `assumed-role/RoleName/SessionName` |
| `AssumeRoleWithWebIdentity` | OIDC JWT | 모바일 앱, Cognito, GitHub Actions | `assumed-role/RoleName/SessionName` |
| `GetSessionToken` | **IAM 사용자**의 장기 키 | MFA를 요구하는 API를 호출하기 위한 단기 토큰 | 원래 IAM 사용자와 동일 |
| `GetFederationToken` | **IAM 사용자**의 장기 키 | 자체 인증 브로커가 외부 사용자에게 단기 권한 발급 | `federated-user/Name` |

앞의 셋과 뒤의 둘 사이에 큰 선이 하나 있다. **`AssumeRole*` 계열은 롤로 신원을 갈아입지만, `GetSessionToken`·`GetFederationToken`은 원래 IAM 사용자의 권한을 벗어나지 못한다.** 그리고 뒤의 둘은 애초에 **IAM 사용자(장기 키)를 전제**하므로, "IAM 사용자를 없애는 것"이 목표인 현대적 설계에서는 등장할 자리가 거의 없다. 보기에 `GetFederationToken`이 있으면 대개 오답이다.

> 🔍 **더 깊이**: `GetSessionToken`과 `GetFederationToken`을 구분하는 실질적 기준은 **"MFA를 통과시키려는가, 남에게 권한을 나눠 주려는가"**다. `GetSessionToken`은 자기 자신의 세션을 MFA로 승격시키는 용도라, 반환된 자격증명은 `aws:MultiFactorAuthPresent`가 참이다. `GetFederationToken`은 자체 인증 시스템(사내 포털 등)이 인증한 사용자에게 짧은 AWS 접근을 넘겨주는 용도이고, 세션 정책으로 권한을 좁힐 수 있다. 다만 반환된 자격증명으로는 대부분의 IAM·STS 작업을 할 수 없다는 제약이 있다. 시험에서 이 둘이 정답이 되는 문항은 "기존 IAM 사용자 기반 환경"이라는 단서가 반드시 붙는다.

### SAML Assertion이 실제로 실어 나르는 것

SAML 페더레이션의 세밀한 통제는 **IdP가 어떤 속성을 넣어 주느냐**로 결정된다. AWS가 해석하는 속성 이름은 정해져 있다.

```
[ AWS가 읽는 SAML 속성 ]

  .../SAML/Attributes/Role
      값: "arn:aws:iam::111122223333:role/DevAccess,
           arn:aws:iam::111122223333:saml-provider/CorpIdP"
      → 전환할 롤과 SAML 공급자를 쉼표로 함께 지정한다.
        여러 개를 넣으면 로그인 후 롤 선택 화면이 나온다.

  .../SAML/Attributes/RoleSessionName
      값: "alice@example.com"     ← CloudTrail 추적의 핵심

  .../SAML/Attributes/SessionDuration
      값: "3600"  (초)            ← 롤의 MaxSessionDuration 이내

  .../SAML/Attributes/PrincipalTag:Department
      값: "payments"              ← ABAC용 속성 주입

  .../SAML/Attributes/TransitiveTagKeys
      값: ["Department"]          ← 롤 체이닝에서도 태그 유지

  .../SAML/Attributes/SourceIdentity
      값: "alice@example.com"     ← 변조 불가한 원본 신원
```

신뢰 정책은 이 속성들을 조건으로 검사할 수 있다. `SAML:aud`(Assertion의 수신자), `SAML:iss`(발급자), `SAML:sub`(주체) 등이 대표적이다.

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::111122223333:saml-provider/CorpIdP" },
  "Action": ["sts:AssumeRoleWithSAML", "sts:TagSession", "sts:SetSourceIdentity"],
  "Condition": {
    "StringEquals": {
      "SAML:aud": "https://signin.aws.amazon.com/saml"
    },
    "StringLike": {
      "aws:RequestTag/Department": "*"
    }
  }
}
```

`sts:TagSession`과 `sts:SetSourceIdentity`가 `Action`에 함께 있어야 하는 것이 중요한 실무 포인트다. **IdP가 `PrincipalTag:`나 `SourceIdentity` 속성을 보내도, 신뢰 정책이 해당 액션을 허용하지 않으면 전환 자체가 실패한다.** "ABAC 태그를 넣었는데 AssumeRole이 거부된다"는 증상의 대표 원인이다.

> ⚠️ **함정**: `SAML:aud` 조건을 빠뜨리면 **다른 용도로 발급된 Assertion이 AWS 로그인에 재사용될 여지**가 생긴다. IdP가 여러 서비스에 SAML을 발급하는 환경에서, 다른 서비스용 Assertion을 탈취해 AWS에 제출하는 시나리오를 이 조건이 막는다. 신뢰 정책의 조건은 "누가 보냈나"(`Principal`)뿐 아니라 "누구에게 보낸 것인가"(`aud`)까지 검사해야 완결된다.

## OIDC와 웹 자격증명 페더레이션

모바일 앱, 웹 앱, CI/CD(GitHub Actions) 같은 환경은 OIDC(OpenID Connect)를 쓴다.

```
sts:AssumeRoleWithWebIdentity
  - Google, Facebook, Cognito, GitHub OIDC provider 등
  - JWT(JSON Web Token)를 STS에 제출
  - 모바일 앱에 AWS 자격증명을 하드코딩하지 않고 임시 발급
```

대표 현대 사례: **GitHub Actions에서 AWS 배포 시 access key 대신 OIDC**를 쓴다. GitHub을 OIDC provider로 등록하고, 신뢰 정책에 특정 레포·브랜치 조건을 걸어 그 워크플로우만 롤을 전환하게 한다.

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": { "token.actions.githubusercontent.com:sub": "repo:myorg/myrepo:ref:refs/heads/main" }
  }
}
```

이렇게 하면 CI/CD에 장기 access key를 저장할 필요가 없어 유출 위험이 사라진다.

> ⚠️ **함정**: OIDC 신뢰 정책에서 **`sub` 조건을 와일드카드로 느슨하게 쓰는 것**이 가장 위험한 실수다. `"StringLike": { "token.actions.githubusercontent.com:sub": "repo:myorg/*" }`처럼 쓰면 그 조직의 *어떤 레포, 어떤 브랜치, 어떤 포크 PR*에서도 롤을 전환할 수 있다. 외부 기여자가 PR을 열어 워크플로우를 돌리는 것만으로 프로덕션 배포 롤을 손에 넣을 수 있다는 뜻이다. 최소한 레포까지는 못 박고, 배포 롤이라면 브랜치나 GitHub Environment까지(`repo:myorg/myrepo:environment:production`) 좁혀야 한다. 더불어 **`aud` 조건을 반드시 함께 검사**한다 — `sub`만 검사하고 `aud`를 빠뜨리면 다른 대상에게 발급된 토큰이 통할 여지가 남는다.

```json
// 최소 권한형 GitHub OIDC 신뢰 정책 — sub와 aud를 모두 못 박는다
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        "token.actions.githubusercontent.com:sub": "repo:myorg/myrepo:environment:production"
      }
    }
  }]
}
```

| 조건 표현 | 허용 범위 | 평가 |
|-----------|-----------|------|
| `"sub": "repo:myorg/*"` | 조직의 모든 레포·브랜치·PR | 사실상 무제한. 쓰면 안 된다 |
| `"sub": "repo:myorg/myrepo:*"` | 그 레포의 모든 브랜치·PR | 포크 PR로 전환 가능. 위험 |
| `"sub": "repo:myorg/myrepo:ref:refs/heads/main"` | main 브랜치 워크플로우만 | 실용적 최소선 |
| `"sub": "repo:myorg/myrepo:environment:production"` | 승인 게이트가 걸린 환경만 | 배포 롤의 권장 형태 |

Cognito 자격증명 풀도 내부적으로 같은 API를 쓴다. 이때는 `cognito-identity.amazonaws.com:aud`(자격증명 풀 ID)와 `:amr`(인증 여부)로 조건을 건다.

```json
{
  "Effect": "Allow",
  "Principal": { "Federated": "cognito-identity.amazonaws.com" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "cognito-identity.amazonaws.com:aud": "ap-northeast-2:11111111-2222-3333-4444-555555555555"
    },
    "ForAnyValue:StringLike": {
      "cognito-identity.amazonaws.com:amr": "authenticated"
    }
  }
}
```

Cognito 자격증명 풀은 **인증된 사용자 롤과 미인증(게스트) 사용자 롤을 따로** 갖는다. `amr` 조건은 이 둘을 구분하는 장치이고, 이 조건을 빠뜨리면 게스트가 인증 사용자 롤을 얻는 일이 생길 수 있다.

### SAML과 OIDC, 언제 무엇을

| 항목 | SAML 2.0 | OIDC |
|------|----------|------|
| 토큰 형식 | 서명된 **XML** Assertion | 서명된 **JWT** |
| 주 사용처 | 엔터프라이즈 IdP(AD FS, Okta, Ping) | 모바일·웹 앱, CI/CD, Kubernetes |
| AWS STS API | `AssumeRoleWithSAML` | `AssumeRoleWithWebIdentity` |
| AWS 등록 객체 | SAML identity provider(메타데이터 XML) | OIDC identity provider(발급자 URL·audience) |
| 롤 지정 방식 | Assertion의 `Role` 속성이 롤 ARN을 실어 나름 | 신뢰 정책이 `sub`/`aud`로 판정 |
| 조건 키 | `SAML:aud`, `SAML:iss`, `SAML:sub` | `<issuer>:aud`, `<issuer>:sub` |
| 브라우저 흐름 | 콘솔 SSO에 최적화 | 기계 대 기계(M2M)에 최적화 |

한 문장으로 정리하면 **사람이 브라우저로 들어오면 SAML(또는 Identity Center), 코드가 자동으로 들어오면 OIDC**다. 온프레미스 서버나 컨테이너처럼 IdP가 없는 워크로드는 X.509 인증서 기반의 IAM Roles Anywhere가 같은 문제(장기 키 제거)를 푸는 또 하나의 경로다.

## IAM Identity Center: 페더레이션의 매니지드 버전

Identity Center는 위의 복잡한 SAML/OIDC 설정을 매니지드로 묶는다.

- **Permission Set**: "어떤 권한 세트를 어떤 계정에서 줄 것인가"를 정의 (= IAM 롤 템플릿)
- **외부 IdP 연동**: Okta, Azure AD, Ping 등을 SAML/SCIM으로 연결
- **계정 할당**: 사용자/그룹 × Permission Set × 계정 매핑
- **단일 로그인 포털**: 사용자가 한 번 로그인하면 권한 있는 모든 계정에 접근

```
직원 "alice" → IdP 그룹 "Developers"
  → Identity Center: Developers 그룹에 "DeveloperAccess" Permission Set 할당
  → Prod 계정, Dev 계정 두 곳에 매핑
  → alice가 포털 로그인 시 두 계정 모두 표시, 클릭으로 전환
```

> 🔍 **더 깊이**: Identity Center가 계정에 Permission Set을 할당하면, 그 계정에 `AWSReservedSSO_*` 형태의 IAM 롤을 자동 생성한다. 즉 내부적으로는 여전히 STS의 AssumeRole이 작동하지만, 사용자는 롤을 직접 다루지 않는다. SCIM(System for Cross-domain Identity Management) 프로토콜로 IdP의 사용자/그룹 변경이 자동 동기화되어, 퇴사자가 IdP에서 비활성화되면 AWS 접근도 즉시 끊긴다.

```
[ Identity Center의 실제 배선도 ]

  외부 IdP (Okta / Entra ID / AD FS)
     │  ① SAML 2.0 — 인증
     │  ② SCIM      — 사용자·그룹 프로비저닝
     ▼
  ┌──────────────── IAM Identity Center ────────────────┐
  │  Identity Store   : 사용자 / 그룹                    │
  │  Permission Set   : 정책 묶음 + 세션 시간 + 경계     │
  │  Assignment       : (그룹 × Permission Set × 계정)   │
  └──────────────────────────────────────────────────────┘
     │  ③ 할당이 만들어지는 순간
     ▼
  각 멤버 계정에 IAM 롤이 자동 생성된다
     arn:aws:iam::444455556666:role/AWSReservedSSO_DeveloperAccess_a1b2c3
     · 신뢰 정책은 Identity Center를 가리킨다
     · 사람이 이 롤을 직접 편집하면 다음 동기화 때 되돌아간다
     ▼
  ④ 사용자는 포털에서 계정을 골라 클릭 → 내부적으로 AssumeRole
     CloudTrail에는 그 롤 + 사용자 식별자가 세션으로 남는다
```

이 배선도에서 시험이 노리는 지점은 **③의 롤이 "관리 대상이 아니다"**라는 것이다. Permission Set을 고치면 할당된 모든 계정의 롤이 함께 갱신되므로, 개별 계정에서 그 롤을 손으로 수정하는 것은 의미가 없고 오히려 드리프트를 만든다. 계정별로 다른 권한이 필요하면 롤을 고치는 것이 아니라 **Permission Set을 나누거나 고객 관리형 정책 참조를 쓴다.**

```bash
# Permission Set 생성 — 세션 시간은 ISO-8601 기간 형식
aws sso-admin create-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --name DeveloperAccess \
  --description "개발자 표준 권한" \
  --session-duration PT4H

# 관리형 정책 부착
aws sso-admin attach-managed-policy-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-.../ps-... \
  --managed-policy-arn arn:aws:iam::aws:policy/PowerUserAccess

# 권한 경계를 Permission Set에 부착 — day2의 위임 원칙을 SSO에 적용
aws sso-admin put-permissions-boundary-to-permission-set \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-.../ps-... \
  --permissions-boundary CustomerManagedPolicyReference={Name=dev-boundary,Path=/}

# 그룹 × Permission Set × 계정 할당
aws sso-admin create-account-assignment \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --target-id 444455556666 --target-type AWS_ACCOUNT \
  --permission-set-arn arn:aws:sso:::permissionSet/ssoins-.../ps-... \
  --principal-type GROUP \
  --principal-id 90671234-abcd-4321-9876-1234567890ab

# ABAC를 위한 속성 매핑 활성화 (IdP 속성 → 세션 태그)
aws sso-admin create-instance-access-control-attribute-configuration \
  --instance-arn arn:aws:sso:::instance/ssoins-1234567890abcdef \
  --instance-access-control-attribute-configuration \
    'AccessControlAttributes=[{Key=Department,Value={Source=[${path:enterprise.department}]}}]'

# 사용자·그룹 조회는 identitystore API
aws identitystore list-groups --identity-store-id d-1234567890
```

> 🔍 **더 깊이**: `put-permissions-boundary-to-permission-set`이 존재한다는 사실이 day2와 day4를 잇는 다리다. Identity Center를 쓰면 사람에게 부여되는 권한이 Permission Set 하나로 표준화되지만, 그 Permission Set이 `PowerUserAccess`처럼 넓으면 여전히 권한 상승 여지가 남는다. Permission Set에 **고객 관리형 권한 경계**를 걸면 SSO로 들어온 세션에도 천장이 생긴다. "SSO를 도입했으니 경계는 필요 없다"는 것은 오해다 — 페더레이션은 *신원*을 정리하는 도구이고, 경계는 *권한*을 제한하는 도구라 서로를 대체하지 않는다.

### Identity Center vs IAM 사용자 vs 직접 SAML

| 항목 | IAM 사용자 | 직접 SAML 페더레이션 | IAM Identity Center |
|------|------------|----------------------|---------------------|
| 자격증명 | 장기 access key·비밀번호 | 임시(STS) | 임시(STS) |
| 계정 수가 늘 때 | 계정 × 사용자로 폭발 | 계정마다 IdP 설정·롤 반복 | **중앙에서 할당만 추가** |
| 퇴사자 처리 | 계정마다 수동 삭제 | IdP 비활성화(롤은 남음) | SCIM 동기화로 즉시 반영 |
| MFA | 계정마다 개별 설정 | IdP가 담당 | IdP 또는 Identity Center가 담당 |
| 권한 정의 | 계정 내 IAM 정책 | 계정마다 롤 + 신뢰 정책 | Permission Set(중앙 정의, 자동 배포) |
| 감사 | 사용자 ARN이 그대로 남음 | 세션 이름 구성에 의존 | 사용자 식별자가 세션에 포함 |
| 적합한 상황 | 레거시·특수 통합 | 계정 수가 적고 IdP 통제가 이미 강할 때 | **멀티 계정 표준** |

> ⚠️ **함정**: "Identity Center를 켜면 IAM 사용자가 자동으로 사라진다"는 것은 오해다. 기존 IAM 사용자는 그대로 남아 계속 동작한다. IAM 사용자를 실제로 없애려면 **SCP로 `iam:CreateUser`·`iam:CreateAccessKey`를 Deny**해 신규 생성을 봉쇄하고, 자격증명 보고서로 기존 사용자를 찾아 하나씩 정리해야 한다. 시험에서 "조직 전체에서 IAM 사용자 사용을 금지하려면"이 나오면 답은 Identity Center 도입 *그 자체*가 아니라 **SCP 차단과의 조합**이다.

## ABAC: 속성 기반 접근 제어

조직이 커지면 "롤마다 정책을 만드는" RBAC(역할 기반)가 폭발한다. 팀 10개 × 환경 3개 = 롤 30개. ABAC(Attribute-Based Access Control)는 이를 **태그**로 해결한다.

```
원리: 주체의 태그(principal tag)와 리소스의 태그(resource tag)가
      일치할 때만 접근을 허용한다.
```

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances", "ec2:StopInstances"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "aws:ResourceTag/Team": "${aws:PrincipalTag/Team}"
    }
  }
}
```

이 단 하나의 정책으로 모든 팀이 처리된다. `alice`의 PrincipalTag `Team=payments`면 `Team=payments` 리소스만, `bob`의 `Team=billing`이면 `Team=billing` 리소스만 접근한다. 새 팀이 생겨도 정책 변경이 필요 없다 — 태그만 붙이면 된다.

Identity Center와 결합하면 IdP의 사용자 속성(예: AD의 department)이 SAML Assertion을 통해 PrincipalTag로 전달되어, **IdP에서 부서만 바꾸면 AWS 권한이 자동으로 따라온다.**

> 💡 **관련 이론**: ABAC는 NIST SP 800-162에 정의된 접근 제어 모델로, RBAC의 "역할 폭발(role explosion)" 문제를 푼다. RBAC는 (사용자→역할→권한)의 정적 매핑이라 차원이 늘면 역할 수가 곱셈으로 증가한다. ABAC는 (속성 + 정책 규칙)의 동적 평가라 규칙 하나가 무한히 많은 조합을 커버한다. 단점은 디버깅이 어렵고 태그 거버넌스가 필수라는 점 — 태그가 누락되거나 변조되면 접근 제어가 깨진다.

> ⚠️ **함정**: ABAC를 쓸 때 사용자가 자기 PrincipalTag를 스스로 바꾸거나, 리소스 생성 시 태그를 임의로 붙일 수 있으면 통제가 무너진다. 그래서 `aws:RequestTag`와 `aws:TagKeys` 조건으로 "생성 시 반드시 자기 팀 태그를 붙이도록" 강제하고, `iam:TagRole`/`sts:TagSession` 권한을 엄격히 제한해야 한다.

### RBAC와 ABAC를 나란히 놓고 보기

| 항목 | RBAC (역할 기반) | ABAC (속성 기반) |
|------|------------------|------------------|
| 권한의 근거 | "너는 어느 역할인가" | "너의 속성과 리소스의 속성이 맞는가" |
| 차원이 늘 때 | 역할 수가 **곱셈**으로 증가 | 정책 수는 **그대로** |
| 새 팀 온보딩 | 롤·정책 신규 생성 필요 | 태그만 붙이면 끝 |
| 감사·설명 가능성 | 쉬움("이 롤은 이걸 할 수 있다") | 어려움(런타임 태그에 따라 달라짐) |
| 사고 시 영향 파악 | 롤 하나를 보면 됨 | 태그 상태를 함께 봐야 함 |
| 실패 지점 | 롤 폭발, 과잉 권한 누적 | **태그 거버넌스 붕괴** |
| 적합한 곳 | 소수의 뚜렷한 직무(보안, DBA, 감사) | 팀·환경·프로젝트처럼 계속 늘어나는 축 |

실무의 정답은 둘 중 하나가 아니라 **혼합**이다. 성격이 뚜렷하고 수가 적은 권한(보안 관리자, 감사 읽기 전용)은 RBAC로 명시적으로 두고, 팀·환경처럼 조합이 계속 늘어나는 축만 ABAC로 접는다. ABAC를 전면 도입하면 "왜 이 사람이 이걸 볼 수 있는가"를 설명하기 어려워져 감사 대응 비용이 커진다.

### ABAC를 지탱하는 태그 거버넌스

ABAC 정책 한 줄은 우아하지만, 그 우아함은 **태그가 정확하다는 가정** 위에 서 있다. 가정을 강제하는 문장이 함께 가야 한다.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowActionsOnlyOnMatchingTeamResources",
      "Effect": "Allow",
      "Action": ["ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances"],
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceTag/Team": "${aws:PrincipalTag/Team}"
        }
      }
    },
    {
      "Sid": "RequireOwnTeamTagOnCreate",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Team": "${aws:PrincipalTag/Team}"
        },
        "ForAllValues:StringEquals": {
          "aws:TagKeys": ["Team", "Owner", "Env"]
        }
      }
    },
    {
      "Sid": "DenyRetaggingToEscapeOwnTeam",
      "Effect": "Deny",
      "Action": ["ec2:CreateTags", "ec2:DeleteTags"],
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:ResourceTag/Team": "${aws:PrincipalTag/Team}"
        }
      }
    },
    {
      "Sid": "DenySelfTaggingOfIdentities",
      "Effect": "Deny",
      "Action": ["iam:TagRole", "iam:UntagRole", "iam:TagUser", "iam:UntagUser"],
      "Resource": "*"
    }
  ]
}
```

네 문장이 ABAC의 네 가지 붕괴 경로를 각각 막는다.

| Sid | 막는 붕괴 경로 |
|-----|----------------|
| `AllowActionsOnlyOnMatchingTeamResources` | (본체) 다른 팀 리소스 접근 |
| `RequireOwnTeamTagOnCreate` | 태그 없이 만들어 통제 밖 리소스를 양산 |
| `DenyRetaggingToEscapeOwnTeam` | 남의 리소스에 자기 팀 태그를 덮어써 탈취 |
| `DenySelfTaggingOfIdentities` | **자기 신원의 태그를 바꿔 다른 팀이 되기** |

마지막 문장이 가장 중요하다. ABAC에서 `aws:PrincipalTag/Team`은 곧 신원이므로, **자기 태그를 바꿀 수 있으면 신원을 바꿀 수 있다.** day2의 권한 상승 논리가 태그 세계에서 그대로 재현되는 것이다. Identity Center를 쓰면 이 태그가 IdP 속성에서 오므로 AWS 안에서는 바꿀 수 없고, 대신 **IdP의 속성 편집 권한이 곧 AWS 권한 상승 경로**가 된다. 통제 지점이 AWS 밖으로 옮겨 갔을 뿐 사라진 것이 아니다.

> ⚠️ **함정**: `ForAllValues:StringEquals`를 `aws:TagKeys`에 쓸 때 day1의 함정이 그대로 재현된다. 이 연산자는 "요청에 들어온 태그 키가 전부 목록 안에 있는가"를 검사하는데, **태그를 하나도 안 붙이면 조건이 참**이 된다. 그래서 `RequireOwnTeamTagOnCreate`에는 `aws:RequestTag/Team`을 `StringEquals`로 직접 요구하는 문장이 반드시 함께 있어야 한다. `ForAllValues`는 "허용된 키만 쓰라"는 화이트리스트이고, "반드시 쓰라"는 강제가 아니다.

> 🎯 **시나리오**: "사내 IdP의 `department` 속성을 AWS 접근 제어에 그대로 쓰기로 했다. Identity Center에서 속성 매핑을 켜고 ABAC 정책을 배포했는데, 인사 시스템에서 부서 코드 체계가 바뀌면서 값이 `payments` → `PAY-001` 형태로 전환됐다. 무슨 일이 벌어지는가?" → 태그 값이 리소스 쪽과 어긋나면서 **접근이 조용히 전부 끊긴다.** ABAC의 구조적 취약점이 여기 있다 — 접근 제어가 AWS 밖 시스템의 데이터 스키마에 결합된다. 실무 대응은 (1) IdP 속성을 그대로 쓰지 않고 매핑 계층을 두어 AWS 쪽 태그 값 어휘를 고정하고, (2) 속성 체계 변경을 배포 변경으로 취급해 사전 통보 절차를 만들고, (3) 태그 불일치로 인한 AccessDenied 급증을 모니터링 지표로 두는 것이다.

## STS 세션과 보안 고려사항

페더레이션으로 받는 것은 모두 임시 자격증명이다.

- **세션 기간**: SAML/OIDC 기본 1시간, 롤의 `MaxSessionDuration` 설정으로 최대 12시간
- **세션 정책(Session Policy)**: AssumeRole 시 추가 정책을 전달해 그 세션만 권한 축소(day1의 6번째 평가 층)
- **세션 태그**: `sts:TagSession`으로 ABAC용 속성 전달
- **로그**: 모든 AssumeRole 호출이 CloudTrail에 기록 → 누가 언제 어떤 롤을 썼는지 추적

> 🔍 **더 깊이**: 페더레이션 세션은 `aws:userid`가 `ROLEID:session-name` 형태로 기록되어, 같은 롤을 여러 사람이 써도 CloudTrail의 `sts:RoleSessionName`으로 실제 개인을 식별할 수 있다. 그래서 페더레이션 설계 시 session name에 직원 식별자(이메일·사번)를 넣도록 IdP를 구성하는 것이 감사 추적의 핵심이다.

### 신뢰 정책: 페더레이션의 진짜 통제점

권한 정책이 "무엇을 할 수 있는가"를 정한다면, **신뢰 정책은 "누가 이 롤이 될 수 있는가"**를 정한다. 페더레이션 환경에서 사고는 권한 정책보다 신뢰 정책에서 훨씬 자주 난다. 신뢰 정책이 넓으면 권한 정책이 아무리 좁아도 *잘못된 사람*이 그 권한을 갖기 때문이다.

가장 위험한 형태부터 가장 안전한 형태까지 늘어놓으면 다음과 같다.

```
[ 신뢰 정책 위험도 사다리 — 위험 → 안전 ]

  ❌ "Principal": { "AWS": "*" }
        누구나 전환 시도 가능. 조건이 없으면 사실상 공개 롤

  ⚠️ "Principal": { "AWS": "arn:aws:iam::444455556666:root" }
        상대 계정 **전체**를 신뢰. 그 계정의 어떤 주체든 가능
        → 상대 계정 안에서 누가 쓸지는 상대가 정한다

  🙂 "Principal": { "AWS": "arn:aws:iam::444455556666:role/AuditRole" }
        특정 롤만 신뢰. 대상이 명확해진다

  ✅ 위 + Condition
        sts:ExternalId          — 서드파티 위임의 필수 요소
        aws:PrincipalOrgID      — 조직 밖 주체 배제
        aws:MultiFactorAuthPresent — 사람 조작에 MFA 요구
        aws:SourceIp / SourceVpce  — 경로 제한
```

두 번째 항목(`:root`)에 대한 오해가 흔하다. 이것은 "상대 계정의 루트 사용자"가 아니라 **"상대 계정에 위임한다"**는 뜻이고, 실제 결과는 *상대 계정의 IAM 관리자가 아무에게나 이 롤 전환 권한을 줄 수 있다*는 것이다. 편의를 위해 흔히 쓰이지만, 상대 계정의 내부 통제 수준에 우리 보안이 종속된다는 점을 인지하고 써야 한다.

서드파티 SaaS에 롤을 열어 줄 때는 `sts:ExternalId`가 필수다.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::THIRD_PARTY_ACCOUNT:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "7f3c9a2b-e1d4-4a88-9c6f-2b0d5e91a4c7"
      }
    }
  }]
}
```

```
[ ExternalId가 막는 것 — confused deputy ]

  ExternalId 없음:
    우리 계정 ──신뢰──▶ SaaS 계정
    다른 고객 X가 SaaS에 "이 롤 ARN을 등록해 줘"라고 요청
      → SaaS(deputy)가 우리 롤로 전환해 X를 위해 일한다
      → SaaS는 정당한 권한을 썼지만, 요청자는 무권한자였다

  ExternalId 있음:
    X는 우리만 아는 ExternalId를 모른다
      → SaaS가 전환을 시도해도 조건 불일치로 거부 ✅
```

같은 문제가 **AWS 서비스가 우리 대신 리소스를 호출할 때**도 발생한다. 이때는 `sts:ExternalId`가 아니라 `aws:SourceArn`·`aws:SourceAccount`로 막는다.

```json
// 서비스 프린시펄용 신뢰 정책 — "우리 계정의, 이 리소스를 위한 호출만"
{
  "Effect": "Allow",
  "Principal": { "Service": "config.amazonaws.com" },
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": { "aws:SourceAccount": "111122223333" },
    "ArnLike": { "aws:SourceArn": "arn:aws:config:ap-northeast-2:111122223333:*" }
  }
}
```

> 💡 **관련 이론**: `sts:ExternalId`와 `aws:SourceArn`은 같은 문제(confused deputy)에 대한 두 가지 답이다. 차이는 **대리인이 누구냐**에 있다. 대리인이 *다른 AWS 계정*(서드파티 SaaS)이면 그 계정이 여러 고객을 섞어 다루므로 고객을 구분할 비밀값(`ExternalId`)이 필요하고, 대리인이 *AWS 서비스*면 서비스는 이미 신뢰되므로 비밀이 아니라 "어느 리소스를 위한 호출인가"(`SourceArn`)만 확인하면 된다. 시험에서 `Principal`이 `Service`인데 보기에 `sts:ExternalId`가 있으면 오답 신호이고, 반대로 `Principal`이 서드파티 계정인데 `aws:SourceArn`을 고르면 역시 어긋난다.

> ⚠️ **함정**: ExternalId는 **비밀이지만 인증 수단은 아니다.** 추측 불가능한 값이어야 하지만(고객사 이름이나 순번은 금지), 그것만으로 강력한 인증이 되지는 않는다. 그래서 서드파티 위임에서는 ExternalId와 함께 *권한 자체를 최소로 좁히고*, 부여한 롤의 사용 내역을 CloudTrail로 계속 관찰하는 것이 정석이다. "ExternalId를 걸었으니 넓은 권한을 줘도 된다"는 것은 잘못된 추론이다.

### 페더레이션에서 막혔을 때

| 증상 | 유력한 원인 |
|------|-------------|
| `AssumeRoleWithSAML` 자체가 실패 | 신뢰 정책의 `Principal`(saml-provider ARN) 불일치, `SAML:aud` 조건 불일치, IdP 메타데이터 만료 |
| 태그를 넣자 전환이 실패 | 신뢰 정책 `Action`에 `sts:TagSession`이 없음 |
| `SourceIdentity`를 넣자 실패 | 신뢰 정책 `Action`에 `sts:SetSourceIdentity`가 없음 |
| 전환은 되는데 세션이 1시간에 끊김 | 롤 체이닝 경로(1시간 상한) 또는 `SessionDuration` 미전달 |
| 요청한 12시간이 거부됨 | 롤의 `MaxSessionDuration`이 그보다 짧음 |
| GitHub Actions에서 간헐 실패 | `sub` 조건이 브랜치·환경과 어긋남(태그 푸시, PR 등) |
| ABAC 정책이 갑자기 전부 거부 | IdP 속성 값 변경 또는 리소스 태그 누락 |
| Identity Center 롤을 수정했는데 되돌아감 | Permission Set이 원본이다. 롤을 직접 고치면 안 됨 |

## 정리하며

현대 AWS 접근 관리의 정답은 "IAM 사용자 + access key"가 아니라 "페더레이션 + 임시 자격증명"이다. SAML(엔터프라이즈 IdP), OIDC(모바일·CI/CD), Identity Center(매니지드 통합)의 세 갈래를 구분하고, 각각의 STS API(`AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity`)와 신뢰 정책을 정확히 매핑할 수 있어야 한다. 그리고 ABAC로 태그 기반 접근을 설계하면 역할 폭발 없이 확장 가능한 거버넌스를 얻는다. 단 태그 거버넌스가 무너지면 ABAC도 무너진다는 점을 기억하라.

> 📚 **사례**: 2019년 Capital One 침해에서 공격자가 손에 넣은 것은 **EC2 인스턴스 역할의 임시 자격증명**이었다. 잘못 구성된 WAF를 통한 SSRF로 인스턴스 메타데이터에 접근해 자격증명을 얻었고, 그것으로 S3 버킷 목록을 조회한 뒤 데이터를 내려받았다. 미국·캐나다 신용카드 신청자 약 1억 명 규모의 정보가 영향을 받았다. 이 사건이 페더레이션 논의에 주는 교훈은 역설적이다 — **임시 자격증명이라고 해서 안전한 것이 아니다.** 임시성은 "유출된 키가 영원히 유효하지 않다"는 것만 보장할 뿐, 유효한 그 시간 동안 할 수 있는 일의 범위는 전혀 좁혀 주지 않는다. 그래서 페더레이션 설계의 완성은 임시 자격증명 도입이 아니라 그 위에 얹는 세션 정책·권한 경계·조건(`aws:SourceVpce`, MFA)이고, 인스턴스 메타데이터 접근 자체를 IMDSv2로 조이는 것(day3의 SCP)이다.

> 📚 **사례**: CI/CD 파이프라인에 저장된 장기 access key가 공개 저장소나 빌드 로그를 통해 노출되는 일은 업계 전반에서 반복돼 왔고, 그래서 GitHub Actions·GitLab·Kubernetes가 잇달아 OIDC 발급자를 내장하는 방향으로 움직였다. 다만 OIDC로 전환한 뒤 새로 생기는 실수 패턴이 있다 — **신뢰 정책의 `sub` 조건을 `repo:org/*`처럼 넓게 쓰는 것.** 키를 없애 유출 위험은 줄였지만, 조직 안 아무 레포에서나 프로덕션 롤을 전환할 수 있게 되어 공격 표면이 오히려 이동한 형태다. "장기 키 제거"는 목표의 절반이고, 나머지 절반은 "그 대신 들어온 신뢰 관계를 최소한으로 좁히는 것"이다.

## 한 줄 요약

IAM 사용자와 장기 키를 없애고 **페더레이션 + STS 임시 자격증명**으로 가는 것이 현대 표준이며, 사람은 SAML/Identity Center, 기계는 OIDC가 기본 경로다. STS API는 `AssumeRole`(AWS 자격증명), `AssumeRoleWithSAML`(XML Assertion), `AssumeRoleWithWebIdentity`(JWT), 그리고 IAM 사용자를 전제하는 `GetSessionToken`·`GetFederationToken`으로 나뉜다. SAML은 `Role`·`RoleSessionName`·`PrincipalTag:` 속성을 실어 나르고 `SAML:aud` 조건이 필수이며, 태그·원본 신원을 쓰려면 신뢰 정책 `Action`에 `sts:TagSession`·`sts:SetSourceIdentity`가 함께 있어야 한다. OIDC는 `sub`와 `aud`를 **둘 다** 못 박아야 하고 `repo:org/*` 같은 와일드카드는 사실상 무제한 위임이다. Identity Center는 Permission Set을 중앙에서 정의해 각 계정에 `AWSReservedSSO_*` 롤로 자동 배포하며 SCIM으로 퇴사자가 즉시 반영되지만, 기존 IAM 사용자를 없애려면 SCP 차단이 함께 필요하다. ABAC는 역할 폭발을 막지만 태그가 곧 신원이므로 자기 태그 변경(`iam:TagRole`)과 남의 리소스 재태깅을 반드시 Deny해야 하고, 신뢰 정책에서는 서드파티에 `sts:ExternalId`, AWS 서비스에 `aws:SourceArn`/`aws:SourceAccount`로 confused deputy를 막는다.

다음 글에서는 Week 2 전체(평가 로직 → Boundary → SCP → 페더레이션/ABAC)를 하나의 멀티 계정 거버넌스 시나리오로 통합해 복습한다.

---

## 📝 연습 문제

**문제 1.** 한 회사가 GitHub Actions에서 AWS로 배포할 때 장기 access key를 워크플로우에 저장하지 않으려 한다. 가장 적절한 방법은?

A) IAM 사용자를 만들어 access key를 GitHub Secrets에 저장한다  
B) GitHub을 OIDC provider로 등록하고, `AssumeRoleWithWebIdentity`로 특정 레포·브랜치 조건의 롤을 전환하게 한다  
C) 루트 사용자 자격증명을 사용한다  
D) Permission Boundary를 GitHub에 부착한다  

**정답: B**  
해설: GitHub Actions는 OIDC를 지원하므로, OIDC provider로 등록하고 신뢰 정책에 `token.actions.githubusercontent.com:sub` 조건으로 특정 레포·브랜치를 제한하면 장기 키 없이 임시 자격증명만 받는다. access key 저장은 유출 위험이 있고, 루트 사용은 금기이며, Boundary는 GitHub에 부착하는 개념이 아니다.

---

**문제 2.** 사용자가 회사 Active Directory로 로그인한 뒤 AWS 콘솔에 접근해야 한다. AD FS가 SAML Assertion을 발급한다. AWS 측에서 이 흐름에 사용되는 STS API는?

A) `sts:AssumeRole`  
B) `sts:GetSessionToken`  
C) `sts:AssumeRoleWithSAML`  
D) `sts:AssumeRoleWithWebIdentity`  

**정답: C**  
해설: 엔터프라이즈 SAML IdP(AD FS, Okta 등)가 발급한 SAML Assertion으로 임시 자격증명을 받을 때는 `AssumeRoleWithSAML`을 사용한다. 일반 `AssumeRole`은 IAM 주체 간 전환, `GetSessionToken`은 MFA용 단기 토큰, `AssumeRoleWithWebIdentity`는 OIDC(모바일·웹·CI/CD)용이다.

---

**문제 3.** 한 조직이 팀 10개 × 환경 3개의 조합으로 EC2 접근을 제어하려 하는데, 롤이 30개로 폭발하는 것을 피하려 한다. 가장 확장성 있는 접근법은?

A) 30개 롤을 모두 만든다  
B) PrincipalTag와 ResourceTag가 일치할 때만 허용하는 ABAC 정책을 사용한다  
C) 모든 사용자에게 AdministratorAccess를 준다  
D) SCP로 각 팀을 분리한다  

**정답: B**  
해설: ABAC는 주체 태그와 리소스 태그가 일치할 때 접근을 허용하는 단일 정책으로 무한히 많은 팀·환경 조합을 커버해 역할 폭발을 막는다. 30개 롤은 RBAC의 한계 그 자체이고, AdministratorAccess는 최소 권한 위반, SCP는 계정 단위 가드레일이라 팀별 리소스 접근 제어에는 부적합하다.

---

**문제 4.** IAM Identity Center에서 직원이 퇴사했을 때 AWS 접근이 즉시 차단되도록 하려면 가장 효과적인 방법은?

A) 각 계정에서 IAM 사용자를 수동 삭제한다  
B) 외부 IdP를 SCIM으로 연동해, IdP에서 사용자 비활성화 시 AWS 접근이 자동 동기화되도록 한다  
C) access key를 회전한다  
D) SCP로 퇴사자를 차단한다  

**정답: B**  
해설: SCIM 프로토콜로 외부 IdP와 Identity Center를 연동하면 IdP에서 사용자를 비활성화하는 순간 AWS 접근도 자동으로 끊긴다. 이것이 신뢰의 단일 출처 모델의 핵심 이점이다. 수동 삭제는 누락 위험이 크고, access key는 페더레이션 환경에 존재하지 않으며, SCP는 개별 퇴사자를 다루는 도구가 아니다.

---

**문제 5.** 여러 직원이 같은 페더레이션 롤을 사용한다. CloudTrail에서 특정 행위를 한 실제 개인을 식별하려면 무엇이 필요한가?

A) 롤마다 개인을 분리해 만들어야만 가능하다  
B) IdP에서 session name에 직원 식별자(이메일·사번)를 넣도록 구성하면 `sts:RoleSessionName`으로 식별된다  
C) CloudTrail은 페더레이션 사용자를 식별할 수 없다  
D) MFA 로그로만 식별 가능하다  

**정답: B**  
해설: 페더레이션 세션은 `aws:userid`가 `ROLEID:session-name` 형태로 기록되며, IdP가 session name에 직원 식별자를 넣도록 구성하면 CloudTrail의 `sts:RoleSessionName`으로 실제 개인을 추적할 수 있다. 따라서 롤을 개인별로 쪼갤 필요가 없고, CloudTrail은 페더레이션 사용자도 식별 가능하다.
