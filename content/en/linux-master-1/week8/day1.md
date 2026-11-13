# Day 1 - Networking Basics: The OSI 7 Layers and IP Address / Subnet Calculation

## 📌 Key Takeaways

- Network troubleshooting boils down to two questions: **"At which layer is it blocked?" (the layer model)** and **"Which network does it belong to?" (subnet calculation)**.
- Memorize the address and device for each layer as a set: **Layer 2 = MAC / switch, Layer 3 = IP / router, Layer 4 = port / TCP and UDP.**
- **TCP is connection-oriented and reliable (3-way handshake); UDP is connectionless and fast.** Header sizes are 20 bytes vs 8 bytes.
- IP classes are decided by the first octet (A 1-126, B 128-191, C 192-223). **127 is loopback**, and **169.254 is APIPA = a sign that DHCP failed**.
- **Usable hosts = 2^(host bits) − 2.** The network address is "the largest multiple of the block size that is less than or equal to the IP", and the broadcast address is the last address of that block.

## The OSI 7 Layers — Splitting Communication into 7 Responsibilities

- Network communication is not a single lump; it is a stack of **7 layers, each doing a different job**.
- **Encapsulation**: on the sending side, data moves from the top (Layer 7) down to the bottom (Layer 1), and each layer adds its header.
- **Decapsulation**: on the receiving side, data moves from the bottom up, and the headers are stripped off.

| Layer | Name | Core responsibility | Data unit (PDU) | Typical devices / protocols |
|------|------|-----------|------------------|--------------------|
| 7 | Application | Provides user services | Data | HTTP, FTP, SMTP, DNS |
| 6 | Presentation | Encoding, encryption, compression | Data | SSL/TLS, JPEG, ASCII |
| 5 | Session | Establishing, maintaining, and ending connections | Data | NetBIOS, RPC |
| 4 | Transport | End-to-end reliability, ports | Segment | TCP, UDP |
| 3 | Network | Logical addressing, routing | Packet | IP, ICMP, router |
| 2 | Data Link | Physical addressing, frames, error control | Frame | Ethernet, MAC, switch |
| 1 | Physical | Transmitting bits as electrical signals | Bit | Cable, hub, repeater |

Mnemonic: "**A**ll **P**eople **S**eem **T**o **N**eed **D**ata **P**rocessing" (7→1: Application, Presentation, Session, Transport, Network, Data link, Physical). For 1→7, use "**P**lease **D**o **N**ot **T**hrow **S**ausage **P**izza **A**way". The exam has questions that ask about layer order.

**Key distinction**: pair each layer number with that layer's **address and device**. Layer 2 = MAC address / switch, Layer 3 = IP address / router, Layer 4 = port number / TCP and UDP. "Which layer is a MAC address?" → Layer 2. "Which layer is a router?" → Layer 3. This mapping is the root of the Day 4 device questions.

## The TCP/IP 4 Layers — The Model the Real Internet Uses

- OSI is a **theoretical reference model**, while the real Internet runs on the simpler **TCP/IP 4-layer model**.
- The TCP/IP 4 layers are a form that merges several OSI layers.

| TCP/IP layer | Corresponding OSI layers | Typical protocols |
|-------------|---------------|---------------|
| Application | 7, 6, 5 | HTTP, FTP, DNS, SMTP, SSH |
| Transport | 4 | TCP, UDP |
| Internet | 3 | IP, ICMP, ARP |
| Network Access | 2, 1 | Ethernet, ARP |

TCP/IP is the "practical model" that developed through real implementation on the US ARPANET in the 1970s, while OSI is the "theoretical model" standardized by ISO in 1984. The real Internet is dominated by TCP/IP, but the 7 layers are more precise as a language for analyzing problems, so both are used. The exam asks about the correspondence between the OSI 7 layers and the TCP/IP 4 layers.

## TCP vs UDP — The Two Faces of Layer 4

- The transport layer has **two protocols with opposite personalities**.

| Item | TCP | UDP |
|------|-----|-----|
| Connection method | Connection-oriented (3-way handshake) | Connectionless |
| Reliability | Guaranteed (retransmission, ordering, flow control) | Not guaranteed |
| Speed | Relatively slow | Fast |
| Header size | 20 bytes | 8 bytes |
| Uses | Web, email, file transfer | DNS, streaming, VoIP |

TCP's **3-way handshake** establishes a connection in 3 steps: SYN → SYN/ACK → ACK. Connection teardown is a 4-way exchange (two FIN/ACK pairs). UDP just sends with no such procedure — so it is fast but gives no delivery guarantee. Summarize it as "reliability = TCP, speed = UDP".

## IP Address Classes — 5 Grades Split by the First Octet

- An IPv4 address divides **32 bits into 4 groups of 8 bits (octets)** and is written with dots (e.g., 192.168.0.1).
- In the past, **the class was determined by the value of the first octet**, which set the boundary between the network and host portions.

| Class | First octet range | Default subnet mask | Network/host bits | Use |
|--------|--------------|-------------------|----------------------|------|
| A | 1 ~ 126 | 255.0.0.0 (/8) | 8 / 24 | Large |
| B | 128 ~ 191 | 255.255.0.0 (/16) | 16 / 16 | Medium |
| C | 192 ~ 223 | 255.255.255.0 (/24) | 24 / 8 | Small |
| D | 224 ~ 239 | None | — | Multicast |
| E | 240 ~ 255 | None | — | Research / reserved |

> ⚠️ **Trap**: first octet **127** (127.0.0.0/8) looks like it falls within the Class A range, but it is reserved for **loopback** and is not assigned to ordinary hosts. That is why the practical Class A range is written as 1-126. `127.0.0.1` is the machine itself (localhost).

- Also memorize the **private IP ranges** (addresses used only inside internal networks, not routed directly on the Internet).

| Class | Private IP range |
|--------|--------------|
| A | 10.0.0.0 ~ 10.255.255.255 (10.0.0.0/8) |
| B | 172.16.0.0 ~ 172.31.255.255 (172.16.0.0/12) |
| C | 192.168.0.0 ~ 192.168.255.255 (192.168.0.0/16) |

**Key distinction**: 169.254.x.x is not a private IP; it is an **APIPA (link-local)** address. It is an address a host assigns itself when it cannot find a DHCP server, so "the IP starts with 169.254 but the Internet doesn't work" = a sign that DHCP failed. This concept is used both in practice and on the exam.

## Subnet Mask and CIDR — The Boundary Between Network and Host

- A subnet mask is a 32-bit value that tells you **where the network portion of an IP address ends and the host portion begins**.
- **The bits filled with 1 are the network; the bits that are 0 are the host.**

```bash
# 255.255.255.0 in binary
11111111.11111111.11111111.00000000
#  └─────── network (24 bits) ──────┘ └ host (8 bits) ┘
```

- **CIDR notation** writes the number of 1s after a slash. `/24` = 24 leading 1s in the mask = 255.255.255.0.

| CIDR | Subnet mask | Last octet in binary | Block size |
|------|--------------|-------------------|-----------|
| /24 | 255.255.255.0 | 00000000 | 256 |
| /25 | 255.255.255.128 | 10000000 | 128 |
| /26 | 255.255.255.192 | 11000000 | 64 |
| /27 | 255.255.255.224 | 11100000 | 32 |
| /28 | 255.255.255.240 | 11110000 | 16 |
| /29 | 255.255.255.248 | 11111000 | 8 |
| /30 | 255.255.255.252 | 11111100 | 4 |

A mask octet value is the result of filling that many 1s from the left. 128 = one 1, 192 = two, 224 = three, 240 = four, 248 = five, 252 = six. If you memorize the sequence "**128 192 224 240 248 252 254 255**", you can instantly convert any CIDR to a mask.

## Subnet Calculation — Host Count, Network Address, Broadcast

- This is the heart of the practical exam. Learn the hand calculation by breaking it into steps.

**1) Usable hosts = 2^(host bits) − 2**

- **Why subtract 2**: because the **network address** (all host bits 0) and the **broadcast address** (all host bits 1) are removed.
- These two **cannot be assigned to hosts.**

```bash
# /24 → 8 host bits → 2^8 - 2 = 254 hosts
# /26 → 6 host bits → 2^6 - 2 = 62 hosts
# /30 → 2 host bits → 2^2 - 2 = 2 hosts (for router-to-router links)
```

**2) Finding the network and broadcast addresses (example: 192.168.1.0/26)**

- /26 has a **block size of 64**. The last octet splits subnets in units of 0, 64, 128, and 192.

```bash
# The first subnet of 192.168.1.0/26
Network address     : 192.168.1.0      (all host bits 0)
First usable address: 192.168.1.1
Last usable address : 192.168.1.62
Broadcast           : 192.168.1.63     (all host bits 1)
# The next subnet is 192.168.1.64/26, then 192.168.1.128/26 ...
```

**Key distinction**: the network address of the network an IP belongs to is "the largest multiple of the block size that is less than or equal to the IP". Example: 192.168.1.100/26 has block size 64 → among multiples of 64 (0, 64, 128, 192), the largest that is at most 100 is 64 → network address 192.168.1.64, broadcast 192.168.1.127. You need this calculation on the practical exam.

**3) Try it yourself — verify with ipcalc**

```bash
# ipcalc shows the subnet calculation automatically (install it if missing)
ipcalc 192.168.1.100/26
# Network:   192.168.1.64/26
# HostMin:   192.168.1.65
# HostMax:   192.168.1.126
# Broadcast: 192.168.1.127
# Hosts/Net: 62
```

- If you get into the habit of calculating by hand first and then **checking** with `ipcalc`, you can solve problems quickly and accurately in the exam room even without tools.

> ⚠️ **Trap**: "/31" has only 1 host bit, so 2^1−2 = 0 and it normally cannot hold any hosts, but under RFC 3021 it is an exception on point-to-point links between routers, where both addresses are used. On the exam, the standard is questions that apply the −2 formula, such as "/30 holds 2 hosts, /29 holds 6".

Starting tomorrow (Day 2), `ip addr`, gateways, and routing all operate on top of the Layer 3 foundation we built today.

## 📖 Glossary

- **Encapsulation / decapsulation**: headers being added as data moves down through the layers / being stripped as it moves up.
- **PDU**: the unit of data each layer handles. Layer 4 is a segment, Layer 3 is a packet, Layer 2 is a frame, Layer 1 is a bit.
- **MAC address**: the Layer 2 physical address. A unique number burned into the device, used only within the same network.
- **3-way handshake**: the 3-step procedure by which TCP establishes a connection: SYN → SYN/ACK → ACK. Teardown is two FIN/ACK pairs (4-way).
- **Octet**: an 8-bit group that makes up an IPv4 address. The 32 bits are divided into four chunks.
- **Loopback (127.0.0.1)**: an address that refers to the machine itself. It lies within the Class A range but is not assigned to hosts.
- **Private IP**: an address used only inside internal networks and not routed to the Internet (10/8, 172.16-31, 192.168).
- **APIPA (169.254.x.x)**: a link-local address a host assigns itself when it cannot find a DHCP server. A sign that the Internet won't work.
- **Subnet mask**: a 32-bit value that marks the boundary between the network and host portions of an IP. 1 is network, 0 is host.
- **CIDR (`/24`)**: notation that writes the number of 1s in the mask after a slash. `/24` means 255.255.255.0.
- **Block size**: the interval at which subnets are divided for that CIDR. For /26 they break every 64 (0, 64, 128, 192).
- **Network address / broadcast address**: the address with all host bits 0 / the address with all host bits 1. Neither can be given to a host.

## 📝 Practice Questions

**Question 1.** Which of the OSI 7 layers determines the path of a packet (routing) based on its IP address?

A) Layer 2 (Data Link) — delivers frames by MAC address

B) Layer 3 (Network) — routes packets by IP address

C) Layer 4 (Transport) — end-to-end connections by port number

D) Layer 7 (Application) — provides services to users

**Answer: B**

Explanation: Routing based on IP addresses is the responsibility of Layer 3 (Network), and its typical device is the router. A (Layer 2) delivers frames within the same network by MAC address, C (Layer 4) provides end-to-end reliability by port, and D (Layer 7) handles application services. The key is the distinction "IP / router = Layer 3, MAC / switch = Layer 2".

---

**Question 2.** How many usable IP addresses (assignable to hosts) are there in the 192.168.10.0/26 network?

A) 64

B) 62

C) 32

D) 30

**Answer: B**

Explanation: /26 has 6 host bits, so 2^6 − 2 = 62. The −2 excludes the network address (all host bits 0) and the broadcast address (all 1s). A (64) is the full block size without subtracting 2, C (32) is the block size of /27, and D (30) is the number of usable hosts of /27.

---

**Question 3.** What is the broadcast address of the network that the IP address 172.20.5.130/25 belongs to?

A) 172.20.5.127

B) 172.20.5.128

C) 172.20.5.255

D) 172.20.5.191

**Answer: C**

Explanation: /25 has a block size of 128, so subnets split at 0 and 128. 130 falls in the 128-255 range, so the network address is 172.20.5.128 and the broadcast is the last address of that block, 172.20.5.255. A (127) is the broadcast of the first subnet (0-127), B (128) is the network address of the second subnet, and D (191) is a /26 block boundary, so it is wrong.

---

**Question 4.** Which of the following is NOT a private IP address?

A) 10.50.0.1

B) 172.16.200.5

C) 192.168.1.100

D) 172.32.0.1

**Answer: D**

Explanation: The Class B private range is 172.16.0.0 ~ 172.31.255.255, so 172.32.0.1 is outside this range and is a public IP. A (10.x) is Class A private, C (192.168.x) is Class C private, and B (172.16.x) falls squarely in the Class B private range. The trap is the boundary: only 16-31 of the 172 range is private.

---

**Question 5.** Which statement about TCP and UDP is correct?

A) TCP is connectionless and UDP establishes a connection with a 3-way handshake

B) TCP is a connection-oriented protocol that guarantees reliability, and UDP is connectionless and fast

C) Both transfer data after establishing a connection and have the same reliability

D) UDP performs retransmission and order control, while TCP does not

**Answer: B**

Explanation: TCP establishes a connection with a 3-way handshake and guarantees reliability through retransmission, ordering, and flow control, while UDP is connectionless and transmits quickly without such procedures. A describes the two the wrong way around, C is wrong in saying the reliability is the same, and D is reversed because TCP is the one that performs retransmission and order control.

---

**Question 6.** Which is the correct subnet mask for CIDR notation /28?

A) 255.255.255.192

B) 255.255.255.224

C) 255.255.255.240

D) 255.255.255.248

**Answer: C**

Explanation: /28 has four 1s in the last octet (11110000), which is 240. In the sequence of octet values by number of 1s (128, 192, 224, 240, 248, 252), the fourth is 240. A (192) corresponds to /26, B (224) to /27, and D (248) to /29. It helps to remember it as a bundle: "/28 → 240, 14 usable out of 16 hosts".

---

**Question 7.** A host's IP is automatically set to 169.254.12.34 and the Internet does not work. What is the most likely cause?

A) A normal public IP has been assigned

B) It could not get an address from the DHCP server, so an APIPA (link-local) address was assigned automatically

C) The loopback address was configured incorrectly

D) The subnet mask is set to /8

**Answer: B**

Explanation: 169.254.0.0/16 is the APIPA (link-local) range, an address a host assigns itself when it cannot find a DHCP server. Therefore it does not know the gateway, so the Internet does not work. A is wrong because it is not a public IP, the loopback in C is the 127.0.0.0/8 range, and D's mask issue is unrelated. Remember "169.254 = DHCP failure signal".

---
