# Day 3 - Special Permissions: SetUID · SetGID · Sticky bit

## 📌 Key Takeaways

- There is a **fourth digit** in front of the nine rwx slots. This is the **special permission**.
- **SetUID (4) · SetGID (2) · Sticky bit (1)** — memorize the values and the order exactly.
- They show up as **`s` and `t`**. SetUID is in the owner's x slot, SetGID is in the group's x slot, and Sticky is in the other's x slot.
- The signature examples are fixed — **SetUID is `/usr/bin/passwd`, Sticky bit is `/tmp`**.
- **In a directory with the Sticky bit set, you can delete only your own files.**

## The Fourth Digit

The `755` we've seen so far is actually the **last three digits**. There is one more digit in front.

```text
      4     7     5     5
      │     │     │     │
      │     │     │     └── other
      │     │     └──────── group
      │     └────────────── user
      └──────────────────── special permission
```

| Special permission | Value | Where it attaches | Display |
|----------|-----|----------|------|
| **SetUID** | **4** | x of user | **`s`** |
| **SetGID** | **2** | x of group | **`s`** |
| **Sticky bit** | **1** | x of other | **`t`** |

- Normally this digit is 0, so it is omitted. `chmod 755` and `chmod 0755` are the same.
- The values are in **4-2-1 order**, exactly like rwx. If you get confused, remember "4, 2, 1 from the top."

## SetUID — You Become the Owner While It Runs

```bash
chmod 4755 program       # octal method
chmod u+s program        # symbolic method
```

```text
   -rwsr-xr-x  1 root root  ...  /usr/bin/passwd
      └ the s in the owner's x slot = SetUID
```

- While running that file, it operates with the **privileges of the file's owner, not the person executing it**.
- The signature example is **`/usr/bin/passwd`**. Passwords are in `/etc/shadow`, which only root can read, yet a regular user must be able to change their own password. Because SetUID is set on `passwd`, the moment it runs it can modify shadow with root privileges.
- That makes it **a security risk**. If a program with SetUID has a vulnerability, it leads straight to a root privilege takeover.

### Why passwd Can Modify shadow

```text
$ ls -l /etc/shadow /usr/bin/passwd
----------. 1 root root  1284 Sep  3 09:00 /etc/shadow
-rwsr-xr-x. 1 root root 27856 Sep  3 09:00 /usr/bin/passwd
```

| Step | What happens |
|------|-----------|
| ① | A regular user `alice` runs `passwd` (it is executable because the other slot has `x`) |
| ② | Because the owner slot is `s`, this process runs with the **privileges of the file's owner, root, not alice** |
| ③ | With root privileges, it can modify `/etc/shadow`, which alice can't even read |
| ④ | When `passwd` ends, those privileges end too. alice's shell is still alice |

- **The privilege elevation happens only while that program runs, and only inside that program.** It is not that alice becomes root.
- **Whose privileges it becomes is decided by the file's owner.** Even with SetUID set, if the owner is `bob`, it just runs with bob's privileges. It is not "SetUID = root privileges" but "**SetUID = owner's privileges**," and it becomes dangerous when the owner is root.
- Besides `passwd`, SetUID programs include `su` and `sudo` — **commands that a regular user runs but that can only do their job with administrator privileges**.
- SetUID is **a permission placed on executable files**. Placed on a directory, it has no effect in Linux, and placed on a shell script, it is ignored for security reasons.

## SetGID — Use Group Privileges, and Pass the Group Down

```bash
chmod 2755 program       # on a file
chmod g+s /project       # on a directory
```

SetGID **does different things when placed on a file and on a directory.**

| Target | Effect |
|------|------|
| **File** | While running, it operates with the **privileges of the file's owning group** |
| **Directory** | Files created inside it **inherit the directory's group** |

```text
   -rwxr-sr-x  1 root tty  ...  /usr/bin/wall
         └ the s in the group's x slot = SetGID
```

- Placing it on a directory is used far more often in practice. It solves the collaboration problem we left open yesterday — the problem that the group of each person's files ends up all over the place.

```bash
sudo chgrp dev /project
sudo chmod 2770 /project     # SetGID + rwxrwx---
# now whoever creates a file inside /project, the group is always dev
```

Putting before and after side by side makes the difference clear.

```text
$ ls -ld /project
drwxrws---. 2 root dev 6 Sep  3 09:00 /project      ← s in the group slot
$ id -gn
alice
$ touch /project/plan.txt
$ mkdir /project/docs
$ ls -l /project
drwxr-sr-x. 2 alice dev 6 Sep  3 09:06 docs
-rw-r--r--. 1 alice dev 0 Sep  3 09:05 plan.txt
```

- Even though alice's primary group is `alice`, the new file's group is **`dev`**. Yesterday this was `alice`.
- **The owner is still the creator (alice).** What SetGID passes down is **only the group**.
- The subdirectory `docs` created inside **also inherits SetGID** (`drwxr-sr-x`). So the group is maintained even deeper down.
- The group of **files that already existed before** it was set doesn't change. Fix those separately with `chgrp -R dev /project`.
- The group is matched, but **it doesn't open up the permissions as well.** The `plan.txt` above has no `w` for the group. To let members edit each other's files, set umask to 002 or add `chmod g+w`.

## Sticky bit — You Can't Delete Others' Files

```bash
chmod 1777 /shared
chmod o+t /shared
```

```text
   drwxrwxrwt  10 root root  ...  /tmp
            └ the t in the other's x slot = Sticky bit
```

- If a directory has `w` permission, by default **you can even delete other people's files.** That's because, regardless of the file's own permissions, write permission on the directory lets you delete the entries inside.
- With the Sticky bit set, **only the file's owner and root can delete that file.**
- The signature example is **`/tmp`**. Everyone must be able to create temporary files, but must not delete other people's temporary files, so it is set to `1777`.

```text
$ ls -l /tmp/a.txt
-rw-r--r--. 1 alice alice 6 Sep  3 09:00 /tmp/a.txt
$ whoami
bob
$ cat /tmp/a.txt                 ← the file's other slot has r, so reading works
hello
$ rm -f /tmp/a.txt
rm: cannot remove '/tmp/a.txt': Operation not permitted
$ mv /tmp/a.txt /tmp/b.txt
mv: cannot move '/tmp/a.txt' to '/tmp/b.txt': Operation not permitted
```

- What the Sticky bit blocks is **deletion and renaming**. Whether you can read the file contents is still decided by **the file's own permissions**. Above, bob was able to read but couldn't delete or rename.
- The people who can delete are **the file's owner, the directory's owner, and root**.
- The Sticky bit is **a permission placed on directories**. Besides `/tmp`, `/var/tmp` is also 1777.

| Directory permission | Anyone can create files | Delete others' files |
|--------------|---------------|-------------|
| `777` (`rwxrwxrwx`) | O | **O — dangerous** |
| `1777` (`rwxrwxrwt`) | O | **X** |
| `755` (`rwxr-xr-x`) | X (owner only) | X |

## The Three at a Glance

| Kind | Value | Display | Position | Signature example | What it does |
|------|-----|------|------|--------|--------|
| **SetUID** | **4** | `s` | user x | **`/usr/bin/passwd`** | Runs with owner's privileges |
| **SetGID** | **2** | `s` | group x | `/usr/bin/wall` | Runs with group's privileges / **group inheritance** |
| **Sticky** | **1** | `t` | other x | **`/tmp`** | **Can delete only your own files** |

### When You See Uppercase

If there is originally **no `x`** in that slot, it is shown as **uppercase `S` or `T`**.

| Display | Meaning |
|------|-----|
| **`s`** / **`t`** | Special permission set + **execute permission present** |
| **`S`** / **`T`** | Special permission set + **no execute permission** |

- `-rwSr--r--` is a state where SetUID is set but the owner has no execute permission. It's usually a configuration mistake.

`s` and `t` are marks that **borrow the `x` slot**. Since two pieces of information (execute permission + special permission) have to be written overlapped in one slot, they are distinguished by case.

| Character in that slot | Execute permission | Special permission |
|--------------|----------|----------|
| `x` | Yes | No |
| `-` | No | No |
| `s` / `t` | **Yes** | **Yes** |
| `S` / `T` | **No** | Yes |

```text
$ chmod 4644 a.sh ; ls -l a.sh
-rwSr--r--. 1 user user 0 Sep  3 09:00 a.sh       ← 644 has no x, so uppercase S
$ chmod u+x a.sh ; ls -l a.sh
-rwsr--r--. 1 user user 0 Sep  3 09:00 a.sh       ← once x is added, lowercase s
```

### Notation to Number, Number to Notation

Read a four-digit value by splitting it into **the first digit (special) + the last three digits (regular)**. When converting notation to a number, first treat `s` and `t` as `x`, work out the three digits, and then attach the front digit.

| Notation | Special | Regular | Value |
|------|------|------|-----|
| `rwsr-xr-x` | SetUID 4 | `rwxr-xr-x` 755 | **4755** |
| `rwxr-sr-x` | SetGID 2 | `rwxr-xr-x` 755 | **2755** |
| `rwxrwxrwt` | Sticky 1 | `rwxrwxrwx` 777 | **1777** |
| `rwxrws---` | SetGID 2 | `rwxrwx---` 770 | **2770** |
| `rwsr-sr-x` | SetUID 4 + SetGID 2 | `rwxr-xr-x` 755 | **6755** |
| `rwxrwsrwt` | SetGID 2 + Sticky 1 | `rwxrwxrwx` 777 | **3777** |
| `rwSr--r--` | SetUID 4 | `rw-r--r--` 644 | **4644** |

- Special permissions are also **added together**. Setting SetUID and SetGID together is 4+2=6, and setting all three is 7.
- Tell SetUID and SetGID apart by **which slot the `s` is in** — if in the first three slots, SetUID; if in the second three slots, SetGID. `t` is always in the last slot.

### Collected Commands for Setting and Clearing

| What you want to do | Symbolic method | Octal method (based on 755) |
|----------|----------|---------------------|
| Set SetUID | `chmod u+s file` | `chmod 4755 file` |
| Set SetGID | `chmod g+s target` | `chmod 2755 target` |
| Set Sticky bit | `chmod o+t directory` (`+t` works too) | `chmod 1755 directory` |
| Clear SetUID | `chmod u-s file` | `chmod 0755 file` |
| Clear SetGID | `chmod g-s target` | — |
| Clear Sticky bit | `chmod o-t directory` | — |

- In the symbolic method, attach **`s` to `u` or `g`, and `t` to `o`**. `chmod u+t` and `chmod o+s` are combinations that make no sense.
- The symbolic method can set and clear **just one** special permission without touching other permissions, so it is the surer way when clearing.

## Looking Them Up

```bash
find / -perm -4000 -type f      # every file with SetUID set
find / -perm -2000 -type f      # SetGID
find / -perm -1000 -type d      # Sticky bit
ls -ld /tmp                     # drwxrwxrwt
ls -l /usr/bin/passwd           # -rwsr-xr-x
```

- **Pulling a list of SetUID files and inspecting it is a basic security audit procedure.** If there are unfamiliar files beyond what should be there, suspect a compromise.

The range that gets found changes depending on the symbol in front of the number after `-perm`.

| Usage | What it finds |
|---------|--------|
| `-perm 4755` | Permissions are **exactly** 4755 |
| `-perm -4000` | The **SetUID bit is on**, whatever the other permissions are |
| `-perm -6000` | **Both** SetUID and SetGID are on |
| `-perm /6000` | **Either one** of SetUID and SetGID is on |

- If you write just `-perm 4000`, it looks for "files whose permissions are exactly 4000 (`---S------`)," so nothing comes out. **Adding the `-`** makes it "those that include that bit."

```text
$ stat -c '%a %A %n' /tmp /usr/bin/passwd
1777 drwxrwxrwt /tmp
4755 -rwsr-xr-x /usr/bin/passwd
```

> Tomorrow we cover the space where files are actually stored — the commands for attaching, detaching, and checking file systems.

## 📖 Glossary

- **Special permission** : The permission placed in the fourth digit in front of the three rwx classes. SetUID, SetGID, Sticky bit.
- **SetUID** : Value 4. A permission that makes a program operate with the file owner's privileges while it runs.
- **SetGID** : Value 2. On a file, it makes it run with the owning group's privileges, and on a directory, it passes the group down to new files.
- **Sticky bit** : Value 1. A permission that restricts a directory so you can delete only your own files in it.
- **`/tmp`** : The classic shared temporary directory with the Sticky bit set. Its permission is 1777.
- **`/usr/bin/passwd`** : The classic command with SetUID set. It lets a regular user modify `/etc/shadow`.
- **Group inheritance** : The behavior in which, in a directory with SetGID set, new files follow the directory's group.

## 📝 Practice Questions

**Question 1.** Which of the following correctly lists the octal values for SetUID, SetGID, and Sticky bit, in order?

A) 1, 2, 4  
B) 2, 4, 1  
C) 4, 1, 2  
D) 4, 2, 1  

**Answer: D**  
Explanation: For special permissions, SetUID is 4, SetGID is 2, and Sticky bit is 1. It is the same order as the regular permissions r=4, w=2, x=1, so it is convenient to memorize them together. These values go in the fourth digit of the permission notation, that is, the leading digit.

---

**Question 2.** Which of the following permissions is set on the `/tmp` directory so that you can delete only the files you created?

A) SetUID  
B) Sticky bit  
C) SetGID  
D) umask  

**Answer: B**  
Explanation: If a directory has write permission, you can by default delete other people's files too. Setting the Sticky bit restricts deletion to the file's owner and root. `/tmp` must be usable by everyone but must not let people touch others' files, so its permission is set to 1777.

---

**Question 3.** Which of the following is a correct description of a file with the permission `-rwsr-xr-x`?

A) All users can delete it  
B) Only group members can execute it  
C) It operates with the file owner's privileges while it runs  
D) It operates with the executor's group privileges while it runs  

**Answer: C**  
Explanation: The execute permission in the owner slot shown as `s` means SetUID has been set. When this file is run, it operates with the file owner's privileges no matter who runs it. The classic example is `/usr/bin/passwd`, which lets a regular user update the root-owned `/etc/shadow`.

---

**Question 4.** Which of the following is the effect when SetGID is set on a directory?

A) Files created inside it inherit the directory's group  
B) Only the owner can delete the files inside it  
C) No one can enter that directory  
D) All the files inside become owned by root  

**Answer: A**  
Explanation: When SetGID is placed on a directory, the group of files newly created inside it is set to the directory's group rather than the creator's primary group. It is used to keep the group consistent in a collaboration directory used together by several users. What lets you delete only your own files is the Sticky bit.

---

**Question 5.** Which of the following commands grants the SetUID permission on a file?

A) chmod 2755 file  
B) chmod 4755 file  
C) chmod 1755 file  
D) chmod u+t file  

**Answer: B**  
Explanation: The value of SetUID is 4, so you specify it as `chmod 4755` by putting 4 in front of the existing permission 755. In the symbolic method, use `chmod u+s`. 2755 sets SetGID, and 1755 sets the Sticky bit.
