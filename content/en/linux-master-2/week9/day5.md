# Day 5 - Week 9 Review: The Network on One Page

## 📌 Key Takeaways

- The OSI 7 layers, bottom to top — **Physical, Data Link, Network, Transport, Session, Presentation, Application**. **A router is Layer 3, a switch is Layer 2, a hub is Layer 1**.
- **CD is for wired (Ethernet), CA is for wireless (Wi-Fi)**.
- **An ATM cell is 53 bytes**, and **FDDI is a dual fiber-optic ring with token passing**.
- **254 · 126 · 62 · 30 · 14 · 6 · 2** — the host-count row for Class C subnets.
- **`hosts` is where you write down the answers, `resolv.conf` is where you write down whom to ask**.

## The Network on One Page

```text
   OSI 7 layers                     TCP/IP        Device        Unit
   ─────────────────────────────────────────────────────────────────
   7 Application  HTTP·FTP·SMTP·DNS  ┐
   6 Presentation Encryption·compression ├─ Application  Gateway  Data
   5 Session      Connection mgmt    ┘
   4 Transport    TCP · UDP · ports  ── Transport      Gateway     Segment
   3 Network      IP · ICMP · ARP    ── Internet       Router      Packet
   2 Data Link    MAC · Ethernet     ┐
   1 Physical     Cable·signal       ┘─ Network Access Switch/Hub  Frame/Bit

   Ports  21 FTP · 22 SSH · 23 TELNET · 25 SMTP · 53 DNS
          80 HTTP · 110 POP3 · 143 IMAP · 443 HTTPS

   Switching  Circuit switching (PSTN, dedicated path) ↔ Packet switching (PSDN, cut into pieces)
              Packet switching = Datagram (connectionless) + Virtual circuit (connection-oriented)

   Access  CSMA/CD wired · CSMA/CA wireless · Token passing (Token Ring·FDDI)

   WAN    X.25 → Frame Relay → ATM (fixed 53-byte cell)
          FDDI fiber dual-ring token passing · DQDB MAN (802.6)

   IEEE   802.3 Ethernet · 802.5 Token Ring · 802.6 DQDB · 802.11 Wireless LAN

   Addr   A 1~126 · B 128~191 · C 192~223 · D 224~239 (multicast)
          Private 10.x · 172.16~31.x · 192.168.x · Loopback 127.0.0.1
          Hosts = (256 − mask) − 2
```

## Subnet Calculation One More Time

| Mask | /Notation | Block | **Hosts** |
|-------|------|------|----------|
| 255.255.255.**0** | /24 | 256 | **254** |
| 255.255.255.**128** | /25 | 128 | **126** |
| 255.255.255.**192** | /26 | 64 | **62** |
| 255.255.255.**224** | /27 | 32 | **30** |
| 255.255.255.**240** | /28 | 16 | **14** |
| 255.255.255.**248** | /29 | 8 | **6** |
| 255.255.255.**252** | /30 | 4 | **2** |

```text
   256 − last value of the mask = block size
   block size − 2 = number of usable hosts
   256 ÷ block size = number of subnets
```

### Same IP, Different Mask

Keep the IP fixed at `192.168.1.130` and change only the mask. You can see at a glance that **the longer the mask, the narrower the network the address belongs to**.

| Mask | Block | Network address | Broadcast address | Host range | Count |
|-------|------|------------|---------------|-----------|-----|
| /25 | 128 | .128 | .255 | .129 ~ .254 | 126 |
| /26 | 64 | .128 | .191 | .129 ~ .190 | 62 |
| /27 | 32 | .128 | .159 | .129 ~ .158 | 30 |
| /28 | 16 | .128 | .143 | .129 ~ .142 | 14 |
| /29 | 8 | .128 | .135 | .129 ~ .134 | 6 |
| /30 | 4 | .128 | .131 | .129 ~ .130 | 2 |

- With every mask, 130 falls into the block that starts at 128, so the network address came out the same. What changes is **the end of the block**. The broadcast address is always **network address + block size − 1**.
- `/30` has **exactly 2** hosts. It is the smallest subnet, used for a segment that links two devices one-to-one.

### Are Two Addresses in the Same Subnet?

| Two addresses | Mask | Boundary | Verdict |
|--------|-------|------|------|
| 192.168.1.**60** and 192.168.1.**70** | /25 (block 128) | Both within 0 ~ 127 | **Same subnet** — direct communication |
| 192.168.1.**60** and 192.168.1.**70** | /26 (block 64) | 60 is in 0 ~ 63, 70 is in 64 ~ 127 | **Different subnets** — a router is needed |
| 192.168.1.**100** and 192.168.1.**126** | /27 (block 32) | Both within 96 ~ 127 | **Same subnet** |
| 192.168.1.**126** and 192.168.1.**127** | /27 (block 32) | 127 is the **broadcast address** of that block | 127 cannot be assigned to a host |

- **Numbers that are close can still be different networks if a boundary lies between them.** 60 and 70 differ by only 10, but under `/26` the boundary at 64 separates them.
- When you are given an address, first check **that it is not the first (network) or last (broadcast) address of its block**. Questions that ask you to pick "an address that cannot be assigned to a host" take this form.

## Threading Four Days Through One Connection

This is what happens when you type `www.example.com` into a browser on a computer whose IP is `192.168.0.10/24` and whose default gateway is `192.168.0.1`.

```text
   1  Name → IP          Check /etc/hosts; if it is not there, ask the DNS server (port 53) in /etc/resolv.conf
                         → receive 93.184.216.34                              (Day 4)
   2  Inside or outside?  My network is 192.168.0.0 ~ 192.168.0.255. 93.x is outside
                         → send it to the default gateway 192.168.0.1          (Days 3·4)
   3  IP → MAC           Find the gateway's MAC with ARP                       (Day 1)
   4  Encapsulation       Send it out as a [ MAC | IP | TCP | data ] frame      (Day 1)
   5  Path selection      Routers look at the IP and pass the packet to the next hop (Day 2, packet switching)
   6  Connect and request TCP 3-way handshake, then an HTTP request to port 80  (Day 1)
```

| If this step breaks | Symptom you see | What to check |
|------------|-----------|----------|
| 1 | It works by IP but not by name | `/etc/resolv.conf`, `nslookup` |
| 2 | Hosts on the same network work but the outside does not | The `default` line of `ip route` |
| 3 | You cannot even reach the device right next to you | Cable, `arp -n`, IP and mask |
| 6 | `ping` works but only that one service does not | Whether the other side's port is open — `netstat -tulpn` |

- **Three kinds of addresses are nested inside one frame.** The port means "which program", the IP means "which computer", and the MAC means "which device is the very next hop".
- That is why the **destination IP stays the same all the way**, while the **MAC changes to the next segment's each time the packet passes a router.** It is also why step 3 looks for the **gateway's MAC**, not the server's.
- A switch looks only at the MAC in step 4, while a router opens up to the IP in step 5. **A device's layer = the layer of the header it opens.**

### Putting Commands on the Layers

| Command | What it shows | Layer · address it touches |
|------|-----------|----------------|
| `ethtool` | Link status, speed | Layer 1 |
| `arp` · `ip neigh` | IP ↔ MAC table | Layer 2 — **MAC** |
| `ifconfig` · `ip addr` | Interface IP and MAC | Layers 2·3 |
| `route` · `ip route` | Routing table, default gateway | Layer 3 — **IP** |
| `ping` · `traceroute` | Reachability, path | Layer 3 — ICMP |
| `netstat` · `ss` | Open ports, connections | Layer 4 — **port** |
| `nslookup` · `dig` · `host` | Name ↔ IP | Layer 7 — DNS |

- Sweeping from bottom to top gives you a **troubleshooting order** as is. Is the cable attached → is an address assigned → is there a route → is the port open → does the name resolve?

## Comparing Easily Confused Pairs

| Item | A | B | Distinguishing criterion |
|------|---|---|-----------|
| OSI vs TCP/IP | **7 layers, theory** | 4 layers, practice | Purpose |
| Switch vs router | **Layer 2, MAC** | **Layer 3, IP** | Address it looks at |
| MAC vs IP | Hardware, fixed | **Configured, changeable** | Where it is engraved |
| TCP vs UDP | **Reliable, connection-oriented** | **Fast, connectionless** | What it prioritizes |
| Circuit vs packet switching | **PSTN**, dedicated | **PSDN**, split up | Path occupancy |
| Datagram vs virtual circuit | Connectionless | **Connection-oriented, order kept** | Whether the path is fixed |
| CSMA/CD vs CA | **Wired**, detection | **Wireless**, avoidance | Medium |
| X.25 vs Frame Relay | More error checking, slow | **Trimmed down, fast** | Assumes good line quality |
| Class A vs C | 1~126 | **192~223** | First octet |
| `/etc/hosts` vs `resolv.conf` | **Name↔IP answers** | **DNS servers to ask** | What gets written |
| `ifconfig` vs `ip` | Old net-tools | **Current iproute2** | Generation |
| `ping` vs `traceroute` | **Can I reach it?** | **Where does it get blocked?** | What it tells you |

## Commonly Missed Points

1. **"Layer 5 is Transport"** → **Layer 4 is Transport**; Layer 5 is Session.
2. **"A switch is Layer 3"** → It is **Layer 2**. Layer 3 is the router.
3. **"UDP guarantees reliability"** → It does not. **TCP** does.
4. **"CSMA/CA is wired"** → **CA is wireless**, and **CD is wired**.
5. **"An ATM cell is 48 bytes"** → It is **53 bytes**. 48 is only the data portion.
6. **"127 is Class A"** → It is left out of the range. It is **reserved for loopback**.
7. **"All of 172.x is private IP"** → Only **172.16 ~ 172.31** is.
8. **"255.255.255.192 means 64 hosts"** → It is **62**. You must subtract 2.
9. **"A mask like 255.255.255.100"** → It cannot exist. **The 1 bits must be contiguous from the left**.
10. **"Write the DNS server in `/etc/hosts`"** → It goes in **`/etc/resolv.conf`**.
11. **"IPv6 is 64 bits"** → It is **128 bits**. IPv4 is 32 bits.

## Telling Look-Alike Names Apart

| Look-alikes | One line to tell them apart |
|--------|------------|
| **ISO** / **OSI** | ISO is the **organization**, OSI is the **7-layer model** that organization made |
| **IEEE** / **IETF** | IEEE sets the **802 (LAN) standards**, IETF produces **RFCs (Internet protocols)** |
| **IANA** / **ICANN** | Both manage addresses and names. **IANA does the hands-on number assignment**, ICANN oversees |
| **PSTN** / **PSDN** | T is telephone (circuit switching), D is data (packet switching) |
| **ARP** / **RARP** | IP → MAC / MAC → IP |
| **FDDI** / **DQDB** | Dual **ring** (fiber) / dual **bus** (MAN) |
| **Token Ring** / **FDDI** | Both use token passing. 802.5 / fiber dual ring |
| **Hub** / **Switch** | Floods to everyone (Layer 1) / looks at the MAC and sends only to that port (Layer 2) |
| **Network address** / **Broadcast address** | All host bits 0 / all host bits 1 |
| **`netstat -r`** / **`netstat -i`** | Routing table / interface statistics |
| **`ip addr`** / **`ip link`** | Handles addresses / turns devices on and off |

### Telling Look-Alike Numbers Apart

| Number | Confusing pair | How to tell them apart |
|-----|-----------|------|
| **48** | 48 data bytes of an ATM cell / 48-bit MAC address | **Different units** — bytes vs bits |
| **53** | 53-byte ATM cell / DNS port 53 | The same number by coincidence |
| **64 / 62** | Address count / host count of `/26` | Whether you subtracted 2 |
| **126** | Last first octet of Class A / host count of `/25` | Range vs count |
| **127** | Loopback range | The value missing between A and B |
| **802.3 / 802.5 / 802.11** | Ethernet / Token Ring / wireless LAN | 3 is wired CSMA/CD, 11 is wireless CSMA/CA |

## Values That Appear on the Exam as They Are

| Value | What it is |
|-----|------|
| **7 / 4** | Number of OSI layers / number of TCP/IP layers |
| **53 bytes** | ATM cell size |
| **62** | Host count of `/26` (255.255.255.192) |
| **32 / 128 bits** | IPv4 / IPv6 address length |
| **48 bits** | MAC address length |
| **127.0.0.1** | Loopback |
| **0~1023** | Well-known port range |
| **22 / 23 / 25 / 53 / 80 / 110** | SSH / TELNET / SMTP / DNS / HTTP / POP3 |

> Next week is Internet services. It covers the web, mail, DNS, remote access, and file sharing. **20 of the 32 Linux Usage questions come from this area**, so it carries the greatest weight.

## 📖 Glossary

- **OSI 7 layers** : A reference model that divides communication into seven stages, from Physical to Application.
- **CSMA/CD** : The wired Ethernet method that detects collisions and retransmits.
- **ATM** : A transmission method that uses fixed 53-byte cells.
- **Subnet mask** : A value that separates the network portion from the host portion.
- **Private IP** : Addresses used only inside an internal network. The 10, 172.16~31, and 192.168 ranges.
- **Default gateway** : The router that traffic leaving the network passes through.

## 📝 Practice Questions

**Question 1.** In the OSI 7 layers, which layer does a switch operate at?

A) Layer 1  
B) Layer 2  
C) Layer 3  
D) Layer 4  

**Answer: B**  
Explanation: A switch looks at MAC addresses and forwards frames within the same network, so it is a Layer 2 (Data Link) device. Repeaters and hubs belong to Layer 1, and routers, which choose paths by IP address, belong to Layer 3.

---

**Question 2.** Which medium access control method is used in wireless LANs?

A) CSMA/CD  
B) Token passing  
C) Polling  
D) CSMA/CA  

**Answer: D**  
Explanation: In a wireless environment the signal is weak and collisions are hard to detect, so the CSMA/CA method, which avoids collisions before transmitting, is used; it is standardized as IEEE 802.11. Wired Ethernet uses CSMA/CD, which detects collisions and retransmits.

---

**Question 3.** Which of the following is the loopback address that points to the host itself?

A) 127.0.0.1  
B) 0.0.0.0  
C) 192.168.0.1  
D) 255.255.255.255  

**Answer: A**  
Explanation: 127.0.0.1 is the loopback address that points to the host itself, and it is associated with the name `localhost`. The entire range starting with 127 is reserved for this purpose, so it is excluded from the Class A range.

---

**Question 4.** When the subnet mask 255.255.255.224 is applied to a Class C network, how many usable hosts does one subnet have?

A) 32  
B) 62  
C) 30  
D) 14  

**Answer: C**  
Explanation: Subtracting 224 from 256 gives a block size of 32, and removing the network address and broadcast address from that leaves 30 usable hosts. With a mask of 192 it is 62, and with 240 it is 14.

---

**Question 5.** What is the default port number of SMTP, which is used to send mail?

A) 21  
B) 23  
C) 25  
D) 110  

**Answer: C**  
Explanation: SMTP is the protocol that sends mail using port 25. Port 110 is used by POP3, which retrieves mail, port 21 by FTP control, and port 23 by TELNET.

---

**Question 6.** Which of the following is **not** in a private IP address range?

A) 10.1.1.1  
B) 172.35.0.1  
C) 192.168.1.1  
D) 172.20.0.1  

**Answer: B**  
Explanation: The Class B private range is 172.16.0.0 through 172.31.255.255, so an address starting with 172.35 is a public IP. The ranges starting with 10 and with 192.168 are the private IPs of Class A and Class C, respectively.
