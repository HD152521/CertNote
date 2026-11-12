# Day 3 - VPC Flow Logs and Network Logging: Detecting Breaches/Misconfig via Traffic, Route 53 Resolver Query Logs

CloudTrail watches the control plane (API), and Config watches configuration state. But "what packets actually flowed where" is something neither of them sees. **VPC Flow Logs** fills that gap. Flow Logs record *metadata* (the 5-tuple, byte counts, accept/reject, and so on) of IP traffic entering and leaving an ENI (Elastic Network Interface). They do not capture the packet *payload* - that is the territory of Traffic Mirroring.

On security exams, Flow Logs are the primary evidence for "detecting anomalous traffic," "diagnosing security group and NACL misconfiguration," "detecting data exfiltration," and "tracing rejected connections."

One reason the 2019 Capital One breach is cited again and again in cloud security training is that **each stage of the breach left traces only in a different log**. Exploitation of the SSRF vulnerability at the application layer left traces in the application and WAF logs, the use of role credentials obtained from the instance metadata left traces in CloudTrail, and the fact that data actually left the environment left traces at the network layer. If you had looked at only one of those logs, all you would have seen was "a role with legitimate permissions called legitimate APIs." What network logging means in this incident is that it is the *last line of detection* - when the credentials are valid and the API calls are valid, the only place where the anomaly shows up is the shape of the traffic: "an unusual amount went to a place that normally receives nothing."

## Flow Log Capture Scope and Destinations

Flow Logs can be enabled at three levels, and lower-level resources inherit from the higher level:
- **VPC level**: every ENI in that VPC.
- **Subnet level**: every ENI in that subnet.
- **ENI level**: an individual interface.

Delivery destinations are **CloudWatch Logs, S3, and Kinesis Data Firehose**. S3 suits high-volume, long-term retention and Athena analysis; CloudWatch Logs suits real-time metrics and alarms.

```
# Default format field order
version account-id interface-id srcaddr dstaddr srcport dstport
protocol packets bytes start end action log-status
```

```
2 111122223333 eni-0abc 203.0.113.10 10.0.1.20 49152 22 6 20 4800 1719216000 1719216060 REJECT OK
2 111122223333 eni-0abc 10.0.1.20 198.51.100.5 443 49321 6 5000 7340032 1719216000 1719216060 ACCEPT OK
```

- `action`: `ACCEPT` (allowed by the security group/NACL) or `REJECT` (denied).
- `log-status`: `OK` (normal), `NODATA` (no traffic), `SKIPDATA` (some records skipped because capacity was exceeded).

### Reading One Line All the Way Through

Fully decomposing the second line above field by field gives the following. Exams include question types that hand you a log row and ask you to interpret it, so it is faster to memorize the order.

```
2 111122223333 eni-0abc 10.0.1.20 198.51.100.5 443 49321 6 5000 7340032 1719216000 1719216060 ACCEPT OK
│ │            │        │         │            │   │     │ │    │       │          │          │      │
│ │            │        │         │            │   │     │ │    │       │          │          │      └ log-status
│ │            │        │         │            │   │     │ │    │       │          └ end (Unix time)
│ │            │        │         │            │   │     │ │    │       └ start (Unix time)
│ │            │        │         │            │   │     │ │    └ bytes  = 7,340,032 (about 7 MB)
│ │            │        │         │            │   │     │ └ packets = 5,000
│ │            │        │         │            │   │     └ protocol = 6 (TCP)
│ │            │        │         │            │   └ dstport = 49321
│ │            │        │         │            └ srcport = 443
│ │            │        │         └ dstaddr (destination)
│ │            │        └ srcaddr (source)
│ │            └ interface-id (which ENI it passed through)
│ └ account-id
└ version
```

What this one line says is: "From port 443 of internal host 10.0.1.20, about 7 MB went out to an ephemeral port of external host 198.51.100.5 over 60 seconds, and it was allowed." **The fact that `srcport` is 443** is the key clue - 443 being the source port means this flow is in the direction of *a server responding to a client*, so it reads as "our web server sent 7 MB down to an external client." Conversely, if `dstport` had been 443, it would be "a request going from inside to an external HTTPS service." Reading the direction backwards in an exfiltration investigation is a surprisingly common mistake.

| Protocol number | Protocol | Meaning from a security viewpoint |
|--------------|---------|---------------------|
| 1 | ICMP | Suspect scanning or tunneling when it occurs in large volume |
| 6 | TCP | Most application traffic |
| 17 | UDP | DNS (53), VPN, and also DNS tunneling |
| 47 / 50 / 51 | GRE / ESP / AH | A sign that an unexpected VPN or tunnel is up |

`tcp-flags` (a custom-format field) arrives as a bitmask. The value itself becomes a detection rule.

| Value | Flag | What it means |
|----|-------|--------------|
| 2 | SYN | Connection attempt. **Lots of SYN only = port scan** |
| 18 | SYN-ACK | Connection accepted. It means the scan *succeeded*, so it is more serious |
| 1 | FIN | Normal termination |
| 4 | RST | Refusal or abnormal termination. A surge of RSTs is the fingerprint on the other side of a scan |

> ⚠️ **Pitfall**: `bytes` is the **cumulative bytes** observed in that aggregation interval, not the size of a single request. Also, Flow Logs collect flows and flush them per **aggregation window (about 10 minutes by default, 1 minute if configured)**, so one long connection appears split across several rows. If you judge the amount of exfiltrated data from the `bytes` of a single row, you will badly underestimate the real scale. You must group by `srcaddr`, `dstaddr`, and port and compute the **sum over the period**. For the same reason, Flow Logs cannot be used for "block this packet right now" - by the time the log arrives, that connection has already ended.

### Traffic That Is Not Recorded: Know the Blind Spots in Advance

If you believe Flow Logs capture *all* traffic, you will reach wrong conclusions in an investigation. Some things are excluded by design.

| Not recorded | Why it matters |
|-----------------|------------|
| Communication with the instance metadata service (169.254.169.254) | **There is no trace in the Flow Log of credentials stolen via SSRF** |
| Queries to the Amazon-provided DNS server | DNS visibility must be handled by Resolver query logs |
| DHCP traffic | - |
| Amazon Time Sync Service communication | - |
| Windows license activation traffic | - |
| Traffic to the VPC router reserved IP | - |

The first row is decisive on a security exam. A metadata service call happens inside the instance to a link-local address, so it is not recorded as a flow passing through the ENI. In other words, **you cannot see with Flow Logs the fact that "the instance took credentials out of the metadata service."** What fills this blind spot is enforcing IMDSv2 (prevention) and checking in CloudTrail *where* that role's credentials were used (detection). The second row follows the same logic - because queries to the Amazon-provided DNS do not appear in the Flow Log, DNS visibility is handled separately by the Resolver query logs covered later today.

> ⚠️ **Pitfall**: Once a flow log is created, its **format, fields, and aggregation interval cannot be modified later.** To change them you must delete it and create a new one, and traffic in between is not recorded. So when you first create it, it is better to include the fields you need generously in a custom format - in particular, `pkt-srcaddr`, `pkt-dstaddr`, `flow-direction`, `traffic-path`, `tcp-flags`, and `instance-id` are fields you will definitely miss later. In log design, "turn it on with the defaults for now and add more later" almost always costs you.

Flow Logs record **only metadata**. If a question says "inspect the packet contents to find malware signatures," the answer is not Flow Logs but **VPC Traffic Mirroring** (replicate full packets and analyze them with an IDS/IPS). Also, Flow Logs are *not a real-time capture* - they are collected and flushed per aggregation window (about 10 minutes by default, or 1 minute) - so they are not a tool for immediate packet-level blocking.

## Custom Format and Deep Visibility Fields

Beyond the default format, you can add extra fields with a **custom format**, and these are the heart of both exams and real-world practice:
- `vpc-id`, `subnet-id`, `instance-id`: which resource it was.
- `tcp-flags`: the SYN/ACK/FIN/RST flags - useful for detecting port scans (lots of SYN only).
- `pkt-srcaddr` / `pkt-dstaddr`: the *original* addresses behind NAT or a load balancer (`srcaddr`/`dstaddr` are from the ENI's point of view).
- `flow-direction`: `ingress`/`egress`.
- `traffic-path`: through which path (IGW, NAT, VPC peering, TGW, and so on) the egress traffic left.

The distinction between `pkt-srcaddr` and `srcaddr` touches *address translation transparency*, a core concept in security analysis. When several instances go out through a NAT gateway with the same public IP, `srcaddr` alone cannot tell you which instance communicated with the outside. You need `pkt-srcaddr` (the original private IP before NAT) to pinpoint the true source of data exfiltration. To answer "which EC2 instance talked to the C2 server?" in a breach investigation, this field is decisive.

```
[ How the same communication is recorded differently before and after NAT ]

  10.0.1.20 ─┐
  10.0.1.21 ─┼─▶ NAT GW (203.0.113.9) ─▶ Internet (198.51.100.5)
  10.0.1.22 ─┘

  Flow seen at the NAT's ENI :  srcaddr=203.0.113.9   pkt-srcaddr=10.0.1.21
                                 └ cannot tell the three apart   └ the true source is here

  Flow seen at the instance ENI: srcaddr=10.0.1.21    pkt-srcaddr=10.0.1.21
                                 └ here the two are the same
```

If you enable the flow log at the VPC level, the same communication is recorded twice, at **both** the NAT's ENI and the instance's ENI. The answer to "why does the traffic look doubled?" in an investigation is usually this, and at the same time this is the mechanism that makes exfiltration tracing possible.

### A Good Combination to Enable in a Custom Format

```bash
aws ec2 create-flow-logs \
  --resource-type VPC --resource-ids vpc-0abc1234 \
  --traffic-type ALL \
  --log-destination-type s3 \
  --log-destination arn:aws:s3:::central-network-logs/vpc-flow/ \
  --max-aggregation-interval 60 \
  --log-format '${version} ${account-id} ${vpc-id} ${subnet-id} ${instance-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${tcp-flags} ${packets} ${bytes} ${start} ${end} ${action} ${log-status} ${pkt-srcaddr} ${pkt-dstaddr} ${flow-direction} ${traffic-path}'
```

`traffic-path` tells you, as a number, *which path* egress traffic took out - directly through an internet gateway, through NAT, via VPC peering, via Transit Gateway, via VPN, or via Direct Connect. The reason this field matters in an exfiltration investigation is that it lets you ask **"did it leave through an approved path?"** If traffic from an account that permits only private connectivity went out through the internet gateway path, that is itself a policy violation, and it is a fact you cannot learn from the destination IP alone if you do not know the path.

Before `flow-direction` was added, analysts had to *infer* direction from port numbers and addresses, and that inference was often wrong. Recording direction explicitly means more than mere convenience - it lets you scope detection rules precisely with conditions like **"among flows going from inside to outside."** Most data exfiltration detection rules depend on direction. Even the same "10 GB transfer" may be a normal upload if it is ingress, and an incident if it is egress. In log schema design, *a field that records what you would otherwise have to infer* always raises detection accuracy by a notch.

## Detecting Breaches and Misconfiguration via Flow Logs

**Misconfiguration diagnosis** - "The connection fails; is it an SG problem or a NACL problem?":
- If you see `REJECT` in the Flow Log, an SG or NACL blocked it. An SG is *stateful*, so when inbound is allowed the response is automatically allowed, but a NACL is *stateless*, so inbound and outbound (including ephemeral ports) must be opened separately. If `REJECT` appears in only one direction, suspect an asymmetric NACL rule.
- If it came in as `ACCEPT` but no response goes out, a common cause is that the NACL outbound ephemeral ports (1024-65535) are not allowed.

```
[ The gates a packet passes through and what is left in the Flow Log ]

  External client
       │  ① Request (dst 443)
       ▼
  ┌──────────────┐
  │ NACL inbound │  stateless - denied if not in the rules
  └──────┬───────┘         on deny → REJECT recorded
         ▼
  ┌──────────────┐
  │  SG inbound  │  stateful - if allowed, the response passes automatically
  └──────┬───────┘         on deny → REJECT recorded
         ▼
     Instance (processing)
         │  ② Response (src 443 → dst ephemeral port)
         ▼
  ┌──────────────┐
  │ SG outbound  │  ← not evaluated (stateful, response automatically allowed)
  └──────┬───────┘
         ▼
  ┌───────────────┐
  │ NACL outbound │ stateless - if the ephemeral ports (1024-65535)
  └──────┬────────┘   are not allowed, REJECT here
         ▼
     Out to the internet

  → Diagnostic rule: if inbound is ACCEPT but outbound is REJECT,
    the culprit is almost always the NACL ephemeral port rule. An SG cannot produce this symptom.
```

If you memorize this diagram, you can sort "the connection does not work" questions by looking at just two log lines. **An SG cannot produce an asymmetric failure; only a NACL can** - this one sentence is the whole diagnosis.

```sql
-- Athena: top source IPs of rejected SSH inbound attempts
SELECT srcaddr, count(*) AS attempts
FROM vpc_flow_logs
WHERE dstport = 22 AND action = 'REJECT'
  AND date >= '2026-06-20'
GROUP BY srcaddr
ORDER BY attempts DESC
LIMIT 20;
```

**Breach and exfiltration detection**:
- An instance that normally does not send anything outside egresses a large volume of `bytes` to an unknown IP → suspected data exfiltration.
- One source sends only SYN flags to many `dstport` values → port scan.
- An internal instance communicates with a known malicious IP or a cryptocurrency mining pool → C2/cryptojacking.

```sql
-- Exfiltration candidates: sum internal IPs that sent large volumes in the egress direction, by destination
SELECT pkt_srcaddr        AS internal_source,
       dstaddr            AS external_destination,
       dstport,
       sum(bytes)         AS total_bytes,
       count(*)           AS flow_records,
       min(from_unixtime(start)) AS first_seen,
       max(from_unixtime("end")) AS last_seen
FROM vpc_flow_logs
WHERE flow_direction = 'egress'
  AND action = 'ACCEPT'
  AND date >= '2026-06-20'
GROUP BY pkt_srcaddr, dstaddr, dstport
HAVING sum(bytes) > 1073741824      -- 1 GB or more
ORDER BY total_bytes DESC;

-- Port scan: a single source that threw only SYN at many destination ports in a short time
SELECT srcaddr,
       count(DISTINCT dstport) AS ports_touched,
       count(DISTINCT dstaddr) AS hosts_touched,
       sum(packets)            AS pkts
FROM vpc_flow_logs
WHERE tcp_flags = 2                  -- SYN only (not SYN-ACK=18)
  AND date = '2026-06-24'
GROUP BY srcaddr
HAVING count(DISTINCT dstport) > 50
ORDER BY ports_touched DESC;

-- Only the combinations where the scan "succeeded" - which services actually responded?
SELECT srcaddr, dstaddr, dstport, count(*) AS handshakes
FROM vpc_flow_logs
WHERE tcp_flags = 18                 -- SYN-ACK
  AND date = '2026-06-24'
GROUP BY srcaddr, dstaddr, dstport
ORDER BY handshakes DESC;

-- Traffic that left through an unapproved path (in an account where only private connectivity is allowed)
SELECT pkt_srcaddr, dstaddr, traffic_path, sum(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE flow_direction = 'egress'
  AND action = 'ACCEPT'
  AND traffic_path IN (1, 2)         -- via IGW / via another resource inside the VPC
GROUP BY pkt_srcaddr, dstaddr, traffic_path
ORDER BY total_bytes DESC;
```

The practical trick is to run the second and third queries **as a pair**. Lots of SYN-only (scan attempts) is common and mostly background noise from the internet, but combinations where SYN-ACK comes back from the same source (scans that *succeeded*) are far fewer and far more important. Put the detection priority on "success," not on "attempts."

> 🎯 **Scenario**: "An EC2 instance is sending a large amount of data to an unknown external IP, unlike usual. Which log do you use to diagnose it?" Answer: use VPC Flow Logs (with `pkt-srcaddr`, `bytes`, and `flow-direction=egress` in the custom format) to pinpoint the egress volume and the source instance. To automate further, GuardDuty analyzes Flow Logs, DNS, and CloudTrail to detect such patterns automatically (this connects to the later topics of weeks 7-8).

There is a misconception about GuardDuty. GuardDuty uses VPC Flow Logs, DNS logs, and CloudTrail as its underlying data, but **it does not work only if you have turned those logs on yourself.** GuardDuty obtains and analyzes this data independently, and even if you turn off your flow log, GuardDuty's detection continues. Then why enable flow logs separately? Because **GuardDuty tells you "this is strange" but does not put the original evidence in your hands.** To count "exactly how many bytes, to which port, at what hour and minute" went out during an investigation, you need the flow log you have kept. Detection (GuardDuty) and evidence (flow logs) do not replace each other - if the exam asks about "detection automation," the answer is GuardDuty; if it asks about "forensic evidence and detailed analysis," the answer is flow logs.

## Route 53 Resolver Query Logging: DNS-Level Visibility

A large share of network breaches leave traces in **DNS**. Malware looks up C2 domains and pulls data out through DNS tunneling. **Route 53 Resolver Query Logging** records the DNS queries that occur inside a VPC (which instance looked up which domain with which record type, and what the response was).

Delivery destinations are **CloudWatch Logs, S3, and Kinesis Data Firehose**.

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

Detection cases:
- A large number of TXT queries with abnormally long or random subdomains → **DNS tunneling** (data exfiltration).
- Lookups of known malicious domains → identify the infected instance.
- Many lookups of dynamic DNS or newly registered domains that were not seen before → C2 beacons.

DNS is a protocol that is *implicitly allowed* in almost every environment, so it is a covert channel attackers like. It is rare for a firewall to block port 53. DNS tunneling encodes data in the domain name itself to move it out (`<base32-encoded-data>.attacker.com`). The Resolver query log is almost the only network-level evidence for detecting this pattern (long subdomains with high entropy, abnormal query frequency), both after the fact and in real time. To block it actively, use **Route 53 Resolver DNS Firewall** to block lists of malicious domains.

Resolver query logging records only the DNS queries inside a VPC that **go through the Route 53 Resolver**. If an instance specifies an external DNS server directly (for example, 8.8.8.8), that query bypasses the Resolver and does not appear in the log. So the security baseline is to "force VPC DNS to go to the Resolver" (and block external DNS egress where possible) and to block malicious domains with DNS Firewall.

### From Recording to Blocking: Resolver DNS Firewall

If the query log *sees*, DNS Firewall *blocks*. You bundle domain lists (AWS managed threat lists or lists you create yourself) into rule groups, associate them with a VPC, and specify an action for each rule.

| Action | Result | When to use |
|------|------|----------|
| `ALLOW` | Pass | Explicit allow (in front of an allow list) |
| `ALERT` | Pass but mark it in the log | **The stage of observing impact before blocking** |
| `BLOCK` | Block | Actual blocking |

For `BLOCK`, you can also choose what to return to the client - `NODATA` (a response exists but no records), `NXDOMAIN` (no such domain), or `OVERRIDE` (redirect to another name you specify). The third is interesting. If you redirect lookups of malicious domains to a sinkhole server inside the organization, you can **block them and at the same time observe which hosts keep calling that domain**. It is a classic technique for finding infected instances.

```bash
# 1) The domain list to block
aws route53resolver create-firewall-domain-list --name corp-blocklist
aws route53resolver update-firewall-domains \
  --firewall-domain-list-id rslvr-fdl-0abc \
  --operation ADD \
  --domains "malicious-c2.example." "*.dyndns-suspicious.example."

# 2) Add a rule to the rule group - starting with ALERT first is the safe approach
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-0def \
  --firewall-domain-list-id rslvr-fdl-0abc \
  --priority 100 \
  --action ALERT \
  --name observe-before-blocking

# 3) After observing, switch to blocking + steer to the sinkhole
aws route53resolver update-firewall-rule \
  --firewall-rule-group-id rslvr-frg-0def \
  --firewall-domain-list-id rslvr-fdl-0abc \
  --action BLOCK \
  --block-response OVERRIDE \
  --block-override-domain sinkhole.corp.internal. \
  --block-override-dns-type CNAME \
  --block-override-ttl 60

# 4) Associate with the VPC - if you do not associate it, the rule does nothing
aws route53resolver associate-firewall-rule-group \
  --firewall-rule-group-id rslvr-frg-0def \
  --vpc-id vpc-0abc1234 \
  --priority 101 --name prod-vpc-dns-guard
```

DNS Firewall has a **failure mode (fail-open / fail-close)** setting. It determines whether to simply let queries through (`FAIL_OPEN`) or block them (`FAIL_CLOSE`) when the firewall cannot respond. From a pure security viewpoint `FAIL_CLOSE` is right, but this also means **"if the DNS firewall wobbles, all name resolution stops,"** which is in practice a total service outage. Conversely, `FAIL_OPEN` protects availability but turns the outage window into a security gap. It is a typical availability-versus-security trade-off with no single predetermined answer. On an exam, if the wording says "regulations require that resolution of malicious domains must never be allowed under any circumstances," the answer is `FAIL_CLOSE`; if it says "availability is the top priority," it is `FAIL_OPEN`.

The order of starting with `ALERT` and moving to `BLOCK` has exactly the same shape as the order for introducing Config auto-remediation on Day 2 (observe → manual → automatic). This is not a coincidence but a **common pattern of every blocking control**. The real risk of a blocking rule is not missing malicious traffic but *blocking legitimate traffic and causing an outage*, and that risk cannot be known when you create the rule; it is revealed only by checking against real traffic. So in mature organizations, firewall, WAF, and DNS blocking rules without exception go through a "detection-only period" before being promoted to blocking. What counts as practical competence is not the ability to create rules but **having a procedure for turning rules on safely**.

## Network Logging Tool Layer Summary

| Tool | What it sees | Depth | Active blocking |
|------|--------|------|----------|
| VPC Flow Logs | IP traffic metadata (5-tuple, bytes, ACCEPT/REJECT) | L3/L4 headers | No (record only) |
| Traffic Mirroring | Full packet replication (including payload) | L2-L7 payload | No (for analysis) |
| Resolver Query Log | DNS queries/responses | DNS layer | No (record only) |
| Resolver DNS Firewall | Domain-based allow/block | DNS layer | Yes |
| Network Firewall | Stateful inspection, IPS, domain filtering | L3-L7 | Yes |

The fork the exam asks about in this table is **the second column (what it sees) and the last column (can it block)**. If it asks about "detection and investigation," the answer is Flow Logs and Resolver query logs; if it asks about "packet contents," Traffic Mirroring; if it asks about "blocking," DNS Firewall or Network Firewall. Answering with a logging tool as a blocking tool, or a blocking tool as an investigation tool, is the typical wrong-answer pattern.

A mature detection architecture uses these logs to *reinforce one another*. When the Flow Log shows "10.0.1.20 egressed a large volume to 198.51.100.66:443," and the Resolver log at the same time shows "10.0.1.20 looked up `malicious-c2.example` and received 198.51.100.66," the *intent and domain context* of the communication, which was ambiguous from the IP alone, is completed. Add CloudTrail saying "that instance's role assumed a suspicious permission just before," and the breach timeline is complete. This multi-layer correlation leads into Day 4's log centralization and retention and Day 5's comprehensive scenarios. All logs must be centrally aggregated for this kind of cross-analysis to be possible.

```
[ Overlay the three logs on a timeline and a narrative emerges ]

  08:14:22  CloudTrail    AssumeRole → AppRole (sourceIP 203.0.113.10)
                          ↑ not an IP that normally assumes this role
  08:29:55  Resolver log  10.0.1.20 → malicious-c2.example (A)
                          response 198.51.100.66
                          ↑ this domain was looked up for the first time today
  08:30:04  Flow Log      pkt-srcaddr 10.0.1.20 → 198.51.100.66:443
                          flow-direction egress, traffic-path IGW
                          bytes 7,340,032 (4.2 GB cumulative over the following intervals)
                          ↑ this instance's usual egress was tens of MB
  08:31:10  CloudTrail    GetObject × many (data events)
                          resources: arn:aws:s3:::corp-sensitive/*

  ── No single line can say "breach" on its own.
     Only when four lines point to the same instance within 9 minutes does the conclusion stand.
```

This diagram is the thesis of the whole week. The value of logs comes not from the precision of individual events but from the **convergence that arises when several logs point to the same subject**. And that convergence is possible only when the logs are gathered in the same place, the timestamps are trustworthy, and no one has deleted them - which is tomorrow's (Day 4) topic.

## 📌 Key Takeaways

Network logs are the one place where a breach that "called legitimate APIs with legitimate permissions" finally looks strange. **VPC Flow Logs leave only metadata** (packet contents are for Traffic Mirroring), **arrive delayed in aggregation-window units** (they are not a real-time blocking tool), and **do not record metadata service and Amazon DNS communication at all** (you must know the blind spots in advance and fill them with other controls). When reading a line, first fix the direction from `srcport`/`dstport`; when tracing behind NAT, look at `pkt-srcaddr` rather than `srcaddr`; and for scans, `tcp-flags` of 18 (SYN-ACK) is more urgent than 2 (SYN). The golden rule for diagnosing connection failures is just one: **an asymmetric failure cannot be produced by an SG; only a NACL produces it.** On the DNS side, the Resolver query log is almost the only evidence that exposes C2 beacons and DNS tunneling, but instances that specify an external DNS directly bypass it, so the picture is complete only when you force the path with DNS Firewall along with logging. And that firewall is always turned on with `ALERT` first.

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
