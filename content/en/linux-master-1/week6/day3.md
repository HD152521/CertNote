# Day 3 - System Initialization: From init and Runlevels to systemd and Targets

## 📌 Key Takeaways

- There are two generations of boot management — the traditional **SysV init** (runlevel-based) and the modern **systemd** (unit/target-based). Level 1 asks about both.
- Runlevels: **0 halt / 1 single-user (rescue) / 3 text + network / 5 GUI / 6 reboot.** **Never set 0 or 6 as the default.**
- Target mapping: **2, 3, 4 → multi-user.target**, **5 → graphical.target**, 1 → rescue, 0 → poweroff, 6 → reboot.
- In `systemctl`, **start (once, now) and enable (automatically at every boot) are different.** To do both, use `enable --now`.
- A unit file has the `[Unit]`, `[Service]`, `[Install]` structure. `/etc/systemd/system` takes precedence over `/usr/lib/systemd/system`, and **`daemon-reload` is required after editing**. Logs: `journalctl -u service -f`.

## SysV init and Runlevels

- In a traditional boot, PID 1 `init` read **`/etc/inittab`** to decide which **runlevel** to bring the system up to.
- Runlevel = the "bundled state of the services the system provides", divided into numbers **0 to 6**.

| Runlevel | Meaning | Description |
|--------|------|------|
| 0 | Halt | Powers the system off |
| 1 (S, single) | Single-user mode | For recovery/inspection, root only, no network |
| 2 | Multi-user (no NFS) | Partial network |
| 3 | Multi-user + network | **Text (CLI) environment** — the server standard |
| 4 | Unused (user-defined) | Reserved |
| 5 | Multi-user + network + GUI | **Graphical (X11) environment** |
| 6 | Reboot | Restarts the system |

```bash
runlevel             # check the current runlevel (e.g. N 3 → previous N, current 3)
who -r               # check the runlevel and the time it changed
init 3               # switch to runlevel 3 (text)
init 0               # shut down the system (init 6 = reboot)
telinit 5            # switch runlevel, same as init
```

> ⚠️ **Trap**: You must **never set runlevel 0 or 6 as the boot default**. If 0 (halt) or 6 (reboot) is the default runlevel, the system shuts down the moment it powers on or falls into an endless reboot loop. The default is usually 3 for text servers and 5 for GUI desktops. Also remember that runlevel 1 = single-user (rescue) mode.

The only difference between runlevels 3 and 5 is **the presence of a GUI (X Window)**. 3 gives a text console, while 5 even brings up a graphical login screen. Servers use 3 as the default to save resources and desktops use 5. The per-runlevel scripts lived in `/etc/rc.d/rc{0~6}.d/` with S (start) and K (kill) prefixes.

## The Arrival of systemd and Targets

- systemd arrived to overcome the limits of init (**slow sequential boot, poor dependency management**).
- Its features: it starts services **in parallel**, manages dependencies explicitly, and unifies everything under a single concept called the **unit**.
- Distributions that adopted it: RHEL 7+, CentOS 7+, Ubuntu 16.04+, Fedora, and every other modern distribution.
- systemd uses **targets** instead of runlevels. You need to memorize the mapping to the old runlevels.

| Runlevel | systemd target | Meaning |
|--------|----------------|------|
| 0 | poweroff.target | Halt |
| 1 | rescue.target | Single-user (rescue) |
| 2 | multi-user.target | Multi-user (text) |
| 3 | multi-user.target | Multi-user + network (text) |
| 4 | multi-user.target | (user-defined) |
| 5 | graphical.target | Graphical (GUI) |
| 6 | reboot.target | Reboot |

```bash
systemctl get-default                      # check the current default target
systemctl set-default multi-user.target    # make the default text mode
systemctl set-default graphical.target     # make the default GUI mode
systemctl isolate multi-user.target        # switch to the text target immediately (like init 3)
systemctl rescue                           # go to single-user (rescue) mode
systemctl reboot                           # reboot
systemctl poweroff                         # shut down
```

The key point is that runlevels 2, 3, and 4 have all been merged into **the single multi-user.target** (text multi-user). The GUI is graphical.target (the old 5). So "change from GUI to text" is `systemctl set-default multi-user.target`, and "switch immediately" is `systemctl isolate` (the role of the old init N). `set-default` takes effect from the next boot, while `isolate` takes effect right now.

systemd was announced in 2010 by Red Hat's Lennart Poettering. init's shell-script-based sequential boot got slower as services increased, whereas systemd greatly shortened boot time by creating sockets and D-Bus in advance and starting services concurrently. There was a big debate at its introduction that it "breaks the Unix philosophy", but it has now become the de facto standard.

## systemctl — The All-Purpose Tool for Service Control

- In a systemd environment, the **single command for handling services (daemons) is `systemctl`**. It replaces both the old `service` and `chkconfig`.

| Command | Action | Old SysV equivalent |
|------|------|-------------|
| `systemctl start service` | Start immediately | `service X start` |
| `systemctl stop service` | Stop immediately | `service X stop` |
| `systemctl restart service` | Restart | `service X restart` |
| `systemctl reload service` | Re-read config only (no downtime) | `service X reload` |
| `systemctl status service` | Check state and recent logs | `service X status` |
| `systemctl enable service` | Register **auto-start at boot** | `chkconfig X on` |
| `systemctl disable service` | Unregister auto-start at boot | `chkconfig X off` |
| `systemctl is-enabled service` | Check whether auto-start is on | — |
| `systemctl list-units` | List of active units | — |

```bash
systemctl start sshd          # start the SSH daemon immediately
systemctl enable sshd         # register auto-start at every boot
systemctl enable --now sshd   # register + start immediately in one go
systemctl status sshd         # state (active/inactive) and some logs
systemctl is-active sshd      # prints active if it's running
```

> ⚠️ **Trap**: **`start` and `enable` are different.** `start` means "turn it on once, now" (it may be off again after a reboot), while `enable` means "turn it on automatically at every boot" (it is not started right now). To do both, use `systemctl enable --now`. Exams have traps that swap the two.

**Try it yourself**: Run `systemctl status sshd` (or crond) and look at the `Active:` line and the `Loaded:` line. `Active: active (running)` means it's running, and `enabled`/`disabled` in the parentheses shows whether it auto-starts at boot. You can see on a single screen that whether it's running (active) and whether it auto-starts (enabled) are separate pieces of information.

## Unit Files — The Blueprint of a Service

- Everything systemd manages is a **unit**, and the type is **distinguished by file extension**.

| Unit type | Extension | Target |
|-----------|--------|------|
| service | `.service` | Daemon/service |
| target | `.target` | Bundled state, like a runlevel |
| socket | `.socket` | Socket-based activation |
| mount | `.mount` | Filesystem mount |
| timer | `.timer` | Scheduled execution (replaces cron) |
| device | `.device` | Device |

- Unit files live in two places.
  - Originals provided by packages → `/usr/lib/systemd/system/` (or `/lib/systemd/system/`)
  - Ones modified or added by the administrator → `/etc/systemd/system/`
- **The one in `/etc` takes precedence over the one in `/usr/lib`**.
- The basic structure of a service unit file has three sections.

```ini
[Unit]
Description=My Web Service
After=network.target          # start after network.target

[Service]
ExecStart=/usr/bin/myapp      # start command
Restart=on-failure            # restart automatically on failure
User=myuser

[Install]
WantedBy=multi-user.target    # which target to link to on enable
```

- After creating or editing a unit file, **it must be re-read so that systemd recognizes the change**.

```bash
systemctl daemon-reload       # must run after changing a unit file
systemctl start myapp         # start the new service
systemctl enable myapp        # register auto-start in the WantedBy target
```

`WantedBy=multi-user.target` in `[Install]` is the key to what `enable` does. When you enable, a symbolic link is created in this target's `.wants/` directory, so the service starts automatically when boot reaches that target. In `[Unit]`, `After=`/`Before=` define the start order and `Requires=`/`Wants=` define dependencies.

If you skip `systemctl daemon-reload` after editing a unit file, the change is not applied. Because systemd caches unit files in memory, even if you edit the file on disk it keeps running with the old contents until daemon-reload. Memorize "edit unit → daemon-reload → restart" as one set.

## journalctl — systemd's Unified Log

- systemd collects and manages the logs of all services in a binary format called the **journal**.
- The tool for querying it is **`journalctl`**, which complements (or replaces) the old `/var/log/messages` text log.

```bash
journalctl                    # all logs (oldest first)
journalctl -u sshd            # only the logs of the sshd service
journalctl -f                 # follow logs in real time (like tail -f)
journalctl -b                 # only logs since this boot
journalctl --since "1 hour ago"   # logs from the last hour
journalctl -p err             # only errors (priority err and above)
journalctl -k                 # kernel messages (like dmesg)
```

| Option | Meaning |
|------|------|
| `-u service` | Logs of a specific unit |
| `-f` | Follow in real time |
| `-b` | Logs of the current boot session |
| `-p` | Priority filter (emerg to debug) |
| `-r` | Reverse order, newest first |
| `--since`/`--until` | Specify a time range |

`journalctl -u service -f` is the most useful combination for watching a specific service's logs in real time. The journal is by default stored in memory/temporary storage, so it can disappear on reboot; if you change it to `Storage=persistent` in `/etc/systemd/journald.conf`, it is kept permanently on disk (`/var/log/journal/`).

**Try it yourself**: Use `journalctl -b -p err` to pick out only the errors that occurred during this boot. If the system had problems, they are shown in red. Then narrow down to just today's SSH-related logs with `journalctl -u sshd --since "today"` and you will feel the power of combining filters.

## 📖 Glossary

- **Runlevel** : The 0-6 numeric state used by SysV init. It indicates which bundle of services to bring up.
- **`/etc/inittab`** : The configuration file that traditional init read to determine the default runlevel.
- **Single-user mode (runlevel 1 / rescue.target)** : A recovery/inspection mode that only root can enter. There is no network.
- **target** : The "bundled state" unit that replaces runlevels in systemd. multi-user is text, graphical is GUI.
- **unit** : The unit of everything systemd manages. The extension distinguishes service, target, socket, mount, timer, and device.
- **`systemctl start` vs `enable`** : Turning on once now vs. registering to turn on automatically at every boot. They are separate concepts.
- **`systemctl isolate`** : Switch to a different target immediately. Equivalent to the old `init N`.
- **`daemon-reload`** : A command that makes systemd re-read unit files from disk. Required after editing because of caching.
- **`WantedBy=`** : A directive in the `[Install]` section. It decides which target's `.wants/` gets the link on enable.
- **journal** : The binary store where systemd collects all service logs. Query it with `journalctl`.

## 📝 Practice Questions

**Question 1.** In the traditional SysV init system, which runlevel corresponds to a text (CLI) based multi-user + network environment?

A) Runlevel 1

B) Runlevel 3

C) Runlevel 5

D) Runlevel 6

**Answer: B**

Explanation: Runlevel 3 is a text multi-user mode with networking enabled and is the server standard. A (1) is single-user for recovery, C (5) is a graphical mode that also brings up the GUI, and D (6) is reboot. The only difference between 3 and 5 is the presence of the X Window (GUI).

---

**Question 2.** Which pair of runlevels must never be set as the boot default?

A) 1 and 3

B) 3 and 5

C) 0 and 6

D) 2 and 4

**Answer: C**

Explanation: If 0 (halt) and 6 (reboot) are set as the default runlevel, the system shuts down as soon as it powers on or falls into an endless reboot loop. The runlevels in A, B, and D can be used as defaults (usually 3 for servers, 5 for desktops). 0 and 6 must always be excluded from the default runlevel.

---

**Question 3.** In a systemd environment, which target corresponds to the old runlevel 5 (GUI)?

A) multi-user.target

B) graphical.target

C) rescue.target

D) poweroff.target

**Answer: B**

Explanation: Runlevel 5 (graphical) corresponds to graphical.target. A (multi-user.target) is text multi-user, into which the old runlevels 2, 3, and 4 were merged; C (rescue.target) is runlevel 1 (rescue); and D (poweroff.target) is runlevel 0 (halt). The runlevel-to-target mapping is frequently tested.

---

**Question 4.** Which of the following correctly describes the difference between `systemctl start httpd` and `systemctl enable httpd`?

A) start registers auto-start at boot, enable starts immediately

B) start starts immediately, enable registers auto-start at every boot

C) Both start immediately in the same way

D) Both only register auto-start at boot in the same way

**Answer: B**

Explanation: `start` starts the service once, now (it may be off again after a reboot), and `enable` registers it to start automatically at every boot (it is not started right now). To do both, use `systemctl enable --now`. A swaps the two, and C and D are wrong because they treat the two roles as identical.

---

**Question 5.** After modifying a systemd unit file, which command must you run so that systemd recognizes the change?

A) `systemctl restart unit`

B) `systemctl daemon-reload`

C) `systemctl enable unit`

D) `journalctl -u unit`

**Answer: B**

Explanation: Because systemd caches unit files in memory, after editing a file it must be re-read with `systemctl daemon-reload` for the change to take effect. A (restart) restarts the service but does not automatically re-read the changed unit file. C registers auto-start and D queries logs. Memorize the order "edit → daemon-reload → restart".

---

**Question 6.** In a systemd unit file, which section and directive specify the target to link the service to on `enable`?

A) `After=` in the `[Unit]` section

B) `ExecStart=` in the `[Service]` section

C) `WantedBy=` in the `[Install]` section

D) `Description=` in the `[Unit]` section

**Answer: C**

Explanation: `WantedBy=` in the `[Install]` section specifies which target's `.wants/` gets the link so the service auto-starts on enable (e.g. `WantedBy=multi-user.target`). A (`After=`) is the start order, B (`ExecStart=`) is the start command, and D (`Description=`) is the description. The key to what enable does is `WantedBy` in `[Install]`.

---

**Question 7.** You want to follow only the sshd service's logs in real time. Which journalctl command is correct?

A) `journalctl -b sshd`

B) `journalctl -u sshd -f`

C) `journalctl -p sshd`

D) `journalctl -k sshd`

**Answer: B**

Explanation: `-u sshd` restricts the output to a specific service (unit) and `-f` follows it in real time. A (`-b`) is the boot session filter, C (`-p`) is the priority filter, and D (`-k`) is the kernel messages option, so their purposes differ. The standard combination for watching a specific service in real time is `-u service -f`.

---
