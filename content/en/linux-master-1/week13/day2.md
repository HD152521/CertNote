# Day 2 - Service Config File Short Answers: One Directive Decides Pass or Fail

## 📌 Key Takeaways

- Today you memorize **words inside config files**, not commands. Each blank is ultimately a 1:1 mapping of "this feature = this directive."
- Web: the document root is **`DocumentRoot`**, the listening port is **`Listen`** (not `Port`), and the default document is `DirectoryIndex`.
- DNS: two axes, `named.conf` (configuration) + zone files (data). **After editing a zone, always increment the SOA Serial.** Name→IP is `A`, IP→name is `PTR`.
- DHCP uses `range` (dynamic range) and `host`+`hardware ethernet`+`fixed-address` (MAC reservation). FTP uses `anonymous_enable`, `write_enable`, `chroot_local_user`.
- Sharing: Samba uses `path`, `writable`, `valid users` (`@` for groups); in NFS exports, **no space before the parenthesis** and `root_squash`.
- For SSH, `PermitRootLogin no` is the key one. The server file is `sshd_config` and the client file is `ssh_config`; they are different.
- After editing a config, **verify it with a check tool (`testparm`, `named-checkconf`, `httpd -t`, `sshd -t`) and restart**; they come as a set.

## Apache httpd.conf: The Heart of the Web Server

- The config file is `/etc/httpd/conf/httpd.conf` (RHEL family).
- The directives asked as short answers are as follows.

```apache
ServerRoot "/etc/httpd"        # Base directory for config and logs
Listen 80                      # Listening port
ServerName www.example.com:80  # Server name
DocumentRoot "/var/www/html"   # Web document root (the key one!)
DirectoryIndex index.html      # Default document
ServerAdmin root@example.com   # Administrator email
MaxClients 256                 # Maximum concurrent connections (prefork)
ErrorLog "logs/error_log"      # Error log
CustomLog "logs/access_log" combined   # Access log

<Directory "/var/www/html">    # Per-directory access control
    AllowOverride None         # Scope of .htaccess
    Require all granted        # Allow access (2.4 syntax)
</Directory>
```

| Directive | Meaning | Trap |
|--------|------|----------|
| `DocumentRoot` | Top-level path of web documents | A basic item of web server configuration |
| `Listen` | Listening port (default 80) | Not `Port` (since 2.2) |
| `DirectoryIndex` | Default document shown | index.html |
| `ServerName` | Server name:port | |
| `AllowOverride` | Scope of .htaccess | If None, .htaccess is ignored |

The directive that specifies the top-level directory where web documents live → **`DocumentRoot`**. The listening port is **`Listen`** (not the old `Port`).

**Virtual hosts**: To host multiple sites on one server, specify `ServerName` and `DocumentRoot` separately in each `<VirtualHost *:80>` block.

## BIND named.conf + Zone Files: The Two Axes of DNS

- The BIND DNS server works with two files: the **main configuration (`/etc/named.conf`)** and the **zone data (`/var/named/*.zone`)**.
- Telling the two apart is the key.

```text
// /etc/named.conf
options {
    listen-on port 53 { any; };     // Listening interfaces
    directory "/var/named";          // Zone file location
    allow-query { any; };            // Who may query
};
zone "example.com" IN {
    type master;                     // master (primary) / slave (secondary)
    file "example.com.zone";         // Zone data file name
};
```

- The zone file (`example.com.zone`) holds **resource records (RR)**.

```text
$TTL 86400
@   IN  SOA  ns.example.com. admin.example.com. (
        2026060501   ; Serial (must increase on every edit!)
        3600         ; Refresh
        1800         ; Retry
        604800       ; Expire
        86400 )      ; Minimum TTL
@       IN  NS   ns.example.com.    ; Nameserver
@       IN  MX 10 mail.example.com. ; Mail server (priority)
ns      IN  A    192.168.1.10       ; Forward: name -> IP
www     IN  A    192.168.1.20
mail    IN  A    192.168.1.30
ftp     IN  CNAME www               ; Alias
```

| Record | Meaning | Memory aid |
|--------|------|--------|
| `SOA` | Start of authority, zone info | Serial must be increased |
| `NS` | Specifies nameserver | Name Server |
| `A` | Name→IPv4 | Address |
| `AAAA` | Name→IPv6 | Four A's |
| `MX` | Mail server (priority) | Mail eXchange |
| `CNAME` | Alias (canonical name) | Canonical Name |
| `PTR` | IP→name (reverse) | Pointer |

> ⚠️ **Trap**: After editing a zone file you must **increase the SOA Serial value** so the slave detects the change. If you do not raise the Serial, the secondary server is not updated.

**Forward vs reverse**: Name→IP is an `A` record (forward), IP→name is a `PTR` record (reverse, in an `in-addr.arpa` zone). The mail server is specified with `MX`.

## DHCP dhcpd.conf: The Rules for Lending Addresses

- The DHCP server configuration is `/etc/dhcp/dhcpd.conf`.
- Lease ranges and options are defined inside a subnet block.

```text
# /etc/dhcp/dhcpd.conf
default-lease-time 600;
max-lease-time 7200;
subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.100 192.168.1.200;          # Allocation range
    option routers 192.168.1.1;                  # Gateway
    option domain-name-servers 8.8.8.8;          # DNS
    option subnet-mask 255.255.255.0;            # Netmask
}
host printer {                                   # Fixed IP reservation
    hardware ethernet 00:11:22:33:44:55;         # MAC address
    fixed-address 192.168.1.50;                  # Fixed IP to assign
}
```

| Directive | Meaning |
|--------|------|
| `range` | Dynamically assigned IP range |
| `option routers` | Default gateway |
| `option domain-name-servers` | Client DNS |
| `default-lease-time` | Default lease time (seconds) |
| `host`+`hardware ethernet`+`fixed-address` | MAC-based fixed IP |

The directive that specifies the dynamically assigned address range → **`range`**. To always give a particular MAC the same IP, use `hardware ethernet` (MAC) + `fixed-address` (IP) in a `host` block.

## vsftpd.conf: Controlling FTP Access

- The config file is `/etc/vsftpd/vsftpd.conf`.
- It covers anonymous access, write permission, and chroot.

```text
# /etc/vsftpd/vsftpd.conf
anonymous_enable=NO        # Anonymous access (NO recommended for security)
local_enable=YES           # Allow local account logins
write_enable=YES           # Allow uploads (writes)
chroot_local_user=YES      # Lock users in their home (block moving up)
listen=YES                 # Standalone daemon mode
ftpd_banner=Welcome        # Login banner
```

| Directive | Meaning of YES/NO |
|--------|------------|
| `anonymous_enable` | Whether anonymous ftp is allowed |
| `local_enable` | Allow system account logins |
| `write_enable` | Allow writes (upload/delete) |
| `chroot_local_user` | Isolate to the home directory |

> ⚠️ **Security trap**: `anonymous_enable=YES` + `write_enable=YES` is a dangerous setup where anyone can upload. Normally anonymous is NO, and isolation is `chroot_local_user=YES`.

## Samba smb.conf & NFS exports: Two Sharing Siblings

```text
# /etc/samba/smb.conf
[global]
    workgroup = WORKGROUP
    security = user            # Authentication method
[share]
    path = /srv/share          # Actual path to share
    writable = yes             # Allow writes (= read only = no)
    valid users = @staff       # Accounts allowed access (@ = group)
    guest ok = no              # Guest access
```

```text
# /etc/exports  (NFS)
/srv/data    192.168.1.0/24(rw,sync,no_subtree_check)
```

- The biggest trap in NFS `exports` is **no space between the client and the parenthesis** (with a space, the default options are opened to all hosts).
- Main options are `rw`/`ro`, `sync`/`async`, `root_squash` (default, safe)/`no_root_squash` (dangerous).

| File | Key directives |
|------|-----------|
| smb.conf | `path`, `writable`, `valid users`, `guest ok` |
| exports | path + `client(options)` (no space) |

**smb.conf blanks**: The actual share path is `path`, and allowing writes is `writable = yes` (or `read only = no`). To specify a group, put `@` before the name.

## sshd_config: Remote Access Security

- The config file is `/etc/ssh/sshd_config`.
- Security hardening directives are asked as short answers.

```text
# /etc/ssh/sshd_config
Port 22                          # Listening port
PermitRootLogin no               # Forbid direct root login (recommended)
PasswordAuthentication yes       # Allow password authentication
PubkeyAuthentication yes         # Public key authentication
PermitEmptyPasswords no          # Forbid empty passwords
AllowUsers alice bob             # Whitelist of allowed accounts
MaxAuthTries 3                   # Limit authentication attempts
```

| Directive | Security meaning |
|--------|----------|
| `PermitRootLogin` | **no** blocks direct root login |
| `PasswordAuthentication` | no forces key authentication only |
| `PermitEmptyPasswords` | Must be no to block empty passwords |
| `Port` | Default 22; changing it avoids scans |
| `AllowUsers`/`DenyUsers` | Allow/deny per account |

`sshd_config` (server, daemon) and `ssh_config` (client) are different files. Blocking root login is `PermitRootLogin no` in the server file. After editing, apply with `systemctl restart sshd`.

## Config File Map at a Glance

| Service | File | Key exam directives |
|--------|------|-----------------|
| Apache | /etc/httpd/conf/httpd.conf | DocumentRoot, Listen, DirectoryIndex |
| BIND | /etc/named.conf + zone | type master/slave, SOA Serial, A/MX/CNAME/PTR |
| DHCP | /etc/dhcp/dhcpd.conf | range, option routers, fixed-address |
| vsftpd | /etc/vsftpd/vsftpd.conf | anonymous_enable, write_enable, chroot_local_user |
| Samba | /etc/samba/smb.conf | path, writable, valid users |
| NFS | /etc/exports | No space before client(options), root_squash |
| SSH | /etc/ssh/sshd_config | PermitRootLogin, PasswordAuthentication, Port |

## Starting and Checking Services: Always Apply After Configuring

- Once you have edited a config file, restarting the service and checking its status comes as a set.
- You need to know each service's daemon, port, and management command precisely.

| Service | Daemon (unit) | Port | Restart |
|--------|-----------|------|--------|
| Apache | `httpd` | 80/443 | `systemctl restart httpd` |
| BIND | `named` | 53 | `systemctl restart named` |
| DHCP | `dhcpd` | 67/68 | `systemctl restart dhcpd` |
| vsftpd | `vsftpd` | 21 | `systemctl restart vsftpd` |
| Samba | `smb`,`nmb` | 139/445,137/138 | `systemctl restart smb` |
| NFS | `nfs-server` | 2049(+111) | `exportfs -ra` |
| SSH | `sshd` | 22 | `systemctl restart sshd` |

```bash
systemctl enable --now httpd     # Auto-start at boot + start immediately
systemctl status named           # Check status and recent logs
systemctl is-enabled sshd        # Whether it auto-starts at boot
ss -tuln | grep ':53'            # Check that the port is actually open
```

**enable vs start**: `start` starts it only now, `enable` auto-starts at boot. For both, use `enable --now`. If you only edit the config and do not restart, the change does not take effect, a common point deduction in lab tasks.

**NFS is the exception**: Edits to exports can be applied immediately with `exportfs -ra` (re-export) without restarting the service. nfs-server depends on rpcbind (111), so both must be alive.

## Try It Yourself

- Open the config files, check the directives with your own eyes, and verify them with syntax check tools.

```bash
# Check the key directives of each config file (excluding comments and blank lines)
grep -v '^#' /etc/httpd/conf/httpd.conf | grep -E 'DocumentRoot|Listen'
grep -v '^#' /etc/ssh/sshd_config | grep -E 'PermitRootLogin|Port'

# Syntax check tools
testparm                       # Validate smb.conf
named-checkconf                # Validate named.conf
named-checkzone example.com /var/named/example.com.zone   # Validate zone
httpd -t                       # Validate apache config
sshd -t                        # Validate sshd config
```

A directive scores points only if every letter is exact. Also get into the habit of verifying with the dedicated tool after configuring.

## 📖 Glossary

- **DocumentRoot** : The directive that specifies the top-level directory where Apache looks for web documents. The most frequently asked short answer.
- **Listen** : The directive that specifies the port Apache accepts requests on. It is not the old `Port` directive.
- **AllowOverride** : The scope of what `.htaccess` may override in that directory. If `None`, .htaccess is ignored.
- **SOA Serial** : The version number of the zone data. It must be raised every time you edit the zone so that secondary (slave) servers pick up the change.
- **A record / PTR record** : The forward record that turns a name into an IP / the reverse record that turns an IP into a name.
- **MX record** : The record that specifies the server that receives mail for the domain and its priority. A smaller number means higher priority.
- **CNAME** : An alias record that points to another name.
- **range** : The directive that sets the range of IP addresses DHCP hands out dynamically.
- **fixed-address** : The DHCP directive used to always give the same IP to a specific MAC (`hardware ethernet`).
- **chroot_local_user** : The vsftpd setting that locks users in their own home directory so they cannot move up.
- **valid users** : The list of accounts that may access a Samba share. A leading `@` means a group.
- **root_squash** : The default NFS security option that demotes the client's root to an anonymous user.
- **PermitRootLogin** : The directive that decides whether root may log in directly over SSH. `no` is recommended for security.
- **sshd_config vs ssh_config** : The config file of the SSH **server** (daemon) / the config file of the SSH **client**. The names are similar, so tell them apart.

## 📝 Practice Questions

**Question 1.** In Apache `httpd.conf`, which directive specifies the top-level directory of web documents?

A) ServerRoot
B) DocumentRoot
C) DirectoryIndex
D) RootDirectory

**Answer: B**

Explanation: The top-level path where web content lives is specified with `DocumentRoot` (e.g. `/var/www/html`). `ServerRoot` is the base directory for Apache's config and logs, and `DirectoryIndex` is the name of the document shown by default (index.html). `RootDirectory` is not a real directive.

---

**Question 2.** After editing a BIND zone file, which SOA field must you increase so that the secondary (slave) server detects the change?

A) Refresh
B) Retry
C) Serial
D) Expire

**Answer: C**

Explanation: The slave server compares the master's SOA `Serial` value and, if it is larger than its own, fetches a zone transfer. So when you edit a zone you must increase the Serial. `Refresh`/`Retry`/`Expire` are the refresh interval, retry interval, and expiry time; raising them does not trigger an update.

---

**Question 3.** Which DNS resource record maps a domain name to an IPv4 address?

A) PTR
B) CNAME
C) MX
D) A

**Answer: D**

Explanation: Name→IPv4 mapping is the `A` (Address) record. `PTR` is IP→name (reverse), `CNAME` is an alias (canonical name), and `MX` specifies the mail server (with priority). IPv6 mapping uses the `AAAA` record.

---

**Question 4.** In `dhcpd.conf`, which directive specifies the range of IP addresses to assign dynamically to clients?

A) range
B) fixed-address
C) option routers
D) subnet-mask

**Answer: A**

Explanation: The dynamic allocation range is specified with `range start-IP end-IP` inside the subnet block. `fixed-address` gives a fixed IP to a specific MAC (in a host block), `option routers` is the gateway, and `subnet-mask` is the netmask option.

---

**Question 5.** In vsftpd, which directive locks a logged-in user so they cannot move above their own home directory?

A) local_enable=YES
B) chroot_local_user=YES
C) write_enable=YES
D) anonymous_enable=NO

**Answer: B**

Explanation: `chroot_local_user=YES` isolates local users in their own home with chroot, blocking access to parent directories. `local_enable` allows local account logins, `write_enable` allows uploads, and `anonymous_enable` controls anonymous access, so none of them relate to isolation.

---

**Question 6.** Which entry should you set in `sshd_config` to block direct remote login of the root account on an SSH server?

A) PermitRootLogin yes
B) PermitRootLogin no
C) PasswordAuthentication no
D) AllowUsers root

**Answer: B**

Explanation: Setting `PermitRootLogin no` blocks direct SSH login by root (logging in as a regular account and then using su/sudo is recommended). `yes` allows it, `PasswordAuthentication no` turns off password authentication itself (key authentication only), and `AllowUsers root` actually puts root on the allow list.

---

**Question 7.** In NFS `/etc/exports`, which is the correct meaning of the `root_squash` option?

A) It demotes the client's root to anonymous (nobody) privileges on the server
B) It grants the client's root the server's root privileges as is
C) It promotes all users to root
D) It forbids writes

**Answer: A**

Explanation: `root_squash` (the default) maps the client's root requests to the anonymous user (nobody) on the server to keep things secure. Conversely, `no_root_squash` gives the client's root the server's root privileges, which is dangerous. Forbidding writes is the `ro` option.

---
