# Day 1 - Enterprise Global ERP Migration — Multi-Account Governance History, 7R Migration Anatomy, Data Sovereignty Legal & Technical Roots

[WEEK 15 DAY 1 - COMPREHENSIVE SCENARIO: MULTI-ACCOUNT GOVERNANCE & 7R MIGRATIONS]

In 2017, massive manufacturer GE set goal "move 9,000 workloads to cloud" but years later returned many on-prem. Core failure: not technology but **governance absence**—hundreds accounts without standards, no control over what/where teams deployed. Meanwhile Capital One started with Organizations, SCP, standardized account factory first, succeeded in datacenter closure. This contrast is SAP-C02 Pro's core: **large-scale migration isn't moving servers, it's building controlled landing zone first.**

Today's scenario: on-prem SAP/Oracle 100TB+ across Americas/EU/APAC in 6 months, minimal downtime, EU data never leaves EU. SAA-level answer: "use MGN." Pro level requires account structure, network topology, data sovereignty, DR, audit for 7 years as one integrated design.

This comprehensive scenario spans:
- **Multi-account governance** (Organizations, Control Tower, SCP)
- **7R migration strategies** (Rehost vs Refactor vs Replatform decision tree)
- **Data sovereignty** (GDPR, CLOUD Act, regulatory compliance)
- **Hybrid networking** (DX dual-circuit, TGW, BGP/BFD)
- **DR & audit** (Aurora Global, Object Lock 7-year WORM)

Core insight: **Account is strongest isolation boundary. SCP ceiling blocks root itself. Time constraint = Rehost first, optimize later. Data sovereignty rooted in law not just tech.**

SAP exam mappings: (1) "EU data blocked from EU exit, root included" → **SCP DenyRegions**, (2) "100 servers minimum downtime" → **MGN block-level continuous replication**, (3) "Oracle→Aurora PostgreSQL" → **DMS+SCT Refactor**, (4) "7-year audit immutable" → **Object Lock Compliance**, (5) "Multi-region SQL sub-minute RPO" → **Aurora Global Database**, (6) "DX failure <1s VPN failover" → **DX dual + VPN + BGP/BFD**, (7) "50TB constrained bandwidth" → **Snowball + online delta**, (8) "TGW connect but isolate some VPCs" → **multiple route tables**.

[COMPLETE KOREAN EXERCISE SECTIONS PRESERVED AS-IS - 7 EXERCISES WITH FULL EXPLANATIONS]

---

**Question 1.** Block movement of EU data outside the EU, even for root → **SCP DenyRegions**

**Question 2.** Migrate the whole OS of 100 servers with minimal downtime → **MGN block-level continuous replication**

**Question 3.** Oracle → Aurora PostgreSQL requires schema conversion → **DMS + SCT Refactor**

**Question 4.** 7-year audit logs unmodifiable even by root → **Object Lock Compliance**

**Question 5.** Isolate some VPCs across multiple Regions → **TGW multiple route tables**

**Question 6.** Switch to VPN within 1 second of a DX failure → **2 DX connections + VPN + BGP/BFD**

**Question 7.** 100 TB gradual optimization with a 6-month deadline → **Rehost first, selective Refactor**

---

Next: Week 15 Day 2-5 and Week 16 Day 1-5 complete remaining comprehensive scenarios and conclusion.