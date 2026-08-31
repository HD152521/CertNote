# Day 4 - AWS Organizations: How One Person Operates 100 Accounts

When a startup has 5 people, one AWS account is enough. At 50 employees, the need for environment separation (prod/dev/staging) plus cost separation plus permission separation typically brings you to 5-10 accounts. At 200 employees, adding per-team sandboxes, you start exceeding 50. At 1,000 employees, you easily pass 100. Amazon itself has internal teams holding tens of thousands of accounts ("every two-pizza team gets its own account" is an internal Amazon principle). At this point, the thing that collapses if the operator isn't watching is **governance**. Who can use which permissions, in which account, up to how much cost?

AWS Organizations is the nervous system of this multi-account operation. SCPs, consolidated billing, automated account creation, centralized logging, bulk policy application, central GuardDuty, central Config — it handles in one shot what an operator would otherwise do by hand a hundred times.

## The Structure of Organizations: Four Units

```
[Organization]                           ← the whole company (1 management account)
   │
   ├─ Root                               ← top-level container
   │   │
   │   ├─ OU: Security                   ← department/environment-level group
   │   │   ├─ Log Archive Account        ← individual account
   │   │   └─ Audit Account
   │   │
   │   ├─ OU: Production
   │   │   ├─ Prod-Web Account
   │   │   ├─ Prod-API Account
   │   │   └─ Prod-Data Account
   │   │
   │   ├─ OU: Development
   │   │   ├─ Dev Account
   │   │   └─ Staging Account
   │   │
   │   └─ OU: Sandbox
   │       ├─ Developer1 Account
   │       └─ Developer2 Account
```

| Unit | Meaning |
|------|------|
| **Organization** | The whole company. One management account is the root |
| **Root** | The Organization's top-level container. Parent of all OUs |
| **OU (Organizational Unit)** | A grouping of accounts. Can be nested up to 5 levels |
| **Account** | An actual AWS account. Identified by a 12-digit ID |

What operators confuse most often is **Management Account vs Member Account**. The management account is the account that created the organization, and it is **not subject to SCPs** (it can't restrict itself). That's why the canonical rule is to never put workloads in the management account. Only organization management, billing, and Identity Center.

> 📚 **Case study**: A Korean SaaS company ran prod EC2 and RDS in its management account. One day an IAM user access key leaked to GitHub, and an attacker compromised that account. Unlike the other accounts protected by SCPs, the management account was defenseless because SCPs don't apply to it. The result: thousands of dollars of Bitcoin mining plus a database leak. After the incident, the management account was rebuilt with zero workloads. This is the background for why, starting in 2024, AWS began showing a yellow console banner warning when you run workloads in the management account.

> ⚠️ **Pitfall**: On the exam, options like "apply an SCP to the management account to strengthen security" are traps. SCPs don't work on the management account. Another trap: the management account's root user has all permissions and can create access keys without MFA. This is the biggest single point of failure.

## Consolidated Billing: The Operator's First Cost-Control Tool

The most immediate value of Organizations is consolidated billing. All member accounts' charges roll up to the management account, and payment happens once. What matters more to operators are these four things:

1. **Combined volume discounts**: For services with usage-based tiered discounts like S3 and Data Transfer, usage across all accounts is aggregated for the discount. When scattered accounts combine, you enter larger discount tiers.
2. **Reserved Instance/Savings Plan sharing**: RIs/SPs bought in one account can be used by the whole organization (depending on settings). Operators can plan RI purchases based on total usage, not per-account usage.
3. **Organization-wide cost allocation tags**: Automate cost analysis with department/project-level tags.
4. **Centralized Cost Anomaly Detection**: Monitor cost anomalies across 100 accounts in one place.

> 🔍 **Going deeper**: RI/SP sharing is toggled in **Sharing Settings**. Matching happens only between OUs/accounts where it's enabled. The operator pattern is "concentrate RI purchases in the management account or one dedicated billing account, and share usage across all OUs." That way, matching EC2 in any account gets the RI discount. Conversely, to make a specific team use only its own RIs, turn off sharing and share only within that OU. Savings Plans are more flexible than RIs (independent of instance type, OS, and tenancy) but use the same sharing mechanism.

> 📚 **Case study**: A media company was buying EC2 RIs separately in 30 accounts and wasting \$50K per month (underutilization). Switching to the Organizations + RI sharing pattern of buy-in-one-place, use-everywhere raised the match rate from 85% → 99%, saving \$1M annually. This is the real value of consolidated billing.

## CloudTrail Organization Trail: All Accounts' Audit Logs at Once

If an operator enables CloudTrail one by one across 100 accounts, the odds of missing one are high. Create an **Organization Trail** once, and CloudTrail is automatically enabled in every member account plus consolidated into the designated S3 bucket.

```
[Management account]
   │
   ├─ Create Organization Trail
   │   - Scope: all OUs
   │   - Storage: S3 bucket in the Log Archive Account
   │   - Options: Management Events + Data Events + Insight Events
   │
   ▼
[All member accounts]
   - CloudTrail automatically enabled
   - Attempts to disable/delete can be blocked by SCP
   - Member account operators can only view the trail, not modify it
```

This pattern plus a separate Log Archive Account is the core of the **AWS-recommended multi-account pattern (Landing Zone)**.

> 💡 **Related theory**: The principle of log centralization is "tamper-proofing + retention + ease of analysis." The Log Archive Account pattern is the cloud implementation of the five principles specified in NIST SP 800-92 (the log management guide): completeness, integrity, confidentiality, availability, and traceability. So that the operator of a compromised account can't erase their own tracks, logs are stored in an S3 bucket in a separate account, and that bucket is protected with S3 Object Lock (WORM). It's also the standard implementation of PCI-DSS requirement 10.5.5 ("ensure log integrity").

> ⚠️ **Pitfall**: An Organization Trail "adds to" a member account's CloudTrail. A member account can still create its own separate trail (double cost). Operators either block member accounts' `cloudtrail:CreateTrail` via SCP or apply a policy allowing only the Organization Trail. Another pitfall: the Organization Trail's S3 bucket policy must grant PutObject to the service principal `cloudtrail.amazonaws.com` (it's auto-generated but can break if modified).

## AWS Control Tower: Automating the Landing Zone

**Control Tower** is what installs Organizations + SCPs + Trail + Identity Center + Account Factory all at once. When the operator clicks "start multi-account," the following happens automatically:

1. **Log Archive Account** auto-created + all CloudTrail/Config logs stored centrally
2. **Audit Account** auto-created + cross-account audit permissions granted
3. **~20 default SCP guardrails** auto-applied (classified as mandatory, strongly recommended, strongly recommended disabled, etc.)
4. **Account Factory**: creates new accounts in under 5 minutes with standard OU placement + default policies auto-applied
5. **AFT (Account Factory for Terraform)**: automates account creation and configuration GitOps-style

> 🔍 **Going deeper**: Control Tower guardrails come in two kinds. **Preventive** guardrails block actions via SCPs (e.g., "no disabling CloudTrail"). **Detective** guardrails detect non-compliance via Config Rules (e.g., "alert if an S3 bucket is public"). Some are both — within the `Strongly Recommended` category, some guard on both the SCP and Config sides. Since 2023, **Proactive controls** have also been added: hook-based guards that block at CloudFormation deployment time (CFN Guard).

## RAM (Resource Access Manager): Resource Sharing

Once you split accounts, resources like VPCs, Transit Gateways, licenses, and Route 53 Resolver Rules would also have to be created separately per account. Cost and management burden explode. **AWS RAM** shares these resources with other accounts.

Representative scenarios:
- **VPC subnet sharing**: One network account creates the VPC, and other workload accounts launch EC2/RDS in that VPC's subnets. **The VPC lives in one place, costs are borne by each account**.
- **Transit Gateway sharing**: One central TGW connects all accounts' VPCs hub-and-spoke.
- **License Manager sharing**: BYOL licenses shared across the whole organization.
- **Route 53 Resolver Rule sharing**: On-premises DNS forwarding rules used by all accounts.

```bash
# Share VPC subnets with RAM
aws ram create-resource-share \
  --name SharedSubnets \
  --resource-arns arn:aws:ec2:ap-northeast-2:111111111111:subnet/subnet-abc \
  --principals 222222222222 333333333333
```

> 📚 **Case study**: A game company was running a VPC + NAT GW in each of 50 accounts, with NAT GW costs alone exceeding \$3,000/month. Switching to the VPC sharing pattern and consolidating into 1 central VPC + 2 NAT GWs cut NAT costs by 90%. Operational burden dropped along with it. The trade-off: if the network account fails, every account is affected (blast radius). That's why teams usually run 2 network accounts active-active.

## Service Quotas and Usage Monitoring

An operational incident that frequently happens at the Organization level is **hitting service quotas**. EC2 vCPU limits, Lambda concurrent execution limits, S3 bucket count limits — invisible in normal times, then suddenly a wall during a traffic spike or new launch.

The operator pattern:
1. **Monitor utilization in the Service Quotas console**: current usage / quota ratio
2. **Set CloudWatch Alarms**: automatic alerts at 80% utilization (`AWS/Usage` namespace)
3. **Preemptive quota increase requests**: file 1-2 weeks before a traffic campaign
4. **Quota Templates**: automatically apply standard quotas when creating new accounts

> 🔍 **Going deeper**: Some quotas are **soft limits** (increased on request), but some are **hard limits** (no increase possible). EC2 vCPU is soft (typically 1,000 vCPUs, with increases requestable up to 100,000). The 200-subnets-per-VPC limit is usually hard (you must solve it with architecture). On the exam, the "vCPU limit reached" scenario is almost always a Service Quotas request. Quotas can be tracked with the CloudWatch metric `ResourceCount` (namespace `AWS/Usage`).

## The Standard Pattern for Multi-Account Operations: AWS Landing Zone

The **AWS-recommended account structure** when operating 100 accounts:

```
Management Account     ← Organizations, IAM Identity Center, Billing only
   │
   ├─ Security OU
   │   ├─ Log Archive Account     ← all CloudTrail/Config/access logs
   │   └─ Audit Account            ← Security Hub, GuardDuty consolidation
   │
   ├─ Infrastructure OU
   │   ├─ Network Account          ← central VPC, TGW, Route 53 Resolver
   │   └─ Shared Services Account  ← DNS, AD, monitoring
   │
   ├─ Workloads OU
   │   ├─ Production OU
   │   │   ├─ Prod-App1, Prod-App2 ...
   │   └─ Non-Production OU
   │       ├─ Dev, Staging, QA
   │
   ├─ Sandbox OU                   ← developers' personal experiments
   │
   └─ Deprecated OU                ← quarantine for accounts being decommissioned
```

Each OU gets the SCPs appropriate to it; the Sandbox OU carries strong constraints like "terminate on exceeding \$100/month." The Production OU gets region locks + change restrictions + mandatory backup policies. The Deprecated OU denies all write actions and triggers an automatic deletion workflow after 6 months.

> 💡 **Related theory**: This structure is the cloud implementation of **Zero Trust Architecture** (NIST SP 800-207). It extends "Never trust, always verify" to account boundaries — isolating so that a compromise of one account doesn't propagate to others. It's also the **Defense in Depth** principle — multi-layered defense with SCP + Config + GuardDuty + WAF + IAM and so on. It brings to the cloud the concept military security calls "concentric rings of defense" (US DoD CSEC, 2013).

## Integrated Services Enabled by Organizations

More than 30 services integrate with Organizations. Frequently used ones:

| Service | Integration effect |
|--------|-----------|
| **CloudTrail** | Organization Trail covers all accounts at once |
| **Config** | Aggregator consolidates compliance across all accounts |
| **GuardDuty** | Consolidate all accounts' findings via a Delegated Administrator |
| **Security Hub** | Aggregate security scores and findings across all accounts |
| **Inspector** | EC2/ECR vulnerability scanning across all accounts |
| **Macie** | S3 PII detection across all accounts |
| **Resource Access Manager** | Organization-level sharing without external invites |
| **Service Catalog** | Share portfolios with OUs |
| **Cost Anomaly Detection** | Central monitoring of cost anomalies |
| **Backup** | Organization-level backup policies |
| **Health** | Unified view of events across all accounts |

> 🔍 **Going deeper**: The core of all these integrations is the **Delegated Administrator** pattern. Designate a security account (usually the Audit Account) as the delegated admin for GuardDuty/Security Hub, and that account manages findings for all member accounts. It offloads the management account while keeping centralization. On the exam, the answer to "how do you view GuardDuty findings from 100 accounts in one place?" is almost always "designate the Security Account as Delegated Administrator."

## Wrapping Up

Today's key point: multi-account operation is the problem of keeping "security and cost consistent." SCPs are the security guardrail, consolidated billing is the cost guardrail, and the Organization Trail is the audit guardrail. Automate all of these with Control Tower, and standardize new accounts with Account Factory. Reduce cost and operational burden by sharing common resources with RAM, and centralize security service integration with Delegated Administrators.

Tomorrow we wrap up Week 1 with 10 scenario questions. A consolidated review of AWS infrastructure, IAM, and Organizations from the operator's perspective.

---

## 📝 Practice Questions

**Question 1.** Why shouldn't you put workloads in the Management Account?

A) The management account costs more
B) SCPs don't apply to the management account, so there are no security guardrails
C) The management account is read-only
D) The management account can only use a single region

**Answer: B**
Explanation: The management account is not affected by SCPs (it can't restrict itself). So if you put workloads there, the organization's security guardrails don't apply — dangerous. AWS recommends keeping only organization management, billing, and Identity Center in the management account, with workloads in member accounts. The Korean SaaS company incident illustrates this.

---

**Question 2.** An operator wants to collect CloudTrail logs from 100 accounts into a single S3 bucket. The most efficient method is?

A) Create a trail in each account and configure cross-account S3 permissions
B) Create an Organization Trail → automatically enabled in all member accounts
C) Create trails in each account with Lambda
D) Deploy a trail template with Service Catalog

**Answer: B**
Explanation: Created once, an Organization Trail is automatically enabled in all member accounts and stores logs in a consolidated S3 bucket. Even if a member account tries to disable it, that can be blocked with an SCP. A core component of the Landing Zone pattern.

---

**Question 3.** A company runs a VPC and NAT Gateway in each of 50 accounts and costs have exploded. To reduce the operational burden?

A) Merge all accounts' VPCs into one
B) Create the VPC in a single network account and share subnets via RAM
C) Consolidate with Direct Connect
D) Tie the VPCs together with Transit Gateway while keeping each NAT GW

**Answer: B**
Explanation: Share VPC subnets with other accounts via RAM (Resource Access Manager). Each account launches its own EC2/RDS in the shared subnets, but VPC and NAT GW costs stay in the single network account. Operations are centralized too. However, a network account failure has a larger blast radius, so consider an active-active configuration.

---

**Question 4.** You create 5 new accounts every week and want standard SCPs, CloudTrail, and IAM roles applied automatically. What do you use?

A) Manual CloudFormation deployment every time
B) Control Tower + Account Factory
C) Detect new accounts with Lambda and apply automatically
D) Deploy as a Service Catalog product

**Answer: B**
Explanation: Control Tower's Account Factory automatically applies standard OU placement + default SCPs + Trail/Config + Identity Center permissions when creating a new account. Standardized accounts in 5-10 minutes. GitOps-style automation is also possible with AFT (Account Factory for Terraform). On the exam, "new account standardization" is almost always Control Tower.

---

**Question 5.** Which of the following are NOT subject to SCPs? (Choose 2)

A) An IAM User in a Member Account
B) An IAM Role in a Member Account
C) An IAM User in the Management Account
D) A Service-Linked Role

**Answer: C, D**
Explanation: SCPs don't apply to the management account, and they also don't apply to service-linked roles (AWS-managed). They apply to all other IAM principals inside member accounts. These two exceptions come up often on the exam.

---

**Question 6.** A security operator wants to view and manage GuardDuty findings from 100 accounts in one place. The standard pattern is?

A) Log into each account's console one by one
B) Designate a Security Account as GuardDuty's Delegated Administrator
C) Collect each account's findings with Lambda
D) Send them to SNS via EventBridge

**Answer: B**
Explanation: The Delegated Administrator pattern is the standard centralization method for security services like GuardDuty, Security Hub, Inspector, and Macie. It offloads the management account while one security account manages the entire organization. All security services have supported this pattern since 2020.
