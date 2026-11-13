# Day 2 - NFS: The Standard File Sharing of the Unix World

## 📌 Key Points

- **NFS** (Network File System) is the standard Unix/Linux file sharing created by Sun Microsystems in 1984. It mounts a remote directory as if it were a local disk.
- NFS runs on top of **RPC** → if **`rpcbind` (port 111)** is not alive, NFS itself does not work.
- Server configuration is a single file, `/etc/exports`. The format is `directory client(options)`, and **there must be no space between the client and the parenthesis**.
- Apply changes after editing with `exportfs -ra`, and verify with `exportfs -v`. The client queries with `showmount -e` and attaches with `mount -t nfs`.
- Between Linux machines, use NFS (**trusts IP and UID**); when Windows is mixed in, use Samba (**account authentication**).

## NFS Architecture: RPC and the Port Mapper

- NFS does not work on its own; it runs on top of **RPC** (Remote Procedure Call).
- RPC is a mechanism that lets a client call a function on a remote server as if it were a local function.
- RPC-based services are assigned ports dynamically rather than using fixed ports. The component that brokers that port information is **`rpcbind`** (formerly named `portmap`).
- Flow: the client asks the server's `rpcbind` (fixed port **111**) "which port is the NFS service on?" → it then does the actual NFS communication on the port it is told.
- That is why NFS itself does not work if `rpcbind` is dead.

| Component | Role |
|-----------|------|
| `rpcbind` (port 111) | Port mapper that brokers the port information of RPC services |
| `nfs-server` (nfsd) | The NFS daemon that handles the actual file I/O requests |
| `mountd` (rpc.mountd) | Receives the client's mount requests and checks permissions |
| `rpc.statd` / `lockd` | Manage file locking and state recovery |

The precondition for NFS to work is that **`rpcbind` (port 111) must be alive**. The number one cause of "NFS mount doesn't work" is rpcbind not running on the server or client, or port 111 being blocked by the firewall. You can check the registered RPC services with `rpcinfo -p server_IP`.

```bash
# Check the list of RPC services registered on the server
rpcinfo -p localhost

# Start NFS-related services (RHEL family)
systemctl start rpcbind nfs-server
systemctl enable rpcbind nfs-server
```

## /etc/exports: What to Export, and to Whom

- The heart of the server-side NFS configuration is a single file, **`/etc/exports`**.
- On each line, you define "which directory is exported, to which clients, and with what permissions".
- The syntax is as follows.

```
directory_to_share    client(option,option,...)   client2(option,...)
```

```bash
# /etc/exports example
/srv/share      192.168.1.0/24(rw,sync,no_subtree_check)
/data/public    *(ro,sync)
/home/team      192.168.1.10(rw,sync)  192.168.1.20(ro)
/secret         server.example.com(rw,sync,root_squash)
```

- Here, **the placement of spaces is decisive**. There **must be no space** between the client name and the parenthesis.
- This is the most notorious trap in the NFS exports syntax.

> ⚠️ **Critical trap**: `192.168.1.10(rw)` and `192.168.1.10 (rw)` are completely different. Without the space it means "rw permission for host 10"; with the space it is interpreted as "default permission (ro) for host 10, and **rw permission for all hosts (`*`)**". This difference leads directly to security incidents.

### How to specify clients

| Notation | Meaning |
|------|------|
| `192.168.1.10` | A single specific IP host |
| `192.168.1.0/24` | An entire subnet |
| `*.example.com` | All hosts in the domain (wildcard) |
| `*` | All hosts |
| `server1` | A host name |

### Key export options

| Option | Meaning |
|------|------|
| `ro` | Read only |
| `rw` | Read and write |
| `sync` | Reply after writing data to disk (safe, default and recommended) |
| `async` | Reply before writing to disk (fast but risky) |
| `root_squash` | Demotes the client's root to an anonymous user (nfsnobody) (default, security) |
| `no_root_squash` | Treats the client's root as root on the server too (dangerous) |
| `all_squash` | Demotes all users to anonymous |
| `no_subtree_check` | Skips the subtree check (performance, recommended) |
| `secure` | Only allows requests coming from privileged ports below 1024 (default) |

**What root_squash means**: by default, NFS does not trust the client's root. Even if you touch a shared file as root on the client, the server treats you as `nfsnobody` (an anonymous user). This is `root_squash`, and it is the default. `no_root_squash` is a dangerous option to use only in trusted environments — it lets the client's root handle the server's files freely with root privileges.

## exportfs: Applying and Managing exports

- After editing `/etc/exports`, you must apply its contents to the NFS server.
- **`exportfs`** is the tool that refreshes just the export table without restarting the whole service.

| Command | Meaning |
|------|------|
| `exportfs -a` | Export all entries in `/etc/exports` (all) |
| `exportfs -r` | Re-read and refresh the export table (re-export, the most used after editing) |
| `exportfs -u` | Unexport a specific export (unexport) |
| `exportfs -v` | Print the current export list in detail (verbose) |
| `exportfs -ra` | Re-apply everything (a commonly used combination) |

```bash
# Apply the changes after editing /etc/exports
exportfs -ra

# Check the list currently being exported
exportfs -v

# Unexport a specific share
exportfs -u 192.168.1.0/24:/srv/share
```

`vi /etc/exports → exportfs -ra → verify with exportfs -v`. Restarting the NFS server (`systemctl restart nfs-server`) also applies the change, but during operation the standard practice is to refresh without downtime using `exportfs -ra`.

## Client Side: showmount and mount -t nfs

- The client first checks what the server exports, then mounts.
- The tool that queries the server's export list is **`showmount`**.

```bash
# Show the list of shares the server exports (-e = exports)
showmount -e 192.168.1.100

# Show the clients currently mounted on the server
showmount -a 192.168.1.100
```

- The actual mount is done with **`mount -t nfs`**.

```bash
# Mount a remote NFS share on a local directory
mount -t nfs 192.168.1.100:/srv/share /mnt/share

# Specify mount options
mount -t nfs -o rw,soft,timeo=30 192.168.1.100:/srv/share /mnt/share
```

- To mount automatically at boot, register it in `/etc/fstab`.

```bash
# /etc/fstab entry example
# server:remote_path       mount_point   type   options            dump check
192.168.1.100:/srv/share  /mnt/share   nfs   defaults,_netdev   0    0
```

> ⚠️ **The `_netdev` option**: when you register NFS in `/etc/fstab`, adding `_netdev` means "mount after the network is up". If you leave it out, the system may try to mount before the network is ready during boot, and the boot can hang.

### hard vs soft mounts

| Option | Behavior |
|------|------|
| `hard` | Retries indefinitely if the server does not respond (default, data-safe) |
| `soft` | Returns an error and gives up after a set time (`timeo`) (favors responsiveness) |

**Why hard is the default**: for data integrity, NFS uses a `hard` mount by default. Even if the server stops briefly, work continues once it recovers. However, if the server dies for good, processes can fall into an infinite wait, so this is sometimes supplemented with `intr` (allow interrupts) or `soft`.

## NFS vs Samba: When to Use Which

- Comparing the two sharing methods side by side makes the exam points clear.

| Item | NFS | Samba (SMB/CIFS) |
|------|-----|-----------------|
| Main use | Sharing between Unix/Linux | Windows ↔ Linux sharing |
| Protocol | NFS (RPC-based) | SMB/CIFS |
| Key config file | `/etc/exports` | `/etc/samba/smb.conf` |
| Apply/manage commands | `exportfs` | `testparm`, `smbpasswd` |
| Dependent services | `rpcbind` (port 111) | `smbd`, `nmbd` |
| Mount type | `mount -t nfs` | `mount -t cifs` |
| Main ports | 111 (rpcbind), 2049 (nfs) | 139/445 (smbd), 137/138 (nmbd) |
| Authentication | Host (IP) based + user UID mapping | User account/password based |
| Permission model | Linux UID/GID as-is | Samba account + Linux permissions |

**Selection rule in one line**: if the sharing parties are **all Linux/Unix**, use NFS; if **Windows is mixed in**, use Samba. The key is the difference in philosophy: NFS trusts per IP (host), while Samba authenticates per user account.

**Difference in authentication models**: NFS trusts the client's UID/GID as-is. A user with UID 1000 on the client is treated as UID 1000 on the server too. So in an NFS environment, you must match user UIDs between server and client (or unify them with NIS/LDAP) to avoid permission confusion. Samba authenticates with Samba's own accounts regardless of that.

## The NFS Setup Flow at a Glance

```bash
# === Server side ===
# ① Install packages
yum install nfs-utils

# ② Prepare the shared directory
mkdir -p /srv/share
chmod 755 /srv/share

# ③ Edit /etc/exports (watch the spaces!)
echo "/srv/share 192.168.1.0/24(rw,sync,no_subtree_check)" >> /etc/exports

# ④ Start the services
systemctl start rpcbind nfs-server
systemctl enable rpcbind nfs-server

# ⑤ Apply the exports
exportfs -ra
exportfs -v

# ⑥ Open the firewall
firewall-cmd --add-service=nfs --add-service=rpc-bind --add-service=mountd --permanent
firewall-cmd --reload

# === Client side ===
# ⑦ Check the server's shares
showmount -e 192.168.1.100

# ⑧ Mount
mount -t nfs 192.168.1.100:/srv/share /mnt/share
```

**Try it yourself**: deliberately put a space in `/etc/exports`, like `192.168.1.10 (rw)`, and check the result with `exportfs -v`. Seeing with your own eyes that rw gets granted to `*` against your intent makes the space trap unmistakable. Also stop `rpcbind` on purpose (`systemctl stop rpcbind`) and observe how the mount fails.

Tomorrow we cover firewalls that protect the system from the outside — iptables and firewalld.

## 📖 Glossary

- **NFS** : The standard Unix/Linux file sharing that mounts a remote server's directory as if it were a local disk.
- **RPC** : A mechanism that lets you call a remote server's function as if it were a local function. NFS runs on top of it.
- **rpcbind** : The port mapper that tells which port an RPC service is on. Fixed port 111. Formerly named `portmap`.
- **/etc/exports** : The NFS server configuration file that defines "which directory is exported to whom with what permissions".
- **exportfs** : The command that applies, unexports, and queries the contents of `/etc/exports` on the server. `-ra` re-applies everything, `-v` shows the list.
- **root_squash** : The default security option that demotes the client's root to an anonymous user (nfsnobody) on the server.
- **sync / async** : Options that decide whether to reply after writing to disk (safe) or before writing (fast but risky).
- **showmount** : The command that queries the list of shares the server exports (`-e`) or the clients currently mounted (`-a`).
- **hard / soft mount** : A mode that decides whether to retry indefinitely when the server does not respond (default, safe) or to return an error after a set time.
- **_netdev** : An `/etc/fstab` option meaning "mount after the network is up". Leaving it out can make the boot hang.

## 📝 Practice Questions

**Question 1.** Which daemon is essential for the NFS service to work, and brokers the port information of RPC services?

A) nmbd
B) rpcbind
C) smbd
D) named

**Answer: B**

Explanation: NFS is an RPC-based service, and RPC services are assigned ports dynamically. `rpcbind` (formerly portmap, port 111) brokers this port information, so NFS does not work without rpcbind. `nmbd`/`smbd` are Samba daemons, and `named` is the DNS daemon.

---

**Question 2.** Which of the following correctly describes the `/etc/exports` entry below?

```
/data    192.168.1.0/24(rw,sync)
```

A) It shares read-only with all hosts
B) It shares read-write with the 192.168.1.0/24 subnet, with synchronous writes
C) It shares with only the single host 192.168.1.0
D) It is not applied because of a syntax error

**Answer: B**

Explanation: `192.168.1.0/24` means the entire subnet, `rw` is read-write, and `sync` is the safe mode that replies after writing data to disk. There is no space between the client and the parenthesis, so the syntax is also fine.

---

**Question 3.** Which is the correct result of putting a space between the client specification and the option parentheses in `/etc/exports`?

A) A syntax error means nothing is exported at all
B) The space is ignored and it applies normally
C) The default permission applies to the specified host, and the options in parentheses apply to all hosts (*)
D) root_squash is automatically disabled

**Answer: C**

Explanation: With a space, as in `192.168.1.10 (rw)`, NFS interprets it as two entries: "default permission (ro) for 192.168.1.10" and "rw permission for all hosts (*)". It is a serious security trap that unintentionally opens write access to everyone, so you must never put in a space.

---

**Question 4.** Which command refreshes the export table without restarting the NFS server after editing `/etc/exports`?

A) exportfs -u
B) exportfs -ra
C) showmount -e
D) rpcinfo -p

**Answer: B**

Explanation: `exportfs -r` re-reads and refreshes the export table (re-export), and `-a` applies everything (all). The combined `exportfs -ra` is the most common way to refresh without downtime after editing. `-u` unexports, `showmount -e` queries shares, and `rpcinfo -p` checks RPC services.

---

**Question 5.** Among the NFS export options, which default option strengthens security by demoting the client's root user to an anonymous user on the server?

A) no_root_squash
B) all_squash
C) root_squash
D) async

**Answer: C**

Explanation: `root_squash` is the default security option that maps the client's root to the server's anonymous user (nfsnobody). `no_root_squash` is a dangerous option that treats the client's root as the server's root, `all_squash` demotes all users to anonymous, and `async` is the asynchronous write option.

---

**Question 6.** Which command checks, from the client, the list of shared directories the NFS server exports?

A) showmount -e server_IP
B) mount -t nfs server_IP
C) exportfs -v
D) smbclient -L server_IP

**Answer: A**

Explanation: `showmount -e server_IP` queries the list of shares that server exports through `/etc/exports`. `mount -t nfs` is the actual mount, `exportfs -v` checks the server's own export list (run on the server), and `smbclient -L` is for querying Samba shares.

---

**Question 7.** Which of the following statements comparing NFS and Samba is incorrect?

A) NFS is mounted with mount -t nfs, and Samba shares with mount -t cifs
B) NFS is mainly used between Unix/Linux, and Samba for sharing with Windows
C) NFS's key config file is /etc/exports, and Samba's is /etc/samba/smb.conf
D) NFS authenticates based on user accounts/passwords, and Samba based on IP hosts

**Answer: D**

Explanation: The authentication models are described backwards. NFS is based on trusting the client's IP (host) and UID/GID mapping, while Samba uses user account/password (`smbpasswd`) based authentication. All the other choices are correct.

---
