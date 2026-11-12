# Day 5 - Week 10 Synthesis: Integrated Incident Response Scenario Review

This week we covered the second axis of threat management: *Response*. Auto response pipelines (EventBridge + SSM + Lambda), compromised instance isolation and forensics, credential exposure revocation, and the NIST IR framework that unifies all of it. Today we integrate these into a single *response decision system*. The exam tests not isolated APIs but *"in what order, by what mechanism, and with what automation/human judgment does this incident flow through the response phases?"* The key is **3D thinking: phase (NIST) × target (instance/credential) × actor (auto/human)**.

## Integrated Decision Matrix: Incident → Response

| Incident/Signal | Containment (immediate) | Evidence & tracking | Eradication & recovery | Automation/Human |
|-----------------|------------------------|---------------------|------------------------|------------------|
| EC2 C2 communication (GuardDuty) | Replace isolation SG (keep running) | EBS snapshot + memory dump | Redeploy from golden AMI, then terminate | Containment auto, termination approval gate |
| Compromised instance role token leaked | aws:TokenIssueTime Deny (session revocation) | CloudTrail for token activity | Narrow trust policy, reissue | Auto (reversible) |
| Access key publicly exposed | update-access-key Inactive | CloudTrail by accessKeyId | Rotate new key → delete old, Secrets Manager | Disable auto, rotate human |
| Root account compromise | Reset password/keys/MFA | Full CloudTrail audit of root activity | Backdoor removal, AWS escalation | Human (high-impact) |
| Config compliance drift | Remediation runbook (auto) | Config timeline | Policy enforcement | Auto (low-impact) |
| Data exposure (Macie) | Bucket policy, Block Public Access | CloudTrail GetObject tracking | Permission tightening, encryption | Human (impact analysis) |
| Multi-account threat aggregate | Security Hub central response | Detective graph investigation | Organizational policy (SCP) | Auto + human |

> 💡 **Related theory**: This matrix backbone is NIST's *containment → eradication → recovery* sequence plus *order of volatility* (preserve evidence alongside containment) plus *graduated automation* (reversible/low-impact auto, irreversible/high-impact human). The "best" answer typically *blocks damage spread fastest without losing evidence and preserves human judgment for irreversible decisions*.

## Flow Thinking: How one incident flows through phases

The same signal's quality of response depends on *what you do at which phase*.

```
GuardDuty finding
   ▼ [Detection & Analysis] classify by severity/type, assess impact scope
EventBridge rule (pattern filter + InputTransformer)
   ├─► SNS → page IR team (human, maintain situational awareness)
   └─► SSM Automation runbook
         ├─ [Evidence Preservation] EBS snapshots + memory dump (concurrent, priority over containment)
         ├─ [Containment]          Replace isolation SG + revoke credentials
         ├─ [aws:approve]          Human approval gate before irreversible action (prod termination)
         ├─ [Eradication]          Redeploy from golden AMI, backdoor removal
         └─ [Recovery]             Strengthen monitoring, staged service restoration
   ▼ [Post-Incident] CloudTrail/Detective timeline, measure MTTR, improve runbook
```

Core insight: **Automation buys time (containment, evidence preservation); humans decide (impact analysis, irreversible actions, root cause).** Not competition but division of labor.

> 🎯 **Integrated Scenario A**: "Production EC2 triggers GuardDuty cryptomining alert (CryptoCurrency:EC2/BitcoinTool). Evidence of S3 access via instance role." Answer: (1) EventBridge receives finding, SNS pages IR team + launches SSM runbook, (2) Runbook preserves evidence: EBS snapshots and memory dump (keep running), (3) Containment: replace isolation SG + add aws:TokenIssueTime Deny to instance role, (4) Track: CloudTrail/Athena for S3 objects accessed and resources created by the role, (5) Approval: prod termination requires IR lead sign-off via aws:approve, (6) Eradication: redeploy from patched golden AMI. All week's mechanisms work in concert.

> 🎯 **Integrated Scenario B**: "Developer pushes access key to public repo. Attacker creates new IAM user and additional keys. Multi-account org environment." Answer: (1) Exposed key Inactive immediately (containment), (2) Full CloudTrail/Athena trace of key activity → identify attacker-created IAM users, keys, widened policies (backdoors), (3) Detective graph analysis for related entities and anomalous behavior, (4) Eradicate backdoors, (5) Migrate secrets to Secrets Manager auto-rotation; humans move to IAM Identity Center temporary credentials, (6) Security Hub org-wide scan for similar risks + add root/long-term key usage detection alarm.

## Frequently confused distinctions

**Isolation vs Termination** — Isolation is network blocking (keep running, preserve volatile evidence); termination destroys evidence. Containment's first measure is isolation.

**Access key neutralization vs STS token neutralization** — Key: `update-access-key Inactive` (explicit disable); STS token: no revoke API, use `aws:TokenIssueTime` Deny (time-based denial).

**Disable vs Delete** — Exposed key: disable first (preserve tracking/recovery), track/rotate later, then delete. Immediate delete obscures attacker activity.

**SSM Automation vs Lambda** — Standard, multi-step, auditable, approval gates → runbook; complex logic, external integration → Lambda.

**Runbook vs Playbook** — Runbook: procedure (automation unit); Playbook: scenario decision flow (which conditions invoke which runbook, who approves).

**Containment vs Eradication vs Recovery** — Block spread / fully remove threat / restore normal operation. Sequence prevents re-compromise and evidence loss.

**GuardDuty vs Security Hub vs Detective** — Threat detection / finding aggregation and normalization (ASFF) / relationship and root cause graph investigation.

**Automation fit vs human need** — Obvious, reversible, low-impact, high-speed → auto; ambiguous, irreversible, high-impact → human approval.

> ⚠️ **Pitfall collection**:
> - Immediately terminate compromised instance, destroying volatile evidence.
> - Replace security group, leave established C2 session running (need NACL/ENI adjunct).
> - Isolate instance but don't revoke leaked STS tokens (valid outside instance until expiration).
> - Delete exposed key before tracking (attacker activity untraceable).
> - Try to limit root privilege via IAM policy modification (root bypasses all policies).
> - Recover without eradicating, causing immediate re-compromise.
> - Full automation cascade causing false positive service destruction.
> - Keep evidence snapshots in original account with public deletion access (chain of custody fails).

## Visibility and Operations: Measure and improve response

Response is proven and improved via *metrics*.
- **MTTD (Detection time)**: Reduce via GuardDuty/Security Hub detection controls.
- **MTTR (Response time)**: Drastically reduce via auto response pipeline (EventBridge + SSM).
- **Dwell time (Attacker residence duration)**: Reduce via combined detection and response.

Track these metrics post-incident to find *bottleneck phases* and invest in automation/controls there. All response is logged in CloudTrail for audit and legal evidence; Detective aids post-investigation. IR is not just technical containment (security team) but also organizational response (legal, PR, executive) — breach notification obligations, regulatory reporting, stakeholder communication are inseparable from technical response.

> 🔍 **Deep dive**: Response maturity measures not just "did we block it?" but "*can we respond consistently, quickly, and provably, and do we learn and self-improve from the experience?"* Auto response reduces MTTR from minutes to seconds (Day 1); evidence integrity preserved across accounts (Day 2); accurate credential neutralization by type (Day 3); NIST phases and automation/human boundaries clear (Day 4). Controls activate; humans focus judgment where it matters most. This is where governance and compliance (next week) follow — evidence/legal/regulatory rigor in response determines whether technical containment translates into organizational resilience.

## One-line summary checklist

- [ ] Map incident to NIST phase (Preparation → Detection & Analysis → Containment, Eradication, Recovery → Post-Incident)
- [ ] Containment via isolation (keep running) with concurrent evidence preservation (snapshots, memory)
- [ ] Differentiate credential neutralization by type (key Inactive / STS TokenIssueTime Deny / root reset)
- [ ] Track full activity and backdoors via CloudTrail/Athena/Detective post-neutralization
- [ ] Auto contain to buy time; gate irreversible/high-impact actions with human approval (aws:approve)
- [ ] Distinguish runbooks (procedure) from playbooks (decision flow); apply graduated automation
- [ ] Maintain evidence integrity (separate account, Object Lock, CloudTrail)
- [ ] Measure MTTD/MTTR/dwell time and feedback lessons to Preparation phase

---

## 📝 Practice Questions

**Question 1.** GuardDuty detected cryptocurrency mining on a production EC2 instance, and there are traces of S3 access using the instance role. What is the most appropriate integrated response order?

A) Terminate the instance immediately and stop there  
B) Preserve evidence (snapshot, memory) -> contain with an isolation SG + revoke role sessions -> trace S3 access with CloudTrail -> terminate prod only after an approval gate -> redeploy from a golden AMI  
C) Only add a security group and just monitor  
D) Delete the IAM user  

**Answer: B**  
Explanation: To avoid losing volatile evidence, first preserve the snapshot and memory while the instance is running, contain with an isolation SG, revoke the instance role sessions with an aws:TokenIssueTime Deny, trace the S3 access made by the role with CloudTrail, and recover from a golden AMI after an approval gate for the irreversible prod termination. Immediate termination destroys evidence, and only monitoring or deleting a user is inappropriate.

---

**Question 2.** An access key was exposed in a public repository, and there are signs that the attacker created a new IAM user and additional keys. What is the most important follow-up step immediately after neutralization?

A) Finish once containment is done  
B) Exhaustively investigate the key's activity with CloudTrail/Athena to identify and eradicate backdoors the attacker created (new users, keys, widened policies), analyze relationships with Detective, and then rotate the credentials  
C) Check the cost report  
D) Delete all keys immediately and skip tracing  

**Answer: B**  
Explanation: Deactivating the key only stops the bleeding, and if you do not trace and eradicate the persistence (backdoors) the attacker planted, re-compromise follows. It is essential to exhaustively investigate the key's activity with CloudTrail/Athena, analyze relationships with Detective, remove the backdoors, and then rotate. Ending at containment or deleting without tracing is risky.

---

**Question 3.** Which of the following is NOT an item frequently pointed out as a "pitfall" covered this week?

A) Terminating the compromised instance immediately, destroying volatile evidence  
B) Isolating only the instance without revoking the leaked STS token, so it remains valid externally until expiry  
C) Sharing the evidence snapshot to a separate forensic account and guaranteeing integrity with Object Lock  
D) Recovering without eradication, leading to re-compromise through a backdoor  

**Answer: C**  
Explanation: Protecting the evidence snapshot with sharing to a separate account and Object Lock is not a pitfall but the chain of custody best practice. All the others are real, frequently tested pitfalls: destroying evidence by immediate termination, leaving the STS token unrevoked so it stays valid externally, and re-compromise from recovering without eradication. Since the question asks for what is not a pitfall, the answer is guaranteeing evidence integrity.

---

**Question 4.** We want to automate containment with EventBridge + SSM Automation while keeping irreversible actions on production resources under human control. What is the most appropriate design principle?

A) Fully automate every action  
B) Graduated automation — run reversible, low-impact actions (isolation, key deactivation) automatically and immediately, put an aws:approve approval gate on irreversible, high-impact actions (prod termination), and always let people see what the automation did via SNS  
C) Have people run every action manually in the console  
D) Do not notify people of automation results  

**Answer: B**  
Explanation: Graduated automation runs reversible, low-impact actions automatically and immediately to reduce MTTR, keeps human approval for irreversible, high-impact actions with aws:approve, and maintains situational awareness with SNS notifications to prevent the automation paradox (people losing the ability to intervene). Full automation carries false positive risk, fully manual response causes delay, and no notification causes loss of situational awareness.

---

**Question 5.** What is most appropriate as the core of measuring and improving the IR program in the Post-Incident phase?

A) Only reduce instance costs  
B) Track MTTD, MTTR, and dwell time to find the bottleneck stages, analyze the timeline and root cause with CloudTrail/Detective, feed lessons back into the Preparation phase (runbooks and controls), and fulfill regulatory obligations such as breach notification  
C) Delete logs to save storage costs  
D) Forget the incident and move on to the next task  

**Answer: B**  
Explanation: The post-incident phase uses MTTD/MTTR/dwell time to find which stage is the bottleneck and invest in automation and controls, analyzes the timeline and root cause with CloudTrail and Detective, feeds lessons back into the Preparation phase, and fulfills regulatory reporting obligations, completing the NIST lifecycle loop. Looking only at cost savings, deleting evidence logs, or forgetting the incident runs counter to improvement and legal requirements.

---
