# Day 3 - LVM and Swap: PV·VG·LV Layers · From pvcreate to lvextend·resize2fs · mkswap·swapon

## 📌 Key Takeaways

- LVM inserts an **abstraction layer** between disks and volumes, separating logical usage from physical constraints.
- Three layers: **PV (disk) → VG (pool) → LV (unit of use)**. Creation goes `pvcreate` → `vgcreate` → `lvcreate`.
- Extension is **two steps** — `lvextend` (the container) + `resize2fs`/`xfs_growfs` (the contents). If the VG is short on space, `vgextend` comes first.
- **xfs cannot be shrunk**, and `xfs_growfs` takes a mount point. ext4's `resize2fs` can grow online; shrinking requires unmounting.
- Swap is not a filesystem — initialize it with `mkswap` and turn it on with **`swapon`**; in fstab it is `none swap sw 0 0`.

## The Three Layers of LVM: PV → VG → LV

With traditional partitions, once you fix the size, growing it is tricky. Even if the neighboring partition has spare room, you cannot borrow it unless it is physically adjacent. LVM breaks this rigidity by bundling physical disks into a single storage pool.

| Layer | Abbr. | What it is | Analogy |
|-------|-------|------------|---------|
| **Physical Volume** | **PV** (Physical Volume) | A disk/partition incorporated into LVM | The **bottles** you pour into the water tank |
| **Volume Group** | **VG** (Volume Group) | A storage pool bundling PVs | The **water tank** made by combining the bottles |
| **Logical Volume** | **LV** (Logical Volume) | A unit of use cut from the VG | The **cups** drawn from the tank |

- Flow: turn a disk/partition into a PV with `pvcreate` → bundle several PVs into a VG with `vgcreate` → cut LVs from the VG with `lvcreate` → format the LV with `mkfs` and mount it for use.

```bash
# Full creation flow (example using disks sdb, sdc)
pvcreate /dev/sdb1 /dev/sdc1        # 1) Make the two partitions PVs
vgcreate myvg /dev/sdb1 /dev/sdc1   # 2) Bundle them into a VG named myvg
lvcreate -L 10G -n mylv myvg        # 3) Create a 10G LV 'mylv' from myvg
mkfs.ext4 /dev/myvg/mylv            # 4) Format
mount /dev/myvg/mylv /mnt/data      # 5) Mount
```

An LV's device path appears in two forms — `/dev/<VG name>/<LV name>` (e.g., `/dev/myvg/mylv`) and `/dev/mapper/<VG>-<LV>` (e.g., `/dev/mapper/myvg-mylv`). They are aliases for the same thing. You can use either in fstab, but an LV also has its own unique UUID that can be checked with `blkid`.

A VG manages space by slicing it into fixed-size chunks called **PE (Physical Extent)** (default 4MB). An LV's size is in fact an integer multiple of PEs. Using lowercase `-l` as in `lvcreate -l 100 myvg` specifies "number of PEs", while uppercase `-L 400M` specifies "capacity". Thanks to the PE concept, an LV looks like one contiguous volume even when scattered across several PVs.

The power of LVM is that it handles capacity "without turning the disk off". When `/var` on a running server fills up, you add a new disk as a PV to grow the VG (`vgextend`), extend the LV (`lvextend`), and then extend the filesystem — and space grows with no service interruption. This flexibility, impossible with traditional partitions, is why LVM became the standard on servers.

## Extending an LV: lvextend and resize2fs/xfs_growfs

The representative scenario is **extending an LV**. The key is that it splits into two steps.

1. **Grow the LV (the container) itself** — `lvextend`
2. **Grow the filesystem on top of it** — `resize2fs` (ext) or `xfs_growfs` (xfs)

```bash
# Extend an LV by another 5G when the VG has spare room
lvextend -L +5G /dev/myvg/mylv     # Add +5G (absolute value is -L 15G)
resize2fs /dev/myvg/mylv           # Fit the ext4 filesystem to the LV size
# For xfs:
xfs_growfs /mnt/data               # (specify the mount point, online growth)

# Both steps at once (ext only, -r = also resize the fs):
lvextend -r -L +5G /dev/myvg/mylv
```

**Even if you grow the LV, the filesystem on it does not grow automatically.** `lvextend` only enlarges the "container"; the "contents (filesystem)" inside must be grown separately with `resize2fs`/`xfs_growfs`. The trap is skipping this second step and ending up with "the LV grew but `df` shows the same capacity". Exam: "What command reflects the capacity in ext4 after lvextend?" → `resize2fs`.

> ⚠️ **Pitfall**: `resize2fs` (ext4) can **grow online (while mounted)**, but **shrinking works only after unmounting**. **xfs, on the other hand, cannot be shrunk at all** (`xfs_growfs` is grow-only). So "How do you shrink an xfs LV?" → The only way is to back up and recreate. The grow arguments also differ — `resize2fs` takes the device path, while `xfs_growfs` takes the mount point.

If the VG has no free space, you must **grow the VG before extending the LV**. After making a new disk a PV with `pvcreate`, incorporate it into the VG with `vgextend myvg /dev/sdd1` and the VG's available PEs increase. Check the free room with "Free PE / Size" in `vgdisplay myvg`. Overall order: pvcreate → vgextend → lvextend → resize2fs.

```bash
# Try it yourself — three ways to inspect LVM state
pvs / pvdisplay        # PV list / details
vgs / vgdisplay        # VG list / details (check Free PE)
lvs / lvdisplay        # LV list / details
lsblk                  # Disk-PV-LV relationship tree
```

## LVM Commands at a Glance

Major commands per layer in a table — for short-answer prep.

| Action | PV | VG | LV |
|--------|----|----|-----|
| Create | `pvcreate` | `vgcreate` | `lvcreate` |
| Display (brief/detailed) | `pvs`/`pvdisplay` | `vgs`/`vgdisplay` | `lvs`/`lvdisplay` |
| Extend | — | `vgextend` | `lvextend` |
| Shrink/remove | `pvremove` | `vgreduce`/`vgremove` | `lvreduce`/`lvremove` |
| Rename | — | `vgrename` | `lvrename` |

> ⚠️ **Pitfall**: Do not confuse `-L` (uppercase, capacity: `-L 10G`) and `-l` (lowercase, PE count/percentage: `-l 100` or `-l 100%FREE`) in `lvcreate`. "Create an LV using all the remaining space of the VG" is `lvcreate -l 100%FREE -n mylv myvg`. And `-n` is the option that specifies the LV name.

An LVM snapshot (`lvcreate -s`) "freezes" an LV at a point in time to guarantee consistency during a backup. It stores only the changes separately with CoW (Copy-on-Write), so it uses almost no space at first. Even if the original changes during the backup, the snapshot preserves that moment.

## Swap — Turning Disk into Virtual Memory

- **Swap** is an area that, when physical memory (RAM) runs short, temporarily moves memory pages that are not in use to disk (swap out) to free up RAM.
- Swap is **not a filesystem** — you do not mount it; you initialize it with a dedicated format (`mkswap`) and register it with the kernel (`swapon`) to use it.
- **Swap partition**: a dedicated partition with partition type `82`
- **Swap file**: using a regular file as swap (flexible but slightly slower)

```bash
# Creating a swap partition
mkswap /dev/sdb2           # Initialize the partition as a swap area
swapon /dev/sdb2           # Activate
swapoff /dev/sdb2          # Deactivate

# Creating a swap file (2GB)
dd if=/dev/zero of=/swapfile bs=1M count=2048   # or fallocate -l 2G /swapfile
chmod 600 /swapfile        # 600 recommended for security
mkswap /swapfile
swapon /swapfile

# Check status
swapon -s          # or cat /proc/swaps
free -h            # Check total/used in the Swap row
```

`mkswap` does not create a filesystem; it is a separate operation that **writes a swap signature and header**. That is why swap is turned on with `swapon`, not `mount`. "What is the command to initialize a swap area?" → `mkswap`, "To activate it?" → `swapon` are the standard short answers.

To activate swap automatically at boot, register it in fstab. But the format differs from a regular filesystem — **`none` (or `swap`) in the mount point slot, `swap` for the type, `sw` for the options**, and pass and dump are 0:
```
/dev/sdb2  none  swap  sw  0  0
/swapfile  none  swap  sw  0  0
```
After registering, activate all swaps in fstab in bulk with `swapon -a`.

How aggressively the kernel uses swap is controlled by `vm.swappiness` (0 to 100, default 60). A low value uses RAM as much as possible and spares swap, while a high value pushes to swap early. Change it temporarily with `sysctl vm.swappiness=10`, and make it permanent by writing it in `/etc/sysctl.conf`. Database servers often set swappiness low because performance plunges once swapping occurs.

Swap size was once orthodoxly "2x RAM", but that has lost meaning on modern systems with tens of GB of RAM. However, to use **hibernation (hibernate, saving all of RAM to disk)**, swap must be at least as large as RAM — because it has to hold the entire RAM contents. This exception is worth knowing.

```bash
# Try it yourself — full swap flow
free -h                    # Current memory/swap
swapon -s                  # List of active swap
fallocate -l 1G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
swapon -s                  # Was /swapfile added?
swapoff /swapfile          # Clean up
```

Next, Day 4 covers parity by RAID level and mdadm, disk quotas, and the inspection tools fsck·df·du·lsblk·blkid.

## 📖 Glossary

- **LVM** : A logical volume manager that inserts an abstraction layer between disks and volumes to enable non-disruptive growth.
- **PV (Physical Volume)** : A disk or partition incorporated into LVM. Corresponds to the bottles poured into the pool.
- **VG (Volume Group)** : A storage pool bundling PVs. Space is carved from it to make LVs.
- **LV (Logical Volume)** : The actual unit of use cut from a VG. You format it and mount it to use.
- **PE (Physical Extent)** : The fixed-size chunk (default 4MB) in which a VG manages space. An LV's size is an integer multiple of PEs.
- **`-L` vs `-l`** : Specify by capacity (`-L 10G`) versus by PE count or percentage (`-l 100%FREE`).
- **`/dev/mapper/VG-LV`** : Another path notation pointing to the same target as `/dev/VG/LV`.
- **`lvextend` + `resize2fs`** : The step that grows the container and the step that grows the filesystem inside it. You need both for `df` to reflect it.
- **`xfs_growfs`** : The xfs-only grow command. Takes the **mount point** as an argument, and shrinking is impossible.
- **`vgextend`** : The command that adds a new PV to a VG to grow the pool. If there is no spare room before extending an LV, this comes first.
- **LVM snapshot** : A feature that freezes a point in time with `lvcreate -s`. Being CoW, only the changes take up space.
- **Swap** : A disk area that evacuates unused pages when RAM is short. Not a filesystem.
- **`mkswap` / `swapon` / `swapoff`** : Initialize / activate / deactivate a swap area.
- **`vm.swappiness`** : A value (0 to 100, default 60) that decides how aggressively the kernel uses swap.
- **Hibernation** : A feature that saves all RAM contents to disk. That is why swap must be at least as large as RAM.

## 📝 Practice Questions

**Question 1.** Which lists the LVM layers in the correct order from bottom to top (physical → logical)?

A) LV → VG → PV
B) PV → LV → VG
C) PV → VG → LV
D) VG → PV → LV

**Answer: C**

Explanation: Disks/partitions are made into PVs (Physical Volumes), several PVs are bundled into a VG (Volume Group) pool, and LVs (Logical Volumes) are cut from the VG. The creation commands also go in the order pvcreate→vgcreate→lvcreate.

---

**Question 2.** After extending an LV with `lvextend -L +5G /dev/myvg/mylv`, which additional command must you run to actually reflect the capacity in the ext4 filesystem on top of it?

A) `mkfs.ext4 /dev/myvg/mylv`
B) `resize2fs /dev/myvg/mylv`
C) `xfs_growfs /dev/myvg/mylv`
D) `mount -a`

**Answer: B**

Explanation: lvextend grows only the LV (the container). To fit the ext-family filesystem capacity to the LV size, you must run `resize2fs` separately. For xfs, use `xfs_growfs` (mount point argument).

---

**Question 3.** Which statement about the swap area is NOT correct?

A) It is initialized by writing a swap signature with `mkswap`
B) It is activated with `swapon` and deactivated with `swapoff`
C) It is mounted on a directory with the `mount` command like a regular filesystem
D) Not only a swap partition but also a regular file (swap file) can be used as swap

**Answer: C**

Explanation: Swap is not a filesystem, so it is not mounted. Initialize it with `mkswap` and register it with the kernel using `swapon`. Check active swap with `swapon -s` or `/proc/swaps`.

---

**Question 4.** When the existing VG has no free space, you want to add a new disk `/dev/sdd1` and extend an LV. What is the correct command order?

A) lvextend → pvcreate → vgextend → resize2fs
B) pvcreate → vgextend → lvextend → resize2fs
C) vgextend → pvcreate → lvextend → resize2fs
D) pvcreate → lvextend → vgextend → resize2fs

**Answer: B**

Explanation: Make the new disk a PV (`pvcreate`), incorporate it into the VG to grow the pool (`vgextend`), extend the LV (`lvextend`), then grow the filesystem (`resize2fs`).

---

**Question 5.** What is the correct format for registering the swap partition `/dev/sdb2` in `/etc/fstab` so it activates automatically at boot?

A) `/dev/sdb2  /swap  swap  defaults  0  2`
B) `/dev/sdb2  none   swap  sw        0  0`
C) `/dev/sdb2  swap   ext4  sw        1  1`
D) `/dev/sdb2  /mnt   swap  auto      0  1`

**Answer: B**

Explanation: Swap has no mount point, so use `none` (or swap), the type is `swap`, the option is `sw`, and dump and pass are both 0. Activate in bulk with `swapon -a`.

---

**Question 6.** Which command correctly creates an LV using all of the VG's remaining space?

A) `lvcreate -L 100% -n mylv myvg`
B) `lvcreate -l 100%FREE -n mylv myvg`
C) `lvextend -L 100% myvg`
D) `vgcreate -l 100%FREE mylv myvg`

**Answer: B**

Explanation: `-l` (lowercase) specifies a PE count/percentage, and `100%FREE` means all of the VG's remaining space. `-n` is the LV name, and `-L` (uppercase) specifies an absolute capacity.

---

**Question 7.** Which statement about an LV formatted with the xfs filesystem is correct?

A) It can be both grown and shrunk with `xfs_growfs`
B) It can be grown online with `resize2fs`
C) It can only be grown with `xfs_growfs`, and shrinking is impossible
D) It cannot be grown while mounted

**Answer: C**

Explanation: xfs can only be grown online with `xfs_growfs` (mount point argument) and does not support shrinking. To shrink it, back up and recreate. `resize2fs` is exclusive to the ext family.

---
