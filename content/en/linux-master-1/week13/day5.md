# Day 5 - Network and Service Lab Mock Exam + Wrong-Answer Notes

## 📌 Key Takeaways

- This week's axis is **network and service lab tasks**: address configuration (Day 1), service config directives (Day 2), shell scripts (Day 3), and security (Day 4).
- Today we compress the week into a **12-question mock exam** for review. The explanations are wrong-answer notes that also point out why the other choices are traps.
- In lab tasks, **a single character (option, directive, direction) decides pass or fail**. Partial credit is stingy here.
- Three of the four choices are traps with one wrong direction, option, or spelling, so the **elimination method of finding the error and crossing it out** is fast.
- When you read a question, recall in order: ① which area is it, ② **temporary or persistent**, ③ which file or command.

## Quick Review of This Week's Essentials

- **Network configuration** : Separate temporary (`ip addr add`/`ip route add`) from persistent (`BOOTPROTO`/`ONBOOT=yes`/`IPADDR` in `ifcfg-*`, `nmcli con`).
- With nmcli, you must reactivate with `con up` after modifying for it to take effect.
- The diagnostic ladder is `ip a → ping gw → ping 8.8.8.8 → dig`. For port checks, use `ss -tuln`.
- **Service config files** : httpd `DocumentRoot`/`Listen`, named `type master` + SOA `Serial` + records (A/MX/CNAME/PTR).
- dhcpd `range`/`fixed-address`, vsftpd `anonymous_enable`/`chroot_local_user`, smb.conf `path`/`writable`.
- exports: no space before the parenthesis and `root_squash`; sshd: `PermitRootLogin no`.
- **Shell scripts** : no spaces around the assignment `=`, spaces inside the brackets of `if [ -gt/-eq/-f/-d ]`, `for/while/case` (done/done/esac).
- Call functions without parentheses, and memorize `$(...)`, `$?`, `while read ... done < file`, and `sort|uniq -c|sort -rn` as patterns.
- **Security** : iptables direction (INPUT/OUTPUT/FORWARD), `-A/-I/-P/-j`, ACCEPT/DROP/REJECT, `service iptables save`.
- firewalld: `--permanent` then `--reload`; SELinux: modes and `chcon`/`restorecon`.
- rsyslog: `facility.priority` (`.none`/`.=`); logrotate: `rotate N`/`compress`.

> 💡 **Pass signal**: Lab tasks ask for "the exact command/directive that does this." If the direction, options, and spelling are exact, you are right; if even one is wrong, it is zero points.

> 🔍 **Solving strategy**: When you read a question, recall in order ① which area (network/service/script/security), ② temporary or persistent, ③ which file or command. Since three of the four choices are traps with one wrong direction, option, or spelling, the elimination method of **finding the error and crossing it out** is faster than picking the answer.

## 📖 Glossary

- **Temporary / persistent configuration** : Configuration that disappears at reboot (`ip`) / configuration that remains in a file and persists (`ifcfg-*`, `nmcli con`).
- **ONBOOT** : The directive in `ifcfg-*` that decides whether the interface is brought up automatically at boot. If it is not `yes`, it does not come up.
- **Diagnostic ladder** : A method of breaking things down in the order IP → gateway → external IP → domain to narrow down where it is blocked.
- **SOA Serial** : The version number of the zone data. It must be raised so the secondary (slave) server picks up the change.
- **exports whitespace trap** : An NFS syntax trap where a space between the client and the parenthesis opens the options to all hosts.
- **PermitRootLogin** : The directive that decides whether root may log in directly over SSH. Blocking is `no`.
- **`done < file`** : The redirection that attaches input so `while read` reads the file line by line. It goes after `done`.
- **`--permanent` + `--reload`** : The two steps in firewalld of saving permanently and then applying to the current session. Doing only one is half the job.
- **SELinux context** : The label attached to files and processes. If permissions are right but access is blocked, suspect this.
- **facility.priority** : The "source.severity" pair rsyslog uses to split logs. `.none` excludes, `.=` means only that level, and the default is that level and above.

## 📝 Practice Questions

**Question 1.** Which command combination temporarily assigns the address 192.168.0.50/24 to eth0 and sets the default gateway to 192.168.0.1?

A) ip addr add 192.168.0.50/24 dev eth0; ip route add default via 192.168.0.1
B) ip addr set 192.168.0.50 eth0; route default 192.168.0.1
C) ip link add 192.168.0.50/24 eth0; ip route default 192.168.0.1
D) ifconfig eth0 192.168.0.50; ip route add 192.168.0.1 default

**Answer: A**

Explanation: The correct syntax is `ip addr add address/prefix dev interface` for the address and `ip route add default via gateway` for the default route. In B, `set` is not an ip addr action; in C, `ip link` is for the interface itself; and in D the gateway and default are in reversed order.

---

**Question 2.** In the `ifcfg-eth0` file, which combination of directives uses a static IP and makes the interface activate automatically even after a reboot?

A) BOOTPROTO=dhcp, ONBOOT=no
B) BOOTPROTO=static, ONBOOT=yes
C) BOOTPROTO=auto, ONBOOT=yes
D) BOOTPROTO=static, ONBOOT=no

**Answer: B**

Explanation: A static IP is `BOOTPROTO=static` (or none), and automatic activation at boot is `ONBOOT=yes`. A is DHCP with auto-activation off, the `auto` in C is an nmcli value and not a BOOTPROTO value in ifcfg, and D has `ONBOOT=no` so the interface does not come up after a reboot.

---

**Question 3.** `ping 8.8.8.8` succeeds but `ping www.example.com` fails. Which file should you check?

A) /etc/hosts.allow
B) /etc/resolv.conf
C) /etc/sysconfig/iptables
D) /etc/exports

**Answer: B**

Explanation: IP reachability is fine and only the domain fails, so it is a name resolution (DNS) problem. The nameserver is defined in the `nameserver` entries of `/etc/resolv.conf`, so check that. `hosts.allow` is TCP Wrapper access control, `iptables` is the firewall, and `exports` is the NFS share configuration, none of which relate to name resolution.

---

**Question 4.** After editing a BIND zone file, what must you do to propagate the change to the secondary (slave) server?

A) Lower the Refresh value to 0
B) Increase the SOA Serial value
C) Increase the Expire value
D) Set the TTL to 0

**Answer: B**

Explanation: The slave compares the master's SOA `Serial` and fetches a zone transfer if it is larger than its own. So after editing you must increase the Serial for the change to propagate. Refresh/Expire/TTL are the refresh interval, expiry, and cache time, and adjusting them does not directly trigger change detection.

---

**Question 5.** Among the following `/etc/exports` entries, which is the faulty setting that unintentionally opens rw to all hosts?

A) /data 192.168.1.0/24(rw,sync)
B) /data 192.168.1.0/24 (rw,sync)
C) /data 192.168.1.10(ro)
D) /data *(ro)

**Answer: B**

Explanation: If there is a space between the client and the parenthesis, NFS interprets it as two entries, "default options for 192.168.1.0/24" and "rw,sync for all hosts (*)," which opens writes to everyone. A, C, and D are written correctly with no space (D intentionally gives ro to everyone).

---

**Question 6.** Which `sshd_config` setting blocks direct remote login by root on an SSH server?

A) PermitRootLogin yes
B) PermitRootLogin no
C) PasswordAuthentication no
D) PermitEmptyPasswords no

**Answer: B**

Explanation: `PermitRootLogin no` blocks direct SSH login by root. `yes` allows it, `PasswordAuthentication no` turns off password authentication itself (forcing key authentication), and `PermitEmptyPasswords no` blocks empty passwords, a different purpose from blocking root login.

---

**Question 7.** In the following shell script fragments, which line has a syntax error?

A) name="linux"
B) if [ "$count" -gt 5 ]; then
C) for i in 1 2 3; do
D) total = $((a + b))

**Answer: D**

Explanation: There must be no spaces around the `=` of a variable assignment, so it should be written `total=$((a + b))`. D has spaces as in `total = ...`, so `total` is interpreted as a command and causes an error. A is a correct assignment, B is a correct if (spaces inside brackets are fine), and C is a correct for.

---

**Question 8.** Which is the correct blank for a script that reads the file `users.txt` line by line to create user accounts?
`while read u; do useradd "$u"; done ____ users.txt`

A) > users.txt
B) < users.txt
C) | users.txt
D) >> users.txt

**Answer: B**

Explanation: You must redirect input with `done < file` so the file is fed to `read` line by line. `>`/`>>` are output (overwrite/append) and would actually empty or ruin the file, and `|` is a pipe that cannot take a file name directly. The idiom for reading a file is `while read ... done < file`.

---

**Question 9.** Which iptables command allows only incoming TCP connections to port 443 (HTTPS) from outside?

A) iptables -A OUTPUT -p tcp --sport 443 -j ACCEPT
B) iptables -A INPUT -p tcp --dport 443 -j ACCEPT
C) iptables -A FORWARD -p udp --dport 443 -j DROP
D) iptables -P INPUT -p tcp --dport 443 -j ACCEPT

**Answer: B**

Explanation: It is a connection coming into the server, so `INPUT`, TCP, destination port `--dport 443`, and `-j ACCEPT`. A has the wrong direction with OUTPUT/sport, C is wrong with FORWARD/udp/DROP, and D wrongly combines a port condition with the policy (-P) (a policy specifies only a single default action).

---

**Question 10.** How do you allow port 8080/tcp in firewalld so that it persists after reboot and takes effect immediately?

A) Run only firewall-cmd --add-port=8080/tcp
B) firewall-cmd --permanent --add-port=8080/tcp, then firewall-cmd --reload
C) Run only firewall-cmd --permanent --add-port=8080/tcp
D) firewall-cmd --add-service=8080 --reload

**Answer: B**

Explanation: Save permanently with `--permanent` and then apply to the current session with `--reload` to get "permanent + immediate." A disappears at reboot, C does not apply right now, and D wrongly specifies a port as if it were a service name (a port uses the `--add-port=8080/tcp` format).

---

**Question 11.** "File permissions (rwx) are correct, but the web server cannot access a certain directory. After `setenforce 0`, access works." What is the most appropriate permanent fix?

A) Permanently disable SELinux by setting it to Disabled
B) Apply the correct context with restorecon or semanage fcontext
C) Open all permissions with chmod 777
D) Block port 80 in the firewall

**Answer: B**

Explanation: If `setenforce 0` (Permissive) fixes it, it is an SELinux context problem. In production, do not turn SELinux off; the standard is to apply the correct type with `restorecon` (restore the default context) or by registering with `semanage fcontext`. A is a workaround that gives up security, C dangerously opens things up when it is not even a permissions problem, and D is irrelevant.

---

**Question 12.** Which is the correct description of the logrotate settings `daily`, `rotate 7`, `compress`?

A) Rotates weekly and keeps 7
B) Rotates daily, keeps the latest 7 (about one week) compressed, and deletes the excess
C) Rotates when the log exceeds 7MB
D) Rotates once every 7 days without compression

**Answer: B**

Explanation: `daily` rotates every day, `rotate 7` keeps the latest 7 generations (deleting the oldest when exceeded), and `compress` gzip-compresses rotated logs. So about one week's worth is kept compressed. Size-based rotation is `size`, and daily means rotating every day, not once every 7 days.

---

## Summary of Easy-to-Miss Traps

I gathered the traps that mock exams catch most often into one table. Reviewing just this table right before the exam is also fine.

| Trap | Answer / Caution |
|------|------------|
| `ip addr` vs `ip route` | Address is addr add, route is route add default via |
| Temporary vs persistent | ip = volatile, ifcfg `ONBOOT=yes`/nmcli con = persistent |
| Applying nmcli | After modify, you must `con up` for it to take effect |
| ping IP succeeds, domain fails | DNS (`/etc/resolv.conf`) problem |
| SOA Serial | Must be increased whenever the zone is edited |
| exports whitespace | No space between `client(options)` |
| Variable assignment | No spaces around `=` |
| if condition | Spaces required inside `[ ` and ` ]`, numeric `-gt`/string `=` |
| Reading a file | `while read ... done < file` |
| iptables direction | Incoming is INPUT, outgoing is OUTPUT |
| iptables policy change | If remote, allow SSH first |
| Applying firewalld | `--permanent` then `--reload` |
| SELinux access denied | Suspect context → `restorecon` |
| rsyslog | `.none` = exclude, `.=` = exactly, `.level` = and above |
| logrotate | `rotate N` = number of generations, interval is daily/weekly |

> ⚠️ **Exam-room mindset**: Partial credit in lab tasks is stingy. One direction (INPUT/OUTPUT), one space, or one missing `--reload` makes the whole answer wrong. After writing a command, run it once in your head and double-check "what exactly happens if I execute this?"

## Wrap-Up

We compressed the week into 12 questions. The core of network lab tasks is **telling temporary from persistent** (`ip` is volatile, `ifcfg ONBOOT=yes`/`nmcli con` is persistent) and **layer-by-layer diagnosis** (IP works but the domain fails = DNS). Service configuration is a battle of memorizing **1:1 directive mappings** (DocumentRoot, SOA Serial, range, PermitRootLogin no, the exports whitespace trap) with exact spelling. For scripts, **syntactic rigor** (no spaces around `=`, spaces inside brackets, `done < file`) is vital, and in security, **direction, options, `--reload`, and context** decide pass or fail. Revisit the questions you missed until you can explain in words "what is wrong and why" for each choice. A lab exam is a test of writing exactly what you know.
