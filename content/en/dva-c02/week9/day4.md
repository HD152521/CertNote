# Day 4 - WAF, Shield, ACM: Three Layers to Filter Traffic Before It Touches the App

Security has two schools of thought. One: "defend well inside" — validate input, parameterize queries, escape output at the application layer. The other: "filter early outside" — stop malicious traffic at the network edge before it reaches the application. Both matter. App defense alone and a DDoS kills the server instantly. Edge defense alone and sophisticated logic attacks get through. AWS's WAF, Shield, and ACM are three layers handling **different threats at the network edge** — WAF guards against L7 application attacks, Shield against L3/L4 DDoS, ACM against transport encryption.

In DVA-C02, these three appear as "which service for which threat?" questions. SQL injection → WAF. DDoS cost surge → Shield Advanced. CloudFront HTTPS → us-east-1 ACM. Understanding which OSI layer each addresses is the key.

## Defense by OSI Layer

Understanding these three fastest is placing them on the OSI model.

| Service | Layer | Threats Blocked |
|---------|------|---------|
| **Shield** | L3(Network) / L4(Transport) | SYN flood, UDP reflection volume DDoS |
| **WAF** | L7(Application) | SQL injection, XSS, bots, abnormal patterns |
| **ACM** | L6/L7(Presentation/Session), TLS | Eavesdropping, tampering (prevented by encryption) |

> 💡 **Related theory**: Why Shield and WAF are separate makes sense when you understand DDoS by layer. L3/L4 attacks (SYN flood) exploit **protocol weaknesses** — flood half-open connections exhausting the connection table. Request content is irrelevant; volume wins. L7 attacks (HTTP flood, slow POST) send **valid-looking HTTP** to exhaust app processing. Content matters to detect malicious vs. legitimate. Volume-based attacks need network-edge absorption (Shield), while content attacks need HTTP parsing (WAF). Threat nature differs, so tools differ.

## WAF: Parse Requests and Filter by Rule at L7

WAF (Web Application Firewall) parses HTTP/HTTPS requests and applies Actions if they match Rules. Rules live in Web ACL (Access Control List), evaluated top-to-bottom by priority.

| Rule Type | What It Sees |
|-----------|------|
| **IP Set** | Source IP(CIDR) allow/block |
| **Geo Match** | Source country |
| **String/Regex Match** | URL, headers, body patterns |
| **SQLi Match** | SQL injection patterns auto-detected |
| **XSS Match** | Cross-site scripting patterns |
| **Size Constraint** | Request component sizes |
| **Rate-based** | IP requests in 5-minute window |
| **Managed Rules** | OWASP Top 10, IP Reputation, etc. |

Actions are five.

| Action | Behavior |
|--------|------|
| **Allow** | Pass through |
| **Block** | Deny (custom 4xx possible) |
| **Count** | No block, just count (test mode) |
| **CAPTCHA** | Human verification puzzle |
| **Challenge** | Background JS challenge (auto-filter bots) |

> 🔍 **Going deeper**: **Count mode** is operationally critical. Rolling a new rule into Block immediately risks false positives hitting real users — outages. Deploy in Count mode first — no blocking, only "requests that would match" logged to CloudWatch metrics and samples. Observe for days, verify no false positives, then promote to Block. This "observe → verify → enforce" deployment pattern mirrors IDS "monitor mode → prevent mode." Count answers "test a rule without affecting traffic?"

> 💡 **Related theory**: **Rate-based Rule** uses a sliding 5-minute window counter per-IP, not token bucket. Count requests in the last 5 minutes per source IP; exceed threshold → block. Different from app-level rate limiting (e.g., API Gateway throttling) because it auto-tracks **by source IP**. Brute-force login or scraping by one IP gets caught. Caveat: multiple users behind NAT share one IP and share the limit — corporate networks may false-positive.

WAF attachment points have constraints.

| Resource | WAF Support |
|----------|---------|
| CloudFront | Supported (Global scope, us-east-1) |
| ALB | Supported (Regional) |
| API Gateway **REST** | Supported (Regional) |
| API Gateway **HTTP** | **Not supported** |
| AppSync | Supported |
| Cognito User Pool | Supported (2022+) |
| NLB | **Not supported**(L4, no HTTP parsing) |

> ⚠️ **Trap**: API Gateway **HTTP API** does not directly support WAF. If WAF is needed, put CloudFront in front and attach WAF there. NLB is L4, so HTTP is not parsed — WAF targets only L7-aware resources. "WAF on HTTP API" or "WAF on NLB" are trap answers.

## Shield: Free Auto-Defense and Paid Premium Defense

Shield comes in two tiers. **Standard** is free, auto-applied to all AWS customers — L3/L4 DDoS defense. EC2, ELB, CloudFront, Route 53 automatically protected against SYN/UDP floods without setup. **Advanced** is $3,000/month but adds decisive added value beyond "stronger defense."

| Item | Standard | Advanced |
|------|----------|----------|
| Cost | Free | $3,000/month |
| Layers | L3/L4 | L3/L4/L7 |
| Protected Resources | Auto (all resources) | Explicit enrollment (CloudFront, ALB, NLB, EIP, R53, Global Accelerator) |
| **DDoS Cost Protection** | None | **Has**(DDoS-caused cost credits) |
| **SRT Support** | None | **24/7 Shield Response Team** |
| WAF Cost | Separate | Included |
| Real-Time Visibility | None | Has |

> ⚠️ **Trap**: The clearest signal for Shield Advanced is **"DDoS cost protection."** DDoS attacks trigger Auto Scaling (instance explosion) or CloudFront data transfer surge — bills skyrocket. Advanced refunds DDoS-caused cost spikes as credits. Simple "basic DDoS defense" is Standard (free). If "DDoS cost surge protection" or "24/7 expert response" appears, it's Advanced. Standard suffices for baseline.

> 💡 **Related theory**: Shield Response Team (formerly DRT, DDoS Response Team) is Advanced's human element. Massive, sophisticated attacks may require real AWS security experts adjusting WAF rules in real-time and analyzing patterns. This isn't just automation — it's a service contract: "you have someone to call during attack." Bundling expert labor into a security service tier is standard enterprise practice — the $3,000 partly buys tools, partly buys on-call expertise.

Manage WAF/Shield Advanced across accounts via **Firewall Manager** (requires AWS Organizations). Auto-apply policies to new resources organization-wide.

## ACM: Free TLS Certificates, AWS Services Only

ACM (AWS Certificate Manager) issues and auto-renews SSL/TLS certs at no cost. One critical constraint appears constantly on exams.

> ⚠️ **Trap**: **ACM certificates cannot be installed on EC2 directly.** ACM refuses to export the private key — the key never crosses ACM's boundary (mirroring KMS's key-isolation philosophy). EC2 direct TLS termination requires the key file on the instance, so ACM won't provide it. Either put ALB/CloudFront in front (ACM cert there, TLS terminates at ALB/CloudFront, unencrypted back to EC2), or install a separate cert on EC2 (Let's Encrypt, etc.). "Install ACM cert on EC2" is always wrong.

ACM applies to: CloudFront, ALB, NLB, API Gateway, App Runner, App Mesh, Cognito, Elastic Beanstalk. Common thread: **AWS-managed endpoints** where ACM manages TLS internally without exporting keys.

> ⚠️ **Trap**: ACM certs for CloudFront **must be issued in us-east-1 (N. Virginia)**. CloudFront is global; its control plane lives in us-east-1. Certs from ap-northeast-2 won't attach to CloudFront. Regional resources (ALB, etc.) use certs from their region. "CloudFront cert region" → always us-east-1.

Validation methods split two ways.

| Method | Speed | Auto-Renewal |
|--------|-------|-----------|
| **DNS validation**(recommended) | Fast | Automatic(CNAME persists) |
| **Email validation** | Slow | Manual (person clicks per expiry) |

> 🔍 **Going deeper**: DNS validation is preferred because it **auto-renews**. ACM puts a CNAME in DNS once; at expiry approaching, ACM re-validates via that CNAME and auto-renews. Zero human involvement. Email validation mails the domain admin; they click to confirm per expiry — common failure point: people forget, cert expires, site dies. Route 53 auto-inserts the CNAME for you. For internal services, mTLS, or IoT, private ACM Private CA ($400/month) runs your own CA.

## Edge Defense Stacked Together

The three usually layer like this.

```
[Internet]
   │  ← Shield (Standard auto / Advanced enrolled) absorbs L3/L4 DDoS
   ▼
[CloudFront]  ── ACM cert (us-east-1) terminates HTTPS
   │  ← WAF (Global scope) blocks SQLi/XSS/Rate/Geo
   ▼
[ALB]  ── ACM cert (same region) terminates HTTPS
   │  ← Optional additional WAF (Regional)
   ▼
[EC2 / Lambda / ECS]  ← ACM cannot install here directly
```

> 📚 **Case study**: A service faced bot traffic from one country. Instead of immediate WAF Block, they ① first ran Geo rule in **Count mode** for days to measure real traffic, ② crafted Rate-based + Challenge (JS challenge) to auto-filter bots while legitimate users pass, ③ only then applied IP Set Block to clearly-malicious IPs. Staged deployment avoiding false positives. "Block first" is dangerous; "Count to verify" is standard.

## Tangent Security Services Summary

Occasional exam appearances of detection/investigation services warrant role clarity.

| Service | Function |
|---------|----------|
| **Macie** | ML auto-detects PII (credit cards, SSNs) in S3 |
| **GuardDuty** | Detects account-activity anomalies (CloudTrail/VPC Flow/DNS logs) |
| **Inspector** | Scans EC2/ECR images for vulnerabilities/CVEs |
| **Detective** | Investigates security incident root causes |
| **Security Hub** | Unified dashboard for all security alerts |

> ⚠️ **Trap**: "Auto-find credit cards/SSNs in S3" = **Macie**. "Spot weird API calls/coin mining" = **GuardDuty**. "Scan packages for CVEs" = **Inspector**. Names sound similar; targets differ — data (Macie) vs. behavior (GuardDuty) vs. vulnerability state (Inspector).

## Wrapping Up

WAF, Shield, ACM are three edge layers — Shield blocks L3/L4 DDoS (Standard free, Advanced pays for cost protection + SRT), WAF blocks L7 app attacks (Count first to verify, then Block), ACM terminates TLS (EC2 direct install impossible, CloudFront requires us-east-1). Threat OSI layer determines the tool. "Which service for which attack?" compresses to one question once you recognize the layer.

Next: Week 9 recap — KMS, Secrets Manager, Cognito, WAF/Shield/ACM stitched together as a security architecture.

---

## 📝 연습 문제

**문제 1.** Block SQL injection attacks at the request stage. Right service?

A) Shield Advanced
B) AWS WAF
C) Network ACL
D) Security Group

**정답: B**

해설: SQL injection is L7 (app layer), requiring HTTP payload parsing. WAF's SQLi Match rules detect it. A) Shield is L3/L4 DDoS, doesn't inspect payload. C·D) NACL/SG are L3/L4 (IP/port only), can't see L7 content. "Content-based web attack" → WAF.

---

**문제 2.** DDoS hits; Auto Scaling and data transfer soar; bill explodes. Protect cost. Right choice?

A) Shield Standard
B) Shield Advanced
C) WAF rate-based rule
D) Strengthen CloudFront caching

**정답: B**

해설: Shield Advanced alone refunds DDoS-caused cost spikes as credits. Standard is free but no cost protection or SRT. C) WAF rate limit helps mitigate but doesn't refund costs. D) Caching reduces origin load, not billing protection. "DDoS cost protection" → Advanced.

---

**문제 3.** CloudFront HTTPS needs ACM cert. Which region?

A) Origin's region
B) ap-northeast-2
C) us-east-1
D) Any region works

**정답: C**

해설: CloudFront global control plane in **us-east-1**. Certs from other regions won't attach. Regional resources use their own region. "CloudFront cert region" = us-east-1.

---

**문제 4.** Install ACM cert directly on EC2 for TLS termination. Result?

A) Works fine
B) ACM refuses export; EC2 direct install impossible
C) Works if us-east-1 issued
D) Private CA required

**정답: B**

해설: ACM doesn't export private keys (key isolation). EC2 TLS needs the key file. Use ALB/CloudFront + ACM in front, or EC2 gets separate cert (Let's Encrypt). "ACM on EC2" always wrong.

---

**문제 5.** Test new WAF rule safely — observe without blocking. Which action?

A) Block
B) Allow
C) Count
D) CAPTCHA

**정답: C**

해설: Count logs matching requests without blocking. Deploy first, observe for false positives, then promote to Block. "Safe rule testing" = Count.

---

**문제 6.** API Gateway **HTTP API** needs WAF for SQL injection. Direct attach fails. Solution?

A) Change to REST API only
B) Put CloudFront in front; attach WAF to CloudFront
C) Use NLB in front
D) Security Group SQL rules

**정답: B**

해설: HTTP API doesn't support WAF directly. Workaround: CloudFront + WAF on CloudFront. A) Rebuild as REST (possible but not only option). C) NLB is L4, no HTTP parsing. D) SG is L4.

---

**문제 7.** Detect customer credit cards/SSNs auto-stored in S3. Right service?

A) GuardDuty
B) Inspector
C) Macie
D) Detective

**정답: C**

해설: **Macie** ML-detects PII in S3 data. A) GuardDuty finds anomalous API calls/behavior. B) Inspector scans code/packages for CVEs. D) Detective investigates incident cause. "S3 data PII" = Macie.
