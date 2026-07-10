# Day 3 - Security Groups vs NACLs, and What Flow Logs Tell You

Two firewalls act on a packet inside a VPC, one after the other: the NACL (Network ACL) at the subnet boundary, and the Security Group at the instance (more precisely, the ENI) boundary. These two look similar but work in fundamentally different ways, and that difference is the point that shows up most often on the exam. The difference between the two firewalls ultimately comes down to three axes — *stateful vs stateless*, *role-based vs network-based*, and *whitelist-only vs blacklist-capable* — and these three axes are also the basic taxonomy of all firewall design.

Today we cover the real difference between SG and NACL, and VPC Flow Logs, which let you retroactively analyze what happened on top of them. And one more thing: from the perspective of *Defense in Depth*, we look at how the two firewalls act as complements to each other.

## The Order in Which the Two Firewalls Act

```
[ Outside Internet / Other Instance ]
            ↓
   Subnet-boundary NACL (Stateless)
            ↓
   ENI-boundary Security Group (Stateful)
            ↓
   [ EC2 Instance ]
```

An incoming packet must pass through NACL → SG in that order to arrive. An outgoing packet takes the reverse order. Both firewalls must allow the traffic for communication to happen. This is an *AND* condition, and if either one denies, the packet is dropped. That the two firewalls are combined with *AND* rather than *OR* is the essence of Defense in Depth.

> 💡 **Related theory**: The serial placement of the two firewalls is a direct implementation of the *layered firewall architecture* recommended in NIST SP 800-41 (Guidelines on Firewalls). An external perimeter firewall (stateless, similar to NACL) combined with a host-based firewall (stateful, similar to SG) means that even if a single line of defense is breached, the next layer blocks it. The same model has been operated for decades in on-premises data centers as the *DMZ + internal firewall* pattern. AWS built it automatically into the VPC abstraction.

## Security Group: A Stateful Allow-List

An SG is a stateful firewall that's **attached to an ENI**. "Stateful" is the key: once an outbound connection is allowed, its response passes automatically without consulting the inbound rules.

| Property | SG |
|------|-----|
| Applies to | ENI |
| Statefulness | Stateful |
| Rules | Allow only (Deny not possible) |
| Evaluation | Evaluates all rules at once (order-independent) |
| Default | inbound all deny / outbound all allow |
| Limits | 5 SGs per instance, 60 in + 60 out rules per SG |
| Source | IP CIDR, another SG, prefix list |

> 🔍 **Going deeper**: "Stateful" means the SG maintains a **connection tracking table**. Once one TCP flow (src IP:port + dst IP:port + protocol) is allowed, that flow's response packets pass automatically. This is exactly the same model as Linux netfilter's `conntrack` module. AWS maintains a separate conntrack per ENI, and when the conntrack table size reaches its limit during a traffic surge, new connections are dropped. The supported number of connections differs by EC2 instance type, and Nitro instances can go up to millions. This limit is a direct influence factor in *connection floods during a DDoS attack*, and AWS Shield Advanced provides protection that automatically raises the conntrack limit.

> 💡 **Related theory**: The stateful firewall was first commercialized by Check Point's FireWall-1 in the 1990s; before that, all firewalls were stateless (packet-by-packet). A stateless firewall carries the operational burden of having to explicitly allow an ephemeral port range for response traffic. Because the AWS NACL is stateless, it has the same issue, and this is a pitfall that comes up often on the exam. The invention of the stateful firewall was decisive for the security industry, because it introduced the semantic unit of a *connection* compared to the earlier *packet filter* that viewed every packet independently. RFC 2979 (1999) formally defines this.

### Referencing an SG as a Source

The SG's most powerful feature: **you can reference another SG as a source/destination**. Instead of an IP, "all ENIs belonging to an SG" are matched automatically.

```
ALB SG:  inbound 443 from 0.0.0.0/0
App SG:  inbound 8080 from ALB SG       ← SG reference
DB SG:   inbound 5432 from App SG       ← SG reference
```

Bundle it this way and even when an instance is added, you just attach it to the SG and it automatically enters the matching scope. Compared to an IP whitelist, the operational burden drops dramatically. This SG reference pattern is the network-layer implementation of *role-based access control*, and it has far higher operational stability than IP-based *attribute-based* access.

> 🔍 **Going deeper**: SG references are internally resolved dynamically by the *Mapping Service* (part of the VPC SDN covered on Day 6) through ENI metadata. The Private IPs of the ENIs belonging to an SG ID are automatically updated in the mapping table, and every host's Nitro card references this to filter packets. Thanks to this automatic synchronization, SG references are reflected immediately even as instances are dynamically added or removed by an ASG. The same model is nearly identical to the *labelSelector* of Kubernetes NetworkPolicy.

> 📚 **Case study**: During the 2017 Amazon S3 us-east-1 outage, some of the many affected companies had designed SG references incorrectly and experienced a cascade where *retries to a backup S3 endpoint failed after the S3 interface endpoint went down*. In the post-incident recovery, the combination of SG references + prefix lists to "allow multiple endpoints at once" became the standard.

## NACL: Stateless Allow + Deny

A NACL is a stateless firewall that's **attached to a subnet**.

| Property | NACL |
|------|------|
| Applies to | Subnet |
| Statefulness | Stateless |
| Rules | Both Allow + Deny |
| Evaluation | Ascending rule number, decided at the first match |
| Default (Default NACL) | All allow |
| Default (Custom NACL) | All deny |
| Limits | 20 in + 20 out per NACL (can be increased) |
| Source | IP CIDR only (no SG reference) |

Because it's stateless, response traffic must also be explicitly allowed. So a NACL almost always includes an **ephemeral port range allow rule**.

```
[ Outbound NACL Rules ]
 100 ALLOW TCP 443 to 0.0.0.0/0
 110 ALLOW TCP 80  to 0.0.0.0/0
 *   DENY

[ Inbound NACL Rules — to receive responses ]
 100 ALLOW TCP 1024-65535 from 0.0.0.0/0   ← ephemeral port
 *   DENY
```

> ⚠️ **Pitfall**: If you allow only inbound 443 on the NACL and don't open outbound ephemeral, the response can't get out. This is the difference from an SG, and it's a common cause of "why isn't communication working?" When debugging, you have to look at the NACL down to the *direction* the packet goes out. Also, if you set the ephemeral port range too narrowly, the number of concurrent connections gets pinned to the OS limit and throughput can drop.

> 🔍 **Going deeper**: The ephemeral port range differs by OS. Linux 4.x+ is 32768-60999, Windows 2008+ is 49152-65535, and older Linux/Windows is 1024-65535. To be safe, the standard is to **allow all of 1024-65535**. The stateless nature of the NACL is the single biggest reason it makes operations difficult. RFC 6056 (2011) defines security recommendations for ephemeral port allocation, recommending randomization on the grounds that predictable port allocation is vulnerable to attacks like the *idle scan*. Modern OSes all comply with this.

> 💡 **Related theory**: The NACL's "first match in number order" evaluation is the *first-match firewall* model, and nearly all traditional firewalls — Cisco ACL, iptables, BSD pf — use this model. The practice of leaving gaps between rule numbers (e.g., 100, 110, 120) is to leave room to insert rules later. The *best-match firewall* (most specific rule wins) model is more intuitive but makes it easy for an operator to trigger an unintended match, so explicit first-match became the industry standard.

## SG vs NACL: The Real Difference in One Line

| Item | SG | NACL |
|------|-----|------|
| Unit of application | ENI | Subnet |
| State | Stateful | Stateless |
| Rule types | Allow only | Allow + Deny |
| Evaluation | Union of all rules | First match in number order |
| Source | IP, SG, prefix list | IP only |
| Response auto-allow | Yes | No (ephemeral separately) |
| Blast radius of a change | Per ENI | The whole subnet |
| Typical use | General security | Broad IP blocking (e.g., DDoS-suspected IPs) |

Practical pattern: **SG is primary, NACL is secondary**. Express 90% of your security rules with SG, and use NACL only for broad policies like "block a specific IP/range entirely."

> 📚 **Case study**: In 2018, a case was reported where a company configured its SGs so complexly that debugging became impossible. One EC2 had 5 SGs attached, each with 60 rules, so a total of 300 rules acted on one ENI. Every time they added a new rule, they couldn't trace its interaction with the other rules. Afterward they simplified the SGs to be "role-based" (1 SG = 1 role) and had instances of the same role share the same SG. Designing **an SG as a role group, not an IP whitelist**, is the standard. In 2021, a fintech enforced the same lesson with IaC (Terraform) — they made a lint fail if an SG name wasn't in the `[role]-[env]` format, automatically enforcing role-based SGs.

> ⚠️ **Pitfall**: A NACL applies to the *entire subnet*, so a change has a large scope of impact. If a subnet has 100 ENIs, one wrongly added NACL rule can simultaneously block traffic for 100 instances. An SG is per-ENI, so the *blast radius* of a change is small. When you touch a NACL in production, you should always prepare a *change window* and a *rollback plan* in advance.

> 🔍 **Going deeper**: The *complexity explosion* of SGs and NACLs is a classic problem in cloud network security. When an organization operates dozens of VPCs × hundreds of SGs × thousands of rules, humans can no longer trace it. The solutions are ① code the rules with IaC (Terraform, CloudFormation), ② centrally enforce SG policy with AWS Firewall Manager, and ③ automatically detect external exposure with Access Analyzer. *AWS Network Firewall*, released in 2023, provides the option of putting a higher-level L7 firewall on top of NACL/SG.

## VPC Flow Logs: Who Communicated With Whom

Flow Logs record the metadata of traffic that passed through every ENI in the VPC. They don't look at the packet body, only the headers. The default fields:

```
version account-id interface-id srcaddr dstaddr srcport dstport
protocol packets bytes start end action log-status
```

- **action**: `ACCEPT` or `REJECT` — how the SG/NACL judged it.
- **start/end**: the start and end times of the traffic flow.
- **packets/bytes**: the amount.

The storage location is chosen from three: **CloudWatch Logs, S3, or Kinesis Data Firehose**. Analysis is usually with **Athena** or **CloudWatch Logs Insights**.

```sql
-- Athena: top 10 source IPs of rejected traffic
SELECT srcaddr, COUNT(*) as cnt
FROM vpc_flow_logs
WHERE action = 'REJECT' AND start_time > current_date - interval '1' day
GROUP BY srcaddr
ORDER BY cnt DESC LIMIT 10;
```

> 💡 **Related theory**: Flow Logs are the cloud version of **NetFlow** (Cisco, 1996). Where NetFlow is a model that sends flow metadata from a router to a collector, Flow Logs implement the same concept on top of SDN. IPFIX (RFC 7011) is the IETF-standardized version of NetFlow, and AWS Flow Logs follow a data model compatible with IPFIX. NetFlow has been used by telecom carriers for *traffic engineering* and *billing* since the late 1990s, and its data was processed with analysis tools like *Argus, SiLK, and nfdump*. AWS Flow Logs can also connect to the same tool chain.

> 📚 **Case study**: In 2020, a fintech retroactively discovered, via Flow Logs, a data exfiltration that GuardDuty had missed. A pattern of ~500MB leaving one EC2 to an unknown external IP every midnight was caught in an Athena query. It turned out to be not mining malware but a misconfigured backup script sending data to the wrong S3 endpoint. Without Flow Logs, discovery would have taken several more months. In a similar case, in 2022 a gaming company discovered a *crypto-mining* malware-infected EC2 through Flow Logs — CPU utilization was normal, but the outbound traffic pattern in the Flow Logs (an unknown mining-pool domain) raised the alarm.

> 🔍 **Going deeper**: Flow Logs added new fields like *traffic-type*, *pkt-srcaddr*, and *pkt-dstaddr* in v5 (2021). *pkt-srcaddr* shows the original IP *before* NAT translation, making it possible to trace the original source even for traffic that passed through a NAT GW. This is decisive in security incident investigations — it became possible to know the real attacker IP beyond the NAT. Also, in v5 you can select a different set of fields per ENI, so you can fine-tune log cost.

## The Limits of Flow Logs and How to Complement Them

Flow Logs capture **the metadata of every packet, not a sample**, but **they don't look at the packet payload**. They can't capture DNS query contents, HTTP headers, or SQL queries. To see even the payload, you have to use **VPC Traffic Mirroring** (released in 2019). It replicates ENI traffic to another ENI or an NLB for analysis with deep packet inspection (DPI) tools.

| Tool | What it sees | Use |
|------|---------|------|
| VPC Flow Logs | Header metadata | General auditing/troubleshooting |
| Traffic Mirroring | Full packet payload | DPI, IDS, forensics |
| Route 53 Resolver Query Logs | DNS queries | Domain-level activity tracing |
| CloudTrail | API calls | Management/auditing |
| GuardDuty | All of the above + IOC matching | Automated threat detection |

> 🔍 **Going deeper**: Traffic Mirroring is the cloud version of *port mirroring* or *SPAN (Switched Port Analyzer)*. It's exactly the pattern of mirroring traffic to an IDS (Suricata, Zeek/Bro, Snort) in an on-premises data center. AWS implemented this losslessly at the SDN level, and the mirroring traffic throughput is limited by the instance type of the target ENI. *Selective mirroring* is also possible, so you can mirror only a specific SG/CIDR/port — because mirroring all traffic imposes a heavy cost and performance burden.

> 💡 **Related theory**: *Deep Packet Inspection* (DPI), which looks all the way into the payload, emerged in the late 1990s when ISPs introduced it to identify and block P2P traffic. On the security side, IDS/IPS (intrusion detection/prevention systems) are the main use of DPI. However, since the widespread adoption of TLS 1.3, the payload itself is encrypted and the utility of DPI has declined, and *encrypted traffic analysis* (detecting threats by looking only at headers and flow patterns) is becoming the new standard. GuardDuty's *VPC Flow Logs-based threat detection* is exactly this model.

> 📚 **Case study**: In 2017, a security company published a case of building a cloud IDS with the Suricata + Traffic Mirroring combination. They mirrored ENI traffic to an NLB and placed a cluster of Suricata instances behind the NLB for distributed analysis. This pattern became the standard reference architecture for a *VPC IDS*, and AWS Network Firewall provides a similar model as a managed service.

## Wrapping Up

The SG is stateful · ENI · Allow-only; the NACL is stateless · subnet · Allow+Deny. The two are complements, and the standard is SG-centric. Flow Logs are the basic tool for retrospective auditing, and to see even the payload you use Traffic Mirroring. The next article looks at connections between VPCs — Peering, TGW, Endpoint. Finally, to emphasize: *a firewall never bears security responsibility on its own*. SG/NACL are one layer of the network layer, and IAM (identity), encryption (in-transit/at-rest), auditing (CloudTrail/Config), and intrusion detection (GuardDuty/Inspector) must all work together for true Defense in Depth.

---

## 📝 연습 문제

**문제 1.** An instance called external HTTP on port 80, but no response comes back. The SG allows outbound 80. How should the NACL be configured?

A) Allow outbound 80 only
B) Allow outbound 80 + inbound ephemeral port range
C) Allow inbound 80 only
D) Allow inbound 443

**정답: B**
해설: Because the NACL is stateless, response traffic also needs explicit allow. Outbound 80 + inbound 1024-65535 (ephemeral). With an SG, one outbound line would have done it. This trap is the most frequent NACL pitfall on the SAA.

---

**문제 2.** What is the decisive difference between SG and NACL that comes up often on the exam?

A) SG is stateful, NACL is stateless
B) SG attaches to a subnet, NACL attaches to an ENI
C) NACL is Allow only, SG is Allow + Deny
D) SG is IP only, NACL can reference an SG

**정답: A**
해설: SG = stateful (response auto-allowed), NACL = stateless (response allowed separately). Unit of application: SG = ENI, NACL = subnet. For Allow/Deny, NACL does both, SG does Allow only. SG can use IP/SG/prefix list all as source; NACL is IP only.

---

**문제 3.** You need to block a specific IP range. In SG or NACL?

A) Add a Deny rule in the SG
B) Add a Deny rule in the NACL
C) IAM policy
D) Block at the IGW

**정답: B**
해설: The SG can only Allow; it has no Deny rule. Explicit blocking is the NACL's domain. A broad IP blacklist is the NACL's representative use. For more aggressive blocking you can go to AWS WAF (L7) or AWS Network Firewall, and for global blocking, combine with Shield Advanced.

---

**문제 4.** If you can't see the payload in Flow Logs, what's the alternative?

A) CloudTrail
B) VPC Traffic Mirroring
C) GuardDuty
D) CloudWatch Logs

**정답: B**
해설: Full payload replication is Traffic Mirroring. Used for DPI, IDS, and forensics. CloudTrail is API auditing, so it's unrelated. GuardDuty automatically analyzes Flow Logs/CloudTrail/DNS Logs but doesn't look at the payload.

---

**문제 5.** One ENI has 5 SGs attached, each with different rules. How are they evaluated?

A) First match from top to bottom
B) Evaluated as the union of all rules of all SGs; if any one allows, it passes
C) The first-attached SG takes priority
D) Alphabetical order

**정답: B**
해설: SGs are a union. If 5 SGs have 300 rules total, their union takes effect. That's why simplifying SGs by role is key to operational stability. Union evaluation is an *Allow-accumulating* model, unlike the *Deny-first* model (IAM).

---

**문제 6.** You created a Custom NACL but communication doesn't work. What's the most likely cause?

A) The SGs all deny
B) A Custom NACL defaults to deny-all, so it needs explicit allow
C) The Default NACL takes priority
D) There's no IGW

**정답: B**
해설: The Default NACL allows all, while a Custom NACL defaults to deny-all. When you make a new Custom NACL, you have to add all the explicit Allow rules. This is a *fail-secure* design — a newly created NACL starts from a safe state (deny).

---

**문제 7.** What is NOT captured by VPC Flow Logs?

A) Queries to the AWS DNS server (169.254.169.253)
B) L2 traffic such as ARP
C) Communication with the DHCP server
D) Everything is captured

**정답: B**
해설: Flow Logs capture only L3+ (IP and above). ARP, L2 multicast, and some 169.254.169.254 metadata packets aren't captured. DNS queries are captured separately by Route 53 Resolver Query Logs. DHCP is UDP 67/68 so it does get captured, but since EC2 only generates it at boot, it's rarely seen.

---

**문제 8.** You want to send the full payload of one ENI's traffic to an IDS (Suricata). What is the most appropriate solution?

A) VPC Flow Logs v5
B) VPC Traffic Mirroring to an NLB, with Suricata behind it
C) GuardDuty
D) Network ACL Logging

**정답: B**
해설: Traffic Mirroring replicates ENI traffic to an NLB or another ENI. Placing a cluster of Suricata/Zeek IDS behind an NLB is the standard *VPC IDS* pattern. Flow Logs are metadata only, and GuardDuty is automated threat detection but doesn't look at the payload.
