# Day 1 - Network Configuration and Diagnostics Lab: Bring Up an IP by Hand and Open the Route

## 📌 Key Takeaways

- Network configuration always has two layers: **temporary (`ip`, `ifconfig`) and persistent (`ifcfg-*`, `nmcli con`)**. If the task says "must survive a reboot," it always means persistent configuration.
- `ip` command syntax: `ip addr add address/prefix dev interface`, `ip route add default via gateway`. `default` is the default route.
- Even after you change a profile with `nmcli con modify`, you must **reactivate it with `nmcli con up`** for it to take effect. Saving and applying are two separate steps.
- The two entries in `ifcfg-*` that are easy to leave blank are **`BOOTPROTO`** (static/dhcp) and **`ONBOOT=yes`**. If ONBOOT is no, the interface does not come up after a reboot.
- Diagnose layer by layer: `ip a` → `ping gateway` → `ping 8.8.8.8` → `dig`. The point where it breaks is the cause.
- If `ping 8.8.8.8` works but domain names do not, it is a **DNS problem**. If the gateway responds but the outside world does not, the **default route is missing**.

## Two Layers of Network Configuration: Temporary vs Persistent

- First, burn this into your head: Linux network configuration is always split into two layers.

| Layer | When it applies | Typical tools | After reboot |
|----|----------|----------|----------|
| Temporary (runtime) | Immediately, in memory only | `ip`, `ifconfig` | **Lost** |
| Persistent | Saved to a file | `ifcfg-*`, `nmcli con` | **Kept** |

- An address added with `ip addr add` disappears at reboot.
- To make it stick, write it into a config file (`/etc/sysconfig/network-scripts/ifcfg-*`) or an `nmcli connection` profile.
- When you see a condition like "must persist after reboot" on the exam, always think **persistent configuration (a file or nmcli con)**.

**One-line summary**: `ip`/`ifconfig` are temporary, `ifcfg-*`/`nmcli con` are persistent. "Persist after reboot" = persistent configuration.

## Working with Addresses, Links, and Routes Using the ip Command

- `ifconfig`/`route` are deprecated, and the modern standard is the **`ip` command (iproute2 package)**.
- The syntax consists of an object and an action.

```bash
# Working with addresses
ip addr show                       # Show addresses of all interfaces (= ip a)
ip addr show eth0                  # Only a specific interface
ip addr add 192.168.10.5/24 dev eth0    # Assign an address
ip addr del 192.168.10.5/24 dev eth0    # Remove an address

# Link = the interface itself
ip link show                       # List interfaces and their state
ip link set eth0 up                # Bring the interface up
ip link set eth0 down              # Bring it down

# Routing
ip route show                      # Routing table (= ip r)
ip route add default via 192.168.10.1        # Set the default gateway
ip route add 10.0.0.0/24 via 192.168.10.254  # Static route to a specific network
ip route del 10.0.0.0/24                      # Delete a route
```

- The `ip` command specifies the netmask together with the address as a **CIDR prefix**, like `/24`.
- It is easy to confuse this with the old `ifconfig` syntax such as `192.168.10.5 netmask 255.255.255.0`.

**Memorize**: `ip addr add address/prefix dev interface`, `ip route add default via gateway`. `default` means 0.0.0.0/0 (the default route).

### ifconfig and route (legacy, still on the exam)

```bash
ifconfig                                   # Show active interfaces
ifconfig eth0 192.168.10.5 netmask 255.255.255.0   # Address + netmask
ifconfig eth0 up                           # Bring up
route -n                                   # Routing table (no name resolution)
route add default gw 192.168.10.1          # Default gateway
route add -net 10.0.0.0 netmask 255.255.255.0 gw 192.168.10.254  # Static route
```

- `ifconfig` writes the netmask in dotted decimal, like `netmask 255.255.255.0`.
- `route` is written in the form `add default gw` or `add -net ... netmask ... gw`.
- You need to tell the syntax of the two tools apart precisely.

## nmcli: The Command-Line Gateway to NetworkManager

- Since RHEL 7 the standard manager is **NetworkManager**, and its CLI is `nmcli`.
- The decisive difference from the `ip` command is that configuration made with nmcli is **persistent**.

```bash
# Check status
nmcli                              # Overall summary
nmcli device status                # Per-device status (= nmcli d)
nmcli connection show              # List connection profiles (= nmcli c)

# Create a static IP profile
nmcli connection add type ethernet con-name myeth ifname eth0 \
  ipv4.method manual \
  ipv4.addresses 192.168.10.5/24 \
  ipv4.gateway 192.168.10.1 \
  ipv4.dns 8.8.8.8

# Modify an existing profile
nmcli connection modify myeth ipv4.addresses 192.168.10.6/24
nmcli connection modify myeth +ipv4.dns 1.1.1.1   # Add a DNS server (+)

# Apply (you must reactivate for it to take effect)
nmcli connection up myeth
nmcli connection down myeth
```

- Key properties: `ipv4.method` (`manual` = static / `auto` = DHCP), `ipv4.addresses`, `ipv4.gateway`, `ipv4.dns`.
- **After modifying, you must bring it up again with `nmcli connection up` (or reload)** for it to take effect.

> ⚠️ **Trap**: Changing a profile with `nmcli con modify` does not apply it immediately. You must reactivate it with `nmcli con up <profile>`. It is the same "saving and applying are separate" pattern as firewalld's `--reload`.

## Writing ifcfg-* Files by Hand (Persistent Config on RHEL/CentOS)

- The file that `nmcli` ultimately generates, or that you write by hand, is `/etc/sysconfig/network-scripts/ifcfg-<interface>`.
- It can be asked as a **fill-in-the-blank** in the lab section, so you need to memorize the directives exactly.

```bash
# /etc/sysconfig/network-scripts/ifcfg-eth0  (static IP example)
TYPE=Ethernet
BOOTPROTO=static          # static (or none) = static, dhcp = automatic
NAME=eth0
DEVICE=eth0
ONBOOT=yes                # Activate automatically at boot (the key one!)
IPADDR=192.168.10.5
NETMASK=255.255.255.0     # or PREFIX=24
GATEWAY=192.168.10.1
DNS1=8.8.8.8
DNS2=1.1.1.1
```

| Directive | Meaning | Easy to get wrong |
|--------|------|---------------|
| `BOOTPROTO` | Address assignment method | static/none = static, **dhcp** = automatic |
| `ONBOOT` | Activate at boot | Must be **yes** to survive a reboot |
| `IPADDR` | IP address | Not needed with DHCP |
| `NETMASK`/`PREFIX` | Netmask | Use only one of the two |
| `GATEWAY` | Default gateway | |
| `DNS1`/`DNS2` | Nameservers | |

- To get an address via DHCP, set `BOOTPROTO=dhcp` and leave `IPADDR`/`NETMASK`/`GATEWAY` empty.
- After editing, apply with `nmcli con reload` → `nmcli con up eth0`, or `systemctl restart NetworkManager`.

**Fill-in-the-blank example**: `BOOTPROTO=____` (static/dhcp), `ONBOOT=____` (yes). With `ONBOOT=no` the interface does not come up after a reboot, a classic exam trap.

### Persistent DNS Configuration: /etc/resolv.conf

- The nameservers used for name resolution are defined in `/etc/resolv.conf`.
- However, if NetworkManager manages the interface, `DNS1`/`DNS2` in ifcfg populate this file.

```bash
# /etc/resolv.conf
nameserver 8.8.8.8
nameserver 1.1.1.1
search example.com        # Automatic domain completion
```

## Diagnostic Tools: ping, ss, dig, traceroute

- Once you have configured something, diagnostics follow to confirm "does it really work?"
- The lab section expects you to think in terms of **diagnosing layer by layer**.

```bash
# 1) L3 reachability: ping
ping -c 4 192.168.10.1             # Send 4 packets then stop (-c count)
ping -c 4 8.8.8.8                  # Check external reachability
ping -c 4 www.google.com          # Check name resolution and reachability together

# 2) Ports and sockets: ss (replaces netstat)
ss -tuln                           # TCP/UDP listening ports (numeric)
ss -tnp                            # Established TCP + process
# t=TCP, u=UDP, l=listen, n=numeric (no name resolution), p=process

# 3) Name resolution: dig / nslookup
dig www.example.com                # Detailed DNS lookup
dig www.example.com +short         # Result only
dig @8.8.8.8 example.com MX         # Query a specific server for MX records
nslookup www.example.com           # Interactive/simple lookup

# 4) Path tracing
traceroute 8.8.8.8                 # Hop-by-hop path trace
```

- Combine the `ss` options `-t` (TCP) `-u` (UDP) `-l` (listen) `-n` (numeric) `-p` (process).
- `ss -tuln` is the standard command for seeing "what ports are open right now."

**Diagnostic ladder**: ① Is there an IP? (`ip a`) → ② L2/L3 via `ping gateway` → ③ External reachability via `ping 8.8.8.8` → ④ DNS via `ping domain`/`dig`. Where it breaks is the cause.

> ⚠️ **Confusing**: If `ping 8.8.8.8` works but `ping google.com` does not, it is a **DNS (resolv.conf) problem**. IP reachability is fine and only name resolution fails.

## Diagnostic Scenario: "The Internet Doesn't Work"

- Here is the lab-style thought process in one place.

| Symptom | Suspect | Check command | Fix |
|------|------|----------|------|
| No IP | Config/ONBOOT | `ip a` | ifcfg `ONBOOT=yes`, `nmcli con up` |
| Gateway ping fails | Same-network problem | `ip r` | `ip route add default via` |
| External IP ping fails | Routing/firewall | `ip r`, `traceroute` | Check default route and firewall |
| IP works but domain fails | DNS | `dig`, `cat /etc/resolv.conf` | Fix nameserver |
| Cannot connect to a port | Service/firewall | `ss -tuln` | Start the service, open the port |

**Example problem**: "ping gateway succeeds + ping 8.8.8.8 fails" → default route is missing. `ip route add default via <gw>`.

## Hostname and Name Resolution Order

- The network lab section also covers setting the hostname and local name resolution.

```bash
hostnamectl                          # Show current hostname and OS info
hostnamectl set-hostname web01.example.com   # Change the persistent hostname
hostname                             # Print only the current hostname
```

- Name resolution follows the order of the `hosts:` line in `/etc/nsswitch.conf`.

```text
# /etc/nsswitch.conf
hosts:  files dns         # files (/etc/hosts) first, then dns
```

- If `files` comes first, mappings written in `/etc/hosts` take priority over DNS.
- Write mappings for local testing directly in `/etc/hosts`.

```text
# /etc/hosts
127.0.0.1   localhost
192.168.10.50   web01.example.com web01
```

**Resolution priority**: By default `/etc/hosts` (files) > DNS (`/etc/resolv.conf`). If `/etc/hosts` has a wrong mapping, you end up at the wrong IP even when DNS is healthy, so check it too when diagnosing.

**Renewing a DHCP client**: To get the lease again, run `dhclient -r` (release) and then `dhclient` (request again), or `nmcli con down/up`. In a NetworkManager environment, nmcli is more consistent.

## Try It Yourself

- Run the following yourself and get used to the output (a test machine or virtual machine is recommended).

```bash
# Get the current addresses, routes, and sockets at a glance
ip a
ip r
ss -tuln

# Add a temporary address, check it, then delete it
ip addr add 10.10.10.10/24 dev eth0
ip addr show eth0
ip addr del 10.10.10.10/24 dev eth0

# Diagnose reachability and name resolution
ping -c 3 127.0.0.1          # Loopback (your own TCP/IP stack)
dig +short openai.com
```

Typing it yourself until your hands remember is the only secret to passing.

## 📖 Glossary

- **Temporary / persistent configuration** : Configuration that stays only in memory and disappears at reboot (`ip`) / configuration saved in a file that persists (`ifcfg-*`, `nmcli con`).
- **iproute2** : The modern networking toolset that replaces `ifconfig` and `route`. Its main command is `ip`.
- **CIDR prefix** : Notation that writes the netmask as a bit count, like `/24`. The `ip` command uses this form.
- **Default gateway (default)** : The exit for all packets whose destination is unknown. Set with `ip route add default via <IP>`.
- **NetworkManager / nmcli** : The standard network management daemon since RHEL 7 / its command-line tool. Configuration it creates is persistent.
- **ipv4.method** : The nmcli property that sets the address assignment method. `manual` is static, `auto` is DHCP.
- **BOOTPROTO** : The directive in `ifcfg-*` that sets the address assignment method. `static` (or `none`) and `dhcp`.
- **ONBOOT** : The directive that decides whether the interface is brought up automatically at boot. If it is not `yes`, the interface does not come up after a reboot.
- **ss** : The command for viewing open sockets and ports (replaces netstat). `-t` TCP `-u` UDP `-l` listening `-n` numeric `-p` process.
- **dig** : A tool that queries a DNS server directly to check name resolution. `+short` shows only the result.
- **nsswitch.conf** : The file that sets the lookup order, whether names are looked up in `/etc/hosts` (files) first or DNS first.
- **hostnamectl** : The systemd command for viewing and changing the system hostname. `set-hostname` is applied persistently.

## 📝 Practice Questions

**Question 1.** Which `ip` command temporarily assigns the address 192.168.1.100/24 to the eth0 interface?

A) ip addr set 192.168.1.100/24 eth0
B) ip addr add 192.168.1.100/24 dev eth0
C) ip link add 192.168.1.100 dev eth0
D) ip route add 192.168.1.100/24 dev eth0

**Answer: B**

Explanation: Assigning an address uses the syntax `ip addr add address/prefix dev interface`. `set` is not an action of ip addr, `ip link` deals with the interface itself (up/down, etc.), and `ip route` deals with routing. Since this is a temporary setting, it disappears at reboot.

---

**Question 2.** Which command sets the default gateway to 192.168.1.1?

A) ip route add 192.168.1.1 via default
B) ip route add default via 192.168.1.1
C) ip route add gateway 192.168.1.1
D) ip addr add default via 192.168.1.1

**Answer: B**

Explanation: The default route is added with the syntax `ip route add default via <gateway>`. `default` means 0.0.0.0/0 and the gateway address follows `via`. A has the order reversed, and C and D use the wrong keyword or object.

---

**Question 3.** In the `ifcfg-eth0` file, which directive must be set to yes so that the interface is activated automatically even after a reboot?

A) BOOTPROTO
B) ONBOOT
C) DEVICE
D) TYPE

**Answer: B**

Explanation: Only with `ONBOOT=yes` does the interface come up automatically at boot. With `ONBOOT=no`, the network is down after a reboot even if the IP settings are correct. `BOOTPROTO` is the address assignment method (static/dhcp), and `DEVICE`/`TYPE` are the device name and type.

---

**Question 4.** When configuring an ifcfg file to obtain an address automatically via DHCP, what value do you assign to `BOOTPROTO`?

A) static
B) none
C) dhcp
D) auto

**Answer: C**

Explanation: In an ifcfg file, automatic DHCP assignment is specified with `BOOTPROTO=dhcp`. A static IP uses `static` (or `none`). `auto` is a value of nmcli's `ipv4.method`, not a BOOTPROTO value in ifcfg. When using DHCP, leave IPADDR/NETMASK/GATEWAY empty.

---

**Question 5.** `ping 8.8.8.8` gets a normal reply, but `ping www.example.com` fails. What is the most likely cause?

A) The default gateway is not set
B) The interface has no IP
C) There is a problem with the DNS (nameserver) configuration
D) A firewall is blocking ICMP

**Answer: C**

Explanation: Since reaching the IP (8.8.8.8) works, L3 routing and the IP configuration are fine. Only the domain failing points to a problem at the **name resolution (DNS)** stage, so suspect the `nameserver` setting in `/etc/resolv.conf` or the DNS server's response. If ICMP were blocked, the ping to 8.8.8.8 would have failed too.

---

**Question 6.** Which `ss` command shows the TCP and UDP ports currently listening, in numeric form, all at once?

A) ss -tuln
B) ss -tup
C) ss -a only
D) ss -r show

**Answer: A**

Explanation: `ss -tuln`, which combines `-t` (TCP) `-u` (UDP) `-l` (listen) `-n` (numeric), is the standard command for viewing listening ports numerically. `-p` additionally shows process information but this option set lacks the listen-only flag (`-l`), and C and D are nonexistent option combinations.

---

**Question 7.** After changing an IP with `nmcli connection modify`, which additional command must you run to apply the change to the current session?

A) nmcli device disconnect
B) nmcli connection up <profile>
C) ip addr flush
D) systemctl stop NetworkManager

**Answer: B**

Explanation: `nmcli connection modify` only saves the profile persistently and does not apply it immediately. You must bring the connection up again with `nmcli connection up <profile name>` for the change to take effect. C is a command that clears addresses, and D stops NetworkManager itself, which actually cuts the network.

---
