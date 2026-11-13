# Day 3 - The Arithmetic of Permissions: rwx · Octal chmod · Ownership · umask Calculation

## 📌 Key Takeaways

- Permissions are arithmetic, not intuition — **r=4, w=2, x=1**, in three digits in owner→group→other order.
- On a directory, x is the **entry (`cd`)** permission. Whether a file can be deleted is decided not by the file but by **the directory's w**.
- Octal `chmod` is a **full overwrite**; symbolic (`u+x`, `g-w`, `o=r`) is a **partial change**.
- `chown` (changing the owner) is **root only**. Before the colon is the owner, after it is the group.
- umask is a mask that shaves off — **file 666 − umask**, **directory 777 − umask**. The larger the value, the more restrictive.

## rwx and the Three Classes — The Structure of 9 Bits

You should be able to look at `rwxr-xr--` and immediately say 754, and immediately work out what 644 allows. If this arithmetic stalls, Day 4's special permissions and ACLs collapse too.

```bash
-rwxr-xr--  1 alice dev  4096 Jun  5 10:00 report.sh
# │└┬┘└┬┘└┬┘
# │ owner group other
# └ file type (-=file, d=directory, l=link)
```

- The first character is the **type** (file `-`, directory `d`, symbolic link `l`, block device `b`, character device `c`).
- The remaining 9 characters are three classes × three permissions.

| Class | Characters | Meaning |
|------|------|------|
| owner (u) | 1-3 | File owner |
| group (g) | 4-6 | Owning group |
| other (o) | 7-9 | All other users |

- The three positions within each class are fixed in **r → w → x order**. A letter if the permission is present, `-` if not.

The same letter means different things for files and directories. On a **file**, r=read contents, w=modify contents, x=execute. On a **directory**, r=list contents (`ls`), w=create/delete files, **x=enter that directory (`cd`)**. In particular, without x on a directory you cannot access the files inside even if you have r (the names are visible but you cannot get in). On the exam, "what if a directory has only x and no r?" → you cannot see the names, but you can access a file if you know its exact filename — it is asked with the same trap.

To **delete** a file in a directory, you need not write permission on that file but **w permission on the directory**. Even if the file itself is read-only (444), it can be deleted if the directory containing it has w. This goes against intuition and is easy to get confused about. (The sticky bit restricts this behavior, covered in Day 4.)

## Octal Conversion — rwx as Numbers

Each permission has a weight: **r=4, w=2, x=1**. Adding up the permissions of one class gives a number from 0 to 7.

| rwx | Calculation | Octal |
|-----|------|-------|
| `---` | 0 | 0 |
| `--x` | 1 | 1 |
| `-w-` | 2 | 2 |
| `-wx` | 2+1 | 3 |
| `r--` | 4 | 4 |
| `r-x` | 4+1 | 5 |
| `rw-` | 4+2 | 6 |
| `rwx` | 4+2+1 | 7 |

Calculating each of the three classes and joining them gives a three-digit octal number.

```
rwxr-xr--
rwx = 7,  r-x = 5,  r-- = 4   →  754
```

r=4, w=2, x=1 are binary bit weights (2², 2¹, 2⁰). Viewing the three rwx bits in binary gives `111`=7, `101`=5, `100`=4. That is why one octal digit (0-7) represents three bits exactly. Once you know this correspondence, the conversion becomes calculation rather than memorization.

Memorizing the commonly used permission numbers outright makes things fast.

| Octal | rwx | Use |
|-------|-----|------|
| **644** | rw-r--r-- | Regular file default (owner read/write, others read) |
| **755** | rwxr-xr-x | Executable file/directory default |
| **600** | rw------- | Personal secret file (SSH keys, etc.) |
| **700** | rwx------ | Personal directory |
| **777** | rwxrwxrwx | Full permissions for everyone (avoid for security) |
| **400** | r-------- | Read-only secret file |

> ⚠️ **Trap**: You must decode 644 exactly as "only the owner can write, the rest read." 6=rw- (owner), 4=r-- (group), 4=r-- (other). Choices that mistake it for "everyone read/write" or confuse it with 755 (rwxr-xr-x) are used as wrong answers. Reading the chmod digits backwards (from other) is also a common mistake — it is **always owner-group-other order**.

## chmod — Octal Mode and Symbolic Mode

There are two ways to change permissions with `chmod`.

**Octal (absolute) mode** — overwrites the entire set of permissions at once.

```bash
chmod 755 script.sh          # set to rwxr-xr-x (overwrites, ignoring existing permissions)
chmod 644 config.txt         # rw-r--r--
chmod 600 ~/.ssh/id_rsa      # rw------- (SSH key standard)
chmod -R 755 /var/www        # -R: apply recursively to everything below
```

**Symbolic (relative) mode** — adds or removes only specific permissions.

```bash
chmod u+x script.sh          # add execute (x) for the owner (u)
chmod g-w file.txt           # remove write (w) from the group (g)
chmod o=r file.txt           # set other (o) to read only (remove the rest)
chmod a+r file.txt           # add read for everyone (a=all)
chmod u+x,g+x,o-r file.txt   # combine several changes with commas
chmod ug=rw,o= file.txt      # rw for u,g; no permissions for o
```

| Target | Meaning | Operator | Meaning |
|------|------|--------|------|
| u | owner | + | Add permission |
| g | group | - | Remove permission |
| o | other | = | Set to exactly that permission |
| a | all (ugo) | | |

Octal mode **overwrites the whole**, and symbolic mode **changes only part**. Octal suits when you do not know the existing permissions or want to decide everything from scratch, and symbolic suits changing only part, such as "just add execute permission." If you omit the target as in `chmod +x`, it is affected by umask and applies to a (all), but the bits blocked by umask are left out.

There is a trap when applying `chmod -R` (recursive) across files and directories at once. Directories need x for entry, but regular files do not need x (and it is a security risk). If you apply `chmod -R 755` wholesale, execute permission is attached to every file as well. To avoid this, split by type with `find /path -type d -exec chmod 755 {} \;` and `find /path -type f -exec chmod 644 {} \;`, or use the symbolic uppercase `X` (`chmod -R a+X`). **Uppercase X adds x only to "directories or files that already have x for someone."**

> ⚠️ **Trap**: `chmod 777` looks like a master key that "solves the problem quickly," but it makes write and execute possible for anyone, which is a serious security hole. Applying 777 to a web server directory opens the way for an attacker to plant a malicious script. On the exam, the choice "777 as the fix for a permission problem" is a wrong answer.

```bash
# Try it yourself — permission conversion practice
touch demo.txt && ls -l demo.txt          # check the default permissions
chmod 640 demo.txt && ls -l demo.txt      # confirm rw-r-----
chmod u+x,o-r demo.txt && ls -l demo.txt  # observe the symbolic-mode change
stat -c "%a %A %n" demo.txt               # octal and rwx at the same time
```

## chown / chgrp — Changing Ownership

- If permissions are "what can be done," ownership is "whose it is."
- A file has two attributes: **owner (user) and owning group (group)**.

```bash
chown alice file.txt              # set the owner to alice
chown alice:dev file.txt          # change owner to alice and group to dev at once
chown :dev file.txt               # change only the group to dev (omit the part before the colon)
chown -R alice:dev /var/www       # recursively for everything below
chgrp dev file.txt                # change only the group (same as chown :dev)
```

In the `chown user:group` format, before the colon is the owner and after it is the group. If you omit the part before the colon (`chown :group`), only the group changes, which is the same as `chgrp group`. To change only the owner, drop the colon and use `chown user`.

**`chown` (changing the owner) can be done only by root**. A regular user cannot hand ownership of even their own file to someone else (handing it over could be abused, e.g., to evade disk quotas). However, a regular user can `chgrp` to a group they belong to. "Can a regular user change the owner with chown?" → the answer is not possible.

The typical cause of "Permission denied" after a web deployment is that the file owner is the person who deployed (e.g., deploy) while the web server runs as the `www-data`/`apache` user. The fix is to hand ownership to the web server user with `chown -R www-data:www-data /var/www`. Working around it by opening permissions with 777 is the worst move for security — it is asked in the pattern that **matching ownership is the right answer and loosening permissions is the wrong answer**.

## umask — The Mask That Shaves Off Default Permissions

- When creating a new file or directory, you do not set the permissions with chmod each time. **umask** automatically determines the default permissions.
- The key is that umask does not **grant** permissions but **removes (masks)** them.
- Maximum default permission of a file: **666** (rw-rw-rw-, x is not granted to files by default)
- Maximum default permission of a directory: **777** (rwxrwxrwx)
- Actual permission = the maximum permission **minus** the umask bits

```
With umask 022:
  File:       666 - 022 = 644  (rw-r--r--)
  Directory:  777 - 022 = 755  (rwxr-xr-x)

With umask 077:
  File:       666 - 077 = 600  (rw-------)
  Directory:  777 - 077 = 700  (rwx------)
```

The reason files start at 666 is that automatically giving execute permission (x) to newly created files would be dangerous (a script could be executed unintentionally). So the starting point for files is 666 with x left out, and directories start at 777 because x is essential for entry. The reason the same umask gives different results for files and directories is this difference in starting points.

Strictly speaking, the umask calculation is not "subtraction" but **bitwise AND NOT (complement masking)**. If a bit of the umask is 1, that permission is turned off. Viewing 022 in binary gives `000 010 010`, and turning off the positions where those bits are on (group's w, other's w) in 666 gives 644. In most cases simple subtraction gives the same answer, but when odd digits (e.g., the 7 in 027) mix into the umask, subtraction intuition can go wrong, so understanding it as bit masking is safer. Example: umask 027 → file 666 & ~027 = 640, directory 777 & ~027 = 750.

"With umask 022, a new file becomes 755" is wrong. **755 is the directory result**, and the file is 666-022=**644**. Confusing the starting points of files and directories (666 vs 777) is the core trap of umask questions. Also, the larger the umask value, the more permissions are shaved off and the **more restrictive** it becomes (077 is tighter than 022).

```bash
# Try it yourself — observe the effect of umask
umask                              # current umask (usually 0022)
umask 077                          # change to something more restrictive
touch secret.txt && ls -l secret.txt   # confirm 600 (666-077)
mkdir secretdir && ls -ld secretdir    # confirm 700 (777-077)
umask 022                          # restore
```

On one shared server, users' umask was set to 002, so every newly created file was 664 (group write allowed). It was convenient in an environment where members of the same group collaborate, but when one user created a sensitive key file, it became modifiable by other users in the same group. The security team adjusted `/etc/profile` and `~/.bashrc` to tighten the default umask of personal work accounts to 077. The system-wide umask is set in `/etc/profile` or `/etc/login.defs`, and an individual's in `~/.bashrc`.

## Permission Arithmetic Cheat Sheet

| Concept | Formula/Rule |
|------|-----------|
| Permission weights | r=4, w=2, x=1 |
| Order | owner → group → other, each class r→w→x |
| File umask calculation | 666 − umask |
| Directory umask calculation | 777 − umask |
| chmod octal | Full overwrite |
| chmod symbolic | u/g/o/a + +/-/= partial change |
| chown | Change owner (root only), `user:group` |

- If you can instantly answer `rwxr-xr-x = 755` and `rw-r--r-- = 644`, a large part of permission problems is solved.

## 📖 Glossary

- **owner / group / other** : The three classes permissions apply to. The 9 characters of `ls -l` line up in this order.
- **r / w / x** : Read, write, execute. The weights are 4, 2, and 1 respectively.
- **x on a directory** : The permission to go inside it. Without it, you cannot access anything even if the listing is visible.
- **w on a directory** : The permission to create and **delete** files in it. It governs deletion regardless of the file's own permissions.
- **Octal notation** : A permission notation that compresses three bits into one digit. `rwx`=7, `r-x`=5, `r--`=4.
- **`chmod` octal mode** : The way of overwriting the entire permission set at once.
- **`chmod` symbolic mode** : The way of changing only part using `u/g/o/a` and `+ - =`.
- **Uppercase `X`** : A safe notation for recursion that adds execute permission only to directories or files that already have x.
- **`chown` / `chgrp`** : Commands that change the owner and owning group. Only root can change the owner.
- **umask** : A mask specifying the **permissions to shave off** for newly created files and directories. The larger the value, the more restrictive.
- **666 / 777 starting points** : Files start from 666 with execute removed, and directories start from 777 because entry is needed.
- **`stat -c "%a %A %n"`** : A command to see the octal permissions and rwx notation at once.

## 📝 Practice Questions

**Question 1.** Which correctly expresses the permission `rwxr-x---` in octal?

A) 740

B) 750

C) 755

D) 705

**Answer: B**

Explanation: rwx=7 (4+2+1), r-x=5 (4+1), ---=0, so it is 750. A's 740 is when group is r-- (4), C's 755 is when other is r-x (5), and D's 705 is when group has no permissions and other is r-x. You must add each class in owner-group-other order with r=4, w=2, x=1.

---

**Question 2.** In an environment where `umask` is set to 022, what are the permissions of a newly created regular file?

A) 755 (rwxr-xr-x)

B) 644 (rw-r--r--)

C) 666 (rw-rw-rw-)

D) 600 (rw-------)

**Answer: B**

Explanation: The default maximum permission of a file is 666, and subtracting umask 022 gives 644 (rw-r--r--). A's 755 is the result for a directory (777-022), C is the starting value with no umask applied, and D is the file permission when umask is 077. The key point is that files start from 666 and directories from 777.

---

**Question 3.** Which is correct about the meaning of execute (x) permission on a directory?

A) You can view the list of files in the directory with `ls`

B) You can `cd` into the directory and access the files inside

C) You can create new files in the directory

D) You can execute-copy the directory to another location

**Answer: B**

Explanation: On a directory, x is the permission to enter (`cd`) that directory and pass through its internal path to access files. Viewing the list in A is the meaning of r permission, and creating files in C is the meaning of w permission. D is an action that does not exist. Without x on a directory, you cannot access the files inside even if you have r.

---

**Question 4.** Which operation can a regular user (not root) NOT perform on a file they own?

A) Change permissions with `chmod`

B) Change the group to a group they belong to with `chgrp`

C) Transfer ownership to another user with `chown`

D) Delete the file with `rm` (when they have w permission on the directory)

**Answer: C**

Explanation: `chown`, which changes the owner to another user, is possible only for root. If regular users could hand over ownership, abuse such as evading disk quotas would be possible. A, B, and D can be done by a regular user within the scope of their own file/group/directory permissions.

---

**Question 5.** Which is correct about the effect of the command `chmod g-w,o-r file.txt`?

A) It adds write permission for both group and other

B) It removes write from the group and read from other

C) It removes read from the group and write from other

D) It removes all permissions of the owner

**Answer: B**

Explanation: In symbolic mode, `g-w` removes write (w) from the group (g), and `o-r` removes read (r) from other (o). The two changes are combined with a comma. A is the behavior of `+` (add), so it is the opposite; C has the targets and permission letters swapped; and D is wrong because it does not touch the owner (u).

---

**Question 6.** When `umask` is 077, what are the permissions of a newly created directory?

A) 700 (rwx------)

B) 755 (rwxr-xr-x)

C) 600 (rw-------)

D) 777 (rwxrwxrwx)

**Answer: A**

Explanation: A directory starts from 777, and subtracting umask 077 gives 700 (rwx------). B is the directory when umask is 022, and C is the file permission (666-077) when umask is 077. D is the value with no umask applied. The larger the umask, the more permissions are removed and the more restrictive it becomes.

---

**Question 7.** Which is correct about the side effect when applying `chmod -R 755 /var/www` to a tree mixing regular files and directories?

A) You can no longer enter the directories

B) Unnecessary execute (x) permission is granted to all regular files as well

C) The owner of all files changes

D) Only subdirectories change and the files are not affected

**Answer: B**

Explanation: `-R 755` makes everything rwxr-xr-x without distinguishing directories and files, creating a security risk in which x permission is attached even to regular files that do not need to be executed. To split by type, use `find -type f`/`-type d` or the symbolic uppercase `X`. A is the exact opposite (x is granted), C is the behavior of chown, and D is wrong because `-R` applies to everything.

---
