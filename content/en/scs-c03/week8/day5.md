# Day 5 - Week 8 Integration: Monitoring, Aggregation, and Analysis Scenarios, a Comprehensive Review

This week dealt not with "logging itself" but with *how to turn accumulated logs into signals, and signals into responses*. Today we thread the tools of the four days — CloudWatch (threshold detection), Security Hub (aggregation, normalization, scoring), Athena/OpenSearch/Logs Insights (analysis), EventBridge/Security Lake (automation and integration) — into a single flow, and sort out the *boundaries that make the exam confuse the tools*. The point is not memorizing individual features but answering instantly "why is *this* tool the answer for this requirement, and why is *that* tool not."

## The Detection-Aggregation-Analysis-Response Pipeline on One Page

```
 [Collect]         [Detect]             [Aggregate/Normalize]  [Analyze]            [Automate/Respond]
CloudTrail ─┐   CloudWatch ─┐
VPC Flow ───┼─▶ Metric Filter│        Security Hub ─┐    Athena (S3, after the fact)
ELB/R53 ────┤   + Alarm      ├─findings─▶ (ASFF normalization) ├──▶ Logs Insights ──┐
App logs ───┘   GuardDuty ───┤        security score/standards  │    OpenSearch       │
                Inspector ───┤        (CIS/FSBP)               │    (near real time) │
                Macie ───────┘                                 │                     ▼
                                                               └──▶ EventBridge ──▶ SNS (notification)
                                                                    (routing)     ──▶ Lambda/SSM (remediation)
                                                                                  ──▶ Step Functions (orchestration)

 [Unified storage] Security Lake: normalizes the raw logs above into OCSF/Parquet in an S3 data lake — Athena/OpenSearch/SIEM query a single schema
```

This flow maps the *Detect* and *Respond* functions of the NIST CSF onto AWS services. CloudWatch and GuardDuty handle detection, Security Hub handles aggregation and evaluation of detection results, and EventBridge handles orchestration of the response. In exam questions, first identifying "is this requirement detection, aggregation, analysis, or response" usually narrows the candidate services.

## A Decision Tree That Narrows the Tool with One Question

What you actually need to run in the exam room is not the diagram above but **the order of questions**. If you read the passage and ask the following in order, the candidates shrink to one in most questions.

```
① What is the requirement trying to do?
   ├─ "I want to find it"           → Detection (go to ②)
   ├─ "I want to gather and see it" → Aggregation → Security Hub (add Config for controls)
   ├─ "I want to interrogate it"    → Analysis (go to ③)
   └─ "I want to act automatically" → Response → EventBridge (+ Lambda/SSM/Step Functions)

② What is being detected?
   ├─ Count of a specific log pattern    → CloudWatch metric filter + alarm
   ├─ Threat behavior, malicious traffic → GuardDuty
   ├─ Software vulnerabilities           → Inspector
   ├─ Sensitive data                     → Macie
   ├─ Permissions exposed externally     → IAM Access Analyzer
   ├─ Configuration deviating from baseline → Config / Security Hub standards
   └─ A metric that differs from usual   → CloudWatch Anomaly Detection

③ Where is the data, and what is the tense of the question?
   ├─ CloudWatch Logs + "now"                       → Logs Insights
   ├─ S3 + "back then" (one-off, low cost)          → Athena (+ partitions, Parquet)
   ├─ Index + "continuously" (always-on dashboard)  → OpenSearch
   └─ Organization-wide raw logs + single schema    → Security Lake (OCSF)
```

The branch where mistakes happen most in this tree is the first fork of ①. **If you cannot separate "detection" from "aggregation"**, you waver between Security Hub and GuardDuty. The test is simple — if the passage says *"find out what happened"*, it is detection; if it says *"view in one place what several tools have already found out"*, it is aggregation.

The second place where mistakes are common is ③. The same phrase "log analysis" fits all three tools, so you must look in the passage for the **data location** and for any mention of **cost or immediacy**. "Minimize cost" leads almost without exception to Athena, "immediately, without separate loading" to Logs Insights, and "always-on dashboard, full-text search" to OpenSearch.

## Boundary Summary 1: How the "Detection" Tools Divide the Work

An area that is easy to confuse. Distinguish by what is being *detected*.

| Requirement | Answer | Reason |
|-------------|--------|--------|
| Alarm on a threshold for a specific log pattern (root use, N login failures) | CloudWatch Metric Filter + Alarm | Pattern within a single log group → number → threshold |
| Malicious IP communication, cryptomining, anomalous use of credentials | GuardDuty | Behavior detection based on threat intelligence and ML |
| CVE vulnerabilities in EC2/containers/Lambda | Inspector | Software vulnerability scanning |
| Discovering PII/sensitive data in S3 | Macie | Data classification and discovery |
| "Unlike usual" for a metric that varies by time of day | CloudWatch Anomaly Detection | ML band for an arbitrary metric |
| Resources shared externally unintentionally (buckets/roles) | IAM Access Analyzer | Analysis of the possibility of external access |

> ⚠️ **Pitfall**: Do not pick GuardDuty reflexively for the vague phrase "detect security anomalies." *What* is anomalous decides it — a threshold on a specific API call means CloudWatch, threat behavior means GuardDuty, vulnerabilities mean Inspector, sensitive data means Macie.

## Boundary Summary 2: How the "Analysis" Tools Divide the Work

Data location and timing decide.

| Requirement | Answer | Key criterion |
|-------------|--------|---------------|
| Large volumes of logs stored in S3, one-off SQL, low cost | Athena | Data = S3, after the fact, one-off |
| Query logs that are in CloudWatch Logs immediately | Logs Insights | Data = CloudWatch Logs, immediate |
| Near-real-time dashboards, full-text search, repeated correlation | OpenSearch | Indexing, always-on operation |
| Organization-wide logs in a single normalized schema | Security Lake (+Athena/OpenSearch) | OCSF normalized repository |

> 🎯 **Scenario**: "Investigating an incident from 90 days ago, the logs are only in S3, and cost must be minimized" → Athena + partitioning. "The logs are in CloudWatch Logs and we need it immediately during incident response" → Logs Insights. "The SOC monitors with an always-on dashboard" → OpenSearch. Even the same "log analysis" splits by location and timing.

## Boundary Summary 3: Security Hub vs Security Lake vs Config

The three services cluster around the similar phrase "organization security state" and cause confusion.

- **AWS Config**: Records resource *configuration*, tracks changes, and evaluates rules. The *source evaluation engine* for "is this resource in a compliant configuration?" Security Hub standard controls use it internally.
- **Security Hub**: Aggregates the *findings* of several detectors in ASFF, checks standard (CIS/FSBP) controls, and gives a security score. "Our current security state and detection results at a glance."
- **Security Lake**: An S3 data lake that normalizes *raw security logs* into OCSF. "Collect all logs in a single schema and provide them to analysis/SIEM."

```
Config       → Configuration evaluation (do settings meet the rules?)     → The engine behind Security Hub standards
Security Hub → Aggregation and scoring of findings (dashboard)            → ASFF format
Security Lake→ Normalized repository of raw logs (for analysis)           → OCSF format
```

> ⚠️ **Pitfall**: The phrase "normalize multiple sources" is used for both, which causes confusion. Normalization, aggregation, and scoring of *detection findings* is Security Hub (ASFF). Normalized storage and analysis of *raw logs* is Security Lake (OCSF). The format name (ASFF vs OCSF) is the decisive clue.

## Integrated Scenario Walkthroughs

**Scenario A — Detect root use immediately and notify**
1. CloudTrail (all Regions) → CloudWatch Logs.
2. Metric Filter: `$.userIdentity.type = "Root" ...`, `metricValue=1, defaultValue=0`.
3. Alarm: `Sum`, period 300, threshold ≥1, `notBreaching`, N=1/M=1.
4. SNS → security team. (Matches the CIS benchmark control)
- **Where people go wrong**: the `Average` statistic, a missing `defaultValue`, a single-Region trail, a missing SNS KMS key policy.

**Scenario B — Unify security posture across multiple accounts**
1. Designate a Security Hub delegated administrator in Organizations.
2. Deploy the FSBP/CIS standards to members in bulk with Central Configuration (assuming Config is enabled in each member).
3. Aggregate into a single Region with Cross-Region Aggregation.
4. View security scores and findings together from the delegated administrator account.
- **Where people go wrong**: per-account script deployment (no enforcement), blocking with an SCP (cannot express exceptions), leaving accounts without Config enabled.

**Scenario C — Automatically remediate CRITICAL findings**
1. All findings are published automatically to EventBridge.
2. Rule: `source=aws.securityhub`, `Severity.Label=CRITICAL`, `Workflow.Status=NEW`.
3. Target: Step Functions → apply an isolation SG + EBS snapshot + update the Security Hub status + SNS.
4. The handler is idempotent, failures are preserved in a DLQ, and the role is least privilege.
- **Where people go wrong**: terminating the instance as the first action (destroys evidence), broad permissions on the response role, no DLQ.

**Scenario D — Post-incident forensics**
1. CloudTrail/VPC Flow are retained long term in S3 (or Security Lake).
2. Use Athena with queries restricted by partition (a specific IP, period, event).
3. When continuous monitoring becomes necessary, add a hot-data indexing layer of Firehose → OpenSearch.
- **Where people go wrong**: filtering the period on a column that is not a partition key, not enabling data events and so being unable to answer "what was taken."

**Scenario E — The logs went quiet**
1. Symptom: no security alarm has fired for days and the dashboard looks calm.
2. Order of checks: is the trail alive (search for `StopLogging` events) → are events arriving in CloudWatch Logs → is the metric filter matching (metric graph) → alarm state history → SNS subscription and KMS key policy.
3. Structural fix: make the stoppage of log inflow itself an alert with a **heartbeat alarm** (`treat-missing-data=breaching`).
- **Key point**: "Quiet" is not proof of safety but **a signal that inspection is needed**.

**Scenario F — So many alerts that nobody looks**
1. Wrong responses: turning off standards, deleting alarms, raising thresholds, disabling integrations — all of these are choices that *reduce detection*.
2. Correct order: (a) separate SNS topics and channels by severity → (b) require persistence with N of M and composite alarms → (c) suppress only approved exceptions with Security Hub automation rules (record the reason) → (d) aggregate medium and lower severities through SQS and send a daily summary → (e) create tickets **per resource**, not per finding.
3. Give each severity a **different time axis**. CRITICAL is immediate, with no window.
- **Key point**: cut noise at the *reach* stage, not the *generation* stage.

**Scenario G — The same control fails hundreds of times**
1. Wrong response: 200 tickets to remediate resources one by one.
2. Correct diagnosis: mass failures are the symptom of a **wrong default**, not of individual mistakes.
3. Fix: account-level default settings (for example default encryption, public access block), correcting IaC templates, preventive blocking with SCPs. Only then remediate the remaining residue individually.
- **Key point**: if the rate of creation is faster than the rate of remediation, posture never improves.

Mature organizations run these as *layers*. Hot (recent, frequently queried) = OpenSearch, warm/cold (long-term, occasional investigation) = S3 + Athena, normalization hub = Security Lake, findings plane = Security Hub, automation nervous system = EventBridge. The insight common to practice and the exam is that no single tool does everything, and that each tool's *cost model* (always-on cluster vs pay-per-scan) governs the layering decision.

## The Silent Failure Points of the Pipeline

One theme recurred throughout all of week 8 — **this plumbing stops without errors.** Wherever it breaks, nothing appears on screen, and it even looks calm. A considerable number of exam questions point at exactly this spot.

| Where it broke | Symptom | How to check | Structural fix |
|----------------|---------|--------------|----------------|
| The trail does not send to CloudWatch Logs | The metric filter is always 0 | The metric graph is flat | Heartbeat alarm |
| Log group KMS key policy missing | Log ingestion fails | The service principal in the key policy | Policy validation at deployment |
| `defaultValue` and `Sum` not set | The alarm never fires | The alarm history is empty | Standard template (IaC) |
| SNS topic KMS policy missing | The alarm is in ALARM but there is no notification | Compare alarm state against delivery history | **Synthetic event delivery test** |
| Config recorder stopped or scope narrowed | Controls are `NO_DATA`, **the score rises** | Track the number of evaluated controls | Look at the score and the control count together |
| Security Hub aggregation Region not specified | CRITICAL findings in other Regions are not seen | Check the finding count per Region | Configure the aggregation Region |
| Cross-account bus permission on one side only | Events do not reach the center | Whether the DLQ is backing up | Alarm on DLQ backlog itself |
| Response handler failure | There are findings but no action | Step Functions execution history | Retry + DLQ + archive replay |
| Periodic job stopped | Stateful risk is left unattended | Time of the last successful run | Run heartbeat |
| Data events not enabled | Cannot answer "what was taken" | The trail's event selectors | Enable in advance (cannot be applied retroactively) |

The last row is especially important. **Logging is not applied retroactively.** Other failures, once found and fixed, return to normal from that point on, but the period during which data events were not enabled remains a gap forever. This is why the principle learned in week 7 remains fully valid in week 8.

Two sentences recur in post-mortem reports of cloud breaches — **"The signal was already in the logs"** and **"The alarm went off but nobody responded."** In the 2013 Target breach, the fact that security tool alerts fired but did not lead to a response was publicly pointed out through reports such as the US Senate report, and in major cloud breach cases as well, the *time taken to discover* the breach, more than the breach itself, was repeatedly cited as the problem. The two sentences look like different failures, but the cause is one — **the path by which signals reach people and automation was never designed.** What week 8 covered is, in the end, that path. The transformation that turns logs into numbers (day1), the normalization that gathers many judgments into one schema (day2), the queries that interrogate what has accumulated (day3), and the routing that connects signals to actions (day4). If any one segment is missing, even with all the rest in place, the result is the same as "not detected."

## Alert Fatigue: The Second Theme Running Through Week 8

On all four days the same problem appeared in a different face. On day1 it was alarms multiplying too much, on day2 it was control results growing as many as the number of resources, on day4 it was automation instead increasing alerts. On the exam it appears as the stereotyped sentence **"reduce noise but do not create blind spots."**

There is one dividing line between right and wrong answers — **does it reduce detection, or does it reduce reach?**

| Approach | Right/Wrong | Reason |
|----------|-------------|--------|
| Separate channels by severity | **Right** | All detection is kept, only reach is adjusted |
| Require persistence with N of M and composite alarms | **Right** | Only one-off false positives are filtered |
| Suppress approved exceptions together with a reason | **Right** | Findings and records remain |
| Aggregate medium and lower severities into a summary | **Right** | The trend must still be reviewed |
| Group tickets per resource | **Right** | Converted into a unit that can be handled |
| Delete metric filters and alarms | Wrong | Permanent blind spot |
| Raise thresholds substantially | Wrong | Becomes transparent to low-and-slow attacks |
| Disable standards and integrations | Wrong | Loss of source visibility |
| Add to the detector's trusted list | Wrong | **No findings are generated** |
| Send everything to on-call | Wrong | Ends with nobody looking = detection stops |

It is interesting that the last two rows pair up. **Sending too little and sending too much reach the same result** — the signal does not reach people. Alert design should be judged not by "how much to send" but by **"is it an amount the recipient can act on every time."**

## A Quick Check of Cost and Operations Pitfalls

- Athena: without partition pruning it does a full scan (cost explosion). Savings come from columnar (Parquet). Put a scan cap on the workgroup.
- Athena results bucket: it is as sensitive as the original logs — apply the same level of encryption and access control.
- OpenSearch: always-on cluster cost. Tier long-term retention to S3. Keep the domain inside the VPC with FGAC.
- CloudWatch Logs: do not put every log here. Only logs you will alarm on; send the originals straight to S3.
- CloudWatch: Metric Filter `defaultValue=0` + Alarm `Sum` is the pair for count detection. The heartbeat alarm alone is the exception (`breaching`).
- Metric filter dimensions: putting attacker-controlled values (usernames, IPs) in them causes a cardinality explosion → a cost attack becomes possible.
- EventBridge: at-least-once → idempotent handlers + DLQ + archive (replayability).
- Automated response roles: least privilege + resource conditions. Put irreversible actions behind an approval gate.
- KMS: for both log groups and SNS topics, the **key policy** must grant permission to the service principal (IAM alone is not enough).
- Security Hub: when several standards are on, the consolidated control results (`SECURITY_CONTROL`) come along too.

## This Week's Knowledge in Order: What Do You Build First

In case the exam asks "what should be done first," the build order is summarized in one view.

```
0. Secure the raw logs     CloudTrail (all Regions, organization) → S3 (separate Log Archive account)
                           + dual delivery of only the logs you will alarm on to CloudWatch Logs
                           * Not retroactive — first of all; decide now whether data events are needed
   ▼
1. Configuration evaluation base   Enable the AWS Config recorder in each account and Region
                           * Without this, every Security Hub standard is meaningless
   ▼
2. Threshold detection     CIS monitoring set: metric filters + alarms + heartbeat
   ▼
3. Aggregation and standards   Enable Security Hub → CIS → FSBP → consolidated control results
                           → delegated administrator + central configuration + aggregation Region
   ▼
4. Query capability        Athena tables (partition projection) + workgroup guardrails
                           (if always-on monitoring is needed, add Firehose → OpenSearch)
   ▼
5. Response automation     EventBridge rules → reversible actions automatic / irreversible ones behind an approval gate
                           + DLQ + archive + routing by severity
   ▼
6. Organization-wide standardization   Security Lake (OCSF) — when third-party SIEM or multi-account analysis is needed
```

There is logic in this order. **A lower step does not hold without the step above it.** Without Config there are no standards, without logs there are no queries, and without aggregation there is no single automation. On the exam, the answer to a question asking "what to do first" is almost always **a prerequisite lower down** — just as the answer to "standard controls are not being evaluated" is enabling Config.

## Summary

Week 8 in one sentence: **"Logs are not something to pile up but something to *convert into signals, normalize and gather, query, and respond to automatically*."** CloudWatch is thresholds on a single signal, Security Hub is aggregation and scoring of findings, Athena/OpenSearch/Logs Insights are analysis according to location and timing, EventBridge is response routing, and Security Lake is the OCSF normalization hub.

From the perspective of exam preparation, this week leaves three reflexes.

1. **Classification reflex** — read the passage and first decide "is it detection, aggregation, analysis, or response." Then ask "where is the data and what is the tense." With these two questions most candidates narrow to one.
2. **Prerequisite reflex** — in a passage where something "does not work," suspect not the feature but the **prerequisite**. Is Config off, is there no log path, did the key policy block it, did it not filter by the partition key.
3. **Reversibility reflex** — in automated-response design questions, split the options by whether the action can be undone. If termination or deletion is in unattended automation, it is the wrong answer.

And from the perspective of practice, one thing remains. **This pipeline works best on the day it is built, and afterwards it quietly goes stale.** The Config scope narrows, new accounts drop out of automatic enrollment, the subscriber of the alert channel leaves the company, and the response handler's permissions are revoked. None of it raises an error. So the last component of a detection pipeline is always **a mechanism that watches the pipeline itself** — heartbeat alarms, DLQ backlog monitoring, run records of periodic jobs, and regular synthetic event delivery tests. In week 9 we place the actual detection services (GuardDuty, Detective, Inspector) on top of this plumbing and cover how to read the findings they produce.

### One-Line Summary Checklist

- [ ] Can you first split a problem into the 4 categories of "detection / aggregation / analysis / response"
- [ ] Can you immediately choose an analysis tool by **data location + tense of the question**
- [ ] Do you distinguish ASFF (findings, Security Hub) from OCSF (raw logs, Security Lake)
- [ ] Do you know the dependency of Security Hub standards on Config, and the trap that the score *rises* when evaluation stops
- [ ] Do you distinguish the pair for count detection (`defaultValue=0` + `Sum`) from the heartbeat alarm exception (`breaching`)
- [ ] Can you name the three levers for Athena cost savings (partitions, columnar, compression)
- [ ] Can you immediately classify reversible versus irreversible actions in automated response
- [ ] Can you pick out the wrong-answer patterns among alert fatigue countermeasures that "reduce detection"
- [ ] Do you know the pipeline's silent failure points (log path, key policy, cross-account permissions, DLQ) as an inspection order

---

## 📝 Practice Questions

**Question 1.** Which service combination correctly maps to "discover whether PII is stored in S3," "scan EC2 for CVE vulnerabilities," and "detect communication with malicious IPs," respectively?

A) Macie / Inspector / GuardDuty  
B) GuardDuty / Macie / Inspector  
C) Inspector / GuardDuty / Macie  
D) Config / CloudWatch / Athena  

**Answer: A**  
Explanation: Sensitive data (PII) discovery is Macie, software vulnerability (CVE) scanning is Inspector, and threat-intelligence and behavior-based malicious communication detection is GuardDuty. Each tool's division is clear by *what* it detects, and Config/CloudWatch/Athena are at a different layer from these three detection roles.

---

**Question 2.** The logs are in CloudWatch Logs, and during incident response you want to query them immediately, without separate ingestion, to see the AccessDenied trend. What is the most suitable tool?

A) Athena  
B) Create a new domain in Amazon OpenSearch and ingest into it  
C) CloudWatch Logs Insights  
D) Security Lake  

**Answer: C**  
Explanation: If the data is already in CloudWatch Logs and immediacy is required, Logs Insights is the answer. Athena/Security Lake target S3 data, and creating a new OpenSearch domain and ingesting into it during incident response lacks immediacy.

---

**Question 3.** You want to aggregate the findings of multiple detection services (GuardDuty, Inspector, Macie) into a single format and view the CIS/FSBP standards pass rate as a security score. Separately, you also want to normalize organization-wide *raw logs* into the OCSF standard so a SIEM can query them. Which service is each?

A) Both are Security Hub  
B) Findings aggregation and scoring is Security Hub (ASFF), and OCSF normalization of raw logs is Security Lake  
C) Findings aggregation is Security Lake, and raw logs are Security Hub  
D) Both are AWS Config  

**Answer: B**  
Explanation: Aggregation and normalization (ASFF) of detector findings, standards checks, and security scores belong to Security Hub, and the OCSF-normalized data lake of raw security logs belongs to Security Lake. The format name (ASFF vs OCSF) and the target (findings vs raw logs) are the distinguishing clues, and Config is a configuration evaluation engine and is neither.

---

**Question 4.** An alarm that detects 5 or more failed console logins in 5 minutes from CloudTrail logs does not work. Which two things should be checked together in the configuration?

A) Whether defaultValue=0 is set on the Metric Filter, and whether the Alarm Statistic is Sum  
B) SNS encryption and the KMS key policy  
C) The log group retention period and the Region  
D) OpenSearch index status and partitions  

**Answer: A**  
Explanation: For count-based detection, the Alarm Statistic must be Sum so that the total occurrences within the period can be compared with the threshold, and without defaultValue=0 on the Metric Filter, gaps appear in missing intervals and evaluation becomes unreliable. These two are checked as a pair. SNS encryption, the retention period, and OpenSearch are unrelated to how this count-based detection works.

---

**Question 5.** You build a pipeline in which, when GuardDuty detects EC2 cryptomining, it automatically isolates the instance, creates a forensic EBS snapshot, and notifies the security team. Which set includes everything that must be considered for operational hygiene?

A) Grant Administrator to the automatic response role, and assume the handler runs only once  
B) Design the handler to be idempotent, preserve events in a DLQ when the target fails, and use a least-privilege role + resource conditions  
C) A cron that polls every minute instead of EventBridge  
D) Treat all findings as ignored (SUPPRESSED)  

**Answer: B**  
Explanation: EventBridge delivers at least once, so the handler must be idempotent, events should be preserved in a DLQ in case a target invocation fails, and the automatic response role must reduce its attack surface with least privilege and resource conditions. Granting Administrator and assuming a single run are dangerous, a polling cron is inefficient and delayed, and suppressing all findings in bulk neutralizes detection.

---

