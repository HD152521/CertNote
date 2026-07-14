# Day 1 - VPC Security Design: Network as Your First Line of Defense

When people first learn cloud security, they often think IAM is everything. The belief is that solid permissions alone ensure safety. But real breach reports tell a different story. Attackers almost always secure "network reachability" first. Exposed RDP ports, databases open to the Internet, misrouted subnets. No matter how strong IAM is, if the attack surface touches the Internet, it becomes a launching pad for credential theft and vulnerability exploitation.

That's why the SCS-C03 exam treats network in Domain 3 (Infrastructure Security, ~20-22%) not as "the end of policy" but as **the outermost defense line**. Today we examine VPC security design. We'll see how to isolate subnets, why routing tables are invisible security controls, and develop the mental model to accurately answer "does the Internet reach this resource?"

## VPC as Isolation Boundary: CIDR and Tenancy

A VPC (Virtual Private Cloud) is a logically isolated virtual network within an AWS account. The core is **isolation**. Traffic doesn't flow by default between other customers'' VPCs and this one, or between different VPCs in the same account. Until you explicitly connect Peering, Transit Gateway, or VPC Endpoints, it''s complete silos.

| Component | Security Significance |
|-----------|----------------------|
| **CIDR Block** | The private IP address range VPC occupies. Overlap breaks Peering — IPAM non-overlap is essential in design |
| **Subnet** | IP partition bound to an AZ. Public/Private distinction is determined by routing (not a subnet attribute) |
| **Route Table** | Decides where traffic goes. An invisible security control |
| **Tenancy** | default / dedicated. If regulations require physical isolation, use dedicated |

> 💡 **Related Theory**: VPC is one form of network virtualization. Physically, instances share hypervisor and switch with other customers, but AWS''s **Mapping Service** and **Hyperplane** validate ownership at the packet level. An instance can''t send packets with a spoofed source IP to another VPC — the host layer blocks it. That means the software layer enforces "even if private IPs overlap, they''re isolated." This allows two VPCs using the same 10.0.0.0/16 to safely coexist (though Peering won''t work).

> 🔍 **Deeper**: In security exams, "Public Subnet" terminology can be a trap. Subnets have no public/private attribute flag. A subnet is Public if the route table it connects to has **a 0.0.0.0/0 route pointing to Internet Gateway (IGW)**; otherwise it''s Private. So to determine "is this subnet exposed to the Internet," you must check (1) IGW route in the route table, (2) Public IP assigned to the instance, (3) security group/NACL. All three must allow for Internet reachability. If any one is missing, the Internet can''t reach it. This "reachability analysis" is core to security engineering.

## 3-Tier Subnet Isolation: Standard Pattern

The most common isolation pattern is separating subnets by tier.

```
VPC (10.0.0.0/16)
 ├── Public Subnet (10.0.0.0/24)   ← ALB, NAT Gateway, Bastion
 │     Route: 0.0.0.0/0 → IGW
 ├── App Subnet (10.0.10.0/24)     ← EC2, ECS, Lambda(VPC-connected)
 │     Route: 0.0.0.0/0 → NAT Gateway
 └── Data Subnet (10.0.20.0/24)    ← RDS, ElastiCache, Aurora
       Route: local only (no Internet route)
```

- **Public Tier**: Only resources that must receive traffic directly from the Internet (load balancers, NAT, Bastion). No workloads run here.
- **App Tier**: Outbound via NAT (patch downloads, etc.), inbound only from ALB.
- **Data Tier**: No Internet route at all. Access from App Tier only. Strongest isolation.

> 💡 **Related Theory**: This tier separation is a network implementation of **Defense in Depth** (NSA-established military concept). If one layer is breached, the next stops the attacker. If an attacker exploits an ALB vulnerability to reach App Tier, they still can''t reach Data Tier because routing itself doesn''t exist there, making it nearly impossible to exfiltrate data outbound. NIST SP 800-41 (Firewall Guidelines) recommends this as "tiered/segmented architecture."

> ⚠️ **Pitfall**: "If Data Subnet has no Internet route, how do we patch the OS?" comes up in exams. The answer: managed services like RDS are patched by AWS, so no Internet route is needed. For self-managed EC2 databases on the data tier, get patches via Systems Manager (SSM) + VPC Endpoint. Answers suggesting opening NAT to connect data tier to the Internet are almost always wrong.

## Route Tables: Invisible Security Control

Security engineers often overlook route tables. Security groups and NACLs explicitly "deny," but route tables create **implicit blocking** where "no route means can''t go there."

| Destination | Target | Meaning |
|-------------|--------|---------|
| 10.0.0.0/16 | local | VPC-internal communication (can''t delete, always exists) |
| 0.0.0.0/0 | igw-xxxx | Bidirectional Internet |
| 0.0.0.0/0 | nat-xxxx | Outbound only (inbound blocked) |
| pl-xxxx (S3) | vpce-xxxx | Private S3 access via Gateway Endpoint |

> 🔍 **Deeper**: Route tables connect at the **subnet level (or gateway level)**. You can''t attach two route tables to the same subnet simultaneously. Subnets not explicitly attached use the VPC''s **Main Route Table**. This is a common security incident point — new subnet created, routing not explicitly attached, but Main Route Table has an IGW route, so it becomes unintentionally Public. The standard is never to put 0.0.0.0/0 → IGW in the Main Route Table.

> 🎯 **Scenario**: "Security audit found RDS in Data Tier is reachable from the Internet. What do you check?" In order: (1) RDS''s `PubliclyAccessible` flag, (2) Route table of the subnet for IGW route, (3) security group inbound has 0.0.0.0/0, (4) NACL. For RDS to truly reach the Internet, **both** routing (IGW) and Public IP must exist. Without routing, even open SG can''t reach it. This "reachability analysis" is the core security engineer skill.

## NAT Gateway vs Internet Gateway: Directionality Difference

| Item | Internet Gateway (IGW) | NAT Gateway |
|------|------------------------|-------------|
| Traffic Direction | Bidirectional (in/out) | Outbound only |
| Placement | Public Subnet | In Public Subnet, used by Private |
| Security Implication | External can initiate | External can''t initiate first connection |
| Cost | Free | Hourly + data processing charge |

> 💡 **Related Theory**: NAT''s security value lies in **asymmetry**. Only responses to internally-initiated connections can return; externals can''t initiate. This comes from stateful translation. Same principle as home router NAT. So the standard is letting App Tier get patches from the Internet via NAT while preventing the Internet from reaching App Tier first. For IPv6, **Egress-only Internet Gateway** plays the same role instead of NAT.

> ⚠️ **Pitfall**: NAT Gateway **must** be in a Public Subnet (it needs to egress via IGW itself). NAT in Private Subnet won''t work. Also, NAT is one-way — inbound is blocked, but outbound allows everything, so it can become a **data exfiltration path**. For sensitive workloads, replace NAT with VPC Endpoints for private connectivity to only needed services (Day 4 topic).

## Additional VPC Security Controls

```bash
# Enable VPC Flow Logs (detailed in Day 3)
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-xxxx \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name /vpc/flowlogs

# Remove all rules from default SG (minimal privilege starting point)
aws ec2 revoke-security-group-ingress \
  --group-id sg-default --protocol -1 --source-group sg-default

# DNS query logging (Route 53 Resolver) — detect DNS-based exfil
aws route53resolver create-resolver-query-log-config \
  --name vpc-dns-log --destination-arn arn:aws:logs:...:log-group:/vpc/dns
```

> 🔍 **Deeper**: Default security group and default NACL in a VPC behave differently. The **default SG** allows all traffic among resources in the same SG and blocks other inbound (all outbound allowed). The **default NACL** allows all inbound and outbound. So remember "new subnet using default NACL is defenseless at NACL level." Isolation comes from routing and SG.

> 📚 **Case Study**: In the 2019 Capital One breach, from a network angle, SSRF vulnerability accessed EC2 metadata, then that credential exfiltrated S3 data. If S3 access were restricted to **VPC Endpoint + Endpoint Policy only** and Internet route blocked, even stolen credentials couldn''t pull data externally. Network isolation acts as a "second defense line" after IAM compromise.

## Wrapping Up

Three pictures to nail today. First, VPC is a strong isolation boundary where even overlapping private IPs remain isolated via software-layer ownership enforcement. Second, subnet''s Public/Private is not an attribute but determined by **routing**, and route tables are invisible blocking where "no route means can''t go." Third, 3-Tier (Public/App/Data) isolation is network implementation of defense in depth, and the standard is no Internet route in Data Tier at all.

The ability to answer "does the Internet reach this resource?" by examining routing, Public IP, SG, and NACL is the security engineer''s starting point. Next, we examine the most-confused pair: **security groups vs NACL differences** from stateful vs stateless perspective.

---

## 📝 연습 문제

**문제 1.** 한 보안 감사에서 RDS 인스턴스가 인터넷에서 접근 가능한지 의심된다. RDS가 실제로 인터넷에서 도달 가능하려면 반드시 충족돼야 하는 조건의 조합은?

A) 보안 그룹 인바운드에 0.0.0.0/0만 열려 있으면 충분하다  
B) 서브넷 라우팅 테이블에 IGW 경로 + RDS에 Public IP + SG/NACL 허용이 모두 필요하다  
C) NACL이 모든 트래픽을 허용하면 라우팅과 무관하게 도달 가능하다  
D) RDS의 PubliclyAccessible 플래그만 켜져 있으면 SG와 무관하게 도달 가능하다  

**정답: B**  
해설: 인터넷 도달 가능성은 여러 레이어가 동시에 충족돼야 성립한다. 인터넷으로 향하는 IGW 라우팅 경로, 리소스의 퍼블릭 주소, 그리고 보안 그룹과 NACL의 허용이 모두 있어야 한다. 보안 그룹만 열려 있어도 라우팅 경로가 없으면 패킷이 인터넷으로 나갈 수 없다. 라우팅이 빠지면 다른 통제가 열려 있어도 도달 불가다.

---

**문제 2.** 새로 만든 서브넷을 라우팅 테이블에 명시적으로 연결하지 않았다. 이 서브넷의 라우팅 동작은?

A) 인터넷 접근이 완전히 차단된 격리 서브넷이 된다  
B) VPC의 Main Route Table을 자동으로 사용한다  
C) 라우팅 테이블이 없으므로 VPC 내부 통신도 불가능하다  
D) 가장 가까운 AZ의 라우팅 테이블을 상속한다  

**정답: B**  
해설: 명시적으로 라우팅 테이블에 연결되지 않은 서브넷은 VPC의 메인 라우팅 테이블을 사용한다. 따라서 메인 라우팅 테이블에 인터넷 게이트웨이 경로가 들어 있으면 새 서브넷이 의도치 않게 인터넷에 노출된다. 이 때문에 메인 라우팅 테이블에는 인터넷 경로를 두지 않는 것이 안전한 기본값이다.

---

**문제 3.** Data Tier 서브넷(RDS 전용)의 라우팅 설계로 가장 적절한 것은?

A) 0.0.0.0/0 → NAT Gateway 경로를 두어 OS 패치를 받게 한다  
B) 0.0.0.0/0 → IGW 경로를 두어 외부 모니터링을 허용한다  
C) 로컬 경로만 두고 인터넷 경로를 두지 않는다  
D) 0.0.0.0/0 → Egress-only IGW 경로를 두어 IPv6 아웃바운드를 허용한다  

**정답: C**  
해설: 데이터 계층은 인터넷 경로 자체를 두지 않는 것이 가장 강한 격리다. 관리형 RDS의 패치는 AWS가 처리하므로 인터넷 경로가 필요 없다. 인터넷으로 향하는 경로를 추가하면 데이터 유출 경로가 생기므로, 외부 연결이 필요하면 NAT가 아니라 VPC 엔드포인트로 특정 서비스만 사설 연결하는 것이 표준이다.

---

**문제 4.** 민감 데이터를 다루는 App Tier에서 인터넷으로 데이터가 유출되는 것을 막으면서도 AWS 서비스(S3, DynamoDB) 접근은 허용하고 싶다. NAT Gateway 대비 더 안전한 접근은?

A) NAT Gateway의 아웃바운드를 모두 허용하되 SG로 목적지 IP를 제한한다  
B) VPC Endpoint(Gateway/Interface)로 해당 서비스만 사설 연결하고 인터넷 경로를 제거한다  
C) Internet Gateway를 두되 NACL로 아웃바운드 포트를 443만 허용한다  
D) Bastion Host를 통해서만 외부 통신을 중계하도록 강제한다  

**정답: B**  
해설: NAT는 아웃바운드를 폭넓게 허용하므로 데이터 유출 경로가 될 수 있다. 필요한 AWS 서비스만 VPC 엔드포인트로 사설 연결하고 인터넷 경로를 제거하면, 트래픽이 AWS 백본 내부에 머물고 외부로 데이터를 빼낼 경로 자체가 사라진다. 보안 그룹으로 목적지 IP를 제한하는 방식은 AWS 서비스 IP 범위가 광범위하게 변동해 실효성이 떨어진다.

---

**문제 5.** 기본(default) NACL과 기본 보안 그룹의 동작 차이로 옳은 것은?

A) 기본 NACL은 모든 인/아웃바운드를 허용하고, 기본 SG는 같은 SG 멤버 간만 허용한다  
B) 기본 NACL과 기본 SG 모두 모든 트래픽을 차단한다  
C) 기본 NACL은 모든 트래픽을 차단하고, 기본 SG는 모두 허용한다  
D) 둘 다 같은 SG/서브넷 멤버 간 통신만 허용한다  

**정답: A**  
해설: 기본 네트워크 ACL은 인바운드와 아웃바운드를 모두 허용해 사실상 무통제 상태다. 반면 기본 보안 그룹은 동일 보안 그룹에 속한 리소스 간 통신만 허용하고 그 외 인바운드는 차단하며 아웃바운드는 전체 허용한다. 따라서 실질적 격리는 라우팅과 보안 그룹으로 만들고, 네트워크 ACL은 보조적인 서브넷 단위 통제로 쓰는 것이 일반적이다.

---
