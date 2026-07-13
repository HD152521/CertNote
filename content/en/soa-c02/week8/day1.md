# Day 1 - VPC as a Virtual Data Center, and Five Common Operator Confusions

The VPC console is overwhelming at first glance. CIDR blocks, subnets, route tables, IGW, NAT, Security Groups, NACLs, Egress-Only IGW. Familiarity makes it seem like simple clicks, but in operations, the same people repeat the same mistakes. "Private subnet but external API calls fail", "NACL set to all ALLOW but responses cut off", "thought I'd fit 16 instances in /28 but ran out of IPs at 11." Daily, someone falls into the same trap.

This section isn't about memorizing VPC components but understanding **why they're designed this way**. Why AWS layered a virtual network on top of EC2, why both stateful and stateless firewalls exist, why IPv6 has no NAT, why 5 IPs disappear from every subnet. Understanding these decisions reduces trap frequency.

## The Ghost of EC2-Classic — Why VPC Emerged

Today, every EC2 instance must live inside a VPC, but before 2009, this wasn't true. Early AWS had EC2-Classic, a model where all customers shared one flat network (`10.0.0.0/8`). Security Group alone controlled access, and two customers' instances could coexist in the same subnet.

Two problems existed. First, **private IPs changed constantly** — stopping/starting an EC2 instance reassigned its private IP, breaking DB and cache connection strings. Second, **network isolation was weak** — Security Group alone couldn't address all cases (e.g., blocking two instances in the same SG). Most crucially, **connecting on-premises datacenters via VPN required private address control**. If company 10.5.0.0/16 overlapped AWS's shared 10.0.0.0/8, routing was impossible.

August 2009: AWS introduced VPC. Initially "an isolated network created within EC2," by 2013 it became the default for new regions/accounts, and by 2017 EC2-Classic vanished from new accounts (fully retired 2022). Understanding this history clarifies "why must every EC2 be in a VPC?" — not just security isolation but **private IP control, VPN compatibility, and per-customer routing** were all impossible with EC2-Classic.

> 💡 **Related Theory**: VPC isn't a new invention. RFC 2547 (1999) defined **BGP/MPLS IP VPN** with the same idea — "overlay isolated customer virtual networks on shared infrastructure." AWS VPC implements this via Software-Defined Networking (SDN); internally, a Mapping Service component maps all virtual IPs to physical hosts. When packets leave instances, the hypervisor encapsulates vIPs to physical IPs; receiving hypervisors decapsulate back. This mirrors VXLAN overlay network patterns.

> 🔍 **Deeper Dive**: AWS introduced its own SDN chip (Nitro Card) in 2017, moving this mapping from hypervisor to hardware. Previously, Xen's dom0 handled virtual networking, causing noisy neighbor issues (one instance's traffic blast affected another's performance). Post-Nitro, networking completely separated from host CPU. That's why **Traffic Mirroring only works on Nitro instances** (next section's topic) — the chip must see packets to copy them.

## CIDR — Where Do 5 Reserved IPs Disappear?

Every subnet creation wastes 5 IPs. Everyone knows this fact, but **why** 5 is usually not taught. In a `10.0.0.0/24` subnet, reserved IPs are:

| IP | Purpose | Reason |
|----|---------|--------|
| `.0` | Network address | RFC 950 — all-zero host ID means "this network itself" |
| `.1` | VPC router (default gateway) | Instance default gateway always subnet's second IP |
| `.2` | Amazon DNS | VPC's `.2` is DNS resolver (`+2 from VPC CIDR base`) |
| `.3` | Future use (reserved) | AWS reserves for SDN feature expansion |
| `.255` | Broadcast | RFC 919 — all-one host ID means broadcast |

First three and last follow RFC standards or AWS actually uses them. Only `.3` is "spare," which AWS preserves for future features. Most common pain point: **/28 subnets**. 16 IPs minus 5 leaves 11. RDS Multi-AZ subnet groups need minimum 2 AZs; /28 per subnet runs out fast. Database subnets typically use /27 or /26.

> ⚠️ **Trap**: VPC CIDR has size constraints. `/16` is largest, `/28` smallest. Can't exceed `/16` due to AWS's internal mapping table size limits and single-VPC ENI count (currently under 65,536). Exceeding `/16` requires adding secondary CIDRs — up to 5 additional (6 total) per VPC.

## Public vs Private — Two Worlds Divided by One IGW

"Public subnet" is often misunderstood. **Subnets have no Public/Private attribute**. AWS console's "Public subnet" label just means "route table has `0.0.0.0/0 → igw-xxx`." Change only the route table, and Public becomes Private.

Public subnet definition:

1. Subnet's route table contains `0.0.0.0/0 → igw-xxx` route
2. Instance has public IP or Elastic IP assigned

**Both conditions required** for Internet communication. Routing without public IP means outsiders can't reach in; public IP without routing means packets never reach IGW. 90% of "why doesn't my EC2 with public IP reach the Internet?" cases miss one condition.

Private subnet external communication uses NAT Gateway. NAT GW itself must live in a public subnet (it needs IGW to exit), and private subnet route tables point `0.0.0.0/0 → nat-xxx`. NAT GW performs SNAT (Source NAT) using its own public/Elastic IP — it rewrites private instance IPs to NAT GW's public IP, sending outbound, then uses connection tracking tables to return responses to original instances.

> 🔍 **Deeper Dive**: NAT Gateways are AZ-scoped. Multi-AZ setups with NAT GW only in AZ-a, with AZ-b's private subnet pointing to it? **AZ-a failure breaks AZ-b's external comms**. Plus cross-AZ data transfer charges ($0.01/GB) apply normally. Production standard: one NAT GW per AZ, each AZ's private subnets point to their own AZ's NAT GW.

> 📚 **Case Study**: Slack's 2020 partial outage partly blamed NAT Gateway. Traffic surge hit single NAT GW's connection tracking limit (~55k ports per destination); new connections dropped at SYN. Post-mortem: "NAT GW is 99.99% available, but 5-tuple flow count and ports-per-destination limits became bottlenecks at our scale." Slack migrated to multiple NAT GWs + per-VPC sharding. AWS (2021) let NAT GW attach multiple IPs to increase concurrent connection limits.

## Security Group and NACL — Why Both Stateful and Stateless?

Most operators configure security with SG alone. So why does NACL exist? "Defense in depth" they say, but the tools **solve fundamentally different problems**.

Security Group is **instance-level (ENI-level)** stateful firewall. Stateful means connection tracking — when I respond to an inbound port 80 connection, that response passes automatically without extra rules. SG requires operators to simply specify "outside → port 80 ALLOW."

NACL is **subnet-level** stateless firewall. No connection tracking, so inbound and outbound are separate. Allow inbound port 80 from outside? You must explicitly allow responses to ephemeral ports (typically 32768-60999; OS-dependent; 1024-65535 for some). Missing this creates mystery: "requests arrive but responses don't."

| Dimension | Security Group | Network ACL |
|-----------|----------------|-------------|
| Scope | ENI (instance) | Subnet |
| State | Stateful | Stateless |
| Rules | Allow only (implicit Deny) | Both Allow + Deny |
| Evaluation | All rules OR'd | First match wins |
| Response traffic | Auto-pass | Ephemeral ports explicit |
| Default | Default SG: same SG only | Default NACL: all allow |
| References | SG can reference SG | CIDR only |

Why both? **Three scenarios**:

First: **broad IP blocking**. SG is Allow-only, so "block just this IP" is impossible. NACL's Deny rule solves it. Block a single IP/range from entire subnet? NACL's the only choice (WAF exists but it's ALB/CloudFront-only; can't block EC2 direct access).

Second: **compliance isolation**. Standards like PCI-DSS or HIPAA demand "DB subnet must never communicate externally." One NACL line (`0.0.0.0/0 → Deny outbound`) proves it easier than applying SG 100 times. Auditors prefer "controlled in one place."

Third: **human error safety net**. Operator accidentally applies SG `0.0.0.0/0 port 22 ALLOW`? If NACL restricts port 22 to internal IPs at subnet level, that SG mistake doesn't immediately become an incident.

> 💡 **Related Theory**: Stateful vs Stateless firewall trade-offs emerged in late 1990s with connection tracking in Linux netfilter (`conntrack`). Stateful stores connection state in memory (limited: NAT GW's 55k simultaneous). Stateless scales infinite but requires complex rules. AWS uses stateful SG for operator convenience, stateless NACL for infinite scale and Deny expressiveness.

> ⚠️ **Trap**: NACL ephemeral port ranges are often misconfigured. Linux kernel default: 32768-60999. Windows: 1024-5000 (legacy) or 49152-65535 (Vista+). AWS NAT GW assumes 1024-65535 responses. **Safest: allow all 1024-65535**. Narrower ranges break some OS/flows.

## NACL Numbering — Why 100, 110, 120?

NACL rules evaluate in number order; **first match wins**. Unlike SG (all rules OR'd). That's why guides say number from 100 with 10-unit spacing (100, 110, 120). Why? To insert rules later — use 105 between 100 and 110.

This pattern comes directly from BASIC line numbering (`10 PRINT "HELLO" / 20 GOTO 10`). 1960s BASIC used 10-unit spacing for the same reason — inserting lines later. Cisco IOS ACLs follow convention. AWS inherited this industry standard.

Most common pattern:

```
Inbound:
  50  DENY   0.0.0.0/0       Block malicious IP (highest priority)
  100 ALLOW  80   0.0.0.0/0  HTTP
  110 ALLOW  443  0.0.0.0/0  HTTPS
  120 ALLOW  22   10.0.0.0/8 Internal SSH
  130 ALLOW  1024-65535 0.0.0.0/0  Response ephemeral
  * (implicit) DENY ALL

Outbound:
  100 ALLOW  1024-65535 0.0.0.0/0  Responses
  110 ALLOW  80 0.0.0.0/0          Outbound HTTP calls
  120 ALLOW  443 0.0.0.0/0         Outbound HTTPS calls
```

> 🔍 **Deeper Dive**: NACL's `*` rule is unchangeable implicit deny. Evaluated after all user rules; traffic matching no user rule gets blocked here. Exam sometimes asks "can you create rules with numbers above 65535?" User-defined: 1-32766 only; 65535+ reserved by AWS.

## IPv6 — The Beauty of a World Without NAT

IPv6 initially seems odd — AWS didn't build NAT Gateway's IPv6 version. "Then how limit external access?" Answer: **NAT was an IPv4 address scarcity workaround, not a security tool**.

RFC 1918 (1996) defined private address ranges (10.0.0.0/8, etc.); IP exhaustion was visible. RFC 1631 (1996) defined NAT, originally intended to "let multiple internal hosts share one public IP" for address savings. Side effect: "outsiders can't directly address internal hosts," and people mistakenly treated NAT as security.

IPv6 has 2^128 addresses (~340 undecillion); every instance can have a public-capable address. NAT vanishes. Instead: **explicit firewall blocking**. AWS's Egress-Only Internet Gateway (EIGW) does this — IPv6 instances can exit, but new external connections inbound are blocked (stateful firewall for outbound responses).

```
IPv4 private subnet:  NAT GW SNAT → IGW
IPv6 private subnet:  EIGW stateful filter → IGW (no address translation)
```

> 💡 **Related Theory**: IPv6 and NAT was long IETF debate. NAT advocates claimed "security aspect." IETF's RFC 4864 (2007) settled it: "NAT is not a security function. Real security uses stateful firewall." AWS followed this standard — no NAT for IPv6, only EIGW. EIGW performs stateful connection tracking internally (like NAT GW) but performs no address translation.

> 📚 **Case Study**: T-Mobile US switched to IPv6-only mobile networks starting 2014; by 2021, IPv4 was completely removed from core networks. Over 90% of their traffic flows IPv6. This influenced AWS's IPv6 strategy — 2021 started hourly charges on public IPv4 addresses ($0.005/hour; serious in 2024) to signal "move to IPv6." Cloud IPv6 adoption is now mainstream.

## DNS Hostname and DNS Support — Two Toggles Explained

VPC has two toggles: `enableDnsSupport` and `enableDnsHostnames`. Similar names suggest both should be on, but they mean different things.

`enableDnsSupport` (default on) determines **whether AWS DNS resolver (`.2` IP) exists inside VPC**. Disabled means instances can't resolve domain names — `apt update`, `curl https://example.com` all break. Rarely disabled.

`enableDnsHostnames` (default off; default VPC only has it on) determines **whether AWS auto-assigns public DNS names to instances**. Enabled gives `ec2-203-0-113-5.compute-1.amazonaws.com`-style names. VPC Endpoint (Interface) or Private Hosted Zones **require both on**.

> ⚠️ **Trap**: Creating a new VPC manually leaves both toggles off (specifically `enableDnsHostnames`). VPC Interface Endpoint created in this state? Created but instances can't resolve endpoint's DNS name — effectively unusable. New VPC creation should reflexively enable both.

## Comparison with Other Clouds

| Item | AWS VPC | GCP VPC | Azure VNet |
|------|---------|---------|------------|
| Scope | Region | **Global** (subnet per-region) | Region |
| Subnet unit | AZ | **Region** (multi-AZ auto) | Region |
| Routing | Per-subnet route table | VPC-wide single table | Per-subnet UDR |
| Stateful firewall | SG | Firewall Rules | NSG |
| Stateless firewall | NACL | Hierarchical Firewall | (none) |
| NAT | NAT Gateway | Cloud NAT | NAT Gateway |
| Private DNS | Route 53 PHZ | Cloud DNS | Private DNS Zones |

**Biggest difference**: GCP treats VPC globally. One VPC spans us-east1 and europe-west1 subnets; instances communicate on same private range. AWS is region-scoped; inter-region needs VPC Peering or Transit Gateway. Trade-off: AWS emphasizes regional isolation (blast radius); GCP emphasizes operational simplicity.

Azure's NSG functions like SG; no NACL equivalent. Azure instead uses "ASG (Application Security Group)" grouping for similar effects.

---

## Summary

VPC is AWS's answer to three EC2-Classic limitations: IP stability, network isolation, and on-premises integration. Understanding this history makes the 5 reserved IPs, route table mechanics, dual firewall layers, and IPv6 design decisions all click into place. Tomorrow we'll trace traffic through flow logs and troubleshooting tools.
