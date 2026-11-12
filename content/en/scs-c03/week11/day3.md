# Day 3 - Audit Manager and Compliance: Automated Evidence Collection, Frameworks (CIS/PCI), Config Integration

Once governance is established, the next question is: "How do we *prove* we are following the rules?" Auditing is inherently repetitive *evidence collection, mapping, and reporting*. **AWS Audit Manager** automates this process — automatically mapping AWS activities and configurations as evidence to control items of predefined regulatory frameworks, producing audit-ready reports. In the security exam, Audit Manager is "the tool for automatically collecting continuous compliance evidence," and its *integration* with Config, CloudTrail, and Security Hub is key.

## Core Concepts of Audit Manager

```
Framework (Framework)  ── Collection of regulatory/standard controls (CIS, PCI-DSS, SOC2, HIPAA, GDPR ...)
  └ Control      ── Individual requirement (e.g., "Enable root account MFA")
      └ Data Source      ── Where to get evidence (Config rule, CloudTrail, API call, manual)
Assessment       ── Applying a specific framework to a specific account/region scope
  └ Evidence     ── Compliance basis automatically/manually collected (snapshot, log, config, check result)
Assessment Report             ── Bundled evidence formatted for submission to auditors
```

The core value is **automated, continuous evidence collection**. Instead of taking screenshots before an audit, Audit Manager collects evidence throughout the assessment period.

> 💡 **Related Theory**: This is *Continuous Compliance / Compliance as Code*. Traditional audits were point-in-time sample inspections, but in the cloud, configuration and activity are observable via API, so *Continuous Control Monitoring* is possible. We're implementing NIST's RMF (Risk Management Framework) "continuous monitoring" phase as an automated evidence pipeline.

## Four Sources of Evidence

Audit Manager maps where to source evidence for each control. There are four main sources:

1. **AWS Config Rule Evaluation Results**: Resource configuration compliance/non-compliance. *Configuration evidence* like "EBS encrypted," "S3 public access blocked." → Core source for detective controls.
2. **AWS Security Hub Check Results**: Absorb CIS, FSBP, and other security standard check results as evidence.
3. **AWS CloudTrail Events**: *Activity evidence* of "who did what when." Example: root login, KMS key policy change, security group modification.
4. **AWS API Call Results (Resource Snapshots)**: Direct API queries of resource state at a specific point in time.

Items not automatically obtainable (physical security, policy documents, human procedures) are submitted as **manual evidence**. Real audit preparation is "automatic evidence + manual evidence."

## Config Integration: Foundation of Evidence Pipeline

Most of Audit Manager's automated configuration evidence comes from **Config rule evaluation**. Preconditions must be met:

```
Config Recorder activated (all regions/accounts)
   → Config rules (managed/custom) perform evaluation
   → Audit Manager maps rule results to controls
   → Compliance/non-compliance evidence accumulates during assessment
```

If Config is off or rules are missing, Audit Manager cannot generate automatic configuration evidence for that control — this is an exam trap. **Audit Manager requires Config, CloudTrail, and Security Hub to already be activated to reveal its full value**. Audit Manager does not *generate* data but *translates and aggregates* existing data into regulatory framework language.

```bash
# Prerequisite: Config Recorder and rules must be active
aws configservice put-configuration-recorder ...
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "encrypted-volumes",
  "Source": { "Owner": "AWS", "SourceIdentifier": "ENCRYPTED_VOLUMES" }
}'

# Create Audit Manager assessment (apply framework to scope)
aws auditmanager create-assessment \
  --name "PCI-DSS-Q2-2026" \
  --framework-id <PCI_FRAMEWORK_ID> \
  --scope '{ "awsAccounts": [{"id":"111122223333"}], "awsServices": [{"serviceName":"s3"},{"serviceName":"ec2"},{"serviceName":"kms"}] }' \
  --assessment-reports-destination '{ "destinationType":"S3","destination":"s3://audit-reports-bucket/pci/" }' \
  --roles '[{"roleType":"PROCESS_OWNER","roleArn":"arn:aws:iam::111122223333:role/AuditOwner"}]'
```

## Frameworks: Built-in vs Custom

Audit Manager provides multiple **prebuilt frameworks**: CIS AWS Foundations Benchmark, PCI-DSS, SOC 2, HIPAA, GDPR, NIST 800-53, FedRAMP, AWS Well-Architected, etc. Each framework already has a list of controls and recommended data source mappings.

- **CIS AWS Foundations Benchmark**: Infrastructure hygiene controls for IAM, logging, monitoring, networking. Most directly mapped to AWS environments.
- **PCI-DSS**: Card data protection. Encryption, access control, logging, network segmentation, etc. Many automate as Config rules, but some (physical, policy) require manual evidence.

**Custom Frameworks** combine standard controls or define your own. Use when coding internal security policies or specific contract requirements. Duplicate and modify standard framework controls to fit your environment.

## Multi-Account Auditing: Delegated Administrator

Audit Manager also integrates with Organizations to operate **organization-wide assessments from a delegated administrator account** (typically an Audit account). One assessment aggregates evidence from multiple accounts.

```bash
# Register Audit Manager delegated admin from Management Account
aws auditmanager register-account \
  --delegated-admin-account 222233334444
```

This ensures consistency with yesterday (central security account model) — GuardDuty, Security Hub, Config, and Audit Manager all operate from the same Audit account as delegated administrators, centralizing evidence, detection, and reporting.

> 💡 **Related Theory**: Centralizing evidence in a single *access-controlled* account reflects *audit trail integrity* requirement (preventing the evaluated party from directly manipulating evidence). Separating evaluated accounts from evidence custody/assessment accounts structurally blocks manipulation paths.

## Evidence Protection and Reporting

Collected evidence is stored in the S3 bucket specified during assessment setup and encrypted with KMS. Evidence should be treated as nearly immutable, so combining with Log Archive account's immutability pattern (Object Lock, etc.) is best practice. Assessment reports export as PDF/CSV for auditor submission.

## Role Distinction from Other Services (Avoid Confusion)

| Service | Role | "This service is the answer when" |
|---|---|---|
| **Config** | Record and evaluate resource config (compliant/non-compliant) | "Detect/evaluate if configuration follows rules" |
| **Security Hub** | Aggregate security standard checks, findings | "Security score, unified findings dashboard" |
| **Audit Manager** | Auto-map evidence to regulatory frameworks, *audit reports* | "Automate evidence/reports for auditors" |
| **CloudTrail** | API activity log (who, when, what) | "Activity tracking, forensic source log" |

Exams relentlessly test this distinction. "Automate evidence collection and reporting for audits" → Audit Manager. "Evaluate if resources follow rules" → Config. "Aggregate security findings and score" → Security Hub.

## Trap Summary

- Audit Manager does not *generate* evidence — Config, CloudTrail, Security Hub must be activated first for automatic evidence to accumulate.
- Not all controls automate. Physical, policy, procedures require *manual evidence* upload.
- If Config is inactive, configuration evidence is empty and assessment is incomplete.
- Organization-wide audits operate from *delegated administrator* account to centralize and isolate evidence.
- "Evaluation/detection" is Config, "evidence/reports" is Audit Manager — role confusion is a common wrong answer.

## 📝 Practice Questions

**Question 1.** The audit team has been manually collecting screenshots and configurations every quarter for PCI-DSS audits. We want to automate this. What is the most appropriate service?

A) Use AWS Config only  
B) Create a PCI-DSS framework assessment in AWS Audit Manager and automatically collect and report evidence from Config, CloudTrail, and Security Hub  
C) Use CloudTrail only  
D) GuardDuty  

**Answer: B**  
Explanation: Automatically mapping and collecting evidence to the controls of a regulatory framework and producing an audit report is the core use of Audit Manager. When you create an assessment from the prebuilt PCI-DSS framework, data from Config, CloudTrail, and Security Hub accumulates as per-control evidence. Config or CloudTrail alone are only evidence sources and do not do framework mapping or reporting, and GuardDuty is threat detection and unrelated to audit reporting.

---

**Question 2.** You created an Audit Manager assessment, but the automated configuration evidence for many controls is empty. What is the most likely cause?

A) Because Audit Manager cannot generate evidence itself  
B) Because the AWS Config recorder/rules are inactive, so there is no source of configuration evidence  
C) Because the wrong framework was selected  
D) Because the S3 bucket is encrypted  

**Answer: B**  
Explanation: The automated configuration evidence in Audit Manager comes from Config rule evaluation results. If Config is off or there are no rules, there is no data to map and the control evidence is empty. Audit Manager does not generate data but translates and aggregates existing data, so enabling the prerequisite services is a precondition. A framework selection error or bucket encryption is not a typical cause of this symptom.

---

**Question 3.** How are controls such as physical data center security and completion of employee security training reflected in an Audit Manager assessment?

A) Collected automatically with Config rules  
B) Since automatic collection is not possible, upload documents as manual evidence  
C) Collected with CloudTrail events  
D) They cannot be reflected  

**Answer: B**  
Explanation: Physical security, human procedures, and policy documents that cannot be observed through AWS APIs cannot be gathered as automated evidence, so they are uploaded as manual evidence. Real audit preparation is the sum of automated evidence and manual evidence. Config and CloudTrail only cover AWS configuration and activity, so they cannot collect these items, and the claim that they cannot be reflected is wrong.

---

**Question 4.** We want to aggregate organization-wide, multi-account audit evidence in one place and prevent the subjects being assessed from tampering with the evidence. What is the most appropriate design?

A) Operate separate Audit Manager assessments individually in each account  
B) Register the Audit Manager delegated administrator as the Audit account, operate the organization-wide assessment from that account, and isolate and aggregate the evidence  
C) Operate all assessments from the management account  
D) Store evidence locally in each workload account  

**Answer: B**  
Explanation: Operating the organization-wide assessment from the delegated administrator (usually the Audit account) aggregates evidence in one place and separates the accounts being assessed from the account that retains evidence and runs the assessment, blocking the evidence tampering path. This is also consistent with the GuardDuty, Security Hub, and Config delegation models. Distributed per-account operation loses aggregation and integrity, concentrating in the management account enlarges the attack surface, and local storage risks being tampered with or deleted along with the account if it is compromised.

---

**Question 5.** In which of the following statements is the service role matching correct?

A) "Evaluate whether resource configurations comply with rules" -> Audit Manager  
B) "Automatically collect and report evidence for auditors by framework" -> Audit Manager  
C) "Record who left API activity logs and when" -> Config  
D) "Detect threat activity" -> Audit Manager  

**Answer: B**  
Explanation: Automatically collecting evidence by regulatory framework and producing audit reports is the unique role of Audit Manager. Resource configuration evaluation belongs to Config, API activity recording to CloudTrail, and threat detection to GuardDuty, so the other matches are wrong. The exam frequently asks about the role boundaries of these four services.

---
