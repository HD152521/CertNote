# Day 5 - Resilience and DR Comprehensive Review: Four Strategies Honoring RTO/RPO and Validation Tools

Understanding DR (Disaster Recovery) as "keeping backups in place" is SAA level. At Pro level, the business defines the **RTO (Recovery Time Objective, target recovery time)** and the **RPO (Recovery Point Objective, allowed data loss window)**, and you must design a DR strategy that fits those numbers in a cost-efficient way. For this, AWS provides **four strategies (Backup/Restore, Pilot Light, Warm Standby, Multi-Site)** and **automated validation tools (Resilience Hub, FIS, DRS, Route 53 ARC)**. Today we consolidate all of the DR material from Week 14 into one scenario.

## Four DR Strategies: RTO/RPO/Cost Trade-offs

| Strategy | RTO | RPO | Cost | Suitable workload |
|------|-----|-----|------|----------------|
| Backup & Restore | Hours to days | Hours | ★ (cheapest) | Non-critical systems, dev/staging |
| Pilot Light | 10 min to 1 hour | Minutes | ★★ | Medium importance |
| Warm Standby | Minutes to 30 min | Seconds to minutes | ★★★ | Mission-critical |
| Multi-Site Active-Active | 0 to seconds | 0 to seconds | ★★★★ (most expensive) | Finance, payments, game matchmaking |

The four strategies are essentially a spectrum of "how many resources do you normally keep running in the DR environment?" Backup/Restore keeps 0% on, Multi-Site keeps 100% on. Pilot Light keeps only the DB on and the app off (started at failover), while Warm Standby keeps a scaled-down capacity always on (scaled up at failover). Cost is proportional to capacity, and RTO is inversely proportional to capacity.

Gartner's **RTO/RPO matrix** is an output of the Business Impact Analysis (BIA). The difference between an RTO of 1 minute and 1 hour can cost many times more, so the business unit must state the "loss per minute of downtime" for a rational design to be possible. AWS builds this into the **WA Tool's Reliability Pillar questions** so it is stated when a workload is registered. The RTO/RPO terms themselves are standards formally defined in ISO 22301 (business continuity) and NIST SP 800-34 (contingency planning guide).

### Backup & Restore: Lowest Cost

- Periodic snapshots + S3 storage + recreate the infrastructure at DR time
- Cost is almost 0 (storage cost only)
- RTO of several hours or more (infrastructure provisioning + data recovery)

(Hypothetical case) A small SaaS runs production in us-east-1 and sends only backups to us-west-2 S3 via CRR (Cross-Region Replication). When a region fails, it recreates the infrastructure in us-west-2 with CloudFormation → 6-hour RTO. Since the business SLA is 24 hours, this is sufficient. The justification for this pattern was proven by the major 2017 S3 us-east-1 outage (4 hours) — if backups had existed only in the same region, they would have vanished along with that region's failure. Backups must always be isolated in a different region and account.

### Pilot Light: DB Hot, App Cold

- Keep only the DB (Aurora Replica, DDB Global Table) always on in the DR region
- App servers have only the AMI prepared and normally don't run
- At failover, increase the ASG min capacity → switch traffic

### Warm Standby: Scaled-Down Capacity Always Running

- Run the full stack at scaled-down capacity in the DR region
- At failover, scale out the ASG to reach production level
- RTO of several minutes (scale-out time)

### Multi-Site Active-Active: Simultaneous Traffic on Both Sides

- Both regions handle production traffic
- Failover is automatic (Route 53 health check or Global Accelerator)
- Cost is nearly double, but RTO is 0

> 🎯 **Scenario**: "A global payment company promises a 99.99% SLA (52 minutes of downtime per year). What DR strategy?" — Answer: **Multi-Site Active-Active + Aurora Global + DDB Global + Route 53 ARC Routing Control**. A four-nines SLA is practically impossible with anything other than Multi-Site. The cost is double, but one minute of downtime means a loss of tens of millions of won, so it is justified.

> ⚠️ **Trap**: "A shorter RTO is always better" is a trap. Pro thinking is choosing **the cheapest strategy that meets the business RTO/RPO**. If the SLA is 24 hours and you choose Multi-Site, that is over-engineering that wastes double the cost on an RTO you don't need to meet. When "cost efficiency + RTO met" appear together on the exam, pick the lowest-cost strategy that satisfies the RTO.

## Backup and Restore Infrastructure

### AWS Backup: Central Backup Service

- Unified backup for EC2, EBS, RDS, Aurora, EFS, FSx, DynamoDB, Storage Gateway, and more
- A backup policy (Backup Plan) can be deployed across all of Organizations (tag-based selection automatically enrolls new resources)
- Isolated backup retention with Cross-Region and Cross-Account Copy

### Vault Lock: Compliance vs Governance

| Mode | Can it be changed | Use |
|------|----------------|--------|
| Governance | Yes, with IAM permissions | General use, accident prevention |
| Compliance | Not with any permissions | Regulation (7-year retention) |

Once Compliance mode is activated, **even the AWS root user at AWS headquarters cannot change it**. It legally guarantees that backups are never permanently deleted or altered. It satisfies WORM (Write Once Read Many) requirements such as SEC Rule 17a-4 and FINRA 4511 in the financial sector. It shares the same philosophy as S3 Object Lock Compliance mode.

In the 2021 Colonial Pipeline ransomware incident, the company paid a ransom of about $4.4 million. Had all backups been isolated in a separate account on immutable storage (Compliance Lock), recovery would have been possible without paying the ransom. After this incident, immutable backup was elevated from "nice to have" to "essential in the ransomware era." When a healthcare company retains patient backups for 7 years for HIPAA compliance, it likewise blocks both intentional and accidental deletion with a Backup Vault Compliance Lock + Cross-Region Copy, and proves compliance to auditors with a printout of the policy.

### Backup Audit Manager

- Automatically evaluates whether backups run according to policy
- Define rules such as "Daily backup + 35-day retention + cross-region copy"
- Notifies on violations through Security Hub integration

## Validation and Automation Tools

### Resilience Hub: Automatic RTO/RPO Assessment

- Register a workload → automatically identifies the RTO/RPO gap
- Recommendations: concrete guidance such as "Switching to Aurora Multi-AZ achieves a 30-second RTO"
- CI/CD integration validates the resilience score on every PR

### FIS (Fault Injection Simulator): Chaos Engineering

- Simulates EC2 termination, latency injection, API throttling, and temporary revocation of IAM permissions
- **Stop Condition**: Automatically halts when a specific CloudWatch alarm fires
- Validates production robustness through regular chaos tests

**Chaos Engineering** is a paradigm Netflix introduced in 2010. Under the assumption that "production is always partially broken," it regularly injects deliberate failures to verify that the system degrades gracefully. AWS turned this into a managed service with FIS in 2021. The Stop Condition is the key differentiator — it provides an automatic fail-safe so that deliberate failures don't spill over into real incidents. After the major Netflix outage on Christmas Eve 2012 (the us-east-1 ELB failure), Netflix even built "Chaos Kong," which kills an entire region, and validated with it regularly — failover works in a real crisis only as well as it has been practiced.

### Application Migration Service (MGN) vs Elastic Disaster Recovery (DRS)

| Service | Purpose | Behavior |
|--------|------|------|
| MGN | One-time migration | Ends after moving from on-premises → AWS |
| DRS | Continuous DR | Continuously replicates on-premises/other cloud → AWS |

> 🎯 **Scenario**: "Permanently move 100 on-premises VMs to AWS (Rehost of the 7 Rs)." → **MGN**. "Keep the on-premises VMs as they are while maintaining a 24-hour DR environment on AWS." → **DRS**. The two branched from the same replication engine (formerly CloudEndure), but their purposes are the opposite.

### Route 53 ARC (Application Recovery Controller)

- **Routing Control**: A failover that a person explicitly toggles ON/OFF (separate from automatic health checks)
- **Zonal Shift**: Immediately removes a problem AZ from the ALB/NLB (manual or automatic)
- **Readiness Check**: Automatically verifies that the DR region always maintains production-level readiness

During the major AWS us-east-1 outage on December 7, 2021 (about 7 hours), some companies suffered traffic that jumped around unstably because automatic health checks kept flipping between healthy and unhealthy. The data plane of ARC Routing Control is distributed across 5 regions and keeps working even if us-east-1 dies, so operators can explicitly decide "switch to us-west-2 now." This outage left the lesson to design so that "even if the control plane dies, the data plane survives."

## Data Layer DR

### RDS Multi-AZ: Instance vs Cluster

| Mode | Failover | Replica use |
|------|----------|---------------|
| Multi-AZ Instance | 60-120 seconds | Replica is a standby, no traffic allowed |
| Multi-AZ Cluster | 35 seconds | Read traffic is possible on 2 Replicas |

Multi-AZ Cluster launched in 2022. Where the older Multi-AZ Instance was "1 primary + 1 standby (no traffic)," Cluster evolved into "1 primary + 2 readable replicas." With semi-synchronous replication, the primary sends the commit ack after confirming that the data has reached 1 of the 2 replicas (a quorum) → lower risk of data loss than asynchronous replication, and faster than fully synchronous.

### Aurora Global Database

- Up to 5 regions, secondaries are read-only
- Generally RPO < 1 second, RTO < 1 minute
- "Managed Planned Failover" or "Unplanned Failover"
- Data is kept as 6 copies across 3 AZs, and with a 4/6 write and 3/6 read quorum it stays available even after losing 1 AZ

### DynamoDB Global Tables: Active-Active

- Writes possible in every region
- Conflict resolution: last writer wins (timestamp-based)
- Write latency: same-region RTT + replication overhead (~1 second)

> ⚠️ **Trap**: Aurora Global secondaries are read-only, but DDB Global Tables allow writes in every region. If you see the keyword "writes in both regions," it is DDB Global Tables, or Aurora Global's write forwarding (writes are automatically forwarded to the primary region, at the cost of latency). DDB's Last Writer Wins has the limitation that on concurrent writes one side silently disappears (a lost update), so the best practice is a design that partitions write keys by region.

### S3 Multi-Region Access Point (MRAP)

- Exposes S3 buckets in multiple regions as a single global endpoint
- Automatically routes to the nearest region
- Combined with Cross-Region Replication, distributes both reads and writes globally

Every choice in data layer DR ultimately reduces to the latency-consistency tradeoff of the **PACELC theorem** (an extension of CAP). Between AZs the distance is a few km (1-2 ms), so synchronous replication (RPO 0) is possible, but between regions it is thousands of km (40 ms+), so it is almost always asynchronous (RPO > 0). If "RPO 0 across regions" is required, suspect either a large latency cost or impossibility.

## DR Scenario Keyword Mapping Table

| Keyword | Answer |
|--------|------|
| "RPO 0 + Active-Active writes in both regions" | DDB Global Tables |
| "Global SQL DB + RPO 1 second" | Aurora Global |
| "RDS failover 30 seconds" | Multi-AZ Cluster |
| "On-premises → AWS permanent migration" | MGN |
| "On-premises + continuous DR on AWS" | DRS |
| "S3 multi-region single endpoint" | MRAP |
| "Backups immutable for 7 years (even for root)" | Backup Vault Compliance Lock |
| "Deliberate failures during operation + automatic stop" | FIS + Stop Condition |
| "Automatically identify DR gaps + recommendations" | Resilience Hub |
| "Instantly exclude only the AZ from traffic" | Route 53 ARC Zonal Shift |
| "A person explicitly decides the failover" | Route 53 ARC Routing Control |
| "Automatically assess backup policy compliance" | Backup Audit Manager |
| "RTO met + minimal cost" | Lowest-cost strategy that meets it |

## Summary

DR is a workflow of **defining the business RTO/RPO → choosing among the four strategies → automating validation**. Cost, RTO, and RPO trade off against one another, so you must not blindly choose Multi-Site; you must settle on the appropriate level with a business impact analysis. Combining AWS Backup, Resilience Hub, FIS, DRS, and Route 53 ARC to automate the entire "define → implement → validate" lifecycle is Pro-level design.

Next week (Week 15) is **Comprehensive Scenarios**. We will work through comprehensive cases for each industry: large enterprise, startup, finance, media, and government/healthcare.

---

## 📝 Practice Questions

**Question 1.** RTO 5 minutes, RPO 1 second, global SQL DB

A) RDS Multi-AZ
B) Aurora Global Database
C) DMS Continuous Replication
D) Read Replica

**Answer: B**

---

**Question 2.** "Deliberate fault injection in operation + automatic stop on alarm"

A) Terminate EC2 manually with Lambda
B) FIS + Stop Condition
C) Trusted Advisor monitoring
D) Resilience Hub automated tests

**Answer: B**

---

**Question 3.** Regulation: backups for 7 years + cannot be modified or deleted immediately (even by AWS root)

A) S3 Glacier Deep Archive
B) Backup Vault Compliance Lock
C) Backup Vault Governance Lock
D) S3 Object Lock Governance Mode

**Answer: B**

---

**Question 4.** Writes possible in both Regions

A) Aurora Global (Read-Only Secondary)
B) DynamoDB Global Tables
C) RDS Cross-Region Read Replica
D) DocumentDB Global Cluster

**Answer: B**

---

**Question 5.** Immediately remove only the problem AZ from traffic

A) Block with a NACL
B) Route 53 ARC Zonal Shift
C) ASG Detach Instance
D) ALB Connection Draining

**Answer: B**

---

**Question 6.** 200 on-premises VMs, maintain an AWS DR environment on standby around the clock

A) Application Migration Service (MGN)
B) Elastic Disaster Recovery (DRS)
C) DataSync
D) Snowball

**Answer: B**

---

**Question 7.** RDS failover within 30 seconds + distribute standby reads

A) Multi-AZ Instance
B) Multi-AZ Cluster
C) Read Replica
D) Restore from a Snapshot

**Answer: B**

---

**Question 8.** Automatically identify DR gaps + recommendations + CI/CD integration

A) Trusted Advisor
B) Resilience Hub
C) WA Tool
D) Config

**Answer: B**

---

**Question 9.** A single global endpoint for S3 across multiple Regions

A) CloudFront
B) S3 Multi-Region Access Point (MRAP)
C) Route 53 Latency Routing
D) Global Accelerator

**Answer: B**

---

**Question 10.** "A human decides on failover explicitly out of concern for false positives"

A) Route 53 automatic Health Check failover
B) Route 53 ARC Routing Control
C) Global Accelerator automatic failover
D) Lambda automatic DNS switching

**Answer: B**
---

**Question 11.** A company wants to design DR for a staging environment with a 24-hour RTO SLA at the lowest possible cost. Which strategy is most appropriate?

A) Multi-Site Active-Active
B) Warm Standby
C) Pilot Light
D) Backup & Restore

**Answer: D**

**Explanation:** When a lenient goal of a 24-hour RTO is given together with "minimum cost," Backup & Restore, which keeps 0% of compute running in the DR Region, is the correct answer. Recreating the infrastructure with IaC during a failure takes several hours, which fits well within a 24-hour RTO. A, B, and C provide a faster RTO but incur that much idle cost, which is over-engineering that wastes money on an RTO that does not need to be met. Choosing "the cheapest strategy that can meet the requirement" is Pro-level thinking.

---

**Question 12.** A company wants to protect its backups so that they can be recovered even if a workload account is taken over by ransomware. Which is the most robust configuration?

A) Cross-Region Copy only, in the same account
B) Cross-Account Copy to a separate backup account + Compliance Lock on the destination Vault
C) Enable S3 Versioning
D) Backup Vault Governance Lock

**Answer: B**

**Explanation:** Even if ransomware takes over administrator privileges in the workload account, if the backups are in a separate account (cross-account) and that Vault has a Compliance Lock (which even root cannot delete), the attacker cannot touch them and recovery is possible without paying a ransom (the lesson of the 2021 Colonial Pipeline incident). A is in the same account, so if the account is taken over, the backups in the other Region are also exposed. C (Versioning) only protects against overwrites and does not prevent deletion. D (Governance) can be released with the stolen administrator privileges. The combination of Cross-Account + Compliance Lock is the answer for "account takeover / ransomware preparedness."
---