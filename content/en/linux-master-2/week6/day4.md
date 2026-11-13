# Day 4 - Process Commands and Job Scheduling

## 📌 Key Points

- **`ps` is a snapshot list, and `top` is real time.** `ps -ef` and `ps aux` are the representative combinations.
- **`kill` does not kill; it sends a signal.** The default signal is **15 (TERM)**.
- **Forced termination is 9 (KILL).** It is written as `kill -9 PID`.
- **Priority is set with the `nice` value.** **-20 is the highest and 19 is the lowest.**
- **`cron` runs periodically, and `at` runs only once.** A crontab has **5 fields**.

## Viewing Processes

```bash
ps                 # only the processes of the current terminal
ps -ef             # all (System V style)
ps aux             # all (BSD style) — no hyphen
ps -ef | grep httpd
pstree             # parent-child relationships as a tree
pgrep httpd        # find PIDs by name
```

| Format | Family | Features |
|------|------|------|
| **`ps -ef`** | **System V** | UID, PID, PPID, start time |
| **`ps aux`** | **BSD** | Even **CPU and memory usage** |

- **`aux` has no hyphen.** That is because it is BSD style. This notation difference appears as a question.
- `-e` means every and `-f` means full.

### Reading the Output

```bash
ps -ef | head -3
# UID          PID    PPID  C STIME TTY          TIME CMD
# root           1       0  0 09:00 ?        00:00:02 /usr/lib/systemd/systemd
# root        1023       1  0 09:00 ?        00:00:00 /usr/sbin/sshd -D

ps aux | head -3
# USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
# root           1  0.0  0.3 171820 11520 ?        Ss   09:00   0:02 /usr/lib/systemd/systemd
# root        1023  0.0  0.2  15840  9216 ?        Ss   09:00   0:00 /usr/sbin/sshd -D
```

| Column | Meaning | Which format has it |
|----|-----|-------------|
| **`PPID`** | Parent process number | **Only in `-ef`** |
| **`%CPU`** `%MEM` | CPU and memory usage | **Only in `aux`** |
| `VSZ` / `RSS` | Virtual memory / **actually used** memory size (KB) | `aux` |
| `STAT` | Process state letter | `aux` |
| `TTY` | Connected terminal. **`?` means there is no terminal** | Both |
| `TIME` | Total **CPU time used** so far | Both |

- **If you want to know the parent, use `ps -ef`; if you want to find what uses lots of resources, use `ps aux`.** The difference in these columns is the basis for questions that distinguish the two formats.
- `TIME` is not how long it has been running. Even if it has been up all day, if it did no work it is `0:00`.

| BSD option | Meaning |
|---------|-----|
| **`a`** | Processes of **all users** attached to a terminal |
| **`u`** | **User-oriented** format — owner plus CPU and memory usage |
| **`x`** | Even processes **without a terminal** (daemons) |

- You need all three to get "the whole system." With `ps a` alone, daemons are missing.
- You also use `ps -u alice` (only that user's), `ps -p 1234` (only that PID), and **`ps -l`** (includes the priority columns `PRI` and `NI`).
- The result of `ps -ef | grep httpd` also includes **the `grep httpd` itself** as a line. `pgrep httpd` gives only the PIDs, cleanly.

### top — Real Time

```bash
top            # real-time monitoring, quit with q
top -d 2       # refresh every 2 seconds
```

```text
top - 10:15:02 up  1:15,  2 users,  load average: 0.08, 0.03, 0.01
Tasks: 142 total,   1 running, 141 sleeping,   0 stopped,   0 zombie
%Cpu(s):  1.2 us,  0.5 sy,  0.0 ni, 98.1 id,  0.2 wa,  0.0 hi,  0.0 si,  0.0 st
MiB Mem :   3736.5 total,   2105.3 free,    820.4 used,    810.8 buff/cache

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
   1310 mysql     20   0 1794188 395220  35840 S   1.3  10.3   0:42.17 mysqld
   2314 user      20   0   24424   5376   3456 S   0.0   0.1   0:00.05 bash
```

| Location | How to read it |
|------|--------|
| Line 1 `load average` | Average load over the last **1, 5, and 15 minutes** |
| Line 2 `Tasks` | Total process count and counts by state. You see the **zombie count right in the `zombie` field** |
| Line 3 `%Cpu(s)` | `us` user programs, `sy` kernel, **`id` idle share**, `wa` I/O wait |
| `PR` / `NI` | Priority / nice value |
| `S` | State letter (table below) |

- It has two parts: **a summary at the top and a process list below**. By default it is sorted **by CPU usage, highest first**, so the culprit comes to the top.
- You can narrow the view, like `top -p 1234` (only that PID) or `top -u alice` (only that user's).

| Key | What it does |
|----|--------|
| `q` | Quit |
| `k` | Kill a process (kill) |
| `M` | Sort by **memory** usage |
| `P` | Sort by **CPU** usage |
| `r` | Change the nice value (renice) |
| `u` | Only a specific user's processes |
| `1` | Show split by CPU core |
| `h` | Help |

- **`ps` is a photo taken once, and `top` is a screen that keeps moving.** Remember this contrast.
- **The sort keys `M` and `P` are uppercase**, and the action keys `k`, `r`, and `q` are lowercase.

| Command | What it shows |
|------|------------|
| `ps` | A list of processes at that moment |
| `top` | A list refreshed in real time and a system summary |
| `pstree` | A parent-child **tree** |
| `pgrep` | The **PIDs** of processes matching a name |
| `jobs` | Background and stopped jobs of the **current shell** |

### Process State Letters

| Letter | State |
|------|------|
| **`R`** | Running |
| **`S`** | Sleeping |
| **`Z`** | **Zombie** |
| `T` | Stopped |
| `D` | Uninterruptible sleep |

- The `STAT` column of `ps aux` sometimes has more letters. **The `s` in `Ss` is a session leader, the `+` in `R+` is foreground**, `<` is high priority, and `N` is low priority. The first letter is the state.

## Terminating Processes — kill

**`kill` is a command that sends signals.** The name makes it easy to misunderstand.

| Number | Name | What it does |
|-----|------|--------|
| **1** | **SIGHUP** | Terminal hang-up. For daemons it is used to **re-read the configuration** |
| **2** | **SIGINT** | Interrupt — same as **`Ctrl+C`** |
| **9** | **SIGKILL** | **Forced termination. Cannot be ignored** |
| **15** | **SIGTERM** | **Request for normal termination. The default of `kill`** |
| 18/19 | SIGCONT / SIGSTOP | Continue / stop |

```bash
kill 1234              # sends 15 (TERM) — the default
kill -9 1234           # forced termination
kill -15 1234          # normal termination (same as kill 1234)
kill -l                # list of signals
killall httpd          # terminate all by name
pkill -u alice         # terminate by user
```

> **The difference between 9 and 15** is the key. **15 is a request to "clean up and finish,"** so the program can wrap up by saving and so on. **9 is removed immediately by the kernel,** so it cannot be ignored, but data may be corrupted. The order is **15 first, and 9 if that does not work**.

### Four Ways to Specify a Signal

```bash
kill -9 1234           # by number
kill -KILL 1234        # by name (SIG omitted)
kill -SIGKILL 1234     # by full name
kill -s KILL 1234      # with the -s option
```

- All four are the same command. Questions **mix numbers and names**, so you need to know 1, 2, 9, and 15 both ways.
- **The only signals that cannot be caught or ignored are SIGKILL (9) and SIGSTOP (19).** What `Ctrl+Z` sends is not 19 but **SIGTSTP (20)**, which the program can handle.
- You can send signals **only to your own processes.** Sending to someone else's gives `Operation not permitted`. root can send to anyone.
- After editing a daemon's configuration, sending `kill -HUP PID` (= `kill -1 PID`) lets you have it **re-read its configuration without ending the process**.

### kill, killall, pkill

| Command | Criterion for choosing the target | Example |
|------|----------------|-----|
| **`kill`** | **PID** (or `%jobnumber`) | `kill 1234` |
| **`killall`** | **Process name** — all with the same name | `killall httpd` |
| `pkill` | A **part** of the name, user, or other conditions | `pkill -u alice` |
| `pgrep` | Only **finds** using the same conditions as `pkill` | `pgrep -u alice` |

- **You must not give a name to `kill` or a PID to `killall`.** `killall` is "the command that terminates by name when you do not know the PID."
- All three have **15 as the default signal.** To end forcibly, give the number in the same way, like `killall -9 httpd`.

## Priority — nice

```bash
nice -n 10 command     # run with lowered priority
renice 5 -p 1234       # change the value of a running process
```

```bash
nice                         # 0    ← the nice value of the current shell
nice -n 10 ./backup.sh &     # run with 10 added to the current value
ps -l
# F S   UID     PID    PPID  C PRI  NI ADDR SZ WCHAN  TTY          TIME CMD
# 0 S  1000    2314    2313  0  80   0 -  6106 do_wai pts/0    00:00:00 bash
# 0 S  1000    3520    2314  0  90  10 -  1827 do_wai pts/0    00:00:00 backup.sh
renice 15 -p 3520
# 3520 (process ID) old priority 10, new priority 15
```

| Category | **nice** | **renice** |
|------|---------|-----------|
| Target | A command **being newly started** | A process **already running** |
| Meaning of the number | The amount to **add** to the current value | The **value itself** to change to |
| Specifying the target | Write the command after it | `-p` PID, `-u` user, `-g` group |
| If omitted | `nice command` **adds 10** | — |

- **`nice` is relative, `renice` is absolute.** If you do `renice 15` on a process whose nice value is 10, it becomes **15**, not 25.
- In `ps -l`, **`NI` is the nice value and `PRI` is the priority the kernel actually uses.** When NI rose by 10, PRI also rose from 80 to 90. For both, **the larger the number, the further back it is pushed.**
- In the old notation, you can also write **`nice -10 command`** without `-n`. Here the hyphen is the option marker, so the value is **+10**. To give a negative value, there are two hyphens, like `nice --10 command`.

```text
   -20  ◄──────────────────────►  19
   High         priority          Low
                 0
              (default)
```

- **The smaller the value, the higher the priority.** It is the opposite of intuition, so it is confusing. Think of **nice as "yielding"** — the more you yield (the larger the value), the further back you are pushed.
- The range is **-20 to 19**, and the default is **0**.
- **Only root can raise priority (negative values).** Regular users can only lower it.
- A regular user **can only raise the value of their own processes.** Lowering a value that has been raised is also "raising the priority," so it is not allowed under the default settings.

## Job Scheduling

| Category | **cron** | **at** |
|------|---------|-------|
| Number of runs | **Repeats periodically** | **Only once** |
| Daemon | `crond` | `atd` |
| Configuration | `crontab -e` | `at time` |
| Example | A backup every day at dawn | Once at 10 PM tonight |

### crontab — 5 Fields

```text
   *  *  *  *  *   command to run
   │  │  │  │  │
   │  │  │  │  └── weekday  (0-7, 0 and 7 are Sunday)
   │  │  │  └───── month    (1-12)
   │  │  └──────── day      (1-31)
   │  └─────────── hour     (0-23)
   └────────────── minute   (0-59)
```

| Example | Meaning |
|----|-----|
| `0 3 * * *` | **Every day at 3 AM** |
| `30 2 * * 0` | Every **Sunday** at 2:30 |
| `*/10 * * * *` | **Every 10 minutes** |
| `0 0 1 * *` | Midnight on the **1st** of every month |

- There are **5 fields** and **the order is minute, hour, day, month, weekday.** Questions ask for this order directly.
- **For the weekday, both 0 and 7 are Sunday.**
- `*` means "every," `*/n` means "every n," a comma lists values (`1,15`), and a hyphen is a range (`1-5`).

| Example | Meaning |
|----|-----|
| `0 9-18 * * 1-5` | On the hour from 9 to 18 on **weekdays (Mon–Fri)** |
| `0 0 1,15 * *` | Midnight on the **1st and 15th** of every month |
| `*/5 9-17 * * *` | **Every 5 minutes** from the 9 o'clock hour to the 17 o'clock hour |
| `0 4 * * 6` | Every **Saturday** at 4:00 |
| `30 6 1 1 *` | **January 1** at 6:30 |
| `* 3 * * *` | **Every minute** during the 3 AM hour (3:00 to 3:59, 60 times in all) |

- The last row is the trap. **If you leave the minute field as `*`, it is not "once at that time" but "every minute throughout that hour."** To run it just once, put a number in the minute field and write `0 3 * * *`.
- **Read from the left**; a field with a number means "only then," and a field with `*` means "every time."
- **If you specify both day and weekday with numbers, it runs when either one matches.** `0 0 13 * 5` is not "Friday the 13th" but "the 13th of every month, and every Friday."

```text
   0 3 * * * /home/user/backup.sh >> /home/user/backup.log 2>&1
   └─ 5 time fields ─┘ └──────────── command to run ───────────┘
```

- A job run by cron has **no screen.** To keep the results, send them to a file using the redirection we learned last week.
- It is safer to write commands with **absolute paths**. The `PATH` that cron uses is narrower than at login.

```bash
crontab -e         # edit
crontab -l         # list
crontab -r         # delete everything
```

> ⚠️ **`-r` deletes everything without confirmation.** The key is next to `-e`, so it is easy to hit by mistake.

- root can view and edit another user's schedule with `-u`, as in **`crontab -u alice -l`**.
- Edits take effect as soon as you save. There is no need to restart `crond`.

| Location | What it is |
|------|------|
| `/var/spool/cron/username` | Where **per-user crontabs** are stored (`/var/spool/cron/crontabs/` on the Debian family) |
| **`/etc/crontab`** | The **system crontab** |
| `/etc/cron.d/` | Where the system crontab is split into files |
| `/etc/cron.hourly` · `daily` · `weekly` · `monthly` | Run the scripts placed there at that frequency |

```text
   # /etc/crontab
   0 3 * * * root /usr/local/bin/backup.sh
             └── user to run as — a field that user crontabs do not have
```

- **`/etc/crontab` has one more field, a user name, after the 5 time fields.** The personal crontab you edit with `crontab -e` does not have this field.
- "A crontab has 5 fields" counts **the fields that specify the time**. Counting the command makes 6, and `/etc/crontab` makes 7. Check what the question is counting.

### at

```bash
at 22:00           # 10 PM tonight
at now + 1 hour    # in 1 hour
atq                # list of scheduled jobs
atrm 3             # cancel job 3
```

- After entering the command, finish with **`Ctrl+D`**.
- Permission to use it is managed with **`/etc/at.allow` and `/etc/at.deny`**, and for cron with **`/etc/cron.allow` and `/etc/cron.deny`**.

```bash
at 22:00
# warning: commands will be executed using /bin/sh
# at> /home/user/backup.sh
# at> <EOT>                              ← where Ctrl+D was pressed
# job 3 at Wed Oct 14 22:00:00 2026
atq
# 3	Wed Oct 14 22:00:00 2026 a user
```

| Time notation | Meaning |
|---------|-----|
| `at 22:00` | 22:00 today (tomorrow if it has already passed) |
| `at 10am tomorrow` | 10 AM tomorrow |
| `at now + 30 minutes` | In 30 minutes |
| `at noon` / `at midnight` | Noon / midnight |
| `at teatime` | 4 PM |

| Command | What it does | Equivalent |
|------|--------|--------|
| `atq` | View the scheduled list | `at -l` |
| `atrm number` | Cancel a job | `at -d number` |
| `at -f file time` | Schedule, reading the commands **from a file** | — |

- **Once an `at` job has run, the schedule disappears.** It does not remain like cron. The daemon that handles the schedules is `atd`.

### When Both allow and deny Exist

| File state | Users who can use it |
|---------|---------------|
| **An allow file exists** | **Only the users listed there** — the deny file is not consulted |
| No allow, only deny | Everyone **except the users listed** in deny |
| Neither exists | Depends on the distribution (only root, or everyone) |

- **allow takes precedence over deny.** If the same name is in both files, it is allowed.
- Write **one user name per line** in the file. root can use it regardless of the file contents.
- `cron.allow` and `cron.deny`, and `at.allow` and `at.deny`, work by **the same rules**.

> Tomorrow we wrap up this week's editors and processes on a single page.

## 📖 Glossary

- **`ps`** : A command that prints the list of running processes once.
- **`top`** : A command that shows process status, refreshing in real time.
- **Signal** : A notification sent to a process. `kill` delivers it.
- **SIGKILL (9)** : The forced-termination signal that cannot be ignored.
- **SIGTERM (15)** : The signal that requests normal termination. It is the default of `kill`.
- **nice value** : Process priority. -20 is the highest, 19 is the lowest, and the default is 0.
- **cron** : A scheduling tool that repeatedly runs commands at a specified interval. It has 5 fields.
- **at** : A scheduling tool that runs a command only once at a specified time.

## 📝 Practice Questions

**Question 1.** Which of the following is the signal number used to forcibly terminate a process?

A) 1  
B) 2  
C) 15  
D) 9  

**Answer: D**  
Explanation: Signal 9, SIGKILL, is a forced-termination signal that a process cannot ignore, and the kernel removes the process immediately. Signal 15, SIGTERM, is the default signal requesting normal termination; signal 1, SIGHUP, re-applies configuration; and signal 2, SIGINT, corresponds to `Ctrl+C`.

---

**Question 2.** Which of the following correctly lists the five fields of a `crontab` entry in order?

A) hour minute day month weekday  
B) minute hour day month weekday  
C) minute hour month day weekday  
D) weekday minute hour day month  

**Answer: B**  
Explanation: The fields of a crontab, from the left, are minute, hour, day, month, and weekday. The weekday is written from 0 to 7, where both 0 and 7 mean Sunday. For example, `0 3 * * *` is a setting that runs every day at 3 AM.

---

**Question 3.** Which of the following gives the range of the nice value that expresses process priority, and the value corresponding to the highest priority?

A) 0 to 19, with 0 the highest  
B) -19 to 20, with 20 the highest  
C) -20 to 19, with -20 the highest  
D) -20 to 19, with 19 the highest  

**Answer: C**  
Explanation: The nice value runs from -20 to 19, and the smaller the value, the higher the priority. The default is 0, and specifying a negative value to raise priority is possible only for root, while a regular user can only raise the value to lower the priority.

---

**Question 4.** Which of the following commands shows process status, refreshing in real time?

A) top  
B) ps  
C) pstree  
D) jobs  

**Answer: A**  
Explanation: `top` refreshes the screen periodically and shows CPU and memory usage in real time. `ps` prints a list as of the moment it runs and then ends, `pstree` shows parent-child relationships as a tree, and `jobs` shows only the current shell's background jobs.

---

**Question 5.** Which of the following commands schedules a command to run only once at a specified time?

A) cron  
B) at  
C) nice  
D) nohup  

**Answer: B**  
Explanation: `at` performs a job only once at the specified time; view the list with `atq` and cancel with `atrm`. If you need repeated execution, use `cron`. `nice` adjusts priority, and `nohup` is the command that keeps a process running after the terminal is closed.
