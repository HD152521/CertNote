# Day 3 - Installation and Booting: From the Moment You Power On

## 📌 Key Takeaways

- Partitions give you isolation, flexibility, and a unit for backup. The key ones are `/`, `/boot`, swap, `/home`, and `/var`.
- **MBR** is limited to 2TB and 4 primary partitions; **GPT** supports 9.4ZB and 128 partitions and stores its table twice. GPT is paired with UEFI.
- Booting is a 4-stage relay: **firmware (BIOS/UEFI) → bootloader (GRUB2) → kernel (initramfs) → init/systemd (PID 1)**.
- For GRUB2, edit `/etc/default/grub` and **regenerate with `grub2-mkconfig`**. Editing `grub.cfg` directly is the wrong answer.
- systemd **replaces SysV runlevels with targets** and turns serial execution into parallel execution.

## Partitions — Splitting One Disk into Several Rooms

You should be able to explain, step by step, what happens from the moment you press the power button until the login prompt appears. The starting point is disk design.

- **Partition**: Logically dividing one physical disk into several independent regions.
- **Isolation**: If one partition fills up or gets damaged, the other partitions stay safe. Even if logs run wild and `/var` fills up, `/` (root) is fine.
- **Flexibility**: Each partition can use a different filesystem and different mount options.
- **Backup/recovery unit**: You can back up and restore by partition.

| Partition | Mount point | Role |
|--------|------------|------|
| Root | `/` | The reference point for the entire system, required |
| Boot | `/boot` | Kernel images and bootloader files (separating it is recommended) |
| Swap | swap | Virtual memory, a supplement when RAM runs short |
| Home | `/home` | User data, convenient to preserve on reinstall |
| Variable | `/var` | Frequently changing data such as logs, caches, and mail |

- **Swap** is special. It isn't mounted on a directory; it's virtual memory space where unused memory pages are pushed out to disk (swap out) when RAM runs short.
- In the past, "swap = 2x RAM" was the rule, but on modern systems with plenty of RAM, swap is sometimes set equal to or smaller than RAM.

There are two traditional reasons to split `/boot` into a separate partition. First, older BIOSes could only read the kernel within a certain range at the front of the disk (1024 cylinders), so the boot files had to be placed near the front of the disk. Second, even if the root filesystem is complicated by LVM, encryption, RAID, and so on, keeping `/boot` simple ensures the bootloader can reliably access it.

## MBR vs. GPT — Two Kinds of Partition Table

Partition information is recorded somewhere on the disk as a "partition table." There are two kinds, and it is a comparison topic on the Level 1 exam.

- **MBR (Master Boot Record)**: The traditional scheme used since 1983. It holds the boot code and partition table in the first sector of the disk (512 bytes).
  - Recognizes up to only **2TB** (32-bit sector address limit)
  - **Up to 4 primary partitions**. If you need more, you create 1 extended partition and place logical partitions inside it.
- **GPT (GUID Partition Table)**: A modern scheme that arrived together with UEFI.
  - Supports disks up to **9.4ZB** (effectively unlimited)
  - Supports **128** partitions by default
  - Stores the partition table **twice**, at the front and back of the disk, so it is resilient to damage

| Item | MBR | GPT |
|------|-----|-----|
| Max disk size | 2TB | 9.4ZB |
| Number of partitions | 4 primary or 3 primary + 1 extended | 128 by default |
| Firmware | BIOS | UEFI (BIOS-compatible possible) |
| Backup | Single | Stored twice, front and back |

```bash
# Check disk and partition information
lsblk                       # Block devices in a tree
fdisk -l                    # Details of MBR/GPT partition tables
parted -l                   # A tool that handles GPT better
blkid                       # Partition UUIDs and filesystem types

# Try it yourself: view the current disk structure as a tree
lsblk -f                    # Also shows filesystem information
```

> ⚠️ **Pitfall**: The phrase "4 primary partitions + an extended partition" for MBR is wrong. The extended partition also occupies one of the 4 slots, so the accurate statement is "up to 4 primary partitions, or 3 primary partitions + 1 extended partition." You work around the limit of 4 by creating several logical partitions inside the extended partition.

## The Big Picture of Booting — A 4-Stage Relay

From the moment you press the power button until the login screen is like a huge relay race. Each stage wakes the next one and passes the baton.

```
[Power ON]
   ↓
1. Firmware (BIOS or UEFI) - hardware check (POST), select boot device
   ↓
2. Bootloader (GRUB2) - loads the kernel into memory
   ↓
3. Kernel (vmlinuz) - initializes hardware, mounts root via initramfs
   ↓
4. init/systemd (PID 1) - starts services, login prompt
   ↓
[Login screen]
```

## Stage 1: Firmware — BIOS and UEFI

- When power comes on, the **firmware** wakes up first. It is the lowest-level software that initializes hardware, stored in the motherboard's ROM.
- **BIOS (Basic Input/Output System)** — the traditional firmware.
  - It runs the **POST (Power-On Self-Test)** to check that core hardware such as the CPU, memory, and keyboard is working properly.
  - It finds a boot device according to the boot priority, reads the MBR (512 bytes), which is the first sector of that disk, and executes the boot code in it.
- **UEFI (Unified Extensible Firmware Interface)** — the modern firmware that replaces BIOS.
  - Supports GPT disks and disks larger than 2TB
  - Stores the bootloader as a file in a dedicated partition called the **EFI System Partition (ESP)** (usually `/boot/efi`, FAT-formatted)
  - **Secure Boot** blocks unsigned bootloaders and kernels from running
  - Graphical setup screens, mouse support, network boot, and more

| Item | BIOS | UEFI |
|------|------|------|
| Bootloader location | MBR (first sector) | ESP (a file on the EFI partition) |
| Partition scheme | Mostly MBR | Mostly GPT |
| Disk limit | 2TB | Over 2TB possible |
| Security | None | Secure Boot |

UEFI Secure Boot requires digital signatures on the bootloader and kernel to stop rootkits from interfering in the boot process. For this, Linux distributions load GRUB through a small bootloader called "shim" that carries a Microsoft signature. A practical pitfall is that loading an unsigned kernel module with Secure Boot enabled requires extra configuration (MOK enrollment).

## Stage 2: The GRUB2 Bootloader — Kernel into Memory

- The **boot loader** has just one job — **to find the kernel on disk, load it into memory, and hand over control**.
- The standard Linux bootloader is **GRUB2 (GRand Unified Bootloader 2)**. It is a complete rewrite of the earlier version, GRUB Legacy.
  - Provides a **boot menu** to choose among multiple operating systems and kernels
  - Modular structure supports a variety of filesystems and devices
  - You can drop into a shell at boot and type commands directly (useful for recovery)
- Configuration is divided into **places the user touches directly** and **places that are auto-generated**. This distinction is very important.

```bash
# Configuration files the user edits
/etc/default/grub           # Basic settings (timeout, kernel parameters, etc.)
/etc/grub.d/                # Scripts that generate menu entries

# The final auto-generated configuration file (do NOT edit directly!)
/boot/grub2/grub.cfg        # Red Hat family
/boot/grub/grub.cfg         # Debian family

# After changing settings, you must regenerate grub.cfg for them to apply
grub2-mkconfig -o /boot/grub2/grub.cfg    # Red Hat family
update-grub                               # Debian family (wrapper for grub-mkconfig)
```

- The easy mistake is **editing `/boot/grub2/grub.cfg` directly**. This file is auto-generated from `/etc/default/grub` and `/etc/grub.d/`, so it gets overwritten the next time `grub2-mkconfig` runs.
- The correct procedure: modify `/etc/default/grub`, then regenerate with `grub2-mkconfig`.

```bash
# Try it yourself: check the GRUB default settings
cat /etc/default/grub
# GRUB_TIMEOUT=5            Menu wait time (seconds)
# GRUB_DEFAULT=0           Default boot entry number
# GRUB_CMDLINE_LINUX="..." Boot parameters passed to the kernel
```

> ⚠️ **Pitfall**: The exam asks for `grub2-mkconfig -o /boot/grub2/grub.cfg` as "the command to apply changes after modifying GRUB2 settings." A choice saying you edited `/boot/grub2/grub.cfg` directly with vi is the wrong procedure. The difference that Red Hat uses the `grub2-` prefix while Debian uses `grub-` (or `update-grub`) is also tested.

The name "GRand Unified Bootloader" parodies the physics term "Grand Unified Theory." It carries the ambition to unify the booting of every operating system with a single bootloader. In fact, GRUB can boot not only Linux but also Windows, BSD, and nearly every other OS through chain loading.

## Stage 3: The Kernel and initramfs

Once GRUB2 loads the kernel image (`/boot/vmlinuz-*`) into memory and hands over control, the **kernel** becomes the star.

1. It decompresses and unpacks itself into memory (vmlinuz is a compressed kernel).
2. It initializes the CPU, memory, and basic devices.
3. It mounts the **initramfs** (initial RAM filesystem) as a temporary root.

- Why **initramfs (initrd)** is needed: for the kernel to mount the real root filesystem (`/`), it needs the driver for that disk, but if that driver is inside the root filesystem itself, you hit a "chicken-and-egg" problem.
- The initramfs is a temporary mini root filesystem that holds the minimum drivers and tools needed for booting.
- It is brought up in memory first to load the drivers for the real root disk (for example, RAID, LVM, and encrypted device drivers), and then the real root is mounted.

```bash
# Check the initramfs image
ls /boot/initramfs-*        # Red Hat family
ls /boot/initrd.img-*       # Debian family

# Regenerate initramfs (after adding drivers)
dracut -f                   # Red Hat family
update-initramfs -u         # Debian family
```

- Once the real root filesystem is mounted, the kernel runs the first user process on top of it. That is the **PID 1** process.

The "z" in `vmlinuz` stands for compression (zip), and "vm" means the kernel supports virtual memory. The kernel is stored compressed to save disk space and because the reduced read time from disk offsets the cost of decompression (handled quickly by the CPU). The uncompressed version is `vmlinux` (no z), mostly used for debugging.

## Stage 4: init and systemd — The First Process

- The last thing the kernel does is run the **init process (PID 1)**.
- This process becomes the ancestor of all other processes, and it never dies until the system shuts down.
- Its job is to bring the system into a usable state — it starts services such as networking, logging, and web servers in a set order.
- **Traditional SysV init**: It defined system state by **runlevels**. It distinguished states with numbers from 0 (shutdown) to 6 (reboot), and ran scripts under `/etc/rc.d/` in order. It was slow because execution was serial.

| Runlevel | State |
|--------|------|
| 0 | System shutdown (halt) |
| 1 | Single-user mode (recovery) |
| 3 | Multi-user + network (text) |
| 5 | Multi-user + GUI |
| 6 | Reboot |

- **systemd**: The standard init of modern Linux. It turns SysV init's slow serial execution into **parallel execution**, manages dependencies between services automatically, and uses the concept of **targets** instead of runlevels.

| SysV runlevel | systemd target |
|------------|-------------|
| 3 (text multi-user) | multi-user.target |
| 5 (GUI) | graphical.target |
| 0 (shutdown) | poweroff.target |
| 6 (reboot) | reboot.target |
| 1 (single-user) | rescue.target |

```bash
# Manage services with systemd
systemctl start httpd       # Start a service
systemctl enable httpd      # Register to start automatically at boot
systemctl status httpd      # Check status
systemctl get-default       # Check the current default target
systemctl set-default multi-user.target   # Set the default target to text mode

# Boot time analysis (systemd only)
systemd-analyze             # Total boot time
systemd-analyze blame       # Ranking of start time by service
```

systemd is not just an init but a huge collection of tools that integrates all of system management. It covers service management (systemctl), log management (journalctl), time management (timedatectl), networking (networkd), and more. Some criticize it as "against the Unix philosophy (small tools)," but nearly every major distribution has adopted systemd. For Level 1, the systemctl commands and the runlevel↔target correspondence are the key.

systemd was announced in 2010 by Lennart Poettering of Red Hat. In the early days of its adoption there was a fierce debate (the systemd controversy) over "violating the Unix philosophy" and "being too bloated," and Debian even held a vote over its init system. Nevertheless, the benefits of dependency-based parallel booting and a consistent management interface were large, and in the end RHEL, Ubuntu, Debian, and SUSE all standardized on systemd.

Next time, we'll cover the directory structure (FHS) inside the mounted filesystem, and the concrete file types in which the "everything is a file" philosophy shows up in Linux.

## 📖 Glossary

- **Partition**: An independent region made by logically dividing one physical disk. If one blows up, the rest stay safe.
- **Swap**: Disk space that temporarily evacuates unused memory pages when RAM runs short. It isn't mounted on a directory.
- **MBR**: The old scheme that holds boot code and a partition table in the first 512 bytes of the disk. Limited to 2TB and 4 partitions.
- **GPT**: The modern partition table that replaced MBR. Effectively no capacity limit, and it keeps the table twice, at the front and back.
- **UEFI**: The modern firmware that replaced BIOS. It keeps the bootloader as a file on the ESP and supports Secure Boot.
- **ESP (EFI System Partition)**: A dedicated FAT-formatted partition where UEFI finds bootloader files. Usually mounted at `/boot/efi`.
- **POST**: The self-test in which the firmware checks that the CPU, memory, and so on are working right after power comes on.
- **GRUB2**: The standard Linux bootloader. Its main job is loading the kernel into memory, and it provides a boot menu and a recovery shell.
- **grub.cfg**: GRUB2's final configuration file. It is auto-generated, so it must not be edited directly; create it with `grub2-mkconfig`.
- **initramfs (initrd)**: A temporary RAM filesystem holding the drivers needed to mount the real root.
- **vmlinuz**: The compressed Linux kernel image. The z means compression, and vm means virtual memory support.
- **Runlevel / target**: A definition of the system's operating state. SysV uses numbers (0-6), and systemd uses names (such as multi-user.target).

## 📝 Practice Questions

**Question 1.** Which is the correct order of the Linux boot process?

A) Bootloader → firmware (BIOS/UEFI) → kernel → init/systemd
B) Firmware (BIOS/UEFI) → bootloader (GRUB2) → kernel → init/systemd
C) Kernel → firmware (BIOS/UEFI) → bootloader → init/systemd
D) Firmware (BIOS/UEFI) → kernel → bootloader → init/systemd

**Answer: B**

Explanation: When power comes on, the firmware (BIOS/UEFI) performs POST and selects a boot device, then the bootloader (GRUB2) loads the kernel into memory, and the kernel mounts root via initramfs and then runs the first process, init/systemd (PID 1), which starts services. A is wrong because the bootloader cannot come before the firmware. C is wrong because the kernel cannot come first. D has the kernel and bootloader order reversed.

---

**Question 2.** Which is a correct description of the MBR and GPT partitioning schemes?

A) MBR can create up to 128 primary partitions and supports up to 9.4ZB
B) GPT recognizes disks only up to 2TB and is a BIOS-only scheme
C) MBR supports disks up to 2TB and is limited to at most 4 primary partitions
D) GPT stores the partition table in a single location only, so it is vulnerable to damage

**Answer: C**

Explanation: MBR supports disks up to 2TB because of the 32-bit sector address limit, and can create up to 4 primary partitions (or 3 primary + 1 extended). A wrongly applies GPT's characteristics (128, 9.4ZB) to MBR. B is the opposite: GPT supports more than 2TB and is used with UEFI. D is wrong. GPT stores the partition table twice, at the front and back of the disk, so it is resilient to damage.

---

**Question 3.** What is the correct procedure to change and apply GRUB2 settings?

A) Editing /boot/grub2/grub.cfg directly with vi applies permanently and immediately
B) Modify /etc/default/grub, then regenerate grub.cfg with grub2-mkconfig
C) Modify /etc/fstab, then update the boot menu with the mount -a command
D) Edit /boot/vmlinuz directly to change kernel parameters

**Answer: B**

Explanation: For GRUB2, grub2-mkconfig automatically generates grub.cfg based on the contents of /etc/default/grub and /etc/grub.d/. Therefore you must modify /etc/default/grub and then regenerate with grub2-mkconfig -o. A is wrong. If you edit grub.cfg directly, it gets overwritten at the next regeneration. C: fstab and mount have nothing to do with the boot menu. D: vmlinuz is a compiled kernel binary and not something to edit directly.

---

**Question 4.** What is the best description of the role of initramfs (initrd) in the boot process?

A) It runs the user's login shell and provides the command-line interface
B) It is a temporary root that holds the drivers needed to mount the real root filesystem
C) It is a bootloader that decompresses the kernel and writes it to the disk's MBR
D) It is the PID 1 process that starts all services in parallel after boot

**Answer: B**

Explanation: The initramfs is a temporary mini root filesystem holding the drivers (RAID, LVM, encryption, etc.) and tools needed to mount the real root filesystem, and it solves the circular problem of "the driver is inside the root, so the root can't be opened." A has nothing to do with the login shell. C is the bootloader's (GRUB2's) job, not initramfs. D is the role of init/systemd (PID 1).

---

**Question 5.** Which of the following correspondences between SysV init runlevels and systemd targets is NOT correct?

A) Runlevel 3 corresponds to multi-user.target
B) Runlevel 5 corresponds to graphical.target
C) Runlevel 0 corresponds to reboot.target
D) Runlevel 1 corresponds to rescue.target

**Answer: C**

Explanation: Runlevel 0 is system shutdown and corresponds to poweroff.target, while runlevel 6, reboot, corresponds to reboot.target. Therefore C is wrong. A is correct. Runlevel 3 (text multi-user) is multi-user.target. B is correct. Runlevel 5 (GUI) is graphical.target. D is correct. Runlevel 1 (single-user/recovery) is rescue.target.

---

**Question 6.** Which is a correct description of BIOS and UEFI firmware?

A) BIOS provides Secure Boot by default, which blocks unsigned bootloaders from running
B) UEFI stores the bootloader as a file on the EFI System Partition (ESP) and supports GPT
C) UEFI can store the bootloader only in the first sector (512 bytes) of the MBR
D) BIOS supports booting from disks larger than 2TB as a standard feature

**Answer: B**

Explanation: UEFI stores the bootloader as a file on the FAT-formatted EFI System Partition (ESP, usually /boot/efi), and supports GPT and disks larger than 2TB. A is wrong. Secure Boot is a feature of UEFI, not BIOS. C is wrong. Storing in the MBR's first sector is the BIOS way; UEFI stores it as a file on the ESP. D is wrong. BIOS+MBR has a 2TB limit, so booting from larger disks is not supported as a standard.

---

