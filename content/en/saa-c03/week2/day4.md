# Day 4 - VPC Peering, Transit Gateway, VPC Endpoint: Connections Beyond the VPC

You start with a single VPC, and soon the next questions come up. "I have to communicate with another VPC," "I have to connect to an on-premises DC," "I want private access to S3." Each has a different answer, and the criteria for choosing that answer are a regular SAA exam scenario. If you can clearly map the trade-offs of these four connection methods — Peering, Transit Gateway, VPC Endpoint, and VPN/Direct Connect — half of the network area of the exam is solved.

In this article we look at the *when, why, and which trade-offs* of each connection method together. Rather than a simple keyword mapping, we take one more pass at "why is this the answer for this scenario."

## VPC Peering: A 1:1 Direct Connection

Peering connects two VPCs with **1:1 private routing**. Same region, same account, different region, and different account are all possible.

```
[ VPC A: 10.0.0.0/16 ] ──── pcx-xxx ──── [ VPC B: 10.1.0.0/16 ]
       │                                          │
   Add routing:                              Add routing:
   10.1.0.0/16 → pcx-xxx                     10.0.0.0/16 → pcx-xxx
```

Characteristics:

- **non-transitive**: even if A↔B and B↔C exist, A↔C is not possible. Every pair must be peered individually.
- **CIDR overlap forbidden**: if they overlap, routing is impossible.
- **DNS resolution option**: when enabled, the private hostnames of the peer VPC resolve.
- **Cost**: peering itself is free. Only cross-AZ/region data transfer is charged.

> ⚠️ **Pitfall**: Peering's non-transitive nature means that connecting all N VPCs requires N(N-1)/2 peerings. For 10 VPCs, that's 45 peerings. An unmanageable level. This is why Transit Gateway is needed. Also, Peering supports *MTU 9001 (jumbo frame)*, but traffic that goes over the internet is fragmented to 1500, so on large data transfers the MTU difference affects throughput.

> 🔍 **Going deeper**: Peering is internally implemented as *static route table entries*. When two VPCs are peered, the AWS Mapping Service makes the ENI mapping tables of the two VPCs mutually referenceable. But the reason peering itself has no *transitive route* is a *security boundary* — if VPC A automatically trusts VPC B's other peers just because it peered with B, a *transitive trust* vulnerability arises. AWS explicitly blocks this to enforce security. The same principle applies to IAM's *cross-account role assumption* — even if A can assume B's role, B's ability to assume C's role is not automatically delegated to A.

> 💡 **Related theory**: Peering's non-transitive nature is directly tied to graph theory's *complete graph K_n*. Connecting all n nodes requires n(n-1)/2 edges, and this is the limit of a *fully-connected mesh* rather than a *scale-free network*. The hub-and-spoke topology (TGW) is a *star graph* requiring only n-1 edges, dropping complexity from *O(n²) → O(n)*.

## Transit Gateway: A Routing Hub

TGW connects **multiple VPCs and on-premises in a hub-and-spoke**. Released in 2018. It operates on top of AWS Hyperplane for 60+ Tbps of aggregate throughput.

```
        [ VPC A ]
            ↑
[ VPC B ] ─┼─ TGW ─┬─ [ VPC C ]
            ↓       └─ [ On-Prem (VPN/DX) ]
        [ VPC D ]
```

- **Transitive routing**: A→TGW→B works automatically.
- **Up to 5000 attachments**: VPC, VPN, DX, Peering, Connect, etc.
- **Route Tables**: the TGW itself can separate into multiple routing domains (e.g., prod/dev separation).
- **Multi-region peering**: build a global backbone via peering between TGWs.

| Comparison | VPC Peering | Transit Gateway |
|------|------------|-----------------|
| Topology | 1:1 | Hub-Spoke |
| Transitive | No | Yes |
| Scalability | Low (N² explosion) | 5000 attachments |
| Cost | Free + DT | Per hour + per GB |
| Complexity | Simple | Requires route table design |
| When to use | 2-3 VPCs | Many VPCs + on-premises |

> 📚 **Case study**: An AWS-internal case — in the 2018 re:Invent announcement, before TGW's release, one customer operated 100+ VPCs, and full-mesh peering reached about 4,950, so no one could understand the routing topology. After switching to TGW, it was simplified to 100 attachments + 5 route tables. This case is a regular example in TGW marketing. In a similar case, in 2020 a global insurer built a global backbone with TGW + TGW Peering across 80+ VPCs in 30 countries and announced it had cut MPLS circuit costs by 80%.

> 💡 **Related theory**: TGW's hub-and-spoke is a classic of network topology design. Full mesh has the best redundancy but its cost grows as N²; a tree has low cost but a SPOF; hub-and-spoke balances the two as long as the hub is well built. AWS Hyperplane resolves the hub's SPOF risk with SDN distribution. Telecom carriers' *Multiprotocol Label Switching* (MPLS, RFC 3031) also implements the same hub-and-spoke model on top of IP routing, and TGW can be seen as the cloud version of MPLS.

> 🔍 **Going deeper**: A TGW's *route table* can exist in several within a single TGW, and each attachment can be connected to a different route table. This is the *route domain* separation feature. Example: connect prod attachments to the prod route table and dev to the dev route table, and routing between prod ↔ dev is automatically blocked. In the same pattern, if you leave a *shared service VPC* routable to both sides, you can share common tools (Active Directory, log collection) while keeping the workloads isolated. This *segmented hub-and-spoke* pattern is the standard recommended by the SRA.

> ⚠️ **Pitfall**: If you turn on *appliance mode* per attachment on a TGW, *flow stickiness* is maintained (the same flow is routed to the same ENI/AZ). If you don't turn it on, traffic is distributed via ECMP (Equal-Cost Multi-Path), and passing through a *stateful inspection appliance* (e.g., a virtual firewall) can cause the response to go over a different path and break conntrack. It doesn't come up often on the exam, but it's a practical detail.

## VPC Endpoint: Accessing AWS Services Without Going Through the Internet

For an instance in a Private subnet to access S3, it has to go out to the internet through a NAT GW and come back — expensive and roundabout. The alternative is a **VPC Endpoint**. Direct, private access to AWS services from inside the VPC.

There are two kinds, and this is the part most often confused on the exam.

### Gateway Endpoint: S3 and DynamoDB Only

- Adds a route with a prefix list to the route table.
- **Free**.
- Supports **only two services**, S3 and DynamoDB.
- Same region only.

```
Automatically added to the Route Table:
  pl-XXXX (S3 prefix list) → vpce-xxxx (Gateway Endpoint)
```

### Interface Endpoint (PrivateLink): Everything Else

- Creates an ENI in the VPC and DNS-maps it to the AWS service.
- **Charged per hour + per GB**.
- Supports nearly all AWS services + ISV SaaS.
- Same region + Cross-region (GA in 2023).

| Item | Gateway Endpoint | Interface Endpoint |
|------|-----------------|-------------------|
| Supported services | S3, DynamoDB | 100+ AWS services + ISV |
| Cost | Free | ~$0.01/hour + per GB |
| Mechanism | Routing prefix list | ENI + Private IP + DNS |
| SG applies | No | Yes |
| DNS | Automatic | private DNS option |

> 🔍 **Going deeper**: An Interface Endpoint is effectively a kind of **AWS PrivateLink**. PrivateLink is a mechanism for private L4 exposure through an ENI, and it uses the same model whether it's an AWS service or an ISV service. Many SaaS providers — Datadog, Snowflake, MongoDB Atlas — offer PrivateLink endpoints. This is the standard pattern for "communicating with a SaaS without going through the internet inside AWS." PrivateLink is internally a model that exposes an *NLB* as an endpoint service, and when both sides connect over the same PrivateLink endpoint, traffic is delivered in an NLB → ENI flow.

> 💡 **Related theory**: PrivateLink is a concept similar to a *service mesh's east-west traffic*, but at a different layer. A service mesh (Istio, Linkerd) handles mTLS and retry/timeout with L7 proxies (Envoy), whereas PrivateLink is an L4 TCP tunnel. The two can be used together — a pattern where PrivateLink creates a secure tunnel between VPCs and a service mesh lays L7 security and observability on top of it. This is the standard architecture of *zero-trust microservices*.

> 📚 **Case study**: After the 2019 Capital One incident (see Day 1), many companies strengthened their SSRF/exfiltration defenses with IMDSv2 + egress blocking. At that time, the combination of an S3 Gateway Endpoint + a strong endpoint policy + blocking all outbound NAT in the VPC became the standard pattern for "not being able to send data outside the VPC." In 2023, a government agency forced all AWS services to be accessed only via Interface Endpoints and removed the NAT GW entirely — this *fully private VPC* pattern is becoming the new standard in the government and financial sectors.

### Endpoint Policy: Restricting Permissions Per Endpoint

You can attach an IAM-style policy to an endpoint. Example: "through this VPC Endpoint, only our company's S3 buckets can be accessed."

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*"
  }]
}
```

Without this policy, any S3 bucket (including third-party ones) can be accessed through the endpoint. It's a core tool for defending against data exfiltration.

> 🔍 **Going deeper**: The four policies — Endpoint Policy + IAM Identity Policy + S3 Bucket Policy + (Org SCP) — are all *cross-evaluated*. If there's an explicit Deny in any one place, it's denied. Allow is needed in all places. Thanks to this *layered policy*, you can block a bypass path where a different IAM identity in a different account accesses an *S3 bucket you didn't intend* through your endpoint. The *VPC Endpoint Policy with aws:PrincipalOrgID*, released in 2020, made possible the strongest blocking condition of "only identities belonging to my Org."

> ⚠️ **Pitfall**: If you don't apply an Endpoint Policy, the default is *access to all S3 buckets*. In other words, merely creating the endpoint does not stop data exfiltration — you should always narrow it down to *my buckets only* or *my Org's buckets only* with an explicit endpoint policy.

## AWS Site-to-Site VPN

Connects on-premises ↔ AWS with an IPsec VPN. Two IPsec tunnels are configured for automatic HA.

- **CGW (Customer Gateway)**: a representation of the on-premises VPN device.
- **VGW (Virtual Private Gateway)** or **TGW**: the AWS-side endpoint.
- BGP or static routing.
- Throughput: ~1.25 Gbps per tunnel.

Fast configuration and low cost are the advantages. The downsides are latency variability and throughput limits because it goes over the public internet.

> 🔍 **Going deeper**: AWS VPN uses *IPsec/IKEv2* and supports the cipher suites recommended by NIST SP 800-77 (AES-256-GCM, SHA-2, DH Group 14+). *Accelerated Site-to-Site VPN* (released in 2020) sends VPN traffic to the nearest Global Accelerator edge and then delivers it over the AWS backbone to improve throughput and jitter. When large throughput is needed, you can bundle multiple tunnels with *ECMP* (the TGW + multiple tunnels pattern).

> 💡 **Related theory**: IPsec (RFC 4301, 2005) has a *transport mode* (host-to-host) and a *tunnel mode* (gateway-to-gateway), and AWS VPN uses tunnel mode. IKEv2 (RFC 7296) provides modern features compared to IKEv1 — fast rekey, NAT-T (NAT traversal), MOBIKE (mobile/multihoming). The same standard is compatible across nearly all firewall vendors — Cisco ASA, Palo Alto, FortiGate, OPNsense.

## Direct Connect: A Dedicated Line

A physical dedicated line (1/10/100 Gbps) directly connected to AWS. You place routers on both sides at an AWS Direct Connect Location and cross-connect.

- **Latency stability**: variability is 1/10 or less compared to going over the internet.
- **Bandwidth**: 1/10/100 Gbps dedicated, or a partner's 50/100/200/300/400/500 Mbps sub-rate.
- **Hybrid standard**: when you require high volume, low latency, and consistency.
- Downsides: installation takes weeks to months, and cost.

| Comparison | VPN | Direct Connect |
|------|-----|----------------|
| Medium | Public internet + IPsec | Dedicated fiber |
| Installation | On the order of hours | On the order of weeks to months |
| Throughput | ~1.25 Gbps/tunnel | 1-100 Gbps |
| Latency | Variable | Consistent |
| Encryption | Default (IPsec) | Separate MACsec option |
| Cost | Low | High |

> 💡 **Related theory**: The two models of hybrid cloud — VPN (a logical tunnel) and Direct Connect (a physical circuit) — have clear trade-offs. NIST SP 800-77 (IPsec VPN) and ITU-T G.694.1 (WDM) are the standards for each technology. Large financial and telecom companies use a triple pattern of DX 1Gbps × 2 (HA) + VPN backup as their standard. *MACsec* (IEEE 802.1AE) is L2 encryption that protects the DX physical circuit, and it's been offered as an option on AWS DX since 2022.

> 🔍 **Going deeper**: DX is divided into a *Public VIF* and a *Private VIF*. A Private VIF connects directly to a VPC; a Public VIF connects directly to AWS Public Services (S3, DynamoDB Public Endpoint). A *Transit VIF* (released in 2019) connects to a TGW so that a single DX circuit can reach dozens of VPCs at once. A *Direct Connect Gateway* is a global routing entity that lets a single DX circuit connect to VPCs in multiple regions.

> 📚 **Case study**: In 2019, a Korean financial group published a case where it made two 10Gbps DX circuits between headquarters ↔ the AWS Seoul region redundant with different carriers and configured a triple layer on top of it with a VPN backup. The cost was hundreds of millions of won per month, but it satisfied the financial regulatory requirement that not even a single outage should impact the business. An ordinary SaaS doesn't need to go this far, and something like *1 DX + VPN backup* is the standard.

## ClientVPN: Per-User Remote Access

Where the VPN above was site-to-site, **ClientVPN** is user device ↔ AWS VPC. A TLS-based OpenVPN protocol. Integrates with SAML/AD authentication.

Usage exploded due to the surge in remote work during the COVID-19 era, and it became the standard tool for accessing internal infrastructure.

> 🔍 **Going deeper**: Because ClientVPN uses the OpenVPN protocol, it's compatible with any standard OpenVPN client (macOS Tunnelblick, Windows OpenVPN GUI, iOS/Android apps). With SAML integration, SSO is possible from *Okta, Azure AD, Google Workspace*, and MFA is enforced on the IdP side. If you turn on the *split-tunnel* option, only VPC traffic goes through the tunnel while ordinary internet traffic goes out directly, improving throughput and user experience. That said, *full-tunnel* is more secure (all traffic under company control).

> 💡 **Related theory**: ClientVPN is the cloud version of *VPN-based remote access*, but in the Zero Trust era even this is classified as *legacy*. ZTNA solutions like Cloudflare Access, Tailscale, and Twingate provide the same function *VPN-less* while adding *device posture check* and *continuous authentication*. AWS itself entered this space with Verified Access (released in 2023).

## Wrapping Up

| Scenario | Solution |
|---------|--------|
| Directly connect 2 VPCs | Peering |
| Many VPCs + on-premises | Transit Gateway |
| Private access to S3/DynamoDB | Gateway Endpoint (free) |
| Private access to another AWS service or SaaS | Interface Endpoint (PrivateLink) |
| Fast on-premises connection | Site-to-Site VPN |
| High-volume, low-latency hybrid | Direct Connect |
| User remote access | ClientVPN (or Verified Access) |
| Global VPC backbone | TGW Peering or Cloud WAN |

Lodge this table in your head and just seeing the first line of a scenario narrows the candidates to two. After that, compare cost, complexity, and HA requirements to settle on the final answer. Finally, one more thing — *AWS Cloud WAN*, released in 2021, is TGW's global backbone extension, and it lets you manage multi-region, multi-account networks as *policy as code*. At the scale of dozens of regions and hundreds of accounts, Cloud WAN is far simpler to operate than a TGW + TGW Peering combination.

---

## 📝 연습 문제

**문제 1.** A company has to connect all of 8 VPCs and 2 on-premises DCs. What is the most appropriate solution?

A) Full-mesh VPC Peering across all
B) Transit Gateway hub-and-spoke
C) VPC Endpoint
D) NAT Gateway

**정답: B**
해설: A full mesh of 8 VPCs is 28 peerings, and adding on-premises makes it unmanageable. TGW consolidates it into 10 attachments in a hub-and-spoke. Route table separation also enables prod/dev isolation. A larger organization (dozens of regions) can consider Cloud WAN.

---

**문제 2.** You need private access to S3 from a Private subnet and want to minimize cost?

A) NAT Gateway
B) S3 Gateway Endpoint (free)
C) Interface Endpoint
D) VPN

**정답: B**
해설: S3 and DynamoDB support the Gateway Endpoint, which is free. It automatically adds a prefix list to the route table. Since data flows over the AWS internal network without going through the internet, it also saves the NAT data transfer cost. Even with just 1TB per month flowing to S3, you can save the roughly $45/TB NAT data transfer cost with a Gateway Endpoint.

---

**문제 3.** To communicate between Datadog SaaS and AWS without going through the internet?

A) VPC Peering
B) Interface Endpoint (PrivateLink)
C) Gateway Endpoint
D) Transit Gateway

**정답: B**
해설: Private connection with an external ISV SaaS is a PrivateLink Interface Endpoint. When Datadog publishes an endpoint service, an ENI is created in our VPC for private communication. Gateway is S3/DynamoDB only, and Peering is only between VPCs. The same pattern applies to nearly all major SaaS — Snowflake, MongoDB Atlas, Databricks.

---

**문제 4.** What is a limitation of VPC Peering?

A) Only the same account is possible
B) Non-transitive (even with A-B and B-C, A-C is not possible)
C) Only the same AZ is possible
D) It's not free

**정답: B**
해설: Peering is 1:1 and doesn't transit. This is why a full mesh explodes as N². TGW solves it with transitive routing. Peering itself is free (only data transfer is charged), and both different accounts and different regions are possible.

---

**문제 5.** You need consistent 1Gbps bandwidth and low latency between an on-premises DC and AWS. What is the most appropriate solution?

A) Site-to-Site VPN
B) Direct Connect
C) ClientVPN
D) Internet Gateway

**정답: B**
해설: Consistent bandwidth and low latency = a dedicated line, Direct Connect. VPN goes over the public internet so it varies. Because DX installation takes a long time, the standard pattern is to use VPN temporarily and cut over after DX is complete. If you need stronger security (L2 encryption), turn on the MACsec option, and if you need HA, a triple configuration of DX from two different carriers + VPN backup.

---

**문제 6.** To prevent access to arbitrary S3 buckets through an Interface Endpoint?

A) Block the NAT GW
B) Allow only specific buckets with an Endpoint Policy
C) Block Route 53
D) Use only an IAM policy

**정답: B**
해설: The Endpoint Policy is the last line of defense for access through the endpoint. Core to preventing data exfiltration. Because an IAM policy alone leaves the possibility of a bypass by another account's identity, apply the endpoint policy together. The `aws:PrincipalOrgID` condition released in 2020 made "only identities belonging to my Org" possible, making it even stronger.

---

**문제 7.** Which of the following is NOT possible as a TGW attachment?

A) VPC
B) Site-to-Site VPN
C) Direct Connect Gateway
D) S3 Bucket

**정답: D**
해설: S3 is accessed via a VPC Endpoint, not an attachment. TGW attachments are only network units (VPC, VPN, DX, Peering, Connect). A Connect attachment is for SD-WAN appliance integration and lets you terminate a GRE tunnel on the TGW.

---

**문제 8.** To manage a multi-region, multi-account network spanning 50 regions as *policy as code*?

A) Full-mesh VPC Peering
B) Site-to-Site VPN
C) AWS Cloud WAN
D) Direct Connect dedicated lines

**정답: C**
해설: Cloud WAN (released in 2021) is TGW's global backbone extension. It manages segments (prod/dev), attachments, and route propagation all at once with JSON policy. You could also build it manually with TGW Peering, but at the scale of dozens of regions, Cloud WAN is the standard. It doesn't come up often on the exam yet, but its appearance frequency has been increasing since 2024.
