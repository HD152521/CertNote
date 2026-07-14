# Day 3 - AWS Network Firewall and DNS Firewall: Stateful Inspection, Domain Filtering, Centralized Inspection VPC

Security Groups and NACLs are basic controls for VPC traffic but have clear limitations. Security Groups are stateful but perform only simple allow/deny, and NACLs are stateless; both operate at IP, port, and protocol level. Requirements like "allow outbound only to specific domains," "detect intrusions by signature in packet payload (IPS)," and "block domains based on TLS SNI" cannot be met by these tools. **AWS Network Firewall** (a managed stateful/stateless inspection engine) and **Route 53 Resolver DNS Firewall** (DNS query filtering) fill this gap.

## Network Firewall Architecture: Firewall, Policy, Rule Group

AWS Network Firewall places **firewall endpoints** (ENIs per availability zone) inside a VPC, and uses routing to force traffic through these endpoints for inspection. The architecture has three layers.

1. **Firewall**: A resource placed in a VPC and subnets (dedicated firewall subnet). Creates endpoints per AZ.
2. **Firewall Policy**: A policy bundling stateless/stateful rule groups and default actions.
3. **Rule Group**:
   - **Stateless rule group**: Operates per-packet using 5-tuple (source/destination IP, port, protocol) for fast pass/drop/forward. Does not track connection state.
   - **Stateful rule group**: Tracks connections and sessions. Uses Suricata-compatible rules to inspect domains (SNI/Host), protocol anomalies, and signature-based IPS/IDS.

```
Packet → [Stateless Evaluation] --forward to stateful--> [Stateful Evaluation] → Action
            │ pass/drop (immediate)                         │ pass/drop/alert
```

> 💡 **Related Theory**: Stateless vs. stateful is fundamental to firewall design. Stateless (NACL, Network Firewall stateless group) evaluates each packet independently for speed but cannot know "is this packet part of an existing connection's response?" Stateful (Security Group, Network Firewall stateful group) maintains a connection table, auto-allows response traffic, and understands session context (handshake progress, abnormal sequences). Network Firewall combines both in one engine, creating a pipeline: fast first-pass filter (stateless) → precise inspection (stateful).

## Stateful Rules: Suricata and Two Evaluation Orders

A stateful rule group accepts Suricata rule syntax directly (rules string) or domain lists/standard patterns. The evaluation order option is critical:
- **Default order (action order)**: Evaluates with priority: pass → drop → alert (differs from Suricata default).
- **Strict order**: Evaluates rules in defined order and specifies policy-level default stateful actions (`aws:drop_established`, etc.) — suited for whitelist (default-deny) configurations.

```
# Suricata: Allow HTTP/TLS outbound to example.com only (drop all others)
pass tls $HOME_NET any -> $EXTERNAL_NET any (tls.sni; content:"example.com"; nocase; sid:1001;)
pass http $HOME_NET any -> $EXTERNAL_NET any (http.host; content:"example.com"; sid:1002;)
drop tcp $HOME_NET any -> $EXTERNAL_NET any (msg:"deny other egress"; sid:1003;)
```

Domain filtering inspects plaintext SNI (TLS ClientHello) or HTTP Host header. This means it *relies on unencrypted SNI* — using ECH (Encrypted Client Hello) or domain fronting can bypass SNI-based filtering, a limitation worth understanding.

> ⚠️ **Trap**: Network Firewall's domain filtering applies *only to traffic passing through the firewall* endpoint. If routing doesn't send traffic to the firewall endpoint, inspection never happens. A common cause of "I built a domain allowlist but it's not blocking" is the route table not directing traffic to the firewall subnet.

## Routing: Forcing Traffic Through the Inspector

For inspection to occur, *symmetric routing* must ensure both inbound and outbound traffic pass through the firewall endpoint. Typical single-VPC deployment (distributed deployment):

```
[Workload subnet] --(0.0.0.0/0 → firewall endpoint)--> [Firewall subnet]
                                                              │
                                                       [IGW route table]
                                                  (subnet CIDR → firewall endpoint)
IGW's edge association (ingress routing) ensures
inbound traffic also passes through firewall
```

The key: set the workload subnet's default route to the firewall endpoint, interposing the firewall subnet between the IGW (or NAT) routes. On the IGW side, use **ingress routing (edge association)** to send return and inbound traffic back through the inspection endpoint. Asymmetric routing breaks stateful inspection.

## Centralized Inspection VPC: Hub and Spoke

With many accounts and VPCs, a distributed deployment of a firewall per VPC is operationally and cost inefficient. Use **Transit Gateway** or **VPC Lattice** as a hub, and place Network Firewall in a dedicated **inspection VPC** (central inspection VPC) to inspect all East-West (inter-VPC) and North-South (internet) traffic from one location.

```
        [Transit Gateway]  ── Hub
        /        |        \
 [App VPC]  [Inspection VPC]  [Data VPC]
                  │
          [Network Firewall]
          (inspects all cross traffic)
```

You must enable the TGW's **appliance mode** — this ensures packets in the same flow always route to the same firewall endpoint (same AZ), maintaining symmetric stateful inspection. Without appliance mode, flows become asymmetric across AZs, and stateful rules malfunction.

> 🎯 **Scenario**: "Inspect all inter-VPC and internet traffic from 50 accounts with IPS from a central location" is a common exam architecture. The answer pattern: Transit Gateway hub + dedicated inspection VPC with Network Firewall + TGW appliance mode enabled + Firewall Manager for central policy deployment. Distributed per-VPC firewalls don't fit "operational simplification and central management" requirements.

> 💡 **Related Theory**: The centralized inspection VPC is a *choke point* pattern in network security. Creating a single point through which all traffic must pass enables consistent policy enforcement and visibility. The tradeoff is clear — a single control point is easier to manage but becomes a potential bottleneck and single point of failure for availability and performance; it must be distributed and redundant with multiple endpoints across AZs.

## Route 53 Resolver DNS Firewall: Query-Level Control

While Network Firewall inspects packets and sessions, **DNS Firewall** filters *DNS queries* generated within the VPC at the Route 53 Resolver stage. It ALLOW/BLOCK/ALERT queries based on domain name.

- **Domain list**: Lists of domains to block or allow (defined directly or using AWS managed lists).
- **AWS Managed Domain Lists**: `AWSManagedDomainsMalwareDomainList`, `AWSManagedDomainsBotnetCommandandControl`, `AWSManagedDomainsAggregateThreatList`, etc., based on threat intelligence.
- **Block response method**: `NODATA`, `NXDOMAIN`, or `OVERRIDE` to a specified IP.
- **Rule group** attached to VPC, evaluated by rule priority.

```bash
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-abc \
  --firewall-domain-list-id rslvr-fdl-malware \
  --priority 100 --action BLOCK --block-response NXDOMAIN \
  --name block-malware-domains
```

A powerful use of DNS Firewall is **blocking DNS exfiltration (DNS tunneling)**. Malware encodes data in subdomain queries to exfiltrate information; blocking known C2 domains and alerting on abnormal query patterns provides defense.

> 🔍 **Deeper Insight**: Network Firewall SNI/domain filtering and DNS Firewall operate at *different layers*. DNS Firewall blocks at the "name resolution" stage, preventing malicious domain IP resolution entirely. Network Firewall blocks at the "connection attempt" stage, blocking the connection even if the IP is known. They are complementary — malware bypassing DNS to connect directly to an IP gets past DNS Firewall but hits Network Firewall stateful rules (IP/domain). This is defense in depth.

## Network Firewall vs. Gateway Load Balancer Appliances

To insert third-party firewalls (Palo Alto, Fortinet, etc.) into a VPC, use **Gateway Load Balancer (GWLB)** + GENEVE encapsulation. AWS Network Firewall is a *managed* alternative requiring no direct appliance operation. "Apply IPS/domain filtering without management overhead" → Network Firewall; "transparently insert a specific vendor appliance" → GWLB is the answer.

## Logging

Network Firewall sends **flow logs** (connection metadata) and **alert logs** (stateful rule matches, IPS alerts) to CloudWatch Logs/S3/Firehose. DNS Firewall records blocked/allowed queries in Resolver query logs. Both are primary evidence for forensics and tuning, and signal sources for threat detection alongside GuardDuty.

---

## 📝 연습 문제

**문제 1.** AWS Network Firewall에서 stateless 규칙 그룹과 stateful 규칙 그룹의 차이로 옳은 것은?

A) stateless는 연결 상태를 추적하고, stateful은 패킷 단위로만 본다  
B) stateless는 5-tuple로 패킷을 독립 평가(연결 미추적)하고, stateful은 연결·세션을 추적하며 Suricata 규칙으로 도메인·시그니처 검사를 한다  
C) 둘 다 동일하며 성능 차이만 있다  
D) stateful은 인바운드만, stateless는 아웃바운드만 검사한다  

**정답: B**  
해설: stateless 규칙 그룹은 각 패킷을 5-tuple(소스/대상 IP·포트, 프로토콜)로 독립 평가해 빠른 pass/drop/forward를 수행하며 연결 상태를 추적하지 않는다. stateful 규칙 그룹은 연결 테이블을 유지하고 Suricata 호환 규칙으로 SNI/Host 도메인, 프로토콜 이상, IPS 시그니처를 검사한다. 상태 추적 주체가 반대로 서술되거나 방향을 한정한 보기는 틀렸다.

---

**문제 2.** 도메인 허용 리스트(`example.com`만 아웃바운드 허용)를 stateful 규칙으로 만들었는데 다른 도메인이 여전히 나간다. 가장 가능성 높은 원인은?

A) Suricata 문법 오류  
B) workload subnet의 라우트 테이블이 트래픽을 firewall endpoint로 보내지 않아 검사 자체가 일어나지 않음  
C) DNS Firewall이 비활성화됨  
D) WCU 부족  

**정답: B**  
해설: Network Firewall는 firewall endpoint를 통과하는 트래픽만 검사한다. 라우트 테이블이 workload subnet의 트래픽을 firewall subnet으로 향하게 하지 않으면 규칙이 아무리 정확해도 검사가 일어나지 않는다. 흔한 실수가 바로 라우팅 누락이다. 문법 오류라면 규칙 배포가 실패하고, DNS Firewall는 다른 계층이며, WCU는 WAF 개념이다.

---

**문제 3.** Transit Gateway 허브와 중앙 inspection VPC로 모든 VPC 간 트래픽을 Network Firewall로 검사하려 한다. stateful 검사가 깨지지 않게 하려면 반드시 필요한 TGW 설정은?

A) ECMP 비활성화  
B) appliance mode 활성화 — 같은 흐름의 패킷이 항상 동일 AZ의 firewall endpoint로 가도록 보장  
C) DNS 지원 비활성화  
D) MTU를 9001로 설정  

**정답: B**  
해설: TGW appliance mode는 한 연결 흐름의 양방향 패킷이 항상 동일 AZ의 어플라이언스(firewall endpoint)로 라우팅되도록 해 대칭성을 보장한다. 이게 없으면 흐름이 AZ를 가로질러 비대칭이 되고, 연결 상태를 추적하는 stateful 검사가 응답 패킷을 알아보지 못해 오작동한다. ECMP·DNS·MTU 설정은 stateful 대칭성과 직접 관련이 없다.

---

**문제 4.** 멀웨어가 데이터를 DNS 질의의 서브도메인에 인코딩해 외부로 유출(DNS exfiltration)하는 것을 막으려 한다. 가장 적절한 서비스·기능은?

A) Security Group으로 53번 포트 차단  
B) Route 53 Resolver DNS Firewall로 알려진 악성/C2 도메인을 BLOCK하고 비정상 질의를 ALERT  
C) CloudFront OAC  
D) NACL 인바운드 거부  

**정답: B**  
해설: DNS Firewall는 VPC 내부의 DNS 질의를 Resolver 단계에서 도메인 기준으로 필터링하며, AWS 관리형 악성·봇넷 C2 도메인 목록 차단과 알림으로 DNS 터널링/exfiltration을 완화한다. 53번 포트를 전면 차단하면 정상 DNS도 막혀 서비스가 깨지고, OAC·NACL은 DNS 질의 내용 기반 통제가 아니다.

---

**문제 5.** 관리 부담 없이 VPC 아웃바운드 트래픽에 IPS(침입 방지)와 도메인 필터링을 적용하려 한다. 서드파티 어플라이언스 운영은 피하고 싶다. 가장 적절한 선택은?

A) Gateway Load Balancer + 서드파티 방화벽 어플라이언스  
B) AWS Network Firewall(관리형 stateful 규칙으로 IPS·도메인 필터링)  
C) Security Group 규칙만 강화  
D) AWS WAF를 VPC에 직접 연결  

**정답: B**  
해설: AWS Network Firewall는 관리형 서비스로, Suricata 호환 stateful 규칙으로 IPS/IDS와 SNI/Host 도메인 필터링을 어플라이언스 운영 부담 없이 제공한다. GWLB(A)는 서드파티 어플라이언스를 삽입할 때 쓰는 방식으로 운영 부담이 따른다. Security Group은 IP/포트 수준이라 IPS·도메인 필터링을 못 하고, WAF는 HTTP(L7) 애플리케이션용이라 VPC 일반 트래픽 검사에 직접 붙이는 통제가 아니다.

---
