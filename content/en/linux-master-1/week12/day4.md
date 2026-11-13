# Day 4 - Process, Scheduling, and systemd Task Questions: Cementing Operations Commands with Scenarios

## 📌 Key Points

- System operations means **handling processes, scheduling jobs, and managing services**. The key skill is translating a scenario into commands.
- A **lower nice value means higher priority** (-20 to +19). Use `nice` for new processes and `renice` for running ones. Negative values are root only.
- Job control: `&` (background), `Ctrl+Z` (suspend), `jobs`, `bg %N`, `fg %N`, and `nohup ... &` to keep running after logout.
- For scheduling, **cron if it repeats, at if it runs once**. Among `crontab -e/-l/-r`, beware that `-r` deletes everything without confirmation.
- In systemd, **`start` is for now and `enable` is for boot**, and the two are separate. To do both at once, use `enable --now`.
- After editing a unit file, you must run **`systemctl daemon-reload`**. View service logs with `journalctl -u service`.

## Process Priority: nice / renice

- Linux processes have their priority adjusted by the **nice value** (-20 to +19).
- **The lower the value, the higher the priority**.

```bash
# nice: start a new process at a specific priority
nice -n 10 command       # run with nice value +10 (lower priority)
nice -n -5 command       # run with nice value -5 (higher priority, requires root)
nice command             # run with the default +10

# renice: change the priority of an already running process
renice -n 5 -p 1234      # set PID 1234 to nice 5
renice -n -10 -p 1234    # raise priority (requires root)
renice -n 5 -u alice     # all of alice's processes
```

| nice value | Priority | Permission |
|---------|----------|------|
| -20 | Highest | root only |
| 0 | Default | Regular users |
| +19 | Lowest | Regular users |

A **lower nice value means higher priority** (-20 is the highest, +19 the lowest). Regular users can only **lower** the priority (to positive values); raising it (negative values) requires root. Use `nice` for new processes and `renice` for running ones.

> ⚠️ **Trap**: `nice -n 10` **lowers** the priority (yields to others). It is counterintuitive. Remembering "the nicer you are (the more you yield), the lower your priority" keeps it from getting confusing. `renice` uses the `-p` option for a PID and `-u` for a user.

## Job Control: Foreground / Background / jobs

- Switching jobs that are running in the shell is job control.

```bash
command &            # run in the background
Ctrl + Z             # suspend the running job
jobs                 # list jobs in the current shell
jobs -l              # show with PIDs
bg %1                # resume job 1 in the background
fg %1                # bring job 1 to the foreground
kill %1              # terminate by job number
nohup command &      # keep running even after logout
disown %1            # detach the job from the shell
```

| Action | Command/Key |
|------|---------|
| Run in background | `command &` |
| Suspend | `Ctrl + Z` (SIGTSTP) |
| List jobs | `jobs` |
| Resume in background | `bg %number` |
| Switch to foreground | `fg %number` |
| Keep running after logout | `nohup ... &` |

`Ctrl + Z` **suspends** (pauses) a job, while `Ctrl + C` **terminates** it (SIGINT). A stopped job can be resumed in the background with `bg` or brought back with `fg`. Jobs are referred to as `%number`. To keep one alive after logout, put `nohup` in front and run it in the background with `&`.

## Scheduling Recurring Jobs: crontab

- `crontab` schedules recurring jobs.
- If yesterday was about file structure, today is about command usage.

```bash
crontab -e           # edit the current user's crontab
crontab -l           # list registered cron jobs
crontab -r           # delete all cron jobs (careful!)
crontab -u alice -e  # edit alice's crontab (root)
crontab -u alice -l  # list alice's crontab

# Example entries (minute hour day month weekday command)
0 3 * * *      /backup/daily.sh      # every day at 03:00
30 2 * * 0     /backup/weekly.sh     # every Sunday at 02:30
0 0 1 * *      /backup/monthly.sh    # 00:00 on the 1st of every month
*/15 * * * *   /check/health.sh      # every 15 minutes
0 9-18 * * 1-5 /work/poll.sh         # weekdays, on the hour from 9 to 18
```

`crontab -e` (edit), `crontab -l` (list), and `crontab -r` (delete all) are the three essentials. `-r` is dangerous because it deletes everything without confirmation. "Every day at 3 AM" is written in the order minute-hour-day-month-weekday, as in `0 3 * * *`.

> ⚠️ **Trap**: `crontab -r` **deletes all jobs without confirmation**. Confusing it with edit (`-e`) is a disaster. Allowing/blocking cron use is controlled by `/etc/cron.allow` (allow list) and `/etc/cron.deny` (deny list). If allow exists, only the users listed there can use it; if not, users not in deny can use it.

## Scheduling One-Time Jobs: at

- `at` schedules a job to run **once** at a future time (use cron for repetition).

```bash
at 10:30                 # run today at 10:30 (interactive input)
at now + 2 hours         # 2 hours from now
at 9am tomorrow          # tomorrow at 9 AM
at 14:00 2026-06-10      # a specific date and time
# After the prompt, type the command and press Ctrl+D to register

atq                      # list scheduled at jobs
atrm 3                   # delete job 3
batch                    # run when system load is low
```

| Tool | Purpose | Repeats |
|------|------|------|
| `cron` | Recurring jobs | Yes |
| `at` | One-time future job | No |
| `batch` | Once, when load is low | No |

The key distinction is that `at` runs once and `cron` repeats. List `at` jobs with `atq` and delete them with `atrm`. Permission to use `at` is also controlled by `/etc/at.allow` and `/etc/at.deny`.

## Service Management: systemd / systemctl

- Modern Linux manages services (daemons) with **systemd**.
- `systemctl` is the key command.

```bash
# Service control
systemctl start nginx          # start
systemctl stop nginx           # stop
systemctl restart nginx        # restart
systemctl reload nginx         # re-read configuration only (no downtime)
systemctl status nginx         # check status

# Automatic start at boot
systemctl enable nginx         # register to start at boot
systemctl disable nginx        # unregister autostart
systemctl enable --now nginx   # register + start immediately
systemctl is-enabled nginx     # check whether autostart is enabled
systemctl is-active nginx      # check whether it is running

# Full lists
systemctl list-units --type=service       # running services
systemctl list-unit-files --type=service  # all services + enabled or not
```

| Task | Command |
|------|------|
| Start immediately | `systemctl start service` |
| Register autostart at boot | `systemctl enable service` |
| Register + start immediately | `systemctl enable --now service` |
| Check status | `systemctl status service` |
| Reload configuration | `systemctl reload service` |

`start`/`stop` act **now**, while `enable`/`disable` decide whether it starts automatically **at boot**. The two are separate - with only `enable` it isn't running now, and with only `start` it won't run after a reboot. If the requirement is "auto-start even after boot", `enable` is mandatory. To do both at once, use `enable --now`.

```bash
# Runlevel ↔ systemd target
systemctl get-default                  # check the default boot target
systemctl set-default multi-user.target  # boot into CLI mode
systemctl set-default graphical.target   # boot into GUI mode
systemctl isolate multi-user.target      # switch immediately

# Power management
systemctl reboot         # reboot
systemctl poweroff       # shut down
```

| Old runlevel | systemd target | Meaning |
|-----------|----------------|------|
| 0 | poweroff.target | Shutdown |
| 1 | rescue.target | Single-user |
| 3 | multi-user.target | Text multi-user |
| 5 | graphical.target | GUI |
| 6 | reboot.target | Reboot |

Runlevel 3 (text) corresponds to `multi-user.target`, and runlevel 5 (GUI) to `graphical.target`. Change the default boot mode with `systemctl set-default`. systemd also handles the old `init 3` and `init 5` for compatibility.

## systemd Unit Files

- A service definition lives in a **unit file** (`.service`).
- Get to know the locations and key sections.

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Application
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/myapp
Restart=on-failure
User=appuser

[Install]
WantedBy=multi-user.target
```

```bash
# Always run after modifying a unit file
systemctl daemon-reload        # make systemd re-read unit changes
systemctl restart myapp
```

| Location | Purpose |
|------|------|
| `/usr/lib/systemd/system/` | Default units installed by packages |
| `/etc/systemd/system/` | Units created/overridden by the administrator (takes precedence) |

After creating or editing a unit file, you must run `systemctl daemon-reload` for systemd to recognize the change. If you skip it, `start` still applies the old configuration. Also, autostart at boot is completed by the unit's `[Install]` section `WantedBy` together with `systemctl enable`.

## Checking Logs: journalctl

```bash
journalctl                     # all logs
journalctl -u nginx            # logs of a specific service
journalctl -f                  # follow in real time (like tail -f)
journalctl -b                  # logs since this boot
journalctl --since "1 hour ago"  # last 1 hour
journalctl -p err              # error level and above only
```

On systemd systems, view logs with `journalctl`. Use `-u service-name` for a specific service and `-f` for real-time following. The traditional `/var/log/messages` and `/var/log/syslog` still exist, but systemd service logs are collected in the journal.

## Try It Yourself

```bash
# Process priority experiment
nice -n 10 sleep 100 &
ps -o pid,ni,cmd -p $!    # check the nice value (NI)

# Job control experiment
sleep 200 &              # run in the background
jobs -l                  # job list + PIDs
fg %1                    # to the foreground (try stopping it with Ctrl+Z)
bg %1                    # back to the background

# Check cron
crontab -l 2>/dev/null   # current cron list

# Check systemd status (queries only)
systemctl status         # overall system status
systemctl list-units --type=service --state=running | head
systemctl get-default    # default boot target
journalctl -n 20 --no-pager   # last 20 log lines
```

## Task Scenario Memorization Cards

| Scenario | Command |
|----------|------|
| Run a new process with lower priority | `nice -n 10 command` |
| Change priority of a running process | `renice -n value -p PID` |
| Resume a job in the background | `bg %number` |
| Keep running after logout | `nohup command &` |
| Register a job at 3 AM every day | `crontab -e` → `0 3 * * * script` |
| View the cron list | `crontab -l` |
| Schedule a one-time future job | `at time` |
| Start a service now | `systemctl start service` |
| Register autostart at boot | `systemctl enable service` |
| Register + start immediately in one go | `systemctl enable --now service` |
| After editing a unit file | `systemctl daemon-reload` |
| Set the default boot mode to CLI | `systemctl set-default multi-user.target` |
| View a specific service's log | `journalctl -u service` |

If the scenario includes "even after boot" or "periodically", pick the command that makes the setting permanent. Tomorrow we review all the system task types learned so far with a 12-question mock exam and an error notebook.

## 📖 Glossary

- **nice value** : How much a process yields (-20 to +19). **Lower means higher priority**. Lowering it into negative values requires root.
- **renice** : The command that changes the nice value of an already running process. Specify a PID with `-p` and a user with `-u`.
- **Job control** : The shell feature for moving running jobs between foreground, background, and stopped states.
- **nohup** : A command that keeps a process from dying when you log out. Usually used with `&` in the background.
- **crontab -r** : The dangerous option that deletes that user's cron jobs **all at once without confirmation**. Do not confuse it with `-e`.
- **cron.allow / cron.deny** : Lists of users allowed or denied use of cron. If allow exists, only those listed there can use it.
- **at** : The command that schedules a job to run **only once** at a future point in time. List with `atq`, delete with `atrm`.
- **systemd** : The service and boot manager of modern Linux. Operated with `systemctl`.
- **start vs enable** : Turning a service on now / registering it to start automatically at boot. The two are separate.
- **Unit file (.service)** : A configuration file defining how to run a service. Composed of the `[Unit]`, `[Service]`, and `[Install]` sections.
- **daemon-reload** : The command that makes systemd re-read unit file changes. If you skip it, the old configuration stays in effect.
- **target** : The systemd system state corresponding to old runlevels. `multi-user` for text, `graphical` for GUI.
- **journalctl** : The command that queries the logs collected by systemd. Specify a service with `-u` and follow in real time with `-f`.

## 📝 Practice Questions

**Question 1.** Which command changes the nice value of the running process with PID 2000 to 5?

A) nice -n 5 -p 2000
B) renice -n 5 -p 2000
C) renice 5 2000 -p
D) nice -p 2000 -n 5

**Answer: B**

Explanation: Changing the priority of an already running process is done with `renice`, and the PID is specified with the `-p` option. `nice` is used when starting a new process. The higher the nice value (positive), the lower the priority.

---

**Question 2.** What happens when you press `Ctrl + Z` in the shell?

A) The current job is terminated completely
B) The current job is suspended
C) The current job is sent to the background
D) The current job is forcibly restarted

**Answer: B**

Explanation: `Ctrl + Z` sends SIGTSTP and suspends the current job. A stopped job can be resumed in the background with `bg` or brought back with `fg`. Termination is `Ctrl + C` (SIGINT).

---

**Question 3.** Which crontab entry correctly runs `/backup.sh` every day at 2:30 AM?

A) 30 2 * * * /backup.sh
B) 2 30 * * * /backup.sh
C) * * 2 30 * /backup.sh
D) 30 2 * * 0 /backup.sh

**Answer: A**

Explanation: The crontab field order is minute-hour-day-month-weekday. Every day at 02:30 is minute=30, hour=2, and * for the rest, giving `30 2 * * *`. In B the minute and hour are swapped, and D adds weekday 0 (Sunday), so it only runs every Sunday.

---

**Question 4.** Which systemctl command registers the nginx service to start automatically at boot?

A) systemctl start nginx
B) systemctl status nginx
C) systemctl enable nginx
D) systemctl restart nginx

**Answer: C**

Explanation: Registering autostart at boot is `systemctl enable`. `start` only starts it once now and has nothing to do with starting automatically after a reboot. To register and start immediately together, use `enable --now`.

---

**Question 5.** Which command schedules a job to run only once at a specific future time?

A) crontab
B) at
C) systemctl timer
D) batch -r

**Answer: B**

Explanation: `at` is the one-time scheduling command that runs only once at the specified future time. `crontab` is for recurring jobs, and `batch` runs once when the system load is low (no time is specified).

---

**Question 6.** Which command must be run after writing a new systemd unit file (`.service`) so that systemd recognizes it?

A) systemctl reload-or-restart
B) systemctl daemon-reload
C) systemctl reset-failed
D) systemctl reenable

**Answer: B**

Explanation: After adding or modifying a unit file, you must have systemd re-read the unit definitions with `systemctl daemon-reload`. If you skip it, it keeps running without the changes being applied.

---

**Question 7.** Which command changes the system's default boot mode to text (CLI) multi-user mode?

A) systemctl set-default graphical.target
B) systemctl isolate rescue.target
C) systemctl set-default multi-user.target
D) systemctl get-default multi-user.target

**Answer: C**

Explanation: The text multi-user mode is `multi-user.target` (old runlevel 3), and the default boot mode is changed with `set-default`. `graphical.target` is the GUI (runlevel 5), and `get-default` is the command for querying the current value.

---
