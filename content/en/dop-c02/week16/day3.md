# Day 3 - Incident Response and Security Compliance Woven Through Everything

Today: **incident response (8%) and security (14%)**, together 22% of the exam. Unlike Domains 1-4, these don't cluster as separate topics but rather are **cross-cutting.** Every pipeline has security gates. Every incident should have audit trail. Today: treat these as **properties of all systems**, not silos.

## Incident Response Fundamentals — MTTR, Root Cause, Runbook Automation

Incident response has one north star: **Mean Time To Recover (MTTR).** From detection to system restored.

MTTR = Detection Time + Diagnosis Time + Remediation Time + Validation Time

> 💡 **Related theory**: Each component is attackable. Reduce detection time: lower alarm threshold, add synthetic checks. Reduce diagnosis: observability (traces pinpoint service). Reduce remediation: auto-heal (Lambda, Step Functions), remove manual toil. Reduce validation: health checks resume traffic. Pro exams test all four; missing any one, MTTR stays long.

> 🔍 **Deeper**: **Incident Manager** (AWS service) automates escalation and communication. On-call detection → page, escalate if unresolved after 5min to manager, notify Slack, create ticket in JIRA. Removes human delay (on-call misses page, waits for team slack). But incident managers are only useful if **runbooks exist.** Runbook = step-by-step "if CPU spike, check DB, if DB slow, scale, verify CPU down." Without runbook, on-call wastes time asking "what do I do?"

> 📚 **Case study**: 2016 **Facebook outage**, engineering team initially unaware how to recover (config system corrupted). Recovery took hours longer than needed. Lesson: write runbook and **practice** (chaos tests). Modern: runbook is Step Functions workflow, alarm triggers auto-execution, human can observe or halt.

## Logging for Compliance — CloudTrail, Config, Audit Account

Compliance starts with **audit trail.** Who changed what, when? CloudTrail logs all API calls; Config tracks resource state changes. Audit account aggregates both.

> 💡 **Related theory**: **Principle of least privilege** + **audit = accountability.** Developer has permission to change S3 bucket policy (privileged), but CloudTrail records "who, what, when." Audit account holds unmodifiable copy of logs. Exam: "PII data exposure, need proof developer didn't leak" → CloudTrail shows "Developer X called GetObject on bucket Y at time Z" or didn't. No log, no proof.

> ⚠️ **Gotcha**: **CloudTrail logs must be protected.** Store in S3 with MFA Delete, lock via Object Lock (immutable). If attacker can modify CloudTrail logs post-incident, audit trail is useless. Also, **Config Rules** enforce compliance: "All EC2 instances must have encryption tag." Violation → auto-remediate (SSM Documents) or alert. Compliance is enforcement, not just logging.

## GuardDuty and Security Hub — Threat Detection and Aggregation

GuardDuty uses ML to detect threats (unusual API usage, port scans, malware-like behavior). Security Hub aggregates GuardDuty + Config + Inspector + other security tools into single dashboard. Multi-account: delegate admin to Infra team, hub account sees all spoke findings.

> 💡 **Related theory**: **Defense in depth** has layers: (1) prevent (IAM role limits), (2) detect (GuardDuty), (3) respond (EventBridge → auto-kill credentials, block IP). Exam: "malicious credential leak detected" → GuardDuty finding → EventBridge rule → Lambda invalidates all sessions, rotates credential. Five-minute MTTR instead of "wait for human to respond."

## Security Compliance Frameworks — CIS Benchmarks, SOC 2

Frameworks define **which controls matter.** CIS AWS Foundations Benchmark: "MFA on root account" (Foundational level), "CloudTrail multi-region" (Level 1). AWS Config rules map to CIS; compliance score is "% of Config rules passing."

> 📚 **Case study**: 2019 **Capital One breach**, attacker exploited WAF misconfiguration. Post-incident: tightened WAF rules, added GuardDuty detection for WAF bypass patterns, automated runbook. Lesson: breach happens; design to detect and respond fast.

## Unified Flow: Prevention → Detection → Response → Learning

```
Secure development (SAST in CodeBuild, container scan in ECR)
   ↓
Deployed resource (GuardDuty watches, Config enforces)
   ↓
Threat event (GuardDuty finding, Security Hub aggregates)
   ↓
EventBridge trigger (on GuardDuty HIGH/CRITICAL)
   ↓
Auto-remediation (Lambda revokes credentials, SSM Document patches, WAF blocks IP)
   ↓
Incident Manager (pages on-call if auto-remediation fails)
   ↓
Runbook execution (Step Functions logs every step)
   ↓
Postmortem (CloudTrail audit trail, Config history, traces show attack path)
   ↓
Prevention update (tighten IAM, add GuardDuty rule, patch code)
```

> 🎯 **Scenario**: "Fintech, exposed AWS credential in logs. Detect within 5min, invalidate within 10min, audit trail intact." → (1) GuardDuty anomaly detection or Secrets scanning catches "pattern matches known AWS key format" (detection time ~2min), (2) EventBridge rule fires on finding, (3) Lambda calls STS RevokeAllSessions (remediation time ~2min), (4) Incident Manager alerts (notification time ~1min), (5) Runbook auto-generated from config shows "credential scope: read S3 bucket X", (6) CloudTrail shows "this credential called GetObject 1000x" during attack window, audit intact. MTTR ≈ 10min, full audit trail.

## Security Scanning — SAST, DAST, Container Scan, Infrastructure Scan

Modern security is **shift-left**: catch bugs early (build time), not late (production).

| Tool | When | Scope | False Positives |
|---|---|---|---|
| **SAST** (CodeGuru, SonarQube) | Build stage | Source code | High (context-blind) |
| **Dependency Check** | Build stage | npm/pip packages | Low (known CVEs) |
| **Container Scan** (ECR) | Build/push | Image layers | Medium |
| **DAST** (burp, OWASP ZAP) | Staging | Live app behavior | Low (exercises real code) |
| **IAM Access Analyzer** | Deploy | Policy logic | Very low (formal analysis) |

> 💡 **Related theory**: SAST finds "this code pattern is risky," but false positives (pattern is okay in context). DAST exercises live app, finds real vulnerabilities. Both are needed. CodePipeline should gate CRITICAL SAST findings (fail build), and allow MEDIUM (log but don't block). This speeds CI without sacrificing security.

## Summary

Today wove Domains 5+6's 22% into system properties. First, **incident response has four time components; reduce each via detection automation, diagnosis (observability), remediation (auto-heal), validation (health checks).** Second, **Incident Manager + runbooks (Step Functions) automate escalation and execution.** Third, **audit trails (CloudTrail, Config) protect with MFA Delete and Object Lock.** Fourth, **GuardDuty + Security Hub + Config Rules enforce compliance across accounts.** Fifth, **eventBridge→Lambda→remediate pipeline responds in minutes.** Sixth, **security scanning (SAST/DAST/container/IAM) shifts vulnerability detection left.** Seventh, **postmortem + chaos engineering (FIS validate fixes) prevent recurrence.**

Final two days: Full exam scenarios (Day 4) and D-Day exam prep strategy (Day 5).

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
