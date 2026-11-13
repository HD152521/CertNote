# Day 4 - Using Peripherals: Printers · Sound · Scanners

## 📌 Key Takeaways

- The **full names of the three are asked directly** — **CUPS** (printer) · **ALSA** (sound) · **SANE** (scanner).
- **CUPS** is the Common Unix Printing System. It uses the **IPP** protocol and its **web admin page is on port 631**.
- Printer commands come in two families — **BSD (`lpr` `lpq` `lprm`)** and **System V (`lp` `lpstat` `cancel`)**.
- Sound moved **from OSS to ALSA**. The standard on Linux today is **ALSA**.
- The scanner system is **SANE**, the command is **`scanimage`**, and the graphical tool is **`xsane`**.

## Printers — CUPS

| System | Meaning |
|-------|-----|
| **LPD / LPRng** | The old Unix printing systems |
| **CUPS** | **Common Unix Printing System** — **the current standard** |

- Apple took part in its development, and it is also the printing system of macOS.
- It uses **IPP (Internet Printing Protocol)** as its default protocol, in order to handle network printers in a standard way.

| Item | Value |
|------|-----|
| **Web admin page** | **`http://localhost:631`** |
| **Config file** | **`/etc/cups/cupsd.conf`** |
| Printer list | `/etc/cups/printers.conf` |
| Daemon | `cupsd` |
| Spool directory | `/var/spool/cups` |

> **Port 631** and **`/etc/cups/cupsd.conf`** are tested as exact values.

### The Path One Print Job Takes

```text
   lpr report.txt
        │  print request
        ▼
   cupsd (scheduler)  ──►  stores the job in /var/spool/cups, assigns a number
        │
        ▼
   filter             ──►  converts the document into a format the printer understands (see PPD)
        │
        ▼
   backend            ──►  sends it along the matching path among usb · ipp · lpd · socket
        │
        ▼
   printer
```

- `lpr` **hands off the job and finishes right away.** The actual printing is processed in order by the `cupsd` daemon. That is why the command succeeds even when the printer is off, and the job stays in the queue.
- A **PPD (PostScript Printer Description)** is a file that describes the printer's paper, resolution, and features, and sits in `/etc/cups/ppd/`. Choosing the model when you register a printer is the same as choosing the PPD.
- Logs go to `access_log` and `error_log` under **`/var/log/cups/`**.

| File | What it holds | Who edits it |
|------|--------|-----------|
| **`cupsd.conf`** | **Daemon behavior** — which address and port to listen on, who can access | The administrator, directly |
| `printers.conf` | The **list of registered printers** and each printer's device address | Written for you by the web page and `lpadmin` |
| `/etc/printcap` | The old **LPD-style printer list**. CUPS generates it only for compatibility with old programs | — |

- In the default settings, `cupsd.conf` opens **only `localhost:631`**. So the web admin page is reached on that computer at `http://localhost:631`.
- Printers can also be registered by command rather than the web page.

```bash
lpadmin -p printer1 -E -v ipp://192.168.0.50/ipp/print -m everywhere   # register
lpadmin -d printer1                                                    # set as default printer
lpadmin -x printer1                                                    # delete
```

| `lpadmin` option | Meaning |
|--------------|-----|
| **`-p`** | The **printer name** to work on |
| `-E` | Register and make it **ready for use** right away |
| `-v` | Where the printer is — the **device address (URI)** |
| `-m` | Model (driver, PPD) |
| **`-d`** | Set the **default printer** |
| **`-x`** | **Delete** the printer |

### The Two Families of Print Commands

| Task | **BSD family** | **System V family** |
|--------|------------|------------------|
| **Print** | **`lpr`** | **`lp`** |
| **Check the queue** | **`lpq`** | **`lpstat`** |
| **Cancel** | **`lprm`** | **`cancel`** |
| Control | `lpc` | — |

```bash
lpr -P printer1 report.txt     # print to the specified printer
lpr -# 3 report.txt            # print 3 copies
lpq                            # check the queue
lpq -P printer1
lprm 12                        # cancel job 12
lprm -                         # cancel all my jobs
lpstat -p                      # printer status (System V)
cancel 12                      # cancel (System V)
```

- **`lpr` prints, `lpq` queries the queue, and `lprm` cancels** — the three form a group.
- Questions ask about the **correspondence** between the two families: `lpr`↔`lp`, `lpq`↔`lpstat`, `lprm`↔`cancel`.
- Print jobs waiting are called the **spool** and pile up in `/var/spool/cups`.

### Viewing the Queue and Canceling

```text
$ lpr -P printer1 report.txt
$ lpq -P printer1
printer1 is ready and printing
Rank    Owner   Job     File(s)                         Total Size
active  alice   12      report.txt                      2048 bytes
1st     bob     13      memo.txt                        1024 bytes
$ lprm 12
$ lpq -P printer1
printer1 is ready and printing
Rank    Owner   Job     File(s)                         Total Size
active  bob     13      memo.txt                        1024 bytes
```

| Column | Meaning |
|----|-----|
| `Rank` | Order. **`active` is printing now**, and `1st`, `2nd` are next in line |
| `Owner` | The user who submitted the job |
| **`Job`** | **Job number** — the value you give to `lprm` and `cancel` |

- **The number you give `lprm` is the job number (Job).** It is not a file name or a printer name.
- A regular user can cancel **only their own jobs**. Above, alice can delete job 12 but not bob's job 13. root can do everything.

### The Same Task, Different Option Letters

| Task | BSD | System V |
|--------|-----|----------|
| Specify printer | `lpr` **`-P`** `printer1` | `lp` **`-d`** `printer1` |
| Print multiple copies | `lpr` **`-#`** `3` | `lp` **`-n`** `3` |
| Cancel one job | `lprm 12` | `cancel 12` or `cancel printer1-12` |
| Cancel all my jobs | `lprm -` | `cancel -a` |

| `lpstat` option | What it shows |
|-------------|------------|
| `-p` | The **printer** status (whether it is available, whether it is printing) |
| `-o` | The list of **jobs** waiting |
| `-d` | The **default printer** |
| `-a` | Whether the queue is **accepting** jobs |
| `-t` | **All** of the above |

- **The `P` in `lpr -P` is uppercase.** In System V, `-d` (destination) does the same job. Choices that mix the options of the two families, such as `lpr -d` or `lp -P`, are wrong.
- The System V side calls a job by **`printername-number`** (`printer1-12`).
- `lpc` is a BSD command that **controls** printers and queues. In CUPS it is used only for things like checking status with `lpc status`.

| When printing fails | Where to look |
|--------------|------|
| Whether the job entered the queue | `lpq` · `lpstat -o` |
| Whether the printer is in a stopped state | `lpstat -p` |
| Whether the daemon is running | `systemctl status cups` |
| What the error was | `/var/log/cups/error_log` |

| Item | **LPD · LPRng** | **CUPS** |
|------|---------------|---------|
| Daemon | `lpd` | `cupsd` |
| Protocol · port | LPD · **515** | **IPP · 631** |
| Printer list file | **`/etc/printcap`** | `/etc/cups/printers.conf` |
| Management method | Edit config files directly | **Web page**, `lpadmin` |

- LPRng is **LPR Next Generation**, that is, a reworked version of the old LPD. CUPS **imitates the commands** of both (`lpr`, `lpq`, `lprm`) so that they can be used as they are, so even though the system changed, the commands stay the same.

## Sound — ALSA

| System | Meaning |
|-------|-----|
| **OSS** | **Open Sound System** — the old method |
| **ALSA** | **Advanced Linux Sound Architecture** — **the current standard** |

- From kernel 2.6, **ALSA became the default** and OSS remained as a compatibility layer.
- ALSA supports **multiple programs making sound at the same time** and handling **multiple sound cards**.

| Command · file | What it does |
|-----------|--------|
| **`alsamixer`** | **Text-screen volume control** |
| `amixer` | Command-line volume control |
| `aplay` / `arecord` | Play / record |
| `alsactl` | Save and restore settings |
| `/proc/asound/` | Info on **detected sound cards** |
| `/dev/dsp`, `/dev/mixer` | Device files from the **OSS** era |

```bash
alsamixer            # volume control (unmute with the M key)
aplay test.wav       # play
cat /proc/asound/cards   # detected sound cards
lspci | grep -i audio    # check the sound card hardware
```

- When there is no sound, **check mute first**. In `alsamixer`, a **`MM`** indicator means muted, and the `M` key unmutes it.
- On top of that, **PulseAudio** (and more recently PipeWire) sits and manages per-program volume.

### The Layers Until Sound Comes Out

```text
   application (music player · browser)
        │
   sound server    PulseAudio · PipeWire     mixes the sound of multiple programs and adjusts per program
        │
   ALSA            kernel sound drivers + libraries + tools (alsamixer · aplay)
        │
   sound card
```

- **ALSA is the driver layer inside the kernel.** There is **no separate daemon** like CUPS's `cupsd`. So there is no port number either.
- PulseAudio is **not a replacement for ALSA but sits on top of it**. If asked about "the standard sound system on Linux today", the answer is still **ALSA**.

| Item | **OSS** | **ALSA** |
|------|--------|---------|
| Full name | Open Sound System | Advanced Linux Sound Architecture |
| Target | Several Unix families | **Linux only** |
| Device files | `/dev/dsp`, `/dev/mixer`, `/dev/audio` | Under `/dev/snd/` |
| Config files | — | `/etc/asound.conf` (global), `~/.asoundrc` (personal) |
| Support for old programs | — | Provides an OSS **compatibility layer** so old programs still run |

### The Four ALSA Tools

| Tool | Nature | Example |
|------|------|-----|
| **`alsamixer`** | **Shows a screen** and adjusts with the arrow keys | `alsamixer` |
| `amixer` | Adjusts with **a single command line** — good for scripts | `amixer set Master 80%`, `amixer set Master unmute` |
| `aplay` · `arecord` | Play · record | `aplay -l` (list playback devices), `arecord -d 5 test.wav` (record 5 seconds) |
| `alsactl` | **Saves and restores** the current volume settings | `alsactl store`, `alsactl restore` |

| `alsamixer` key | What it does |
|--------------|--------|
| `←` `→` | Choose the channel to adjust (Master, PCM, Mic …) |
| `↑` `↓` | Raise · lower the volume |
| **`M`** | **Toggle mute** — if the indicator below is `MM` it is muted, and `OO` means on |
| `Esc` | Quit |

- `alsamixer` and `amixer` **do the same job and differ only in whether there is a screen**. `aplay` plays **uncompressed sound files** such as WAV.
- If you do not run `alsactl store`, the adjusted volume may not persist after a reboot.

| When there is no sound | Check |
|--------------|------|
| Whether the card was detected | `cat /proc/asound/cards`, `aplay -l`, look for audio in `lspci` |
| Whether it is muted | The `MM` indicator in `alsamixer` |
| Whether the volume is 0 | The Master and PCM bars in `alsamixer` |
| Whether the driver module is loaded | Modules starting with `snd` in `lsmod` |

## Scanners — SANE

| Item | Value |
|------|-----|
| **SANE** | **Scanner Access Now Easy** |
| Nature | A **standard API and toolset** for handling scanners |
| Command | **`scanimage`** |
| Graphical tool | **`xsane`** |
| Device search | `sane-find-scanner`, `scanimage -L` |
| Network sharing | `saned` (daemon) |

```bash
sane-find-scanner        # find connected scanners
scanimage -L             # list detected scanners
scanimage > out.pnm      # scan to a file
xsane                    # graphical scan program
```

- **SANE is for scanners, CUPS is for printers** — choices that swap the names are easily used as wrong answers.
- The default format of scan results is the **PNM** family, and you convert to another format if needed.

### Frontend and Backend

```text
   frontend    scanimage (command line) · xsane (graphical)     the programs the user works with
        │
      SANE API
        │
   backend     per-vendor, per-model scanner drivers            talks directly to the device
        │
   scanner
```

- SANE has a structure that **separates the screen (frontend) from the driver (backend)**. So one frontend can handle scanners from multiple companies, and via the **`saned` daemon you can also use a scanner attached to another computer**.
- Backend settings are gathered in **`/etc/sane.d/`**. The `dll.conf` inside it decides which backends to load.

| Command | What it looks for |
|------|-----------|
| `sane-find-scanner` | Whether a device that **looks like a scanner is connected** on USB or SCSI — it finds it regardless of whether it is supported |
| `scanimage -L` | The list of scanners the SANE backends can **actually use** |

```text
$ scanimage -L
device `epson2:libusb:001:004' is a Epson GT-1500 flatbed scanner
$ scanimage -d epson2:libusb:001:004 --resolution 300 > page1.pnm
```

- If it shows up with the first command but not the second, it means **it is connected but there is no matching backend**.
- **`scanimage` sends its result to the screen (standard output).** So you capture it into a file with `>`. You pick the device with `-d`, and detailed options like resolution differ by scanner.
- `xsane` is a graphical frontend where you set the area while viewing a preview, and it can also be called from within the image editor GIMP.

## The Three at a Glance

| Device | **System** | Full name | Representative commands |
|------|----------|-------|----------|
| **Printer** | **CUPS** | **Common Unix Printing System** | `lpr` `lpq` `lprm` |
| **Sound** | **ALSA** | **Advanced Linux Sound Architecture** | `alsamixer` `aplay` |
| **Scanner** | **SANE** | **Scanner Access Now Easy** | `scanimage` `xsane` |

| Old | New |
|------|------|
| LPD / LPRng | **CUPS** |
| **OSS** | **ALSA** |

| Item | **CUPS** | **ALSA** | **SANE** |
|------|---------|---------|---------|
| What it is | A print **server (daemon)** | A kernel **driver layer** | A scanner **API and tools** |
| Daemon | `cupsd` | None | `saned` (only for network sharing) |
| Config location | `/etc/cups/` | `/etc/asound.conf` | `/etc/sane.d/` |
| Graphical/screen tool | Web page (631) | `alsamixer` | `xsane` |
| Command-line tools | `lpr` `lpq` `lprm` | `amixer` `aplay` `arecord` | `scanimage` |
| Check detection | `lpstat -p` | `/proc/asound/cards` | `scanimage -L` |

- The **initials tell you the target** — the P in CU**P**S is Printing, the S in AL**S**A is Sound, and the S in **S**ANE is Scanner. If ALSA and SANE both having an S confuses you, read it out in full: **ALSA contains Linux Sound in full, and SANE contains Scanner in full**.

> Tomorrow we tie this week's packages and devices together on a single sheet.

## 📖 Glossary

- **CUPS**: Common Unix Printing System. The standard printing system on Linux today.
- **IPP**: Internet Printing Protocol. The network printing protocol CUPS uses.
- **Spool**: Jobs piled up in the print queue. Stored in `/var/spool/cups`.
- **`lpr` / `lpq` / `lprm`**: The BSD-family print / check-queue / cancel commands.
- **OSS**: Open Sound System. The sound system used before ALSA.
- **ALSA**: Advanced Linux Sound Architecture. The standard sound system on Linux today.
- **`alsamixer`**: The ALSA tool for adjusting volume on a text screen.
- **SANE**: Scanner Access Now Easy. The standard scanner interface on Linux.

## 📝 Practice Questions

**Question 1.** Which port number is used to access CUPS's web-based admin page?

A) 22  
B) 80  
C) 631  
D) 8080  

**Answer: C**  
Explanation: CUPS provides its web admin interface on port 631, and you can connect to `http://localhost:631` to register printers and manage queues. Port 631 is also the standard port of the IPP protocol. Port 22 is SSH and port 80 is HTTP.

---

**Question 2.** Which of the following is the full name of ALSA?

A) Advanced Linux Scanner Application  
B) Advanced Linux Sound Architecture  
C) Automatic Linux Sound Adapter  
D) Applied Linux System Audio  

**Answer: B**  
Explanation: ALSA is short for Advanced Linux Sound Architecture, and it took its place as the standard sound system of Linux from kernel 2.6. OSS, used before it, is the Open Sound System and now remains only as a compatibility layer.

---

**Question 3.** Which of the following is the standard interface for handling scanners on Linux?

A) CUPS  
B) ALSA  
C) LPRng  
D) SANE  

**Answer: D**  
Explanation: SANE is short for Scanner Access Now Easy and is a standard API and toolset for handling scanners. On the command line you use `scanimage`, and in a graphical environment you use `xsane`. CUPS handles printing and ALSA handles sound.

---

**Question 4.** Which command checks the list of the print queue in the BSD family?

A) lpq  
B) lpr  
C) lprm  
D) cancel  

**Answer: A**  
Explanation: `lpq` is a BSD-family command that shows which jobs are currently in the print queue, and it corresponds to `lpstat` in the System V family. `lpr` is a print request, `lprm` cancels a job, and `cancel` is the System V-family cancel command.

---

**Question 5.** Which of the following is the main configuration file of CUPS?

A) /etc/printcap  
B) /etc/cups/cupsd.conf  
C) /etc/cups/printers.conf  
D) /var/spool/cups  

**Answer: B**  
Explanation: `cupsd.conf` is the main configuration file that defines the CUPS daemon's behavior and access permissions. `printers.conf` holds the information of registered printers, and `/var/spool/cups` is the spool directory where print jobs wait.
