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

**문제 1.** 한 워크로드가 "RTO 5분, RPO 초~분, 비용은 중간 수준 허용"으로 요구된다. 환경이 평소에도 떠 있어 페일오버 경로가 항상 검증된 상태여야 한다. 가장 적합한 DR 전략은?

A) Backup & Restore

B) Warm Standby — 축소된 환경을 상시 가동, 페일오버 시 트래픽 전환 + Auto Scaling 확장

C) Pilot Light

D) Multi-Site Active-Active

**정답: B**

해설: Warm Standby는 DR 리전에 운영 환경의 축소판을 항상 떠 있게 둬 RTO를 분 단위로, RPO를 초~분으로 만든다(DB 실시간 복제). 환경이 평소에도 살아 트래픽(헬스 체크·일부 read)을 처리하므로 페일오버 경로가 항상 "검증된(warm)" 상태라는 게 핵심 — "사용 안 되는 경로는 부패한다"는 위험을 막는 static stability 사상이다. Backup & Restore(A)는 RTO가 시간 단위라 너무 느리고, Pilot Light(C)는 앱 tier가 꺼져 있어 경로가 미검증이며 RTO도 더 길고, Active-Active(D)는 RTO 0이지만 비용이 최고라 "중간 비용"과 안 맞는다.

---

**문제 2.** Pilot Light DR 전략의 가장 흔한 운영 위험과 그 완화책은?

A) 비용이 너무 높다 — 인스턴스 타입을 줄인다

B) 앱 tier를 꺼두는 동안 그 환경이 실제로 부팅·동작 가능한지 검증되지 않아, 정작 장애 때 실패할 수 있다 — 정기 DR drill로 발동 경로를 검증

C) 데이터가 복제되지 않는다 — Read Replica를 추가

D) Route 53이 페일오버를 지원하지 않는다

**정답: B**

해설: Pilot Light는 데이터 계층(Read Replica + AMI)만 상시 살리고 앱 tier(ASG desired=0)는 꺼둔다. 그래서 그 앱 환경이 실제로 뜰 수 있는지 — AMI가 부팅되는지, IAM/보안 그룹이 맞는지 — 가 평소에 검증되지 않아, 정작 장애 때 처음 띄우다 실패하는 게 가장 흔한 위험이다. 완화책은 정기 DR drill(분기/월)로 "불씨에 불이 붙는지"를 반복 검증하는 것이며, 발동 절차를 Step Functions/SSM Runbook으로 코드화하면 검증이 쉬워진다. 비용(A)은 Pilot Light의 장점이지 위험이 아니고, 데이터는 Read Replica로 복제 중(C)이며, Route 53은 페일오버를 지원한다(D).

---

**문제 3.** Multi-Site Active-Active를 설계할 때, 두 리전이 평소 트래픽을 50:50으로 처리한다. 용량 계획에서 반드시 검증해야 할 핵심은?

A) 각 리전을 평소 부하인 50% 용량으로만 잡으면 된다

B) 한 리전이 죽으면 남은 리전이 100%를 받아야 하므로, 각 리전을 "장애 시 전체 트래픽을 감당할 용량"으로 잡아야 한다(아니면 페일오버 직후 cascading failure)

C) 용량 계획은 불필요하다 — Auto Scaling이 알아서 한다

D) 두 리전 합쳐 100% 용량이면 충분하다

**정답: B**

해설: Active-Active에서 한 리전이 죽으면 남은 리전이 트래픽의 100%를 받아야 한다. 각 리전을 평소 부하인 50%로만 잡으면(A·D), 페일오버 직후 남은 리전이 2배 부하에 과부하로 함께 무너지는 cascading failure가 난다. 따라서 각 리전을 "혼자서도 전체 트래픽을 감당할 용량"으로 설계해야 한다 — 이것이 Active-Active 비용이 단순 2배 이상으로 비싼 이유이기도 하다. Auto Scaling(C)이 보조하지만 급격한 2배 스파이크를 즉시 흡수하지 못할 수 있어, 기본 용량 자체를 충분히 잡는 게 안전하다(static stability).

---

**문제 4.** 랜섬웨어 공격자가 운영 권한을 탈취해 백업까지 삭제하려 한다. 규제 준수로 보존 기간 내에는 root조차 백업을 삭제할 수 없게 만들려면?

A) AWS Backup Vault Lock을 Governance Mode로 설정

B) AWS Backup Vault Lock을 Compliance Mode로 설정 — WORM 불변, 보존 기간 내 누구도(root 포함) 삭제 불가

C) 백업 볼트에 IAM 정책으로 삭제 거부

D) 백업을 더 자주 수행

**정답: B**

해설: Backup Vault Lock의 Compliance Mode는 WORM(Write Once Read Many) 원칙을 구현해, 보존 기간 내에는 root를 포함 누구도 백업을 삭제·변경할 수 없는 진짜 불변 상태를 만든다 — 랜섬웨어의 "백업부터 삭제" 전술에 대한 마지막 보루다(S3 Object Lock Compliance Mode, SEC 17a-4 규제 스토리지와 같은 사상). Governance Mode(A)는 특정 IAM 권한자가 우회·삭제 가능해 "실수 방지" 수준이라 규제·랜섬웨어 방어엔 부족하다. IAM 거부(C)는 권한 탈취 시 변경될 수 있고, 자주 백업(D)해도 삭제되면 무용지물이다.

---

**문제 5.** 비용을 최소화해야 하는 Tier 3 워크로드인데, 전체 인프라가 CloudFormation으로 코드화돼 있다. 가장 적합한 DR 전략과 그 RTO 특성은?

A) Active-Active — 항상 빠르게

B) Backup & Restore — DR 리전에 아무것도 안 켜 비용 최소, 장애 시 IaC로 스택 배포 + 백업 복원을 자동화하면 RTO를 한두 시간으로 단축 가능

C) Warm Standby — 축소 환경 상시

D) Pilot Light — DB만 상시

**정답: B**

해설: Tier 3 비중요 워크로드에서 비용 최소화가 우선이면 Backup & Restore가 정답이다 — DR 리전에 인프라를 전혀 켜두지 않아 가장 싸다. 과거엔 RTO가 며칠이었지만, 전체 인프라가 IaC(CloudFormation/Terraform)로 코드화돼 있으면 "스택 배포 → 백업 복원"을 자동화해 RTO를 한두 시간으로 줄일 수 있다(불변 인프라 사상 — 데이터+코드만 있으면 재현 가능). Active-Active(A)·Warm Standby(C)·Pilot Light(D)는 모두 평소 인프라를 켜둬 비용이 더 들어 "비용 최소화"와 맞지 않는다.

---

**문제 6.** AWS Backup에서 새로 만든 리소스가 백업 정책에 누락되는 일을 사람이 잊지 않고 자동으로 방지하려 한다. 표준 방법은?

A) 리소스를 하나씩 백업 selection에 수동 등록

B) 태그 기반 선택(예: Backup=prod 태그) — 새 리소스가 그 태그를 다는 순간 자동으로 백업 정책 대상이 됨(정책 기반 거버넌스)

C) 매일 사람이 리소스 목록을 점검

D) Backup을 비활성화

**정답: B**

해설: AWS Backup은 태그 기반 선택을 지원해, "Backup=prod 태그가 붙은 모든 리소스를 백업"이라는 선언적 정책을 두면 새 리소스가 그 태그를 다는 순간 자동으로 백업 대상이 된다. 이는 명령형(하나씩 등록, A·C)이 아니라 정책 기반 관리로, Kubernetes 라벨 셀렉터·IAM ABAC와 같은 사상이다 — 개발자가 백업 등록을 잊어도 태그 정책이 안전망이 된다. 거버넌스를 "사람이 빠뜨리지 않는" 방향으로 자동화하는 것이 핵심이다.

---

**문제 7.** DR 발동 절차(Read Replica promote → ASG 확장 → Route 53 페일오버)를 사람의 수동 콘솔 작업이 아니라 반복 검증 가능한 형태로 만들려 한다. 가장 적합한 것은?

A) 운영 매뉴얼 문서(위키)에 단계를 적어 둔다

B) Step Functions 워크플로 또는 SSM Automation Runbook으로 발동 절차를 코드화 — 정기 DR drill로 반복 검증해 경로 부패를 방지

C) 장애 시 엔지니어가 기억에 의존해 수동 실행

D) Lambda 하나에 모든 로직을 하드코딩하고 테스트하지 않는다

**정답: B**

해설: DR 발동을 Step Functions 워크플로나 SSM Automation Runbook으로 코드화하면, 절차가 결정적·재현 가능해지고 정기 DR drill로 반복 검증할 수 있다 — 이것이 Pilot Light/Warm Standby의 "사용 안 되는 페일오버 경로는 부패한다"는 위험을 막는 핵심이다. 위키 문서(A)나 기억 의존(C)은 장애 시 실수·누락을 부르고, 검증 안 된 Lambda(D)는 정작 발동 때 실패할 수 있다. DR은 "문서로 있다"가 아니라 "코드로 정기 검증된다"여야 신뢰할 수 있다.

---

## 📌 오늘의 요약

오늘 본 핵심은 네 가지다. 첫째, DR은 "얼마나 빨리"가 아니라 BIA(비즈니스 영향 분석)로 RTO/RPO를 정하고 비용과 저울질하는 경제 문제이며(ISO 22301), 4 전략은 그 매핑 테이블이다. 둘째, 네 전략은 "평소에 얼마나 켜두느냐"의 스펙트럼 — Backup & Restore(아무것도 안 켬, 가장 싸고 느리지만 IaC면 한두 시간으로 단축) → Pilot Light(데이터만 상시·앱 꺼둠, 경로 미검증 위험) → Warm Standby(축소판 상시·경로 검증됨) → Active-Active(풀 용량 둘 다·RTO 0이나 비싸고 충돌·"절반 죽어도 전부 받는" 용량 계획 필요)다. 셋째, AWS Backup이 태그 기반 정책 거버넌스로 백업을 통합하고 Cross-Region/Account Copy로 재해·계정 침해를 양쪽 방어한다. 넷째, Vault Lock Compliance Mode가 WORM 불변 백업으로 랜섬웨어의 "백업부터 삭제"를 막는 마지막 보루이며(Colonial Pipeline 교훈), DR 발동은 Step Functions/SSM Runbook으로 코드화해 정기 drill로 검증해야 한다.
