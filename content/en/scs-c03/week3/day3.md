# Day 3 - VPC Flow Logs and Traffic Visibility: Reading a Breach from the Logs

Security groups and NACLs block traffic. But they cannot answer questions like "what traffic is flowing right now?", "who tried to access our DB?", or "is the connection that was just blocked legitimate or an attack?" Controls only block; they cannot see. Seeing, that is, visibility, is a separate capability.

VPC Flow Logs are that eye. They record the metadata of IP traffic that flowed (or was blocked) inside the VPC. Not the payload, but "who, to whom, on which port, how much, allowed or denied." Today we read the structure of Flow Logs precisely, with particular weight on **confirming yesterday's SG/NACL diagnosis on top of the logs**. This is a core topic that spans both SCS-C03 Domain 1 (Detection) and Domain 3 (Infrastructure Security).

> What we cover today is "the basics of the ability to see traffic" and "diagnosing SG/NACL misconfiguration." The **audit, centralization, and integrity area** — gathering logs from multiple accounts and multiple sources in one place, guaranteeing those logs have not been tampered with, and reconstructing an incident from months ago from the logs — is covered separately **in Week 7**. So today we go only as far as "how to read the logs."

## Control and Visibility Are Different Capabilities

There are questions that no amount of tightly applied security control can answer.

| Question | Do controls (SG/NACL) answer it? | Do Flow Logs answer it? |
|----------|----------------------------------|-------------------------|
| "Did we block inbound on this port?" | Yes (you can tell from the rules) | — |
| "Who actually tried?" | No | Yes |
| "Is what was blocked an attack or our own health check?" | No | Yes |
| "Is there anything odd among the allowed traffic?" | No | Yes |
| "Where did this instance communicate last week?" | No | Yes (if retained) |

From the second row on, it is all the realm of visibility. Rules record **intent about future traffic**, and logs record **what actually happened in the past**. The two often diverge. If traffic that should be blocked by the rules got through, there is a path somewhere that we don't know about; if traffic allowed by the rules doesn't arrive, another layer is blocking it. **Revealing the gap between intent and reality** is the original value of logs.

This framing is the first two axes of the security-operations trichotomy of **prevent / detect / respond**. Detection exists on the premise that preventive controls are not perfect. If prevention were perfect, detection would be unnecessary, but in reality misconfiguration, zero-days, insiders, and stolen legitimate credentials get through prevention. That is why maturity models without exception rank "can we see what passed through" above "adding more block rules." Without eyes, you don't even know you have been breached, and the average dwell time of an unknown breach is always long.

## What Flow Logs Record and What They Don't

| Recorded | Not recorded |
|----------|--------------|
| Source/destination IP and port | Packet payload (the actual data) |
| Protocol, byte/packet counts | DNS query content (separate Resolver logs) |
| ACCEPT / REJECT | Some traffic such as DHCP and Amazon DNS (169.254.169.253) |
| Start/end times | Traffic such as Windows license activation |
| ENI ID, account, subnet, VPC | Parts of the metadata service (169.254.169.254) traffic |

Flow Logs are the AWS version of **NetFlow/IPFIX** in network forensics. NetFlow, created by Cisco in the 1990s, was born from the idea that "storing every packet is expensive, so let's store only a summary of flow metadata." Even without the payload, you can detect attack signs from metadata alone, such as "an abnormally large outbound transfer," "port-scan patterns," or "periodic communication with a C2 (Command & Control) server." This is the theoretical basis for reading a breach with Flow Logs.

## The Default Log Format: Reading the 14 Fields

```
version account-id interface-id srcaddr dstaddr srcport dstport
protocol packets bytes start end action log-status
```

Example actual records:

```
2 123456789012 eni-1235b8ca 172.31.16.139 203.0.113.12 49152 443 6 20 4249 1418530010 1418530070 ACCEPT OK
2 123456789012 eni-1235b8ca 203.0.113.50 172.31.16.21  6666 22  6 1  40   1418530010 1418530070 REJECT OK
```

- First line: normal traffic (ACCEPT) that 172.31.16.139 sent to port 443 of the external 203.0.113.12.
- Second line: external 203.0.113.50 tried to reach internal port 22 (SSH) but was denied (REJECT). protocol 6 = TCP.

The `action` field's ACCEPT/REJECT is the heart of security. **REJECT means the SG/NACL blocked it**, but at the same time it is a reconnaissance signal that "someone tried." If REJECTs pour in from an external IP across many ports in a short time, it is a port scan. Conversely, if it is ACCEPT but a large number of bytes goes out to an unexpected destination, suspect data exfiltration. Security analysis must look at both ACCEPT and REJECT — looking only at what was blocked misses the breaches that succeeded.

### Read as a Pair, Not a Single Line

Someone seeing a Flow Log for the first time reads one row at a time. Diagnosis begins when you find a **round-trip pair** and match them up. Normal TCP communication shows up as two rows flipped like mirror images of each other.

```
[ Normal round trip: the two rows are flipped like a mirror ]

  Request   ... 203.0.113.10  10.0.1.20   51000  443   6 ... ACCEPT OK
               └ src          └ dst       └sport └dport
  Response  ... 10.0.1.20     203.0.113.10  443  51000  6 ... ACCEPT OK
               └ src          └ dst       └sport └dport
               ↑ source/destination and ports are exactly swapped

[ Asymmetric failure: request passed, response died ]

  Request   ... 203.0.113.10  10.0.1.20   51000  443   6 ... ACCEPT OK
  Response  ... 10.0.1.20     203.0.113.10  443  51000  6 ... REJECT OK
                                                            ↑ here

  → Only a NACL can produce this shape.
     The SG remembers the request, so it cannot reject the response.

[ Complete block: died from the request ]

  Request   ... 203.0.113.10  10.0.1.20   51000  443   6 ... REJECT OK
  (there is no response row at all)

  → SG inbound not allowed, NACL inbound Deny — either is possible.
     The log alone does not tell them apart → check the configuration or use Reachability Analyzer.
```

If you get these three shapes into your eye, half the diagnosis is done with two lines of log. The second shape is especially decisive. **An asymmetric failure with REJECT stamped only on the response direction is the fingerprint of a NACL**, and a security group structurally cannot produce this shape. The property learned yesterday, "the SG remembers the request," shows up directly in the shape of the log.

## Who Blocked It: The SG or the NACL

The `action` field tells you only "it was blocked," not "what blocked it." Still, combining **the shape and direction of the log** narrows it down considerably. Below is the decision table used in practice.

| What you see in the log | Likely cause | What to check |
|-------------------------|--------------|---------------|
| Only inbound REJECT, no response row | SG inbound not allowed **or** NACL inbound Deny | Check both layers' configuration |
| Inbound ACCEPT + outbound REJECT | **NACL outbound** (ephemeral ports not allowed) | NACL egress 1024-65535 |
| Outbound ACCEPT + inbound response REJECT | **NACL inbound** (ephemeral ports not allowed) | NACL ingress 1024-65535 |
| Outbound REJECT (from the request) | SG outbound was narrowed, or NACL egress Deny | SG egress defaults to allow-all, so first find who narrowed it |
| No rows at all in the log | No routing, or the packet never arrived | Route table, source-side logs |
| Only a specific IP is consistently REJECTed | A low-numbered NACL Deny rule | Rule number order |
| REJECT only intermittently | Time of a rule change, or NACL rule-count limit | Change history (Config), rule count |

The second-to-last line, **"no rows at all in the log,"** is the state most confusing for beginners. Not even a REJECT means the packet never came near that ENI. The cause is usually routing, or the source sent the packet somewhere else to begin with, or name resolution resolved to the wrong IP. **"Blocked" and "never arrived" are entirely different events**, and telling these two apart is one of the valuable functions of the Flow Log.

```
[ Decision tree for narrowing down with Flow Log evidence ]

  Is there a relevant row in that ENI's log?
   ├─ No ────▶ The packet did not arrive
   │            → check routing / DNS resolution / source configuration
   │              (no amount of opening SG or NACL helps)
   │
   └─ Yes ───▶ What is the action of the first row (request direction)?
                ├─ REJECT ──▶ Inbound block
                │              → check SG inbound rules
                │              → check NACL inbound Deny and number order
                │
                └─ ACCEPT ──▶ Is there a row in the opposite direction?
                               ├─ No     ──▶ Destination does not respond
                               │              → process listening / app error
                               ├─ REJECT ──▶ ★ NACL ephemeral ports ★
                               └─ ACCEPT ──▶ Network is normal
                                              → move to the policy/auth layer
```

> 🎯 **Scenario**: "Calls from on-premises to the API server (443) in the corporate VPC intermittently time out. Looking at the Flow Log, all inbound is ACCEPT, but some of the outbound rows are REJECT. What is the cause?" — It is an asymmetric failure, so it is the NACL. And the clue "intermittent" points to an ephemeral port range problem. If the ephemeral port range that the client OS picks overlaps the NACL outbound allowed range **only partially**, only the connections that happen to pick a port inside the allowed range succeed and the rest fail. Exactly this symptom shows up as "it works three times out of ten." The fix is to widen the NACL outbound to 1024-65535.

> ⚠️ **Pitfall**: The `action` in Flow Logs is **the combined result of the security group and NACL**. Which one blocked it is hard to tell from Flow Logs alone. How does an SG leave a denied inbound in the log? Because the SG is stateful, inbound that is not allowed is recorded as REJECT. However, distinguishing the case where traffic allowed by the SG is blocked by the NACL requires Reachability Analyzer. One more thing — Flow Logs are **not near real-time**. The aggregation interval defaults to 10 minutes (minimum 1 minute), so they are unsuitable for real-time blocking. They are for detection and analysis.

## Custom Format: Extra Fields Needed for Security Analysis

The default 14 fields are often not enough. With a custom format, you add fields useful for security.

| Added field | Security value |
|-------------|----------------|
| `tcp-flags` | If only SYNs pour in, detect SYN flood / scan |
| `pkt-srcaddr` / `pkt-dstaddr` | The **real** original IP behind NAT (srcaddr is the NAT IP) |
| `flow-direction` | Explicit ingress/egress |
| `traffic-path` | The path the traffic took (IGW, NAT, VPCE, etc.) |
| `az-id` | Per-Availability-Zone anomaly detection |

The difference between `pkt-srcaddr` and `srcaddr` is decisive in forensics. For traffic that went through a NAT Gateway, the NAT's IP is stamped in `srcaddr`. Then you cannot tell "which internal instance communicated with the suspicious external party." If you add `pkt-srcaddr` to the custom format, the **real original before** NAT translation is recorded, so you can identify the compromised internal host. In a data exfiltration investigation, tracing is blocked without this field.

## Where to Send Them: Three Destinations

```bash
# 1. CloudWatch Logs — suited to real-time alarms (Metric Filter)
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-xxxx --traffic-type REJECT \
  --log-destination-type cloud-watch-logs \
  --log-group-name /vpc/flowlogs --deliver-logs-permission-arn arn:aws:iam::...:role/flow-role

# 2. S3 — suited to long-term retention + large-scale Athena queries
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-xxxx --traffic-type ALL \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::my-flowlogs-bucket/prefix/ \
  --log-format '${srcaddr} ${dstaddr} ${pkt-srcaddr} ${action} ${tcp-flags}'

# 3. Kinesis Data Firehose — real-time streaming analysis / SIEM delivery
```

| Destination | Strength | Suitable use |
|-------------|----------|--------------|
| CloudWatch Logs | Metric Filter + Alarm | Real-time threshold alarms (REJECT surge) |
| S3 | Low-cost long-term retention, Athena | Large-scale forensics, regulatory retention |
| Kinesis Firehose | Streaming | SIEM (Splunk, OpenSearch) integration |

This three-way split reflects the two time axes of security operations — **real-time detection** and **retrospective forensics**. CloudWatch is the short time axis (alarms), S3 + Athena is the long time axis (reconstructing an incident from months ago). A mature SOC operates both. Keep everything cost-efficiently in S3, and alarm in real time on only the danger signals through CloudWatch. The **centralization and integrity design** — gathering logs from multiple accounts into one account and guaranteeing that retained copies have not been tampered with — is covered separately **in Week 7**.

### Four Decisions When Turning It On, and the Ones You Can't Undo

Some of the values you decide when creating a Flow Log **cannot be modified later.** The format (log format), the aggregation interval, the target resource, and the destination. To change them you must delete and recreate, and the traffic in between is not recorded. So the decisions at first turn-on last a long time.

| Item | Choices | Security-oriented default |
|------|---------|---------------------------|
| Target level | VPC / subnet / ENI | **VPC level** — new subnets and instances are included automatically |
| traffic-type | ALL / ACCEPT / REJECT | For retention, **ALL**. Turn on only REJECT and you can't see breaches that succeeded |
| Aggregation interval | 10 min (default) / 1 min | To reduce detection delay, **1 minute** |
| Format | Default / custom | **Custom** — include in advance the fields you'll wish you had later |

The reason for choosing VPC as the target level is important. If you turn it on per subnet or per ENI, **resources created later are not included automatically.** A logging gap always arises from "what was newly created," and what is newly created is usually less verified and thus riskier. The general principle of logging design is to turn it on at a higher level and let the lower levels inherit.

```bash
# Check whether a flow log is on for this VPC and what its settings are
aws ec2 describe-flow-logs \
  --filter "Name=resource-id,Values=vpc-0abc1234" \
  --query 'FlowLogs[].{Id:FlowLogId,Type:TrafficType,Dest:LogDestinationType,
             Interval:MaxAggregationInterval,Status:FlowLogStatus,Format:LogFormat}' \
  --output json

# Turn on at VPC level · all traffic · 1-minute aggregation (including the fields needed for diagnosis)
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-0abc1234 \
  --traffic-type ALL \
  --max-aggregation-interval 60 \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::corp-flow-logs/prod/ \
  --log-format '${version} ${vpc-id} ${subnet-id} ${instance-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${tcp-flags} ${packets} ${bytes} ${start} ${end} ${action} ${log-status} ${pkt-srcaddr} ${pkt-dstaddr} ${flow-direction}'

# If it is on but logs aren't accumulating, look at status first
#  ACTIVE          normal
#  FAILED          mostly a permissions (IAM role/bucket policy) problem
aws ec2 describe-flow-logs --query 'FlowLogs[?FlowLogStatus!=`ACTIVE`]'
```

> ⚠️ **Pitfall**: You must distinguish the three values of the `log-status` field. `OK` is normal, `NODATA` means there was no traffic at all to that ENI in that interval, and `SKIPDATA` means **some records were dropped due to capacity issues**. If `SKIPDATA` is mixed in during an investigation, you must reflect in your conclusion the fact that "the logs for this interval are incomplete." This is a classic situation where the absence of logs cannot serve as evidence that nothing happened, and treating `NODATA` and `SKIPDATA` as the same thing leads to the opposite conclusion.

## Querying Breach Patterns with Athena

Flow Logs accumulated in S3 are analyzed with SQL in Athena. Practical query examples:

```sql
-- 1. Top attacker IPs for denied SSH/RDP access attempts (port-scan/brute-force reconnaissance)
SELECT srcaddr, dstport, count(*) AS attempts
FROM vpc_flow_logs
WHERE action = 'REJECT' AND dstport IN (22, 3389)
GROUP BY srcaddr, dstport
ORDER BY attempts DESC LIMIT 20;

-- 2. Abnormally large outbound transfers (suspected data exfiltration)
SELECT pkt_srcaddr, dstaddr, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE flow_direction = 'egress' AND action = 'ACCEPT'
GROUP BY pkt_srcaddr, dstaddr
HAVING sum(bytes) > 1000000000
ORDER BY total_bytes DESC;

-- 3. One internal host communicating with many destinations (suspected C2 beacon / lateral movement)
SELECT pkt_srcaddr, count(DISTINCT dstaddr) AS distinct_dests
FROM vpc_flow_logs
GROUP BY pkt_srcaddr
HAVING count(DISTINCT dstaddr) > 100;
```

The three queries above are only examples of "how to look"; in a real investigation, the threshold is the problem. The number 1 billion in `sum(bytes) > 1000000000` has no basis — in some environments it is routine and in others it is a major incident. So the first job in practice is not writing detection rules but **measuring the baseline**. What is this instance's normal daily egress, how many destinations does it normally talk to, and how stable is that list? Without a baseline every number is just a number, and thresholds wander randomly between false positives and false negatives. With a baseline, on the other hand, a relative expression like "40 times normal" becomes possible, and this works far better than an absolute threshold.

## CloudWatch Logs Insights for Quick Diagnosis

Athena is for digging through large logs accumulated in S3, and when narrowing down **a connection problem that just occurred**, CloudWatch Logs Insights is faster. When you send Flow Logs to CloudWatch Logs, the fields are recognized automatically, so you can query right away.

```
# REJECTs toward a specific instance, most recent first
fields @timestamp, srcAddr, dstAddr, srcPort, dstPort, protocol, action
| filter dstAddr = "10.0.1.20" and action = "REJECT"
| sort @timestamp desc
| limit 50

# Find asymmetric failures: action distribution by direction for communication with the same peer
fields srcAddr, dstAddr, dstPort, action
| filter srcAddr = "10.0.1.20" or dstAddr = "10.0.1.20"
| stats count(*) as cnt by srcAddr, dstAddr, dstPort, action
| sort cnt desc

# Which ports are being rejected the most (detects scans and misconfiguration at once)
fields dstPort, action
| filter action = "REJECT"
| stats count(*) as rejects by dstPort
| sort rejects desc
| limit 20
```

The second query is directly tied to today's diagnosis. If you group communication with the same peer by direction, the **asymmetric pattern where only one direction is REJECT shows up as a table.** In this table, if the row whose `dstPort` is the service port (443, etc.) is ACCEPT but the row whose `dstPort` is in the ephemeral port range is REJECT, the diagnosis ends right there.

When you send Flow Logs to CloudWatch Logs, ingestion, storage, and metric-filter evaluation costs grow quickly in proportion to traffic volume. So a configuration that sends all traffic to CloudWatch is usually the wrong answer. The practical standard is to split in two: **only the narrow scope needed for alarms to CloudWatch, everything to S3**, and widen the scope temporarily only for the short period when diagnosis is needed and then revert. However, as noted earlier, this "temporary widening" means deleting and recreating the flow log, so it is more practical to turn on two flow logs in parallel from the start (S3 all + CloudWatch REJECT).

> 🎯 **Scenario**: "GuardDuty detected a Bitcoin mining (CryptoCurrency) threat on an EC2 instance. What do you check with Flow Logs?" — (1) among that ENI's egress ACCEPTs, communication to known mining pool ports/IPs, (2) identify the actual instance with `pkt-srcaddr`, (3) periodic beacon patterns (small communications at regular intervals). If GuardDuty is the "what," Flow Logs provide evidence of the "how and how much." The two are complementary.

There is a pattern where Flow Logs become decisive evidence in a data exfiltration investigation. A normal workload has stable communication destinations. But if one day an instance starts egressing GB-scale data to an external IP it didn't normally use, that is the moment of exfiltration. If you retain months of Flow Logs in S3, you can work backward from the moment you noticed the incident and reconstruct a timeline of "when the abnormality began." Without logs, this timeline itself is impossible.

## Building Real-Time Alarms with CloudWatch

```
# Metric Filter: alarm if REJECT exceeds a threshold
Filter pattern: [version, account, eni, src, dst, srcport, dstport="22", protocol, packets, bytes, start, end, action="REJECT", status]
→ convert to a metric → CloudWatch Alarm → SNS → notify the security team
```

Sending Flow Logs to CloudWatch can make costs grow quickly (ingestion, storage, metric-filter evaluation). So in practice the standard is to split in two: **narrow the traffic-type to REJECT** when sending to CloudWatch (for alarms), and send all (ALL) to S3 (for retention and Athena). Also, GuardDuty consumes Flow Logs internally, so with GuardDuty turned on, a good number of network threats are detected without separate Flow Logs analysis. However, GuardDuty does not store Flow Logs in the user's account, so for forensic retention you must turn on Flow Logs separately.

## Wrap-Up

Today's key points are four. First, Flow Logs record traffic **metadata** (who-to-whom-which port-allow/deny) without the payload, and you must look at **both** ACCEPT and REJECT to see a breach. Second, read the log not as a single line but as a **round-trip pair** — the moment you match two rows whose source/destination and ports are flipped like a mirror, half the diagnosis is done. Third, to know the real original behind NAT you must add `pkt-srcaddr` to the custom format, and this is the key to identifying the exfiltrating host. Fourth, split destinations by purpose into CloudWatch (quick diagnosis, alarms), S3 + Athena (large-scale analysis), and Kinesis (SIEM), but do not send everything to CloudWatch.

The sentence to take away from today's diagnosis compresses into one. **Only a NACL creates an asymmetric failure.** The shape of inbound ACCEPT + outbound REJECT cannot be made by an SG that remembers the request, and the cause is almost always the NACL's ephemeral port rule. And there is something to check even before that — **the case where there is no row at all in the log.** This is not "blocked" but "never arrived," and no amount of opening the SG and NACL fixes it. You must look at routing and name resolution.

Also remember that of the decisions at turn-on, the format, aggregation interval, target, and destination cannot be changed later, and that you must never read `NODATA` (no traffic) and `SKIPDATA` (dropped due to capacity issues) as the same thing. Mistaking the latter for the former leads to the opposite conclusion, "nothing happened."

Flow Logs are visibility, not control — they cannot block but they see. The work of gathering these logs from multiple accounts into one place, guaranteeing the integrity of the retained copies, and reconstructing an incident from months ago on a time axis is passed to **Week 7's audit and logging topic**. Today goes only as far as opening the eyes. In the next note, we look at **private connectivity (VPC Endpoint, PrivateLink)**, which seals off the data exfiltration path itself.

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
