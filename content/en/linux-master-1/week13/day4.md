# Day 4 - Security, Firewall, and Log Tasks: Write the Rules and Fix the Context

## 📌 Key Takeaways

- Security lab tasks make you **write rules and settings yourself**. Direction, target, zone, type, and facility.priority must be exact to the letter.
- iptables is **table → chain → rule**. Rules stop at the first match from top to bottom, so the position of `-A` (append) versus `-I` (insert at front) changes the result.
- **Iron rule of remote work**: before `-P INPUT DROP`, add the SSH (22) allow rule first. Otherwise you cut yourself off.
- Preventing volatility: for iptables use `service iptables save`; for firewalld use **`--permanent` + `--reload`**.
- The key in SELinux is the context's **type**. Tell apart `chcon` (temporary) / `restorecon` (restore to policy) / `semanage fcontext` (permanent registration).
- rsyslog distributes by `facility.priority` and records **the given level and above**. `.none` excludes, `.=` means only that level.
- logrotate's skeleton is `interval + rotate N + compress`. TCP Wrapper is **allow first**, and if neither file matches, access is allowed.

## iptables: Controlling netfilter by Hand

- iptables controls the kernel's netfilter with a **table → chain → rule** structure.
- Memorize the three chains of the filter table by direction.

| Chain | Direction | Example |
|------|------|----|
| `INPUT` | Incoming (to the server) | External → my port 80 |
| `OUTPUT` | Outgoing (from the server) | Me → external DNS |
| `FORWARD` | Passing through (routing) | Via the gateway |

- The main options and targets are as follows.

| Option | Meaning | Target | Meaning |
|------|------|------|------|
| `-A` | Append to end of chain | `ACCEPT` | Allow |
| `-I` | Insert at the front | `DROP` | Discard without reply |
| `-D` | Delete | `REJECT` | Send a rejection reply |
| `-P` | Default policy | `LOG` | Log and pass through |
| `-j` | Specify the target | | |
| `-p` | Protocol (tcp/udp) | `--dport` | Destination port |
| `-s` | Source IP | `--sport` | Source port |

```bash
# List rules
iptables -L -n -v --line-numbers     # Detailed listing with line numbers

# Allow incoming TCP on 80 (HTTP) and 22 (SSH)
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow only a specific IP range
iptables -A INPUT -s 192.168.1.0/24 -p tcp --dport 3306 -j ACCEPT

# Block all other INPUT (default policy)
iptables -P INPUT DROP

# Delete a rule / reset
iptables -D INPUT 3                   # Delete rule number 3
iptables -F                           # Flush all rules

# Save (persist after reboot) - required since rules live only in memory
service iptables save                 # or iptables-save > /etc/sysconfig/iptables
```

> ⚠️ **Fatal trap**: If you run `iptables -P INPUT DROP` first during a remote SSH session, **you cut yourself off**. Always add the port 22 ACCEPT rule first, then change the policy.

**Order is everything**: Rules are matched top to bottom and stop at the first match. If "DROP everything" is above, an ACCEPT added later (`-A`) never gets reached → insert it at the front with `-I` for it to work.

## firewall-cmd: firewalld's Zone-Based Firewall

- firewalld manages trust levels by grouping them into **zones**.
- The key point is that runtime and permanent configuration are separate.

```bash
# Status and basic info
firewall-cmd --state                       # Whether it is running
firewall-cmd --get-default-zone            # Default zone
firewall-cmd --list-all                    # All rules of the current zone

# Allow a service/port (permanent + immediate)
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload                      # Apply permanent to the current runtime

# Allow only a specific IP (rich rule)
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.1.0/24" service name="ssh" accept'

# Remove
firewall-cmd --permanent --remove-service=http
firewall-cmd --reload
```

| Option | Meaning |
|------|------|
| `--add-service` / `--add-port` | Allow a service name / port |
| `--permanent` | Save permanently (not applied immediately) |
| `--reload` | Apply permanent to the current session |
| `--list-all` | Check all current rules |
| `--get-default-zone` | Show the default zone |

> ⚠️ **Key trap**: Using only `--permanent` **does not apply right now**. You must `--reload` to apply it to the current session. Conversely, running only `--add-service` without `--reload` disappears at reboot. "Permanent + immediate" = `--permanent` then `--reload`.

**Saving in iptables vs firewalld**: iptables uses `service iptables save`, firewalld uses `--permanent`. Both solve the same problem, "rules in memory are volatile," in different ways.

## SELinux: Mandatory Access Control on Top of DAC

- SELinux layers type-based mandatory access control (MAC) on top of traditional permissions (DAC).
- The three modes and the context are the key.

```bash
getenforce                    # Current mode (Enforcing/Permissive/Disabled)
setenforce 0                  # Temporarily switch to Permissive
setenforce 1                  # Temporarily switch to Enforcing
# For a permanent change (including disabled), edit SELINUX= in /etc/selinux/config and reboot
```

| Mode | Behavior |
|------|------|
| `Enforcing` | Policy violations **blocked + logged** |
| `Permissive` | Violations allowed but **only logged** |
| `Disabled` | SELinux fully off |

- The context has the form `user:role:type:level`, and **the type is the key**.

```bash
ls -Z /var/www/html           # Check file context (-Z)
ps -eZ                         # Process contexts

# Change a context
chcon -t httpd_sys_content_t /web/index.html      # Change immediately (temporary)
semanage fcontext -a -t httpd_sys_content_t "/web(/.*)?"   # Register permanently in policy
restorecon -Rv /web           # Restore the default context per policy

# Booleans (feature on/off)
getsebool -a | grep httpd
setsebool -P httpd_can_network_connect on    # -P = permanent
```

| Command | Role |
|------|------|
| `ls -Z` | Show context |
| `chcon -t type` | Temporarily change context |
| `restorecon` | Restore default context |
| `semanage fcontext` | Register context in permanent policy |
| `setsebool -P` | Permanently change a boolean |

**Diagnostic signal**: "Permissions (rwx) are right but access fails" → suspect SELinux. If `setenforce 0` fixes it, it is an SELinux problem (in production, do not turn it off; fix the context with `restorecon`/`chcon`).

**chcon vs restorecon**: `chcon` sets it directly (may vanish on relabeling), `restorecon` restores per policy, and `semanage fcontext` + `restorecon` is the permanent standard. You cannot reach Disabled with setenforce (permanent is the config file).

## rsyslog: Classifying Logs by facility.priority

- `/etc/rsyslog.conf` (or `/etc/rsyslog.d/*.conf`) distributes logs.
- The format is `facility.priority  destination`.

```text
# facility.priority         destination file
*.info;mail.none;authpriv.none;cron.none   /var/log/messages
authpriv.*                                  /var/log/secure
mail.*                                      /var/log/maillog
cron.*                                      /var/log/cron
*.emerg                                     :omusrmsg:*
kern.*                                      /var/log/kern.log
local7.*                                    /var/log/boot.log
```

| facility | Meaning | priority (low→high) |
|----------|------|----------------|
| `auth`/`authpriv` | Authentication, security | `debug` |
| `cron` | Cron | `info` |
| `kern` | Kernel | `notice` |
| `mail` | Mail | `warning`/`warn` |
| `daemon` | Daemons | `err`/`error` |
| `local0~7` | User-defined | `crit`, `alert`, `emerg` |

- A priority records **the given level and above**. The special notations are as follows.

| Notation | Meaning |
|------|------|
| `mail.info` | Everything from mail at info **and above** |
| `mail.=info` | Exactly the info level only |
| `mail.none` | **Exclude** mail |
| `*.info` | info and above of all facilities |

```bash
# Apply after editing
systemctl restart rsyslog
```

The setting that gathers security authentication logs into `/var/log/secure` is `authpriv.*  /var/log/secure`. `.none` excludes, and `.=` means exactly that level only.

## logrotate: Rotating, Compressing, and Retaining Logs

- `/etc/logrotate.conf` and `/etc/logrotate.d/*` keep logs from growing without limit.

```text
# /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    weekly                  # Rotation interval: daily/weekly/monthly
    rotate 4                # Number to keep (4 = about 4 weeks), older ones deleted
    compress                # gzip-compress rotated logs
    delaycompress           # Delay compression by one generation (latest log stays readable)
    missingok               # No error if the file is missing
    notifempty              # Do not rotate if empty
    create 0640 root root   # Permissions and owner of the new log file
    size 100M               # (Optional) rotate by size
    postrotate              # Command to run after rotation
        systemctl reload rsyslog > /dev/null 2>&1 || true
    endscript
}
```

| Directive | Meaning |
|--------|------|
| `daily`/`weekly`/`monthly` | Rotation interval |
| `rotate N` | Number of generations to keep |
| `compress` | gzip compression |
| `size` | Rotate by size |
| `create` | Permissions and owner of the new file |
| `postrotate`...`endscript` | Command after rotation |

```bash
logrotate -d /etc/logrotate.d/myapp   # Debug (does not actually run, predicts behavior)
logrotate -f /etc/logrotate.d/myapp   # Force an immediate rotation
```

**Exam interpretation**: `weekly` + `rotate 4` + `compress` = rotate every week, keep the latest 4 (about 4 weeks) compressed, delete the excess. Size-based is `size`, interval-based is `daily/weekly`.

## TCP Wrapper: Per-Service Access Control

- Above the firewall layer, services that use libwrap (sshd, vsftpd, etc.) control access with two files.

```text
# /etc/hosts.allow  (checked first, allowed on match)
sshd: 192.168.1.0/24
vsftpd: 192.168.1.10

# /etc/hosts.deny   (checked next, denied on match)
ALL: ALL
```

- The check order is **hosts.allow (allow) → hosts.deny (deny) → if neither matches, allow by default**.
- The syntax is `service : host`, and the keywords `ALL`/`LOCAL`/`EXCEPT` are used.

| Keyword | Meaning |
|--------|------|
| `ALL` | All services/hosts |
| `LOCAL` | Local hosts with no dot (.) |
| `EXCEPT` | Specify an exception |

**Order changes the result**: allow takes priority over deny. The security standard is to put `ALL: ALL` in `hosts.deny` and whitelist only the targets to allow in `hosts.allow`. If both are empty, everything is allowed.

## Firewall and Security Tasks at a Glance

| Task | iptables | firewalld | Caution |
|------|----------|-----------|------|
| Allow a port | `-A INPUT -p tcp --dport N -j ACCEPT` | `--permanent --add-port=N/tcp` | Direction, protocol |
| Block | `-j DROP`/`REJECT` | `--remove-service` | DROP = no response |
| Save | `service iptables save` | `--permanent --reload` | Prevent volatility |
| Policy | `-P INPUT DROP` | Zone default | Allow SSH first |

## Try It Yourself

```bash
# Firewall status at a glance
iptables -L -n -v --line-numbers
firewall-cmd --list-all

# SELinux status and context
getenforce
ls -Z /var/www/html 2>/dev/null

# Preview log settings (no actual rotation)
logrotate -d /etc/logrotate.conf 2>&1 | head -20
```

Lab tasks ultimately ask for **exact options and directives**. One direction, one type, one `--reload` decides pass or fail.

## 📖 Glossary

- **netfilter** : The packet filtering engine built into the kernel. Both iptables and firewalld manipulate it.
- **Chains (INPUT/OUTPUT/FORWARD)** : Sets of rules applied respectively to packets coming into the server, leaving the server, and passing through the server.
- **-A / -I** : Append a rule to the end of the chain / insert it at the very front. Since matching stops at the first hit, position changes the result.
- **DROP / REJECT** : Silently discard without a reply / send a rejection reply to notify immediately.
- **zone** : A rule set that firewalld groups by trust level. Interfaces or sources are assigned to it.
- **--permanent / --reload** : The option that saves a setting permanently to a file / the command that applies that permanent configuration to the current session.
- **rich rule** : An extended rule in firewalld for fine-grained specification combining source, service, and action.
- **SELinux context** : The `user:role:type:level` label attached to files and processes. The verdict depends on the **type**.
- **chcon / restorecon / semanage fcontext** : Temporarily change a context / restore per policy / register permanently in policy.
- **SELinux boolean** : An on/off switch that enables or disables a specific feature. Change it permanently with `setsebool -P`.
- **facility / priority** : The classification of the log's source / the severity of the message. rsyslog splits logs using this pair.
- **.none / .=** : rsyslog notation meaning exclude that facility from recording / record exactly that level only.
- **rotate N** : The number of previous log generations logrotate keeps. The excess is deleted.
- **hosts.allow / hosts.deny** : TCP Wrapper's allow and deny lists. allow is checked first, and if neither matches, access is allowed.

## 📝 Practice Questions

**Question 1.** Which iptables command allows incoming TCP connections to port 22 (SSH) from outside?

A) iptables -A OUTPUT -p tcp --sport 22 -j ACCEPT
B) iptables -A INPUT -p tcp --dport 22 -j ACCEPT
C) iptables -A FORWARD -p udp --dport 22 -j ACCEPT
D) iptables -P INPUT -p tcp --dport 22 -j DROP

**Answer: B**

Explanation: It is a connection coming into the server, so the chain is `INPUT`, the protocol is TCP, the destination port is `--dport 22`, and the action is `-j ACCEPT`. A has the wrong direction with OUTPUT/sport, C is wrong with FORWARD/udp, and D wrongly combines a port with the policy (-P) and uses DROP (block).

---

**Question 2.** While managing a server over remote SSH, you want to change the firewall default policy to DROP. What is the correct order of operations?

A) Run `-P INPUT DROP` first, then allow SSH
B) Add the SSH (22) allow rule first, then run `-P INPUT DROP`
C) The order does not matter
D) Clear everything with `-F`, then run only `-P INPUT DROP`

**Answer: B**

Explanation: If you change the default policy to DROP first, all input, including the current SSH session, is blocked immediately and the remote connection drops. So you must add the port 22 ACCEPT rule first to protect yourself and then change the policy to DROP. D blocks without allowing SSH and drops the same way.

---

**Question 3.** How do you allow the http service in firewalld so that it persists after reboot and takes effect immediately?

A) firewall-cmd --add-service=http
B) firewall-cmd --permanent --add-service=http, then firewall-cmd --reload
C) Run only firewall-cmd --permanent --add-service=http
D) firewall-cmd --reload, then firewall-cmd --add-service=http

**Answer: B**

Explanation: You must save permanently with `--permanent` and then apply to the current session with `--reload` to get "permanent + immediate." A disappears at reboot, C does not apply right now, and D has the order reversed so the addition is never made permanent.

---

**Question 4.** Which SELinux mode only logs policy violations without blocking them?

A) Enforcing
B) Permissive
C) Disabled
D) Targeted

**Answer: B**

Explanation: `Permissive` allows policy-violating actions but only records logs (AVC denials), and is used for debugging. `Enforcing` is block + log, and `Disabled` is fully off. `Targeted` is not a mode but a policy type.

---

**Question 5.** Which command restores a file's SELinux context to the default per policy?

A) chcon
B) restorecon
C) setenforce
D) getsebool

**Answer: B**

Explanation: `restorecon` returns files to the default context defined in the system policy. `chcon` directly and temporarily assigns a context, `setenforce` switches the mode, and `getsebool` reads booleans. To change it permanently, register it with `semanage fcontext` and then apply `restorecon`.

---

**Question 6.** In rsyslog.conf, which is the correct meaning of `mail.none`?

A) Records all messages of the mail facility
B) Excludes the mail facility's messages from that destination
C) Records only the none level of mail
D) Sends the messages of all facilities to mail

**Answer: B**

Explanation: `.none` means **exclude** that facility from the destination file (for example, removing mail logs from messages). All levels are `.*`, and exactly one level is specified with `.=level`. none is an exclusion keyword, not a priority value.

---

**Question 7.** What is the correct behavior of the logrotate settings `weekly`, `rotate 4`, `compress`?

A) Rotates daily and keeps 4 without compression
B) Rotates weekly, keeps the latest 4 (about 4 weeks) compressed, and deletes the excess
C) Rotates when the log exceeds 4MB
D) Rotates only once every 4 weeks

**Answer: B**

Explanation: `weekly` rotates every week, `rotate 4` keeps the latest 4 generations (deleting the oldest when exceeded), and `compress` gzip-compresses rotated logs. So about 4 weeks' worth is kept compressed. Size-based rotation requires the `size` directive.

---
