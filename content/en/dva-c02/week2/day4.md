# Day 4 - The Traffic-Distribution Layer: ALB, NLB, GWLB, and the Auto Scaling Group

The first time you stand up an ALB and hook two EC2 instances behind it, it feels like magic. You fire requests at a single URL and half of them land on server A, the other half on server B. When CPU spikes, the ASG spins up more instances on its own; when one dies, it launches a replacement. Behind that magic, a health-check algorithm, the target group's internal state machine, and the ASG's reconciliation loop are all running with precision.

Today we look at exactly which OSI layer ALB and NLB make their routing decisions on, how an ASG turns a fresh instance into "InService", and how Blue/Green deployment is implemented with ALB target group weighted routing. Inside that single word "load balancer" sit latency, throughput, stickiness, SSL termination, and cross-zone billing — each a different trade-off — and those differences are what separate the right answer from the wrong one on the exam.

## ALB Is L7, NLB Is L4 — Seeing What That Actually Means

The stock answer is "ALB is layer 7, NLB is layer 4", but let's see exactly how that difference plays out in practice and on the exam.

**ALB (Application Load Balancer)** understands the semantics of HTTP/HTTPS. It can read the URL path, host header, query string, HTTP headers, and cookies to make routing decisions. If you terminate SSL at the ALB, the backend receives plain HTTP. It supports WebSocket upgrades too. The ALB adds `X-Forwarded-For` and `X-Forwarded-Proto` headers to pass client information down to the backend.

**NLB (Network Load Balancer)** looks at TCP/UDP/TLS packets. It has no notion of HTTP semantics, so path- or header-based routing is off the table. In exchange, **the client's source IP is passed through to the backend unchanged** (connection passthrough), so the backend sees the client IP directly (whereas the ALB requires reading the `X-Forwarded-For` header). TLS termination is possible too, but the more common pattern is TLS passthrough (the backend holds its own certificate). Millions of connections per second, microsecond-level latency.

**GWLB (Gateway Load Balancer)**, launched in 2020. Built on the **L3 GENEVE protocol**, it transparently inserts security appliances (firewalls, IDS, DPI) into the traffic path. It sends VPC traffic to a third-party Palo Alto/Fortinet appliance for inspection and then returns it to its original route. It shows up on the exam occasionally, and the keyword is "transparently inserting a security appliance".

| Dimension | ALB | NLB | GWLB |
|------|-----|-----|------|
| OSI layer | L7 | L4 | L3 (GENEVE) |
| Protocols | HTTP, HTTPS, gRPC, WebSocket | TCP, UDP, TLS | IP (all protocols) |
| Latency | ~a few ms | < 1 ms | appliance-dependent |
| Concurrent connections | very high | millions/sec | appliance-dependent |
| Static IP | ❌ (DNS only) | ✅ one EIP per AZ | ❌ |
| Target type | EC2, IP, Lambda, ALB | EC2, IP, ALB | EC2 (security appliance) |
| Routing decision | URL/Host/Header/Cookie | port + flow hash | 6-tuple flow hash |
| SSL termination | ✅ ACM integration | ✅ ACM integration | ❌ (passthrough) |
| Sticky session | Duration/Application cookie | Source IP affinity | always the same appliance |
| Client IP preservation | X-Forwarded-For header | automatic (TCP passthrough) | automatic |
| Cost model | hourly + LCU | hourly + NLCU | hourly + GLCU |
| Cross-zone | ON by default, free | OFF by default, data-transfer charge when enabled | OFF by default |

> 🔍 **Going deeper**: ALB's LCU (Load Balancer Capacity Unit) billing charges you for the largest of four dimensions: ① 25 new connections/sec, ② 3,000 active connections, ③ 1 GB of processed data, ④ 1,000 rule evaluations/sec. So don't just look at raw traffic volume — watch connection churn (whether you have a lot of short-lived connections) alongside it to forecast cost accurately. NLB's NLCU is billed as the max of ① 800 new flows/sec, ② 100K active flows, ③ 1 GB of processed data, and its connection ceilings are far higher than ALB's.

> 💡 **Related theory**: The way the ALB passes the client IP to the backend via the `X-Forwarded-For` header is the non-standard forerunner of RFC 7239 (Forwarded HTTP Extension). RFC 7239 defined the standard header `Forwarded: for=192.0.2.43; proto=https`, but in practice `X-Forwarded-For` still dominates. NLB's client IP preservation is the mechanism by which the source IP from the TCP three-way handshake is carried straight through to the backend. The NLB makes itself nearly transparent at the IP layer.

## ALB Routing Rules: Inside Rule Evaluation

An ALB listener evaluates its rule list in priority order. Once a rule matches, its action is applied and the rest are not evaluated (short-circuit). Up to 100 rules are allowed (a soft limit that can be raised to 1,000).

```python
import boto3
elbv2 = boto3.client('elbv2', region_name='ap-northeast-2')

# Rule 1: path /api/* → api-tg
elbv2.create_rule(
    ListenerArn='arn:aws:elasticloadbalancing:...:listener/app/.../443/abc',
    Priority=10,
    Conditions=[{
        'Field': 'path-pattern',
        'PathPatternConfig': {'Values': ['/api/*']}
    }],
    Actions=[{
        'Type': 'forward',
        'TargetGroupArn': 'arn:aws:...:targetgroup/api-tg/...'
    }]
)

# Rule 2: host admin.* → admin-tg
elbv2.create_rule(
    Priority=20,
    Conditions=[{
        'Field': 'host-header',
        'HostHeaderConfig': {'Values': ['admin.example.com']}
    }],
    Actions=[{'Type': 'forward', 'TargetGroupArn': 'arn:...:targetgroup/admin-tg/...'}]
)

# Rule 3: Blue/Green canary — 90% Blue, 10% Green
elbv2.create_rule(
    Priority=30,
    Conditions=[{'Field': 'path-pattern', 'PathPatternConfig': {'Values': ['/*']}}],
    Actions=[{
        'Type': 'forward',
        'ForwardConfig': {
            'TargetGroups': [
                {'TargetGroupArn': 'arn:...:blue-tg', 'Weight': 90},
                {'TargetGroupArn': 'arn:...:green-tg', 'Weight': 10}
            ]
        }
    }]
)
```

This weighted forward is the heart of ALB-native Canary/Blue-Green deployment. CodeDeploy works internally by adjusting exactly this weighted target group over time. When a scenario says "Blue/Green deployment with an ALB", the answer is "two target groups + weighted forward".

> 🔍 **Going deeper**: The ALB supports six kinds of conditions: host-header, path-pattern, http-request-method, source-ip, http-header, and query-string. Among them, the http-header condition can route on an arbitrary HTTP header the client sends (e.g., `X-Tenant-Id`), so it's frequently used for tenant branching in multi-tenant SaaS. The source-ip condition is a heavy condition that affects ALB's LCU calculation, so overusing it spikes cost.

> ⚠️ **Trap**: ALB path-pattern is glob matching, not regex. `/api/*` matches, but regex like `/api/v[1-2]/*` does not. It's also case-sensitive (`/API/*` won't match). If the exam offers "regex matching with an ALB rule" as a choice, it's wrong.

## Target Groups and Health Checks: A Stateful State Machine

A target group is not just a list of backends — it holds a health state machine for each target.

```
[Target lifecycle]

  initial ──▶  registering ──▶  initial (health check starts)
                                       │
                                       ▼
                               (health check every interval)
                                       │
                                       ├──▶ passes healthy threshold ──▶  healthy
                                       └──▶ reaches unhealthy threshold ──▶ unhealthy
                                                                          │
                                                                          ▼
                                                              deregistering (draining)
                                                                          │
                                                                          ▼
                                                                       unused
```

| Parameter | Default | Meaning |
|---------|--------|--------|
| `HealthCheckProtocol` | HTTP | HTTP/HTTPS/TCP |
| `HealthCheckPath` | `/` | HTTP only |
| `HealthCheckIntervalSeconds` | 30 | check interval |
| `HealthCheckTimeoutSeconds` | 5 | response wait time |
| `HealthyThresholdCount` | 5 | consecutive successes → healthy |
| `UnhealthyThresholdCount` | 2 | consecutive failures → unhealthy |
| `Matcher` | 200 | HTTP status code treated as success |
| `DeregistrationDelay` | 300s | wait for in-flight requests to finish on deregister |

The meaning of these parameters comes up often on the exam. For example, with `HealthyThresholdCount=5, IntervalSeconds=30`, a new instance takes at least 150 seconds to be recognized as healthy. That's why an ASG's `HealthCheckGracePeriod` must be larger than this value (typically 300 seconds).

**Deregistration delay (connection draining)**: when a target is judged unhealthy or the ASG scales in, the ALB immediately stops sending new requests to that target but **waits up to 300 seconds (default) for in-flight requests to finish**. Set it to 0 and you risk 502s; set it too long and scale-in is delayed. Combined with an ASG lifecycle hook, you get precise graceful shutdown.

> 🔍 **Going deeper**: There are two flavors of health check. ① **ELB-based** (default): the target group's own health check decides directly. ② **ASG-driven**: when the ASG has `HealthCheckType=ELB`, it uses the ELB's health result. With the latter enabled, an instance the ELB judges unhealthy is automatically terminated by the ASG and replaced with a new one. This is the core of "self-healing" behavior. Without it, the ELB stops sending traffic, but the instance itself stays alive and wastes money.

> 💡 **Related theory**: The health-check algorithm is the same idea as the failure detector model in distributed systems (Chandra & Toueg, 1996). Requiring several consecutive failures before declaring a target unhealthy reduces false positives (transient network glitches), and defining the unhealthy threshold explicitly makes the trade-off between detection time and accuracy explicit. There are more sophisticated algorithms like the φ Accrual Failure Detector (Hayashibara, 2004), but AWS expresses it as a simple threshold counter so operators can reason about it intuitively.

## Auto Scaling Group: Inside the Reconciliation Loop

An ASG isn't just "add and remove instances" — it runs a **reconciliation loop that drives the current state toward the desired capacity**. This model is the same idea as Kubernetes' controller pattern.

```
[ASG reconciliation loop, every minute]

  Current InService instance count = N
       │
       ▼
  Desired capacity = D
       │
       ├──▶ N < D : launch a new instance (using the launch template)
       │         │
       │         ▼
       │     Pending → Pending:Wait (if a lifecycle hook exists)
       │         │
       │         ▼
       │     user work (install software, warming up)
       │         │
       │         ▼
       │     CompleteLifecycleAction
       │         │
       │         ▼
       │     InService (registered with the target group)
       │
       └──▶ N > D : terminate an instance
                 │
                 ▼
             Terminating:Wait (if a lifecycle hook exists)
                 │
                 ▼
             user work (collect logs, graceful shutdown)
                 │
                 ▼
             Terminated
```

**The real value of lifecycle hooks**: even after a new instance boots and its user-data finishes, the application may not actually be ready to serve traffic (JVM warm-up, cache pre-fill, model loading). Hold the instance in "Pending:Wait" for a set time (or until an explicit CompleteLifecycleAction) with a lifecycle hook, then move it to InService, and by the time it's registered with the target group it's already fully warmed up.

```python
import boto3
asg = boto3.client('autoscaling', region_name='ap-northeast-2')

# Register a lifecycle hook
asg.put_lifecycle_hook(
    LifecycleHookName='warmup-hook',
    AutoScalingGroupName='my-asg',
    LifecycleTransition='autoscaling:EC2_INSTANCE_LAUNCHING',
    DefaultResult='ABANDON',  # discard the instance on timeout
    HeartbeatTimeout=600,  # wait up to 10 minutes
    NotificationTargetARN='arn:aws:sqs:...:warmup-queue',
    RoleARN='arn:aws:iam:...:role/asg-hook-role'
)

# Called from inside the instance once warmup completes
asg.complete_lifecycle_action(
    LifecycleHookName='warmup-hook',
    AutoScalingGroupName='my-asg',
    InstanceId='i-0abc',
    LifecycleActionResult='CONTINUE'
)
```

## The Five Scaling Policies: Which One, and When

| Policy | Decision mechanism | Example use |
|------|------|------|
| **Target Tracking** | auto-adjusts a metric to a target value (PID-controller-like) | keep CPU at 50%, keep ALB RequestCountPerTarget at 1000 |
| **Step Scaling** | explicit steps by threshold band | CPU 70-80% → +1, 80-90% → +3, 90%+ → +5 |
| **Simple Scaling** | single threshold + cooldown | rarely used (superseded by Target Tracking) |
| **Scheduled** | time-based | desired=10 at 9am daily, desired=2 at 6pm |
| **Predictive** | ML-based advance prediction | learns a weekly pattern, then prewarms |

**Inside Target Tracking**: an AWS-operated, PID-controller-like algorithm monitors the metric and adjusts the desired capacity automatically. You just specify "CPU 50%" and you're done. It's the most recommended policy and the default for new workloads. One caveat: **when Target Tracking is enabled on multiple metrics at once, the most conservative decision (= the one that scales out the most) is adopted**, so if both "CPU 50%" and "RequestCount 1000" are active, it keeps adding instances until both are satisfied.

**When you need Step Scaling**: when a simple +1 can't keep up with a load surge. For example, when an e-commerce sale kicks off and RPS goes 10x in 5 seconds, Target Tracking adding one instance at a time falls behind. You need Step Scaling to scale aggressively, like "+5 when above the 90% threshold".

> ⚠️ **Trap**: A scaling policy's **cooldown period** is the wait time until the next scaling action. It applies only to Simple Scaling — not to Target Tracking or Step Scaling. When the exam presents a scenario of "thrashing because the cooldown is too short", suspect Simple Scaling. Also, an ASG's `HealthCheckGracePeriod` is a different concept from cooldown. Even if a new instance is marked unhealthy, it won't be terminated within the grace period (so as not to kill an instance that's still booting).

> 🔍 **Going deeper**: Predictive Scaling launched in 2018. It looks at a week's worth of CloudWatch metrics and learns the pattern for each day-of-week and time-of-day. So if there's a pattern where traffic spikes at 9am daily, it spins up instances ahead of time at 8:30 so they're already warmed up when traffic arrives. It can be combined with Target Tracking (Predictive brings capacity up ahead of time, and Target Tracking catches whatever the prediction missed). It does need enough training data (at least 24 hours), and its effectiveness drops if the traffic pattern is random.

## Mixed Instance Policy: Blending Spot and On-Demand

To capture Spot's ~90% savings in production, you need the ASG's Mixed Instance Policy. Use On-Demand for the base capacity for stability, and fill the capacity above it with Spot.

```python
asg.create_auto_scaling_group(
    AutoScalingGroupName='mixed-asg',
    MinSize=4, MaxSize=20, DesiredCapacity=10,
    MixedInstancesPolicy={
        'LaunchTemplate': {
            'LaunchTemplateSpecification': {
                'LaunchTemplateName': 'web-template',
                'Version': '$Latest'
            },
            'Overrides': [
                {'InstanceType': 'c5.large'},
                {'InstanceType': 'c5a.large'},
                {'InstanceType': 'c5n.large'},
                {'InstanceType': 'm5.large'}
            ]
        },
        'InstancesDistribution': {
            'OnDemandBaseCapacity': 2,           # always at least 2 On-Demand
            'OnDemandPercentageAboveBaseCapacity': 30,  # above the base, 30% On-Demand
            'SpotAllocationStrategy': 'capacity-optimized',  # the most stable pool
            'SpotInstancePools': 4  # only meaningful with the lowest-price strategy
        }
    },
    VPCZoneIdentifier='subnet-aaa,subnet-bbb,subnet-ccc'
)
```

**The four SpotAllocationStrategy options**:
- `lowest-price`: pulls from the cheapest pool. High reclamation risk.
- `capacity-optimized`: prefers the pool with the most capacity (= the pool least likely to be reclaimed). **Recommended default for new workloads.**
- `capacity-optimized-prioritized`: explicit priority + capacity-first.
- `price-capacity-optimized`: added in 2022. Balances price and capacity. The most recommended modern default.

> 📚 **Case study**: In 2020, Netflix announced it runs 90% of its batch workloads on Spot and cut EC2 costs by 50%. The keys were ① using the capacity-optimized strategy to drop reclamation frequency below 1%, ② taking a graceful checkpoint the moment a spot interruption notice arrived, via a lifecycle hook, and ③ registering multiple instance families within the same region (m5, m5a, m5n, c5) as Overrides so that when one family's capacity dried up, it was backfilled from another.

## SSL/TLS Termination and SNI

The ALB's HTTPS listener performs SSL/TLS termination. Attach a certificate issued free from ACM (AWS Certificate Manager) and you even get automatic renewal. With **SNI (Server Name Indication)** support, you can register certificates for multiple domains on a single ALB listener — `api.example.com` and `app.example.com` use different certificates but are handled by the same ALB.

| Behavior | ALB | NLB |
|------|-----|-----|
| TLS termination | ✅ (ACM automatic) | ✅ (ACM automatic) |
| TLS passthrough | ❌ | ✅ (TCP listener) |
| SNI multi-certificate | ✅ | ✅ |
| mTLS (client cert) | ✅ added in 2023 | ❌ |
| Backend-to-ALB TLS | ✅ (re-encrypt) | ✅ |

> 🔍 **Going deeper**: An ALB's SSL Policy determines the combination of TLS versions and cipher suites. `ELBSecurityPolicy-TLS13-1-2-2021-06` supports TLS 1.3 + 1.2 and guarantees forward secrecy. In regulated environments like PCI-DSS or HIPAA you must explicitly choose a TLS 1.2+ policy. Since 2023 the ALB supports mTLS (mutual TLS, client certificate validation). Previously you needed NLB + your own TLS termination, but now the ALB validates client certificates directly against ACM Private CA.

## Cross-Zone Load Balancing: A Trap That Hits the Bill Directly

For the ALB, cross-zone load balancing is **ON by default and free**. For the NLB it's **OFF by default, and enabling it incurs cross-AZ data transfer cost** ($0.01 per GB).

```
[Cross-zone OFF, NLB default]
  AZ-a NLB node ── AZ-a targets only
  AZ-b NLB node ── AZ-b targets only
  → uneven load if the target count differs per AZ

[Cross-zone ON]
  AZ-a NLB node ── AZ-a, AZ-b, AZ-c targets all
  → even load, but cross-AZ traffic is generated
```

The NLB's cross-zone-OFF default is a choice that prioritizes latency and cost, but if the target count differs per AZ you get uneven load. The ALB always has cross-zone on, since it's already free.

## Sticky Sessions: When to Turn Them On, When to Leave Them Off

For a stateless application, sticky sessions are unnecessary. But they're needed for cases like a legacy app that stores sessions in backend memory, chat/gaming where a WebSocket connection must stay bound to a specific backend, or ML inference that lazy-loads a large model.

| Type | LB | Mechanism |
|------|----|---------|
| **Duration-based** | ALB | `AWSALB` cookie, configurable TTL (1s–7 days) |
| **Application-based** | ALB | based on a cookie the app issues; the app decides the TTL |
| **Source IP affinity** | NLB | the same source IP always goes to the same target |

Application-based, added in 2019, is where the ALB doesn't mint its own cookie but reads the cookie the backend sends as-is. The ALB hashes that cookie to pick the target, so you can control the ALB's behavior from your backend code.

> ⚠️ **Trap**: NLB source IP affinity is inaccurate for users behind NAT. If everyone in a single company office appears as the same NAT IP, load piles onto one backend. Mobile users also change IPs frequently, which breaks affinity. In these cases, the textbook move is to push stickiness itself up into the application layer (JWT, session store).

## Calling Lambda Directly from an ALB

You can register a Lambda function as an ALB target type (added November 2018). This lets you expose an HTTP API via ALB → Lambda without API Gateway.

| Dimension | ALB → Lambda | API Gateway → Lambda |
|------|------|------|
| Cost | ALB LCU + Lambda | API Gateway per-call + Lambda |
| Throttling | ALB doesn't (Lambda's own limits) | API Gateway throttling available |
| API key, usage plan | ❌ | ✅ |
| Cognito auth integration | ALB direct integration | API Gateway authorizer |
| WebSocket | ALB doesn't do it directly | API Gateway WebSocket |
| OpenAPI/Swagger import | ❌ | ✅ |
| Use case | simple HTTP → Lambda, internal API | externally public API |

Cost is generally lower with the ALB, but for an externally public API, API Gateway's throttling/keys/swagger deliver a lot of value.

> 💡 **Related theory**: The ALB → Lambda integration is a structure where the ALB converts an HTTP request into a Lambda invocation event and invokes the Lambda synchronously. The Lambda is registered with the ALB's target group, and the ALB invokes it in `RequestResponse` mode. The Lambda response is converted into an HTTP response and returned to the client. The same function can also be invoked from API Gateway, and the fact that the event formats of the two invocations differ comes up often on the exam.

## CLI Roundup

```bash
# ALB + listener + target group
aws elbv2 create-load-balancer \
  --name web-alb \
  --subnets subnet-aaa subnet-bbb subnet-ccc \
  --security-groups sg-12345 \
  --scheme internet-facing \
  --type application \
  --ip-address-type ipv4

aws elbv2 create-target-group \
  --name web-tg \
  --protocol HTTP --port 80 \
  --vpc-id vpc-12345 \
  --health-check-protocol HTTP \
  --health-check-path /healthz \
  --health-check-interval-seconds 15 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --target-type instance

aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS --port 443 \
  --certificates CertificateArn=$ACM_ARN \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06 \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN

# Auto Scaling Group with Mixed Instance Policy
aws autoscaling create-auto-scaling-group \
  --auto-scaling-group-name web-asg \
  --mixed-instances-policy file://mixed-policy.json \
  --min-size 2 --max-size 20 --desired-capacity 4 \
  --vpc-zone-identifier "subnet-aaa,subnet-bbb,subnet-ccc" \
  --target-group-arns $TG_ARN \
  --health-check-type ELB \
  --health-check-grace-period 300

# Target Tracking scaling policy
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name cpu-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ASGAverageCPUUtilization"
    },
    "TargetValue": 50.0,
    "DisableScaleIn": false
  }'

# Or based on ALB request count (more accurate traffic-driven scaling)
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name web-asg \
  --policy-name request-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ALBRequestCountPerTarget",
      "ResourceLabel": "app/web-alb/abc/targetgroup/web-tg/xyz"
    },
    "TargetValue": 1000.0
  }'
```

## Wrapping Up

There are three pictures from today. First, the ALB understands L7 HTTP semantics and routes on URL, host, header, and cookie. The NLB is L4, passing TCP/UDP through at microsecond latency and providing static IPs. GWLB is what you use to transparently insert a security appliance. Second, the ASG runs a reconciliation loop toward the desired capacity and, with lifecycle hooks, precisely controls warmup and graceful shutdown. Target Tracking is the default scaling policy for new workloads. Third, Mixed Instance Policy + capacity-optimized Spot is the standard pattern for production-grade cost optimization.

In the next article, we pull all of Week 2 together and look at the real integration scenario for the EC2 layer — how SG, EBS, ELB, and ASG mesh together inside a single architecture.

---

## 📝 연습 문제

**문제 1.** A company wants to run a Blue/Green canary deployment with an ALB. What is the correct configuration?

A) Create two ALBs and branch via DNS
B) Register two target groups as a weighted forward on a single listener rule, and adjust the weights over time
C) Move to an NLB
D) The ALB doesn't support canary

**정답: B**
해설: An ALB can distribute a single rule's forward action across multiple target groups by weight (added November 2019). Start with Blue target group 100, Green 0 → gradually raise Green to 10, 25, 50, 100. CodeDeploy's ALB integration uses exactly this mechanism. The weights don't have to sum to 100 (they're relative ratios). A can't switch instantly because of DNS TTL. As for C, an NLB can do weighted forward too, but it lacks canary tooling as refined as the ALB's.

---

**문제 2.** In an ASG, new instances do get registered with the ALB but start receiving traffic before the application is fully ready, causing 5xx errors. What is the most appropriate response?

A) Reduce the ALB's health check interval
B) Add an `EC2_INSTANCE_LAUNCHING` lifecycle hook to the ASG and have the instance call `CompleteLifecycleAction` when warmup finishes
C) Increase the ASG's max size
D) Increase the target group's deregistration delay

**정답: B**
해설: A lifecycle hook holds a new instance in the "Pending:Wait" state, delaying the ASG's transition to InService. Once the in-instance warmup script (JVM warmup, cache preload, model load) finishes, it proceeds with `complete-lifecycle-action --lifecycle-action-result CONTINUE`. Only then is it registered with the ALB target group and starts receiving traffic. A just increases the health check frequency; it doesn't control readiness. D concerns in-flight handling at termination, unrelated to the startup moment. As an alternative, the pattern of putting the health check path at `/healthz` and returning 200 only once warmup completes is also frequently used.

---

**문제 3.** What cost is incurred when you enable cross-zone load balancing on an NLB?

A) An additional hourly NLB charge
B) Cross-AZ data transfer ($0.01 per GB, $0.02 for the round trip)
C) Increased NLCU usage
D) No cost change

**정답: B**
해설: On the NLB, cross-zone is OFF by default, and turning it on incurs bidirectional data transfer cost for traffic that crosses AZs. Traffic within the same AZ is free, but when an AZ-a NLB node sends to an AZ-b target, it costs $0.01 each way, outbound + inbound. So enable NLB cross-zone with awareness of the potential cost increase. Contrast this with the ALB, where cross-zone is ON by default and free. D is wrong.

---

**문제 4.** A game server needs to communicate globally over UDP port 17800. What is the most appropriate LB?

A) ALB
B) NLB (supports TCP/UDP, static EIP)
C) CLB
D) GWLB

**정답: B**
해설: The ALB is limited to HTTP/HTTPS and WebSocket and can't handle UDP. The CLB is legacy. GWLB is for security appliances. The NLB handles TCP/UDP/TLS and provides a static EIP per AZ, so you can pin the IP into the game client. On top of that, a Global Accelerator + NLB combination even enables BGP Anycast-based global routing. Non-HTTP traffic like gaming/finance/IoT/VoIP is almost always NLB.

---

**문제 5.** Which ASG scaling policy uses ML to predict future traffic and spin up instances ahead of time?

A) Target Tracking
B) Step Scaling
C) Scheduled Scaling
D) Predictive Scaling

**정답: D**
해설: Predictive Scaling was added in 2018. It learns a week's worth of CloudWatch metrics to predict the pattern for the same day-of-week and time-of-day, spinning up instances before the traffic arrives. It can be combined with Target Tracking. It needs at least 24 hours of data to learn. C's Scheduled is where the user specifies explicit times and numbers — not ML prediction. A's Target Tracking looks at the current metric and adjusts reactively.

---

**문제 6.** What is the biggest difference between ALB → Lambda integration and API Gateway → Lambda integration?

A) The ALB doesn't support Lambda
B) The ALB suits external APIs, API Gateway suits internal APIs
C) API Gateway additionally provides API management features like throttling, API keys, usage plans, and OpenAPI import
D) The Lambda response format is identical

**정답: C**
해설: ALB → Lambda is a simple HTTP → Lambda passthrough — cheap, but with no API management features. API Gateway provides a rich API management layer: throttling (per-key, per-stage, per-method), API key issuance and validation, Usage Plans, OpenAPI spec import, request/response transformation, and Lambda Proxy vs. Lambda Integration. But it costs more than the ALB, so generally API Gateway for externally public APIs, ALB for internal APIs. D is wrong — the event formats differ, and invoking the same function from both places requires event conversion.

---

**문제 7.** To minimize Spot Instance reclamation while maximizing cost savings, which ASG setting is most appropriate?

A) The `lowest-price` allocation strategy
B) The `capacity-optimized` or `price-capacity-optimized` allocation strategy + multiple instance family Overrides
C) Use 100% Spot only
D) Use On-Demand only

**정답: B**
해설: `capacity-optimized` prefers the Spot pool with the most capacity (= least likely to be reclaimed). The `price-capacity-optimized` strategy added in 2022 balances price and capacity for a more modern choice. Registering multiple instance types in Overrides means that when one pool drains, it's backfilled from another, reducing reclamation further. A's `lowest-price` only looks at the cheapest pool, so reclamation is high (unsuitable for production). C is risky for critical workloads. D gives up Spot's cost savings.

---

**문제 8.** Both ALB and NLB send traffic only to instances that pass health checks. What is the difference in their health check behavior?

A) The ALB looks at HTTP/HTTPS response codes (Matcher); the NLB looks at TCP connection success or an HTTP/HTTPS response
B) The NLB doesn't support health checks
C) The ALB checks every 30 seconds, the NLB every 60 seconds
D) The two LBs' health checks are identical

**정답: A**
해설: HTTP/HTTPS health checks are standard for the ALB, and it inspects the response code (`Matcher`, default 200). The NLB can do all three of TCP/HTTP/HTTPS, and a TCP health check only looks at a simple SYN-ACK response (independent of the application layer). So an NLB TCP health check can pass as long as the OS is alive even if the application is dead, which is why an HTTP health check is more recommended for accurate readiness judgment. C is wrong — both default to 30 seconds. D is wrong.

---

## 📌 오늘의 요약

1. ALB is L7 (HTTP path/host/header/cookie routing, ACM integration, Lambda targets), NLB is L4 (TCP/UDP/TLS, static EIP, microsecond latency), GWLB is for inserting security appliances.
2. A target group is a health-check-based stateful state machine. Combine it with an ASG via `HealthCheckType=ELB` and you get self-healing.
3. The ASG is a reconciliation loop toward the desired capacity. Lifecycle hooks precisely control warmup and graceful shutdown.
4. Target Tracking is the default scaling policy for new workloads. Predictive is a supplement for workloads with a clear pattern.
5. Mixed Instance Policy + `capacity-optimized`/`price-capacity-optimized` allocation is the Spot production-grade standard.
6. ALB cross-zone is ON by default and free; NLB is OFF by default and incurs cross-AZ data transfer cost when enabled. For stickiness, ALB is cookie-based (Duration/Application), NLB is Source IP affinity.
