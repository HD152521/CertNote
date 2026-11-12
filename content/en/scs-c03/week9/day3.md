# Day 3 - Amazon Inspector: EC2/ECR/Lambda Vulnerability Scanning, CVE, Automated Assessment

If GuardDuty sees "right now someone is conducting malicious activity," then Amazon Inspector sees "before exploitation, where are the weaknesses?" GuardDuty detects *threats* (actual hostile activity) while Inspector detects *vulnerabilities* (exploitable weaknesses). The timing differs — vulnerabilities are potential weak points, threats are real activities exploiting those weak points (or entering by other routes). Secure operations require both: reduce weak points (Inspector) and catch breaches (GuardDuty).

The essence of Inspector (current Amazon Inspector, often called "Inspector v2") is: "**automatically and continuously** scan resources to find known vulnerabilities (CVEs) and dangerous exposures, and assign **prioritized scores** reflecting environmental context." Unlike the old v1 requiring manual assessment runs, enabling Inspector makes it rescan automatically as new resources arrive and new CVEs are disclosed.

## What Gets Scanned: Three Targets

```
Amazon Inspector Scan Targets
  ├─ EC2 instances           → OS package CVEs + network reachability
  ├─ ECR container images    → OS/language package CVEs in image layers
  └─ Lambda functions        → Function code + dependency package CVEs (+ code vulnerabilities)
```

- **EC2**: Examines two aspects — (1) **CVEs** in installed OS/application packages, (2) **network reachability analysis** (can the internet reach this port). Reachable vulnerabilities are higher risk.
- **ECR**: Scans container images as they are pushed. **on-push** (once at push) + **continuous** (repeated rescan) options. When new CVEs are disclosed, already-pushed images are re-evaluated.
- **Lambda**: Scans dependency package vulnerabilities (standard scanning) + optionally code vulnerabilities themselves (code scanning, e.g., hardcoded secrets, injection patterns).

## How Scanning Works: SSM Agent and Agentless

Two approaches exist for EC2 scanning:
- **Agent-based**: Collects in-instance package inventory via **SSM Agent** (Systems Manager). Works without additional installation if the instance is SSM-managed.
- **Agentless**: Takes EBS snapshots for analysis (covers instances not managed by SSM). Inspector intelligently chooses between them.

> ⚠️ **Trap**: Common reason "EC2 is registered with Inspector but not scanning" is **SSM Agent not installed/managed**. Agent-based scanning requires the instance to be SSM-managed (SSM Agent running + proper instance profile IAM role + SSM connectivity). Exams frequently test "Inspector can't scan instance → check SSM management state."

```
EC2 ── SSM Agent ── Systems Manager ── Inspector(collects package inventory, evaluates CVEs)
      OR
EC2 ── (No SSM) ── Inspector agentless(analyzes EBS snapshot)
```

> 💡 **Related Theory**: Vulnerability management belongs to NIST's *Identify* (ID.RA, risk assessment) function. The core loop is "discover → assess → prioritize → remediate → verify," ongoing. Old Inspector was *periodic assessment*, current Inspector is *continuous*. Why does this matter? The vulnerability landscape is not static. An image clean yesterday can become vulnerable today when new CVEs are disclosed. Only continuous scanning keeps up with "new risk in already-deployed assets."

## CVEs and Prioritization: Inspector Score vs CVSS

Inspector attaches a **CVE** identifier and **CVSS** base score to each found vulnerability. But prioritizing on CVSS alone creates noise. Inspector produces its own **Inspector score** reflecting environmental context:

```
Inspector Priority = CVSS base score
                   × Network reachability (can internet reach it?)
                   × Exploit availability (known exploit exists?)
                   × ... environment context
```

Example: Same CVSS 9.0, but (a) a vulnerability reachable from internet-facing port with public exploit = top priority, (b) a vulnerability unreachable in isolated subnet = lower priority. This *context-based prioritization* tells analysts "what to patch first."

> 💡 **Related Theory**: This is *risk-based vulnerability management*. You cannot patch thousands of vulnerabilities at once, so weighting "exploitability × exposure × impact" prioritizes. CVSS is the vulnerability's *intrinsic* severity, Inspector score is *your environment's* risk. External signals like EPSS (Exploit Prediction Scoring System) and KEV (Known Exploited Vulnerabilities) inform this weighting.

## Automated Assessment and Integration

Inspector's operational value comes from *automation*:

```
Inspector (continuous scanning)
   │  Findings
   ├─▶ Security Hub (auto-integrate, ASFF normalization)
   ├─▶ EventBridge ──▶ Lambda/SSM (auto-patch, ticket, isolate)
   └─▶ Inspector console (dashboard, risk score sorted)
```

- New resource (EC2 start, ECR push, Lambda deploy) → auto-scanned.
- New CVE disclosed → affected existing assets auto-re-evaluated.
- Finding → auto-aggregated in Security Hub + EventBridge auto-response (e.g., SSM Patch Manager auto-applies patch, or creates Jira ticket).

> ⚠️ **Trap**: ECR scanning with **on-push only** catches vulnerabilities at push time but misses CVEs disclosed *later*. Answer to "track new vulnerabilities in old images" is **enable continuous scanning** + retention period.

## Multi-Account: Delegated Administrator Alignment

Inspector follows the **Organizations + delegated administrator** pattern too. Aligning the **same Security Tooling account** as Inspector delegated admin (as with GuardDuty/Detective/Security Hub) is recommended multi-account baseline:

```
Management Account ──designate──▶ Inspector Delegated Admin (Security Tooling Account)
                                         ├─ Enable Inspector org-wide + auto-enable
                                         ├─ Central policy for scan targets per account (EC2/ECR/Lambda)
                                         └─ Centralize all findings
```

> 🔍 **Deeper**: Viewing Inspector as a standalone vulnerability scanner turns it into "yet another report generator." The key is connecting it to *remediation loop* — Inspector findings → Security Hub aggregation → EventBridge → SSM Patch Manager (auto-patch) or ECR image rebuild pipeline (CI/CD blocks vulnerable image deploy). Especially in CI/CD: gate on ECR scan results (deploy fails if CRITICAL CVE exists) creates "shift-left" preventing vulnerabilities from reaching production before remediation.

## Common Confusions

- **Inspector vs GuardDuty**: Inspector finds *vulnerabilities* (exploitable weak points, preventive), GuardDuty detects *threats* (real malicious activity, detective). Different timing, targets.
- **Inspector vs Patch Manager (SSM)**: Inspector is *discovery* (what is vulnerable), Patch Manager is *remedy* (apply patches). Inspector diagnoses, Patch Manager prescribes. Connect via EventBridge.
- **Inspector vs Config**: Config is *configuration compliance* (does setting match policy), Inspector is *software vulnerability* (CVE). Different axes.
- **Inspector v1 vs current**: v1 was agent-based, manual assessment, rule packages; current is SSM/agentless, continuous scanning, auto. Current is the standard.

## One-Sentence Checklist

- [ ] EC2/ECR/Lambda scanning enabled per need; EC2 verified SSM-managed (or agentless)
- [ ] ECR using continuous scanning to track post-disclosure CVEs
- [ ] Using Inspector score (context-based priority) to remediate reachable/exploitable vulnerabilities first
- [ ] Findings connected to Security Hub, EventBridge, SSM Patch Manager for remediation automation
- [ ] Org delegated admin (Security Tooling account) aligned with other detection services

---

## 📝 Practice Questions

**Question 1.** The security team registered EC2 instances with Amazon Inspector, but some instances are not being scanned. When using agent-based scanning, what should be checked first?

A) Whether the instance's security group opens all ports  
B) Whether the instance is in a Systems Manager managed state, with the SSM Agent running and an appropriate IAM instance profile  
C) Whether the instance has a public IP  
D) Whether the instance is in us-east-1  

**Answer: B**  
Explanation: Inspector's agent-based EC2 scanning can collect the package inventory only if the instance is managed by SSM. Therefore, first check whether the SSM Agent is running, the instance profile with SSM permissions, and the SSM connection status (or substitute agentless scanning). Open security groups, public IPs, and specific Regions are not key conditions for scannability.

---

**Question 2.** A container image stored in ECR had no vulnerabilities when pushed but has since become vulnerable to a newly published CVE. How can this be caught up automatically?

A) Enable ECR scanning on-push only (one time)  
B) Enable ECR continuous scanning so that existing images are automatically re-evaluated when a new CVE is published  
C) Manually push the image again each time  
D) Turn on GuardDuty Malware Protection  

**Answer: B**  
Explanation: On-push scanning evaluates only at push time, so it misses CVEs published afterward. Continuous scanning automatically re-evaluates already-pushed images when a new CVE appears, catching up with post-push vulnerabilities. Manual re-pushing is impractical, and GuardDuty Malware Protection is malware scanning, not CVE vulnerability management.

---

**Question 3.** Of two vulnerabilities that both have a CVSS of 9.0, you are asked to patch only one first. Which one does Amazon Inspector rank at a higher priority?

A) A vulnerability in an isolated private subnet that cannot be reached from the internet  
B) A vulnerability exposed on a port reachable from the internet with a public exploit available  
C) The priority of the two vulnerabilities is always the same  
D) The more recently discovered vulnerability always takes priority  

**Answer: B**  
Explanation: The Inspector score weights risk by multiplying the CVSS base score by environmental context such as network reachability and exploitability. Even with the same CVSS, a vulnerability that is internet-reachable and has a public exploit carries much greater real risk, so it has higher priority. An unreachable vulnerability is lower priority, and priority is not determined merely by when it was discovered.

---

**Question 4.** You want to build a remediation pipeline that receives Inspector vulnerability findings and automatically applies patches to the affected EC2 instances. What is the most appropriate integration?

A) Inspector finding → EventBridge → automatic patching with SSM Patch Manager  
B) Inspector patches the instance directly  
C) Inspector finding → Macie → automatic patching  
D) Inspector → Detective → automatic patching  

**Answer: A**  
Explanation: Inspector only discovers (diagnoses); remediation is done by other services. The canonical remediation automation pipeline receives the finding through EventBridge and applies patches automatically with SSM Patch Manager (or Lambda). Inspector does not patch directly, and Macie is data classification and Detective is an investigation tool, both unrelated to patch remediation.

---

**Question 5.** Which statement most accurately describes the difference between the roles of Amazon Inspector and GuardDuty?

A) Both block malicious traffic in real time in the same way  
B) Inspector proactively discovers exploitable vulnerabilities (CVEs, etc.), and GuardDuty detects actual malicious activity (threats)  
C) Inspector handles threats, and GuardDuty handles vulnerabilities  
D) Inspector classifies S3 PII, and GuardDuty scans for CVEs  

**Answer: B**  
Explanation: Inspector proactively finds and prioritizes vulnerabilities (weaknesses) in EC2/ECR/Lambda, while GuardDuty detects actual threat activity such as credential misuse and malicious communication - a complementary relationship of prevention (reducing weaknesses) and detection (catching attacks). C has the roles reversed, neither blocks traffic, and PII classification belongs to Macie.

---
