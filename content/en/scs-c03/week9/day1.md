# Day 1 - Amazon GuardDuty: Threat Detection Principles, Finding Types, Threat Intelligence, Multi-Account Delegated Administrator

Detection presumes prevention has been breached. No matter how much firewalls, IAM, and encryption block, credential theft, insiders, and zero-days get through. So the second pillar of security operations is "recognizing malicious activity already happening (or underway) with *evidence-based* detection." Amazon GuardDuty is the first entry point to this detection layer — **agentless**, it continuously analyzes telemetry across the account and outputs threats as findings.

GuardDuty's essence is not a service that "*collects* logs" but an "analysis engine that *reads logs and assigns meaning*." GuardDuty doesn't depend on turning on CloudTrail to see things — it *directly subscribes* to CloudTrail, VPC Flow, and DNS streams to analyze them. Users don't need to configure logs for storage and forwarding; the moment you enable it, data sources connect — this "enable and done" characteristic is frequent on exams.

## What It Analyzes: Three Core Data Sources

Three *foundational* sources that GuardDuty always consumes at no extra cost or configuration:

```
CloudTrail Management Events  → API call behavior (who did what)
CloudTrail S3 Data Events (optional) → S3 object-level access
VPC Flow Logs                 → Network flows (connected where)
DNS Query Logs                → Domain resolution (looked up what)
```

Important nuance: GuardDuty **does not replicate** these logs. Even if you haven't enabled VPC Flow Logs on your account, GuardDuty receives flow data internally and analyzes it (stores nothing separately). DNS analysis is only possible when using the **VPC default DNS resolver (Route 53 Resolver)** — with custom DNS or external resolvers, GuardDuty's DNS-based findings (e.g., DNS exfiltration) become blind spots.

> 💡 **Related Theory**: This exemplifies *behavioral detection*. Rather than relying solely on signature matching (known malicious IPs and hashes), it catches *anomalies* against baseline using statistics and ML. GuardDuty learns per-account "normal" profiles (APIs usually called, regions and ports usually communicating with) and scores activities differing from normal as threats. This corresponds to NIST CSF's "Detect" function, specifically "Anomalies and Events (DE.AE)."

## Protection Plans: Extended Detection on Foundational Layers

Beyond foundational sources, *Protection Plans* activate additional data sources. Each incurs separate charges and generates separate finding types:

- **S3 Protection**: Analyze CloudTrail S3 data events → suspicious S3 access patterns
- **EKS Protection**: Analyze EKS audit logs → Kubernetes API-level threats
- **Runtime Monitoring**: Lightweight agent (EKS/ECS/EC2) for **inside-host** behavior visibility (processes, files, network) → container and instance runtime threats
- **Malware Protection (EBS)**: Snapshot suspected EC2's EBS volumes and scan for malware (no agent needed)
- **Malware Protection for S3**: Scan uploaded objects
- **RDS Protection**: Analyze Aurora login activity → DB credential attacks
- **Lambda Protection**: Analyze Lambda network activity

> ⚠️ **Trap**: The scenario "GuardDuty enabled but cannot see inside-host compromise (malicious process)" typically answers with **Runtime Monitoring activation**. Foundational GuardDuty only sees network and API perspectives. Also, "EC2 suspected of malware → scan it" → **Malware Protection (EBS)**.

## Anatomy of Findings

Findings are GuardDuty detection outputs. Finding types follow a consistent naming scheme:

```
ThreatPurpose:ResourceTypeAffected/ThreatFamilyName.DetectionMechanism!Artifact

Examples: UnauthorizedAccess:EC2/SSHBruteForce
          Backdoor:EC2/C&CActivity.B!DNS
          CryptoCurrency:EC2/BitcoinTool.B!DNS
          Recon:IAMUser/UserPermissions
          Exfiltration:S3/AnomalousBehavior
          Trojan:EC2/DNSDataExfiltration
          PenTest:IAMUser/KaliLinux
          Policy:S3/BucketBlockPublicAccessDisabled
```

- **ThreatPurpose** (threat intent): Backdoor, Behavior, CryptoCurrency, Exfiltration, Impact, PenTest, Persistence, Policy, PrivilegeEscalation, Recon, Stealth, Trojan, UnauthorizedAccess, etc. — represents attack *phase or intent*.
- **ResourceTypeAffected**: EC2, IAMUser, S3, EKSCluster, RDS, Lambda, etc.
- **DetectionMechanism**: Like `.B!DNS` showing how it was detected (DNS-based, etc.).

Each finding has a **severity** score 0.1–8.0+: Low (1.0–3.9), Medium (4.0–6.9), High (7.0–8.9). On exams, *what each finding means as a threat* matters more than the score itself.

> 💡 **Related Theory**: ThreatPurpose classification is essentially **MITRE ATT&CK** tactics mapping — Recon (reconnaissance), PrivilegeEscalation (privilege escalation), Persistence (persistence), Exfiltration (exfiltration), Impact (impact) etc. align with ATT&CK kill chain phases. Reading findings from an ATT&CK lens lets you gauge "how far has the attack progressed" to prioritize response.

## Threat Intelligence: Known Malicious + Custom

GuardDuty embeds threat intelligence feeds curated by AWS and third parties (CrowdStrike, Proofpoint, etc.). Communication with known malicious IPs and domains immediately becomes findings.

Additionally, users can register two custom lists:
- **Trusted IP list**: Activities from these IPs do not generate findings (whitelist). Corporate offices, VPN IPs, etc.
- **Threat IP list**: Communication with these IPs generates findings (custom blacklist). Integrate your own threat intelligence.

```
GuardDuty Threat Assessment
  ├─ AWS Curated Intelligence (automatic)
  ├─ Trusted IP list  → Suppress findings on match
  └─ Threat IP list   → Generate findings on match
```

> ⚠️ **Trap**: Trusted/Threat IP lists are managed at **delegated administrator (or individual account)** level; member accounts cannot add their own lists (admin manages centrally in org mode). Also, GuardDuty is *not* a prevention tool — adding an IP to Trusted doesn't *allow* its access, just *stops generating findings*. Access control is SG/NACL/WAF's job.

## Multi-Account: Delegated Administrator

Enterprises use dozens to hundreds of accounts. Enabling GuardDuty per account and viewing separately is impractical. **AWS Organizations + Delegated Administrator** is the answer:

```
Management Account ──designate──▶ Delegated Administrator Account (usually Security Tooling)
                                       │
                                       ├─ Enable GuardDuty org-wide
                                       ├─ Set "Auto-enable for new accounts"
                                       └─ Centralize and manage all member findings
```

- Management account designates one account (recommended: separate *Security Tooling* account) as **GuardDuty Delegated Administrator**.
- Delegated administrator enables GuardDuty across all org accounts and uses **auto-enable** to include new accounts automatically.
- Member account findings are *aggregated* in delegated administrator console for single-pane viewing.

> 💡 **Related Theory**: This is AWS's *multi-account security baseline* best practice. Security tools (GuardDuty, Security Hub, Detective, Macie, etc.) are delegated to a dedicated *Security Tooling* account separate from workload accounts, preventing workload account admins from disabling detection or hiding findings (permission separation). The delegated administrator pattern gives organization-wide visibility without burdening the management account (concentrated root privileges).

> ⚠️ **Trap**: Member accounts *cannot* disable GuardDuty on their own account (delegated administrator enforces org mode). "New account escapes detection" → **enable auto-enable**. Also, designating a delegated administrator is **only** the management account's privilege.

## After Findings: Automation Integration

Findings cannot end at viewing. GuardDuty publishes findings to **Amazon EventBridge** (near-real-time). Trigger downstream:

```
GuardDuty Finding ──▶ EventBridge Rule ──▶ Lambda (isolate/snapshot/tag)
                                        ├─▶ SNS (alert)
                                        ├─▶ Step Functions (response workflow)
                                        └─▶ Security Hub (aggregation, auto-integrate)
```

Example: `UnauthorizedAccess:EC2/SSHBruteForce` finding → EventBridge → Lambda moves EC2 to isolation SG + forensic snapshot + ticket creation. New findings emit to EventBridge instantly; subsequent occurrences of existing findings aggregate and publish at default 6-hour intervals (configurable 15 min–).

> 🔍 **Deeper Dive**: GuardDuty findings' value completes with *correlation* and *response*. A single finding may be noise, but when investigated with Detective (Day 2), correlated with other detections in Security Hub (Day 4), and automated response triggered via EventBridge, it delivers operations value. Viewing GuardDuty as just an "alert generator" is using half its value — design it as the entry to detection → investigation → response pipeline.

## Frequently Confused Distinctions

- **GuardDuty vs CloudTrail**: CloudTrail *records logs*, GuardDuty *analyzes logs and judges threats*. CloudTrail is source; GuardDuty interprets.
- **GuardDuty vs Inspector**: GuardDuty is *runtime threats* (live malicious activity happening now), Inspector is *vulnerabilities* (exploitable weaknesses). Detection timing differs (Day 3).
- **GuardDuty vs Macie**: Macie is *sensitive data (PII) classification* in S3, GuardDuty is threat behavior. Purposes differ.
- **GuardDuty vs WAF/SG**: GuardDuty *detects* (detect), does not *prevent* (block). Prevention is other controls' and automation's job.

## One-Line Summary Checklist

- [ ] GuardDuty enabled on organization delegated administrator (Security Tooling account) with auto-enable
- [ ] Using VPC default Route 53 Resolver for DNS-based detection
- [ ] Runtime Monitoring enabled for inside-host threats, Malware Protection for malware
- [ ] Findings connected to EventBridge for alerts and auto-remediation
- [ ] Trusted/Threat IP lists managed aligned with threat intelligence

---

## 📝 Practice Questions

**Question 1.** The security team wants to operate GuardDuty in a 50-account organization. How can newly created accounts be automatically included in detection, and workload account administrators be prevented from turning GuardDuty off?

A) Turn on GuardDuty only in the management account and manually invite other accounts  
B) Designate a separate Security Tooling account as the GuardDuty delegated administrator and turn on auto-enable in organization mode  
C) Email each account administrator and ask them to turn on GuardDuty  
D) Turning on only an organization trail for CloudTrail automatically enables GuardDuty  

**Answer: B**  
Explanation: The answer for a multi-account baseline is to designate a dedicated Security Tooling account as the delegated administrator and use organization mode + auto-enable so that even new accounts are automatically included. In organization mode, the delegated administrator centrally manages GuardDuty for member accounts, so workload administrators cannot turn it off arbitrarily. Manual invitations and email requests create omissions and blind spots, and enabling CloudTrail does not automatically enable GuardDuty.

---

**Question 2.** You want to use GuardDuty to detect malicious processes and file changes running inside an EC2 instance. Basic GuardDuty alone did not show them. What should you do?

A) Store VPC Flow Logs separately in S3  
B) Enable GuardDuty Runtime Monitoring  
C) Turn on CloudTrail data events  
D) Enable Inspector  

**Answer: B**  
Explanation: Basic GuardDuty analyzes only the network flow, DNS, and API perspectives, so it cannot see process and file behavior *inside* the host. Host runtime visibility is provided by Runtime Monitoring, which deploys a lightweight agent. Storing Flow Logs is unrelated to how GuardDuty works, CloudTrail data events are an API/S3 perspective, and Inspector is a vulnerability scanning tool, not a runtime threat tool.

---

**Question 3.** GuardDuty generates no DNS-based data exfiltration (DNS exfiltration) findings at all. Investigation shows that the VPC uses a custom external DNS resolver. What is the cause?

A) GuardDuty does not analyze DNS  
B) DNS-based detection works only when the default VPC Route 53 Resolver is used, so using an external resolver creates a blind spot  
C) DNS exfiltration findings exist only in the paid plan  
D) All IPs are registered in the Trusted IP list  

**Answer: B**  
Explanation: GuardDuty's DNS query analysis applies only to queries that pass through the VPC default DNS (Route 53 Resolver). If you use a custom/external DNS resolver, GuardDuty cannot see the DNS queries, so DNS-based findings are missing. GuardDuty analyzes DNS as a foundational source, so A is wrong; DNS exfiltration is a foundational finding; and the abnormal configuration of putting every IP in the trusted list is unrelated to the scenario.

---

**Question 4.** A `CryptoCurrency:EC2/BitcoinTool.B!DNS` finding was generated. What does this finding tell you, and what is the most appropriate first response?

A) The EC2 instance shows Bitcoin mining/communication activity, so trigger automation to isolate the instance and snapshot it via EventBridge  
B) It is merely an informational finding, so ignore it  
C) It means an S3 bucket was made public  
D) It means an IAM user's permissions are excessive  

**Answer: A**  
Explanation: By the finding naming convention, the ThreatPurpose is CryptoCurrency, the target is EC2, and it is DNS-based detection (`.B!DNS`), so it means the instance is communicating with cryptocurrency mining or related domains - often a strong sign of compromise. The appropriate response is to receive the finding through EventBridge and automate instance isolation, forensic snapshot, and ticketing. Ignoring it is dangerous, and S3 exposure or excessive IAM permissions are other finding types (Policy:S3, Recon:IAMUser, etc.).

---

**Question 5.** Which statement about GuardDuty's Trusted IP list is correct?

A) It allows access from the registered IPs at the network level  
B) It suppresses GuardDuty from generating findings for the registered IPs' activity, but it is not a control that permits access itself  
C) It unconditionally blocks communication with the registered IPs  
D) Each member account can freely add to it  

**Answer: B**  
Explanation: The Trusted IP list is only a detection-side setting that suppresses finding generation for that IP's activity; it is not a network preventive control such as allowing or blocking access. Access control is the role of SG/NACL/WAF. Blocking communication is also a different concept from the Threat IP list's finding generation, and in organization mode this list is centrally managed by the delegated administrator, so members cannot add to it arbitrarily.

---

