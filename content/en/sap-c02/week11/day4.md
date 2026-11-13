# Day 4 - Edge Security: WAF, Shield, Firewall Manager, and the Layers of DDoS Defense

The moment you expose a web application to the internet, two kinds of enemies show up at the same time. One is **DDoS, which pushes by volume**: it surges traffic to paralyze the server. The other is **application attacks that dig in by cunning (payload)**: sophisticated requests such as SQL injection and XSS that steal data. The two are defended at different layers. DDoS is mostly stopped at L3/L4 (network/transport) and injection at L7 (application). So AWS edge security separates **Shield (DDoS)** from **WAF (L7 filtering)**, and extends them with **Firewall Manager** to apply them across multiple accounts at once, **Network Firewall** to guard the inside of a VPC, and **DNS Firewall** to block malicious domains.

On the SAP-C02 exam, edge security appears as decisions like "at which layer do you stop this threat," "is Shield Standard enough or do you need Advanced," and "how do you apply a WAF policy to hundreds of accounts at once." Keeping the 7 OSI layers in mind and first asking "which layer is this attack" is the starting point of the correct answer. Today we organize how each service works and the defense by DDoS type, layer by layer.

## Threats and Defenses Through the OSI Layers

DDoS is divided into three types by the layer it attacks (this classification determines the choice of defense).

| DDoS type | Layer | Example | Main defense |
|-----------|------|------|---------|
| **Volumetric** | L3/L4 | UDP flood, ICMP flood, amplification attacks | Shield (absorbs automatically) |
| **Protocol** | L3/L4 | SYN flood, Ping of Death | Shield (mitigates automatically) |
| **Application** | L7 | HTTP flood, Slowloris | Shield Advanced + WAF Rate-Based |

The key point: **Shield is the main tool for L3/L4 DDoS, and WAF for L7 attacks**. Shield Standard automatically mitigates L3/L4 for free but cannot stop L7. L7 DDoS (a mass of HTTP requests that look legitimate) is stopped by Shield Advanced's L7 protection together with WAF's Rate-Based rules.

The OSI 7-layer model (ISO/IEC 7498-1) serves as a map for security design. Attacks and defenses differ by layer: L3 (IP) uses NACLs and routing, L4 (TCP/UDP) uses Security Groups and Shield, and L7 (HTTP) uses WAF. This layer distinction matters because of the efficiency principle "do not push up to a higher layer what you can stop at a lower one." If a volumetric DDoS is dragged all the way to L7 (the application), it has already consumed server resources. Shield absorbs it at the AWS edge (the network boundary) and blocks it before it reaches the application. On the exam, the first question for "which service stops it" is always "which layer is this attack."

## WAF - Filter L7 Web Requests with Rules

WAF (Web Application Firewall) **inspects L7 (HTTP/HTTPS) requests and blocks malicious patterns**. It can be applied only to edge and entry-point services: **CloudFront, Application Load Balancer (ALB), API Gateway, AppSync, App Runner, and Cognito User Pool**. (You cannot attach it directly to EC2; attach it to the CloudFront or ALB in front.)

Structure: **Web ACL** → multiple **Rules (Statements)** → each Rule's **Action** (Allow / Block / Count / CAPTCHA / Challenge).

- **Managed Rule Groups**: Ready-to-use rule bundles managed by AWS: **Core Rule Set (CRS, OWASP-based)**, Known Bad Inputs, SQL injection, Linux/Windows OS, IP Reputation, **Bot Control**, Account Takeover Prevention. The Marketplace also has F5, Imperva, and Fortinet rules.
- **Rate-Based Rule**: Blocks when the number of requests from a single IP over a 5-minute window exceeds a threshold, mitigating L7 DDoS and brute force.
- **Fine-grained rules**: Geo Match (country), IP Set, Regex, Size Constraint, SQLi/XSS inspection, and so on.

WAF's Managed Rule "Core Rule Set" is based on the **OWASP Top 10** (the de facto standard for web application security). Since 2003, OWASP has periodically published the 10 most critical web vulnerabilities (SQL Injection, XSS, Broken Access Control, and so on), and it has become the common language of security standards worldwide. The value of turning on a WAF Managed Rule is that "you do not have to write and maintain this vast set of OWASP defense patterns yourself, and AWS updates the rules for new attacks." On the exam, "immediate OWASP Top 10 protection + minimal operational burden" is answered not by writing Custom rules but by **AWS Managed Rule Groups**.

> ⚠️ **Trap**: WAF is **not an automatic DDoS mitigation tool**. WAF only "blocks requests that match rules"; it does not automatically absorb a traffic surge. L7 DDoS mitigation is done by WAF's Rate-Based rules together with Shield Advanced. If WAF alone appears as "DDoS defense" in the answer choices, it is usually incomplete; the combination of Shield (L3/4 automatic) + WAF Rate-Based (L7) is often the correct answer.

## Shield - The Two Tiers of DDoS-Dedicated Defense

| Tier | Cost | Protected layers | Key features |
|------|------|-----------|-----------|
| **Standard** | Free (automatic) | L3/L4 | Automatic mitigation of SYN/UDP floods, etc. |
| **Advanced** | From $3,000/month | L3/L4 + L7 | Cost Protection, SRT 24/7, WAF included, global threat dashboard |

**Shield Standard** is applied automatically and free of charge to all AWS customers and mitigates L3/L4 DDoS (volumetric and protocol) at the AWS edge. No separate setup is needed.

**Shield Advanced** adds the following for $3,000 per month (one subscription per Organization, 1-year commitment):

- **L7 DDoS protection**: Mitigates application-layer attacks
- **Cost Protection**: **Refunds/waives** the extra charges (EC2, ELB, CloudFront, Route 53, and so on) incurred from scaling out because of DDoS
- **SRT (Shield Response Team)**: 24/7 expert support during an attack
- **WAF included**: WAF charges are included for Advanced-protected resources
- Targets: CloudFront, ALB/NLB, Global Accelerator, Route 53, Elastic IP

> 🎯 **Scenario**: "An e-commerce site was hit by an L7 HTTP flood DDoS and withstood the traffic through automatic scale-out, but that month's bill was 5 times the usual. Also, there was no expert staff to respond during the attack. How do you prepare?" → **Shield Advanced**. (1) L7 DDoS protection mitigates application-layer attacks, (2) **Cost Protection** waives the scale-out charges caused by DDoS, and (3) the **SRT** supports 24/7 during an attack. Shield Standard has no L7 protection and no Cost Protection, so it cannot handle this scenario. WAF alone has no automatic DDoS mitigation or cost protection. Trap: the three keywords "L7 DDoS + billing cost protection + 24/7 experts" are exclusive to Shield Advanced.

In 2020, AWS disclosed that it had mitigated with Shield what was then the largest DDoS attack ever (a CLDAP reflection amplification attack of about 2.3 Tbps). A CLDAP (Connectionless LDAP) reflection attack is an **amplification attack** that sends small queries to LDAP servers with a spoofed source IP so that large responses are poured onto the victim. An ultra-large volumetric attack like this can never be absorbed by a single data center; it can be stopped only by distributing the absorption across AWS's global edge capacity (tens of Tbps). The lesson: the essence of volumetric DDoS defense is "absorption capacity larger than the attack," and this is the hardest area for an individual company to build itself; Shield lends you the entire AWS edge capacity as a shield.

## Firewall Manager - Apply Security Policies Across Multiple Accounts at Once, Automatically

With a single account you can just attach WAF directly. But what if the Organization has 500 accounts and you are told to "apply the OWASP Managed Rule to every ALB, and apply it automatically to new accounts and new resources too"? Manual setup per account is impossible. **Firewall Manager** solves this.

- **Organization-level policy**: Define a single policy and it is automatically deployed to all accounts and all Regions
- **Targets**: WAF Rule, Shield Advanced, Security Group, Network Firewall, Route 53 DNS Firewall
- **Automatic application**: The policy is automatically applied to new accounts and new resources
- **Drift remediation**: Automatically detects, remediates, and notifies on policy violations (such as someone turning off WAF)

(Hypothetical case) A large enterprise grew to hundreds of accounts through mergers and acquisitions, and each business unit configured security on its own, so some ALBs had no WAF and some used wrong rules. When it defined a single policy in Firewall Manager, "apply `AWSManagedRulesCommonRuleSet` to every internet-facing ALB," it was automatically deployed to all accounts, and newly acquired accounts had the policy applied the moment they joined the Organization. When someone turned off WAF, it was detected as drift and notified. The lesson: the key difficulty of multi-account security is "consistency and automatic inclusion of new resources," and Firewall Manager enforces this centrally. On the exam, "Org-wide WAF/SG policy at once + new accounts automatically" is always Firewall Manager.

> ⚠️ **Trap**: Firewall Manager vs SCP vs Config. An **SCP** "prohibits what cannot be done" (a guardrail, a deny boundary); it does not deploy security rules. **Config** "evaluates and detects non-compliance"; it does not actively deploy WAF rules (remediation is possible, but deploying security policies is not its main job). Only **Firewall Manager** **actively deploys security policies at once** such as WAF, Shield, SG, and Network Firewall. On the exam, you separate them this way: "deploy and enforce security policy across multiple accounts" is Firewall Manager, "prohibit the action itself" is SCP, and "evaluate compliance" is Config.

## Network Firewall - IDS/IPS for Traffic Inside the VPC

If WAF blocks L7 web requests at the edge, **Network Firewall** inspects **all traffic (L3-L7) flowing inside the VPC**. It is a managed IDS/IPS based on the open-source **Suricata** rule engine.

- **Placement**: Put a firewall endpoint in each Availability Zone and force traffic through it with Route Tables (inline)
- **Features**: Stateful inspection, IDS/IPS (intrusion detection and blocking), domain filtering, **TLS Inspection** (decrypts and inspects encrypted traffic)
- **vs WAF**: WAF = L7 web at the edge (CF/ALB/APIGW), Network Firewall = traffic of all protocols across the VPC

It is a clever design that Network Firewall uses the Suricata rule format. Suricata is the industry-standard open-source IDS/IPS engine, and a vast set of threat signatures written by the security community (Emerging Threats and others) exists in Suricata format. By choosing Suricata compatibility instead of a proprietary format, AWS made it possible to bring existing on-premises IDS rules to the cloud as they are. TLS Inspection is a double-edged sword: catching encrypted malicious traffic (C2 communication and so on) requires decryption, but because it is a man-in-the-middle (MITM) structure, the burden of privacy, performance, and certificate management is large. So it is usually applied selectively, only to specific targets (suspicious outbound traffic).

(Hypothetical case) A fintech worried about outbound data exfiltration introduced full inspection of VPC traffic. At first it turned on TLS Inspection for all traffic, but the decryption and re-encryption overhead caused latency to spike, certificate management became complicated, and some certificate-pinning apps broke. The fix was selective application: trusted internal traffic was passed through, and TLS Inspection was applied **only to suspicious outbound targets (unclassified external domains)**. The lesson: TLS Inspection is powerful because it is a man-in-the-middle (MITM) structure, but the cost, performance, and compatibility burden is large. "Decrypt everything" is an anti-pattern, and narrowing the scope based on risk is the standard.

## DNS Firewall - Block Malicious Domains at the Name Stage

**Route 53 Resolver DNS Firewall** inspects **DNS queries leaving the VPC** and blocks lookups of malicious domains. When malware looks up a C2 server domain or attempts DNS tunneling for data exfiltration, it is blocked **at the name resolution stage**.

- **Managed domain lists**: Lists of malicious domains managed by AWS and third parties
- **Custom lists**: Define your own allow/block domains
- **Why not SG/NACL**: SGs and NACLs are IP-based, but the IPs of malicious domains change often. Blocking by domain name is more robust.

"Prevent users in the VPC from reaching malicious domains" is **DNS Firewall**, not Network Firewall (Network Firewall can also do domain filtering, but blocking based on a managed malicious domain list is more directly DNS Firewall). NACLs and SGs are IP-based and unsuitable for domain blocking (IPs change constantly). On the exam, the keyword for "block malicious domains" is Route 53 DNS Firewall.

The reason DNS Firewall is more robust blocking at the **name** stage rather than by IP lies in how malware communicates. Modern malware uses a **DGA (Domain Generation Algorithm)** to generate thousands of random domains every day, and the C2 server registers only one of them to evade detection. IPs change even more often (fast-flux DNS). IP-based blocking (SG/NACL) cannot keep up with this change. A domain reputation list (name-based) is more stable because it tracks domain patterns and registration information even when the IP changes. Also, **DNS tunneling** (hiding data in DNS queries to exfiltrate it) can be caught only at the DNS stage; this is why the name resolution layer is the key gateway for outbound threats.

## Full-Stack Edge Security Architecture

```
[Internet]
    │
[Route 53]  ◀── DNS Firewall (blocks malicious domain queries)
    │
[CloudFront] ◀── WAF (L7: OWASP, Rate-Based) + Shield Advanced (L3-7 DDoS)
    │
[ALB]  ◀── WAF (Origin protection)
    │
[VPC]  ◀── Network Firewall (L3-7 IDS/IPS, TLS Inspection)
    │
[EC2 / Container]

   Policy across all layers: Firewall Manager (Org-level bulk, automatic deployment)
```

## Wrapping Up

Edge security stands on the map of the OSI layers: **DDoS is Shield** (L3/L4 automatic, Advanced adds L7 + Cost Protection + SRT), **L7 web attacks are WAF** (Managed Rules for OWASP, Rate-Based for L7 DDoS and brute force), **traffic inside the VPC is Network Firewall** (L3-7 IDS/IPS and TLS Inspection), **malicious domains are DNS Firewall** (blocking at the name stage), and **Firewall Manager** deploys all of these across the entire Organization at once and automatically.

SAP exam mapping: (1) "Immediate OWASP Top 10 protection + minimal operational burden" → **WAF Managed Rule Groups**, (2) "L7 DDoS + Cost Protection + SRT 24/7" → **Shield Advanced**, (3) "Free automatic L3/L4 DDoS" → **Shield Standard**, (4) "Org-wide WAF/SG policy at once + new accounts automatically" → **Firewall Manager**, (5) "IDS/IPS in the VPC + TLS Inspection" → **Network Firewall**, (6) "Block malicious domains in the VPC" → **Route 53 DNS Firewall**, (7) "Block specific countries" → **WAF Geo Match**, (8) "Limit brute force/L7 flood from a single IP" → **WAF Rate-Based Rule**. The next day ties all of Week 11's security together in one scenario.

---

## 📝 Practice Questions

**Question 1.** You want to protect a web application immediately against the OWASP Top 10 (SQL injection, XSS, and so on) while minimizing the operational burden of writing and maintaining rules yourself. Which is the most suitable?

A) Write all WAF rules yourself as Custom rules

B) AWS Managed Rule Groups (Core Rule Set, Known Bad Inputs, SQLi)

C) Shield Standard

D) Block ports with a NACL

**Answer: B**
Explanation: AWS Managed Rule Groups provide the OWASP Top 10-based Core Rule Set and more right away, and AWS updates the rules for new attacks, so the operational burden is minimal. A (all Custom) has a large authoring and maintenance burden and is slow to respond to new attacks. C (Shield Standard) is L3/L4 DDoS defense, not an L7 web vulnerability filter. D (NACL) is L3/L4 IP and port control and cannot inspect HTTP payloads. Trap: "immediate OWASP protection + minimal operations" is Managed Rule Groups, not Custom.

---

**Question 2.** You were hit by an L7 HTTP flood DDoS, you want the surge in automatic scale-out charges it caused to be waived, and you need 24/7 expert support during an attack. Which is the most suitable?

A) Shield Standard

B) Shield Advanced

C) WAF Rate-Based Rule only

D) CloudFront only

**Answer: B**
Explanation: Shield Advanced provides L7 DDoS protection + Cost Protection (waives the extra charges caused by DDoS) + SRT 24/7 support, all together. A (Standard) is free but automatically mitigates only L3/L4 and has no L7 protection, Cost Protection, or SRT. C (Rate-Based only) helps with L7 mitigation but has no cost protection or expert support. D (CloudFront) is caching and distribution, not DDoS cost protection or an SRT. Trap: the three keywords "L7 DDoS + Cost Protection + 24/7 SRT" are exclusive to Shield Advanced.

---

**Question 3.** You want to apply the same WAF Managed Rule to every internet-facing ALB in an Organization of 500 accounts, apply it automatically to newly added accounts and resources too, and automatically detect and remediate it if someone turns off WAF. Which is the most suitable?

A) AWS Config Rule

B) Firewall Manager

C) SCP

D) Control Tower

**Answer: B**
Explanation: Firewall Manager deploys WAF, Shield, SG, and Network Firewall policies across an Organization at once, applies them automatically to new accounts and resources, and automatically detects and remediates drift (such as WAF being disabled). A (Config) is mainly about evaluating non-compliance and does not actively deploy WAF policy. C (SCP) prohibits actions (a deny guardrail) and does not deploy security rules. D (Control Tower) is landing zone governance, not an engine for deploying WAF policy. Trap: "deploy security policy across multiple accounts + new automatically + drift remediation" is Firewall Manager.

---

**Question 4.** You need to apply IDS/IPS to all traffic flowing inside the VPC and also decrypt and inspect encrypted traffic (TLS Inspection). Which is the most suitable?

A) WAF

B) Network Firewall

C) Shield Advanced

D) Security Group

**Answer: B**
Explanation: Network Firewall is an L3-7 IDS/IPS based on Suricata rules; it inspects traffic inside the VPC inline and also supports TLS Inspection. A (WAF) inspects only L7 web requests at the edge (CF/ALB/APIGW) and cannot cover VPC-wide traffic or TLS Inspection. C (Shield) is DDoS defense, not IDS/IPS. D (SG) is a stateful IP/port filter, not payload inspection or IPS. Trap: "IDS/IPS inside the VPC + TLS Inspection" is Network Firewall.

---

**Question 5.** You want to block EC2 instances in the VPC from reaching malware C2 servers or known malicious domains at the name resolution stage. Which is the most suitable?

A) Block malicious IPs with a Security Group

B) WAF

C) Route 53 Resolver DNS Firewall

D) Block IPs with a NACL

**Answer: C**
Explanation: DNS Firewall blocks DNS queries leaving the VPC using managed/custom malicious domain lists, preventing access to C2 and malicious domains at the name resolution stage. A and D (SG/NACL) are IP-based, and the IPs of malicious domains change constantly, so they are unsuitable for domain blocking. B (WAF) is an inbound L7 web request filter, not outbound DNS query blocking. Trap: "block malicious domains (name-based)" is DNS Firewall, and IP-based (SG/NACL) is unsuitable.

---

**Question 6.** You want to block only web requests coming from a specific country (for regulatory or licensing reasons). Which is the most suitable?

A) NACL

B) WAF Geo Match Rule

C) Shield

D) Security Group

**Answer: B**
Explanation: The WAF Geo Match Rule identifies the country of origin of a request and blocks/allows specific countries. A (NACL) and D (SG) are IP-based, so country-level mapping and management are impractical. C (Shield) is DDoS defense, not a region-based filter. Trap: "block a specific country" is WAF Geo Match.

---

**Question 7.** You want to automatically block L7 flood or brute force in which a single IP sends an abnormally large number of requests over 5 minutes. Which is the most suitable?

A) Shield Standard

B) WAF Rate-Based Rule

C) NACL

D) Network Firewall

**Answer: B**
Explanation: The WAF Rate-Based Rule automatically blocks when the number of requests from a single IP over a 5-minute window exceeds a threshold, mitigating L7 flood, brute force, and credential stuffing. A (Shield Standard) is automatic L3/L4 DDoS mitigation, not per-IP request frequency limiting. C (NACL) has no frequency-based limiting feature. D (Network Firewall) is IDS/IPS inside the VPC, and per-IP rate limiting of edge web requests is not its main job. Trap: "limit single-IP request frequency (L7)" is the WAF Rate-Based Rule.
