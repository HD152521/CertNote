# Day 1 - VPC Security Design: Network as Your First Line of Defense

When people first learn cloud security, they often think IAM is everything. The belief is that solid permissions alone ensure safety. But real breach reports tell a different story. Attackers almost always secure "network reachability" first. Exposed RDP ports, databases open to the Internet, misrouted subnets. No matter how strong IAM is, if the attack surface touches the Internet, it becomes a launching pad for credential theft and vulnerability exploitation.

That's why the SCS-C03 exam treats network in Domain 3 (Infrastructure Security, 18%) not as "the end of policy" but as **the outermost defense line**. Today we examine VPC security design. We'll see how to isolate subnets, why routing tables are invisible security controls, and develop the mental model to accurately answer "does the Internet reach this resource?"

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

## 📝 Practice Questions

**Question 1.** In a security audit, it is suspected that an RDS instance is reachable from the internet. What combination of conditions must be met for the RDS to actually be reachable from the internet?

A) Having only 0.0.0.0/0 open on the security group inbound is enough  
B) An IGW route in the subnet route table + a Public IP on the RDS + SG/NACL allow are all required  
C) If the NACL allows all traffic, it is reachable regardless of routing  
D) If only the RDS PubliclyAccessible flag is on, it is reachable regardless of the SG  

**Answer: B**  
Explanation: Internet reachability holds only when multiple layers are satisfied at the same time. There must be an IGW route toward the internet, a public address on the resource, and allows in both the security group and NACL. Even if only the security group is open, packets cannot go out to the internet without a route. If routing is missing, it is unreachable even if the other controls are open.

---

**Question 2.** A newly created subnet was not explicitly associated with a route table. What is the routing behavior of this subnet?

A) It becomes an isolated subnet with internet access completely blocked  
B) It automatically uses the VPC's Main Route Table  
C) With no route table, even communication inside the VPC is impossible  
D) It inherits the route table of the nearest AZ  

**Answer: B**  
Explanation: A subnet that is not explicitly associated with a route table uses the VPC's main route table. Therefore, if the main route table contains an internet gateway route, a new subnet is unintentionally exposed to the internet. For this reason, not putting an internet route in the main route table is the safe default.

---

**Question 3.** What is the most appropriate routing design for the Data Tier subnet (RDS only)?

A) Add a 0.0.0.0/0 -> NAT Gateway route so it can receive OS patches  
B) Add a 0.0.0.0/0 -> IGW route to allow external monitoring  
C) Keep only the local route and no internet route  
D) Add a 0.0.0.0/0 -> Egress-only IGW route to allow IPv6 outbound  

**Answer: C**  
Explanation: The strongest isolation for the data tier is to have no internet route at all. AWS handles patching of managed RDS, so no internet route is needed. Adding a route toward the internet creates a data exfiltration path, so if external connectivity is needed, the standard is to privately connect only specific services through VPC endpoints rather than NAT.

---

**Question 4.** We want to prevent data from leaking to the internet from the App Tier that handles sensitive data while still allowing access to AWS services (S3, DynamoDB). What is a safer approach than a NAT Gateway?

A) Allow all NAT Gateway outbound but restrict destination IPs with an SG  
B) Privately connect only those services with VPC Endpoints (Gateway/Interface) and remove the internet route  
C) Have an Internet Gateway but allow only port 443 outbound with a NACL  
D) Force external communication to be relayed only through a Bastion Host  

**Answer: B**  
Explanation: NAT allows outbound broadly, so it can become a data exfiltration path. If you privately connect only the needed AWS services through VPC endpoints and remove the internet route, traffic stays inside the AWS backbone and the path to take data outside disappears entirely. Restricting destination IPs with a security group is ineffective because AWS service IP ranges are broad and change.

---

**Question 5.** Which statement about the behavioral difference between the default NACL and the default security group is correct?

A) The default NACL allows all inbound/outbound, and the default SG allows only between members of the same SG  
B) Both the default NACL and the default SG block all traffic  
C) The default NACL blocks all traffic, and the default SG allows everything  
D) Both allow communication only between members of the same SG/subnet  

**Answer: A**  
Explanation: The default network ACL allows all inbound and outbound, so it is effectively uncontrolled. The default security group, on the other hand, allows only communication between resources belonging to the same security group, blocks other inbound, and allows all outbound. Therefore, practical isolation is created with routing and security groups, and the network ACL is generally used as a supplementary subnet-level control.

---
