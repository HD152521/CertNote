# Day 5 - Week 3 Review: The Commands on One Page

## 📌 Key Takeaways

- Read a command as **`command [options] [arguments]`**, and **a path starting with `/` is absolute**.
- Tell apart **what needs `-r` (recursive) and what doesn't** — `cp -r` and `rm -r` need it, **`mv` doesn't**.
- **`find` finds files, `grep` finds contents.** This one sentence separates the two commands.
- `/etc/passwd` is **7 colon-separated fields**, **UID 0 = root**, and passwords are in **`/etc/shadow`**.
- **`su` switches users (target's password), `sudo` runs one command (your own password)** — memorize them as a pair.

## The Commands on One Page

```text
  Location      pwd · cd · ls
    │
  Viewing       cat (all) · less (page through) · head (first 10) · tail (last 10) · tail -f (real time)
    │
  Create/delete touch · mkdir (-p) · rmdir (empty only) · rm (-r, -f)
    │
  Copy/move     cp (-r needed) · mv (-r not needed, also renames) · ln (-s symbolic)
    │
  Finding       find (files, path first) · locate (index, fast) · grep (contents)
    │
  Counting/chaining  wc -l · | (pipe)
    │
  Accounts      useradd (-m) · passwd · usermod (-aG) · userdel (-r) · id · su · sudo
```

## Gathering the Meanings of Option Letters

The same letter is used with similar meanings across several commands.

| Letter | Meaning | Where it's used |
|------|-----|----------|
| `-a` | all — everything | `ls -a` (include hidden), `usermod -aG` (append) |
| `-r` / `-R` | recursive — through subdirectories | `cp -r`, `rm -r`, `grep -r`, `ls -R` |
| `-i` | Three meanings ⚠️ | `cp -i` (confirm), `grep -i` (ignore case), `ls -i` (inode) |
| `-l` | long / line | `ls -l` (detailed), `wc -l` (line count) |
| `-n` | number | `head -n` (line count), `grep -n` (line numbers) |
| `-f` | force / follow ⚠️ | `rm -f` (force), `tail -f` (follow) |
| `-p` | parents / preserve ⚠️ | `mkdir -p` (intermediate paths), `cp -p` (preserve attributes) |
| `-v` | invert | `grep -v` (lines that don't match) |

> ⚠️ The ones marked have **different meanings in each command.** `-f` is force in `rm` but follow in `tail`. Spots like these show up as trick questions.

### Options That Split by Case

Even the same letter, uppercase and lowercase are **completely different options**. Some questions give four choices that differ only in case.

| Lowercase | Uppercase |
|--------|--------|
| `ls -r` reverse sort | `ls -R` recursive through subdirectories |
| `ls -a` everything including `.` and `..` | `ls -A` everything except `.` and `..` |
| `ls -s` show block count | `ls -S` sort by size |
| `useradd -g` **primary** group | `useradd -G` **secondary** group |
| `usermod -l` change login name | `usermod -L` lock account |
| `grep -i` ignore case | `grep -E` extended regular expressions |
| `man -k` keyword search (`apropos`) | `man -f` one-line description by name (`whatis`) |

## Practice Reading a Command Line to the End

This week's content comes down to **whether you can read a command by breaking it into chunks**. Try splitting the lines below from the left.

```bash
find /var/log -type f -name "*.log" -mtime -7
```

- `find` the command / `/var/log` the **starting path** / `-type f` files only / `-name "*.log"` whose name ends in `.log` / `-mtime -7` modified **within the last 7 days**.
- Conditions written side by side give only what **satisfies all of them** (AND). The `-` before a number means "more recent than that," and `+` means "older than that."

```bash
grep -v "^#" /etc/fstab | wc -l
```

- `grep -v` lines that **don't** match / `"^#"` that **start with** `#` / `/etc/fstab` in this file / `|` pass that result along / `wc -l` count the lines.
- Read in plain terms, it is "how many lines are not comments?" `^` is the start of a line and `$` is the end of a line.

```bash
cp -rp /home/user/docs /backup/ && ls -ld /backup/docs
```

- `cp -rp` copy the directory through its subdirectories (`-r`), preserving permissions and times (`-p`) / `&&` **if it succeeds** / `ls -ld` look at the detailed info of the directory **itself**.
- Since `/backup` is an existing directory, the result becomes `/backup/docs`.

```bash
sudo useradd -m -g dev -G wheel -s /bin/bash kim
```

- `sudo` just this one command with administrator privileges / `useradd -m` along with a home directory / `-g dev` the **primary** group is dev / `-G wheel` the **secondary** group is wheel / `-s /bin/bash` login shell / `kim` the name of the account to create.
- After running it, a line of the form `kim:x:UID:GID of dev::/home/kim:/bin/bash` appears in `/etc/passwd`. Each option fills one of the seven fields.

## Files and Directories That Appeared This Week

| Path | What | What to remember |
|------|------|----------|
| `/etc/passwd` | Basic account info | **7 fields**, readable by anyone |
| `/etc/shadow` | Encrypted passwords and expiry policy | **9 fields**, only root can read |
| `/etc/group` | Group info | **4 fields**, members separated by commas |
| `/etc/sudoers` | `sudo` permission settings | Edit with **`visudo`** |
| `/etc/skel` | Default files copied into a new home directory | Used by `useradd -m` |
| `/etc/login.defs` | Defaults for UID range and password policy | |
| `/sbin/nologin` | A shell that blocks login | Field ⑦ of system accounts |
| `/home/user` | A regular user's home | `~` |
| `/root` | **root's home** | Different from `/` (the root directory) |

## Separating the "Finding" Commands from the "Asking" Commands

| What you want to know | Command |
|-------------|------|
| **Where are the files** matching conditions | `find path conditions` |
| **Quickly** find by name alone | `locate name` (refresh the index with `updatedb`) |
| **Is that text inside** the file | `grep pattern file` |
| **Where is the executable** of this command | `which command` |
| The executable plus even the **manual location** | `whereis command` |
| Is this name a **builtin or an alias** | `type command` |
| The **usage** of this command | `man command`, `command --help` |
| **What this command is in one line** | `whatis command` |
| **Which command** does this kind of job | `apropos keyword` |
| **Who am I** | `whoami`, `id` |
| **Who is connected** | `who`, `w` |

## What You Must Be Able to Read Right Off the Screen

```text
[root@www ~]# ls -l /etc/passwd /tmp -d
-rw-r--r--.  1 root root 2104 Sep  3 09:00 /etc/passwd
drwxrwxrwt. 12 root root 4096 Sep  3 09:10 /tmp
```

| Slot | How to read it |
|------|--------|
| `root` · `#` in the prompt | Logged in as root. It would be `$` for a regular user |
| `~` in the prompt | The current location is the home directory (`/root`, since it's root) |
| `-` / `d` at the start of the line | Regular file / directory (`l` link, `b` block device, `c` character device) |
| The number `1` / `12` | Hard link count |
| `root root` | Owner / owning group |
| `2104` | Size (bytes). With `-h` it looks like `2.1K` |
| `Sep  3 09:00` | **Last modified time** |

| Key | Result |
|----|------|
| `Ctrl + C` | **Ends** the running command |
| `Ctrl + Z` | **Suspends** the command (it hasn't ended) |
| `Ctrl + D` | Signals the **end of input** / logs out at an empty prompt |
| `Tab` | Auto-complete; press twice for a list of candidates |
| `q` | Quit `man` and `less` |

## Contrasting Easily Confused Pairs

| Comparison | A | B | Deciding criterion |
|------|---|---|-----------|
| `find` vs `grep` | Finds files | Finds **contents** | Is the target a file or a line |
| `find` vs `locate` | Direct search, accurate | Index search, **fast** | Freshness vs speed |
| `cp -r` vs `mv` | Needs `-r` | **Doesn't need `-r`** | How directories are handled |
| `rmdir` vs `rm -r` | **Empty only** | Deletes with contents | Whether it's OK with contents inside |
| `cat` vs `less` | Dumps everything | Pages through | File length |
| `head` vs `tail` | First 10 lines | Last 10 lines | Which end |
| `/etc/passwd` vs `/etc/shadow` | Account info, anyone | **Passwords, root only** | Read permission |
| `su` vs `sudo` | Switch user, target's password | One command, **your own password** | What you enter |
| `su` vs `su -` | Keeps environment | **Switches the environment too** | Presence of the hyphen |
| `usermod -G` vs `-aG` | **Overwrites** | Appends | Preserving existing groups |
| Hard link vs symbolic link | Same inode | Path shortcut | When the original is deleted |

## Commonly Missed Points

1. **You have to add `-r` to `mv`** → No. `mv` simply moves directories too. `-r` is needed for `cp` and `rm`.
2. **`find -name "*.txt" /home`** → The path comes **first**. `find /home -name "*.txt"`.
3. **Adding a group with `usermod -G`** → It wipes out the existing secondary groups. You must use **`-aG`**.
4. **UID 1 is root** → It is **0**.
5. **Deleting a non-empty directory with `rmdir`** → It doesn't work. You must use `rm -r`.
6. **The password is in `/etc/passwd`** → It is in **`/etc/shadow`**. The `x` in passwd is the marker for that.
7. **Your own password for `su`** → It is the **target account's** password. Using your own is `sudo`.
8. **Hidden files are a separate attribute** → No. Their **name just starts with `.`**.

## Values That Appear on the Exam Exactly

| Value | What |
|-----|------|
| **7** | Number of fields in `/etc/passwd` |
| **`:`** | Delimiter of `/etc/passwd` |
| **0** | root's UID |
| **1000** | Where regular user UIDs start (500 on some distributions) |
| **10** | Default line count of `head` and `tail` |
| **`x`** | passwd field 2 — marker that the password is in shadow |

> Next week is about permissions attached to files — we will cover rwx and octal, ownership, and special permissions.

## 📖 Glossary

- **Recursive** : The action of walking through subdirectories. The `-r`/`-R` options.
- **Pager** : A program that breaks long output into screen-sized pieces. `less`, `more`.
- **Pipe (`|`)** : A symbol that passes the output of the previous command as the input of the next command.
- **UID / GID** : Numbers that identify users and groups. UID 0 is root.
- **System account** : An account for running daemons. Its login shell is usually `/sbin/nologin`.
- **Principle of least privilege** : The security principle of giving only as much privilege as needed. It is the reason `sudo` is recommended.

## 📝 Practice Questions

**Question 1.** Which of the following commands does **not** need a recursive option when moving a directory?

A) rm  
B) grep  
C) mv  
D) cp  

**Answer: C**  
Explanation: `mv` needs no separate recursive option even when moving a directory. By contrast, `cp` needs `-r` to copy a directory, and `rm` needs `-r` to delete a directory that has contents. `grep` also uses `-r` to search through subdirectories.

---

**Question 2.** Which of the following commands finds a specific string in the file **contents**, not in file names?

A) grep  
B) find  
C) locate  
D) ls  

**Answer: A**  
Explanation: `grep` examines each line in a file and prints the lines that contain the specified string or pattern. `find` and `locate` are commands that find the files themselves by conditions such as name, size, and time, and `ls` shows the listing of a directory.

---

**Question 3.** Which of the following commands deletes a non-empty directory along with its contents?

A) rmdir docs  
B) rm docs  
C) mv docs /dev/null  
D) rm -r docs  

**Answer: D**  
Explanation: `rmdir` can delete only empty directories, and `rm` cannot delete a directory without options. To delete along with the contents, you must add the recursive option `-r`. `rm -rf` forces deletion without confirmation, so special care is needed.

---

**Question 4.** What does the `x` in the second field of the `/etc/passwd` file mean?

A) The account is locked  
B) The actual password is in `/etc/shadow`  
C) No password has been set  
D) It is an account with administrator privileges  

**Answer: B**  
Explanation: In the past, the encrypted password was placed directly in the second field of `/etc/passwd`. However, because this file is readable by anyone and was therefore vulnerable, the password was separated into `/etc/shadow`, which only root can read, and an `x` was left in its original place.

---

**Question 5.** Which of the following commands switches users while also applying that user's environment variables and working directory?

A) sudo su  
B) su  
C) su -  
D) sudo -u  

**Answer: C**  
Explanation: With just `su`, only the user changes, and the existing environment variables and working directory remain. `su -`, with the hyphen, reads the environment configuration files as if you had freshly logged in as that user, switching the environment variables and home directory as well.

---

**Question 6.** Which of the following commands prints only the first 5 lines of a file?

A) tail -n 5 a.txt  
B) less -5 a.txt  
C) cat -5 a.txt  
D) head -n 5 a.txt  

**Answer: D**  
Explanation: `head` prints the beginning of a file, and the `-n` option specifies the line count. With no option, the default of 10 lines is printed. `tail` conversely shows the end of a file, and `cat` prints the whole thing.
