# Day 4 - Why Cost Governance Splits Into Three Stages: Measure, Account, Automate

So far — compute (Day 1), storage (Day 2), and network (Day 3) — we've looked at how to cut individual costs. But once an organization grows, a more fundamental problem appears: **nobody knows who is spending what, and how much.** In an environment where hundreds of engineers each spin up resources, the day the bill doubles, just tracing the cause can take days. Cost governance is the operational system that tames this chaos, and at its heart is an old management maxim — **you can't manage what you can't measure.** Making cost visible (visibility), deciding who is accountable (accountability), and automatically blocking spend once a limit is crossed (automation): these three stages are the skeleton of AWS's governance tooling.

The operating methodology that ties these three stages together is **FinOps**. Around 2018, companies that had lived through cloud cost explosions shared a cultural shift — "cost isn't the infrastructure team's job alone, but the responsibility of every engineer who creates a resource" — and formed the FinOps Foundation. FinOps's standard lifecycle is the loop of Inform (measure/visualize) → Optimize → Operate (run/automate), and AWS's Cost Explorer, Budgets, CUR, Cost Allocation Tags, and Anomaly Detection are precisely the tools that implement this lifecycle. Instead of listing tools, this article follows the reasoning — "why Cost Explorer and CUR exist separately," "how Budgets Actions forcibly stops spend," "why tag-based cost separation is an organizational-design problem" — to nail down the governance axis of the SAA cost domain.

## Why You Need Both Cost Explorer and CUR

Having two tools to look at cost data is confusing at first. **Cost Explorer** and **CUR (Cost and Usage Report)** both handle the same billing data, but their purposes are opposite.

**Cost Explorer** is an **interactive visualization console**. It instantly graphs cost by service, region, account, or tag, **forecasts** the next 12 months, and even runs ML-based **anomaly detection**, all on one screen. It's optimized for quickly exploring pre-aggregated data, answering "why did EC2 cost go up last month?" in a few clicks. In return, its aggregation granularity is fixed, so it can't do extremely fine-grained analysis like "the hourly cost of a specific resource ID."

**CUR** is the feature that **exports the most granular raw billing data to S3**. It drops every usage line — down to the hour and the individual resource — into S3 as CSV/Parquet, which you then query and analyze directly with **Athena, Redshift, or QuickSight**. It freely answers, in SQL, the arbitrarily complex questions Cost Explorer can't ("compare cost for a specific tag combination + specific Usage Type + specific time window, before and after Savings Plan application"). The cost is that you have to build the analysis pipeline yourself.

> 💡 **Related theory**: This split is the same as the **OLAP vs. raw data warehouse** distinction in data analytics. Cost Explorer is closer to an OLAP tool that quickly slices and dices a pre-aggregated multidimensional cube, while CUR is closer to a data warehouse source that preserves every fact row and permits arbitrary queries. It's exactly the same structure as the "metrics (pre-aggregated, fast, coarse-grained) vs. logs (raw, slow, fine-grained)" tension we saw in CloudWatch — you can't give both fast exploration and unlimited granularity in a single tool, so it splits into two.

> ⚠️ **Pitfall**: For a scenario like "analyze granular billing data with Athena," the answer is always **CUR → S3 → Athena**. Options claiming you'd query Cost Explorer with Athena, or run resource-level SQL inside Cost Explorer, are wrong. Conversely, "quickly see cost as a graph and forecast" is Cost Explorer. The key is not to map the two tools' roles (fast visualization vs. fine-grained raw analysis) backwards.

## Budgets and Budgets Actions: From Measurement to Enforcement

Visibility is after-the-fact — you see cost only after it has already been incurred. **AWS Budgets** takes a step further, **setting a limit in advance and firing an alert or action when a threshold is reached**. You can set budgets not only on cost but also on usage, and on the coverage/utilization of RIs/SPs — alerting when "this month's cost exceeds $1,000" or "the utilization of a purchased Savings Plan drops below 80%." Alerts go out via SNS, email, or Chatbot (Slack).

The truly powerful piece is **Budgets Actions**. Beyond a simple alert, when a budget threshold (e.g., 100%) is reached, it **automatically takes an action** — attaching a specific IAM policy to a user/group to block creation of expensive resources, applying an SCP, or stopping EC2/RDS instances. In other words, instead of "waiting for a human to wake up and act when cost exceeds budget," the system stops spend automatically. It's especially useful as a safety mechanism against runaway spend in development/experimental accounts.

> 📚 **Case study**: One of the scariest incidents in the cloud is **"bill shock"** — a misconfiguration or mistake, or an attacker exploiting leaked credentials, spins up expensive resources en masse (large GPU instances, infinite Lambda recursion, etc.) and racks up tens of thousands of dollars overnight. There are recurring reports of individual developers accidentally making an S3 bucket public and getting billed thousands of dollars from mass download traffic, or attackers using leaked AWS keys to launch cryptocurrency-mining instances. Budgets Actions is an automatic circuit breaker against such runaways, and combining it with Anomaly Detection, Service Quotas, and CloudTrail monitoring is the standard defense.

> 🔍 **Going deeper**: Separate from Budgets, **AWS Cost Anomaly Detection** uses ML to learn your normal spend patterns and automatically detect "sudden abnormal increases." If Budgets is **threshold-based** ("exceeds a fixed limit of $1,000"), Anomaly Detection is **pattern-based** ("is this statistically unusual versus normal?"). It's exactly the same relationship as CloudWatch's fixed-threshold Alarm vs. Anomaly Detection — when traffic and cost vary greatly by period, a fixed threshold is useless, so you need ML-based anomaly detection. The two are complementary; typically you catch "unexpected spikes" with Anomaly Detection and "crossing a predefined limit" with Budgets simultaneously.

## Why Tag-Based Cost Separation Is an Organizational-Design Problem

To answer "how much did the marketing team spend this month?", every resource has to carry a marker of **whose it is**. **Cost Allocation Tags** play this role — you attach tags like `Project`, `Environment`, `Owner`, or `CostCenter` to resources, and once you **activate** those tags in the management account, cost from that point on is grouped by tag value and shows up in Cost Explorer, CUR, and the bill.

There's an important trap here. **Tag activation is not retroactive** — only cost from the activation point onward is aggregated by tag; past cost is not classified. So the tag strategy must be decided before resources are created, and any omitted resource leaks out of cost tracking. Because of this, governance that enforces tags (e.g., blocking creation of untagged resources with an SCP or Config Rule) becomes the foundation of FinOps.

> 💡 **Related theory**: Tag-based cost separation is accounting's **cost allocation** and **showback/chargeback** models moved into the cloud. **Showback** merely shows each department "you used this much" (visibility, raising awareness of accountability), while **chargeback** actually bills it against that department's budget. Showback gently nudges behavior change; chargeback enforces strong cost accountability. Both require accurate tags, so tag design isn't a mere technical detail — it's an organizational-design decision about "how to slice the organization into cost units."

**Cost Categories** are an abstraction one level above tags. It's a rule engine that automatically classifies multiple tags, accounts, and services into business categories the company defines (e.g., "Product A," "Shared Infrastructure," "Security"). In a reality where tags are missing or inconsistent, Cost Categories lets you apply rules like "count account X and tag Y as Product A" to reorganize cost into business units after the fact.

## Multi-Account Governance: The Economics of Consolidated Billing

When you use multiple accounts in an Organizations environment, **Consolidated Billing** directly affects cost. All member accounts' usage is aggregated in the management account, and this goes beyond mere convenience to create real discounts.

First, **volume-discount aggregation**. In tiered pricing where the unit price drops as usage grows (like S3 transfer or data processing), combining multiple accounts' usage reaches a higher discount tier faster. Second, **Savings Plans/RI sharing**. A Compute SP or RI bought in one account is automatically applied to another account's usage too — if account A can't fully consume its commitment, the leftover discount flows to account B, reducing commitment waste. Third, **cost guardrails via SCP** — with Organizations' Service Control Policy, you block runaway spend in advance by preventing "a specific OU from using expensive GPU instances or a specific region."

> 🔍 **Going deeper**: **Billing Conductor** is a tool that layers "custom billing" on top of consolidated billing. It's used when a reseller (MSP) bills customers with a margin added, or when a large enterprise allocates shared-infrastructure cost to internal departments by specific rules. Separate from the actual AWS bill, it produces a "pro forma bill you show" so internal chargeback can be adjusted to fit the company's accounting rules. SAA doesn't probe this deeply, but when you see the keyword "custom billing per department/customer in a multi-account environment," Billing Conductor is the signal.

## Collaboration Among Operational Recommendation Tools

The last piece of cost governance is **getting recommendations on what to reduce**. Three tools collaborate in a complementary relationship.

| Tool | Approach | What it finds |
|------|------|------------|
| **Trusted Advisor** | Rule-based thresholds | Obvious waste: idle EIPs, unattached EBS, underutilized EC2, etc. |
| **Compute Optimizer** | ML-based analysis | Right-sizing to the optimal type/size for EC2, EBS, Lambda, ASG, ECS |
| **S3 Storage Lens** | Storage-specific dashboard | Class distribution, incomplete multipart uploads, S3 cost-optimization recommendations |

The key to this collaboration is the order "rough cleanup → precise tuning → domain specialization." Use Trusted Advisor to clear out the obvious garbage (unattached volumes), Compute Optimizer to precisely tune the size of what remains with ML, and Storage Lens to dig deep into the specific domain of S3. None replaces the others.

> ⚠️ **Pitfall**: The exam frequently mixes up these three tools' roles when asking. "ML-based EC2 right-sizing" is Compute Optimizer; "broad checks spanning unused resources, service limits, and even security" is Trusted Advisor; "S3 storage-class distribution and cost visibility" is Storage Lens. You must precisely hold the boundary that Compute Optimizer is not a cost-visibility tool and Trusted Advisor is not an ML right-sizing tool.

## Hands-on with the CLI

```bash
# Create a monthly $1000 cost budget
aws budgets create-budget --account-id 111122223333 --budget '{
  "BudgetName":"monthly-1000",
  "BudgetLimit":{"Amount":"1000","Unit":"USD"},
  "TimeUnit":"MONTHLY","BudgetType":"COST"}'

# Cost Anomaly Detection monitor (service-dimension ML anomaly detection)
aws ce create-anomaly-monitor --anomaly-monitor '{
  "MonitorName":"by-service","MonitorType":"DIMENSIONAL",
  "MonitorDimension":"SERVICE"}'

# Activate Cost Allocation Tags (only cost from the activation point is classified)
aws ce update-cost-allocation-tags-status --cost-allocation-tags-status '[
  {"TagKey":"Project","Status":"Active"},
  {"TagKey":"CostCenter","Status":"Active"},
  {"TagKey":"Env","Status":"Active"}]'

# Query last month's cost by service with Cost Explorer
aws ce get-cost-and-usage \
  --time-period Start=2026-05-01,End=2026-06-01 \
  --granularity MONTHLY --metrics "UnblendedCost" \
  --group-by Type=DIMENSION,Key=SERVICE

# Create a CUR report (granular data to S3, Athena integration)
aws cur put-report-definition --report-definition '{
  "ReportName":"detailed-cur","TimeUnit":"HOURLY",
  "Format":"Parquet","Compression":"Parquet",
  "AdditionalSchemaElements":["RESOURCES"],
  "S3Bucket":"my-cur-bucket","S3Prefix":"cur/","S3Region":"ap-northeast-2",
  "AdditionalArtifacts":["ATHENA"],"RefreshClosedReports":true,
  "ReportVersioning":"OVERWRITE_REPORT"}'
```

## Wrapping Up

Cost governance implements the FinOps lifecycle across three stages: measure, account, automate. ① **Cost Explorer** (fast visualization/forecasting/anomaly detection) and **CUR** (export granular raw data to S3 for Athena analysis) split roles like OLAP vs. raw warehouse — "fine-grained Athena analysis" is CUR, "fast graphs and forecasts" is Cost Explorer. ② **Budgets** provides advance limits and threshold alerts, **Budgets Actions** provides forced blocking via IAM/SCP/instance-stop when a threshold is hit, and **Anomaly Detection** catches abnormal spikes on a pattern basis with ML (bill-shock defense). ③ **Cost Allocation Tags** separate cost by department/project but aggregate only from the activation point with no retroactivity, so they require an advance tag strategy and enforcement — an organizational-design decision called showback/chargeback. ④ **Consolidated Billing** creates multi-account economics through volume-discount aggregation, SP/RI sharing, and SCP guardrails. ⑤ Trusted Advisor, Compute Optimizer, and Storage Lens collaborate as rough cleanup → precise tuning → domain specialization.

In the next article, we synthesize the four axes we saw over the week — compute, storage, network, governance — and do an integrated review that quickly maps the cost scenarios that appear on the actual SAA exam by keyword.

---

## 📝 연습 문제

**문제 1.** A finance team wants to freely analyze granular billing data — down to the hour and the individual resource — in SQL to build complex custom reports. What is the most suitable approach?

A) Capture graphs from Cost Explorer and analyze them
B) Export CUR to S3 and query it with Athena
C) Download a Trusted Advisor report
D) Extract data from Budgets

**정답: B**

해설: CUR (Cost and Usage Report) exports the most granular billing data — at the hour and resource level — to S3 and enables arbitrarily complex SQL analysis with Athena, Redshift, or QuickSight. Cost Explorer (A) is strong at fast visualization and forecasting but can't do free-form, resource-level SQL. Trusted Advisor (C) is a check/recommendation tool, and Budgets (D) is a budget/alert tool, not for fine-grained analysis. "Granular analysis with Athena" reflexively means CUR.

---

**문제 2.** A development account risks a runaway of expensive resources during an experiment. To automatically block creation of additional resources without human intervention once cost reaches 100% of budget, what should you use?

A) Set up a Cost Explorer alert
B) AWS Budgets + Budgets Actions to auto-attach an IAM policy
C) CloudWatch Alarm + SNS
D) Trusted Advisor alerts

**정답: B**

해설: Budgets Actions automatically takes an action when a budget threshold is reached — attaching a restrictive IAM policy to block expensive resource creation, or stopping instances. It's an automatic circuit breaker that doesn't wait for human intervention. Cost Explorer (A) only visualizes, CloudWatch Alarm + SNS (C) only sends an alert without automatic blocking, and Trusted Advisor (D) is a recommendation tool with no real-time forced-blocking capability.

---

**문제 3.** An organization attached a `CostCenter` tag to every resource to report cloud cost by department, but the per-tag breakdown still doesn't appear in Cost Explorer. What is the cause?

A) Tags are automatically reflected in cost classification
B) The tag was not activated as a Cost Allocation Tag in the management account
C) Tags apply only to EC2
D) Cost Explorer doesn't support tags

**정답: B**

해설: Merely attaching tags to resources is not enough; you must explicitly activate the tag as a Cost Allocation Tag in the management (billing) account for cost to be grouped by tag value. Also, activation is not retroactive, so only cost from the activation point onward is classified. A is wrong (not automatic), C is wrong (many resource types are supported), and D is wrong (Cost Explorer supports grouping by activated tags).

---

**문제 4.** A company's cloud cost varies greatly by period, making it hard to catch abnormal spikes with a fixed budget threshold. To automatically detect spend that is unusual versus the normal pattern using ML, what should you use?

A) AWS Budgets fixed threshold
B) AWS Cost Anomaly Detection
C) Trusted Advisor
D) Service Quotas

**정답: B**

해설: Cost Anomaly Detection uses ML to learn your normal spend pattern and detect "statistically abnormal increases" on a pattern basis, making it suitable for an environment where cost varies by period and a fixed threshold is useless. A Budgets fixed threshold (A) produces many false alarms or misses with highly variable cost. Trusted Advisor (C) is not an ML cost-anomaly tool, and Service Quotas (D) is limit management, unrelated to cost-spike detection. It's the same relationship as CloudWatch's fixed Alarm vs. Anomaly Detection.

---

**문제 5.** An enterprise runs multiple AWS accounts under Organizations. To automatically apply a Compute Savings Plan bought in account A to account B's EC2 usage and receive aggregated volume discounts, what should it use?

A) Keep separate billing per account
B) Use Consolidated Billing
C) Buy a separate SP per account
D) Connect accounts with PrivateLink

**정답: B**

해설: Organizations' Consolidated Billing aggregates all member-account usage in the management account, so an SP/RI bought in one account is automatically applied to another account's usage (reducing commitment waste) and volume discounts reach aggregated tiers faster. A loses this sharing/aggregation benefit, C wastes commitments when each account can't fully consume its own, and D is a networking-connection tool unrelated to billing.

---

**문제 6.** A team wants to analyze with ML whether EC2 instances are over-provisioned and get optimal-size recommendations, while also identifying obvious waste like unattached EBS volumes. What is the most appropriate tool combination?

A) Compute Optimizer (ML right-sizing) + Trusted Advisor (idle/unattached resources)
B) Cost Explorer alone
C) Macie + Inspector
D) Budgets + SNS

**정답: A**

해설: Compute Optimizer recommends the optimal type/size per instance with ML, and Trusted Advisor identifies obvious waste like unattached EBS, idle EIPs, and underutilized EC2 with rules — the two are complementary as "precise tuning + rough cleanup." Cost Explorer (B) is a visualization tool that can't do right-sizing, Macie/Inspector (C) are security tools, and Budgets (D) is budget management, unrelated to right-sizing and waste identification.

---

**문제 7.** An MSP (managed service provider) wants to issue custom invoices to multiple customer accounts with a margin added. To apply custom billing rules separate from the actual AWS bill, what should it use?

A) Cost Explorer
B) AWS Billing Conductor
C) Cost Allocation Tags
D) CUR

**정답: B**

해설: Billing Conductor layers custom billing on top of consolidated billing, producing a pro forma invoice where a reseller adds a margin for customers or allocates cost to internal departments by custom rules. Cost Explorer (A) is visualization, Cost Allocation Tags (C) is cost grouping, and CUR (D) is granular data export — none of them is a "custom invoice issuance" feature. "Multi-account custom/reseller billing" is the signal.

---

## 📌 Key Takeaways

Cost governance implements FinOps through measure, account, and automate. Cost Explorer (fast visualization/forecasting/anomaly detection) and CUR (export granular raw data to S3 for Athena analysis) split roles like OLAP vs. raw warehouse. Budgets provides advance limits and alerts, Budgets Actions provides forced blocking via IAM/instance-stop when a threshold is reached, and Anomaly Detection provides ML pattern-based spike detection (bill-shock defense). Cost Allocation Tags enable cost separation by department/project but are not retroactive, making it an organizational-design problem requiring an advance strategy and enforcement. Consolidated Billing creates volume-discount aggregation, SP/RI sharing, and SCP guardrails, and Trusted Advisor, Compute Optimizer, and Storage Lens collaborate complementarily.
