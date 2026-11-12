# Day 3 - Networking Basics: VPC, Subnets, Security Groups, Internet Gateway

Now that we have seen servers (EC2) and storage (S3, EBS), it is time to look at the "neighborhood" they live in. The private network space where my resources gather inside the cloud is the VPC. CLF-C02 does not dig deep into networking, but it will definitely ask the basic skeleton: "what is a VPC, and how do subnets, security groups, and the internet gateway fit together."

Today, using a house-building analogy, we lay out the four parts of networking at an introductory level: the VPC (the land), subnets (the rooms), the internet gateway (the front gate), and the security group (the gatekeeper).

## The Office Network Before the Cloud

The quickest way to understand a VPC is to picture **a company office network**.

Suppose a company uses one floor of a building. One internet line comes in, and from it LAN cables extend to each seat's PC and to the server room. Devices inside the company communicate freely, but **from outside, you cannot see in.** And even within the floor, areas are divided: a lobby where guests come and go, an office space only employees enter, and a server room nobody can just walk into.

Move it to the cloud and this picture stays the same with only the names changed.

| Office | AWS |
|--------|-----|
| The whole floor our company uses | VPC |
| Areas like the lobby / server room | Subnets (public / private) |
| The main entrance leading out of the building | Internet gateway |
| Access control at each room's door | Security group |
| The signboard saying "to get there, take this hallway" | Route table |

Before the cloud, all of this was **physical equipment**. You bought switches, plugged in LAN cables, installed firewall appliances, and to divide areas you had to redo the wiring. The essence of a VPC is that **it lets you create and change this network configuration through software settings alone, with no physical work.** Creating a new zone takes seconds, not days.

## VPC: My Own Virtual Network

A VPC (Virtual Private Cloud) is **a logically isolated, dedicated network that I own inside the AWS cloud**. It is my own private space that is not mixed with anyone else's resources. When you create an EC2 instance, it starts inside some VPC.

As an analogy, a VPC is **the land I was allotted**. On this land you build buildings (servers), divide zones (subnets), put up a front gate (internet gateway), and post guards (security groups).

A VPC is created per Region, and within it you can place resources across multiple Availability Zones (AZs). When creating a VPC you decide the IP address range (a CIDR block, e.g., `10.0.0.0/16`), which is the job of setting "the range of addresses usable on this land." At the introductory level, understanding "VPC = my private IP address space" is enough.

### CIDR Notation: A Part You Need Not Be Afraid Of

At first sight, notation like `10.0.0.0/16` looks like a cipher. But the only understanding CLF-C02 requires is that it is **"a way of writing an address range,"** and questions that compute masks do not appear. The number after the slash is **"how many leading bits are fixed,"** and the larger the number, the **narrower the range.**

```
10.0.0.0/16   → first two blocks (10.0) fixed      → wide range    → good for a whole VPC
10.0.1.0/24   → first three blocks (10.0.1) fixed  → narrow range  → good for one subnet
0.0.0.0/0     → nothing fixed                      → all addresses → means "from anywhere / to anywhere"
```

Remember the last line especially. In a security group rule, a source of `0.0.0.0/0` means "anyone can connect," and a routing destination of `0.0.0.0/0` means "all other destinations."

> ⚠️ **Pitfall**: Leaving SSH (port 22) inbound open to `0.0.0.0/0` is a classic security mistake. Web (80, 443) must be reachable by anyone, so that is natural, but the administrator access port should be narrowed to a specific range such as the company IP. An option that "leaves SSH open to the whole world" is wrong.

## Subnets: Zones That Divide a VPC

Rather than using the whole VPC land as one piece, you usually divide it by purpose into small zones called **subnets**. A subnet is a unit that slices the VPC's IP address range into smaller pieces. The two most common divisions are as follows.

| Subnet type | Characteristics | Example resources placed |
|-------------|------|---------------|
| Public Subnet | Can communicate directly with the internet | Web servers, load balancers |
| Private Subnet | Cannot be accessed directly from the internet | Databases, internal servers |

The key is **"separating what must be exposed to the internet from what must be hidden."** A web server must receive external requests, so it goes in a public subnet, and a DB holding sensitive data goes in a private subnet so it cannot be reached directly from outside.

Each subnet exists inside a single Availability Zone (AZ). So for high availability, you usually spread subnets across several AZs, like "public/private subnets in AZ-a, public/private subnets in AZ-b." This is so that if one AZ fails, the service continues in the other AZ.

> ⚠️ **Pitfall**: A subnet becomes "public" not simply because of its name but **because its route table has a route to the internet gateway**. Even with otherwise identical settings, if there is no route to the internet gateway, that subnet is private.

### Route Tables: The Signboards Inside the Building

A **route table** is the **signboard** attached to each subnet. It is a list of rules saying "to get to this destination, go through that door," and traffic looks at this signboard to decide its next stop.

| Destination | Target | Meaning |
|--------|------|-----|
| `10.0.0.0/16` | local | Traffic to addresses inside the VPC is handled internally |
| `0.0.0.0/0` | Internet gateway | Everything else is sent out the front gate |

A subnet with the two lines above is a **public subnet**. Without the second line, it can only communicate within the VPC, so it becomes a **private subnet**. The difference is exactly one line.

Every route table automatically contains the `local` route, and it cannot be deleted. That is why **resources in the same VPC can communicate with each other without any extra setup** (as long as the security group allows it). This is why a configuration like "a web server accesses the DB in a private subnet" is natural.

### A Representative Layout: The Two-Tier Web Architecture

If you get familiar with the most common VPC layout in practice as a diagram, questions read much faster.

```
[ VPC 10.0.0.0/16 ]

  ── Availability Zone A ──────      ── Availability Zone B ──────
   Public subnet 10.0.1.0/24         Public subnet 10.0.2.0/24
     · Web server / load balancer      · Web server / load balancer
     · Route: 0.0.0.0/0 → IGW          · Route: 0.0.0.0/0 → IGW

   Private subnet 10.0.11.0/24       Private subnet 10.0.12.0/24
     · Application / DB                · Application / DB
     · Route: no IGW route             · Route: no IGW route
```

The structure is set along two axes. **Vertically, separate public and private to control exposure**, and **horizontally, replicate the same structure across two or more AZs so the service continues even if one AZ dies.** The most basic answer to "how do you secure High Availability" is this horizontal replication.

## Internet Gateway: The VPC's Front Gate

For resources in a VPC to communicate with the internet, an **Internet Gateway (IGW)** is needed. Think of it as the **front gate** attached to the VPC. Without this gate, no server in the VPC can go out to the internet or be reached from the internet.

For a server in a public subnet to communicate with the internet, two conditions must both hold:

1. An internet gateway must be attached to the VPC (the gate must exist).
2. The subnet's route table must have a route saying "traffic bound for the internet goes to the gateway."

When you want a server in a private subnet to "block what comes in from the internet but allow what goes out (e.g., software updates)," you use a **NAT Gateway**. At the introductory level, it is enough to distinguish "IGW = a two-way internet passage, NAT = a one-way (outbound only) passage for private resources."

### The Problem a NAT Gateway Solves

Consider a DB server in a private subnet. Inbound connections from outside must never be allowed. But this server also sometimes needs to **go out**: it downloads security patches and checks for OS updates. If you open a route to the internet gateway, it can go out, but at the same time **the door for coming in opens too.**

A NAT gateway resolves this dilemma. Traffic from the private subnet goes out to the internet through a NAT gateway placed in a public subnet and the responses come back, but **the internet side cannot initiate contact first.** In company terms, it is a back door where "employees can go out and buy things, but outsiders cannot come in through that passage."

```
[ Private subnet ]         [ Public subnet ]
   DB server  ──────────►  NAT gateway ──► IGW ──► Internet
   ✗ Attempt to connect first from the internet to the DB server → impossible
```

**Pitfall**: A NAT gateway must be **placed in a public subnet**. It can send others out only if it can itself go out to the internet. An option that "puts the NAT gateway in a private subnet" is wrong.

## Security Group: The Gatekeeper in Front of a Resource

What controls the traffic coming into and going out of a resource (especially EC2) is the **Security Group**. Think of it as the **gatekeeper** standing in front of each EC2 instance. You set by rules "traffic from where, on which port, to allow."

Two important properties of security groups:

- **Allow rules only**: You do not write "deny" rules separately. Traffic not explicitly allowed is automatically blocked.
- **Stateful**: If you allow something coming in, the response to it (outgoing traffic) is automatically allowed without a rule.

| Example rule | Meaning |
|-----------|------|
| Allow inbound HTTP (80), source 0.0.0.0/0 | Anyone can connect over web (port 80) |
| Allow inbound SSH (22), source my IP only | Only I can connect to the server via SSH |
| (All inbound not in the rules) | Automatically blocked |

Similar to a security group but different is the **Network ACL (NACL)**. A security group is a gatekeeper at the "resource (EC2) level" and remembers state (Stateful), whereas a NACL is a gatekeeper at the "subnet level," does not remember state (Stateless), and can use both allow and deny rules. At the introductory level, it is enough to distinguish "security group = instance firewall (Stateful), NACL = subnet firewall (Stateless)."

### Security Group vs Network ACL: An Easily Confused Comparison

Distinguishing these two is an item within the CLF-C02 scope. Let us pin it down in a table.

| Comparison item | Security Group | Network ACL (NACL) |
|-----------|--------------------------|-------------------|
| Applied to | An instance (precisely, a network interface) | The whole subnet |
| Rule types | Allow only | Both Allow and Deny |
| State memory | **Stateful**: responses are automatically allowed | **Stateless**: rules needed for inbound and outbound separately |
| Default behavior | Everything except explicit allows is blocked | The default NACL allows everything |
| Location analogy | A guard in front of each room | A checkpoint at the floor entrance |

**The word "stateful" is especially confusing.** A security group is "a guard who remembers who came in," so when the visitor leaves it does not ask again. A NACL, on the other hand, is "a checkpoint that remembers nothing," so there must be a passage rule once on the way in and again on the way out.

**Pitfall**: The consequence of statelessness appears on the exam just as it is. If a NACL allows only inbound HTTP (80) and does not open outbound, **the request comes in but the response cannot go out, so communication fails.** With a security group this does not happen. When "I opened only inbound, so why doesn't it work?" appears, suspect the NACL.

In practice, security groups are usually the main tool and NACLs are left at their defaults. The representative situation where a NACL becomes useful is **"when you want to block a specific IP range across the whole subnet."** A security group can only write allow rules, so "block just this IP" is impossible, but a NACL blocks it in one line with a Deny rule. **"A specific IP must be blocked" = NACL** is an exam keyword as it is.

## The Picture Where the Four Parts Fit Together

Let us combine the four parts so far into a single picture of a house.

```
[ VPC = my private network (the land) ]   CIDR 10.0.0.0/16

   ┌──────────────── Internet Gateway (front gate) ────────────────┐
   │                                                                │
 [ Public subnet ]                       [ Private subnet ]
  Route: → IGW                           Route: no IGW route
  ┌───────────────┐                      ┌───────────────┐
  │  Web server(EC2)│                    │  DB server(EC2)│
  │  ↑ Security group│  ── internal ───► │  ↑ Security group│
  │  (gatekeeper)   │     traffic        │  (gatekeeper)   │
  └───────────────┘                      └───────────────┘
   Port 80 allowed externally             Port 3306 allowed from web server only
```

Following the flow: when a user comes in from the internet, they pass the internet gateway (front gate), reach the web server in the public subnet, and pass because the security group (gatekeeper) in front of the web server allowed port 80. The web server in turn accesses the DB in the private subnet via internal communication, and the DB's security group allows "only what comes from the web server." Since the DB has no route to the internet gateway, it cannot be reached directly from outside.

> 🎯 **Scenario**: "The web server must be reachable from the internet, but the database must never be accessed directly from outside." → Put the web server in a public subnet and the DB in a private subnet. Configure the DB's security group to allow only traffic coming from the web server's security group. This is the most basic and safe two-tier layout.

## Other Passages Connecting a VPC to the Outside

The internet gateway is not the VPC's only entrance. CLF-C02 does not go deep on each, and asks only **"what to use in which situation."**

| Passage | Connects to | When to use |
|------|----------|-------------------|
| Internet gateway (IGW) | Internet | VPC resources communicate two-way with the internet |
| NAT gateway | Internet (outbound only) | When private resources must receive updates |
| VPC endpoint | AWS services such as S3 and DynamoDB | Access AWS services without going through the internet |
| Site-to-Site VPN | Company data center | Quickly set up an encrypted tunnel over the existing internet line |
| AWS Direct Connect | Company data center | A stable, high-bandwidth connection over a dedicated physical line |
| VPC peering | Another VPC | A private 1:1 connection between two VPCs |

Let us pick out two.

A **VPC endpoint** solves the question "why should traffic go out to the internet and come back just to reach an AWS service?" When you create an endpoint, when an EC2 instance in a private subnet accesses S3, **the traffic goes straight through the AWS internal network.** It benefits both security and cost.

**VPN and Direct Connect** are both passages "connecting the company data center and AWS," but differ in nature. A VPN lays an encrypted tunnel over the existing internet line, so **it is set up quickly but performance depends on internet conditions.** Direct Connect is a method of **physically laying a dedicated line**, so it takes time to prepare but gives **consistent performance and bandwidth**.

> 🎯 **Scenario**: "Large amounts of data go back and forth between the headquarters data center and AWS every day, and performance must be predictable." → **Direct Connect**. If it is "quick and cheap, connect first," it is **Site-to-Site VPN**. If the question shows "dedicated" or "consistent performance," Direct Connect; if it shows "quick setup" or "encryption over the internet," VPN.

## How This Shows Up on the Exam: Keyword → Answer Mapping

Networking questions are ultimately a keyword contest too. Get your eyes used to the pairs below.

| Phrase in the question | Answer candidate |
|-------------------|----------|
| A logically isolated virtual network of my own | VPC |
| Must be directly accessible from the internet | Public subnet |
| Must not be directly accessed from the internet (DB, etc.) | Private subnet |
| VPC communicates two-way with the internet | Internet gateway |
| Private resources must only go outbound (patches, etc.) | NAT gateway |
| Instance-level firewall, responses automatically allowed | Security group (Stateful) |
| Subnet-level firewall, separate rules for in and out | Network ACL (Stateless) |
| A specific IP must be explicitly blocked | Network ACL (Deny rule) |
| Rules deciding which traffic goes where | Route table |
| Access S3 without going through the internet | VPC endpoint |
| Data center and AWS over a dedicated line | Direct Connect |
| Data center and AWS over an encrypted tunnel on the internet | Site-to-Site VPN |
| Service continues through one AZ failure | Spread subnets across multiple AZs |

**Pitfall**: A plausible wrong answer in "how do you strengthen security?" type questions is **"open all ports and inspect in the application."** AWS's basic principle is **least privilege**, and among the options the one that narrows the scope is the answer candidate.

## Wrapping Up

Today we looked at networking through the house-building analogy. A VPC is **my own land (private network)**, subnets are **zones by purpose** (public, exposed to the internet, vs private, hidden), the internet gateway is **the VPC's front gate**, and the security group is **the gatekeeper in front of each resource** (allow rules only, stateful). Remember that the real criterion separating public from private is not the name but "whether the route table has a route to the internet gateway."

Layering on what we added today: the **route table is the signboard**, the **NAT gateway is a back door that only lets traffic out**, and the contrast between the **security group (instance, Stateful, allow only) and NACL (subnet, Stateless, can deny)** is the pair the exam checks most often. And the basic form of high availability is always **replicating the same structure across two or more AZs**.

To sum up, networking questions reduce to two questions: **"where can this traffic go (routing)"** and **"is passage allowed there (security group, NACL)."** Once the habit of thinking about these two separately takes hold, even scenarios that look complicated are solved quickly.

Tomorrow we move to the edge services that deliver content to users faster from outside this network: CloudFront and Route 53.

---

## 📝 Practice Questions

**Question 1.** What refers to the logically isolated, dedicated virtual network a user owns inside the AWS cloud?

A) S3 bucket  
B) VPC  
C) Security group  
D) Internet gateway  

**Answer: B**  
Explanation: A VPC (Virtual Private Cloud) is the logically isolated, private network space a user owns inside the AWS cloud. An S3 bucket is a container for object storage, a security group is a resource-level firewall, and an internet gateway is the passage for a VPC to communicate with the internet — so none of them is the network space itself.

---

**Question 2.** You want to protect a database server so it can't be accessed directly from the internet. What is the most appropriate placement?

A) Put it in a public subnet and open all ports with the security group  
B) Put it in a private subnet and allow access only from web servers in the same VPC  
C) Put the database in an S3 bucket  
D) Attach an internet gateway directly to the database  

**Answer: B**  
Explanation: The standard is to put a resource that must not be directly accessible from the internet in a private subnet with no route to the internet gateway, and use the security group to allow only traffic coming from trusted internal resources (the web servers). Putting it in a public subnet with all ports open is the opposite and dangerous; putting a DB in S3 doesn't make sense conceptually; and attaching an IGW directly to the DB would expose it externally.

---

**Question 3.** Which statement about a Security Group is correct?

A) Only explicitly allowed traffic passes, and response traffic is automatically allowed (stateful)  
B) You must explicitly write deny rules to block traffic  
C) It applies at the subnet level and does not remember state  
D) It is the passage that connects the internet and the VPC  

**Answer: A**  
Explanation: A security group uses allow rules only (any traffic not explicitly allowed is automatically blocked) and is stateful, so if you allow inbound, the corresponding outbound response is automatically allowed without a rule. Writing separate deny rules is the NACL's way (B is wrong), subnet-level and stateless are also NACL characteristics (C is wrong), and the internet-connection passage is the internet gateway (D is wrong).

---

**Question 4.** What is the direct condition that makes a subnet act as a "public subnet"?

A) The subnet's name contains "public"  
B) The route table has a route to the internet gateway  
C) The subnet has at least one EC2  
D) The subnet has the largest IP range  

**Answer: B**  
Explanation: A subnet becomes public not because of its name but because its route table has a route pointing to the internet gateway. With the same settings, if that route is absent, it's a private subnet. The name (A), the presence of an EC2 (C), and the size of the IP range (D) do not determine public vs. private.

---

**Question 5.** Which component, attached to a VPC, lets resources inside the VPC communicate two-way with the internet?

A) Security group  
B) Internet Gateway  
C) EBS volume  
D) Lifecycle policy  

**Answer: B**  
Explanation: An internet gateway is attached to a VPC and serves as the "front gate" that lets resources inside the VPC communicate with the internet. A security group does resource-level traffic control, an EBS volume is block storage, and a lifecycle policy is an S3 object management rule — none of which is the internet-communication passage.

---
