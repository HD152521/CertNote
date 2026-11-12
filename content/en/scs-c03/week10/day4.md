# Day 4 - Incident Response Framework: NIST Phases, Runbooks, Automation vs Human Judgment Boundary

So far (Day 1~3) we've covered *specific techniques*: auto response pipelines, compromised instance isolation, credential revocation. Today we examine the *framework* that ties them together. No matter how sophisticated the tools, without a system for *when, what, and who decides*, incident response descends into chaos. The essence of IR (Incident Response) is *structure that enables consistent decision-making amid pressure and uncertainty*. The exam tests NIST IR phase definitions, AWS services' roles in each phase, and the critical *boundary between what to automate and what to leave to human judgment*.

AWS adopts NIST SP 800-61's IR lifecycle in its *AWS Security Incident Response Guide*, adapted for the cloud. Knowing this precisely is the foundation of this exam domain.

## NIST IR Lifecycle: 4 Phases

```
[1. Preparation] ──► [2. Detection &      ──► [3. Containment,      ──► [4. Post-Incident
   Preparation        Analysis              Eradication,             Activity
                                            Recovery
        ▲                                                              │
        └──────────────── Lessons fed back to Preparation ──────────────┘
```

The lifecycle is *cyclical*. Post-incident lessons strengthen preparation.

### 1. Preparation (Preparation)
Build response capability *before* incidents happen. Cloud preparation:
- **Logging & visibility foundation**: CloudTrail (all accounts/regions), VPC Flow Logs, GuardDuty/Security Hub/Config enabled. *After incident is too late* — no logs means no analysis.
- **Isolation and forensics infrastructure**: Isolation security groups/subnets, forensics account/AMI, evidence buckets with Object Lock pre-staged.
- **Permissions and access**: Break-glass role for IR personnel, automation execution role (least privilege).
- **Runbooks and contacts**: Scenario-specific runbooks, escalation paths, delegation defined.
- **Drills**: game day and tabletop exercises.

### 2. Detection & Analysis
Identify signals as incidents and assess scope/severity:
- GuardDuty (threats), Security Hub (aggregation, normalized ASFF), Config (config drift), Macie (data sensitivity), CloudTrail/Athena (investigation).
- Triage findings: true/false positive, severity, impact scope, incident classification.

### 3. Containment, Eradication, Recovery
- **Containment**: Block damage spread. Instance isolation (Day 2), credential revocation (Day 3), security groups/NACL/SCP. Distinguish short-term (immediate) vs long-term (temporary recovery) containment.
- **Eradication**: Remove threat. Malware/backdoor removal, patch vulnerabilities, dispose compromised resources.
- **Recovery**: Restore normal operations. Redeploy from patched golden AMI, restore from backup, strengthen monitoring while staged service recovery.

### 4. Post-Incident Activity
- Root cause analysis, timeline reconstruction (CloudTrail), lessons learned meeting, runbook/control improvements, metric updates (MTTD/MTTR).

> 💡 **Related theory**: NIST separates *eradication* from *recovery* for deep reasons. If you recover without fully eradicating (e.g., restart instance with backdoor still present), re-compromise happens immediately. If you attempt eradication before containment, the attacker notices detection and destroys evidence or hides deeper. The sequence (containment → eradication → recovery) is game-theoretic design to *minimize attacker behavioral options*. SANS' 6-phase model (Preparation, Identification, Containment, Eradication, Recovery, Lessons Learned) is essentially identical logic.

## Runbooks and Playbooks

- **Runbook**: Step-by-step procedure for a *specific task* (e.g., "EC2 isolation runbook" — snapshot, replace isolation SG, tag). Good for automation (SSM Automation Document).
- **Playbook**: Decision flow for an *entire scenario* (e.g., "ransomware response playbook" — under what conditions do you invoke which runbook and who approves?).

Attributes of a good runbook:
- **Deterministic**: Same input → same procedure. Reduces judgment burden under pressure.
- **Idempotent**: Safe to re-execute.
- **Auditable**: Every step logged.
- **Tested**: Validated via game day.

```yaml
# Incident severity-based playbook skeleton (decision flow)
Incident detected (GuardDuty/Security Hub)
  ├─ Severity LOW   → Auto ticket creation, review during business hours (human)
  ├─ Severity MED   → Auto alert + impact analysis (human) → runbook execute if needed (manual)
  └─ Severity HIGH  → Auto containment runbook execute immediately (auto)
                      + simultaneous IR team page (human)
                      + high-impact actions (prod termination, etc.) require aws:approve gate (human approval)
```

## Automation vs Human Judgment Boundary (Core)

The essence of this section: *what goes to machines, what stays with humans?* Wrong boundaries fail in both directions: too much automation destroys normal services with false positives; too much manual slows response until damage is severe.

| Dimension | Suited for Automation | Requires Human Judgment |
|-----------|---------------------|-------------------------|
| Clarity | Obvious threats (public RDP brute force success) | Ambiguous signals (unusual API pattern) |
| Reversibility | Reversible actions (disable key, isolation SG) | Irreversible, high-impact (terminate prod, delete data) |
| Impact scope | Single resource, low impact | Broad scope, critical services |
| Speed requirement | Seconds decisive (credential revocation) | Analysis and context more important |
| Frequency | Repetitive, high volume | Rare, novel situations |

**Graduated automation**: As confidence grows, move human → automated.
1. Initially *alert only* (human-in-the-loop) — validate automation logic.
2. As confidence builds, *automate reversible, low-impact actions* (disable key, isolation).
3. High-impact actions get *approval gate* (SSM `aws:approve`) — execute auto but require human approval.

```yaml
# Insertion of human approval gate in SSM Automation
mainSteps:
  - name: snapshotAndIsolate     # Auto: reversible containment
    action: aws:executeAutomation
    inputs: { DocumentName: IsolateInstance }
  - name: approveTermination     # Human: approval before irreversible action
    action: aws:approve
    inputs:
      Approvers: ["arn:aws:iam::111122223333:role/IR-Lead"]
      Message: "Approve termination of production instance i-xxx"
  - name: terminate              # Auto: execute after approval
    action: aws:executeAwsApi
    inputs: { Service: ec2, Api: TerminateInstances }
```

> 💡 **Related theory**: This is the *automation paradox* from high-risk industries (aviation, nuclear). As automation increases, humans lose *situational awareness*, so when automation fails in rare moments, people lack ability to intervene. The remedy: *keep automation transparent to humans* (SNS alerts, dashboards), and *keep humans in the loop for high-impact, irreversible decisions*. The goal isn't full automation but *directing human judgment to most valuable decisions*. Zero human involvement is not the target.

## AWS Services IR Phase Mapping

| NIST Phase | Key AWS Services |
|-----------|------------------|
| Preparation | CloudTrail, Config, GuardDuty (enabled), Organizations/SCP, IAM (break-glass), forensics account |
| Detection & Analysis | GuardDuty, Security Hub, Config, Macie, Detective, CloudTrail/Athena, CloudWatch |
| Containment | SSM Automation, EC2 (SG/isolation), IAM (session revocation), NACL, SCP, WAF |
| Eradication | Systems Manager (patching), SSM Automation, EC2 (redeployment), Lambda |
| Recovery | Golden AMI, Backup restore, CloudFormation/IaC redeployment, CloudWatch monitoring |
| Post-Incident | CloudTrail/Athena (timeline), Detective (investigation), Security Hub (insights), runbook updates |

**Amazon Detective** especially helps the *analysis and post-incident* phases by showing *context and relationships* from GuardDuty findings — which entities communicated with what, behavioral baseline deviation — aiding root cause analysis via graph visualization.

> 🔍 **Deep dive**: IR maturity is measured and improved via *metrics*: MTTD (mean time to detect), MTTR (mean time to respond), dwell time (attacker residence duration). Auto response (Day 1) dramatically cuts MTTR; detection controls (GuardDuty/Security Hub) reduce MTTD. Post-incident, track these metrics to find *where the bottleneck is* and invest in automation/controls there. IR also has *legal and regulatory dimensions* — evidence integrity (chain of custody, Day 2), breach notification obligations (GDPR 72 hours, etc.), regulatory reporting. So IR planning includes security, legal, PR, and executive roles with contacts and delegation. Technical containment and organizational response are inseparable.

## One-line summary checklist

- [ ] Understand NIST 4 phases (Preparation → Detection & Analysis → Containment, Eradication, Recovery → Post-Incident) and cyclical structure
- [ ] Built logging, isolation infrastructure, runbooks, break-glass role *before* incidents (Preparation)
- [ ] Know containment → eradication → recovery logic (re-compromise prevention, evidence protection)
- [ ] Distinguish runbooks (procedures) from playbooks (scenario decision flows)
- [ ] Judge automation/human boundary via clarity, reversibility, impact scope, speed
- [ ] Apply graduated automation: reversible/low-impact auto, high-impact with approval gate (aws:approve)
- [ ] Map each IR phase to AWS services
- [ ] In post-incident: measure MTTD/MTTR, improve, reflect legal/regulatory obligations

---

## 📝 Practice Questions

**Question 1.** Why is it most appropriate to perform Eradication before Recovery in the NIST IR lifecycle?

A) Recovery is more expensive, so it should be postponed  
B) Because restoring normal operations without fully removing the threat (backdoors, malware) causes immediate re-compromise  
C) Because AWS only allows that order  
D) Because eradication cannot be automated  

**Answer: B**  
Explanation: Recovering while skipping eradication leads to immediate re-compromise through the remaining backdoors and malware. That is why the order is mandatory: contain to stop the spread, eradicate to fully remove the threat, and then recover to restore normal operations. Cost, AWS enforcement, and whether it can be automated are not grounds for the order.

---

**Question 2.** Which set of criteria is most appropriate for deciding which response actions to fully automate and which to put behind a human approval gate?

A) The length and alphabetical order of the action name  
B) Threat clarity, action reversibility, scope of impact, and speed requirement — automate if clear, reversible, low-impact, and high-speed; require human approval if ambiguous, irreversible, or high-impact  
C) Automating everything unconditionally is always best  
D) Making everything manual unconditionally is always best  

**Answer: B**  
Explanation: The automation/human boundary is decided by clarity, reversibility, scope of impact, and speed requirement. Automate when the action is clear, reversible, low-impact, and speed is decisive; put human approval on actions that are ambiguous, irreversible, or high-impact. Excessive automation destroys services through false positives, and fully manual response delays the response.

---

**Question 3.** We want automated containment to run immediately, but require approval from the IR lead before irreversible actions such as terminating a production instance. What is the appropriate mechanism in SSM Automation?

A) Invoke Lambda twice  
B) Insert an aws:approve step in the middle of the runbook so that the termination step proceeds only after the designated approver approves  
C) Add a security group rule  
D) A CloudTrail alarm  

**Answer: B**  
Explanation: The aws:approve action in SSM Automation inserts a human approval gate in the middle of the runbook flow, so the next (high-impact) step proceeds only when the designated approver approves. This is the standard mechanism in graduated automation for combining automated containment with human approval of irreversible actions. The others do not provide an approval gate.

---

**Question 4.** What is most appropriate to have in place in a cloud environment during the Preparation phase of the NIST IR lifecycle?

A) Turn on CloudTrail after an incident occurs  
B) Build in advance, before incidents, the logging and detection foundation such as CloudTrail, VPC Flow Logs, and GuardDuty, the isolation security group, forensic account, and evidence bucket, and the runbooks and break-glass role  
C) Do nothing in the Preparation phase  
D) Terminate all instances in advance  

**Answer: B**  
Explanation: Preparation is the phase of building response capability before an incident. Without logs, post-incident analysis is impossible, so you must have CloudTrail, Flow Logs, GuardDuty, the isolation and forensic infrastructure, runbooks, and a break-glass role in advance. Enabling logging after the incident, or doing nothing or terminating indiscriminately, is inappropriate.

---

**Question 5.** In the Post-Incident phase, which key metrics and activities are most appropriate to track to improve the IR program?

A) Look only at the cost per instance hour  
B) Measure MTTD, MTTR, and dwell time, analyze the timeline and root cause with CloudTrail/Detective, feed lessons back into runbooks and controls, and fulfill regulatory reporting obligations  
C) Forget the incident and move on to the next task  
D) Delete all logs immediately  

**Answer: B**  
Explanation: The post-incident phase finds bottlenecks with metrics such as MTTD/MTTR/dwell time, analyzes the timeline and root cause with CloudTrail and Detective, feeds lessons back into the Preparation phase (runbooks and controls), and fulfills regulatory obligations such as breach notification. Looking only at cost, forgetting the incident, or deleting evidence logs all run counter to improvement and legal requirements.

---
