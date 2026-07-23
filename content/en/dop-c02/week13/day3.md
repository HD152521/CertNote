# Day 3 - Four DR Strategies: Tradeoffs of RTO, RPO, Cost and Their Economics

A common pitfall in designing Disaster Recovery for the first time is the ambition: "make recovery as fast as possible." But applying RTO=0 (instant recovery) to every workload explodes costs—you'd need identical infrastructure running in two regions permanently. The real skill in DR isn't "how fast" but **"if this workload stops, how much do we lose per minute?", then weighing that against cost to pick the right point**. A payments system might lose millions per minute, making RTO=0 worth buying; an internal analytics dashboard down for half a day is just a postponed meeting, so the cheapest backup-restore strategy suffices.

AWS standardized this tradeoff into four strategies: **Backup & Restore, Pilot Light, Warm Standby, Multi-Site Active-Active.** These four are points on three axes—RTO (how fast), RPO (how little data lost), and cost—and moving left-to-right, you get faster and safer but pricier. Today we examine what economic logic each strategy rests on, which AWS service implements it, and how to make backups themselves immutable to even stop ransomware.

DR strategy appears in almost every DOP exam—"RTO 5 min, RPO seconds, mid-range cost: which strategy?", "block ransomware from encrypting backups too?", "automate Pilot Light failover?" The key is reading scenario numbers (RTO/RPO) and cost constraints, mapping to one of the four points.

## RTO and RPO—Two Axes Defining DR

All DR discussion begins with two numbers. **RTO (Recovery Time Objective)** is "allowed time from failure to recovery complete"—how fast must we be back? **RPO (Recovery Point Objective)** is "time window of acceptable data loss"—how recent must the last backup/replica be?

```
        Past ────────────────[Failure]──────────────→ Now
              │←─ RPO ─→│              │←─ RTO ─→│
         Last safe point     Failure occurs   Recovery complete
       (acceptable data loss)     (tolerable downtime)
```

RPO is determined by replication frequency (daily backup = 24h RPO; real-time replication = seconds RPO). RTO is determined by how much standby infrastructure you pre-run. Both shrink with cost—RPO shrinks by replicating more often/in real-time; RTO shrinks by pre-running more standby infrastructure.

> 💡 **Related Theory**: RTO/RPO originate from 1970s mainframe-era Business Continuity Planning (BCP), formally defined in ISO 22301 (Business Continuity Management standard). The core insight: "recovery objectives are set by **Business Impact Analysis (BIA)**, not technology." First, ask "if this system stops, how much per hour do we lose, what regulatory/contract violations occur?", then set RTO/RPO and choose technology accordingly. Conversely, applying "the fastest technically possible recovery" to all systems without BIA is burning money—an anti-pattern. AWS's four strategies are a mapping table translating BIA results (workload tiers) into technology.

## Four-Strategy Matrix—Left is Cheap, Right is Fast

| Strategy | RTO | RPO | Relative Cost | Core Structure |
|--------|-----|-----|-----------|-----------|
| **Backup & Restore** | Hours–days | Hours | Low | Only backups kept; provision new environment on failure |
| **Pilot Light** | 10–50 minutes | Minutes | Medium | Data layer always (DB read replica, AMI ready); app tier off |
| **Warm Standby** | Minutes | Seconds–minutes | High | Scaled-down replica always running; expand on failover |
| **Multi-Site Active-Active** | ~0 | ~0 | Highest | Both regions handle production traffic simultaneously |

One principle cuts through all rows: **"how much you keep running normally determines both RTO and cost."** Keep nothing running (Backup & Restore) = cheapest but slowest (must build everything on failure). Keep everything running (Active-Active) = instant recovery but expensive. Pilot Light and Warm Standby are two compromise points in between.

## Backup & Restore—Cheapest and Slowest Insurance

Simplest strategy. Regularly back up data (EBS snapshots, RDS backups, AWS Backup) and copy to another region. **In the DR region, run zero infrastructure during normal times.** On failure, provision the infrastructure (via IaC stack deployment) and restore data from backup.

- RTO: Hours to days (build entire environment + restore).
- RPO: Backup interval (daily backup = max 24-hour loss).
- Fit: Tier 3 non-critical workloads; cost minimization priority.

> 🔍 **Deeper**: A modern twist: Backup & Restore is "slow but, if IaC is good, surprisingly fast." Historically, reconstructing DR environment manually took days. With **CloudFormation/Terraform encoding the entire infrastructure**, "stack deploy → backup restore" can automate to hours RTO. This is where IaC meets DR—infrastructure-as-code means "data + code" alone lets you rebuild anytime (immutable infrastructure philosophy). So in exams, "minimize cost while automating recovery via IaC" often makes Backup & Restore the right answer.

## Pilot Light—Keep Just the Spark Burning

The name—Pilot Light, like a gas stove's ignition spark—explains the strategy. In the DR region, **keep data layer alive always** (DB read replica receiving continuous replication, AMI/Launch Template ready), but **shut down app tier** (ASG desired=0). On failure, "light the spark"—promote Read Replica to standalone primary, raise ASG desired capacity to spin up app servers, failover DNS.

```bash
# DR region: Read Replica always replicating (data spark)
aws rds create-db-cluster --replication-source-identifier arn:...:cluster:prod \
  --db-cluster-identifier prod-dr

# App tier off (ASG desired=0)
aws autoscaling create-auto-scaling-group --auto-scaling-group-name prod-dr \
  --min-size 0 --max-size 20 --desired-capacity 0 --launch-template ...

# --- Failover activation (automated Lambda) ---
aws rds promote-read-replica-db-cluster --db-cluster-identifier prod-dr  # Light the spark
aws autoscaling set-desired-capacity --auto-scaling-group-name prod-dr --desired-capacity 4
# Route 53 failover (Day 2)
```

- RTO: App startup time (~10–50 minutes).
- RPO: DB real-time replication, so minutes (or seconds).
- Fit: Tier 2; 30-minute RTO acceptable.

> ⚠️ **Pitfall**: Pilot Light's hidden risk: "**while the app tier is off, nobody verifies it can actually boot**." Old AMI can't start, IAM permissions might be missing, security group misconfigured—all unknown until failure, when you first try to launch and it fails. So Pilot Light *must* be validated via regular DR drills (quarterly/monthly): "does the spark light?" Warm Standby is safer partly because "the scaled-down environment is always running, always validated."

## Warm Standby—Always-On Scaled-Down Replica

Warm Standby keeps a **scaled-down version of production in the DR region, always running** (e.g., 1 ALB + 2 EC2 + DB Replica). Normally it takes no traffic or read-only traffic, but the infrastructure is alive and functioning. On failure, immediately shift traffic here and Auto Scale to full capacity.

- RTO: Minutes (environment already up; just traffic shift + scale).
- RPO: Seconds–minutes (DB real-time replication).
- Fit: Tier 1; RTO 5 minutes.

> 💡 **Related Theory**: The Warm Standby vs. Pilot Light difference is clearest as **"path validation"** presence/absence. Software reliability has a maxim: "unused code paths rot"—failover paths never exercised silently break, then fail when needed. Warm Standby, though scaled down, always runs real traffic (health checks, partial reads), keeping failover paths "warm" and continually validated. This touches AWS Well-Architected's "static stability" principle: on failure, don't start new behavior—let already-validated state keep running. You pay more to reduce "it won't work when we need it" risk.

## Multi-Site Active-Active—Failover is Just Traffic Shift

Most expensive, most instant strategy. **Both regions handle production traffic at full capacity simultaneously.** Replicate data across both regions via Aurora Global / DynamoDB Global Tables; distribute users with Route 53 Latency Routing. If one region dies—there's no separate "failover" operation. Traffic simply shifts to the living region.

- RTO: ~0 (both already handling it; just shift).
- RPO: ~0 (real-time bidirectional replication).
- Fit: Tier 0 mission-critical.

> 🔍 **Deeper**: Active-Active's near-zero RTO is because "there's nothing to recover"—both are alive, so just remove the dead one from the pool. But the costs are three-fold. First, **2x cost** (both regions at full capacity). Second, **data conflicts** (Day 2's multi-leader LWW issue—if both regions write, same-item simultaneous updates collide). Third, **capacity planning trap**—each region normally takes 50% traffic; if one dies, the survivor must take 100%. So each region must be sized for **100% traffic, not 50%** (else the survivor cascades after failover). "Can half the system dying mean the rest absorbs all load?" is the core validation question for Active-Active design.

## AWS Backup—Unify and Centralize Backups

If each service backs up differently (EBS snapshots, RDS native backups, DynamoDB PITR...), management fragments. **AWS Backup** unifies them under one policy and vault. Define schedule, retention, and region-copy in a backup plan; select resources by tags.

```bash
aws backup create-backup-plan --backup-plan '{
  "BackupPlanName":"prod-daily",
  "Rules":[{
    "RuleName":"DailyBackup",
    "TargetBackupVaultName":"prod-vault",
    "ScheduleExpression":"cron(0 5 * * ? *)",
    "Lifecycle":{"DeleteAfterDays":30},
    "CopyActions":[{
      "DestinationBackupVaultArn":"arn:aws:backup:us-east-1:...:backup-vault:dr-vault",
      "Lifecycle":{"DeleteAfterDays":90}
    }]
  }]
}'
```

- Unified support: EBS, EFS, RDS, Aurora, DynamoDB, S3, FSx, Storage Gateway, Neptune, DocumentDB, Redshift, etc.
- Cross-Region Copy + Cross-Account Copy (defend against disaster AND account compromise).
- Tag-based auto-selection (new resource with tag automatically included).

> 💡 **Related Theory**: AWS Backup's tag-based selection is **policy-based management**—not imperative "register each resource one-by-one," but declarative "back up anything tagged Backup=prod," applied instantly when a new resource gets that tag. Same philosophy as Kubernetes label selectors, IAM's tag-based ABAC. Governance becomes "cannot accidentally miss"—if developers forget backup registration, the tag policy is a safety net.

## Backup Vault Lock—Immutable Backups Against Ransomware

Backups are useless if attackers steal admin rights and **delete or encrypt the backups too**. Ransomware's playbook: "delete backups first, then encrypt the main system." **Backup Vault Lock** makes backups **immutable**—once locked, backups cannot be deleted or modified, not even by root, during the retention period.

```bash
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name prod-vault \
  --min-retention-days 30 --max-retention-days 365 \
  --changeable-for-days 3
```

`--changeable-for-days 3` is a **cooling-off period**: you can release the lock within 3 days to fix mistakes, but after that, **Compliance Mode locks completely**—no one can release it.

> 📚 **Case Study**: The 2021 Colonial Pipeline ransomware incident (DarkSide group) shut down about 45% of U.S. East Coast fuel supply for days; the company paid ~$4.4M ransom (some later recovered). One lesson: "if backups live in the same permission boundary, they fall together." WORM (Write Once Read Many)—write once, read many, no modify—based immutable backup is ransomware recovery's last resort. Vault Lock Compliance Mode implements exactly this (same philosophy as S3 Object Lock Compliance Mode, SEC 17a-4 compliance storage). Lesson: backups aren't "there" unless "attackers can't delete them."

> 🔍 **Deeper**: Vault Lock's two modes: **Governance Mode** lets certain IAM-privileged users bypass/delete the lock (mistake prevention level), while **Compliance Mode** makes it unbreakable even by root before retention expires (true immutability, regulatory defense). The distinction separates "prevent accidents" from "defend against regulation and ransomware." In exams, "regulate that backups never delete" = Compliance Mode; "let admins override after approval" = Governance Mode. This same distinction applies to S3 Object Lock.

## Automate DR Activation—Runbook as Code

Manual, console-driven DR activation is slow and error-prone. Encode the activation procedure in **Step Functions workflows or SSM Automation Runbooks**—"promote Read Replica → expand ASG → failover Route 53 → validate alert" in one execution. Coded this way, **regular drills can repeatedly validate**, preventing Pilot Light/Warm Standby's "path rot" risk.

```
DR Runbook (Step Functions)
   ├─ 1. Promote Read Replica → standalone primary
   ├─ 2. ASG set-desired-capacity (0 → N)
   ├─ 3. ALB health check pass wait
   ├─ 4. Route 53 ARC Routing Control switch
   └─ 5. Slack/SNS notify + Resilience Hub validate
```

## Closing Thoughts

Four pictures emerge today. First, **DR is not "how fast" but an economics problem: BIA defines RTO/RPO, weighed against cost** (ISO 22301); the four strategies are a mapping table. Second, **the four strategies are a spectrum of "keep running normally"**: Backup & Restore (nothing; cheapest/slowest, but IaC speeds it up) → Pilot Light (data only, app off) → Warm Standby (scaled-down replica always, path validated) → Active-Active (full capacity both, RTO≈0, expensive, conflict/capacity-planning challenges). Third, **AWS Backup unifies backups via tag-based policy governance** and Cross-Region/Account Copy defends against disaster AND account compromise. Fourth, **Vault Lock Compliance Mode's WORM-immutable backups block ransomware's "delete backups first" tactic** (Colonial Pipeline lesson); DR activation must be code-driven (Step Functions/SSM Runbooks) and periodically validated via drills.

Next, we verify these DR strategies actually work: **Resilience Hub measures RTO/RPO, and FIS automates chaos engineering** to test failover repeatedly.

---

## 📝 연습 문제

**문제 1.** A workload requires "RTO 5 minutes, RPO seconds to minutes, medium cost acceptable." The environment must be running in normal times so the failover path is always validated. Which DR strategy fits best?

A) Backup & Restore

B) Warm Standby — a scaled-down environment running at all times, with traffic shift plus Auto Scaling expansion on failover

C) Pilot Light

D) Multi-Site Active-Active

**정답: B**

해설: Warm Standby keeps a scaled-down copy of production always running in the DR region, giving an RTO in minutes and an RPO of seconds to minutes (real-time DB replication). The key point is that the environment is alive and handling traffic (health checks, some reads) in normal times, so the failover path is always "warm" and validated — the static stability idea that guards against the risk that "unused paths rot." Backup & Restore (A) has an RTO measured in hours, far too slow; Pilot Light (C) leaves the app tier off so the path is unvalidated and RTO is longer; Active-Active (D) gives RTO 0 but costs the most, which conflicts with "medium cost."

---

**문제 2.** What is the most common operational risk of the Pilot Light DR strategy, and how do you mitigate it?

A) The cost is too high — reduce the instance types

B) While the app tier is shut down, nobody verifies that the environment can actually boot and function, so it may fail exactly when a disaster hits — mitigate with regular DR drills that exercise the activation path

C) Data is not replicated — add a Read Replica

D) Route 53 does not support failover

**정답: B**

해설: Pilot Light keeps only the data layer (Read Replica + AMI) alive at all times and shuts down the app tier (ASG desired=0). As a result, whether that app environment can actually come up — whether the AMI boots, whether IAM and security groups are correct — goes unverified in normal times, and failing on the first launch attempt during a real disaster is the most common risk. The mitigation is repeatedly verifying "does the pilot light ignite?" through regular DR drills (quarterly/monthly), and coding the activation procedure as a Step Functions/SSM Runbook makes that verification easy. Cost (A) is Pilot Light's advantage, not a risk; data is being replicated by the Read Replica (C); and Route 53 does support failover (D).

---

**문제 3.** When designing Multi-Site Active-Active, two regions each handle 50% of normal traffic. What must you verify in capacity planning?

A) Sizing each region at only the 50% normal load is enough

B) If one region dies the survivor must take 100%, so each region must be sized for "the capacity to absorb the entire traffic during a failure" (otherwise cascading failure right after failover)

C) Capacity planning is unnecessary — Auto Scaling handles it

D) 100% capacity across the two regions combined is sufficient

**정답: B**

해설: In Active-Active, if one region dies the remaining region must take 100% of the traffic. Sizing each region at only the 50% normal load (A and D) means that right after failover the survivor is overloaded with double the traffic and collapses too — a cascading failure. Each region must therefore be designed with "the capacity to carry the entire traffic on its own," which is also why Active-Active costs more than a simple 2x. Auto Scaling (C) helps, but it may not absorb a sudden 2x spike instantly, so provisioning enough base capacity is the safe choice (static stability).

---

**문제 4.** A ransomware attacker has seized operational privileges and is trying to delete the backups too. For regulatory compliance, you need to make it impossible for even root to delete backups within the retention period. What do you do?

A) Configure AWS Backup Vault Lock in Governance Mode

B) Configure AWS Backup Vault Lock in Compliance Mode — WORM immutability, deletion impossible for anyone (including root) within the retention period

C) Deny deletion on the backup vault with an IAM policy

D) Take backups more frequently

**정답: B**

해설: Backup Vault Lock's Compliance Mode implements the WORM (Write Once Read Many) principle, creating true immutability where no one — root included — can delete or modify backups within the retention period; it is the last line of defense against ransomware's "delete the backups first" tactic (the same philosophy as S3 Object Lock Compliance Mode and SEC 17a-4 compliance storage). Governance Mode (A) lets certain IAM-privileged users bypass and delete, which is a "mistake prevention" level and insufficient for regulatory or ransomware defense. An IAM deny (C) can be changed once privileges are stolen, and frequent backups (D) are useless if they get deleted.

---

**문제 5.** You have a Tier 3 workload where cost must be minimized, and the entire infrastructure is codified in CloudFormation. Which DR strategy fits best, and what are its RTO characteristics?

A) Active-Active — always fast

B) Backup & Restore — nothing running in the DR region for minimum cost, and automating "stack deploy + backup restore" with IaC on failure can cut RTO down to an hour or two

C) Warm Standby — scaled-down environment always on

D) Pilot Light — only the DB always on

**정답: B**

해설: For a Tier 3 non-critical workload where cost minimization comes first, Backup & Restore is the answer — nothing at all runs in the DR region, making it the cheapest. RTO used to be measured in days, but when the whole infrastructure is codified as IaC (CloudFormation/Terraform), automating "stack deploy → backup restore" can shrink RTO to an hour or two (the immutable infrastructure idea — data plus code is enough to reproduce the environment). Active-Active (A), Warm Standby (C), and Pilot Light (D) all keep infrastructure running in normal times and cost more, conflicting with "minimize cost."

---

**문제 6.** You want to automatically prevent newly created resources from being left out of the backup policy, without relying on people to remember. What is the standard method?

A) Registering resources one by one in the backup selection manually

B) Tag-based selection (e.g., a Backup=prod tag) — the moment a new resource carries that tag it automatically falls under the backup policy (policy-based governance)

C) Having a person review the resource list every day

D) Disabling Backup

**정답: B**

해설: AWS Backup supports tag-based selection, so a declarative policy of "back up every resource carrying the Backup=prod tag" makes a new resource a backup target the moment it gets that tag. This is policy-based management rather than an imperative one-by-one registration (A and C), the same philosophy as Kubernetes label selectors and IAM ABAC — even if a developer forgets to register a backup, the tag policy is a safety net. The key is automating governance in the direction of "people cannot accidentally miss things."

---

**문제 7.** You want the DR activation procedure (promote Read Replica → expand ASG → Route 53 failover) to be repeatedly verifiable rather than a manual console operation. Which is most appropriate?

A) Writing the steps down in an operations manual (wiki)

B) Codifying the activation procedure as a Step Functions workflow or SSM Automation Runbook — repeatedly verified through regular DR drills to prevent path rot

C) Having an engineer execute it manually from memory during a failure

D) Hardcoding all logic into a single Lambda and never testing it

**정답: B**

해설: Codifying DR activation as a Step Functions workflow or SSM Automation Runbook makes the procedure deterministic and reproducible and lets you verify it repeatedly through regular DR drills — this is the core defense against the Pilot Light/Warm Standby risk that "an unused failover path rots." A wiki document (A) or reliance on memory (C) invites mistakes and omissions during a failure, and an untested Lambda (D) can fail exactly when it is triggered. DR is trustworthy only when it is "regularly verified as code," not merely "written down in a document."

---

## 📌 Today's Summary

Four pictures emerge from today. First, DR is not a question of "how fast" but an economics problem — set RTO/RPO through BIA (business impact analysis) and weigh them against cost (ISO 22301) — and the four strategies are that mapping table. Second, the four strategies are a spectrum of "how much you keep running in normal times": Backup & Restore (nothing running, cheapest and slowest, but IaC cuts it to an hour or two) → Pilot Light (data only, app off, unvalidated-path risk) → Warm Standby (scaled-down copy always on, path validated) → Active-Active (full capacity in both, RTO 0 but expensive, with conflicts and the "survive with all traffic when half dies" capacity planning requirement). Third, AWS Backup unifies backups through tag-based policy governance, and Cross-Region/Account Copy defends against both disaster and account compromise. Fourth, Vault Lock Compliance Mode's WORM-immutable backups are the last line of defense against ransomware's "delete the backups first" tactic (the Colonial Pipeline lesson), and DR activation must be codified with Step Functions/SSM Runbooks and verified through regular drills.
