# Day 3 - Cost Explorer and Budgets: How to Read and Control Your Bill

Cloud cost is not a single-line number that arrives at the end of the month. Behind that number are hundreds of services, dozens of Regions, thousands of resources, and hourly usage all tangled together. To answer the question "why did we get a $50,000 bill this month?", you need to be able to slice and dice this lump — which service, which account, which project, and which usage type pushed the cost up. **Cost Explorer** handles this breakdown, **Budgets** handles putting limits and automatic blocks on the result of that breakdown, and **Cost Allocation Tags** provide the foundation that makes it possible to divide costs by team and project in the first place.

Behind these three is an operating philosophy called **FinOps**. Traditionally, infrastructure cost was a domain the finance team settled after the fact, but in the cloud a developer incurs cost with a single `terraform apply` — the authority over cost decisions has passed to engineers. FinOps accepts this reality and builds a culture in which "engineers see and take responsibility for the costs they create in real time." Cost Explorer, Budgets, and Tags are the tools that support that culture. This article digs into their internals — how cost data is dimensionalized, why tag activation isn't retroactive, and how Budgets Actions forcibly stop spending.

## Cost Data Is a Multidimensional Cube — Why the Idea of OLAP Came to the Bill

When you click "Group by Service," "Filter: Region = ap-northeast-2," and "Group by Tag: Project" in Cost Explorer, you are actually doing **multidimensional data analysis (OLAP)**. AWS's billing data is essentially a collection of facts with multiple dimensions — each cost line item has coordinates of "when, which service, which Region, which account, which usage type, which tag," and on those coordinates sit the measures "cost" and "usage."

This structure is called an **OLAP cube**. Just as you would break down sales by "region × time × product" in a data warehouse, Cost Explorer lets you freely slice, dice, and drill down into cost along these dimensions. "Finding the cause of a cost spike" is in fact OLAP drill-down itself.

```
Spike discovered → narrow the dimensions to trace the cause (drill-down)

Group by Service        → Which service? (e.g., EC2-DataTransfer surged)
   ↓ narrow to EC2
Group by Linked Account → Which account?
   ↓ narrow to the prod account
Group by Tag: Project   → Which project?
   ↓ narrow to the payment project
Group by Usage Type     → What kind of usage? (transfer? storage? compute?)
   → "DataTransfer-Out-Bytes" — outbound transfer is the culprit
```

Cost Explorer provides up to **13 months of historical data** and a **12-month ML-based forecast**. Basic analysis is free, but **hourly granularity** and resource-level data cost extra if you enable them separately (billed per UsageRecord). There is no per-minute granularity — the minimum resolution of cost analysis is one hour.

OLAP (Online Analytical Processing) is a concept established in 1990s data warehousing, in contrast to OLTP, which is optimized for transaction processing. OLTP is tuned for "quickly recording a single order," while OLAP is tuned for analytic queries like "aggregating the last 3 years of sales by region and product." The reason Cost Explorer can show fast aggregations over predefined dimensions is that AWS pre-aggregates billing data in an OLAP-friendly way. Conversely, if you need arbitrary dimensions and arbitrary SQL, pre-aggregation isn't enough, and you have to go to CUR (raw data + Athena), which comes next. The trade-off of "predefined fast aggregation vs. arbitrary slow raw queries" is the essential line that separates Cost Explorer from CUR.

## Cost Allocation Tags — Why You Must Turn Tags On to See Cost, and Why It Isn't Retroactive

"I want to see cost by project" is the most common FinOps requirement. But just putting a `Project: payment` tag on a resource isn't enough. You must **explicitly activate that tag key as a Cost Allocation Tag** for it to enter the billing data as a dimension. If you don't know this, you fall into the trap of "I tagged everything, but it doesn't show up under Group by Tag in Cost Explorer."

Why don't all tags automatically become billing dimensions? An account carries countless tags for operations, automation, security, and so on, and if all of them became dimensions in the billing data, the cube would blow up in size and most of them would be irrelevant to cost analysis. So AWS makes the user explicitly choose "which tags to use as cost dimensions."

The most important trap is that **activation is not retroactive**. When you activate a tag key, that dimension is populated only in cost data **from that point on**. Past costs incurred before activation can't be grouped by that tag. So the principle is "once you've decided on a tag standard, activate it as soon as possible" — the later you turn it on, the bigger the hole in your historical data. It also usually takes 24 to 48 hours after activation for it to be reflected in the bill.

| Kind | Example | Notes |
|------|------|------|
| **AWS-generated** | `aws:createdBy`, `aws:cloudformation:stack-name` | Applied automatically by AWS, prefix `aws:` |
| **User-defined** | `Project`, `Environment`, `Owner`, `CostCenter` | Defined by the user, explicit activation required |

> ⚠️ **Trap**: Besides the fact that Cost Allocation Tag activation isn't retroactive, **resources with missing tags** are also a problem. The cost of untagged resources is lumped together as "untagged" and isn't attributed to any project. If this "untagged cost" is large, the accuracy of cost allocation collapses. That's why mature organizations enforce tag standards across the organization with Organizations **Tag Policies** and block creation of resources without required tags with SCPs or Config Rules. When "start tracking cost by project" appears on the exam, the key is: ① apply tags ② activate the Cost Allocation Tag ③ wait 24 to 48 hours ④ enforce with Tag Policies if possible.

## AWS Budgets — Setting Limits, and Actually Stopping Spend When They're Exceeded

If Cost Explorer is "looking at cost after the fact," Budgets is "setting limits in advance and acting when they're near or exceeded." There are four budget types — Cost Budget (cost limit), Usage Budget (usage limit, e.g., GB or hours), Reservation Budget (RI utilization), and Savings Plans Budget (SP utilization). The most common is the Cost Budget.

The real power of Budgets is not alerts but **Budgets Actions**, the ability to **automatically stop cost** when a threshold is reached. Alerts only lead to action when a person sees them, while an Action enforces a block without a person.

| Budget Action | Behavior | Effect |
|---------------|------|------|
| **Apply IAM policy** | Attach a Deny policy to specific users, groups, or roles | Strips permission to create new resources |
| **Apply SCP** | Attach a service control policy to an OU | Blocks specific actions across the whole account |
| **Stop EC2/RDS** | Automatically stop the target instances | Immediately halts cost accrual |

There is another key distinction here — **ACTUAL vs. FORECASTED thresholds**. ACTUAL fires "when actual cost exceeds the threshold," so the money has already been spent. FORECASTED uses Cost Explorer's forecasting model to fire in advance "when it looks like this trend will exceed the threshold by month-end" — proactive rather than reactive. In operations, you usually set both together: an alert at 80% FORECASTED and a blocking Action at 100% ACTUAL.

Automatically applying an SCP in a Budgets Action is powerful but a **blunt instrument**. An SCP applies to the entire OU (organizational unit), so if you set "an SCP that blocks EC2 creation when the budget is exceeded," **all accounts and all users** in that OU are affected — even urgent operational work can be blocked. That's why Budgets Actions have an **approval model**. `AUTOMATIC` executes the action immediately when the threshold is reached, while `MANUAL` holds the action and requires a person to approve it in the console before it executes. The standard is to put irreversible or broad actions (SCP) on MANUAL and safe, localized actions on AUTOMATIC. In effect, the approval model balances the convenience of automation against the risk of misfire.

The typical causes of cloud cost incidents are "forgotten resources" and "runaway scripts." A Lambda accidentally stuck in an infinite loop calling an external API thousands of times per second through a NAT Gateway, a GPU instance (tens of dollars per hour) someone forgot to terminate running all weekend, or a misconfigured S3 lifecycle causing runaway Glacier restores. Cases of individual developers getting a bill of thousands of dollars on a learning account are a constant in the community. The common lesson from these incidents is that "cost accumulates quietly, quickly, and without people," so the defense must also work without people — Budgets Actions (automatic blocking) and Cost Anomaly Detection (automatic detection) are those automatic lines of defense. The first safeguards to set on a new account are Free Tier alerts and a low-amount Budget.

## CUR — The Final Truth of Billing, and the Boundary with Cost Explorer

What Cost Explorer shows is a pre-aggregated summary. If you need the most granular truth, like "exactly how much a single resource used per hour," you have to go to the **CUR (Cost and Usage Report)**. CUR is the **most detailed billing data** AWS provides — a collection of raw rows at hourly and resource granularity, with all dimensions included. You drop it into S3 as Parquet and run arbitrary SQL analysis with Athena and QuickSight.

| Item | Cost Explorer | CUR |
|------|---------------|-----|
| Form | Console GUI, predefined dimensions | Raw data in S3 (Parquet) |
| Analysis | Predefined group/filter | Arbitrary SQL (Athena) |
| Resolution | Daily/hourly (paid) | Hourly and resource level |
| Cost | Free (hourly is paid) | Storage fees only |
| Use | Everyday analysis, quick answers | Deep analysis, in-house cost tools, showback |

The question that draws the boundary is "are the console's predefined dimensions enough?" If so, use Cost Explorer (fast and free); if you need arbitrary complex joins or custom aggregations (for example, "convert cost per user by team into an internal invoice with exchange rates applied"), it's CUR + Athena. In a multi-account environment, if you need to add an in-house margin and bill departments or customers, you go all the way to **Billing Conductor** — the tool SIs and MSPs use to create custom per-customer billing.

Storing CUR in Parquet columnar format is the key to analytic performance. Billing data can reach hundreds of millions of rows, and an analytic query like "total EC2 cost" usually needs to read only a few columns (service, cost). With row-based storage (CSV), you'd have to read every column of every row, but a columnar format like Parquet reads only the needed columns from disk, cutting IO by tens of times. Moreover, values in the same column are similar, so the compression ratio is also high. It's thanks to this columnar storage that Athena can scan CUR in S3 quickly and cheaply (since billing is per amount of data scanned). It's exactly the same reason columnar formats became the standard for OLAP analysis.

## The Forecast Trap — ML Predictions Need History to Work

Both Cost Explorer's forecast and Budgets' FORECASTED threshold depend on **cost forecasting**. This forecast is an ML model that has learned past cost patterns extrapolating the future. It has an obvious limitation — **without sufficient history, the forecast is inaccurate.**

A freshly created account or a just-started workload has no past patterns to learn from, so the forecast misses by a wide margin. A reliable forecast usually needs at least a few months (often 3 or more) of stable history. Also, abrupt changes that never occurred in the past (launching a large new workload, a promotion) can't be foreseen by the forecasting model — because a forecast assumes "if the past continues."

> ⚠️ **Trap**: If you set a Budget for a new workload using only a FORECASTED threshold, the forecast is inaccurate and may misfire (a wrong block or a missed alarm). When history is shallow, you should also set an ACTUAL threshold (based on actual cost) as a safety net. Also, you shouldn't read Cost Explorer's forecast line as a "confirmed future" — it is only a statistical estimate with a confidence interval. When "cost forecasts for a new service are inaccurate" appears on the exam, the cause is "insufficient historical data," and the answer is to run measured, actual-based monitoring in parallel until enough history accumulates.

## Summary

Cost operations are a triangle of breakdown (Cost Explorer), control (Budgets), and allocation (Tags). Underneath is a culture called FinOps — the engineers who incur cost see and take responsibility for it in real time.

Five things for operators to remember: ① Cost Explorer is a tool that treats cost as an OLAP cube — drill down by service, account, tag, and usage-type dimensions to trace the cause of a spike. 13 months of history + 12 months of forecast. ② A Cost Allocation Tag becomes a billing dimension only when explicitly activated, and activation isn't retroactive, so turn it on as soon as possible. ③ For Budgets, Budgets Actions (automatic blocking via IAM/SCP/Stop) are the key feature; ACTUAL fires after the fact and FORECASTED fires in advance. Use MANUAL approval for broad SCP actions. ④ The most granular truth is CUR (raw data at hourly and resource granularity) + Athena, while Cost Explorer is a quick summary. ⑤ A forecast is accurate only with sufficient history — for new workloads, run an ACTUAL safety net in parallel.

In the next article, going beyond analyzing and controlling cost, we cover strategies and internals for actually cutting compute cost by 70% or more with commitment discounts (Savings Plans and Reserved Instances) and Spot.

---

## 📝 Practice Questions

**Question 1.** The company has put a `Project` tag on every resource, yet `Project` doesn't appear under Group by Tag in Cost Explorer. What is the cause and the fix?

A) Cost Explorer doesn't support grouping by tag

B) Applying the tag isn't enough; you must explicitly activate that tag key as a Cost Allocation Tag for it to become a billing dimension (reflected 24 to 48 hours after activation)

C) IAM permissions are insufficient

D) The tag values contain Korean text

**Answer: B**

Explanation: Applying a tag to a resource and using that tag as a cost dimension are separate matters. Putting all tags into the billing dimensions automatically would blow up the data, so AWS has users explicitly activate the tag keys to use for cost analysis through Cost Allocation Tags. It usually takes 24 to 48 hours after activation to be reflected in the bill, and more importantly, activation is not retroactive, so the dimension is populated only in data after activation. So once you've decided on a tag standard, you should activate it as soon as possible.

---

**Question 2.** Monthly cost suddenly jumped to 3 times the usual. What is the best approach to systematically find the cause with Cost Explorer?

A) Exhaustively investigate CUR with Athena

B) Drill down by narrowing the dimensions — identify the service with Group by Service → Linked Account → Tag (Project) → Usage Type, narrowing the scope in that order

C) Terminate all instances

D) Create a Budget

**Answer: B**

Explanation: Cost Explorer treats cost as a multidimensional OLAP cube, so tracing the cause of a spike is drill-down itself. First look at which service surged with Group by Service, narrow to that service, and then narrow the dimensions in turn to Linked Account (which account), Tag (which project), and Usage Type (transfer, storage, or compute), and you can pinpoint the culprit. For example, if the Out-Bytes of EC2-DataTransfer surged, outbound transfer is the cause. An exhaustive CUR investigation (A) is for heavier, deeper analysis.

---

**Question 3.** The company wants to automatically block creation of new EC2 instances when the monthly budget of $10,000 is reached (without human intervention). Which tool or feature is it?

A) Cost Explorer

B) AWS Budgets + Budgets Action (attaching an IAM Deny policy or applying an SCP)

C) Cost Anomaly Detection

D) Trusted Advisor

**Answer: B**

Explanation: Only Budgets Actions can automatically "block" cost. When a threshold is reached, they attach a Deny policy to specific users or roles (IAM Action), apply an SCP to an OU, or automatically stop EC2/RDS. Cost Explorer (A) only analyzes, and Cost Anomaly Detection (C) only detects and alerts and can't block. However, an SCP is a blunt instrument affecting the whole OU, so for broad actions it is safer to use the MANUAL approval model.

---

**Question 4.** You need a custom SQL analysis of exactly how much a single EC2 instance used per hour, and of converting cost per user using the company's own criteria. What is the data source?

A) The Cost Explorer console

B) Cost and Usage Report (CUR) + S3 + Athena — arbitrary SQL over raw data at hourly and resource granularity

C) Budgets

D) Trusted Advisor Cost

**Answer: B**

Explanation: Cost Explorer is a fast summary of predefined dimensions, so it can't do "arbitrary complex joins and custom aggregations over hourly raw data at the resource level." The most detailed truth is CUR — all rows at hourly and resource granularity are stored in S3 as Parquet, and you run arbitrary SQL with Athena. Thanks to columnar Parquet, only the needed columns are scanned, making it fast and cheap. Custom analyses such as in-house cost tools, showback, and applying exchange rates are CUR's territory.

---

**Question 5.** You started a new workload on a freshly created account, and Cost Explorer's cost forecast and Budgets' FORECASTED threshold keep missing. What is the cause and the remedy?

A) A Cost Explorer bug — restart it

B) The forecasting ML model lacks past history to learn from — until history accumulates, set an ACTUAL (measured) threshold in parallel as a safety net

C) The Region is wrong

D) An IAM permission problem

**Answer: B**

Explanation: A cost forecast is an extrapolation by an ML model trained on past patterns, so when there is no history to learn from, as with a new account or new workload, it misses significantly (a reliable forecast usually needs several months of history). Also, abrupt changes that didn't exist in the past can't be foreseen by the forecast. So when history is shallow, don't rely on FORECASTED alone; set an ACTUAL threshold in parallel to have a measured safety net. The forecast line is not a confirmed future but a statistical estimate with a confidence interval.

---

**Question 6.** The company wants to create a Budgets Action that blocks EC2 creation across an entire OU with an SCP when the budget is exceeded. Which setting deserves the most careful consideration?

A) Setting the threshold to 0%

B) The approval model — since an SCP is a broad action that affects the whole OU, set it to MANUAL so a person approves before it executes

C) The notification email address

D) The budget name

**Answer: B**

Explanation: Automatically applying an SCP is powerful, but it is a blunt instrument that affects every account and user in the OU, and it can block even urgent operational work. In the Budgets Action approval model, `AUTOMATIC` executes immediately and `MANUAL` executes only after a person approves it in the console. The standard is to put irreversible or broad actions (SCP) on MANUAL to reduce the risk of misfire, and only safe, localized actions on AUTOMATIC.

---

## 📌 Today's Summary

1. Cost Explorer treats cost as an OLAP cube and drills down by service, account, tag, and usage-type dimensions — 13 months of history + 12 months of forecast, hourly is paid
2. A Cost Allocation Tag becomes a billing dimension only when explicitly activated and isn't retroactive — turn it on as soon as possible and enforce it with Tag Policies
3. The core of Budgets is Budgets Actions (automatic blocking via IAM/SCP/Stop) — ACTUAL fires after the fact, FORECASTED fires in advance, and broad SCPs use MANUAL approval
4. The most granular truth is CUR (raw data at hourly and resource granularity, Parquet) + Athena, and Cost Explorer is a quick summary
5. A forecast is accurate only with sufficient history — run an ACTUAL safety net in parallel for new workloads
