# Day 3 - IP Addresses and Subnet Calculation

## 📌 Key Points

- IPv4 is **32 bits**, split into four groups of 8 bits and written in **dotted decimal**. IPv6 is **128 bits**.
- The class is determined by the **first octet** — **A: 1~126 · B: 128~191 · C: 192~223 · D: 224~239**.
- There are three private IP ranges — **10.x · 172.16~31.x · 192.168.x**. **127.0.0.1 is loopback**.
- In each network, **the network address and the broadcast address, 2 addresses, cannot be used.** So it is **2ⁿ − 2**.
- **Calculation formula: (256 − last mask value) − 2 = number of usable hosts**.

## Structure of an IP Address

```text
   192  .  168  .  0  .  10
   └─┬┘   └─┬┘   └┬┘  └─┬┘
    8 bits 8 bits 8 bits 8 bits   =  32 bits

   Each octet is 0 ~ 255
```

- An address is split into a **network part + host part**. The **subnet mask** decides where the network part ends.

### Converting an octet to binary

Subnet calculation comes down to reading **one 8-bit slot**. Each position has a fixed value.

```text
   Place value  128   64   32   16    8    4    2    1
   ──────────────────────────────────────────────────
   192   =       1    1    0    0    0    0    0    0     128 + 64
   168   =       1    0    1    0    1    0    0    0     128 + 32 + 8
    10   =       0    0    0    0    1    0    1    0     8 + 2
   255   =       1    1    1    1    1    1    1    1     Add them all and you get 255
```

- **Subtract from the largest place down.** For 168, subtract 128 (40 left), 64 will not fit, subtract 32 (8 left), subtract 8 and you reach 0. Write 1 for the places you subtracted and 0 for those you could not.
- Adding all eight places gives **255**. This is why one octet is 0~255 (the number of values is 2⁸ = 256).
- The values used in masks are **sums accumulated from the left** — 128, 128+64=**192**, +32=**224**, +16=**240**, +8=**248**, +4=**252**.

## Classes

| Class | **First octet range** | Default subnet mask | Notation | Use |
|-------|---------------|----------------|------|------|
| **A** | **1 ~ 126** | **255.0.0.0** | **/8** | Very large |
| **B** | **128 ~ 191** | **255.255.0.0** | **/16** | Medium to large |
| **C** | **192 ~ 223** | **255.255.255.0** | **/24** | Small |
| **D** | **224 ~ 239** | — | — | **Multicast** |
| **E** | 240 ~ 255 | — | — | Research |

- **Looking at the first octet alone tells you the class.** `192.168.0.1` starts with 192, so it is **Class C**.
- **127 is left out of the Class A range.** This is because `127.0.0.0/8` is reserved for **loopback**.
- Questions ask that **D is multicast** (sending to many at once).

| Class | Leading bits of first octet | Network / host bits | Hosts per network |
|-------|---------------|-------------------|---------------------|
| **A** | `0` | 8 / 24 | 2²⁴ − 2 = **16,777,214** |
| **B** | `10` | 16 / 16 | 2¹⁶ − 2 = **65,534** |
| **C** | `110` | 24 / 8 | 2⁸ − 2 = **254** |
| D | `1110` | — | — |

- It is no accident that the range numbers break at 126, 128, 192, and 224. It is because **if the leading bit is `0` the range is 0~127, if `10` it is 128~191, and if `110` it is 192~223**. This interlocks directly with the 128, 64, 32 in the place-value table above.
- **Class A has few networks and many hosts. Class C is the opposite.** The class that can hold the most hosts is A, and the class with the most networks is C.
- Boundary values are asked as-is — **126 is A, 128 is B, 191 is B, 192 is C, 223 is C, 224 is D**.

### Private IPs

These are **addresses used only inside an internal network**, without going directly out to the Internet.

| Class | Private IP range |
|-------|------------|
| **A** | **10.0.0.0 ~ 10.255.255.255** |
| **B** | **172.16.0.0 ~ 172.31.255.255** |
| **C** | **192.168.0.0 ~ 192.168.255.255** |

- **The `192.168.x.x` addresses handed out by a home or office router** are exactly these.
- **For 172, only 16~31 is private.** `172.15.x.x` and `172.32.x.x` are public IPs. This range shows up as a trap.

### Special addresses

| Address | Meaning |
|------|-----|
| **127.0.0.1** | **Loopback** — yourself (`localhost`) |
| 0.0.0.0 | All addresses / unspecified |
| **All host bits are 0** | **Network address** |
| **All host bits are 1** | **Broadcast address** |

| Sending method | Receivers | Example |
|-----------|---------|-----|
| **Unicast** | **One** | Ordinary one-to-one communication |
| **Broadcast** | **Everyone** on the same network | `192.168.0.255` |
| **Multicast** | A **subset group** that signed up | Class D `224.0.0.0 ~ 239.255.255.255` |

- **A private IP and loopback are different.** A private IP is an address for talking to **other computers** on the internal network, while loopback is an address that comes back **only to yourself**.
- Loopback is not just `127.0.0.1`; the **entire range starting with `127`** is reserved. By convention, 127.0.0.1 is the one used.

## Subnet Calculation

### Why subtract 2

```text
   192.168.0.0   ← Host part is all 0s  =  network address
   192.168.0.1   ┐
        …        ├─  Addresses that can actually be given to computers
   192.168.0.254 ┘
   192.168.0.255 ← Host part is all 1s  =  broadcast address
```

- **The two at the ends cannot be used.** That is why it becomes **`2ⁿ − 2`** (n = number of host bits).

### How to calculate

```text
   1  Look at the last octet of the mask        e.g.) 255.255.255.192  →  192
   2  Subtract it from 256                      256 − 192 = 64      ← block size
   3  Subtract 2                                64 − 2 = 62         ← number of usable hosts
```

### Class C subnet table — memorize it whole

| Mask | Notation | Block size | **Usable hosts** | Number of subnets |
|-------|------|---------|------------------|-----------|
| **255.255.255.0** | **/24** | 256 | **254** | 1 |
| **255.255.255.128** | **/25** | 128 | **126** | 2 |
| **255.255.255.192** | **/26** | 64 | **62** | 4 |
| **255.255.255.224** | **/27** | 32 | **30** | 8 |
| **255.255.255.240** | **/28** | 16 | **14** | 16 |
| 255.255.255.248 | /29 | 8 | **6** | 32 |
| 255.255.255.252 | /30 | 4 | **2** | 64 |

> **254 · 126 · 62 · 30 · 14 · 6 · 2** — memorize this row of numbers and you can answer immediately without calculating. It is the pattern of **halving each time, with −2 attached**.

### Working through examples

> **Question** In a Class C network with subnet mask `255.255.255.192`, how many host IPs can be used in one subnet?

```text
   256 − 192 = 64      size of one block
   64 − 2 = 62         the count after removing the network and broadcast addresses

   Answer: 62
```

> **Question** What if the subnet mask is `255.255.255.224`?

```text
   256 − 224 = 32
   32 − 2 = 30         Answer: 30
```

- If asked for the **number of subnets**, it is the reverse: **256 ÷ block size**. For `/26`, 256 ÷ 64 = **4** subnets.

### Finding the range too — draw the block boundaries

Questions also ask not just the host count but **"what are the network address and broadcast address of the network this IP belongs to?"** Draw a table cut every block size and you are done. Applying `/26` (block 64) to `192.168.10.0` splits it into four like this.

| Subnet | Network address | Usable hosts | Broadcast address |
|-------|------------|---------------|---------------|
| 1 | 192.168.10.**0** | .1 ~ .62 | 192.168.10.**63** |
| 2 | 192.168.10.**64** | .65 ~ .126 | 192.168.10.**127** |
| 3 | 192.168.10.**128** | .129 ~ .190 | 192.168.10.**191** |
| 4 | 192.168.10.**192** | .193 ~ .254 | 192.168.10.**255** |

- **A network address is a multiple of the block size** (0, 64, 128, 192). **A broadcast address is the start of the next block minus 1**.
- The hosts are everything in between. **First host = network address + 1, last host = broadcast address − 1**.

```text
   Which subnet does 192.168.10.100 / 26 belong to

   1  Block size       256 − 192 = 64
   2  Draw boundaries  0 · 64 · 128 · 192
   3  The slot that 100 falls into is 64 ~ 127
   ─────────────────────────────────────────
   Network address      192.168.10.64
   Broadcast address    192.168.10.127
   Host range           192.168.10.65 ~ 192.168.10.126   (62 hosts)
```

| Given value | Block | Network address | Broadcast | Host range |
|---------|------|------------|-----------|-----------|
| 192.168.10.**77** /27 | 32 | .64 | .95 | .65 ~ .94 (30 hosts) |
| 192.168.10.**200** /28 | 16 | .192 | .207 | .193 ~ .206 (14 hosts) |
| 192.168.10.**130** /25 | 128 | .128 | .255 | .129 ~ .254 (126 hosts) |

- Check your answer with **end − start + 1**. For `.65 ~ .94`, 94 − 65 + 1 = 30, which matches the 30 in the table.
- Doing the same calculation in bits is **ANDing the IP with the mask**. 100 is `01100100` and 192 is `11000000`; keeping only the places where both are 1 gives `01000000` = **64**. This is how computers find the network address.

### Questions asked in reverse — choosing a mask from a required count

| Requirement | Order of thinking | Answer |
|------|------------|-----|
| A subnet to hold **50** hosts | Add 2 to get 52 → the smallest block that holds it is **64** | 255.255.255.**192** (/26) |
| **30** hosts | 32 → block 32, an exact fit | 255.255.255.**224** (/27) |
| **31** hosts | 33 → 32 is not enough, so block 64 | 255.255.255.**192** (/26) |
| Divide into **5** or more subnets | 4 is not enough, so 8 → block is 256 ÷ 8 = 32 | 255.255.255.**224** (/27) |

- **If asked for the number of hosts, subtract 2; if asked for the number of subnets, do not subtract.** Choices that swap the two numbers within one question are the trap. For `/26`, it is **4 subnets, 62 hosts per subnet**.
- "How many addresses are there" and "how many addresses can be given to hosts" are also different. The first is 64, the second is 62.
- A mask and the `/` notation convert by the **number of 1s**. `255.255.255.192` is 8 + 8 + 8 + 2 = **/26**, and in reverse `/28` is 24 + 4, so the last octet has four 1s = 240.
- The more finely you divide subnets, **the number of subnets doubles and the number of hosts halves.** The total address count (256) you get by multiplying the two does not change.

### Seeing the mask in bits

| Last octet | Binary | Borrowed bits |
|-----------|------|---------|
| **0** | `00000000` | 0 |
| **128** | `10000000` | 1 |
| **192** | `11000000` | **2** |
| **224** | `11100000` | 3 |
| **240** | `11110000` | 4 |
| 248 | `11111000` | 5 |
| 252 | `11111100` | 6 |

- The only values that can appear in a mask are **0 · 128 · 192 · 224 · 240 · 248 · 252 · 254 · 255**. This is because **the 1s fill in continuously from the left**.
- A mask like `255.255.255.100` **cannot exist.** Choices like this show up as wrong answers.

## IPv6

| Item | IPv4 | **IPv6** |
|------|------|---------|
| Length | **32 bits** | **128 bits** |
| Notation | Dotted decimal | **Colon-separated hexadecimal** |
| Example | `192.168.0.1` | `2001:0db8::1` |

- IPv4 address exhaustion is the reason IPv6 appeared. Questions ask the contrast of **32 bits versus 128 bits**.

| Item | IPv4 | IPv6 |
|------|------|------|
| Grouping | **4 groups of 8 bits** | **8 groups of 16 bits** |
| Separator | Dot (`.`) | **Colon (`:`)** |
| Number base | Decimal | **Hexadecimal** |
| Address types | Unicast · **broadcast** · multicast | Unicast · **anycast** · multicast |
| Loopback | `127.0.0.1` | **`::1`** |

```text
   2001:0db8:0000:0000:0000:0000:0000:0001      16 bits × 8 groups = 128 bits
   2001:db8:0:0:0:0:0:1                         Leading zeros in each group are omitted
   2001:db8::1                                  Consecutive all-zero groups are collapsed with :: in one go
```

- **`::` can be used only once in an address.** If it were used twice, there would be no way to tell how many groups of zeros each one stands for.
- **IPv6 has no broadcast.** Its role was taken over by multicast. If asked "which is not an IPv6 address type," the answer is broadcast.
- To avoid mixing up the numbers, memorize **4 × 8 = 32, 8 × 16 = 128**. The **48 bits** that sits in between is the **MAC address**.

> Tomorrow we cover the commands for actually configuring and checking these addresses on Linux.

## 📖 Terms

- **Subnet mask** : A value that separates the network part from the host part of an IP address.
- **Network address** : An address whose host bits are all 0. It refers to the network itself.
- **Broadcast address** : An address whose host bits are all 1. Used to send to the entire network.
- **Private IP** : An internal address that does not go directly out to the Internet. The ranges are 10, 172.16~31, and 192.168.
- **Loopback address** : 127.0.0.1, which points to yourself.
- **CIDR notation** : A way of expressing the mask by the number of network bits, like `/24`.
- **Multicast** : A method of sending to multiple targets at once. Class D is for this purpose.
- **IPv6** : A 128-bit address system. Written as hexadecimal separated by colons.

## 📝 Practice Questions

**Question 1.** In a Class C network with subnet mask 255.255.255.192, which of the following is the number of host IPs usable in one subnet?

A) 64  
B) 32  
C) 30  
D) 62  

**Answer: D**  
Explanation: Subtracting the mask's last value 192 from 256 gives a block size of 64. Removing the two addresses, the network address and the broadcast address, leaves 62, which are the addresses that can actually be assigned to hosts.

---

**Question 2.** Which of the following is the address type that the IP address 172.20.10.5 belongs to?

A) Public IP address  
B) Loopback address  
C) Private IP address  
D) Multicast address  

**Answer: C**  
Explanation: The Class B private IP range runs from 172.16.0.0 to 172.31.255.255, so an address starting with 172.20 is a private IP. However, addresses outside this range, such as 172.15 or 172.32, are public IPs, so you must remember the range of the second octet precisely.

---

**Question 3.** Which of the following is the class that the IP address 200.100.50.1 belongs to?

A) Class A  
B) Class C  
C) Class B  
D) Class D  

**Answer: B**  
Explanation: The class is determined by the value of the first octet, and 192 through 223 is Class C. 1 through 126 is Class A, 128 through 191 is Class B, and 224 through 239 is Class D, for multicast.

---

**Question 4.** Which of the following values can **not** be used as a subnet mask?

A) 255.255.255.100  
B) 255.255.255.192  
C) 255.255.255.240  
D) 255.255.255.0  

**Answer: A**  
Explanation: A subnet mask must have its 1s filled in continuously from the left, so the only values that can appear in each octet are 0, 128, 192, 224, 240, 248, 252, 254, and 255. 100 is `01100100` in binary, whose 1s are not continuous, so it cannot be a mask.

---

**Question 5.** Which of the following is the length of an IPv6 address?

A) 32 bits  
B) 48 bits  
C) 64 bits  
D) 128 bits  

**Answer: D**  
Explanation: IPv6 is a 128-bit address system written as colon-separated hexadecimal, designed to solve the address exhaustion problem of 32-bit IPv4. 48 bits is the length of a MAC address.
