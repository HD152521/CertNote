# Day 1 - Integrated Review Domains 1 & 2: Detection ↔ Incident Response

Domain 1 (Detection, 16%) and Domain 2 (Incident Response, 14%) together form a block worth 30% of the exam. In SCS-C03, logging and monitoring are not a separate domain but **part of Domain 1 Detection** — monitoring and alerting, logging, and troubleshooting of monitoring and logging are all in Domain 1. Domain 2 is the area of designing and testing incident response plans and responding to actual events, and it includes validating findings to assess scope and impact. On the exam the two are almost always asked as *one flow*: "you need logs to detect, and you need detection to respond." Today we review this pipeline — **collection (logs) → analysis and detection (GuardDuty/Detective/Macie) → aggregation (Security Hub) → automated response (EventBridge→Lambda/SSM)** — bound together as a single nervous system.

First, let us decide how to use a review week. The five days from today are **not a place to learn new concepts.** They are a place to thread what you dug into deeply in weeks 1-11 into *a single decision framework*. So the way you read must be different — instead of rereading explanations to understand them, you should pass through while checking **whether you can reconstruct the tables with them covered**. When you hit a cell you cannot reconstruct, go back to the original week for that cell only. The most common way to lose time in review is "rereading what you already know and feeling reassured."

## How the Two Domains Combine on the Exam

It is actually rare for Domains 1 and 2 to appear as separate questions. If you know the typical combination forms first, you can predict somewhat before reading the passage.

| Combination form | Shape of the passage | Where the answer sits |
|---|---|---|
| Missing-evidence type | "I want to investigate but the needed records do not exist" | *Which log should have been turned on* — data events, Flow Logs, DNS logs, Config |
| Detector-selection type | "To discover this" | One of GuardDuty / Inspector / Macie / Access Analyzer |
| Deep-investigation type | "I want to know the scope and root cause" | Detective + CloudTrail (Athena/Lake) |
| Aggregation type | "Results from multiple accounts and multiple tools in one place" | Security Hub delegated administrator + aggregation Region |
| Automated-response type | "Immediately, without human intervention" | EventBridge → Lambda / SSM Automation |
| Ordering type | "What do you do first?" | The principle of reversibility and evidence preservation first |
| Integrity type | "So that logs cannot be deleted or turned off" | Organization trail + SCP Deny + Log Archive account + Object Lock |

Once you identify which of these seven forms it is, the candidate services shrink to three or four. Today's goal is to make this identification a reflex.

## The Logging Layer: What Is Recorded Where

The source of detection is logs. The exam constantly asks "which log must you turn on to see this evidence?"

| What you want to know | Log source | Location/peculiarity |
|-------------------|-----------|-------------|
| Who called which API | CloudTrail (management events) | On by default; console event history covers the last 90 days. Permanent retention is S3 |
| S3 object and Lambda data access | CloudTrail **data events** | Explicit enablement and charges. Tracks object GET/PUT |
| Anomalies in API call volume and error rate | CloudTrail **Insights events** | Separate enablement and charges. Detects spikes relative to normal |
| IP flows within a VPC (allow/deny) | VPC Flow Logs | Per ENI/Subnet/VPC. No payload |
| The packet content itself | VPC Traffic Mirroring | Nitro-based. Replicates down to the payload |
| DNS query content | Route 53 Resolver query log | Detecting domain exfiltration |
| HTTP requests and blocks | WAF logs | `aws-waf-logs-` prefix required |
| Who read which object (low cost) | S3 server access logs | Best-effort and delayed. For audit evidence, data events are superior |
| OS and application internals | CloudWatch Logs (agent) | Visibility inside the instance |
| Container and node runtime behavior | GuardDuty Runtime Monitoring / EKS audit logs | Process and file level |
| Configuration change history and compliance | AWS Config | Resource timeline and rule evaluation |
| Load balancer requests | ALB/NLB access logs | Stored in S3. Client IP and response codes |

CloudTrail sees the *control plane (who configured or called what)*, VPC Flow Logs sees the *data plane (traffic flow)*, and CloudWatch Logs sees *inside the host*. These three do not overlap but complement each other. On the exam, "did EC2 exfiltrate data externally" → Flow Logs (+ DNS query log), "who opened the security group" → CloudTrail, "what did the process do" → CloudWatch agent. Confusing the sources gives the wrong answer.

The key pitfall: **CloudTrail management events do not record S3 GetObject.** Object-level access requires turning on *data events* separately. Gather multiple accounts into a single S3 bucket with an organization trail, detect tampering with log file validation (SHA-256 digest), and encrypt with SSE-KMS.

### Log Source Selection Decision Tree

When the passage says "I want to know this fact," which axis you look at first creates speed.

```
"What do you want to know?"
   │
   ├─ Who "called" what ─────────────────► CloudTrail
   │     ├─ Resource configuration / API calls ──►   Management events (on by default)
   │     ├─ S3 objects / Lambda Invoke ──────────►   Data events (separately on · charged) ★pitfall
   │     └─ Unusual call volume / error rate ────►   Insights events (separately on)
   │
   ├─ What traffic went back and forth ──► Network logs
   │     ├─ IP · port · allow/deny (metadata) ──►   VPC Flow Logs  (no payload)
   │     ├─ Which domains were queried ──────────►   Route 53 Resolver query log
   │     ├─ Actual packet content ───────────────►   Traffic Mirroring
   │     └─ HTTP requests · reason for block ────►   WAF logs
   │
   ├─ What "state" a resource was in ────► AWS Config (configuration item timeline)
   │
   ├─ What happened inside the host ─────► CloudWatch agent / GuardDuty Runtime Monitoring
   │
   └─ Whether the data itself is sensitive ─► Macie
```

The key division of labor in one line: **CloudTrail = "who called," Config = "what state it was in at the time," Flow Logs = "where it flowed."** Investigations usually stick these three together — find *when it changed* with Config, find *who did it* in CloudTrail on the axis of that time, and confirm *where it therefore went* with Flow Logs.

### Four Axes for Handling CloudTrail

Compressing what we dug into in week 7 into exam-answer form gives four axes.

| Axis | What it determines | Form it takes on the exam |
|---|---|---|
| **Scope** | Single-account trail vs **organization trail** | "Activity of all accounts centrally" → organization trail (new accounts included automatically) |
| **Depth** | Management / data / Insights events | "Whether an object was read" → data events |
| **Integrity** | log file validation (SHA-256 digest), SSE-KMS, S3 Object Lock, separate Log Archive account | "Tamper-proof, delete-proof" → a combination of these four |
| **Query** | S3+Athena / CloudWatch Logs metric filter / **CloudTrail Lake** | "Real-time alert" → CloudWatch Logs metric filter + alarm, "bulk SQL investigation" → Athena/Lake |

It is important that these four axes are independent of each other. Turning on an organization trail does not turn on data events, storing in S3 does not guarantee integrity, and having logs does not create real-time alerts. Exam choices poke exactly at this independence — "I turned on the organization trail but I cannot see object access" (missing depth), "the logs exist but an administrator deleted them" (missing integrity), "the record was kept but nobody knew" (missing query and alerting). *A choice that says turning on one axis solved another axis* is usually wrong. Conversely, the correct choice usually mentions the required ones among the four axes **at the same time**.

The difference in immediacy also separates answers here. **CloudTrail → S3 → Athena** is for investigation, not for alerting (there is delivery delay and a person runs the query). If a real-time alert is required, the path is **CloudTrail → CloudWatch Logs → metric filter → alarm → SNS**, or, if event-based, an **EventBridge rule**. Requirements like "notify immediately when a root login occurs" are asking about this path.

## The Detection Layer: Translating Logs into Threats

- **GuardDuty**: Analyzes CloudTrail, VPC Flow Logs, DNS logs (+ EKS/S3/Malware/RDS/Lambda protection) with ML and threat intelligence to generate *findings*. It consumes them internally, **so you do not need to turn the logs on directly** — do not turn it off.
- **Macie**: Automatically classifies and discovers PII and sensitive data in S3. "Are there credit card numbers in S3?" → Macie.
- **Detective**: Investigates the *root cause and scope* of GuardDuty findings as a graph (behavior graph). "Why, and how far did it spread?"
- **Inspector**: Scans EC2/ECR/Lambda for *vulnerabilities (CVE) and network exposure*. Continuous assessment without human intervention.
- **Access Analyzer**: Analyzes whether resource policies are exposed externally or cross-account.

> 🎯 **Integrated Scenario A**: "GuardDuty raised `UnauthorizedAccess:EC2/MaliciousIPCaller`. I want to investigate what this instance did and whether it spread to other resources." Answer: Pivot from the finding in **Detective** to see the behavior graph (connected IPs, APIs, accounts), and cross-check the source logs with CloudTrail/Flow Logs. GuardDuty answers *what happened*, and Detective answers *why and how far*.

### Confusing Pairs: Contrasting the Six Detection Services

This table is half of Domain 1. If you memorize each service by the **question it answers**, you will not be shaken by wrong answers that only change the name in the choices.

| Service | Question it answers | Input | Output | Typical spot where it is used as a wrong answer |
|---|---|---|---|---|
| **GuardDuty** | "Is a threat *behavior* happening right now?" | CloudTrail, Flow Logs, DNS (consumed internally) + optional protections | Threat findings | Wrongly placed in the vulnerability scanning slot |
| **Inspector** | "Are exploitable *vulnerabilities* still present?" | EC2, ECR, Lambda | CVEs and network reachability | Pretending to be an incident response tool |
| **Macie** | "What *data* is sensitive and where is it?" | S3 objects | Sensitive data classification findings | Wrongly placed in the threat detection slot |
| **Detective** | "How are these entities *connected*?" | CloudTrail, Flow Logs, GuardDuty findings | Behavior graph | Pretending to be an aggregation tool |
| **Access Analyzer** | "What is *open to the outside*?" | Resource policies | External access and unused permission findings | Wrongly placed in the data classification slot |
| **Security Hub** | "How do I view all of these in *one form*?" | All of the above + standards checks | ASFF normalization and score | Pretending to be an investigation/detection tool |

One-line memorization: **threats are GuardDuty, weaknesses are Inspector, data is Macie, exposure is Access Analyzer, relationships are Detective, aggregation is Security Hub.**

Two more pairs that often come along with these.

- **Security Hub vs Security Lake**: The former gathers *judgment results (findings)* in **ASFF**, while the latter gathers *source logs* in **OCSF** and supplies them to external analysis tools. "Hand source logs to a third-party SIEM" → Security Lake. "Prioritize and automate detection results" → Security Hub.
- **GuardDuty Malware Protection vs Inspector**: The former scans EBS volumes to find *malicious files*, while the latter finds *package vulnerabilities*. If the word "malware" appears, it is not Inspector.

## The Aggregation Layer: Security Hub

Security Hub normalizes and aggregates findings from many sources such as GuardDuty, Inspector, Macie, and Config into the **ASFF (AWS Security Finding Format)** standard. It gives automated check scores against security standards (CIS, AWS FSBP, PCI DSS, NIST). For multiple accounts, operate it by delegating to a **delegated administrator**, and integrate with Organizations to auto-enroll new accounts.

There are only three fields in ASFF that the exam really pokes at.

| Field | Meaning | Why it is asked |
|---|---|---|
| `Severity.Normalized` | 0-100 normalized score. INFORMATIONAL 0 / LOW 1-39 / MEDIUM 40-69 / HIGH 70-89 / CRITICAL 90-100 | Even when sources differ (GuardDuty 0.1-8.9, Inspector CVSS 0-10), they must sit on one scale to apply sorting and automation thresholds |
| `Workflow.Status` | NEW → NOTIFIED → RESOLVED / SUPPRESSED. **A person's handling state** | Folding away noise is SUPPRESSED |
| `RecordState` | ACTIVE / ARCHIVED. **The survival of the finding itself** | The state in which the provider judged it no longer valid |

> ⚠️ **Pitfall**: It is easy to confuse `Workflow.Status` and `RecordState` and use them interchangeably. An analyst marking something "handled" is `Workflow.Status = RESOLVED`, folding away noise is `SUPPRESSED`, and `RecordState = ARCHIVED` is not something people manipulate. Also, **automation rules (changing fields inside Security Hub)** and **EventBridge rules (sending out and taking action)** are different things. For "noise cleanup," automation rules; for "actual response," EventBridge.

The correct answer form for noise questions is also fixed. When "there are thousands a day so nothing can be handled" appears, the answer is **receive all findings but fold them by priority** (suppress/raise with automation rules + extract top risks with Insights), not *turning detection off, disabling the integration, or blocking generation itself with a Trusted IP list*. The latter all create blind spots.

> ⚠️ **Commonly missed distinctions**: 
> - GuardDuty = *threat* detection (behavioral anomalies). Inspector = *vulnerabilities* (CVE/patches). Do not confuse them.
> - Macie = S3 *data* sensitivity. Access Analyzer = *policy* exposure. 
> - Security Hub = *aggregation and standards score*. Detective = *investigation*. Config = *configuration compliance and history*.

### The Multi-Account Detection Baseline: Things That Silently Go Invisible When Missing

The answers to multi-account questions take an almost fixed form — **align the delegated administrator of every detection service to the same Security Tooling (Audit) account, include new accounts automatically with auto-enable, gather multiple Regions with an aggregation Region, and keep logs immutably in a separate Log Archive account.** Questions remove one of these and ask "why can I not see it?"

| What is missing | Blind spot that results | Symptom that appears in the passage |
|---|---|---|
| Integration not enabled | That detector's findings | "It shows up in GuardDuty but not in Security Hub" |
| Aggregation Region not designated | All other Regions | "We learned about the critical finding late" |
| auto-enable not configured | All new accounts | "The new team's account was outside detection" |
| Delegated administrator scattered | Investigation context severed | "The finding is in account A, the graph is in account B" |
| Logs kept in the detection account | Failure of privilege separation | Evidence can be tampered with on compromise |
| Unused Regions not covered | All activity in that Region | Mining and reconnaissance in a Region that is not used |

This is the skeleton of the AWS *Security Reference Architecture (SRA)*. Delegating security tools to a dedicated account separate from workloads establishes *privilege separation* — workload teams cannot turn off their own detection or delete findings, and logs remain in a separate account the intruder cannot reach. Not placing operational burden on the management account is the same principle (since the account where root privileges are concentrated needs the most protection). **Designating a delegated administrator must be done separately for each service** — the fact that it is not all delegated at once appears on the exam.

## The Response Layer: EventBridge Connects the Nerves

The wiring that leads detection into response is **EventBridge**. GuardDuty/Security Hub findings, Config non-compliance, and CloudTrail events all flow as EventBridge events. When a rule matches, it routes to a target:

- **Lambda**: Immediate automated remediation (revoking a security group, disabling a key, snapshots).
- **SSM Automation runbook**: Standardized multi-step response (instance isolation, forensic capture).
- **Step Functions**: Complex response workflows with an approval gate.
- **SNS**: Notifying people (SOC/on-call).

This is *event-driven security automation*. The exam keyword "automatically, without manual intervention" almost always points to the EventBridge → Lambda/SSM pattern. Config automatic remediation has the same philosophy — it immediately reverts non-compliant resources with `AWS-PublishSNSNotification` or a custom SSM document.

### The Standard Procedure for Incident Response

The order of response for a compromised EC2:
1. **Separate**: Detach from the Auto Scaling group and target group (if you isolate it, the health check fails and the ASG terminates it on its own, so the evidence disappears).
2. **Preserve evidence**: EBS snapshot, memory dump, instance metadata and tags.
3. **Isolate**: Swap to a security group for forensic isolation (do not terminate — preserve volatile evidence). **You must remove the new SG's default outbound allow rule** for it to be true isolation.
4. **Revoke credentials**: Detach the instance profile + revoke existing sessions with an `aws:TokenIssueTime` Deny on the role. *Always do this separately from network isolation* — a leaked STS token lives outside the instance until it expires.
5. **Investigate**: Determine scope with Detective, trace exhaustively with CloudTrail/Athena, share snapshots to a forensic account.
6. **Recover and eradicate**: Redeploy a clean AMI after removing backdoors. If you recover without eradication, you are compromised again.

Key compromise response: **Deactivate first** (`Inactive`) an IAM access key, then delete after finishing tracing and rotation — if you delete before tracing, you lose the `accessKeyId` lookup axis. For KMS keys, *disable* rather than delete (so it is reversible), and for exposed secrets, trigger Secrets Manager rotation. A root compromise cannot be limited by IAM policy or SCP (SCPs do not apply to management account principals), so confirming control of the recovery channels (email, phone) comes first.

### The "What Do You Do First" Decision Axes

Ordering questions give the same list of actions and **only rearrange the order** to build the choices. If you know the rationale, you will not be shaken by the variations.

```
When a "what do you do first?" question appears — look at the axes in this order
   │
   ├─① Does this action destroy evidence?  ── yes ─► push it back (terminate · delete · redeploy)
   │
   ├─② Can this action be reversed?   ── yes ─► pull it forward (isolation SG · key deactivation · snapshot)
   │
   ├─③ Is it the "cause" or the "result" of the spread? ── cause first (original credential > user the attacker created)
   │                                           (restore logging > the conspicuous instance)
   │
   └─④ May it be automated?            ── automate if reversible, approval gate if irreversible
```

The sentence running through these four axes: **actions that destroy evidence go later, reversible actions go earlier, causes come before results, and irreversible ones pass through a person once.**

In particular, here is a compressed list of first actions by situation that the exam likes.

| Situation | Do first | Rationale |
|---|---|---|
| EC2 compromise, member of an ASG | Detach from the ASG and target group | Isolate → health check fails → ASG terminates → evidence disappears |
| Signs of a leaked role token | Revoke sessions + detach the profile | The token is valid outside the instance until it expires |
| Access key exposed publicly | Deactivate (not delete) | Stopping the leak takes priority over availability, deactivation is reversible |
| Ongoing C2 will not cut off | Supplementary block with NACL/ENI | SGs are stateful, so established connections remain |
| CloudTrail stoppage detected | Restore logging + verify archive integrity | Actions during the time it was off can never be known |
| Bucket policy open to the outside | Remove the policy Statement, reapply public access block | Deleting the bucket or moving objects breaks evidence and service together |
| Same risk suspected across multiple accounts | Check organization-wide with Security Hub | Walking through accounts always misses some |

The wrong answers in automated-response design questions are usually **choices that put an irreversible action into unattended automation**. Moving to an isolation SG, tagging, snapshots, and session revocation can be reversed even if it is a false positive, but **terminating an instance, deleting a volume, or deleting a role** cannot be reversed and also destroys forensic evidence. Route irreversible actions through a Step Functions approval step (`aws:approve`) or a ticket so a person is passed through once. *Reversibility overrides all the other decision axes.*

> 🎯 **Integrated Scenario B**: "When the Config rule `s3-bucket-public-read-prohibited` finds non-compliance, block public access immediately, without human intervention." Answer: Connect the Config rule with **automatic remediation (SSM Automation)**, or send the non-compliance event through EventBridge → Lambda calls `PutPublicAccessBlock`. At the same time, notify the security team via SNS. A complete loop of detection (Config) → routing (EventBridge) → remediation (SSM/Lambda) → notification (SNS).

## A One-Line Picture Connecting the Two Domains

```
[Log sources]          [Detection/analysis]   [Aggregation]   [Response]
CloudTrail ─┐
Flow Logs  ─┼─► GuardDuty ─┐
DNS log    ─┘              ├─► Security Hub ─► EventBridge ─┬─► Lambda (remediation)
S3         ───► Macie    ──┤   (ASFF normalization)         ├─► SSM (runbook)
EC2/ECR    ───► Inspector ─┤                                ├─► SNS (notification)
Config changes ► Config   ──┘                               └─► Step Functions
                  └─► Detective (investigation) ◄── finding pivot
```

A mature SOC is evaluated not by "did it detect" but by "how much did it reduce the detection → response *time (MTTR)* through automation." That is why exam answers prefer "automatic remediation with Lambda + SNS notification." At the same time, *evidence integrity* is also key — CloudTrail log file validation, S3 Object Lock (WORM) and MFA Delete, and disabling (not deleting) KMS keys are all expressions of the same principle: "do not damage investigability and legal evidentiary value." And MTTR is not a single number but the sum of *detection → triage → containment → investigation → recovery*. If a metric says "MTTD went down but MTTR stayed the same," the bottleneck is not the absence of automation but **not measuring in which segment the time passes**.

## Domains 1 & 2 Keyword → Service Translation Table

A reflex for translating passage expressions into services immediately. This collects just these two domains (the all-domain integrated version is on day 5).

| When an expression like this appears in the passage | Service/pattern to recall |
|---|---|
| "Communication with malicious IPs," "behavioral anomaly," "mining," "reconnaissance" | GuardDuty |
| "Malware in an EBS volume" | GuardDuty Malware Protection |
| "Process-level behavior in containers and nodes" | GuardDuty Runtime Monitoring |
| "CVE," "unpatched," "network reachability" | Inspector |
| "Whether S3 has personal information or card numbers" | Macie |
| "Root cause," "scope of compromise," "lateral movement," "visual investigation" | Detective |
| "Policies exposed externally or cross-account," "unused permissions" | IAM Access Analyzer |
| "Results of multiple tools in one form," "CIS/PCI/FSBP score" | Security Hub |
| "Source logs to a third-party SIEM" | Security Lake (OCSF) |
| "Who called which API" | CloudTrail management events |
| "Which objects were downloaded" | CloudTrail **data events** |
| "Call volume or errors spike above normal" | CloudTrail Insights |
| "What state this resource was in at the time" | Config configuration item timeline |
| "IP flows and allow/deny only" | VPC Flow Logs |
| "Down to the packet content" | Traffic Mirroring |
| "Which domains were queried," "DNS-based exfiltration" | Route 53 Resolver query log |
| "Immediate notification on root login" | CloudTrail → CloudWatch Logs metric filter → alarm → SNS |
| "Investigate bulk logs with SQL" | Athena / CloudTrail Lake |
| "Automatic remediation without human intervention" | EventBridge → Lambda / SSM Automation |
| "Multi-step response that needs an approval step" | Step Functions (`aws:approve`) |
| "Standardized multi-step response procedure" | SSM Automation runbook |
| "So logs cannot be turned off or deleted" | Organization trail + SCP Deny + Log Archive account + Object Lock |
| "New accounts also automatically in scope for detection" | Delegated administrator + auto-enable |
| "Findings from multiple Regions on one screen" | Security Hub aggregation Region |
| "There is too much noise" | Security Hub automation rules (suppress/raise) + Insights |

## Domains 1 & 2 Pitfall Summary

**Logging pitfalls**
- CloudTrail management events **do not record S3 objects or Lambda invocations** → enable data events separately.
- Console event history is only the last 90 days — **permanent evidence is an S3 trail**.
- VPC Flow Logs **do not see the payload** (metadata and allow/deny only).
- Logs and evidence **cannot be generated retroactively** — only what you turned on before the request arrives becomes evidence.
- If you put logs in the detection account, privilege separation breaks → **a separate Log Archive account**.
- S3 server access logs are best-effort and delayed, so **for audit evidence, data events are superior**.

**Detection pitfalls**
- GuardDuty **consumes logs internally**, so there is no need to turn on Flow Logs or DNS logs separately — but conversely, *do not turn it off*.
- If you do not turn on the integration, findings **do not arrive in Security Hub**.
- Without an aggregation Region, **the other Regions are entirely a blind spot**.
- If you do not turn on auto-enable separately for each service, only that service is silently off in new accounts.
- Do not swap `Workflow.Status` (a person's handling) and `RecordState` (the finding's survival).
- automation rules apply **at the time of ingestion** — they do not retroactively change past findings.

**Response pitfalls**
- Terminating immediately → destroys volatile evidence.
- Isolating without detaching from the ASG → the ASG terminates it because of the health check failure.
- Not removing the **default outbound allow** of the new isolation SG, so exfiltration continues.
- Isolating only the instance and **not revoking the STS token**.
- **Deleting the exposed key before tracing**, losing the investigation axis.
- Recovering without eradication, getting compromised again through the backdoor.
- Putting an irreversible action into unattended automation, so a single false positive becomes an outage.

The same sentence repeats in post-incident reports of major cloud breaches — "the relevant signals were already in the logs." In **Capital One (2019)**, data was exfiltrated after the attacker used SSRF to reach instance metadata and obtained the role's temporary credentials, and the fact was recognized through an *external tip*. The **SolarWinds (2020)** supply chain attack was also ultimately revealed when a security company discovered an anomaly in its own environment. The common lesson of the two incidents is not the absence of tools but **the absence of a path by which signals reach people and automation**. If a detector produces findings but they are not normalized so priority cannot be assigned, they are scattered across multiple consoles and not correlated, and they do not enter a response queue automatically — it is effectively the same as not detecting. The Capital One case says one more thing: **instance isolation and credential revocation are separate**, and IMDSv2 and the hop limit are *preparation* items, not *response*.

## 📌 Key Takeaways

The two domains of today, reduced to one sentence: **"Logs create evidence, detectors turn evidence into judgments, ASFF makes judgments a common language, and EventBridge moves the common language into action."**

The exam repeatedly pokes at four points in this pipeline. ① **Depth** - management events alone do not show object access. ② **Integrity** - even if logs exist, they are not evidence if they can be deleted. ③ **Aggregation** - even with many detectors, there must be one aggregation and automation surface. ④ **Reversibility** - the more powerful the automation becomes, the greater the damage of a false positive, so put only reversible actions into unattended automation.

And all four of these points are not matters of "on/off" but of *combination*. That is why an **answer that mentions only one** among the choices is usually wrong, and the **answer that simultaneously satisfies the required axes** is the best. This sense is the foundation for solving Domain 1 and 2 questions.

### One-Line Summary Checklist

- [ ] Did you turn on CloudTrail management + data events, an organization trail, log file validation, and SSE-KMS?
- [ ] Did you turn on GuardDuty, Inspector, Macie, and Config and aggregate them in Security Hub (delegated admin)?
- [ ] Do you distinguish "what" = GuardDuty, "why/scope" = Detective, "vulnerabilities" = Inspector, "data sensitivity" = Macie?
- [ ] Did you route findings through EventBridge to Lambda/SSM automatic remediation?
- [ ] Have you memorized the compromised-EC2 response order (separate → preserve evidence → isolate → revoke credentials → investigate → recover)?
- [ ] Do you know the deactivate/rotate (delete with caution) procedure for credential and key compromise?

---

## 📝 Practice Questions

**Question 1.** The security team wants to trace "which IAM user downloaded a specific S3 object." With only default CloudTrail turned on, this information was not visible. What are the cause and the fix?

A) VPC Flow Logs must be turned on  
B) CloudTrail **data events** (S3 object level) must be explicitly enabled — management events do not record object GET/PUT  
C) Turning on GuardDuty records it automatically  
D) The CloudWatch Logs agent must be installed  

**Answer: B**

---

**Question 2.** GuardDuty generated a malicious IP communication finding for an EC2 instance. The security team wants to visually investigate which other resources and accounts this instance is connected to and how far the compromise has spread. What is the most suitable service?

A) Amazon Inspector  
B) Amazon Macie  
C) Amazon Detective  
D) AWS Config  

**Answer: C**

---

**Question 3.** Requirement: "When a Config rule finds a public S3 bucket, immediately block public access and notify the security team without human intervention." What is the most appropriate implementation?

A) Only review the Config rule score daily  
B) Config rule + automatic remediation (SSM Automation) to immediately apply PublicAccessBlock + notify via EventBridge -> SNS  
C) Remove all users' S3 permissions with IAM policies  
D) Register the bucket with GuardDuty  

**Answer: B**

---

**Question 4.** When handling an EC2 instance suspected of compromise, what is the correct first action to isolate it while preserving volatile evidence?

A) Terminate the instance immediately  
B) Replace the security group with a forensic isolation security group that has no inbound or outbound rules, detach it from Auto Scaling, and take an EBS snapshot  
C) Change the security group to allow everything to observe the traffic  
D) Delete only the instance IAM role  

**Answer: B**

---

**Question 5.** Which of the following pairings of a detection service and its main purpose is incorrect?

A) GuardDuty — detection of threats (behavioral anomalies) based on CloudTrail/Flow Logs/DNS  
B) Inspector — assessment of vulnerabilities (CVEs) and network exposure for EC2/ECR/Lambda  
C) Macie — automatic classification and discovery of PII and sensitive data in S3  
D) Security Hub — investigating the root cause of GuardDuty findings with a graph  

**Answer: D**

---

**Question 6.** In a multi-account environment, we want to centrally retain the CloudTrail logs of all accounts in a tamper-proof way. What is the most appropriate combination?

A) Each account retains its own trail locally  
B) Aggregate into a single central S3 bucket with an Organization trail + log file validation (digest) + SSE-KMS + S3 Object Lock (WORM)/MFA Delete  
C) Store only in CloudWatch Logs and delete after 30 days  
D) Upload logs directly to GuardDuty  

**Answer: B**

---
