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

## 📝 연습 문제

**문제 1.** 글로벌 웹앱이 SQLi 시도, 대규모 SYN flood, 로그인 무차별 대입을 동시에 받는다. 오리진은 ALB+EC2다. 가장 적절한 통합 설계는?

A) ALB에만 WAF를 붙이고 EC2 인스턴스를 키운다  
B) CloudFront 전면 배치 + CLOUDFRONT scope WAF(SQLi managed + `/login` rate-based) + Shield Advanced + 오리진 직접 접근 차단(prefix list/비밀 헤더)  
C) NACL로 모든 의심 IP를 수동 차단  
D) Route 53 가중치 라우팅으로 트래픽 분산만 한다  

**정답: B**  
해설: 세 위협이 서로 다른 계층이므로 계층별 통제를 엣지에 결합해야 한다. CloudFront 전면 배치로 진입을 엣지로 모으고, WAF로 SQLi(L7 필터)와 로그인 브루트포스(rate-based)를, Shield Advanced로 SYN flood(L3/4 흡수)와 비용 보호를 처리하며, 오리진 직접 접근을 차단해 우회를 막는다. ALB만 보호하면 엣지 흡수가 없고, NACL 수동 차단·단순 트래픽 분산은 이 복합 위협을 막지 못한다.

---

**문제 2.** 100개 계정의 워크로드 VPC 아웃바운드를 승인 도메인으로만 제한하고 IPS를 적용하며 중앙 운영하려 한다. 가장 적절한 아키텍처는?

A) VPC마다 Network Firewall를 개별 배치  
B) Transit Gateway 허브 + 중앙 inspection VPC의 Network Firewall(도메인 allow-list + Suricata IPS) + TGW appliance mode + Firewall Manager 중앙 배포  
C) Security Group으로 도메인을 화이트리스트  
D) 각 VPC에서 NACL로 IP 차단  

**정답: B**  
해설: 다계정 중앙 검사는 TGW 허브 + 전용 inspection VPC에 Network Firewall를 두고, appliance mode로 stateful 대칭성을 보장하며 Firewall Manager로 정책을 중앙 배포하는 choke point 패턴이 정답이다. VPC별 개별 배치는 운영·비용이 비효율적이고, Security Group/NACL은 도메인(SNI/Host) 기반 통제나 IPS를 못 한다.

---

**문제 3.** L7 HTTP GET flood를 받는 상황에서 Shield Standard만으로 충분하다고 본 설계가 실패했다. 올바른 보완은?

A) Shield Standard를 재활성화  
B) WAF rate-based rule로 IP/커스텀 키별 요청률을 제한(필요 시 Shield Advanced 자동 L7 완화 결합)  
C) 인스턴스 타입을 키운다  
D) Route 53 TTL을 낮춘다  

**정답: B**  
해설: Shield Standard는 L3/L4 흡수가 주력이라 L7 HTTP flood를 정밀 차단하지 못한다. L7 flood는 WAF rate-based rule이 IP/커스텀 키별 요청률을 측정해 차단하는 것이 직접 통제이며, Shield Advanced의 자동 애플리케이션 계층 완화와 결합할 수 있다. 인스턴스 확장·TTL 변경은 근본 완화가 아니다.

---

**문제 4.** CloudFront 서명 URL과 S3 presigned URL 중, 엣지의 WAF·Shield·OAC 보호를 모두 거치게 하려면 어느 것을 써야 하며 그 이유는?

A) S3 presigned URL — 더 간단하므로  
B) CloudFront 서명 URL — 엣지에서 검증되어 WAF·Shield·캐싱·OAC 보호를 거치고, S3 presigned URL은 이 통제를 우회한다  
C) 둘 다 동일하다  
D) 어느 쪽도 WAF를 거치지 않는다  

**정답: B**  
해설: CloudFront 서명 URL은 엣지에서 검증되므로 WAF·Shield·엣지 캐싱·OAC 잠금을 모두 통과하는 경로에 놓인다. 반면 S3 presigned URL은 S3가 직접 서명·검증해 CloudFront 엣지 통제를 우회한다. 따라서 엣지 보호를 일관 적용하려면 CloudFront 서명 URL + OAC 구성이 정답이다.

---

**문제 5.** 다음 중 이번 주 통제 배치에서 "함정"으로 자주 지적되는 항목이 아닌 것은?

A) WAF Web ACL 스코프(CLOUDFRONT/REGIONAL)를 대상과 어긋나게 생성  
B) OAC 설정 후 버킷 정책·KMS 키 정책을 갱신하지 않아 403  
C) Network Firewall로 트래픽 라우팅을 firewall endpoint로 강제하지 않아 검사 미발생  
D) ACM DNS 검증을 사용해 인증서를 자동 갱신 가능하게 구성  

**정답: D**  
해설: ACM의 DNS 검증은 함정이 아니라 *권장 모범*이다 — 도메인 소유를 지속 확인할 수 있어 완전 자동 갱신이 가능하다. 나머지는 모두 실제 빈출 함정이다: 스코프 불일치로 ACL 미연결, OAC 후 정책 미갱신 403, 라우팅 미구성으로 Network Firewall 검사 자체가 안 일어남. 함정이 *아닌* 것을 고르는 문제이므로 정답은 자동 갱신 구성이다.

---
