# Day 5 - Week 7 Integration: Audit Trail Scenario Review

This week covered "the ability to reconstruct truth after the fact" — audit trails. Four pillars: **CloudTrail** (activity: who did what), **AWS Config** (configuration: resource state at each point), **VPC Flow Logs and Resolver query logs** (network: what traffic/DNS flowed), and **integrity, retention, centralization** (storing evidence trustworthily). Today we weave these pieces into *one breach investigation*.

## Five Pillars at a Glance

| Tool | Answers | Enabled by Default | Core Pitfall |
|------|---------|-------------------|--------------|
| CloudTrail management events | Who called control-plane API | Yes (Event history 90 days) | Long retention needs trail |
| CloudTrail data events | Who accessed object/function | **No** | Selector add-on, cost |
| CloudTrail Lake | SQL query without code | No | Max 10 years, separate cost |
| AWS Config | Resource state, history, relationships | No (per-region) | Recorder per region |
| VPC Flow Logs | IP traffic metadata | No | No payload, pkt-srcaddr for NAT |
| Resolver query log | VPC-internal DNS queries | No | Resolver bypass risk |

## Data vs Management Events: Don't Confuse to the End

Most frequent exam pitfall. Memorize this:

| Action | Event Type | Logged by Default? |
|--------|-----------|-------------------|
| `RunInstances`, `CreateBucket`, `AttachRolePolicy` | Management | Yes |
| `ConsoleLogin`, `AssumeRole` | Management | Yes |
| S3 `GetObject`/`PutObject`/`DeleteObject` | Data | **No** |
| Lambda `Invoke` | Data | **No** |
| DynamoDB `PutItem`/`GetItem` | Data | **No** |

> ⚠️ **Pitfall Recap**: "Who *created bucket*" = management event (logged). "Who *downloaded bucket object*" = data event (selector needed). This one sentence solves half the trap questions.

## Preventive vs Detective vs Responsive: Control Layer Mapping

Week 7 tools sorted by security control classification:

- **Preventive**: SCP, IAM policy, security groups/NACL, Object Lock, KMS key policy — *block before happening*.
- **Detective**: CloudTrail, Config rules (evaluations), Flow Logs, Resolver logs, GuardDuty — *find what happened*.
- **Responsive**: Config auto-remediation (SSM Automation), EventBridge→Lambda, SNS alerts — *undo or notify*.

> 💡 **Related Theory**: Exams often ask "preventive or detective." Hint: *timing*. "Block S3 public creation" = SCP/Block Public Access (preventive), "create then auto-revert" = Config rule + remediation (detective+responsive). They are not mutually exclusive; *layering* both is best practice — preventive failing means detective+responsive catches it.

## Integrated Scenario 1: S3 Data Exfiltration Breach Investigation

> **Situation**: Security team receives report of data exfiltration. Investigate.

Investigation flow and tool roles:

1. **What was accessed, by whom** → CloudTrail **data events** (S3 `GetObject`) show `userIdentity.arn`, `sourceIPAddress`, MFA status accessing objects. (Prerequisite: data event selector was pre-enabled for evidence to exist.)
2. **How was that credential obtained** → CloudTrail **management events** trace `AssumeRole`, `ConsoleLogin`, suspicious permission grants (`AttachRolePolicy`).
3. **When was bucket exposed** → **Config** configuration timeline shows when bucket policy/Block Public Access settings changed.
4. **Where did data actually go** → VPC **Flow Logs** (egress volume, `pkt-srcaddr` identifying original instance, destination IP).
5. **What domain/C2 contacted** → **Resolver query logs** correlate suspicious domain queries.
6. **Can we trust this evidence** → Logs protected via separate account + Object Lock + integrity validation (tampering ruled out).

> 🎯 **Scenario Point**: No single tool completes the picture. CloudTrail (who/how) + Config (when exposed) + Flow Logs (how much egressed) + Resolver (where to) *cross-correlated* complete the timeline. This correlation requires day 4's *centralization*.

## Integrated Scenario 2: Security Group Misconfiguration Trace

> **Situation**: 0.0.0.0/0:3389 (RDP) suddenly open in operations. Who, when, why?

- **Config**: Configuration timeline exactly *when* inbound rule added, CI before/after comparison.
- **CloudTrail**: Same time `AuthorizeSecurityGroupIngress` caller, source IP, session.
- **Config Rule**: `restricted-ssh`/`restricted-common-ports` managed rule should've caught this `NON_COMPLIANT`. If not caught, rule not deployed.
- **Auto-remediation**: Future prevention via SSM Automation dangerously-open rules in conformance pack.

> 💡 **Related Theory**: Config shows *state and time* ("3389 was open starting 14:02"), CloudTrail shows *action and actor* ("Alice's role added that rule at 14:02"). Their combination is audit essence — connecting *state changes* to *causing actions*.

## Integrated Scenario 3: Building Tamper-Proof Central Audit Baseline

> **Situation**: 300-account organization: build audit "undeletable by any admin, root cannot delete, security-only read."

Correct architecture (Week 7 complete integration):
1. Management account **organization trail** (multi-region, all management events + needed data events) → member accounts cannot disable.
2. Logs to **separate logging account** S3 (bucket policy: `aws:SourceOrgID` + `bucket-owner-full-control`).
3. Bucket: **Object Lock Compliance** (retention period) + versioning + **SSE-KMS** (dedicated CMK, key policy limits decryption principals).
4. **Log file integrity validation** enabled for tampering proof.
5. **Organization conformance pack** (encryption, public access block rules) deployed uniformly + auto-remediation.
6. **EventBridge** immediate alerts on `StopLogging`/`DeleteTrail`.

> 🔍 **Deeper Dive**: This baseline is what AWS **Control Tower** automates (Log Archive account + guard rails). For "build audit baseline *from scratch*," manual assembly above; for "already-structured," Control Tower. Either way, components (org trail, logging account, Object Lock, KMS, conformance pack) are identical. Week 7's every piece integrates here — auditing/monitoring foundation. Next week's threat detection (GuardDuty, Security Hub, Detective) layers *automatic analysis atop this foundation*. Centralization is prerequisite.

## Final Checklist

- [ ] Management vs data events (S3 object, Lambda invoke = data)
- [ ] CloudTrail Lake = no-code SQL, max 10 years
- [ ] Integrity validation = SHA-256 hash chain + RSA signed digest (proves tampering)
- [ ] Config = state/history/relationships, per-region recorder, custom = Lambda/Guard
- [ ] Conformance Pack = rules+remediation bundle, organization deployment
- [ ] Auto-remediation = SSM Automation, loop/downtime risk
- [ ] Flow Logs = metadata (no payload), pkt-srcaddr for NAT tracking
- [ ] Resolver query log = DNS visibility, bypass risk, DNS Firewall blocks
- [ ] Object Lock Compliance = root cannot delete (preventive)
- [ ] Separate logging account + KMS split = isolation + cryptographic access control

---

## 📝 Practice Questions

**Question 1.** While investigating an S3 data exfiltration breach, you cannot find in CloudTrail which credentials downloaded the sensitive objects. What was missing in advance?

A) Log file integrity validation  
B) An S3 object-level data event selector on the trail  
C) Config recorder  
D) Resolver query logging  

**Answer: B**  
Explanation: S3 `GetObject` is a data event that is not recorded by default, so an S3 data event selector (or advanced event selector) must have been turned on for the trail in advance to trace who downloaded. Integrity validation is for tamper proof, Config is configuration state, and Resolver logs are DNS, so none of them helps trace who accessed objects. Data events are not recorded retroactively, so enabling them in advance is the key.

---

**Question 2.** What type of control is each of the following: "*deny the creation itself* of public S3 buckets" and "*automatically revert a public bucket when it is created*"?

A) Both are preventive controls  
B) The former is preventive (SCP/Block Public Access), the latter is detect and respond (Config rule + automatic remediation)  
C) The former is responsive, the latter is preventive  
D) Both are detective controls  

**Answer: B**  
Explanation: The timing is the clue. "Deny the creation itself" is a preventive control (SCP, S3 Block Public Access) that blocks the action before it happens, while "revert it when it is created" is detect and respond: detecting the violation that occurred (Config rule) and reverting it with automatic remediation (SSM Automation). The two are not mutually exclusive, and using them together in layers is the best practice.

---

**Question 3.** Which service do you use to determine *when* a security group had 0.0.0.0/0:3389 opened and *which API caller* made that change?

A) The time from CloudTrail, the caller from Config  
B) The time from the AWS Config configuration timeline, the caller from the `AuthorizeSecurityGroupIngress` event in CloudTrail  
C) Both from VPC Flow Logs  
D) Both from Resolver query logs  

**Answer: B**  
Explanation: Config shows *when* the rule was added (the point of state change) through the resource's configuration item (CI) timeline, and CloudTrail shows *who/from where* made the change (the action and principal) from the `AuthorizeSecurityGroupIngress` call at the same moment. The key is the division of roles: state change is Config, causal action is CloudTrail. Flow Logs and Resolver are traffic/DNS and are unrelated to tracking configuration changes.

---

**Question 4.** In a 300-account organization, you want to build an audit log foundation yourself that "member administrators cannot turn off, even root cannot delete within the retention period, and only the security team can read." What is the correct combination of components?

A) Individual trails in each account + sharing a single KMS key  
B) Organization trail (multi-Region) → S3 in a separate logging account (Object Lock Compliance + SSE-KMS with separated key policy + SourceOrgID bucket policy) + integrity validation  
C) Event history 90 days + versioning  
D) CloudWatch Logs only + Governance mode Object Lock  

**Answer: B**  
Explanation: An organization trail cannot be turned off by member administrators, a separate logging account isolates the logs from operational compromise, Object Lock Compliance makes deletion impossible even for root within the retention period, separating the SSE-KMS key policy limits the decrypting principals to the security team, a SourceOrgID bucket policy prevents confused deputy, and integrity validation proves tampering. Individual trails lack consistency and enforceability, Event history covers 90 days and cannot be exported, and Governance mode can be bypassed by privileged users, so it fails the "not even root" requirement.

---

**Question 5.** In a breach investigation, you want to build a complete picture of "the infected EC2 instance communicated with an external C2 server, and through which domain it connected." *Correlation analysis* of which logs is needed?

A) CloudTrail management events alone are sufficient  
B) Correlate VPC Flow Logs (egress volume, destination IP, pkt-srcaddr) with Route 53 Resolver query logs (looked-up domains) by time  
C) Only the Config configuration timeline  
D) Only S3 data events  

**Answer: B**  
Explanation: Flow Logs show which instance egressed how much to which IP (pkt-srcaddr identifies the original source behind NAT), and Resolver query logs show which domain that instance looked up to obtain that IP. Correlating the two by time adds domain context to communication that is ambiguous from IPs alone, completing the full picture of the C2 communication. CloudTrail, Config, and S3 events cannot directly reveal communication paths at the network or DNS level.

---
