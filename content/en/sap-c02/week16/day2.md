# Day 2 - Exam Strategy & Question Patterns — Recognizing Trade-offs, Ruling Out Decoys, Time Management

SAP-C02 is **not memorization** — it's **trade-off judgment under constraints.** Most questions hide a hidden constraint (time, budget, regulatory, geographic) that selects one pillar over another.

Pattern recognition:
- "Minimize cost" → Look for cheapest option meeting non-cost constraints
- "No downtime" → RTO=0 → Multi-Site Active-Active, not Pilot Light
- "Regulatory compliance" → Security/Compliance > Cost always
- "Startup, $0 budget" → Serverless autoscale, not provisioned capacity
- "6 months deadline, 100TB" → Rehost first (MGN), Refactor later, not Refactor-all-upfront
- "Global" without region constraints → Assume GDPR/sovereignty applies
- "Audit/compliance" keyword → Immutable log, separate account, Object Lock Compliance, root can't change

Decoy patterns:
- "Use the latest service" → Not always right; older services often cheaper/simpler
- "Maximize all metrics" → Impossible; prioritize by business impact
- "Most expensive solution" → Not Pro; efficiency wins
- "Technical perfection" → Versus practical constraints

Time management: ~130 questions, ~2 min/question average
- Diagram/scenario reading: 30s
- Identify business constraint: 20s
- Match to pillar/tool: 40s
- Eliminate decoys: 30s

Key insight: **"What makes this architecture okay to fail at?" = "What constraint am I optimizing?"**

[6 EXERCISES: Pattern matching by keyword, constraint extraction, decoy elimination, confidence calibration, review strategy]

---

## 📝 연습 문제

**문제 1.** "Minimize cost" + "30 min RTO requirement" → **Pilot Light (not Backup), not Multi-Site**

**문제 2.** "No downtime + global" → **Multi-Site Active-Active + time zone compliance**

**문제 3.** "Regulatory 7 years + change immutable" → **Object Lock Compliance, not Governance**

**문제 4.** "Time constraint + data transformation" → **Rehost+optimize vs Refactor-all-upfront**

**문제 5.** Hidden constraint "EU data outside EU" → **SCP DenyRegions (root blocker)**

**문제 6.** Recognizing **PACELC trade-off** behind "RPO 1s multi-region" → **Async replication, not sync**

---