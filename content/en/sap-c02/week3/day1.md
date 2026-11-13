# Day 1 - VPC Peering vs Transit Gateway: Network Topology Selection

When designing a cloud network, the first question you encounter is simple: "How do I connect two VPCs?" Initially, VPC Peering appears to be a clear solution. A few clicks in the console and two VPCs are communicating. But the moment VPCs grow from two to five, ten, or fifty, that initial clarity transforms into exponential complexity. To fundamentally solve this complexity, AWS launched Transit Gateway in 2018. Today, we'll delve deep into the architectural differences between the two services from a network theory perspective and master the routing isolation patterns that the SAP-C02 exam frequently tests.

## Design Philosophy and Technical Limitations of VPC Peering

VPC Peering is a technology that creates a **logically direct link** between two VPCs. Internally, AWS routes traffic destined for one VPC's CIDR block from the other VPC's router directly through the AWS backbone network. Since there's no separate gateway or proxy, latency is very low and bandwidth is equivalent to VPC internal communication.

> 💡 **Related Theory**: In network topology theory, a **Full Mesh** structure that directly connects all N nodes requires N(N-1)/2 links. With 10 VPCs you need 45 Peering connections, with 50 VPCs you need 1,225, and with 100 VPCs you need 4,950. Since the number of links grows as O(N²), the operational complexity becomes realistically unmanageable. This is why the Internet adopted BGP-based hierarchical routing instead of full mesh.

The most critical limitation of VPC Peering is the lack of support for **transitive routing**. Even if VPC A is Peering-connected to VPC B and VPC B is Peering-connected to VPC C, A cannot directly communicate with C. Traffic from A to C is not forwarded by B even if it passes through it. This isn't a design flaw but an intentional security decision. Each Peering connection must be an isolated link between two explicitly authorized VPCs.

```
[VPC A] ──── Peering ────> [VPC B] ──── Peering ────> [VPC C]
    Direct communication from A to C not possible (B refuses forwarding)

[VPC A] ──────────────── Direct Peering required ────────────────> [VPC C]
```

> 💡 **Related Theory**: The prohibition of transitive routing stems from the network security **Principle of Least Path**. If a router forwards packets along paths it doesn't explicitly know, unintended traffic flows occur. AWS prevents this by restricting route propagation of Peering connections only to the two participating VPCs. This is similar to RFC 4271 (BGP-4), which by default restricts propagation of paths received from eBGP peers to other eBGP peers.

An additional constraint is that if the CIDR blocks of two Peering VPCs overlap, the connection itself is impossible. In large organizations, subnet conflicts occur when growth happens without CIDR planning, and at that moment Peering disappears as an option.

> 📚 **Case Study**: A global media company (based on published postmortem) operated AWS accounts independently by department and assigned duplicate 10.0.0.0/8 address space. Initially there were no issues because each department operated independently, but when building a central data analytics platform, they needed to collect data from all accounts in a central account. With CIDR conflicts making Peering impossible, they used NAT layers as an emergency workaround to translate IPs. This experience became the direct catalyst for subsequent Transit Gateway adoption and IPAM standardization.

## Transit Gateway: Hub-and-Spoke Implementation

AWS Transit Gateway (TGW) was announced at AWS re:Invent in November 2018. At the announcement, AWS Chief Evangelist Jeff Barr explained it as a service to solve the reality that "customers can't keep their network architecture simple because of the mesh complexity of VPC Peering." TGW is AWS's managed service implementation of the **Hub-and-Spoke** topology.

```
                    ┌──────────────────────────┐
                    │      Transit Gateway      │
                    │    (Regional Hub)         │
                    │  [Route Table 1: Workload] │
                    │  [Route Table 2: Shared]   │
                    └─────┬────────┬────────┬───┘
                          │        │        │
              ┌───────────┘   ┌────┘   ┌───┘
              ▼               ▼        ▼
        ┌─────────┐   ┌──────────┐  ┌──────────────┐
        │ VPC-Dev │   │ VPC-Prod │  │ VPC-Shared   │
        │10.1.0/16│   │10.2.0/16 │  │10.99.0/16    │
        │         │   │          │  │(DNS, AD, NTP) │
        └─────────┘   └──────────┘  └──────────────┘
                          │
                    ┌─────┴──────┐
                    │ On-Premises │
                    │ (DX / VPN)  │
                    └────────────┘
```

The core components of TGW are **Attachments** and **Route Tables**. VPCs, VPN connections, Direct Connect Gateways, TGW Peering from other regions, and TGW Connect (SD-WAN) all connect to TGW as Attachments. Each Attachment is associated with one or more Route Tables and learns routes from other Attachments (Propagation) or receives static routes (Association).

> 💡 **Related Theory**: TGW internally supports **ECMP (Equal-Cost Multi-Path)** routing. When multiple VPN or DX paths exist to the same destination, traffic is distributed to scale bandwidth linearly. RFC 2992 defines the basic principles of ECMP implementation. AWS's TGW ECMP can achieve aggregate VPN bandwidth of up to 50Gbps (1.25Gbps per VPN tunnel × 40 tunnels) over TGW.

> 🔍 **Deep Dive**: TGW's internal data plane is based on AWS's **Nitro networking stack**. There are TGW instances distributed within each Availability Zone, and VPC Attachments are connected by creating ENIs (Elastic Network Interfaces) in each AZ subnet. This distributed architecture ensures traffic continues through other AZs even if a single AZ fails. Since TGW itself is fully managed by AWS, users don't need to separately configure AZ redundancy.

## TGW Route Table Isolation Patterns (Exam Core)

The reason TGW Route Table design appears repeatedly in SAP-C02 exams is that this feature is the core mechanism that satisfies large enterprise networks' logical separation requirements. There are two basic concepts: **Association** (which Route Table's routing decisions to follow) and **Propagation** (which Route Table to advertise its CIDR to).

### Pattern 1: Shared Service Isolation (Most Frequent in Exams)

Development and Production VPCs should not communicate with each other, but both environments need access to shared DNS servers, Active Directory, and patch servers in a Shared VPC.

```
[TGW Route Table Configuration]

RT-Workload (Dev, Prod are associated):
  └── 10.99.0.0/16 → Shared Attachment (learned via static or Propagation)
  ※ Dev CIDR, Prod CIDR are not propagated to this RT → Dev↔Prod communication blocked

RT-Shared (Shared VPC is associated):
  ├── 10.1.0.0/16 → Dev Attachment (Propagation)
  └── 10.2.0.0/16 → Prod Attachment (Propagation)
  ※ Shared knows and can communicate with both Dev and Prod
```

When a packet from Dev is sent to Prod, the packet arrives at TGW and queries RT-Workload. Since RT-Workload doesn't have Prod's CIDR (10.2.0.0/16), it's treated as blackhole. This is the essence of isolation.

> 🎯 **Scenario**: A global financial company operates five OUs (Development, Staging, Production, Shared Services, Security) through AWS Organizations. With repeated incidents of development teams accidentally accessing Prod, complete isolation at the network level is required. Simultaneously, all environments need access to Shared's AD and DNS, and Security's log collector. The TGW Route Table pattern can satisfy this requirement with three Route Tables: RT-Workload, RT-Shared, and RT-Security. Adding SCP for IAM-level isolation completes Defense in Depth.

### Pattern 2: Centralized Internet Egress

NAT Gateways are created per AZ and incur costs. If 50 VPCs each have NAT Gateways, with 2 AZs you accumulate costs for 100 NAT Gateways. With TGW, you can centralize all outbound Internet traffic from all VPCs through a single Egress VPC with NAT Gateways.

```
[Default route for all spoke VPCs]
0.0.0.0/0 → TGW

[TGW RT-Workload]
0.0.0.0/0 → Egress VPC Attachment

[Egress VPC]
NAT Gateway → Internet Gateway → Internet
```

> ⚠️ **Pitfall**: When implementing the centralized Egress pattern, hairpinning issues can occur. When traffic from a spoke VPC reaches the Egress VPC through TGW, return traffic must correctly route back to the original VPC through TGW from the Egress VPC's routing table. For this to work, you must explicitly add TGW routes for each spoke VPC's CIDR in the Egress VPC's private subnet route table. Omitting this route causes asymmetric routing and connection failure.

### Pattern 3: Explicit Blocking Using Blackhole Routes

Adding a Blackhole route to a specific CIDR in the TGW Route Table explicitly drops traffic destined for that range. This is useful for granular control to block specific traffic even when routes are learned via Propagation.

```bash
aws ec2 create-transit-gateway-route \
  --transit-gateway-route-table-id tgw-rtb-xxx \
  --destination-cidr-block 10.2.0.0/16 \
  --blackhole
```

> 💡 **Related Theory**: In networks, Null Routes or Blackhole routes are techniques to immediately drop unnecessary packets without CPU processing. They're also used in DDoS attack mitigation. RFC 3882 standardizes BGP-based Blackhole Routing (RTBH, Remotely-Triggered Black Hole). TGW's Blackhole route applies this concept to VPC networking.

## TGW Internal Operation: A Packet's Journey

Understanding how TGW actually processes packets helps you find the root cause much faster when debugging routing problems.

Assume an EC2 instance in VPC-Dev (10.1.0.0/16) sends a packet to a DNS server in VPC-Shared (10.99.0.0/16).

1. EC2's VPC Route Table: Must have an entry 10.99.0.0/16 → tgw-xxx. Without it, it's treated as local routing and fails.
2. The packet reaches TGW. TGW checks the source Attachment of the packet (Dev VPC Attachment).
3. Queries the Route Table (RT-Workload) that the Dev VPC Attachment is associated with.
4. If RT-Workload has a route 10.99.0.0/16 → Shared Attachment, it forwards to the Shared Attachment.
5. In the Shared VPC's subnet route table, destination 10.99.x.x is processed locally.
6. Return Packet: When the Shared DNS server responds, the Shared VPC route table must have 10.1.0.0/16 → tgw-xxx.
7. The return packet reaches TGW and queries RT-Shared to which the Shared VPC Attachment is associated.
8. If RT-Shared has a route 10.1.0.0/16 → Dev Attachment, it forwards to the Dev VPC.

> 🔍 **Deep Dive**: TGW's routing decisions are **Association-based**. That is, the Route Table associated with the Attachment on which the packet arrived has routing decision authority. In contrast, Propagation is advertising its CIDR to other Route Tables. Failing to understand this asymmetry makes debugging impossible as routing configurations become complex. You can track packet paths by combining VPC Flow Logs and TGW Flow Logs.

## TGW Inter-Region Peering and Cloud WAN

When architecture starting from a single region expands globally, inter-region connectivity becomes necessary. TGW Inter-Region Peering connects two TGWs across regions through AWS's global backbone network.

There's an important caveat. TGW Inter-Region Peering is also **not transitive**. Even if the us-east-1 TGW is Peered with the eu-west-1 TGW and eu-west-1 is Peered with ap-northeast-1, us-east-1 doesn't directly route to ap-northeast-1. For all three regions to communicate completely, you must separately configure us-east-1 ↔ ap-northeast-1 peering.

| Item | TGW | TGW Inter-Region Peering | AWS Cloud WAN |
|------|-----|--------------------------|---------------|
| Scope | Single Region | Between Two Regions | Global Multi-Region |
| Management | Direct Route Table Configuration | Static Routes in Both TGW RTs | Policy Document (JSON) |
| Transitive Routing | Supported (within region) | Not Supported | Supported (Core Network Policy) |
| SD-WAN Integration | TGW Connect (GRE) | - | Native Support |
| Operational Complexity | Medium | High | Low (Policy-Based) |
| Cost | Per-Region Processing | Additional Data Transfer | Core Network Edge |

> 💡 **Related Theory**: Cloud WAN's design reflects the **Software-Defined WAN (SD-WAN)** philosophy of centralized control planes. SD-WAN separates the data plane (actual packet transmission) from the control plane (routing decisions) and distributes policies from a center. Cloud WAN's "Global Network Policy" is the control plane, and each region's Core Network Edge is the data plane. This is fundamentally different from BGP-based distributed routing (TGW).

> 📚 **Case Study**: Netflix operates TGWs in multiple regions including us-east-1, eu-west-1, ap-northeast-1 for global streaming infrastructure and connects them with Inter-Region Peering. However, as peering configuration complexity increased (managing static routes for each TGW pair), they considered Cloud WAN adoption. Cloud WAN's policy-based management significantly reduced routing configuration errors, as mentioned in feedback presented at AWS re:Invent 2023.

## Comparison with Other Clouds

| Item | AWS TGW | GCP Cloud Router + VPC Network Peering | Azure Virtual WAN |
|------|---------|----------------------------------------|-------------------|
| Hub Service | Transit Gateway | VPC Network Peering (Mesh) + Cloud Interconnect | Virtual WAN Hub |
| Transitive Routing | Supported (within TGW) | Not Supported (between Peerings) | Supported |
| SD-WAN Integration | TGW Connect | Partner Solutions | Native SD-WAN Partners |
| Routing Protocol | BGP (VPN/DX) | BGP (Cloud Interconnect) | BGP |
| Multi-Region | TGW Peering or Cloud WAN | Per-Region VPC + Interconnect | Global Virtual WAN |
| Max Connections | 5,000 VPCs/TGW | 25 Peerings/VPC | Limited |

> 🔍 **Deep Dive**: GCP's VPC is a global single VPC concept, so AWS's inter-region Peering problem doesn't exist. GCP VPC subnets are region-specific but VPC is global, so Tokyo and New York subnets in the same VPC automatically communicate. AWS VPCs are region-scoped, requiring separate mechanisms for inter-region connectivity. This architectural difference creates the disparity in multi-region networking complexity between the two platforms.

## TGW Multi-Account Sharing via RAM

Large enterprises operate dozens to hundreds of accounts through AWS Organizations. Creating separate TGWs in each account explodes management points. AWS Resource Access Manager (RAM) allows you to share TGW with other accounts in your Organizations, enabling centralized TGW management from a single network account.

```bash
# Share TGW via RAM from network account
aws ram create-resource-share \
  --name "TGW-Share-Org" \
  --resource-arns "arn:aws:ec2:us-east-1:NETWORK_ACCT:transit-gateway/tgw-xxx" \
  --principals "arn:aws:organizations::ROOT_ACCT:organization/o-xxx" \
  --allow-external-principals false

# Create VPC Attachment to shared TGW from workload account
aws ec2 create-transit-gateway-vpc-attachment \
  --transit-gateway-id tgw-xxx \  # TGW owned by network account
  --vpc-id vpc-yyy \
  --subnet-ids subnet-aaa subnet-bbb
```

> 🎯 **Scenario**: A large e-commerce company operates a master account, network account, security account, and 80 workload accounts per business unit through AWS Organizations. The network team creates a single TGW in the network account and shares it organization-wide via RAM. VPCs from workload accounts attach to this TGW. Routing control is managed centrally by the network team. When a new business unit creates an account, they simply attach to the existing TGW, standardizing network onboarding.

## TGW Connect: SD-WAN Integration

Enterprises running Cisco SD-WAN, VMware SD-WAN (VeloCloud), or Aviatrix on premises and expanding to AWS use TGW Connect. TGW Connect runs BGP over GRE (Generic Routing Encapsulation) tunnels to exchange dynamic routing with SD-WAN appliances.

```
[On-Premises SD-WAN] ──── GRE Tunnel ────> [TGW Connect Attachment]
                         BGP Session                │
                                              [TGW Route Table]
                                                    │
                                            [Spoke VPCs]
```

> 💡 **Related Theory**: GRE (RFC 2784) is a tunneling technique that encapsulates arbitrary protocol packets in another protocol. In TGW Connect, GRE forms a tunnel between BGP peers. BGP (RFC 4271) is a route exchange protocol between Autonomous Systems. In TGW Connect, a BGP session is established between the SD-WAN appliance and TGW to dynamically learn routes.

## TGW Multicast: Specialized for Finance and Media

Some financial trading systems and media streaming require **multicast** to simultaneously transmit identical data from a single source to multiple recipients. TGW supports multicast domains, enabling these workloads to migrate to AWS.

> 🔍 **Deep Dive**: Internet multicast is based on IGMP (Internet Group Management Protocol) and PIM (Protocol Independent Multicast). AWS TGW multicast supports IGMP v2/v3 and TGW manages multicast group membership. Financial market data feeds must deliver identical data to thousands of recipients in real-time. With unicast, bandwidth grows linearly, but with multicast, source bandwidth remains constant.

## Practical CLI: Implementing TGW Isolation Patterns

```bash
# Create TGW (disable auto-creation of default RT — manual control)
aws ec2 create-transit-gateway \
  --description "Enterprise Hub" \
  --options "AmazonSideAsn=64512,\
             AutoAcceptSharedAttachments=disable,\
             DefaultRouteTableAssociation=disable,\
             DefaultRouteTablePropagation=disable,\
             MulticastSupport=enable"

# Create 2 Route Tables
aws ec2 create-transit-gateway-route-table \
  --transit-gateway-id tgw-xxx \
  --tag-specifications 'ResourceType=transit-gateway-route-table,Tags=[{Key=Name,Value=RT-Workload}]'

aws ec2 create-transit-gateway-route-table \
  --transit-gateway-id tgw-xxx \
  --tag-specifications 'ResourceType=transit-gateway-route-table,Tags=[{Key=Name,Value=RT-Shared}]'

# Dev VPC Attachment → Associate with RT-Workload
aws ec2 associate-transit-gateway-route-table \
  --transit-gateway-attachment-id tgw-attach-dev \
  --transit-gateway-route-table-id tgw-rtb-workload

# Shared VPC advertises CIDR to RT-Workload (Propagation)
aws ec2 enable-transit-gateway-route-table-propagation \
  --transit-gateway-attachment-id tgw-attach-shared \
  --transit-gateway-route-table-id tgw-rtb-workload

# Shared VPC Attachment → Associate with RT-Shared
aws ec2 associate-transit-gateway-route-table \
  --transit-gateway-attachment-id tgw-attach-shared \
  --transit-gateway-route-table-id tgw-rtb-shared

# Dev, Prod advertise CIDR to RT-Shared
aws ec2 enable-transit-gateway-route-table-propagation \
  --transit-gateway-attachment-id tgw-attach-dev \
  --transit-gateway-route-table-id tgw-rtb-shared

aws ec2 enable-transit-gateway-route-table-propagation \
  --transit-gateway-attachment-id tgw-attach-prod \
  --transit-gateway-route-table-id tgw-rtb-shared
```

In SAP-C02 exams, TGW-related questions typically ask "Which Route Table design satisfies this isolation requirement?" The key is that Association holds routing decision authority and Propagation controls route advertisement. Dev↔Prod isolation is achieved by preventing both Attachments' CIDRs from Propagating to RT-Workload.

> ⚠️ **Pitfall**: When creating TGW, DefaultRouteTableAssociation=enable and DefaultRouteTablePropagation=enable are defaults. Creating with these settings means all new Attachments automatically associate with the default RT and propagate their CIDR to it. To implement isolation patterns, you must set both options to disable and manage RTs manually. If changing on an existing TGW, Attachments already associated with the default RT remain there, requiring careful attention.

## Conclusion

VPC Peering remains a valid choice when directly connecting two VPCs without overlapping CIDRs. Latency is lowest and there's no additional cost. However, when you have three or more VPCs with isolation requirements or need a hybrid topology including VPN/Direct Connect, TGW is the right choice. For global multi-region networks, Cloud WAN significantly reduces operational complexity. Clearly understanding the trade-offs of these three options is the starting point for the SAP-C02 network domain.

---

## 📝 Practice Questions

**Question 1.** A global manufacturer operates 80 accounts with AWS Organizations. The VPCs in all accounts must be able to reach a central security VPC (IDS/IPS, log collection) and a shared services VPC (DNS, AD), but direct communication between development and production accounts must be blocked. What approach meets these requirements while minimizing operational burden?

A) Configure VPC Peering between all VPCs + block Dev↔Prod with NACLs
B) Share one TGW with the whole Org through RAM + separate the Workload RT from the Shared/Security RT with TGW Route Tables
C) Create a separate TGW in each account + connect them with TGW Inter-Region Peering
D) Use a Direct Connect Gateway with on-premises as an intermediary

**Answer: B**
Explanation: Even with only one VPC in each of the 80 accounts, VPC Peering would require 3,160 connections (80×79/2), and blocking Dev↔Prod with NACLs is impossible to maintain when CIDR ranges overlap or change (A is wrong). Creating a separate TGW in each account would cause the management of 80 TGWs plus the peering among them to grow explosively (C is wrong). Direct Connect is an on-premises connectivity service, not a routing hub between VPCs (D is wrong). In the configuration of B, sharing the TGW with the whole Org through RAM lets all accounts attach to a single TGW. RT-Workload contains only the Shared/Security CIDRs and not the Dev/Prod CIDRs, so Dev↔Prod is blocked. In RT-Shared, the Dev/Prod CIDRs are propagated, so Shared and Security can communicate with all VPCs.

---

**Question 2.** A company operates TGWs in three Regions: US East (us-east-1), Europe (eu-west-1), and Asia (ap-northeast-1). The us-east-1 TGW and the eu-west-1 TGW are connected with Inter-Region Peering, and the eu-west-1 TGW and the ap-northeast-1 TGW are also connected. VPC A in us-east-1 needs to communicate with VPC B in ap-northeast-1. What should be done?

A) Transitive routing through eu-west-1 is configured automatically
B) A separate Inter-Region Peering must be added between the us-east-1 TGW and the ap-northeast-1 TGW
C) Configure VPC Peering directly from VPC A to VPC B
D) Use CloudFront as an intermediary

**Answer: B**
Explanation: TGW Inter-Region Peering is not transitive (A is wrong). The us-east-1 TGW learns routes from the eu-west-1 TGW, but routing to ap-northeast-1 through eu-west-1 is not configured automatically. For the three Regions to communicate fully, peering is needed between every pair of TGWs (us↔eu, eu↔ap, us↔ap). Cross-Region VPC Peering is possible, but configuring it without a TGW does not scale (C is wrong). CloudFront is a CDN service and is unrelated to routing between VPCs (D is wrong).

---

**Question 3.** A company created its TGW with DefaultRouteTableAssociation=enable. It later created a new Route Table to implement an isolation pattern. What is the behavior of the VPC Attachments that were created earlier?

A) Existing Attachments are automatically migrated to the new Route Table
B) Existing Attachments remain in the default Route Table, so the isolation pattern may not work as intended
C) Routing for existing Attachments stops
D) Existing Attachments must be deleted and recreated

**Answer: B**
Explanation: A VPC attached to a TGW created with DefaultRouteTableAssociation=enable is automatically associated with the default Route Table. Even if you create a new Route Table afterward, existing Attachments stay in the default RT. To complete the isolation pattern, you must disassociate the existing Attachments from the default RT and associate them with the new RT, and routing may be briefly interrupted during this process. Therefore, when designing a new TGW, it is recommended to create it with DefaultRouteTableAssociation=disable from the start and manage the RTs manually.

---

**Question 4.** A financial company connects 50 spoke VPCs through a TGW and wants to concentrate all outbound internet traffic through the NAT Gateway in a central Egress VPC. What must be verified in the design?

A) Add an internet gateway to each spoke VPC
B) Add a TGW route for each spoke VPC CIDR to the private subnet route table of the Egress VPC
C) Set 0.0.0.0/0 as a Blackhole in the TGW Route Table
D) Add one NAT Gateway per AZ in the Egress VPC and configure each spoke VPC the same way

**Answer: B**
Explanation: In the centralized Egress pattern, the default route (0.0.0.0/0) of the spoke VPCs points to the TGW. The TGW forwards this traffic to the Egress VPC. The NAT Gateway in the Egress VPC sends it out to the internet, and the return traffic reaches the Egress VPC. For this return traffic to get back to the correct spoke VPC, the private subnet RT of the Egress VPC must have a route to the TGW for each spoke CIDR (B is correct). Without it, asymmetric routing breaks the connection. Putting individual internet gateways in the spoke VPCs defeats the purpose of centralization (A is wrong). A Blackhole drops traffic, so internet access becomes impossible (C is wrong). D is a distributed configuration, not centralized.

---

**Question 5.** A company running Cisco SD-WAN on premises wants to connect to an AWS TGW with dynamic BGP routing. What is the most appropriate approach?

A) Site-to-Site VPN (IKEv2) + BGP
B) TGW Connect (GRE tunnel + BGP)
C) Direct Connect (Private VIF) + BGP
D) VPC Peering + static routes

**Answer: B**
Explanation: TGW Connect is a feature dedicated to SD-WAN integration that connects SD-WAN appliances to the TGW through GRE tunnels and establishes BGP sessions over them to exchange dynamic routes. Site-to-Site VPN also supports BGP, but for SD-WAN appliances the GRE-based TGW Connect is usually the more natural way to integrate, and ECMP can increase bandwidth (A is possible, but B is more optimal). Direct Connect is a physical dedicated line connecting on-premises and AWS, but TGW Connect is more suitable for dynamic integration with SD-WAN (C offers high bandwidth, but it is not the standard answer for dynamic SD-WAN integration). VPC Peering connects VPCs and is not an on-premises connectivity technology (D is wrong).

---

**Question 6.** A company adopting a TGW must ensure that a specific spoke VPC can never communicate with another specific VPC. Propagation in the TGW Route Table is already configured. What additional action can be taken?

A) Block the other VPC's CIDR in that VPC's Security Group
B) Add a Blackhole route for the other VPC's CIDR to the TGW Route Table
C) Set up VPC Peering in the reverse direction between the two VPCs
D) Block the TGW's IP in the NACL

**Answer: B**
Explanation: When the other CIDR has already been learned in the Route Table through Propagation and you want to block only a specific CIDR, add a Blackhole route. If a Blackhole route is set with a more specific path (a longer prefix), it takes precedence over broader routes learned through Propagation. A Security Group (A) operates at the instance level within the VPC and does not control TGW routing. Setting up VPC Peering in the reverse direction (C) is meaningless. Blocking the TGW's IP in the NACL (D) blocks all TGW traffic, cutting other legitimate connections as well.

---

**Question 7.** A company operates VPCs in two Regions, us-east-1 and eu-west-1, with TGWs. Under GDPR, EU user data must be stored only in eu-west-1 and must not be replicated to us-east-1. At the same time, the operations teams in both Regions must be able to access common Shared services (operations tools). What is the most appropriate architecture?

A) Synchronize data across both Regions with a DynamoDB Global Table + TGW Inter-Region Peering
B) Operate an independent TGW in each Region + no TGW peering between Regions + expose only the common Shared services separately through PrivateLink
C) Manage the whole global network with a single policy using AWS Cloud WAN + allow data replication
D) Separate traffic with Route 53 Geolocation Routing + TGW Inter-Region Peering

**Answer: B**
Explanation: The core of GDPR data sovereignty is that EU data does not leave the EU Region. Configuring TGW Inter-Region Peering makes routing between Regions possible and creates a risk of data being moved by mistake (A and D are wrong). Cloud WAN also provides global connectivity, which creates a path through which data can move between Regions (C is wrong). In B, each Region operates a completely independent TGW, so there is no path through which data is routed between Regions at all. Shared services (for example, a central monitoring tool) are exposed through PrivateLink so that only API calls, not data, move between Regions.
