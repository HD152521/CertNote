# Day 5 - Week 9 Synthesis: Integrated Review of Threat Detection Scenarios

This week covered the entire threat detection layer: GuardDuty (agentless threat detection), Detective (finding investigation, root cause), Inspector (vulnerability scanning), and Security Hub-centric unified architecture. Today we bind these into one decision framework. Exams test less on individual service features and more on *"which detection tool, in what role, deployed where for this situation?"* The key is **2D thinking: purpose (what do you want to know?) × integration (how do you bind it into one pipeline?).**

## Unified Decision Matrix: Requirement → Tool

| Requirement/Situation | Primary Tool | Core Reason |
|-----------|----------|-----------|
| Detect credential misuse, malicious communication real-time | GuardDuty (Foundation) | Agentless, analyzes CloudTrail/Flow/DNS |
| Host-internal process, file malicious behavior | GuardDuty Runtime Monitoring | Runtime visibility (lightweight agent) |
| EC2 malware infection suspected scan | GuardDuty Malware Protection (EBS) | Snapshot-based, no agent required |
| EC2/ECR/Lambda CVE vulnerability discovery | Inspector | Continuous scan + context-based priority |
| Track images through post-disclosure CVEs | Inspector ECR continuous scanning | Re-evaluate after push |
| Finding root cause, blast radius, lateral movement investigation | Detective | Activity graph, baseline comparison |
| Bundle related findings to reduce alert fatigue | Detective finding groups | Campaign-level grouping |
| Standardize, aggregate findings from multiple tools | Security Hub (ASFF) | Single pane + correlation |
| Evaluate compliance controls (CIS/FSBP) | Security Hub standard checks | Configuration best practice assessment |
| Single view of multi-region findings | Security Hub aggregation Region | Cross-region aggregation |
| Detect → auto-response (isolate/patch/ticket) | Security Hub → EventBridge → Lambda/SSM | SOAR unification |
| Automatically include new accounts | Delegated admin + auto-enable | Eliminate blind spots |
| S3 sensitive data (PII) classification | Macie | Data classification (not threat detection) |

> 💡 **Related Theory**: This matrix's foundation is NIST CSF's *Detect* function and the division of prevention-detection-response. When prevention (IAM, encryption, WAF) is breached, the detection layer discovers "threats (GuardDuty) + vulnerabilities (Inspector)," investigation (Detective) interprets findings, and aggregation/automation (Security Hub+EventBridge) operates. Exam "best" answers usually combine *purpose-matched specialist tool + Security Hub integration + Security Tooling account delegation*.

## Purpose-Driven Thinking: "Detect" vs "Investigate" vs "Block"

The same incident can split across different answers by *verb*. Read the problem's verb first:

- **"Detect"** → GuardDuty (threats) or Inspector (vulnerabilities). Finds *generate* findings.
- **"Investigate, root cause"** → Detective. Tool *explains* findings (generates none).
- **"Aggregate, standardize, single pane"** → Security Hub. Tool *collects* findings.
- **"Prevent/block"** → WAF/SG/NACL/Network Firewall. Detection tools do NOT block.
- **"Auto-respond"** → EventBridge + Lambda/SSM/Step Functions.

> ⚠️ **Trap Collection**:
> - Mistaking Detective for "detection tool" (actually investigation — generates no findings).
> - Mistaking Security Hub for "threat detection tool" (actually aggregation, orchestration).
> - Mistaking GuardDuty/Inspector for "blocking tools" (detects only — blocking is separate automation).
> - Assuming GuardDuty Foundation sees inside hosts (only network/API — Runtime Monitoring needed).
> - Assuming Inspector EC2 scan works without SSM management (agent-based needs SSM).
> - Assuming GuardDuty DNS findings work with custom DNS resolvers (needs VPC default resolver).
> - Assuming ECR on-push catches post-disclosure CVEs (needs continuous).
> - Assuming Security Hub findings are global (per-region — aggregation Region needed).

## Integrated Scenario A: Full Pipeline for Single Breach

> 🎯 **Scenario A**: "Internet-exposed EC2 appears breached. Should have known weakness beforehand, detected attack, investigated root cause, auto-isolated and ticketed. 50-account organization."
>
> **Answer**:
> 1. **Inspector**: Continuously identify critical CVEs on exposed EC2 (reachability, exploit weighting priority).
> 2. **GuardDuty**: Detect `UnauthorizedAccess:EC2/SSHBruteForce` + anomalous outbound. Host-internal suspicion → Runtime Monitoring, malware suspicion → Malware Protection.
> 3. **Detective**: Investigate breached instance role's new-region, new-API reconnaissance, same IP contacting other instances (lateral movement).
> 4. **Security Hub**: Aggregate findings 1–3 to ASFF → **EventBridge** → Lambda (move to isolation SG + snapshot + revoke credentials) + Jira ticket.
> 5. **Baseline**: Align all service delegated admins to Security Tooling account + auto-enable.

## Integrated Scenario B: Multi-Account, Multi-Region Detection Baseline

> 🎯 **Scenario B**: "Hundreds of accounts, multiple regions. Auto-include new accounts, prevent workload teams from disabling detection, view all findings in one pane, store logs where attackers can't touch."
>
> **Answer**:
> - Align **Security Tooling account** as *common delegated admin* for GuardDuty, Security Hub, Detective, Inspector, Macie, Access Analyzer.
> - Organization mode + **auto-enable** auto-includes new accounts, members cannot disable.
> - Security Hub **aggregation Region** aggregates multi-region findings into single region.
> - **Log Archive account** immutably (write-once) retains CloudTrail/Config logs — separated from detection account (duty separation).
> - Central EventBridge bus → unified response automation.

## Complete Summary of Common Confusions

**GuardDuty vs Inspector** — threat (real malicious activity, detective) vs vulnerability (exploitable weakness, preventive). Different timing.

**GuardDuty vs Detective** — detection (generates finding) vs investigation (explains finding). Detective generates no findings.

**Detective vs Security Hub** — deep investigation (narrow and deep, activity graph) vs aggregation and normalization (broad and shallow, ASFF). Complementary.

**Security Hub vs GuardDuty/Inspector** — aggregation and orchestration hub vs specialist detectors. Security Hub does not directly detect threats (standard control evaluation is an exception).

**Detection tools vs Prevention tools** — GuardDuty/Inspector/Detective/Security Hub *detect, investigate, aggregate* only. Blocking is WAF/SG/NACL/Network Firewall + automation's job.

**GuardDuty Malware Protection vs Inspector** — former *scans malware* (malicious files), latter *scans CVE vulnerabilities* (packages). Different targets.

**Macie vs Detection tools** — Macie is S3 *sensitive data classification* (PII), not threat detection.

## Visibility and Operations: Detection Completes as Pipeline

Detection maturity splits not on "findings emerge" but "findings *correlate, investigate, respond*":

```
[Prevention fails] → Inspector (weakness) + GuardDuty (threat) → Security Hub (aggregate, ASFF)
                                                                  ├─ Detective (investigate)
                                                                  └─ EventBridge → auto-respond
                                                                       (isolate/patch/ticket/alert)
```

Signal and integration per tool:
- **GuardDuty**: Finding → EventBridge (real-time) + Security Hub auto-integration.
- **Inspector**: Discovery → Security Hub + EventBridge → SSM Patch Manager (remediate).
- **Detective**: Investigation — from finding "Investigate in Detective" entry.
- **Security Hub**: ASFF aggregation + Insights correlation + automation rules + single EventBridge publication.

These signals connect to *actual isolation, forensics, recovery* workflows next week (incident response) — detection is incident response's entrance.

> 🔍 **Deeper**: The entire detection layer in one sentence: *"Discover with specialist tools, integrate via ASFF, investigate with Detective, respond via EventBridge, delegate to Security Tooling account."* On exams, "best" answers for detection nearly always contain some piece of this unified pattern. Traps usually stem from role confusion (investigation as detection, aggregation as detection, detection as blocking) or missing prerequisites (no SSM management, custom DNS, on-push only, auto-enable not set, aggregation Region not specified). Read verb and prerequisites first.

## One-Sentence Checklist

- [ ] Read the problem's verb (detect/investigate/aggregate/block/respond) first to choose tool
- [ ] Distinguish GuardDuty Foundation vs protective plans (Runtime/Malware) per situation
- [ ] Verify Inspector scan prerequisites (SSM management, ECR continuous)
- [ ] Position Detective precisely as investigation, not detection
- [ ] Understand Security Hub as aggregation, orchestration hub (ASFF)
- [ ] Align all detection service delegated admins to Security Tooling account + auto-enable
- [ ] Bind multi-region and auto-response via aggregation Region and EventBridge automation

---

## 📝 Practice Questions

**Question 1.** An internet-exposed EC2 instance appears to be compromised. In a 50-account organization, you want to (a) know weaknesses in advance, (b) detect attacks, (c) investigate the root cause, and (d) automatically isolate and create tickets. What is the most appropriate integrated design?

A) Turn on only GuardDuty and handle the rest manually  
B) Inspector (vulnerabilities) + GuardDuty (threats) + Detective (investigation) + Security Hub aggregation → EventBridge → Lambda/SSM automatic response, all delegated to the Security Tooling account  
C) Handle everything with only WAF and Shield  
D) Have people analyze by manually querying CloudTrail logs with Athena  

**Answer: B**  
Explanation: The four requirements correspond to different detection capabilities, so specialized tools must be integrated. Inspector handles weaknesses in advance, GuardDuty handles attacks, and Detective handles root cause; Security Hub aggregates in ASFF and triggers isolation and ticket automation via EventBridge; and delegating all services to the Security Tooling account provides multi-account consistency. GuardDuty alone, WAF/Shield (prevention), and manual Athena analysis cannot satisfy this integrated requirement.

---

**Question 2.** An analyst designed "detect threats in real time and block malicious traffic with Amazon Detective." What is the error in this design?

A) Detective does not work in multi-account setups  
B) Detective neither detects nor blocks; it is a tool for investigating and analyzing the root cause of existing findings and logs - detection is GuardDuty's role and blocking is WAF/SG's role  
C) Detective supports only EC2  
D) Detective is too expensive  

**Answer: B**  
Explanation: Detective does not generate findings or block traffic; it is an investigation-only tool that analyzes the findings and logs created by GuardDuty and others as a behavior graph to answer "why, how far, and how." Threat detection is GuardDuty, and blocking is the role of WAF/SG/NACL. Detective supports multi-account and handles various entities beyond EC2, so the other options are wrong.

---

**Question 3.** After you turned on Inspector, some EC2 instances are not scanned, and GuardDuty does not detect malicious processes inside the host. What is the correct combination of fixes for the two problems?

A) For Inspector, check the SSM managed state (or agentless); for GuardDuty, enable Runtime Monitoring  
B) Storing VPC Flow Logs in S3 solves both  
C) For Inspector, turn on ECR continuous; for GuardDuty, add a Trusted IP  
D) Simply turning on Security Hub solves both automatically  

**Answer: A**  
Explanation: Inspector's agent-based EC2 scanning requires the instance to be managed by SSM, so check the SSM status (or use agentless), and since basic GuardDuty sees only network/API, visibility into processes inside the host is obtained with Runtime Monitoring. Storing Flow Logs, ECR continuous (for images), Trusted IP (finding suppression), and Security Hub (aggregation) are not direct fixes for these two problems.

---

**Question 4.** In a multi-Region, multi-account organization, you want new accounts to be automatically included in detection, to view all Region findings in a single pane, and to prevent workload teams from turning detection off. What is the most appropriate baseline?

A) Manually turn on services in each account and Region and switch between consoles  
B) Delegate detection services to the Security Tooling account + auto-enable + configure a Security Hub aggregation Region  
C) Operate everything directly in the management account  
D) Receive findings only by email  

**Answer: B**  
Explanation: A delegated administrator (Security Tooling account) + organization mode auto-enable achieves both automatic inclusion of new accounts and prevention of members disabling arbitrarily, and the Security Hub aggregation Region aggregates multi-Region findings into a single Region. Manual activation and console hopping create blind spots, operating directly in the management account risks concentrating privileges, and merely receiving email makes integration and automation impossible.

---

**Question 5.** Which of the following is NOT frequently cited as a "pitfall" in this week's detection integration?

A) Mistaking Detective for a threat detection and blocking tool  
B) Assuming basic GuardDuty alone sees processes inside the host  
C) Aligning the delegated administrator of all detection services to the same Security Tooling account and turning on auto-enable  
D) Assuming Security Hub findings are visible globally across all Regions  

**Answer: C**  
Explanation: Delegating all detection services to the same Security Tooling account and turning on auto-enable is not a pitfall but the *recommended baseline* - it ensures consistency of data, permissions, and investigation, and automatic inclusion of new accounts. The rest are all genuinely frequent pitfalls: Detective is an investigation tool and not for detection or blocking, basic GuardDuty cannot see inside the host (Runtime Monitoring is needed), and Security Hub findings are per Region, so an aggregation Region is needed. Because the question asks you to choose what is *not* a pitfall, the answer is the delegated alignment configuration.

---
