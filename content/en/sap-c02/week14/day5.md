# Day 5 - Resilience and DR Comprehensive Review: Four Strategies Honoring RTO/RPO and Validation Tools

Understanding DR as "backup in place" is SAA level. Pro requires **RTO (Recovery Time Objective, target recovery time) and RPO (Recovery Point Objective, allowed data loss window) defined by business**, then designing cost-efficient DR strategy to meet those numbers. AWS provides **four strategies (Backup/Restore, Pilot Light, Warm Standby, Multi-Site) and auto-validation tools (Resilience Hub, FIS, DRS, Route 53 ARC)**. Today we consolidate Week 14's entire DR into one scenario.

## Four DR Strategies: RTO/RPO/Cost Trade-offs

| Strategy | RTO | RPO | Cost | Workload |
|----------|-----|-----|------|----------|
| Backup & Restore | Hours to days | Hours | ★ (cheapest) | Non-critical, dev/staging |
| Pilot Light | 10 min–1 hour | Minutes | ★★ | Medium-importance |
| Warm Standby | Minutes–30 min | Seconds–minutes | ★★★ | Mission-critical |
| Multi-Site Active-Active | 0–seconds | 0–seconds | ★★★★ (most expensive) | Finance, payments, matchmaking |

All four fundamentally answer "how much infrastructure stays on in DR region?" Backup/Restore: 0%, Multi-Site: 100%. Pilot Light: DB on, apps off (start on failover); Warm Standby: reduced capacity always on (scale on failover). Cost proportional to capacity; RTO inversely proportional.

**Key pitfall**: "Shorter RTO always better" is wrong. Pro thinking: **cheapest strategy meeting business RTO/RPO**. 24-hour SLA but Multi-Site picked = 2x cost wasted on unnecessary RTO. "Cost-efficient + RTO met" together means picking lowest-cost strategy hitting RTO threshold.

## Backup & Restore Infrastructure

**AWS Backup**: Central backup service
- Unified backups across EC2, EBS, RDS, Aurora, EFS, FSx, DynamoDB, Storage Gateway
- Policies deployable org-wide (tag-based selection auto-enrolls new resources)
- Cross-Region, Cross-Account Copy for isolated backup storage

**Vault Lock**: Compliance vs Governance
- **Governance**: Changeable with IAM permissions (accident prevention)
- **Compliance**: Immutable—no permissions change it (regulatory 7-year retention)

Compliance mode makes AWS root unable to modify. Legally guarantees WORM (SEC 17a-4, FINRA). Colonial Pipeline 2021 ransomware cost $4.4M; immutable backup in separate account (Compliance Lock + Cross-Account) would enable zero-ransom recovery. Now immutable backup is ransomware-era essential.

**Backup Audit Manager**
- Auto-validate backup execution vs policy
- Define rules: "daily backup + 35-day retention + cross-region copy"
- Flag violations, integrate Security Hub for alerting

## Validation and Automation Tools

**Resilience Hub**: Auto RTO/RPO assessment
- Register workload → auto-identifies gap
- "Change to Aurora Multi-AZ for RTO 30 sec" concrete guidance
- CI/CD integration gates resilience score per PR

**FIS (Fault Injection Simulator)**: Chaos engineering
- EC2 stop, latency injection, API throttling, IAM permission revocation
- **Stop Condition**: Auto-halt on CloudWatch alarm
- Regular chaos tests validate production resilience

Chaos Engineering root: Netflix 2010. "Production always partly broken"—intentionally inject failure, verify graceful degradation. 2021 FIS made this managed. Stop Condition: critical safeguard—auto-stop prevents intentional failures cascading into real incidents.

**MGN vs DRS**
- **MGN**: One-time migration (on-prem → AWS then stop)
- **DRS**: Continuous DR (on-prem/cloud → AWS sustained replication)

**Route 53 ARC (Application Recovery Controller)**
- **Routing Control**: Operator explicitly toggles failover (separate from auto health check)
- **Zonal Shift**: Instantly exclude problem AZ from ALB/NLB
- **Readiness Check**: Auto-verify DR region maintains production-level readiness

2021-12-07 us-east-1 outage: some companies experienced auto health-check ping-ponging causing traffic instability. ARC Routing Control data plane distributed across 5 regions even if us-east-1 dies—operators decide failover explicitly. Lesson: "control plane can fail; data plane must survive."

## Data Layer DR

**RDS Multi-AZ**: Instance vs Cluster
- **Instance**: 60-120s failover, replica traffic-blocked
- **Cluster**: ~35s failover, 2 readable replicas get read traffic

Multi-AZ Cluster uses semi-sync replication: writer confirms 1 of 2 replicas received data (quorum) before ack—faster than full sync, safer than async. Readable replicas mean fast failover already-current data promotion.

**Aurora Global Database**
- Up to 5 regions, secondaries read-only
- Typically RPO < 1s, RTO < 1 min
- Data: 6 copies across 3 AZ, 4/6 write + 3/6 read quorum
- 1 AZ total loss (2 copies) still supports 4/6 write quorum

**DynamoDB Global Tables**: Active-Active
- All regions writable
- Conflict: Last Writer Wins (timestamp-based)
- ~1s write latency (same-region RTT + replication overhead)

Pitfall: Aurora Global secondary is read-only; DDB Global Tables all regions write. "Both-region writes" keyword means DDB Global Tables or Aurora with write forwarding (writes forward to primary, latency cost). DDB's Last Writer Wins: simultaneous writes, one silently disappears (lost update). Best practice: shard writes by region.

**S3 MRAP (Multi-Region Access Point)**
- Single global endpoint for multi-region S3 buckets
- Auto-route to nearest region
- Combine CRR for global read/write distribution

**Theory**: All data-layer DR choices reduce to **PACELC latency-consistency trade-off**. AZ distances (few km, 1-2ms) enable sync (RPO 0); region distances (thousands km, 40ms+) demand async (RPO>0). "Cross-region RPO 0" asks for massive latency cost or is impossible.

## DR Scenario Keyword Mapping

| Keyword | Answer |
|---------|--------|
| "RPO 0 + Active-Active dual-region writes" | DDB Global Tables |
| "Global SQL DB + RPO 1s" | Aurora Global |
| "RDS Failover 30s" | Multi-AZ Cluster |
| "On-prem → AWS permanent migration" | MGN |
| "On-prem + AWS sustained DR" | DRS |
| "S3 multi-region single endpoint" | MRAP |
| "7-year backup immutable (root can't change)" | Backup Vault Compliance Lock |
| "Intentional failure during ops + auto-stop" | FIS + Stop Condition |
| "DR gap auto-identify + recommendations" | Resilience Hub |
| "Problem AZ only instant traffic exclude" | Route 53 ARC Zonal Shift |
| "Operator explicit failover decision" | Route 53 ARC Routing Control |
| "Backup policy compliance auto-assessment" | Backup Audit Manager |
| "RTO met + cost minimal" | Lowest-cost strategy hitting RTO |

## Summary

DR is **business RTO/RPO definition → four-strategy selection → validation automation** workflow. Cost/RTO/RPO mutually trade off—blindly picking Multi-Site is wrong; BIA determines proper level. Combining AWS Backup, Resilience Hub, FIS, DRS, Route 53 ARC automates "define → implement → validate" full lifecycle. Pro-level design.

Next week (Week 15): **Comprehensive Scenarios**. Industry-specific cases: enterprise, startup, finance, media, government/healthcare.

---

## 📝 연습 문제

**문제 1.** RTO 5분·RPO 1초·글로벌 SQL DB

A) RDS Multi-AZ
B) Aurora Global Database
C) DMS Continuous Replication
D) Read Replica

**정답: B**

---

**문제 2.** "운영 중 의도적 장애 주입 + 알람 시 자동 중단"

A) Lambda로 수동 EC2 종료
B) FIS + Stop Condition
C) Trusted Advisor 모니터링
D) Resilience Hub 자동 테스트

**정답: B**

---

**문제 3.** 규제: 백업 7년 + 즉시 변경·삭제 불가 (AWS root도)

A) S3 Glacier Deep Archive
B) Backup Vault Compliance Lock
C) Backup Vault Governance Lock
D) S3 Object Lock Governance Mode

**정답: B**

---

**문제 4.** 양 리전 모두 쓰기 가능

A) Aurora Global (Read-Only Secondary)
B) DynamoDB Global Tables
C) RDS Cross-Region Read Replica
D) DocumentDB Global Cluster

**정답: B**

---

**문제 5.** 문제 AZ만 즉시 트래픽 제외

A) NACL로 차단
B) Route 53 ARC Zonal Shift
C) ASG Detach Instance
D) ALB Connection Draining

**정답: B**

---

**문제 6.** 온프레미스 VM 200대, AWS 24시간 DR 환경 유지

A) Application Migration Service (MGN)
B) Elastic Disaster Recovery (DRS)
C) DataSync
D) Snowball

**정답: B**

---

**문제 7.** RDS Failover 30초 이내 + standby read 분산

A) Multi-AZ Instance
B) Multi-AZ Cluster
C) Read Replica
D) Snapshot 복원

**정답: B**

---

**문제 8.** DR 격차 자동 식별 + 권고 + CI/CD 통합

A) Trusted Advisor
B) Resilience Hub
C) WA Tool
D) Config

**정답: B**

---

**문제 9.** S3 다중 리전 단일 글로벌 엔드포인트

A) CloudFront
B) S3 Multi-Region Access Point (MRAP)
C) Route 53 Latency Routing
D) Global Accelerator

**정답: B**

---

**문제 10.** "사람이 false positive를 우려해 명시적으로 failover를 결정"

A) Route 53 자동 Health Check Failover
B) Route 53 ARC Routing Control
C) Global Accelerator 자동 failover
D) Lambda 자동 DNS 전환

**정답: B**

---