# Day 4 - Incident Response Framework: NIST Phases, Runbooks, Automation vs Human Judgment Boundary

Up to now (Days 1-3) we covered *concrete techniques*: automated response pipelines, isolating compromised instances, and revoking credentials. Today we look at the *framework* that ties them together. However sophisticated the tools, if there is no system for *who judges what and when*, incident response falls into confusion. The essence of incident response (IR) is *a structure that enables consistent decision-making even under pressure and uncertainty*. The exam asks for the definition of each NIST IR phase, the role of AWS services in each phase, and boundary judgments about *what to automate and what to leave to people*.

AWS adopts the IR lifecycle of NIST SP 800-61 for the cloud in its own *AWS Security Incident Response Guide*. Knowing this precisely is the foundation of the exam in this area.

## The Four Phases of the NIST IR Lifecycle

```
[1. Preparation] ──► [2. Detection &    ──► [3. Containment,    ──► [4. Post-Incident
                        Analysis]               Eradication,            Activity]
                                                Recovery]
        ▲                                                              │
        └──────────────── Feed lessons back into Preparation ──────────┘
```

The lifecycle is a *cycle*. The lessons of post-incident activity strengthen preparation.

### 1. Preparation
Build response capability *before an incident occurs*. Preparation in the cloud:
- **Logging and visibility foundation**: enable CloudTrail (all accounts and Regions), VPC Flow Logs, GuardDuty/Security Hub/Config. *After an incident it is too late*: without logs, analysis itself is impossible.
- **Isolation and forensic infrastructure**: prepare in advance isolation security groups and subnets, a forensic account and AMI, and an Object Lock evidence bucket.
- **Permissions and access**: break-glass roles for IR staff, and automation execution roles (least privilege).
- **Runbooks and contact lists**: runbooks per scenario, escalation paths, and defined delegation of authority.
- **Training**: game day / tabletop exercises.

### 2. Detection & Analysis
Identify a signal as an incident and judge its scope and severity:
- GuardDuty (threats), Security Hub (aggregation and normalized ASFF), Config (configuration deviation), Macie (data sensitivity), CloudTrail/Athena (investigation).
- Classify findings (triage): true/false positive, severity, scope of impact, and incident severity classification.

### 3. Containment, Eradication, Recovery
- **Containment**: stop damage from spreading. Instance isolation (Day 2), credential revocation (Day 3), security groups, NACLs, SCPs. Distinguish short-term containment (immediate) from long-term containment (temporary recovery).
- **Eradication**: remove the threat. Remove malware and backdoors, patch vulnerabilities, retire compromised resources.
- **Recovery**: restore normal operations. Redeploy a patched golden AMI, restore backups, and return to service in stages while strengthening monitoring.

### 4. Post-Incident Activity
- Root cause analysis, timeline reconstruction (CloudTrail), a lessons-learned meeting, improvement of runbooks and controls, and updating metrics (MTTD/MTTR).

> 💡 **Related theory**: The reason NIST separated *eradication* from *recovery* runs deep. If you recover without fully removing the threat (e.g., restarting just the instance while leaving a backdoor), re-compromise happens immediately. Conversely, if you attempt eradication before containment, the attacker notices the detection and destroys evidence or hides deeper. The order (containment → eradication → recovery) is a game-theoretic design that *minimizes the attacker's room for action*. SANS's six-phase model (Preparation, Identification, Containment, Eradication, Recovery, Lessons Learned) is essentially the same logic.

### Converting the Preparation Phase into Concrete Deliverables

"Prepare well" is useless on the exam and in practice. The preparation phase is **a list of the things that, if they don't exist when an incident occurs, make response impossible.** The right-hand column of the table below (what happens if it is missing) is the reason each item exists.

| Preparation deliverable | Concrete form | What happens during an incident if it is missing |
|---|---|---|
| Organization CloudTrail | An organization trail created in the management account, locked with an SCP so members cannot turn it off | If the attacker turns off logging, the investigation itself cannot be carried out |
| Log archive account | Dedicated log account + Object Lock | The logs disappear together with the compromised account |
| Forensic account and isolated VPC | Analysis-only account, AMI with tools installed | There is nowhere to examine the evidence, and days are spent building infrastructure |
| Isolation SG and isolation subnet | An SG confirmed to have outbound removed, SSM endpoints | The isolation action fails at execution time |
| IR response role (all accounts) | `IR-RemediationRole` + narrowed trust policy | There is no way to get into the compromised account |
| Break-glass role | MFA enforced, immediate alarm on use | If the IdP is compromised too, no one can get in |
| Runbooks and playbooks | SSM documents + decision-flow documents | You improvise every time under pressure |
| Contact list and escalation | On-call, legal, PR, and executive paths | Technical containment is done but the notification obligation is missed |
| Training records | Game day and tabletop results | No one knows whether the runbooks actually run |

The item easily missed in this table is the **break-glass role**. In an organization that accesses only through federation (IdP), if the IdP itself is compromised or has an outage, the very people who must respond cannot get into the account. So leave one emergency path independent of the IdP, but make the moment that path is used an alarm in itself.

```json
// Trust policy of the break-glass role: MFA and source restriction applied together
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "Bool": { "aws:MultiFactorAuthPresent": "true" },
      "NumericLessThan": { "aws:MultiFactorAuthAge": "900" },
      "IpAddress": { "aws:SourceIp": ["203.0.113.0/24"] }
    }
  }]
}
```

```json
// Make break-glass use an immediate event: the use itself must be an alarm
{
  "detail-type": ["AWS API Call via CloudTrail"],
  "detail": {
    "eventSource": ["sts.amazonaws.com"],
    "eventName": ["AssumeRole"],
    "requestParameters": { "roleArn": ["arn:aws:iam::111122223333:role/BreakGlass-IR"] }
  }
}
```

### Incident Severity Classification: What Is It Based On

The substance of the detection and analysis phase is **deciding the severity level.** Once the level is decided, whom to call and which runbook to run are decided. If the organization has not agreed on the criteria in advance, time passes in every incident debating "is this serious?"

| Level | Criteria | Form of response | Escalation |
|---|---|---|---|
| **SEV-1** | Confirmed data exfiltration, root or management account compromise, full production impact | Immediate automatic containment + everyone convened | Executives, legal, PR immediately |
| **SEV-2** | Signs of compromise are certain but the scope is limited (a single workload account or instance) | Automatic containment + IR team called immediately | Security leader |
| **SEV-3** | Suspicious signal, possible false positive | Notification + analysis during business hours | On-call analyst |
| **SEV-4** | Configuration deviation, policy violation (no immediate threat) | Automatic remediation or a ticket | None |

**The axes that separate the levels are not the "severity score" but three factual questions.** ① Did data leave (or could it have)? ② Did the attacker establish persistence? ③ Was the control plane (IAM, organization, logging) touched? If even one of the three is "yes," the level goes up. Even a GuardDuty severity-5 finding is SEV-2 or higher if it belongs to the `CloudTrailLoggingDisabled` family, because the score is low but it is an event in which the control plane was shaken.

### Two Layers of Containment: Short-Term and Long-Term

It is also an exam point that NIST does not treat containment as one thing but splits it into *short-term* and *long-term*.

- **Short-term containment**: stop the bleeding at this very moment. Swap the isolation SG, deactivate keys, revoke sessions. Prevent spread even at the cost of service impact.
- **Long-term containment**: hold the threat in check *while keeping operations running* until eradication is finished. Isolate the compromised instance while moving traffic to healthy instances, block attack patterns with temporary WAF rules, and apply a temporary configuration that bypasses the vulnerable path.

If you don't distinguish the two, a dangerous stagnation arises ("we've contained it, so let's fix it slowly"), or an even more dangerous retreat ("the service is stopping, so let's lift the containment"). **Long-term containment is a structure that buys time until eradication is finished**, and in the meantime people look for the root cause.

## Runbooks and Playbooks

- **Runbook**: a step-by-step procedure for *a specific task* (e.g., an "EC2 isolation runbook": snapshot → isolation SG → tagging). Good for automation (SSM Automation Document).
- **Playbook**: the decision flow of *an entire scenario* (e.g., a "ransomware response playbook": under what conditions which runbook is called and who approves).

Properties of a good runbook:
- **Deterministic**: same input → same procedure. Reduces the burden of judgment under pressure.
- **Idempotent**: safe to run twice.
- **Auditable**: every step is recorded.
- **Tested**: verified with game days.

```yaml
# Playbook skeleton by incident level (decision flow)
Incident detected (GuardDuty/Security Hub)
  ├─ Severity LOW  → automatic ticket creation, review during business hours (human)
  ├─ Severity MED  → automatic notification + impact analysis (human) → run runbook manually if needed
  └─ Severity HIGH → run the automatic containment runbook immediately (automatic)
                   + call the IR team at the same time (human)
                   + high-impact actions (terminating prod, etc.) go through an aws:approve gate (human approval)
```

The standard means of pulling the playbook's decisions into a runbook is `aws:branch`. If the same finding takes different paths depending on the target's tag, the policy "production is isolated after approval" becomes an **executable structure**, not a document.

```yaml
schemaVersion: '0.3'
description: "Branch between automatic isolation and an approval gate by environment tag"
assumeRole: "{{ AutomationAssumeRole }}"
parameters:
  InstanceId:  { type: String }
  Environment: { type: String, default: "unknown" }
mainSteps:
  - name: preserveEvidence            # Evidence first on either path
    action: aws:executeAwsApi
    onFailure: Continue
    inputs:
      Service: ec2
      Api: CreateSnapshots
      InstanceSpecification: { InstanceId: "{{ InstanceId }}" }

  - name: routeByEnvironment
    action: aws:branch
    inputs:
      Choices:
        - NextStep: requireApproval
          Variable: "{{ Environment }}"
          StringEquals: "prod"
      Default: isolateNow             # Non-production is isolated immediately

  - name: requireApproval             # Production path: a human looks once
    action: aws:approve
    timeoutSeconds: 3600
    onFailure: Abort
    inputs:
      Approvers: ["arn:aws:iam::111122223333:role/IR-Lead"]
      MinRequiredApprovals: 1
      Message: "Approval requested to isolate production instance {{ InstanceId }} (evidence snapshot complete)"
    nextStep: isolateNow

  - name: isolateNow
    action: aws:executeAwsApi
    onFailure: Abort
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: "{{ InstanceId }}"
      Groups: ["{{ IsolationSgId }}"]
```

One design judgment matters here. **The evidence preservation step is placed *before* the branch.** While waiting for approval, the attacker might wipe the disk or the instance might be terminated for another reason. An approval gate is placed before *irreversible actions*, not before *reversible and harmless actions*. Creating a snapshot is a purely additive act that doesn't even need to be undone, so it is not subject to approval.

If approval spans several teams or the wait grows long, move up to Step Functions instead of an SSM runbook.

```
[ Approval workflow based on Step Functions ]

 Receive finding
    ▼
 [Preserve evidence]  ── automatic, immediate
    ▼
 [Short-term containment]  ── automatic, reversible (isolation SG, session revocation)
    ▼
 [Wait for approval]  ── Task (.waitForTaskToken)
    │  ├─ Send an approval link containing the token by Slack/email
    │  ├─ Approved → SendTaskSuccess  → next step
    │  ├─ Rejected → SendTaskFailure  → switch to the human path
    │  └─ Timeout → escalation (call a higher approver)
    ▼
 [Irreversible action] ── terminate, delete, redeploy
    ▼
 [Post-record]  ── update Security Hub Workflow.Status, ticket comment, load into the timeline
```

The value of `.waitForTaskToken` is that **a timeout path explicitly exists.** What happens if the approver is asleep? An approval gate with no answer to this question becomes a device that stops the response during an incident. Approval should always be paired with *automatic calling of a higher approver* or a *default action (conservatively keeping containment)*.

AWS also offers this coordination itself as a service. **Systems Manager Incident Manager** bundles response plans, on-call schedules, automatic engagement, incident timeline recording, and automatic runbook execution. When the exam has a sentence like "automatically call the on-call person when a finding occurs, record the incident timeline, and run a runbook," this service is the answer: if EventBridge *routes the signal*, Incident Manager *coordinates people and procedures*.

## The Boundary Between Automation and Human Judgment (Key)

The quintessence of this unit is *what to entrust to machines and what to people*. A wrongly set boundary fails in two directions: too much automation destroys healthy services through false positives, and too much manual work makes response slow and damage large.

| Dimension | Suited to automation | Requires human judgment |
|------|---------------|----------------|
| Clarity | Clear threats (successful brute force against a public RDP) | Ambiguous signals (abnormal API patterns) |
| Reversibility | Reversible actions (key deactivation, isolation SG) | Irreversible and high-impact (terminating prod, deleting data) |
| Scope of impact | Single resource, low impact | Broad, core services |
| Speed requirement | Seconds are decisive (credential revocation) | Analysis and context matter more |
| Frequency | Repetitive, high-volume | Rare and novel situations |

**Graduated automation**: as trust builds, move from human to automatic.
1. At first, *notification only* (human-in-the-loop): verify the automation logic.
2. As trust builds, *automate reversible, low-impact actions* (key deactivation, isolation).
3. For high-impact actions, an *approval gate* (SSM `aws:approve`): execute automatically but have a human approve once.

```yaml
# Insert a human approval gate into SSM Automation
mainSteps:
  - name: snapshotAndIsolate     # Automatic: reversible containment
    action: aws:executeAutomation
    inputs: { DocumentName: IsolateInstance }
  - name: approveTermination     # Human: approval before an irreversible action
    action: aws:approve
    inputs:
      Approvers: ["arn:aws:iam::111122223333:role/IR-Lead"]
      Message: "Approval requested to terminate production instance i-xxx"
  - name: terminate              # Automatic: executed after approval
    action: aws:executeAwsApi
    inputs: { Service: ec2, Api: TerminateInstances }
```

This is the *automation paradox* of high-risk industries such as aviation and nuclear power. The more automation grows, the more people lose *situational awareness*, so their ability to intervene drops in the rare moments when the automation does fail. So the best practice is to let *people always see what the automation did* (SNS notifications, dashboards) and to *keep people in the loop for high-impact, irreversible decisions*. The goal is not full automation but to *concentrate human judgment where it is most valuable*.

## Mapping AWS Services to IR Phases

| NIST phase | Main AWS services |
|-----------|------------------|
| Preparation | CloudTrail, Config, GuardDuty (enabling), Organizations/SCP, IAM (break-glass), forensic account |
| Detection and analysis | GuardDuty, Security Hub, Config, Macie, Detective, CloudTrail/Athena, CloudWatch |
| Containment | SSM Automation, EC2 (SG/isolation), IAM (session revocation), NACL, SCP, WAF |
| Eradication | Systems Manager (patching), SSM Automation, EC2 (redeploy), Lambda |
| Recovery | Golden AMI, Backup restore, CloudFormation/IaC redeploy, CloudWatch monitoring |
| Post-incident | CloudTrail/Athena (timeline), Detective (investigation), Security Hub (insights), runbook updates |

**Amazon Detective**, particularly in the *analysis and post-incident* phases, shows the *context and relationships* of GuardDuty findings (which entities communicated with what, anomalies against a behavioral baseline) as a graph, helping root cause analysis.

IR maturity is measured and improved with *metrics*: MTTD (mean time to detect), MTTR (mean time to respond), and dwell time (how long an attacker lurks). Automated response (Day 1) dramatically reduces MTTR, and detection controls (GuardDuty/Security Hub) reduce MTTD. In the post-incident phase you track these metrics to find *which phase is the bottleneck* and invest automation and controls there. IR also has a *legal and regulatory* dimension: evidence integrity (chain of custody, Day 2), breach notification obligations (GDPR's 72 hours, etc.), and regulatory reporting. So an IR plan includes the roles and contact lists not only of the security team but also of legal, PR, and executives. Technical containment and organizational response are not separate.

## The Account Structure in Which Response Takes Place

The IR framework is both an org chart and an account structure. "Who judges" ultimately reduces to "which role in which account can call that API."

```
                     ┌──────────────────────────────┐
                     │  Management account           │
                     │  · Organizations / SCP        │
                     │  · Creates the org CloudTrail │
                     │  · Hosts no workloads         │
                     └──────────────┬───────────────┘
                                    │ Delegation
        ┌───────────────────────────┼───────────────────────────┐
        ▼                           ▼                           ▼
┌─────────────────┐      ┌────────────────────┐      ┌────────────────────┐
│ Log archive acct │      │ Security account    │      │ Forensic account     │
│ · CloudTrail dest│      │ · Security Hub deleg.│     │ · Receives evidence  │
│ · Object Lock    │◀─────│ · GuardDuty deleg.  │─────▶│   snapshots          │
│ · Write-only     │ Query│ · EventBridge hub   │ Share│ · Isolated VPC,      │
│   access         │      │ · IR orchestrator   │      │   analysis EC2       │
└─────────────────┘      └─────────┬──────────┘      │ · External sharing   │
                                   │                  │   forbidden by SCP   │
                                   │                  └────────────────────┘
                                   │ sts:AssumeRole (IR-RemediationRole)
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
   Workload account A         Workload account B         Workload account C
   (where isolation, snapshots, and session revocation run: minimal permissions, Deny on irreversible actions)

Key: evidence (logs, snapshots) lives outside the accounts that can be compromised,
     while response permissions are planted in advance inside the accounts that can be compromised, kept as narrow as possible.
```

This structure answers one question: **can you still investigate and respond even when a workload account is completely taken over?** If the logs are only inside that account, the answer is "no." If the response role has to be created after the incident, the answer is "no." Every item of the preparation phase derives from this one question.

The 2017 **Equifax** breach is the standard case showing what happens when *preparation* and *detection*, two of NIST's four phases, collapse at once. The initial entry was a **missed patch** for a widely known web framework vulnerability (Apache Struts). Up to here it is a common story, but what made this incident a textbook is what came next: the organization operated equipment that decrypts and inspects encrypted network traffic, but **that equipment's certificate had been left expired for a long time.** During that period outgoing traffic was not inspected, and the attacker exfiltrated data over a long period. Only when the certificate was renewed did the abnormal traffic come to light. Three lessons here. ① **A detection control must be confirmed not as "installed" but as "working at this very moment"**: a control silently dead from expiry, lack of permissions, or misconfiguration is more dangerous than no control, because it makes you believe you are safe. ② So the preparation phase must include not only the *existence* of controls but also *liveness checks* (do logs actually arrive, do rules actually match). This is why Day 1 stressed the `FailedInvocations` alarm and sample-finding verification. ③ Asset inventory and patch management are part of IR: if you don't know what runs where, even when a vulnerability advisory arrives you cannot tell where to fix.

> 🎯 **Scenario**: Early Saturday morning, a `CRITICAL` finding appears in Security Hub. In one workload account, organization CloudTrail logging was stopped; at nearly the same time a new IAM user and access key were created, and a large instance was launched in a Region that is not normally used. What does the on-call analyst do in the first 30 minutes, and in what order? → **First decide the level.** Of the three factual questions above, ② (persistence established) and ③ (control plane tampered with) are both "yes," so this incident is SEV-1 immediately. Don't spend time recalculating the severity score. The order after that is as follows. ① **Restoring logging is the top priority**: what happens while logging is off can never be known, so at least make everything from now on get recorded. At the same time, confirm that the logs that already arrived in the log archive account are intact (which is why the archive must be a separate account). ② **Neutralize credentials**: deactivate the newly created user and key, and neutralize the credentials of the principal that created them as well. The order matters: if you don't turn off the creator first, the attacker immediately creates another user. ③ **Isolate compute**: don't terminate the instance in the unused Region; snapshot it, then isolate. ④ **Escalate**: since it is SEV-1, the security leader and legal paths should already be open by this point. If signs of data access are confirmed, the notification-obligation clock starts running, and that judgment is not something the analyst can make alone. ⑤ **Organization-level block**: from the management account, use an SCP to shut down the OU's logging stoppage and Region expansion. The point is **restore logging → neutralize credentials (creator first) → isolate compute → organization-level block**, and the common mistake is to terminate the conspicuous large instance first, destroying evidence and clues at once.

> ⚠️ **Trap**: Three misconceptions that recur in the IR framework. ① **"We've contained it, so the incident is over"**: containment is only stopping the bleeding, and recovering without eradication leads to re-compromise. NIST split the phases to prevent exactly this misconception. ② **"More automation means better response"**: automation replaces only *repeated judgments*, not *new judgments*. In fact the more automation grows, the more people's situational awareness drops, lowering response ability at the moment the automation fails (the automation paradox). That is why automatic actions must always be reported to people. ③ **"We wrote the runbook down, so we're prepared"**: a runbook that has never been executed will surely fail during an incident. The referenced SG doesn't exist, the role permissions are insufficient, or a parameter name has changed. **A runbook is code, and untested code does not work.** The purpose of a game day is half training people and half confirming that the runbook actually runs.

An axis that must be pointed out when viewing IR at the organizational level is the **shared responsibility model.** AWS responds to incidents in the infrastructure layer (hypervisor, physical security, the inside of managed services), and the customer responds to incidents in customer data, IAM configuration, guest OS, and applications. The point where this boundary becomes an issue in a real incident is the judgment of "when to contact AWS": when control of the account is completely lost (root compromise with the recovery channels also seized), when our account has become the origin of attacks on others (an Abuse report received), or when AWS-side investigative cooperation is needed. AWS has a dedicated organization that supports customer incidents (the Customer Incident Response Team) and also offers managed services that bundle incident response preparation, detection, and recovery. The practical conclusion is **to confirm the contact path and support plan before an incident**: response times differ by support plan tier, and an astonishing number of organizations learn this for the first time in the middle of a SEV-1. And there is one more, legal axis. Breach notification obligations have deadlines that differ by jurisdiction and regulation, and the starting point of the deadline is usually "the point of awareness." In other words, **the faster detection becomes, the sooner the notification clock also starts running**, so incident severity determination and the path for notifying legal must be inside the same playbook as technical response.

## Trap Summary

- Skipping the preparation phase and trying to build logging and isolation infrastructure after an incident; the past is not restored.
- Keeping logs only inside accounts that can be compromised; the evidence disappears along with the account.
- Trying to deploy the IR response role after the incident; there may be no means to get into the compromised account.
- With no break-glass path, no one can get into the account when the IdP is compromised or down.
- Not agreeing in advance on incident level criteria, so every incident spends time on severity debates.
- Classifying control plane tampering (logging stopped, policy changes) as low level by looking only at the severity *score*.
- Not distinguishing short-term from long-term containment, drifting into "stagnation after containment" or "lifting containment because of the service."
- Recovering without eradication and being re-compromised through the backdoor.
- Placing an approval gate before a reversible, harmless action (snapshot), delaying evidence collection.
- An approval gate with no timeout or escalation path, so the response stops if the approver doesn't respond.
- Not notifying people of what the automation did, so situational awareness disappears (the automation paradox).
- Believing in a runbook that has never been executed; a runbook is code and needs testing.
- Doing only technical containment and not putting the legal, PR, and regulatory notification paths into the playbook.
- Confirming the AWS support plan and contact path for the first time in the middle of an incident.
- Omitting post-incident activity so the same incident repeats; the lifecycle is a cycle only when it feeds back.

## Summary

- [ ] Do you understand the NIST four phases (Preparation → Detection and Analysis → Containment, Eradication, Recovery → Post-Incident) and the cyclical structure?
- [ ] For each preparation deliverable, can you answer "what happens if it is missing"?
- [ ] Are the logs and evidence **outside** the accounts that can be compromised?
- [ ] Did you deploy the IR response role and the break-glass role before an incident and make their use an alarm?
- [ ] Did you agree in advance on incident level criteria (data exfiltration, persistence, control plane)?
- [ ] Did you distinguish short-term from long-term containment and design a plan to keep operations running together?
- [ ] Do you place approval gates only before irreversible actions, and attach a timeout and escalation?
- [ ] Did you verify the runbooks by actually executing them in a game day?
- [ ] In the preparation phase, did you have logging, isolation infrastructure, runbooks, and break-glass in place *before the incident*?
- [ ] Do you know the logic of the containment → eradication → recovery order (preventing re-compromise, protecting evidence)?
- [ ] Do you distinguish runbooks (task procedures) from playbooks (scenario decisions)?
- [ ] Do you judge the automation/human boundary by clarity, reversibility, scope of impact, and speed?
- [ ] With graduated automation, do you automate reversible, low-impact actions and put an approval gate (aws:approve) on high-impact ones?
- [ ] Can you map the appropriate AWS services to each IR phase?
- [ ] In the post-incident phase, do you improve with MTTD/MTTR and reflect legal and regulatory obligations?

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
