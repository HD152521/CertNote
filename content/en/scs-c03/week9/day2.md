# Day 2 - Amazon Detective: Finding Investigation and Root Cause, Behavior Graph, GuardDuty Integration

Once GuardDuty says "something is wrong," the next question is always the same: **"Is it really a breach? How far has it spread? How did it start?"** This *investigation* phase is Amazon Detective's domain. If GuardDuty is *detection*, Detective is *investigation* — it takes one finding and visualizes all surrounding behavior, tracking root cause and blast radius.

Detective's core is "replacing the analyst's manual SQL slog of stitching scattered logs with an automatically built **behavior graph**." In incident investigation, the most expensive resource is analyst time. Detective pre-connects and aggregates data (dozens of days) into a graph, so when a finding lands, the analyst can answer "Did this IAM role behave differently than usual?" or "When did this IP start communicating with our environment?" in a few clicks.

## What It Consumes and What It Produces

Detective re-collects sources similar to GuardDuty's *for investigation purposes*:

```
Input Sources
  ├─ VPC Flow Logs
  ├─ CloudTrail Management Events
  ├─ GuardDuty Findings
  ├─ EKS Audit Logs
  └─ (Detective internally normalizes and connects)

Output
  └─ Behavior Graph: Entity + Relationship
```

- **Entity**: IAM users/roles, EC2 instances, IP addresses, AWS accounts, containers, user agents, S3 buckets, etc. — "nodes" that become investigation subjects.
- **Relationship**: "This role was assumed from this instance," "This IP communicated with this instance" — "edges."

Detective layers **time axis + baseline** on this graph. It creates each entity's *normal behavior profile* and shows how the finding-time behavior deviates from normal.

> 💡 **Related Theory**: This is security operations' *triage* and *root cause analysis* solved with data. Traditional SIEM requires analysts to write queries for correlation, but Detective *materializes* entity-to-entity connections upfront in a *graph data model*. "First-time observation" — this credential calling an API from an unseen region for the first time — is a critical breach investigation signal, and Detective auto-highlights it.

## From Finding to Investigation: Visual Workflow

Investigation typically starts from a GuardDuty finding or Security Hub and jumps via "Investigate in Detective":

```
GuardDuty Finding (e.g., abnormal API call)
   │  "Investigate in Detective"
   ▼
Detective: Entity (IAM role) Profile Page
   ├─ API call volume time-series (normal vs now — spike?)
   ├─ Call locations (region/IP) — new region?
   ├─ User agents used — new tooling (e.g., script)?
   ├─ Associated instances/IPs — where was it assumed from?
   └─ Time range slider to compare before/after incident
```

The analyst judges through this profile whether it's "normal operation's coincidental spike" or "stolen credential abuse." Key questioning patterns:
- **When first seen** — first appearance of new IP/region/agent.
- **How deviant** — call volume/failure rate baseline deviation.
- **How far spread** — other entities connected from one entity (lateral movement).

> ⚠️ **Trap**: Detective does *not* detect or block. It creates no new findings (that's GuardDuty) and blocks no traffic (that's WAF/SG). Detective *investigates and explains* existing findings and logs. "Auto-detect threat" → GuardDuty. "Investigate finding root cause" → Detective.

## Integration with GuardDuty: Partnership

Detective stands alone but shines as GuardDuty's partner:

```
GuardDuty (detect)  ──findings──▶  Security Hub (aggregate)
     │                                  │
     │  (both connected to Detective's behavior graph)
     ▼                                  ▼
        Amazon Detective (investigate)
        - Map GuardDuty findings to graph context
        - Auto-collect and visualize surrounding behavior
        - "Does this finding share credential/IP with other findings"
```

- GuardDuty findings auto-connect to Detective graph entities, letting one click launch investigation context.
- When multiple findings share *same entity (IP, role)*, Detective groups them as "campaign" level.
- **Finding groups**: Detective auto-groups related findings and entities into single investigation units (reduces individual finding noise).

> 💡 **Related Theory**: This solves *alert fatigue* — when detection tools dump hundreds of findings, analysts freeze. Detective's finding groups bundle multiple findings from a single attack campaign into one unit — raising SOC signal-to-noise ratio, a key operational mechanism.

## Multi-Account Investigation

Detective uses the identical **Organizations + Delegated Administrator** model as GuardDuty. Recommended: designate the *same* Security Tooling account as Detective delegated administrator:

```
Management Account ──designate──▶ Detective Delegated Administrator (Security Tooling)
                                       │
                                       └─ Integrate all member data into single behavior graph
```

- Member account data flows into *one* behavior graph, enabling tracking of lateral movement across account boundaries (e.g., role stolen from one account accessing resources in another).
- Aligning GuardDuty, Security Hub, Detective delegated administrators to the same account smooths investigation experience (consistent data and permissions).

> ⚠️ **Trap**: Enabling Detective doesn't instantly create a rich graph. **Data accumulation period (usually 2+ weeks)** is needed to form baseline. "I just enabled Detective but see no past behavior" is normal — it collects data *after* activation. So pre-enabling before incidents is best practice.

## Detective Investigations (Auto-Analysis)

Modern Detective offers **Automated Investigations** for IAM users/roles. Specify a credential, and Detective maps to MITRE ATT&CK tactics, auto-analyzes suspicious behavior (privilege escalation, reconnaissance, etc.), and generates risk summary. Analysts need not manually traverse the graph — "is this role risky?" gets fast signals.

> 🔍 **Deeper Dive**: Precisely positioning Detective in the detect-investigate-respond pipeline is core to exam and practice. *Detection (GuardDuty)* signals "something is wrong," *aggregation (Security Hub)* collects "on one screen," *investigation (Detective)* answers "why, how far, how," *response (EventBridge/Lambda/SSM)* takes "action." Mistaking Detective for "another detection tool" is an exam trap — Detective *explains* findings, not *generates* them.

## Frequently Confused Distinctions

- **Detective vs GuardDuty**: GuardDuty detects (generates findings), Detective investigates (explains findings, root cause). Detective creates no findings.
- **Detective vs CloudTrail Lake/Athena**: Athena/CloudTrail Lake are *manual query* analysis (SQL), Detective is *pre-built graph* for visual investigation. Detective auto-provides baseline and relationships.
- **Detective vs Security Hub**: Security Hub *aggregates* findings from multiple tools (standardizes to ASFF), Detective is *deep investigation*. Aggregation vs depth.
- **Detective vs Inspector**: Inspector is vulnerabilities (weaknesses), Detective is incident investigation (behavior). Completely different axes.

## One-Line Summary Checklist

- [ ] Detective enabled *before* incident to pre-accumulate baseline
- [ ] Detective delegated administrator aligned to same Security Tooling account as GuardDuty and Security Hub
- [ ] Workflow to enter investigation context from finding via "Investigate in Detective"
- [ ] Finding groups bundle related findings to reduce alert fatigue
- [ ] Detective correctly positioned as investigation tool, not detection/prevention

---

## 📝 Practice Questions

**Question 1.** GuardDuty generated a finding of anomalous API calls for an IAM role. The security analyst wants to quickly determine the root cause and scope of impact: "since when has this credential been active in a new location, and which resources did it access?" What is the most appropriate tool?

A) Amazon Inspector  
B) Amazon Detective  
C) AWS Config  
D) Amazon Macie  

**Answer: B**  
Explanation: Visualizing a finding's root cause and scope of impact as a behavior graph to trace "first occurrence time, new Region/IP, and related entities" is exactly what Detective is for. Inspector is vulnerability scanning, Config is resource configuration history, and Macie is S3 sensitive data classification, all of which serve purposes different from behavior-based incident investigation.

---

**Question 2.** A team enabled Amazon Detective for the first time after suspecting a breach, but the rich behavior data from before the incident is not visible in the graph. Which reason is correct?

A) Detective was misconfigured  
B) Detective accumulates data only from activation onward, so it needs time to form a baseline, and the best practice is to turn it on before an incident  
C) Detective analyzes only VPC Flow Logs  
D) A delegated administrator was not designated  

**Answer: B**  
Explanation: Detective collects and links data from the moment of activation, and it usually takes two weeks or more to build a meaningful baseline. Therefore, turning it on after an incident leaves past context lacking, and the correct approach is to keep it on at all times before an incident. The cause is not a configuration error, a source limitation, or a missing delegated administrator, but the data accumulation characteristic.

---

**Question 3.** Which statement about the role of Amazon Detective is correct?

A) It generates new threat findings on its own and blocks malicious traffic  
B) It connects existing findings and logs into a behavior graph to assist investigation and root cause analysis, but does not generate findings or block  
C) It automatically classifies PII in S3 buckets  
D) It scans EC2 and ECR for CVEs  

**Answer: B**  
Explanation: Detective is an investigation-only tool that bundles findings and logs created by GuardDuty into a graph to analyze "why, how far, and how." Finding generation is GuardDuty's role, blocking is WAF/SG, PII classification is Macie, and CVE scanning is Inspector. Mistaking Detective for a detection/blocking tool is a typical pitfall.

---

**Question 4.** SOC analysts suffer alert fatigue from a flood of GuardDuty findings. Which Detective feature groups related findings and entities into a single investigation unit to improve the signal-to-noise ratio?

A) Trusted IP list  
B) Finding groups  
C) Malware Protection  
D) Macie classification  

**Answer: B**  
Explanation: Detective's finding groups automatically group many findings that share common entities such as the same credential or IP into one investigation unit, reducing alert fatigue. The Trusted IP list is a GuardDuty finding suppression setting, Malware Protection is malware scanning, and Macie is data classification, so none relates to grouping findings.

---

**Question 5.** You want to trace, in a single pane across account boundaries, lateral movement in which an IAM role stolen in one account accessed resources in another account. What is the most appropriate Detective configuration?

A) Turn on Detective individually in each account and investigate separately  
B) Integrate all account data into a single behavior graph with an Organizations delegated administrator (Security Tooling account)  
C) Instead of Detective, manually query CloudTrail with Athena in each account  
D) GuardDuty alone is sufficient, so Detective is unnecessary  

**Answer: B**  
Explanation: Tracing lateral movement across account boundaries is possible only by integrating all member account data into one behavior graph, which is achieved with the Organizations delegated administrator model (aligned to the same account as GuardDuty and Security Hub). Per-account investigation or manual Athena queries lack a unified view and are inefficient, and GuardDuty alone is insufficient for deep investigation and correlation.

---

