# Day 1 - VPC Security Design: Network as Your First Line of Defense

When people first learn cloud security, they often think IAM is everything. The belief is that solid permissions alone ensure safety. But real breach reports tell a different story. Attackers almost always secure "network reachability" first. Exposed RDP ports, databases open to the Internet, misrouted subnets. No matter how strong IAM is, if the attack surface touches the Internet, it becomes a launching pad for credential theft and vulnerability exploitation.

That is why the SCS-C03 exam treats the network in Domain 3 (Infrastructure Security, 18%) not as "the end of the policy chain" but as **the outermost line of defense**. Today we look at VPC security design: how to isolate subnets, why route tables are an invisible security control, and a way of thinking that answers precisely the question "does the Internet reach this resource?"

## Reachability: The One Question a Security Engineer Asks

The first mental habit to build in network security is to see "does the Internet reach this resource?" not as a single condition but as **a product (AND) of conditions**. Beginners judge exposure by looking at one security group alone. In reality, for a packet to reach you from the Internet, the following must **all** be true.

```
[ Internet → my resource: reachability is an AND of conditions ]

  ① The resource has a public address     (Public IPv4 / EIP / routable IPv6)
        AND
  ② Subnet routing has 0.0.0.0/0 → IGW    (no route means it ends here)
        AND
  ③ NACL inbound allows it                (subnet boundary, stateless)
        AND
  ④ Security group inbound allows it      (ENI, stateful)
        AND
  ⑤ NACL outbound allows the response (ephemeral port)
        AND
  ⑥ The OS firewall is open and the application is listening

  ── If even one is false, it is unreachable.
     The mere fact that "the SG has 0.0.0.0/0" does not establish exposure.
```

Put the other way around, **blocking is an OR**. Cutting any one of the six blocks it. So the priority of security measures becomes "cut the most fundamental one first," and the most fundamental one is ②, routing. If there is no route, no packet arrives even when the other five are wide open. This is why, when the exam asks for "the most fundamental measure," the answer is relocating the subnet or turning off `PubliclyAccessible`, not narrowing the security group.

The opposite direction, that is, **can my resource go out?**, decomposes the same way. For outbound, ① is not needed (with NAT, the NAT holds the public address), and ② changes from `0.0.0.0/0 → IGW` to `0.0.0.0/0 → NAT`. If you worry about data exfiltration, what you should look at is not the inbound condition table but **this outbound condition table**. The VPC endpoint design covered on Day 4 is, in the end, the work of erasing ② from this outbound condition table.

This AND/OR structure is a condensed form of what security engineering calls an **attack tree**. For an attack to succeed, several preconditions must hold at once (an AND gate), and the defender needs to break only one of them. This is where the asymmetry between defense cost and attack cost comes from: the attacker has to get through all six, but the defender only has to hold one, so the essence of design is choosing "the node that can be cut most cheaply and reliably." In the cloud, that node is almost always routing. Route changes are free, hard to revert by accident, and easy to monitor with logs and Config rules.

## The VPC as an Isolation Boundary: CIDR and Tenancy

A VPC (Virtual Private Cloud) is a logically isolated virtual network inside an AWS account. The key is **isolation**. By default, no traffic flows to other customers' VPCs, nor to other VPCs in the same account. Until you explicitly connect Peering, Transit Gateway, or a VPC Endpoint, it is a complete silo.

| Component | Meaning from a security perspective |
|-----------|-------------------------------------|
| **CIDR block** | The private IP address range the VPC occupies. Overlapping ranges cannot be peered, so non-overlapping IPAM is essential in design |
| **Subnet** | An IP partition bound to an AZ. The Public/Private distinction is determined by routing (it is not a subnet attribute) |
| **Route table** | Decides where traffic is sent. An invisible security control |
| **Tenancy** | default / dedicated. Use dedicated when regulatory requirements demand physical isolation |

A VPC is a form of network virtualization. Physically it shares hypervisors and switches with other customers, but AWS's **Mapping Service** and **Hyperplane** verify ownership packet by packet. Even if an instance tries to send a packet to another VPC with a forged source IP, it is blocked at the host level. In other words, the guarantee that "isolation holds even when private IPs overlap" is enforced at the software layer. This is why two VPCs that both use 10.0.0.0/16 can coexist safely (though they cannot be peered).

On the security exam, the term "public subnet" can be a trap. A subnet itself has no public/private attribute flag. If the route table attached to the subnet has a **0.0.0.0/0 route to an Internet Gateway (IGW)**, it is Public; if not, it is Private. So to judge "is this subnet exposed to the Internet?", you must look at all of (1) the IGW route in the route table, (2) whether the instance is assigned a Public IP, and (3) the security group/NACL. If any one of the three is cut, the Internet cannot reach it.

### CIDR Planning Is Security Design

If you treat address planning only as a question of "how many IPs will we use," you will leave no place to attach security controls later. If you carve address blocks for each tier **contiguously**, you can later express NACL rules and SG source CIDRs in a single line. Conversely, if the tiers are mixed together in the address space, you cannot write one rule that refers to "the entire App tier," and the rules multiply every time subnets are added.

| Planning element | Security implication |
|------------------|----------------------|
| Non-overlapping VPC CIDRs | If they overlap, Peering and TGW connections are impossible — allocate in advance with organization-wide IPAM |
| Contiguous block per tier | Allocate like `10.0.0.0/20`=Public, `10.0.16.0/20`=App, and one rule expresses a whole tier |
| 5 reserved IPs per subnet | AWS reserves the first 4 and the last 1 of each subnet — a /28 has only 11 usable |
| Adding a secondary CIDR | Can be attached later, but already-built NACL and SG rules and routing must be re-reviewed |
| Enabling IPv6 | IPv6 addresses are **publicly routable** by default — the NAT concept differs (below) |

> ⚠️ **Pitfall**: IPv6 draws the private/public distinction differently from IPv4. If you attach an IPv6 CIDR to the VPC and assign IPv6 to a subnet, that address is inherently routable from the Internet. If you think "it's a private range so it's safe" by IPv4 standards and leave IPv6 on, then the moment the route table has `::/0 → IGW`, unintended two-way exposure appears. If you want outbound only, always use an **Egress-only Internet Gateway**. Security group and NACL rules are also **separate rules** for IPv4 and IPv6, so leaving IPv6 open after narrowing only IPv4 is a common audit finding.

## 3-Tier Subnet Isolation: The Standard Pattern

The most widely used isolation pattern is separating subnets by tier.

```
VPC (10.0.0.0/16)
 ├── Public Subnet (10.0.0.0/24)   ← ALB, NAT Gateway, Bastion
 │     Routing: 0.0.0.0/0 → IGW
 ├── App Subnet (10.0.10.0/24)     ← EC2, ECS, Lambda (VPC-attached)
 │     Routing: 0.0.0.0/0 → NAT Gateway
 └── Data Subnet (10.0.20.0/24)    ← RDS, ElastiCache, Aurora
       Routing: local only (no Internet route)
```

Separating the tiers is only half of it. The other half is **how you let traffic pass between tiers**, and that is expressed through security group reference relationships. The diagram below overlays the actual placement and the controls in one picture.

```
[ Traffic direction in the 3-Tier and where controls apply ]

           Internet
             │
        ┌────▼────┐
        │   IGW   │
        └────┬────┘
             │  (0.0.0.0/0 → igw)
  ┌──────────▼──────────────────────────────┐
  │ Public Subnet   10.0.0.0/24  (AZ-a/b)   │
  │   ALB(sg-alb)      NAT GW      Bastion  │
  └────┬───────────────────┬────────────────┘
       │ 443               │ (0.0.0.0/0 → nat)
       │ sg-app inbound is │  outbound only
       │ "source = sg-alb" │
  ┌────▼───────────────────▼────────────────┐
  │ App Subnet      10.0.10.0/24 (AZ-a/b)   │
  │   EC2 / ECS (sg-app)                    │
  └────┬───────────────────┬────────────────┘
       │ 5432              │ vpce (S3/KMS/SSM)
       │ sg-data inbound is│  ← Day 4 topic
       │ "source = sg-app" │
  ┌────▼───────────────────┴────────────────┐
  │ Data Subnet     10.0.20.0/24 (AZ-a/b)   │
  │   RDS (sg-data)      no Internet route   │
  └─────────────────────────────────────────┘

  Key: allow between tiers by **SG reference**, not CIDR.
       Even as instances grow and IPs change, the rule stays the same.
```

- **Public Tier**: Only what must receive traffic directly from the Internet (load balancer, NAT, Bastion). Do not place workloads themselves here.
- **App Tier**: Outbound is possible through NAT (for patch downloads and the like); inbound only from the ALB.
- **Data Tier**: No Internet route at all. Accessible only from the App Tier. The strongest isolation.

This tier separation is the network implementation of **Defense in Depth** (a military concept established by the NSA). If one layer is breached, the next layer blocks. Even if an attacker enters the App Tier through a vulnerability in the ALB, the Data Tier has no routing at all, so data cannot be pulled out directly to the outside. NIST SP 800-41 (the firewall guide) recommends this as a "tiered/segmented architecture."

> ⚠️ **Pitfall**: The question "if the Data Subnet has no Internet route, how does it get OS patches?" shows up on the exam. The answer is that managed services like RDS are patched by AWS, so no Internet route is needed. If the data tier has a self-managed EC2 database, patches are delivered through Systems Manager (SSM) + a VPC Endpoint. An option that opens NAT to connect the data tier to the Internet is usually wrong.

## Route Tables: The Invisible Security Control

The route table is what security engineers often overlook. Security groups and NACLs state a "block" explicitly, but route tables create an **implicit block**: "if there is no route, you cannot go."

| Destination | Target | Meaning |
|-------------|--------|---------|
| 10.0.0.0/16 | local | Intra-VPC communication (cannot be deleted, always present) |
| 0.0.0.0/0 | igw-xxxx | Internet, two-way |
| 0.0.0.0/0 | nat-xxxx | Outbound only (inbound blocked) |
| pl-xxxx (S3) | vpce-xxxx | Private access to S3 via Gateway Endpoint |

A route table is associated **per subnet (or per gateway)**. You cannot associate two route tables with one subnet at the same time. A subnet without an explicit association uses the VPC's **Main Route Table**. This is where security incidents often arise: if you create a new subnet and don't explicitly associate routing, and the Main Route Table has an IGW route, the subnet unintentionally becomes Public. So the standard is never to put 0.0.0.0/0 → IGW in the Main Route Table.

> 🎯 **Scenario**: "A security audit suspects that the Data Tier's RDS is reachable from the Internet. What do you check?" — In order: (1) the RDS `PubliclyAccessible` flag, (2) whether the subnet route table has an IGW route, (3) 0.0.0.0/0 in the security group inbound, (4) the NACL. For RDS to truly reach the Internet, routing (IGW) and a Public IP must **both** be present. Without routing, it is unreachable even if the SG is open. This "reachability analysis" is the core competency of a security engineer.

### Types of Route Tables, and Two That Are Hard to See

When people say route table they usually think only of the one attached to a subnet, but in reality there are several more places they attach, and two of those are frequently missed in audits.

| Type | Attached to | Security perspective |
|------|-------------|----------------------|
| Main Route Table | Every subnet with no explicit association | If it has an IGW route, new subnets automatically become Public |
| Custom route table | Explicitly associated subnets | One per tier is the standard |
| Gateway Route Table | The IGW or VGW **itself** | For redirecting incoming traffic to an inspection appliance (Week 4's ingress routing) |
| Local Gateway / Outpost | On-premises extension | Check that hybrid paths don't become a bypass |

Remember two things here. First, the `10.0.0.0/16 → local` route **cannot be deleted.** An option like "cut intra-VPC communication with routing" is wrong. Isolation inside the same VPC is made with security groups, not routing. Second, when a route's target disappears, that route goes into a **blackhole** state — for example, if you delete a NAT gateway but the `0.0.0.0/0 → nat-xxxx` route remains, the traffic is not leaking to the Internet but simply dropped. If "I deleted the NAT but the instance still reaches the Internet," that means there is **another path** (direct IGW, peering, TGW), not a blackhole, so you must re-examine the whole route table.

```bash
# Pull out only the routes heading to the Internet from all route tables in this VPC
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=vpc-0abc1234" \
  --query 'RouteTables[].{RT:RouteTableId,
             Assoc:Associations[].SubnetId,
             Internet:Routes[?DestinationCidrBlock==`0.0.0.0/0`].[GatewayId,NatGatewayId,TransitGatewayId,State]}' \
  --output json

# Find out what the Main Route Table is and whether it has an IGW route
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=vpc-0abc1234" \
            "Name=association.main,Values=true" \
  --query 'RouteTables[].Routes'
```

If you judge which route table a subnet is associated with only from the console's subnet screen, you can miss cases. A subnet with no explicit association shows as "Main" on screen, and in that case the actual routes follow the Main Route Table. When you write an audit script, treating subnets whose `Associations` is empty as "no routing" classifies **the most dangerous case as normal**. You must make the determination including the contents of the Main Route Table.

## NAT Gateway vs Internet Gateway: Differences in Directionality

| Item | Internet Gateway (IGW) | NAT Gateway |
|------|------------------------|-------------|
| Traffic direction | Two-way (in/out) | Outbound only |
| Where used | Public subnet | Placed in a public subnet and used by Private subnets |
| Security meaning | Can be initiated from outside | Outside cannot connect first |
| Cost | Free | Hourly plus data processing charges |

The security value of NAT lies in its **asymmetry**. Only responses to connections initiated from inside can come back, and the outside cannot try to connect first. This is thanks to stateful translation. It is the same principle as NAT in a home router. So it is the standard means for the App Tier to receive patches from the Internet while preventing the Internet from reaching the App Tier first. In IPv6, an **Egress-only Internet Gateway** plays the same role instead of NAT.

A NAT Gateway **must be in a public subnet** (since it itself has to go out through the IGW). Putting NAT in a private subnet does not work. Also, because NAT is one-way, it guarantees blocking inbound, but it allows all outbound, so it can become a **data exfiltration path**. For sensitive workloads, it is safer to connect privately to only the needed services with a VPC Endpoint instead of NAT (a Day 4 topic).

### Four Doors to the Internet, and the Means of Blocking Each

The "way out" is not just one. If you try to prevent exfiltration by deleting only NAT, the other doors stay open. The table below is the list you actually have to sweep in an audit.

| Exfiltration path | Condition for it to hold | Blocking/reducing means |
|-------------------|--------------------------|--------------------------|
| Direct IGW | Public IP + `0.0.0.0/0 → igw` | Move workloads to private subnets, remove the IGW route |
| NAT Gateway | `0.0.0.0/0 → nat` | Remove NAT and replace with VPC endpoints (Day 4) |
| Egress-only IGW (IPv6) | `::/0 → eigw` | If you don't use IPv6, don't assign IPv6 to the subnet |
| Peering / TGW / VPN / DX | An Internet path exists on the peer VPC or on-premises | Audit including the other side's egress policy, separate TGW routing domains |
| VPC endpoint | AWS API access through the endpoint | Restrict target resources/organization with an endpoint policy (Day 4) |
| DNS tunneling | 53/UDP is open | Resolver DNS Firewall (Week 7) |

The last two rows matter because exfiltration is possible in principle even in a "zero-internet VPC" with every Internet path removed. The passage out to AWS services (endpoints) and the name-resolution passage (DNS) remain, and attackers use the passages that remain. That is why Day 4's endpoint policies and Week 7's DNS controls become the work of filling the last two rows of this table.

The difference between a NAT Instance and a NAT Gateway occasionally shows up on the exam. A NAT Instance is an EC2 instance that we manage, so it only works if you **turn off the source/destination check**, you can attach security groups to it, and you must patch it and make it redundant yourself. A NAT Gateway is managed, so you cannot attach an SG (traffic control is done with the subnet NACL and routing), and redundancy is per AZ. The interesting difference from a security viewpoint is "can you attach an SG?", but restricting destinations by putting an SG on a NAT Instance is not recommended in practice — the management burden and single points of failure increase, while AWS service IP ranges change often, so its effectiveness is low. If the goal is destination restriction, the proper approach is to **switch to endpoints or set up Network Firewall** rather than make NAT elaborate.

## Additional VPC Controls from a Security Perspective

```bash
# Enable VPC Flow Logs (deep dive on Day 3)
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-xxxx \
  --traffic-type ALL \
  --log-destination-type cloud-watch-logs \
  --log-group-name /vpc/flowlogs

# Remove all rules from the default SG (least-privilege starting point)
aws ec2 revoke-security-group-ingress \
  --group-id sg-default --protocol -1 --source-group sg-default

# DNS query logging (Route 53 Resolver) — detect DNS-based exfil
aws route53resolver create-resolver-query-log-config \
  --name vpc-dns-log --destination-arn arn:aws:logs:...:log-group:/vpc/dns
```

A VPC's default security group and default NACL behave differently. The **default SG** allows everything between resources belonging to the same SG, blocks other inbound (all outbound allowed). The **default NACL** allows all inbound and outbound. So remember that "if a new subnet uses the default NACL, it is unprotected at the NACL level." Isolation is made with routing and SGs.

Looking at the network side of the 2019 Capital One incident, the attacker reached EC2 metadata through an SSRF vulnerability and then pulled S3 data with those credentials. If S3 access had been allowed **only through a VPC Endpoint + Endpoint Policy** and the Internet path had been blocked, it would have been much harder to take the data out from the outside even with the stolen credentials. Network isolation works as a "second line of defense" after an IAM compromise.

## Exposure Self-Diagnosis: The Order for Checking by Hand

When answering "is anything in our VPC exposed to the Internet?", instead of wandering through the console, you can translate the AND condition table from earlier directly into commands. The order is **from broad to narrow** — look at routing first. A subnet with no Internet route in its routing doesn't need to be examined further down.

```bash
# ① First pin down the list of subnets that have an Internet route
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-0abc1234" \
  --query 'RouteTables[?Routes[?GatewayId!=null && starts_with(GatewayId, `igw-`)]].Associations[].SubnetId'

# ② Within those subnets, pick out only the ENIs that have a public address
aws ec2 describe-network-interfaces \
  --filters "Name=subnet-id,Values=subnet-public-a" \
  --query 'NetworkInterfaces[?Association.PublicIp!=null].[NetworkInterfaceId,PrivateIpAddress,Association.PublicIp,Description]' \
  --output table

# ③ From the remaining targets' security groups, pull only 0.0.0.0/0 inbound
aws ec2 describe-security-groups \
  --filters "Name=vpc-id,Values=vpc-0abc1234" \
  --query 'SecurityGroups[?IpPermissions[?IpRanges[?CidrIp==`0.0.0.0/0`]]].{Id:GroupId,Name:GroupName,
             Open:IpPermissions[?IpRanges[?CidrIp==`0.0.0.0/0`]].[IpProtocol,FromPort,ToPort]}'

# ④ Also look at the NACL at the subnet boundary (the default NACL means effectively no control)
aws ec2 describe-network-acls \
  --filters "Name=vpc-id,Values=vpc-0abc1234" \
  --query 'NetworkAcls[].{Id:NetworkAclId,Default:IsDefault,
             Assoc:Associations[].SubnetId,
             Entries:Entries[?RuleAction==`allow`].[RuleNumber,Egress,Protocol,CidrBlock,PortRange]}'
```

Apart from sweeping by hand, AWS has two tools that make this determination for you. Since the exam distinguishes them by name, keep their roles separate.

| Tool | Question it answers | When to use |
|------|---------------------|-------------|
| **Reachability Analyzer** | "Can A reach B, and if not, which component blocked it?" | Troubleshooting connection failures (when there is a specific source and destination) |
| **Network Access Analyzer** | "Does a path exist from the Internet to our DB subnet?" | Continuous audit of unintended paths (describe source and destination as ranges) |
| VPC Flow Logs | "What traffic actually flowed?" | Post-incident investigation and anomaly detection (Day 3) |

What matters about the first two is that they **judge statically from the configuration alone**, without sending packets. That means they can find exposure even in a new environment where no traffic has occurred yet, and conversely they break the illusion that "it's quiet now, so it's safe." Flow Logs show only what has already happened.

Where Reachability Analyzer is especially strong in practice is **when several layers are tangled at once**. When people look by hand, they check one at a time — fix the SG then look at the NACL, fix the NACL then look at routing — so the back-and-forth gets long. Reachability Analyzer computes the whole path at once and points to the "blocking component," so the fix-and-rerun cycle is short. However, this is a **configuration-based determination**, so it cannot catch OS firewalls (iptables, Windows Defender Firewall) or problems where the application isn't listening. If you remember that item ⑥ in the earlier AND condition table is an area AWS cannot see, you won't flounder in the situation where "every AWS control is green and yet it still won't connect."

## When Widening the Boundary: Peering, Transit Gateway, VPC Sharing

Isolation is easy when there is one VPC. The trouble starts the moment you begin connecting. Each connection method exposes a different surface, and the exam asks about these differences.

| Connection method | Exposed surface | Caveat |
|-------------------|-----------------|--------|
| VPC Peering | The CIDRs of the two VPCs are visible to each other | **No transitive routing** — even with A-B and B-C, A-C cannot communicate. Impossible if CIDRs overlap |
| Transit Gateway | All connected VPCs are potentially visible to each other | Unless you split domains with **separate routing tables**, it becomes a flat network across all accounts |
| PrivateLink | Only the one service the provider exposes is visible | The smallest exposed surface (Day 4) |
| VPC sharing (RAM) | Participant accounts create resources in the same subnet | The owner account holds routing and NACLs; participants manage only their own resources |

Treating Transit Gateway as a "router you just connect" is the most common design mistake. TGW's default behavior is to put all attachments into one routing table and let them talk to each other, which turns dozens of accounts into one flat network. If isolation is needed, you must **split TGW route tables by purpose** (e.g., prod / nonprod / shared-services) and specify for each attachment which table it associates with and which table it propagates to. The answer to the question "if a development account is compromised, can it reach the production DB over the network?" is decided here.

Security group references (specifying another SG as the source) always work within the same VPC, but **there are conditions when crossing a VPC boundary.** SG references are possible between two VPCs connected by VPC Peering within the same Region. On the other hand, SG references do not apply to traffic going through Transit Gateway, so you must write CIDRs. If you don't know this constraint at the design stage, rules you planned to write cleanly with SG references can all end up unrolled into CIDRs when TGW is introduced. And the moment they're unrolled into CIDRs, whether you made a contiguous per-tier address plan determines the number of rules — the earlier CIDR planning section comes back around here.

## Wrap-Up

There are four pictures to take away today. First, Internet reachability holds as an **AND of conditions** and blocking is an **OR** — cutting any one of the public address, IGW routing, NACL, SG, response path, or listening process blocks it, and the cheapest, most reliable node among them is routing. Second, a VPC is a strong isolation boundary, and even if IPs overlap, the software layer enforces ownership. Third, a subnet's Public/Private is not an attribute but is **decided by routing**, and a subnet with no explicit association follows the Main Route Table, so never put an IGW route in Main. Fourth, 3-Tier (Public/App/Data) isolation is the network implementation of defense in depth, and the standard is to express allows between tiers by **SG reference** rather than CIDR.

There is one more perspective added today. **The doors leading out are not just one.** Direct IGW, NAT, Egress-only IGW, bypasses through peering/TGW/VPN, endpoints, and even DNS — if you delete only NAT to prevent exfiltration, the rest remain. The habit of auditing with this list of doors in hand is what actually achieves the goal of a "zero-internet VPC."

Exposure determination can be done by hand or with tools. Remember the order: use `describe-route-tables` to first pin down the subnets that have an Internet route and narrow down only within them; use **Reachability Analyzer** when there is a specific source and destination, and **Network Access Analyzer** to continuously watch for unintended paths. Both tools judge statically from the configuration alone, so they find exposure even without traffic, but also remember their limitation: they cannot see OS firewalls or whether the application is listening.

The ability to answer "does the Internet reach this resource?" by weighing routing, Public IP, SG, and NACL together is the starting point of a security engineer. In the next note, we look closely at the easily confused **difference between security groups and NACLs** from the stateful/stateless viewpoint.

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
