# Day 3 - Network Diagnostics: Commands That Narrow Down the Problem, from ping to tcpdump

## 📌 Key Takeaways

- Network troubleshooting is **measurement**, not guesswork. If you **map tools to layers**, a single run cuts the location of the problem in half.
- **arp (Layer 2) → ping and traceroute (Layer 3) → ss and netstat (Layer 4) → dig and nslookup (DNS) → tcpdump (packets at all layers).**
- **If IP ping works but domain ping fails, it is a DNS problem.** Conversely, if even the IP fails, it is an IP, route, or firewall problem.
- `ss -tlnp` = **t**cp **l**isten **n**umeric **p**rocess. It is the standard combination for seeing "which process is listening on which port".
- **Ports 0-1023 are well-known ports that only root can bind.** A ping failure is not necessarily an outage (servers with only ICMP blocked are common).

## ping — The First Reachability Check (Layer 3)

- `ping` uses **ICMP Echo request/reply** to check whether IP packets travel to and from the target host.
- It is the first tool you reach for in network diagnosis.

```bash
ping google.com            # keeps going until you stop it with Ctrl+C
ping -c 4 8.8.8.8          # send only 4 and exit
ping -i 0.5 8.8.8.8        # 0.5-second interval
ping -s 1000 8.8.8.8       # packet size of 1000 bytes
ping -W 2 8.8.8.8          # wait 2 seconds for a reply
```

- Three things to look at in the output — **response time (time=)**, **TTL (time to live)**, and **packet loss**.

If `ping 8.8.8.8` (IP) works but `ping google.com` (domain) fails, the network is fine and **DNS is the problem**. Conversely, if even the IP fails, it is an IP/route/firewall problem. This one-line comparison instantly separates a DNS problem from a connectivity problem.

> ⚠️ **Trap**: a failed ping does not mean the host is dead. Many servers and firewalls block ICMP for security. It is common for "ping to be blocked while ports 80/443 are open and the web works fine". Do not jump to the conclusion that a ping failure is an outage.

## traceroute — Path Tracing (At Which Hop Does It Get Blocked?)

- `traceroute` shows the **routers (hops) along the way to the destination, in order**.
- How it works: it **increases the TTL by 1 each time** and draws the path from the "time exceeded" replies each router sends.

```bash
traceroute google.com
traceroute -n 8.8.8.8      # IPs only, no name resolution (faster)
tracepath google.com       # similar to traceroute, can also be run by regular users
```

**Key distinction**: `ping` only tells you "does it reach the final destination", but `traceroute` shows "**at which intermediate point** it gets blocked". If the first few hops are fine and then `* * *` appears from a particular hop, the problem is beyond that point. When a ping fails, use traceroute to narrow down where it breaks.

## netstat and ss — Checking Connection and Port Status (Layer 4)

- These tools show which ports are open and which connections are established.
- `netstat` is legacy (net-tools), and **`ss` is the modern one (iproute2) and is faster.**

| Option | netstat | ss | Meaning |
|------|---------|-----|------|
| Listening ports | `netstat -l` | `ss -l` | LISTEN state |
| TCP | `netstat -t` | `ss -t` | TCP only |
| UDP | `netstat -u` | `ss -u` | UDP only |
| Numeric display | `netstat -n` | `ss -n` | Skip name resolution (fast) |
| Process | `netstat -p` | `ss -p` | Process/PID holding the port |
| All | `netstat -a` | `ss -a` | All sockets |

```bash
# The most commonly used combination: listening TCP ports and the processes holding them
ss -tlnp           # TCP, LISTEN, numeric, process
netstat -tlnp      # same (legacy)

# Listening UDP ports
ss -ulnp

# Routing table (in the case of netstat)
netstat -rn        # = ip route
```

Each option letter has a meaning. `ss -tlnp` = **t**cp **l**isten **n**umeric **p**rocess = "which process is listening on which TCP port". When a service won't come up, `ss -tlnp | grep :80` instantly shows who is listening on port 80 (or that nobody is).

**Key distinction**: the TCP connection states are as follows. **LISTEN** (waiting), **ESTABLISHED** (connected), **TIME_WAIT** (lingering after close), **SYN_SENT** (attempting to connect). If too much TIME_WAIT piles up, it is a sign of port exhaustion, and if SYN_SENT is stuck, the other side is not responding.

## nslookup, dig, and host — DNS Query Tools

- These are tools that check which IP a domain resolves to, and **whether DNS is working properly**.

```bash
# nslookup (interactive/simple)
nslookup google.com
nslookup google.com 8.8.8.8     # query a specific DNS server

# dig (detailed — the practical standard)
dig google.com                  # A record
dig google.com MX               # mail server record
dig google.com +short           # just the IP, concise
dig -x 8.8.8.8                  # reverse lookup (IP → domain)

# host (concise)
host google.com
host -t MX google.com           # MX records only
```

| Record | Meaning |
|--------|------|
| A | Domain → IPv4 address |
| AAAA | Domain → IPv6 address |
| MX | Mail server |
| CNAME | Alias (points to another domain) |
| NS | Name servers of that domain |
| PTR | IP → domain (reverse) |

`dig` has rich output (query time, responding server, TTL, authority), making it the standard for practical debugging. You can extract just the answer with `+short`. `nslookup` is simpler but is sometimes treated as deprecated. "Querying a specific DNS server" takes the form `dig @server domain` or `nslookup domain server`.

> ⚠️ **Trap**: `dig` **does not look at** `/etc/hosts` and queries the DNS server directly. So an entry you registered in hosts may resolve with `ping` but not show up with `dig`. "ping works but dig returns NXDOMAIN" = it is a hosts mapping, not a DNS entry.

## arp — Checking Layer 2 Address Mapping

- A tool for viewing the **ARP table** (the IP↔MAC cache) that converts **IPs to MAC addresses** on the same network.

```bash
arp -n             # ARP table (numeric display)
arp -a             # a different format
ip neigh show      # modern (= arp -n)

# Delete an entry
arp -d 192.168.1.50
```

**Key distinction**: ARP only works **within the same network (L2 domain)**. Hosts on other networks do not appear in the ARP table; instead, the gateway's MAC plays that role. In a "same subnet but can't communicate" problem, if the other side's MAC shows (incomplete) in the ARP table, it means L2 reachability itself has failed.

## tcpdump — Capturing Real Packets

- The most powerful diagnostic tool, it captures and shows the **actual packets flowing through an interface**. It requires root privileges.

```bash
tcpdump -i eth0                      # all packets on eth0
tcpdump -i eth0 -n                   # no name resolution (fast)
tcpdump -i eth0 port 80              # port 80 only
tcpdump -i eth0 host 192.168.1.50    # a specific host only
tcpdump -i eth0 tcp                  # TCP only
tcpdump -i eth0 -c 10                # capture 10 and exit
tcpdump -i eth0 -w capture.pcap      # save to a file (for Wireshark analysis)
```

tcpdump combines filters (port, host, tcp/udp, src/dst) to show only the traffic you want. Example: `tcpdump -i eth0 -n 'tcp port 443 and host 1.1.1.1'`. It is the last-resort tool for seeing with your own eyes "whether the firewall really blocks the packets" and "whether replies come back when the SYN goes out". It requires root privileges.

## Port Status and Checks — What Is Open?

- The core question in a service outage is just one — **"Is the port open, and is a process listening on it?"**

```bash
# 1. Which ports are in LISTEN locally?
ss -tlnp

# 2. Is a specific port on a remote host open? (telnet/nc)
nc -zv 192.168.1.50 80          # test a connection to port 80
telnet 192.168.1.50 80          # old-fashioned but still widely used

# 3. Well-known port numbers
# 22=SSH, 23=Telnet, 25=SMTP, 53=DNS, 80=HTTP, 443=HTTPS
# 110=POP3, 143=IMAP, 21=FTP, 3306=MySQL, 8080=alternate HTTP
```

**Key distinction**: 0-1023 are **well-known ports** that only root can bind. 1024-49151 are registered ports, and anything above that are dynamic ports. "A service running with regular-user privileges can't open port 80" because 80 is below 1024 and needs root privileges.

## Try It Yourself — A Diagnostic Flow by Symptom

```bash
# Flow: from near to far, from low layers to high layers
ping -c 2 127.0.0.1        # 1. The machine itself (is the TCP/IP stack OK?)
ping -c 2 192.168.1.1      # 2. The gateway (are L2/L3 OK?)
ping -c 2 8.8.8.8          # 3. An external IP (are routing/firewall OK?)
ping -c 2 google.com       # 4. A domain (is DNS OK?)
ss -tlnp                   # 5. Check local service ports
```

- These five steps **climb the layers.** The step at which it first fails is the location of the problem.
  - Steps up to 3 work but 4 fails → **DNS**
  - Steps up to 2 work but 3 fails → **routing or firewall beyond the gateway**

Tomorrow (Day 4) we organize, by layer, the devices and protocols these packets actually pass through.

## 📖 Glossary

- **ICMP**: the control and error-reporting protocol used by ping and traceroute. Many servers block it for security.
- **TTL (Time To Live)**: the maximum number of hops a packet may pass through. It decreases by 1 at each router and the packet is discarded when it reaches 0.
- **Hop**: one router a packet passes through. It is the unit traceroute counts.
- **`ss` / `netstat`**: the modern and legacy tools for viewing socket, port, and connection state.
- **LISTEN**: the waiting state in which a server waits for connection requests. If a service is running, its port should be in this state.
- **ESTABLISHED / TIME_WAIT / SYN_SENT**: the state where a connection is established / the state that lingers briefly after closing / the state of attempting a connection and waiting for a reply.
- **A / MX / CNAME / PTR records**: DNS records holding domain→IPv4 / mail server / alias / IP→domain (reverse).
- **`dig`**: the standard tool that queries a DNS server directly. The trap is that it **does not look at `/etc/hosts`**.
- **ARP**: the protocol that converts an IP to a MAC address within the same network. Hosts on other networks do not appear here.
- **`(incomplete)`**: an indication in the ARP table that no MAC reply was received from the other side. L2 reachability itself has failed.
- **tcpdump filter**: a condition expression combining `port`, `host`, `tcp/udp`, and `src/dst` to capture only the desired traffic.
- **Well-known ports (0-1023)**: standard service ports such as 22 SSH, 25 SMTP, 53 DNS, 80 HTTP, 443 HTTPS. Only root can bind them.

## 📝 Practice Questions

**Question 1.** `ping 8.8.8.8` succeeds but `ping google.com` fails. What is the most likely cause?

A) The default gateway is not configured

B) There is a problem with DNS (name resolution)

C) The network cable is unplugged

D) The interface is down

**Answer: B**

Explanation: Communication works with the IP (8.8.8.8), so the network connection, gateway, and interface are all fine. Only the domain failing is a problem at the DNS stage that converts names to IPs (check the nameserver in resolv.conf). If A, C, or D were the problem, even the IP ping would have failed, so they are all ruled out.

---

**Question 2.** Which command correctly shows the listening TCP ports on the current system together with the processes holding them?

A) `ss -tlnp`

B) `ss -uan`

C) `ping -c 4 localhost`

D) `arp -n`

**Answer: A**

Explanation: `ss -tlnp` stands for **t**cp **l**isten **n**umeric **p**rocess and shows the listening TCP ports and the processes holding them. B shows all UDP sockets, so it is not LISTEN TCP, C is a reachability check, and D is the ARP (L2 MAC) table, unrelated to port information.

---

**Question 3.** `ping` cannot reach the destination. Which command do you use to check at which router (hop) along the path the traffic breaks?

A) `ss -t`

B) `traceroute`

C) `dig`

D) `arp -a`

**Answer: B**

Explanation: `traceroute` shows the hops to the destination in order and tells you from which point the replies stop (`* * *`). A is socket state, C is a DNS query, and D is the ARP table, none of which relate to path tracing. If ping asks "does it reach", traceroute looks at "where does it get blocked".

---

**Question 4.** Among TCP connection states, which one is where "a server waits for a client's connection request"?

A) ESTABLISHED

B) TIME_WAIT

C) LISTEN

D) SYN_SENT

**Answer: C**

Explanation: LISTEN is the waiting state in which a server socket waits for connection requests. A (ESTABLISHED) is the state where a connection is established, B (TIME_WAIT) is the state that lingers for a while after a connection closes, and D (SYN_SENT) is the state in which a client attempts a connection and waits for a reply. If a service is running, its port should appear as LISTEN.

---

**Question 5.** Which statement about `dig` is correct?

A) It consults `/etc/hosts` first and then queries the DNS server

B) It queries the DNS server directly, and `dig google.com MX` can look up mail server records

C) It sends ICMP packets to check reachability

D) It prints a list of listening ports

**Answer: B**

Explanation: `dig` is a tool that queries the DNS server directly, and you look things up by specifying a record type (A/MX/NS, etc.). A is wrong, because dig does not look at hosts and queries only DNS (so hosts entries do not appear in dig). C is the role of ping, and D is the role of ss/netstat.

---

**Question 6.** Which statement about the "well-known ports" in the range 0-1023 is correct?

A) Any regular user can bind them freely

B) A service needs root privileges to bind them, and they include 80 (HTTP), 22 (SSH), 443 (HTTPS), etc.

C) They are dynamic ports, used temporarily by clients

D) They are UDP-only and TCP cannot use them

**Answer: B**

Explanation: 0-1023 are the well-known ports that only root can bind, and standard services such as 80, 22, 443, 25, and 53 belong here. A is wrong because they are below 1024 and regular users cannot open them, C describes the dynamic ports from 49152 up, and D is wrong because both TCP and UDP can use them.

---

**Question 7.** You cannot communicate with host 192.168.1.50 on the same subnet, so you check `arp -n` and the MAC for that IP shows `(incomplete)`. What is the most accurate meaning?

A) The DNS server is not responding

B) At Layer 2 (L2), the other host's MAC address could not be discovered, so it cannot be reached at all

C) The default gateway is configured incorrectly

D) Port 80 is blocked by the firewall

**Answer: B**

Explanation: ARP converts an IP to a MAC within the same network, and `(incomplete)` means no MAC reply was received from the other side, so L2 reachability fails (the other side is down, a cable or switch problem, etc.). A is DNS, C is the gateway used when going to another network and so is unrelated to same-subnet communication, and D is blocking of a specific port, which differs from a failure at the ARP stage.

---
