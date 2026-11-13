# Day 2 - Partitions: How to Divide a Disk

## 📌 Key Takeaways

- The **MBR** scheme can create only **up to 4** primary partitions; if you need more, you create **logical partitions inside an extended partition**.
- **GPT** removes MBR's limits (2TB, 4 partitions) and is paired with **UEFI**.
- In device names, **`/dev/sda` is the first disk** and `/dev/sda1` is its first partition.
- The minimal layout is just two: **`/` (root) and swap**. Separating `/boot` and `/home` on top of that is a common choice.
- The partitioning tools are **`fdisk` (MBR), `gdisk` (GPT), and `parted` (both)**.

## Why Divide?

There are reasons to divide a disk rather than use it whole.

- **Isolation**: If `/home` is kept separate, then even if logs run wild and fill up `/var`, user data stays safe.
- **Easier reinstallation**: If `/home` is separate, personal files survive even when you wipe and replace the distribution.
- **Per-purpose tuning**: Each partition can have a different file system and mount options.
- **Securing swap**: Swap needs a separate partition (or file).

## MBR and GPT

| Category | MBR | GPT |
|------|-----|-----|
| Full name | Master Boot Record | GUID Partition Table |
| Maximum disk size | **2TB** | Practically unlimited |
| Number of primary partitions | **Up to 4** | 128 or more |
| Paired firmware | BIOS | **UEFI** |
| Backup of partition info | None (a single first sector) | A copy kept at the end of the disk |

- **2TB and 4** — memorize MBR's two limits as numbers and most questions can be solved.
- Most newly installed systems these days use the **UEFI + GPT** combination.

### Why Exactly 4, Why Exactly 2TB?

These two numbers aren't arbitrarily set rules; they come from the fact that **the space MBR occupies is only 512 bytes**.

```text
   First sector of the disk (512 bytes) = MBR
  ┌──────────────────────────┬─────────────────────┬──────────┐
  │  Bootloader code 446 B    │ Partition table 64 B │ Signature 2 B │
  └──────────────────────────┴─────────────────────┴──────────┘
                                16-byte slot × 4
```

- Recording one partition takes 16 bytes and there are only 64 bytes of room, so **4 slots** is all there is. That's why there are 4 primary partitions.
- Each slot records the partition's start position and size as **32-bit numbers** (in sectors). Since one sector is 512 bytes, 2³² × 512 bytes = **2TB** is the limit of what can be expressed.
- The first 446 bytes are the place for the **bootloader**. The statement "BIOS reads the bootloader from the MBR" points to exactly this area.

GPT discards this structure and puts a generous, separate table at the front of the disk.

- It records partition positions in 64 bits, so the capacity limit has practically vanished, and it provides **128** slots by default. The distinction of extended and logical partitions is **no longer needed.**
- It puts one more **copy of the table at the very end of the disk**. Even if the front is damaged, it can be recovered.
- In the very first sector it leaves a **protective MBR**. This is a device to prevent old tools that don't know GPT from mistaking the disk for "empty" and overwriting it.
- Each partition gets a unique identifier (**GUID**). This is the G in the name.

### The Three Kinds of MBR Partitions

```text
  ┌──────────────────────────────────────────────┐
  │  Primary partitions   up to 4                  │
  │  ┌────┬────┬────┬──────────────────────────┐ │
  │  │sda1│sda2│sda3│  Extended partition       │ │
  │  │    │    │    │  ┌──────┬──────┬───────┐  │ │
  │  │    │    │    │  │ sda5 │ sda6 │ sda7  │  │ │
  │  │    │    │    │  │ Logical               │  │ │
  │  │    │    │    │  └──────┴──────┴───────┘  │ │
  │  └────┴────┴────┴──────────────────────────┘ │
  └──────────────────────────────────────────────┘
```

| Kind | Description |
|------|------|
| **Primary** | A partition you actually use. Up to 4 |
| **Extended** | A **shell** that holds logical partitions. You can't put data directly in it. Only **1** per disk |
| **Logical** | A partition created inside the extended partition. Numbering **starts from 5** |

> Two traps. ① An extended partition is **not storage space in itself.** ② Logical partition numbers start at `sda5` — even if there are only 2 primary partitions, logical ones start at 5.

## Reading Device Names

```text
   /dev/sda1
        │││
        ││└── Partition number (from 1)
        │└─── Disk order (a = first, b = second ...)
        └──── Device type
```

| Notation | Meaning |
|------|-----|
| `/dev/hda` | The first disk of the **IDE** type (old notation) |
| `/dev/sda` | The first **SATA, SCSI, or USB** disk |
| `/dev/sdb2` | The second partition of the second disk |
| `/dev/nvme0n1p1` | The first partition of an NVMe SSD |
| `/dev/sr0` | Optical drive (CD/DVD) |
| `/dev/vda` | The virtual disk of a virtual machine (KVM) |
| `/dev/fd0` | Floppy disk drive |

With the old IDE type, the motherboard had two cables (primary and secondary), and each cable had two devices (master and slave). So the letter after `hd` was decided by **where it was connected**.

| Device name | Connection location |
|--------|----------|
| `/dev/hda` | primary master |
| `/dev/hdb` | primary slave |
| `/dev/hdc` | secondary master |
| `/dev/hdd` | secondary slave |

- The `sd` family is different. a, b, c are assigned **in the order the kernel discovered them**, not by location. When you plug in a USB stick, it gets the next letter that is still free at that moment.
- NVMe has three pieces: `nvme0` (controller) · `n1` (storage space) · `p1` (partition). It differs from `sda1` in that **a `p` is added** before the partition number.

> ⚠️ **Trap**: `/dev/sda` is the **whole disk** and `/dev/sda1` is **a partition inside it**. You pass the disk (`/dev/sda`) to `fdisk`, which divides partitions, and the partition (`/dev/sda1`) to `mkfs`, which creates file systems. One digit's difference makes the target completely different.

## Which Mount Points to Divide Into

| Mount point | What it holds | Why separating is good |
|--------------|--------|------------------|
| **`/`** (root) | Everything else | **Must exist** |
| **swap** | Spare space used when memory runs short | Needs a separate area |
| `/boot` | Kernel and bootloader files | Essential for booting, keep it small (about 1GB) |
| `/home` | Users' personal files | Data is preserved even on reinstall |
| `/var` | Logs, mail, DB, and other **frequently changing** data | Prevents the system from halting due to runaway logs |
| `/tmp` | Temporary files | Anyone can write to it, so runaway risk |

- **The minimal layout is the two: `/` and swap.** If the exam asks what is "absolutely required," the answer is `/`.
- A UEFI system additionally needs an **EFI System Partition (ESP, `/boot/efi`)**.

### swap Size

- Old rule: **1 to 2 times the memory**.
- Memory is large these days, so it isn't applied as-is. With 8GB or more, it's often set equal to or less than the memory.
- To use **hibernation**, you need at least the memory size.
- The exam still sometimes asks the classic **"1 to 2 times"** rule.

Swap is not a place for storing files, so **there are separate commands both for creating it and for turning it on**.

| Command | What it does |
|------|--------|
| `mkswap /dev/sda2` | Initializes the partition as a swap area (it's not `mkfs`) |
| `swapon /dev/sda2` | Turns swap on (it's not `mount`) |
| `swapoff /dev/sda2` | Turns swap off |
| `swapon -s` | Lists the swap that's on. Same content as `cat /proc/swaps` |
| `free -h` | Shows memory and swap usage together |

- Swap isn't attached to the directory tree, so it has **no mount point.** It doesn't show up in `df` either.
- To make it turn on automatically at every boot, write a line like `/dev/sda2  swap  swap  defaults  0  0` in `/etc/fstab` (we cover this tomorrow).

## Partitioning Tools

| Command | Scheme it handles | Feature |
|------|-----------|------|
| `fdisk` | MBR (recent versions GPT too) | The most traditional interactive tool |
| `gdisk` | GPT only | Operates similarly to `fdisk` |
| `parted` | Both MBR and GPT | Can even resize, good for scripting |
| `df` | — | Checks the **usage** of mounted partitions |
| `lsblk` | — | Shows the **structure** of disks and partitions as a tree |

```bash
sudo fdisk -l          # List of disks and partitions
lsblk                  # View as a tree
df -h                  # Usage of mounted partitions
```

### Reading the Output

```text
$ sudo fdisk -l /dev/sda
Disk /dev/sda: 20 GiB, 21474836480 bytes, 41943040 sectors
Units: sectors of 1 * 512 = 512 bytes
Disklabel type: dos

Device     Boot   Start      End  Sectors Size Id Type
/dev/sda1  *       2048  2099199  2097152   1G 83 Linux
/dev/sda2       2099200  6293503  4194304   2G 82 Linux swap / Solaris
/dev/sda3       6293504 41943039 35649536  17G 83 Linux
```

- **`Disklabel type`** is the partitioning scheme. **`dos` means MBR, and `gpt` means GPT.** Be careful: the letters "MBR" don't appear.
- The `*` in the `Boot` column marks the partition flagged as bootable.
- **`Id`** is a hexadecimal code indicating the partition's purpose.

| Id | Type |
|----|------|
| **83** | Linux — an ordinary Linux partition |
| **82** | Linux swap — swap |
| **5** | Extended — an extended partition |
| 7 | HPFS/NTFS/exFAT — a Windows partition |
| b | W95 FAT32 |

```text
$ lsblk
NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda      8:0    0   20G  0 disk
├─sda1   8:1    0    1G  0 part /boot
├─sda2   8:2    0    2G  0 part [SWAP]
└─sda3   8:3    0   17G  0 part /
sr0     11:0    1 1024M  0 rom
```

- The line with `TYPE` of `disk` is the disk, and the `part` lines beneath are partitions. Swap is shown as `[SWAP]` instead of a mount point.
- `fdisk -l` shows **how it's divided**, and `df -h` shows **the usage of what's mounted**. A partition that was created but not mounted **does not appear** in `df`.

### Commands Used Inside fdisk

If you enter by specifying a disk like `fdisk /dev/sdb`, you get an interactive screen that accepts one-letter commands.

| Key | Meaning | Mnemonic |
|----|-----|-------|
| `m` | Help | menu |
| `p` | Print the current partition table | print |
| `n` | Create a new partition | new |
| `d` | Delete a partition | delete |
| `t` | Change the partition type (Id) | type |
| `l` | List the type codes | list |
| `w` | **Save and exit** | write |
| `q` | **Exit without saving** | quit |

```text
$ sudo fdisk /dev/sdb
Command (m for help): n
Partition type
   p   primary (0 primary, 0 extended, 4 free)
   e   extended (container for logical partitions)
Select (default p): p
Partition number (1-4, default 1): 1
First sector (2048-41943039, default 2048):
Last sector, +/-sectors or +/-size{K,M,G,T,P} (2048-41943039, default 41943039): +5G

Created a new partition 1 of type 'Linux' and of size 5 GiB.

Command (m for help): w
The partition table has been altered.
```

- The `p` (primary) and `e` (extended) the screen asks about are the primary and extended partitions we saw earlier. `4 free` is the number of remaining primary partition slots.
- For the size, it's usual to write something like **`+5G`** rather than an end sector number.
- For a partition to be used as swap, change its type to **82** with `t`.

> ⚠️ **Trap**: Work done inside `fdisk` **is not written to disk until you press `w`.** If you made a mistake, exit with `q` and it's as if nothing happened. Conversely, if you leave without `w`, everything you carefully divided disappears. Options that swap the keys for "save and exit" and "exit without saving" are easily used as wrong answers.

## Commonly Mistaken Points

1. **"MBR can create only up to 4 partitions"** → It's up to 4 **primary partitions**. If you create logical partitions inside an extended partition, you can have more.
2. **"With 3 primary + 1 extended, logical starts at 4"** → Numbers 1 to 4 are **reserved** for primary and extended. Logical always starts at 5.
3. **"GPT also has extended partitions"** → It doesn't. With plenty of slots, they aren't needed.
4. **"Swap is also created with `mkfs` and attached with `mount`"** → It's `mkswap` and `swapon`.
5. **"If `fdisk -l` shows `dos`, it's a Windows disk"** → It means the **MBR scheme**, regardless of operating system.
6. **"`/dev/sdb` is the second partition"** → It's the second **disk**. A partition has a number after it.

> Tomorrow we look at what goes onto the divided partitions — the types of file systems and their differences.

## 📖 Glossary

- **Partition** : A logically divided region of a single disk.
- **MBR** : Master Boot Record. The traditional partitioning scheme with limits of 2TB and 4 primary partitions.
- **GPT** : GUID Partition Table. A scheme that removes MBR's limits and is used together with UEFI.
- **Primary partition** : A partition that holds actual data. Up to 4 in MBR.
- **Extended partition** : A shell for holding logical partitions. One per disk, can't store directly.
- **Logical partition** : A partition created inside an extended partition. Numbering starts from 5.
- **Swap** : An area where disk is used as temporary memory when memory runs short.
- **Mount point** : The point that specifies where in the directory tree a partition is attached.
- **ESP** : EFI System Partition. Needed for UEFI booting and usually mounted at `/boot/efi`.

## 📝 Practice Questions

**Question 1.** Which of the following is the maximum number of primary partitions you can create in the MBR scheme?

A) 1  
B) 2  
C) 8  
D) 4  

**Answer: D**  
Explanation: The MBR partition table can hold information for only up to 4 primary partitions. If you need more partitions than that, you make one of the primary partition slots an extended partition and create several logical partitions inside it. GPT has no such limit and supports 128 or more.

---

**Question 2.** Which of the following correctly describes an extended partition?

A) You can create several per disk  
B) It's a space for holding logical partitions and doesn't store data directly  
C) It can be used only in the GPT scheme  
D) It has faster access speed than a primary partition  

**Answer: B**  
Explanation: An extended partition serves only as a shell holding logical partitions and doesn't store files itself. Only one can be created per disk, and it's used to get past the 4-primary-partition limit in the MBR scheme. Logical partitions inside an extended partition are numbered from 5.

---

**Question 3.** Which of the following is the device name for the first partition of the second SATA disk?

A) /dev/sdb1  
B) /dev/sda2  
C) /dev/hdb1  
D) /dev/sdb5  

**Answer: A**  
Explanation: SATA, SCSI, and USB disks start with `sd`; the letter after it is the disk order (a = first, b = second) and the number is the partition number. So the first partition of the second disk is `/dev/sdb1`. `hd` is the old IDE notation, and number 5 is a number given to logical partitions.

---

**Question 4.** Which of the following is the mount point that must be specified when installing Linux?

A) /home  
B) /var  
C) / (root)  
D) /tmp  

**Answer: C**  
Explanation: Root (`/`) is the starting point of the entire file system, so it must exist. `/home`, `/var`, and `/tmp` offer management advantages when separated but are not required, and if not separated they are contained within the root partition. Swap is a separate area but has no mount point.

---

**Question 5.** Which of the following correctly pairs the limits of the MBR scheme?

A) Maximum 512GB, 2 primary partitions  
B) Maximum 1TB, 8 primary partitions  
C) Maximum 4TB, 16 primary partitions  
D) Maximum 2TB, 4 primary partitions  

**Answer: D**  
Explanation: MBR has two constraints: a maximum disk size of 2TB and a maximum of 4 primary partitions. GPT appeared to get past these limits; it supports practically unlimited capacity and 128 or more partitions, and is used together with UEFI firmware.
