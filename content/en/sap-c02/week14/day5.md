# Day 5 - Resilience and DR Integrated Review: The 4 Strategies That Meet RTO/RPO, and the Tools to Verify Them

If you understand DR (Disaster Recovery) as "taking backups," that is SAA level. At the Pro level, the business defines the **RTO (Recovery Time Objective)** and the **RPO (Recovery Point Objective, the tolerable window of data loss)**, and you must design a cost-effective DR strategy that fits those numbers. For this, AWS provides **4 strategies (Backup/Restore, Pilot Light, Warm Standby, Multi-Site)** and **automated verification tools (Resilience Hub, FIS, DRS, Route 53 ARC)**. Today we pull together all of the DR we saw in Week 14 into one scenario.

## The 4 DR Strategies: The RTO/RPO/Cost Trade-off

| Strategy | RTO | RPO | Cost | Suitable workloads |
|------|-----|-----|------|----------------|
| Backup & Restore | Hours to days | Hours | ★ (cheapest) | Non-critical systems, dev/staging |
| Pilot Light | 10 minutes to 1 hour | Minutes | ★★ | Medium importance |
| Warm Standby | Minutes to 30 minutes | Seconds to minutes | ★★★ | Mission-critical |
| Multi-Site Active-Active | 0 to seconds | 0 to seconds | ★★★★ (most expensive) | Finance, payments, game matchmaking |

The 4 strategies are in essence a spectrum of "how many resources you keep running in the DR environment during normal times." Backup/Restore keeps 0% running, Multi-Site keeps 100% running. Pilot Light keeps only the DB running and leaves the app off (started on failover), and Warm Standby is always running at reduced capacity (scaled up on failover). Cost is proportional to capacity, and RTO is inversely proportional to capacity.

Gartner's **RTO/RPO matrix** is a deliverable of Business Impact Analysis (BIA). The difference between an RTO of 1 minute and 1 hour can cost tens of times more, so a reasonable design is possible only if the business units state "the loss per minute of downtime." AWS includes this in the **Reliability Pillar questions of the WA Tool**, having you state it when you register a workload. The terms RTO/RPO themselves are standards formally defined in ISO 22301 (business continuity) and NIST SP 800-34 (contingency planning guide).

### Backup & Restore: Lowest Cost

- Regular snapshots + S3 storage + recreating infrastructure at DR time
- Cost is nearly zero (storage cost only)
- RTO of several hours or more (infrastructure provisioning + data recovery)

(Hypothetical case) A small SaaS runs production in us-east-1 and sends only backups to us-west-2 S3 with CRR (Cross-Region Replication). On a Region failure, it recreates the infrastructure in us-west-2 with CloudFormation → a 6-hour RTO. The business SLA is 24 hours, so that is sufficient. The legitimacy of this pattern was proven by the major 2017 S3 us-east-1 outage (4 hours): had the backups been in the same Region only, they would have disappeared along with that Region's failure. Backups must always be isolated in a different Region and account.

### Pilot Light: DB Hot, App Cold

- Only the DB (Aurora Replica, DDB Global Table) is always on in the DR Region
- App servers only have an AMI prepared and are not running normally
- On failover, raise the ASG min capacity → switch traffic

### Warm Standby: Reduced Capacity Always Running

- The full stack runs at reduced capacity in the DR Region
- On failover, scale the ASG up to reach production level
- RTO of several minutes (scale-out time)

### Multi-Site Active-Active: Traffic on Both Sides at Once

- Both Regions process production traffic
- Failover is automatic (Route 53 health check or Global Accelerator)
- Cost is nearly double, but RTO is 0

> 🎯 **Scenario**: "A global payments company promises a 99.99% SLA (52 minutes of downtime per year). What is the DR strategy?" The answer: **Multi-Site Active-Active + Aurora Global + DDB Global + Route 53 ARC Routing Control**. A four-nines SLA is virtually impossible with anything other than Multi-Site. The cost is double, but 1 minute of downtime = a loss of tens of millions of won, so it is justified.

> ⚠️ **Pitfall**: "A shorter RTO is always better" is a trap. Pro-level thinking is to choose **the cheapest strategy that meets the business RTO/RPO**. If the SLA is 24 hours and you choose Multi-Site, that is over-engineering that wastes double the cost on an RTO you do not need to meet. In the exam, when "cost-effective + meets the RTO" appear together, you must choose the lowest-cost strategy that satisfies the RTO.

## Backup and Restore Infrastructure

### AWS Backup: The Central Backup Service

- Integrated backup of EC2, EBS, RDS, Aurora, EFS, FSx, DynamoDB, Storage Gateway, and more
- A backup policy (Backup Plan) can be deployed across all of Organizations (tag-based selection automatically includes new resources)
- Keep isolated backups with Cross-Region and Cross-Account Copy

### Vault Lock: Compliance vs Governance

| Mode | Can it be changed? | Use |
|------|----------------|--------|
| Governance | Yes, with IAM permission | General use, preventing mistakes |
| Compliance | Not with any permission | Regulation (7-year retention) |

Once Compliance mode is enabled, **even the AWS headquarters root user cannot change it**. It legally guarantees that backups are never permanently deleted or altered. It satisfies WORM (Write Once Read Many) requirements such as the financial industry's SEC Rule 17a-4 and FINRA 4511. It has the same philosophy as S3 Object Lock Compliance mode.

In the 2021 Colonial Pipeline ransomware incident, the company paid a ransom of about 4.4 million dollars. If all of its backups had been isolated in a separate account on immutable storage (Compliance Lock), recovery would have been possible without paying the ransom. After this incident, immutable backup was elevated from "nice to have" to "essential in the age of ransomware." When a healthcare company keeps patient backups for 7 years for HIPAA compliance, it also blocks both intentional and accidental deletion with a Backup Vault Compliance Lock + Cross-Region Copy, and proves compliance to the auditor with a printout of the policy.

### Backup Audit Manager

- Automatically evaluates whether backups run according to policy
- Define rules such as "Daily backup + 35-day retention + cross-region copy"
- Notifies on violations through Security Hub integration

## Verification and Automation Tools

### Resilience Hub: Automatic RTO/RPO Assessment

- Register a workload → automatically identifies the RTO/RPO gap
- Recommendations: concrete guidance such as "changing to Aurora Multi-AZ achieves a 30-second RTO"
- With CI/CD integration, validates the resilience score on every PR

### FIS (Fault Injection Simulator): Chaos Engineering

- Simulates EC2 termination, latency injection, API throttling, and temporary revocation of IAM permissions
- **Stop Condition**: automatically stops when a specific CloudWatch alarm fires
- Verify production robustness with regular chaos tests

**Chaos Engineering** is a paradigm Netflix introduced in 2010. Under the assumption that "production is always partially broken," it regularly injects deliberate failures to verify that the system degrades gracefully. AWS turned it into a managed service as FIS in 2021. The Stop Condition is the key differentiator: it provides an automatic safety stop (fail-safe) so that a deliberate failure does not spill over into a real incident. After the major Netflix outage on Christmas Eve 2012 (a us-east-1 ELB failure), Netflix even built "Chaos Kong," which kills an entire Region, and verified regularly: failover works in a real crisis only as well as you practiced it in normal times.

### Application Migration Service (MGN) vs Elastic Disaster Recovery (DRS)

| Service | Purpose | Behavior |
|--------|------|------|
| MGN | One-time migration | Ends after moving from on-premises → AWS |
| DRS | Continuous DR | Continuously replicates from on-premises/other clouds → AWS |

> 🎯 **Scenario**: "Permanently move 100 on-premises VMs to AWS (Rehost of the 7 Rs)." → **MGN**. "Keep the on-premises VMs as they are while maintaining a 24-hour DR environment on AWS." → **DRS**. The two branched off the same replication engine (formerly CloudEndure), but their purposes are the exact opposite.

### Route 53 ARC (Application Recovery Controller)

- **Routing Control**: failover that a person explicitly toggles ON/OFF (separate from automatic health checks)
- **Zonal Shift**: immediately removes a problem AZ from the ALB/NLB (manual or automatic)
- **Readiness Check**: automatically verifies that the DR Region always maintains production-level readiness

During the major AWS us-east-1 outage on December 7, 2021 (about 7 hours), some companies suffered from automatic health checks flipping between healthy and unhealthy, making traffic jump around unstably. The data plane of ARC Routing Control is distributed across 5 Regions and works even if us-east-1 dies, so an operator can explicitly decide "switch to us-west-2 now." This outage left the lesson to design so that "even if the control plane dies, the data plane survives."

## Data Layer DR

### RDS Multi-AZ: Instance vs Cluster

| Mode | Failover | Replica use |
|------|----------|---------------|
| Multi-AZ Instance | 60-120 seconds | The replica is a standby and cannot take traffic |
| Multi-AZ Cluster | 35 seconds | Read traffic is possible on the 2 replicas |

Multi-AZ Cluster launched in 2022. Where the old Multi-AZ Instance was "1 primary + 1 standby (cannot take traffic)," the Cluster evolved into "1 primary + 2 readable replicas." With semi-synchronous replication, the primary sends the commit ack after confirming that data has reached 1 of the 2 replicas (a quorum) → a lower risk of data loss than asynchronous replication, and faster than fully synchronous.

### Aurora Global Database

- Up to 5 Regions, secondaries are read-only
- Typically RPO < 1 second, RTO < 1 minute
- "Managed Planned Failover" or "Unplanned Failover"
- Data is kept as 6 copies across 3 AZs, and with 4/6 write and 3/6 read quorums it stays available even if 1 AZ is lost

### DynamoDB Global Tables: Active-Active

- Writes are possible in every Region
- Conflict resolution: last writer wins (timestamp-based)
- Write latency: same-Region RTT + replication overhead (~1 second)

> ⚠️ **Pitfall**: Aurora Global secondaries are read-only, but DDB Global Tables accept writes in every Region. When you see the keyword "writes in both Regions," think DDB Global Tables, or Aurora Global's write forwarding (automatically forwards writes to the primary Region, at the cost of latency). DDB's Last Writer Wins has the limitation that on concurrent writes one side silently disappears (a lost update), so the best practice is to design the write keys partitioned by Region.

### S3 Multi-Region Access Point (MRAP)

- Exposes S3 buckets in multiple Regions as a single global endpoint
- Automatically routes to the closest Region
- Combined with Cross-Region Replication, distributes both reads and writes globally

Every choice in data-layer DR ultimately reduces to the latency-consistency trade-off of the **PACELC theorem** (an extension of CAP). Between AZs the distance is several km (1-2 ms), so synchronous replication (RPO 0) is possible, but between Regions it is thousands of km (40 ms+), so it is almost always asynchronous (RPO > 0). If "RPO 0 across Regions" is required, suspect either a large latency cost or impossibility.

## DR Scenario Keyword Mapping Table

| Keyword | Answer |
|--------|------|
| "RPO 0 + Active-Active writes in both Regions" | DDB Global Tables |
| "Global SQL DB + RPO of 1 second" | Aurora Global |
| "RDS failover 30 seconds" | Multi-AZ Cluster |
| "Permanent on-premises → AWS move" | MGN |
| "On-premises + continuous DR on AWS" | DRS |
| "S3 multi-Region single endpoint" | MRAP |
| "Backups immutable for 7 years (even for root)" | Backup Vault Compliance Lock |
| "Deliberate failure in operation + automatic stop" | FIS + Stop Condition |
| "Automatic DR gap identification + recommendations" | Resilience Hub |
| "Remove only an AZ from traffic immediately" | Route 53 ARC Zonal Shift |
| "A person explicitly decides the failover" | Route 53 ARC Routing Control |
| "Automatic evaluation of backup policy compliance" | Backup Audit Manager |
| "Meets RTO + minimum cost" | The lowest-cost strategy that meets it |

## Summary

DR is a workflow of **defining the business RTO/RPO → choosing among the 4 strategies → automating verification**. Cost, RTO, and RPO trade off against one another, so you must not blindly choose Multi-Site; you must set the appropriate level with a business impact analysis. Combining AWS Backup, Resilience Hub, FIS, DRS, and Route 53 ARC to automate the whole lifecycle of "define → implement → verify" is Pro-level design.

Next week (Week 15) is the **integrated scenarios**. We will work through integrated cases for each industry: large enterprise, startup, finance, media, and government/healthcare.

---

## 📝 Practice Questions

**Question 1.** You need an RTO of 5 minutes, an RPO of 1 second, and a global SQL DB.

A) RDS Multi-AZ

B) Aurora Global Database

C) DMS Continuous Replication

D) Read Replica

**Answer: B**

Explanation: Aurora Global guarantees up to 5 Regions, RPO < 1 second, and RTO < 1 minute. RDS Multi-AZ provides availability only within a single Region, and a Read Replica has weak consistency and no automatic failover SLA. DMS is a migration and replication tool, not a global DB solution. "Global SQL + RPO of 1 second" is the direct answer for Aurora Global.

---

**Question 2.** "Deliberate failure injection in operation + automatic stop on an alarm."

A) Manually terminate EC2 with Lambda

B) FIS + Stop Condition

C) Trusted Advisor monitoring

D) Resilience Hub automated tests

**Answer: B**

Explanation: FIS's Stop Condition is an automatic safety stop that immediately halts a running experiment when a CloudWatch alarm fires and returns to a normal state, preventing the deliberate failure from spilling over into a real incident. A has no safety mechanism and risks getting out of control, C is only a monitoring tool with no failure injection feature, and D (Resilience Hub) is an RTO/RPO assessment and recommendation tool, not a chaos engine that injects failures directly. "Deliberate failure + automatic stop" is the direct answer for FIS.

---

**Question 3.** Regulatory requirement: retain backups for 7 years + immediately immutable against change or deletion (even for AWS root).

A) S3 Glacier Deep Archive

B) Backup Vault Compliance Lock

C) Backup Vault Governance Lock

D) S3 Object Lock Governance Mode

**Answer: B**

Explanation: Only Compliance mode cannot be changed even with AWS root permission after the grace period ends. Governance (the mode in C and D) can be released or deleted by an administrator with the appropriate IAM permissions, so it fails the "no one can" requirement. Glacier (A) is merely a cheap storage tier and does not enforce an immutability policy itself. "Not even root, regulatory 7 years" is the direct answer for Compliance Lock.

---

**Question 4.** A global DB that accepts writes in both Regions.

A) Aurora Global (Read-Only Secondary)

B) DynamoDB Global Tables

C) RDS Cross-Region Read Replica

D) DocumentDB Global Cluster

**Answer: B**

Explanation: Only DDB Global Tables is multi-master active-active, with every Region accepting writes. Aurora Global (A) is single-writer with read-only secondaries (write forwarding is possible, but in essence it is single-writer), an RDS Read Replica (C) is read-only until promotion, and a DocumentDB Global Cluster (D) also has read-only secondaries. "Simultaneous writes in both Regions" is the only direct answer for DDB Global Tables.

---

**Question 5.** Immediately remove only the AZ that has a problem from traffic.

A) Block traffic with a NACL

B) Route 53 ARC Zonal Shift

C) ASG Detach Instance

D) ALB Connection Draining

**Answer: B**

Explanation: Zonal Shift removes a specific AZ from the ALB/NLB immediately with a single command, redistributing traffic to the remaining healthy AZs within 5 minutes. A NACL (A) is too broad and manual, and ASG Detach (C) and ALB Draining (D) work per individual instance or connection, so they cannot cleanly isolate an entire AZ. "Immediately remove only the problem AZ, not the Region" is the direct answer for Zonal Shift.

---

**Question 6.** Maintain a 24-hour DR environment on AWS for 200 on-premises VMs.

A) Application Migration Service (MGN)

B) Elastic Disaster Recovery (DRS)

C) DataSync

D) Snowball

**Answer: B**

Explanation: DRS uses block-level continuous replication to keep the on-premises environment as is while maintaining a continuous DR environment on AWS, and it allows regular drills. MGN (A) ends once the one-time migration is finished, so it is unsuitable for "continuous DR." DataSync (C) is file transfer, and Snowball (D) is a physical device for bulk transfer. "Continuous DR" is the signal for DRS.

---

**Question 7.** Achieve RDS failover within 30 seconds and also spread read traffic to the standby.

A) Multi-AZ Instance (Standby)

B) Multi-AZ Cluster (2 Replicas)

C) Read Replica

D) Snapshot restore

**Answer: B**

Explanation: Multi-AZ Cluster achieves a failover of about 35 seconds with semi-synchronous quorum replication while spreading read traffic across the 2 replicas. Multi-AZ Instance (A) takes 60-120 seconds and its standby cannot take traffic. A Read Replica (C) has no automatic failover and needs manual promotion. D has no high availability at all. "Around 30 seconds + standby reads" is the direct answer for Multi-AZ Cluster, and the trap is that a Read Replica has no automatic failover.

---

**Question 8.** Automatically identify DR gaps, get concrete improvement recommendations, and integrate them into CI/CD.

A) Trusted Advisor

B) Resilience Hub

C) WA Tool

D) Config

**Answer: B**

Explanation: Resilience Hub identifies the gap between a workload's current RTO/RPO and the target, generates concrete recommendations such as "change to Aurora Multi-AZ" and FIS experiments, and can integrate the resilience score into CI/CD as a gate. Trusted Advisor (A) is an automatic scanner, the WA Tool (C) is a qualitative assessment across the 6 pillars that does not automatically measure the quantitative RTO/RPO gap, and Config (D) is general configuration evaluation. "Quantitative RTO/RPO gap + recommendations + CI/CD" is the direct answer for Resilience Hub.

---

**Question 9.** Expose multi-Region S3 buckets as a single global endpoint.

A) CloudFront

B) S3 Multi-Region Access Point (MRAP)

C) Global Accelerator

D) Route 53 Latency Routing

**Answer: B**

Explanation: MRAP binds buckets in multiple Regions into a single global endpoint and routes to the closest Region. CloudFront (A) is a CDN and not an S3 multi-Region policy, Global Accelerator (C) accelerates TCP/UDP endpoints and does not unify S3 buckets, and Route 53 Latency (D) is only DNS routing and does not create a single endpoint. "S3 multi-Region single endpoint" is the direct answer for MRAP.

---

**Question 10.** A person explicitly makes the decision and triggers the failover (avoiding false positives from automatic health checks).

A) Route 53 ARC Routing Control

B) Health Check automatic failover

C) Lambda automation script

D) Global Accelerator endpoint group failover

**Answer: A**

Explanation: Routing Control is separated from automatic health checks, and the operator explicitly toggles it ON/OFF. It suits mission-critical systems where the risk of automatic failover from a false positive is large, and its data plane is distributed across 5 Regions, so it works even in a single-Region failure. B, C, and D are all automatic switching, so they keep the false-positive problem as is. "A person's explicit failover decision" is the direct answer for Routing Control.

---

**Question 11.** A company wants to design DR for a staging environment with a 24-hour RTO SLA at minimum cost. Which strategy is the most suitable?

A) Multi-Site Active-Active

B) Warm Standby

C) Pilot Light

D) Backup & Restore

**Answer: D**

Explanation: When a lenient goal of a 24-hour RTO is given together with "minimum cost," Backup & Restore, which keeps 0% compute running in the DR Region, is the answer. Recreating the infrastructure with IaC at failure time takes several hours, which fits comfortably within a 24-hour RTO. A, B, and C offer faster RTOs but incur idle cost to that degree, which is over-engineering that wastes money on an RTO you do not need to meet. Choosing "the cheapest strategy that can meet it" is Pro-level thinking.

---

**Question 12.** A company wants to protect its backups so that they remain recoverable even if the workload account is taken over by ransomware. What is the most robust configuration?

A) Cross-Region Copy only, to another Region in the same account

B) Cross-Account Copy to a separate backup account + Compliance Lock on the destination Vault

C) Enable S3 Versioning

D) Backup Vault Governance Lock

**Answer: B**

Explanation: Even if ransomware seizes administrator privileges in the workload account, if the backups are in a separate account (Cross-Account) and that Vault has a Compliance Lock (not even root can delete), the attacker cannot touch them, and recovery is possible without paying the ransom (the lesson of 2021 Colonial Pipeline). With A, it is the same account, so an account takeover also exposes the backups in the other Region; C (Versioning) is only overwrite protection and does not prevent deletion; and D (Governance) can be released with the seized administrator privileges. "Preparing for account takeover and ransomware" is the combination of Cross-Account + Compliance Lock.

---
