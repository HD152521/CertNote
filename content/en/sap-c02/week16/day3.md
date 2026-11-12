# Day 3 - Cost Optimization Deep Dive — Reserved Capacity, Commitment Discounts, Unit Economics

Cost pillar often **underweighted by SAA**, but Pro recognizes it competes with Reliability/Performance. Optimization requires **unit economics thinking** not just total dollar reduction.

Core strategies:
- **Savings Plans vs RI vs On-Demand**: SP most flexible (3-year Compute/DDB), RI most aggressive discount, On-Demand pay-per-use
- **Spot**: 90% off, interruption tolerance (batch, CI, rendering), blend with on-demand for durability
- **Right-sizing**: Compute Optimizer flags over-provisioned instances, CloudWatch metrics reveal utilization
- **Data transfer**: VPC Endpoint (free S3/DDB from private subnet), CloudFront (cheaper egress), same-AZ communication
- **Storage tiering**: S3 Intelligent-Tiering (auto), Glacier (archive), cold tiers after 90 days
- **Database**: On-demand vs provisioned depends on utilization; DDB on-demand pricier/scalable, provisioned cheaper/predictable

Pitfall: **Optimizing for cost alone kills reliability.** Pro balances.

Key mappings: (1) "Multi-year commitment, predictable load" → **Savings Plans (most flexible)**, (2) "Spike load, fault-tolerant" → **Spot 90% + on-demand blend**, (3) "Minimize data transfer" → **VPC Endpoint + CloudFront**, (4) "Minimize storage" → **S3 Intelligent-Tiering + Glacier**.

[6 EXERCISES: Savings Plans vs RI decision, Spot blend strategy, Right-sizing ROI, Data transfer path optimization, Reserved capacity trade-offs]

---

## 📝 Practice Questions

**Question 1.** Stable load predicted over 3 years → **Savings Plans (Compute/DDB)**

**Question 2.** 10x traffic spikes → **Spot 90% + On-Demand for stability**

**Question 3.** High NAT Gateway data processing cost → **VPC Endpoint S3/DDB**

**Question 4.** 100 TB initially → selective access after 90 days → **S3 Intelligent-Tiering → Glacier**

**Question 5.** Minimize DynamoDB charges → **On-Demand or Provisioned depending on the load pattern**

**Question 6.** Reserved Instance over-usage → **Swap provisioned type or downgrade**

---