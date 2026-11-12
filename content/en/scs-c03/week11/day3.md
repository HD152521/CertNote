# Day 3 - Audit Manager and Compliance: Automated Evidence Collection, Frameworks (CIS/PCI), and Integration with Config

Once governance is in place, the next question is "so how do we *prove* that we are complying with the regulations?" Auditing is, at its core, the repetitive labor of *collecting, mapping, and reporting evidence*. **AWS Audit Manager** automates this process: it automatically maps AWS activity and configuration evidence to the controls of predefined regulatory frameworks and produces audit-ready reports. On the security exam, Audit Manager appears as "the tool that automatically gathers continuous compliance evidence," and its *integration* with Config, CloudTrail, and Security Hub is the key.

## Core Concepts of Audit Manager

```
Framework          ── a collection of controls for a regulation/standard (CIS, PCI-DSS, SOC2, HIPAA, GDPR ...)
  └ Control        ── an individual requirement (e.g. "root account MFA enabled")
      └ Data source ── where the evidence comes from (Config rules, CloudTrail, API calls, manual)
Assessment         ── the execution unit that applies a specific framework to a specific account/Region scope
  └ Evidence       ── compliance proof collected automatically/manually (snapshots, logs, settings, check results)
Assessment report  ── bundles the evidence into a form that can be submitted to auditors
```

The core value is the **automatic, continuous collection of evidence**. Instead of taking screenshots in a rush just before an audit, Audit Manager gathers evidence throughout the assessment period.

> 💡 **Related theory**: This is *Continuous Compliance / Compliance as Code*. Traditional auditing was point-in-time sampling, but in the cloud, configuration and activity are observable through APIs, so *Continuous Control Monitoring* becomes possible. It amounts to implementing the "continuous monitoring" step of NIST's RMF (Risk Management Framework) as an automated evidence pipeline.

## The Four Sources of Evidence

Audit Manager maps, for each control, where to get the evidence. There are four main sources.

1. **AWS Config rule evaluation results**: Whether a resource's configuration is compliant or noncompliant. *Configuration evidence* such as "EBS is encrypted" or "S3 Block Public Access is on." -> The core source for detective controls.
2. **AWS Security Hub check results**: Absorbs the results of security standard checks such as CIS and FSBP as evidence.
3. **AWS CloudTrail events**: *Activity evidence* of "who did what and when." Examples: root login, a KMS key policy change, a security group modification.
4. **AWS API call results (resource snapshots)**: A snapshot obtained by querying a resource's state directly through the API at a specific point in time.

For items that cannot be obtained automatically (physical security, policy documents, human procedures), you upload **manual evidence**. Real audit preparation is the sum of "automatic evidence + manual evidence."

| Evidence source | Nature of evidence | Question it can answer | Prerequisite |
|---|---|---|---|
| **Config rule evaluation** | Configuration | "Is this resource in a state that follows the rule?" | Config recorder + rules active |
| **Security Hub checks** | Compliance against a standard | "Did it pass under the CIS/FSBP criteria?" | Security Hub enabled + standard subscribed |
| **CloudTrail events** | Activity | "Who changed what, and when?" | CloudTrail trail active |
| **API call snapshot** | Point-in-time state | "What was the resource's actual setting at that time?" | Read permission for the assessment role |
| **Manual evidence upload** | Documents, procedures | "Do policy documents, training completion, and physical controls exist?" | A person collects and uploads |

The difference in the nature of evidence is the axis of exam judgment. **Configuration evidence answers "is the current state correct?", and activity evidence answers "what happened in the meantime?"** Auditors mostly demand both: "all EBS volumes are encrypted now" alone is not enough, and you must also show that "encryption was never turned off during the last quarter." That is why an audit holds together only when Config (current state + configuration history) and CloudTrail (change actions) are both turned on.

Audit evidence is required to have the same three qualities as courtroom evidence: **completeness**, **integrity**, and **provenance**. Completeness means it was collected without gaps across the whole assessment period (so the Config recorder must stay on), integrity means it has not been tampered with since collection (CloudTrail log file validation, S3 Object Lock, KMS), and provenance means it can be explained which system generated this evidence and how (Audit Manager's data source mapping). The value of Audit Manager is that, instead of screenshots, it automatically builds an evidence chain that satisfies these three qualities.

## Integration with Config: The Foundation of the Evidence Pipeline

Most of Audit Manager's automatic configuration evidence comes from **Config rule evaluations**. Therefore the following prerequisites must be met:

```
Config recorder enabled (all Regions/accounts)
   → Config rules (managed/custom) evaluate
   → Audit Manager maps those rule results to controls
   → Compliant/noncompliant evidence accumulates throughout the assessment period
```

If Config is off or there are no rules, Audit Manager cannot produce automatic configuration evidence for that control, and this is an exam trap. In other words, **Audit Manager shows its true value only when Config, CloudTrail, and Security Hub are turned on *first***. Audit Manager does not *generate* data; it *translates and aggregates* existing data into the language of the control framework.

```bash
# Prerequisite: the Config recorder and rules must be enabled
aws configservice put-configuration-recorder ...
aws configservice put-config-rule --config-rule '{
  "ConfigRuleName": "encrypted-volumes",
  "Source": { "Owner": "AWS", "SourceIdentifier": "ENCRYPTED_VOLUMES" }
}'

# Create an Audit Manager assessment (apply the framework to a scope)
aws auditmanager create-assessment \
  --name "PCI-DSS-Q2-2026" \
  --framework-id <PCI_FRAMEWORK_ID> \
  --scope '{ "awsAccounts": [{"id":"111122223333"}], "awsServices": [{"serviceName":"s3"},{"serviceName":"ec2"},{"serviceName":"kms"}] }' \
  --assessment-reports-destination '{ "destinationType":"S3","destination":"s3://audit-reports-bucket/pci/" }' \
  --roles '[{"roleType":"PROCESS_OWNER","roleArn":"arn:aws:iam::111122223333:role/AuditOwner"}]'
```

### Config Rule, Conformance Pack, Audit Manager: Division of Roles Across Three Layers

You need to get the relationship among these three exactly right so you do not waver on the exam. Understand it as three layers: **one rule -> a bundle of rules -> translation into regulatory language**.

| | Config Rule | Conformance Pack | Audit Manager |
|---|---|---|---|
| Unit | A single individual rule | A **bundle (pack)** of rules + remediation actions | A regulatory **framework** (a set of controls) |
| Deployment method | Create the rule per account and Region | Deploy a YAML template across accounts/the organization | Apply an assessment to a scope |
| Output | COMPLIANT / NON_COMPLIANT | Compliance score and dashboard per pack | **Evidence + reports for audit submission** |
| Remediation | Connect an SSM Automation per rule | Remediation definitions can be included in the pack | No remediation capability (evidence collection only) |
| Organization deployment | Possible as organization Config rules | Possible as organization Conformance Packs | Organization assessments from the delegated administrator |
| When it is the answer | "Evaluate and remediate one specific condition" | "Deploy a CIS/PCI rule set to many accounts at once" | "Automate the evidence and reports to hand to auditors" |

The key dividing line is the last row. **A Conformance Pack is the tool that "lays down rules to create a compliant state," and Audit Manager is the tool that "packages an already-created compliant state as evidence."** Both come with the same names, CIS and PCI, so they are very easy to confuse. In the choices, "quickly deploy a CIS rule set across many accounts" -> Conformance Pack, and "submit a CIS audit report every quarter" -> Audit Manager.

```yaml
# Excerpt of a Conformance Pack template: rule + automatic remediation as one bundle
Resources:
  S3PublicReadProhibited:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
  S3PublicReadRemediation:
    Type: AWS::Config::RemediationConfiguration
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      TargetType: SSM_DOCUMENT
      TargetId: AWS-DisableS3BucketPublicReadWrite
      Automatic: true
      MaximumAutomaticAttempts: 3
      RetryAttemptSeconds: 60
```

When a Conformance Pack is deployed, it creates in each account the **Config rules + remediation configuration + a dedicated S3 delivery bucket**. There is a constraint that is often missed here: the rules in a pack can evaluate only the resource types that the Config recorder of that account and Region records. If you narrow the recorder scope to specific resource types to save cost, even after deploying the pack a good number of rules remain `INSUFFICIENT_DATA` with no evaluation data. And when this `INSUFFICIENT_DATA` is passed to Audit Manager, it becomes a state that is "neither compliant nor noncompliant," and the audit flags it as an **evidence gap**. This narrowed recorder scope is the second cause of "why is the evidence empty even though I turned Config on?"

## Frameworks: Standard vs. Custom

Audit Manager provides many **prebuilt frameworks**: CIS AWS Foundations Benchmark, PCI-DSS, SOC 2, HIPAA, GDPR, NIST 800-53, FedRAMP, AWS Well-Architected, and others. Each framework already has a list of controls and a recommended data source mapping.

- **CIS AWS Foundations Benchmark**: Infrastructure hygiene controls for IAM, logging, monitoring, and networking. It maps most directly to AWS environments.
- **PCI-DSS**: Cardholder data protection: encryption, access control, logging, network segmentation, and so on. Many are turned into automatic evidence by Config rules, but some (physical, policy) need manual evidence.

A **custom framework** is created by combining standard controls or defining your own controls. It is used to codify internal security policies or specific contractual requirements. You copy and modify the controls of a standard framework to fit your own environment.

What you specify when creating a custom control is, in the end, a mapping of **"where to get the evidence for this requirement."**

```bash
# Define a custom control: map 2 Config rules + 1 CloudTrail event as evidence sources
aws auditmanager create-control \
  --name "INT-SEC-014-RootAccountHygiene" \
  --description "The root account has MFA, has no access keys, and its logins are monitored" \
  --testing-information "Check root MFA status, whether root access keys exist, and root login events" \
  --action-plan-title "Root account hygiene remediation" \
  --action-plan-instructions "If MFA is not set, register a hardware token; if an access key is found, delete it immediately" \
  --control-mapping-sources '[
    {
      "sourceName": "root-mfa-enabled",
      "sourceSetUpOption": "System_Controls_Mapping",
      "sourceType": "AWS_Config",
      "sourceKeyword": {"keywordInputType":"SELECT_FROM_LIST","keywordValue":"ROOT_ACCOUNT_MFA_ENABLED"},
      "sourceFrequency": "DAILY"
    },
    {
      "sourceName": "no-root-access-key",
      "sourceSetUpOption": "System_Controls_Mapping",
      "sourceType": "AWS_Config",
      "sourceKeyword": {"keywordInputType":"SELECT_FROM_LIST","keywordValue":"IAM_ROOT_ACCESS_KEY_CHECK"},
      "sourceFrequency": "DAILY"
    },
    {
      "sourceName": "root-console-login",
      "sourceSetUpOption": "System_Controls_Mapping",
      "sourceType": "AWS_Cloudtrail",
      "sourceKeyword": {"keywordInputType":"SELECT_FROM_LIST","keywordValue":"ConsoleLogin"},
      "sourceFrequency": "DAILY"
    }
  ]'

# Bundle the custom controls to create a custom framework
aws auditmanager create-assessment-framework \
  --name "Internal-Security-Standard-2026" \
  --compliance-type "INTERNAL" \
  --control-sets '[{
    "name": "IAM and account hygiene",
    "controls": [{"id":"<control-id-1>"},{"id":"<control-id-2>"}]
  }]'

# Path for copying a standard framework and modifying it for your environment
aws auditmanager list-assessment-frameworks --framework-type Standard
aws auditmanager get-assessment-framework --framework-id <id>
```

This CLI reveals one fact. That `sourceType` is `AWS_Config` or `AWS_Cloudtrail` is a structural declaration that **Audit Manager is a consumer of evidence, not a producer**. If the source is empty, the control is left as an empty shell.

```bash
# Check collected evidence and supplement with manual evidence
aws auditmanager get-evidence-folders-by-assessment \
  --assessment-id <assessment-id> --max-results 50

aws auditmanager batch-import-evidence-to-assessment-control \
  --assessment-id <assessment-id> \
  --control-set-id "IAM and account hygiene" \
  --control-id <control-id> \
  --manual-evidence '[{"s3ResourcePath":"s3://audit-manual-evidence/2026Q2/security-training-completion.pdf"}]'

# Generate the audit report -> output to the specified S3
aws auditmanager create-assessment-report \
  --name "PCI-DSS-2026Q2-Report" \
  --description "PCI-DSS audit submission for Q2 2026" \
  --assessment-id <assessment-id>
```

> ⚠️ **Pitfall**: An assessment gathers evidence **only for the scope (accounts, services) specified at creation time**. If a new account joins the organization or a new service is adopted mid-quarter and you do not update the assessment scope, that target reaches the end of the audit period with no evidence at all. Worse, it does not show up as "noncompliant" in the report: it **does not appear at all**. If an auditor discovers it, it spreads from a control omission to a problem with the reliability of the audit scope. The practical solution is to put an "update the assessment scope" step in the account issuance pipeline (AFT/CfCT).

## Multi-Account Auditing: Delegated Administrator

Audit Manager also integrates with Organizations and runs organization-wide assessments from a **delegated administrator account** (usually the Audit account). A single assessment then aggregates evidence from multiple accounts.

```bash
# Register the Audit Manager delegated administrator from the management account
aws auditmanager register-account \
  --delegated-admin-account 222233334444
```

This is consistent with yesterday (the central security account model): GuardDuty, Security Hub, Config, and Audit Manager are all delegated and operated from the same Audit account, so evidence, detection, and reporting come together in one place.

Concentrating evidence in a single *privilege-separated* account is driven by the requirement of *audit trail integrity* (so that the party being assessed cannot tamper with the evidence directly). If you separate the accounts being assessed from the account that stores evidence and runs the assessment, you structurally block the path of tampering with evidence to hide noncompliance.

## Evidence Protection and Reporting

Collected evidence is stored in the S3 bucket specified when setting up the assessment and is encrypted with KMS. Since the evidence itself should be handled as close to unmodifiable as possible, it is good to combine it with the Log Archive account's immutability patterns (Object Lock and so on). The assessment report is output as PDF/CSV and submitted to auditors.

Drawing the whole evidence pipeline as one diagram gives this.

```
[ Workload accounts ]
   │ resource configuration changes │ API calls
   ▼                                ▼
AWS Config recorder             CloudTrail (organization trail)
   │ rule evaluation                │ events
   ▼                                │
Config Rules /                      │        Security Hub
Conformance Packs                   │        (CIS and FSBP checks)
   │ COMPLIANT/NON_COMPLIANT        │             │ findings
   └────────────┬───────────────────┴─────────────┘
                ▼
      ┌──────────────────────────────────┐
      │  Audit account (delegated admin)  │
      │  AWS Audit Manager               │
      │   · framework controls <- evidence mapping │
      │   · evidence accumulates throughout the assessment period │
      │   + manual evidence (policy documents, training completion) │
      └───────────────┬──────────────────┘
                      ▼
      Assessment report (PDF/CSV) ──▶ S3 (KMS encrypted)
                                 └─ Object Lock / versioning / restricted access
                                          │
                                          ▼
                                   Submitted to external auditors

Note: administrators of the assessed accounts must not be able to modify or delete evidence on this path.
```

> 🎯 **Scenario**: An external auditor demands, "Prove that encryption at rest on the production RDS was never once disabled during the last 12 months." All current Config rules are COMPLIANT, and the Audit Manager assessment was created 3 months ago. What is the problem and how do you answer? -> That the current state is COMPLIANT is only *point-in-time configuration evidence* and does not prove a 12-month history. What you need is (1) the **Config configuration item timeline**: query the attribute change history of that resource over the period; (2) **CloudTrail events**: whether change actions such as `ModifyDBInstance` exist; and (3) whether these two sources **had been turned on since 12 months ago**. If the assessment was created 3 months ago, Audit Manager's automatic evidence covers only 3 months, so the earlier period must be extracted directly from the Config history and CloudTrail logs and supplemented as manual evidence. The real lesson of this situation is that **you must turn on evidence collection before the audit request arrives**: the one asset that cannot be created retroactively is the log.

In August 2020, the US Office of the Comptroller of the Currency (OCC) imposed an **$80 million civil money penalty on Capital One**. The surface trigger was the large-scale data breach of 2019 (an incident in which SSRF against a misconfigured firewall was used to obtain the IAM role credentials from EC2 instance metadata and read S3 data), but what the OCC took issue with was less the breach itself than that **risk assessment and internal control monitoring were inadequate during the cloud migration, and internal audit failed to identify and report that inadequacy**. In other words, the regulator's concern was not "did an incident occur" but "can you prove that controls are designed and continuously verified." This is why continuous evidence collection tools like Audit Manager are not optional in regulated industries: the mere fact that controls existed is not enough, and you must show *that the controls were working* over a period.

> 🎯 **Scenario**: An organization has 120 accounts, and only 12 of them, the ones handling cardholder data, are subject to audit. You want to clarify the PCI scope while reducing audit cost and noise. How do you design it? -> (1) Separate the cardholder data accounts into a **dedicated OU (for example, OU: PCI-Scope)** to physically narrow the network and permission boundaries. (2) Limit the Audit Manager assessment's `scope.awsAccounts` to those 12 accounts. An organization-wide assessment causes evidence to balloon and makes the audit scope itself ambiguous, which is actually a disadvantage. (3) Apply a PCI-specific Conformance Pack and hardened SCPs (Region restriction, encryption enforcement) to that OU to create the compliant state first. (4) Block access paths from out-of-scope accounts into the cardholder data accounts with SCPs and RCPs, making **scope reduction** provable. In a PCI audit, the cheapest control is always "reducing the scope."

## Role Distinction from Other Services (Preventing Confusion)

| Service | Role | "When this service is the answer" |
|---|---|---|
| **Config** | Records and evaluates resource configuration (compliant/noncompliant) | "*Detect/evaluate* whether the configuration follows the rule" |
| **Security Hub** | Security standard checks and findings aggregation | "Security score and an integrated findings dashboard" |
| **Audit Manager** | Automatically maps evidence to regulatory frameworks and produces *audit reports* | "Automate the *evidence/reports* to hand to auditors" |
| **CloudTrail** | API activity log (who, when, what) | "Activity tracking and the source log for forensics" |

The exam asks about this distinction relentlessly. "*Automatically collect and report* evidence for audit preparation" -> Audit Manager. "*Evaluate* whether a resource follows the rule" -> Config. "*Aggregate and score* security findings" -> Security Hub.

## Pitfall Summary

- Audit Manager does not *generate* evidence: Config, CloudTrail, and Security Hub must be turned on first for automatic evidence to accumulate.
- Not every control is automated. Physical, policy, and procedural controls need *manual evidence* uploaded.
- If Config is inactive, configuration evidence is empty and the assessment becomes incomplete.
- Run organization-wide auditing from the *delegated administrator* account to aggregate and isolate the evidence.
- "Evaluation/detection" is Config, "evidence/reports" is Audit Manager: role confusion is easily used as a wrong answer.
- A Conformance Pack *deploys rules*, and Audit Manager *packages evidence*. Even with the same names (CIS/PCI), the roles differ.
- Narrowing the Config recorder scope turns rules into `INSUFFICIENT_DATA`, and the audit flags this as an *evidence gap*.
- An assessment sees only *the scope specified at creation*: new accounts and services do not appear at all unless you update the scope.
- A current COMPLIANT status is not *proof over a period*. Proving history needs Config configuration history + CloudTrail.
- Logs and evidence cannot be generated retroactively: only what you turned on before the audit request arrived becomes evidence.

## Summary

- [ ] Does the Config recorder record **all required resource types** in **all target accounts and Regions**?
- [ ] Is the CloudTrail organization trail turned on with multi-Region + log file validation?
- [ ] Did you subscribe to Security Hub standards (CIS/FSBP) and secure the check results as an evidence source?
- [ ] Did you delegate Audit Manager to the Audit account, separating the assessed targets from evidence storage?
- [ ] Is there a procedure to synchronize the assessment scope (accounts, services) with the new account issuance pipeline?
- [ ] Are the owner and cadence set for uploading manual evidence for controls that cannot be automated (physical, policy, training)?
- [ ] Is the evidence/report S3 bucket protected with KMS encryption + versioning + Object Lock + least privilege?
- [ ] Did you choose the tool by distinguishing "rule deployment is Conformance Pack, evidence and reporting is Audit Manager"?
- [ ] Did you narrow the audit scope to a dedicated OU to reduce the burden of proof and noise?
- [ ] For controls that need proof over a period, are the Config configuration history and CloudTrail retention periods sufficient?

---

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
