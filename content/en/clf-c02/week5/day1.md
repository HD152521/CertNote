# Day 1 - Pricing Models: The Same Compute Costs Differently Depending on How You Buy It

This week is about money. One of the cloud's biggest draws is "you pay only for what you use" — but in fact, the very same resource can cost dramatically different amounts **depending on how you purchase it**. Today we'll organize the compute pricing models centered on EC2 — On-Demand, Reserved Instances (RIs), Savings Plans, and Spot — along with the Free Tier for new users and volume discounts that lower your unit price the more you use.

There's one core question: "How long, and how predictably, does this workload run?" The answer to that determines the cheapest way to buy.

## On-Demand: No Commitment, Pay As You Go

**On-Demand** is the most basic pricing model. With no long-term commitment or upfront payment, you pay only by the hour (or second) you actually run. Start whenever you want, stop whenever you want. The trade-off is that the unit price is the highest.

When is it a good fit? It suits situations where **you don't know how much you'll use** — unpredictable traffic, short-term projects, or the early development and testing phases. It's also the starting point from which you "try it out first, understand the pattern, and then" optimize with a different model.

> 💡 **Related theory**: If you see "no commitment," "flexible," "unpredictable workload," or "short-term use," it's On-Demand. It's the starting point of cost optimization, not the destination.

## Reserved Instances (RIs) and Savings Plans: Commit and Get a Discount

If it's **certain your workload runs steadily**, you can get a large discount in exchange for committing to 1 or 3 years — up to roughly 72% cheaper than On-Demand.

- **Reserved Instances (RIs)**: Commit to a specific instance type, Region, and so on for 1 or 3 years. Because the commitment is tied to instance attributes, it's relatively rigid.
- **Savings Plans**: A **usage- (dollar-) based commitment** — "I'll spend a set amount per hour (e.g., $10/hr) for 1 or 3 years." The commitment applies flexibly even if you change instance type or Region, making it freer than RIs.

| Item | Reserved Instances (RIs) | Savings Plans |
|------|------------------|----------------|
| Commitment target | Specific instance attributes | Hourly dollar spend |
| Flexibility | Relatively low | High (allows type/Region changes) |
| Discount range | Up to ~72% vs. On-Demand | Up to ~72% vs. On-Demand |
| Best fit | Stable, fixed workloads | Stable but with configuration changes |

> 💡 **Related theory**: If you see "run a long-term steady workload as cheaply as possible," it's RIs or Savings Plans. When the clues "discount preserved even if type/Region changes" or "flexible commitment" are added, choose Savings Plans.

## Spot Instances: Spare Capacity at a Bargain — but It Can Be Reclaimed

**Spot Instances** let you **rent AWS's spare compute capacity at a bargain (up to roughly 90% off On-Demand), auction-style**. In return, if AWS needs that capacity back, it can **reclaim the instance after a short notice**.

That's why Spot only fits **work that's fine being interrupted (fault-tolerant)**. Batch processing, large-scale data analysis, rendering, and CI builds — workloads that can stop midway and restart — are the classic cases. It's a poor fit for always-on services that must never go down, like a payment server.

```
[The trade-off between price and stability]
On-Demand : Expensive, always guaranteed
RI/SP     : Committed, guaranteed + large discount
Spot      : Cheapest, can be reclaimed (interruption-tolerant work only)
```

> 💡 **Related theory**: If you see "cheapest," "spare capacity," or "batch/analysis work that's fine being interrupted," it's Spot. If it's an "always-on service that must not be interrupted," Spot is the wrong answer.

## Free Tier: A Free Allowance for First-Time Users

The **AWS Free Tier** is a free allowance that lets new users try out services without cost concerns. There are three kinds.

- **12 Months Free**: A set amount free for 12 months after sign-up (e.g., 750 hours/month of EC2 t2.micro, a set amount of S3).
- **Always Free**: A set amount free with no time limit (e.g., 1 million Lambda requests/month, a set amount of DynamoDB).
- **Trials**: Free use of a specific service for a short period.

> 💡 **Related theory**: If you see "new user" or "try it free up to a set limit," it's the Free Tier. Since you're billed normally once you exceed the limit, it's important to build the habit of checking your usage even while learning.

## Volume Discounts: The More You Use, the Lower the Unit Price

Many services use **tiered** pricing where **the unit price automatically drops as usage grows**. The prime example is **S3 storage**. For instance, the per-GB price in the tier above your first set of TBs is cheaper than the first tier. Data transfer and other areas have a similar structure.

On top of this, if you group multiple accounts under AWS Organizations and use **consolidated billing**, usage is aggregated so you reach higher discount tiers faster (consolidated billing is covered in detail on day4).

> 💡 **Related theory**: If you see "the per-GB price drops the more you use" or "usage-tier-based pricing," it's a volume (tiered) discount. Note that it's distinct from commitment-based discounts (RI/SP) — it's an automatic discount based on usage itself.

## One-Page Summary

| Signal (keyword) | Pricing model |
|--------------|-----------|
| No commitment, flexible, unpredictable, short-term | On-Demand |
| 1–3 year commitment, stable workload, large discount | RI / Savings Plans |
| Discount preserved even when type/Region changes | Savings Plans |
| Cheapest, spare capacity, interruption-tolerant work | Spot |
| New user, free up to a limit | Free Tier |
| Unit price drops the more you use (e.g., S3) | Volume/tiered discount |

## Wrapping Up

Today's one sentence: **choose your purchasing method based on "how long and how certainly you'll use it," and you can run the same resource far more cheaply.** If it's unpredictable, start with On-Demand; once the pattern settles and it's stable, take commitment discounts with RI/Savings Plans; for interruption-tolerant work, aim for the lowest price with Spot. Learn without worry using the Free Tier, and when usage is large, volume discounts automatically lower your unit price.

In the next article, we'll look at the tools that let you actually inspect and control the costs you've incurred — Cost Explorer, Budgets, and cost reports.

---

## 📝 연습 문제

**문제 1.** You want to run a new project whose traffic pattern is still uncertain, flexibly and without commitment. Which pricing model is the best fit?

A) Reserved Instances (RIs)  
B) Spot Instances  
C) On-Demand  
D) Savings Plans  

**정답: C**  
해설: On-Demand bills only for what you run, with no long-term commitment or upfront payment, so it's a good starting point for unpredictable or short-term workloads. RIs and Savings Plans assume a 1–3 year commitment, which is a burden when the pattern is uncertain, and Spot carries reclamation risk that doesn't suit stable operation.

---

**문제 2.** You want to run a stable workload that runs steadily 24 hours a day as cheaply as possible, but you also want the discount to keep applying even if you change the instance type or Region. Which is the best fit?

A) Savings Plans  
B) On-Demand  
C) Spot Instances  
D) Free Tier  

**정답: A**  
해설: Savings Plans commit to an hourly dollar spend, so the commitment applies flexibly even when you change instance type or Region. On-Demand has no discount, Spot carries high reclamation risk that doesn't suit always-on stable operation, and the Free Tier is merely a free allowance for new users, not a discount mechanism for always-on workloads.

---

**문제 3.** You want to process a large-scale batch data analysis job — one that's fine to be interrupted and restarted midway — as cheaply as possible. Which pricing model is the best fit?

A) On-Demand  
B) Reserved Instances (RIs)  
C) Spot Instances  
D) Savings Plans  

**정답: C**  
해설: Spot Instances use AWS spare capacity at up to roughly 90% off On-Demand but can be reclaimed, making them the best fit for interruption-tolerant (fault-tolerant) batch and analysis work. On-Demand, RIs, and Savings Plans are more stable but not as cheap as Spot.

---

**문제 4.** A new user wants to try out EC2 and S3 up to a set limit without cost concerns after signing up. What can they use?

A) Volume discount  
B) AWS Free Tier  
C) Reserved Instances (RIs)  
D) Savings Plans  

**정답: B**  
해설: The Free Tier lets new users try services up to a set limit for free, in the form of 12 Months Free, Always Free, and Trials. A volume discount is a unit-price reduction as usage grows, and RIs/Savings Plans are commitment-based discounts, which differ from a free-trial purpose.

---

**문제 5.** What is the pricing structure called where the per-GB price on S3 automatically drops as you store more and more data?

A) Savings Plans  
B) Spot pricing  
C) Volume (tiered) discount  
D) On-Demand pricing  

**정답: C**  
해설: A volume (tiered) discount is a pricing structure where the unit price automatically drops as usage grows, with S3 storage being the prime example. Savings Plans are commitment-based discounts, Spot is auction pricing for spare capacity, and On-Demand is the standard unit price with no commitment — all conceptually different from an automatic unit-price reduction based on usage itself.

---
