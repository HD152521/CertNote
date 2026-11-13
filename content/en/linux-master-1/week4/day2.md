# Day 2 - Account Management Commands and Privilege Escalation: From useradd to sudo

## 📌 Key Takeaways

- What the account commands do boils down to one thing — **updating the four files in matched pairs, without missing any**. Each option touches specific fields.
- `-g` is **one** primary group, `-G` is **several** secondary groups. Using only `usermod -G` **replaces all** existing secondary groups, so use `-aG`.
- `chage` options map 1:1 to shadow fields — `-M` Max, `-m` Min, `-W` Warn, `-E` Expire, `-I` Inactive, `-d` last change.
- **`su` is "becoming" someone using the target's password; `sudo` is "borrowing" privileges using your own password**. Always edit sudoers with `visudo`.
- **PAM** is a framework that separates authentication into a module stack (`auth`·`account`·`password`·`session`); **LDAP** is a protocol that gathers accounts in one place on a server.

## useradd — Creating Accounts and the Fields Each Option Touches

Editing the account records directly in vi does work, but it is easy to miss side tasks such as syncing the paired file, creating the home directory, and copying the skeleton. That is why a dedicated command set is used.

- `useradd` creates a new user. When run without options, it follows the defaults in `/etc/default/useradd` and `/etc/login.defs`.
- Each key option corresponds to a specific field from Day 1.

```bash
useradd -u 1500 -g developers -G wheel,docker -d /home/alice -s /bin/bash -m -c "Alice Kim" alice
```

| Option | Meaning | File/Field Touched |
|------|------|-------------------|
| `-u` | Specify the UID | passwd 3rd |
| `-g` | Primary group | passwd 4th |
| `-G` | Secondary groups (comma-separated) | group 4th |
| `-d` | Home directory path | passwd 6th |
| `-s` | Login shell | passwd 7th |
| `-m` | **Create** the home directory + copy skel | Filesystem |
| `-c` | GECOS (comment) | passwd 5th |
| `-e` | Account expiry date (YYYY-MM-DD) | shadow 8th |
| `-r` | Create as a system account (low UID) | passwd 3rd |

The difference between `-g` (lowercase) and `-G` (uppercase) is the exam's key point. `-g` specifies **one primary group** (the GID in passwd), and `-G` specifies **several secondary groups** (the member list in the group file). Remember it as lowercase g = primary (one), uppercase G = secondary (several). The owning group of newly created files becomes the primary group set with `-g`.

The `-m` option does not merely create an empty home directory; it copies the contents of `/etc/skel` into the new home. Default configuration files such as `.bashrc`, `.profile`, and `.bash_logout` come from here. So if you want to distribute common settings to every new user, just put files into `/etc/skel`. On Red Hat-family systems `useradd` creates the home by default, but on Debian-family systems `useradd` may not create the home without `-m`, so the habit of explicitly specifying `-m` is safe.

> ⚠️ **Trap**: Some choices treat `useradd` and `adduser` as the same thing. `useradd` is the **low-level standard command** on all distributions, while `adduser` is an **interactive wrapper script** (Perl) on Debian/Ubuntu-family systems that also asks about home creation and password setup. On the exam, the "standard account creation command" is `useradd`. On Red Hat, `adduser` is merely a symbolic link to `useradd`.

```bash
# Try it yourself — create an account and check the defaults
sudo useradd -m -s /bin/bash -c "Test User" testuser
sudo cat /etc/default/useradd      # useradd defaults
grep -E '^(UID_MIN|UID_MAX|PASS_MAX_DAYS)' /etc/login.defs
getent passwd testuser
```

## usermod / userdel — Modifying and Deleting Accounts

`usermod` modifies an existing account. Many of its options are the same as `useradd`, but there is a trap in how secondary groups are handled.

```bash
usermod -aG docker alice           # "add" alice to the docker secondary group
usermod -G docker alice            # "replace" alice's secondary groups with docker alone (all existing ones vanish!)
usermod -L alice                   # lock the account (prepends ! to the shadow hash)
usermod -U alice                   # unlock
usermod -s /sbin/nologin alice     # change the shell (blocks login)
```

> ⚠️ **Trap**: **Using only `usermod -G` makes all existing secondary groups disappear and be replaced with the specified groups**. To add while keeping the existing groups, you must use `-a` (append) together, as `usermod -aG`. On the exam, the answer to the choice "add alice to the docker group while keeping the existing groups" is `-aG`. `-G` without `-a` is a dangerous wrong answer.

`userdel` deletes an account.

```bash
userdel alice                      # delete the account only (leaves the home)
userdel -r alice                   # also delete the home directory and mail spool
```

`userdel` (without options) erases only the records in passwd/shadow/group and **leaves the home directory and the files inside it**. You need to add `-r` to also remove the home and the `/var/mail/username` mail spool. However, even with `-r`, files that user created elsewhere on the system (e.g., `/tmp`, shared directories) remain. Such "ownerless files" show only a UID and can be found with `find / -nouser`.

`userdel` may be refused for a user who is logged in or has running processes (`user X is currently used by process`). You can force it with `-f` (force), but that is dangerous. On the exam, "the user is currently logged in/running a process" appears as the correct answer for "why deletion fails."

## passwd / chage — Managing Passwords and Aging Policy

`passwd` sets and changes passwords and also locks/unlocks. `chage` is dedicated to the aging fields (3rd-8th) of shadow.

```bash
passwd alice                       # change alice's password (only root can change others' passwords)
passwd -l alice                    # lock (! before the shadow hash)
passwd -u alice                    # unlock
passwd -e alice                    # expire the password immediately (forced change at next login)
passwd -d alice                    # delete the password (no password — dangerous)

chage -l alice                     # view the aging policy (human-readable format)
chage -M 90 alice                  # set Max (maximum validity days) to 90 days → shadow 5th
chage -m 7 alice                   # Min (minimum change interval) 7 days → shadow 4th
chage -W 14 alice                  # Warn (warning days) 14 days → shadow 6th
chage -E 2026-12-31 alice          # account expiry date → shadow 8th
chage -d 0 alice                   # last change 0 → forced change at next login
```

The uppercase/lowercase options of `chage` map 1:1 to shadow fields. `-M` (uppercase) = Max = maximum validity days, `-m` (lowercase) = Min = minimum change interval, `-W` = Warn, `-E` = Expire (account expiry), `-d` = last change date, `-I` = Inactive. Recalling the 9 shadow fields from Day 1, you can instantly match which field an option touches.

`passwd -e alice` (expire the password) and `chage -d 0 alice` (set the last change date to 1970-01-01) have the same result — both force the password to be changed at the next login. It is a standard operating technique for making a new employee reset the initial password themselves at first login.

Some choices confuse `passwd -d` (delete the password) with `passwd -l` (lock). `-d` **removes** the password so that login without a password becomes possible (dangerous), while `-l` prepends `!` to the hash to **block** login. The effects are exactly opposite.

```bash
# Try it yourself — apply an aging policy and check
sudo chage -M 60 -W 7 testuser
sudo chage -l testuser
sudo passwd -S testuser            # one-line summary (status/last change/Min/Max/Warn/Inactive)
```

## groupadd / gpasswd — Creating Groups and Managing Members

```bash
groupadd -g 2000 webteam           # create a group with GID 2000
groupmod -n devteam webteam        # rename the group (webteam → devteam)
groupdel webteam                   # delete the group (refused if it is someone's primary group)

gpasswd -a alice webteam           # add alice as a member of webteam
gpasswd -d alice webteam           # remove alice from webteam
gpasswd -A admin1 webteam          # designate admin1 as an administrator of webteam (gshadow 3rd)
gpasswd webteam                    # set the group password (for newgrp)
```

`gpasswd -a`/`gpasswd -d` update group and gshadow **at the same time** to keep the pair matched. If you edit only group by hand, the "ghost member" mismatch seen in Day 1 arises. That is why the principle is to change group members with `gpasswd` (or `usermod -aG`).

`groupdel` **refuses deletion if the group is any user's primary group**. You must first change that user's primary group to another one, or delete the user, and then delete the group. If it is a secondary group, it is deleted right away.

The `newgrp` command temporarily changes the primary group of the current session by entering the group password. In the 1970s-80s, a user could not hold multiple groups at once (Unix at the time had only one group active at a time), so you switched the group to work in with `newgrp`. Today you can hold several secondary groups simultaneously, so `newgrp` is rarely used, but on the exam that trace appears as "the purpose of the group password (gshadow 2nd)."

## su — Switching to Another User

`su` (substitute user) switches to another user's shell. You must know the target's password.

```bash
su alice                           # switch to alice, keeping part of the environment (keeps the current directory)
su - alice                         # switch to alice + fully apply alice's login environment
su -                               # switch to root (root if the target is omitted) + login shell
su -c "id" alice                   # run only a single command with alice's privileges
```

The difference between `su alice` and `su - alice` is the key. **With a hyphen (`-` or `-l`) you switch to a login shell**, which reads the target user's `.bash_profile`/`.profile` and completely resets the environment variables (`PATH`, `HOME`, working directory) based on that user. Without the hyphen, part of the environment (especially `PATH`) is inherited as-is from the original user, producing subtle "command not found" errors. That is why `su -` is almost always used when going to root.

To become root with `su`, you must know **root's password**. On Ubuntu the root password is locked (`!`) by default, so `su -` is blocked and you are steered toward `sudo`. The answer to "why `su -` does not work on Ubuntu" is "the root account password is not set/enabled."

## sudo and /etc/sudoers — Delegation of Privilege

`sudo` (superuser do) has a different philosophy from `su`. `su` is "becoming" that person with **the target's password**, while `sudo` is borrowing only the privileges delegated in advance, with **your own password**, to run a single command.

```bash
sudo systemctl restart nginx       # authenticate with your own password and run a root-privilege command
sudo -u alice whoami               # run with alice's privileges (→ prints alice)
sudo -i                            # enter root's login shell (similar to su -)
sudo -l                            # list the commands I can run with sudo
```

Privilege definitions live in `/etc/sudoers` (always edit with `visudo`). The syntax of a line:

```bash
# user    host=(run-as user:group)  command
root      ALL=(ALL:ALL) ALL
alice     ALL=(ALL) ALL
%admin    ALL=(ALL) ALL              # % = group. The whole admin group
%wheel    ALL=(ALL) NOPASSWD: ALL    # allow sudo without a password
bob       web01=(root) /usr/bin/systemctl restart nginx  # specific command only
```

| Position | Meaning |
|------|------|
| 1st field | Target user (`%`=group) |
| Before `ALL=` | Host it applies to (`ALL`=all hosts) |
| `(ALL:ALL)` | (user:group) one may become |
| Last | Permitted command (`ALL`=everything, `NOPASSWD:`=password exempt) |

You must edit sudoers **with `visudo`**. `visudo` checks syntax on save and locks the file to prevent simultaneous editing. If you edit directly with plain `vi` and get the syntax wrong, all of sudo becomes inoperable, and if you cannot then get in directly with the root password, the system can be locked out. The answer to "the recommended tool for editing sudoers" is always `visudo`.

The `%` prefix means a group. Red Hat-family systems use the `wheel` group, and Debian/Ubuntu-family systems use the `sudo` group as the default administrator group. So the standard way to "grant administrator privileges to a user on Ubuntu" is to add them to the sudo group with `usermod -aG sudo alice`, and on Red Hat it is the `wheel` group. Delegating at the group level is the operating standard, rather than writing individual users into sudoers one by one.

`su` asks for **the target user's password**, while `sudo` asks for **your own password**. A choice that swaps this difference is a wrong answer. That is why sudo can delegate only specific commands without sharing the root password with team members, which fits the audit and least-privilege principles. Also, `NOPASSWD:` is convenient but should be used only in a limited way for automation/CI; overusing it on human accounts is a security threat.

One company shared the production server root password with every team member and fell into an operational hell where the root password had to be changed entirely every time someone left. After switching to a `sudo`-based approach, each person authenticated with their own password, sudoers recorded "who can run which commands," and every use of sudo was left as an audit log in `/var/log/secure` (or `auth.log`). For a departing employee, simply disabling that one account was enough. This is the standard security evolution from the "shared su model → delegated sudo model."

```bash
# Try it yourself — check sudo privileges (be careful when editing)
sudo -l                            # list of my sudo privileges
sudo visudo -c                     # syntax check of sudoers only (no editing)
groups                             # whether I belong to the sudo/wheel group
```

## PAM — A Framework That Separates Authentication into Modules

- `login`·`sshd`·`su`·`sudo`·`passwd` all verify "is this the right person." If each program is written to read shadow directly, you would have to fix all of them to change a single authentication method.
- **PAM** (Pluggable Authentication Modules) is a structure that **splits the authentication logic out into shared libraries (`.so` modules) so that programs only make a request to "please authenticate."**
- The configuration lives under `/etc/pam.d/` as **per-service-name files** (the older form is the single file `/etc/pam.conf`).
- Common rules are gathered in `system-auth` on RHEL-family and `common-auth` on Debian-family systems, etc.

```
module-type  control-flag  module              arguments
auth         required      pam_unix.so         nullok
password     requisite     pam_pwquality.so    retry=3
session      required      pam_limits.so
```

- The **module types** are the four stages of authentication.
  - `auth` — verifying identity (checking password/token)
  - `account` — whether the account itself is usable (expiry, time-of-day, terminal restrictions)
  - `password` — the rules when **changing** a password
  - `session` — session setup and cleanup (resource limits, logging)
- Modules of the same type are stacked and executed in order, and the **control flag** determines how each module's success or failure is reflected in the final verdict.

| Control Flag | On Success | On Failure |
|-------------|---------|---------|
| `required` | Continue | **Final failure is confirmed**, remaining modules still run to the end |
| `requisite` | Continue | **Stops immediately** and returns failure |
| `sufficient` | If no earlier required has failed, **returns success immediately** | Ignored, continues |
| `optional` | No effect | No effect (counted only if it is the only one of that type) |

| Representative Module | What It Does |
|-----------|---------|
| `pam_unix.so` | Traditional authentication based on `/etc/passwd`·`/etc/shadow` |
| `pam_cracklib.so` → `pam_pwquality.so` | Enforces password complexity. Since RHEL 7, pwquality (`/etc/security/pwquality.conf`) |
| `pam_tally2.so` → `pam_faillock.so` | Accumulates failed login counts and locks the account. Since RHEL 8, faillock |
| `pam_limits.so` | Applies the resource limits in `/etc/security/limits.conf` (`session`) |
| `pam_wheel.so` / `pam_nologin.so` | Allow `su` only for the wheel group / block regular logins if `/etc/nologin` exists |

If a `sufficient` module succeeds, **the modules of the same type below it are not executed at all**. A failure counter or extra verification placed below is entirely neutralized, so the order of the stack is the policy. `required` and `requisite` give the same result on failure, but `required` runs the following modules to the end so that it **does not reveal at which stage the failure occurred**, whereas `requisite` cuts off immediately.

- **`/etc/security/limits.conf`** is the resource limit file that `pam_limits.so` reads and applies.
- One line consists of four columns: `target type item value`.
  - Target: username · `@groupname` · `*` (everyone)
  - Type: `soft` (current value) · `hard` (absolute ceiling, only root can raise it)
  - Item: `nproc` (number of processes) · `nofile` (number of open files) · `core` · `fsize` · `cpu` · `maxlogins`, etc.

```bash
alice        soft   nproc    200
@developers  hard   nofile   8192
*            soft   core     0
```

View the values applied to the current shell with `ulimit -a` (soft) and `ulimit -Ha` (hard). `limits.conf` applies only to **login sessions that go through PAM**, so it does not take effect for daemons launched directly by systemd. Such services must be specified separately with directives such as `LimitNOFILE=` in the unit file.

## LDAP — Gathering Accounts in One Place on a Server

- The accounts so far all lived in **`/etc/passwd` inside that server**. With 100 servers, you have 100 sets of accounts.
- **LDAP** (Lightweight Directory Access Protocol) is a protocol that **gathers user, group, and organization information in one directory server** and lets many systems query and use it.
- Tailored to information that is overwhelmingly read (like a phone book), it is stored not as relational tables but as a **tree**.
- Each entry is identified by a **DN**, which concatenates the path up to the root, and a single piece of its own level is the **RDN** (Relative DN).

```
dn: cn=alice,ou=people,dc=example,dc=com
     └─RDN─┘ └container┘ └─── Base DN ───┘
```

- `dc` (Domain Component) — a piece of the domain (`example.com` → `dc=example,dc=com`)
- `ou` (Organizational Unit) — organizational unit/container (`ou=people`)
- `cn` (Common Name) — the name of the entry (a person or group name)
- `dn` (Distinguished Name) — the full path joining these up to the root

- The standard implementation on Linux is **OpenLDAP**, and the daemon is **`slapd`** (plaintext 389/tcp, TLS-only LDAPS 636/tcp).
- Server configuration has moved from the old `/etc/openldap/slapd.conf` to the dynamic configuration directory `/etc/openldap/slapd.d/` (`cn=config`).
- Data is exchanged as **LDIF** text (`slapcat`·`slapadd`, `ldapsearch`·`ldapadd`·`ldappasswd`).

```bash
ldapsearch -x -H ldap://ldap.example.com -b "dc=example,dc=com" "(uid=alice)"
```

Account integration needs **both axes**. **"Who is this" (information lookup) is handled by NSS** (adding `ldap` or `sss` to the `passwd:`/`shadow:`/`group:` lines of `/etc/nsswitch.conf`), and **"is the password correct" (authentication) is handled by PAM** (`pam_ldap.so`/`pam_sss.so`). If it shows up with `getent passwd alice` but login fails, only NSS is attached and PAM is missing. Nowadays **SSSD** (`/etc/sssd/sssd.conf`), which bundles the two and even caches, is the standard.

`nsswitch.conf` **looks up whichever is listed first, first**, so `files` must come first so that you can still get in with local accounts even if the LDAP server dies. If you reverse the order, nobody can log in during a server outage. Also, LDAP is **plaintext** by default, so StartTLS or LDAPS (636) must be enabled.

## Command-to-Field Mapping Table

| Command | Main Role | Key Options |
|------|---------|-----------|
| useradd | Create account | -u -g -G -d -s -m -c -e |
| usermod | Modify account | -aG (add) / -G (replace) / -L -U |
| userdel | Delete account | -r (including home) |
| passwd | Password/lock | -l -u -e -d |
| chage | Aging policy | -M -m -W -E -d |
| groupadd/gpasswd | Groups/members | -a -d -A |
| su / sudo | Privilege switching/delegation | su - (login shell) / sudo -l |
| PAM | Authentication module stack | /etc/pam.d/, required·requisite·sufficient·optional |
| LDAP | Account centralization | slapd (389/636), DN·ou·dc, nsswitch.conf + sssd |

- `su` is "becoming" with the target's password; `sudo` is "borrowing" with your own password. This one sentence is the heart of privilege escalation.

## 📖 Glossary

- **`/etc/skel`** : A collection of default configuration files copied into a new account's home. `useradd -m` pulls them in.
- **`-g` vs `-G`** : The option that sets one primary group, and the option that sets several secondary groups.
- **`usermod -aG`** : The form that adds while keeping existing secondary groups. Using `-G` alone without `-a` replaces them wholesale.
- **`adduser` vs `useradd`** : An interactive wrapper on Debian-family systems, and the low-level standard command common to all distributions.
- **`userdel -r`** : The option that also removes the home directory and mail spool.
- **`find / -nouser`** : A way to find files that lost their owner because the account was deleted.
- **`passwd -l` vs `passwd -d`** : Locking by prepending `!` to the hash, versus removing the password entirely to make it passwordless.
- **`chage`** : The command dedicated to shadow's password and account aging fields. Its options map 1:1 to the fields.
- **`gpasswd`** : The command that handles group members and administrators. It updates group and gshadow at the same time.
- **`su` vs `sudo`** : Becoming that person with the target's password, versus borrowing only the delegated privileges with your own password.
- **`visudo`** : The dedicated command that edits sudoers safely with syntax checking and locking.
- **wheel / sudo group** : The default administrator groups of Red Hat-family and Debian-family systems.
- **PAM** : A pluggable authentication framework that splits authentication logic into modules (.so) shared by programs.
- **Control flag** : How a PAM module's success or failure is reflected in the final verdict. required·requisite·sufficient·optional.
- **`limits.conf`** : The resource limit file read by `pam_limits.so`. soft is the current value, hard is the absolute ceiling.
- **LDAP / DN / RDN** : A directory protocol that gathers accounts in a tree, and the full path / single piece of an entry.
- **NSS vs PAM** : The axis that looks up "who is this" (`nsswitch.conf`) and the axis that verifies "is the password correct."
- **SSSD** : The modern standard account integration daemon that bundles NSS and PAM and also caches.

## 📝 Practice Questions

**Question 1.** Which is the correct command to add user alice to the docker group while keeping her existing secondary groups intact?

A) `usermod -G docker alice`

B) `usermod -aG docker alice`

C) `usermod -g docker alice`

D) `groupadd docker alice`

**Answer: B**

Explanation: The `-a` (append) in `usermod -aG` adds a new group while keeping the existing secondary groups. Using only `-G` without `-a`, as in A, makes all existing secondary groups disappear and be replaced with docker alone (dangerous). The `-g` in C is the option that changes the primary group, and `groupadd` in D is the command for creating a group, so its purpose is different.

---

**Question 2.** Which `useradd` option creates the home directory and copies the files from `/etc/skel`?

A) `-d`

B) `-c`

C) `-m`

D) `-r`

**Answer: C**

Explanation: `-m` (make home) creates the home directory and copies the default configuration files (.bashrc, etc.) from `/etc/skel`. The `-d` in A only specifies the home path and does not create it, `-c` in B is the GECOS comment, and `-r` in D is the option for creating a system account.

---

**Question 3.** Which is the most accurate description of the difference between `su alice` and `su - alice`?

A) They are exactly the same and there is no difference

B) `su - alice` fully applies alice's login environment (.profile, PATH, home)

C) `su alice` switches to root privileges and `su - alice` is regular privileges

D) `su - alice` can switch without alice's password

**Answer: B**

Explanation: With a hyphen (`-`) you switch to a login shell, which reads the target user's `.bash_profile`/`.profile` and resets PATH, HOME, and the working directory based on that user. Without the hyphen, part of the environment is inherited from the original user. A and C misdescribe the difference/privileges, and D is wrong because it has nothing to do with whether a password is required.

---

**Question 4.** Which is the correct recommended tool for editing the `/etc/sudoers` file, along with the reason?

A) `vi` — because it can edit the fastest

B) `cat` — because it can safely overwrite the file contents

C) `visudo` — because it checks syntax on save and takes a lock to prevent corruption

D) `nano` — because it automatically creates a backup

**Answer: C**

Explanation: `visudo` checks for syntax errors when saving sudoers and takes a lock to prevent simultaneous editing. If you edit with plain `vi` and get the syntax wrong, all of sudo becomes inoperable and the system can be locked out. A and D have no such protection, and `cat` in B is not an editing tool.

---

**Question 5.** Which is correct about the difference in the password that `su` and `sudo` require for authentication?

A) su requires your own password, sudo requires the target user's password

B) su requires the target user's password, sudo requires your own password

C) Both require only the root password

D) Neither requires a password

**Answer: B**

Explanation: `su` requires the password of the target user you want to switch to, while `sudo` requires the password of the person running the command. For this reason, sudo can delegate only specific commands without sharing the root password, which fits the least-privilege and audit principles. A is exactly the opposite, and C and D are wrong for both commands.

---

**Question 6.** Which field of `/etc/shadow` does the command `chage -M 90 alice` change?

A) Last password change date (3rd field)

B) Minimum change interval (4th field, Min)

C) Maximum validity days (5th field, Max)

D) Warning days (6th field, Warn)

**Answer: C**

Explanation: `chage -M` (uppercase M) sets the maximum validity days (Max) of the password, which is the 5th field of shadow. After 90 days a password change is forced. A is `-d`, Min in B is `-m` (lowercase), and Warn in D is `-W`, each touching a different field.

---

**Question 7.** Which is correct about what happens when you run `userdel alice` (without options)?

A) Everything, including the home directory and mail spool, is deleted

B) Only the account records are deleted and the home directory remains

C) The account is only locked and the records are left as they are

D) Only the group information is deleted and the user is kept

**Answer: B**

Explanation: `userdel` without options deletes only the records in passwd/shadow/group and leaves the home directory. To also remove the home and mail spool, you must add the `-r` option (A is the behavior of `-r`). C is the behavior of locking (`passwd -l`/`usermod -L`), and D is not true.

---
