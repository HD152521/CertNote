# Day 2 - Security Groups vs Network ACL: The Essence of Stateful vs Stateless

There are two firewall layers inside a VPC: Security Group (SG) and Network ACL (NACL). Failing to precisely distinguish these two concepts blocks progress on exams and real-world troubleshooting alike. Questions like "Why doesn''t the response come back even though SG is wide open?" or "I opened inbound in NACL but why isn''t communication working?" almost always stem from missing the difference between **stateful and stateless**.

Today we clarify these concepts from first principles. We''ll cover evaluation order, state tracking differences, and the most common real-world troubleshooting scenarios. This is a core topic tested in nearly every SCS-C03 Domain 3 iteration.

## The Two Firewalls'' Location: Where Do They Attach?

```
Internet
  │
[ NACL ]  ← Attaches at subnet boundary (per-subnet)
  │
[ Security Group ]  ← Attaches to ENI(instance) (per-resource)
  │
[ EC2 Instance ]
```

- **NACL**: Operates at the subnet boundary. Inspects all traffic entering/leaving the subnet.
- **Security Group**: Operates at the ENI (Elastic Network Interface), i.e., instance level. Firewall closest to the resource.

| Item | Security Group (SG) | Network ACL (NACL) |
|------|----------------|---------------------|
| Applied To | ENI / Instance | Subnet |
| State | **Stateful** | **Stateless** |
| Rules | Allow only | Allow + **Deny possible** |
| Evaluation | All rules comprehensive | Rule number order, stops on first match |
| Default Behavior | Inbound block / Outbound allow | (Default) all allow / (Custom) all deny |

> 💡 **Related Theory**: This dual structure embodies the **layering** principle in network security. NACL is coarse-grained control across the entire subnet; SG is fine-grained per-resource control. This is exactly the same as traditional datacenter separation of router ACLs (subnet boundary) and host firewalls (per-server). NACL enforces subnet-wide blanket rules like "this port is absolutely forbidden," while SG manages precise per-resource allowances.

## Stateful vs Stateless: The Most Critical Difference

This one thing is half the exam.

**Security Group (Stateful)**: Allow inbound and **responses (outbound) are automatically allowed without rules**. It tracks connection state. Reverse is the same — if outbound traffic initiates, the inbound response is automatically allowed.

**NACL (Stateless)**: Tracks no state. Even if inbound is allowed, **outbound responses must be explicitly allowed**. Responses go via **ephemeral ports (1024-65535)**, so this range must be opened in the NACL outbound.

```
# Scenario: Web server (443) receiving Internet connection

[Security Group]
  Inbound: TCP 443 from 0.0.0.0/0   ← This alone is enough
  (Outbound response auto-allowed - stateful)

[NACL]  ← Must explicitly specify both (stateless)
  Inbound: Rule 100  TCP 443  from 0.0.0.0/0  ALLOW
  Outbound: Rule 100  TCP 1024-65535  to 0.0.0.0/0  ALLOW  ← Ephemeral ports required!
```

> ⚠️ **Pitfall**: The most common exam trap is exactly this **ephemeral ports** concept. The scenario "NACL inbound has 443 open but web responses don''t come back" — the answer is almost always "outbound ephemeral port (1024-65535) is blocked." With SG, this wouldn''t be a problem because it''s stateful. Note that ephemeral port ranges differ per OS (Linux 32768-60999, Windows Server 2008+ 49152-65535, NAT Gateway 1024-65535). That''s why it''s typical to safely open the full 1024-65535 range.

> 🔍 **Deeper**: There''s one subtle exception to stateful tracking. In a security group, if you allow inbound and then **delete the rule while connection is alive**, what happens? For TCP, already-established connections continue to be tracked by the SG. NACL, being stateless, applies rule changes immediately on the next packet. So for "emergency blocking," NACL''s Deny rule is more immediate than SG. However, tracked connection state clears on idle timeout or certain conditions.

## NACL''s Evaluation Order: Rule Number Determines Fate

NACL differs decisively from SG. **Rules are evaluated lowest number first**, and **evaluation stops on first match** (first-match wins).

```
Inbound NACL Rules:
  Rule 90:   DENY  TCP 22 from 203.0.113.50/32   ← Block specific IP
  Rule 100:  ALLOW TCP 22 from 0.0.0.0/0         ← Allow SSH
  Rule *:    DENY  ALL                            ← Implicit last (unchangeable)
```

In this case, 203.0.113.50 hits Rule 90''s DENY first and is blocked. It never reaches Rule 100''s ALLOW. **If the order were reversed (100 first), blocking wouldn''t work.**

> 💡 **Related Theory**: This "first-match-stops" approach is identical to traditional router/firewall ACLs (Cisco IOS ACL is the prime example). That''s why rule numbers are typically spaced in 100-unit increments (100, 200, 300...). It reserves space to insert rules later. SG has no order; all rules are OR-combined (allow if any one matches), so design thinking is completely different.

> 🎯 **Scenario**: "I want to block one specific malicious IP across the entire subnet. Can SG do it?" — No. SG has no Deny rules (only Allow exists). To block a specific IP, you must add a **Deny rule to NACL** with a low number. This is the key difference: "SG can''t block; NACL''s explicit Deny only." For large-scale IP blocking, NACL rule limits (default 20, max 40) apply, so AWS Network Firewall or WAF are used.

## Evaluation Flow: Packet''s Path

For inbound packets to reach EC2:

```
1. NACL inbound (subnet entry)     → DENY stops here
2. Security Group inbound (ENI arrival)    → Deny stops here
3. EC2 processing → Response generated
4. Security Group outbound (stateful → auto-allowed)
5. NACL outbound (stateless → explicit needed, usually ephemeral ports)
```

> 🔍 **Deeper**: A frequently asked question — "If two instances communicate **within the same subnet**, does NACL apply?" Answer: **No**. NACL inspects traffic crossing the subnet **boundary** only. Same-subnet internal communication bypasses NACL and applies SG only. Reverse: SG applies to all traffic reaching an ENI regardless of subnet. So "isolation within same subnet" is possible only via SG.

> ⚠️ **Pitfall**: SG can reference **another SG as source** (e.g., "allow only traffic from ALB''s SG"). This is logical group reference, not IP, so rules persist even as instances scale. NACL can reference only IP/CIDR, not SG. On exams, if the scenario is "only ALB can reach auto-scaling backend with changing IPs," the answer is **SG-to-SG reference**, not NACL.

## Real-World Troubleshooting Matrix

| Symptom | Suspect #1 | Check |
|---------|-----------|--------|
| Connection won''t establish (timeout) | Routing / SG inbound / NACL | Reachability Analyzer |
| Request goes but no response | NACL outbound ephemeral ports | NACL outbound 1024-65535 |
| Want to block one IP but can''t | Tried SG (doesn''t work) | Use NACL Deny rule |
| Intermittent blocks | NACL rule order (first-match) | Check rule number sort |
| Same-subnet isolation fails | Tried NACL (doesn''t apply) | Use SG isolation |

```bash
# Reachability Analyzer to trace path (troubleshooting best practice)
aws ec2 create-network-insights-path \
  --source i-source --destination i-dest \
  --protocol tcp --destination-port 443

aws ec2 start-network-insights-analysis \
  --network-insights-path-id nip-xxxx
# Result shows exactly which component (SG/NACL/Route) blocked
```

> 📚 **Case Study**: The most common 3 AM callout in real ops is "someone messed with the NACL." When someone tightens NACL outbound for security, NACL''s stateless nature means all response traffic gets blocked, and the entire subnet goes dark. Many organizations use the strategy of **almost never touching NACL and doing all fine-grained control via SG**. NACL stays as a backup for "never ever allowed" rules (e.g., specific malicious IP, DB port to Internet).

## Wrapping Up

Three essentials. First, **SG is stateful** so responses auto-allow and **NACL is stateless** so you must explicitly allow responses (ephemeral ports) — this is half the exam. Second, **only NACL can Deny**, it evaluates by rule number first-match, and SG does comprehensive Allow-only. Third, **SG can reference other SGs** and controls within-subnet, but NACL only sees subnet boundaries and IP/CIDR.

The operations strategy is clear — fine-grained control via SG, absolute-deny rules (specific IP block, broad deny) only via NACL. Next, we see how traffic actually flowed using **VPC Flow Logs** and detect breaches and misconfiguration through logs.

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
