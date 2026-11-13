# Day 5 - Week 2 Comprehensive Review: Everything You Need to Survive on the Command Line

## 📌 Key Takeaways

- This week's tools are not isolated knowledge. `find` → `grep` → `awk` → `tar` → `vi` mesh together in one flow.
- Files: `cp -r` (required for copying directories), `rmdir` only for empty directories, and `{}` and `\;` in `find -exec`.
- Text: `grep` (line filter) · `sed s///g` (substitute) · `awk $1` (field) · `sort|uniq -c` (frequency).
- vi: three modes, entering with `i`/`a`/`o`, `dd`·`yy`·`p`, `:%s/old/new/g`, the difference between `:wq` and `:x`.
- Compression: `tar czvf` (create) · `xzvf` (extract) · `tzvf` (view). For help: `man` · `info` · `whatis` · `apropos`.

## Day 1 Recap: Files and Directories

**The command-line mindset.** The essence of the command line is "connect small tools with pipes." Instead of one giant program handling everything, you assemble complex jobs by chaining simple tools like `find`, `grep`, `sort`, and `awk` with `|`. The commands you learned this week are all parts for this assembly.

- Paths come in two kinds: an **absolute path** that starts from the root (`/`) and a **relative path** based on your current location.
- The key symbols for relative paths are `.` (current), `..` (parent), and `~` (home).

| Command | Role | Commonly used options |
|------|------|----------------|
| `pwd` | Print current location | `-P` (physical path) |
| `cd` | Change directory | `cd -` (previous location) |
| `ls` | List contents | `-l`, `-a`, `-h`, `-ltr` |
| `mkdir` | Create a directory | `-p` (create intermediate paths) |
| `rmdir` | Delete an empty directory | `-p` |
| `touch` | Create an empty file / update time | `-t` (specify time) |
| `cp` | Copy | `-r`, `-p`, `-i` |
| `mv` | Move/rename | `-i`, `-f` |
| `rm` | Delete | `-r`, `-f` |
| `find` | Real-time file search | `-name`, `-type`, `-exec` |
| `locate` | DB-based search | `-i`, updatedb |
| `which` | Find a command's path | `-a` |

> ⚠️ **Pitfall roundup: Day 1**
> Copying a directory requires `cp -r` (error without it), `rmdir` deletes only empty directories, not `gzip` but `rm` has no recycle bin, and `locate` is DB-based so it may not find the newest files. In `find`'s `-exec`, `{}` is the file-name substitution and `\;` is the end of the command.

## Day 2 Recap: Text Processing

The starting point of text processing is the standard streams and the pipe (`|`). It connects the output of one command to the input of the next.

| Command | Role | Key usage |
|------|------|-------------|
| `cat` | Print all / concatenate | `-n` (line numbers) |
| `head`/`tail` | First/last part | `-n`, `tail -f` |
| `grep` | Pattern search | `-i`, `-v`, `-r`, `-n`, `-c` |
| `sed` | Stream editing | `s/old/new/g`, `-i` |
| `awk` | Field processing | `{print $1}`, `-F`, `NR`, `NF` |
| `sort` | Sort | `-n`, `-r`, `-k`, `-u` |
| `uniq` | Remove duplicates | `-c`, `-d` (paired with sort) |
| `cut` | Extract columns | `-d`, `-f`, `-c` |
| `tr` | Convert characters | `-d`, `-s` |
| `wc` | Count | `-l`, `-w`, `-c` |

- Key regex metacharacters: `.` (any single character), `*` (zero or more of the preceding character), `^` (start of line), `$` (end of line), `[]` (character set).
- In extended regular expressions (ERE, `grep -E`), `+`, `?`, `|`, and `()` work without a backslash.

**Commonly used pipeline patterns.** "Count errors" is `grep error log | wc -l`, "unique IP frequency" is `awk '{print $1}' log | sort | uniq -c | sort -nr`, and "info for a specific user" is `grep user /etc/passwd | cut -d: -f1,6`. Once these combinations are in your fingers, log analysis becomes fun.

## Day 3 Recap: vi/vim

The three modes of `vi` are as follows. **Command mode** (default at startup, movement/editing), **insert mode** (entered with `i`/`a`/`o`, text input), and **last-line mode** (entered with `:`, save/quit/substitute).

| Task | Command |
|------|------|
| Start typing | `i` (before), `a` (after), `o` (line below), `O` (line above) |
| Move | `h j k l`, `w`/`b`, `0`/`$`, `gg`/`G` |
| Delete | `x` (character), `dd` (line), `dw` (word) |
| Copy/paste | `yy` (copy), `p`/`P` (paste) |
| Undo/repeat | `u` (undo), `Ctrl+r` (redo), `.` (repeat) |
| Search | `/pattern`, `?pattern`, `n`/`N` |
| Save/quit | `:w`, `:q`, `:q!`, `:wq`, `:x`, `ZZ` |
| Substitute | `:%s/old/new/g` |

> ⚠️ **Pitfall roundup: Day 3**
> `a` types after the cursor (`i` before it), `o` is the line below/`O` the line above, `:wq` always saves/`:x` and `ZZ` save only on change, and the `%` in `:%s` is the whole file. In `nano`, save is `Ctrl+O` and exit is `Ctrl+X`.

## Day 4 Recap: Compression and Help

**Archiving (bundling)** and **compression (shrinking size)** are different jobs. `tar` bundles, and `gzip`/`bzip2`/`xz` compress.

| Task | Command |
|------|------|
| Bundle and gzip-compress | `tar czvf x.tar.gz dir/` |
| Extract a gzip archive | `tar xzvf x.tar.gz` |
| View the content listing | `tar tzvf x.tar.gz` |
| Extract to a specific location | `tar xvf x.tar -C /tmp` |
| Compress a single file | `gzip file` (original deleted), preserve with `-k` |
| zip compression | `zip -r x.zip dir/` |

- `tar` options: `c` (create), `x` (extract), `t` (list), `v` (verbose), `f` (file name), `z` (gzip), `j` (bzip2), `J` (xz).
- The compression ratio order is xz > bzip2 > gzip.
- For help, use `man` (section-based manuals), `info` (detailed documents), `whatis` (one-line summary, `man -f`), and `apropos` (keyword search, `man -k`).
- Manual section 1 is commands, 5 is file formats, and 8 is system administration.

**The Unix philosophy running through the week.** This week's tools all follow the Unix philosophy set down by Ken Thompson and Dennis Ritchie in the 1970s. "Do one thing well," "make programs work together," "handle text streams." `grep`, `sort`, and `tar` each do just one thing well and cooperate through pipes. This is why the design is still valid fifty years later.

## Try It Yourself: Comprehensive Exercise

This is a comprehensive exercise that weaves everything you learned into one flow.

```bash
# 1. Create a workspace and log data
mkdir -p ~/review/logs
cd ~/review
cat > logs/access.log << 'EOF'
192.168.0.1 GET /index 200
192.168.0.2 POST /login 401
192.168.0.1 GET /about 200
192.168.0.3 GET /index 500
192.168.0.2 GET /index 200
EOF

# 2. Find the log with find
find . -name "*.log" -type f

# 3. Count errors (401, 500) with grep + wc
grep -E "401|500" logs/access.log | wc -l

# 4. Rank IP access frequency with awk + sort + uniq
awk '{print $1}' logs/access.log | sort | uniq -c | sort -nr

# 5. Mark status code 200 as OK with sed
sed 's/ 200$/ OK/' logs/access.log

# 6. Back up with tar and verify
tar czvf backup.tar.gz logs/
tar tzvf backup.tar.gz

# 7. Check with help
whatis awk

# 8. Clean up
cd ~
rm -rf ~/review
```

- If you can get through this exercise without getting stuck, you have more than achieved the goal of Week 2.
- Experimenting by changing the options at each step deepens your understanding.

## 📖 Glossary

- **Absolute path / relative path** : A complete address starting from `/`, and an address based on your current location.
- **`cp -r`** : The recursive option that is essential when copying a whole directory.
- **`find -exec`** : An option that runs a command for each found file. `{}` is replaced with the file name and it is terminated with `\;`.
- **locate** : A fast search that digs through a pre-built database. It may not find the newest files.
- **Pipe (`|`)** : A connector that links the output of the preceding command to the input of the following command. The core of the command-line mindset.
- **`sort | uniq -c`** : A combination that sorts and then counts duplicates. The fundamental of log frequency analysis.
- **ERE (extended regular expressions)** : The syntax used by `grep -E`. You can use `+ ? | ( )` without a backslash.
- **Command mode / insert mode / last-line mode** : vi's three states. They handle editing, typing, and save/quit respectively.
- **`:%s/old/new/g`** : The vi command that substitutes across the whole file. `%` means "all lines."
- **Archive vs compression** : Bundling many into one (tar) and reducing size (gzip, etc.) are different from each other.
- **man sections** : Manual classification numbers. 1 = commands, 5 = file formats, 8 = system administration commands.
- **apropos** : A tool that finds command names in reverse by a function keyword. Same as `man -k`.

## 📝 Practice Questions

**Question 1.** Which command finds only regular files ending in `.conf` under the current directory?

A) `find . -type d -name "*.conf"`
B) `find . -type f -name "*.conf"`
C) `locate -type f "*.conf"`
D) `grep -r "*.conf" .`

**Answer: B**
Explanation: `-type f` restricts to regular files and `-name "*.conf"` specifies the pattern. A finds only directories, C uses a `-type` option that `locate` doesn't have, and D searches file contents, so its purpose is different.

---

**Question 2.** Which is correct about the behavior of `sed -i 's/dev/prod/g' config.txt`?

A) It prints the result only to the screen and leaves the original as is
B) It replaces only the first dev in each line with prod
C) It replaces every dev in the whole file with prod and modifies the original file directly
D) It deletes the lines containing dev

**Answer: C**
Explanation: `-i` modifies the original file directly (in-place), and `g` replaces every match in each line. A is for when there is no `-i`, B is for when there is no `g`, and D describes the `d` command.

---

**Question 3.** What is the result of `awk -F: '{print $1}' /etc/passwd`?

A) It prints each whole line
B) It prints the first colon-separated field (the user name)
C) It prints the last colon-separated field
D) It prints the line number

**Answer: B**
Explanation: `-F:` sets the delimiter to a colon and `$1` prints the first field, so the user name comes out. The whole line is `$0`, the last field is `$NF`, and the line number is `NR`.

---

**Question 4.** In `vi`, which key creates a new line below the line where the cursor currently is and enters insert mode?

A) `o`
B) `O`
C) `a`
D) `i`

**Answer: A**
Explanation: Lowercase `o` (open) opens a new line below the current line and enters insert mode. Uppercase `O` opens the line above, `a` starts typing after the cursor, and `i` starts typing before the cursor.

---

**Question 5.** In `vi`, which command saves and quits only if changed, preserving the timestamp if there are no changes?

A) `:wq`
B) `:q!`
C) `:x`
D) `:w`

**Answer: C**
Explanation: `:x` (and `ZZ`) save only if changed, so if there are no changes they don't touch the file and the timestamp is preserved. `:wq` always saves regardless of changes (updating the timestamp), `:q!` force-quits without saving, and `:w` only saves.

---

**Question 6.** Which command bundles the directory `data` into an archive in bzip2 compression format?

A) `tar czvf data.tar.bz2 data/`
B) `tar cjvf data.tar.bz2 data/`
C) `tar cJvf data.tar.bz2 data/`
D) `tar xjvf data.tar.bz2 data/`

**Answer: B**
Explanation: bzip2 compression is the `j` option (`c` = create, `v` = verbose, `f` = file name). `z` (A) is gzip, `J` (C) is xz, and `x` (D) is the extract action.

---

**Question 7.** Which is correct about the result of running `gzip -k report.txt`?

A) report.txt is deleted and only report.txt.gz remains
B) Both report.txt and report.txt.gz exist
C) report.txt.bz2 is created
D) It is not compressed and an error occurs

**Answer: B**
Explanation: `-k` (keep) preserves the original, so both the original and the compressed file remain. Running without `-k` deletes the original, as in A. C is bzip2's extension, and D is an incorrect description.

---

**Question 8.** Which pair of commands is equivalent to searching the manual descriptions for the keyword "network" to find related commands?

A) `whatis network` = `man -f network`
B) `apropos network` = `man -k network`
C) `info network` = `man network`
D) `which network` = `whereis network`

**Answer: B**
Explanation: `apropos` searches the manuals by keyword and is identical to `man -k`. `whatis` is exact name matching (identical to `man -f`), so A is a summary rather than a search. C and D are unrelated to searching.

---

**Question 8.** You want to sort the number of connections per IP from a log file in descending order. What is the most suitable pipeline?

A) `awk '{print $1}' log | uniq -c`
B) `awk '{print $1}' log | sort | uniq -c | sort -nr`
C) `grep $1 log | sort -n`
D) `cut -f1 log | uniq`

**Answer: B**
Explanation: First extract the first field (the IP), gather identical IPs with `sort`, count them with `uniq -c`, and then sort again in descending order of frequency with `sort -nr`. A uses `uniq` without sorting and so misses scattered duplicates, and C and D don't fit the purpose.

---

**Question 9.** Which of the following is the most suitable option combination to copy an entire directory with the `cp` command while also preserving permissions and timestamps?

A) `cp -i dir1 dir2`
B) `cp -r dir1 dir2`
C) `cp -rp dir1 dir2`
D) `cp -f dir1 dir2`

**Answer: C**
Explanation: Copying a directory needs `-r` (recursive), and preserving permissions and timestamps needs `-p` (preserve), so you must use `-rp` together. A neither preserves nor is recursive, B lacks preservation, and D is merely a force option.

---

**Question 10.** Which lines does `grep -E "^[0-9]+$" data.txt` find?

A) All lines that start with a digit
B) All lines that end with a digit
C) Lines consisting of digits only
D) All lines that contain a digit

**Answer: C**
Explanation: `^` is the start of a line, `$` is the end of a line, and `[0-9]+` means one or more digits. It finds lines that are all digits from start to end, i.e. lines consisting of digits only. A is for just `^[0-9]`, B for just `[0-9]$`, and D for just `[0-9]`.

---

**Question 11.** Which command checks only the listing of `backup.tar.gz`, made with `tar`, without extracting it?

A) `tar xzvf backup.tar.gz`
B) `tar czvf backup.tar.gz`
C) `tar tzvf backup.tar.gz`
D) `tar rzvf backup.tar.gz`

**Answer: C**
Explanation: The `t` (list) option shows only the content listing without extracting the archive. `x` is extract, `c` is create, and `r` is appending files to an archive.

---
