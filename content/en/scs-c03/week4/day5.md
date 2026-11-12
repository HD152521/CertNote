# Day 5 - Week 4 Synthesis: Integrated Review of Edge and Perimeter Defense Scenarios

This week covered the second axis of infrastructure security: *edge and perimeter defense*. WAF (L7 filter), Shield (DDoS absorption), Network Firewall/DNS Firewall (VPC inspection and domain control), and CloudFront/ACM/OAC (edge integration and origin locking). Today we tie them into a single decision framework. The exam asks less about individual service knowledge and more about *"which control do you place at which point in this situation?"* The core is **two-dimensional thinking: layer (what kind of threat?) × location (where do you block it?)**.

## Integrated Decision Matrix: Threat → Control

| Threat/Requirement | Primary control | Placement |
|-----------|----------|-----------|
| L7 injection such as SQLi/XSS | WAF managed/match rule + TextTransformation | CloudFront or ALB |
| HTTP/GET flood (L7 DDoS) | WAF rate-based rule (+ScopeDown) | CloudFront/ALB |
| SYN/UDP flood (L3/4 DDoS) | Shield (Standard automatic, Advanced enhanced) | Edge (CloudFront/R53/GA) |
| Cost protection for large attacks, DRT support | Shield Advanced | Registered protected resources |
| Login brute force | WAF rate-based (CUSTOM_KEYS) + CAPTCHA | Edge |
| VPC outbound domain control | Network Firewall stateful (SNI/Host) | Inspection subnet/VPC |
| Intrusion signatures (IPS) | Network Firewall stateful (Suricata) | Inspection VPC |
| DNS-based malware/exfiltration | Route 53 DNS Firewall | VPC Resolver |
| Central inspection of multi-account traffic | Network Firewall + TGW (appliance mode) | Central inspection VPC |
| Block direct access to S3/origin | OAC + bucket policy (SourceArn) | CloudFront ↔ S3 |
| Per-content/time-limited access | Signed URL (single object) / signed cookie (path) | CloudFront |
| Enforce TLS and automatic renewal | ACM (us-east-1 for CF) + Viewer Protocol Policy | CloudFront/ALB |
| Enforce WAF policy across accounts | Firewall Manager | Organizations |

The foundation of this matrix is *defense in depth*. Rather than relying on a single control, you stack layers of defense: DNS (name resolution) → edge (L7 filtering and absorption) → network (IPS and domains) → origin (locking). If one layer is bypassed, the next one blocks. The "best" answer on the exam is usually the control that blocks *at the appropriate layer closest to the attack, in a way that cannot be bypassed*.

## Four Services on One Page: What Each Sees and How It Is Enforced

Most of this week's confusion comes from the fact that there are "four firewalls with similar names." If you firmly grasp just two rows of the table below, **what it can see** and **how it is enforced**, wrong answer choices filter themselves out.

| | AWS WAF | AWS Shield | Network Firewall | Security Group |
|---|---|---|---|---|
| **Layer** | L7 (HTTP) | L3/L4 (+Advanced coordinates L7) | L3-L7 | L3/L4 |
| **What it can see** | Method, URI, query, headers, cookies, body | Traffic volume, packet patterns | Payload, TLS SNI, HTTP Host, IPS signatures | IP, port, protocol, SG references |
| **What it blocks** | Injection, bots, L7 floods, authentication abuse | Volumetric/state-exhaustion DDoS | Outbound domains, intrusion signatures | Exposure of the service itself |
| **Enforcement method** | **Associated** with a resource | Automatic (Std) / **protection registration** (Adv) | **Routing forces traffic through it** | Attached to the ENI (cannot be bypassed) |
| **How it fails** | Useless if the resource is bypassed | No Advanced benefits if not registered | No inspection if a route is missing | (Structurally cannot be bypassed) |
| **Multi-account enforcement** | Firewall Manager | Firewall Manager | Firewall Manager | Firewall Manager |
| **What it cannot do** | Non-HTTP traffic, bandwidth absorption | Precise L7 blocking (WAF does that) | Encrypted bodies (without decryption), ECH | Domain/payload inspection |

The row the exam digs into most often in this table is **"How it fails"**. Three services go silently ineffective for three different reasons, and the fact that silence is the most dangerous failure mode is the backbone of most of this week's questions.

| Detailed contrast | Left | Right | Decision criterion |
|---|---|---|---|
| Shield **Standard** vs **Advanced** | Automatic, free, L3/L4 absorption | Subscription and registration required, L7 integration, SRT, cost protection, visibility | If cost protection/expert support/attack metrics are mentioned, Advanced |
| **Network Firewall** vs **GWLB + appliance** | Managed, Suricata, no operational burden | Vendor product, GENEVE, portable policies | **Whether a vendor is specified** and whether the operational burden is acceptable |
| **Network Firewall (SNI)** vs **DNS Firewall (query)** | Blocks the connection attempt | Blocks name resolution | If direct-IP connections must also be blocked, Network Firewall is required |
| **OAC** vs **OAI** | SigV4, supports SSE-KMS, current | SigV2, limited, legacy | Always OAC for new setups |
| **Signed URL** vs **signed cookie** | Single object | Multiple objects under a path pattern | Number of objects and whether the URL can be changed |
| **CloudFront signed URL** vs **S3 presigned URL** | Passes through edge controls (WAF/Shield/OAC) | **Bypasses** the edge | If edge controls must apply, CloudFront |
| **Viewer** vs **Origin Protocol Policy** | Viewer ↔ edge leg | Edge ↔ origin leg | "Encryption on every leg" means **both** |

## Thinking About Placement: Put Controls on a Chokepoint That Cannot Be Bypassed

Even the same WAF rule has a different security effect depending on *where you attach it*.

- **WAF at the edge (CloudFront)**: blocks malicious traffic before it reaches the origin. However, you must also block direct origin access (OAC/prefix list), or there is a bypass.
- **WAF on the ALB**: blocks at the regional entry point. Use it when the ALB is the perimeter without CloudFront.
- **If both are public, controls are distributed** and bypass paths appear → align the perimeter into a single line.

The same goes for Network Firewall. Unless routing *forces* traffic through the firewall endpoint, the rules are meaningless (the Day 3 trap). A central inspection VPC creates a choke point that all traffic passes through, closing off bypasses.

```
[ This whole week on one page — the defensive line narrows from top to bottom ]

  ┌──────────────────────── Internet ───────────────────────┐
  │  Legitimate users   L7 injection/bots    L3/4 flood      │
  └───────┬───────────────────┬────────────────┬───────────┘
          ▼                   ▼                ▼
  ┌───────────────────────────────────────────────────────┐
  │ Route 53 (anycast DNS)          ← DNS flood via Shield │  ① Name resolution
  └───────────────────────┬───────────────────────────────┘
                          ▼
  ┌───────────────────────────────────────────────────────┐
  │ CloudFront edge                                        │  ② Edge perimeter
  │  ├ Shield Standard : automatic absorption of common L3/L4 │
  │  ├ Shield Advanced : enhanced detection, cost protection, SRT, automatic L7 │
  │  ├ WAF(CLOUDFRONT) : SQLi/XSS, rate-based, Bot, CAPTCHA │
  │  ├ Geo Restriction / Response Headers Policy           │
  │  ├ Signed URL/cookie : per-content credential check    │
  │  └ TLS termination : ACM @ us-east-1, TLS floor enforced │
  └───────────────────────┬───────────────────────────────┘
                          │  * There must be no other path below this point
                          │     OAC / prefix list / X-Origin-Verify / BPA
                          ▼
  ┌───────────────────────────────────────────────────────┐
  │ S3 (BPA ON) or ALB → app                               │  ③ Origin
  └───────────────────────┬───────────────────────────────┘
                          ▼
  ┌───────────────────────────────────────────────────────┐
  │ Inside the VPC · outbound                              │  ④ Internal/exfiltration path
  │  ├ Network Firewall : domain allow list + Suricata IPS │
  │  ├ DNS Firewall     : blocks resolution of malicious/C2 domains │
  │  └ (multi-account) TGW hub + inspection VPC + appliance mode │
  └───────────────────────────────────────────────────────┘

  ① and ② block what comes "in", and ④ blocks what goes "out".
  What usually determines the scale of damage after a breach is ④.
```

The axis most often overlooked in this diagram is the **direction of ④**. Both exam questions and real-world incident thinking gravitate toward "how did they get in?", but what determines the actual scale of damage is **where data could go after the intrusion**. This is why outbound domain allow lists and DNS controls take up half of this week.

> 🎯 **Integrated scenario A**: "A global web app is simultaneously hit by L7 SQLi attempts + intermittent large-scale SYN floods + login brute-force attempts. The origin is ALB+EC2." Answer: (1) place CloudFront in front + ACM (us-east-1) TLS, (2) CLOUDFRONT-scope WAF: SQLi managed rule (TextTransformation) + `/login` scope-down rate-based rule (CUSTOM_KEYS) + CAPTCHA, (3) register Shield Advanced (absorbs the SYN flood + cost protection + DRT), (4) block direct access to the origin ALB with the CloudFront prefix list + X-Origin-Verify. Every service from this week cooperates in a single scenario.

> 🎯 **Integrated scenario B**: "Workload VPCs in 100 accounts communicate with the internet and with each other. You want to restrict all outbound traffic to approved domains only, apply IPS, and operate it centrally." Answer: a TGW hub + Network Firewall in a central inspection VPC (stateful: domain allow list + Suricata IPS) + TGW appliance mode + DNS Firewall to block resolution of malicious domains + Firewall Manager to deploy policy centrally. Both East-West and North-South traffic pass through a single choke point.

> 🎯 **Integrated scenario C**: "A media service serves video only to paying subscribers. Subscribers share links, causing unauthorized viewing, and some users discover the S3 bucket URL and download the originals directly. In addition, the service cannot be offered in certain countries under copyright contracts." The answer has four components. (1) Grant time-limited access to the `/premium/*` path with a **signed cookie**, and add an IP condition to the signing policy if needed, (2) block direct S3 access with **OAC + an `AWS:SourceArn` bucket policy + Block Public Access**, (3) block the contractually excluded countries with **CloudFront Geo Restriction** (it is a legal requirement, so geo blocking is the appropriate control), (4) if the origin is an ALB, lock it with the prefix list and a secret header. Here the choice "use S3 presigned URLs" is wrong because it bypasses the edge controls entirely.

> 🎯 **Integrated scenario D**: "A regulatory audit raised three findings: encryption in transit is not applied on every leg, workloads can communicate with arbitrary internet destinations, and the history of security-control changes cannot be proven." Each finding is at a different layer, so the answer splits into three. (1) **Fix both the Viewer/Origin Protocol Policy to HTTPS** and upgrade the ALB → backend leg to HTTPS as well (Day 4), (2) seal outbound traffic with **Network Firewall STRICT_ORDER + default drop + a domain allow list**, plus **DNS Firewall + blocking direct queries to external DNS** (Day 3), (3) collect WAF logs, NFW alert/flow logs, and Resolver query logs into a central account and manage the rules as IaC so that **both the change history and the evidence for blocks are provable**. The third item is especially important: in regulatory responses, the claim "we blocked it" does not hold without logs.

## The Common Operating Procedure: The Sequence Is the Same for Any Control

This week's four services differ from each other, but **how you operate them converges on a single procedure.** If you memorize this procedure, you can apply the same judgment to a control you have never seen before.

```
[ Standard procedure for introducing and tuning a control — identical regardless of service ]

  1) Turn it on in observation mode (do not block)
       WAF                → OverrideAction/Action: Count
       Shield automatic L7 mitigation → action: Count
       Network Firewall   → Suricata alert rule
       DNS Firewall       → action: ALERT
                │
  2) Quantify "what is getting caught" using logs and metrics
       WAF sampled requests / CloudWatch metrics / Athena
       NFW alert log / Resolver query log
                │
  3) Determine whether what got caught is legitimate
       Legitimate → go to 4)     Malicious → go straight to 5)
                │
  4) Design exceptions as narrowly as possible  ← the exam's correct answer is always here
       WAF   : label matching + path/header conditions, RuleActionOverrides
       NFW   : add only the needed domains to the allow list
       (disabling the whole group or allowing IPs wholesale is a last resort)
                │
  5) Switch to blocking and watch for regressions
       Alarm on BlockedRequests/DroppedPackets spikes + prepare a rollback procedure
```

> ⚠️ **Trap**: The step most often skipped in this procedure is **step 2 (quantification)**. If you turn on observation mode but never actually analyze the logs and move to Block by gut feeling, going through observation mode was pointless. Conversely, staying in observation mode indefinitely is also a failure: **a rule in Count state blocks nothing.** On the exam too, a design that stops at "left it in Count" is usually an incomplete answer, and "observe, then switch to Block" is the complete form.

Perimeter defense failures usually happen not because "there was no control" but because **"there was a control, but traffic did not pass through it."** Well-known cloud breach cases have repeatedly shown a few patterns. A web firewall was in place, but the credentials behind it had excessive permissions, so bypassing a single layer led to sweeping data access; a storage bucket sat behind a CDN, but the bucket itself was left public so anyone could download directly; and, in a third pattern, the intrusion itself was not prevented, but **outbound controls and logs made it possible to pin down the scope of exfiltration and cut it off early**. The first two are real-world examples of the "five paths by which the perimeter leaks," and the last is why this week spent half its time on outbound controls (Day 3) and logging. **On the premise that perfect blocking does not exist, reducing bypass paths and making things explainable after the fact** is the realistic goal of perimeter defense.

## Audit Check: Sweep the Perimeter in Ten Lines

If you were to actually audit this week's material beyond exam preparation, the commands below make a first pass. Each command corresponds to one of the "ways it fails" learned earlier.

```bash
# ① WAF: is the Web ACL actually attached to a resource (missing association = no control)
aws wafv2 list-web-acls --scope CLOUDFRONT --query 'WebACLs[].{Name:Name,Id:Id}'
aws wafv2 list-resources-for-web-acl \
  --web-acl-arn arn:aws:wafv2:ap-northeast-2:111122223333:regional/webacl/app-acl/def-456

# ② WAF: is logging enabled (without it, neither tuning nor proof is possible)
aws wafv2 get-logging-configuration \
  --resource-arn arn:aws:wafv2:us-east-1:111122223333:global/webacl/prod-edge-acl/abc-123

# ③ Shield: list of resources registered as protected (unregistered = no Advanced benefits)
aws shield list-protections --query 'Protections[].{Name:Name,Resource:ResourceArn}'

# ④ Network Firewall: which subnets hold the endpoints and are they ready
aws network-firewall describe-firewall --firewall-name prod-inspection \
  --query 'FirewallStatus.SyncStates'

# ⑤ Network Firewall: do the routes actually point at the endpoint (the biggest trap)
aws ec2 describe-route-tables \
  --query 'RouteTables[].Routes[?VpcEndpointId!=null].{Dest:DestinationCidrBlock,Vpce:VpcEndpointId}'

# ⑥ DNS Firewall: is the rule group associated with the VPC (missing association = not applied)
aws route53resolver list-firewall-rule-group-associations \
  --query 'FirewallRuleGroupAssociations[].{Vpc:VpcId,Group:FirewallRuleGroupId,Status:Status}'

# ⑦ CloudFront: WAF, geo restriction, and TLS floor per distribution at a glance
aws cloudfront list-distributions \
  --query 'DistributionList.Items[].{Id:Id,WebACL:WebACLId,MinTLS:ViewerCertificate.MinimumProtocolVersion,Geo:Restrictions.GeoRestriction.RestrictionType}'

# ⑧ S3: public access block status of the origin bucket
aws s3api get-public-access-block --bucket my-origin-bucket

# ⑨ Origin exposure: list of internet-facing load balancers
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?Scheme==`internet-facing`].{Name:LoadBalancerName,DNS:DNSName}'

# ⑩ Alternate entry points: are there Lambda function URLs without authentication
aws lambda list-functions --query 'Functions[].FunctionName' --output text
```

The questions running through these ten commands are really only two: **"Is the control on the path?"** (①③④⑤⑥) and **"Is there a door leading out of the path?"** (⑦⑧⑨⑩). A common mistake of people doing a security architecture review for the first time is to start by examining the contents of the rules, but the sophistication of a rule only matters **on the premise that traffic passes through that rule**. So the order of a review is always *path → enforcement → rules*. Once this order becomes second nature, you can find the biggest hole in an unfamiliar architecture within 15 minutes.

## Commonly Confused Distinctions

**WAF vs Shield vs Network Firewall** — the layers and traffic types differ:
- WAF: HTTP (L7) application requests. *Associated* with CloudFront/ALB/API GW, etc.
- Shield: DDoS (L3/4 absorption + L7 integration). Strong behind edge services.
- Network Firewall: inspection of general network traffic in the VPC (L3-L7), IPS, domains. Traffic passes through via routing.

**OAC vs OAI** — OAC is the currently recommended option (SigV4, SSE-KMS, dynamic requests, all Regions). Use OAC for new setups.

**Signed URL vs signed cookie** — a single object vs multiple objects under a path pattern.

**CloudFront signed URL vs S3 presigned URL** — the former passes through edge controls (WAF/Shield/OAC), the latter bypasses them.

**Network Firewall (SNI/domain) vs DNS Firewall (query)** — the former blocks connection attempts, the latter blocks name resolution. They are complementary.

**ACM Region rule** — us-east-1 for CloudFront, the resource's own Region for Regional resources.

> ⚠️ **Collected traps**:
> - Picking the wrong WAF Web ACL scope (CLOUDFRONT vs REGIONAL) so it does not attach to the target.
> - A 403 after configuring OAC because the bucket policy and KMS key policy were not updated.
> - Network Firewall routing not configured, so no inspection occurs at all.
> - TGW appliance mode missing, causing asymmetric stateful inspection malfunction.
> - Trying to stop an L7 HTTP flood with Shield Standard (→ WAF rate-based is the correct answer).
> - Issuing the ACM certificate for CloudFront in a Region other than us-east-1.

## Visibility and Operations: Proving What Was Blocked

Defense is proven by logs. The logs and metrics of this week's services:
- **WAF**: logs (`aws-waf-logs-` prefix) → CloudWatch/S3/Firehose. terminatingRuleId, labels, sampled requests. Mask sensitive headers with RedactedFields.
- **Shield Advanced**: CloudWatch metrics such as `DDoSDetected` and `DDoSAttackBitsPerSecond`, plus attack events.
- **Network Firewall**: flow logs + alert logs (IPS alerts).
- **DNS Firewall**: Resolver query logs (blocked/allowed queries).

Gather these signals into GuardDuty and Security Hub for correlation analysis, and connect alarms to SNS and SRT proactive engagement. This leads into Week 5's topic (detection and response).

The maturity of perimeter defense is determined not by "did you block it?" but by "can you *observe, tune, and prove* the blocking?" Run WAF in Count mode first to measure false positives (Day 1), distinguish legitimate surges from attacks with Shield health-based detection (Day 2), and verify IPS accuracy with Network Firewall alert logs (Day 3). Turning a control on is only the start; tuning controls with data is the essence of operational security.

## 📌 Key Takeaways

- [ ] Have you forced every entry through the edge (CloudFront), blocking direct origin access (OAC/prefix list/secret header)?
- [ ] Does the WAF scope match the target (CloudFront=CLOUDFRONT), and did you include TextTransformation?
- [ ] Do rate-based rules block L7 floods and brute force per key?
- [ ] Does the Shield tier match the threat scale and cost-protection requirements?
- [ ] Have you forced VPC traffic to route to the firewall endpoint (+ TGW appliance mode)?
- [ ] Do you complement DNS-layer threats with DNS Firewall?
- [ ] Do the ACM certificate Region (CloudFront=us-east-1) and automatic renewal (DNS validation) line up?
- [ ] Are the logs and metrics of every control centrally collected and turned into alarms?
- [ ] Did you design exceptions to managed rule groups *as narrowly as possible* (labels, conditions) rather than turning the whole group off?
- [ ] Does outbound traffic leave only to approved domains, and are direct queries to external DNS blocked?
- [ ] Did you finish Shield Advanced protected-resource registration and the SRT role and emergency contacts *in peacetime*?
- [ ] Have you counted every internet-facing endpoint (ALB, function URL, API GW)?

### In Closing

The question running through this week from start to finish was just one. **"Where is this control, and does traffic necessarily pass through it?"**

Service-by-service knowledge was the material for answering that question. WAF reads the meaning of HTTP requests but sees only the resources it is *associated* with. Shield absorbs scale through the nature of the network, but it performs best only when the workload is *behind the edge*, and Advanced benefits apply only to resources you *registered*. Network Firewall can see payloads and even domains, but if *routing* does not send traffic to it, it is as good as nonexistent. DNS Firewall can block at the name-resolution stage, but it sees only queries that *go through the VPC Resolver*. And CloudFront and origin locking do the job of removing the paths that go around behind all of these controls without passing in front of them.

The second thing that repeated was the **operating procedure**. Start with observation (Count/alert), quantify with logs, design exceptions as narrowly as possible, then switch to blocking and watch for regressions. The procedure was the same for WAF, for Shield automatic mitigation, and for Network Firewall. This procedure is why, when the exam asks for "the most appropriate first step," the answer is usually observation mode, and why "remove the group" or "allow everything" is usually wrong.

The third is **direction**. ① and ② block what comes in, and ④ blocks what goes out. Because the premise that intrusion can be blocked perfectly does not hold, the real value of perimeter defense lies in *reducing bypass paths* and *narrowing and recording the paths out*. The outbound controls of Day 3 and the logging emphasized all week are that axis.

Next week follows naturally from here. If this week was about "how to block," Week 5 is about **how to notice and respond to what you failed to block**: weaving all these logs and signals together with GuardDuty, Security Hub, Detective, and EventBridge to build detection and automated response. All week we repeated that turning a control on is only the start and tuning controls with data is the essence of operational security. How to handle that data is next week's topic.

---

## 📝 Practice Questions

**Question 1.** A global web app is simultaneously hit by SQLi attempts, a large-scale SYN flood, and login brute-force attacks. The origin is ALB+EC2. What is the most appropriate integrated design?

A) Attach WAF only to the ALB and scale up the EC2 instances  
B) Place CloudFront in front + CLOUDFRONT-scope WAF (SQLi managed rules + `/login` rate-based rule) + Shield Advanced + block direct origin access (prefix list/secret header)  
C) Manually block all suspicious IPs with a NACL  
D) Only distribute traffic with Route 53 weighted routing  

**Answer: B**  
Explanation: Because the three threats are at different layers, controls for each layer must be combined at the edge. Placing CloudFront in front consolidates entry at the edge; WAF handles SQLi (L7 filtering) and login brute force (rate-based); Shield Advanced handles the SYN flood (L3/4 absorption) and cost protection; and blocking direct origin access prevents bypass. Protecting only the ALB provides no edge absorption, and manual NACL blocking or simple traffic distribution cannot stop this combined threat.

---

**Question 2.** You want to restrict outbound traffic from the workload VPCs of 100 accounts to approved domains only, apply IPS, and operate it centrally. What is the most appropriate architecture?

A) Deploy Network Firewall individually in each VPC  
B) Transit Gateway hub + Network Firewall in a central inspection VPC (domain allow-list + Suricata IPS) + TGW appliance mode + central deployment with Firewall Manager  
C) Whitelist domains with Security Groups  
D) Block IPs with a NACL in each VPC  

**Answer: B**  
Explanation: For multi-account central inspection, the correct answer is the choke point pattern: a TGW hub with Network Firewall in a dedicated inspection VPC, appliance mode to guarantee stateful symmetry, and Firewall Manager to deploy policy centrally. Deploying individually per VPC is inefficient in operations and cost, and Security Groups/NACLs cannot do domain (SNI/Host) based control or IPS.

---

**Question 3.** A design that assumed Shield Standard alone was sufficient failed when the application received an L7 HTTP GET flood. What is the correct remediation?

A) Re-enable Shield Standard  
B) Limit the request rate per IP/custom key with a WAF rate-based rule (combined with Shield Advanced automatic L7 mitigation if needed)  
C) Increase the instance type  
D) Lower the Route 53 TTL  

**Answer: B**  
Explanation: Shield Standard mainly absorbs L3/L4 attacks, so it cannot precisely block an L7 HTTP flood. For an L7 flood, the direct control is a WAF rate-based rule that measures and blocks the request rate per IP/custom key, and it can be combined with the automatic application layer mitigation of Shield Advanced. Scaling instances or changing the TTL is not a fundamental mitigation.

---

**Question 4.** Between CloudFront signed URLs and S3 presigned URLs, which should you use so that requests pass through all of the edge protections (WAF, Shield, and OAC), and why?

A) S3 presigned URL, because it is simpler  
B) CloudFront signed URL, because it is validated at the edge and passes through WAF, Shield, caching, and OAC protections, whereas an S3 presigned URL bypasses these controls  
C) Both are the same  
D) Neither passes through WAF  

**Answer: B**  
Explanation: A CloudFront signed URL is validated at the edge, so it sits on a path that passes through WAF, Shield, edge caching, and OAC lockdown. An S3 presigned URL, on the other hand, is signed and validated directly by S3 and bypasses the CloudFront edge controls. Therefore, to apply edge protection consistently, the correct answer is CloudFront signed URL + OAC configuration.

---

**Question 5.** Which of the following is NOT frequently cited as a "pitfall" in this week's control placement?

A) Creating a WAF Web ACL whose scope (CLOUDFRONT/REGIONAL) does not match its target  
B) Getting a 403 because the bucket policy and KMS key policy were not updated after configuring OAC  
C) Inspection not occurring because traffic routing was not forced to the firewall endpoint for Network Firewall  
D) Using ACM DNS validation so that the certificate can be renewed automatically  

**Answer: D**  
Explanation: ACM DNS validation is not a pitfall but a *recommended best practice*; because domain ownership can be continuously verified, fully automatic renewal is possible. The rest are all genuinely frequent pitfalls: a scope mismatch leaves the ACL unattached, not updating policies after OAC causes a 403, and without routing configured Network Firewall inspection never happens at all. Because the question asks you to choose what is *not* a pitfall, the answer is the automatic-renewal configuration.

---
