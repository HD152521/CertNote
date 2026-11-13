# Day 4 - Compression, Archives, and Help: Bundling and Shrinking Files, and Learning on Your Own

## 📌 Key Takeaways

- **Bundling (archiving) and compression are separate things.** `tar` bundles, and `gzip`/`bzip2`/`xz` shrink.
- You only need to get three `tar` patterns into your fingers — `czf` (create) · `xzf` (extract) · `tzf` (peek inside). Always a file name after `f`.
- Compression ratio and speed are inversely related: gzip (fast) < bzip2 < xz (best compression, slowest).
- `gzip file` **deletes the original**. Use `-k` to keep it. `zip` requires `-r` for directories.
- For documentation: `man` (section 1 = commands, 5 = file formats), `info` (detailed), `whatis` (exact name), `apropos` (reverse keyword search).

## The Archive Standard: tar

Bundling hundreds of files for backup, shrinking them for transfer, or unpacking a compressed file you received — these come up constantly. The starting point is `tar`.

**Archiving and compression are different.** **Archiving** is the job of bundling multiple files and directories into a single file. It only bundles; the size barely decreases. **Compression** is the job of removing redundant patterns in data to reduce file size. `tar` is an archiving tool, and `gzip`/`bzip2`/`xz` are compression tools. Combining the two lets you make "many files, bundled and small."

- `tar` (tape archive) was originally created for tape backups, but today it is used as the standard tool for bundling files.
- Options are used in combination, and option combinations are what the exam asks about.

| Option | Meaning |
|------|------|
| `c` | Create a new archive (create) |
| `x` | Extract an archive (extract) |
| `t` | View archive contents (list) |
| `v` | Show progress in detail (verbose) |
| `f` | Specify the archive file name (file) — almost always required |
| `z` | Compress/decompress with gzip |
| `j` | Compress/decompress with bzip2 |
| `J` | Compress/decompress with xz |
| `C` | Extract into the specified directory |

```bash
tar cvf archive.tar dir/        # Bundle dir into archive.tar (no compression)
tar xvf archive.tar            # Extract archive.tar
tar tvf archive.tar           # List the contents only, without extracting
tar czvf archive.tar.gz dir/   # Bundle with gzip compression
tar xzvf archive.tar.gz        # Extract a gzip-compressed archive
tar cjvf archive.tar.bz2 dir/  # Bundle with bzip2 compression
tar xjvf archive.tar.bz2       # Extract a bzip2 archive
tar cJvf archive.tar.xz dir/   # Bundle with xz compression
tar xvf archive.tar -C /tmp    # Extract into the /tmp directory
```

- An archive file name must come right after the `f` option, so `f` is usually placed at the very end of the option cluster, as in `cvf` and `xvf`.
- In `tar czf backup.tar.gz`, you should be able to read from just the three letters `c` (create), `z` (gzip), and `f` (file name) that "it makes a gzip-compressed backup."

> ⚠️ **Pitfall: don't leave out the f option**
> If you leave out `f`, as in `tar cv archive.tar dir/`, `tar` mistakes archive.tar for a **file to be bundled** rather than the archive file name. It then tries to send the output to a tape device and errors out, or behaves unexpectedly. In almost all cases `f` is required, and the file name must come right after it.

**Modern tar auto-detects the compression format.** Recent versions of GNU tar automatically detect the compression format and extract even without `z`, as in `tar xf archive.tar.gz`. When extracting, you can often omit `z`/`j`/`J`. However, **when creating** you must specify which compression to use, so `z`/`j`/`J` are needed. For the exam, it is safest to know the explicit options precisely.

## Compressing a Single File: gzip, bzip2, xz

When you compress just one individual file without bundling it with `tar`, you use the compression tool directly.

```bash
gzip file.txt           # file.txt → file.txt.gz (original deleted)
gzip -d file.txt.gz     # Decompress (decompress)
gunzip file.txt.gz      # Same as gzip -d
gzip -k file.txt        # Compress while keeping the original (keep)
gzip -9 file.txt        # Maximum compression (1 = fast, 9 = best compression)
gzip -l file.txt.gz     # Show compression info (ratio, etc.)

bzip2 file.txt          # file.txt → file.txt.bz2
bunzip2 file.txt.bz2    # Decompress bzip2
bzip2 -d file.txt.bz2   # Same as above

xz file.txt             # file.txt → file.txt.xz
unxz file.txt.xz        # Decompress xz
xz -d file.txt.xz       # Same as above
```

> ⚠️ **Pitfall: gzip removes the original**
> When you run `gzip file.txt`, `file.txt.gz` is created and **the original `file.txt` disappears**. Likewise on decompression, the `.gz` file disappears and the original is restored. To preserve the original, you must use the `-k` (keep) option. It is easy to lose the original in an accident by compressing without knowing this.

The three tools differ in compression ratio and speed.

| Tool | Extension | Compression ratio | Speed | Characteristics |
|------|--------|--------|------|------|
| gzip | `.gz` | Moderate | Fast | Most widely compatible, DEFLATE algorithm |
| bzip2 | `.bz2` | High | Slow | Smaller than gzip, but slower |
| xz | `.xz` | Very high | Slowest | Best compression ratio, LZMA2 algorithm |

**The history of compress and .Z.** `gzip` (GNU zip) appeared in 1992, and before that the `compress` command was the standard. `compress` compresses a file to the `.Z` extension and is undone with `uncompress`. However, the LZW algorithm used for the compression had patent problems, so the free software community built the patent-free `gzip`. Today `.Z` files have almost disappeared, but they still show up on the exam.

## Windows-Compatible Compression: zip

- Unlike `gzip`/`bzip2`/`xz`, which handle only single files, `zip` handles **bundling and compression in one step**.
- It is compatible with Windows environments and is often used when exchanging files.

```bash
zip archive.zip file1 file2     # Bundle and compress several files
zip -r archive.zip dir/         # Compress a directory recursively (recursive)
unzip archive.zip               # Decompress
unzip -l archive.zip            # List the contents only (list)
unzip archive.zip -d /tmp       # Extract into /tmp (destination)
zip -e secure.zip file.txt      # Compress with a password (encrypt)
```

**Why does zip need -r?** By default, `zip` processes only the files you specify, and when it meets a directory it doesn't automatically include what is inside. To bundle a whole directory, you must specify `-r` (recursive). This contrasts with `tar`, which processes directories recursively on its own. This difference is a trap both on the exam and in practice.

## The Help System: man

You can't memorize every Linux command. That is why the ability to use the manuals built into the system is key.

```bash
man ls              # View the manual for the ls command
man 5 passwd        # The passwd document in section 5 (file format)
man -k network      # Search manuals related to network (same as apropos)
man -f ls           # A short description of ls (same as whatis)
```

- Inside a manual page you navigate with keys like in `vi`. `Space` for the next page, `b` for the previous page, `/word` to search, and `q` to quit.
- `man` divides its content into **sections**, because the same name can exist as both a command and a file format.

| Section | Content |
|------|------|
| 1 | General user commands |
| 2 | System calls |
| 3 | Library functions |
| 4 | Special files (devices) |
| 5 | File formats and configuration files |
| 6 | Games |
| 7 | Miscellaneous (macros, conventions) |
| 8 | System administration commands |

**man 1 passwd vs man 5 passwd.** `passwd` is both the command that changes passwords (section 1) and the format of the file `/etc/passwd` that holds user information (section 5). If you just type `man passwd`, the lower section (1, the command) usually comes up first. To see the file format you must specify the section, as in `man 5 passwd`. This section concept is an easily confusing topic.

## info: Richer Documentation

- `info` is the GNU project's documentation system; it is more detailed than `man`, and you read it by moving between nodes like hyperlinks.
- Inside `info` you navigate with `n` (next node), `p` (previous node), `u` (up node), `Enter` (follow a link), and `q` (quit).

```bash
info ls             # View the info document for ls
info coreutils      # The full coreutils documentation
```

**The relationship between man and info.** Most commands keep documentation in both `man` and `info`, but for GNU tools the `info` side is often more detailed. If `man` is for quick reference, `info` is for detailed, tutorial-like explanations. If you're at a loss as to which to look at, start with `man` and consult `info` if it isn't enough.

## Quick Searching: whatis and apropos

These are tools to use when you need a one-line summary or a keyword search rather than a command's full manual.

```bash
whatis ls           # Print a one-line description of ls
whatis cp mv        # Summaries of several commands at once
apropos copy        # Search for commands containing the keyword "copy"
apropos -s 1 network  # Search for network in section 1
```

- `whatis` answers the question "What does this command do?" in one line.
- `apropos` is used **to find commands in reverse by function**, as in "What was that command that copies files?" Running `apropos copy` brings up cp, dd, and other copy-related commands in a long list.

**The database behind whatis and apropos.** `whatis` and `apropos` query a database that collects only the title lines of the manual pages. This database is refreshed with the `mandb` command (or `makewhatis` in the old days). If you installed new software and `whatis` can't find it, it may be because the database hasn't been refreshed yet. `man -k` behaves exactly like `apropos`, and `man -f` exactly like `whatis`.

**The difference between apropos and whatis.** `whatis ls` finds the description of the command named exactly `ls`, while `apropos ls` finds every command whose description contains "ls". That is, `whatis` is exact name matching and `apropos` is keyword search. If you remember "when you know the function but not the command name, use apropos," you won't get confused.

## Try It Yourself

Handle compression and help yourself with the following exercise.

```bash
# 1. Create practice files and a directory
mkdir -p ~/tartest/data
cd ~/tartest
echo "hello" > data/a.txt
echo "world" > data/b.txt

# 2. Bundle with tar and compress with gzip
tar czvf backup.tar.gz data/
ls -lh backup.tar.gz

# 3. Check the contents, then extract elsewhere
tar tzvf backup.tar.gz
mkdir restore
tar xzvf backup.tar.gz -C restore/
ls -R restore/

# 4. Compress a single file (keep the original)
gzip -k data/a.txt
ls data/

# 5. Use the help
whatis tar
man -f gzip
apropos compress

# 6. Clean up
cd ~
rm -rf ~/tartest
```

- You only get used to `tar` option combinations by typing them out by hand many times.
- If you repeat the three patterns of creating with `czf`, extracting with `xzf`, and peeking inside with `tzf`, you will memorize them naturally.

## 📖 Glossary

- **Archive** : Bundling multiple files/directories into one. The size barely decreases.
- **Compression** : Removing redundant patterns in data to reduce file size.
- **tar** : The standard tool for bundling files. The name comes from tape archive (tape backup).
- **`f` option** : The tar option that specifies the archive file name. If left out, it is mistaken for a target file.
- **gzip / bzip2 / xz** : Three single-file compressors. Going down the list they get smaller but slower.
- **`-k` (keep)** : An option that keeps the original while compressing. The default behavior is to delete the original.
- **zip / unzip** : Windows-compatible tools that bundle and compress in one step. `-r` is required for directories.
- **man sections** : Numbers that divide the manual by type. 1 = commands, 5 = file formats, 8 = system administration commands.
- **info** : GNU's documentation system. More detailed than man, and read by moving between nodes.
- **whatis** : A tool that takes an exact command name and gives a one-line description. Same as `man -f`.
- **apropos** : A tool that finds commands in reverse by keyword. Same as `man -k`.
- **mandb** : The command that refreshes the manual summary database that whatis/apropos query.

## 📝 Practice Questions

**Question 1.** Which is the correct command to bundle the directory `data` into an archive with gzip compression?

A) `tar xzvf data.tar.gz data/`
B) `tar czvf data.tar.gz data/`
C) `tar tzvf data.tar.gz data/`
D) `tar cjvf data.tar.gz data/`

**Answer: B**
Explanation: `c` is create, `z` is gzip compression, `v` is verbose, and `f` specifies the file name. In A, `x` is extract; in C, `t` is list; and in D, `j` is bzip2 compression, which doesn't match the `.gz` extension.

---

**Question 2.** What happens to the original `file.txt` when you run `gzip file.txt`?

A) It stays as is and file.txt.gz is additionally created
B) It is deleted and only file.txt.gz remains
C) It changes to file.txt.bz2
D) Nothing changes and the compressed result is only printed to the screen

**Answer: B**
Explanation: `gzip` by default deletes the original and leaves only the compressed file. To keep the original, you need the `-k` (keep) option. C is bzip2's extension, and D is an incorrect description.

---

**Question 3.** Which tool has the highest compression ratio (makes files the smallest)?

A) gzip
B) bzip2
C) xz
D) compress

**Answer: C**
Explanation: `xz`, with the LZMA2 algorithm, has the highest compression ratio of the three tools (in exchange for being the slowest). The order of compression ratio is generally xz > bzip2 > gzip > compress.

---

**Question 4.** You want to compress an entire directory with `zip`. What is the correct command?

A) `zip archive.zip dir/`
B) `zip -r archive.zip dir/`
C) `zip -d archive.zip dir/`
D) `zip -l archive.zip dir/`

**Answer: B**
Explanation: `zip` doesn't process directories recursively on its own, so you must specify `-r` (recursive) for the files inside to be included. A leaves out the directory contents, `-d` is related to deleting entries, and `-l` is related to listing.

---

**Question 5.** How do you view the manual for the **format** of the `/etc/passwd` file?

A) `man passwd`
B) `man 1 passwd`
C) `man 5 passwd`
D) `man 8 passwd`

**Answer: C**
Explanation: File formats and configuration files are in manual section 5, so you must view it with `man 5 passwd`. A, with no section specified, and B, with section 1 specified, show the documentation for the password-changing command (passwd). Section 8 is system administration commands.

---

**Question 6.** Which tool finds related commands by a function keyword when "you don't know the name of the command that copies files"?

A) `whatis copy`
B) `apropos copy`
C) `man copy`
D) `which copy`

**Answer: B**
Explanation: `apropos` searches for every command whose manual description contains the keyword, so it is suited to finding commands in reverse by function. `whatis` is exact name matching, `man` is the manual for a specific command, and `which` finds the executable path.

---

**Question 7.** In the `tar` command, which option is almost always required and must be followed immediately by the archive file name?

A) `v`
B) `c`
C) `z`
D) `f`

**Answer: D**
Explanation: `f` (file) is the option that specifies the archive file name; it is needed in almost all cases and the file name must come right after it. `v` shows progress, `c` creates, and `z` is gzip compression.

---
