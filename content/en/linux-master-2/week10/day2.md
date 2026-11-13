# Day 2 - DNS: Names and Addresses

## 📌 Key Takeaways

- **DNS is the system that converts domain names into IP addresses**. The port is **53**.
- A domain is a **hierarchy**, in the order **root (`.`) → top-level (TLD) → second-level → host**.
- Name → IP is a **forward** lookup, and IP → name is a **reverse** lookup.
- Memorize the record types — **A (IPv4) · AAAA (IPv6) · MX (mail) · CNAME (alias) · NS (name server) · PTR (reverse)**.
- The lookup commands are **`nslookup` · `dig` · `host`**, and the Linux DNS server program is **BIND**.

## What DNS Does

```text
   What happens when you type www.example.com?

   1  Check /etc/hosts first                (if it is there, you are done here)
   2  Ask the DNS server in /etc/resolv.conf
   3  The DNS server tells you 93.184.216.34
   4  Connect to that IP
```

- People use names and computers use numbers. **DNS is what bridges the two.**
- **Without DNS, connecting by IP works but connecting by name does not.** This is a clue for diagnosing problems.
- In the early days of the Internet there was no DNS. The names and addresses of all computers were written in **a single file**, and everyone downloaded and used it. When the number of computers grew and that approach became unmanageable, DNS appeared, **splitting names into a hierarchy and managing each zone separately**. **`/etc/hosts` is a relic of that old approach**.
- So the core idea of DNS is that **"no single place knows everything."** Each server knows only its own zone, and for anything it does not know, it only tells you **whom to ask**.

## The Domain Hierarchy

```text
                    .  (root)
         ┌──────────┼──────────┐
        com        kr         org        ← Top-level domains (TLD)
         │          │
      example    co.kr                   ← Second-level domains
         │          │
       www       naver                   ← Hosts
```

- A complete name that includes the trailing dot, like **`www.example.com.`**, is called an **FQDN** (Fully Qualified Domain Name).
- **Read from the right**, going up the hierarchy. `com` is above `example`.

| Category | Examples |
|------|-----|
| **gTLD** (generic top-level) | **com, net, org, edu, gov, mil, int** |
| **ccTLD** (country code) | **kr, jp, cn, us** |

- **gov is for government, edu for education, and mil for military** organizations. Questions about their purposes come up.

| gTLD | Purpose | Corresponding `kr` second level |
|------|------|-----------------|
| **com** | For-profit companies | **co.kr** |
| **org** | Non-profit organizations | **or.kr** |
| **edu** | Educational institutions | **ac.kr** (universities) |
| **gov** | Government agencies | **go.kr** |
| **net** | Network-related organizations | ne.kr |
| mil | Military organizations | — |
| int | International organizations | — |

- **Under `kr`, the labels are abbreviated to two letters.** They are `co` (company), `or` (organization), `go` (government), and `ac` (academic). The trap is that the counterpart of `edu` is **`ac.kr`**, not `ed.kr`.
- **A gTLD has three or more letters, while a ccTLD has exactly two.** If it has two letters like `kr`, `jp`, or `us`, it is a country code.
- Domains are case-insensitive. `WWW.Example.COM` and `www.example.com` are the same.

## Types of DNS Servers

| Type | What it does |
|------|--------|
| **Root DNS server** | The top of the hierarchy. Tells you where the TLD servers are |
| **Authoritative server** | The server that **actually holds the information** for that domain |
| **Caching (Resolver) server** | A server that **asks on the user's behalf and stores the result** |
| **Master / Slave** | The server holding the original / the **secondary** server that receives a copy |

- What we write in `/etc/resolv.conf` is usually the address of a **caching server** (for example, 8.8.8.8).
- **A slave server replicates its information from the master**. This is to prepare for failures and load.
- The master is also called the **primary name server** and the slave the **secondary name server**. This replication is called a **zone transfer**.

### How a Lookup Actually Flows

This is what a caching server does when `www.example.com` is asked for the first time.

```text
   My computer ──①──►  Caching server (8.8.8.8 as listed in /etc/resolv.conf)
                        │
                        ├──②──►  Root server       "com is known by that TLD server over there"
                        ├──③──►  com TLD server    "example.com is known by that name server over there"
                        └──④──►  Authoritative server for example.com  "It is 93.184.216.34"
                        │
   My computer ◄──⑤──  Caching server   (passes on the answer and remembers it for a while)
```

| Category | Who asks whom | Nature |
|------|------------|------|
| **Recursive query** (①) | My computer → caching server | **"Bring me the final answer"** — ask once and wait |
| **Iterative query** (②~④) | Caching server → root·TLD·authoritative servers | Asks one after another, receiving **"whom to ask next"** each time |

- It descends **from top to bottom, in the same order as reading the domain from the right**. Root → `com` → `example.com`.
- **The root server does not know the answer.** It only tells you where the servers in charge of the top-level domains are. Being at the top of the hierarchy does not mean "knowing everything".
- The caching server remembers the answer it received for a set time (**TTL**). If the same name is asked again, it skips ②~④ and answers right away. That is why the second lookup is faster, and also why **changes to DNS information do not spread immediately**.

## Forward and Reverse

| Category | Direction | Record |
|------|------|-------|
| **Forward lookup** | **Name → IP** | **A**, AAAA |
| **Reverse lookup** | **IP → name** | **PTR** |

- Forward is what you use day to day. **Reverse is used for things like verifying the trustworthiness of a mail server**.

## Resource Records

| Record | Meaning |
|-------|-----|
| **A** | Name → **IPv4 address** |
| **AAAA** | Name → **IPv6 address** |
| **MX** | The domain's **mail server** (Mail eXchanger) |
| **CNAME** | An **alias** (another name for a name) |
| **NS** | The **name server** that manages the domain |
| **PTR** | IP → name (**reverse**) |
| **SOA** | The zone's **basic information** (administrator, refresh interval) |

> **A is address, MX is mail, CNAME is alias, NS is name server, PTR is reverse** — be sure to tell these five apart. Questions about **MX (mail)** in particular come up.

- **AAAA (quad A)** is for IPv6. If IPv4's A is 32 bits, IPv6 is 4 times that at 128 bits, so there are four A's.

| What you want to do | Record to use |
|------------|-----------|
| Connect `www.example.com` to `93.184.216.34` | **A** |
| Make `ftp.example.com` another name for `www.example.com` | **CNAME** |
| Specify the server that receives mail sent to `alice@example.com` | **MX** |
| Specify the name server that manages `example.com` | **NS** |
| Look up in reverse what name `93.184.216.34` has | **PTR** |

- **A and CNAME point to different targets.** A points to an **IP address**, and CNAME points to **another name**. A name set up with CNAME has to be followed all the way to the A record at the end before you get an IP.
- **MX points to a server name, not a mail address.** The step in yesterday's mail delivery process where we asked DNS "where is the recipient's mail server?" is exactly this MX lookup.
- MX carries a **priority number**. **The smaller the number, the sooner it is tried.** If there are 10 and 20, mail goes to server 10 first, and if that fails, to server 20.
- **PTR is the opposite direction of A**. Spelled out, it stands for Pointer.

## Lookup Commands

```bash
nslookup naver.com          # Simple lookup
host naver.com              # One-line summary
dig naver.com               # Detailed lookup
dig naver.com MX            # Mail servers only
dig -x 8.8.8.8              # Reverse lookup
```

| Command | Characteristics |
|------|------|
| **`nslookup`** | A traditionally widely used tool |
| **`dig`** | **The most detailed.** Easy to specify the record type |
| **`host`** | Output is **concise** |

```text
$ nslookup www.example.com
Server:		8.8.8.8
Address:	8.8.8.8#53

Non-authoritative answer:
Name:	www.example.com
Address: 93.184.216.34
```

| Line | How to read it |
|----|--------|
| `Server` / `Address` | **Whom you asked.** The `nameserver` from `/etc/resolv.conf` appears here. `#53` is the port number |
| `Non-authoritative answer` | Not an answer given directly by the authoritative server, but **one a caching server relayed from what it remembered** |
| `Name` / `Address` | The name asked about and its IP — this is the result |

- **Do not confuse the upper `Address` with the lower `Address`.** The upper is the DNS server's address, and the lower is the answer you were looking for.
- "Non-authoritative" is not an error. Almost every ordinary lookup comes out this way.

```text
$ dig www.example.com

;; QUESTION SECTION:
;www.example.com.		IN	A

;; ANSWER SECTION:
www.example.com.	3600	IN	A	93.184.216.34

;; SERVER: 8.8.8.8#53(8.8.8.8)
```

- The actual output is longer than this. The places to look are three: **the question (QUESTION), the answer (ANSWER), and the server that answered (SERVER)**.
- One line of the `ANSWER SECTION` is in the order **name · TTL (seconds) · IN · record type · value**. The example above means "this answer may be remembered for 3600 seconds (1 hour)."
- `dig` displays names with a **trailing dot** (`www.example.com.`). This is the FQDN notation we saw earlier.

| What you want to do | `nslookup` | `dig` | `host` |
|---------|-----------|-------|--------|
| View mail servers (MX) | `nslookup -type=mx example.com` | `dig example.com MX` | `host -t mx example.com` |
| Specify the server to ask | `nslookup name 168.126.63.1` | `dig @168.126.63.1 name` | `host name 168.126.63.1` |
| Reverse lookup | `nslookup 8.8.8.8` | **`dig -x 8.8.8.8`** | `host 8.8.8.8` |

- **Only `dig` puts `@` before the server and needs `-x` for reverse lookups**. With `nslookup` and `host`, if you just give an IP they automatically do a reverse lookup.
- All three commands **only look things up**. They do not change any settings. `ping` also shows a name converted to an IP, but it is not classified as a DNS lookup tool.

## Related Files and Servers

| Item | Description |
|------|------|
| **`/etc/resolv.conf`** | Where you write the **DNS servers to ask** (`nameserver`) |
| **`/etc/hosts`** | Maps names directly to IPs |
| `/etc/nsswitch.conf` | The order of **which to consult first** (`hosts: files dns`) |
| **BIND** | The leading **DNS server program** on Linux. The daemon is named `named` |
| Port | **53** (mainly UDP, and TCP when the response is large) |

- **Since `hosts` comes before `dns`, `/etc/hosts` is consulted first.** That is why values written there take priority over DNS.
- **BIND** (Berkeley Internet Name Domain) is the most widely used DNS server software. Just know the name.
- **The product name is BIND, the daemon name is `named`, and the configuration file is `/etc/named.conf`** (Red Hat family). Like Apache and `httpd`, the product and process names differ.

| File | Which machine's it is | What is written |
|------|-------------------|----------|
| `/etc/resolv.conf` | **The asking side (client)** | The IP of the DNS server to ask |
| `/etc/hosts` | The asking side (client) | Name ↔ IP pairs to use without asking DNS |
| `/etc/named.conf` | **The answering side (DNS server)** | Configuration of BIND itself |

- **In `resolv.conf`, write an IP, not a name.** If you wrote the DNS server by name, DNS would be needed again to resolve that name.
- In an environment that obtains addresses automatically, **DHCP hands out the DNS server addresses along with the IP, subnet mask, and default gateway**. In that case `/etc/resolv.conf` is filled in by the system, not by a person. If something you edited by hand has reverted after a reboot, this is the case.
- **DNS and DHCP do different jobs.** DNS **converts names to addresses**, and DHCP **hands out addresses.** They appear side by side as wrong answer choices in practice questions.

| Symptom | Cause | Check |
|------|------|------|
| It works by IP but **no name** resolves | `resolv.conf` is empty or the DNS server is unreachable | `cat /etc/resolv.conf`, `ping 8.8.8.8` |
| **Only one name** goes to the wrong server | An old address is written in `/etc/hosts` | `grep name /etc/hosts` |
| The `nslookup` result differs from the address actually connected to | `nslookup` asks **only DNS** and does not look at `/etc/hosts` | `/etc/hosts` |
| You changed a record but the old address keeps appearing | The caching server remembers the old answer **for the TTL** | It clears up as time passes |

> Tomorrow we cover remote access and file transfer — TELNET, SSH, and FTP.

## 📖 Glossary

- **DNS** : A system that converts between domain names and IP addresses. The port is 53.
- **FQDN** : A complete domain name that includes the root.
- **TLD** : Top-level domain. Divided into gTLDs like com and org and ccTLDs like kr and jp.
- **Authoritative server** : A DNS server that actually holds the information for that domain.
- **Caching server** : A DNS server that looks things up on the user's behalf and stores the results.
- **A record / AAAA record** : Records that connect a name to an IPv4 address / an IPv6 address.
- **MX record** : A record that specifies the server that receives that domain's mail.
- **BIND** : DNS server software widely used on Linux. The daemon is named named.

## 📝 Practice Questions

**Question 1.** What is the role of DNS?

A) Relays mail between servers  
B) Transfers files remotely  
C) Automatically assigns IP addresses  
D) Converts domain names to IP addresses  

**Answer: D**  
Explanation: DNS is a system that converts between domain names, which are easy for people to remember, and the IP addresses computers use. Mail relay is handled by SMTP, file transfer by FTP, and automatic IP assignment by DHCP.

---

**Question 2.** Which DNS record specifies the server that receives mail for a given domain?

A) A  
B) MX  
C) CNAME  
D) NS  

**Answer: B**  
Explanation: MX stands for Mail eXchanger and specifies which server receives the mail sent to that domain. A connects a name to an IPv4 address, CNAME specifies an alias, and NS specifies the name server that manages that domain.

---

**Question 3.** Which DNS record connects a domain name to an IPv4 address?

A) A  
B) AAAA  
C) PTR  
D) SOA  

**Answer: A**  
Explanation: An A record maps a host name to a 32-bit IPv4 address. A 128-bit IPv6 address uses an AAAA record, PTR is used for reverse lookups that find a name from an IP, and SOA holds the zone's basic information.

---

**Question 4.** What is the default port number used by DNS?

A) 25  
B) 43  
C) 53  
D) 80  

**Answer: C**  
Explanation: DNS uses port 53, with UDP for ordinary lookups and TCP when the response is large or a zone transfer is needed. Port 25 belongs to SMTP and port 80 to HTTP.

---

**Question 5.** Which record is used for a reverse lookup that finds a domain name from an IP address?

A) A  
B) MX  
C) NS  
D) PTR  

**Answer: D**  
Explanation: A PTR record is used for reverse lookups that find a domain name from an IP address, and it is often used to verify the trustworthiness of a mail server. Conversely, A and AAAA records are used for forward lookups that find an address from a name.
