# Day 4 - Network Devices, Protocols, and Redundancy: Infrastructure Threaded Together by Layers

## 📌 Key Takeaways

- **Every device and protocol operates at a fixed layer, and that layer determines its capabilities and limits.**
- Hubs and repeaters (Layer 1) handle only signals, **switches (Layer 2) use MAC**, and **routers (Layer 3) use IP**. **Only a router (or a VLAN) divides a broadcast domain.**
- Protocol mapping: **ARP** (IP→MAC, local only) · **ICMP** (reachability and path, Layer 3) · **DNS** (names, **53 UDP+TCP**) · **DHCP** (addresses, **67/68 UDP**, 4-step DORA).
- Memorize ports along with their TCP/UDP pairing — 21 FTP · 22 SSH · 23 Telnet (plaintext) · 25 SMTP · 53 DNS · 80 HTTP · 443 HTTPS · 110/143 POP3/IMAP.
- NIC aggregation: **redundancy is active-backup (mode 1)**, **bandwidth aggregation is balance-rr (0) or 802.3ad LACP (4)**. **Bonding is a kernel module; teaming is a user-space daemon (teamd)**.

## Network Devices by OSI Layer — The Layer Determines the Capability

| Device | Operating layer | Core function | Limits / characteristics |
|------|-----------|-----------|-----------|
| Repeater | 1 (Physical) | Amplifies and regenerates weakened signals | Only boosts the signal, no ability to discriminate |
| Hub | 1 (Physical) | Distributes the signal to multiple ports | Sends received signals out **all ports** (broadcast), shares a collision domain |
| Bridge | 2 (Data Link) | Connects segments by MAC | Separates collision domains (software processing, slow) |
| Switch | 2 (Data Link) | Learns MAC addresses and forwards only to the matching port | Separates collision domains per port (hardware, fast) |
| Router | 3 (Network) | Determines paths between networks by IP | Separates broadcast domains, connects different networks |
| L4/L7 switch | 4-7 | Load balancing based on port and application | Acts as a load balancer |

The key comparison is **hub vs switch**. A hub spreads each received frame to all ports (shared bandwidth, collisions occur), which is inefficient, while a switch learns a **MAC address table** and sends only to the destination port (no collisions, dedicated bandwidth). The key one-liner is "a switch looks at the MAC and a router looks at the IP".

**Key distinction**: **collision domain vs broadcast domain.** A switch divides collision domains per port, but forwards broadcasts to all ports (there is one broadcast domain). Only a **router** finally divides the broadcast domain. So the answer to "to shrink the broadcast scope" is "a router (or a VLAN)".

In the early 1990s, hubs were the LAN standard, but as hosts increased, collisions exploded and performance plummeted. With the arrival of switches (MAC learning), each port got dedicated bandwidth and the collision problem disappeared. Today the "hub" has practically vanished and all LAN switching is switch-based — the exam asks about the difference between the two conceptually.

## ARP — The Bridge from IP to MAC (Layer 2-3 Boundary)

- To communicate on the same network, you need to know not only the other side's IP but also its **MAC address** — because actual frame delivery is done with Layer 2 MAC.
- ARP finds it out by **broadcasting "what is the MAC of the host that has this IP?"**

```bash
# How ARP works: "Who knows the MAC of 192.168.1.1?" (broadcast)
#          → that host replies "My MAC is aa:bb:..." (unicast reply)

arp -n              # check the ARP cache (IP↔MAC)
ip neigh show       # modern
```

| Protocol | Direction | Role |
|----------|------|------|
| ARP | IP → MAC | Finds the MAC when the IP is known |
| RARP | MAC → IP | Finds the IP when the MAC is known (historical, replaced by DHCP) |

> ⚠️ **Trap**: ARP works directly only within the same **local network (L2)**. When communicating with a host on another network, you learn the **gateway's MAC**, not the MAC of the other side's IP. "The MAC of a host on another subnet is not in the ARP table" is normal, and that traffic is routed through the gateway.

## ICMP — Control and Error Messages (Layer 3)

- ICMP is a Layer 3 protocol that does not carry data but **reports network status and errors**.
- Both `ping` and `traceroute` operate on top of this protocol.

| ICMP message | Meaning | Related tool |
|-------------|------|-----------|
| Echo Request/Reply | Reachability check (ping) | ping |
| Time Exceeded | TTL reached 0 (path tracing) | traceroute |
| Destination Unreachable | Destination cannot be reached | — |
| Redirect | Suggests a better path | — |

`traceroute` can draw a path thanks to ICMP **Time Exceeded**. As the TTL is raised from 1, each router sends a "time exceeded" message when the TTL hits 0, and the source of that message is the address of that hop. ICMP is the foundation protocol for reachability and path diagnosis.

## DNS — Names to Addresses (Layer 7, Port 53)

- DNS is a **distributed system that converts** human-readable domains (google.com) **into IPs**.
- It is a Layer 7 application protocol and usually uses **UDP port 53** (TCP for large responses).

```bash
# Query flow: local cache → /etc/hosts → name server in resolv.conf → root → TLD → authoritative server
dig google.com +short
host google.com
```

| Record | Role |
|--------|------|
| A / AAAA | Domain → IPv4 / IPv6 |
| MX | Mail server |
| NS | Authoritative name server |
| CNAME | Alias |
| PTR | Reverse (IP → domain) |

**Key distinction**: DNS uses **UDP 53** by default, but uses **TCP 53** when the response is large (over 512 bytes) or for a zone transfer. An answer choice saying "DNS uses only UDP" is wrong. The port number is 53 and it uses both UDP and TCP.

## DHCP — Automatic Address Distribution (Layer 7, Ports 67/68)

- DHCP is the protocol that **automatically assigns an IP, subnet mask, gateway, and DNS** to a host.
- The ports are **UDP 67** for the server and **UDP 68** for the client.

```bash
# The 4 steps of DHCP (DORA)
# Discover  → client: "Is there a DHCP server?" (broadcast)
# Offer     → server: "I'll give you this IP"
# Request   → client: "I'll use that IP"
# Acknowledge → server: "Confirmed"

# Renew an address via DHCP on Linux
dhclient eth0          # request an address
dhclient -r eth0       # return the address (release)
```

Remember the 4 steps of DHCP as **DORA** (Discover-Offer-Request-Acknowledge). If this process fails, the host assigns itself a 169.254.x.x (APIPA) address (see Day 1). "The IP starts with 169.254" = a sign that DHCP's DORA failed.

Before DHCP, administrators typed the IP into every host by hand (static assignment). As mobile devices like laptops and phones multiplied, automatic assignment became essential. DHCP is an evolution of RARP and BOOTP, and today almost every LAN/Wi-Fi hands out addresses via DHCP.

## Major Protocols and Ports at a Glance

| Protocol | Port | Transport | Layer | Use |
|----------|------|------|------|------|
| FTP | 20/21 | TCP | 7 | File transfer |
| SSH | 22 | TCP | 7 | Remote access (encrypted) |
| Telnet | 23 | TCP | 7 | Remote access (plaintext) |
| SMTP | 25 | TCP | 7 | Sending mail |
| DNS | 53 | UDP/TCP | 7 | Name resolution |
| DHCP | 67/68 | UDP | 7 | Automatic address assignment |
| HTTP | 80 | TCP | 7 | Web |
| HTTPS | 443 | TCP | 7 | Encrypted web |
| POP3 / IMAP | 110 / 143 | TCP | 7 | Receiving mail |

> ⚠️ **Trap**: **SSH (22) and Telnet (23)** are both remote access, but Telnet is plaintext and SSH is encrypted. For security, Telnet is not used. **Only DNS defaults to UDP**; most of the rest of the list above are TCP. You must memorize the port number together with its TCP/UDP pairing.

## Bonding and Teaming — Combining Interfaces for Availability and Bandwidth

- This is a technique that **combines multiple physical NICs into one logical interface** to gain failure protection (redundancy) or more bandwidth.
- The traditional method on Red Hat-family systems is **bonding**, and the newer method is **teaming**.

```bash
# Check a bonding interface
cat /proc/net/bonding/bond0

# Create a bond with nmcli
nmcli con add type bond con-name bond0 ifname bond0 mode active-backup
nmcli con add type bond-slave ifname eth0 master bond0
nmcli con add type bond-slave ifname eth1 master bond0
```

| Bonding mode | Number | Behavior |
|-----------|------|------|
| balance-rr | 0 | Round-robin (load balancing) |
| active-backup | 1 | Only one active, automatic failover on failure (redundancy) |
| balance-xor | 2 | Distribution based on source/destination |
| broadcast | 3 | Transmit on all slaves |
| 802.3ad (LACP) | 4 | Negotiates with the switch to aggregate links |

| Item | Bonding | Teaming |
|------|---------------|---------------|
| Implementation | Kernel module (bonding) | User-space daemon (teamd) |
| Era | Traditional | Newer (RHEL7+) |
| Configuration | Mode (0-6) | runner (activebackup, loadbalance, etc.) |

The most commonly used mode is **active-backup (mode 1)** — **redundancy** that uses one NIC and automatically switches to another NIC if it dies. To increase bandwidth, use **balance-rr (0)** or **802.3ad (4, LACP)**. Distinguish them as "redundancy = active-backup, bandwidth aggregation = LACP".

**Key distinction**: **bonding is a kernel module**, while **teaming is implemented as a user-space daemon (teamd)**. The functionality is similar, but teaming is more flexible and extensible. If the exam asks "the difference between the two", the answer is the implementation location (kernel vs user space) and the era (traditional vs RHEL7 and later).

## Try It Yourself — Checking Devices and Protocols by Layer

```bash
# Layer 2: MAC addresses and the ARP table
ip link show                  # check interface MAC
arp -n                        # IP↔MAC mapping

# Layer 3: ICMP reachability and path
ping -c 2 8.8.8.8             # ICMP Echo
traceroute -n 8.8.8.8        # path via ICMP Time Exceeded

# Layer 7: DNS and DHCP
dig google.com +short        # DNS query (UDP 53)
cat /proc/net/bonding/bond0  # bonding status (if present)
```

- If you run each command while being aware of **which layer's device or protocol it touches**, the three-way mapping of device-protocol-layer becomes second nature.
- Put together, it becomes a single map: **Layer 1 (hub, repeater) → Layer 2 (switch, bridge, ARP, MAC) → Layer 3 (router, IP, ICMP) → Layer 7 (DNS, DHCP, HTTP)**, with bonding and teaming on top adding availability.

Tomorrow (Day 5) we do a comprehensive review of the whole week and finish with questions that include subnet calculation.

## 📖 Glossary

- **Repeater / hub**: a Layer 1 device that amplifies weakened signals / a Layer 1 device that spreads received signals to all ports.
- **Switch**: a Layer 2 device that learns a MAC address table and sends frames only to the destination port.
- **Collision domain**: the scope within which frames can collide with each other. A switch splits it per port.
- **Broadcast domain**: the scope over which a broadcast spreads. **Only a router (or a VLAN) can divide it.**
- **L4/L7 switch**: a device that acts as a load balancer, distributing traffic by looking at port and application information as well.
- **ARP / RARP**: the protocol that finds a MAC from an IP / the old protocol that found an IP from a MAC (replaced by DHCP).
- **ICMP Time Exceeded**: the message a router sends when the TTL reaches 0. It is the basis on which traceroute draws the path.
- **Zone transfer**: DNS servers exchanging whole domain information with each other. This uses TCP 53, not UDP.
- **DORA**: the 4 steps of DHCP — Discover → Offer → Request → Acknowledge.
- **`dhclient`**: the Linux command to request (`dhclient eth0`) or return (`-r`) a DHCP address.
- **Bonding**: the kernel-module method of combining multiple NICs into one. The mode number (0-6) determines behavior.
- **Teaming**: the newer method that implements the same purpose with the user-space daemon `teamd`. The runner determines behavior.
- **active-backup (mode 1)**: a redundancy mode that uses one NIC and switches to another if it dies.
- **802.3ad (LACP, mode 4)**: a mode that negotiates with the switch to combine multiple links into one and increase bandwidth.

## 📝 Practice Questions

**Question 1.** Which Layer 2 device learns a MAC address table and forwards received frames only to the destination port?

A) Hub

B) Switch

C) Repeater

D) Router

**Answer: B**

Explanation: A switch is a Layer 2 device that learns MAC addresses and forwards frames only to the matching destination port. A (hub) is Layer 1 and spreads signals to all ports, C (repeater) is Layer 1 and only amplifies signals, and D (router) crosses networks by IP at Layer 3. The key is "MAC = switch (Layer 2), IP = router (Layer 3)".

---

**Question 2.** Which device can separate broadcast domains?

A) Hub

B) Repeater

C) Router

D) Ordinary switch (without VLANs)

**Answer: C**

Explanation: A router (Layer 3) is what finally separates broadcast domains. Hubs and repeaters (Layer 1) cannot even divide collision domains, and an ordinary switch divides collision domains per port but forwards broadcasts to all ports, so there is a single broadcast domain. To reduce the broadcast scope, you need a router or a VLAN.

---

**Question 3.** Which protocol finds the MAC address corresponding to the other side's IP when communicating on the same network?

A) ICMP

B) ARP

C) DNS

D) DHCP

**Answer: B**

Explanation: ARP is the protocol that converts an IP to a MAC, finding it by broadcasting "what is the MAC of this IP?". A (ICMP) is reachability and error messages, C (DNS) is domain→IP conversion, and D (DHCP) is automatic IP assignment, so their roles differ. The key is that ARP is an IP↔MAC mapping.

---

**Question 4.** What is the correct order of the 4 steps (DORA) of DHCP address assignment?

A) Discover → Offer → Request → Acknowledge

B) Request → Offer → Discover → Acknowledge

C) Offer → Discover → Acknowledge → Request

D) Discover → Request → Offer → Acknowledge

**Answer: A**

Explanation: DHCP operates in the order Discover, Offer, Request, Acknowledge, remembered by the acronym DORA. The client looks for a server (Discover), the server proposes an IP (Offer), the client requests that IP (Request), and the server confirms (Acknowledge). The other choices have the order scrambled and are wrong.

---

**Question 5.** Which is correct about the port and transport protocol used by DNS?

A) Port 80, TCP only

B) Port 53, UDP by default, but TCP is also used for large responses and zone transfers

C) Port 67, UDP only

D) Port 22, TCP only

**Answer: B**

Explanation: DNS uses port 53; ordinary queries use UDP 53, and TCP 53 is used when the response is large (over 512 bytes) or for a zone transfer. A (80) is HTTP, C (67) is the DHCP server, and D (22) is the SSH port. The key is "DNS = 53, both UDP/TCP", and "UDP only" is a common wrong answer.

---

**Question 6.** You want to combine two NICs into a redundant setup that normally uses only one and automatically switches to the other NIC on failure. Which bonding mode is appropriate?

A) balance-rr (mode 0)

B) active-backup (mode 1)

C) broadcast (mode 3)

D) 802.3ad/LACP (mode 4)

**Answer: B**

Explanation: active-backup (mode 1) is a redundancy mode that uses only one NIC as active and automatically switches to the backup NIC on failure. A (balance-rr) and D (LACP) are for increasing bandwidth and load balancing, and C (broadcast) sends the same frame to all slaves, for special purposes. Distinguish them as "redundancy = active-backup, bandwidth = LACP".

---

**Question 7.** Which is correct about the difference between bonding and teaming?

A) Bonding is implemented as a user-space daemon, teaming as a kernel module

B) Bonding is implemented as a kernel module (bonding) and teaming as a user-space daemon (teamd), and teaming is the newer method

C) Bonding operates at Layer 3 and teaming at Layer 7

D) The two are completely identical and differ only in name

**Answer: B**

Explanation: Bonding is the traditional method implemented as a kernel module (bonding), and teaming is the newer (RHEL7+) method based on a user-space daemon (teamd) and is more flexible. A swaps the implementation locations, C is inaccurate in distinguishing layers because both aggregate interfaces, and D is wrong because their implementation and era differ.

---
