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

## 📝 연습 문제

**문제 1.** 3년 예측 안정적 부하 → **Savings Plans (Compute/DDB)**

**문제 2.** 스파이크 10배 트래픽 → **Spot 90% + On-Demand 안정**

**문제 3.** NAT Gateway 데이터 처리 비용 높음 → **VPC Endpoint S3/DDB**

**문제 4.** 100TB 초기 → 90일 후 선택적 접근 → **S3 Intelligent-Tiering → Glacier**

**문제 5.** DynamoDB 요금 최소 → **부하 패턴에 따라 On-Demand or Provisioned**

**문제 6.** Reserved Instance 초과 사용 → **Swap provisioned type or downgrade**

---