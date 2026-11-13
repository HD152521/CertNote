# Day 1 - File and Directory Commands: Handling the Linux File System at Your Fingertips

## 📌 Key Takeaways

- There are two kinds of paths: an **absolute path** (starts from `/`, points to the same place wherever you type it) and a **relative path** (based on your current location).
- Directory handling uses different options — `cp` requires `-r`, `mv` doesn't, `rmdir` removes **only empty ones**, and to delete the contents too you need `rm -r`.
- `find` searches the disk in real time, so it is accurate; `locate` queries a database, so it is fast but can't find a file you just created.
- With `-exec`, `\;` runs the command once per file, while `+` batches many files into one run — `+` is much faster for bulk processing.
- `type` is the most accurate way to tell what a command really is (builtin/alias/external). `which` only looks at executables inside PATH.

**A command = a program.** Commands you type such as `ls` and `cp` are actually executable files that live in `/bin` or `/usr/bin`. The shell looks for the name you typed in the directories registered in the `PATH` environment variable and runs it. In other words, a command is not magic — it is just a program stored on disk.

## Understanding Paths: Absolute and Relative

- The Linux file system is a huge **inverted tree** that starts at the top-level root `/`. Every file and directory sits somewhere in this tree, and the expression of that location is the path.
- **Absolute path**: spells out everything from the root `/`. `/home/user/docs/report.txt` is always the same file no matter where you type it.
- **Relative path**: based on the current working directory.

| Symbol | Meaning |
|------|------|
| `.` | The current directory |
| `..` | The parent (upper) directory |
| `~` | The current user's home directory |
| `~user` | The home directory of a specific user (user) |
| `-` | The directory you were in just before (used with `cd -`) |

- Example: when your current location is `/home/user/docs`, `../photos` → `/home/user/photos`, and `./report.txt` → `/home/user/docs/report.txt`.

**What `.` and `..` really are.** `.` and `..` are not just conventions; they are **hard links** that actually exist in every directory. When you run `ls -a`, these two entries show up as real directory entries. That is why even an empty directory has a link count of 2: one `.` pointing to itself, plus one entry in the parent directory pointing to it, add up to 2.

## Finding Your Location: pwd and cd

- `pwd` (print working directory): prints where you are now.
- `cd` (change directory): moves you to another location.

```bash
pwd                 # Print the absolute path of the current working directory
cd /etc             # Move to the /etc directory (absolute path)
cd ..               # Move to the parent directory
cd ~                # Move to the home directory
cd                  # Typing cd with no argument also moves to home
cd -                # Toggle back to the previous directory
```

- If you repeat `cd -`, you can bounce between two directories like a toggle — handy when you work back and forth between two places.

> ⚠️ **Pitfall: pwd and symbolic links**
> `pwd` has the `-P` (physical) and `-L` (logical) options. When you enter a directory through a symbolic link, the default `-L` shows the link path as-is, while `-P` shows the actual physical path the link points to. Exam questions asking for the difference between these two come up fairly often.

## Listing Contents: ls

- `ls` (list) lists the contents of a directory. It is the most frequently used command, and it has so many options that it is easy to get confused.

```bash
ls              # Contents of the current directory (hidden files excluded)
ls -a           # Show everything, including hidden files (starting with .)
ls -l           # Detailed info (long format): permissions, link count, owner, size, time
ls -la          # Detailed info + hidden files
ls -lh          # Show sizes in human-readable units (K, M, G)
ls -lt          # Sort by modification time (newest first)
ls -ltr         # Reverse modification-time order (oldest first, newest last)
ls -R           # Show subdirectories recursively
ls -i           # Show inode numbers
ls -d */        # Show only the directories themselves (without expanding contents)
```

The first character of `ls -l` output = the file type.

| First character | Type |
|------|------|
| `-` | Regular file |
| `d` | Directory |
| `l` | Symbolic link |
| `c` | Character device |
| `b` | Block device |
| `p` | Pipe |
| `s` | Socket |

**What the -h option means.** `-h` is short for human-readable. It converts a size printed in bytes such as `1048576` into something like `1.0M`. However, it only makes sense together with `-l`. Used alone, `ls -h` does not display size information at all, so it has no effect.

## Creating and Removing Directories: mkdir, rmdir

```bash
mkdir project               # Create the project directory
mkdir -p a/b/c              # Create it in one go even if the intermediate paths (a, b) don't exist
mkdir -m 755 secure         # Create it with permissions set to 755
rmdir empty_dir             # Delete only an empty directory (error if it has contents)
rmdir -p a/b/c              # Delete the whole empty path in the order c, b, a
```

- The `p` in `mkdir -p` stands for parents. It is essential when creating a deep path at once.
- `rmdir` deletes **only empty directories**. To delete a directory together with its contents, you must use `rm -r`, covered later.

**Why does rmdir remove only empty directories?** `rmdir` is a command that directly mirrors the `rmdir(2)` system call. For safety, that system call is deliberately designed to remove only empty directories. It is a safeguard against accidentally wiping out a huge directory tree. It is one facet of the Unix philosophy of separating power from danger.

## Creating Files and Updating Timestamps: touch

```bash
touch newfile.txt           # Create an empty file (only updates the time if it already exists)
touch a.txt b.txt c.txt     # Create several files at once
touch -t 202601011200 f.txt # Set the timestamp to a specific time (2026-01-01 12:00)
touch -a f.txt              # Update only the access time (atime)
touch -m f.txt              # Update only the modification time (mtime)
```

- Its original purpose is **updating timestamps**, but if you name a file that doesn't exist it creates an empty one, so it is more often used for creating empty files.

**The three times in Linux.** Every file has three timestamps. They are **atime** (access time, when it was last read), **mtime** (modify time, when the contents changed), and **ctime** (change time, when the inode metadata changed). ctime is also updated when permissions or the owner change, and it differs from atime/mtime in that a user cannot arbitrarily set it to a past time.

## Copying: cp

```bash
cp source.txt dest.txt      # Copy a file
cp file.txt /backup/        # Copy into the /backup directory
cp -r dir1 dir2             # Recursively copy a directory (everything below it)
cp -i a.txt b.txt           # Ask for confirmation before overwriting (interactive)
cp -p file.txt copy.txt     # Preserve permissions, owner, and timestamps (preserve)
cp -u src.txt dst.txt       # Copy only if the source is newer (update)
cp -a dir1 dir2             # Archive mode: equivalent to -dpR, preserves all attributes
```

- The easily confusing one is `-r` (recursive). To copy a directory you must add `-r` (or `-R`); without it you get an `omitting directory` error.

> ⚠️ **Pitfall: cp overwrites by default**
> On most Linux distributions, `cp` overwrites the target file without any warning even if it already exists. To avoid losing data, use the `-i` (interactive) option to get a confirmation prompt, or use `-n` (no-clobber) to protect the existing file. In real-world work, this is where a one-line command that wipes out an important file begins.

## Moving and Renaming: mv

```bash
mv old.txt new.txt          # Rename (within the same directory)
mv file.txt /tmp/           # Move the file to /tmp
mv -i a.txt b.txt           # Ask for confirmation before overwriting
mv -f a.txt b.txt           # Force overwrite (force, without asking)
mv -u src dst               # Move only if the source is newer
mv dir1 dir2                # Move a directory (unlike cp, -r is not needed)
```

- Moving within the same directory is a **rename**; moving to a different directory is a **move**.
- When moving a directory, unlike `cp`, the `-r` option is not needed.

**Why mv is fast.** Within the same file system, `mv` doesn't actually copy any data. It only changes the directory entry (the information linking a file name to an inode). That is why even a multi-gigabyte file moves instantly. However, when you move **to a different file system (another partition, a USB drive, etc.)**, it works by copying and then deleting the original, so it takes time proportional to the size.

## Deleting: rm

```bash
rm file.txt                 # Delete a file
rm -i file.txt              # Ask for confirmation before deleting
rm -r directory             # Recursively delete a directory and all its contents
rm -f file.txt              # Force delete (no error even if the file doesn't exist)
rm -rf directory            # Force recursive delete of a directory (most dangerous)
```

**The horror of rm -rf.** `rm -rf /` is notorious as a command that destroys the entire system. In particular, if you write `rm -rf $DIR/` while the variable is empty, it can turn into `rm -rf /`. Linux has no concept of a recycle bin, so once something is deleted it is very hard to recover. When using `rm`, double-check the path, and be especially careful when using a wildcard (`*`).

## Finding Files: find and locate

- File searching splits into two main branches — `find`, which searches the disk in real time, and `locate`, which queries a pre-built database.
- `find` is powerful but has a distinctive syntax. The basic form is `find [path] [condition] [action]`.

```bash
find . -name "*.txt"            # Find .txt files under the current directory
find /home -name "report*"      # Files whose name starts with report
find . -iname "readme"          # Ignore case (insensitive)
find . -type f                  # Regular files only (f=file)
find . -type d                  # Directories only (d=directory)
find . -size +100M              # Files larger than 100MB
find . -size -1k                # Files smaller than 1KB
find . -mtime -7                # Files modified within the last 7 days
find . -mtime +30               # Files modified more than 30 days ago
find . -perm 644                # Files whose permissions are exactly 644
find . -user alice              # Files owned by alice
find . -empty                   # Empty files/directories
```

- Its real strength lies in running a command on the files it finds with `-exec`.

```bash
find . -name "*.tmp" -exec rm {} \;        # Delete the found .tmp files one by one
find . -name "*.log" -exec ls -l {} \;     # Print detailed info of the found log files
find . -name "*.txt" -exec grep "error" {} \;   # Search each file for error
find . -type f -exec chmod 644 {} +        # Process many files at once (+)
```

- `{}` : a placeholder that is replaced with the name of the found file.
- `\;` : marks the end of the command. If you use `+` instead, many files are batched into a single command run, which is efficient.

**`\;` vs `+` in -exec.** `\;` runs the command once for each found file. If there are 1000 files, the command runs 1000 times. `+`, on the other hand, bundles as many files as possible into the arguments of a single command line. It achieves efficiency similar to `xargs`. `+` is much faster for bulk file processing, but if the command has to handle files individually, you must use `\;`.

- `locate` takes a completely different approach. It queries the `mlocate.db` database, which the system refreshes periodically (usually once a day via cron), so it is very fast.

```bash
locate report.txt           # Search the database for report.txt
locate -i README            # Ignore case
locate -c "*.conf"          # Print only the number of matches (count)
updatedb                    # Manually refresh the locate database (root privileges)
```

**locate can't find the newest files.** Because `locate` relies on a database, a file you just created can't be found until you refresh the DB with `updatedb`. Conversely, files that have already been deleted may still remain in the results. If you need "guaranteed up-to-date results," use `find`, which searches in real time, even though it is slower.

## Locating Commands: which, whereis, type

```bash
which ls                    # Path of the ls executable (within PATH)
which -a python             # Show all matching paths within PATH
whereis ls                  # Locations of the executable + manual + source
type cd                     # Show the kind of command (builtin/external/alias)
```

- `which` : finds the location of an executable in the directories registered in `PATH`.
- `whereis` : tells you not only the binary but also the locations of the manual page and source code.

**The difference between which and type.** `which` only finds external commands (executable files on disk). So for commands built into the shell, like `cd`, `which cd` may produce no result. `type cd`, on the other hand, tells you precisely "cd is a shell builtin". If you want to know whether a command is an alias, a builtin, or an external file, `type` is the most accurate.

## Try It Yourself

Type the following exercise into the terminal yourself to get used to the flow of commands.

```bash
# 1. Create a workspace
mkdir -p ~/practice/week2/day1
cd ~/practice/week2/day1
pwd

# 2. Create several files and check the listing
touch file1.txt file2.txt file3.log
ls -la

# 3. Copy and move
cp file1.txt backup.txt
mkdir archive
mv file3.log archive/
ls -R

# 4. Practice finding
find . -name "*.txt"
find . -type f -name "*.log"

# 5. Check where commands live
which ls
type cd

# 6. Clean up
cd ~
rm -rf ~/practice
```

- Repeat it two or three times and you will develop a feel for handling the file system at your fingertips.
- In particular, combinations of `find` conditions and `-exec` are used endlessly not only on the exam but in real work, so practice them thoroughly.

## 📖 Glossary

- **Absolute path** : A path written in full from the root `/`. It always points to the same place wherever you type it.
- **Relative path** : A path written relative to the directory you are currently standing in. It uses `.` and `..`.
- **inode** : A structure holding file metadata such as size, permissions, owner, and times. The file name is not stored here.
- **Directory entry** : A table that links "this name is this inode". This is why `mv` is fast.
- **Hard link** : Another name pointing to the same inode. `.` and `..` are classic examples.
- **atime / mtime / ctime** : The time of last read, the time the contents changed, and the time the inode information changed, respectively.
- **PATH** : An environment variable containing the list of directories the shell searches for command executables.
- **Shell builtin** : A command like `cd` that lives inside the shell without a separate executable file. `which` doesn't pick it up well.
- **mlocate.db** : The file-list database that `locate` queries. Refreshed with `updatedb`.
- **Recursive** : A way of processing that digs down into subdirectories. The `r` in `cp -r` and `rm -r` is this.

## 📝 Practice Questions

**Question 1.** You want to find only regular files with the `.log` extension under the current directory. What is the most accurate command?

A) `find . -name "*.log"`
B) `find . -type f -name "*.log"`
C) `find . -type d -name "*.log"`
D) `locate "*.log"`

**Answer: B**
Explanation: You need to restrict to regular files with `-type f` and specify the extension with `-name "*.log"` to be accurate. A may include directories, and C is wrong because it finds only directories (`-type d`). D's `locate` is database-based, so it lacks real-time accuracy.

---

**Question 2.** You want to copy the directory `dir1` to `dir2` together with all its contents. What is the correct command?

A) `cp dir1 dir2`
B) `cp -i dir1 dir2`
C) `cp -r dir1 dir2`
D) `mv -r dir1 dir2`

**Answer: C**
Explanation: To copy a directory with its contents, the recursive option `-r` is essential. A and B lack `-r`, so they give an "omitting directory" error. D is a move command, not a copy, and `mv` doesn't need `-r` to move a directory anyway.

---

**Question 3.** Which statement about the `rmdir` command is correct?

A) It forcibly deletes directories that have contents
B) It can delete only empty directories
C) It can also delete files
D) It can delete recursively with the `-r` option

**Answer: B**
Explanation: `rmdir` is designed for safety to delete only empty directories. A directory with contents must be deleted with `rm -r`. `rmdir` has no recursive-delete option (`-p` deletes empty parent paths), and it cannot delete files.

---

**Question 4.** When the current directory is `/home/user/docs`, where do you end up if you run `cd ../photos`?

A) `/home/user/docs/photos`
B) `/home/user/photos`
C) `/home/photos`
D) `/photos`

**Answer: B**
Explanation: `..` means the parent directory (`/home/user`), and going into `photos` from there gives `/home/user/photos`. A is based on the current location (`./photos`), while C and D are wrong interpretations that go up too many levels.

---

**Question 5.** Which option of the `cp` command copies while preserving permissions, owner, and timestamps as they are?

A) `-r`
B) `-i`
C) `-p`
D) `-u`

**Answer: C**
Explanation: `-p` (preserve) preserves the attributes of the original (permissions, owner, timestamps). `-r` is recursive copy, `-i` is confirmation before overwriting, and `-u` copies only when the source is newer.

---

**Question 6.** Which command can most accurately tell you whether something is a shell builtin or an external command?

A) `which`
B) `whereis`
C) `locate`
D) `type`

**Answer: D**
Explanation: `type` precisely tells you whether a command is a shell builtin, an external file, or an alias. `which` finds only executables in PATH and may miss builtins, `whereis` handles the binary/manual/source locations, and `locate` is for file searching.

---

**Question 7.** In the command `find . -name "*.tmp" -exec rm {} \;`, what is the role of `{}`?

A) It marks the end of the command
B) It is a placeholder replaced with the name of the found file
C) It is a wildcard meaning all files
D) It means the current directory

**Answer: B**
Explanation: In `-exec`, `{}` is a placeholder that is replaced with the name of each file `find` found. What marks the end of the command is `\;`, and A is a description of that. `{}` is neither a wildcard nor the current directory.

---
