# Day 2 - Communication Methods and Network Technologies

## 📌 Key Points

- There are two switching methods — **circuit switching (telephone network, PSTN)** and **packet switching (data network, PSDN)**.
- Packet switching splits further into **datagram (connectionless)** and **virtual circuit (connection-oriented)**.
- LAN access methods — **Ethernet uses CSMA/CD**, **wireless LAN uses CSMA/CA**, **Token Ring and FDDI use token passing**.
- The WAN technology order is **X.25 → Frame Relay → ATM**. **An ATM cell is a fixed 53 bytes**.
- IEEE standards — **802.3 Ethernet · 802.5 Token Ring · 802.6 DQDB · 802.11 wireless LAN**.

## Classification by Scale

| Type | Full name | Range |
|------|-------|------|
| **LAN** | Local Area Network | Inside a **building or office** |
| **MAN** | Metropolitan Area Network | **City** scale |
| **WAN** | Wide Area Network | **Country or continent** scale |

- **The MAN standard is DQDB (IEEE 802.6)**. Questions ask about the middle one of the three scales.

## Circuit Switching and Packet Switching

```text
   Circuit Switching                      Packet Switching

   A ══════════════════════ B            A ─┐ ┌─ Packet 1 ─┐ ┌─ B
     A dedicated path is held                 └─┼─ Packet 2 ─┼─┘
     for the whole call                         └─ Packet 3 ─┘
   Telephone network (PSTN)                Data network (PSDN)
```

| Item | **Circuit switching** | **Packet switching** |
|------|-------------|-------------|
| Method | **Reserves a dedicated path in advance** | **Cuts the data up and sends each piece separately** |
| Typical network | **PSTN** (public telephone network) | **PSDN** (public data network) |
| Delay | **Constant** once connected | Varies with conditions |
| Efficiency | Held even when idle — **low** | **Many communications share the line** |
| Suited for | Voice calls | **Data communication** |

| Abbreviation | Full name |
|-------|-------|
| **PSTN** | Public Switched **Telephone** Network — circuit switching |
| **PSDN** | Public Switched **Data** Network — packet switching |

- It is easy to remember that in the name, **T (telephone) means circuit switching, D (data) means packet switching**.

### The difference seen in the order of operation

```text
   Circuit switching   ① Set up circuit  →  ② Transfer data  →  ③ Release circuit
                       (Reserve the path first)  (Flows only along it)   (Give the path back)

   Packet switching    ① Cut the data into packets  →  ② Attach the destination address to each packet
                       →  ③ Intermediate devices receive and hold it, then pass it on  →  ④ Reassemble at the destination
```

- Circuit switching takes **connection setup time before the call**. In exchange, once connected you have the path to yourself, so the delay is constant. The ring tone while you place a phone call is step ①.
- Step ③ of packet switching is called **store-and-forward**. An intermediate device **stores the packet first** and sends it out when the path is free. That lets many share one line, but delay grows when it is congested.
- Because an address must be attached to every packet, there is **header overhead**. Circuit switching has no such overhead.

| If the sentence contains this | Answer |
|---------------------|-----|
| Dedicated communication path, connection setup time, real-time voice, fixed bandwidth | **Circuit switching** |
| Store-and-forward, line sharing, header overhead, varying delay | **Packet switching** |
| Packets take different paths, arrival order may change | **Datagram** (within packet switching) |
| Logical connection set up first, all packets on the same path | **Virtual circuit** (within packet switching) |

### The two packet-switching methods

| Item | **Datagram** | **Virtual circuit** |
|------|-------------|-------------|
| Connection | **Connectionless** | **Connection-oriented** |
| Path | **May differ** per packet | The **same path** decided in advance |
| Order | May be scrambled | **Order is preserved** |
| Examples | **IP** | **X.25**, Frame Relay, ATM |

- **A virtual circuit is "packet switching that looks like circuit switching."** It resembles circuit switching in that the path is decided in advance, but it **does not hold that path exclusively** and shares it with other communications. So it is classified as packet switching all the same.
- In a datagram, **each packet carries a complete destination address** and finds its own way. If one intermediate path breaks, it can go around by another route, so it is resilient to failures. The Internet (IP) works this way.
- Tie the three words together in one line: "virtual circuit = connection-oriented = order preserved," "datagram = connectionless = order may change."

## LAN Access Control Methods

These are the rules that decide **who sends and when** when several computers share one wire.

| Method | Full name | Used in |
|------|-------|--------|
| **CSMA/CD** | Carrier Sense Multiple Access with **Collision Detection** | **Ethernet (wired LAN)** |
| **CSMA/CA** | … with **Collision Avoidance** | **Wireless LAN (Wi-Fi)** |
| **Token passing** | Token Passing | **Token Ring, FDDI** |

### CSMA/CD

```text
   1  Listen to see whether the line is idle (Carrier Sense)
   2  If it is idle, send
   3  If a collision happens, detect it (Collision Detection)
   4  Wait a random time and send again
```

- It is a **"send first, and retry if there is a collision"** method. It is the standard for wired Ethernet and is **IEEE 802.3**.
- In wireless, signals are weak, so collisions are **hard to detect.** That is why it uses **CSMA/CA**, a method that **avoids them in advance (Avoidance)**.
- **CD is wired, CA is wireless** — this one sentence is the exam point.

### Token passing

- **A signal called a token is passed around, and only the holder transmits.** There are no collisions at all.
- **Token Ring (IEEE 802.5)** and **FDDI** use this method.

### The three methods side by side

| Item | **CSMA/CD** | **CSMA/CA** | **Token passing** |
|------|-----------|-----------|-------------|
| Collisions | Occur — **detect, then retransmit** | **Avoided in advance** so they do not occur | **Do not occur** |
| Before sending | Listen to see whether the line is quiet | Listen, then **wait an additional random time** | Wait until the token arrives |
| After sending | Watch for a collision signal | Wait for the other side's **acknowledgment (ACK)** | Pass the token to the next device |
| As devices increase | Collisions rise and it **slows sharply** | Waiting grows and it slows | Your turn just comes later — **predictable** |
| Standard | IEEE 802.3 | IEEE 802.11 | IEEE 802.5, FDDI |

- Spelling out the abbreviations gives the meaning directly — **CS** (Carrier Sense, listening to the line) · **MA** (Multiple Access, many use it together) · **CD** (collision detection) / **CA** (collision avoidance).
- The reason CSMA/CD waits a **"random time"** after a collision is that if both waited the same time, they would **send at the same moment again** and collide again.
- The reason collisions are hard to detect in wireless is that **the device's own transmitted radio wave is much stronger**, so it cannot pick out a weak signal arriving from far away at the same moment.
- **The CSMA family is "contention," token passing is "taking turns."** If a question asks for "the method in which collisions do not occur," it is token passing.

## WAN Technologies

```text
   X.25  ────►  Frame Relay  ────►  ATM
   (1970s)       (1990s)            (1990s)
   Slow but      Less error         Fixed 53-byte cells
   robust to     checking, so       Voice and video together
   errors        faster
```

| Technology | Characteristics |
|------|------|
| **X.25** | An early packet-switched network. **Thorough error control makes it slow.** Designed for the era of poor lines |
| **Frame Relay** | A method that **raised speed by reducing X.25's error control**. Appeared after line quality improved |
| **ATM** | Asynchronous Transfer Mode. Uses **fixed-length 53-byte cells**. Integrates voice, video, and data |
| **DQDB** | Distributed Queue Dual Bus. **MAN standard (IEEE 802.6)**. Uses two buses |
| **FDDI** | Fiber Distributed Data Interface. **Dual fiber-optic ring**, **token passing**, 100Mbps |

> **ATM's 53 bytes** is tested as a literal value. It is a 5-byte header + 48 bytes of data. The decisive difference from the other methods is that the **length is fixed**.

> Remember **FDDI as fiber-optic cable + dual ring + token passing** together. If one ring breaks, traffic detours through the opposite ring.

### Why it changed in this order

- When **X.25** appeared, lines were noisy. So **every intermediate device** checked for errors and received the data again if it was wrong. It is safe, but slow because of checking at every hop. It is a standard set by **ITU-T**, and the `X` in the name is the series letter of ITU-T recommendations.
- When fiber-optic cable was laid and line errors dropped sharply, per-hop checking became wasteful. **Frame Relay** removed that checking and **left error recovery to the devices at both ends**, raising speed.
- **ATM** went one step further and cut data into **cells that are all the same size**. When sizes are constant, equipment can predict processing time, so delay-sensitive **voice and video** can be carried on the same network as data. That is why ATM's switching method is also called **cell switching**.
- The **A (Asynchronous)** in ATM means that cells are filled and sent only when there is something to send. It shares only its spelling with the bank ATM (cash machine).

| Item | X.25 | Frame Relay | ATM |
|------|------|------------|-----|
| Transfer unit | Packet | Frame (**variable length**) | **Cell (fixed 53 bytes)** |
| Error control | Thorough, **at every hop** | Minimized — left to the endpoints | Minimized |
| Speed | Slow | Fast | Faster |
| Connection method | Virtual circuit | Virtual circuit | Virtual circuit |

- All three are the same in being **packet switching with virtual circuits**. What differs is the **length of the transfer unit** and **how much error control is done**.

### Picking the technology from one keyword

| If the sentence contains this | Answer |
|---------------------|-----|
| 53 bytes, fixed-length cell, voice/video/data integration | **ATM** |
| Fiber-optic cable, dual ring, 100Mbps, token | **FDDI** |
| Dual bus, MAN, IEEE 802.6 | **DQDB** |
| Early packet-switched network, strong error control, ITU-T | **X.25** |
| Simplified X.25, reduced error control for higher speed | **Frame Relay** |

- **FDDI and DQDB are confusing because both say "dual."** FDDI is a dual **ring** (fiber-optic cable), DQDB is a dual **bus** (MAN).
- **Token Ring and FDDI both use token passing.** If it is a copper ring, it is Token Ring (802.5); if it is a **dual fiber-optic ring**, it is FDDI.

## IEEE 802 Standards

| Number | What |
|-----|------|
| **802.3** | **Ethernet (CSMA/CD)** |
| **802.5** | **Token Ring** |
| **802.6** | **DQDB (MAN)** |
| **802.11** | **Wireless LAN (Wi-Fi)** |
| 802.15 | Bluetooth |

- **802.3 (Ethernet) and 802.11 (wireless LAN)** are the representative ones.

## Related International Organizations

| Organization | What it does |
|------|--------|
| **IANA** | Manages **allocation of IP addresses, port numbers, and domains** |
| **ICANN** | Oversees the domain name system (IANA's parent) |
| **IETF** | Develops Internet standards documents (**RFC**) |
| **IEEE** | Develops **802 standards** for LAN, wireless, and more |
| **ISO** | International standards body for items such as the **OSI 7 layers** |
| **ITU-T** | International telecommunication standards |
| **3GPP** | **Mobile communication (3G·4G·5G) standards** |

- **IANA is the place that hands out addresses and port numbers.** The port assignments in `/etc/services` also come from here.
- **Mobile communication standards such as 5G are made by 3GPP.**

| What was defined | Organization |
|-------------|------|
| OSI 7 layers | **ISO** |
| Ethernet, Token Ring, wireless LAN (802.x) | **IEEE** |
| Network recommendations such as X.25 | **ITU-T** |
| RFC documents related to TCP/IP | **IETF** |
| Assignment of IP addresses and port numbers | **IANA** |
| The actual technical specifications of 5G | **3GPP** |

- **ITU and 3GPP have split roles in 5G.** The International Telecommunication Union (ITU) set the requirements 5G must meet under the name **IMT-2020**, and the **detailed technical specifications that satisfy those requirements are made by 3GPP**.
- **IANA and ICANN are the ones that "hand out numbers and names"**, while **IETF, IEEE, ISO, and ITU-T are the ones that "set the rules."** First check whether the question asks about allocation or about standard-setting.
- **IEEE and IETF**, whose names are similar, cover different layers. IEEE is closer to network cards and cables, the **lower layers (LAN)**, while IETF covers **Internet protocols** such as IP, TCP, and HTTP.

> Tomorrow we will calculate IP addresses and subnet masks by hand.

## 📖 Terms

- **Circuit switching** : A method that reserves a dedicated path for the whole communication. The telephone network (PSTN) is the typical example.
- **Packet switching** : A method that breaks data into pieces and sends each one. The data network (PSDN) is the typical example.
- **Datagram / virtual circuit** : The connectionless method / connection-oriented method of packet switching.
- **CSMA/CD** : The wired Ethernet access control method that detects collisions and retransmits.
- **CSMA/CA** : The wireless LAN access control method that avoids collisions in advance.
- **ATM** : An integrated transmission method that uses fixed-length 53-byte cells.
- **FDDI** : A network technology that works by token passing on a dual fiber-optic ring.
- **IANA** : The organization that manages allocation of Internet resources such as IP addresses and port numbers.

## 📝 Practice Questions

**Question 1.** Which of the following is the media access control method used in wired Ethernet?

A) Token passing  
B) CSMA/CA  
C) CSMA/CD  
D) Polling  

**Answer: C**  
Explanation: Wired Ethernet uses CSMA/CD, which checks whether the line is idle before sending, and if a collision occurs, detects it and retransmits after a short wait; it is standardized as IEEE 802.3. Wireless LAN, where collision detection is difficult, uses CSMA/CA, which avoids collisions in advance.

---

**Question 2.** Which of the following is the fixed length of a cell used in ATM?

A) 53 bytes  
B) 48 bytes  
C) 64 bytes  
D) 128 bytes  

**Answer: A**  
Explanation: ATM uses fixed-length 53-byte cells, the sum of a 5-byte header and 48 bytes of data. Because the length is always the same, processing time is predictable, which makes it advantageous for carrying delay-sensitive data such as voice and video together.

---

**Question 3.** Which of the following is the technology that uses fiber-optic cable and works by token passing in a dual-ring structure?

A) X.25  
B) ATM  
C) Frame Relay  
D) FDDI  

**Answer: D**  
Explanation: FDDI stands for Fiber Distributed Data Interface; it uses a dual-ring structure based on fiber-optic cable and transmits without collisions through token passing. Even if one ring fails, traffic can detour through the ring running in the opposite direction.

---

**Question 4.** Which of the following is the organization that manages allocation of Internet resources such as IP addresses and port numbers?

A) IEEE  
B) IANA  
C) ISO  
D) 3GPP  

**Answer: B**  
Explanation: IANA stands for Internet Assigned Numbers Authority and manages the allocation of IP address blocks, port numbers, and protocol numbers. IEEE handles the 802 series of standards, ISO handles international standards including the OSI reference model, and 3GPP handles mobile communication standards.

---

**Question 5.** Which of the following correctly pairs the switching method that reserves a dedicated path throughout the communication with its typical network?

A) Packet switching - PSTN  
B) Circuit switching - PSDN  
C) Circuit switching - PSTN  
D) Packet switching - circuit-switched network  

**Answer: C**  
Explanation: Circuit switching is a method that holds a dedicated path while communicating, and the public telephone network, PSTN, is the typical example. Packet switching, which breaks data into pieces and sends them, is used in the public data network, PSDN, and is more efficient because many communications share the line.
