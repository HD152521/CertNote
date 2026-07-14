# Day 5 - Week 14 Comprehensive Review: The Big Picture of Security Automation Stack and Practical Scenarios

Week 14 is summarized in one sentence — "Detect (detect), Aggregate (aggregate), Assess (assess), Prove (prove), and Respond automatically (respond)." GuardDuty detects threats, Security Hub integrates all Findings into ASFF, Config assesses resource compliance, Audit Manager, Macie, Inspector, and Access Analyzer handle audit evidence, sensitive data, vulnerabilities, and external exposure, and all of these connect to automated response via EventBridge → SSM Automation/Lambda. Today we reassemble these five pieces into one picture and verify end-to-end application with 12 practical scenario questions.

## The Big Picture — How Five Pieces Fit Together

```
                    [Data Plane Logs & Resource State]
                              │
   ┌──────────────┬──────────┼──────────────┬─────────────────┐
   ▼              ▼          ▼              ▼                 ▼
GuardDuty      Inspector   Macie      Access Analyzer       Config
(Threats/Behavior) (CVE Vulns) (Sensitive Data) (External/Unused) (Resource Compliance)
   │              │          │              │                 │
   └──────────────┴──────────┴──── ASFF ────┴─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   Security Hub   │  ← Normalization, Dedup, Priority, Std Evals
                    │ (Single Source   │     FSBP/CIS/PCI/NIST
                    │   of Truth)      │
                    └─────────┬────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
        Custom Action   Automation Rule   Findings-Imported
        (Manual HITL)   (Field Updates)    → EventBridge
                                                 │
                              ┌──────────────────┴─────────┐
                              ▼                            ▼
                      SSM Automation Runbook          Lambda
                      (Isolation/Snapshot/Remediate) (Custom Response)

  [Audit]  Audit Manager → SOC2/HIPAA/PCI Evidence Auto-Collection → Assessment Report
  [Governance] Firewall Manager (Central WAF/Shield)  │  CloudTrail Lake (7-year SQL Investigation)
  [Multi-Account] Delegated Administrator  │  [Multi-Region] Region/Config Aggregator
```

The core principles running through this are three-fold. First, **all signals converge to Security Hub as ASFF** — normalizing different tool outputs into one language is the prerequisite for automation. Second, **automated response splits by risk and reversibility** — safe and reversible means full automation (Imported→Lambda), destructive means human approval (Custom Action HITL). Third, **multi-account is Delegated Administrator and multi-region is Aggregator** — orthogonal axes for unification.

## Service Role Boundaries — Organizing Confusing Pairs

| Confusing Pair | Distinction |
|------------|------|
| **GuardDuty vs Inspector** | Threat/behavior detection (runtime) vs CVE vulnerability scanning (assets) |
| **Config vs CloudTrail** | Resource state/configuration vs API call/behavior audit |
| **Config vs Audit Manager** | Assess "are we compliant now" and remediate vs Collect evidence to prove compliance with reports |
| **Macie vs Inspector** | S3 sensitive data (PII/PHI) vs Package CVE vulnerabilities |
| **Custom Action vs Automation Rule** | Operator manual trigger (HITL) vs Lambda-less automatic field update |
| **Automation Rule vs Imported→Lambda** | Update Finding fields only (can't fix resources) vs Actual resource remediation |
| **Delegated Administrator vs Aggregator** | Multi-account unification vs Multi-region unification |
| **Suppression Rule vs Trusted IP** | Keep Finding+hide vs Block Finding generation (blind spot risk) |

> 💡 **Related Theory**: This entire stack organizes under NIST's **Cybersecurity Framework (CSF)** 5 functions. **Identify** Config, Macie, Access Analyzer / **Protect** Firewall Manager, Conformance Pack, KMS / **Detect** GuardDuty, Inspector, Security Hub / **Respond** EventBridge→SSM, Lambda / **Recover** Snapshots, backups, PITR. In scenarios, diagnosing "which CSF step is missing" quickly reveals what to add. NIST CSF, created 2014 under U.S. Executive Order (EO 13636) for critical infrastructure protection, added a sixth **Govern** function in 2024 CSF 2.0 — governance is the policy, role, risk-management layer spanning the five functions, handled in AWS by Organizations, Control Tower, SCP.

> 🔍 **Deeper**: Another principle running through the stack is **defense in depth**. Don't rely on a single control; stack detection, prevention, and response in multiple layers so one layer's breach is stopped by the next — a medieval castle's moat-wall-keep structure borrowed for infosec (NSA applies it). Week 14 tools fill different layers: Firewall Manager, Config (prevention, block misconfig), GuardDuty, Inspector (detection, catch after breach), EventBridge→SSM (response, auto-isolate), CloudTrail Lake (forensics, what happened). The Capital One incident (Day 1) showed that when one layer (WAF misconfiguration) breaks and the next layer (credential theft detection and auto-disable) is missing, damage cascades — defense-in-depth absence becomes a single point of failure.

## 🧠 12 Practical Scenario Questions

**Question 1.** GuardDuty detected `Backdoor:EC2/C&CActivity.B!DNS` (Severity 8.7) on production EC2. Automate: ①preserve forensic evidence ②network isolation ③ops team alert, without human involvement, yet investigators must access the instance to examine what the attacker did. What's the correct auto-response sequence?

A) Terminate instance immediately to cut C2 comms, SNS to ops — maximum threat blockade first

B) EventBridge (severity≥7 + type prefix filter) → SSM Runbook: EBS snapshot (first) → swap to isolation SG → tag incident-id → SNS alert

C) Lambda reboots instance to kill malware, then snapshot for evidence

D) Custom Action for operator approval before snapshot/isolation to prevent false positive damage

**Answer: B**

Explanation: Forensic evidence must be preserved before termination/reboot — memory and disk state disappear after. "Isolation" means isolation SG (all outbound blocked + forensic jumpbox inbound only), not termination — this cuts C2 while preserving investigator access. Immediate termination (A) and reboot (C) destroy evidence; "without human involvement" rules out manual approval (D). EventBridge severity/type filtering into SSM Runbook is the standard.

---

**Question 2.** Organization: 50 accounts × 3 regions. View all accounts/regions' security Findings from Audit account console. What's the correct setup?

A) Delegated Administrator only for 50 accounts (represent regions by one region)

B) Region Aggregator only for 3 regions (connect accounts individually)

C) Delegated Administrator (50-account unification) + Cross-Region Aggregation (3-region unification)

D) Manually check each account/region console, aggregate Finding counts on CloudWatch dashboard

**Answer: C**

Explanation: Multi-account and multi-region are orthogonal axes. Delegated Administrator handles account dimension, Region Aggregator handles region dimension. 50×3 requires both — missing either (A, B) leaves the other axis unaggregated. Manual review (D) is impractical. This orthogonality is the key distinction.

---

**Question 3.** FSBP standard S3.1 (Block Public Access) control is FAILED on bucket. Auto-remediate to private without human intervention. What's correct?

A) Security Hub Automation Rule matches S3.1 FAILED, auto-fixes bucket private

B) EventBridge (`Security Hub Findings - Imported`, GeneratorId prefix S3.1, Compliance FAILED) → Lambda applies Block Public Access

C) Custom Action lets operator select this Finding in console and trigger private-ness

D) Suppression Rule hides S3.1 FAILED Findings to reduce noise, batch-remediate in periodic review

**Answer: B**

Explanation: Resource remediation requires EventBridge (`Findings - Imported`) → Lambda/SSM. Automation Rule (A) updates Finding fields only; it can't fix resources — key pitfall. Custom Action (C) is manual HITL, breaks "without human." Suppression (D) hides problems without fixing. Rule: "Field update only" is Automation Rule; "resource remediation" is EventBridge+Lambda/SSM.

---

**Question 4.** Deploy PCI DSS/NIST 800-53 rule bundles org-wide (OU) with auto-remediation. What's the tool?

A) Manually create PCI/NIST Config Rules per account, attach Remediation individually

B) Conformance Pack (Config Rule + Remediation bundles in YAML) deployed to OU via internal StackSets

C) Enable Security Hub PCI/NIST Standards only for org-wide control evaluation

D) Deploy Audit Manager's PCI/NIST Framework for control evaluation and auto-remediation

**Answer: B**

Explanation: Conformance Pack bundles Config Rules + Remediation (YAML), deploying org-wide via internal CloudFormation StackSets. Pre-defined packs provided (PCI/NIST/HIPAA/FedRAMP). Manual creation (A) is impractical; Security Hub Standards (C) is evaluation/dashboard, not remediation bundles; Audit Manager (D) is audit evidence, not operational remediation.

---

**Question 5.** Auto-Remediation flaps: same resource endlessly corrects-violates, API throttles, costs explode. Root cause and safety valve?

A) Normal remediation behavior; just raise throttle limits and accept costs

B) External process keeps returning resource to NON_COMPLIANT + MaximumAutomaticAttempts not set — limit retries with MaxAttempts/RetrySeconds, tag justified exceptions

C) Disable auto-Remediation for that rule, batch-fix manually

D) Migrate workload to lower-API-load region to reduce throttle pressure

**Answer: B**

Explanation: External automation flips resource to NON_COMPLIANT, Config auto-remediates, repeat → flapping. MaxAttempts and RetrySeconds break the loop. For legitimate resources, use exception tags or set `Automatic:false` for human approval. Config disable (C) and region migration (D) don't fix root cause.

---

**Question 6.** ECR container push: auto-scan OS + npm/pip dependency CVEs, auto-re-evaluate on new CVE disclosure. What's correct?

A) Macie Discovery Job scans ECR image layers for dependency vulns and sensitive data together

B) Inspector v2 ECR Enhanced Scanning — OS+language dependency CVE scan + continuous re-eval on new CVE, Findings→Security Hub

C) GuardDuty Malware Protection detects malware and package CVEs at runtime

D) Config Rule evaluates ECR repo's scan settings compliance, detects unscanned images

**Answer: B**

Explanation: Inspector v2 scans ECR OS packages + language dependencies (npm, pip, gem), continuously monitoring — new CVE published triggers auto-re-eval of already-scanned images. Log4Shell-level dependency visibility. Macie (A) is S3 data classification; GuardDuty Malware (C) is EBS malware; Config (D) is settings compliance, not CVE scanning.

---

**Question 7.** Large S3 data lake (hundreds TB): auto-discover card numbers/SSNs, control costs. What's the strategy?

A) Full-scan Discovery Job daily for complete card/SSN capture, no missed data

B) Macie auto-discovery (sampling-based continuous monitoring, low cost) + incremental Discovery Job for new/changed only, Luhn validation reduces false positives

C) Download all objects to EC2, run custom regex script for manual checking

D) Skip Macie, use S3 Inventory + Athena regex query for low-cost direct detection

**Answer: B**

Explanation: Full Discovery Job daily (A) balloons costs. Industry practice: auto-discovery (sampling, always-on, cheap) + full Jobs (high-precision, high-cost) only for new/changed. Luhn validation catches false positives. Manual check (C) is impractical; disabling (D) creates compliance blind spots.

---

**Question 8.** Find S3/roles exposed to external accounts/public without missing cases. Shrink IAM permissions to observation-based least privilege. What's the combo?

A) GuardDuty external-access Findings + IAM Access Advisor to shrink permissions

B) Access Analyzer External Findings (Zelkova formal reasoning, no missed cases) + Policy Generation (CloudTrail-based actual-use policies) + Unused Access

C) Config Rules (s3-bucket-public-read-prohibited, etc.) + manual permission audit

D) Macie detects external-shared buckets' sensitive data; IAM permission reports identify over-grant

**Answer: B**

Explanation: Access Analyzer External Findings use Zelkova (formal verification via SMT solvers) — mathematically proves all possible cases where external access is allowed, guaranteeing no misses (AWS Provable Security). Policy Generation extracts only actually-used perms from CloudTrail (observation-based least privilege); Unused Access finds disused perms for removal. GuardDuty (A) detects threats, not external exposure; Macie (D) classifies data, not exposure; Config (C) is operational evaluation.

---

**Question 9.** Eliminate manual screenshot/log collection for SOC2/PCI audits. Auto-collect evidence, submit reports to auditors. What's the tool?

A) Config Aggregator unifies multi-account compliance view for audit submission

B) Audit Manager — SOC2/PCI Frameworks auto-map evidence (CloudTrail/Config/Security Hub) to regulatory controls, generate Assessment Reports

C) Security Hub Insights group Findings by control for compliance reporting

D) CloudTrail Lake SQL query audit-period activity, extract evidence for auditor submission

**Answer: B**

Explanation: Audit Manager Framework (SOC2, PCI, HIPAA, ISO 27001) auto-maps evidence (CloudTrail API activity, Config resource state, Security Hub Findings) to regulatory controls, generates Assessment Reports — continuous compliance transforms audits from events to state. Config Aggregator (A) unifies viewing; Insights (C) saved queries; CloudTrail Lake (D) SQL forensics — none generate audit reports.

---

**Question 10.** Reduce false positives but keep investigative records in case that IP/pattern later compromises. GuardDuty: what's correct?

A) Add IP to Trusted IP List — block that IP's Findings, reduce noise

B) Suppression Rule — generate Findings but hide from console/alerts, preserve data for post-investigation

C) Disable that detection type because it falsely triggers

D) Add to Threat IP List for explicit tracking, separate Finding management

**Answer: B**

Explanation: Trusted IP List (A) blocks Finding generation — if that IP later compromises, GuardDuty goes silent (blind spot). Suppression Rule (B) generates and preserves Findings but hides them from console/alerts — "reduce noise but keep audit data." "False positive noise BUT preserve forensic records" = Suppression. Threat IP List (D) is the opposite (active monitoring list).

---

**Question 11.** Operator manually triggers response in console for specific Finding (destructive production work needs human judgment). What's the mechanism?

A) Automation Rule auto-triggers `Findings - Imported` flow when condition matches, SSM/Lambda auto-runs

B) Custom Action: operator selects Finding in console, manually triggers → `Security Hub Findings - Custom Action` event → EventBridge → SSM/Lambda

C) Conformance Pack Remediation connects to that Finding type, batch-auto-fixes

D) Insight groups Findings, auto-runs workflow at threshold

**Answer: B**

Explanation: Custom Action is human-in-the-loop (HITL) — operator selects Finding, triggers, emitting `Security Hub Findings - Custom Action` event to EventBridge/SSM/Lambda. Perfect for destructive/irreversible work requiring human approval. `Findings - Imported` (A) is all new Findings auto-flow (no human). Conformance Pack (C) and Insight (D) aren't triggering mechanisms.

---

**Question 12.** Fintech org: ①multi-account threat detection auto-enabled ②all Findings unified ③S3 PII discovery ④container CVE scanning ⑤external exposure detection ⑥7-year breach SQL investigation ⑦multi-account WAF central policy. Map each requirement to correct service.

A) ①GuardDuty Org Delegated Admin+auto-enable ②Security Hub(ASFF) ③Macie ④Inspector v2 ⑤Access Analyzer ⑥CloudTrail Lake ⑦Firewall Manager

B) All handled by GuardDuty

C) All handled by Security Hub

D) ①Config ②Macie ③GuardDuty ④Audit Manager ⑤Inspector ⑥Config ⑦Inspector

**Answer: A**

Explanation: Service boundary precision is key. ①Multi-account threat auto-apply = GuardDuty Organizations Delegated Admin + auto-enable. ②Finding unification = Security Hub (ASFF). ③S3 PII = Macie. ④Container CVE = Inspector v2. ⑤External exposure = IAM Access Analyzer. ⑥7-year SQL = CloudTrail Lake. ⑦Multi-account WAF = Firewall Manager. One-service answers (B, C) or mixed mappings (D) are wrong. Week 14 comprehensive scenario.

---

## 📌 Week 14 Final Checkpoint — Pre-Exam Verification

1. **Detect**: GuardDuty (agent-less, data plane logs, signature+anomaly, Severity=severity×confidence) / Inspector v2 (CVE·CVSS·NVD, EC2·container·Lambda, continuous re-eval)
2. **Aggregate**: Security Hub (ASFF normalization·Normalized 0~100, FSBP/CIS/PCI/NIST standards, Config-dependent) — multi-account=Delegated Admin, multi-region=Region Aggregator
3. **Evaluate & Remediate**: Config (closed-loop control, CI=state snapshot, 3-Rule types Managed/Lambda/Guard DSL, Conformance Pack=StackSets, Remediation=SSM Automation, flapping blocked by MaxAttempts)
4. **Evidence/Data/Permissions**: Audit Manager (evidence auto-collection & proof) / Macie (PII classification, Luhn validation, cost control) / Access Analyzer (Zelkova formal-verify external exposure, observation-based least privilege)
5. **3 Response Paths**: Custom Action (manual HITL) / Automation Rule (field updates only) / Imported→Lambda·SSM (actual resource remediation)
6. **Governance**: Firewall Manager (central WAF/Shield) / CloudTrail Lake (7-year SQL) / NIST CSF 5 functions diagnostics

> 💪 Week 14 Complete! Core: "Precisely distinguish role boundaries; choose automation depth by risk and reversibility."

> 🎯 **Scenario (Holistic Diagnosis Practice)**: A SaaS firm says "security tools all enabled, incident happened." Investigation: GuardDuty, Security Hub, Config all active; Findings pile up; no automated response connected. **CSF diagnosis: Detect sufficient, Respond missing**. Fix: ① Automation Rule suppresses low-risk Findings (reduce alarm fatigue, base-rate error) ② Critical+specific-type EventBridge→SSM for full auto-isolation ③ Destructive work Custom Action HITL ④ Macie identifies which bucket has PII (Identify step) to prioritize. "Turning on tools" ≠ "tying detection to response" — without the latter, detection is just noise.

## 🔜 Week 15 Preview

**Comprehensive Scenario — Enterprise Case**: Weeks 1~14 CI/CD, IaC, monitoring, security into one enterprise case for end-to-end application verification.
