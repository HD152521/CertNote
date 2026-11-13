# Day 3 - Cost Explorer, Budgets, CUR - The Layers of Cost Visibility, Automatic Budget Controls, and the FinOps Data Pipeline

The maxim "you can't manage what you can't measure" works especially cruelly with cloud costs. On premises, buying more servers required approval, but in the cloud a single developer can generate tens of thousands of dollars a month with one `terraform apply`. To control cost in this environment, where spending is distributed, real-time, and self-service, you need all three layers: **visibility (seeing) → budgets (thresholds) → automated response (control).** AWS provides these as Cost Explorer, Budgets, and CUR + Budgets Action respectively. This way of thinking corresponds exactly to the three-phase "Inform → Optimize → Operate" framework established by the **FinOps Foundation**, launched in 2019 - Inform (visibility, allocation), Optimize (rightsizing, commitments), Operate (governance, automation).

In SAP-C02, this area is tested as FinOps operations design: "which tool gives data at what granularity," "what can be automatically blocked when a budget is exceeded," "how do I analyze hourly billing with SQL," and "how do I split multi-account costs by team." Today we break down the exact boundaries and data layers of the three tools, the internal behavior of automatic budget controls, and even the multi-cloud cost standard.

## The Three Layers of Cost Data - The Trade-off Between Granularity and Purpose

Before memorizing the three tools, you should grasp the structure that "they view the same cost data at different resolutions." Summarizing and visualizing the same billing data is Cost Explorer, spreading it out as is at hourly granularity is CUR, and watching it with thresholds is Budgets.

| Tool | Data granularity | Main use | Strength | Limitation |
|------|--------------|---------|------|------|
| **Cost Explorer** | Daily (some hourly) | Visualization, diagnosis, forecasting | Fast interactive analysis, Forecast | No deep column-level analysis |
| **Budgets** | Daily/monthly aggregates | Alerts, automatic control | Threshold-based actions | Not an analysis tool |
| **CUR** | **Hourly, ~200 columns** | Detailed analysis, BI | All billing line items, SQL | No built-in visualization (needs BI) |

The core intuition: **Cost Explorer is "fast with the eyes," CUR is "deep with SQL," and Budgets is "automatic with thresholds."** If "hourly + all line items + SQL" appears in a scenario, it is always CUR, and if "automatically stop something when exceeded," it is Budgets Action.

This layered structure is the same thinking as the **OLTP-OLAP separation** and the **medallion architecture (bronze → silver → gold)** of data warehousing. CUR drops the unprocessed fact table (bronze/fact table) into S3 as is, Athena and Redshift handle silver (cleansed, aggregated), and Cost Explorer and QuickSight dashboards handle gold (consumption views). Cost Explorer behaves like an OLAP front end that quickly displays pre-aggregated, cached cubes, so responses are fast but arbitrary deep queries are not possible. Immediacy (Cost Explorer) and arbitrariness (CUR) are an essential trade-off, and large FinOps organizations use both - Cost Explorer for daily monitoring and CUR for deep analysis of unit prices and anomalies.

Cost Explorer is free but has an **API call charge of $0.01 per request**. If you poll the Cost Explorer API every minute when building a FinOps dashboard, call charges add up, so in large-scale automation, querying CUR with Athena is better for both unit-price analysis and call costs. When "automate cost analysis with a custom dashboard" appears on the exam, a CUR + Athena + QuickSight combination is often a better answer than Cost Explorer API polling.

## Cost Explorer - Visualization, Forecasting, and Commitment Reports

Cost Explorer visualizes by default 12 to 13 months of cost (up to 38 months when configured) across dimensions such as day, month, service, account, and tag. Beyond a simple graphing tool, two advanced features appear on the exam.

- **Forecast**: Predicts cost for up to the next 12 months from past patterns. The correct-answer signal for "set the budget for the next quarter."
- **Savings Plans / RI Coverage and Utilization reports**: Show how much of usage the commitments cover (Coverage) and how well the commitments are used (Utilization). This is exactly the screen that diagnoses yesterday's "RI over-commitment lowering SP utilization."

Coverage and Utilization are an easily confused pair. **Coverage** is "the share of total usage discounted by commitments" (if low, there is room to buy more commitments) - the usage perspective. **Utilization** is "the share of purchased commitments actually used" (if low, commitments are being wasted) - the commitment perspective. The ideal state is to keep Utilization at 100% (no wasted commitments) while raising Coverage to an appropriate level (usually the baseline usage level). On the exam, "should we buy more commitments?" is a signal to look at Coverage, and "are commitments being wasted?" is a signal to look at Utilization.

Cost Explorer's Forecast is not a simple linear extrapolation but a statistical forecast that also presents a **prediction interval**. If past data is sparse or highly variable, the interval widens to indicate lower forecast confidence. The general principle of time series forecasting (the greater the variance, the wider the prediction interval) shows through directly, leading to the judgment that in a scenario where "it is a new service, so past data is insufficient and the forecast is unstable," Anomaly Detection is more suitable than Forecast.

## AWS Budgets - Beyond Alerts to Automatic Control

The real exam point of Budgets is not simple alerts but **Budgets Action**. When a threshold is crossed, it does not stop at emailing a person; it can **act automatically**.

| Budget type | What it watches |
|-----------|----------|
| **Cost Budget** | Spending limit ($) |
| **Usage Budget** | Usage (hours, GB, request counts, etc.) |
| **RI / SP Utilization** | Lower bound of commitment utilization |
| **RI / SP Coverage** | Commitment coverage |

What **Budgets Action** can do automatically when a threshold is exceeded:

- **Apply an IAM Policy**: attach a Deny policy to specific users or roles to block creation of new resources
- **Apply an SCP**: block specific actions at the Organization level
- **Stop EC2/RDS**: automatically stop designated instances

> 🎯 **Scenario**: "If a development account's monthly cost exceeds $5,000, stop it from launching any more new EC2 instances." → **Budgets (Cost Budget) + Budgets Action (automatically apply an IAM Deny Policy)**. CloudWatch Alarm can only notify, and a Lambda schedule is a batch that runs after the fact, so it is not real-time blocking. Only Budgets Action ties "threshold exceeded → apply policy immediately" into a single mechanism. Actions can be chosen to run automatically or after manual approval, so it is safer to make an SCP application, which has a large operational impact, approval-based.

> ⚠️ **Trap**: Choosing CloudWatch Alarm as the answer to "automatically block instances when cost is exceeded" is wrong. CloudWatch is a metric-based alert and trigger, not a mechanism that automatically applies IAM/SCP on a cost threshold (as an aside, there is a separate trap that the billing metrics themselves are exposed to CloudWatch only in us-east-1). Also, Budgets Action must be designed to distinguish "stopping what is already running (EC2 stop)" from "blocking new launches (IAM Deny)" - if the scenario is "block new creation," it is IAM/SCP, and if it is "stop what is currently running," it is EC2/RDS stop.

The limitation of Budgets is **billing latency**. AWS billing data is usually refreshed on the order of hours, so Budgets is not real time - there is a time gap between "blocking after the threshold is exceeded" and "the overrun occurring." This is the **eventual consistency** characteristic of a distributed billing system. So if you need a true hard cap (can never be exceeded), Budgets alone is not enough, and you also put in preventive controls that prohibit resource types, Regions, or services themselves in advance with SCPs. On the exam, if it says "guarantee the budget can never be exceeded," suspect a preventive SCP/Service Quotas signal rather than the after-the-fact detective Budgets.

## CUR - The Deepest Truth, and the Analytics Pipeline

CUR (Cost and Usage Report) is the **original fact table** of AWS billing. It records all billing line items hourly across about 200 columns. CUR itself has no screen - it lands in S3 (usually as Parquet) and is queried and visualized with **Athena, Redshift, and QuickSight**.

```
[CUR / Data Exports definition] → [Hourly Parquet loaded daily into an S3 bucket]
                     ↓
        [Glue Crawler / Athena table]
                     ↓
        [Athena SQL queries]  ← deep analysis at unit price and UsageType level
                     ↓
        [QuickSight dashboard]  ← FinOps visualization (e.g., CUDOS / CID dashboards)
```

The power of CUR lies in columns such as **lineItem/UsageType**. For example, `USE2-DataTransfer-Out-Bytes` is egress from us-east-2 to the internet, and `NatGateway-Bytes` is NAT Gateway throughput - cost that Cost Explorer lumps together as "data transfer" is broken down by CUR into exactly which usage it is. Unit price analysis in a large environment is impossible without CUR. The **CUDOS / Cost Intelligence Dashboard (CID)** that AWS released is the standard open template that visualizes this CUR with QuickSight.

**CUR 2.0** (2024) redesigned the schema to make the column structure more stable and BI-friendly (the existing CUR had variable columns depending on the resources used, making schema evolution tricky to handle). It also integrated CUR into the **Data Exports** feature, making it possible to export in the **FOCUS** (FinOps Open Cost and Usage Specification) standard format as well. FOCUS is an industry standard led by the FinOps Foundation that normalizes cost data from multiple clouds (AWS, Azure, GCP, OCI) into the same schema (common columns such as BilledCost, EffectiveCost, and ServiceCategory). When "analyze multiple clouds' costs integrated under a single schema" appears on the exam, a FOCUS-format Data Export is the clue.

(Hypothetical case) A SaaS company knew only that "data transfer cost is 25% of the total" from Cost Explorer and wandered for months unable to find the cause. When it queried CUR with Athena and split by UsageType, the culprit emerged - Cross-AZ DB replication traffic (`DataTransfer-Regional-Bytes`) was 70% of data transfer. Cost Explorer lumped it together as "data transfer," making diagnosis impossible, and only CUR's column-level analysis pinned down the cause (afterward, moving the read replica into the same AZ cut the cost significantly). Lesson: root cause analysis of cost anomalies is possible only at the CUR level.

## Cost Allocation Tags and Categories - Splitting Multi-Account Costs by Team

In a multi-account, multi-team environment, answering "whose cost is this?" requires **Cost Allocation Tags**. When you attach tags such as `Project`, `Env`, and `CostCenter` to resources, costs are separated and aggregated by tag only after you **activate** that tag in the Billing console. There are two kinds of tags: user-defined tags and AWS-generated tags (the `aws:` prefix, e.g., `aws:createdBy`).

Layering **Cost Categories** on top lets you create logical cost groups such as "Team A = account X + tag Y" using rules that combine tags, accounts, and services. This mapping layer is needed when the organizational structure and the billing structure differ.

> ⚠️ **Trap**: Cost Allocation Tags separate **only costs from the point of activation onward.** Past costs are not retroactively classified. The correct answer to the scenario "I attached tags but last month's cost is not split by tag" is "it is pre-activation cost, so it cannot be separated." That is why the best practice is to enforce tag governance at the moment of resource creation - the standard is a three-layer defense: **Tag Policy (Organizations)** to standardize allowed tag keys and values, an **SCP** to deny creation of resources without required tags, and an **AWS Config rule (required-tags)** to detect after-the-fact non-compliance.

The fundamental difficulty of cost allocation is **allocating shared costs**. Resources that multiple teams use together, such as NAT Gateways, Transit Gateways, shared ALBs, and data transfer, do not split cleanly by a single tag. FinOps distinguishes this as **showback** (showing who spent how much) and **chargeback** (actually billing that team), and shared costs are divided using an agreed allocation key such as a usage ratio or an even split. Cost Categories' **split charge rule** is exactly the feature that redistributes this shared cost to member groups at a defined ratio. When "allocate shared infrastructure costs by team" appears on the exam, split charge is the clue.

## Cost Anomaly Detection - ML-Based Anomaly Detection

Where Budgets looks at a "predefined threshold," **Cost Anomaly Detection** uses ML to **learn the usual pattern** and automatically detect abnormal spending. It is effective when you cannot know the threshold in advance (new services, unpredictable spikes). You place monitors by service, account, tag, and SP dimension and are notified by email or SNS.

Budgets and Anomaly Detection are the typical contrast of **rule-based (threshold) vs. learning-based (anomaly)** detection. Budgets requires a human to define a threshold such as "over $1000 per month" (easy to interpret but hard to set and static), while Anomaly Detection learns time series patterns and automatically judges "this service's cost this week is statistically abnormal" (no threshold needed, but with learning period and interpretation costs). It is exactly the **static threshold vs. dynamic baseline** of monitoring theory. The two are complements - block known limits firmly with Budgets, and watch broadly for unknown anomalies with Anomaly Detection. The exam point is that Anomaly Detection only detects and notifies and cannot automatically block (control is the job of Budgets Action).

## Wrapping Up

Cost control is a 4-stage workflow of **visibility (Cost Explorer) → threshold control (Budgets) → deep analysis (CUR) → anomaly detection (Anomaly Detection)**, corresponding to the FinOps Inform → Optimize → Operate cycle. The same billing data is viewed by Cost Explorer as visualization, by CUR as hourly SQL (the medallion bronze), and by Budgets as thresholds. Automatic control is handled by **Budgets Action (IAM/SCP/EC2 stop)**, separation by team by **Cost Allocation Tags + Cost Categories (+ split charge)**, and unknown anomalies by **Cost Anomaly Detection**. For multi-cloud integration, the **FOCUS-format Data Export** is the standard.

SAP exam mapping: (1) "hourly, all line items, SQL analysis" → **CUR + Athena**, (2) "block new EC2 creation when the budget is exceeded" → **Budgets Action (IAM/SCP Deny)**, (3) "forecast the next 12 months of cost" → **Cost Explorer Forecast**, (4) "diagnose commitment utilization and coverage" → **Cost Explorer Coverage/Utilization**, (5) "separate cost by team and department" → **Cost Allocation Tags + Cost Categories**, (6) "allocate shared infrastructure costs" → **Cost Categories split charge**, (7) "automatically detect abnormal spending with unknown thresholds" → **Cost Anomaly Detection**, (8) "prevent the budget from ever being exceeded" → **SCP/Service Quotas (preventive)**, (9) "integrate multiple clouds' costs under a single schema" → **FOCUS Data Export**. The next day looks at the hidden costs of S3 costs, data transfer, and NAT Gateways.

---

## 📝 Practice Questions

**Question 1.** A FinOps team wants to split all billing line items hourly with SQL to do deep analysis at the unit price (UsageType) level. What is the most suitable?

A) Cost Explorer

B) Output CUR to S3 and query it with Athena

C) AWS Budgets

D) Trusted Advisor

**Answer: B**
Explanation: CUR outputs all billing line items hourly across about 200 columns to S3 (usually Parquet), and Athena enables SQL analysis with arbitrary dimensions and arbitrary aggregations. You do unit-price-level analysis with the lineItem/UsageType column. A (Cost Explorer) is daily visualization, so deep column-level analysis is impossible, and it also has per-API-call charges. C (Budgets) is a threshold monitoring tool. D (Trusted Advisor) is rule-based checking. Trap: "hourly + all line items + SQL" is always CUR.

---

**Question 2.** When a development account's monthly cost exceeds $5,000, you want to automatically block that account from launching new EC2 instances. What is the most suitable?

A) Watch cost with a CloudWatch Alarm and send a notification

B) Budgets (Cost Budget) + Budgets Action to automatically apply an IAM Deny policy

C) Run a Lambda daily to check cost and block

D) A Cost Explorer Forecast alert

**Answer: B**
Explanation: Budgets Action can automatically apply an IAM Deny Policy or SCP when a cost threshold is exceeded to immediately block creation of new resources. A (CloudWatch Alarm) only notifies and has no mechanism to automatically apply IAM/SCP. C (a Lambda schedule) is an after-the-fact batch, so it is not real-time blocking. D (Forecast) is just a prediction display, not control. Trap: "automatic blocking when cost is exceeded" is Budgets Action, and CloudWatch Alarm is wrong. (Note: because of billing data refresh latency, if "can never be exceeded" is emphasized, additionally suspect a preventive SCP.)

---

**Question 3.** A team attached a `CostCenter` tag to all resources, but the last 3 months of cost do not appear separated by tag. What is the most likely cause?

A) Tags cannot be used for cost separation

B) The Cost Allocation Tag was only recently activated, and cost before activation is not retroactively separated

C) CUR is disabled

D) There is no Budgets

**Answer: B**
Explanation: Cost Allocation Tags separate by tag only the cost from the point of activation in the Billing console onward, and past cost is not retroactively classified. Therefore the 3 months of cost before activation is not split by tag. A is wrong (tags are the core means of cost separation). C and D are not directly related to tag separation. Trap: "I attached tags but past cost is not split" is because of the principle that it applies only from the activation point onward, and the preventive measure is to enforce tags at creation time with Tag Policy + SCP.

---

**Question 4.** In a situation where it is hard to set a specific threshold in advance, you want to be automatically alerted by ML to abnormal cost spikes that differ from the usual. What is the most suitable?

A) AWS Budgets

B) Cost Anomaly Detection

C) CloudWatch Alarm

D) Trusted Advisor

**Answer: B**
Explanation: Cost Anomaly Detection learns past spending patterns with ML and automatically detects and alerts on statistically abnormal spending without needing a threshold to be set in advance (a dynamic baseline, not a static threshold). A (Budgets) requires a human to set the threshold. C (CloudWatch) is not anomaly detection based on learning cost patterns. D (Trusted Advisor) is rule-based checking. Trap: "unknown threshold + automatic learned detection" is Cost Anomaly Detection, and "known threshold + enforced blocking" is Budgets (Action). Anomaly Detection only detects and cannot block.

---

**Question 5.** The cost team wants to check whether the Savings Plans they bought are being wasted (not utilized). Which report should they look at?

A) Cost Explorer's SP Utilization report

B) Cost Explorer's SP Coverage report

C) CUR's lineItem columns

D) Budgets Cost Budget

**Answer: A**
Explanation: Utilization is "the share of purchased commitments actually used," and when low it means the commitments are being wasted. Therefore, for "is the SP being wasted," the Utilization report is the answer. B (Coverage) is "the share of total usage covered by commitments" and looks at "should we buy more commitments." C is possible but the dedicated report is more direct. D is threshold monitoring. Trap: distinguish commitment waste = Utilization, room to buy more = Coverage.

---

**Question 6.** In Cost Explorer, "data transfer" cost is large at 25% of the total, but it is not broken down into exactly which traffic it is, so the cause cannot be found. How do you pinpoint the root cause?

A) Set a data transfer budget with Budgets

B) Query CUR with Athena and break it down by UsageType

C) Run Trusted Advisor

D) Narrow the Cost Explorer filter further

**Answer: B**
Explanation: Cost Explorer lumps "data transfer" together and cannot distinguish Cross-AZ, internet egress, and Cross-Region. If you query CUR's lineItem/UsageType column with Athena, you can break it down into DataTransfer-Regional-Bytes (Cross-AZ), DataTransfer-Out-Bytes (egress), and so on to pinpoint the exact cause. A is control, not analysis. C is rule-based checking. D cannot break down to the column level because of Cost Explorer's granularity limits. Trap: root cause analysis of cost is possible only at the CUR level.

---

**Question 7.** The organizational structure (Team A, Team B) and the AWS account and tag structure do not match one to one. You want to group costs logically with rules like "Team A = account X + tag Project=alpha" and allocate the shared NAT Gateway cost to each team by usage ratio. What is the most suitable?

A) Cost Allocation Tags alone are sufficient

B) Define combination rules of accounts, tags, and services with Cost Categories and allocate shared costs with a split charge rule

C) Re-split the accounts

D) Manually edit CUR

**Answer: B**
Explanation: Cost Categories create logical cost groups with rules combining accounts, tags, and services, and the split charge rule redistributes shared costs (such as NAT Gateways) to member groups at a defined ratio. When the organizational structure and billing structure differ and shared cost allocation is needed, this mapping and allocation layer fits exactly. A (tags only) separates only along a single dimension, making compound rules and shared cost allocation difficult. C is excessively destructive. D is impractical and an anti-pattern that modifies the original data. Trap: compound-rule grouping is Cost Categories, and shared cost allocation is the split charge rule within it.
