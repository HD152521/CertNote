# Day 4 - STS and Temporary Credentials: AssumeRole, Federation, Role Chaining, Confused Deputy Prevention

For the past four days, we've repeated "use Role and its temporary credentials, not IAM User's long-term access key." Today we dive into **how** that Role is "assumed" — the mechanism of STS (Security Token Service) that issues credentials, how external identities (federation) exchange for AWS credentials, and why cross-account delegation demands blocking the Confused Deputy attack. The deepest differentiation in SCS-C03's Domain 4 lies here — AssumeRole trust relationships, role chaining constraints, and mandatory Confused Deputy prevention.

Core one-liner first: **STS issues expiring temporary credentials (AccessKeyId + SecretAccessKey + SessionToken), and "who can assume this role" is decided by the role's trust policy.**

## What STS Issues: Three Types of Temporary Credentials

Long-term IAM User credentials are 2 keys (AccessKeyId, SecretAccessKey), but STS temporary credentials are **3**.

| Component | Role |
|------|------|
| AccessKeyId | Identifier |
| SecretAccessKey | Signing key |
| **SessionToken** | Temporary session proof (doesn't exist in long-term keys) |

These credentials have an **expiration time**. AssumeRole defaults to 1 hour, maximum 12 hours (within role's `MaxSessionDuration`). After expiration, you must get new ones. **Even if exposed, damage is time-limited** — the fundamental reason temporary credentials are safer than long-term keys.

Key STS APIs:

| API | Purpose |
|-----|------|
| `AssumeRole` | Assume an IAM Role in same/different account (most common) |
| `AssumeRoleWithSAML` | SAML 2.0 IdP federation (e.g., AD FS, Okta) |
| `AssumeRoleWithWebIdentity` | OIDC federation (e.g., Cognito, Google, GitHub Actions) |
| `GetSessionToken` | MFA-applied temporary credentials (IAM User) |
| `GetFederationToken` | Legacy federation |

> 💡 **Related Theory**: EC2 instance profiles, Lambda execution roles, ECS task roles all internally use STS AssumeRole. For EC2, the instance metadata service (IMDS) auto-issues and refreshes temporary credentials. No need to embed keys in code. **IMDSv2 (token-based)** must be enforced to block SSRF attacks that steal metadata — a classic exam topic and was central to the Capital One incident.

## AssumeRole: Two Axes of Trust and Permission Policies

A Role holds **two policies**. This distinction is the most confusing in IAM.

- **Trust policy**: "**Who** can assume this role" (`sts:AssumeRole` permissible targets). Contains Principal = resource-based policy.
- **Permission policy**: "**What** this role can do once assumed." Identity-based policy.

```json
// Trust policy: principals in account 111122223333 can assume this role
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::111122223333:root"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"sts:ExternalId": "unique-secret-2026"},
      "Bool": {"aws:MultiFactorAuthPresent": "true"}
    }
  }]
}
```

Cross-account AssumeRole succeeds only when **both align**:

1. **Target role's trust policy** permits the calling account/principal as Principal
2. **Calling side's identity policy** has `sts:AssumeRole` Allow (target role ARN specified)

> ⚠️ **Trap**: Using `"arn:aws:iam::111122223333:root"` in trust policy Principal means "**entire account 111122223333** can assume this role" — not just the root user. However, practically, only principals in that account holding `sts:AssumeRole` permission can assume it (condition 2). The intuition "root Principal is risky" is half right — account delegation is normal, but internal permission control is that account's responsibility.

## Federation: Converting External Identity to AWS Credentials

Without creating IAM Users, accessing AWS via corporate directory (AD) or social/OIDC identity is federation.

### SAML 2.0 Federation (Enterprise Workforce)

```
[ SAML Federation Flow ]

  User → Enterprise IdP(AD FS/Okta) login
       → IdP issues SAML assertion(role ARN included)
       → AWS STS AssumeRoleWithSAML
       → Temporary credentials issued
       → Access AWS resources
```

Today's recommended approach: **IAM Identity Center (formerly AWS SSO)**. Define permission sets in multi-account environments, integrate with external IdPs (Okta, Entra ID, etc.), and users get temporary credentials across multiple accounts and roles via single login. Eliminates the anti-pattern of creating IAM Users per account.

### OIDC / Web Identity Federation (Apps·CI/CD)

Mobile apps (Cognito), GitHub Actions, Kubernetes (EKS IRSA) use OIDC for `AssumeRoleWithWebIdentity`. Particularly **GitHub Actions OIDC** matters in both exam and practice — instead of embedding long-lived access key in GitHub secrets, GitHub's OIDC token assumes a role, eliminating key exposure risk.

> 🔍 **Deep Dive**: GitHub Actions OIDC trust policy sets `token.actions.githubusercontent.com` as OIDC provider, and Condition limits with `token.actions.githubusercontent.com:sub` to **specific repo·branch only**. Loose conditions like `repo:org/*` let any org repo assume the role — risky. Tighten to `repo:org/repo:ref:refs/heads/main`. EKS IRSA uses the same OIDC principle, mapping pods to roles.

## Role Chaining (Role Chaining) and Constraints

**Assuming another role while already in one role** is role chaining. Account A → assume role X → assume role Y with role X credentials.

Two key constraints in exams:

1. **Chained session max time is fixed at 1 hour**. Even if role X's `MaxSessionDuration` is 12 hours, a chained session tops at 1 hour.
2. Chained sessions can't invoke certain calls like `GetSessionToken`.

> 💡 **Related Theory**: Role chaining obscures permission tracking and is generally avoided. Prefer **session policy** or direct AssumeRole. However, "hub account role → spoke account access" pattern in cross-account is legitimate chaining. Traceability is supplemented by CloudTrail's `assumedRole` session name (set `sts:RoleSessionName` meaningfully).

## Confused Deputy Prevention: ExternalId and aws:SourceArn

Today's security core. **Confused Deputy (confused intermediary)** is when an authorized principal (intermediary) is tricked into using permissions on behalf of a third party.

### Scenario: Third-party SaaS Cross-Account Access

Say monitoring SaaS (e.g., Datadog) AssumeRoles into your account. SaaS uses the **same SaaS account** for all customers. If trust policy only checks "SaaS account, allow," a malicious user could impersonate your account ID to SaaS and gain your resources.

Solution: **ExternalId** — SaaS issues you a unique secret that you embed in the trust policy's Condition.

```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "arn:aws:iam::SAAS-ACCOUNT-ID:root"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"sts:ExternalId": "your-unique-external-id-xyz"}
  }
}
```

SaaS passes this ExternalId when assuming your role; customers' ExternalIds won't work. Isolation is guaranteed.

### When AWS Service is the Intermediary: aws:SourceArn / aws:SourceAccount

When a service principal (e.g., CloudWatch, S3, SNS) uses your role or resource, the same attack is possible. Use `aws:SourceArn` (or `aws:SourceAccount`) to enforce "only this specific resource triggers this."

```json
{
  "Effect": "Allow",
  "Principal": {"Service": "sns.amazonaws.com"},
  "Action": "sts:AssumeRole",
  "Condition": {
    "StringEquals": {"aws:SourceAccount": "111122223333"},
    "ArnLike": {"aws:SourceArn": "arn:aws:sns:us-east-1:111122223333:my-topic"}
  }
}
```

> 🎯 **Scenario**: "Third-party backup vendor needs cross-account S3 access." Answer pattern: ① never give vendor IAM User access keys (absolute ban) ② create IAM Role + trust policy with vendor account + **ExternalId** ③ permission policy restricted to needed buckets/Actions (least privilege). Without ExternalId, another vendor customer using the same vendor could access our resources — Confused Deputy hole. This pattern applies uniformly to Datadog, New Relic, PagerDuty, all third-party integrations.

> ⚠️ **Trap**: ExternalId isn't a "password" — even if guessable, it blocks the attack. The key is **customer doesn't set ExternalId; vendor issues it**. Customer-set IDs could collide with others or be predictable, breaking isolation. Trap answer: "Customer freely sets ExternalId" — wrong.

## AssumeRole as CLI

```bash
# Assume role — returns 3 credential types
aws sts assume-role \
  --role-arn arn:aws:iam::444455556666:role/CrossAccountReadRole \
  --role-session-name security-audit-2026 \
  --external-id your-unique-external-id-xyz \
  --duration-seconds 3600

# Use returned credentials for subsequent calls (after env vars set)
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...   # SessionToken mandatory for temp credentials
aws sts get-caller-identity    # Verify who you are now
```

> 📚 **Case Study**: The 2019 Capital One incident's essence: ① WAF (SSRF defense insufficient) ② **IMDSv1 let EC2 temp credentials be stolen** ③ those credentials accessed S3. Temporary credentials are safe, but **the path to steal them (SSRF → IMDS)** being open neutralizes that. Hence IMDSv2 enforcement + least-privilege instance role + WAF bundle in exam. Temporary credentials are "exposure damage is time-limited," but blocking exposure paths is separate.

## Summary — Temporary Credentials Are Security Default

Three essentials today. First, **STS issues expiring temporary credentials (with SessionToken)**, and EC2/Lambda/ECS/federation all run on this — replace long-key code/CI anti-patterns with OIDC and instance roles. Second, AssumeRole is **two axes: trust policy (who) and permission policy (what)** — cross-account needs both sides allowing. Third, cross-account delegation **must block Confused Deputy via ExternalId (third-party) or aws:SourceArn (AWS service)**.

Tomorrow closes Week 1 with integrated scenarios. "Why is access denied despite having permissions," "safely delegate to third parties," "convert long-term keys to temporary credentials" — real-world problems synthesizing everything Week 1 taught. We cement this week's IAM thinking framework.

---

## 📝 연습 문제

**문제 1.** STS 임시 자격 증명이 장기 IAM User access key보다 보안상 우수한 가장 본질적인 이유는?

A) 더 긴 무작위 문자열이라 추측이 불가능하기 때문  
B) 만료 시간이 있어 노출되더라도 피해가 시간적으로 제한되기 때문  
C) 암호화되어 전송되기 때문  
D) root 계정에서만 발급할 수 있기 때문  

**정답: B**  
해설: 임시 자격 증명은 만료 시간(AssumeRole 기본 1시간, 최대 12시간)이 있어, 탈취되더라도 유효 기간 이후에는 무력화되므로 노출 피해가 시간적으로 한정된다. 길이나 전송 암호화는 장기 키와 본질적 차이가 아니고, 임시 자격 증명은 root 전용이 아니라 역할을 맡는 모든 주체가 받는다.

---

**문제 2.** 서드파티 모니터링 SaaS가 여러 고객의 AWS 계정에 동일한 SaaS 계정으로 AssumeRole 접근한다. 한 고객의 역할을 다른 고객이 SaaS를 통해 맡지 못하게 격리하는 핵심 메커니즘은?

A) trust policy의 Principal을 root로 지정  
B) trust policy의 Condition에 서드파티가 고객별로 발급한 `sts:ExternalId`를 명시  
C) 고객이 임의로 정한 ExternalId를 trust policy에 넣음  
D) SaaS에 IAM User access key를 발급해 전달  

**정답: B**  
해설: ExternalId는 서드파티가 고객마다 고유하게 발급한 값을 trust policy 조건에 박아 Confused Deputy 공격을 막는다. 고객이 임의로 정하면 충돌·예측으로 격리가 깨질 수 있어 발급 주체는 서드파티여야 하고, root Principal 지정만으로는 고객 간 격리가 되지 않으며, access key 발급은 장기 자격 증명 노출이라는 더 큰 위험을 만든다.

---

**문제 3.** 역할 체이닝(한 역할을 맡은 상태에서 또 다른 역할을 맡음)에 대한 설명으로 옳은 것은?

A) 체이닝된 세션은 원본 역할의 MaxSessionDuration을 그대로 따라 최대 12시간까지 가능하다  
B) 체이닝 시 세션 최대 시간은 1시간으로 제한된다  
C) 체이닝은 권한 추적을 단순화하므로 항상 권장된다  
D) 체이닝에는 trust policy가 필요 없다  

**정답: B**  
해설: 역할 체이닝으로 발급되는 세션의 최대 시간은 1시간으로 고정되며, 원본 역할의 긴 MaxSessionDuration이 적용되지 않는다. 체이닝은 오히려 권한 추적을 흐리므로 가급적 피하는 것이 권장되고, 모든 AssumeRole과 마찬가지로 대상 역할의 trust policy 허용이 반드시 필요하다.

---

**문제 4.** GitHub Actions가 장기 access key 없이 AWS 역할을 맡도록 구성할 때, 보안상 가장 중요한 trust policy 설정은?

A) `sub` 조건을 `repo:org/*`로 두어 조직의 모든 repo가 역할을 맡게 한다  
B) `sub` 조건을 `repo:org/repo:ref:refs/heads/main`처럼 특정 repo·브랜치로 좁힌다  
C) Principal을 `*`로 설정해 어떤 OIDC 토큰이든 허용한다  
D) trust policy 없이 permission policy만 넓게 설정한다  

**정답: B**  
해설: OIDC 페더레이션에서 `token.actions.githubusercontent.com:sub` 조건을 특정 repo와 브랜치로 좁혀야, 그 워크플로만 역할을 맡을 수 있어 안전하다. `repo:org/*`나 Principal `*`는 조직의 임의 repo·토큰이 역할을 탈취할 통로를 열고, trust policy 없이 권한만 넓히는 것은 누구나 역할을 맡을 수 있게 만든다.

---

**문제 5.** EC2 인스턴스에 부여된 임시 자격 증명이 SSRF 공격으로 탈취된 사고를 예방하기 위해 가장 직접적으로 적용해야 할 통제는?

A) EC2 인스턴스 역할에 AdministratorAccess를 부여해 운영을 단순화한다  
B) IMDSv2(토큰 기반 메타데이터 서비스)를 강제하고 인스턴스 역할에 최소 권한을 적용한다  
C) EC2에 장기 IAM User access key를 직접 저장한다  
D) 임시 자격 증명의 만료 시간을 12시간으로 늘린다  

**정답: B**  
해설: IMDSv2는 세션 토큰을 요구해 SSRF를 통한 메타데이터·임시 자격 증명 탈취를 크게 어렵게 만들고, 인스턴스 역할 최소 권한은 탈취되더라도 피해 범위를 줄인다. admin 부여는 폭발 반경을 키우고, 장기 키 저장은 더 위험하며, 만료 시간을 늘리면 탈취 자격 증명의 유효 기간만 길어져 오히려 위험이 커진다.

---
