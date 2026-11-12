# Day 4 - Multi-Account Security Operations: Firewall Manager, Central Policy Distribution, Cost/Tag Governance, Security Baseline Automation

With the governance ceiling (SCP), baseline automation (Control Tower), and evidence collection (Audit Manager) in place, what remains is *day-to-day operations*. This is the operations plane: applying firewall policy consistently across hundreds of accounts, controlling tags and cost, and making security tooling switch on automatically every time a new account is born. The core of this day is **AWS Firewall Manager** (central firewall policy distribution), **tag and cost governance**, and **security baseline automation**.

One sentence runs through all three topics: **"Declare a policy once, and the system keeps converging to it."** If the SCP in Day 1 defined *what cannot be done*, today's tools keep in place *what must exist*. The former is a boundary, the latter is convergence. The first fork on the way to the right answer in an exam question is deciding "does this need to be blocked, or attached automatically?"

## AWS Firewall Manager: A Central Distributor of Firewall Policy

If you configure WAF, Shield, Security Groups, Network Firewall, and Route 53 Resolver DNS Firewall by hand in every account, omissions and drift are inevitable. **Firewall Manager (FMS)** is the service that lets you *define a firewall policy once and automatically deploy and enforce it* across the whole organization.

The prerequisites matter:
1. **AWS Organizations enabled** (with all features enabled) - FMS is an organization-based service
2. **Designate a Firewall Manager administrator account** - the management account designates a delegated administrator account (usually the Security account) as the FMS administrator
3. **AWS Config enabled** - FMS evaluates resources through Config to decide compliance
4. For WAF/Shield policies, the relevant service must be enabled beforehand (Shield Advanced requires a subscription)
5. **For Network Firewall and DNS Firewall policies, enable organization sharing in AWS RAM** - because rule groups created centrally must be shared with member accounts

There is also one regional constraint. **Shield Advanced policies and CloudFront-scope WAF policies must be created in `us-east-1`.** Most cases of "I created the FMS policy in the Seoul Region but it is not applied to CloudFront distributions" come down to exactly this.

```
                     [ Management Account ]
                       · Organizations / billing / OU structure
                       · Only "designates" the FMS administrator account
                                 │ associate-admin-account
                                 ▼
         ┌────────────────────────────────────────────┐
         │   Security (Audit) account = FMS administrator │
         │  · 1 each: WAF policy / SG audit policy / DNS policy │
         │  · Scope declared by OU · account · resource tag │
         │  · Single org-wide compliance dashboard + auto-remediation │
         └──────────────────┬─────────────────────────┘
                            │ deploy · continuous evaluation · remediation
      ┌─────────────────────┼─────────────────────┐
      ▼                     ▼                     ▼
   OU: Prod             OU: NonProd           OU: Sandbox
   ├ Account A (ALB×12)  ├ Account D           └ (excluded from scope)
   ├ Account B (CF×3)    └ Account E
   └ Account C (API GW×5)
      │
      └─▶ New ALB created → FMS detects → common Web ACL attached automatically (zero human intervention)

Prerequisite: Config must be on in every member account and Region for evaluation and remediation to work
```

The policy types FMS can deploy and enforce:
- **WAF policy**: Automatically attaches a common Web ACL (including managed rule groups) to ALB/CloudFront/API Gateway and more.
- **Shield Advanced policy**: Applies Shield Advanced in bulk to protected resources.
- **Security Group policy**: A common SG, or an *audit-type* SG policy (detects and remediates overly open 0.0.0.0/0 inbound rules).
- **Network Firewall policy**: Deploys the firewall policy of a central inspection VPC across multiple accounts.
- **Route 53 Resolver DNS Firewall policy**: Deploys rule groups that block malicious domains.
- **Third-party firewall policy**: Marketplace partner firewalls can be deployed across the organization the same way.

The strength of FMS is **automatic protection of new resources**. When a new resource matching the policy scope (accounts, resource tags) appears, FMS applies the policy automatically. Even if an "ALB without WAF" is newly created, FMS attaches it automatically.

This is *declarative enforcement* of policy and *continuous remediation*. Once you declare a policy, the system *converges* the current state to the declared state (the same thinking as the Kubernetes reconcile loop). For imperative operations where people apply things each time, the probability of omission grows roughly as `1-(1-p)^n` in the number of resources n, whereas the failure probability of declarative convergence stays bounded by *the correctness of one policy definition* even as n grows. That formula is why FMS is not optional once the account count reaches three digits.

### Individual Management vs Firewall Manager

"Can't we just attach WAF in each account?" is right when you have 5 accounts and wrong when you have 200.

| Axis | Per-account WAF/SG management | Firewall Manager |
|---|---|---|
| Where the policy is defined | Separately for every account × Region | **Once, in the FMS administrator account** |
| New resources | Attached only if a person remembers | **Attached automatically when scope matches** |
| Drift (someone detaches it) | Hard even to discover | Reports non-compliance; **restores automatically** if `RemediationEnabled` |
| Compliance visibility | Walk through each account's console | Single org-wide compliance dashboard |
| New accounts | Depends on the onboarding checklist | Policy inherited the moment the account joins the OU |
| Scope selection | Not possible (manual judgment) | Declared by OU, account, or **resource tag** |
| Failure mode | *Silent omission* | *Visible non-compliance* |

The last row is the essence. A failure in individual management leaves no signal at all, while a failure in FMS shows up on the dashboard. **Turning a "silent failure" into a "loud failure" in security operations is itself a control.**

## FMS vs WAF vs Network Firewall: Role Distinction

| Service | Essence | Relationship |
|---|---|---|
| **WAF** | Applies a single Web ACL to a single resource | A target that FMS *deploys* |
| **Network Firewall** | VPC traffic inspection (stateful/IPS) | A target that FMS *deploys* |
| **Firewall Manager** | *Deploys, enforces, and remediates* the above policies across the organization | Orchestrator |

On the exam, "apply WAF consistently across multiple accounts and automatically protect new resources" almost always points to **Firewall Manager**. If it is protecting a single resource, WAF directly is the answer.

```json
// FMS WAF policy — real-world form with scope narrowing and lifecycle options
{
  "PolicyName": "Org-Common-WAF-Prod",
  "ResourceType": "AWS::ElasticLoadBalancingV2::LoadBalancer",
  "IncludeMap": { "ORG_UNIT": ["ou-xxxx-prod", "ou-xxxx-shared"] },
  "ExcludeMap": { "ACCOUNT": ["999988887777"] },
  "ExcludeResourceTags": true,
  "ResourceTags": [ { "Key": "fms-exempt", "Value": "true" } ],
  "RemediationEnabled": true,
  "DeleteUnusedFMManagedResources": true,
  "SecurityServicePolicyData": {
    "Type": "WAFV2",
    "ManagedServiceData": "{\"type\":\"WAFV2\",\"preProcessRuleGroups\":[{\"managedRuleGroupIdentifier\":{\"vendorName\":\"AWS\",\"managedRuleGroupName\":\"AWSManagedRulesCommonRuleSet\"},\"overrideAction\":{\"type\":\"NONE\"},\"ruleGroupType\":\"ManagedRuleGroup\"}],\"postProcessRuleGroups\":[],\"defaultAction\":{\"type\":\"ALLOW\"}}"
  }
}
```

The meanings of three options separate answers in both practice and the exam.

- `ExcludeResourceTags: true` + `ResourceTags`: **removes from scope** resources carrying this tag. If `false`, it works the other way: only resources carrying that tag are *included*. This is the standard pattern for implementing an exception-approval process with tags.
- `DeleteUnusedFMManagedResources: true`: when a policy is deleted or a resource leaves scope, FMS **cleans up together** the managed resources it created, such as Web ACLs. If `false`, orphaned Web ACLs remain in every account and keep incurring charges.
- `preProcessRuleGroups` / `postProcessRuleGroups`: rule groups **pinned at the front and back** of each member account's Web ACL, with the space in between left for the account owner to add their own rules. It expresses structurally the compromise "organization-mandatory rules cannot be touched, but each team adds its own app-specific rules."

```bash
# 1) In the management account, designate the FMS administrator (delegated administrator) — usually the Security/Audit account
aws fms associate-admin-account --admin-account 222233334444

# 2) In the FMS administrator account, create the policy
aws fms put-policy --policy file://org-common-waf.json

# 3) Check org-wide compliance status / per-account non-compliance causes
aws fms list-compliance-status --policy-id <policy-id>
aws fms get-compliance-detail --policy-id <policy-id> --member-account 111122223333

# Prerequisite for Network Firewall / DNS Firewall policies: enable organization resource sharing
aws ram enable-sharing-with-aws-organizations
```

There are three kinds of Security Group policy, and the exam asks "which one is it?"

| SG policy type | What it does | Situation where it is the answer |
|---|---|---|
| **Common security group** | **Attaches** an organization-standard SG to in-scope resources | "Force a common default SG onto every EC2/ENI" |
| **Content audit** | Judges the **rule contents** of existing SGs against a template | "Prohibit 0.0.0.0/0 inbound or opening 22/3389 across the entire organization" |
| **Usage audit** | Finds and cleans up **unused and duplicate SGs** | "Unused security groups pile up and become unmanageable" |

> ⚠️ **Pitfall**: There are three common reasons nothing happens even after you create an FMS policy. ① **Config is turned off** in the target account or Region — FMS evaluates on top of the Config inventory, so you get "no evaluation at all" rather than "0 non-compliant", and it is more dangerous because the dashboard looks clean. ② `RemediationEnabled` is `false` — in that case FMS only *reports* and attaches nothing. This is the number-one cause of "the policy exists but the Web ACL does not get attached." ③ **A CloudFront/Shield Advanced policy was created in a Region other than `us-east-1`** — the policy is created but no targets are picked up. All three fail silently without an error, so diagnosis comes late.

What FMS does when it deploys a WAF policy is **not** to *share* a central Web ACL. In each member account and Region it creates a new FMS-managed Web ACL *owned by that account*, pins the policy's rule groups before and after, and associates it with the target resource. As a result, ① WAF charges and capacity units (WCU) are billed to each member account, and ② even if a member account administrator modifies the FMS-managed area, it is reverted at the next evaluation cycle. That reversion is the *continuous remediation*, and it works on the same principle as Control Tower drift. However, if an account administrator **deletes** the Web ACL, there is a brief unprotected window until FMS recreates it. The standard way to eliminate that window is to Deny `wafv2:DeleteWebACL` and `wafv2:DisassociateWebACL` with an SCP — **a classic combination that layers FMS (convergence) with SCP (boundary)**.

## Tag Governance

Tags are the foundation of cost allocation, access control (ABAC), and automation. If tags are inconsistent, both cost tracking and tag-based permissions collapse. Organization-scale tag governance is enforced along three axes.

1. **Tag Policies (Organizations)**: Define the allowed tag keys, values, and capitalization standards and *report* non-compliant resources (mainly detection and standardization).
2. **Enforcing tags with SCP**: *Block* creation when required tags are missing (prevention).
3. **Config rule (required-tags)**: Detect and remediate missing tags on resources that already exist.

The roles look overlapping, but the **point of blocking and the strength of enforcement** are completely different. This table is the decision axis.

| | Tag Policy (Organizations) | SCP tag condition | Config `required-tags` |
|---|---|---|---|
| Control type | Standardization + (optional) enforcement | **Preventive (block)** | **Detect + remediate** |
| When it acts | When a tag is assigned or changed | When the API call is evaluated | After the resource is created or changed |
| What it blocks | Attaching a tag with a *non-compliant value or spelling* | **Creation itself** without required tags | Blocks nothing (after the fact) |
| Creation without tags | **Cannot block** | Blocks | Detected after the fact |
| Output | Compliance report | AccessDenied | NON_COMPLIANT + remediation run |

The key pitfall is in row 4. **A Tag Policy cannot prevent "creating a resource without any tags at all."** What a Tag Policy enforces is *whether the key and value follow the standard when a tag is attached*, not *whether a tag must be present*. If you want "no creation without required tags," the answer is always SCP. When both appear among the choices, first check whether the verb in the requirement is "standardize/report" or "block/enforce."

```json
// SCP: make tags "get attached" and make them "impossible to remove" afterward — the two come as a pair
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyCreateWithoutRequiredTags",
      "Effect": "Deny",
      "Action": ["ec2:RunInstances", "rds:CreateDBInstance", "s3:CreateBucket"],
      "Resource": "*",
      "Condition": {
        "Null": {
          "aws:RequestTag/CostCenter": "true",
          "aws:RequestTag/DataClassification": "true"
        },
        "Bool": { "aws:PrincipalIsAWSService": "false" }
      }
    },
    {
      "Sid": "DenyInvalidDataClassificationValue",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:RequestTag/DataClassification": ["public","internal","confidential","restricted"]
        },
        "Null": { "aws:RequestTag/DataClassification": "false" }
      }
    },
    {
      "Sid": "DenyRemovingGovernanceTags",
      "Effect": "Deny",
      "Action": ["ec2:DeleteTags", "rds:RemoveTagsFromResource", "s3:DeleteBucketTagging"],
      "Resource": "*",
      "Condition": {
        "ForAnyValue:StringEquals": {
          "aws:TagKeys": ["CostCenter", "DataClassification"]
        },
        "ArnNotLike": { "aws:PrincipalARN": "arn:aws:iam::*:role/OrgTagGovernanceRole" }
      }
    }
  ]
}
```

Each of the three Statements closes a different hole. The first closes *creation without tags*, the second *non-standard values*, and the third *later tag removal*. The point in the second is that `Null` is set to `"false"` — it means "check the value only when the tag is present," and without this condition every call that does not specify the tag would also be caught, breaking other services wholesale. Without the third, the workaround of "attaching the tag only at creation and then immediately deleting it" works, and in an organization that does access control by tags (ABAC), this workaround is a **privilege escalation path**.

```bash
# Organizations Tag Policy: standardize key spelling and allowed values, enforce only for the listed resource types
aws organizations enable-policy-type --root-id r-exam --policy-type TAG_POLICY
aws organizations create-policy \
  --name "Org-Standard-Tags" --type TAG_POLICY \
  --content '{ "tags": { "CostCenter": {
      "tag_key":   { "@@assign": "CostCenter" },
      "tag_value": { "@@assign": ["CC-1001","CC-1002","CC-2001"] },
      "enforced_for": { "@@assign": ["ec2:instance","rds:db","s3:bucket"] } } } }'
aws organizations attach-policy --policy-id p-tagpolicy --target-id ou-xxxx-prod

# Org-wide tag survey and bulk correction
aws resourcegroupstaggingapi get-tag-keys
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=DataClassification,Values=restricted \
  --resource-type-filters ec2:instance rds:db s3
aws resourcegroupstaggingapi tag-resources \
  --resource-arn-list arn:aws:ec2:ap-northeast-2:111122223333:instance/i-0abc123 \
  --tags CostCenter=CC-1001,Owner=platform-team
```

Tags are also the core of **ABAC (Attribute-Based Access Control)**. With `aws:ResourceTag`/`aws:PrincipalTag` you can grant dynamic permissions such as "access only resources carrying the same team tag," so the number of policies does not explode as accounts and resources grow. The single policy below works unchanged whether there are 3 teams or 300.

```json
{
  "Effect": "Allow",
  "Action": ["ec2:StartInstances","ec2:StopInstances"],
  "Resource": "arn:aws:ec2:*:*:instance/*",
  "Condition": {
    "StringEquals": { "aws:ResourceTag/Team": "${aws:PrincipalTag/Team}" }
  }
}
```

**However, the safety of ABAC depends entirely on the integrity of tags.** Without the third SCP Statement above (blocking tag removal) and a control that "prevents principals from changing their own principal tags," a user can change their own `Team` tag and touch someone else's resources, which is privilege escalation. This is why, when you adopt ABAC, you lock down `iam:TagRole`, `iam:TagUser`, and `sts:TagSession` as well.

Tag governance is a *trusted identifier* problem. A tag is a string users write freely, so it is inherently an untrustworthy field, yet ABAC and cost allocation assume it can be trusted. What bridges that gap is control over "who can write and delete tags." In other words, **half of tag governance is not the tag values but the governance of tag-change permissions**. You need prevention (SCP), standardization (Tag Policy), and remediation (Config) together to break "garbage in, garbage out."

> ⚠️ **Pitfall**: The `aws:RequestTag/*` condition is meaningful **only when the API supports tagging at creation (tag-on-create)**. If you apply this `Null` condition to an API that does not support it, there is no way to carry a tag in the request, so that action is *always* denied. That is why a practical SCP does not cast a wide action list but picks and names only the actions that support tag-on-create. One more thing — to enforce tags on `ec2:RunInstances`, the user's IAM policy must allow `ec2:CreateTags` on the instance resource. There is a hard-to-diagnose combination where the SCP passes but creation fails because IAM lacks `CreateTags`.

### Where Tag Enforcement Leaks: Checking with the Policy Evaluation Order

The answer to "I blocked it with an SCP, so why was the resource created without tags?" always lies in the evaluation rules. Compressing Day 1's decision rules into a tag context gives this.

```
Effective permission = (SCP ∩ RCP ∩ permissions boundary ∩ session policy) ∩ (IAM Allow ∪ resource policy Allow) − (all Denies)

① A single explicit Deny ends it → a tag SCP's Deny beats even AdministratorAccess
⑦ If there is no Allow anywhere, implicit Deny
```

| Policy type | Role in tag governance | Strength |
|---|---|---|
| **SCP** | Blocks tagless creation across an entire account/OU | A Deny **always wins** (but is not applied to management account principals) |
| **IAM identity policy** | Grants actual permission + adds tag conditions | Cannot beat an SCP Deny |
| **Permissions boundary** | The ceiling for one specific role | Can only narrow; cannot widen Allow |
| **Resource-based policy** | Imposes tag conditions on cross-account access | Stands as a sole Allow only within the same account |

Two practical conclusions follow. First, **SCPs do not apply to management account principals**, so if you run workloads in the management account, tag and Region enforcement leaks wholesale (another reason for the rule of not putting workloads in the management account). Second, **resources that AWS services create under their own name** sometimes do not carry tags in the request and get caught by the SCP Deny — which is why the first Statement in the JSON above has the `aws:PrincipalIsAWSService` condition.

> 🎯 **Scenario**: The day after a tag-enforcing SCP is attached to the Prod OU, every Auto Scaling scale-out fails and CloudFormation stack updates roll back. What are the cause and the fix? → The `ec2:RunInstances` call that the ASG makes to create instances did not carry a `CostCenter` tag. There are three fixes. ① Turn on the ASG's **tag propagation (PropagateAtLaunch)** so group tags are carried in instance requests. ② Standardize stack-level tags in CloudFormation so they are inherited by child resources. ③ Only for the service-principal paths that still remain, make an exception with the `aws:PrincipalIsAWSService` condition. The important judgment is that **you must not do ③ first** — if you open the exception first, nobody does ①, and tag omissions leak permanently through the service path. When introducing an enforcement policy, always *fix the normal path before opening an exception*.

## Cost Governance (Security Perspective)

Cost seems unrelated to security, but **an abnormal cost spike can be a sign of compromise** (cryptocurrency mining instances, data exfiltration traffic, mass resource creation with stolen keys). Security operations use cost signals for threat detection.

- **AWS Budgets**: Threshold alerts on budgets by account, tag, and service. Notifies on spikes.
- **Cost Anomaly Detection**: ML-based anomalous spend detection → an early signal of compromise or misconfiguration.
- **Restrict expensive instance types and Regions with SCP**: Block creation of large GPU instances used for mining with an SCP to reduce the *blast radius*.
   ```json
   {
     "Sid": "DenyExpensiveGPUInstances",
     "Effect": "Deny",
     "Action": "ec2:RunInstances",
     "Resource": "arn:aws:ec2:*:*:instance/*",
     "Condition": {
       "ForAnyValue:StringLike": { "ec2:InstanceType": ["p4d.*","p5.*","x2*"] }
     }
   }
   ```
- **Tag-based cost allocation**: Attribute cost to teams and environments through consistent tags to trace the owner of an anomaly quickly.

Some GuardDuty finding types (for example, cryptocurrency-mining-related EC2/Kubernetes findings) also connect directly to this context.

Layering a **Region restriction** on top reduces the blast radius once more. The typical behavior of a mining attack is to launch instances in *a Region the organization does not use* — because it stays undiscovered for a long time by operators who look only at the default Region.

```json
{
  "Sid": "DenyAllOutsideApprovedRegions",
  "Effect": "Deny",
  "NotAction": [
    "iam:*", "organizations:*", "sts:*", "cloudfront:*", "route53:*",
    "support:*", "budgets:*", "ce:*", "waf:*", "wafv2:*", "shield:*", "fms:*"
  ],
  "Resource": "*",
  "Condition": {
    "StringNotEquals": { "aws:RequestedRegion": ["ap-northeast-2", "us-east-1"] }
  }
}
```

The two pitfalls of this pattern are that global services must be exempted in `NotAction`, and that the control plane for CloudFront, WAF (global scope), Shield, and FMS is in `us-east-1`, so that Region must stay in the allow list. A single SCP turns the policy "we only use Seoul" into **a security control that also blocks mining and data exfiltration in unused Regions**.

```bash
# Make the whole organization a single cost anomaly monitor, and route alerts to the security channel
aws ce create-anomaly-monitor --anomaly-monitor \
  '{"MonitorName":"OrgWideCostMonitor","MonitorType":"DIMENSIONAL","MonitorDimension":"SERVICE"}'
aws ce create-anomaly-subscription --anomaly-subscription '{
  "SubscriptionName": "SecOps-Cost-Spike",
  "MonitorArnList": ["arn:aws:ce::111122223333:anomalymonitor/<id>"],
  "Subscribers": [{"Type":"SNS","Address":"arn:aws:sns:us-east-1:222233334444:secops-alerts"}],
  "Frequency": "IMMEDIATE" }'
aws ce get-anomalies --date-interval StartDate=2026-07-01,EndDate=2026-07-31
```

In February 2018, a research team at the cloud security vendor RedLock (now Palo Alto Networks) discovered and reported **cryptocurrency mining in progress in Tesla's AWS environment**. The intrusion path was not a sophisticated vulnerability but a **Kubernetes administration console with no authentication**, and AWS credentials were exposed inside that console. The reason this incident keeps being cited in governance textbooks is not the mining itself but its **concealment techniques** — the attacker ① used their own mining pool server instead of a public mining pool, ② hid that server behind a CDN to evade detection based on destination IP reputation, ③ used a non-standard port, and ④ **deliberately kept CPU utilization low** so that "utilization spike"-based detection would not catch it. Every traditional threshold-based detection was bypassed. The signals that remain are ultimately *cost* and *permission-boundary violations*. The practical conclusion is clear — do not hang mining detection on CPU utilization alone; layer **cost anomaly detection + GuardDuty finding types + SCP blocks on unused Regions and large instances**. And do not forget that the root cause was always "the place where the credentials were left."

> 🎯 **Scenario**: At 3 a.m., Cost Anomaly Detection reports spend 40 times normal in a particular account. Dozens of large instances are running in 3 Regions the organization does not use, and the creator is an IAM user access key issued 6 months ago. What do you do, in order? → ① **Neutralize the credential first**: set the access key to `Inactive` (deactivating is better than deleting for forensics). ② **Isolate**: do not terminate the instances; swap them to an isolation SG and take snapshots — terminating destroys memory and disk evidence. ③ **Determine scope**: search the full call history of that key in CloudTrail for persistence and spreading actions such as `CreateUser`, `AttachUserPolicy`, and `PutBucketPolicy`. ④ **Prevent recurrence**: apply Region-restriction and instance-type-restriction SCPs, and replace long-term access keys with temporary credentials based on IAM Identity Center. The order is **stop → preserve → investigate → prevent**, and the common mistake is to delete the instances right away in ②, making investigation impossible.

## Security Baseline Automation

The destination of multi-account security operations is making security tools switch on automatically every time a new account is born, and making non-compliance get remediated automatically. The components:

- **Auto-enable GuardDuty / Security Hub / Config**: Turn on "auto-enable" in the delegated administrator, and new accounts are activated the moment they join the organization.
- **EventBridge-based automated response**: GuardDuty/Security Hub findings → EventBridge rule → Lambda/SSM Automation for automatic isolation and remediation.
- **Config automatic remediation**: Automatically run an SSM Automation document on non-compliant resources (for example, reapplying Block Public Access to a public S3 bucket).
- **Account factory post-processing**: Immediately after a new account is issued, automatically apply the baseline (additional SCPs, log subscriptions, tags, IAM roles) through IaC (AFT/CfCT).

The fact that auto-enable must be turned on **separately for each service** is often missed in practice. If you miss even one, only that service stays silently off in new accounts.

```bash
# GuardDuty: from the delegated administrator, auto-enroll new organization accounts
aws guardduty update-organization-configuration \
  --detector-id <detector-id> --auto-enable-organization-members ALL

# Security Hub: auto-enroll new accounts + auto-enable default standards
aws securityhub update-organization-configuration \
  --auto-enable --auto-enable-standards DEFAULT

# Config automatic remediation: run SSM Automation when non-compliance is detected
aws configservice put-remediation-configuration --remediation-configurations '[{
  "ConfigRuleName": "s3-bucket-public-read-prohibited",
  "TargetType": "SSM_DOCUMENT",
  "TargetId": "AWS-DisableS3BucketPublicReadWrite",
  "Automatic": true, "MaximumAutomaticAttempts": 5, "RetryAttemptSeconds": 60,
  "Parameters": {
    "AutomationAssumeRole": {"StaticValue":{"Values":["arn:aws:iam::111122223333:role/ConfigRemediationRole"]}},
    "S3BucketName": {"ResourceValue":{"Value":"RESOURCE_ID"}} } }]'
```

An EventBridge rule declares "what to catch" as an event pattern. Filtering by severity to cut noise is the standard.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [ { "numeric": [">=", 7] } ],
    "type": [ { "prefix": "CryptoCurrency:" }, { "prefix": "UnauthorizedAccess:" } ]
  }
}
```

Drawing the whole closed loop looks like this.

```
[ Account issuance path ]             [ Always-on operations loop ]

Account Factory / AFT                Event occurs in a workload account
   │ account created                           │
   ▼                                           ▼
OU placement + standard tags          GuardDuty / Security Hub / Config
   │                                           │ finding · NON_COMPLIANT
   ▼                                           ▼
auto-enable inheritance               EventBridge rule (severity filter)
 ├ GuardDuty                                   │
 ├ Security Hub                    ┌───────────┼───────────┐
 ├ Config + org rules                ▼           ▼           ▼
 └ FMS policy (OU inheritance)  Lambda isolate  SSM remediate  SNS/Slack
   │                            (disable key)  (restore config) (for human judgment)
   ▼                                 │           │
Baseline IaC post-processing         └─────┬─────┘
 (roles · log subscriptions · network)     ▼
   │                              Results reflected in Security Hub
   └─────────────────────────────▶  (compliance state re-evaluated)
```

The moment you turn automatic remediation on, it becomes *a new cause of operational incidents*. ① **Remediation loops**: when remediation changes a resource, that again produces a configuration change event and another rule remediates it again, creating oscillation (which is why `MaximumAutomaticAttempts` and a review of conflicts between rules are needed). ② **Remediation that breaks an intended exception**: a bucket approved for public distribution gets closed by automatic remediation and the service goes down — a design that declares exceptions with tags and removes them from remediation targets has to come first. ③ **Silent failure from insufficient permissions**: if `AutomationAssumeRole` lacks permissions, remediation fails, yet the dashboard still shows "remediation configured." Automatic remediation must always make *remediation failure itself* an alerting target.

The criterion when designing automatic response is "is this action **reversible**?" Reversible actions (disabling an access key, swapping in an isolation SG, creating a snapshot, invalidating a session) are safe to automate — even if it is a false positive, they are recovered within minutes. For irreversible actions (terminating an instance, deleting a user, deleting a resource), automating means a single false positive is an outage. That is why mature organizations split them: **reversible actions are automatic, irreversible actions go through an approval gate** (a Step Functions wait state + approval callback). One more thing — for the automated-response Lambda to act in member accounts, a *cross-account response role* must be deployed in each account beforehand, and that role is very powerful. The standard is to narrow its trust policy to a specific Lambda execution role in the security account and block deletion and modification of that role with an SCP. **Because the response role is itself the highest-privilege channel, the security of response automation becomes the ceiling of the whole organization's security.**

## Pitfall Summary

- Firewall Manager works only when *Config is enabled*. Without Config, compliance evaluation and remediation are impossible.
- Best practice is to make a *delegated administrator (usually the Security account)*, not the management account, the FMS administrator.
- "Apply WAF/SG/Network Firewall consistently across multiple accounts + automatically protect new resources" → *Firewall Manager*, not WAF directly.
- If `RemediationEnabled: false`, FMS only *reports* — the number-one cause of "the policy exists but nothing gets attached."
- CloudFront-scope WAF and Shield Advanced policies must be created in **us-east-1**.
- Network Firewall and DNS Firewall policies require **AWS RAM organization sharing** first.
- If you turn off `DeleteUnusedFMManagedResources`, orphaned Web ACLs remain in every account after policy deletion and keep incurring charges.
- Tag governance is complete only when prevention (SCP), standardization (Tag Policy), and remediation (Config) are used together.
- **A Tag Policy cannot prevent "creation without tags"** — if blocking is needed, the answer is SCP.
- A tag-enforcing SCP must pair *attachment at creation* with *blocking later removal* to close the workaround.
- `aws:RequestTag` is valid only for APIs that support tag-on-create — applying it to an unsupported action always results in denial.
- The safety of ABAC depends on tag integrity — `iam:TagRole` and `sts:TagSession` must be locked down as well.
- SCPs *do not apply to management account principals* — workloads in the management account leak tag and Region enforcement wholesale.
- When introducing an enforcement SCP, first normalize the service-linked paths (ASG, CFN) and open exceptions last.
- An abnormal cost spike can be a *security signal* — connect Budgets/Cost Anomaly Detection to compromise detection.
- Mining detection must not hang on CPU utilization alone — attackers keep utilization low to evade it.
- auto-enable must be turned on separately per service — if one is missed, only that service stays silently off in new accounts.
- For automated response, *only reversible actions are automatic*; irreversible actions are split off behind an approval gate.
- The incident response order is **stop → preserve → investigate → prevent** — deleting an instance immediately destroys evidence.

## 📌 Key Takeaways

- [ ] Did you designate the FMS administrator as the **Security/Audit account** rather than the management account?
- [ ] Is **Config on in every account and Region** within the policy scope?
- [ ] Did you set `RemediationEnabled` and `DeleteUnusedFMManagedResources` as intended?
- [ ] Did you create CloudFront and Shield Advanced policies in `us-east-1`?
- [ ] Did you declare exception resources with tags (`ExcludeResourceTags`) and connect them to the approval process?
- [ ] Did you also block deletion and disassociation of FMS-managed Web ACLs with an SCP to eliminate the unprotected window?
- [ ] Do you **block required tags with an SCP** and use Tag Policy for standardizing values and spelling?
- [ ] Did you also apply tag *removal* blocking (`aws:TagKeys` + `ec2:DeleteTags`) as a pair?
- [ ] Did you put the global services and the `us-east-1` exception correctly into the Region-restriction SCP?
- [ ] Do Cost Anomaly Detection alerts flow **to the security channel as well, not only the finance channel**?
- [ ] Did you turn on auto-enable for GuardDuty, Security Hub, and Config **each separately**?
- [ ] Does the Config automatic remediation have `AutomationAssumeRole` permissions, and is *remediation failure* an alerting target?
- [ ] Do you separate reversible and irreversible actions in automated response, and protect the cross-account response role with an SCP?

## 📝 Practice Questions

**Question 1.** We want to apply a common WAF managed rule to all ALBs across 200 accounts, and also have newly created ALBs automatically protected going forward. What is the most appropriate service?

A) Manually associate a WAF Web ACL with the ALB in each account  
B) Define a WAF policy with AWS Firewall Manager to automatically deploy and remediate across organization-wide ALBs and automatically apply to new resources  
C) Restrict HTTP with a Security Group  
D) Use only CloudFront  

**Answer: B**  
Explanation: Consistently deploying and enforcing firewall policies across the organization and automatically protecting new resources is the core function of Firewall Manager. When you define a managed rule group in a WAF policy, it is automatically associated with all in-scope ALBs, and turning on remediation automatically fixes noncompliance. Manual per-account association inevitably leads to omissions and drift, an SG cannot perform layer 7 WAF control, and CloudFront alone is unrelated to bulk ALB protection.

---

**Question 2.** You created a Firewall Manager policy, but compliance evaluation and automatic remediation do not work in some accounts. What is the most likely missing prerequisite?

A) AWS Config is inactive in that account  
B) CloudFront is inactive  
C) Route 53 is inactive  
D) There is no S3 bucket  

**Answer: A**  
Explanation: Firewall Manager evaluates resources with AWS Config to determine compliance and remediate. If Config is off in the target account, evaluation and remediation do not work. The prerequisites for FMS are Organizations, designating an FMS administrator, and enabling Config; whether CloudFront, Route 53, or S3 exist is only incidental to the policy type and not a universal prerequisite.

---

**Question 3.** We want to *enforce (block)* that every EC2/RDS creation must have a CostCenter tag. What is the most direct method?

A) Only report with Tag Policies  
B) Use an SCP to Deny RunInstances/CreateDBInstance when aws:RequestTag/CostCenter is absent  
C) Only detect with a Config rule  
D) Train the IAM users  

**Answer: B**  
Explanation: A preventive control that blocks missing tags at creation time is implemented with a Null condition in an SCP. If the required tag is missing, the creation action itself is denied. Tag Policies and Config rules focus on standardization and detection and do not block creation, and training has no enforcement power. In practice you use all three together, but the direct means of "enforced blocking" is the SCP.

---

**Question 4.** GPU instance costs suddenly appeared in one account at 10 times the usual level. From a security operations perspective, what is the most appropriate interpretation and combination of controls?

A) Ignore it since it is normal usage growth  
B) It may be a sign of compromise (for example, mining), so detect early with Cost Anomaly Detection/Budgets alerts and limit the damage by restricting large GPU instance types with an SCP  
C) Add more instances to increase throughput  
D) Cost is unrelated to security, so notify only the finance team  

**Answer: B**  
Explanation: An abnormal cost spike, especially a surge in large GPU instances, is a typical sign of compromise such as cryptocurrency mining with stolen credentials. Detecting early with Cost Anomaly Detection and Budgets and reducing the blast radius by blocking creation of large instance types used for mining with an SCP is the standard of security operations. Ignoring or scaling up increases the risk, and separating cost from security and handing it only to the finance team misses the chance to detect.

---

**Question 5.** We want GuardDuty, Security Hub, and Config to be turned on automatically in every account newly joining the organization, and detected noncompliance to be remediated automatically. What is the most appropriate design?

A) Manually turn on the services in each account  
B) Turn on auto-enable in the delegated administrator, receive findings with EventBridge rules, and build a closed loop that automatically isolates and remediates with Lambda/SSM Automation  
C) Turn off the security tools to save cost  
D) Inspect each account as the root user  

**Answer: B**  
Explanation: Turning on auto-enable in the delegated administrator activates the security services as soon as a new account joins the organization, and connecting findings through EventBridge to Lambda/SSM completes a closed loop of detection, notification, and automatic remediation. Manual per-account activation leaves omissions, disabling security tools undermines governance, and root inspection goes against separation of duties and least privilege.

---
