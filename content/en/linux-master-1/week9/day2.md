# Day 2 - DHCP and NTP: Two Services That Hand Out Addresses and Sync Clocks

## 📌 Key Takeaways

- **DHCP automatically distributes "space (addresses)" and NTP automatically distributes "time" across the whole network — both are infrastructure services.**
- DHCP hands out IP, gateway, and DNS as a **lease** through the 4 steps of **DORA (Discover → Offer → Request → Ack)**. Ports are server 67 / client 68 (UDP).
- **DISCOVER is a broadcast, so it cannot cross a router** → other subnets need a **DHCP relay**.
- In `dhcpd.conf`, **`range` is the dynamic pool**, and **`host` + `hardware ethernet` (MAC) + `fixed-address` is a fixed reservation**. It is safest to keep fixed IPs outside the pool.
- NTP's **stratum: the lower the number, the more accurate** (0 is the reference clock itself, 1 is a primary server, **16 is unsynchronized**). The modern Linux standard is **chrony**, inspected with `chronyc sources`, `chronyc tracking`, and `timedatectl`.

## The Problem DHCP Solves — The Limits of Manual IP Management

- Problems that arise when you type in IPs by hand one by one:
  - Writing the same IP on two machines causes an **IP conflict**.
  - A laptop must be **reconfigured** every time it moves between meeting rooms.
  - At the scale of hundreds of machines, management itself becomes impossible.
- With DHCP, the server manages an IP address pool centrally and lends addresses out as a **lease** each time a client boots.

| Item | Manual setup | DHCP |
|------|-----------|------|
| Address assignment | A person types it in | Server distributes automatically |
| Conflict risk | High | Server tracks it and prevents it |
| Mobility | Reconfigure every time | Automatic anywhere |
| Extra info | Type in one by one | Gateway and DNS delivered too |

- DHCP hands down not only the IP but the whole set of settings such as **subnet mask, default gateway, DNS servers, and domain name**.
- In other words, the client receives not just one IP but **"every coordinate needed to join the network"** in one go.

What DHCP gives is not ownership but a **lease**. It lends the address only for a set period (lease time), and the client attempts to renew about halfway through. That is why the IP of a device that has left is reclaimed over time and reused. The key point is that, unless it is a static IP, "this IP is mine forever" does not hold.

## DORA — The DHCP 4-Step Handshake

- The process by which a client gets an IP has four steps, called **DORA** after the initial letters.
- Memorize the **order and direction** precisely.

| Step | Message | Sender | Direction | Meaning |
|------|--------|-----------|------|------|
| D | DISCOVER | Client | Broadcast | "Is there a DHCP server?" |
| O | OFFER | Server | (Unicast/broadcast) | "How about this IP?" |
| R | REQUEST | Client | Broadcast | "I'll use that IP" |
| A | ACK | Server | | "Confirmed. Leased to you" |

```
[Client]                              [DHCP server]
     |---- DISCOVER (broadcast) --------->|   No IP yet → starts from 0.0.0.0
     |<--- OFFER (includes proposed IP) --|
     |---- REQUEST (acceptance notice) -->|
     |<--- ACK (lease confirmed) ---------|
     |          The IP is now usable       |
```

- The first DISCOVER goes out as a **broadcast** (255.255.255.255) because the client has no IP yet.
- If there are multiple DHCP servers, each can send an OFFER. The client usually picks the **offer that arrives first**.
- The REQUEST states "which server's offer was accepted", **informing the remaining servers of the rejection.**

DHCP uses UDP, with the server on port 67 and the client on port 68. Because the client must communicate while it has no IP, the source IP is `0.0.0.0` and the destination is the broadcast address. Also, because broadcasts cannot cross a router, to use a DHCP server on another subnet you must configure a **DHCP relay (relay agent)** on the intermediate router so that it forwards the request on the client's behalf. "DHCP is broadcast, so beyond a router a relay is needed" is the key point.

## dhcpd.conf — Core Directives of the DHCP Server Configuration

- A Linux DHCP server consists of the **package `dhcp`, the daemon `dhcpd`, and the config file `/etc/dhcp/dhcpd.conf`**.

```bash
# Install
yum install dhcp-server

# Daemon control
systemctl start dhcpd
systemctl enable dhcpd

# Check lease status
cat /var/lib/dhcpd/dhcpd.leases
```

- The skeleton of the config file is as follows.

```text
# Global defaults
default-lease-time 600;          # Default lease time (seconds)
max-lease-time 7200;             # Maximum lease time (seconds)
authoritative;                   # Declare this the official DHCP server for this network

subnet 192.168.1.0 netmask 255.255.255.0 {
    range 192.168.1.100 192.168.1.200;        # IP range to hand out (pool)
    option routers 192.168.1.1;               # Default gateway
    option subnet-mask 255.255.255.0;         # Subnet mask
    option domain-name-servers 192.168.1.10;  # DNS server
    option domain-name "example.com";         # Domain name
}

# Assign a fixed IP to a specific device (by MAC)
host printer {
    hardware ethernet 00:1A:2B:3C:4D:5E;      # Target MAC address
    fixed-address 192.168.1.50;               # Always gives this IP
}
```

| Directive | Role |
|--------|------|
| `range` | The IP address range (pool) to distribute dynamically |
| `default-lease-time` / `max-lease-time` | Default and maximum lease durations (seconds) |
| `option routers` | Default gateway to tell clients |
| `option domain-name-servers` | DNS server address |
| `option subnet-mask` | Subnet mask |
| `host` + `hardware ethernet` + `fixed-address` | Reserve a fixed IP for a specific MAC |
| `authoritative` | Declares this the official DHCP server for this subnet |

> ⚠️ **Trap**: When reserving a fixed IP, the key is to identify the device with `hardware ethernet` (MAC address) and specify the IP to give with `fixed-address`. In this case, **it is safest to keep the fixed IP outside the dynamic pool specified by `range`** — placing it inside the pool can conflict with dynamic distribution. Also make sure the IP range of `range` does not include the gateway or server IPs.

DHCP's predecessor is BOOTP (Bootstrap Protocol). BOOTP was created so that diskless workstations could get an IP at boot, but it assigned addresses permanently and required manual mapping. DHCP extended it by adding the concepts of "lease" and "automatic pool management", so even now it shares the same ports (67/68) and much of the message format. That is why you often see BOOTP-compatibility options in `dhcpd.conf`.

## DHCP Client — The Receiving Side

- On the client side, use **`dhclient`** to request and renew an IP.

```bash
# Request an IP lease (specified interface)
dhclient eth0

# Release the current lease (give it back)
dhclient -r eth0

# Check lease info
cat /var/lib/dhclient/dhclient.leases
```

- If Linux is holding a **169.254.x.x (APIPA, link-local)** IP, it is a sign that "no DHCP server was found".
- In this case, check the **DHCP server, relay, and network connection**.

## NTP and Time Synchronization — Why Clocks Must Be in Sync

- What happens when a server's clock drifts:
  - Log timestamps get tangled, making **failure tracing impossible**.
  - TLS certificates are **misjudged** as "not yet valid" or "expired".
  - Time-based authentication (Kerberos, TOTP) **fails**.
  - Database replication and distributed transactions **break**.
- That is why **NTP** is used to align all nodes to a trusted reference clock.
- NTP divides the trust distance of a time source into **strata (layers)**.

| Stratum | Meaning |
|---------|------|
| 0 | The reference clock itself, such as an atomic clock or GPS (not directly connected to the network) |
| 1 | Primary server directly connected to Stratum 0 (most accurate) |
| 2 | Server that synchronizes from Stratum 1 |
| ... | Each step further away adds +1 to the stratum number (max 15, 16 is unsynchronized) |

Memory anchors:

- **The lower the number, the closer to the reference and the more accurate.** Stratum 1 is the top (0 is the clock itself).
- Our servers usually synchronize to a Stratum 2~3 pool on the internet (`pool.ntp.org`).
- Stratum **16** is a special value meaning "not synchronized".

NTP does not simply "receive the time and overwrite it"; it computes the round-trip delay and offset, compensates for network latency, and **gradually adjusts (slews)** the clock. Suddenly jumping the time would break logs and timers, so for small errors it smoothly aligns the clock by making it run slightly faster or slower. This is why time synchronization is not a simple copy.

## chrony — The Standard Time Synchronization on Modern Linux

- Replacing the traditional `ntpd`, the default time-sync daemon on the RHEL/CentOS family today is **chrony**.
- Design goal: to synchronize faster and more accurately in **environments with frequent disconnections or unstable networks**, like laptops.

```bash
# Install
yum install chrony

# Daemon control
systemctl start chronyd
systemctl enable chronyd
```

- The config file is **`/etc/chrony.conf`**.

```text
# Time servers (or pool) to synchronize with
pool 2.pool.ntp.org iburst
server time.bora.net iburst       # Specify a particular server

# Record the system clock to the RTC (hardware clock)
rtcsync

# Allow providing time to clients (downstream network)
allow 192.168.1.0/24

# Treat itself as stratum 10 when external sync is unavailable
local stratum 10
```

| Directive | Role |
|--------|------|
| `server` / `pool` | Time server to synchronize with. `iburst` sends several quick queries at startup |
| `allow` | Client range allowed to use this server as a time source |
| `rtcsync` | Reflect the system time to the hardware clock (RTC) |
| `local stratum` | Own stratum value when external sources are cut off |

- The status-check commands (practical exam targets) are these four.

```bash
chronyc sources            # List and status of time sources being synchronized
chronyc sources -v         # Verbose (includes legend)
chronyc tracking           # Current sync accuracy, offset, stratum
timedatectl                # System time, timezone, whether NTP sync is on
```

> ⚠️ **Trap**: In the output of `chronyc sources`, the symbol in front of a source carries meaning. `*` is the reference source currently being synchronized to, `+` is a candidate, `?` is unreachable, and `x` is a falseticker (a bad clock). Questions also ask about the difference that `server` specifies a single machine while `pool` specifies a pool for which DNS returns multiple IPs. If ntpd and chrony are run at the same time, they conflict over **UDP port 123** (not 53), so only one of them should be on.

## Try It Yourself — Checking Time and DHCP Status

```bash
# Time status at a glance
timedatectl                # Whether NTP is synchronized, local/UTC time, timezone
chronyc tracking           # Check the reference server, offset, stratum
chronyc sources            # Which servers it is attached to

# Change timezone
timedatectl set-timezone Asia/Seoul

# Renew the DHCP lease immediately and verify
dhclient -r eth0 && dhclient eth0
ip addr show eth0          # Check the received IP
```

- If you see **`NTP synchronized: yes`** in the `timedatectl` output, the time is properly synchronized.
- Looking at **`Stratum`** and **`Last offset`** (the current error) in `chronyc tracking` together lets you gauge the sync quality.

Tomorrow we move on to the web server, Apache, which serves real content on top of this infrastructure.

## 📖 Glossary

- **Lease** : The way DHCP lends an IP for a limited period rather than "owning" it. It attempts renewal about halfway through.
- **DORA** : The 4 DHCP steps Discover → Offer → Request → Ack.
- **DHCP relay (relay agent)** : A feature that forwards DHCP requests on a client's behalf past a router that broadcasts cannot cross.
- **`range`** : The directive in dhcpd.conf that sets the IP range (pool) to hand out dynamically.
- **`fixed-address` + `hardware ethernet`** : The combination that always reserves the same IP for a device with a specific MAC address.
- **`authoritative`** : The directive declaring this server the official DHCP server for that subnet.
- **BOOTP** : The predecessor of DHCP. Created for diskless workstations, and passed down its ports and message format.
- **APIPA (169.254.x.x)** : The link-local address a client assigns itself when it cannot find a DHCP server.
- **stratum** : A layer value showing how far away from the reference clock it is. The smaller, the more accurate, and 16 is unsynchronized.
- **slew (gradual adjustment)** : A method of closing an error by slightly changing the clock speed instead of jumping the time.
- **chrony / chronyd** : The standard time-sync implementation on modern Linux and its daemon. Strong on unstable networks.
- **`iburst`** : An option that sends several quick queries right after startup to speed up synchronization.
- **Symbols in `chronyc sources`** : `*` current reference source / `+` candidate / `?` unreachable / `x` falseticker.
- **`server` vs `pool`** : Specifies one server / specifies a group of servers for which DNS returns multiple IPs.

## 📝 Practice Questions

**Question 1.** What is the correct order of the 4 steps (DORA) of DHCP IP assignment?

A) Discover → Request → Offer → Ack
B) Discover → Offer → Request → Ack
C) Offer → Discover → Ack → Request
D) Request → Discover → Offer → Ack

**Answer: B**
Explanation: DORA is in the order Discover (client searches for a server) → Offer (server proposes an IP) → Request (client accepts) → Ack (server confirms the lease). Memorize it in the order of the initials DORA.

---

**Question 2.** Which directive in dhcpd.conf specifies the IP address range to distribute dynamically?

A) `option routers`
B) `range`
C) `fixed-address`
D) `default-lease-time`

**Answer: B**
Explanation: `range` is what defines the dynamic distribution pool, as in `range 192.168.1.100 192.168.1.200;`. `option routers` is the gateway, `fixed-address` is the fixed IP to give to a specific MAC, and `default-lease-time` is the default lease time.

---

**Question 3.** Which of the following is correct about NTP stratum?

A) The larger the stratum number, the closer to the reference clock and the more accurate
B) Stratum 0 means an unsynchronized state
C) Stratum 1 is a primary server directly connected to the reference clock
D) Stratum can express up to 255

**Answer: C**
Explanation: For stratum, the smaller the number, the closer to the reference. Stratum 0 is the reference clock itself such as an atomic clock or GPS, and stratum 1 is the primary server directly connected to it. 16 is the special value meaning unsynchronized; 0 is not unsynchronized.

---

**Question 4.** You want DHCP to always give the same IP to a specific printer. Which directive must be written in the host block to identify the device?

A) `range`
B) `hardware ethernet` (MAC address)
C) `option domain-name`
D) `max-lease-time`

**Answer: B**
Explanation: A fixed IP reservation identifies the target's MAC address with `hardware ethernet` inside the `host` block and specifies the IP to give with `fixed-address`. The MAC is the identification criterion.

---

**Question 5.** Which IP range (APIPA) does a client automatically take when it cannot find a DHCP server?

A) 10.0.0.0/8
B) 127.0.0.0/8
C) 169.254.0.0/16
D) 192.168.0.0/16

**Answer: C**
Explanation: When there is no response from a DHCP server, the client automatically assigns itself an arbitrary address in the 169.254.0.0/16 (link-local, APIPA) range. Seeing this address is a sign of "DHCP server not found". 127 is loopback, and the others are private ranges.

---

**Question 6.** Which command in chrony checks the sync quality, such as the currently synchronized time source, offset, and stratum?

A) It can be checked only with `chronyc sources`
B) `chronyc tracking`
C) `dhclient -r`
D) `named-checkconf`

**Answer: B**
Explanation: `chronyc tracking` shows the sync status, including the current reference server, time offset, stratum, and accuracy. `chronyc sources` is a complementary command that shows the list of attached sources. dhclient is for DHCP, and named-checkconf is the BIND configuration check.

---

**Question 7.** DHCP broadcasts cannot cross a router. What should be configured on the router so that clients on another subnet can use a central DHCP server?

A) DHCP relay (relay agent)
B) NAT
C) Change the default gateway
D) Adjust stratum

**Answer: A**
Explanation: A DHCP DISCOVER is a broadcast, so it cannot cross a router. If a DHCP relay agent is configured on the router (or an intermediate device), it forwards requests from other subnets to the central DHCP server as unicast. NAT, gateway changes, and stratum are irrelevant.

---
