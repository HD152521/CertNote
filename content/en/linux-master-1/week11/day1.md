# Day 1 - Samba: File and Printer Sharing Between Windows and Linux

## 📌 Key Points

- **Samba** = software that implements Windows' **SMB/CIFS** protocol on Linux. It enables file and printer sharing between Windows and Linux.
- There are two daemons — **smbd** (file sharing and authentication, TCP 139/445) and **nmbd** (NetBIOS name resolution and browsing, UDP 137/138).
- All configuration lives in `/etc/samba/smb.conf`. The special sections are `[global]`, `[homes]`, and `[printers]`; every other section name is a **share name**.
- Samba accounts are **separate** from Linux login accounts. Create the Linux account first, then register a Samba password with `smbpasswd -a`.
- Access goes through a **double gate** — you must pass **both** the Samba permissions in `smb.conf` and the Linux filesystem permissions. After editing, validate the syntax with `testparm`.

## What Samba Is: The SMB/CIFS Protocol and Its Two Daemons

- Windows users want to map a network drive in Explorer with `\\server\sharedfolder`, but Windows uses **SMB/CIFS** (Server Message Block) while Linux traditionally uses **NFS**. **Samba** is the tool that bridges this gap.
- **SMB**: a network file sharing protocol created by IBM in the 1980s and developed further by Microsoft. It was later extended into **CIFS** (Common Internet File System) and became the standard for Windows network sharing today.
- **Samba**: free software that implements the SMB protocol on top of Linux/Unix. It makes a Linux server look just like a Windows file server.
- Samba traditionally runs as **two daemons**.

| Daemon | Role | Ports used |
|------|------|-----------|
| `smbd` | File/printer sharing and user authentication | TCP 139, 445 |
| `nmbd` | NetBIOS name service and network browsing (name-to-IP resolution) | UDP 137, 138 |

- `smbd` is the core that handles the actual file transfers and authentication.
- `nmbd` is the name resolution service that makes the server name show up in Windows' "Network Neighborhood".
- In modern environments things work with just DNS and port 445, but the exam asks you to tell the two daemons' roles apart.

`smbd` handles **file sharing and authentication**, and `nmbd` handles **NetBIOS name resolution and browsing**. The ports pair up too — smbd uses 139/445 (TCP), nmbd uses 137/138 (UDP).

After installing the Samba package, you normally manage the services with the following commands.

```bash
# Install packages (RHEL family)
yum install samba samba-client samba-common

# Start services / enable at boot (systemd)
systemctl start smb nmb
systemctl enable smb nmb

# Older versions (SysV init)
service smb start
```

**Distribution differences**: the service names differ between distributions. On the RHEL/CentOS family they are `smb` and `nmb`; on the Debian/Ubuntu family the service names are `smbd` and `nmbd`. The configuration file location is the same on RHEL: `/etc/samba/smb.conf`.

## smb.conf: The Configuration File That Holds Everything About Samba

- Samba's behavior is determined almost entirely by a single file, `/etc/samba/smb.conf`.
- Its structure is similar to a Windows INI file — it is divided into **sections**.
- Section names are wrapped in square brackets `[ ]`.

```ini
# /etc/samba/smb.conf

[global]
    workgroup = WORKGROUP
    server string = Samba Server %v
    netbios name = LINUXSRV
    security = user
    map to guest = Bad User
    log file = /var/log/samba/log.%m
    max log size = 50

[homes]
    comment = Home Directories
    browseable = no
    writable = yes

[public]
    comment = Public Share
    path = /srv/samba/public
    browseable = yes
    writable = yes
    guest ok = yes
```

There are three sections with special meaning.

| Section | Meaning |
|------|------|
| `[global]` | Global settings that apply to the whole server: workgroup, security mode, logging, etc. |
| `[homes]` | Automatically shares each user's home directory (special section) |
| `[printers]` | Automatically shares the printers registered on the system (special section) |

- Every section name other than `[global]` becomes a **share name**.
- Example: when you access `\\LINUXSRV\public` from Windows, the settings in the `[public]` section apply.

`[homes]` is a magical section. When user `kim` connects, Samba clones the `[homes]` definition to create a virtual share called `[kim]` and points it at `kim`'s home directory (`/home/kim`). That is why you do not need to define a separate share for every user.

### Key directives in the [global] section

- The `security` directive is the most important setting, because it determines the authentication method.

| security value | Meaning |
|-------------|------|
| `user` | (Default, recommended) The Samba server itself authenticates with username/password. Connecting users must have a Samba account |
| `share` | Per-share password authentication (legacy, now deprecated) |
| `domain` | Delegates authentication to a domain controller (a separate server) |
| `ads` | Joins an Active Directory domain and authenticates through it |

- `workgroup` : specifies the Windows workgroup name.
- `server string` : specifies the server description shown on the network.
- You can use **substitution variables** such as `%v` (version) and `%m` (client NetBIOS name).

## Defining Shares: A Close Look at the Per-Section Directives

- You need to know the directives commonly used in individual share sections precisely so you can fill in the blanks on the practical exam.

| Directive | Meaning | Example |
|--------|------|-----|
| `path` | Actual directory path to share | `path = /srv/samba/data` |
| `comment` | Share description | `comment = Team Share` |
| `browseable` | Whether the share name appears in the network list | `browseable = yes` |
| `writable` (= `read only = no`) | Whether writing is allowed | `writable = yes` |
| `read only` | Read-only (the opposite of writable) | `read only = yes` |
| `guest ok` (= `public`) | Allows guest access without a password | `guest ok = yes` |
| `valid users` | Users/groups allowed access | `valid users = kim, @sales` |
| `write list` | Users allowed to write on a read-only share | `write list = admin` |
| `create mask` | Permission mask for newly created files | `create mask = 0644` |
| `directory mask` | Permission mask for newly created directories | `directory mask = 0755` |

> ⚠️ **Caution**: `writable = yes` and `read only = no` **mean the same thing**. If you write the two contradictorily at the same time, the last value wins. Groups get a leading `@`, as in `valid users = @sales` (the group designation symbol).

- The following is an example of a share that only the sales team (the `sales` group) can read and write.

```ini
[sales]
    comment = Sales Team Data
    path = /srv/samba/sales
    valid users = @sales
    writable = yes
    browseable = yes
    create mask = 0660
    directory mask = 0770
```

**The double gate of permissions**: access to a Samba share must pass two checks. (1) The **Samba-level permissions** in `smb.conf`, such as `valid users`/`writable`, and (2) the **Linux filesystem permissions (chmod/chown)** on that directory. If either one blocks you, access is denied. If "smb.conf is right but I can't write", nine times out of ten it is a Linux directory permission problem.

## testparm: Validating the Configuration File Syntax

- After editing `smb.conf`, check the syntax with **`testparm`** to catch typos.
- In practice, this is a step you always go through before restarting the service.

```bash
# Syntax check + print a summary of the settings that will be applied
testparm

# Check a specific file
testparm /etc/samba/smb.conf
```

- If `Loaded services file OK.` appears in the output, the syntax is fine.
- Pressing Enter afterward displays all the settings that will actually be applied.

`Edit smb.conf → validate with testparm → systemctl restart smb → test the connection with smbclient`. Work in this order.

## smbpasswd: Creating Samba-Only Accounts

- With `security = user`, connecting users must have a **Samba password**.
- The key point is that this is **separate** from the Linux login password (`/etc/shadow`).
- Samba uses its own password database (TDB format by default, and the `/etc/samba/smbpasswd` file in the past).
- **Prerequisite**: a Samba user must already exist as a Linux system account. A Samba account is just a password layered on top of an existing Linux user.

```bash
# 1) The Linux system account must exist first
useradd -s /sbin/nologin sambauser

# 2) Register the Samba password (interactive, enter the password twice)
smbpasswd -a sambauser
```

- Memorize the main `smbpasswd` options precisely.

| Option | Meaning |
|------|------|
| `-a user` | **Add** the user to the Samba database |
| `-x user` | **Delete** the Samba user |
| `-d user` | **Disable** the user account |
| `-e user` | **Enable** a disabled account |
| `-n user` | Set the password to **none (null)** |
| `(no option) user` | **Change** that user's password |

> ⚠️ **Trap**: if the user is not in `/etc/passwd` before you add them with `smbpasswd -a`, you get an error. Do not mix up the order "Linux account first, Samba password afterward". You can also check the list of registered Samba users with `pdbedit -L`.

```bash
# List registered Samba users
pdbedit -L

# Including detailed information
pdbedit -Lv
```

## smbclient: Connecting to and Testing SMB Shares from Linux

- Once the server setup is done, you need to verify the connection from the client side.
- **`smbclient`** is a tool that connects to SMB shares with an interactive interface similar to FTP.

```bash
# List the shares the server offers (-L = list)
smbclient -L //LINUXSRV -U sambauser

# Connect to a specific share (enters an FTP-like prompt)
smbclient //LINUXSRV/sales -U sambauser

# After connecting, use ls, get, put, cd, etc. at the smb: \> prompt
```

- You can also **mount** an SMB share on a Linux client and use it like an ordinary directory.

```bash
# Mount with the cifs type
mount -t cifs //LINUXSRV/sales /mnt/sales -o username=sambauser

# Example /etc/fstab entry
# //LINUXSRV/sales  /mnt/sales  cifs  username=sambauser,password=secret  0 0
```

**Summary of mount types**: Windows/Samba shares use `mount -t cifs` (formerly `-t smbfs`), and Linux-to-Linux uses `mount -t nfs`. If the exam asks for "the type for mounting a Windows shared folder on Linux", it is `cifs`.

## The Samba Setup Flow at a Glance

```bash
# ① Install
yum install samba samba-client

# ② Prepare the shared directory + Linux permissions
mkdir -p /srv/samba/sales
chgrp sales /srv/samba/sales
chmod 2770 /srv/samba/sales      # SGID for group inheritance

# ③ Edit smb.conf ([global] + [sales] sections)
vi /etc/samba/smb.conf

# ④ Validate the syntax
testparm

# ⑤ Register the Samba account
smbpasswd -a sambauser

# ⑥ Start the services
systemctl restart smb nmb

# ⑦ Open the firewall (firewalld)
firewall-cmd --add-service=samba --permanent
firewall-cmd --reload

# ⑧ Test the connection
smbclient -L //localhost -U sambauser
```

**Try it yourself**: follow steps ① to ⑧ above once with two virtual machines (or local loopback). In particular, reading the warning messages that ④ `testparm` spits out gives you a feel for which directive is wrong. It is easy to forget the firewall in ⑦ and then flounder with "I can't connect".

Tomorrow we cover NFS, the standard for sharing between Linux systems, and compare how it differs from Samba.

## 📖 Glossary

- **SMB/CIFS** : The network file sharing protocol used by Windows. Samba implements it on Linux.
- **smbd** : Samba's core daemon that handles file/printer sharing and user authentication. Uses TCP 139/445.
- **nmbd** : The daemon that resolves NetBIOS names to IPs and makes the server appear in the network list. Uses UDP 137/138.
- **smb.conf** : Samba's single configuration file in `/etc/samba/`. It is made up of sections in square brackets.
- **[homes]** : A special section that automatically turns the connecting user's home directory into a virtual share.
- **security = user** : The default mode in which the Samba server authenticates directly with its own accounts/passwords.
- **valid users** : The list of users who can access that share. A leading `@` on a name means a group.
- **smbpasswd** : The command that registers, deletes, and locks Samba-only passwords. `-a` add, `-x` delete, `-d` disable, `-e` enable.
- **testparm** : A validation tool that checks the syntax of `smb.conf` and displays the values that will actually be applied.
- **cifs** : The filesystem type specified when mounting a Windows/Samba share on Linux (`mount -t cifs`).

## 📝 Practice Questions

**Question 1.** Which daemon is responsible for the actual file sharing and user authentication in Samba?

A) nmbd
B) smbd
C) rpcbind
D) winbindd

**Answer: B**

Explanation: `smbd` handles file/printer sharing and user authentication, and uses TCP ports 139/445. `nmbd` is a separate daemon responsible for NetBIOS name resolution and network browsing, and uses UDP 137/138. `rpcbind` is the port mapper used by NFS, and `winbindd` is a helper daemon for domain integration.

---

**Question 2.** In `smb.conf`, which special section automatically shares each user's home directory?

A) [global]
B) [printers]
C) [homes]
D) [public]

**Answer: C**

Explanation: `[homes]` is a special section that, when a user connects, automatically creates a virtual share for that user's home directory (`/home/user`). `[global]` holds the server-wide settings, and `[printers]` handles automatic printer sharing. `[public]` is just an ordinary user-defined share name, not a special section.

---

**Question 3.** Which of the following correctly describes the `smb.conf` settings below?

```ini
[data]
    path = /srv/data
    valid users = @sales
    writable = yes
```

A) Every user can access it as a guest
B) Only a single user named sales can access it
C) Users belonging to the sales group can read and write
D) It is a read-only share, so writing is not possible

**Answer: C**

Explanation: In `valid users`, a leading `@` means a group. So `@sales` refers to all users belonging to the sales group. Because `writable = yes`, writing is possible as well as reading. Without the `@` it would be an individual user name, but here it designates a group.

---

**Question 4.** Which is the correct command to add a Samba user to the database?

A) smbpasswd -x user
B) smbpasswd -a user
C) smbpasswd -d user
D) smbpasswd -e user

**Answer: B**

Explanation: `-a` (add) adds a user to the Samba database. `-x` deletes, `-d` disables, and `-e` enables. However, the user you want to add must already exist as a Linux system account (`/etc/passwd`).

---

**Question 5.** Which command checks for syntax errors after editing `smb.conf`?

A) smbclient -L
B) testparm
C) pdbedit -L
D) nmblookup

**Answer: B**

Explanation: `testparm` checks the syntax of `smb.conf` and displays a summary of the settings that will actually be applied. `smbclient -L` lists the server's shares, `pdbedit -L` prints the list of registered Samba users, and `nmblookup` is a tool that queries NetBIOS names.

---

**Question 6.** Which filesystem type is used when mounting a Windows/Samba shared folder on a Linux client?

A) nfs
B) ext4
C) cifs
D) tmpfs

**Answer: C**

Explanation: Windows/Samba shares use the SMB/CIFS protocol, so you mount them with `mount -t cifs` (formerly `smbfs`). `nfs` is the sharing type between Linux/Unix systems, `ext4` is a local disk filesystem, and `tmpfs` is a memory-based temporary filesystem.

---

**Question 7.** Which of the following correctly describes the `security = user` setting in the `[global]` section?

A) A legacy method that sets a password per share
B) The Samba server itself performs authentication with a username and password
C) Delegates authentication to a separate domain controller
D) Joins Active Directory and authenticates through it

**Answer: B**

Explanation: `security = user` is the default and recommended mode, in which the Samba server authenticates directly with the users/passwords in its own database. Therefore connecting users need a Samba account registered with `smbpasswd`. `share` is the per-share password method (deprecated), `domain` is domain delegation, and `ads` is the Active Directory join method.

---
