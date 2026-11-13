# Day 2 - Primary Subject 2 Mock Exam: Weak Points in Linux System Administration

## 📌 Key Points

- **"Linux System Administration"** is the most heavily weighted subject on the primary written exam. **One letter of a command option or one digit of a permission number** decides the answer.
- The six easy-to-miss topics: **special permission numbers (4/2/1)**, **umask calculation**, **signal numbers (9/15)**, **RAID levels**, **LVM order**, **rpm/yum differences**.
- Special permissions: SetUID 4000 (run with the owner's privileges), SetGID 2000 (group inheritance), Sticky 1000 (delete only your own files).
- umask is a **subtracted value** — it is subtracted from 666 for files and 777 for directories. `022` → 644 / 755.
- Signals: **9 (KILL) cannot be ignored**, and 15 (TERM) is the default for `kill`. For nice, **the smaller the value, the higher the priority**.
- Low-level tools (`rpm`, `dpkg`, `insmod`) cannot resolve dependencies automatically, while high-level tools (`yum`, `apt`, `modprobe`) can.

## Weak Point 1: The Shell and Environment Variables

- The shell is a command interpreter.
- The types, configuration files, and variable distinctions are the exam focus.

| Shell | Features |
|----|------|
| bash | Linux default, sh-compatible + extensions |
| csh/tcsh | C-like syntax, history |
| ksh | Korn shell, used in many commercial Unix systems |
| zsh | Powerful autocompletion and plugins |

- The difference between environment variables and shell variables is a trap.
- **If exported with `export`, it is an environment variable** (inherited by child processes); a plain assignment makes it a shell variable (not inherited).

| Variable | Meaning |
|------|------|
| `PATH` | Search path for executables |
| `HOME` | Home directory |
| `PS1` | Default prompt string |
| `SHELL` | Login shell path |
| `LANG` | Default locale and language |
| `UID` | User ID |

**Configuration files in one line**: `/etc/profile` (global, login), `~/.bash_profile` (personal, once at login), `~/.bashrc` (personal, each time a shell is opened). Aliases usually go in `.bashrc`.

## Weak Point 2: File Permissions — Special Permissions Are the Key

- The basic rwx permissions (read 4, write 2, execute 1) are the basics, and the **three special permissions** are the exam focus.

| Special Permission | Number | Meaning | Notation |
|-----------|------|------|------|
| SetUID | 4000 | Run with the owner's privileges | `s` (owner x position) |
| SetGID | 2000 | Run with the group's privileges; directory group inheritance | `s` (group x position) |
| Sticky Bit | 1000 | Only the owner can delete (shared directories) | `t` (others x position) |

- Typical examples: `/usr/bin/passwd` is SetUID (so a regular user can modify `/etc/shadow`), and `/tmp` has the Sticky Bit (anyone can write, but you can delete only your own).

> ⚠️ **umask trap**: umask is a value that **subtracts** permissions. It is subtracted from the default 666 for files and 777 for directories. umask 022 → files 644, directories 755. Execute permission is never added to files by umask.

**Watch for uppercase S/T**: If SetUID/Sticky is set but there is no execute permission (x), it is shown as **uppercase S/T** rather than lowercase (indicating a permission conflict).

## Weak Point 3: Disk Management — Mounting, Quotas, RAID, LVM

- Disks are tricky because commands and concepts get mixed together.

| Command | Role |
|------|------|
| `fdisk`/`parted` | Create and manage partitions |
| `mkfs` | Create a filesystem (format) |
| `mount`/`umount` | Mount and unmount |
| `df` | Disk usage (filesystem) |
| `du` | Directory usage |
| `fsck` | Check and repair filesystems |

- The 6 fields of `/etc/fstab` in order: **device · mount point · filesystem · options · dump · fsck order**.
- The entries listed here are the targets for automatic mounting at boot.
- Let's also review the RAID levels.

| RAID | Features | Minimum Disks |
|------|------|-------------|
| 0 | Striping, faster, no redundancy | 2 |
| 1 | Mirroring, higher reliability | 2 |
| 5 | One distributed parity | 3 |
| 6 | Two distributed parities | 4 |
| 1+0 | Mirror + stripe | 4 |

**LVM 3-layer structure**: Physical Volume (PV) → Volume Group (VG) → Logical Volume (LV). The order is `pvcreate → vgcreate → lvcreate`. Its biggest advantage is expanding capacity without downtime.

## Weak Point 4: Processes and Signals

- Process states, priorities, and signals are within the scope of the exam.

| Command | Role |
|------|------|
| `ps` | Process snapshot |
| `top` | Real-time monitoring |
| `kill`/`killall` | Send signals |
| `nice`/`renice` | Adjust priority |
| `jobs`/`fg`/`bg` | Job control |
| `nohup` | Keep running after logout |

- You must memorize the signal numbers.

| Number | Name | Meaning |
|------|------|------|
| 1 | SIGHUP | Restart / reload configuration |
| 2 | SIGINT | Interrupt (Ctrl+C) |
| 9 | SIGKILL | Forced termination (cannot be ignored) |
| 15 | SIGTERM | Graceful termination (default) |
| 18/19 | SIGCONT/SIGSTOP | Resume/stop |

> ⚠️ **nice value range**: `-20` (highest priority) to `19` (lowest). The **smaller the value, the higher the priority**. Only root can specify negative values.

**kill default**: `kill PID` sends **15 (SIGTERM)** by default. If it doesn't die, use `kill -9`. Signal 9 cannot be ignored or blocked by the process.

## Weak Point 5: Package Management — RPM and DEB

- Don't confuse the package tools of each distribution family.

| Family | Low-level | High-level (automatic dependencies) |
|------|--------|---------------------|
| Red Hat (rpm) | `rpm` | `yum`/`dnf` |
| Debian (deb) | `dpkg` | `apt`/`apt-get` |

| Task | rpm | yum |
|------|-----|-----|
| Install | `rpm -ivh` | `yum install` |
| Upgrade | `rpm -Uvh` | `yum update` |
| Remove | `rpm -e` | `yum remove` |
| Query | `rpm -qa` | `yum list` |
| Package owning a file | `rpm -qf` | - |

**Key difference**: `rpm`/`dpkg` **cannot resolve dependencies automatically** (they only report an error). `yum`/`apt` automatically fetch and resolve dependent packages from repositories.

**The 3 steps of compiling from source**: `./configure` (check the environment, generate the Makefile) → `make` (compile) → `make install` (install). Specify the install path with the configure option `--prefix`.

## Weak Point 6: User and Group Management Files

- Account management asks not only about commands but also about the **backend files**.

| File | Contents | Permissions |
|------|------|------|
| `/etc/passwd` | Basic account information (7 fields) | 644 (public) |
| `/etc/shadow` | Password hashes and expiry policy | 000/400 (protected) |
| `/etc/group` | Groups and members | 644 |
| `/etc/skel` | Home template for new accounts | - |
| `/etc/login.defs` | Defaults for account creation | - |

- Memorize the 7 fields of passwd (username:x:UID:GID:description:home:shell) together with the password-expiry fields of shadow.

**UID conventions**: 0 = root, 1-999 = system accounts, 1000 and up = regular users (starting from 500 on some distributions). An account with UID 0 has the same privileges as root, so be careful for security reasons.

**Why shadow is protected**: If the password hashes are exposed, offline cracking becomes possible, so permissions are restricted to 000/400. That's why you see only an `x` in the password field when you look at passwd.

## Weak Point 7: Job Scheduling — cron and at

- System administration automation tools also belong to this subject.

| Tool | Purpose | Configuration |
|------|------|------|
| cron | Recurring jobs | `crontab -e`, `/etc/crontab` |
| at | One-time scheduling | `at time` |
| anacron | Catch up on jobs missed after boot | `/etc/anacrontab` |

- The cron fields (minute, hour, day, month, weekday) and the access-control files (`cron.allow`/`cron.deny`) are traps.

**allow/deny priority**: If `cron.allow` exists, only the users listed there are allowed (deny is ignored). If it doesn't exist, only users not in `cron.deny` are allowed. allow is stronger than deny.

## Weak Point 8: Backup and Compression Commands

- Let's also review the data protection commands.

| Command | Purpose |
|------|------|
| `tar` | Bundle/extract archives |
| `gzip`/`gunzip` | Compress/decompress .gz |
| `bzip2` | .bz2 (high compression ratio) |
| `xz` | .xz (highest compression ratio) |
| `dd` | Block-level copy and images |

- You must memorize the tar options — `c` (create), `x` (extract), `v` (show progress), `f` (file name), `z` (gzip), `j` (bzip2).

**tar in one line**: To bundle, `tar czvf out.tar.gz dir`; to extract, `tar xzvf out.tar.gz`. Change `z` to `j` for bzip2. Always put `f` right before the file name.

## Weak Point 9: Disk Quotas (quota)

- Quotas, which limit disk usage in a multi-user environment, also belong to system administration.

| Step | Command/Task |
|------|-----------|
| Mount options | Add `usrquota,grpquota` in fstab |
| Create the database | `quotacheck -cug /partition` |
| Enable quotas | `quotaon /partition` |
| Set limits | `edquota user` |
| Check | `quota user`, `repquota` |

- Quotas have a **soft limit (warning, grace period)** and a **hard limit (absolute limit)**.

**soft vs hard**: With a soft limit, exceeding it is allowed during the grace period, but a hard limit blocks immediately. Both blocks (capacity) and inodes (number of files) can be limited.

## Weak Point 10: Modules and Kernel Parameters

- Kernel module management is another pillar of system administration.

| Command | Role |
|------|------|
| `lsmod` | List loaded modules |
| `modprobe` | Load a module including its dependencies |
| `insmod`/`rmmod` | Load/remove a module (dependencies handled manually) |
| `modinfo` | Module information |
| `sysctl` | View and change kernel parameters |

**insmod vs modprobe**: `insmod` cannot handle dependent modules automatically, but `modprobe` resolves dependencies as well (the same pattern as the rpm:yum relationship). Persistent kernel parameters go in `/etc/sysctl.conf`.

**System information command roundup**: `free` (memory), `uptime` (uptime and load), `vmstat` (virtual memory statistics), `iostat` (I/O statistics), `lscpu` (CPU information). They are often asked together as a group for performance diagnosis.

Use the mock exam below for a final check.

## 📖 Glossary

- **Environment variable vs shell variable** : A variable exported with `export` and passed down to child processes / a variable that stays only in the current shell.
- **PATH** : The list of directories searched for executables when you type a command.
- **SetUID / SetGID / Sticky Bit** : Run with the owner's privileges / group privileges and group inheritance / can delete only your own files.
- **umask** : The value subtracted from the default permissions of newly created files and directories. The starting value is 666 for files and 777 for directories.
- **fsck** : A command that checks and repairs filesystem errors.
- **RAID 0 / 1 / 5** : Striping for speed / mirroring for reliability / distributed parity as a compromise between capacity and reliability.
- **LVM 3 layers** : PV (physical volume) → VG (volume group) → LV (logical volume). Its biggest advantage is expansion without downtime.
- **SIGKILL (9) / SIGTERM (15)** : Forced termination that a process cannot ignore / the graceful termination request that is the default for `kill`.
- **nice value** : How much a process yields (-20 to 19). **The smaller it is, the higher the priority**, and only root can specify negative values.
- **Automatic dependency resolution** : The property of automatically handling other required packages or modules, as `yum`, `apt`, and `modprobe` do. `rpm`, `dpkg`, and `insmod` lack it.
- **The 3 steps of compiling from source** : `./configure` (check the environment, generate the Makefile) → `make` (compile) → `make install` (install).
- **/etc/skel** : A collection of template files copied into the home directory when a new account is created.
- **soft limit / hard limit** : In quotas, a warning line that may be exceeded during the grace period / an absolute limit that blocks immediately.
- **anacron** : A tool that runs periodic jobs skipped because the system was off, catching up after boot.

## 📝 Practice Questions

**Question 1.** Which is the typical command with the SetUID bit set that lets a regular user change their own password?

A) `/bin/ls`
B) `/usr/bin/passwd`
C) `/etc/shadow`
D) `/usr/bin/who`

**Answer: B**
Explanation: `/usr/bin/passwd` has SetUID set and so runs with the owner's (root's) privileges, which lets a regular user modify the root-owned `/etc/shadow` and change their password.

---

**Question 2.** When the umask value is 022, what are the default permissions of a newly created regular file?

A) 755
B) 644
C) 666
D) 777

**Answer: B**
Explanation: Subtracting umask 022 from the file default of 666 gives 644 (rw-r--r--). Execute permission is not granted to files by umask. For a directory, it would be 777-022=755.

---

**Question 3.** Which special permission restricts each user to deleting only the files they created in a shared directory?

A) SetUID
B) SetGID
C) Sticky Bit
D) umask

**Answer: C**
Explanation: The Sticky Bit (1000) restricts deletion in a directory writable by everyone, like `/tmp`, so that only the file's owner (or root) can delete their own files.

---

**Question 4.** Which signal cannot be ignored or blocked by the receiving process?

A) SIGTERM (15)
B) SIGHUP (1)
C) SIGINT (2)
D) SIGKILL (9)

**Answer: D**
Explanation: SIGKILL (9) is a forced-termination signal that a process cannot catch or ignore. SIGTERM (15), SIGINT (2), and SIGHUP (1) can be handled with a handler.

---

**Question 5.** Which RAID level requires at least 3 disks and uses one distributed parity?

A) RAID 0
B) RAID 1
C) RAID 5
D) RAID 6

**Answer: C**
Explanation: RAID 5 stores parity distributed across at least 3 disks and survives the failure of 1 disk. RAID 6 has 2 parities (at least 4 disks), RAID 0 has no redundancy, and RAID 1 is mirroring.

---

**Question 6.** Which is the correct order of commands for creating a physical volume, a volume group, and a logical volume when setting up LVM?

A) `lvcreate → vgcreate → pvcreate`
B) `pvcreate → vgcreate → lvcreate`
C) `vgcreate → pvcreate → lvcreate`
D) `mkfs → pvcreate → lvcreate`

**Answer: B**
Explanation: LVM has 3 layers, PV→VG→LV: create the physical volume with `pvcreate`, group it into a volume group with `vgcreate`, and then create the logical volume with `lvcreate`.

---

**Question 7.** Which high-level tool installs an RPM package from a repository while resolving dependencies automatically?

A) `rpm -ivh`
B) `dpkg -i`
C) `yum install`
D) `make install`

**Answer: C**
Explanation: `yum` (or dnf) automatically downloads and resolves dependent packages from the repository. `rpm -ivh` cannot resolve dependencies automatically and raises an error if any are missing.

---

**Question 8.** Which statement about the `nice` priority value is correct?

A) The range is 0 to 39, and the larger the value, the higher the priority
B) The range is -20 to 19, and the smaller the value, the higher the priority
C) The range is -19 to 20, and anyone can specify negative values
D) The range is 1 to 99, and only root can change it

**Answer: B**
Explanation: The nice value ranges from -20 (highest priority) to 19 (lowest), and the smaller the value, the higher the priority. Only root can specify negative values (raising priority).

---

**Question 9.** Which is the correct order of the fields in `/etc/fstab`?

A) mount point - device - filesystem - options - dump - fsck order
B) device - mount point - filesystem - options - dump - fsck order
C) device - filesystem - mount point - options - fsck order - dump
D) filesystem - device - mount point - dump - options - fsck order

**Answer: B**
Explanation: The 6 fstab fields are, in order, the device (or UUID), the mount point, the filesystem type, the mount options, the dump flag, and the fsck check order at boot.

---

**Question 10.** Which statement about the difference between environment variables and shell variables is correct?

A) Shell variables are automatically inherited by child processes
B) Only environment variables exported with `export` are inherited by child processes
C) Both are always inherited by children
D) Environment variables are valid only in the current shell

**Answer: B**
Explanation: A shell variable set by plain assignment is valid only in the current shell; it must be exported with `export` to become an environment variable and be inherited by child processes.

---
