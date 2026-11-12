# Day 4 - Edge Security: WAF·Shield·Firewall Manager and Layered DDoS Defense

The moment you expose a web application to the internet, two types of enemies arrive simultaneously. One is **DDoS that attacks with volume** — flooding traffic to paralyze servers. The other is **application attacks that infiltrate with payloads** — data theft via SQL injection and XSS. These two are defended at different layers. DDoS is mainly blocked at L3/L4 (network/transport), while injection is blocked at L7 (application). That's why AWS edge security separates **Shield (DDoS)** and **WAF (L7 filtering)**, expands them to **Firewall Manager** (apply policies across multi-account), **Network Firewall** (protect VPC internals), and **DNS Firewall** (block malicious domains).

In SAP-C02 exam, edge security comes as decision-making questions: "at what layer do we block this threat?", "is Shield Standard enough or is Advanced needed?", "how do we apply WAF policies across hundreds of accounts?" The starting point for correct answers is asking "which OSI layer is this attack?" while keeping the 7 layers in mind. Today we'll organize each service's operating principles and defense strategies for different types of DDoS.

## Threats and Defenses by OSI Layer

DDoS breaks into three types depending on attack layer (this classification determines defense choice):

| DDoS Type | Layer | Examples | Primary Defense |
|-----------|-------|----------|---------|
| **Volumetric** | L3/L4 | UDP flood, ICMP flood, amplification attacks | Shield (automatic absorption) |
| **Protocol** | L3/L4 | SYN flood, Ping of Death | Shield (automatic mitigation) |
| **Application** | L7 | HTTP flood, Slowloris | Shield Advanced + WAF Rate-Based |

Key — **L3/L4 DDoS is Shield's job, L7 attacks are WAF's**. Shield Standard mitigates L3/L4 for free automatically but can't block L7. L7 DDoS (bulk generation of normal-looking HTTP requests) is blocked together by Shield Advanced's L7 protection + WAF's Rate-Based rules.

> 💡 **Related Theory**: The OSI 7-layer model (ISO/IEC 7498-1) serves as the roadmap for security design. Attacks and defenses differ per layer — L3 (IP) uses NACL and routing, L4 (TCP/UDP) uses Security Groups and Shield, L7 (HTTP) uses WAF. This layer distinction matters because of the efficiency principle: "don't bring what can be blocked at lower layers up to higher layers." If you drag volumetric DDoS to L7 (application), you've already consumed server resources. Shield absorbs it at the AWS edge (network boundary) before reaching the application. The first question in the exam is always "what layer is this attack?"

## WAF — Filtering L7 Web Requests by Rules

WAF (Web Application Firewall) **inspects L7 (HTTP/HTTPS) requests and blocks malicious patterns**. It applies to edge/entry point services only — **CloudFront, Application Load Balancer (ALB), API Gateway, AppSync, App Runner, Cognito User Pool**. (Can't attach directly to EC2 — attach to CloudFront or ALB in front.)

Structure: **Web ACL** → multiple **Rules (Statements)** → each Rule's **Action** (Allow / Block / Count / CAPTCHA / Challenge).

- **Managed Rule Groups**: Pre-made, immediately usable rule sets managed by AWS — **Core Rule Set (CRS, OWASP-based)**, Known Bad Inputs, SQL injection, Linux/Windows OS, IP Reputation, **Bot Control**, Account Takeover Prevention. Marketplace also has F5·Imperva·Fortinet rules.
- **Rate-Based Rule**: Blocks if a single IP's request count exceeds a threshold within a 5-minute window — mitigates L7 DDoS and brute force.
- **Fine-grained Rules**: Geo Match (country), IP Set, Regex, Size Constraint, SQLi/XSS checks, etc.

> 💡 **Related Theory**: WAF's Managed Rule "Core Rule Set" is based on **OWASP Top 10** (de facto standard for web application security). OWASP has periodically published the 10 most critical web vulnerabilities since 2003 (SQL Injection, XSS, Broken Access Control, etc.), becoming the common language of security standards worldwide. The value of enabling WAF Managed Rules is "you don't have to write and maintain this vast OWASP defense pattern yourself — AWS updates the rules as new attacks emerge." In the exam, "immediate OWASP Top 10 protection + minimal operations" means **AWS Managed Rule Groups**, not custom rule writing.

> ⚠️ **Trap**: **WAF is not an automatic DDoS mitigation tool**. WAF only blocks requests matching rules; it doesn't automatically absorb traffic spikes. L7 DDoS mitigation is done together by WAF's Rate-Based rule + Shield Advanced. When WAF alone appears in exam choices for "DDoS defense," it's usually incomplete — the correct answer is often Shield (L3/4 automatic) + WAF Rate-Based (L7) combination.

## Shield — Two Tiers of DDoS-Exclusive Defense

| Tier | Cost | Protected Layers | Key Features |
|------|------|-----------|-----------|
| **Standard** | Free (auto) | L3/L4 | Auto mitigation of SYN/UDP flood, etc. |
| **Advanced** | $3,000/month~ | L3/L4 + L7 | Cost Protection, SRT 24/7, WAF included, global threat dashboard |

**Shield Standard** is free and automatically applied to all AWS customers, mitigating L3/L4 DDoS (volumetric/protocol) at AWS edge. No additional setup needed.

**Shield Advanced** costs $3,000/month (Organization-wide 1 subscription, ~1-year commitment) and adds:

- **L7 DDoS Protection**: Application layer attack mitigation
- **Cost Protection**: Refunds/waives additional charges (EC2·ELB·CloudFront·Route 53, etc.) incurred from DDoS-triggered scale-out
- **SRT (Shield Response Team)**: 24/7 expert support during attacks
- **WAF Included**: WAF charges covered for Advanced protected resources
- Targets: CloudFront, ALB/NLB, Global Accelerator, Route 53, Elastic IP

> 🎯 **Scenario**: "E-commerce site receives L7 HTTP flood DDoS, survives via auto scale-out, but this month's bill is 5x normal. And had no specialist to respond during the attack. How to prepare?" → **Shield Advanced**. (1) L7 DDoS protection mitigates application-layer attacks, (2) **Cost Protection** waives DDoS-triggered scale-out charges, (3) **SRT** provides 24/7 support during attacks. Shield Standard is free but lacks L7 protection + Cost Protection. WAF alone lacks DDoS auto mitigation and cost protection. Trap: "L7 DDoS + cost protection + 24/7 expert" — three keywords exclusive to Shield Advanced.

> 📚 **Case Study**: In 2020, AWS publicly disclosed that Shield mitigated then-record DDoS (approx 2.3 Tbps CLDAP reflection amplification attack). Such massive volumetric attacks can't be absorbed by a single data center and need AWS's global edge capacity (tens of Tbps) to distribute and absorb. Lesson: volumetric DDoS defense's essence is "absorption capacity exceeding the attack," and this is the hardest area for individuals to build themselves — Shield loans AWS's entire edge capacity as a shield.

## Firewall Manager — Applying Security Policies Across Multi-Account in Bulk and Automatically

Single account — attach WAF directly. But Organization has 500 accounts and requires "apply OWASP Managed Rule to all ALBs, and automatically apply to new accounts/resources"? Manual setup per account is impossible. **Firewall Manager** solves this.

- **Organization-Level Policies**: Define single policy, automatically deploy across all accounts/all regions
- **Targets**: WAF Rules, Shield Advanced, Security Groups, Network Firewall, Route 53 DNS Firewall
- **Automatic Application**: Policies automatically apply to new accounts/resources
- **Drift Correction**: Auto-detect policy violations (e.g., someone disables WAF), auto-correct, and alert

> 📚 **Case Study**: Large enterprise expanded accounts to hundreds via M&A, but each business unit configured security differently — some ALBs lacked WAF, others used incorrect rules. With Firewall Manager defining "apply `AWSManagedRulesCommonRuleSet` to all internet-facing ALBs," the single policy auto-deployed across all accounts and new M&A accounts immediately got the policy upon joining Organization. Someone disabling WAF was drift-detected and alerted. Lesson: multi-account security's core challenge is "consistency and new-account automation," and Firewall Manager enforces it centrally. In the exam, "Org-wide WAF/SG policy in bulk + new accounts automatic" always means Firewall Manager.

> ⚠️ **Trap**: Firewall Manager vs SCP vs Config. **SCP** forbids "what's not allowed to be done" (guardrails, denial boundaries), doesn't deploy security rules. **Config** evaluates "non-compliance and detects" but doesn't proactively deploy WAF rules (remediation possible but not its primary job). **Only Firewall Manager** proactively **deploys security policies in bulk** for WAF, Shield, SG, Network Firewall. In the exam, "deploy security policies across multi-account" is Firewall Manager, "forbid actions" is SCP, "assess compliance" is Config.

## Network Firewall — VPC Internal Traffic IDS/IPS

If WAF blocks L7 web requests at the edge, **Network Firewall** inspects **all traffic flowing inside VPC (L3-L7)**. It's a managed IDS/IPS based on opensource **Suricata** rule engine.

- **Deployment**: Place firewall endpoints in each AZ, force traffic through via Route Table (inline)
- **Features**: Stateful inspection, IDS/IPS (intrusion detection/prevention), domain filtering, **TLS Inspection** (decrypt then inspect encrypted traffic)
- **vs WAF**: WAF = L7 web at edge (CF/ALB/APIGW), Network Firewall = all protocol traffic across VPC

> 🔍 **Deeper Dive**: Network Firewall using Suricata rule format is clever design. Suricata is the industry-standard opensource IDS/IPS engine, and a vast amount of threat signatures (Emerging Threats, etc.) authored by security community exist in Suricata format. By choosing Suricata compatibility over a proprietary format, AWS lets existing on-premises IDS rules be brought directly to cloud. TLS Inspection is a double-edged sword — you need decryption to catch encrypted malicious traffic (C2 communication), but that's a MITM architecture with privacy/performance/certificate-management burden. Typically applied selectively to specific targets (outbound suspicious traffic) rather than universally.

> 📚 **Case Study**: Fintech worried about outbound data exfiltration and deployed full VPC traffic inspection. Initially enabled TLS Inspection on all traffic, but decryption/re-encryption overhead caused latency spikes, certificate management got complex, and some certificate-pinning apps broke. Solution: selective application — let trusted internal traffic pass, apply TLS Inspection **only to outbound-suspicious destinations (unclassified external domains)**. Lesson: TLS Inspection is powerful but carries performance/compatibility/certificate costs. "Decrypt everything" is an anti-pattern; risk-based scope narrowing is standard.

## DNS Firewall — Blocking Malicious Domains at the Name Resolution Stage

**Route 53 Resolver DNS Firewall** inspects **DNS queries exiting VPC** and blocks malicious domain lookups. When malware tries C2 server domain lookup or DNS tunneling for exfiltration, it blocks at **the name-resolution stage**.

- **Managed Domain Lists**: AWS/third-party managed malicious domain lists
- **Custom Lists**: Define company-specific allow/block domains
- **Why not SG/NACL**: SG/NACL are IP-based; malicious domain IPs change frequently. Domain-name blocking is more robust.

> ⚠️ **Trap**: "VPC users can't access malicious domains" means **DNS Firewall**, not Network Firewall (Network Firewall can also do domain filtering, but managed malicious domain list blocking is DNS Firewall's direct strength). NACL/SG are IP-based so unsuitable for domain blocking (IPs change frequently). In the exam, the keyword for "malicious domain blocking" is Route 53 DNS Firewall.

> 💡 **Related Theory**: DNS Firewall's **name-based blocking** (not IP-based) is robust because of modern malware communication structure. Contemporary malware uses **DGA (Domain Generation Algorithm)** to generate thousands of random domains daily, with C2 server registering only one to evade detection. IPs change even more frequently (fast-flux DNS). IP-based blocking (SG/NACL) can't keep up with this change. Domain-reputation lists (name-based) track domain patterns and registration info even as IPs change, so more stable. Also **DNS tunneling** (hiding data in DNS queries for exfiltration) can only be caught at the DNS stage — the name-resolution layer is the critical gateway for outbound threats.

## Edge Security Full-Stack Architecture

```
[Internet]
    │
[Route 53]  ◀── DNS Firewall (block malicious domain queries)
    │
[CloudFront] ◀── WAF (L7: OWASP·Rate-Based) + Shield Advanced (L3-7 DDoS)
    │
[ALB]  ◀── WAF (origin protection)
    │
[VPC]  ◀── Network Firewall (L3-7 IDS/IPS, TLS Inspection)
    │
[EC2 / Container]

   Org-wide Policies: Firewall Manager (bulk deployment·auto per Org)
```

## Summary

Edge security stands on the OSI layer map — **DDoS uses Shield** (L3/L4 auto, Advanced adds L7 + Cost Protection + SRT), **L7 web attacks use WAF** (Managed Rules for OWASP, Rate-Based for L7 DDoS and brute force), **VPC internal traffic uses Network Firewall** (L3-7 IDS/IPS and TLS Inspection), **malicious domains use DNS Firewall** (block at name stage), and **Firewall Manager** deploys all these across Organization bulk and automatic.

SAP exam frequent mappings: (1) "OWASP Top 10 immediate protection + minimal operations" → **WAF Managed Rule Groups**, (2) "L7 DDoS + Cost Protection + SRT 24/7" → **Shield Advanced**, (3) "L3/L4 DDoS free auto" → **Shield Standard**, (4) "Org-wide WAF·SG policy in bulk + new accounts auto" → **Firewall Manager**, (5) "VPC internal IDS/IPS + TLS Inspection" → **Network Firewall**, (6) "VPC internal malicious domain blocking" → **Route 53 DNS Firewall**, (7) "Block specific country" → **WAF Geo Match**, (8) "Limit single IP L7 flood/brute force" → **WAF Rate-Based Rule**. Next day integrates all Week 11 security into one scenario.

---

## 📝 Practice Questions

**Question 1.** You want to protect a web application immediately from the OWASP Top 10 (SQL injection, XSS, and so on) while minimizing the operational burden of writing and maintaining rules yourself. Which is the most appropriate?

A) Write all WAF rules yourself as Custom rules

B) AWS Managed Rule Groups (Core Rule Set·Known Bad Inputs·SQLi)

C) Shield Standard

D) Block ports with NACLs

**Answer: B**

**Explanation:** AWS Managed Rule Groups immediately provide the OWASP Top 10-based Core Rule Set and more, and AWS updates the rules for new attacks, so the operational burden is minimal. A (all Custom) carries a heavy authoring and maintenance burden and responds slowly to new attacks. C (Shield Standard) is L3/L4 DDoS protection, not an L7 web vulnerability filter. D (NACL) controls L3/L4 IPs and ports and cannot inspect HTTP payloads. Trap: "immediate OWASP protection + minimal operations" is Managed Rule Groups, not Custom.

---

**Question 2.** You are under an L7 HTTP flood DDoS attack, want to be exempted from the surge in auto scale-out charges it causes, and need 24/7 expert support during the attack. Which is the most appropriate?

A) Shield Standard

B) Shield Advanced

C) WAF Rate-Based Rule only

D) CloudFront only

**Answer: B**

**Explanation:** Shield Advanced provides L7 DDoS protection + Cost Protection (waiver of additional charges caused by DDoS) + 24/7 SRT support. A (Standard) is free but only automatically mitigates L3/L4 and has no L7 protection, Cost Protection, or SRT. C (Rate-Based only) helps with L7 mitigation but has no cost protection or expert support. D (CloudFront) is caching and distribution, not DDoS cost protection or SRT. Trap: the three keywords "L7 DDoS + Cost Protection + 24/7 SRT" belong exclusively to Shield Advanced.

---

**Question 3.** You want to apply the same WAF Managed Rule to all internet-facing ALBs in a 500-account Organization, have it applied automatically to newly added accounts and resources, and have it automatically detected and remediated if someone turns off WAF. Which is the most appropriate?

A) AWS Config Rule

B) Firewall Manager

C) SCP

D) Control Tower

**Answer: B**

**Explanation:** Firewall Manager deploys WAF, Shield, SG, and Network Firewall policies across the Organization at once, applies them automatically to new accounts and resources, and automatically detects and remediates drift (such as WAF being disabled). A (Config) is primarily about evaluating noncompliance, not actively deploying WAF policies. C (SCP) prohibits actions (a deny guardrail) and does not deploy security rules. D (Control Tower) is landing zone governance, not an engine for deploying WAF policies. Trap: "multi-account security policy deployment + automatic for new + drift remediation" is Firewall Manager.

---

**Question 4.** You must apply IDS/IPS to all traffic flowing inside the VPC and also decrypt and inspect encrypted traffic (TLS Inspection). Which is the most appropriate?

A) WAF

B) Network Firewall

C) Shield Advanced

D) Security Group

**Answer: B**

**Explanation:** Network Firewall is a Suricata rule-based L3-7 IDS/IPS that inspects traffic inside the VPC inline and also supports TLS Inspection. A (WAF) inspects only L7 web requests at the edge (CF/ALB/APIGW) and cannot cover VPC-wide traffic or TLS Inspection. C (Shield) is DDoS protection, not IDS/IPS. D (SG) is a stateful IP/port filter, not payload inspection or IPS. Trap: "IDS/IPS inside the VPC + TLS Inspection" is Network Firewall.

---

**Question 5.** You want to prevent EC2 instances in the VPC from reaching malware C2 servers or known malicious domains by blocking at the name resolution stage. Which is the most appropriate?

A) Block malicious IPs with a Security Group

B) WAF

C) Route 53 Resolver DNS Firewall

D) Block IPs with a NACL

**Answer: C**

**Explanation:** DNS Firewall blocks DNS queries leaving the VPC using managed/custom malicious domain lists, preventing access to C2 and malicious domains at the name resolution stage. A and D (SG/NACL) are IP-based, and the IPs of malicious domains change constantly, so they are unsuitable for domain blocking. B (WAF) filters inbound L7 web requests and does not block outbound DNS queries. Trap: "blocking malicious domains (name-based)" is DNS Firewall; IP-based (SG/NACL) is unsuitable.

---

**Question 6.** You want to block only web requests coming from specific countries (for regulatory or licensing reasons). Which is the most appropriate?

A) NACL

B) WAF Geo Match Rule

C) Shield

D) Security Group

**Answer: B**

**Explanation:** A WAF Geo Match Rule identifies the country of origin of a request and blocks or allows specific countries. A (NACL) and D (SG) are IP-based, so mapping and managing at the country level is impractical. C (Shield) is DDoS protection, not a region-based filter. Trap: "blocking specific countries" is WAF Geo Match.

---

**Question 7.** You want to automatically block L7 floods and brute force attacks in which a single IP sends an abnormally large number of requests within 5 minutes. Which is the most appropriate?

A) Shield Standard

B) WAF Rate-Based Rule

C) NACL

D) Network Firewall

**Answer: B**

**Explanation:** A WAF Rate-Based Rule automatically blocks a single IP when its request count over a 5-minute window exceeds the threshold, mitigating L7 floods, brute force, and credential stuffing. A (Shield Standard) automatically mitigates L3/L4 DDoS and does not limit request frequency per IP. C (NACL) has no frequency-based limiting capability. D (Network Firewall) is IDS/IPS inside the VPC, and per-IP rate limiting of edge web requests is not its primary purpose. Trap: "limiting request frequency of a single IP (L7)" is WAF Rate-Based Rule.

---

## 📌 Today's Summary

Edge security uses OSI layers as a map — differentiate attacks by layer first. **Shield** (all AWS customers get Standard free, mitigates L3/L4 DDoS auto) vs **Shield Advanced** (adds L7 + Cost Protection + SRT 24/7, $3K/month) vs **WAF** (L7 HTTP rules, not auto DDoS mitigation) are different layers and tools. WAF's Managed Rules provide OWASP Top 10 coverage without custom rule burden. **Firewall Manager** deploys policies Org-wide automatically and detects drift. **Network Firewall** does inline IDS/IPS for VPC internal traffic with TLS Inspection. **DNS Firewall** blocks malicious domains at query time, more robust than IP-based blocking. Combine these layers defensively — no single service stops all attacks.
