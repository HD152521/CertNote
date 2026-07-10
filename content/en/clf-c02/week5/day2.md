# Day 2 - Cost Management Tools: See What You Spent, Stop Leaks Before They Happen

Yesterday we learned that the same resource can cost different amounts depending on how you buy it. But no matter how well you choose, **if you can't see how much you're spending and where**, neither optimization nor control is possible. Today we'll organize four tools that let you inspect costs (analysis), stop them in advance (budget alerts), examine them in detail (detailed reports), and distinguish who spent what on what (tags).

There are three core questions: "What did past costs look like?", "Can I know before I exceed a budget?", and "Which team or project does this cost belong to?"

## AWS Cost Explorer: See and Forecast Costs

**AWS Cost Explorer** is an analysis tool that **visualizes past cost and usage and forecasts the future**. With graphs and tables, it shows "how much you spent on which services over the past six months" and "roughly how much next month will be at this trend." You can also break it down by service, by Region, or by tag.

Its use is clear. Find out which service is eating up your costs, and get RI or Savings Plans recommendations to discover optimization opportunities. In a word, it's the **"analyze the past and look ahead to the future"** tool.

> 💡 **Related theory**: If you see "visualize cost trends," "analysis by service," or "forecast future costs," it's Cost Explorer. Its core is analysis and forecasting — it isn't a tool that sends limit alerts (that's Budgets).

## AWS Budgets: Set a Budget and Get Notified Before You Exceed It

**AWS Budgets** is a tool that **sets cost and usage budgets and sends notifications (email/SNS) when you approach or exceed those limits**. For example, set a budget of "$500/month" and configure "notify me when it reaches 80% (=$400)," and you can act before the bill becomes a bomb.

It's often confused with Cost Explorer, but their roles differ. Cost Explorer "analyzes costs you've already spent," while Budgets "warns you in advance so you don't leak going forward." The two are complementary.

| Item | Cost Explorer | AWS Budgets |
|------|---------------|-------------|
| Focus | Past cost analysis / future forecast | Budget setting / threshold alerts |
| Main action | Visualization / report viewing | Advance warning when a limit is reached |
| When | "I want to see how much I spent" | "I want to know before I exceed a budget" |

> 💡 **Related theory**: If you see "set a budget," "alert when a threshold is exceeded," or "prevent a bill bomb," it's Budgets. If it's "analysis/forecast," it's Cost Explorer.

## AWS Cost and Usage Report (CUR): The Most Detailed Billing Data

The **AWS Cost and Usage Report (CUR)** is the **most detailed cost and usage data** AWS provides. It breaks down every usage line item to the hourly level and exports it to an S3 bucket, and you can connect analysis tools like Athena and QuickSight to dig in deeply.

If Cost Explorer is "dashboard-level visualization," CUR is "the raw data itself." It's used when an accounting team needs to allocate costs precisely, or when a large organization needs to do custom analysis.

> 💡 **Related theory**: If you see "most detailed," "line-item level," or "export to S3 for custom analysis," it's CUR. Distinguish it as: lightweight viewing/forecasting is Cost Explorer, precise raw data is CUR.

## Cost Allocation Tags: Sort Out Whose Cost It Is

**Cost allocation tags** is a feature that **activates the tags attached to resources (key-value, e.g., `Project=alpha`, `Team=marketing`) as a cost-breakdown basis in the billing data**. Then, in Cost Explorer or CUR, you can **break costs down by tag** — like "the cost the marketing team spent" or "the alpha project's cost."

Without tags, all costs appear as one lump, and you can't tell "whose cost is this?" That's why they're essential for departmental cost billing (showback/chargeback) and project-level settlement.

```
[Tags create cost visibility]
No tags   → All costs in one lump, accountability unclear
Tags on   → Costs separated by Team/Project/Env, accurate allocation
```

> 💡 **Related theory**: If you see "break costs down by department/project," "allocate costs to teams," or "bill by tag," it's cost allocation tags. Analysis tools (Cost Explorer/CUR) can only show costs by tag when the tags are turned on.

## One-Page Summary

| Signal (keyword) | Tool |
|--------------|------|
| Visualize past costs / analyze by service / forecast future | Cost Explorer |
| Set a budget, alert when a threshold is exceeded | AWS Budgets |
| Most detailed line items, S3 export, custom analysis | Cost and Usage Report (CUR) |
| Break down / allocate costs by team or project | Cost allocation tags |

## Wrapping Up

Today's one sentence: **see (Cost Explorer) → stop (Budgets) → dig deep (CUR) → sort out whose it is (tags).** These four tools don't operate in isolation — they form a single cost-management flow. Visualize costs to find leaks, prevent bombs with budget alerts, analyze precisely with detailed reports, and make accountability clear with tags.

In the next article, we'll look at how AWS helps us when problems arise — Support Plans and Trusted Advisor.

---

## 📝 연습 문제

**문제 1.** You want to analyze in a graph which services cost the most over the past few months and forecast future costs. Which tool is the best fit?

A) AWS Budgets  
B) AWS Cost Explorer  
C) Cost allocation tags  
D) AWS CloudTrail  

**정답: B**  
해설: Cost Explorer is an analysis tool that visualizes past cost and usage and forecasts future costs. Budgets is for budget-exceeded alerts, cost allocation tags are merely a cost-breakdown basis and don't perform analysis or forecasting themselves, and CloudTrail is an API audit log, not a cost analysis tool.

---

**문제 2.** You set a monthly budget and want to automatically receive a notification when actual costs reach a set percentage of that limit, to prevent overruns. Which tool is the best fit?

A) AWS Cost Explorer  
B) AWS Cost and Usage Report  
C) AWS Budgets  
D) AWS Pricing Calculator  

**정답: C**  
해설: AWS Budgets sets cost and usage budgets and sends notifications when a threshold is reached or exceeded, preventing bill bombs. Cost Explorer is for after-the-fact analysis, CUR is for detailed data export, and Pricing Calculator is for advance cost estimation — threshold alerting is not their core function.

---

**문제 3.** An accounting team wants to export the most detailed line-item billing data — broken down to the hourly level — to S3 for custom analysis with Athena. Which is the best fit?

A) AWS Budgets  
B) AWS Cost and Usage Report (CUR)  
C) AWS Cost Explorer  
D) Cost allocation tags  

**정답: B**  
해설: CUR is the most detailed cost and usage data AWS provides, well suited for exporting to S3 and doing custom analysis with Athena and QuickSight. Cost Explorer is dashboard-level visualization, Budgets is budget alerts, and tags are a cost-breakdown basis — different from raw-data analysis.

---

**문제 4.** Several teams share the same account, and you want to separate the costs each team incurs and settle them by department. Which feature should you use first?

A) Cost allocation tags  
B) Spot Instances  
C) AWS Budgets  
D) Free Tier  

**정답: A**  
해설: Activating cost allocation tags lets you break costs down by tags like Team and Project and allocate/settle them by department. Budgets is budget alerts, and Spot/Free Tier are pricing models / free allowances, unrelated to separating costs by team.

---

**문제 5.** Which of the following most accurately describes the core difference between Cost Explorer and AWS Budgets?

A) Cost Explorer does budget alerts, and Budgets does cost visualization  
B) Cost Explorer does past analysis and forecasting, and Budgets does budget setting and overrun alerts  
C) They are identical and differ only in name  
D) Cost Explorer manages the free-tier allowance, and Budgets manages tags  

**정답: B**  
해설: Cost Explorer is a tool that analyzes past costs and forecasts the future, while Budgets is a tool that sets a budget and sends alerts when a threshold is exceeded. The two have different roles and are complementary; managing the free allowance or tags is not their intrinsic role.

---
