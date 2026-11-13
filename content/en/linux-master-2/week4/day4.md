# Day 4 - Directory Hierarchy and File System Management

## 📌 Key Takeaways

- Linux has no drive letters. Everything is **a single tree growing out of one root (`/`)**.
- The names and roles of directories are fixed by a standard called **FHS** — `/etc` configuration, `/var` things that change, `/bin` commands.
- **`/proc` is not on disk.** It is a **virtual file system** that the kernel builds in memory.
- **Attach with `mount` and detach with `umount`.** A directory that is in use can't be detached.
- **`df` is file system capacity, and `du` is usage by path.** Memorize them as a pair.

## One Tree

```text
                    /   (root)
      ┌────────┬────────┼────────┬────────┬────────┐
    /bin     /etc     /home    /var     /usr     /proc
  executables config   users    variable applications kernel info
                                data
```

- There are no drive letters like Windows' `C:` and `D:`. **A new disk is also attached somewhere in the tree** to be used.
- The root `/` is the **top-level directory**, and it is **different from** `/root`, the home of the root user.

### FHS — What Is in Which Directory

| Directory | What it holds |
|---------|--------|
| **`/bin`** | Basic **commands** — `ls`, `cp`, `cat` |
| **`/sbin`** | **Administrator** commands — `fdisk`, `shutdown` |
| **`/etc`** | **Configuration files** — `passwd`, `fstab`, `hosts` |
| **`/home`** | Home directories of **regular users** |
| **`/root`** | **root's home** directory |
| **`/var`** | Data that **changes often** — logs, mail, spool |
| **`/tmp`** | Temporary files. Cleared on reboot |
| **`/usr`** | Applications and libraries |
| **`/lib`** | **Shared libraries** needed for boot and basic commands |
| **`/dev`** | **Device files** — `sda`, `tty`, `null` |
| **`/proc`** | Kernel and process info (**virtual**) |
| **`/boot`** | Kernel image and bootloader |
| **`/opt`** | Additionally installed **packages** |
| **`/mnt`, `/media`** | Mount points (manual / removable) |

Memorize the **values that are asked as pairs** together.

| Confusing pair | Deciding criterion |
|-----------|-----------|
| `/bin` vs `/sbin` | For regular users vs **for administrators** |
| `/` vs `/root` | Top-level directory vs **root's home** |
| `/mnt` vs `/media` | Manual mounts vs **automatic for removable media** |
| `/var` vs `/tmp` | Things that **stay**, like logs, vs things that get cleared |
| `/lib` vs `/usr/lib` | Libraries for boot and basic commands vs for applications |
| `/dev` vs `/proc` | **Device** files vs **kernel and process info** |

Paths one level further down also show up as answer choices.

| Path | What it holds |
|------|--------|
| `/usr/bin`, `/usr/sbin` | Executables of applications / executables for administrators |
| `/usr/local` | Programs the administrator **installed directly** (distinguished from distribution packages) |
| `/usr/share/man` | Manual pages |
| `/var/log` | **Log files** — `messages`, `secure`, etc. |
| `/var/spool` | Jobs waiting to be processed — printing, mail, scheduled jobs |
| `/var/tmp` | Temporary files that **persist** even after a reboot |
| `/etc/fstab` | List of file systems to mount at boot |
| `/lost+found` | Where file fragments recovered by `fsck` are collected (ext family) |

- Knowing where the names come from makes them less confusing — `/etc` is configuration, `/var` is **var**iable (things that change), `/opt` is **opt**ional (additional packages), `/sbin` is **s**ystem **bin**aries, and `/dev` is **dev**ices. **`/usr` is not a user's home.** User homes are in `/home`.
- Recent distributions often make `/bin`, `/sbin`, and `/lib` **symbolic links** to `/usr/bin`, `/usr/sbin`, and `/usr/lib`. Even so, the division of roles is still what gets tested.
- When `/tmp` is cleared depends on the distribution's settings. Understand it as "a place for temporary files that you shouldn't expect to last long."

### /proc — A File System That Isn't on Disk

```bash
cat /proc/cpuinfo      # CPU info
cat /proc/meminfo      # memory info
cat /proc/version      # kernel version
ls /proc/1             # info of the PID 1 process
```

- The files in `/proc` are **not stored on disk.** The kernel builds and shows them the instant you read them. Often their size is shown as 0.
- A similar virtual file system is **`/sys`** (device and kernel settings).
- **`/dev`** is special too. It holds **files that point to devices**, not actual data.

| File in `/proc` | Contents |
|------------------|------|
| `/proc/cpuinfo` | CPU model, core count |
| `/proc/meminfo` | Memory and swap usage status |
| `/proc/version` | Kernel version |
| `/proc/partitions` | Recognized disks and partitions |
| `/proc/filesystems` | File system types the kernel supports |
| `/proc/mounts` | File systems **currently mounted** |
| `/proc/swaps` | Swap areas in use |
| `/proc/number/` | Info of the process with that **PID** |

- A **numbered directory** under `/proc` is **a running process**. When the process ends, the directory disappears too.

## Attaching and Detaching — mount and umount

```bash
mount                          # the entire current mount state
mount /dev/sdb1 /data          # attach sdb1 at /data
mount -t ext4 /dev/sdb1 /data  # specifying the file system type
mount -o ro /dev/sdb1 /data    # read-only
umount /data                   # detach by mount point
umount /dev/sdb1               # detach by device name
mount -a                       # mount every entry in /etc/fstab
```

| Option | Meaning |
|------|-----|
| `-t type` | Specify the file system type (ext4, xfs, iso9660) |
| `-o ro` / `rw` | Read-only / read-write |
| `-a` | **Everything** listed in `/etc/fstab` |

> **Two pitfalls.** ① It's **`umount`, not `unmount`.** There is no n. ② **A file system in use can't be detached.** If you are inside that directory or a process has a file open there, you get a `device is busy` error. Get out and try again, and if it still fails, check who is holding it with `lsof` or `fuser`.

- If **files originally existed** at the mount point (`/data`), they are hidden. They don't disappear, and are visible again when you detach.
- To attach automatically at boot, write it in **`/etc/fstab`** (covered in W2).

### One Cycle of Mounting

```text
$ sudo mkdir /data                       ← the mount point must exist beforehand
$ sudo mount /dev/sdb1 /data
$ mount | grep sdb1
/dev/sdb1 on /data type ext4 (rw,relatime)
$ cd /data
$ sudo umount /data
umount: /data: target is busy.
$ cd ~
$ sudo umount /data
```

- **The mount point must be an existing directory.** `mount` doesn't create the directory for you.
- The argument order of `mount` is **device first, mount point after** — `mount [options] device directory`.
- `umount` accepts **either the device name or the mount point**.
- The first `umount` above failed because the shell was inside `/data`. Once it stepped out, it detached.

| Device/media | Common mount example |
|----------|--------------|
| Partition on an additional disk | `mount /dev/sdb1 /data` |
| CD/DVD | `mount -t iso9660 /dev/cdrom /media/cdrom` |
| USB drive | `mount /dev/sdc1 /mnt/usb` (the device name may differ each time you plug it in) |
| ISO image file | `mount -o loop image.iso /mnt/iso` |

| `-o` option | Meaning |
|----------|-----|
| `ro` / `rw` | Read-only / read-write |
| `remount` | **Change only the options and mount again** without detaching (`mount -o remount,rw /`) |
| `loop` | Mount a **file** like a device (ISO image) |
| `noexec` | **Forbid execution** of executables on that file system |
| `nosuid` | **Ignore** SetUID and SetGID |
| `defaults` | A bundle of default options (includes `rw`) |

- Write options **joined with commas** — `-o ro,noexec`. No spaces.

### Three Places Where Mount Information Is Written

| File | What it holds | Who writes it |
|------|--------|----------|
| **`/etc/fstab`** | The list to **mount at boot** | Administrator edits it directly |
| **`/etc/mtab`** | The list **currently mounted** | Updated automatically by the system |
| `/proc/mounts` | The list currently mounted (shown by the kernel) | Kernel |

```text
# device         mount point type   options    dump  fsck order
/dev/sdb1        /data      ext4   defaults   0     2
```

- `/etc/fstab` has **6 fields separated by whitespace** — device, mount point, file system type, options, dump flag, fsck order.
- Tell them apart this way: **"planned" is fstab, "current" is mtab**. What you see when you type `mount` with no arguments is the current list.
- If it's in fstab, **even giving just one side**, as in `mount /data`, finds the rest from fstab and attaches it.

## Viewing Capacity — df and du

| Command | What it looks at | Unit |
|------|--------|------|
| **`df`** | Total, used, and free capacity **per file system** | Based on what's mounted |
| **`du`** | Actual usage **per path** | Based on directories and files |

```bash
df -h                   # in human-readable units (G, M)
df -T                   # including file system type
df -i                   # inode usage
du -h /var/log          # capacity per path
du -sh /var/log         # total only (summary)
du -sh * | sort -h      # biggest first, from the current location
```

- **`-h` is human-readable.** It is used with the same meaning in both commands.
- The `-s` in **`du -sh`** is summary — it gives **only the total** without listing each sub-item.
- For the problem "the disk is full," **find which file system with `df -h`, and narrow down which directory with `du -sh`.**

```text
$ df -hT
Filesystem     Type      Size  Used Avail Use% Mounted on
/dev/sda2      xfs        50G   12G   38G  24% /
/dev/sda1      xfs      1014M  180M  835M  18% /boot
/dev/sdb1      ext4       99G   89G  4.9G  95% /data
tmpfs          tmpfs     1.9G     0  1.9G   0% /dev/shm
```

| Column | Meaning |
|-----|-----|
| `Filesystem` | Device name |
| `Type` | File system type (only when `-T` is given) |
| `Size` / `Used` / `Avail` | Total / used / **remaining** capacity |
| `Use%` | Usage rate |
| `Mounted on` | **Mount point** |

```text
$ du -h /data/logs
1.2G    /data/logs/2026-08
3.4G    /data/logs/2026-09
4.6G    /data/logs
$ du -sh /data/logs
4.6G    /data/logs
```

- With no options, `du` prints **one line per subdirectory** and gives the total at the end. `-s` leaves only that last line.
- Even if you give **a directory, as in `df /data/logs`, `df` shows the whole file system that directory belongs to**. It doesn't tell you the size of a single directory.

| Option | `df` | `du` |
|------|------|------|
| `-h` | Readable units | Readable units |
| `-k` / `-m` | In KB / MB | In KB / MB |
| `-T` | Show file system **type** | — |
| `-i` | **inode** usage | — |
| `-s` | — | **Total only** |
| `-a` | All file systems | **Files** too, one line each, not just directories |
| `-c` | — | Add a **grand total** line at the end |

> There are **cases where capacity remains but files can't be created.** The **inodes have run out.** It happens when there are very many small files. Check with `df -i`.

## Checking — fsck

```bash
fsck /dev/sdb1          # check
fsck -y /dev/sdb1       # yes to every question
e2fsck -f /dev/sdb1     # ext family, forced check
```

- It is a command that **checks and repairs the integrity of a file system**.
- ⚠️ **Always run it with the file system unmounted.** Checking while mounted can damage the file system.
- It sometimes runs automatically at boot after an abnormal shutdown. The **6th field** of `/etc/fstab` decides the check order (1 for root, 2 for the rest, 0 for no check).

| Command | Relationship |
|------|------|
| `fsck` | A command that **calls on your behalf** the checker that suits the file system type |
| `e2fsck` (`fsck.ext4`) | The checker dedicated to **ext2, ext3, and ext4** |
| `xfs_repair` | The repair program dedicated to **XFS** (don't use `e2fsck` for XFS) |

| Option | Meaning |
|------|-----|
| `fsck -y` | Repair while answering **yes** to every question |
| `fsck -n` | **Check only**, without fixing (no to every question) |
| `fsck -A` | Check **everything** listed in `/etc/fstab` |
| `fsck -t type` | Specify the file system type |
| `e2fsck -f` | Check **by force**, even if it looks fine |
| `e2fsck -p` | **Auto-repair** within a safe range, without asking |

- The correct order is **`umount` → `fsck` → `mount`**. File systems that can't be detached, like the root (`/`), are checked during the boot process or in recovery mode.
- Give the argument to `fsck` as the **device name** (`/dev/sdb1`), not the mount point.
- File fragments that couldn't be placed anywhere during repair are collected in that file system's **`lost+found`** directory.

### Lookup Commands Used Alongside

| Command | What it does |
|------|--------|
| `lsblk` | Block devices in a **tree form** |
| `blkid` | A device's **UUID** and file system type |
| `mount` | The current mount list |
| `free -h` | Memory and swap usage |

> Tomorrow we bundle this week's permissions and file systems into one summary.

## 📖 Glossary

- **FHS** : Filesystem Hierarchy Standard. The convention that fixes directory names and roles in Linux.
- **Root directory (`/`)** : The very top of the whole file system. Different from `/root`, root's home.
- **Mount** : Connecting a file system to a specific point in the directory tree.
- **Mount point** : The directory where a file system is attached. Whatever was originally there is hidden.
- **Virtual file system** : A file system like `/proc` and `/sys` that the kernel builds and shows, not a disk.
- **`df`** : The command for viewing capacity per file system.
- **`du`** : The command for viewing usage per path. `-sh` gives the total.
- **`fsck`** : The command that checks and repairs file system integrity. Run it while unmounted.

## 📝 Practice Questions

**Question 1.** Which of the following is the directory where system configuration files are mainly stored?

A) /etc  
B) /var  
C) /usr  
D) /opt  

**Answer: A**  
Explanation: `/etc` holds system-wide configuration files such as `passwd`, `fstab`, and `hosts`. `/var` holds frequently changing data like logs and mail, `/usr` holds applications and libraries, and `/opt` holds additionally installed packages.

---

**Question 2.** Which of the following is a virtual file system that holds kernel and process information and exists in memory rather than on disk?

A) /dev  
B) /boot  
C) /proc  
D) /lib  

**Answer: C**  
Explanation: `/proc` is not made of files stored on disk but a virtual file system that the kernel builds and shows in real time. System status can be looked up in file form, such as `cpuinfo` and `meminfo`. `/dev` holds device files, `/boot` holds the kernel image and bootloader, and `/lib` holds shared libraries.

---

**Question 3.** Which of the following commands detaches a mounted file system?

A) unmount /data  
B) umount /data  
C) dismount /data  
D) mount -d /data  

**Answer: B**  
Explanation: The command to release a mount is `umount`, with the n missing, not `unmount`. If any process is using that directory, a `device is busy` error occurs, so you have to step out of that location and try again, or check the process in use with `fuser`.

---

**Question 4.** Which of the following commands checks the total capacity and free space per file system?

A) du -sh  
B) ls -lh  
C) fsck -h  
D) df -h  

**Answer: D**  
Explanation: `df` shows total, used, and remaining capacity per mounted file system. Adding the `-h` option displays it in readable units such as GB and MB. `du` is a command for viewing the capacity that a specific path actually takes up, so its purpose is different.

---

**Question 5.** Which of the following must be observed when running the `fsck` command?

A) It must be run while mounted  
B) It must be run with regular user privileges  
C) It must be run while unmounted  
D) It must be run after formatting the file system  

**Answer: C**  
Explanation: `fsck` directly examines and fixes the file system's metadata, so if run while mounted, it can conflict with data in use and instead cause damage. It must be run unmounted and with administrator privileges, and the root file system is checked during the boot process or in recovery mode.
