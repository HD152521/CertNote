# Day 3 - Site-to-Site VPN and Client VPN: Everything About IPsec Tunnels

VPN, which creates encrypted tunnels over the internet, has been core to enterprise networking since the late 1990s. When AWS launched Site-to-Site VPN in 2011, most enterprises were already familiar with IPsec-based VPN. However, AWS VPN is more than just an IP tunnel. Combined with TGW, ECMP scales bandwidth linearly; integrated with Global Accelerator, it guarantees low latency from anywhere globally; and BGP automatically reflects on-premises routing changes. Today we'll cover Site-to-Site VPN's internal operation from IPsec fundamentals through bandwidth scaling with ECMP, Accelerated VPN, and Client VPN authentication flows—all to SAP-C02 depth.

## IPsec Structure: VPN's Underlying Technology

AWS Site-to-Site VPN is based on the IPsec (IP Security) protocol. IPsec is an L3 security protocol suite defined by RFC 4301, with two core components.

**AH (Authentication Header, RFC 4302)**: Ensures packet integrity and authentication but doesn't encrypt. Guarantees packet contents haven't been modified, but contents remain plaintext.

**ESP (Encapsulating Security Payload, RFC 4303)**: Encrypts packets and ensures integrity. AWS VPN uses ESP.

IPsec operates in two modes. **Transport Mode** maintains original IP headers and encrypts only the payload. **Tunnel Mode** encrypts the entire original IP packet and encapsulates it with a new IP header. AWS Site-to-Site VPN always uses **Tunnel Mode**.

> 💡 **Related Theory**: IKE (Internet Key Exchange) is the protocol for establishing secure connections in IPsec. IKEv1 (RFC 2409) consists of two phases (Phase 1: security channel establishment, Phase 2: IPsec SA negotiation), while IKEv2 (RFC 7296) simplifies this and adds NAT Traversal, reauthentication, and MOBIKE features. AWS VPN supports both IKEv1 and IKEv2, but **recommends IKEv2**. IKEv2 has fewer handshake messages for faster tunnel establishment and has Dead Peer Detection (DPD) built-in for reliable failure detection.

## AWS Site-to-Site VPN Architecture

AWS Site-to-Site VPN automatically creates **two IPsec tunnels** between Customer Gateway (CGW, on-premises router) and AWS VPN endpoint. The two tunnels connect to AWS VPN endpoints in different AZs, defending against single-AZ failure on the AWS side.

```
[On-premises CGW]
       │
       ├── IPsec Tunnel 1 (IKEv2) ──── AWS VPN Endpoint 1 (AZ-a) ──┐
       │   (169.254.10.0/30 Link-net)                                 │
       │                                                             ├── VGW or TGW
       └── IPsec Tunnel 2 (IKEv2) ──── AWS VPN Endpoint 2 (AZ-b) ──┘
           (169.254.11.0/30 Link-net)

Each tunnel: Maximum 1.25Gbps throughput
```

Both tunnels can remain active simultaneously. Using BGP, you can advertise identical routes on both tunnels and split traffic (Active-Active). Using Static Routes, AWS selects one tunnel as primary and one as backup (Active-Passive).

> 🔍 **Deeper Dive**: AWS VPN's tunnel inside IP (Inside CIDR) is allocated from the 169.254.0.0/16 range. This is link-local addressing (RFC 3927) that cannot be routed over the internet. BGP sessions are established between these link-local addresses. Available Inside CIDR ranges for AWS VPN are from 169.254.0.0/30 to 169.254.255.252/30 except for some AWS-reserved subnets. Enterprises managing multiple VPN connections must systematically allocate Inside CIDR to prevent collisions.

## Static vs BGP: What the Exam Wants

AWS Site-to-Site VPN supports both static and BGP dynamic routing.

**Static Routing**: Manually input on-premises CIDR in the AWS console and manually configure static routes pointing to VPC CIDR on the on-premises router. When on-premises network changes, both sides must manually update. No automatic failover on tunnel failure.

**BGP Dynamic Routing**: Establish eBGP sessions between on-premises router and AWS VPN endpoint. On-premises advertises its CIDR via BGP, and AWS advertises VPC CIDR. On-premises network changes are automatically reflected. BGP automatically selects alternative paths on tunnel failure.

> ⚠️ **Pitfall**: Even with BGP, the two tunnels don't automatically become Active-Active ECMP. VPN connected to VGW operates only one tunnel as active (Active-Passive). **Only when connected to TGW and ECMP explicitly enabled** do both tunnels become simultaneously active, sharing traffic. On SAP-C02, in scenarios like "we need more bandwidth," replacing VGW with TGW is sometimes the correct answer.

On SAP-C02, BGP is almost always the correct answer. If you see keywords "automatic failover," "automatic route change reflection," or "dynamic routing," it's BGP.

## TGW + ECMP: Linear VPN Bandwidth Scaling

Single VPN connection maximum bandwidth is 2 tunnels × 1.25Gbps = 2.5Gbps. If this is insufficient, leverage TGW's ECMP capability.

ECMP (Equal-Cost Multi-Path) distributes traffic when multiple paths with equal cost exist to the same destination. Enable ECMP on TGW and add multiple VPN connections using the same BGP ASN; tunnels from each VPN connection are included in the ECMP group and traffic distributes.

```
On-premises Router-A ─── VPN Connection 1 (Tunnel 1, Tunnel 2) ──┐
On-premises Router-B ─── VPN Connection 2 (Tunnel 1, Tunnel 2) ──┤
On-premises Router-C ─── VPN Connection 3 (Tunnel 1, Tunnel 2) ──┼── TGW (ECMP)
On-premises Router-D ─── VPN Connection 4 (Tunnel 1, Tunnel 2) ──┘

Theoretical Maximum: 4 connections × 2 tunnels × 1.25Gbps = 10Gbps
Practical Usage: Approximately 8~10Gbps (considering ECMP hash unevenness)
```

> 💡 **Related Theory**: ECMP's traffic distribution is based on **flow hash**. Compute hash value from source IP, destination IP, source port, destination port, and protocol combination; select path based on this value. Identical flows (same 5-tuple) always use the same path, guaranteeing packet order. However, when flow count is low (e.g., single FTP transfer), ECMP effectiveness is minimal. This is a fundamental ECMP limitation covered by RFC 2992.

> 🎯 **Scenario**: A media streaming company transfers 100GB of rendering results every night from on-premises rendering farm to AWS S3. Current single VPN connection maxes out 2.5Gbps but transfer time is too long. DX takes months to provision. Quick solution: migrate to TGW and configure 4 VPN connections with ECMP for theoretically 10Gbps expansion. Additional cost from 4 VPN connection hourly charges is much faster than DX provisioning time.

## Accelerated Site-to-Site VPN: Leveraging Global Backbone

Regular Site-to-Site VPN uses public internet paths from on-premises router through the internet to AWS VPN endpoint. From Korea to us-east-1 VPN endpoint through numerous ISP hops creates unstable latency.

**Accelerated Site-to-Site VPN** uses AWS Global Accelerator's Anycast IP as the VPN tunnel's AWS-side endpoint. When on-premises internet traffic reaches the nearest AWS edge location, it immediately enters the AWS global backbone. Subsequently, it's delivered through the AWS backbone to the TGW in the destination region.

```
[Korea On-premises] ──Internet~~ [Seoul AWS Edge] ──AWS Backbone── [us-east-1 TGW]
                  (Few hops)  (Immediate backbone entry)  (Stable, low latency)

Regular VPN:
[Korea On-premises] ~~Internet~~ Numerous ISP hops ~~ [us-east-1 VPN Endpoint]
                  (Many hops, high latency variation)
```

> 💡 **Related Theory**: Global Accelerator uses BGP Anycast. AWS advertises two identical static IPv4 addresses from multiple edge locations worldwide. Internet routers use BGP shortest path algorithm to select the nearest edge location. This differs from DNS-based routing (Route 53) in that there's no TTL cache, allowing immediate path changes. Accelerated VPN applies this mechanism to IPsec tunnel endpoints.

Accelerated VPN constraints: **Only supports VPN connected to TGW**. Cannot be used with VGW-connected VPN. Incurs additional cost (Global Accelerator hourly charge + data processing fee).

## DPD (Dead Peer Detection): Tunnel Liveness Detection

DPD built into IKEv2 (RFC 3706) periodically checks whether VPN peers are alive. AWS VPN's default DPD timeout is 30 seconds. Without DPD packet response, IKE session terminates and tunnel re-establishes or switches to alternate tunnel.

> 🔍 **Deeper Dive**: DPD operates in "On-Demand" and "Periodic" modes. On-Demand sends DPD packets only after some time without traffic. Periodic sends them always periodically. AWS VPN uses On-Demand DPD. This can slow peer failure detection on tunnels with no traffic. Maintaining constant traffic or configuring on-premises routers to support Periodic DPD is recommended.

## VPN Redundancy Patterns: What Defends Against What

| Configuration | Defense Scope | SLA Level | Cost |
|------|-----------|----------|------|
| Single CGW + AWS 2 tunnels | AWS-side AZ failure only | Medium | Low |
| 2 CGWs + 4 tunnels + BGP | AWS-side + on-premises router failure | High | Medium |
| DX Primary + VPN Backup | Auto VPN switch on DX failure | DX SLA + VPN backup | DX + VPN |

2-CGW + 4-tunnel configuration is recommended because it defends against on-premises CGW (router) itself failing. On single-CGW configuration, CGW router failure breaks both AWS tunnels.

```
[On-premises Router-A] ── Tunnel 1 ──┐
                    └── Tunnel 2 ──┤
                                   ├── TGW (BGP ECMP)
[On-premises Router-B] ── Tunnel 3 ──┤
                    └── Tunnel 4 ──┘

Router-A failure → Tunnels 1, 2 down → BGP auto-switches to Tunnels 3, 4
```

> 📚 **Case Study**: In 2021, a global manufacturer experienced on-premises BGP router restarting due to software bug during on-premises → AWS VPN connection. Single-CGW configuration caused complete VPN disconnection, taking about 4 minutes to re-establish. During those 4 minutes, production line control system ↔ AWS communication was severed, triggering alarms. Company subsequently changed to 2-CGW configuration and operated with BGP ECMP so single router restart automatically switches traffic to the other CGW.

## Client VPN: VPC Access for Remote Employees

While Site-to-Site VPN connects data center to AWS, AWS Client VPN is a solution for individual employee laptops and mobile devices to access VPCs.

Client VPN is based on **OpenVPN protocol**. Clients install AWS-provided OpenVPN client or compatible client, download configuration file, and connect to VPN server (Client VPN Endpoint).

### Three Authentication Methods

**1. Active Directory Authentication**: Integrates with AWS Directory Service or on-premises AD. Users log in with domain credentials.

**2. SAML 2.0 Federation (IAM Identity Center)**: Integrates with SAML 2.0-supporting IdP (Okta, Azure AD, etc.). VPN authentication via SSO. On SAP-C02, if "minimize operational burden + SSO + Client VPN," this combination is correct.

**3. Mutual Certificate Authentication (Mutual TLS)**: Verify both server and client certificates. Authentication via certificate only without user ID/password. Strongest authentication but certificate management burden exists.

> 💡 **Related Theory**: mTLS (Mutual TLS, RFC 8446) requests client certificates during TLS handshake. Regular TLS has server present certificate only and client authenticate with ID/password. mTLS only allows connection from devices where client certificate isn't stolen, effectively blocking unauthorized devices from accessing in BYOD environments. Manage X.509 certificates (RFC 5280) via PKI (Public Key Infrastructure).

### Client VPN Cost Structure

Client VPN costs consist of two elements: **Endpoint Hourly Charge**: charged per AZ per hour Client VPN Endpoint exists. **Connection Hourly Charge**: active client connection count × connection time. This structure means costs accrue even if no users unless Endpoint is deleted.

> ⚠️ **Pitfall**: Client VPN Endpoint Associates with subnets to place in AZ. For availability in each AZ, **associate subnets across multiple AZs**. Associating only single-AZ subnet makes Client VPN unusable if that AZ fails. In "high-availability Client VPN" scenario on exams, multi-AZ association is a correct configuration element.

## VGW vs TGW: VPN Connection Hub Selection

| Item | VGW (Virtual Private Gateway) | TGW (Transit Gateway) |
|------|-------------------------------|----------------------|
| VPC Connection | Single VPC | Multiple VPCs |
| ECMP Support | Not supported (Active-Passive) | Supported (Active-Active) |
| Accelerated VPN | Not supported | Supported |
| Maximum Bandwidth | ~1.25Gbps (single tunnel active) | Sum of multiple tunnels |
| BGP AS | AWS fixed | Configurable |
| Cost | Low | TGW + VPN connection cost |

Typical SAP-C02 VPN question answer flow: "single VPC, bandwidth irrelevant → VGW", "multiple VPCs or ECMP or Accelerated → TGW".

## IPsec vs SSL VPN: Client VPN Protocol Selection

AWS Client VPN uses OpenVPN (SSL/TLS-based). AWS Site-to-Site VPN uses IPsec.

| Item | IPsec (Site-to-Site VPN) | SSL/TLS (Client VPN) |
|------|--------------------------|----------------------|
| Layer | L3 (IP Layer) | L4/L7 |
| Firewall Traversal | Requires UDP 500/4500 | TCP 443 usable |
| Configuration Complexity | Medium | Low (client app) |
| Performance | High | Medium |
| Use Case | Fixed inter-site connection | Remote individual user |

> 🔍 **Deeper Dive**: OpenVPN operates on UDP 1194 or TCP 443. Even if corporate firewalls block UDP, TCP 443 is same port as HTTPS, almost always allowed by networks. AWS Client VPN uses TCP 443 by default. In contrast, IPsec uses IKE on UDP 500, NAT-T on UDP 4500 in NAT environments. In strict firewall environments, OpenVPN is easier to traverse.

## Comparison with Other Cloud VPNs

| Item | AWS Site-to-Site VPN | GCP Cloud VPN | Azure VPN Gateway |
|------|----------------------|---------------|-------------------|
| Tunnel Count | 2 (automatic) | HA VPN: 2 | Active-Active: 2 |
| Maximum Throughput/Connection | 1.25Gbps/tunnel | 3Gbps/tunnel (HA) | 10Gbps (VpnGw5) |
| BGP Support | Supported (eBGP) | Supported | Supported |
| ECMP | TGW connection | Default supported | Supported |
| Global Acceleration | Accelerated VPN | Default global backbone | ExpressRoute + VPN |
| Protocol | IKEv1/v2 | IKEv2 | IKEv2 |

> 📚 **Case Study**: A SaaS company building multi-cloud environment using both AWS and GCP simultaneously. Connected IPsec tunnel between AWS Site-to-Site VPN and GCP Cloud VPN. Both clouds support IKEv2 and BGP, enabling interoperability. However, GCP's HA VPN supports 3Gbps per tunnel versus AWS's 1.25Gbps, requiring AWS-side ECMP configuration.

## Practical CLI: Complete VPN Configuration

```bash
# Create Customer Gateway (on-premises router IP and ASN)
aws ec2 create-customer-gateway \
  --type ipsec.1 \
  --bgp-asn 65000 \
  --public-ip 203.0.113.1 \
  --device-name "OnPrem-Router-A"

# VPN connected to TGW (use TGW for ECMP)
aws ec2 create-vpn-connection \
  --type ipsec.1 \
  --customer-gateway-id cgw-aaa \
  --transit-gateway-id tgw-xxx \
  --options '{
    "EnableAcceleration": true,
    "StaticRoutesOnly": false,
    "TunnelOptions": [
      {
        "TunnelInsideCidr": "169.254.10.0/30",
        "PreSharedKey": "MySecretKey1",
        "IKEVersions": [{"Value": "ikev2"}],
        "DPDTimeoutAction": "restart",
        "DPDTimeoutSeconds": 30
      },
      {
        "TunnelInsideCidr": "169.254.11.0/30",
        "PreSharedKey": "MySecretKey2",
        "IKEVersions": [{"Value": "ikev2"}],
        "DPDTimeoutAction": "restart",
        "DPDTimeoutSeconds": 30
      }
    ]
  }'

# Verify TGW ECMP support
aws ec2 describe-transit-gateways \
  --transit-gateway-ids tgw-xxx \
  --query 'TransitGateways[].Options.VpnEcmpSupport'

# Create Client VPN Endpoint
aws ec2 create-client-vpn-endpoint \
  --client-cidr-block 10.100.0.0/22 \
  --server-certificate-arn arn:aws:acm:us-east-1:ACCT:certificate/SERVER-CERT \
  --authentication-options '[{
    "Type": "federated-authentication",
    "FederatedAuthentication": {
      "SAMLProviderArn": "arn:aws:iam::ACCT:saml-provider/Okta"
    }
  }]' \
  --connection-log-options '{"Enabled": true, "CloudwatchLogGroup": "/client-vpn-logs"}' \
  --dns-servers 10.0.0.2

# Associate Client VPN Endpoint to multi-AZ subnets
aws ec2 associate-client-vpn-target-network \
  --client-vpn-endpoint-id cvpn-endpoint-xxx \
  --subnet-id subnet-az-a

aws ec2 associate-client-vpn-target-network \
  --client-vpn-endpoint-id cvpn-endpoint-xxx \
  --subnet-id subnet-az-b
```

Site-to-Site VPN is the most frequently used hybrid connectivity solution in AWS for quick deployment, VPN backup, and immediate bandwidth scaling as DX alternative. The essence of SAP-C02 is identifying scenario requirements (bandwidth, latency, redundancy level, user count) and selecting the correct combination of VGW vs TGW, Static vs BGP, regular vs Accelerated, Site-to-Site vs Client VPN.

---

## 📝 연습 문제

**문제 1.** Emergency situation: must connect on-premises data center and AWS immediately (within minutes). Direct Connect provisioning is underway but 6 weeks remain. Most suitable temporary connection:

A) Direct Connect Hosted Connection (small)
B) AWS Site-to-Site VPN + BGP
C) AWS Client VPN (deploy to all company employees)
D) VPC Peering

**정답: B**
Explanation: Site-to-Site VPN can be created within minutes via console; once on-premises router IPsec/IKEv2 is configured, connection occurs within hours. BGP minimizes routing configuration changes when later migrating to DX. Hosted Connection still takes weeks (A incorrect). Client VPN is for individual user terminals, not site-to-site connection (C incorrect). VPC Peering is for AWS internal VPC connectivity, not on-premises (D incorrect).

---

**문제 2.** Currently connected via single Site-to-Site VPN (VGW). Peak-hour bandwidth reaches 2Gbps causing congestion. DX planned 3 months out. Immediately increase bandwidth:

A) Increase existing VPN MTU to 9001
B) Replace VGW with TGW and add 2 more VPN connections, enable ECMP
C) Add 2 more tunnels to existing VPN
D) Bypass traffic through CloudFront to on-premises

**정답: B**
Explanation: VGW doesn't support ECMP, operating only Active-Passive with effectively max 1.25Gbps. Replacing with TGW and enabling ECMP activates tunnels simultaneously, summing bandwidth. 2 VPN connections (2 tunnels each) = max 5Gbps. MTU increase (A) doesn't increase throughput itself. Adding tunnels to existing VPN (C) is impossible since max 2 tunnels per Site-to-Site VPN. CloudFront (D) is CDN unrelated to on-premises VPN bandwidth scaling.

---

**문제 3.** 1,000 remote employees distributed globally need secure VPC internal application access. Already using Okta for SSO. Minimize operational burden:

A) Site-to-Site VPN + employee home router CGW configuration
B) AWS Client VPN + SAML 2.0 (Okta IdP) authentication
C) Bastion Host + SSH tunneling
D) AWS VPN + AD authentication (deploy AD servers each region)

**정답: B**
Explanation: Client VPN is for individual user terminals and uses OpenVPN client. SAML 2.0 integration connects with Okta SSO so employees authenticate VPN with existing Okta credentials. No separate user account management needed, minimizing operational burden. Site-to-Site VPN is for fixed inter-site connection; configuring home router CGW is impractical (A incorrect). Bastion Host has high management burden and poor scalability (C incorrect). Deploying AD servers each region incurs AD replication/management burden (D incorrect).

---

**문제 4.** Company operates AWS Site-to-Site VPN and Direct Connect together, using DX normally and auto-switching to VPN on DX failure. Control path priority for AWS → on-premises (inbound) traffic via BGP:

A) Mark DX as "Primary" in AWS console
B) Set high Local Preference on on-premises BGP for DX path
C) Use AS Path Prepending on VPN side to lengthen path so AWS prefers DX
D) Enable BFD on DX, disable on VPN

**정답: C**
Explanation: AWS → on-premises direction path selection is determined by AWS-side BGP. Cannot adjust AWS Local Preference, so on-premises makes VPN-side advertised path AS Path longer (Prepending), inducing AWS to prefer DX path with shorter AS Path. AWS follows standard BGP behavior preferring shorter AS Path. On-premises BGP Local Preference (B) controls reverse direction. A is non-existent feature. BFD (D) is failure detection speed, not path priority.

---

**문제 5.** Created AWS Client VPN Endpoint in us-east-1 and Associated to only single-AZ subnet (us-east-1a). What risk:

A) Max concurrent connection count decreases
B) us-east-1a AZ failure disconnects all Client VPN connections
C) Cost doubles
D) BGP routing doesn't work

**정답: B**
Explanation: Client VPN Endpoint availability depends on Associated subnet's AZ. Associating only single-AZ subnet means service completely stops if that AZ fails. Minimum 2+ AZ subnet associations required for high availability. Max connection count depends on Endpoint settings, unrelated to AZ count (A incorrect). Cost corresponds to associated subnet count and connection time; AZ redundancy doesn't necessarily double cost (C incorrect). Client VPN doesn't use BGP (D incorrect).

---

**문제 6.** Global corporation connecting Korea on-premises to us-east-1 VPC via VPN. Korea~USA internet latency unstable, VPN performance inconsistent. Most suitable solution:

A) Upgrade to faster internet circuit
B) AWS Accelerated Site-to-Site VPN (TGW connection)
C) Place CloudFront in front of VPN
D) Reduce VPN MTU to prevent packet fragmentation

**정답: B**
Explanation: Accelerated Site-to-Site VPN uses Global Accelerator Anycast to immediately enter AWS global backbone from nearest Korea AWS edge location (Seoul). Only Korea~Seoul edge segment traverses internet; Seoul~us-east-1 segment goes through AWS backbone ensuring stable latency. Faster internet circuit (A) doesn't resolve internet path latency variation itself. CloudFront (C) is HTTP/HTTPS content delivery service unrelated to IPsec VPN. MTU reduction (D) reduces fragmentation but doesn't resolve latency variation. Accelerated VPN only available on TGW-connected VPN.

---
