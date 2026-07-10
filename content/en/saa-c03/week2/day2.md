# Day 2 - IGW, NAT Gateway, Bastion: The Bridges Between the Internet and a Private Network

Once you've built a VPC and launched an EC2, you soon run into two desires. "I want to SSH in from outside and get work done," and "I want my Private instance to call an external API." These two look similar, but they're traffic in exactly opposite directions, and AWS has prepared a different solution for each. The IGW and the NAT Gateway handle the flow of packets; the Bastion and Session Manager handle operator access. Mapping these four without confusing them directly decides about 30% of the network area on the SAA exam.

Today's topics are "how does a Private instance communicate safely with the outside," and "how does an operator reach that Private instance" — two of them. The two questions run in exactly opposite packet directions, but both share the principle of "minimal exposure + explicit path." And this principle is the network-layer implementation of the two pillars of *Zero Trust Architecture* (NIST SP 800-207, 2020) — "never trust, always verify" + "grant least privilege."

## Internet Gateway: The VPC's Door to the Outside

An IGW (Internet Gateway) is a **horizontally scaled, highly available, free** gateway attached to a VPC. Only one can be attached to a VPC, and only with an IGW can a VPC finally communicate with the internet.

The IGW does two things.

1. **NAT translation**: When a packet from an instance with a Public IP passes through the IGW, the IGW maps the instance's Private IP ↔ Public IP. It's a 1:1 NAT that requires no hands-on work from you.
2. **Allowing inbound**: An instance that has a route to the IGW and a Public IP can also be reached from outside.

A point that's often confused here: **the IGW itself does not block or allow packets.** Security is handled by SG/NACL. The IGW is just a router that opens the road.

```
Internet communication of an instance in a Public Subnet:

10.0.0.5 (priv)   54.180.x.x (pub)
   ↓ outbound       ↑ inbound
[ Instance ]
   ↓
[ Subnet Route Table: 0.0.0.0/0 → igw-xxx ]
   ↓
[ IGW: 1:1 NAT (10.0.0.5 ↔ 54.180.x.x) ]
   ↓
Internet
```

> 🔍 **Going deeper**: The IGW is effectively implemented as a distributed SDN component. It's not a single physical box; it's distributed across a per-AZ hyperplane, so it automatically has HA. AWS Hyperplane is the internal SDN platform that underpins many AWS network services — NAT Gateway, NLB, EFS, Lambda, and more. It was first unveiled at re:Invent 2017, and a single flow can process millions of packets per second. Because AWS's own Nitro card (a special ASIC) handles packet mapping and routing on the host node with hardware acceleration, network latency is far lower than on ordinary KVM/Xen-based virtualization. The Nitro card is an ARM-based Annapurna Labs (acquired by AWS in 2015) chip, and it reduces virtualization overhead to nearly zero, achieving *bare-metal performance* in a virtual environment.

> 💡 **Related theory**: SDN (Software Defined Networking) is a paradigm that began with Stanford's "Ethane" project in 2008 and the OpenFlow standard; it separates the control plane (routing decisions) from the data plane (packet forwarding). AWS VPC is one of the largest commercial implementations of SDN. In the same vein, Google's Andromeda and Microsoft's Azure Virtual Filtering Platform operate on the same principle. SDN's advantage is that you can "express routing as code," and formal verification tools like AWS Reachability Analyzer only become possible on top of it. The deeper theoretical background is laid out in the 2014 paper by Nick McKeown et al., "Software-Defined Networking: A Comprehensive Survey" (IEEE Proceedings).

> 📚 **Case study**: Looking at the SDN case Cloudflare published in 2019 (Magic Transit), they handle DDoS defense and routing simultaneously across 200+ PoPs with BGP Anycast + SDN routing. AWS's IGW uses a similar architecture, but it's optimized for handling "ordinary traffic from an internal network to the internet." The 6-hour global outage at Facebook (Meta) in 2021 was caused by a BGP withdrawal — the SDN controller received an erroneous command to "withdraw BGP" and made even its own DNS and authentication servers vanish from the internet — a case where the determinism of SDN amplified the incident.

## NAT Gateway: The Outbound Gate of a Private Network

The IGW is bidirectional, but a Private instance only wants **outbound** (e.g., yum update, npm install, API calls). That's what you use the NAT Gateway for.

```
[ Private Subnet: 10.0.10.5 ]
       ↓
[ Subnet Route Table: 0.0.0.0/0 → nat-xxx ]
       ↓
[ NAT GW (Public Subnet, EIP 10.0.0.10 / 3.34.x.x) ]
       ↓
[ Public Subnet Route Table: 0.0.0.0/0 → igw-xxx ]
       ↓
Internet
```

Key points:

1. **The NAT GW sits in a Public subnet** (it itself needs a route to the IGW).
2. **An EIP is attached** (the source IP seen from outside).
3. **It's AZ-scoped** — a single NAT GW lives in only one AZ. If you want HA, you have to create one per AZ.
4. **It's stateful**, so inbound responses pass automatically, while new inbound requests are blocked.

### NAT Gateway vs NAT Instance

| Item | NAT Gateway | NAT Instance |
|------|------------|-------------|
| Management | AWS-managed, no downtime | Your own EC2 (you own patching/HA) |
| Bandwidth | 5 Gbps → 100 Gbps automatic | Bound to the EC2 instance type |
| HA | Automatic within an AZ | Implement yourself with an ASG |
| Cost | Per hour + per GB | EC2 cost + data |
| Security group | Not usable | Usable |
| Port forwarding | Not possible | Possible |
| Doubling as a Bastion | Not possible | Possible |

On the exam, **NAT Gateway is almost always the answer**. The NAT Instance is legacy. As of 2024, AWS no longer recommends the NAT Instance either.

> ⚠️ **Pitfall**: The NAT GW is **AZ-scoped**. If you place a NAT GW in only one AZ and route the Private subnets of other AZs to it, then when that AZ goes down, outbound is blocked even for the other AZs. On top of that, cross-AZ traffic incurs an additional per-GB cost. The standard pattern: **one NAT GW per AZ, and each AZ's Private subnet routes to the NAT GW in the same AZ**. It's a regular exam pitfall — so when you see a scenario where "Multi-AZ NAT GW" is the answer, look closely and it's usually asking about availability rather than cost. In a cost-optimization scenario, conversely, "save cost with a single NAT GW" can be the answer, so you have to read the scenario's center of gravity (cost vs availability) carefully before picking.

> 📚 **Case study**: In 2021, a SaaS company sent all Private traffic to a single-AZ NAT GW, and when that AZ hit an outage, all outbound was down for 30 minutes. As a follow-up they split it into per-AZ NAT GWs + per-AZ route tables. Cost roughly doubled, but RTO became 0. In general, single-AZ savings all collapse with a single incident. In another case, in 2022 a gaming company tried to cut costs to the extreme with a "Spot Instance + one NAT GW" combination, and when a Spot interruption + temporary AZ throttling coincided, an outbound surge occurred. The most dramatic case is the 2017 GitLab.com incident — a database mistake caused by single-AZ dependence → a 6-hour downtime — which was the decisive trigger that made "single-AZ dependence = a time bomb" an industry-standard maxim.

> 🔍 **Going deeper**: The NAT Gateway performs **port translation (PAT, Port Address Translation)**. A single EIP multiplexes the outbound connections of many instances across up to 65,535 ports. But if too many connections pile onto the same destination IP and port, a **port allocation failure** occurs. The limit is roughly 55,000 concurrent connections to a single destination. The fix is to create several NAT GWs to add more EIPs, or use a different NAT GW per destination. Since 2021, you can attach multiple secondary EIPs to a NAT GW to increase the number of ports even through the same NAT GW (65k ports per EIP). The NAT GW's connection idle timeout is fixed at 350 seconds (for TCP), and if that's insufficient you have to send keepalives or put an NLB in front.

> 💡 **Related theory**: The stateful nature of NAT is standardized in RFC 5382 (TCP NAT behavior) and RFC 4787 (UDP NAT behavior). Since NAT maintains a connection table, it can automatically route an inbound response packet back to the appropriate internal IP. However, adding an entry to the connection table consumes OS resources, so it's weak against situations like a DDoS connection flood. That's why you have to put AWS Shield Advanced or Network Firewall in front of the NAT GW for real defense. The RFC 6888 (Carrier-Grade NAT) standard defines how to scale NAT at ISP scale, and the AWS NAT GW is presumed to operate on similar technology.

> ⚠️ **Pitfall**: The NAT GW's IP is an EIP, so it *doesn't change*. That's an advantage in that you can register it on an external SaaS's IP whitelist, but if you replace the NAT GW the EIP changes, so you have to re-request registration with the SaaS. Also, the NAT GW is IPv4-only; for IPv6 you have to use an Egress-Only IGW.

## Bastion Host: A Safe SSH Gateway

How do you SSH into a Private instance? You place one **Bastion (Jump Server)** in a Public subnet and jump again from there into the Private instance. The traditional pattern.

```
[ Operator PC ] → SSH → [ Bastion (Public) ] → SSH → [ Private EC2 ]
```

The core of the SG design:

- **Bastion SG**: inbound SSH (22) — only the company IP whitelist.
- **Private EC2 SG**: inbound SSH (22) — only the Bastion SG as the source.

Referencing the Bastion SG as the source of another SG is the best practice. If you bind by IP range, you have to fix everything each time an IP changes, but SG references are tracked automatically.

> ⚠️ **Pitfall**: Don't put too many privileges on the Bastion. If you let an operator go in and do everything, the Bastion itself becomes a single point of compromise. In practice, use a **command-restricting SSH ProxyCommand + session recording + short-lived Keys**. And putting a *permanent SSH key* on the Bastion is itself a risk — the modern standard is a pattern that issues *short-lived credentials* via HashiCorp Vault or AWS SSM Session Manager.

> 📚 **Case study**: One of the entry points of the 2014 Sony Pictures breach was an exposed Bastion host, and the same pattern recurred in 2017 Equifax (externally exposed Apache Struts) and 2019 Capital One (SSRF + IMDSv1). Attackers always go after "a trusted jump host that's open to the outside." That's why the Zero Trust model removes the very concept of a "trusted interior."

## Session Manager: The Era Without a Bastion

Systems Manager's **Session Manager** has made it so you almost never need to use the Bastion pattern. No SSH key, no port 22. As long as the instance has the SSM Agent installed and an appropriately granted IAM Role, you can immediately spin up a shell from the AWS console or the CLI.

```
Operator → AWS API → SSM → SSM Agent → instance shell
```

Internally, the instance's SSM Agent does **outbound HTTPS** long-polling to the SSM endpoint. When an operator requests a session, a bidirectional channel opens over that connection. In other words, **you don't have to open inbound 22 at all**.

| Item | Bastion + SSH | Session Manager |
|------|--------------|-----------------|
| Inbound port | 22 must be open | Not needed |
| SSH key management | Operator's burden | Not needed |
| Auditing | sshd logs + a separate tool | CloudTrail + CloudWatch Logs automatically |
| Enforcing MFA | Separate PAM configuration | Enforced in the IAM policy |
| Cost | Bastion EC2 + key management | No additional cost |
| Private subnet access | Via the Bastion | Directly possible |

On the exam, when you see "the most secure way to access an EC2," the answer is almost always Session Manager.

> 💡 **Related theory**: Session Manager's outbound-only model is a case of **Zero Trust Network Access (ZTNA)**. BeyondCorp (Google, 2014) put forward the model that "being on the internal network doesn't make you safe; every access must be authenticated and authorized," and AWS Session Manager implements exactly this. The CISA Zero Trust Maturity Model (2021) also recommends removing inbound ports. NIST SP 800-207 (Zero Trust Architecture, 2020) codified the same principle. Other implementations of the same paradigm include Cloudflare Access, Tailscale, Twingate, and Tencent IOA, and this is the core technology of *VPN-less remote work*.

> 📚 **Case study**: In 2019, a fintech allowed SSH port 22 on its Bastion host only from the company IP range, but when one employee's laptop got infected with malware, an attacker who came through that laptop reached the Bastion and eventually got to the Production DB. The post-mortem concluded that migrating to Session Manager would have meant this path never existed in the first place. That company now blocks SSH port 22 across all infrastructure. In a similar case, the 2020 SolarWinds breach was essentially a case of a "trusted internal path" being compromised — the decisive trigger that made Zero Trust an industry-wide standard recommendation. The 2022 Uber breach was similar, infiltrating internal systems through a contractor employee's credentials, and became another case of "trusted interior = risk."

> 🔍 **Going deeper**: Session Manager is feature-rich — KMS encryption, VPC Endpoints, Run As (running as a specific OS user), session recording, and more. In particular, if you connect to SSM through a VPC Endpoint, an instance can receive an SSM session even without an IGW or NAT GW — operator access becomes possible even from a fully isolated Private subnet. This pattern is the answer to the "EC2 access without external internet" scenario that shows up often on the SAA. A deeper implementation detail: the SSM Agent maintains a WebSocket-based bidirectional channel with the SSM endpoint, and operator sessions are multiplexed over it. All traffic is encrypted with TLS 1.2+, and session logs are stored in CloudWatch Logs/S3 with KMS encryption. The *session recording and audit traceability* required by compliance audits (PCI-DSS, SOC 2, HIPAA) is satisfied automatically.

> ⚠️ **Pitfall**: For Session Manager to work, the instance's SSM Agent must be able to reach the SSM endpoint over *outbound HTTPS*. In a fully isolated Private subnet, you have to create three Interface Endpoints: ssm, ssmmessages, and ec2messages. If you miss any of these three, Session Manager won't work — a detail that comes up often on the exam.

## EC2 Instance Connect

EC2 Instance Connect is yet another approach, distinct from Session Manager. It pushes an SSH public key to the instance temporarily (for 60 seconds) and you make the SSH connection within that window. SSH itself still requires port 22 to be open. The "Connect using EC2 Instance Connect" button in the console is exactly this.

| Comparison | SSH Key | EC2 Instance Connect | Session Manager |
|------|---------|---------------------|-----------------|
| Port 22 needed | Yes | Yes | No |
| Key management | Permanent | Short-lived (60s) | Not needed |
| IAM integration | None | Yes | Strong |
| Private instance | Needs a Bastion | Bastion or EIC Endpoint | Directly possible |

The **EC2 Instance Connect Endpoint**, released in 2023, is a PrivateLink-based solution that lets you use EIC on a Private instance without a Bastion. It controls access with IAM permissions and all traffic goes through the AWS private network, so no inbound port is needed while the familiarity of SSH tooling is preserved.

> 🔍 **Going deeper**: The EIC Endpoint is internally a *TCP proxy*. The operator's AWS CLI (`aws ec2-instance-connect ssh`) authenticates to the EIC Endpoint with STS credentials, and the EIC Endpoint tunnels that connection to the instance's port 22. This model is close to *bastion-as-a-service*: the operator uses SSH tooling as-is while the instance has no internet exposure. The same pattern is implemented as GCP IAP TCP Forwarding and Azure Bastion Tunneling.

## VPC Reachability Analyzer

A tool to use when network debugging just won't come together. If you ask "Is port 22 reachable from Instance A to Instance B?", it follows routing, SG, NACL, IGW, and NAT all the way through and tells you where it's blocked. In production, SGs and NACLs accumulate to the point where it's hard to trace with a human head, and this solves it in one shot.

> 🔍 **Going deeper**: Reachability Analyzer runs internally on top of a formal verification engine. It converts all network configuration — routing, SG, NACL, gateways — into SMT (Satisfiability Modulo Theories) constraints and solves "does a reachable path exist?" as a satisfiability problem. This engine (called Tiros) also underpins AWS Inspector, Access Analyzer, and Network Firewall. It's based on the paper "Reachability Analysis for AWS-based Networks" presented at USENIX Security in 2018. Tiros is a proprietary engine built on the Z3 SMT solver, and its core innovation is that it can verify all possible paths in an AWS network in *polynomial time* rather than *exponential time*.

> 💡 **Related theory**: Formal verification is a field that began with Tony Hoare's axiomatic semantics in the 1960s; it proves *mathematically* that a program or system satisfies a specification. If ordinary testing is "checking with samples," formal verification is "proving for all cases." AWS began applying formal verification to its own network and IAM starting in 2017, and this is one of the first industry-standard cases of guaranteeing security over *"all possible inputs."* Microsoft Azure takes a similar approach with *Project Everest*.

## Wrapping Up

The IGW is the bidirectional door to the outside, the NAT GW is the outbound-only gate for Private subnets, and the Bastion is the jump host for operator SSH. And the modern standard is that Session Manager flipped all of that into outbound-only. On the exam, "the most secure EC2 access" should immediately map to Session Manager, "Private subnet outbound" to NAT GW, and "external communication for an instance with a Public IP" to IGW. The next article covers the deep difference between SG and NACL, and VPC Flow Logs. And one more thing — *Zero Trust* is no longer "optional." In 2024 the US federal government mandated the application of Zero Trust Architecture across all agencies, and Korea's financial sector has been gradually adopting it since 2025. The SAA exam reflects this trend too, and there's a strong tendency to score "IAM/SSM-based access" as the superior answer over "VPN/Bastion-based access."

---

## 📝 연습 문제

**문제 1.** An EC2 in a Private subnet needs to call an external API. What is the most appropriate solution?

A) Attach only an IGW
B) Place a NAT Gateway in a Public subnet in the same AZ and route to it
C) ALB
D) PrivateLink

**정답: B**
해설: For outbound-only, the NAT GW is the answer. Even if you attach only an IGW, a Private instance has no Public IP and can't get out. PrivateLink is just private access to a specific AWS service or ISV service, not general internet outbound. If it's limited to AWS services (e.g., S3, DynamoDB), you can use a Gateway Endpoint instead of NAT and greatly reduce cost. Also, if an external SaaS supports PrivateLink, you can reach it without going through NAT.

---

**문제 2.** For NAT Gateway HA?

A) One NAT GW in every AZ, with each AZ's Private subnet using the NAT in the same AZ
B) Put one NAT GW in one AZ and have the other AZs share it
C) Run a NAT Instance with an ASG
D) Attach several EIPs

**정답: A**
해설: The NAT GW is AZ-scoped. If one AZ dies, that NAT dies. Per-AZ NAT + per-AZ routing is the standard. Cost rises, but it's cheaper than a single incident. It also reduces cross-AZ traffic cost — same-AZ NAT routing wins on both cost and availability. When you add up the NAT GW's hourly cost + the cross-AZ data transfer cost, a single-AZ NAT is often not unconditionally cheaper.

---

**문제 3.** What is the most secure way for an operator to access an EC2?

A) Bastion + SSH key
B) EC2 Instance Connect
C) Session Manager + IAM policy + CloudWatch Logs
D) Open port 22 on the instance's Public IP

**정답: C**
해설: Port 22 itself is closed, IAM controls who can access, and every session is logged automatically to CloudWatch. An implementation of Zero Trust principles. A regular exam answer. The NIST SP 800-207 Zero Trust Architecture recommendation points the same way. Compliance frameworks (PCI-DSS, SOC 2, HIPAA) also recommend it, because Session Manager's automatic session recording satisfies audit requirements as-is.

---

**문제 4.** If you make too many connections to the same destination through a NAT GW?

A) The NAT GW auto-scales
B) A port allocation failure can occur
C) The IGW compensates
D) An EIP is added automatically

**정답: B**
해설: Since it multiplexes over a single EIP's 65,535 ports, the limit is roughly 55,000 concurrent connections to a single destination IP/port combination. The fix is to split into several NAT GWs or spread the destinations. Since 2021, you can attach secondary EIPs to a NAT GW to expand the number of ports. If the CloudWatch metric `ErrorPortAllocation` is greater than 0, it means this problem is occurring.

---

**문제 5.** Which is correct about the role of the IGW?

A) NAT-translate an instance's Private IP to a Public IP
B) Enforce security groups
C) Enforce NACLs
D) DDoS defense

**정답: A**
해설: The IGW does 1:1 NAT + routing. Security is handled by SG/NACL, and DDoS by Shield. The IGW itself has no rule set. That the IGW is free is also often asked — the traffic passing through the IGW itself has no cost; only the outbound data cost for going out to the outside is incurred. This is a decisive difference from the NAT GW, and the direct reason for "why the IGW is the answer in cost scenarios."

---

**문제 6.** Which is the safest SG design for the Bastion pattern?

A) Bastion SG inbound SSH 0.0.0.0/0
B) The Private EC2 SG references the Bastion SG as its source
C) The Private EC2 has a Public IP directly
D) IAM AdministratorAccess on the Bastion

**정답: B**
해설: The SG reference pattern is the standard. Automatically tracked even when IPs change. The Bastion SG's source should allow only the company IP whitelist to be truly safe. An even better answer is to not use a Bastion at all — switch to Session Manager. As of 2024, AWS has excluded the Bastion itself from its newly recommended architectures.

---

**문제 7.** What is the principle by which Session Manager works without inbound port 22?

A) AWS accesses the instance from outside
B) The SSM Agent long-polls the SSM endpoint over outbound HTTPS, and a bidirectional channel runs over it
C) The NAT GW translates the inbound
D) An EIP is auto-assigned

**정답: B**
해설: An outbound-only Zero Trust model. There's only an HTTPS connection going out from the instance to SSM, and the operator session flows over that connection. The key benefit is that no inbound port is needed at all. If you want more complete isolation, you can also use an SSM VPC Endpoint so that the outbound itself terminates within the private network. This pattern makes operator access possible even in air-gapped environments (external internet blocked).

---

**문제 8.** For Session Manager to work in a fully isolated Private subnet (no internet)?

A) Add a NAT Gateway
B) Add an IGW
C) Create three Interface Endpoints: ssm, ssmmessages, ec2messages
D) Add a Bastion

**정답: C**
해설: Session Manager's core dependency is that the SSM Agent must be able to reach the SSM endpoint over outbound HTTPS. In an environment without internet, you expose the SSM endpoints inside the VPC with three PrivateLink Interface Endpoints. This is the standard pattern that achieves *full isolation + operator access* at the same time, and it comes up often in exam scenarios.
