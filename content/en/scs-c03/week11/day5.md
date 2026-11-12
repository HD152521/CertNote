# Day 5 - Week 11 Comprehensive Review: Integrated Governance Scenarios

This week broadened perspective from *single-account security* to *organization-scale governance*. We defined permission ceilings with SCP (Day 1), automatically established secure baselines with Control Tower (Day 2), proved compliance with Audit Manager (Day 3), and made operations a closed loop with Firewall Manager, tags, cost, and automation (Day 4). The final day reviews how these pieces mesh as *one governance system* through integrated scenarios.

## Four-Layer Governance Mental Model

Organizational security governance operates as four overlapping planes. Exam questions almost always mask "which tool from which plane is the answer?"

```
① Permission Boundary Plane (ceiling of what can be done)
     SCP / RCP — not granting permission but maximum boundary
② Baseline Plane (accounts born secure)
     Control Tower — landing zone, controls (preventive/detective/proactive), account factory
③ Proof Plane (prove compliance via evidence)
     Audit Manager ← Config / CloudTrail / Security Hub (evidence sources)
④ Operations Plane (daily enforcement, remediation, response)
     Firewall Manager / tag/cost governance / EventBridge auto-remediation
```

Beneath this sits the **central security account model** (Management Account=billing/organization, Audit=detection/evidence/response, Log Archive=immutable logs) as common foundation. All security services operate as *delegated administrators* from Audit account.

> 💡 **Related Theory**: These four layers follow security control's time axis — *preventive (SCP/preventive controls)* → *secure defaults (baseline)* → *continuous detect/evaluate (Config·proof)* → *respond/remediate (operations)*. This maps NIST CSF's Identify·Protect·Detect·Respond functions to organizational scale. If one layer is breached, the next one catches — *defense in depth*.

## Tool Selection Decision Tree (Avoid Confusion)

Most frequently confused matchings in exams:

| Requirement Keyword | Answer Tool |
|---|---|
| "*maximum* permission boundary," "*block* region/root/service" | **SCP** |
| "Organization *resources* prevent external access (ceiling)" | **RCP** |
| "Multi-account *baseline quickly and consistently* maintain" | **Control Tower** |
| "*Before* resource creation block non-compliance (IaC gate)" | **Proactive Control (CFN Hooks)** |
| "Already-created resources *evaluate* follow rule" | **Config (Detective Control)** |
| "Auditor submission *evidence auto-collect and report*" | **Audit Manager** |
| "Security *findings aggregate and score* dashboard" | **Security Hub** |
| "Multiple accounts WAF/SG/NFW *consistently deploy, auto-protect*" | **Firewall Manager** |
| "Who did what when *activity log*" | **CloudTrail** |
| "Abnormal *spending spike* (breach signal)" | **Cost Anomaly Detection / Budgets** |

## Integrated Scenario 1: Building Regulated Multi-Account Environment

Requirement: New fintech starting with 30 accounts, ap-northeast-2 only, PCI audit readiness, consistent WAF across all accounts, security tools auto-activate.

Design:
1. **Control Tower** to configure landing zone → Audit/Log Archive accounts, organization CloudTrail/Config automatic.
2. **SCP**: Region lock (global services + us-east-1 exception), root block, security service disable prevention.
3. **Account Factory (AFT)**: Issue accounts with standard OU placement, tags, network baseline.
4. **Delegated Administrators (Audit account)**: Run GuardDuty, Security Hub, Config, Audit Manager, Firewall Manager.
5. **Firewall Manager**: Deploy common WAF managed rules to all account ALBs/API GWs automatically.
6. **Audit Manager**: PCI-DSS framework assessment → auto-collect Config/CloudTrail/Security Hub evidence, supplement manual evidence.
7. **EventBridge+Lambda/SSM**: Auto-remediate findings loop.

## Integrated Scenario 2: Prevent "Turn Off Detection and Do Bad Things"

Requirement: Account administrators cannot disable CloudTrail, GuardDuty, Config, or erase logs.

Design:
- **SCP**: Deny `cloudtrail:StopLogging/DeleteTrail`, `guardduty:DeleteDetector`, `config:StopConfigurationRecorder`, `securityhub:DisableSecurityHub`, etc., but exception via `Condition` for security maintenance role.
- **Organization CloudTrail**: Activated from Management Account → member account admins get read-only, cannot disable or view.
- **Log Archive**: S3 Object Lock + MFA Delete + dedicated KMS blocks log immutability.
- **Control Tower Mandatory Controls**: Log integrity, Config disable prevention are un-disableable.

This combination blocks defense evasion attack with multiple layers.

## Integrated Scenario 3: Cost Spike as Breach Signal

Requirement: Defend against stolen keys mass-creating GPU instances for cryptomining.

Design:
- **SCP**: Block large GPU instance types and unauthorized regions (limit blast radius).
- **Cost Anomaly Detection / Budgets**: Alert immediately on spend spike.
- **GuardDuty**: Detect cryptomining-related findings.
- **EventBridge auto-response**: Suspect key disable + instance isolation + alert.

Cost, detection, and permission boundary cross-fire one threat — *defense in depth* example.

## Trap Consolidation

- **SCP does not grant permissions** — only IAM Allow + SCP intersection minus Deny = effective.
- **SCP does not apply to Management Account members** → No workloads in Management Account.
- **Region lock SCP** missing global services+us-east-1 exception breaks console, CloudFront, ACM.
- **Controls apply to OUs** → New account inheritance; individual application causes omission.
- **Preventive=SCP, Detective=Config, Proactive=CFN Hooks** — block timing differs.
- **Control Tower managed resources manual change = drift** → Re-apply required.
- **Audit Manager does not generate evidence** — Config/CloudTrail/Security Hub must pre-activate.
- **Firewall Manager requires Config** + operate from delegated admin.
- Security services run from **delegated admin (Audit account)**, Management Account only for billing/org.

## Connection to Other Weeks

- Week 4 (WAF·Shield·Network Firewall) *single policies* expanded this week to Firewall Manager *organization-wide*.
- Logging and detection (CloudTrail, GuardDuty, Config, Security Hub) unified this week under *delegated admin and proof plane*.
- IAM and permission boundaries this week expand to SCP/RCP *organization-scale ceilings*.

Governance is not one service but four planes (permission boundary, baseline, proof, operations) stacked over a central security account, operated via delegated admins, running detection→auto-remediate closed loops. Exams relentlessly ask "which plane, which tool?"

## 📝 Practice Questions

**Question 1.** A new fintech wants to quickly stand up a PCI-scoped multi-account environment and automatically have a secure baseline (log account, organization CloudTrail/Config, standard OUs). What is the most appropriate starting point?

A) Manually configure Organizations, CloudTrail, and Config one by one  
B) Set up a landing zone with AWS Control Tower to automatically lay down the Audit and Log Archive accounts, organization CloudTrail/Config, and the control baseline  
C) Gather all workloads in a single account  
D) Turn on only GuardDuty  

**Answer: B**  
Explanation: The starting point for quickly and consistently laying down a standard multi-account security baseline is the Control Tower landing zone. The Audit and Log Archive accounts, organization CloudTrail/Config, and controls are configured automatically. Manual configuration is slow and carries a high risk of omissions, consolidating into a single account goes against the isolation and blast radius principles, and GuardDuty alone is only one piece of detection, not the whole baseline.

---

**Question 2.** We want to "prevent account administrators from stopping CloudTrail logging or deleting the GuardDuty detector." What is the most direct control?

A) Grant administrators more permissions with IAM policies  
B) Use an SCP to Deny cloudtrail:StopLogging, guardduty:DeleteDetector, and so on, with an exception through Condition only for the security maintenance role  
C) Raise the Security Hub score  
D) Create an Audit Manager report  

**Answer: B**  
Explanation: The direct control that prevents disabling security services and deleting logs is an explicit Deny in an SCP. Exempting only a specific security role through Condition for maintenance automation secures both operability and enforcement. Granting more permissions through IAM goes in the opposite direction, and Security Hub scores and Audit Manager reports are only detection and attestation tools that do not block actions.

---

**Question 3.** Which of the following requirement-tool matches is NOT correct?

A) "Consistently deploy WAF to ALBs across multiple accounts and automatically protect new ones" -> Firewall Manager  
B) "Automatically collect and report evidence for auditors by framework" -> Audit Manager  
C) "Continuously evaluate whether resources comply with rules" -> AWS Config  
D) "Define maximum permission boundaries and block Regions" -> Security Hub  

**Answer: D**  
Explanation: Defining maximum permission boundaries and blocking Regions is the role of SCPs (Organizations), not Security Hub. Security Hub is a tool for aggregating security findings and scoring. The other matches are accurate: organization-wide firewall deployment is Firewall Manager, evidence collection and reporting is Audit Manager, and configuration evaluation is Config. So the incorrect match is the one that attributes permission boundaries to Security Hub.

---

**Question 4.** In an organization operated with Control Tower, an operator directly modified an SCP in the console. Afterward, applying new controls is blocked. What happened and how should it be handled?

A) It is normal; leave it as is  
B) Drift occurred — re-apply the landing zone to restore the declared state, and keep the discipline of not modifying Control Tower managed resources directly in the console  
C) Permanently disable all controls  
D) Delete the organization and recreate it  

**Answer: B**  
Explanation: Directly modifying an SCP managed by Control Tower in the console causes drift, where the declared state and actual state diverge, blocking subsequent operations. The correct response is to restore the declared state by re-applying the landing zone and to establish the operating discipline of not manually touching managed resources. Leaving it, disabling everything, and recreating the organization are all excessive or dangerous.

---

**Question 5.** GPU instance costs in one account surged to tens of times the usual level. If multiple layers must work together, what is the most appropriate defense-in-depth combination?

A) Respond by adding more instances  
B) Block creation of large GPU types with an SCP (damage limit) + early detection with Cost Anomaly Detection/Budgets + mining detection with GuardDuty + automatic response with EventBridge to disable keys and isolate  
C) Ignore it since cost is unrelated to security  
D) Issue a new root key and keep using it  

**Answer: B**  
Explanation: A cost surge, especially a surge in GPU instances, can be a sign of a mining compromise with stolen credentials. Setting a damage limit with an SCP, detecting early with Cost Anomaly Detection and Budgets, detecting mining with GuardDuty, and tying in key deactivation and isolation through EventBridge automatic response is defense in depth that spans permission boundaries, cost, detection, and response. Scaling up, ignoring, and reusing the root key either raise the risk or leave the compromise unaddressed.

---
