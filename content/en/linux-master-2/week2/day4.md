# Day 4 - The Boot Manager: From Power-On to Login

## 📌 Key Takeaways

- The boot sequence is **firmware (BIOS/UEFI) → bootloader → kernel → initramfs → init (systemd) → login**.
- **BIOS pairs with the MBR**, and **UEFI pairs with GPT and the ESP**.
- Linux's standard bootloader is **GRUB2**, and before it **LILO** was used.
- The file a person edits in GRUB2 is **`/etc/default/grub`**, and you **don't edit `grub.cfg` directly.**
- The old **runlevels** were replaced by **targets** in systemd. `3` = text, `5` = GUI.

## The Six Stages of Booting

```text
 1. Power applied
        ▼
 2. Firmware (BIOS or UEFI)     POST — hardware self-check
        ▼                       Chooses the device to boot from
 3. Bootloader (GRUB2)          Finds the kernel and loads it into memory
        ▼
 4. Kernel load                 Initializes the hardware
        ▼
 5. initramfs                   A temporary toolset for mounting the root file system
        ▼
 6. init / systemd (PID 1)      Starts services → login screen
```

- **PID 1** is the **first process** the kernel launches. It used to be `init`, and now it's mostly `systemd`.
- **Why initramfs is needed**: the driver for the disk holding the root file system may not exist yet. A temporary file system holding that driver is loaded into memory first.

The files read during stages 3 to 5 are all gathered in **`/boot`**. That is why `/boot` is often split off as its own partition.

```text
$ ls /boot
config-5.14.0-362.8.1.el9_3.x86_64
efi
grub2
initramfs-5.14.0-362.8.1.el9_3.x86_64.img
System.map-5.14.0-362.8.1.el9_3.x86_64
vmlinuz-5.14.0-362.8.1.el9_3.x86_64
```

| File | What it is |
|------|------|
| `vmlinuz-version` | **The kernel itself** (a compressed executable image). This is the file the bootloader loads into memory |
| `initramfs-version.img` | The temporary file system of stage 5. On the Debian family it is named `initrd.img-version` |
| `config-version` | The configuration used when building this kernel |
| `grub2/` | The bootloader's files and configuration |

- When you update the kernel, these files **gain one more set per version**. Old kernel entries remain in the GRUB menu, so when the new kernel won't boot you can pick the previous one and get in.
- Messages the kernel printed during boot scroll past, but you can view them again with the `dmesg` command. In a systemd environment, `journalctl -b` shows the entire record of this boot.

## BIOS and UEFI

| Category | BIOS | UEFI |
|------|------|------|
| Appeared | Old | The modern replacement |
| Partition scheme | **MBR** | **GPT** |
| Bootloader location | The first sector of the disk (MBR) | The **ESP** (EFI System Partition) |
| Disk limit | 2TB | Practically none |
| Screen | Text | Graphics and mouse possible |
| Security feature | None | **Secure Boot** |

- **POST (Power-On Self-Test)** is the hardware self-check the firmware performs. It checks whether memory, keyboard, and disk are normal.
- **Secure Boot** is a feature that blocks execution of unsigned bootloaders. It sometimes gets in the way when installing Linux.

## Bootloaders

| Name | Description |
|------|------|
| **LILO** | LInux LOader. An old bootloader. After changing its configuration, you must **reinstall it** for it to take effect |
| **GRUB** (legacy) | Replaced LILO. Editable at boot time |
| **GRUB2** | **The current standard.** Its configuration structure differs from GRUB |

> The decisive difference between LILO and GRUB: with LILO you must edit `/etc/lilo.conf` and then **write it back in with the `lilo` command**, but GRUB reads the configuration file as it runs, so that step isn't needed.

### GRUB2 Configuration Files

| File | Role | Edit directly? |
|------|------|------------|
| `/etc/default/grub` | Default timeout, default menu entry, etc. | **Edit this one** |
| `/etc/grub.d/` | Scripts that generate menu entries | Only when needed |
| `/boot/grub2/grub.cfg` | The final configuration actually read | **Don't edit directly** |

```bash
# After editing /etc/default/grub, always run this to regenerate grub.cfg
grub2-mkconfig -o /boot/grub2/grub.cfg     # Red Hat family
update-grub                                 # Debian family
```

- `grub.cfg` is an **auto-generated file**. Even if you edit it directly, it's overwritten at the next update.
- Commonly used settings: `GRUB_TIMEOUT` (menu wait time), `GRUB_DEFAULT` (default selected entry).

```text
$ cat /etc/default/grub
GRUB_TIMEOUT=5
GRUB_DEFAULT=saved
GRUB_DISABLE_SUBMENU=true
GRUB_TERMINAL_OUTPUT="console"
GRUB_CMDLINE_LINUX="crashkernel=auto rhgb quiet"
GRUB_DISABLE_RECOVERY="true"
```

| Entry | Meaning |
|------|-----|
| `GRUB_TIMEOUT=5` | Shows the menu for 5 seconds, then boots the default entry. With 0, it doesn't wait |
| `GRUB_DEFAULT=saved` | Uses the entry chosen last time (saved) as the default. If you write `0`, it's the **first** entry |
| `GRUB_CMDLINE_LINUX` | Options passed to the kernel. `rhgb` is the graphical boot screen, and `quiet` hides boot messages |

- If you want to see where booting gets stuck, remove `rhgb quiet` and regenerate `grub.cfg`. Then the messages scroll across the screen as they are.
- The location of `grub.cfg` differs by distribution and firmware. On the Debian family it's `/boot/grub/grub.cfg`, and on the Red Hat family booting via UEFI, depending on the version, it may be placed under `/boot/efi/EFI/`. **Even if the path differs, the principle "don't edit it directly" is the same.**

### Changing Things Just Once from the Boot Menu

There are keys you press while the GRUB menu is displayed.

| Key | Action |
|----|------|
| `e` | **Edit** the selected entry (edit) |
| `c` | Enter the GRUB **command line** (command) |
| `Ctrl`+`x` | (GRUB2) Boot with the edited content |

- What you change here applies **to this boot only** and isn't saved. It's used when you've forgotten the root password, to temporarily change kernel options and enter recovery mode.

### Configuration Files of Old GRUB and LILO

On older systems and in past-exam passages, pre-GRUB2 configuration appears.

```text
# /boot/grub/grub.conf  (GRUB legacy)
default=0
timeout=5
title CentOS (2.6.32-754.el6.x86_64)
        root (hd0,0)
        kernel /vmlinuz-2.6.32-754.el6.x86_64 ro root=/dev/sda3 rhgb quiet
        initrd /initramfs-2.6.32-754.el6.x86_64.img
```

- One `title` block is one menu entry. `default=0` means the **first `title`** is the default — numbering **starts from 0**.
- `(hd0,0)` is **the first partition of the first disk**. Old GRUB counts both disks and partitions from 0. As a Linux device name, it's `/dev/sda1`.
- In GRUB2 the notation changed so that **disks count from 0 and partitions from 1**. The same partition is `(hd0,1)`.

| Bootloader | Configuration file | What to do after editing |
|---------|----------|-------------|
| LILO | `/etc/lilo.conf` | Run the `lilo` command |
| GRUB legacy | `/boot/grub/grub.conf` | Nothing (edit the file directly) |
| GRUB2 | `/etc/default/grub` | `grub2-mkconfig` or `update-grub` |

## Runlevels and systemd Targets

The old System V **runlevels** expressed the system's operating mode as a number.

| Runlevel | Meaning | systemd target |
|-------|-----|----------------|
| 0 | System shutdown | `poweroff.target` |
| 1 | Single-user mode (recovery) | `rescue.target` |
| 3 | **Text multi-user** | `multi-user.target` |
| 5 | **GUI multi-user** | `graphical.target` |
| 6 | Reboot | `reboot.target` |

- Memorize **0 = shutdown, 6 = reboot** first and the rest falls into place. If you set either of these as the default, booting never finishes.
- **The difference between 3 and 5 is the presence of the X Window (GUI).**
- 2 and 4 are used differently by each distribution or left empty. The traditional Red Hat-family definition is **2 = multi-user without NFS (network file sharing), 4 = unused**.
- systemd also has `emergency.target`. It's a more minimal state than `rescue.target`, launching a shell with only the root file system attached read-only.

### Where It Was Written in the init Days

System V init decided the default runlevel with a single line in **`/etc/inittab`**.

```text
id:3:initdefault:
│  │      │
│  │      └── Action — initdefault = "make it the default runlevel"
│  └───────── Runlevel
└──────────── Label of this line
```

- If you change it to `id:5:initdefault:`, it's graphical mode from the next boot. If you **write 0 or 6** here, it shuts down right after power-on or restarts endlessly.
- The scripts to run for each runlevel are in a **directory containing the runlevel number**, such as `/etc/rc.d/rc3.d/`. Names that **start with `S` are Start** scripts and those that **start with `K` are Kill** scripts, and they run **one at a time in sequence** by the number that follows.
- systemd replaced this approach. It launches services that don't depend on each other **simultaneously (in parallel)**, so booting is fast, and instead of `/etc/inittab`, a **link named `default.target`** points to the default mode.

```text
$ sudo systemctl set-default multi-user.target
Removed /etc/systemd/system/default.target.
Created symlink /etc/systemd/system/default.target → /usr/lib/systemd/system/multi-user.target.
```

- As the output tells you, all `set-default` does is **swap one symbolic link**.

### Checking and Changing the Current Mode

| What you want to do | init way | systemd way |
|----------|----------|-------------|
| Check the current runlevel | `runlevel`, `who -r` | `systemctl get-default` (the default) |
| Switch **immediately** | `init 3`, `telinit 3` | `systemctl isolate multi-user.target` |
| Change **from the next boot** | Edit `/etc/inittab` | `systemctl set-default …` |

```text
$ runlevel
N 5
```

- The first character is the **previous runlevel** and the second is the **current runlevel**. `N` means "there is no previous one," that is, it hasn't been changed even once since boot.
- **`isolate` is for now only, `set-default` is from the next boot** — options swapping these two are easily used as wrong answers.

### Commands to Shut Down and Restart

Runlevels 0 and 6 are invoked with everyday commands.

| Command | Action |
|------|------|
| `shutdown -h now` | Shut down now (halt) |
| `shutdown -r now` | Restart now (reboot) |
| `shutdown -h +10` | Shut down in 10 minutes. Logged-in users are notified |
| `shutdown -c` | Cancel a scheduled shutdown (cancel) |
| `poweroff`, `halt` | Shut down |
| `reboot` | Restart |
| `init 0` / `init 6` | Shut down / restart by changing the runlevel |

## Commonly Mistaken Points

1. **"The kernel calls up the bootloader"** → It's the opposite. The bootloader loads the kernel into memory.
2. **"POST is performed by the kernel"** → The firmware (BIOS/UEFI) does it. The kernel hasn't even been loaded yet.
3. **"You edit `grub.cfg` for GRUB2 settings"** → You edit `/etc/default/grub` and regenerate `grub.cfg` with a command.
4. **"For LILO, just editing the configuration file is enough"** → You must rerun the `lilo` command for it to take effect.
5. **"Runlevel 3 is GUI, 5 is text"** → 3 is text, 5 is GUI.
6. **"You change the default boot mode with `systemctl isolate`"** → It changes only for now. The default is `set-default`.
7. **"PID 1 is the kernel"** → It's the **first process** (init or systemd) launched by the kernel.

```bash
systemctl get-default              # The current default target
systemctl set-default multi-user.target   # Change to boot into text mode
systemctl isolate graphical.target        # Switch to GUI mode immediately
```

> Tomorrow we tie together this week's installation, partitions, file systems, and boot on a single page.

## 📖 Glossary

- **POST** : The hardware self-check the firmware performs when power is turned on.
- **BIOS** : The traditional firmware. Pairs with MBR partitions.
- **UEFI** : The modern firmware that replaced BIOS. Supports GPT, the ESP, and Secure Boot.
- **Boot loader** : A program that finds the kernel and loads it into memory. GRUB2 is the standard.
- **LILO** : The bootloader used before GRUB. Needs reinstalling after configuration changes.
- **initramfs** : A temporary file system loaded into memory first in order to mount the root file system.
- **PID 1** : The first process the kernel launches. init or systemd fits here.
- **Runlevel** : A number expressing the system's operating mode. 0 = shutdown, 3 = text, 5 = GUI, 6 = reboot.
- **target** : The concept in systemd that replaces runlevels.

## 📝 Practice Questions

**Question 1.** Which of the following is the correct Linux boot order?

A) Bootloader → BIOS → kernel → init  
B) BIOS/UEFI → kernel → bootloader → init  
C) BIOS/UEFI → bootloader → kernel → init  
D) Kernel → BIOS/UEFI → bootloader → init  

**Answer: C**  
Explanation: When power is turned on, the firmware (BIOS or UEFI) checks the hardware with POST and finds the boot device. Then the bootloader (GRUB2) runs and loads the kernel into memory, and the kernel initializes the hardware by way of initramfs and then runs the first process, init (or systemd).

---

**Question 2.** Which of the following is the target that boots to a graphical login screen in a systemd environment?

A) graphical.target  
B) multi-user.target  
C) rescue.target  
D) poweroff.target  

**Answer: A**  
Explanation: `graphical.target` corresponds to the old runlevel 5 and boots into a graphical environment including the X Window. `multi-user.target` is the text mode corresponding to runlevel 3, `rescue.target` is the recovery mode of runlevel 1, and `poweroff.target` is the system shutdown of runlevel 0.

---

**Question 3.** Which of the following is the configuration file an administrator should edit directly when using GRUB2?

A) /boot/grub2/grub.cfg  
B) /etc/lilo.conf  
C) /etc/inittab  
D) /etc/default/grub  

**Answer: D**  
Explanation: After setting the timeout, the default menu entry, and so on in `/etc/default/grub`, you regenerate `grub.cfg` with `grub2-mkconfig` (or `update-grub`). `grub.cfg` is an auto-generated file, so even if you edit it directly it's overwritten at the next update. `lilo.conf` is the configuration file of the old LILO bootloader.

---

**Question 4.** Which of the following is the partition scheme used together with UEFI firmware?

A) MBR  
B) GPT  
C) Extended partition  
D) Logical partition  

**Answer: B**  
Explanation: UEFI pairs with the GPT partition scheme and keeps a separate EFI System Partition (ESP) to hold the bootloader. MBR is used with traditional BIOS and has the constraints of 2TB and 4 primary partitions. Extended and logical are ways of dividing partitions within MBR.

---

**Question 5.** Which of the following pairings of a runlevel and its meaning is NOT correct?

A) 0 — System reboot  
B) 1 — Single-user mode  
C) 3 — Text multi-user mode  
D) 5 — Graphical multi-user mode  

**Answer: A**  
Explanation: Runlevel 0 is system shutdown, and reboot is 6. Special care is needed with these two because if you set either as the default runlevel, booting never finishes. 1 is the single-user mode for recovery, 3 is the text mode without a GUI, and 5 is the graphical mode where the X Window runs.
