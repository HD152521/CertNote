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

## STS 세션과 보안 고려사항

페더레이션으로 받는 것은 모두 임시 자격증명이다.

- **세션 기간**: SAML/OIDC 기본 1시간, 롤의 `MaxSessionDuration` 설정으로 최대 12시간
- **세션 정책(Session Policy)**: AssumeRole 시 추가 정책을 전달해 그 세션만 권한 축소(day1의 6번째 평가 층)
- **세션 태그**: `sts:TagSession`으로 ABAC용 속성 전달
- **로그**: 모든 AssumeRole 호출이 CloudTrail에 기록 → 누가 언제 어떤 롤을 썼는지 추적

> 🔍 **더 깊이**: 페더레이션 세션은 `aws:userid`가 `ROLEID:session-name` 형태로 기록되어, 같은 롤을 여러 사람이 써도 CloudTrail의 `sts:RoleSessionName`으로 실제 개인을 식별할 수 있다. 그래서 페더레이션 설계 시 session name에 직원 식별자(이메일·사번)를 넣도록 IdP를 구성하는 것이 감사 추적의 핵심이다.

## 정리하며

현대 AWS 접근 관리의 정답은 "IAM 사용자 + access key"가 아니라 "페더레이션 + 임시 자격증명"이다. SAML(엔터프라이즈 IdP), OIDC(모바일·CI/CD), Identity Center(매니지드 통합)의 세 갈래를 구분하고, 각각의 STS API(`AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity`)와 신뢰 정책을 정확히 매핑할 수 있어야 한다. 그리고 ABAC로 태그 기반 접근을 설계하면 역할 폭발 없이 확장 가능한 거버넌스를 얻는다. 단 태그 거버넌스가 무너지면 ABAC도 무너진다는 점을 기억하라.

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
