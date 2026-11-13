# Day 4 - Access Control and Security: TCP Wrapper, SELinux, Log Management

## 📌 Key Points

- Security is defense in depth — inside the firewall (network) sit **TCP Wrapper** (host access control), **SELinux** (mandatory access control), **log management**, and **IDS** layer upon layer.
- TCP Wrapper check order: `hosts.allow` first → if it matches, **allow and stop**; otherwise `hosts.deny` → if neither matches, **allow by default**.
- SELinux is **MAC** on top of DAC. The modes are `enforcing`/`permissive`/`disabled`, the context is `user:role:type:level`, and the **type** is the key. You cannot go to disabled with `setenforce`.
- Logs live in `/var/log`. `wtmp`, `btmp`, and `lastlog` are **binary**, so you read them with `last`, `lastb`, and `lastlog`. `rsyslog.conf` records **that level and above** using the `facility.priority` pair.
- IDS splits into **NIDS** (snort), which watches packets, and **HIDS** (tripwire, AIDE), which watches file integrity. `fail2ban` watches logs and automatically blocks failing IPs, but its settings go in `jail.local`.

## TCP Wrapper: hosts.allow and hosts.deny

- TCP Wrapper is a host-based access control system that works through the `libwrap` library (`tcpd`).
- When a service receives a connection request, before handing it to the actual service it checks two files to decide whether to allow that source host.

| File | Role |
|------|------|
| `/etc/hosts.allow` | List of hosts to **allow** access |
| `/etc/hosts.deny` | List of hosts to **deny** access |

- The check order is the most important exam point.

**Check order (memorize absolutely)**: ① Check `/etc/hosts.allow` first → if it matches, **allow and stop**. ② If not found, check `/etc/hosts.deny` → if it matches, **deny**. ③ If it is in neither, **allow by default**. In other words, **allow takes priority over deny**, and if neither applies, the connection passes.

- The file syntax takes the form `service : host`.

```bash
# /etc/hosts.deny — deny everything by default
ALL : ALL

# /etc/hosts.allow — allow only specific ones
sshd : 192.168.1.0/24
sshd : 192.168.1.100
vsftpd : .example.com
ALL : 127.0.0.1
```

- The combination above is a typical whitelist setup: "deny everything by default, but allow SSH only from the 192.168.1.0/24 subnet and FTP only from the example.com domain".

| Keyword | Meaning |
|--------|------|
| `ALL` | All services or all hosts |
| `LOCAL` | Local host names without a dot (`.`) |
| `.example.com` | All hosts in the example.com domain |
| `192.168.1.` | That network range |
| `EXCEPT` | Specify an exception (e.g., `ALL EXCEPT 192.168.1.5`) |

> ⚠️ **Trap**: if you block everything by putting `ALL : ALL` in hosts.deny and forget to allow yourself in hosts.allow, you get blocked even though you came in over SSH (the same trap as with firewalls). Also, TCP Wrapper only applies to services that use `libwrap` (sshd, vsftpd, etc.) — it is not a universal tool that blocks every service.

## SELinux: Mandatory Access Control (MAC)

- Standard Linux permissions (rwx, owner/group/others) are **discretionary access control (DAC)**. The file owner can change permissions at will, and root can do practically anything.
- The problem: if a process such as a web server is compromised, the whole system is at risk with that process's privileges.
- **SELinux** (Security-Enhanced Linux) layers **mandatory access control (MAC)** on top of that.
- It attaches a **security context** label to every process and file, and the kernel enforces a policy that says "a process in this context may only touch files in that context".
- Even root cannot escape this policy.

### SELinux's three modes

| Mode | Behavior |
|------|------|
| `enforcing` | **Enforces** the policy. On a violation, blocks + records a log |
| `permissive` | **Does not enforce** the policy; only logs violations (for debugging) |
| `disabled` | SELinux is **completely disabled** |

- You handle modes with commands and a configuration file.

```bash
# Check the current mode
getenforce            # prints Enforcing / Permissive / Disabled
sestatus              # detailed status

# Temporary mode change (reverts on reboot)
setenforce 1          # Enforcing
setenforce 0          # Permissive

# For a permanent change, edit the configuration file
vi /etc/selinux/config
# SELINUX=enforcing  ← set this value to enforcing/permissive/disabled
```

**Temporary vs permanent**: `setenforce` only switches between enforcing↔permissive **temporarily**, and after a reboot it returns to the value in `/etc/selinux/config`. To go to `disabled` or make a permanent change, you must edit the `/etc/selinux/config` file and reboot. The trap is that you cannot go to disabled with `setenforce`.

### Security context

- The heart of SELinux is the **context label** attached to every file and process.
- You can check it with `ls -Z` (files) and `ps -Z` (processes).

```bash
# Show a file's SELinux context (-Z)
ls -Z /var/www/html

# Example output: system_u:object_r:httpd_sys_content_t:s0
#          └user┘ └role┘  └──── type ────┘      └level┘
```

- The context has the format `user:role:type:level`, and of these the **type** is the most important in actual access control.
- Example: the Apache (httpd) process runs with the `httpd_t` type and can only serve files of the `httpd_sys_content_t` type.
- If you put web content in the wrong directory, the type does not match, and you get the phenomenon where "the permissions are right but access is denied".

```bash
# Change a file's context (type)
chcon -t httpd_sys_content_t /srv/web/index.html

# Restore the context to the policy default
restorecon -Rv /var/www/html

# Check/change SELinux booleans (on/off switches)
getsebool -a
setsebool -P httpd_can_network_connect on
```

**chcon vs restorecon**: `chcon` changes the context directly, but it is temporary and can disappear on `restorecon` or a filesystem relabel. For permanence, the standard way is to register a rule in the policy with `semanage fcontext` and then apply it with `restorecon`. `restorecon` returns the context to the one the policy defines as "what it should originally be".

If "the permissions (chmod) are definitely right but the service cannot access the file", suspect the SELinux context. If switching temporarily to `setenforce 0` (permissive) makes the problem go away, the cause is SELinux — but in production, do not turn it off; fix the context correctly.

## Log Management: /var/log and rsyslog

- Most of what happens on a system is left behind as logs. They are the basic material for intrusion analysis and troubleshooting.
- The main log files are gathered under `/var/log`.

| Log file | Contents |
|-----------|------|
| `/var/log/messages` | General system messages (RHEL family) |
| `/var/log/syslog` | General system messages (Debian family) |
| `/var/log/secure` | Authentication/security related (SSH logins, etc., RHEL) |
| `/var/log/auth.log` | Authentication related (Debian) |
| `/var/log/maillog` | Mail server log |
| `/var/log/cron` | cron job log |
| `/var/log/boot.log` | Boot messages |
| `/var/log/dmesg` | Kernel ring buffer (hardware at boot) |
| `/var/log/wtmp` | Login records (binary, viewed with the `last` command) |
| `/var/log/btmp` | Failed login records (viewed with `lastb`) |
| `/var/log/lastlog` | Last login per user (viewed with `lastlog`) |

> ⚠️ **Beware of binary logs**: `wtmp`, `btmp`, and `lastlog` are **binary** files, not text. Opening them with `cat` looks garbled, and each must be read with its dedicated command: `last`, `lastb`, `lastlog`. It is an easy trap to fall into.

### rsyslog.conf: facility and priority

- Where and how logs are recorded is decided in **`/etc/rsyslog.conf`**.
- The core syntax takes the form **`facility.priority    action`**.

- **facility (service category)**: the type of source that produced the log. Examples: `auth` (authentication), `authpriv` (security authentication), `cron`, `mail`, `kern` (kernel), `daemon`, `user`, `local0` to `local7` (user-defined)
- **priority (severity)**: the importance of the message. From low to high: `debug < info < notice < warning < err < crit < alert < emerg`

```bash
# /etc/rsyslog.conf example
# facility.priority            target
authpriv.*                     /var/log/secure
mail.*                         -/var/log/maillog
cron.*                         /var/log/cron
*.info;mail.none;authpriv.none /var/log/messages
*.emerg                        :omusrmsg:*
kern.*                         /var/log/kern.log
```

- When you specify a priority, **all messages at that level and above** are recorded.
- Example: `mail.err` catches err, crit, alert, and emerg.
- `mail.*` means all levels, and `mail.none` means exclude that facility.

**Key interpretation**: `*.info;mail.none;authpriv.none /var/log/messages` means "record info and above of all facilities in messages, except mail and authpriv". If you add the `=` sign (e.g., `mail.=info`), it catches exactly that level only. You need this facility.priority pair interpretation on the practical exam.

```bash
# Apply after editing rsyslog.conf
systemctl restart rsyslog

# Generate a log entry yourself to test
logger -p authpriv.notice "test message"
```

## logrotate: Log Rotation and Retention

- If logs keep piling up, they fill the disk.
- **`logrotate`** periodically cuts (rotates) log files and keeps them, deleting or compressing old ones. It usually runs daily from cron.
- Configuration is in `/etc/logrotate.conf` (global) and `/etc/logrotate.d/` (per service).

```bash
# /etc/logrotate.d/myapp example
/var/log/myapp/*.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root adm
    postrotate
        systemctl reload myapp > /dev/null 2>&1 || true
    endscript
}
```

| Directive | Meaning |
|--------|------|
| `daily` / `weekly` / `monthly` | Rotation period |
| `rotate N` | Number of old logs to keep (the oldest is deleted beyond N) |
| `compress` | Compress rotated logs with gzip |
| `delaycompress` | Delay compression by one cycle (the most recent rotated log is not compressed) |
| `missingok` | Do not raise an error if the log file is missing |
| `notifempty` | Do not rotate if the log is empty |
| `create mode owner group` | Create a new empty log file with the given permissions after rotation |
| `size N` | Rotate when the specified size is exceeded |
| `postrotate ... endscript` | Script to run after rotation (usually a service reload) |

**What rotate N means**: `rotate 4` + `weekly` means "rotate every week and keep the most recent 4 (about 4 weeks' worth)". When rotated, `myapp.log`→`myapp.log.1`→`myapp.log.2`... get pushed back, and at the 5th, the oldest is deleted. With `compress`, they are compressed to `.gz`.

```bash
# Check config syntax + force run (debug)
logrotate -d /etc/logrotate.conf      # -d: debug (does not actually run, simulation)
logrotate -f /etc/logrotate.conf      # -f: force immediate run
```

**Try it yourself**: open an existing file in `/etc/logrotate.d/` (e.g., `syslog`) to see which directives are used, and simulate what would happen without touching real files using `logrotate -d` (debug mode). Also create a message with `logger -p local0.err "hi"` and trace it in `/var/log/messages` to see the facility.priority behavior with your own eyes.

## Intrusion Detection (IDS) — The Layer That Notices After a Breach

- The three layers above are devices that "keep intruders out" and "leave traces".
- But attacks that come in through an allowed port like a normal connection are not blocked.
- **IDS** (Intrusion Detection System) is the next layer: a tool that **notices an intrusion by looking at the traces of what has already happened**.
- It splits into two branches depending on what it monitors.

| Category | NIDS (network based) | HIDS (host based) |
|------|----------------------|--------------------|
| What it monitors | **Packets** passing through the network | **Files, logs, processes** inside that server |
| Where it is installed | Choke points of traffic, such as switch mirror ports and gateways | On each server to be protected |
| What it catches well | Port scans, exploit packets, worm spread | System file tampering, backdoor installation, repeated login failures |
| What it cannot see | The contents of **encrypted traffic** | What happens outside its own host |
| Representative tools | **snort**, suricata | **tripwire**, **AIDE**, fail2ban (log based) |

### fail2ban: Watching Logs and Blocking Automatically

- `fail2ban` monitors log files in real time, and when **a failure pattern exceeds a threshold within a set time window, it blocks that source IP with a firewall rule for a set duration**.
- It is the de facto standard for responding to SSH brute force attacks.
- A single unit of monitoring is called a **jail** — a set that bundles "which log to read (`logpath`), with which filter (`filter`), how many failures (`maxretry`), and for how long to block (`bantime`)".

| File | Role |
|------|------|
| `/etc/fail2ban/jail.conf` | The original provided by the distribution. **Do not edit it directly** (it is overwritten on package updates) |
| `/etc/fail2ban/jail.local` | Administrator settings. It overrides jail.conf, and **writing here is the rule** |
| `/etc/fail2ban/jail.d/*.conf` | Configuration fragments split per service |
| `/etc/fail2ban/filter.d/*.conf` | Definitions of the regular expressions (`failregex`) that recognize failure logs |
| `/etc/fail2ban/action.d/*.conf` | The actions that perform the actual blocking (iptables, firewalld, nftables, etc.) |

```bash
# /etc/fail2ban/jail.local
[DEFAULT]
bantime  = 3600                       # ban duration (seconds)
findtime = 600                        # time window for counting failures (seconds)
maxretry = 5                          # block when this count is exceeded
ignoreip = 127.0.0.1/8 192.168.1.0/24 # ranges never to block

[sshd]
enabled  = true
port     = ssh
logpath  = /var/log/secure            # /var/log/auth.log on the Debian family
```

```bash
systemctl enable --now fail2ban
fail2ban-client status                       # list of active jails
fail2ban-client status sshd                  # number and list of banned IPs for that jail
fail2ban-client set sshd unbanip 1.2.3.4     # manually unban
fail2ban-client reload                       # re-read the configuration
```

If you write settings directly in `jail.conf`, they get overwritten wholesale on a package update and vanish — always write them in **`jail.local`** (or `jail.d/`). Also, if you do not put your management range in `ignoreip`, a few password typos can get **the administrator blocked**, and if `logpath` does not match the distribution (`/var/log/secure` on the RHEL family vs `/var/log/auth.log` on the Debian family), the jail catches nothing even though it is running.

### snort: A NIDS That Watches Packets

- `snort` is a representative open-source NIDS that compares packets passing through the network against rules to find attack signatures.
- The exam point is that it runs in **three modes**.

| Mode | What it does | Example |
|------|---------|-----|
| Sniffer | Captures packets and only prints them to the screen | `snort -v` (`-d` payload, `-e` adds link-layer headers) |
| Packet logger | Saves captured packets to a file | `snort -l /var/log/snort` |
| **NIDS** | Compares against rules and raises alerts | `snort -c /etc/snort/snort.conf` |

- One rule line has two parts: **rule header + rule options**.

```
alert tcp any any -> 192.168.1.0/24 80 (msg:"passwd access"; content:"/etc/passwd"; sid:1000001; rev:1;)
└─ header: action protocol sourceIP port direction destIP port ─┘ └──────────── options ────────────┘
```

- **Action**: `alert` (alert + log), `log` (log only), `pass` (ignore). In inline (IPS) mode, `drop` and `reject` are also used
- **Direction**: `->` (one-way), `<>` (bidirectional)
- **Options**: `msg` (alert message), `content` (the string to find in the payload), `sid` (the rule's unique number; user-defined ones are 1000000 and above), `rev` (the rule revision number)

### tripwire and AIDE: HIDS That Protect File Integrity

- The surest trace an intruder leaves is **tampering with system files** — for example `/bin/ls` being swapped out or an account being quietly added to `/etc/passwd`.
- `tripwire` and `AIDE` (Advanced Intrusion Detection Environment) take a snapshot of the size, permissions, owner, and hash of the monitored files as a **baseline database**.
- In later checks, they compare against the current state and report what has changed.

| Step | tripwire | AIDE |
|------|----------|------|
| Configuration/policy | `/etc/tripwire/twcfg.txt`, policy `twpol.txt` | `/etc/aide.conf` |
| Create baseline DB | `tripwire --init` | `aide --init` |
| Integrity check | `tripwire --check` | `aide --check` |
| Accept legitimate changes | `tripwire --update` | `aide --update` |

- tripwire signs and stores its configuration and policy with a site key and a local key (`twadmin`), and you read check reports with `twprint`.
- AIDE keeps its baseline DB at `/var/lib/aide/aide.db.gz`, and the administrator promotes the `aide.db.new.gz` created by `--init` by renaming it manually.

The baseline DB only has meaning if it is **created when the system is definitely clean (right after installation)**. If you run `--init` on an already compromised system, even the backdoor is registered as "normal" and the tool is rendered useless. Also, if you keep the DB and configuration only in writable locations on that server, an intruder can tamper with them too, so the rule is to keep them on read-only media or external storage.

The three tools do not overlap in role. `fail2ban` **instantly blocks repeated failures that show up in logs** (response), `snort` **detects attack signatures in network packets** (NIDS), and `tripwire`/`AIDE` **verify after the fact whether files have changed** (HIDS). That is why in practice all three are deployed together.

Tomorrow we do a comprehensive review of the week.

## 📖 Glossary

- **TCP Wrapper** : A mechanism that controls access by checking the source host, only for services that use `libwrap`.
- **hosts.allow / hosts.deny** : The allow and deny host lists respectively. **allow is checked first**, and if neither matches, the connection passes.
- **DAC / MAC** : Discretionary access control, where the owner can change permissions at will / mandatory access control, where the kernel enforces a policy that even root cannot escape.
- **SELinux modes** : `enforcing` (block + log), `permissive` (log only), `disabled` (off). You cannot reach disabled with `setenforce`.
- **Security context** : The `user:role:type:level` label attached to files and processes. The actual decision depends on the **type**.
- **chcon / restorecon** : A temporary command that changes the context directly / a command that restores the original context defined in the policy.
- **facility.priority** : The pair in rsyslog that specifies "log source.severity". **That level and above** are all recorded.
- **wtmp / btmp / lastlog** : Records of successful logins, failed logins, and last logins. They are binary, so you can read them only with `last`, `lastb`, and `lastlog`.
- **logrotate** : A tool that periodically cuts, keeps, compresses, and deletes logs. `rotate N` is the number of old logs to keep.
- **NIDS / HIDS** : Intrusion detection that watches network packets (snort) / intrusion detection that watches a host's files and logs (tripwire, AIDE).
- **fail2ban jail** : A monitoring unit that bundles "which log, how many failures to tolerate, and how long to block". Settings go in `jail.local`.

## 📝 Practice Questions

**Question 1.** Which is the correct order in which TCP Wrapper checks its access control files?

A) Check hosts.deny first, and if not found, check hosts.allow
B) Check hosts.allow first and allow on a match, and if not found, check hosts.deny
C) Check both files at the same time and block if there is any deny
D) Check only hosts.allow and ignore hosts.deny

**Answer: B**

Explanation: TCP Wrapper checks `/etc/hosts.allow` first, and if it matches, allows and stops immediately. If it is not there, it checks `/etc/hosts.deny` and denies on a match, and if it is in neither, it allows by default. Therefore allow takes priority over deny.

---

**Question 2.** Among the SELinux modes, which one does not block policy violations and only logs them?

A) enforcing
B) permissive
C) disabled
D) targeted

**Answer: B**

Explanation: `permissive` mode does not enforce the policy and only records violations in the log, and is used for debugging. `enforcing` actually blocks violations, and `disabled` turns SELinux off entirely. `targeted` is not a mode but one of the policy types.

---

**Question 3.** Which is the correct command to temporarily switch SELinux to permissive mode?

A) setenforce 0
B) setenforce 1
C) getenforce 0
D) sestatus permissive

**Answer: A**

Explanation: `setenforce 0` switches temporarily to permissive and `setenforce 1` to enforcing (reverting to the `/etc/selinux/config` value on reboot). `getenforce` only queries the current mode, and `sestatus` only shows detailed status without changing the mode. Note that you cannot go to disabled with `setenforce`.

---

**Question 4.** Among the files under `/var/log`, which holds the failed login records and must be viewed with the `lastb` command?

A) /var/log/wtmp
B) /var/log/btmp
C) /var/log/messages
D) /var/log/secure

**Answer: B**

Explanation: `btmp` is a binary file holding failed login records and is viewed with `lastb`. `wtmp` holds successful login records (`last`), `messages` is the general system messages (text), and `secure` is the authentication-related log (text). wtmp/btmp are binary, so opening them with cat looks garbled.

---

**Question 5.** Which is the correct interpretation of the `mail.err /var/log/maillog` setting in rsyslog.conf?

A) It records exactly the err level of the mail facility only
B) It records the err level and above (err, crit, alert, emerg) of the mail facility
C) It records err of all facilities
D) It excludes the mail facility from the log

**Answer: B**

Explanation: When you specify a priority, all messages at that level **and above** are recorded. So `mail.err` catches err, crit, alert, and emerg. To catch exactly that level only, you must add `=` as in `mail.=err`, and exclusion is `mail.none`.

---

**Question 6.** In a logrotate configuration, which directive specifies the number of old log files to keep?

A) compress
B) rotate
C) missingok
D) notifempty

**Answer: B**

Explanation: `rotate N` specifies the number of old logs to keep, and beyond N the oldest log is deleted. `compress` compresses rotated logs, `missingok` does not raise an error if the log is missing, and `notifempty` is an option that does not rotate if the log is empty.

---

**Question 7.** Which is the correct option for checking a file's security context in SELinux?

A) ls -l
B) ls -Z
C) ls -a
D) ls -i

**Answer: B**

Explanation: `ls -Z` displays a file's SELinux security context (`user:role:type:level`). You view processes with `ps -Z`. `ls -l` shows ordinary permissions, `ls -a` includes hidden files, and `ls -i` shows inode numbers.

---
