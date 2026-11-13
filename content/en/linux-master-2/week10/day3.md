# Day 3 - Remote Access and File Transfer

## 📌 Key Takeaways

- **TELNET (23) is plain text**, so it is dangerous, while **SSH (22) encrypts**. Today only SSH is used.
- **TELNET and SSH are for remote access**, **not file transfer.** This distinction shows up on the exam.
- **FTP uses two ports** — **21 is control, 20 is data**.
- FTP has an **active mode and a passive mode**.
- File transfer over SSH is done with **`scp`** and **`sftp`**.

## Remote Access

| Service | Port | Encryption |
|-------|-----|-------|
| **TELNET** | **23** | **None — plain text** |
| **SSH** | **22** | **Yes** |
| rlogin / rsh | 513 / 514 | None (the old r-family) |

### TELNET

- It is the **oldest way** to connect to a remote computer and run commands.
- **Even the ID and password travel in plain text.** Anyone eavesdropping can read them as-is.
- It is rarely used now, but it is still used **to check ports** — `telnet server 80`.

```text
$ telnet 192.168.0.10 80
Trying 192.168.0.10...
Connected to 192.168.0.10.
Escape character is '^]'.
```

- **If `Connected` appears, that port is open.** If it is closed, you get `Connection refused`. TELNET simply opens a TCP connection to the other side's port and exchanges characters as they are, which is why it works for this kind of check.
- To get out, press **`Ctrl+]`** as the message says, then type `quit`.

### SSH

```bash
ssh user@192.168.0.10          # connect
ssh -p 2222 user@server        # specify a port
ssh -X user@server             # remote GUI (X11 forwarding)
```

| Feature | Description |
|------|------|
| **Encryption** | Login information, commands, and results are **all encrypted** |
| **Public-key authentication** | You can authenticate with a **key pair** instead of a password |
| **Tunneling** | Other traffic can be passed through SSH |
| Implementation | **OpenSSH** (daemon `sshd`) |

```bash
ssh-keygen                     # generate a key pair (~/.ssh/id_rsa, id_rsa.pub)
ssh-copy-id user@server        # register the public key on the server
```

- **You keep the private key, and the public key goes on the server.** The public key is registered in the server's `~/.ssh/authorized_keys`.
- **Never give your private key to anyone.** Its permissions must also be `600`.

### The Question on First Connection

```text
$ ssh alice@192.168.0.10
The authenticity of host '192.168.0.10 (192.168.0.10)' can't be established.
ED25519 key fingerprint is SHA256:(fingerprint string of the server key).
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
Warning: Permanently added '192.168.0.10' (ED25519) to the list of known hosts.
alice@192.168.0.10's password:
```

- This is not an error. It is a check that asks **"I have never seen this server before; do you trust it?"** If you answer `yes`, that server's key is recorded in **`~/.ssh/known_hosts`** on your computer, and you are not asked again.
- If the server key at the same address is different later, SSH prints a warning and blocks the connection. This protects against someone impersonating the server. The same warning appears when a server has been reinstalled.
- If you omit `user@`, SSH tries to connect with **the name you are currently logged in as**. You can also give the name with `-l`, as in `ssh -l alice 192.168.0.10`.

### SSH Files — Which Computer Are They On

| File | Location | What it holds |
|------|--------|--------|
| `~/.ssh/id_rsa` | **Connecting side** | Your **private key** — never leaves your machine |
| `~/.ssh/id_rsa.pub` | Connecting side | Your **public key** — what you hand to the server |
| **`~/.ssh/authorized_keys`** | **Receiving side (server)** | A **list of public keys** allowed to log in to this account |
| **`~/.ssh/known_hosts`** | Connecting side | The **keys of the servers** you have connected to |
| **`/etc/ssh/sshd_config`** | Server | Configuration of the **SSH server (daemon)** |
| `/etc/ssh/ssh_config` | Connecting side | Configuration of the SSH **client** |

- **`authorized_keys` is "users allowed in," and `known_hosts` is "servers I know."** Questions swap these two files, which point in opposite directions.
- **`sshd_config` and `ssh_config` differ by a single letter, `d`.** The `d` stands for daemon, so `sshd_config` is the server side. Settings such as changing the connection port from 22 to another number or blocking direct root login live there.
- The key file name **depends on the type of key you made**. For RSA it is `id_rsa`, and for ED25519 it is `id_ed25519`. Which type is made by default depends on the OpenSSH version. The rule that the file with `.pub` is the public key stays the same.
- In public-key authentication, **the private key never goes over the network.** The server only uses the registered public key to check that "this person holds the matching private key." This is why it is safer than sending a password.

> **TELNET and SSH are "remote access," not "file transfer."** This is why **TELNET** is the answer to "Which is least related to a service for exchanging files?"

## File Transfer — FTP

| Port | Purpose |
|-----|------|
| **21** | **Control** — commands are exchanged |
| **20** | **Data** — the actual files travel |

- **Using two ports** is the hallmark of FTP and an exam point.

### Active Mode and Passive Mode

```text
   Active                             Passive

   Client ──21──► Server              Client ──21──► Server
   Client ◄─20─── Server              Client ────► Server
              (server opens the                 (client opens the
               connection)                       connection)
```

| Aspect | **Active mode** | **Passive mode** |
|------|-------------|-------------|
| Data connection | **Server to client** | **Client to server** |
| Server port | **Port 20** | A random high port |
| Firewall | **Easily blocked** by the client's firewall | **Passes through well** |

- Most clients today sit behind firewalls, so **passive mode is the default**.
- **In both modes, the control connection (port 21) is opened by the client to the server.** The only difference is **who opens the data connection**.
- The names are given from the **server's point of view**. If the server connects first, it is active; if the server opens a port and **waits**, it is passive.
- **Port 20 is used only in active mode.** In passive mode, the data connection is made on a random high port number that the server announces. If asked "What is the FTP data port?" with no conditions, answer **20**.
- Active mode gets blocked because it is a **connection coming from outside to inside**. Firewalls and routers let connections going out from inside pass, but by default they block connections that someone outside tries to open first.

### Anonymous FTP

- A public FTP where you connect without an account. The **ID is `anonymous`**, and by convention you enter your **email address** as the password.
- It was used to distribute public material. The exam asks for the **name `anonymous`** itself.

### FTP Commands

| Command | What it does |
|------|--------|
| **`get`** | **Download one** file |
| **`put`** | **Upload one** file |
| **`mget` / `mput`** | Download / upload **several** files |
| `ls`, `cd`, `pwd` | Navigate the remote side |
| `lcd` | Change the **local** directory |
| **`bin` / `ascii`** | **Binary** / text transfer mode |
| `bye`, `quit` | Exit |

> **Images and compressed files must be transferred in `bin` (binary) mode.** If you transfer them in ascii mode, line endings get converted and the file is corrupted.

- Representative FTP server programs are **vsftpd** and **ProFTPD**.

```text
$ ftp 192.168.0.10
Connected to 192.168.0.10.
220 (vsFTPd 3.0.3)
Name (192.168.0.10:alice): anonymous
331 Please specify the password.
Password:
230 Login successful.
ftp> bin
200 Switching to Binary mode.
ftp> get backup.tar.gz
   …  (transfer progress output omitted)
226 Transfer complete.
ftp> bye
221 Goodbye.
```

- **While the `ftp>` prompt is showing, you are inside the FTP program, not the shell.** The `ls` and `cd` you type here act on the **server-side** directory. To change directories on your own computer, use `lcd`.
- The three-digit numbers the server returns are response codes. **A code starting with 2 means success** (230 login successful, 226 transfer complete), and **a code starting with 5 means failure** (530 login failed).
- **The direction is from your computer's point of view.** `get` is server to you (download), and `put` is you to server (upload).

| Command | What it does |
|------|--------|
| `prompt` | Turns on or off the per-file confirmation during `mget` and `mput` |
| `hash` | Shows transfer progress with `#` |
| `passive` | Turns passive mode on or off |
| `delete` / `mkdir` | Delete a file on the server / create a directory |
| `!command` | Run a **shell command on your own computer** without leaving FTP |

- To download **several files** such as `mget *.txt`, use the **commands that start with `m`**. `get *.txt` does not work as intended.
- ascii mode corrupts files because **line-ending characters differ between operating systems**, so it edits the content to match them. That helps with text, but in images and compressed files those bytes are data, not line endings.
- **TFTP** is a different protocol that only resembles FTP in name. It is a simple file transfer with no login procedure that uses **UDP port 69**, and it is used to download the initial boot files of devices. FTP uses TCP.

## Secure File Transfer

| Method | Based on | Feature |
|------|------|------|
| **`scp`** | **SSH** | Copy with a single command line |
| **`sftp`** | **SSH** | Used interactively, like FTP |
| FTPS | FTP + SSL | FTP with encryption added |
| `rsync` | SSH, etc. | Transfers **only the changed parts** — good for backups |

```bash
scp file.txt user@server:/home/user/       # send
scp user@server:/home/user/file.txt .      # receive
scp -r folder user@server:/home/user/      # a whole directory
sftp user@server                           # interactive
```

> **`sftp` and `FTPS` are different.** **sftp is based on SSH**, and **FTPS is FTP wrapped in SSL**. Their names are similar, so questions swap them.

- `scp` has **the same order as `cp`** — `scp source destination`. The remote side is written as **`user@host:path`**, and **the colon (`:`) marks it as remote**.
- If you leave out the colon, nothing goes to the remote machine. `scp file.txt alice@server` just **copies the file into a new file named** `alice@server` in the current directory and finishes.
- **The case of the port option differs.** `ssh` uses lowercase **`-p 2222`**, while `scp` and `sftp` use uppercase **`-P 2222`**. The lowercase `-p` of `scp` is a different option that preserves modification times and permissions.
- `scp` and `sftp` do everything over **the single SSH port 22**. Unlike FTP, which uses two ports, opening only port 22 on the firewall allows both connecting and file transfer.
- `rsync` is used in the form `rsync -av source destination`. `-a` preserves permissions, times, and so on as they are, `-v` shows progress, and `-z` compresses during transfer. From the second run on it sends **only what changed**, so it is fast.

| Old tool (plain text) | Replacement (SSH-based) |
|-------------|-------------------|
| `telnet` · `rlogin` | **`ssh`** |
| `rsh` (run a single command remotely) | `ssh host command` |
| `rcp` | **`scp`** |
| `ftp` | **`sftp`** |

- The r-family commands (`rlogin`, `rsh`, `rcp`) let people in without a password based only on a **"trusted hosts" list**, so they were weak on security. SSH replaced all three.

## Sorting It Out in One Table

| Service | Port | Encryption | What it does |
|-------|-----|-------|--------|
| **TELNET** | 23 | None | **Remote access** |
| **SSH** | 22 | Yes | **Remote access** (+ the basis of file transfer) |
| **FTP** | 21 control / 20 data | None | **File transfer** |
| TFTP | 69 (UDP) | None | Simple file transfer, no authentication |
| **SFTP · SCP** | 22 | Yes | File transfer |
| rlogin / rsh | 513 / 514 | None | Remote access / remote command |

- There are two axes for sorting — **what it does (access / transfer)** and **whether it encrypts (plain text / encrypted)**. Check which axis the question uses to ask for "the odd one out."
- **TELNET and FTP are both plain text** but do different jobs, and **TELNET and SSH do the same job** but differ in whether they encrypt.

| Symptom | Cause | Fix |
|------|------|------|
| `Connection refused` | No daemon is waiting on that port | Check that `sshd` is running on the server and the port number is right |
| Hangs for a long time, then `Connection timed out` | Blocked along the way or the address is wrong | Check the path with the firewall and `ping` |
| `Permission denied (publickey)` | My public key is not in the server's `authorized_keys` | Register it with `ssh-copy-id` |
| The key is ignored even though a private key exists | The private key file's permissions are too open | `chmod 600 ~/.ssh/id_rsa` |
| `REMOTE HOST IDENTIFICATION HAS CHANGED` | It differs from the server key recorded in `known_hosts` | Confirm the server was really replaced, then delete the old line |
| FTP login works but it hangs at `ls` | The active-mode data connection is blocked by a firewall | Switch to passive mode with `passive` |

## Graphical Remote Access

| Method | Description |
|------|------|
| **VNC** | Transmits the screen itself. Platform independent |
| **XRDP** | Connects using Windows Remote Desktop (RDP) |
| **`ssh -X`** | X11 forwarding — brings up **individual windows** |

> Tomorrow we cover NFS and Samba, where multiple computers share files.

## 📖 Glossary

- **TELNET** : An old protocol for remote access without encryption. Its port is 23.
- **SSH** : A remote access protocol that encrypts communication. Its port is 22, and the implementation is OpenSSH.
- **Public-key authentication** : A method that authenticates with a private/public key pair instead of a password.
- **FTP** : File Transfer Protocol. It uses port 21 for control and port 20 for data.
- **Active / passive mode** : The data connection is opened by the server / opened by the client.
- **Anonymous FTP** : A public FTP accessed with the `anonymous` account.
- **`scp` / `sftp`** : Tools that copy or transfer files over SSH.
- **`rsync`** : A tool that synchronizes efficiently by transferring only the changed parts.

## 📝 Practice Questions

**Question 1.** Which of the following is a characteristic of SSH compared with TELNET?

A) It does not use a separate port  
B) It can only transfer files and cannot run commands  
C) It encrypts authentication information and communication content  
D) It can only be used in a graphical environment  

**Answer: C**  
Explanation: TELNET exchanges all communication, including the ID and password, in plain text, so it is vulnerable to eavesdropping. SSH encrypts the entire communication and also supports public-key authentication and tunneling, so it is the standard for remote access today.

---

**Question 2.** Which of the following is a command that copies files to and from a remote system over SSH?

A) scp  
B) telnet  
C) ping  
D) nslookup  

**Answer: A**  
Explanation: `scp` is a file copy command that works on top of the SSH protocol, and the transferred content is encrypted. For interactive use, you can use `sftp`, which is also SSH-based. `telnet` is for remote access, and `ping` and `nslookup` are diagnostic commands.

---

**Question 3.** Which of the following is the port number FTP uses for the control connection that exchanges commands?

A) 20  
B) 22  
C) 23  
D) 21  

**Answer: D**  
Explanation: FTP uses two ports: 21 is the control connection that exchanges commands, and 20 is the data connection over which the actual files travel. Port 22 is for SSH and port 23 is for TELNET.

---

**Question 4.** Which of the following is the account name used to connect to anonymous FTP?

A) guest  
B) anonymous  
C) public  
D) ftpuser  

**Answer: B**  
Explanation: Anonymous FTP is accessed with the account `anonymous`, and by convention you enter your own email address as the password. It is a way of offering public material for download without a separate account.

---

**Question 5.** Which of the following is the **least** related to a service for exchanging files?

A) TELNET  
B) FTP  
C) SFTP  
D) SCP  

**Answer: A**  
Explanation: TELNET is a service for connecting to a remote system and running commands, and it provides no file transfer function. FTP is the representative file transfer protocol, and SFTP and SCP are SSH-based tools for exchanging files securely.
