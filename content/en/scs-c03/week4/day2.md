# Day 2 - AWS Shield (Standard/Advanced) and DDoS Protection: Layered Defense, CloudFront/Route 53 Integration

DDoS (Distributed Denial of Service) is often summarized as "an attack that sends large amounts of traffic to paralyze a service," but the critical security insight is that *the defense mechanism differs completely depending on which layer the attack targets*. SYN flood (L3/L4 resource exhaustion) and HTTP flood (L7 application exhaustion) are both "floods," but they cannot be blocked by the same tools. AWS Shield is designed around this layering principle.

Shield divides into two tiers. **Shield Standard** is automatically and freely applied to all AWS customers, absorbing common L3/L4 attacks. **Shield Advanced** is a paid subscription offering enhanced detection, mitigation, cost protection, DRT (DDoS Response Team) support, and L7 integration for larger attacks.

## DDoS Attack Classification by Layer

| Attack Type | Layer | Example | Primary Defense |
|-----------|-------|---------|------------------|
| Volumetric | L3 | UDP reflection, NTP/DNS amplification | Bandwidth absorption (edge distribution) |
| State-exhaustion | L4 | SYN flood, ACK flood | SYN cookie, connection state mitigation |
| Application | L7 | HTTP flood, Slowloris, GET/POST flood | WAF, rate-based rule, CAPTCHA |

> 💡 **Related Theory**: DDoS defense strategy splits into two paths. *Absorption* — AWS's global edge network's massive bandwidth absorbs volumetric attacks through distribution. *Filtering* — identifies and blocks malicious patterns. L3/L4 volumetric attacks rely primarily on absorption (individual servers cannot block attacks at this scale), while L7 attacks exhaust application resources even with small traffic volumes, so filtering (WAF) is the primary defense. This is a division of labor: "bigger pipe vs. smarter filter."

## Shield Standard: Automatic, Free Baseline

Shield Standard applies to all AWS resources without activation. It is most powerful when behind edge services like CloudFront, Route 53, and Global Accelerator — because these sit directly on the AWS backbone and edge network, absorbing L3/L4 attacks at the edge.

What Shield Standard blocks:
- Common L3/L4 attacks like SYN/UDP floods, reflection attacks
- Inline mitigation based on known malicious signatures

What Shield Standard *does not* do: precise filtering of L7 application attacks (that's WAF's responsibility), attack visibility dashboard, cost protection, DRT support.

## Shield Advanced: What Gets Added

Shield Advanced is activated via subscription (account/Organization level), then explicitly registers resources to protect. Protectable resources: CloudFront, Route 53 hosted zone, Global Accelerator accelerator, ALB/CLB, EIP (Elastic IP, i.e., for EC2/NLB, etc.).

Key added value:
1. **Enhanced Detection and Mitigation**: Sophisticated attack detection including application layer (L7), response to larger attacks.
2. **DDoS Response Team (DRT)/Shield Response Team (SRT)**: Expert support during active attacks. If you pre-authorize the IAM role (`AWSSRTAccess`), SRT can adjust WAF rules on your behalf.
3. **Cost Protection (DDoS Cost Protection)**: Service credits for charges incurred due to scale-out and data transfer spikes caused by verified DDoS attacks on protected resources.
4. **WAF Integration and Included Charges**: WAF usage charges for protected resources are included in Shield Advanced, and automatic application-layer DDoS mitigation can auto-generate and apply WAF rules.
5. **Global Threat Dashboard / Real-time Metrics and Events**: `DDoSDetected`, `DDoSAttackBitsPerSecond`, etc.
6. **Proactive Engagement / Health-Based Detection**: Connecting Route 53 health checks reduces false positives and allows SRT to proactively reach out when thresholds are triggered.

```bash
# Subscribe to Shield Advanced (account level, beforehand)
aws shield subscribe-to-proactive-engagement \
  --proactive-engagement-status ENABLED \
  --emergency-contact-list '[{"emailAddress":"soc@example.com","phoneNumber":"+10000000000"}]'

# Register a resource for protection
aws shield create-protection \
  --name "prod-cloudfront" \
  --resource-arn arn:aws:cloudfront::111122223333:distribution/E123ABC
```

> 🎯 **Scenario**: A frequent exam question: "I want to receive refunds for Auto Scaling costs and data transfer surges that occurred during an attack." The answer is Shield Advanced's **Cost Protection** — protected resources that scale due to DDoS can claim credits for the resulting charges. Shield Standard provides no such protection.

## L7 Defense Ultimately Falls to WAF

While Shield Advanced "handles" L7, it does not replace WAF. Precise application-layer blocking is still performed by WAF rules (rate-based, managed group, CAPTCHA), and Shield Advanced *orchestrates, automates, and supports* this.

- HTTP flood → WAF rate-based rule blocks sources exceeding request limit per IP/key
- Suspicious bots → CAPTCHA/Challenge or Bot Control
- With automatic application-layer mitigation enabled, Shield analyzes attack patterns and auto-applies temporary WAF rules (`Count` first → `Block`)

> ⚠️ **Trap**: "Shield Standard blocks L7 attacks" often appears as a wrong answer choice. Shield Standard's strength is L3/L4, and precise mitigation of L7 application attacks is handled by WAF (or Shield Advanced's WAF integration). On the exam, if "HTTP flood / GET flood mitigation" appears, think WAF rate-based rule first.

## CloudFront, Route 53, Global Accelerator Integration: Pushing Defense to the Edge

The architectural principle of DDoS defense is *to absorb attacks at the edge, as far as possible from the origin*.

- **CloudFront**: Serving static and dynamic content from the edge means L3/L4 attacks are distributed and absorbed across the edge network. The origin stays hidden behind CloudFront, and blocking direct origin access (OAC + Security Group/prefix list) shrinks the attack surface.
- **Route 53**: A managed DNS service distributed globally via anycast is resilient against DNS-layer attacks. It is protected by Shield and absorbs DNS floods.
- **Global Accelerator**: AWS global network anycast IP provides a fixed and distributed entry point. Traffic is absorbed behind two static IPs and routed to the nearest edge.

```
Internet Attack ──> [Route 53 anycast DNS]
                            │
                   [CloudFront edge (WAF evaluation + absorption)]
                            │  (OAC, origin protection)
                       [ALB / Origin]  ← Direct access blocked
```

> 💡 **Related Theory**: The edge absorption strategy leverages *anycast* properties. When multiple edges globally advertise the same IP, BGP routes traffic from the source to the nearest edge. Attack traffic is naturally distributed across multiple edges and does not concentrate at a single point. The thinking is not "block the attack" but "scatter and dilute the attack." This is why hiding the origin behind an edge is the starting point of defense.

## Origin Exposure: A Critical Weakness

Even when serving content via CloudFront, if an attacker discovers the actual IP or domain of the origin, they can bypass the edge and attack directly. Defense measures:

- Restrict the origin (ALB/EC2) Security Group to **CloudFront managed prefix list** (`com.amazonaws.global.cloudfront.origin-facing`), allowing only CloudFront IPs.
- CloudFront injects a custom header (`X-Origin-Verify`), and the origin/ALB and WAF validate it, blocking direct requests without the header.
- Keep the origin domain name unpredictable and unexposed in DNS.

## Visibility and Response Metrics

Shield Advanced provides attack metrics to CloudWatch: `DDoSDetected` (0/1), `DDoSAttackBitsPerSecond`, `DDoSAttackPacketsPerSecond`, `DDoSAttackRequestsPerSecond`. Tie these to alarms and connect to SNS and SRT proactive engagement. Shield also logs attack events (start, end, mitigation details) for post-incident analysis.

> 🔍 **Deeper Insight**: Shield Advanced's *Route 53 health check-based detection* is a clever mechanism to reduce false positives. Simply flagging traffic spikes as attacks would over-mitigate normal campaign traffic. But if the application's health checks pass, the system concludes "traffic increased but the service is healthy," suppressing over-mitigation. In other words, it judges *service health degradation*, not traffic volume alone, as the attack signal.

---

## 📝 Practice Questions

**Question 1.** Which statement about the difference between Shield Standard and Shield Advanced is correct?

A) Standard blocks L7 attacks, and Advanced blocks only L3/L4 attacks  
B) Standard automatically absorbs L3/L4 for all customers at no cost, and Advanced is paid and adds enhanced detection, DRT support, cost protection, and WAF integration  
C) Standard applies only to CloudFront, and Advanced applies only to EC2  
D) They are identical and differ only in name  

**Answer: B**  
Explanation: Shield Standard applies automatically and at no cost to all AWS customers and absorbs common L3/L4 attacks at the edge. Shield Advanced is a paid subscription that adds response to larger attacks, application layer integration, SRT (DRT) support, DDoS cost protection, and attack visibility metrics. Choices that describe the layer split in reverse, or that limit the applicable resources, are wrong.

---

**Question 2.** An application is receiving an HTTP GET flood (L7). What is the most direct mitigation?

A) Rely on Shield Standard  
B) Block ports with a NACL  
C) Block sources exceeding the per-IP/per-key request limit with a WAF rate-based rule  
D) Increase the EC2 instance type  

**Answer: C**  
Explanation: An L7 HTTP flood exhausts application resources even with a small traffic volume, so precise filtering is needed, and a WAF rate-based rule measures the request rate per IP/custom key and dynamically blocks sources that exceed the limit. Shield Standard focuses on L3/L4 and cannot precisely block L7, a NACL does not know layer 7 request rates, and scaling instances only increases cost and is not a fundamental mitigation.

---

**Question 3.** We want to be reimbursed for charges caused by Auto Scaling and data transfer spikes during a DDoS attack. Which feature is this?

A) Cost Protection of Shield Advanced (DDoS cost protection)  
B) AWS Budgets alerts  
C) Savings Plans  
D) Reserved Instances  

**Answer: A**  
Explanation: Shield Advanced provides service credits (Cost Protection) for charges incurred when protected, registered resources scale out and data transfer spikes due to a verified DDoS attack. Budgets is only an alert and not a refund, and Savings Plans and Reserved Instances are commitments that discount regular usage charges and have nothing to do with reimbursing attack costs.

---

**Question 4.** Content is being served through CloudFront, but an attacker bypasses edge defenses by attacking the origin ALB's real IP directly. What is the most appropriate combination of responses?

A) Change the Default Action to Block  
B) Restrict the origin Security Group to the CloudFront managed prefix list, and have the origin/WAF verify a secret custom header injected by CloudFront to block direct requests  
C) Remove CloudFront and use only the ALB  
D) Set the Route 53 TTL to 0  

**Answer: B**  
Explanation: The root cause of the edge bypass is that the origin is directly accessible. If you restrict the origin Security Group to the `com.amazonaws.global.cloudfront.origin-facing` prefix list to allow only CloudFront IPs, and verify the secret header that CloudFront adds (for example, X-Origin-Verify) at the origin/WAF, direct requests that bypass the edge are filtered out. Removing CloudFront (C) throws away the absorption defense, and Default Block or TTL changes do not solve the origin exposure problem.

---

**Question 5.** In Shield Advanced, we want to reduce false positives where a legitimate traffic surge (for example, a marketing campaign) is mistaken for an attack and over-mitigated. What is the most effective setting?

A) Raise all alarm thresholds to the maximum  
B) Integrate Route 53 health checks with the protected resources to enable health-based detection  
C) Disable WAF  
D) Turn off CloudFront  

**Answer: B**  
Explanation: Shield Advanced health-based detection also judges application health with Route 53 health checks. Even if traffic grows, if the service is healthy it is not concluded to be an attack, which suppresses over-mitigation of legitimate traffic surges. Blindly raising thresholds misses real attacks, and disabling WAF or CloudFront is the wrong direction that weakens defense.

---
