# Day 4 - Job Scheduling: From cron's 5 Fields to at and batch

## 📌 Key Takeaways

- Scheduling tools come in two branches — **recurring jobs use cron (crond)**, **one-time jobs use at and batch (atd)**.
- The crontab 5-field order is **"minute (0-59) hour (0-23) day (1-31) month (1-12) weekday (0-7)"**. For the weekday, **both 0 and 7 mean Sunday**, and time is on the 24-hour clock.
- The symbols are `*` (all), `,` (list), `-` (range), `/` (step). **If you specify both day and weekday, they work as OR, not AND**.
- A user crontab has **5 fields**, while a system crontab (`/etc/crontab`, `/etc/cron.d/`) has **6 fields with a user field added**.
- Access control is **allow > deny** — if `cron.allow` exists, only that list is allowed and `cron.deny` is ignored.

## cron's Structure — The crond Daemon and crontab

- **cron** is a system for scheduling recurring jobs.
- The background daemon **`crond` wakes up every minute**, checks every user's schedule list, and runs the jobs whose time has come.
- The file/table holding the schedule list is called the **crontab (cron table)**.
- The command that manages per-user crontabs is `crontab`.

| Command | Action |
|------|------|
| `crontab -e` | Edit my crontab (created if it doesn't exist) |
| `crontab -l` | Print my crontab list |
| `crontab -r` | Delete my entire crontab |
| `crontab -u user -e` | Edit a specific user's crontab (root) |

```bash
crontab -e              # add/modify my scheduled jobs in an editor
crontab -l              # view the currently registered scheduled jobs
crontab -r              # delete all scheduled jobs (careful!)
crontab -u alice -l     # view alice's scheduled jobs (root privilege)
```

> ⚠️ **Trap**: `crontab -r` **deletes everything without confirmation**. If you mistakenly hit `-r`, one key away from the `-e` you meant to press, all your schedules vanish. In practice, the habit of backing up first with `crontab -l > backup.txt` is recommended. You must clearly distinguish `-l` (list), `-e` (edit), and `-r` (delete).

## The crontab's 5 Fields — The Heart of Time Notation

- One crontab line = **5 time fields + the command to run**. The order and ranges of these 5 fields are the absolute core of the exam.

```
┌───────────── minute  (0-59)
│ ┌─────────── hour    (0-23)
│ │ ┌───────── day     (1-31)
│ │ │ ┌─────── month   (1-12)
│ │ │ │ ┌───── weekday (0-7, both 0 and 7 are Sunday)
│ │ │ │ │
* * * * *  command_to_run
```

| Position | Field | Range | Notes |
|------|------|------|------|
| 1 | minute | 0-59 | |
| 2 | hour | 0-23 | 24-hour clock |
| 3 | day of month | 1-31 | |
| 4 | month | 1-12 | jan-dec also allowed |
| 5 | day of week | 0-7 | **0 and 7 = Sunday**, 1=Mon … 6=Sat |

- Special characters express patterns.

| Symbol | Meaning | Example |
|------|------|-----|
| `*` | Every value | `* * * * *` = every minute |
| `,` | List | `0,30` = minutes 0 and 30 |
| `-` | Range | `1-5` = 1 to 5 |
| `/` | Step (interval) | `*/10` = every 10 |

- Get used to the patterns through real-world examples.

```bash
# min hour day month weekday  command
  0  3  *  *  *    /backup.sh        # every day at 3:00 a.m.
  30 2  *  *  1    /weekly.sh        # every Monday at 2:30 a.m.
  0  */6 * *  *    /check.sh         # every 6 hours (at 0, 6, 12, 18)
  */10 * * *  *    /poll.sh          # every 10 minutes
  0  0  1  *  *    /monthly.sh       # midnight on the 1st of every month
  0  9  *  *  1-5  /workday.sh       # 9:00 a.m. on weekdays (Mon-Fri)
  15 14 1  *  *    /report.sh        # 14:15 on the 1st of every month
```

The order of the 5 fields is "**minute-hour-day-month-weekday**", from the smaller time unit to the larger (the weekday alone is the exception, placed last). The weekday starts with 0=Sunday and goes to 6=Saturday, and **7 is also accepted as Sunday**. Since it is the 24-hour clock, 2 p.m. is 14. Memorize this order with the mnemonic "min-hour-day-month-weekday".

> ⚠️ **Trap**: If you **specify both** the day (3rd) and the weekday (5th), they work as OR — the job runs if either one matches. For example, `0 0 13 * 5` runs "on the 13th of every month **or** every Friday" (not only on a Friday that is also the 13th), and it is not AND. This OR behavior easily becomes a trap.

**Try it yourself**: Use `crontab -e` to put in the single line `*/2 * * * * date >> ~/crontest.log` and save. The current time accumulates in the file every 2 minutes. After a few minutes, check the accumulation with `cat ~/crontest.log`, and when you're done, delete that line in `crontab -e`. You get to see how the 5 fields actually run.

## System crontab — /etc/crontab and cron.d

- Separately from user crontabs (`crontab -e`), there are places for system-wide schedules — the **`/etc/crontab` file** and the **`/etc/cron.d/` directory**.
- The decisive difference is that **there is one more user field**.
- The reason: a user crontab runs with the registrant's privileges, but a system crontab must **specify which user's privileges to run with**.

```
# /etc/crontab format (6 fields = 5 time fields + user + command)
# min hour day month weekday  user  command
  0  4  *  *  *    root    /usr/local/bin/cleanup.sh
```

| Item | User crontab | System crontab (/etc/crontab) |
|------|----------------|------------------------------|
| How to create | `crontab -e` | Edit the file directly |
| Number of fields | 5 fields + command | 5 fields + **user** + command |
| Run privilege | The user who registered it | The specified user field |
| Storage location | `/var/spool/cron/username` | `/etc/crontab`, `/etc/cron.d/*` |

- There are also fixed **per-interval directories**. You don't write a time; **just put a script in** and it runs automatically.

| Directory | Run interval |
|----------|-----------|
| `/etc/cron.hourly/` | Every hour |
| `/etc/cron.daily/` | Every day |
| `/etc/cron.weekly/` | Every week |
| `/etc/cron.monthly/` | Every month |

The difference that **a user crontab has 5 fields and a system crontab (/etc/crontab, cron.d) has 6 fields (user added)** is a key exam point. `/etc/cron.d/` is a good place for packages to add their own schedules, and it uses the same 6-field format as `/etc/crontab`. Directories like `cron.daily` take scripts without a time (the run time is managed by anacron/the system).

The word cron comes from the Greek 'chronos' (time). It has existed since 1970s Unix, and `anacron` was added for systems that aren't always on, like laptops — cron skips a job if the machine is off at that exact time, but anacron runs it "even right after power-on if N days have passed since the last run". This is why `cron.daily` and the like are tied to anacron.

## Access Control — cron.allow and cron.deny

- Who can use cron is controlled by two files.

| File | Meaning |
|------|------|
| `/etc/cron.allow` | Only the users listed here can use cron (whitelist) |
| `/etc/cron.deny` | Only the users listed here cannot use cron (blacklist) |

- Decision rules:
  - **If `cron.allow` exists, only that list is allowed** and `cron.deny` is ignored.
  - If `cron.allow` does not exist and only `cron.deny` does, **everyone** except the deny list is allowed.
  - If neither exists, usually only root (or everyone, depending on the distribution) is allowed.

The priority is **allow > deny**. The moment an allow file exists it becomes the only criterion and deny loses effect. at is controlled in the same way by `/etc/at.allow` and `/etc/at.deny`.

## Run Just Once — at and batch

- If cron is "recurring", `at` is **"exactly once"**. It runs a command once at the specified time and then disappears from the queue.

```bash
at 17:00                  # input mode for a command to run at 5 p.m.
at> /usr/local/bin/report.sh
at> <end input with Ctrl+D>

at now + 2 hours          # 2 hours from now
at 10:30 tomorrow         # 10:30 a.m. tomorrow
at midnight               # midnight today
echo "/backup.sh" | at 3am  # pass the command via a pipe
```

- There are separate commands for managing at jobs.

| Command | Action |
|------|------|
| `at time` | Register a job to run at that time |
| `atq` (or `at -l`) | List of pending at jobs |
| `atrm number` (or `at -d`) | Delete a pending job |

- **`batch`** is a variant of at. It **doesn't specify a time** and runs automatically when the system load (load average) drops (usually below 0.8).
- Purpose: when you want to run heavy jobs while the CPU is idle.

```bash
batch                     # runs when the system becomes idle
at> /heavy-compute.sh
at> <Ctrl+D>
```

| Category | cron | at | batch |
|------|------|-----|-------|
| Run count | Recurring | Once | Once |
| When it runs | Fixed interval | Specified time | When load is low |
| Daemon | crond | atd | atd |
| Registration | crontab -e | at time | batch |

**cron is recurring, at/batch are one-time**. "Back up every day at dawn" is cron, "one-time inspection tomorrow" is at. at ends its input with `Ctrl+D` (EOF), the list of registered jobs is `atq`, and deletion is `atrm` (`at -l`/`at -d` work the same). The difference from at is that batch runs based on load rather than time.

**Try it yourself**: Run `echo "echo hello > ~/at-test.txt" | at now + 1 minute` and check the pending list with `atq`. If `cat ~/at-test.txt` shows hello a minute later, it worked, and the job disappears from `atq` (confirming it is one-time). To cancel, look up the number with `atq` and run `atrm number`.

## 📖 Glossary

- **crond** : The daemon that wakes up every minute, inspects the schedule list, and runs jobs whose time has come.
- **crontab** : The table holding the schedule list. Handled with `-e` (edit), `-l` (list), `-r` (delete all, no confirmation).
- **5 fields** : Time notation in the order minute-hour-day-month-weekday. Memorize it as "min-hour-day-month-weekday".
- **step (`/`)** : The interval symbol. `*/10` means "every 10".
- **Day/weekday OR rule** : If you fill in both the 3rd (day) and 5th (weekday), the job runs if **either one matches**.
- **System crontab** : `/etc/crontab` and `/etc/cron.d/*`. An **execution user field** follows the 5 time fields, making 6 fields.
- **`/etc/cron.daily/` etc.** : Directories where, if you just put a script with no time, it runs at that interval.
- **anacron** : For systems that aren't always on. It runs jobs cron skipped "even right after power-on".
- **cron.allow / cron.deny** : Usage-permission whitelist / prohibition blacklist. If allow exists, deny is ignored.
- **at** : A one-time schedule that runs exactly once at the specified time and then disappears from the queue. List with `atq`, delete with `atrm`.
- **batch** : A variant of at that runs once **when the system load drops**, not at a given time.
- **atd** : The daemon that handles at and batch jobs. It is separate from crond.

## 📝 Practice Questions

**Question 1.** Which of the following lists the 5 time fields of a crontab correctly from left to right?

A) hour - minute - day - month - weekday

B) minute - hour - day - month - weekday

C) minute - hour - month - day - weekday

D) weekday - minute - hour - day - month

**Answer: B**

Explanation: The crontab 5 fields are in the order "minute (0-59) - hour (0-23) - day (1-31) - month (1-12) - weekday (0-7)". A swaps minute and hour, C swaps day and month, and D is a wrong order with weekday first. Memorize it as "min-hour-day-month-weekday".

---

**Question 2.** When does the crontab entry `30 2 * * 1 /backup.sh` run?

A) Every day at 1:02:30 a.m.

B) Every Monday at 2:30 a.m.

C) On the 1st of every month at 2:30 a.m.

D) Every Sunday at 2:30 a.m.

**Answer: B**

Explanation: The field order is minute (30) - hour (2) - day (*) - month (*) - weekday (1), so it is "every Monday at 2:30 a.m.". A 1 in the weekday field is Monday (0 and 7 = Sunday). A is wrong because cron has no seconds unit and the minute/hour reading is off, C is wrong because it read the day field instead of the weekday, and D confuses it with weekday 0/7 (Sunday).

---

**Question 3.** Which values in the crontab weekday field both represent Sunday?

A) 0 and 7

B) 1 and 8

C) 6 and 7

D) Only 7 is possible

**Answer: A**

Explanation: In cron's weekday field, with a range of 0 to 7, both 0 and 7 mean Sunday, and 1=Monday … 6=Saturday. B (8) is out of range, C's 6 is Saturday, and D misses that 0 is also Sunday. The trap is that Sunday maps to both ends (0 and 7).

---

**Question 4.** What is the run interval of a job scheduled with `*/15 * * * *`?

A) Runs every day at 15:00

B) Runs on the 15th of every month

C) Runs every 15 minutes

D) Runs every 15 seconds

**Answer: C**

Explanation: `*/15` in the first (minute) field means "a 15-minute step", so it runs at minutes 0, 15, 30, and 45 of every hour. A confuses it with the hour field and B with the day field, and D is wrong because cron does not support seconds. `/` is the step symbol for intervals.

---

**Question 5.** What is the biggest format difference between a user crontab (`crontab -e`) and a system crontab (`/etc/crontab`)?

A) The system crontab has no time fields

B) The system crontab adds an execution user field, making 6 fields

C) The user crontab does not support minutes

D) The two formats are exactly the same

**Answer: B**

Explanation: A system crontab (`/etc/crontab`, `/etc/cron.d/*`) has one more "execution user" field after the 5 time fields, making 6 fields (it specifies which user's privileges to run with). A user crontab runs with the registrant's privileges, so it has no user field (5 fields). A and C are not true, and D ignores the user-field difference.

---

**Question 6.** Which of the following is correct about the priority of the cron access control files `/etc/cron.allow` and `/etc/cron.deny`?

A) If cron.allow exists, only that list is allowed and cron.deny is ignored

B) cron.deny always takes precedence over cron.allow

C) If both files exist, cron itself is disabled

D) cron.allow is a blacklist and cron.deny is a whitelist

**Answer: A**

Explanation: If `cron.allow` exists, it becomes the only criterion (whitelist), so only the users on that list are allowed and `cron.deny` is ignored (allow > deny). B has the priority reversed, C is not true, and D swaps the roles of allow (whitelist) and deny (blacklist).

---

**Question 7.** Which of the following is correct about the differences between cron, at, and batch?

A) cron is one-time and at is recurring

B) cron runs recurringly, at runs once at a specified time, and batch runs once when the system load is low

C) batch runs recurringly at a fixed time

D) Both at and batch are handled by the crond daemon

**Answer: B**

Explanation: cron repeats at a fixed interval, at runs once at the specified time, and batch runs once when the system load (load average) drops instead of at a given time. A swaps the nature of cron and at, and C ignores that batch is a one-time, load-based job. D is wrong because at/batch are handled by the atd daemon, not crond.

---
