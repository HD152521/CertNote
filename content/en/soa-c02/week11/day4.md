# Day 4 - Savings Plans and Spot: The Economics of Commitments and Gambles That Cut Compute Costs by 70%

On-Demand pricing is the list price AWS sets - the price of maximum flexibility to use whenever you want and shut off whenever you want. But most workloads do not use all of that flexibility. Production servers run 24 hours a day, 365 days a year, and do not change families often. If so, from AWS's point of view too, a guarantee that "this customer will definitely use this much for a year" has value - because it makes capacity planning easier. **Commitment discounts (Savings Plans, Reserved Instances)** turn this mutual benefit into a transaction. The customer promises "I will spend $X per hour for 1 or 3 years," and in return AWS takes up to 72% off.

At the opposite extreme is **Spot**. AWS data centers always have unsold spare capacity - like empty seats on an airplane. AWS offers this spare capacity at Spot prices discounted by up to 90%, with the condition that "when capacity is needed, we give 2 minutes' notice and reclaim it." If a commitment is "a transaction that buys certainty," Spot is "a gamble that accepts uncertainty to get a bargain price." This article digs into what economic principles these two axes - the certainty of commitments and the volatility of Spot - stand on, and how to combine them to design a cost structure.

## The Economics of Commitment Discounts - Why Does AWS Discount for Future Promises?

A commitment discount is not charity but **a deal that benefits both sides.** Understanding this explains why every option of SPs and RIs (1 year vs. 3 years, the degree of upfront payment) is priced the way it is.

From AWS's point of view, the most expensive cost is **uncertainty.** Building data centers and bringing in servers is an enormous up-front investment, and if demand is erratic, it bears the risk of overinvestment (idle servers) or underinvestment (insufficient capacity). When a customer promises "I will definitely use this much for 3 years," AWS can know this demand in advance and plan precisely - and it returns that value as a discount. So **the longer the commitment (3 years > 1 year) and the more is paid upfront (All Upfront > No Upfront), the greater the discount.** This is because a longer and more certain promise removes more of AWS's uncertainty.

> 💡 **Related theory**: The core of this transaction is the financial **time value of money**. All Upfront (full prepayment) means the customer pays now the money it would have paid in the future, and since AWS can receive and deploy that cash now (or saves that much capital-raising cost), it gives a bigger discount. Conversely, No Upfront is paid in monthly installments, so the present value AWS receives is smaller and the discount is smaller. This is exactly the same principle as bond discount rates and prepayment discounts on lease contracts - when future cash flows are converted to present value, money received earlier is worth more. The price list of commitment discounts is in essence a table that converts "the risk the customer takes on (the risk of failing to keep the promise) and the present value AWS gains" into prices.

## Savings Plans vs. Reserved Instances - The Tug of War Between Flexibility and Discount Rate

There are two generations of commitment discounts. The earlier **Reserved Instances (RI)** is a model that "reserves a specific instance type," and the later **Savings Plans (SP)** is a more flexible model that "commits to an hourly compute spend amount." AWS recommends SPs, and new commitments go almost entirely to SPs - but knowing the difference between the two precisely is the key to the exam.

**The 3 kinds of Savings Plans**:

| Type | Applies to | Max discount | Flexibility |
|------|-----------|-----------|--------|
| **Compute SP** | EC2 + Fargate + Lambda, all Regions, families, and OSs | ~66% | Most flexible |
| **EC2 Instance SP** | A specific Region + a specific family (e.g., the C family in ap-northeast-2) | ~72% | Limited |
| **SageMaker SP** | SageMaker training and inference | ~64% | SageMaker only |

Here the core trade-off becomes visible - **flexibility and discount rate are inversely related.** Compute SP gives the highest flexibility, applying automatically within the commitment amount whether EC2, Fargate, or Lambda, in any Region and any family, but the discount rate is ~66%. EC2 Instance SP is tied to "a specific family in a specific Region" but takes more off at ~72%. It is the same principle: the narrower and more specific the promise (= the more it reduces AWS's uncertainty), the larger the discount.

**The two kinds of RI** are the same tug of war - **Standard RI** offers up to a 72% discount but, after commitment, the instance family can hardly be changed (locked in), while **Convertible RI** allows exchanging family, size, and OS but has a smaller discount of ~66%.

| Axis | RI | Savings Plans |
|----|-----|----------------|
| Scope | Specific services (EC2, RDS, Redshift, etc.) | EC2/Fargate/Lambda |
| Commitment unit | Instance type | Hourly spend ($/hr) |
| Flexibility | Low (except Convertible) | High (automatic reallocation) |
| Trend | Legacy / for services SP does not support | Recommended for new commitments |

The reason Savings Plans are more flexible than RIs is **because what is committed is different.** An RI "reserves one c5.large," so if you move the workload from c5 to c7g, that RI applies only to c5 and is useless for the new instance (Convertible requires a manual exchange). A Compute SP, by contrast, is a **monetary commitment** of "I will use $10 per hour of compute," so whether you use c5, c7g, or Fargate, it automatically applies the discount up to that $10 limit, starting from the most expensive On-Demand usage. Because it is tied to "spend" rather than to an instance, the commitment follows even when the workload changes. This difference in abstraction level - a concrete resource (RI) vs. abstract spend (SP) - is the key reason SPs greatly reduced operational burden. However, there are no SPs for RDS, Redshift, ElastiCache, or OpenSearch, so commitments for those services are still RIs.

## Spot - An Auction for Spare Capacity Whose Market Price Has Disappeared

Spot is the opposite of a commitment. If a commitment is "fixing the future to get a discount," Spot is "giving up the future to get a bargain." It lends out AWS data centers' unsold spare capacity at a price discounted by up to 90%, but when AWS needs that capacity, it **reclaims it after a 2-minute notice.**

In the past, Spot was a **bidding** model in which users wrote down a price, but in 2017 AWS abolished it and changed to a **market price model** that changes gently with supply and demand. Now users do not need to agonize over a bid price; they can simply use the current Spot price, which is cheaper than On-Demand. It became much more predictable than the old model, in which prices fluctuated sharply.

Spot suitability is divided by **state and interruption tolerance.**

| Suitable (Spot OK) | Unsuitable (no Spot) |
|----------------|--------------------|
| Big data batch (EMR/Spark) | Stateful DBs and caches |
| CI/CD builds | Workloads needing a long startup |
| Containers (Fargate Spot, EKS) | Anything where losing work on reclamation is fatal |
| Stateless web (ASG mixed) | Services dependent on a single instance |

It must be a workload where "even if reclaimed, another instance takes over, or you can just rerun the work." If it is stateless, distributable, and tolerates interruption, Spot is a 90% discount jackpot; if it has state and reclamation is fatal, Spot is a disaster.

The evolution of Spot is itself a lesson. Under the pre-2017 bidding model, Spot prices could momentarily spike to several times On-Demand during demand surges, and users who set bid prices wrongly received unexpected bills or suffered mass reclamations. AWS abolished bidding and moved to gentle market prices because this volatility was blocking Spot adoption. After the change, Spot became the standard cost-saving means for EMR, Kubernetes, and CI pipelines, and companies like Pinterest and Lyft have publicly shared cases of running large-scale batch and data processing on Spot and saving tens of percent in cost. The key design lesson is "however large the discount, production will not use it if it is unpredictable" - which is why stability-first strategies like capacityOptimized are recommended over lowestPrice.

## Handling Reclamation Gracefully - The 2-Minute Notice and Allocation Strategy

To use Spot in production, you must **handle reclamation gracefully.** AWS sends an **EventBridge event** (`EC2 Spot Instance Interruption Warning`) and an instance metadata (IMDS) signal 2 minutes before reclamation. Within these 2 minutes you must finish the work in progress or hand it off to another instance.

```
2-minute notice before Spot reclamation
   │
   ├──► EventBridge Rule (detail-type: EC2 Spot Instance Interruption Warning)
   │       └──► Lambda: deregister from ALB → save checkpoint of in-progress work → back up logs
   │
   └──► ASG Lifecycle Hook (buy time with a Heartbeat in the Terminating state)
           └──► terminate after drain completes
```

A more fundamental response is to **reduce reclamation itself** - and here the **Allocation Strategy** is the key. Spot capacity forms a separate "pool" for each instance type x AZ combination, and which pool you draw instances from determines the reclamation frequency.

| Strategy | Behavior | Reclamation risk |
|------|------|-----------|
| **lowestPrice** | From the cheapest pool | High (the cheap pool may soon run short) |
| **diversified** | Spread across multiple pools | Medium |
| **capacityOptimized** | From the pool with the most spare capacity | Low (recommended) |
| **priceCapacityOptimized** | Balance of price + spare capacity | Low (newest recommendation) |

Contrary to intuition, **lowestPrice is risky.** The cheapest pool usually has little spare capacity and is likely to be reclaimed by AWS soon. capacityOptimized picks "the pool with the most spare capacity right now" to lower the probability of reclamation - it may be slightly more expensive but is far more stable. The newest recommendation, priceCapacityOptimized, looks at price and spare capacity together.

Spreading across multiple Spot pools (diversified, capacityOptimized) is the same idea as financial **portfolio diversification.** If you bet everything on one pool (one instance type x AZ), the whole thing disappears at once when that pool is reclaimed (correlation of 1). If you split across multiple pools, even if one pool is reclaimed the rest survive, reducing the volatility of total available capacity. Just as diversification offsets the risk of individual assets, spreading across Spot pools offsets the reclamation risk of individual pools. That is why specifying multiple instance types (m5/m5a/m6i) in a Mixed Instances ASG is more stable than a single type - the more pools to spread across, the lower the probability of simultaneous reclamation.

## The 3-Layer Cost Structure - Designing a Combination of Commitments, On-Demand, and Spot

Real-world cost optimization is not picking one option but **stacking three layers.** You divide the workload by stability and variability and apply the matching pricing model to each layer.

```
Layer 3 ─ Spot (up to 90% discount) ──────── Variable, stateless, tolerates reclamation
            Batch, builds, cache nodes         (10-20% of total)
            capacityOptimized strategy

Layer 2 ─ On-Demand ─────────────────── Hard-to-predict variable portion
            List price, available instantly    (20-30% of total)

Layer 1 ─ Savings Plans / RI (~72%) ──── 24/7 stable baseline
            Predictable always-on operation    (60-70% of total)
```

The core design principle is **"commitments only for the baseline."** SPs and RIs require paying the commitment amount whether you use it or not (use it or lose it), so you should commit only to the minimum usage (baseline) that never drops. The variable portion that fluctuates above the baseline goes to On-Demand, and the part of it that is stateless and tolerates reclamation goes down to Spot. **Mixed Instances ASG** is the standard tool that implements this On-Demand + Spot mix in a single group - `OnDemandBaseCapacity` guarantees the minimum On-Demand and Spot fills above it.

Finally, **Capacity Reservation** must not be confused with a commitment. Capacity Reservation is **a capacity guarantee, not a discount** - it secures instance capacity in a specific AZ, and the price is the same as On-Demand (combine with an SP/RI to also get a discount). It is used for guaranteeing immediate availability of a DR site, preparing for Black Friday, and dealing with availability shortages of new instance types. You are buying not a "discount" but "the ability to definitely launch an instance at that moment."

> ⚠️ **Trap**: SPs and RIs **cost money even if unused.** If you underestimate workload variability and commit more than the baseline, you tie up money for 3 years in unused commitments. That is why you must periodically check commitment appropriateness with Cost Explorer's **Utilization (the actual usage rate of the commitment)** and **Coverage (the share of usage the commitment covers)** reports. Low Utilization means over-commitment (wasted money), and low Coverage means room to commit more (an additional savings opportunity). On the exam, if "the workload is highly variable, which commitment?" the answer is almost always Compute SP (flexible) or On-Demand + Spot, and Standard RI (locked in) is wrong.

## Wrapping Up

Compute cost optimization is the work of mapping certainty and variability onto prices. Cut the certain baseline with commitments (up to 72%), support the variable portion with On-Demand, and handle the stateless variable portion at a bargain price with Spot (up to 90%).

Five things for the operator to remember. (1) A commitment discount is a two-sided-benefit deal - the longer and the more prepaid (3 years, All Upfront), the more AWS's uncertainty is removed and the larger the discount. (2) Flexibility and discount rate are inversely related - Compute SP (flexible, ~66%) vs. EC2 Instance SP/Standard RI (locked in, ~72%). An SP commits to spend rather than an instance, so it follows even when the workload changes. (3) RDS, Redshift, ElastiCache, and OpenSearch have no SP and use RIs. (4) Spot is only for stateless workloads that tolerate reclamation; receive the 2-minute notice with EventBridge and Lifecycle Hooks to handle it gracefully, and reduce reclamation with capacityOptimized (lowestPrice is risky). (5) Capacity Reservation is a capacity guarantee, not a discount, and commitments go only on the baseline, with appropriateness checked using Utilization and Coverage.

In the next article, we tie all of Week 11 - Compute Optimizer, Trusted Advisor, Cost Explorer, Budgets, commitments, and Spot - into practical scenario questions to cement the "exam keyword → correct service" mapping.

---

## 📝 Practice Questions

**Question 1.** A company uses EC2, Fargate, and Lambda, and the workloads' families and Regions change often. Which commitment gets a discount automatically without code or operational changes?

A) Standard RI

B) Compute Savings Plans - applied automatically within the commitment amount across all of EC2/Fargate/Lambda, all Regions and families

C) EC2 Instance Savings Plans

D) Convertible RI

**Answer: B**

Explanation: Compute SP commits to "hourly compute spend" rather than an instance type, so whether c5, c7g, Fargate, or Lambda, it automatically applies the discount up to the commitment limit, starting from the most expensive On-Demand usage. Because the commitment follows even when the workload changes, it is optimal for environments where families and Regions change often. EC2 Instance SP (C) and Standard RI (A) are tied to a specific family/Region in exchange for a larger discount. Convertible RI (D) can be exchanged but requires manual work.

---

**Question 2.** Why are EC2 Instance Savings Plans not always recommended even though their discount rate is higher than Compute Savings Plans?

A) EC2 Instance SP is more expensive

B) Flexibility and discount rate are inversely related - EC2 Instance SP is tied to a specific Region and family, so the commitment cannot follow when the workload changes

C) EC2 Instance SP also applies to Lambda

D) The two are the same thing

**Answer: B**

Explanation: The narrower and more specific the scope of the commitment, the more AWS's uncertainty is reduced and the larger the discount. EC2 Instance SP gives up to ~72% off in exchange for being tied to "a specific family in a specific Region," but if you move the workload to a different family/Region, that commitment does not apply. Compute SP has a smaller discount of ~66% for the sake of flexibility but follows anywhere. If the workload is stable and fixed, EC2 Instance SP is advantageous, and if variable, Compute SP is advantageous - a tug of war between flexibility and discount rate.

---

**Question 3.** Every night an EMR big data batch runs on 100 nodes. It is stateless, and if reclaimed the work can just be rerun. What is the cost-minimizing strategy?

A) 100 On-Demand instances

B) Spot Fleet + capacityOptimized strategy - stateless, interruption-tolerant batch is the optimal target for Spot (up to 90% discount)

C) 100 Standard RIs on a 3-year commitment

D) Compute Savings Plans

**Answer: B**

Explanation: A batch job that is stateless, tolerates interruption, and is distributable is a textbook suitable workload for Spot. You get up to a 90% discount while the capacityOptimized strategy draws instances from pools with plenty of spare capacity to lower reclamation frequency. On-Demand (A) is list price and wasteful, and RI (C) and SP (D) are commitments for 24/7 always-on workloads, so they are unsuitable for a batch that runs only at night (most of the committed time goes unused and is wasted).

---

**Question 4.** On Spot reclamation, you want to automate deregistering from the ALB, saving in-progress work as a checkpoint, and then terminating. What is the configuration?

A) Periodic checks with cron

B) Receive the 2-minute notice via EventBridge (EC2 Spot Instance Interruption Warning) → Lambda, or an ASG Lifecycle Hook, and perform the cleanup

C) CloudWatch Alarm

D) Only an infinite loop polling IMDS every second

**Answer: B**

Explanation: AWS sends an EventBridge event and an IMDS signal 2 minutes before Spot reclamation. The standard is to catch this with an EventBridge Rule and trigger a Lambda (ALB deregister, checkpoint save, log backup), or to buy time with a Heartbeat in the Terminating state through an ASG Lifecycle Hook to complete the drain. Within these 2 minutes you must wrap up the work gracefully or hand it off to another instance.

---

**Question 5.** You chose lowestPrice as the Spot Allocation Strategy and reclamations happen too often. How do you improve stability?

A) Keep lowestPrice

B) capacityOptimized (or priceCapacityOptimized) - draw from the pool with the most spare capacity to lower the probability of reclamation

C) Switch everything to On-Demand

D) Unify to a single instance type

**Answer: B**

Explanation: The cheapest pool (lowestPrice) usually has little spare capacity and is likely to be reclaimed by AWS soon - risky, contrary to intuition. capacityOptimized picks the pool with the most spare capacity right now to lower the probability of reclamation, and priceCapacityOptimized looks at price and spare capacity together (newest recommendation). Also, unifying to a single instance type (D) reduces the pools to spread across and increases the risk of simultaneous reclamation, so instead specifying multiple types to spread across pools (portfolio diversification) is more stable.

---

**Question 6.** You want to guarantee that a new m7i instance can always be launched immediately in a specific AZ for BCP (disaster recovery). The goal is availability, not cost savings. What do you use?

A) Standard RI (gives a discount but does not guarantee capacity)

B) EC2 Capacity Reservation - secures capacity in a specific AZ, discount separate (can be combined with SP/RI)

C) Spot

D) Compute Savings Plans

**Answer: B**

Explanation: A Capacity Reservation buys "the ability to definitely launch an instance at that moment"; the price is the same as On-Demand and a discount is not the purpose. AZ capacity shortages of new instance types, guaranteeing immediate availability for DR, and preparing for large events are exactly the use cases. SP/RI (A, D) are only discounts and do not guarantee capacity; if needed, combine them with a Capacity Reservation to get both a discount and a guarantee. Spot (C) can be reclaimed, so it is the opposite of an availability guarantee.

---

**Question 7.** A company purchased a Compute SP, but Utilization in Cost Explorer shows low at 60%. What does this mean and what is the action?

A) The commitment is insufficient - buy more

B) It is an over-committed state - 40% of the committed amount is being discarded unused, so the next commitment should be sized down to match the baseline

C) Switching to Spot solves it

D) Utilization is a meaningless metric

**Answer: B**

Explanation: Utilization is the share of the committed amount that was actually used and benefited from the discount. At 60%, it means you are paying for 40% of the commitment without using it - an over-commitment. SPs and RIs are use-it-or-lose-it, so they cost money even when unused, which means variability was underestimated and more was committed than the baseline. The action is to size the next commitment down to match the minimum usage that never drops (the baseline). Conversely, low Coverage (the share of usage the commitment covers) means room to commit more for additional savings.

---

## 📌 Today's Summary

1. A commitment discount is a two-sided-benefit deal - the longer and the more prepaid, such as 3 years and All Upfront, the more AWS's uncertainty is reduced and the larger the discount (time value of money)
2. Flexibility and discount rate are inversely related - Compute SP (flexible ~66%) vs. EC2 Instance SP/Standard RI (locked in ~72%). An SP commits to spend, not an instance
3. RDS, Redshift, ElastiCache, and OpenSearch have only RIs with no SP, and new commitments are almost all SPs
4. Spot is only for stateless workloads that tolerate reclamation (up to 90%), handle the 2-minute notice with EventBridge and Lifecycle Hooks, reduce reclamation with capacityOptimized (lowestPrice is risky)
5. Capacity Reservation is a capacity guarantee, not a discount, commitments go only on the baseline, and appropriateness is checked with Utilization and Coverage
