# Day 5 - Week 1 Consolidated Review: Revisiting the First Week Through Operator Scenarios

The picture we built over the week had four parts: **AWS's physical map (Region / AZ / Edge)**, **who is responsible for what on top of it (Shared Responsibility)**, **who gets to allow whom to do what (IAM's 6-step evaluation algorithm)**, and **how to bind dozens or hundreds of accounts under one governance model (Organizations / SCP / Identity Center)**. These four pictures are the backdrop for every SOA-C02 scenario. When you're solving an exam question and the answer isn't immediately obvious, build the habit of first classifying "which of the four is this scenario asking about" — the correct answer will surface naturally from the options.

This week's content needs to be settled in your head for next week's CloudWatch, Config, and CloudTrail to layer naturally on top. When an alarm fires, the operator's daily work is tracing backwards: "in which region and which AZ, who (which IAM principal), through which permission evaluation path, in which account, within which SCP/boundary limits" did the work happen. The infrastructure that makes that trace possible was this week's subject.

## The Operator's Mental Map: One Page, One More Look

```
┌─────────────────────────────────────────────────────────┐
│         [AWS Global Infrastructure]                     │
│  Region > AZ > Edge / Local Zones / Outposts            │
│  - Control plane often tied to us-east-1 (IAM/R53/CF)   │
│  - AZ is the minimum isolation unit. NAT GW / EBS /     │
│    RDS Standby are per-AZ                               │
│  - Only ZoneId (apne2-az1) matches across accounts;     │
│    ZoneName is shuffled                                 │
├─────────────────────────────────────────────────────────┤
│         [Shared Responsibility]                         │
│  AWS: Security OF the Cloud                             │
│  Customer: Security IN the Cloud                        │
│  - Abstraction level↑ ⇒ responsibility line↑            │
│    (EC2 < ECS < Fargate < Lambda)                       │
│  - Data classification, IAM, and encryption key policy  │
│    are always the customer's                            │
├─────────────────────────────────────────────────────────┤
│         [IAM Evaluation 6-step]                         │
│  Explicit Deny → Org SCP → Resource Policy →            │
│   Identity Policy → Permission Boundary →               │
│   Session Policy → final Allow/Deny                     │
│  - A single Deny anywhere blocks immediately            │
│  - Cross-account requires Allow on both sides           │
├─────────────────────────────────────────────────────────┤
│         [Multi-Account Governance]                      │
│  Organizations / SCP / RAM / Control Tower / IdC        │
│  - SCPs don't apply to the Management Account           │
│    (don't put workloads there)                          │
│  - Centralize security services via Delegated Admin     │
│  - Identity Center + IdP federation = ops without       │
│    IAM Users                                            │
└─────────────────────────────────────────────────────────┘
```

The operator's daily debugging flow runs over this map in the following order.

1. **Catch the symptom**: CloudWatch alarm / Health Dashboard / user complaints
2. **Narrow down the cause candidates**: write API events from the previous 5-30 minutes in CloudTrail
3. **Suspect a permission problem**: IAM Policy Simulator + Access Analyzer + read the errorMessage carefully
4. **Suspect an infrastructure problem**: AWS Health (SHD/PHD) + Service Quotas
5. **Suspect an account-level security violation**: Config + GuardDuty + Security Hub findings
6. **Post-recovery follow-up**: TAM/support case / RCA documentation / strengthen Config rules

With this flow in your head, one line saying "there's an outage" automatically determines "which console screen to open within 5 minutes." Exam questions like "which tool do you check first?" are almost always answered from this table.

## Pitfall Collection: 6 Mistakes Operators Keep Repeating

Synthesizing the week's content, these six are the patterns where operators repeat the same incidents.

1. **Putting workloads in the Management Account**: SCPs don't apply to this account, so running EC2/RDS there leaves you defenseless if the root key leaks. The AWS Landing Zone standard: management = billing and org management only; workloads go in member accounts in separate OUs.
2. **A single-AZ NAT GW / Single-AZ RDS / NLB registered in a single AZ**: You try to save money, and when one AZ wobbles, everything goes down. A NAT GW is an AZ-scoped resource with no automatic failover.
3. **IAM Users + permanently issued access keys**: Missed rotation and missed offboarding are the #1 cause of incidents. Capital One in 2019 and Uber in 2022 were both failures of credential management. The answer is Identity Center + IdP federation.
4. **Ignoring the us-east-1 dependency**: Writes to IAM, Route 53 public zones, CloudFront, and Organizations depend on the us-east-1 control plane. Feel safe because "it's a global service" and you get swept up in an outage like December 2021.
5. **Not explicitly disabling IMDSv1**: Even for new EC2 instances, unless you enforce it via launch templates / SCPs / Config, an operator can accidentally launch v1. It's the entry point for SSRF attacks.
6. **Managing CloudTrail / Config individually in member accounts**: The self-referential problem of having to check who disabled it — using that same account's trail. The answer is Organization Trail + Log Archive Account + S3 Object Lock.

Avoiding all six of these is the operator's starting line. The exam asks about these pitfalls, transformed into scenarios.

## The Operator's One-Line Command Card: One More Pass Before the Exam

Commands you've actually typed once in the CLI — not just clicked in the console — are the ones you remember in the exam room. Here's the Week 1 core CLI collected onto one card.

```bash
# 1) Check ZoneId — the starting point for cross-account cost optimization
aws ec2 describe-availability-zones --region ap-northeast-2 \
  --query 'AvailabilityZones[*].[ZoneName,ZoneId,State]' --output table

# 2) Health events — both in-progress and upcoming
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming" --region us-east-1
aws health describe-events \
  --filter "eventStatusCodes=open,upcoming" --region us-west-2

# 3) IAM recent usage — find access keys unused for 90+ days
aws iam generate-credential-report
aws iam get-credential-report --query 'Content' --output text \
  | base64 --decode

# 4) IAM Access Analyzer — check externally exposed resources
aws accessanalyzer list-analyzers
aws accessanalyzer list-findings --analyzer-arn arn:aws:access-analyzer:...

# 5) View the Organizations structure
aws organizations list-roots
aws organizations list-organizational-units-for-parent --parent-id r-xxxx
aws organizations list-accounts-for-parent --parent-id ou-xxxx-yyyy

# 6) Check SCP effects — all policies applied to a specific account
aws organizations list-policies-for-target \
  --target-id 123456789012 --filter SERVICE_CONTROL_POLICY

# 7) Query Identity Center Permission Set assignments
aws sso-admin list-permission-sets --instance-arn arn:aws:sso:::instance/...

# 8) Policy Simulator — validate in advance
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111:user/alice \
  --action-names s3:PutObject \
  --resource-arns arn:aws:s3:::my-bucket/key
```

The most frequently forgotten item here is that `generate-credential-report` → `get-credential-report` is a two-step process. The first call is an asynchronous generation trigger; the second call is the actual download.

> 🔍 **Going deeper**: `simulate-principal-policy` evaluates SCPs, Permission Boundaries, and Resource Policies all at once, finding the cause of permission denials in real operations. The friendliest case is when CloudTrail's `errorMessage` prints "explicit deny from SCP"; when it doesn't, you have to narrow it down step by step with the simulator. The simulator can also mimic conditions like MFA and SourceIp via `--context-entries`, so it's also used for debugging IP allowlist conditions.

> 💡 **Memorization tip**: The operator's "first-pass permission diagnosis 3-hit combo" is ① CloudTrail's `errorCode` / `errorMessage` → ② `simulate-principal-policy` → ③ Access Analyzer "Reachable from outside." With this order fixed in your head, you can solve any IAM scenario question.

## Week 1 Self-Assessment Checklist

You should be able to answer "yes" to all 11 of the following questions before moving on to Week 2 comfortably.

- [ ] Can you explain the difference between Region / AZ / Edge, and the fact that a NAT GW is an AZ-scoped resource?
- [ ] Can you explain why the us-east-1 control plane dependency affects even IAM, Route 53, and CloudFront?
- [ ] Do you know the difference between ZoneName and ZoneId, and the matching method for reducing cross-AZ data transfer costs between two accounts?
- [ ] Can you explain the differences in the responsibility boundary for EC2 / ECS Fargate / Lambda / S3 under the shared responsibility model?
- [ ] Can you recall, in order, the 6-step IAM policy evaluation algorithm (Deny→SCP→Resource→Identity→Boundary→Session)?
- [ ] Can you explain, in one line each, the differences between SCPs, Permission Boundaries, and Session Policies?
- [ ] Do you know which IAM Role internally realizes an Identity Center Permission Set?
- [ ] Do you know in which regions to place AWS Health Dashboard and EventBridge `aws.health` rules?
- [ ] Can you explain the PCI-DSS value of the Organization Trail + Log Archive Account + S3 Object Lock pattern?
- [ ] Can you explain how the quadruple defense of IMDSv2 + hop limit 1 + Config rule + SCP blocks SSRF?
- [ ] Do you know the standard pattern of delegating GuardDuty, Security Hub, Inspector, and Macie to a security account via Delegated Administrator?

---

## 📝 Practice Questions (12 Scenarios)

**Question 1.** A game company serving Korean users operates in ap-northeast-2. The operations team wants to know in advance and prepare for the fact that during a us-east-1 outage, "console login remains possible, but writes such as creating new IAM users or changing Route 53 records may not be." What is the most appropriate additional measure on the SDK/CLI side?

A) Explicitly pin the STS global endpoint (sts.amazonaws.com) and disable regional endpoints in all SDK configurations to unify on a single entry point
B) Enforce the STS regional endpoint (sts.ap-northeast-2.amazonaws.com), and document in the runbook that global writes like IAM and Route 53 depend on us-east-1
C) Block the us-east-1 endpoint with Route 53 health checks and automatically shift traffic to an ap-northeast-2 secondary record with a failover routing policy
D) Create a new IAM Identity Center instance in ap-northeast-2 and move the home Region so all us-east-1 control plane dependencies of IAM and Route 53 disappear

**Answer: B**
Explanation: The control planes of IAM, Route 53 public zones, CloudFront, and Organizations are structurally in us-east-1. What the operations team can do is know that fact and (a) explicitly set the STS regional endpoint (`sts.ap-northeast-2.amazonaws.com`) so that data-plane operations like credential issuance are handled in ap-northeast-2, and (b) document in runbooks and DR scenarios that global writes depend on us-east-1. The STS global endpoint defaults to a us-east-1 alias, so it is actually tied to a us-east-1 outage. An Identity Center instance's region can be chosen, but that doesn't completely remove the us-east-1 dependency.

---

**Question 2.** An operations team running a web service on an ASG lost all traffic when AZ-a failed. Root-cause analysis showed the NAT GW existed only in AZ-a, and the private subnet route tables of AZ-b and AZ-c all pointed at the AZ-a NAT GW. What's the answer?

A) Move the NAT GW from AZ-a to AZ-b, and point all AZs' private subnet routes at the new AZ-b NAT GW to keep a single management point
B) Create one NAT GW per AZ, and make each private subnet's route table point to the NAT GW in its own AZ
C) Replace all NAT GWs with NAT Instances managed by an ASG, and handle AZ failure with a single instance's self-heal
D) Remove the NAT GW and attach the Internet Gateway directly to the private subnet route tables to simplify the outbound path

**Answer: B**
Explanation: A NAT GW is an AZ-scoped resource with no automatic failover. If you tie other AZs' private subnet routes to a single-AZ NAT GW, everything goes down when that AZ wobbles. The canonical answer is **one NAT GW per AZ + each private subnet's route table pointing to its own AZ's NAT GW**. If cost is a concern, options include NAT Instances (ASG self-heal) or simplified NAT instances like fck-nat to cut the \$0.045/GB processing fee, but they come with operational burden. An Internet Gateway can't attach to a private subnet (if you attach one, that subnet is no longer private).

---

**Question 3.** An EC2 instance attempts a PUT to an S3 bucket encrypted with SSE-KMS using a KMS CMK and gets AccessDenied. The IAM Policy has `s3:PutObject Allow`, and the Bucket Policy also has an Allow. In CloudTrail, both an `s3.amazonaws.com` event and a `kms.amazonaws.com` event are logged as failures. The most likely cause is?

A) An Organization SCP explicitly Denies `s3:PutObject`, neutralizing the Allows in the IAM and Bucket Policies
B) The KMS Key Policy doesn't allow the EC2 Role for `kms:GenerateDataKey` and `kms:Decrypt`
C) The S3 bucket is in a different region, so the cross-region PUT is blocked, and the KMS CMK is region-bound so it fails together
D) IMDSv2 is disabled and the hop limit dropped to 0, so the instance can't obtain temporary credentials

**Answer: B**
Explanation: A PUT of an SSE-KMS object requires `kms:GenerateDataKey` (write) / a GET requires `kms:Decrypt` (read), and both the IAM Policy AND the KMS Key Policy must allow them. KMS follows a "deny by default + explicit allow in the Key Policy" model, so if only the IAM Policy exists and the principal isn't in the Key Policy, the request is denied. Both the `kms.amazonaws.com` event and the `s3.amazonaws.com` event failing simultaneously in CloudTrail is the classic symptom. It's one of the traps operators stumble over most often; the answer is to explicitly add the EC2 Role to the KMS Key Policy.

---

**Question 4.** A company operates 60 AWS accounts with 200 employees. Employees join and leave every week, and the security team is exhausted by access key rotation and missed offboarding. The most efficient change is?

A) Issue IAM User access keys to all employees, with EventBridge schedules + Lambda automatically rotating every 90 days and revoking inactive keys
B) Adopt IAM Identity Center + external IdP (Azure AD / Okta) federation + Permission Set-based permission management
C) Put per-department IAM Users in one master account and configure hub-and-spoke access to the other 59 accounts with Cross-Account Roles + sts:AssumeRole
D) Store all employees' access keys in Secrets Manager, rotate daily with a rotation Lambda, and audit usage history with CloudTrail

**Answer: B**
Explanation: With Identity Center, users are managed once in the IdP, and permissions are granted per account/OU via Permission Sets. When an employee leaves, one deactivation in the IdP cuts off access to all accounts. Access keys themselves nearly disappear (only temporary credentials are used). Identity Center has become so standard that since 2024, AWS shows a console warning when you create an IAM User. C is operable, but permanent IAM User credentials remain in the master account. A and D automate rotation, but the permanent access keys themselves never go away, so the fundamental risks of leakage and missed offboarding are not removed.

---

**Question 5.** A company runs 50 accounts under Organizations and wants to prevent all accounts from using any region other than `us-east-1` and `ap-northeast-2`. The goal is data sovereignty compliance. The most efficient method is?

A) Add an `aws:RequestedRegion` NotResource Deny condition to every IAM Policy in every account, and run a review process forcing the same condition on new policies
B) Apply an SCP at the root OU, with an `aws:RequestedRegion` Condition denying everything outside the allowed regions + exempting global services like IAM and Route 53 via NotAction
C) Detect non-compliant resources with the Config Rule `region-restriction`, plus SNS alerts and SSM Automation to automatically terminate violating resources
D) Deploy a region-deny IAM Policy to all accounts at once with CloudFormation StackSets, and detect changes with drift detection

**Answer: B**
Explanation: An SCP is an account/OU-level guardrail applied to all accounts at once. Use the `aws:RequestedRegion` condition to Deny everything outside the allowed regions. Global services like IAM / Route 53 / CloudFront / Organizations route internally to us-east-1, so they must be exempted via NotAction (otherwise even creating an IAM User gets blocked). Config can only detect, not block.

---

**Question 6.** An operator wants to delegate IAM Role creation to developers, while enforcing that those Roles' effective permissions cannot exceed the company's standard policy scope. Which combination is correct?

A) Grant developers AdministratorAccess, but detect excessive permission use after the fact with CloudTrail + Config and alert
B) Grant developers `iam:CreateRole` and `iam:AttachRolePolicy` Allow + an `iam:PermissionsBoundary` Condition enforcing the company's standard boundary
C) Apply an SCP to the developer accounts' OU to cap the effective permissions of developer-created IAM Roles at the company standard
D) Allow Role creation only through Service Catalog products, and Deny all `iam:CreateRole` outside approved permission templates

**Answer: B**
Explanation: This is the Permission Boundary pattern. The effective permission of a developer-created Role = the Role's policies ∩ the boundary. Put an `iam:PermissionsBoundary` condition on the delegation IAM Policy so that CreateRole itself fails if the boundary isn't attached. An SCP applies to the entire account, so it's too broad for constraining only developers. Service Catalog is a possible option, but forcing all everyday Role creation through the catalog slows development.

---

**Question 7.** A company wants to collect CloudTrail logs from 50 member accounts in one place and prevent operators from modifying or deleting those logs. The goal is meeting PCI-DSS requirement 10.5.5. The standard pattern is?

A) Create individual trails per member account, gather logs into a central S3 bucket via cross-account IAM permissions, then restrict deletion with a bucket policy
B) Organization Trail + an isolated S3 bucket in the Log Archive Account + S3 Object Lock (Compliance mode, WORM)
C) CloudWatch Logs Subscription Filters + a Cross-Account Destination to aggregate all accounts' logs in real time into a central Log Group
D) Back up the trail's S3 bucket daily with AWS Backup, keep it in a separate vault, and restore if tampered

**Answer: B**
Explanation: The Organization Trail auto-enables in all member accounts (including new ones), loads logs into an isolated S3 bucket in the Log Archive Account, and S3 Object Lock Compliance mode makes them tamper-proof even for operators. It's the standard AWS Landing Zone / Control Tower pattern and precisely satisfies PCI-DSS 10.5.5 ("ensure audit trail integrity"). CloudWatch Logs Subscriptions are good for real-time analysis but fall short of S3 Object Lock for tamper-proofing.

---

**Question 8.** An operations team wants to prevent metadata SSRF attacks against EC2 instances. What is the strongest quadruple-defense operational standard?

A) Block the 169.254.169.254/32 destination with Security Group outbound rules, applied uniformly to all instances
B) Enforce IMDSv2 + hop limit 1 + block IMDSv1 instance creation with an SCP + detect and auto-remediate existing non-compliant instances with the Config rule `ec2-imdsv2-check`
C) Don't attach an IAM instance profile to instances, and inject credentials into applications separately via Secrets Manager
D) Explicitly Deny 169.254.169.254 metadata IP traffic with subnet NACL inbound/outbound rules

**Answer: B**
Explanation: 169.254.169.254 is a link-local address, so SGs and NACLs can't block it (it's handled at the hypervisor level, not the routing table). The quadruple defense = ① enforce IMDSv2 (PUT session tokens), ② hop limit 1 (metadata can't leak outside containers), ③ SCP Denying `RunInstances` unless `MetadataOptions.HttpTokens=required` (block new creations), ④ Config rule to detect and auto-remediate existing instances. With C, not attaching an IAM role blocks metadata credential exposure, but injecting credentials via Secrets Manager is a heavy operational burden, and other internal endpoints SSRF could target remain — it's only a partial defense.

---

**Question 9.** An operator wants to see the EC2 instance inventory of 100 accounts at once. The security team wants OS patch status, tags, and instance types. The most efficient method is?

A) Log into each account sequentially via SSO, export the EC2 console list to CSV, and manually merge in a spreadsheet
B) Resource Explorer multi-account search, or Systems Manager Inventory + Resource Data Sync aggregating into S3 and querying with Athena
C) A central-account Lambda iterates over 100 accounts daily via cross-account roles, calls describe-instances, and loads results into DynamoDB
D) Deploy an EC2 metadata collection script to all accounts with CloudFormation StackSets and centrally aggregate results via SNS

**Answer: B**
Explanation: Enabling Resource Explorer at the organization level lets you query all accounts' resources in one search. To also see OS patches and software inventory, use SSM Inventory + Resource Data Sync to gather all accounts' data into one S3 bucket, then analyze with Athena/QuickSight. Lambda iteration is possible but carries operational burden and throttling problems. Resource Explorer, launched in 2022, is AWS's official answer.

---

**Question 10.** An operations team created an EventBridge `aws.health` rule to receive us-east-1 outage alerts at 3 AM. The standard pattern for receiving all events without gaps is?

A) Create just one `aws.health` rule in us-east-1 and rely on all global service events flowing into us-east-1
B) Create identical rules in both us-east-1 and us-west-2, routing to the same SNS topic (remove duplicate alerts with a dedupe key)
C) Create identical `aws.health` rules in every enabled region, including regions with no workloads, to reduce the chance of gaps to zero
D) Turn on Organizational Health View in the management account and create the rule once; events from all regions and accounts route automatically

**Answer: B**
Explanation: The AWS Health API runs active-active in two places — us-east-1 and us-west-2 — with automatic failover. You must create EventBridge `aws.health` source rules in both regions so nothing is missed when one side is down. Turning on Organizational Health View lets the management account receive all accounts' events too, and creating rules in member accounts as well is standard.

---

**Question 11.** A security operator must separate start/stop permissions for 200 EC2 instances across 5 departments. There are 100 employees and 200 EC2 instances; employees join and leave weekly and department transfers are frequent. The most scalable approach is?

A) Create 5 department IAM Groups and write 200 separate IAM Policies specifying each instance's ARN, mapped to the Groups
B) One ABAC policy that Allows `ec2:StartInstances` and `ec2:StopInstances` only when the employee's IdC `PrincipalTag/Department` matches the EC2's `ResourceTag/Department`
C) Create 5 shared departmental IAM Users, share the access keys within each department, and just reset the password on department transfers
D) Wrap departmental EC2 launch/start/stop in Service Catalog products and control permissions with an approval workflow

**Answer: B**
Explanation: The ABAC (Attribute-Based Access Control) pattern. One policy handles the N×M permission combinations. When an employee's department changes in the IdP, the SAML attribute refreshes automatically and their AWS permissions change automatically too. It's the implementation of the NIST SP 800-162 ABAC standard. Handling this with RBAC means Groups multiply per department/role combination — policy explosion. Shared IAM Users are the gateway to security incidents.

---

**Question 12.** A security operator wants to see the GuardDuty findings, Security Hub scores, Inspector vulnerabilities, and Macie data classification results of 100 accounts in one place. The standard pattern is?

A) Log into each account's console one by one via SSO, check the 4 services' findings, and manually compile a weekly report
B) Designate a Security Account as the Delegated Administrator for each of GuardDuty / Security Hub / Inspector / Macie, with member accounts auto-enrolled
C) A central Lambda collects each account's findings hourly via cross-account roles, loads them into a separate RDS/DynamoDB, and serves a dashboard
D) Send findings from each account's EventBridge rules to a central SNS, then analyze them in a self-built SIEM (OpenSearch)

**Answer: B**
Explanation: The Delegated Administrator pattern is the standard centralization method for security services like GuardDuty, Security Hub, Inspector, Macie, and Detective. It offloads the management account while one security account manages the entire organization. All security services have supported this pattern since 2020, and it's the standard configuration of AWS Landing Zone / Control Tower. Sending to an external SIEM (Splunk/Datadog) via EventBridge as in D is possible as a complementary pattern.

---

## Next Week Preview: Week 2 — The Internals of CloudWatch

Next week covers the internal structure of **CloudWatch Metrics and Logs**, the most frequently used operator tool. The starting point of every alarm and every debugging session.

- Day 1: The Metrics data model — Namespace, Dimension, Resolution (1s vs 60s), cardinality explosion
- Day 2: The Logs Group/Stream/Event structure and Subscription Filters, the VPC Flow Logs cost trap
- Day 3: The Logs Insights query language — the operator's SQL, a parse / filter / stats pattern library
- Day 4: Metric Filters, EMF in depth, Anomaly Detection's ML baselines
- Day 5: Week 2 review + 10 scenario questions

Once you finish Week 2, you'll develop the instinct to look at a pile of console graphs and judge within 5 seconds whether "our service is dying right now." That instinct is 50% of the SOA-C02 exam and of real-world operations.
