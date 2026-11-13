# Day 5 - Week 8 Comprehensive Review: Threading Networking Together on a Single Layer Map

## 📌 Key Takeaways

- Everything in networking boils down to **"at which layer, using which address, via which path, under which name"** communication happens.
- The layer is your diagnostic navigation — if the MAC won't resolve, `arp` (2); if it's unreachable, `ping` (3); if a port isn't open, `ss` (4); if a name won't resolve, `dig` (7).
- Subnet in 3 steps: **hosts = 2^(host bits) − 2**, **network address = the largest multiple of the block size that is at most the IP**, **broadcast = the last address of that block**.
- Two boundary traps: **169.254 is not a private IP but APIPA (DHCP failure)**, and **the 172 private range is only 16-31**.
- The distinction **temporary (`ip`, `ifconfig`, editing resolv.conf directly) vs permanent (`ifcfg`, `nmcli con mod`)** is the biggest exam point of this week.

## The Layer Model — Devices, Protocols, and Tools in One Table

| Layer | Address/unit | Device | Protocols | Diagnostic tools |
|------|-----------|------|----------|-----------|
| 7 Application | Data | L7 switch | HTTP, DNS, DHCP, SSH | dig, nslookup |
| 4 Transport | Port/segment | L4 switch | TCP, UDP | ss, netstat |
| 3 Network | IP/packet | Router | IP, ICMP | ping, traceroute |
| 2 Data Link | MAC/frame | Switch, bridge | ARP, Ethernet | arp, ip neigh |
| 1 Physical | Bit | Hub, repeater | — | (check cables and links) |

Points to lock into memory:

- IP, router, ping = Layer 3; MAC, switch, ARP = Layer 2; port, TCP/UDP, ss = Layer 4
- A hub (1) handles only signals, a switch (2) learns MACs, a router (3) does IP routing and separates broadcasts
- DNS and DHCP are Layer 7 application protocols

If you first ask "which layer is this problem at?", the inspection tool is chosen automatically. If the MAC won't resolve, arp (2); if it's unreachable, ping (3); if a port isn't open, ss (4); if a name won't resolve, dig (7). The layer is the navigation for diagnosis.

## IP Classes, Private Ranges, and CIDR Review

| Class | First octet | Default mask | Private range |
|--------|---------|-------------|-----------|
| A | 1~126 | /8 (255.0.0.0) | 10.0.0.0/8 |
| B | 128~191 | /16 (255.255.0.0) | 172.16.0.0/12 |
| C | 192~223 | /24 (255.255.255.0) | 192.168.0.0/16 |

Points to lock into memory:

- 127.x = loopback (localhost), 169.254.x = APIPA (DHCP failure signal)
- The 172 private range is only 16-31, while all of 192.168 is private
- Mask octet sequence: **128 · 192 · 224 · 240 · 248 · 252 · 254 · 255**

> ⚠️ **Trap review**: 169.254.x.x is not a private IP but APIPA (link-local) and is a signal that "no DHCP server was found". 172.32.x.x is outside the private range (16-31) and is a public IP. These two boundaries easily become traps.

## Subnet Calculation — 3 Steps by Hand

| Calculation | Formula |
|------|------|
| Usable hosts | 2^(host bits) − 2 |
| Network address | Largest multiple of the block size that is at most the IP |
| Broadcast address | Next network address − 1 (the last address of the block) |

```bash
# Example: analyzing 192.168.1.200/26
# /26 → 6 host bits → 2^6 - 2 = 62 hosts, block size 64
# Among multiples of 64 (0,64,128,192), the largest at most 200 = 192
Network address  : 192.168.1.192
Usable range     : 192.168.1.193 ~ 192.168.1.254
Broadcast        : 192.168.1.255
```

**Key distinction**: the **−2** in the host count is because the network address (all host bits 0) and the broadcast (all 1s) cannot be given to hosts. /30 gives 2 hosts (router-to-router links), /29 gives 6, /28 gives 14, /26 gives 62. You should be able to answer these values instantly.

## Temporary vs Permanent Configuration — Command Lifetime Review

| Task | Temporary (lost on reboot) | Permanent |
|------|----------------------|------|
| Assign IP | `ip addr add` / `ifconfig` | ifcfg-eth0 / `nmcli con mod` |
| Gateway | `ip route add default` | GATEWAY in ifcfg |
| DNS | Editing resolv.conf directly (risk of being overwritten) | DNS1/2 in ifcfg / `nmcli ... ipv4.dns` |

> ⚠️ **Trap review**: in a NetworkManager environment, a direct edit to resolv.conf disappears on reboot or restart. With ONBOOT=no, the interface does not come up after boot even if the settings are right. You must distinguish "temporary is ip/ifconfig, permanent is ifcfg/nmcli".

## Diagnostic Flow — From Near to Far

```bash
ping 127.0.0.1     # 1. Is the TCP/IP stack OK?
ping 192.168.1.1   # 2. Gateway (L2/L3)?
ping 8.8.8.8       # 3. External IP (routing/firewall)?
ping google.com    # 4. DNS?
ss -tlnp           # 5. Local service ports?
```

The step at which it first gets blocked is the location of the problem. If 3 works and 4 fails, it is DNS; if 2 works and 3 fails, it is routing/firewall beyond the gateway. "IP works but the domain doesn't" = a definitive DNS signal.

## Protocols and Ports Quick Review

| Port | Protocol | Port | Protocol |
|------|----------|------|----------|
| 22 | SSH (encrypted) | 53 | DNS (UDP/TCP) |
| 23 | Telnet (plaintext) | 67/68 | DHCP |
| 25 | SMTP | 80 | HTTP |
| 21 | FTP | 443 | HTTPS |

The first questions of real-world troubleshooting are exactly this week's content — "Is the IP right (Day 1-2), can we reach the gateway (Day 2-3), does DNS resolve (Day 2-3), which layer's device is the problem (Day 4)". Network outages can usually be narrowed down to a cause by checking these four in turn. This week is the foundation of practical networking, beyond just the exam.

## 📖 Glossary

- **Layer**: a stage into which communication responsibilities are divided. It determines both the location of the problem and the inspection tool.
- **Collision domain / broadcast domain**: the scope within which frames can collide (divided by a switch) / the scope over which a broadcast spreads (divided only by a router or VLAN).
- **Block size**: the interval at which subnets are cut for that CIDR. 64 for /26, 32 for /27, 16 for /28.
- **−2 rule**: subtracting the network address and broadcast address when counting hosts. Neither can be given to a host.
- **Mask octet sequence**: 128 · 192 · 224 · 240 · 248 · 252 · 254 · 255. Values filled from the left according to the number of 1s.
- **APIPA (169.254.x.x)**: an address a host assigns itself when DHCP fails. It is not a private IP.
- **Temporary / permanent configuration**: commands that vanish on reboot (`ip`, `ifconfig`) / settings that remain in files (`ifcfg`, `nmcli`).
- **`ONBOOT`**: the ifcfg entry that decides whether to bring the interface up automatically at boot. If `no`, the network doesn't come up.
- **DORA**: the 4 steps of DHCP: Discover → Offer → Request → Acknowledge.
- **Scope of ARP**: only within the same L2 network. When going to another network, it uses the gateway's MAC.
- **active-backup / LACP**: a redundancy mode that fails over when something breaks / a mode that combines multiple links to increase bandwidth.

## 📝 Practice Questions

**Question 1.** In the OSI 7 layers, which is correct about the layer where a router operates and its core function?

A) Layer 2 — delivers frames by MAC address

B) Layer 3 — determines paths between networks based on IP addresses

C) Layer 4 — manages end-to-end connections by port number

D) Layer 1 — amplifies signals

**Answer: B**

Explanation: A router, at Layer 3 (Network), looks at IP addresses to route packets to other networks and separates broadcast domains. A is the function of a Layer 2 switch, C is the role of Layer 4 transport, and D is the function of a Layer 1 repeater. The key is "IP / router = Layer 3".

---

**Question 2.** How many usable hosts are there in the 192.168.10.0/27 network?

A) 32

B) 30

C) 14

D) 62

**Answer: B**

Explanation: /27 has 5 host bits, so 2^5 − 2 = 30. A (32) is the block size without subtracting 2, C (14) is the usable count of /28, and D (62) is the usable count of /26. The −2 is because the network address and broadcast are excluded.

---

**Question 3.** Which gives the correct network address and broadcast address of the network that IP address 10.1.1.100/26 belongs to?

A) Network 10.1.1.64, broadcast 10.1.1.127

B) Network 10.1.1.96, broadcast 10.1.1.127

C) Network 10.1.1.64, broadcast 10.1.1.95

D) Network 10.1.1.0, broadcast 10.1.1.63

**Answer: A**

Explanation: /26 has a block size of 64, so subnets split at 0, 64, 128, and 192. 100 is in the 64-127 range, so the network address is 10.1.1.64 (the largest multiple of 64 at most 100), and the broadcast is the last address of that block, 10.1.1.127. B, C, and D picked the block boundaries incorrectly.

---

**Question 4.** Which of the following is NOT a private IP address?

A) 192.168.50.1

B) 10.255.1.1

C) 172.31.255.254

D) 172.32.1.1

**Answer: D**

Explanation: The Class B private range runs from 172.16.0.0 to 172.31.255.255, so 172.32.1.1 is outside this range and is a public IP. A (192.168.x), B (10.x), and C (172.31.x) all fall squarely in the private ranges. The trap is the boundary that only 16-31 of the 172 range is private.

---

**Question 5.** Which is the correct way to configure a static IP that persists after reboot on a Red Hat-family system?

A) Run only `ip addr add 10.0.0.5/24 dev eth0`

B) Set IPADDR, NETMASK, and ONBOOT=yes in the `ifcfg-eth0` file, or use `nmcli con mod`

C) Add IPADDR to `/etc/resolv.conf`

D) Run only `ifconfig eth0 10.0.0.5`

**Answer: B**

Explanation: Permanent configuration must be done with the `ifcfg-eth0` file or `nmcli con mod`. A and D are temporary settings that vanish on reboot, and the resolv.conf in C is a file that specifies DNS servers, not an IP. The key is the distinction "temporary (ip/ifconfig) vs permanent (ifcfg/nmcli)".

---

**Question 6.** Which command shows the TCP ports currently in LISTEN together with the processes holding them?

A) `ss -tlnp`

B) `ping -c 4 localhost`

C) `dig localhost`

D) `arp -n`

**Answer: A**

Explanation: `ss -tlnp` shows TCP, LISTEN, numeric, and process, letting you confirm which process is listening on which port. B is a reachability check, C is a DNS query, and D is the ARP (L2) table, unrelated to port and process information. It is the standard command for checking port occupancy during a service outage.

---

**Question 7.** `ping 8.8.8.8` succeeds but `ping google.com` fails. Which gives the correct cause and tool to check?

A) A gateway problem, checked with `traceroute`

B) A DNS problem, checked with `dig` or the nameserver in resolv.conf

C) The interface is down, checked with `ip link`

D) A firewall problem, checked with `tcpdump`

**Answer: B**

Explanation: Communication works by IP, so the connection, gateway, and interface are fine, and since only the domain fails, it is a name resolution (DNS) problem. Query with `dig` or inspect the nameserver in resolv.conf. If A, C, or D were the cause, even the IP ping would have failed, so they are all ruled out.

---

**Question 8.** Which Layer 1 device forwards received frames to all ports and shares a collision domain?

A) Switch

B) Router

C) Hub

D) Bridge

**Answer: C**

Explanation: A hub is a Layer 1 device that spreads received signals to all ports and shares a collision domain, so it is inefficient. A (switch) learns MACs at Layer 2 and sends only to the matching port, B (router) is Layer 3, and D (bridge) divides segments at Layer 2. The difference between a hub and a switch is a frequent exam point.

---

**Question 9.** Which gives the correct DHCP address assignment process (DORA) and the ports used?

A) Discover-Offer-Request-Acknowledge, server UDP 67 / client UDP 68

B) Offer-Discover-Request-Acknowledge, TCP 80

C) Discover-Request-Offer-Acknowledge, UDP 53

D) Request-Acknowledge-Discover-Offer, TCP 67

**Answer: A**

Explanation: DHCP operates in the order Discover-Offer-Request-Acknowledge (DORA), and the server uses UDP 67 and the client UDP 68. B is wrong in both order and port (80 is HTTP), C has the order scrambled and port 53 is DNS, and D has the wrong order and DHCP uses UDP, not TCP.

---

**Question 10.** Which redundancy bonding mode combines two NICs, normally uses only one, and automatically switches to the other NIC on failure?

A) balance-rr (mode 0)

B) active-backup (mode 1)

C) broadcast (mode 3)

D) 802.3ad/LACP (mode 4)

**Answer: B**

Explanation: active-backup (mode 1) is a redundancy mode that uses only one NIC as active and automatically switches to the backup on failure. A and D are for increasing bandwidth and load balancing, and C (broadcast) sends the same frame to all slaves, for special purposes. Distinguish them as "redundancy = active-backup, bandwidth = LACP".

---

**Question 11.** Which gives the protocol that finds the MAC corresponding to an IP when hosts on the same subnet communicate, and its scope of operation?

A) DNS — converts domains to IPs across the whole Internet

B) ARP — converts an IP to a MAC within the same local network (L2), and uses the gateway's MAC for destinations on other networks

C) ICMP — converts ports at all layers

D) DHCP — permanently maps IPs to MACs

**Answer: B**

Explanation: ARP converts an IP to a MAC within the same L2 network, and for destinations on other networks it finds the gateway's MAC rather than the other side's. A (DNS) is domain→IP, C (ICMP) is reachability and error messages, unrelated to port conversion, and D (DHCP) is automatic IP assignment, not a permanent IP↔MAC mapping.

---

**Question 12.** Which statement about a CIDR /29 network is correct?

A) It has 8 usable hosts and the subnet mask is 255.255.255.240

B) It has 6 usable hosts and the subnet mask is 255.255.255.248

C) It has 14 usable hosts and the subnet mask is 255.255.255.224

D) It has 2 usable hosts and the subnet mask is 255.255.255.252

**Answer: B**

Explanation: /29 has 3 host bits, so 2^3 − 2 = 6 hosts, and with five 1s in the last octet (11111000) the mask is 248. A (8 hosts) is the block size without subtracting 2 and 240 is /28, C (14 hosts, 224) mixes the /28 host count with the /27 mask, and D (2 hosts, 252) is the values for /30.

---
