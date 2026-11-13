# Day 2 - Working with Directories and Files

## 📌 Key Takeaways

- Three commands for dealing with location: **`pwd` (where am I) · `cd` (move) · `ls` (what's here)**.
- **`ls -a` shows hidden files** and **`ls -l` shows detailed info**. A hidden file in Linux is a file whose **name starts with `.`**.
- **`cp` copies, and `mv` both moves and renames.** There is no separate rename command for `mv`.
- **To handle directories you need `-r` (recursive)** — `cp -r`, `rm -r`.
- **`rm` has no recycle bin.** Once it's deleted, it's gone. `rm -rf` is especially dangerous.

## Where Am I Now

| Command | What it does |
|------|--------|
| `pwd` | Prints the **absolute path of the current directory** (print working directory) |
| `cd path` | Move to that path |
| `cd` or `cd ~` | To the **home directory** |
| `cd ..` | To the parent directory |
| `cd -` | To the directory you were in **just before** |

```bash
pwd            # /home/user
cd /etc        # move using an absolute path
cd ..          # go up to /
cd ~           # return home
```

- `cd` accepts **both absolute and relative paths**. When you are in `/home/user`, `cd docs` and `cd /home/user/docs` go to the same place.
- `cd -` remembers the previous location and goes back to it, which is handy when you work by hopping between two directories.
- Adding a user name after `~` means **that user's home** — `cd ~alice` goes to `/home/alice`.

```text
[user@localhost ~]$ cd /var/log
[user@localhost log]$ cd /etc
[user@localhost etc]$ cd -
/var/log
[user@localhost log]$ pwd
/var/log
```

## What's Here — ls

| Option | Meaning |
|------|-----|
| `-a` | **Include hidden files** (all) |
| `-l` | Detailed info (long) — permissions, owner, size, time |
| `-h` | Human-readable sizes (human) — KB, MB |
| `-t` | Sort **by time** |
| `-r` | Reverse order (reverse) |
| `-R` | **Recursively** through subdirectories |
| `-i` | Show the inode number |

```bash
ls -l          # in detail
ls -la         # in detail, including hidden files
ls -lh         # sizes in KB/MB
ls -ltr        # time order, reversed — most recent file at the bottom
```

A few more options are worth knowing, since they make it easier to tell apart the answer choices on exam questions.

| Option | Meaning |
|------|-----|
| `-d` | Shows **the directory itself, not what's inside it** (`ls -ld /etc`) |
| `-S` | Sort **by size** (largest first) |
| `-F` | Appends a type marker after the name — directory `/`, executable `*`, symbolic link `@` |
| `-A` | Same as `-a` but **leaves out `.` and `..`** |

> ⚠️ **Different case means a different option.** `-r` is reverse, `-R` is recursive. `-a` shows everything including `.` and `..`, while `-A` omits those two. `-s` shows the block count, and `-S` sorts by size.

- A plain `ls` with no options sorts **by name**. `-t` puts **most recently modified first**, `-S` puts **largest first**, and adding `-r` flips each of them.
- The **`.` and `..`** that always appear with `ls -a` are entries pointing to the current directory and the parent directory. Since their names start with `.`, they are hidden too.

### Hidden Files

- In Linux, a hidden file is a file whose **name starts with `.`**. It is not a separate attribute.
- Most configuration files, such as `.bashrc`, `.ssh`, and `.profile`, fall into this category.
- They don't show up with a plain `ls`; you need **`ls -a`** to see them.

### Reading One Line of `ls -l`

```text
   -rw-r--r--  1  user  group  1024  Sep  3 09:00  a.txt
   │        │  │   │      │      │        │          │
   │        │  │   │      │      │        │          └── name
   │        │  │   │      │      │        └───────────── last modified time
   │        │  │   │      │      └────────────────────── size (bytes)
   │        │  │   │      └───────────────────────────── group
   │        │  │   └──────────────────────────────────── owner
   │        │  └──────────────────────────────────────── hard link count
   │        └─────────────────────────────────────────── permissions (details next week)
   └──────────────────────────────────────────────────── file type
```

**The very first character is the file type.**

| Character | Type |
|------|------|
| `-` | Regular file |
| `d` | **Directory** |
| `l` | Symbolic link |
| `b` | Block device (disk) |
| `c` | Character device (keyboard) |

Let's look at how each type appears in real output, all at once.

```text
$ ls -l /dev/sda /dev/tty /etc/passwd /bin /tmp -d
lrwxrwxrwx.  1 root root         7 Sep  3 09:00 /bin -> usr/bin
brw-rw----.  1 root disk    8,   0 Sep  3 09:00 /dev/sda
crw-rw-rw-.  1 root tty     5,   0 Sep  3 09:00 /dev/tty
-rw-r--r--.  1 root root      2104 Sep  3 09:00 /etc/passwd
drwxrwxrwt. 12 root root      4096 Sep  3 09:10 /tmp
```

- A symbolic link has **`-> original`** after its name, and its size is **the number of characters in the path it points to** (`usr/bin` is 7 characters).
- A device file shows two numbers (major number, minor number) in the size column. A directory's size is not the total of the files inside it but **the size of the directory entry itself**.
- The time that `ls -l` shows is the **last modified time (mtime)**. A file carries three timestamps.

| Time | Changes when | How to view |
|------|----------|--------|
| **mtime** (modify) | The file's **contents** are edited | `ls -l` |
| **atime** (access) | The file is **read** | `ls -lu` |
| **ctime** (change) | **Attributes** such as permissions or owner change | `ls -lc` |

> Pitfall: **ctime is not the creation time (create).** It is the time the status changed (change). Editing the contents changes both mtime and ctime, while just running `chmod` changes only ctime.

## Creating and Deleting

| Command | What it does | Note |
|------|--------|------|
| `mkdir name` | Create a directory | Fails if intermediate paths are missing |
| `mkdir -p a/b/c` | Create **intermediate paths too, in one go** | |
| `rmdir name` | Delete a directory | Only works if it is **empty** |
| `rm file` | Delete a file | Cannot be undone |
| `rm -r directory` | Delete a directory **along with its contents** | |
| `rm -f` | Force delete without confirmation | |
| `touch file` | Create an empty file / update timestamps | |

> ⚠️ **`rm -rf` is the most dangerous command in Linux.** With no recycle bin, recovery is practically impossible. It is safer to get in the habit of checking with `ls` first before deleting a path.

If you try it yourself, the error messages show what is required.

```text
$ mkdir project/src/lib
mkdir: cannot create directory 'project/src/lib': No such file or directory
$ mkdir -p project/src/lib
$ touch project/src/lib/a.c
$ rmdir project
rmdir: failed to remove 'project': Directory not empty
$ rm project
rm: cannot remove 'project': Is a directory
$ rm -r project
```

| Option | Meaning |
|------|-----|
| `rm -i` | **Asks one by one** before deleting (interactive) |
| `rm -f` | Doesn't ask, and gives no error even if the file doesn't exist (force) |
| `rm -r` | Directories including their contents (recursive) |
| `rm -v` | Prints the items that were deleted (verbose) |
| `rmdir -p a/b/c` | After removing `c`, **also removes the parent directories** that became empty, in order |

- When `-i` and `-f` are used together, **the one written last wins.** RedHat-family systems often alias `rm` to `rm -i` for root, which is why root gets a confirmation prompt when typing `rm`.
- If the file **doesn't exist, `touch` creates an empty (0-byte) file; if it exists, it leaves the contents alone and just sets the time to now.** You can also specify the time directly with `-t`, like `touch -t 202609031200 a.txt`.

### Wildcards — Pointing at Many Files at Once

| Symbol | What it matches | Example |
|------|-----------|-----|
| `*` | Any string of **zero or more characters** | `*.txt` → `a.txt`, `note.txt` |
| `?` | **Exactly one character** | `a?.txt` → `a1.txt` (not `a10.txt`) |
| `[abc]` | **One** of the characters in the brackets | `[ab].txt` → `a.txt`, `b.txt` |
| `[a-z]` | One character in the range | `file[0-9]` → `file1` |
| `[!abc]` | One character that is **not** in the brackets | `[!a].txt` → `b.txt` |

```bash
ls *.txt             # everything ending in .txt
rm report?.bak       # report1.bak, reportA.bak ...
cp [a-c]*.conf /tmp  # .conf files starting with a, b, or c
```

- Wildcards are **expanded first by the shell, not the command**, turned into a list of file names, and then passed to the command. That is why you can check what gets matched with `ls *` before running `rm *`.
- **`*` does not match hidden files (those starting with `.`).** Even after `rm *`, `.bashrc` remains.

## Copying and Moving

| Command | What it does |
|------|--------|
| `cp source copy` | Copy |
| `cp -r directory target` | **Copy a directory — `-r` is required** |
| `cp -i` | Asks before overwriting |
| `cp -p` | Copies while **preserving** permission and time info |
| `mv source target` | **Move** |
| `mv oldname newname` | **Rename** |

- **A single `mv` serves as both move and rename.** Linux has no dedicated rename command by default.
- Running `mv a.txt b.txt` within the same directory renames it, and giving a different directory as the target moves it.
- **`mv` doesn't need `-r`.** Directories are simply moved.

```bash
cp a.txt b.txt          # copy a file
cp -r docs backup       # copy a directory (error without -r)
mv a.txt /tmp/          # move
mv old.txt new.txt      # rename
```

### The Result Differs When the Target Already Exists

`cp` and `mv` behave differently depending on **whether the last argument is an existing directory**.

| Command | When `backup` **doesn't exist** | When `backup` **is an existing directory** |
|------|---------------------|------------------------------|
| `cp -r docs backup` | A copy of `docs` is created under the name `backup` | It goes **inside** as `backup/docs` |
| `mv docs backup` | `docs` is **renamed** to `backup` | It is **moved** to `backup/docs` |

```bash
cp a.txt b.txt c.txt /tmp/     # with several sources, the last one must be a directory
mv *.log /var/backup/          # move many files at once
```

- If **a file with the same name exists** at the target, it is **overwritten without asking.** Use `-i` to prevent this.

| Option | `cp` | `mv` |
|------|------|------|
| `-i` | Confirm before overwriting | Confirm before overwriting |
| `-f` | Force without asking | Force without asking |
| `-v` | Print what was processed | Print what was processed |
| `-u` | Copy **only when the source is newer** | Move only when the source is newer |
| `-b` | Keep a **backup** of the file being overwritten | Keep a backup of the file being overwritten |
| `-r` / `-R` | Directories including subdirectories | (not needed) |
| `-p` | **Preserve** permissions, owner, and time | (a move preserves them already) |
| `-a` | A **backup-oriented** option: `-r` plus preserving attributes and links | — |

> **The fundamental difference between `cp` and `mv`.** `cp` **creates a new file** — so the copy's owner becomes the person who copied it and its time becomes now (use `-p` to keep the original's). Within the same file system, `mv` doesn't move the data; it **just re-attaches the name tag.** Because the inode stays the same, even a large directory moves instantly, which is why `-r` isn't needed.

## Links

| Kind | Command | Nature |
|------|------|------|
| **Hard link** | `ln source link` | Points to the same **inode**. The data survives even if the original is deleted |
| **Symbolic link** | `ln -s source link` | A **shortcut** that points to a path. It breaks if the original is deleted |

- A symbolic link shows **`l`** as the first character in `ls -l` and appears in the form `link -> original`.
- A hard link **cannot be made across different file systems, and cannot be made to a directory.**

A file name is really **a name tag attached to a number called an inode**. The actual data, along with permission, owner, and size information, is held by the inode. The difference between the two kinds of links comes from this.

```text
$ echo hello > a.txt
$ ln a.txt hard.txt
$ ln -s a.txt soft.txt
$ ls -li
131075 -rw-r--r--. 2 user user 6 Sep  3 09:00 a.txt
131075 -rw-r--r--. 2 user user 6 Sep  3 09:00 hard.txt
131090 lrwxrwxrwx. 1 user user 5 Sep  3 09:01 soft.txt -> a.txt
$ rm a.txt
$ cat hard.txt
hello
$ cat soft.txt
cat: soft.txt: No such file or directory
```

- `a.txt` and `hard.txt` have the **same inode number and a link count of 2**. They are not an original and a copy but **two equal names for the same file**.
- `rm` removes one name tag. The data is erased only when **the link count reaches 0**, so even after deleting `a.txt`, you can still read the contents through `hard.txt`.
- `soft.txt` has its own inode, and its content is only the **path text** `a.txt`. When the original disappears, it becomes a **broken link** with nothing to point to.

| Comparison | Hard link | Symbolic link |
|------|----------|-----------|
| inode | **Same** as the original | Has **its own** |
| First character of `ls -l` | `-` (indistinguishable from a regular file) | **`l`** |
| When the original is deleted | Contents **survive** | It **breaks** |
| Across file systems | Not possible | **Possible** |
| Directory target | Not possible | **Possible** |
| Size | Same as the original | Number of characters in the path it points to |

> Tomorrow we will learn the commands for looking inside files and finding what you want.

## 📖 Glossary

- **Working directory** : The directory the shell is currently in. Check it with `pwd`.
- **Hidden file** : A file whose name starts with `.`. Visible only with `ls -a`.
- **Recursive (`-r`)** : An option that walks through subdirectories as well. Needed to handle directories with `cp` and `rm`.
- **Hard link** : Another name that points to the same inode.
- **Symbolic link** : A shortcut file that holds the path of another file. Created with `ln -s`.
- **`touch`** : A command that creates an empty file or updates the time info of an existing file.
- **`mkdir -p`** : An option that also creates intermediate paths if they are missing.

## 📝 Practice Questions

**Question 1.** Which of the following options is used to list files including hidden files?

A) ls -l  
B) ls -h  
C) ls -a  
D) ls -t  

**Answer: C**  
Explanation: In Linux, a hidden file is a file whose name starts with `.`, and it shows up in the listing only when you give the `-a` (all) option. `-l` is detailed info, `-h` is readable size units, and `-t` is sort by time.

---

**Question 2.** Which of the following options is absolutely required to copy an entire directory?

A) cp -i  
B) cp -r  
C) cp -p  
D) cp -f  

**Answer: B**  
Explanation: `cp` copies only files by default, so copying a directory requires the recursive option `-r` (or `-R`). `-i` is confirm before overwriting, `-p` preserves permissions and time info, and `-f` is force. For reference, `mv` doesn't need `-r` when moving a directory.

---

**Question 3.** Which of the following commands is used to rename a file?

A) mv  
B) rename  
C) cp  
D) touch  

**Answer: A**  
Explanation: Linux has no dedicated rename command by default, and `mv` serves as both move and rename. Used within the same directory like `mv old.txt new.txt`, it renames the file, and specifying a different directory as the target makes it a move.

---

**Question 4.** What does it mean when the first character of an `ls -l` result is `d`?

A) Symbolic link  
B) Block device file  
C) Regular file  
D) Directory  

**Answer: D**  
Explanation: The first character of `ls -l` shows the file type. `-` is a regular file, `d` is a directory, `l` is a symbolic link, `b` is a block device, and `c` is a character device.

---

**Question 5.** Which of the following commands is used to create several levels of directories at once?

A) mkdir -a project/src/lib  
B) mkdir -p project/src/lib  
C) mkdir -r project/src/lib  
D) rmdir -p project/src/lib  

**Answer: B**  
Explanation: By default, `mkdir` gives an error if an intermediate path doesn't exist. With the `-p` (parents) option, it creates the missing parent directories too. `rmdir` is a command that deletes directories, and even then it works only when the directory is empty.
