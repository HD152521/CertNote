# Day 3 - VPC Flow Logs and Network Logging: Detecting Breaches/Misconfig via Traffic, Route 53 Resolver Query Logs

CloudTrail watches the control plane (API), Config watches configuration state. But "what actual packets flowed where" neither sees. **VPC Flow Logs** fills the gap. Flow Logs record *metadata* (5-tuple, bytes, accept/reject) of IP traffic entering/leaving ENI (Elastic Network Interface). They do not capture packet *payload* — that's Traffic Mirroring's domain.

For security exams, Flow Logs are primary evidence for "detecting anomalous traffic," "diagnosing security group/NACL misconfiguration," "detecting data exfiltration," and "tracking denied connections."

## Flow Log Capture Scope and Destinations

Flow Logs can be enabled at three levels; lower resources inherit from upper:
- **VPC level**: All ENIs in that VPC.
- **Subnet level**: All ENIs in that subnet.
- **ENI level**: Individual interface.

Transmission targets: **CloudWatch Logs, S3, Kinesis Data Firehose**. S3 suits high volume and long-term storage with Athena analysis; CloudWatch Logs suits real-time metrics and alarms.

```
# Default format field order
version account-id interface-id srcaddr dstaddr srcport dstport
protocol packets bytes start end action log-status
```

```
2 111122223333 eni-0abc 203.0.113.10 10.0.1.20 49152 22 6 20 4800 1719216000 1719216060 REJECT OK
2 111122223333 eni-0abc 10.0.1.20 198.51.100.5 443 49321 6 5000 7340032 1719216000 1719216060 ACCEPT OK
```

- `action`: `ACCEPT` (security group/NACL allowed) or `REJECT` (denied).
- `log-status`: `OK` (normal), `NODATA` (no traffic), `SKIPDATA` (capacity exceeded, some skipped).

> ⚠️ **Pitfall**: Flow Logs record **metadata only**. "Inspect packet contents to find malware signatures" → not Flow Logs but **VPC Traffic Mirroring** (full packet duplication for IDS/IPS analysis) is the answer. Also, Flow Logs don't capture real-time per-packet; they aggregate in windows (default ~10 minutes or 1 minute) — not an immediate per-packet blocking tool.

## Custom Format and Deep Visibility Fields

Beyond default format, **custom format** adds fields that are exam and practice essentials:
- `vpc-id`, `subnet-id`, `instance-id`: Which resource.
- `tcp-flags`: SYN/ACK/FIN/RST flags — useful for detecting port scans (SYN-only patterns).
- `pkt-srcaddr` / `pkt-dstaddr`: *Original* address before NAT/load balancer (`srcaddr`/`dstaddr` are ENI-based).
- `flow-direction`: `ingress`/`egress`.
- `traffic-path`: Where egress traffic went (IGW, NAT, VPC peering, TGW etc.).

> 💡 **Related Theory**: The distinction between `pkt-srcaddr` and `srcaddr` touches *address translation transparency*, a core security analysis concept. Multiple instances behind NAT Gateway exit via same public IP; `srcaddr` alone cannot tell which instance communicated externally. `pkt-srcaddr` (private IP before NAT) identifies the true data exfiltration source. Breach investigations answering "which EC2 contacted C2 server" depend on this field.

## Detecting Breaches and Misconfiguration via Flow Logs

**Misconfiguration diagnosis** — "Connection fails; is it SG or NACL?":
- `REJECT` in Flow Log means SG or NACL blocked it. SG is *stateful* so inbound allow auto-permits responses, but NACL is *stateless* requiring separate inbound/outbound (including ephemeral ports). One-directional `REJECT` suggests NACL asymmetry.
- `ACCEPT` inbound but no response outbound → NACL ephemeral port (1024-65535) outbound rule missing (common cause).

```sql
-- Athena: Top source IPs for denied SSH inbound attempts
SELECT srcaddr, count(*) AS attempts
FROM vpc_flow_logs
WHERE dstport = 22 AND action = 'REJECT'
  AND date >= '2026-06-20'
GROUP BY srcaddr
ORDER BY attempts DESC
LIMIT 20;
```

**Breach/Exfiltration detection**:
- Instance not usually egressing suddenly sends large `bytes` to unknown external IP → exfiltration suspect.
- One source with many `dstport` SYN-flag-only → port scan.
- Internal instance communicating with known malicious IP/crypto pool → C2/cryptojacking.

> 🎯 **Scenario**: "EC2 unusually sends large data to unknown external IP. Diagnose with which log?" Answer: VPC Flow Logs (custom format with `pkt-srcaddr`, `bytes`, `flow-direction=egress`) to identify egress volume and originating instance. For automation, GuardDuty analyzes Flow Logs/DNS/CloudTrail to auto-detect these patterns (weeks 7-8 later topic).

## Route 53 Resolver Query Logging: DNS-Level Visibility

Much network breach evidence remains in **DNS**. Malware queries C2 domains, exfiltrates via DNS tunneling. **Route 53 Resolver Query Logging** records DNS queries occurring in a VPC (which instance queried which domain, record type, and response).

Transmission targets: **CloudWatch Logs, S3, Kinesis Data Firehose**.

```json
{
  "version": "1.100000",
  "account_id": "111122223333",
  "vpc_id": "vpc-0abc",
  "query_timestamp": "2026-06-24T08:30:00Z",
  "query_name": "malicious-c2.example.",
  "query_type": "A",
  "query_class": "IN",
  "rcode": "NOERROR",
  "answers": [{ "Rdata": "198.51.100.66", "Type": "A" }],
  "srcaddr": "10.0.1.20",
  "srcids": { "instance": "i-0def456" }
}
```

Detection patterns:
- Unusually long/random subdomain, many TXT queries → **DNS tunneling** (data exfiltration).
- Known malicious domain query → infected instance identified.
- Unusual dynamic DNS/new domain queries → C2 beacon.

> 💡 **Related Theory**: DNS is *implicitly allowed* in nearly every environment, making it attackers' favorite covert channel. Firewalls seldom block port 53. DNS tunneling encodes data in domain names themselves (`<base32-encoded-data>.attacker.com`). Resolver query log is nearly the only network-level evidence detecting this pattern (high-entropy long subdomains, abnormal query frequency) retroactively and real-time. **Route 53 Resolver DNS Firewall** blocks malicious domain lists for active prevention.

> ⚠️ **Pitfall**: Resolver query logging records only DNS queries **going through Route 53 Resolver in the VPC**. If an instance specifies external DNS (e.g., 8.8.8.8) directly, that query bypasses Resolver and won't log. Baseline security: "force VPC DNS toward Resolver" and block external DNS egress, then use DNS Firewall for malicious domains.

## Network Logging Tool Layer Summary

| Tool | Watches | Depth | Active Blocking |
|------|---------|-------|-----------------|
| VPC Flow Logs | IP traffic metadata (5-tuple, bytes, ACCEPT/REJECT) | L3/L4 headers | No (recording only) |
| Traffic Mirroring | Full packet copy (payload included) | L2~L7 payload | No (analysis) |
| Resolver Query Log | DNS query/response | DNS layer | No (recording only) |
| Resolver DNS Firewall | Domain-based allow/block | DNS layer | Yes |
| Network Firewall | Stateful inspection, IPS, domain filtering | L3~L7 | Yes |

> 🔍 **Deeper Dive**: Mature detection architecture uses these logs in *mutual reinforcement*. Flow Log shows "10.0.1.20 large egress to 198.51.100.66:443," Resolver log shows "10.0.1.20 queried `malicious-c2.example`, got 198.51.100.66" — communication *intent and domain context* complete what IP alone left ambiguous. CloudTrail adds "that instance's role just assumed suspicious permissions" — breach timeline completes. This multi-layer correlation is day 4 log centralization and day 5 scenario integration. All logs must centralize for cross-analysis.

---

## 📝 연습 문제

**문제 1.** "네트워크를 통해 들어온 패킷의 내용을 검사해 멀웨어 시그니처를 탐지하라"는 요구에 가장 적합한 것은?

A) VPC Flow Logs 기본 형식  
B) VPC Traffic Mirroring으로 전체 패킷을 복제해 IDS/IPS로 분석  
C) Route 53 Resolver 쿼리 로그  
D) Config 규칙  

**정답: B**  
해설: VPC Flow Logs는 5-tuple·바이트 수 같은 *메타데이터*만 기록하고 패킷 페이로드는 캡처하지 않는다. 패킷 내용 검사가 필요하면 Traffic Mirroring으로 전체 패킷을 복제해 IDS/IPS 어플라이언스로 보내야 한다. Resolver 로그는 DNS 쿼리, Config는 구성 상태로 패킷 페이로드 분석과 무관하다.

---

**문제 2.** NAT 게이트웨이 뒤의 여러 인스턴스가 같은 공인 IP로 외부와 통신한다. 데이터 유출을 일으킨 *원본 인스턴스*를 특정하려면 Flow Log에서 어떤 필드가 결정적인가?

A) `srcaddr`  
B) `pkt-srcaddr`(NAT 변환 이전의 원본 사설 IP)  
C) `interface-id`만으로 충분  
D) `log-status`  

**정답: B**  
해설: `srcaddr`는 ENI(NAT 게이트웨이) 기준 주소라 NAT 뒤 인스턴스들이 동일하게 보일 수 있다. custom format의 `pkt-srcaddr`는 NAT 변환 이전 원본 사설 IP를 담아 실제 출처 인스턴스를 특정하게 해준다. `log-status`는 캡처 상태이고, `interface-id`만으로는 공유 NAT 인터페이스 뒤를 구분하지 못한다.

---

**문제 3.** 인스턴스로의 인바운드는 `ACCEPT`로 들어오는데 응답 트래픽이 나가지 못해 연결이 실패한다. Flow Log에 outbound `REJECT`가 보인다. 가장 가능성 높은 원인은?

A) 보안 그룹이 stateful이라 자동으로 막혔다  
B) NACL이 stateless라 outbound 임시 포트(1024-65535) 범위를 허용하지 않았다  
C) Flow Logs가 SKIPDATA 상태다  
D) Resolver query logging이 꺼져 있다  

**정답: B**  
해설: 보안 그룹은 stateful이라 인바운드를 허용하면 응답이 자동 허용되지만, NACL은 stateless라 인바운드·아웃바운드를 별도로 평가한다. 응답은 임시 포트(ephemeral, 1024-65535)로 나가므로 NACL outbound에서 이 범위를 허용하지 않으면 `REJECT`된다. SG가 stateful이라는 점은 오히려 SG가 원인이 아님을 시사하고, SKIPDATA·Resolver 로깅은 무관하다.

---

**문제 4.** 내부 인스턴스가 비정상적으로 길고 무작위한 서브도메인에 대한 다량의 DNS TXT 쿼리를 보낸다. 어떤 위협이며 어떤 로그가 이를 드러내는가?

A) 포트 스캔 — VPC Flow Logs  
B) DNS 터널링을 통한 데이터 유출 — Route 53 Resolver 쿼리 로그  
C) SQL 인젝션 — WAF 로그  
D) 브루트포스 — CloudTrail  

**정답: B**  
해설: 엔트로피 높은 긴 서브도메인에 대한 다량 TXT 쿼리는 도메인 이름에 데이터를 인코딩해 빼내는 DNS 터널링의 전형적 패턴이다. Route 53 Resolver 쿼리 로그가 어느 인스턴스가 어떤 도메인을 조회했는지 기록해 이를 드러낸다. 능동 차단은 Resolver DNS Firewall로 한다. 포트 스캔·SQLi·브루트포스는 다른 계층의 위협이다.

---

**문제 5.** Route 53 Resolver 쿼리 로깅을 켰는데 일부 인스턴스의 DNS 조회가 로그에 나타나지 않는다. 가장 가능성 높은 원인은?

A) Flow Logs가 우선순위를 가져간다  
B) 해당 인스턴스가 외부 DNS 서버(예: 8.8.8.8)를 직접 지정해 Route 53 Resolver를 우회한다  
C) 쿼리 로그는 S3에만 저장된다  
D) Resolver는 A 레코드만 기록한다  

**정답: B**  
해설: Resolver 쿼리 로깅은 VPC의 Route 53 Resolver를 *거치는* 쿼리만 기록한다. 인스턴스가 외부 공용 DNS를 직접 지정하면 Resolver를 우회해 로그에 남지 않는다. 그래서 베이스라인은 DNS를 Resolver로 강제하고 외부 DNS egress를 제한하는 것이다. 쿼리 로그는 CloudWatch/S3/Firehose로 보낼 수 있고 특정 레코드 타입만 기록하지 않으며, Flow Logs와 우선순위 경쟁 관계도 아니다.

---
