# Day 4 - AWS Organizations, SCP, Control Tower: The Skeleton of Multi-Account Governance

When you first start with AWS, one account is enough. But as the organization grows, the limits come quickly. When the ops team and dev team share an account, incidents spread; the security team's audit logs pile up next to regular workloads; and you can't tell who is spending how much. So at some point, splitting into multiple accounts is not a choice but an inevitability.

AWS prepared three tools for that inevitability: **Organizations** (grouping accounts, launched 2017), **SCP** (account-level permission ceilings), and **Control Tower** (multi-account automation + enforced best practices, launched 2019). How these three interlock is today's topic. One interesting bit of historical context: before Organizations existed, AWS only had a billing-consolidation feature called "Consolidated Billing," and multi-account permission governance effectively didn't exist. The direct impetus for building Organizations was enterprise customers relentlessly asking AWS's consulting teams "how do we manage dozens or hundreds of accounts?"

## The Real Reason to Split Accounts

An account is AWS's "strongest unit of security boundary." VPCs, IAM, costs, and quotas are all isolated per account. Even if permissions break in one account, it doesn't automatically spread to another. This is a stronger boundary than any IAM policy. By analogy: an IAM policy is "locking the door," a VPC is "separating rooms," and **an account is a different building altogether**.

| Separation Dimension | Single Account | Multi-Account |
|----------|-----------|----------|
| Blast radius | Permission mistake = affects everything | Only one account affected |
| Cost visibility | Estimated via tags | Clear at account level |
| Environment isolation | Only via IAM/VPC | Physically separated |
| Quota management | Shared (bottleneck) | Independent |
| Regulatory audits | Complex | Simple at account level |
| Partner delegation | Risky | Can delegate a whole account |

AWS's standard recommended pattern is the **AWS Multi-Account Strategy** (SRA, Security Reference Architecture), and the core is separating like this:

- **Management Account**: The Organizations root. Billing and SCP management only. No workloads.
- **Log Archive**: Centrally aggregates CloudTrail and Config logs from all accounts. WORM (Write-Once Read-Many) configuration.
- **Audit/Security**: Delegated administrator for GuardDuty, Security Hub, Macie.
- **Production / Staging / Dev**: Accounts per environment.
- **Sandbox**: Free experimentation accounts for developers. Cost and region limits via SCP.

> 📚 **Case study**: In 2019, a fintech startup operating in a single account had a developer accidentally delete the prod RDS. The same IAM Role held permissions in both dev and prod. Had the accounts been separated, dev-account credentials couldn't even have touched the prod RDS. After this incident, the company adopted per-environment account separation as its standard. A similar case is the 2017 GitLab.com incident — a human error where an operator deleted the prod DB instead of the backup. On AWS, if prod and backup live in the same account, the same accident is possible with a single IAM mistake.

> 💡 **Related theory**: Separation design that minimizes blast radius is a core SRE principle, emphasized in the "Embracing Risk" chapter of the Google SRE Book. The concept originates from the military's "compartmentalization" (information compartmentalization) — bulkhead design so that a breach in one part doesn't spread through the whole system. AWS account separation is the strongest implementation of this in the cloud domain.

## The Structure of Organizations

Organizations is a service that groups multiple AWS accounts into a tree structure.

```
[ Management Account (root) ]
        │
        ├── OU: Security
        │     ├── Account: Log Archive
        │     └── Account: Audit
        ├── OU: Workloads
        │     ├── OU: Prod
        │     │     ├── Account: prod-payments
        │     │     └── Account: prod-web
        │     └── OU: NonProd
        │           ├── Account: dev
        │           └── Account: staging
        └── OU: Sandbox
              └── Account: dev-individual-1
```

An OU (Organizational Unit) is a folder for accounts. Maximum tree depth is 5 levels. An account is subject to SCPs wherever it sits in the OU tree (a parent OU's SCPs are inherited by all children). Move an account's position in the tree and the applicable SCP set changes automatically. This property — "governance changes just by moving OUs" — is an AWS strength absent from other clouds' IAM.

> 💡 **Related theory**: Applying policies over a tree structure is nearly identical to Microsoft Active Directory's OU/Group Policy model. Just as GPOs in AD are inherited by OUs and combined by precedence (LSDOU: Local → Site → Domain → OU), AWS SCPs are inherited from parent OUs to children and combined with a deny-overrides algorithm. The "centralized logs + distributed workloads" pattern recommended by NIST SP 800-92 (Log Management) and SP 800-137 (Continuous Monitoring) is implemented precisely on this structure.

> 🔍 **Going deeper**: GCP's Folder/Organization hierarchy is a similar tree structure and supports IAM policy inheritance, but GCP is a union model where a child's stronger permission "adds" to the parent, whereas AWS SCP is an "intersection + deny override" model where a child can never become stronger. Same tree structure, opposite semantics. Azure Management Groups follow a deny-override pattern closer to AWS.

## SCP: The Permission Ceiling for an Entire Account

An SCP (Service Control Policy) has the same syntax as an IAM policy but a different scope. It sets the **permission ceiling at the account or OU level**. An SCP doesn't "grant" permissions — it only "sets the limit."

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DenyRegionsExceptApproved",
    "Effect": "Deny",
    "Action": "*",
    "Resource": "*",
    "Condition": {
      "StringNotEquals": {
        "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"]
      }
    }
  }]
}
```

This SCP means "usage of any region other than ap-northeast-2 and us-east-1 is forbidden." Even if a developer accidentally tries to launch an instance in ap-southeast-1, the SCP blocks it. No matter how much an IAM policy Allows, if the SCP Denies, it's over.

| SCP Pattern | Effect |
|---------|------|
| Region restriction | Protects data sovereignty and costs |
| Blocking root account APIs | Forbids risky operations (e.g., account closure, ELBv1) |
| Blocking specific services | Removes the cost/attack surface of unused services (e.g., SageMaker, IoT) |
| Tag enforcement | Deny when required tags are missing via `aws:TagKeys` |
| MFA enforcement | Deny mutating operations when `aws:MultiFactorAuthPresent: false` |
| Preventing CloudTrail disablement | Block `cloudtrail:StopLogging` |
| Forbidding root credential usage | Block calls where `aws:PrincipalArn` is root |

> ⚠️ **Pitfall**: SCPs do not apply to the Management account itself. This shows up often on the exam. It's one of the core reasons the Management account must not hold workloads. Being an account unprotected by SCPs, it carries the largest blast radius in an incident. One more pitfall — SCPs also partially don't apply to service-linked roles (e.g., AWSServiceRoleForOrganizations).

> 🔍 **Going deeper**: SCPs are operated with two strategies. The **Deny List strategy** (keep the default FullAWSAccess and Deny only what's forbidden) and the **Allow List strategy** (remove FullAWSAccess and keep only explicit Allows). Allow List is stricter but requires adding explicit allowances every time a new service launches, creating heavy operational burden. Most organizations use Deny List + core guardrails. Also, SCPs have limits of "up to 5MB" and "up to 5 per entity," making policy consolidation and modular design important.

> 📚 **Case study**: In 2020, a media company operating without SCPs had a junior developer randomly launch instances in every region outside us-east-1, and within a month the bill hit 4x the usual. With an SCP region restriction, the incident would have been impossible in the first place. After the incident, the company standardized a triple guard: "region restriction + monthly Sandbox account limits + Budgets alarms."

## Control Tower: Automating the Landing Zone

Control Tower is a service that sets up everything we saw above automatically at once. Launched in 2019, it automatically creates the following:

- The Organizations structure (Management + Security OU + Sandbox OU)
- Automatic creation of Log Archive and Audit accounts
- Centralized CloudTrail (all accounts → Log Archive)
- Centralized Config (aggregated into the Audit account)
- IAM Identity Center integration
- Account Factory (self-service account provisioning)
- **Guardrails**: Predefined bundles of SCPs + Config Rules

Guardrails come in two kinds: **Preventive** (SCP-based, blocks in advance) and **Detective** (Config Rule-based, detects after the fact). For example:

| Guardrail | Kind | Effect |
|----------|------|------|
| Disallow public read access to S3 buckets | Detective | Config detects violations |
| Disallow changes to encryption configuration for S3 buckets | Preventive | Blocked via SCP |
| Enable encryption at rest for log archive | Preventive | Enforced |
| Require MFA for root | Detective | Non-compliance notification |
| Disallow deletion of CloudTrail logs | Preventive | Blocked via SCP |

Control Tower's value lies in "finishing in a few clicks the standard baseline that would take days to set up by hand." There's also a more sophisticated solution called Landing Zone Accelerator (LZA), an open-source offering that adds governance as CloudFormation code on top of Control Tower (official AWS Solutions).

> 💡 **Related theory**: The term "Landing Zone" itself was coined by AWS, meaning "the secure foundational environment that must be in place before a customer puts workloads on it." The analogy is that a runway must be ready before a plane can land on it. It's conceptually the same as ITIL's "Foundation Service Layer" and CIS Benchmark's "Baseline Configuration."

## Account Factory and Service Catalog

Control Tower's Account Factory creates new AWS accounts from a standard template. It's exposed internally as a Service Catalog product, so dev teams can request accounts self-service. Each account is automatically placed in an OU, connected to IAM Identity Center permissions, and given baseline guardrails.

> 📚 **Case study**: In 2021, a Capital One affiliate received a request to "provision 50 accounts per week," and automated it in 30 minutes by adopting Control Tower Account Factory. Previously, operators had to configure IAM Identity Center permission sets, CloudTrail, Config, and GuardDuty one by one, taking 2-3 hours per account. After automation, the account provisioning SLA dropped from "1 week" to "10 minutes," and the ops team members shifted to other security work.

> 🔍 **Going deeper**: An extension called Account Factory for Terraform (AFT) launched in 2021. It makes Control Tower's Account Factory callable as a Terraform module, tying account creation and deletion into the PR review flow, GitOps-style. "Controlling account provisioning through code review" is becoming the standard pattern in large organizations.

## RAM: Resource Access Manager

**AWS RAM** is what you use to share resources among a company's own accounts within Organizations. It shares VPC subnets, Transit Gateways, Route 53 Resolver Rules, License Manager configurations, and more with other accounts.

The most common pattern is the **Networking account + Workload account** split. Create the VPC and Transit Gateway in the Networking account and share subnets with Workload accounts via RAM, and every workload account uses the same network topology while the workloads themselves stay isolated. It's far simpler than cross-account VPC peering.

| Shareable via RAM | Main Use |
|------------------|---------|
| VPC Subnet | Centralized network management |
| Transit Gateway | Multi-account hub-and-spoke |
| Route 53 Resolver Rules | Multi-account DNS integration |
| License Manager | License sharing |
| Aurora cluster | DB sharing (rare) |
| Outposts | Sharing on-premises hardware |

> 🔍 **Going deeper**: An account that receives a VPC subnet via RAM can create ENIs/EC2 directly in that subnet, but cannot touch the subnet's own routing or NACLs. That means network design and workload operations can be cleanly separated. This pattern is the heart of the "Networking account" concept. Note, however, that the cost of ENIs created in the shared VPC is paid by the ENI-owning account, while infrastructure costs like NAT Gateway and Transit Gateway fall to the Networking account — fail to agree on this cost split in advance and inter-departmental accounting disputes arise.

## The Real Benefits of Consolidated Billing

Joining Organizations automatically enables Consolidated Billing. The effect is not mere invoice consolidation.

1. **Volume discounts**: Usage-based services like S3 and CloudFront aggregate usage across all accounts, entering larger discount tiers.
2. **Reserved Instance/Savings Plan sharing**: RIs/SPs bought in one account automatically apply to EC2 in other accounts (depending on settings).
3. **Consolidated Cost & Usage Report**: Analyze all accounts' costs in one place.
4. **Free tier aggregation**: A new account's 12-month free tier merges into the parent account's limits (caution — free tiers don't stack).

> 💡 **Related theory**: Consolidated Billing decouples the cloud's "shared resource pool" model from IAM boundaries. Accounts of the same company are fully isolated in IAM but pooled for costs, enjoying economies of scale. This is a variant of the "resource pooling" in the NIST cloud definition (SP 800-145). Even more interesting is the RI/SP sharing policy — turning off "RI Sharing" in the Organizations console makes each account operate RIs independently, used when you want to strongly separate "per-team cost accountability."

> ⚠️ **Pitfall**: Consolidated billing is automatic, but RI/SP sharing defaults to "shared" and turning it off requires separate configuration. Questions like "why is an RI our team didn't buy applying to our account's EC2 and messing up our accounting" come from here. On the exam it appears as questions asking "why one account receives another account's RI benefits."

## Automating Account Provisioning: CloudFormation StackSets

When you want to deploy the same infrastructure identically to every account in a multi-account environment, you use **CloudFormation StackSets**. A single command deploys the same stack to all OUs or selected accounts.

```bash
aws cloudformation create-stack-set \
  --stack-set-name baseline-security \
  --template-body file://template.yaml \
  --permission-model SERVICE_MANAGED \
  --auto-deployment Enabled=true,RetainStacksOnAccountRemoval=false
```

`SERVICE_MANAGED` is the Organizations-integrated mode, deploying automatically when new accounts are added. With `auto-deployment` set to true, when an account enters the OU it's applied automatically. Internally, StackSets creates a separate Stack per account, but changes are managed in bulk at the StackSet level — this two-layer structure is confusing at first but powerful once familiar.

> 🔍 **Going deeper**: StackSets concurrency is configured via "Concurrency mode." `STRICT_FAILURE_TOLERANCE` halts everything when one account fails; `SOFT_FAILURE_TOLERANCE` tolerates failures up to a set ratio. When deploying to hundreds of accounts, use the latter so that transient failures in a few accounts (e.g., throttling) don't halt the whole run.

## Wrapping Up

Organizations + SCP + Control Tower are the 3 axes of multi-account governance. SCP is the permission ceiling, Control Tower the automated best practices, RAM the cross-account sharing, and StackSets the bulk deployment. With these five pictured in your head, multi-account scenario questions solve themselves almost automatically. On the exam, when keywords like "dozens to hundreds of accounts," "self-service account provisioning," "region restrictions," or "centralized log aggregation" appear, you must be able to quickly map the scenario language to which of these tools is the answer.

The next article is the Week 1 summary and review.

---

## 📝 연습 문제

**문제 1.** A company operates 30 AWS accounts. It wants to forbid use of the us-west-1 region across all accounts. What is the most appropriate method?

A) Add an IAM policy to each account
B) Region restriction via Organizations SCP
C) After-the-fact detection with CloudTrail
D) Don't create VPCs in us-west-1

**정답: B**
해설: For a multi-account permission ceiling, SCP is the answer. A Deny with the `aws:RequestedRegion` condition prevents every identity in every account from using that region. A carries the burden of syncing 30 times, C is after-the-fact rather than preventive, and D fails to block non-VPC services (e.g., DynamoDB, S3). Note that the Management account itself is exempt from SCPs — hence no workloads in Management. Additionally, global services (IAM, CloudFront, Route 53, etc.) evaluate `aws:RequestedRegion` as `us-east-1`, so exception handling is needed.

---

**문제 2.** When creating a new account with Control Tower, which is NOT automatically configured?

A) Centralized CloudTrail
B) Config activation
C) Per-user passwords
D) IAM Identity Center permission set assignment

**정답: C**
해설: Control Tower automates the infrastructure baseline, but user passwords are the IdP's domain. The external IdP (Okta, AD) connected to IAM Identity Center handles authentication. Everything else is applied automatically. Control Tower's value is that "best practices apply automatically without writing governance code every time" — implementing it yourself would take days to weeks.

---

**문제 3.** To share a VPC subnet created in the Networking account with other accounts, use?

A) VPC Peering
B) AWS RAM
C) Transit Gateway
D) PrivateLink

**정답: B**
해설: RAM is the standard for multi-account resource sharing. After subnet sharing, the receiving account can create ENIs/EC2 but can't touch routing or NACLs. Peering is just a connection between two VPCs, not sharing; TGW is a routing hub; PrivateLink is service endpoint exposure. The four look similar but solve entirely different problems: sharing (RAM), connecting (Peering), routing hub (TGW), service exposure (PrivateLink).

---

**문제 4.** Which is correct about the Management account?

A) SCPs apply automatically
B) SCPs don't apply, so it must not hold workloads
C) It can double as the Audit account
D) It's suitable for the Log Archive role

**정답: B**
해설: The Management account isn't subject to SCPs, so all permissions are unguarded. Put production workloads there and an incident has the largest blast radius. AWS's recommendation is an "empty" account doing only billing and Organizations management. Audit and Log Archive are separated into their own accounts. For the same reason, always put a hardware MFA on the Management account's root credentials, and for daily operations, go through IAM Identity Center and borrow Roles in other accounts.

---

**문제 5.** Which is NOT a benefit of Consolidated Billing?

A) Aggregated volume discounts
B) RI/Savings Plan sharing
C) Consolidated IAM permissions across accounts
D) A single invoice

**정답: C**
해설: Consolidated Billing merges only the cost domain; IAM remains completely isolated. That's the core safety net of multi-account. If IAM consolidation is needed, IAM Identity Center or cross-account Roles exist separately. The exam frequently asks about this asymmetry: "costs merge but permissions stay separated."

---

**문제 6.** To have the same security stack automatically deployed when a new account is added to an OU?

A) Lambda trigger
B) CloudFormation StackSets with auto-deployment
C) Document a manual deployment procedure
D) Run Terraform manually

**정답: B**
해설: StackSets with `SERVICE_MANAGED` + `auto-deployment Enabled`. When a new account enters the OU, the stack applies automatically. This is the standard pattern for maintaining the baseline without operator intervention in environments with hundreds of accounts. Terraform is possible too, but the AWS-native answer is StackSets. Hybrids combining CDK/Terraform with StackSets are also common — common baseline via StackSets, per-workload differences via IaC.

---

**문제 7.** What is the downside of the "Allow List" approach among SCP operating strategies?

A) It isn't safer
B) Explicit allowances must be added every time a new AWS service launches
C) It costs more
D) Multi-region becomes impossible

**정답: B**
해설: Allow List removes the default FullAWSAccess and keeps only explicit allows. It's the strictest, but since AWS launches dozens of new services every year, policy updates are needed each time, creating heavy operational burden. Most organizations use Deny List (default allow + Deny only what's dangerous) + core guardrails. Allow List is adopted only in environments with strict change control, like finance and the public sector.
