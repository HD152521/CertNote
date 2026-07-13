# Day 4 - Disaster Recovery Architecture, RTO/RPO

DR strategies: backup-restore (high RPO/RTO), pilot light (minimal standby), warm standby (scaled for partial load), multi-site active-active.

RTO (Recovery Time Objective) — acceptable downtime. RPO (Recovery Point Objective) — acceptable data loss. Inverse relationship: higher availability costs more.

Implementation: Aurora Global Database (cross-region replication), DMS continuous replication, backup automation, traffic failover via Route 53. Runbooks and automation reduce manual recovery time.

---

## Practice Problems

---
