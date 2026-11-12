# Day 5 - Final Review & Exam Simulation — Full-Stack Scenario, Trade-off Decision Under Constraints

Last day: **synthesize all 16 weeks into one decision-making engine.** Exam is fundamentally: (1) **Read scenario** (time constraint, business goal, data volume), (2) **Identify pillar weight** (Security > all for regulated, Cost for startup, Reliability for SaaS), (3) **Find hidden constraint** (data sovereignty, compliance, performance SLA), (4) **Eliminate decoys** (shiny service, overkill, underestimate), (5) **Select best trade-off** (not perfect, but **right for context**).

Scenario type:
- **Big Bang**: 100TB ERP migration, 6 months, multi-region, security-first → Rehost (MGN) + 3-month parallel refactor + FIS drills
- **Greenfield**: Startup $0→1M ARR, 12 months → Serverless autoscale (Lambda/DDB) + cost monitoring + manual governance
- **Hybrid**: Regulated financial with legacy monolith → Rehost compute, refactor data tier to Aurora Global + KMS + GuardDuty
- **Edge case**: Sunset legacy app, 2 years runway → Retain (no migration cost beats refactor ROI)

Final exam calibration:
- 130 questions, ~2 min average
- Scenario = 1 min read, constraint identification
- Pillar diagnosis = 20 sec
- Tool selection = 40 sec
- Decoy elimination = 10 sec
- **Review buffer = 15 min (last 15 questions re-check)**

Confidence heuristics:
- If two answers seem equally valid → **Hidden constraint exists**, re-read scenario
- If cost + compliance conflict → **Always compliance (regulatory > cost)**
- If performance + cost conflict → **Measure downtime cost; high margin → performance wins**
- If SLA says RTO<15min, Multi-AZ sufficient; RTO<5min → Multi-Region; RTO=0 → Multi-Site Active-Active

[6 EXERCISES: Full scenario 1 (ERP), Full scenario 2 (Startup), Full scenario 3 (Regulated), Hidden constraint extraction, confidence calibration, review strategy]

---

## 📝 Practice Questions

**Question 1.** 100 TB ERP in 6 months, global + security-first → **Rehost (MGN) + 3 months of parallel refactoring + FIS drill**

**Question 2.** $0 → 1M startup in 12 months → **Serverless (Lambda/DDB) + cost monitoring**

**Question 3.** Financial regulation + legacy monolith → **Rehost compute + refactor data (Aurora Global + KMS)**

**Question 4.** Legacy to be sunset in 2 years → **Retain (migration cost > refactor ROI)**

**Question 5.** RTO < 15 min → **Multi-AZ is sufficient; RTO < 5 min → Multi-Region; RTO = 0 → Multi-Site Active**

**Question 6.** Exam time management → **1 min read + 20 sec pillar + 40 sec tool + 10 sec decoy + 15 min review buffer**

---

**Exam closes. You are ready. Trust your trade-off thinking, not memorization. Go Pro.**

---