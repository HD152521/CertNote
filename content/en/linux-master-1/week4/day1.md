# Day 1 - The Four Account Files: Anatomy of the Fields in /etc/passwd · /etc/shadow · /etc/group · /etc/gshadow

## 📌 Key Takeaways

- A Linux "user" is **a single record line** in four text files, with fields separated by colons. Account management is field management.
- Memorize the field counts outright — **passwd 7 · shadow 9 · group 4 · gshadow 4** — and the permissions, **644-400-644-400**.
- **UID 0 is the definition of root privilege**. The kernel looks only at the UID, not the name. If any account other than root has UID 0, that is a security threat.
- Every date field in shadow is **the number of days elapsed since 1970-01-01**. The order is last change → Min → Max → Warn → Inactive → Expire.
- The files come in two pairs — **passwd↔shadow** and **group↔gshadow**. The public file holds identity; the secret file holds hashes and policy.

## /etc/passwd — Account Identity and Login Environment

The key is to memorize each field by **both position and meaning**. The field order is itself an exam question.

- `/etc/passwd` is the list of all accounts on the system. Despite the name, today **the actual password is not here**.
- Up until the 1980s, the password hash lived in the second field. But this file must be readable by every user (`644`) — because anyone needs to read it for `ls -l` to translate a UID into a name.
- So the hash was split off into `/etc/shadow` (the shadow technique), and only an `x` remained in the second field of passwd.

```bash
root:x:0:0:root:/root:/bin/bash
#  1 2 3 4  5    6        7
```

| # | Field | Meaning | Trap Point |
|---|------|------|------------|
| 1 | **Username** | Login name | Up to 32 characters, usually starts with a lowercase letter |
| 2 | **Password** | `x` = refers to shadow, `*`/`!` = locked, blank = no password | A hash here means shadow is not in use (legacy) |
| 3 | **UID** | User number | **0 = root**, 1-999 system, 1000+ regular (varies by distribution) |
| 4 | **GID** | Primary group number | Matches the GID in `/etc/group` |
| 5 | **GECOS** | Comment (real name, phone, etc.) | `finger` information. Subdivided by commas |
| 6 | **Home Directory** | Home directory path | Working directory at login |
| 7 | **Login Shell** | Login shell | `/bin/bash`, `/sbin/nologin`, `/bin/false` |

UID 0 is not merely "the first user"; **it is itself the definition of root privilege**. The kernel does not check whether the name is `root`; it checks only **whether the UID is 0**. So if you change the UID of any regular account in passwd to 0, that account instantly has privileges equivalent to root. This is a classic trick intruders use to plant a backdoor, and the exam asks it as "an account other than root with UID 0 = security threat."

Putting `/sbin/nologin` or `/bin/false` in the 7th field (the shell) **blocks login** for that account. There is a difference. `/bin/false` exits immediately (exit 1) without any message, while `/sbin/nologin` prints a notice such as "This account is currently not available." and then exits. The reason daemon-only accounts (`daemon`, `bin`, `nobody`, etc.) get this shell is that an interactive login must never happen for those accounts. The message can be customized via `/etc/nologin.txt`.

> ⚠️ **Trap**: Some answer choices mistake the GECOS field (the 5th) for the "password field." The password is the 2nd field (today an `x`), and the actual hash is in shadow. Choices that swap the order of the 6th (home) and 7th (shell) are also used as wrong answers. The order is **home first, shell last**.

```bash
# Try it yourself — observe the passwd structure
cat /etc/passwd | head -5          # system accounts
getent passwd root                 # lookup through NSS (including LDAP)
awk -F: '$3==0 {print $1}' /etc/passwd   # print every account with UID 0 (only root should appear)
awk -F: '$3>=1000 && $3<60000 {print $1}' /etc/passwd  # regular users only
```

The name GECOS comes from the General Electric Comprehensive Operating System of the 1970s. It is a trace of early Unix writing, into this field, the account information that the GE mainframe required when batch jobs were sent to it. Today it is simply used as a "user comment field," but only the name remains, like a fossil. You edit this field with the `chfn` command.

## /etc/shadow — Password Hashes and Aging Policy

- `/etc/shadow` is the **secret vault for passwords**, separated from passwd.
- Its permissions are tightly locked to `400` or `640` (readable only by root or the shadow group).
- One line has **9 fields**. This is the biggest battleground for practical short-answer questions.

```bash
user1:$6$xyz$abc...:19700:0:99999:7:14:19800:
#  1       2          3   4   5   6  7    8   9
```

| # | Field | Meaning | Unit/Value |
|---|------|------|---------|
| 1 | **Username** | Name that matches passwd | — |
| 2 | **Password** | Encrypted hash | `$6$`=SHA-512. `*`/`!`=locked, blank=no password |
| 3 | **Last Change** | Date of last password change | **Days elapsed since 1970-01-01** |
| 4 | **Min** | Minimum days before the password can be changed again | 0=can be changed any time |
| 5 | **Max** | Maximum days the password is valid | 99999=effectively unlimited |
| 6 | **Warn** | Days before expiry to warn | Usually 7 |
| 7 | **Inactive** | Grace days after expiry before the account is locked | Blank=not enforced |
| 8 | **Expire** | Expiry date of the account itself | Days since 1970 (the account, not the password) |
| 9 | **Reserved** | Reserved (unused) | — |

The dates and day counts in fields 3 through 8 are all values **based on January 1, 1970 (the Unix Epoch)**. "Last Change = 19700" means the password was changed on the day 19700 days after January 1, 1970. Since that is hard for humans to read, convert it to a human-readable date with `chage -l user1`.

The prefix in front of the hash in field 2 indicates the algorithm. `$1$`=MD5, `$2a$`/`$2y$`=Blowfish, `$5$`=SHA-256, `$6$`=SHA-512. The default on modern distributions is `$6$`. The format is `$id$salt$hash`, and because a salt (a random number) is included, the same password produces a different hash for each user. If this field starts with `!` or `!!`, it means "the original hash is preserved in the locked state." `passwd -l` locks by prepending `!` to the hash, and `passwd -u` unlocks by removing that `!`.

> ⚠️ **Trap**: Choices that swap **the order of Min (4th) and Max (5th)**, or the meanings of **Warn (6th) and Inactive (7th)**, are easily used as wrong answers. The order to memorize: "last change → min → max → warn → inactive → expire." There are also questions that confuse the 7th, Inactive ("grace period before locking the account after password expiry"), with the 8th, Expire ("absolute expiry date of the account itself"). **Inactive is tied to password expiry; Expire is an absolute date.**

If field 2 is **blank**, login without a password is possible (very dangerous); if it is `*` or `!`, login is impossible (the normal state for daemon accounts). A choice that lumps blank and `*` together as the same thing is wrong.

```bash
# Try it yourself — check the shadow aging policy
sudo getent shadow user1           # one shadow line
sudo chage -l user1                # expiry policy in human-readable format
sudo cat /etc/shadow | cut -d: -f1,3,4,5   # name:last change:Min:Max
```

The shadow technique was first introduced in SunOS in 1987 and later spread to every Unix family. The motivation was simple — passwd had to be readable by everyone as `644` (for name↔UID translation), and if the hash was there, anyone could copy it and mount an offline brute force attack. Once the hash was split off into a `400` file, that attack surface disappeared. This is exactly the answer to "Why is the password kept in shadow rather than in passwd?"

## /etc/group — Group Membership and Secondary Groups

`/etc/group` holds the list of groups and their members. Its permissions are `644` (readable by all). One line has **4 fields**.

```bash
developers:x:1500:alice,bob,carol
#    1      2  3        4
```

| # | Field | Meaning |
|---|------|------|
| 1 | **Group Name** | Group name |
| 2 | **Password** | `x` = refers to gshadow (mostly unused) |
| 3 | **GID** | Group number |
| 4 | **Member List** | **Secondary group** members (comma-separated) |

Here is the most confusing point — the group that the 4th field (GID) of passwd points to is that user's **primary group**, and if a name appears in the 4th member list of `/etc/group`, that is a **secondary group**. So a user may not be listed in the member list of their own primary group. If alice's GID in passwd is 1500, alice is a member of developers, but she is not necessarily written in the member list (4th field) of the group file. `groups alice` shows both combined.

When a user creates a new file, the file's group owner becomes the **primary group** (the GID in passwd). A secondary group only grants "access permission to files belonging to that group"; it does not become the default owning group of newly created files. (The exception is when SetGID is set on a directory — covered in Day 4.)

The 4th field of the group file lists **secondary group members** only. "If you are not in this list, you do not belong to the group" is wrong — the primary group is determined in passwd, so you may belong even if you are not in the list. `id user1` lets you see primary/secondary at a glance.

```bash
# Try it yourself — trace group membership
id alice                           # uid, gid (primary), groups (all)
groups alice                       # names of the groups it belongs to
getent group developers            # member list of a specific group
awk -F: '$3>=1000{print $1,$3}' /etc/group  # regular groups
```

## /etc/gshadow — Group Passwords and Group Administrators

- `/etc/gshadow` is the **secret information of groups**, separated from the group file. Just as shadow is the partner of passwd, gshadow is the partner of group.
- Its permissions are `400`. One line has **4 fields**.

```bash
developers:!:admin1,admin2:alice,bob,carol
#    1     2      3              4
```

| # | Field | Meaning |
|---|------|------|
| 1 | **Group Name** | Group name |
| 2 | **Password** | Group password hash. `!`=no password (normal) |
| 3 | **Administrators** | Group administrators (permission to add/remove members) |
| 4 | **Members** | Group members (synchronized with the group file) |

The group password (field 2) is used when you temporarily change your own primary group with the `newgrp` command. If a user who is not a member of that group knows the group password, they can temporarily join that group with `newgrp`. However, it is risky from a security standpoint, so on modern systems it is almost always disabled (`!`). The administrator in field 3 is a user who can add/remove members with `gpasswd`.

When you change the 4th member list of group and gshadow with `gpasswd` or `usermod`, **the two files are kept in sync**. If you hand-edit only group and do not fix gshadow, a mismatch arises, and the `grpck` command can check for such mismatches. (The passwd↔shadow pair is checked with `pwck`.)

"The group password is stored in field 2 of the group file" is wrong. Field 2 of group is only an `x` (a marker referring to gshadow); **the actual group password hash is in field 2 of gshadow**. It is exactly the same structure as the passwd↔shadow relationship.

```bash
# Try it yourself — check the pairing of the four files
sudo pwck -r                       # passwd ↔ shadow consistency check (read-only)
sudo grpck -r                      # group ↔ gshadow consistency check
sudo getent gshadow developers
```

At one university computer lab, a teaching assistant removed a student from a group by editing only `/etc/group` directly in vi, but because it did not go through `gpasswd`, the member list in `/etc/gshadow` stayed as it was. Some tools consulted gshadow first, so a ghost-member phenomenon appeared — "removed, yet the permissions remain." The lesson: the principle is to update account and group files **through dedicated commands (`usermod`, `gpasswd`, `vipw`, `vigr`) so that the paired file is updated at the same time**, rather than editing them directly. `vipw`/`vigr` take a lock and edit safely, and the `-s` option edits shadow/gshadow.

## The Four Files on One Page — Consistency Map

- The four files are bundled into two pairs. **passwd↔shadow** (users), **group↔gshadow** (groups).
- The public files (passwd, group, `644`) hold only identity and membership; the secret files (shadow, gshadow, `400`) hold only hashes and policy.
- This separation is the heart of the shadow security model.

| File | Permissions | Field Count | Key Content | Partner |
|------|------|---------|-----------|-----|
| /etc/passwd | 644 | 7 | UID·GID·home·shell | shadow |
| /etc/shadow | 400/640 | 9 | Hash·password aging | passwd |
| /etc/group | 644 | 4 | GID·secondary members | gshadow |
| /etc/gshadow | 400 | 4 | Group password·administrators | group |

- The **field counts (7-9-4-4)** and **permissions (644-400-644-400)** in this table become short-answer questions by themselves. passwd=7, shadow=9, group/gshadow=4.

## 📖 Glossary

- **UID** : The number that distinguishes users. **0 means root privilege**. The kernel looks only at this number, not the name.
- **GID** : Group number. The GID in field 4 of passwd determines that user's primary group.
- **shadow technique** : A security design that removes password hashes from the world-readable passwd and hides them in a `400` file.
- **GECOS** : The comment in field 5 of passwd (real name, contact info). The name remains like a fossil from the GE mainframe era.
- **`/sbin/nologin` vs `/bin/false`** : Two shells that block login. The former prints a notice; the latter exits silently.
- **Unix Epoch** : 1970-01-01. Every date field in shadow is the number of days elapsed since this day.
- **Min / Max / Warn / Inactive / Expire** : Minimum days before password re-change / maximum validity days / expiry warning days / grace period for locking after expiry / absolute account expiry date.
- **`$6$`** : The algorithm marker of a shadow hash. 1=MD5, 5=SHA-256, 6=SHA-512.
- **salt** : A random number mixed into the hash. It makes the hash differ per user even for the same password.
- **Primary group / secondary group** : The group set by the GID in passwd, and the group attached via the member list in the group file.
- **`newgrp`** : A command that temporarily switches your primary group to a group if you know its group password.
- **`pwck` / `grpck`** : Commands that check the consistency of passwd↔shadow and group↔gshadow.
- **`vipw` / `vigr`** : Commands that take a lock and safely edit the account and group files. `-s` opens the partner file.

## 📝 Practice Questions

**Question 1.** In the following `/etc/passwd` line, which field is the user's login shell?
`alice:x:1001:1001:Alice Kim:/home/alice:/bin/bash`

A) `x` (2nd field)

B) `1001` (3rd field)

C) `/home/alice` (6th field)

D) `/bin/bash` (7th field)

**Answer: D**

Explanation: The 7 fields of `/etc/passwd` are, in order, username:password:UID:GID:GECOS:home directory:login shell. The last (7th) field is the login shell, so it is `/bin/bash`. C is the 6th, the home directory; B is the 3rd, the UID; A is the 2nd, the password field (`x`=refers to shadow).

---

**Question 2.** In the `/etc/shadow` file, what does the value `19700` in the 3rd field, which indicates "the date the password was last changed," mean?

A) July 0, 2019

B) The day 19700 days after January 1, 1970

C) The password expires after 19700 seconds

D) The password has been changed 19700 times

**Answer: B**

Explanation: Every date-related field in shadow is stored as the number of **days** elapsed since the Unix Epoch (January 1, 1970). So 19700 means the day 19700 days after 1970-01-01. To read it as a human, use `chage -l`. C (seconds) and D (count) have the wrong unit entirely, and A is plausible-looking but the reference date and calculation do not match.

---

**Question 3.** During a system security check, you find that in `/etc/passwd` the regular account `backup`, which is not root, has its UID set to 0. What is the most accurate description of what this means?

A) The backup account has only limited privileges for backup purposes

B) The backup account has top administrator privileges equivalent to root

C) UID 0 is just a marker and has nothing to do with privileges

D) Login for the backup account is automatically blocked

**Answer: B**

Explanation: The kernel judges root privilege by **whether the UID is 0**, not by the account name. So even a regular account has privileges fully equivalent to root if its UID is 0. This is a typical trick intruders use to plant a backdoor, so it is treated as a security threat. A and D speak of reduced privileges/blocking, but the reality is the exact opposite, and C is wrong because it denies the special status of UID 0.

---

**Question 4.** Which is the correct field order of `/etc/shadow`?

A) username : password : Max : Min : Warn : Last Change : Inactive

B) username : password : Last Change : Min : Max : Warn : Inactive

C) username : password : Last Change : Max : Min : Inactive : Warn

D) username : password : Min : Max : Last Change : Warn : Inactive

**Answer: B**

Explanation: The field order of shadow is username → password → last change date (Last Change) → minimum change interval (Min) → maximum validity days (Max) → warning days (Warn) → inactive grace period (Inactive) → expiry date (Expire) → reserved. Min comes before Max. In A the position of Last Change is wrong, in C Min/Max are swapped, and in D the position of Last Change is wrong.

---

**Question 5.** Which is a correct description of the 4th field of `/etc/group`?

A) The group's password hash is stored

B) Only the primary members of the group are listed

C) The secondary members of the group are listed, separated by commas

D) Only group administrators are listed, and regular members are excluded

**Answer: C**

Explanation: The 4 fields of `/etc/group` are group name:password:GID:member list, and the 4th member list lists **secondary group members** separated by commas. The primary group is determined by the GID in `/etc/passwd`, so you may belong even if you are not in this list. A is the content of gshadow, B is wrong because it is secondary rather than primary, and D is wrong in saying administrators only (administrators are in field 3 of gshadow).

---

**Question 6.** What is the biggest reason for separating the password information into `/etc/passwd` and `/etc/shadow`?

A) To reduce the size of the passwd file and speed up booting

B) To remove password hashes from the world-readable passwd and prevent offline attacks

C) To store passwords in plain text

D) To merge group information and user information into one file

**Answer: B**

Explanation: `/etc/passwd` must be readable by every user (644) for things like UID↔name translation, and if the password hash were there, anyone could copy it and mount an offline brute force attack. So the hash was split off into `/etc/shadow` with `400` permissions (the shadow technique). A is irrelevant, C is the opposite (hashes are stored), and D is not true.

---

**Question 7.** After running the command `passwd -l user1`, what change happens to the password field (2nd) of user1 in `/etc/shadow`?

A) The hash is deleted entirely and becomes blank

B) A `!` is prepended to the hash, blocking login

C) The hash changes to `x`

D) The hash is regenerated as a new value starting with `$6$`

**Answer: B**

Explanation: `passwd -l` (lock) preserves the existing hash and prepends a `!` to it so that matching becomes impossible, blocking login. Removing the `!` with `passwd -u` (unlock) restores the original hash. A is wrong because the hash is not deleted, the `x` in C is the marker in the passwd file, and D is the behavior of a password change, not a lock.

---
