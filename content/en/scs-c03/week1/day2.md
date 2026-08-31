# Day 2 - IAM Core: Users, Groups, Roles, Policies, and Policy Evaluation Flow

IAM is the spine of AWS security. Wherever you go in the 6 domains we saw yesterday, you eventually reduce to one question: "Can this principal do this action on this resource?" KMS decryption, S3 GetObject, cross-account deployment — all use the same IAM evaluation engine to decide. That's why IAM must be approached not as "memorizing policy JSON" but as **understanding the evaluation algorithm** to solve SCS-C03's subtle scenarios.

Today we go through the four building blocks of IAM (users, groups, roles, policies) and step-by-step how AWS decides Allow/Deny when a request arrives. Let me throw ahead the key one-liner: **"Explicit Deny defeats everything else. After that, explicit Allow beats the default. With neither, implicit Deny applies."**

## IAM Building Blocks: Users, Groups, Roles, Policies

| Element | Definition | Credentials | Core Use |
|------|------|----------|----------|
| **User** | Permanent identity, corresponds to one person or app | Long-term access key, password | Avoid when possible (key exposure risk) |
| **Group** | Collection of users, container for attaching policies | None (no credentials) | Grant policies to users in bulk |
| **Role** | Identity anyone can temporarily "assume" | STS temporary credentials (expiring) | EC2/Lambda, cross-account, federation |
| **Policy** | JSON document describing permissions | N/A | Attached to above elements to define permissions |

Here's the insight the exam repeatedly targets: **Long-term credentials (IAM User access key) should be avoided; use Role's temporary credentials instead.** When an EC2 needs S3 access, don't put User access keys in the instance — use an **instance profile (IAM Role)**. When Lambda accesses DynamoDB, use its **execution role**. Even people should prefer **IAM Identity Center (SSO)** over IAM User, receiving temporary credentials after login.

> 💡 **Related Theory**: A Group is just a "container" and has no credentials itself, so **you can't designate a Group as a Principal.** Common mistake for newcomers — writing `"Principal": {"AWS": "arn:...:group/Devs"}` in a Role's trust policy won't work. Groups are just channels to deliver policies to users; they can't be AssumeRole targets.

> 🔍 **Deep Dive**: What "assuming" a Role means is that STS (Security Token Service) issues temporary credentials of 3 types: AccessKeyId, SecretAccessKey, **SessionToken**. These credentials have an expiration time (1 hour default, 12 hours max), so even if exposed, the damage is time-limited. This fundamental time-limit is why temporary creds are safer than long-term keys, covered deeply on Day 4.

## Two Types of Policies: Identity-based vs Resource-based

Policies split into two types by "where they're attached." Today we just grasp the concept; Day 3 digs deeper.

- **Identity-based policy**: Attached to User, Group, Role. Describes "what this principal can do." No Principal element (who it attaches to is the principal itself).
- **Resource-based policy**: Attached directly to resources (S3 buckets, KMS keys, SQS queues, etc.). **Principal element is required** — describes "who can access this resource."

The decisive utility of resource-based policies is **enabling cross-account access**. To let another account's principal access my S3 bucket, I specify that account in the bucket's resource-based policy.

## IAM Policy JSON Structure

Every policy is an array of Statements; each Statement has these elements:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadSpecificBucket",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::my-secure-bucket",
        "arn:aws:s3:::my-secure-bucket/*"
      ],
      "Condition": {
        "Bool": {"aws:SecureTransport": "true"}
      }
    }
  ]
}
```

- **Effect**: `Allow` or `Deny`
- **Action**: API action to allow/deny (`s3:GetObject`). Wildcards (`s3:*`) allowed
- **Resource**: Target ARN. Required in identity-based, usually `*` in resource-based (policy already on that resource)
- **Principal**: Who (resource-based and trust policy only)
- **Condition**: Additional constraints (IP, MFA, time, encryption, etc.)

> ⚠️ **Trap**: Using `"Resource": "*"` and `"Action": "*"` together is basically admin. When the exam asks "least privilege," the answer is the option with narrowed wildcards. Specifically, `s3:ListBucket` applies to bucket ARN (`arn:aws:s3:::bucket`), while `s3:GetObject` applies to object ARN (`.../*`) — mixing these ARN levels is a common mistake.

## Policy Evaluation Flow: The Algorithm That Decides Allow/Deny

This is today's core. When a request arrives in a single account, AWS's decision sequence is:

```
[ IAM Policy Evaluation Flow (Single Account) ]

  Request(Principal + Action + Resource + Context)
        |
   1. Collect all applicable policies
      (Identity-based, Resource-based, SCP, Permissions Boundary, Session policy)
        |
   2. Any explicit Deny?                   ── Yes ──▶  DENY (absolute priority)
        | No
   3. Does SCP allow the Action?           ── No ──▶ DENY
        | Yes
   4. Does Permissions Boundary allow?     ── No ──▶ DENY
        | Yes
   5. Any explicit Allow?                  ── No ──▶ DENY (implicit)
        | Yes
        ▼
      ALLOW
```

Compressed to three principles:

1. **Default is implicit Deny**: With no policies allowing, access is denied. Permissions must be granted explicitly.
2. **Explicit Allow overrides implicit Deny**: Somewhere explicitly allowing reverses the default denial.
3. **Explicit Deny overrides everything (explicit deny overrides)**: No matter what allows it, if any policy explicitly Denies, it's denied.

> 💡 **Related Theory**: When memorizing this order, the key is **"Guardrails (SCP, Permissions Boundary) don't grant permissions; they only draw upper limits."** Even if SCP allows `s3:*`, that alone doesn't create any actual permissions — there must be explicit Allow in an identity-based policy. SCP defines "maximum allowed range." That's why SCP patterns commonly use Deny guardrails rather than Allow.

> 🔍 **Deep Dive**: For cross-account, evaluation happens **separately in each account**. For a principal in account A to access a resource in account B, ① A's identity-based policy must Allow AND ② B's resource-based policy must Allow A — **both required**. Within the same account, either one is enough. This "both needed" rule is a common trap in cross-account scenarios.

## Evaluation Flow Read as Scenarios

Let's apply the abstract algorithm to concrete situations.

**Situation 1: Developer has admin permissions but we want to block only one specific S3 bucket.**
Identity-based policy is `AdministratorAccess` allowing everything. Add an explicit Deny statement (e.g., specific bucket ARN with `"Effect": "Deny"`) and the Deny beats the Allow for just that bucket. Adding the same Deny to SCP enforces it account-wide.

```json
{
  "Effect": "Deny",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::sensitive-prod-bucket",
    "arn:aws:s3:::sensitive-prod-bucket/*"
  ]
}
```

**Situation 2: SCP explicitly Denies `ec2:*`, but a user has `AmazonEC2FullAccess`.**
Result is Deny. SCP's explicit Deny overrides everything. The user's Allow becomes powerless. This is why SCP is used as a governance guardrail.

> 🎯 **Scenario**: "Security team wants to prevent anyone (including admin, root) from disabling CloudTrail across all member accounts." Answer isn't editing user policies individually — it's **SCP with Deny on `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` applied to the OU**. Then even that account's admin or root can't disable CloudTrail (management account root is SCP-exempt). This applies the principle that explicit Deny beats all Allow.

## Policy Debugging Tools: Verifying Who Can Do What

Tracing evaluation logic mentally causes mistakes. AWS provides validation tools.

```bash
# IAM Policy Simulator: Check if a principal can do an action
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:user/alice \
  --action-names s3:GetObject s3:DeleteObject \
  --resource-arns arn:aws:s3:::my-bucket/secret.txt

# Find out who the current caller is (start of role debugging)
aws sts get-caller-identity

# List policies attached to a user
aws iam list-attached-user-policies --user-name alice
aws iam list-user-policies --user-name alice  # inline policies
```

> 📚 **Case Study**: 80% of "why is access denied" in production comes down to ① implicit Deny (no one Allow'd) ② hidden Deny in SCP ③ exceeding Permissions Boundary ④ cross-account with only one side allowing. Developing the habit of first running `aws sts get-caller-identity` to confirm "what role am I under right now" cuts debugging time in half. CloudTrail's `AccessDenied` events leave clues about which policy denied it.

## IAM Access Analyzer: Detecting Unintended External Exposure

IAM Access Analyzer analyzes resource policies to automatically find **resources allowing access beyond account or organization boundaries**. S3 buckets, IAM roles, KMS keys, Lambda functions — if opened to external principals, it creates findings.

This is the intersection of Domain 2 (detective) and Domain 4 (IAM). You can't manually review hundreds of buckets and roles, so it automatically detects "access crossing trust boundaries." Its policy generation feature even creates least-privilege policies from CloudTrail logs of actual use.

> 💡 **Related Theory**: Access Analyzer's core is **external vs trusted** distinction. Access within the same account or organization is treated as normal; only crossing that boundary creates findings. "Set organization boundary as zone of trust" treats cross-account within organization as normal and catches only real external exposure.

## Summary — IAM is an Algorithm

Three essentials from today. First, among IAM building blocks, **use Role (temporary credentials) by default; avoid User (long-term keys)** — this is the starting point of all best practices. Second, policy evaluation is **implicit Deny → explicit Allow overrides it → explicit Deny beats everything** — the algorithm of 3 principles — and SCP·Permissions Boundary don't grant permissions, only draw upper limits. Third, cross-account requires **both accounts to allow**.

Tomorrow we dig deeper into policies. The subtle interplay between Identity vs Resource policies, precision controls using Condition keys, and practical patterns for designing least privilege with Permissions Boundary. The evaluation algorithm you learned today is the foundation for all of it.

---

## 📝 Practice Questions

**Question 1.** 한 IAM 사용자가 `AdministratorAccess` 관리형 정책을 가지고 있다. 동시에 그 사용자가 속한 계정의 SCP에 `s3:*`에 대한 명시적 `Deny`가 있다. 이 사용자가 S3 객체를 읽으려 하면?

A) AdministratorAccess가 우선하므로 허용된다  
B) SCP의 명시적 Deny가 모든 Allow를 이기므로 거부된다  
C) 두 정책이 충돌하므로 평가 오류가 발생한다  
D) root 사용자만 S3에 접근할 수 있다  

**Answer: B**  
Explanation: 정책 평가의 절대 원칙은 명시적 Deny가 어떤 Allow보다 우선한다는 것이다. SCP는 가드레일로서 해당 Action의 상한을 차단하므로, 사용자 정책에 admin 권한이 있어도 SCP의 Deny에 막혀 거부된다. 평가 충돌로 오류가 나는 것이 아니라 결정론적으로 Deny가 이기며, root 접근 여부는 이 판단과 무관하다.

---

**Question 2.** 계정 A의 IAM 역할이 계정 B의 S3 버킷에 객체를 쓰려고 한다. 접근이 성공하려면 반드시 충족돼야 하는 조건은?

A) 계정 A의 신원 기반 정책에만 Allow가 있으면 충분하다  
B) 계정 B의 버킷 정책에만 Allow가 있으면 충분하다  
C) 계정 A의 신원 기반 정책과 계정 B의 버킷 정책 양쪽 모두 Allow가 있어야 한다  
D) 두 계정이 같은 Organization에 속하면 정책 없이 자동 허용된다  

**Answer: C**  
Explanation: cross-account 접근은 양쪽 계정에서 각각 평가가 일어나므로, 호출 측(A)의 신원 기반 정책 Allow와 리소스 측(B)의 리소스 기반 정책 Allow가 모두 필요하다. 같은 계정 내에서는 둘 중 하나만 있어도 되지만 계정 경계를 넘으면 둘 다 필수다. 같은 Organization이라는 사실만으로 자동 허용되지 않는다.

---

**Question 3.** IAM Group에 대한 설명으로 옳은 것은?

A) Group은 자체 자격 증명을 가지며 직접 로그인할 수 있다  
B) Role의 trust policy에서 Group을 Principal로 지정할 수 있다  
C) Group은 자격 증명이 없는 정책 부착용 컨테이너이며 Principal이 될 수 없다  
D) Group에 임시 자격 증명을 발급해 cross-account 접근에 사용한다  

**Answer: C**  
Explanation: Group은 사용자에게 정책을 일괄 부여하기 위한 컨테이너일 뿐 자격 증명이 없고, 따라서 로그인하거나 Principal로 지정될 수 없다. AssumeRole의 대상이나 trust policy의 Principal로 Group을 쓰면 동작하지 않는다. 임시 자격 증명은 Role을 통해 STS가 발급하며 Group과는 무관하다.

---

**Question 4.** 한 개발자에게 `AmazonS3FullAccess`가 부여돼 있지만, 어떤 정책도 명시적으로 허용하지 않은 `dynamodb:GetItem`을 호출하려 한다. 결과와 그 이유로 옳은 것은?

A) 허용 — 명시적 Deny가 없으므로 기본적으로 허용된다  
B) 거부 — 어떤 정책도 해당 Action을 Allow하지 않아 암묵적 Deny가 적용된다  
C) 허용 — S3 권한이 있으면 DynamoDB도 자동으로 허용된다  
D) 거부 — DynamoDB는 IAM으로 통제되지 않기 때문이다  

**Answer: B**  
Explanation: IAM의 기본 상태는 암묵적 Deny이며 권한은 명시적으로 부여돼야 한다. S3 권한은 DynamoDB Action과 무관하므로, `dynamodb:GetItem`을 허용하는 명시적 Allow가 없으면 암묵적 Deny로 거부된다. 명시적 Deny가 없다고 자동 허용되는 것은 아니며, DynamoDB도 당연히 IAM으로 통제된다.

---

**Question 5.** 보안팀이 모든 멤버 계정에서 누구도(admin·root 포함) CloudTrail을 비활성화하지 못하게 강제하려 한다. 가장 적절한 방법은?

A) 각 계정의 모든 IAM 사용자 정책에 CloudTrail Deny를 일일이 추가한다  
B) SCP에 `cloudtrail:StopLogging`과 `cloudtrail:DeleteTrail`에 대한 Deny를 작성해 OU에 적용한다  
C) CloudTrail에 리소스 기반 정책으로 Deny를 설정한다  
D) GuardDuty로 CloudTrail 비활성화를 탐지해 알림만 보낸다  

**Answer: B**  
Explanation: SCP의 명시적 Deny는 멤버 계정의 admin과 root에까지 적용되는 조직 가드레일이므로, CloudTrail 중단·삭제 Action을 Deny로 묶으면 누구도 끌 수 없다. 사용자별 정책 추가는 누락 위험이 크고, CloudTrail은 리소스 기반 정책으로 이런 통제를 하지 않으며, GuardDuty 탐지는 사후 알림일 뿐 비활성화 자체를 막지 못한다.

---
