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

## 📝 연습 문제

**문제 1.** Shield Standard와 Shield Advanced의 차이로 옳은 것은?

A) Standard는 L7 공격을, Advanced는 L3/L4 공격만 막는다  
B) Standard는 모든 고객에게 자동·무료로 L3/L4를 흡수하고, Advanced는 유료로 향상된 탐지·DRT 지원·비용 보호·WAF 통합을 추가한다  
C) Standard는 CloudFront에만, Advanced는 EC2에만 적용된다  
D) 둘 다 동일하며 이름만 다르다  

**정답: B**  
해설: Shield Standard는 모든 AWS 고객에게 자동·무료로 적용되어 흔한 L3/L4 공격을 엣지에서 흡수한다. Shield Advanced는 유료 구독으로 더 큰 공격 대응, 애플리케이션 계층 통합, SRT(DRT) 지원, DDoS 비용 보호, 공격 가시성 메트릭을 더한다. 계층 분담이 반대로 서술된 보기나, 적용 리소스를 한정한 보기는 틀렸다.

---

**문제 2.** 애플리케이션이 HTTP GET flood(L7)를 받고 있다. 가장 직접적인 완화 수단은?

A) Shield Standard에 의존  
B) NACL로 포트 차단  
C) WAF rate-based rule로 IP/키별 요청 한도를 초과하는 소스를 차단  
D) EC2 인스턴스 타입을 키운다  

**정답: C**  
해설: L7 HTTP flood는 트래픽 양이 작아도 애플리케이션 자원을 고갈시키므로 정밀 필터링이 필요하고, WAF rate-based rule이 IP/커스텀 키별 요청률을 측정해 한도 초과 소스를 동적으로 차단한다. Shield Standard는 L3/L4가 주력이라 L7을 정밀 차단하지 못하고, NACL은 7계층 요청률을 모르며, 인스턴스 확장은 비용만 키우고 근본 완화가 아니다.

---

**문제 3.** DDoS 공격 중 Auto Scaling과 데이터 전송 급증으로 발생한 요금을 보전받고 싶다. 어떤 기능인가?

A) Shield Advanced의 Cost Protection(DDoS 비용 보호)  
B) AWS Budgets 알림  
C) Savings Plans  
D) Reserved Instances  

**정답: A**  
해설: Shield Advanced는 보호 등록된 리소스가 검증된 DDoS 공격으로 인해 스케일 아웃·데이터 전송이 급증해 발생한 요금에 대해 서비스 크레딧(Cost Protection)을 제공한다. Budgets는 알림일 뿐 환급이 아니고, Savings Plans·Reserved Instances는 일반 사용 요금 할인 약정으로 공격 비용 보전과 무관하다.

---

**문제 4.** CloudFront로 콘텐츠를 서빙 중인데 공격자가 오리진 ALB의 실제 IP로 직접 공격해 엣지 방어를 우회한다. 가장 적절한 대응 조합은?

A) Default Action을 Block으로 변경  
B) 오리진 Security Group을 CloudFront managed prefix list로 제한하고, CloudFront가 주입한 비밀 커스텀 헤더를 오리진/WAF가 검증해 직접 요청을 차단  
C) CloudFront를 제거하고 ALB만 사용  
D) Route 53 TTL을 0으로 설정  

**정답: B**  
해설: 엣지 우회의 근본 원인은 오리진이 직접 접근 가능하다는 것이다. 오리진 Security Group을 `com.amazonaws.global.cloudfront.origin-facing` prefix list로 제한해 CloudFront IP만 허용하고, CloudFront가 추가하는 비밀 헤더(예: X-Origin-Verify)를 오리진/WAF에서 검증하면 엣지를 우회한 직접 요청을 거른다. CloudFront 제거(C)는 흡수 방어를 버리는 것이고, Default Block·TTL 변경은 오리진 노출 문제를 해결하지 못한다.

---

**문제 5.** Shield Advanced에서 정상 트래픽 급증(예: 마케팅 캠페인)을 공격으로 오인해 과잉 완화하는 false positive를 줄이려 한다. 가장 효과적인 설정은?

A) 모든 알람 임계값을 최대로 올린다  
B) 보호 리소스에 Route 53 health check를 연동해 서비스 건강도 기반 탐지를 활성화한다  
C) WAF를 비활성화한다  
D) CloudFront를 끈다  

**정답: B**  
해설: Shield Advanced의 health-based detection은 Route 53 health check로 애플리케이션 건강도를 함께 판단한다. 트래픽이 늘어도 서비스가 건강하면 공격으로 단정하지 않아 정상 트래픽 급증에 대한 과잉 완화를 억제한다. 임계값을 무작정 올리면 진짜 공격을 놓치고, WAF·CloudFront 비활성화는 방어를 약화시키는 잘못된 방향이다.

---
