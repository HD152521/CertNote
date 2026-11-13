# Day 4 - Device Management and Printers: Handling Hardware with /dev and udev, Printing with CUPS

## 📌 Key Takeaways

- **"Everything is a file"** — hardware is represented as device files under `/dev`. A device file holds no data; it is just **a doorknob leading to a driver**.
- A first letter of **`b` = block device** (disks, USB; block-unit random access, **mountable**), **`c` = character device** (terminals, keyboards; byte-sequential, not mountable).
- The two numbers in the size column are the **major number (which driver) and the minor number (which device of that driver)**.
- **udev** creates device files dynamically as devices are attached and detached, and gives them **persistent names and permissions** through rules in `/etc/udev/rules.d/`.
- Printing is handled by **CUPS** (daemon cupsd, IPP, port 631), and the commands split into two families — **System V (`lp`/`lpstat`/`cancel`, `-d`)** vs **BSD (`lpr`/`lpq`/`lprm`, `-P`)**. Sound is handled by **ALSA** (+PulseAudio) and scanning by **SANE**, in the same kind of framework.

## /dev and Device Files — Block vs Character

- Device files under `/dev` look different from ordinary files in `ls -l`.
- The first letter is **`b` or `c`**, and in the file size column come two numbers, the **major number and minor number**.

```bash
ls -l /dev/sda /dev/tty0 /dev/null
# brw-rw---- 1 root disk 8, 0 ... /dev/sda     ← b: block device
# crw--w---- 1 root tty  4, 0 ... /dev/tty0    ← c: character device
```

| Type | Indicator | Access method | Examples |
|------|------|-----------|-----|
| **Block device** | `b` | **Block-unit** random access through a buffer | Disk (sda), USB, CD |
| **Character device** | `c` | **Byte-unit** sequential access without a buffer | Terminal (tty), keyboard, mouse |

| Number | Meaning |
|------|------|
| **Major number** | Which **driver** handles it |
| **Minor number** | **Which device** it is within the same driver |

The distinction between block and character is **whether data is handled in chunks or as a stream**. A disk can be read and written at any position in block units such as 4KB, so it is a block device (`b`) — that's why a file system can be placed on it. A keyboard or terminal receives data one character at a time in sequence, so it is a character device (`c`). The exam has short-answer questions that make you distinguish b/c with "What about a disk? A terminal?".

Devices with the same major number are handled by the same driver. For example, `/dev/sda` (major 8, minor 0) and `/dev/sda1` (major 8, minor 1) are the whole disk and its first partition, handled by the same SCSI/SATA disk driver (major 8). The minor number distinguishes partitions and device sequence numbers. The command to create a device file manually is `mknod name type major minor`, but today udev handles this automatically.

In the past, all possible device files were created statically in `/dev` in advance — thousands of files that would never be used were always there. When countless USB and hot-plug devices appeared in the late 1990s, this approach hit its limits. So it evolved into a scheme that creates in `/dev` dynamically only the devices the kernel has recognized (through devfs to today's udev). The fact that `/dev` today contains only devices that actually exist is the result.

## udev — Dynamic Device Management

- `udev` (userspace /dev) is a user-space daemon that **automatically creates and removes device files under `/dev` when devices are plugged in or removed**.
- The flow: the kernel detects new hardware → sends an event (uevent) → udev creates the device file according to rules + assigns the name, permissions, and symbolic links.

```bash
udevadm info /dev/sda          # query the udev properties of that device
udevadm monitor                # watch device events in real time (try plugging in a USB)
udevadm trigger                # re-apply rules
ls /etc/udev/rules.d/          # user-defined udev rule files
```

The power of udev lies in its **rules**. In `/etc/udev/rules.d/*.rules`, you can write a rule such as "when this USB (vendor ID, product ID) is plugged in, always name it `/dev/myusb` and set permissions to 0660". That way, the same device always gets the same name regardless of the order in which it is plugged in (for example, it solves with a stable name the problem of `/dev/sdb`/`/dev/sdc` changing every time). This is called "persistent naming".

udev is the core of hot-plug device management. The moment you plug in a USB, it all follows automatically: kernel → udev → device file creation → loading required modules (`modprobe`) → ready to mount. If you plug in a USB while `udevadm monitor` is running, you can see this event flow in real time. The automatic mounting of a USB stick when you plug it in on a desktop environment is also behavior tied to udev events.

## Mountable Devices

- Block devices (disks, USB, CD) can hold a file system, so they can be **mounted**.
- Mount = connecting that device's file system to a specific point in the directory tree (the **mount point**).

```bash
lsblk                          # show block devices as a tree (recommended)
blkid                          # UUID and file system type of each device
mount /dev/sdb1 /mnt/usb       # attach the device to a mount point
umount /mnt/usb                # unmount
df -h                          # usage of mounted file systems
```

| Command | Purpose |
|------|------|
| `lsblk` | View the block device hierarchy |
| `blkid` | Check device UUID and type |
| `mount` / `umount` | Attach / detach |
| `df` | Capacity of mounted file systems |

Character devices (terminals, keyboards) **cannot be mounted.** Mounting only makes sense for block devices that have a file system. If you write it in `/etc/fstab`, it is mounted automatically at boot, and since the device name (`/dev/sdb1`) can change from boot to boot, it is safer to specify it by UUID (check with `blkid`). This is the same line of thought as udev's persistent naming.

## Printers and CUPS

- Linux's standard printing system is **CUPS** (Common Unix Printing System).
- It manages printers via **IPP** (Internet Printing Protocol), and the daemon is **`cupsd`**.
- It provides both a web interface (`http://localhost:631`) and command-line tools.
- The printing commands come from two traditions, and **two families** coexist.

| Task | System V family | BSD family |
|------|---------------|----------|
| Print | `lp file` | `lpr file` |
| Queue status | `lpstat` | `lpq` |
| Cancel job | `cancel jobID` | `lprm jobID` |

```bash
lp report.pdf                  # print to the default printer (System V)
lpr report.pdf                 # print to the default printer (BSD)
lp -d laser report.pdf         # specify the 'laser' printer (-d)
lpr -P laser report.pdf        # specify the 'laser' printer (-P)
lpstat -p                      # printer status
lpstat -t                      # summary of overall status
lpq                            # view the print queue (pending jobs)
cancel 123                     # cancel job 123 (System V)
lprm 123                       # cancel job 123 (BSD)
```

CUPS absorbed both printing traditions. The AT&T Unix (System V) family used `lp`/`lpstat`/`cancel`, and the Berkeley (BSD) family used `lpr`/`lpq`/`lprm`. Today, commands from both families are passed to CUPS and work. The printer-selection option differs too — System V uses `lp -d printer` and BSD uses `lpr -P printer`. You have to memorize `-d` (destination) and `-P` (Printer) by family.

`lpstat` shows the printing environment broadly. `lpstat -p` (printer status), `lpstat -a` (whether jobs are accepted), `lpstat -d` (default printer), `lpstat -t` (overall summary). Configuring and adding printers and setting the default printer is done with `lpadmin` (for administrators), and `lpadmin -d printer` sets the default printer. The CUPS configuration files are `/etc/cups/cupsd.conf` and `/etc/cups/printers.conf`.

> ⚠️ **Trap**: Don't confuse `lpstat` (status query) with `lpadmin` (configuration change). Also, it is easy to get mixed up that the cancel command differs by family: `cancel` (System V) and `lprm` (BSD). If you memorize as a table whether printing is `lp` or `lpr`, queue viewing is `lpstat`/`lpq`, and cancelling is `cancel`/`lprm`, you won't get confused.

```bash
# Try it yourself — observing devices and printers
ls -l /dev/sda /dev/null /dev/tty   # compare the first letter b/c and the major/minor numbers
lsblk                                # block device tree
blkid                                # UUID and type
lpstat -t 2>/dev/null || echo "CUPS not installed/not running"
ls /etc/udev/rules.d/                # udev rules
```

CUPS was developed by Michael Sweet in 1999, and Apple acquired it in 2007 and also uses it as the printing system of macOS. Thanks to his choosing IPP as the standard, everything from a local USB printer to a network printer can be handled consistently with the same commands and protocol. Supporting both the `lp` and `lpr` families was also a consideration so as not to break the habits of existing Unix users — which is why the two command groups still coexist today.

## Sound Devices — ALSA and PulseAudio

- Sound cards are also represented as device files. But rather than directly under `/dev`, they are gathered in the **`/dev/snd/`** directory with names such as `pcmC0D0p` (card 0, device 0, playback) and `controlC0` (control).
- Sound on Linux has a **2-layer structure** — the kernel's **ALSA** handles the hardware directly, and a **sound server** on top of it mixes the sound of multiple programs.

| Layer | Component | Role |
|------|------|------|
| Kernel | **ALSA** drivers (`snd_*` modules) | Control the sound card, provide the `/dev/snd/*` device files |
| User-space tools | alsa-lib, alsa-utils (`aplay`, `amixer`, `alsamixer`) | Playback, recording, volume control |
| Sound server | **PulseAudio** / PipeWire | Mix sound from multiple apps, switch output devices, network transport |

```bash
lsmod | grep snd            # loaded sound modules (snd_hda_intel, etc.)
cat /proc/asound/cards      # list of sound cards recognized by the kernel
aplay -l                    # list of playback devices
arecord -l                  # list of recording (capture) devices
aplay sample.wav            # play a WAV file
arecord -d 5 test.wav       # record for 5 seconds
speaker-test -c 2           # test speakers (2 channels)
alsamixer                   # text UI mixer (arrows = volume, M = mute)
amixer                      # command-line mixer (prints current settings)
amixer set Master 50%       # master volume 50%
amixer set Master mute      # mute (use unmute to release)
alsactl store               # save current mixer settings (restore with alsactl restore)
```

| Command | Purpose |
|------|------|
| `aplay` / `arecord` | Playback / recording (`-l` lists devices) |
| `alsamixer` | **Text UI** (interactive) mixer |
| `amixer` | **Command-line** (non-interactive) mixer — for scripts |
| `alsactl` | Save (`store`) and restore (`restore`) mixer settings |
| `speaker-test` | Test speaker output |

**ALSA** (Advanced Linux Sound Architecture) has been Linux's standard sound system since kernel 2.6. Before that, **OSS** (Open Sound System) handled sound through the device files `/dev/dsp` (playback and recording) and `/dev/mixer` (volume), but it was weak in multi-channel, hardware mixing, and MIDI support, so it was replaced by ALSA. Questions appear asking about this generational change: "old OSS (`/dev/dsp`) → current ALSA (`/dev/snd/`)".

> ⚠️ **Trap**: Don't confuse **`alsamixer` and `amixer`**. `alsamixer` is an ncurses-based **screen UI**, an interactive tool you adjust with the arrow keys, while `amixer` is a **command-line tool** that takes values as arguments, so it is used in scripts and remote work. In a practical exam, if asked "set the volume to 50% with a single command line", the answer is `amixer set Master 50%`. Also distinguish `aplay -l` (lowercase, list of hardware devices) from `aplay -L` (uppercase, list of PCM names).

**PulseAudio** is a **user-space sound server** that runs on top of ALSA. With ALSA alone, one program easily monopolizes a device, but PulseAudio sits in the middle, mixing the sound of multiple apps and switching output devices in real time. You control it with `pactl list short sinks` (list of output devices), `pactl set-sink-volume @DEFAULT_SINK@ 50%` (volume), and `pavucontrol` (GUI). Recent distributions are moving to **PipeWire**, which has a PulseAudio compatibility layer. For a regular user to use sound devices, they usually must belong to the `audio` group, and granting that permission is done by the udev rules we saw earlier.

## Scanners — SANE

- For scanners, **SANE** (Scanner Access Now Easy) is the standard. It plays for scanners the role that CUPS plays for printers.
- The structure is similar too — split into **backends**, the per-model drivers, and **frontends**, which users use.

| Component | Description |
|------|------|
| **Backend** | Per-scanner-model drivers. Configuration in `/etc/sane.d/*.conf`, the active list in `dll.conf` |
| **Frontend** | User tools. `scanimage` (command line), `xsane` and `simple-scan` (GUI) |
| **saned** | Network scanning daemon (shares the scanner with other PCs) |

```bash
sane-find-scanner            # sweep the USB/SCSI bus to find scanner hardware
scanimage -L                 # list of scanners SANE recognized (with a driver attached)
scanimage > out.pnm          # scan with default settings and save to a file
scanimage --format=tiff --resolution 300 > out.tiff   # specify format and resolution
scanimage -d 'epson2:libusb:001:002' > out.pnm        # specify the device (-d)
ls /etc/sane.d/              # backend configuration files (including dll.conf)
```

**`sane-find-scanner` and `scanimage -L` look at different layers.** The former **sweeps the USB/SCSI bus directly** to find hardware that looks like a scanner, so it shows up even without a driver. The latter shows only the devices that the **SANE backend actually recognized**. So if "it appears in `sane-find-scanner` but not in `scanimage -L`", the cause is not the cable but **an unsupported backend or being disabled in `dll.conf`**. This diagnostic flow is material for practical exam essay questions.

Printers and scanners have a symmetric structure, so it's good to memorize them together. Printing is handled by **CUPS** (daemon `cupsd`, commands `lp`/`lpr`, configuration `/etc/cups/`), and scanning by **SANE** (daemon `saned`, command `scanimage`, configuration `/etc/sane.d/`). Both hide per-model drivers behind a standard interface, so users use the same commands whatever the device is. Scanner access permission is managed, depending on the distribution, through the `scanner` group, and udev rules grant it.

- Package names differ by distribution family.

```bash
dnf install alsa-utils sane-backends     # RHEL/CentOS/Rocky family
apt install alsa-utils sane-utils        # Debian/Ubuntu family
```

```bash
# Try it yourself — observing sound and scanners (safe: mostly queries)
ls /dev/snd/ 2>/dev/null                # sound device files
cat /proc/asound/cards 2>/dev/null      # recognized sound cards
aplay -l 2>/dev/null || echo "ALSA not installed"
amixer 2>/dev/null | head               # current mixer settings
scanimage -L 2>/dev/null || echo "SANE not installed"
ls /etc/sane.d/ 2>/dev/null             # backend configuration
```

## 📖 Glossary

- **Device file** : A file under `/dev` that stands in for hardware. It holds no data and serves only as a passage to the driver.
- **Block device (`b`)** : A device that can be read and written at any position in block units. A file system can be placed on it and mounted (disk, USB, CD).
- **Character device (`c`)** : A device through which bytes flow sequentially. It is not a mount target (terminal, keyboard, mouse).
- **Major number / Minor number** : Which driver handles it / which device it is within that driver.
- **`mknod`** : A command to create a device file manually. Today udev does it instead.
- **udev** : A user-space daemon that receives device attach/detach events and creates and removes `/dev` device files.
- **Persistent naming** : Giving a particular device always the same name through udev rules. It prevents the problem of `/dev/sdb`↔`/dev/sdc` being swapped.
- **CUPS / cupsd** : The standard Linux printing system and its daemon. It is IPP-based and serves a web UI on port 631.
- **System V vs BSD printing families** : `lp`/`lpstat`/`cancel` (option `-d`) vs `lpr`/`lpq`/`lprm` (option `-P`). CUPS accepts both.
- **`lpadmin`** : An administrator command to add and configure printers and set the default printer. Easily confused with the query-only `lpstat`.
- **ALSA** : The kernel's standard sound system. It provides the `/dev/snd/` device files and replaced the old OSS (`/dev/dsp`).
- **`alsamixer` vs `amixer`** : An interactive screen mixer operated with arrow keys / a command-line mixer that takes values as arguments (for scripts).
- **PulseAudio / PipeWire** : A sound server that runs on top of ALSA, mixing the sound of multiple apps and switching output devices.
- **SANE** : The scanner standard. It splits into **backends**, the per-model drivers (`/etc/sane.d/`), and **frontends**, the user tools (`scanimage`).
- **`sane-find-scanner` vs `scanimage -L`** : Sweeping the bus to find hardware / showing only the devices the backend actually recognized.

## 📝 Practice Questions

**Question 1.** What does it mean that the first character of the permissions in `ls -l /dev/sda` is `b`?

A) It means it is a backup file

B) It means it is a block device, a disk-type device accessed randomly in block units

C) It means it is a boot-only file

D) It means it is a binary executable file

**Answer: B**

Explanation: The first character `b` of a device file indicates a block device, such as a disk, USB, or CD, accessed randomly in block units through a buffer. Character devices are shown as `c`. A, C, and D are interpretations unrelated to the meaning of `b`. Only block devices can hold a file system and be mounted.

---

**Question 2.** What does the major number of a device file indicate?

A) Which device it is within the same driver

B) The type of driver that handles that device

C) The size of the device file

D) The mount point of the device

**Answer: B**

Explanation: The major number identifies the kernel driver that handles that device. Multiple devices handled by the same driver share the same major number, and within it the minor number distinguishes which device it is (A is the minor number). C and D are unrelated to device numbers. Example: `/dev/sda` and `/dev/sda1` have the same major number.

---

**Question 3.** Which is the most appropriate description of the core role of `udev`?

A) It compiles the kernel

B) It dynamically creates and removes device files in `/dev` as devices are attached and detached, and assigns names and permissions according to rules

C) It puts print jobs in a queue

D) It resolves package dependencies

**Answer: B**

Explanation: udev receives kernel device events, dynamically creates and removes device files under `/dev`, and assigns names, permissions, and symbolic links through the rules in `/etc/udev/rules.d/` (persistent naming). A is the role of make, C of CUPS, and D of yum/apt, none of which relate to udev.

---

**Question 4.** Using System V family printing commands, which is the correct command to print a file to the 'laser' printer?

A) `lpr -P laser file.pdf`

B) `lp -d laser file.pdf`

C) `lpstat -d laser file.pdf`

D) `lprm -P laser file.pdf`

**Answer: B**

Explanation: The System V family prints with `lp`, and the printer-selection option is `-d` (destination). A is the BSD family way (`lpr -P`), and the `lpstat` in C is a status query command and the `lprm` in D is a job-cancel command, so neither is used for printing. Distinguish them as System V `lp -d` and BSD `lpr -P`.

---

**Question 5.** Which correctly pairs the commands that check the print queue (pending print jobs)?

A) System V: `lpq` / BSD: `lpstat`

B) System V: `lpstat` / BSD: `lpq`

C) System V: `lpadmin` / BSD: `lprm`

D) System V: `cancel` / BSD: `lpr`

**Answer: B**

Explanation: To check the queue status, the System V family uses `lpstat` and the BSD family uses `lpq`. A swaps the two families. In C, `lpadmin` is printer administration and `lprm` is job cancellation; in D, `cancel` is cancellation and `lpr` is printing, so all differ from querying the queue.

---

**Question 6.** Which of the following is the most appropriate device that can be mounted?

A) The terminal device `/dev/tty0` (character device)

B) The USB storage device `/dev/sdb1` (block device)

C) The keyboard input device (character device)

D) The mouse device (character device)

**Answer: B**

Explanation: Mounting only makes sense for block devices that have a file system, so the USB storage device (`/dev/sdb1`), a block device, can be mounted. A, C, and D are all character devices that handle only byte streams and hold no file system, so they are not mount targets.

---

**Question 7.** Which statement about CUPS, the standard Linux printing system, is correct?

A) It supports only System V family commands and does not support BSD family commands

B) It works on IPP, supports both the `lp` and `lpr` families of commands, and its daemon is cupsd

C) It is a tool for mounting block devices

D) It is a system for loading kernel modules

**Answer: B**

Explanation: CUPS (Common Unix Printing System) is based on IPP, accepts both System V (`lp`) and BSD (`lpr`) families of commands, its daemon is `cupsd`, and it provides a web UI on port 631. A is wrong in saying it supports only one family, and C and D are other functions unrelated to printing.

---
