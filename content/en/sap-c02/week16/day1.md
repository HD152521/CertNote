# Day 1 - Well-Architected Framework Synthesis — 6 Pillars Integrated, Trade-offs Across Domains

Week 16 comprehensive integration: All 13 weeks + 15 weeks of separate pillars must now act as **one coherent design.**

**The fundamental truth**: No pillar lives alone. Choosing Aurora Global (Reliability RPO<1s) costs 2x vs RDS Multi-AZ (Reliability RPO 0). Adding Multi-Region (Reliability + Disaster Recovery) increases latency (Performance -) and cost (Cost -). Encryption (Security +) reduces throughput (Performance -). Logging everything (Security + Compliance +) explodes storage costs (Cost -).

Pro architect sees the **trade-off matrix** and makes prioritized choices based on **business context, not equal pillar weight.**

Weight by industry:
- Financial: Security > Reliability > Cost
- Healthcare: Security = Compliance > Availability > Cost
- Gaming: Performance = Reliability > Cost > Security
- Startup: Cost > Reliability > Performance > Security (early stage)

Key mappings: (1) "All 6 pillars, no context" → **Invalid question, need business constraints**, (2) "Maximize everything" → **Impossible; optimize trade-off frontier**, (3) "Use WA Tool quarterly" → **Document pillar gaps + improvements + ownership**, (4) "Chaos engineers validate** → **FIS + Stop Condition production drills**.

[6 EXERCISES: Pillar priority by industry, trade-off justification, WA Tool workflow, SCP vs Permission Boundary vs resource policy, multi-region failure modes, cost vs reliability ROI]

---

## 📝 Practice Questions

**Question 1.** Priority conflict between finance (Security) and gaming (Performance) → **Business context first, then optimize**

**Question 2.** Choosing between Aurora Global RTO < 1 min and RDS Multi-AZ RTO 2 min → **Quantitative RPO/RTO values + cost ROI**

**Question 3.** Review cadence of the six-pillar WA Tool → **Quarterly (Reliability and Security drills every quarter) + a full review once a year**

**Question 4.** Distinguishing SCP vs IAM vs Resource Policy → **SCP (ceiling) > IAM (grant) > Resource (cross-account)**

**Question 5.** Preventing cascade when one of multiple Regions goes down → **Decoupled Regions + independent failover**

**Question 6.** Cost vs Reliability ROI decision → **Downtime cost ÷ solution cost = ROI**

---