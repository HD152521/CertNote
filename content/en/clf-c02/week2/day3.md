# Day 3 - Networking Basics: VPC, Subnets, Security Groups, Internet Gateway

Now that we've seen servers (EC2) and storage (S3/EBS), it's time to look at the "neighborhood" they live in. The private network space where your resources live together inside the cloud is exactly the VPC. CLF-C02 doesn't dig deep into networking, but it will absolutely ask about the basic skeleton: "what a VPC is, and how subnets, security groups, and the internet gateway fit together."

Today, using the analogy of building a house, we'll lay out the four networking parts at an intro level — the VPC (the land), subnets (the rooms), the internet gateway (the front gate), and security groups (the gatekeeper).

## VPC: Your Own Private Virtual Network

A VPC (Virtual Private Cloud) is **a logically isolated, dedicated network you own inside the AWS cloud**. It's your own private space that doesn't get mixed in with anyone else's resources. When you create an EC2, it launches inside some VPC.

By analogy, a VPC is **the plot of land you've been allotted**. On this land you put up buildings (servers), divide it into zones (subnets), install a front gate (internet gateway), and post a guard (security group).

> 💡 **Related theory**: A VPC is created at the Region level, and within it you can place resources across multiple Availability Zones (AZs). When you create a VPC you set an IP address range (a CIDR block, e.g., `10.0.0.0/16`), which is the act of defining "the range of addresses usable on this land." At an intro level, it's enough to understand "VPC = my private IP address space."

## Subnets: The Zones That Divide a VPC

Rather than use the whole plot of land that is a VPC, you usually divide it by purpose into smaller zones called **subnets**. A subnet is a unit that finely slices the IP address range within a VPC. The two most common distinctions are:

| Subnet type | Characteristics | Example resources placed |
|-------------|------|---------------|
| Public Subnet | Can communicate with the internet directly | Web servers, load balancers |
| Private Subnet | Not directly accessible from the internet | Databases, internal servers |

The key point is **"separating what must be exposed to the internet from what must be hidden."** A web server has to receive external requests, so it goes in a public subnet; a DB holding sensitive data goes in a private subnet so it can't be reached directly from outside.

> 💡 **Related theory**: Each subnet exists within a single Availability Zone (AZ). So for high availability you usually distribute subnets across multiple AZs, like "public/private subnets in AZ-a, public/private subnets in AZ-b." This is so that even if one AZ fails, the service continues in another AZ.

> ⚠️ **Pitfall**: A subnet becomes "public" not simply because of its name, but **because its route table has a route to the internet gateway**. With the same settings, if there's no route to the internet gateway, that subnet is private.

## Internet Gateway: The VPC's Front Gate

For resources inside a VPC to communicate with the internet, you need an **Internet Gateway (IGW)**. Think of it as the **front gate** attached to the VPC. Without this gate, no server inside the VPC can go out to the internet or be reached from the internet.

Two conditions must both be met for a server in a public subnet to communicate with the internet:

1. An internet gateway must be attached to the VPC (there must be a gate).
2. The subnet's route table must have a route that says "traffic bound for the internet goes to the gateway."

> 💡 **Related theory**: When you want a server in a private subnet to "block inbound from the internet but allow outbound (e.g., software updates)," you use a **NAT Gateway**. At an intro level, it's enough to distinguish "IGW = a two-way internet passage, NAT = a one-way (outbound only) passage for private resources."

## Security Groups: The Gatekeeper in Front of a Resource

What controls the traffic coming into and out of a resource (especially EC2) is the **Security Group**. Think of it as the **gatekeeper** standing in front of each EC2. It defines rules for "which port, and traffic from where, to allow."

Two important properties of security groups:

- **Allow rules only**: There are no separate "deny" rules. Any traffic you don't explicitly allow is automatically blocked.
- **Stateful**: If you allow something inbound, the response to it (outbound traffic) is automatically allowed without a rule.

| Example rule | Meaning |
|-----------|------|
| Allow inbound HTTP (80), source 0.0.0.0/0 | Anyone can connect over the web (port 80) |
| Allow inbound SSH (22), source my IP only | Only I can SSH into the server |
| (Any inbound not in the rules) | Automatically blocked |

> 💡 **Related theory**: Similar to but different from a security group is a **Network ACL (NACL)**. A security group is a gatekeeper at the "resource (EC2) level" and remembers state (stateful), while a NACL is a gatekeeper at the "subnet level," does not remember state (stateless), and can use both allow and deny rules. At an intro level, it's enough to distinguish "security group = instance firewall (stateful), NACL = subnet firewall (stateless)."

## The Picture of the Four Parts Fitting Together

Let's combine the four parts so far into a single house diagram.

```
[ VPC = my private network (the land) ]   CIDR 10.0.0.0/16

   ┌──────────────── Internet Gateway (front gate) ────────────────┐
   │                                                         │
 [ Public Subnet ]                       [ Private Subnet ]
  Routing: → IGW                          Routing: no IGW route
  ┌───────────────┐                      ┌───────────────┐
  │  Web server(EC2) │                   │  DB server(EC2)  │
  │  ↑ security group │  ── internal ──► │  ↑ security group │
  │  (gatekeeper)   │                    │  (gatekeeper)    │
  └───────────────┘                      └───────────────┘
   Port 80 open externally               Port 3306, web server only
```

Trace the flow: a user comes in from the internet → passes through the internet gateway (front gate) → reaches the web server in the public subnet → and passes because the security group (gatekeeper) in front of the web server allowed port 80. The web server, in turn, accesses the DB in the private subnet over internal communication, and the DB's security group allows "only what comes from the web server." The DB has no route to the internet gateway, so it can't be reached directly from outside.

> 🎯 **Scenario**: "The web server must be accessible from the internet, but the database must never be directly accessible from outside." → Put the web server in a public subnet and the DB in a private subnet. Configure the DB's security group to allow only traffic coming from the web server's security group. This is the most basic and secure two-tier setup.

## Wrapping Up

Today we looked at networking through the house-building analogy. A VPC is **your dedicated land (private network)**, subnets are **zones by purpose** (public that you expose to the internet vs. private that you hide), the internet gateway is **the VPC's front gate**, and security groups are **the gatekeeper in front of each resource** (allow rules only, stateful). Remember that the real criterion separating public from private isn't the name but "whether the route table has a route to the internet gateway."

Tomorrow we move to the edge services that deliver content to users faster from outside this network — CloudFront and Route 53.

---

## 📝 연습 문제

**문제 1.** What refers to the logically isolated, dedicated virtual network a user owns inside the AWS cloud?

A) S3 bucket  
B) VPC  
C) Security group  
D) Internet gateway  

**정답: B**  
해설: A VPC (Virtual Private Cloud) is the logically isolated, private network space a user owns inside the AWS cloud. An S3 bucket is a container for object storage, a security group is a resource-level firewall, and an internet gateway is the passage for a VPC to communicate with the internet — so none of them is the network space itself.

---

**문제 2.** You want to protect a database server so it can't be accessed directly from the internet. What is the most appropriate placement?

A) Put it in a public subnet and open all ports with the security group  
B) Put it in a private subnet and allow access only from web servers in the same VPC  
C) Put the database in an S3 bucket  
D) Attach an internet gateway directly to the database  

**정답: B**  
해설: The standard is to put a resource that must not be directly accessible from the internet in a private subnet with no route to the internet gateway, and use the security group to allow only traffic coming from trusted internal resources (the web servers). Putting it in a public subnet with all ports open is the opposite and dangerous; putting a DB in S3 doesn't make sense conceptually; and attaching an IGW directly to the DB would expose it externally.

---

**문제 3.** Which statement about a Security Group is correct?

A) Only explicitly allowed traffic passes, and response traffic is automatically allowed (stateful)  
B) You must explicitly write deny rules to block traffic  
C) It applies at the subnet level and does not remember state  
D) It is the passage that connects the internet and the VPC  

**정답: A**  
해설: A security group uses allow rules only (any traffic not explicitly allowed is automatically blocked) and is stateful, so if you allow inbound, the corresponding outbound response is automatically allowed without a rule. Writing separate deny rules is the NACL's way (B is wrong), subnet-level and stateless are also NACL characteristics (C is wrong), and the internet-connection passage is the internet gateway (D is wrong).

---

**문제 4.** What is the direct condition that makes a subnet act as a "public subnet"?

A) The subnet's name contains "public"  
B) The route table has a route to the internet gateway  
C) The subnet has at least one EC2  
D) The subnet has the largest IP range  

**정답: B**  
해설: A subnet becomes public not because of its name but because its route table has a route pointing to the internet gateway. With the same settings, if that route is absent, it's a private subnet. The name (A), the presence of an EC2 (C), and the size of the IP range (D) do not determine public vs. private.

---

**문제 5.** Which component, attached to a VPC, lets resources inside the VPC communicate two-way with the internet?

A) Security group  
B) Internet Gateway  
C) EBS volume  
D) Lifecycle policy  

**정답: B**  
해설: An internet gateway is attached to a VPC and serves as the "front gate" that lets resources inside the VPC communicate with the internet. A security group does resource-level traffic control, an EBS volume is block storage, and a lifecycle policy is an S3 object management rule — none of which is the internet-communication passage.

---
