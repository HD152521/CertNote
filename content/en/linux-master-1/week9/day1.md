# Day 1 - DNS and BIND: The Internet's Phone Book That Turns Names into Addresses

## 📌 Key Takeaways

- **DNS is a huge distributed database, and queries flow along a chain of delegation** — root → TLD → authoritative server.
- Two query styles: **recursive** (client → local DNS, "take responsibility until the end") vs **iterative** (local DNS → upstream servers, "go ask over there next").
- Record roles: **A (IPv4) · AAAA (IPv6) · CNAME (alias) · MX (mail, lower number = higher priority) · NS (delegation) · PTR (reverse) · SOA (zone ID card)**.
- **You must bump the SOA Serial for secondary servers to pick up changes.** If you don't, the old data keeps being served — the number one DNS accident.
- BIND has a `named.conf` (global options + zone declarations) + zone file (the actual records) structure. **Whether a trailing dot is present** completely changes how a name is resolved.

## The DNS Hierarchy — A Tree Divided by Dots (.)

- A domain name is an **inverted tree read from right to left**.
- At the very end of `www.example.com.` there is an invisible dot (`.`), and that is the **root**.

```
.                          ← Root (13 root server groups worldwide)
└── com.                   ← TLD (Top-Level Domain)
    └── example.com.       ← Second-level domain (unit of registration and management)
        └── www.example.com.  ← Host (subdomain)
```

| Level | Name | Responsible party |
|------|------|------|
| Root | `.` | Root name servers (a~m.root-servers.net) |
| TLD | `com`, `net`, `org`, `kr` | Registry (Verisign for com) |
| Second-level | `example.com` | Domain owner (authoritative name server) |
| Host | `www`, `mail` | Individual services |

- Each level **delegates only the level directly below it**.
- The root only tells you "who manages com", and the com TLD server only tells you "who manages example.com".
- **The actual IP is held by the authoritative server at the very bottom.**

An FQDN (Fully Qualified Domain Name) is the complete name including the root dot at the very end. A trailing dot, as in `www.example.com.`, means "this is an absolute path — nothing more to append". In a zone file, the presence or absence of this one trailing dot completely changes the meaning, so you must use it consciously.

## Recursive vs Iterative Queries — Who Takes Responsibility to the End?

- DNS queries come in **two styles**, and exams ask you to tell them apart.

| Aspect | Recursive query | Iterative query |
|------|---------------------|---------------------|
| Who asks | Client → local DNS | Local DNS → upstream servers |
| Responsibility | The server asked is responsible for the final answer | Only gives a referral: "go ask the next server" |
| Result | Returns the finished IP | Returns NS delegation info |

- When a PC asks its local DNS (resolver), that is a **recursive query** — "go get the answer all the way and bring it back."
- The local DNS then follows the chain by sending **iterative queries** in the order root → TLD → authoritative server.

```
[PC] --recursive--> [Local DNS]
                  |--iterative--> [Root]   "com is over there"
                  |--iterative--> [com TLD] "example.com is over there"
                  |--iterative--> [Authoritative server] "www is 93.184.216.34"
[PC] <--final answer-- [Local DNS]
```

The local DNS keeps every answer it learns in a **cache**. The retention period is set by each record's **TTL (Time To Live, in seconds)** value. If the TTL is 3600, it answers from the cache for an hour without asking again. That is why, even after you change a domain's IP, it takes as long as the TTL to spread worldwide. The old (stale) answer that earlier servers hold in their caches is what we call "DNS propagation delay".

## DNS Record Types — The Parts That Fill a Zone File

- A zone file is a **collection of records (Resource Records)**.
- The practical exam asks short-answer questions that distinguish the role of each type.

| Record | Name | Role | Example |
|--------|------|------|------|
| A | Address | Hostname → IPv4 | `www  A  93.184.216.34` |
| AAAA | quad-A | Hostname → IPv6 | `www  AAAA  2606:2800:220:1::` |
| CNAME | Canonical Name | Alias → canonical name | `ftp  CNAME  www.example.com.` |
| MX | Mail eXchanger | Designates mail server (with priority) | `@  MX 10 mail.example.com.` |
| NS | Name Server | Authoritative name server for this zone | `@  NS  ns1.example.com.` |
| PTR | Pointer | IP → hostname (reverse) | `34  PTR  www.example.com.` |
| SOA | Start of Authority | Authority start and management info for the zone | (one at the very top of the zone) |
| TXT | Text | Arbitrary text (SPF, domain verification, etc.) | `@  TXT  "v=spf1 ..."` |

Memory anchors:

- **A is IPv4, AAAA is IPv6.** The letter count (1 A vs 4 A's) hints at the bit difference (32 bits vs 128 bits).
- **CNAME is an alias.** It points out that `ftp` is really `www`. However, you cannot place another record on the name a CNAME is defined for, and in particular you cannot use a CNAME at the top of the domain (`@`).
- **MX carries a priority number.** The **lower the number, the higher the priority** (tried first). `MX 10` comes before `MX 20`.
- **PTR is for reverse lookups only.** You give an IP and get a name back. It is used for spam blocking and log analysis.

> ⚠️ **Trap**: You cannot place another record (A, MX, etc.) of the same name alongside a CNAME record. Also, you cannot place a CNAME at the top of the domain (zone apex, `@`) — because SOA and NS must be in that spot. A choice saying "make the main domain example.com a CNAME" is a wrong trap option.

## The SOA Record — The Zone's ID Card and Refresh Rules

- Every zone file starts with **exactly one SOA record**.
- What SOA defines: the authoritative server for this zone, and **when** secondary servers should refresh.
- Memorizing the **five timer fields** is the key to the practical exam.

```dns
$TTL 86400
@   IN  SOA  ns1.example.com. admin.example.com. (
            2026060501  ; Serial   (serial number: increase on every change)
            3600        ; Refresh  (how often the secondary checks for changes, in seconds)
            900         ; Retry    (retry interval when a check fails, in seconds)
            1209600     ; Expire   (how long until the secondary discards data if the primary is unreachable, in seconds)
            86400 )     ; Minimum  (negative caching TTL, in seconds)
```

| Field | Meaning |
|------|------|
| MNAME | Primary authoritative name server (`ns1.example.com.`) |
| RNAME | Administrator email. Written with `@` replaced by `.` (`admin.example.com.` = admin@example.com) |
| Serial | Serial number. **A secondary server re-fetches the zone only when this number has increased** |
| Refresh | How often the secondary asks the primary "anything changed?" |
| Retry | Interval before asking again when a Refresh fails |
| Expire | How long until the secondary throws away its data when the primary keeps not responding |
| Minimum | How long a negative response (nonexistent name) is cached |

Serial usually uses the date-based `YYYYMMDDnn` format (e.g. 2026060501 = the 1st revision on June 5, 2026). If an admin edits the zone and **forgets to increase the Serial**, the secondary server never learns of the change and keeps serving old data. This is a common cause of real operational accidents, which is why "if you edited it, bump the Serial first" is rule number one for DNS admins.

## Installing BIND and the Structure of named.conf

- The standard DNS server on Linux is **BIND (Berkeley Internet Name Domain)**, and **the daemon name is `named`**.

```bash
# Install (RHEL/CentOS family)
yum install bind bind-utils

# Config file locations
/etc/named.conf          # Main config (global options + zone declarations)
/var/named/              # Directory where zone files are placed

# Daemon control
systemctl start named
systemctl enable named

# Config syntax check (a must before saving!)
named-checkconf                    # Check named.conf
named-checkzone example.com /var/named/example.com.zone  # Check zone
```

- `named.conf` consists of **a global options block + zone declarations**.

```text
options {
    listen-on port 53 { any; };       # Listening interfaces
    directory "/var/named";           # Base directory for zone files
    allow-query { any; };             # Who is allowed to query
    recursion yes;                    # Whether to allow recursive queries
};

zone "example.com" IN {
    type master;                      # master (primary) or slave (secondary)
    file "example.com.zone";          # Forward zone file name
};

zone "1.168.192.in-addr.arpa" IN {    # Reverse zone
    type master;
    file "192.168.1.rev";
};
```

| Directive | Role |
|--------|------|
| `directory` | Base path where zone files are looked up (`/var/named`) |
| `allow-query` | Range of clients allowed to query |
| `recursion` | Whether to allow recursive queries. Public servers usually set `no` |
| `type master/slave` | Whether this server is the owner of the zone or a copy |
| `file` | Zone file name for that zone |

> ⚠️ **Trap**: `type master` is the primary server and `type slave` is the secondary server. A slave zone must also include `masters { primary-server-IP; };` to say where to fetch data from. Swapping master/slave, or leaving recursion as `yes` on an externally public server (an open resolver = abused for DDoS amplification), shows up as trap options.

## Forward Zone File — From Name to IP

`/var/named/example.com.zone`:

```dns
$TTL 86400
@   IN  SOA  ns1.example.com. admin.example.com. (
            2026060501 3600 900 1209600 86400 )

        IN  NS      ns1.example.com.
        IN  MX  10  mail.example.com.

ns1     IN  A       192.168.1.10
www     IN  A       192.168.1.20
mail    IN  A       192.168.1.30
ftp     IN  CNAME   www.example.com.
```

- **`@`** is shorthand that refers to the zone name itself (`example.com.`).
- **If the name column is blank, it inherits the name from the line above.**

In a zone file, if a name does not end with a dot (`www`), BIND automatically appends the zone name and interprets it as `www.example.com.` (this is called origin appending). Conversely, ending with a dot like `www.example.com.` makes it an absolute name as-is. It is safest to write the targets of CNAME, NS, and MX **as an FQDN with the trailing dot** — if you forget the trailing dot, the classic accident happens where the zone is appended twice, as in `mail.example.com.example.com.`.

## Reverse Zone File — From IP to Name (PTR)

- Reverse lookups use the special domain **`in-addr.arpa`**, in which the IP is written backwards.
- The reverse zone for `192.168.1.0/24` is **`1.168.192.in-addr.arpa`** — the IP octets are written in reverse order.

`/var/named/192.168.1.rev`:

```dns
$TTL 86400
@   IN  SOA  ns1.example.com. admin.example.com. (
            2026060501 3600 900 1209600 86400 )

        IN  NS  ns1.example.com.

10      IN  PTR ns1.example.com.
20      IN  PTR www.example.com.
30      IN  PTR mail.example.com.
```

- Here `20` means `20.1.168.192.in-addr.arpa`, which corresponds to IP `192.168.1.20`.
- The target (name) of a PTR record is **always written as an FQDN (with the trailing dot)**.

Reverse lookup is key to verifying mail server trustworthiness. A receiving mail server checks whether the sending IP's PTR resolves to a legitimate name, and treats the mail as spam if the PTR is missing or nonsensical. Another difference is that IPv4 uses `in-addr.arpa` while IPv6 uses `ip6.arpa`.

## Try It Yourself — DNS Lookup Tools

- Once you have finished the configuration, **verify with `dig`**. `dig` is the standard diagnostic tool included with BIND.

```bash
# Look up an A record
dig www.example.com A

# Look up an MX record
dig example.com MX

# Ask a specific DNS server directly
dig @192.168.1.10 www.example.com

# Reverse lookup (-x)
dig -x 192.168.1.20

# Trace mode: shows the chain from the root to the authoritative server
dig +trace www.example.com

# Simple lookups
nslookup www.example.com
host www.example.com
```

- When you run `dig +trace`, the **iterative query flow you learned earlier (root → TLD → authoritative server) unfolds right on your screen.** It is the best exercise for connecting theory with the real thing.

Tomorrow we raise the second pillar of network infrastructure services with DHCP, which distributes IPs automatically, and NTP, which synchronizes time.

## 📖 Glossary

- **FQDN** : A complete domain name with the root dot attached at the very end. With a trailing dot like `www.example.com.`, it is an absolute name.
- **TLD** : A top-level domain such as `com` or `kr`. Managed by a registry, which delegates everything below it.
- **Authoritative name server** : The server that actually holds the data for that zone. The end point of the delegation chain.
- **Recursive query** : A request of "go get the final answer yourself." The server asked takes responsibility to the end.
- **Iterative query** : A style that only returns a referral saying "ask that server next." The local DNS sends these to upstream servers.
- **TTL** : A value in seconds that sets how long that record is kept in cache. Even after you change the IP, the old answer remains for this long.
- **A / AAAA** : Records that map a hostname to an IPv4 / IPv6 address.
- **CNAME** : An alias record. You cannot place other records on its name, and it **cannot be used at the zone apex (`@`).**
- **MX priority** : The number placed before the mail server. **The lower it is, the earlier** it is tried.
- **PTR** : A reverse record that turns an IP back into a name. Used for verifying mail server trustworthiness.
- **SOA** : The zone's ID card. Holds the primary server, administrator email, and the Serial·Refresh·Retry·Expire·Minimum timers.
- **Serial** : The zone's serial number. **This value must increase for secondary servers to pick up changes.**
- **`in-addr.arpa` / `ip6.arpa`** : Special domains used for IPv4 / IPv6 reverse lookups.
- **Origin appending** : The behavior in a zone file of automatically attaching the zone name after a name with no trailing dot. If you forget the trailing dot, the zone is appended twice.
- **Open resolver** : A state where `recursion yes` is left on an externally public server. It is abused for DDoS amplification, so it must be avoided.

## 📝 Practice Questions

**Question 1.** Which DNS record maps a hostname to an IPv6 address?

A) A
B) AAAA
C) CNAME
D) PTR

**Answer: B**
Explanation: A maps IPv4 (32-bit) and AAAA (quad-A) maps IPv6 (128-bit) addresses. CNAME is an alias, and PTR is the IP→name reverse record.

---

**Question 2.** In an SOA record, which field is the criterion a secondary (slave) server uses to decide whether to fetch the zone data again?

A) Refresh
B) Retry
C) Serial
D) Expire

**Answer: C**
Explanation: A secondary server receives the zone again only when the primary's Serial (serial number) has become larger than the value it holds. If you edit the zone without increasing the Serial, the change is not propagated. Refresh is the check interval, Retry is the retry interval on failure, and Expire is the limit before the data is discarded.

---

**Question 3.** Which query style is used when a PC asks the local DNS server to "find out the answer all the way through"?

A) Iterative query
B) Recursive query
C) Authoritative query
D) Delegation query

**Answer: B**
Explanation: A recursive query is when the client asks the local DNS to take responsibility for the final answer. When the local DNS asks the root, TLD, and authoritative servers in turn, that is an iterative query.

---

**Question 4.** Given the MX records `@ MX 10 mail.example.com.` and `@ MX 20 backup.example.com.`, which server is tried first for mail?

A) backup.example.com (higher number wins)
B) mail.example.com (lower number wins)
C) Sent to both servers at the same time
D) Alphabetical order, mail first

**Answer: B**
Explanation: For the priority number of MX records, the lower number has priority. So mail.example.com with 10 is tried first, and if it fails, delivery moves on to backup with 20.

---

**Question 5.** In BIND's named.conf, which setting indicates that this server is the primary server holding the original of the zone?

A) `type master;`
B) `type slave;`
C) `type forward;`
D) `type hint;`

**Answer: A**
Explanation: `type master` is the primary server that holds the original zone data, and `type slave` is the secondary server that replicates from the primary. A slave must also specify the location of the original with `masters { IP; };`.

---

**Question 6.** What is the correct name of the reverse (PTR) zone for IP 192.168.1.20?

A) 192.168.1.in-addr.arpa
B) 1.168.192.in-addr.arpa
C) 20.1.168.192.in-addr.arpa
D) 192.168.1.20.ip6.arpa

**Answer: B**
Explanation: An IPv4 reverse zone lists the network octets in reverse order and appends `in-addr.arpa`. The zone name for the /24 network 192.168.1.0 is `1.168.192.in-addr.arpa`, and the host 20 inside it points to IP 192.168.1.20 through the PTR record `20`. ip6.arpa is for IPv6.

---

**Question 7.** When a name is written without a dot in a zone file, as in `www  IN  A  192.168.1.20`, what does BIND automatically do?

A) Ignores it and raises an error
B) Appends the zone name (origin) and interprets it as an FQDN
C) Treats it as the root domain
D) Maps it to an arbitrary IP

**Answer: B**
Explanation: If a name does not end with a trailing dot, BIND automatically appends the origin (zone name). So `www` becomes `www.example.com.`. Conversely, adding a trailing dot makes it used as an absolute name as-is. This trailing-dot handling is the key trap in writing zone files.

---
