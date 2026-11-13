# Day 4 - RAID, Quotas, and Disk Inspection: RAID 0/1/5/6/10 · mdadm · quota/edquota · fsck/df/du/lsblk/blkid

## 📌 Key Takeaways

- RAID is all about the per-level table — minimum disks: **2 for 0 and 1, 3 for 5, 4 for 6 and 10**.
- **Only 5 and 6 use parity.** RAID 1 is a simple mirror, so it has no parity. 6 has double parity, so it tolerates **up to 2 disks** failing.
- Software RAID is built with `mdadm`, and its status is viewed in **`/proc/mdstat`** (`U`=healthy, `_`=failed).
- Quota order: **fstab option → remount → `quotacheck` → `quotaon` → `edquota`**. Soft is grace/warning, hard blocks immediately.
- Inspection tools are divided by role — **df** (FS capacity) · **du** (path usage) · **lsblk** (device tree) · **blkid** (UUID) · **fsck** (integrity, unmount required).

## RAID Level Characteristics — Parity, Minimum Disks, Fault Tolerance

Two real-world threats remain. Disks eventually fail (single point of failure), and users can hog disk space without limit. RAID solves the former, and quotas solve the latter.

- RAID (Redundant Array of Independent Disks) bundles multiple disks to trade off performance, reliability, and capacity efficiency.

| Level | Method | Min. disks | Fault tolerance (failures allowed) | Capacity efficiency | Features |
|-------|--------|------------|------------------------------------|---------------------|----------|
| **0** | Striping | 2 | **0** (if one dies, everything is lost) | 100% | Fastest, no safety |
| **1** | Mirroring | 2 | 1 | 50% | Exact copy, fast reads |
| **5** | Striping + distributed parity | **3** | 1 | (N-1)/N | Loses one disk's worth to parity |
| **6** | Striping + double parity | **4** | **2** | (N-2)/N | Loses two disks' worth to parity |
| **10** | 1+0 (mirror + stripe) | **4** | 1 per pair | 50% | Fast and safe, expensive |

**Parity** is "the XOR sum of the data". If you store the XOR of the data blocks as parity, then when one disk dies you can XOR the remaining data and the parity again to **restore** the lost block. RAID 5 distributes parity across all disks, and RAID 6 keeps two different parities so it recovers **even if two disks die at once**. RAID 0 and 1 do not use parity.

RAID 5's capacity efficiency is (N-1)/N — with 3 disks, the capacity of 2 disks (67%), with parity taking one disk's worth. RAID 6 is (N-2)/N — with 4 disks, 2 disks' worth (50%). With RAID 1 and 10, half (50%) is consumed by replicas. RAID 0 is 100% but has zero safety, so it is never used alone for storing data. The "capacity efficiency vs safety" trade-off is the essence of choosing a level.

> ⚠️ **Pitfall**: The minimum disk count easily becomes a trap — **RAID 0 and 1 need 2 disks, RAID 5 needs 3, RAID 6 and 10 need 4**. Choices that make you mistake the "RAID 5 minimum disks" for 2 are common. At least 3 are needed for distributing parity. Wrong statements such as "RAID 1 uses parity" are also used as wrong answers — RAID 1 is simple replication (mirror), so it has no parity.

RAID 10 and RAID 0+1 are different. RAID 10 (1+0) is "stripe the mirrored pairs", while RAID 0+1 is "mirror the striped sets". RAID 10 is more robust for failure recovery — RAID 10 survives one disk dying in each mirror pair, whereas RAID 0+1 is at risk if one stripe set breaks entirely. In practice, "RAID 10" usually means 1+0.

## mdadm — Configuring Software RAID

Linux can build software RAID with **mdadm** even without a hardware RAID controller. The resulting devices look like `/dev/md0`, `/dev/md1`.

```bash
# Create RAID 5 (3 disks)
mdadm --create /dev/md0 --level=5 --raid-devices=3 /dev/sdb1 /dev/sdc1 /dev/sdd1

# Check status
mdadm --detail /dev/md0        # Array details (state, disk roles)
cat /proc/mdstat               # Summary of all md arrays + sync progress

# Handling a disk failure
mdadm /dev/md0 --fail /dev/sdb1     # Mark the disk as faulty
mdadm /dev/md0 --remove /dev/sdb1   # Remove from the array
mdadm /dev/md0 --add /dev/sde1      # Add a new disk → automatic rebuild

# Make the configuration permanent
mdadm --detail --scan >> /etc/mdadm.conf   # Save array info
```

`--level` specifies the RAID level and `--raid-devices` the number of disks. The RAID device you create (`/dev/md0`) is formatted with `mkfs.ext4 /dev/md0` and mounted like any ordinary block device. In other words, RAID is a layer **below** the filesystem. When used with LVM, you usually put LVM on top of RAID (md → PV → VG → LV).

> ⚠️ **Pitfall**: `/proc/mdstat` is the fastest window into RAID status. When a rebuild is in progress after replacing a disk, a progress bar and a status like `[UU_]` are shown here. `U`=healthy, `_`=failed/rebuilding. "Which file shows software RAID status?" → `/proc/mdstat` is the answer.

```bash
# Try it yourself — observing RAID (when an md array exists)
cat /proc/mdstat              # Array status/sync
mdadm --detail /dev/md0       # Details
lsblk                         # Disk-md relationship tree
```

## Disk Quotas — Limiting Usage per User and Group

- A **quota** is a mechanism that places an upper limit on the disk space (blocks) and number of files (inodes) a user or group can use.
- It prevents one user from monopolizing the disk on a shared server.

| Limit | Meaning |
|-------|---------|
| **soft limit** | Exceeding it does not block immediately; it gives a **warning**. Allowed during the grace period |
| **hard limit** | **Absolute ceiling**. Beyond this, writing itself is refused |

Quota application flow:

```bash
# 1) Add the quota options to fstab, then remount
#    /dev/sdb1  /home  ext4  defaults,usrquota,grpquota  0  2
mount -o remount /home

# 2) Create the quota database files (scan)
quotacheck -cugm /home         # -c create -u user -g group -m force

# 3) Enable quotas
quotaon /home                  # Disable with quotaoff

# 4) Edit per-user limits (opens an editor)
edquota -u user1               # Edit user1's soft/hard limits
edquota -g group1             # Edit group quota
edquota -t                    # Set the grace period

# 5) Verify
quota -u user1                # A specific user's usage/limits
repquota /home                # Quota report for the whole filesystem
```

To use quotas, you must **first give the `usrquota`/`grpquota` options in fstab (or mount)**. Running only `quotaon` without the options will not enable them. Then create the quota database (`aquota.user`, `aquota.group`) with `quotacheck` and turn it on with `quotaon`. Order: fstab option → remount → quotacheck → quotaon → edquota. This order appears on the exam.

Be clear on the difference between soft and hard. With the soft limit, writing is still allowed during the **grace period** even after exceeding it but a warning appears; once the grace period passes, soft acts like hard and blocks. The hard limit blocks **immediately** with no grace. "Which limit gives only a warning with a grace period?" → soft limit.

Quotas set a **block (capacity) limit** and an **inode (file count) limit** separately. When opened with `edquota`, the blocks column and the inodes column each split into soft/hard. So it is possible to be unable to create more because you hit the file-count quota "even though capacity remains". `repquota -a` shows the quota status of all filesystems at once.

## Disk Inspection Tools — fsck · df · du · lsblk · blkid

The five key tools for diagnosing the state of storage devices are distinguished by "what they show".

| Tool | What it shows | Unit/viewpoint |
|------|---------------|----------------|
| **df** | **Total/used/free capacity** per filesystem | Per mounted FS |
| **du** | **Space actually occupied** by directories/files | Per path |
| **lsblk** | Block device tree (disk-partition-mount) | Device hierarchy |
| **blkid** | A device's **UUID, type, label** | Device identification |
| **fsck** | Filesystem **integrity check and repair** | FS consistency |

```bash
# df — filesystem capacity
df -h                  # Human-readable units (G/M)
df -i                  # Inode usage
df -T                  # Including filesystem type

# du — actual usage per path
du -sh /var/log        # Directory total (summary)
du -h --max-depth=1 /  # Usage per first-level subdirectory
du -ah /tmp | sort -rh | head   # Largest first

# lsblk / blkid — device identification
lsblk -f               # FSTYPE, UUID, mount point
blkid /dev/sdb1        # UUID and TYPE

# fsck — integrity check (must be unmounted!)
umount /dev/sdb1
fsck /dev/sdb1         # Check (interactive repair)
fsck -y /dev/sdb1      # Answer yes to all questions (automatic repair)
fsck -f /dev/sdb1      # Force check even if it looks clean
```

**The difference between df and du** is easy to confuse. `df` reads filesystem metadata and quickly reports "how much capacity is left on the whole FS", while `du` walks the directories directly and computes "how much this path actually occupies". Sometimes their totals disagree (files that are deleted but still open by a process, etc.), and that discrepancy is itself a diagnostic clue.

`fsck` must be run **while unmounted (or read-only)**. Checking while mounted can damage the filesystem because it changes during the check. The root filesystem normally can't be unmounted, so it is checked at boot time or in recovery mode (the pass in the 6th field of fstab is this check order). "What if you run fsck on a mounted FS?" → Risk of damage.

`fsck` is a front end that calls `fsck.<type>` (e.g., `fsck.ext4`=`e2fsck`, `fsck.xfs`). Interestingly, **xfs's `fsck.xfs` does nothing** (returns success immediately) — because xfs establishes consistency by replaying the journal at mount time, and actual repair uses a separate tool called `xfs_repair`. "What tool checks and repairs xfs?" → `xfs_repair`.

The pattern `du -ah /var | sort -rh | head -20` is commonly used in practice to find large directories. The flow of when the disk is full (confirm with `df`) → who is the culprit (trace with `du`) → clean up is an operator's fundamental skill. Note, though, that `du` walks every directory, so it can be slow on large volumes.

Next, Day 5 comprehensively reviews all of Week 5 and wraps up with practice questions.

## 📖 Glossary

- **RAID** : A configuration that bundles multiple disks to trade off speed, reliability, and capacity efficiency.
- **Striping (RAID 0)** : Splits data across multiple disks. Fastest, but if one dies everything is lost.
- **Mirroring (RAID 1)** : Copies the same data in full. Capacity efficiency is 50%, but there is no parity calculation.
- **Parity** : The XOR sum of data blocks. The basis for recomputing and restoring a dead disk's contents.
- **RAID 5 / RAID 6** : Configurations that tolerate failure of up to 1 disk with distributed parity / up to 2 disks with double parity.
- **RAID 10 vs 0+1** : Striping mirrored pairs versus mirroring striped sets. 10 is better in recovery robustness.
- **mdadm** : The command that builds software RAID without a hardware controller. The resulting device is `/dev/md0`.
- **`/proc/mdstat`** : The file showing software RAID array status and rebuild progress. `U`=healthy, `_`=failed.
- **Rebuild** : The process of refilling data from parity/mirror after replacing a failed disk.
- **Quota** : A feature that places an upper limit on disk space and number of files per user/group.
- **soft limit / hard limit** : A limit that only warns during the grace period, and an absolute ceiling that blocks writes immediately.
- **grace period** : The grace time after exceeding the soft limit during which blocking has not yet happened. Set with `edquota -t`.
- **`quotacheck` / `quotaon`** : The command that creates the quota database and the command that enables quotas.
- **`repquota`** : The command that prints a quota usage report for the whole filesystem.
- **`df` vs `du`** : Viewing total capacity through filesystem metadata versus walking paths to count actual usage.
- **`fsck`** : A front end that checks and repairs filesystem integrity. Always run it **while unmounted**.
- **`xfs_repair`** : The xfs-only repair tool. `fsck.xfs` does nothing.

## 📝 Practice Questions

**Question 1.** Which correctly gives the minimum number of disks to configure RAID 5 and the number of simultaneous disk failures it can tolerate?

A) Minimum 2 disks, tolerates 1 failure
B) Minimum 3 disks, tolerates 1 failure
C) Minimum 3 disks, tolerates 2 failures
D) Minimum 4 disks, tolerates 2 failures

**Answer: B**

Explanation: RAID 5 needs at least 3 disks for distributed parity, and thanks to parity it can recover from 1 disk failing. The one that tolerates 2 simultaneous failures is RAID 6 (minimum 4 disks).

---

**Question 2.** Which statement about RAID levels is NOT correct?

A) RAID 0 is fast thanks to striping but has no fault tolerance
B) RAID 1 is a mirroring scheme and does not use parity
C) RAID 6 tolerates 2 simultaneous disk failures with double parity
D) RAID 1 stores parity in a distributed way, so its capacity efficiency is high

**Answer: D**

Explanation: RAID 1 is simple mirroring (replication), does not use parity, and has 50% capacity efficiency. The one that stores parity in a distributed way is RAID 5.

---

**Question 3.** Which lets you check the current state and sync progress of a software RAID array?

A) `/proc/mdstat`
B) `/etc/fstab`
C) `/proc/swaps`
D) `/etc/mdadm.lock`

**Answer: A**

Explanation: `/proc/mdstat` shows the status of all md arrays, their member disks, and rebuild/sync progress. You can see more detail with `mdadm --detail /dev/md0`.

---

**Question 4.** Which correctly describes the difference between the soft limit and the hard limit of a disk quota?

A) Soft blocks immediately, hard only warns
B) Soft allows exceeding during the grace period and warns, while hard blocks writes immediately
C) Soft applies only to groups, hard only to users
D) Both block immediately in the same way and differ only in name

**Answer: B**

Explanation: The soft limit allows writing and warns during the grace period even after being exceeded, and blocks once the grace period passes. The hard limit blocks immediately as an absolute ceiling with no grace.

---

**Question 5.** Which most accurately describes the difference between the `df` and `du` commands?

A) df shows actual usage per directory, du shows total filesystem capacity
B) df shows total/free capacity per filesystem, du shows the space a specific path occupies
C) df and du show exactly the same information in different formats
D) df looks only at inodes, du looks only at blocks

**Answer: B**

Explanation: df quickly reports total, used, and free capacity per mounted filesystem, while du walks directories and computes the space a specific path actually occupies.

---

**Question 6.** What is the correct order of steps to apply disk quotas?

A) quotaon → add fstab option → quotacheck → edquota
B) Add the usrquota option to fstab → remount → quotacheck → quotaon → edquota
C) edquota → quotacheck → quotaon → add fstab option
D) quotacheck → quotaon → edquota → add fstab option

**Answer: B**

Explanation: First give the `usrquota`/`grpquota` options in fstab (or mount) and remount, then create the quota database with `quotacheck`, enable it with `quotaon`, and then edit the limits with `edquota`.

---

**Question 7.** Which is a requirement that must be observed when checking the ext4 filesystem `/dev/sdb1` with fsck?

A) It must be checked while mounted to be accurate
B) It must be checked while unmounted (or read-only)
C) It must be reformatted with mkfs before checking
D) fsck works only on xfs

**Answer: B**

Explanation: Running fsck on a mounted filesystem can damage it because the contents change during the check, so it must be done while unmounted. For reference, xfs's fsck.xfs does nothing and repair uses `xfs_repair`.

---
