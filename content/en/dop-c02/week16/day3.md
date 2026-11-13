# Day 3 - Domains 5 and 6 Integrated Review: Incident Automation and Security Through Control Theory

The last two domains deal with **what you do** when a system is threatened or breaks down. Domain 5 (Incident and Event Response, 14%) and Domain 6 (Security and Compliance, 17%) together make up 31%, the largest share of the three days. And the two are **continuous along the time axis** of security governance — if security (Domain 6) is "the everyday posture of blocking and detecting threats," then incident response (Domain 5) is "the automation for emergencies that reacts to a detected threat." Detection (GuardDuty) triggers response (EventBridge → Lambda), and the response in turn restores the security posture. The exam almost always ties the two together as a single flow — a question like "automatically block an S3 bucket when it becomes public" is one chain of detection (Config) and response (SSM Remediation).

Today's review doesn't stop at memorizing security service names. We **classify every security control into the three categories of control theory — preventive, detective, and responsive**, understand automated response as **the control loop of event-driven architecture (EDA)**, and dig again into why multi-account security governance converges on the shape of "central aggregation + delegation."

## The Three Categories of Controls — The Basic Coordinate System of Security: Prevent, Detect, Respond

With dozens of security services it seems hard to memorize them all, but every control belongs to one of **three categories**. Once you lay down this coordinate system, any service finds its place.

| Category | Purpose | When it operates | AWS representatives |
|------|------|------|------|
| **Preventive** | Block bad things from happening | Before the event | SCP, IAM, Permission Boundary, WAF, Shield |
| **Detective** | Discover and record what happened | During/right after the event | CloudTrail, Config, GuardDuty, Security Hub, Macie, Inspector |
| **Responsive** | Automatic/manual action after discovery | After the event | EventBridge, Lambda, SSM Automation, Step Functions, Incident Manager |

> This classification is rooted in standard frameworks in the security field. The **NIST Cybersecurity Framework (CSF)** divides security functions into five — Identify, Protect, Detect, Respond, and Recover — which map exactly onto AWS's preventive (Protect), detective (Detect), and responsive (Respond/Recover). An older root is the **internal control** theory of accounting audit, where dividing controls into preventive, detective, and corrective is the 1992 **COSO framework**. The key insight is that **"no single category is enough (defense in depth)."** If you trust only prevention, you are defenseless once it is bypassed (prevention is never 100%); with only detection, you find things but your hands are slow; with only response, even what could have been blocked has already fully happened. **Defense in depth** — layering the three tiers, like the multiple barriers of a Roman legion or a castle's moat + walls + keep — is the basic security posture. This defense in depth is why a single exam scenario brings together "blocking (SCP) + detection (GuardDuty) + auto-remediation (Config Remediation)."

> The same threat gets a different answer depending on which category you solve it with. "Prevent developers from using a certain Region in prod" → preventive (SCP Deny). "I want to know whether anyone used that Region in prod" → detective (Config Rule + CloudTrail). "If they did, automatically revert it" → responsive (Config Auto-Remediation). The verb in the exam sentence is the clue — "prevent/block/enforce" is preventive, "detect/identify/find/audit" is detective, and "automatically remediate/respond/notify" is responsive. This verb mapping raises your accuracy on security questions significantly.

## The Division of Labor in Threat Detection — What Do GuardDuty, Inspector, Macie, and Access Analyzer See Differently?

There are several detection services because each looks at a **different kind of threat signal**. Map this division of labor to the clues and you get instant answers.

| Service | What it sees | Signal source | Representative clue |
|------|------|------|------|
| **GuardDuty** | Threat activity (anomalous behavior) | CloudTrail, VPC Flow, DNS, EKS Audit, S3, RDS, Lambda | "Abnormal API calls, cryptocurrency mining, signs of compromise" |
| **Inspector** | Software vulnerabilities (CVEs) | EC2, ECR, Lambda packages/OS | "EC2/container CVE scanning and prioritization" |
| **Macie** | Sensitive data (PII) | S3 object contents (ML classification) | "Whether S3 contains PII/card numbers" |
| **IAM Access Analyzer** | External exposure and excessive permissions | Resource-policy and IAM-policy analysis | "Externally exposed resources, policy validation" |
| **Detective** | Causality and scope of an incident | GuardDuty/CloudTrail graph analysis | "Root cause and connections of a compromise" |

> The difference between GuardDuty and Inspector is the difference between the two paradigms of intrusion detection: **behavior-based detection vs. signature/vulnerability-based detection**. GuardDuty does **anomaly detection** — it learns a baseline of normal behavior with ML and treats activity that deviates from it (a burst of API calls from a Region it normally doesn't use, communication with a known malicious IP) as a threat. Inspector does **known-vulnerability matching** — it compares the CVE database against installed packages to find "this library has a known hole." By analogy, GuardDuty is "a guard watching for suspicious behavior" (who is acting differently from usual), and Inspector is "a safety inspection checking for unlocked windows" (where is it open). The two are complementary — GuardDuty catches, by behavior, the moment a vulnerability that Inspector didn't block gets exploited. On the exam, "CVE/patching" goes to Inspector and "anomalous behavior/signs of compromise" goes to GuardDuty.

> ⚠️ **Pitfall**: **Don't confuse GuardDuty (detection) with Security Hub (aggregation).** GuardDuty is the engine that **detects threats and generates Findings**, while Security Hub is the dashboard that **aggregates Findings from multiple sources such as GuardDuty, Inspector, Macie, and Config in one place and scores them against security standards (CIS, PCI DSS, AWS Foundational)**. "Detect threats" is GuardDuty; "unify all security findings + check compliance standards" is Security Hub. An option that lumps them together, saying "GuardDuty scores compliance," is wrong. Similarly, the **Config Aggregator (aggregating configurations and rules) and the Security Hub Region Aggregator (aggregating Findings)** also collect different things — Config is resource configuration and rule compliance, while SH is security Findings.

## Automated Response — The Control Loop of Event-Driven Architecture

The heart of Domain 5 is **EventBridge**. Almost all automated response takes the form "signal → EventBridge Rule → target (Lambda/SSM/Step Functions) → notification."

```
Signal source (GuardDuty Finding / Config Non-Compliant / CloudWatch Alarm / Health Event)
        │ event published
        ▼
EventBridge Rule (event pattern filter)
        │ match
        ▼
Target selection
   ├─ Lambda            : simple/immediate action (disable an IAM key)
   ├─ SSM Automation    : predefined runbook (+ aws:approve human approval)
   └─ Step Functions    : workflows needing multiple steps, retries, auditing
        │
        ▼
Notification/tracking (SNS / Chatbot (Slack) / Incident Manager)
```

> This is the essence of **Event-Driven Architecture (EDA)**. The key is the **loose coupling between producer (event publisher) and consumer (responder)** — GuardDuty doesn't know "who handles my Findings," it just publishes events, and EventBridge is responsible for routing. This is the same **closed-loop control** as the observability control loop we saw in Domain 4 — detection (sensor) → judgment (EventBridge filter) → actuation (actuator) → observe the state again. It is the cybernetics feedback loop brought down into security operations. Why EventBridge is superior to invoking SNS or Lambda directly: (1) rich event-pattern filtering (content-based routing), (2) multi-target fan-out, (3) cross-account event buses (security events from one account to a central Audit account's bus), (4) retries, DLQ, archive, and replay. On the exam, "the entry point of automated response" is almost always EventBridge.

> Target selection (Lambda vs SSM Automation vs Step Functions) is where the Professional exam separates candidates. **Lambda** takes arbitrary action in code, but with the 15-minute limit and the burden of state management it suits simple, immediate actions. **SSM Automation** uses predefined runbooks (hundreds provided by AWS + custom), and decisively, **it can insert human approval into the workflow with the `aws:approve` step** — the answer for the requirement "auto-remediate, but a human approves risky actions." **Step Functions** suits complex runbooks that need multiple steps, branching, retries, long executions, and an **auditable execution history** (Standard workflows run up to one year, and each step is recorded so it can be audited afterward). Exam mapping: "runbook with human approval" → SSM Automation aws:approve, "multi-step, retry, audit-trail workflow" → Step Functions Standard, "simple immediate action" → Lambda.

> ⚠️ **Pitfall**: In automated response you must prevent **infinite loops and runaway automation**. For example, a response that "automatically deletes non-compliant resources," combined with a wrong rule, can mass-delete healthy resources. SQS DLQ automatic re-drive can also blow up cost and load if it reprocesses failed messages endlessly. Safeguards: (1) a **threshold/count limit** on the response (human intervention after N retries), (2) a CloudWatch Alarm-linked cutoff like the FIS Stop Condition, (3) a human gate for risky actions via SSM `aws:approve`. The balance of "automation is good, but you must prevent loss of control" is a maturity clue on the Professional exam.

> The 2019 **Capital One data breach** (information on about 106 million customers in the US and Canada) is often cited as a lesson in detection and response. The attacker stole IAM credentials from an EC2 instance's IMDS through a misconfigured WAF (an SSRF vulnerability) and used those permissions to exfiltrate large amounts of data from S3 buckets. Three key lessons: when (1) **prevention** (WAF configuration, enforcing IMDSv2, least privilege) fails, (2) **detection** (GuardDuty for abnormal bulk S3 access, Access Analyzer for excessive permissions) must be fast, and (3) **response** (immediately invalidating credentials and blocking access) must be automatic for the damage to shrink. After this incident, IMDSv2 (SSRF defense) and GuardDuty's credential-exfiltration detection (`UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration`) were emphasized. Real incidents like this are the background to why the DOP exam asks about "automatically invalidating stolen IAM credentials" and "automatically blocking a public S3 bucket."

## Multi-Account Security Governance — Why Does It Converge on "Delegation + Central Aggregation"?

Turning security tools on one by one across 50 accounts and checking Findings account by account is impossible. That is why almost every AWS security service supports the **Delegated Administrator + central aggregation** pattern.

> This pattern is **the same structural archetype** as the Tooling-account Hub-Spoke in Domain 1 and CloudWatch OAM in Domain 4 — **"delegate authority centrally, but gather the data in one place."** The Organizations management account doesn't run security operations directly (it must not become an attack target), and instead **delegates to the Audit account** dedicated to security operations. Then, for GuardDuty, Security Hub, Config, Macie, and Inspector alike, the Audit account becomes the delegated administrator for the whole organization, automatically enables them in each member account (with Org **Auto-Enable**, new accounts are included automatically too), and aggregates Findings in the Audit account. This is the organizational application of **least privilege + separation of concerns** — separating billing and organization structure (management) from security operations (audit) so that compromising one account doesn't lose both. On the exam, for "GuardDuty/security automatically applied to new accounts too," Delegated Admin + Auto-Enable is the answer, and this native Org integration is superior to turning it on in each account with StackSets.

> **Centralizing logs follows the same principle**: concentrate the Organization Trail (CloudTrail) in a separate **Log Archive account**. What matters is making these logs **immutable** — apply S3 Object Lock (WORM, Write Once Read Many) so an attacker can't erase traces during a breach, and restrict access to the Log Archive account to the extreme. This is the compliance requirement of **integrity and non-repudiation**. CloudTrail Lake adds SQL queries and long-term retention on top, helping audit and forensic analysis. **Separating** the Audit account (security operations, real-time response) from the Log Archive account (immutable evidence storage) is standard — divide operational authority from evidence-keeping authority so that a compromise on one side can't contaminate the evidence.

## Compliance Automation — Humans Don't Collect the Evidence

Regulated industries (finance, healthcare) must collect vast amounts of evidence for SOC 2, PCI DSS, HIPAA, and ISO 27001 audits. Doing this by hand takes weeks every quarter. **AWS Audit Manager** automates this evidence collection.

> Audit Manager, following predefined **frameworks** (AWS Foundational Security Best Practices, SOC 2, PCI DSS, HIPAA, GDPR, ISO 27001, etc. — each mapping the control items of the actual standard), **automatically collects and organizes CloudTrail events, Config configuration snapshots, and Security Hub Findings as evidence** and produces an Assessment Report (a PDF for submission to auditors). Key premise: Audit Manager doesn't generate data itself but **weaves the output of other services into evidence** — so Config, CloudTrail, and Security Hub must be enabled (an easy premise to miss). By comparison, **Config is "does the current configuration conform to the rules" (real-time compliance), and Audit Manager is "accumulating the evidence of that compliance for audit" (evidence management)**, so their time horizons differ. On the exam, "automatically collect and report SOC 2/HIPAA audit evidence" is Audit Manager, while "evaluate in real time whether resources are policy-compliant + auto-remediate" is Config Rule + Remediation.

> Knowing the compliance standards' labels helps you see the clues. **PCI DSS** (Payment Card Industry Data Security Standard) is the card-data protection standard and appears with clues like "storing/transmitting card numbers." **HIPAA** is the US health-information protection law (protected health information, PHI). **SOC 2** (System and Organization Controls 2) is the AICPA's trust services criteria (security, availability, confidentiality, etc.). **ISO/IEC 27001** is the international standard for information security management systems (ISMS). **NIST SP 800-53** is the security control catalog for US federal systems, and **NIST CSF** is the five-function framework we saw earlier. The exam usually asks not "which standard is it" but "how do you automatically collect evidence for that standard (Audit Manager)," but when a standard's name appears, options like "manual collection" are wrong and automation is right.

```
Multi-account security and incident integration (flow seen through the three control categories)
==================================================
  [Preventive]  SCP/Permission Boundary/WAF  ── block the event
  [Detective]   Member accounts ── Delegated Admin ──► Audit account
            GuardDuty·Inspector·Macie·Config·Security Hub
            (Org Auto-Enable: new accounts included automatically)
            Logs ──► Log Archive account (CloudTrail Org Trail, immutable via S3 Object Lock)
  [Responsive]  Finding/Alarm ──► EventBridge (cross-account bus)
            ├─ Lambda (immediate: disable IAM key)
            ├─ SSM Automation (aws:approve human approval)
            └─ Step Functions (multi-step, audit) ──► Incident Manager/Chatbot
  [Audit]  Audit Manager ── auto-collect Config/CloudTrail/SH evidence ──► Report PDF
```

> 🎯 **Scenario**: "A regulated fintech runs 60 accounts. Requirements: ① block use of unapproved Regions in prod accounts ② GuardDuty and Config enabled in all accounts + new accounts included automatically ③ automatically block an S3 bucket when it becomes public, but risky actions such as deleting production resources require human approval ④ automatically invalidate stolen IAM credentials ⑤ automatically collect SOC 2 evidence and submit it to auditors ⑥ keep attackers from deleting CloudTrail logs." → ① **SCP Deny** (preventive). ② **Delegated Admin + Auto-Enable** (detective, Audit account). ③ **Config Rule + SSM Automation (aws:approve)** (responsive + human gate). ④ **GuardDuty Finding → EventBridge → Lambda** (disable the IAM key). ⑤ **Audit Manager** (SOC 2 framework). ⑥ **Log Archive account + CloudTrail Org Trail + S3 Object Lock** (immutable). The six clues cut across prevention, detection, response, and audit — the comprehensive version of the defense in depth that incidents like Capital One taught.

## Wrap-Up

Today we tied the 31% of Domains 5+6 into five threads. First, **every control falls into three categories: preventive, detective, and responsive** (NIST CSF and COSO roots), no single one is enough so defense in depth is needed, and the question's verb (prevent/detect/respond) is the category clue. Second, **detection services have different signal sources** — GuardDuty (anomalous behavior), Inspector (CVE), Macie (PII), Access Analyzer (external exposure), Detective (causality) — and GuardDuty (detection) and Security Hub (aggregation) have different roles. Third, **automated response is an EventBridge-centered, event-driven closed loop**, you choose among Lambda/SSM (aws:approve)/Step Functions by requirement, and safeguards against runaway automation are a maturity clue. Fourth, **multi-account security converges on Delegated Admin + Auto-Enable + central aggregation**, and the Log Archive account's immutable logs (S3 Object Lock) guarantee integrity. Fifth, **Audit Manager automatically collects compliance evidence** on the premise that Config, CloudTrail, and Security Hub are enabled, and Capital One and defense in depth show why it is justified.

The 16 weeks of theory study wrap up here. From the next post on, we integrate and check all of these domains with practice exams.

---

## 📝 Practice Questions

**Question 1.** You want to "proactively block developers from using unapproved Regions in the prod account," separately "audit whether such use has already occurred," and also "automatically revert it when it happens." What control category and service is each?

A) All three are GuardDuty

B) Blocking = preventive (SCP Deny), auditing = detective (Config Rule + CloudTrail), automatic recovery = responsive (Config Auto-Remediation/SSM)

C) All three are Security Hub

D) Blocking = Lambda, auditing = Lambda, recovery = Lambda

**Answer: B**

Explanation: Controls fall into three categories — preventive, detective, and responsive — and the verb in the question is the clue: "block/prevent" is preventive (an SCP Deny is the OU/account Region guardrail), "audit/detect" is detective (a Config Rule evaluates non-compliance, CloudTrail records the activity), and "automatically recover/remediate" is responsive (Config Auto-Remediation or an SSM Document). Options that solve all three categories with a single service (A, C, D) go against the defense-in-depth principle.

---

**Question 2.** A scenario requires both "scan the OS and packages of EC2 instances for known CVEs and prioritize them" and "detect signs of compromise such as unusual abnormal API calls and cryptocurrency mining." What is the service for each?

A) Both are GuardDuty

B) CVE scanning = Amazon Inspector, abnormal behavior detection = Amazon GuardDuty

C) Both are Inspector

D) CVE = Macie, behavior = Inspector

**Answer: B**

Explanation: Inspector is vulnerability-based detection that compares installed packages and the OS against the CVE database to find "where it is open" and prioritize it. GuardDuty is behavior-based anomaly detection that catches activity that deviates from the normal baseline (abnormal API calls, communication with malicious IPs, mining). The two are complementary, but their roles differ. Macie (D) detects PII in S3 and is irrelevant.

---

**Question 3.** You want to automatically block an S3 bucket when it is set to public, while putting a gate in the workflow so that "risky actions that delete or change a bucket holding production data must be approved by a human." What is the most appropriate configuration?

A) Lambda unconditionally executes every action as soon as it detects the issue

B) A Config Rule detects non-compliance → an SSM Automation runbook blocks automatically, but a risky step includes an `aws:approve` step to proceed after human approval

C) GuardDuty modifies the bucket directly

D) Block with Macie

**Answer: B**

Explanation: A Config Rule detects the public bucket as non-compliant and an SSM Automation runbook performs the automatic remediation, while for risky actions (delete/change) SSM's `aws:approve` step inserts human approval into the workflow — the standard for "automation + a human gate for risky actions." Unconditional immediate execution (A) risks runaway behavior, GuardDuty (C) is detection rather than a remediation actor, and Macie (D) detects PII and is irrelevant.

---

**Question 4.** When GuardDuty generates a Finding that "an EC2 instance's credentials were exfiltrated externally," you want to configure an automated response that invalidates those credentials immediately without human intervention. What is the most appropriate entry point and flow?

A) SNS modifies IAM directly

B) GuardDuty Finding → EventBridge Rule (event pattern filter) → Lambda (invalidate the Role's sessions/isolate with a policy) → SNS/Incident Manager notification

C) Config Aggregator invalidates the credentials

D) CloudTrail blocks automatically

**Answer: B**

Explanation: The entry point of automated response is EventBridge — filter the GuardDuty Finding with an event pattern to trigger Lambda, and Lambda invalidates the stolen Role's sessions or attaches an isolating policy and then sends a notification. This is a detect → judge → act closed loop and the standard response to credential-theft incidents like Capital One. SNS (A), Config Aggregator (C), and CloudTrail (D) are not action actors.

---

**Question 5.** You want to enable GuardDuty and Security Hub across all 60 accounts, have accounts newly joining Organizations in the future be included automatically, and aggregate all Findings in a single Audit account. What is the most appropriate configuration?

A) Each account administrator enables it manually in the console

B) Designate the Audit account as Delegated Administrator and turn on Org Auto-Enable to include new accounts automatically, and aggregate multi-Region Findings with the Security Hub Region Aggregator

C) Turn it on in each account every time with StackSets

D) Lambda scans for new accounts daily and enables it

**Answer: B**

Explanation: The multi-account standard for AWS security services is to delegate to the Audit account as Delegated Administrator and include new accounts automatically with Org Auto-Enable — the management account doesn't run security operations directly but delegates, separating concerns. Multi-Region aggregation of Findings is the Security Hub Region Aggregator. Manual (A), repeated StackSets (C), and Lambda scanning (D) are anti-patterns with gaps and operational burden, and native Org integration is superior.

---

**Question 6.** Every quarter you must collect evidence of security controls for a SOC 2 audit, and the manual work takes weeks. CloudTrail, Config, and Security Hub are already enabled. How do you automate evidence collection and reporting?

A) Query directly with Athena each time

B) Use AWS Audit Manager's SOC 2 framework to automatically collect the output of CloudTrail, Config, and Security Hub as evidence and generate an Assessment Report

C) Collect evidence with Macie

D) Generate the report with Config Aggregator

**Answer: B**

Explanation: Audit Manager, following predefined frameworks (SOC 2, PCI DSS, HIPAA, etc.), automatically collects and organizes the output of CloudTrail, Config, and Security Hub as evidence and produces an Assessment Report for submission to auditors — provided those source services are enabled (already satisfied). Config is real-time compliance evaluation, not accumulating and reporting audit evidence (D). Manual Athena queries (A) and Macie (C) are not compliance evidence automation.

---

**Question 7.** You want to guarantee the integrity of CloudTrail logs so that an attacker can't erase traces during a breach. What is the most appropriate design?

A) Leave the logs in each account's default CloudTrail

B) Concentrate logs with an Organization Trail in a separate Log Archive account, make them immutable with S3 Object Lock (WORM), and restrict access to that account to the extreme

C) Keep them only in CloudWatch Logs

D) Delete/archive the logs daily with Lambda

**Answer: B**

Explanation: For integrity and non-repudiation, concentrate the logs with an Organization Trail in a Log Archive account separate from security operations (Audit), and make them immutable with S3 Object Lock (WORM) so that neither an attacker nor an operator can delete them — the standard of separating operational authority from evidence-keeping authority. Each account's default Trail (A) can be deleted from a compromised account, CloudWatch Logs only (C) is unsuitable for long-term immutable retention, and Lambda deletion (D) is an anti-pattern that destroys evidence.

---

## 📌 Today's Summary

1. Every control is one of three categories — preventive, detective, responsive (NIST CSF, COSO) — defense in depth is needed, and the question's verb is the category clue.
2. Detection services have different signal sources — GuardDuty (behavior), Inspector (CVE), Macie (PII), Access Analyzer (exposure), Detective (causality), and GuardDuty (detection) ≠ Security Hub (aggregation).
3. Automated response is an EventBridge-centered closed loop, you choose among Lambda/SSM (aws:approve)/Step Functions by requirement, and runaway prevention is a maturity clue.
4. Multi-account security converges on Delegated Admin + Auto-Enable + central aggregation, and the Log Archive account's immutable logs (S3 Object Lock) guarantee integrity.
5. Audit Manager automatically collects compliance evidence (premised on Config/CloudTrail/SH), and the Capital One incident shows why defense in depth is justified.
