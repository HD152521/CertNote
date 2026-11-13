# Day 4 - Comprehensive Mock Exam 1: Linux General + Operation and Management

## 📌 Key Takeaways

- The real exam has **Part 1: Linux General (50 questions)** and **Part 2: Linux Operation and Management + Linux Usage (80 questions)**.
- Today we review **W1 to W7** as one bundle — Linux General (W1-W3) and Operation and Management (W4-W7). Linux Usage is tomorrow.
- There are four main axes — **permissions (octal, umask, special permissions) · command options · processes · package families**.
- Many questions **ask for values as they are**. Memorizing numbers and file paths earns points.
- The 10 questions below sweep through this range once.

## Exam Structure and Today's Scope

| Category | Part 1 | Part 2 |
|------|-----|-----|
| Subjects | **Linux General** | **Linux Operation and Management + Linux Usage** |
| Weeks in this track | W1-W3 | W4-W7 + W8-W11 |
| Questions · time | 50 questions · 60 minutes | 80 questions · 100 minutes |
| Format | Online exam, four choices | Written, four choices |
| Passing criteria | 60 points or more | 60 points or more, **and a score below 40% in any subject is a fail** |

- The second half of today's scope (W4-W7) is **the first subject of Part 2** on the real exam.
- Part 2 has two subjects, so **doing well in only one will not get you a pass.** If either Operation and Management (today) or Usage (tomorrow) falls below 40%, you fail even if the average is above 60.
- For both exams, time is **a little over one minute per question**. To spend time on permission and umask questions that need calculation, you have to get through the questions that just ask for values quickly.

## Final Checklist — Linux General · Operation and Management

```text
   W1 What is Linux     Torvalds 1991 · GPL · distribution lineages (Red Hat/Debian/Slackware)
                        kernel versions · open-source licenses

   W2 Install and boot  partitions · swap · file systems (ext2/3/4, xfs) · inode
                        boot order BIOS → bootloader (GRUB) → kernel → init/systemd
                        runlevel 3 text · 5 graphical

   W3 Basic commands    pwd cd ls · cp(-r) mv(-r not needed) rm(-r) · ln(-s)
                        cat less head tail(-f) · find (path first) grep (contents) · wc -l
                        /etc/passwd 7 fields · UID 0 root · su vs sudo

   W4 Permissions       rwx = 4/2/1 · 644 file · 755 directory
                        umask is subtracted (base 666 for files · 777 for directories)
                        special permissions 4 SetUID · 2 SetGID · 1 Sticky · /tmp 1777
                        FHS · mount/umount · df (file system) vs du (path) · fsck

   W5 Shell             Bourne (sh ksh bash zsh dash) vs C (csh tcsh)
                        shell variables (set) vs environment variables (env, export) · PATH colon
                        login .bash_profile / non-login .bashrc · source
                        FD 0/1/2 · > >> 2> &> · pipe · alias/unalias · history

   W6 Editor, process   vi 3 modes · dd yy p · :wq :q! · :%s/A/B/g · nano (Ctrl+O)
                        PID 1 systemd · orphan vs zombie · fg/bg/Ctrl+Z
                        ps -ef / ps aux · signal 9 force, 15 default · nice -20 to 19
                        cron 5 fields (min hour day month weekday) · at once

   W7 Software, devices RPM (Red Hat, SUSE) vs DEB (Debian, Ubuntu)
                        low-level rpm/dpkg (no dependencies) vs high-level yum/apt (dependencies)
                        apt update (list) vs upgrade (actual) · tar -c/-x -z/-j/-J
                        block b / character c · udev · CUPS 631 · ALSA · SANE
```

## Value Collection

| Value | What it is |
|-----|------|
| **4 / 2 / 1** | r/w/x, SetUID/SetGID/Sticky |
| **644 / 755 / 1777** | File / directory / `/tmp` |
| **666 / 777** | umask base values (file / directory) |
| **7 / 0** | Number of `/etc/passwd` fields / root's UID |
| **9 / 15** | Force-kill / default termination signal |
| **5** | Number of crontab fields |
| **3 / 5** | Text / graphical runlevel |
| **631** | CUPS port |

## Same Number, Different Meaning

Numbers that did not get confused when memorized week by week get mixed up **once they come together on one exam paper**. Here they are organized in reverse, by number.

| Number | Permissions (W4) | Editor and process (W6) | Install and boot (W2) | Account and shell (W3, W5) |
|-----|---------|-----------------|---------------|---------------|
| **0** | No permission `---` | nice default | Shutdown | root's UID · standard input · `$?` success |
| **1** | `x` · Sticky | **PID 1** (systemd) · SIGHUP | Single-user (recovery) | Standard output |
| **2** | `w` · SetGID | SIGINT (`Ctrl+C`) | — | Standard error |
| **3** | `-wx` | Number of vi modes | **Text** | — |
| **4** | `r` · SetUID | — | Maximum number of MBR primary partitions | Number of `/etc/group` fields |
| **5** | `r-x` | **Number of crontab time fields** | **Graphical** · starting number of logical partitions | — |
| **6** | `rw-` | — | Reboot · number of `/etc/fstab` fields | — |
| **7** | `rwx` | Sunday in the crontab weekday field (same as 0) | — | **Number of `/etc/passwd` fields** |
| **9** | — | **SIGKILL** | — | Number of `/etc/shadow` fields |
| **15** | — | **SIGTERM** (`kill` default) | — | — |

- The pairs that are most often swapped are **5 (crontab) and 7 (passwd)**, **6 (fstab, reboot) and 0 (shutdown)**, and **9 (force) and 15 (default)**.
- Try recalling **everything that involves a 1** at once — PID 1, signal 1 (HUP), runlevel 1 (recovery), FD 1 (standard output), permission 1 (`x`), special permission 1 (Sticky). A question asks about only one of these, but the others are laid out as wrong choices.

## Same Option Letter, Different Meaning

This is the table we collected once in week 3, **widened to cover W4-W7 commands**. Memorizing only the letter gets you wrong answers; you have to memorize it **together with the command**.

| Letter | Meaning per command |
|------|------------|
| **`-r`** | `cp -r`, `rm -r` include subdirectories / `ls -r` reverse order / `userdel -r` also deletes the home directory / `dpkg -r` remove package / **`crontab -r` delete everything** / `uname -r` kernel version |
| **`-l`** | `ls -l` detailed / `wc -l` line count / `fdisk -l`, `crontab -l`, `kill -l`, `dpkg -l` **list** / `usermod -l` rename |
| **`-i`** | `cp -i` confirm before overwriting / `grep -i` ignore case / `rpm -i`, `dpkg -i` **install** / `df -i`, `ls -i` inode |
| **`-e`** | `ps -e` all processes / `rpm -e` **erase** / `crontab -e` **edit** |
| **`-f`** | `rm -f` force / `tail -f` follow / `ps -f` detailed / `tar -f` specify file name |
| **`-a`** | `ls -a` include hidden / `uname -a` everything / `mount -a` all of fstab / `usermod -aG` append |
| **`-u`** | `useradd -u` specify UID / `crontab -u`, `top -u` specify user |
| **`-U`** | `rpm -U` upgrade (uppercase) |
| **`-p`** | `mkdir -p` including intermediate paths / `cp -p` preserve attributes / `renice -p`, `top -p` specify PID |
| **`-h`** | `df -h`, `du -h` human-readable units / the `h` in `rpm -ivh` is the progress display (`#`) |

- **The options for removing differ per command** — `rpm -e`, `dpkg -r` (`-P` to include configuration), `crontab -r`, `userdel`, `atrm`. The single word "delete" maps to five different notations.
- **Listing is generally `-l`.** The exceptions are `rpm -qa` (all installed packages) and `atq`.

## Just Now, or Next Time Too

A passage saying "I ran the command but it disappeared after reboot (or after logging in again)" has the same structure regardless of the week. **A command lasts only for now; it must be written to a file to persist.**

| Just now (command) | Next time too (file) | Week |
|-------------|--------------|------|
| `mount /dev/sdb1 /data` | One line in `/etc/fstab` | W2, W4 |
| `systemctl isolate multi-user.target` | `systemctl set-default multi-user.target` | W2 |
| `init 3` | `/etc/inittab` | W2 |
| `umask 027` | `~/.bashrc` (`/etc/profile` for all users) | W4 |
| `export EDITOR=vi` | `~/.bash_profile` | W5 |
| `alias ll='ls -l'` | `~/.bashrc` | W5 |
| `:set nu` inside vi | `~/.vimrc` | W6 |
| `at 22:00` (runs once and disappears) | `crontab -e` (repeating) | W6 |

- There is a trap in the opposite direction too. **You edited the file but it isn't applied right now** — because configuration files are read at fixed points. Shell settings are re-read with `source`, `/etc/fstab` with `mount -a`, and `/etc/default/grub` requires regenerating `grub.cfg` with `grub2-mkconfig`. Only schedules edited with `crontab -e` take effect as soon as you save.

## Who Can Do It

| Task | Regular user | root |
|---------|----------|------|
| Change permissions of own files (`chmod`) | O | O |
| Change a file's owner (`chown`) | **X** | O |
| Change own password (`passwd`) | O | Can also change others' |
| Create/delete accounts (`useradd`, `userdel`) | X | O |
| Read `/etc/passwd` | O | O |
| Read `/etc/shadow` | **X** | O |
| Send signals to own processes (`kill`) | O | All processes |
| Raise the nice value (yield) | O | O |
| Lower the nice value (specify negative) | **X** | O |
| View another user's crontab (`crontab -u`) | X | O |

- The reason a regular user can change their own password, which modifies `/etc/shadow` that only root can write, is the **SetUID** from week 4. Because `/usr/bin/passwd` is `4755`, it borrows the owner's (root's) privileges only while running. It is the classic case where the permission, account, and special-permission units overlap in a single question.

## Tying Several Weeks Into One Scene

Exam questions come by week, but real work crosses weeks. Following the process of creating one collaboration directory, we point out **which unit each line belongs to**.

```bash
groupadd -g 1500 dev                 # W3  create group → one line in /etc/group
useradd -m -u 1001 -G dev alice      # W3  create account → /etc/passwd, home directory
passwd alice                         # W3  password → /etc/shadow
id alice
# uid=1001(alice) gid=1001(alice) groups=1001(alice),1500(dev)

mkdir /project                       # W3
chgrp dev /project                   # W4  set the owning group to dev
chmod 2770 /project                  # W4  SetGID(2) + rwxrwx---
ls -ld /project
# drwxrws--- 2 root dev 4096 Oct 14 10:00 /project

su - alice                           # W3, W5  switch to a login shell
umask 027                            # W4
touch /project/plan.txt
ls -l /project/plan.txt
# -rw-r----- 1 alice dev 0 Oct 14 10:05 /project/plan.txt
```

| What to read in the output | Why | Unit |
|--------------|------|------|
| `groups=...,1500(dev)` | `-G` is a **supplementary** group. The primary group (`gid=`) is alice, created separately with the same name as the account (default behavior on Red Hat and Debian families) | W3 |
| The `s` in `drwxrws---` | The `x` spot of the group field is `s` → **SetGID** | W4 |
| `plan.txt`'s group is `dev` | It **inherited the directory's group** rather than alice's primary group (alice) | W4 |
| `plan.txt`'s permission `640` | umask 027 was subtracted from the file base 666 | W4 |
| The hyphen in `su -` | The hyphen makes it a **login shell** that reads even alice's `.bash_profile` | W5 |

The process and package units tack on to this.

```bash
crontab -l                           # W6  root's schedule list
# 0 3 * * 0 tar -czf /backup/project.tar.gz /project
```

- The five time fields are **minute 0 · hour 3 · day `*` · month `*` · weekday 0**, so it means "every Sunday at exactly 3 o'clock" (W6).
- `tar -czf` is **`c` bundle · `z` gzip compression · `f` file name**. Without `z`, it only bundles and does not compress (W7).
- Jobs run by cron have no screen. To keep the output and errors in a file, add `>> /var/log/backup.log 2>&1` at the end of the line (W5).

## Judging Right and Wrong

These are sentences mixing several weeks. Decide for yourself first, then look at the right side.

| Sentence | Verdict | Reason |
|------|------|------|
| The seventh field of `/etc/passwd` and the value changed by `chsh -s` are the same thing | ○ | Both are the login shell |
| In `ps -ef`, every process with PPID 1 is a zombie | ✗ | It only means the parent is systemd. A zombie is seen by state `Z` |
| The `-e` in `rpm -e` and `crontab -e` means the same thing | ✗ | Erase versus edit |
| After `apt update` finishes, newer-version packages are installed | ✗ | It only refreshes the list. Installation is `apt upgrade` |
| Runlevel 5 and `graphical.target` point to the same state | ○ | 3 is `multi-user.target` |
| `kill 1234` and `kill -15 1234` are the same command | ○ | The default signal is 15 |
| A file made with `tar -cvf a.tar dir` is compressed | ✗ | It was only bundled. Compression is `-z`, `-j`, `-J` |
| An alias written in `~/.bashrc` can be used in the current shell as soon as it is saved | ✗ | You must run `source ~/.bashrc` |
| `/dev/sda5` on an MBR disk is a logical partition | ○ | Logical partitions always start from 5 |
| `find / -name core 2> /dev/null` removes error messages from the screen | ○ | Channel 2 was sent to the discard location |
| SUSE uses `.rpm`, so it is managed with `yum` | ✗ | The format is RPM, but the tool is `zypper` |
| An executable with `chmod 4755` runs with the permissions of the person who runs it | ✗ | It runs with the **file owner's** permissions |
| The `-i` in `df -i` and `ls -i` both relate to inodes | ○ | inode usage / inode number |
| A file created under umask 000 has permission 777 | ✗ | The file base value is 666, so 666 |

## How to Read Each Question Type

| Type | Marker in the passage | Where mistakes happen |
|------|----------|------------|
| Pick the correct one | "which is correct" | If the first choice looks plausible, you don't read to the end |
| **Pick the incorrect one** | "which is **not** correct", "wrong", "furthest from" | You mark a correct choice as the answer as soon as you see it |
| The odd one out | "different from the other three" | You must first find what the three have in common (shell families, package families, editor types) |
| Order | "the correct order" | Boot order, `./configure → make → make install`, new disk `fdisk → mkfs → mount` |
| Calculation | Four numeric choices | Octal permissions, umask (**files 666, directories 777**), reading crontab |
| Matching | "correctly paired" | Choices with **reversed order** get mixed in, such as `df - du`, low-level - high-level tools |

- For "pick the wrong one" questions, solve them by **writing ○ or ✗ for each choice on the exam paper**. Only one ✗ should remain among the four.
- When an unfamiliar name appears, it is faster to **eliminate the three you know** and keep the remaining one. Most name-classification questions can be solved this way.

## Pre-Exam Check

- [ ] I can convert notation like `rwxr-x--x` to octal the moment I see it
- [ ] When a umask is given, I work out **the directory value first** and then go down to the file value
- [ ] I can state the **order** of the 7 `/etc/passwd` fields (name, x, UID, GID, description, home, shell)
- [ ] I know signals 1, 2, 9, and 15 by **both number and name**
- [ ] I can read one crontab line and spell out "when it runs"
- [ ] I can fill in three boxes each — **distribution, low-level tool, high-level tool** — for the RPM family and the DEB family
- [ ] I can tell which files login shells and non-login shells read
- [ ] In vi, I can type save and quit, quit without saving, and replace everywhere
- [ ] I can state the boot order and the meaning of runlevels 0, 1, 3, 5, and 6
- [ ] I know what each of CUPS, ALSA, and SANE handles

## 📖 Glossary

- **umask** : The value to be cut from the permissions of new files and directories. The base is 666 for files and 777 for directories.
- **Special permissions** : SetUID (4), SetGID (2), Sticky bit (1). The first digit of the four permission digits.
- **Zombie process** : A process that has terminated but remains in the list because its parent has not collected its status.
- **Environment variable** : A variable promoted with `export` that is passed on to child processes.
- **Low-level package tool** : A tool that does not resolve dependencies, such as `rpm` and `dpkg`.
- **File descriptor** : A number attached to an input/output channel. 0, 1, and 2 are standard input, output, and error.

## 📝 Practice Questions

**Question 1.** Which of the following is the license applied when the Linux kernel is distributed?

A) GPL  
B) MIT  
C) Apache License  
D) BSD License  

**Answer: A**  
Explanation: The Linux kernel follows the GNU General Public License, which requires releasing the source under the same terms when you modify and distribute it. MIT and BSD are permissive licenses with weak disclosure obligations, and the Apache License is a separate license that includes a patent clause.

---

**Question 2.** Which of the following is responsible for loading the kernel into memory during the Linux boot process?

A) BIOS  
B) init  
C) Bootloader  
D) Shell  

**Answer: C**  
Explanation: When power is applied, the BIOS or UEFI checks the hardware and then runs the bootloader, and a bootloader such as GRUB loads the kernel into memory. After that, the kernel runs the first process, init or systemd, which brings up the remaining services.

---

**Question 3.** Which of the following is the permission state after running the command `chmod 640 report.txt`?

A) The owner can only read, and the group can read and write  
B) The owner can read and write, the group can only read, and other users cannot access it  
C) All users can read and write  
D) Only the owner can read, write, and execute  

**Answer: B**  
Explanation: Reading 640 one digit at a time gives 6 (rw-), 4 (r--), and 0 (---). So the owner can read and write, the group can only read, and other users have no permissions at all.

---

**Question 4.** With the umask value set to 002, which of the following is the permission of a newly created directory?

A) 664  
B) 755  
C) 777  
D) 775  

**Answer: D**  
Explanation: Subtracting umask 002 from the directory base value 777 gives 775. This setting allows writing for the group as well, so it is used in environments where several users work together. Under the same umask, a file gets 664, which is 666 minus 002.

---

**Question 5.** Which of the following is the command that uses `find` to find files larger than 100MB under `/home`?

A) find /home -size +100M  
B) find -size +100M /home  
C) grep /home -size +100M  
D) find /home +100M  

**Answer: A**  
Explanation: `find` takes the path to start searching from first, followed by the conditions. The size condition is given with the `-size` option, and `+` means larger than that. `grep` is a command for finding file contents, so it does not fit this purpose.

---

**Question 6.** Which of the following is the special permission, and its value, that when set on a directory makes files created inside it inherit the directory's group?

A) SetUID, 4  
B) Sticky bit, 1  
C) SetGID, 2  
D) SetUID, 2  

**Answer: C**  
Explanation: The value of SetGID is 2, and when it is set on a directory, the group of newly created files inside is set to the directory's group rather than the creator's primary group. It is used to keep groups consistent in collaboration directories shared by several users.

---

**Question 7.** Which of the following is the command used last when you have asked a running process to terminate normally but got no response?

A) kill -1 PID  
B) kill -2 PID  
C) kill -15 PID  
D) kill -9 PID  

**Answer: D**  
Explanation: Signal 9, SIGKILL, cannot be ignored by the process, so the kernel removes it immediately. However, since it gets no chance to clean up, data may be corrupted, so you first request a normal termination with the default signal 15, SIGTERM, and use this only when there is no response.

---

**Question 8.** Which of the following is the range symbol specified in the vi editor to replace a string across the whole file?

A) g  
B) %  
C) $  
D) &  

**Answer: B**  
Explanation: `%` is the symbol that specifies the whole file as the target range, and the `g` at the end is the option that replaces every match within each line. Using the two together, `:%s/A/B/g`, is the form that replaces all the strings in the whole document.

---

**Question 9.** Which of the following is the command that installs packages on the Debian family while handling dependencies automatically?

A) apt install  
B) dpkg -i  
C) rpm -ivh  
D) tar -zxvf  

**Answer: A**  
Explanation: `apt` is a high-level tool that uses repositories, so it downloads and installs the required dependency packages as well. `dpkg -i` is in the same Debian family but is a low-level tool that cannot resolve dependencies, `rpm` belongs to the Red Hat family, and `tar` is an extraction command.

---

**Question 10.** Which of the following correctly pairs the command that shows the total capacity and usage rate per file system with the command that shows the total usage of a specific directory?

A) du - df  
B) df - fsck  
C) df - du  
D) fsck - du  

**Answer: C**  
Explanation: `df` shows the total, used, and remaining capacity per mounted file system, while `du` calculates the space a specified path actually occupies and can output just the total with the `-sh` option. `fsck` is the command that checks the integrity of a file system.
