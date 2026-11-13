# Day 2 - Configuration File Paths and Key Directives: Precise Memorization for Fill-in-the-Blank Questions

## 📌 Key Points

- The second hurdle of the practical exam is **filling in blanks in configuration files**. One wrong path, one wrong field order, or one misspelled directive costs you the points.
- Field counts of the three core account files: **passwd 7 / shadow 9 / group 4**. In shadow, the 4th field is the minimum change interval and the **5th is the maximum number of days of use**.
- `/etc/fstab` has **6 fields**. The 5th is the dump backup flag, and the **6th is the fsck check order** (root=1, others=2, no check=0).
- The crontab time fields are **minute-hour-day-month-weekday**. Only `/etc/crontab` has an additional field for the user to run as.
- Write kernel parameters in `/etc/sysctl.conf` and apply them with **`sysctl -p`**. Default password policy for new accounts is set by the `PASS_*` directives in `/etc/login.defs`.
- Networking: the static name-to-IP mapping is `/etc/hosts`, and DNS servers are specified with `nameserver` in `/etc/resolv.conf`.

## The Three Core Account Management Files: passwd / shadow / group

- Linux user account information is split across three files.
- You must memorize the paths and field structures as a whole.

```bash
# /etc/passwd - basic user account info (7 colon-separated fields)
root:x:0:0:root:/root:/bin/bash
#  1 2 3 4  5    6      7
# 1.username 2.password (x = uses shadow) 3.UID 4.GID
# 5.description (GECOS) 6.home directory 7.login shell
```

| Field | Meaning in /etc/passwd |
|------|------------------|
| 1 | User name (login name) |
| 2 | Password placeholder (usually `x`; the real password is in shadow) |
| 3 | UID (user ID, root=0) |
| 4 | GID (primary group ID) |
| 5 | Description/GECOS (name, phone, etc.) |
| 6 | Home directory path |
| 7 | Login shell (`/bin/bash`; use `/sbin/nologin` to block login) |

```bash
# /etc/shadow - encrypted password + policy (9 colon-separated fields)
alice:$6$xyz...:19700:0:90:7:14::
#  1     2        3   4  5 6  7  8 9
# 1.username 2.encrypted password 3.last change date (days since 1970)
# 4.minimum days 5.maximum days 6.warning days
# 7.inactivity days 8.account expiration date 9.reserved field
```

| Field | Meaning in /etc/shadow |
|------|------------------|
| 1 | User name |
| 2 | Encrypted password (`*`/`!` = locked) |
| 3 | Last password change date (days since the epoch) |
| 4 | Minimum change interval (days) |
| 5 | Maximum days of use (until expiry) |
| 6 | Warning days before expiry |
| 7 | Grace (inactive) days after expiry |
| 8 | Account expiration date |
| 9 | Reserved (unused) |

`/etc/passwd` has **7 fields** and `/etc/shadow` has **9 fields**. The second field `x` in passwd indicates "the real password is in shadow". UID 0 is always root.

```bash
# /etc/group - group info (4 colon-separated fields)
staff:x:1001:alice,bob
#  1   2  3     4
# 1.group name 2.group password (x) 3.GID 4.group members (comma-separated)

# /etc/gshadow - encrypted group info
```

> ⚠️ **Trap**: The 5th field of shadow is the "maximum days of use" and the 4th is the "minimum change interval". If you memorize the order the wrong way around, you will get the fill-in-the-blank wrong. Also, if the 7th field (shell) of `/etc/passwd` contains `/sbin/nologin` or `/bin/false`, it means the account is blocked from logging in.

`$6$` in the 2nd field of shadow means a SHA-512 hash. `$1$` is MD5, `$5$` is SHA-256, and `$6$` is SHA-512. If the field starts with `*` or `!`, that account's password login is locked.

## Disk Mount File: /etc/fstab

- `/etc/fstab` defines the filesystems to be mounted automatically at boot.
- The order of its **6 fields** is tested.

```bash
# /etc/fstab - automatic mount configuration (space/tab separated, 6 fields)
/dev/sda1   /        ext4    defaults        0 1
UUID=abc... /home    ext4    defaults        0 2
/dev/sdb1   /data    xfs     defaults,noatime 0 2
/swapfile   none     swap    sw              0 0
tmpfs       /tmp     tmpfs   defaults        0 0
```

| Field | Meaning in /etc/fstab | Example |
|------|-----------------|------|
| 1 | Device or UUID/LABEL | `/dev/sda1`, `UUID=...` |
| 2 | Mount point | `/home` |
| 3 | Filesystem type | `ext4`, `xfs`, `swap` |
| 4 | Mount options | `defaults`, `noatime`, `ro` |
| 5 | dump backup flag (0=no) | `0` or `1` |
| 6 | fsck check order (0=no check, 1=root, 2=others) | `0`/`1`/`2` |

The **6th field of fstab is the fsck check order**. The root filesystem (`/`) must be `1`, others are `2`, and anything not to be checked is `0`. The **5th field is the dump backup flag**. It is easy to mix up the meanings of these two numeric fields.

The mount option `defaults` bundles `rw,suid,dev,exec,auto,nouser,async`. `ro` (read-only), `noexec` (no execution), `nosuid` (ignore SetUID), and `noatime` (do not record access time, better performance) are used often. For swap, use `sw` in options and `swap` as the type.

## Job Scheduling: crontab-Related Files

```bash
# System crontab
/etc/crontab              # system-wide cron configuration (has a user field)
/etc/cron.d/              # directory of additional cron job fragment files
/etc/cron.daily/          # scripts run daily
/etc/cron.hourly/         # scripts run hourly
/etc/cron.weekly/         # scripts run weekly
/etc/cron.monthly/        # scripts run monthly
/var/spool/cron/         # where per-user crontabs are stored
/etc/cron.allow           # list of users allowed to use cron
/etc/cron.deny            # list of users denied use of cron
```

- A crontab line consists of **5 time fields + a command**.

```bash
# minute hour day month weekday [user] command
# *  *  *  *  *
# │  │  │  │  └─ weekday (0-7, 0 and 7 = Sunday)
# │  │  │  └──── month (1-12)
# │  │  └─────── day (1-31)
# │  └────────── hour (0-23)
# └───────────── minute (0-59)

30 2 * * *    /backup.sh           # every day at 02:30
0 */6 * * *   /check.sh            # every 6 hours
0 0 1 * *     /monthly.sh          # 00:00 on the 1st of every month
*/10 * * * *  /poll.sh             # every 10 minutes
0 9 * * 1-5   /report.sh           # weekdays (Mon-Fri) at 09:00
```

The crontab time field order is **minute-hour-day-month-weekday**. `/etc/crontab` (for the system) has an additional **user to run as** field after the 5 time fields, but a user's personal crontab (`crontab -e`) has no user field. This difference is easy to confuse.

> ⚠️ **Trap**: `*/10 * * * *` means "every 10 minutes", while `10 * * * *` means "once an hour at minute 10". With a slash (`/`) it is an interval (every); without one it runs at a fixed time. For weekday, both 0 and 7 mean Sunday.

## Kernel Parameters: /etc/sysctl.conf

- `/etc/sysctl.conf` defines kernel parameters to be applied at boot.
- It maps one-to-one to the values under `/proc/sys/`.

```bash
# /etc/sysctl.conf example
net.ipv4.ip_forward = 1                  # IP forwarding (router/NAT)
net.ipv4.icmp_echo_ignore_all = 1        # block ping replies
kernel.hostname = server01               # hostname
vm.swappiness = 10                       # how aggressively swap is used
fs.file-max = 100000                     # maximum number of file handles

# Apply commands
sysctl -p                # re-read /etc/sysctl.conf and apply
sysctl -a                # print all current kernel parameters
sysctl net.ipv4.ip_forward   # query a specific value
sysctl -w net.ipv4.ip_forward=1   # set immediately (runtime)
```

To build a router/NAT, put `net.ipv4.ip_forward = 1` in `/etc/sysctl.conf` and apply it with `sysctl -p`. `sysctl -p` means "re-read the configuration file". `echo 1 > /proc/sys/net/ipv4/ip_forward` has the same effect but disappears after a reboot.

## Default Password Policy: /etc/login.defs

- Defines the default password policy applied when creating new accounts, along with the UID/GID ranges.

```bash
# Key directives in /etc/login.defs
PASS_MAX_DAYS   90        # maximum days a password can be used
PASS_MIN_DAYS   0         # minimum interval between password changes
PASS_MIN_LEN    8         # minimum password length
PASS_WARN_AGE   7         # days of warning before expiry
UID_MIN         1000      # start of regular user UIDs
UID_MAX         60000     # end of regular user UIDs
GID_MIN         1000      # start of regular group GIDs
CREATE_HOME     yes       # automatically create the home directory
UMASK           022       # default umask
```

| Directive | Meaning |
|--------|------|
| `PASS_MAX_DAYS` | Maximum days of password use (until expiry) |
| `PASS_MIN_DAYS` | Minimum interval between password changes |
| `PASS_WARN_AGE` | Days before expiry when warnings start |
| `UID_MIN`/`UID_MAX` | Range of regular user UIDs |

`login.defs` sets the **defaults for newly created accounts**. To change the policy of an existing account, use the `chage` command. For example: `chage -M 60 alice` (change alice's maximum days of use to 60). The trap is that editing login.defs is not applied retroactively to existing users.

## Network Configuration Files

```bash
/etc/hosts            # static IP-hostname mapping (can be consulted before DNS)
/etc/resolv.conf      # specifies DNS servers (nameserver)
/etc/nsswitch.conf    # name lookup order (hosts: files dns)
/etc/hostname         # system hostname
/etc/host.conf        # auxiliary name resolution order settings
/etc/services         # port-to-service name mapping (80=http, etc.)
/etc/protocols        # protocol number mapping
```

```bash
# /etc/resolv.conf
nameserver 8.8.8.8
nameserver 168.126.63.1
search example.com
domain example.com

# /etc/hosts
127.0.0.1   localhost
192.168.0.10  server01 web
```

The file that specifies DNS servers is `/etc/resolv.conf`, and its directive is `nameserver`. The file that maps IPs directly to names is `/etc/hosts`. The two are easy to confuse. The lookup order (files first or DNS first) is decided on the `hosts:` line of `/etc/nsswitch.conf`.

## Path and Directive Short-Answer Memorization Cards

| Task/Item | Path or directive |
|-----------|-----------------|
| Basic user account info | `/etc/passwd` (7 fields) |
| Encrypted passwords and policy | `/etc/shadow` (9 fields) |
| Group info | `/etc/group` (4 fields) |
| Automatic mount configuration | `/etc/fstab` (6 fields) |
| fsck check order in fstab | 6th field (root=1) |
| System cron configuration | `/etc/crontab` |
| Per-user crontab storage | `/var/spool/cron/` |
| Persistent kernel parameter settings | `/etc/sysctl.conf` |
| Apply sysctl settings | `sysctl -p` |
| Default maximum password age | `PASS_MAX_DAYS` (login.defs) |
| Static IP-hostname mapping | `/etc/hosts` |
| Specify DNS servers | `/etc/resolv.conf` (nameserver) |
| Port-to-service name mapping | `/etc/services` |
| Block login via the shell | `/sbin/nologin` |

## Try It Yourself

```bash
# Open the real files to get used to the field structure
cat /etc/passwd | head -5      # verify 7 fields
sudo cat /etc/shadow | head -3 # verify 9 fields (root privileges required)
cat /etc/group | head -5       # verify 4 fields
cat /etc/fstab                 # verify 6 fields
cat /etc/resolv.conf           # check nameserver

# Check/change policy
grep PASS /etc/login.defs      # default password policy
sudo chage -l alice            # alice's current password policy (if she exists)

# Query sysctl
sysctl net.ipv4.ip_forward
```

Open the files with `cat` yourself and look at the real contents to get a feel for field positions. Tomorrow, building on this knowledge, we cover task-style questions where you actually perform disk, LVM, and permission work.

## 📖 Glossary

- **/etc/passwd** : The 7-field file holding basic user account information. The 2nd field `x` indicates "the real password is in shadow".
- **UID / GID** : User number / group number. UID 0 is always root.
- **GECOS** : The 5th field of `/etc/passwd`. It holds a human-readable description such as name or phone.
- **/etc/shadow** : The 9-field file holding encrypted passwords and expiry policy. Regular users cannot read it.
- **/sbin/nologin** : A special shell placed in the login shell field to block that account's login. `/bin/false` serves the same purpose.
- **/etc/fstab** : The 6-field file that defines filesystems to mount automatically at boot.
- **dump field** : The 5th field of fstab. It marks with 0/1 whether the filesystem is a backup target.
- **fsck order** : The 6th field of fstab. The check order at boot: root is 1, others are 2, excluded from checking is 0.
- **crontab time fields** : Five fields in the order minute-hour-day-month-weekday. `*/N` means every N, and a plain number means a fixed time.
- **sysctl -p** : The command that re-reads `/etc/sysctl.conf` and applies kernel parameters.
- **PASS_MAX_DAYS** : The directive in `/etc/login.defs` that sets the maximum password age for new accounts. Existing accounts are changed with `chage`.
- **/etc/resolv.conf** : The file where the DNS servers to use are written with the `nameserver` directive.
- **/etc/nsswitch.conf** : The file that decides the lookup order: consult files (`files`) first or DNS first.

## 📝 Practice Questions

**Question 1.** What is the absolute path of the file that stores users' encrypted passwords and password expiry policy?

A) /etc/passwd
B) /etc/group
C) /etc/shadow
D) /etc/login.defs

**Answer: C**

Explanation: Encrypted passwords and expiry policy are stored in `/etc/shadow` (9 fields). `/etc/passwd` holds basic account info (7 fields), `/etc/group` holds groups, and `/etc/login.defs` holds the default policy values for new accounts.

---

**Question 2.** Which pair correctly matches the number of fields in `/etc/passwd` and the meaning of the 7th field?

A) 6 fields - home directory
B) 7 fields - login shell
C) 9 fields - login shell
D) 7 fields - home directory

**Answer: B**

Explanation: `/etc/passwd` consists of 7 colon-separated fields, and the 7th (last) field is the login shell. The home directory is the 6th field. 9 fields is `/etc/shadow`.

---

**Question 3.** In `/etc/fstab`, which field specifies the filesystem check (fsck) order at boot, and what is the value for the root filesystem?

A) 5th field, value 1
B) 6th field, value 0
C) 6th field, value 1
D) 5th field, value 0

**Answer: C**

Explanation: The 6th field of fstab is the fsck check order: root (/) is 1, other filesystems are 2, and anything not to be checked is 0. The 5th field is the dump backup flag.

---

**Question 4.** Which file to edit and which apply command are correct for enabling IP forwarding so that it persists after reboot?

A) Edit /proc/sys directly, reboot
B) Edit /etc/sysctl.conf, sysctl -p
C) Edit /etc/fstab, mount -a
D) Edit /etc/resolv.conf, sysctl -a

**Answer: B**

Explanation: For a persistent kernel parameter, put `net.ipv4.ip_forward = 1` in `/etc/sysctl.conf` and apply it with `sysctl -p`. Editing `/proc/sys` directly is lost on reboot, and `sysctl -a` is a query command.

---

**Question 5.** When does the crontab entry `30 4 * * 0 /backup.sh` run?

A) Every day at 04:30
B) Every Sunday at 04:30
C) At 04:00 on the 30th of every month
D) Every Monday at 04:30

**Answer: B**

Explanation: The field order is minute (30)-hour (4)-day (*)-month (*)-weekday (0). Weekday 0 is Sunday, so it runs every Sunday at 04:30. Weekday 1 is Monday.

---

**Question 6.** Which directive in `/etc/login.defs` sets the default maximum password age for newly created user accounts?

A) PASS_MIN_DAYS
B) PASS_WARN_AGE
C) PASS_MAX_DAYS
D) PASS_MIN_LEN

**Answer: C**

Explanation: `PASS_MAX_DAYS` specifies the maximum days of password use (days until expiry). `PASS_MIN_DAYS` is the minimum change interval, `PASS_WARN_AGE` is the expiry warning days, and `PASS_MIN_LEN` is the minimum length.

---

**Question 7.** Which file and directive correctly specify the DNS server address the system uses?

A) /etc/hosts, hostname
B) /etc/resolv.conf, nameserver
C) /etc/nsswitch.conf, dns
D) /etc/hosts, nameserver

**Answer: B**

Explanation: DNS servers are specified in the `/etc/resolv.conf` file with the `nameserver` directive. `/etc/hosts` is the static IP-hostname mapping, and `/etc/nsswitch.conf` is the file that sets the name lookup order.

---
