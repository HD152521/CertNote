# Day 1 - Shared Responsibility Model and SCS-C03's 6 Domains: The Big Picture for Security Engineers

People preparing for a security certification for the first time often think "AWS security = writing IAM policies well." If you go in with that mindset, you will crumble in front of SCS-C03's scenario questions. What this exam measures is not policy syntax but a framework of thinking: **"At which layer is this threat handled, who is responsible, and which control stops it?"** The two pillars of that framework are the Shared Responsibility Model and the 6 exam domains.

Today we dig deep into no single tool. Instead, we draw a map for gauging where every service you will meet over the next 12 weeks sits. Once you have fixed in your head which "control type at which responsibility boundary" each of the names GuardDuty, KMS, IAM, WAF, Macie, and Config represents, the correct answers and the trap answers in scenario questions will naturally separate.

## The Shared Responsibility Model: "of the cloud" vs "in the cloud"

AWS's Shared Responsibility Model can be summarized in one sentence. **AWS is responsible for the security "of the cloud," and the customer is responsible for security "in the cloud."** It sounds abstract, but the boundary line is surprisingly sharp.

| Responsible party | Scope of responsibility | Examples |
|-----------|----------|------|
| **AWS (of the cloud)** | Hardware, physical facilities, network infrastructure, the hypervisor, and the OS/patching of managed services | Data center access control, EC2 host firmware, S3 durability, RDS engine patching |
| **Customer (in the cloud)** | Data, IAM, OS and network configuration, encryption key management, applications | S3 bucket policies, EC2 guest OS patching, security group rules, KMS key rotation |

The key insight is that this boundary **moves depending on the service type**. Even the same word "patching" is the customer's job on EC2 and AWS's job on Fargate. So the Shared Responsibility Model should be learned not as a table to memorize wholesale but through the **practice of drawing the boundary line yourself**. The figure below shows how the thick double line moves up and down depending on the service type.

```
[ The responsibility boundary moves up and down depending on the service type ]

  Stack layer              EC2(IaaS)   RDS, ECS on EC2   Lambda, Fargate   S3, DynamoDB
 ───────────────────────────────────────────────────────────────────────────────
  Data classification/ownership   Customer   Customer      Customer          Customer
  Decision to use encryption      Customer   Customer      Customer          Customer
  IAM · access control            Customer   Customer      Customer          Customer
 ═══════════════════════════════════════════════════════════════════════════════
  Application code                Customer   Customer      Customer           —
 ───────────────────────────────────────────────────────────────────────────────
  Runtime · libraries             Customer   Customer      Customer (layers)  AWS
 ───────────────────────────────────────────────────────────────────────────────
  Middleware · DB engine          Customer   AWS           AWS               AWS
 ───────────────────────────────────────────────────────────────────────────────
  Guest OS · OS patching          Customer   AWS           AWS               AWS
 ───────────────────────────────────────────────────────────────────────────────
  Hypervisor · virtualization     AWS        AWS           AWS               AWS
  Physical servers · storage      AWS        AWS           AWS               AWS
  Data center · access control    AWS        AWS           AWS               AWS

  ▲ The three rows above the double line (data, encryption decision, access control)
    are **the customer's responsibility in every service**.
    However far down the boundary line goes, these three rows never pass to AWS.
    Below the double line, the further right you move the service, the more is pushed down to AWS.
```

- **IaaS (EC2)**: The customer's responsibility is the largest. Guest OS patching, middleware, and even the host firewall are all the customer's share. AWS is responsible only for what is below the hypervisor.
- **PaaS (RDS, ECS on EC2)**: AWS handles engine and OS patching, and the customer is responsible for data, access control, encryption settings, and approving the maintenance window.
- **Serverless (Lambda, Fargate)**: AWS handles even the execution environment's OS and runtime patching. What remains for the customer is the code, the function's IAM execution role, and the data the function touches.
- **SaaS-like (S3, DynamoDB)**: AWS handles nearly all of the infrastructure, and the customer is responsible only for **data classification and access control**. Even so, responsibility for data never passes to AWS.

Pulling out only the items that are frequently confused, per service, gives the following. Questions on the exam asking "whose responsibility is it" come almost entirely from within this table.

| Item | AWS responsibility | Customer responsibility | Where people often go wrong |
|------|----------|-----------|------------------|
| EC2 guest OS security patches | — | O | An option saying "AWS patches EC2 for you" is wrong |
| Lambda execution environment OS patches | O | — | An option saying "patch the Lambda function's OS" is a trap |
| RDS DB engine minor version patches | O | Maintenance window setting is the customer's | The customer turns on the automatic minor upgrade option |
| DB users and permissions inside RDS | — | O | The engine is AWS's, the accounts are the customer's |
| Durability and replication of S3 objects | O | — | Durability is AWS's, **whether it is public is the customer's** |
| S3 bucket policy and Block Public Access | — | O | A point that easily becomes the cause of leak incidents |
| Protection of KMS key material | O | — | HSM-level protection is AWS's |
| KMS key policy and key rotation policy | — | O | The customer decides who uses the key |
| VPC network infrastructure (routers, cables) | O | — | The physical network is AWS's |
| Security groups, NACLs, route tables | — | O | Logical network configuration is the customer's |
| Hypervisor isolation and firmware | O | — | An area the customer cannot touch |

The Shared Responsibility Model has a **third column** that rarely appears in the table. It is the area AWS calls "shared controls," and items like patch management, configuration management, and awareness training belong here. For example, patch management is an item where **both** sides exist: AWS patches the infrastructure and the customer patches the guest OS and applications. Configuration management is similar: AWS maintains the infrastructure configuration standards and the customer is responsible for the configuration of its own resources. When the phrase "an area for which AWS and the customer are jointly responsible" appears in an option on the exam, it likely points to one of these three items.

> ⚠️ **Trap**: A statement that "if you use managed services, AWS also handles compliance for you" is wrong. AWS merely provides audit reports (SOC, ISO, PCI, etc.) **about its own infrastructure** through AWS Artifact. Whether a customer workload satisfies PCI DSS must be proven by the customer. AWS Artifact is "a window for downloading AWS-side evidence," not "a certificate stating that our system is compliant." This distinction comes up repeatedly in Domain 6 (Governance).

This is called the "shifting line of responsibility." Even for the same "patching," OS patching on EC2 is the customer's responsibility, but OS patching on Fargate is AWS's responsibility. Questions on the exam asking "whose responsibility is it" can almost always be solved by first determining **whether the service is IaaS, PaaS, or SaaS**. An option saying "patch the Lambda function's OS" is a trap — AWS patches the Lambda runtime OS.

> ⚠️ **Trap**: In an S3 data leak incident, an option saying "AWS is responsible" is wrong. S3's durability and availability are AWS's responsibility, but **the setting that left the bucket open to public (access control) is 100% the customer's responsibility**. The Capital One incident (2019) was also not a breach of S3 itself but a customer-side IAM and WAF misconfiguration.

## The 3 Types of Controls: Preventive, Detective, Responsive

A security engineer needs to build the habit of classifying every control into three categories. The domain structure of SCS-C03 itself follows this classification.

| Type | Purpose | Question | AWS examples |
|------|------|------|----------|
| **Preventive** | Keep incidents from happening | "Can we block this action in the first place?" | IAM policies, SCP, security groups, KMS key policies, WAF |
| **Detective** | Notice what has happened | "Will we know if something goes wrong?" | CloudTrail, GuardDuty, Config, Security Hub, Macie |
| **Responsive (response/recovery)** | Recover quickly after it happens | "How do we automatically respond when an incident occurs?" | EventBridge → Lambda/SSM automatic remediation, backup restore |

A mature security architecture stacks the three types **in layers (defense in depth)**. If prevention is breached, detection catches it; if detection is late, response reduces the damage. When the exam asks for "the best way to stop this threat," an option combining "prevention + detection + automated response" is often the answer rather than an option picking only a single control. However, if it asks for "first/immediate," the answer is usually a preventive control (SCP, key policy).

The criterion for choosing among the three types is hidden in the question's **verb**. When you see the following expressions in an exam sentence, the direction of the answer is almost settled.

| Expression in the question | Control type required | Representative answer candidates |
|-------------|--------------------|----------------|
| "prevent", "ensure ... cannot", "must be blocked" | Preventive | SCP, IAM Deny, bucket policy Deny, security groups, Block Public Access |
| "detect", "alert", "identify", "must be able to know" | Detective | CloudTrail, GuardDuty, Config, Security Hub, Macie |
| "respond", "automatically remediate", "recover" | Responsive | EventBridge → Lambda/SSM Automation, backup restore, isolation |
| "audit", "evidence", "must leave evidence" | Detective (recording) | CloudTrail + S3 Object Lock, Config snapshots |
| "least operational overhead" | Managed/automated direction | Managed rules, automatic remediation, service integration |

A preventive control is usually expressed as **a single policy document**. Below are the actual forms of two kinds of preventive controls you will keep meeting from today on. One is an SCP applied across the whole organization (an account-level ceiling), and the other is a bucket policy attached to the resource itself. Both express a "prohibition," so they are written as `Deny`.

```json
// ① SCP — an organization-level preventive control: no one can turn off CloudTrail
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "ProtectAuditTrail",
    "Effect": "Deny",
    "Action": [
      "cloudtrail:StopLogging",
      "cloudtrail:DeleteTrail",
      "cloudtrail:UpdateTrail"
    ],
    "Resource": "*"
  }]
}
```

```json
// ② S3 bucket policy — a preventive control attached to the resource itself: no plaintext transport
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyInsecureTransport",
    "Effect": "Deny",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": [
      "arn:aws:s3:::audit-evidence",
      "arn:aws:s3:::audit-evidence/*"
    ],
    "Condition": {
      "Bool": { "aws:SecureTransport": "false" }
    }
  }]
}
```

You can see the difference between the two documents with your own eyes. ① has no `Principal` and ② has one. **When a policy is attached on the "principal side," you do not need to write the principal, and when it is attached on the "resource side," you must write who is coming.** This symmetry is the root of the Identity policy vs Resource policy distinction we will cover in Days 2 and 3.

Options that mix up control types are easily used as wrong answers. Sentences like "**Block** unencrypted uploads with GuardDuty" or "**Prevent** public buckets with a Config rule" have the right service name but **the wrong verb.** GuardDuty and Config are detection and evaluation tools, not tools that block requests. Config merely marks a rule violation as "NON_COMPLIANT," and to actually revert it you must attach a remediation action (SSM Automation) — and the moment you do, it is not prevention but **response**. Decide not by the service name but by "does it block at request time, or notice after the fact?"

## The 6 Domains SCS-C03 Measures

SCS-C03 is an exam in effect from December 2, 2025 (the previous version SCS-C02 was in effect until December 1, 2025). It has 65 questions (50 scored + 15 unscored), 170 minutes, and a passing standard of 750/1000, and the question types are multiple choice, multiple response, ordering, and matching. The exam blueprint (exam guide) specifies the 6 domains and their weights.

| # | Domain | Weight | One-line summary |
|---|--------|--------|-----------|
| 1 | **Detection** | 16% | Monitoring, alerting, and logging with CloudTrail, Config, CloudWatch, GuardDuty, and Security Hub, and troubleshooting them |
| 2 | **Incident Response** | 14% | Designing and testing incident response plans, responding to events, assessing scope and impact by validating findings, forensics |
| 3 | **Infrastructure Security** | 18% | VPC, security groups, NACLs, WAF, Shield, network perimeter defense |
| 4 | **Identity and Access Management** | 20% | IAM, STS, Identity Center, federation, policy evaluation |
| 5 | **Data Protection** | 18% | KMS, encryption, S3 protection, Secrets Manager, certificates |
| 6 | **Security Foundations and Governance** | 14% | Organizations, SCP, Control Tower, compliance, multi-account governance |

Looking at the weights, **Domain 4 (IAM 20%)** is the heaviest, followed by **Domain 3 (Infrastructure 18%) + Domain 5 (Data 18%)**. These three are more than half of the exam. Moreover, Domain 4 is **the premise of all the other domains**. KMS key policies also operate on top of IAM evaluation logic, and cross-account logging also operates on top of AssumeRole. That is why we allocate all of Week 1 to IAM.

The domains are not 6 subjects to memorize separately but **a single flow of thought**. For a threat to be visible, you need logs and monitoring (D1 Detection) → detected events are responded to by validating their scope and impact (D2 Incident Response) → the entry path is the network (D3) → inside it, permissions are IAM (D4) → what is protected is data (D5) → and all of this is enforced at the organization level (D6). Scenario questions usually weave 2-3 domains together as a bundle.

Each domain has an anchor of "this domain, these services." This table serves as the map for the 12-week study, so you do not need to understand it perfectly now — **just getting familiar with the names and their affiliations** is enough. As each week progresses, these cells will be filled in one by one.

| Domain | Weight | Core services | Question this domain answers | When studied |
|--------|------|-------------|--------------------------|-----------|
| D1 Detection | 16% | CloudTrail, CloudWatch Logs, Config, VPC Flow Logs, Athena, GuardDuty, Inspector, Security Hub | "Is an attack in progress? Can we prove later what happened?" | Mid to late |
| D2 Incident Response | 14% | Detective, EventBridge, Lambda/SSM automation | "What are the scope and impact of the incident that occurred, and how do we contain and recover?" | Late |
| D3 Infrastructure Security | 18% | VPC, security groups, NACLs, WAF, Shield, Network Firewall, PrivateLink | "Where does traffic flow and where is it blocked?" | Mid |
| D4 Identity and Access Management | 20% | IAM, STS, Identity Center, Organizations SCP, Cognito | "Is this principal allowed to do this action?" | **This week** |
| D5 Data Protection | 18% | KMS, CloudHSM, S3 encryption, Secrets Manager, ACM, Macie | "Is data protected at rest and in transit?" | Weeks 3-4 |
| D6 Security Foundations and Governance | 14% | Organizations, Control Tower, Config Conformance Pack, Audit Manager | "Can we enforce and prove controls across the whole organization?" | Late |

Looking at the weights, **Domain 4 (IAM 20%)** is the heaviest, and adding **Domain 3 (Infrastructure 18%) + Domain 5 (Data 18%)** makes more than half of the exam. Moreover, Domain 4 is **the premise of all the other domains**. Drawing this structure as a picture makes clear why IAM is the first week.

```
[ The 6 domains are a chain, not layers ]

        D6 Security Foundations and Governance (enforced across the whole organization)
   ┌──────────────────────────────────────────────┐
   │   D2 Incident Response ◀── signal ── D1 Detection/Logging │
   │        │                          ▲          │
   │     respond                    record        │
   │        ▼                          │          │
   │   D3 Infrastructure Security ── passing request ──▶ D4 IAM │
   │   (where does it enter)           (who is it) │
   │                                    │          │
   │                                 decision      │
   │                                    ▼          │
   │                            D5 Data Protection  │
   │                            (what do we protect)│
   └──────────────────────────────────────────────┘

   D4 is the "decision engine" for all five other domains.
   · KMS key policies (D5) also operate on top of IAM evaluation
   · Cross-account log collection (D1) also operates on top of AssumeRole
   · SCP guardrails (D6) are also a layer of IAM evaluation
   · GuardDuty delegated administrator (D1) also operates on top of IAM trust relationships
```

That is why we allocate all of Week 1 to IAM. If you skim past IAM, you will have to relearn "why this access is blocked" from scratch every time for the remaining 11 weeks.

### Knowing the Shape of the Exam in Advance

The exam is 65 questions in 170 minutes, with 750/1000 as the passing line. Arithmetically that gives **about 2 minutes 36 seconds per question**, but SCS-C03 questions have long passages. Just reading a five- or six-line situation description and four long options takes a minute. So this exam asks "can you judge quickly" as much as "do you know."

The trick to quick judgment is not to read the passage carefully from the beginning. First read **the last sentence (what is being asked)**, then skim the options to fix the axis, and then look in the passage only for the clues relevant to that axis. For example, if the last sentence ends with "prevent," two options containing detection services are already dropped from the candidates before you read the passage.

| Condition phrase often attached to a question | What it actually requires |
|--------------------------|--------------------|
| "with the LEAST operational overhead" | Use managed services, automation, and built-in features (build-it-yourself options are eliminated) |
| "MOST secure" / "MOST restrictive" | Options with narrowed wildcards, temporary credentials, explicit Deny |
| "MOST cost-effective" | Reuse existing services, remove unnecessary always-on execution |
| "meets the requirements" (multiple requirements) | An option satisfying **all** requirements — if even one is missing, it is eliminated |
| "immediately" / "as a first step" | A preventive control or immediate blocking (disabling the key, revoking the session) |
| "without disrupting the application" | Conditional, phased controls instead of a blanket block |

There are questions where "the safest method" and "the method with the least operational burden" point to different options. In that case the answer is on the side of **the criterion the question states explicitly**. Just because it is a security exam, if you always pick the strictest option, you will get "least operational overhead" questions wrong. Conversely, if you pick for convenience, you will get "most secure" questions wrong. Do not forget that the adjective on the last line of the question is the scoring criterion.

## Data Classification and Least Privilege: The Two Starting Points of Security Incidents

When you trace the root cause of security incidents in practice, it almost always comes down to two things. One is **not classifying data**, so not knowing what to protect and how much; the other is **excessive permissions**.

Data classification is the starting point of protective controls. Where are PII, payment information, and health data? That is why Amazon Macie automatically classifies sensitive data in S3 with ML. Without classification, you cannot answer the question "does this bucket need KMS encryption?"

Data classification is usually divided into 3 to 4 tiers. The tier names differ by organization, but what matters is to decide in advance **which controls automatically attach to each tier**. Classification should decide the controls; if the person in charge's judgment decides the controls each time, consistency breaks.

| Classification tier | Example data | Minimum required controls | AWS implementation |
|-----------|-------------|----------------|----------|
| Public | Public documents, marketing materials | Integrity only | Versioning, CloudFront |
| Internal | Internal documents, operational metrics | Access control | IAM policies, SSE-S3 |
| Confidential | PII, customer contracts | Access control + customer-managed key encryption + auditing | SSE-KMS (CMK), CloudTrail data events, Macie |
| Restricted | Payment information, authentication information, health data | All of the above + key separation + exfiltration control + immutable logs | Dedicated KMS key, VPC endpoint policy, S3 Object Lock, Secrets Manager |

With this table, the question "does this bucket need KMS" becomes a **lookup** rather than a judgment. This is also why Amazon Macie automatically finds and classifies sensitive data in S3 — because a human cannot classify thousands of buckets.

Least privilege is the heart of Domain 4 but permeates every domain. Least privilege in KMS key policies, in S3 bucket policies, in SCPs. **"Explicit when granting permissions, default when revoking them"** is the philosophy of IAM evaluation logic (we will look at this in depth on Day 2).

Data classification and least privilege are in fact two sides of the same principle. Classification determines "how important is this asset," and least privilege executes "narrow access in proportion to that importance." In security engineering this pair is called **asset-centric risk management**. If you start from a threat list, it never ends (attack techniques are infinite), but if you start from an asset list, it is finite. This is also why SCS-C03 scenarios almost always begin with "something was leaked / could be leaked" — you must identify the asset first before you can choose the control.

> 🎯 **Scenario**: "The audit team demands, 'Give us a list of which S3 buckets across our entire organization contain credit card numbers.' There are 40 accounts and over 2,000 buckets." → Every option that chooses a human-scanning approach is eliminated. The answer direction is to **enable Macie at the organization level** (designating the Security Tooling account as the delegated administrator), run sensitive data discovery jobs, and aggregate the findings into Security Hub. Here Domain 5 (Data), Domain 1 (Detection), and Domain 6 (organization-level delegation) meet in a single question. This is what it means to say the domains are a chain.

In 2017, many companies stored PII in S3 buckets left open as public-read, and major leaks followed one after another (Verizon, Accenture, etc.). To stop this pattern, AWS introduced **S3 Block Public Access** in 2018 and, from 2023, enabled it by default for new buckets. This is a typical example of governance (Domain 6) that "enforces a preventive control as a platform default."

## Multi-Account and Governance: The Blast Radius of Security

The reason a security engineer must move away from a single-account mindset is the **blast radius**. To keep a breach of one account from spreading to other environments, you must use accounts as boundaries.

The standard multi-account security structure is as follows.

```
[ AWS Organizations security baseline structure ]

  Management account (billing + SCP management, no workloads)
        |
   +----+----+----------------+--------------+
   |         |                |              |
 Security OU  Infrastructure  Workloads OU   Sandbox OU
   |              OU            (Prod/NonProd)
   +-- Log Archive account (immutable storage of CloudTrail/Config logs)
   +-- Audit/Security Tooling account (delegated administrator for GuardDuty and Security Hub)
```

- **Log Archive account**: Centralizes the CloudTrail and Config logs of all accounts and prevents tampering with S3 Object Lock. Humans almost never log in.
- **Security Tooling account**: The **delegated administrator** of GuardDuty, Security Hub, and Detective. You see the security signals of the entire organization in one place.
- **SCP**: Does not grant permissions but draws a **ceiling (guardrail)** with deny. It applies even to root (the management account's root is an exception).

GuardDuty, Security Hub, Macie, and Config all support the "delegated administrator" pattern. The best practice is **to delegate to the Security Tooling account** rather than operating directly from the management account. The reason is least privilege — the management account only handles billing and organization management, and if you pile security operations permissions there too, the entire organization collapses when that account is breached.

Seeing in one picture how data actually flows in this structure makes much clearer why accounts are divided this way.

```
[ Flow of logs and security signals — the direction flows one way only ]

  Workloads OU                Security OU
  ┌──────────────┐
  │ Prod account A│──CloudTrail──┐
  │  · CloudTrail│──Config──────┤
  │  · Config    │──VPC Flow────┤
  │  · GuardDuty │──Findings──┐ │
  └──────────────┘            │ │
  ┌──────────────┐            │ │      ┌────────────────────────┐
  │ Prod account B│──logs──────┼─┼─────▶│ Log Archive account     │
  │  ...         │            │ │      │  S3 + Object Lock       │
  └──────────────┘            │ │      │  KMS key owned by this account │
  ┌──────────────┐            │ │      │  Almost no human logins │
  │ Dev account C │──logs──────┼─┴─────▶│  Write-only · undeletable│
  └──────────────┘            │        └────────────────────────┘
                              │
                              │        ┌────────────────────────┐
                              └───────▶│ Security Tooling account│
                                       │  GuardDuty delegated admin │
                                       │  Security Hub aggregation  │
                                       │  Macie · Detective      │
                                       │  IR roles issued from here │
                                       └────────────────────────┘

  Three key properties
  ① The flow is **one-way**. Workload accounts can only write logs, not read or delete them.
  ② The log storage account and the analysis account are **separated**. Even if the analysis tool is breached, the evidence remains.
  ③ The log bucket's KMS key is **owned by the Log Archive account**.
     This blocks the path where a workload account administrator deletes the key to nullify the evidence.
```

All three properties in this figure come from a single assumption — **a workload account will be breached someday.** Even when an attacker holds the administrator privileges of a compromised account, the evidence must remain for an investigation to be possible. That is why logs are kept "in a different account, write-only, undeletable." This is the point where Domain 1 (Detection) and Domain 6 meet, and we will meet it again later in the weeks with the CloudTrail organization trail and S3 Object Lock.

You can check directly with the CLI where the current account sits in the organization. The first line of security work is always "which account and which identity am I right now?"

```bash
# ① Who am I right now — the starting point of all debugging
aws sts get-caller-identity
# {
#   "UserId":  "AROAEXAMPLEID:alice@example.com",
#   "Account": "111122223333",
#   "Arn":     "arn:aws:sts::111122223333:assumed-role/SecurityAudit/alice@example.com"
# }

# ② Information about the organization this account belongs to (check management account ID and feature set)
aws organizations describe-organization

# ③ The organization's account list and OU structure
aws organizations list-accounts
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id r-exam

# ④ Check the SCPs actually in effect for this account
aws organizations list-policies-for-target \
  --target-id 111122223333 \
  --filter SERVICE_CONTROL_POLICY

# ⑤ Check who the delegated administrators of security services are
aws organizations list-delegated-administrators
```

If the `Arn` in the output of `aws sts get-caller-identity` has the form `assumed-role/...`, you are **in a state of having assumed a role**, and if it has the form `user/...`, it is an IAM user's long-term credentials. A considerable share of real-world incidents starts with "I assumed I was of course accessing through a role, but it was actually an old access key." And `describe-organization` succeeds **only in accounts that belong to the organization** — if this command fails, that account is not an Organizations member, and therefore **SCPs are not applied at all.** This is the first thing to check for "I attached an SCP but it has no effect."

## Practice Mapping Controls to Domains and Types

We classify the major services along the two axes we learned today (control type × responsibility boundary). With this table in your head, you can quickly filter the options in scenario questions.

| Service | Domain | Control type | One-line role |
|--------|--------|----------|-----------|
| IAM / SCP | 4, 6 | Preventive | Restrict who can do what |
| KMS | 5 | Preventive | Control data access with encryption keys |
| Security groups / NACLs | 3 | Preventive | Network traffic filters |
| WAF / Shield | 3 | Preventive | Block web attacks and DDoS |
| CloudTrail | 1 | Detective | API call audit log |
| GuardDuty | 1, 2 | Detective | ML-based threat detection |
| Config | 1, 6 | Detective | Evaluates resource configuration compliance |
| Macie | 5, 1 | Detective | Classifies sensitive data in S3 |
| Security Hub | 1, 2 | Detective | Aggregates security findings and checks standards |
| EventBridge + SSM/Lambda | 2 | Responsive | Automatic remediation |

> 🎯 **Scenario**: "You learned after the fact that PII was stored in an S3 bucket without encryption. What combination of controls prevents a recurrence?" There is no single answer. **Detective** (discover sensitive data with Macie + Config rule `s3-bucket-server-side-encryption-enabled`) + **Preventive** (block unencrypted PutObject with an SCP, S3 Block Public Access) + **Responsive** (automatic encryption/isolation via EventBridge → Lambda). Thinking of all three types at once is the SCS-C03 way of thinking.

## Practice Translating Threats into Controls

If you finish after drawing only the map, it will not be used in the exam room. You need practice applying today's two axes (responsibility boundary × control type) to real threats. Below are five threats that appear repeatedly in SCS-C03, decomposed along the two axes. Reading each row from left to right gives you the skeleton of an answer.

| Threat | Whose responsibility | Preventive | Detective | Responsive |
|------|----------------|------|------|------|
| An S3 bucket is opened to public | Customer (access control) | Block Public Access, bucket policy Deny, SCP | Config rules, Access Analyzer, Security Hub | Block immediately via EventBridge → Lambda |
| Access keys are exposed in a code repository | Customer (credential management) | Retire long-term keys and switch to roles, Secrets Manager | GuardDuty credential misuse detection, CloudTrail anomalous calls | Disable/delete keys, revoke sessions, investigate scope of impact |
| EC2 metadata stolen via SSRF | Customer (OS, app, IMDS settings) | Enforce IMDSv2, least privilege for the instance role, WAF | GuardDuty detection of instance credentials used externally | Isolate the instance, invalidate role sessions, snapshot forensics |
| Unencrypted data is stored | Customer (encryption decision) | Deny unencrypted writes via bucket policy/SCP, default encryption | Config rules, Macie | Re-encryption batch, object isolation |
| An account outside the organization accesses our resources | Customer (resource policy) | Resource policy conditions, organization-level guardrails | Access Analyzer external access findings | Narrow the policy, trace back access logs |

There are quite a few organizations in reality where the right three columns of this table are mostly empty. If you set only prevention and build no detection or response, from the moment prevention is breached the incident proceeds **with no one knowing**. When a passage on the exam says "an incident has already occurred," options listing only preventive controls are usually wrong — what has already happened needs detection and response.

> 🎯 **Scenario**: "In one account, you found out from the bill that dozens of EC2 instances had suddenly been created in a Region that is not normally used. What is the recurrence prevention measure?" → The sentence saying you found out from the bill is the key clue. It means **there was no detection layer at all**. So the answer must have three layers. For prevention, block use outside the approved Regions with an SCP; for detection, attach alerts based on GuardDuty and CloudTrail; for response, set up automatic isolation and notification from EventBridge. On top of this, you must also address the root cause (how the credentials were leaked) to complete it. An option picking only a single control does not satisfy the requirement of "recurrence prevention."

## Wrap-Up

Let us engrave the three pictures we drew today. First, in the **Shared Responsibility Model**, the responsibility line moves depending on the service type (IaaS/PaaS/SaaS), and data and access control are the customer's responsibility in every case. Second, every control is classified into three types — **preventive, detective, responsive** — and a mature architecture stacks all three in layers. Third, the **6 domains** are not subjects to memorize separately but a single chain of thought flowing from detection → response → network → identity → data → governance.

The Capital One breach disclosed in 2019 shows how the two axes we learned today interlock in a real incident. The attacker accessed EC2 instance metadata through SSRF via a misconfigured web application firewall, obtained the temporary credentials of that instance's role, and downloaded data from an S3 bucket. The information of about 106 million US and Canadian credit card applicants was affected. If you examine which side of the Shared Responsibility Model was breached, **all of it was in the customer's area of responsibility.** Neither the S3 infrastructure, nor the hypervisor, nor physical security was breached. What was breached was the application configuration (WAF), the instance metadata setting (IMDS), and the permission scope of the instance role. This one incident sums up why the common belief that "using managed services is safe" is dangerous.

In 2017, many companies stored personal information in S3 buckets left with public settings, and major leaks followed one after another. AWS's response was not to educate individual customers but **to change the platform defaults** — it introduced the S3 Block Public Access feature, then enabled it by default for new buckets, and displayed a warning badge in the console. This is the essence of governance (Domain 6). A control is not "asking people to do it well" but **"making it hard to do wrong."** This is why the answer to exam questions asking about organization-level controls is almost always on the side of SCPs, Control Tower, and enforced defaults.

Starting tomorrow, we move into IAM, the spine of that chain. Once you dig into what users, groups, roles, and policies are, and exactly how the evaluation logic by which AWS decides whether to allow or deny a request runs, you will begin to see that all the other domains are layered on top of it.

### One-Line Summary

The Shared Responsibility Model is not a fixed table but a **boundary line that moves up and down depending on the service type**, and only the three rows of data classification, encryption decision, and access control are always the customer's responsibility, whether IaaS or SaaS. Every control is classified into the three types **preventive, detective, responsive**, and the question's verb ("prevent/detect/respond") tells you which type is required — an option that "blocks" with GuardDuty or "prevents" with Config is a typical wrong answer with the right service and the wrong verb. SCS-C03's 6 domains are a single chain flowing from detection → response → network → identity → data → governance, and its decision engine is **Domain 4 (IAM)**, which is why the first week is spent here. In a multi-account structure, logs flow to the Log Archive account **one-way and undeletable**, and security tools are **delegated to the Security Tooling account** rather than the management account. Finally, do not forget that the adjective at the end of the question (most secure / least operational overhead) is the scoring criterion.

---

## 📝 Practice Questions

**Question 1.** A company is using Amazon RDS for PostgreSQL. Under the shared responsibility model, which of the following is **AWS's responsibility**?

A) Classifying the PII stored in the database and deciding whether to enable encryption  
B) Configuring database user accounts and IAM authentication policies  
C) Applying security patches to the database engine  
D) Restricting access to the DB port with a security group  

**Answer: C**  
Explanation: RDS is a managed (PaaS) service, so AWS is responsible for patching the engine and the OS (the customer only manages the maintenance window). Data classification, whether encryption is enabled, DB users and IAM authentication, and security group settings are all customer responsibilities "in the cloud." The key point is that responsibility for data and access control never transfers to AWS, no matter the service type.

---

**Question 2.** Which of the following is **not** a preventive control?

A) Using an SCP to deny EC2 launches outside a specific Region  
B) Using a KMS key policy to allow decryption only from specific accounts  
C) Using GuardDuty to detect anomalous API call patterns  
D) Using a security group to allow inbound traffic on 443 only  

**Answer: C**  
Explanation: GuardDuty is a detective control that notices threats that have already happened (or are in progress). SCPs, KMS key policies, and security groups are all preventive controls that block an action before it occurs. The distinction — detection does not stop an incident, it only notices one — is the heart of control-type classification, and when the exam asks for "the way to stop the incident first," the answer is a preventive control.

---

**Question 3.** Which combination correctly pairs the highest-weighted SCS-C03 domain with the topics it covers?

A) Infrastructure Security — network perimeter defense such as VPC, security groups, and WAF  
B) Identity and Access Management — IAM policy evaluation, federation, and least privilege  
C) Data Protection — organizational governance with Organizations SCPs  
D) Detection — testing incident response plans and validating breach scope and impact  

**Answer: B**  
Explanation: In SCS-C03 the highest-weighted domain is Identity and Access Management (20%), covering IAM policy evaluation, STS, Identity Center, federation, and least privilege. Infrastructure Security pairs correctly with its topic, but its weight is 18%; it is a trap for anyone remembering SCS-C02, where it was the top domain at 20%. SCPs belong to Security Foundations and Governance, and testing IR plans and validating scope and impact belong to Incident Response — so the remaining options mismatch the domain and the topic.

---

**Question 4.** When operating GuardDuty and Security Hub in a multi-account environment, which is the most appropriate AWS best practice?

A) Operate GuardDuty and Security Hub directly from the management account  
B) Have each workload account enable and manage GuardDuty independently  
C) Designate a separate Security Tooling account as the delegated administrator and aggregate across the whole organization  
D) Operate GuardDuty from the Log Archive account so that logs and detection live in one place  

**Answer: C**  
Explanation: GuardDuty, Security Hub, Macie, and Config all support the delegated administrator pattern, and delegating to a dedicated Security Tooling account is the best practice. The management account should handle only billing and organization management so that the blast radius stays small, and running detection per workload account fragments visibility. The Log Archive account is reserved for immutable log storage, so security operations tooling does not belong there.

---

**Question 5.** PII in an S3 bucket was leaked externally. The investigation found that the bucket had been set to public-read. From the perspective of the shared responsibility model, which judgment is most accurate?

A) The S3 infrastructure was breached, so this is AWS's responsibility  
B) Bucket access control settings are the customer's responsibility, so this is a customer misconfiguration  
C) This is a data durability problem, so AWS and the customer share responsibility equally  
D) S3 is SaaS, so all data protection responsibility lies with AWS  

**Answer: B**  
Explanation: Durability, availability, and physical infrastructure for S3 are AWS's responsibility, but access control settings such as bucket policies, ACLs, and Block Public Access are 100% the customer's. Even for S3, which has strong SaaS characteristics, responsibility for data classification and access control never transfers to AWS. To prevent exactly this kind of incident, AWS evolved toward enforcing Block Public Access as a default control.

---
