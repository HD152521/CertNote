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

## 📝 Practice Questions

**Question 1.** 100 TB Oracle migration in 6 months → **Rehost (MGN) + Refactor afterward**

**Question 2.** New startup greenfield → **Refactor (Serverless)**

**Question 3.** Legacy CICS mainframe with low ROI → **Retain or Rehost**

**Question 4.** License cost first → **Repurchase (SaaS)**

**Question 5.** Choosing between MGN and CloudEndure → **MGN (AWS native), CloudEndure (multi-cloud)**

**Question 6.** Phasing of post-migration optimization → **1 week of stabilization + 1 month of priority performance work + quarterly continuous**

---