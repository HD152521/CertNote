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

## 📝 연습 문제

**문제 1.** 금융(Security) vs 게임(Performance) 우선순위 충돌 → **Business context first, then optimize**

**문제 2.** Aurora Global RTO<1min vs RDS Multi-AZ RTO 2min 선택 → **RPO/RTO 정량값 + cost ROI**

**문제 3.** 6 기둥 WA Tool 리뷰 주기 → **분기별(매분기 Reliability·Security drill) + 연 1회 전체**

**문제 4.** SCP vs IAM vs Resource Policy 구분 → **SCP(ceiling) > IAM(grant) > Resource(cross-account)**

**문제 5.** 멀티 리전 하나 죽었을 때 cascade 방지 → **Decoupled regions + 독립 failover**

**문제 6.** Cost vs Reliability ROI 의사결정 → **Downtime cost ÷ 해결책 cost = ROI**

---