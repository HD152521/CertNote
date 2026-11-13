# Day 5 - Week 4 Review: Permissions on One Page

## 📌 Key Takeaways

- Permissions are four digits: **[special][owner][group][other]**. If the first digit is 0, it is omitted.
- **r=4 w=2 x=1**, **SetUID=4 SetGID=2 Sticky=1** — **both lines use the same 4·2·1**.
- **umask is subtraction.** It is subtracted from **666 for files and 777 for directories**. The default 022 → 644 / 755.
- **`chown` is root only**, while `chmod` can also be done by the owner.
- **`df` is the file system, `du` is the path.** `umount` has no n.

## Permissions on One Page

```text
   chmod  4  7  5  5   file
          │  │  │  │
          │  │  │  └── other   r-x
          │  │  └───── group   r-x
          │  └──────── user    rwx
          └─────────── special SetUID
                       4 SetUID · 2 SetGID · 1 Sticky

   -rws r-x r-x
    │└┬┘ └┬┘ └┬┘
    │ │   │   └── other
    │ │   └────── group
    │ └────────── owner (the s in the x slot = SetUID)
    └──────────── file type
```

```text
   umask calculation

     file        666  -  umask
     directory   777  -  umask

     022  →  file 644 · directory 755   (default)
     077  →  file 600 · directory 700   (strict)
     000  →  file 666 · directory 777   (a file is not 777!)
```

## Octal Conversion Table — Memorize This

| Digit | Notation | Digit | Notation |
|-----|------|-----|------|
| **7** | `rwx` | 3 | `-wx` |
| **6** | `rw-` | **2** | `-w-` |
| **5** | `r-x` | 1 | `--x` |
| **4** | `r--` | 0 | `---` |

| Permission value | Notation | Where it's used |
|-------|------|----------|
| **644** | `rw-r--r--` | Regular files |
| **755** | `rwxr-xr-x` | Directories and executables |
| **600** | `rw-------` | Private keys |
| **1777** | `rwxrwxrwt` | **`/tmp`** |
| **4755** | `rwsr-xr-x` | **`/usr/bin/passwd`** |

## Contrasting Easily Confused Pairs

| Comparison | A | B | Deciding criterion |
|------|---|---|-----------|
| `x` on a file vs `x` on a directory | Execute | **Enter (`cd`)** | What the target is |
| `r` on a file vs `r` on a directory | Read contents | **View listing** | Same as above |
| `chmod 755` vs `chmod u+x` | **Overwrites everything** | Adds to the current state | Preserving existing permissions |
| `chown` vs `chgrp` | Owner | Group | What gets changed |
| `chown` vs `chmod` | **Root only** | Owner can too | Who can do it |
| SetUID vs SetGID | Owner's privileges | Group's privileges / **group inheritance** | Which slot the s is in |
| SetGID (file) vs SetGID (directory) | Run with group privileges | **Pass the group down** | What the target is |
| Sticky vs plain `w` | **Delete only your own** | Delete others' too | Whether deletion is restricted |
| `s` vs `S` | x permission **present** | No x permission | Case |
| `df` vs `du` | **File system** capacity | Usage **per path** | What it counts |
| `/bin` vs `/sbin` | Regular commands | **Administrator commands** | Who uses them |
| `/` vs `/root` | Top level | **root's home** | Location |
| `/mnt` vs `/media` | Manual mounts | Removable media | Whether automatic |

## Commonly Missed Points

1. **With umask 000, a file is 777** → No. The file base value is **666**, so it is **666**. It is the directory that becomes 777.
2. **umask is addition** → It is **subtraction**. The larger the value, the narrower the permissions.
3. **`x` on a directory is execute** → It is **enter**. Without `x`, `cd` doesn't work.
4. **A read-only file can't be deleted** → It can be deleted. Deletion is decided by **the directory's `w`, not the file**. What prevents this is the Sticky bit.
5. **If you're the owner, you can do everything** → No. Only **the single user slot** applies. If the owner slot is narrow, the owner can't read.
6. **You can hand your own file to someone else** → `chown` is possible for **root only**.
7. **`unmount`** → It is **`umount`**. No n.
8. **Running `fsck` while mounted** → There's a risk of damage. Always do it **after unmounting**.
9. **Special permission order as 1·2·4** → It is **4 (SetUID) · 2 (SetGID) · 1 (Sticky)**. Memorize it in the same order as rwx.
10. **With umask 033, a file is 633** → It is **644**. umask just switches off the permissions that are on, so there is nothing to subtract for the `x` that the file never had.
11. **SetUID runs with root privileges** → Precisely, it is the privileges of the **file's owner**. When the owner is root, it becomes root privileges.
12. **With the Sticky bit set, you can't read others' files** → What it blocks is only **deletion and renaming**. Read and write are decided by the file's own permissions.
13. **`df /var/log` is the size of that directory** → It is the capacity of **the entire file system** that directory belongs to. The directory size is `du -sh`.
14. **`chmod -r` for subdirectories** → Recursion is **uppercase `-R`**. The same for `chown` and `chgrp`.

## Calculations to Work Out by Hand

In the exam room, you have to convert on the spot with no calculator. Let's follow one of each type.

### Type ① Symbols ↔ Numbers

```text
   rwxr-x--x   →  (4+2+1)(4+0+1)(0+0+1)  →  751
   rw-rw----   →  (4+2+0)(4+2+0)(0+0+0)  →  660
   640         →  6=rw-  4=r--  0=---    →  rw-r-----
   711         →  7=rwx  1=--x  1=--x    →  rwx--x--x
```

- Quick check: **odd digits have `x`.** 6, 4, 2, and 0 can't execute; 7, 5, 3, and 1 can.

### Type ② Results of the Symbolic Method

Start from `rw-r--r--` (644) and apply them in order.

| Command | Result | Value |
|------|------|-----|
| `chmod u+x` | `rwxr--r--` | 744 |
| `chmod go-r` | `rwx------` | 700 |
| `chmod a+r` | `rwxr--r--` | 744 |
| `chmod g=rw` | `rwxrw-r--` | 764 |
| `chmod o=` | `rwxrw----` | 760 |

- **`+` and `-` change only what's written, and `=` replaces all three slots of that target.** `g=rw` erases the permissions the group had and rewrites it as `rw-`.

### Type ③ umask

| umask | Directory (from 777) | File (from 666) |
|-------|-----------------|--------------|
| 022 | 755 | 644 |
| 002 | 775 | 664 |
| 027 | 750 | 640 |
| 077 | 700 | 600 |
| 033 | 744 | **644** |
| 000 | 777 | **666** |

- If you fix an order, you won't go wrong — **find the directory value first (777 − umask), and removing the `x` from it gives the file value.**
- There are questions that ask in reverse, too. "A new directory is created as 750. What is the umask?" → 777 − 750 = **027**.

### Type ④ Reading Special Permissions

| Notation | Value | What is set |
|------|-----|-------------|
| `-rwsr-xr-x` | 4755 | SetUID |
| `-rwxr-sr-x` | 2755 | SetGID |
| `drwxrwxrwt` | 1777 | Sticky bit |
| `drwxrws---` | 2770 | SetGID (collaboration directory) |
| `-rwsr-sr-x` | 6755 | SetUID + SetGID |
| `-rwSr--r--` | 4644 | SetUID but no execute permission |

- **An `s` in the first three slots is SetUID, an `s` in the middle three slots is SetGID, and a `t` at the very end is Sticky.**

## What Can This Person Do

The key to permission questions is sorting out "who gets which slot." `alice` and `bob` are in the `dev` group, and `carol` is not.

```text
   drwxrwx--T  2 root  dev   /project
   -rw-r-----  1 alice dev   /project/plan.txt
```

| Question | Answer | Reason |
|------|-----|------|
| Can bob read `plan.txt` | O | dev group → the file's group slot `r--` |
| Can bob modify `plan.txt` | X | The group slot has no `w` |
| Can bob delete `plan.txt` | **X** | The directory has `w`, but the **Sticky bit** is set so only the owner can delete |
| Can bob create a new file in `/project` | O | The directory's group slot `rwx` |
| Can carol enter `/project` | X | The directory's other slot has no `x` (the `T` is uppercase) |
| Can alice change `plan.txt`'s owner to bob | **X** | `chown` is root only |
| Can alice change `plan.txt`'s permissions | O | `chmod` can be done by the owner too |

- The order of reasoning is always the same — **① which slot applies (owner → group → other, just one) ② is the target a file or a directory ③ if it's deletion, it is the directory's permissions and the Sticky bit, not the file's.**

## Collected Commands and Options

| Command | What it does | Options you must remember |
|------|--------|--------------|
| `chmod` | Change permissions | `-R` recursive |
| `chown` | Change owner (and group) | `-R`, `owner:group` format |
| `chgrp` | Change group | `-R` |
| `umask` | View/set the default permission mask | `-S` view in symbols |
| `mount` | Attach a file system | `-t` type, `-o` options, `-a` all of fstab |
| `umount` | Detach | Device name or mount point |
| `df` | Capacity per file system | `-h`, `-T` type, `-i` inode |
| `du` | Usage per path | `-h`, `-s` total |
| `fsck` | Check/repair a file system | `-y` yes to all, run **after unmounting** |
| `find -perm` | Find by permissions | `-perm -4000` includes SetUID |
| `stat` | Shows octal and symbolic permissions together | |
| `ls -ld` | Permissions of the directory **itself** | |

| File | What |
|------|------|
| `/etc/fstab` | The list to **mount at boot** (6 fields) |
| `/etc/mtab`, `/proc/mounts` | The list **currently mounted** |
| `/etc/profile`, `/etc/bashrc` | System-wide umask setting |
| `~/.bashrc` | Per-user umask setting |

## One-Line Summaries of Directories

| Directory | One line | Directory | One line |
|---------|-------|---------|-------|
| `/bin` | Basic commands | `/sbin` | Administrator commands |
| `/etc` | Configuration files | `/var` | Changing things like logs and spool |
| `/home` | User homes | `/root` | root's home |
| `/dev` | Device files | `/proc` | Kernel and process info (virtual) |
| `/boot` | Kernel and bootloader | `/lib` | Shared libraries |
| `/usr` | Applications | `/opt` | Additional packages |
| `/tmp` | Temporary files (1777) | `/mnt`, `/media` | Mount points |

## Values That Appear on the Exam Exactly

| Value | What |
|-----|------|
| **4 / 2 / 1** | r / w / x, and also SetUID / SetGID / Sticky |
| **022** | The typical default umask |
| **666 / 777** | Base values for the umask calculation (file / directory) |
| **644 / 755** | Result of umask 022 |
| **1777** | Permission of `/tmp` |
| **4755** | Permission of `/usr/bin/passwd` |
| **`s` / `t`** | Display characters for SetUID·SetGID / Sticky bit |

> Next week covers the program that receives and interprets commands — the **shell**. Environment variables, redirection, and aliases come up.

## 📖 Glossary

- **Special permission slot** : The first digit of the four permission digits. If 0, it is omitted and written as three digits.
- **umask** : The value to trim from the permissions of new files and directories. The base is 666 for files and 777 for directories.
- **SetUID / SetGID / Sticky bit** : Special permissions with the values 4, 2, and 1 respectively.
- **Mount point** : The directory where a file system is attached.
- **FHS** : The Filesystem Hierarchy Standard that fixes directory names and roles.
- **inode exhaustion** : A state where capacity remains but no more files can be created. Check with `df -i`.

## 📝 Practice Questions

**Question 1.** Which of the following is the special permission set by the command `chmod 1777 /shared`?

A) SetUID  
B) Sticky bit  
C) SetGID  
D) No special permission  

**Answer: B**  
Explanation: In a four-digit permission, the leading digit is the special permission, and 1 is the Sticky bit. In a directory with the Sticky bit set, only the file's owner and root can delete that file. `/tmp` uses exactly this 1777 permission.

---

**Question 2.** When the umask value is 000, which of the following is the permission of a newly created regular file?

A) 777  
B) 755  
C) 644  
D) 666  

**Answer: D**  
Explanation: The base value for a file is 666, so even with umask 0 it can't exceed 666. It is designed so as not to automatically give execute permission to newly created files. A directory has a base value of 777, so under the same conditions it becomes 777.

---

**Question 3.** Which of the following is the condition that allows you to delete a file even if you don't have write permission on the file itself?

A) When you have write permission on the directory containing the file  
B) When you have read permission on the file  
C) When you have execute permission on the file  
D) When you belong to the file's group  

**Answer: A**  
Explanation: Deleting a file is decided not by the file's own permissions but by the write permission of the directory that contains it. That is because it is an action of removing an entry from the directory. For this reason, to prevent others' files from being deleted in a shared directory, you set the Sticky bit.

---

**Question 4.** Which of the following is the directory where administrator commands are mainly stored?

A) /bin  
B) /lib  
C) /sbin  
D) /opt  

**Answer: C**  
Explanation: `/sbin` holds commands used for system administration, such as `fdisk` and `shutdown`. `/bin` holds basic commands that regular users also use, like `ls` and `cp`, `/lib` holds shared libraries, and `/opt` holds additionally installed packages.

---

**Question 5.** Which of the following states does the permission notation `-rwxr-sr-x` represent?

A) SetUID is set  
B) The Sticky bit is set  
C) The group has no execute permission  
D) SetGID is set  

**Answer: D**  
Explanation: The execute permission in the group slot shown as `s` means SetGID has been set. Because it is a lowercase `s`, the execute permission is present as well. An `s` in the owner slot indicates SetUID, and a `t` in the other slot indicates the Sticky bit.

---

**Question 6.** Which of the following commands checks the total capacity taken up by a specific directory as a sum?

A) du -sh /var/log  
B) df -h /var/log  
C) ls -lh /var/log  
D) fsck /var/log  

**Answer: A**  
Explanation: `du` calculates usage per path, where `-s` is the option that gives only the total without listing sub-items, and `-h` displays in readable units. `df` is a command that shows the total capacity per file system, so it differs from the usage total of a specific directory.
