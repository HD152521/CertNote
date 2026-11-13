# Day 3 - Primary Subject 3 Mock Exam: Weak Points in Using Networks and Services

## 📌 Key Points

- The last primary subject, **"Using Networks and Services,"** mixes concepts + services + memorization, so it has **the widest scope**.
- The core strategy is to memorize the **"service = daemon = port = configuration file" four-piece set** together.
- The port table is the heart of this subject — SSH 22, SMTP 25, DNS 53, HTTP 80, HTTPS 443. FTP is **control 21 / data 20**.
- DNS records: A (name→IPv4), MX (mail), CNAME (alias), **PTR (IP→name, reverse)**, SOA (zone authority).
- Mail is split into sending (SMTP) and receiving (POP3/IMAP). **POP3 downloads and deletes; IMAP keeps mail on the server and synchronizes**.
- The maximum first octet of Class A is **126, not 127** (127 is reserved for loopback). The private ranges are 10/8, 172.16/12, 192.168/16.

## Weak Point 1: Networking Basics — OSI and TCP/IP

- The mapping between the 7 OSI layers and the 4 TCP/IP layers, and the devices and protocols of each layer, are asked.

| OSI Layer | Examples | Devices |
|----------|------|------|
| 7 Application | HTTP, FTP, DNS | - |
| 4 Transport | TCP, UDP | - |
| 3 Network | IP, ICMP | Router, L3 switch |
| 2 Data Link | MAC, Ethernet | Switch, bridge |
| 1 Physical | Cable, bits | Hub, repeater |

- Let's also review subnet calculation. **/24 = 255.255.255.0 = 256 addresses (254 usable)**.
- The prefix bit count is the network portion, and the rest is the host portion.

| CIDR | Subnet Mask | Hosts (usable) |
|------|---------------|------------------|
| /24 | 255.255.255.0 | 254 |
| /25 | 255.255.255.128 | 126 |
| /26 | 255.255.255.192 | 62 |
| /27 | 255.255.255.224 | 30 |

**TCP vs UDP**: TCP is connection-oriented and reliable (3-way handshake), while UDP is connectionless and fast (DNS lookups, streaming). The same service can use both (DNS uses 53/UDP and 53/TCP).

## Weak Point 2: Port Number Roundup

- The port memorization table is the heart of this subject. Memorize it in full.

| Service | Port | Protocol |
|--------|------|----------|
| FTP | 20 (data)/21 (control) | TCP |
| SSH | 22 | TCP |
| Telnet | 23 | TCP |
| SMTP | 25 | TCP |
| DNS | 53 | UDP/TCP |
| DHCP | 67/68 | UDP |
| HTTP | 80 | TCP |
| POP3 | 110 | TCP |
| NTP | 123 | UDP |
| IMAP | 143 | TCP |
| HTTPS | 443 | TCP |
| SMTPS | 465 | TCP |
| Syslog | 514 | UDP |

> ⚠️ **FTP trap**: Control is **21** and data is **20** (active mode). In passive mode, the data port changes dynamically. If the question just asks for the "FTP port," the answer is often 21.

## Weak Point 3: DNS — BIND and Records

- The DNS server is BIND, and its configuration is split between `/etc/named.conf` and zone files.

| Record | Meaning |
|--------|------|
| A | Hostname → IPv4 |
| AAAA | Hostname → IPv6 |
| MX | Mail server (priority) |
| CNAME | Alias (alias → canonical name) |
| NS | Designates the name server |
| PTR | IP → hostname (reverse) |
| SOA | Zone authority start and refresh information |

- The 3 client configuration files: `/etc/resolv.conf` (specifies name servers), `/etc/hosts` (local static mappings), `/etc/nsswitch.conf` (lookup order).

**Lookup tools**: `nslookup`, `dig` (detailed), `host` (simple). Reverse lookup uses the PTR record, for IP→name conversion.

## Weak Point 4: Web (Apache) and Mail

- Memorize the key directives of the Apache (httpd) configuration.

| Directive | Meaning |
|--------|------|
| `ServerName` | Server domain |
| `DocumentRoot` | Document root path |
| `Listen` | Listening port |
| `<VirtualHost>` | Virtual host |
| `DirectoryIndex` | Default document (index.html) |

- Mail is split into **sending (SMTP) and receiving (POP3/IMAP)**.

| Category | Protocol | Role |
|------|----------|------|
| MTA | SMTP | Mail transfer (sendmail/postfix) |
| MDA | - | Delivery to the mailbox (procmail) |
| MUA | POP3/IMAP | User reading (client) |

**POP3 vs IMAP**: POP3 downloads and deletes from the server (stored locally), while IMAP keeps mail on the server and synchronizes (multiple devices). IMAP is better for multiple devices.

## Weak Point 5: FTP and SSH

- vsftpd is the representative FTP server, and telling the modes apart is the key.

| Mode | Connection Direction | Features |
|------|-----------|------|
| Active | Server→client data | Possible client firewall problems |
| Passive | Client→server data | Firewall-friendly |

- SSH is the standard for secure remote access.

| Item | Details |
|------|------|
| Port | 22 |
| Daemon | sshd |
| Configuration | `/etc/ssh/sshd_config` |
| Key authentication | `ssh-keygen`, `authorized_keys` |
| File transfer | `scp`, `sftp` |

> ⚠️ **Security settings**: In `sshd_config`, the key points are `PermitRootLogin no` (block direct root login), changing `Port`, and recommending key authentication. Telnet (23, plaintext) should be replaced with SSH.

## Weak Point 6: Network Commands and Security

- Let's summarize the diagnostic and configuration commands.

| Command | Role |
|------|------|
| `ip`/`ifconfig` | Configure and check interfaces |
| `ping` | Check connectivity (ICMP) |
| `traceroute` | Trace the route |
| `netstat`/`ss` | Connection and port status |
| `nslookup`/`dig` | DNS lookup |
| `route`/`ip route` | Routing table |
| `arp` | MAC-IP mapping |

**Status check in one line**: View open ports and LISTEN state with `ss -tlnp` (or `netstat -tlnp`). You can see at a glance which process is using which port.

## Weak Point 7: DHCP and NTP

- Automatic IP assignment and time synchronization are also within the exam scope.

| Service | Port | Configuration File | Role |
|--------|------|-----------|------|
| DHCP | 67 (server)/68 (client) | `/etc/dhcp/dhcpd.conf` | Automatic IP assignment |
| NTP | 123 | `/etc/ntp.conf` (chrony uses chrony.conf) | Time synchronization |

- The keywords are DHCP's IP lease concept and NTP's stratum structure.

**The 4 DHCP steps (DORA)**: Discover → Offer → Request → Ack. The flow in which the client finds a server by broadcast and is leased an IP.

## Weak Point 8: Network Configuration Files and Bonding

- Let's summarize the structure of interface configuration files on the RHEL family.

| File | Purpose |
|------|------|
| `ifcfg-eth0` | Per-interface IP and gateway |
| `/etc/sysconfig/network` | Global network settings |
| `/etc/hostname` | Hostname |
| `/etc/hosts` | Static name resolution |

- Key items: `BOOTPROTO` (static/dhcp), `IPADDR`, `NETMASK`, `GATEWAY`, `ONBOOT` (activate at boot), `DNS1`.

**ONBOOT trap**: With `ONBOOT=no`, the interface does not come up at boot. Even if you set every IP value correctly, the network won't work if ONBOOT is no — that's the trap.

## Weak Point 9: Security — Blocking Intrusions and Responding to Scans

- Network security concepts are also included in Subject 3.

| Concept | Description |
|------|------|
| Firewall | Control traffic with iptables/firewalld |
| TCP Wrapper | `hosts.allow`/`hosts.deny` access control |
| Port scan | Probing for open ports with tools like nmap (attack reconnaissance) |
| IDS/IPS | Intrusion detection/prevention systems |

**Security in one line**: Plaintext protocols (Telnet 23, FTP 21) send passwords as-is, so they are vulnerable to eavesdropping. The principle is to replace them with encrypted ones: SSH (22), SFTP, HTTPS (443).

## Weak Point 10: The IP Addressing Scheme and Special Addresses

- IPv4 classes and private IP ranges are simple memorization but easy to confuse.

| Class | Range (first octet) | Default Mask | Use |
|--------|---------------|-------------|------|
| A | 1-126 | /8 | Large scale |
| B | 128-191 | /16 | Medium scale |
| C | 192-223 | /24 | Small scale |
| D | 224-239 | - | Multicast |
| E | 240-255 | - | Research/reserved |

- Memorize the private IP ranges too — Class A `10.0.0.0/8`, Class B `172.16.0.0/12`, Class C `192.168.0.0/16`.

| Special Address | Meaning |
|-----------|------|
| `127.0.0.1` | Loopback (itself) |
| `0.0.0.0` | All addresses / unspecified |
| `255.255.255.255` | Limited broadcast |

**127 vs 126**: Class A is 1-126, and 127 is excluded because it is reserved for loopback. The answer to "What is the maximum first octet of Class A?" is **126**, not 127.

## Weak Point 11: IPv6 and Routing Basics

- IPv6 is 128 bits, written as 8 groups of hexadecimal (separated by colons).
- A run of consecutive zero groups can be abbreviated with `::` once.

| Category | IPv4 | IPv6 |
|------|------|------|
| Bits | 32 | 128 |
| Notation | Dotted decimal | Colon hexadecimal |
| Address exhaustion | A problem | Practically unlimited |
| Loopback | 127.0.0.1 | ::1 |

- Routing is split into static (`route add`/`ip route add`) and dynamic (RIP, OSPF, BGP).
- The default gateway is the exit to which packets are sent when the destination is not in the routing table.

**The `::` rule**: In IPv6, `::` (abbreviation of consecutive zeros) can be used **only once** in an address. Using it twice makes it ambiguous how many zeros each covers, so it is invalid.

Check yourself with the mock exam below.

## 📖 Glossary

- **OSI 7 layers** : A standard model that divides network communication by role. Routers operate at Layer 3 and switches at Layer 2.
- **CIDR** : A notation that expresses an address range by the number of bits in the network portion, like `/24`.
- **TCP / UDP** : A transport method that establishes a connection and guarantees ordering and retransmission / a transport method that sends quickly without a connection.
- **Active / passive mode** : In FTP, the method where the server opens the data connection to the client / the method where the client opens it to the server (firewall-friendly).
- **MTA / MDA / MUA** : The server that transfers mail / the program that delivers to the mailbox / the client the user reads with.
- **POP3 / IMAP** : A method that downloads mail and deletes it from the server / a method that keeps mail on the server and synchronizes with multiple devices.
- **PTR record** : A DNS record for reverse lookup that converts an IP to a name.
- **DORA** : The 4 steps by which DHCP leases an address — Discover, Offer, Request, Ack.
- **stratum** : A tier number in NTP indicating how many steps away you are from the reference clock.
- **ONBOOT** : A setting that decides whether the interface is brought up automatically at boot. If `no`, the network doesn't work even if the IP is set correctly.
- **Private IP** : Address ranges for internal use that don't go directly onto the Internet (10/8, 172.16/12, 192.168/16).
- **Loopback (127.0.0.1 / ::1)** : The address that points to itself. This is why 127 is excluded from the Class A range.
- **`::` abbreviation** : A notation in IPv6 that omits a run of consecutive zero groups. It can be used **only once** in an address.
- **Static routing / dynamic routing** : The method where the administrator enters routes manually / the method of learning automatically via RIP, OSPF, and BGP.

## 📝 Practice Questions

**Question 1.** Among the 7 OSI layers, which layer is where routers operate and the IP and ICMP protocols belong?

A) Layer 2 (Data Link)
B) Layer 3 (Network)
C) Layer 4 (Transport)
D) Layer 7 (Application)

**Answer: B**
Explanation: IP and ICMP belong to Layer 3 (Network), and routers determine routes at this layer. Switches are Layer 2, and TCP/UDP are Layer 4.

---

**Question 2.** Which service separates the control connection and the data connection and uses port 21 as the control port?

A) SSH
B) FTP
C) Telnet
D) SMTP

**Answer: B**
Explanation: FTP has the unusual structure of separating control (21) and data (20 in active mode). SSH uses 22, Telnet uses 23, and SMTP uses 25.

---

**Question 3.** Which DNS record is used for reverse lookup, converting an IP address to a hostname?

A) A
B) MX
C) PTR
D) CNAME

**Answer: C**
Explanation: The PTR record is used for reverse lookup, IP→hostname. A is forward (name→IPv4), MX is the mail server, and CNAME is an alias.

---

**Question 4.** Which protocol and port does a mail server's role of transferring mail to another server (MTA) use?

A) POP3 - 110
B) IMAP - 143
C) SMTP - 25
D) HTTP - 80

**Answer: C**
Explanation: An MTA (sendmail/postfix) transfers mail via SMTP (25). POP3 (110) and IMAP (143) are receiving protocols that users use to fetch mail.

---

**Question 5.** Which receiving protocol is suited to synchronizing and using the same mailbox from multiple devices?

A) POP3
B) IMAP
C) SMTP
D) NNTP

**Answer: B**
Explanation: IMAP keeps mail on the server so multiple devices can view it in sync. POP3 downloads from the server and deletes (stored locally), which is a disadvantage for multiple devices.

---

**Question 6.** In a `/24` subnet (255.255.255.0), how many IPs can actually be assigned to hosts?

A) 256
B) 254
C) 128
D) 62

**Answer: B**
Explanation: Of the 256 addresses in a /24, excluding the network address and the broadcast address leaves 254 usable for hosts.

---

**Question 7.** Which setting in `/etc/ssh/sshd_config` blocks direct root login for SSH server security?

A) `PermitRootLogin yes`
B) `PermitRootLogin no`
C) `AllowRoot off`
D) `RootLogin deny`

**Answer: B**
Explanation: Setting `PermitRootLogin no` blocks direct SSH login for the root account. It is a security practice that forces users to connect with a regular account and then use su/sudo.

---

**Question 8.** Which configuration file specifies the name servers a DNS client queries?

A) `/etc/hosts`
B) `/etc/resolv.conf`
C) `/etc/named.conf`
D) `/etc/nsswitch.conf`

**Answer: B**
Explanation: `/etc/resolv.conf` specifies the DNS servers to query with `nameserver` entries. `/etc/hosts` is local static mapping, and `named.conf` is the BIND server configuration.

---

**Question 9.** Which is an appropriate command to check the ports in the LISTEN state on the current system and their processes?

A) `ping -c 4 localhost`
B) `ss -tlnp`
C) `traceroute 8.8.8.8`
D) `arp -a`

**Answer: B**
Explanation: `ss -tlnp` (or `netstat -tlnp`) shows TCP, LISTEN, numeric, and process information together. ping checks connectivity, traceroute traces the route, and arp shows MAC mappings.

---

**Question 10.** Which directive in the Apache (httpd) configuration specifies the top-level directory path of web documents?

A) `ServerName`
B) `Listen`
C) `DocumentRoot`
D) `DirectoryIndex`

**Answer: C**
Explanation: `DocumentRoot` specifies the top-level path of web content. `ServerName` specifies the domain, `Listen` the listening port, and `DirectoryIndex` the default document.

---
