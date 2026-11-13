# Day 1 - The VPC as a Virtual Datacenter, and the Five Things Operators Get Confused About Every Day

Open the VPC console for the first time and there are a lot of terms. CIDR blocks, subnets, route tables, IGW, NAT, Security Groups, NACLs, Egress-Only IGW. Once you get used to it, it seems like just a few clicks, but in operations the same person repeats the same mistakes. "It's a private subnet, so why can't it call an external API?", "I set the NACL to ALLOW everything, so why are responses getting cut off?", "I thought I could launch 16 instances in a /28 subnet, but I'm out of IPs at 11." Someone falls into the same trap every day.

This article is not about memorizing the parts of a VPC but about following **why it was designed that way.** Why AWS layered another virtual network layer on top of EC2, why it provides both stateful and stateless firewalls, why it didn't build NAT for IPv6, why it takes 5 IPs from every subnet — understanding these decisions reduces how often you fall into traps.

## The Ghost of EC2-Classic — Why VPC Appeared

Today every EC2 instance must live inside a VPC, but before 2009 that wasn't the case. In the early days of AWS there was a model called EC2-Classic, in which all customers shared the same flat network (`10.0.0.0/8`). Security was controlled only by Security Groups, and instances of two customers could even sit together in the same subnet.

There were two problems. First, **private IPs kept changing** — when you stopped/started EC2, a new private IP was assigned and the connection strings for the DB or cache broke. Second, **network isolation was weak** — there were many cases where Security Groups weren't enough (for example, blocking two instances within the same SG). And most decisively, **to connect to an on-premises datacenter over VPN, you needed control of the private address range.** If it overlapped with the 10.5.0.0/16 the company uses within 10.0.0.0/8, routing was impossible.

In August 2009 AWS introduced VPC. At first it was an "isolated network you create separately within EC2," but from 2013 VPC became the default in new Regions and new accounts, and in 2017 EC2-Classic disappeared for new accounts (and was fully shut down for existing accounts too in August 2022). Knowing this history makes the exam answer to "why must every EC2 be in a VPC" easy — it wasn't only security isolation, but **private IP control, VPN compatibility, and per-customer routing** were all impossible with EC2-Classic.

The VPC model is actually not a new invention. The **BGP/MPLS IP VPN** defined in RFC 2547 in 1999 is the same idea — "layer a per-customer isolated virtual network on top of shared infrastructure." AWS VPC implements this model with SDN (Software-Defined Networking), and internally a component called the Mapping Service maps every virtual IP to a physical host. When a packet leaves an instance, the hypervisor encapsulates the virtual IP into a physical IP and sends it, and the receiving hypervisor decapsulates it back into the vIP. This approach is an overlay network pattern similar to VXLAN.

In 2017 AWS introduced its own SDN chip (the Nitro Card) and moved this mapping function from the hypervisor to the chip. Before that, dom0 of the Xen hypervisor handled virtual networking, and this was the cause of the noisy neighbor problem (a traffic surge from another instance affecting my instance's network performance). After Nitro, networking was completely separated from the host CPU, and that's why **Traffic Mirroring, introduced around the same time, works only on Nitro instances** (the topic of the next article). The chip has to be seeing the packets for copying to be possible.

## CIDR — Where Do the 5 Reserved IPs Go?

Every time you create a subnet, 5 IPs disappear. Everyone knows this, but **why** 5 is usually not taught. Looking at the reserved IPs of a `10.0.0.0/24` subnet:

| IP | Purpose | Reason |
|----|------|------|
| `.0` | Network address | RFC 950 — a host ID with all bits 0 means "this network itself" |
| `.1` | VPC router (default gateway) | An instance's default gateway is always the second IP of the subnet |
| `.2` | Amazon DNS | The VPC's `.2` is the DNS resolver address (`+2 from VPC CIDR base`) |
| `.3` | Reserved for future use | AWS reserves it in preparation for SDN feature expansion |
| `.255` | Broadcast | RFC 919 — a host ID with all bits 1 is broadcast |

The first three and the last are RFC standards or addresses AWS actually uses. Only `.3` is a "spare," which AWS holds for future new features. From an operator's perspective, the place that bites most often is the **/28 subnet.** Subtract 5 from 16 IPs and you get 11. An RDS Multi-AZ subnet group needs at least 2 AZs, and if each subnet is a /28, you run out of IPs even after launching a handful of instances. That's why database subnets are usually sized /27 or /26.

> ⚠️ **Trap**: The VPC's own CIDR also has size constraints. `/16` is the largest and `/28` is the smallest. The reason you can't go larger than `/16` is directly tied to the limit on AWS's internal mapping table size and the number of ENIs that can fit in a single VPC (currently under 65,536). Adding a secondary CIDR is the standard pattern when you exceed `/16`, but you can add at most 5 more per VPC (6 CIDRs total).

## Public vs. Private — Two Worlds Divided by One IGW

What a "public subnet" actually is gets confused often. **A subnet itself has no Public/Private attribute.** What the AWS console labels a "public subnet" is merely a label for "a subnet whose route table has a `0.0.0.0/0 → igw-xxx` route." Change only the route table on the same subnet and Public becomes Private.

The definition of a public subnet:

1. The subnet's route table has a `0.0.0.0/0 → igw-xxx` route
2. The instance has a public IP or Elastic IP assigned

**Both** conditions must be met for internet communication to work. With only the route and no public IP, traffic can't come in from outside; with only a public IP and no route, packets can't reach the IGW. 90% of "I gave my EC2 a public IP, so why is there no internet" cases are one of these two conditions missing.

A private subnet's external communication is handled by a NAT Gateway. The NAT GW itself must be in a public subnet (since it has to go out through the IGW), and the private subnet's route table points `0.0.0.0/0 → nat-xxx`. At this point the NAT GW performs SNAT (Source NAT) with its own public IP/Elastic IP — it swaps the private instance's private IP for the NAT GW's public IP to send it out, and when the response comes back it consults the connection tracking table and returns it to the original instance.

A NAT Gateway is installed per AZ. In a multi-AZ setup, if you put the NAT GW only in AZ-a and make AZ-b's private subnets point to it too, **when AZ-a dies, all external communication from AZ-b is cut off as well.** On top of that, the cross-AZ data transfer charge ($0.01/GB) from AZ-b to AZ-a is billed even in normal times. In production, the standard is to put one NAT GW in each AZ and have each AZ's private subnets point to the NAT GW in their own AZ.

When Slack suffered a partial outage in 2020, one of the causes was the NAT Gateway. As traffic surged, they hit the connection tracking limit of a single NAT GW (about 55k ports per destination), and new connections were dropped at the SYN stage. In the post-mortem, Slack said "the NAT GW itself has 99.99% availability, but the limits on the number of single 5-tuple flows and ports per destination are a bottleneck at our scale." Slack afterwards switched to multiple NAT GWs + per-VPC sharding. In 2021 AWS made it possible to raise the NAT GW's concurrent connection limit per IP by attaching multiple IPs (Multi-IP NAT GW).

## Security Groups and NACLs — Why Provide Both Stateful and Stateless

Most operators build sufficient security with SGs alone. So why do NACLs exist? People say "defense in depth," but the two tools actually **solve fundamentally different problems.**

A Security Group is a stateful firewall at the **instance (precisely, ENI) level.** Stateful means it does connection tracking — if I respond to a connection that came in on port 80, that response passes automatically without a separate rule. So with an SG, the operator is done after writing just "outside → 80 ALLOW."

A NACL is a stateless firewall at the **subnet level.** With no connection tracking, you must define inbound and outbound separately. If you allowed requests coming in from outside on 80, you must also explicitly allow the response going out to the client's ephemeral port (typically 32768-60999, or 1024-65535 depending on the OS). If you miss this, you get the mysterious situation of "the request arrives but the response doesn't go out."

| Axis | Security Group | Network ACL |
|----|----------------|-------------|
| Applied at | ENI (instance) | Subnet |
| State | Stateful | Stateless |
| Rules | Allow only (implicit Deny) | Both Allow and Deny |
| Evaluation | All rules OR'd | First match by number order |
| Return traffic | Passes automatically | Ephemeral port must be explicit |
| Default | Default SG: only within the same SG | Default NACL: allow all |
| References | An SG can reference another SG | CIDR only |

So why do you need both? There are **three scenarios.**

First, **broad blocking of malicious IPs.** An SG has only Allow, so "just block this IP" isn't possible. This is the moment a NACL's Deny rule is needed. To block a single IP/range across an entire subnet, a NACL is the only choice (WAF exists, but it sits in front of ALB/CloudFront and can't stop direct access to EC2).

Second, **compliance isolation.** When a standard like PCI-DSS or HIPAA requires you to prove that "the DB subnet must never be able to communicate with the external internet," a single NACL line "0.0.0.0/0 → Deny outbound" is easier to verify than applying it to 100 SGs. Security auditors like "controlled in one place."

Third, **a safety net for human error.** An operator can mistakenly set up an SG with "0.0.0.0/0 port 22 ALLOW." If a NACL restricts port 22 at the subnet level to the corporate IPs only, an SG mistake doesn't immediately become an incident.

The trade-off between stateful and stateless firewalls was settled in Linux netfilter (`conntrack`), which introduced connection tracking in the late 1990s. Stateful stores connection state in memory, so it has a memory limit (the same reason as the NAT GW's 55k concurrent connection limit), while stateless can scale without bound but the rules become complex. By making the SG stateful, AWS provides operational convenience, and by making the NACL stateless, it provides both unlimited scalability and Deny expressiveness.

> ⚠️ **Trap**: Incidents from getting a NACL's ephemeral port range wrong are common. The Linux kernel default is 32768-60999, Windows is 1024-5000 (legacy) or 49152-65535 (since Vista), and the responses the AWS NAT GW receives assume 1024-65535. The safest thing is simply to **allow all of 1024-65535.** Narrowing it further breaks some OSes and some flows.

## NACL Rule Numbering — Why 100, 110, 120

NACL rules are evaluated in number order and **the first match applies.** They are not evaluated "all rules OR'd" like an SG. That's why operations guides usually tell you to number them starting from 100 in steps of 10 (100, 110, 120). Why? So that when you later "need to insert a new rule between 100 and 110," you can use 105.

This pattern comes straight from BASIC's line numbering (`10 PRINT "HELLO" / 20 GOTO 10`). BASIC in the 1960s also spaced line numbers by 10 for the same reason — to insert new lines in between. Cisco IOS ACLs use the same convention. AWS simply followed this industry standard.

A representative pattern:

```
Inbound:
  50  DENY   0.0.0.0/0       Block malicious IPs (highest priority)
  100 ALLOW  80   0.0.0.0/0  HTTP
  110 ALLOW  443  0.0.0.0/0  HTTPS
  120 ALLOW  22   10.0.0.0/8 Internal SSH
  130 ALLOW  1024-65535 0.0.0.0/0  Response ephemeral
  * (implicit) DENY ALL

Outbound:
  100 ALLOW  1024-65535 0.0.0.0/0  Response
  110 ALLOW  80 0.0.0.0/0          Outbound HTTP calls
  120 ALLOW  443 0.0.0.0/0         Outbound HTTPS calls
```

The NACL's `*` rule is an implicit deny that can't be changed. It is evaluated after all user-defined rules, and traffic that doesn't match any rule is blocked here. The exam occasionally asks "can you create a NACL rule with a number greater than 65535," and user-defined rules can only be 1-32766, with anything above reserved by AWS.

## IPv6 — The Beauty of a World Without NAT

When you first look at IPv6, it seems strange that AWS didn't build an IPv6 version of the NAT Gateway. "Huh? Then how do I allow only outbound communication?" The answer lies in the fact that **NAT was a trick to work around IPv4's address shortage, not a security tool.**

IPv4 private ranges (10.0.0.0/8, etc.) appeared in RFC 1918 in 1996, and IP address exhaustion was already becoming visible then. NAT was defined in RFC 1631 in 1996, and its original purpose was address conservation, letting "many internal hosts communicate with the outside through a single public IP." But as a side effect "external parties can't directly address internal hosts," so people began to mistake NAT for a security tool.

IPv6 has 2^128 addresses (about 340 undecillion), so every instance can have a publicly routable address. NAT disappears, and instead you **block explicitly with a firewall.** AWS's Egress-Only Internet Gateway (EIGW) plays exactly this role — it allows IPv6 instances to go out but blocks new connections coming in from outside (like a stateful firewall, responses pass).

```
IPv4 Private subnet:  SNAT via NAT GW → IGW
IPv6 Private subnet:  stateful filter via EIGW → IGW (no address translation)
```

The relationship between IPv6 and NAT was a long debate within the IETF. NAT advocates argued "it has a security aspect," but the IETF stated explicitly in RFC 4864 (2007) that "NAT is not a security feature. Real security should be done with a stateful firewall." Following this standard, AWS doesn't build NAT for IPv6 and provides only the EIGW. The EIGW is similar to the NAT GW in that it performs stateful connection tracking internally, but it does no address translation.

T-Mobile US began moving its mobile network to IPv6-only in 2014, and in 2021 it fully removed IPv4 from its core network. More than 90% of the traffic they saw flows over IPv6. This also influenced AWS's IPv6 strategy — in 2021 AWS began charging $0.005 per hour for IPv4 addresses (starting in earnest in 2024), sending the signal to "move to IPv6." IPv6 adoption in the cloud is getting underway in earnest.

## DNS Hostnames and DNS Support — What the Two Toggles Mean

A VPC has two toggles in its attributes: `enableDnsSupport` and `enableDnsHostnames`. The names are similar, so you might wonder if you should turn both on, but they mean different things.

`enableDnsSupport` (on by default) is whether to **put the AWS DNS resolver (the `.2` IP) in the VPC.** If it's off, instances can't translate domain names into IPs — every command like `apt update` and `curl https://example.com` breaks. You almost never turn this off.

`enableDnsHostnames` (off by default, on only for the default VPC) is whether **AWS automatically assigns a public DNS name to instances.** When on, instances get names like `ec2-203-0-113-5.compute-1.amazonaws.com`. To use a VPC Endpoint (Interface) or a Private Hosted Zone, **both must be on.**

When an operator creates a new VPC directly, the toggles are off by default (precisely, only enableDnsHostnames). If you create a VPC Interface Endpoint in this state, the endpoint is created but instances can't resolve the endpoint's DNS name, so it is effectively unusable. When you create a new VPC, turning on both toggles should be a reflex.

## Comparison With Other Clouds

| Item | AWS VPC | GCP VPC | Azure VNet |
|------|---------|---------|------------|
| Scope | Per Region | **Global** (subnets are per Region) | Per Region |
| Subnet unit | Per AZ | **Per Region** (multi-AZ automatic) | Per Region |
| Routing | RT per subnet | A single RT for the whole VPC | UDR per subnet |
| Stateful firewall | SG | Firewall Rules | NSG |
| Stateless firewall | NACL | Hierarchical Firewall | (none) |
| NAT | NAT Gateway | Cloud NAT | NAT Gateway |
| Private DNS | Route 53 PHZ | Cloud DNS | Private DNS Zones |

The biggest difference is that **GCP views the VPC as global.** Within one VPC, us-east1 and europe-west1 subnets can coexist, and instances in the two Regions communicate in the same private IP range. AWS is per Region, so inter-region communication needs VPC Peering or Transit Gateway. This is a trade-off: AWS emphasizes per-Region isolation (blast radius), and GCP emphasizes operational simplicity.

Azure NSG plays almost the same role as SG, and Azure has no equivalent of a stateless NACL — Azure provides a group-level additional tool called an "ASG (Application Security Group)" that achieves a similar effect.

## Summary

A VPC is not a mere network container but an SDN layer AWS built after 2009 to fill the weaknesses of EC2-Classic. It was introduced to solve three requirements at once — private IP control, VPN compatibility, and multi-tenant isolation — and afterward the Nitro chip even offloaded the hypervisor's burden.

The traps operators face every day mostly converge on these five. ① The essence of Public/Private is the route table, ② a NACL is stateless so ephemeral ports must be explicit in both directions, ③ a /28 subnet has 11 usable IPs, ④ one NAT GW per AZ, ⑤ enableDnsHostnames and enableDnsSupport must both be on for an Endpoint to work. If you remember these in your bones, 70% of exam traps disappear.

In the next article, after creating a VPC, we look at the tools for seeing "where the traffic flows" — Flow Logs, Traffic Mirroring, and Reachability Analyzer. Verifying that the network you built works as intended is the next step.

---

## 📝 Practice Questions

**Question 1.** An EC2 instance in a Private subnet needs to call an external API. What is the most appropriate setup?

A) Add 0.0.0.0/0 outbound to the security group
B) Assign a Public IP to the instance
C) Place a NAT Gateway in a Public subnet and add `0.0.0.0/0 → nat-xxx` to the Private subnet's route table
D) Attach an IGW directly to the Private subnet

**Answer: C**

Explanation: By definition a Private subnet has no route to the IGW. For external communication, the NAT GW (which must itself be in a Public subnet) performs SNAT, swapping the private IP for its own public IP to send traffic out. In production, the standard is one NAT GW per AZ — so that even if one AZ dies, the Private subnets in other AZs don't lose external communication. A single NAT GW + multi-AZ Private subnets is a loss in both availability and cross-AZ data transfer cost.

---

**Question 2.** Which of the following is an incorrect difference between security groups and NACLs?

A) SG is Stateful, NACL is Stateless
B) SG allows only Allow, NACL allows both Allow and Deny
C) SG evaluates all rules OR'd, NACL uses first match by number order
D) SG applies at the subnet level, NACL applies at the ENI level

**Answer: D**

Explanation: It's exactly the opposite. SG applies at the ENI (instance) level, and NACL applies at the subnet level. This difference is why the two tools are used together — broad policies to apply across a whole subnet (e.g., blocking a specific malicious IP, compliance isolation) suit a NACL, and fine-grained policies for individual instances suit an SG. Even two instances in the same subnet get different policies if their SGs differ.

---

**Question 3.** In a new VPC, you created a Custom NACL and allowed only inbound port 80, and HTTP requests come in but responses don't go out. What is the cause?

A) The Internet Gateway is not attached
B) A NACL is Stateless, so you must also explicitly allow outbound on the ephemeral ports (1024-65535) the responses go out on
C) Blocked by the Security Group
D) The route table is missing the 0.0.0.0/0 route

**Answer: B**

Explanation: The most common NACL trap. An SG is stateful, so responses pass automatically through connection tracking, but a NACL doesn't track connection state. When a client sends a request to port 80, the source port is an ephemeral port assigned by the OS (Linux 32768-60999, Windows since Vista 49152-65535), and the server response must return to that ephemeral port. The safest pattern is to allow all of 1024-65535 in the NACL outbound — narrowing it further breaks certain OSes and certain flows.

---

**Question 4.** How do you let an EC2 instance in an IPv6 Private subnet only communicate outbound while blocking new connections coming in from outside?

A) Use a NAT Gateway for IPv6
B) Use an Egress-Only Internet Gateway (EIGW) — an IPv6-only stateful filter
C) Route all external communication through a VPC Endpoint
D) Add an inbound NACL Deny to a Standard Internet Gateway

**Answer: B**

Explanation: IPv6 has enough addresses that NAT's address translation isn't needed. But the requirement "block only new connections coming in from outside" still exists — this is the EIGW's role. The EIGW performs stateful connection tracking internally, passing responses to connections started from inside and blocking new connections started from outside. It is a direct implementation of the model IETF RFC 4864 defined: "NAT is not security, a stateful firewall is security." Following this standard, AWS doesn't build NAT for IPv6 and provides only the EIGW.

---

**Question 5.** Can you launch 16 EC2 instances in a `/28` subnet?

A) Possible
B) Impossible — because of the 5 IPs AWS reserves, there are 11 usable IPs
C) Possible, but the IPv6 option is required
D) Impossible — `/28` provides only 8 IPs

**Answer: B**

Explanation: In every subnet, AWS reserves 5 IPs. `.0` (network address, RFC 950), `.1` (VPC router/default gateway), `.2` (Amazon DNS resolver), `.3` (reserved by AWS — for future features), and the last IP (`.255` or `.15` — broadcast, RFC 919). A `/28` has 16 IPs minus 5, leaving 11. Because of this trap, database subnets are usually sized `/27` (32-5=27) or larger. A configuration like RDS Multi-AZ requires at least 2 AZs in the subnet group, so you must always keep the 5-IP deduction in mind when planning IPs.

---

**Question 6.** A company created a new VPC and added a VPC Interface Endpoint (e.g., SSM), but the endpoint's DNS name does not resolve from EC2. What is the most likely cause?

A) Insufficient IAM permissions
B) The VPC's `enableDnsHostnames` is off (an Interface Endpoint requires both to be on)
C) A missing subnet route table
D) A Security Group blocking traffic from the endpoint

**Answer: B**

Explanation: When you create a VPC directly in the console, `enableDnsHostnames` is off by default (only the default VPC has it turned on automatically). An Interface Endpoint registers a Private DNS name per endpoint (e.g., `ssm.us-east-1.amazonaws.com`) so instances call the endpoint with the same domain, and for this Private DNS to work the VPC must have both toggles (`enableDnsSupport` + `enableDnsHostnames`) on. Turning on both toggles when creating a new VPC should be a reflex. It frequently appears on the exam as the scenario "the Interface Endpoint doesn't work."

---

**Question 7.** The operations team organized the NACL and numbered the rules 100, 110, 120. Why space them by 10 instead of 1, 2, 3?

A) AWS policy doesn't allow numbers below 100
B) A convention that leaves gaps so new rules can be inserted between two rules later (originating from BASIC line numbering)
C) Multiples of 100 are faster for performance
D) Compatibility with Cisco IOS

**Answer: B**

Explanation: Since a NACL applies the first match, you'll sometimes need to insert a new rule between rules. If you spaced them as 100, 110, 120, you can later "add a new Deny rule at 105." If you had numbered them 1, 2, 3, you couldn't insert between them and would have to renumber all the existing rules. This convention comes straight from BASIC's line numbering of the 1960s (`10 PRINT / 20 GOTO`), and Cisco IOS ACLs use the same pattern. User-defined NACL numbers can range from 1 to 32766.

---
