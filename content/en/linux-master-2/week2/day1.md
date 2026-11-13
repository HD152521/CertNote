# Day 1 - Installation Types and Preparation: Before You First Install Linux

## 📌 Key Takeaways

- Before installing, first check the **architecture (x86_64/ARM) and hardware compatibility**.
- Installation media come in four types: **DVD, USB, network (PXE), and Live image**. A Live image is for **trying it out first without installing**.
- Installation types split into **server / desktop / minimal**, and the rule for servers is usually to **leave out the GUI**.
- For beginner study, a **virtual machine installation** is the safest. You can roll back with snapshots.
- At the end of installation, you create the **root password** and a **regular user account**. Do everyday work as the regular user.

## What to Check Before Installing

| Item | Why check it |
|------|--------|
| **Architecture** | x86_64 (most PCs), ARM (Raspberry Pi, Apple silicon) — the images differ |
| CPU virtualization support | If you'll use a virtual machine, VT-x/AMD-V must be enabled |
| Memory and disk | Minimum requirements differ by distribution. They grow greatly if you use a GUI |
| Hardware compatibility | Wireless LAN and graphics cards are common trouble spots |
| Existing data | **Partitioning cannot be undone.** Back up first |

> If the architecture doesn't match, the installation won't even start. 32-bit is written as `i386`/`i686`, and 64-bit as `x86_64` (or `amd64`).

## The Four Types of Installation Media

| Medium | Description | When to use |
|------|------|----------|
| **DVD/ISO** | An image containing the packages needed for installation | Standard installation |
| **USB** | Write the ISO to a USB drive and boot from it | Modern PCs with no optical drive |
| **Network (PXE)** | Boot over the LAN and install | Installing many machines at once |
| **Live image** | Runs straight from memory **without installing** | Trying it out first, recovery work |

- **The key point of a Live image** is that "it doesn't write to the disk." When you power off, your work disappears.
- That's why it's also used to **recover a system whose hard disk is broken**.
- Most Live images also provide an "Install now" button.

### Reading Image File Names

If you visit a distribution's site, there are several images even for the same version. The file name contains the **version, architecture, and type**.

| Example file name | Type | Character |
|-------------|------|------|
| `Rocky-9.3-x86_64-dvd.iso` | DVD (full) image | Holds most packages, several GB. Installs **even without a network** |
| `Rocky-9.3-x86_64-minimal.iso` | Minimal image | Contains only the packages needed for a minimal install |
| `Rocky-9.3-x86_64-boot.iso` | Boot (network install) image | Only the installer. Packages are fetched **from an internet repository** |
| `debian-12.5.0-amd64-netinst.iso` | Network install image | The Debian version of the same kind as above |
| `ubuntu-22.04.3-desktop-amd64.iso` | Live and install image | Boot it to try out, then install if you like |

- The same 64-bit PC is written `x86_64` in the Red Hat family and `amd64` in the Debian family. It's **the same architecture with only the name differing**.
- A network install image is small and easy to download, but if the internet drops during installation, it can't proceed.

### Verifying the Downloaded Image and Writing It to USB

```bash
sha256sum Rocky-9.3-x86_64-minimal.iso     # Compute the hash — compare it with the CHECKSUM value on the site
lsblk                                      # Check what device name the USB got (e.g., sdb)
sudo dd if=Rocky-9.3-x86_64-minimal.iso of=/dev/sdb bs=4M status=progress
sync                                       # Write out whatever remains in the buffers
```

- The output of `sha256sum` is a single line: `64-digit hex  file name`. If even one character differs, **the download was corrupted or tampered with**, so download it again.
- In `dd`, `if` is the input file and `of` is the output target (output file).
- On Windows, programs like Rufus and balenaEtcher do the same job.

> ⚠️ **Trap**: In `of=`, write **the whole disk `/dev/sdb`, not a partition** like `/dev/sdb1`. And `dd` overwrites without asking — if you mistakenly write the device name as `sda`, the disk you're using now gets erased. Always check with `lsblk` first.

### What PXE Needs to Work

PXE installation plugs no media into the computer, but instead needs **preparation on the network side**.

| What's needed | Role |
|----------|------|
| A **LAN card** that supports PXE | Tries to boot over the network at the firmware stage |
| A **DHCP server** | Gives out an IP address and tells where the boot file is |
| A **TFTP server** | Actually sends the files used for booting |

## The Three Installation Types

```text
   Minimal                Server                 Desktop
   ─────────────          ────────────           ────────────────
   Kernel + essential     Minimal + server       Server + X Window + apps
   tools only             daemons
   No GUI                 No GUI (recommended)   Has a GUI
   Lightest               For web/DB servers     For personal PCs
   Pick and install       Managed via remote     Used in front of
   what you want          access                 the screen
```

- There are two **reasons not to put a GUI on a server**.
  - It uses resources — there's no reason to spend memory and CPU on drawing a screen.
  - **The attack surface widens** — the more programs installed, the more vulnerabilities there are.
- This principle is called **minimal installation**.

On the actual installer screen, these three types appear as a **menu for choosing a package bundle (environment)**. The 'Software Selection' item of the Red Hat-family installer is an example.

| Choice | What's included | Screen after boot |
|--------|-----------|------------|
| Minimal Install | Basic functions only | Text login |
| Server | Tools needed to run a server | Text login |
| Server with GUI | Server + graphical environment | Graphical login |
| Workstation | A desktop and applications for personal PCs | Graphical login |

- Depending on what you picked, **whether the first screen after boot is text or graphical** differs (runlevels 3 and 5, which we cover on Day 4, are exactly this).
- Installing minimal and later adding only what you need with the package manager is easier and safer than installing a lot and stripping it down.

## Where to Install

| Method | Pros | Cons |
|------|------|------|
| **Virtual machine** | Easy to roll back with snapshots, keeps the existing OS | Slight performance loss |
| **Dual boot** | No performance loss | Adjusting partitions is risky, must reboot to switch |
| **Standalone install** | The cleanest | Must erase the existing OS |
| **WSL** | Use Linux commands inside Windows | The kernel is not a full Linux |

> For study purposes, **we strongly recommend a virtual machine.** Even if you set up partitions wrong, you can just roll back with a snapshot, and you can repeat the installation process as many times as you like. VirtualBox, VMware, or KVM — any is fine.

To use a virtual machine, the CPU's virtualization feature must be on. On a computer that already runs Linux, check like this.

```bash
grep -E -c 'vmx|svm' /proc/cpuinfo     # If 0, it's unsupported or turned off in the firmware settings
lscpu | grep -i virtualization
```

```text
$ lscpu | grep -i virtualization
Virtualization:                  VT-x
```

- Among the flags in `/proc/cpuinfo`, **`vmx` is Intel VT-x** and **`svm` is AMD-V**.
- Even if the CPU supports it, it's often **turned off in the BIOS/UEFI settings**. If a virtual machine can't start a 64-bit image, look here first.

## The Order of the Installation Process

Most distributions follow this flow.

```text
1. Start up from the boot media
        ▼
2. Choose language · keyboard · time zone
        ▼
3. Set up disk partitions          ◄── The most important and hardest-to-undo step
        ▼
4. Set network · hostname
        ▼
5. Choose the packages (software) to install
        ▼
6. Create root password · regular user account
        ▼
7. Installation proceeds → reboot
```

- Step 3 is the core of this week, so we **spend all of tomorrow on it.**
- Do **everyday work as the regular user** created in step 6, and raise privileges only when administrative work is needed. Staying logged in as root all the time is a shortcut to accidents.

### Installer Names and Automated Installation

The **installer** that guides you through the sequence above on screen also has a name, and it differs by family.

| Family | Installer | Automated (unattended) install method |
|------|-------------|-------------------|
| Red Hat | **Anaconda** | **Kickstart** — a `ks.cfg` file with the answers written in advance |
| Debian | Debian-Installer | preseed |
| SUSE | **YaST** | AutoYaST |

- Automated installation means **writing in advance, in a single file,** the answers a person would pick in steps 2 to 6 and handing it to the installer. Combined with PXE, you can install dozens of machines without touching them.
- On the Red Hat family, when installation finishes, **what you chose in this installation** is left in Kickstart format at `/root/anaconda-ks.cfg`. You use it as a model when building another server with the same configuration.

### How the root Account Is Handled Differs by Distribution

| Distribution | At install time | Administrative work is done |
|--------|----------|-----------|
| Red Hat family | **You set a root password.** When creating the regular user, you can 'make them an administrator' | Become root with `su -`, or use `sudo` |
| Ubuntu | **It doesn't ask for a root password** (the root account is locked) | The first user created at install uses `sudo` |

- That's why on Ubuntu, typing `su -` doesn't get you in, because there's no root password. You use the `sudo command` form.
- Either way, the principle is the same — **use a regular user normally, and raise privileges only when needed.**

## First Checks After Installation

```bash
uname -r                 # Kernel version
cat /etc/*-release       # Distribution name and version
df -h                    # Whether partitions were set up as intended
free -h                  # Memory and swap
ip addr                  # Whether the network is up
```

```text
$ free -h
               total        used        free      shared  buff/cache   available
Mem:           3.8Gi       412Mi       2.9Gi       8.0Mi       520Mi       3.2Gi
Swap:          2.0Gi          0B       2.0Gi

$ hostnamectl
 Static hostname: web01
Operating System: Rocky Linux 9.3 (Blue Onyx)
          Kernel: Linux 5.14.0-362.8.1.el9_3.x86_64
    Architecture: x86-64
```

| What to check | If normal | If something is off |
|----------|----------|----------|
| The `Swap` line of `free -h` | The size you set at install time shows under `total` | If `0B`, swap wasn't created or isn't enabled |
| `df -h` | `/`, `/boot`, `/home`, etc. show at the planned sizes | If a directory you meant to separate isn't shown, it was merged into `/` |
| `ip addr` | The LAN card has an `inet` address | If there's no address, the network setup was skipped |
| `hostnamectl` | The hostname you chose is shown | If `localhost`, it wasn't set at install time |

- The hostname can be changed after installation with `hostnamectl set-hostname name`. The same goes for language, time zone, and packages. **Practically the only thing you can't change after installation is the partitions**, so that step is the most important.

## Commonly Mistaken Points

1. **"A Live image isn't for installing"** → It means you **can also** use it without installing. Most include an install function as well.
2. **"`amd64` is only for AMD CPUs"** → It's a name also used for Intel 64-bit CPUs. It's the same as `x86_64`.
3. **"On servers you install a GUI for easy management"** → The principle is the opposite. Install minimal and manage remotely.
4. **"PXE is a way of booting from USB"** → It's a way of booting over the **network**. It needs DHCP and TFTP servers.
5. **"Dual boot uses two OSes at the same time"** → You **pick one** at boot time to use. Using them at the same time is a virtual machine.

> Tomorrow we cover the hardest step of the installation process — how to divide up the partitions.

## 📖 Glossary

- **Architecture** : The CPU type and its instruction set. x86_64, ARM, etc. The image must match it.
- **ISO image** : The contents of an optical disc packed into a single file. The standard form of installation media.
- **Live image** : A distribution that runs straight from memory without being installed on disk. For trying out and recovery.
- **PXE** : A way of booting over the network and installing. Used when installing many machines at once.
- **Minimal installation** : Installing only what is absolutely necessary. Its goals are saving resources and strengthening security.
- **Dual boot** : Installing two operating systems on one computer and choosing between them at boot time.
- **Snapshot** : A feature that saves a virtual machine's state at a certain point in time and rolls back to it.
- **Hostname** : The name by which the computer is called on the network.

## 📝 Practice Questions

**Question 1.** Which of the following is the form of distribution that runs straight from memory without installing on disk, and is used for trying out or system recovery?

A) Live image  
B) Minimal install image  
C) Network install image  
D) Source code distribution  

**Answer: A**  
Explanation: A Live image runs in memory without writing to the hard disk, so it doesn't touch the existing system. It's useful for trying it out before installing, or for recovering a system that won't boot. When you power off, your work disappears.

---

**Question 2.** Which of the following is generally recommended when installing Linux for server use?

A) Install every possible package to maximize functionality  
B) Always include a desktop environment to make management easier  
C) Install only what's needed and exclude the GUI  
D) Always operate it in the Live image state  

**Answer: C**  
Explanation: Minimal installation is the rule for servers. A GUI not only consumes memory and CPU, but the more programs installed, the more vulnerabilities there are, that is, the wider the attack surface. Servers are usually managed by remote access such as SSH, so screen output isn't needed.

---

**Question 3.** Which of the following is the notation indicating a Linux distribution image for 64-bit PCs?

A) i386  
B) i686  
C) armhf  
D) x86_64  

**Answer: D**  
Explanation: `x86_64` (also written `amd64` depending on the distribution) is the 64-bit PC architecture. `i386` and `i686` are 32-bit x86 family, and `armhf` is an ARM family notation. If the architecture doesn't match, installation won't start.

---

**Question 4.** Which of the following is the step of the Linux installation process that is the hardest to undo, so that a prior backup is especially important?

A) Choosing the language and keyboard layout  
B) Setting up disk partitions  
C) Specifying the hostname  
D) Choosing packages to install  

**Answer: B**  
Explanation: Partition setup changes the structure of the disk and can erase existing data, so it's hard to undo. Language, hostname, and packages can be changed freely even after installation. Before partitioning, you must back up important data.

---

**Question 5.** Which of the following is the method used when installing Linux over the network onto many computers?

A) Live USB boot  
B) Dual boot  
C) PXE boot  
D) Snapshot restore  

**Answer: C**  
Explanation: PXE (Preboot eXecution Environment) is a method of booting through the network card and downloading an installation image. Because you don't need to plug installation media into each computer, it's used when installing many systems at once. Dual boot is installing two operating systems on one machine, and a snapshot is a feature for rolling back a virtual machine's state.
