# Day 5 - Week 2 Synthesis: Drawing the Path a Packet Travels One More Time

A VPC is not a single small box but an ensemble of route tables + gateways + firewalls + endpoints. When a problem of the "what's the most appropriate network design for this scenario?" type shows up on the exam, you have to be able to draw in your head where a packet starts, where it gets blocked, and where it slips out — then the answer becomes visible. Every service we covered over the week — IGW, NAT GW, Bastion/SSM, SG, NACL, Flow Logs, Peering, TGW, Endpoint, VPN, DX — is ultimately just a different facet of how the *flow of packets* is controlled.

Compressing Week 2 into a single sentence: **every VPC networking decision is a combination of two axes — "where do I send this packet (routing)" and "do I let this packet through (firewall)."** Routing decides the *destination*, and the firewall decides *permission*. The gateways (IGW/NAT/VGW/TGW) are the destination candidates on the routing axis, SG and NACL are the policy engines on the firewall axis, and the endpoints (Gateway/Interface) are special routing that "keeps packets headed to an AWS service from leaving for the internet." Classify every component by these two axes, and a week's worth of knowledge lines up on a single grid.

This article lays all the pieces of Week 2 back onto one picture. And it organizes the scenario mapping table + the pitfalls people get wrong + real incident cases one more time so you can use it as a single-sheet review right before the exam. The goal is not rote memorization but restoring *why that design is the answer* from the packet's point of view.

## Comprehensive VPC Topology Diagram

```
                  [ Internet ]
                       ↑
                  [ IGW ]
                       │
  ┌────────────────────┼──────────────────────────┐
  │  VPC 10.0.0.0/16   │                          │
  │                                                │
  │  Public Subnet 10.0.0.0/24 (AZ-a)              │
  │   ├─ Bastion / ALB / NAT GW (EIP)              │
  │   └─ Route: 0.0.0.0/0 → IGW                    │
  │                                                │
  │  Private Subnet 10.0.10.0/24 (AZ-a)            │
  │   ├─ App EC2 / ECS Task                        │
  │   └─ Route: 0.0.0.0/0 → NAT GW                 │
  │                                                │
  │  DB Subnet 10.0.20.0/24 (AZ-a)                 │
  │   ├─ RDS (no public)                           │
  │   └─ Route: local only                         │
  │                                                │
  │  (AZ-b, AZ-c have the same structure)          │
  │                                                │
  │  Gateway Endpoint → S3, DynamoDB               │
  │  Interface Endpoint → SSM, ECR, Secrets...     │
  │                                                │
  └────────────────────┬───────────────────────────┘
                       │
                  [ TGW ] ─── other VPCs, on-premises
```

This topology is the *default backdrop* of SAA scenario problems. Nearly every network scenario is a variation on this picture, asking "which component is missing here" or "what's needed to add this component." Let's put a finger on a single packet and follow the picture. If the RDS in the DB subnet writes a backup to S3, where does that packet have to go once it leaves `local` routing? Going to the IGW means internet exposure, and going to the NAT GW incurs cost. The answer is to slip out through a Gateway Endpoint straight to the AWS backbone — this one line of reasoning is the skeleton of half the scenario problems.

> 💡 **Related theory**: This topology is a synthesis of two classic patterns, *hub-and-spoke* + *3-tier*. The 3-tier (Presentation/Application/Data) came from enterprise architecture in the late 1990s, and hub-and-spoke originated in 1950s airline route design (Delta pioneered it with the Atlanta hub) before crossing over into WAN design in the 1990s. TGW is precisely this hub-and-spoke implemented at the network core. Before AWS announced TGW at re:Invent 2018, people mimicked the same thing with VPC Peering full mesh (O(n²) connections), but this was a *point-to-point mesh* rather than hub-and-spoke, so management exploded geometrically as VPCs grew.

## The Week 2 Grid Seen Through Two Axes

| Component | Routing axis (where to) | Firewall axis (permission) |
|---------|--------------|------------|
| IGW | 0.0.0.0/0 internet entry/exit | None (routing only) |
| NAT GW | 0.0.0.0/0 outbound only | None (SNAT only) |
| SG | None | Per-ENI stateful Allow |
| NACL | None | Per-subnet stateless Allow/Deny |
| Gateway Endpoint | Direct to S3/DDB via prefix list | Endpoint Policy |
| Interface Endpoint | Direct to service via ENI (private IP) | Endpoint Policy + SG |
| Peering | Route to the peer VPC CIDR | None (SG reference possible) |
| TGW | Route to multiple VPCs/on-premises | TGW route table separation |
| VGW/VPN | Route to on-premises CIDR | None (IPsec encryption) |

With this grid in your head, you can immediately separate "is this scenario a routing problem or a firewall problem." "No response comes back" is usually a firewall (stateless NACL) problem, and "the packet doesn't leave at all" is usually a routing (missing route) problem.

## Scenario Keyword → Answer Mapping

| Keyword | Answer |
|--------|------|
| "Private instance calls an external API" | NAT Gateway (per AZ) |
| "Operator accesses an instance safely" | Session Manager |
| "I don't want to open TCP port 22" | Session Manager / EIC Endpoint |
| "Private S3 access + free" | S3 Gateway Endpoint |
| "Private access to SaaS/another AWS service" | Interface Endpoint (PrivateLink) |
| "Directly connect 2 VPCs" | Peering |
| "Many VPCs + on-premises hub" | Transit Gateway |
| "Connect on-premises quickly" | Site-to-Site VPN |
| "On-premises high-volume, low-latency" | Direct Connect |
| "User remotely accesses the VPC" | ClientVPN / Verified Access |
| "Broad block of a specific IP range" | NACL Deny rule |
| "Response traffic passes automatically" | SG (stateful) |
| "Retrospective traffic auditing" | VPC Flow Logs |
| "Inspect down to the packet payload" | Traffic Mirroring |
| "DNS query auditing" | Route 53 Resolver Query Logs |
| "Multi-account VPC sharing" | AWS RAM |
| "IP governance automation" | IPAM |
| "Global multi-region backbone" | Cloud WAN |
| "Block arbitrary-bucket access via S3 endpoint" | Endpoint Policy + aws:PrincipalOrgID |
| "L2 encryption of the circuit" | DX + MACsec |
| "EC2 SSM access without external internet" | SSM/SSMmessages/EC2messages Interface Endpoint |

> 🔍 **Going deeper**: The trap of this mapping table is the *compound scenario where two or more keywords are mixed*. SAA-C03 reduces simple "keyword → service" 1:1 matching and overlaps three or more constraints — like "cost optimization + high availability + regulatory compliance" — to make you choose the *best trade-off*. For example, if it's "connect on-premises with low latency but it must not drop even on a circuit failure," the answer is not DX alone but **DX + Site-to-Site VPN backup**. DX is a physical circuit so recovery is slow on failure, and VPN is internet-based so it fails over immediately. The two keywords ("low latency" + "no downtime on failure") seem to conflict, but the pattern where the *combination* is actually the answer comes up often on the exam.

## SG vs NACL in One Core Line

| | SG | NACL |
|---|---|---|
| Applies to | ENI | Subnet |
| State | Stateful (response automatic) | Stateless (response separate) |
| Rules | Allow only | Allow + Deny |
| Source | IP, SG, prefix list | IP only |
| Evaluation | Union of all rules | First match in number order |

> 💡 **Related theory**: The serial combination of the two firewalls is a direct implementation of the *Defense in Depth* (NIST SP 800-41 Rev.1, "Guidelines on Firewalls and Firewall Policy") principle. The *AND* condition that the same packet must pass through two independent policy engines (subnet NACL → ENI SG) makes the second line of defense work even when a single line of defense is bypassed. The same principle is at the core of the *zero trust* architecture (NIST SP 800-207), and AWS extends it into three axes — IAM (identity layer) + Network (network layer) + Encryption (data layer).

> 🔍 **Going deeper**: The SG's statefulness is implemented through *connection tracking* (conntrack). It's the same concept as the conntrack table in Linux netfilter — it remembers the 5-tuple (src IP/port, dst IP/port, protocol) of a connection that went outbound and then automatically allows its response packets. The NACL, on the other hand, has no such state table — it truly evaluates *each packet independently*. This is the fundamental reason the NACL has to separately open an ephemeral port range. Because the AWS Nitro card handles SG conntrack with hardware acceleration, the SG provides statefulness at nearly zero cost, but there's a ceiling on the number of connections a single ENI can track (roughly hundreds of thousands), and exceeding it rarely causes a *conntrack exhaustion* failure where new connections are rejected.

> ⚠️ **Pitfall**: "If I block outbound in the SG, does the inbound response also get blocked?" is a common misconception. Because the SG is stateful, the *outbound response of a connection that came in via inbound* is automatically allowed regardless of the outbound rules. In other words, even if you close all SG outbound, the response to a request that already came in still goes out. Conversely, an *outbound I initiate myself* (e.g., downloading a patch) needs an outbound rule. This directional distinction comes up often as a trap on the exam.

## Summary of Commonly Missed Pitfalls

1. **The 3 conditions for a Public subnet**: an IGW route + a Public IP + SG allow. If any one is missing, it won't work. The diagnostic order is always the five steps "routing → Public IP → SG → NACL → DNS." Reachability Analyzer automates this.
2. **A NACL has to separately open the ephemeral port range** for the outbound response to come in. Linux is 32768-60999, Windows is 49152-65535, ELB/NLB is 1024-65535, and to be safe allow all of 1024-65535.
3. **A NAT GW is AZ-scoped**. Create one per AZ and have the same-AZ Private subnet use the same-AZ NAT. Cross-AZ cost also drops as a result.
4. **Peering is non-transitive**. As VPCs grow, switch to TGW. For 10 or more VPCs, TGW unconditionally. Even with A↔B and B↔C, A↔C is not possible (you can't transit through B).
5. **If CIDRs overlap, Peering/TGW is impossible**. Company-wide IP governance is needed. Adopting IPAM is recommended.
6. **A Gateway Endpoint is S3 and DynamoDB only**. The rest are Interface. A Gateway Endpoint works only within the same region and is not accessible from beyond on-premises/Peering (because it's route-table-based).
7. **The Default NACL allows all, while a Custom NACL defaults to deny-all**. A fail-secure design.
8. **Defend against exfiltration with an Endpoint Policy**. An IAM policy alone is insufficient. The `aws:PrincipalOrgID` condition is the strongest.
9. **Session Manager needs three endpoints — SSM/SSMmessages/EC2messages** (in a fully isolated environment). Miss one and it won't work.
10. **The VPC `local` route always takes priority**. Above even LPM. Isolation within the same VPC is only via SG/NACL.
11. **Cross-AZ data transfer is charged per GB in both directions**. It's the hidden cost of Multi-AZ HA, covered in detail in Week 10.
12. **The NAT GW's connection idle timeout is fixed at 350 seconds**. Longer connections need a keepalive. It often becomes a problem together with RDS/DB connection pools.

> ⚠️ **Pitfall**: Pitfall #4 (non-transitive) comes up most often on the exam. The answer to "VPC A is peered with B, and B is peered with C. For A to communicate with C?" is "add direct A↔C Peering" or "switch to TGW," not "add a route to B's route table." Because Peering structurally blocks *transit* routing, you can't use B like a router. This is not a bug but an intentional security design that fundamentally blocks one VPC from becoming a man-in-the-middle between two other VPCs. If you deliberately want to break this isolation, there's a workaround of placing a NAT/proxy instance in B, but operations are complex, so TGW is the answer.

## SDN and Determinism: The One Principle Running Through Week 2

One fact shared by every component this week: the VPC runs on top of **SDN (Software-Defined Networking)**. It's not physical routers and switches that see the packet; rather, each host's Nitro card queries the *Mapping Service* to receive "which physical host this virtual IP is on," encapsulates it (usually with a private protocol), and sends it off. Thanks to this structure, "configuration" like route tables, SG, and NACL propagates instantly to all hosts, and you can freely draw a logical network independent of the physical topology.

> 💡 **Related theory**: AWS revealed part of this design in the 2017 SIGCOMM paper *"A Retrospective on the Lessons Learned from the AWS Virtual Private Cloud."* The core is the separation of the control plane (routing decisions) and the data plane (packet forwarding), and the distributed caching of the Mapping Service. The same SDN school of thought was academically established in the 2008 Stanford OpenFlow paper (McKeown et al.), and Google's B4 (2013, SIGCOMM) was the first large-scale case of applying SDN to inter-data-center WAN. VPC, GCP VPC, and Azure VNet are all commercial implementations of this SDN paradigm.

> 📚 **Case study**: The representative incident that showed the double edge of SDN determinism is the **6-hour global Meta (Facebook) outage in October 2021**. During BGP routing configuration change work, the entire backbone *withdrew* itself from the internet, and as a result even the DNS servers became unreachable, paralyzing internal authentication, tools, and even data center access cards. The strength of centralized determinism — "change one line and it's instantly reflected everywhere" — is immediately the weakness "change one line wrong and everything instantly collapses." The AWS VPC carries the same structural risk, so routing changes are always protected with a *change window* + Reachability Analyzer pre-verification.

## Real Incident Cases One More Time

- **February 2017 us-east-1 S3 outage**: a typo in a debugging command shut down more servers than intended, taking S3 down for 4 hours. An incident where a single-region dependency shook half the internet. The AWS Status Page itself depended on S3 — a self-referential incident. A decisive impetus for *multi-region + region-independent design*.
- **2019 Capital One**: SSRF + IMDSv1 + excessive IAM permissions. Bypassing the WAF, temporary credentials were stolen from the metadata endpoint (169.254.169.254), leaking 100 million S3 records. The combination of IMDSv2 (token-based) + Endpoint Policy + Permission Boundary became the post-incident standard.
- **2020 Single-AZ NAT down**: the decisive impetus for the per-AZ NAT pattern. The ALB was alive, but the backend couldn't reach Stripe/Twilio, so payments failed for 30 minutes.
- **April 2021 Travis CI**: long-lived tokens exposed in build logs → the impetus for standardizing on GitHub OIDC federation (short-lived tokens).
- **2018 M&A CIDR collision**: both VPCs were `10.0.0.0/16` → the impetus for adopting IPAM. A 6-month migration.
- **2019 Tokyo (ap-northeast-1) AZ cooling failure**: single-AZ overheating took down many EC2/EBS. The lesson that a Multi-AZ ASG is your insurance.
- **October 2021 Meta 6-hour global outage**: a BGP withdrawal took down even its own authentication/DNS. The double edge of SDN determinism.
- **September 2022 Uber breach**: a contractor employee MFA fatigue attack → access to internal systems and the secrets manager. Accelerated adoption of Zero Trust + least privilege.
- **June 2021 Fastly CDN outage**: one customer's configuration change triggered a latent bug for a 1-hour global outage. Once again showing that the determinism of configuration is a double edge.

> 📚 **Case study**: The 2019 **Capital One** incident is the one most directly tied to the exam. The attack path cuts precisely through Week 2's components — (1) bypassing the WAF (absence of an SSRF filter) to (2) get from the EC2 metadata (IMDSv1) (3) excessive IAM Role credentials and (4) exfiltrate to S3. The post-incident defenses overlap exactly with this week's pitfall summary: enforce IMDSv2, block out-of-org bucket access with an S3 **Endpoint Policy + `aws:PrincipalOrgID`**, and cap permissions with a Permission Boundary. In an SAA scenario, when "preventing data exfiltration" is the keyword, you have to bundle in *network-layer blocking (Endpoint Policy)*, not just an IAM policy, to get the right answer.

## Cost vs Availability Trade-off Table

| Component | Cost-saving pattern | Availability-strengthening pattern |
|---------|------------|------------|
| NAT GW | One in a single AZ | One per AZ, per-AZ routing |
| S3 access | Gateway Endpoint (free) | Or Interface Endpoint (DR/cross-region) |
| On-premises | VPN | DX + VPN backup |
| Bastion | 1 EC2 | Session Manager (no infrastructure at all) |
| Logging | Flow Logs to S3 (cheap) | Flow Logs to CloudWatch (real-time alarms) |
| Multiple VPCs | Peering (low cost, small scale) | TGW (scaling/standardization) |

> ⚠️ **Pitfall**: When you see the word "cost optimization" in a scenario, it's easy to pick single-AZ NAT, Gateway Endpoint, or VPN as the answer unconditionally, but when it conflicts with words like "high availability," "SLA 99.99%," or "mission critical," availability takes priority. You have to read the scenario to the end and judge the *priority* precisely. SAA-C03's grading philosophy is to prioritize *the pillar the problem emphasizes* among the 6 pillars of the W-AF (Well-Architected Framework) — Operational Excellence, Security, Reliability, Performance, Cost, Sustainability. "A startup sensitive to cost" signals Cost, and "financial regulation" signals Security/Reliability as the priority.

## Diagnostic Order on One Sheet: The 5 Steps of Packet Tracing

Both practical troubleshooting and exam diagnosis follow the same order. Trace "where the packet stopped" from top to bottom.

```
1. Route table      — is there a route to the destination? (if not, blackhole)
2. Public IP / NAT   — does the outbound address translation happen?
3. NACL             — subnet stateless rules (in/out + ephemeral)
4. SG               — ENI stateful rules
5. OS firewall/app  — iptables, app listen port, DNS resolution
```

> 🔍 **Going deeper**: What automates these 5 steps is **VPC Reachability Analyzer** (released in 2020). Specify the source ENI and the destination, and it statically analyzes only the configuration — *without sending an actual packet* — and shows you as a path "at which component it's blocked." Internally it models routing, SG, NACL, peering, and endpoints as a graph and proves reachability with *formal verification*. This formal verification engine is based on the Zelkova/Tiros family of tools built by AWS's *Provable Security* team, and it mathematically decides "can a packet pass under this policy combination?" with an SMT solver (satisfiability modulo theories). Network Access Analyzer goes further and detects "unintended internet exposure paths" across the entire organization.

## Next Week Preview

Week 3 is compute (EC2, ASG, ELB). It's the process of putting workloads on top of the network. On top of this week's routing, gateways, and firewalls, we lay *the instances that actually run code* and *the mechanisms that auto-scale and recover those instances*. We'll see how an ASG's health check failure leads to Multi-AZ automatic recovery, how an ELB's *cross-zone load balancing* creates the cross-AZ cost vs availability trade-off, and how the *AWS Nitro Hypervisor* delivers nearly native virtualization performance. This week's "path a packet travels" continues next week into "how a workload survives on that path."

---

## 📝 종합 연습 문제 (시나리오 12문항)

**문제 1.** A fintech needs its ECS tasks in a Private subnet to call an outbound API. To design so that outbound is maintained even during a full-AZ failure?

A) A single NAT GW with all Private subnets routing to it — the cheapest, but if the AZ where the NAT sits dies, the outbound of all subnets is cut simultaneously, directly violating the requirement of full-AZ failure tolerance

B) A NAT GW per AZ + same-AZ Private subnets routing to the same-AZ NAT

C) A NAT Instance with an ASG — you can auto-recover an EC2-based NAT with an ASG, but a single-instance replacement takes several minutes and the throughput limits and management burden fall short of a managed NAT GW's availability

D) Attach an IGW to the Private subnet — a Private instance has no Public IP, so even with an IGW attached it can't receive responses, so outbound itself doesn't hold up

**정답: B**
해설: The NAT GW is AZ-scoped. Place one per AZ and have the same-AZ Private use the same-AZ NAT, and even if one AZ dies the others survive. Cost is roughly double, but RTO becomes 0. Single-AZ savings all collapse with a single incident (the 2020 Single-AZ NAT incident is exactly this case). The reason D is wrong is that even with an IGW attached, a Private instance has no Public IP so it can't receive responses — the IGW is bidirectional only for instances that have a Public IP.

---

**문제 2.** An operator needs to SSH into a Production EC2. What is the most secure method?

A) Public IP + SSH key — exposes the instance directly to the internet and opens port 22, maximizing the scanning/brute-force attack surface, so the most dangerous

B) Bastion + SSH key — reduces exposure by one step with a jump host, but port 22 and SSH key management still remain, and the Bastion itself becomes a single point of failure and a breach target

C) Session Manager

D) ClientVPN + SSH key — even narrowing the network boundary with a VPN, port 22 and SSH-key-based access remain as-is, falling short of complete zero-port Zero Trust access

**정답: C**
해설: Port 22 itself is closed, IAM controls access, and every session is automatically saved to CloudWatch Logs/S3. The Zero Trust model (NIST SP 800-207). With 0 inbound ports, the attack surface structurally disappears. B (Bastion) is also a common answer, but port 22 and key management burden still remain, and the Bastion itself becomes a single point of failure and breach target. In a fully isolated environment, additionally place the three SSM/SSMmessages/EC2messages Interface Endpoints.

---

**문제 3.** Several TB flow to S3 daily from a Private subnet, and NAT GW cost is exploding. What is the most appropriate action?

A) Add a NAT GW

B) Add an S3 Gateway Endpoint (free)

C) Direct Connect

D) Route directly to the IGW

**정답: B**
해설: A Gateway Endpoint is free, and since data flows over the AWS internal network it also saves the NAT data transfer cost. Limited to S3/DynamoDB. Because NAT data processing is charged at about $0.045/GB, dozens of TB per month means thousands of dollars incurred just from S3 traffic passing through the NAT. Switching to a Gateway Endpoint ends with adding one prefix list line to the route table, so the cost-effectiveness is overwhelming. C (DX) is for on-premises connections, so it's unrelated.

---

**문제 4.** A company wants to connect all VPCs across 50 AWS accounts. What is the most appropriate solution?

A) Full-mesh Peering (1225)

B) AWS RAM + Transit Gateway sharing

C) 50 NAT Gateways

D) 50 Direct Connects

**정답: B**
해설: Create a TGW in one account (usually a Networking account) and share it to other accounts with RAM. All accounts attach to the same TGW. A full mesh of 50 VPCs becomes 50×49/2 = 1225 Peerings, which is unmanageable, and non-transitive so routing doesn't work either. TGW needs only as many connections as attachments (O(n)) in a hub-and-spoke. A larger organization (multi-region) considers Cloud WAN.

---

**문제 5.** You created a Custom NACL and allowed inbound 80, but the external response doesn't come back. The cause?

A) The SG denies

B) The NACL is stateless so the outbound ephemeral port range isn't allowed

C) There's no IGW

D) No Public IP assigned

**정답: B**
해설: The NACL is stateless. The request came in on 80, but the response has to go *outbound* with the client's ephemeral port (1024-65535) as the destination. Because the NACL doesn't remember connection state, you have to explicitly specify this outbound rule. With an SG, conntrack would auto-allow the response. This is the single most decisive reason the NACL's operational burden is heavy, which is why in practice the NACL is used only for broad Deny (blocked IP ranges) and fine-grained control is left to the SG.

---

**문제 6.** After two companies merge, both VPCs are 10.0.0.0/16. What is the most realistic approach?

A) Just peer them

B) Migrate one VPC to a new CIDR

C) Just add a TGW

D) Resolve the IP conflict with a NAT GW

**정답: B**
해설: Overlapping CIDRs can't be routed by either Peering or TGW — the packet's destination IP exists on both sides simultaneously, so the router can't decide where to send it. There's no fundamental solution other than migrating one side. Afterward, adopt company-wide IP governance with IPAM. As a temporary workaround there's a pattern of exposing only some services one-directionally with PrivateLink, but the essential solution is migration. In an actual 2018 M&A incident, it took 6 months.

---

**문제 7.** One EC2 has 5 SGs attached. SG A allows 22, and SG B has a 22-deny rule (impossible, but suppose). How is it evaluated?

A) Deny wins

B) First match

C) SGs can't have Deny rules at all; it's the union of all Allow rules

D) Alphabetical order

**정답: C**
해설: SGs are Allow only. A Deny rule can't be created syntactically. It's evaluated as the union of the rules of all SGs attached to the ENI. Explicit denial is handled by the NACL (Deny rule). This *Allow-accumulating* model is the decisive difference from the *explicit Deny-first* model (IAM, NACL). That's why "block only a specific IP" is impossible with an SG and must be done with a NACL Deny or WAF.

---

**문제 8.** To get private access to the external SaaS Snowflake without going through the internet?

A) VPC Peering

B) Use the PrivateLink Interface Endpoint that Snowflake published

C) Direct Connect

D) NAT GW

**정답: B**
해설: PrivateLink with a SaaS means the external ISV publishes an endpoint service (NLB-based) and an Interface Endpoint (ENI + private IP) is created in the consumer VPC. Traffic goes over only the AWS backbone without touching the internet or IGW at all. Major SaaS — Snowflake, Databricks, MongoDB Atlas, Datadog — support it. A (Peering) requires knowing the peer VPC CIDR and is unsuitable because the SaaS is multi-tenant. This pattern is the industry standard for "communicating with a SaaS without going through the internet inside AWS."

---

**문제 9.** You want to see even the SQL injection payload with Flow Logs. What is the most appropriate solution?

A) Upgrade to Flow Logs version 5

B) VPC Traffic Mirroring + IDS

C) CloudTrail

D) GuardDuty

**정답: B**
해설: Flow Logs record only 5-tuple header metadata (src/dst/port/protocol/action/bytes) and *never carry the payload*. To see an L7 payload like SQL injection, replicate the full ENI traffic with Traffic Mirroring and do deep packet inspection with an IDS like Suricata/Zeek. This is the standard *VPC IDS* pattern. A more managed option is AWS Network Firewall (with built-in Suricata rules). C (CloudTrail) is API-call auditing so it's unrelated, and D (GuardDuty) is threat detection but doesn't capture the payload.

---

**문제 10.** Is there a cost for data transfer between two AZs in the same region?

A) Free

B) Charged per GB in both directions

C) Charged in only one direction

D) Charged only when using Peering

**정답: B**
해설: Cross-AZ data transfer is charged per GB in both directions ($0.01/GB in each direction). It's a core pitfall of cost optimization and the hidden cost of Multi-AZ HA. EFS, RDS Multi-AZ synchronous replication, ALB cross-zone load balancing, and inter-broker Kafka replication are all affected. The essence is the trade-off that *bundling all workloads in a single AZ makes cross-AZ cost 0 but availability 0 too*. Covered in detail in Week 10 cost optimization.

---

**문제 11.** For an EC2 in a fully isolated Private subnet (no internet) to access Systems Manager?

A) Add an IGW

B) Add a NAT Gateway

C) Create three Interface Endpoints: ssm, ssmmessages, ec2messages

D) Add a Bastion

**정답: C**
해설: Session Manager's core dependency. The SSM Agent has to reach three endpoints over outbound HTTPS (443) — `ssm` (API), `ssmmessages` (session data channel), `ec2messages` (command polling). In an environment without internet, expose these endpoints on VPC-internal private IPs with three PrivateLink Interface Endpoints. Miss even one and the session won't attach. A standard pattern that comes up often in government/finance/PCI scenarios. B (NAT) works, but it violates the "no internet transit" constraint.

---

**문제 12.** A multinational company needs to consistently manage a global network spanning 30 regions and 100 AWS accounts as *policy as code*. What is the most appropriate solution?

A) Full-mesh VPC Peering

B) A TGW per region + manual TGW Peering

C) AWS Cloud WAN

D) 100 Direct Connects

**정답: C**
해설: Cloud WAN (GA in 2021) is TGW's global backbone extension. It manages segments (prod/dev isolation), attachments, route propagation, and inter-region connections all at once *centrally, as code* with a JSON policy document. At the scale of dozens of regions and hundreds of accounts, B (per-region TGW + manual TGW Peering) requires binding connections and route propagation by hand one by one, and operations explode. Cloud WAN abstracts this into a single *core network* policy. Exam appearance frequency is still low, but it's trending up since 2024.
