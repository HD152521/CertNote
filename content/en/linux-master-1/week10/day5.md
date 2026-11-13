# Day 5 - Week 10 Comprehensive Review: Tying Network Services Together on One Port Sheet

## 📌 Key Takeaways

- Every network service reduces to **"on which port, which role's daemon, communicating in which direction."**
- This week's four structures — **mail is an asymmetry of sending/receiving**, **FTP has two channels, control and data**, **SSH is a single multipurpose tunnel on port 22**, **VNC/X is a reversal of who holds the screen**.
- Ports to answer instantly: **SMTP 25 · POP3 110 · IMAP 143 · FTP 21 (control) · 20 (active) · SSH/SFTP 22 · Telnet 23 · VNC 5900+N**.
- Easily swapped pairs: **POP3 (110/995) ↔ IMAP (143/993)**, **SMTPS (465) ↔ submission (587)**, **FTP 21 ↔ 20**, **SSH 22 ↔ Telnet 23**.
- Troubleshooting narrows down in five steps — **check LISTEN → daemon status → port reachability → firewall → logs**.

## Services and Ports Roundup — Memorize on One Table

| Service | Port | Encrypted port | Role |
|--------|------|-------------|------|
| SMTP | 25 | 465·587 | Sending mail |
| POP3 | 110 | 995 | Receiving mail (download and delete) |
| IMAP | 143 | 993 | Receiving mail (kept on server, synced) |
| FTP | 21 (control) · 20 (active data) | 990 (FTPS) | File transfer |
| SSH/SFTP | 22 | (self-encrypting) | Remote access and file transfer |
| Telnet | 23 | None (plaintext) | Remote access (legacy) |
| VNC | 5900+N | (SSH tunnel recommended) | Remote desktop |

A port number is an agreement about "which service this door is dedicated to." 25 is mail sending, 110 and 143 are mail receiving, 21 is FTP commands, 22 is SSH's multipurpose channel, 23 is plaintext Telnet. The encrypted ports (465, 587, 993, 995, 990) are variants of the plaintext ports with security added. You must be able to answer this mapping instantly to get through the practical exam.

> ⚠️ **Trap Review**: Easily swapped pairs — POP3 (110/995) and IMAP (143/993), SMTPS (465) and submission (587), FTP control (21) and active data (20), SSH (22) and Telnet (23). A choice that shifts these boundaries is wrong.

## Mail Service Review — The Asymmetry of Sending and Receiving

| Component | Role | Typical |
|----------|------|------|
| MUA | Client for writing and reading | Thunderbird, mutt |
| MTA | Server-to-server transfer | Postfix, Sendmail |
| MDA | Final delivery to the mailbox | Procmail, Dovecot |

**Key distinction**: MTA (server-to-server transfer) ≠ MDA (mailbox delivery) ≠ MUA (user client). Sending is one-way SMTP, and receiving is POP3/IMAP. Postfix's config is `/etc/postfix/main.cf`, and opening mynetworks too wide creates an open relay. POP3 = download then delete, IMAP = keep on server and sync is the key distinction.

## FTP Review — Two Channels and Active/Passive

```text
Active:  The client announces its port with PORT → the server (port 20) connects back to the client
Passive: The client requests PASV → the server opens a high port → the client connects
```

> ⚠️ **Trap Review**: In active mode the server connects back to the client (PORT, port 20), and in passive mode the client connects to the server (PASV, high port). A client behind NAT/a firewall needs passive mode. vsftpd's chroot_local_user locks users into their home, and ftpusers is the deny list. FTPS (FTP+TLS, 990) and SFTP (SSH-based, 22) are entirely different technologies.

## SSH Review — The Multipurpose Secure Channel on Port 22

```bash
# Key security settings (sshd_config)
PermitRootLogin no              # Block direct root login
PasswordAuthentication no       # Keys only (apply after registering keys)
MaxAuthTries 3                  # Brute-force defense

# Key authentication: public key in the server's authorized_keys, private key on the client
ssh-keygen -t ed25519
ssh-copy-id user@host

# Forwarding
ssh -L 8080:internal:3306 user@gw   # Local: my side → beyond the remote
ssh -R 9090:localhost:80 user@gw    # Remote: remote side → my side
ssh -D 1080 user@gw                 # Dynamic: SOCKS proxy
```

**Key distinction**: Server config sshd_config (with the d) vs client config ssh_config. The public key (.pub) goes on the server, the private key on the client. ~/.ssh is 700, key files are 600. scp's port is uppercase -P, ssh's port is lowercase -p. You must distinguish the direction differences among forwarding -L (local), -R (remote), and -D (dynamic).

## VNC and X Window Review — The Reversal of the Side Holding the Screen

VNC port = 5900 + display number (:1→5901). In X Window, the machine in front of the user that holds the screen and input devices is the **X server**, and the application that requests drawing is the **X client** (reversal). DISPLAY is the address of the screen to send the picture to, xhost controls per host and xauth per cookie, and `xhost +` (no argument) allows everything and is dangerous. A safe remote GUI is `ssh -X`.

## Diagnostic Flow — The Order for Tracking Down Service Outages

```bash
ss -tlnp | grep :port      # 1. Is the service LISTENing on that port?
systemctl status service    # 2. Is the daemon alive?
telnet host port            # 3. Can the port be reached from outside? (firewall)
firewall-cmd --list-all     # 4. Has the firewall opened the port?
journalctl -u service       # 5. What errors are in the logs?
```

For server service outages, going through these five steps in order usually narrows down the cause — "is the daemon up, is it listening on the port, is the firewall blocking it, is the config correct, what do the logs say." If mail isn't going out, check mailq; if FTP is stuck, check active/passive and the firewall; if SSH is refused, check key permissions and PermitRootLogin; if the GUI doesn't come up, check DISPLAY and xhost. This week goes beyond the exam and is the foundation of real server operations.

## 📖 Glossary

- **Port** : An agreed-upon number that says "which service this door is dedicated to." It is the coordinate that identifies a service.
- **MTA / MDA / MUA** : Server-to-server transfer / final delivery to the mailbox / the client the user writes and reads with.
- **Open relay** : A state where `mynetworks` has been opened too wide, letting anyone relay mail. Abused for spam.
- **POP3 vs IMAP** : Download-and-delete-from-server / keep-on-server-and-sync (for multiple devices).
- **FTP control/data channels** : The port 21 connection over which commands travel / the separate connection over which files travel.
- **Active (PORT) vs Passive (PASV)** : The server connects back from port 20 / the client connects to a high port on the server (favorable for NAT).
- **FTPS vs SFTP** : FTP wrapped in TLS (990, two channels) / SSH-based file transfer (22, single channel).
- **`sshd_config` vs `ssh_config`** : Server (daemon) config / client config. The one with the d is the server.
- **Public key authentication** : The public key in the server's `authorized_keys`, the private key on the client. `~/.ssh` 700, key files 600.
- **Port forwarding `-L`/`-R`/`-D`** : From my side beyond the remote / from the remote to my side / SOCKS proxy.
- **VNC port formula** : 5900 + display number. For `:1` it's 5901.
- **X server / X client** : The machine in front of the user holding the screen and input devices / the application that requests drawing (reversal).
- **`DISPLAY`** : The address of the screen to which an X client sends its picture.
- **xhost / xauth** : Coarse access control per host (IP) / per-user authentication with a magic cookie.

## 📝 Practice Questions

**Question 1.** Which of the following service and default port pairs is NOT correct?

A) SMTP — 25

B) IMAP — 143

C) SSH — 22

D) POP3 — 143

**Answer: D**

Explanation: POP3's default port is 110, and 143 is IMAP's port. A (SMTP 25), B (IMAP 143), and C (SSH 22) are all correct pairs. D, which swaps the ports of POP3 and IMAP, is the wrong pair, and the boundary "POP3 = 110, IMAP = 143" is a perennial trap.

---

**Question 2.** Which is the correct receiving protocol and port suited to keeping mail on the server and syncing across multiple devices?

A) POP3 — 110

B) IMAP — 143

C) SMTP — 25

D) IMAP — 110

**Answer: B**

Explanation: IMAP keeps and syncs mail on the server, suiting the viewing of the same mailbox from multiple devices, and its port is 143. A (POP3) deletes after download, so it suits a single device, C (SMTP) is a sending protocol, and D wrongly attaches the POP3 port (110) to IMAP. "Syncing across multiple devices = IMAP 143".

---

**Question 3.** Which statement about the data connection in FTP passive mode is correct?

A) The server opens the connection back to the client from port 20

B) The client opens the data connection to a high port on the server, which is favorable for passing through NAT/firewalls

C) Both control and data use only port 21

D) The client announces its own port with the PORT command

**Answer: B**

Explanation: In passive mode the server opens a high port and the client opens the data connection to it, so passing through NAT/firewalls is easy even from behind them. A and D describe active mode (the server connects back, the PORT command), and C ignores that the data channel is separate. "Passive = the client connects to the server, PASV".

---

**Question 4.** Which statement about FTPS and SFTP is correct?

A) SFTP is FTP with TLS applied and uses port 990

B) FTPS is SSH-based and uses port 22

C) SFTP is SSH-based file transfer using port 22, and FTPS is FTP with SSL/TLS applied

D) They are different names for the same protocol

**Answer: C**

Explanation: SFTP is file transfer running on SSH and uses port 22, while FTPS is existing FTP plus SSL/TLS. A wrongly describes SFTP as FTPS, B swaps FTPS with SFTP, and D denies that they are different technologies. "SFTP = SSH, 22; FTPS = FTP+TLS, 990" is the key.

---

**Question 5.** When configuring SSH public key authentication, which is the correct way the keys are placed on the server and client?

A) The private key in the server's authorized_keys, the public key on the client

B) The public key (.pub) in the server's authorized_keys, the private key on the client

C) Both the public key and the private key on the server

D) The private key copied to both the server and the client

**Answer: B**

Explanation: The public key (.pub) is registered in the server's `~/.ssh/authorized_keys`, and the client keeps the private key secret. As in A, C, and D, uploading the private key to the server is absolutely not allowed because leaking it is fatal. "Public key on the server, private key on the client" is the basic principle of key authentication.

---

**Question 6.** Which is the correct sshd_config directive that blocks direct login of root on an SSH server?

A) `PermitRootLogin no`

B) It is impossible with `DenyUsers root` alone

C) `PasswordAuthentication no`

D) `AllowRootLogin yes`

**Answer: A**

Explanation: `PermitRootLogin no` is the standard directive that blocks root's direct SSH login. C is a setting with a different purpose that turns off password authentication altogether, D is a nonexistent (or opposite-meaning) directive, and B is an assertion contrary to fact. Remember "block root = PermitRootLogin no".

---

**Question 7.** What is the default port when a VNC server is run on display `:1`?

A) 5900

B) 5901

C) 5911

D) 5910

**Answer: B**

Explanation: The VNC port is 5900 + display number, so `:1` is 5901. A (5900) corresponds to `:0`, and C (5911) and D (5910) don't fit the calculation rule. Just apply the formula "5900 + display number" exactly.

---

**Question 8.** In the X Window System, which component manages the monitor, keyboard, and mouse in front of the user?

A) X client

B) X server

C) Window manager

D) Application

**Answer: B**

Explanation: The X server is the component, on the machine in front of the user, that manages hardware such as the screen, keyboard, and mouse and receives drawing requests and actually draws. A (X client) and D (application) are the side requesting drawing, and C (window manager) is a kind of client that manages windows. The reversal concept "screen and input management = X server" is the key.

---

**Question 9.** In Postfix, which directive relates to the security problem where the trusted network is set too wide, so anyone can relay mail?

A) `inet_interfaces`

B) `mynetworks`

C) `home_mailbox`

D) `myhostname`

**Answer: B**

Explanation: `mynetworks` specifies the trusted networks allowed to relay, and if it is widened excessively it becomes an open relay and is abused for spam. A is the receiving interface, C is the mailbox format, and D is the hostname setting, so none relate to open relays. Connect "open relay = mynetworks opened too wide".

---

**Question 10.** Which correctly states the remote access protocol, and its port, that communicates in plaintext, is vulnerable for security, and was replaced by SSH?

A) SSH — 22

B) Telnet — 23

C) FTP — 21

D) Telnet — 22

**Answer: B**

Explanation: Telnet sends the ID and password in plaintext, making it vulnerable to eavesdropping, uses port 23, and was replaced by the encrypting SSH (22). A (SSH) is the replacement, C (FTP) is a file transfer protocol, and D wrongly attaches the SSH port (22) to Telnet. "Plaintext, port 23 = Telnet; encrypted, port 22 = SSH" is the key.

---

**Question 11.** Which port forwarding option safely links an internal-network service you can't reach directly to my local port via an SSH gateway?

A) `-R` (remote forwarding)

B) `-L` (local forwarding)

C) `-D` (dynamic forwarding)

D) `-P` (specify port)

**Answer: B**

Explanation: Local forwarding `-L local_port:target:target_port` links connections arriving at my local port to the internal service beyond the gateway through an encrypted tunnel. A (-R) is remote forwarding with the opposite direction, C (-D) is a SOCKS proxy, and D (-P) is scp's port option, not forwarding. "Linking to an internal service = local forwarding -L".

---

**Question 12.** Which of the following X access control commands is extremely risky for security and not recommended?

A) `xhost -` — turn off host-based permission and return to default authentication

B) `xhost +` — allow X server access from all hosts

C) `xauth list` — list the authentication cookies

D) `xhost +192.168.1.5` — allow only a specific host

**Answer: B**

Explanation: `xhost +` with no argument allows X access from all hosts, an extremely dangerous command that makes screen capture and keystroke theft possible. A is actually a restoring command that strengthens security, C is a simple listing, and D allows only a specific host, so it is relatively safe. Remember "xhost + (no argument) = allow all, dangerous".

---
