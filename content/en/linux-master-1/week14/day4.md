# Day 4 - Secondary Practical Exam Mock: Short-Answer and Hands-On Drills

## 📌 Key Points

- For Level 1, you must pass the **secondary practical exam** after passing the primary written exam to get the final pass. The secondary exam has **short-answer and hands-on tasks** that you must write out yourself.
- Unlike the written exam, where you "choose," this is an exam where you "write," so **exact spelling and options** are your score. Practice in multiple-choice form, but you also need to drill writing by hand.
- The hands-on tasks revolve around 6 areas — accounts and permissions, text processing, disks and mounting, scheduling, network and service configuration, systemctl.
- The distinction between **"now" and "permanent"** is the number one cause of lost points — `mount` vs `/etc/fstab`, `start` vs `enable`, firewall-cmd without `--permanent`.
- For permission calculation, rwx=7, rw-=6, r-x=5, r--=4, and the special permissions (SetUID 4, SetGID 2, Sticky 1) are added as the leading digit.
- The **space before the parenthesis** in `/etc/exports` and the **spaces around `=`** in shell variable assignment are classic point-losing traps on the practical exam.

## Hands-On Key 1: User and Permission Management Commands

- Get the account and permission commands tested in the practical exam into your fingers.

| Task | Command |
|------|------|
| Add a user | `useradd -m -s /bin/bash name` |
| Set a password | `passwd name` |
| Modify a user | `usermod -G group name` |
| Delete a user | `userdel -r name` (including home) |
| Add a group | `groupadd group` |
| Change permissions | `chmod 755 file` |
| Change owner | `chown user:group file` |
| Special permission | `chmod u+s` (SetUID) |

**Practical exam points**: Get `useradd`'s `-m` (create home), `-s` (specify shell), `-G` (supplementary group), and `-u` (UID) exactly right. The `-r` in `userdel -r` deletes the home directory and mail spool too.

## Hands-On Key 2: File Search and Text Processing

- `find`, `grep`, `awk`, and `sed` are the core tools of the practical hands-on tasks.

| Command | Purpose | Example |
|------|------|------|
| `find` | File search | `find / -name "*.log" -type f` |
| `grep` | Pattern search | `grep -rn "error" /var/log` |
| `awk` | Field processing | `awk '{print $1}' file` |
| `sed` | Stream editing | `sed 's/old/new/g' file` |
| `sort`/`uniq` | Sorting and duplicates | `sort file | uniq -c` |
| `wc` | Counting | `wc -l file` |

**find options in focus**: `-name` (name), `-type f/d` (file/directory), `-mtime +7` (modified more than 7 days ago), `-size +100M` (size), `-perm` (permissions), `-exec ... {} \;` (execute). On the practical exam, you use the `-exec rm {} \;` form.

## Hands-On Key 3: Disk and Mount Scenarios

- The whole flow of adding a disk → partition → format → mount → register in fstab is asked.

```
fdisk /dev/sdb        # create a partition
mkfs.ext4 /dev/sdb1   # create a filesystem
mkdir /data           # mount point
mount /dev/sdb1 /data # temporary mount
# register permanently in /etc/fstab:
# /dev/sdb1  /data  ext4  defaults  0  0
```

> ⚠️ **Practical exam trap**: A temporary mount (`mount`) disappears on reboot. **For a permanent mount, you must register it in `/etc/fstab`**. You must write the 6 fstab fields (device, mount point, type, options, dump, fsck order) exactly to avoid losing points.

## Hands-On Key 4: Processes and Job Scheduling

- This covers cron, at, and process control.

| Task | Command/Format |
|------|-----------|
| Register a recurring job | `crontab -e` |
| cron format | `minute hour day month weekday command` |
| One-time scheduling | `at time` |
| Check processes | `ps -ef | grep name` |
| Force kill | `kill -9 PID` |
| Kill by name | `killall process-name` |

- cron field example: `0 3 * * 1 /backup.sh` = runs every Monday at 03:00.

**cron field order**: minute (0-59) hour (0-23) day (1-31) month (1-12) weekday (0-7, 0 and 7 = Sunday). `*` means every time, `*/10` means every 10 units, `1-5` is a range, and `1,15` is a list.

## Hands-On Key 5: Network and Service Configuration Scenarios

- You are made to write the key entries of service configuration files yourself.

| Service | Configuration File | Key Entries |
|--------|-----------|-----------|
| Network | `/etc/sysconfig/network-scripts/ifcfg-*` | IPADDR, NETMASK, GATEWAY |
| DNS client | `/etc/resolv.conf` | nameserver |
| Hostname | `/etc/hostname` | hostname |
| SSH | `/etc/ssh/sshd_config` | Port, PermitRootLogin |
| Firewall | `firewall-cmd` | --add-port, --permanent |

**Firewall on the practical exam**: To open a port permanently, run `firewall-cmd --permanent --add-port=80/tcp` and then `firewall-cmd --reload`. Without `--permanent`, it disappears on reboot.

## Hands-On Key 6: Service Management (systemctl)

- The systemd service control commands are essential for the practical exam.

| Task | Command |
|------|------|
| Start | `systemctl start service` |
| Stop | `systemctl stop service` |
| Restart | `systemctl restart service` |
| Reload configuration | `systemctl reload service` |
| Enable at boot | `systemctl enable service` |
| Check status | `systemctl status service` |

> ⚠️ **enable vs start**: `start` starts it **now**, and `enable` starts it **automatically at boot**. They are separate, so if you need both, use `systemctl enable --now service`.

## Hands-On Key 7: Log Analysis Scenarios

- Reading logs and finding the cause when diagnosing a failure also appears on the practical exam.

| Log | Path | Purpose |
|------|------|------|
| General system | `/var/log/messages` | General kernel and service messages |
| Authentication/security | `/var/log/secure` | Login and sudo records |
| Boot | `/var/log/boot.log` | Boot messages |
| Mail | `/var/log/maillog` | Mail sending and receiving |

- For real-time monitoring, use `tail -f /var/log/messages`; to extract a specific pattern, use `grep "Failed" /var/log/secure`.

**journalctl on the practical exam**: In a systemd environment, you also use `journalctl -u service-name` (logs for a specific service), `journalctl -b` (this boot), and `journalctl -f` (real-time).

## Hands-On Key 8: Shell Scripting Basics

- Writing and interpreting simple scripts can come up as a hands-on task.

| Element | Syntax |
|------|------|
| Shebang | `#!/bin/bash` |
| Variable | `VAR=value` (no spaces) |
| Conditional | `if [ condition ]; then ... fi` |
| Loop | `for i in list; do ... done` |
| Arguments | `$1 $2 ... $#` (count) `$@` (all) |

**Test operators**: `-f` (file exists), `-d` (directory), `-z` (empty string), `-eq/-ne/-lt/-gt` (numeric comparison). Spaces on both sides inside `[ ]` are mandatory.

**Variable assignment trap**: Putting spaces around `=`, as in `VAR = value`, causes an error. Always write it joined, as `VAR=value`. Reference it with `$VAR` or `${VAR}`.

## Hands-On Key 9: Permission Scenarios Roundup

- Compound permission problems require you to calculate the chmod numbers yourself.

| Requirement | Number | Command |
|------|------|------|
| Owner full, group and others read and execute | 755 | `chmod 755` |
| Owner read and write, others read | 644 | `chmod 644` |
| SetUID + 755 | 4755 | `chmod 4755` |
| Sticky + 777 | 1777 | `chmod 1777` |

**Calculation in one line**: rwx=7, rw-=6, r-x=5, r--=4. Special permissions are added as the leading digit of the 4 digits (SetUID 4, SetGID 2, Sticky 1). The permission of `/tmp` is 1777 (Sticky+777).

## Hands-On Key 10: Writing Service Configuration Files Directly

- On the practical exam, you are made to fill in specific lines of a configuration file yourself.
- Get the short snippets into your fingers.
- NFS share (`/etc/exports`)
```
/srv/share  192.168.1.0/24(rw,sync,no_subtree_check)
```

- Samba share (`/etc/samba/smb.conf`)
```
[data]
   path = /srv/data
   writable = yes
   valid users = @staff
```

- cron registration (`crontab -e`)
```
30 2 * * * /usr/local/bin/backup.sh
```

**The exports whitespace trap**: You must not put a space between `client(options)`. If you separate them as in `192.168.1.0/24 (rw)`, rw is opened to all hosts. The number one point-loser on the practical exam.

## Hands-On Key 11: Command Combinations and Pipes

- Hands-on tasks often require **pipe and redirection combinations** rather than a single command.

| Symbol | Meaning |
|------|------|
| `|` | Previous output → next input |
| `>` | Overwrite output |
| `>>` | Append output |
| `2>` | Redirect standard error |
| `&&` | Run the next if the previous succeeded |
| `;` | Run sequentially (regardless of success) |

- Example: `ps -ef | grep nginx | grep -v grep | awk '{print $2}'` — extracts only nginx's PID.

**Combination examples**: `du -sh * | sort -rh | head` (largest first), `cat access.log | grep 404 | wc -l` (count of 404s). The mindset of chaining filters with pipes is the core of the practical exam.

## Hands-On Key 12: Boot and Recovery Scenarios

- Failure recovery is a high-difficulty hands-on task. Let's summarize the key situations.

| Situation | Response |
|------|------|
| Lost root password | Enter `rescue`/single mode from GRUB, then `passwd` |
| Boot failure due to an fstab error | Fix fstab in emergency mode |
| Service fails to start | Trace the cause with `systemctl status` and `journalctl -xe` |
| Disk full | Find large files with `du` and clean up, rotate logs |

**Single-user mode**: If you enter by adding `single` or `rd.break` to the kernel line in the GRUB menu, you can do recovery work with root privileges. This is the standard procedure for password recovery.

You need to practice spelling and options repeatedly by hand. Check yourself with the mock exam below.

## 📖 Glossary

- **Short-answer / hands-on** : A type where you write out a command, option, or path briefly / a type where you work through a scenario as a command procedure.
- **`useradd -m -s`** : The option combination that creates an account by making a home directory (`-m`) and specifying a login shell (`-s`).
- **`userdel -r`** : An option that deletes the home directory and mailbox along with the account.
- **`-exec {} \;`** : The syntax by which find runs a command for each file found. `{}` stands in for the file name.
- **Permanent mount** : A mount registered in `/etc/fstab` that persists after reboot. If you only run `mount`, it is temporary.
- **fstab 6 fields** : device, mount point, type, options, dump, fsck order.
- **`enable` vs `start`** : Register to start automatically at boot / start immediately now. If you need both, use `enable --now`.
- **`--permanent` + `--reload`** : The two steps that save a firewalld setting permanently and apply it to the current session.
- **journalctl** : The command for viewing the logs that systemd collects. `-u` (service), `-b` (this boot), `-f` (real-time).
- **Special permission digit** : The leading digit of the four chmod digits. You add SetUID 4, SetGID 2, and Sticky 1 (`/tmp` is 1777).
- **exports whitespace trap** : An NFS syntax trap in which separating the client and the parenthesis opens permissions to all hosts.
- **Pipe (`|`)** : A connection that passes the previous command's output as the next command's input. The mindset of chaining filters is the core of the practical exam.
- **Single-user mode** : A recovery mode entered from GRUB with `single` or `rd.break`. It is the standard procedure for resetting the root password.

## 📝 Practice Questions

**Question 1.** Which command correctly creates the user 'kim' with a home directory and sets the login shell to bash?

A) `useradd kim`
B) `useradd -m -s /bin/bash kim`
C) `usermod -m kim`
D) `adduser -s kim`

**Answer: B**
Explanation: `-m` creates the home directory, and `-s /bin/bash` specifies the login shell. Depending on the distribution, a bare `useradd kim` may not create a home or may apply the default shell.

---

**Question 2.** Which command recursively searches for the string "error" under `/var/log` with line numbers?

A) `grep error /var/log`
B) `grep -rn "error" /var/log`
C) `find /var/log -name error`
D) `awk '/error/' /var/log`

**Answer: B**
Explanation: `-r` searches directories recursively, and `-n` prints line numbers. `grep error /var/log` doesn't work without the recursive option because it's a directory.

---

**Question 3.** Which file must you register the added disk partition `/dev/sdb1` in so that it is automatically mounted at `/data` even after a reboot?

A) `/etc/mtab`
B) `/etc/fstab`
C) `/etc/exports`
D) `/proc/mounts`

**Answer: B**
Explanation: A permanent mount is registered in `/etc/fstab`. The `mount` command alone is temporary and is released on reboot. `/etc/exports` is the NFS share configuration.

---

**Question 4.** Which crontab entry runs `/backup.sh` every Monday at 3 AM?

A) `0 3 * * 1 /backup.sh`
B) `3 0 1 * * /backup.sh`
C) `* * 1 3 0 /backup.sh`
D) `0 3 1 * * /backup.sh`

**Answer: A**
Explanation: The cron fields are in the order minute hour day month weekday. `0 3 * * 1` means minute 0, hour 3, every day, every month, weekday 1 (Monday). D means 3 AM on the 1st of every month, so it is wrong.

---

**Question 5.** Which is the correct procedure for permanently opening port 80/tcp in firewalld so that it persists after reboot?

A) Run only `firewall-cmd --add-port=80/tcp`
B) `firewall-cmd --permanent --add-port=80/tcp` followed by `firewall-cmd --reload`
C) `iptables -A INPUT -p tcp --dport 80`
D) Run only `systemctl restart firewalld`

**Answer: B**
Explanation: You must add the permanent rule with `--permanent` and then apply it to the runtime with `--reload`. A rule without `--permanent` disappears on reboot.

---

**Question 6.** Which command starts the httpd service now and also sets it to run automatically at boot, all at once?

A) `systemctl start httpd`
B) `systemctl enable httpd`
C) `systemctl enable --now httpd`
D) `systemctl reload httpd`

**Answer: C**
Explanation: `enable --now` handles both immediate start (start) and automatic start at boot (enable) at the same time. With start alone, it goes off after reboot; with enable alone, it doesn't start right now.

---

**Question 7.** Which command uses `find` to locate and delete files under `/tmp` that have not been modified for more than 7 days?

A) `find /tmp -mtime 7 -delete`
B) `find /tmp -mtime +7 -exec rm {} \;`
C) `find /tmp -atime -7 -rm`
D) `rm -rf /tmp/*7*`

**Answer: B**
Explanation: `-mtime +7` means files modified more than 7 days ago, and `-exec rm {} \;` runs rm on each result. `-mtime 7` (no sign) means exactly 7 days ago, so it has a different meaning.

---

**Question 8.** Which sed command replaces every "old" with "new" in a text file and prints the result?

A) `sed 's/old/new/' file`
B) `sed 's/old/new/g' file`
C) `sed 'old/new' file`
D) `awk 's/old/new/g' file`

**Answer: B**
Explanation: In `s/old/new/g`, the trailing `g` (global) replaces every match on a line. Without `g`, only the first match on each line is changed.

---

**Question 9.** Which command terminates all running 'nginx' processes at once by name?

A) `kill nginx`
B) `kill -9 nginx`
C) `killall nginx`
D) `pkill -l nginx`

**Answer: C**
Explanation: `killall process-name` sends the signal to every process with that name. `kill` takes a PID as its argument, so it doesn't work by name.

---

**Question 10.** Which command correctly adds the SetUID permission to the file `report.sh`?

A) `chmod u+s report.sh`
B) `chmod o+t report.sh`
C) `chmod g+s report.sh`
D) `chown +s report.sh`

**Answer: A**
Explanation: `u+s` grants SetUID on the owner's execute permission. `g+s` is SetGID and `o+t` is the Sticky Bit. You must tell SetUID/SetGID/Sticky apart exactly.

---
