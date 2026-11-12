# Day 3 - Domain 5+6 Integrated: Incident Automation and Security Through the Lens of Control Theory

The last two domains deal with **what you do** when a system is threatened or collapses. Domain 5 (Incident and Event Response, 14%) and Domain 6 (Security and Compliance, 17%) add up to 31%, the largest weight of the third day. And the two are **continuous along the time axis** of security governance — if security (Domain 6) is "the peacetime posture of blocking and detecting threats," incident response (Domain 5) is "the wartime automation that reacts to a detected threat." Detection (GuardDuty) triggers response (EventBridge → Lambda), and the response in turn restores the security state. The exam almost always asks about the two as a single flow — a question that says "automatically block an S3 bucket when it becomes public" has detection (Config) and response (SSM Remediation) as one chain.

Today's review does not stop at memorizing security service names. It **classifies every security control into the three categories of prevention, detection, and response (control theory)**, understands automated response as **the control loop of event-driven architecture (EDA)**, and digs back into why multi-account security governance converges on the shape of "central aggregation + delegation."

## The Three Categories of Control — Prevent, Detect, Respond as Security's Basic Coordinate System

With dozens of security services it seems hard to memorize them all, but every control belongs to one of **three categories**. Lay down this coordinate system and any service finds its place.

| Category | Purpose | When it operates | Typical AWS tools |
|------|------|------|------|
| **Preventive** | Block bad things from happening | Before the event | SCP, IAM, Permission Boundary, WAF, Shield |
| **Detective** | Discover and record what happened | During/right after the event | CloudTrail, Config, GuardDuty, Security Hub, Macie, Inspector |
| **Responsive** | Automatic/manual action after discovery | After the event | EventBridge, Lambda, SSM Automation, Step Functions, Incident Manager |

> This classification is rooted in standard frameworks of the security field. The **NIST Cybersecurity Framework (CSF)** divides security functions into five — Identify, Protect, Detect, Respond, and Recover — which correspond exactly to AWS's prevention (Protect), detection (Detect), and response (Respond/Recover). An older root is the **internal control** theory of accounting audit, where dividing controls into preventive, detective, and corrective is the 1992 **COSO framework**. The key insight is that **"no single category is sufficient (defense in depth)."** If you trust only prevention, you are defenseless when it is bypassed (prevention is never 100%); with only detection, you are slow to act even when you discover something; and with only response, everything that could have been blocked has already happened. **Defense in depth**, which layers the three — the multiple barriers of a Roman legion, a castle's moat + walls + inner keep — is security's basic posture. This is why a single exam scenario brings together "blocking (SCP) + detection (GuardDuty) + automatic remediation (Config Remediation)."

> The same threat gets a different answer depending on which category you solve it in. "Prevent developers from using a specific Region in prod" → prevention (SCP Deny). "I want to know whether someone used that Region in prod" → detection (Config Rule + CloudTrail). "If they used it, automatically revert it" → response (Config Auto-Remediation). The verb in the exam sentence is the clue — "prevent/block/enforce" is prevention, "detect/identify/find/audit" is detection, and "automatically remediate/respond/notify" is response. This verb mapping greatly raises your accuracy on security questions.

## The Division of Labor in Threat Detection — What Do GuardDuty, Inspector, Macie, and Access Analyzer Each See Differently

The reason there are several detection services is that each looks at **a different kind of threat signal**. Mapping this division of labor to clues yields instant answers.

| Service | What it sees | Signal source | Typical clue |
|------|------|------|------|
| **GuardDuty** | Threat behavior (anomalous behavior) | CloudTrail, VPC Flow, DNS, EKS Audit, S3, RDS, Lambda | "abnormal API calls, cryptocurrency mining, signs of compromise" |
| **Inspector** | Software vulnerabilities (CVEs) | EC2, ECR, Lambda packages/OS | "EC2/container CVE scanning, prioritization" |
| **Macie** | Sensitive data (PII) | S3 object contents (ML classification) | "whether S3 holds PII/card numbers" |
| **IAM Access Analyzer** | External exposure, excessive permissions | Resource policy and IAM policy analysis | "externally public resources, policy validation" |
| **Detective** | Causality and scope of an event | GuardDuty/CloudTrail graph analysis | "root cause and connections of a compromise" |

> The difference between GuardDuty and Inspector is the difference between two paradigms of intrusion detection: **behavior-based detection vs signature/vulnerability-based detection**. GuardDuty does **anomaly detection** — it learns a baseline of normal behavior with ML and treats behavior that deviates from it (mass API calls from a Region not normally used, communication with a known malicious IP) as a threat. Inspector does **known-vulnerability matching** — it compares the CVE database against installed packages to find "this library has a known hole." By analogy, GuardDuty is "a guard watching for suspicious behavior" (who is acting differently from usual), and Inspector is "a safety inspection checking for unlocked windows" (where is it open). The two are complementary — GuardDuty catches by behavior the moment a vulnerability that Inspector did not block is exploited. On the exam, "CVE/patch" goes to Inspector and "anomalous behavior/signs of compromise" goes to GuardDuty.

> ⚠️ **Pitfall**: **Do not confuse GuardDuty (detection) with Security Hub (aggregation).** GuardDuty is the engine that **detects threats and generates Findings**, while Security Hub is the dashboard that **aggregates Findings from multiple sources such as GuardDuty, Inspector, Macie, and Config in one place and scores them against security standards (CIS, PCI DSS, AWS Foundational)**. "Detect threats" is GuardDuty; "integrate all security findings + check against compliance standards" is Security Hub. An option that lumps the two together and says "GuardDuty scores compliance" is wrong. Similarly, **Config Aggregator (aggregating configuration and rules) and Security Hub Region Aggregator (aggregating Findings)** also collect different things — Config is resource configuration and rule compliance, while SH is security Findings.

## Automated Response — The Control Loop of Event-Driven Architecture

The heart of Domain 5 is **EventBridge**. Almost every automated response takes the form "signal → EventBridge Rule → target (Lambda/SSM/Step Functions) → notification."

```
Signal source (GuardDuty Finding / Config Non-Compliant / CloudWatch Alarm / Health Event)
        │ event published
        ▼
EventBridge Rule (event pattern filter)
        │ match
        ▼
Target selection
   ├─ Lambda            : simple/immediate action (disable an IAM key)
   ├─ SSM Automation    : predefined Runbook (+ aws:approve human approval)
   └─ Step Functions    : workflow needing multiple steps, retries, auditing
        │
        ▼
Notification/tracking (SNS / Chatbot (Slack) / Incident Manager)
```

> This is the essence of **Event-Driven Architecture (EDA)**. The key is **loose coupling between the producer (event publisher) and the consumer (response)** — GuardDuty does not know "who handles my Finding" and simply publishes an event, with EventBridge responsible for routing. This is a **closed-loop control** like the observability control loop seen in Domain 4 — detection (sensor) → judgment (EventBridge filter) → actuation (actuator) → observe the state again. It is the feedback loop of cybernetics brought down into security operations. Why EventBridge is superior to invoking SNS or Lambda directly: (1) rich event-pattern filtering (content-based routing), (2) multi-target fan-out, (3) cross-account event buses (one account's security events to a central Audit account's bus), and (4) retries, DLQ, archive, and replay. On the exam, "the entry point of automated response" is almost always EventBridge.

> Target selection (Lambda vs SSM Automation vs Step Functions) is where the Pro exam splits answers. **Lambda** takes arbitrary action in code but has a 15-minute limit and state-management burden, so it suits simple, immediate actions. **SSM Automation** uses predefined Runbooks (hundreds provided by AWS + custom), and decisively, **you can put human approval into the workflow with an `aws:approve` step** — the answer to the requirement "auto-remediate, but have a human approve risky actions." **Step Functions** suits complex Runbooks needing multiple steps, branching, retries, long execution, and **an auditable execution history** (Standard workflows run up to 1 year, and each step is recorded so it can be audited afterward). Exam mapping: "Runbook with human approval" → SSM Automation aws:approve; "multi-step, retry, audit-trail workflow" → Step Functions Standard; "simple immediate action" → Lambda.

> ⚠️ **Pitfall**: In automated response you must prevent **infinite loops and runaway automation**. For example, a response that "automatically deletes non-compliant resources," combined with a wrong rule, can mass-delete normal resources. SQS DLQ automatic re-drive that reprocesses failed messages endlessly also blows up cost and load. Safeguards: (1) a **threshold/count limit** on the response (human intervention after more than N retries), (2) blocking tied to a CloudWatch Alarm, like an FIS Stop Condition, and (3) a human gate via SSM `aws:approve` for risky actions. The balance of "automation is good, but you must prevent loss of control" is the maturity clue on the Pro exam.

> The 2019 **Capital One data breach** (information on about 106 million customers in the US and Canada) is often cited as a lesson in detection and response. The attacker stole IAM credentials from the IMDS of an EC2 instance through a misconfigured WAF (an SSRF vulnerability), and with that permission pulled bulk data out of S3 buckets. Three key lessons: (1) when **prevention** (WAF configuration, enforcing IMDSv2, least privilege) collapses, (2) **detection** (GuardDuty for abnormal bulk S3 access, Access Analyzer for excess permissions) must be fast, and (3) **response** (automation that immediately invalidates credentials and blocks access) must be automatic for the damage to be reduced. After this incident, IMDSv2 (SSRF defense) and GuardDuty's credential-theft detection (`UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration`) were emphasized. Real incidents like this are the background to why the DOP exam asks about "automatically invalidating stolen IAM credentials" and "automatically blocking a public S3 bucket."

## Multi-Account Security Governance — Why Does It Converge on "Delegation + Central Aggregation"

Turning on security tools one by one across 50 accounts and checking Findings account by account is impossible. This is why almost every AWS security service supports the **Delegated Administrator + central aggregation** pattern.

> This pattern is **the same structural archetype** as the Tooling-account Hub-Spoke of Domain 1 and the CloudWatch OAM of Domain 4 — **"delegate authority centrally, but gather the data in one place."** The Organizations management account does not run security operations directly (since it must not become an attack target) and **delegates to an Audit account** dedicated to security operations. Then for GuardDuty, Security Hub, Config, Macie, and Inspector alike, the Audit account becomes the organization-wide delegated administrator, enables them automatically in each member account (with Org **Auto-Enable**, new accounts are included automatically too), and aggregates Findings in the Audit account. This is the organizational application of **the principle of least privilege + separation of concerns** — separating billing and organization structure (management) from security operations (audit) so that a compromise of one account does not lose both. On the exam, "GuardDuty/security automatically applied to new accounts too" is answered by Delegated Admin + Auto-Enable, and this native Org integration is superior to turning things on in each account with StackSets.

> **Log centralization follows the same principle**, concentrating the Organization Trail (CloudTrail) in a separate **Log Archive account**. What matters is making these logs **immutable** — apply S3 Object Lock (WORM, Write Once Read Many) so an attacker cannot erase traces in a compromise, and restrict access to the Log Archive account to the extreme. This is the compliance requirement of **integrity and non-repudiation**. CloudTrail Lake adds SQL queries and long-term retention to help audit and forensic analysis. Separating the Audit account (security operations, real-time response) from the Log Archive account (immutable evidence storage) is the standard — dividing operational authority from evidence-storage authority so a compromise of one side cannot contaminate even the evidence.

## Compliance Automation — Humans Don't Gather the Evidence

Regulated industries (finance, healthcare) must gather vast amounts of evidence for SOC 2, PCI DSS, HIPAA, and ISO 27001 audits. Doing that by hand takes weeks every quarter. **AWS Audit Manager** automates this evidence collection.

> Audit Manager automatically collects and organizes CloudTrail events, Config configuration snapshots, and Security Hub Findings **as evidence** according to predefined **frameworks** (AWS Foundational Security Best Practices, SOC 2, PCI DSS, HIPAA, GDPR, ISO 27001, and so on — each mapping the control items of the actual standard), and produces an Assessment Report (a PDF for submission to auditors). The key premise: Audit Manager does not create data itself but **weaves the outputs of other services into evidence** — so Config, CloudTrail, and Security Hub must be enabled (an easily missed prerequisite). By comparison, **Config is "does the current configuration conform to the rules" (real-time compliance), while Audit Manager is "accumulating evidence of that compliance for audit" (evidence management)**, so the time horizons differ. On the exam, "automatically collect and report SOC 2/HIPAA audit evidence" is Audit Manager, and "evaluate in real time whether resources comply with policy + auto-remediate" is Config Rule + Remediation.

> Knowing the numbers of compliance standards makes the clues visible. **PCI DSS** (Payment Card Industry Data Security Standard) is the card-data protection standard, appearing with clues like "storing/transmitting card numbers." **HIPAA** is the US health-information protection law (protected health information, PHI). **SOC 2** (System and Organization Controls 2) is the AICPA's trust services criteria (security, availability, confidentiality, and so on). **ISO/IEC 27001** is the international standard for information security management systems (ISMS). **NIST SP 800-53** is the security-control catalog for US federal systems, and **NIST CSF** is the five-function framework seen earlier. The exam usually asks not "which standard is it" but "how do you automatically collect evidence for that standard (Audit Manager)," but when a standard's name appears, options like "manual collection" are wrong and automation is the answer.

```
Multi-account security and incident integration (flow seen through the three control categories)
==================================================
  [Prevent]  SCP/Permission Boundary/WAF  ── block the event
  [Detect]   Member accounts ── Delegated Admin ──► Audit account
               GuardDuty, Inspector, Macie, Config, Security Hub
               (Org Auto-Enable: new accounts included automatically)
               Logs ──► Log Archive account (CloudTrail Org Trail, S3 Object Lock immutable)
  [Respond]  Finding/Alarm ──► EventBridge (cross-account bus)
               ├─ Lambda (immediate: disable an IAM key)
               ├─ SSM Automation (aws:approve human approval)
               └─ Step Functions (multi-step, audit) ──► Incident Manager/Chatbot
  [Audit]    Audit Manager ── auto-collects Config/CloudTrail/SH evidence ──► Report PDF
```

> 🎯 **Scenario**: "A regulated fintech operates 60 accounts. Requirements: ① block use of unapproved Regions in prod accounts ② GuardDuty and Config active in all accounts + new accounts included automatically ③ automatically block an S3 bucket when it becomes public, but risky actions such as deleting production resources need human approval ④ automatically invalidate stolen IAM credentials ⑤ automatically collect SOC 2 evidence and submit it to auditors ⑥ keep attackers from erasing CloudTrail logs." → ① **SCP Deny** (prevention). ② **Delegated Admin + Auto-Enable** (detection, Audit account). ③ **Config Rule + SSM Automation (aws:approve)** (response + human gate). ④ **GuardDuty Finding → EventBridge → Lambda** (disable the IAM key). ⑤ **Audit Manager** (SOC 2 framework). ⑥ **Log Archive account + CloudTrail Org Trail + S3 Object Lock** (immutable). The six clues cut across prevention, detection, response, and audit — a synthesis of the defense in depth that incidents like Capital One taught.

## Summary

Today we bound the 31% of Domains 5+6 into five threads. First, **every control is classified into the three categories of prevent, detect, respond** (rooted in NIST CSF and COSO), no single one is enough so defense in depth is needed, and the verb of the question (prevent/detect/respond) is the category clue. Second, **detection services differ in signal source** — GuardDuty (anomalous behavior), Inspector (CVEs), Macie (PII), Access Analyzer (external exposure), Detective (causality) — and GuardDuty (detection) and Security Hub (aggregation) have different roles. Third, **automated response is an EventBridge-centered, event-driven closed loop**, you choose among Lambda/SSM (aws:approve)/Step Functions by requirement, and safeguards against runaway automation are the maturity clue. Fourth, **multi-account security converges on Delegated Admin + Auto-Enable + central aggregation**, and the immutable logs (S3 Object Lock) of the Log Archive account guarantee integrity. Fifth, **Audit Manager automatically collects compliance evidence** but presupposes Config, CloudTrail, and Security Hub being enabled, and Capital One and defense in depth show the justification for it.

The 16 weeks of theory study end here. From the next post, we will check all of these domains in an integrated way through practice mock exams.

---

## 📝 Practice Questions

**Question 1.** You want to "block developers in advance from using unapproved Regions in the prod account," separately "audit whether such use has already occurred," and also "automatically revert it when it occurs." What control category and service is each?

A) GuardDuty for all three

B) Blocking = preventive (SCP Deny), auditing = detective (Config rule + CloudTrail), automatic recovery = responsive (Config auto-remediation/SSM)

C) Security Hub for all three

D) Blocking = Lambda, auditing = Lambda, recovery = Lambda

**Answer: B**

Explanation: Controls fall into three categories — preventive, detective, and responsive — and the verb in the question is the clue: "block/prevent" is preventive (an SCP Deny is the Region guardrail on an OU/account), "audit/detect" is detective (a Config rule evaluates non-compliance and CloudTrail records the activity), and "automatically recover/remediate" is responsive (Config auto-remediation or an SSM document). Options that solve all three categories with a single service (A, C, D) run counter to the principle of defense in depth.

---

**Question 2.** A scenario requires both "scan the OS and packages of EC2 instances for known CVEs and prioritize them" and "detect signs of compromise such as abnormal API calls and cryptocurrency mining that differ from the usual." What service fits each?

A) GuardDuty for both

B) CVE scanning = Amazon Inspector, abnormal behavior detection = Amazon GuardDuty

C) Inspector for both

D) CVE = Macie, behavior = Inspector

**Answer: B**

Explanation: Inspector is vulnerability-based detection: it compares installed packages and the OS against CVE databases to find "where are the holes" and prioritizes them. GuardDuty is behavior-based anomaly detection: it catches behavior that deviates from the normal baseline (abnormal API calls, communication with malicious IPs, mining). The two are complementary, but their roles differ. Macie (D) detects PII in S3 and is irrelevant.

---

**Question 3.** You want to block an S3 bucket automatically when it is made public, but also put a gate in the workflow so that "risky actions such as deleting or changing a bucket that holds production data must be approved by a human." What is the most appropriate configuration?

A) A Lambda function unconditionally runs every action as soon as it finds the problem

B) A Config rule detects non-compliance → an SSM Automation runbook blocks automatically, with an `aws:approve` step inserted at risky steps so that it proceeds after human approval

C) GuardDuty modifies the bucket directly

D) Block with Macie

**Answer: B**

Explanation: A Config rule detects the public bucket as non-compliant and an SSM Automation runbook performs the automatic fix, and for risky actions (delete, change), SSM's `aws:approve` step inserts human approval into the workflow — the standard of "automation + a human gate for risky actions." Unconditional immediate execution (A) risks a runaway, GuardDuty (C) is detection rather than a remediation actor, and Macie (D) detects PII and is irrelevant.

---

**Question 4.** When GuardDuty generates a finding that "EC2 instance credentials have been exfiltrated externally," you want to configure an automatic response that immediately invalidates those credentials without human intervention. What are the most appropriate entry point and flow?

A) SNS modifies IAM directly

B) GuardDuty finding → EventBridge rule (event pattern filter) → Lambda (invalidate the role's sessions/attach an isolating policy) → SNS/Incident Manager notification

C) A Config Aggregator invalidates the credentials

D) CloudTrail blocks automatically

**Answer: B**

Explanation: The entry point of automated response is EventBridge — filter the GuardDuty finding with an event pattern to trigger Lambda, and the Lambda function invalidates the exfiltrated role's sessions or attaches an isolating policy and then sends a notification. This is a closed loop of detect → decide → act, and the standard response to credential theft incidents like Capital One's. SNS (A), a Config Aggregator (C), and CloudTrail (D) are not action actors.

---

**Question 5.** You want to enable GuardDuty and Security Hub across all 60 accounts, automatically include any account newly joining Organizations in the future, and aggregate all findings in a single Audit account. What is the most appropriate configuration?

A) Each account administrator enables them manually in the console

B) Designate the Audit account as the Delegated Administrator and turn on Org Auto-Enable to automatically include new accounts, and aggregate multi-Region findings with the Security Hub Region Aggregator

C) Enable them in each account every time with StackSets

D) A Lambda function scans for new accounts daily and enables them

**Answer: B**

Explanation: The multi-account standard for AWS security services is to delegate the Audit account as the Delegated Administrator and automatically include new accounts with Org Auto-Enable — the management account does not run security operations directly but delegates them, separating concerns. Multi-Region aggregation of findings is the Security Hub Region Aggregator. Manual work (A), repeated StackSets (C), and Lambda scanning (D) are anti-patterns with omissions and operational burden, and native Organizations integration is superior.

---

**Question 6.** Every quarter, evidence of security controls must be gathered for a SOC 2 audit, and the manual work takes weeks. CloudTrail, Config, and Security Hub are already enabled. How can you automate evidence collection and reporting?

A) Query directly with Athena each time

B) Use the SOC 2 framework in AWS Audit Manager to automatically collect output from CloudTrail, Config, and Security Hub as evidence and generate an assessment report

C) Collect evidence with Macie

D) Generate the report with a Config Aggregator

**Answer: B**

Explanation: Audit Manager automatically collects and organizes the output from CloudTrail, Config, and Security Hub as evidence according to predefined frameworks (SOC 2, PCI DSS, HIPAA, and so on) and produces an assessment report for submission to auditors — provided that those source services are enabled (already satisfied). Config is real-time compliance evaluation, not accumulation and reporting of audit evidence (D). Manual Athena queries (A) and Macie (C) are not compliance evidence automation.

---

**Question 7.** You want to guarantee the integrity of CloudTrail logs so that an attacker cannot erase traces when a breach occurs. What is the most appropriate design?

A) Leave the logs in each account's default CloudTrail as they are

B) Centralize logs with an organization trail in a separate Log Archive account, make them immutable with S3 Object Lock (WORM), and restrict access to that account to the extreme

C) Keep them only in CloudWatch Logs

D) Delete or archive the logs daily with Lambda

**Answer: B**

Explanation: For integrity and non-repudiation, centralize logs with an organization trail in a Log Archive account separate from security operations (Audit), and make them immutable with S3 Object Lock (WORM) so that neither an attacker nor an operator can delete them — the standard of separating operational privileges from evidence-retention privileges. The default trail in each account (A) can be deleted from a compromised account, CloudWatch Logs alone (C) is unsuitable for long-term immutable retention, and Lambda deletion (D) is an anti-pattern that destroys evidence.

---

## 📌 Today's Summary

Today we tied together 22% of Domains 5+6. First, incident response is about minimizing MTTR: automate each stage of detection, diagnosis, healing, and verification. Second, an Incident Manager + Step Functions workflow automates escalation. Third, CloudTrail and Config audit logs are protected with MFA Delete and Object Lock. Fourth, GuardDuty, Security Hub, and Config Rules enforce compliance across multiple accounts. Fifth, an EventBridge→Lambda pipeline responds on a minute scale. Sixth, SAST/DAST/container/IAM scanning shifts vulnerability detection left (to the build). Seventh, post-incident analysis + FIS chaos testing prevent recurrence.
