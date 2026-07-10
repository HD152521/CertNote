# Day 2 - Why DR Got Organized into a "Four-Stage Spectrum"

When you learn Disaster Recovery, you memorize four terms: Backup & Restore, Pilot Light, Warm Standby, and Multi-Site Active-Active. But these four aren't different technologies — they're **four points marked on one continuous spectrum**. At one end of the spectrum is "keep almost nothing running in advance and build it all after failure"; at the other end is "a second environment runs full-stack even in normal times." As you climb the stages, RTO and RPO shrink but cost rises steeply. This monotonic relationship — **recovery speed and cost are directly proportional** — is the backbone of the 4-stage DR model, and the SAA exam endlessly varies the question of "which point on the spectrum does the given RTO/RPO/budget point to."

At the root of this framework lies one insight: most of the cost of disaster recovery comes from **"how much of a second environment you keep running in normal times when you won't even use it."** Keep the second region's servers off in normal times (cold) and it's cheap but takes time to turn on (high RTO); keep them on in normal times (hot) and it's expensive but instant (low RTO). DR design is ultimately an economic problem of weighing "how much money the company loses per minute when this workload is down" against "the cost of keeping the second environment hot."

This article follows the internal behavior and cost structure of each of the four stages, where the boundaries between stages get drawn, and how tools like AWS DRS make this spectrum more economical.

## The Stage Boundaries Split When You View "Data" and "Compute" Separately

Don't try to memorize the four stages — decompose them with two questions and the boundaries become crisp. First, **how does data get to the second region in normal times** — is it copied only occasionally via backup, or replicated continuously? Second, **how much compute (app infrastructure) is running in normal times** — completely off, only a minimum up, a scaled-down version running, or full-stack running? The combination of these two axes is the four stages.

| Strategy | Data state | Compute state | RTO | RPO | Cost |
|------|-----------|-----------|-----|-----|------|
| **Backup & Restore** | Periodic backup copy | Off (created after failure) | Hours–days | Minutes–hours | Lowest |
| **Pilot Light** | Continuous replication (DB only) | Core only on, app off | Minutes–tens of minutes | Seconds–minutes | Low |
| **Warm Standby** | Continuous replication | Scaled-down version always on | Minutes | Seconds | High |
| **Multi-Site Active-Active** | Bidirectional replication | Full-stack always on | Near 0 | Near 0 | Highest |

The key point of this table is that **RPO is mainly determined by the data axis, and RTO by the compute axis**. Backup & Restore's RPO is large because data lags by the backup interval (data since yesterday's backup vanishes), and its RTO is large because infrastructure is built only after failure. Pilot Light shrinks RPO to seconds–minutes because it replicates data continuously, and its RTO is still in minutes because the app infrastructure must be turned on and scaled at failure time.

> 💡 **Related theory**: This spectrum is a variation on computer science's classic trade-off of **space (or cost) vs. time**. Just as caching "uses more memory to reduce compute time," DR "spends more money on idle infrastructure to reduce recovery time." Warm Standby is a kind of "warm cache" — not used often, but pre-warmed so it responds quickly when called. Active-Active is a state where "the cache is actually part of the main path." Which point is optimal is decided by an expected-value calculation comparing **probability of disaster × loss per downtime** against **the cost of maintaining idle infrastructure** — for workloads with large per-minute losses like finance or healthcare, the expensive end of the spectrum is rational; for internal batch systems, the cheap end.

## Backup & Restore: The Cheapest but Slowest Starting Point

Backup & Restore keeps **only backups of data** in the second region and runs no compute infrastructure in normal times. When a disaster hits, you restore volumes from snapshots, build fresh infrastructure with IaC (CloudFormation, etc.), and route traffic over. Normal-time cost is essentially just the backup storage price — the cheapest — but building, booting, and validating infrastructure from scratch takes hours, giving the largest RTO.

The core tools are **Cross-Region snapshot copy** and **AWS Backup**. Copy EBS, RDS, and Aurora snapshots to another region, and you can recover as long as that region is alive. AWS Backup backs up EBS, EFS, RDS, DynamoDB, S3, and more under one policy and automates Cross-Region and Cross-Account copies — and here, regulatory compliance is important.

> 🔍 **Going deeper**: **AWS Backup Vault Lock** locks backups in a **WORM (Write Once, Read Many)** model to prevent tampering and deletion. Why is this decisive in DR? Because the most common modern disaster is not a natural disaster but **ransomware**. Ransomware is terrifying because it encrypts data and then hunts down and erases backups to block recovery, but Vault Lock's Compliance mode makes it so that not even the root user can delete a backup within the retention period. This is a control that satisfies NIST's backup guidance and the financial sector's requirement for "immutable backups." When you see "tamper-proof backups for regulatory compliance" on the exam, Vault Lock is the signal. On top of that, placing backups in a **separate account (Cross-Account)** is also key, because even if the operational account is hijacked, the backups in the backup account survive.

> 📚 **Case study**: In 2014, the code-hosting startup Code Spaces went out of business in a single day. An attacker hijacked the AWS console credentials and got in, and when the company refused to negotiate, they **deleted all of the EC2 instances, S3 buckets, EBS snapshots, and backups**. Because the backups were in the same account and under the same controls as production, the same hand that erased production erased the backups too. The lesson is clear — **a backup inside the same trust boundary as production isn't a real backup**. Today's correct answer is triple isolation: Cross-Account + Cross-Region + Vault Lock (immutable). DR must assume not only natural disasters but malicious deletion and insider threats.

## Pilot Light: Keep Only the Pilot Flame Lit

Pilot Light takes its name from a gas stove's ignition flame. **Data is replicated continuously** (RDS Read Replica, DynamoDB Global Tables, S3 CRR), but compute like app servers is **kept off or minimal**. When a failure hits, you quickly turn on and scale the app infrastructure on top of the already-current data and take traffic. Because data is always current, RPO is small (seconds–minutes), and because you only need to turn on the app, RTO is much shorter than Backup & Restore — minutes to tens of minutes.

Here **AWS Elastic Disaster Recovery (DRS, formerly CloudEndure)** makes Pilot Light even more economical. DRS replicates the source server's disks **in real time at the block level** and keeps them in a low-cost staging area in the target region — in normal times only small replication servers run, keeping cost low, but on failure it boots full EC2 instances from that data within minutes. In other words, it's a tool that automates Pilot Light's cost-speed balance by "replicating data hot but keeping compute cold."

> ⚠️ **Pitfall**: You must know exactly where the boundary between Pilot Light and Warm Standby lies. Both replicate data continuously, but their **compute states differ** — Pilot Light has app servers **off** (or truly minimal), so failover incurs the time to turn on and scale, whereas Warm Standby has a **scaled-down full stack always on**, so you only need to scale up, making it faster. When you see "the DB is replicating but the app is off," it's Pilot Light; when you see "a scaled-down environment is always up and able to take traffic," it's Warm Standby. If you want to shrink RTO further (to minutes), pay more and climb to Warm Standby.

## Warm Standby and Active-Active: The Hot End

**Warm Standby** keeps a **scaled-down full stack** always on in the second region — every tier (load balancer, app, DB) works but runs at minimum capacity. On failure, you switch traffic and grow capacity with Auto Scaling. Since you only need to turn on and scale up, RTO is short (minutes), but you pay to run the scaled-down version even in normal times. It's regarded as the most practical DR stage in the sense that "it's barely used until right before a disaster but pre-warmed to take traffic instantly."

**Multi-Site Active-Active** has both regions **taking traffic simultaneously as full stacks**. Data is bidirectionally synchronized with Aurora Global Database or DynamoDB Global Tables, and traffic flows via Route 53 Latency or Failover. Even if one region dies, the other is already taking traffic, so RTO and RPO are near 0. In exchange you pay the complexity of maintaining bidirectional data consistency and double the infrastructure cost — the most expensive and fastest end of the spectrum.

> 🔍 **Going deeper**: In Active-Active and Warm Standby, **how you switch traffic** is the last variable of RTO. Simple Route 53 Health Check + Failover takes tens of seconds to minutes to detect a health-check failure and change DNS, and it gets slower when client DNS caching piles on. So AWS released **Route 53 Application Recovery Controller (ARC)** — a panel where an operator instantly switches "100% traffic to this region, 0% to that region" via **explicit routing controls** without relying on health checks. ARC runs as a highly available cluster spanning 5 regions, designed so "the failover control itself stays alive even during a failure" — an implementation of the earlier principle that "a recovery tool must not share fate with the failure." ARC's **Readiness Check** also continuously verifies whether the secondary region is truly ready to take traffic (capacity, quotas, config match), preventing the incident where you fail over only to find the secondary region lacking.

> 📚 **Case study**: By around 2015, Netflix was already running multi-region Active-Active and validated resilience with its own chaos engineering tools, **Chaos Monkey/Kong**, deliberately killing instances and regions. The core insight is that "a DR plan is just a hypothesis until you actually trigger it" — many companies have elaborate DR documents yet never rehearse a failover, then fail in a real disaster because the secondary region's config drifted or its quotas were insufficient. So mature organizations regularly hold **Game Days** to run planned failovers, and continuously measure that readiness with AWS Resilience Hub and ARC Readiness Check. "An untested backup isn't a backup, and an unrehearsed DR isn't DR."

## Comparing Other Clouds' DR Models

The 4-stage DR model is AWS-specific terminology, but other clouds solve the same spectrum under different names.

| Dimension | AWS | Azure | GCP |
|------|-----|-------|-----|
| DR orchestration | Elastic Disaster Recovery (DRS) | Azure Site Recovery (ASR) | (partner solutions + native replication) |
| Unified backup | AWS Backup + Vault Lock | Azure Backup + Immutable Vault | Backup and DR Service |
| Global DB Active-Active | Aurora Global, DynamoDB Global Tables | Cosmos DB multi-master | Spanner (global strong consistency) |
| Explicit failover control | Route 53 ARC | Traffic Manager + ASR recovery plans | Cloud DNS routing policies |

Azure's **Site Recovery (ASR)** maps most directly to AWS DRS — both are block-level-replication-based Pilot Light/Warm Standby automation. Both AWS and Azure provide **immutable backup vaults (Vault Lock / Immutable Vault)**, showing that the ransomware threat has become a shared design priority across cloud providers. GCP leans more toward "an architecture that doesn't need DR" via Spanner's global consistency rather than a dedicated DR orchestrator.

## Getting Hands-On with the CLI

```bash
# AWS Backup plan: daily backup + 30-day retention
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName":"saa-dr-plan",
  "Rules":[{
    "RuleName":"daily","TargetBackupVaultName":"Default",
    "ScheduleExpression":"cron(0 5 ? * * *)",
    "Lifecycle":{"DeleteAfterDays":30},
    "CopyActions":[{"DestinationBackupVaultArn":"arn:aws:backup:us-east-1:...:backup-vault:dr"}]
  }]
}'

# Backup vault lock (WORM, tamper-proof) — ransomware defense
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name dr --min-retention-days 30 --changeable-for-days 3

# Cross-Region copy of an RDS snapshot (Backup & Restore)
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:ap-northeast-2:...:snapshot:orders-snap \
  --target-db-snapshot-identifier orders-dr --source-region ap-northeast-2 \
  --region us-east-1

# Check DRS source server replication state (Pilot Light)
aws drs describe-source-servers

# Switch a Route 53 ARC routing control (explicit failover)
aws route53-recovery-cluster update-routing-control-state \
  --routing-control-arn arn:... --routing-control-state On
```

## Wrapping Up

The 4-stage DR model isn't four separate technologies but **four points on one spectrum where recovery speed and cost are directly proportional**. ① **Backup & Restore** backs up only data and creates compute after failure — cheapest and slowest — and isolates even ransomware and insider threats with Cross-Region, Cross-Account, and Vault Lock. ② **Pilot Light** replicates data continuously but keeps the app off, and DRS automates this economically. ③ **Warm Standby** keeps a scaled-down full stack always on to shrink RTO to minutes. ④ **Active-Active** has both sides taking traffic simultaneously for near-0 RTO/RPO but pays double cost and consistency complexity. RPO is set by the data replication method, RTO by compute readiness and traffic switching (Route 53 ARC), and the exam asks for the ability to map a given RTO/RPO/budget onto a point on the spectrum.

In the next article, we'll look at the last kilometer of this failover — **traffic routing** — and how Route 53's routing policies, Health Checks, Alias, Private Hosted Zone, and DNSSEC safely steer global traffic.

---

## 📝 연습 문제

**문제 1.** A company is designing DR for an internal analytics system. It tolerates an RTO of 8 hours and RPO of 4 hours, and must minimize cost. What is the most appropriate strategy?

A) Multi-Site Active-Active
B) Warm Standby
C) Pilot Light
D) Backup & Restore

**정답: D**

해설: A loose target of RTO 8 hours and RPO 4 hours is well served by the cheapest Backup & Restore — copy periodic backups to another region and rebuild infrastructure on failure. Active-Active (A) and Warm Standby (B) are high-cost options for minute-scale RTO and are overkill when 8 hours is allowed, and Pilot Light (C) also incurs continuous-replication cost, but with an RPO of 4 hours that hot data is unnecessary. The key is "loose RTO/RPO + minimum cost = the lowest stage." Resilience exceeding the requirement is a waste.

---

**문제 2.** A financial firm requires, for regulatory compliance, that backups be tamper-proof so that **not even the root user can delete them** within the retention period. What is the appropriate control?

A) Deny deletion with an S3 bucket policy
B) AWS Backup Vault Lock (Compliance mode)
C) Restrict backup deletion with an IAM policy
D) MFA Delete

**정답: B**

해설: AWS Backup Vault Lock's Compliance mode locks backups as WORM so that **not even the root user can delete or alter them** within the retention period, satisfying regulatory and ransomware-defense requirements for immutable backups. An S3 bucket policy (A) or IAM policy (C) can be changed or bypassed by a privileged principal (especially root), so they can't meet the "not even root" requirement. MFA Delete (D) only requires MFA to delete S3 objects — it's not immutability that enforces retention. "Tamper-proof, not even root can delete" = Vault Lock.

---

**문제 3.** An architect wants to lower DR cost while keeping RTO in minutes. Which AWS service automates the approach of replicating data continuously but keeping app servers off in normal times and booting them quickly on failure?

A) AWS Backup
B) AWS Elastic Disaster Recovery (DRS)
C) AWS DataSync
D) AWS Storage Gateway

**정답: B**

해설: AWS DRS replicates source servers in real time at the block level and keeps them in low-cost staging, then boots EC2 in minutes on failure — a service that economically automates Pilot Light. AWS Backup (A) is a backup/restore centralization tool, not real-time block replication; DataSync (C) is online file transfer; and Storage Gateway (D) is a hybrid storage cache, not DR orchestration. "Data hot-replicated, compute cold, minute-scale RTO" = DRS.

---

**문제 4.** A team wants to keep a **scaled-down full stack** always on in the secondary region and recover within minutes on failure by only scaling up and switching traffic. What is this strategy?

A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**정답: C**

해설: Having every tier always up at minimum capacity and only needing to scale up on failure is the definition of Warm Standby, with an RTO of minutes. Pilot Light (B) has app servers off, so it takes extra time to turn them on; Backup & Restore (A) builds infrastructure from scratch and takes hours–days; and Active-Active (D) has the secondary region taking traffic at full capacity even in normal times, so it isn't a "scaled-down version." "Scaled-down full stack always running + scale up" = Warm Standby. The difference from Pilot Light is whether the app is on.

---

**문제 5.** A company runs multi-region Active-Active and wants, on failover, to switch traffic between regions instantly and **explicitly by an operator without relying on health checks**, while continuously verifying the secondary region's readiness. What is the appropriate tool?

A) Route 53 Failover policy alone
B) Route 53 Application Recovery Controller (ARC)
C) CloudWatch Alarm
D) Auto Scaling

**정답: B**

해설: Route 53 ARC lets an operator instantly switch "100%/0% region traffic" via routing controls without relying on health checks, and continuously verifies the secondary region's capacity, quota, and config readiness with Readiness Check. It also runs as a 5-region cluster so control stays alive even during a failure. A Failover policy alone (A) is health-check-based, so it has detection/propagation delay and isn't explicit control, and CloudWatch Alarm (C) and Auto Scaling (D) are not failover routing-control tools. "Explicit, health-check-independent failover + readiness verification" = ARC.

---

**문제 6.** A startup's operational account is hijacked and the attacker tries to delete EC2, S3, and snapshots. What is the most robust design to protect backups from such malicious deletion?

A) Store backups more frequently in the same account
B) Triple isolation: Cross-Account + Cross-Region + Vault Lock (immutable)
C) Create more EBS snapshots
D) Strengthen the IAM user's password

**정답: B**

해설: If a backup is inside the same trust boundary as production (account, region, controls), the hand that erased production erases the backup too (the 2014 Code Spaces case). Placing it in a separate account (Cross-Account) separates permissions even if the operational account is hijacked, placing it in another region (Cross-Region) separates it from regional failure, and Vault Lock (immutable) blocks deletion itself within the retention period. A and C are in the same account and can be deleted along with it, and D can't stop a situation where credentials are already hijacked. DR must assume malicious deletion and insider threats too.

---

**문제 7.** An organization has an elaborate DR document but has never actually executed a failover. What practice reduces the risk that, in a real disaster, the secondary region's config/quotas are insufficient and recovery fails?

A) Write the DR document in more detail
B) Regular Game Days (planned failover rehearsals) + continuously measuring readiness with Resilience Hub/ARC Readiness Check
C) Increase the backup frequency
D) Simplify to a single region

**정답: B**

해설: A DR plan is just a hypothesis until you actually trigger it, so you must run planned failovers via regular Game Days to validate the secondary region's config, quotas, and consistency. Resilience Hub scores resilience and ARC Readiness Check continuously verifies the secondary region's readiness, preventing the "turned out to be lacking when we actually failed over" incident. A only grows the document, not the validation; C affects only RPO; and D heads toward abandoning DR altogether. "An unrehearsed DR isn't DR."

---

## 📌 Key Takeaways

The 4-stage DR model is four points on one spectrum where recovery speed and cost are directly proportional. Backup & Restore backs up only data and creates compute after failure — cheapest and slowest — and isolates even ransomware and insider deletion with Cross-Account, Cross-Region, and Vault Lock (immutable) (the Code Spaces lesson). Pilot Light replicates data continuously but keeps the app off, and DRS automates it. Warm Standby runs a scaled-down full stack around the clock to shrink RTO to minutes, and Active-Active buys near-0 RTO/RPO — both sides taking traffic simultaneously — at double cost. RPO is set by the data replication method, RTO by compute readiness and traffic switching (Route 53 ARC's explicit control and Readiness Check). The exam asks you to map RTO/RPO/budget onto a point on the spectrum, and asks about "an unrehearsed DR isn't DR."
