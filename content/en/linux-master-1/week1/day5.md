# Day 5 - Week 1 Comprehensive Review: Time to See Through the Concepts

## 📌 Key Takeaways

- Week 1 is all woven into one storyline: "what happens when you power on."
- Order: firmware (POST) → partitions/MBR·GPT → GRUB2 → kernel·initramfs → systemd (PID 1) → shell.
- The comparison tables are the exam points — kernel/user mode, GPL/BSD, MBR/GPT, SysV/systemd, hard/symbolic links.
- The 3 big pitfalls: **dynamic linking with LGPL has no disclosure obligation**, **SUSE is an independent family but uses RPM**, **runlevel 0 = shutdown, 6 = reboot**.
- Level 1 is a written exam (concepts, comparisons, history) + a practical exam (commands). Don't memorize commands with your eyes only; type them yourself.

## Week 1 Revisited as a Flow

The best way to understand Linux is to follow "what happens when you power on." Every concept from this week is inside this one storyline.

- When you power on, the **firmware (BIOS or UEFI)** wakes up, checks the hardware (POST), and picks a boot device (Day 3).
- That disk is divided into **partitions**, and the partition information is held in an MBR or GPT table (Day 3).
- The firmware runs the **GRUB2 bootloader**, and GRUB2 finds the **kernel (vmlinuz)** in `/boot` and loads it into memory (Day 3).
- The kernel, with a monolithic structure holding all the core functions (Day 1), mounts the real root filesystem via initramfs and then runs the first process, **systemd (PID 1)** (Day 3).
- systemd starts services in parallel to make the system usable, and finally the **shell** greets the logged-in user (Day 1).
- The shell runs the user's commands with the fork-exec-wait model, and those commands live in `/bin` and `/sbin` (Day 1, Day 4).
- Everything the user handles is a file on the **FHS** tree extending from a single root (`/`) (Day 4), and the true identity of that file is not its name but its **inode** (Day 4).
- The reason all this software can be shared freely is the copyleft of the **GPL license**, and that freedom grew the **distribution** ecosystem of Ubuntu, Red Hat, SUSE, and others (Day 2).

> 💡 **Concept**: The Level 1 exam tends to test "connections between concepts" more than isolated facts. For example, "Why do we put /boot on a separate partition?" can only be answered by understanding partitions (Day 3) + the boot process (Day 3) + filesystems (Day 4) all at once. When reviewing, it is better to organize these links than to memorize individual commands.

## The Key Comparison Table You Must Remember

We've gathered in one place the "which one is it?" comparisons that appeared this week. Even just looking at this table right before the exam helps a lot.

| Comparison topic | A | B | Key difference |
|----------|---|---|----------|
| Kernel mode vs. user mode | Kernel (Ring0) | User (Ring3) | Privileged vs. restricted, system calls in between |
| Monolithic vs. microkernel | Linux (fast) | Hurd (modular) | Single space vs. separated services |
| GPL vs. BSD/MIT | Copyleft (forces disclosure) | Permissive (closed allowed) | Whether derivatives must be disclosed |
| GPL vs. LGPL | Full disclosure | Dynamic linking can stay closed | Weak copyleft |
| RPM family vs. DEB family | rpm/dnf/.rpm | dpkg/apt/.deb | Package format and tools |
| MBR vs. GPT | 2TB/4 partitions | 9.4ZB/128 | Disk and partition limits |
| BIOS vs. UEFI | MBR/legacy | ESP/GPT/Secure Boot | Firmware generation |
| SysV init vs. systemd | Runlevels/serial | Targets/parallel | Boot method |
| Hard link vs. symbolic link | Same inode | New inode holding a path | Whether it works across partitions/directories |
| Block vs. character device | b/disk/random | c/keyboard/stream | I/O unit |

> ⚠️ **Pitfall**: There are three easy-to-confuse traps on the exam. ① A closed-source app that **dynamically links** an LGPL library has **no** obligation to disclose its source. ② SUSE is an independent family, but its package format is **RPM**. ③ Runlevel 0 is shutdown (poweroff), and 6 is reboot.

## Frequently Used Commands at a Glance

We've grouped the commands that appeared this week by function. The Level 1 practical exam requires hands-on experience typing them.

```bash
# --- System information ---
uname -r                    # Kernel version
uname -a                    # Full system information
cat /etc/os-release         # Distribution information
echo $SHELL                 # Current shell

# --- Package management (Red Hat) ---
rpm -qa                     # All installed packages
dnf install <pkg>           # Install with automatic dependencies
dnf update                  # Update everything

# --- Package management (Debian) ---
dpkg -l                     # All installed packages
apt install <pkg>           # Install with automatic dependencies
apt update && apt upgrade   # Refresh the list, then upgrade

# --- Boot/services ---
systemctl status <svc>      # Service status
systemctl enable <svc>      # Start automatically at boot
systemctl get-default       # Check the default target
grub2-mkconfig -o /boot/grub2/grub.cfg   # Regenerate GRUB

# --- Disks/partitions ---
lsblk                       # Block device tree
fdisk -l                    # Partition table
blkid                       # UUID and filesystem type

# --- Files/links/inodes ---
ls -li                      # Listing including inode numbers
stat <file>                 # Detailed metadata
ln <src> <link>             # Hard link
ln -s <src> <link>          # Symbolic link
file <file>                 # Determine file type
```

When memorizing commands, learning "what the options mean" along the way makes them easier to apply. For example, if you know the i (install), v (verbose), and h (hash progress display) of `rpm -ivh`, you will naturally understand `rpm -Uvh` (Upgrade) too. If you know that the i in `ls -li` is inode, `ls -a` (all, hidden files) comes to mind as well. Most options are the first letter of an English word.

## Exam Preparation Mindset

Linux Master Level 1 is split into a written exam and a practical exam. The written exam asks about concepts, comparisons, and history, and the practical exam checks whether you can actually type commands.

- **Concept questions**: Get definitions exactly right, as in "the four core functions of an operating system," "the Unix philosophy," or "the meaning of copyleft." The choices are made to look similar and confuse you, so memorize the keywords clearly.
- **Comparison questions**: The comparison table above is asked as is. You should be able to state the key difference between A and B in one line.
- **Command questions**: Get commands, options, and configuration file paths exactly right. Even paths like `/etc/default/grub` are asked.
- **Order questions**: For questions asking about order, such as the 4 boot stages or the fork-exec-wait order, remember the stages as a picture.

Linux Master is a nationally accredited private certification administered by the Korea Association for ICT Promotion (KAIT). Level 2 verifies beginner-level Linux skills, and Level 1 verifies practical server operation and administration skills. For Level 1 you must pass the 1st-round written exam and then take the 2nd-round practical exam, so rather than memorizing commands with your eyes only, installing Linux yourself in a virtual machine and typing them is the shortcut to passing.

Starting next week, we move into real hands-on skills: file and directory commands, permission and ownership management (chmod, chown), user and group management, and process control. The inodes and file types you learned today are the starting point.

## 📖 Glossary

- **POST**: The stage where the firmware self-tests the CPU, memory, and so on right after power comes on.
- **initramfs**: A temporary RAM filesystem holding the drivers needed to mount the real root.
- **PID 1**: The first user process the kernel launches (systemd). It is the ancestor of all processes.
- **Copyleft**: The core device of the GPL that forces derivatives to be released under the same free license.
- **LGPL**: Weak copyleft. If you only dynamically link a library, you don't have to disclose your app's source.
- **RPM family / DEB family**: The Red Hat camp that uses `rpm` and `dnf`, and the Debian camp that uses `dpkg` and `apt`.
- **Target**: The name of a system state that systemd uses in place of runlevels (such as multi-user.target).
- **inode**: The data structure that holds a file's metadata. The file name is not in it.
- **FHS**: The standard that decides what goes in which directory. It's why locations are the same even across different distributions.
- **fork-exec-wait**: The 3 steps by which the shell runs a command — clone, swap in the program, and wait for it to finish.

## 📝 Practice Questions

**Question 1.** Which of the following descriptions of each stage's role in the Linux boot process is NOT correct?

A) The firmware (BIOS/UEFI) checks the hardware with POST and selects a boot device
B) The bootloader (GRUB2) loads the kernel image into memory and hands over control
C) The kernel uses initramfs to mount the real root filesystem
D) systemd decompresses the kernel and writes it to the first sector of the MBR

**Answer: D**

Explanation: systemd is the PID 1 process whose role is to start services in parallel; it does not decompress the kernel or write to the MBR. Therefore D is wrong. A is correct. The firmware handles POST and boot device selection. B is correct. GRUB2 loads the kernel into memory. C is correct. The kernel mounts root with initramfs.

---

**Question 2.** Which best explains the difference between copyleft (GPL) and permissive licenses (BSD/MIT)?

A) The GPL forces source disclosure of derivatives, but BSD/MIT allows closed-source distribution
B) BSD/MIT forces source disclosure of derivatives, but the GPL does not
C) Both licenses prohibit commercial use in all cases
D) The GPL and BSD/MIT have completely identical license terms, so there is no need to distinguish them

**Answer: A**

Explanation: The GPL is copyleft and forces derivatives to also be released under the GPL, while BSD/MIT are permissive licenses that allow you to make a closed-source commercial product as long as you keep the copyright notice. B is the opposite. Forced disclosure is on the GPL side. C is wrong. Both licenses allow commercial use. D is wrong. There is a key difference in whether derivatives must be disclosed.

---

**Question 3.** In the fork-exec-wait model by which the Linux shell runs commands, which is a correct description of each system call's role?

A) fork() replaces the child process's memory image with a new program
B) exec() clones the parent process to create an identical child
C) wait() has the parent wait for the child's termination and collect its exit status
D) fork() immediately terminates the parent process and leaves only the child

**Answer: C**

Explanation: wait() is the system call by which the parent (shell) waits for the child process to terminate and collects its exit status, which prevents zombie processes. A is wrong. Replacing the image is exec()'s role. B is wrong. Cloning is fork()'s role. D is wrong. fork() does not terminate the parent; it only clones the child.

---

**Question 4.** Which is a correct description of package management in the Red Hat family and the Debian family?

A) Red Hat uses the .deb format and Debian uses the .rpm format
B) Red Hat's high-level tool is dnf/yum, and Debian's high-level tool is apt
C) The low-level tools rpm and dpkg both resolve all dependencies automatically
D) The Debian family has no concept of package dependencies, so it needs no repository

**Answer: B**

Explanation: The Red Hat family uses dnf/yum and the Debian family uses apt as their high-level (automatic dependency resolution) tools. A is the opposite. Red Hat uses .rpm and Debian uses .deb. C is wrong. Low-level tools (rpm, dpkg) cannot resolve dependencies automatically, which is why high-level tools are needed. D is wrong. Debian also has the concept of dependencies and uses repositories.

---

**Question 5.** Which is a correct description of hard links and symbolic links?

A) A hard link can point to another partition and to a directory
B) A symbolic link shares the same inode number as the original
C) A hard link points to the same inode as the original, so the data is kept even after the original is deleted
D) A symbolic link never breaks even if the original is deleted

**Answer: C**

Explanation: A hard link is another name pointing to the same inode as the original, so even if you delete the original, only the inode's link count decreases and the data is kept. A is wrong. Only symbolic links can cross partitions and point to directories. B is wrong. A symbolic link has its own new inode. D is wrong. A symbolic link becomes a broken link when the original disappears.

---

**Question 6.** Which of the following correspondences between SysV init runlevels and systemd targets is correct?

A) Runlevel 0 corresponds to graphical.target (GUI)
B) Runlevel 3 corresponds to multi-user.target (text multi-user)
C) Runlevel 5 corresponds to poweroff.target (shutdown)
D) Runlevel 6 corresponds to rescue.target (single-user)

**Answer: B**

Explanation: Runlevel 3 (text multi-user + network) corresponds to systemd's multi-user.target. A is wrong. Runlevel 0 is poweroff.target (shutdown). C is wrong. Runlevel 5 is graphical.target (GUI). D is wrong. Runlevel 6 is reboot.target (reboot), and rescue.target corresponds to runlevel 1.

---

**Question 7.** Which is a correct description of inodes in a Linux filesystem?

A) An inode stores the file's name as its key information
B) If disk capacity is sufficient, inode exhaustion never occurs
C) An inode holds metadata such as permissions, owner, size, and data block addresses
D) A directory is a special object that does not use an inode

**Answer: C**

Explanation: An inode is a data structure that holds metadata such as the file's permissions (rwx), owner (UID/GID), size, timestamps, link count, and data block addresses. A is wrong. The file name is stored as a mapping in the directory, not in the inode. B is wrong. The number of inodes is fixed when the filesystem is created, so they can be exhausted even when capacity remains. D is wrong. A directory is also a kind of file that has an inode.

---

**Question 8.** Which of the following descriptions of basic Linux kernel and operating system concepts is NOT correct?

A) The Linux kernel is monolithic and can load modules dynamically with LKM
B) User-mode programs request privileged operations from the kernel through system calls
C) "Linux" strictly refers to the kernel, and Ubuntu and the like are distributions
D) The shell is part of the kernel and directly controls the hardware in Ring 0 privileged mode

**Answer: D**

Explanation: The shell is not part of the kernel but a command interpreter running in user mode (Ring 3); it does not control hardware directly and instead requests things from the kernel through system calls. Therefore D is wrong. A is correct. Linux is monolithic and supports LKM. B is correct. User programs request privileged operations through system calls. C is correct. Linux is the kernel and Ubuntu is a distribution.

---

**Question 9.** Which is a correct description of the relationship between MBR and GPT, and between BIOS and UEFI?

A) BIOS is mostly used with GPT, and UEFI is mostly used with MBR
B) UEFI stores the bootloader on the EFI System Partition (ESP) and mostly uses GPT
C) MBR supports 9.4ZB disks and 128 partitions
D) GPT stores the partition table in a single location only, so it is more vulnerable to damage than MBR

**Answer: B**

Explanation: UEFI stores the bootloader as a file on the FAT-formatted EFI System Partition (ESP) and is mostly used with the GPT partitioning scheme. A is the opposite. BIOS pairs with MBR, and UEFI pairs with GPT. C is wrong. 9.4ZB and 128 partitions are GPT's characteristics. D is wrong. GPT stores the table twice, at the front and back of the disk, so it is more resilient to damage than MBR.

---

**Question 10.** Which of the following is NOT a case that best illustrates the Unix philosophy "Everything is a file"?

A) Opening a device like /dev/sda as a file and handling it with read/write
B) Reading /proc/cpuinfo with cat to check CPU information as text
C) Process information can be read as files in the /proc/<PID> directory
D) Like Windows, the C drive and D drive each have an independent root

**Answer: D**

Explanation: Windows' independent root per drive (C:, D:) is the opposite concept of Linux's single-root (/) tree and the "everything is a file" philosophy. Linux mounts other disks on a directory of the tree as well. A is a case of handling a device like a file, consistent with the philosophy. B is a case of reading kernel information like a file through a virtual filesystem. C is a case of handling processes like files.

---

**Question 11.** Which is a correct description of the free software (FSF) and open source (OSI) movements?

A) The free software movement was started by Eric Raymond in 1998, and open source by Stallman in 1985
B) The "Free" in free software means free of charge, and it can never be sold for a fee
C) Free software emphasizes ethical freedom, and open source emphasizes a pragmatic development methodology
D) The two movements deal with completely different code and are not compatible

**Answer: C**

Explanation: The free software movement (FSF, 1985) emphasizes ethical freedom, and the open source movement (OSI, 1998) emphasizes a pragmatic, business-friendly development methodology. The code they cover is almost the same, but the emphasis differs. A has the two people and years swapped. B is wrong. "Free" means freedom, and selling for a fee is allowed. D is wrong. The two movements deal with almost the same code.

---

**Question 12.** Which is a correct description of the procedure for changing GRUB2 settings and of systemd service management?

A) If you edit /boot/grub2/grub.cfg directly, it is overwritten the next time grub2-mkconfig runs
B) systemctl enable starts the service immediately but prevents automatic start at boot
C) /etc/default/grub is an auto-generated file, so it must not be edited directly
D) systemctl get-default prints the service's dependency list

**Answer: A**

Explanation: /boot/grub2/grub.cfg is auto-generated by grub2-mkconfig from /etc/default/grub and /etc/grub.d/, so even if you edit it directly, it is overwritten at the next regeneration. B is wrong. enable registers automatic start at boot, and starting immediately is done by start. C is the opposite. /etc/default/grub is the file the user edits, and what is auto-generated is grub.cfg. D is wrong. get-default prints the default target (runlevel).

---
