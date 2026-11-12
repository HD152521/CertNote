# Day 3 - VPC Flow Logs and Traffic Visibility: Reading Breaches Through Logs

Security groups and NACLs block traffic. But they can't answer "what traffic is flowing right now," "who tried to access our DB," or "is this blocked connection normal or an attack?" Controls only block; they don''t see. Seeing — visibility — is a separate capability.

VPC Flow Logs are that visibility. They record metadata of IP traffic flowing (or blocked) in a VPC. Not the payload, but "who to whom, on which port, how much, allow or deny." Today we read Flow Logs structure precisely and master analysis techniques to detect breaches and misconfigurations through logs. This bridges both SCS-C03 Domain 1 (Detection) and Domain 3 (Infrastructure Security).

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

## 📝 Practice Questions

**Question 1.** We want to identify which of several instances behind a NAT Gateway communicated with a suspicious external IP. Which field is absolutely required in Flow Logs?

A) The srcaddr field of the default format is enough  
B) The pkt-srcaddr field in a custom format  
C) The tcp-flags field  
D) The az-id field  

**Answer: B**  
Explanation: For traffic that passed through NAT, the NAT's address is recorded in the default source address field, so the actual instance cannot be distinguished. If you add the packet's original source address field to a custom format, you can identify the actual sending instance before NAT translation, which is decisive for pinpointing the compromised internal host.

---

**Question 2.** A large number of REJECT records heading to many different ports from a single external IP occurred in a short time. What is the most likely activity?

A) A normal load balancer health check  
B) Reconnaissance activity such as a port scan  
C) Large-scale data exfiltration  
D) NAT Gateway ephemeral port reuse  

**Answer: B**  
Explanation: A pattern in which one source tries to access many ports in a short time and all are rejected is typical of a port scan looking for open ports, that is, reconnaissance activity. Data exfiltration is a pattern of large numbers of bytes going out over allowed connections, and a health check is distinguished because it is allowed communication to a fixed port.

---

**Question 3.** We want to use Flow Logs for both security alarms and long-term forensic retention. What is a cost-effective configuration?

A) Send all traffic only to CloudWatch Logs  
B) Split into two: REJECT traffic to CloudWatch Logs (for alarms) and all traffic to S3 (retention and Athena)  
C) Send all traffic to both CloudWatch and S3 at the same time  
D) Handle both alarms and retention with a single Kinesis Firehose  

**Answer: B**  
Explanation: CloudWatch Logs has high ingestion, storage, and metric evaluation costs, so the standard is to split: send only the rejected traffic needed for alarms there, and send all traffic to S3, which is suited to low-cost long-term retention and large-volume queries, and analyze with Athena. Sending everything to CloudWatch makes costs spike.

---

**Question 4.** Which assessment of a plan to use Flow Logs as a real-time blocking mechanism is correct?

A) The aggregation interval is at least 1 minute, so it is unsuitable for real-time blocking and is for detection and analysis  
B) It is recorded in milliseconds, so it is suitable for real-time blocking  
C) Only ACCEPT is recorded, so it cannot be used for blocking  
D) Real-time blocking is possible only when sending to S3  

**Answer: A**  
Explanation: Flow Logs are recorded with an aggregation interval, which is 10 minutes by default and 1 minute at minimum, so they do not fit immediate inline blocking. They are not a control that blocks traffic but a visibility tool that views flows after the fact, so use them for detection and analysis and perform blocking with security groups, NACLs, or Network Firewall.

---

**Question 5.** Which statement about the relationship between GuardDuty and VPC Flow Logs is correct?

A) Turning on GuardDuty also automatically delivers Flow Logs to the user's S3 bucket  
B) GuardDuty consumes Flow Logs internally but does not deliver them to the user's account, so for forensic retention you must enable Flow Logs separately  
C) The two are completely independent and do not use the same data  
D) GuardDuty works only if Flow Logs are turned on  

**Answer: B**  
Explanation: GuardDuty internally analyzes data sources including Flow Logs but does not store those logs in the user's account. Therefore, if you need to retain traffic metadata for incident investigation, you must separately enable Flow Logs and deliver them to S3 or elsewhere. GuardDuty works on its own even if the user has not turned on Flow Logs.

---

**Question 6.** Among the egress ACCEPT traffic of an internal instance, a record was found of several GB sent to an external IP it does not normally communicate with. What should a security analyst suspect first?

A) A normal software update download  
B) Possible data exfiltration  
C) Retransmission due to NACL ephemeral port exhaustion  
D) A security group stateful tracking error  

**Answer: B**  
Explanation: A pattern in which a stable communication destination suddenly changes to an unfamiliar external IP and a large volume of data goes out outbound is a typical sign of data exfiltration. Update downloads generally involve large inbound reception from known distribution endpoints, and ephemeral port or stateful tracking issues have nothing to do with large egress.

---
