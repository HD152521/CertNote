# Day 2 - Partitions and Mounting: fdisk · gdisk · parted · mkfs · mount/umount · the 6 Fields of /etc/fstab

## 📌 Key Takeaways

- The pipeline before a disk gets used is **partition → format (mkfs) → mount → make permanent (fstab)**. The order must not be swapped.
- **MBR** has a 2TB limit and 4 primary partitions (logical ones start at number 5); **GPT** is practically unlimited, 128 partitions, identified by GUID.
- Division of tools: **fdisk** (MBR-centric) · **gdisk** (GPT only) · **parted** (both, scriptable). In fdisk, **changes take effect only when you press `w`**.
- The 6 fstab fields = **device (UUID) · mount point · type · options · dump · pass**. pass is **1 for root, 2 for the rest, 0 for no check**.
- After editing fstab, **verify with `mount -a` before rebooting**. Otherwise you fall into emergency mode.

## Disk Device Names and Partition Naming Rules

Linux represents disks as block device files under `/dev/`.

| Device pattern | Meaning |
|----------------|---------|
| `/dev/sda`, `/dev/sdb` | SATA/SCSI/USB disks (a=first, b=second…) |
| `/dev/sda1`, `/dev/sda2` | First and second **partitions** of sda |
| `/dev/nvme0n1` | First NVMe SSD |
| `/dev/nvme0n1p1` | First partition of nvme0n1 (note the `p` prefix) |
| `/dev/vda` | virtio disk in a virtualized environment |

Whether the number attaches directly after the disk (`sda1`) or has a `p` in between (`nvme0n1p1`) is an easy point to confuse. Devices whose names end in a digit (nvme, mmcblk, etc.) get a `p` to distinguish the partition number. `sda` ends in a letter, so appending `1` directly is unambiguous.

```bash
# Try it yourself — overview of all disks and partitions
lsblk                  # Disk-partition-mount at a glance in tree form
lsblk -f               # + filesystem type, UUID, mount point
fdisk -l               # Partition tables of all disks (root required)
cat /proc/partitions   # List of partitions the kernel recognizes
```

## MBR vs GPT — Two Partition Table Schemes

Where on the disk and in what format the partition information is written is the **partition table scheme**, and there are two main ones.

| Item | MBR (DOS) | GPT |
|------|-----------|-----|
| Introduced | 1983 (BIOS era) | 2000s (UEFI) |
| Max disk size | **2TB** | Practically unlimited (~9.4ZB) |
| Number of primary partitions | **Max 4** (worked around with extended + logical) | **128** (default) |
| Backup | Single (the disk's first sector) | **Primary + backup** (duplicated at front and back) |
| Identification | Sector-number based | **GUID/UUID** based |
| Firmware | BIOS | UEFI (+ compatible BIOS) |

MBR's "4 primary partition limit" is because the partition table has only 64 bytes (16 bytes × 4). To split further, you make one primary partition an **extended partition** and place several **logical partitions** inside it. That is why logical partition numbers in MBR always **start at 5** (`sda5`, `sda6`…). "What is the 5th partition on MBR?" → The first logical partition is the answer.

> ⚠️ **Pitfall**: A disk larger than 2TB cannot be fully used with MBR — the space beyond 2TB falls outside the addressable range. Large disks must use GPT. And GPT is properly paired with UEFI firmware.

MBR (Master Boot Record) is a 1983 design that crams bootloader code + partition table + signature into the first 512 bytes of the disk. The constraints of a PC from 40 years ago live on as fossil rules like "4 primary partitions" today. GPT removes these limits and gives each partition a unique GUID, so partitions are identified stably even if the disk order changes.

## Three Partitioning Tools: fdisk · gdisk · parted

The roles of this set of interactive tools for creating and deleting partitions are clearly divided.

| Tool | Main target | Features |
|------|-------------|----------|
| **fdisk** | MBR (newer versions also GPT) | Most traditional, interactive menu |
| **gdisk** | **GPT only** | GPT version with an interface similar to fdisk |
| **parted** | Both MBR + GPT | Scriptable, handles 2TB+ well, supports non-interactive commands |

Key keys in interactive fdisk:

```bash
fdisk /dev/sdb
# In command mode:
#   p  : print the current partition table (print)
#   n  : create a new partition (new)
#   d  : delete a partition (delete)
#   t  : change the partition type (system ID) — e.g. 82=swap, 83=Linux, 8e=LVM
#   l  : list of known type codes
#   w  : save changes and exit (write) — you must press this to apply to disk
#   q  : quit without saving (quit)
```

Until you press `w` in fdisk, **nothing is written to the disk.** All edits happen only in memory; `w` is the commit and `q` is the rollback. If you made a mistake, exit with `q` and everything is restored. On the exam, "Which command applies fdisk changes to disk?" → `w`.

parted can finish in one line non-interactively, which suits automation. Example: `parted /dev/sdb --script mklabel gpt mkpart primary ext4 0% 100%`. parted also chooses MBR/GPT with the partition table label (`mklabel msdos` / `mklabel gpt`). While fdisk handles units in sectors and cylinders, parted uses human-friendly units like `%` or `GB`.

> ⚠️ **Pitfall**: Do not mix up the partition type codes. `83`=Linux generic, `82`=Linux swap, `8e`=Linux LVM, `fd`=Linux RAID autodetect. When creating a swap partition, it works even if you don't change the type to `82`, but it helps the system automatically recognize it as swap. "What is the partition type code for LVM?" → `8e`.

```bash
# Try it yourself — partition creation flow (only on a practice disk!)
fdisk /dev/sdb          # n→p→number→specify size→w
partprobe /dev/sdb      # Ask the kernel to re-read the partition table
lsblk /dev/sdb          # Check the new partition
```

## mkfs — Formatting a Partition with a Filesystem

Creating a partition is not the end. The inside must be **initialized with a specific filesystem structure** before it can hold files. That is `mkfs` (make filesystem).

```bash
mkfs.ext4 /dev/sdb1        # Format as ext4
mkfs -t ext4 /dev/sdb1     # Same as above (type specified with -t)
mkfs.xfs /dev/sdb1         # Format as xfs
mkfs.vfat /dev/sdb1        # FAT (USB, etc.)
mke2fs -t ext4 /dev/sdb1   # Low-level tool for the ext family
```

`mkfs.ext4 file` ≡ `mkfs -t ext4 file`. `mkfs` is effectively a front end that calls the `mkfs.<type>` helper. Formatting writes the inode table, superblock, and block groups to the disk anew, so it **wipes all existing data.** The exam asks "the command to format as ext4" as a short answer.

Running `mkfs` on a **mounted partition** or a **partition in use** is a major accident. Also, formatting the whole disk (`/dev/sdb`) wipes out the partition table along with it — always specify a partition (`/dev/sdb1`). "What happens if you run mkfs on a partition that already has data?" → Everything is deleted.

```bash
# Try it yourself — check after formatting
mkfs.ext4 /dev/sdb1
blkid /dev/sdb1          # Check the newly created UUID and TYPE
tune2fs -L data /dev/sdb1   # Assign a volume label (optional)
```

## mount and umount — Attaching and Detaching Filesystems in the Tree

- Linux has no drive letters like Windows's "C:" and "D:". All storage is attached somewhere in **one single directory tree (`/`)**.
- Connecting a filesystem to a specific directory (the mount point) is `mount`.

```bash
mount /dev/sdb1 /mnt/data       # Mount sdb1 on /mnt/data
mount -t ext4 /dev/sdb1 /mnt/data   # Type specified explicitly
mount -o ro /dev/sdb1 /mnt/data     # Read-only
mount                            # Print everything currently mounted
umount /mnt/data                 # Unmount (by path or by device)
umount /dev/sdb1
```

If the directory used as a mount point **originally had files**, those files are **hidden and not visible** while mounted (not gone, just covered). They reappear after umount. That is why it is customary to use an empty directory as a mount point.

If any process is using a file inside that filesystem, `umount` is refused with **"target is busy"**. Find who is using it with `lsof /mnt/data` or `fuser -m /mnt/data`. If that doesn't work, use `umount -l` (lazy: blocks new access and detaches once the last use ends). "What is the cause when umount of a mounted partition is refused?" → A process is using it.

```bash
# Try it yourself — mount diagnosis
mount | grep sdb1            # Where is sdb1 attached?
findmnt /mnt/data           # Mount info in tree form
fuser -m /mnt/data          # PIDs of processes using it
umount /mnt/data
```

## /etc/fstab — The 6 Fields of Automatic Mounting at Boot

- The `mount` command is **temporary**. It disappears after a reboot.
- To reproduce mounts automatically at every boot, or in bulk with `mount -a`, you must register them in **`/etc/fstab`**.
- Each line has **6 fields** separated by whitespace — this is today's biggest exam battleground.

```
UUID=abc-123  /mnt/data  ext4  defaults  0  2
#    1           2        3      4        5  6
```

| # | Field | Meaning | Notes/Values |
|---|-------|---------|--------------|
| 1 | **Device (filesystem)** | UUID= / LABEL= / /dev/sdb1 | **UUID recommended** (device names go out of sync if the boot order changes) |
| 2 | **Mount point** | Directory to attach to | For swap, `none` or `swap` |
| 3 | **Filesystem type** | ext4, xfs, swap, vfat, nfs… | `auto`=auto-detect |
| 4 | **Mount options** | defaults, ro, noexec, noauto… | Comma-separated |
| 5 | **dump** | Whether to be backed up (dump) | **0**=no (almost always 0), 1=yes |
| 6 | **fsck order (pass)** | Check order at boot | **0**=no check, **1**=root (`/`), **2**=the rest |

The 6th field (pass/order) easily becomes a trap. The **root filesystem (`/`) is 1**, other filesystems to be checked are **2**, and those not to be checked (swap, network FS, etc.) are **0**. Those with 1 are checked first, then the 2s are checked in parallel. "What is the value for the root filesystem in the 6th field of fstab?" → 1.

Using a device name like `/dev/sdb1` in field 1 is risky. When you add or remove disks, the names the kernel assigns (`sdb` → `sdc`) can change and the wrong disk may get mounted. A **UUID** is a unique identifier fixed to the filesystem, so it is safe even if the order changes. The standard practice is to check the UUID with `blkid` and write it in the form `UUID=...`.

Do not confuse field 5 (dump) and field 6 (pass). Field 5 is a flag for the backup tool `dump` (almost always 0); field 6 is the `fsck` check order at boot. Also, the **`noauto`** option in field 4 means "do not auto-mount at boot; allow manual `mount` only", and **`defaults`** is the bundle `rw,suid,dev,exec,auto,nouser,async`.

Major mount options:

| Option | Meaning |
|--------|---------|
| `defaults` | Bundle of rw, suid, dev, exec, auto, nouser, async |
| `ro` / `rw` | Read-only / read-write |
| `noexec` | Forbid running executables on this FS (security) |
| `nosuid` | Ignore SUID/SGID bits (security) |
| `noauto` | Do not auto-mount at boot |
| `usrquota`,`grpquota` | Enable disk quotas (linked to Day 4) |

If you edit fstab wrongly (nonexistent device, typo), boot can fall into emergency mode. So after editing fstab, the iron rule is to **always verify with `mount -a` before rebooting**. If everything mounts without errors it is safe; if an error appears, fix that line.

```bash
# Try it yourself — writing and verifying fstab
blkid /dev/sdb1                     # Get the UUID
# After adding a line to /etc/fstab:
mount -a                            # Apply the whole fstab (verify errors!)
findmnt --verify                    # Verify fstab syntax/logic
systemctl daemon-reload            # Make systemd recognize the fstab change
```

Next, Day 3 covers LVM, which grows partitions flexibly, and virtual-memory swap.

## 📖 Glossary

- **Partition** : A section of a physical disk divided logically. Names look like `/dev/sda1`, `/dev/nvme0n1p1`.
- **MBR** : The old scheme that puts boot code and the partition table in the disk's first 512 bytes. 2TB and 4-primary-partition limits.
- **Extended/logical partitions** : A device to get around MBR's limit of 4. Logical partition numbers always **start at 5**.
- **GPT** : A modern table that identifies partitions by GUID. 128 partitions, practically unlimited capacity, table kept in duplicate at the front and back.
- **fdisk / gdisk / parted** : MBR-centric interactive tool / GPT-only tool / tool that handles both and is scriptable.
- **`w` and `q`** : In fdisk, the key that commits changes to disk and the key that exits without saving.
- **Partition type code** : `83`=Linux, `82`=swap, `8e`=LVM, `fd`=RAID.
- **`partprobe`** : A command that tells the kernel to re-read the changed partition table.
- **`mkfs`** : The format command that writes a new filesystem structure inside a partition. Wipes all existing data.
- **Mount point** : The directory to attach a filesystem to. Files that were already there are hidden during the mount.
- **`umount -l` (lazy)** : An option that, when a filesystem can't be detached because it is in use, blocks new access and detaches it once the last use ends.
- **`lsof` / `fuser -m`** : Tools that find which processes are holding that filesystem.
- **UUID** : A unique identifier fixed to the filesystem. Safe even if device names change, so it is the standard choice in fstab.
- **dump field (5th)** : Whether the entry is a target of the backup tool dump. Almost always 0 on modern systems.
- **pass field (6th)** : The `fsck` check order at boot. Root is 1, the rest 2, and 0 for no check.
- **`noexec` / `nosuid`** : Security options that block execution of executables on that filesystem or ignore the SUID bit.
- **`mount -a`** : The command that tries to mount everything listed in fstab. A mandatory pre-reboot verification step.

## 📝 Practice Questions

**Question 1.** What is the maximum number of primary partitions you can create with the MBR partition scheme?

A) 2
B) 4
C) 8
D) 128

**Answer: B**

Explanation: MBR's partition table is only 64 bytes (16 bytes × 4), so there are at most 4 primary partitions. To split further, make one primary partition an extended partition and place logical partitions inside it. GPT has 128.

---

**Question 2.** In the 6th field (fsck pass) of `/etc/fstab`, which value should be specified for the root filesystem (`/`)?

A) 0
B) 1
C) 2
D) 3

**Answer: B**

Explanation: The 6th field is the fsck check order at boot. Root (`/`) is 1, other filesystems to be checked are 2, and those not to be checked (swap, etc.) are 0. Those with 1 are checked first, then the 2s.

---

**Question 3.** Which command correctly formats the partition `/dev/sdb1` as an ext4 filesystem?

A) `mount.ext4 /dev/sdb1`
B) `fdisk.ext4 /dev/sdb1`
C) `mkfs.ext4 /dev/sdb1`
D) `fsck.ext4 /dev/sdb1`

**Answer: C**

Explanation: `mkfs.ext4` (or `mkfs -t ext4`) formats a partition as ext4. `mount` mounts, `fdisk` edits partitions, and `fsck` checks filesystems.

---

**Question 4.** What is the most common cause of a "target is busy" error when running `umount /mnt/data`?

A) The filesystem is corrupted
B) A process is using a file inside that filesystem
C) It is not registered in fstab
D) It was mounted read-only

**Answer: B**

Explanation: If a process has a file in that filesystem open or uses that directory as its working directory, umount is refused. Find the culprit with `lsof` or `fuser -m`, or handle it with `umount -l` (lazy).

---

**Question 5.** What is the main reason to use `UUID=...` instead of a device name like `/dev/sdb1` in the 1st field of `/etc/fstab`?

A) UUID mounts faster than a device name
B) To reliably identify the correct filesystem even if device names change when disks are added or removed
C) Only UUID supports read-only mounts
D) Device names are treated as syntax errors in fstab

**Answer: B**

Explanation: The `sda`/`sdb` names the kernel assigns can change with disk addition/removal or boot order. A UUID is the filesystem's unique identifier, so it points to exactly the same partition even if the order changes. Check it with `blkid`.

---

**Question 6.** Which is the interactive tool dedicated to handling GPT partition tables?

A) fdisk
B) gdisk
C) mkfs
D) tune2fs

**Answer: B**

Explanation: gdisk is a GPT-only partition editing tool that offers an interface similar to fdisk. parted handles both MBR and GPT, and older versions of fdisk were MBR-centric.

---

**Question 7.** Which partition type (system ID) code do you set with fdisk on a partition to be used for LVM (logical volumes) in Linux?

A) 82
B) 83
C) 8e
D) fd

**Answer: C**

Explanation: `8e` is the Linux LVM type. `82` is Linux swap, `83` is a generic Linux filesystem, and `fd` is Linux RAID autodetect.

---
