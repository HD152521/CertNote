# Day 3 - Cost Explorer and Budgets: How to Read and Control the Bill

Cloud cost is not a one-line number that arrives at month's end. Behind that number are hundreds of services, dozens of Regions, thousands of resources, and hourly usage, all tangled together. To answer the question "why did we get $50,000 this month?", you need to be able to slice and dice this lump — which service, which account, which project, and which usage type pushed the cost up. **Cost Explorer** handles this breakdown, **Budgets** handles setting limits and automatic blocking on the results of the breakdown, and **Cost Allocation Tags** provide the foundation that makes it possible to divide cost by team and project in the first place.

Behind these three is an operating philosophy called **FinOps**. Traditionally, infrastructure cost was something the finance team settled after the fact, but in the cloud a developer incurs cost with a single `terraform apply` — the authority over cost decisions has passed to engineers. FinOps accepts this reality and builds a culture in which "engineers see and take responsibility for the cost they create, in real time." Cost Explorer, Budgets, and tags are the tools that support that culture. This note digs into their internals — how cost data is dimensioned, why tag activation is not retroactive, and how Budgets Action forcibly stops cost.

## Cost Data Is a Multidimensional Cube: Why OLAP Thinking Came into the Bill

When you click "Group by Service," "Filter: Region = ap-northeast-2," and "Group by Tag: Project" in Cost Explorer, you are actually doing **multidimensional data analysis (OLAP)**. AWS billing data is, in essence, a set of facts that have multiple dimensions — each cost item has coordinates of "when, which service, which Region, which account, which usage type, which tag," and on those coordinates sit the measures "cost" and "usage."

This structure is called an **OLAP cube**. Just as you break down sales by "region x time x product" in a data warehouse, Cost Explorer lets you freely slice, dice, and drill down into cost along these dimensions. "Finding the cause of a cost spike" is in fact OLAP drill-down itself.

```
Spike found in cost → narrow the dimensions to trace the cause (drill-down)

Group by Service        → Which service? (e.g., EC2-DataTransfer surged)
   ↓ narrow to EC2
Group by Linked Account → In which account?
   ↓ narrow to the prod account
Group by Tag: Project   → Which project?
   ↓ narrow to the payment project
Group by Usage Type     → What usage? (transfer? storage? compute?)
   → "DataTransfer-Out-Bytes" — outbound transfer is the culprit
```

Cost Explorer provides up to **13 months of historical data** and a **12-month ML-based forecast**. Basic analysis is free, but **hourly granularity** and resource-level data cost extra when enabled separately (billed per UsageRecord). There is no minute-level data — the minimum resolution of cost analysis is the hour.

OLAP (Online Analytical Processing) is a concept established in data warehousing in the 1990s, in contrast to OLTP, which is optimized for transaction processing. OLTP is tuned for "recording this one order quickly," while OLAP is tuned for analytic queries such as "aggregate the last three years of sales by region and product." The reason Cost Explorer can show fast aggregations over predefined dimensions is that AWS pre-aggregates billing data in an OLAP-friendly way. Conversely, if you need arbitrary dimensions and arbitrary SQL, pre-aggregation is not enough, and you must go to the CUR (raw data + Athena) that appears next. The trade-off of "predefined fast aggregation vs arbitrary slow raw queries" is the essence that separates Cost Explorer from the CUR.

## Cost Allocation Tags: Why You Must Turn the Tag On to See Cost, and Why It Is Not Retroactive

"I want to see cost by project" is the most common FinOps requirement. But merely attaching a `Project: payment` tag to a resource is not enough. You must **explicitly activate that tag key as a Cost Allocation Tag** for it to enter the billing data as a dimension. If you do not know this, you fall into the trap of "I attached all the tags but Group by Tag does not show them in Cost Explorer."

Why don't all tags automatically become billing dimensions? An account carries many tags for operations, automation, and security, and if all of them were made dimensions in the billing data, the cube would grow explosively and most would be irrelevant to cost analysis. So AWS has users explicitly choose "which tags to use as cost dimensions."

The most important pitfall is that **activation is not retroactive**. When you activate a tag key, that dimension is populated only in cost data **after** that point. Past costs incurred before activation cannot be grouped by that tag. So the principle is "once you have settled the tagging standard, activate it as soon as possible" — the later you turn it on, the bigger the hole in the historical data. It also usually takes 24 to 48 hours after activation to be reflected in the bill.

| Type | Example | Notes |
|------|---------|-------|
| **AWS-generated** | `aws:createdBy`, `aws:cloudformation:stack-name` | Assigned automatically by AWS, with the prefix `aws:` |
| **User-defined** | `Project`, `Environment`, `Owner`, `CostCenter` | Defined by the user, explicit activation required |

> ⚠️ **Pitfall**: Besides the fact that Cost Allocation Tag activation is not retroactive, **resources with missing tags** are also a problem. The cost of resources without tags is lumped together as "untagged" and is attributed to no project. If this "untagged cost" is large, the accuracy of cost allocation collapses. So mature organizations enforce the tag standard across the whole organization with Organizations **Tag Policies**, and block creation of resources without required tags using SCPs or Config Rules. If the exam presents "start tracking cost by project," the key is ① attach the tags ② activate the Cost Allocation Tag ③ wait 24 to 48 hours ④ enforce with a Tag Policy where possible.

## AWS Budgets: How to Set a Limit and Actually Stop Spending When It Is Exceeded

If Cost Explorer is "looking at cost after the fact," Budgets is "setting a limit in advance and acting when it is near or exceeded." There are four budget types — Cost Budget (cost limit), Usage Budget (usage limit, e.g., GB or hours), Reservation Budget (RI utilization), and Savings Plans Budget (SP utilization). The most common is the Cost Budget.

The real power of Budgets is not the alert but **Budgets Action**, the feature that **automatically stops cost** when a threshold is reached. An alert needs a person to see it and act, but an Action forcibly blocks with no person involved.

| Budget Action | Behavior | Effect |
|---------------|----------|--------|
| **Apply an IAM policy** | Attach a Deny policy to specific users, groups, or roles | Strips the permission to create new resources |
| **Apply an SCP** | Attach a service control policy to an OU | Blocks specific actions across the entire account |
| **Stop EC2/RDS** | Automatically stops the target instances | Immediately stops cost from being incurred |

Here is another key distinction — **ACTUAL vs FORECASTED thresholds**. ACTUAL fires "when actual cost has exceeded the threshold," so the money has already been spent. FORECASTED uses Cost Explorer's forecast model to fire in advance "when it looks like the threshold will be exceeded by month's end at this trend" — a proactive rather than reactive response. In operations you usually set both: an alert at 80% FORECASTED, and a blocking Action at 100% ACTUAL.

Automatically applying an SCP in Budgets Action is powerful but a **blunt knife**. An SCP applies to the entire OU (organizational unit), so if you set an "SCP that blocks EC2 creation when the budget is exceeded," **every account and every user** in that OU is affected — even urgent operational work can be blocked. That is why Budgets Action has an **approval model**. `AUTOMATIC` executes the action immediately when the threshold is reached, while `MANUAL` holds the action pending and it runs only after a person approves it in the console. The standard practice is to set irreversible or broad actions (SCPs) to MANUAL and safe, localized actions to AUTOMATIC. In effect, the approval model adjusts the balance between the convenience of automation and the risk of malfunction.

The typical causes of cloud cost incidents are "forgotten resources" and "runaway scripts." A Lambda that accidentally loops infinitely calls an external API thousands of times per second through a NAT Gateway, a GPU instance whose termination was forgotten (tens of dollars per hour) runs all weekend, or a misconfigured S3 lifecycle makes Glacier restores run wild. Cases of individual developers receiving bills of thousands of dollars on a learning account are endless in the community. The common lesson of these incidents is that "cost accumulates quietly, quickly, and without people," so the defense too must work without people — Budgets Action (automatic blocking) and Cost Anomaly Detection (automatic detection) are those automatic lines of defense. The first safeguards to put on a new account are a Free Tier alert and a low-amount Budget.

## CUR: The Final Truth of the Bill, and the Boundary with Cost Explorer

What Cost Explorer shows is a pre-aggregated summary. If you need the finest-grained truth, such as "exactly how much did a single resource spend per hour," you must go to the **CUR (Cost and Usage Report)**. The CUR is the **most detailed billing data** AWS provides — a set of raw rows that include hourly, resource-level data and every dimension. You drop it into S3 as Parquet and run arbitrary SQL analysis with Athena and QuickSight.

| Item | Cost Explorer | CUR |
|------|---------------|-----|
| Form | Console GUI, predefined dimensions | Raw data in S3 (Parquet) |
| Analysis | Predefined group/filter | Arbitrary SQL (Athena) |
| Resolution | Daily/hourly (paid) | Hourly, resource level |
| Cost | Free (hourly is paid) | Storage fees only |
| Use | Everyday analysis, quick answers | Deep analysis, internal cost tools, showback |

The question that separates them is "are the predefined console dimensions enough?" If they are, Cost Explorer (fast and free); if you need arbitrary complex joins or custom aggregation (for example, "turn per-user cost by team into an internal invoice with exchange rates applied"), it is CUR + Athena. In a multi-account environment, if you must add an internal margin and bill departments or customers, you go further to **Billing Conductor** — the tool that SIs and MSPs use to create custom billing per customer.

Storing the CUR in the Parquet columnar format is the key to analysis performance. Billing data can reach hundreds of millions of rows, and an analytic query like "total of all EC2 cost" usually needs to read only a few columns (service, cost). With row-based storage (CSV) you must read every column of every row, but a columnar format like Parquet reads only the needed columns from disk and cuts IO by tens of times. On top of that, the values in the same column are similar, so the compression ratio is also high. This columnar storage is why Athena can scan the CUR in S3 quickly and cheaply (since billing is per amount of data scanned). It is exactly the same reason columnar formats became the standard for OLAP analysis.

## The Forecast Pitfall: ML Prediction Works Only When There Is History

Both the Cost Explorer forecast and the Budgets FORECASTED threshold depend on the **cost forecast**. This forecast is an ML model that learned past cost patterns extrapolating the future. There is an obvious limitation here — **without enough history the forecast is inaccurate.**

A newly created account or a workload that has just started has no past pattern to learn, so the forecast misses widely. A reliable forecast typically needs at least several months (often 3 months or more) of stable history. Also, abrupt changes that never occurred in the past (launching a new large workload, a promotion) cannot be foreseen by the forecast model — because a forecast assumes "if the past continues."

> ⚠️ **Pitfall**: If you set a Budget on a new workload with only a FORECASTED threshold, the forecast is inaccurate and may malfunction (a wrong block or a missed alarm). When history is shallow, you must also set an ACTUAL threshold (based on real cost) to provide a safety net. Also, do not read the forecast line in Cost Explorer as a "confirmed future" — it is only a statistical estimate with a confidence interval. If the exam presents "the cost forecast for a new service is inaccurate," the cause is "insufficient historical data," and the answer is to run monitoring based on actual measurements in parallel until enough history accumulates.

## Summary

Cost operations is a triangle of breakdown (Cost Explorer), control (Budgets), and allocation (tags). Beneath it is a culture called FinOps — the engineers who incur cost see it in real time and take responsibility for it.

The five things an operator should remember are these. ① Cost Explorer is a tool that treats cost as an OLAP cube — drill down through the service, account, tag, and usage-type dimensions to trace the cause of a spike. 13 months of history + 12 months of forecast. ② A Cost Allocation Tag becomes a billing dimension only when explicitly activated, and activation is not retroactive, so turn it on as soon as possible. ③ For Budgets, the core feature is Budgets Action (automatic blocking through IAM/SCP/Stop); ACTUAL fires after the fact and FORECASTED fires in advance. Put broad SCP actions behind MANUAL approval. ④ The finest-grained truth is the CUR (raw hourly, resource-level data) + Athena, and Cost Explorer is a quick summary. ⑤ A forecast is accurate only with enough history — for new workloads, run an ACTUAL safety net in parallel.

In the next note, going beyond analyzing and controlling cost, we cover strategies, and their internals, for actually cutting compute cost by 70% or more with commitment discounts (Savings Plans and Reserved Instances) and Spot.

---

## Practice Problems

**Question 1.** A company tagged all of its resources with a `Project` tag, but `Project` does not appear in Cost Explorer's Group by Tag. What is the cause and the fix?

A) Cost Explorer does not support grouping by tag
B) Tagging alone is not enough; the tag key must be explicitly activated as a Cost Allocation Tag to become a billing dimension (reflected 24-48 hours after activation)
C) IAM permissions are insufficient
D) The tag values contain Korean characters

**Answer: B**

Explanation: Attaching a tag to a resource and using that tag as a cost dimension are separate things. Automatically turning every tag into a billing dimension would make the data explode, so AWS has you explicitly activate the tag keys you want to use for cost analysis as Cost Allocation Tags. It usually takes 24-48 hours after activation for the tag to appear in billing, and more importantly, activation is not retroactive, so the dimension is populated only with data from after activation. That is why you should activate the tag keys as soon as you have settled on a tagging standard.

---

**Question 2.** Monthly cost suddenly jumped to 3 times its usual level. What is the best approach for systematically finding the cause with Cost Explorer?

A) Exhaustively investigate the CUR with Athena
B) Drill down by narrowing the dimensions: Group by Service to identify the service, then Linked Account, then Tag (Project), then Usage Type
C) Terminate all instances
D) Create a budget

**Answer: B**

Explanation: Cost Explorer treats cost as a multidimensional OLAP cube, so tracing the cause of a spike is a drill-down by nature. First use Group by Service to see which service surged, narrow to that service, and then narrow the dimensions in turn: Linked Account (which account), Tag (which project), and Usage Type (data transfer, storage, or compute) to pinpoint the culprit. For example, if the Out-Bytes of EC2-DataTransfer surged, outbound data transfer is the cause. An exhaustive CUR investigation (A) is for heavier, deeper analysis.

---

**Question 3.** A company wants to automatically prevent new EC2 instances from being created when the monthly budget of $10,000 is reached (without human intervention). Which tool or feature should it use?

A) Cost Explorer
B) AWS Budgets + Budgets Action (attach an IAM Deny policy or apply an SCP)
C) Cost Anomaly Detection
D) Trusted Advisor

**Answer: B**

Explanation: Only Budgets Action can automatically "block" spending. When a threshold is reached, it can attach a Deny policy to specific users or roles (IAM Action), apply an SCP to an OU, or automatically stop EC2/RDS instances. Cost Explorer (A) only analyzes, and Cost Anomaly Detection (C) only detects and alerts; neither can block. However, an SCP is a blunt instrument that affects the entire OU, so it is safer to keep broad actions on a MANUAL approval model.

---

**Question 4.** A company needs to know exactly how much a single EC2 instance spent per hour, and also needs custom SQL analysis that converts cost per user according to the company's own criteria. Which data source should it use?

A) The Cost Explorer console
B) Cost and Usage Report (CUR) + S3 + Athena: arbitrary SQL over raw hourly, resource-level data
C) Budgets
D) Trusted Advisor Cost

**Answer: B**

Explanation: Cost Explorer is a fast summary over predefined dimensions, so it cannot perform arbitrary complex joins or custom aggregations over raw hourly, resource-level data. The most detailed source of truth is the CUR: every hourly, resource-level row is stored in S3 as Parquet, and you run arbitrary SQL with Athena. Thanks to columnar Parquet, only the needed columns are scanned, which makes queries fast and cheap. Custom analyses such as internal cost tools, showback, and applying exchange rates are the domain of the CUR.

---

**Question 5.** A company started a new workload in a newly created account, and Cost Explorer's cost forecast and the Budgets FORECASTED threshold keep missing the mark. What is the cause and the remedy?

A) A Cost Explorer bug; restart it
B) The forecasting ML model lacks the historical data to learn from; until history accumulates, also set an ACTUAL threshold as a safety net
C) The Region is wrong
D) An IAM permission problem

**Answer: B**

Explanation: A cost forecast is an extrapolation by an ML model that learned past patterns, so it misses widely when there is no history to learn from, as with a new account or a new workload (a reliable forecast usually needs several months of history). A forecast also cannot foresee abrupt changes that never occurred in the past. So when history is thin, do not rely on FORECASTED alone; set an ACTUAL threshold alongside it to provide a safety net based on measured spend. The forecast line is a statistical estimate with a confidence interval, not a certain future.

---

**Question 6.** A company wants to create a Budgets Action that uses an SCP to block EC2 creation across an entire OU when the budget is exceeded. Which setting deserves the most careful consideration?

A) Setting the threshold to 0%
B) The approval model: an SCP is a broad action affecting the entire OU, so set it to MANUAL so that a person approves it before it runs
C) The notification email address
D) The budget name

**Answer: B**

Explanation: Applying an SCP automatically is powerful, but it is a blunt instrument that affects every account and every user in the OU, and it can block even urgent operational work. In the Budgets Action approval model, `AUTOMATIC` runs immediately, while `MANUAL` runs only after a person approves it in the console. The standard practice is to set irreversible or broad actions (SCPs) to MANUAL to reduce the risk of malfunction, and to set only safe, localized actions to AUTOMATIC.

---
