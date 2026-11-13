# Day 5 - Week 11 Comprehensive Review: The Big Picture of Sharing, Firewalls, and Security

## 📌 Key Points

- This week's axis is **connection (sharing) and defense (security)** — you have to open things up for them to be useful, but the more is open, the greater the risk.
- Sharing: when Windows is mixed in, use **Samba** (smbd 139/445, nmbd 137/138, `smb.conf`); when everything is Linux, use **NFS** (rpcbind 111, `/etc/exports`).
- Firewalls: iptables works as **table→chain (INPUT/OUTPUT/FORWARD)→rule**, and firewalld works per **zone**. The way changes are applied and persisted differs.
- Access control: TCP Wrapper is **allow first**, and SELinux is **MAC** on top of DAC (3 modes + the `type` context).
- The top 3 traps: the **space before the parenthesis** in exports, **`--reload` after `--permanent`** in firewalld, and **no disabled with `setenforce`**.

## Day 1 Review: Samba — The Bridge to Windows

- Samba implements Windows' **SMB/CIFS** protocol on Linux, enabling file and printer sharing between heterogeneous operating systems.
- Two daemons are the core.

| Daemon | Role | Ports |
|------|------|------|
| `smbd` | File sharing, authentication | TCP 139, 445 |
| `nmbd` | NetBIOS name resolution, browsing | UDP 137, 138 |

- Configuration is done through the section structure of `/etc/samba/smb.conf`.
- Special sections: `[global]` (global), `[homes]` (automatic home sharing), `[printers]` (automatic printer sharing). Every other section name becomes a share name.
- Share directives: `path`, `writable` (= `read only no`), `valid users` (`@` for groups), `guest ok`.
- Samba accounts are created with `smbpasswd -a`, **separately** from Linux accounts. A Linux system account must exist first.
- Validation is `testparm`, and the connection test is `smbclient -L`.

> 💡 **One-line summary**: Samba is a **double permission gate** — you must pass both the Samba permissions in smb.conf and the Linux filesystem permissions to get access.

## Day 2 Review: NFS — The Unix Standard Sharing

- NFS is **RPC-based**, so the port mapper **`rpcbind` (port 111)** must be alive.
- Server configuration is the single `/etc/exports` file, in the format "directory client(options)".

```
/srv/share    192.168.1.0/24(rw,sync,no_subtree_check)
```

- Here, **no space between the client and the parenthesis** is the biggest trap (with a space, those options are opened to `*`).
- Main options: `ro`/`rw`, `sync`/`async`, `root_squash` (default, secure)/`no_root_squash` (dangerous).
- Apply after editing with `exportfs -ra`.
- The client checks with `showmount -e` and attaches with `mount -t nfs server:path mount_point`.

| Item | NFS | Samba |
|------|-----|-------|
| Target | Linux/Unix | Windows mixed |
| Config file | /etc/exports | smb.conf |
| Dependency | rpcbind(111) | smbd/nmbd |
| Mount type | nfs | cifs |
| Authentication | IP/UID based | Account/password based |

**Selection in one line**: if everything is Linux, use **NFS**; if Windows is mixed in, use **Samba**.

## Day 3 Review: Firewalls — iptables and firewalld

- iptables controls the kernel's **netfilter** and has a **table→chain→rule** structure.
- Memorize the three chains of the filter table by direction — **INPUT (incoming), OUTPUT (outgoing), FORWARD (passing through)**.
- Rules are matched in order from top to bottom, and if none match, the default policy (`-P`) applies.

| Option | Meaning | / | Target | Meaning |
|------|------|---|------|------|
| `-A` | Append to the end | | `ACCEPT` | Allow |
| `-I` | Insert at the front | | `DROP` | Discard without response |
| `-D` | Delete | | `REJECT` | Rejection response |
| `-P` | Policy | | `LOG` | Log and pass through |
| `-j` | Specify target | | | |

- firewalld groups trust levels into **zones** (drop/block/public/home/trusted) and is managed with `firewall-cmd`.
- The biggest trap is **runtime vs `--permanent`** — after changing with permanent, you must `--reload` for it to apply now.

> ⚠️ **Common trap**: iptables rules exist only in memory, so you must save them with `service iptables save` for them to persist after a reboot. Also, if you do not add the SSH allow rule before `-P INPUT DROP` when working remotely, you cut yourself off.

## Day 4 Review: Access Control and Logs

- **TCP Wrapper** : the order is `hosts.allow` (first) → `hosts.deny` → default allow. The `service : host` syntax uses the keywords `ALL`/`LOCAL`/`EXCEPT`.
- **SELinux** : MAC on top of DAC. You handle the three modes **enforcing/permissive/disabled** with `getenforce`/`setenforce`, but you cannot reach disabled with setenforce, and permanent changes go in `/etc/selinux/config`.
- **SELinux context** : in `user:role:type:level`, the type is the key. View it with `ls -Z`, change it with `chcon`, and restore it with `restorecon`.
- **Log files** : messages, secure, maillog, and cron in `/var/log`. The binary wtmp/btmp/lastlog are read with the dedicated commands `last`/`lastb`/`lastlog`.
- **rsyslog.conf** : the `facility.priority` pair records the specified level **and above**. `.none` excludes, and `=` means only that level.
- **logrotate** : rotates and retains logs with `rotate N`, `compress`, and `daily/weekly`.

**Security debugging signal**: "the permissions are right but access fails" → suspect the SELinux context. If it goes away with `setenforce 0`, it is an SELinux problem (in production, do not turn it off; fix the context).

## Key Comparisons That Are Easy to Mix Up, at a Glance

| Confusion | Correct answer |
|--------|------|
| smbd vs nmbd | smbd = sharing/authentication (139/445), nmbd = name resolution (137/138) |
| Samba mount vs NFS mount | cifs vs nfs |
| exports space | No space between client and (options) |
| root_squash vs no_root_squash | Default = root_squash (root demoted, safe) |
| iptables -A vs -I | -A appends to the end, -I inserts at the front |
| DROP vs REJECT | DROP gives no response, REJECT gives a rejection response |
| firewalld apply | runtime (temporary) vs --permanent (+reload) |
| hosts.allow vs deny | allow first, allowed if in neither |
| setenforce range | Only enforcing↔permissive, no disabled |
| wtmp/btmp viewing | last / lastb (binary, cannot cat) |

We wrap up the week with the comprehensive questions below.

## 📖 Glossary

- **SMB/CIFS** : Windows' file sharing protocol. Samba implements it on Linux.
- **smbd / nmbd** : Samba's sharing/authentication daemon (TCP 139/445) / NetBIOS name resolution daemon (UDP 137/138).
- **rpcbind** : The port mapper (111) that tells the ports of RPC services. A prerequisite for NFS to work.
- **/etc/exports** : The file where the NFS server writes "which directory to export to whom with what permissions".
- **root_squash** : The default security option in NFS that demotes the client's root to an anonymous user.
- **chain** : A bundle of rules per packet direction in iptables. There are three: INPUT, OUTPUT, FORWARD.
- **DROP / REJECT** : Blocking by silently discarding with no response / blocking by sending a rejection response.
- **zone** : A rule set that firewalld groups by trust level. public is the default.
- **--permanent** : The option that keeps a firewalld setting after reboot. To apply it immediately, `--reload` is needed.
- **hosts.allow / hosts.deny** : TCP Wrapper's allow and deny lists. allow is checked first.
- **MAC (mandatory access control)** : Access control where the kernel enforces a policy that even root cannot escape. SELinux falls under this.
- **facility.priority** : The pair in rsyslog that specifies a log's source and severity. The specified level and above are recorded.

## 📝 Practice Questions

**Question 1.** In Samba, which is the correct daemon and port for NetBIOS name resolution and network browsing?

A) smbd, TCP 445
B) nmbd, UDP 137/138
C) rpcbind, TCP 111
D) smbd, UDP 137/138

**Answer: B**

Explanation: `nmbd` handles NetBIOS name resolution and browsing and uses UDP 137/138. `smbd` handles file sharing and authentication and uses TCP 139/445. `rpcbind` is the port mapper for NFS.

---

**Question 2.** Among the following `/etc/exports` entries, which is the wrong setting that opens rw permission to all hosts against the intent?

A) /data 192.168.1.0/24(rw,sync)
B) /data 192.168.1.10(rw)
C) /data 192.168.1.10 (rw)
D) /data *(ro)

**Answer: C**

Explanation: If there is a space between the client and the parenthesis, NFS interprets it as two entries: "default permission for 192.168.1.10" and "rw for all hosts (*)". So C is a dangerous setting that opens write access to everyone. The rest are written correctly without spaces.

---

**Question 3.** Which is the correct iptables command to allow incoming TCP connections on port 80 (HTTP) from outside?

A) iptables -A OUTPUT -p tcp --sport 80 -j ACCEPT
B) iptables -A INPUT -p tcp --dport 80 -j ACCEPT
C) iptables -P INPUT -p udp --dport 80 -j DROP
D) iptables -A FORWARD -p tcp --dport 80 -j REJECT

**Answer: B**

Explanation: Since it is an incoming connection, the chain is `INPUT`, the protocol is TCP, the destination port is `--dport 80`, and the action is `-j ACCEPT`. A has the wrong direction (OUTPUT/sport), C wrongly combines a port condition with a policy (-P) and uses udp/DROP, and D is a FORWARD reject.

---

**Question 4.** In firewalld, how do you allow the http service so that it persists after a reboot and also apply it immediately?

A) Run only firewall-cmd --add-service=http
B) Run only firewall-cmd --add-service=http --permanent
C) Run firewall-cmd --add-service=http --permanent, then firewall-cmd --reload
D) firewall-cmd --remove-service=http --reload

**Answer: C**

Explanation: `--permanent` saves permanently but does not apply immediately, so you must re-read with `--reload` for it to be reflected in the current session too. A disappears on reboot, B is not applied now, and D is a command that removes the service.

---

**Question 5.** In TCP Wrapper, what happens to a host that matches neither hosts.allow nor hosts.deny?

A) It is denied
B) It is allowed
C) An error occurs
D) hosts.deny takes priority and it is denied

**Answer: B**

Explanation: TCP Wrapper checks allow first and allows on a match; if it is not there, it checks deny and denies on a match. If it matches neither, it is **allowed by default**. Therefore, to block explicitly, you must put a rule in deny.

---

**Question 6.** What is the correct way to permanently change SELinux to disabled?

A) Run setenforce 0
B) Run getenforce disabled
C) Edit /etc/selinux/config to SELINUX=disabled and reboot
D) Run setsebool disabled on

**Answer: C**

Explanation: `setenforce` only switches temporarily between enforcing↔permissive and cannot go to disabled. A permanent change (including disabled) requires editing the `SELINUX=` value in `/etc/selinux/config` and rebooting. `getenforce` is for querying, and `setsebool` is for changing booleans.

---

**Question 7.** Which of the following correctly describes the `authpriv.* /var/log/secure` setting in rsyslog.conf?

A) It records messages of all priorities of the authpriv facility in /var/log/secure
B) It records authpriv messages of all facilities
C) It excludes authpriv from the log
D) It records only error level and above

**Answer: A**

Explanation: In `authpriv.*`, the `*` means all priorities, so it records messages of every level of the authpriv (security authentication) facility in `/var/log/secure`. Exclusion is specified with `.none`, exactly one level with `.=level`, and a level and above with `.level`.

---

**Question 8.** Which correctly pairs the filesystem types used to mount an NFS share and a Samba share on a Linux client?

A) NFS: cifs, Samba: nfs
B) NFS: nfs, Samba: cifs
C) NFS: smbfs, Samba: nfs
D) NFS: ext4, Samba: cifs

**Answer: B**

Explanation: An NFS share is mounted with `mount -t nfs`, and a Windows/Samba share with `mount -t cifs` (formerly smbfs). `ext4` is a local disk filesystem and is not used for network sharing.

---

**Question 9.** In iptables, when an "everything DROP" rule is already near the top of the chain, which option must you use to effectively add a specific port allowance?

A) Append to the end with -A (Append)
B) Insert in front of the DROP rule with -I (Insert)
C) Delete with -D (Delete)
D) Change the policy with -P (Policy)

**Answer: B**

Explanation: iptables matches in order from top to bottom, so if an "everything DROP" rule is above, adding an ACCEPT after it (-A) is pointless because packets are already caught by the DROP and never reach it. You must insert the ACCEPT in front of the DROP with `-I` for it to take effect.

---

**Question 10.** Which correctly pairs the command that views failed login records with its target file?

A) last — /var/log/btmp
B) lastb — /var/log/btmp
C) lastlog — /var/log/wtmp
D) lastb — /var/log/wtmp

**Answer: B**

Explanation: Failed login records are stored in the binary file `/var/log/btmp` and are viewed with `lastb`. `last` views `wtmp`, the successful login records, and `lastlog` views the last login per user (`/var/log/lastlog`).

---

**Question 11.** When NFS does not work, which service and port should you check first?

A) smbd, 445
B) rpcbind, 111
C) named, 53
D) httpd, 80

**Answer: B**

Explanation: NFS is RPC-based, so the port mapper `rpcbind` (port 111) must be alive. If rpcbind is dead or 111 is blocked by the firewall, the NFS mount fails. `smbd` is for Samba, `named` is for DNS, and `httpd` is for a web server.

---

**Question 12.** Which correctly describes the behavior of the logrotate settings `weekly` + `rotate 4` + `compress`?

A) It rotates daily and keeps 4 without compression
B) It rotates weekly, keeps the most recent 4 (about 4 weeks' worth) compressed, and deletes the excess
C) It rotates when 4 MB is exceeded
D) It rotates once every 4 weeks

**Answer: B**

Explanation: `weekly` rotates every week, `rotate 4` keeps the most recent 4 (deleting the oldest when exceeded), and `compress` compresses rotated logs with gzip. So about 4 weeks' worth of logs are kept compressed. Size-based rotation is the `size` directive.

---
