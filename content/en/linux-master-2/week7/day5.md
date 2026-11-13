# Day 5 - Week 7 Comprehensive Review: Packages and Devices

## 📌 Key Takeaways

- **The RPM family is Red Hat, CentOS, Fedora, SUSE**, and **the DEB family is Debian, Ubuntu, Mint**.
- **Low-level tools (`rpm`, `dpkg`) cannot resolve dependencies, and high-level tools (`yum`, `apt`) can.**
- **`apt update` refreshes the list, and `apt upgrade` does the actual update.**
- **A block device is `b` (disk) and a character device is `c` (keyboard, printer).**
- Three names — **CUPS** (printer) · **ALSA** (sound) · **SANE** (scanner).

## Key Points Diagram

```text
   Packages
     RPM family   Red Hat · CentOS · Fedora · SUSE      .rpm
       low-level  rpm   -i install · -U upgrade · -e erase · -q query
       high-level yum → dnf     SUSE uses zypper
       repository /etc/yum.repos.d/

     DEB family   Debian · Ubuntu · Mint                .deb
       low-level  dpkg  -i install · -r remove · -P purge · -l list
       high-level apt   update (list) → upgrade (actual)
       repository /etc/apt/sources.list

     Source install   tar extract → ./configure → make → make install
     Bundle/compress  tar (-c bundle -x extract -f file) + -z gzip · -j bzip2 · -J xz

   Devices
     /dev       b block (disk · USB · CD)   c character (keyboard · printer · terminal)
                major number (driver) · minor number (which one)
     Names      /dev/sda1   sd=SATA · a=first disk · 1=first partition
     udev       auto-creates/deletes /dev files when devices connect/disconnect
     Queries    lsblk · lsusb · lspci · lsmod · dmesg

   Peripherals
     Printer  CUPS  Common Unix Printing System   port 631 · cupsd.conf
              BSD  lpr · lpq · lprm
              SysV lp  · lpstat · cancel
     Sound    OSS → ALSA  Advanced Linux Sound Architecture   alsamixer
     Scanner  SANE  Scanner Access Now Easy       scanimage · xsane
```

## Contrasting the Confusing Pairs

| Item | A | B | Deciding criterion |
|------|---|---|-----------|
| RPM vs DEB | Red Hat · CentOS · **SUSE** | Debian · **Ubuntu** · Mint | Distribution lineage |
| Low-level vs high-level | `rpm` · `dpkg` | **`yum` · `apt`** | **Whether it resolves dependencies** |
| `rpm -i` vs `-U` | Install only | **Installs too if absent** | Handling of an existing version |
| `dpkg -r` vs `-P` | **Keeps** config | Deletes config too | Whether it purges |
| `apt update` vs `upgrade` | **List only** | Actual update | What changes |
| `yum` vs `zypper` | Red Hat family | **SUSE** | Both RPM but different tool |
| `tar -c` vs `-x` | **Bundle** | Extract | Direction |
| `-z` vs `-j` vs `-J` | gzip | bzip2 | **xz (uppercase)** |
| Block vs character device | **`b`** disk | **`c`** keyboard | Whether random access is possible |
| Major vs minor number | **Driver** | Which device | — |
| `sda` vs `sda1` | The **whole** disk | Partition 1 | Presence of a number |
| `lpr` vs `lpq` vs `lprm` | Print | Check queue | **Cancel** |
| OSS vs ALSA | Old method | **Current standard** | Generation |
| CUPS vs SANE | **Printer** | Scanner | Target device |

## Commonly Missed Points

1. **Ubuntu is in the RPM family** → No. It is in the **Debian family**, so it uses `.deb`.
2. **SUSE is in the DEB family** → No. It is in the **RPM family**, only its tool is **`zypper`**.
3. **`rpm` resolves dependencies for you** → It cannot. The **high-level tool (`yum`)** does.
4. **`apt update` upgrades packages** → It refreshes **the list only**.
5. **`tar` also compresses** → It only bundles. Compression needs **`-z`, `-j`, or `-J`** attached.
6. **Run `make install` first** → The order is **`./configure` → `make` → `make install`**.
7. **A printer is a block device** → It is a **character device**. Only the disk family is block.
8. **`/dev/sda1` is the whole first disk** → The whole disk is **`/dev/sda`**, and `sda1` is a **partition**.
9. **CUPS is the scanner** → It is the printer. The scanner is **SANE**.
10. **ALSA is the old one** → **OSS is the old one**, and ALSA is the current standard.

## Values That Appear on the Exam as They Are

| Value | What it is |
|-----|------|
| **631** | CUPS web admin port (IPP standard port) |
| **`/etc/cups/cupsd.conf`** | CUPS main config file |
| **`/etc/yum.repos.d/`** | YUM repository config location |
| **`/etc/apt/sources.list`** | APT repository config file |
| **`b` / `c`** | Block device / character device marker |
| **`/etc/udev/rules.d/`** | udev rule file location |

| Abbreviation | Full name |
|-------|-------|
| **CUPS** | Common Unix Printing System |
| **ALSA** | Advanced Linux Sound Architecture |
| **SANE** | Scanner Access Now Easy |
| **OSS** | Open Sound System |
| **IPP** | Internet Printing Protocol |

## Putting the Four Tools on One Line

Until yesterday we looked at each family separately. The exam **mixes the four commands that do the same job into one set of choices**, so you need practice reading across.

| Task | `rpm` | `yum` | `dpkg` | `apt` |
|--------|-------|-------|--------|-------|
| Install | `-i file.rpm` | `install name` | `-i file.deb` | `install name` |
| Remove | `-e name` | `remove name` | `-r name` | `remove name` |
| Remove including config | — | — | `-P name` | `purge name` |
| Installed list | `-qa` | `list installed` | `-l` | `list --installed` |
| Package info | `-qi name` | `info name` | `-s name` | `show name` |
| List of installed files | `-ql name` | — | `-L name` | — |
| Which package owns a file | `-qf file` | `provides file` | `-S file` | — |
| Search | — | `search keyword` | — | `search keyword` |
| Upgrade everything | — | `update` | — | `update` then `upgrade` |

- **Reading vertically, there is a rule.** The two low-level tools (`rpm`, `dpkg`) use **hyphen options**, and the two high-level tools (`yum`, `apt`) use **English words**. Low-level install takes a **file**, and the others take a **name**.
- **Reading horizontally, there are traps.** Removal is **`-e`** for `rpm` and **`-r`** for `dpkg`. The list is **`-qa`** for `rpm` and **`-l`** for `dpkg`.

### Same Letter, Different Meaning

| Letter | Here | There |
|------|---------|---------|
| **`-l`** | `dpkg -l` — **list of installed packages** | `rpm -ql` — **list of files** inside the package |
| **`-L`** | `dpkg -L` — **list of files** inside the package | `scanimage -L` — **list of scanners** |
| **`-i`** | `rpm -i` · `dpkg -i` — **install** | `rpm -qi` — **info** (after q it means info) |
| **`-P`** | `dpkg -P` — **purge** | `lpr -P` — **specify printer** |
| **`-r`** | `dpkg -r` — **remove** | `tar -r` — **append** to an archive |
| **`-x`** | `tar -x` — **extract** | `lpadmin -x` — **delete a printer** |
| **`-d`** | `lp -d` — the **printer** to print to | `lpadmin -d` — set the **default printer**, `gzip -d` — **decompress** |
| `update` | `apt update` — **list only** | `yum update` — **actual upgrade** |

- Option letters are **defined separately for each command**, so they do not carry over. First look at "which command's option is it", then read the meaning.

## Identifying from Just One Line

| What is in front of you | Identification | Basis |
|----------|------|------|
| `vsftpd-3.0.2-29.el7.x86_64.rpm` | RPM family, for the Red Hat 7 line, 64-bit | Extension `.rpm`, `el7`, `x86_64` |
| `vsftpd_3.0.5-0ubuntu1_amd64.deb` | DEB family, 64-bit | Extension `.deb`, **underscore** separators, `amd64` |
| `backup.tar.bz2` | Extract with `tar -jxvf` | `.bz2` is bzip2 → **`-j`** |
| `source.tar.xz` | Extract with `tar -Jxvf` | `.xz` → **uppercase `-J`** |
| `data.tgz` | Extract with `tar -zxvf` | `.tgz` is short for `.tar.gz` |
| `brw-rw----. 1 root disk 8, 17 …` | **Block device**, partition 1 of the second disk | Leading `b`, minor number 16 + 1 |
| `crw-rw-rw-. 1 root root 1, 3 …` | **Character device** (`/dev/null`) | Leading `c` |
| `/dev/sdc2` | Partition 2 of the third disk | `c` = third, `2` = partition |
| `/dev/sr0` | The first CD/DVD drive | `sr`, numbering from 0 |
| `ii  apache2 …` | A properly installed package | `ii` in `dpkg -l` |
| `rc  vsftpd …` | A package that was removed but **whose config remains** | `rc` in `dpkg -l` → finish removal with `dpkg -P` |
| `error: Failed dependencies:` | Install with a low-level tool got blocked by dependencies | Install with `yum` or `apt` |

## Choosing a Command from a Situation

| Situation | What to choose | Confusing wrong answer |
|------|--------|-------------|
| Which package `/usr/sbin/sshd` came from (Red Hat) | `rpm -qf /usr/sbin/sshd` | `rpm -ql` — the direction is opposite |
| The same question (Ubuntu) | `dpkg -S /usr/sbin/sshd` | `dpkg -L` — the direction is opposite |
| See the files inside a downloaded `.rpm` **before installing** | `rpm -qpl file.rpm` | `rpm -ql` — it only looks at installed ones |
| Update only what is already installed, and do not install what is absent | `rpm -Fvh *.rpm` | `rpm -Uvh` — it installs if absent |
| On Ubuntu, remove a package and its config too | `apt purge` · `dpkg -P` | `apt remove` · `dpkg -r` |
| Only see what is inside a `.tar.gz` | `tar -ztvf` | `tar -zxvf` — it actually extracts it |
| You plugged in a USB and do not know the device name | End of `dmesg`, `lsblk` | `lsusb` — it only tells you whether it is connected |
| See what chip a network card is | `lspci` | `lsusb` — PCI devices do not appear |
| Print 2 copies to printer `hp1` with a System V command | `lp -d hp1 -n 2 file` | `lpr -P hp1 -# 2 file` — that is the BSD way |
| Cancel waiting print job 7 with a BSD command | `lprm 7` | `lpq` — it only displays |
| Unmute with a single command line | `amixer set Master unmute` | `alsamixer` — it brings up a screen |
| See whether a scanner was picked up by SANE | `scanimage -L` | `lpstat -p` — that is for printers |

## Daemons · Config Files · Ports at a Glance

| Target | Daemon | Config location | Port |
|------|------|---------|------|
| YUM | None | `/etc/yum.conf`, `/etc/yum.repos.d/` | — |
| APT | None | `/etc/apt/sources.list` | — |
| Device file management | `systemd-udevd` (udev) | `/etc/udev/rules.d/` | — |
| Printing (CUPS) | `cupsd` | `/etc/cups/cupsd.conf` | **631** |
| Printing (old LPD) | `lpd` | `/etc/printcap` | 515 |
| Sound (ALSA) | None — kernel driver | `/etc/asound.conf` | — |
| Scanner (SANE) | `saned` (only for sharing) | `/etc/sane.d/` | 6566 |

- Among these, **the port to memorize as a value is CUPS's 631**. Also note that package tools and ALSA are not daemons, so they have no port.

| Old | New | What changed |
|------|------|--------------|
| `yum` | **`dnf`** | The next generation of the same RPM family. The command structure is nearly the same |
| `apt-get` · `apt-cache` | **`apt`** | The split commands merged into one |
| `devfs` · pre-made device files | **`udev`** | Creates on connection and deletes on removal |
| `/dev/hda` (IDE) | **`/dev/sda`** | Disk naming rule |
| LPD · LPRng | **CUPS** | IPP, web admin page |
| OSS | **ALSA** | A Linux-only sound architecture |

## Connecting It All in One Pass — Attaching a Printer to a New Server

This week's three topics actually connect in one line.

```text
   1  yum install cups              package — the high-level tool installs the dependencies too
   2  rpm -ql cups | grep conf      package — where were the config files installed (/etc/cups/cupsd.conf)
   3  systemctl start cups          start the cupsd daemon
   4  (connect the USB printer)
   5  dmesg | tail                  device — did the kernel recognize it
   6  lsusb                         device — does it show in the USB list
   7  ls -l /dev/usb/lp0            device — the character device file udev made (leading c)
   8  http://localhost:631          peripheral — register the printer on the web page
   9  lpr -P printer1 test.txt      peripheral — print
  10  lpq -P printer1               peripheral — check the queue
```

- **Steps 1-3 are software installation, 5-7 are device setup, and 8-10 are peripheral use.** This is how the two exam-scope items "software installation" and "device setup" interlock.

> That wraps up the first subject of the Level 2 exam, **Linux Operation and Management**. Starting next week we move into the second Level 2 subject, **Linux Utilization** — X Window, Internet usage, and application areas.

## 📖 Glossary

- **Dependency**: The relationship with other packages that a package needs in order to work.
- **Low-level / high-level tools**: A tool that handles a single file / a tool that uses repositories and handles dependencies too.
- **Block device / character device**: A device with random access in blocks / a device processed sequentially one character at a time.
- **udev**: The system that detects device connection and removal and automatically manages `/dev` files.
- **CUPS / ALSA / SANE**: The standard systems responsible for printers / sound / scanners.
- **Spool**: Jobs piled up in the print queue.
- **Repository**: The server from which high-level tools fetch packages. `yum` puts addresses in `/etc/yum.repos.d/`, and `apt` in `/etc/apt/sources.list`.
- **purge**: Removing a package along with its config files. `dpkg -P`, `apt purge`.

## 📝 Practice Questions

**Question 1.** Which of the following is a Debian-family distribution?

A) CentOS  
B) Fedora  
C) SUSE  
D) Ubuntu  

**Answer: D**  
Explanation: Ubuntu is a distribution built on Debian, so it uses `.deb` packages with `dpkg` and `apt`. CentOS, Fedora, and SUSE are all RPM-family distributions using the `.rpm` format, and of them only SUSE uses `zypper` as its high-level tool.

---

**Question 2.** Which command extracts a gzip-compressed archive with `tar`?

A) tar -zxvf file.tar.gz  
B) tar -zcvf file.tar.gz  
C) tar -jxvf file.tar.gz  
D) tar -xvf file.tar.gz  

**Answer: A**  
Explanation: `-x` is the option for extracting an archive and `-z` is the option that handles gzip compression, so the two must be used together. `-c`, on the contrary, is the option for creating a new archive, and `-j` is used for bzip2 compression.

---

**Question 3.** Which command shows the full list of installed RPM packages?

A) rpm -ql  
B) rpm -qa  
C) rpm -qi  
D) rpm -qf  

**Answer: B**  
Explanation: `-q` is the query option, and using it with `-a` (all) prints the list of all packages installed on the system. `-ql` is the list of files a specific package installed, `-qi` is package info, and `-qf` finds the package a specified file belongs to.

---

**Question 4.** Which character appears at the very start of the `ls -l /dev/sda` result?

A) d  
B) c  
C) b  
D) l  

**Answer: C**  
Explanation: `/dev/sda` is a block device pointing to a hard disk, so `b` is shown at the very start. A character device is shown as `c`, a directory as `d`, and a symbolic link as `l`.

---

**Question 5.** Which BSD-family command cancels a print job that is waiting?

A) lpq  
B) lpstat  
C) lpc  
D) lprm  

**Answer: D**  
Explanation: `lprm` is a BSD-family command that cancels a job in the print queue, and it corresponds to `cancel` in the System V family. `lpq` checks the queue, `lpstat` is the System V-family status check, and `lpc` is a printer control command.

---

**Question 6.** Which of the following is the sound system currently used as the standard on Linux?

A) OSS  
B) SANE  
C) ALSA  
D) CUPS  

**Answer: C**  
Explanation: ALSA took its place as the standard sound system of Linux from kernel 2.6 and supports simultaneous output from multiple programs and multiple sound cards. OSS is the method used before it, SANE handles scanners, and CUPS handles printers.
