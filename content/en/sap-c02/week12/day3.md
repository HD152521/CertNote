# Day 3 - Cost Explorer·Budgets·CUR — Layers of Cost Visibility, Budget Auto-Control, FinOps Data Pipeline

"What cannot be measured cannot be managed" — this maxim is brutally effective with cloud costs. In on-premises, buying more servers required approval; in cloud, one `terraform apply` by a developer creates tens of thousands of dollars monthly in minutes. In this distributed, real-time, self-service environment, cost control requires three layers: **visibility (viewing) → budget (thresholds) → auto-response (control)** — provided respectively by Cost Explorer, Budgets, and CUR + Budgets Action. This maps exactly to the **FinOps Foundation** framework established in 2019: "Inform → Optimize → Operate" — Inform (visibility·allocation), Optimize (rightsizing·commitments), Operate (governance·automation).

In SAP-C02, this domain covers "which tool provides which granularity," "what can budget auto-actions enforce when exceeded," "how do you SQL-analyze hourly billing," "how do you split multi-account costs by team." Today we decompose the precise tool boundaries, data layers, budget auto-control internals, and multi-cloud cost standards.

## Three Layers of Cost Data — Granularity and Purpose Tradeoffs

Before memorizing the three tools, you must grasp that **they view the same cost data at different resolutions**. The same billing data becomes Cost Explorer when summarized and visualized, CUR when unpacked hourly in raw form, and Budgets when monitored with thresholds.

| Tool | Data Granularity | Primary Use | Strength | Limitation |
|------|------------------|------------|----------|-----------|
| **Cost Explorer** | Daily (hourly in some cases) | Visualization·Diagnosis·Forecasting | Fast interactive analysis, Forecast | No deep column-level analysis |
| **Budgets** | Daily/Monthly aggregate | Alerting·Auto-control | Threshold-based actions | Not an analysis tool |
| **CUR** | **Hourly, ~200 columns** | Detailed analysis·BI | All billing items, SQL | No direct visualization (BI required) |

Core principle: **Cost Explorer is "quick visual," CUR is "deep SQL," Budgets is "automate on threshold."** When you see "hourly + all items + SQL" in a scenario, it's always CUR. When "auto-stop on overage" appears, it's Budgets Action.

> 💡 **Related Theory**: This layered structure mirrors data warehouse thinking: **OLTP-OLAP separation** and the **medallion architecture (bronze→silver→gold)**. CUR is the unprocessed fact table (bronze) that flows directly to S3; Athena·Redshift handle the silver layer (refinement·aggregation); Cost Explorer·QuickSight dashboards serve as the gold layer (consumption views). Cost Explorer acts like an OLAP frontend showing pre-aggregated, cached cubes quickly — responses are fast but arbitrary deep queries aren't possible. Immediacy (Cost Explorer) and arbitrariness (CUR) are a fundamental tradeoff; large FinOps organizations use both: Cost Explorer for daily monitoring, CUR for unit-price and deep anomaly analysis.

> 🔍 **Going Deeper**: Cost Explorer is free but charges **$0.01 per API call**. When building FinOps dashboards, polling Cost Explorer API every minute accumulates call charges; for large-scale automation, querying CUR via Athena is both more cost-effective for analysis and cheaper on API calls. In exams, if "automate cost analysis in a custom dashboard" appears, **CUR+Athena+QuickSight** often beats Cost Explorer API polling as the superior answer.

## Cost Explorer — Visualization, Forecasting, and Commitment Reports

Cost Explorer visualizes 12-13 months of costs (up to 38 months configurable) across dimensions like day, month, service, account, and tags. Beyond being a simple graphing tool, two advanced features frequently appear in exams:

- **Forecast**: Predicts future costs up to 12 months based on historical patterns — the key signal for "establishing next quarter's budget."
- **Savings Plans / RI Coverage·Utilization Reports**: Shows what percentage of usage is covered by commitments (Coverage), and how much of purchased commitments is actually used (Utilization). This is the exact dashboard for diagnosing "RI over-purchase reducing SP utilization" from yesterday.

> 🔍 **Going Deeper**: Coverage and Utilization are an easy-to-confuse pair. **Coverage** is "what fraction of total usage gets discounted via commitments" (low → room to buy more commitments) — usage perspective. **Utilization** is "what fraction of purchased commitments gets used" (low → commitments are wasted) — commitment perspective. Ideal state is maintaining Utilization near 100% (no wasted commitments) while raising Coverage to baseline consumption levels. In exams, "should we buy more commitments" signals Coverage; "are commitments going unused" signals Utilization.

> 🔍 **Going Deeper**: Cost Explorer's Forecast isn't simple linear extrapolation — it's **statistical prediction with confidence intervals** (prediction intervals). If historical data is sparse or volatile, intervals widen, indicating low forecast confidence. This reflects standard time-series principles (higher variance → wider intervals), and leads to the insight that for scenarios like "new service with insufficient history, forecast is unstable," Anomaly Detection may be more appropriate than Forecast.

## AWS Budgets — Beyond Alerts to Auto-Control

The real exam point for Budgets isn't simple alerts — it's **Budgets Action**. When thresholds are exceeded, you can do more than email an administrator — you can **automatically take action**.

| Budget Type | Monitored Target |
|-------------|------------------|
| **Cost Budget** | Amount limit ($) |
| **Usage Budget** | Usage (hours, GB, request counts, etc.) |
| **RI / SP Utilization** | Commitment utilization floor |
| **RI / SP Coverage** | Commitment coverage |

**Budgets Action** can automatically perform on threshold breach:

- **IAM Policy Application**: Attach Deny policies to specific users·roles, blocking new resource creation
- **SCP Application**: Block specific actions at Organization level
- **EC2/RDS Stopping**: Auto-stop designated instances

> 🎯 **Scenario**: "When development account monthly costs exceed $5,000, prevent starting new EC2 instances." → **Budgets (Cost Budget) + Budgets Action (automatically apply IAM Deny Policy)**. CloudWatch Alarm only sends notifications; Lambda schedules run post-hoc as batches, not real-time blocking. Only Budgets Action combines "threshold exceeded → immediately apply policy" in one mechanism. Actions can run automatically or require manual approval; for high-impact operations like SCP application, approval mode is safer.

> ⚠️ **Trap**: "Auto-stop instances on cost overage" cannot be answered with CloudWatch Alarm. CloudWatch is metric-based alerting/triggering, not a mechanism for auto-applying IAM/SCP on billing thresholds (note: billing metrics themselves are only exposed in us-east-1, another trap). Also, Budgets Action design must distinguish "stop what's running" (EC2 stop) from "prevent new starts" (IAM Deny) — if the scenario says "block new creation," it's IAM/SCP; if "stop current running," it's EC2/RDS stop.

> 💡 **Related Theory**: Budgets' limitation is **billing data update latency**. AWS billing data typically refreshes in hours, so Budgets isn't real-time — there's a gap between "overage occurred" and "threshold crossed and action triggered." This reflects **eventual consistency** in distributed billing systems. For true hard caps (absolute protection from overage), Budgets alone isn't enough; layer on preventive controls — use SCP to prohibit entire resource types, regions, or services beforehand. In exams, if "guarantee costs never exceed budget," suspect preventive SCP/Service Quotas rather than post-hoc Budgets.

## CUR — The Deepest Truth and Analysis Pipeline

CUR (Cost and Usage Report) is AWS billing's **original fact table**. It records, hourly across ~200 columns, every billing item. CUR itself has no visualization — it lands in S3 (typically as Parquet), and you query·visualize it via **Athena·Redshift·QuickSight**.

```
[CUR / Data Exports Definition] → [S3 Bucket Receives Hourly Parquet Daily]
                     ↓
        [Glue Crawler / Athena Table]
                     ↓
        [Athena SQL Query]  ← Deep unit-price·UsageType analysis
                     ↓
        [QuickSight Dashboard]  ← FinOps Visualization (e.g., CUDOS / CID Dashboard)
```

CUR's power lies in columns like **lineItem/UsageType**. For example, `USE2-DataTransfer-Out-Bytes` is internet egress from us-east-2, `NatGateway-Bytes` is NAT Gateway throughput — Cost Explorer lumps this as "data transfer," but CUR breaks it down precisely. Large-environment unit-price analysis is impossible without CUR. AWS's published **CUDOS / Cost Intelligence Dashboard (CID)** is the standard open template visualizing CUR via QuickSight.

> 🔍 **Going Deeper**: **CUR 2.0** (2024) redesigned the schema for more stable, BI-friendly columns (old CUR had variable columns depending on used resources, making schema evolution awkward). CUR is also now integrated into **Data Exports**, allowing export in **FOCUS** (FinOps Open Cost and Usage Specification) standard format. FOCUS is the FinOps Foundation-led industry standard normalizing billing data from multiple clouds (AWS·Azure·GCP·OCI) into identical schemas (common columns: BilledCost·EffectiveCost·ServiceCategory, etc.). In exams, if "consolidate multi-cloud costs in a single schema," the signal is FOCUS-format Data Export.

> 📚 **Case Study**: A SaaS company saw "data transfer = 25% of total" in Cost Explorer but couldn't find the cause for months. Querying CUR in Athena by UsageType revealed the culprit — Cross-AZ DB replication traffic (`DataTransfer-Regional-Bytes`) was 70% of data transfer. Cost Explorer's bundling as "data transfer" made diagnosis impossible; only CUR's column-level analysis pinpointed the root cause. (Subsequently, they moved read replicas to the same AZ, significantly reducing costs.) Lesson: root cause analysis of cost anomalies requires CUR-level detail.

## Cost Allocation Tag·Categories — Splitting Multi-Account Costs by Team

In multi-account, multi-team environments, answering "whose cost is this" requires **Cost Allocation Tags**. When you tag resources with `Project`, `Env`, `CostCenter` etc., and **activate** those tags in Billing console, costs segregate and aggregate by tag. Tags come in two kinds: user-defined and AWS-generated (`aws:` prefix, e.g., `aws:createdBy`).

Layering **Cost Categories** on top lets you create logical cost groups via combined rules: "Team A = Account X + Tag Y" etc. This mapping layer becomes essential when organizational structure and billing structure diverge.

> ⚠️ **Trap**: Cost Allocation Tags segregate **only costs after activation**. Past costs don't retroactively split. Scenario: "tags applied but last month's costs don't split by tag" = "that was before activation." This is why tag governance enforces tags at creation time — the best practice is three-layer defense: **Tag Policy (Organizations)** standardizes allowed tag keys/values; **SCP** denies resource creation without required tags; **AWS Config rules (required-tags)** detect post-hoc non-compliance.

> 💡 **Related Theory**: Cost allocation's core challenge is **shared cost distribution**. Resources like NAT Gateway, Transit Gateway, shared ALB, data transfer that multiple teams use don't fit neatly into single tags. FinOps distinguishes **showback** (show what each used) from **chargeback** (actually bill that team), and shared costs split via agreed allocation keys (usage ratios, equal splits, etc.). Cost Categories' **split charge rule** is exactly the function that redistributes shared costs to member groups by defined ratios. In exams, if "distribute shared infrastructure costs by team," split charge is the signal.

## Cost Anomaly Detection — ML-Based Anomaly Detection

Where Budgets monitors **pre-set thresholds**, **Cost Anomaly Detection** uses ML to **learn baseline patterns** and auto-detect abnormal spending. Useful when thresholds are unknowable (new services, unpredictable spikes). Set monitors by service, account, tag, or SP, and receive email/SNS alerts.

> 💡 **Related Theory**: Budgets vs Anomaly Detection is the classic **rule-based (threshold) vs learning-based (anomaly)** detection dichotomy. Budgets requires humans to define thresholds like "over $1000/month" (interpretable but hard to set, static). Anomaly Detection learns time-series patterns and auto-judges "this week's service cost is statistically abnormal" (no thresholds needed but learning period/interpretation costs). It's **static threshold vs dynamic baseline** monitoring theory itself. They're complementary — use Budgets for known hard caps, Anomaly Detection for unknown anomalies. Important: Anomaly Detection detects·alerts but cannot auto-block; enforcement is Budgets Action's job.

## Summary

Cost control is **visibility (Cost Explorer) → threshold control (Budgets) → deep analysis (CUR) → anomaly detection (Anomaly Detection)** — a 4-tier workflow matching FinOps' Inform→Optimize→Operate cycle. Same billing data: Cost Explorer visualizes it; CUR exposes it as hourly SQL (medallion bronze); Budgets watches thresholds. Auto-control is **Budgets Action (IAM/SCP/EC2 stop)**; team split is **Cost Allocation Tag + Cost Categories (+split charge)**; unknown anomalies are **Cost Anomaly Detection**. Multi-cloud integration uses **FOCUS-format Data Export** standard.

Common SAP exam mappings: (1) "hourly + all items + SQL analysis" → **CUR + Athena**, (2) "cost overage blocks new EC2 creation" → **Budgets Action (IAM/SCP Deny)**, (3) "forecast next 12 months" → **Cost Explorer Forecast**, (4) "diagnose commitment utilization" → **Cost Explorer Coverage/Utilization**, (5) "split costs by team/department" → **Cost Allocation Tag + Cost Categories**, (6) "allocate shared infrastructure costs" → **Cost Categories split charge**, (7) "auto-detect unknown abnormal spending" → **Cost Anomaly Detection**, (8) "guarantee costs never exceed budget" → **SCP/Service Quotas (preventive)**, (9) "consolidate multi-cloud costs in one schema" → **FOCUS Data Export**. Next day examines S3, data transfer, and NAT Gateway hidden costs.

---

## 📝 Practice Questions

**Question 1.** A FinOps team wants to break down every billing line item hourly with SQL and perform deep analysis at the unit-price (UsageType) level. Which is the most appropriate?

A) Cost Explorer
B) Output CUR to S3 and query it with Athena
C) AWS Budgets
D) Trusted Advisor

**Answer: B**

**Explanation:** CUR outputs every billing line item, with about 200 columns, hourly to S3 (usually in Parquet), and Athena enables SQL analysis along arbitrary dimensions and aggregations. You analyze at the unit-price level using the lineItem/UsageType columns. A (Cost Explorer) is a daily-granularity visualization that cannot do column-level deep analysis, and API calls are also charged per request. C (Budgets) is a threshold monitoring tool. D (Trusted Advisor) is a rule-based check. Trap: "hourly + all line items + SQL" is always CUR.

**Question 2.** The monthly cost of a development account must be automatically blocked from launching new EC2 instances once it exceeds $5,000. Which is the most appropriate?
A) Monitor cost with a CloudWatch Alarm and send a notification
B) Budgets (Cost Budget) + Budgets Action that automatically applies an IAM Deny policy
C) Run a Lambda function daily to check cost and block
D) A Cost Explorer Forecast alert

**Answer: B**

**Explanation:** A Budgets Action can automatically apply an IAM Deny policy or an SCP when a cost threshold is exceeded, immediately blocking the creation of new resources. A (CloudWatch Alarm) only notifies and has no mechanism to automatically apply IAM/SCP. C (scheduled Lambda) is an after-the-fact batch, not real-time blocking. D (Forecast) only displays a projection and is not a control. Trap: "automatically block when cost is exceeded" is a Budgets Action, and a CloudWatch Alarm is the wrong answer. (Note: because billing data is updated with a delay, if "must never exceed" is emphasized, additionally suspect a preventive SCP.)

---

**Question 3.** A team attached a `CostCenter` tag to every resource, but the last 3 months of cost do not appear separated by tag. What is the most likely cause?
A) Tags cannot be used to separate cost
B) The Cost Allocation Tag was activated only recently, and cost from before activation is not retroactively separated
C) CUR is disabled
D) There is no Budget

**Answer: B**

**Explanation:** A Cost Allocation Tag separates cost by tag only from the time it is activated in the Billing console, and past cost is not retroactively classified. Therefore the 3 months of cost before activation are not split by tag. A is wrong (tags are the core means of cost separation). C and D are not directly related to tag-based separation. Trap: "I attached the tag but past cost is not split" is due to the principle that it applies only after activation, and the preventive measure is to enforce tags at creation time with Tag Policy + SCP.

---

**Question 4.** In a situation where it is hard to set a specific threshold in advance, you want to automatically detect and be alerted to abnormal cost spikes that differ from the usual pattern using ML. Which is the most appropriate?
A) AWS Budgets
B) Cost Anomaly Detection
C) CloudWatch Alarm
D) Trusted Advisor

**Answer: B**

**Explanation:** Cost Anomaly Detection uses ML to learn past spending patterns and automatically detects and alerts on statistically abnormal spending without a predefined threshold (a dynamic baseline, not a static threshold). A (Budgets) requires a person to set the threshold. C (CloudWatch) is not anomaly detection based on learning cost patterns. D (Trusted Advisor) is a rule-based check. Trap: "threshold unknown + automatic learned detection" is Cost Anomaly Detection, while "threshold known + enforced blocking" is Budgets (Action). Anomaly Detection only detects and cannot block.

---

**Question 5.** The cost team wants to check whether the Savings Plans it purchased are being wasted (not utilized). Which report should it look at?
A) The SP Utilization report in Cost Explorer
B) The SP Coverage report in Cost Explorer
C) The lineItem columns in CUR
D) A Budgets Cost Budget

**Answer: A**

**Explanation:** Utilization is the percentage of the purchased commitment that was actually used, and a low value means the commitment is being wasted. So "is the SP being wasted" is answered by the Utilization report. B (Coverage) is the percentage of total usage covered by commitments and answers "should we buy more commitment." C is possible, but the dedicated report is more direct. D is threshold monitoring. Trap: distinguish commitment waste = Utilization, room for additional purchase = Coverage.

---

**Question 6.** In Cost Explorer, "data transfer" cost is a large 25% of the total, but it is not broken down into exactly which traffic it is, so the cause cannot be found. How can you pinpoint the root cause?
A) Set a data transfer budget with Budgets
B) Query CUR with Athena and break it down by UsageType
C) Run Trusted Advisor
D) Narrow the Cost Explorer filter further

**Answer: B**

**Explanation:** Cost Explorer shows "data transfer" lumped together and cannot distinguish cross-AZ, internet egress, and cross-Region. Querying the lineItem/UsageType column of CUR with Athena lets you break it down into DataTransfer-Regional-Bytes (cross-AZ), DataTransfer-Out-Bytes (egress), and so on, and pinpoint the exact cause. A is control, not analysis. C is a rule-based check. D cannot split down to the column level because of Cost Explorer's granularity limits. Trap: root cause analysis of cost is possible only at the CUR level.

---

**Question 7.** The organizational structure (Team A, Team B) does not map one-to-one to the AWS account and tag structure. You want to logically group cost with rules such as "Team A = account X + tag Project=alpha" and allocate shared NAT Gateway cost to each team in proportion to usage. Which is the most appropriate?
A) Cost Allocation Tags alone are sufficient
B) Define rules combining accounts, tags, and services with Cost Categories, and allocate shared cost with a split charge rule
C) Re-split the accounts
D) Manually edit CUR

**Answer: B**

**Explanation:** Cost Categories create logical cost groups with rules that combine accounts, tags, and services, and a split charge rule redistributes shared cost (such as a NAT Gateway) to member groups at defined ratios. When the organizational structure differs from the billing structure and shared cost allocation is needed, this mapping and allocation layer fits exactly. A (tags only) separates along a single dimension and makes composite rules and shared cost allocation difficult. C is excessively destructive. D is unrealistic and an anti-pattern that modifies the source data. Trap: grouping with composite rules is Cost Categories, and shared cost allocation is the split charge rule within it.

---

## 📌 Today's Summary

Cost visibility is layered: Cost Explorer for interactive dashboards, CUR for hour-by-hour SQL analysis, Budgets for threshold-based alerts, Cost Anomaly Detection for ML-learned pattern anomalies. Same billing data viewed at different resolutions — trade-off between immediacy (Cost Explorer) and arbitrariness (CUR). Budget Auto Actions trigger IAM/SCP policy applications or EC2/RDS stops on threshold breach. Cost Allocation Tags + Cost Categories split multi-account costs by business unit. FOCUS standard data export enables multi-cloud unified cost analysis.
