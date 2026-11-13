# Day 5 - Week 6 Comprehensive Review: Editors and Processes

## 📌 Key Points

- **Only vi has modes.** Command → `i` → insert, `ESC` → command, `:` → ex.
- **`:%s/A/B/g`** — `%` is the whole file, `g` is everything within a line.
- **`ps` is one scene, `top` is real time.** `ps -ef` (System V) / `ps aux` (BSD).
- **Signal 9 is forced, 15 is the default.** For nice, **-20 is the highest**.
- **cron repeats (5 fields), at runs once.**

## Key Points Diagram

```text
   Editors
     Line editors     ed · ex · sed
     Screen editors   vi(Bill Joy) · emacs(Stallman) · nano(pico improvement)
     Only vi has modes

     vi modes    command ──i a o──► insert ──ESC──► command ──:──► ex
     Save/quit   :w  :q  :wq  :q!(force)  ZZ
     Substitute  :%s/A/B/g        % whole file · g everything in a line
     Settings    ~/.vimrc (personal) · /etc/vimrc (global)

   Processes
     PID 1       init → systemd     ancestor of all processes
     Orphan      parent died first → PID 1 adopts it
     Zombie(Z)   ended but parent did not collect → disappears only when the parent is cleaned up

     Foreground ──Ctrl+Z──► stopped ──bg──► background
          ▲                                  │
          └──────────── fg ──────────────────┘

     Signals     1 HUP · 2 INT(Ctrl+C) · 9 KILL(forced) · 15 TERM(default)
     Priority    -20 ◄─ high ── 0 ── low ─► 19

   Scheduling
     cron  repeat  minute hour day month weekday   crontab -e
     at    once    at 22:00
```

## Revisiting It Through Scenes

### vi — Editing One Line of a Configuration File

Follow **which mode you are in** each time you press a key.

```text
   What you press         What happens                              Mode
   ─────────────────────────────────────────────────────────────────────
   vi /etc/hosts          The file opens                            command
   /server1  Enter        Move to the line containing server1       command
   A                      Go to the end of that line and start input insert
    web1                  Characters are entered                    insert
   ESC                    Finish input                              command
   yy  p                  Copy that line and paste it below         command
   :s/web1/web2/  Enter   Change web1 to web2 on the pasted line    ex → command
   :set nu  Enter         Turn on line numbers to check             ex → command
   :wq  Enter             Save and quit                             ex
```

- **The only stretch spent in insert mode is from `A` to `ESC`.** Everything else starts from command mode.
- After `p`, the cursor is on **the newly pasted line**. That is why `:s` without a range changes only that line.
- Search (`/`) and ex commands (`:`) are both entered on the **bottom line of the screen**, and when you press Enter you return to command mode.

### Processes — Cleaning Up an Unresponsive Program

```bash
ps -ef | grep myapp          # ① check the PID and PPID
# user     3100    2314  5 10:10 pts/0    00:05:12 ./myapp
kill 3100                    # ② signal 15 (TERM) first — give it a chance to clean up
ps -p 3100                   # ③ see whether it is still there
kill -9 3100                 # ④ if it remains, signal 9 (KILL)
```

- **15 first, 9 if that does not work.** If you use 9 from the start, data that was being saved can be corrupted.
- If the state in ① was `Z` (`<defunct>`), ② and ④ are useless. You must look at **the PPID (here, 2314) side**.
- To end everything by name at once, use `killall myapp`; to have it merely yield instead of stopping it, use `renice 10 -p 3100`.

### crontab Reading Practice

| Setting | Meaning |
|------|-----|
| `0 3 * * *` | Every day at exactly 3:00 |
| `30 3 * * 1` | Every **Monday** at 3:30 |
| `0 */2 * * *` | On the hour **every 2 hours** |
| `*/15 * * * *` | **Every 15 minutes** |
| `0 9 * * 1-5` | 9:00 on **weekdays** |
| `0 3,15 * * *` | At 3:00 and 15:00 |
| `0 0 1 * *` | Midnight on the 1st of every month |
| `0 0 1 1 *` | Midnight on January 1 |
| `* 3 * * *` | **Every minute** during the 3 o'clock hour — not "once at 3" |

- Point at **minute, hour, day, month, weekday** one field at a time from the left. A field with a number means "only then," and `*` means "every time."
- Look first at **whether the minute field is `*` or `0`**. Most traps are here.

## Which Command for Which Situation

| What you want to do | Command |
|------------|------|
| View all processes once | `ps -ef` or `ps aux` |
| See in real time what uses lots of CPU | `top` |
| Parent-child relationships as a tree | `pstree` |
| Find a PID by name | `pgrep` |
| See the current shell's background jobs | `jobs` |
| Terminate by PID / terminate by name | `kill` / `killall` |
| **Start** with a lower priority | `nice -n 10 command` |
| Change the priority of something **already running** | `renice 10 -p PID` |
| Keep running even after logout | `nohup command &` |
| Resume a stopped job in the background / foreground | `bg` / `fg` |
| Repeat periodically | `crontab -e` |
| Once at a specified time | `at time` |
| List jobs / cancel a job (at) | `atq` / `atrm` |
| List jobs / delete all (cron) | `crontab -l` / `crontab -r` |

## Contrasting Easily Confused Pairs

| Category | A | B | Distinguishing criterion |
|------|---|---|-----------|
| Line vs screen editors | ed, ex | **vi, emacs, nano** | Unit it works on |
| vi vs emacs | **Bill Joy** | Richard Stallman | Creator |
| vi vs nano | **Has modes** | No modes | Can you type right after launch? |
| `i` vs `a` | **Before** the cursor | After the cursor | Insertion position |
| `o` vs `O` | New line **below** | New line above | Case |
| `dd` vs `yy` | Cut | **Copy** | Does the original remain? |
| `:q` vs `:q!` | Refuses if there are changes | **Force quit** | Exclamation mark |
| `%` vs `g` | **Whole file** | Everything in a line | Range vs count |
| `ps` vs `top` | **Prints once** | Refreshes in real time | Whether it refreshes |
| `ps -ef` vs `ps aux` | System V | **BSD** (no hyphen) | Notation style |
| 9 vs 15 | **Forced, cannot be ignored** | Normal termination request (default) | Chance to wrap up |
| `Ctrl+Z` vs `Ctrl+C` | **Stop** | Terminate | Can it be revived? |
| Orphan vs zombie | The **parent** died | The **child** died | Who died first |
| cron vs at | **Repeats** | Once | Number of runs |
| standalone vs inetd | **Resident, fast** | When needed, saves memory | How it waits |

## Commonly Missed Points

1. **Opening vi lets you type right away** → No. It starts in **command mode**.
2. **`:q` can always exit** → It is refused if you made edits. Use **`:q!`**.
3. **`:s/A/B/` replaces everything** → It replaces only **the first one on that line**. For the whole file use **`:%s/A/B/g`**.
4. **emacs and nano also have modes** → They do not. **Only the vi family has modes**.
5. **`ps -aux`** → The BSD style is **`ps aux` without a hyphen**.
6. **`kill` defaults to 9** → It is **15 (TERM)**. 9 must be specified explicitly.
7. **Kill a zombie with `kill -9`** → It is already dead, so that is useless. You must **clean up the parent**.
8. **The larger the nice value, the higher the priority** → It is the **opposite**. **-20 is the highest**.
9. **The first crontab field is hour** → It is **minute**. The order is **minute, hour, day, month, weekday**.
10. **`at` runs repeatedly** → **Only once.** Repeating is `cron`.
11. **`ZZ` is an ex-mode command** → You press it without a colon in **command mode**.
12. **`N` always searches upward** → It is **the opposite of the direction first searched**. If you searched with `?`, it goes downward.
13. **Pressing `r` enters insert mode** → It changes one character and **stays in command mode**.
14. **The program ended with `Ctrl+Z`** → It was only **stopped**. It remains in `jobs` as `Stopped`.
15. **Adding only `nohup` sends it to the background** → No. You must use **`&` together**.
16. **The numbers for `nice` and `renice` mean the same thing** → `nice` is **the amount to add**, and `renice` is **the value itself**.
17. **You give a PID to `killall`** → You give it a **process name**. PIDs go with `kill`.
18. **`crontab -r` deletes one line** → It deletes **everything**. To delete just one line, open with `-e` and edit.
19. **An orphan process is a dead process** → It is **alive and running**. The dead one is the zombie.
20. **`disable = no` turns the service off** → The opposite. It means **enabled**.

## Values That Appear on the Exam as They Are

| Value | What it is |
|-----|------|
| **3** | Number of vi modes |
| **1 / 2 / 9 / 15** | SIGHUP / SIGINT / SIGKILL / SIGTERM |
| **15** | The default signal of `kill` |
| **-20 to 19** | Range of the nice value (default 0) |
| **5** | Number of crontab fields |
| **0 and 7** | Sunday in the crontab weekday field |
| **1** | PID of init / systemd |
| **`Z`** | Zombie state indicator in `ps` |

| Person | What they created |
|------|--------|
| **Bill Joy** | **vi**, csh |
| **Richard Stallman** | **emacs**, GNU |

### Files at a Glance

| File | One-line role |
|------|----------|
| `~/.vimrc` | vim **personal** settings |
| `/etc/vimrc` | vim **global** settings (`/etc/vim/vimrc` on the Debian family) |
| `/etc/crontab` | System crontab — has **one extra user field** after the time fields |
| `/var/spool/cron/` | Where per-user crontabs are stored |
| `/etc/cron.allow` · `/etc/cron.deny` | Permit / forbid use of cron |
| `/etc/at.allow` · `/etc/at.deny` | Permit / forbid use of at |
| `/etc/xinetd.d/` | Per-service configuration files that xinetd handles |
| `nohup.out` | The file where the output of commands run with `nohup` accumulates |

### Save and Quit Keys at a Glance

| Editor | Save | Quit | Quit without saving |
|-------|------|------|-------------|
| **vi** | `:w` | `:q` | `:q!` |
| **emacs** | `Ctrl+X Ctrl+S` | `Ctrl+X Ctrl+C` | Answer no to saving when quitting |
| **nano** | `Ctrl+O` | `Ctrl+X` | `Ctrl+X` then `N` |

> Next week is software and devices. We cover package management such as RPM, YUM, DEB, and APT, plus printers, sound, and scanners.

## 📖 Glossary

- **Mode** : The state by which vi distinguishes input from commands. There are three: command, insert, and ex.
- **Zombie process** : A process that has terminated but remains in the table because the parent has not collected it.
- **Signal** : A notification sent to a process. Delivered with `kill`, and the default is 15.
- **nice value** : Process priority. The smaller, the higher, and the range is -20 to 19.
- **cron / at** : A recurring scheduling tool / a one-time scheduling tool.
- **standalone / inetd** : The method of keeping a daemon resident / the method of launching it on request.

## 📝 Practice Questions

**Question 1.** Which of the following commands copies the line the cursor is on in the vi editor?

A) yy  
B) dd  
C) p  
D) x  

**Answer: A**  
Explanation: `yy` copies the line where the cursor is into the buffer, and the original remains as it is. `dd` is a cut, so the original disappears; `p` is the command that pastes the buffer's contents, and `x` deletes one character.

---

**Question 2.** Which of the following is the signal delivered by default when the `kill` command is used without a signal number?

A) SIGHUP  
B) SIGKILL  
C) SIGTERM  
D) SIGINT  

**Answer: C**  
Explanation: If you omit the number, as in `kill PID`, signal 15, SIGTERM, is delivered, which asks the process to clean up and exit. The correct order is to use signal 9, SIGKILL, which cannot be ignored, only when it does not respond.

---

**Question 3.** Which of the following is a process whose parent terminated first and which is adopted by the PID 1 process?

A) Zombie process  
B) Orphan process  
C) Daemon process  
D) Background process  

**Answer: B**  
Explanation: An orphan process is one that is still running while its parent terminated first, and the PID 1 process becomes its new parent and manages it. Conversely, a zombie process is the case where the child terminated but the parent has not collected its exit status.

---

**Question 4.** Which of the following is the crontab setting that runs a job every day at 3 AM?

A) `3 0 * * *`  
B) `* 3 * * *`  
C) `0 * 3 * *`  
D) `0 3 * * *`  

**Answer: D**  
Explanation: The crontab fields are in the order minute, hour, day, month, weekday, so putting 0 in minute and 3 in hour and leaving the rest as `*` runs it every day at 3 AM. Be careful not to confuse that the first field is minute, not hour.

---

**Question 5.** Which of the following is an editor that has distinct editing modes?

A) vi  
B) nano  
C) emacs  
D) gedit  

**Answer: A**  
Explanation: The editors that distinguish modes are vi and its improved version vim. In command mode you move and delete, in insert mode you type characters, and in ex mode you save and substitute. nano, emacs, and gedit let you type immediately without modes.

---

**Question 6.** Which of the following is the BSD-style `ps` notation that also shows a process's CPU and memory usage?

A) ps -aux  
B) ps -ef  
C) ps -l  
D) ps aux  

**Answer: D**  
Explanation: The BSD style does not put a hyphen before the options, so it is written `ps aux`. This format shows CPU and memory usage together. `ps -ef` is the System V style and prints information centered on UID and PPID.
