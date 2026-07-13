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

## 📝 연습 문제

**문제 1.** 웹 애플리케이션을 OWASP Top 10(SQL 인젝션·XSS 등)으로부터 즉시 보호하되, 룰을 직접 작성·유지보수하는 운영 부담을 최소화하고 싶다. 가장 적합한 것은?

A) 모든 WAF 룰을 Custom으로 직접 작성

B) AWS Managed Rule Groups (Core Rule Set·Known Bad Inputs·SQLi)

C) Shield Standard

D) NACL로 포트 차단

**정답: B**

**해설:** AWS Managed Rule Groups는 OWASP Top 10 기반 Core Rule Set 등을 즉시 제공하고 AWS가 신종 공격에 맞춰 룰을 갱신해 운영 부담이 최소다. A(Custom 전부)는 작성·유지보수 부담이 크고 신종 공격 대응이 느리다. C(Shield Standard)는 L3/L4 DDoS 방어이지 L7 웹 취약점 필터가 아니다. D(NACL)는 L3/L4 IP·포트 제어이지 HTTP 페이로드 검사가 불가하다. 함정: "OWASP 즉시 보호 + 운영 최소"는 Custom이 아니라 Managed Rule Groups.

---

**문제 2.** L7 HTTP flood DDoS를 받았고, 그로 인한 자동 스케일 아웃 요금 폭증을 면제받고 싶으며, 공격 중 24/7 전문가 지원이 필요하다. 가장 적합한 것은?

A) Shield Standard

B) Shield Advanced

C) WAF Rate-Based Rule만

D) CloudFront만

**정답: B**

**해설:** Shield Advanced는 L7 DDoS 보호 + Cost Protection(DDoS 유발 추가 요금 면제) + SRT 24/7 지원을 모두 제공한다. A(Standard)는 무료지만 L3/L4만 자동 완화하고 L7 보호·Cost Protection·SRT가 없다. C(Rate-Based만)는 L7 완화에 도움되지만 비용 보호·전문가 지원이 없다. D(CloudFront)는 캐싱·배포이지 DDoS 비용 보호·SRT가 아니다. 함정: "L7 DDoS + Cost Protection + 24/7 SRT" 세 키워드는 Shield Advanced 전용.

---

**문제 3.** 500개 계정 Organization의 모든 인터넷 향 ALB에 동일한 WAF Managed Rule을 적용하고, 신규로 추가되는 계정·리소스에도 자동 적용하며, 누군가 WAF를 끄면 자동 탐지·시정하고 싶다. 가장 적합한 것은?

A) AWS Config Rule

B) Firewall Manager

C) SCP

D) Control Tower

**정답: B**

**해설:** Firewall Manager는 Organization 단위로 WAF·Shield·SG·Network Firewall 정책을 일괄 배포하고, 신규 계정·리소스에 자동 적용하며 드리프트(WAF 비활성화 등)를 자동 탐지·시정한다. A(Config)는 비준수 평가가 본업이지 WAF 정책 능동 배포가 아니다. C(SCP)는 행위 금지(거부 가드레일)이지 보안 룰 배포가 아니다. D(Control Tower)는 랜딩 존 거버넌스이지 WAF 정책 배포 엔진이 아니다. 함정: "보안 정책 멀티 계정 배포 + 신규 자동 + 드리프트 시정"은 Firewall Manager.

---

**문제 4.** VPC 내부를 흐르는 모든 트래픽에 IDS/IPS를 적용하고, 암호화된 트래픽도 복호화해 검사(TLS Inspection)해야 한다. 가장 적합한 것은?

A) WAF

B) Network Firewall

C) Shield Advanced

D) Security Group

**정답: B**

**해설:** Network Firewall은 Suricata 룰 기반 L3-7 IDS/IPS로, VPC 내부 트래픽을 inline으로 검사하고 TLS Inspection까지 지원한다. A(WAF)는 엣지(CF/ALB/APIGW)의 L7 웹 요청만 검사하고 VPC 전반 트래픽·TLS Inspection은 못 한다. C(Shield)는 DDoS 방어이지 IDS/IPS가 아니다. D(SG)는 스테이트풀 IP/포트 필터이지 페이로드 검사·IPS가 아니다. 함정: "VPC 내부 IDS/IPS + TLS Inspection"은 Network Firewall.

---

**문제 5.** VPC 내 EC2가 멀웨어 C2 서버나 알려진 악성 도메인에 접근하지 못하게 이름 해석 단계에서 차단하고 싶다. 가장 적합한 것은?

A) Security Group으로 악성 IP 차단

B) WAF

C) Route 53 Resolver DNS Firewall

D) NACL로 IP 차단

**정답: C**

**해설:** DNS Firewall은 VPC에서 나가는 DNS 쿼리를 관리형/커스텀 악성 도메인 리스트로 차단해, 이름 해석 단계에서 C2·악성 도메인 접근을 막는다. A·D(SG/NACL)는 IP 기반인데 악성 도메인 IP는 수시로 바뀌어 도메인 차단에 부적합하다. B(WAF)는 인바운드 L7 웹 요청 필터이지 아웃바운드 DNS 쿼리 차단이 아니다. 함정: "악성 도메인 차단(이름 기반)"은 DNS Firewall, IP 기반(SG/NACL)은 부적합.

---

**문제 6.** 특정 국가에서 오는 웹 요청만 차단하고 싶다(규제·라이선스 사유). 가장 적합한 것은?

A) NACL

B) WAF Geo Match Rule

C) Shield

D) Security Group

**정답: B**

**해설:** WAF Geo Match Rule은 요청의 출발지 국가를 식별해 특정 국가를 차단/허용한다. A(NACL)·D(SG)는 IP 기반이라 국가 단위 매핑·관리가 비현실적이다. C(Shield)는 DDoS 방어이지 지역 기반 필터가 아니다. 함정: "특정 국가 차단"은 WAF Geo Match.

---

**문제 7.** 단일 IP가 5분 동안 비정상적으로 많은 요청을 보내는 L7 flood·brute force를 자동으로 차단하고 싶다. 가장 적합한 것은?

A) Shield Standard

B) WAF Rate-Based Rule

C) NACL

D) Network Firewall

**정답: B**

**해설:** WAF Rate-Based Rule은 5분 윈도우 동안 단일 IP의 요청 수가 임계값을 넘으면 자동 차단해 L7 flood·brute force·credential stuffing을 완화한다. A(Shield Standard)는 L3/L4 DDoS 자동 완화이지 IP별 요청 빈도 제한이 아니다. C(NACL)는 빈도 기반 제한 기능이 없다. D(Network Firewall)는 VPC 내부 IDS/IPS이지 엣지 웹 요청의 IP별 rate limiting이 본업이 아니다. 함정: "단일 IP 요청 빈도 제한(L7)"은 WAF Rate-Based Rule.

---

## 📌 Today's Summary

Edge security uses OSI layers as a map — differentiate attacks by layer first. **Shield** (all AWS customers get Standard free, mitigates L3/L4 DDoS auto) vs **Shield Advanced** (adds L7 + Cost Protection + SRT 24/7, $3K/month) vs **WAF** (L7 HTTP rules, not auto DDoS mitigation) are different layers and tools. WAF's Managed Rules provide OWASP Top 10 coverage without custom rule burden. **Firewall Manager** deploys policies Org-wide automatically and detects drift. **Network Firewall** does inline IDS/IPS for VPC internal traffic with TLS Inspection. **DNS Firewall** blocks malicious domains at query time, more robust than IP-based blocking. Combine these layers defensively — no single service stops all attacks.
