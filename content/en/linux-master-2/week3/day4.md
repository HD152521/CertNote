# Day 4 - User and Account Management

## 📌 Key Takeaways

- Account info lives in **`/etc/passwd`**, and **passwords live separately in `/etc/shadow`**. The reason for the split is **security**.
- `/etc/passwd` has **7 fields separated by colons (`:`)**. The UID, GID, home directory, and login shell go here.
- **UID 0 is root.** Even if the name isn't root, an account with UID 0 has administrator privileges.
- Three account commands: **`useradd` (create) · `usermod` (modify) · `userdel` (delete)**.
- **`su` switches users**, and **`sudo` runs just one command as administrator**. The `sudo` configuration is in `/etc/sudoers`.

## Where Is Account Information?

| File | What it holds | Permissions |
|------|--------|------|
| **`/etc/passwd`** | Basic account info | Anyone can read it |
| **`/etc/shadow`** | **Encrypted passwords** and expiry policy | **Only root** can read it |
| **`/etc/group`** | Group info | Anyone can read it |

> Why they were split: many programs need to look up user names and UIDs in `/etc/passwd`, so **it has to be readable by anyone.** But if passwords were in there too, anyone could take the hashes and crack them. So only the passwords were pulled out into `/etc/shadow` and locked down to **root only**.

### Reading One Line of /etc/passwd

```text
   user:x:1000:1000:Test User:/home/user:/bin/bash
     │  │  │    │       │          │          │
     │  │  │    │       │          │          └── ⑦ login shell
     │  │  │    │       │          └───────────── ⑥ home directory
     │  │  │    │       └──────────────────────── ⑤ description (comment)
     │  │  │    └──────────────────────────────── ④ GID (primary group)
     │  │  └───────────────────────────────────── ③ UID
     │  └──────────────────────────────────────── ② password slot (x = it's in shadow)
     └─────────────────────────────────────────── ① user name
```

- **7 fields, with a colon (`:`) as the delimiter** — there are exam questions on these two facts.
- The **`x`** in the second field is a marker meaning "the actual password is in `/etc/shadow`."
- The fifth, description field may be empty. Even so, **the colons remain** (`user:x:1000:1000::/home/user:/bin/bash`), so the field count is always 7.

### Reading One Line of /etc/shadow

```text
   alice:$6$Xy3k...:19968:0:99999:7:::
     │      │         │   │   │   │ │││
     │      │         │   │   │   │ ││└─ ⑨ reserved (unused)
     │      │         │   │   │   │ │└── ⑧ account expiration date
     │      │         │   │   │   │ └─── ⑦ grace (inactive) days after expiry
     │      │         │   │   │   └───── ⑥ warning days before expiry
     │      │         │   │   └───────── ⑤ maximum days of use
     │      │         │   └───────────── ④ minimum days of use
     │      │         └───────────────── ③ date of last change
     │      └─────────────────────────── ② encrypted password
     └────────────────────────────────── ① user name
```

- **`/etc/shadow` has 9 fields.** It is asked as a pair with the 7 of `/etc/passwd`.
- The date in ③ is written not as year/month/day but as the **number of days counted from January 1, 1970**.
- If ② starts with `$6$`, it was encrypted with SHA-512 (`$1$` is MD5, `$5$` is SHA-256).
- If the ② slot is `!`, `!!`, or `*`, the account **cannot log in with a password**. This is the case for a freshly created account whose password hasn't been set yet, a locked account, or a system account.

### Reading One Line of /etc/group

```text
   dev:x:1500:alice,bob
    │  │   │      │
    │  │   │      └── ④ member list (separated by commas)
    │  │   └───────── ③ GID
    │  └───────────── ② group password slot
    └──────────────── ① group name
```

| File | Number of fields | Delimiter |
|------|--------|-------|
| `/etc/passwd` | **7** | `:` |
| `/etc/shadow` | **9** | `:` |
| `/etc/group` | **4** | `:` (`,` between members) |

> Pitfall: in ④ of `/etc/group`, only users who have that group as a **secondary group** are listed. Users whose **primary group** it is do not appear here — that relationship is recorded in the GID field of `/etc/passwd`.

### UID Rules

| UID | Meaning |
|-----|-----|
| **0** | **root** — administrator privileges regardless of name |
| 1-999 | System accounts (for daemons) |
| **1000 and up** | Regular users (on some distributions it starts at 500) |

- The key point is that **UID 0 is root**. Even if you rename the account, it is root if the UID is 0.
- For accounts that shouldn't be allowed to log in, set the shell to **`/sbin/nologin`** or `/bin/false`.

## Handling Accounts

| Command | What it does |
|------|--------|
| `useradd name` | Create an account |
| `useradd -m name` | Create **the home directory too** |
| `useradd -u 1500 -g dev name` | Specify the UID and primary group |
| `passwd name` | Set or change the password |
| `usermod -aG group name` | **Add a secondary group** |
| `usermod -L` / `-U` | Lock / unlock the account |
| `userdel name` | Delete the account (the home is left behind) |
| `userdel -r name` | Delete **the home directory too** |
| `id name` | Check UID, GID, and group memberships |
| `who` / `w` | Users currently logged in |

```bash
sudo useradd -m alice        # create along with a home directory
sudo passwd alice            # set the password
id alice                     # uid=1001(alice) gid=1001(alice) ...
sudo usermod -aG wheel alice # add to the wheel group
sudo userdel -r alice        # delete including the home
```

> Two pitfalls. ① **`useradd` sometimes doesn't create the home directory automatically** — `-m` does that job (it depends on the distribution's default settings). ② **Using `usermod -G` alone wipes out the existing secondary groups.** To add one, always use **`-aG`**.

### useradd Options Pair with passwd Fields

The options of `useradd` ultimately decide which field of `/etc/passwd` gets filled in.

| Option | What it fills | passwd field |
|------|----------|------------|
| `-u UID` | User number | ③ |
| `-g group` | **Primary group** | ④ |
| `-G group,group` | **Secondary groups** | (recorded in `/etc/group`) |
| `-c "description"` | Description | ⑤ |
| `-d path` | Home directory location | ⑥ |
| `-s shell` | Login shell | ⑦ |
| `-e date` | Account expiration date | (`/etc/shadow` ⑧) |

```bash
sudo useradd -m -u 1500 -g dev -G wheel -c "Kim" -d /home/kim -s /bin/bash kim
grep kim /etc/passwd
# kim:x:1500:1500:Kim:/home/kim:/bin/bash
```

- **Lowercase `-g` is the primary group (just one), and uppercase `-G` is the secondary groups (several).** It means the same in `usermod`.
- Items you didn't give an option for are filled with defaults. There are separate places where those defaults are written.

| File | What it holds |
|------|--------|
| `/etc/default/useradd` | Default home location, default shell, etc. (check with `useradd -D`) |
| `/etc/login.defs` | Policies such as UID range and maximum password age |
| `/etc/skel` | **Default files copied into a new home directory** (`.bashrc`, etc.) |

- Right after creating an account, it **has no password and cannot log in.** It becomes usable only after you set one with `passwd name`.

### Several Ways to Lock an Account

| Command | What it does |
|------|--------|
| `passwd -l name` | **Lock** the password (lock) |
| `passwd -u name` | **Unlock** it (unlock) |
| `passwd -d name` | **Delete** the password — dangerous because logging in without a password becomes possible |
| `passwd -S name` | Check the password **status** |
| `usermod -L` / `-U` | Lock / unlock the account |
| `usermod -s /sbin/nologin name` | Change the login shell to **block login itself** |

- Locking works by **putting a `!` in front of** the password in `/etc/shadow`, so that no password matches. The account and files stay as they are.
- **A regular user can change only their own password with `passwd`**, and other accounts' passwords plus `-l`, `-u`, and `-d` can be used only by root.
- The remaining options of `usermod` are the same as `useradd` — `-s` (shell), `-d` (home), `-g` (primary group), `-c` (description). Just remember separately `-l newname`, which changes the login name (uppercase `-L` is lock).

## Groups

| Kind | Description |
|------|------|
| **Primary group** | The GID field of `/etc/passwd`. This group is attached when you create a file |
| **Secondary group** | A group where the name is listed in `/etc/group`. There can be several |

| Command | What it does |
|------|--------|
| `groupadd name` | Create a group |
| `groupdel name` | Delete a group |
| `groups user` | Check group memberships |
| `groupadd -g 1500 name` | Create with a specified GID |
| `groupmod -n newname oldname` | **Rename** a group |
| `gpasswd -a user group` | **Add** a user to a group |
| `gpasswd -d user group` | **Remove** a user from a group |

```text
$ id alice
uid=1001(alice) gid=1001(alice) groups=1001(alice),10(wheel),1500(dev)
     │              │                 │
     │              │                 └── all member groups (primary + secondary)
     │              └──────────────────── primary group
     └─────────────────────────────────── user number
```

- If you don't specify a group when creating an account, it is common for **a group with the same name as the user** to be created together and become the primary group. This is why `alice`'s primary group above is `alice`.
- After adding a secondary group, **you have to log in again** for it to take effect. A shell that is already open keeps the group list from when you logged in.
- A group that is being used as some user's primary group cannot be removed with `groupdel`.

### Who Is Connected

| Command | What it shows |
|------|------------|
| `whoami` | The name of the user **whose privileges you are currently using** |
| `who` | Users currently logged in, with their terminals and login times |
| `w` | In addition to `who`, **what they are doing** and the system load |
| `last` | **Past login history** |
| `id` | UID, GID, and group memberships |

```text
$ who
user     pts/0        2026-09-03 09:00 (192.168.0.10)
$ su -
Password:
# whoami
root
# who am i
user     pts/0        2026-09-03 09:00 (192.168.0.10)
```

- After switching with `su`, **`whoami` shows the user you switched to** (root), while **`who am i` shows the user who first logged in** (user). One space changes the answer.

## Briefly Raising Privileges — su and sudo

| Aspect | `su` | `sudo` |
|------|------|--------|
| What it does | **Switches the user itself** | Runs **just one command** with other privileges |
| Password required | **The target account's** password | **Your own** password |
| Logging | Hard to keep | **Records** who did what |
| Configuration file | — | **`/etc/sudoers`** |

```bash
su          # switch to root (environment variables stay the same)
su -        # switch to root + load root's environment too
sudo command    # only that one command with root privileges
```

- **The hyphen in `su -`** is important. With it, the environment variables and working directory also change **as if you had logged in** as the target user.
- `sudo` is recommended because of the **principle of least privilege and audit trails**. There is also no need for several people to share the root password.
- **Edit `/etc/sudoers` with `visudo`.** It checks for syntax errors, so if you edit it directly and break it, you can't use sudo at all.

```text
$ pwd
/home/user
$ su
Password:
# pwd
/home/user          ← su : location and environment stay the same
# exit
$ su -
Password:
# pwd
/root               ← su - : to root's home, with root's environment
```

| Usage | Meaning |
|---------|-----|
| `su` | If you omit the user name, it switches to **root** |
| `su - alice` | Switch to alice, including alice's environment |
| `su -c "command" alice` | **Only that one command** with alice's privileges, without switching |
| `sudo -u alice command` | Run a command **with alice's privileges**, not root's |
| `sudo -l` | The **list of commands I can run** with `sudo` |
| `exit` | End the switched shell and return to the original user |

- **When root becomes another user with `su`, no password is asked.** The target account's password is needed only when a regular user switches.
- Not every user can use `sudo`. **Only users and groups allowed in `/etc/sudoers`** can.

```text
root    ALL=(ALL)       ALL
%wheel  ALL=(ALL)       ALL
```

- The **`%`** at the front is a marker for a **group**. The second line above reads as "members of the wheel group can run any command with `sudo`."
- The name of the administrator group differs by distribution — **the RedHat family uses the `wheel`** group, and the **Debian · Ubuntu family uses the `sudo`** group. That is why `usermod -aG wheel alice` effectively means "give alice `sudo` privileges."

> Tomorrow we will bundle the commands learned this week into a single summary.

## 📖 Glossary

- **`/etc/passwd`** : A file holding the basic information of user accounts. Seven colon-separated fields.
- **`/etc/shadow`** : A file holding encrypted passwords and expiry policy. Only root can read it.
- **UID** : User identification number. 0 is root, and 1000 and up are regular users.
- **GID** : Group identification number.
- **Primary group** : The group recorded in `/etc/passwd`. It becomes the group of newly created files.
- **Secondary group** : An additional group the user belongs to. Added with `usermod -aG`.
- **`su`** : A command that switches to another user. Requires the target account's password.
- **`sudo`** : A command that runs just one specified command with administrator privileges. Uses your own password.
- **`visudo`** : A command that safely edits `/etc/sudoers` with syntax checking.

## 📝 Practice Questions

**Question 1.** Which of the following is the field delimiter and number of fields of the `/etc/passwd` file?

A) Colon (:), 7  
B) Comma (,), 5  
C) Tab, 6  
D) Space, 7  

**Answer: A**  
Explanation: In `/etc/passwd`, each line consists of 7 fields separated by colons. In order they are user name, password slot, UID, GID, description, home directory, and login shell. The `x` in the second field means the actual password is in `/etc/shadow`.

---

**Question 2.** Which of the following is the UID value that represents the root account?

A) 1  
B) 100  
C) 1000  
D) 0  

**Answer: D**  
Explanation: UID 0 means root, that is, the administrator with all privileges on the system. Even if the account name is not root, it has administrator privileges if the UID is 0. UIDs 1-999 are for system accounts, and 1000 and up (500 and up on some distributions) are assigned to regular users.

---

**Question 3.** Which of the following is the file where users' encrypted passwords are stored?

A) /etc/group  
B) /etc/shadow  
C) /etc/passwd  
D) /etc/sudoers  

**Answer: B**  
Explanation: `/etc/passwd` is readable by anyone because many programs need to look up user information. So the password hashes were separated into `/etc/shadow`, which only root can read. `/etc/group` holds group info, and `/etc/sudoers` holds the sudo permission settings.

---

**Question 4.** Which of the following commands adds a user to a new group while keeping the existing secondary groups?

A) usermod -G dev alice  
B) useradd -G dev alice  
C) usermod -aG dev alice  
D) groupadd -a dev alice  

**Answer: C**  
Explanation: Using `usermod -G` alone **replaces** the groups with the specified list, so the existing secondary groups disappear. To add while keeping existing memberships, you must also use `-a` (append), specifying it in the form `-aG`. `useradd` is a command that creates a new account.

---

**Question 5.** Which of the following is a correct description of the difference between `su` and `sudo`?

A) Both require entering the target account's password  
B) `su` uses your own password, and `sudo` uses the root password  
C) `sudo` switches the user itself and `su` runs just one command  
D) `su` switches users, and `sudo` raises privileges to run just one command  

**Answer: D**  
Explanation: `su` switches to the specified user and requires that account's password. `sudo` runs just one command with administrator privileges and you enter your own password. `sudo` leaves a record of who ran which command, which favors audit trails, and permissions are managed by editing `/etc/sudoers` with `visudo`.
