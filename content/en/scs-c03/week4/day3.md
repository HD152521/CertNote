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

## 📝 Practice Questions

**Question 1.** Which statement about the difference between stateless rule groups and stateful rule groups in AWS Network Firewall is correct?

A) Stateless tracks connection state, and stateful looks only at individual packets  
B) Stateless evaluates packets independently by 5-tuple (no connection tracking), and stateful tracks connections and sessions and performs domain and signature inspection with Suricata rules  
C) Both are identical and differ only in performance  
D) Stateful inspects only inbound, and stateless inspects only outbound  

**Answer: B**  
Explanation: A stateless rule group evaluates each packet independently by 5-tuple (source/destination IP and port, protocol) to perform fast pass/drop/forward and does not track connection state. A stateful rule group maintains a connection table and inspects SNI/Host domains, protocol anomalies, and IPS signatures with Suricata-compatible rules. Choices that reverse which one tracks state, or that limit direction, are wrong.

---

**Question 2.** You created a domain allow list (allowing only `example.com` outbound) as a stateful rule, but other domains still get out. What is the most likely cause?

A) Suricata syntax error  
B) The workload subnet's route table does not send traffic to the firewall endpoint, so no inspection happens at all  
C) DNS Firewall is disabled  
D) Insufficient WCU  

**Answer: B**  
Explanation: Network Firewall inspects only traffic that passes through the firewall endpoint. If the route table does not direct the workload subnet's traffic to the firewall subnet, no inspection happens no matter how accurate the rules are. A missing route is exactly the common mistake. With a syntax error, rule deployment would fail, DNS Firewall is a different layer, and WCU is a WAF concept.

---

**Question 3.** We want to inspect all inter-VPC traffic with Network Firewall through a Transit Gateway hub and a central inspection VPC. Which TGW setting is absolutely required so that stateful inspection does not break?

A) Disable ECMP  
B) Enable appliance mode — guarantees that packets of the same flow always go to the firewall endpoint in the same AZ  
C) Disable DNS support  
D) Set the MTU to 9001  

**Answer: B**  
Explanation: TGW appliance mode ensures symmetry by making bidirectional packets of one connection flow always route to the appliance (firewall endpoint) in the same AZ. Without it, the flow crosses AZs and becomes asymmetric, and stateful inspection that tracks connection state fails to recognize the response packets and malfunctions. ECMP, DNS, and MTU settings are not directly related to stateful symmetry.

---

**Question 4.** We want to prevent malware from exfiltrating data out by encoding it in subdomains of DNS queries (DNS exfiltration). What is the most appropriate service/feature?

A) Block port 53 with a Security Group  
B) Use Route 53 Resolver DNS Firewall to BLOCK known malicious/C2 domains and ALERT on anomalous queries  
C) CloudFront OAC  
D) Deny inbound with a NACL  

**Answer: B**  
Explanation: DNS Firewall filters DNS queries inside the VPC by domain at the Resolver stage, and mitigates DNS tunneling/exfiltration by blocking and alerting on AWS managed malicious and botnet C2 domain lists. Blocking port 53 entirely also blocks legitimate DNS and breaks services, and OAC and NACLs are not controls based on DNS query content.

---

**Question 5.** We want to apply IPS (intrusion prevention) and domain filtering to VPC outbound traffic without management burden. We want to avoid operating third-party appliances. What is the most appropriate choice?

A) Gateway Load Balancer + third-party firewall appliance  
B) AWS Network Firewall (IPS and domain filtering with managed stateful rules)  
C) Only strengthen Security Group rules  
D) Attach AWS WAF directly to the VPC  

**Answer: B**  
Explanation: AWS Network Firewall is a managed service that provides IPS/IDS and SNI/Host domain filtering with Suricata-compatible stateful rules without the burden of operating appliances. GWLB (A) is the approach used when inserting third-party appliances and brings operational burden. A Security Group is at the IP/port level and cannot do IPS or domain filtering, and WAF is for HTTP (L7) applications, so it is not a control attached directly to inspect general VPC traffic.

---
