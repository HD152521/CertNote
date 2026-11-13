# Day 5 - Week 3 Integration: Network Isolation and Traffic Control as One

This week started from the fact that the network is security's first line of defense. If IAM handles "who can do what," the network decides the question that comes before it: "who can even reach where in the first place." What can't be reached can't be attacked. The four topics we covered this week — VPC design, SG/NACL, Flow Logs, and private connectivity — are not separate subjects. They are one defense system seen from four angles.

Today we fold all four into a single scenario for an integrated review. The complex questions you will meet on the exam almost always ask about several layers at once. The single sentence "the RDS is exposed to the internet" contains routing, SGs, NACLs, and public IPs all at the same time. Training yourself to think in separated layers is what gets you over the passing line.

## The Network Security Stack on One Page

```
Request →  [Route table]       No route = unreachable (implicit block)
           [NACL inbound]      Subnet boundary, stateless, can Deny, numeric order
           [Security group inbound] ENI, stateful, Allow only, evaluated as a whole
           [Resource]          Processing
           ── Every flow is recorded by [Flow Logs] as metadata ──
           External communication goes through [NAT] or [VPC Endpoint]
           [Endpoint Policy + bucket policy] enforce the data perimeter
```

| Layer | Role | Key one-liner |
|------|------|-----------|
| Routing | Reachability | No route, no trip |
| NACL | Broad subnet-level control | stateless, can Deny, first-match |
| Security group | Fine-grained resource control | stateful, Allow only, can reference an SG |
| Flow Logs | Visibility | Sees without blocking (ACCEPT/REJECT) |
| Endpoint | Private connectivity | Removes the internet path + data perimeter |

This whole stack is the implementation of **Defense in Depth**. Multiple layers are in place so that a mistake in any single layer does not immediately turn into a breach. Even if an SG is opened by mistake, the target is unreachable if routing is closed. Even if routing is open, a NACL can still block. And the outcome of every layer is observed through Flow Logs. The goal of security design is to make sure "the whole thing does not collapse even if one spot is breached."

### The Life of a Single Packet — Coming In and Going Out

Put this week's content together on one page and you end up with this picture. The key point is that an incoming packet and an outgoing packet pass through **different combinations of gates**.

```
[ Incoming packet ]                      [ Outgoing packet ]

  Internet                                 EC2 (10.0.10.5)
    │                                        │
  ┌─▼──────────┐                          ┌──▼──────────┐
  │    IGW     │ Route must exist          │ SG outbound  │ Default: allow all
  └─┬──────────┘ (if not, it ends here)    └──┬──────────┘
    │                                        │
  ┌─▼──────────┐                          ┌──▼──────────┐
  │NACL inbound│ stateless / can Deny      │NACL outbound │ stateless
  │            │ numeric first-match       │              │ don't forget ephemeral ports
  └─┬──────────┘  → REJECT recorded        └──┬──────────┘
    │                                        │
  ┌─▼──────────┐                     ┌───────┴────────┐
  │ SG inbound │ stateful / Allow only│ Routing decides │
  │            │ can reference an SG  ├────────────────┤
  └─┬──────────┘  → REJECT recorded   │ 0.0.0.0/0→IGW  │ two-way exposure
    │                                 │ 0.0.0.0/0→NAT  │ becomes an exfil path
  ┌─▼──────────┐                      │ pl-xxx →vpce   │ private, policy-controlled ★
  │ EC2 handles│                      │ ::/0   →eigw   │ IPv6 outbound
  └─┬──────────┘                      └───────┬────────┘
    │ Response generated                      │
    │ (SG outbound is not evaluated —         ▼
    │  because it remembers)
    └──────────────────────────────────▶  Destination / policy gates
                                            IAM ∩ endpoint policy ∩ resource policy

  ── Every flow is left in Flow Logs as metadata (ACCEPT/REJECT).
     On the incoming side it answers "who tried?", on the outgoing side "what leaked out?".
```

Compare the left and right sides and this week's thesis shows itself. **Inbound control is mature, but outbound control is usually empty.** The SG outbound default is allow all, NAT doesn't care about the destination, and many organizations put no rules on "outgoing traffic." Yet data exfiltration happens in exactly that direction. This is why the endpoint policy from Day 4 matters — it is the only tool that fills in the last gate in the right-hand picture.

## Integration Scenario 1: Analyzing an RDS Exposure Incident

> **Situation**: A security scanner warns that "the production RDS is accessible from the internet." What do you check, in what order, and how do you block it?

**Reachability analysis (in order)**:
1. **RDS PubliclyAccessible** — If it is on, a public DNS name and IP are assigned. Turn it off.
2. **Route table** — Does the subnet have a 0.0.0.0/0 → IGW route? If it's the Data Tier, it should not.
3. **Security group** — Is inbound 3306/5432 open to 0.0.0.0/0? Narrow it by referencing the App SG.
4. **NACL** — It can add another block at the subnet boundary.

> 🎯 **Key point**: For internet reachability to hold, **routing (IGW) + a public address + SG/NACL allows are all** required. The most fundamental block is to put the RDS in a Data Subnet with no internet route and turn PubliclyAccessible off. Narrowing only the SG is a superficial remedy. Use Reachability Analyzer to pinpoint exactly which layer opened the path.

```sql
-- Use Flow Logs to check actual access attempts before and after the incident
SELECT srcaddr, dstport, action, count(*)
FROM vpc_flow_logs
WHERE dstport IN (3306, 5432) AND srcaddr NOT LIKE '10.%'
GROUP BY srcaddr, dstport, action ORDER BY 4 DESC;
```

## Integration Scenario 2: Designing for Data Exfiltration Prevention

> **Situation**: A workload that handles sensitive customer data. It must be designed so that data does not leak outside even if it is compromised.

```
1. Place the workload in App/Data Subnets with no internet path
2. Remove NAT → block indiscriminate egress
3. Connect only the AWS services you need privately through VPC Endpoints
   (S3·DynamoDB = Gateway / KMS·SSM·Secrets = Interface)
4. Add an aws:SourceVpce condition to the S3 bucket policy → allow only that endpoint
5. Add an aws:PrincipalOrgID condition to the Endpoint Policy → our organization only
6. Monitor all egress with Flow Logs (including pkt-srcaddr)
```

The beauty of this design is **defense after an IAM compromise**. Even if an attacker steals the instance credentials (as in Capital One), there is no network path to carry the data out. If they try to PutObject to an external bucket, there is no NAT so they can't get out to the internet, and our own bucket allows only that endpoint through the SourceVpce condition. It breaks the equation "credential theft = immediate data exfiltration." This is the defense in depth that IAM and network isolation create together.

Replaying the Capital One incident with this design — it is the same up to the point where SSRF steals the metadata credentials. But if S3 access had been possible only through a VPC Endpoint + SourceVpce and there had been no egress NAT, it would have been much harder to take the data out from outside even with the stolen credentials. Network isolation works as "the last layer."

## Integration Scenario 3: One Report That Says "It Won't Connect"

> **Situation**: A report comes in: "An EC2 instance in the newly deployed App subnet can't read the S3 bucket." The developer insists it's an IAM permission problem. What do you check first?

The mistake that is easy to make here is **accepting the developer's hypothesis as is**. What you check first is not the cause but the symptom.

```
[ Procedure for breaking one report down into layers ]

  STEP 0  Look at the error message yourself (the original, not hearsay)
          "Connection timed out"      → network layer (STEP 1~3)
          "AccessDenied"              → policy layer   (STEP 4~6)
          "Could not connect to endpoint / DNS" → name resolution (STEP 3-b)
          "KMS ... AccessDenied"      → the target is KMS, not S3

  STEP 1  Routing   aws ec2 describe-route-tables
          · If you created a Gateway EP, does that subnet's RT have a pl-xxxx route?
          · If you deleted NAT, is the 0.0.0.0/0 route still left as a blackhole?
  STEP 2  NACL      aws ec2 describe-network-acls
          · Both inbound and outbound (ephemeral ports!)
          · Is a Deny rule at a lower number than an Allow?
  STEP 3  SG / DNS
          3-a. Does the Interface EP's ENI SG allow 443 inbound?
               (A Gateway EP has no SG — don't look for it here)
          3-b. Private DNS + the VPC's enableDnsSupport/enableDnsHostnames
  ── Up to here is the timeout territory. If it passed, the packet arrived ──
  STEP 4  Endpoint policy   Look at Resource and Condition
  STEP 5  Resource policy   Is this vpce in the bucket policy's aws:SourceVpce?
                           For SSE-KMS, the KMS key policy too
  STEP 6  IAM               Instance profile role + permissions boundary + SCP

  ★ Flow Logs supply the evidence
     No row in the logs at all  → STEP 1 (the packet never even arrived)
     REJECT recorded            → STEP 2~3
     Only ACCEPT                → STEP 4~6 (the network was passed)
```

The last three lines are the key device of this procedure. **Flow Logs split the layers immediately.** If there is only ACCEPT and no REJECT but the application still fails, the network is innocent, and from that point no amount of opening SGs will change the symptom. Conversely, if there is no row in the logs at all, no amount of fixing policies will help.

> 🎯 **Scenario**: "Following the procedure above, Flow Logs show a normal ACCEPT heading to the S3 endpoint, and the error is AccessDenied. The IAM role explicitly allows `s3:GetObject`. What's next?" — The remaining candidates are the endpoint policy, the bucket policy, and the SCP. The order is **starting with whatever is most likely to have been narrowed** — if a data perimeter policy was applied recently, the most likely culprit is that this new endpoint ID is missing from the bucket policy's `aws:SourceVpce` list. A failure caused by not updating the existing data perimeter policy's allow list when creating a new VPC or new endpoint is a type that is easy to run into in practice. You can confirm it by checking the denial reason and the request's `vpcEndpointId` in the corresponding API event in CloudTrail.

## Integration Scenario 4: Isolation That Collapses as Accounts Multiply

> **Situation**: The number of accounts grew from three to thirty. After connecting them all with Transit Gateway, an audit finds that "a network path exists from a development account to the production database subnets."

This finding comes up because of TGW's default behavior. If you put every attachment into a single route table, it becomes a flat network where everything can talk to everything, and the account boundary exists only in IAM, not in the network.

```
[ Wrong configuration ]            [ Configuration with routing domains split ]

   prod-vpc ─┐                       prod-vpc ─┐
   dev-vpc  ─┼─ TGW (one RT)         dev-vpc  ─┤   TGW
   shared   ─┘   all talk to all     shared   ─┘
                                     · prod RT   : prod ↔ shared only
   If dev is compromised,            · dev RT    : dev  ↔ shared only
   it reaches the prod DB            · shared RT : both sides
   over the network                  → there is no path at all between dev and prod
```

The key is **separating "connected" from "can communicate."** Attaching to the TGW doesn't mean there is any reason for two attachments to talk to each other; if you split route tables by purpose and state explicitly which table each attachment is associated with and where it propagates to, only the necessary pairs can communicate. This is nothing more than Day 1's "no route, no trip" scaled up to multiple accounts.

> ⚠️ **Pitfall**: Another thing often missed in multi-account environments is the **boundary of security group references**. Within the same VPC, or across a Peering in the same Region, you can reference an SG as a source, but **SG references do not apply to traffic that goes through a Transit Gateway.** That is, the moment you introduce TGW, the rules between tiers get unpacked from SG references into CIDRs, and whether you made the "contiguous per-tier address plan" mentioned on Day 1 determines the number of rules. This is where it shows that address planning is not about saving IPs but about **deciding the future number of rules**.

The fundamental reason that keeping network isolation intact as accounts grow is hard is that a connection is **a one-time decision**, whereas isolation is **a continuing discipline**. Adding one connection takes five minutes, and at that moment no problem occurs. The problem shows up after thirty such decisions have piled up, and by then whatever you cut breaks something somewhere. That is why mature organizations do not leave connections to human judgment but **enforce them through structure** — define the TGW routing domains in advance, let a new account attach only to its designated domain, and watch those rules with SCPs and Config rules. "We connect when needed" is not the shape of scalable isolation; "things connect only in the prescribed shape" is.

## The Commonly Missed Comparisons at a Glance

| Confusing pair | Key distinction |
|-------------|-----------|
| SG vs NACL | stateful/stateless, Allow only/can Deny, ENI/subnet |
| Gateway vs Interface EP | S3·DynamoDB free, routing-based / the rest ENI-based, charged |
| IGW vs NAT | two-way / outbound only |
| NAT vs VPC Endpoint | indiscriminate egress / private to a specific service |
| Peering vs PrivateLink | entire CIDR exposed / only a single service exposed |
| srcaddr vs pkt-srcaddr | NAT IP / actual origin before NAT |
| ACCEPT vs REJECT (Flow Logs) | successful flow / blocked flow (reconnaissance signal) |

> ⚠️ **Pitfall collection**:
> - If you open only NACL inbound and don't open ephemeral-port outbound, responses don't come back (stateless).
> - You can't block a specific IP with an SG (no Deny) → use a NACL Deny.
> - Traffic inside the same subnet is not subject to the NACL → isolate with SGs only.
> - A Gateway Endpoint can't be reached from on premises (VPC-internal only).
> - Endpoint/bucket/IAM policies are evaluated as AND → if any one denies, it's denied.
> - If you put an IGW route in the Main Route Table, unassociated subnets unintentionally become Public.

### SG vs NACL, Revisited Axis by Axis

On the exam these two don't appear as "what is different?" but as "in this situation, which one is the answer?" If you lay out the axes, picking the axis from the situation gets easy.

| Axis | Security group | Network ACL | Question type where this axis decides the answer |
|----|----------|-------------|---------------------------|
| Target | ENI (resource) | Subnet boundary | "Isolation within the same subnet" → only SG can do it |
| State | Stateful (remembers the request) | Stateless | "The request goes out but there's no response" → NACL |
| Rule type | Allow only | Allow + **Deny** | "Block one specific IP" → NACL |
| Evaluation | Evaluated as a whole (OR) | Numeric first-match | "I added a Deny but traffic still gets through" → number order |
| Source specification | IP, **SG reference**, prefix list | IP/CIDR only | "A backend whose IPs keep changing" → SG reference |
| Default behavior | Inbound blocked / outbound allowed | Default NACL allows everything | "A new subnet is unprotected" → default NACL |
| Change immediacy | Existing connections may persist through tracking | Immediate from the next packet | "Immediately block an ongoing malicious session" → NACL |
| Scale limit | Quotas on rules and connections | Limit on rules per direction (a few dozen) | "Block hundreds of IPs" → Network Firewall/WAF |

### Exfiltration Paths and the Means of Blocking Them

This is the most practical table of the week. It pairs "the doors data can leave through" with each door's lock.

| Exit door | Condition for it to work | Lock | Covered on |
|-----------|----------|--------|--------|
| Direct IGW | Public IP + `0.0.0.0/0 → igw` | Place in a private subnet, remove the IGW route | Day 1 |
| NAT Gateway | `0.0.0.0/0 → nat` | Remove NAT → replace with endpoints | Days 1·4 |
| Egress-only IGW | `::/0 → eigw` | If IPv6 is unused, don't assign it to the subnet | Day 1 |
| Peering / TGW / VPN / DX | An internet path exists on the other side | Split TGW routing domains, audit the other side too | Days 1·5 |
| VPC endpoint | AWS API via the endpoint | **Endpoint policy** (`aws:ResourceOrgID`) | Day 4 |
| External access to our bucket | Direct calls from the internet or other accounts | **Bucket policy** (`aws:SourceVpce`) | Day 4 |
| DNS tunneling | 53/UDP allowed | Resolver query logs + DNS Firewall | Week 7 |
| (Detection) every path | — | Flow Logs egress analysis | Day 3 |

The bottom three rows of the table are "what remains even after you have removed the internet." Even if you remove the internet path, the passage out to AWS services and the passage for name resolution remain, and so the last lock of a zero-internet VPC is not routing but **policy**.

### Signal Words That Separate the Answer Choices

The question stem almost always contains words that point to the answer. If you collect the recurring correspondences, your reading speed picks up.

| Signal word in the stem | The answer it points to |
|--------------|-----------|
| "responses don't come back," "succeeds only intermittently" | NACL outbound ephemeral ports |
| "block a specific IP," "explicitly deny" | NACL Deny (low number) |
| "Auto Scaling," "IPs keep changing" | SG reference |
| "within the same subnet" | SG (NACL doesn't apply) |
| "most fundamental block," "most effective" | Remove routing / relocate the subnet / turn off PubliclyAccessible |
| "cost-effective," "S3 from inside the VPC" | Gateway Endpoint (free) |
| "from on premises over Direct Connect" | Interface Endpoint + DNS configuration |
| "only our organization's accounts," "leaking to an external account" | `aws:PrincipalOrgID` / `aws:ResourceOrgID` |
| "only requests that came through this VPC" | `aws:SourceVpce` in the bucket policy |
| "inspect the packet contents" | Traffic Mirroring (not Flow Logs) |
| "block in real time" | Not Flow Logs — SG/NACL/Network Firewall |
| "which component blocked it" | Reachability Analyzer |
| "continuously audit whether an unintended path exists" | Network Access Analyzer |
| a "timeout" occurs | Connectivity layer (routing, NACL, SG, DNS) |
| "AccessDenied" occurs | Policy layer (endpoint, resource, IAM) |

### A One-Screen Collection of Audit Commands

```bash
# ① Subnets that have an internet path
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-0abc1234" \
  --query 'RouteTables[?Routes[?starts_with(GatewayId || `x`, `igw-`)]].Associations[].SubnetId'

# ② Every ENI that has a public IP
aws ec2 describe-network-interfaces \
  --query 'NetworkInterfaces[?Association.PublicIp!=null].[NetworkInterfaceId,SubnetId,Association.PublicIp,Description]' \
  --output table

# ③ SGs with 0.0.0.0/0 inbound
aws ec2 describe-security-groups --filters "Name=ip-permission.cidr,Values=0.0.0.0/0" \
  --query 'SecurityGroups[].[GroupId,GroupName,VpcId]' --output table

# ④ Subnets using the default NACL as is (effectively uncontrolled)
aws ec2 describe-network-acls --filters "Name=default,Values=true" \
  --query 'NetworkAcls[].Associations[].SubnetId'

# ⑤ VPCs whose flow log is off or abnormal
aws ec2 describe-flow-logs --query 'FlowLogs[?FlowLogStatus!=`ACTIVE`].[FlowLogId,ResourceId,FlowLogStatus]'

# ⑥ Endpoint list and whether a policy is applied
aws ec2 describe-vpc-endpoints \
  --query 'VpcEndpoints[].[VpcEndpointId,ServiceName,VpcEndpointType,State,PrivateDnsEnabled]' \
  --output table
```

## Troubleshooting Decision Tree

```
Can't connect?
 ├─ timeout (no response at all)
 │    → Route path? → SG inbound? → NACL? → Reachability Analyzer
 ├─ Request goes out but no response
 │    → Check NACL outbound ephemeral ports (1024-65535) (stateless)
 ├─ Only a specific IP isn't blocked
 │    → If you're trying with an SG, it can't be done; switch to a NACL Deny
 ├─ Created an endpoint but traffic still leaks to the internet
 │    → Check the two items: Private DNS + VPC DNS attributes
 └─ AccessDenied (the network works)
      → Check Endpoint Policy / the SourceVpce condition in the bucket policy
```

> 🎯 **Scenario**: "From on premises, trying to reach S3 over DX, I get a timeout rather than AccessDenied." — A timeout is a network reachability problem. If you created an S3 **Gateway** Endpoint, it can't be reached from on premises (VPC-internal only). Switch to an **Interface** Endpoint, and configure Route 53 Resolver so that the on-premises resolver resolves the S3 domain to the endpoint's private IP. If it had been AccessDenied it would be a policy problem, but since it's a timeout, look at the connectivity layer (endpoint type, DNS, routing). **Narrowing the layer by error type is the key.**

## Week 3 in One Paragraph

Network security is the work of controlling reachability. **Routing** is the invisible block that makes things unreachable when there is no route; **NACLs** (stateless, can Deny, subnet) and **security groups** (stateful, Allow only, ENI) form two layers of firewall. Traffic that flowed is recorded as metadata by **Flow Logs**, letting you read a breach after the fact (a REJECT surge = reconnaissance, unexpectedly large egress = exfiltration). For external communication, narrow it down with **VPC Endpoints** instead of indiscriminate NAT, and build the data perimeter with the **SourceVpce and PrincipalOrgID conditions in endpoint and bucket policies**, so that data does not leak even if credentials are stolen. All of these layers together form defense in depth.

## Wrapping Up

Week 3 covered "blocking (control)," "seeing (visibility)," and "removing the path itself (private connectivity)." Break a complex question down by layer — is it routing, an SG, a NACL, or a policy? If the error is a timeout, it's the connectivity layer; if AccessDenied, it's the policy layer.

Here are three sentences that ran through the whole week.

**First, reaching is AND and blocking is OR.** For internet exposure to hold, a public address, IGW routing, the NACL, the SG, the return path, and a listening process must all be true, and the defender only needs to cut one of them. The cheapest and most reliable node is always routing. When the exam asks for "the most fundamental action," choose the option that removes the path or address, not the one that narrows a rule.

**Second, only NACLs create asymmetric failures.** A shape where the request passes but the response is blocked can structurally never be produced by an SG, which remembers the request. This one sentence immediately sorts out SG/NACL questions, and you can see it with your own eyes the moment you match a round-trip pair in Flow Logs.

**Third, inbound is dense and outbound is empty.** There are configurations that put rules only on incoming traffic and none on outgoing traffic. Yet data exfiltration happens in the outgoing direction. The Day 4 design — delete NAT, open only the services you need as endpoints, and restrict to "our organization's resources only" with the endpoint policy — is the only way to fill this blank. And the real value of that design lies in **breaking the equation between credential theft and data exfiltration**.

What we built this week is, in the end, a structure that "leaves only the paths that were explicitly allowed." We also got tools to verify that this structure is standing correctly — **Reachability Analyzer / Network Access Analyzer**, which judge by configuration; **Flow Logs**, which confirm with actual flows; and **CloudTrail**, which leaves the grounds for a policy denial. Only when design and verification form a pair does isolation become a fact rather than a claim.

Next, in Week 4, we look at the second axis of infrastructure security — edge protection and traffic inspection (WAF, Shield, Network Firewall, CloudFront). If everything up to today was isolation "inside" the VPC, next is active defense that inspects and filters threats coming in at the VPC "boundary."

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
