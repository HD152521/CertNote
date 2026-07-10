# Day 4 - Billing Structure: Pay for Many Accounts as One, and Gauge Costs in Advance

As an organization grows, it doesn't stop at a single account. Splitting accounts by team, by environment, and by project is common. That makes billing and governance complex. Today we'll organize **AWS Organizations and consolidated billing** for grouping, managing, and paying across many accounts, the **Pricing Calculator** for calculating costs before moving to the cloud, and the **TCO concept** for comparing total cost of ownership against on-premises.

There are two core questions: "How do I govern the costs and permissions of many accounts from one place?" and "How do I gauge costs before using them?"

## AWS Organizations: Group and Govern Many Accounts

**AWS Organizations** is a service that **groups multiple AWS accounts into one organization and manages them centrally**. You can group accounts into Organizational Units (OUs) and apply guardrails in bulk with **Service Control Policies (SCPs)** — such as "these accounts can't use certain Regions or services."

Why split accounts? Because it makes environment isolation (separating production/development), per-team permission and cost separation, and securing security boundaries easier. Organizations brings those scattered accounts together into **a single point of control**.

> 💡 **Related theory**: If you see "manage many accounts centrally," "group with OUs," or "apply policies in bulk with SCPs," it's Organizations. Permission and policy governance is the core keyword.

## Consolidated Billing: One Bill

**Consolidated billing** is a core benefit of Organizations that **combines the bills of all accounts in the organization into a single management (payer) account**. Its advantages are clear.

1. **Single bill** — even with dozens of accounts, you pay once. Accounting is simplified.
2. **Aggregated volume discounts** — usage from all accounts is combined, so you reach tiered discount tiers like S3's faster.
3. **Shared commitments** — unused RI/Savings Plans commitments can be used by other accounts in the organization, reducing waste.

```
[Billed per account]     [Consolidated billing]
Account A bill            ┌─ Account A ─┐
Account B bill    →       │  Account B  │ → Combined into 1 management-account bill
Account C bill            └─ Account C ─┘   (discount aggregation + commitment sharing)
```

> 💡 **Related theory**: If you see "combine bills of many accounts into one," "larger volume discount from aggregated usage," or "share commitments (RI/SP)," it's consolidated billing. Cost savings and simplified accounting are the core of its effect.

## AWS Pricing Calculator: Estimate Before You Use

**AWS Pricing Calculator** is a free estimation tool that **calculates the expected cost of an architecture you haven't deployed yet, in advance**. You enter something like "3 EC2 m5.large instances for a month, together with RDS — roughly how much?" and it produces an estimated monthly/annual cost. It's used for migration planning, budgeting, and inside-vs-outside (cloud vs. on-premises) comparison.

An important point is that its timing differs from Day 2's Cost Explorer/CUR. Cost Explorer looks at costs you've **already spent** (after the fact), while Pricing Calculator estimates costs **before you use them** (in advance).

| Timing | Tool | Purpose |
|------|------|------|
| In advance (before use) | Pricing Calculator | Cost estimation, budget/migration planning |
| After the fact (after use) | Cost Explorer / CUR | Actual cost analysis/forecast |

> 💡 **Related theory**: If you see "estimate expected costs before deployment" or "estimate migration costs," it's Pricing Calculator. If it's "analyze costs already incurred," it's Cost Explorer's territory.

## TCO (Total Cost of Ownership): Compare On-Premises vs. Cloud Properly

**TCO (Total Cost of Ownership)** is a concept that **sums up all the costs** of owning and operating an asset. When comparing on-premises and cloud, looking only at the "server price" leads to a wrong conclusion. A real comparison must include **even the costs that aren't easily visible**.

- **On-premises TCO**: Beyond server/storage purchase costs, the **hidden costs** are large — data center space, power, and cooling; hardware maintenance; operations staff; aging-equipment replacement, and so on.
- **Cloud TCO**: It converts capital expenditure (CapEx) into operating expenditure (OpEx), and AWS takes on much of the hidden cost above, so in many cases it **lowers total cost**.

> 💡 **Related theory**: If you see "compare cloud's total cost against on-premises" or "include hidden costs like power, cooling, and staff," it's the TCO perspective. It's a concept directly tied to Week 1's CapEx→OpEx shift, and you can use Pricing Calculator to produce the cloud-side estimate for a TCO comparison.

## One-Page Summary

| Signal (keyword) | Answer |
|--------------|----|
| Centrally manage many accounts, OUs, bulk SCP policies | AWS Organizations |
| Combine bills into one, aggregate volume discounts, share commitments | Consolidated billing |
| Estimate expected costs before deployment, migration planning | Pricing Calculator |
| On-premises vs. cloud total cost including hidden costs | TCO |

## Wrapping Up

Today's one sentence: **govern many accounts with Organizations and combine them into one bill with consolidated billing to grow discounts; before using, produce estimates with Pricing Calculator and compare honestly against on-premises with the TCO perspective.** In the end, the billing structure has two goals — simplified management and cost savings. Organizations backs governance, consolidated billing backs savings, and Pricing Calculator and TCO back decision-making.

In the next article, we'll review all of Week 5 — pricing models, cost tools, support plans, and billing structure — in one go.

---

## 📝 연습 문제

**문제 1.** A company running dozens of AWS accounts wants to combine payment into one bill and aggregate usage to grow volume discounts. Which feature is the best fit?

A) AWS Budgets  
B) AWS Organizations consolidated billing  
C) AWS Pricing Calculator  
D) Cost allocation tags  

**정답: B**  
해설: Organizations consolidated billing combines all account bills into a single management account, aggregates usage to reach volume discount tiers sooner, and also shares RI/SP commitments. Budgets is budget alerts, Pricing Calculator is advance estimation, and tags are a cost-breakdown basis — none is a bill-combining feature.

---

**문제 2.** You want to group multiple accounts into Organizational Units (OUs) and apply bulk guardrails with Service Control Policies (SCPs) to govern centrally. Which service is the best fit?

A) AWS Organizations  
B) AWS Trusted Advisor  
C) Amazon CloudWatch  
D) AWS Cost Explorer  

**정답: A**  
해설: AWS Organizations groups multiple accounts into OUs and applies policies in bulk with SCPs to manage and control centrally. Trusted Advisor is automatic checks, CloudWatch is monitoring, and Cost Explorer is cost analysis — none is a multi-account governance feature.

---

**문제 3.** You want to estimate in advance the expected monthly cost of moving a new, not-yet-deployed architecture to the cloud in order to plan a budget. Which tool is the best fit?

A) AWS Cost Explorer  
B) AWS Cost and Usage Report  
C) AWS Pricing Calculator  
D) AWS Budgets  

**정답: C**  
해설: Pricing Calculator is an advance-estimation tool that calculates the expected cost of an architecture before deployment, well suited for migration and budget planning. Cost Explorer and CUR are after-the-fact tools for costs already incurred, and Budgets is a budget-exceeded alert feature.

---

**문제 4.** The cost of maintaining an on-premises data center includes hidden costs like power, cooling, and operations staff, on top of server purchase costs. What is the concept of summing all such costs to compare against the cloud?

A) Volume discount  
B) Total Cost of Ownership (TCO)  
C) Reserved Instances  
D) Savings Plans  

**정답: B**  
해설: TCO (Total Cost of Ownership) is the concept of summing not just purchase costs but hidden costs like power, cooling, staff, and maintenance to compare on-premises and cloud honestly. Volume discounts are usage-based unit-price reductions, and RI/Savings Plans are commitment discount models — different from a total-cost comparison concept.

---

**문제 5.** Which of the following is LEAST related to the cost-side benefits of consolidated billing?

A) All account bills are combined into one, simplifying accounting  
B) Per-account usage is aggregated, reaching volume discount tiers sooner  
C) RI/Savings Plans commitments can be shared by other accounts in the organization  
D) Different SCPs are forcibly applied to each account to automatically reduce costs  

**정답: D**  
해설: SCPs are not a cost benefit of consolidated billing but a permission/governance control of Organizations, and the policies themselves don't automatically reduce costs. Single bill, aggregated volume discounts, and commitment sharing are all genuine cost-side benefits of consolidated billing.

---
