# Day 4 - Savings Plans and Spot: The Economics of Commitments and Gambles That Cut Compute Cost by 70%

The On-Demand price is AWS's list price — the price paid for maximum flexibility to use it any time and shut it off any time. But most workloads do not use all of that flexibility. Production servers run 24 hours a day, 365 days a year, and do not change families often. If so, from AWS's point of view too, a guarantee that "this customer will definitely use this much for a year" has value — because capacity planning becomes easier. **Commitment discounts (Savings Plans, Reserved Instances)** turn this mutual benefit into a deal. The customer promises "I will spend $X per hour for 1 or 3 years," and in return AWS gives up to 72% off.

At the opposite extreme is **Spot**. AWS data centers always have unsold spare capacity — like empty seats on an airplane. AWS offers this spare capacity at a Spot price discounted up to 90%, but with the condition that "when the capacity is needed, we notify you 2 minutes before and reclaim it." If a commitment is "a deal that buys certainty," Spot is "a gamble that accepts uncertainty to get a bargain price." This note digs into the economic principles on which these two axes — the certainty of commitments and the volatility of Spot — stand, and how to combine them to design a cost structure.

## The Economics of Commitment Discounts: Why Does AWS Cut the Price for a Promise About the Future

A commitment discount is not charity but a **deal in which both sides gain**. Once you understand this, it explains why every SP and RI option (1 year vs 3 years, the degree of Upfront) is priced the way it is.

From AWS's point of view, the most expensive cost is **uncertainty**. Building a data center and bringing in servers is an enormous up-front investment, and if demand is uneven, it bears the risk of over-investment (idle servers) or under-investment (insufficient capacity). When a customer promises "we will definitely use this much for 3 years," AWS can know that demand in advance and plan precisely — and returns that value as a discount. So **the longer the commitment (3 years > 1 year) and the more is paid upfront (All Upfront > No Upfront), the bigger the discount.** This is because a longer, more certain promise removes more of AWS's uncertainty.

> 💡 **Related Theory**: The core of this deal is the finance concept of the **time value of money**. All Upfront means the customer pays now the money it would have paid in the future, and since AWS can receive and put that cash to work now (or save that much on the cost of raising capital), it gives a bigger discount. Conversely, No Upfront is paid in monthly installments, so the present value AWS receives is smaller and the discount is smaller. This is exactly the same principle as a bond's discount rate or the prepayment discount in a lease contract — when future cash flows are converted to present value, money received earlier is worth more. The price list of commitment discounts is, in essence, a table that converts "the risk the customer takes on (the risk of failing to keep the promise) and the present value AWS gains" into a price.

## Savings Plans vs Reserved Instances: A Tug of War Between Flexibility and Discount Rate

There are two generations of commitment discounts. **Reserved Instances (RI)**, which came first, are a model of "reserving a specific instance type," and **Savings Plans (SP)**, which came later, are a more flexible model that "commits to hourly compute spend." AWS recommends SP, and new commitments almost all go to SP — but knowing the difference between the two precisely is the heart of the exam.

**The 3 kinds of Savings Plans**:

| Type | Applies to | Maximum discount | Flexibility |
|------|------------|------------------|-------------|
| **Compute SP** | EC2 + Fargate + Lambda, all Regions, families, and OSes | ~66% | Most flexible |
| **EC2 Instance SP** | A specific Region + a specific family (e.g., the C family in ap-northeast-2) | ~72% | Limited |
| **SageMaker SP** | SageMaker training and inference | ~64% | SageMaker only |

Here the key trade-off shows — **flexibility and discount rate are inversely proportional.** Compute SP gives the highest flexibility, automatically applying within the committed amount to EC2, Fargate, or Lambda, in any Region and any family, but the discount rate is ~66%. EC2 Instance SP is bound to "a specific family in a specific Region" and in exchange discounts more, ~72%. It is the same principle that the narrower and more specific the promise (= the more it reduces AWS's uncertainty), the bigger the discount.

**The two kinds of RI** are the same tug of war — **Standard RI** gives up to 72% off, but after commitment the instance family can hardly be changed (locked in), while **Convertible RI** lets you exchange family, size, and OS but at a smaller discount of ~66%.

| Axis | RI | Savings Plans |
|------|----|----------------|
| Scope of application | Specific services (EC2, RDS, Redshift, etc.) | EC2/Fargate/Lambda |
| Commitment unit | Instance type | Hourly spend ($/hr) |
| Flexibility | Low (except Convertible) | High (automatic reallocation) |
| Trend | Legacy and for services SP does not support | Recommended for new commitments |

The reason Savings Plans are more flexible than RI is that **the object of the commitment is different**. An RI "reserves one c5.large," so if you move the workload from c5 to c7g, that RI applies only to c5 and is useless for the new instance (Convertible needs a manual exchange). Compute SP, in contrast, is a **monetary commitment** of "I will use $10 per hour of compute," so whether you use c5, c7g, or Fargate, up to that $10 limit the discount is applied automatically, starting from the most expensive On-Demand usage. Because it is tied to "spend," not to an instance, the commitment follows even when the workload changes. This difference in abstraction level — a concrete resource (RI) vs abstract spend (SP) — is the key by which SP greatly reduced the operational burden. However, since there is no SP for RDS, Redshift, ElastiCache, or OpenSearch, commitments for those services are still RI.

## Spot: An Auction of Spare Capacity with a Market Price

Spot is the exact opposite of a commitment. If a commitment is "fixing the future to get a discount," Spot is "giving up on the future to get a bargain price." It lends the unsold spare capacity of AWS data centers at a price discounted up to 90%, but when AWS needs that capacity, it **reclaims it after a 2-minute notice**.

In the past, Spot was a **bidding** model in which the user wrote down a price, but in 2017 AWS abolished it and changed to a **market price model** that changes gradually according to supply and demand. Now users do not need to agonize over a bid price and just use the current Spot price, which is cheaper than On-Demand. It became far more predictable than the old model, where prices swung sharply.

Spot's suitability is split by **state and interruption tolerance**.

| Suitable (Spot OK) | Unsuitable (Spot forbidden) |
|--------------------|-----------------------------|
| Big data batch (EMR/Spark) | Stateful DB and cache |
| CI/CD builds | Workloads that need a long startup |
| Containers (Fargate Spot, EKS) | Anything where losing work on reclaim is fatal |
| Stateless web (mixed ASG) | Services that depend on a single instance |

It must be a workload where "even if reclaimed, another instance takes over, or you can simply rerun the job." If it is stateless, distributable, and tolerates interruption, Spot is a 90% discount jackpot; if it holds state and reclamation is fatal, Spot is a disaster.

The evolution of Spot is a lesson in itself. Under the bidding model before 2017, Spot prices at times spiked instantly to several times On-Demand during demand surges, and users who set bid prices wrongly got unexpected bills or suffered mass reclamation. AWS abolished bidding and moved to a gradual market price because this volatility was blocking Spot adoption. After the change, Spot became the standard cost-saving means for EMR, Kubernetes, and CI pipelines, and companies such as Pinterest and Lyft publicly shared cases of running large-scale batch and data processing on Spot and cutting cost by tens of percent. The key design lesson is that "however large the discount, if it is unpredictable, production will not use it" — which is why stability-first strategies such as capacityOptimized are recommended over lowestPrice.

## Handling Reclamation Gracefully: The 2-Minute Notice and Allocation Strategy

To use Spot in production, you must **handle reclamation gracefully**. AWS sends an **EventBridge event** (`EC2 Spot Instance Interruption Warning`) and an instance metadata (IMDS) signal 2 minutes before reclamation. Within those 2 minutes you must finish the work in progress or hand it to another instance.

```
2-minute notice before Spot reclamation
   │
   ├──► EventBridge Rule (detail-type: EC2 Spot Instance Interruption Warning)
   │       └──► Lambda: deregister from the ALB → save a checkpoint of work in progress → back up logs
   │
   └──► ASG Lifecycle Hook (buy time with a Heartbeat in the Terminating state)
           └──► terminate after drain completes
```

A more fundamental response is to **reduce reclamation itself** — here **Allocation Strategy** is the key. Spot capacity forms a separate "pool" for each combination of instance type x AZ, and which pool you draw instances from governs the frequency of reclamation.

| Strategy | Behavior | Reclamation risk |
|----------|----------|------------------|
| **lowestPrice** | From the cheapest pool | High (the cheap pool may soon run short) |
| **diversified** | Spread across multiple pools | Medium |
| **capacityOptimized** | From the pool with the most spare capacity | Low (recommended) |
| **priceCapacityOptimized** | Balance of price + spare capacity | Low (latest recommendation) |

Contrary to intuition, **lowestPrice is risky.** The cheapest pool usually has little spare capacity and is likely to be reclaimed by AWS soon. capacityOptimized picks "the pool with the most spare capacity right now" and lowers the probability of reclamation — it may be slightly more expensive, but stability is far higher. The latest recommendation, priceCapacityOptimized, looks at price and spare capacity together.

Spreading across multiple Spot pools (diversified, capacityOptimized) is the same idea as financial **portfolio diversification**. If you bet everything on one pool (one instance type x AZ), the whole thing disappears at once when that pool is reclaimed (correlation 1). If you split across multiple pools, even if one pool is reclaimed the rest survive, and the volatility of total available capacity falls. Just as diversification offsets individual asset risk, Spot pool diversification offsets the reclamation risk of individual pools. That is why specifying several instance types (m5/m5a/m6i) in a Mixed Instances ASG is more stable than a single type — the more pools to spread across, the lower the probability of simultaneous reclamation.

## The 3-Layer Cost Structure: Designing a Combination of Commitments, On-Demand, and Spot

Practical cost optimization is not choosing one option but **stacking three layers**. You divide the workload by stability and volatility and apply the matching pricing model to each layer.

```
Layer 3 ─ Spot (up to 90% off) ──────── Variable, stateless, tolerates reclamation
            batch, builds, cache nodes    (10-20% of the total)
            capacityOptimized strategy

Layer 2 ─ On-Demand ─────────────────── Hard-to-predict variable portion
            list price, available at once   (20-30% of the total)

Layer 1 ─ Savings Plans / RI (~72%) ──── 24/7 stable baseline
            predictable always-on operation  (60-70% of the total)
```

The core design principle is **"commit only to the baseline."** SP and RI require paying the committed amount whether you use it or not (use it or lose it), so you should commit only to the minimum usage that never falls (the baseline). The variable portion that fluctuates above the baseline goes to On-Demand, and the part of it that is stateless and tolerates reclamation goes down to Spot. **Mixed Instances ASG** is the standard tool that implements this On-Demand + Spot mix in a single group — `OnDemandBaseCapacity` guarantees the minimum On-Demand and the portion above it is filled with Spot.

Finally, you must not confuse **Capacity Reservation** with a commitment. A Capacity Reservation is a **capacity guarantee, not a discount** — it secures instance capacity in a specific AZ, and the price is the same as On-Demand (combined with SP/RI it also gets a discount). It is used for the immediate-availability guarantee of a DR site, preparation for Black Friday, and responding to a shortage of availability of a new instance type. You are buying not a "discount" but "the certainty that you can launch an instance at that moment."

> ⚠️ **Pitfall**: SP and RI **cost money even if unused.** If you underestimate workload volatility and commit more than the baseline, you tie up money for 3 years in an unused commitment. That is why you must periodically check commitment adequacy with Cost Explorer's **Utilization (the actual usage rate of the commitment)** and **Coverage (the share of usage the commitment covers)** reports. Low Utilization means over-commitment (wasted money), and low Coverage means room to commit more (an additional savings opportunity). If the exam asks "the workload is highly variable, which commitment?", the answer is almost always Compute SP (flexible) or On-Demand + Spot, and Standard RI (locked in) is wrong.

## Summary

Compute cost optimization is the work of mapping certainty and volatility onto price. Cut the certain baseline with a commitment (up to 72%), support the variable portion with On-Demand, and process the stateless variable portion at a bargain price with Spot (up to 90%).

The five things an operator should remember are these. ① A commitment discount is a deal where both sides gain — the longer and more upfront (3 years, All Upfront), the more of AWS's uncertainty is removed and the bigger the discount. ② Flexibility and discount rate are inversely proportional — Compute SP (flexible, ~66%) vs EC2 Instance SP/Standard RI (locked in, ~72%). SP commits to spend, not instances, so it follows even when the workload changes. ③ RDS, Redshift, ElastiCache, and OpenSearch have no SP, so they use RI. ④ Spot is only for stateless workloads that tolerate reclamation; receive the 2-minute notice via EventBridge and Lifecycle Hook to handle it gracefully, and reduce reclamation with capacityOptimized (lowestPrice is risky). ⑤ Capacity Reservation is a capacity guarantee, not a discount, and commitments go only on the baseline, with adequacy checked through Utilization and Coverage.

In the next note we tie together all of Week 11 — Compute Optimizer, Trusted Advisor, Cost Explorer, Budgets, commitments, and Spot — into practical scenario questions and firm up the "exam keyword → correct service" mapping.

---

## Practice Problems

**Question 1.** A company uses EC2, Fargate, and Lambda, and its workloads' families and Regions change frequently. Which commitment gives automatic discounts without code or operational changes?

A) Standard RI
B) Compute Savings Plans: apply automatically to all EC2, Fargate, and Lambda usage, across all Regions and families, up to the committed amount
C) EC2 Instance Savings Plans
D) Convertible RI

**Answer: B**

Explanation: A Compute Savings Plan commits to "hourly compute spend" rather than an instance type, so whether the usage is c5, c7g, Fargate, or Lambda, the discount is applied automatically starting with the most expensive On-Demand usage, up to the commitment. The commitment follows the workload even when it changes, which makes it ideal for environments where families and Regions change frequently. EC2 Instance SP (C) and Standard RI (A) give larger discounts but are tied to a specific family/Region. Convertible RI (D) can be exchanged but requires manual work.

---

**Question 2.** Why are EC2 Instance Savings Plans not always recommended even though their discount rate is higher than Compute Savings Plans?

A) EC2 Instance SP is more expensive
B) Flexibility and discount rate are inversely related: EC2 Instance SP is tied to a specific Region and family, so the commitment cannot follow the workload when it changes
C) EC2 Instance SP also applies to Lambda
D) They are the same thing

**Answer: B**

Explanation: The narrower and more specific the scope of a commitment, the more AWS's uncertainty is reduced, and the larger the discount. EC2 Instance SP gives up to ~72% off in exchange for being tied to "a specific family in a specific Region", but if you move the workload to a different family or Region, that commitment no longer applies. Compute SP gives a smaller discount of ~66% for the sake of flexibility, but it follows the workload anywhere. If the workload is stable and fixed, EC2 Instance SP is advantageous; if it is variable, Compute SP is advantageous. It is a tug-of-war between flexibility and discount rate.

---

**Question 3.** A company runs an EMR big data batch job on 100 nodes every night. It is stateless, and if instances are reclaimed the job can simply be rerun. What is the cost-minimizing strategy?

A) 100 On-Demand instances
B) Spot Fleet + capacityOptimized strategy: stateless, interruption-tolerant batch is the ideal target for Spot (up to 90% discount)
C) 100 Standard RIs on a 3-year commitment
D) Compute Savings Plans

**Answer: B**

Explanation: A stateless, interruption-tolerant, distributable batch job is the textbook workload for Spot. You get up to a 90% discount, and the capacityOptimized strategy takes instances from the pools with the most spare capacity to reduce how often they are reclaimed. On-Demand (A) is list price and therefore wasteful, and RI (C) and SP (D) are commitments for 24/7 always-on workloads, so they are unsuitable for a batch that runs only at night (most of the committed hours would go unused and be wasted).

---

**Question 4.** A company wants to automate this: when a Spot Instance is reclaimed, deregister it from the ALB, save in-progress work as a checkpoint, and then terminate. What configuration should it use?

A) Periodic checks with cron
B) Receive the 2-minute warning via EventBridge (EC2 Spot Instance Interruption Warning) → Lambda, or via an ASG Lifecycle Hook, and perform the cleanup
C) A CloudWatch Alarm
D) Only an infinite loop polling IMDS every second

**Answer: B**

Explanation: AWS sends an EventBridge event and an IMDS signal 2 minutes before reclaiming a Spot Instance. The standard approach is to receive it with an EventBridge Rule and trigger a Lambda function (deregister from the ALB, save a checkpoint, back up logs), or to use an ASG Lifecycle Hook to buy time with a Heartbeat in the Terminating state and complete the drain. Within these 2 minutes you must gracefully finish the work or hand it over to another instance.

---

**Question 5.** After choosing lowestPrice as the Spot Allocation Strategy, interruptions happen far too often. How can stability be improved?

A) Keep lowestPrice
B) capacityOptimized (or priceCapacityOptimized): take instances from the pools with the most spare capacity to lower the probability of interruption
C) Switch everything to On-Demand
D) Standardize on a single instance type

**Answer: B**

Explanation: The cheapest pool (lowestPrice) usually has little spare capacity, so AWS is more likely to reclaim it soon; contrary to intuition, it is risky. capacityOptimized picks the pool with the most spare capacity right now to lower the probability of interruption, and priceCapacityOptimized considers both price and spare capacity (the latest recommendation). Also, standardizing on a single instance type (D) reduces the number of pools to spread across and increases the risk of simultaneous interruptions, so it is more stable to specify multiple types and spread across pools (portfolio diversification).

---

**Question 6.** A company wants to guarantee that it can always launch new m7i instances immediately in a specific AZ for BCP (disaster recovery). The goal is availability, not cost savings. What should it use?

A) Standard RI (it gives a discount but does not guarantee capacity)
B) EC2 Capacity Reservation: reserves capacity in a specific AZ; the discount is separate (can be combined with SP/RI)
C) Spot
D) Compute Savings Plans

**Answer: B**

Explanation: A Capacity Reservation buys the guarantee that "an instance can definitely be launched at that moment"; the price is the same as On-Demand and a discount is not its purpose. Its exact use cases are AZ capacity shortages for new instance types, guaranteeing immediate availability for DR, and preparing for large events. SP/RI (A, D) are only discounts and do not guarantee capacity; if needed, combine them with a Capacity Reservation to get both the discount and the guarantee. Spot (C) can be reclaimed, so it is the opposite of an availability guarantee.

---

**Question 7.** A company purchased a Compute SP, but Utilization shows a low 60% in Cost Explorer. What does this mean, and what action should be taken?

A) The commitment is insufficient; buy more
B) It is over-committed: 40% of the committed amount is going unused and wasted, so the next commitment should be scaled down to match the baseline
C) Switching to Spot will solve it
D) Utilization is a meaningless metric

**Answer: B**

Explanation: Utilization is the proportion of the committed amount that was actually used and benefited from the discount. At 60%, you are paying for 40% of the commitment without using it, which means over-commitment. SP and RI are use-it-or-lose-it, so the money goes out even if unused; you underestimated the variability and committed more than the baseline. The action is to scale the next commitment down to match the baseline, the minimum usage that never drops below that level. Conversely, low Coverage (the proportion of usage covered by commitments) means there is room to commit more and save additional cost.

---
