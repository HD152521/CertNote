# Day 2 - File Transfer Services: FTP Active/Passive Modes and vsftpd

## 📌 Key Takeaways

- FTP is a **"two-channel protocol" that handles control (port 21) and data over separate connections**. This structure is the root of every trap.
- **The direction of the data connection separates active from passive** — in active (**PORT**), the server connects back from port 20 to the client; in passive (**PASV**), the client connects to a high port on the server.
- **Clients behind NAT/firewalls need passive mode**. That's why passive is the de facto standard today.
- vsftpd security essentials: **`chroot_local_user=YES` (lock users into their home)**, `userlist_deny` (YES = deny, NO = allow only), `/etc/vsftpd/ftpusers` (always-denied login list).
- **FTPS ≠ SFTP** — FTPS is FTP+TLS (two channels, 990), while **SFTP is SSH-based on single-channel port 22** and has nothing to do with FTP.

## The Two Connections of FTP — Control Channel and Data Channel

- Unlike other protocols, FTP uses **two connections**.

| Channel | Port | Role |
|------|------|------|
| Control channel | 21 | Login, passing commands (LIST, RETR, STOR) |
| Data channel | 20 (active) or a random high port (passive) | Actual transfer of files and directory listings |

- The port 21 control connection is **kept for the whole session**, and **a new, separate data connection is opened** each time data is moved.
- **Who initiates** this data connection is what separates active from passive mode.

FTP can be compared to "a system where you order by phone and receive by courier." Port 21 is the order phone line (always connected), and the data channel is the courier route along which goods travel (opened anew whenever needed). In active mode the courier comes straight to our house (server→client), and in passive mode we go to the distribution center to pick it up (client→server).

## Active Mode vs Passive Mode — The Direction of the Data Connection

- This part is **the core and the trap** of FTP questions.

| Item | Active mode | Passive mode |
|------|-------------------|---------------------|
| Who starts the data connection | The **server** connects to the client | The **client** connects to the server |
| Server data port | Port 20 (fixed) | Random high port (1024 and up) |
| Client port | Random high port (the server connects to it) | Random high port (the client connects from it) |
| Command | PORT (the client announces its own port) | PASV (the server announces the port it will open) |
| Client firewall/NAT | Hard to pass through (server connects back) | Easy to pass through (client connects actively) |

### Active Mode Sequence

```text
1. Client → Server:21  Control connection, "PORT 1500" (my data port is 1500)
2. Server:20   → Client:1500  The server opens the data connection in reverse
```

### Passive Mode Sequence

```text
1. Client → Server:21  Control connection, "PASV" (tell me which port to open)
2. Server → Client  "I've opened port 50000"
3. Client → Server:50000  The client opens the data connection
```

> ⚠️ **Trap**: You must memorize exactly both the fact that "in active mode the server's data port is 20" and the direction "in active mode the server connects back to the client." The exam often offers choices that swap the PORT/PASV commands and the modes. PORT = active, PASV = passive.

**Key distinction**: Why did passive mode become the standard? In active mode the server opens the connection **back** to the client, so if the client is behind NAT or inside a firewall, that connection is blocked. Since most clients today sit behind NAT/firewalls, **passive mode, where the client opens the connection itself, is effectively the default**. "Client behind NAT = passive mode needed" is the signal for the correct answer.

When FTP was designed in 1971 (RFC 114), there were no firewalls or NAT, so active mode, where the server sends data to the client, was natural. But as NAT and firewalls became commonplace in the 1990s, active mode began to be blocked, and RFC 1579 (Firewall-Friendly FTP) recommended passive mode, which is why it is the standard today.

## Installing vsftpd and Key Settings

- Linux's representative FTP server is **vsftpd (Very Secure FTP Daemon)**, which, as the name says, was designed with security as the top priority.

```bash
# Install and start the service
dnf install vsftpd          # RHEL family (apt install vsftpd : Debian family)
systemctl enable --now vsftpd
ss -tlnp | grep :21         # Verify port 21 is LISTENing
```

### /etc/vsftpd/vsftpd.conf Key Directives

```bash
# Anonymous access
anonymous_enable=NO         # Allow anonymous login (usually NO for security)
anon_upload_enable=NO       # Allow uploads by anonymous users

# Local users
local_enable=YES            # Allow login with local system accounts
write_enable=YES            # Allow write commands such as upload and delete
local_umask=022             # Default umask for uploaded files

# Directory restriction (security essential)
chroot_local_user=YES       # Lock the user into their home directory (blocks moving up)
allow_writeable_chroot=YES  # Allow when the chroot home is writable

# Access control
userlist_enable=YES         # Control access via /etc/vsftpd/user_list
userlist_deny=YES           # YES = deny users in the list, NO = allow only the list

# Passive mode port range (for opening in the firewall)
pasv_enable=YES
pasv_min_port=40000
pasv_max_port=40100
```

> ⚠️ **Trap**: The meaning of `userlist_deny` is easy to get backwards. With `userlist_deny=YES`, users listed in user_list are **denied** (blacklist); with `userlist_deny=NO`, **only** the listed users are **allowed** (whitelist). Also, `/etc/vsftpd/ftpusers` is the always-denied list, and system accounts such as root are included by default.

**Key distinction**: `chroot_local_user=YES` is the key security setting that **locks** users into their own home so they can't go up to parent directories. When the home directory is writable, vsftpd refuses for security reasons, so you must also give `allow_writeable_chroot=YES`. Summarize it as "blocking upward movement = chroot".

When vsftpd uses passive mode, the data port is a random high port, so the firewall blocks it. So you narrow the range with `pasv_min_port` to `pasv_max_port` and open only that range in the firewall. Opening all high ports indiscriminately would wreck security, so "define a range → open only that range" is the standard approach.

### Try It Yourself — Testing Connection and Transfer

```bash
# Connect with an FTP client
ftp 192.168.1.10
# Name: ftpuser / Password: ****
ftp> passive          # Switch to passive mode
ftp> ls               # Get the listing over the data channel
ftp> get report.txt   # Download
ftp> put backup.tar   # Upload
ftp> bye

# Open FTP and the passive ports in the firewall (firewalld)
firewall-cmd --permanent --add-service=ftp
firewall-cmd --permanent --add-port=40000-40100/tcp
firewall-cmd --reload
```

## Secure FTP — The Decisive Difference Between FTPS and SFTP

- Plaintext FTP sends **the ID, password, and files all as-is**. That's why an encryption method is needed.
- You must **be sure to tell apart the two similarly named methods**.

| Item | FTPS | SFTP |
|------|------|------|
| What it is | FTP + SSL/TLS encryption | SSH-based file transfer |
| Underlying protocol | The FTP protocol as-is + TLS | Part of the SSH protocol |
| Port | 21 (explicit FTPS) or 990 (implicit) | **22 (same as SSH)** |
| Connection structure | Control + data, two channels (complex) | Single channel (on top of SSH) |
| Firewall friendliness | Tricky because of the data ports | Simple, just port 22 |
| Server | An FTP server such as vsftpd | sshd (no separate FTP server needed) |

**Key distinction**: FTPS and SFTP only look alike in name; they are entirely different technologies. **FTPS = FTP wrapped in TLS** (still two channels, port 990), **SFTP = file transfer running on top of SSH** (single channel on port 22, unrelated to FTP). "SFTP is part of SSH, port 22" is the key point.

Any choice describing SFTP as "Secure FTP" or "the same as FTPS" is wrong. SFTP is the SSH File Transfer Protocol and doesn't use the FTP protocol at all. Its port is also 22 (SSH), not 990 (FTPS). A choice mixing the two is the trap.

The reason SFTP is overwhelmingly preferred in practice is that "one firewall hole (port 22) and you're done." FTPS requires opening the control and data channels plus the passive port range, which is a headache in NAT environments. If SSH is already open, SFTP comes along with no extra configuration, so it has become the default choice for secure file transfer today.

## Pre-Exam Checklist

- Control 21, active data 20, passive data high ports
- Active = server connects to the client (PORT), passive = client connects to the server (PASV)
- Client behind NAT = passive mode needed
- vsftpd config is `/etc/vsftpd/vsftpd.conf`, the deny list is ftpusers
- chroot_local_user = lock into home, watch the meaning of userlist_deny
- FTPS = FTP+TLS (990), SFTP = SSH-based (22)

## 📖 Glossary

- **Control channel / Data channel** : The port 21 connection for exchanging login and commands / the separate connection over which actual files and listings travel.
- **Active mode** : The method where the client announces its own port with `PORT` and the server connects **back** from port 20.
- **Passive mode** : The method where the server announces, via `PASV`, the high port it has opened and **the client** connects to it.
- **PORT / PASV** : The command that opens active mode / the command that requests passive mode. Memorize each paired with its mode.
- **vsftpd** : "Very Secure FTP Daemon". The representative Linux FTP server; its config is `/etc/vsftpd/vsftpd.conf`.
- **`anonymous_enable`** : Whether anonymous login is allowed. Usually set to `NO` for security.
- **chroot jail** : Isolation that locks a user under their own home so they can't go up to parent directories. `chroot_local_user=YES`.
- **`allow_writeable_chroot`** : A setting that stops vsftpd from refusing when the chrooted home is writable.
- **`userlist_deny`** : With `YES`, users in user_list are denied (blacklist); with `NO`, only that list is allowed (whitelist).
- **`ftpusers`** : The list that is always denied login. System accounts such as root are included by default.
- **`pasv_min_port` / `pasv_max_port`** : The passive mode data port range. Only this range is opened in the firewall.
- **FTPS** : Existing FTP wrapped in SSL/TLS. It keeps the two-channel structure and uses 990 (implicit) or 21 (explicit).
- **SFTP** : File transfer running on top of SSH. It is a **single channel on port 22** and doesn't use the FTP protocol at all.

## 📝 Practice Questions

**Question 1.** In FTP active mode, which is the correct direction in which the data connection is established?

A) The client opens the data connection to a high port on the server

B) The server opens the data connection in reverse from port 20 to the port the client specified

C) Both the client and the server use only port 21

D) The server opens the data connection to port 21 of the client

**Answer: B**

Explanation: In active mode, when the client announces its own port with the PORT command, the server opens the connection back to the client from data port 20. A describes passive mode, C ignores that the data channel is separate, and in D, port 21 is the control port and can't be the target of a data connection. "Active = server connects in reverse" is the key.

---

**Question 2.** Which is the generally recommended mode, and the correct reason, when a client behind NAT/a firewall connects to an FTP server?

A) Active mode — the server connects to the client, so it passes through the firewall easily

B) Passive mode — the client opens the data connection directly to the server, so it passes through NAT/firewalls easily

C) Active mode — the data port is fixed at 20, so NAT handles it automatically

D) Passive mode — the server connects in reverse to a high port on the client

**Answer: B**

Explanation: In passive mode the client actively opens the data connection to the server, so it passes easily even from behind NAT/a firewall. In the active mode of A and C, the server connects back to the client and is blocked for a client behind NAT, and D describes the direction of passive mode incorrectly. "Behind NAT = passive mode" is the signal for the correct answer.

---

**Question 3.** Which vsftpd setting locks local users into their own home directory so they can't move up to parent directories?

A) `anonymous_enable=YES`

B) `chroot_local_user=YES`

C) `write_enable=YES`

D) `pasv_enable=YES`

**Answer: B**

Explanation: `chroot_local_user=YES` is the security setting that locks local users into their home directory (chroot jail) and blocks access to parent directories. A allows anonymous access, C allows write commands, and D enables passive mode, so none relate to directory restriction. Remember "lock into home = chroot_local_user".

---

**Question 4.** What is the standard port used by FTP's control (command) channel?

A) 20

B) 21

C) 22

D) 990

**Answer: B**

Explanation: FTP's control channel (login and passing commands) uses port 21. A (20) is the active mode data channel port, C (22) is the SSH/SFTP port, and D (990) is the implicit FTPS port, so none is the standard control channel port. Memorize them as a pair: "control 21, active data 20".

---

**Question 5.** Which statement about SFTP is correct?

A) It is FTP with SSL/TLS applied and uses port 990

B) It is SSH-protocol-based file transfer that uses port 22 and operates over a single channel

C) It is an encrypted form of FTP active mode and uses port 20

D) It is another name for FTPS, which uses two channels, control and data

**Answer: B**

Explanation: SFTP (SSH File Transfer Protocol) is file transfer running on top of SSH and uses a single channel on port 22. A describes FTPS, C is wrong because SFTP has nothing to do with FTP active mode, and D is the classic trap of treating SFTP and FTPS as the same thing. "SFTP = SSH-based, port 22" is the key.

---

**Question 6.** What is the role of the `/etc/vsftpd/ftpusers` file in vsftpd?

A) It specifies the upload directory for anonymous users

B) Users registered here are forbidden from FTP login, and system accounts such as root are included by default

C) It defines the data port range to open in passive mode

D) It sets a per-user transfer bandwidth limit

**Answer: B**

Explanation: `ftpusers` is the list of users forbidden from FTP login, and system accounts including root are registered by default for security. A is the job of settings such as anon_root, C is pasv_min/max_port, and D is a separate bandwidth directive, so none relate to ftpusers. Remember "ftpusers = deny list".

---

**Question 7.** Which correctly states the difference between FTPS and SFTP?

A) FTPS is SSH-based, and SFTP is FTP wrapped in TLS

B) FTPS is FTP with SSL/TLS applied, and SFTP is SSH-based and uses port 22

C) Both are the same protocol and differ only in port

D) FTPS uses port 22 and SFTP uses port 990

**Answer: B**

Explanation: FTPS is existing FTP plus SSL/TLS encryption (still two channels), while SFTP is a separate file transfer running on SSH that uses port 22. A describes the two in exactly the opposite way, C ignores that they are different protocols, and D has the ports swapped. "FTPS = FTP+TLS, SFTP = SSH" is the key.

---
