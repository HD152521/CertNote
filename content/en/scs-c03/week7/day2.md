# Day 2 - AWS Config: Configuration Items and Records, Rules (Managed/Custom Lambda), Conformance Pack, Auto-Remediation

If CloudTrail records "who did what" (activity), **AWS Config** records "what state is the resource in *right now* and at each point *in the past*" (configuration). They are complementary. In breach investigation, CloudTrail shows an `AuthorizeSecurityGroupIngress` call, but AWS Config shows that rule opened security group to 0.0.0.0/0:22 and *sustained that state for days* — the state and timeline.

For security exams, Config is the core tool for "regulatory compliance assessment," "configuration drift detection," and "enforcing desired state (auto-remediation)."

## Configuration Item and Configuration Recorder

Config's basic unit is **Configuration Item (CI)** — a snapshot of one resource at a specific point in time, containing attributes, relationships, related events, and metadata. Each time a resource changes, a new CI is created, forming a **configuration timeline**.

```json
{
  "configurationItemCaptureTime": "2026-06-24T08:00:00Z",
  "resourceType": "AWS::EC2::SecurityGroup",
  "resourceId": "sg-0abc123",
  "configurationItemStatus": "OK",
  "configuration": {
    "ipPermissions": [
      { "ipProtocol": "tcp", "fromPort": 22, "toPort": 22,
        "ipRanges": [{ "cidrIp": "0.0.0.0/0" }] }
    ]
  },
  "relationships": [
    { "resourceType": "AWS::EC2::Instance", "resourceId": "i-0def456",
      "relationshipName": "Is associated with" }
  ]
}
```

**Configuration Recorder** determines which resource types are recorded. You configure whether to record all resources, specific types only, and whether to include global resources (IAM etc.). Recorded CIs, snapshots, and change history flow via **delivery channel** to S3 bucket and SNS notifications.

> ⚠️ **Pitfall**: Config is a *regional service*. You must enable recorder in each region to record that region's resources. Also, global resources like IAM and CloudFront are recorded in only one region (usually us-east-1) to avoid duplication. "Config enabled but multi-region resources not evaluated" typically means per-region recorder not configured.

> 💡 **Related Theory**: Config's concept is *infrastructure as a state machine*. Every resource is a state machine changing over time, and Config records those state transitions like event sourcing. This enables "time travel" — querying "what state was this resource in 2 weeks ago" — the foundation of compliance audits and incident investigations.

## Config Rules: Compliance Assessment

**Config Rule** evaluates whether a resource satisfies the desired state, marking it `COMPLIANT` or `NON_COMPLIANT`. Evaluation triggers are two:
- **Configuration change triggered**: When CI is created/modified.
- **Periodic**: At configured intervals (1 hour to 24 hours).

Rules have three sources:
1. **AWS Managed Rules**: Hundreds of AWS-provided pre-defined rules (e.g., `s3-bucket-public-read-prohibited`, `encrypted-volumes`, `iam-password-policy`, `restricted-ssh`).
2. **Custom Lambda Rules**: Write evaluation logic directly in Lambda.
3. **Custom Policy Rules**: Write with Guard (policy language) without code.

```python
# Custom Lambda rule: Evaluate if EBS volume is encrypted with specific KMS key
import boto3, json

REQUIRED_KEY = "arn:aws:kms:ap-northeast-2:111122223333:key/aaaa-bbbb"

def lambda_handler(event, context):
    invoking = json.loads(event["invokingEvent"])
    ci = invoking["configurationItem"]
    config = boto3.client("config")

    compliance = "NOT_APPLICABLE"
    if ci["resourceType"] == "AWS::EC2::Volume":
        cfg = ci["configuration"]
        if cfg.get("encrypted") and cfg.get("kmsKeyId") == REQUIRED_KEY:
            compliance = "COMPLIANT"
        else:
            compliance = "NON_COMPLIANT"

    config.put_evaluations(
        Evaluations=[{
            "ComplianceResourceType": ci["resourceType"],
            "ComplianceResourceId": ci["resourceId"],
            "ComplianceType": compliance,
            "OrderingTimestamp": ci["configurationItemCaptureTime"],
        }],
        ResultToken=event["resultToken"],
    )
```

> 🎯 **Scenario**: "Evaluate organization-specific rules AWS managed rules cannot express (e.g., all EBS must encrypt with *specific* CMK)." Answer: Custom Lambda rule or Custom Policy (Guard) rule. Just "is it encrypted" is fine with managed `encrypted-volumes`, but *specific key* enforcement needs custom.

## Conformance Pack: Bundled Rules and Remediation Deployment

Managing rules one-by-one is inefficient across many accounts and regions. **Conformance Pack** bundles Config rules and remediation actions into **one YAML template** for unified deployment and management. AWS provides **sample conformance packs** for PCI-DSS, HIPAA, NIST, CIS, FedRAMP etc.

```yaml
Resources:
  S3PublicReadProhibited:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
  EncryptedVolumes:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: encrypted-volumes
      Source:
        Owner: AWS
        SourceIdentifier: ENCRYPTED_VOLUMES
```

Combined with Organizations, **organization conformance pack** deploys the same rule set to all member accounts, with delegated administrator viewing aggregated compliance status.

> 💡 **Related Theory**: Conformance pack is *compliance as code* — replacing humans checking control items via checklist with machines continuously evaluating via code. This is *continuous compliance* — evaluation at each change, not annual audit snapshots. This connects to NIST 800-137 ISCM (Information Security Continuous Monitoring).

## Auto Remediation: Beyond Detection to Correction

Rules that find `NON_COMPLIANT` don't have to stop there; **auto remediation** enforces desired state. Config calls **SSM Automation documents** as remediation actions. Connect AWS-provided documents (e.g., `AWS-DisableS3BucketPublicReadWrite`, `AWS-DetachIAMPolicy`) or custom documents.

```yaml
RemediationConfiguration:
  ConfigRuleName: s3-bucket-public-read-prohibited
  TargetType: SSM_DOCUMENT
  TargetId: AWS-DisableS3BucketPublicReadWrite
  Automatic: true
  MaximumAutomaticAttempts: 3
  RetryAttemptSeconds: 60
  Parameters:
    AutomationAssumeRole:
      StaticValue: { Values: ["arn:aws:iam::111122223333:role/ConfigRemediationRole"] }
    S3BucketName:
      ResourceValue: { Value: "RESOURCE_ID" }
```

With `Automatic: true`, remediation runs immediately upon violation detection (manual requires console button). The remediation IAM role (`AutomationAssumeRole`) must have actual modification permissions.

> ⚠️ **Pitfall**: Auto-remediation is powerful but can create *loops* or *service disruption*. For example, auto-closing an operationally necessary 0.0.0.0/0 rule causes outage. When remediation changes resources, new CIs are created and rules re-evaluate — poor design can create change→evaluate→remediate loops. In production, first validate with manual remediation or alerts before automating.

> 🎯 **Scenario**: "When public-readable S3 bucket is created, auto-block it." Answer: Config rule `s3-bucket-public-read-prohibited` + SSM Automation remediation `AWS-DisableS3BucketPublicReadWrite` with `Automatic: true`. SCP blocks before creation (preventive), Config remediation undoes already-created violations (detective+responsive) — different layers.

## Config Aggregator: Multi-Account/Region Aggregation

**Configuration Aggregator** collects Config data from multiple accounts and regions into single view. Organizations-based aggregator lets you see organization-wide rule compliance and resource inventory from one place. Security team can query "where are unencrypted EBS in our organization" at once.

> 🔍 **Deeper Dive**: Config's real value is *advanced query* and *relationship graph*. Config records resource relationships (`relationships`), enabling tracking of "all resources using this KMS key," "all ENIs attached to this security group." Config advanced query uses SQL-like syntax for inventory:
>
> ```sql
> SELECT resourceId, resourceName
> WHERE resourceType = 'AWS::EC2::SecurityGroup'
>   AND configuration.ipPermissions.ipRanges.cidrIp = '0.0.0.0/0'
> ```
>
> In breach investigation, reconstructing "lateral movement" paths uses this relationship graph. Crossing CloudTrail activity logs with Config state/relationship graphs completes the attack picture — leading to tomorrow (day 3 network logging) and day 5 integration.

---

## 📝 Practice Questions

**Question 1.** Which statement most accurately distinguishes the roles of AWS Config and CloudTrail?

A) Both record only API calls in the same way, so turning on one is enough  
B) CloudTrail records "who did what" (activity), while Config records "what state a resource was in at each point in time" (configuration state and history)  
C) Config records real-time API calls, while CloudTrail records periodic snapshots  
D) Config records network traffic, while CloudTrail records configuration changes  

**Answer: B**  
Explanation: CloudTrail records API call activity (who/when/what), while Config records the state at each point in time, the configuration timeline, and relationships between resources through the resource's configuration items (CIs). The two are complementary and must be used together to cross-analyze activity and state. Their roles are not the same, and traffic logging is the domain of VPC Flow Logs.

---

**Question 2.** You must evaluate an organization-specific requirement that cannot be expressed with AWS managed rules: "all EBS volumes must be encrypted with a specific CMK (a designated KMS key ARN)." What is an appropriate method?

A) Use only the managed rule `encrypted-volumes`  
B) Evaluate a match of the specific key ARN with a Custom Lambda rule or a Custom Policy (Guard) rule  
C) Evaluate with CloudTrail data events  
D) Block EBS creation with an SCP  

**Answer: B**  
Explanation: The managed `encrypted-volumes` rule only checks *whether* a volume is encrypted. Enforcing encryption with a *specific key* requires custom evaluation logic, so you compare `configuration.kmsKeyId` against the designated ARN with a Custom Lambda rule (or a codeless Custom Policy/Guard rule). CloudTrail records activity and is not a compliance evaluation engine, and an SCP is a preventive control that has difficulty expressing the "encrypted with a specific key" evaluation.

---

**Question 3.** You want to consistently deploy and manage many Config rules and remediations for multiple standards (CIS, PCI-DSS) across a multi-account organization. What is most appropriate?

A) Create the rules one by one in the console in each account  
B) Use an Organization Conformance Pack to bundle the rules and remediations into a YAML template and deploy it to all member accounts  
C) Write a separate Lambda rule for each account  
D) Set up only a Config Aggregator  

**Answer: B**  
Explanation: A conformance pack is a unit that bundles many Config rules and remediation actions into one YAML template for deployment and management; an organization conformance pack deploys it in bulk to all member accounts in the organization, and a delegated administrator views the aggregated compliance status. Individual creation lacks consistency and scalability, and an Aggregator is merely a tool for *aggregating and viewing* data and does not deploy rules.

---

**Question 4.** When a publicly readable S3 bucket is created, you want to block it automatically without human intervention. How do you implement this with Config?

A) Attach SSM Automation remediation (`AWS-DisableS3BucketPublicReadWrite`) to the `s3-bucket-public-read-prohibited` rule with `Automatic: true`  
B) Turn on CloudTrail integrity validation  
C) Set up a Config Aggregator  
D) Create a rule and review it manually every day  

**Answer: A**  
Explanation: When a Config rule detects a violation, it invokes the attached SSM Automation document as the remediation action, and with `Automatic: true` it runs automatically as soon as the violation is detected. `AWS-DisableS3BucketPublicReadWrite` is an AWS-provided document that blocks public access. Integrity validation and an Aggregator are unrelated to remediation, and manual review does not satisfy the "without human intervention" requirement.

---

**Question 5.** What is the biggest risk to watch for when introducing Config automatic remediation into a production environment?

A) Config is automatically replicated across Regions, doubling the cost  
B) When remediation changes a resource, a new CI is created and the rule is re-evaluated, so a poor design can cause a change → evaluate → remediate loop or an operational outage  
C) Remediation works without an IAM role, so permission control is impossible  
D) Automatic remediation applies only to global resources  

**Answer: B**  
Explanation: When remediation modifies a resource, a new configuration item is created and the rule is evaluated again; if the design is wrong, an evaluate-remediate loop can run, or a setting that is operationally necessary (for example, an intentionally public rule) can be closed, causing an outage. That is why it is safer to validate with manual remediation and notifications first, then automate. Remediation permissions are controlled through `AutomationAssumeRole`, and there is no behavior such as automatic Region replication or global-only restriction.

---
