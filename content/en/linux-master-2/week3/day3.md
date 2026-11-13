# Day 3 - Viewing and Finding Contents

## 📌 Key Takeaways

- Four ways to view contents: **`cat` (all at once) · `less` (page through) · `head` (the beginning) · `tail` (the end)**.
- **`tail -f`** **follows new content appended to the file in real time.** Use it for viewing logs.
- **`find` finds files, and `grep` finds strings inside files.** This distinction is an exam point.
- `find` is written **path first** — `find /etc -name "*.conf"`.
- `wc` counts lines, words, and characters. **`wc -l` is the line count.**

## Viewing File Contents

| Command | What it does | When |
|------|--------|------|
| `cat file` | Prints **all** the contents | Short files |
| `less file` | Page through one screen at a time | **Long files** |
| `more file` | An older version of less. Can't go backward | |
| `head file` | **First 10 lines** | Checking the start of a file |
| `tail file` | **Last 10 lines** | Checking recent logs |
| `wc file` | Line, word, and character counts | Measuring size |

```bash
head -n 5 a.txt      # first 5 lines
tail -n 20 a.txt     # last 20 lines
tail -f /var/log/messages   # follow in real time
wc -l a.txt          # line count only
```

- **The default for `head` and `tail` is 10 lines.** Use `-n` to change the count.
- The `f` in **`tail -f`** stands for follow. Use it to watch a log that keeps growing, and get out with `Ctrl+C`.

### Specifying the Line Count for head · tail, in Four Shapes

| Usage | Meaning |
|---------|-----|
| `head -n 5` / `head -5` | **First 5 lines** |
| `tail -n 5` / `tail -5` | **Last 5 lines** |
| `tail -n +5` | **From line 5 to the end** (with a `+` it is the starting position) |
| `head -n -5` | **Everything except the last 5 lines** |
| `head -c 100` | **First 100 bytes**, not lines |

```bash
head -n 20 a.txt | tail -n 5     # only lines 16-20 (the last 5 of the first 20)
tail -n +2 list.csv              # everything except the first (header) line
tail -f -n 50 /var/log/messages  # show the last 50 lines, then keep following
```

- To pull out a **middle section** of a file, chain `head` and `tail` with a pipe. The first line above is the classic example.
- `tail -f` is **not a command that modifies the file.** It only reads, and prints new lines appended at the end to the screen.

### The Difference Between more and less

| Aspect | `more` | `less` |
|------|--------|--------|
| Navigation | Basically you page **forward** | You can move **freely forward and backward** |
| When you reach the end | It **exits** automatically | It stays until you press `q` |
| Search | `/word` | `/word` (downward) · `?word` (upward) |

- Both are grouped as "commands that show one screen at a time," but the dividing line is that **the one you can scroll back in is `less`**. Depending on the implementation, `more` can also go back one screen with `b` when viewing a file, but the exam asks using this contrast.
- Both are used after a pipe to break up long output — `ls -l /etc | less`.

### Reading wc Output

```text
$ wc /etc/passwd
  42   78 2104 /etc/passwd
   │    │    │
   │    │    └── byte count
   │    └─────── word count
   └──────────── line count
```

| Option | What it counts |
|------|--------|
| `-l` | **Lines** (line) |
| `-w` | **Words** (word) |
| `-c` | **Bytes** |
| `-m` | **Characters** |

- Used with no options, it prints three numbers in the order **lines → words → bytes**. The order shows up in exam questions.
- For a file with only English text, `-c` and `-m` are the same, but **they differ once Korean (Hangul) text is mixed in.** That is because in UTF-8 a single Hangul character is 3 bytes.
- In `/etc/passwd` each line is one account, so `wc -l /etc/passwd` is exactly the **number of accounts**.

### Inside `less`

| Key | What it does |
|----|--------|
| `Space` / `b` | Next / previous screen |
| `/word` | Search forward |
| `n` / `N` | Next / previous search result |
| `G` / `g` | To the very end / to the very start |
| `q` | Quit |

- `man` pages are actually displayed with `less`, so the controls are the same.

### Other Uses of `cat`

```bash
cat a.txt b.txt          # print two files back to back (concatenate)
cat a.txt > b.txt        # save the contents to b.txt (overwrite)
cat -n a.txt             # print with line numbers
```

- `cat` is short for **concatenate**. It is originally a command that prints several files joined together.

```bash
cat > memo.txt           # save what you type on the keyboard to a file. End with Ctrl+D
cat a.txt >> b.txt       # append to the end of b.txt (keeping existing contents)
cat -b a.txt             # number only the non-blank lines
```

- **`>` overwrites and `>>` appends.** Be careful: using the same file for both input and output, like `cat a.txt > a.txt`, empties its contents.
- Typing just `cat` with no arguments waits for keyboard input. It hasn't frozen, so get out with `Ctrl+D` (end of input).

## Finding Files — find

```text
   find  /etc  -name "*.conf"
    │      │        │
    │      │        └── condition
    │      └─────────── where to start looking (required)
    └────────────────── command
```

| Condition | Meaning |
|------|-----|
| `-name "pattern"` | By name (case-sensitive) |
| `-iname` | By name (**ignoring case**) |
| `-type f` / `-type d` | Files only / directories only |
| `-size +10M` | Larger than 10MB |
| `-user name` | By owner |
| `-mtime -7` | Modified within the last 7 days |

```bash
find /home -name "*.txt"        # by name
find / -type d -name "log"      # directories only
find . -size +100M              # larger than 100MB
find /var -mtime -1             # changed within a day
```

- **Always write the path first.** `find -name "*.txt" /home` does not work.
- **Wrap the pattern in quotes.** If you don't, the shell first replaces `*.txt` with the file names in the current directory, and `find` receives unexpected arguments.

### The `+` and `-` in Front of a Number

For conditions that take a number, like `-size` and `-mtime`, **the sign changes the meaning.**

| Notation | Meaning | Example |
|------|-----|-----|
| `+n` | **Greater than** n / **older than** n | `-size +10M` over 10MB, `-mtime +7` modified more than 7 days ago |
| `-n` | **Less than** n / **more recent than** n | `-size -10k` under 10KB, `-mtime -7` modified within the last 7 days |
| `n` | **Exactly** n | `-mtime 7` exactly 7 days ago |

| Time condition | Basis |
|----------|------|
| `-mtime` | Content **modification** time (in days) |
| `-atime` | Last **access** time |
| `-ctime` | **Attribute change** time |
| `-mmin` | Modification time **in minutes** |

- The units for `-size` are **`c` bytes · `k` KB · `M` MB · `G` GB**. They are case-sensitive, so `-size +10m` is an error.

### Combining Conditions and Running a Command on What Was Found

```bash
find /home -name "*.log" -size +1M       # two conditions side by side is AND
find /etc -name "*.conf" -o -name "*.cfg" # -o is OR
find /tmp ! -user root                    # ! is NOT — not owned by root
find /var/log -type f -empty              # files with size 0
find /usr -perm 644                       # exactly permission 644
find . -maxdepth 1 -type d                # descend only one level
```

```bash
find /tmp -name "*.tmp" -mtime +7 -exec rm {} \;
#                                  │      │  │
#                                  │      │  └── end marker for -exec (\ protects the ;)
#                                  │      └───── where the found file name goes
#                                  └──────────── run this command on every file found
```

- **`{}` receives the found file names one at a time**, and **`\;` marks the end of the command**. These two are the fixed pair of `-exec`.
- Before a delete command, it is safer to run it first without `-exec` to **check what gets matched**.
- `find` actually searches the disk, so it is slow. For quickly finding just names, there is **`locate`**, which uses a prebuilt index (refresh the index with `updatedb`).

| Aspect | `find` | `locate` |
|------|--------|----------|
| Method | Searches the disk directly | **Searches a prebuilt DB** |
| Speed | Slow | Fast |
| Freshness | Always accurate | **Can't find files from before the index refresh** |
| Conditions | Name, size, time, owner, permissions, etc. | Mostly **name (path)** |

```text
$ touch /tmp/newfile.txt
$ locate newfile.txt
$ sudo updatedb
$ locate newfile.txt
/tmp/newfile.txt
```

- A file you just created not showing up in `locate` is not a malfunction. The index is usually refreshed automatically **once a day**, and to reflect changes right away, run `updatedb` as root.

There are more "finding" commands, and they get mixed together in exam questions. Tell them apart by **what they look for**.

| Command | What it looks for | Where it looks |
|------|----------|--------|
| `find` | **Files and directories** matching conditions | Everything under the specified path |
| `locate` | **Files** whose names contain a string | A prebuilt index |
| `which` | The location of a **command's executable** | The directories listed in `PATH` |
| `whereis` | A command's executable plus its **manual and source** locations | Fixed standard directories |
| `grep` | **Lines inside** files | The contents of the specified files |

```text
$ whereis ls
ls: /usr/bin/ls /usr/share/man/man1/ls.1.gz
```

## Finding Contents — grep

```bash
grep "root" /etc/passwd          # print lines containing that word
grep -i "ERROR" app.log          # ignore case
grep -n "root" /etc/passwd       # with line numbers
grep -v "root" /etc/passwd       # only lines without that word (inverse)
grep -r "TODO" /home/user        # recursively through subdirectories
grep -c "root" /etc/passwd       # count only
```

| Option | Meaning |
|------|-----|
| `-i` | Ignore case |
| `-n` | Show line numbers |
| `-v` | Lines that **don't match** (invert) |
| `-r` | Through subdirectories |
| `-c` | The **number** of matching lines |
| `-w` | Match whole words |
| `-l` | **File names only** instead of matching lines |
| `-E` | Use extended regular expressions (same as `egrep`) |

```text
$ grep -n "root" /etc/passwd
1:root:x:0:0:root:/root:/bin/bash
10:operator:x:11:0:operator:/root:/sbin/nologin
$ grep -c "root" /etc/passwd
2
$ grep -w "root" /etc/passwd | wc -l
2
$ grep "root" /etc/passwd /etc/group
/etc/passwd:root:x:0:0:root:/root:/bin/bash
/etc/passwd:operator:x:11:0:operator:/root:/sbin/nologin
/etc/group:root:x:0:
```

- `grep` works **line by line**. It prints not just the matching text but the **entire line** that contains it.
- **`-c` is the number of matching "lines".** Even if `root` appears three times on one line, it counts as 1.
- If you give **two or more** files, `file name:` is prepended to each line.
- Don't mix them up with the uppercase options — `-i` is ignore case, `-l` is file names only, and `-v` is the inverse.

### Symbols Used in Patterns

A `grep` pattern is not a simple string but a **regular expression**. You can specify where in the line something sits.

| Symbol | Meaning | Example |
|------|-----|-----|
| `^` | **Start of line** | `grep "^root" /etc/passwd` — lines that **start with** root |
| `$` | **End of line** | `grep "bash$" /etc/passwd` — lines that **end with** bash |
| `.` | Any **single character** | `grep "r..t"` — root, r00t |
| `[ ]` | One of the characters in the brackets | `grep "[0-9]"` — lines containing a digit |
| `^$` | **Blank line** | `grep -v "^$" a.conf` — everything except blank lines |

```bash
grep "bash$" /etc/passwd | wc -l     # number of accounts whose login shell is bash
grep -v "^#" /etc/fstab              # only lines without comments (starting with #)
grep -E "error|fail" app.log         # lines containing error or fail
```

> ⚠️ **The `*` in wildcards and the `*` in regular expressions are different.** In file names `*` means "any string," but in a `grep` pattern `*` means "**zero or more repetitions of the character just before it**." The pattern for `find -name` is a wildcard, and the pattern for `grep` is a regular expression.

> **`find` vs `grep`** — **finding files** by name is `find`, and **finding contents inside** files is `grep`. When a question says "lines that contain a specific string," it is `grep`.

## Chaining Together — Pipes

```bash
ls -l | grep ".txt"          # only .txt from the ls result
cat a.txt | wc -l            # line count of a.txt
ps -ef | grep httpd          # httpd among the running processes
grep "ERROR" app.log | head  # the first 10 of the error lines
```

- **`|` (pipe)** passes the output of the previous command as the input of the next command.
- Each command is simple on its own, but chained together they become powerful — this is the Unix design philosophy.
- **`|` sends to a command, `>` sends to a file.** `ls | wc -l` passes to a command called `wc`, while `ls > wc` ends up creating a **file** named `wc`.
- You can chain as many pipes as you like — `cat /etc/passwd | grep bash | wc -l`.

```text
$ wc -l /etc/passwd
42 /etc/passwd
$ cat /etc/passwd | wc -l
42
```

- When you give a file as an argument, the name is printed too, and when it receives input through a pipe, **only the number** is printed. That is because `wc` was handed just the contents without knowing the file name.

> Tomorrow we will learn the commands for dealing with the people who use the system, that is, users and accounts.

## 📖 Glossary

- **`cat`** : A command that prints file contents joined together. Short for concatenate.
- **`less`** : A pager for viewing long files one screen at a time. `man` is also displayed with it.
- **`tail -f`** : An option that follows and prints content newly added to a file in real time.
- **`find`** : A command that finds the **files themselves** matching conditions on disk.
- **`grep`** : A command that finds lines containing a **string inside** files.
- **`locate`** : A command that quickly finds file names from a prebuilt index.
- **Pipe (`|`)** : A symbol that connects the output of the previous command to the input of the next command.
- **`wc`** : A command that counts lines, words, and characters. `-l` is the line count.

## 📝 Practice Questions

**Question 1.** Which of the following commands is used to keep checking, in real time, content newly written to a file?

A) head -f  
B) cat -f  
C) less -f  
D) tail -f  

**Answer: D**  
Explanation: `tail -f` displays the end of a file and then keeps printing newly added content (follow). It is most widely used to monitor log files in real time, and you get out with `Ctrl+C`. `head` is a command that shows the beginning of a file.

---

**Question 2.** Which of the following commands finds files with the `.conf` extension under the `/etc` directory?

A) grep /etc -name "*.conf"  
B) find /etc -name "*.conf"  
C) find -name "*.conf" /etc  
D) locate -name "*.conf" /etc  

**Answer: B**  
Explanation: `find` takes the path to start searching from first and then the conditions. So the form `find /etc -name "*.conf"` is correct. `grep` is a command that searches file contents, not file names, and `locate` does not accept a path and conditions in this format.

---

**Question 3.** Which of the following commands finds lines containing a specific string inside a file?

A) find  
B) locate  
C) grep  
D) wc  

**Answer: C**  
Explanation: `grep` finds and prints the lines in a file's contents that contain the specified string or pattern. `find` and `locate` are commands that find the files themselves by conditions such as name, size, and time, and `wc` is a command that counts lines, words, and characters.

---

**Question 4.** Which of the following is the result of the command `grep -v "root" /etc/passwd`?

A) Prints the lines that do not contain root  
B) Prints the number of lines that contain root  
C) Prints the lines that contain root along with line numbers  
D) Prints the lines that contain root, ignoring case  

**Answer: A**  
Explanation: `-v` (invert) is an option that prints the lines that do **not** match the condition. Counting only is `-c`, adding line numbers is `-n`, and ignoring case is `-i`.

---

**Question 5.** What is the number of lines that the `head` and `tail` commands print by default, with no options?

A) 5 lines  
B) 10 lines  
C) 20 lines  
D) The whole file  

**Answer: B**  
Explanation: With no options, `head` and `tail` print the first 10 lines and the last 10 lines of a file, respectively. To change the line count, use the `-n` option, as in `head -n 5`. The command that prints the whole file is `cat`.
