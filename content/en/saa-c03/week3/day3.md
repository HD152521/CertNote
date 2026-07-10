# Day 3 - ELB: The Design Philosophy of Per-Layer Load Balancing and How to Choose Between ALB, NLB, and GLB

Load balancers emerged in the late 1990s, when web services began outgrowing the limits of a single server. In the early days, physical appliances from F5 or Cisco divided traffic inside data-center racks. But as the cloud era arrived, the load balancer itself became "infrastructure you have to manage," and AWS ELB abstracted that away into a fully managed service.

ELB, however, isn't a single thing. There's ALB (Application LB), NLB (Network LB), GLB (Gateway LB), and the legacy CLB — each operating at a different OSI layer and solving a fundamentally different problem. Once you understand these differences through the OSI model and load-balancing algorithm theory, the answer to a scenario question appears on its own.

## Load Balancing Theory: At Which Layer Do You Decide?

A load balancer's core job is to distribute incoming requests to one of several backend servers. The criterion for "which server to send it to" changes with the OSI layer.

**L4 (Transport layer) load balancing**: Looks only at the source IP, destination IP, and port of the TCP/UDP packet. It never peers inside the HTTP headers. The decision is fast and latency is low. The catch: it can't distinguish "this request should go to `/api/users` and that one should go to `/static/`."

**L7 (Application layer) load balancing**: Parses HTTP headers, URL paths, cookies, and query parameters to make routing decisions. The decision needs more CPU and time, but content-based routing becomes possible. It's essential in microservice architectures.

**L3 (Network layer) processing**: Transparently forwards the entire IP packet to another appliance. This is what you need to chain firewalls, IDS/IPS, and DPI (Deep Packet Inspection) appliances together.

> 💡 **Related theory**: The main L4 load-balancing algorithms are three: Round Robin (distribute in order), Least Connections (send to the fewest connections), and IP Hash (fixed distribution based on client IP). Nginx, HAProxy, and AWS NLB all use variants of these. L7 load balancing adds URL hashing and header matching. AWS ALB's routing rules evaluate up to 100 rules in priority order.

## ALB: Why It's Called "Application"

ALB "understands" the HTTP/HTTPS protocol. Rather than simply forwarding packets, it grasps the meaning of an HTTP request and makes routing decisions accordingly. That's what the name "Application" signifies.

The range of routing rules ALB actually handles:

```
[ ALB routing conditions ]
1. Host header:     api.example.com vs app.example.com
2. Path:            /api/* vs /v2/* vs /static/*
3. HTTP header:     X-Custom-Header: premium
4. Query string:    ?version=2
5. HTTP method:     GET vs POST (selective routing)
6. Source IP:       route only a specific IP range to a specific TG
7. Weighted:        A/B testing (TG-A 90%, TG-B 10%)
```

Of these, weighted routing is central to canary deployments and A/B testing. It's the pattern where you expose a new version to only 10% of traffic and, if there are no problems, ramp it up to 100%.

**ALB Target Types**:
- `instance`: Register by EC2 instance ID. The instance's security group must allow the ALB SG.
- `ip`: A specific IP address. Routes to IPs inside the VPC (ECS tasks, RDS, on-premises Direct Connect IPs).
- `lambda`: Exposes a Lambda function as an HTTP endpoint. Used for serverless APIs.
- `alb`: An ALB can be registered as a target of an NLB (nested structure).

> 🔍 **Going deeper**: ALB supports TLS termination and re-encryption. You can configure client ↔ ALB as HTTPS and ALB ↔ backend as HTTP (simpler), or both sides as HTTPS. Using an ACM (AWS Certificate Manager) certificate on the ALB automates certificate renewal. It supports SNI (Server Name Indication, RFC 6066), so you can register certificates for multiple domains on a single ALB. The old CLB didn't support SNI, so you needed a separate CLB per domain.

```
[ ALB TLS termination flow ]

Client ─HTTPS(TLS1.3)─→ ALB ─HTTP─→ EC2 Target
               [ACM Certificate]

or

Client ─HTTPS─→ ALB ─HTTPS(re-encrypt)─→ EC2 Target
              [ACM] [HTTPS selected in TG settings]
```

**ALB + WAF integration**: Attaching AWS WAF to an ALB lets you filter SQL Injection, XSS, and malicious bots out of L7 traffic. CLB doesn't integrate with WAF. WAF rules run in front of the ALB, so threats are blocked before they reach the backend EC2.

**gRPC support**: ALB supports the HTTP/2 and gRPC protocols. It can route inter-microservice gRPC communication at L7. NLB sees gRPC only as a TCP stream, so L7 routing is impossible.

> 📚 **Case study**: Netflix's Zuul API Gateway started as a self-operated Java process but gradually evolved into an architecture combined with ALB. Using ALB's weighted target groups, Netflix manages A/B traffic splitting between service versions, and via Lambda@Edge or ALB Lambda targets it implements serverless edge logic. (Netflix Tech Blog, 2019)

## NLB: Why Is L4 Faster Than L7?

NLB looks only at the TCP/UDP packet headers. Because it doesn't parse the HTTP payload, its processing time is far shorter. NLB's latency is on the order of **tens of microseconds (μs)**, while ALB's is on the order of milliseconds (ms).

But why does this latency difference matter for gaming or financial systems? A high-frequency trading (HFT) system targets under 100μs from receiving market data to placing an order. In multiplayer games, users feel "lag" once you exceed 20ms. In these environments, even the extra millisecond-scale processing time of an ALB is intolerable.

**NLB's static IP**: It has one static IP per AZ (an EIP can be assigned). For example, configuring an NLB across 3 AZs in the Seoul region produces 3 static IPs. You can register these IPs in a partner's or security team's firewall whitelist. ALB only has a DNS name and its IPs can change, so it can't be used for this purpose.

```
[ NLB static IP structure ]

Partner firewall whitelist: 1.2.3.4 (AZ-a), 5.6.7.8 (AZ-b)

Internet → 1.2.3.4 or 5.6.7.8 → NLB → TG (TCP 8080 → EC2)
                               ↗
         Cross-Zone traffic (extra cost)
```

**NLB's source IP preservation**: By default, NLB passes the client's real source IP through to the backend unchanged (Proxy Protocol or TCP passthrough). ALB carries the client IP in the `X-Forwarded-For` header, but the TCP-level source IP is rewritten to the ALB's IP. This difference matters for security group configuration and log analysis.

> ⚠️ **Pitfall**: When you use NLB, the security group must be applied to the **target EC2 instances**, not the NLB. The NLB itself has no security group (changed since 2023 so that SGs can be added to NLBs). ALB has its own SG, and the backend EC2's SG only needs to allow the ALB SG. Because the structure differs, don't confuse the two.

**NLB TLS termination**: NLB can also terminate TLS. It decrypts TLS at the TCP level and forwards unencrypted TCP to the backend. Unlike ALB, though, it doesn't look at HTTP headers, so path-based routing is impossible.

**NLB + Global Accelerator combo**: To deliver low latency to global users, you combine Global Accelerator (Anycast IP) with NLB. Global Accelerator pulls traffic to the nearest AWS edge, and NLB distributes it to the final backend. NLB alone gives you only limited DNS-based regional routing.

> 💡 **Related theory**: NLB's connection tracking uses the 5-tuple (source IP, source port, destination IP, destination port, protocol) to track packets belonging to the same session. Once a TCP connection is established, every packet of that session goes to the same target. For UDP, which is connectionless, enabling stickiness sends packets to the same target based on source IP + port. This is why NLB's "sticky session" is IP-based rather than cookie-based.

## GLB: Why Do You Need Security Appliance Chaining?

In enterprise networks, firewalls, IDS/IPS, and DPI appliances are physically inserted in the middle of the traffic path (Bump-in-the-Wire). GLB (Gateway Load Balancer) reproduces this pattern in the cloud.

GLB encapsulates packets with the GENEVE (Generic Network Virtualization Encapsulation, RFC 8926) protocol and sends them to the appliance; after the appliance inspects and returns them, GLB forwards them along their original path. The client and server are unaware that the appliance exists (transparent chaining).

```
[ GLB traffic flow ]

Internet traffic
    ↓
GLB Endpoint (VPC B: security VPC)
    ↓  (GENEVE encapsulation)
Palo Alto / Checkpoint NGFW cluster
    ↓  (after passing inspection)
GLB Endpoint → original destination (VPC A: app VPC)

[ The value of GLB ]
- Auto Scaling of 3rd-party appliances (add automatically as traffic grows)
- HA (automatic failover on appliance failure)
- Swap appliance vendors (no structural change required)
```

> 💡 **Related theory**: GENEVE is an evolution of VXLAN. Its header can carry metadata in TLV (Type-Length-Value) format, so the appliance can process packets while retaining the original packet context. RFC 8926 (finalized in 2020) defines the standard for chaining virtualized network functions (VNFs) in SDN (Software-Defined Networking) environments.

> 📚 **Case study**: NGFWs from Palo Alto Networks, Fortinet, Check Point, and others provide GLB-compatible AMIs in the AWS Marketplace. In the financial sector, regulatory requirements mandate that even traffic inside an AWS VPC be inspected through an NGFW, so the GLB + Palo Alto combination has become the standard pattern. Before GLB's launch (November 2020), implementing this required extremely complex routing configuration.

## Target Group, Health Check, and Slow Start

A Target Group is the set of backend servers to which the ELB distributes traffic. You can attach multiple Target Groups to a single ELB, and requests are routed to the appropriate TG according to the routing rules.

**How health checks work**:

A health check has the ELB periodically call a specific endpoint on the target to determine whether it's healthy. For ALB, an HTTP 200 response is considered healthy; for NLB, the criterion is a successful TCP connection (or an HTTP option can be selected).

```
HealhyThresholdCount = 3  (3 consecutive successes → Healthy)
UnhealthyThresholdCount = 2  (2 consecutive failures → Unhealthy)
HealthCheckIntervalSeconds = 30  (check every 30 seconds)
HealthCheckTimeoutSeconds = 5  (fail if no response within 5 seconds)

A failed target is excluded from traffic distribution in the TG
On success it's re-included (automatic recovery)
```

**Slow Start mode**: A newly added EC2 instance can suffer degraded performance if it suddenly receives a lot of traffic while the application isn't fully warmed up. Slow Start gradually increases the traffic sent to a new instance over 30–900 seconds. It's especially useful for JVM-based applications (which need JIT compilation) or servers that load an ML model.

**Deregistration Delay (Connection Draining)**: Before the ASG terminates an instance, it waits for the in-flight requests on that instance to complete. The default is 300 seconds (5 minutes). Once this time passes, the instance is force-terminated. Setting the value to 0 terminates it immediately (e.g., handling a Spot interruption).

> 🔍 **Going deeper**: ALB's sticky session comes in two kinds. `lb_cookie` is a cookie ALB generates itself (`AWSALB`) that binds a client to a specific target. `app_cookie` applies stickiness based on a cookie set by the application. Sticky sessions are needed in older architectures that store session state in server memory, but modern architectures prefer to externalize sessions to ElastiCache or DynamoDB and process requests identically no matter which server they land on — without sticky sessions.

## Cross-Zone Load Balancing: Why Are the Defaults Different?

| | ALB | NLB | GLB |
|--|-----|-----|-----|
| Default | **On** | **Off** | **Off** |
| Extra cost | None | Cross-AZ data transfer cost | Cross-AZ data transfer cost |

When Cross-Zone Load Balancing is off, each of the NLB's per-AZ nodes distributes traffic only to targets in its own AZ. If AZ-a has 2 instances and AZ-b has 8, the AZ-a node splits 50/50 across only 2, while the AZ-b node distributes 12.5% each across 8. The overall result is an uneven distribution.

When Cross-Zone is on, targets across all AZs receive traffic evenly. The reason ALB defaults it to on is that ALB is centered on HTTP workloads, and even distribution across AZs generally delivers better performance. The reason NLB defaults it to off is that Cross-AZ data transfer incurs cost, and architectures optimized for a specific AZ — like financial or gaming systems — deliberately want AZ isolation.

> ⚠️ **Pitfall**: The scenario "only one AZ's instances behind the ELB receive a lot of traffic" shows up on an NLB/GLB with Cross-Zone off when the target counts per AZ are unequal. The fix is to enable Cross-Zone or to balance the number of targets across AZs.

## Comparing ELB with Other Clouds

| Feature | AWS ALB | GCP Cloud LB | Azure Application GW |
|------|---------|--------------|----------------------|
| L7 HTTP routing | Host/path/header/query/method | URL Map, header-based | URL path, multi-site |
| WAF integration | AWS WAF | Cloud Armor | Azure WAF |
| gRPC support | Yes | Yes | Yes |
| WebSocket | Yes | Yes | Yes |
| Lambda target | Yes | Cloud Run integration | Function App integration |

| Feature | AWS NLB | GCP Network LB | Azure LB (Standard) |
|------|---------|---------------|---------------------|
| L4 protocols | TCP/UDP/TLS | TCP/UDP | TCP/UDP |
| Static IP | EIP per AZ | Single global IP possible | Public IP |
| DSR (Direct Server Return) | Limited | Yes | Yes |
| Cross-Region | No (separate GA) | Global LB integration | Global LB separate |

GCP's Cloud Load Balancing provides a single global Anycast IP by default, enabling global routing without Global Accelerator. On AWS, ALB/NLB are regional, and global routing requires bolting on Global Accelerator or CloudFront separately.

## Architecture Patterns: ELB Combinations in Real Designs

**Pattern 1: A classic three-tier web architecture**
```
Internet → ALB (HTTPS, WAF attached)
           ├─ /api/* → TG-API (ECS Fargate)
           ├─ /static/* → S3 (direct → redirect to CloudFront)
           └─ default → TG-WEB (EC2 ASG, Slow Start 90s)
```

**Pattern 2: Partner API + static IP requirement**
```
Partner B2B → NLB (EIP whitelist)
               └─ TG (TCP 8443 → EC2)
                   [Deregistration Delay 60s]
```

**Pattern 3: Enterprise security inspection chain**
```
Internet → IGW → GLB Endpoint (security VPC)
                    ↓ (GENEVE)
               Palo Alto NGFW ASG
                    ↓ (after passing inspection)
               GLB Endpoint → TGW → app VPC → ALB → EC2
```

**Pattern 4: Global game servers**
```
Global players → Global Accelerator (Anycast)
                      → us-east-1 NLB (UDP 7000)
                      → ap-northeast-2 NLB (UDP 7000)
                   each NLB → Game Server EC2 Cluster
```

## Cementing It with the CLI

```bash
# Create an ALB (internet-facing, HTTPS)
aws elbv2 create-load-balancer \
  --name prod-alb \
  --subnets subnet-pub-a subnet-pub-b subnet-pub-c \
  --security-groups sg-alb-id \
  --scheme internet-facing \
  --type application

# HTTPS listener + ACM certificate
aws elbv2 create-listener \
  --load-balancer-arn arn:aws:elasticloadbalancing:...:loadbalancer/app/prod-alb/xxx \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=arn:aws:acm:...:certificate/... \
  --default-actions Type=forward,TargetGroupArn=arn:...tg-web

# Path-based routing rule
aws elbv2 create-rule \
  --listener-arn arn:...listener/... \
  --priority 10 \
  --conditions '[{"Field":"path-pattern","Values":["/api/*"]}]' \
  --actions '[{"Type":"forward","TargetGroupArn":"arn:...tg-api"}]'

# Weighted Target Group (A/B test, 10% → new version)
aws elbv2 create-rule \
  --listener-arn arn:... \
  --priority 5 \
  --conditions '[]' \
  --actions '[{
    "Type": "forward",
    "ForwardConfig": {
      "TargetGroups": [
        {"TargetGroupArn": "arn:...tg-v1", "Weight": 90},
        {"TargetGroupArn": "arn:...tg-v2", "Weight": 10}
      ]
    }
  }]'

# Create an NLB (static EIP)
aws elbv2 create-load-balancer \
  --name partner-nlb \
  --subnets subnet-a subnet-b \
  --type network \
  --scheme internet-facing

# Assign EIPs to the NLB
aws elbv2 set-subnets \
  --load-balancer-arn arn:...nlb \
  --subnets \
    SubnetId=subnet-a,AllocationId=eipalloc-111 \
    SubnetId=subnet-b,AllocationId=eipalloc-222

# Check that ALB Cross-Zone is disabled
aws elbv2 describe-load-balancer-attributes \
  --load-balancer-arn arn:... \
  --query 'Attributes[?Key==`load_balancing.cross_zone.enabled`]'
```

## Wrapping Up

The three kinds of ELB provide different levels of intelligence at different OSI layers. ALB understands the meaning of HTTP and does content-based routing. NLB provides tens-of-microseconds latency and static IPs at L4. GLB transparently chains security appliances at L3.

If you're hunting for keywords in an exam scenario: when HTTP path/host/header routing or WAF appears, it's ALB; when gaming, IoT, financial trading, UDP, static IP, or partner whitelisting appears, it's NLB; when NGFW, IPS, DPI, or 3rd-party security appliances appear, it's GLB.

---

## 📝 연습 문제

**문제 1.** In a microservice architecture, `api.example.com/users` must route to the Users service and `api.example.com/orders` to the Orders service. Both services use the same port (443). What is the most suitable load balancer and configuration?

A) NLB + TCP-based health check
B) ALB + path-based routing rules
C) GLB + GENEVE protocol
D) CLB + sticky session

**정답: B**
해설: Routing to different backends based on the URL path (`/users`, `/orders`) is a task that requires L7 HTTP understanding. Only ALB supports path-based routing. NLB is L4 and can't see the URL path. GLB is dedicated to security-appliance chaining. CLB is legacy and has no path-based routing.

---

**문제 2.** A financial services company provides a B2B API to external partners. The partner's firewall must register the AWS load balancer's IP in a whitelist. The system also uses a custom TCP-based protocol. What is the appropriate solution?

A) ALB (HTTPS) + WAF
B) NLB + Elastic IP (one per AZ)
C) CloudFront + ALB origin
D) Global Accelerator + ALB

**정답: B**
해설: The static-IP requirement is solved with NLB + EIP (Elastic IP). NLB supports the TCP protocol. ALB's IPs change dynamically, making whitelist registration unstable. CloudFront is DNS-based and its IPs aren't fixed. Global Accelerator provides two Anycast IPs, but here attaching EIPs directly to the NLB is the more direct and simpler solution.

---

**문제 3.** A company must inspect all inbound traffic using a Palo Alto Networks NGFW on AWS. When traffic grows, the NGFW cluster must scale automatically, and if a particular NGFW instance fails, traffic must fail over automatically to another instance. Which AWS service should be used?

A) ALB (register the NGFW in a Target Group)
B) NLB (register the NGFW in a Target Group)
C) GLB (chain the NGFW via the GENEVE protocol)
D) Transit Gateway + custom routing tables

**정답: C**
해설: Transparently inserting the NGFW into the traffic path, managing the NGFW cluster with Auto Scaling, and failing over automatically on failure is exactly what GLB is for. With the GENEVE protocol, the NGFW inspects the packet and returns it, and GLB forwards it to the original destination. ALB and NLB are HTTP/TCP-layer load balancing — they don't support a 3rd-party appliance chaining structure. Transit Gateway is for inter-VPC routing and has no appliance-chaining automation.

---

**문제 4.** In an Auto Scaling Group, when an instance is terminated, in-flight requests are suddenly dropped. Additionally, a newly started JVM-based application server performs poorly for the first few minutes. What is the fix for each?

A) Termination problem: Termination Protection | New-server problem: a larger instance
B) Termination problem: configure Deregistration Delay | New-server problem: configure ALB Slow Start
C) Termination problem: Enhanced Monitoring | New-server problem: a warm-up script via User Data
D) Termination problem: Multi-AZ deployment | New-server problem: use a Reserved Instance

**정답: B**
해설: Deregistration Delay (default 300 seconds) waits for in-flight requests to complete when an instance is removed from the TG. Increase the 300 seconds if request processing takes a long time, and decrease it when you need fast termination such as a Spot interruption. ALB Slow Start gradually ramps up the traffic sent to a new target over the configured time (30–900 seconds) to wait for JVM JIT compilation to complete. Both settings are configured at the Target Group level.

---

**문제 5.** Which statement about the difference in the default Cross-Zone Load Balancing setting between ALB and NLB is correct?

A) Both ALB and NLB default to on, with no extra cost
B) ALB defaults to on (no extra cost) / NLB defaults to off (Cross-AZ data cost when enabled)
C) ALB defaults to off / NLB defaults to on (no extra cost)
D) Both LBs default to off, with the same extra cost

**정답: B**
해설: For ALB, even distribution is generally optimal for HTTP workloads, so it defaults to on with no extra cost. NLB and GLB default to off, and enabling it incurs a cost of around $0.01/GB for cross-AZ data transfer. If you keep Cross-Zone off on an NLB, you must keep the number of targets per AZ balanced to avoid uneven distribution.

---

**문제 6.** A multi-tenant SaaS platform provides a different subdomain per customer (`tenant1.saas.com`, `tenant2.saas.com`). You want to use a single ALB for all domains while applying a separate TLS certificate to each domain. How do you configure this?

A) Create a separate ALB for each domain
B) Register multiple ACM certificates on one ALB via SNI (Server Name Indication)
C) Put CloudFront in front and apply a separate certificate to each domain
D) Use NLB with TLS passthrough so each EC2 handles its own certificate

**정답: B**
해설: ALB supports SNI (RFC 6066), so you can register multiple ACM certificates on a single HTTPS listener. When the client includes the domain name in the SNI header during the TLS handshake, ALB responds with the matching certificate. You can register up to 25 certificates per ALB (default), and a limit-increase request is also possible. A separate ALB per domain carries heavy cost and management overhead. C is also a valid pattern, but the question presupposes the use of a single ALB.

---

**문제 7.** You operate a UDP-based real-time game server (port 7000) on AWS. You must deliver consistent low latency to players worldwide, and in-progress game sessions must not be dropped when game servers scale in. What is the most suitable architecture?

A) ALB (HTTP/HTTPS) + ASG + WAF
B) Global Accelerator + NLB (UDP) + ASG + Deregistration Delay 300s
C) CloudFront + ALB + ElastiCache session sharing
D) Route 53 Geolocation + NLB + ASG

**정답: B**
해설: Only NLB supports the UDP protocol. Consistent low latency for players worldwide is delivered by Global Accelerator (BGP Anycast), which routes from the nearest edge over the AWS backbone network. Configure Deregistration Delay appropriately so that in-progress game sessions are allowed to complete on scale-in. Route 53 Geolocation is delayed by minutes for failover or traffic shifting because of DNS TTL.
