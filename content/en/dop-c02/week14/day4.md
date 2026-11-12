# Day 4 - Audit Manager, Macie, Inspector: Evidence Automation, Data Classification, Vulnerability Scanning Principles

The last piece of the security automation stack is offloading to machines "the three things humans most hate doing." Compliance audit season's manual screenshot and log collection, finding buried SSNs and card numbers in petabyte-scale data lakes, and cross-referencing thousands of incoming CVEs against thousands of workloads. Audit Manager, Macie, and Inspector handle these three respectively. From the console they look like "plug-and-play compliance and security tools," but beneath lies the philosophy of continuous compliance, machine-learning-based data classification with pattern matching, the history of CVE/CVSS vulnerability standardization, and proving least privilege with IAM data. Today we examine what each does internally and how IAM Access Analyzer, Firewall Manager, and CloudTrail Lake complete the overall security automation stack.

In the DOP exam, this domain appears as "automated audit evidence collection + sensitive data discovery + vulnerability management + external exposure detection," with scenarios like "collect SOC2 audit evidence continuously," "auto-discover PII in S3," "scan container images for dependency CVEs at push," and "find resources exposed to external accounts." Distinguishing each tool's role boundaries reveals the answers.

## Continuous Compliance — Transforming Audit from Event to State

Traditional compliance audits were **events** — auditors would arrive quarterly or annually, collect evidence at that point in time, evaluate, and leave. Two problems: First, no one knows the actual state between audits (point-in-time illusion). Second, evidence collection is manual drudgery, expensive and error-prone — taking screenshots, capturing policies, exporting logs, pasting into spreadsheets.

**Continuous compliance** transforms this into **state** — evidence is collected continuously and automatically, so "are we SOC2-compliant right now" can be answered with data at any moment. This is the compliance version of DevOps transforming "release as event" into "continuous delivery flow." Audit Manager is the tool enabling this transition.

> 💡 **Related Theory**: Continuous compliance is the cloud-native evolution of **GRC (Governance, Risk, Compliance)**. Traditional GRC tools (Archer, ServiceNow GRC) required humans to input and manage controls, evidence, and risks. In the cloud, evidence is API-exposed (Config, CloudTrail, Security Hub already know state), so evidence collection can be automated. The core concept is **mapping controls to evidence** — regulatory frameworks (SOC2's trust service criteria, HIPAA's security rules) define abstract controls ("access must follow least privilege"), and concrete evidence proving compliance (IAM policy snapshots, access logs) is automatically collected and mapped. This mapping bridges "abstract regulation → concrete technical evidence," and Audit Manager's Framework pre-lays this bridge.

## AWS Audit Manager — Auto-Mapping Evidence to Controls

Audit Manager provides pre-defined **Frameworks** (SOC2, HIPAA, PCI DSS, GDPR, ISO 27001, etc.). A Framework contains the regulatory controls, and for each control, **evidence is automatically collected** — pulling evidence from CloudTrail (API activity), Config (resource state), and Security Hub (security findings) and mapping it to the control. Custom Frameworks can also be created, and ultimately an **Assessment Report** is generated for auditors.

```bash
aws auditmanager create-assessment --name SOC2-2026 \
  --framework-id <framework-id> \
  --assessment-reports-destination destinationType=S3,destination=s3://audit-reports/ \
  --roles roleType=PROCESS_OWNER,roleArn=arn:aws:iam::...:role/AuditOwner \
  --scope '{"awsAccounts":[{"id":"PROD-ACCT"}]}'
```

> ⚠️ **Pitfall**: Don't confuse Audit Manager with Security Hub/Config roles. **Config/Security Hub evaluate "are we compliant right now" and remediate violations** — they're operational tools. **Audit Manager collects and organizes evidence to prove compliance to auditors** — it's an audit preparation tool. If Config says "S3 is encrypted," Audit Manager says "S3 is encrypted — here's the evidence (Config snapshot, CloudTrail logs) attached to the relevant SOC2 control, packaged in a report." In exams: "auto-fix violations" is Config; "auto-collect audit evidence and create reports" is Audit Manager.

## Amazon Macie — Pattern Matching and ML for Data Classification

Macie automatically discovers **sensitive data** in S3 objects. It classifies data using pre-defined identifiers (credit card numbers, U.S. SSNs, passport numbers, medical records, etc.) and custom identifiers (regex), emitting Findings to Security Hub when discovered.

The core mechanism is two-layered. **Deterministic pattern matching** (regex + validation algorithms) catches structured identifiers like card numbers and SSNs, while **machine learning and contextual analysis** makes non-structural judgments like "does this text block look like a medical record?"

> 🔍 **Deeper**: Credit card detection shows the sophistication of data classification. Card numbers must satisfy the **Luhn algorithm** (1954, Hans Peter Luhn at IBM, ISO/IEC 7812 standardized) — a checksum where the last digit (check digit) must match a value computed from preceding digits. Macie finds 16-digit patterns, then runs Luhn validation to filter false positives (accidentally 16-digit numbers like order IDs). SSNs also validate against issuance rules. This "pattern + validation" dual structure determines classification accuracy — pattern alone causes false positive explosions. This exemplifies the classic text-processing tradeoff between regex and structured validation.

> 💡 **Related Theory**: Macie solves the problem in data governance of "know your data." Regulations like GDPR (2018), CCPA (California), HIPAA demand "you must know where PII is, protect it, and delete it if requested (right to be forgotten)." But finding PII in petabyte-scale lakes is impossible manually — this is the **dark data** problem. Macie illuminates this darkness through automated discovery. The key pattern is "classify before you protect" — without knowing what's sensitive, you can't protect appropriately. Macie's Finding goes to Security Hub and surfaces "SSN in public bucket" as Critical — this is the chain from classification → risk assessment → response. Lesson: response speed is proportional to knowing what you use; asset and dependency inventories are security's prerequisite.

```bash
aws macie2 enable-macie
aws macie2 create-classification-job --job-type ONE_TIME \
  --name pii-scan-prod \
  --s3-job-definition '{"bucketDefinitions":[{"accountId":"111","buckets":["prod-data"]}]}'
```

> ⚠️ **Pitfall**: Macie charges **per-object, per-storage-unit**, and large data lakes can be costly. Running full-scan Discovery Jobs every time balloons costs. Industry practice separates ①automated sensitive data discovery (sampling-based continuous monitoring, low cost) and ②full Discovery Jobs (precise, high cost), scanning only new/changed objects incrementally to control costs. In exams, "large lake PII scan" pitfall is usually "full scan repeats without cost consideration."

## Inspector v2 — CVE and Vulnerability Management Standardization

Inspector v2 (re-released 2021) scans EC2, ECR container images, and Lambda across the board to find **CVEs (Common Vulnerabilities and Exposures)**.

| Target | Scans For |
|--------|----------|
| **EC2** | Known CVEs in OS packages (via SSM Agent) |
| **ECR Container Images** | OS packages + language dependencies (npm·pip·gem, etc.) CVEs |
| **Lambda** | Function code and dependency CVEs |

The key is **continuous monitoring** — not scan-once-and-done, but auto-re-evaluating already-scanned assets when new CVEs are published. "Yesterday's image was safe, but today's published CVE makes it vulnerable" is caught automatically. Findings integrate to Security Hub.

> 🔍 **Deeper**: Understanding **CVE and CVSS history** reveals vulnerability management's structure. **CVE**, started by MITRE in 1999, is a "dictionary assigning unique identifiers to known vulnerabilities (like CVE-2021-44228)." Before CVEs, vendors called the same vulnerability different names — chaos. CVE created "a common language for vulnerabilities." **CVSS** (see Day 2) scores severity 0-10. **NVD** (National Vulnerability Database, NIST-run) is the U.S. government DB attaching CVSS scores and impact analysis to CVEs. Inspector consumes this ecosystem — it extracts asset package inventory, cross-references CVE feeds, scores severity from NVD's CVSS, and reports via ASFF to Security Hub. Inspector's value lies not in "scanning engine" but in "continuously-updated CVE feed × my asset inventory cross at all times."

> 📚 **Case Study**: **Log4Shell (CVE-2021-44228, CVSS 10.0)**, disclosed December 2021, is a remote code execution in Java's Log4j logging library. Nearly every Java app depended on Log4j directly or indirectly, making it "one of the broadest vulnerabilities in internet history." The core lesson: **dependency visibility**. Many organizations couldn't instantly answer "which services use Log4j?" — late response. This is why **SBOM (Software Bill of Materials, software component inventory)** and **SLSA (Supply-chain Levels for Software Artifacts, Google 2021, "salsa")** became critical. SBOM is "list of all components in this build," answering "where does the vulnerable component live?" instantly during Log4Shell-style incidents. Lesson: response speed correlates with knowing what you use — asset and dependency inventory is security's prerequisite.

```bash
aws inspector2 enable --resource-types EC2 ECR LAMBDA
```

> 🔍 **Deeper**: Post-Log4Shell, **SLSA** (Google 2021) is a software supply-chain integrity framework. It proves build provenance, ensuring "this artifact really built from trusted source without tampering" (levels 1-4). ECR already combines image signing (AWS Signer), immutable tags, and Inspector enhanced scanning to harden container supply chains. In DOP context, "ECR push with automatic CVE scan (Inspector enhanced scanning) + signature validation + immutable tags" is the container supply-chain security standard pattern.

## IAM Access Analyzer — Proving Least Privilege with Data

IAM Access Analyzer does four things.

| Capability | Description |
|------------|-------------|
| **External Access Findings** | Auto-discover resources (S3, IAM Role, KMS, etc.) exposed to external (different account, public) |
| **Unused Access Findings** | Find IAM Roles, permissions, access keys unused over a period (2023+) |
| **Policy Validation** | Auto-validate IAM policy syntax and security best practices while writing |
| **Policy Generation** | Auto-generate policy containing only actually-used permissions from CloudTrail activity logs |

> 🔍 **Deeper**: External Access Findings' internal engine is interesting. Access Analyzer uses **automated reasoning** — using mathematical logic to "prove" whether a policy permits external access. AWS's **Zelkova** engine converts IAM policies into logical formulas that SMT (Satisfiability Modulo Theories) solvers can solve, mathematically proving "does a case exist where external principals can access under this policy?" This is **formal verification**, not empirical "test the policy" — it reasons about all possible requests and guarantees correctness. No "unlucky missed case" exists — if the policy allows external access, it's found. Automated reasoning is AWS's core tech used in multiple places (S3 Block Public Access, VPC Reachability Analyzer, etc.) in AWS's "Provable Security" initiative.

> 💡 **Related Theory**: Policy Generation and Unused Access implement the **Principle of Least Privilege** with data. Least Privilege, established by Saltzer & Schroeder's 1975 seminal paper *"The Protection of Information in Computer Systems"* as one of 8 core security design principles, says "subjects should possess only privileges strictly necessary for their task." The practical problem: "strictly necessary" is hard for humans to determine, so permissions usually end up oversized (privilege creep) and never shrink. Access Analyzer inverts this. Policy Generation extracts only **actually-used permissions** from CloudTrail, creating policies (observation-based least privilege); Unused Access finds **unused permissions** for removal. "Achieve least privilege through observation, not guessing" is the principle.

```bash
# Organization-wide analyzer
aws accessanalyzer create-analyzer --analyzer-name org-analyzer --type ORGANIZATION

# CloudTrail-based policy generation (actual-use permissions only)
aws accessanalyzer start-policy-generation \
  --policy-generation-details principalArn=arn:aws:iam::...:role/Analyst,cloudTrailDetails={accessRole=...,trails=[...],startTime=...}
```

## Firewall Manager and CloudTrail Lake — Completing the Stack

**Firewall Manager** manages multi-account WAF, Shield, Network Firewall, and security group policies centrally. Integrated with Organizations, it auto-applies policies to new accounts and resources — "enforce this WAF rule on every ALB across the org" becomes one-time setup.

**CloudTrail Lake** is a SQL-queryable data store of CloudTrail events, retaining up to 7 years and unifying multi-account and multi-region. Security incident investigation becomes answering "what API did this credential call 3 years ago" with SQL.

> 💡 **Related Theory**: Mapping this entire stack to NIST's **Cybersecurity Framework (CSF)** 5 functions — Identify, Protect, Detect, Respond, Recover — completes the picture. **Identify**: Config (inventory), Macie (data classification), Access Analyzer (exposure/unused). **Protect**: Firewall Manager (WAF/SG), Conformance Pack. **Detect**: GuardDuty (threats), Inspector (vulnerabilities), Security Hub (integration). **Respond**: EventBridge→SSM/Lambda auto-remediation. **Recover**: Snapshots, backups. Knowing which AWS service fills which CSF function lets you quickly diagnose in scenarios "what's missing and what should fill it."

```
Comprehensive Security Automation Stack (NIST CSF Mapping)
==================================================
  Identify   ├─ Config(inventory) ├─ Macie(data) └─ Access Analyzer(exposure·unused)
  Protect    ├─ Firewall Manager ├─ Conformance Pack └─ KMS/encryption
  Detect     ├─ GuardDuty(threats) ├─ Inspector(vulnerabilities) └─ Security Hub(integration·ASFF)
  Respond    └─ EventBridge → SSM Automation / Lambda
  Recover    └─ Snapshots / Backups / PITR
  Forensics  └─ CloudTrail Lake (7y, SQL)
```

> 🎯 **Scenario**: "Fintech org needs ①continuous SOC2/PCI audit evidence ②auto-discover card numbers and SSNs in data lake S3, cost-controlled ③ECR push auto-scans npm/pip dependency CVEs + auto-re-evaluates on new CVEs ④discover S3/roles exposed to external accounts via formal proof ⑤shrink over-granted IAM permissions to observation-based least privilege ⑥7-year security incident SQL investigation." → ① Audit Manager Frameworks (SOC2, PCI) + Assessment Report ② Macie auto-discovery (sampling continuous) + incremental Discovery Job for new/changed (cost-controlled) ③ Inspector v2 ECR enhanced scanning (continuous monitoring) ④ Access Analyzer External Findings (Zelkova formal reasoning) ⑤ Access Analyzer Policy Generation (CloudTrail-based) + Unused Access ⑥ CloudTrail Lake (7-year SQL). All Findings integrated ASFF→Security Hub, violations routed EventBridge→SSM auto-remediation.

## Summary

Today we saw four key points. First, **continuous compliance transforms audits from event to state** — a GRC cloud evolution. Audit Manager auto-maps evidence (Config, CloudTrail, Security Hub) to regulatory controls and generates Assessment Reports, proving compliance. Unlike Config (operational "are we compliant now"), Audit Manager is audit preparation ("evidence for auditors"). Second, **Macie classifies dark data's PII/PHI with pattern matching (Luhn validation, etc.) + ML**, implementing "classify before protect" data governance, though per-object cost control is a pitfall. Third, **Inspector v2 consumes the CVE/CVSS/NVD ecosystem** for continuous scanning (EC2, container, Lambda), auto-re-evaluating on new CVEs, and Log4Shell's lesson surfaces SBOM and SLSA supply-chain security. Fourth, **Access Analyzer proves external exposure through Zelkova formal reasoning and observation-based least privilege via Policy Generation**, completing NIST CSF 5 functions with Firewall Manager (central policy) and CloudTrail Lake (7-year SQL).

Next we'll synthesize Week 14 overall with scenario questions verifying end-to-end application.

---

## 📝 Practice Questions

**Question 1.** Which statement MOST accurately describes the difference in roles between Config/Security Hub and Audit Manager?

A) All three do the same thing

B) Config/Security Hub are operational tools that evaluate and correct "is it compliant right now," while Audit Manager is an audit-readiness tool that automatically collects, maps, and reports from Config, CloudTrail, and Security Hub the evidence to prove compliance to auditors

C) Audit Manager automatically remediates violations

D) Config generates audit reports

**Answer: B**

Explanation: Config/Security Hub are operational tools that evaluate "is the resource compliant right now" and correct violations. Audit Manager is an audit-readiness tool that, on top of them, automatically maps "the evidence to prove compliance to auditors" (Config snapshots, CloudTrail logs, Security Hub Findings) to the controls of a regulatory Framework and compiles it into an Assessment Report. "Automatic remediation of violations" belongs to Config (C is wrong), and "generating audit reports" belongs to Audit Manager (D is wrong). The three have different roles (A is wrong).

---

**Question 2.** What is the key mechanism by which Macie accurately classifies credit card numbers without flagging every 16-digit number as a false positive?

A) It simply looks for a 16-digit pattern

B) After finding a 16-digit pattern, it runs Luhn algorithm (ISO/IEC 7812 checksum) validation to filter out random numbers that merely happen to be 16 digits (such as order numbers) — a "pattern + validation" two-layer structure

C) Humans review every number

D) It cannot detect card numbers

**Answer: B**

Explanation: A credit card number must satisfy a checksum called the Luhn algorithm (IBM, 1954; the ISO/IEC 7812 standard) — the last check digit must match the value calculated from the preceding digits to be valid. Macie finds a 16-digit pattern and then runs Luhn validation to filter out false positives. For SSNs it also validates issuance rules. This "pattern + validation" two-layer structure determines data classification accuracy — pattern alone causes an explosion of false positives. A simple pattern (A), manual review (C), and inability to detect (D) are wrong.

---

**Question 3.** Why can Inspector v2 "automatically re-evaluate a container image that was safe yesterday as vulnerable today"?

A) Because it rebuilds the image every time

B) Because Inspector continuously cross-references the asset's package inventory against constantly updated CVE feeds (MITRE CVE and NVD's CVSS), it automatically re-evaluates already-scanned assets when a new CVE is published

C) Because a human scans manually every day

D) Because images degrade over time

**Answer: B**

Explanation: The value of Inspector lies not in a one-time scan but in the "continuous cross-referencing of constantly updated CVE feeds × my asset inventory." CVE (MITRE's dictionary of vulnerability identifiers, 1999~) and NVD (NIST's database of CVSS scores) register new vulnerabilities every day, and Inspector keeps checking the asset's package inventory against them. That is why, when a new CVE is published, it automatically re-evaluates EC2 instances, containers, and Lambda functions that were already scanned. Rebuilds (A), manual scans (C), and image degradation (D) are not the mechanism.

---

**Question 4.** What is the internal technology that lets IAM Access Analyzer guarantee, without the bad luck of missing a case, whether "there exists a case in which this policy allows external access"?

A) Test the policy with random requests

B) The Zelkova engine's automated reasoning — formal verification that converts IAM policies into logical formulas that an SMT solver can solve and mathematically reasons over all possible requests

C) Guess with machine learning

D) Operators review it manually

**Answer: B**

Explanation: Access Analyzer's External Access Findings use AWS's Zelkova engine to convert IAM policies into logical formulas that an SMT (Satisfiability Modulo Theories) solver can solve, and formally prove "whether there exists a case in which an external principal can access." This is formal verification that mathematically reasons over all possible requests rather than empirical testing, so no case is missed (AWS Provable Security). Random testing (A), ML guessing (C), and manual review (D) cannot guarantee completeness.

---

**Question 5.** You want to reduce excessively granted IAM permissions to least privilege "based on actual usage data, not guesswork." What is the correct combination of tools?

A) Delete all permissions first and add them back when errors occur

B) Access Analyzer Policy Generation (generates a policy containing only the permissions actually used, from CloudTrail activity logs) + Unused Access Findings (discovers unused roles, permissions, and keys)

C) Grant AdministratorAccess to all roles

D) Analyze permissions with GuardDuty

**Answer: B**

Explanation: The practical difficulty of the principle of least privilege (Saltzer & Schroeder, 1975) is that it is hard for people to know "exactly the permissions needed." Access Analyzer solves this with observation — Policy Generation extracts only the permissions actually used, as recorded in CloudTrail, to build a policy (observation-based least privilege), and Unused Access Findings finds unused permissions and prompts their removal. The key is "achieving least privilege through observation rather than guesswork." Blind deletion (A) and over-granting (C) are anti-patterns, and GuardDuty (D) is threat detection, not a permission analysis tool.

---

**Question 6.** What was the root cause of the delayed response at many organizations during the Log4Shell (CVE-2021-44228, CVSS 10.0) incident, and what concept emerged to prevent it?

A) There was no patch — vaccines

B) The lack of dependency visibility, being unable to immediately answer "which of our services use Log4j" — manage the list of build components with an SBOM (Software Bill of Materials) to immediately answer "where are the vulnerable components," and guarantee supply chain integrity with SLSA

C) The network was slow — a CDN

D) Passwords were weak — MFA

**Answer: B**

Explanation: Log4Shell was widespread because almost every Java application depended on Log4j directly or indirectly, and many organizations were slow to respond because they could not immediately answer "which services use Log4j" — the lack of dependency visibility was the root cause. This is the background for the importance of SBOM (a list of all components that went into a build) and SLSA (a supply chain integrity framework, Google 2021). Inspector's container/Lambda dependency scanning helps with this. "The speed of vulnerability response is proportional to how well you know what you use." Vaccines (A), CDN (C), and MFA (D) are unrelated.

---

**Question 7.** When mapping a comprehensive security automation stack to the NIST CSF (Identify, Protect, Detect, Respond, Recover), which combination of services best fills the "Identify" function?

A) EventBridge → SSM Automation

B) Config (resource inventory) + Macie (data classification) + IAM Access Analyzer (external exposure and unused permissions)

C) Snapshots + backups + PITR

D) GuardDuty + Inspector

**Answer: B**

Explanation: The NIST CSF "Identify" is the function of understanding assets, data, and risks. Config (resource inventory and relationship graph), Macie (data classification and dark data discovery), and Access Analyzer (identifying external exposure and unused permissions) fill it. EventBridge→SSM (A) corresponds to "Respond," snapshots, backups, and PITR (C) correspond to "Recover," and GuardDuty and Inspector (D) correspond to "Detect." Knowing which CSF function each service fills lets you quickly diagnose the missing stage in a scenario.

---

## 📌 Today's Summary

Today's key points were four-fold. First, continuous compliance transforms audits from event to state — a GRC cloud-native evolution. Audit Manager auto-maps evidence (Config, CloudTrail, Security Hub) to regulatory Framework controls and generates Assessment Reports proving compliance ("evidence collection for auditors" is its role). Second, Macie classifies dark data's PII/PHI with pattern matching (Luhn, etc.) + ML implementing "classify before protect," though per-object billing is a cost pitfall. Third, Inspector v2 consumes CVE/CVSS/NVD ecosystem for continuous scanning (EC2, container, Lambda), auto-re-evaluating on new CVEs, and Log4Shell's lesson surfaces SBOM and SLSA supply-chain security importance. Fourth, Access Analyzer proves external exposure via Zelkova formal reasoning and observation-based least privilege via Policy Generation, completing NIST CSF 5 functions with Firewall Manager (central policy) and CloudTrail Lake (7-year SQL investigation).
