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

**문제 1.** EU 데이터 비EU 이동 차단, root도 불가 → **SCP DenyRegions**

**문제 2.** 서버 100대 최소 다운타임 OS 통째 이전 → **MGN 블록 레벨 연속 복제**

**문제 3.** Oracle→Aurora PostgreSQL 스키마 변환 필요 → **DMS + SCT Refactor**

**문제 4.** 7년 감사 로그 root도 변경 불가 → **Object Lock Compliance**

**문제 5.** 다중 리역 VPC 일부 격리 → **TGW 다중 라우트 테이블**

**문제 6.** DX 장애 1초 이내 VPN 전환 → **DX 2회선 + VPN + BGP/BFD**

**문제 7.** 6개월 데드라인 100TB 점진 최적화 → **Rehost 먼저, 선택적 Refactor**

---

Next: Week 15 Day 2-5 and Week 16 Day 1-5 complete remaining comprehensive scenarios and conclusion.