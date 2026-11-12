# Day 2 - Security Hub: Security Standards (CIS/FSBP), Consolidated Score, Finding Aggregation and Normalization (ASFF), Automated Response

Once you turn on multiple detectors, a new problem immediately emerges — GuardDuty spits out alerts in GuardDuty format, Inspector in Inspector format, Macie in yet another format, and when you add configuration validation results from IAM, S3, and CloudTrail, an operator can no longer answer the single question: "Is our account secure right now?" **AWS Security Hub** is the aggregation, normalization, and scoring plane that solves this fragmentation. In the security exam, the essence of Security Hub is not a tool that *performs* detection, but a *meta-tool that collects, standardizes, and prioritizes results from multiple detectors*.

## Three Things Security Hub Does

Security Hub's work breaks down clearly into three functions.

1. **Security Standards Inspection (Security Standards)**: Automatically compares account and resource configurations against best-practice benchmarks (CIS, FSBP, PCI DSS, NIST, etc.) and produces pass/fail controls. Internally uses **AWS Config** rules.
2. **Finding Aggregation and Normalization (Aggregation)**: Receives findings from integrated services and third parties — GuardDuty, Inspector, Macie, IAM Access Analyzer, Firewall Manager, etc. — in a single format called **ASFF** and collects them in one place.
3. **Automated Response (Automation)**: Flows findings to EventBridge or processes and suppresses them automatically via Automation Rules.

> ⚠️ **Trap**: The phrase "Security Hub detects threats" is inaccurate. Threat *detection* is done by GuardDuty, vulnerability *scanning* by Inspector, sensitive data *discovery* by Macie. Security Hub *aggregates* their results and separately performs *configuration compliance checking*. On the exam, if asked about "real-time malicious activity detection," the answer is GuardDuty; if asked "multiple security service results on a single dashboard," the answer is Security Hub.

## Security Standards: CIS vs FSBP

The two main standards offered by Security Hub differ clearly when compared.

| Standard | Nature | Source |
|----------|--------|--------|
| **CIS AWS Foundations Benchmark** | External consensus-based core baseline (root MFA, CloudTrail multi-region, risk alerts, etc.) | Center for Internet Security |
| **AWS Foundational Security Best Practices (FSBP)** | Broad service-specific best practices defined by AWS directly | AWS |
| **PCI DSS** | Payment card environment compliance | PCI SSC |
| **NIST SP 800-53** | U.S. federal security controls | NIST |

- **CIS** is a narrow, core baseline at the level of "at minimum adhere to this."
- **FSBP** is a *broad* inspection across services like EC2, S3, RDS, Lambda, etc., so it has many more controls.

Each control is evaluated as an AWS Config rule, so **AWS Config must be enabled** for standard controls to work. This is the key dependency.

```bash
# Enable Security Hub (default standards auto-enable or disable and enable explicitly)
aws securityhub enable-security-hub --enable-default-standards

# Subscribe to a specific standard
aws securityhub batch-enable-standards \
  --standards-subscription-requests \
    StandardsArn=arn:aws:securityhub:ap-northeast-2::standards/aws-foundational-security-best-practices/v/1.0.0
```

> 💡 **Related Theory**: Security Hub's standards inspection is an implementation of "detective control" and "continuous compliance." Traditionally, compliance audits were quarterly or annual snapshots, but Config rule-based inspection re-evaluates on every resource change — *continuous audit*. This connects directly to NIST's Continuous Monitoring (CM) concept. On the exam, when asked "continuously track compliance state," Config + Security Hub standards are the answer axis.

## Security Score: Controls Reduced to One Number

Security Hub converts the pass rate of controls from enabled standards into a **security score (%)** metric. Score calculation is straightforward.

```
Security Score = (Number of PASSED controls) / (PASSED + FAILED controls) × 100
```

- Controls marked `NOT_AVAILABLE` or `DISABLED` are excluded from the denominator.
- Multiple resources are evaluated per control, and if even one resource fails, that control is marked `FAILED` (control status is an aggregation of resource findings).

This score is a single-glance indicator of "how well are we maintaining the baseline right now," and can be aggregated at the organization level.

## ASFF: The Universal Language for All Findings

The single most important concept in Security Hub is **ASFF (AWS Security Finding Format)**. Whether findings originate from GuardDuty, Inspector, Macie, third parties, or elsewhere, all findings are normalized into this single JSON schema. As a result, operators need not memorize per-source formats — they can search, filter, and route using *one field system*.

Core ASFF fields:

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/abc/finding/xyz",
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty",
  "GeneratorId": "guardduty",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:EC2-SSHBruteForce"],
  "Severity": { "Label": "HIGH", "Normalized": 70 },
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE",
  "Resources": [
    { "Type": "AwsEc2Instance", "Id": "arn:aws:ec2:...:instance/i-0123" }
  ],
  "Compliance": { "Status": "FAILED" },
  "ProductFields": { "aws/securityhub/CompanyName": "AWS" }
}
```

Two axes are especially important in normalization:

- **Severity.Normalized**: 0–100 normalized severity. Unifies different severity representations from different sources into one scale. Maps to labels (`INFORMATIONAL`/`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`).
- **Workflow.Status**: The *handling state* of a finding — `NEW` → `NOTIFIED` → `RESOLVED` / `SUPPRESSED`. This is the workflow state operators work with.
- **RecordState**: The *survival state* of a finding — `ACTIVE` / `ARCHIVED`. When the underlying issue is resolved, it moves to ARCHIVED.

> ⚠️ **Trap**: Do not confuse `Workflow.Status` with `RecordState`. `RecordState=ARCHIVED` means "the underlying issue is fixed so the finding is no longer valid" (system's judgment), while `Workflow.Status=RESOLVED` means "the operator marked it as handled" (human or automation's judgment). Also, `SUPPRESSED` means "I've seen it but deliberately ignoring it" — it drops from score and alerts but the record remains.

## Finding Aggregation and Integration

There are integrations that *send* findings to Security Hub and integrations that *receive* findings from Security Hub.

- **Inbound Integrations (→ Security Hub)**: GuardDuty, Inspector, Macie, IAM Access Analyzer, Firewall Manager, Config, Health, and numerous third parties (Palo Alto, Splunk, etc.). When enabled, they automatically flow in as ASFF.
- **Outbound/Response Integrations (Security Hub →)**: EventBridge (all findings auto-publish as events), ticketing (Jira/ServiceNow), SIEM.

In multi-account environments, **Organizations integration** designates a delegated administrator account to centralize all member findings in one place, and **Cross-Region Aggregation** consolidates findings from multiple regions into a single aggregation region.

> 🎯 **Scenario**: When the requirement is "see and enforce consistent standards for the entire organization (hundreds of accounts, multiple regions) on a single screen," the winning combination is (1) designate Security Hub delegated administrator in Organizations → (2) use Central Configuration to deploy standards and controls to all members → (3) use Cross-Region Aggregation to aggregate into one region → (4) ensure Config is enabled on every member account. Per-member manual setup is not the answer — *central configuration* is the critical keyword.

## Automated Response: Automation Rules and EventBridge

Security Hub provides two automation paths.

1. **Security Hub Automation Rules**: Within Security Hub *itself*, when findings arrive, if they match conditions (e.g., specific control ID + account), automatically update fields (raise/lower severity, change Workflow.Status to SUPPRESSED). Cannot perform external actions, but *strong* at noise reduction and priority adjustment.
2. **EventBridge-Based Response**: All findings automatically publish to EventBridge. EventBridge rules can capture specific finding patterns and execute Lambda/Step Functions/SSM Automation for *actual remediation* (e.g., block public access on an exposed S3 bucket).

```json
// EventBridge rule: Catch only CRITICAL GuardDuty findings and respond
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": { "Label": ["CRITICAL"] },
      "ProductArn": [{ "prefix": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty" }],
      "Workflow": { "Status": ["NEW"] }
    }
  }
}
```

> 💡 **Related Theory**: The combination of Security Hub + EventBridge + automated remediation is the AWS native implementation of SOAR (Security Orchestration, Automation and Response). AWS provides a pre-built solution for this: **Automated Security Response on AWS (ASR, formerly SHARR)** — a collection of playbooks that take Security Hub findings and auto-remediate via SSM Automation documents. On the exam, when asked "automated remediation solution for Security Hub findings," recall the EventBridge → SSM Automation path (or ASR).

## Custom Insights: Turning Findings into Questions

Security Hub provides **Insights**, which are saved views that group and filter findings. Beyond default-provided insights (e.g., "resources with public access," "resources with the most findings"), you can build custom insights using ASFF fields. Insights group findings by *grouping attribute* (e.g., resource ID, account) to reveal "where is risk concentrated."

## Summary: Security Hub's Place

If CloudWatch is single-signal threshold detection, Security Hub is *aggregation, normalization, and scoring of multiple signals*. Recapping core concepts: standards (CIS/FSBP, Config-based) → score (pass rate) → finding normalization (ASFF) → automation (Automation Rules for internal cleanup + EventBridge for external remediation). This flow connects directly to Day 4's EventBridge security automation.

---

## 📝 Practice Questions

**Question 1.** Which prerequisite service must be enabled for Security Hub security standards (CIS, FSBP) controls to be evaluated?

A) Amazon Macie  
B) AWS Config  
C) Amazon Inspector  
D) AWS Shield Advanced  

**Answer: B**  
Explanation: Security Hub standards controls internally evaluate resource settings with AWS Config rules, so Config must be enabled. Macie is sensitive data discovery, Inspector is vulnerability scanning, and Shield is DDoS protection, so none of them is a prerequisite for standards control evaluation.

---

**Question 2.** Which normalized format does Security Hub use to handle the different result formats of GuardDuty, Inspector, and Macie in a single scheme?

A) CloudTrail event schema  
B) ASFF(AWS Security Finding Format)  
C) VPC Flow Logs format  
D) Keep only the original OCSF format as-is  

**Answer: B**  
Explanation: Security Hub normalizes the results from all integrated sources into a single JSON schema called ASFF, so they can be searched and routed using the same fields (Severity.Normalized, Workflow.Status, etc.) regardless of origin. The CloudTrail/VPC Flow formats are different data, and OCSF is the format of Security Lake.

---

**Question 3.** After reviewing a particular finding, an operator wants to "intentionally ignore it but keep the record and exclude it from the security score and notifications." What value should be set in ASFF?

A) Set RecordState to ARCHIVED  
B) Set Workflow.Status to SUPPRESSED  
C) Set Severity.Normalized to 0  
D) Set Compliance.Status to PASSED  

**Answer: B**  
Explanation: Setting Workflow.Status to SUPPRESSED indicates the operator intentionally ignored it, and it is excluded from notifications and score aggregation while the record remains. RecordState=ARCHIVED is a value the system changes when it determines the underlying problem has been resolved, and arbitrarily manipulating severity or Compliance distorts the meaning.

---

**Question 4.** You want to apply Security Hub standards consistently across hundreds of member accounts and multiple Regions and view all findings in a single pane. What is the most appropriate approach?

A) Manually configure Security Hub individually in each account and Region  
B) Designate a delegated administrator in Organizations, deploy standards with Central Configuration, and aggregate into one Region with Cross-Region Aggregation  
C) Configure only SNS to forward all findings by email  
D) Simply turning on GuardDuty integrates everything automatically  

**Answer: B**  
Explanation: The answer for consistent multi-account, multi-Region operation is an Organizations delegated administrator + Central Configuration (bulk deployment of standards/controls) + Cross-Region Aggregation (a single aggregation Region). Per-account manual setup does not scale, SNS alone cannot enforce standards or aggregate, and GuardDuty is only a detector and does not replace standards checks or aggregation.

---

**Question 5.** When a CRITICAL finding arrives in Security Hub, you want to automatically perform actual remediation (for example, revoking an exposed security group rule). What is the standard architecture?

A) Directly modify the security group with a Security Hub Automation Rule  
B) Because findings are automatically published to EventBridge, match the pattern with an EventBridge rule and remediate with SSM Automation/Lambda  
C) A Config rule remediates automatically  
D) Macie remediates  

**Answer: B**  
Explanation: All Security Hub findings are automatically published to EventBridge, so the standard pattern (which AWS's ASR solution also follows) is to catch the CRITICAL pattern with an EventBridge rule and run actual remediation with an SSM Automation document or Lambda. Automation Rules only update or suppress finding fields and cannot directly change external resources, Config automatic remediation is at the Config rule level, and Macie is a data discovery tool.

---

