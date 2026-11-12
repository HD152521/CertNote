# Day 4 - Multi-Account Security Operations: Firewall Manager, Central Policy Distribution, Cost/Tag Governance, Security Baseline Automation

With governance ceiling (SCP), baseline automation (Control Tower), and evidence collection (Audit Manager) in place, what remains is *day-to-day operations*. Applying firewall policies consistently across hundreds of accounts, controlling tags and costs, and automatically activating security tools every time a new account is born — this is the operations plane. Today's focus: **AWS Firewall Manager** (central firewall policy distribution), **tag/cost governance**, and **security baseline automation**.

## AWS Firewall Manager: Central Firewall Policy Distribution

Setting up WAF, Shield, Security Groups, Network Firewall, and Route 53 Resolver DNS Firewall account-by-account is error-prone. **Firewall Manager (FMS)** is a service that *defines firewall policies once and automatically distributes and enforces them* across the organization.

Prerequisites matter (common exam focus):
1. **AWS Organizations enabled** (FMS is organization-based)
2. **Firewall Manager admin account designated** — Management Account designates a delegated admin account (typically Security account) as FMS admin
3. **AWS Config enabled** — FMS evaluates resources via Config to determine compliance
4. For WAF/Shield policies, activate respective services first

```
Management Account ──(designate FMS admin)──▶ Security Account (FMS Admin)
                                                 │ define policy once
   ┌─────────────┬─────────────┬─────┘
   ▼             ▼             ▼
Account A      Account B      Account C   (auto-distribute policy + auto-remediate non-compliance)
```

Policy types FMS can distribute and enforce:
- **WAF Policy**: Attach common Web ACL (including managed rule groups) to ALB/CloudFront/API Gateway, etc. automatically.
- **Shield Advanced Policy**: Batch-apply Shield Advanced to protected resources.
- **Security Group Policy**: Common SG or *audit-mode* SG policy (detect and remediate overly-open 0.0.0.0/0 inbound).
- **Network Firewall Policy**: Deploy central inspection VPC firewall policy to multi-account.
- **Route 53 Resolver DNS Firewall Policy**: Distribute malicious domain blocking rule groups.

FMS's strength is **automatic protection of new resources**. When a new resource matching the policy scope (accounts, resource tags) is created, FMS automatically applies the policy. A new ALB without WAF is automatically wired.

> 💡 **Related Theory**: This is *declarative enforcement of policy* and *continuous remediation*. Once a policy is declared, the system *converges* actual state to declared state (same principle as Kubernetes reconcile loop). We structurally eliminate the omissions from imperative manual operations.

## FMS vs WAF vs Network Firewall Role Distinction

| Service | Essence | Relationship |
|---|---|---|
| **WAF** | Apply single Web ACL to one resource | FMS *distributes* this |
| **Network Firewall** | Inspect VPC traffic (stateful/IPS) | FMS *distributes* this |
| **Firewall Manager** | *Organization-wide distribute, enforce, remediate* above policies | Orchestrator |

In exams, "apply WAF consistently to multiple accounts and auto-protect new resources" → Answer is almost always **Firewall Manager**. Direct WAF is only for single resource protection.

```json
// FMS WAF policy (concept). Auto-attach common Web ACL to resourceType targets
{
  "PolicyName": "Org-Common-WAF",
  "ResourceType": "AWS::ElasticLoadBalancingV2::LoadBalancer",
  "SecurityServicePolicyData": {
    "Type": "WAFV2",
    "ManagedServiceData": "{ \"preProcessRuleGroups\":[{\"managedRuleGroupIdentifier\":{\"vendorName\":\"AWS\",\"managedRuleGroupName\":\"AWSManagedRulesCommonRuleSet\"}}], \"defaultAction\":{\"type\":\"ALLOW\"} }"
  },
  "RemediationEnabled": true,
  "IncludeMap": { "ORG_UNIT": ["ou-xxxx-prod"] }
}
```

`RemediationEnabled: true` means FMS auto-remediates non-compliant resources.

## Tag Governance

Tags are the foundation for cost allocation, access control (ABAC), and automation. Inconsistent tags break cost tracking and tag-based permissions. Organization-scale tag governance enforces via three axes:

1. **Tag Policies (Organizations)**: Define allowed tag keys, values, case standards; *report* non-compliant resources (mainly detective/standardization).
2. **SCP-based tag enforcement**: Block creation if required tags missing (preventive).
   ```json
   {
     "Sid": "RequireCostCenterTag",
     "Effect": "Deny",
     "Action": ["ec2:RunInstances","rds:CreateDBInstance"],
     "Resource": "*",
     "Condition": { "Null": { "aws:RequestTag/CostCenter": "true" } }
   }
   ```
3. **Config rule (required-tags)**: Detect and remediate missing tags on existing resources.

Tags are also the core of **ABAC (Attribute-Based Access Control)**. Using `aws:ResourceTag`/`aws:PrincipalTag`, you can grant dynamic permissions like "access only resources with the same team tag," so policy count doesn't explode as accounts and resources grow.

> 💡 **Related Theory**: Tag consistency is the cloud version of *data governance*. Without consistent metadata (tags), all downstream automation for cost, security, and operations sits on unreliable input — "garbage in, garbage out." Use prevention (SCP), standardization (Tag Policy), and remediation (Config) together.

## Cost Governance (Security Perspective)

Cost seems unrelated to security, but **abnormal cost spikes signal compromise** (cryptomining instances, data exfiltration, stolen keys creating bulk resources). Security operations leverage cost signals for threat detection.

- **AWS Budgets**: Threshold alerts by account, tag, service. Alert on spikes.
- **Cost Anomaly Detection**: ML-based abnormal spend detection → early signal of compromise or config error.
- **SCP to restrict expensive instance types/regions**: Block large GPU instance types via SCP to *limit blast radius* of cryptocurrency mining attacks.
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
- **Tag-based cost allocation**: Consistent tags attribute costs to teams/environments so anomalies surface quickly.

Some GuardDuty finding types (e.g., cryptocurrency mining related EC2/Kubernetes findings) connect directly to this context.

## Security Baseline Automation

The endpoint of multi-account security operations is making security tools activate automatically when new accounts are born and non-compliance automatically remediate. Components:

- **GuardDuty / Security Hub / Config auto-activation**: When delegated admin activates "auto-enable," new organizational accounts activate immediately.
- **EventBridge-based auto-response**: GuardDuty/Security Hub findings → EventBridge rule → Lambda/SSM Automation for auto-isolation and remediation.
   ```
   GuardDuty finding (e.g., exposed access key)
     → EventBridge rule match
     → Lambda: disable key + SNS alert + replace SG with isolation SG
   ```
- **Config auto-remediation**: Run SSM Automation document against non-compliant resources (e.g., reapply public access block to public S3 bucket).
- **Account Factory post-processing**: Immediately after new account issuance, auto-apply baseline (additional SCPs, log subscription, tags, IAM roles) via IaC (AFT/CfCT).

This creates the closed loop of "detect → alert → auto-remediate" operating organization-wide.

## Trap Summary

- Firewall Manager requires *Config is activated*. Without Config, compliance evaluation and remediation fail.
- FMS admin should be *delegated administrator (typically Security account)*, not Management Account.
- "Apply WAF/SG/Network Firewall consistently to multiple accounts + auto-protect new resources" → Not direct WAF but *Firewall Manager*.
- Tag governance requires prevention (SCP), standardization (Tag Policy), and remediation (Config) together.
- Abnormal cost spikes are *security signals* — connect Budgets/Cost Anomaly Detection to threat detection.
- New account security bootstraps with auto-enable; non-compliance auto-remediates via EventBridge+Lambda/SSM.

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
