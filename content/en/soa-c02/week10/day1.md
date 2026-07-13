# Day 1 - EBS Snapshot: How Incremental Backup Remembers Only Changed Blocks

The naive definition of backup is "copy all data again in one go." But if you copy a 1TB volume every hour, you accumulate 24TB a day, 720TB a month. That's not backup—it's a cost bomb. EBS Snapshot is clever because it abandons this naive definition and adopts an **incremental** model: "record only the blocks that changed since the last backup." The first snapshot is full-sized, but every subsequent one only stores changes. Even a 1TB volume, if only 10GB changes daily, the second snapshot uses only 10GB.

Every characteristic of EBS Snapshot derives from this single design decision. Why can you delete one snapshot and others remain intact? Why does deleting an AMI not delete the snapshot? Why is the first IO on a new volume slow? Why does the cost work counterintuitively?—all explained by following the principle "remember only changed blocks."

## Snapshots Are Not Files but Sets of Block Pointers—Inside Incremental Backup

The statement "EBS Snapshot is stored in S3" is true but misleading. A file like `snapshot.img` isn't placed in a user-visible S3 bucket. EBS manages volumes as fixed-size **blocks** (typically 512KiB units) and a snapshot exists as a **set of pointers to those blocks + metadata (manifest)**. Block data is stored in S3-based storage operated internally by AWS, and each snapshot holds only a "map" stating "at this point in time, my volume's state is this combination of blocks."

When you create the first snapshot, all occupied blocks in the volume are copied to backup storage, and the snapshot manifest points to all those blocks. An hour later when you create the second snapshot, EBS copies only the **newly changed blocks** (those with dirty bits set). For unchanged blocks, **the second manifest simply points to the blocks already stored by the first snapshot.** The same block isn't stored twice. This is the essence of incremental backup and also means snapshots **share** blocks.

```
Volume blocks:   [A][B][C][D][E]   (5 blocks)

Snapshot 1 (full):
   Stored:  A1 B1 C1 D1 E1  (all 5 blocks stored)
   Manifest → A1 B1 C1 D1 E1

(Blocks C and E change)

Snapshot 2 (incremental):
   Stored:  C2 E2  (only 2 changed blocks stored)
   Manifest → A1 B1 C2 D1 E2
                ↑  ↑     ↑
                Reuse blocks from Snapshot1
```

Here emerges the most common misunderstanding: "If I delete Snapshot 1, doesn't Snapshot 2 break?" No, it doesn't. When you delete a snapshot, EBS **deletes only blocks no other snapshot references.** Deleting Snapshot 1 keeps A1, B1, D1 alive because Snapshot 2 still references them; only C1 and E1, which Snapshot 1 alone owned, are removed. To the user, each snapshot appears as an independent full backup, but internally it's a pointer graph sharing blocks.

> 💡 **Related Theory**: This block-sharing structure is identical to the **persistent data structure** concept from functional programming. When adding an element to a list, instead of copying everything, only the changed part is rebuilt while the rest reuse existing nodes (structural sharing). Git commits work the same way—each commit appears to be a complete tree snapshot, but unchanged files and directories (blob and tree objects) directly reference the previous commit's objects by SHA hash. EBS Snapshot, Git, ZFS snapshots, and copy-on-write filesystems all represent variations of one principle: "write only changes, share the rest."

> 🔍 **Deeper Dive**: The mechanism EBS uses to track changed blocks is **CBT (Changed Block Tracking)**. When a write occurs on the volume, that block is marked as dirty; the next snapshot sees this mark and knows what to copy. AWS exposes this tracking information via **EBS Direct API** `ListChangedBlocks`—give it two snapshots and it returns the list of changed blocks and offsets between them. This is why backup software (Veeam, Cohesity) can efficiently integrate EBS—they read only "blocks changed since last backup" directly without scanning the entire volume. You can even fetch individual block data with `GetSnapshotBlock`.

## AMI Is a Bundle of Snapshots + a Boot Recipe—Why Deleting an AMI Leaves Snapshots Behind

If you only memorize "AMI (Amazon Machine Image) is an EC2 boot image," you'll cause operational disasters. An AMI's reality is **references to EBS snapshots + boot metadata (recipe)**. If an instance has a root volume and two data volumes, `create-image` creates snapshots of each of those three volumes, and the AMI just holds the recipe: "when booting, restore these snapshots to these device mappings (`/dev/xvda`, `/dev/xvdb`...)." The AMI itself holds no data—all data lives in snapshots, and the AMI is just the assembly instructions.

This structure creates the most notorious cost trap in operations. When you `deregister` an AMI, **only the recipe disappears; the snapshots the recipe pointed to remain.** You think "I deleted the AMI, so costs will drop," but the actual data (snapshots) keeps being billed per GB. In accounts that repeatedly create and delete hundreds of "golden AMIs" by version, it's common to end up with "terabytes of unused snapshots" from deregister-only cleanups. Deregistering an AMI and deleting snapshots are separate operations; to automate this together requires DLM options or a separate cleanup script.

> ⚠️ **Trap**: `aws ec2 create-image` with `--no-reboot` creates the image without stopping the instance. It looks good—no operational downtime—but this is a **crash-consistent** snapshot that may lose data sitting in memory and disk buffers. For workloads like databases where filesystem cache must match disk state, you must either create without `--no-reboot` (with reboot) or flush/freeze the filesystem at the OS level first. For simple web server golden images, `--no-reboot` is reasonable. In exams, when "backup without operational downtime but consistent" appears, the answer isn't just `--no-reboot` but application-consistent handling (below).

## Crash-consistent vs Application-consistent—fsfreeze Solves the Problem

The phrase "snapshot is a point-in-time backup" hides a trap. Taking a snapshot of a 1TB volume isn't instantly freezing every block simultaneously; it's a process of copying blocks one by one to backup storage. During this process, the application keeps writing to disk. Moreover, the OS buffers writes in memory (page cache) for performance and flushes them to disk later (write-back). At the moment a snapshot is taken, unwritten data may still float in memory.

A snapshot taken in this state is a **crash-consistent** snapshot—like the state of disk after suddenly pulling the server's power cord. Most journaling filesystems (ext4, NTFS) and databases are designed to recover from such abrupt power loss, so usually they survive, but there's no guarantee. If a multi-block transaction was halfway to disk when snapped, post-recovery data could corrupt.

An **application-consistent** snapshot eliminates this risk. Just before snapping, the application and OS are told: "pause writes, flush all memory buffers to disk." On Linux, `fsfreeze -f` freezes the filesystem to block new writes and flush cache; on Windows, **VSS (Volume Shadow Copy Service)** notifies VSS-aware applications (DB, Exchange, etc.) to "create a consistent state now." The snapshot is taken during this brief consistent window and immediately unlocked with `fsfreeze -u`. AWS automates this via SSM Document (`AWSEC2-CreateVssSnapshot`; Linux uses pre/post scripts)—Run Command issues freeze commands inside the instance, and while frozen, calls the EBS snapshot API.

| Mode | What Gets Frozen | Risk | Standard Tool |
|------|------------------|------|-----------|
| Crash-consistent (default) | Nothing | Lost memory buffers, unfinished transactions | `create-snapshot` as-is |
| Filesystem-consistent | Filesystem cache flush | App-level transactions not guaranteed | Linux `fsfreeze` |
| Application-consistent | App + FS both stopped | Almost none | Windows VSS / SSM pre-post script |

> 💡 **Related Theory**: The root of this problem is OS **write-back caching**. Disk I/O is tens of thousands of times slower than memory, so the OS doesn't immediately reflect writes to disk; instead, it buffers them in page cache and flushes them in bulk (`pdflush`/`writeback` kernel threads). Performance improves, but "the real latest state in memory" and "the state crystallized on disk" perpetually diverge. The `fsync()` syscall forces a specific file's buffer to disk, closing this gap; `fsfreeze` does the same for the entire filesystem while also blocking new writes. Databases call `fsync` on their WAL (Write-Ahead Log) during transaction commit for this reason—to guarantee "it really touched disk" so transactions survive power loss.

## DLM—Automate Backup Lifecycle with Just a Tag

If you manually create and delete snapshots, two disasters are inevitable: first, someone forgets and backups are missed; second, no one deletes old snapshots and costs accumulate infinitely. **DLM (Data Lifecycle Manager)** automates both via "policy + tags." An operator adds a tag like `Backup=daily` to a resource and declares in a DLM policy: "snapshot volumes with this tag every day at 3 AM, keep 7 copies." From then on, creation, retention, deletion, and Cross-Region replication all run automatically.

DLM policy types split by target. **EBS Snapshot Policy** uses `ResourceTypes: VOLUME` for per-volume snapshots; **EBS-backed AMI Policy** uses `ResourceTypes: INSTANCE` to create full-instance AMIs (root + data volume snapshot bundles). **Event-Based Policy** is special—it triggers on events like "another account shares a snapshot with me" and auto-copies to my account, useful for centralizing snapshots to a backup account.

Retention rules (RetainRule) come in two modes: **Count (number)** and **Age (duration)**. `Count: 7` keeps only the 7 latest; the 8th triggers deleting the oldest. `Interval: 7 DAYS` deletes snapshots older than 7 days. The difference matters operationally—irregular creation intervals make Count unpredictable in duration and Age unpredictable in count.

```bash
# Daily AMI, 7-day retention, Cross-Region replicate to us-east-1, 3 AM daily
aws dlm create-lifecycle-policy \
  --description "Daily AMI 7-day retention" \
  --state ENABLED \
  --execution-role-arn arn:aws:iam::123:role/AWSDataLifecycleManagerDefaultRole \
  --policy-details '{
    "PolicyType":"IMAGE_MANAGEMENT",
    "ResourceTypes":["INSTANCE"],
    "TargetTags":[{"Key":"Backup","Value":"daily"}],
    "Schedules":[{
      "Name":"Daily AMI",
      "CreateRule":{"CronExpression":"cron(0 3 ? * * *)"},
      "RetainRule":{"Count":7},
      "TagsToAdd":[{"Key":"BackupType","Value":"DailyAMI"}],
      "CrossRegionCopyRules":[{
        "TargetRegion":"us-east-1",
        "Encrypted":true,
        "CmkArn":"arn:aws:kms:us-east-1:123:key/abc",
        "RetainRule":{"IntervalUnit":"DAYS","Interval":7}
      }]
    }]
  }'
```

DLM is frequently confused with **AWS Backup** (Day 2). The boundary is clear—DLM is a **lightweight EBS/AMI-only** snapshot scheduler, while AWS Backup is a **multi-service unified backup + compliance** platform covering RDS, DynamoDB, EFS, FSx, and S3. For EBS-only backups, DLM is lightweight with minimal cost. When bundling multiple services under one policy and extracting audit reports via Audit Manager, AWS Backup is the answer.

| Item | DLM | AWS Backup |
|------|-----|------------|
| Scope | EBS volumes, AMI only | EBS/RDS/DDB/EFS/FSx/S3 and more |
| Policy Unit | Lifecycle Policy | Backup Plan (bundle of Rules) |
| Compliance | None | Backup Audit Manager |
| Cross-Account | Limited via Event-Based | Full support via Vault Policy |
| Cost | Policy free (snapshot storage only) | Management fee + storage |

> 📚 **Case Study**: The 2014 collapse of Code Spaces, a code hosting company, is a textbook case of backup isolation. An attacker stole AWS console credentials and deleted EC2 instances, S3, **and EBS snapshots and backups all at once**. Because operational data and backups lived under the same account and permissions, one breach erased everything with no recovery possible—the company shut down. The industry standard born from this incident: "keep backups in a different account/different permission boundary." DLM's Cross-Region and Cross-Account replication, plus Day 2's Snapshot Lock and Vault Lock, all implement this lesson. If backups can be deleted with the same key as operations, they aren't backups.

## Snapshot Lock—The Last Defense Making Backups Themselves Undeletable

Even with DLM automation, one hole remains: **privileged operators (or attackers with their credentials) can delete snapshots.** Evolved ransomware attacks delete backups first before encrypting data—they must eliminate recovery options to extort payment. Code Spaces fell exactly this way. **Snapshot Lock** closes this final gap. A locked snapshot **cannot be deleted by anyone, under any permissions,** for the period you specify.

The lock has two modes; this distinction is critical in exams and operations. **Governance mode** allows subjects with specific IAM permissions (`ec2:UnlockSnapshot`) to unlock—a guardrail against mistakes. **Compliance mode** is absolute—once activated (after a cooling-off period), **not even the root account or AWS can unlock it.** This satisfies WORM (Write Once Read Many) requirements mandated by regulations like SEC 17a-4 and HIPAA—truly immutable backups. Compliance mode's scariness and power are two sides of the same coin—attackers can never delete, but even an operator who mistakenly sets too long a period can't undo it.

> 🔍 **Deeper Dive**: WORM isn't new; it emerged from 1990s financial regulatory responses. Securities firms had to store trading records on immutable media (SEC Rule 17a-4), and at the time they used WORM optical discs—once burned, physically impossible to overwrite, ensuring no tampering. In the cloud era, Compliance mode Lock recreates this physical immutability in software—Snapshot Lock, S3 Object Lock (Day 4), and Backup Vault Lock (Day 2) all apply the same WORM model to their respective resources. The constraint "once locked, even the issuer can't unlock it" seems inconvenient, but that's exactly what trust requires—trust is established when you prove "not even an admin can touch this."

## Why Is the First IO on a New Volume Slow?—Lazy Loading and FSR

Create an EBS volume from a snapshot with `create-volume`—it finishes almost instantly and the volume shows "available." But when you mount it and read for the first time, IO is frustratingly slow. This isn't a bug; it's a design called **lazy loading**. Snapshot blocks live in backup storage (S3-based); creating the volume doesn't immediately copy those blocks to EBS. Only the metadata is created first; actual blocks are **fetched from backup storage on first access** in the background (hydrated). Reading an un-hydrated block first time triggers a network roundtrip, so it's slow.

Most workloads tolerate this lazy loading—as time passes, blocks hydrate and performance normalizes. But in DR failover scenarios where "the restored volume must deliver full performance immediately," this initial delay can be fatal. **FSR (Fast Snapshot Restore)** eliminates this. FSR-enabled snapshots are pre-hydrated completely by AWS in a specific AZ, so volumes created from them deliver max performance from the first IO. The cost: FSR is billed hourly per snapshot×AZ combination, so it's standard practice to enable it only for core DR snapshots requiring immediate restore.

> ⚠️ **Trap**: FSR doesn't "quickly create a snapshot"; it "quickly restore a volume from a snapshot." And FSR is per-AZ—enable FSR in `ap-northeast-2a` and only volumes created there are fast; creating in `2c` triggers lazy load again. Enabling FSR on all AZs in a DR region doubles costs. In exams, "need max IOPS immediately after snapshot restore" means FSR is correct, but if "cost optimization" context appears too, the answer is "selectively on required AZs only."

## Wrapping Up

Nearly all characteristics of EBS Snapshot derive from the incremental, block-sharing model: "remember only changes, share the rest." Deleting one snapshot leaves others intact because only unreferenced blocks are deleted. Deleting an AMI leaves snapshots because AMIs are recipes pointing to snapshots, not data holders. First IO on new volume is slow because blocks lazy-load.

Five key takeaways for operators: ① Snapshots are incremental + block-sharing—cost proportional to changes, deletion removes only unreferenced blocks. ② AMI deregister ≠ snapshot deletion—a classic cost trap. ③ `--no-reboot` is crash-consistent; databases need fsfreeze/VSS for application-consistent backups. ④ DLM is lightweight EBS/AMI-only; multi-service needs AWS Backup. ⑤ Snapshot Lock Compliance is WORM no one can unlock; FSR is only for DR snapshots needing immediate restore.

In the next article, we'll move beyond EBS alone, bundling RDS, DynamoDB, EFS, and S3 under one policy and isolating backups from attackers using **AWS Backup**'s Vault Lock structure.

---

## 📝 연습 문제

**문제 1.** 1TB EBS 볼륨의 매시간 스냅샷을 한 달간 찍었는데 청구액이 예상보다 훨씬 적다. 그 이유로 가장 정확한 것은?

A) AWS가 스냅샷에 자동 할인을 적용한다
B) EBS Snapshot은 증분 방식이라 첫 스냅샷만 전체 크기고 이후는 변경된 블록만 저장하며, 변경량이 작으면 누적 비용이 작다
C) Free tier가 스냅샷 비용을 면제한다
D) 스냅샷이 압축되어 저장된다

**정답: B**

해설: EBS Snapshot의 핵심은 블록 단위 증분 백업이다. 첫 스냅샷은 볼륨의 모든 점유 블록을 백업하지만, 이후 스냅샷은 직전 이후 dirty bit가 켜진(변경된) 블록만 새로 저장하고 변경되지 않은 블록은 이전 스냅샷이 저장한 블록을 그대로 참조한다(structural sharing). 따라서 비용은 볼륨 크기가 아니라 시간당 변경량에 비례한다. 1TB라도 변경이 적으면 두 번째 이후 스냅샷은 거의 비용이 들지 않는다.

---

**문제 2.** 운영자가 사용하지 않는 AMI를 deregister했는데 스토리지 비용이 줄지 않았다. 원인과 해결은?

A) AMI 삭제는 비동기라 며칠 기다리면 자동 정리된다
B) AMI deregister는 부팅 레시피만 제거하고 연관 EBS 스냅샷은 남으므로, 스냅샷을 별도로 삭제하거나 DLM 정책으로 정리해야 한다
C) AMI를 다시 등록한 뒤 삭제하면 스냅샷도 같이 지워진다
D) EC2 인스턴스를 종료하면 자동 정리된다

**정답: B**

해설: AMI는 데이터를 직접 갖지 않고 EBS 스냅샷들에 대한 참조 + 디바이스 매핑 메타데이터(부팅 레시피)일 뿐이다. deregister는 이 레시피만 제거하므로 실제 데이터인 스냅샷은 그대로 남아 계속 GB당 과금된다. 골든 AMI를 버전별로 만들고 지우는 환경에서 deregister만 반복하면 미사용 스냅샷이 테라바이트 단위로 누적되는 대표적 비용 함정이다. 스냅샷을 명시적으로 삭제하거나 DLM의 정리 옵션을 써야 한다.

---

**문제 3.** 데이터베이스가 실행 중인 인스턴스의 AMI를 `--no-reboot`로 만들었더니 복원한 DB가 간헐적으로 손상된 상태로 뜬다. 근본 원인은?

A) AMI 생성 자체가 DB를 손상시킨다
B) `--no-reboot`는 crash-consistent 스냅샷이라 OS의 write-back 캐시와 진행 중 트랜잭션이 디스크에 반영되지 않은 채로 백업될 수 있다 — fsfreeze/VSS로 application-consistent 백업이 필요하다
C) DB는 AMI로 백업할 수 없다
D) 스냅샷이 증분이라 일부 블록이 누락됐다

**정답: B**

해설: `--no-reboot`는 인스턴스를 멈추지 않고 스냅샷을 찍어 운영 중단은 없지만, 그 시점 OS의 page cache(write-back)에 떠 있던 쓰기와 진행 중인 멀티 블록 트랜잭션이 디스크에 내려가지 않은 상태일 수 있다(crash-consistent). DB처럼 일관성이 중요한 워크로드는 스냅샷 직전 `fsfreeze`(Linux)나 VSS(Windows)로 캐시를 flush하고 쓰기를 정지시켜 application-consistent 상태에서 백업해야 한다. AWS는 이를 SSM Document로 자동화한다.

---

**문제 4.** Ransomware 공격자가 운영자 자격증명을 탈취해 백업 스냅샷까지 삭제하는 시나리오를 막아야 한다. 규제상 백업은 발급자조차 삭제할 수 없어야 한다. 어떤 조치가 맞나?

A) IAM 정책으로 삭제 권한을 제거
B) Snapshot Lock Compliance 모드 — cooling-off 후에는 루트 계정도 AWS도 해제 불가한 WORM
C) 스냅샷을 더 자주 생성
D) Snapshot Lock Governance 모드

**정답: B**

해설: Snapshot Lock의 Compliance 모드는 cooling-off 기간이 지나면 루트 계정·AWS를 포함해 누구도 잠금을 해제하거나 스냅샷을 삭제할 수 없는 진짜 불변(WORM) 백업이다. SEC 17a-4·HIPAA 같은 규제 요건을 만족한다. Governance 모드(D)는 특정 IAM 권한자가 해제할 수 있어 실수 방지용 가드레일에 가깝고, 자격증명을 탈취한 공격자가 그 권한까지 갖고 있으면 무력하다. IAM(A)도 권한 탈취 시 우회된다.

---

**문제 5.** DR 페일오버 시 큰 스냅샷에서 새 볼륨을 만들었는데 첫 IO가 매우 느려 복구가 지연된다. 비용을 고려하며 해결하려면?

A) 스냅샷을 다시 생성한다
B) 해당 DR 스냅샷에 대해 페일오버 대상 AZ에만 Fast Snapshot Restore(FSR)를 켜 미리 hydrate해 둔다
C) 볼륨 타입을 gp2에서 gp3로 바꾼다
D) 인스턴스 타입을 키운다

**정답: B**

해설: 스냅샷에서 만든 볼륨은 기본적으로 lazy loading이라 블록을 처음 접근할 때 백업 스토리지에서 끌어오므로 초기 IO가 느리다. FSR은 스냅샷을 특정 AZ에 미리 완전히 hydrate해 둬 거기서 만든 볼륨이 첫 IO부터 최대 성능을 내게 한다. 단 FSR은 스냅샷×AZ 조합마다 시간당 과금되므로, 모든 AZ가 아니라 실제 페일오버 대상 AZ에만 선택적으로 켜는 것이 비용 최적화 정답이다.

---

**문제 6.** EBS만 백업하면 되는 단순한 환경에서 매일 스냅샷 생성과 7일 보존을 자동화하려 한다. 가장 가볍고 비용 효율적인 도구는?

A) AWS Backup + Backup Plan + Audit Manager
B) DLM(Data Lifecycle Manager) — EBS/AMI 전용 경량 스케줄러, 정책 자체는 무료
C) Lambda + EventBridge 커스텀 스크립트
D) 수동 스냅샷 + 캘린더 알림

**정답: B**

해설: DLM은 EBS 볼륨과 AMI 전용의 가벼운 라이프사이클 스케줄러로, 태그 기반으로 생성·보존·삭제·Cross-Region 복제를 자동화하며 정책 자체에는 요금이 없다(스냅샷 저장 비용만). AWS Backup(A)은 RDS·DynamoDB·EFS 등 멀티 서비스 통합과 컴플라이언스가 필요할 때 쓰는 더 무거운 플랫폼이라 EBS만 다루는 경우엔 과하다. 단순 EBS 백업 자동화는 DLM이 정석이다.

---

**문제 7.** 한 스냅샷(Snapshot 1)을 삭제했는데, 그 이후에 만든 증분 스냅샷(Snapshot 2)의 복원이 멀쩡히 된다. 이게 가능한 이유는?

A) Snapshot 2가 삭제 직전 Snapshot 1을 전체 복사해 둔다
B) 스냅샷은 블록을 공유하며, 삭제 시 다른 스냅샷이 아무도 참조하지 않는 블록만 실제로 제거되므로 Snapshot 2가 참조하는 블록은 보존된다
C) 삭제된 스냅샷은 Recycle Bin에서 자동 복구된다
D) 증분 스냅샷은 원래 독립적인 전체 백업이다

**정답: B**

해설: 증분 스냅샷들은 변경되지 않은 블록을 포인터로 공유한다(structural sharing). 스냅샷을 삭제하면 EBS는 다른 스냅샷이 여전히 참조하는 블록은 남기고, 삭제 대상 스냅샷만 단독으로 참조하던 블록만 실제로 제거한다. 따라서 Snapshot 1을 지워도 Snapshot 2가 가리키는 블록은 살아남아 각 스냅샷은 독립적인 완전 백업처럼 복원된다. 사용자에게는 독립 백업으로 보이지만 내부는 블록을 공유하는 포인터 그래프다.

---
