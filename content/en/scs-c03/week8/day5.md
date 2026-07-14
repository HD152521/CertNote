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

## 📝 연습 문제

**문제 1.** "S3에 PII가 저장되어 있는지 발견", "EC2의 CVE 취약점 스캔", "악성 IP와의 통신 탐지"에 각각 대응하는 서비스 조합으로 옳은 것은?

A) Macie / Inspector / GuardDuty  
B) GuardDuty / Macie / Inspector  
C) Inspector / GuardDuty / Macie  
D) Config / CloudWatch / Athena  

**정답: A**  
해설: 민감데이터(PII) 발견은 Macie, 소프트웨어 취약점(CVE) 스캔은 Inspector, 위협 인텔·행위 기반 악성 통신 탐지는 GuardDuty다. 각 도구는 *무엇을* 탐지하느냐로 분담이 명확하며, Config/CloudWatch/Athena는 이 세 가지 탐지 역할과 다른 계층이다.

---

**문제 2.** 로그가 CloudWatch Logs에 있고, 사고 대응 중 별도 적재 없이 즉시 질의해 AccessDenied 추세를 보려 한다. 가장 적합한 도구는?

A) Athena  
B) Amazon OpenSearch에 새 도메인을 만들어 적재  
C) CloudWatch Logs Insights  
D) Security Lake  

**정답: C**  
해설: 데이터가 이미 CloudWatch Logs에 있고 즉시성이 요구되면 Logs Insights가 정답이다. Athena/Security Lake는 S3 데이터 대상이고, 사고 대응 중 OpenSearch 도메인을 새로 만들어 적재하는 것은 즉시성이 없다.

---

**문제 3.** 여러 탐지 서비스(GuardDuty, Inspector, Macie)의 핀딩을 단일 포맷으로 집계하고 CIS/FSBP 표준 합격률을 보안 점수로 보려 한다. 그리고 별개로, 조직 전역 *원시 로그*를 OCSF 표준으로 정규화해 SIEM이 질의하게 하려 한다. 각각의 서비스는?

A) 둘 다 Security Hub  
B) 핀딩 집계·점수는 Security Hub(ASFF), 원시 로그 OCSF 정규화는 Security Lake  
C) 핀딩 집계는 Security Lake, 원시 로그는 Security Hub  
D) 둘 다 AWS Config  

**정답: B**  
해설: 탐지기 핀딩의 집계·정규화(ASFF)·표준 점검·보안 점수는 Security Hub, 원시 보안 로그의 OCSF 정규화 데이터 레이크는 Security Lake다. 포맷 이름(ASFF vs OCSF)과 대상(핀딩 vs 원시 로그)이 구분 단서이며, Config는 구성 평가 엔진으로 둘 다 아니다.

---

**문제 4.** CloudTrail 로그로 5분 동안 콘솔 로그인 실패 5회 이상을 탐지하는 알람이 동작하지 않는다. 구성에서 함께 점검해야 할 두 가지는?

A) Metric Filter에 defaultValue=0 설정 여부와, Alarm Statistic이 Sum인지  
B) SNS 암호화와 KMS 키 정책  
C) 로그 그룹 보존 기간과 리전  
D) OpenSearch 인덱스 상태와 파티션  

**정답: A**  
해설: 카운트 기반 탐지는 Alarm Statistic이 Sum이어야 기간 내 발생 합을 임계와 비교할 수 있고, Metric Filter에 defaultValue=0이 없으면 결측 구간이 생겨 평가가 흔들린다. 이 둘은 짝으로 점검한다. SNS 암호화·보존 기간·OpenSearch는 이 카운트 탐지 동작과 무관하다.

---

**문제 5.** GuardDuty가 EC2 크립토마이닝을 탐지하면 자동으로 인스턴스를 격리하고 포렌식용 EBS 스냅샷을 만든 뒤 보안팀에 알리는 파이프라인을 구성한다. 운영 위생상 반드시 고려할 것을 모두 고른 묶음은?

A) 자동 대응 역할에 Administrator 부여, 핸들러는 단발 실행 가정  
B) 핸들러를 멱등하게 설계, 대상 실패 시 DLQ로 보존, 최소 권한 역할 + 리소스 조건  
C) EventBridge 대신 매분 폴링하는 cron  
D) 모든 핀딩을 무시 처리(SUPPRESSED)  

**정답: B**  
해설: EventBridge는 at-least-once 전달이라 핸들러는 멱등해야 하고, 대상 호출 실패 대비 DLQ로 이벤트를 보존하며, 자동 대응 역할은 최소 권한과 리소스 조건으로 공격 표면을 줄여야 한다. Administrator 부여·단발 가정은 위험하고, 폴링 cron은 비효율·지연이며, 핀딩 일괄 억제는 탐지를 무력화한다.

---

