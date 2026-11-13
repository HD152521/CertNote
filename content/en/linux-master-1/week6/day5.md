# Day 5 - Week 6 Comprehensive Review: Tying Processes, Initialization, and Scheduling Together on One Page

## 📌 Key Takeaways

- This week in one sentence: **Linux's dynamic world starts from a single process (PID 1), grows into a tree, talks through signals, and works according to a timetable (cron).**
- Viewing: `ps aux` (usage, bare) / `ps -ef` (PPID, hyphen); controlling: signal order **15 → 9**. **Only 9 and 19 cannot be blocked**, and negative nice is root-only.
- The life cycle is **fork (new PID) → exec (PID kept)**. **Zombie = dead child + parent that doesn't collect it (dangerous), orphan = living child + dead parent (adopted by PID 1, harmless).**
- Initialization is all about the runlevel ↔ target mapping — **2, 3, 4 → multi-user**, **5 → graphical**, **0 and 6 are forbidden as defaults**. `start` (now) and `enable` (every boot) are separate.
- Scheduling uses the **"min-hour-day-month-weekday" 5 fields** (weekday 0 and 7 = Sunday), and a system crontab adds a user field for 6 fields. **cron = recurring, at/batch = once**.

## Review of Process Identification and Control (Day 1)

| Tool | Purpose | Key point |
|------|------|-------------|
| `ps aux` | All + usage | No hyphen, %CPU/%MEM |
| `ps -ef` | All + PPID | With hyphen, tracing parents |
| `top`/`htop` | Real time | top is built in, htop must be installed |
| `pgrep`/`pstree` | Search by name / tree | Avoids grep self-reference, visualizes hierarchy |

- Signals are the only means of talking to a process. Memorize the numbers.

| Number | Name | Meaning | Can be blocked? |
|------|------|------|-----------|
| 1 | SIGHUP | Re-read config (reload) | Yes |
| 2 | SIGINT | Ctrl+C interrupt | Yes |
| 9 | SIGKILL | Forced termination (immediate) | **No** |
| 15 | SIGTERM | Graceful termination (kill default) | Yes |
| 19 | SIGSTOP | Stop | **No** |

- Priority is set with the **nice value (-20 to 19, default 0)**. Lower means higher priority, negative is root-only, `nice` is for launch time and `renice` for running processes.

> ⚠️ **Trap review**: Don't mix `ps aux` (bare) and `ps -ef` (hyphen). Terminate in the order 15 (graceful) → 9 (forced). Only 9 (SIGKILL) and 19 (SIGSTOP) cannot be blocked. Negative nice is root only. `kill` works by PID, `killall`/`pkill` by name.

## Review of the Process Life Cycle (Day 2)

- A new process is born by **fork (copy) → exec (replace)**. fork creates a child with a new PID, and exec keeps the PID and changes only the program.
- Job control: `&` (background), `Ctrl+Z` (stop), `bg`, `fg`, `jobs`, `nohup`.
- Zombies and orphans are exact opposites.

| Category | Zombie | Orphan |
|------|--------------|--------------|
| Child | Dead (Z, defunct) | Alive |
| Parent | Alive but doesn't wait | Terminated first |
| PPID | Original parent | Adopted by PID 1 |
| Danger | Occupies a PID (dangerous) | Harmless |
| Fix | Terminate/restart the parent | PID 1 reaps it automatically |

> ⚠️ **Trap review**: "Zombie = dead child + parent that doesn't collect it, orphan = living child + dead parent (adopted by PID 1)". A zombie can't be killed with `kill -9`; you have to deal with the parent. `Ctrl+Z` is a stop (T), not termination. exec doesn't create a new process (PID kept).

## Review of System Initialization (Day 3)

- The **runlevel ↔ target mapping** is the key.

| Runlevel | systemd target | Meaning |
|--------|----------------|------|
| 0 | poweroff.target | Halt |
| 1 | rescue.target | Single-user (rescue) |
| 2·3·4 | multi-user.target | Text multi-user |
| 5 | graphical.target | GUI |
| 6 | reboot.target | Reboot |

- The **start/enable distinction** in `systemctl` is important.

| Command | Meaning |
|------|------|
| `start`/`stop` | Turn on/off immediately |
| `enable`/`disable` | Register/unregister auto-start at boot |
| `enable --now` | Register + start immediately |
| `status` | Check active (running) and enabled (auto) at once |

0 and 6 are forbidden as the default runlevel. 2, 3, and 4 are all multi-user.target. `start` (once, now) and `enable` (auto at boot) are separate. `daemon-reload` is required after editing a unit file. `[Install] WantedBy=` is the target that enable links to. Logs: `journalctl -u service -f`.

## Review of Job Scheduling (Day 4)

- crontab 5 fields: **minute (0-59) hour (0-23) day (1-31) month (1-12) weekday (0-7, 0·7=Sun)**.
- Build patterns with the symbols `*` `,` `-` `/`, and **specifying both day and weekday is OR**.

| Tool | Count | When | Daemon |
|------|------|------|------|
| cron | Recurring | Fixed interval | crond |
| at | Once | Specified time | atd |
| batch | Once | When load is low | atd |

| Item | User crontab | System crontab |
|------|----------------|----------------|
| Fields | 5 fields + command | 5 fields + **user** + command (6) |
| Management | `crontab -e/-l/-r` | `/etc/crontab`, `/etc/cron.d/` |

The order is "min-hour-day-month-weekday". Weekday 0 and 7 = Sunday. A user crontab has 5 fields, /etc/crontab has 6. cron = recurring, at/batch = once. allow > deny in priority. `crontab -r` deletes everything, so be careful. The at list is `atq`, deletion is `atrm`.

## Scenarios That Often Intertwine — Integrated Thinking

**Scenario A — Safely terminating a runaway process**
```bash
ps aux --sort=-%cpu | head      # identify the process hogging the CPU
pgrep -l runaway                # get the exact PID
kill -15 1234                   # try graceful termination first
kill -9 1234                    # force termination if that doesn't work
```
- Integrates Day 1 (ps, pgrep, signals 15 → 9).

**Scenario B — Registering a new service + auto-start + checking logs**
```bash
vi /etc/systemd/system/myapp.service   # write the unit file
systemctl daemon-reload                # make systemd notice the change (required)
systemctl enable --now myapp           # register + start immediately
systemctl status myapp                 # check active/enabled
journalctl -u myapp -f                 # follow logs in real time
```
- Integrates Day 3 (unit, daemon-reload, enable, journalctl).

**Scenario C — Automating a daily backup at dawn**
```bash
crontab -e
# 0 3 * * * /usr/local/bin/backup.sh   # every day at 3 a.m.
crontab -l                             # confirm registration
```
- If the backup script is heavy, yield with `nice` or run it with `batch` when the system is idle — integrates Days 1, 2, and 4.

The standard flow of real-world incident response is exactly this order — find the culprit with `ps`/`top` (Day 1), stop it safely with signals 15 → 9 (Day 1), restart the service cleanly with `systemctl` (Day 3), check the cause in the logs with `journalctl` (Day 3), and set up an inspection job in `cron` to prevent recurrence (Day 4). This week's content is the backbone of real-world operations, not just of the exam.

## 📖 Glossary

- **PID 1** : The first process the kernel starts (init/systemd). The ancestor of all processes, the star of initialization, and the adopter of orphans.
- **Signal** : A numbered notification sent to a process. 1 HUP (reload) · 2 INT (Ctrl+C) · 9 KILL (forced) · 15 TERM (default) · 19 STOP (stop).
- **Unblockable signals** : 9 (SIGKILL) and 19 (SIGSTOP). A process cannot catch or ignore them.
- **Nice value** : A value from -20 to 19 indicating how much CPU a process yields. Lower means higher priority, and only root can give negative values.
- **fork / exec** : Copying itself to create a child with a new PID / keeping the PID and swapping out only the executing code.
- **Zombie / orphan** : A dead child the parent hasn't collected (Z, dangerous) / a living child adopted by PID 1 after its parent died first (harmless).
- **Runlevel ↔ target** : SysV's 0-6 states and systemd's bundled-state units. 2, 3, and 4 merge into multi-user, and 5 into graphical.
- **start vs enable** : Turning on once now / registering to turn on automatically at every boot. `enable --now` does both.
- **daemon-reload** : A command that makes systemd re-read the disk contents after you edit a unit file. If you forget it, the service runs with the old settings.
- **crontab 5 fields** : minute-hour-day-month-weekday. Memorize it as "min-hour-day-month-weekday", and for the weekday both 0 and 7 are Sunday.
- **at / batch** : Run once at a specified time / run once when the system load drops. Both are handled by the atd daemon.

## 📝 Practice Questions

**Question 1.** Which command is most appropriate for checking all processes together with the parent process (PPID) column?

A) `ps aux`

B) `ps -ef`

C) `top`

D) `pgrep -l`

**Answer: B**

Explanation: `ps -ef` is UNIX style and includes the PPID column, which makes it suitable for tracing parent-child relationships. A (`ps aux`) focuses on usage such as %CPU and %MEM, so PPID is not shown by default; C (`top`) is a real-time monitor, and D (`pgrep`) only finds PIDs by name. Tell them apart with "ef is hyphen and parent tracing, aux is bare and usage".

---

**Question 2.** Which pair of signals below cannot be caught or ignored by a process and therefore always takes effect?

A) SIGTERM (15) and SIGINT (2)

B) SIGHUP (1) and SIGTERM (15)

C) SIGKILL (9) and SIGSTOP (19)

D) SIGINT (2) and SIGHUP (1)

**Answer: C**

Explanation: Only SIGKILL (9, forced termination) and SIGSTOP (19, stop) are the two signals a process cannot block or ignore. SIGTERM, SIGINT, and SIGHUP in A, B, and D can all be caught by a process with a handler. That is why SIGKILL is the last resort for processes that won't die gracefully.

---

**Question 3.** When you give the `kill` command only a PID with no option, which signal is sent by default, and what is its nature?

A) Signal 9 SIGKILL — immediate forced termination

B) Signal 15 SIGTERM — graceful termination that gives time to clean up

C) Signal 1 SIGHUP — re-read config

D) Signal 2 SIGINT — keyboard interrupt

**Answer: B**

Explanation: The default of `kill PID` is signal 15, SIGTERM, a graceful termination request that gives the process time to clean up resources. The correct order is to send 15 first and use 9 (SIGKILL) if that doesn't work. A (9) is forced termination, C (1) is reload, and D (2) is Ctrl+C; none is the default.

---

**Question 4.** Which of the following is correct about the nice value?

A) The range is -20 to 19, a lower value means higher priority, and only root can set negative values

B) The range is 0 to 39, and a larger value means higher priority

C) A regular user can also lower their own process's nice to a negative value to raise its priority

D) `nice` applies to a running process, and `renice` applies to a command about to be launched

**Answer: A**

Explanation: nice ranges from -20 (highest priority) to 19 (lowest) with a default of 0; the lower the value, the more CPU the process gets, and only root can set negative values (raising priority). B has the wrong range, and C is wrong because a regular user can only yield (increase). D swaps the roles of `nice` (at launch) and `renice` (while running).

---

**Question 5.** Which of the following correctly describes the difference between a zombie process and an orphan process?

A) A zombie is a living child whose parent died first, and an orphan is a dead child

B) A zombie is a dead child the parent hasn't reaped (dangerous), and an orphan is a living child adopted by PID 1 after its parent died first (harmless)

C) Both occupy excessive memory and paralyze the system

D) Both zombies and orphans are removed immediately with `kill -9`

**Answer: B**

Explanation: A zombie is a terminated child that the parent has not reaped with wait(), remaining in Z state (occupies a PID, dangerous), while an orphan is a living child adopted by PID 1 because its parent terminated first (harmless). A swaps the two, and C and D are not true. A zombie is cleaned up only by terminating/restarting the parent.

---

**Question 6.** What is the result of pressing `Ctrl+Z` during a foreground job?

A) The job is terminated immediately with SIGINT

B) The job is suspended (Stopped) and can be revived with `bg`/`fg`

C) The job immediately keeps running in the background

D) The job is handled with nohup and survives logout

**Answer: B**

Explanation: `Ctrl+Z` sends SIGSTOP to suspend the job (state T); you check it with `jobs` and revive it with `bg` (resume in the background) or `fg` (return to the foreground). A is the behavior of `Ctrl+C` (SIGINT). To keep running as in C, `bg` is additionally needed after the stop, and for D you must separately use `nohup`.

---

**Question 7.** In a systemd environment, which target corresponds to the old runlevel 3 (text multi-user)?

A) graphical.target

B) rescue.target

C) multi-user.target

D) poweroff.target

**Answer: C**

Explanation: Runlevels 2, 3, and 4 all correspond to multi-user.target (text multi-user). A (graphical.target) is runlevel 5 (GUI), B (rescue.target) is runlevel 1 (rescue), and D (poweroff.target) is runlevel 0 (halt). The runlevel ↔ target mapping is a regular exam item.

---

**Question 8.** What is the result of running only `systemctl enable sshd` without `start`?

A) sshd starts immediately but is off at the next boot

B) It is registered to auto-start from the next boot but is not running right now

C) sshd is completely removed

D) sshd's unit file is reloaded

**Answer: B**

Explanation: `enable` only registers auto-start at boot and does not turn it on immediately (to turn it on now, use `start` or `enable --now`). A swaps the effects of enable and start, and C and D are not what enable does. Distinguish "start = once, now; enable = auto at every boot".

---

**Question 9.** Which command must you run right after creating or editing a systemd unit file?

A) `systemctl daemon-reload`

B) `systemctl enable`

C) `journalctl -f`

D) `runlevel`

**Answer: A**

Explanation: Because systemd caches unit files in memory, after editing a file it must be re-read with `systemctl daemon-reload` for the change to take effect. B registers auto-start, C follows logs, and D checks the runlevel, so none of them is related to applying changes. Memorize "edit → daemon-reload → restart" as one set.

---

**Question 10.** When does the crontab entry `0 9 * * 1-5 /work.sh` run?

A) At 9 a.m. from the 1st to the 5th of every month

B) At exactly 9 a.m. on weekdays (Mon-Fri)

C) At 9 a.m. from Sunday through Thursday every week

D) Every day from 9 a.m. to 5 p.m.

**Answer: B**

Explanation: The fields are minute (0) - hour (9) - day (*) - month (*) - weekday (1-5), and weekday 1-5 is Mon-Fri (weekdays), so it is "exactly 9 a.m. on weekdays". A mistook the weekday field for the day field, C miscounted the weekday mapping (0=Sun, 1=Mon … 5=Fri), and D misread the hour field as a range.

---

**Question 11.** Which of the following is correct about the format difference between a user crontab and a system crontab (`/etc/crontab`)?

A) The system crontab has no time fields

B) The system crontab adds an execution user field, making 6 fields in total

C) The user crontab does not support the weekday field

D) The two formats are exactly the same

**Answer: B**

Explanation: A system crontab (`/etc/crontab`, `/etc/cron.d/*`) has an additional "execution user" field after the 5 time fields, making 6 fields. A user crontab runs with the registrant's privileges, so it has 5 fields with no user field. A and C are not true, and D ignores the user-field difference.

---

**Question 12.** Which of the following is correct about cron, at, and batch?

A) cron is one-time, at is recurring, and batch runs at a fixed time

B) cron runs recurringly, at runs once at a specified time, and batch runs once when the system load is low

C) at and batch are handled by the crond daemon, and cron by the atd daemon

D) batch runs once at the exact time the user specifies

**Answer: B**

Explanation: cron repeats at a fixed interval, at runs once at a specified time, and batch runs once when the system load (load average) drops instead of at a given time. A swaps the nature of cron and at, C has the daemon mapping reversed (cron → crond, at/batch → atd), and D ignores that batch is based on load, not time.

---
