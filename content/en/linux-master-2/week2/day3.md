# Day 3 - File Systems: What to Lay Over the Divided Space

## 📌 Key Takeaways

- A partition is **empty land**, and a file system is the **addressing scheme** built on top of it. You create it with `mkfs`.
- The standard Linux lineage is **ext2 → ext3 → ext4**, and **journaling was introduced with ext3**.
- **Journaling** records write operations in advance so that recovery is fast even after a sudden power loss.
- An **inode** is a structure that holds a file's metadata (permissions, owner, size, location). **The file name is not in the inode.**
- The file that permanently records mount information is **`/etc/fstab`**.

## What Is a File System?

- If you only create a partition, you **still can't store files.** That's because there are no rules for where and how to write what.
- Those rules are the **file system**. The directory structure, file name length, maximum file size, and the way permissions are recorded are all decided here.

```text
   Disk  →  Partition  →  File system  →  Mount  →  Use
           (dividing)     (mkfs)         (mount)
```

## The Linux File System Lineage

| Name | Journaling | Feature |
|------|-------|------|
| **ext2** | ✗ | The early file system that was the Linux standard |
| **ext3** | **✓** | **Adds journaling** to ext2. Good compatibility |
| **ext4** | ✓ | Improved for large capacity and performance. **The most widely used today** |
| **XFS** | ✓ | Strong with large files. The **default** from RHEL 7 |
| **Btrfs** | ✓ | Rich in features such as snapshots and compression. Adopted as the default by SUSE |

> The exam point is **"since when is there journaling."** The answer is **ext3**. ext2 doesn't have it.

Lining up the three ext generations by numbers makes the differences clear (capacities assume a 4KB block size).

| Category | ext2 | ext3 | ext4 |
|------|------|------|------|
| Appeared | 1993 | 2001 | 2008 |
| Journaling | ✗ | ✓ | ✓ |
| Maximum file size | 2TB | 2TB | **16TB** |
| Maximum file system size | 16TB | 16TB | **1EB** |
| One-line summary | The early Linux standard | ext2 + journaling | Improved for large capacity and performance |

- ext3 has **the same structure as ext2 with only a journal added**, so you can convert ext2 to ext3 without deleting data (`tune2fs -j /dev/sdb1`).
- ext4 is **backward compatible** with ext3. It uses a method of writing contiguous blocks as a group (extents), which sped up handling of large files.
- **XFS** was made by Silicon Graphics (SGI) for its own Unix and ported to Linux, and **JFS** is a journaling file system made by IBM. Add **ReiserFS** to that, and all of them are journaling file systems. **Among file systems for Linux disks, the one without journaling is ext2** (the FAT family also lacks journaling, so if FAT32 is mixed in among the options, it can be an answer as well).

### Grouping by Kind

| Group | File systems | Feature |
|------|-----------|------|
| For Linux disks | ext2, ext3, ext4, XFS, Btrfs, JFS, ReiserFS | Created on a partition |
| Other OSes and removable media | FAT32 (`vfat`), exFAT, NTFS, ISO 9660 | Can be mounted and read on Linux too |
| Network | **NFS**, **SMB/CIFS** | Attach another computer's directory as if it were your own |
| Virtual (memory) | **proc**, sysfs, tmpfs | Not on disk. The kernel creates and shows them from memory |

- `/proc` is the classic virtual file system. The `/proc/version` we saw last week is not a file stored on disk but **content the kernel generates the moment you read it**.
- You can see the file systems the current kernel can handle with `cat /proc/filesystems`. A line prefixed with `nodev` is a virtual file system that doesn't need a disk device.

### What Journaling Solves

- If power goes out while writing a file, it falls into a state where **you can't tell how far it was written**.
- Journaling **first records "I am about to write this"** and then does the actual work.
- At recovery time, only that record needs to be checked, so you don't have to scan the whole disk.
- Result: **recovery time after boot becomes dramatically shorter.**

## File Systems for Other Operating Systems and Uses

| Name | Where it's used |
|------|----------|
| **FAT32** | General-purpose such as USB. Best compatibility, **4GB limit per file** |
| **exFAT** | FAT32 without the 4GB limit. Large-capacity USB |
| **NTFS** | The Windows standard |
| **ISO 9660** | CD/DVD optical media |
| **swap** | Dedicated to swap areas |
| **HFS+ / APFS** | macOS |

> The cause of the common symptom "a file over 4GB won't fit on the USB drive" is **FAT32**.

## inode: A File's ID Card

- An **inode** is a bundle of information attached to each file.

| What's in the inode | What's **NOT** in the inode |
|----------------|-------------------|
| File type, permissions | **The file name** |
| Owner and group | |
| Size | |
| Time information (modified, accessed) | |
| Location of the blocks holding the data | |

- **The file name is held by the directory.** A directory is a list recording "name ↔ inode number" pairs.
- So two files with different names can point to the same inode — this is a **hard link**.
- The number of inodes is decided when the file system is created. **Even with space left, if the inodes run out you can't create files.**

```bash
ls -i file       # Show the inode number
df -i            # Check inode usage
```

### Where inodes Sit

An ext-family file system uses a partition roughly as four regions.

| Region | What it holds |
|------|--------|
| Boot block | The very first area that may be used for booting |
| **Superblock** | Information about the **entire file system** — total size, block size, total and remaining inode counts, mount count |
| **inode table** | Information about **each individual file** |
| Data blocks | The actual contents of files |

- **The superblock is information about one file system; an inode is information about one file.** Options that swap the scope of the two appear.
- If the superblock is damaged, the whole file system can't be read, so the ext family keeps **copies in several places**. The `Superblock backups` in the `mkfs` output below is that.
- You can view the superblock contents with `tune2fs -l /dev/sdb1`.

### Hard Links and Symbolic Links

Once you know the structure "the name is in the directory, everything else in the inode," you don't need to memorize the difference between the two links.

```text
$ echo hello > a.txt
$ ln a.txt hard.txt          # Hard link
$ ln -s a.txt soft.txt       # Symbolic link (-s)
$ ls -li
total 8
1311 -rw-r--r-- 2 user user 6 Mar  4 10:12 a.txt
1311 -rw-r--r-- 2 user user 6 Mar  4 10:12 hard.txt
1312 lrwxrwxrwx 1 user user 5 Mar  4 10:12 soft.txt -> a.txt
```

- `a.txt` and `hard.txt` have **the same inode number (1311).** Two names are attached to the same file. The number `2` after the permissions is the count of those names (the **link count**).
- `soft.txt` has **its own separate inode (1312)**, and its first character is `l`. Its content is only the **path string** `a.txt`, so its size is 5 bytes.

| Category | Hard link | Symbolic link |
|------|----------|-----------|
| How to create | `ln original link` | `ln -s original link` |
| inode | **Same** as the original | Has **its own** |
| If the original is deleted | The data remains (just one fewer name) | Becomes a **broken link** |
| Across partitions (file systems) | **Not possible** — inode numbers are valid only inside a file system | Possible |
| Directories | Not possible | Possible |

## Create, Attach, and Record

| Step | Command | Description |
|------|------|------|
| Create | `mkfs.ext4 /dev/sdb1` | Create a file system on the partition (= format) |
| Attach | `mount /dev/sdb1 /data` | Connect it to a directory |
| Detach | `umount /data` | Disconnect it |
| Check | `df -h`, `mount`, `lsblk -f` | View the status |
| Inspect | `fsck /dev/sdb1` | Check and repair file system errors |
| Permanent registration | Edit `/etc/fstab` | **Auto-mount even after reboot** |

- If you only use the `mount` command, **it disappears on reboot.** To keep using it, you must write it in `/etc/fstab`.
- The rule is to run `fsck` **with the file system unmounted**. Checking while mounted can cause damage.

### The Many Faces of mkfs

There are several notations that do the same job, so they appear mixed in the options. The three below are **all the same command creating ext4**.

```bash
mkfs -t ext4 /dev/sdb1       # Specify the type with -t
mkfs.ext4 /dev/sdb1          # The type attached to the name
mke2fs -t ext4 /dev/sdb1     # The program that actually creates the ext family
```

| Command | What it creates |
|------|----------|
| `mke2fs -j /dev/sdb1` | ext3 — `-j` means journal |
| `mkfs.xfs /dev/sdb1` | XFS |
| `mkfs.vfat /dev/sdb1` | FAT |
| `mkswap /dev/sdb2` | A swap area (not a file system; the command is separate) |

```text
$ sudo mkfs.ext4 /dev/sdb1
mke2fs 1.46.5 (30-Dec-2021)
Creating filesystem with 1310720 4k blocks and 327680 inodes
Filesystem UUID: 5c1e2f0a-8d3b-4e7a-9b61-2f4d7c9a1e35
Superblock backups stored on blocks:
        32768, 98304, 163840, 229376, 294912, 819200, 884736

Allocating group tables: done
Writing inode tables: done
Creating journal (16384 blocks): done
Writing superblocks and filesystem accounting information: done
```

- On the first line you can see that `mkfs.ext4` actually calls `mke2fs`.
- **`327680 inodes`** — the number of inodes is decided at this moment. It's the basis for the statement "even with space left, if the inodes run out you can't create files."
- **`Creating journal`** — because it's ext4, a journal is created. If created as ext2, this line is absent.
- `mkfs` **erases all existing contents.** If you write the wrong partition number, it can't be undone.

### mount Options and Commonly Used Forms

```bash
mount                              # With no arguments — the list currently mounted
mount -t ext4 /dev/sdb1 /data      # Specify the type with -t (usually figured out automatically even if omitted)
mount -o ro /dev/sdb1 /data        # Specify options with -o — read-only
mount -o remount,rw /data          # Remount with changed options without detaching
mount -a                           # Mount everything listed in /etc/fstab at once
umount /data                       # Detach — you can give either the mount point or the device name
```

| Option | Meaning | Opposite |
|------|-----|------|
| `rw` | Read and write | `ro` read-only |
| `exec` | Allow running executables | `noexec` |
| `suid` | Allow the SetUID bit | `nosuid` |
| `auto` | Auto-mount at boot and at `mount -a` | `noauto` |
| `nouser` | Only root can mount | `user` regular users can too |
| **`defaults`** | `rw, suid, dev, exec, auto, nouser, async` all at once | — |

- The **directory to be used as the mount point must exist beforehand** (`mkdir /data`). Files that were originally in that directory are **hidden and not visible** while the mount is in place.
- After editing `/etc/fstab`, test it with `mount -a` before rebooting. If you reboot with a typo, booting can halt.
- The current mount state is in `/etc/mtab` (or `/proc/mounts`). **`fstab` is "what to do at boot," and `mtab` is "the current state."**

> ⚠️ **Trap**: The command to detach is **`umount`**. It's not `unmount` — there is no n. And if `umount` refuses with `target is busy`, it means someone is using that directory, and the common culprit is **your own shell that has `cd`'d into it**.

### Check Tools Differ by File System

- `fsck` is a **front end** that looks at the type and calls the appropriate program. For the ext family, `e2fsck` actually does the work.
- **XFS is checked and repaired with `xfs_repair`, not `fsck`.**
- To answer "yes" to all the questions during a check, use `fsck -y`.
- The **`lost+found`** directory at the top level of an ext-family file system is where `fsck` collects file fragments whose owner it couldn't find. Don't delete it.

### Reading One Line of /etc/fstab

```text
/dev/sdb1   /data   ext4   defaults   0   2
    │         │       │        │      │   │
    │         │       │        │      │   └── fsck check order (0 = none, 1 = root, 2 = others)
    │         │       │        │      └────── dump backup flag (usually 0)
    │         │       │        └───────────── Mount options
    │         │       └────────────────────── File system type
    │         └────────────────────────────── Mount point
    └──────────────────────────────────────── Device
```

- There are **six fields** and the order is fixed — **device · mount point · type · options · dump · fsck order**. Questions ask about the order, such as "what is the fourth field?"
- For the sixth value, **only root (`/`) gets 1**, other file systems to be checked get 2, and ones not to be checked (swap, etc.) get 0.

In the first field, a **UUID** is often written instead of the device name.

```text
$ sudo blkid /dev/sdb1
/dev/sdb1: UUID="5c1e2f0a-8d3b-4e7a-9b61-2f4d7c9a1e35" BLOCK_SIZE="4096" TYPE="ext4"

# /etc/fstab
UUID=5c1e2f0a-8d3b-4e7a-9b61-2f4d7c9a1e35   /data   ext4   defaults   0   2
```

- The letter after `sd` is the order in which the kernel discovered the disks, so if you add another disk or boot with a USB plugged in, `sdb` **can get shifted** to `sdc`.
- A UUID is a unique value assigned when the file system is created, so it stays the same even if the order changes. Check it with `blkid` or `lsblk -f`.

## Commonly Mistaken Points

1. **"Once you create a partition you can store files right away"** → You must create a file system with `mkfs` and then also `mount` it.
2. **"The inode contains the file name"** → The name is in the directory. The inode has everything except the name.
3. **"A symbolic link has the same inode as the original"** → The one that does is the **hard link**. A symbolic link has its own inode.
4. **"As long as disk space remains, you can always create files"** → If the inodes run out, you can't. Check with `df -i`.
5. **"`fsck` can be run while mounted"** → The rule is to run it unmounted.
6. **"If you write it in `/etc/mtab`, it's auto-mounted at boot"** → That role belongs to `/etc/fstab`. `mtab` merely shows the current state.

> Tomorrow we follow the path from the moment the power is switched on until the login screen appears — the boot process and the boot manager.

## 📖 Glossary

- **File system** : A system of rules for storing and managing files and directories on disk.
- **Journaling** : A technique that records work in advance so that recovery from failure is fast. Introduced with ext3.
- **inode** : A structure holding a file's permissions, owner, size, and location. It doesn't include the file name.
- **Hard link** : Another name pointing to the same inode. The data remains even if the original is deleted.
- **Mount** : Connecting a file system to a point in the directory tree.
- **`/etc/fstab`** : A configuration file recording the entries to be mounted automatically at boot.
- **mkfs** : The command that creates a file system on a partition. What's commonly called 'formatting.'
- **fsck** : The command that checks and repairs file system errors.

## 📝 Practice Questions

**Question 1.** Which of the following is the Linux file system in which journaling was first introduced?

A) ext2  
B) ext3  
C) ext4  
D) XFS  

**Answer: B**  
Explanation: ext3 is the file system that added journaling to the earlier ext2. Journaling records changes in advance so that, even after a sudden power loss, recovery is fast without a full check. ext2 has no journaling, and ext4 and XFS came later.

---

**Question 2.** Which of the following is information NOT stored in the inode?

A) The file's access permissions  
B) The file's owner and group  
C) The file's size  
D) The file's name  

**Answer: D**  
Explanation: The inode holds metadata such as a file's permissions, owner, size, time information, and data block locations, but doesn't include the file name. The file name is managed by the directory in the form of "name and inode number pairs." Thanks to this structure, hard links, where several names point to one inode, are possible.

---

**Question 3.** Which of the following is the configuration file that records the file systems to be mounted automatically at boot?

A) /etc/mtab  
B) /etc/inittab  
C) /etc/fstab  
D) /etc/passwd  

**Answer: C**  
Explanation: `/etc/fstab` records the device, mount point, file system type, mount options, dump flag, and fsck check order, and entries are mounted automatically at boot. If you only use the `mount` command, it disappears after a reboot. `/etc/mtab` holds the current mount state, and `/etc/passwd` holds user account information.

---

**Question 4.** Which of the following is a file system in which a single file cannot exceed 4GB, limiting storage of large files?

A) FAT32  
B) NTFS  
C) ext4  
D) XFS  

**Answer: A**  
Explanation: FAT32 has very good compatibility and is widely used on USB sticks, but a single file size is limited to 4GB. exFAT removed this limit. NTFS, ext4, and XFS can handle much larger files.

---

**Question 5.** Which of the following is the command that creates a file system on a partition?

A) fsck  
B) mkfs  
C) mount  
D) fdisk  

**Answer: B**  
Explanation: `mkfs` (make filesystem) is the command that creates a file system on a partition, corresponding to what's commonly called formatting. You use it with a type specified, as in `mkfs.ext4`. `fdisk` is the step that divides partitions, `mount` is the step that connects the created file system to a directory, and `fsck` is the command that checks for errors.
