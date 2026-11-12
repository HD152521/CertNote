# Day 2 - AWS Shield (Standard/Advanced) and DDoS Protection: Layered Defense, CloudFront/Route 53 Integration

DDoS (Distributed Denial of Service) is summarized as "an attack that cripples a service by sending lots of traffic," but the key from a security viewpoint is that the defense mechanism is completely different depending on *which layer the attack targets*. A SYN flood (L3/4 resource exhaustion) and an HTTP flood (L7 application exhaustion) are both "floods," yet they cannot be stopped with the same tool. AWS Shield is a service designed on top of this layer distinction.

Shield comes in two tiers. **Shield Standard** is applied automatically and free to all AWS customers and absorbs common L3/L4 attacks. **Shield Advanced** is a paid subscription that provides detection and mitigation for larger attacks, cost protection, DRT (DDoS Response Team) support, and L7 integration.

## Classifying DDoS Attacks by Layer

| Attack type | Layer | Examples | First line of defense |
|-----------|------|------|----------|
| Volumetric | L3 | UDP reflection, NTP/DNS amplification | Bandwidth absorption (edge distribution) |
| State-exhaustion | L4 | SYN flood, ACK flood | SYN cookies, connection-state mitigation |
| Application | L7 | HTTP flood, Slowloris, GET/POST flood | WAF, rate-based rule, CAPTCHA |

The fundamental DDoS defense strategy has two branches. *Absorption* — the enormous bandwidth of AWS's global edge network distributes and absorbs volumetric attacks. *Filtering* — identify malicious patterns and filter them out. For L3/L4 volumetric attacks absorption is the main weapon (a scale no individual server can stop), while L7 attacks exhaust application resources even at small traffic volumes, so filtering (WAF) is the main weapon. It is a division of labor between "a bigger pipe vs a smarter filter."

### Why the Layer Distinction Decides the Answer

The three types of attack are separated by *what the attacker is trying to exhaust*. If the resource differs, the means of defense must differ as well.

- **A volumetric attack exhausts bandwidth.** When hundreds of gigabits per second fill the line, there is no room for legitimate packets to come in no matter how healthy the server is. The only defense is "a fatter pipe and more entrances," which is not something an individual customer can buy but a property that a cloud provider's global network supplies.
- **A state-exhaustion attack exhausts the connection table.** A SYN flood uses almost no bandwidth. It abuses the fact that a server holds memory for each half-open connection, filling the connection table with little traffic. The defense is not bandwidth but **a technique that verifies without creating state** (SYN cookies).
- **An application attack exhausts processing capacity.** If a single search query holds the DB for 3 seconds, 100 per second is enough to stop the service. The most dangerous thing is that the traffic graph looks ordinary. The defense is **a filter that reads the meaning of requests** (WAF).

```
[ Resources the attack exhausts and where the defense sits ]

  L3 Volumetric    L4 State exhaustion    L7 Application
  ─────────        ────────────           ───────────────
  Bandwidth drained  Connection table drained  CPU·DB·threads drained
      │                  │                      │
      ▼                  ▼                      ▼
 [Edge absorption]  [SYN cookies /          [WAF rate-based,
 anycast spreading   connection-state        CAPTCHA, Bot Control]
                     mitigation]
      │                  │                      │
 Shield Standard handles it automatically ─────┘   Shield Advanced only
 (all customers, free)                          "coordinates" WAF;
                                                WAF does the blocking
```

The right-hand end of this picture is the pitfall. **Shield does not "directly block" L7.** Shield Advanced *detects* L7 attacks and coordinates the *automatic creation and application* of WAF rules, but the one that actually filters requests is always WAF. So the statement "just turn on Shield Advanced and HTTP floods are blocked" is wrong; the accurate one is "Shield Advanced must be combined with WAF for automatic L7 mitigation to work."

A lesson that repeats in DDoS history is that "the attack scale is always bigger than expected, and the target is not the service but the infrastructure the service depends on." When the Mirai botnet attacked the DNS provider Dyn in October 2016, what actually lost connectivity were the many well-known services that used Dyn — the web servers were fine, but because names couldn't be resolved, to users it was indistinguishable from an outage. In February 2018, an attack that used internet-exposed memcached servers as reflectors and amplifiers targeted GitHub and set the record for the largest scale at the time, and the defense was carried out by diverting traffic to a mitigation service to absorb it. What the two events say in common is the premise of AWS Shield's design. First, **the layer you depend on (DNS, CDN) is your own availability boundary** — which is why Route 53 and CloudFront are first-class protected targets of Shield. Second, **amplification attacks borrow other people's servers, so they grow regardless of the attacker's own bandwidth** — which is why defense by an individual server cannot cope in principle and edge absorption is the only answer.

## Shield Standard: The Automatic, Free Baseline

Shield Standard applies to all AWS resources without separate activation. It is strongest when behind edge services like CloudFront, Route 53, and Global Accelerator — because these sit directly on the AWS backbone and edge network and absorb L3/L4 attacks at the edge.

What Shield Standard blocks:
- Common L3/L4 attacks such as SYN/UDP floods and reflection attacks
- Inline mitigation based on known malicious signatures

What Shield Standard does *not* do: precise filtering of L7 application attacks (that is WAF's job), an attack visibility dashboard, cost protection, DRT support.

Saying Shield Standard is "free" is a little misleading. More precisely, it is closer to **customers enjoying a structural property of the AWS network at no extra cost.** When edge locations are scattered around the world and advertise the same address by anycast, attack traffic that swarms in from a particular region is exhausted at that region's edge and users in other regions are not affected at all. On top of that, mitigation logic that filters common reflection and amplification patterns inline operates at all times. That is why, even with the same Shield Standard, **a workload behind an edge service and a workload directly exposed to the internet with an EIP attached to EC2 have completely different real defensive strength.** The latter gets no benefit from anycast distribution, and the capacity of a single Region and a single AZ becomes the limit. The right sentence is not "Shield is on automatically so we're safe" but **"the architecture has to be behind the edge for Shield to deliver its performance."** This is the reason the exam almost always includes CloudFront, Route 53, and Global Accelerator in the correct answer combination for DDoS questions.

## Shield Advanced: What Gets Added

With Shield Advanced you subscribe (at the account/Organization level) and then explicitly register the resources to protect. Protectable resources: CloudFront, Route 53 hosted zones, Global Accelerator accelerators, ALB/CLB, EIP (Elastic IP, i.e., EC2/NLB and so on).

The key value added:
1. **Enhanced detection and mitigation**: more sophisticated attack detection including the application layer (L7), and response to larger attacks.
2. **DDoS Response Team (DRT)/Shield Response Team (SRT)**: expert support during an attack. If you grant an IAM role (`AWSSRTAccess`) in advance, the SRT can adjust WAF rules on your behalf.
3. **Cost Protection (DDoS cost protection)**: service credits for scale-out and data transfer surge charges caused by an attack.
4. **WAF integration, fees included**: for protected resources, WAF usage charges are included in Shield Advanced, and automatic application-layer DDoS mitigation can automatically create and apply WAF rules.
5. **Global threat dashboard / real-time metrics and events**: `DDoSDetected`, `DDoSAttackBitsPerSecond`, and so on.
6. **Proactive engagement / Health-based detection**: linking a Route 53 health check reduces false positives, and at a threshold the SRT contacts you proactively.

### Standard and Advanced in One Table

| Item | Shield Standard | Shield Advanced |
|------|-----------------|-----------------|
| Activation | Automatic, all customers | **Subscription required** (account/organization level, with a commitment) |
| Price | Free | Monthly subscription fee + data transfer charges |
| Protected targets | All AWS resources (implicit) | **Explicitly registered resources** (CloudFront, Route 53 hosted zone, Global Accelerator, ALB/CLB, EIP) |
| L3/L4 mitigation | Automatic mitigation of common attacks | Enhanced detection, larger attacks, per-resource tailored mitigation |
| L7 response | **None** | WAF fees included + automatic application-layer mitigation (automatic WAF rule creation) |
| Visibility | None (only the resource's own metrics) | Attack events, CloudWatch metrics such as `DDoSDetected`, global threat dashboard |
| Expert support | None (regular Support) | SRT (Shield Response Team) support, proactive engagement |
| Cost protection | None | **DDoS Cost Protection** (credit for scale and transfer surges) |
| False-positive suppression | None | Health-based detection linked to Route 53 health checks |
| Multi-account operation | Not applicable | Applied in bulk via a Firewall Manager Shield Advanced policy |

> ⚠️ **Pitfall**: With Shield Advanced, **simply subscribing does not automatically protect all resources.** You must register resources with `create-protection` for enhanced mitigation, cost protection, and SRT support to apply. The most common cause of "I subscribed to Shield Advanced but didn't get the attack cost credit" is non-registration, and the device that keeps humans from missing this is the **Firewall Manager Shield Advanced policy** (it automatically enrolls new resources as protected targets). If the exam says "make sure newly created ALBs in a multi-account environment also get Shield Advanced protection without exception," the answer is Firewall Manager.

```bash
# 1) Subscribe (a commitment that is hard to undo, so be careful in real operation)
aws shield create-subscription

# 2) Register protected targets — the Advanced benefits apply only once you register
aws shield create-protection \
  --name "prod-cloudfront" \
  --resource-arn arn:aws:cloudfront::111122223333:distribution/E123ABC

aws shield create-protection \
  --name "prod-alb" \
  --resource-arn arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:loadbalancer/app/prod-alb/abc123

# 3) Audit what is being protected — the first command for checking missed registrations
aws shield list-protections \
  --query 'Protections[].{Name:Name,Resource:ResourceArn,Id:Id}'

# 4) Group related resources as one application to improve detection accuracy
aws shield create-protection-group \
  --protection-group-id prod-web \
  --aggregation SUM \
  --pattern BY_RESOURCE_TYPE \
  --resource-type APPLICATION_LOAD_BALANCER

# 5) Delegate response permission to the SRT (you can't do it during an attack if you haven't beforehand)
aws shield associate-drt-role \
  --role-arn arn:aws:iam::111122223333:role/AWSSRTAccessRole

# 6) Post-incident analysis: list attack events and look up detailed vectors
aws shield list-attacks \
  --start-time FromInclusive=2026-07-01T00:00:00Z \
  --end-time ToExclusive=2026-07-08T00:00:00Z \
  --query 'AttackSummaries[].{Id:AttackId,Resource:ResourceArn,Start:StartTime,Vectors:AttackVectors[].VectorType}'

aws shield describe-attack --attack-id abcd-1234 \
  --query '{Vectors:AttackProperties,Counters:AttackCounters,Mitigations:Mitigations}'
```

**Protection Group** often slips by on the exam but has big practical meaning. It is rare for an application to consist of just one ALB; CloudFront + ALB + several EIPs together make up the service. If you look at them only as individual resources, each one's traffic fluctuation is small and may fall short of the detection threshold, but **if you bundle and sum them (SUM), you can see the pressure applied to the application as a whole.** Conversely, in an auto-scaling environment where resources suddenly increase, the `BY_RESOURCE_TYPE` pattern "automatically includes newly created ALBs in this group" to prevent management omissions.

The role that delegates permission to the SRT must have a trust policy pointing to the Shield service principal.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "drt.shield.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

> ⚠️ **Pitfall**: **It is too late to prepare SRT delegation after the attack has started.** Role creation, the trust policy, and registering emergency contacts must be finished in peacetime; if you are creating an IAM role in the middle of an attack, the service stays down for that long. The same logic applies to WAF — the WAF Web ACL that the SRT will adjust on your behalf must *already exist with logging turned on* for analysis and action to be possible. **Incident response capability is built before an incident, not acquired during one.**

> 🎯 **Scenario**: "I want a refund for the Auto Scaling cost and data transfer surge charges that occurred during an attack" is a classic scenario. The answer is Shield Advanced's **Cost Protection** — for charges incurred when a protected-registered resource scaled because of a DDoS, you can request a credit. Shield Standard does not have this protection.

## L7 Defense Is Ultimately WAF's Job

The fact that Shield Advanced "handles" L7 does not mean it replaces WAF. Precise application-layer blocking is still performed by WAF rules (rate-based, managed group, CAPTCHA), and Shield Advanced *coordinates, automates, and supports* this.

- HTTP flood → block per-IP/key limit overruns with a WAF rate-based rule
- Suspicious bots → CAPTCHA/Challenge or Bot Control
- When automatic application-layer mitigation is enabled, Shield analyzes the attack pattern and automatically applies a temporary WAF rule (`Count` first → `Block`)

"Block L7 DDoS with Shield Standard" is easily used as a wrong answer choice. Shield Standard's main focus is L3/L4, and precise mitigation of L7 application attacks is handled by WAF (or Shield Advanced's WAF integration). When "HTTP flood / GET flood mitigation" comes up on the exam, think of a WAF rate-based rule first.

The actual rule that blocks an L7 flood looks like this. The trick is to **layer two tiers**: a global limit and a per-source limit.

```json
{
  "Rules": [
    {
      "Name": "PerIPBurst",
      "Priority": 5,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 1000,
          "EvaluationWindowSec": 60,
          "AggregateKeyType": "FORWARDED_IP",
          "ForwardedIPConfig": { "HeaderName": "X-Forwarded-For", "FallbackBehavior": "MATCH" }
        }
      },
      "Action": { "Block": { "CustomResponse": { "ResponseCode": 429 } } },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "PerIPBurst" }
    },
    {
      "Name": "GlobalSurgeChallenge",
      "Priority": 6,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 50000,
          "EvaluationWindowSec": 60,
          "AggregateKeyType": "CONSTANT",
          "ScopeDownStatement": {
            "NotStatement": {
              "Statement": {
                "ByteMatchStatement": {
                  "FieldToMatch": { "UriPath": {} },
                  "PositionalConstraint": "STARTS_WITH",
                  "SearchString": "/static/",
                  "TextTransformations": [{ "Priority": 0, "Type": "LOWERCASE" }]
                }
              }
            }
          }
        }
      },
      "Action": { "Challenge": {} },
      "VisibilityConfig": { "SampledRequestsEnabled": true, "CloudWatchMetricsEnabled": true, "MetricName": "GlobalSurge" }
    }
  ]
}
```

The two rules cover different failure modes. The first rule cuts off **the case where a small number of IPs hit excessively** per source, but against a distributed attack in which tens of thousands of IPs each send a little, nobody exceeds the limit and it is powerless. The second rule uses the `CONSTANT` key to look at **the total inflow to the whole endpoint**, so it reacts even to a distributed attack. However, if you set the global limit to Block, legitimate users get cut off too, so set the action to `Challenge`, letting real browsers pass silently while only automation tools are filtered out. **A two-tier configuration of "per-source Block + global Challenge"** is a form used repeatedly in practice.

If you use `AggregateKeyType: IP` in a WAF attached to an ALB behind CloudFront, **every request is aggregated under the CloudFront edge IPs**, so the rate rule effectively behaves like a global limit. In that case you must specify `FORWARDED_IP` and `ForwardedIPConfig` and use the original client IP in `X-Forwarded-For` as the basis. Conversely, if you use `FORWARDED_IP` when not behind a proxy, an attacker can forge the header at will and evade the limit indefinitely — the principle that **XFF is trusted only when a trusted proxy is in front** applies here exactly as it does elsewhere.

## Integration with CloudFront, Route 53, and Global Accelerator: Moving the Line of Defense to the Edge

The architectural principle of DDoS defense is to *absorb the attack at the edge, as far from the origin as possible.*

- **CloudFront**: If you serve static and dynamic content from the edge, L3/L4 attacks are distributed and absorbed across the edge network. The origin hides behind CloudFront, and blocking direct access to the origin (OAC + Security Group/prefix list) reduces the attack surface.
- **Route 53**: Managed DNS is distributed worldwide by anycast and is resilient to DNS-layer attacks. It is protected by Shield and absorbs DNS floods.
- **Global Accelerator**: Fixes and distributes the entry point using anycast IPs on the AWS global network. It absorbs traffic behind two static IPs and routes it to the nearest edge.

```
[ Layered defense placement — attacks come from the left, and the line of defense narrows toward the right ]

                L3/L4 volumetric / state exhaustion     L7 application
                        │                              │
 Internet ──┬─→ [Route 53 anycast DNS] ─── Shield absorbs DNS floods
          │        (name resolution layer)
          │
          └─→ [Global Accelerator / CloudFront edge]
                   ├── Shield Standard: automatic mitigation of common L3/L4
                   ├── Shield Advanced: enhanced detection + cost protection + SRT
                   └── WAF (CLOUDFRONT scope): SQLi/XSS, rate-based, Bot/CAPTCHA  ← L7 is handled here
                          │
                          │  ※ Without origin lockdown, a bypass path opens below this
                          ▼
              [ALB]  ── SG = CloudFront managed prefix list
                     ── X-Origin-Verify secret header verification
                          │
                          ▼
                    [EC2 / containers / Lambda]
                          │
                          ▼
                    [RDS / DynamoDB]  ← an attack that gets this far means defense has already failed

  Key: the success of the defense is decided by two things: "how cheaply it is filtered at the very front"
       and "whether there is any path that skips the front."
```

The edge absorption strategy exploits the properties of *anycast*. When many edges around the world advertise the same IP, BGP routes traffic to the edge nearest the source. Attack traffic too is naturally spread over several edges and does not concentrate on a single point. The idea is not "blocking the attack" but "scattering and diluting the attack." That is why hiding the origin behind the edge is the starting point of defense.

## The Weakness of Origin Exposure

Even if you serve content through CloudFront, if the attacker finds out the origin's actual IP/domain, they can bypass the edge and attack directly. Defenses:
- Restrict the origin (ALB/EC2) Security Group to the **CloudFront managed prefix list** (`com.amazonaws.global.cloudfront.origin-facing`) so only CloudFront IPs are allowed.
- Have CloudFront inject a custom header (`X-Origin-Verify`) and have the origin/ALB/WAF verify it, blocking direct requests that lack the header.
- Give the origin domain a name that is hard to guess and don't expose it in DNS.

```bash
# Look up the CloudFront origin-facing prefix list ID → use it in the SG rule
aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[].{Id:PrefixListId,Name:PrefixListName}'

# Restrict the origin ALB's security group to CloudFront ranges only
aws ec2 authorize-security-group-ingress \
  --group-id sg-0abc123 \
  --ip-permissions 'IpProtocol=tcp,FromPort=443,ToPort=443,PrefixListIds=[{PrefixListId=pl-3b927c52}]'

# Check whether the distribution is configured to inject a secret header into the origin
aws cloudfront get-distribution-config --id E123ABC \
  --query 'DistributionConfig.Origins.Items[].{Domain:DomainName,CustomHeaders:CustomHeaders.Items[].HeaderName}'
```

The leak path most often overlooked in origin concealment is **past DNS records and Certificate Transparency (CT) logs.** If `origin.example.com` was in public DNS before you adopted CloudFront, that record remains in several passive DNS databases, and a public certificate issued for the origin has its domain name permanently recorded in CT logs. In other words, **choosing an origin domain name that is "hard to guess" is not retroactively applied to a name that has already been exposed once.** So concealment is only a supplementary measure, and what actually makes the defense hold are **two strong controls: narrowing the network path with the prefix list and authenticating requests with the secret header.** If you also don't keep the secret header value in Secrets Manager and rotate it periodically, it gets reused as is when logs or configuration leak.

> 🎯 **Scenario**: "We deployed CloudFront and WAF, yet the application keeps going down from L7 floods. On investigation, the attack traffic barely shows up in the CloudFront logs." If this comes up, the cause is not the rules but the **path**. The attacker is hitting the origin ALB's DNS name or IP directly, so the entire edge control has become meaningless. The answer is not to tighten rules further but to **lock the origin with the CloudFront-only prefix list + secret header verification.** An option saying "strengthen the WAF rules" doesn't touch the cause of the problem and is wrong.

## Visibility and Response Metrics

Shield Advanced provides attack metrics in CloudWatch: `DDoSDetected` (0/1), `DDoSAttackBitsPerSecond`, `DDoSAttackPacketsPerSecond`, `DDoSAttackRequestsPerSecond`. Tie these into alarms and link them with SNS and SRT proactive engagement. Shield also records the start/end of attack events and mitigation details as events to help post-incident analysis.

Shield Advanced's *Route 53 health check-based detection* is a clever mechanism for reducing false positives. If you simply view a traffic spike as an attack, even legitimate campaign traffic becomes a target of mitigation. But if the application's health check is normal, it judges "traffic has increased but the service is healthy" and suppresses excessive mitigation. That is, it treats not *the load itself* but *a decline in service health* as the attack signal.

### Automatic L7 Mitigation Also Starts with Count

When you turn on Shield Advanced's automatic application-layer mitigation, Shield analyzes the attack pattern and automatically creates and attaches WAF rules. You choose between two modes.

| Mode | Behavior | When to use |
|------|------|-----------|
| `COUNT` | The automatically created rule **only records, without blocking** | Early adoption. Observe what Shield considers dangerous |
| `BLOCK` | The automatically created rule blocks immediately | After observation has built confidence. When unattended nights/weekends response is needed |

```bash
# First turn on automatic L7 mitigation in observation mode
aws shield enable-application-layer-automatic-response \
  --resource-arn arn:aws:cloudfront::111122223333:distribution/E123ABC \
  --action '{"Count":{}}'

# Once confidence has built up, switch to blocking
aws shield update-application-layer-automatic-response \
  --resource-arn arn:aws:cloudfront::111122223333:distribution/E123ABC \
  --action '{"Block":{}}'
```

Don't miss that the same procedure as Day 1 repeats here — **observe (Count) → check the data → switch to blocking (Block).** The more automation stands in for people, the more important this order is. If a human-made rule produces a false positive, the person who made it notices, but if an automatically generated rule blocks legitimate traffic at dawn, it is discovered only when morning comes. So an organization that sets automatic mitigation to Block must have a `BlockedRequests` surge alarm and a rollback procedure alongside it.

Automatic application-layer mitigation is activated only **if a WAF Web ACL is already associated with the protected resource.** This is because Shield has no separate blocking engine of its own and borrows WAF's rule slots. It is the typical cause of "I turned on Shield Advanced but automatic L7 mitigation isn't activated," and this one fact shows most clearly the **division of roles between Shield and WAF.**

## Wrapping Up

The key to understanding Shield is not the list of service features but **the question "what does the attack exhaust?"** Once you answer this question, the rest follows.

L3/L4 attacks that aim at bandwidth and connection tables are not the kind of problem an individual customer can defend against. So AWS makes this defense a property of the network and provides it automatically to all customers (Shield Standard). But to fully enjoy that property, the workload must be **behind the edge** — which is why Route 53, CloudFront, and Global Accelerator appear in the correct answer to DDoS questions almost every time.

L7 attacks that aim at processing capacity can't be distinguished by traffic volume, so you must **read the meaning of requests.** That is WAF's job, and Shield only coordinates it. The accurate sentence is not "Shield Advanced blocks L7" but "Shield Advanced blocks L7 through WAF," and this one-word difference creates the wrong answer choices on the exam.

The reason Shield Advanced is chosen despite being a paid subscription is not only its mitigation performance. **Someone to lean on during an attack (the SRT), protection for the bill that remains after the attack (Cost Protection), and data that can explain the attack (attack events and metrics)** — these three weigh as much in practice as technical blocking. And all three work only if **registration, delegation, and contact setup are completed in peacetime.**

Finally, **a line of defense that can be skipped is the same as no defense.** If the origin is still exposed to the internet, neither the edge's absorption nor WAF's filtering means anything. That is why the last item of DDoS defense is always "did you lock the origin," and this is the bridge leading into Day 4's perimeter architecture.

---

## 📝 Practice Questions

**Question 1.** Which statement about the difference between Shield Standard and Shield Advanced is correct?

A) Standard blocks L7 attacks, and Advanced blocks only L3/L4 attacks  
B) Standard automatically absorbs L3/L4 for all customers at no cost, and Advanced is paid and adds enhanced detection, DRT support, cost protection, and WAF integration  
C) Standard applies only to CloudFront, and Advanced applies only to EC2  
D) They are identical and differ only in name  

**Answer: B**  
Explanation: Shield Standard applies automatically and at no cost to all AWS customers and absorbs common L3/L4 attacks at the edge. Shield Advanced is a paid subscription that adds response to larger attacks, application layer integration, SRT (DRT) support, DDoS cost protection, and attack visibility metrics. Choices that describe the layer split in reverse, or that limit the applicable resources, are wrong.

---

**Question 2.** An application is receiving an HTTP GET flood (L7). What is the most direct mitigation?

A) Rely on Shield Standard  
B) Block ports with a NACL  
C) Block sources exceeding the per-IP/per-key request limit with a WAF rate-based rule  
D) Increase the EC2 instance type  

**Answer: C**  
Explanation: An L7 HTTP flood exhausts application resources even with a small traffic volume, so precise filtering is needed, and a WAF rate-based rule measures the request rate per IP/custom key and dynamically blocks sources that exceed the limit. Shield Standard focuses on L3/L4 and cannot precisely block L7, a NACL does not know layer 7 request rates, and scaling instances only increases cost and is not a fundamental mitigation.

---

**Question 3.** We want to be reimbursed for charges caused by Auto Scaling and data transfer spikes during a DDoS attack. Which feature is this?

A) Cost Protection of Shield Advanced (DDoS cost protection)  
B) AWS Budgets alerts  
C) Savings Plans  
D) Reserved Instances  

**Answer: A**  
Explanation: Shield Advanced provides service credits (Cost Protection) for charges incurred when protected, registered resources scale out and data transfer spikes due to a verified DDoS attack. Budgets is only an alert and not a refund, and Savings Plans and Reserved Instances are commitments that discount regular usage charges and have nothing to do with reimbursing attack costs.

---

**Question 4.** Content is being served through CloudFront, but an attacker bypasses edge defenses by attacking the origin ALB's real IP directly. What is the most appropriate combination of responses?

A) Change the Default Action to Block  
B) Restrict the origin Security Group to the CloudFront managed prefix list, and have the origin/WAF verify a secret custom header injected by CloudFront to block direct requests  
C) Remove CloudFront and use only the ALB  
D) Set the Route 53 TTL to 0  

**Answer: B**  
Explanation: The root cause of the edge bypass is that the origin is directly accessible. If you restrict the origin Security Group to the `com.amazonaws.global.cloudfront.origin-facing` prefix list to allow only CloudFront IPs, and verify the secret header that CloudFront adds (for example, X-Origin-Verify) at the origin/WAF, direct requests that bypass the edge are filtered out. Removing CloudFront (C) throws away the absorption defense, and Default Block or TTL changes do not solve the origin exposure problem.

---

**Question 5.** In Shield Advanced, we want to reduce false positives where a legitimate traffic surge (for example, a marketing campaign) is mistaken for an attack and over-mitigated. What is the most effective setting?

A) Raise all alarm thresholds to the maximum  
B) Integrate Route 53 health checks with the protected resources to enable health-based detection  
C) Disable WAF  
D) Turn off CloudFront  

**Answer: B**  
Explanation: Shield Advanced health-based detection also judges application health with Route 53 health checks. Even if traffic grows, if the service is healthy it is not concluded to be an attack, which suppresses over-mitigation of legitimate traffic surges. Blindly raising thresholds misses real attacks, and disabling WAF or CloudFront is the wrong direction that weakens defense.

---
