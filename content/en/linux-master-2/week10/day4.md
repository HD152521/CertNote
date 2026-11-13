# Day 4 - File Sharing and Old Internet Services

## 📌 Key Takeaways

- **NFS is for sharing between Unix/Linux systems**, and **Samba is for sharing between Linux and Windows**.
- **The components of Samba are SMB, CIFS, and NetBIOS.** **RPC belongs to NFS**, so including it here makes the answer wrong.
- NFS is configured in **`/etc/exports`**, and Samba in **`/etc/samba/smb.conf`**.
- Services from before the web — **Gopher (menu-based information retrieval), Usenet (newsgroups), Archie (FTP search)**.
- Questions repeatedly mix up the names and ask you to **pick the one that differs in nature**.

## NFS — Between Unix Systems

| Item | Content |
|------|------|
| Full name | **Network File System** |
| Developed by | **Sun Microsystems** |
| Counterpart | **Between Unix/Linux systems** |
| Based on | **RPC** (Remote Procedure Call) |
| Config file | **`/etc/exports`** |
| Related daemons | `nfsd`, `rpcbind` (formerly `portmap`) |

```text
   [Server]  exports /data
              │
              ▼
   [Client]  mounts it and uses it like its own directory
```

```bash
# Server: /etc/exports
/data  192.168.0.0/24(rw,sync)

exportfs -a               # apply the configuration
showmount -e server-address      # check the exported list

# Client
mount -t nfs server:/data /mnt
```

- **You mount a remote directory and use it like a local one.** Users do not feel that it is across a network.
- **Being RPC-based** is the key point that distinguishes it from Samba.

### Reading One Line of /etc/exports

```text
   /data    192.168.0.0/24(rw,sync)
   └─┬─┘    └─────┬──────┘└───┬───┘
     │            │           └── options (in parentheses, comma-separated)
     │            └────────────── who is allowed access (host or network range)
     └─────────────────────────── directory to export
```

| Option | Meaning |
|------|-----|
| **`ro`** / **`rw`** | **Read-only** / **read and write** |
| `sync` | Respond only after actually writing to disk — safe |
| **`root_squash`** | **Treats the client's root as an unprivileged user** (default) |
| `no_root_squash` | Accepts the client's root as root on the server too — dangerous |

- **Do not put a space between the target and the parentheses.** If you write `192.168.0.0/24 (rw)` with a space, the range and the options get separated and **write permission opens to an unintended scope.**
- `root_squash` is the default because otherwise **someone who is root on their own PC could do whatever they like with the server's shared files**.
- Editing the file alone does not apply the change. Run **`exportfs -a`** (export everything) or **`exportfs -r`** (re-read and apply). `exportfs -v` shows the list currently being exported.

```text
$ showmount -e 192.168.0.10
Export list for 192.168.0.10:
/data 192.168.0.0/24

# mount -t nfs 192.168.0.10:/data /mnt
$ df -h /mnt
Filesystem          Size  Used Avail Use% Mounted on
192.168.0.10:/data   50G   20G   30G  40% /mnt
```

- The mount source is written as **`server:directory`**. If the `Filesystem` column of `df` shows this form instead of a device like `/dev/sda1`, it is NFS.
- **`showmount -e` is used on the client to see "what that server offers,"** while `exportfs` is used on the server to manage "what I am offering."
- NFS exchanges ownership by **UID number, not by name**. A file owned by alice (uid 1001) on the server appears on the client as belonging to whoever has uid 1001. The "numbers are what is stored in files" idea from Week 4 applies here as well.
- As for ports, **NFS uses 2049**, and **`rpcbind`, which tells where RPC services are, uses 111**.

## Samba — With Windows

| Item | Content |
|------|------|
| Purpose | File and printer sharing **between Linux and Windows** |
| Protocol | **SMB**, and its extension **CIFS** |
| Name management | **NetBIOS** |
| Config file | **`/etc/samba/smb.conf`** |
| Daemons | **`smbd`** (file sharing), **`nmbd`** (name management) |

| Abbreviation | Full name |
|-------|-------|
| **SMB** | **Server Message Block** |
| **CIFS** | **Common Internet File System** — an extension of SMB |
| **NetBIOS** | Network Basic Input/Output System |

> ⚠️ In the question **"Which is least related to the components of Samba?"**, the choices are **SMB · CIFS · NetBIOS · RPC**. The answer is **RPC**. **RPC is what NFS uses**; it is not a component of Samba.

```bash
smbclient -L //server               # list the shares
mount -t cifs //server/share /mnt   # mount
testparm                           # check smb.conf syntax
```

### The Shape of smb.conf

```text
   [global]
      workgroup = WORKGROUP
      security = user

   [share]
      path = /srv/share
      writable = yes
      valid users = alice
```

| Section | Meaning |
|------|-----|
| **`[global]`** | Settings that apply to the **whole** server |
| `[homes]` | Automatically shares each user's **home directory** |
| `[printers]` | Printer sharing |
| Any other `[name]` | **One share.** The name in brackets is the share name that appears in Windows |

- **`[global]`, `[homes]`, and `[printers]` are names with predefined meanings**, and the rest are share names the administrator invents freely.
- Samba keeps **a Samba password separate from the Linux account**. Even if an alice account exists on Linux, you must register her with **`smbpasswd -a alice`** before she can log in to Samba.
- The two daemons divide the work — **`smbd` handles file/printer sharing and authentication**, and **`nmbd` lets computers be found by their NetBIOS names**. The ports are also split: `smbd` uses TCP **139 and 445**, and `nmbd` uses UDP 137 and 138.
- The way to write a share differs by operating system. Windows uses backslashes, **`\\server\share`**, and Linux uses slashes, **`//server/share`**.
- If you connect with `smbclient //server/share -U alice`, the `smb: \>` prompt appears, and you exchange files with **`get` and `put`, like FTP**. It is used to pull something out briefly without mounting.
- The name **Samba** comes from the protocol name **SMB**.

### NFS vs Samba

| Aspect | **NFS** | **Samba** |
|------|--------|---------------|
| Counterpart | **Unix/Linux** | **Windows** |
| Protocol | **RPC**-based NFS | **SMB / CIFS** |
| Name management | — | **NetBIOS** |
| Config file | **`/etc/exports`** | **`/etc/samba/smb.conf`** |
| Daemons | `nfsd` | **`smbd`, `nmbd`** |

- Answer immediately: **"To share with Windows?" → Samba**, **"To share between Unix systems?" → NFS**.

| Aspect | NFS | Samba |
|------|-----|------|
| Main ports | 2049 (+ rpcbind 111) | 139 · 445 |
| Mount | `mount -t nfs server:/data /mnt` | `mount -t cifs //server/share /mnt` |
| View shares | `showmount -e server` | `smbclient -L //server` |
| Apply / check config | `exportfs -r` | `testparm` |
| User authentication | Mostly allowed **by host (IP)** | **Username and password** (`smbpasswd`) |

- **In the mount command, the word after `-t` and the remote notation differ.** `nfs` uses `server:/path`, and `cifs` uses `//server/share`.
- NFS and Samba feel different from yesterday's FTP. **NFS and Samba are used by "mounting and treating it like your own directory,"** while **FTP is "connect and exchange files."** Still, all three fall into the "file sharing/transfer" group.

| Symptom | Cause | Fix |
|------|------|------|
| `mount.nfs: access denied by server` | My address is not allowed in `/etc/exports`, or the change is not applied yet | Check exports on the server, then `exportfs -r` |
| Mounted over NFS but cannot write | The option is `ro`, or the directory permissions do not grant write to that UID | `rw` in exports, and the server directory's permissions |
| Files created by the client's root are owned by `nobody` (`nfsnobody` on some distributions) | `root_squash` treated root as a lower user | This is normal behavior |
| The password keeps being rejected on a Samba connection | The Samba password was not registered | `smbpasswd -a user` |
| Shares disappeared after editing `smb.conf` | Syntax error | Check with `testparm` |

## Internet Services Before the Web

| Service | What it does |
|-------|--------|
| **Gopher** | A service for finding information through **menus**. **The predecessor of the web** |
| **Usenet** | **Newsgroups** — topic-based bulletin boards. The protocol is **NNTP** |
| **Archie** | A service that **searches files on FTP servers** |
| Veronica | Searches the content inside Gopher |
| **IRC** | Real-time **chat** |
| WAIS | Searches document databases |
| **Telnet** | Remote access |

- **Gopher is an information retrieval service from before the web (WWW) appeared.** You went down through menus, so there were no hyperlinks.
- **Usenet is newsgroups**, and its protocol is **NNTP** (Network News Transfer Protocol).
- **Archie is FTP search.** The name looks unfamiliar, so it tends to be used as a distractor choice.

| Search service | **What** it finds |
|-----------|----------------|
| **Archie** | **File names** on anonymous **FTP servers** |
| **Veronica** | **Menu items** on **Gopher** servers |
| **WAIS** | The **body content** of documents (keyword search) |

- All three are "search," but **what they search differs.** Pair them up as Archie–FTP and Veronica–Gopher.
- **The difference between Gopher and WWW is how documents are linked.** In Gopher you pick **menus from the top down**, while in WWW you click **hyperlinks** inside a document and jump anywhere. Gopher uses port **70**, and WWW (HTTP) uses port 80.
- **Usenet, unlike mail, is "a bulletin board that many people read together."** Posts go into **topic-based newsgroups** separated by dots, such as `comp.os.linux`. The port for NNTP is **119**.
- The place where Linus Torvalds first announced Linux in 1991 was also a Usenet newsgroup, `comp.os.minix`. This connects to the birth of Linux from Week 1.

| Protocols with similar names | What they are for |
|------------------|----------|
| **SMTP** | **Mail** transfer |
| **NNTP** | **Newsgroup** (Usenet) transfer |
| **NTP** | **Time** synchronization |
| **SNMP** | Network device **management** |

- The four differ in spelling by only one or two letters, so they appear together in choices. Tell them apart by **expanding the abbreviation** — the M of SMTP is Mail, the second N of NNTP is News, the T of NTP is Time, and the M of SNMP is Management.

### Grouping by Nature

| Group | Services |
|------|-------|
| **File sharing/transfer** | **FTP · NFS · Samba · SCP · SFTP** |
| **Remote access** | **TELNET · SSH · rlogin** |
| **Information retrieval** | **WWW · Gopher · Archie · WAIS** |
| **Messages/bulletin boards** | **Mail · Usenet · IRC** |

> These groups come up as questions exactly as they are. For example, if asked to choose the one with a different nature among **`WWW · SAMBA · TELNET · GOPHER`**: **WWW and Gopher are information retrieval**, **TELNET is remote access**, and **SAMBA is file sharing**, so you must read the sentence carefully to see what the grouping criterion is.

## Other Services

| Service | What it does | Port |
|-------|--------|-----|
| **DHCP** | **Automatically assigns** IP addresses | 67/68 |
| **NTP** | **Time synchronization** | 123 |
| **SNMP** | Network device **management and monitoring** | 161 |
| **LDAP** | Directory (account information) service | 389 |
| **Syslog** | Log collection | 514 |

- Remember the pairing: **DHCP is automatic IP assignment, NTP is setting the time.** Be careful not to confuse them with DNS (name resolution).
- DHCP's two ports are **67 for the server and 68 for the client**. What DHCP hands out is not only the IP address but also the **subnet mask, default gateway, and DNS server address**. It is like receiving all at once the values you entered by hand in Week 9.
- Addresses are not given permanently; they are **lent for a set period (a lease).** If it is not renewed before the period ends, the address goes back to another computer.
- Among the services in this table, **DHCP, NTP, and SNMP use UDP**. They are short question-and-answer exchanges, so there is no need for TCP, which sets up a connection.

> Tomorrow we tie this week's Internet services together on one page.

## 📖 Glossary

- **NFS** : A file sharing system between Unix/Linux systems. It is based on RPC and configured with `/etc/exports`.
- **RPC** : Remote Procedure Call. The communication method NFS uses.
- **Samba** : Software that provides file and printer sharing between Linux and Windows.
- **SMB / CIFS** : The file sharing protocol Samba uses and its extended specification.
- **NetBIOS** : The specification that handles name management in Samba.
- **Gopher** : A pre-web service for finding information through menus.
- **Usenet** : A topic-based newsgroup service. It uses the NNTP protocol.
- **Archie** : A service that searched for files on FTP servers.

## 📝 Practice Questions

**Question 1.** Which of the following is a service that shares directories between Unix and Linux systems so that a remote directory is used like a local one?

A) Samba  
B) NFS  
C) FTP  
D) Gopher  

**Answer: B**  
Explanation: NFS stands for Network File System; the client mounts a directory exported by the server and uses it like a local directory. It is configured in `/etc/exports` and works on top of RPC. Samba is used for sharing with Windows.

---

**Question 2.** Which of the following is software used to share files and printers between Linux and Windows systems?

A) NFS  
B) Archie  
C) Usenet  
D) Samba  

**Answer: D**  
Explanation: Samba implements on Linux the SMB/CIFS protocol that Windows uses, so the two can share files and printers. The config file is `/etc/samba/smb.conf`, and two daemons, `smbd` and `nmbd`, run.

---

**Question 3.** Which of the following is the **least** related to the components of Samba?

A) SMB  
B) NetBIOS  
C) RPC  
D) CIFS  

**Answer: C**  
Explanation: Samba uses the SMB protocol and its extension CIFS, and NetBIOS handles name management. RPC is a remote procedure call method used by NFS, so it is hard to regard it as a component of Samba.

---

**Question 4.** Which of the following is a service that found information through menus before the web appeared?

A) Gopher  
B) Usenet  
C) IRC  
D) NFS  

**Answer: A**  
Explanation: Gopher finds information by going down hierarchical menus instead of hyperlinks, and it corresponds to the predecessor of the WWW. Usenet is topic-based newsgroups, IRC is real-time chat, and NFS is a file sharing service.

---

**Question 5.** Which of the following is the protocol used by Usenet newsgroups?

A) SMTP  
B) IMAP  
C) HTTP  
D) NNTP  

**Answer: D**  
Explanation: NNTP stands for Network News Transfer Protocol and is used to exchange posts in Usenet newsgroups. SMTP and IMAP are protocols for mail, and HTTP is for web communication.
