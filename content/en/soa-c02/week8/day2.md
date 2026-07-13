# Day 2 - Three Tools for Observing VPC Traffic, and the Limits of Metadata

Once you create a VPC and launch instances, traffic begins to flow. But when you try to see "what's flowing right now," you suddenly feel lost. Operators ask three questions most frequently: ① Who is communicating with whom and how much, ② What is the actual content of suspicious packets, ③ Can this instance truly reach that RDS database. AWS provides a different tool for each question: Flow Logs, Traffic Mirroring, Reachability Analyzer. At first glance, the names seem similar, but their essence is completely different.

This section doesn't aim to explain what the tools are, but to understand **why they were built separately**, at what level of data abstraction each operates, and what criteria operators should use to decide "which tool to enable first." From an exam perspective, Flow Logs' unrecorded traffic (the 169.254.x.x trap) appears most frequently, but in practice, knowing when to use all three tools together matters more.

## Metadata vs Packets vs Simulation — Three Levels of Abstraction

The three tools can be summarized in one table:

| Tool | Data | Cost | Analysis Target |
|------|--------|------|-----------|
| Flow Logs | Metadata (5-tuple + bytes/action) | Cheap (Logs/S3 storage) | Who communicates with whom and how much |
| Traffic Mirroring | Actual packets (payload included) | Moderate (traffic replication) | What flows |
| Reachability Analyzer | Simulation (policy & routing evaluation) | Per-analysis charge | Can reach or not |

These three observe different layers of the OSI model. Flow Logs see up to L3/L4 (IP, port, protocol); Traffic Mirroring sees all the way to L7 (HTTP headers, body); Reachability Analyzer doesn't look at packets themselves but examines **policy graphs** (connections between SG, NACL, Route Table, IGW). When choosing a tool, you must first ask "what abstraction level's answer do I need?"

> 💡 **Related Theory**: The three levels of network observation started in the 1990s with NetFlow (Cisco, 1996) and sFlow (InMon, 2001). NetFlow standardized flow-level metadata (the direct ancestor of AWS Flow Logs); sFlow standardized packet sampling. Later, IETF formalized NetFlow as IPFIX (RFC 7011, 2008), and AWS Flow Logs has a field structure very similar to IPFIX. Traffic Mirroring follows the same model as Cisco SPAN/RSPAN (remote switch port mirroring), while Reachability Analyzer is AWS's implementation of the academic "Network Verification" flow (NetKAT, Batfish, etc.).

## Flow Logs — The Standard of the 5-Tuple Era

Flow Logs records a **summary** of all traffic flows passing through an ENI. One line's format looks like:

```
2 123456789012 eni-abc 10.0.1.5 8.8.8.8 51234 53 17 1 76 1748000000 1748000060 ACCEPT OK
```

How to read it: version=2, account, ENI, src IP, dst IP, src port, dst port, protocol(17=UDP), packets, bytes, start/end Unix time, action(ACCEPT/REJECT), log-status. One line represents one "flow" — more precisely, the **aggregate of flows with the same 5-tuple during the aggregation interval (default 10 minutes or 1 minute)**. Within the same time period, the same src/dst/port/proto combination gets combined into one line.

This fact has two implications. First, **individual packets are not visible** — 10,000 packets summarized in one line means payload, inter-packet timing, TCP options all disappear. Second, **it's not real-time** — you wait 10 minutes for aggregation before data arrives at S3 or CloudWatch Logs, so typically 5-15 minutes delay (using 1-minute aggregation still causes 1-3 minutes delay).

### The Unrecorded Traffic Trap

The most frequent trap in exams is "traffic not recorded in Flow Logs." There are exactly five types:

- AWS DNS resolver (`169.254.169.253`) — DNS traffic provided by VPC
- Instance Metadata Service (`169.254.169.254`) — IMDS v1/v2
- Time Sync Service (`169.254.169.123`) — NTP
- Windows license activation (`169.254.169.250`, `.251`)
- DHCP to default VPC router

Why are these missing? **AWS internal infrastructure traffic** — the hypervisor doesn't send it to ENI queue but processes it directly in the mapping service. Since it doesn't pass through ENI, Flow Logs capturing at ENI level can't see it either. Operators often debug "why isn't IMDS call visible" and get stuck for a while, but this is design, not a bug.

> ⚠️ **Trap**: The fact that 169.254.x.x traffic doesn't show is an exam favorite, but **TCP RST and SYN-only packets also sometimes don't appear**. Specifically, packets immediately rejected by the hypervisor at the ENI (e.g., when there's no matching listening socket and the hypervisor blocks before OS sends RST) are partially omitted. This isn't exam scope, but knowing it in real operations saves debugging time.

### Storage — CloudWatch Logs vs S3

Where you send Flow Logs determines operational cost and analysis speed:

| Aspect | CloudWatch Logs | S3 (Parquet) | Firehose → OpenSearch |
|------|-----------------|--------------|----------------------|
| Storage cost | About $0.50/GB ingest + $0.03/GB/month | $0.023/GB/month | Firehose + ES cost |
| Query | Logs Insights | Athena | Kibana |
| Alarms | Metric Filter → CloudWatch Alarm | Requires setup | Requires setup |
| Delay | 1-3 minutes | 5-15 minutes | 1-5 minutes |
| Best suited for | Real-time alarms, short retention | Long-term storage, compliance | Dashboards |

In large-scale environments, **S3 Parquet + Athena** is overwhelmingly cheaper. When storing 1TB of Flow Logs for a month, CloudWatch Logs costs about $530, S3 Parquet about $25. Moreover, Parquet's column-oriented compression means Athena queries scan 5-10x fewer bytes than row-based text — query costs drop proportionally.

> 🔍 **Deeper Dive**: Parquet is favorable for Athena for two reasons. First, **column-wise compression** (snappy/gzip/zstd) gives good compression ratios. Second, **predicate pushdown** — when you run a `WHERE action='REJECT'` query, Athena looks at Parquet metadata and doesn't open files where the action column contains only ACCEPT. Plus, AWS Flow Logs' Parquet format supports **Hive-compatible partitioning** (year=YYYY/month=MM/day=DD/hour=HH), so `WHERE year=2026 AND month=05` queries skip partitions from other dates entirely. Well-designed queries might scan only 1MB from 1TB of data.

### Logs Insights vs Athena — Which One?

You can query the same data with both tools. What's the difference?

**Logs Insights** is CloudWatch Logs' own SQL-like language, running on its own indexing structure. Queries are limited to 60 minutes of data or 10,000 results, with query time around 5-30 seconds. **Best for real-time troubleshooting**.

**Athena** uses standard SQL based on Presto/Trino, scanning all data in S3. Unlimited data size, all standard SQL features (JOIN, window functions, CTE), can JOIN with other datasets. Downsides: **first query is slow** (5-10 seconds for partition metadata loading) and **per-scanned-byte pricing** ($5/TB). **Best for long-term analysis, reports, dashboards**.

Operational pattern: Use Logs Insights for real-time alarms and debugging, Athena for monthly security audits and traffic trend analysis.

```sql
-- Logs Insights: Top 20 rejected traffic in past 1 hour
fields @timestamp, srcAddr, dstAddr, dstPort, action
| filter action = "REJECT"
| stats count(*) as rejects by srcAddr, dstPort
| sort rejects desc
| limit 20

-- Athena: Most traffic-intensive instances in past 30 days
SELECT instance_id, sum(bytes) / 1e9 as gb
FROM vpc_flow_logs
WHERE year=2026 AND month=5
GROUP BY instance_id
ORDER BY gb DESC
LIMIT 10;
```

## Logs Insights Query Patterns — Five Patterns Operators Use Daily

There are repeatedly-used queries in operational environments. Most fall into these five patterns.

**① Top Rejected Traffic — Attack Detection**

```
fields @timestamp, srcAddr, dstAddr, dstPort
| filter action = "REJECT"
| stats count(*) as rejects by srcAddr, dstPort
| sort rejects desc | limit 20
```

If REJECT floods from the same src across multiple dstPorts, it's a port scan attempt. If thousands come from the same src to the same dstPort, it's likely brute-force.

**② Top Talker — Tracking Cost Leaks**

```
fields bytes
| stats sum(bytes) / 1e9 as gb by srcAddr
| sort gb desc | limit 10
```

When NAT GW costs spike, who's sending the most data? Often it's unintended S3 sync jobs or backup scripts.

**③ Communication Targets of Specific Instance**

```
filter interfaceId = "eni-abc"
| stats sum(bytes) as totalBytes by dstAddr, dstPort
| sort totalBytes desc
```

One glance shows which hosts an instance communicates with. Essential during security incident investigation to understand a quarantined host's communication patterns.

**④ Traffic Patterns Over Time**

```
stats sum(bytes) / 1e9 as gb by bin(5m)
| sort @timestamp asc
```

Traffic spikes at specific hours. Identifies timing of cron jobs or ETL tasks.

**⑤ pkt-srcaddr vs srcAddr Difference — Tracking NAT**

Including `${pkt-srcaddr}` in custom format shows the original IP before NAT. Essential for tracking instances behind NAT GW:

```
fields srcAddr, pktSrcAddr, dstAddr, dstPort
| filter srcAddr = "10.0.100.50"   # NAT GW IP
| stats count(*) by pktSrcAddr     # Actual source instances
```

> 📚 **Case Study**: In the 2019 Capital One data breach, attackers bypassed WAF and stole IMDS credentials to exfiltrate S3 data. Capital One had Flow Logs enabled but no alarms, so detection took days. Later analysis with Logs Insights clearly showed abnormally large outbound traffic compared to baseline. Post-incident, AWS strengthened GuardDuty's "Exfiltration" detection rules, making Flow Logs + GuardDuty combination the standard recommendation. Setting up Logs Insights + Metric Filter + CloudWatch Alarm for "outbound bytes from one ENI exceed 5x baseline" is the first step.

## Traffic Mirroring — New Possibilities Created by the Nitro Chip

When Flow Logs aren't enough — when you **must see packets themselves** — use Traffic Mirroring. It copies actual packets passing through an ENI to another ENI or NLB. Place IDS tools like Suricata or Zeek at the destination to perform deep analysis of HTTP headers through TLS handshakes.

The key constraint: **Only Nitro-based instances are supported**. Why? Because it connects to the SDN architecture explained in Day 1 — the Nitro Card sees packets, so copying is possible. Pre-Nitro instance types (c4, m4, r4 and earlier generations before 2017) had hypervisors seeing packets, but the Traffic Mirroring API wasn't exposed. Post-Nitro, the SDN chip exposed this as standard API, making it possible.

### Four Components

| Component | Role |
|----------|------|
| Mirror Source | ENI whose packets to copy (Nitro instance ENI) |
| Mirror Target | ENI or NLB receiving the copy |
| Mirror Filter | Which traffic to copy (5-tuple based) |
| Mirror Session | Source + Target + Filter bundle |

The fact that Mirror Filter is 5-tuple based matters — Filter Rules evaluate in number order like NACL, **first match wins**. So you encounter the 100, 110, 120 convention again (the BASIC line numbering pattern from Day 1 shows up here too).

It's also operationally important that Mirror Target can be an NLB. When you have multiple analysis instances, NLB distributes load and if one analysis instance dies, others still receive. A single ENI target is a SPOF.

### Cost and Operational Traps

Traffic Mirroring charges **separately for duplicating traffic**. If you mirror a 100Mbps flow, 100Mbps of additional traffic is generated. Plus, if the mirror target is in different AZ or different VPC, cross-AZ/cross-VPC data transfer charges apply. Operators often fall into the trap of thinking "mirroring just one suspicious instance will be cheap" — only to discover that instance is a general web server with tremendous traffic.

Recommended operational pattern: ① Use Mirror Filter to narrow to suspicious protocols only (e.g., TCP/445 SMB), ② Enable for short periods then disable, ③ Measure source traffic volume beforehand since analysis instances have processing limits.

> 🔍 **Deeper Dive**: When Traffic Mirroring copies packets, it applies **VXLAN encapsulation**. The original packet doesn't go as-is; it adds VXLAN header (8 bytes) + UDP header (8 bytes) + IP header (20 bytes) = 36 bytes overhead. So in MTU-constrained environments, mirrored packets may experience fragmentation. The analysis instance's OS must decapsulate VXLAN to see the original packet — Suricata/Zeek usually handle this automatically, but self-built capture tools need explicit configuration.

## Reachability Analyzer — Getting Answers Without Packets

"Why can't this EC2 access RDS?" is a question operators face daily. The checklist is long — SG, NACL, Route Table, IGW/NAT routing, Transit Gateway routing, VPC Peering status, DNS resolution, instance OS firewall. Checking manually takes 30 minutes; if you guess wrong, it's an hour. Reachability Analyzer answers this through **policy graph analysis in 30 seconds**.

The principle: it doesn't send packets. Internally, AWS models every hop between source and destination as a graph, evaluating whether policies allow or block passage at each hop. The result comes in this form:

```
Path: i-source → SG-source → Subnet RT → IGW → ... → SG-dest → i-dest
Status: Not Reachable
Blocking component: SG-dest (no 80/tcp in inbound rules)
```

This single line replaces 30 minutes of debugging. For exam answers, "what should you look at first for connectivity issues?" is almost always Reachability Analyzer.

### Point-to-Point vs Broad-Scale — Network Access Analyzer

Reachability Analyzer is **point-to-point** analysis between two resources. "This EC2 and that RDS" in 1:1 relationship. But from security audit perspective, "all instances directly reachable from the Internet" is a broader, more important question. That's **Network Access Analyzer's** role.

NAA defines an **Access Scope** query — like "Source = IGW, Destination = all EC2 instances, Protocol = TCP/22". Then AWS scans all possible paths and returns matching cases as a list.

| Tool | Question Type | Use Scenario |
|------|-----------|---------------|
| Reachability Analyzer | "Can A reach B?" | Troubleshooting (1:1) |
| Network Access Analyzer | "All paths reachable from outside?" | Security audit (broad-scale) |

Running NAA regularly on large environments auto-detects "instance that was secure yesterday but exposed by IGW due to new SG today." It's typical to combine with Config Rule or Lambda scheduled execution.

> 💡 **Related Theory**: Reachability Analyzer's algorithm comes from academia's **Network Verification** field. In early 2010s, Stanford's Header Space Analysis (HSA) and later NetKAT (Cornell) and Batfish (Princeton/Intentionet) solved the same problem — "model network policies with SMT solver or BDD to determine reachability." AWS integrated this academic technique into SDN control plane and commercialized it. A recommended paper: "A General Approach to Network Configuration Analysis" (Fogel et al., NSDI 2015) — Batfish's original paper with a similar direction to Reachability Analyzer.

## IPAM — IP Governance in Multi-Account Environments

As operational environments grow, **IP address conflicts** become a new problem. With 50 accounts creating 100 VPCs, someone inevitably uses `10.5.0.0/16` in two places, and when connecting those two VPCs with Transit Gateway, routing becomes impossible. CIDR conflicts, once they happen, require rebuilding one VPC to resolve — all instance IPs change, meaning downtime + configuration changes + testing.

IPAM (IP Address Manager) solves this. Define IP Pools centrally ("`10.0.0.0/8` for prod, `172.16.0.0/12` for dev") and enforce each account/region auto-allocates from those pools. It integrates with AWS Organizations, allowing SCP like "prohibit VPC creation outside IPAM."

```
IPAM Top Pool: 10.0.0.0/8
├── Regional Pool (us-east-1): 10.0.0.0/12
│   ├── Account A VPC: 10.0.0.0/16 (auto-allocated)
│   └── Account B VPC: 10.1.0.0/16
└── Regional Pool (eu-west-1): 10.16.0.0/12
    └── Account C VPC: 10.16.0.0/16
```

IPAM also **tracks usage** — "70% of pool currently in use; next VPC in prod region will be auto-rejected." This alerts to IP exhaustion in advance. Like Slack's 2020 NAT incident, IP limit issues are usually discovered after outages hit. IPAM enables pre-incident alarms.

## Summary

Three tools for observing VPC traffic — Flow Logs, Traffic Mirroring, Reachability Analyzer — operate at different abstraction levels: **metadata, packets, simulation**. Operators must first decide what question they're trying to answer, then choose the appropriate tool. "Who communicates with whom?" → Flow Logs; "what flows?" → Traffic Mirroring; "can it reach?" → Reachability Analyzer.

Remember just two traps. ① Flow Logs don't see 169.254.x.x AWS internal traffic — because the hypervisor handles it directly without passing through ENI. ② Traffic Mirroring only supports Nitro instances — the architectural result that the SDN chip must see packets to copy them.

Next, we'll look at how VPC communicates with the outside world — NAT Gateway, VPC Endpoint, PrivateLink. If you discovered NAT GW cost explosion with Flow Logs, the next step is deciding "which traffic should we bypass NAT for?"

---

## 📝 Practice Problems

**Problem 1.** An EC2 in a private subnet fails external API calls. What tool to use first?

A) Wireshark packet capture
B) Reachability Analyzer to simulate EC2 → IGW (or NAT GW) path
C) Inspector vulnerability scan
D) GuardDuty threat analysis

**Answer: B**

Explanation: First-priority tool for connectivity troubleshooting. It analyzes policy graphs (SG, NACL, Route Table, IGW) without actually sending packets, providing per-hop decision rationale in under 30 seconds. It pins down specific blocking points like "SG-dest inbound 80 missing." Wireshark requires actual packet flow to be meaningful (if not flowing, that's the problem), and Inspector/GuardDuty are security tools, not connectivity diagnostic tools.

---

**Problem 2.** VPC Flow Logs are enabled, but IMDS calls to 169.254.169.254 don't appear. Why?

A) Insufficient IAM permissions
B) Flow Logs limitation — 169.254.x.x AWS internal traffic (DNS, IMDS, Time Sync) doesn't pass through ENI and is unrecorded
C) Traffic sampling is applied
D) CloudWatch Logs transmission delay

**Answer: B**

Explanation: Flow Logs captures traffic through ENI. But 169.254.x.x AWS internal services (DNS resolver .253, IMDS .254, Time Sync .123, Windows licensing .250/.251) are handled directly by the hypervisor's mapping service without going through ENI queue. Therefore, they're not capture targets. This is intentional design, not a bug — an exam favorite trap. For IMDS call tracking, look at OS-level logs (e.g., cloud-init log) or CloudTrail's IAM API calls instead.

---

**Problem 3.** Security team needs to capture actual HTTP headers and body from a suspicious instance for IDS analysis. Which tool?

A) Flow Logs with 5-tuple filtering
B) Traffic Mirroring (Mirror Source = ENI, Target = NLB → Suricata/Zeek analysis instances)
C) Reachability Analyzer
D) GuardDuty

**Answer: B**

Explanation: The key is "actual packet payload" is needed. Flow Logs records only metadata (5-tuple + bytes/action), so HTTP headers and body aren't visible. Traffic Mirroring copies actual ENI packets to the analysis target. NLB on the receiving side load-balances across multiple analysis instances, avoiding single failure points. Downsides: Nitro instances only, and traffic replication incurs additional cost — using Mirror Filter to narrow to suspicious protocols is the standard operational practice.

---

**Problem 4.** You retain Flow Logs long-term and need to analyze them cost-effectively. What combination is most suitable?

A) CloudWatch Logs + Logs Insights
B) S3 (Parquet format, Hive partitioning) + Athena
C) DynamoDB + Lambda
D) ElastiCache + custom analysis

**Answer: B**

Explanation: Cost difference is overwhelming. Storing 1TB of Flow Logs for a month costs about $530 with CloudWatch Logs, about $25 with S3 Parquet — 20x difference. Parquet's column-oriented compression means Athena queries scan 5-10x fewer bytes than row-based text, proportionally reducing query costs ($5/TB). With Hive-compatible partitioning (year/month/day/hour) enabled, time-range queries skip partitions from other dates entirely. CloudWatch Logs + Insights suits real-time alarms and short retention; S3 + Athena is the standard for long-term analysis.

---

**Problem 5.** Your company wants to periodically auto-check "all instances directly reachable from the Internet" in operational VPC. Most appropriate tool?

A) Reachability Analyzer (point-to-point simulation)
B) Network Access Analyzer + Access Scope (broad-scale policy scanning)
C) Inspector
D) Config Rule

**Answer: B**

Explanation: Reachability Analyzer is 1:1 point-to-point simulation ("can A reach B?"), unsuitable for "all possible paths." Network Access Analyzer defines Access Scope ("Source=IGW, Destination=all EC2 instances") and auto-discovers all matching paths. Regular execution auto-detects "instance unintentionally exposed by IGW due to new SG added." Typical to automate via Lambda schedule and send results to Security Hub for compliance reporting. Config Rule checks resource configuration consistency, not network path analysis.

---

**Problem 6.** Operator wants to see "most rejected dst ports in past 1 hour" using Logs Insights. Most appropriate query?

A) `fields @timestamp | filter action="ACCEPT" | stats count(*) by srcAddr`
B) `fields @timestamp, dstPort, action | filter action="REJECT" | stats count(*) as rejects by dstPort | sort rejects desc | limit 20`
C) `SELECT * FROM logs WHERE port > 1024`
D) `fields @message | parse @message`

**Answer: B**

Explanation: Standard Logs Insights query pattern. `filter` to get REJECT only, `stats count(*) by dstPort` to aggregate by port, `sort desc + limit` for top 20. If REJECT floods from same src across multiple dst ports, it's port scanning. If concentrated on single dst port, it's likely brute-force attempt. A checks ACCEPT, wrong for rejection analysis. C uses SQL syntax (for Athena), not Logs Insights syntax. D is for unstructured log parsing; unnecessary for structured data like Flow Logs.

---

**Problem 7.** What's IPAM's most critical value?

A) Allocates IP addresses faster
B) Prevents CIDR conflicts in multi-account environments + tracks usage centrally
C) Increases instance count
D) Automates routing

**Answer: B**

Explanation: IPAM has nothing to do with IP allocation speed. Its core value is governance — in 50-account 100-VPC environments, it prevents the accident of someone using `10.5.0.0/16` in two places. Once CIDR conflicts occur, resolving requires rebuilding one VPC — downtime + all instance IP changes + configuration changes + testing. IPAM auto-allocates from central Pools to prevent conflicts, and 70%/90% usage alarms warn of IP exhaustion in advance. Integrated with Organizations, it can enforce "VPC creation outside IPAM prohibited" via SCP.

---
