# Day 1 - Frequently Tested Command Options: Core Commands for Short-Answer Practical Questions

## 📌 Key Points

- The Level 1 second-round practical exam uses **short-answer questions where you write commands, options, and paths directly into blanks**. Understanding alone is not enough; you need precise memorization.
- Octal permissions are sums of `r=4, w=2, x=1`. You should be able to answer instantly in both directions: `755=rwxr-xr-x`, `644=rw-r--r--`. Recursion is the **uppercase `-R`**.
- `find` searches for **files by condition**, while `grep` searches for **patterns inside content**. find recurses by default so it needs no `-r`; only grep needs `-r`.
- `-mtime +7` means **older than** 7 days, `-7` means **within** 7 days. Memorize the `{} \;` pair in `-exec command {} \;` as a unit.
- Signals: `-15` (TERM, default) is a graceful termination, `-9` (KILL) is a forced termination, `-1` (HUP) re-reads the configuration. **Only 9 and 19 cannot be ignored**.
- Links: `ln` makes a hard link (same inode, not allowed across partitions or for directories), `ln -s` makes a symbolic link (separate inode, breaks if the original is deleted).

## Permission Commands: chmod / chown / chgrp

- Permissions are the highest-weighted topic in the practical exam.
- `chmod` changes permissions, `chown` changes the owner, and `chgrp` changes the group.

```bash
# Octal (absolute mode)
chmod 755 script.sh      # rwxr-xr-x
chmod 644 file.txt       # rw-r--r--
chmod 700 secret/        # rwx------
chmod 600 id_rsa         # rw------- (SSH private key permission)

# Symbolic (relative mode)
chmod u+x script.sh      # add execute permission for the owner
chmod g-w file.txt       # remove write permission from the group
chmod o=r file.txt       # set others to read-only
chmod a+x script.sh      # add execute permission for everyone (all)
chmod ug+rw file.txt     # add read/write for owner and group
```

- Octal values are built by adding `r=4, w=2, x=1`.
- `rwx = 4+2+1 = 7`, `rw- = 4+2 = 6`, `r-x = 4+1 = 5`, `r-- = 4`.
- The three digits stand for **owner (u) / group (g) / others (o)**, in that order.

When you see `chmod 755`, `rwxr-xr-x` should come to mind immediately. 7=rwx (owner), 5=r-x (group), 5=r-x (others). In reverse, when you see `rw-r--r--` you should be able to answer 644.

| Octal | Permission string | Common use |
|-------|-----------|-----------|
| 777 | rwxrwxrwx | (Dangerous) everyone has every permission |
| 755 | rwxr-xr-x | Executables and directories |
| 700 | rwx------ | Private directories |
| 644 | rw-r--r-- | Regular document files |
| 600 | rw------- | SSH private keys, sensitive files |
| 640 | rw-r----- | Group read-only access |

```bash
# Change owner/group
chown user1 file.txt              # change owner only
chown user1:staff file.txt        # change owner and group together
chown :staff file.txt             # change group only (leave the part before the colon empty)
chown -R user1:staff /data        # change recursively, including subdirectories
chgrp staff file.txt              # change group only (dedicated command)
```

The `-R` (uppercase) option means "recursive" for chmod, chown, and chgrp alike. It is required when applying to a whole directory tree. Note that it is **uppercase -R**, not lowercase `-r`.

> ⚠️ **Trap**: The standard separator between owner and group in `chown` is the colon `:`. The dot `.` used to be allowed as well, but the current exam and textbook standard is the colon. `chown user1.staff` is the old style, so `chown user1:staff` is the answer.

## Search Commands: find / grep

- `find` **searches for files by condition**, and `grep` **searches for patterns inside file content**.
- Telling their roles apart is the key point.

```bash
# find: search by name
find /home -name "*.log"          # files whose names end with .log
find /home -iname "readme*"       # case-insensitive search
find / -name "passwd" -type f     # regular files only (-type f)
find /var -type d -name "log"     # directories only (-type d)

# find: time/size conditions
find /tmp -mtime +7               # files modified more than 7 days ago
find /tmp -mtime -1               # files modified within the last 24 hours
find / -size +100M                # files larger than 100MB
find /home -size +1G -type f      # regular files over 1GB

# find: permission/owner conditions
find / -perm 4755                 # files with SetUID set
find /home -user alice            # files owned by alice
find /data -group staff           # files in the staff group

# find: run a command on the results
find /tmp -name "*.tmp" -exec rm {} \;   # find and delete
find /log -name "*.log" -mtime +30 -delete  # delete logs older than 30 days
```

- The sign of `-mtime` is the key.
- `+7` means "**before** 7 days (older)", `-7` means "**within** 7 days (more recent)", and `7` means exactly 7 days ago.

The `-exec` clause of `find` ends in the form `-exec command {} \;`. `{}` is where the found file name goes, and `\;` marks the end of the command. The `{} \;` pair is one set.

```bash
# grep: find patterns in content
grep "error" /var/log/messages    # lines containing error
grep -i "error" log.txt           # ignore case
grep -v "debug" log.txt           # only lines without debug (invert)
grep -n "main" code.c             # print with line numbers
grep -r "TODO" /project           # recursive directory search
grep -c "200" access.log          # count of matching lines
grep -w "root" /etc/passwd        # exact whole-word match
grep -E "cat|dog" file.txt        # extended regex (OR)
grep -l "func" *.py               # print only the names of matching files
```

| Option | Meaning | find vs grep |
|------|------|--------------|
| `-i` | Ignore case | grep (`-i`) / find (`-iname`) |
| `-v` | Invert (non-matching) | grep only |
| `-n` | Print line numbers | grep only |
| `-r`/`-R` | Recursive search | grep only (find is recursive by default) |
| `-c` | Count | grep only |
| `-w` | Whole-word match | grep only |

> ⚠️ **Trap**: `grep -v` selects lines that **do not contain** the pattern. If you remember it backwards, your answer ends up exactly opposite. Also, `find` recurses into subdirectories by default, so it needs no separate `-r` option. It is easy to get confused that only `grep` needs `-r` for recursion.

## Process Commands: ps / kill / top

- Checking process status and terminating processes is the core of the practical task-style questions.

```bash
# ps: process list
ps aux                # all processes of all users (BSD style)
ps -ef                # all processes + parent PID (System V style)
ps -ef | grep nginx   # find a specific process
ps -u alice           # processes of a specific user
ps -p 1234            # process with a specific PID
```

- `ps aux` and `ps -ef` show nearly the same information in different formats.
- `aux` emphasizes CPU and memory usage (%CPU, %MEM), while `-ef` emphasizes PPID (parent process ID) and start time.

```bash
# kill: send signals
kill 1234             # sends the default signal TERM(15) - requests a graceful termination
kill -9 1234          # KILL(9) - forced termination (cannot be ignored)
kill -15 1234         # TERM(15) - graceful termination (same as the default)
kill -1 1234          # HUP(1) - re-read configuration (daemon reload)
kill -SIGKILL 1234    # signal names also work
killall nginx         # terminate all nginx processes by name
pkill -u alice        # terminate all processes of alice
pgrep -l sshd         # print the PIDs of sshd along with the name
```

| Signal | Number | Meaning | Can be ignored? |
|--------|------|------|-----------|
| SIGHUP | 1 | Restart / re-read configuration | Yes |
| SIGINT | 2 | Interrupt (Ctrl+C) | Yes |
| SIGKILL | 9 | Forced termination | **No** |
| SIGTERM | 15 | Graceful termination (default) | Yes |
| SIGSTOP | 19 | Pause | **No** |
| SIGCONT | 18 | Resume after stop | Yes |

`kill -9` (SIGKILL) is a forced termination the process cannot ignore, while `kill -15` (SIGTERM, the default) cleans up and terminates gracefully. To be sure to kill a hung process, use `-9`. To make a daemon just re-read its configuration, use `kill -1` (SIGHUP). Be sure to tell these three apart.

If you give `kill` no signal, the default is 15 (TERM). That is why `kill 1234` and `kill -15 1234` are the same. SIGKILL (9) and SIGSTOP (19) are the only two signals a process cannot catch or ignore.

```bash
# top / priority
top                   # real-time process monitoring (sorted by CPU usage)
nice -n 10 command    # run a command with lowered priority (+10)
renice -n 5 -p 1234   # change the priority of running process 1234
```

## File Commands: ls / ln / Others

```bash
# ls: list
ls -l                 # long format (permissions, owner, size, date)
ls -a                 # include hidden files (starting with .)
ls -al                # the most common combination of the two
ls -lh                # human-readable sizes (K/M/G)
ls -lt                # sort by modification time (newest first)
ls -ltr               # reverse time order (oldest first)
ls -i                 # show inode numbers
ls -ld /dir           # info about the directory itself (not its contents)
ls -R                 # recursive listing including subdirectories
```

- The first character of `ls -l` output indicates the file type.
- `-` (regular), `d` (directory), `l` (symbolic link), `b` (block device), `c` (character device), `p` (pipe), `s` (socket).

```bash
# ln: create links
ln file.txt hardlink         # create a hard link
ln -s file.txt symlink       # create a symbolic (soft) link
ln -s /opt/app/v2 current    # directory symbolic link
```

| Category | Hard link | Symbolic link |
|------|-----------|-------------|
| Option | `ln` (default) | `ln -s` |
| inode | Same as the original | Separate inode |
| When original is deleted | Data remains | Broken link (dangling) |
| Across filesystems | Not possible | Possible |
| Directory links | Not possible | Possible |

A symbolic link requires the `-s` option. Using `ln` alone creates a hard link. A hard link **shares the same inode**, so the data remains even if the original is deleted, whereas a symbolic link only points to a path, so it breaks when the original disappears. The exam also asks about the difference that a hard link **cannot span partitions or point to directories**, while a symbolic link can.

With `ls -i` you can verify that hard links share the same inode number, while a symbolic link has a different number from the original. If the practical exam asks "Which link has the same inode as the original?", the answer is the hard link.

## Try It Yourself

```bash
# 1) Permission practice: create a file and change permissions
touch test.sh
chmod 755 test.sh
ls -l test.sh          # verify -rwxr-xr-x
chmod u-x,go-rx test.sh
ls -l test.sh          # verify -rw------- (600)

# 2) Search practice
find /etc -name "*.conf" -type f | head
grep -n "root" /etc/passwd
grep -c "/bin/bash" /etc/passwd

# 3) Process practice
ps aux | grep $$       # check the PID of the current shell
sleep 300 &            # create a background process
jobs                   # job list
kill %1                # terminate by job number

# 4) Link practice
echo "original" > orig.txt
ln orig.txt hard.txt
ln -s orig.txt soft.txt
ls -li *.txt           # compare inodes
rm orig.txt
cat hard.txt           # still prints
cat soft.txt           # No such file (broken link)
```

## Short-Answer Memorization Cards

| Task | Command/Option |
|------|-----------|
| Set a file to rwxr-xr-x | `chmod 755` |
| Change owner and group together, including subdirectories | `chown -R user:grp target` |
| Find files named *.log | `find path -name "*.log"` |
| Find files older than 7 days | `find path -mtime +7` |
| Find files over 100MB | `find path -size +100M` |
| Print only lines without the pattern | `grep -v pattern file` |
| Search with line numbers | `grep -n pattern file` |
| All processes + PPID | `ps -ef` |
| Force-kill a process | `kill -9 PID` |
| Re-read daemon configuration | `kill -1 PID` or `kill -HUP` |
| Kill processes by name | `killall name` |
| Create a symbolic link | `ln -s original link` |
| Long listing including hidden files | `ls -al` |
| Sort by most recently modified | `ls -lt` |

Don't just read the table; type the commands in a terminal yourself and get used to the output too, so you can write answers without hesitation on short-answer questions. Tomorrow we will drill configuration file paths and key directives in fill-in-the-blank form.

## 📖 Glossary

- **Octal permissions** : A three-digit number made by adding `r=4, w=2, x=1`. The order is owner, group, others.
- **-R (recursive)** : The uppercase option in chmod, chown, and chgrp that applies to an entire directory tree. It is not lowercase `-r`.
- **-iname** : The find option that searches file names case-insensitively. It corresponds to grep's `-i`.
- **-mtime** : find's modification-time condition. `+N` means older than N days, `-N` means within N days.
- **-exec {} \;** : The find clause that runs a command on every file found. `{}` is the file name slot, and `\;` is the end of the command.
- **grep -v** : The invert option that selects only lines that **do not** contain the pattern. If you remember the direction backwards, your answer ends up exactly opposite.
- **PPID** : The ID of the parent process. `ps -ef` shows this value.
- **SIGTERM(15)** : The default termination signal that asks a process to clean up and exit. It can be ignored.
- **SIGKILL(9)** : A forced-termination signal a process cannot catch or ignore. Together with SIGSTOP (19), it is one of only two exceptions.
- **SIGHUP(1)** : A signal telling a daemon to re-read its configuration file.
- **Hard link** : A link that shares the **same inode** as the original. The data remains even if the original is deleted, but it cannot be created across partitions or for directories.
- **Symbolic link** : A link with a separate inode that only points to a path (`ln -s`). It breaks when the original disappears.

## 📝 Practice Questions

**Question 1.** Which chmod command sets a file's permissions to `rwxr-xr-x`?

A) chmod 644 file
B) chmod 755 file
C) chmod 777 file
D) chmod 700 file

**Answer: B**

Explanation: rwx=4+2+1=7, r-x=4+1=5, r-x=5, so it is 755. 644 is rw-r--r--, 777 is rwxrwxrwx, and 700 is rwx------.

---

**Question 2.** Which command changes, in one go, the owner of all files under the directory `/data` to `alice` and the group to `staff`?

A) chown alice.staff /data
B) chown -r alice:staff /data
C) chown -R alice:staff /data
D) chgrp -R alice:staff /data

**Answer: C**

Explanation: The recursive option is uppercase `-R`, and the owner and group are separated by a colon. Lowercase `-r` is not chown's recursive option. `chgrp` changes only the group, so it cannot change the owner as well.

---

**Question 3.** Which command finds files under `/tmp` that were modified more than 7 days ago?

A) find /tmp -mtime -7
B) find /tmp -mtime 7
C) find /tmp -mtime +7
D) find /tmp -atime +7

**Answer: C**

Explanation: `-mtime +7` means files modified longer ago than 7 days (older). `-7` means within 7 days (recent), `7` means exactly 7 days ago, and `-atime` is based on access time.

---

**Question 4.** Which grep option prints only the lines that do **not** contain "error" in the file content?

A) grep -i error file
B) grep -n error file
C) grep -c error file
D) grep -v error file

**Answer: D**

Explanation: `-v` is the invert option and prints lines that do not match the pattern. `-i` ignores case, `-n` prints line numbers, and `-c` counts the matching lines.

---

**Question 5.** Which command forcibly terminates the process with PID 1234 in a way it cannot ignore?

A) kill -1 1234
B) kill -15 1234
C) kill -9 1234
D) kill -HUP 1234

**Answer: C**

Explanation: Signal 9 (SIGKILL) is a forced-termination signal a process can neither catch nor ignore. -1 (HUP) re-reads the configuration, and -15 (TERM) requests a graceful termination (the default).

---

**Question 6.** Which command creates a link that shares the same inode as the original and cannot be created on another partition?

A) ln -s orig link
B) ln orig link
C) ln -h orig link
D) cp -l orig link

**Answer: B**

Explanation: `ln` without options creates a hard link, which shares the same inode as the original. A hard link cannot be created across filesystems or for directories. `-s` is the symbolic link option.

---

**Question 7.** Which is the correct command to send the SIGHUP signal so that a daemon re-reads its configuration file?

A) kill -9 PID
B) kill -1 PID
C) kill -15 PID
D) kill -19 PID

**Answer: B**

Explanation: SIGHUP is signal number 1, and many daemons re-read their configuration file without restarting when they receive it (reload). 9 is KILL, 15 is TERM, and 19 is STOP (pause).

---
