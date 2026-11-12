# Day 5 - Week 3 Integration: Network Isolation and Traffic Control as One

This week started from the fact that network is security''s first defense line. If IAM handles "who can do what," network decides the prior question: "who can even reach where." Can''t reach = can''t attack. Four topics covered this week — VPC design, SG/NACL, Flow Logs, private connectivity — aren''t separate topics. They''re one defense system viewed from four angles.

Today we integrate all four into one scenario for comprehensive review. Complex questions on exams almost always ask multiple layers simultaneously. The sentence "RDS exposed to Internet" contains routing, SG, NACL, and Public IP. Thinking in layered separation is passing criteria.

## Network Security Stack at a Glance

```
Request →  [Route Table]       No route = unreachable (implicit block)
           [NACL Inbound]      Subnet boundary, stateless, Deny possible, number-ordered
           [Security Group]    ENI, stateful, Allow-only, comprehensive eval
           [Resource]          Processing
           ── All flows recorded by [Flow Logs] as metadata ──
           External comms via [NAT] or [VPC Endpoint]
           [Endpoint Policy + Bucket Policy] enforce data perimeter
```

| Layer | Role | One-Line Essence |
|------|------|-----------|
| Routing | Reachability | No route = can''t go |
| NACL | Subnet-wide control | stateless, Deny possible, first-match |
| Security Group | Resource-precise control | stateful, Allow-only, SG reference possible |
| Flow Logs | Visibility | Block nothing but see (ACCEPT/REJECT) |
| Endpoint | Private connection | Remove Internet path + enforce data perimeter |

> 💡 **Related Theory**: This entire stack **is Defense in Depth implementation**. Multiple layers ensure one layer''s mistake doesn''t become immediate breach. SG opened wrong but routing blocks = unreachable. Routing open but NACL blocks = possible. All results observed via Flow Logs. Security design goal: "even if one layer breaches, entire system doesn''t collapse."

## Integration Scenario 1: RDS Exposure Incident Analysis

> **Situation**: Security scanner warns "production RDS accessible from Internet." What, in what order, to check and block?

**Reachability Analysis (in order)**:
1. **RDS PubliclyAccessible** — if enabled, gets public DNS/IP. Disable.
2. **Route Table** — does subnet have 0.0.0.0/0 → IGW route? Data Tier shouldn''t.
3. **Security Group** — inbound 3306/5432 open to 0.0.0.0/0? Narrow to App SG reference.
4. **NACL** — can further block at subnet boundary.

> 🎯 **Core**: Internet reachability requires **routing (IGW) + Public address + SG/NACL allow all**. Most fundamental block: place RDS in subnet without Internet path and disable PubliclyAccessible. Narrowing SG alone is surface-level fix. Use Reachability Analyzer to pinpoint exactly which layer opened the path.

```sql
-- Verify actual access attempts before/after with Flow Logs
SELECT srcaddr, dstport, action, count(*)
FROM vpc_flow_logs
WHERE dstport IN (3306, 5432) AND srcaddr NOT LIKE ''10.%''
GROUP BY srcaddr, dstport, action ORDER BY 4 DESC;
```

## Integration Scenario 2: Data Exfiltration Prevention Design

> **Situation**: Sensitive customer data workload. Design so even if breached, data doesn''t leak externally.

```
1. Place workload in App/Data Subnet without Internet path
2. Remove NAT → block indiscriminate egress
3. Private-connect only needed AWS services via VPC Endpoint
   (S3·DynamoDB = Gateway / KMS·SSM·Secrets = Interface)
4. S3 bucket policy with aws:SourceVpce condition → allow only via endpoint
5. Endpoint Policy with aws:PrincipalOrgID condition → only our org
6. Monitor all egress via Flow Logs (include pkt-srcaddr)
```

> 🔍 **Deeper**: This design''s brilliance is **defense after IAM compromise**. Even if attacker steals instance credentials (like Capital One), no network path exists to exfiltrate. PutObject to external bucket fails — NAT doesn''t exist; our bucket only allows SourceVpce condition via that endpoint. Breaks the "stolen credential = immediate data exfiltration" equation. This is the defense-in-depth IAM and network isolation build together.

> 📚 **Case**: Reviewing Capital One through this lens — SSRF stole metadata credentials (same), but if S3 required VPC Endpoint + SourceVpce only and no egress NAT existed, extracting data externally with stolen creds was much harder. Network isolation operates as a "final layer."

## Confusing Comparisons Clarified

| Confusing Pair | Core Distinction |
|-------------|-----------|
| SG vs NACL | stateful/stateless, Allow-only/Deny possible, ENI/subnet |
| Gateway vs Interface EP | S3·DynamoDB free routing / rest ENI pay |
| IGW vs NAT | bidirectional / outbound-only |
| NAT vs VPC Endpoint | indiscriminate egress / specific service private |
| Peering vs PrivateLink | full CIDR exposed / single service exposed |
| srcaddr vs pkt-srcaddr | NAT IP / actual source before NAT |
| ACCEPT vs REJECT (Flow Logs) | success flow / blocked flow (recon signal) |

> ⚠️ **Pitfall Collection**:
> - NACL inbound opened but ephemeral port outbound not = no response (stateless).
> - Can''t block specific IP with SG (no Deny) → use NACL Deny.
> - Same-subnet internal comms don''t apply NACL → isolate via SG only.
> - Gateway Endpoint unreachable from on-premises (VPC-only).
> - Endpoint/bucket/IAM policies AND-combined → one deny = deny overall.
> - IGW path in Main Route Table = unconnected subnets unintentionally Public.

## Troubleshooting Decision Tree

```
Connection Failed?
 ├─ timeout (no response at all)
 │    → Routing path? → SG inbound? → NACL? → Reachability Analyzer
 ├─ Request goes but no response
 │    → NACL outbound ephemeral ports (1024-65535) check (stateless)
 ├─ Specific IP won''t block
 │    → If tried SG = impossible, switch to NACL Deny
 ├─ Built endpoint but traffic to Internet
 │    → Private DNS + VPC DNS properties check
 └─ AccessDenied (network works)
      → Endpoint Policy / bucket policy SourceVpce condition check
```

> 🎯 **Scenario**: "On-premises via DX to S3, getting timeout not AccessDenied." — timeout is network reach failure. If S3 **Gateway** Endpoint created, on-premises can''t reach (VPC-only). Switch to **Interface** Endpoint, configure Route 53 Resolver so on-premises resolver resolves S3 domain to endpoint private IP. AccessDenied means policy problem; timeout means connection layer (endpoint type, DNS, routing). **Using error type to narrow layers is key**.

## Week 3 One-Paragraph Summary

Network security is controlling reachability. **Routing** is invisible blocking where no route = can''t go; **NACL** (stateless, Deny possible, subnet-level) and **security group** (stateful, Allow-only, ENI-level) form two firewall layers. Flowed traffic is recorded by **Flow Logs** as metadata, so breaches (REJECT spike = recon, unexpected large egress = exfil) are read afterward. External comms narrowed via **VPC Endpoint** instead of indiscriminate NAT, and **endpoint/bucket policy SourceVpce and PrincipalOrgID conditions** build data perimeter so stolen credentials don''t exfiltrate data. All layers together achieve defense-in-depth.

## Wrapping Up

Week 3 covered "blocking (control)," "seeing (visibility)," and "removing the path itself (private connectivity)." When facing complex questions, always decompose by layers — routing, SG, NACL, policy? Error timeout means connection layer; AccessDenied means policy layer.

Next Week 4 examines the second pillar of infrastructure security — edge protection and traffic inspection (WAF, Shield, Network Firewall, CloudFront). Up to today was isolation "inside" VPC; next is active defense at VPC "boundary" inspecting and filtering threats.

---

## 📝 Practice Questions

**Question 1.** You received a warning that the production RDS is accessible from the internet. What is the most fundamental (not superficial) blocking action?

A) Narrow the 0.0.0.0/0 in the security group inbound to specific IPs only  
B) Place the RDS in a subnet with no internet path and turn off PubliclyAccessible  
C) Block the NACL outbound ephemeral ports  
D) Disable the RDS automatic backups  

**Answer: B**  
Explanation: Internet reachability holds only when the routing path, public address, and control allows are all satisfied. Placing it in a subnet with no internet path and turning off the public access setting eliminates the path and the address themselves, blocking at the most fundamental level. Narrowing only the security group is a superficial remedy that can be nullified if another layer is opened again.

---

**Question 2.** We want to use network design to stop a scenario in which a compromised instance tries to exfiltrate company S3 data to an external attacker's bucket using stolen credentials. What is the most effective combination?

A) Keep a NAT Gateway but allow only 443 on the security group outbound  
B) Remove the NAT, connect only the needed AWS services with VPC Endpoints, and put a SourceVpce condition on the bucket policy  
C) Remove all S3 permissions from the IAM policy  
D) Strengthen CloudTrail logging  

**Answer: B**  
Explanation: Removing the NAT eliminates the indiscriminate outbound path so that transfer to an external bucket is blocked in itself, and if you connect only the needed services via endpoints and put an endpoint-routing condition on the bucket policy, the company bucket is accessed only through that path. Even if credentials are stolen, there is no network path for the data to leave. Strengthening logging is detection, not blocking.

---

**Question 3.** During connectivity troubleshooting, the symptom "the request goes out but the response does not come back" occurred. Which layer should be suspected first?

A) Security group inbound rules  
B) The local route in the route table  
C) Whether the NACL outbound allows ephemeral ports  
D) The Resource scope of the endpoint policy  

**Answer: C**  
Explanation: The symptom where the request goes out but only the response does not come back is a typical pattern of the stateless NACL blocking the response traffic. A NACL does not track state, so the ephemeral port range the response goes out on must be explicitly allowed in the outbound. A security group, which tracks state, automatically allows responses, so it is not the cause of this symptom.

---

**Question 4.** When trying to access S3 from on-premises over Direct Connect, a timeout occurs rather than AccessDenied. What is the most likely cause?

A) The SourceVpce condition in the bucket policy is misconfigured  
B) An S3 Gateway Endpoint is in use, so it cannot be reached from on-premises  
C) The IAM policy lacks the s3:GetObject permission  
D) The KMS key policy denies decryption  

**Answer: B**  
Explanation: A timeout means a network reachability failure, not a policy denial. A Gateway Endpoint is routing-based and VPC-internal only, so it cannot be reached directly from on-premises. Private access from on-premises requires an Interface Endpoint and a DNS configuration that resolves the domain to a private IP. If it were a policy problem, AccessDenied would occur instead of a timeout.

---

**Question 5.** Which combination selects all the correct descriptions of the differences between security groups and NACLs?

(i) A security group tracks state and a NACL does not
(ii) A NACL can explicitly Deny but a security group can only Allow
(iii) A NACL does not apply to communication inside the same subnet
(iv) A security group ends evaluation at the first match in rule number order

A) i, ii, iii  
B) i, ii, iv  
C) ii, iii, iv  
D) i, iii, iv  

**Answer: A**  
Explanation: A security group tracks state, automatically allows responses, and supports only allow rules, while a NACL is stateless and also supports deny rules. Also, a NACL inspects only subnet boundary traffic, so it does not apply to communication inside the same subnet. Ending at the first match in rule number order is how a NACL evaluates, and a security group evaluates all rules together, so (iv) is wrong.

---

**Question 6.** In Flow Logs analysis, a pattern appeared in which "one internal host communicates with more than 100 different external destinations in a short time." What is the combination of the most suspected activity and the field needed to pinpoint the compromised host?

A) Suspected data exfiltration / srcaddr field  
B) Suspected C2 beaconing or lateral movement / pkt-srcaddr field  
C) Normal health check / az-id field  
D) Suspected DDoS attack / dstport field  

**Answer: B**  
Explanation: A pattern in which one host communicates with many different destinations is a sign of command-and-control beaconing or internal lateral movement. And since the NAT address is recorded in the normal source address field when traffic passes through NAT, identifying the actual sending host before NAT translation requires the packet original source address field. This field is the key to pinpointing the compromised host.

---
