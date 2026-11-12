# Day 4 - Patching, Maintenance Windows, Availability

RDS maintenance windows (30-min database downtime). Preferred/backup windows. Automatic minor patch, optional major version. Patching notifications via SNS.

High availability: Multi-AZ replication, automatic failover. Read replicas for read scaling. Enhanced monitoring. CloudWatch alarms on replication lag.

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
