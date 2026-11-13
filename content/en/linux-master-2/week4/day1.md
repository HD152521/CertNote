# Day 1 - The Structure of Permissions: rwx and Octal

## 📌 Key Takeaways

- Linux permissions are a **9-slot** structure that gives **rwx** to each of three classes: **owner (user) · group · other**.
- Add **r=4, w=2, x=1** to write each class as a single digit. So `rwx`=7, `rw-`=6, `r-x`=5.
- **On a directory, `x` means not "execute" but "can enter."** Some questions ask about this difference.
- The command for changing permissions is **`chmod`**. Both the **octal method** (`chmod 755`) and the **symbolic method** (`chmod u+x`) are used.
- Values to memorize: **files 644 · directories 755 · secret files 600 · dangerous 777**.

## Permissions Are Nine Slots

Look again at the first ten characters of `ls -l`. The first character is the **file type**, and the remaining nine characters are the permissions.

```text
   -  rwx  r-x  r--
   │   │    │    │
   │   │    │    └── other  everyone else
   │   │    └─────── group  owning group
   │   └──────────── user   owner
   └──────────────── file type (- file, d directory, l link)
```

- Read them in groups of three. The order is **owner → group → other**.
- Where there is no permission, a **`-`** goes in that spot. `r-x` means reading and executing are allowed but writing is not.

### Who Gets Which Slot

| Situation | Slot that applies |
|------|-----------|
| I am the file's **owner** | **user** slot only |
| I belong to the owning **group** | **group** slot only |
| Neither | **other** slot only |

> **Only one** applies, going from the top. If you are the owner, you look at only the user slot, no matter how generous the group and other slots are. That's why giving the owner narrow permissions can produce a situation where the owner can't read.

The determination happens exactly once, in the following order. **If it matches early, the later ones aren't checked.**

```text
   ① Is it root?               → yes: it is hardly subject to rwx checks
   ② Is it the file's owner?   → yes: decided by the user slot. Done
   ③ In the owning group?      → yes: decided by the group slot. Done
   ④ Any other user            → decided by the other slot
```

Let's work through one example. `alice` is in the `dev` group, `bob` is also in the `dev` group, and `carol` is in neither.

```text
   -rw-r-----  1 alice dev  120 Sep  3 09:00 plan.txt
```

| User | Slot applied | Read | Write |
|--------|--------|------|------|
| alice (owner) | `rw-` | O | O |
| bob (dev group) | `r--` | O | **X** |
| carol (other) | `---` | **X** | X |
| root | — | O | O |

- This time, assume the permissions are `----rw-rw-` (066). **Because alice is the owner, only the user slot `---` applies to her, and she cannot read.** This is so even though bob in the same group and carol, an outsider, can read and write.
- However, since alice is the owner, she **can fix the permissions again with `chmod`.** The qualification to change permissions is decided not by rwx but by **ownership**.
- root is not subject to read/write checks. That's why root can read even a `000` file.

## What rwx Means — Files and Directories Differ

| Permission | On a **file** | On a **directory** |
|------|------------|----------------|
| **r** (read) | Read the contents | **View the listing** (`ls`) |
| **w** (write) | Modify the contents | **Create and delete inside** |
| **x** (execute) | **Execute it** | **Enter it** (`cd`) |

- Without **`x`** on a directory, you **can't enter it with `cd`.** Even if you know what's inside, access is blocked.
- **`w` on a directory is the permission to create and delete files inside it.** It is separate from the permissions of the files themselves. That is, **even a read-only file can be deleted if the directory has `w`.**
- A directory with only `r` and no `x` shows only the names, and you can't see the detailed info.

### Directory Permissions Must Be Read as Combinations

It makes sense if you think of a directory as **a table listing names**. `r` is the permission to read that table, `w` is the permission to add and remove rows in the table, and `x` is the permission to follow a name in the table and **actually reach the file**.

| Directory permission | `ls` | `cd` | Reading files inside | Creating/deleting files |
|--------------|------|------|--------------|------------------|
| `r-x` | O | O | O | **X** |
| `rwx` | O | O | O | O |
| `--x` | **X** | O | O if you **know** the name | X |
| `r--` | Names only | **X** | X | X |
| `rw-` | Names only | X | X | **X** (`w` is powerless without `x`) |
| `-wx` | X | O | O if you know the name | O |

- **`w` is only useful together with `x`.** That's because to create or delete a file you must be able to reach that directory.
- **`x` is needed along the whole path.** To read `/home/alice/docs/a.txt`, **all of `/`, `/home`, `/home/alice`, and `/home/alice/docs` need `x`.** Even if the file's permission is 644, if a single directory in the middle is blocked, you can't read it.

```text
$ chmod a-x docs
$ cd docs
bash: cd: docs: Permission denied
$ ls -l docs
ls: cannot access 'docs/a.txt': Permission denied
total 0
-????????? ? ? ? ?            ? a.txt
$ cat docs/a.txt
cat: docs/a.txt: Permission denied
```

- In a directory with only `r` left, `ls -l` **finds out the name (`a.txt`)** but can't reach that file's info, so the permission, owner, and size slots all come out as `?`.

### Three Things Often Confused About Files

- **The permission to delete a file isn't on the file.** `rm` removes a name from the directory's listing, so it is decided by **the directory's `w` and `x`**. A file's `w` is only the permission to modify its contents.
- **A script won't run with `x` alone.** The shell has to read the contents, so `r` is needed too.
- **A symbolic link always shows as `lrwxrwxrwx`.** The actual access is decided not by the link but by **the permissions of the original it points to**.

## Converting to Octal

Each permission is assigned a value, and you **add them up.**

| Permission | Value |
|------|-----|
| **r** | **4** |
| **w** | **2** |
| **x** | **1** |
| `-` | 0 |

| Notation | Calculation | Digit |
|------|------|------|
| `rwx` | 4+2+1 | **7** |
| `rw-` | 4+2 | **6** |
| `r-x` | 4+1 | **5** |
| `r--` | 4 | **4** |
| `-wx` | 2+1 | **3** |
| `-w-` | 2 | **2** |
| `--x` | 1 | **1** |
| `---` | 0 | **0** |

Joining the three classes together gives a three-digit number.

```text
   rwx  r-x  r-x
    7    5    5     →  755

   rw-  r--  r--
    6    4    4     →  644
```

### Values to Memorize

| Value | Notation | Where it's used |
|-----|------|----------|
| **644** | `rw-r--r--` | Default for **regular files** |
| **755** | `rwxr-xr-x` | Default for **directories** and executables |
| **600** | `rw-------` | Private keys, config files — **owner only** |
| **700** | `rwx------` | Personal directories |
| **666** | `rw-rw-rw-` | Anyone can modify — dangerous |
| **777** | `rwxrwxrwx` | **Everything to everyone** — very dangerous |

> **777 is not the answer.** When a permission problem comes up, giving 777 works for the moment but leaves everyone able to delete and modify. Both on the exam and in practice, it is treated as a "not recommended setting."

### Converting in Both Directions

**Number → symbols** splits each digit into 4, 2, and 1.

```text
   640  →  6 = 4+2    4 = 4      0 = 0
           rw-        r--        ---      →  rw-r-----

   751  →  7 = 4+2+1  5 = 4+1    1 = 1
           rwx        r-x        --x      →  rwxr-x--x
```

**Symbols → number** splits into groups of three and adds.

```text
   rw-rw-r--  →  (4+2) (4+2) (4)      →  664
   rwxr-x---  →  (4+2+1) (4+1) (0)    →  750
   r--------  →  (4) (0) (0)          →  400
```

| Value | Notation | How to read it |
|-----|------|--------|
| 640 | `rw-r-----` | Owner reads and writes, group reads only, others blocked |
| 750 | `rwxr-x---` | A directory that only up to the group can enter |
| 664 | `rw-rw-r--` | A file the group can also modify |
| 775 | `rwxrwxr-x` | A directory used jointly by the group |
| 400 | `r--------` | Even the owner can only read |
| 711 | `rwx--x--x` | A directory where others can't see the listing but can pass through |

- **If a digit is odd, it has `x`.** That's because a 1 has to be added to make it odd. 5 and 7 can execute; 4 and 6 can't.
- **2, 3, 6, and 7 have `w`.** To see "can other users write," check whether the last digit is one of these four.
- The maximum for one digit is 7. **Values containing 8 or 9, like `chmod 855`, don't exist.**

## chmod — Changing Permissions

### Octal Method

```bash
chmod 755 script.sh      # rwxr-xr-x
chmod 644 note.txt       # rw-r--r--
chmod 600 id_rsa         # rw-------
chmod -R 755 /var/www    # recursively through subdirectories
```

- It **overwrites all three digits at once.** None of the existing permissions remain.

### Symbolic Method

```bash
chmod u+x script.sh      # add execute permission for the owner
chmod g-w note.txt       # remove the group's write permission
chmod o=r note.txt       # set others to read only
chmod a+r note.txt       # add read for everyone
chmod u+x,g+w file       # several at once, separated by commas
```

| Target | Meaning |
|------|-----|
| **u** | user — owner |
| **g** | group — group |
| **o** | other — others |
| **a** | all — everything (u+g+o) |

| Operator | Meaning |
|--------|-----|
| **`+`** | **Add** permission |
| **`-`** | **Remove** permission |
| **`=`** | **Set to** that permission (removes the rest) |

> The difference between the two methods. **Octal writes the whole thing anew, while symbolic adds and subtracts from the current state.** For a question that says "just add execute permission," `chmod u+x` is right, and for a question that says "make the permissions rwxr-xr-x," `chmod 755` is right.

Applying them in sequence to the same file shows the difference among the three operators.

| Step | Command run | Permissions after | What happened |
|------|-----------|------------|----------|
| Start | — | `rw-r--r--` (644) | |
| 1 | `chmod g+w note.txt` | `rw-rw-r--` (664) | Only `w` was added to the group |
| 2 | `chmod o-r note.txt` | `rw-rw----` (660) | Only the `r` of others was removed |
| 3 | `chmod u=r note.txt` | `r--rw----` (460) | The owner is left with `r` **only** |
| 4 | `chmod a=rw note.txt` | `rw-rw-rw-` (666) | All three set to `rw` |
| 5 | `chmod go= note.txt` | `rw-------` (600) | Group and other permissions all emptied |

- **`+` and `-` touch only what is written and leave the rest as is.** **`=` rewrites all three slots of that target.**
- Targets can be written together — `ug+x` (owner and group), `go-w` (group and others). Leaving the part after `=` empty removes all permissions.
- You should be able to write the same result both ways — `chmod 755 f` = `chmod u=rwx,go=rx f`, `chmod 600 f` = `chmod u=rw,go= f`.

| `chmod` option | Meaning |
|-------------|-----|
| `-R` | Apply to **everything below** the directory (uppercase) |
| `-v` | Print the result for each file processed |
| `-c` | Print only what **actually changed** |

> ⚠️ **`chmod -R 755 directory` makes even the regular files inside all executable.** 755 is right for directories but 644 is right for document files. When you use the recursive option, remember that the same value goes onto both directories and files. And the recursion for `chmod` is **uppercase `-R`**, not `-r`.

- **Only the file's owner and root** can use `chmod`. Group members or other users who have write permission can't change permissions.

## Checking Permissions

```bash
ls -l note.txt           # -rw-r--r-- 1 user group ...
ls -ld /var/www          # the directory's own permissions (-d is the key)
stat note.txt            # shows octal and symbolic notation together
```

- The `-d` in **`ls -ld`** is an option meaning "look at **the directory itself**, not what's inside." Running `ls -l` on a directory without `-d` gives a list of its contents.

```text
$ stat note.txt
  File: note.txt
  Size: 0               Blocks: 0          IO Block: 4096   regular empty file
Access: (0644/-rw-r--r--)  Uid: ( 1000/    user)   Gid: ( 1000/    user)
```

- On the `Access:` line of `stat`, **octal and symbolic notation appear side by side.** Use it to check that a conversion is right. The leading `0` is the slot for special permissions, which we cover the day after tomorrow.

> Tomorrow we cover ownership and groups, which decide **whose** these permissions are, and umask, which trims the default permissions.

## 📖 Glossary

- **Owner (owner/user)** : The user who created the file. The first three permission slots apply to this person.
- **Group** : The group attached to the file. Users who belong to that group get the middle three slots.
- **Other** : Everyone else who is neither the owner nor in the group.
- **rwx** : Read, write, and execute permissions. On a directory, they mean listing, creating/deleting, and entering.
- **Octal notation** : A permission notation that adds r=4, w=2, and x=1 to show each class as one digit.
- **`chmod`** : The command that changes permissions. It has an octal method and a symbolic method.
- **`ls -ld`** : An option to view the info of the directory itself, not its contents.

## 📝 Practice Questions

**Question 1.** Which of the following correctly shows the permission `rwxr-xr--` in octal?

A) 755  
B) 764  
C) 754  
D) 744  

**Answer: C**  
Explanation: Calculate in groups of three. `rwx` is 4+2+1=7, `r-x` is 4+1=5, and `r--` is 4. So it is 754. 755 would have `r-x` at the end, and 744 would have `r--` in the middle.

---

**Question 2.** Which of the following is the meaning of the `x` permission granted on a directory?

A) You can move into the directory  
B) You can run the directory as a program  
C) You can create files inside the directory  
D) You can view the directory's listing  

**Answer: A**  
Explanation: On a directory, `x` is not execute but the permission that allows entry (`cd`). Viewing the listing is handled by `r`, and creating or deleting files inside is handled by `w`. So a directory without `x` can't be entered even if you know the name.

---

**Question 3.** Which of the following commands adds execute permission only for the file's owner?

A) chmod 700 script.sh  
B) chmod a+x script.sh  
C) chmod o+x script.sh  
D) chmod u+x script.sh  

**Answer: D**  
Explanation: In the symbolic method, `u` is the owner, `g` is the group, `o` is other, `a` is everyone, and `+` is add permission. So to add only execute permission for the owner, use `u+x`. `chmod 700` is a method that erases all existing permissions and sets them anew.

---

**Question 4.** Which of the following is the default permission value commonly used for a plain text file?

A) 755  
B) 644  
C) 777  
D) 600  

**Answer: B**  
Explanation: 644 is `rw-r--r--`, the standard permission for a regular file where the owner reads and writes and everyone else can only read. 755 is used for directories and executables, and 600 for files that only the owner should access, like private keys. 777 gives everyone every permission, so it is not recommended.

---

**Question 5.** Which of the following commands grants read, write, and execute permissions to the owner, group, and other users alike?

A) chmod 644 file  
B) chmod 755 file  
C) chmod 700 file  
D) chmod 777 file  

**Answer: D**  
Explanation: All permissions are 4+2+1=7, so giving them to all three classes makes 777. However, 777 leaves everyone able to modify and delete the file, which is very dangerous from a security standpoint, and in practice it is treated as a setting to avoid.
