# Day 3 - Device Files and /dev

## 📌 Key Takeaways

- Linux follows **"everything is a file"** — keyboards, disks, and printers are all handled as **files under `/dev`**.
- Devices are divided into **block devices (`b`) and character devices (`c`)**. **Disks are block; keyboards and printers are character.**
- Device files are told apart by a **major number and a minor number**. These two numbers appear in place of a size.
- **`udev`** detects devices and **automatically creates and deletes** the files under `/dev`.
- Hardware is queried with **`lsblk` (block) · `lsusb` (USB) · `lspci` (PCI) · `dmesg` (kernel messages)**.

## Devices Are Files Too

```bash
ls -l /dev/sda /dev/tty0
# brw-rw---- 1 root disk 8, 0 Sep  3 09:00 /dev/sda
# crw--w---- 1 root tty  4, 0 Sep  3 09:00 /dev/tty0
#  │                      │  │
#  │                      │  └── minor number
#  │                      └───── major number
#  └──────────────────────────── b = block, c = character
```

- Where a regular file shows its size, **two numbers** appear. These are the major and minor numbers.

| Number | Meaning |
|------|-----|
| **Major number** | Which **driver** is responsible (the kind of device) |
| **Minor number** | **Which device** (the nth one) that driver handles |

### Seeing the Numbers Side by Side

```text
$ ls -l /dev/sda /dev/sda1 /dev/sda2 /dev/sdb /dev/sdb1 /dev/null /dev/zero
brw-rw----. 1 root disk 8,  0 Sep  3 09:00 /dev/sda
brw-rw----. 1 root disk 8,  1 Sep  3 09:00 /dev/sda1
brw-rw----. 1 root disk 8,  2 Sep  3 09:00 /dev/sda2
brw-rw----. 1 root disk 8, 16 Sep  3 09:00 /dev/sdb
brw-rw----. 1 root disk 8, 17 Sep  3 09:00 /dev/sdb1
crw-rw-rw-. 1 root root 1,  3 Sep  3 09:00 /dev/null
crw-rw-rw-. 1 root root 1,  5 Sep  3 09:00 /dev/zero
```

- The five disk lines **all have major number 8**. That means the same driver (`sd`) handles them, and **the minor number** decides which partition of which disk it is.
- The `sd` driver sets aside **16 minor numbers per disk**. So `sda` starts at 0 and `sdb` at 16, and partitions add their number to that (`sdb1` = 16 + 1 = 17).
- `/dev/null` and `/dev/zero` have **the same major number (1) and differ only in the minor number.** They are virtual devices with no real hardware, but since they pass data one character at a time, they are **character devices (`c`)**.
- You can see which major number belongs to which driver in **`/proc/devices`**.

| Misconception | Reality |
|------|------|
| A device file holds data inside | It is **a signpost holding just two numbers**. When you read or write, the kernel hands it to the driver with that number |
| The name (`sda`) decides the device | What the kernel looks at is the **type (b/c) and the major/minor numbers**. The name is for humans |
| Permissions do not apply | **`rw-` permissions** apply just like regular files. Only root and the `disk` group can read and write `/dev/sda` |

- The command that creates a device file by hand is **`mknod`** — `mknod name b|c major minor`. These days `udev` does it for you, so it is rarely used directly.

## Block Devices and Character Devices

| Item | **Block device** | **Character device** |
|------|-------------|-------------|
| Marker | **`b`** | **`c`** |
| Unit handled | **Fixed-size blocks** | **One character at a time (stream)** |
| Buffer | Used | Rarely used |
| Random access | **Possible** | Sequential |
| Examples | **Hard disk, USB, CD-ROM** | **Keyboard, mouse, printer, terminal** |

> Remember it as **disk family = block, input/output family = character**. The deciding criterion is "can you read an arbitrary position directly?" A disk can be read anywhere directly, but a keyboard streams in the order keys are pressed.

## Major Device Files

| Device file | What it is |
|----------|------|
| **`/dev/sda`** | The first **SATA, SCSI, or USB disk** |
| `/dev/sda1` | The **first partition** of sda |
| `/dev/sdb` | The second disk |
| `/dev/hda` | A disk of the old **IDE** type |
| `/dev/nvme0n1` | An **NVMe** SSD |
| **`/dev/sr0`** (`/dev/cdrom`) | The **CD/DVD** drive |
| **`/dev/null`** | **The place things are thrown away**. Reading gives nothing |
| **`/dev/zero`** | Reading gives **endless zeros** |
| `/dev/random`, `/dev/urandom` | **Random number** generation |
| **`/dev/tty`** | The current **terminal** |
| `/dev/lp0` | The first **printer** port |
| `/dev/fd0` | Floppy disk |

### Disk Naming Rules

```text
   /dev/sd a 1
        │  │ │
        │  │ └── partition number (from 1)
        │  └──── which disk (a, b, c...)
        └─────── sd = SATA/SCSI/USB,  hd = IDE
```

| Example | Meaning |
|----|-----|
| `/dev/sda` | The **whole** first disk |
| `/dev/sda1` | **Partition 1** of the first disk |
| `/dev/sdb2` | **Partition 2** of the second disk |

- **Disks get letters, partitions get numbers.** This combination is asked as is.
- These days IDE disks are also often recognized as `sd`.
- **The letter is the order of detection, not the type.** If you plug a USB stick into a computer whose internal disk is `sda`, it becomes `sdb`, and one more becomes `sdc`. If the plug-in order changes, the names change too.

| Name | How to read it |
|------|--------|
| `/dev/sdc1` | Partition 1 of the **third** `sd` disk |
| `/dev/hdb2` | Partition 2 of the **second** IDE disk |
| `/dev/nvme0n1p2` | Device 1 of NVMe controller 0, its **partition 2** — since the name ends in a digit, a **`p`** is placed before the partition number |
| `/dev/vda1` | Partition 1 of a virtual machine's virtual disk (`virtio`) |
| `/dev/sr0` | The first optical drive. **Numbering starts from 0** and there are no partition numbers |

### Device Files for Terminals and Printers

| Device file | What it is |
|----------|------|
| `/dev/tty1` ~ `/dev/tty6` | **Virtual consoles** attached directly to the monitor and keyboard |
| `/dev/pts/0`, `/dev/pts/1` … | **Pseudo-terminals** — SSH sessions or terminal windows on the graphical screen |
| `/dev/ttyS0` | The first **serial port** |
| `/dev/lp0` | A printer on the first **parallel port** |
| `/dev/usb/lp0` | The first **USB printer** |

```text
$ tty
/dev/pts/0
$ echo hello > /dev/pts/0
hello
```

- The **`tty` command** tells you the device file of your current terminal. If you write characters to that file, they appear on the screen — the easiest way to confirm the saying "devices are files too".

### Where Virtual Devices Are Used

| Device | Use | Example |
|------|------|-----|
| **`/dev/null`** | **Discards** unwanted **output** | `command > /dev/null 2>&1` |
| **`/dev/zero`** | **Creates an empty file** filled with zeros | `dd if=/dev/zero of=test.img bs=1M count=100` (a 100MB file) |
| `/dev/urandom` | Gets random values | Generating temporary passwords and keys |

- **Writing to `/dev/null` makes data vanish, and reading from it ends immediately (EOF).** Reading `/dev/zero` gives zeros **endlessly**. You tell the two apart by "what comes out when you read".

## udev — Device Files, Automatically

In the past, **thousands of device files that would never be used** were pre-created under `/dev`.

```text
   Device connected (plug in USB)
        │
        ▼
   Kernel detects ──► udev ──► creates /dev/sdb file
        │                       assigns permissions/owner
        ▼                       applies naming rules
   Device removed ──► udev ──► deletes the file
```

- **`udev` creates and deletes files under `/dev` in real time as devices are connected and removed.**
- Rule files go in **`/etc/udev/rules.d/`**. You can configure things such as always giving a specific USB device the same name.
- Thanks to this, only devices that actually exist are present in `/dev`.
- `/dev` is not a directory stored on disk but a **file system built in memory**. It is populated anew at every boot to match the devices present at that time.
- `udev` came in with kernel **2.6**, replacing the older approach (`devfs`). Today it runs as a daemon called `systemd-udevd`.

| Rule file location | Nature |
|-------------|------|
| `/usr/lib/udev/rules.d/` (`/lib/udev/rules.d/` depending on the distribution) | The **default rules** shipped by the distribution — do not edit them directly |
| **`/etc/udev/rules.d/`** | **Rules added by the administrator** — if the file name is the same, this one takes precedence |

- Rule files take the form **`number-name.rules`**, like `70-persistent-net.rules`, and are read starting from the smallest number.

```text
   KERNEL=="sd?1", ATTRS{idVendor}=="0781", SYMLINK+="myusb"
   └────────── condition (==) ───────────┘  └── action (+=) ──┘
```

- **`==` is a condition meaning "if the device is like this"**, and **`=` and `+=` are instructions meaning "do this"**. The rule above adds a link called `/dev/myusb` to a device whose kernel-assigned name has the form `sd?1`, such as `sda1` or `sdb1`, and whose vendor number is 0781.
- There are also links that `udev` creates in advance. **`/dev/cdrom` is a symbolic link pointing to `/dev/sr0`**, and under `/dev/disk/by-uuid/` there are links named by UUID. They let you use **stable names instead of names like `sdb` and `sdc` that change with order**.

## Hardware Query Commands

| Command | What it shows |
|------|------------|
| **`lsblk`** | **Block devices** as a tree |
| **`lsusb`** | Connected **USB** devices |
| **`lspci`** | **PCI** devices (graphics, network card) |
| `lscpu` | CPU info |
| `lsmod` | Loaded **kernel modules** |
| **`dmesg`** | **Kernel messages** — the record of device detection |
| `blkid` | A device's UUID and file system type |

```bash
lsblk                  # disk and partition structure
lsusb                  # USB list
dmesg | tail -20       # what was the device I just plugged in recognized as
```

- **The commands starting with `ls` form a group** — `lsblk`, `lsusb`, `lspci`, `lscpu`, `lsmod`.
- **If you plug in a USB and do not see it, use `dmesg`** to check what the kernel recognized it as — that is the standard procedure.

### Output of the Three Commands When a USB Stick Is Plugged In

```text
$ dmesg | tail -4
[ 4521.103422] usb 1-2: new high-speed USB device number 5 using xhci_hcd
[ 4521.812345] sd 6:0:0:0: [sdb] 31250000 512-byte logical blocks: (16.0 GB/14.9 GiB)
[ 4521.813990]  sdb: sdb1
[ 4521.815102] sd 6:0:0:0: [sdb] Attached SCSI removable disk

$ lsusb
Bus 001 Device 005: ID 0781:5567 SanDisk Corp. Cruzer Blade
Bus 001 Device 001: ID 1d6b:0002 Linux Foundation 2.0 root hub

$ lsblk
NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINT
sda      8:0    0   50G  0 disk
├─sda1   8:1    0    1G  0 part /boot
├─sda2   8:2    0    4G  0 part [SWAP]
└─sda3   8:3    0   45G  0 part /
sdb      8:16   1 14.9G  0 disk
└─sdb1   8:17   1 14.9G  0 part
sr0     11:0    1 1024M  0 rom
```

| Output | How to read it |
|------|--------|
| `[sdb]` in `dmesg` | The kernel **gave this device the name `sdb`** |
| `31250000 512-byte logical blocks` | 31,250,000 blocks of 512 bytes = 16,000,000,000 bytes. That is **16.0 GB (decimal) and also 14.9 GiB (binary)** |
| `sdb: sdb1` | There is one partition |
| `ID 0781:5567` in `lsusb` | **Vendor number:product number**. The `idVendor` in a udev rule is the first part |
| `MAJ:MIN` in `lsblk` | Major number:minor number — the same values as `8, 17` in `ls -l /dev/sdb1` |
| `RM` in `lsblk` | **1 means a removable** device. `sdb` and `sr0` are 1 |
| `MOUNTPOINT` is empty | **Recognized but not yet mounted** |

- Adding up the partitions of `sda` gives 1G + 4G + 45G = 50G, which matches the disk size. **The line with `TYPE` `disk` is the whole, and the lines with `part` are the pieces inside it.**
- The "16GB" on the product box showing as 14.9G in `lsblk` is not a fault but a **difference in units**.
- Messages in `dmesg` accumulate in a **ring buffer** of fixed size, so old ones get pushed out. That is why you look at the **end with `tail` right after plugging in**.

| What you want to know | Command |
|------------|------|
| How disks and partitions are divided, and where they are mounted | **`lsblk`** |
| Whether a USB device is **connected at all** | **`lsusb`** |
| **Built-in expansion cards** such as graphics and network cards | **`lspci`** |
| **What name the kernel recognized** the device as, and whether there were errors | **`dmesg`** |
| A partition's **UUID and file system type** | `blkid` |
| Whether a device driver (module) is **loaded** | `lsmod` |

- You view kernel modules with `lsmod` and load them with **`modprobe module-name`**. `modprobe` also loads other modules that are required, while `insmod` loads only the one file you specify. To unload, use `rmmod`.

## Handling Removable Media

```bash
lsblk                        # check that it showed up as /dev/sdb1
sudo mount /dev/sdb1 /mnt    # attach
ls /mnt                      # check contents
sudo umount /mnt             # detach — always before pulling it out
```

- Modern desktop environments **automatically mount it under `/media/username/`**.
- **Always `umount` before pulling it out.** If write cache remains, data gets corrupted.
- **Give `mount` the partition (`/dev/sdb1`)**, not the whole disk (`/dev/sdb`). The file system lives inside the partition.
- The command name is **`umount`**, not `unmount`.

| Medium | Common device file | File system | Example |
|------|-------------|-----------|-----|
| USB stick | `/dev/sdb1` | `vfat` (FAT32) | `mount -t vfat /dev/sdb1 /mnt` |
| CD/DVD | `/dev/sr0` (`/dev/cdrom`) | **`iso9660`** | `mount -t iso9660 /dev/cdrom /mnt` |

| Symptom | Cause | Fix |
|------|------|------|
| `umount: /mnt: target is busy` | Someone is inside it — often **my shell's current directory** is `/mnt` | `cd` out of it, then try again |
| Not in `lsblk` at all | The kernel did not recognize it | Check with `lsusb`, `dmesg` |
| In `lsblk` but contents do not show | Not mounted | `mount` |

- A CD/DVD is ejected with the **`eject`** command. If it is mounted, it is detached first and then the tray opens.
- The mount point convention is: **`/mnt` is where the administrator manually attaches things temporarily**, and **`/media` is where removable media are automatically attached**.

> Tomorrow we learn how to actually work with peripherals such as printers, sound, and scanners.

## 📖 Glossary

- **Device file**: A special file created under `/dev` so that hardware can be handled like a file.
- **Block device**: A device with random access in fixed-size blocks. Marked `b`; disks fall under it.
- **Character device**: A device that exchanges data sequentially, one character at a time. Marked `c`; keyboards and printers fall under it.
- **Major number**: The number that identifies the driver responsible for a device.
- **Minor number**: The number that identifies an individual device handled by the same driver.
- **udev**: The manager that detects device connection and removal and automatically creates and deletes files under `/dev`.
- **`/dev/null`**: A device file that discards the data sent to it.
- **`dmesg`**: A command that prints the messages left by the kernel. Used to check device detection results.

## 📝 Practice Questions

**Question 1.** Which character does `ls -l` show for a device that exchanges data in blocks, like a hard disk?

A) b  
B) c  
C) d  
D) l  

**Answer: A**  
Explanation: A block device is marked with `b` at the very start, and hard disks, USB sticks, and CD-ROMs fall under it. A character device is marked `c` and is a device that exchanges data sequentially one character at a time, like a keyboard or printer. `d` is a directory and `l` is a symbolic link.

---

**Question 2.** Which of the following is a character device?

A) Hard disk  
B) USB stick  
C) Keyboard  
D) CD-ROM  

**Answer: C**  
Explanation: A keyboard is a character device whose data flows in the order keys are pressed. Hard disks, USB sticks, and CD-ROMs are block devices that can read an arbitrary position directly in fixed-size blocks.

---

**Question 3.** Which device file represents the second partition of the first SATA disk?

A) /dev/sdb1  
B) /dev/sda2  
C) /dev/sda1  
D) /dev/hdb2  

**Answer: B**  
Explanation: The letter after `sd` indicates which disk it is, and the number after it is the partition number. So the first disk is `sda`, and its second partition is `sda2`. Names starting with `hd` refer to disks of the old IDE type.

---

**Question 4.** Which of the following detects device connection and removal and automatically creates and deletes device files under `/dev`?

A) systemd  
B) fstab  
C) mount  
D) udev  

**Answer: D**  
Explanation: udev receives the device information the kernel detected, creates the corresponding device file under `/dev`, and deletes it when the device is removed. Rules can be placed in `/etc/udev/rules.d/` to give a specific device a fixed name. `mount` is the command that attaches a file system.

---

**Question 5.** Which command prints the messages left by the kernel so you can check how a newly connected device was recognized?

A) dmesg  
B) lsmod  
C) lscpu  
D) blkid  

**Answer: A**  
Explanation: `dmesg` prints the messages accumulated in the kernel ring buffer, so you can check what device name a USB stick you just connected was recognized as. `lsmod` shows loaded kernel modules, `lscpu` shows CPU info, and `blkid` shows a device's UUID and file system type.
