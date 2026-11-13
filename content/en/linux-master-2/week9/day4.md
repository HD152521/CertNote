# Day 4 - Network Configuration and Commands

## 📌 Key Takeaways

- Network device names are **`lo` (loopback)**, **`eth0`/`ens33` (wired)**, and `wlan0` (wireless).
- **`ifconfig` is the old tool; `ip` is the current standard.** Memorize them as pairs.
- **DNS server addresses go in `/etc/resolv.conf`**, and **manual name-to-IP mappings go in `/etc/hosts`**.
- Use **`netstat` (old) and `ss` (current)** to see open ports and connections.
- **`ping` tells you whether you can reach a host**, and **`traceroute` tells you where it gets blocked**.

## Network Device Names

| Name | What it is |
|------|------|
| **`lo`** | **Loopback** — the machine itself (127.0.0.1) |
| **`eth0`** | The first wired network card (traditional name) |
| **`ens33`, `enp0s3`** | Today's **predictable names** |
| `wlan0` | Wireless network card |

- In the past, cards were named `eth0`, `eth1` in the order they were detected, which caused the **problem of names changing on every reboot**. That is why names like `enp0s3`, which reflect the slot location, were introduced.
- **`lo` is always present, even without a physical network card.**

## ifconfig and ip

| Task | **Old command (net-tools)** | **New command (iproute2)** |
|--------|---------------------|---------------------|
| Show addresses | **`ifconfig`** | **`ip addr`** (`ip a`) |
| Bring an interface up | `ifconfig eth0 up` | `ip link set eth0 up` |
| Assign an address | `ifconfig eth0 192.168.0.10` | `ip addr add 192.168.0.10/24 dev eth0` |
| Routing table | **`route`** | **`ip route`** |
| ARP table | **`arp`** | **`ip neigh`** |
| Connections and ports | **`netstat`** | **`ss`** |

```bash
ip addr                    # addresses of all interfaces
ifconfig eth0              # a specific interface only
ip route                   # routing table (check the default gateway)
route -n                   # numeric output, no name resolution
arp -a                     # list of MAC addresses on the same network
```

> **`ifconfig`, `route`, `netstat`, and `arp` belong to the `net-tools` package**, while **`ip` and `ss` belong to the `iproute2` package**. Some modern distributions do not install net-tools by default. The exam asks about **both**.

### Reading the Output

Viewing the same interface with the two commands looks like this.

```text
$ ifconfig eth0
eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet 192.168.0.10  netmask 255.255.255.0  broadcast 192.168.0.255
        ether 00:1a:2b:3c:4d:5e  txqueuelen 1000  (Ethernet)

$ ip addr show eth0
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000
    link/ether 00:1a:2b:3c:4d:5e brd ff:ff:ff:ff:ff:ff
    inet 192.168.0.10/24 brd 192.168.0.255 scope global eth0
       valid_lft forever preferred_lft forever
```

| What you want to know | In `ifconfig` | In `ip addr` |
|------------|---------------|--------------|
| **IP address** | After `inet` | After `inet` |
| **Subnet mask** | `netmask 255.255.255.0` | The **`/24`** after the address |
| Broadcast address | After `broadcast` | After `brd` |
| **MAC address** | After **`ether`** | After **`link/ether`** |
| Is it up? | `UP` in the angle brackets | `UP` in the angle brackets, `state UP` |

- **The mask notation differs.** `ifconfig` shows `255.255.255.0`, while `ip` shows `/24`. As we learned yesterday, they are the same value. The broadcast address `192.168.0.255` also matches the `/24` network with all host bits set to 1.
- Running `ifconfig` with no arguments shows **only interfaces that are up**. To see interfaces that are down as well, use **`ifconfig -a`**. `ip addr` shows everything by default.
- `ip` takes the form **`ip OBJECT ACTION`**. The object is `addr` (addresses), `link` (the device itself), `route` (routes), or `neigh` (neighbors, i.e. the ARP table). Questions like to mix these up: **`addr` for addresses, `link` for turning a device on and off**.

```bash
ifconfig eth0 192.168.0.10 netmask 255.255.255.0 up   # set address and mask, and bring it up
ifconfig eth0 down                                    # bring it down
ip link set eth0 down                                 # same thing
route add default gw 192.168.0.1                      # register the default gateway
ip route add default via 192.168.0.1                  # same thing
route del default                                     # delete it
```

> ⚠️ **Addresses and routes set with commands disappear after a reboot.** They only take effect in memory. To make them permanent, you must write them in the **configuration files** below. If a question adds the condition "so that it persists after reboot", the answer is a file, not a command.

- The old and new commands use **different keywords.** For the default gateway, `route` uses **`gw`** and `ip route` uses **`via`**.

### Default Gateway

```bash
ip route
# default via 192.168.0.1 dev eth0     ← default gateway
route -n
# 0.0.0.0    192.168.0.1   0.0.0.0   UG   ...
```

- **The line starting with `default` (or `0.0.0.0`) is the default gateway.** All traffic leaving the internal network goes through it.

```text
$ route -n
Kernel IP routing table
Destination     Gateway         Genmask         Flags Metric Ref    Use Iface
0.0.0.0         192.168.0.1     0.0.0.0         UG    100    0        0 eth0
192.168.0.0     0.0.0.0         255.255.255.0   U     100    0        0 eth0
```

| Column | How to read it |
|----|--------|
| `Destination` | Where this route leads. **`0.0.0.0` means "everywhere else"** |
| `Gateway` | The router to pass through. **`0.0.0.0` means traffic is sent directly, without a router** |
| `Genmask` | The subnet mask of that destination |
| `Flags` | **`U`** the route is up · **`G`** goes through a gateway |
| `Iface` | The interface to send out of |

- The second line means traffic for **the same network (192.168.0.0/24) is sent directly, without a gateway**. The first line means everything else is handed to 192.168.0.1.
- A computer uses the subnet mask to decide whether the destination is **inside or outside its own network**. If inside, it sends directly; if outside, it sends to the default gateway. This is why **a wrong mask can break communication even on the same network**.
- `route` and **`netstat -r`** show the same table. `-n` in both means "show numbers, don't convert to names".

### ARP Table

```text
$ arp -n
Address                  HWtype  HWaddress           Flags Mask            Iface
192.168.0.1              ether   00:11:22:33:44:55   C                     eth0
```

- **Actual delivery inside the same network is done by MAC address.** So to send to a peer whose IP you know, you first have to find that IP's MAC, and the ARP table is where the result is kept for a while.
- `arp -a` shows everything, **`arp -d ADDRESS` deletes an entry, and `arp -s ADDRESS MAC` adds one manually**.
- Only **devices on the same network** appear in the table. Peers outside the network are reached through the default gateway's MAC, so only the gateway shows up.

## Viewing Connections and Ports

```bash
netstat -tulpn        # open ports (traditional)
ss -tulpn             # same thing (current standard, faster)
netstat -an | grep 80
```

| Option | Meaning |
|------|-----|
| **`-t`** | **TCP** |
| **`-u`** | **UDP** |
| **`-l`** | Only sockets in the **LISTEN** state |
| **`-p`** | Show the **process** name |
| **`-n`** | Show **numbers** instead of names |
| `-a` | Everything |

- It helps to memorize the **`-tulpn`** combination as a whole. It is the standard command for seeing "which service is opening which port".

```text
# netstat -tlnp
Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1023/sshd
tcp        0      0 127.0.0.1:25            0.0.0.0:*               LISTEN      1187/master
```

- `Local Address` has the form **`ADDRESS:PORT`**. **`0.0.0.0:22` means it accepts connections on port 22 no matter which address they arrive at**, while **`127.0.0.1:25` means it only accepts connections coming from this computer**. The service on the second line cannot be reached from outside even though the port is open.
- **`LISTEN` in `State` means waiting for connections.** If you drop `-l` and use `-a`, already connected sockets (`ESTABLISHED`) appear as well.
- **Seeing other users' process names with `-p` requires root privileges.** Run as a regular user, that column shows an empty `-`.

| Option | What `netstat` shows |
|------|-------------------|
| **`-r`** | **Routing table** (same as `route`) |
| **`-i`** | Send/receive statistics **per interface** |
| `-s` | Per-protocol statistics |
| `-an` | All sockets, numerically |

- **`netstat` alone shows ports, connections, routing, and interface statistics.** When asked to pick "a command that cannot show the routing table", don't forget `netstat -r`.

## Diagnostic Commands

| Command | What it does |
|------|--------|
| **`ping`** | Checks whether the peer is **reachable** (ICMP) |
| **`traceroute`** | Shows the **route taken**, step by step |
| `tracepath` | Similar to traceroute |
| **`nslookup`, `dig`, `host`** | **DNS lookups** |
| `hostname` | My host name |
| `mtr` | A tool combining ping and traceroute |

```bash
ping -c 4 8.8.8.8         # send only 4 packets
traceroute www.google.com # trace the route
nslookup naver.com        # name → IP
dig naver.com             # more detailed DNS lookup
```

- **If `ping` works but the web does not, suspect DNS.** The IP is reachable but the name cannot be resolved.
- **`ping` uses ICMP.** A server that blocks ICMP by security policy will not respond even though it is alive.

```text
$ ping -c 4 192.168.0.1
PING 192.168.0.1 (192.168.0.1) 56(84) bytes of data.
64 bytes from 192.168.0.1: icmp_seq=1 ttl=64 time=0.412 ms
64 bytes from 192.168.0.1: icmp_seq=2 ttl=64 time=0.398 ms
64 bytes from 192.168.0.1: icmp_seq=3 ttl=64 time=0.455 ms
64 bytes from 192.168.0.1: icmp_seq=4 ttl=64 time=0.419 ms

--- 192.168.0.1 ping statistics ---
4 packets transmitted, 4 received, 0% packet loss, time 3004ms
rtt min/avg/max/mdev = 0.398/0.421/0.455/0.021 ms
```

| Field | Meaning |
|--------|-----|
| `icmp_seq` | Which packet number this was. **If numbers are skipped, the packets in between were lost** |
| `ttl` | Remaining lifetime. **It decreases by 1 at every router passed** |
| `time` | Round-trip time |
| `packet loss` | Loss rate. **0% is normal**, 100% means nothing gets through |
| `rtt min/avg/max` | Minimum/average/maximum round-trip time |

- **Linux `ping` keeps sending until told to stop.** End it with `Ctrl+C`, or set a count in advance with **`-c COUNT`**. Besides that, `-i` is the interval between packets (seconds) and `-s` is the packet size.
- `traceroute` uses this **TTL**. When it sends packets with TTL increased as 1, 2, 3 …, the router at the point where the value reaches 0 responds in turn, revealing the route. A line showing only `* * *` in the middle means that router did not respond.

### Where Did It Break — Start from the Nearest

| Step | Check | Where to suspect if it fails |
|-----|------|----------------|
| 1 | `ping 127.0.0.1` | The computer's networking itself |
| 2 | `ping 192.168.0.10` (own IP) | The address is not properly assigned to the interface → `ip addr` |
| 3 | `ping 192.168.0.1` (gateway) | Cable, **IP and subnet mask settings** |
| 4 | `ping 8.8.8.8` (external IP) | **Default gateway** not registered → `ip route` |
| 5 | `ping www.example.com` (name) | **DNS** → `/etc/resolv.conf` |

- Work **from the inside out**; the first step that fails is where the fault is.
- If steps up to 4 work and only step 5 fails, it means **you can reach addresses but cannot resolve names**. Look at the DNS settings, not the LAN cable or the gateway.
- Also, **`ethtool eth0`** shows the network card's **speed and link status**. The old tool that did the same job is `mii-tool`. Use it to check first whether the cable is physically connected.

## Configuration Files

| File | What it holds |
|------|--------|
| **`/etc/resolv.conf`** | **DNS server addresses** (`nameserver 8.8.8.8`) |
| **`/etc/hosts`** | **Manual name-to-IP mappings** |
| **`/etc/hostname`** | The computer's **host name** |
| `/etc/services` | Mapping between **port numbers and service names** |
| `/etc/nsswitch.conf` | **In what order** to look up names |
| `/etc/sysconfig/network-scripts/ifcfg-eth0` | Interface configuration (**Red Hat family**) |
| `/etc/network/interfaces` | Interface configuration (**Debian family**) |

### /etc/resolv.conf

```text
   nameserver 8.8.8.8
   nameserver 168.126.63.1
   search example.com
```

- This is **the file where DNS servers are registered**. If this file is empty, domain names cannot be converted to IPs.
- This is the answer to the question **"Which file registers the DNS server address?"**

### /etc/hosts

```text
   127.0.0.1     localhost
   192.168.0.50  myserver
```

- It is checked **before DNS**. If you write an entry here, you can connect by name without DNS.
- The order is decided by the `hosts:` line in `/etc/nsswitch.conf`, usually **`files dns`** — that is, **`/etc/hosts` first, then DNS**.

| File | Don't mix them up |
|------|-------------|
| **`/etc/hosts`** | **Direct name ↔ IP mapping** |
| **`/etc/resolv.conf`** | **The DNS server to ask** |

> Answer choices that swap the two files are easy to use as wrong answers. **`hosts` is where you write the answers down**, and **`resolv.conf` is where you write whom to ask**.

- A line in `/etc/hosts` has the order **`IP_ADDRESS  NAME  [ALIAS …]`**. **The IP comes first**.
- `nameserver` entries in `/etc/resolv.conf` are asked **starting from the top**, and moving on to the next line happens when there is no response. `search example.com` is the domain appended when you type just a short name like `www`.

### Interface Configuration File (Red Hat Family)

```text
   # /etc/sysconfig/network-scripts/ifcfg-eth0
   DEVICE=eth0
   BOOTPROTO=static
   ONBOOT=yes
   IPADDR=192.168.0.10
   NETMASK=255.255.255.0
   GATEWAY=192.168.0.1
   DNS1=8.8.8.8
```

| Item | Meaning |
|------|-----|
| `DEVICE` | The device name this file configures. Same as what follows `ifcfg-` in the file name |
| **`BOOTPROTO`** | How the address is obtained. **`static` is manual, `dhcp` is automatic assignment** |
| **`ONBOOT`** | **Whether to bring it up automatically at boot** (`yes`/`no`) |
| `IPADDR` · `NETMASK` · `GATEWAY` | Address · subnet mask · default gateway |

- With `BOOTPROTO=dhcp`, you do not write `IPADDR` and the lines after it, because the server hands out the address.
- The location and format of this file **vary by distribution and version.** Debian-family systems have used `/etc/network/interfaces`, and recent distributions manage the configuration with separate tools such as NetworkManager, so this file may not exist. The exam asks for **"the interface configuration file of the Red Hat family"** as `ifcfg-DEVICE_NAME`.

| What to change | Temporary (command) | Persistent (file) |
|-----------|------------|---------------|
| IP address | `ifconfig`, `ip addr add` | `ifcfg-eth0` |
| Default gateway | `route add default gw`, `ip route add default via` | `GATEWAY` in `ifcfg-eth0` |
| DNS server | — | **`/etc/resolv.conf`** |
| Direct name ↔ IP mapping | — | **`/etc/hosts`** |
| Host name | `hostname NEW_NAME` | **`/etc/hostname`** |

> Tomorrow we will tie this week's networking concepts together on a single page.

## 📖 Glossary

- **`lo`** : The loopback interface. Used to communicate with the machine itself.
- **`ifconfig` / `ip`** : The old / current standard commands for viewing and configuring network interfaces.
- **Default gateway** : The address of the router that traffic leaving the internal network passes through.
- **`netstat` / `ss`** : The old / current commands for viewing open ports and connection states.
- **`ping`** : A command that checks with ICMP whether the peer is reachable.
- **`traceroute`** : A command that shows, step by step, the route taken to the destination.
- **`/etc/resolv.conf`** : The file that registers the DNS server addresses used for lookups.
- **`/etc/hosts`** : The file that maps host names directly to IP addresses.

## 📝 Practice Questions

**Question 1.** Which of the following is the configuration file that registers the address of a DNS server?

A) /etc/resolv.conf  
B) /etc/hosts  
C) /etc/hostname  
D) /etc/services  

**Answer: A**  
Explanation: In `/etc/resolv.conf`, you write the address of the DNS server to use for lookups with the `nameserver` entry. `/etc/hosts` is the file that maps names directly to IPs, `/etc/hostname` holds the computer's own name, and `/etc/services` holds the mapping between port numbers and service names.

---

**Question 2.** Which of the following is the device name that represents the loopback interface?

A) eth0  
B) lo  
C) wlan0  
D) ens33  

**Answer: B**  
Explanation: `lo` is the loopback interface used to communicate with the machine itself, and its IP address is 127.0.0.1. It always exists even without a physical network card. `eth0` and `ens33` are names of wired network cards, and `wlan0` is the name of a wireless network card.

---

**Question 3.** Which of the following commands checks, step by step, the route that data takes to reach a destination?

A) ping  
B) netstat  
C) arp  
D) traceroute  

**Answer: D**  
Explanation: `traceroute` shows the routers passed through, in order, until the destination is reached, so you can tell at which hop communication breaks. `ping` only tells you whether the destination is reachable, `netstat` shows connection and port states, and `arp` shows the MAC address mapping table.

---

**Question 4.** Which of the following commands shows the TCP ports currently listening on the system and their processes?

A) ping -t  
B) route -n  
C) netstat -tulpn  
D) arp -a  

**Answer: C**  
Explanation: `-t` means TCP, `-u` UDP, `-l` listening sockets, `-p` process names, and `-n` numeric output, so this combination lets you see which service is opening which port. These days `ss -tulpn`, which does the same thing, is used more often.

---

**Question 5.** Which of the following is the current standard command that replaces `ifconfig`?

A) ip  
B) ss  
C) route  
D) arp  

**Answer: A**  
Explanation: `ifconfig` is an old command from the net-tools package, and today the `ip` command from the iproute2 package is the standard. Use `ip addr` to view addresses, `ip link` to control interfaces, and `ip route` for routing. `ss` is the command that replaces `netstat`.
