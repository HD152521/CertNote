# Day 2 - Ownership and umask

## 📌 Key Takeaways

- Every file carries one **owner and one owning group**. These are the 3rd and 4th columns of `ls -l`.
- **`chown` changes the owner, and `chgrp` changes the group.** You can also change both at once in the form `chown user:group`.
- **Only root can change the owner.** A regular user can't hand a file over to someone else, even if it's their own.
- **umask is a mask that trims the permissions of newly created files.** The **default for regular users is 022**.
- The base values differ — umask is subtracted from **666 for files and 777 for directories**. Files have no x from the start.

## The Two Names Attached to a File

```text
   -rw-r--r--  1  alice  dev  1024  Sep  3 09:00  report.txt
                   └─┬─┘  └┬┘
                     │     └── owning group (group)
                     └──────── owner (owner)
```

- When you create a file, **the creator becomes the owner** and **the creator's primary group becomes the owning group**.
- Which of the three permission slots (user/group/other) applies is decided by these two names.
- What a file actually stores is not names but **numbers (UID and GID)**. `ls -l` just looks them up in `/etc/passwd` and `/etc/group` and shows them as names. That is why files left behind after deleting an account show the **number** as-is in the owner slot.

```text
$ id
uid=1001(alice) gid=1001(alice) groups=1001(alice),1500(dev)
$ touch a.txt
$ ls -l a.txt
-rw-r--r--. 1 alice alice 0 Sep  3 09:00 a.txt
```

- Even though alice also belongs to the `dev` group, the new file's group is her **primary group, `alice`**. A secondary group only grants "eligibility to access"; it doesn't decide the group of a new file.

## chown and chgrp

| Command | What it does |
|------|--------|
| `chown alice file` | Set the **owner** to alice |
| `chown alice:dev file` | Owner and group **together** |
| `chown :dev file` | Group only (write only after the colon) |
| `chgrp dev file` | Set the **group** to dev |
| `chown -R alice:dev /data` | **Recursively** through subdirectories |

```bash
sudo chown alice report.txt        # change the owner
sudo chown alice:dev report.txt    # owner + group
sudo chgrp dev report.txt          # group only
sudo chown -R www-data:www-data /var/www
```

### The Position of the Colon Decides the Meaning

| Usage | Owner | Group |
|---------|-------|------|
| `chown alice file` | to alice | **unchanged** |
| `chown alice:dev file` | to alice | to dev |
| `chown :dev file` | **unchanged** | to dev |
| `chgrp dev file` | unchanged | to dev (same result as above) |

```text
$ ls -l report.txt
-rw-r--r--. 1 root root 1024 Sep  3 09:00 report.txt
$ sudo chown alice report.txt
$ ls -l report.txt
-rw-r--r--. 1 alice root 1024 Sep  3 09:00 report.txt
$ sudo chown :dev report.txt
$ ls -l report.txt
-rw-r--r--. 1 alice dev 1024 Sep  3 09:00 report.txt
```

- **`chown` changes only the owner and group.** The permissions `rw-r--r--` and the modification time stay the same. To adjust permissions too, you have to use `chmod` separately.
- It also accepts numbers instead of names — `chown 1001:1500 file`.
- As with `chmod`, recursion is **uppercase `-R`**. It is the same for all three: `chown`, `chgrp`, and `chmod`.

| Option | Meaning (common to `chown` and `chgrp`) |
|------|------------------------|
| `-R` | Apply to everything under the directory |
| `-v` | Print the result for each file processed |
| `-c` | Print only what actually changed |

If a regular user tries it, it gets blocked like this.

```text
$ chown bob a.txt
chown: changing ownership of 'a.txt': Operation not permitted
$ chgrp dev a.txt          ← allowed because alice belongs to dev
$ chgrp wheel a.txt        ← not allowed for a group she doesn't belong to
chgrp: changing group of 'a.txt': Operation not permitted
```

> **Only root can change the owner.** If a regular user could hand ownership of their own file to someone else, it would become possible to dodge disk quotas or plant files under someone else's name. On the other hand, **a group change is something the owner can also do, but only when switching to a group they belong to.**

| Action | Who can do it |
|------|---------------|
| **Change owner (`chown`)** | **Only root** |
| Change group (`chgrp`) | root, or the owner switching to a group they belong to |
| Change permissions (`chmod`) | root, or **the file's owner** |

## umask — The Mask That Trims Default Permissions

Why are new files made with 644 every time? It is **because umask trims the permissions from a fixed base value**.

```bash
umask          # 0022  ← check the current value
umask 077      # change the value (applies only to the current shell)
umask -S       # u=rwx,g=rx,o=rx  ← view in symbolic form
```

### How to Calculate

**Subtract umask from the base value.** But the base value differs for files and directories.

| Target | Base value | Reason |
|------|-------|------|
| **File** | **666** (`rw-rw-rw-`) | To **not give execute permission** to new files |
| **Directory** | **777** (`rwxrwxrwx`) | Because a directory **needs x to be entered** |

With umask 022:

```text
   file        666  -  022  =  644   (rw-r--r--)
   directory   777  -  022  =  755   (rwxr-xr-x)
```

With umask 077:

```text
   file        666  -  077  =  600   (rw-------)
   directory   777  -  077  =  700   (rwx------)
```

| umask | File | Directory | Character |
|-------|------|---------|------|
| **022** | **644** | **755** | Regular user **default** |
| **002** | 664 | 775 | For group collaboration |
| **077** | 600 | 700 | Personal use only, strictest |
| 000 | 666 | 777 | No restriction — dangerous |

> **No matter how you set umask to 0, files never get execute permission.** That is because the base value is 666, so the x slot is empty from the start. This comes up as a trick question asking "if umask is 000, does the file become 777?" The answer is **666**.

### It Is "Masking," Not Subtracting

"Subtract from the base value" works out for values like 022 and 077, but what actually happens is **the permissions turned on in umask are switched off in the base value**. Permissions that weren't there to begin with don't change when switched off. This difference shows up when **odd** digits are in the umask.

With umask 033, simply subtracting for a file gives 666 − 033 = 633 (`rw--wx-wx`), but the actual result is different.

```text
   base (file)    6 6 6   rw- rw- rw-
   umask          0 3 3   --- -wx -wx     ← switch off what's on here (w, x)
   ─────────────────────────────────
   result         6 4 4   rw- r-- r--     ← there was no x originally, so only w is switched off
```

| umask | File | Directory | What to note |
|-------|------|---------|-------|
| 033 | **644** | 744 | The file is not 633 |
| 027 | 640 | 750 | Blocks only write for the group, and blocks everything for others |
| 007 | 660 | 770 | Blocks everything for others only |
| 011 | **666** | 766 | A file has no `x` to switch off, so it stays 666 |

- Tip: **For a directory, just subtract (777 − umask). For a file, remove the `x` from that result.** For 027, the directory is 750 (`rwxr-x---`), and the file is 640 (`rw-r-----`) with the x taken off.
- So **the larger the umask value, the narrower the permissions.** 077 is the strictest and 000 is the loosest.

### Notation and Scope of Application

```text
$ umask
0022
$ umask -S
u=rwx,g=rx,o=rx
$ umask 027
$ touch new.txt; mkdir newdir
$ ls -ld new.txt newdir
-rw-r-----. 1 user user 0 Sep  3 09:00 new.txt
drwxr-x---. 2 user user 6 Sep  3 09:00 newdir
```

- When `umask` shows four digits (`0022`), **the leading 0 is the slot for special permissions**. `022` and `0022` are the same value.
- **`umask` shows what to "block," and `umask -S` shows what "remains."** 022 and `u=rwx,g=rx,o=rx` are the same setting written from opposite directions. The result of `-S` has the same shape as the directory permission (755).
- umask acts **only on what you create from now on**. Changing umask doesn't change the permissions of files that already exist. Fix existing files with `chmod`.
- umask only sets the **default** and is not a ceiling. If you run `chmod 777` after creating, it becomes 777 regardless of umask.

### Where the umask Value Lives

| File | Scope |
|------|------|
| `/etc/profile`, `/etc/bashrc` | **System-wide** |
| `~/.bashrc`, `~/.bash_profile` | **Per user** |

- A umask changed by command is valid **only in that shell** and disappears when you log out. To keep it, you must write it in the config files above.
- root's default umask is **022**, and depending on the distribution, regular users may get **002**.
- A distribution that gives 002 is one where each user gets **a private group with the same name as their own** as their primary group. Since only they are in that group, opening write permission to the group (664) is not really dangerous.
- If the exam asks for the "default umask" without conditions, answer **022** (file 644, directory 755).

| Where it's set | Who it applies to | How long it lasts |
|----------|----------|----------|
| `umask 027` on the command line | That shell and programs run from it | Gone when the shell is closed |
| `umask 027` in `~/.bashrc` | That user | Applied every time a new shell opens |
| `/etc/profile` · `/etc/bashrc` | All users | Persists (only root can edit) |

## Collaborating with Groups

For several people to use the same directory, **put them in the same group and open up the group permissions.**

```bash
sudo groupadd dev                  # create the group
sudo usermod -aG dev alice         # add a user (with -aG!)
sudo usermod -aG dev bob
sudo chgrp dev /project            # set the directory's group
sudo chmod 770 /project            # allow everything up to the group, block others
```

- `chmod 770` is `rwxrwx---`. **The owner and group can do everything, and other users are blocked from access altogether.**
- However, if you stop here, **the group of each person's files ends up all over the place**. What solves this is **SetGID**, which we learn tomorrow.

Let's follow what actually happens.

```text
$ ls -ld /project
drwxrwx---. 2 root dev 6 Sep  3 09:00 /project
$ id -gn                       ← alice's primary group
alice
$ touch /project/plan.txt
$ ls -l /project/plan.txt
-rw-r--r--. 1 alice alice 0 Sep  3 09:05 /project/plan.txt
```

| Stumbling block | Cause | How to solve it |
|--------|------|----------|
| The file's group is `alice`, not `dev` | A new file follows the creator's **primary group** | `chgrp dev file` — you have to do it every time (tomorrow's SetGID automates it) |
| The group permission is `r--` so bob can't edit | umask 022 masked the group's `w` | `chmod g+w file`, or set umask to **002** |
| A user just added to the group still can't access | The group list is decided **at login** | Log out and log in again |

- For collaboration to go smoothly, **all three** have to be right — membership in the same group, the directory's group permission, and the new file's group plus group write permission.
- Here is a one-line summary of what ownership, permissions, and umask each do.

| Tool | What it decides | When it acts |
|------|----------|-------------|
| `chown` / `chgrp` | **Whose** file it is | On files that already exist |
| `chmod` | **What** they can do | On files that already exist |
| `umask` | **With what permissions** a new file is born | On files you create from now on |

> Tomorrow we cover the **special permissions** that sit outside the three regular slots — SetUID, SetGID, and the sticky bit.

## 📖 Glossary

- **Owner (owner)** : The user who owns the file. The third column of `ls -l`.
- **Owning group (group)** : The group attached to the file. The fourth column of `ls -l`.
- **`chown`** : The command that changes the owner. Only root can run it.
- **`chgrp`** : The command that changes the owning group.
- **umask** : A mask that sets the value to trim from the permissions of newly created files and directories.
- **Base value** : The permissions before umask is applied. 666 for files and 777 for directories.
- **Primary group** : The group automatically attached to files a user creates. Decided by the GID field of `/etc/passwd`.

## 📝 Practice Questions

**Question 1.** Which of the following commands changes a file's owner and owning group at once?

A) chgrp alice dev file  
B) chown alice:dev file  
C) chmod alice.dev file  
D) chown -g dev file  

**Answer: B**  
Explanation: `chown` can specify the owner and group at once by joining them with a colon in the form `chown user:group`. Writing only after the colon (`chown :dev`) changes only the group. `chgrp` is a command that changes only the group, and `chmod` is a command that changes permissions.

---

**Question 2.** When the umask value is 022, which of the following is the permission of a newly created regular file?

A) 755  
B) 777  
C) 666  
D) 644  

**Answer: D**  
Explanation: The base value for a file is 666, and subtracting umask 022 from it gives 644. For a directory the base value is 777, so with the same umask it becomes 755. The reason the base values for files and directories differ is to avoid giving execute permission to new files.

---

**Question 3.** Which of the following has the authority to change a file's owner to another user?

A) Only the root user  
B) The file's owner  
C) Members of the file's group  
D) Any user with read permission  

**Answer: A**  
Explanation: Only root can transfer ownership. If a regular user could hand ownership of their own file to someone else, it would become possible to evade disk usage limits or plant files under another user's name. However, changing permissions (`chmod`) can be done by the owner too.

---

**Question 4.** When the umask value is 077, which of the following is the permission of a newly created directory?

A) 600  
B) 755  
C) 700  
D) 777  

**Answer: C**  
Explanation: Subtracting 077 from the directory's base value 777 gives 700, that is, `rwx------`. It is the strictest setting, where only the owner can view the listing, create files, and enter. With the same umask, a file becomes 600, which is 666 minus 077.

---

**Question 5.** Which of the following commands checks the umask value set in the current shell?

A) umask  
B) umask -c  
C) chmod -u  
D) ls -m  

**Answer: A**  
Explanation: Running `umask` with no arguments prints the currently set value. With `umask -S`, you can view it in symbolic form like `u=rwx,g=rx,o=rx`. To change the value, give an argument like `umask 022`, and since this change applies only to the current shell, you have to record it in `~/.bashrc` or similar to keep it.
