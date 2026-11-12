# Day 5 - Week 8 Integration: Monitoring, Aggregation, Analysis Scenario Comprehensive Review

This week addressed not "logging itself" but rather *how to turn accumulated logs into signals, and signals into responses*. Today we thread together four days' worth of tools — CloudWatch (threshold detection), Security Hub (aggregation, normalization, scoring), Athena/OpenSearch/Logs Insights (analysis), EventBridge/Security Lake (automation and integration) — into one flow and clarify the exam's *boundaries that confuse tool selection*. The key is not memorizing individual features but instantly answering "why is *this* tool the answer and *that* tool is not" for any given requirement.

## One-Page View: Detection-Aggregation-Analysis-Response Pipeline

```
 [Collection]       [Detection]         [Aggregation & Normalization]  [Analysis]         [Automation & Response]
CloudTrail ─┐   CloudWatch ─┐
VPC Flow ───┼─▶ Metric Filter│        Security Hub ─┐    Athena (S3, post-incident)
ELB/R53 ────┤   + Alarm      ├──Findings──▶ (ASFF normalization) ├──▶ Logs Insights ──┐
App logs ─────┘   GuardDuty ───┤        Security Score/Standards│    OpenSearch       │
                Inspector ───┤        (CIS/FSBP)              │    (near-real-time) │
                Macie ───────┘                                │                     ▼
                                                               └──▶ EventBridge ──▶ SNS (alerts)
                                                                    (routing)     ──▶ Lambda/SSM (remediate)
                                                                                  ──▶ Step Functions (orchestrate)

 [Unified Storage] Security Lake: Normalize raw logs above to OCSF/Parquet in S3 data lake — Athena/OpenSearch/SIEM query with single schema
```

> 💡 **Related Theory**: This flow maps NIST CSF's *Detect* and *Respond* functions to AWS services. CloudWatch/GuardDuty perform detection, Security Hub aggregates and evaluates detection results, EventBridge orchestrates responses. On exams, first identifying whether a requirement is detection, aggregation, analysis, or response narrows candidate services.

## Boundary Clarity 1: Division of "Detection" Tools

The most frequently confused area. Differentiation by *what* is detected.

| Requirement | Answer | Why |
|-------------|--------|-----|
| Alert on specific log patterns (root use, login failures N times) as threshold | CloudWatch Metric Filter + Alarm | Pattern within single log group → number → threshold |
| Malicious IP communication, cryptocurrency mining, credential anomalies | GuardDuty | Threat intelligence and ML-based behavior detection |
| CVE vulnerabilities in EC2/containers/Lambda | Inspector | Software vulnerability scanning |
| PII/sensitive data discovery in S3 | Macie | Data classification and discovery |
| "Different from baseline" in metrics changing over time | CloudWatch Anomaly Detection | Arbitrary metric ML bands |
| Unintentionally publicly shared resources (buckets/roles) | IAM Access Analyzer | External access possibility analysis |

> ⚠️ **Trap**: Do not reflexively choose GuardDuty when seeing the vague phrase "detect security anomalies." *What* is anomalous decides it — specific API call threshold → CloudWatch, threatening behavior → GuardDuty, vulnerability → Inspector, sensitive data → Macie.

## Boundary Clarity 2: Division of "Analysis" Tools

Data location and timeliness decide.

| Requirement | Answer | Core Criterion |
|-------------|--------|-------------------|
| Large logs in S3, one-off SQL, low cost | Athena | Data=S3, post-incident, one-off |
| Logs in CloudWatch Logs, query instantly | Logs Insights | Data=CloudWatch Logs, instant |
| Near-real-time dashboard, full-text search, repeated correlation | OpenSearch | Indexing, continuous operations |
| All organization logs in single normalized schema | Security Lake (+Athena/OpenSearch) | OCSF normalization repository |

> 🎯 **Scenario**: "Investigate incident from 90 days ago, logs only in S3, minimize cost" → Athena + partitioning. "Logs in CloudWatch Logs, incident response now" → Logs Insights. "SOC continuous monitoring dashboard" → OpenSearch. Same "log analysis" splits by location and timeliness.

## Boundary Clarity 3: Security Hub vs Security Lake vs Config

Three services gather around similar words like "organization security state" and cause confusion.

- **AWS Config**: Records resource *configurations*, tracks changes, evaluates rules. The *source evaluation engine* for "is this resource in compliant configuration?" Security Hub standards internally use it.
- **Security Hub**: Aggregates *findings* from multiple detectors to ASFF, checks standards (CIS/FSBP), generates security score. "See organization security state and findings at a glance now."
- **Security Lake**: S3 data lake normalizing *raw security logs* to OCSF. "Collect all logs in single schema for analysis/SIEM."

```
Config       → Configuration evaluation (settings match policy?)    → Security Hub standards' engine
Security Hub → Finding aggregation, score (detection results board) → ASFF format
Security Lake→ Raw logs normalization repository (for analysis)    → OCSF format
```

> ⚠️ **Trap**: Both use "normalize multiple sources," causing confusion. *Findings* (detection results) normalization, aggregation, and scoring is Security Hub (ASFF). *Raw logs* normalization, storage, and analysis is Security Lake (OCSF). The format name (ASFF vs OCSF) is the decisive clue.

## Integrated Scenario Walkthroughs

**Scenario A — Instant Root Usage Detection and Alert**
1. CloudTrail (all regions) → CloudWatch Logs.
2. Metric Filter: `$.userIdentity.type = "Root" ...`, `metricValue=1, defaultValue=0`.
3. Alarm: `Sum`, period 300s, threshold ≥1, `notBreaching`.
4. SNS → Security Team. (Aligns with CIS benchmark controls)

**Scenario B — Unified Multi-Account Security State**
1. Designate Security Hub delegated administrator in Organizations.
2. Deploy FSBP/CIS standards to all members via Central Configuration (requires Config enabled on each member).
3. Aggregate into single region via Cross-Region Aggregation.
4. Review unified security score and findings in delegated administrator account.

**Scenario C — Automatic CRITICAL Finding Remediation**
1. All findings auto-publish to EventBridge.
2. Rule: `source=aws.securityhub`, `Severity.Label=CRITICAL`, `Workflow.Status=NEW`.
3. Target: Step Functions → apply isolation SG + create EBS snapshot + update Security Hub status + SNS.
4. Handler is idempotent, failed events preserved in DLQ, least-privilege role.

**Scenario D — Post-Incident Forensics**
1. CloudTrail/VPC Flow long-term retained in S3 (or Security Lake).
2. Athena query scoped by partition (specific IP, time range, event type).
3. When continuous monitoring becomes needed, add Firehose → OpenSearch hot data indexing layer.

> 🔍 **Deeper Dive**: Mature organizations operate these as *layers*. Hot (recent, frequent queries)=OpenSearch, warm/cold (long-term, occasional investigation)=S3+Athena, normalization hub=Security Lake, findings plane=Security Hub, automation nervous system=EventBridge. No single tool does everything, and each tool's *cost model* (always-on cluster vs per-scan) drives the layering decision — insight common to both practice and exams.

## Quick Checklist: Cost and Operations Traps

- Athena: No partition pruning → full scan (cost shock). Reduce via columnar (Parquet).
- OpenSearch: Always-on cluster cost. Tier long-term retention to S3.
- CloudWatch: Metric Filter `defaultValue=0` + Alarm `Sum` is the pair for count detection.
- EventBridge: at-least-once → idempotent handlers + DLQ.
- Auto-remediation role: Least privilege + resource conditions.
- KMS-encrypted log groups: Key policy must grant CloudWatch Logs service principal permission.

## Closing

Week 8 in one sentence: **"Logs are not just accumulated — they are *converted to signals, normalized and collected, queried, and responded to automatically.*"** CloudWatch is single-signal thresholds, Security Hub is finding aggregation and scoring, Athena/OpenSearch/Logs Insights are position-and-timeliness-based analysis, EventBridge is response routing, Security Lake is OCSF normalization hub. On exams, forming the habit of first asking "is this requirement detection/aggregation/analysis/response, where is the data, and what is the timeliness?" narrows down the correct answer.

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

