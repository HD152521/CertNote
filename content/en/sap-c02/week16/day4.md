# Day 4 - Migration & Rehost Strategies — 7Rs in Practice, Time + Data Volume Trade-offs

SAP-C02 requires deep comfort with the **7 migration strategies (7Rs)**: Rehost, Replatform, Refactor, Repurchase, Rehost+Refactor, Retire, Retain.

Core patterns:
- **Rehost (Lift-and-Shift)**: Copy OS + app as-is to EC2 or via MGN. Fastest (weeks), keeps old code debt. Best for "quick escape" from on-prem.
- **Replatform (Lift-Tinker-Shift)**: Migrate database to RDS/DynamoDB, app to EC2. Moderate effort, better resource utilization.
- **Refactor (Re-architect)**: Rewrite for cloud-native (Serverless, microservices). Slowest, highest benefit, requires investment.
- **Repurchase (SaaS)**: Swap Salesforce on-prem → Salesforce Cloud. Contracts change, but ops simplified.
- **Rehost+Refactor (Hybrid)**: Rehost fast, refactor over time.
- **Retire**: Old systems no longer needed, turn off.
- **Retain**: Keep on-prem if ROI unclear or regulated.

Time vs data volume: 100TB Oracle → rehost in weeks (MGN parallel conversion), refactor takes 6+ months.

Key mappings: (1) "100TB ERP, 6 month deadline" → **Rehost + Refactor post-go-live**, (2) "Serverless startup" → **Refactor greenfield**, (3) "Mainframe CICS app, low ROI to rewrite" → **Retain or Rehost**, (4) "License reduction goal" → **Repurchase SaaS**, (5) "Data classification 70% warm, 30% cold" → **Rehost compute, refactor data tier**.

[6 EXERCISES: 7Rs decision tree, MGN vs CloudEndure, time + cost ROI, data gravity impact, legacy dependency chains, post-migration optimization phases]

---

## 📝 연습 문제

**문제 1.** 100TB Oracle 6개월 이전 → **Rehost(MGN) + Refactor 사후**

**문제 2.** 새 스타트업 greenfield → **Refactor(Serverless)**

**문제 3.** 유산 CICS 메인프레임 낮은 ROI → **Retain or Rehost**

**문제 4.** License cost 우선 → **Repurchase(SaaS)**

**문제 5.** MGN vs CloudEndure 선택 → **MGN(AWS native), CloudEndure(multi-cloud)**

**문제 6.** Post-migration 최적화 위상 → **1주 안정화 + 1개월 우선순위 성능 + 분기 continuous**

---