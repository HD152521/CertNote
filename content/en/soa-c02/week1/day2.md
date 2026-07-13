# Day 2 - IAM Operator's Manual: Users, Groups, Roles, Policy Evaluation Algorithm

S3 403, Lambda InvalidPermission, ECR pull denied, SSM SessionManager AccessDenied, RDS Connect Failed. These errors floating through the operator's Slack channel daily share one thing in common: they're all outcomes of IAM policy evaluation. For operators, IAM isn't a "permission system" so much as **"a decision engine that determines half of all incidents that happen every day."** It's the single component that decides who, what, where, and under which conditions can do things—and when it goes wrong, permissions become either too broad (data leaks, like Capital One) or too narrow (deployments block on Friday nights—very common).

Today we redraw IAM's four entities (User, Group, Role, Policy) from an operator's perspective, show exactly which order the policy evaluation algorithm follows to make decisions, and identify where to look when denial happens. This single algorithm diagram solves 70% of exam IAM questions.

## IAM's Four Entities: How Operators See the Difference

| Entity | Essence | Operator Use Case | Credential Lifetime |
|--------|---------|-------------------|----------------------|
| **User** | Permanent credentials (access key + password) | When a person or automation script needs direct login | Infinite (until manually rotated) |
| **Group** | User collection + policy attachment container | When grouping permissions by job, not individual | N/A |
| **Role** | Temporary credential issuer with temporary identity | Service-to-service calls, cross-account access, federation | STS temporary token (15 min–12 hours) |
| **Policy** | Permission definition as JSON document | Expression via Effect/Action/Resource/Condition | N/A |

From an operator's view, **Role** is used most. Users are issued only to individual humans (or replaced by IAM Identity Center), and everything between services—EC2, Lambda, ECS Task, cross-account trust—is handled by Roles. The reasons are clear.

1. **Role credentials are temporary tokens issued by STS (default 1 hour, max 12 hours)**—if leaked, they expire
2. **Roles appear in CloudTrail as `AssumedRole` events**, so you know exactly who used what permission when
3. **Roles don't require access key rotation drudgery**—users have access keys that operators must rotate manually
4. **Roles clearly limit "who can assume this role" via Trust Policy**

> 📚 **Case Study**: September 2022, Uber hacker incident. An 18-year-old hacker MFA-bombed an Uber employee (MFA fatigue attack), then convinced them via Slack DM claiming to be "IT" to approve an auth push. Once approved, the hacker got VPN access, stole **PAM (Privileged Access Management) admin credentials hardcoded in an internal PowerShell script**, and gained access to Uber's AWS, GCP, OneLogin, GSuite, and vSphere (screenshots leaked externally). If those PAM credentials had instead been an **IAM Role + STS temporary token + enforced MFA condition + IP CIDR restriction**, the breach footprint would've been far narrower. Operator lesson: **long-lived credentials are debt, not assets.** Another lesson: one credential accessing many systems means one system breach becomes total breach.

> 🔍 **Deeper Dive**: STS's `AssumeRole` issues temporary credentials as a **3-part set: AccessKeyId (starts with ASIA) + SecretAccessKey + SessionToken**. SessionToken is a signed token similar to a JWT; AWS API calls must include it in the `X-Amz-Security-Token` header. Expiration is baked into the token; clients can't extend it unilaterally (need to call AssumeRole again). If leaked, the token is useless after expiry. IAM User access keys (start with AKIA) are permanent—without explicit deactivation, they live 5 years, 10 years, forever. That's why GuardDuty flags ASIA-prefixed tokens used from anomalous IPs as `CredentialAccess:IAMUser/AnomalousBehavior`.

## Policy Evaluation Algorithm: The Single Diagram Explaining All Denials in Exams and Reality

The most common operator question: "Why was I denied?" IAM's policy evaluation algorithm decides in six steps. This flow solves 70% of exam questions.

```
[1] Is there an explicit Deny?  ─Yes─→  Deny (end)
        │ No
        ▼
[2] Is there an Allow in SCP (Service Control Policy)?  ─No─→  Deny (end)
        │ Yes
        ▼
[3] Is there an Allow in Resource-based Policy?  ─Yes─→ (conditional pass)
        │
        ▼
[4] Is there an Allow in Identity-based Policy?  ─No─→  Deny (unless [3] said Allow)
        │ Yes
        ▼
[5] If Permission Boundary exists, is it within bounds?  ─No─→  Deny
        │ Yes
        ▼
[6] If Session Policy exists (from STS AssumeRole), is it Allow?  ─No─→  Deny
        │ Yes
        ▼
   ALLOW ✅
```

Core principles:

- **Explicit Deny wins from anywhere**: One Deny from SCP, identity policy, resource policy, or boundary = final Deny
- **Implicit Deny ≠ explicit Deny**: Permissions not mentioned anywhere get implicitly denied, but other policies can override with Allow
- **Resource-based policy Allow can pass without identity policy**: S3 bucket policy granting Allow to another account lets users in that account access even if their IAM has no permission (within same account usually both required; exception: KMS requires both even within account)

> 💡 **Related Theory**: IAM policy evaluation is fundamentally a **deny-overrides ABAC (Attribute-Based Access Control)** model. Beyond simple RBAC matrices, it expresses conditional allowance via attributes like `aws:RequestTag/Env`, `aws:PrincipalTag/Department`, `aws:SourceIp`, `aws:MultiFactorAuthAge`, `aws:CurrentTime`. NIST SP 800-162 defines ABAC's standard model; IAM's Condition block implements it. That SCP evaluates as SCP > identity > resource > boundary > session enforces the principle "permissions are constrained by org policy." Academically, Sandhu et al. (1996, IEEE Computer) defined RBAC96; Hu et al. (2014, NIST SP 800-162) standardized ABAC.

> ⚠️ **Pitfall**: Exams often ask "An IAM user in account A wants to PUT to account B's S3 bucket object. What permissions are needed?" Answer: **both sides.** ① Caller account's user has `s3:PutObject` allowed ② Target bucket's Bucket Policy allows that user (or account) `s3:PutObject`. One alone = Deny. Add KMS encryption: ③ KMS key policy also needs `kms:GenerateDataKey`. Cross-account + KMS = all three policies must pass.

> 🔍 **Deeper Dive**: AWS uses **Zelkova**, an SMT (Satisfiability Modulo Theories) formal verification engine (Backes et al., 2018 CAV), for policy evaluation. Policies are transformed to first-order logic, then an SMT solver like Z3 asks "under which input combinations does this policy return Allow?" mathematically. Access Analyzer's ability to say "this S3 bucket is exposed to external accounts" comes from this engine—not simple regex matching but formal proof that "there exists an input combination where an external account gets Allow."

## Six Types of Policies: Where and Who Attaches Them

| Policy Type | Attached To | Creator | Operator View |
|-------------|-------------|---------|----------------|
| **Identity-based (Managed)** | User/Group/Role | AWS or customer | Most common standard |
| **Identity-based (Inline)** | User/Group/Role 1:1 | Customer | Single-use; deleted with principal |
| **Resource-based** | S3, Lambda, SNS, SQS, KMS, ECR, EFS, etc. | Resource owner | Essential for cross-account |
| **Permission Boundary** | User/Role | Delegated permissions admin | Limit max permissions for delegated Roles |
| **SCP** | AWS Organizations OU/Account | Org admin | Guardrail across all accounts |
| **Session Policy** | STS AssumeRole call inline | Caller | Narrow temp credentials issued |

Operators most often confuse **Permission Boundary and SCP**. Both set permission ceilings, but apply at different scopes.

- **SCP** applies org-wide to accounts/OUs—used by Organizations admin. SCP applies even to root (except management account)
- **Permission Boundary** applies to specific User/Role—a delegation guardrail. A user's effective permission = their policy ∩ boundary

Also: **SCP never creates Allow.** Even if SCP says `Allow *`, it's actually a whitelist saying "these permissions are possible in this OU." Real permission granting happens in identity or resource policy. Operator mistake: add Allow to SCP, assume "now permissions exist"—doesn't work. Must add to identity policy too.

> 🔍 **Deeper Dive**: Operator pattern: **delegate Role creation to developers while enforcing Permission Boundary.** Give developers `iam:CreateRole` but Condition on `iam:PutRolePermissionsBoundary` to force company standard boundary attachment. Then effective permissions on developer-created Roles = "their policy ∩ boundary," so even AdministratorAccess is limited by boundary. This is "delegation + guardrail" standard.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["iam:CreateRole", "iam:PutRolePolicy"],
    "Resource": "*",
    "Condition": {
      "StringEquals": {
        "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/DeveloperBoundary"
      }
    }
  }]
}
```

## IAM Debugging Patterns Operators Face Daily

S3 403 appears. Where to start? Operators follow this sequence:

```
[Step 1] Find failed call in CloudTrail
        - eventName: GetObject, PutObject, etc.
        - errorCode: AccessDenied
        - errorMessage: "User: arn:aws:sts::... is not authorized to perform..."
        - requestParameters shows bucket, key
        - userIdentity shows caller identity (User? AssumedRole? FederatedUser?)

[Step 2] Is caller an IAM User or AssumedRole?
        - User: check directly attached + group policies
        - Role: track via RoleSessionName who assumed it
        - sessionIssuer shows original Role ARN

[Step 3] Simulate with IAM Policy Simulator
        - Evaluate caller + Action + Resource
        - See which policy denied
        - Service Last Accessed shows "was this permission actually used?"

[Step 4] Verify cross-account exposure with Access Analyzer
        - Check unintended external leaks
        - Policy Validation for syntax and security

[Step 5] Last resort: read CloudTrail event errorMessage detail line-by-line
        - Since 2023, AWS explicitly names "which policy denied"
```

> 📚 **Case Study**: Running EC2 suddenly 403s on S3 PutObject. Operator checks CloudTrail; caller is `AssumedRole/EC2-S3Role/i-0abc...`. Identity policy shows `s3:PutObject Allow`. Bucket Policy: Allow. SCP: pass. Still denied. **Reason: bucket has SSE-KMS encryption, and that KMS key's Key Policy lacks the EC2 Role.** S3 PUT with KMS encryption needs `kms:GenerateDataKey`, required in both Key Policy AND IAM Policy (KMS needs both even same-account). Operator's easy trap: check IAM only and get confused. Plus KMS deny events log separately in CloudTrail, so you must check both trails.

> ⚠️ **Pitfall**: `AccessDenied` errorCode doesn't always mean IAM. S3 bucket BlockPublicAccess on blocks public policies before 403. SCP Deny blocks even IAM Allow. RAM shared resource with owner-side permission change = Deny. Find denial source precisely—read CloudTrail `errorMessage` verbatim.

## STS's Three Core APIs

APIs operators must know:

| API | Purpose | Operator View |
|-----|---------|----------------|
| `AssumeRole` | Assume Role in same/different account | Cross-account access, EC2/Lambda Roles |
| `AssumeRoleWithSAML` | Assume from SAML 2.0 IdP | AD FS, Okta SAML federation |
| `AssumeRoleWithWebIdentity` | Assume from OIDC IdP | Cognito, GitHub Actions OIDC, EKS IRSA |

GitHub Actions deployment to AWS used to mean hardcoding access keys in Secrets, but **OIDC federation** eliminates access keys entirely. GitHub issues an OIDC token; AWS STS verifies it and issues temp credentials. This became GitHub Actions standard in 2022; 2023 re:Invent made it AWS official recommendation.

```yaml
# GitHub Actions OIDC example
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsDeploy
    aws-region: ap-northeast-2
    role-session-name: ${{ github.actor }}-${{ github.run_id }}
```

IAM Role's Trust Policy must narrow to GitHub repo and branch:

```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
    }
  }
}
```

> 🔍 **Deeper Dive**: EKS IRSA (IAM Roles for Service Accounts) is the same mechanism. EKS cluster acts as OIDC provider; Kubernetes ServiceAccount maps to an IAM Role that Pods assume. Pods read OIDC JWT from token mount path (`/var/run/secrets/eks.amazonaws.com/serviceaccount/token`) and call `AssumeRoleWithWebIdentity` for credentials. AWS SDK handles auto (`webIdentityTokenFile` env var). Since 2023, **Pod Identity** offers a simpler path—instead of OIDC, EKS Pod Identity Agent provides an IMDS-like interface for credentials. IRSA is cluster-OIDC federation; Pod Identity is EKS native—both coexist.

## Ten IAM Best Practices Operators Must Know

1. **Root account never for daily use**: MFA mandatory, delete access keys, use only for billing/account closure 1–2x/year
2. **MFA required for all IAM Users**: Enforce with Condition `aws:MultiFactorAuthPresent: true` in policy
3. **Humans use IAM Identity Center, machines use IAM Role**: Direct User creation is last resort
4. **Rotate Access Keys every 90 days**: Check with Credential Report, Config rule `access-keys-rotated`
5. **Least privilege principle**: AdministratorAccess emergencies only; normal ops: job-specific. Identify unused via IAM Access Advisor "Service Last Accessed"
6. **Delegate with Permission Boundary**: Limit max for developer-created Roles
7. **CloudTrail all regions + enable Log File Validation**: Detect tampering
8. **Auto-detect external exposure with Access Analyzer**: Enable org-wide
9. **Deactivate unused credentials after 90 days** (use Last Accessed data)
10. **Enforce STS Region Endpoint**: Use `aws:UseRegion` Condition to block forced us-east-1 calls. SDK: `AWS_STS_REGIONAL_ENDPOINTS=regional`

> ⚠️ **Pitfall**: "Store IAM User access key in Secrets Manager = safe." False. Secrets Manager can rotate keys (Lambda rotation), but key leaks remain valid until rotation runs. **The existence of a long-lived credential is itself an attack surface.** Solution: don't create access keys—use Role + STS instead. Since 2024, AWS warns in console when creating IAM User access keys; IAM Identity Center became de facto standard.

> 💡 **Related Theory**: Distributed permission evaluation debugging complexity is the **policy explosion** problem. Post-Sandhu et al. (1996, IEEE Computer) RBAC96, ABAC and ReBAC (Relationship-Based, Zanzibar) emerged, but any model eventually hits policy explosion—tracking evaluation results becomes exponentially harder as policies pile up. AWS built Access Analyzer (Zelkova engine) to solve it. Google handled it with Zanzibar (2019 USENIX ATC); Microsoft Azure uses RBAC + ABAC conditional expressions.

## Wrapping Up

The policy evaluation algorithm summarized today solves 70% of SOA-C02 IAM questions. The core is simple:

- **Deny wins** (from anywhere)
- **Allow must exist** (from identity or resource policy somewhere)
- **Cross-account = both sides Allow**
- **Boundary and SCP are ceilings—they don't create Allow**
- **STS is temporary credentials—no permanent access key rotation drudgery**

Tomorrow we go deeper with tools operators live with daily—Identity Center federation, ABAC patterns, permission debugging.

---

## 📝 연습 문제

**문제 1.** An IAM user in account A wants to PutObject to account B's S3 bucket. What permission setup is required?

A) Only account A user's identity policy with `s3:PutObject` Allow
B) Only account B bucket's Bucket Policy with account A user Allow
C) Both—account A user identity policy Allow + account B bucket policy Allow
D) Create an IAM Role in account A and AssumeRole from account B

**정답: C**
해설: Cross-account access requires Allow from both sides: caller's identity policy AND target's resource policy. One alone = Deny. Same account usually needs only one, but KMS key policy needs both even same-account. For SSE-KMS buckets, also add `kms:GenerateDataKey` to KMS key policy.

---

**문제 2.** An operator wants to delegate IAM Role creation to developers while limiting maximum permissions those Roles can have. What's the best tool?

A) SCP
B) Permission Boundary
C) Session Policy
D) Inline Policy

**정답: B**
해설: Permission Boundary is a per-user/role permission ceiling. SCP is account/OU-level—bigger scope. Operator delegates `iam:CreateRole` with `iam:PermissionsBoundary` Condition forcing standard boundary attachment; developer-created Role effective permission = their policy ∩ boundary. Session Policy only applies to STS-issued temp credentials.

---

**문제 3.** An EC2 instance's IAM Role has `s3:PutObject Allow`, but PUT to KMS-encrypted bucket throws AccessDenied. Most likely cause?

A) Bucket policy lacks PutObject
B) KMS key policy lacks EC2 Role's `kms:GenerateDataKey`
C) EC2 IMDSv2 is disabled
D) S3 SSE algorithm is misconfigured

**정답: B**
해설: Putting KMS-encrypted objects requires `kms:GenerateDataKey`; GETting requires `kms:Decrypt`. Both must be in IAM Policy AND KMS Key Policy. IAM might pass, but Key Policy denial still blocks. Operator's common trap. KMS deny events log separately in CloudTrail—check that trail too.

---

**문제 4.** An operator wants GitHub Actions deployments to AWS using OIDC federation instead of hardcoded access keys. Which STS API is used?

A) AssumeRole
B) AssumeRoleWithSAML
C) AssumeRoleWithWebIdentity
D) GetSessionToken

**정답: C**
해설: GitHub Actions is an OIDC IdP, so `AssumeRoleWithWebIdentity` is called. AWS STS verifies GitHub's OIDC token and issues temp credentials. AssumeRoleWithSAML is for AD FS/Okta; AssumeRole is IAM credential–based. Trust Policy specifies GitHub OIDC provider ARN and repo/branch sub claim.

---

**문제 5.** Why does explicit Deny from anywhere always result in final Deny in IAM policy evaluation?

A) Because evaluation follows deny-overrides ABAC model
B) Because Deny only comes from SCP
C) Because Permission Boundary auto-prioritizes Deny
D) Because IAM is RBAC

**정답: A**
해설: IAM evaluation is deny-overrides ABAC. Any layer (SCP, identity, resource, boundary, session) returning explicit Deny = final Deny. This principle guarantees safety in permission design.

---

**문제 6.** An operator wants to retrieve IAM Role credentials via SDK on an EC2 instance. Where do they come from?

A) /etc/aws/credentials file
B) IMDS (`http://169.254.169.254/latest/meta-data/iam/security-credentials/`)
C) Environment variable AWS_ACCESS_KEY_ID
D) STS GetSessionToken API

**정답: B**
해설: Temp credentials for an IAM Role attached to EC2 instance profile come from IMDS. AWS SDK automatically polls IMDS and refreshes credentials (default refresh 6 hours before expiry). IMDSv2 requires PUT for session token first. Credentials are STS-issued but from EC2's perspective IMDS is standard.
