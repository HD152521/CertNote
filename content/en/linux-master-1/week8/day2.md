# Day 2 - Network Configuration: Setting Up Interfaces, Gateways, and DNS by Hand

## 📌 Key Takeaways

- Network configuration has three axes — **address (`ip addr`/IPADDR) · route (`ip route`/GATEWAY) · name (resolv.conf/hosts).**
- The tools split by generation: **legacy `ifconfig`, `route`, `arp`** ↔ **modern `ip` (iproute2) and `nmcli`**. The exam asks for the 1:1 mapping table.
- **The biggest trap is temporary vs permanent.** `ip addr add`, `ifconfig`, and editing resolv.conf directly are **temporary (or at risk of being overwritten)**, while `ifcfg` files and `nmcli con mod` are **permanent**.
- In `ifcfg-eth0`, **if `ONBOOT=no`, the interface does not come up at boot even if the IP settings are all correct.** `BOOTPROTO` decides between static and dhcp.
- Name resolution follows the `hosts: files dns` order in `/etc/nsswitch.conf` — **`/etc/hosts` is matched before DNS**.

## The ip Command — The Standard Tool for Modern Linux Networking

- The **`ip` command** (from the iproute2 package) **unifies and replaces** the old `ifconfig`, `route`, and `arp`.
- It is now the standard tool on all major distributions.

```bash
# Check interfaces and IP addresses
ip addr show          # short form: ip a
ip addr show eth0     # a specific interface only

# Check interface link (L2) status
ip link show          # short form: ip l

# Add/remove an IP address (temporary — lost on reboot)
ip addr add 192.168.1.10/24 dev eth0
ip addr del 192.168.1.10/24 dev eth0

# Enable/disable an interface
ip link set eth0 up
ip link set eth0 down

# Check the routing table
ip route show         # short form: ip r
```

The `ip` command has a consistent syntax: the object (addr, link, route, neigh) first, then the action (show, add, del, set). `ip a` = addresses, `ip l` = links, `ip r` = routing, `ip neigh` = ARP table. Just learning these four abbreviations covers 80% of diagnosis.

> ⚠️ **Trap**: an IP assigned with `ip addr add` is **temporary** — it disappears on reboot. For permanent configuration, use the configuration files below (`network-scripts`) or `nmcli`. If the exam asks for "a configuration method that persists after reboot", `ip addr add` is never the answer.

## ifconfig and route — Legacy Commands You Should Know

- These are legacy commands from the `net-tools` package. Modern distributions often **do not install it by default**.
- They still show up on the exam and on legacy systems, so it is efficient to memorize the mapping table as a whole.

| Task | Legacy (net-tools) | Modern (iproute2) |
|------|-----------------|----------------|
| Check IP addresses | `ifconfig` | `ip addr` |
| Set IP temporarily | `ifconfig eth0 192.168.1.10 netmask 255.255.255.0` | `ip addr add 192.168.1.10/24 dev eth0` |
| Bring up an interface | `ifconfig eth0 up` | `ip link set eth0 up` |
| Check routing | `route -n` | `ip route` |
| Add default gateway | `route add default gw 192.168.1.1` | `ip route add default via 192.168.1.1` |
| ARP table | `arp -n` | `ip neigh` |

```bash
# Legacy: add a gateway
route add default gw 192.168.1.1 eth0

# Modern: the same task
ip route add default via 192.168.1.1 dev eth0
```

**Key distinction**: `ifconfig` only shows the IP address and cannot properly handle secondary IPs or policy routing. `ip` fully supports them. If the exam asks for "the command that replaces ifconfig", it is `ip addr`. It is efficient to memorize the 1:1 mapping table of the two commands as a whole.

## nmcli — Command-Line Control of NetworkManager

- On Red Hat-family systems (RHEL/CentOS/Rocky) and modern distributions, **NetworkManager** manages the network.
- The tool that controls it from the command line is **`nmcli`**, and settings made with nmcli are **saved permanently**.

```bash
# Check connection and device status
nmcli connection show          # short form: nmcli con show
nmcli device status            # short form: nmcli dev status

# Configure a static IP permanently
nmcli con mod eth0 ipv4.addresses 192.168.1.10/24
nmcli con mod eth0 ipv4.gateway 192.168.1.1
nmcli con mod eth0 ipv4.dns 8.8.8.8
nmcli con mod eth0 ipv4.method manual    # static
nmcli con up eth0                        # apply the changes

# Switch to DHCP
nmcli con mod eth0 ipv4.method auto
```

nmcli distinguishes between a "connection (configuration profile)" and a "device (physical device)". You edit the profile with `con mod` and apply it with `con up`. `ipv4.method manual` = static, `auto` = DHCP. nmcli settings are written to configuration files, so they persist after reboot.

## Configuration Files — /etc/sysconfig/network-scripts

- The traditional permanent network configuration on Red Hat-family systems lives in the **`/etc/sysconfig/network-scripts/ifcfg-<interface>`** file.

```bash
# Example /etc/sysconfig/network-scripts/ifcfg-eth0 (static IP)
DEVICE=eth0
BOOTPROTO=static        # static = static, dhcp = automatic
ONBOOT=yes              # activate automatically at boot
IPADDR=192.168.1.10
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=8.8.8.8
DNS2=8.8.4.4
```

| Item | Meaning |
|------|------|
| DEVICE | Interface name |
| BOOTPROTO | static / dhcp / none |
| ONBOOT | If yes, activate automatically at boot |
| IPADDR / NETMASK | IP address / subnet mask |
| GATEWAY | Default gateway |
| DNS1 / DNS2 | Name servers |

> ⚠️ **Trap**: with `ONBOOT=no`, the interface does not come up at boot even if all the IP settings are correct, so the network does not work. It is the cause of the "settings are right but no connection after boot" problem. Debian/Ubuntu-family systems use `/etc/network/interfaces` or netplan (`/etc/netplan/*.yaml`) instead of this file.

The `ifcfg-` file is the method Red Hat has used for a long time, and recent RHEL is internally moving to NetworkManager keyfiles (`/etc/NetworkManager/system-connections/`). The exam still asks about the traditional `ifcfg-eth0` format and the meaning of the entries in it.

## Gateways and Routing — The Way Out

- Hosts within the same network (subnet) communicate **directly**.
- **To reach a different network, traffic must go through a gateway (router).**
- The **routing table** decides "which path to send traffic on to reach which destination".

```bash
# Check the routing table
ip route show
# default via 192.168.1.1 dev eth0           ← default gateway
# 192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10

# Add a default gateway (temporary)
ip route add default via 192.168.1.1

# Add a static route to a specific network
ip route add 10.0.0.0/24 via 192.168.1.254

# Delete a route
ip route del 10.0.0.0/24
```

**Key distinction**: the **default (0.0.0.0/0)** route is the default gateway that handles "all other destinations". If the routing table has no default, hosts on the same subnet can communicate but the Internet is unreachable. "Internal ping works but external ping fails" = most likely a default gateway configuration problem.

## DNS Configuration — /etc/resolv.conf

- The file that specifies **which server to send DNS queries to** (to convert names (domains) into IPs) is `/etc/resolv.conf`.

```bash
# Example /etc/resolv.conf
nameserver 8.8.8.8        # primary name server
nameserver 8.8.4.4        # secondary name server
search example.com        # automatic domain completion (appended when only a hostname is typed)
```

| Item | Meaning |
|------|------|
| nameserver | IP of the DNS server to send queries to (tried in order from the top) |
| search | Domain automatically appended when only a hostname is used, without a domain |
| domain | Local domain name |

On systems managed by NetworkManager, even if you edit `/etc/resolv.conf` directly, the change can be **overwritten on reboot or restart** and lost. Permanent DNS configuration should be done with `nmcli con mod ... ipv4.dns` or `DNS1/DNS2` in the `ifcfg` file. This "direct edit gets wiped" phenomenon is a trap both on the exam and in practice.

## /etc/hosts — A Static Mapping Checked Before DNS

- `/etc/hosts` is the **static hostname-to-IP mapping file that the system consults first**, before a DNS query.

```bash
# Example /etc/hosts
127.0.0.1   localhost
::1         localhost
192.168.1.50  webserver.local webserver
```

- The name resolution order (which source to check first) is set by the **`hosts:` line of `/etc/nsswitch.conf`**.

```bash
# /etc/nsswitch.conf
hosts:  files dns       # files (= /etc/hosts) first, then dns
```

Because the order is `files dns`, if there is an entry in `/etc/hosts` it is matched **before** DNS. So if you write a wrong IP in hosts, you will be connected to the wrong place even when DNS is healthy. Conversely, it is useful for testing small host mappings without DNS.

## Try It Yourself — A Configuration Check Routine

```bash
# 1. IP and interface status
ip addr show

# 2. Check the default gateway
ip route show | grep default

# 3. Check the DNS servers
cat /etc/resolv.conf

# 4. Can we reach the gateway?
ping -c 3 192.168.1.1

# 5. Does name resolution work?
ping -c 3 google.com
```

- Following these 5 steps in order quickly narrows down where it is blocked along the **"IP → route → name"** axes.
- If ping **works by IP but not by domain name, it is a DNS problem**; if it **fails even to the gateway, it is an IP/route problem**.

Tomorrow (Day 3) we cover the diagnostic commands that check whether these settings are actually working.

## 📖 Glossary

- **iproute2 / `ip` command**: the modern standard tool that unifies `ifconfig`, `route`, and `arp`. It uses object (addr, link, route, neigh) + action (show, add, del, set) syntax.
- **Temporary vs permanent configuration**: settings that vanish on reboot (`ip addr add`, `ifconfig`) vs settings written to files and kept (`ifcfg`, `nmcli con mod`).
- **NetworkManager / `nmcli`**: the daemon that manages the network and its command-line tool. nmcli settings are saved to files and applied permanently.
- **connection vs device**: the "configuration profile" and "physical device" that nmcli distinguishes. Edit with `con mod` and apply with `con up`.
- **`ipv4.method manual / auto`**: the value in nmcli that decides whether to use a static IP or DHCP.
- **`BOOTPROTO`**: the entry in an ifcfg file that decides whether it is static or dhcp (automatic).
- **`ONBOOT`**: the entry that decides whether to bring the interface up automatically at boot. If `no`, the network does not work even if the settings are right.
- **Default gateway / default route**: the exit that handles "all other destinations". Without it, internal communication works and only the Internet does not.
- **Static route**: a rule that sends only a specific destination network to a specified gateway. `ip route add network via gateway`.
- **`/etc/resolv.conf`**: the file listing the servers to send DNS queries to. In a NetworkManager environment, direct edits get overwritten.
- **`search` directive**: the domain automatically appended when only a hostname is typed.
- **`/etc/nsswitch.conf`**: the file that sets the order of where to look up names first. With `hosts: files dns`, hosts takes priority.

## 📝 Practice Questions

**Question 1.** What is the correct way to configure a static IP that persists after reboot on a Red Hat-family system?

A) Run `ip addr add 192.168.1.10/24 dev eth0`

B) Set IPADDR and ONBOOT=yes in `/etc/sysconfig/network-scripts/ifcfg-eth0`

C) Run `ifconfig eth0 192.168.1.10`

D) Add the IP to `/etc/resolv.conf`

**Answer: B**

Explanation: Permanent configuration requires writing IPADDR, NETMASK, ONBOOT=yes, etc. to the `ifcfg-eth0` file (or using nmcli con mod). A and C are both temporary settings that vanish on reboot, and the resolv.conf in D is a file that specifies DNS servers, not an IP address. The key is the distinction "temporary (ip/ifconfig) vs permanent (ifcfg/nmcli)".

---

**Question 2.** What is the most typical symptom when there is no default route in the `ip route show` output?

A) Communication fails even with hosts on the same subnet

B) Same-subnet communication works, but traffic cannot leave for other networks (the Internet)

C) Only DNS name resolution fails

D) The interface goes into the down state

**Answer: B**

Explanation: The default route is the default gateway that handles "all other destinations". Even without it, the same subnet communicates directly, but there is no path to other networks, so the Internet does not work. A is unrelated to the gateway because it is the same subnet, C is a DNS (resolv.conf) problem, and D is a link state unrelated to routing.

---

**Question 3.** Which modern command replaces `ifconfig` for checking IP addresses?

A) `ip route show`

B) `ip link set`

C) `ip addr show`

D) `ip neigh show`

**Answer: C**

Explanation: `ip addr show` (short form `ip a`) displays the interface IP addresses and replaces `ifconfig`. A shows the routing table, B changes link state (does not display IPs), and D checks the ARP table. The `ip` command shows different information depending on the object (addr/link/route/neigh), so you need to tell them apart.

---

**Question 4.** Which statement about the relationship between `/etc/hosts` and DNS is correct?

A) A DNS query is always performed before /etc/hosts

B) According to the `hosts: files dns` setting in nsswitch.conf, /etc/hosts is consulted before DNS

C) /etc/hosts can hold only IPs, not hostnames

D) Editing /etc/hosts automatically registers the entry with the DNS server as well

**Answer: B**

Explanation: The name resolution order is set by the `hosts:` line of `/etc/nsswitch.conf`, and it is usually `files dns`, so `/etc/hosts` (files) is checked before DNS. A states the order backwards, C is wrong because hosts is a file that holds an IP and hostnames together, and D is wrong because hosts is local-only and unrelated to the DNS server.

---

**Question 5.** What happens when `ifcfg-eth0` in `/etc/sysconfig/network-scripts/` has `ONBOOT=no`?

A) Even if the IP settings are all correct, the interface is not activated automatically at boot

B) The IP is obtained only through DHCP

C) DNS queries are disabled

D) The gateway is automatically deleted

**Answer: A**

Explanation: `ONBOOT` decides whether the interface is activated automatically at boot, so with `no`, even if the IP and gateway are all correct, the interface does not come up after boot and the network does not work. B is the role of the BOOTPROTO entry, and C and D are unrelated to ONBOOT. It is a classic cause of "settings are fine but no connection after boot".

---

**Question 6.** On a system managed by NetworkManager, you edited `/etc/resolv.conf` directly and the change disappeared after reboot. What is the correct way to configure DNS permanently?

A) Change resolv.conf to chmod 000

B) Run `nmcli con mod eth0 ipv4.dns 8.8.8.8` and then `nmcli con up eth0`

C) Add DNS with `ip addr add`

D) Add a nameserver to /etc/hosts

**Answer: B**

Explanation: In a NetworkManager environment, resolv.conf gets overwritten, so you must configure it with `nmcli con mod ... ipv4.dns` (or DNS1/DNS2 in ifcfg) for it to be applied permanently. A locks the file and has big side effects, C is a command that handles IP addresses, not DNS, and the hosts in D is not a file that uses the nameserver directive.

---

**Question 7.** Which command adds a static route that sends traffic for another network, 10.0.0.0/24, to the gateway 192.168.1.254?

A) `ip route add default via 192.168.1.254`

B) `ip addr add 10.0.0.0/24 dev eth0`

C) `ip route add 10.0.0.0/24 via 192.168.1.254`

D) `ip link set 10.0.0.0/24 up`

**Answer: C**

Explanation: A static route to a specific network has the form `ip route add <destination-network> via <gateway>`. A changes the default route for all traffic, so its scope is different, B assigns an IP to an interface, and D changes link state and is unrelated to routing.

---
