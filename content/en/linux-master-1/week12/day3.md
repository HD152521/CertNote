# Day 3 - Disk, LVM, and Permission Task Questions: Solving Scenarios in Command Order

## 📌 Key Points

- In task-style questions, **a wrong order ruins everything**. Memorize the whole sequence, not a single command.
- Four steps to add a disk: **partition (fdisk) → format (mkfs) → mount (mount) → register in fstab**. If the requirement says "persists after reboot", fstab is mandatory.
- LVM is built in the order **pvcreate → vgcreate → lvcreate**, and removed in the reverse order.
- Capacity expansion is **vgextend (grow the pool) → lvextend (grow the LV) → resize2fs/xfs_growfs (grow the filesystem)**. If you skip the last step, the capacity does not increase.
- umask is a **mask subtracted from the defaults** - from 666 for files and 777 for directories. `022` → 644 / 755.
- Special permissions: **SetUID 4000** (run with the owner's privileges), **SetGID 2000** (group inheritance), **Sticky 1000** (delete only your own files). `/tmp`=1777, `passwd`=4755.

## General Disk Work: Partition → Filesystem → Mount → fstab

- This is the standard four-step flow for adding a new disk `/dev/sdb` and mounting it on `/data`.

```bash
# [Step 0] Confirm the disk is recognized
fdisk -l                 # list all disks and partitions
lsblk                    # view block devices as a tree

# [Step 1] Create a partition (fdisk or parted)
fdisk /dev/sdb
# Interactive: n (new partition) → p (primary) → number → size → w (write)

# [Step 2] Create a filesystem (format)
mkfs -t ext4 /dev/sdb1   # format as ext4
mkfs.ext4 /dev/sdb1      # same as above
mkfs -t xfs /dev/sdb1    # format as xfs
mkfs.xfs /dev/sdb1       # same as above

# [Step 3] Create a mount point and mount
mkdir /data
mount /dev/sdb1 /data    # temporary mount (lost on reboot)
mount -t ext4 /dev/sdb1 /data   # specify the type

# [Step 4] Register in fstab (persistent mount)
# Add to /etc/fstab:
# /dev/sdb1   /data   ext4   defaults   0 2
mount -a                 # re-mount everything in fstab (also validates syntax)
df -h                    # check the mount result
```

| Step | Command | Purpose |
|------|------|------|
| 1 Partition | `fdisk /dev/sdb` | Divide the disk into partitions |
| 2 Format | `mkfs -t ext4 /dev/sdb1` | Create a filesystem |
| 3 Mount | `mount /dev/sdb1 /data` | Attach to a directory |
| 4 Make persistent | Register in `/etc/fstab` + `mount -a` | Auto-mount at boot |

The "add a disk and mount it" task always follows the order **partition → format (mkfs) → mount (mount) → register in fstab**. If any one of these four steps is missing, the task is incomplete. In particular, if the requirement says "persists after reboot", you must go all the way to the fstab registration.

> ⚠️ **Trap**: You format the partition (`/dev/sdb1`), not the whole disk (`/dev/sdb`). Also, `mount` alone is lost on reboot - a persistent mount requires registration in `/etc/fstab`. `mount -a` re-mounts every entry in fstab, so use it to verify after writing fstab.

```bash
# Create a swap partition/file
mkswap /dev/sdb2         # create the swap area
swapon /dev/sdb2         # activate swap
swapon -s                # list active swap
free -h                  # memory and swap usage
# fstab: /dev/sdb2  none  swap  sw  0 0
```

To check mount information, use `mount` (current mount list), `df -h` (capacity and usage), `lsblk` (device tree), and `blkid` (UUID and type). To mount by UUID, find the UUID with `blkid` and write it in fstab in the form `UUID=...`. Device names (`/dev/sdb1`) can change when disks are added, so UUIDs are safer.

## LVM Work: PV → VG → LV → Expansion

- LVM is a layered structure for flexibly combining and dividing disks.
- You stack it in the order **physical volume (PV) → volume group (VG) → logical volume (LV)**.

```bash
# [Step 1] Create physical volumes (PV) - initialize disks/partitions for LVM
pvcreate /dev/sdb /dev/sdc
pvscan                   # PV list
pvdisplay                # PV details

# [Step 2] Create a volume group (VG) - combine the PVs into one
vgcreate vg_data /dev/sdb /dev/sdc
vgscan
vgdisplay                # VG details (check free space)

# [Step 3] Create a logical volume (LV) - carve it out of the VG
lvcreate -L 10G -n lv_app vg_data    # create a 10GB lv_app
lvcreate -l 100%FREE -n lv_all vg_data  # all remaining space
lvscan
lvdisplay                # LV details, path is /dev/vg_data/lv_app

# [Step 4] Create a filesystem + mount
mkfs -t ext4 /dev/vg_data/lv_app
mkdir /app
mount /dev/vg_data/lv_app /app
# fstab: /dev/vg_data/lv_app  /app  ext4  defaults  0 2
```

| Layer | Create command | Display command | Meaning |
|------|-----------|-----------|------|
| PV | `pvcreate` | `pvdisplay` | Initialize a disk for LVM |
| VG | `vgcreate` | `vgdisplay` | Storage pool combining PVs |
| LV | `lvcreate` | `lvdisplay` | Logical disk carved out of a VG |

The LVM creation order is **pvcreate → vgcreate → lvcreate**. The command prefixes `pv`, `vg`, and `lv` indicate the layer. Create from top to bottom (PV→VG→LV), and remove in reverse (LV→VG→PV).

- LVM's strength is **online expansion without downtime**.

```bash
# Add a new disk (PV) to the VG
pvcreate /dev/sdd
vgextend vg_data /dev/sdd    # add the PV to the VG (expand capacity)

# Grow the LV
lvextend -L +5G /dev/vg_data/lv_app      # add 5GB
lvextend -L 20G /dev/vg_data/lv_app      # make it 20GB total
lvextend -l +100%FREE /dev/vg_data/lv_app  # all remaining space

# ★ After growing the LV, you must also grow the filesystem for the capacity to actually increase
resize2fs /dev/vg_data/lv_app    # for ext2/3/4
xfs_growfs /app                  # for xfs (specify the mount point)

# In one step: the lvextend -r option (automatic resize)
lvextend -L +5G -r /dev/vg_data/lv_app
```

The command to extend an LV is `lvextend`. However, **growing only the LV leaves the filesystem unchanged**, so you must also grow the filesystem - `resize2fs` for ext family, `xfs_growfs` for xfs - for the capacity to actually show up. Missing this "two-step" process is the classic mistake. Using `lvextend -r` handles the resize automatically.

> ⚠️ **Trap**: Extending a VG is `vgextend` (adding a PV), and extending an LV is `lvextend`. The names are similar, which causes confusion. `vgextend` grows the pool, and `lvextend` grows the logical disk. Another trap is that xfs cannot be shrunk (no shrinking) and can only be grown.

## Permission Task Questions: umask / Special Permissions

### umask: Controlling Default Permissions of New Files and Directories

- `umask` specifies the **bits to remove** from the permissions of newly created files and directories.

```bash
umask              # print the current umask (e.g. 0022)
umask 022          # set umask
umask 027          # stricter

# Calculation: subtract umask from the file default 666 and directory default 777
# umask 022 → file 644 (rw-r--r--), directory 755 (rwxr-xr-x)
# umask 077 → file 600 (rw-------), directory 700 (rwx------)
```

| umask | New file permission | New directory permission |
|-------|--------------|------------------|
| 022 | 644 | 755 |
| 027 | 640 | 750 |
| 077 | 600 | 700 |
| 002 | 664 | 775 |

umask is a "mask that is **subtracted** from the default permissions". For files, subtract the umask from 666; for directories, from 777. With umask 022, a file becomes 666-022=644 and a directory 777-022=755. The reason files don't get the execute bit (x) by default is that the starting value is 666.

### Special Permissions: SetUID / SetGID / Sticky bit

- Three special permissions added on top of regular rwx are tested in the practical exam.

```bash
# SetUID (4000) - runs with the file owner's privileges when executed
chmod 4755 /path/program     # rwsr-xr-x
chmod u+s /path/program      # symbolic form
# e.g. /usr/bin/passwd (lets regular users modify shadow)

# SetGID (2000) - runs with group privileges / on a directory, inherits the group
chmod 2755 /path/program     # rwxr-sr-x
chmod g+s /shared_dir        # directory: new files inherit the group
# e.g. keep the team group in a shared directory

# Sticky bit (1000) - directory: only the owner can delete their own files
chmod 1777 /tmp              # rwxrwxrwt
chmod +t /shared_dir         # symbolic form
# e.g. /tmp (anyone can write, but cannot delete others' files)
```

| Special permission | Octal | Symbolic | Shown at | Effect |
|-----------|-------|------|-----------|------|
| SetUID | 4000 | `u+s` | `s` in owner x position | Runs with owner's privileges |
| SetGID | 2000 | `g+s` | `s` in group x position | Runs with group privileges / group inheritance |
| Sticky | 1000 | `+t` | `t` in others x position | Delete only your own files |

- In `ls -l`, you tell them apart by the permission characters.
- `-rwsr-xr-x` → SetUID (s in the owner x position)
- `-rwxr-sr-x` → SetGID (s in the group x position)
- `drwxrwxrwt` → Sticky bit (t in the others x position)

The special-permission octal adds one more digit in front of the regular permissions. In `chmod 4755`, the leading `4` is SetUID, `2` is SetGID, and `1` is the Sticky bit. `/tmp` is `1777` (Sticky), and `/usr/bin/passwd` is `4755` (SetUID).

If you see an uppercase `S`/`T` (e.g. `rwSr--r--`), it means the special bit is set at that position **without the execute permission (x)**, which is usually an unintended setting. A lowercase `s`/`t` is the normal state where the execute permission is also present.

## Try It Yourself

```bash
# Check disk status (safe query commands)
lsblk
df -h
blkid
mount | column -t

# Check LVM status (on an environment with LVM installed)
pvscan; vgscan; lvscan
vgdisplay 2>/dev/null

# umask experiment
umask                    # check the current value
mkdir testdir && touch testfile
ls -ld testdir testfile  # check permissions
umask 077
mkdir testdir2 && touch testfile2
ls -ld testdir2 testfile2  # check the stricter permissions

# Check special permissions
ls -l /usr/bin/passwd    # rwsr-xr-x (SetUID)
ls -ld /tmp              # rwxrwxrwt (Sticky)
```

## Task Order Memorization Cards

| Scenario | Command order |
|----------|-----------|
| Mount a new disk | `fdisk` → `mkfs -t ext4` → `mount` → register in fstab |
| Guarantee a persistent mount | Add to `/etc/fstab`, then `mount -a` |
| Add swap | `mkswap` → `swapon` |
| Create LVM | `pvcreate` → `vgcreate` → `lvcreate` |
| Expand LVM capacity | `vgextend` (add PV) → `lvextend` → `resize2fs`/`xfs_growfs` |
| Default permission 644 for new files | `umask 022` |
| Run with the owner's privileges | `chmod 4755` (SetUID) |
| Group inheritance in a shared directory | `chmod g+s` (SetGID) |
| Safe sharing like /tmp | `chmod 1777` (Sticky) |

Don't skip the command prefixes (pv/vg/lv) or the finishing steps (fstab, resize2fs) of each stage. Tomorrow we fill in the other half of system administration with process, scheduling, and systemd task questions.

## 📖 Glossary

- **fdisk** : An interactive tool that divides a disk into partitions. Use `n` (create) → `w` (write) in that order.
- **mkfs** : The command that creates (formats) a filesystem on a partition. Run it on a **partition**, not the whole disk.
- **fstab registration** : The last step that makes a filesystem mount automatically at boot. Without it, the mount disappears on reboot.
- **mount -a** : Re-mounts every entry in `/etc/fstab`. Use it to validate syntax after editing fstab.
- **blkid** : The command that shows a device's UUID and filesystem type. Needed when writing fstab with UUIDs instead of device names.
- **PV (physical volume)** : A disk or partition initialized so LVM can use it. Created with `pvcreate`.
- **VG (volume group)** : A storage pool combining several PVs. Created with `vgcreate` and grown with `vgextend`.
- **LV (logical volume)** : A logical disk carved out of a VG. Created with `lvcreate` and grown with `lvextend`.
- **resize2fs / xfs_growfs** : Commands that grow the filesystem on top after growing the LV (ext family / xfs).
- **umask** : The bits removed from the default permissions of newly created files and directories. The starting values are 666 for files and 777 for directories.
- **SetUID** : A bit (4000) that makes a program run with the privileges of the **file owner** rather than the executor. The `passwd` command is the classic example.
- **SetGID** : A bit (2000) that uses group privileges at execution, or, when set on a directory, makes new files **inherit that directory's group**.
- **Sticky bit** : A bit (1000) set on a directory so that **only your own files can be deleted**. `/tmp` is the classic example.

## 📝 Practice Questions

**Question 1.** Which command correctly formats the new partition `/dev/sdb1` as ext4?

A) fdisk -t ext4 /dev/sdb1
B) mkfs -t ext4 /dev/sdb1
C) mount -t ext4 /dev/sdb1
D) fsck -t ext4 /dev/sdb1

**Answer: B**

Explanation: Creating (formatting) a filesystem is done with `mkfs -t ext4` (or `mkfs.ext4`). `fdisk` creates partitions, `mount` mounts, and `fsck` is a filesystem check tool.

---

**Question 2.** Which file must be edited to permanently register a disk so that it is mounted automatically at boot?

A) /etc/mtab
B) /etc/fstab
C) /etc/sysctl.conf
D) /proc/mounts

**Answer: B**

Explanation: Automatic mounting at boot is registered in `/etc/fstab`. `/etc/mtab` and `/proc/mounts` are files that show the current mount state, and `/etc/sysctl.conf` is the kernel parameter configuration file.

---

**Question 3.** When building LVM, which command first initializes a disk for LVM?

A) vgcreate
B) lvcreate
C) pvcreate
D) mkfs

**Answer: C**

Explanation: LVM is built in the order PV→VG→LV, and the very first step is initializing the disk/partition as a physical volume with `pvcreate`. `vgcreate` creates a volume group and `lvcreate` creates a logical volume.

---

**Question 4.** After extending the logical volume `lv_app` by 5GB, which command should be run after lvextend to actually grow the ext4 filesystem as well?

A) xfs_growfs /dev/vg_data/lv_app
B) vgextend /dev/vg_data/lv_app
C) resize2fs /dev/vg_data/lv_app
D) mkfs.ext4 /dev/vg_data/lv_app

**Answer: C**

Explanation: Growing an ext2/3/4 filesystem is done with `resize2fs`. `xfs_growfs` is for xfs only, `vgextend` adds a PV to a VG, and `mkfs.ext4` is a format (which erases existing data).

---

**Question 5.** What is the permission of a newly created regular file when the `umask` value is 022?

A) 755
B) 644
C) 600
D) 666

**Answer: B**

Explanation: Subtracting umask 022 from the default file permission 666 gives 644 (rw-r--r--). 755 is the result for a directory (777-022), 600 is for umask 077, and 666 is the file permission when umask is 000.

---

**Question 6.** Which special permission and octal representation make a program like `/usr/bin/passwd` run with the file owner's (root's) privileges?

A) Sticky bit, 1755
B) SetGID, 2755
C) SetUID, 4755
D) SetUID, 2755

**Answer: C**

Explanation: SetUID is octal 4000, written by putting a 4 in front of the regular permissions as in `chmod 4755`. When executed, the process gains the file owner's privileges. SetGID is 2000 and the Sticky bit is 1000.

---

**Question 7.** Which command sets the special permission so that, as in `/tmp`, anyone can create files but can delete only their own files?

A) chmod 4777 /tmp
B) chmod 2777 /tmp
C) chmod 1777 /tmp
D) chmod 0777 /tmp

**Answer: C**

Explanation: Setting the Sticky bit (octal 1000) means only files you own can be deleted inside the directory. `chmod 1777 /tmp` is the answer, and it is shown as `rwxrwxrwt` in `ls -ld`. 4 is SetUID and 2 is SetGID.

---
