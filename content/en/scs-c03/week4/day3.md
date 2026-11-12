# Day 3 - AWS Network Firewall and DNS Firewall: Stateful Inspection, Domain Filtering, Centralized Inspection VPC

Security Groups and NACLs are the basic controls for VPC traffic, but their limits are clear. A Security Group is stateful but only does simple allow/deny, a NACL is stateless, and both work at the level of IP, port, and protocol. Requirements such as "allow outbound only to specific domains," "detect intrusions by signatures (IPS) inside packet payloads," and "block domains based on TLS SNI" can't be solved with them. **AWS Network Firewall** (a managed stateful/stateless inspection engine) and **Route 53 Resolver DNS Firewall** (DNS query filtering) fill this gap.

## Network Firewall Structure: Firewall, Policy, Rule Group

AWS Network Firewall places **firewall endpoints** (one ENI per Availability Zone) inside a VPC and forces traffic through these endpoints by routing to inspect it. The components come in three layers.

1. **Firewall**: A resource placed in a VPC and subnets (dedicated firewall subnets). It creates an endpoint per AZ.
2. **Firewall Policy**: A policy that bundles stateless/stateful rule groups and default actions.
3. **Rule Group**:
   - **Stateless rule group**: Per-packet, quickly pass/drop/forward based on the 5-tuple (source/destination IP and port, protocol). Does not track connection state.
   - **Stateful rule group**: Tracks connections and sessions. Uses Suricata-compatible rules to inspect domains (SNI/Host), protocol anomalies, and signature-based IPS/IDS.

```
Packet → [Stateless evaluation] --forward to stateful--> [Stateful evaluation] → Action
            │ pass/drop (immediate)                         │ pass/drop/alert
```

Stateless vs stateful is the foundation of firewall theory. Stateless (NACLs, Network Firewall's stateless groups) evaluates each packet independently, so it is fast, but it doesn't know "is this packet a response to an existing connection?" Stateful (Security Groups, Network Firewall's stateful groups) maintains a connection table, automatically allowing response traffic and looking at session context (handshake progress, abnormal sequences). Network Firewall combines the two in one engine, forming a pipeline of a fast first filter (stateless) → precise inspection (stateful).

### The Four VPC Controls in One Table

The reason there are as many as four controls that handle traffic inside a VPC is that each one **can see different things and is enforced in a different way.** The exam builds the answer from the last two columns of this table (what it can see / how it is enforced).

| Control | Scope | State | What it can see | How it is enforced | What it can't do |
|------|------|------|---------------|---------------|------------|
| **Security Group** | ENI | Stateful | IP, port, protocol, references to other SGs | Attached to the ENI (can't be bypassed) | Domain/payload inspection, explicit deny rules |
| **NACL** | Subnet | Stateless | IP, port, protocol | Subnet boundary (can't be bypassed) | Domain/payload, automatic response allow |
| **Network Firewall** | VPC (dedicated subnets) | Both | Packet payload, TLS SNI, HTTP Host, IPS signatures | **Traffic forced through by routing** (powerless if routing fails) | Inside encrypted bodies (without decryption), SNI hidden by ECH |
| **DNS Firewall** | VPC (Resolver) | Not applicable | **DNS query names** | Applies only to queries that use the VPC's Resolver | Traffic using its own DNS or DoH, direct IP connections |

There is one contrast here you must hold on to. Security Groups and NACLs are **structurally impossible to bypass** — because there is no way for traffic not to cross an ENI or a subnet boundary. Network Firewall and DNS Firewall, on the other hand, are **placed in the path by configuration.** If the route tables are wrong, Network Firewall exists but inspects nothing, and if an instance uses external DNS (8.8.8.8 or DoH) directly instead of the VPC Resolver, DNS Firewall never sees that query. This is why the principle **"first check that traffic necessarily passes through this control, before checking that the rules are right"** repeats throughout this week.

> ⚠️ **Pitfall**: There is a practical pitfall derived from the last row of the table above. After deploying DNS Firewall, you must **control outbound port 53 (UDP/TCP) and DoH (443) leaving the VPC** to prevent bypass. If a workload queries an external public DNS directly, it never goes through the Resolver, so domain blocking is neutralized entirely. That is why the complete answer to a question where "block malicious domains with DNS Firewall" is correct usually comes with **"block direct queries to external DNS with a Security Group/Network Firewall."** Few problems, on the exam or in practice, end with simply turning on one control.

## Stateful Rules: Suricata and the Two Evaluation Orders

A stateful rule group either takes Suricata rule syntax directly (a rules string), or is defined with a domain list/standard patterns. The evaluation-order option matters:
- **Default order (action order)**: Evaluated in the priority pass → drop → alert (differs from Suricata's default).
- **Strict order**: Evaluates rules in the order defined, and specifies the policy-level default stateful action (`aws:drop_established`, etc.) — suited to a *whitelist (default-deny)* configuration.

```
# Suricata: allow only HTTP/TLS outbound to example.com (drop the rest)
pass tls $HOME_NET any -> $EXTERNAL_NET any (tls.sni; content:"example.com"; nocase; sid:1001;)
pass http $HOME_NET any -> $EXTERNAL_NET any (http.host; content:"example.com"; sid:1002;)
drop tcp $HOME_NET any -> $EXTERNAL_NET any (msg:"deny other egress"; sid:1003;)
```

Domain filtering looks at the plaintext SNI (TLS ClientHello) or the HTTP Host header. So it **depends on the SNI being unencrypted** — you need to know the limitation that using ECH (Encrypted Client Hello) or domain fronting can bypass SNI-based filters.

### Choosing the Evaluation Order Is Choosing the Security Model

The difference between the two evaluation orders is not a simple configuration option but a declaration of **which security model you adopt.**

| Item | Default order (action order) | Strict order |
|------|------------------------------|--------------|
| Evaluation method | Priority determined by action type (pass → drop → alert) | **In the order you wrote them**, top to bottom |
| Meaning of rule order | Changing the order gives the same result | Order changes the result |
| Default stateful action | Pass if nothing matches | `aws:drop_established`, `aws:drop_strict`, etc. can be specified in the policy |
| Suitable model | Blacklist (block only known bad) | **Whitelist (block everything other than what's allowed)** |
| Typical use | Threat-signature IPS | Outbound domain allowlist |

When a requirement comes up to restrict outbound to approved domains only, **Strict order + default drop** is the skeleton of the correct answer. If you try to build a whitelist with Default order, you run into a situation where the "drop everything else" rule placed at the end doesn't behave as intended because of action priority. No matter how elaborately you write the rules, *if the evaluation model is wrong, the result is wrong.*

```json
{
  "FirewallPolicyName": "egress-allowlist",
  "FirewallPolicy": {
    "StatelessDefaultActions": ["aws:forward_to_sfe"],
    "StatelessFragmentDefaultActions": ["aws:forward_to_sfe"],
    "StatefulEngineOptions": {
      "RuleOrder": "STRICT_ORDER",
      "StreamExceptionPolicy": "DROP"
    },
    "StatefulDefaultActions": [
      "aws:drop_established",
      "aws:alert_established"
    ],
    "StatefulRuleGroupReferences": [
      { "ResourceArn": "arn:aws:network-firewall:ap-northeast-2:111122223333:stateful-rulegroup/allowed-domains", "Priority": 100 },
      { "ResourceArn": "arn:aws:network-firewall:ap-northeast-2:111122223333:stateful-rulegroup/ips-signatures", "Priority": 200 }
    ]
  }
}
```

`aws:forward_to_sfe` in `StatelessDefaultActions` is the key — it means "don't judge at the stateless stage; hand everything over to the stateful engine." If you use `aws:pass` here, the packet is confirmed as passed at the stateless stage and **the stateful rules never run at all.** This is the second most common cause of blocking failing even though you carefully built a domain allowlist (the first is a missing route).

> ⚠️ **Pitfall**: `StreamExceptionPolicy` also matters from the exam's viewpoint. It decides how to handle traffic in exceptional situations where the firewall sees only part of a flow (endpoint replacement, flows seen only from the middle due to asymmetric routing, and so on). If security is the priority, `DROP`; if availability is the priority, let it pass. **Explicitly deciding "what to do when uncertain"** is basic hygiene in firewall design, and if you leave it to the default, you won't be able to explain "why this traffic got through" during an incident investigation.

Network Firewall's domain filtering applies *only to traffic that passes through the firewall*. If you don't send traffic to the firewall endpoint by routing, no inspection takes place at all. A common cause of "I built a domain allowlist but it doesn't block" is that the route table doesn't direct traffic to the firewall subnet.

## Routing: Forcing Traffic Through the Inspector

For inspection to happen, both inbound and outbound traffic must pass the firewall endpoint through *symmetric* routing. The typical placement in a single VPC (distributed deployment):

```
[Workload subnet] --(0.0.0.0/0 → firewall endpoint)--> [Firewall subnet]
                                                              │
                                                       [IGW route table]
                                                  (subnet CIDR → firewall endpoint)
Through the IGW's edge association (ingress routing),
inbound traffic is also made to go through the firewall
```

The key: point the workload subnet's default route at the firewall endpoint, and sandwich the firewall subnet into the path toward the IGW (or NAT). On the IGW side, **ingress routing (edge association)** sends return and inbound traffic to the inspector as well. With asymmetric routing, stateful inspection breaks.

If you lay out the route tables entry by entry, it looks like this. Three tables point at each other and fold the traffic into an S shape.

```
[ Single-VPC distributed deployment — a set of three route tables ]

VPC 10.0.0.0/16
├─ Workload subnet 10.0.1.0/24 ── RT-Workload
│     0.0.0.0/0        → vpce-fw-az-a   (firewall endpoint)
│     10.0.0.0/16      → local
│
├─ Firewall subnet 10.0.2.0/24 ── RT-Firewall
│     0.0.0.0/0        → igw-xxxx
│     10.0.0.0/16      → local
│
└─ IGW edge association ──────── RT-Ingress   ※ the route table attached to the IGW
      10.0.1.0/24      → vpce-fw-az-a   (return traffic also goes to the inspector)

[ The packet's journey — going out and coming in must be symmetric ]

  Outbound:  EC2 → RT-Workload → firewall inspection → RT-Firewall → IGW → Internet
  Inbound:   Internet → IGW → RT-Ingress → firewall inspection → EC2

  ※ If you omit RT-Ingress, inspection happens only on the way out, and the return
    skips the inspector. The stateful engine sees only half of the flow,
    and connection tracking breaks.
  ※ Each AZ has its own firewall endpoint. A workload in AZ-a must always
    point at AZ-a's endpoint — crossing AZs means asymmetry + cross-AZ charges.
```

**You must not place workloads** in the firewall subnet. This subnet is dedicated to the firewall endpoint, and if you put an EC2 here, its traffic leaves without being inspected (because its own subnet's route points straight at the IGW). Also, when deleting a firewall, the deletion fails if **delete protection and subnet change protection** are turned on — these are safeguards that prevent the accident of deleting the firewall by mistake and losing the control, so turning them on in production is the standard practice.

## Centralized Inspection VPC: Hub and Spoke

As accounts and VPCs multiply, a distributed deployment with a firewall in every VPC is inefficient in operation and cost. Put a **Transit Gateway** or **VPC Lattice** in the hub, place Network Firewall in a dedicated **inspection VPC** (central inspection VPC), and inspect all East-West (between VPCs) and North-South (internet) traffic in one place.

```
[ Central inspection VPC — the order in which traffic actually flows ]

  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
  │  App VPC    │        │  Data VPC   │        │ Egress VPC  │
  │ 10.1.0.0/16 │        │ 10.2.0.0/16 │        │  (NAT/IGW)  │
  └──────┬──────┘        └──────┬──────┘        └──────┬──────┘
         │ attachment           │ attachment           │ attachment
         └───────────┬──────────┴──────────┬───────────┘
                     │                     │
              ┌──────▼─────────────────────▼──────┐
              │        Transit Gateway            │
              │  ┌─────────────────────────────┐  │
              │  │ Spoke RT: 0.0.0.0/0 →       │  │
              │  │           Inspection attach │  │  ← spokes can't see each other directly
              │  ├─────────────────────────────┤  │
              │  │ Inspection RT: each VPC CIDR →│ │
              │  │           that VPC's attach │  │  ← after inspection, on to the original destination
              │  └─────────────────────────────┘  │
              └──────────────┬────────────────────┘
                             │ attachment (appliance mode = ON)
                    ┌────────▼─────────┐
                    │ Inspection VPC   │
                    │  ┌────────────┐  │
                    │  │ NFW AZ-a   │  │
                    │  │ NFW AZ-b   │  │  ← redundancy through per-AZ endpoints
                    │  └────────────┘  │
                    └──────────────────┘

[ East-West flow example: App VPC → Data VPC ]
  1. App VPC → TGW (0.0.0.0/0 in the spoke RT)
  2. TGW → Inspection VPC attachment
  3. Network Firewall inspection (stateful rule evaluation)
  4. Inspection VPC → TGW
  5. TGW → Data VPC (the 10.2.0.0/16 route in the inspection RT)
  ※ The response must pass through the same endpoint in the same AZ in exactly
    the reverse order
    → appliance mode is what guarantees this.

[ Why you split into two routing domains ]
  If you don't separate the spoke RT and the inspection RT,
  the TGW sends "already-inspected traffic" back to the inspector, creating an infinite loop.
```

You must enable the TGW's **appliance mode** — it guarantees that packets of the same flow always go to the same firewall endpoint (same AZ), preserving the symmetry of stateful inspection. Without appliance mode, flows cross AZs and become asymmetric, and stateful rules malfunction.

> 🎯 **Scenario**: "Inspect all inter-VPC and internet traffic of 50 accounts centrally with IPS" is a classic architecture. The correct answer pattern: Transit Gateway hub + Network Firewall in a dedicated inspection VPC + TGW appliance mode enabled + central policy distribution with Firewall Manager. A distributed deployment with a firewall in every VPC doesn't fit the requirement of "simplified operations and central management."

A central inspection VPC is the *choke point* pattern of network security. It creates a single point that all traffic must pass through, applying policy consistently and securing visibility. The trade-off is clear — a single control point is easy to manage but can become a bottleneck for availability and performance and a single point of failure, so it must be distributed and made redundant with multiple per-AZ endpoints.

### Commands for Deployment and Auditing

```bash
# 1) Create the domain allowlist as a rule group (managed domain list format)
aws network-firewall create-rule-group \
  --rule-group-name allowed-domains \
  --type STATEFUL --capacity 100 \
  --rule-group '{
    "RulesSource": {
      "RulesSourceList": {
        "Targets": ["example.com", ".amazonaws.com", "repo.internal.example"],
        "TargetTypes": ["TLS_SNI", "HTTP_HOST"],
        "GeneratedRulesType": "ALLOWLIST"
      }
    }
  }'

# 2) Create an IPS rule group from raw Suricata (read from a file and manage with IaC)
aws network-firewall create-rule-group \
  --rule-group-name ips-signatures \
  --type STATEFUL --capacity 1000 \
  --rule-group file://ips-rulegroup.json

# 3) Attach the rule groups to the policy + apply STRICT_ORDER
aws network-firewall update-firewall-policy \
  --firewall-policy-name egress-allowlist \
  --update-token <token received from get-firewall-policy> \
  --firewall-policy file://policy.json

# 4) Check which endpoints the firewall created in which subnets
#    ← get the vpce-id to put in the route table here
aws network-firewall describe-firewall --firewall-name prod-inspection \
  --query 'FirewallStatus.SyncStates'

# 5) Check and set safeguards in operation
aws network-firewall update-firewall-delete-protection \
  --firewall-name prod-inspection --delete-protection

# 6) Logging configuration — alert and flow can be sent to different destinations
aws network-firewall update-logging-configuration \
  --firewall-name prod-inspection \
  --logging-configuration '{
    "LogDestinationConfigs": [
      {"LogType":"ALERT","LogDestinationType":"CloudWatchLogs","LogDestination":{"logGroup":"/aws/nfw/alert"}},
      {"LogType":"FLOW","LogDestinationType":"S3","LogDestination":{"bucketName":"nfw-flow-logs","prefix":"prod/"}}
    ]
  }'
```

The habit of reading `SyncStates` from `describe-firewall` is especially important in practice. Firewall creation is asynchronous, and if you add routes before the per-AZ endpoints are ready, traffic falls into a blackhole. You must keep the order of **confirming the endpoint ID and then changing the routing.**

### Rule Tuning: See with Alert First, Block with Drop Later

The same procedure as Day 1's WAF holds for Network Firewall. If you set the Suricata rule action to `drop` from the start, legitimate communications you didn't know about (package repositories, vendor APIs, telemetry) get cut all at once and cause an outage.

```
[ The order for safely introducing an outbound allowlist ]

1) Full alert mode
   alert tls $HOME_NET any -> $EXTERNAL_NET any (tls.sni; content:"."; sid:9001;)
   → Zero blocks. Collect the list of which domains you are actually going out to.
        │
2) Aggregate the alert logs (CloudWatch Logs Insights / Athena)
   fields tls.sni | stats count() by tls.sni | sort count desc
   → Obtain a measured list of "where do we actually go out to"
        │
3) Review the list and select the targets to allow
   Business-necessary  → add to the ALLOWLIST rule group
   Unidentified        → ask the owning team. If it can't be confirmed, don't allow it.
        │
4) Switch to STRICT_ORDER + default drop, but first apply to only some subnets/accounts
   → Observe actual blocking with a reduced blast radius
        │
5) Expand to everything + regression monitoring
   Continuously watch the alert logs for "newly blocked domains"
   to catch both business impact and new threats early
```

> 🎯 **Scenario**: "After applying the outbound domain allowlist, the deployment pipeline and some applications failed at the same time. We must restore service while keeping the security control." If this comes up, the shape of the correct answer is **not turning off the policy wholesale but identifying the blocked domains from the alert logs and adding only the necessary ones to the allowlist.** Options such as "remove the rule group from the policy" or "change the default action to pass" lose the control entirely and are wrong. Here too, the **narrowest exception** is the principle of the correct answer.

## Route 53 Resolver DNS Firewall: Query-Layer Control

If Network Firewall looks at packets and sessions, **DNS Firewall** filters the *DNS queries* occurring inside the VPC at the Route 53 Resolver stage. It ALLOWs / BLOCKs / ALERTs queries based on domain names.

- **Domain list**: A list of domains to block/allow (define it yourself or use an AWS managed list).
- **AWS Managed Domain Lists**: Threat-intelligence-based lists such as `AWSManagedDomainsMalwareDomainList`, `AWSManagedDomainsBotnetCommandandControl`, and `AWSManagedDomainsAggregateThreatList`.
- **Block response method**: `NODATA`, `NXDOMAIN`, or `OVERRIDE` to a specified IP.
- Associate a **rule group** with a VPC, and it is evaluated by rule priority.

```bash
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-abc \
  --firewall-domain-list-id rslvr-fdl-malware \
  --priority 100 --action BLOCK --block-response NXDOMAIN \
  --name block-malware-domains
```

A powerful use of DNS Firewall is **blocking DNS exfiltration (DNS tunneling).** It defends against attacks where malware encodes data into the subdomains of DNS queries to carry it out, through blocking known C2 domains and alerting on abnormal query patterns.

```bash
# Deploy in three steps: create the rule group → add rules → associate with the VPC
aws route53resolver create-firewall-rule-group --name corp-dns-guard

# Your own domain list (domains prohibited by internal policy, etc.)
aws route53resolver create-firewall-domain-list --name blocked-corp
aws route53resolver update-firewall-domains \
  --firewall-domain-list-id rslvr-fdl-abc \
  --operation ADD \
  --domains "*.example-file-share.com" "*.dyn-dns-example.net"

# The AWS managed threat list at the highest priority
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-abc \
  --firewall-domain-list-id rslvr-fdl-aws-malware \
  --priority 10 --action BLOCK --block-response NXDOMAIN \
  --name block-known-malware

# The internal policy list comes next
aws route53resolver create-firewall-rule \
  --firewall-rule-group-id rslvr-frg-abc \
  --firewall-domain-list-id rslvr-fdl-abc \
  --priority 20 --action BLOCK --block-response NODATA \
  --name block-corp-policy

# It applies only once associated with the VPC (a missed association is the most common mistake)
aws route53resolver associate-firewall-rule-group \
  --firewall-rule-group-id rslvr-frg-abc \
  --vpc-id vpc-0abc123 \
  --priority 101 --name prod-vpc-assoc
```

**The choice of block response method** also carries meaning. `NXDOMAIN` says "no such domain," so the client gives up immediately, but it is not the kind of response that avoids signaling to an attacker that "there is a filter here." If you answer with a sinkhole IP via `OVERRIDE`, you can **trace back which instance looked up the malicious domain through connection attempts to that IP** — a classic technique for identifying infected hosts at the same time as blocking. If detection is the goal, set it to `ALERT` to let the query through while only leaving a record.

| Response method | What the client sees | Advantage | When to use |
|-----------|---------------------|------|-----------|
| `NXDOMAIN` | No such domain | Immediate failure, fewer retries | Clearly malicious domains |
| `NODATA` | No record | Acknowledges the domain exists | Prohibited by policy (business-irrelevant services) |
| `OVERRIDE` | A specified IP (sinkhole) | **Can trace back infected hosts** | Alongside breach investigation/isolation |
| `ALERT` (action) | Normal response | Observe with no impact | Early-adoption tuning |

The SolarWinds Orion supply-chain breach disclosed in December 2020 is the event that most vividly showed the value of DNS-layer controls. The backdoor the intruders planted did not communicate with the outside right away; it gave its first signal by **encoding information about the infected environment into the subdomain of DNS queries** and sending it to a specific domain. In organizations that monitored only HTTP traffic, this communication looked like "normal DNS lookups." There are three lessons here. First, **because DNS is a protocol allowed in almost every environment, it is the most attractive concealment channel for attackers.** Second, so **DNS query logs are a detection asset as important as firewall logs**, and if you don't turn on the Resolver query log, there is no basis at all to investigate afterward. Third, this type of communication shows up not by signature but by **pattern** (abnormally long subdomains, a high ratio of unique queries, a large number of different child names for a single domain), so separately from blocklists you **should also have behavior-based detection (such as GuardDuty's DNS-related detections).**

A DNS Firewall rule group **applies only when associated with the VPC.** When you've created a rule group and even added rules but it doesn't block, nine times out of ten it's a missing VPC association. Also, when you associate multiple rule groups with one VPC, they are evaluated in the **priority order specified at association time**, and *within* a group by the rules' priority — as with WAF, two layers of priority exist. And DNS Firewall applies **only to queries that go through the VPC Resolver**, so if an instance edits `/etc/resolv.conf` to look at an external DNS directly, it is bypassed entirely.

Network Firewall's SNI/domain filtering and DNS Firewall are at *different layers*. DNS Firewall blocks at the "name resolution" stage, so you don't receive the malicious domain's IP at all. Network Firewall blocks at the "connection attempt" stage, so it blocks that connection even if the IP is known. The two are complementary — malware that bypasses DNS and connects directly by IP passes DNS Firewall but gets caught by Network Firewall's stateful rules (IP/domain). It is a typical case of defense in depth.

## Network Firewall vs Gateway Load Balancer Appliances

To insert a third-party firewall (Palo Alto, Fortinet, etc.) into a VPC, use **Gateway Load Balancer (GWLB)** + GENEVE encapsulation. AWS Network Firewall is a *managed* alternative that doesn't require you to operate such appliances directly. For the requirement "IPS/domain filtering without management burden," Network Firewall is the answer; for "transparently insert a specific vendor's appliance," GWLB is the answer.

| Item | AWS Network Firewall | Gateway Load Balancer + appliance |
|------|----------------------|--------------------------------------|
| Inspection engine | AWS-managed (Suricata-compatible) | **Vendor product** (NGFW, IDS/IPS, DPI, etc.) |
| Operational burden | None (AWS handles patching, scaling, HA) | AMI lifecycle, licensing, scaling, HA handled by you |
| Rule assets | Suricata rules, managed threat signatures | **Existing on-premises policies can be ported as is** |
| Traffic delivery | Pass through the endpoint by routing | GWLB endpoint + **GENEVE encapsulation** |
| TLS decryption | Supported (TLS inspection configuration needed) | Depends on vendor features (usually supported) |
| Scaling | Automatic | You design the appliance Auto Scaling group yourself |
| Suitable situation | Quickly get IPS and domain control the AWS-native way | **When a specific vendor product is mandated by regulation/audit**, aligning policy with on premises |

> 🎯 **Scenario**: "We must use a specific vendor's next-generation firewall certified by the regulator, and apply the same policy as on premises to the cloud." If this comes up, the answer is **GWLB + a vendor appliance.** Conversely, if "we want to apply outbound domain control and IPS without adding operations staff," it is Network Firewall. When both options appear together, the deciding criteria are not technical performance but two things: **"is a vendor mandated, and can you bear the operational burden."**

The two approaches are not mutually exclusive, and in practice many organizations use them in combination. For example, they split North-South (the internet boundary) to a vendor appliance because of regulation, and East-West (between VPCs) to Network Firewall because of cost and operational burden. What you must verify here is **the order and symmetry in which traffic goes through the two inspectors.** Stacking two layers of inspectors multiplies routing complexity, and if asymmetry occurs on either side, only that side's stateful engine quietly malfunctions. Adding a control is not always adding safety, and **complexity you can't verify is itself a risk.**

## Logging

Network Firewall sends **flow logs** (connection metadata) and **alert logs** (stateful rule matches and IPS alerts) to CloudWatch Logs/S3/Firehose. DNS Firewall records blocked and allowed queries in the Resolver query log. Both logs are the primary basis for forensics and tuning, and together with GuardDuty they are signal sources for threat detection.

| Log | What it contains | Main use | Common mistake |
|------|---------------|-----------|-----------|
| NFW **flow log** | 5-tuple, byte/packet counts, start/end | Understanding communication relationships, capacity sizing | Cost surges if collected in full |
| NFW **alert log** | Matched sid, message, SNI, action | **Rule tuning, verifying IPS accuracy** | No alert rules written, so the log is empty |
| Resolver **query log** | Query name/type/response, source instance | Detecting DNS tunneling, tracing infected hosts | Not turned on, so no post-incident investigation |
| VPC **flow log** | Per-ENI allow/deny metadata | Subnet- and SG-level troubleshooting | Confused with NFW logs |

A sense for telling these four apart saves a great deal of time in practice. "Why was it blocked" is answered by the **alert log**, "who communicated with whom" by the flow log, and "what name did they look up" by the query log. It is common to waste time during an incident investigation digging through the wrong log, but you can just remember that **the kind of question determines the kind of log.**

## Wrapping Up

Today's two services answer one question — "how do you control traffic leaving a VPC?" — at different layers.

**Network Firewall** looks at the connection itself. It controls domains by reading TLS SNI and the HTTP Host with Suricata rules, and detects intrusions with signatures. But all of these abilities work **only when traffic passes through the firewall endpoint**, so half of this service is rules and the other half is routing. When the exam presents "the rules are right but it doesn't block," the answer is almost always routing or a missing `aws:forward_to_sfe`.

**DNS Firewall** looks at name resolution. Its strength is that it can block before a connection even starts, even before the destination IP is known, and its weakness is that it is powerless if the VPC Resolver is bypassed. So DNS Firewall is always complete only when paired with "blocking direct queries to external DNS."

**The central inspection VPC** is the form that scales these controls to organizational size. TGW hub + a dedicated inspection VPC + appliance mode + separated routing domains — these four move as one set. If even one is missing, it quietly breaks through asymmetry or a routing loop, and the quiet breakage is the most dangerous part — because you can end up in a state where the firewall is alive but inspects nothing.

Finally, let's write down once more the one operating principle that came up repeatedly today. **First observe (alert/Count), then design exceptions narrowly from the data, and then switch to blocking.** The same procedure was the correct answer for WAF, for Shield's automatic mitigation, and for Network Firewall. The services differ, but there is one way to operate a control.

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
