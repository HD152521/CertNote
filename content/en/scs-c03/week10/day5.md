# Day 5 - Week 10 Synthesis: Integrated Incident Response Scenario Review

This week we covered the second axis of threat detection and response: *Response*. We worked through the automated response pipeline (EventBridge + SSM + Lambda), isolation and forensics for compromised instances, revoking leaked credentials, and the NIST IR framework together with the boundary between automation and human judgment. Today we integrate all of these into a single *response decision framework*. The exam tests less your knowledge of individual APIs than *"in what order, with what mechanism, what do you automate and what do you leave to a human judgment in this incident?"* The core idea is three-dimensional thinking: **phase (NIST) x target (instance/credential) x actor (automation/human)**.

## Integrated Decision Matrix: Incident -> Response

| Incident/signal | Containment (immediate) | Evidence and tracing | Eradication and recovery | Automation/human |
|-----------|------------|-----------|-----------|-----------|
| EC2 C2 communication (GuardDuty) | Swap in an isolation SG (keep instance running) | EBS snapshot + memory dump | Redeploy from golden AMI, then terminate | Containment automated, termination behind an approval gate |
| Instance role token leaked from a compromised instance | `aws:TokenIssueTime` Deny (revoke sessions) | Token activity via CloudTrail | Narrow the trust policy, reissue | Automated (reversible) |
| Access key publicly exposed | `update-access-key` Inactive | CloudTrail by accessKeyId | Rotate to a new key, then delete the old one; Secrets Manager | Containment automated, rotation by a human |
| Root account compromise | Reset password, keys, MFA | Full sweep of root activity in CloudTrail | Remove backdoors, escalate to AWS | Human (high impact) |
| Compliance deviation (Config) | Automatic remediation runbook (AWSConfigRemediation-*) | Config timeline | Strengthen policy | Automated (low impact) |
| Data exposure (Macie) | Bucket policy, Block Public Access | Track CloudTrail GetObject | Reduce permissions, encrypt | Human (impact analysis) |
| Multi-account threat aggregation | Central response via Security Hub | Detective graph investigation | Organization policy (SCP) | Automated + human |

> 💡 **Related theory**: The skeleton of this matrix is a combination of NIST's *containment -> eradication -> recovery* order, the *order of volatility (preserve evidence in parallel with containment)*, and *graduated automation (reversible, low-impact actions are automated; irreversible, high-impact actions go to a human)*. The "best" answer is usually the response that *stops the damage from spreading as fast as possible, without losing evidence, while leaving human judgment in place for irreversible actions*.

## Flow Thinking: How One Incident Moves Through the Phases

Even the same signal can get a very different quality of response depending on *what you do at which phase*.

```
GuardDuty finding
   ▼ [Detection/analysis] classify by severity/type, judge scope of impact
EventBridge rule (pattern filter + InputTransformer)
   ├─► SNS → page the IR team (human, keeps situational awareness)
   └─► SSM Automation runbook
         ├─ [Preserve evidence] EBS snapshot + memory dump (in parallel with containment, first)
         ├─ [Contain]           swap in isolation SG + revoke credential sessions
         ├─ [aws:approve]       human approval before irreversible actions (terminating prod)
         ├─ [Eradicate]         redeploy golden AMI, remove backdoors
         └─ [Recover]           gradual return while monitoring is heightened
   ▼ [Post-incident] CloudTrail/Detective timeline, measure MTTR, improve runbooks
```

Key insight: **automation buys time (containment, evidence preservation), and humans focus on judgment (impact analysis, irreversible decisions, root cause).** The two are not competing; they divide the labor.

> 🎯 **Integrated Scenario A**: "A production EC2 instance is flagged by GuardDuty for cryptocurrency mining (CryptoCurrency:EC2/BitcoinTool). There are also traces of S3 access using the instance role." Answer: (1) EventBridge receives the finding, pages the IR team via SNS, and starts the SSM runbook; (2) the runbook preserves evidence with an EBS snapshot and memory dump (instance stays running); (3) contain with an isolation SG, and revoke sessions by adding an `aws:TokenIssueTime` Deny to the instance role; (4) trace the S3 objects the role accessed and the resources it created using CloudTrail/Athena; (5) terminating the prod instance happens only after the IR lead approves via `aws:approve`; (6) redeploy from a patched golden AMI. Every mechanism from this week cooperates in a single flow.

> 🎯 **Integrated Scenario B**: "A developer pushed an access key to a public repository, and there are signs that the key was used to create a new IAM user and additional keys. Multi-account organization environment." Answer: (1) immediately set the exposed key to Inactive (containment); (2) sweep key activity with CloudTrail/Athena, identifying the IAM users, keys, and widened policies (backdoors) that the attacker created; (3) use Detective to analyze the graph of related entities and anomalous behavior; (4) eradicate the backdoors; (5) move secrets to Secrets Manager with automatic rotation, and switch people to SSO temporary credentials; (6) use Security Hub to check for similar risks across the organization, and add alarms that detect root/long-term key usage.

## The "What Do You Do First" Master Table

This week includes questions about **order**. They give the same list of actions and build the answer choices by changing only the arrangement. The table below collects the first action for each situation along with the reasoning, and once you understand the reasoning, variations won't shake you.

| Situation | What you do first | Why | Typical wrong answer |
|---|---|---|---|
| EC2 compromised, member of an ASG | **Detach from the ASG and target groups** | If you isolate it, health checks fail and the ASG terminates it on its own, destroying the evidence | Immediately swap in an isolation SG |
| EC2 compromised, standalone instance | **Preserve evidence (memory, then snapshot)** | Isolation is not termination and can run in parallel, but termination cannot be undone | Terminate, then snapshot |
| Signs that the instance role token leaked | **Revoke sessions + detach the profile** | The token lives outside the instance until it expires, so isolation cannot stop it | Isolate only the instance |
| Access key publicly exposed (in normal use) | **Deactivate it** | Stopping the leak takes priority over availability. Deactivation is reversible | Delete it / rotate first |
| Access key exposed, no known usage traces | **Check `get-access-key-last-used`** | Severity splits in 30 seconds, and the severity level drives everything afterwards | Jump straight into a full investigation |
| Root compromise | **Confirm control of the recovery channels (email, phone)** | If they have already been changed, technical response itself is impossible | Restrict root with an IAM policy |
| CloudTrail logging stop detected | **Restore logging + verify the integrity of the archive** | What happened while it was off can never be known | Terminate the most visible instance first |
| User/key created by the attacker found | **Neutralize the creating credential first** | If the original credential is still alive, they will create another immediately | Delete only the newly created user |
| An in-progress C2 session will not drop | **Add NACL/ENI blocking** | SGs are stateful, so established connections remain | Re-add the SG rule |
| Production resource needs to be terminated | **After passing the approval gate** | For irreversible actions, one false positive becomes an outage | Terminate automatically |
| Suspected same risk across multiple accounts | **Check the whole organization with Security Hub** | Walking through accounts one by one misses some | Check each account in the console |

Four sentences run through the whole table. **(1) Push actions that destroy evidence to later. (2) Pull reversible actions forward. (3) Revoking credentials must always be done, separately from network isolation. (4) Cut off the cause of spread (the original credential, the logging stop) before the effect (the new user, the instance).**

> 🎯 **Scenario**: Macie detected a large amount of personal information in a production S3 bucket, and Access Analyzer reported that the bucket's policy was changed 24 hours ago to grant read access to a specific external account. What do you do first? -> The distinguishing feature of this incident is that **the compromise path is neither an instance nor a credential but a "resource policy."** (1) **Blocking access is the first action**: remove the relevant Statement from the bucket policy or reapply Block Public Access to stop the leak. You must not delete the bucket or move the objects here (that breaks both the evidence and the service). (2) Check **who changed the policy and when** via `PutBucketPolicy` in CloudTrail. Whether a person changed it or a stolen credential changed it makes the nature of the incident completely different. (3) If it was a stolen credential, neutralize that credential and move on to the Day 3 backdoor hunting. (4) Confirm **what was actually read** using S3 data events (CloudTrail data events) or server access logs. The result of this check is the basis for deciding on notification obligations, so you must answer with logs, not with guesses. (5) Preventing recurrence is organization-wide: continuously monitor bucket policy changes with Config rules and EventBridge, block sharing with external accounts with an SCP, and turn on account-level Block Public Access. The order is **block -> identify who changed it -> respond on the credential -> establish the scope that was read -> organization-wide controls**, and if you skip (4), you end up in the worst position of having to make a legal judgment in a state of "we don't know whether it leaked."

> 🎯 **Scenario**: An organization that has run an automated response pipeline for six months got these metrics in its post-incident review: MTTD fell from 3 days to 20 minutes, but MTTR is almost unchanged, from 4 hours to 3 hours 40 minutes. Where should it invest? -> The bottleneck the metrics point to is clear. **Detection has improved and response is stagnant.** The cause is usually one of three. (1) *The scope of automated action is narrow*: only notifications are automated, and the actual actions are still performed by people in the console. In that case, moving the reversible actions (swapping in an isolation SG, deactivating keys, revoking sessions) into runbooks first makes MTTR drop in steps. (2) *Waiting for approval is the bottleneck*: with a single approver or no overnight path, waiting time makes up most of the response time. The fix is a larger pool of approvers and timeouts/escalation, not removing the approval gate. (3) *The investigation phase is the bottleneck*: logs are scattered across several accounts, so establishing the scope takes time. Here the answer is central log aggregation and pre-written investigation queries. **In every case, the prescription starts not with "turn on more automation" but with "break response time into phases and measure where the time flows."** MTTR is not a single number but the sum of detection -> triage -> containment -> investigation -> recovery, and if you don't measure each segment separately you can't know where to improve.

## Distinctions That Are Often Confused

**Isolation vs. termination**: Isolation is a network cutoff (the instance keeps running and volatile evidence is preserved); termination destroys evidence. The first means of containment is isolation.

**Neutralizing an access key vs. neutralizing an STS token**: For a key, use `update-access-key Inactive` (explicit deactivation); STS tokens have no revocation API, so use an `aws:TokenIssueTime` Deny (time-based denial).

**Deactivating vs. deleting**: Deactivate an exposed key first (leaves room for tracing and recovery), and delete it only after tracing and rotation. Deleting immediately makes tracing harder.

**SSM Automation vs. Lambda**: Use a runbook for standard, multi-step, audited, approval-gated work; use Lambda for complex logic or external integration.

**Runbook vs. playbook**: A runbook is a task procedure (the unit of automation); a playbook is the decision flow for a scenario (which runbook and which approval under which conditions).

**Containment vs. eradication vs. recovery**: Stopping the spread / removing the threat completely / restoring normal operation. You must keep the order to prevent re-compromise and loss of evidence.

**GuardDuty vs. Security Hub vs. Detective**: Threat detection / aggregating and normalizing findings (ASFF) / graph investigation of relationships and root cause.

**Suited for automation vs. needs a human**: Obvious, reversible, low-impact, high-speed actions are automated; ambiguous, irreversible, high-impact actions need human approval.

> ⚠️ **Pitfall collection**:
> - Immediately terminating the compromised instance, destroying volatile evidence.
> - Only replacing the security group, while an established C2 session persists (NACL/ENI supplementation needed).
> - Isolating only the instance and not revoking the leaked STS token (valid from outside until it expires).
> - Deleting the exposed key before tracing, making it impossible to trace the attacker's activity.
> - Trying to restrict root privileges by modifying IAM policies (root ignores policies).
> - Recovering without eradication, leading to re-compromise.
> - Fully automating every action and destroying prod through a false positive.
> - Keeping the evidence snapshot only in the source account, with no chain of custody guaranteed.

## Week 10 Compressed into Three Comparison Tables

### (1) Isolation methods

| Axis | Swap in an isolation SG | NACL block | Move subnet/ENI |
|---|---|---|---|
| Unit of application | ENI (effectively the instance) | The whole subnet | Instance |
| Existing sessions | Stateful, so they may persist briefly | **Stateless, so both directions are cut immediately** | The path itself disappears |
| Collateral damage | None | Healthy instances in the same subnet | None |
| Reversal | Easy (reversible, so suited to automation) | Easy | Complex |
| When to use | **The standard first means** | Supplement when the SG does not cut it | Long-term isolation, detailed analysis |

One line to remember: **a newly created SG has an allow-all outbound rule attached by default**, and unless you remove it, it is not isolation.

### (2) Neutralization by credential type

| Axis | Access key (`AKIA`) | Role session (`ASIA`) | Root |
|---|---|---|---|
| Neutralization | `update-access-key --status Inactive` | `aws:TokenIssueTime` Deny | Reset password and MFA, delete root keys |
| Blocking new issuance | Deactivation is the block | Detach the profile / narrow the trust policy | Reset credentials + re-register MFA |
| Tracing axis | `userIdentity.accessKeyId` | Session ARN, `ASIA...` | `userIdentity.type = Root` |
| Automation | Suitable (reversible, mechanical) | Suitable | Unsuitable (human and organizational response) |
| Specific pitfall | Legitimate workloads using it at the same time | Legitimate sessions of the same role are cut too | **Cannot be restricted by IAM policy or SCP** (management account) |

One line to remember: **turn keys off, deny sessions, take root back.**

### (3) Automatic execution vs. approval gate

| Decision axis | Automatic | Approval |
|---|---|---|
| Reversibility | Isolation SG, key deactivation, session revocation, snapshot | Termination, deletion, redeployment |
| Signal confidence | Conclusive evidence | Behavior-based anomaly |
| Scope of impact | Single resource, non-production | Shared infrastructure, `Environment=prod` |
| Time pressure | Seconds determine the amount of damage | Quality of analysis matters more |

One line to remember: **reversibility overrides the other three axes.** If it can be undone, automate it; if not, require approval.

## Role Distinctions Among Detection and Investigation Services

Many questions create wrong answers just by swapping service names in the choices. If you memorize each service by the *question* it answers, you won't get confused.

| Service | The question it answers | IR phase |
|---|---|---|
| **GuardDuty** | "Is a threat *behavior* happening right now?" | Detection |
| **Security Hub** | "How do I view findings from many tools and accounts in one format (ASFF)?" | Detection, aggregation, entry point for automation |
| **AWS Config** | "Has the configuration deviated from the baseline, and when and how did this resource change?" | Detection, investigation (timeline) |
| **CloudTrail** | "Who called which API, and when?" | Foundation of investigation |
| **Athena / CloudTrail Lake** | "How do I query those calls in bulk?" | Investigation |
| **Detective** | "How are these entities connected, and what differs from normal?" | Analysis, post-incident |
| **Macie** | "What data is sensitive and where is it exposed?" | Detection (data layer) |
| **Inspector** | "Which vulnerabilities and CVEs remain?" | Preparation, eradication |
| **Access Analyzer** | "What is open to the outside?" | Preparation, backdoor hunting |
| **Systems Manager** | "How do I run the action as a standard procedure?" | Containment, eradication, recovery |

In particular, the **distinction between Config and CloudTrail** comes up. "When and in what state was this security group?" is Config (configuration history), and "who called the change API?" is CloudTrail (action record). Investigation usually joins the two: use Config to find *when it changed*, then use that time as the axis to find *who did it* in CloudTrail.

## Response CLI Cheat Sheet

Under pressure there is no time to search. This section collects, in one place, the commands you actually need to reach for this week.

```bash
# ── Isolation ───────────────────────────────────────────────────
aws autoscaling detach-instances --instance-ids i-0x --auto-scaling-group-name asg \
  --no-should-decrement-desired-capacity            # prevent ASG auto-termination (first action)
aws elbv2 deregister-targets --target-group-arn <tg> --targets Id=i-0x
aws ec2 revoke-security-group-egress --group-id $ISO_SG \
  --ip-permissions 'IpProtocol=-1,IpRanges=[{CidrIp=0.0.0.0/0}]'   # remove default outbound
aws ec2 modify-instance-attribute --instance-id i-0x --groups $ISO_SG
aws ec2 modify-instance-attribute --instance-id i-0x --disable-api-termination

# ── Evidence ────────────────────────────────────────────────────
aws ec2 create-snapshots --instance-specification InstanceId=i-0x,ExcludeBootVolume=false \
  --tag-specifications 'ResourceType=snapshot,Tags=[{Key=IR-Case,Value=INC-0042}]'
aws ssm send-command --instance-ids i-0x --document-name "AWS-RunShellScript" \
  --parameters 'commands=["avml /tmp/mem.lime","aws s3 cp /tmp/mem.lime s3://forensic/INC-0042/"]'
aws ec2 copy-snapshot --source-snapshot-id snap-0x --encrypted \
  --kms-key-id <forensic-cmk> --source-region ap-northeast-2
aws ec2 modify-snapshot-attribute --snapshot-id snap-0copy \
  --attribute createVolumePermission --operation-type add --user-ids 444455556666

# ── Credentials ─────────────────────────────────────────────────
aws iam update-access-key --user-name u --access-key-id AKIA... --status Inactive
aws iam get-access-key-last-used --access-key-id AKIA...
aws iam delete-login-profile --user-name u
aws ec2 disassociate-iam-instance-profile --association-id iip-assoc-0x
aws iam put-role-policy --role-name r --policy-name AWSRevokeOlderSessions \
  --policy-document file://revoke-sessions.json

# ── Investigation ───────────────────────────────────────────────
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIA... --start-time <t>
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=StopLogging
aws accessanalyzer list-findings --analyzer-arn <arn> \
  --filter '{"status":{"eq":["ACTIVE"]}}'

# ── Automation ──────────────────────────────────────────────────
aws ssm start-automation-execution --document-name IsolateCompromisedInstance \
  --parameters '{"InstanceId":["i-0x"],"IsolationSgId":["sg-iso"]}'
aws ssm describe-automation-step-executions --automation-execution-id <id> --output table
aws guardduty create-sample-findings --detector-id <id> \
  --finding-types "UnauthorizedAccess:EC2/MaliciousIPCaller.Custom"
```

## Policy Snippet Cheat Sheet

```json
// (1) Revoke all existing sessions (role inline policy)
{ "Effect": "Deny", "Action": "*", "Resource": "*",
  "Condition": { "DateLessThan": { "aws:TokenIssueTime": "2026-06-24T10:00:00Z" } } }
```

```json
// (2) Block new issuance for the compromised role (replace the trust policy with a Deny)
{ "Version": "2012-10-17",
  "Statement": [{ "Effect": "Deny", "Principal": { "Service": "ec2.amazonaws.com" },
                  "Action": "sts:AssumeRole" }] }
```

```json
// (3) Structurally remove irreversible actions from the automation role
{ "Sid": "NeverTerminate", "Effect": "Deny",
  "Action": ["ec2:TerminateInstances","ec2:StopInstances","ec2:DeleteSnapshot","s3:DeleteObject"],
  "Resource": "*" }
```

```json
// (4) Cross-account IR role trust policy: narrow it to a role, not an account
{ "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::222233334444:role/IR-Orchestrator-Lambda" },
  "Action": "sts:AssumeRole",
  "Condition": { "StringEquals": { "sts:ExternalId": "<secrets-manager-value>" } } }
```

```json
// (5) SCP to lock down root in member accounts (note: it does not apply to the management account)
{ "Sid": "DenyMemberRoot", "Effect": "Deny", "Action": "*", "Resource": "*",
  "Condition": { "StringLike": { "aws:PrincipalArn": "arn:aws:iam::*:root" } } }
```

```json
// (6) Automatic response trigger (single Security Hub entry point, unprocessed findings only)
{ "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": { "findings": { "Severity": { "Label": ["HIGH","CRITICAL"] },
                            "Workflow": { "Status": ["NEW"] },
                            "RecordState": ["ACTIVE"] } } }
```

## Week 10 on a Single Page

```
[Prepare]  org CloudTrail · log archive account · forensic account · isolation SG/subnet
           IR response role (pre-deployed to all accounts) · break-glass · runbooks · game day
           │  ← without these, every stage below fails at execution time
           ▼
[Detect]   GuardDuty (behavior) · Config (state) · Macie (data) · Inspector (vulnerabilities)
           │  all normalized and aggregated into Security Hub (ASFF)
           ▼
[Triage]   three severity questions: did data leave / is there persistence / is the control plane compromised
           │  any "yes" → raise severity, start escalation
           ▼
[Route]    EventBridge (pattern filter + InputTransformer) ── SNS ─▶ human (keeps situational awareness)
           │                                    │
           ▼                                    ▼
[Execute]  SSM Automation (standard·audit·approval)     Lambda (branching·external integration·cross-account)
           │
   ┌───────┼────────────────────────────────────────────┐
   ▼       ▼                    ▼                       ▼
 Preserve  Short-term           Credential              Irreversible
 evidence  containment          revocation              actions
 (snapshot (isolation SG ·      (key Inactive /         (terminate · delete)
  · memory) ASG detach)         TokenIssueTime Deny /   → aws:approve gate
   │                            profile detach)
   ▼
[Investigate]  CloudTrail/Athena full trace → backdoor hunting → recursive investigation of secondary entities → Detective
           │
           ▼
[Eradicate·Recover]  remove backdoors · redeploy patched golden AMI · lift long-term containment · gradual return
           │
           ▼
[Post-incident]  timeline reconstruction · MTTD/MTTR/dwell time · regulatory notification · runbook improvement
           └──────────────────── feeds back into Prepare ────────────────────┘
```

## Visibility and Operations: Measuring and Improving Response

Response is *proven and improved through metrics*.
- **MTTD (mean time to detect)**: shortened with GuardDuty/Security Hub detection controls.
- **MTTR (mean time to respond)**: dramatically shortened with the automated response pipeline (EventBridge + SSM).
- **Dwell time**: shortened by combining detection and response.

Track these metrics in the post-incident phase to find the *bottleneck phase* and invest automation and controls there. Every response action is recorded in CloudTrail, serving as audit and legal evidence, and is investigated afterwards with Detective. IR is inseparable not only from technical containment (the security team) but also from the organizational response of legal, public relations, and executives (breach notification obligations, etc.).

Response maturity is decided not by "did you block it" but by whether you respond *consistently, quickly, and provably* and *improve yourself* from that experience. Reduce MTTR through automation (Day 1), protect evidence integrity (Day 2), neutralize precisely by type (Day 3), and make the NIST phases and the automation/human boundary clear (Day 4). Turning on controls is only the start; the *cycle of learning from incidents and strengthening the preparation phase* is the core of incident response. This leads into the next topic (governance and compliance).

Lining up, one line each, how the concepts of this week went wrong in real incidents makes them stick longer. **Code Spaces (2014)**: while the operator fought for control with the attacker holding AWS console access, even *the backups that were in the same account* as the resources were deleted, and the company shut down. -> Revoking credentials must be the first means of containment, and evidence and backups must live outside the account boundary. **Capital One (2019)**: SSRF reached the IMDS, temporary credentials of the instance role were obtained, and data was exfiltrated; the company became aware only through an outside tip. -> Instance isolation and credential revocation are separate, IMDSv2 and hop limit are preparation items rather than response, and without your own detection loop even awareness comes late. **Uber (2016-2017)**: credentials in a private repository became the leak path, and afterwards **the way the company handled the incident itself**, trying to deal with it without disclosure, grew into a bigger legal problem. -> The remedy is not tightening repository permissions but not keeping secrets in the repository, and the post-incident phase of IR contains not technology but notification, legal, and governance. **Equifax (2017)**: entry came through a missed patch, and a traffic-inspection device had an expired certificate and was left that way, so detection did not work for a long time. -> A control must be confirmed as "working now," not merely "installed." The four incidents map exactly onto this week's four pillars: **containment order / credentials / post-incident response / control survival**.

## How to Read the Choices: Five Patterns That Produce Wrong Answers

An exam question usually consists of one correct answer and *three plausible wrong ones*, and the wrong answers this week follow a narrow set of patterns. Knowing the patterns changes how fast you read the choices.

1. **Flip the order by one step.** "Terminate -> snapshot," "recover -> eradicate," "delete -> trace": they swap cause and effect, or irreversible and reversible. -> *If an action that destroys evidence comes first, discard that choice.*
2. **Act on only one side and stop.** It says only "isolate the instance" with no credential revocation, or only "deactivate the key" with no tracing or eradication. -> *A choice with containment but no tracing or eradication is usually wrong.*
3. **Demand enforcement from a means with no enforcement power.** "Block with a detection-only tool," "restrict root with an IAM policy," "enforce through training." -> *If the verb in the requirement is block, choose a preventive control (SCP, policy Deny).*
4. **Get the scope wrong.** "Protect everything with one rule in one Region," "a person checks each account in the console." -> *For multiple accounts and Regions, Security Hub aggregation and consistent IaC deployment are the answer.*
5. **Offer an extreme.** "Automate everything," "do everything manually," "turn off detection," "delete all users." -> *Extreme statements are usually wrong.* Most correct answers this week take the form of **drawing a boundary**, such as "automate what is reversible, require approval for what is irreversible."

If we add a sixth, **choices saying "AWS takes care of it"** (waiting for an automatic isolation policy, the support team handles it) are always wrong in this domain, because under the shared responsibility model credentials, configuration, and data are the customer's domain.

## Pitfall Summary

- Immediately terminating or stopping the compromised instance, destroying memory and instance store evidence.
- Isolating without detaching from the ASG/target group, so health-check failure makes the ASG terminate the instance.
- Not removing the **default outbound allow rule** of the newly created isolation SG, so exfiltration continues.
- Leaving a secondary ENI behind, opening a hole in the isolation.
- Blocking all outbound traffic, cutting even the SSM path and making a memory dump impossible.
- Isolating only the instance and not revoking the leaked STS token.
- Doing only the `TokenIssueTime` Deny and missing the block on new issuance (profile detach, trust policy).
- Deleting the exposed key before tracing, losing the `accessKeyId` lookup axis.
- Not running the investigation one more round using the attacker's secondary credentials as the axis.
- Not reading *gaps* in the logs (StopLogging, DeleteTrail) as signals.
- Trying to restrict root with IAM policies or SCPs: SCPs do not apply to management account principals.
- Keeping evidence and backups only inside an account that could be compromised.
- Trying to share a snapshot encrypted with an AWS managed key directly with another account.
- Recovering without eradication and being re-compromised through a backdoor; recovering from a compromised image and bringing the backdoor back too.
- Fully automating every action so a false positive halts production.
- An approval gate with no timeout or escalation, so response stops when no approver is available.
- Automation not notifying people of what it did, so situational awareness disappears.
- No DLQ or failure alarm, so nobody notices that the automation has silently died.
- Believing a runbook that has never been executed is ready.
- Doing only technical containment and not putting notification and legal paths in the playbook.
- Skipping post-incident activity so lessons never feed back into the preparation phase.

## Summary

- [ ] Can you map the four NIST phases (prepare -> detect/analyze -> contain/eradicate/recover -> post-incident) onto an incident?
- [ ] Can you explain, in your own words, the "what to do first" for each situation and **its reasoning**?
- [ ] Do you place actions that destroy evidence later and reversible actions earlier?
- [ ] Do you cut off the cause of spread (the original credential, the logging stop) before the effect (the new user, the instance)?
- [ ] Do you remember to remove the isolation SG's default outbound rule and to detach from the ASG?
- [ ] Do you perform invalidating existing sessions and blocking new issuance as a pair?
- [ ] Do you distinguish the detection and investigation services (GuardDuty/Config/CloudTrail/Detective/Macie) by the question each answers?
- [ ] Can you filter out the five wrong-answer patterns (order flip, half measure, means without enforcement, wrong scope, extremes)?
- [ ] Do you contain by isolation (keeping the instance running) and preserve evidence (snapshot, memory) in parallel or first?
- [ ] Do you distinguish neutralization by credential type (key Inactive / STS TokenIssueTime Deny / root reset)?
- [ ] After neutralizing, do you trace activity and backdoors with CloudTrail/Athena/Detective and eradicate them?
- [ ] Do you buy time with automated containment, and put a human in with `aws:approve` for irreversible, high-impact actions?
- [ ] Do you distinguish runbook (procedure) from playbook (decision) and apply graduated automation?
- [ ] Do you protect evidence integrity (separate account, Object Lock, CloudTrail)?
- [ ] Do you measure with MTTD/MTTR/dwell time and feed lessons back into the preparation phase?

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
