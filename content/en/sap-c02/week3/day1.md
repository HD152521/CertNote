# Day 1 - VPC Peering vs Transit Gateway: Network Topology Selection

When designing a cloud network, the first question you encounter is simple: "How do I connect two VPCs?" Initially, VPC Peering appears to be a clear solution. A few clicks in the console and two VPCs are communicating. But the moment VPCs grow from two to five, ten, or fifty, that initial clarity transforms into exponential complexity. To fundamentally solve this complexity, AWS launched Transit Gateway in 2018. Today, we'll delve deep into the architectural differences between the two services from a network theory perspective and master the routing isolation patterns that the SAP-C02 exam frequently tests.

## Design Philosophy and Technical Limitations of VPC Peering

VPC Peering is a technology that creates a **logically direct link** between two VPCs. Internally, AWS routes traffic destined for one VPC's CIDR block from the other VPC's router directly through the AWS backbone network. Since there's no separate gateway or proxy, latency is very low and bandwidth is equivalent to VPC internal communication.

> 💡 **Related Theory**: In network topology theory, a **Full Mesh** structure that directly connects all N nodes requires N(N-1)/2 links. With 10 VPCs you need 45 Peering connections, with 50 VPCs you need 1,225, and with 100 VPCs you need 4,950. Since the number of links grows as O(N²), the operational complexity becomes realistically unmanageable. This is why the Internet adopted BGP-based hierarchical routing instead of full mesh.

The most critical limitation of VPC Peering is the lack of support for **transitive routing**. Even if VPC A is Peering-connected to VPC B and VPC B is Peering-connected to VPC C, A cannot directly communicate with C. Traffic from A to C is not forwarded by B even if it passes through it. This isn't a design flaw but an intentional security decision. Each Peering connection must be an isolated link between two explicitly authorized VPCs.

`
[VPC A] ──── Peering ────> [VPC B] ──── Peering ────> [VPC C]
    Direct communication from A to C not possible (B refuses forwarding)

[VPC A] ──────────────── Direct Peering required ────────────────> [VPC C]
`

> 💡 **Related Theory**: The prohibition of transitive routing stems from the network security **Principle of Least Path**. If a router forwards packets along paths it doesn't explicitly know, unintended traffic flows occur. AWS prevents this by restricting route propagation of Peering connections only to the two participating VPCs. This is similar to RFC 4271 (BGP-4), which by default restricts propagation of paths received from eBGP peers to other eBGP peers.

An additional constraint is that if the CIDR blocks of two Peering VPCs overlap, the connection itself is impossible. In large organizations, subnet conflicts occur when growth happens without CIDR planning, and at that moment Peering disappears as an option.

> 📚 **Case Study**: A global media company (based on published postmortem) operated AWS accounts independently by department and assigned duplicate 10.0.0.0/8 address space. Initially there were no issues because each department operated independently, but when building a central data analytics platform, they needed to collect data from all accounts in a central account. With CIDR conflicts making Peering impossible, they used NAT layers as an emergency workaround to translate IPs. This experience became the direct catalyst for subsequent Transit Gateway adoption and IPAM standardization.

## Transit Gateway: Hub-and-Spoke Implementation

AWS Transit Gateway (TGW) was announced at AWS re:Invent in November 2018. At the announcement, AWS Chief Evangelist Jeff Barr explained it as a service to solve the reality that "customers can't keep their network architecture simple because of the mesh complexity of VPC Peering." TGW is AWS's managed service implementation of the **Hub-and-Spoke** topology.

`
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
`

The core components of TGW are **Attachments** and **Route Tables**. VPCs, VPN connections, Direct Connect Gateways, TGW Peering from other regions, and TGW Connect (SD-WAN) all connect to TGW as Attachments. Each Attachment is associated with one or more Route Tables and learns routes from other Attachments (Propagation) or receives static routes (Association).

> 💡 **Related Theory**: TGW internally supports **ECMP (Equal-Cost Multi-Path)** routing. When multiple VPN or DX paths exist to the same destination, traffic is distributed to scale bandwidth linearly. RFC 2992 defines the basic principles of ECMP implementation. AWS's TGW ECMP can achieve aggregate VPN bandwidth of up to 50Gbps (1.25Gbps per VPN tunnel × 40 tunnels) over TGW.

> 🔍 **Deep Dive**: TGW's internal data plane is based on AWS's **Nitro networking stack**. There are TGW instances distributed within each Availability Zone, and VPC Attachments are connected by creating ENIs (Elastic Network Interfaces) in each AZ subnet. This distributed architecture ensures traffic continues through other AZs even if a single AZ fails. Since TGW itself is fully managed by AWS, users don't need to separately configure AZ redundancy.

## TGW Route Table Isolation Patterns (Exam Core)

The reason TGW Route Table design appears repeatedly in SAP-C02 exams is that this feature is the core mechanism that satisfies large enterprise networks' logical separation requirements. There are two basic concepts: **Association** (which Route Table's routing decisions to follow) and **Propagation** (which Route Table to advertise its CIDR to).

### Pattern 1: Shared Service Isolation (Most Frequent in Exams)

Development and Production VPCs should not communicate with each other, but both environments need access to shared DNS servers, Active Directory, and patch servers in a Shared VPC.

`
[TGW Route Table Configuration]

RT-Workload (Dev, Prod are associated):
  └── 10.99.0.0/16 → Shared Attachment (learned via static or Propagation)
  ※ Dev CIDR, Prod CIDR are not propagated to this RT → Dev↔Prod communication blocked

RT-Shared (Shared VPC is associated):
  ├── 10.1.0.0/16 → Dev Attachment (Propagation)
  └── 10.2.0.0/16 → Prod Attachment (Propagation)
  ※ Shared knows and can communicate with both Dev and Prod
`

When a packet from Dev is sent to Prod, the packet arrives at TGW and queries RT-Workload. Since RT-Workload doesn't have Prod's CIDR (10.2.0.0/16), it's treated as blackhole. This is the essence of isolation.

> 🎯 **Scenario**: A global financial company operates five OUs (Development, Staging, Production, Shared Services, Security) through AWS Organizations. With repeated incidents of development teams accidentally accessing Prod, complete isolation at the network level is required. Simultaneously, all environments need access to Shared's AD and DNS, and Security's log collector. The TGW Route Table pattern can satisfy this requirement with three Route Tables: RT-Workload, RT-Shared, and RT-Security. Adding SCP for IAM-level isolation completes Defense in Depth.

### Pattern 2: Centralized Internet Egress

NAT Gateways are created per AZ and incur costs. If 50 VPCs each have NAT Gateways, with 2 AZs you accumulate costs for 100 NAT Gateways. With TGW, you can centralize all outbound Internet traffic from all VPCs through a single Egress VPC with NAT Gateways.

`
[Default route for all spoke VPCs]
0.0.0.0/0 → TGW

[TGW RT-Workload]
0.0.0.0/0 → Egress VPC Attachment

[Egress VPC]
NAT Gateway → Internet Gateway → Internet
`

> ⚠️ **Pitfall**: When implementing the centralized Egress pattern, hairpinning issues can occur. When traffic from a spoke VPC reaches the Egress VPC through TGW, return traffic must correctly route back to the original VPC through TGW from the Egress VPC's routing table. For this to work, you must explicitly add TGW routes for each spoke VPC's CIDR in the Egress VPC's private subnet route table. Omitting this route causes asymmetric routing and connection failure.

### Pattern 3: Explicit Blocking Using Blackhole Routes

Adding a Blackhole route to a specific CIDR in the TGW Route Table explicitly drops traffic destined for that range. This is useful for granular control to block specific traffic even when routes are learned via Propagation.

`ash
aws ec2 create-transit-gateway-route \
  --transit-gateway-route-table-id tgw-rtb-xxx \
  --destination-cidr-block 10.2.0.0/16 \
  --blackhole
`

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

`ash
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
`

> 🎯 **Scenario**: A large e-commerce company operates a master account, network account, security account, and 80 workload accounts per business unit through AWS Organizations. The network team creates a single TGW in the network account and shares it organization-wide via RAM. VPCs from workload accounts attach to this TGW. Routing control is managed centrally by the network team. When a new business unit creates an account, they simply attach to the existing TGW, standardizing network onboarding.

## TGW Connect: SD-WAN Integration

Enterprises running Cisco SD-WAN, VMware SD-WAN (VeloCloud), or Aviatrix on premises and expanding to AWS use TGW Connect. TGW Connect runs BGP over GRE (Generic Routing Encapsulation) tunnels to exchange dynamic routing with SD-WAN appliances.

`
[On-Premises SD-WAN] ──── GRE Tunnel ────> [TGW Connect Attachment]
                         BGP Session                │
                                              [TGW Route Table]
                                                    │
                                            [Spoke VPCs]
`

> 💡 **Related Theory**: GRE (RFC 2784) is a tunneling technique that encapsulates arbitrary protocol packets in another protocol. In TGW Connect, GRE forms a tunnel between BGP peers. BGP (RFC 4271) is a route exchange protocol between Autonomous Systems. In TGW Connect, a BGP session is established between the SD-WAN appliance and TGW to dynamically learn routes.

## TGW Multicast: Specialized for Finance and Media

Some financial trading systems and media streaming require **multicast** to simultaneously transmit identical data from a single source to multiple recipients. TGW supports multicast domains, enabling these workloads to migrate to AWS.

> 🔍 **Deep Dive**: Internet multicast is based on IGMP (Internet Group Management Protocol) and PIM (Protocol Independent Multicast). AWS TGW multicast supports IGMP v2/v3 and TGW manages multicast group membership. Financial market data feeds must deliver identical data to thousands of recipients in real-time. With unicast, bandwidth grows linearly, but with multicast, source bandwidth remains constant.

## Practical CLI: Implementing TGW Isolation Patterns

`ash
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
`

In SAP-C02 exams, TGW-related questions typically ask "Which Route Table design satisfies this isolation requirement?" The key is that Association holds routing decision authority and Propagation controls route advertisement. Dev↔Prod isolation is achieved by preventing both Attachments' CIDRs from Propagating to RT-Workload.

> ⚠️ **Pitfall**: When creating TGW, DefaultRouteTableAssociation=enable and DefaultRouteTablePropagation=enable are defaults. Creating with these settings means all new Attachments automatically associate with the default RT and propagate their CIDR to it. To implement isolation patterns, you must set both options to disable and manage RTs manually. If changing on an existing TGW, Attachments already associated with the default RT remain there, requiring careful attention.

## Conclusion

VPC Peering remains a valid choice when directly connecting two VPCs without overlapping CIDRs. Latency is lowest and there's no additional cost. However, when you have three or more VPCs with isolation requirements or need a hybrid topology including VPN/Direct Connect, TGW is the right choice. For global multi-region networks, Cloud WAN significantly reduces operational complexity. Clearly understanding the trade-offs of these three options is the starting point for the SAP-C02 network domain.

---

## 📝 연습 문제

**문제 1.** 글로벌 제조업체가 AWS Organizations로 80개 계정을 운영한다. 모든 계정의 VPC가 중앙 보안 VPC(IDS/IPS, 로그 수집)와 공유 서비스 VPC(DNS, AD)에는 접근해야 하지만, 개발 계정과 프로덕션 계정 간의 직접 통신은 차단해야 한다. 운영 부담을 최소화하면서 이 요구사항을 충족하는 방법은?

A) 모든 VPC 간 VPC Peering 구성 + NACL로 Dev↔Prod 차단
B) TGW 1개를 RAM으로 전체 Org에 공유 + TGW Route Table로 Workload RT와 Shared/Security RT 분리
C) 각 계정에 별도 TGW 생성 + TGW Inter-Region Peering으로 연결
D) Direct Connect Gateway로 온프레미스를 중계자로 활용

**정답: B**
해설: 80개 계정에 VPC가 하나씩만 있어도 VPC Peering은 3,160개가 필요하고(80×79/2), NACL로 Dev↔Prod를 차단하는 것은 CIDR 범위가 겹치거나 변경될 때 유지보수가 불가능하다(A 오답). 각 계정에 TGW를 별도 생성하면 TGW 80개 + 그 간의 피어링 관리가 폭발적으로 증가한다(C 오답). Direct Connect는 온프레미스 연결 서비스지 VPC 간 라우팅 허브가 아니다(D 오답). B의 구성에서 TGW를 RAM으로 전체 Org에 공유하면 모든 계정이 단일 TGW에 Attach할 수 있다. RT-Workload에는 Shared/Security CIDR만 있고 Dev/Prod CIDR는 없으므로 Dev↔Prod가 차단된다. RT-Shared에는 Dev/Prod CIDR가 Propagation되어 Shared와 Security는 모든 VPC와 통신 가능하다.

---

**문제 2.** 미국 동부(us-east-1), 유럽(eu-west-1), 아시아(ap-northeast-1) 세 리전에 TGW를 운영하는 기업이 있다. us-east-1 TGW와 eu-west-1 TGW가 Inter-Region Peering으로 연결되어 있고, eu-west-1 TGW와 ap-northeast-1 TGW도 연결되어 있다. us-east-1의 VPC A가 ap-northeast-1의 VPC B와 통신하려 한다. 어떻게 해야 하는가?

A) 이미 eu-west-1을 통한 전이적 라우팅이 자동으로 설정된다
B) us-east-1 TGW와 ap-northeast-1 TGW 간에 별도 Inter-Region Peering을 추가해야 한다
C) VPC A에서 VPC B로 VPC Peering을 직접 구성한다
D) Cloud Front를 중계자로 사용한다

**정답: B**
해설: TGW Inter-Region Peering은 전이적이지 않다(A 오답). us-east-1 TGW는 eu-west-1 TGW의 라우트를 학습하지만, eu-west-1을 통해 ap-northeast-1로 라우팅이 자동으로 설정되지 않는다. 세 리전이 완전히 통신하려면 각 TGW 쌍 사이에 피어링이 필요하다(us↔eu, eu↔ap, us↔ap). 리전 간 VPC Peering은 가능하지만 TGW 없이 구성하면 확장성이 없다(C 오답). CloudFront는 CDN 서비스로 VPC 간 라우팅과 무관하다(D 오답).

---

**문제 3.** 회사가 TGW를 생성할 때 DefaultRouteTableAssociation=enable로 생성했다. 이후 격리 패턴을 구현하기 위해 새 Route Table을 만들었다. 기존에 생성된 VPC Attachment들의 동작은?

A) 기존 Attachment는 자동으로 새 Route Table로 마이그레이션된다
B) 기존 Attachment는 기본 Route Table에 남아 있어 격리 패턴이 의도대로 동작하지 않을 수 있다
C) 기존 Attachment는 라우팅이 중단된다
D) 기존 Attachment는 삭제하고 다시 생성해야 한다

**정답: B**
해설: DefaultRouteTableAssociation=enable로 생성된 TGW에 Attach된 VPC는 기본 Route Table에 자동 Association된다. 이후에 새 Route Table을 만들어도 기존 Attachment는 기본 RT에 그대로 남는다. 격리 패턴을 완성하려면 기존 Attachment를 기본 RT에서 dis-associate하고 새 RT에 associate해야 하며, 이 과정에서 잠깐 라우팅이 끊어질 수 있다. 따라서 새 TGW를 설계할 때는 처음부터 DefaultRouteTableAssociation=disable로 생성하고 수동으로 RT를 관리하는 것이 권장된다.

---

**문제 4.** 금융 회사가 50개 스포크 VPC를 TGW를 통해 연결하면서 모든 아웃바운드 인터넷 트래픽을 중앙 Egress VPC의 NAT Gateway를 통해 집중시키려 한다. 설계 시 반드시 확인해야 할 사항은?

A) 각 스포크 VPC에 인터넷 게이트웨이를 추가한다
B) Egress VPC의 프라이빗 서브넷 라우트 테이블에 각 스포크 VPC CIDR에 대한 TGW 라우트를 추가한다
C) TGW Route Table에 0.0.0.0/0을 Blackhole로 설정한다
D) Egress VPC에 NAT Gateway를 각 AZ당 하나씩 추가하고 각 스포크 VPC에도 동일하게 구성한다

**정답: B**
해설: 중앙화 Egress 패턴에서 스포크 VPC의 기본 라우트(0.0.0.0/0)는 TGW를 가리킨다. TGW는 이 트래픽을 Egress VPC로 전달한다. Egress VPC의 NAT Gateway가 인터넷으로 내보내고, 리턴 트래픽이 Egress VPC에 도달한다. 이 리턴 트래픽이 올바른 스포크 VPC로 돌아가려면 Egress VPC의 프라이빗 서브넷 RT에 각 스포크 CIDR에 대한 → TGW 라우트가 있어야 한다(B 정답). 없으면 비대칭 라우팅으로 연결이 끊어진다. 스포크 VPC에 개별 인터넷 게이트웨이를 두면 중앙화의 의미가 없다(A 오답). Blackhole은 트래픽을 드롭하므로 인터넷 접근이 불가능해진다(C 오답). D는 중앙화가 아니라 분산 구성이다.

---

**문제 5.** 온프레미스에서 Cisco SD-WAN을 운영하는 기업이 AWS TGW와 동적 BGP 라우팅으로 연결하려 한다. 가장 적합한 방식은?

A) Site-to-Site VPN (IKEv2) + BGP
B) TGW Connect (GRE 터널 + BGP)
C) Direct Connect (Private VIF) + BGP
D) VPC Peering + 정적 라우트

**정답: B**
해설: TGW Connect는 SD-WAN 어플라이언스를 GRE 터널로 TGW에 연결하고, 그 위에서 BGP 세션을 맺어 동적 라우팅을 교환하는 SD-WAN 통합 전용 기능이다. Site-to-Site VPN도 BGP를 지원하지만, SD-WAN 어플라이언스는 보통 GRE 기반의 TGW Connect가 더 자연스러운 통합 방식이고 ECMP로 대역폭을 높일 수 있다(A는 가능하지만 B가 더 최적). Direct Connect는 물리적 전용선으로 온프레미스↔AWS 연결이지만, SD-WAN과의 동적 통합에는 TGW Connect가 더 적합하다(C는 대역폭은 높지만 SD-WAN 동적 통합의 표준 답은 아님). VPC Peering은 VPC 간 연결이지 온프레미스 연결 기술이 아니다(D 오답).

---

**문제 6.** 한 기업이 TGW를 도입하면서 특정 스포크 VPC가 다른 특정 VPC와 절대 통신하지 못하게 해야 한다. TGW Route Table의 Propagation은 이미 설정되어 있다. 추가로 취할 수 있는 조치는?

A) 해당 VPC의 Security Group에서 상대방 VPC CIDR를 차단
B) TGW Route Table에 상대방 VPC CIDR에 대한 Blackhole 라우트 추가
C) 두 VPC 사이에 VPC Peering을 역방향으로 설정
D) NACL에서 TGW의 IP를 차단

**정답: B**
해설: Propagation으로 이미 상대방 CIDR이 Route Table에 학습된 상태에서 특정 CIDR만 차단하려면 Blackhole 라우트를 추가한다. Blackhole 라우트는 더 구체적인 경로(더 긴 프리픽스)로 설정하면 Propagation으로 학습된 더 광범위한 라우트보다 우선된다. Security Group(A)은 VPC 내 인스턴스 레벨에서 동작하고 TGW 라우팅을 제어하지 않는다. VPC Peering 역방향 설정(C)은 의미가 없다. NACL에서 TGW IP를 차단하면(D) 모든 TGW 트래픽이 차단되어 다른 정상적인 연결도 끊어진다.

---

**문제 7.** 회사가 us-east-1, eu-west-1 두 리전의 VPC를 TGW로 운영한다. GDPR 규정으로 EU 사용자 데이터는 eu-west-1에만 저장되어야 하고 us-east-1로 복제되지 않아야 한다. 동시에 두 리전의 운영팀이 공통 Shared 서비스(운영 도구)에는 접근할 수 있어야 한다. 가장 적합한 아키텍처는?

A) DynamoDB Global Table로 양 리전 데이터 동기화 + TGW Inter-Region Peering
B) 각 리전에 독립 TGW 운영 + 리전 간 TGW Peering 없음 + 공용 Shared 서비스만 별도 PrivateLink로 노출
C) AWS Cloud WAN으로 전체 글로벌 네트워크 단일 정책 관리 + 데이터 복제 허용
D) Route 53 Geolocation Routing으로 트래픽 분리 + TGW Inter-Region Peering

**정답: B**
해설: GDPR 데이터 주권의 핵심은 EU 데이터가 EU 리전을 벗어나지 않는 것이다. TGW Inter-Region Peering을 구성하면 라우팅이 리전 간에 가능해지고 실수로 데이터가 이동할 위험이 있다(A, D 오답). Cloud WAN도 글로벌 연결성을 제공하므로 데이터가 리전 간에 이동할 수 있는 경로가 생긴다(C 오답). B는 각 리전이 완전히 독립된 TGW를 운영해 데이터가 리전 간에 라우팅되는 경로 자체가 없다. Shared 서비스(예: 중앙 모니터링 도구)는 PrivateLink로 노출해 데이터가 아닌 API 호출만 리전 간에 이동하도록 제한한다.
