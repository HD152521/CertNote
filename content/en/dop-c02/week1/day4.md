# Day 4 - Multi-Account Strategy: The Real Picture of Organizations, Control Tower, and IAM Identity Center

More than 90% of DOP-C02 exam questions **assume a multi-account environment as the baseline**. Scenarios that begin "a company operates separate prod, staging, and dev accounts..." appear endlessly. Without this foundation, the topics that follow — cross-account deployment, centralized security, StackSets — are all left floating in mid-air.

Today we cover why multi-account became the standard, and how AWS Organizations, Control Tower, and IAM Identity Center build that foundation.

## Why Multi-Account Became the Standard — Blast Radius and Quotas

When first adopting AWS, most start with a single account, separating dev/staging/prod with VPCs and IAM. But as the company grows, almost every company moves to multi-account. Why?

### Reason 1: Blast Radius Isolation

In a single account, what happens if an operator accidentally fires a command like `aws s3 rb --force` at a prod bucket? IAM can block it, but it is powerless **when someone who has the permission makes a mistake**. With separate accounts, the explicit extra step of an STS AssumeRole is required, lowering the chance of a mistake.

> 📚 **Case study**: In 2017, a GitLab SRE operating the prod DB ran an `rm -rf` command on prod believing it was the staging environment. 300GB of the prod DB was wiped out entirely, and because backups weren't working properly, six hours of data was lost. GitLab subsequently began separating prod/staging into distinct accounts. The same kind of incident has repeated countless times in AWS environments, and this is the starting point of multi-account strategy.

### Reason 2: Service Quota Separation

AWS Service Quotas (formerly Limits) are per-account. If the EC2 instance limit is 1,000 in a single account and the dev team burns through all 1,000, prod can't launch new instances. Separate the accounts and each gets its own 1,000.

### Reason 3: Cost Separation and Visibility

Cost Allocation Tags alone have limits. To see precisely "how much did the Marketing team spend this month," splitting by account is far clearer. AWS Organizations + Consolidated Billing provides this foundation.

### Reason 4: Compliance Requirements

Regulations like PCI-DSS, HIPAA, and FedRAMP require "isolating production workloads from other environments." IAM separation alone rarely satisfies auditors; a separate account is the most definitive isolation.

### Reason 5: The Limits of IAM Policies

IAM policies struggle to express complex cross-team permissions. Using the account itself as the boundary reduces permission management to the simple model of "who can enter this account."

> 💡 **Related theory**: The essence of multi-account strategy is the **bulkhead pattern**. Made famous by the Resilience4j library, this pattern isolates components so that one component's failure doesn't propagate to others. Like a ship's bulkheads: even if one compartment floods, the others survive. An AWS account is the cloud-infrastructure version of that.

## AWS Organizations — The Foundation of Multi-Account

AWS Organizations (launched 2017) is the service that manages multiple AWS accounts as a single entity. Core components:

| Element | Meaning |
|------|------|
| **Management Account** | The organization's root account. Manages Organizations itself. |
| **Member Account** | A regular account belonging to the organization |
| **OU (Organizational Unit)** | A grouping of accounts. Tree structure (up to depth 5) |
| **SCP (Service Control Policy)** | Permission guardrails applied to OUs/accounts (deny-only) |
| **Consolidated Billing** | Aggregates all member account billing into the management account |

### Typical OU Structure (the AWS-Recommended Model)

```
Root
├── Security OU
│   ├── Log Archive Account (CloudTrail, Config log aggregation)
│   └── Security Tooling Account (GuardDuty, Security Hub administrator)
├── Infrastructure OU
│   ├── Network Account (Transit Gateway, Direct Connect)
│   └── Shared Services Account (DNS, AD, CI/CD)
├── Workloads OU
│   ├── Prod OU
│   │   ├── Prod-App-A Account
│   │   └── Prod-App-B Account
│   ├── Non-Prod OU
│   │   ├── Staging Account
│   │   └── Dev Account
└── Sandbox OU (personal experimentation)
```

This structure is the AWS-recommended best practice. When the exam presents a "which account should this go in" scenario, answer with this pattern as the baseline.

> 🔍 **Going deeper**: An SCP is a policy that **only has effect on deny**. Even if an SCP says `Allow`, that alone grants no permission — it means the SCP "permits" what IAM policies already grant. The real power of SCPs is `Deny`. For example, `Deny ec2:RunInstances if region != ap-northeast-2` forces every account in that OU to be unable to launch EC2 outside the Seoul region. No matter how broad the IAM permissions, if the SCP blocks it, it cannot be done.

### SCP Evaluation Order

AWS permission evaluation happens in this order:
1. **Explicit Deny** (a deny anywhere means immediate rejection)
2. **SCP** (rejected if it violates organization policy)
3. **Permission Boundary** (if present, rejected if it violates the boundary)
4. **Session Policy** (additional policy at AssumeRole time)
5. **Resource-based Policy** (S3 bucket policies, etc.)
6. **Identity-based Policy** (IAM user/role policies)

An explicit Deny anywhere in this chain means rejection; the request must pass all of them and have an Allow somewhere to be permitted.

> ⚠️ **Pitfall**: A common confusion is "I created an Allow policy in the SCP but it still doesn't work." An SCP is a **guardrail, not a permission grant**. Even if the SCP says Allow, permissions must be granted separately in IAM. Exam options like "granting permissions with SCP alone" are traps.

## Control Tower — The Automation Wrapper Around Organizations

AWS Control Tower (launched 2019) is a landing zone service that sets up Organizations + IAM Identity Center + Config + CloudTrail + ... all at once. Use it when you want to "start with a best-practice OU structure from day one."

| Capability | Description |
|------|------|
| **Landing Zone** | Standard OU structure + automatic creation of security accounts |
| **Account Factory** | Self-service creation of new accounts (based on Service Catalog) |
| **Guardrails** | Automatic application of preventive (SCP) + detective (Config Rule) controls |
| **Customizations for Control Tower (CfCT)** | Additional customization via CloudFormation |

Control Tower's core trade-off:
- **Pros**: Rapidly sets up the standard structure; automatic governance for new accounts
- **Cons**: Hard to migrate an already-operating Organizations into it; only some regions supported

> 📚 **Case study**: A large enterprise spent six months trying to consolidate 50 existing AWS accounts into Control Tower. Existing SCPs, CloudTrail trails, and IAM policies conflicted with Control Tower's standards, making migration extremely complex. Lesson: **if you already run multi-account, a PoC is mandatory before deciding to adopt Control Tower**. For greenfield adoption, starting with Control Tower is much faster.

### Core Composition of the Landing Zone

Accounts Control Tower creates automatically:
- **Management Account** (the Organizations root)
- **Log Archive Account** (central storage for all accounts' CloudTrail + Config logs)
- **Audit Account** (Security Hub, GuardDuty administrator + audit tooling)

And the OU structure:
- **Security OU** (Log Archive + Audit)
- **Sandbox OU** (personal experimentation)
- Additional OUs are created freely via Account Factory

### Guardrails

Control Tower guardrails come in two kinds:
1. **Preventive** (SCP-based) — blocks the action. Example: "Prohibit deleting CloudTrail in the Log Archive account"
2. **Detective** (Config Rule-based) — detects violations and alerts. Example: "Alert when an S3 bucket becomes public"

Each guardrail is classified as mandatory, strongly recommended, or elective. New accounts get mandatory guardrails applied automatically.

> 🔍 **Going deeper**: The preventive-vs-detective trade-off is "**automatability vs side effects**." Preventive (SCP) blocks the action itself, so incident prevention is guaranteed, but a badly written one blocks legitimate work too (e.g., blocking all root logins — including emergency access). Detective detects after the fact, so side effects are fewer, but the incident has already happened. In practice: preventive for critical, detective for monitoring-grade concerns.

## IAM Identity Center — The Definitive Answer for Multi-Account SSO

Formerly named AWS Single Sign-On (SSO), it was renamed IAM Identity Center in 2022. The core capability: "**one login for access to all your accounts**."

### How It Works

```
[ IAM Identity Center flow ]

User → Identity Provider (Okta/AzureAD/AWS Directory)
         |
         ↓ SAML/SCIM
       IAM Identity Center (installed in the organization's management account)
         |
         ↓ AssumeRole (automatic)
       Permission Set Role in the Member Account
```

- **Permission Set**: One role + a set of policies. Examples: "AdminAccess," "ReadOnlyAccess," "BillingAccess"
- **User/Group**: Sourced from the Identity Provider (synchronized via SCIM)
- **Account Assignment**: Which user can enter which account with which permission set

From the user's perspective, logging in at https://<your-org>.awsapps.com/start shows cards for every account+role they can access; clicking one enters that account's console. For the CLI, `aws sso login` obtains a token.

> 💡 **Related theory**: IAM Identity Center is essentially **AssumeRole automation**. When the user clicks a card, IAM Identity Center calls STS AssumeRole, obtains temporary credentials, and launches the console/CLI with them. Because all credentials are temporary (typically 1 to 12 hours), it is far safer than static IAM users.

### IAM User vs IAM Identity Center

| Dimension | IAM User (traditional) | IAM Identity Center |
|------|----------------|---------------------|
| Credentials | Static access keys | Temporary STS |
| Multi-account | Separate user per account | One user for all accounts |
| External IdP integration | SAML federated users | SCIM + SAML automatic |
| Password rotation | User's responsibility | Follows IdP policy |
| Exam frequency | Steadily decreasing | Steadily increasing |

AWS explicitly recommends "**use IAM Identity Center for new workloads**." On the exam, "multi-account + SSO" scenarios almost always have IAM Identity Center as the answer.

> ⚠️ **Pitfall**: The misconception that "with IAM Identity Center, you no longer need IAM." Human users move to IAM Identity Center, but **machine principals (EC2, Lambda, ECS tasks) still use IAM Roles**. IAM is not going away.

## Cross-Account Patterns — What the Exam Asks Most Often

The heart of multi-account is "**how does one account access resources in another account**." There are three patterns.

### Pattern 1: STS AssumeRole (the most common)

```
[ Cross-Account AssumeRole ]

Account A (CI/CD)              Account B (Prod)
  IAM User/Role  ──AssumeRole──→  CrossAccountRole
   (sts:AssumeRole)                (trust policy: Account A)
                                   (permission: ECS deploy)
```

Account B's role explicitly states "trust Account A's ARN" in its trust policy. Account A's principal calls `sts:AssumeRole` to obtain temporary credentials and access Account B's resources.

```yaml
# Example cross-account role trust policy in Account B
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::ACCOUNT_A_ID:role/CICDPipelineRole"},
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {"sts:ExternalId": "unique-secret-id"}
    }
  }]
}
```

`ExternalId` is for preventing the confused deputy problem. It is especially important when integrating with external SaaS (e.g., when Datadog or PagerDuty enters your account).

> 💡 **Related theory**: The confused deputy problem is a security issue discovered by Norm Hardy in 1988 — a vulnerability where "a privileged deputy performs an unprivileged party's request using its own privileges." In AWS, when integrating a SaaS, the SaaS's AWS account becomes the deputy accessing your resources; `ExternalId` provides isolation so that other customers of the same SaaS cannot access your resources through it.

### Pattern 2: Resource-Based Policy (S3 bucket policies, SNS, KMS, etc.)

S3 buckets, SNS topics, and KMS keys can carry policies attached to the resource itself, explicitly allowing principals from other accounts.

```json
// S3 bucket policy example (Account B's bucket allows Account A access)
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"AWS": "arn:aws:iam::ACCOUNT_A_ID:root"},
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::shared-bucket/*"
  }]
}
```

Cross-account access is possible even without AssumeRole. However, only some services support it — S3, SNS, SQS, KMS, Lambda, and a few others.

### Pattern 3: RAM (Resource Access Manager)

Some resources — VPCs, Subnets, Transit Gateways, License Manager — can be shared with other accounts via RAM. On the exam it frequently appears in "share a Transit Gateway across multiple accounts" scenarios.

## CloudTrail Organization Trail — All Account Auditing in One Place

CloudTrail is per-account by default, but with an **Organization Trail**, the management account captures the API calls of every member account at once and stores them in a single S3 bucket. The Log Archive account is that bucket's owner.

```
[ Organization Trail flow ]

All Member Accounts → CloudTrail Events → Organization Trail → 
  → S3 Bucket in the Log Archive Account (immutable, MFA delete)
  → CloudWatch Logs (optional)
  → EventBridge (optional)
```

The essence of this architecture:
1. **Single source of truth**: Every account's API calls in one place
2. **Tamper prevention**: No one outside the Log Archive account can delete logs (enforced by SCP)
3. **Search efficiency**: Audit the entire organization with a single Athena query

> 📚 **Case study**: During an internal audit, a company investigated "who changed the prod IAM policies in the last three months," but each member account stored its CloudTrail separately, so manually collecting logs from 30 accounts took a week. After switching to an Organization Trail + Log Archive account, the same query finished in 10 minutes with Athena.

## Multi-Account CI/CD Patterns — The Exam's Core Scenario

The most common multi-account CI/CD topology:

```
[ Hub-Spoke model ]

Shared Services Account (Hub)
  - CodeCommit / GitHub
  - CodeBuild
  - CodePipeline (orchestrator)
  - ECR (shared image registry)
  - S3 (artifact bucket, KMS encrypted)
        |
        ├─AssumeRole──→ Dev Account (Spoke)
        │                  - ECS/Lambda deployment target
        │                  - CrossAccountDeployRole
        |
        ├─AssumeRole──→ Staging Account
        │                  - same pattern
        |
        └─AssumeRole──→ Prod Account
                           - deploy after manual approval
                           - CrossAccountDeployRole (restricted)
```

Core security principles:
1. **Pipelines in one place**: Pipelines scattered across many places break consistency
2. **Deployment permissions via cross-account roles**: Spoke accounts trust the Hub's pipeline role
3. **KMS key sharing**: Share the artifact S3 bucket's KMS key with spoke accounts (via key policy)
4. **Centralized logging**: All deployment logs go to the Log Archive account

> 🎯 **Scenario**: The exam frequently asks, "a company runs separate dev/staging/prod accounts — where should CodePipeline live?" The answer: "**in a separate Shared Services account, deploying into each environment account via AssumeRole**." Putting a prod-only pipeline inside the prod account means ① the prod account's permissions become too powerful ② consistency across environments breaks ③ change management gets fragmented. Hub-Spoke is the standard.

## SCPs in Practice

Frequently used SCP examples:

```json
// 1. Allow operations only in specific regions
{
  "Effect": "Deny",
  "NotAction": [
    "iam:*", "organizations:*", "cloudfront:*", "route53:*",
    "s3:ListAllMyBuckets", "support:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": {"aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]}
  }
}

// 2. Block use of the root user (except emergencies)
{
  "Effect": "Deny",
  "Action": "*",
  "Resource": "*",
  "Condition": {
    "StringLike": {"aws:PrincipalArn": "arn:aws:iam::*:root"}
  }
}

// 3. Prohibit disabling CloudTrail
{
  "Effect": "Deny",
  "Action": [
    "cloudtrail:StopLogging",
    "cloudtrail:DeleteTrail",
    "cloudtrail:UpdateTrail"
  ],
  "Resource": "*"
}
```

> ⚠️ **Pitfall**: In SCP example 1, excluding global services (IAM, CloudFront, Route 53) via `NotAction` is the key. If you don't exclude them, that account can't even create IAM resources and becomes inoperable. In exam options, "region restriction without excluding global services" is a trap.

## Organizations via the CLI

```bash
# List all accounts in the organization
aws organizations list-accounts --output table

# Accounts within a specific OU
aws organizations list-accounts-for-parent --parent-id ou-xxxx-yyyyyyyy

# SCP policy attachment status
aws organizations list-policies-for-target \
  --target-id ou-xxxx-yyyyyyyy \
  --filter SERVICE_CONTROL_POLICY

# Automatically create a new account
aws organizations create-account \
  --email new-team@example.com \
  --account-name "TeamA-Dev"
# Asynchronous: returns CreateAccountRequestId → poll with describe-create-account-status
```

New account creation is asynchronous and usually takes 5-10 minutes. Meanwhile, Control Tower's Account Factory applies the baseline.

## Wrapping Up

Remember today's three pictures. First, **multi-account is the standard** — blast radius isolation, quota separation, and compliance requirements are its justification. Second, **Organizations + Control Tower is the foundation** — standard OU structure + landing zone + guardrails. Third, **IAM Identity Center is the definitive answer for authentication/authorization**, and cross-account resource access is solved by three patterns: STS AssumeRole + resource policies + RAM.

The next post wraps up Week 1: we'll comprehensively review the first week's material through 10 scenario questions.

---

## 📝 연습 문제

**문제 1.** A company running dev, staging, and prod environments in a single AWS account is moving to multi-account. What is the most essential reason?

A) Because AWS recommends it
B) Blast radius isolation, service quota separation, overcoming the limits of IAM policies, and compliance requirements
C) Cost savings
D) Performance improvement

**정답: B**
해설: The essential value of multi-account is ① blast radius isolation (minimizing the impact scope of mistakes) ② Service Quota separation (per-account limits) ③ overcoming IAM's limits (complex permissions are hard to express) ④ compliance (PCI-DSS, HIPAA isolation requirements). C — if anything, multi-account can slightly increase cost (shared resources like NAT, Transit Gateway); D is unrelated to performance.

---

**문제 2.** What is the essential characteristic that distinguishes an SCP from an IAM policy?

A) SCPs have lower priority than IAM
B) An SCP is a guardrail effective only for deny, and it grants no permissions
C) SCPs can only be applied per-user
D) SCPs are a means of granting cross-account permissions

**정답: B**
해설: An SCP is a **guardrail**, not a permission grant. Even if the SCP says `Allow`, permissions must be granted separately in IAM. The real power of an SCP is `Deny` — even if IAM allows it, an SCP Deny blocks it. A is backwards (SCPs are evaluated before IAM), C is factually wrong (they apply at the OU/account level), D is wrong (cross-account is STS AssumeRole + trust policy).

---

**문제 3.** A company is building multi-account CI/CD. Where should the pipeline live?

A) A separate pipeline in each environment account (dev/staging/prod)
B) All pipelines in the prod account, deploying to the other accounts
C) The pipeline in a separate Shared Services account, deploying to each environment account via a cross-account role
D) A union of the pipelines from all environment accounts

**정답: C**
해설: The Hub-Spoke model is the standard. Put the pipeline in a Shared Services account (Hub), and each environment account (Spoke) provides a cross-account deploy role that the hub assumes for deployment. Reasons: ① consistency (managed in one place) ② security (minimizing prod account permissions) ③ centralized change management. A breaks consistency, B makes the prod account's permissions too powerful, D is meaningless.

---

**문제 4.** Of the three mechanisms for cross-account resource access, which scenario best fits RAM (Resource Access Manager)?

A) Sharing an S3 bucket
B) Sharing network resources such as Transit Gateways and VPC Subnets
C) Sharing an IAM Role
D) Sharing a Lambda function

**정답: B**
해설: RAM's primary use is **network/shared infrastructure resources** — Transit Gateway, VPC Subnet, License Manager, Route 53 Resolver, Glue Catalog, and so on. S3 is solved with bucket policies, IAM Roles with trust policies, Lambda with resource policies. On the exam, "share a Transit Gateway across multiple accounts" scenarios almost always have RAM as the answer.

---

**문제 5.** What is the essential advantage of an Organization Trail?

A) Cost savings
B) Central storage of every member account's CloudTrail events in one S3 bucket — a single source of truth plus tamper prevention
C) Faster API calls
D) Automatic cross-region replication

**정답: B**
해설: An Organization Trail is a single trail in the management account that captures every member account's API calls and stores them in the Log Archive account's S3 bucket. SCPs block tampering with that bucket, guaranteeing the integrity of the audit trail. No one in a member account can disable or delete their own trail (blocked by SCP). On the exam, the keyword "tamper-proof audit" almost always means this pattern.

---

**문제 6.** Why does ExternalId go into a cross-account role's trust policy?

A) Faster authentication
B) To prevent the confused deputy problem — isolating so that other customers of the same SaaS cannot access our resources
C) IAM cost savings
D) Enforcing MFA

**정답: B**
해설: When a SaaS (Datadog, PagerDuty, etc.) accesses multiple customers' AWS accounts cross-account, the same SaaS AWS account becomes the deputy for all customers. If one customer's ExternalId were placed in another customer's role trust policy, improper access would be possible. The ExternalId is issued as a secret known only to that customer. It originates from Norm Hardy's 1988 confused deputy paper. On the exam, the keyword "third-party SaaS integration security" means ExternalId.

---

**문제 7.** Which three accounts are created automatically by Control Tower's Landing Zone?

A) Management, Dev, Prod
B) Management, Log Archive, Audit
C) Management, Backup, DR
D) Management, Network, Security

**정답: B**
해설: The Landing Zone's three standard accounts — ① **Management** (the Organizations root) ② **Log Archive** (CloudTrail + Config log aggregation) ③ **Audit** (Security Hub, GuardDuty administrator). These three are the security foundation. Additional accounts are created separately via Account Factory. The Dev/Prod in A belong in the Workload OU; they are not default Landing Zone accounts.

---

**문제 8.** A company applied an SCP to "block all AWS operations outside the ap-northeast-2 region," and then IAM users could no longer create IAM policies in the console. What is the cause?

A) An SCP priority problem
B) The SCP's Deny also blocked global services (IAM, CloudFront, Route 53)
C) A Control Tower conflict
D) MFA required

**정답: B**
해설: IAM, Route 53, and CloudFront are **global services** with no concept of region. When applying a region restriction in an SCP, if you don't exclude global services via `NotAction`, even IAM operations get blocked. The correct pattern is `NotAction: ["iam:*", "organizations:*", "cloudfront:*", "route53:*", "support:*", "s3:ListAllMyBuckets"]`. A frequent SCP trap on the exam.
