# Day 1 - The OSI 7 Layers and TCP/IP

## 📌 Key Points

- The OSI 7 layers, from the bottom up, are **Physical · Data Link · Network · Transport · Session · Presentation · Application**.
- Memorize them with the first letters as the sentence **"Please Do Not Throw Sausage Pizza Away"** (Physical, Data link, Network, Transport, Session, Presentation, Application).
- Devices by layer — **Layer 1 repeater/hub, Layer 2 bridge/switch, Layer 3 router, Layer 4 and above gateway**.
- Data units — **1 bit, 2 frame, 3 packet, 4 segment**.
- **TCP/IP has 4 layers** and is the real-world implementation model that groups the OSI 7 layers.

## The OSI 7 Layers

```text
   7  Application (Application)    The service the user meets      HTTP · FTP · SMTP · DNS
   6  Presentation (Presentation)  Encryption · compression · encoding   JPEG · ASCII · SSL
   5  Session (Session)            Manages start and end of connections
   ─────────────────────────────────────────────────────────────
   4  Transport (Transport)        End-to-end delivery, reliability   TCP · UDP     Segment
   3  Network (Network)            Path selection, addressing         IP · ICMP     Packet
   2  Data Link (Data Link)        Delivery within one network, error detection   MAC · Ethernet   Frame
   1  Physical (Physical)          Converts to electrical signals     Cable · hub   Bit
```

| Layer | Name | What it does | Typical device | Data unit |
|-----|------|--------|----------|-----------|
| **7** | **Application** | User services | Gateway | Data |
| **6** | **Presentation** | **Encryption, compression, format conversion** | | Data |
| **5** | **Session** | Keeps connections alive, synchronization | | Data |
| **4** | **Transport** | **End-to-end reliability**, ports | Gateway | **Segment** |
| **3** | **Network** | **Path selection (routing)**, IP addresses | **Router** | **Packet** |
| **2** | **Data Link** | Delivery within one network, **MAC addresses** | **Bridge, switch** | **Frame** |
| **1** | **Physical** | Sends electrical signals | **Repeater, hub** | **Bit** |

> You must be able to **map layer numbers to names instantly**. Questions look like "What is layer 3?" → Network, or "Which layer is a router?" → Layer 3.

### Addresses differ by layer

| Layer | Address |
|-----|------|
| **Layer 2** | **MAC address** (physical address, 48 bits) |
| **Layer 3** | **IP address** (logical address) |
| **Layer 4** | **Port number** |

- **A MAC is an address burned into the hardware**, so it does not change, while **an IP is changed by configuration.**
- A MAC address is written as **12 hexadecimal digits**, like `00:1a:2b:3c:4d:5e`. One hex digit is 4 bits, so 12 × 4 = **48 bits**. The first half (24 bits) is the **manufacturer number**, and the second half is a serial number assigned by the manufacturer.
- The body that created the OSI model is **ISO** (International Organization for Standardization). Its letters are a flipped version of OSI's, so remember it as **"ISO made OSI"**.

### Finding the layer from a description

Many questions do not ask for the layer name directly but **give a description and ask which layer it is**. Use the clue words in the sentence to sort them out.

| If the sentence contains this | Layer |
|---------------------|------|
| Electrical/mechanical characteristics, cable, signal, bit transmission | **1 Physical** |
| Between two adjacent devices, frame, MAC address, error detection | **2 Data Link** |
| Path setup (routing), logical address (IP), packet | **3 Network** |
| End-to-end, port, flow control, retransmission | **4 Transport** |
| Dialog control, setting up/maintaining/releasing a connection, synchronization points | **5 Session** |
| Encryption, compression, code/format conversion | **6 Presentation** |
| Provides services to users, mail/web/file transfer | **7 Application** |

- **Layers 2 and 4 get mixed up most often.** Both deal with "errors" and "flow," but **Layer 2 is responsible up to the device right next to it**, while **Layer 4 is responsible for the whole trip from source to destination**. "Adjacent" means 2, "end-to-end" means 4.
- **Layers 5 and 6 are decided by one keyword.** If you see "encryption/compression," it is Presentation; if you see "dialog/synchronization," it is Session.

### Devices are sorted by "what they look at to forward"

| Device | Layer | What it looks at | What it does |
|------|-----|--------|--------|
| **Repeater** | 1 | Looks at nothing | **Amplifies the weakened signal** and sends it farther |
| **Hub** | 1 | Looks at nothing | Sends incoming signals out **to all ports** |
| **Bridge** | 2 | **MAC address** | Connects two segments and passes along only the frames that are needed |
| **Switch** | 2 | **MAC address** | Sends only **to the port** where the destination MAC is connected |
| **Router** | 3 | **IP address** | Connects **different networks** and chooses paths |
| **Gateway** | 4~7 | Upper-layer content | **Translates between networks with different protocols** and connects them |

- **A hub and a switch look the same but sit at different layers.** A hub cannot read addresses, so it broadcasts to everyone, while a switch remembers MAC addresses and sends only to the matching port.
- Pair them up as **"a hub is a repeater with multiple ports, a switch is a bridge with multiple ports"** and you have two Layer 1 devices and two Layer 2 devices sorted in one go.
- Here, **gateway** is a device name in the layer model. The **default gateway** that appears on Day 4 (the address of the exit to the outside) is actually handled by a router. The same word is used with two meanings.

## Encapsulation — Headers Are Added on the Way Down

On the sending side, data goes **from the upper layers down to the lower layers**, and each layer adds one **header**. The receiving side goes back up and strips them off one by one.

```text
   7~5 Application data                                 [ Data ]
   4   Transport    + TCP header (port numbers)    [ TCP | Data ]          Segment
   3   Network      + IP header (IP addresses)     [ IP | TCP | Data ]          Packet
   2   Data Link    + Ethernet header (MAC addresses) [ MAC | IP | TCP | Data | FCS ]  Frame
   1   Physical     Converted to 0/1 signals and sent                      Bit
```

- **Adding headers is encapsulation, and removing them is decapsulation.**
- This is why the data unit has a different name at each layer. **The name changes each time a header is added** — add an IP header to a segment and you get a packet, add an Ethernet header to a packet and you get a frame.
- The addresses carried in headers also match the layers — **a port in the Layer 4 header, an IP in the Layer 3 header, a MAC in the Layer 2 header**.
- **Only the frame gets a trailer (FCS).** It is a value the receiver uses to check whether the frame was corrupted in transit. This is why "error detection" is part of Layer 2's role.

## The TCP/IP 4 Layers

The real Internet runs on the **TCP/IP model**, not OSI.

```text
   OSI 7 layers                 TCP/IP 4 layers
   ──────────────────────────────────────────────
   7 Application  ┐
   6 Presentation ├──────────────►   4  Application (Application)
   5 Session      ┘
   4 Transport    ───────────────►   3  Transport (Transport)
   3 Network      ───────────────►   2  Internet (Internet)
   2 Data Link    ┐
   1 Physical     ┘──────────────►   1  Network Access
```

| TCP/IP layer | OSI layers grouped | Typical protocols |
|------------|-------------|-------------|
| **Application** | 7·6·5 | HTTP, FTP, SMTP, DNS |
| **Transport** | 4 | **TCP, UDP** |
| **Internet** | 3 | **IP, ICMP, ARP** |
| **Network Access** | 2·1 | Ethernet |

- **OSI is a theoretical model, TCP/IP is the real implementation.** Questions on this contrast do come up.
- Books label the layer names slightly differently. **Internet layer = Network layer**, and **Network Access layer = Network Interface layer = Link layer** all refer to the same thing.

### The four protocols of the Internet layer

| Protocol | What it does | What to remember |
|---------|--------|----------|
| **IP** | Adds addresses and **delivers to the destination**. It does not guarantee arrival | Connectionless |
| **ICMP** | Messages that **report errors and status** | The protocol **`ping`** uses |
| **ARP** | Finds out **IP address → MAC address** | The `arp` command |
| **RARP** | Finds out **MAC address → IP address** | The opposite of ARP (Reverse) |

- **ARP and RARP differ only in direction.** "You know the IP but not the MAC" is ARP, and the reverse is RARP. Choices with the direction swapped are easy wrong answers.
- **IP itself is not reliable.** Putting things in order and resending what was lost is handled by TCP one layer up. The name "TCP/IP" reflects the division of labor between the two protocols.

## TCP and UDP

| Item | **TCP** | **UDP** |
|------|--------|--------|
| Connection | **Connection-oriented** (3-way handshake) | **Connectionless** |
| Reliability | **Guaranteed** (retransmission, ordering) | Not guaranteed |
| Speed | Slower | **Faster** |
| Uses | Web, mail, file transfer | **Streaming, DNS, VoIP** |

- The key contrast is **TCP is accurate, UDP is fast**.
- TCP establishes a connection with a **3-way handshake** — three steps: SYN → SYN/ACK → ACK.

```text
   Client                             Server
       │ ──────── SYN ──────────►  │   1  "May I connect?"
       │ ◄────── SYN/ACK ───────── │   2  "Sure, I'll connect too"
       │ ──────── ACK ──────────►  │   3  "Confirmed"
       │ ◄═════ Data transfer ═════► │
```

- It takes three exchanges because **both sides must confirm that "I can send and I can receive."** Data flows only after step 3 is finished.
- To close a connection, **FIN** is exchanged in four steps (4-way handshake). **3 steps to open, 4 steps to close.**
- UDP has none of this procedure. That is why it is fast, but if data disappears along the way, the sender never finds out.

| Transport protocol | Services running on top of it |
|-------------|------------------|
| **TCP** | HTTP · HTTPS · FTP · SSH · TELNET · SMTP · POP3 · IMAP |
| **UDP** | DHCP · SNMP · NTP · TFTP |
| Both | **DNS** — usually UDP, TCP when the response is large |

- The deciding criterion is **"can we afford to lose even one character?"** Files, mail, and logins cannot lose anything, so they use TCP; short query-and-response or real-time transmission uses UDP.

## Major Port Numbers

| Port | Service |
|-----|-------|
| **20 / 21** | **FTP** (data / control) |
| **22** | **SSH** |
| **23** | **TELNET** |
| **25** | **SMTP** (sending mail) |
| **53** | **DNS** |
| **80** | **HTTP** |
| **110** | **POP3** (receiving mail) |
| **143** | **IMAP** |
| **443** | **HTTPS** |
| 631 | CUPS(IPP) |

- **Port numbers are asked as-is.** In particular, memorize **22 (SSH) · 23 (TELNET) · 25 (SMTP) · 53 (DNS) · 80 (HTTP) · 110 (POP3)**.
- **0~1023 are well-known ports**, which can be opened only with root privileges.
- The mapping between ports and services is kept in the **`/etc/services`** file.

| Range | Name | Use |
|------|------|------|
| **0 ~ 1023** | **Well-known ports** | Fixed assignments for major services |
| 1024 ~ 49151 | Registered ports | Numbers that specific programs register and use |
| 49152 ~ 65535 | Dynamic ports | Numbers a client **borrows briefly** when it connects |

- A port number is **16 bits**, so the full range is **0 ~ 65535**.
- A server **waits** on a fixed number, and a client is temporarily given one high number and **goes to find the server.** Port 22 is used by the SSH server side, not by the side that connects.

```text
   # /etc/services  —  service-name   port/protocol
   ftp             21/tcp
   ssh             22/tcp
   telnet          23/tcp
   smtp            25/tcp
   domain          53/udp
   http            80/tcp
```

- Each line is in the form **service name + `port/protocol`**. The `tcp` or `udp` after it is the transport protocol that service uses.
- **DNS is listed in this file under the name `domain`.** Searching for `dns` will not find it.
- This file is just a **table pairing names with numbers**. Being listed here does not mean that port is open. Actually open ports are checked with `netstat` and `ss` on Day 4.

> Tomorrow we cover how data actually travels — circuit switching and packet switching, plus several communication technologies.

## 📖 Terms

- **OSI 7 layers** : An international standard reference model that divides network communication into seven stages.
- **TCP/IP 4 layers** : The communication model used on the real Internet. It groups OSI into four layers.
- **MAC address** : A unique hardware address used at Layer 2.
- **Router** : A Layer 3 device that connects different networks and decides paths.
- **Switch** : A Layer 2 device that forwards by MAC address within the same network.
- **TCP** : A transport layer protocol that establishes connections and guarantees reliability.
- **UDP** : A transport layer protocol that delivers quickly without a connection.
- **Well-known ports** : Ports 0 through 1023. They are pre-assigned to major services.

## 📝 Practice Questions

**Question 1.** Which of the following corresponds to Layer 3 of the OSI 7 layers?

A) Data Link layer  
B) Network layer  
C) Transport layer  
D) Session layer  

**Answer: B**  
Explanation: From the bottom, the OSI 7 layers are Physical, Data Link, Network, Transport, Session, Presentation, Application. The Network layer, Layer 3, handles routing, which selects paths using IP addresses, and its typical device is the router.

---

**Question 2.** Which layer of the OSI 7 layers does a router operate at?

A) Physical layer  
B) Data Link layer  
C) Transport layer  
D) Network layer  

**Answer: D**  
Explanation: A router looks at IP addresses to decide paths between different networks, so it is a Layer 3 (Network layer) device. Repeaters and hubs operate at Layer 1, and bridges and switches at Layer 2.

---

**Question 3.** Which of the following is a protocol that sends data without establishing a connection, making it fast but not guaranteeing reliability?

A) TCP  
B) IP  
C) UDP  
D) ICMP  

**Answer: C**  
Explanation: UDP sends data without a connection setup process, so latency is low and it is used where speed matters, such as streaming or DNS lookups. TCP is a connection-oriented protocol that establishes a connection with a 3-way handshake and provides retransmission and ordering guarantees.

---

**Question 4.** Which of the following is the default port number used by the SSH service?

A) 22  
B) 23  
C) 25  
D) 21  

**Answer: A**  
Explanation: SSH uses port 22 and encrypts its communication. Port 23 is TELNET, which does not encrypt, port 25 is SMTP used for sending mail, and port 21 is the FTP control port.

---

**Question 5.** Which of the following is the data transfer unit of the Data Link layer in the OSI 7 layers?

A) Packet  
B) Frame  
C) Segment  
D) Bit  

**Answer: B**  
Explanation: The data unit per layer is the bit at the Physical layer, the frame at the Data Link layer, the packet at the Network layer, and the segment at the Transport layer. A frame carries the source and destination MAC addresses.
