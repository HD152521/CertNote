# Day 5 - Week 2 Review: From Installation to Boot in One Line

## 📌 Key Takeaways

- The flow is **disk → partition → file system → mount → boot**. This order is this week's backbone.
- Memorize the pairs — **BIOS·MBR** / **UEFI·GPT·ESP**. A good share of questions ask about these pairings.
- Memorize the numbers — MBR **2TB · 4 primary partitions**, FAT32 **4GB per file**, runlevels **0 shutdown · 6 reboot**.
- **Journaling starts with ext3**, and **the inode has no file name** — these two are facts that make good standalone questions.
- Distinguish the **stage** of each command: `fdisk` (divide) → `mkfs` (lay over) → `mount` (attach) → `fstab` (make permanent).

## Flow Diagram

```text
  Physical disk  /dev/sda
       │
       │  ① Divide      fdisk · gdisk · parted
       ▼
  Partitions    /dev/sda1  /dev/sda2  swap
       │
       │  ② Lay over    mkfs.ext4 · mkfs.xfs
       ▼
  File systems  ext4 · XFS · FAT32
       │
       │  ③ Attach      mount → temporary
       ▼                /etc/fstab → permanent
  Directory tree  /  /home  /var
       │
       │  ④ Boot        BIOS/UEFI → GRUB2 → kernel → initramfs → systemd
       ▼
  Login screen
```

## What to Memorize as Pairs

| Left | Right | Note |
|------|--------|------|
| BIOS | MBR | The bootloader sits in the disk's first sector |
| UEFI | GPT + ESP | Supports Secure Boot |
| ext3 | Journaling introduced | ext2 doesn't have it |
| XFS | Default from RHEL 7+ | Strong with large capacity |
| Btrfs | SUSE default | Snapshots and compression |
| LILO | Reinstall needed after configuring | The old bootloader |
| GRUB2 | Edit `/etc/default/grub` | `grub.cfg` is auto-generated |
| Runlevel 3 | `multi-user.target` | Text |
| Runlevel 5 | `graphical.target` | GUI |

## Numbers Summary

| Number | What |
|------|------|
| **2TB** | The maximum disk size MBR can handle |
| **4** | The maximum number of primary partitions in MBR |
| **1** | The number of extended partitions per disk |
| **5** | The number where logical partition numbering starts |
| **4GB** | FAT32's single-file size limit |
| **1 to 2 times** | The classic swap size rule (relative to memory) |
| **0 / 6** | Runlevel shutdown / reboot |
| **1** | The PID of init (systemd) |

- The 2TB and 4 come from **MBR being a single 512-byte sector** — bootloader 446 + partition table 64 (16 bytes × 4 slots) + signature 2. With four slots, that's 4 primary partitions, and with positions written in 32 bits, that's 2TB.

## Configuration Files and Paths Summary

"Which file do you write it in" is the part most often mixed up this week. It sorts out if you split by **when it is read**.

| File | Contents | Who reads it and when |
|------|------|--------------|
| `/etc/fstab` | The list to mount automatically (6 fields) | At boot, and at `mount -a` |
| `/etc/mtab` · `/proc/mounts` | The list mounted **right now** | The system records it. Not a file for people to edit |
| `/etc/default/grub` | GRUB2 default settings | `grub2-mkconfig` reads it and creates `grub.cfg` |
| `grub.cfg` | The final configuration GRUB2 actually reads | GRUB2 at boot. **Don't edit directly** |
| `/boot/grub/grub.conf` | Old GRUB configuration | Old GRUB at boot. Edit directly |
| `/etc/lilo.conf` | LILO configuration | Takes effect only after re-running the `lilo` command |
| `/etc/inittab` | Default runlevel (`id:3:initdefault:`) | init-style boot |
| `/boot/vmlinuz-version` | The kernel itself | The bootloader loads it into memory |
| `/boot/initramfs-version.img` | The temporary root file system | Loaded together with the kernel |

Memorize the six fields of one `/etc/fstab` line in order.

```text
/dev/sdb1    /data        ext4    defaults   0      2
① device   ② mount point  ③ type  ④ options  ⑤ dump  ⑥ fsck order
```

## Command Sets Used at Each Stage

| Stage | Regular partition | swap |
|------|-----------|------|
| Divide | `fdisk /dev/sdb` → `n` → `w` | Same. Set the type to 82 with `t` |
| Initialize | `mkfs.ext4 /dev/sdb1` | `mkswap /dev/sdb2` |
| Start using | `mount /dev/sdb1 /data` | `swapon /dev/sdb2` |
| Stop using | `umount /data` | `swapoff /dev/sdb2` |
| Check | `df -h`, `lsblk` | `free -h`, `swapon -s` |

- `fdisk` internal commands: **`p` view · `n` new · `d` delete · `t` type · `w` save and exit · `q` exit without saving**.
- If `Disklabel type` in `fdisk -l` is **`dos`, it's MBR; if `gpt`, it's GPT**. `Id` is **83 Linux, 82 swap, 5 extended**.
- A hard link is `ln`, a symbolic link is `ln -s`. The one with the same inode is the hard link.

| Now only | Also on the next boot |
|--------|-------------|
| `mount` | `/etc/fstab` |
| `swapon` | The swap line in `/etc/fstab` |
| `systemctl isolate …target` | `systemctl set-default …target` |
| `init 3` | `/etc/inittab` |
| Editing with `e` in the GRUB menu | `/etc/default/grub` + `grub2-mkconfig` |

## Finding the Cause from Symptoms

In real work and in exam passages alike, concepts show up in the form of symptoms.

| Symptom | Cause | Check / fix |
|------|------|----------|
| A 5GB file won't copy to the USB drive | FAT32's 4GB single-file limit | Recreate it as exFAT, etc. |
| A 3TB disk is recognized only up to 2TB | It was partitioned with MBR | Partition it with GPT (`gdisk`, `parted`) |
| Space remains but files can't be created, with a "no space" error | The inodes ran out | `df -i` |
| You mounted a new disk, but after reboot it's empty | It wasn't written in `/etc/fstab` | Add one line and test with `mount -a` |
| `umount` refuses with `target is busy` | A process is using that directory | `cd` out of it |
| You edited `/etc/default/grub` but nothing changed | `grub.cfg` wasn't regenerated | `grub2-mkconfig -o …` |
| A server boots to a graphical screen and eats resources | The default target is `graphical.target` | `systemctl set-default multi-user.target` |
| After adding a disk, the mount attaches in the wrong place | The `sdb` and `sdc` order shifted | Use a UUID (`blkid`) in `fstab` instead of the device name |

## Contrasting Confusing Pairs

| Category | A | B | Distinguishing criterion |
|------|---|---|-----------|
| Primary vs extended partition | Holds data | A **shell**, holds logical ones | Can it store directly? |
| `/dev/hda` vs `/dev/sda` | Old IDE | SATA, SCSI, USB | Interface type |
| ext2 vs ext3 | No journaling | **Has journaling** | Failure recovery speed |
| FAT32 vs exFAT | 4GB limit | No limit | Single file size |
| `mount` vs `/etc/fstab` | Now only | **Even after reboot** | Permanence |
| `mkfs` vs `fsck` | Creates anew | Checks and repairs | Creating or fixing |
| BIOS vs UEFI | MBR · 2TB | GPT · Secure Boot | Firmware generation |
| init vs systemd | Runlevel numbers | Target names | Boot management approach |
| Superblock vs inode | Information about the **whole** file system | Information about **one** file | Scope of information |
| Hard link vs symbolic link | Same inode | Separate inode | Does it survive deleting the original? |
| `mkfs` vs `mkswap` | Creates a file system | Creates a swap area | Does it hold files? |
| `fstab` vs `mtab` | What to do at boot | The current state | Does a person write it? |
| `isolate` vs `set-default` | Immediately | From the next boot | Permanence |
| DVD image vs network install image | Contains the packages | Downloads during install | Is the internet needed? |
| Live image vs minimal install | Runs without installing | Installs only what's needed | Does it write to disk? |

## Commonly Mistaken Points

1. **"You store files in an extended partition"** → No. It's only a shell, and the actual storage is done by logical partitions.
2. **"Logical partitions start from 3"** → They start from **5**. It doesn't matter how many primary partitions there are.
3. **"The inode has the file name"** → It doesn't. The directory manages the name.
4. **"ext2 also supports journaling"** → No. It starts **from ext3**.
5. **"You edit `grub.cfg` directly"** → It's an auto-generated file, so it gets overwritten. Edit `/etc/default/grub`.
6. **"Runlevel 0 is reboot"** → 0 is **shutdown**, and 6 is reboot.
7. **"Just `mount` and it stays forever"** → It disappears on reboot. You must write it in `/etc/fstab`.

## Command Summary

| Command | What it does |
|------|--------|
| `fdisk -l` | List of disks and partitions |
| `lsblk` | Disk structure as a tree |
| `mkfs.ext4 /dev/sdb1` | Create a file system |
| `mount /dev/sdb1 /data` | Mount |
| `umount /data` | Unmount |
| `df -h` / `df -i` | Capacity / inode usage |
| `fsck /dev/sdb1` | Check a file system |
| `systemctl get-default` | The current default target |
| `grub2-mkconfig -o …` | Regenerate the GRUB configuration |

> Next week we finally type commands ourselves — from the first steps in the shell through file, directory, and account commands.

## 📖 Glossary

- **Partition table** : A table recording how the disk is divided. There are two schemes, MBR and GPT.
- **ESP** : The EFI System Partition. The area that holds the bootloader in UEFI boot.
- **initramfs** : A temporary file system loaded first in order to mount the root file system.
- **Journaling** : A technique that records changes in advance to speed up failure recovery.
- **Hard link** : Several names pointing to the same inode.
- **target** : The unit of system state that systemd uses in place of runlevels.

## 📝 Practice Questions

**Question 1.** Which of the following is the correct order up to the point of using a new disk in Linux?

A) mkfs → fdisk → mount  
B) mount → mkfs → fdisk  
C) fdisk → mount → mkfs  
D) fdisk → mkfs → mount  

**Answer: D**  
Explanation: First divide the disk into partitions with a tool like `fdisk`, create a file system on that partition with `mkfs`, and then connect it to a directory with `mount` before you can use it. To keep it after reboot, register it in `/etc/fstab`.

---

**Question 2.** Which of the following is the number at which device numbers given to logical partitions start?

A) 1  
B) 3  
C) 5  
D) 8  

**Answer: C**  
Explanation: In the MBR scheme, primary partitions use numbers 1 to 4, and logical partitions inside an extended partition are always numbered from 5, regardless of how many primary partitions were created. For example, even with only two primary partitions, the first logical partition becomes `/dev/sda5`.

---

**Question 3.** Which of the following is the command that checks and repairs file system errors?

A) fsck  
B) mkfs  
C) lsblk  
D) fdisk  

**Answer: A**  
Explanation: `fsck` (file system check) checks the integrity of a file system and repairs damaged parts. The rule is to run it with the file system unmounted to prevent damage during the check. `mkfs` creates anew, `fdisk` divides partitions, and `lsblk` shows the structure.

---

**Question 4.** Which of the following correctly pairs BIOS/UEFI with a partition scheme?

A) BIOS — GPT, UEFI — MBR  
B) BIOS — MBR, UEFI — GPT  
C) Both use only MBR  
D) Both use only GPT  

**Answer: B**  
Explanation: The traditional BIOS is used with the MBR partition scheme and places the bootloader in the disk's first sector. UEFI pairs with the GPT scheme and stores the bootloader in the EFI System Partition (ESP), and it provides security features such as Secure Boot.

---

**Question 5.** Which of the following is the task you must perform after changing settings in GRUB2?

A) Format the system  
B) Edit `/boot/grub2/grub.cfg` directly  
C) Reinstall LILO  
D) Regenerate the configuration with `grub2-mkconfig` or `update-grub`  

**Answer: D**  
Explanation: After modifying `/etc/default/grub`, you must run `grub2-mkconfig -o /boot/grub2/grub.cfg` (Red Hat family) or `update-grub` (Debian family) to recreate the `grub.cfg` that is actually read before it takes effect. `grub.cfg` is an auto-generated file, so if edited directly it's overwritten at the next update.

---

**Question 6.** Which of the following is the systemd target that specifies booting the system into a text-mode multi-user environment?

A) rescue.target  
B) graphical.target  
C) multi-user.target  
D) reboot.target  

**Answer: C**  
Explanation: `multi-user.target` corresponds to the old runlevel 3 and boots into a text-based multi-user environment without the X Window. It is a setting commonly used on servers. `graphical.target` is the GUI environment of runlevel 5, `rescue.target` is the recovery mode of runlevel 1, and `reboot.target` is the restart of runlevel 6.
