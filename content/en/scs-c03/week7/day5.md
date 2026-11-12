# Day 5 - Week 7 Integration: Audit Trail Scenario Review

This week covered "the ability to reconstruct the truth after the fact" - audit trails. We built four pillars: **CloudTrail** (activity: who did what), **AWS Config** (configuration: what state a resource was in at each point in time), **VPC Flow Logs and Resolver query logs** (network: what traffic and DNS flowed), and **integrity, retention, and centralization** (how to store this evidence so it can be trusted). Today we weave these pieces together as scenarios to show how they interlock in *a single breach investigation*.

There is one statistical fact that has long been cited in the incident response industry. The gap between when a breach actually occurs and when it is discovered - the so-called **dwell time** - is still measured in tens of days. And in a considerable share of cases, the trigger for discovery is not detection inside the organization but external notification (customers, law enforcement, security researchers). Overlay these two facts and you get the real requirement for audit logs. **Discovery happens months later, and all we have at that point is the logs accumulated in the meantime.** So every design decision this week - turning on data events in advance, setting a long retention period, isolating logs in a separate account - must be judged not by "is it useful today" but by "will it be useful three months from now, when we must start an investigation with no preparation."

## The Five Pillars at a Glance

| Tool | Question it answers | Enabled by default | Key pitfall |
|------|------------|-----------|----------|
| CloudTrail management events | Who called control-plane APIs | Yes (Event history 90 days) | Long-term retention needs a trail |
| CloudTrail data events | Who accessed objects/functions | **No** | Selectors must be added; cost |
| CloudTrail Lake | Investigate with SQL, no code | No | Up to 10 years, separate cost model |
| AWS Config | Resource state, history, relationships | No (per Region) | A recorder in every Region |
| VPC Flow Logs | IP traffic metadata | No | No payload, pkt-srcaddr behind NAT |
| Resolver query logs | DNS lookups inside the VPC | No | Missed if the Resolver is bypassed |

### Questions Each Tool Cannot Answer

Half of the ability to pick the right answer is the ability to eliminate wrong ones. And wrong answers are usually "that tool attached to a question it cannot answer."

| Question | Tool that answers | Wrong option and why |
|------|------------|---------------------------|
| Who opened this security group | CloudTrail | Config - knows the state but not the actor |
| For how many days was it open | Config | CloudTrail - has points but no interval |
| Which objects were actually downloaded | CloudTrail **data events** | Management events - object access is not recorded |
| How much data went out | VPC Flow Logs | CloudTrail - does not know byte counts |
| What was inside the packets | Traffic Mirroring | Flow Logs - metadata only |
| Which domain was connected to | Resolver query logs | Flow Logs - only IPs, no names |
| Did the instance take credentials from the metadata service | (Not left in the Flow Log) | Flow Logs - link-local communication is excluded from recording |
| Was this log tampered with | Integrity validation (digest) | Versioning - only history, not proof |
| To stop such resources from being created going forward | SCP, BPA (prevention) | Config remediation - only reverses after creation |

The seventh row is especially useful on exams. An attack that steals role credentials from the metadata service via SSRF **leaves no trace in network logs**, and CloudTrail holds only normal-looking records saying "that role called APIs normally." The only place where the anomaly shows up in this combination is *where the role was used*. If the credentials of an EC2 instance profile role were used from an external IP rather than from that instance, that is the one decisive signal.

### Which Log to Open for Which Question

```
                        "What happened?"
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   Control plane question   State question          Data flow question
   "Who called it"         "What was the config"   "What went back and forth"
        │                       │                       │
   CloudTrail              AWS Config              VPC Flow Logs
   management events       configuration timeline  + Resolver query logs
        │                       │                       │
        ├─ Object/function      ├─ Relationships        ├─ Domain context?
        │  access?              │  between resources?   │  → Resolver log
        │  → data events        │  → relationships      │
        │                       │                       │
        ├─ Failed attempts?     ├─ Violation?           ├─ Source instance?
        │  → errorCode          │  → Config Rule        │  → pkt-srcaddr
        │                       │                       │
        └─ Abnormal surge?      └─ Whole organization?  └─ Path it left by?
           → Insights              → Aggregator            → traffic-path

   ── And the premise of every branch:
      "Was that log turned on, not deleted, and not tampered with?"
      → organization trail · separate logging account · Object Lock · integrity validation
```

## Data Events vs. Management Events: Never Get Them Confused

This is an easy pitfall. Distinguish them with the following table:

| Operation | Event type | Recorded by default? |
|------|-----------|-----------|
| `RunInstances`, `CreateBucket`, `AttachRolePolicy` | Management | Yes |
| `ConsoleLogin`, `AssumeRole` | Management | Yes |
| S3 `GetObject`/`PutObject`/`DeleteObject` | Data | **No** |
| Lambda `Invoke` | Data | **No** |
| DynamoDB `PutItem`/`GetItem` | Data | **No** |

> ⚠️ **Pitfall reconfirmed**: "Who *created the bucket*" is a management event (recorded by default). "Who *downloaded an object in the bucket*" is a data event (needs a selector). This one sentence can solve many pitfall questions.

## Prevention vs. Detection vs. Response: Mapping the Control Layers

Organizing the Week 7 tools by security control category makes the answers clear:

- **Preventive**: SCPs, IAM policies, security groups/NACLs, Object Lock, KMS key policies - *block it in the first place*.
- **Detective**: CloudTrail, Config rules (evaluation), Flow Logs, Resolver logs, GuardDuty - *find what happened*.
- **Responsive**: Config auto-remediation (SSM Automation), EventBridge→Lambda, SNS alarms - *reverse it or notify*.

Exams often ask you to choose between "prevention or detection." For example, "*prevent* public S3 buckets" could be SCP/Block Public Access (prevention) or a Config rule + remediation (detection and response). The key clue is *timing* - if it says "deny creation itself," it is prevention (SCP); if it says "reverse it once created," it is detection + response (Config remediation). The two are not mutually exclusive, and using them *together in layers* is the best practice. Detection backs up prevention for when prevention fails, and automatic response backs up detection.

## Integrated Scenario 1: Investigating an S3 Data Exfiltration Breach

> **Situation**: The security team receives a report that sensitive data was leaked externally. It must investigate.

The investigation flow and the role of each tool:

1. **What was accessed, and by whom** → In CloudTrail **data events** (S3 `GetObject`), check the `userIdentity.arn`, `sourceIPAddress`, and MFA status for whoever accessed that object. (However, the data event selector must have been turned on beforehand for the evidence to exist.)
2. **How were those credentials obtained** → In CloudTrail **management events**, trace `AssumeRole`, `ConsoleLogin`, and abnormal permission grants (`AttachRolePolicy`).
3. **Since when was the bucket exposed** → In the AWS **Config** configuration timeline, check when the bucket policy and Block Public Access settings changed.
4. **Where did the data actually go** → VPC **Flow Logs** (egress volume, source instance via `pkt-srcaddr`, destination IP).
5. **Which domain/C2 did it communicate with** → Correlate suspicious domain lookups in the **Resolver query logs**.
6. **Can this evidence be trusted** → Check that the logs were protected by a separate account + Object Lock + integrity validation (rule out the possibility of tampering).

> 🎯 **Scenario point**: No single tool can draw the picture. The timeline is complete only by *cross-referencing* CloudTrail (who/how) + Config (since when exposed) + Flow Logs (how much went out) + Resolver (to where). The premise that makes this correlation analysis possible is Day 4's *central aggregation*.

### What Real Evidence Looks Like

If it is only explained in words, you freeze when you see a log fragment in the exam room. Here we paste in what the six steps above look like in real logs.

**Step 1 - Who read the object** (CloudTrail data event)

```json
{
  "eventTime": "2026-06-24T08:31:10Z",
  "eventSource": "s3.amazonaws.com",
  "eventName": "GetObject",
  "sourceIPAddress": "203.0.113.10",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc",
    "accessKeyId": "ASIAEXAMPLEKEY",
    "sessionContext": {
      "sessionIssuer": { "arn": "arn:aws:iam::111122223333:role/AppRole" },
      "attributes": { "creationDate": "2026-06-24T08:14:22Z", "mfaAuthenticated": "false" }
    }
  },
  "resources": [{ "type": "AWS::S3::Object",
                  "ARN": "arn:aws:s3:::corp-sensitive/payroll.csv" }],
  "eventCategory": "Data"
}
```

Your eyes should stop at `sourceIPAddress`. A session name of `i-0abc` means these credentials came from an **EC2 instance profile**, yet the call came not from that instance's private IP but from an external IP. **The instance role's credentials are being used outside the instance** - this one line is effectively a confirmed-breach signal.

**Step 2 - How was that session created** (CloudTrail management event, traced back via `creationDate`)

```sql
SELECT eventtime, eventname, sourceipaddress, useridentity.type,
       json_extract_scalar(requestparameters, '$.roleSessionName') AS session_name
FROM cloudtrail_logs
WHERE eventname = 'AssumeRole'
  AND eventtime BETWEEN '2026-06-24T08:14:00Z' AND '2026-06-24T08:15:00Z';
```

**Step 3 - Since when was the bucket exposed** (Config configuration timeline)

```bash
aws configservice get-resource-config-history \
  --resource-type AWS::S3::Bucket --resource-id corp-sensitive \
  --query 'configurationItems[].{t:configurationItemCaptureTime,e:relatedEvents}'
```

Remember that the bucket policy and public access block settings are held in the CI's `supplementaryConfiguration`. And through each item's `relatedEvents` you can jump straight to the CloudTrail event that made that change.

**Step 4 - How much actually went out** (VPC Flow Logs)

```
2 111122223333 eni-0abc 10.0.1.20 198.51.100.66 51234 443 6 4210 6291456 1719218400 1719218460 ACCEPT OK
```

Looking at one line it is 6 MB, but that is the value for a 60-second aggregation interval. You must sum over the whole period.

```sql
SELECT pkt_srcaddr, dstaddr, sum(bytes) AS total_bytes,
       min(from_unixtime(start)) AS first_seen,
       max(from_unixtime("end"))  AS last_seen
FROM vpc_flow_logs
WHERE flow_direction = 'egress' AND action = 'ACCEPT'
  AND pkt_srcaddr = '10.0.1.20'
  AND date = '2026-06-24'
GROUP BY pkt_srcaddr, dstaddr
ORDER BY total_bytes DESC;
```

**Step 5 - What was that IP** (Resolver query log)

```json
{
  "query_timestamp": "2026-06-24T08:29:55Z",
  "query_name": "malicious-c2.example.",
  "query_type": "A",
  "rcode": "NOERROR",
  "answers": [{ "Rdata": "198.51.100.66", "Type": "A" }],
  "srcaddr": "10.0.1.20",
  "srcids": { "instance": "i-0def456" }
}
```

The destination IP in the Flow Log and the response IP in the Resolver log **match**, and the timestamps differ by 9 seconds. At this moment "a large transfer to an unknown IP" is confirmed as "exfiltration to a known C2 domain."

**Step 6 - Can this evidence be trusted**

```bash
aws cloudtrail validate-logs \
  --trail-arn arn:aws:cloudtrail:ap-northeast-2:111122223333:trail/org-audit-trail \
  --start-time 2026-06-24T00:00:00Z --end-time 2026-06-25T00:00:00Z
```

The six steps above are in fact the classic procedure of digital forensics - *collect → verify → analyze → reconstruct* - moved onto cloud services. A surprising number of investigations skip the second (verification), which is fatal when the matter leads to legal proceedings. If the other side asks "what is your basis that those logs were not manipulated?", the whole analysis wobbles without hash chain validation results. **The reliability of an analysis is determined by its weakest link, and that link is usually the integrity of the evidence.** That is why, in practical runbooks, `validate-logs` is placed not at the end of the investigation but as a command run *before analysis begins*.

> ⚠️ **Pitfall**: For this entire scenario to hold, data events, the Config recorder, Flow Logs, and Resolver query logs must all have been turned on **before the incident**. When an exam text begins with "investigate," you reflexively pick tools, but what is actually presented as the correct answer is "it cannot be answered because those logs were not turned on / turn them on now for the future." There is a reason the principle that logging is not applied retroactively was repeated three times this week.

## Integrated Scenario 2: Tracing a Security Group Misconfiguration

> **Situation**: In production, 0.0.0.0/0:3389 (RDP) is suddenly open. Who, when, and why?

- **Config**: From the security group's configuration timeline, find exactly *when* the inbound rule was added, and compare the CIs before and after.
- **CloudTrail**: The caller, source IP, and session of the `AuthorizeSecurityGroupIngress` call at the same time.
- **Config Rule**: A managed rule such as `restricted-ssh`/`restricted-common-ports` should have caught this violation as `NON_COMPLIANT`. If it did not, the rule was not deployed.
- **Auto-remediation**: To handle future recurrences, link remediation in the conformance pack so that SSM Automation automatically revokes the risky rule.

Config answers *state and time* ("3389 was open, since 14:02"), and CloudTrail answers *action and actor* ("Alice's role added that rule at 14:02"). The combination of the two is the essence of auditing - linking a *state change* to *the action that caused it*.

## Integrated Scenario 3: Building a Tamper-Proof Central Audit Baseline

> **Situation**: In a 300-account organization, you must establish an audit foundation that "no administrator can turn off, even root cannot delete, and only the security team reads."

The correct architecture (a synthesis of all of Week 7):
1. In the management account, create an **organization trail** (multi-Region, all management events + the necessary data events) → member accounts cannot turn it off.
2. Aggregate logs into an S3 bucket in a **separate logging account** (bucket policy: `aws:SourceOrgID` + `bucket-owner-full-control`).
3. On the bucket, apply **Object Lock Compliance** (retention period) + versioning + **SSE-KMS** (a dedicated CMK, with the key policy restricting who can decrypt).
4. Enable **log file integrity validation** to prove tampering.
5. Deploy Config rules (encryption, public blocking, etc.) in bulk with an **organization conformance pack** + auto-remediation.
6. Alert immediately on `StopLogging`/`DeleteTrail` with **EventBridge**.

This baseline is exactly what AWS **Control Tower**'s Log Archive account + guardrails automate. On the exam, if it says "set up a multi-account audit and compliance foundation *from scratch* to the standard," the answer is Control Tower; if it says "configure it directly in an existing environment," the answer is the manual assembly above. Either way the components (org trail, logging account, Object Lock, KMS, conformance pack) are the same. All the pieces learned in Week 7 combine into one here - this is the foundation of "security logging and monitoring," and next week's threat detection (GuardDuty, Security Hub, Detective) is the stage that layers automated analysis *on top of this foundation*.

```
[ All of Week 7 on one page ]

  ┌─ Prevent ─────────────────────────────────────────────────┐
  │ SCP (forbid disabling logging) · Block Public Access · KMS key policy │
  │ Object Lock Compliance · IMDSv2 enforcement               │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ Collect ──────────────┴──────────────────────────────────┐
  │ CloudTrail mgmt/data/Insights  │ Config CIs · rules       │
  │ VPC Flow Logs (custom format)  │ Resolver query logs      │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ Store ────────────────┴──────────────────────────────────┐
  │ Log archive account S3                                    │
  │  ├ Bucket policy: SourceArn/SourceOrgID + bucket-owner-full │
  │  ├ Versioning + Object Lock (Compliance)                  │
  │  ├ SSE-KMS dedicated CMK (ViaService + encryption context)│
  │  └ Protect the log and digest prefixes identically        │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ Verify ───────────────┴──────────────────────────────────┐
  │ CloudTrail digest hash chain + RSA signature (validate-logs) │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ Analyze ──────────────┴──────────────────────────────────┐
  │ Athena (partitions) · CloudTrail Lake · Config Advanced Query │
  │ Aggregator · (next week: GuardDuty · Security Hub · Detective) │
  └────────────────────────┬──────────────────────────────────┘
  ┌─ Respond ──────────────┴──────────────────────────────────┐
  │ EventBridge → SNS/Lambda · Config auto-remediation (SSM Automation) │
  └───────────────────────────────────────────────────────────┘
```

## Integrated Scenario 4: A Breach Started by a Leaked Access Key

> **Situation**: An external security researcher notifies you that "your access key is exposed in a public repository." The exposed key is `AKIAEXAMPLEKEY`. What do you do, and in what order?

The principle is to run **immediate action** and **investigation** separately. If you mix them, the action erases the evidence.

1. **Contain** - Deactivate the key (deactivate, not delete. If you delete it, context is reduced when you look up logs by key ID). A method that is also used is to attach an inline policy denying everything to the IAM user who holds that key, blocking it immediately.
2. **Determine scope** - Pull all of that key's activity from CloudTrail in chronological order.

```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=AccessKeyId,AttributeValue=AKIAEXAMPLEKEY \
  --query 'Events[].{t:EventTime,n:EventName}' --output table
```

```sql
-- Beyond 90 days, lookup-events no longer works and you must go to S3/Lake
SELECT eventtime, eventsource, eventname, sourceipaddress, errorcode,
       json_extract_scalar(requestparameters, '$.userName') AS target_user
FROM cloudtrail_logs
WHERE useridentity.accesskeyid = 'AKIAEXAMPLEKEY'
ORDER BY eventtime;
```

3. **Hunt for persistence** - Find the backdoors the attacker newly created. This is the step most often skipped.

```sql
SELECT eventtime, useridentity.arn, eventname, requestparameters
FROM cloudtrail_logs
WHERE eventname IN ('CreateUser', 'CreateAccessKey', 'CreateRole',
                    'AttachUserPolicy', 'AttachRolePolicy', 'PutUserPolicy',
                    'UpdateAssumeRolePolicy', 'CreateLoginProfile')
  AND eventtime >= '2026-06-24T00:00:00Z'
ORDER BY eventtime;
```

4. **Establish whether data was accessed** - If data events were on, record which objects were read; if they were not on, explicitly record "cannot be confirmed."
5. **Establish whether data was exfiltrated** - Check the egress volume with Flow Logs.
6. **Clean up** - Rotate every secret that key could access. Base this on the *fact of access*, and do not wait for *evidence of exfiltration*.

If you skip step 3, you block one key, close the incident, and are re-breached a few days later. The attacker's standard procedure is to assume that "the credentials obtained through initial access can be revoked at any time" and to **immediately create other means of persistence**. A new IAM user, adding their own account to the trust policy of an existing role, creating a console login profile, a Lambda function backdoor, and so on. So the last question in breach response is always "was what we blocked the only door?", and the answer comes only from the list of IAM write events in CloudTrail.

There will inevitably come a moment when containment and investigation collide - terminating an infected instance now stops the threat but erases memory and local evidence. The standard is to **isolate but not destroy**. Instead of terminating the instance, swap it to a security group that blocks all communication, take an EBS snapshot, and if necessary stop the instance but do not terminate it. Likewise, for credentials, deactivation takes priority over deletion. **"Stopping" and "erasing" are different, and in incident response, the act of erasing is almost always irreversible.**

## Integrated Scenario 5: Standing Before the Auditor

> **Situation**: An external auditor demands "prove that the audit logs for the past six months are complete and have not been tampered with."

There are three things to prove, and the supporting evidence for each is different.

| Auditor's question | What must be proven | Evidence to present |
|--------------|---------------|------------|
| "Was everything recorded?" | Completeness | Organization trail configuration (multi-Region, all accounts), `IsLogging=true`, no `LatestDeliveryError`, Config recorders in all Regions |
| "Can no one delete it?" | Immutability | Object Lock Compliance settings, Delete Deny in the bucket policy, logging account separation, SCP |
| "Has the content not changed?" | Integrity | `validate-logs` results - 0 invalid files, **0 files that could not be found** |

> 🎯 **Scenario point**: The bold part in the third row is often overlooked. Submitting only "validation passed" as audit evidence is insufficient. You must also present the fact that there is no unverified period, that is, **0 omissions**, for the proof to be complete. Integrity validation is a tool for showing that "what exists is genuine," and it does not automatically show that "nothing is missing." This distinction appears on exams as a "is integrity validation alone sufficient" type of pitfall - the answer is always "No, completeness and immutability are needed together."

## Wrap-Up Checklist

- [ ] Distinguish management events vs. data events (in particular, S3 objects and Lambda invoke are data)
- [ ] CloudTrail Lake = SQL investigation without code, up to 10 years
- [ ] Integrity validation = SHA-256 hash chain + RSA-signed digest (*proof* of tampering)
- [ ] Config = state, history, relationships; per-Region recorder; custom rules use Lambda/Guard
- [ ] Conformance Pack = bundle of rules + remediation, deployed organization-wide
- [ ] Auto-remediation = SSM Automation; beware of loop and interruption risks
- [ ] Flow Logs = metadata (no payload); trace behind NAT with pkt-srcaddr
- [ ] Resolver query logs = DNS visibility; beware of bypass; block with DNS Firewall
- [ ] Object Lock Compliance = not even root can delete (prevention)
- [ ] Separate logging account + KMS separation = isolation + cryptographic access control
- [ ] Investigation path by `userIdentity.type` (in particular `AssumedRole` → trace back via `sessionContext`)
- [ ] Distinguish `AKIA` (long-term key) vs. `ASIA` (temporary credentials)
- [ ] A surge in `errorCode` = fingerprint of permission-enumeration reconnaissance
- [ ] `lookup-events` covers only management events and 90 days - data events go to Athena/Lake
- [ ] Cross-account resource policies need `aws:SourceArn`/`SourceOrgID` + `bucket-owner-full-control`
- [ ] Logs and digests use **different prefixes** - protection must be applied to both
- [ ] Even with `IsLogging=true`, if there is a `LatestDeliveryError`, logs are not arriving
- [ ] Config `INSUFFICIENT_DATA` and Regions with the recorder off are not counted as violations
- [ ] Blocking controls are always turned on in the order observe (ALERT/manual) → automatic

## The Last 30 Seconds Before the Exam: Easily Confused Forks

| Clue in the text | Direction of the answer |
|------------|----------|
| "Who downloaded the object" | Data events (must be turned on beforehand) |
| "Who created the bucket" | Management events (recorded by default) |
| "Since when has it been open" | AWS Config configuration timeline |
| "Investigate with SQL without code" | CloudTrail Lake |
| "Long-term retention at the lowest cost" | S3 trail + lifecycle |
| "Not even root can delete" | Object Lock **Compliance** |
| "Protect while leaving operational flexibility" | Object Lock **Governance** |
| "Litigation response, period undetermined" | Legal Hold |
| "*Prove* tampering" | Log file integrity validation |
| "*Prevent* tampering" | Object Lock |
| "Inspect packet contents" | Traffic Mirroring |
| "Which instance exfiltrated it (behind NAT)" | Flow Log `pkt-srcaddr` |
| "Detect DNS tunneling" | Resolver query logs |
| "Block malicious domains" | Resolver DNS Firewall |
| "Deny creation itself" | SCP / Block Public Access (prevention) |
| "Reverse it once created" | Config rule + SSM Automation remediation (detection and response) |
| "Immediate detection and alerting" | EventBridge (management events) |
| "Sweep the entire last quarter" | Athena / CloudTrail Lake (batch) |
| "So a member administrator cannot turn it off" | Organization trail + SCP |
| "Normalize multiple sources into a common schema" | Security Lake (OCSF) |

## 📌 Key Takeaways

One sentence ran through this entire week - **"What was not recorded did not happen, and a record that was not protected is not a record."**

The four pillars each answer a different question. CloudTrail answers *who did what* (a point), Config answers *what state lasted how long* (a line), and Flow Logs and Resolver query logs answer *what flowed where* (a flow). And the fourth pillar, integrity, retention, and centralization, turns the first three into evidence. No single one explains a breach on its own, and the conclusion stands only when all four point to the same subject.

From an exam viewpoint, three pairs of distinctions must be internalized. **Management events vs. data events** (S3 objects and Lambda invocations are data - off by default), **prevention vs. detection** (if "deny creation," SCP/BPA; if "reverse it once created," Config remediation), and **blocking vs. proving** (Object Lock blocks, and the digest hash chain proves). Getting just these three pairs right solves a considerable portion of the questions in this domain.

Finally, the single most expensive lesson in practice. Every control this week is **effective only from the moment it is turned on.** Data events, the Config recorder, Flow Logs, and Object Lock retention rules are none of them retroactive. So the only correct answer to "when should I turn it on" is always "now" - because by the moment an investigation becomes necessary, it is already too late. Next week's GuardDuty, Security Hub, and Detective are the stage that layers automated analysis on top of this foundation, and if the foundation is empty, no matter how good a tool you put on top, there is nothing to see.

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
