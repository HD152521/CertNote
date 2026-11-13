# Day 2 - Security Groups vs Network ACLs: The Essence of Stateful and Stateless

Inside a VPC there are two layers of firewall: security groups (SG) and network ACLs (NACL). If you cannot distinguish the two precisely, you get stuck repeatedly, both on the exam and in real-world troubleshooting. Questions like "I opened everything on the SG, so why doesn't the response come back?" or "I only opened inbound on the NACL, so why doesn't the communication work?" almost all come from missing the difference between **stateful and stateless**.

Today we sort out the two from first principles. We cover the evaluation order, the difference in state tracking, and the most common troubleshooting scenarios in practice. This is a core topic that appears in nearly every sitting of SCS-C03 Domain 3.

## Where the Two Firewalls Sit: What They Attach To

```
Internet
  │
[ NACL ]  ← attached at the subnet boundary (per subnet)
  │
[ Security group ]  ← attached to the ENI (instance) (per resource)
  │
[ EC2 instance ]
```

- **NACL**: Operates at the subnet boundary. It inspects all traffic entering and leaving the subnet.
- **Security group**: Operates per ENI (Elastic Network Interface), that is, per instance. The firewall closest to the resource.

| Item | Security group (SG) | Network ACL (NACL) |
|------|---------------------|--------------------|
| Applies to | ENI / instance | Subnet |
| State | **Stateful** | **Stateless** |
| Rules | Allow only | Allow + **Deny possible** |
| Evaluation | All rules evaluated together | In rule-number order, stops at the first match |
| Default behavior | Inbound blocked / outbound allowed | (Default) allow all / (custom) deny all |

This dual structure is the **layering** principle of network security. The NACL is a coarse-grained control applied to the whole subnet; the SG is fine-grained control per resource. It is exactly the same philosophy as splitting router ACLs (subnet boundary) from host firewalls (per server) in a traditional data center. You use the NACL to impose mandatory rules on the entire subnet such as "this port is absolutely forbidden," and the SG to manage the precise allows for each resource.

## Stateful vs Stateless: The Most Important Difference

This one point is the foundation of NACL questions.

**Security group (stateful)**: If you allow inbound, the **response (outbound) is automatically allowed without a rule**. This is because it tracks connection state. The reverse is also true — the inbound response to a request that went out is automatically allowed.

**NACL (stateless)**: It does not track state. Even if you allowed the inbound request, you must **separately and explicitly allow the outbound** that the response leaves on. The response usually goes out on an **ephemeral port (1024–65535)**, so you must open that range in the NACL outbound.

```
# Scenario: Internet access to a web server (443)

[Security group]
  Inbound: TCP 443 from 0.0.0.0/0   ← this alone is enough
  (response outbound automatically allowed - stateful)

[NACL]  ← must state both (stateless)
  Inbound: rule 100  TCP 443  from 0.0.0.0/0  ALLOW
  Outbound: rule 100  TCP 1024-65535  to 0.0.0.0/0  ALLOW  ← ephemeral ports required!
```

Reading it in prose is confusing, so it is faster to overlay a picture of **how each of the two firewalls sees the same round trip**. The diagram below is the most important picture in this entire note.

```
[ How the SG and NACL see the same round trip (request/response) ]

  Client 203.0.113.10:51000            Server 10.0.1.20:443
        │                                      │
  ①Req  │  src 203.0.113.10:51000              │
        │  dst 10.0.1.20:443                   │
        ├──▶ [NACL inbound] needs a 443 ALLOW rule ─┐
        │                                           │
        │                          [SG inbound] needs 443 ALLOW
        │                                           ▼
        │                                     Server processes
  ②Resp │  src 10.0.1.20:443                   │
        │  dst 203.0.113.10:51000              │
        │                          [SG outbound] ← not evaluated
        │                            (remembers ①, so automatically allowed)
        │                                           │
        ◀── [NACL outbound] ─────────────────────────┘
             Dies here without a 1024-65535 ALLOW
             (the NACL does not remember ①)

  ── Note that the ports are swapped: the response's destination port is not 443
     but the 51000 the client picked. If you open only 443 in the NACL outbound,
     the response gets blocked at exactly this point.
```

This picture says just one thing. **The SG remembers ① and the NACL does not.** Stateful/stateless is just another way of saying "does it remember ①?", and because it doesn't remember, the NACL treats the response as *new traffic* and evaluates it from scratch. And the destination port of that new traffic is not the service port but the ephemeral port the client chose at random.

For the same reason, **communication initiated outbound** is mirrored symmetrically. When an instance calls an external API (443), the request is `src 10.0.1.20:47000 → dst 1.2.3.4:443` and the response is `src 1.2.3.4:443 → dst 10.0.1.20:47000`. In this case 1024-65535 must be open in the NACL **inbound** for the response to come in. The question "I didn't open anything inbound, so why must I open it?" arises here, and the answer is the same — to the NACL, that response is just traffic newly arriving inbound.

> ⚠️ **Pitfall**: The classic trap is exactly these **ephemeral ports**. The answer to the scenario "I opened 443 in NACL inbound but the web response doesn't come back" is almost always "the outbound ephemeral ports (1024-65535) are blocked." With an SG, this problem doesn't exist because it is stateful. Note also that the ephemeral port range differs by operating system (Linux 32768-60999, Windows Server 2008+ 49152-65535, NAT Gateway 1024-65535). So you usually open all of 1024-65535 to be safe.

There is one subtle exception to stateful tracking. What happens if you allow an inbound rule in a security group and then **delete the rule while the connection is alive**? For TCP, an already established connection continues to be tracked by the security group, so it can persist. A NACL, by contrast, is stateless, so a rule change applies immediately from the next packet. So when an "emergency block" is needed, a NACL Deny rule is more immediate than an SG. However, connection tracking cleanup is released on idle timeout or under certain conditions.

### What Connection Tracking Actually Does, and What It Doesn't

Behind the word "stateful" is a real thing called the **connection tracking table**. When a security group allows traffic, the 5-tuple of that flow (source IP and port, destination IP and port, protocol) is recorded as an entry. Afterwards, packets belonging to that flow pass through with only a table lookup, without re-evaluating the rules. Three practically important consequences follow from this.

First, **deleting a rule does not immediately cut a connection in progress.** This is why the situation "I closed the SG but the attacker's session is still alive" happens in incident response. To cut it for certain, either add a NACL Deny (applies immediately from the next packet), or swap the instance to an isolation SG and force-terminate the session.

Second, connection tracking entries are not unlimited. When the number of entries nears the limit for the instance type, new connections start to fail, and this failure shows up in application logs only as a "connection timeout," making the cause hard to identify. So for workloads handling large numbers of connections, it is worth knowing **which rules trigger tracking**. A flow whose rules are fully open to `0.0.0.0/0` in both inbound and outbound, with all protocols and ports allowed, can be untracked. That is, there is the somewhat paradoxical property that **a moderately open rule carries a greater tracking burden than a fully open rule**. It is practical knowledge rather than exam material, but it is the background to the case where "narrowing the SG caused problems on a server with many connections."

Third, **UDP and ICMP are also tracked.** Even though these are protocols with no notion of a connection, the SG creates state per flow and allows the response. So the common misconception that "UDP is stateless, so you must open both directions in the SG too" is wrong. When opening UDP-based services (DNS 53, NTP 123, QUIC 443) with an SG, you only need one direction of inbound. In a NACL, on the other hand, UDP too must state both directions without exception.

```
[ When an emergency block is needed, what takes effect when ]

  Already-established malicious session       New incoming connection
        │                                      │
  Delete SG rule ───────▶ Not cut immediately    ──▶ Blocked immediately
  Add NACL Deny ────────▶ Blocked from next pkt  ──▶ Blocked immediately
  Swap to isolation SG ─▶ Tracking reset, cut    ──▶ Blocked immediately
  Detach/stop instance ─▶ Definitely cut         ──▶ Definitely blocked

  → Incident response order: NACL Deny (broad, immediate) → isolation SG (targeted) → snapshot/forensics
     The trick is not to reverse the order of "blocking" and "preserving evidence."
     If you terminate the instance first, the memory evidence disappears.
```

## NACL Evaluation Order: Rule Numbers Decide Fate

The NACL differs decisively from the SG. It **evaluates in order starting from the lowest rule number** and **ends evaluation at the first match** (first-match wins).

```
Inbound NACL rules:
  Rule 90:   DENY  TCP 22 from 203.0.113.50/32   ← block a specific IP
  Rule 100:  ALLOW TCP 22 from 0.0.0.0/0         ← allow SSH
  Rule *:    DENY  ALL                            ← implicit last (cannot be changed)
```

In this case 203.0.113.50 meets the DENY in rule 90 first and is blocked. It never reaches the ALLOW at rule 100. **If the order were reversed (100 first), the block would not work.**

This "end at first match" approach is the same as traditional router/firewall ACLs (Cisco IOS ACLs being the classic example). That is why rule numbers are usually spaced out in steps of 100 (100, 200, 300...). It is to leave room to insert rules in between later. The SG has no such ordering and evaluates all rules together as an OR (if any one allows, it is allowed), so the design thinking is completely different.

> 🎯 **Scenario**: "I want to block one specific malicious IP across the entire subnet. Is it possible with an SG?" — It is not. The SG has no Deny rules (only Allow exists). To block a specific IP, you must add a **NACL Deny rule** with a low number. This is the core difference: "cannot block with an SG, explicit Deny only with a NACL." If you need large-scale IP blocking, you hit the NACL rule-count limit (default 20, maximum 40), so use AWS Network Firewall or WAF.

### Designing Rule Numbers

A NACL rule number is not a mere label but **the evaluation order itself**, so how you lay out the numbers becomes policy. The convention that has settled in practice is to divide number bands by purpose.

| Number band | Purpose | Reason |
|-------------|---------|--------|
| 1-99 | Emergency/explicit Deny (blocking malicious IPs, etc.) | Must be evaluated before any Allow |
| 100-199 | Normal inbound Allow | Service ports |
| 200-299 | Ephemeral-port Allow for responses | Easy to forget, so give it its own band |
| 300 and above | Exceptions/temporary rules | Leave an expiry date as a tag |
| `*` | Implicit Deny (cannot be changed) | Falls here when no rule matches |

The reason for spacing numbers in steps of 100 is to leave room to insert rules between them. But a more important discipline is: **"when adding a Deny later, always give it a lower number than the existing Allows."** If you block in a hurry and use a convenient number (say 400), traffic already passes at the Allow in rule 100 and nothing happens, and that fact doesn't show up well in logs either. The answer to the exam scenario "I added a Deny rule but it still gets through" is always the rule number.

```bash
# Check current NACL rules in number order (inbound/outbound together)
aws ec2 describe-network-acls \
  --filters "Name=association.subnet-id,Values=subnet-0app1234" \
  --query 'NetworkAcls[].Entries[].{No:RuleNumber,Egress:Egress,Proto:Protocol,
             Cidr:CidrBlock,Ports:PortRange,Action:RuleAction}' \
  --output table

# Block a malicious IP with the lowest number (inbound)
aws ec2 create-network-acl-entry \
  --network-acl-id acl-0abc1234 --rule-number 10 \
  --protocol -1 --cidr-block 203.0.113.50/32 \
  --rule-action deny --ingress

# Open ephemeral ports in outbound for responses to leave (forget it and the whole subnet goes dead)
aws ec2 create-network-acl-entry \
  --network-acl-id acl-0abc1234 --rule-number 200 \
  --protocol tcp --port-range From=1024,To=65535 \
  --cidr-block 0.0.0.0/0 --rule-action allow --egress
```

> ⚠️ **Pitfall**: In a NACL rule, using `--protocol -1` (all protocols) causes the port range specification to be ignored. A rule of "only 443 for all protocols" does not hold — because the very notion of a port exists only for TCP/UDP. Using `-1` when hastily adding a block rule means you intentionally block everything, and you must use it knowing that legitimate traffic from that IP disappears too. One more thing — NACL rule counts have a quota (by default 20 per direction, raisable to 40), so it isn't suited to large IP blocklists. If you must block hundreds of IPs, the answer is **AWS Network Firewall** or a **WAF IP set**, not a NACL.

## Tools for Designing Security Groups

The SG becomes strong when you use it not as "a place to list rules" but as **a place to express relationships**. You must have three tools in hand.

**① SG reference** — use another SG as the source instead of an IP. If you open inbound 5432 on `sg-data` to `sg-app`, then no matter how many App instances there are or how their IPs change, the rule stays the same. This is not a convenience feature but **a device for keeping least privilege intact over time**. Written with CIDRs it is accurate today but inevitably loosens tomorrow.

**② Managed prefix list** — give a name to a set of frequently used CIDRs and reference it in rules. As the corporate ranges grow, you only fix the list, and every SG and routing rule that references the list is updated together. AWS also provides per-service prefix lists (e.g., S3, DynamoDB, CloudFront), and the `pl-xxxx` shown for the Gateway Endpoint route in a route table is exactly this.

**③ Self-referencing rule** — when an SG references itself as the source, communication opens only among members of that SG. It is the standard way to express intra-cluster communication (e.g., a gossip port between nodes).

```bash
# Add a rule by SG reference — don't use a CIDR
aws ec2 authorize-security-group-ingress \
  --group-id sg-data \
  --ip-permissions 'IpProtocol=tcp,FromPort=5432,ToPort=5432,
      UserIdGroupPairs=[{GroupId=sg-app,Description="app tier only"}]'

# Reference a prefix list
aws ec2 authorize-security-group-ingress \
  --group-id sg-bastion \
  --ip-permissions 'IpProtocol=tcp,FromPort=22,ToPort=22,
      PrefixListIds=[{PrefixListId=pl-corp-offices,Description="corp CIDR list"}]'

# Audit: pull only SGs that have 0.0.0.0/0 inbound
aws ec2 describe-security-groups \
  --filters "Name=ip-permission.cidr,Values=0.0.0.0/0" \
  --query 'SecurityGroups[].{Id:GroupId,Name:GroupName,VpcId:VpcId,
             Open:IpPermissions[?IpRanges[?CidrIp==`0.0.0.0/0`]].[IpProtocol,FromPort,ToPort]}' \
  --output json
```

The way an SG reference works is close to "automatically managing the IP list of the instances belonging to that SG." That is, the final decision is IP-based, but the responsibility for maintaining that list passes from people to the platform. A principle repeatedly confirmed in security controls shows up here too — **a list that people must synchronize by hand will inevitably go stale.** IPs written in firewall rules, departed employees' accounts left in an allow list, and exception rules with no expiry date are all the same type of failure. So mature design aims not at "making an accurate list" but at "making the list follow on its own."

SGs have quotas too. There are caps on the number of SGs attachable to one ENI, the number of rules in one SG, and the product of the two. A design that splits rules finely and attaches many SGs will eventually hit this cap. Instead, a structure that **divides SGs by role (web/app/DB/common management) and ties them together by reference** keeps the rule count linear. And filling in the `Description` of every rule is a practical discipline — a rule without a description cannot be deleted by anyone and so stays forever, and that becomes the network version of permission creep.

## Evaluation Flow: The Order a Packet Passes Through

Until an inbound packet reaches EC2:

```
1. NACL inbound (entering the subnet)   → if DENY, ends here
2. Security group inbound (reaching ENI) → if not allowed, ends
3. EC2 processes → generates response
4. Security group outbound (stateful → automatically allowed)
5. NACL outbound (stateless → must be stated, usually ephemeral ports)
```

A frequently asked question — "If two instances communicate **within the same subnet**, does the NACL apply?" The answer is **no**. A NACL inspects only traffic crossing the subnet **boundary**. Intra-subnet communication does not go through the NACL and only the SG applies. Conversely, the SG applies to all traffic reaching the ENI, whether the same subnet or a different one. So if you need "isolation within the same subnet," it is possible only with the SG.

An SG can **reference another SG** as the source (e.g., "allow only traffic coming from the ALB's SG"). Because it references a logical group instead of an IP, a big advantage is that the rule persists as instances grow. A NACL can reference only IPs/CIDRs and cannot reference an SG. On the exam, if it says "allow only the ALB to access a backend whose IPs keep changing with Auto Scaling," the answer is not a NACL but **SG-to-SG reference**.

## Practical Troubleshooting Matrix

| Symptom | First suspect | How to check |
|---------|---------------|--------------|
| Cannot connect at all (timeout) | Routing / SG inbound / NACL | Reachability Analyzer |
| Request goes out but no response | NACL outbound ephemeral ports | NACL outbound 1024-65535 |
| Want to block only a specific IP but can't | Tried with an SG (impossible) | Use a NACL Deny rule |
| Intermittent blocking | NACL rule order (first-match) | Check rule-number ordering |
| Isolation within the same subnet doesn't work | Tried with a NACL (not applied) | Isolate with an SG |

```bash
# Analyze the path with Reachability Analyzer (the classic troubleshooting approach)
aws ec2 create-network-insights-path \
  --source i-source --destination i-dest \
  --protocol tcp --destination-port 443

aws ec2 start-network-insights-analysis \
  --network-insights-path-id nip-xxxx
# The result shows exactly at which component (SG/NACL/Route) it was blocked
```

### Fix the Order of Narrowing Down

What consumes time in troubleshooting is not a lack of knowledge but **a lack of order**. If you open the SG as things occur to you, open the NACL if that doesn't work, and look at routing if that still doesn't work, the environment loosens before you find the cause. If you fix the order, a verdict of "normal up to here" accumulates at each step.

```
[ The fixed order for narrowing down "it won't connect" ]

  0. Classify by symptom first
       timeout (no response at all)  → connectivity-layer problem (go to 1-4)
       AccessDenied / 4xx            → policy-layer problem (go to 5-6, Day 4 topic)
       RST (immediate refusal)       → no listening process at the destination (step 6)

  1. Routing    : does the source subnet have a route to the destination
                   → if not, ends here. Also check for a blackhole
  2. NACL       : both subnets' inbound + outbound (ephemeral ports!)
                   → the only layer that can create an asymmetric failure
  3. SG (dest)  : is the service port open in inbound
  4. SG (source): is outbound not narrowed (default is allow all)
  5. Policy     : endpoint policy → resource policy → IAM (Day 4)
  6. Host       : OS firewall, whether the process is listening, health checks

  → Reachability Analyzer judges 1-4 in one go.
     The reason to memorize the order anyway is that in an exam room
     with no tools you must pick one of four options.
```

Step 0, splitting the layers by symptom, is the most valuable in practice. The single sentence **"timeout means network, AccessDenied means policy"** immediately sorts out many problems. If a policy denies, the request reached the destination, and reaching it is evidence that routing, NACL, and SG all passed. Conversely, a timeout means the packet was silently dropped somewhere, and silent dropping is a property of network controls, not policies.

> 🎯 **Scenario**: "An EC2 instance in the App subnet cannot connect to the RDS in the Data subnet. Reachability Analyzer says the path is fine, and the SG has 5432 open by `sg-app` reference. What is left?" — If 1-4 are green, what remains are steps 5 and 6. For RDS, there is little room for the policy layer to be involved, so step 6: check **whether the DB instance is actually serving on that port, and whether the parameter group or DB user authentication is rejecting it**. If the symptom is not a timeout but "authentication failed," the network was normal from the start, and in that case opening the SG further has no effect and only increases exposure. The habit of reading **an action that doesn't change the symptom as a sign that it is not the cause** governs troubleshooting speed.

The incident most commonly paged at dawn in practice is "someone touched the NACL wrong." When someone tightens NACL outbound in the name of hardening, because the NACL is not stateful, all response traffic is blocked and the entire subnet goes dead. That is why many organizations use a strategy of **rarely touching NACLs and controlling precisely with SGs only**. The NACL is left as a supplementary device that blocks only the "absolutely not" things (e.g., a specific malicious IP, Internet exposure of the DB port).

## Wrap-Up

In summary there are three points. First, **the SG is stateful**, so responses are automatically allowed, and **the NACL is stateless**, so responses (ephemeral ports) must be explicitly allowed — this distinction decides answers on the exam. Stateful ultimately means "does it remember the request?", and to a NACL that doesn't remember, a response is just **new traffic** with swapped destination port. Second, **only the NACL can Deny** and it evaluates first-match in rule-number order, while the SG evaluates Allows together. So a Deny added later must have a lower number than the existing Allows. Third, **the SG can reference another SG** and also controls traffic inside the same subnet, while the NACL sees only the subnet boundary and references only IPs/CIDRs.

There are three more practical layers added today. **Connection tracking** does not immediately cut a session in progress when you delete a rule, so do an emergency block with a NACL Deny or by swapping to an isolation SG, and do not put evidence preservation after blocking. **UDP and ICMP are also tracked in an SG**, so only one direction needs opening, and both directions are needed only in the NACL. And **the SG is not a place to list rules but a place to express relationships** — with three tools (SG reference, prefix list, self-reference), rules don't grow even as instances grow. The principle that an IP list people synchronize by hand will inevitably go stale applies here as well.

In troubleshooting, fix the order. Split the layers by symptom first (**timeout means network, AccessDenied means policy**), then narrow down in the order routing → NACL → SG (destination) → SG (source) → policy → host. And if you remember only one thing, it is this — **an asymmetric failure (the request goes out but the response doesn't come back) cannot be created by an SG; only a NACL creates it.**

The practical strategy is clear — precise control with SGs, and only absolute-prohibition rules (blocking a specific IP, broad deny) with NACLs. In the next note, we look into how this traffic actually flowed with **VPC Flow Logs**, and how to confirm today's SG/NACL diagnosis on top of the logs.

---

## 📝 Practice Questions

**Question 1.** An engineer allowed TCP 443 from 0.0.0.0/0 in the NACL inbound of the web server subnet. However, HTTPS responses are not being received from outside. What is the most likely cause?

A) The security group's outbound 443 is blocked  
B) The NACL outbound has no allow for ephemeral ports (1024-65535)  
C) The local route is missing from the route table  
D) The security group is stateless, so the response must be allowed separately  

**Answer: B**  
Explanation: A network ACL is stateless, so even if it allows the request, it does not automatically allow the response traffic. The HTTPS response goes out to the client's ephemeral port range, so the ephemeral port range must be explicitly allowed in the network ACL outbound. A security group tracks state and automatically allows responses, so it is not the cause of this symptom.

---

**Question 2.** A single malicious IP address must be explicitly blocked across the entire subnet. What is the correct approach?

A) Add the IP as a Deny rule in the security group inbound  
B) Allow 0.0.0.0/0 in the security group but make an exception for that IP only  
C) Add the IP to the network ACL with a low-numbered Deny rule  
D) Set a blackhole route toward that IP in the route table  

**Answer: C**  
Explanation: Security groups support only allow rules and have no deny rules, so a specific IP cannot be explicitly blocked. An explicit deny is possible only in a network ACL, and because evaluation ends at the first match in rule number order, the deny rule must have a lower number than the allow rules to be effective.

---

**Question 3.** For a group of backend instances whose IPs change frequently due to auto scaling, we want to allow only traffic coming from a specific ALB. What is the most appropriate method?

A) Reference the ALB's security group as the source in the backend security group inbound  
B) List all the ALB instances' IPs in the backend NACL  
C) Allow the ALB subnet CIDR in the backend security group  
D) Add a route in the route table that goes only to the ALB  

**Answer: A**  
Explanation: A security group can reference another security group as a source, so the allow is maintained by group membership even if IPs change. A network ACL references only IPs/CIDRs, so it is unsuitable for environments where IPs change often. Allowing the subnet CIDR also opens other resources in the same subnet, which goes against least privilege.

---

**Question 4.** We want to isolate (block) communication between two instances A and B in the same subnet. Which control is effective?

A) Add a Deny rule to the inbound of that subnet's network ACL  
B) Do not allow mutual traffic in the security group rules of the two instances  
C) Remove the path between the instances from the subnet route table  
D) Either a network ACL or a security group can do it  

**Answer: B**  
Explanation: A network ACL inspects only traffic that crosses the subnet boundary, so it does not apply to communication inside the same subnet. Therefore, isolation between resources in the same subnet can be enforced only with security groups. The local route in a route table cannot be deleted, so removing the path is also impossible.

---

**Question 5.** Which description of how security groups and network ACLs are evaluated is correct?

A) A security group ends evaluation at the first match in rule number order  
B) A network ACL evaluates all rules together and lets traffic through if any one allows it  
C) A security group evaluates all rules together, and a network ACL ends at the first match in number order  
D) Both evaluate explicit Deny rules first and then look at Allow  

**Answer: C**  
Explanation: A security group has no notion of order and evaluates all allow rules together, allowing the traffic if any one matches. A network ACL evaluates in order starting from the lowest rule number and ends at the first match, so deny rules must be placed at lower numbers than allow rules to work as intended.

---

**Question 6.** During security incident response, an in-progress malicious connection must be cut immediately. Which control blocks it most immediately?

A) Delete the inbound allow rule in the security group  
B) Add a Deny rule for that source to the network ACL  
C) Revoke the instance's permissions with an IAM policy  
D) Delete the VPC local route from the route table  

**Answer: B**  
Explanation: A security group tracks state, so an already established connection can persist for a while on tracking information even after the rule is deleted. A network ACL, on the other hand, is stateless, so a rule change takes effect from the next packet immediately, making it more immediate for emergency blocking. The local route cannot be deleted.

---
