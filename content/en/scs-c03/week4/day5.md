# Day 5 - Week 4 Synthesis: Integrated Review of Edge and Perimeter Defense Scenarios

This week has covered the second axis of infrastructure security: *edge and perimeter defense*. WAF (L7 filtering), Shield (DDoS absorption), Network/DNS Firewall (VPC inspection and domain control), CloudFront/ACM/OAC (edge integration and origin locking). Today we integrate these into one decision framework. The exam asks less about individual service knowledge and more about *"which control should I deploy where in this situation?"* The key is **two-dimensional thinking: layer (what threat?) × location (where do I block it?)**.

## Integrated Decision Matrix: Threat → Control

| Threat/Requirement | Primary Control | Placement |
|-----------|----------|-----------|
| SQLi/XSS etc. L7 injection | WAF managed/match rule + TextTransformation | CloudFront or ALB |
| HTTP/GET flood (L7 DDoS) | WAF rate-based rule (+ScopeDown) | CloudFront/ALB |
| SYN/UDP flood (L3/4 DDoS) | Shield (Standard auto, Advanced enhanced) | Edge (CloudFront/R53/GA) |
| Large attack cost refund, DRT support | Shield Advanced | Protected resources |
| Login brute force | WAF rate-based (CUSTOM_KEYS) + CAPTCHA | Edge |
| VPC outbound domain control | Network Firewall stateful (SNI/Host) | Inspection subnet/VPC |
| Intrusion signature (IPS) | Network Firewall stateful (Suricata) | Inspection VPC |
| DNS-based malware/exfiltration | Route 53 DNS Firewall | VPC Resolver |
| Multi-account central traffic inspection | Network Firewall + TGW (appliance mode) | Central inspection VPC |
| S3/origin direct access block | OAC + bucket policy (SourceArn) | CloudFront ↔ S3 |
| Content-level/time-limited access | Signed URL (single) / Signed Cookie (path) | CloudFront |
| TLS enforcement and auto-renewal | ACM (us-east-1 for CF) + Viewer Protocol Policy | CloudFront/ALB |
| Multi-account WAF policy enforcement | Firewall Manager | Organizations |

> 💡 **Related Theory**: This matrix's foundation is *defense in depth*. Rather than relying on a single control, build multiple defensive layers: DNS (name resolution) → edge (L7 filtering and absorption) → network (IPS and domain) → origin (locking). If one layer is bypassed, the next catches it. The exam's "best" answer usually involves blocking at *the appropriate layer closest to the attack, making bypass impossible*.

## Location Thinking: Place Controls at Unavoidable Choke Points

The same WAF rule has *very different security effects depending on where you attach it*.

- **WAF at edge (CloudFront)**: Block malicious traffic before reaching origin. However, you must block direct origin access (OAC/prefix list) to prevent bypass.
- **WAF at ALB**: Block at regional entry point. When ALB is the perimeter without CloudFront.
- **Both public: Controls become scattered**, creating bypass paths → align the perimeter on one line.

Network Firewall follows the same principle. If routing doesn't *force* traffic through the firewall endpoint, rules are meaningless (Day 3 trap). A central inspection VPC creates a choke point all traffic must pass through, blocking bypass.

> 🎯 **Integrated Scenario A**: "Global web app receives simultaneous L7 SQLi attempts, intermittent large SYN flood, and login brute force. Origin is ALB+EC2." Answer: (1) CloudFront front-line + ACM (us-east-1) TLS, (2) CLOUDFRONT scope WAF — SQLi managed rule (TextTransformation) + `/login` scoped-down rate-based (CUSTOM_KEYS) + CAPTCHA, (3) Shield Advanced registered (SYN flood absorption + cost protection + DRT), (4) Origin ALB restricted to CloudFront prefix list + X-Origin-Verify header verification to block direct access. One scenario showcases all this week's services working together.

> 🎯 **Integrated Scenario B**: "100 accounts with workload VPCs needing internet and inter-VPC comms, want all outbound restricted to approved domains, IPS applied, centrally managed." Answer: TGW hub + central inspection VPC with Network Firewall (stateful: domain allow-list + Suricata IPS) + TGW appliance mode + DNS Firewall to block malicious domain resolution + Firewall Manager for central policy deployment. Both East-West and North-South traffic passes through a single choke point.

## Frequently Confused Distinctions

**WAF vs Shield vs Network Firewall** — different layers and traffic types:
- WAF: HTTP (L7) application requests. *Attached to* CloudFront/ALB/API GW, etc.
- Shield: DDoS (L3/4 absorption + L7 integration). Powerful behind edge services.
- Network Firewall: General VPC network traffic (L3-L7) inspection, IPS, domain filtering. Traffic forced through by routing.

**OAC vs OAI** — OAC is current recommendation (SigV4, SSE-KMS, dynamic requests, all regions). Use OAC for new work.

**Signed URL vs Signed Cookie** — single object vs. multiple objects under a path pattern.

**CloudFront Signed URL vs S3 Presigned URL** — the former passes through edge (WAF/Shield/OAC) controls; the latter bypasses them.

**Network Firewall (SNI/domain) vs DNS Firewall (queries)** — former blocks connection attempts, latter blocks name resolution. Complementary.

**ACM Regional Rules** — CloudFront use requires us-east-1; regional resources use their region.

> ⚠️ **Trap Collection**:
> - Choosing wrong WAF Web ACL scope (CLOUDFRONT vs REGIONAL) so it doesn't attach to target.
> - OAC setup but not updating bucket policy and KMS key policy, resulting in 403.
> - Network Firewall routing not configured, so inspection never occurs.
> - TGW appliance mode omitted, causing asymmetric stateful inspection failure.
> - Trying to block L7 HTTP flood with Shield Standard (answer is WAF rate-based).
> - Issuing CloudFront ACM certificate in a region other than us-east-1.

## Visibility and Operations: Prove What You Block

Defenses are proven through logs. Logs and metrics from this week's services:
- **WAF**: Logs (`aws-waf-logs-` prefix) → CloudWatch/S3/Firehose. TerminatingRuleId, labels, sampled requests. RedactedFields masks sensitive headers.
- **Shield Advanced**: `DDoSDetected`, `DDoSAttackBitsPerSecond`, etc. CloudWatch metrics + attack events.
- **Network Firewall**: Flow logs + alert logs (IPS alerts).
- **DNS Firewall**: Resolver query logs (blocked/allowed queries).

These signals feed into GuardDuty and Security Hub for correlation analysis, and alarms connect to SNS and SRT proactive engagement. This bridges to Week 5 (detection and response) topics.

> 🔍 **Deeper Insight**: The maturity of perimeter defense isn't "did you block it?" but "can you *observe, tune, and prove* the block?" Run WAF in Count mode first to measure false positives (Day 1), use Shield health-based detection to distinguish normal traffic spikes from attacks (Day 2), validate IPS accuracy with Network Firewall alert logs (Day 3). Turning on a control is just the start; tuning it with data is what operational security is built on.

## One-Line Summary Checklist

- [ ] Forced all entry through edge (CloudFront) — blocked direct origin access (OAC/prefix list/secret header)
- [ ] Matched WAF scope to target (CloudFront = CLOUDFRONT), included TextTransformation
- [ ] Using rate-based rule to block L7 flood and brute force by key
- [ ] Shield tier matches threat scale and cost protection needs
- [ ] Routing forces VPC traffic through firewall endpoint (+ TGW appliance mode)
- [ ] Complementing DNS-layer threats with DNS Firewall
- [ ] Matched ACM certificate region (CloudFront = us-east-1) and auto-renewal (DNS validation)
- [ ] Centralized logging and alerting for all controls

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
