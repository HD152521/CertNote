# Day 3 - Firewalls: iptables and firewalld

## 📌 Key Points

- The engine of the Linux firewall is the kernel's **netfilter**. The low-level tool that controls it directly is **iptables**, and the high-level manager on top of it is **firewalld**.
- The iptables structure is **table → chain → rule**. The chains of the filter table are `INPUT` (incoming), `OUTPUT` (outgoing), and `FORWARD` (passing through).
- Rules are matched **in order from top to bottom**, and on a match the packet is handled immediately. If nothing matches, the **default policy (-P)** applies.
- `DROP` discards silently (no response), while `REJECT` sends back a rejection response. `-A` appends to the end and `-I` inserts at the front — the order changes the result.
- firewalld is managed with **zones** (bundles of trust levels). The biggest trap of `firewall-cmd` is the distinction between **runtime vs `--permanent` (+ `--reload`)**.

## netfilter and iptables: The Structure of Tables and Chains

- iptables controls the kernel's netfilter to inspect and process packets.
- The structure has three layers: **table → chain → rule**.
- The most used table is **filter** (decides whether to allow or block packets). If you use iptables without options, this table is the default target.
- Other tables: **nat** for NAT processing, and **mangle** for packet alteration.
- The filter table has three built-in chains, and each chain applies according to the direction of the packet flow.

| Chain | Applies to |
|------|-----------|
| `INPUT` | Packets **coming into** this system (destination is me) |
| `OUTPUT` | Packets **going out of** this system (source is me) |
| `FORWARD` | Packets **passing through** this system (when acting as a router) |

The chains split by direction. Blocking or allowing connections coming from outside into our server (web, SSH requests, etc.) is the job of the **INPUT** chain. On the exam, "block external SSH access" → an INPUT chain rule. "Control traffic going out from this host to elsewhere" → the OUTPUT chain. "Traffic passing through a gateway" → the FORWARD chain.

- The rules in each chain are applied **in order from top to bottom**.
- When a packet matches a rule, that rule's target (the handling action) is executed.
- If it matches no rule, the **default policy** applies.
- This "match in order, handle immediately on match" is the most important principle for understanding iptables.

## Default Policy and Targets: ACCEPT, DROP, REJECT

- Each chain has a **default policy**. It is the last-resort rule that decides the fate of packets that match no rule.

| Target | Meaning |
|------|------|
| `ACCEPT` | Allows the packet |
| `DROP` | Silently discards the packet (no response — the other side just sees silence) |
| `REJECT` | Rejects the packet and sends back a rejection response (the other side immediately knows it was refused) |
| `LOG` | Records the packet information in the log and moves on to the next rule |

**DROP vs REJECT**: both block, but the response differs. `DROP` discards the packet quietly, so the other side has to wait until a timeout (which has the effect of hindering port scans). `REJECT` immediately sends an ICMP response saying "refused", so the other side knows right away. For security, some setups use DROP for ports exposed externally and REJECT on the internal network for user convenience.

```bash
# Set the chain default policy to DROP (-P = policy)
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT
```

> ⚠️ **The remote work trap**: if you run `iptables -P INPUT DROP` first while connected over remote SSH, **you cut yourself off** before adding the SSH allow rule. You must add the SSH allow rule (`-A INPUT -p tcp --dport 22 -j ACCEPT`) first, and only then change the default policy to DROP. It is a trap both in practice and on the exam.

## Writing Rules: -A, -j, and Matching Conditions

- The key to the practical exam is distinguishing precisely the core options that add and delete rules.

| Option | Meaning |
|------|------|
| `-A chain` | **Append** a rule to the **end** of the chain |
| `-I chain [number]` | **Insert** at the **very front (or the specified position)** of the chain |
| `-D chain` | **Delete** a rule |
| `-R chain number` | **Replace** a rule |
| `-L` | **List** the rules |
| `-F` | **Flush** (delete) all rules in the chain |
| `-P chain target` | Set the default **policy** |
| `-j target` | **Jump**: specify the action to take on a match |

- You also need to memorize the options that specify matching conditions.

| Option | Meaning |
|------|------|
| `-p` | Protocol (tcp, udp, icmp) |
| `-s` | Source IP/network |
| `-d` | Destination IP/network |
| `--sport` | Source port |
| `--dport` | Destination port |
| `-i` | Input interface (e.g., eth0) |
| `-o` | Output interface |

- The following is a typical rule set.

```bash
# Allow TCP connections to port 22 (SSH)
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow port 80 (HTTP)
iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Block all packets coming from a specific IP (192.168.1.50)
iptables -A INPUT -s 192.168.1.50 -j DROP

# Allow loopback (self) traffic
iptables -A INPUT -i lo -j ACCEPT

# Allow response packets of already established sessions (state tracking)
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
```

**The order difference between -A and -I**: since a chain matches from top to bottom, the position of a rule changes the result. `-A` attaches to the very end, and `-I` inserts at the very front. If an "everything DROP" rule is already at the top, adding an ACCEPT after it with `-A` is pointless because packets are already caught by the DROP and never reach it. In that case, you must insert the ACCEPT in front with `-I`.

## Checking and Saving Rules

- You need to know how to check the rules you wrote and how to save them so they persist after a reboot.

```bash
# Show the rule list (-n: show IPs numerically without name resolution, -v: verbose, --line-numbers: line numbers)
iptables -L -n -v --line-numbers

# Show only a specific chain
iptables -L INPUT -n

# Reset all rules
iptables -F

# Save the rules (RHEL family) — persists after reboot
iptables-save > /etc/sysconfig/iptables
service iptables save
```

> ⚠️ **Beware of volatility**: iptables rules exist only in memory. If you reboot without saving, they all disappear. On the RHEL family, you must persist them with `service iptables save` or `iptables-save`. It is common to panic about "my rules vanished" without knowing this.

## firewalld: A Zone-Based Dynamic Firewall

- Drawbacks of iptables: it handles rules one by one, so it is not intuitive, and every time you change rules it re-applies everything, which can cut existing connections.
- **firewalld**, the default since RHEL 7, is a high-level management tool that improves on this.
- The core concept of firewalld is the **zone** — a bundle of rules that pre-defines "the trust level of a network connection".
- When you assign an interface or a source to a particular zone, that zone's rules apply.

| zone | Trust level |
|------|-----------|
| `drop` | Blocks all incoming connections with no response (most closed) |
| `block` | Rejects incoming connections (REJECT response) |
| `public` | (Default) An untrusted public network. Only selected connections are allowed |
| `home` / `internal` | A trusted internal network. Mostly allowed |
| `trusted` | Allows all traffic (most open) |

**The idea behind zones**: if iptables deals with "rules line by line", firewalld applies **situation-specific rule bundles**, like "this network card is on a public network (public), and that card is on an internal network (internal)". The key is the flexibility, such as switching a laptop to the public zone when it connects to airport Wi-Fi and to the home zone when you get home.

## firewall-cmd: The Command for Managing firewalld

- firewalld is controlled with the `firewall-cmd` command.
- The most important concept is the **distinction between runtime and permanent**.
- By default, changes made with `firewall-cmd` are **applied to the runtime only** and disappear after a reboot.
- To apply permanently, add **`--permanent`**. However, it is not reflected immediately, so you need to reload with `--reload`.

```bash
# Check the currently active zones and settings
firewall-cmd --get-active-zones
firewall-cmd --list-all

# Check/change the default zone
firewall-cmd --get-default-zone
firewall-cmd --set-default-zone=public

# Allow a service (runtime — disappears on reboot)
firewall-cmd --add-service=http

# Allow a service permanently (persists after reboot)
firewall-cmd --add-service=http --permanent

# Allow a port directly (permanent)
firewall-cmd --add-port=8080/tcp --permanent

# Apply the permanent settings immediately
firewall-cmd --reload
```

| Command/Option | Meaning |
|-----------|------|
| `--list-all` | Show the full settings of the current zone |
| `--add-service=name` | Allow a service (http, ssh, etc.) |
| `--remove-service=name` | Remove the service permission |
| `--add-port=port/protocol` | Allow a specific port |
| `--permanent` | Apply permanently (persists after reboot) |
| `--reload` | Reload the permanent settings into the runtime |
| `--get-services` | Show the list of predefined services |

**The --permanent trap**: if you only run `firewall-cmd --add-service=http --permanent`, it is written to the configuration file but **not applied right now**. You must follow it with `firewall-cmd --reload` for it to take effect in the current session too. Conversely, if you add without `--permanent`, it works now but disappears on reboot. To get both, either run it twice, once for runtime and once with permanent, or use permanent and then reload.

## iptables vs firewalld Summary

| Item | iptables | firewalld |
|------|----------|-----------|
| Abstraction level | Low-level (controls rules directly) | High-level (managed per zone) |
| Core concepts | Tables, chains, rules | zone, service |
| Control command | `iptables` | `firewall-cmd` |
| Applying changes | Full re-apply (connections may be cut) | Dynamic apply (existing connections kept) |
| Persistence | `service iptables save` | `--permanent` + `--reload` |
| Relationship | Controls netfilter directly | Uses netfilter (nftables) internally |

**The two must not be used together**: enabling the firewalld and iptables services at the same time causes a conflict. On RHEL 7+, firewalld is the default, and to use iptables directly you must turn off firewalld (`systemctl disable firewalld`) and enable the iptables service. Since both ultimately control the kernel's netfilter, only one of them should be used as the manager.

**Try it yourself**: on a test VM, run `firewall-cmd --add-service=http` (runtime only), check with `firewall-cmd --list-services`, and confirm it disappears after a reboot. Then do it again with `--permanent` and also go through `--reload` to confirm that it persists, and the difference between runtime and permanent will sink in. On the iptables side, look at the line numbers with `iptables -L -n --line-numbers` and then experiment with the positional difference between `-I` and `-A`.

Tomorrow we widen the scope of security with TCP Wrapper, SELinux, and log management.

## 📖 Glossary

- **netfilter** : The packet filtering framework built into the Linux kernel. Both iptables and firewalld control it.
- **iptables** : The traditional command that controls netfilter directly rule by rule. It works in three layers: table → chain → rule.
- **chain** : A bundle of rules per packet flow direction. `INPUT` (incoming), `OUTPUT` (outgoing), `FORWARD` (passing through).
- **default policy** : The last-resort rule that decides what to do with packets that match no rule. Specified with `-P`.
- **DROP** : A blocking method that silently discards the packet so the other side waits until a timeout.
- **REJECT** : A blocking method that immediately sends a rejection response so the other side knows right away it was blocked.
- **-A / -I** : Append a rule to the very end of the chain / Insert it at the very front. The order changes the result.
- **firewalld** : The default tool on RHEL 7+ that manages the firewall per zone. It does not cut existing connections when rules change.
- **zone** : A bundle of rules per network trust level. Examples include `public` (default), `home`, `trusted`, and `drop`.
- **--permanent / --reload** : The option that keeps a setting after reboot / the command that immediately applies that permanent setting to the current session.

## 📝 Practice Questions

**Question 1.** In the iptables filter table, which chain handles packets coming into this system from outside?

A) OUTPUT
B) FORWARD
C) INPUT
D) PREROUTING

**Answer: C**

Explanation: The `INPUT` chain handles packets whose destination is this system, that is, incoming packets. `OUTPUT` handles outgoing packets, and `FORWARD` handles packets passing through (routed by) this system. `PREROUTING` is a chain of the nat/mangle tables and does not exist in the filter table.

---

**Question 2.** Among the iptables targets, which one discards the packet without sending any response to the other side?

A) ACCEPT
B) REJECT
C) DROP
D) LOG

**Answer: C**

Explanation: `DROP` silently discards the packet so the other side experiences no response until a timeout. `REJECT` sends a rejection response (ICMP) so the other side immediately knows it was refused. `ACCEPT` allows, and `LOG` only records a log entry and moves on to the next rule.

---

**Question 3.** Which is the correct iptables command to allow incoming TCP connections on port 22 (SSH)?

A) iptables -A INPUT -p tcp --dport 22 -j ACCEPT
B) iptables -A OUTPUT -p udp --sport 22 -j DROP
C) iptables -P INPUT -p tcp --dport 22 -j ACCEPT
D) iptables -A FORWARD -p tcp --dport 22 -j REJECT

**Answer: A**

Explanation: Since it is an incoming SSH connection, the chain is `INPUT`, the protocol is `tcp`, the destination port is `--dport 22`, and the action is `-j ACCEPT`. B has the wrong direction and protocol (OUTPUT/udp), the `-P` in C is for setting a policy and is not used with a port condition, and D is a reject rule in the FORWARD chain.

---

**Question 4.** Which correctly pairs the iptables option that inserts a rule at the very front of a chain with the option that appends one to the very end?

A) Insert -A, append -I
B) Insert -I, append -A
C) Insert -D, append -R
D) Insert -F, append -P

**Answer: B**

Explanation: `-I` (Insert) inserts a rule at the very front (or the specified position) of the chain, and `-A` (Append) adds it at the very end. Because of the top-to-bottom matching order, position changes the result. `-D` is delete, `-R` is replace, `-F` is flush everything, and `-P` is set policy.

---

**Question 5.** In firewalld, which option applies a change permanently so that it persists after a reboot?

A) --runtime
B) --temporary
C) --permanent
D) --persistent

**Answer: C**

Explanation: Changes with `firewall-cmd` are runtime (volatile) by default, and only with `--permanent` are they written to the configuration file and kept after a reboot. However, `--permanent` changes are not reflected immediately, so you must re-read them with `--reload` for them to apply to the current session as well.

---

**Question 6.** Among firewalld zones, which has the highest trust level and allows all traffic?

A) drop
B) block
C) public
D) trusted

**Answer: D**

Explanation: The `trusted` zone is the most open zone, allowing all traffic. `drop` blocks all connections with no response (most closed), `block` blocks while sending a rejection response, and `public` is the default zone that allows only selected services.

---

**Question 7.** What must you do on the RHEL family to keep iptables rules after a reboot?

A) Rules are saved permanently automatically, so no extra action is needed
B) Save with service iptables save or iptables-save
C) Run firewall-cmd --reload
D) Run exportfs -ra

**Answer: B**

Explanation: iptables rules exist only in memory, so they disappear on reboot if not saved. On the RHEL family, persist them with `service iptables save` or `iptables-save > /etc/sysconfig/iptables`. `firewall-cmd --reload` is for firewalld, and `exportfs` is for NFS.

---
