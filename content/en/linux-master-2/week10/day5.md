# Day 5 - Week 10 Review: Internet Services on One Page

## 📌 Key Takeaways

- **Sending is SMTP (25), receiving is POP3 (110) / IMAP (143)**. **Server-to-server relay is also SMTP**.
- **POP3 downloads and deletes; IMAP leaves mail on the server.**
- DNS records — **A (IPv4) · AAAA (IPv6) · MX (mail) · CNAME (alias) · NS · PTR (reverse)**.
- **TELNET and SSH are remote access**, while **FTP, NFS, and Samba are file sharing**. Questions mix them and ask you to pick.
- **NFS is between Unix systems (RPC), Samba is with Windows (SMB, CIFS, NetBIOS)**.

## Services on One Page

```text
   Web     HTTP 80 · HTTPS 443       Servers: Apache · Nginx
                                     Browsers: Firefox · Chrome · Lynx (text)

   Mail    SMTP 25   sending + server-to-server relay
           POP3 110  download (deleted from server)
           IMAP 143  keep on server and view (multiple devices)
           Components  MUA (user) → MTA (transfer) → MDA (delivery)
                 MTA examples: Sendmail · Postfix
           MIME  specification for carrying Korean text and attachments

   DNS     53   name ↔ IP
           Hierarchy  root (.) → TLD (com·kr) → second level → host
           Records A (IPv4) AAAA (IPv6) MX (mail) CNAME (alias) NS PTR (reverse) SOA
           Server  BIND (named)   Lookup: nslookup · dig · host
           Files  resolv.conf (where to ask) · hosts (the answer)

   Remote  TELNET 23  plain text — dangerous
           SSH    22  encrypted · public key · tunneling (OpenSSH)

   Transfer FTP   21 control / 20 data   active vs passive
                  anonymous account anonymous · bin/ascii mode
           scp · sftp   SSH-based        rsync changed parts only

   Sharing NFS    between Unix systems · RPC · /etc/exports
           Samba  with Windows · SMB/CIFS/NetBIOS · smb.conf · smbd/nmbd

   Other   DHCP automatic IP · NTP time · SNMP management · LDAP accounts
   Legacy  Gopher (menu search) · Usenet (newsgroups, NNTP) · Archie (FTP search) · IRC (chat)
```

## Grouping by Nature

| Group | Services |
|------|-------|
| **File sharing/transfer** | FTP · **NFS · Samba** · SCP · SFTP · rsync |
| **Remote access** | **TELNET · SSH** · rlogin |
| **Information retrieval** | **WWW · Gopher** · Archie · WAIS |
| **Messages/bulletin boards** | Mail · **Usenet** · IRC |
| **Names/addresses** | **DNS** · DHCP |

> Questions that **mix services and ask you to pick the one with a different nature** are the main form this week. Learn the table above as a whole.

### Practice: Picking "the Odd One Out"

The same word gives a different answer depending on **which other four it appears with**. First find **what the three have in common**, then pick the one that falls outside it.

| Four choices | Odd one out | What the three share |
|--------|---------|-----------|
| SMB · CIFS · NetBIOS · RPC | **RPC** | Components of Samba (RPC belongs to NFS) |
| FTP · NFS · Samba · TELNET | **TELNET** | File sharing/transfer |
| TELNET · SSH · rlogin · FTP | **FTP** | Remote access |
| SMTP · POP3 · IMAP · NNTP | **NNTP** | Mail protocols (NNTP is for newsgroups) |
| Sendmail · Postfix · qmail · Thunderbird | **Thunderbird** | MTAs (Thunderbird is an MUA) |
| Lynx · Firefox · Chrome · Apache | **Apache** | Web browsers (Apache is a web server) |
| A · MX · CNAME · SMTP | **SMTP** | DNS records |
| nslookup · dig · host · showmount | **showmount** | DNS lookup commands |
| scp · sftp · rsync · ssh-keygen | **ssh-keygen** | File transfer tools |
| Gopher · Archie · WAIS · IRC | **IRC** | Information retrieval (IRC is chat) |
| HTTPS · SSH · SFTP · TELNET | **TELNET** | They encrypt |

- **TELNET appeared three times in this table.** In the second row it is "because it is not file transfer," in the third row it is actually **on the grouped side**, and in the last row it is "because it does not encrypt." Do not decide the answer from the word alone; find the **grouping criterion** first.
- The criterion is usually one of four — **what it does** (access/transfer/search), **counterpart** (Unix/Windows), **security** (plain text/encrypted), or **kind** (protocol/program/record).

### Encrypted Pairs

| Plain text | Encrypted counterpart | Port change |
|------|-----------|---------|
| **HTTP** | **HTTPS** | 80 → 443 |
| **TELNET** | **SSH** | 23 → 22 |
| **FTP** | **SFTP** (SSH-based) · FTPS (SSL-based) | 21 → 22 (SFTP) |
| `rcp` | `scp` | → 22 |
| SMTP | SMTPS | 25 → 465 |
| POP3 | POP3S | 110 → 995 |
| IMAP | IMAPS | 143 → 993 |

- **SSH alone is the alternative to TELNET, FTP, and rcp.** `ssh`, `sftp`, and `scp` all use port 22.
- Look at **where the S is attached in the name**. When it comes **after**, as in HTTP**S**, POP3**S**, IMAP**S**, and FTP**S**, it is the original protocol wrapped in SSL/TLS, and when it comes **before**, as in **S**FTP, it is a separate protocol that runs on top of SSH.

## Who Asks and Who Answers — Client and Server

Every service this week is split into **the side that requests (client) and the side that waits (server)**. Sorting which side a program name or file belongs to makes the choices easier to organize.

| Service | Server side (daemon · product) | Client side (command · program) |
|-------|-------------------|--------------------------|
| Web | `httpd` — Apache, Nginx | Firefox, Lynx, `wget`, `curl` |
| Mail | Sendmail, Postfix, Dovecot | Thunderbird, Evolution, `mail` |
| DNS | `named` — BIND | `nslookup`, `dig`, `host` |
| Remote access | `sshd` — OpenSSH | `ssh` |
| File transfer | vsftpd, ProFTPD | `ftp`, `sftp`, `scp` |
| NFS | `nfsd`, `rpcbind` | `mount -t nfs`, `showmount` |
| Samba | `smbd`, `nmbd` | `smbclient`, `mount -t cifs` |

- **Names ending in `d` are daemons**, that is, the server side — `httpd`, `named`, `sshd`, `nfsd`, `smbd`. The `d` is the initial of daemon.
- Take extra care with **cases where the product name and daemon name differ** — Apache is `httpd`, BIND is `named`, and Samba is `smbd` and `nmbd`.

| File | Which side it belongs to | What goes in it |
|------|-------------|-----------|
| `/etc/resolv.conf` | **Client** | The DNS server to ask |
| `/etc/hosts` | Client | Name ↔ IP |
| `~/.ssh/known_hosts` | Client | Keys of servers connected to |
| `~/.ssh/authorized_keys` | **Server** | Public keys allowed to log in |
| `/etc/ssh/sshd_config` | Server | SSH server settings |
| `/etc/exports` | Server | Directories to export over NFS |
| `/etc/samba/smb.conf` | Server | Samba share settings |

### TCP or UDP

| Transport layer | Services |
|---------|-------|
| **TCP** | HTTP · HTTPS · SMTP · POP3 · IMAP · SSH · TELNET · FTP · NNTP |
| **UDP** | DHCP · NTP · SNMP · TFTP |
| Both | **DNS** — usually UDP, TCP when the response is large or for zone transfers |

- Logging in, receiving files, and exchanging mail **must not lose anything, so they use TCP**. Most of this week's services fall here.
- **The UDP side is "short question, short answer."** Getting an address (DHCP), setting the time (NTP), and asking about device status (SNMP).

## Port Number Summary

| Port | Service |
|-----|-------|
| **20 / 21** | FTP data / **control** |
| **22** | SSH |
| **23** | TELNET |
| **25** | SMTP |
| **53** | DNS |
| **80** | HTTP |
| **110** | POP3 |
| **143** | IMAP |
| **443** | HTTPS |
| 123 | NTP |
| 161 | SNMP |
| 631 | CUPS |

## Contrasting Confusing Pairs

| Pair | A | B | Deciding criterion |
|------|---|---|-----------|
| SMTP vs POP3 | **Sending** | Receiving | Direction |
| POP3 vs IMAP | **Download and delete** | **Keep on server** | Multi-device sync |
| MUA vs MTA | User program | **Server-to-server transfer** | The middle letter |
| A vs MX | IPv4 address | **Mail server** | What it points to |
| A vs AAAA | **IPv4** | IPv6 | Address length |
| Forward vs reverse | Name → IP (A) | IP → name (**PTR**) | Direction |
| TELNET vs SSH | **Plain text** | Encrypted | Security |
| TELNET vs FTP | **Remote access** | **File transfer** | Purpose |
| FTP 20 vs 21 | Data | **Control** | What flows |
| Active vs passive | Server connects | **Client connects** | Firewall traversal |
| sftp vs FTPS | **SSH-based** | FTP + SSL | Underlying protocol |
| NFS vs Samba | **Between Unix systems, RPC** | **With Windows, SMB** | Counterpart OS |
| DNS vs DHCP | **Name resolution** | **Automatic IP assignment** | What it does |
| `hosts` vs `resolv.conf` | Holds the answers | **Server to ask** | Role |

## Commonly Missed Points

1. **"Servers exchange mail with POP3"** → It is **SMTP**. POP3 is used only when a user fetches mail.
2. **"IMAP downloads and deletes mail"** → That is **POP3**. IMAP keeps it on the server.
3. **"MX holds a mail address"** → It does not hold an address; it points to the **mail server**.
4. **"AAAA is IPv4"** → It is **IPv6**. A is IPv4.
5. **"FTP uses only one port"** → It uses **two: 21 (control) and 20 (data)**.
6. **"You can transfer files with TELNET"** → You cannot. It is **for remote access only**.
7. **"RPC is included in Samba's components"** → **RPC belongs to NFS**.
8. **"Share with Windows using NFS"** → For Windows, use **Samba**.
9. **"sftp and FTPS are the same"** → **sftp is SSH, FTPS is FTP+SSL**, so their foundations differ.
10. **"Gopher is a chat service"** → It is **menu-based information retrieval**. Chat is IRC.

## Choosing a Service from a Situation

| In this situation | Choose | Do not choose, and why |
|------------|-------|-------------------|
| A Windows PC and a Linux server share a folder | **Samba** | NFS — between Unix/Linux systems |
| Two Linux servers share `/data` | **NFS** | Samba — when sharing with Windows |
| Log in to a remote server and type commands | **SSH** | TELNET — plain text, so dangerous |
| Safely copy one file to a remote server | **`scp`** | FTP — does not encrypt |
| Back up a large directory daily, sending only what changed | **`rsync`** | `scp` — sends everything every time |
| View the same mailbox from a phone and a PC | **IMAP** | POP3 — downloads and deletes from the server |
| Office PCs get their IPs automatically | **DHCP** | DNS — only turns names into addresses |
| Set all servers' clocks to the same time | **NTP** | NNTP — the newsgroup protocol |
| View web documents without a graphical environment | **Lynx** | Firefox — a graphical browser |
| Check where a domain's mail server is | **`dig domain MX`** | A record — only gives an IP address |

- If the sentence has **"Windows," think Samba; "encrypted / securely," think the SSH family; "multiple devices," think IMAP.** A single clue word decides the answer.

## Values That Appear on the Exam As-Is

| Value | What it is |
|-----|------|
| **25 / 110 / 143** | SMTP / POP3 / IMAP |
| **20, 21** | FTP data, control |
| **anonymous** | Anonymous FTP account name |
| **`/etc/exports`** | NFS share config file |
| **`/etc/samba/smb.conf`** | Samba config file |
| **`smbd` / `nmbd`** | The two Samba daemons |
| **NNTP** | Usenet newsgroup protocol |

> Next week is the last one. We cover application areas (cloud, big data, embedded) and the overall wrap-up.

## 📖 Glossary

- **SMTP / POP3 / IMAP** : Protocols for sending mail / downloading mail / keeping mail on the server and viewing it.
- **MX record** : A DNS record that specifies the server that receives mail for a domain.
- **SSH** : A remote access protocol that encrypts communication.
- **FTP active/passive mode** : The data connection is opened by the server / opened by the client.
- **NFS** : A file sharing system between Unix/Linux systems.
- **Samba** : Software that shares files with Windows over SMB/CIFS.

## 📝 Practice Questions

**Question 1.** Which of the following is a protocol whose default behavior is to download mail from the server and then delete the original on the server?

A) POP3  
B) IMAP  
C) SMTP  
D) NNTP  

**Answer: A**  
Explanation: POP3's default behavior is to download mail to the user's computer and delete it from the server, which makes it hard to view the same mailbox from several devices. IMAP leaves mail on the server so that the same state can be kept across multiple devices.

---

**Question 2.** Which of the following is a service that differs in nature from the other three?

A) FTP  
B) NFS  
C) TELNET  
D) Samba  

**Answer: C**  
Explanation: FTP, NFS, and Samba are all services that transfer or share files. TELNET, on the other hand, is a remote access service that connects to a remote system and runs commands, so its nature differs from file sharing.

---

**Question 3.** Which of the following is the config file that specifies the directories to share on an NFS server?

A) /etc/samba/smb.conf  
B) /etc/exports  
C) /etc/resolv.conf  
D) /etc/hosts  

**Answer: B**  
Explanation: An NFS server specifies the directories to export and the targets allowed access in `/etc/exports`. `/etc/samba/smb.conf` is Samba's config file, `/etc/resolv.conf` holds DNS server addresses, and `/etc/hosts` holds the mapping between names and IPs.

---

**Question 4.** Which of the following is the DNS record used to specify an alias for a domain name?

A) A  
B) MX  
C) PTR  
D) CNAME  

**Answer: D**  
Explanation: CNAME stands for Canonical Name and is used to link a name as an alias of another name. A is an IPv4 address, MX is a mail server, and PTR is used for reverse lookup, finding a name from an IP.

---

**Question 5.** Which of the following is the mode that must be specified to transfer images or compressed files in FTP without corruption?

A) ascii  
B) bin  
C) passive  
D) active  

**Answer: B**  
Explanation: `bin` is binary mode, which transfers a file exactly as it is. `ascii` mode is for text and converts line-ending characters, so using it for images or compressed files corrupts their contents. Active and passive are a distinction about who opens the data connection.

---

**Question 6.** Which of the following is DNS server software widely used on Linux?

A) Postfix  
B) Samba  
C) BIND  
D) Apache  

**Answer: C**  
Explanation: BIND stands for Berkeley Internet Name Domain and is the most widely used DNS server software; its daemon name is `named`. Postfix is a mail transfer server, Samba is for file sharing, and Apache is a web server.
