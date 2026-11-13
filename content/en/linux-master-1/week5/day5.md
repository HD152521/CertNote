# Day 5 - Week 5 Comprehensive Review: Filesystems · Partitions · LVM · Swap · RAID · Quotas Wrap-up and Practice

## 📌 Key Takeaways

- The flow in one sentence: **physical disk → partition → (optional: RAID/LVM) → mkfs → mount/fstab → quotas and inspection**.
- Day 1 is data representation (inode, block, journal), and Day 2 is space partitioning and connection (partition, mkfs, fstab).
- Day 3 is flexibility and virtual memory (3 LVM layers, 2-step extension, swap), and Day 4 is safety, fairness, and diagnosis (RAID, quotas, inspection).
- The 6 essentials: **fstab 6 fields · LVM 2-step extension · RAID minimum disks · quota soft/hard · df vs du · fsck unmounted**.
- Memorize the commands, but if you group them by **"which layer solves what"**, you won't be shaken by variant questions.

## The Whole Flow at a Glance — From Disk to Operation

```
[Physical disk]
   │  fdisk/gdisk/parted (partitioning)
   ▼
[Partition]  ──(several)──> [RAID: mdadm] or [LVM: pvcreate→vgcreate→lvcreate]
   │
   ▼  mkfs.ext4 / mkfs.xfs (format)
[Filesystem]
   │  mount (temporary) / /etc/fstab (permanent)
   ▼
[Mounted directory]
   │  quota (usage limits) / df·du·fsck (inspection)
   ▼
[Operation]
```

| Stage | Tools | Day |
|-------|-------|-----|
| Understanding the filesystem (inode/block/journal) | stat, tune2fs, dumpe2fs | Day1 |
| Partitioning | fdisk, gdisk, parted | Day2 |
| Formatting | mkfs.*, mke2fs | Day2 |
| Mounting/making permanent | mount, umount, /etc/fstab | Day2 |
| Flexible volumes | pvcreate, vgcreate, lvcreate, lvextend | Day3 |
| Virtual memory | mkswap, swapon, swapoff | Day3 |
| Redundancy | mdadm (RAID) | Day4 |
| Usage limits | quotacheck, quotaon, edquota | Day4 |
| Inspection | fsck, df, du, lsblk, blkid | Day4 |

## Day 1 Key Recap — Filesystems and Structure

- **inode**: A file's metadata (permissions, owner, size, block pointers, timestamps). **The file name is not in the inode** — the parent directory holds "name→inode number".
- **Block**: The smallest unit of space allocation (usually 4KB). Even a small file occupies one block → internal fragmentation.
- **Superblock**: The map of the whole FS. If damaged, recover with a backup superblock using `fsck -b`.
- **Journaling**: For crash recovery. The ext3/4 default `ordered` guarantees **metadata consistency** (not lossless data). Modes: journal > ordered > writeback.
- **ext lineage**: ext2 (no journal) → ext3 (journal) → ext4 (extents, 16TB file, 1EB FS).
- **xfs**: Large capacity, grow-only (cannot shrink). **btrfs**: CoW, snapshots, checksums.
- **Inode exhaustion**: File creation fails even with free capacity → diagnose with `df -i`.

`df -h` (capacity) and `df -i` (inodes) look at different things. "Plenty of capacity but can't create a file" = inode exhaustion, "out of capacity" = block exhaustion. The habit of diagnosing the two separately is important.

## Day 2 Key Recap — Partitions, Mounting, fstab

- **MBR vs GPT**: MBR = 2TB, 4 primaries, single backup; GPT = unlimited, 128, UUID, front-and-back dual backup. MBR logical partitions start at 5.
- **Tools**: fdisk (MBR-centric), gdisk (GPT only), parted (both, scriptable). In fdisk, `w` saves and `q` cancels.
- **Type codes**: 83=Linux, 82=swap, 8e=LVM, fd=RAID.
- **mkfs**: `mkfs.ext4 /dev/sdb1` = `mkfs -t ext4 ...`. Deletes existing data.
- **mount/umount**: umount refused ("busy") = a process is using it (`fuser -m`/`lsof`). `umount -l`=lazy.
- **/etc/fstab 6 fields**: **device (UUID) · mount point · type · options · dump (0) · pass (root 1/the rest 2/none 0)**.

> ⚠️ **Pitfall Review**: The order of the 6 fstab fields and the values of fields 5 and 6 (dump=almost always 0, pass=root 1·the rest 2·swap 0) are essential. If you don't verify with `mount -a` after editing, there is a risk of boot failure.

fstab in a table-like form once more:

```
UUID=abc  /data  ext4  defaults       0  2    ← Regular FS
UUID=def  /      ext4  defaults       0  1    ← Root (pass=1)
/dev/sdb2 none   swap  sw             0  0    ← Swap (pass=0)
```

## Day 3 Key Recap — LVM and Swap

- **LVM 3 layers**: PV (disk) → VG (pool) → LV (unit of use). Creation: `pvcreate→vgcreate→lvcreate`.
- **LV extension in 2 steps**: `lvextend` (container) + `resize2fs` (ext) or `xfs_growfs` (xfs, mount point argument). If the VG is short, `vgextend` comes first.
- **Command mapping**: display `pvs/vgs/lvs`, extend `vgextend/lvextend`. `-L` (capacity) / `-l` (PEs or %, `100%FREE`).
- **Swap**: Not a filesystem. `mkswap` (initialize) → `swapon` (activate) → `swapoff`. fstab: `none swap sw 0 0`. Check with `swapon -s`/`free -h`.

"Extended the LV but `df` is unchanged" = `resize2fs`/`xfs_growfs` missing. The container and the contents are grown separately. xfs cannot be shrunk.

## Day 4 Key Recap — RAID, Quotas, Inspection

The RAID table (in full):

| Level | Method | Min. disks | Failures tolerated | Efficiency |
|-------|--------|------------|--------------------|------------|
| 0 | Stripe | 2 | 0 | 100% |
| 1 | Mirror | 2 | 1 | 50% |
| 5 | Distributed parity | 3 | 1 | (N-1)/N |
| 6 | Double parity | 4 | 2 | (N-2)/N |
| 10 | Mirror + stripe | 4 | 1 per pair | 50% |

- **mdadm**: `--create --level --raid-devices`. Status via `/proc/mdstat`, `mdadm --detail`.
- **Quotas**: fstab `usrquota` → remount → `quotacheck` → `quotaon` → `edquota`. soft (grace/warning) vs hard (immediate block). Block and inode limits are separate.
- **Inspection**: df (FS capacity) · du (path usage) · lsblk (device tree) · blkid (UUID) · fsck (integrity, **unmount required**). xfs repair is `xfs_repair`.

> ⚠️ **Pitfall Review**: The minimum disk counts (0·1=2, 5=3, 6·10=4) and "RAID 1 and 0 have no parity" are the essentials. fsck only on an unmounted state.

## Integrated Cheat Sheet of Key Commands

```bash
# Partition
fdisk /dev/sdb        # MBR (n/d/t/p/w/q)
gdisk /dev/sdb        # GPT
parted /dev/sdb --script mklabel gpt mkpart primary ext4 0% 100%

# Format & mount
mkfs.ext4 /dev/sdb1
mount /dev/sdb1 /mnt/data
umount /mnt/data
blkid /dev/sdb1       # Check UUID → register in fstab → mount -a

# LVM
pvcreate /dev/sdb1; vgcreate vg0 /dev/sdb1; lvcreate -L 10G -n lv0 vg0
lvextend -L +5G /dev/vg0/lv0; resize2fs /dev/vg0/lv0
vgextend vg0 /dev/sdc1

# Swap
mkswap /dev/sdb2; swapon /dev/sdb2; swapon -s

# RAID
mdadm --create /dev/md0 --level=5 --raid-devices=3 /dev/sd{b,c,d}1
cat /proc/mdstat

# Quota
quotacheck -cugm /home; quotaon /home; edquota -u user1; repquota /home

# Inspection
df -hT; df -i; du -sh /var; lsblk -f; fsck -y /dev/sdb1
```

**Connected view**: In practice these layers are stacked on top of one another. A typical configuration is **disks → mdadm RAID → LVM PV → VG → LV → ext4/xfs → mount → quota**. That is, RAID handles safety, LVM handles flexibility, the filesystem handles data structure, and quotas handle fairness. If you understand the design philosophy in which each layer independently solves one problem, applied questions can be solved too.

Check yourself with the 12 questions below.

## 📖 Glossary

- **inode** : A metadata structure holding a file's permissions, owner, size, and block locations. The file name is not here.
- **Superblock** : The map of the entire filesystem. If broken, recover from a backup copy with `fsck -b`.
- **Journaling ordered mode** : ext's default. Guarantees only **metadata consistency** and does not guarantee lossless data.
- **Inode exhaustion** : A state where inodes are used up so files cannot be created even though capacity remains. Diagnose with `df -i`.
- **MBR / GPT** : The old table with 2TB and 4-primary-partition limits, and the modern table with 128 partitions and practically unlimited size.
- **Partition type code** : 83=Linux, 82=swap, 8e=LVM, fd=RAID.
- **fstab 6 fields** : device (UUID) · mount point · type · options · dump · pass. pass is 1 for root, 2 for the rest, 0 for no check.
- **`mount -a`** : A verification command that tries applying all of fstab. A mandatory step before rebooting.
- **PV / VG / LV** : LVM's three layers — an incorporated disk, the pool bundling them, and the unit of use cut from the pool.
- **2-step extension** : Grow the container with `lvextend` and the contents with `resize2fs`/`xfs_growfs`. You need both for `df` to reflect it.
- **Swap** : A disk area that evacuates pages when RAM is short. Create it with `mkswap` and turn it on with `swapon`.
- **Parity** : The XOR sum of data. Used only by RAID 5 and 6, and the basis for recomputing a dead disk's contents.
- **`/proc/mdstat`** : The file showing software RAID status and rebuild progress.
- **soft / hard limit** : A limit that only warns during the grace period, and an absolute ceiling that blocks writes immediately.
- **`df` vs `du`** : Viewing remaining capacity through filesystem metadata versus walking paths to count occupancy.
- **`fsck` / `xfs_repair`** : Tools for checking and repairing filesystem integrity. fsck requires unmounting, and xfs uses its dedicated tool.

## 📝 Practice Questions

**Question 1.** Which correctly describes where a file's name is stored in a Linux filesystem?

A) Inside that file's inode
B) In the data of the parent directory the file belongs to
C) The filesystem superblock
D) The file's first data block

**Answer: B**

Explanation: The name is not in the inode; the parent directory holds it as a "name→inode number" mapping. The inode holds only metadata such as permissions, owner, size, and block pointers.

---

**Question 2.** What does ordered, the default journaling mode of ext3/ext4, guarantee?

A) Complete losslessness of user data
B) Consistency of the filesystem metadata
C) Recovery of deleted files
D) Physical integrity of the disk

**Answer: B**

Explanation: ordered journals metadata only, guaranteeing the consistency of the FS structure. To protect data as well, you must use the journal mode, which double-writes data.

---

**Question 3.** Which is NOT a characteristic of the MBR partition scheme?

A) The maximum disk size is limited to 2TB
B) Up to 4 primary partitions can be created
C) It uses GUIDs to identify partitions
D) Logical partitions are numbered starting from 5

**Answer: C**

Explanation: GUID-based identification is a characteristic of GPT. MBR is sector-number based, and its features are the 2TB and 4-primary limits and logical partitions starting at 5.

---

**Question 4.** In `/etc/fstab`, what value should be specified in the 6th field (fsck pass) for the root filesystem (`/`)?

A) 0
B) 1
C) 2
D) 3

**Answer: B**

Explanation: Root is 1 (checked first), other filesystems to be checked are 2, and those not to be checked (swap, etc.) are 0.

---

**Question 5.** Which lists the LVM components in the correct order from physical to logical?

A) LV → VG → PV
B) PV → VG → LV
C) VG → PV → LV
D) PV → LV → VG

**Answer: B**

Explanation: Bundle PVs (disks) into a VG (pool), and cut LVs (units of use) from the VG. The creation commands also go in the order pvcreate→vgcreate→lvcreate.

---

**Question 6.** After extending an LV with `lvextend`, which command actually reflects the capacity in an ext4 filesystem?

A) `mkfs.ext4`
B) `xfs_growfs`
C) `resize2fs`
D) `mount -a`

**Answer: C**

Explanation: lvextend grows only the LV (the container). The filesystem must be grown separately — with `resize2fs` for ext4 and `xfs_growfs` for xfs.

---

**Question 7.** Which statement about the swap area is correct?

A) It is mounted on a directory with the `mount` command
B) It is initialized with `mkswap` and activated with `swapon`
C) It is a type of ext4 filesystem
D) Active swap is checked with `df -h`

**Answer: B**

Explanation: Swap is not a filesystem. Write the signature with `mkswap` and activate it with `swapon`, and check it with `swapon -s` or `free -h`.

---

**Question 8.** Which correctly gives RAID 5's minimum number of disks and the number of simultaneous disk failures it tolerates?

A) 2 disks, 1 disk
B) 3 disks, 1 disk
C) 4 disks, 2 disks
D) 4 disks, 1 disk

**Answer: B**

Explanation: RAID 5 needs at least 3 disks for distributed parity and recovers from 1 disk failing. Tolerating 2 simultaneous failures is RAID 6 (minimum 4 disks).

---

**Question 9.** Which statement about RAID levels is NOT correct?

A) RAID 0 has no fault tolerance
B) RAID 1 is mirroring and does not use parity
C) RAID 6 tolerates two simultaneous disk failures
D) RAID 10 stores parity in a distributed way, so its capacity efficiency is high

**Answer: D**

Explanation: RAID 10 is mirror + stripe with 50% capacity efficiency and does not use parity. Distributed parity is the method of RAID 5/6.

---

**Question 10.** Which statement about the soft limit of a disk quota is correct?

A) It blocks writes immediately upon exceeding
B) It allows exceeding during the grace period and gives a warning
C) It does not apply to inodes
D) It applies only to groups

**Answer: B**

Explanation: The soft limit allows writing during the grace period even after being exceeded and gives a warning. The one that blocks immediately is the hard limit.

---

**Question 11.** Which correctly describes the difference between `df` and `du`?

A) df shows usage per path, du shows total FS capacity
B) df shows total/free capacity per FS, du shows the actual usage of a specific path
C) The two are completely identical
D) df looks only at inodes, du looks only at blocks

**Answer: B**

Explanation: df shows total and free capacity per mounted filesystem, while du walks directories and shows the space a specific path occupies.

---

**Question 12.** Which is a correct precaution when using fsck, the filesystem integrity check tool?

A) Always check while mounted
B) Always check while unmounted (or read-only)
C) Always reformat with mkfs before checking
D) It does not work on ext4

**Answer: B**

Explanation: Running fsck on a mounted FS can damage it because the contents change during the check, so check while unmounted. On xfs, fsck.xfs does nothing and repair is done with `xfs_repair`.

---
