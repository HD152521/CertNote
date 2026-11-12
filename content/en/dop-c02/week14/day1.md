# Day 1 - GuardDuty and Automatic Isolation: Signal Processing, Statistics, and Auto-Response Principles

Looking long at security operations, it converges to one underlying tension: "Attacks hide among normal traffic — how do we automatically extract that handful of malicious signals and respond instantly without human intervention?" This question splits into two axes: detection and response. On AWS, GuardDuty supports the first axis. In the console, GuardDuty looks like "a managed threat detection service activated with one button," but underneath lies decades-old signal processing from the 1980s onward — signature-based detection, anomaly detection, threat intelligence, and behavioral analysis — directly embedded. Today we explore how that "one button" internally reads what data to judge threats, how EventBridge and SSM Automation auto-isolate detected Findings without human hands, and where that automation becomes risky.

In the DOP exam, GuardDuty appears as the foundation of "threat detection + auto-response," with scenarios like "how do you isolate a compromised instance in 30 seconds without human intervention," "how do you uniformly apply detection across multi-account organizations," or "how do you reduce noise when alert fatigue is drowning your ops team." Once you read which component each choice touches — data source, EventBridge filter, SSM Runbook, or Organizations delegation — the answer emerges.

## Why Intrusion Detection is Hard — Fundamental Tension Between Signatures and Anomalies

The history of threat detection begins with James P. Anderson's 1980 report *"Computer Security Threat Monitoring and Surveillance."* It first proposed "analyze audit logs to find abnormal behavior," and Dorothy Denning's IDES (Intrusion Detection Expert System) model (1986-87) formalized this statistically. There the detection splits into two branches.

**Signature-based detection (misuse detection)** carries a list of "known malicious patterns" and compares traffic against it. Antivirus, Snort rules, blocking known C2 server IPs all use this. Accuracy (low false positive) is high, but **zero-day attacks not on the list go undetected.** **Anomaly-based detection** statistically learns "what is normal," then suspects deviations from that distribution. It can catch new attacks but explodes with false positives if "normal" definition shifts.

GuardDuty mixes both. It uses threat intelligence feeds (known malicious IPs/domains) for signature detection and runs machine learning and statistical models on CloudTrail, VPC Flow, and DNS logs for anomaly detection. A judgment like "this account suddenly mass-creates IAM users in a region it's never used" is impossible from pure signature matching—behavioral baseline is required.

> 💡 **Related Theory**: Anomaly detection's mathematical foundation rests on **statistical hypothesis testing** and **Bayesian inference**. Denning's IDES modeled each subject's (user/process) behavior with mean and variance, measuring anomaly by how many standard deviations (σ) observed values deviated from expected distribution. Modern GuardDuty uses more sophisticated models but the principle remains identical — "this behavior's prior probability is low, yet we observed it (posterior explodes)—suspect it." The fundamental limitation here is **base rate fallacy**. When intrusions are extremely rare (e.g., 1 per million events), a detector 99% accurate still produces mostly false positives in its alarms. GuardDuty's Severity scores and Suppression Rules exist precisely to handle this base rate problem — "detection is easy; detection without alert fatigue is hard."

> 🔍 **Deeper Dive**: GuardDuty's "agentless" design is architecturally critical. Traditional host IDS (HIDS, e.g., OSSEC) deployed agents on servers to monitor logs and file integrity. GuardDuty deploys no agents—instead it reads **AWS's own data plane logs already collected**—CloudTrail records API calls, VPC Flow Logs record network flows, Route 53 Resolver records DNS queries. GuardDuty **directly receives replica streams of these logs internally** for analysis, so users need not separately enable or store them (even without VPC Flow Logs activated, GuardDuty sees flows). That's what the "one button" really is—not building new data collection infrastructure but attaching an analysis engine to logs already flowing. Exceptions are EKS/ECS Runtime Monitoring and EBS Malware Protection, which add lightweight agents or snapshot scanning.

## GuardDuty Data Sources — What It Reads and What It Judges

GuardDuty's detection capability ultimately comes from "which logs it sees." Threat types caught vary by data source.

| Data Source | Reads | Representative Detection |
|------------|-------|--------------------------|
| **CloudTrail Admin Events** | All API calls | Root usage, abnormal region, IAM privilege escalation |
| **CloudTrail S3 Data Events** | S3 object-level access | Abnormal bulk downloads, unauthorized access |
| **VPC Flow Logs** | Network 5-tuple flows | Mining pool communication, C2 channels, port scans |
| **Route 53 DNS Logs** | DNS queries | Known malicious domains, DGA, DNS tunneling |
| **EKS Audit Logs** | Kubernetes API server calls | Privilege escalation, anonymous access, container escape |
| **EBS Malware Protection** | EBS volume snapshot scans | Malware files, trojans |
| **Lambda Network Activity** | Lambda VPC flows | Function abnormal external communication |
| **RDS Login Activity** | Database authentication attempts | Brute force, abnormal login |
| **Runtime Monitoring** | EKS/ECS/EC2 runtime behavior | Process execution, file access anomalies |

> 🔍 **Deeper Dive**: Why **DNS-based detection** is powerful reveals GuardDuty's design philosophy. Malware must almost always resolve domains to communicate with C2 servers, and many attacks use **DGA (Domain Generation Algorithm)** — generating thousands of pseudo-random domains daily to evade blocking (e.g., Conficker worm in 2008). GuardDuty analyzes domain name entropy and ML patterns in DNS queries to catch "non-human random strings," then cross-references known C2 domain feeds. It also detects **DNS tunneling** — encoding data in DNS queries/responses to exfiltrate past firewalls — via query length, frequency, and record type abuse (TXT misuse). That's why Finding types like `CryptoCurrency:EC2/BitcoinTool.B!DNS` carry the `!DNS` suffix—marking signal detection. Crossing network payload (VPC Flow) with DNS lets you suspect encrypted traffic by "where it heads."

The naming convention for representative Finding types is `Threat:ResourceType/ThreatFamily.Variant!Source`. For example, `Backdoor:EC2/C&CActivity.B!DNS` means "backdoor threat, EC2 target, C&C activity variant B, detected via DNS signal." Reading this structure lets you understand from a Finding alone what was caught and how.

## Finding Severity — How Scores Are Set and Why They Matter

GuardDuty assigns every Finding a Severity score 1.0–10.0, labeled in four bands.

- **1.0–3.9: Low** — Reconnaissance, lower risk (port scanning)
- **4.0–6.9: Medium** — Suspicious behavior
- **7.0–8.9: High** — High compromise likelihood
- **9.0–10.0: Critical** — Active compromise strongly suspected

This score becomes the auto-response trigger. "Severity 7+ triggers auto-isolation" is the standard pattern because that threshold is above "no time to wait for humans."

> ⚠️ **Pitfall**: Interpreting Severity only as "attack dangerousness" falls into a trap. GuardDuty's Severity reflects **threat severity × confidence (confidence)**. High scores go to "certainly compromised," not "huge attack but low confidence." Same `SSHBruteForce` scores higher if "successful plus subsequent anomalous activity observed." In DOP exams, "why is this Finding's severity lower than expected?" often answers "detection confidence still low." Also, using Severity ≥ 7 alone for auto-isolation includes all High up to 8.9, risking false-positive operational instance isolation—that's why typically a Finding type prefix filter (e.g., `UnauthorizedAccess:EC2/`) is layered on.

## Auto-Isolation Response Pattern — Automation Chain from Detection to Isolation

Detection alone isn't enough. DOP's essence is "act on detected threats without humans." The standard pattern is a GuardDuty → EventBridge → SSM Automation Runbook chain.

```
GuardDuty Finding (Severity >= 7, type prefix matching)
   │
   ▼ EventBridge Rule (event filtering + routing)
   │
   ▼ SSM Automation Runbook (ordered step execution)
   ├─ 1. Snapshot EBS         ← Forensic evidence preservation (first!)
   ├─ 2. Modify Instance SG → sg-quarantine  ← Network isolation
   ├─ 3. Detach/Replace IAM Role ← Credential nullification
   ├─ 4. Tag with incident ID  ← Tracking
   ├─ 5. Notify Slack/PagerDuty ← Alert operators
   └─ 6. Create Jira ticket     ← Post-response tracking
```

The EventBridge rule's event pattern decides which Findings go to auto-response.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{"numeric": [">=", 7]}],
    "type": [{"prefix": "UnauthorizedAccess:EC2/"}]
  }
}
```

> ⚠️ **Pitfall**: The **order** of auto-isolation steps appears in exams. Snapshot must be first—after isolating or terminating the instance, memory and disk state becomes corrupted or lost, making forensics impossible. Also, "isolation" means moving the instance to **a quarantine security group, not terminating it**. Terminate and you never know what the attacker did. A quarantine SG blocks "all outbound + inbound only from forensic jump box," cutting C2 communications while letting investigators access. "GuardDuty Critical found, immediately terminate instance" is almost always wrong—it's evidence destruction.

> 📚 **Case Study**: The 2019 Capital One breach involving ~100 million credit records started when an engineer lost misconfigurated WAF control to SSRF (Server-Side Request Forgery), leading to EC2 IAM role credential theft and S3 bucket exfiltration. Two key lessons: First, **anomalous API calls after credential theft** (different region, bulk S3 access) were detectable as GuardDuty findings like `UnauthorizedAccess:IAMUser/InstanceCredentialExfiltration`—had detection been on and auto-response wired, credential nullification would have limited damage. Second, **response speed after detection determines damage scope**—about 4 months elapsed between breach and external report. After this, the industry standard recommendation became "detection (GuardDuty) → auto credential nullification and isolation (EventBridge+SSM)."

## Multi-Account GuardDuty — Unified Application via Organizations

Running GuardDuty separately in each of hundreds of accounts and viewing Findings independently is operationally impossible. GuardDuty centralizes with Organizations integration.

The key is the **Delegated Administrator** account. Typically designating a Security OU's Audit account as delegated administrator lets that account control GuardDuty organization-wide. Turning on `auto-enable` means **existing member accounts and any newly created accounts automatically get GuardDuty activated** — preventing the accident of forgetting to enable on new accounts.

```bash
# Allow AWS Organizations service access
aws organizations enable-aws-service-access --service-principal guardduty.amazonaws.com

# Make Audit account the delegated admin
aws guardduty enable-organization-admin-account --admin-account-id AUDIT-ACCT

# Auto-enable all + new accounts, specify data sources
aws guardduty update-organization-configuration \
  --detector-id <id> --auto-enable-organization-members ALL \
  --features '[{"Name":"EBS_MALWARE_PROTECTION","AutoEnable":"NEW"},{"Name":"EKS_AUDIT_LOGS","AutoEnable":"ALL"}]'
```

> 💡 **Related Theory**: The delegated administrator pattern applies the security principle of **separation of concerns** and **least privilege** at organizational scope. Instead of concentrating all permissions in the management account, GuardDuty operations delegate to Audit account, logging to Log Archive account (AWS Landing Zone/Control Tower recommended structure). This is **blast radius reduction**—distributing permissions so one compromised account doesn't collapse everything. The management account handles billing and org structure only, staying out of daily security operations; if management account credentials leak, detection capabilities still run from separate accounts.

## Findings to ASFF — Security Hub Integration

GuardDuty Findings automatically convert to **ASFF (AWS Security Finding Format)**, a standard JSON schema sent to Security Hub. ASFF normalizes Findings from different sources (GuardDuty, Inspector, Macie) into one format. Security Hub deduplicates and prioritizes.

> 💡 **Related Theory**: ASFF addresses **normalization** of security data. Multiple tools emitting alarms in different formats prevent SIEM (Security Information and Event Management) unified analysis. Industry standards like STIX (MITRE/OASIS) and OCSF (2022, AWS/Splunk joint initiative) compete. ASFF is AWS's internal ecosystem common schema—implementing the **standard interface (adapter pattern)** idea where downstream (EventBridge filters, remediation Lambda) need not be rewritten per source. Standardized format is prerequisite for integrated security automation.

## Noise Control — Suppression, Trusted IP, Threat IP

Even accurate detection, if buried under false positives, causes operators to miss real Critical alerts (practical consequence of base rate fallacy). GuardDuty provides three noise control mechanisms.

- **Suppression Rule**: Automatically "preserve but don't alert" specific patterns. E.g., normal scans from Qualys don't fire every time.
- **Trusted IP List**: Known safe IPs don't generate Findings (e.g., company VPN egress IP).
- **Threat IP List**: Custom malicious IP list—actively detect communication with these.

> ⚠️ **Pitfall**: Suppression Rule and Trusted IP List differ in effect. **Trusted IP List** prevents Finding generation entirely for that IP, so if that IP later becomes compromised, GuardDuty stays silent—creating a blind spot risk. **Suppression Rule** still generates and preserves Findings but hides from console/alerts—data remains for post-incident review. So "briefly suppress false positive" is safer with Suppression; Trusted IP should apply only to truly controlled infrastructure IPs. For exams, "reduce false positive yet keep audit records" → Suppression Rule, not Trusted IP.

## GuardDuty Malware Protection — Agentless EBS Scanning

GuardDuty Malware Protection automatically (or on-demand) scans EBS volumes of EC2s with threat Findings for malware. The key: **scanning without touching the instance**—takes target EBS snapshot, mounts it in isolated GuardDuty service account environment to scan—no performance impact on production, and undetectable to attacker (no agent to disable). Separate billing; container runtime monitoring (EKS, ECS Fargate) also offered.

> 🎯 **Scenario**: "GuardDuty detected `CryptoCurrency:EC2/BitcoinTool.B!DNS`(Severity 8.5) on production EC2. Automate ①forensic evidence preservation ②network isolation ③malware check ④ops team alert without humans." → EventBridge rule filters `severity >= 7` AND `type prefix CryptoCurrency:EC2/` → calls SSM Automation Runbook: (1) create EBS snapshot, (2) trigger GuardDuty Malware Protection on-demand scan, (3) replace instance SG to sg-quarantine, (4) tag instance with incident-id, (5) SNS to Slack/PagerDuty, (6) Lambda create Jira ticket. **Don't terminate instance** (preserve evidence). Multi-account: Delegated admin account's EventBridge receives org-wide Findings, runs target account's SSM Runbook via cross-account role.

## Summary

Today's picture is four-fold. First, **threat detection is tension between signature-based and anomaly detection**; GuardDuty mixes threat intelligence (signatures) and ML behavioral analysis (anomalies), with Denning's statistical IDS model and base rate fallacy as underlying limits. Second, **GuardDuty is agentless, reading AWS's already-collected data plane logs** (CloudTrail, VPC Flow, DNS) directly, and Finding type naming conventions reveal what and how was caught. Third, **auto-isolation is GuardDuty → EventBridge → SSM Runbook chain**; step order (snapshot first, isolation not termination) and Severity/type filters are critical—the Capital One incident proved this automation's value. Fourth, **Organizations delegated admin + auto-enable controls multi-account uniformly**, Suppression/Trusted/Threat lists manage noise, and Findings flow as ASFF to Security Hub.

Next time we explore how those accumulated Findings are **unified, normalized, and auto-corrected through Security Hub**.

---

## 📝 Practice Questions

**Question 1.** What is the fundamental reason GuardDuty can operate "agentlessly"?

A) GuardDuty automatically deploys a lightweight agent to each EC2 instance

B) GuardDuty directly receives and analyzes replicated streams of the data-plane logs that AWS already collects (CloudTrail, VPC Flow, Route 53 DNS), so no separate collection infrastructure or agent is needed

C) GuardDuty intercepts network packets directly

D) Users manually upload all the logs

**Answer: B**

Explanation: The reality behind GuardDuty's "single on button" is not deploying new data-collection infrastructure but internally receiving and analyzing replicated streams of the data-plane logs AWS already records — CloudTrail (API calls), VPC Flow Logs (network flows), and Route 53 Resolver (DNS queries). That is why GuardDuty sees the flows even if the user has not separately enabled and stored VPC Flow Logs. As exceptions, EKS/ECS Runtime Monitoring and EBS Malware Protection additionally use a lightweight agent or snapshot scanning. Automatic agent deployment (A) or manual uploads (D) are not GuardDuty's model.

---

**Question 2.** What is the statistical phenomenon in which, in an environment where breaches are extremely rare (for example, 1 per million events), most alarms become false positives even if the detector is 99% accurate? What mechanisms does GuardDuty use to address it?

A) The CAP theorem — addressed with Severity scores

B) The base rate fallacy — addressed by reducing alarm fatigue with Severity scores, Suppression Rules, and Trusted IP Lists

C) Moore's law — addressed with faster hardware

D) The pigeonhole principle — addressed with Region distribution

**Answer: B**

Explanation: The base rate fallacy is a consequence of Bayesian inference: when the prior probability (base rate) of an event is extremely low, most positive determinations become false positives even if the detector's accuracy is high. It is the fundamental challenge of intrusion detection and has remained a core problem since Denning's statistical IDS model. GuardDuty prioritizes with the Severity score (threat severity × detection confidence) and filters known normal patterns with Suppression Rules and Trusted IP Lists to reduce alarm fatigue for operations teams. The key is "detection is easy; detecting without alarm fatigue is hard." CAP (A), Moore (C), and the pigeonhole principle (D) are unrelated.

---

**Question 3.** What is the MOST accurate reason that GuardDuty Severity scores differ from case to case even for the same attack type?

A) Severity is assigned randomly

B) Severity reflects not only the threat's seriousness but also the detection confidence, so confidence-raising factors such as "additional activity observed after success" raise the score

C) Severity is proportional to the instance type

D) Severity is determined by the age of the account

**Answer: B**

Explanation: GuardDuty Severity is not a simple "attack risk" but reflects threat seriousness × confidence together. Even for the same `SSHBruteForce`, if "additional activity after success (privilege escalation, data access) is observed," confidence in the compromise rises and the score jumps. Conversely, something that "looks like a huge attack but with low confidence" stays at a medium score. In DOP, the answer to "why is this Finding's severity lower than expected" is often "because the detection confidence is still low." Random (A), instance type (C), and account age (D) have no basis.

---

**Question 4.** When a GuardDuty Critical Finding (`Backdoor:EC2/C&CActivity.B!DNS`) is found, an SSM Automation Runbook responds automatically. Which is the most correct order of steps?

A) Terminate the instance immediately → snapshot → notify

B) EBS snapshot (forensic preservation) → swap in an isolation SG (network isolation, not termination) → neutralize the IAM role → tag → notify

C) Notify → wait for operator approval → manually terminate

D) Delete the IAM role → reboot the instance → snapshot

**Answer: B**

Explanation: The order of the automatic isolation steps matters. To preserve forensic evidence, the EBS snapshot must be taken first — once the instance is terminated or contaminated, the memory and disk state disappear and investigation becomes impossible. "Isolation" is not terminating the instance but cutting only the network with an isolation SG (blocking all outbound and allowing only inbound from a forensic jump box), which blocks C2 communication while keeping investigator access. Immediate termination (A) or reboot (D) destroys evidence, and waiting for manual approval (C) contradicts the automation goal of "immediate response without humans."

---

**Question 5.** In an organization with hundreds of accounts, how can you make GuardDuty automatically enabled not only for existing accounts but also for every new account created in the future, with Findings aggregated centrally?

A) Each account administrator manually turns on GuardDuty in the console

B) Operate all detection directly from the management account

C) Designate the Audit account as the GuardDuty Delegated Administrator and set auto-enable to ALL/NEW

D) Run a script that scans for new accounts daily with Lambda and turns on GuardDuty

**Answer: C**

Explanation: GuardDuty integrates with Organizations, and designating the Audit account as the delegated administrator gives central control of the whole organization. Setting auto-enable to ALL (existing) and NEW (new) automatically turns on GuardDuty for newly created accounts as well, eliminating at the source the accident of people forgetting to turn it on for each new account. The delegated administrator pattern applies the principles of separation of concerns and blast-radius reduction by separating security operations into the Audit account instead of concentrating privileges in the management account. Manual operation (A), direct operation from the management account (B), and custom scripts (D) are all anti-patterns with the risk of omissions and operational burden.

---

**Question 6.** You want to reduce false positives, but still keep records for post-incident investigation in case that IP/pattern is later actually compromised. What is the correct choice?

A) Add it to the Trusted IP List to prevent Finding generation altogether

B) Create a Suppression Rule so that Findings are still generated and retained but hidden only from the console/notifications

C) Turn off GuardDuty

D) Disable the entire Region

**Answer: B**

Explanation: A Trusted IP List prevents Finding generation for that IP altogether, so if the IP is compromised later it becomes a blind spot where GuardDuty is silent. A Suppression Rule, by contrast, still generates and retains the Finding and hides it only from the console/notifications, so the data remains for post-incident investigation. For the requirement "reduce false positives but preserve records for auditing," a Suppression Rule is right. Turning off GuardDuty (C) or disabling the Region (D) creates detection gaps.

---

**Question 7.** What is the key benefit of the design in which GuardDuty Findings are automatically converted to ASFF (AWS Security Finding Format) and sent to Security Hub?

A) The storage cost of Findings disappears

B) The outputs of different detection sources (GuardDuty, Inspector, Macie) are normalized into the same standard schema, so downstream pipelines (deduplication, prioritization, auto-remediation) do not have to be rebuilt for each source

C) Findings are remediated automatically

D) GuardDuty detects faster

**Answer: B**

Explanation: ASFF is the answer to the normalization problem of security data, unifying the differing output formats of multiple detectors into one standard schema. This is an implementation of the standard-interface (adapter pattern) idea, letting Security Hub perform deduplication and prioritization and removing the need to rewrite downstream components such as EventBridge filters and auto-remediation Lambda functions for each source — a prerequisite for integrated security automation. It is not directly related to storage cost (A), auto-remediation (C), or detection speed (D).

---

## 📌 Today's Summary

Today's key points are four-fold. First, threat detection is tension between signature-based and anomaly detection; GuardDuty mixes threat intelligence and ML behavioral analysis, with Denning's statistical IDS and base rate fallacy as underlying constraints. Second, GuardDuty is agentless, reading AWS's already-collected data plane logs (CloudTrail, VPC Flow, DNS) directly; Finding type naming conventions reveal what and how was caught. Third, auto-isolation is GuardDuty → EventBridge → SSM Runbook chain; step order (snapshot first, isolation not termination) and Severity/type filters are critical; Capital One incident proved this automation's value. Fourth, Organizations delegated admin + auto-enable controls multi-account uniformly, Suppression/Trusted/Threat lists manage noise, and Findings flow as ASFF to Security Hub.
