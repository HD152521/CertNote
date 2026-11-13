# Day 1 - Process Management: From PIDs to Signals and Priorities

## 📌 Key Takeaways

- A program is a file on disk; **a process is the unit of execution that has been loaded into memory and given CPU time**. It is identified by its PID and linked to its parent by its PPID, forming a tree.
- Use the viewing tools for different jobs: `ps aux` (usage, STAT) / `ps -ef` (tracing PPID) / `top` (real time) / `pstree` (hierarchy) / `pgrep` (name to PID).
- The control mechanism is the **signal**. **Try 15 (SIGTERM) first; if the process won't die, use 9 (SIGKILL)**. Only 9 and 19 (SIGSTOP) cannot be ignored or blocked, and 1 (SIGHUP) means "reload the config without restarting".
- Priority is the **nice value, −20 to 19** (lower means higher priority). Negative values are root-only; `nice` is used when launching, `renice` on a running process.
- For performance, look back at history with `sar`, then narrow down with `vmstat` (whole system), `iostat` (disks), `mpstat` (cores), and `pidstat` (processes) to tell CPU, I/O, and memory bottlenecks apart.

## A Process's Identity — PID and PPID

- **Program vs. process**: A program is a noun (an executable file sleeping on disk); a process is a verb (it is loaded into memory and running on the CPU). When you type `ls`, the shell creates a new process and runs `ls` inside it.
- **PID (Process ID)**: A unique number assigned to every process when it is born.
- **PPID (Parent PID)**: The number of the parent process that created it. Because of this link, every Linux process belongs to a family tree.
- The root of the tree is **PID 1** — `init` on traditional init systems, `systemd` on modern ones. It is the first user-space process the kernel starts right after boot, and the ancestor of every process.

```bash
echo $$        # PID of the current shell itself
echo $PPID     # parent PID of the current shell
ps -p 1        # check what PID 1 is (systemd or init)
```

PID 1 (init/systemd) never dies. A child whose parent exited first (an orphan process) is automatically adopted by PID 1 and cleaned up. This adoption mechanism is the key thing that keeps the system from filling up with zombies.

- A new process is created by **fork()**ing its parent into a copy, which then switches to a different program with **exec()** (the fork-exec model is covered in detail on Day 2).
- Today's takeaway: a child is linked to its parent by PPID and inherits the parent's environment (variables, working directory, etc.).

**Try it yourself**: Run `bash` once more to enter a subshell, check its PID with `echo $$`, and compare whether `echo $PPID` matches the PID of the outer shell. When you `exit`, you return to the original PID. You can see the process hierarchy with your own eyes.

## Listing Processes — The Two Faces of ps

- `ps` (process status) shows a **snapshot** of the current processes.
- Why it's confusing: for historical reasons it supports two option syntaxes, **BSD style** and **UNIX style**. You only need to learn the two combinations that dominate real-world use and exams.

| Command | Style | Meaning | Notes |
|------|--------|------|------|
| `ps aux` | BSD (no hyphen) | All processes of all users | Shows %CPU, %MEM, START, etc. |
| `ps -ef` | UNIX (with hyphen) | Full list of all processes | Shows the PPID column |
| `ps -u user` | UNIX | Processes of a specific user | Filter by user |
| `ps -p PID` | UNIX | Info on a specific PID | Single process |

```bash
ps aux                 # all processes + CPU/memory usage
ps -ef                 # all processes + PPID (good for tracing parents)
ps -ef | grep nginx    # pick out only a specific program's processes
ps aux --sort=-%cpu    # sort by CPU usage, descending
```

- To read the **STAT (state) column** of `ps aux`, you need to know what each letter means.

| STAT | Meaning |
|------|------|
| R | Running or runnable (waiting for CPU) |
| S | Interruptible sleep (Sleeping) |
| D | Uninterruptible sleep (mostly I/O) |
| T | Stopped (Ctrl+Z, etc.) |
| Z | Zombie (terminated but not reaped) |
| <  | High priority (low nice) |
| N | Low priority (high nice) |

> ⚠️ **Trap**: `ps aux` takes no hyphen, while `ps -ef` does. Mixing them as in `ps -aux` may produce a warning or be interpreted differently on some systems. Remember it as "aux is bare, ef has a hyphen". Also, `Z` (zombie) is a state where the parent has not reaped (wait) the terminated child, so only the PID remains — the key topic of Day 2.

The BSD syntax of `ps aux` comes from Berkeley Unix, and the UNIX syntax of `ps -ef` from AT&T System V. Linux's procps accepts both, so you can see the same information either way. Exams often test the difference in purpose: "aux is for usage, ef is for tracing parents".

## Real-Time Monitoring — top and htop

- If `ps` is a still photo, `top` is a video. It **refreshes every 3 seconds by default** and lists the processes using the most CPU and memory at the top.

```bash
top              # enter the real-time process monitor
```

- The shortcut keys used inside the `top` screen show up in practical exams.

| Key | Action |
|----|------|
| `P` | Sort by CPU usage (default) |
| `M` | Sort by memory usage |
| `k` | Send a signal to a process (kill) — enter a PID |
| `r` | Change priority (renice) — enter a PID |
| `1` | Expand per-core CPU usage |
| `q` | Quit |

- You also need to read the **load average** (average load over 1, 5, and 15 minutes) in the summary line at the top. A sustained value above the number of CPU cores is a sign of overload.
- **htop**: An improved version of top. It offers colors, mouse support, and per-core bar graphs, and lets you pick a process with the arrow keys and **kill it with F9**.
- However, htop is often not installed by default on distributions, so you need to install it separately (`yum install htop` or `apt install htop`).

The exam point is that `top` ships with every distribution, while `htop` is an external tool that must be installed separately. Both send signals with "k" and change priority with "r" (top) / F9 (htop).

**Try it yourself**: Run `top`, press uppercase `M` to switch to memory sorting, and press `1` to see whether per-core usage expands. Exit with `q`. Note that the shortcuts are case-sensitive (`P` is sorting, while lowercase `p` does something else).

## Finding Processes and the Family Tree — pgrep and pstree

- The `ps -ef | grep` combination is common, but it has the drawback that **the grep process doing the search shows up in the results too**.
- `pgrep` cleanly extracts just the PIDs by name.

```bash
pgrep sshd          # print only the PIDs of sshd processes
pgrep -l sshd       # PID + process name together
pgrep -u root cron  # PIDs of cron processes owned by root
pgrep -c bash       # number of matching processes
```

- `pstree` draws processes as a **parent-child tree**. You can see at a glance who launched whom.

```bash
pstree              # full process tree
pstree -p           # show each process's PID too
pstree -p 1         # only the tree under systemd (PID 1)
```

**Try it yourself**: Run `pstree -p | head -20` to see the top of the system tree. `systemd(1)` or `init(1)` is at the very top, and every service branches out below it. You can see with your own eyes that PID 1 is the ancestor of everything.

## Talking to Processes — Signals and kill

- The **only means of communication** for stopping or restarting a process is the **signal**.
- `kill` is not a command that "kills" — it is a command that **"sends the signal with the specified number"**. Depending on the signal type, the behavior differs: terminate, reconfigure, pause, and so on.
- You must memorize the numbers and meanings of the key signals.

| Number | Name | Meaning | Can be ignored? |
|------|------|------|-----------|
| 1 | SIGHUP | Terminal disconnected / re-read config (reload) | Yes |
| 9 | SIGKILL | Forced termination (immediate, unconditional) | **No** |
| 15 | SIGTERM | Graceful termination request (default) | Yes |
| 2 | SIGINT | Interrupt (Ctrl+C) | Yes |
| 18/19 | SIGCONT/SIGSTOP | Resume / stop | STOP cannot |

```bash
kill 1234            # send the default signal 15 (SIGTERM) to PID 1234
kill -9 1234         # force-terminate with signal 9 (SIGKILL)
kill -15 1234        # explicitly request graceful termination with 15 (SIGTERM)
kill -1 1234         # signal 1 (SIGHUP) — usually makes a daemon re-read its config
kill -HUP 1234       # can also be specified by name
kill -l              # full list of signal numbers <-> names
```

- **The default is signal 15 (SIGTERM)** — this is what gets sent when you give `kill` only a PID with no option. It is a polite request that says "I'll give you time to clean up, so exit gracefully", which lets the process close open files and delete temporary files before exiting.
- With **signal 9 (SIGKILL)**, the kernel removes the process from memory immediately, without notice. It cannot be caught or ignored, so the process is certain to die.
- In exchange, SIGKILL gives no chance to clean up, so **temporary files and lock files may be left behind or data may be corrupted**.

> ⚠️ **Trap**: You must not always reach for 9 first. The correct order is to **try 15 (graceful termination) first, and use 9 (forced) only if the process still won't die**. Also remember that SIGKILL (9) and SIGSTOP (19) are the only two signals that cannot be ignored or blocked.

- To kill many processes by name at once, use `killall` (by name) or `pkill` (by pattern).

```bash
killall httpd        # send signal 15 to every process named httpd
killall -9 httpd     # force termination
pkill -u alice       # all processes of user alice
pkill -HUP sshd      # send HUP to sshd (re-read config)
```

`kill` sends signals by **PID**, while `killall`/`pkill` do so by **name/pattern**. SIGHUP (1) is often used to tell a daemon "don't die, just re-read your config file" (e.g. `kill -HUP $(pgrep -x sshd)`). That's why signal 1 is synonymous with "reload without restart".

The H-U-P in SIGHUP stands for "Hang Up" (hanging up the phone). In the old days, when a modem terminal connection dropped, the kernel sent SIGHUP to the processes attached to that terminal. As daemons today reinterpret this signal as "re-read config", it has become the standard signal for zero-downtime service reloads. The `nohup` (no hang up) command is the tool that makes a process ignore this SIGHUP so it stays alive after you log out.

## Adjusting Priority — nice and renice

- The nice value determines **which process runs first** when the CPU is limited.
- The reason it is called "nice": the higher the value, the "nicer" the process is, yielding the CPU to other processes.
- The range is **-20 to 19**, and the default is **0**.

| Nice value | Meaning | Priority |
|---------|------|----------|
| -20 | Most selfish (never yields) | Highest |
| 0 | Default | Normal |
| 19 | Nicest (yields the most) | Lowest |

```bash
nice -n 10 ./backup.sh     # run with nice lowered to 10 (yielding)
nice -n -5 ./urgent.sh     # run with nice raised to -5 (priority)
nice ./job.sh              # if -n is omitted, the default +10 is applied
```

- Change the priority of an already running process with `renice`.

```bash
renice 15 -p 1234          # change PID 1234's nice to 15
renice -n 5 -p 1234        # can also be specified with the -n option
renice 10 -u alice         # set the nice of all of alice's processes to 10
```

**Only root can set a negative nice (raising priority)**. A regular user can only raise the nice number of their own processes (make the number bigger), and cannot take back a priority they have already yielded. Also, `nice` is for "launching a new process" while `renice` is for "a process that is already running". The default applied by nice (when -n is omitted) is +10.

The nice value and the actual scheduling priority (PRI) seem to go in opposite directions but are linked. The lower the nice (the closer to -20), the higher the priority and the more often the process gets the CPU. In `top`, the NI column is the nice value and the PR column is the kernel priority.

**Try it yourself**: Launch the most yielding process with `nice -n 19 sleep 100 &`, then check that the NI column is 19 with `ps -o pid,ni,cmd -p $!`. Then change it with `renice 5 -p $!` and check again; NI drops to 5 (a regular user can only raise it).

## Performance Analysis — Which Resource Is the Bottleneck?

- `top` tells you "who is eating the CPU right now", but it **cannot answer "what happened at 3 a.m. last night?"**
- Real-time observation and **collecting historical data** use different tools.

### sysstat and sar — The Standard Tools for Keeping Performance History

- The **sysstat** package periodically collects system activity and saves it to files, and **`sar`** (System Activity Reporter) reads that history back for you.
- **cron** handles the collection. **`sa1`**, registered in `/etc/cron.d/sysstat`, takes a snapshot every 10 minutes by default.
- **`sa2`** produces a daily summary report, and the raw data accumulates in per-date files `sa01`, `sa02`, and so on.

| Item | RHEL family | Debian family |
|------|-----------|-------------|
| Install | `dnf install sysstat` | `apt install sysstat` |
| Start collection | Start the service after installing | Must change to `ENABLED="true"` in `/etc/default/sysstat` to start |
| Data location | `/var/log/sa/saDD` | `/var/log/sysstat/saDD` |

- `sar` lets you **pick the resource to view with a single option letter.**

| Option | What it shows | Values to watch |
|------|-------------|-------------|
| `-u` | CPU usage (default) | `%user` `%system` `%iowait` `%idle` |
| `-r` | Memory usage | `kbmemfree` `%memused` `kbcached` |
| `-W` / `-S` | Swap activity / swap space | `pswpin/s` `pswpout/s`, `%swpused` |
| `-b` | Overall disk I/O transfer rate | `tps` `rtps` `wtps` |
| `-d` | Disk activity **per device** | `await` `%util` |
| `-n DEV` | Traffic per network interface | `rxkB/s` `txkB/s` |
| `-q` | Run queue and load average | `runq-sz` `ldavg-1/5/15` |

```bash
sar -u 1 5                        # watch CPU live, 5 samples at 1-second intervals
sar -r                            # full memory history collected today
sar -n DEV 2 3                    # per network interface, 3 samples at 2-second intervals
sar -f /var/log/sa/sa15           # look up past history from the file for the 15th
sar -u -s 03:00:00 -e 04:00:00    # view only a specific time window
```

The value of `sar` is **looking back at the past with `-f`**. If you log in after an incident has passed and run `top`, everything is already back to normal, but if sar data has accumulated you can lay CPU, memory, disk, and network side by side for that moment and see what spiked first.

On Debian and Ubuntu, merely installing sysstat does **not start collection**. You must change `ENABLED` in `/etc/default/sysstat` to `"true"` and restart the service before data starts to accumulate.

### vmstat, iostat, mpstat, pidstat — What Each One Answers

| Tool | Question it answers | Key columns |
|------|----------------|-----------|
| `vmstat 1` | What is the whole system blocked on right now? | `r` (waiting to run), `b` (waiting on I/O), `si`/`so` (swap in/out), `wa` |
| `iostat -x 1` | **Which disk** is how busy? | `tps`, `await` (average response, ms), `%util` (device saturation) |
| `mpstat -P ALL 1` | **Which CPU core** is the load concentrated on? | Per-core `%usr` `%sys` `%iowait` |
| `pidstat 1` | **Which process** is consuming resources? | `-u` CPU, `-r` memory, `-d` disk I/O |
| `free -h` | Is memory really running short? | `available` (actual free), `buff/cache` |
| `uptime` | Recent load trend | load average over 1, 5, 15 minutes |

- Which package they belong to is also an exam point: `sar`, `iostat`, `mpstat`, and `pidstat` are in the **sysstat package**, while `vmstat`, `free`, and `uptime` are basic tools of **procps (procps-ng)**.

### How to Read the Load Average

- The three numbers at the top of `top` and `uptime` are the **average load over 1, 5, and 15 minutes**.
- Definition on Linux: the average number of "processes that are running or waiting to run (R) + processes in uninterruptible sleep (D, usually disk I/O)".

- The yardstick is the **number of CPU cores**. With 4 cores, 4.0 means "completely full with no slack", and 8.0 is an overload where half are waiting for their turn. Check the core count with `nproc`.
- Look at the **slope** of the three numbers. `10.0 4.0 2.0` means the load is rising sharply, while `2.0 4.0 10.0` means the event has already passed.
- On Linux, the load average **includes disk I/O wait (D state)**, so the value can shoot up when storage is slow even if the CPU is idle.

### Bottleneck Decision Flow — CPU, I/O, or Memory?

- The fact that the load average is high alone **doesn't tell you what to scale up.** Split it into three branches using metrics.

| Bottleneck | Decisive metric | Supporting signs | Remedy direction |
|------|-------------|-----------|-----------|
| **CPU bound** | High `%user`+`%system`, low `%iowait` | `r` in `vmstat` larger than core count, a specific core saturated in `mpstat` | Add cores, improve algorithms, yield to batch jobs with `nice` |
| **I/O bound** | High `%iowait` | Large `b` in `vmstat`, `%util` near 100% and a surge in `await` in `iostat`, `D` state in `ps` | Replace disks (SSD), distribute I/O, improve queries/caching |
| **Memory shortage** | Sustained `si`/`so` (swap in/out) | `available` in `free` bottomed out, rising `pswpout/s` in `sar -W`, OOM logs | Add memory, reduce process usage |

```bash
nproc                # core count — the baseline for interpreting load average
vmstat 1 5           # compare r / b / si / so / wa on one screen
iostat -x 1 3        # check disk saturation with await and %util
pidstat -d 1 3       # pinpoint the process actually generating I/O
```

A small `free` value in `free` does not mean memory is short. Linux uses spare memory as much as possible for **buffers and cache** and gives it back immediately when needed. Judge real free memory by the `available` column; the real evidence of a shortage is **swap in/out (`si`/`so`) continuously occurring**. If swap usage is high but there is no inflow or outflow, those are just pages that have gone to sleep, not a bottleneck.

**Try it yourself**: Leave `vmstat 1 10` running, and in another terminal create disk load with `dd if=/dev/zero of=/tmp/t bs=1M count=1000 oflag=direct`, then see whether `b` and `wa` rise together. If `%util` for that device sticks at 100% in `iostat -x 1`, that is the indicator combination for "I/O bound". When done, `rm /tmp/t`.

## 📖 Glossary

- **PID / PPID** : A process's unique number and its parent's number. Together they build the process tree.
- **PID 1 (init/systemd)** : The first user-space process the kernel starts right after boot. It is the ancestor of all processes and adopts orphan processes.
- **STAT column** : The process state shown by `ps aux`. R (running) S (sleeping) D (I/O wait) T (stopped) Z (zombie).
- **Zombie (Z) process** : A state where the child has finished but the parent has not collected its exit status, so only the PID remains.
- **Signal** : The only means of talking to a process. The type is specified by number.
- **SIGTERM (15)** : A graceful termination request meaning "clean up and exit politely". It is the default for `kill` and can be ignored.
- **SIGKILL (9)** : Forced termination in which the kernel wipes the process from memory immediately. It cannot be caught or ignored.
- **SIGHUP (1)** : Originally "phone hung up". Now used as a reload signal telling a daemon "don't die, just re-read your config".
- **Nice value** : A value from -20 to 19 that determines how much CPU to yield. Lower means higher priority, and only root can set negative values.
- **Load average** : Average load over 1, 5, and 15 minutes. It is the number of runnable (R) + I/O-waiting (D) processes, read in comparison with the core count.
- **sar** : A tool for looking back at performance history collected by sysstat. `-f` lets you open a past date's file.
- **%iowait** : The share of time the CPU sat idle waiting for the disk to respond. A high value signals an I/O bottleneck.

## 📝 Practice Questions

**Question 1.** Which command is most appropriate for printing all processes together with their parent process (PPID) information?

A) `ps aux`

B) `ps -ef`

C) `ps -u`

D) `ps -p`

**Answer: B**

Explanation: `ps -ef` is UNIX style and includes the PPID column, which makes it suitable for tracing parent-child relationships. A (`ps aux`) focuses on usage such as %CPU and %MEM, so PPID is not shown by default. C is a per-user filter and D is a per-PID lookup option, and both need further arguments. Remember it as "ef has a hyphen, aux is bare" and "ef is for tracing parents".

---

**Question 2.** When you give the `kill` command only a PID with no option, which signal is sent by default?

A) Signal 1 (SIGHUP)

B) Signal 2 (SIGINT)

C) Signal 9 (SIGKILL)

D) Signal 15 (SIGTERM)

**Answer: D**

Explanation: The default signal of `kill PID` is signal 15, SIGTERM, a graceful termination request that gives the process time to clean up. A (SIGHUP) is for re-reading config, B (SIGINT) is the Ctrl+C interrupt, and C (SIGKILL) is forced termination. The correct order is to try 15 first and use 9 if that doesn't work.

---

**Question 3.** Which of the following signals cannot be caught or ignored by a process and therefore always takes effect?

A) Signal 1 (SIGHUP)

B) Signal 9 (SIGKILL)

C) Signal 15 (SIGTERM)

D) Signal 2 (SIGINT)

**Answer: B**

Explanation: Signal 9, SIGKILL, cannot be caught with a handler or ignored by the process, so the kernel removes it from memory immediately (SIGSTOP, signal 19, also cannot be blocked in the same way). A, C, and D can all be caught or ignored by the process with a signal handler. That is why SIGKILL is the last resort for processes that won't die gracefully.

---

**Question 4.** Which of the following is a correct statement about the nice value?

A) The range is 0 to 39, and a larger value means higher priority

B) The range is -20 to 19, and a lower value means higher priority

C) The range is -19 to 20, and regular users can also lower it to negative values

D) The range is 1 to 99, and only root can set it

**Answer: B**

Explanation: The nice value ranges from -20 (highest priority) to 19 (lowest priority), with a default of 0. The lower the value, the more often the process gets the CPU. A, C, and D all have the wrong range. A negative nice (raising priority) can only be set by root, and a regular user can only yield (increase the number).

---

**Question 5.** You want to terminate every process named `httpd` at once. Which command is most appropriate?

A) `kill httpd`

B) `killall httpd`

C) `pstree httpd`

D) `nice httpd`

**Answer: B**

Explanation: `killall` sends a signal (default 15) to every process matching the given process name. A (`kill`) only accepts PIDs, so you cannot write a name directly. C (`pstree`) merely draws the tree and has no termination function, and D (`nice`) is a command for setting priority. When sending by PID rather than by name, use `kill`.

---

**Question 6.** You want to change the nice value of the running process with PID 2000 to 10. Which command is correct?

A) `nice -n 10 2000`

B) `renice 10 -p 2000`

C) `kill -10 2000`

D) `pgrep -n 10 2000`

**Answer: B**

Explanation: You change the priority of an already running process with `renice`, written as `renice 10 -p 2000`. A (`nice`) applies only to a command being newly launched and does not accept a PID. C sends signal 10 (SIGUSR1) to PID 2000, which means something entirely different. D (`pgrep`) is a command that finds PIDs by name.

---

**Question 7.** What is the most common purpose of sending SIGHUP (signal 1) to a running daemon?

A) Forcibly terminate the process immediately

B) Pause the process

C) Make the daemon re-read its config file without dying

D) Reset the process's nice value to 0

**Answer: C**

Explanation: Many daemons interpret SIGHUP (1) as a signal to "re-read the config file without restarting" and use it for zero-downtime reloads (e.g. `kill -HUP $(pgrep sshd)`). A is SIGKILL (9), B is SIGSTOP (19), and D is a nice operation unrelated to signals. HUP comes from "Hang Up" and has now become synonymous with reload.

---
