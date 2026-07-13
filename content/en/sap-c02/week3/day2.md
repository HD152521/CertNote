# Day 2 - Direct Connect Architecture and Redundancy: Physics of Dedicated Lines

There are two main ways to connect an on-premises data center with AWS. VPN, which creates an encrypted tunnel over the internet, and Direct Connect, which establishes a physically dedicated circuit. While the concept is straightforward, properly designing Direct Connect in AWS requires deep understanding of BGP routing control, VIF type selection, redundancy topology, and failover mechanisms. SAP-C02 Direct Connect questions don't ask for simple feature recall but rather "which VIF, which redundancy, and which BGP manipulation is the correct answer for this scenario?" Today we'll cover the full stack—from DX physical layer to BGP priority manipulation.

## Direct Connect Physical Reality: What Is a Dedicated Line?

Direct Connect connects on-premises equipment and an AWS DX Location (physical colocation facility) via a **dedicated fiber optic cable**. This cable passes through no shared internet infrastructure. Connection from the AWS DX Location to AWS networks goes through AWS's directly operated backbone.

> 💡 **Related Theory**: DWDM (Dense Wavelength Division Multiplexing, RFC 6241) multiplexes light of different wavelengths (colors) on a single fiber to operate tens of independent channels. AWS DX's 100Gbps circuit uses DWDM technology to bundle 10Gbps channels (10 channels × 10Gbps) on a single physical cable. This is why DX circuits sharing the same cable path can be a single point of failure.

The DX connection provisioning process follows this path: You request a connection in the AWS console and receive a LOA-CFA (Letter of Authorization — Connecting Facility Assignment) document from the DX Location. Submit this document to the DX Location operator (colocation facility), and a Cross Connect is installed. The on-premises router to DX Location physical circuit is then configured by a separate telecom carrier (AT&T, Verizon, KT, etc.). The entire process takes **weeks to months** because of this physical construction phase.

> 📚 **Case Study**: In 2020, a major financial institution migrating its core banking system to AWS experienced a 6-week schedule delay due to Direct Connect provisioning delays. LOA-CFA issuance took 1 week, but the colocation facility's cross-connect installation queue was 3 weeks, and the carrier's final-mile fiber construction was 2 weeks. Based on this experience, the organization established a process to include DX provisioning in the critical path for future projects, starting 6 months in advance.

## VIF (Virtual Interface) Three Types: Selection Criteria

On top of a DX physical connection, you place logical VIFs (Virtual Interface). A VIF consists of a VLAN and BGP peering, with three types based on purpose.

### Private VIF: Private IP Access to a Single VPC

Private VIF is used when accessing private IP addresses of a specific VPC (e.g., 10.x.x.x) from on-premises. It establishes BGP sessions with the VGW (Virtual Private Gateway) connected to the VPC.

```
On-premises Router
    │ BGP (Private VIF, VLAN 100)
    ▼
DX Location
    │ AWS Internal Network
    ▼
VGW (Virtual Private Gateway)
    │ Advertises on-premises CIDR to VPC Route Table
    ▼
VPC (Single VPC)
```

The critical limitation of Private VIF is that it can connect to **only a single VGW**. It's impossible to access multiple VPCs simultaneously or access VPCs in multiple regions with a single Private VIF.

### Public VIF: Access AWS Public Services from Private Network

Public VIF is used when accessing AWS public endpoints (S3, DynamoDB, SQS, ECR, etc.) without traversing the internet. Through Public VIF, AWS advertises its entire owned IPv4/IPv6 public address range via BGP.

> 🔍 **Deeper Dive**: When you enable Public VIF, tens of thousands of AWS public IP prefixes are advertised to the on-premises router via BGP sessions. For the on-premises router to accommodate these routes, it needs sufficient **BGP routing table capacity**. Some enterprise routers have default BGP table size limits, and activating Public VIF has caused router CPU overload in some cases. In practice, BGP filters (prefix-list, route-map) limit the accepted IP ranges to only necessary services.

### Transit VIF: Multi-VPC and Multi-Region Access via TGW

Transit VIF establishes BGP sessions with DX Gateway (DXGW), which connects to Transit Gateway (TGW). This allows TGW-connected VPCs to be accessed from on-premises via a single DX circuit.

```
On-premises Router
    │ BGP (Transit VIF, VLAN 200)
    ▼
DX Location ──────────────────────────────────────────
                                                      │
                              DX Gateway (Global Resource)
                                    │
                          ┌─────────┴─────────┐
                          │                   │
                    TGW (us-east-1)     TGW (eu-west-1)
                    │    │    │           │    │    │
                 VPC1 VPC2 VPC3        VPC4 VPC5 VPC6
```

> ⚠️ **Pitfall**: When connecting to TGW through DXGW, there's a **limit on on-premises advertised CIDR**. DXGW can accept maximum 20 allowed prefixes, and the VPC side can advertise maximum 200 prefixes to on-premises. If an organization has more than 200 VPCs, **route summarization** is mandatory. If CIDR hierarchy is not designed from the start, later summarization becomes impossible.

| VIF Type | Connected Target | Multi-VPC | Multi-Region | Primary Use Case |
|----------|-----------|----------|-----------|---------------|
| Private VIF | Single VGW (VPC) | Not possible | Not possible | Small single VPC connection |
| Public VIF | AWS public services | N/A | Global | Private S3, DynamoDB access |
| Transit VIF | DX Gateway → TGW | Possible | Possible (via DXGW) | Enterprise multi-VPC/region |

## Direct Connect Gateway: Global Routing Hub

DX Gateway (DXGW) is an AWS global service not tied to any specific region. When a single DX connection connects to DXGW and then to TGWs in multiple regions, you can access on-premises to all regional VPCs via a single physical circuit.

> 💡 **Related Theory**: DXGW is internally implemented as a **distributed routing plane**. It's not physically located in a specific region but maintains routing state across AWS's entire global backbone. When a CIDR advertised from on-premises reaches DXGW, DXGW forwards this route via BGP to connected TGWs. Each TGW injects this route into its connected VPC route tables. This happens asynchronously, so it can take several minutes for routes to fully propagate to VPCs after connecting DXGW to TGW.

## LAG (Link Aggregation Group): Combining Bandwidth and Redundancy

When a single DX circuit's bandwidth is insufficient or redundancy against single-port failures is needed, LAG (Link Aggregation Group) is configured. LAG uses LACP (Link Aggregation Control Protocol, IEEE 802.3ad) to bundle multiple physical ports into a single logical interface.

```
[On-premises Router]          [DX Location]
Bond Interface ─┐
                ├── 10G Port 1 ──┐
                └── 10G Port 2 ──┤── Logical 20Gbps Interface ──> AWS
                                 └── (If Port 1 fails, Port 2 auto-handles all traffic)
```

> 💡 **Related Theory**: LACP (RFC 4127) is a negotiation-based link aggregation protocol. Both sides exchange LACP PDUs (Protocol Data Units) to negotiate ports participating in the aggregate. AWS DX LAG can only bundle ports on the same AWS device within the same DX Location. There's a maximum of 4 ports with identical bandwidth. That is, 4 × 10Gbps ports can create a maximum logical 40Gbps interface. However, while LACP reacts quickly to physical failures (port damage, cable cut), it needs BGP and BFD for path-level failures (entire DX Location down).

Understanding LAG's limitations is critical. LAG only works **within the same DX Location**. Circuits from different DX Locations cannot be bundled with LAG. Therefore, LAG is effective for bandwidth expansion and single-port failure defense, but powerless against facility-wide DX Location failures (facility fire, network equipment total shutdown).

## DX Redundancy Architecture: SLA and Cost Tradeoff

AWS defines three levels of DX resilience. This design appears repeatedly in SAP-C02.

### Maximum Resiliency: 99.99% SLA

```
On-premises Router A ─── DX Location Seoul 1 ───┐
On-premises Router A ─── DX Location Seoul 1 ───┤  (Same Location, Different Equipment/Cables)
                                              ├── DXGW ── TGW ── VPCs
On-premises Router B ─── DX Location Seoul 2 ───┤
On-premises Router B ─── DX Location Seoul 2 ───┘
                         (Different Location)
```

The key is **two-fold independence**. First, different DX Locations (physically separate facilities). Second, different physical equipment and cable paths within each location. AWS's DX Resiliency Toolkit automatically validates this configuration. Four circuits total defend against both single-equipment failure and single-location failure.

### High Resiliency: 99.9% SLA

```
On-premises ─── DX Location A ───┐
                                ├── DXGW ── TGW ── VPCs
On-premises ─── DX Location B ───┘
```

Two separate DX Locations with one circuit each. Two circuits total. Defends against single-location failure, but single port/cable failure within each location can cause service interruption.

### Development: 99% SLA + VPN Backup

```
On-premises ─── DX Location A ───── AWS (Primary Path)
On-premises ─── Internet VPN ─────── AWS (Backup Path, Lower Priority via BGP)
```

A combination of one DX circuit and Site-to-Site VPN backup. When DX goes down, automatic VPN failover occurs. Bandwidth is constrained by VPN limitations, but cost is lowest. Suitable for non-production environments or low-criticality workloads.

> 🎯 **Scenario**: A global automotive manufacturer analyzes factory automation data (robot control feedback, quality inspection images) from South Korean plants on AWS in real-time. When the factory stops, losses reach hundreds of millions of won per hour, making DX connection failure unacceptable. South Korea has two DX Locations: Seoul Sangam and Gasan. Maximum Resiliency configuration places 2 circuits each at both locations, for 4 total. On-premises routers are also redundant, eliminating SPOF. At double the cost of High Resiliency due to 4 circuits, it's justified against factory downtime losses.

## BGP Priority Control: DX vs VPN Failover

When running DX and VPN simultaneously, to prefer DX during normal operation and auto-switch to VPN on DX failure, BGP attribute manipulation is necessary.

### AWS → On-Premises Direction (Inbound Traffic Control)

When AWS sends traffic to on-premises, to control which path AWS prefers, the on-premises side must set different BGP attributes for the two advertised paths (DX, VPN).

```
DX Path: Low MED (Multi-Exit Discriminator) value (e.g., 100) → AWS prefers
VPN Path: High MED value (e.g., 200) → AWS less prefers

Or:

DX Path: Short AS Path (e.g., 65000)
VPN Path: AS Path Prepending (e.g., 65000 65000 65000) → Longer AS Path = less preferred
```

> 💡 **Related Theory**: BGP path selection algorithm (RFC 4271) compares multiple attributes in order. Highest priority first: Local Preference (higher = preferred) → AS Path length (shorter = preferred) → Origin (IGP > EGP > Incomplete) → MED (lower = preferred) → eBGP vs iBGP → IGP metric. AWS uses Local Preference and AS Path Prepending primarily for path selection between DX and VPN. AWS's BGP Local Preference is set higher for DX than VPN, so DX is basically preferred even without special manipulation.

### On-Premises → AWS Direction (Outbound Traffic Control)

When on-premises sends traffic to AWS, setting high Local Preference on the on-premises router for DX paths prioritizes DX over VPN. When DX fails, the high-Local-Preference path disappears and VPN becomes active.

```bash
# Cisco Router Example (BGP route-map)
route-map PREFER-DX permit 10
 set local-preference 200   # DX Path: High Local Pref

route-map PREFER-VPN permit 10
 set local-preference 100   # VPN Path: Low Local Pref

router bgp 65000
 neighbor [DX_BGP_IP] route-map PREFER-DX in
 neighbor [VPN_BGP_IP] route-map PREFER-VPN in
```

## BFD: Fast Failure Detection

With default BGP settings, keepalive interval is 60 seconds and hold time is 180 seconds. That means up to 180 seconds (3 minutes) elapse before BGP session is torn down after failure. Failover begins 3 minutes after failure.

BFD (Bidirectional Forwarding Detection, RFC 5880) reduces this to **under 1 second**. BFD independently exchanges hello packets every 100ms and, on 3 consecutive failures, declares link down within 300ms and notifies BGP. BGP immediately switches to alternative paths upon BFD notification.

> 🔍 **Deeper Dive**: BFD operates in two modes. **Asynchronous Mode**: both sides periodically send BFD packets; link down declared on receive failure. **Echo Mode**: one side sends BFD packets and the other echoes back immediately from the data plane, enabling single-directional delay measurement. AWS DX uses Asynchronous Mode, and minimum BFD timer is 300ms. On-premises routers must configure the same timer for negotiation.

## MACsec: L2 Encryption

While DX is a private network, it physically passes through colocation facilities, so theoretical physical tap possibilities exist. Regulated industries (finance, healthcare) may require L2 encryption for this.

MACsec (IEEE 802.1AE) applies encryption at the ethernet frame level (L2). AWS DX supports MACsec on 10Gbps and 100Gbps Dedicated Connections. 1Gbps circuits and Hosted Connections don't support it.

> 💡 **Related Theory**: MACsec (IEEE 802.1AE) encrypts ethernet payload with GCM-AES-128 or GCM-AES-256. Unlike IPsec (L3) encrypting IP packets, MACsec encrypts entire ethernet frames, making traffic analysis based on MAC addresses impossible. Latency overhead is microseconds due to hardware acceleration.

MACsec focuses on encrypting the DX circuit itself. In contrast, IPsec VPN over DX adds L3 encryption by placing a tunnel on top of DX. If regulations require "Encryption in Transit," MACsec satisfies this requirement.

## DX Compared with Other Cloud Providers

| Item | AWS Direct Connect | GCP Cloud Interconnect | Azure ExpressRoute |
|------|-------------------|------------------------|-------------------|
| Dedicated Circuit Type | Dedicated/Hosted | Dedicated/Partner | ExpressRoute Direct/Partner |
| Minimum Bandwidth | 50Mbps (Hosted) | 10Gbps (Dedicated) | 50Mbps (Partner) |
| Maximum Bandwidth | 100Gbps | 100Gbps | 100Gbps |
| L2 Encryption | MACsec (10G/100G) | Not supported | MACsec (ExpressRoute Direct) |
| Routing Protocol | BGP-4 | BGP-4 | BGP-4 |
| Multi-VPC Connection | DXGW + Transit VIF | Cloud Router (Global VPC) | ExpressRoute Global Reach |
| Provisioning Period | Weeks~Months | Weeks~Months | Weeks~Months |
| SLA | 99.99% (Maximum) | 99.99% (Redundant) | 99.95% (Default) |

> 🔍 **Deeper Dive**: The decisive difference between Azure ExpressRoute and AWS DX is global scope. AWS DX from a connected DX Location can access all regions globally via DXGW. Azure ExpressRoute is fundamentally region-scoped; multi-region connection requires separately enabling Global Reach. For GCP, since VPC itself is global, a single Cloud Interconnect connection accesses all regional subnets.

## SiteLink: On-Premises Connectivity via DX Backbone

SiteLink connects two on-premises data centers directly via AWS DX backbone. Previously, connecting two on-premises sites required separate WAN circuits or MPLS, but with SiteLink, if both sites have DX connections, the DX backbone can enable inter-site communication.

```
Tokyo DC ─── DX Location Tokyo ─── AWS DX Backbone ─── DX Location Seoul ─── Seoul DC
                                        (SiteLink Path)
```

SiteLink is for **on-premises ↔ on-premises** connectivity using AWS backbone, not accessing AWS resources (VPCs, S3, etc.). Traffic doesn't pass through AWS VPCs and is routed directly at DX infrastructure level. Additional cost includes SiteLink processing time charges and data transfer fees.

## Practical CLI: DX Configuration

```bash
# Create Direct Connect Gateway
aws directconnect create-direct-connect-gateway \
  --direct-connect-gateway-name "EnterpriseHubDXGW" \
  --amazon-side-asn 64512

# Create Transit VIF (Connected to DXGW)
aws directconnect create-transit-virtual-interface \
  --connection-id dxcon-abc123 \
  --new-transit-virtual-interface '{
    "virtualInterfaceName": "Prod-Transit-VIF",
    "vlan": 100,
    "asn": 65000,
    "directConnectGatewayId": "dxgw-xxx",
    "addressFamily": "ipv4",
    "authKey": "SecretBGPMD5Key"
  }'

# Associate DXGW ↔ TGW
aws directconnect associate-transit-gateway-with-direct-connect-gateway \
  --direct-connect-gateway-id dxgw-xxx \
  --transit-gateway-id tgw-yyy \
  --allowed-prefixes "[{\"cidr\":\"10.0.0.0/8\"}]"

# Create LAG
aws directconnect create-lag \
  --number-of-connections 2 \
  --location DX-LOC-SEL1 \
  --connection-bandwidth 10Gbps \
  --lag-name "ProductionLAG"

# Associate MACsec Key
aws directconnect associate-mac-sec-key \
  --connection-id dxcon-abc123 \
  --ckn "CAFEBABECAFEBABE..." \
  --cak "DEADBEEFDEADBEEF..."
```

## Jumbo Frame: Large Data Transfer Optimization

DX supports MTU 1500 (default) and 9001 bytes (jumbo frame). When transmitting large volumes of data, enabling jumbo frames reduces packet header overhead and increases effective bandwidth. However, all network equipment on the path (VPC, TGW, DX Location) must support the same MTU. MTU mismatch causes packet fragmentation or PMTUD (Path MTU Discovery) failure, triggering connection problems.

> ⚠️ **Pitfall**: When traversing TGW, TGW supports 8500 MTU. Therefore, even if DX uses 9001 MTU, when traversing TGW, TGW limits it to 8500. VPC ENI supports 9001 MTU, but TGW transit effectively limits it to 8500. Not knowing this and setting 9001 causes fragmentation on TGW transit traffic, resulting in performance degradation.

## Summary

Direct Connect is the most powerful and stable method for connecting AWS and on-premises, but its complexity is equally high. Decisions are needed at each layer: VIF type selection (Private/Public/Transit), redundancy level (Maximum/High/Development), BGP priority control (MED, AS Path Prepending, Local Preference), fast failover (BFD), and L2 encryption (MACsec). The essence of DX questions on SAP-C02 is identifying the scale and resilience requirements of the scenario to select the correct VIF and redundancy configuration. The next chapter will cover Site-to-Site VPN in depth—frequently used as DX backup or alternative.

---

## 📝 연습 문제

**문제 1.** A global bank connected its on-premises core banking system to AWS with a single DX circuit. It operates a total of 150 VPCs spanning 3 regions (us-east-1, eu-west-1, ap-northeast-1). To access all these VPCs from on-premises using private IPs:

A) Create 150 Private VIFs
B) Create 3 Private VIFs (1 per region) + Connect to VGW
C) 1 Transit VIF + DX Gateway + Regional TGWs
D) 1 Public VIF + 150 VPN Tunnels

**정답: C**
Explanation: Private VIF can connect to only a single VGW (single VPC), so 150 is impossible (A, B incorrect). Public VIF is for AWS public service access, not VPC private IP access (D incorrect). Transit VIF + DXGW + TGW structure is the standard architecture for single DX circuit multi-region and multi-VPC access. DXGW is a global service that can simultaneously connect TGWs in multiple regions.

---

**문제 2.** A factory automation system is connected to AWS via DX. Factory downtime costs 1 billion won per hour, making network failures unacceptable. What is the AWS-recommended Maximum Resiliency configuration?

A) 2 ports bundled with LAG in a single DX Location
B) 1 circuit each from 2 DX Locations, 2 circuits total
C) 2 circuits each from 2 DX Locations, 4 total circuits + redundant on-premises routers
D) 1 circuit in single DX Location + Site-to-Site VPN backup

**정답: C**
Explanation: Maximum Resiliency (99.99% SLA) is AWS's highest resilience configuration level. A's LAG bundles multiple ports within the same location, powerless against location-wide failure. B's 2-location 2-circuit is High Resiliency (99.9%), where single port/cable failure in each location can cause service interruption. D is Development (99%) level. C is Maximum Resiliency defending against both single-location and single-port/cable failure. AWS DX Resiliency Toolkit automatically validates this configuration.

---

**문제 3.** Operating DX and Site-to-Site VPN simultaneously, DX should be preferred during normal operation. On DX failure, automatic VPN switchover should occur. How to control path priority for on-premises → AWS traffic (outbound)?

A) Set DX as "Primary" in AWS console
B) In on-premises BGP, set high Local Preference for DX path and low Local Preference for VPN path
C) Add more specific CIDR to VPN route table
D) Automatically prioritized when BFD is enabled on DX

**정답: B**
Explanation: On-premises → AWS traffic path selection is controlled by on-premises BGP policy. Local Preference is an iBGP attribute; higher = preferred. Setting DX path to Local Pref 200 and VPN path to Local Pref 100 makes DX selected normally. On DX failure, the DX path disappears from BGP table and VPN automatically becomes active. There's no "Primary" setting option in AWS console (A incorrect). More specific CIDR is for reverse direction or subnet-specific control (C incorrect). BFD speeds up failure detection but doesn't set priority (D incorrect).

---

**문제 4.** Financial regulators require "L2-layer encryption" on DX circuits. The appropriate AWS solution is:

A) IPsec VPN over DX (TLS-based)
B) DX MACsec (IEEE 802.1AE)
C) L7 encryption via TLS 1.3 at application layer
D) Switch to AWS PrivateLink

**정답: B**
Explanation: MACsec (IEEE 802.1AE) provides L2 (ethernet frame) level encryption. Supported on 10Gbps and 100Gbps Dedicated Connections. IPsec VPN over DX (A) is L3 encryption and places tunnel on top of DX, not L2. TLS is L4-L7 encryption (C incorrect). PrivateLink is a service endpoint exposure method unrelated to DX encryption (D incorrect). MACsec is not supported on 1Gbps circuits or Hosted Connections; those would use IPsec VPN over DX.

---

**문제 5.** To shorten BGP failover time from 180 seconds to under 1 second on a DX connection after failure:

A) Adjust BGP keepalive timer to 1 second
B) Enable BFD (Bidirectional Forwarding Detection)
C) Bundle 2 ports with LAG
D) Enable TGW ECMP

**정답: B**
Explanation: BFD (RFC 5880) independently exchanges hellos every 100~300ms and declares link down within 300ms on 3 consecutive failures, notifying BGP. BGP immediately switches to alternative paths. Lowering BGP keepalive to 1 second (A) speeds failover but still takes 3~5 seconds, and excessive BGP messages can increase router load. LAG (C) is port redundancy, not directly related to failover speed. TGW ECMP (D) is load balancing, unrelated to failover speed.

---

**문제 6.** Two on-premises data centers (Tokyo, Seoul) each have AWS DX connections. To use AWS DX backbone for direct inter-datacenter communication:

A) TGW Inter-Region Peering
B) DX SiteLink
C) VPN Mesh between DCs
D) AWS Cloud WAN

**정답: B**
Explanation: SiteLink provides direct on-premises ↔ on-premises communication via AWS DX backbone between two DX Locations. Traffic is routed directly at DX infrastructure level without passing through AWS VPCs. TGW Inter-Region Peering (A) is for AWS VPC connectivity, not on-premises-to-on-premises. VPN Mesh (C) uses internet with less stable latency and bandwidth than DX backbone. Cloud WAN (D) is unified network management service for VPCs and on-premises, but SiteLink handles direct DX backbone connectivity between two on-premises sites.

---

**문제 7.** An enterprise transfers 100TB of large-scale ML training data from on-premises to S3 over a single 10Gbps DX circuit. To maximize transfer efficiency:

A) Enable Jumbo Frames (MTU 9001) + S3 Multipart Upload
B) Use Snowball Edge for physical transfer
C) Public VIF alone is sufficient, optimization unnecessary
D) Access S3 via TGW

**정답: A**
Explanation: S3 is accessible via Public VIF through DX. Enabling Jumbo Frames (MTU 9001) reduces packet header overhead, improving effective throughput on 10Gbps circuit. S3 Multipart Upload splits large files into parallel chunks for transfer, maximizing throughput. Snowball Edge (B) is for scenarios where no internet connectivity exists or DX bandwidth is insufficient, comparing whether physical shipment is faster. 100TB over 10Gbps takes approximately 22 hours (theoretical), requiring comparison with Snowball shipping time. TGW transit (D) limits MTU to 8500 and adds unnecessary hops.

---
