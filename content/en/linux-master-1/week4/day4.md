# Day 4 - Special Permissions and ACLs: SetUID · SetGID · Sticky bit · getfacl/setfacl

## 📌 Key Takeaways

- Special permissions are a **fourth octal digit** placed in front of the 9 bits — SetUID=4, SetGID=2, Sticky=1.
- **SetUID** runs a program with the owner's privileges no matter who executes it (`passwd`=4755). The biggest privilege-escalation risk point.
- A **SetGID directory** automatically passes down its group to files created inside it. The key tool for group collaboration.
- **Sticky bit** prevents deleting other people's files in a shared directory. `/tmp = 1777`.
- **ACLs** go beyond the three-slot limit of owner-group-other. The `+` at the end of `ls -l` is the signal of their presence, and **the mask is the upper bound**.

## Special Permissions — The Fourth Octal Digit

There are problems the 9 bits alone cannot solve. How does a regular user modify `/etc/shadow`, which only root can write? `/tmp` is writable by everyone, so why can't you delete other people's files? What if you want to give different permissions to just two people?

- When you write four digits of octal in `chmod`, the leading digit is the special permission. The weights are **SetUID=4, SetGID=2, Sticky=1**.

```bash
chmod 4755 program     # SetUID + rwxr-xr-x
chmod 2755 shareddir   # SetGID + rwxr-xr-x
chmod 1777 /tmp        # Sticky + rwxrwxrwx
chmod 6755 program     # SetUID+SetGID(4+2)
```

| Special Permission | Octal | Where ls Shows It | Effect Summary |
|----------|-------|-------------|-----------|
| SetUID | 4 | owner's x slot → `s` | Runs with the **owner's privileges** when executed |
| SetGID | 2 | group's x slot → `s` | Runs with the owning group's privileges / directory group inheritance |
| Sticky | 1 | other's x slot → `t` | In a directory, **only the owner can delete their own files** |

Special permissions appear **overlaid on the x slot** of the 9-bit permission display. SetUID is shown in the owner's x slot, SetGID in the group's x slot, and Sticky in the other's x slot. If x was originally present it shows as lowercase (`s`/`t`), and if x is absent it shows as uppercase (`S`/`T`). Uppercase is a warning sign that "the special permission is on but there is no execute permission, so it is effectively meaningless."

### SetUID — Run with the Owner's Privileges

An executable file with SetUID set runs with **the privileges of that file's owner, no matter who executes it**. The representative example is `/usr/bin/passwd`.

```bash
ls -l /usr/bin/passwd
# -rwsr-xr-x 1 root root ... /usr/bin/passwd
#    └ s in the owner's x slot = SetUID
```

The `passwd` command must modify `/etc/shadow`, which only root can write (permissions 000 or 400). How can a regular user alice change her own password? Because `passwd` has SetUID set and runs with the owner's (root's) privileges, the moment alice runs it, that process can modify shadow with root privileges. Without SetUID, a regular user could not even change their own password. That is the reason SetUID exists.

> ⚠️ **Trap**: SetUID is the **biggest security threat point**. If a program with SetUID has a vulnerability, an attacker can seize root privileges (privilege escalation). In particular, setting SetUID on shell scripts or general-purpose tools like `vi` and `cp` is absolutely forbidden (if `cp` had root SetUID, anyone could overwrite any file). That is why the Linux kernel **ignores SetUID on shell scripts altogether**. The command for regularly checking whether the system has unintended SetUID files appears on the exam:

```bash
# Search for all SetUID files (the security audit standard)
find / -perm -4000 -type f 2>/dev/null
# Search for SetGID files
find / -perm -2000 -type f 2>/dev/null
# Both SetUID + SetGID
find / -perm /6000 -type f 2>/dev/null
```

### SetGID — Run with Group Privileges + Directory Group Inheritance

SetGID works in two different contexts.

- **Set on an executable file**: runs with the privileges of the owning group (the group version of SetUID).
- **Set on a directory** (the exam key): the **owning group of new files and subdirectories** created inside automatically becomes that directory's group.
- Normally the file creator's primary group becomes the owning group, but in a SetGID directory the directory's group is inherited.

```bash
mkdir /project && chgrp dev /project && chmod 2775 /project
# Now whoever creates a file inside /project, the group is always dev
```

A SetGID directory is **the key tool for group collaboration**. When several people collaborate in one directory, if the group of each person's files differs, they block each other's access. If you set SetGID, all files get a common group, and if you grant group-write (g+w) to that group, the whole team can freely edit each other's files. In Day 3 we said "the group of a new file is the creator's primary group," and the SetGID directory is exactly that exception.

### Sticky bit — Deletion Protection for Shared Directories

- In Day 3 we said, "if you have w permission on a directory, you can delete files in it (even if you are not the owner)."
- In a directory everyone uses, like `/tmp`, this is a disaster — anyone could delete someone else's temporary files. The sticky bit prevents this.

```bash
ls -ld /tmp
# drwxrwxrwt 10 root root ... /tmp
#         └ t in the other's x slot = Sticky
```

In a directory with the sticky bit set, even if you have w permission on the directory, **only the file's owner (or the directory's owner, or root)** can delete or rename that file. This is why `/tmp` is `1777` (rwxrwxrwt). Everyone can create files (shared), but cannot delete others' files (protected). Without the sticky bit, anyone could delete others' files in `/tmp`, causing security and stability problems.

> ⚠️ **Trap**: Today the sticky bit **has meaning only on directories**. In the past (early Unix), it was set on executable files to "keep the program resident in memory/swap" (the origin of the name "sticky"), but modern kernels ignore sticky on files. On the exam, "the sticky bit is used to keep a file resident in memory" is a wrong answer by modern standards.

```bash
# Try it yourself — observe and experiment with special permissions
ls -l /usr/bin/passwd /usr/bin/sudo      # check SetUID (s)
ls -ld /tmp /var/tmp                      # check Sticky (t)
mkdir testdir && chmod 2775 testdir && ls -ld testdir   # check SetGID (s)
touch testdir/a && ls -l testdir/a        # observe group inheritance
```

In the 1990s, there was a university server where the sticky bit was missing from `/tmp`. When one student deleted another student's temporary compile files as a prank, builds failed one after another, and more seriously, a "symlink attack" became possible in which someone deletes a lock file that some program created in `/tmp` or swaps it for a symbolic link. After the sticky bit was introduced, this attack surface closed. That is why every shared writable directory (`/tmp`, `/var/tmp`) must have the sticky bit set.

## ACL — Beyond the Three Slots of owner/group/other

- The fundamental limit of standard permissions: for one file, you can specify **only one owner and only one group**.
- A finer-grained requirement such as "rw for alice, r for bob, rw for the dev group, block everyone else" cannot be expressed in three slots.
- **ACL** (Access Control List) solves this limit by attaching an additional "list of per-user and per-group permission entries" to each file.

```bash
getfacl file.txt          # view the ACL
setfacl -m u:bob:r file.txt        # grant read to bob (-m = modify)
setfacl -m g:dev:rw file.txt       # read/write for the dev group
setfacl -x u:bob file.txt          # remove bob's ACL entry (-x)
setfacl -b file.txt                # remove all ACLs (-b = remove all)
setfacl -m d:u:bob:rw dir          # default ACL — inherited by children
setfacl -R -m u:bob:rw dir         # apply recursively
```

The output structure of `getfacl`:

```bash
# file: file.txt
# owner: alice
# group: dev
user::rw-          ← owner (standard owner)
user:bob:r--       ← bob's individual ACL
group::rw-         ← owning group (standard group)
group:audit:r--    ← audit group's individual ACL
mask::rw-          ← mask (upper bound of ACL permissions)
other::r--         ← other (standard other)
```

For a file with an ACL set, a **`+` sign** is attached to the end of the permissions in `ls -l` (`-rw-rwxr--+`). Seeing this `+` is a signal that "this file has an ACL in addition to the standard permissions." On the exam, the answer to "what is the `+` at the end of the permission display?" is the indicator of an ACL's presence.

The ACL **mask** is the tricky point. The mask is "the upper bound of the permissions that named users/groups (ACL entries with a name attached) and the owning group can have." Even if you gave bob rwx with `setfacl -m u:bob:rwx`, if the mask is `r--`, bob's effective permission stops at r. `getfacl` attaches an `#effective:` comment to entries trimmed by the mask to show the actual permissions. Changing the group permissions with `chmod` actually changes the mask, so you must be careful when applying chmod to a file with an ACL.

Even with an ACL, the standard owner/group/other permissions still exist, and there is an access decision order. ① If the user is the owner, the owner permissions apply → ② if they are in a named user ACL, that entry applies → ③ if they are in the owning group or a named group ACL, one of those applies (limited by the mask) → ④ if none match, other applies. Problems of the "I gave an ACL but the permission doesn't take effect" type are usually cases where the mask is trimming it, or where the user is the owner so the owner permissions apply first.

A company's audit team (the audit group) needed to be able to "only read" a specific log directory. But that directory was already owned by the ops group and the group slot of the standard permissions was occupied by ops. A second group could not be put in with standard permissions, so they added a read + directory-entry ACL for the audit group with `setfacl -m g:audit:rX -R /var/log/app`. It is a typical case where an ACL solved "different permissions for two groups," which was impossible with the standard permission model. (Uppercase `X` grants x only to directories/executable files, as seen in Day 3.)

```bash
# Try it yourself — ACL experiment
touch acltest.txt
setfacl -m u:nobody:rw acltest.txt
ls -l acltest.txt                  # confirm the + at the end
getfacl acltest.txt                # check the ACL entries and mask
setfacl -b acltest.txt && ls -l acltest.txt   # the + disappears after removal
```

## Special Permissions and ACL Cheat Sheet

| Item | Octal/Command | Key Point |
|------|-----------|------|
| SetUID | 4xxx, `s` (owner x) | Runs with the owner's privileges. The passwd example. Security risk |
| SetGID | 2xxx, `s` (group x) | Group execution / directory group inheritance |
| Sticky | 1xxx, `t` (other x) | Deletion protection for shared directories. /tmp=1777 |
| SetUID search | `find / -perm -4000` | Security audit |
| ACL view/set | `getfacl` / `setfacl -m` | Breaking through the owner-group-other limit |
| ACL indicator | `+` at the end of `ls -l` | Signal of ACL presence |

- If you can instantly answer `/tmp = 1777`, `passwd = 4755 (rwsr-xr-x)`, and SetGID directory = group inheritance, you have grasped the essentials.

## 📖 Glossary

- **Special permissions** : The fourth octal digit placed before the 9 bits. SetUID (4) · SetGID (2) · Sticky (1).
- **SetUID** : A bit that makes a program run with **the file owner's privileges** whoever runs it. `s` in the owner's x slot.
- **SetGID (file)** : A bit that makes a program run with the owning group's privileges when executed.
- **SetGID (directory)** : A bit that makes files created inside **inherit** the directory's group. The key to collaboration directories.
- **Sticky bit** : A bit that restricts a shared directory so that **you can delete only your own files**. The reason `/tmp` is 1777.
- **Uppercase `S`/`T`** : A warning indicator that the special permission is on but that slot has no execute permission.
- **`find / -perm -4000`** : The standard security audit command that sweeps the system's SetUID files.
- **Privilege escalation** : An attack that rides a vulnerability in a SetUID program to seize root privileges.
- **Symlink attack** : An attack that swaps a file in a shared directory for a symbolic link. The sticky bit blocks it.
- **ACL** : An extended permission list that attaches individual per-user and per-group permission entries to each file.
- **`getfacl` / `setfacl`** : The command that views ACLs and the command that sets/deletes them (`-m` add, `-x` delete an entry, `-b` delete all).
- **mask** : The **upper bound** of the permissions that named ACL entries and the owning group can have. Because of it, permissions you granted sometimes do not take effect.
- **`+` in `ls -l`** : An indicator that the file has an ACL.
- **Default ACL** : An ACL set on a directory with `setfacl -m d:...` that is inherited by newly created children.

## 📝 Practice Questions

**Question 1.** When the permissions of `/usr/bin/passwd` are displayed as `-rwsr-xr-x`, what does the `s` in the owner's x slot mean?

A) The sticky bit is set and it stays resident in memory

B) SetUID is set, so it runs with the file owner's (root's) privileges when executed

C) SetGID is set, so it runs with the owning group's privileges when executed

D) It indicates a symbolic link

**Answer: B**

Explanation: The `s` appearing in the owner's x slot is SetUID. Even when a regular user runs `passwd`, it runs with the owner root's privileges and can modify `/etc/shadow`, which only root can write. The Sticky in A is shown as `t` in the other slot, the SetGID in C as `s` in the group slot, and the link in D is shown by the leading character `l`.

---

**Question 2.** Which is correct about the effect of the sticky bit (`drwxrwxrwt`) set on the `/tmp` directory?

A) Anyone can delete all files in the directory

B) Only the file's owner (or the directory's owner, root) can delete their own files

C) New files cannot be created in the directory

D) The directory contents are kept permanently resident in memory

**Answer: B**

Explanation: In a directory with the sticky bit set, even if you have write permission on the directory, only the file's owner (or the directory's owner, root) can delete/rename that file. Because of this, in `/tmp`, which everyone uses, you cannot recklessly delete other people's files. A is the behavior without sticky, C is not true, and D is the old file-sticky behavior that modern kernels ignore.

---

**Question 3.** Which is the correct command to find executable files with SetUID set across the whole system?

A) `find / -perm -4000 -type f 2>/dev/null`

B) `find / -perm -2000 -type f 2>/dev/null`

C) `find / -perm -1000 -type f 2>/dev/null`

D) `find / -name "*.suid" 2>/dev/null`

**Answer: A**

Explanation: The octal weight of SetUID is 4, so you search with `-perm -4000`. B's 2000 finds SetGID, and C's 1000 finds the sticky bit. D is a filename pattern search unrelated to SetUID and meaningless. Checking SetUID files is the standard procedure of a security audit that guards against privilege-escalation vulnerabilities.

---

**Question 4.** Which is correct about the effect of setting SetGID on a directory (`chmod 2775 dir`)?

A) The owner of files created in the directory is always root

B) The owning group of files created in the directory inherits that directory's group

C) Only the owner can delete files in the directory

D) No one can enter the directory

**Answer: B**

Explanation: When SetGID is set on a directory, the owning group of files and subdirectories created inside it inherits the directory's group rather than the creator's primary group. It is the key feature of group collaboration directories. A (owner inheritance) is an action that does not exist, C is the sticky bit, and D is not true.

---

**Question 5.** What does it mean when a file's permissions as seen with `ls -l` have a `+` at the end, like `-rw-rwxr--+`?

A) The file is compressed

B) The file has an ACL set in addition to the standard permissions

C) The file is a symbolic link

D) The file has SetUID set

**Answer: B**

Explanation: The `+` at the end of the permission display indicates that the file has an ACL set in addition to the standard owner-group-other permissions. You can see the detailed entries with `getfacl`. A is irrelevant, the link in C is the leading `l`, and the SetUID in D is shown as `s` in the owner's x slot, so all are wrong.

---

**Question 6.** Which is the correct ACL command to additionally grant read permission on the file `report.txt` to user bob only?

A) `chmod u+r:bob report.txt`

B) `setfacl -m u:bob:r report.txt`

C) `setfacl -x u:bob:r report.txt`

D) `chown bob:r report.txt`

**Answer: B**

Explanation: Adding the `u:bob:r` entry with `setfacl -m` (modify) grants individual read permission to bob alone. A is syntax that does not exist in chmod, the `-x` in C is the option that removes an ACL entry, and D is an ownership-change command with a wrong format as well. ACLs make possible individual user permissions that cannot be expressed in the three standard permission slots.

---

**Question 7.** What is the most appropriate reason the Linux kernel ignores SetUID on shell scripts?

A) Because shell scripts run slowly

B) Because there is a high risk of root privileges being seized through variable manipulation, path tampering, etc. while the script runs

C) Because SetUID can only be set on directories for shell scripts

D) Because SetUID is originally dedicated to group permissions

**Answer: B**

Explanation: If SetUID were allowed on shell scripts, an attacker could seize root privileges through PATH tampering, IFS manipulation, race conditions at interpreter launch time, and so on, which is very dangerous. That is why the kernel ignores SetUID on scripts. A is irrelevant, and C and D are incorrect descriptions of how SetUID works.

---
