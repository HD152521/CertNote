# Day 1 - Primary Subject 1 Mock Exam: Weak Points in Understanding Practical Linux

## 📌 Key Points

- Week 14 is the **final review, mock exam, and strategy** week right before the test. Today we sweep through all of Primary Subject 1, **"Understanding Practical Linux."**
- This subject leans heavily on memorization, and mistakes happen on **confusing pairs** — GPL/LGPL, runlevels/systemd targets, `/bin` vs `/sbin`, absolute/relative paths.
- Linux = **Linus's kernel + GNU's tools**. What Torvalds made was not the whole OS but the **kernel**.
- Licenses are ranked by copyleft strength — **GPL (strong) > LGPL (weak) > BSD/Apache/MIT (none)**.
- The boot flow is **BIOS/UEFI → GRUB → kernel → initramfs → systemd (PID 1) → target**. Runlevel 3 = multi-user, 5 = graphical.
- The "usr" in `/usr` is not "user" but **Unix System Resources**. User home directories live in `/home`.

## Weak Point 1: History and Philosophy — Who Made What

- The lineage of Linux is asked as a **"name, year, and role" triple**.
- You must pair people with their creations accurately.

| Person/Organization | Creation | Key Keywords |
|-----------|--------|-------------|
| Richard Stallman | GNU Project, FSF, GPL | Free software movement (1983) |
| Linus Torvalds | Linux kernel (1991) | Finland, inspired by MINIX |
| Andrew Tanenbaum | MINIX | Educational Unix |
| Ken Thompson/Dennis Ritchie | UNIX, C language | Bell Labs (1969~) |

- GNU had no kernel, and Linux had only a kernel.
- The key to the correct answer is the flow in which the two combined to complete **GNU/Linux**.

**One-line summary**: Linux = **Linus's kernel + GNU's tools**. Neither side alone is a complete OS.

**Trap**: "Linux is an operating system Torvalds created alone" is **wrong**. What Torvalds made was the **kernel**, not the entire OS.

## Weak Point 2: Licenses — Subtle Differences Within the GPL Family

- Open-source licenses are distinguished by **copyleft strength**.
- This comparison is within the scope of the exam.

| License | Copyleft | Key Feature |
|----------|-----------|-----------|
| GPL | Strong | Derivative works must also be GPL (source disclosure) |
| LGPL | Weak | Source can stay private when linking a library |
| BSD | None | Can be commercialized closed-source as long as attribution is given |
| Apache | None | BSD-style + explicit patent clause |
| MIT | None | Most permissive, short terms |

> ⚠️ **The decisive difference**: GPL says **"If you use my code, you must disclose yours too,"** while LGPL says **"Using it as a library is fine."** Even if commercial software links an LGPL library, it can keep its own source private.

## Weak Point 3: Installation — Partitions and Filesystems

- The key to the installation stage is **partition design**.
- Memorize the role of each mount point.

| Partition | Role | Notes |
|--------|------|------|
| `/` (root) | Top level, required | The start of everything |
| `/boot` | Kernel and bootloader | Small capacity, separate partition recommended |
| `swap` | Virtual memory | Typically 1-2x RAM |
| `/home` | User data | Advantageous for preserving data on reinstall |
| `/var` | Logs and variable data | For isolating runaway logs |

- The journaling lineage of filesystems is also asked — **ext2 (no journaling) → ext3 (journaling added) → ext4 (large capacity, extents)**.
- Others include **XFS** (large capacity, default on RHEL 7+) and **Btrfs** (snapshots, CoW).

**Swap rule of thumb**: Traditionally, if RAM is 2GB or less, 2x RAM; above that, equal to RAM or only a portion of it. On the exam, "1-2x RAM" is the safe correct answer.

## Weak Point 4: Boot — Runlevels and systemd Targets

- The boot sequence and the **SysV runlevel ↔ systemd target** mapping are within the scope of the exam.

| Runlevel | systemd Target | Meaning |
|--------|--------------|------|
| 0 | poweroff.target | Shutdown |
| 1 | rescue.target | Single-user |
| 3 | multi-user.target | Text multi-user |
| 5 | graphical.target | GUI multi-user |
| 6 | reboot.target | Reboot |

- Boot flow: **BIOS/UEFI → bootloader (GRUB) → kernel load → initramfs → init/systemd (PID 1) → target reached**.

**GRUB key point**: The GRUB2 configuration is `/boot/grub2/grub.cfg`, but **do not edit it directly** — edit `/etc/default/grub` and then generate it with `grub2-mkconfig`.

**Command summary**: Check the default target with `systemctl get-default`, change it with `systemctl set-default multi-user.target`. Check the runlevel with `runlevel`/`who -r`.

## Weak Point 5: FHS — What Each Directory Means

- The FHS (Filesystem Hierarchy Standard) asks about the **purpose** of each directory.
- Focus on the confusing pairs.

| Directory | Purpose | Trap Point |
|----------|------|-------------|
| `/bin` | Essential user commands | Basic commands needed for booting |
| `/sbin` | System administration commands | Mainly for root |
| `/etc` | System configuration files | Not binaries |
| `/dev` | Device files | Not real files |
| `/proc` | Kernel and process information | Virtual FS in memory |
| `/usr` | Secondary applications | Static shareable data, not "user" |
| `/var` | Variable data (logs, etc.) | Keeps changing |
| `/tmp` | Temporary files | May be deleted on reboot |
| `/lib` | Shared libraries | Includes kernel modules |
| `/opt` | Add-on packages | Third-party software |

> ⚠️ **Trap**: The "usr" in `/usr` is not "user" but **Unix System Resources**. User home directories live in `/home`.

## Weak Point 6: Basic File Commands and Paths

- The distinction between absolute paths (starting with `/`) and relative paths (`.`/`..`) is asked.
- The meaning of wildcards (`*`, `?`, `[]`) is asked as well.

| Symbol | Meaning |
|------|------|
| `.` | Current directory |
| `..` | Parent directory |
| `~` | Home directory |
| `*` | Any characters, zero or more |
| `?` | Any single character |
| `[abc]` | One character from within the brackets |

**Path in one line**: An absolute path always points to the same place regardless of location, while a relative path points **relative to the current location**. In scripts, absolute paths are safer.

## Weak Point 7: Distributions and the Kernel Versioning Scheme

- A distribution is a finished product bundling the kernel + GNU tools + a package manager.
- Questions on telling the families apart are common.

| Family | Representative Distributions | Packages |
|------|-------------|------|
| Red Hat | RHEL, CentOS, Fedora, Rocky | rpm/yum |
| Debian | Debian, Ubuntu, Mint | deb/apt |
| Slackware | Slackware | tgz |
| SUSE | openSUSE, SLES | rpm/zypper |

- The kernel version notation is also asked.
- In the past, as with `2.6.x`, there was a rule that **even minor number = stable / odd = development**.
- From 3.x onward, this rule was abolished and releases became time-based. Check the current version with `uname -r`.

**uname options**: `uname -r` (kernel release), `uname -a` (all information), `uname -m` (machine architecture). On the exam, the answer for "command to check the kernel version" is `uname -r`.

**Distributions in one line**: CentOS/Rocky are free RHEL-compatible distributions, and Ubuntu is a popular Debian-based desktop and server distribution. If you know the family, you can infer the package tool.

## Weak Point 8: Shell Startup Flow and the Login Procedure

- The procedure from the user logging in after boot to the shell being launched is also within the scope of Primary Subject 1.

| Step | Description |
|------|------|
| Login prompt | `getty`/`login` verifies ID and password |
| Authentication | Checked against `/etc/passwd` and `/etc/shadow` |
| Shell launch | Starts the shell in the 7th field of passwd |
| Environment setup | profile and bashrc are loaded in sequence |

- Switching between virtual consoles (`Ctrl+Alt+F1~F6`) and the GUI (`F1` or `F7`) may also be asked at a general-knowledge level.

**Login shell vs non-login shell**: A login shell reads `~/.bash_profile`, while a non-login shell (a new terminal window) reads `~/.bashrc`. Usually `.bash_profile` sources `.bashrc` to unify them.

## Weak Point 9: The man Pages and Help System

- Linux's built-in documentation system is also asked in Subject 1.
- man pages are distinguished by **section number**.

| Section | Contents |
|------|------|
| 1 | General user commands |
| 2 | System calls |
| 3 | Library functions |
| 4 | Device files (/dev) |
| 5 | File formats and configuration files |
| 8 | System administration commands |

- When the same name exists in multiple sections, you distinguish them by number, as in `man 5 passwd` (file format) and `man 1 passwd` (command).

| Help Tool | Purpose |
|-------------|------|
| `man` | Manual pages |
| `info` | GNU info documents (hyperlinked) |
| `whatis` | One-line summary |
| `apropos` | Search commands by keyword |
| `command --help` | Quick option summary |

**Search in one line**: When you don't know what command to use, find related commands with `apropos keyword`, and once you know it, see the details with `man command`. `whatis` gives just a quick one-line definition.

## Weak Point 10: Prompts and Virtualization Basics

- Finally, we collect the general-knowledge items.
- The prompt's trailing symbol tells you the privilege level — `$` for a regular user, `#` for root. This single character tells you your current privilege at once.
- Virtualization and container basics also come up lightly at the Level 1 stage.

| Concept | Description |
|------|------|
| Hypervisor | Virtualization layer that runs VMs (KVM, Xen) |
| Container | Lightweight isolation sharing the OS kernel (Docker) |
| Host OS | The real OS that hosts virtualization |
| Guest OS | The OS running inside a VM |

**VM vs container**: A VM boots an entire guest OS, so it is heavy but has strong isolation, while a container shares the host kernel, so it is light but has relatively weaker isolation. This contrast is the exam focus.

**Boot basics wrap-up**: Reviewing the prompt symbols `#` (root), `$` (regular user), and `%` (csh family), together with the shutdown commands `shutdown -h now` (shut down immediately), `shutdown -r now` (reboot), `init 0` (shut down), and `init 6` (reboot), is enough to wrap up Subject 1.

Use the mock exam below to check your weak points in practice.

## 📖 Glossary

- **GNU/Linux** : The operating system completed by combining Linus's kernel and GNU's tools. Neither side alone makes an OS.
- **Copyleft** : The license principle that "works made with my code must be released under the same terms." The GPL is the representative example.
- **LGPL** : A relaxed GPL under which you do not have to disclose your own source when you use the code by linking it as a library.
- **Journaling** : A feature that records filesystem changes in advance so the system can recover quickly even after a sudden shutdown. Introduced with ext3.
- **swap** : An area that uses disk like memory when memory runs short. Typically sized at 1-2x RAM.
- **initramfs** : A temporary in-memory filesystem used before the kernel mounts the real root filesystem.
- **GRUB2** : The standard Linux bootloader. You don't edit `grub.cfg` directly; you edit `/etc/default/grub` and then generate it.
- **systemd target** : A system-state unit that replaces the old runlevels. 3 = multi-user and 5 = graphical correspond to it.
- **FHS** : The standard layout convention for Linux directories. It defines what goes into which directory.
- **/usr** : Not "user" but **Unix System Resources**. Applications and shared resources go here.
- **Absolute path / relative path** : A path that starts from `/` and points to the same place regardless of location / a path based on the current location.
- **man section** : The classification number of the manual. 1 = commands, 5 = file formats, 8 = administration commands.
- **apropos / whatis** : A keyword search for related commands / a summary showing only a command's one-line definition.
- **Hypervisor / container** : Heavy virtualization that boots an entire guest OS / lightweight isolation that shares the host kernel.

## 📝 Practice Questions

**Question 1.** Which option correctly pairs the person who first developed the Linux kernel with the person who started the GNU Project?

A) Linus Torvalds - Richard Stallman
B) Richard Stallman - Linus Torvalds
C) Ken Thompson - Dennis Ritchie
D) Andrew Tanenbaum - Linus Torvalds

**Answer: A**
Explanation: The Linux kernel was started by Linus Torvalds in 1991, and the GNU Project by Richard Stallman in 1983. The two products combined to become GNU/Linux.

---

**Question 2.** Which license lets commercial closed-source software link a library and use it without having to disclose its own source?

A) GPL
B) LGPL
C) AGPL
D) All copyleft licenses force disclosure

**Answer: B**
Explanation: The LGPL is a weak copyleft, and when a library is linked and used, it does not force the using side to disclose its source. The GPL forces disclosure even for derivative works.

---

**Question 3.** In systemd, which target corresponds to GUI multi-user mode, and what is the equivalent SysV runlevel?

A) multi-user.target - runlevel 3
B) rescue.target - runlevel 1
C) graphical.target - runlevel 5
D) poweroff.target - runlevel 0

**Answer: C**
Explanation: graphical.target is GUI multi-user mode and corresponds to SysV runlevel 5. Runlevel 3 is text multi-user (multi-user.target).

---

**Question 4.** In the FHS, which statement about the meaning and purpose of the `/usr` directory is correct?

A) It is where user home directories are gathered
B) It stands for Unix System Resources, and static shareable data and applications are located there
C) It is where logs, which are variable data, are stored
D) It is a temporary file store that is deleted on reboot

**Answer: B**
Explanation: `/usr` is not "user" but stands for Unix System Resources, and secondary applications and static shareable data are located there. User homes are in `/home`, and variable data is in `/var`.

---

**Question 5.** Which is the correct order of the Linux boot process?

A) Kernel → BIOS/UEFI → bootloader → init/systemd
B) BIOS/UEFI → bootloader (GRUB) → kernel → init/systemd
C) Bootloader → BIOS/UEFI → kernel → init/systemd
D) BIOS/UEFI → kernel → bootloader → init/systemd

**Answer: B**
Explanation: After power is applied, BIOS/UEFI checks the hardware and loads the bootloader (GRUB); the bootloader loads the kernel and initramfs into memory, and then init/systemd, PID 1, runs and reaches the target.

---

**Question 6.** In a GRUB2 environment, what is the correct way to change the boot configuration?

A) Edit `/boot/grub2/grub.cfg` directly
B) Modify `/etc/default/grub` and then generate the configuration with `grub2-mkconfig`
C) Modify `/etc/fstab`
D) Change the runlevel in `/etc/inittab`

**Answer: B**
Explanation: GRUB2's `grub.cfg` is an auto-generated file, so you don't edit it directly. The standard way is to edit `/etc/default/grub` and the like, then regenerate grub.cfg with `grub2-mkconfig`.

---

**Question 7.** Which of the following filesystems has no journaling feature?

A) ext3
B) ext4
C) ext2
D) XFS

**Answer: C**
Explanation: ext2 has no journaling. Journaling was added in ext3, ext4 added large-capacity and extended features, and XFS is also a journaling filesystem.

---

**Question 8.** Which standard directory holds system administration commands (mainly root-only)?

A) `/bin`
B) `/sbin`
C) `/etc`
D) `/opt`

**Answer: B**
Explanation: `/sbin` holds essential system administration commands (mainly for root). `/bin` holds essential commands that regular users also use, `/etc` holds configuration files, and `/opt` holds add-on packages.

---

**Question 9.** Which command changes the system's default boot target to text multi-user mode?

A) `systemctl get-default multi-user.target`
B) `systemctl set-default multi-user.target`
C) `runlevel 3`
D) `init multi-user.target`

**Answer: B**
Explanation: Changing the default target is done with `systemctl set-default <target>`. `get-default` is for querying, and `runlevel` is the command to check the current runlevel.

---

**Question 10.** Which statement about the wildcard `?` is correct?

A) Any string of zero or more characters
B) Any single character
C) One character from within the brackets
D) The home directory

**Answer: B**
Explanation: `?` matches any single character. Zero or more is `*`, one character within brackets is `[]`, and the home directory is `~`.

---
