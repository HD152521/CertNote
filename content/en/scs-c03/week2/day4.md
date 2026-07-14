# Day 4 - IAM Identity Center and Federation: SAML, OIDC, and ABAC

So far (day 1-3), we covered "how to restrict permissions." Today, we examine the modern answer to "how do you grant access to people." Creating individual IAM users for thousands of employees across hundreds of accounts is a nightmare. Long-lived credentials (access keys) have high breach risk, and managing departures is difficult.

The solution is **federation**. The company's existing ID system (Active Directory, Okta, Azure AD, etc.) becomes the source of trust, and AWS receives that trust to issue **temporary credentials**. Bundling this in a managed way is **IAM Identity Center** (formerly AWS SSO). SAML/OIDC flows and ABAC are guaranteed to appear on the Specialty exam.

## Why You Should Abandon IAM Users

First, let''s clarify the motivation. Problems with IAM users:

- **Long-lived credentials**: Access keys remain permanently valid unless rotated → catastrophic if breached
- **Duplication per account**: 200 accounts means 200 IAM users per person
- **Duplicated ID source**: Company HR/AD and AWS don''t sync → departed employee permissions persist
- **Scattered MFA management**: Configured separately per account

> 💡 **Related Theory**: The core of federation is **single source of truth** for identity. In identity management theory, this is called **identity federation**, where one place (IdP, Identity Provider) authenticates and multiple services (SP, Service Provider/RP, Relying Party) trust the result. Credentials are managed in one place only, so disabling a departed employee immediately reflects everywhere. AWS implements this pattern via STS temporary credentials — there are no permanent keys at all.

## SAML 2.0 Federation Flow

This is the traditional SAML flow used in enterprise environments (AD FS, Okta).

```
1. User logs into company portal (IdP)
2. IdP issues SAML Assertion (signed XML)
   → Contains user identity + IAM role info to be granted
3. User submits this Assertion to AWS STS
   (sts:AssumeRoleWithSAML)
4. AWS verifies IdP is trusted (SAML Identity Provider registration required)
5. STS issues temporary credentials (default 1 hour, max 12 hours)
6. User accesses AWS with those credentials
```

Two things are needed on the AWS side.

```json
// 1) Register SAML Identity Provider in IAM (upload IdP metadata XML)
// 2) Attach a trust policy to the role allowing AssumeRoleWithSAML
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

> ⚠️ **Pitfall**: `sts:AssumeRoleWithSAML` requires the `Principal` in the trust policy to be `Federated` pointing to the SAML provider. Don''t confuse this with regular `AssumeRole` (switching between IAM roles) or `AssumeRoleWithWebIdentity` (OIDC). Exams frequently ask you to distinguish among three STS APIs: `AssumeRole` (IAM principals), `AssumeRoleWithSAML` (enterprise SAML IdP), `AssumeRoleWithWebIdentity` (OIDC — mobile apps, Cognito, GitHub Actions, etc.).

## OIDC and Web Identity Federation

Mobile apps, web apps, and CI/CD environments (GitHub Actions) use OIDC (OpenID Connect).

```
sts:AssumeRoleWithWebIdentity
  - Google, Facebook, Cognito, GitHub OIDC provider, etc.
  - Submit JWT (JSON Web Token) to STS
  - Issue temporary credentials without hardcoding AWS credentials in mobile apps
```

A prime modern example: **Deploying from GitHub Actions to AWS using OIDC instead of access keys**. Register GitHub as an OIDC provider, add specific repo/branch conditions to the trust policy, and only that workflow can assume the role.

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

This way, you don''t need to store long-lived access keys in CI/CD, eliminating breach risk.

## IAM Identity Center: The Managed Version of Federation

Identity Center bundles the complex SAML/OIDC setup into a managed service.

- **Permission Set**: Defines "what permissions to grant in which account" (= IAM role template)
- **External IdP Integration**: Connect Okta, Azure AD, Ping, etc. via SAML/SCIM
- **Account Assignment**: User/group × Permission Set × account mapping
- **Single Sign-On Portal**: User logs in once, then accesses all authorized accounts

```
Employee "alice" → IdP group "Developers"
  → Identity Center: Assign "DeveloperAccess" Permission Set to Developers group
  → Map to both Prod and Dev accounts
  → alice logs into portal, both accounts appear, click to switch
```

> 🔍 **Deeper**: When Identity Center assigns a Permission Set to an account, it automatically creates an IAM role of the form `AWSReservedSSO_*` in that account. Internally, STS AssumeRole still works, but users don''t directly handle roles. The SCIM (System for Cross-domain Identity Management) protocol auto-syncs user/group changes from the IdP, so the moment a departed employee is disabled in the IdP, AWS access cuts off immediately.

## ABAC: Attribute-Based Access Control

As organizations grow, "creating a policy per role" (RBAC) explodes. 10 teams × 3 environments = 30 roles. ABAC (Attribute-Based Access Control) solves this with **tags**.

```
Principle: Access is allowed only when the principal''s tags (principal tag)
          match the resource''s tags (resource tag).
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

This single policy handles all teams. If `alice` has PrincipalTag `Team=payments`, she accesses only `Team=payments` resources; if `bob` has `Team=billing`, only `Team=billing` resources. New teams don''t require policy changes — just tag them.

When combined with Identity Center, user attributes from the IdP (e.g., AD department) flow through the SAML Assertion as PrincipalTag, so **changing a department in the IdP automatically updates AWS permissions**.

> 💡 **Related Theory**: ABAC is defined in NIST SP 800-162 as an access control model solving RBAC''s "role explosion" problem. RBAC is static (user→role→permission) mapping, so roles multiply as dimensions increase. ABAC is dynamic (attribute + policy rules) evaluation, so one rule covers infinite combinations. The downside: debugging is hard and tag governance is mandatory — missing or altered tags break access control.

> ⚠️ **Pitfall**: If users can change their own PrincipalTag or arbitrarily tag resources at creation, control breaks. That''s why you must use `aws:RequestTag` and `aws:TagKeys` conditions to force users to tag resources with their own team tag at creation, and strictly limit `iam:TagRole` and `sts:TagSession` permissions.

## STS Sessions and Security Considerations

Everything received via federation is temporary credentials.

- **Session Duration**: SAML/OIDC default 1 hour, roles'' `MaxSessionDuration` setting goes up to 12 hours
- **Session Policy**: Pass an additional policy during AssumeRole to narrow permissions for that session only (day 1''s 6th evaluation layer)
- **Session Tags**: Pass attributes via `sts:TagSession` for ABAC
- **Logging**: Every AssumeRole call is logged in CloudTrail → track who used which role when

> 🔍 **Deeper**: In a federation session, `aws:userid` is recorded as `ROLEID:session-name`, so even if multiple people use the same role, CloudTrail''s `sts:RoleSessionName` identifies the actual individual. That''s why IdP is configured to put employee identifiers (email, employee ID) in the session name — it''s the key to audit trail.

## Wrapping Up

The modern answer to AWS access management is not "IAM users + access keys" but "federation + temporary credentials." Distinguish among three types: SAML (enterprise IdP), OIDC (mobile/CI/CD), Identity Center (managed integration). Each has its STS API (`AssumeRoleWithSAML`, `AssumeRoleWithWebIdentity`) and trust policy mapping, which you must know precisely. And with ABAC, you design tag-based access for scalable governance without role explosion. Just remember: if tag governance breaks, so does ABAC.

In the next session, we integrate all of Week 2 (evaluation logic → Boundary → SCP → federation/ABAC) into one multi-account governance scenario for review.

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
