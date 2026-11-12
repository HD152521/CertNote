# Day 2 - Cost Management Tools: See What You Spent, Stop Leaks Before They Happen

## 📌 Key Takeaways

- **Cost Explorer** = **household ledger.** It lets you look into past costs as graphs and forecasts how much you'll be charged going forward at this trend.
- **AWS Budgets** = **card spending alert.** If you set a limit in advance, it warns you when you approach or exceed it.
- **CUR (Cost and Usage Report)** = **the original transaction statement.** It exports the most detailed line items to S3 for use in custom analysis.
- **Cost allocation tags** = **expense category labels.** Costs split by team and project only if you attach tags **and activate them.**
- One-line flow: **See (Cost Explorer) → Stop (Budgets) → Dig deep (CUR) → Divide up whose it is (tags).**

Yesterday we learned that the same resource costs different amounts depending on the purchasing option. But however well you choose, if **you can't see how much you're spending where,** neither optimization nor control is possible. Today we cover four tools: looking into costs (analysis), stopping them in advance (budget alerts), examining them in detail (detailed reports), and telling who spent on what (tags).

There are three key questions: "What do past costs look like?", "Can I find out before I exceed the budget?", and "Which team or project does this cost belong to?"

## Why Did "Cost Management Tools" Become Necessary Only After the Move to the Cloud?

Why these tools exist becomes clear at once if you recall **the days when there were no tools.**

In the on-premises era, the cost question was already settled. The price was fixed the moment you bought the server, and for the next few years only the electricity bill came and went. The question "How much did our team spend this month?" hardly even came up. That's because it was **money that had already gone out.**

The cloud is the exact opposite. Three things changed at once.

1. **Costs occur every moment** — the time you leave things on is money. If you don't turn off a server you briefly tried out yesterday, charges accrue today and tomorrow too.
2. **Anyone can turn on resources** — the cloud's strength of "on-demand self-service" becomes a risk on the cost side. With a few clicks and no approval, resources appear, and if the person who turned them on forgets, nobody knows.
3. **Items are split into fine pieces** — hundreds of lines are printed on a single bill. By scanning it with your eyes you can't tell what has grown.

So for an organization without tools, the cloud bill tends to become **"a letter you open at the end of the month and are shocked by."** A server spun up briefly for testing, a disk snapshot you forgot to delete — each is small, but multiplied across a month it becomes an amount you can't ignore. Worse, **you find out only at the end of the month.**

```
[Organization without tools]
Create resource ──── Nobody knows all month ──── End-of-month bill (shock)

[Organization using tools]
Create resource ─ Label with tags ─ Budgets alert ─ Cost Explorer check ─ The bill you expected
                   (whose it is)    (limit nearing)   (where did it grow)
```

The four tools you learn today are the parts that make the bottom row of this picture. The goal is to change **from checking costs after an incident to handling them before it happens.**

Imagine the first month after a startup of about ten employees moved to the cloud. They set the budget generously, but the bill came out at double that. The cause was that a new developer had spun up several large servers for performance testing, turned off only one, and forgot the rest. Finding the person at fault is not the point. The real problem is that **the organization had neither a device showing "who turned on what," nor one telling it "you've gone past half the budget."**

"Making it an organizational habit to continuously view, allocate, and optimize cloud costs" is called Cloud Financial Management. It is the same story as the **Cost Optimization** pillar of the AWS Well-Architected Framework.

## AWS Cost Explorer: See Costs and Forecast Them

**AWS Cost Explorer** is an analysis tool that **visualizes past costs and usage and forecasts the future.** With graphs and tables, it shows "how much you spent on which services over the past six months" and "about how much next month will be at this trend." You can also break it down by service, Region, or tag.

Its use is clear. It finds which services are eating up costs, and by getting RI and Savings Plans recommendations, it helps you discover optimization opportunities. In a word, it is a tool that **"analyzes the past and looks ahead to the future."**

**By analogy, it's a household ledger.** The reason to keep a household ledger is not to avoid spending money but **to know where it leaks.** If you look only at the total, you can't learn more than "I spent a lot this month," but if you split it into food, transport, and subscription fees, "so the subscription fees had been quietly growing" comes to light. This is exactly what Cost Explorer does.

Cost Explorer splits costs by several criteria.

| Split by | Question it answers |
|----------|---------------------|
| Service | "Which service does half of our cost come from?" |
| Period (day/month) | "Since when did it start to grow?" |
| Region / account | "Are charges coming from a place we thought we weren't using?" |
| Tag | "Which team's or project's cost is it?" (tag activation required) |

In practice, the moment you open Cost Explorer is when the bill has grown and you want to find **"where it grew."** Narrowing down from **total → service → Region → resource** is the basic path of a cost investigation. The forecast feature works in the same context, letting you make the judgment "at this pace we'll exceed the budget" **in the middle of the month.**

The bill of an online education service suddenly grew a lot. Looking at the total alone, the cause wasn't clear, but when they split it by service in Cost Explorer, only the data transfer cost stood out. Digging in, they found that newly uploaded high-definition lecture videos were being served directly from the origin storage every time, without a CDN. The service hadn't slowed down and there was no outage, so **nobody had noticed anything wrong before looking at the cost graph.** It is a typical scene of cost visibility becoming an early warning for an architecture problem.

When you see "visualize cost trends," "analysis by service," or "forecast future costs," it's Cost Explorer. Analysis and forecasting are the core; it is not a tool that sends limit warnings (that's Budgets).

> ⚠️ **Trap**: Cost Explorer is a tool you can see **only if a person opens it.** It doesn't send text messages or emails on its own. If an exam question mixes in expressions like "**receive notifications automatically**" or "**be notified when the limit is reached**," the answer is not Cost Explorer but **Budgets.** Conversely, if it's "check with a graph," "trend analysis," or "forecast," it's Cost Explorer. The words that separate these two tools are ultimately **"you go and look" vs "it tells you."**

## AWS Budgets: Set a Budget and Get Notified Before You Exceed It

**AWS Budgets** is a tool that **lets you set cost and usage budgets and sends an alert (email/SNS) when you approach or exceed the limit.** For example, if you set the budget at "$500 per month" and configure "notify me when it reaches 80% (= $400)," you can take action before the bill turns into a bomb.

It is often confused with Cost Explorer, but the roles differ. Cost Explorer is "analyze costs already spent," and Budgets is "warn in advance so there are no leaks going forward." The two are complementary.

| Item | Cost Explorer | AWS Budgets |
|------|---------------|-------------|
| Focus | Analyzing past costs, forecasting the future | Setting budgets, threshold alerts |
| Main action | Visualization / viewing reports | Advance warning when a limit is reached |
| When | "I want to see how much I spent" | "I want to know before I exceed the budget" |

**By analogy, it's the text message for card spending.** The message comes not because you don't know how to read the statement, but because **the statement arrives a month later and by then it's too late.** Budgets attaches this alert to cloud charges. The alert comes to you first, even if you don't go into the console.

A budget can be set not only on amounts (a cost budget) but also on **usage itself,** and it can also be used to monitor whether you're making good use of Reserved Instances and Savings Plans you've purchased (utilization and coverage).

There are two bases for setting alerts. The **actual** basis rings when the amount already spent reaches the threshold, and the **forecasted** basis rings in advance when it looks like "at this trend we'll exceed it." The former is certain but late, and the latter is early but an estimate. So you usually set both together.

A small game studio put up a test server for a new title and set a separate budget on its development account. Soon a forecast alert arrived saying "at this trend, it looks like this month's budget will be exceeded," and when they checked, a load-test script had failed to terminate and was just creating new servers every time. **What would have cost a whole month's worth if they'd learned of it from the end-of-month bill was cut off at a few days' worth thanks to the alert.**

When you see "set a budget," "alert when a threshold is exceeded," or "prevent a cost bomb," it's Budgets. If it's "analysis/forecast," it's Cost Explorer.

> ⚠️ **Trap**: Budgets is, by default, a tool that **notifies.** Even if you exceed the budget, AWS does not shut down services or lock the account on its own. If a choice on the exam is written like "**when the budget is exceeded, resources are automatically stopped,**" treat it as a wrong-answer signal. If you need an automatic action, you must **design it yourself** by attaching a separate action to the alert. The cloud's basic stance is "don't stop the customer's workloads at its own discretion," and that is consistent with the shared responsibility model in which control is the customer's responsibility.

## AWS Cost and Usage Report (CUR): The Most Detailed Billing Data

**AWS Cost and Usage Report (CUR)** is **the most detailed cost and usage data** AWS provides. It breaks every usage line item down to the hourly level and exports it to an S3 bucket, and you can dig deep by connecting it to analysis tools such as Athena and QuickSight.

If Cost Explorer is "dashboard-level visualization," CUR is "the raw data itself." It is used when an accounting team has to allocate costs precisely, or when a large organization needs to do custom analysis.

**By analogy, it's the original bank transaction statement.** If the "spending by category" summary screen in a bank app is Cost Explorer, then CUR is **the original file with every transaction printed one per line** that you hand to your tax accountant. The original is inconvenient to read, but it can answer questions the summary screen cannot.

When do you need the original? When departmental settlement has to be right down to the decimal point, and when you want to look from **an angle AWS hasn't prepared in advance, such as "infrastructure cost per customer."**

```
[The path CUR takes]
AWS billing data ──> Loaded into an S3 bucket as files ──> Analysis tools (Athena/QuickSight, etc.)
   (line items)         (storage that I own)                (the questions I want)
```

To sum up, the difference is that **with Cost Explorer "you view the screen AWS made for you," while with CUR "you build the screen you want yourself."** It shows its true worth in organizations that have people and tools to handle the data, and for a small team, Cost Explorer alone is generally enough.

When you see "the most detailed," "line-item level," or "export to S3 for custom analysis," it's CUR. Separate them as Cost Explorer for light viewing and forecasting, and CUR for precise raw data.

**Trap**: Turning on CUR doesn't create a new graph in the console. What CUR does is **drop files into your S3 bucket, and that's all;** what you do after that is the customer's job. If the words "most detailed," "raw," "export," and "custom analysis" appear together in an exam choice, it's CUR; if it's "a graph that's ready to view right away," it's Cost Explorer. Keep them separated that way.

## Cost Allocation Tags: Dividing Up Whose Cost It Is

**Cost allocation tags** are a feature that **activates tags attached to resources (key-value, such as `Project=alpha`, `Team=marketing`) as a criterion for splitting costs in the billing data.** Then, in Cost Explorer or CUR, you can view costs **split by tag,** such as "costs spent by the marketing team" or "costs of the alpha project."

Without tags, all costs appear as one lump, and you can't ask "whose cost is this?" That's why they are essential for departmental charging (showback/chargeback) and project-level settlement.

```
[Tags create cost visibility]
No tags   → All costs in one lump, unclear who is responsible
With tags → Costs separated by Team/Project/Env, accurate allocation
```

**By analogy, it's the expense category label you stick on a receipt.** If you throw all your receipts into a drawer, you know the total, but you can't tell "how much did I spend on this business trip?" If you write 'trip,' 'team dinner,' or 'supplies' on each receipt, classification becomes possible from then on. In the cloud, tags play that role of label.

For tags to actually appear in cost reports, you have to go through **both steps.** ① Attach a key-value such as `Team=marketing` to the resource, and ② **activate that tag as a cost allocation tag** on the billing screen. If you forget ②, the tags are attached, but the report shows no change at all. The answer to "I attached all the tags, so why can't I see them?" is mostly here.

Tags are divided into **user-defined tags** that customers set themselves (`Team`, `Project`, `Env`, `CostCenter`, and so on) and **AWS-generated tags** that AWS attaches automatically. What is actually used for cost allocation is mostly the former.

And there is one thing an organization must decide first — **naming rules.** Tag keys are case-sensitive, so `Team`, `team`, and `TEAM` are treated as **different tags.** If each person writes them differently, the costs scatter three ways and nothing gets aggregated. That's why mature organizations **manage tags as a standard list.**

Costs separated this way are used for **showback** — just showing "your team spent this much" — or **chargeback** — actually deducting that amount from the team's budget. Neither can even get started without tags. You might even memorize it as **"tags are a prerequisite for cost management."**

Picture a company where three business units shared one account. The bill came as a single sheet, and the whole amount came out of the information systems team's budget. The result was as expected — the business units created the resources, while the information systems team paid. Nobody economized. What this company did was not to change the pricing plan or to reduce servers. All it did was **set tag rules, turn tags on, and start sharing each business unit's costs every month.** That alone noticeably cleaned up unused resources. Costs start being managed from the moment they become visible.

When you see "separate costs by department/project," "allocate costs to teams," or "bill by tag," it's cost allocation tags. Analysis tools (Cost Explorer/CUR) can show costs by tag only when tags are turned on.

**Trap**: If you activate tags later, costs split by tag **only from the data after the point of activation.** Last month's bill isn't retroactively divided neatly. That's why it is overwhelmingly easier to decide tag rules **first,** before adding accounts and before resources multiply.

## Telling the Confusing Four Apart at Once

On the exam, these four (plus the billing dashboard) always appear together in the same set of choices.

| Tool | One-line identity | Timing | What a person has to do |
|------|-------------------|--------|-------------------------|
| Billing dashboard | The first screen summarizing charges so far this month | Now | Open it |
| Cost Explorer | An analysis screen that splits costs and forecasts trends | After the fact | Open it and dig in |
| AWS Budgets | A warning device that lets you set a limit and tells you before you exceed it | Advance warning | Set it once and alerts come |
| CUR | Exporting the most detailed raw billing data to S3 | After the fact (precise) | Process it yourself with analysis tools |
| Cost allocation tags | Labels that divide costs by team and project | Prerequisite | Attach tags and activate them |

**Without tags you can't divide, without Cost Explorer you can't see, without Budgets you find out late, and without CUR you can't dig deep.** The four don't replace one another.

The four tools form a single cost management flow. You visualize costs to find where they leak, prevent overruns with budget alerts, analyze precisely with detailed reports, and make accountability clear with tags. These tools do nothing just by being turned on. Someone has to open the graph, and someone has to receive the budget alert and take action. Cost management is closer to a matter of habit and responsibility than of technology.

## How This Appears on the Exam

When the expressions below appear in a question, the answer is settled. Common trap choices are listed alongside.

| When the question has an expression like | The answer is | Choice easily used as a wrong answer |
|------------------------------------------|---------------|--------------------------------------|
| "Visualize with graphs," "trend analysis," "forecast next month" | Cost Explorer | Budgets (it's an alerting tool, so a different nature) |
| "Alert when a threshold is reached," "notify before exceeding" | AWS Budgets | Cost Explorer (no automatic alerts) |
| "Most detailed," "line items," "export to S3 for custom analysis" | CUR | Cost Explorer (summary level) |
| "Split costs by department for settlement," "separate costs by project" | Cost allocation tags | Budgets (not a splitting feature) |
| "Calculate the expected cost before deploying" | Pricing Calculator (Day 4) | Cost Explorer (it's for costs already spent) |
| "Track who called which API" | CloudTrail (not a cost tool) | Cost Explorer |

The last row is especially important. **CloudTrail is not a cost tool but an audit (who did what) tool.** It is a wrong-answer choice that slips quietly into the choices of cost questions.

## Cost Tool Signal Keywords

| Signal (keyword) | Tool |
|------------------|------|
| Visualizing past costs, analysis by service, forecasting the future | Cost Explorer |
| Setting a budget, alert when a threshold is exceeded | AWS Budgets |
| Most detailed line items, S3 export, custom analysis | Cost and Usage Report (CUR) |
| Separating/allocating costs by team and project | Cost allocation tags |

In the next article, we'll look at how AWS helps us when problems arise — support plans and Trusted Advisor.

## 📖 Glossary

- **AWS Cost Explorer**: An analysis screen that splits past costs into graphs and forecasts future costs. Corresponds to a household ledger.
- **AWS Budgets**: A warning device that lets you set cost and usage limits and tells you when you approach or exceed them. Corresponds to a card spending alert.
- **Actual / forecasted basis alerts**: An alert that rings when the amount already spent reaches the limit / an alert that rings in advance when it looks like you'll exceed it at this trend.
- **CUR (Cost and Usage Report)**: A feature that exports the most detailed raw billing data to your S3 bucket. Corresponds to the original transaction statement.
- **Line item**: One line of usage details in the billing data. The smallest unit CUR handles.
- **Cost allocation tags**: A feature that uses key-value labels attached to resources as a criterion for splitting billing data. They apply only once activated.
- **Showback / chargeback**: Just telling each team its usage cost / actually deducting it from that team's budget.
- **Billing dashboard**: The first screen showing cumulative charges so far this month and a per-service summary.
- **Cloud Financial Management**: An organization's operating habit of continuously viewing, allocating, and reducing cloud costs.

---

## 📝 Practice Questions

**Question 1.** You want to analyze in a graph which services cost the most over the past few months and forecast future costs. Which tool is the best fit?

A) AWS Budgets  
B) AWS Cost Explorer  
C) Cost allocation tags  
D) AWS CloudTrail  

**Answer: B**  
Explanation: Cost Explorer is an analysis tool that visualizes past cost and usage and forecasts future costs. Budgets is for budget-exceeded alerts, cost allocation tags are merely a cost-breakdown basis and don't perform analysis or forecasting themselves, and CloudTrail is an API audit log, not a cost analysis tool.

---

**Question 2.** You set a monthly budget and want to automatically receive a notification when actual costs reach a set percentage of that limit, to prevent overruns. Which tool is the best fit?

A) AWS Cost Explorer  
B) AWS Cost and Usage Report  
C) AWS Budgets  
D) AWS Pricing Calculator  

**Answer: C**  
Explanation: AWS Budgets sets cost and usage budgets and sends notifications when a threshold is reached or exceeded, preventing bill bombs. Cost Explorer is for after-the-fact analysis, CUR is for detailed data export, and Pricing Calculator is for advance cost estimation — threshold alerting is not their core function.

---

**Question 3.** An accounting team wants to export the most detailed line-item billing data — broken down to the hourly level — to S3 for custom analysis with Athena. Which is the best fit?

A) AWS Budgets  
B) AWS Cost and Usage Report (CUR)  
C) AWS Cost Explorer  
D) Cost allocation tags  

**Answer: B**  
Explanation: CUR is the most detailed cost and usage data AWS provides, well suited for exporting to S3 and doing custom analysis with Athena and QuickSight. Cost Explorer is dashboard-level visualization, Budgets is budget alerts, and tags are a cost-breakdown basis — different from raw-data analysis.

---

**Question 4.** Several teams share the same account, and you want to separate the costs each team incurs and settle them by department. Which feature should you use first?

A) Cost allocation tags  
B) Spot Instances  
C) AWS Budgets  
D) Free Tier  

**Answer: A**  
Explanation: Activating cost allocation tags lets you break costs down by tags like Team and Project and allocate/settle them by department. Budgets is budget alerts, and Spot/Free Tier are pricing models / free allowances, unrelated to separating costs by team.

---

**Question 5.** Which of the following most accurately describes the core difference between Cost Explorer and AWS Budgets?

A) Cost Explorer does budget alerts, and Budgets does cost visualization  
B) Cost Explorer does past analysis and forecasting, and Budgets does budget setting and overrun alerts  
C) They are identical and differ only in name  
D) Cost Explorer manages the free-tier allowance, and Budgets manages tags  

**Answer: B**  
Explanation: Cost Explorer is a tool that analyzes past costs and forecasts the future, while Budgets is a tool that sets a budget and sends alerts when a threshold is exceeded. The two have different roles and are complementary; managing the free allowance or tags is not their intrinsic role.

---
