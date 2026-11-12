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

## 📝 Practice Questions

**Question 1.** Which is most suitable for the requirement "inspect the contents of packets arriving over the network and detect malware signatures"?

A) VPC Flow Logs default format  
B) Replicate full packets with VPC Traffic Mirroring and analyze them with an IDS/IPS  
C) Route 53 Resolver query logs  
D) Config rules  

**Answer: B**  
Explanation: VPC Flow Logs record only *metadata* such as the 5-tuple and byte counts and do not capture packet payloads. When packet content inspection is needed, you must replicate full packets with Traffic Mirroring and send them to an IDS/IPS appliance. Resolver logs are DNS queries and Config is configuration state, so neither relates to packet payload analysis.

---

**Question 2.** Multiple instances behind a NAT gateway communicate externally using the same public IP. To identify the *source instance* that caused a data exfiltration, which field in the Flow Log is decisive?

A) `srcaddr`  
B) `pkt-srcaddr` (the original private IP before NAT translation)  
C) `interface-id` alone is sufficient  
D) `log-status`  

**Answer: B**  
Explanation: `srcaddr` is the address from the ENI (NAT gateway) perspective, so instances behind NAT can all look the same. The custom format's `pkt-srcaddr` holds the original private IP before NAT translation, allowing you to identify the actual source instance. `log-status` is the capture status, and `interface-id` alone cannot distinguish what sits behind a shared NAT interface.

---

**Question 3.** Inbound traffic to an instance arrives as `ACCEPT`, but response traffic cannot leave and the connection fails. The Flow Log shows outbound `REJECT`. What is the most likely cause?

A) The security group is stateful, so it was blocked automatically  
B) The NACL is stateless and did not allow the outbound ephemeral port range (1024-65535)  
C) Flow Logs is in SKIPDATA status  
D) Resolver query logging is turned off  

**Answer: B**  
Explanation: Security groups are stateful, so allowing inbound automatically allows the response, but NACLs are stateless and evaluate inbound and outbound separately. The response leaves on an ephemeral port (1024-65535), so if the NACL outbound does not allow this range, it is `REJECT`ed. The fact that SGs are stateful in fact suggests the SG is not the cause, and SKIPDATA and Resolver logging are irrelevant.

---

**Question 4.** An internal instance sends a large number of DNS TXT queries for abnormally long, random subdomains. What threat is this, and which log reveals it?

A) Port scan - VPC Flow Logs  
B) Data exfiltration through DNS tunneling - Route 53 Resolver query logs  
C) SQL injection - WAF logs  
D) Brute force - CloudTrail  

**Answer: B**  
Explanation: A large number of TXT queries for long, high-entropy subdomains is the classic pattern of DNS tunneling, which encodes data into domain names to exfiltrate it. Route 53 Resolver query logs record which instance looked up which domain and reveal this. Active blocking is done with Resolver DNS Firewall. Port scans, SQLi, and brute force are threats at different layers.

---

**Question 5.** You turned on Route 53 Resolver query logging, but the DNS lookups of some instances do not appear in the logs. What is the most likely cause?

A) Flow Logs take priority  
B) Those instances directly specify an external DNS server (for example 8.8.8.8) and bypass Route 53 Resolver  
C) Query logs are stored only in S3  
D) Resolver records only A records  

**Answer: B**  
Explanation: Resolver query logging records only queries that *pass through* the VPC's Route 53 Resolver. If an instance directly specifies an external public DNS, it bypasses Resolver and is not logged. That is why the baseline is to force DNS to Resolver and restrict external DNS egress. Query logs can be sent to CloudWatch/S3/Firehose and do not record only specific record types, and there is no priority competition with Flow Logs.

---
