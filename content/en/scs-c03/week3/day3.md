# Day 3 - VPC Flow Logs and Traffic Visibility: Reading Breaches Through Logs

Security groups and NACLs block traffic. But they can't answer "what traffic is flowing right now," "who tried to access our DB," or "is this blocked connection normal or an attack?" Controls only block; they don''t see. Seeing — visibility — is a separate capability.

VPC Flow Logs are that visibility. They record metadata of IP traffic flowing (or blocked) in a VPC. Not the payload, but "who to whom, on which port, how much, allow or deny." Today we read Flow Logs structure precisely and master analysis techniques to detect breaches and misconfigurations through logs. This bridges both SCS-C03 Domain 1 (Threat Detection) and Domain 3 (Infrastructure Security).

## What Flow Logs Record and What They Don''t

| Records | Doesn''t Record |
|---------|---------|
| Source/destination IP, port | Packet payload (actual data) |
| Protocol, bytes/packets | DNS query content (separate Resolver log) |
| ACCEPT / REJECT | DHCP, Amazon DNS(169.254.169.253) traffic, etc. |
| Start/end time | Windows license activation traffic, etc. |
| ENI ID, account, subnet, VPC | Metadata service(169.254.169.254) some |

> 💡 **Related Theory**: Flow Logs is AWS''s version of **NetFlow/IPFIX** from network forensics. Cisco''s NetFlow (1990s) had the insight: "storing all packets is expensive; let''s just summarize flow metadata." Without payload, you can still detect attack signatures like "abnormally large outbound transfer," "port scan patterns," "periodic C2 (Command & Control) communication" from metadata alone. This is the theoretical basis for reading breaches via Flow Logs.

## Basic Log Format: Reading 14 Fields

```
version account-id interface-id srcaddr dstaddr srcport dstport
protocol packets bytes start end action log-status
```

Actual record example:

```
2 123456789012 eni-1235b8ca 172.31.16.139 203.0.113.12 49152 443 6 20 4249 1418530010 1418530070 ACCEPT OK
2 123456789012 eni-1235b8ca 203.0.113.50 172.31.16.21  6666 22  6 1  40   1418530010 1418530070 REJECT OK
```

- First: 172.31.16.139 sent normal traffic to external 203.0.113.12 port 443 (ACCEPT).
- Second: External 203.0.113.50 attempted access to internal port 22 (SSH) but was denied (REJECT). protocol 6 = TCP.

> 🔍 **Deeper**: The `action` field''s ACCEPT/REJECT is security''s core. **REJECT means SG/NACL blocked it**, but also signals someone tried — reconnaissance. Many REJECT from external IP across multiple ports in short time = port scan. Opposite: ACCEPT to unexpected destination with large bytes = suspected data exfiltration. Security analysis needs both ACCEPT and REJECT — miss blocked attempts and you miss the successful breach.

> ⚠️ **Pitfall**: Flow Logs'' `action` is the **combined result of SG and NACL**. Which one blocked is hard to distinguish from Flow Logs alone. How does SG log denied inbound? SG is stateful so inbound not allowed is logged as REJECT. However, distinguishing when SG allows but NACL blocks requires Reachability Analyzer. Also — Flow Logs are **not near-real-time**. Aggregation interval defaults 10 minutes (minimum 1 minute), so unsuitable for real-time blocking. For detection and analysis.

## Custom Format: Additional Fields for Security Analysis

Basics 14 fields often aren''t enough. Custom format adds security-useful fields.

| Additional Field | Security Value |
|-----------|-------------|
| `tcp-flags` | SYN flood/scan if SYN-only floods |
| `pkt-srcaddr` / `pkt-dstaddr` | **Actual** source IP behind NAT (srcaddr is NAT IP) |
| `flow-direction` | Explicit ingress/egress |
| `traffic-path` | Path traffic took (IGW, NAT, VPCE, etc.) |
| `az-id` | AZ-level threat detection |

> 🔍 **Deeper**: The `pkt-srcaddr` vs `srcaddr` difference is forensics game-changer. NAT Gateway traffic shows NAT IP in `srcaddr`. Can''t tell "which internal instance talked to suspicious external?" Adding `pkt-srcaddr` to custom format captures **the real source before NAT translation**, pinpointing the compromised host. Without this field, data exfiltration investigation hits a wall.

## Destinations: Three Options

```bash
# 1. CloudWatch Logs — suits real-time alarms (Metric Filter)
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-xxxx --traffic-type REJECT \
  --log-destination-type cloud-watch-logs \
  --log-group-name /vpc/flowlogs --deliver-logs-permission-arn arn:aws:iam::...:role/flow-role

# 2. S3 — long-term storage + Athena bulk queries
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-xxxx --traffic-type ALL \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::my-flowlogs-bucket/prefix/ \
  --log-format '${srcaddr} ${dstaddr} ${pkt-srcaddr} ${action} ${tcp-flags}'

# 3. Kinesis Data Firehose — real-time streaming analysis/SIEM
```

| Destination | Strength | Best Use |
|--------|------|-------------|
| CloudWatch Logs | Metric Filter + Alarm | Real-time threshold alerts (REJECT spike) |
| S3 | Low-cost long storage, Athena | Bulk forensics, regulatory retention |
| Kinesis Firehose | Streaming | SIEM integration (Splunk, OpenSearch) |

> 💡 **Related Theory**: These three reflect security ops'' two time axes — **real-time detection** and **retrospective forensics**. CloudWatch for short timeframe (alerts), S3+Athena for long timeframe (incident reconstruction months later). Mature SOCs run both. S3 stores everything cost-effectively; CloudWatch alerts risk signals only.

## Querying Breach Patterns with Athena

Flow Logs in S3 are SQL-analyzed via Athena. Real-world example queries:

```sql
-- 1. Top attacker IPs denying SSH/RDP (port scan/brute-force reconnaissance)
SELECT srcaddr, dstport, count(*) AS attempts
FROM vpc_flow_logs
WHERE action = ''REJECT'' AND dstport IN (22, 3389)
GROUP BY srcaddr, dstport
ORDER BY attempts DESC LIMIT 20;

-- 2. Abnormally large outbound (suspected data exfiltration)
SELECT pkt_srcaddr, dstaddr, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE flow_direction = ''egress'' AND action = ''ACCEPT''
GROUP BY pkt_srcaddr, dstaddr
HAVING sum(bytes) > 1000000000
ORDER BY total_bytes DESC;

-- 3. One internal host to many destinations (C2 beacon/lateral movement)
SELECT pkt_srcaddr, count(DISTINCT dstaddr) AS distinct_dests
FROM vpc_flow_logs
GROUP BY pkt_srcaddr
HAVING count(DISTINCT dstaddr) > 100;
```

> 🎯 **Scenario**: "GuardDuty flagged one EC2 for cryptocurrency mining threat. What to verify in Flow Logs?" — (1) that ENI''s egress ACCEPT to known mining pool ports/IPs, (2) use `pkt-srcaddr` to identify actual instance, (3) periodic beacon pattern (small communication at intervals). GuardDuty says "what"; Flow Logs provide "how and how much" evidence. They complement.

> 📚 **Case**: Flow Logs turn into decisive evidence in data exfiltration investigations. Stable workloads have stable communication destinations. Then one day an instance starts sending GB to an external IP it never used before — that''s the exfiltration moment. Retaining Flow Logs in S3 for months lets you, upon detecting breach, work backward and reconstruct "when did abnormality start?" Without logs, this timeline is impossible.

## Real-Time Alerts with CloudWatch

```
# Metric Filter: Alert when REJECT exceeds threshold
Filter pattern: [version, account, eni, src, dst, srcport, dstport="22", protocol, packets, bytes, start, end, action="REJECT", status]
→ Convert to metric → CloudWatch Alarm → SNS → Security team alert
```

> 🔍 **Deeper**: Sending Flow Logs to CloudWatch costs rise fast (ingestion, storage, metric evaluation). So ops standard is **narrow traffic-type to REJECT** for CloudWatch (alerting) and send full ALL to S3 (storage/Athena). Sending everything to CloudWatch explodes costs. Also, GuardDuty internally consumes Flow Logs, so with GuardDuty enabled many network threats are already detected without separate Flow Logs analysis. But GuardDuty doesn''t store logs in your account, so for forensic retention you must enable Flow Logs separately.

## Wrapping Up

Three essentials today. First, Flow Logs record **metadata** (who-to-whom-port-allow/deny) without payload, and you must see **both** ACCEPT and REJECT to spot breaches. Second, knowing actual source behind NAT requires adding `pkt-srcaddr` to custom format — this is the key to identifying exfiltrated-from host. Third, destinations split by use: CloudWatch (real-time alerts), S3+Athena (forensics/retention), Kinesis (SIEM).

Flow Logs are visibility, not control — can''t block but can see. When GuardDuty says "threat," Flow Logs provide "when, where, how much" evidence. Next, we seal the data exfiltration path itself with **private connectivity (VPC Endpoint, PrivateLink)**.

---

## 📝 연습 문제

**문제 1.** NAT Gateway 뒤에 있는 여러 인스턴스 중 어느 것이 의심스러운 외부 IP로 통신했는지 특정하려고 한다. Flow Logs에서 반드시 필요한 필드는?

A) 기본 포맷의 srcaddr 필드만으로 충분하다  
B) 커스텀 포맷의 pkt-srcaddr 필드  
C) tcp-flags 필드  
D) az-id 필드  

**정답: B**  
해설: NAT를 거친 트래픽은 기본 출발지 주소 필드에 NAT의 주소가 기록되어 실제 인스턴스를 구분할 수 없다. 패킷의 원본 출발지 주소 필드를 커스텀 포맷에 추가하면 NAT 변환 이전의 실제 송신 인스턴스를 식별할 수 있어, 침해된 내부 호스트를 특정하는 데 결정적이다.

---

**문제 2.** 외부 IP 한 곳에서 짧은 시간에 다수의 서로 다른 포트로 향하는 REJECT 레코드가 대량 발생했다. 가장 가능성 높은 활동은?

A) 정상적인 로드밸런서 헬스 체크  
B) 포트 스캔 등 정찰 활동  
C) 대규모 데이터 유출  
D) NAT Gateway의 임시 포트 재사용  

**정답: B**  
해설: 한 출발지가 다수 포트로 짧은 시간에 접근을 시도하고 모두 거부된 패턴은 열린 포트를 찾는 포트 스캔, 즉 정찰 활동의 전형이다. 데이터 유출은 허용된 연결로 큰 바이트가 나가는 패턴이며, 헬스 체크는 정해진 포트로 허용되는 통신이라 구분된다.

---

**문제 3.** Flow Logs를 보안 알람과 장기 포렌식 보관에 모두 활용하려고 한다. 비용 효율적인 구성은?

A) 모든 트래픽을 CloudWatch Logs로만 보낸다  
B) REJECT 트래픽은 CloudWatch Logs(알람용), 전체 트래픽은 S3(보관·Athena)로 이원화한다  
C) 전체 트래픽을 CloudWatch와 S3에 동시에 모두 보낸다  
D) 알람과 보관 모두 Kinesis Firehose 하나로 처리한다  

**정답: B**  
해설: CloudWatch Logs는 수집·저장·메트릭 평가 비용이 높으므로 알람에 필요한 거부 트래픽만 좁혀 보내고, 전체 트래픽은 저비용 장기 보관과 대량 쿼리에 적합한 S3로 보내 Athena로 분석하는 이원화가 표준이다. 전체를 CloudWatch로 보내면 비용이 급증한다.

---

**문제 4.** Flow Logs를 실시간 차단(blocking) 메커니즘으로 사용하려는 계획에 대한 평가로 옳은 것은?

A) 집계 간격이 최소 1분이라 실시간 차단에는 부적합하며 탐지·분석용이다  
B) 밀리초 단위로 기록되므로 실시간 차단에 적합하다  
C) ACCEPT만 기록되므로 차단에 활용할 수 없다  
D) S3로 보낼 때만 실시간 차단이 가능하다  

**정답: A**  
해설: Flow Logs는 집계 간격을 두고 기록되며 기본 10분, 최소 1분이라 즉각적인 인라인 차단에는 맞지 않는다. 트래픽을 막는 통제가 아니라 흐름을 사후에 보는 가시성 도구이므로, 탐지와 분석에 사용하고 차단은 보안 그룹·NACL·네트워크 방화벽으로 수행한다.

---

**문제 5.** GuardDuty와 VPC Flow Logs의 관계로 옳은 것은?

A) GuardDuty를 켜면 Flow Logs도 자동으로 사용자 S3 버킷에 적재된다  
B) GuardDuty는 내부적으로 Flow Logs를 소비하지만 사용자 계정에 적재하지 않으므로, 포렌식 보관은 별도로 Flow Logs를 켜야 한다  
C) 둘은 완전히 독립적이며 같은 데이터를 쓰지 않는다  
D) Flow Logs를 켜야만 GuardDuty가 동작한다  

**정답: B**  
해설: GuardDuty는 Flow Logs를 포함한 데이터 소스를 내부적으로 분석하지만 그 로그를 사용자 계정에 저장해 주지는 않는다. 따라서 사고 조사를 위한 트래픽 메타데이터 보관이 필요하면 별도로 Flow Logs를 활성화해 S3 등에 적재해야 한다. GuardDuty는 사용자가 Flow Logs를 켜지 않아도 자체적으로 동작한다.

---

**문제 6.** 한 내부 인스턴스의 egress ACCEPT 트래픽 중, 평소 통신하지 않던 외부 IP로 수 GB가 전송된 기록이 발견됐다. 보안 분석가가 우선 의심할 상황은?

A) 정상적인 소프트웨어 업데이트 다운로드  
B) 데이터 유출(exfiltration) 가능성  
C) NACL 임시 포트 부족으로 인한 재전송  
D) 보안 그룹의 stateful 추적 오류  

**정답: B**  
해설: 안정적이던 통신 목적지가 갑자기 낯선 외부 IP로 바뀌고 대용량 데이터가 아웃바운드로 나가는 패턴은 데이터 유출의 전형적 징후다. 업데이트 다운로드는 일반적으로 인바운드 수신이 크고 목적지가 알려진 배포 엔드포인트이며, 임시 포트나 stateful 추적 문제는 대용량 egress와 무관하다.

---
