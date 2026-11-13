# Day 5 - Week 4 Comprehensive Review: Tying the Account and Permission System into One Picture

## 📌 Key Takeaways

- All Linux access control reduces to **"which field/bit of which file is what."**
- Account file field counts **7-9-4-4**, permissions **644-400-644-400**. UID 0 = root (decided by number, not name).
- `usermod -G` alone wipes the existing secondary groups — always use **`-aG`**.
- **umask 022 → file 644, directory 755**. This is because the starting points differ: 666/777.
- Three security checks: **UID 0 accounts** · **abnormal SetUID binaries** · **missing `/tmp` Sticky**.

## The Four Account Files — Review of Fields and Permissions

This week covered the **skeleton** of Linux security. We connect the four pieces (account files → management commands → permission arithmetic → special permissions and ACLs) into a single picture.

| File | Permissions | Field Count | Key Fields | Partner |
|------|------|---------|-----------|-----|
| /etc/passwd | 644 | 7 | UID(3) · GID(4) · home(6) · shell(7) | shadow |
| /etc/shadow | 400/640 | 9 | hash(2) · LastChange(3) · Min(4) · Max(5) | passwd |
| /etc/group | 644 | 4 | GID(3) · secondary members(4) | gshadow |
| /etc/gshadow | 400 | 4 | group password(2) · administrators(3) | group |

Points to lock into memory:

- passwd has 7 fields, shadow 9 fields, group/gshadow 4 fields each
- UID 0 = root (decided by number, not name)
- shadow date fields = days since 1970-01-01
- The primary group is in passwd (GID), secondary groups are in group (member list)

passwd↔shadow and group↔gshadow are pairs split into "public (644, identity/membership) and secret (400, hashes/policy)." Consistency is checked with `pwck` (passwd/shadow) and `grpck` (group/gshadow).

## Account Management Commands — Mapping Options to Fields

| Command | Key Options | Trap to Watch |
|------|-----------|-----------|
| useradd | -u -g -G -d -s -m -c | -g (primary, one) vs -G (secondary, several) |
| usermod | -aG (add) / -G (replace) | Forgetting -a loses existing secondary groups |
| userdel | -r (delete home too) | Without the option the home remains |
| passwd | -l (lock) -u -e (expire) -d (delete) | -l (block) and -d (no password) are opposites |
| chage | -M (Max) -m (Min) -W -E | Uppercase M=Max, lowercase m=Min |
| gpasswd | -a -d -A | Updates group+gshadow at the same time |

> ⚠️ **Trap Review**: `usermod -G` (alone) wipes the existing secondary groups and replaces them. Always `-aG`. You can assume this shows up on the exam every week.

## su vs sudo — Two Models of Privilege Escalation

| Category | su | sudo |
|------|-----|------|
| Password required | **Target user's** password | **Your own** password |
| Scope | Continue as that person after switching | Delegates a single command only |
| Config file | None | /etc/sudoers (edit with visudo) |
| Audit | Difficult (shared password) | Left in the log (/var/log/secure) |
| Login shell | `su -` (fully applies environment) | `sudo -i` |

The hyphen in `su -` = login shell (fully applies the target's environment). sudoers specifies groups with `%` (Red Hat=wheel, Ubuntu=sudo). Always edit with `visudo` (syntax check + lock).

## Permission Arithmetic — rwx·Octal·umask

| Conversion | Rule |
|------|------|
| Weights | r=4, w=2, x=1 |
| Order | owner→group→other, each r→w→x |
| 644 | rw-r--r-- (regular file) |
| 755 | rwxr-xr-x (executable/directory) |
| 600 | rw------- (secret file) |
| umask file | 666 − umask |
| umask directory | 777 − umask |

> ⚠️ **Trap Review**: umask 022 → file 644, directory 755. Files start from 666 and directories from 777 (files exclude x by default). The larger the umask, the more restrictive.

On a directory, x = entry (cd), and deleting a file depends not on the file but on **the directory's w** permission. chown (changing the owner) is possible only for root.

## Special Permissions and ACLs — Beyond the 9 Bits

| Item | Octal | Display | Effect |
|------|-------|------|------|
| SetUID | 4 | owner x→s | Runs with the owner's privileges (passwd=4755) |
| SetGID | 2 | group x→s | Group execution/directory group inheritance |
| Sticky | 1 | other x→t | Deletion protection for shared directories (/tmp=1777) |
| ACL | setfacl -m | `+` in ls | Individual user/group permissions |

The kernel ignores SetUID on shell scripts (for security). SetUID search = `find / -perm -4000`. If an ACL exists, there is a `+` at the end of the `ls -l` permissions. The mask is the upper bound of named user/group permissions.

## Frequently Intertwined Scenarios — Integrated Thinking

**Scenario A — Building a new collaboration directory**

```bash
groupadd devteam
usermod -aG devteam alice
usermod -aG devteam bob
mkdir /shared && chgrp devteam /shared
chmod 2775 /shared          # SetGID: all new files inherit the devteam group
```

- SetGID (2) + group write (the w in 7) lets team members edit each other's files. It integrates Day 2 (groups) + Day 3 (permissions) + Day 4 (SetGID).

**Scenario B — New employee account + forced change at first login**

```bash
useradd -m -s /bin/bash -c "New Hire" newbie
passwd newbie               # set the initial password
chage -d 0 newbie           # force a password change at next login
chage -M 90 -W 7 newbie     # change every 90 days, warn 7 days before
```

- It integrates Day 1 (shadow fields) + Day 2 (useradd/passwd/chage).

**Scenario C — Security check**

```bash
awk -F: '$3==0{print $1}' /etc/passwd   # UID 0 accounts (only root is normal)
find / -perm -4000 -type f 2>/dev/null  # suspicious SetUID
ls -ld /tmp                              # check Sticky
```

The first step of real-world breach incident analysis is exactly these three — a UID 0 backdoor account, abnormal SetUID binaries, and a missing Sticky on /tmp. Since a one-line command can instantly check the key holes in system security, this week's content is the basis of real-world security beyond the exam.

## 📖 Glossary

- **UID 0** : The definition of root privilege. The kernel looks only at this number, not the account name.
- **passwd↔shadow / group↔gshadow** : Two pairs split into a public file (identity/membership) and a secret file (hashes/policy).
- **`pwck` / `grpck`** : Commands that check the consistency of the two pairs.
- **`-g` vs `-G`** : The option that sets one primary group, and the option that sets several secondary groups.
- **`usermod -aG`** : Adds while keeping existing secondary groups. Forgetting `-a` replaces them wholesale.
- **`chage -d 0`** : A technique that sets the last change date to 0 to force a password change at the next login.
- **The hyphen in `su -`** : An indicator to fully apply the target user's login environment (PATH·HOME·profile).
- **`visudo`** : The dedicated command that edits sudoers with syntax checking and locking.
- **wheel / sudo group** : The default administrator groups of Red Hat-family and Ubuntu-family systems.
- **umask** : A mask that sets the permissions to shave off for newly created files and directories. The larger, the more restrictive.
- **w on a directory** : The permission to delete files in it. Unrelated to the file's own permissions.
- **SetUID / SetGID / Sticky** : Runs with the owner's privileges / group execution and group inheritance / deletion protection for shared directories.
- **ACL mask** : The upper bound of the permissions that named ACL entries can have.

## 📝 Practice Questions

**Question 1.** Among the 9 fields of `/etc/shadow`, which field indicates "the minimum number of days after the password was last changed until it can be changed again"?

A) 3rd (Last Change)

B) 4th (Min)

C) 5th (Max)

D) 6th (Warn)

**Answer: B**

Explanation: The 4th field of shadow is Min, the minimum number of days until the password can be changed again after a change. It is set with `chage -m`. A is the last change date, C (Max) is the maximum password validity days, and D (Warn) is the warning days before expiry. You must not confuse the order of Min and Max (Min comes first).

---

**Question 2.** Which correctly expresses a file with permissions `rwxr-x---` in octal and correctly explains its meaning?

A) 750 — owner has everything, group has read/execute, other has no permissions

B) 740 — owner has everything, group has read, other has no permissions

C) 755 — owner/group/other can all read/execute

D) 700 — only the owner has everything, group/other have no permissions

**Answer: A**

Explanation: rwx=7, r-x=5, ---=0, so it is 750, meaning owner everything, group read/execute, other blocked. B (740) is when group is r--, C (755) is when other is r-x, and D (700) is when group is ---. Add each class with r=4, w=2, x=1 and read in owner-group-other order.

---

**Question 3.** You want to add user alice to the wheel group while keeping her existing secondary groups. Which is the correct command?

A) `usermod -G wheel alice`

B) `usermod -aG wheel alice`

C) `usermod -g wheel alice`

D) `gpasswd -A wheel alice`

**Answer: B**

Explanation: The `-a` in `-aG` adds while keeping the existing secondary groups. In A there is no `-a`, so all existing secondary groups are replaced with wheel alone (dangerous). The `-g` in C changes the primary group, and the `-A` in D is the option for designating a group administrator and its argument order does not fit either.

---

**Question 4.** When `umask` is 027, what are the permissions of a newly created directory?

A) 750 (rwxr-x---)

B) 755 (rwxr-xr-x)

C) 640 (rw-r-----)

D) 770 (rwxrwx---)

**Answer: A**

Explanation: A directory starts from 777, and subtracting umask 027 gives 750 (rwxr-x---). C (640) is the file permission (666-027) under the same umask, B is the directory when umask is 022, and D is the directory when umask is 007. Directories start from 777 and files from 666.

---

**Question 5.** Which is correct about `su` and `sudo`?

A) su authenticates with your own password, sudo with the target user's password

B) su authenticates with the target user's password, sudo with your own password, and sudo permissions are defined in /etc/sudoers

C) Both require only the root password and the config file is the same

D) The standard for sudo is to edit directly with vi without visudo

**Answer: B**

Explanation: su requires the password of the switch target and sudo requires your own password, and sudo permissions are defined in `/etc/sudoers`. sudo delegates commands without sharing the root password and leaves an audit log. A is the exact opposite, C is wrong in saying the config file is the same, and D is wrong because sudoers must always be edited with `visudo`.

---

**Question 6.** What is the most appropriate reason the `/tmp` directory has permissions `1777` (drwxrwxrwt)?

A) So that all users can freely delete each other's files

B) So that everyone can create files, but the sticky bit protects them so that only your own files can be deleted

C) To restrict file creation to root only

D) To keep the directory contents resident in memory

**Answer: B**

Explanation: The leading 1 of `1777` is the sticky bit, which in a directory writable by everyone protects files so that only the file's owner can delete their own files. Everyone can create temporary files, but cannot delete others' files. A is the dangerous behavior without sticky, C is the opposite of 1777, and D is the old behavior that modern kernels ignore.

---

**Question 7.** What is the most accurate reason the executable file `/usr/bin/passwd` needs SetUID?

A) To increase execution speed

B) To let a regular user modify /etc/shadow, which only root can write, and change their own password

C) To keep the file resident in memory

D) To share passwords at the group level

**Answer: B**

Explanation: `/etc/shadow` can be written only by root, but for a regular user to change their own password, this file must be modified. Because `passwd` has SetUID (owner root) set, it runs with root privileges no matter who executes it, so a password change is possible. A and C have nothing to do with SetUID, and D is an explanation confused with SetGID/group passwords.

---

**Question 8.** For the file `data.csv`, the `ls -l` result is shown as `-rw-rw-r--+`. Which is correct about what the trailing `+` sign means and the command to confirm it?

A) It means a compressed file, confirmed with `gzip -l`

B) It means an ACL is set, confirmed with `getfacl`

C) It means SetUID is set, confirmed with `find -perm`

D) It means a symbolic link, confirmed with `readlink`

**Answer: B**

Explanation: The `+` at the end of the permissions is an indicator that the file has an ACL set in addition to the standard permissions, and you confirm the per-user/group ACL entries and the mask with `getfacl data.csv`. A, C, and D are all explanations unrelated to the `+` indicator. ACLs are used when granting individual permissions that cannot be expressed in the three owner-group-other slots.

---

**Question 9.** During a security check, running `awk -F: '$3==0 {print $1}' /etc/passwd` printed two names, `root` and `backdoor`. What does this result mean?

A) It is normal and both accounts are default system accounts

B) The backdoor account's UID is set to 0, so it has privileges equivalent to root, which is a security threat

C) It means the backdoor account's password is empty

D) It means the two accounts belong to the same group

**Answer: B**

Explanation: That command prints accounts whose 3rd field (UID) in passwd is 0. UID 0 is the definition of root privilege, so if backdoor besides root has UID 0, that account also has the same top privileges as root — a typical backdoor security threat. A is a wrong answer that sees danger as normal, and C (password) relates to field 2 and D (group) to field 4, which are different matters.

---

**Question 10.** You applied `chmod 2770 /share` to the directory `/share` and set the group to `team`. Which is the most accurate effect of this setting?

A) The group of files created by team members becomes each person's primary group, blocking mutual access

B) Because of SetGID, all files created inside /share inherit the team group, making group collaboration smooth

C) Because of the sticky bit, only the owner can delete files

D) Other users can also enter the directory

**Answer: B**

Explanation: The leading 2 of `2770` is SetGID, and when set on a directory, files and subdirectories created inside inherit the directory's group (team). So all files created by team members become the team group and collaboration is smooth. A is the behavior without SetGID, C is the effect of Sticky (1), and D is wrong because the other permission is 0 so entry is impossible.

---

**Question 11.** You want to create a new user account while creating the home directory and copying the default configuration files from `/etc/skel`. Which is the correct command?

A) `useradd -d newuser`

B) `useradd -m newuser`

C) `useradd -r newuser`

D) `usermod -m newuser`

**Answer: B**

Explanation: `useradd -m` creates the home directory and copies the default configuration files (.bashrc, etc.) from `/etc/skel`. The `-d` in A only specifies the home path and does not create it, the `-r` in C creates a system account, and D is a command for modifying an existing account, so it does not fit new creation.

---

**Question 12.** Which is correct about the difference between `passwd -l user1` and `passwd -d user1`?

A) -l deletes the password, and -d locks the account

B) -l prepends ! to the hash to block login, and -d deletes the password to make it passwordless

C) Both equally delete the account completely

D) -l expires the password, and -d sets the account expiry date

**Answer: B**

Explanation: `passwd -l` (lock) prepends `!` to the shadow hash to block login, and `passwd -d` (delete) deletes the password itself to create a state in which login without a password is possible (dangerous). The two effects are close to opposites. A swaps the two, C confuses them with account deletion (userdel), and D is an explanation confused with -e (expire)/-E (account expiry date).

---
