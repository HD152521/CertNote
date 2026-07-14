# Day 2 - Security Groups vs Network ACL: The Essence of Stateful vs Stateless

There are two firewall layers inside a VPC: Security Group (SG) and Network ACL (NACL). Failing to precisely distinguish these two concepts blocks progress on exams and real-world troubleshooting alike. Questions like "Why doesn''t the response come back even though SG is wide open?" or "I opened inbound in NACL but why isn''t communication working?" almost always stem from missing the difference between **stateful and stateless**.

Today we clarify these concepts from first principles. We''ll cover evaluation order, state tracking differences, and the most common real-world troubleshooting scenarios. This is a core topic tested in nearly every SCS-C03 Domain 3 iteration.

## The Two Firewalls'' Location: Where Do They Attach?

```
Internet
  │
[ NACL ]  ← Attaches at subnet boundary (per-subnet)
  │
[ Security Group ]  ← Attaches to ENI(instance) (per-resource)
  │
[ EC2 Instance ]
```

- **NACL**: Operates at the subnet boundary. Inspects all traffic entering/leaving the subnet.
- **Security Group**: Operates at the ENI (Elastic Network Interface), i.e., instance level. Firewall closest to the resource.

| Item | Security Group (SG) | Network ACL (NACL) |
|------|----------------|---------------------|
| Applied To | ENI / Instance | Subnet |
| State | **Stateful** | **Stateless** |
| Rules | Allow only | Allow + **Deny possible** |
| Evaluation | All rules comprehensive | Rule number order, stops on first match |
| Default Behavior | Inbound block / Outbound allow | (Default) all allow / (Custom) all deny |

> 💡 **Related Theory**: This dual structure embodies the **layering** principle in network security. NACL is coarse-grained control across the entire subnet; SG is fine-grained per-resource control. This is exactly the same as traditional datacenter separation of router ACLs (subnet boundary) and host firewalls (per-server). NACL enforces subnet-wide blanket rules like "this port is absolutely forbidden," while SG manages precise per-resource allowances.

## Stateful vs Stateless: The Most Critical Difference

This one thing is half the exam.

**Security Group (Stateful)**: Allow inbound and **responses (outbound) are automatically allowed without rules**. It tracks connection state. Reverse is the same — if outbound traffic initiates, the inbound response is automatically allowed.

**NACL (Stateless)**: Tracks no state. Even if inbound is allowed, **outbound responses must be explicitly allowed**. Responses go via **ephemeral ports (1024-65535)**, so this range must be opened in the NACL outbound.

```
# Scenario: Web server (443) receiving Internet connection

[Security Group]
  Inbound: TCP 443 from 0.0.0.0/0   ← This alone is enough
  (Outbound response auto-allowed - stateful)

[NACL]  ← Must explicitly specify both (stateless)
  Inbound: Rule 100  TCP 443  from 0.0.0.0/0  ALLOW
  Outbound: Rule 100  TCP 1024-65535  to 0.0.0.0/0  ALLOW  ← Ephemeral ports required!
```

> ⚠️ **Pitfall**: The most common exam trap is exactly this **ephemeral ports** concept. The scenario "NACL inbound has 443 open but web responses don''t come back" — the answer is almost always "outbound ephemeral port (1024-65535) is blocked." With SG, this wouldn''t be a problem because it''s stateful. Note that ephemeral port ranges differ per OS (Linux 32768-60999, Windows Server 2008+ 49152-65535, NAT Gateway 1024-65535). That''s why it''s typical to safely open the full 1024-65535 range.

> 🔍 **Deeper**: There''s one subtle exception to stateful tracking. In a security group, if you allow inbound and then **delete the rule while connection is alive**, what happens? For TCP, already-established connections continue to be tracked by the SG. NACL, being stateless, applies rule changes immediately on the next packet. So for "emergency blocking," NACL''s Deny rule is more immediate than SG. However, tracked connection state clears on idle timeout or certain conditions.

## NACL''s Evaluation Order: Rule Number Determines Fate

NACL differs decisively from SG. **Rules are evaluated lowest number first**, and **evaluation stops on first match** (first-match wins).

```
Inbound NACL Rules:
  Rule 90:   DENY  TCP 22 from 203.0.113.50/32   ← Block specific IP
  Rule 100:  ALLOW TCP 22 from 0.0.0.0/0         ← Allow SSH
  Rule *:    DENY  ALL                            ← Implicit last (unchangeable)
```

In this case, 203.0.113.50 hits Rule 90''s DENY first and is blocked. It never reaches Rule 100''s ALLOW. **If the order were reversed (100 first), blocking wouldn''t work.**

> 💡 **Related Theory**: This "first-match-stops" approach is identical to traditional router/firewall ACLs (Cisco IOS ACL is the prime example). That''s why rule numbers are typically spaced in 100-unit increments (100, 200, 300...). It reserves space to insert rules later. SG has no order; all rules are OR-combined (allow if any one matches), so design thinking is completely different.

> 🎯 **Scenario**: "I want to block one specific malicious IP across the entire subnet. Can SG do it?" — No. SG has no Deny rules (only Allow exists). To block a specific IP, you must add a **Deny rule to NACL** with a low number. This is the key difference: "SG can''t block; NACL''s explicit Deny only." For large-scale IP blocking, NACL rule limits (default 20, max 40) apply, so AWS Network Firewall or WAF are used.

## Evaluation Flow: Packet''s Path

For inbound packets to reach EC2:

```
1. NACL inbound (subnet entry)     → DENY stops here
2. Security Group inbound (ENI arrival)    → Deny stops here
3. EC2 processing → Response generated
4. Security Group outbound (stateful → auto-allowed)
5. NACL outbound (stateless → explicit needed, usually ephemeral ports)
```

> 🔍 **Deeper**: A frequently asked question — "If two instances communicate **within the same subnet**, does NACL apply?" Answer: **No**. NACL inspects traffic crossing the subnet **boundary** only. Same-subnet internal communication bypasses NACL and applies SG only. Reverse: SG applies to all traffic reaching an ENI regardless of subnet. So "isolation within same subnet" is possible only via SG.

> ⚠️ **Pitfall**: SG can reference **another SG as source** (e.g., "allow only traffic from ALB''s SG"). This is logical group reference, not IP, so rules persist even as instances scale. NACL can reference only IP/CIDR, not SG. On exams, if the scenario is "only ALB can reach auto-scaling backend with changing IPs," the answer is **SG-to-SG reference**, not NACL.

## Real-World Troubleshooting Matrix

| Symptom | Suspect #1 | Check |
|---------|-----------|--------|
| Connection won''t establish (timeout) | Routing / SG inbound / NACL | Reachability Analyzer |
| Request goes but no response | NACL outbound ephemeral ports | NACL outbound 1024-65535 |
| Want to block one IP but can''t | Tried SG (doesn''t work) | Use NACL Deny rule |
| Intermittent blocks | NACL rule order (first-match) | Check rule number sort |
| Same-subnet isolation fails | Tried NACL (doesn''t apply) | Use SG isolation |

```bash
# Reachability Analyzer to trace path (troubleshooting best practice)
aws ec2 create-network-insights-path \
  --source i-source --destination i-dest \
  --protocol tcp --destination-port 443

aws ec2 start-network-insights-analysis \
  --network-insights-path-id nip-xxxx
# Result shows exactly which component (SG/NACL/Route) blocked
```

> 📚 **Case Study**: The most common 3 AM callout in real ops is "someone messed with the NACL." When someone tightens NACL outbound for security, NACL''s stateless nature means all response traffic gets blocked, and the entire subnet goes dark. Many organizations use the strategy of **almost never touching NACL and doing all fine-grained control via SG**. NACL stays as a backup for "never ever allowed" rules (e.g., specific malicious IP, DB port to Internet).

## Wrapping Up

Three essentials. First, **SG is stateful** so responses auto-allow and **NACL is stateless** so you must explicitly allow responses (ephemeral ports) — this is half the exam. Second, **only NACL can Deny**, it evaluates by rule number first-match, and SG does comprehensive Allow-only. Third, **SG can reference other SGs** and controls within-subnet, but NACL only sees subnet boundaries and IP/CIDR.

The operations strategy is clear — fine-grained control via SG, absolute-deny rules (specific IP block, broad deny) only via NACL. Next, we see how traffic actually flowed using **VPC Flow Logs** and detect breaches and misconfiguration through logs.

---

## 📝 연습 문제

**문제 1.** 한 엔지니어가 웹 서버 서브넷의 NACL 인바운드에 TCP 443을 0.0.0.0/0으로 허용했다. 그런데 외부에서 HTTPS 응답을 받지 못한다. 가장 가능성 높은 원인은?

A) 보안 그룹의 아웃바운드 443이 차단되어 있다  
B) NACL 아웃바운드에 임시 포트(1024-65535) 허용이 없다  
C) 라우팅 테이블에 로컬 경로가 누락되어 있다  
D) 보안 그룹이 stateless라 응답을 별도 허용해야 한다  

**정답: B**  
해설: 네트워크 ACL은 비저장 방식이라 요청을 허용해도 응답 트래픽을 자동으로 허용하지 않는다. HTTPS 응답은 클라이언트의 임시 포트 범위로 나가므로, 네트워크 ACL 아웃바운드에 임시 포트 범위를 명시적으로 허용해야 한다. 보안 그룹은 상태를 추적하므로 응답을 자동 허용하며, 이 증상의 원인이 아니다.

---

**문제 2.** 단일 악성 IP 주소 하나를 서브넷 전체에서 명시적으로 차단해야 한다. 올바른 접근은?

A) 보안 그룹 인바운드에 해당 IP를 Deny 규칙으로 추가한다  
B) 보안 그룹에서 0.0.0.0/0을 허용하되 해당 IP만 예외 처리한다  
C) 네트워크 ACL에 낮은 번호의 Deny 규칙으로 해당 IP를 추가한다  
D) 라우팅 테이블에서 해당 IP로 향하는 경로를 블랙홀로 설정한다  

**정답: C**  
해설: 보안 그룹은 허용 규칙만 지원하고 거부 규칙이 없으므로 특정 IP를 명시적으로 차단할 수 없다. 명시적 거부는 네트워크 ACL에서만 가능하며, 규칙 번호 순서대로 첫 매치에서 평가가 종료되므로 거부 규칙을 허용 규칙보다 낮은 번호로 두어야 효과가 있다.

---

**문제 3.** 오토스케일링으로 IP가 수시로 바뀌는 백엔드 인스턴스 그룹에 대해, 특정 ALB에서 오는 트래픽만 허용하고 싶다. 가장 적절한 방법은?

A) 백엔드 보안 그룹 인바운드의 소스로 ALB의 보안 그룹을 참조한다  
B) 백엔드 NACL에 ALB 인스턴스들의 IP를 모두 나열한다  
C) 백엔드 보안 그룹에 ALB 서브넷 CIDR을 허용한다  
D) 라우팅 테이블에서 ALB로만 향하는 경로를 추가한다  

**정답: A**  
해설: 보안 그룹은 소스로 다른 보안 그룹을 참조할 수 있어, IP가 변해도 그룹 멤버십으로 허용이 유지된다. 네트워크 ACL은 IP/CIDR만 참조하므로 IP가 자주 바뀌는 환경에 부적합하다. 서브넷 CIDR 허용은 같은 서브넷의 다른 리소스까지 열리므로 최소 권한에 어긋난다.

---

**문제 4.** 같은 서브넷 안에 있는 두 인스턴스 A, B 사이의 통신을 격리(차단)하려고 한다. 어떤 통제가 효과적인가?

A) 해당 서브넷의 네트워크 ACL 인바운드에 Deny 규칙을 추가한다  
B) 두 인스턴스의 보안 그룹 규칙으로 상호 트래픽을 허용하지 않는다  
C) 서브넷 라우팅 테이블에서 인스턴스 간 경로를 제거한다  
D) 네트워크 ACL과 보안 그룹 둘 중 어느 것으로도 가능하다  

**정답: B**  
해설: 네트워크 ACL은 서브넷 경계를 넘는 트래픽만 검사하므로 같은 서브넷 내부 통신에는 적용되지 않는다. 따라서 동일 서브넷 내 리소스 간 격리는 보안 그룹으로만 강제할 수 있다. 라우팅 테이블의 로컬 경로는 삭제할 수 없으므로 경로 제거 방식도 불가능하다.

---

**문제 5.** 보안 그룹과 네트워크 ACL의 평가 방식에 대한 설명으로 옳은 것은?

A) 보안 그룹은 규칙 번호 순서대로 첫 매치에서 평가를 종료한다  
B) 네트워크 ACL은 모든 규칙을 종합 평가하여 하나라도 허용하면 통과시킨다  
C) 보안 그룹은 모든 규칙을 종합 평가하고, 네트워크 ACL은 번호 순서대로 첫 매치에서 종료한다  
D) 둘 다 명시적 Deny 규칙을 우선 평가한 뒤 Allow를 본다  

**정답: C**  
해설: 보안 그룹은 순서 개념 없이 모든 허용 규칙을 종합 평가해, 어느 하나라도 매치하면 트래픽을 허용한다. 네트워크 ACL은 규칙 번호가 낮은 것부터 순서대로 평가하고 첫 매치에서 종료하므로, 거부 규칙을 허용 규칙보다 낮은 번호에 두어야 의도대로 동작한다.

---

**문제 6.** 보안 사고 대응 중 진행 중인 악성 연결을 즉시 끊어야 한다. 가장 즉각적으로 차단되는 통제는?

A) 보안 그룹에서 인바운드 허용 규칙을 삭제한다  
B) 네트워크 ACL에 해당 소스에 대한 Deny 규칙을 추가한다  
C) IAM 정책으로 해당 인스턴스의 권한을 회수한다  
D) 라우팅 테이블에서 VPC 로컬 경로를 삭제한다  

**정답: B**  
해설: 보안 그룹은 상태를 추적하므로 이미 수립된 연결은 규칙을 삭제해도 추적 정보로 한동안 유지될 수 있다. 반면 네트워크 ACL은 비저장 방식이라 규칙 변경이 다음 패킷부터 즉시 반영되므로 긴급 차단에 더 즉각적이다. 로컬 경로는 삭제할 수 없다.

---
