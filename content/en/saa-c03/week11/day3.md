# Day 3 - How DNS Steers Global Traffic with "One Query for a Name"

No matter how meticulously you design a failover, what actually sends users to the new region in the last kilometer is, in the end, **DNS**. That single query where a user's browser turns `api.example.com` into an IP decides which region and which instance the traffic flows to. Route 53 became a "global traffic control plane" beyond a simple name-to-IP translator because it lets you change DNS answers dynamically based on **location, latency, weight, and health**. This article follows the working principles of DNS, Route 53's 7 routing policies, the internal behavior of Health Checks, and how Alias, Private Hosted Zone, and DNSSEC underpin safe and flexible routing.

First we must pin down the essence of DNS. DNS is the internet's oldest and most widely used distributed database, defined in 1983 in RFC 882/883 (later standardized as RFC 1034/1035). Its core design is **hierarchical delegation** — responsibility is delegated stepwise from root (.) → TLD (.com) → authoritative name server (example.com), and each level knows only what's below it. And for performance, every answer carries a **TTL (Time To Live)** so resolvers cache the result for that duration. This TTL and caching is precisely the key variable governing the speed of DNS-based failover — as we saw with RDS failover, if the cache lives long it keeps pointing at the dead place.

## The 7 Routing Policies Split by "What Signal Chooses the Answer"

Route 53's 7 routing policies aren't a list to memorize but seven answers to one question: **"on what basis is the DNS answer decided?"** Once you know which signal each policy looks at, scenario mapping happens automatically.

| Policy | Deciding signal | Representative use |
|------|----------|----------|
| **Simple** | None (fixed answer) | Single resource |
| **Weighted** | Pre-set weights | Canary / A·B testing |
| **Latency** | User→region network latency | Lowest global latency |
| **Failover** | Health Check result | Active-Passive DR |
| **Geolocation** | User's geographic location | Regulation/language-specific content |
| **Geoproximity** | Location + bias adjustment | Fine-tuning inter-region traffic share |
| **Multi-value Answer** | Health Check + randomization | Small-scale DNS round-robin |

There are a few key distinctions. **Latency vs. Geolocation** is the most confusing — Latency sends to the "fastest (lowest-latency) region," while Geolocation sends based on "which country/continent the user is in." The two often give different results — a user near a border is geographically in country A, but a region in country B may be faster on the network path. "Fast response" is Latency, "this content for users in this country (GDPR, language, licensing)" is Geolocation. **Geoproximity** is the precision version of Geolocation — it computes distance rather than simple location and adjusts with **bias** to "let this region pull in a wider area" — mainly used in Traffic Flow's visual editor.

> 💡 **Related theory**: Weighted routing implements distributed systems' **progressive delivery** at the DNS layer. Give a new version weight 10 and the existing one 90, and about 10% of queries go to the new version — a canary deployment. This is the reliability-engineering principle of "don't switch everything at once; expose it small to catch problems early." But DNS weighting works **per query (resolution) + TTL caching, not per request**, so it isn't precise — a client resolved to the 10% once keeps seeing the new version for the TTL duration. So the practical distinction is to do truly fine-grained canaries (1% of requests, header-based) at the application layer with ALB weighted target groups or App Mesh, and use DNS Weighted for coarse distribution at the region/stack level.

> ⚠️ **Pitfall**: Geolocation must always have a **default location record**. Users matching no location rule (e.g., unknown location or a region not in the rules) go to the default record, and without it, those users **get no answer and connection itself fails**. When the exam presents a Geolocation scenario where "only users in some regions can't reach the site," a missing default record is the perennial answer.

## How Health Checks Remove Dead Endpoints from the Answer

The behavior of Failover and Multi-value rests on **Health Checks**. Route 53 has health checkers in multiple locations worldwide periodically probe the target endpoint (default 30 seconds, fast is 10 seconds), and it judges "healthy" only when at least a set proportion succeed. When judged unhealthy, it automatically removes that record from the DNS answer, so users don't get the dead endpoint.

There are three kinds of Health Check. **Endpoint monitoring** (probing directly via HTTP/HTTPS/TCP), **CloudWatch Alarm-based** (converting an alarm state into health — useful for private resources that can't be probed externally, or composite metrics), and **Calculated** (combining multiple health checks with AND/OR — logic like "healthy only if both DB and cache are alive"). Thanks to this combining ability, you can express "is the application truly serviceable" beyond a simple ping.

> 🔍 **Going deeper**: In Health Checks, the **distribution of health checkers** is the key to preventing false positives. Because probes come from many locations worldwide simultaneously and judgment is by majority (default 18%+ success), a temporary blip on one network path doesn't immediately lead to failover. Turning on **String Matching** also checks not just a plain 200 response but whether a specific string (e.g., `"status":"healthy"`) is in the response body, catching the "server returns 200 but the DB connection is actually severed" zombie state. A step further is the **deep health check** pattern — making the `/health` endpoint verify the DB, cache, and downstream dependencies too. But too deep and a single downstream blip flips the whole thing to unhealthy, causing **cascading failover**, so the practical balance is to split shallow/deep checks based on the criticality of the dependency.

> 📚 **Case study**: On October 21, 2016, the DNS provider **Dyn** was hit by a massive DDoS attack, and countless services — Twitter, Netflix, Spotify, GitHub, and more — became simultaneously unreachable. The attack was the Mirai botnet, which infected IoT devices (security cameras, DVRs) and paralyzed Dyn's authoritative name servers with tens of millions of queries per second. The key lesson is that **DNS can be a single point of failure (SPOF)** — even if the application infrastructure is perfectly multi-region, if the DNS that resolves the name dies, no one can reach it. Afterward many companies adopted **DNS redundancy** (placing the same zone at multiple DNS providers), and AWS Route 53 is nearly the only AWS service with a 100% availability SLA — designed to withstand single-point attacks by being anycast-distributed worldwide. DNS is the most frequently forgotten yet most fatal dependency in architecture.

## Alias Records and CNAME: The Old Constraint of the Root Domain

The DNS standard has one thorny constraint. **A CNAME record cannot sit at the top of a domain (zone apex, i.e., `example.com` itself)**. Per the RFC, the zone apex must have required records like SOA and NS, and a CNAME means "replace all records of this name with another name," which conflicts with those required records. So with standard DNS, `www.example.com` could point to an ALB or CloudFront via CNAME, but `example.com` (the root) could not.

Route 53's **Alias record** bypasses this constraint. Alias is an AWS-specific extension that behaves like an A/AAAA record while pointing its value at an AWS resource (ALB, CloudFront, S3 website, API Gateway, VPC endpoint, etc.) — Route 53 fills in that resource's actual IP at query time and answers. Thanks to this you can **connect the root domain to an ALB too**, and unlike CNAME it's **free** (a CNAME query costs an extra round trip, but Alias is resolved internally by Route 53), with the TTL managed by AWS as well. Also, turning on `EvaluateTargetHealth` reflects the health of the resource the Alias points to into the evaluation.

> ⚠️ **Pitfall**: When you see "connect the root domain (example.com) to an ALB/CloudFront," the answer is **Alias**. Choose CNAME and you're wrong because of the zone apex constraint. Conversely, for a subdomain (www, api), CNAME is technically possible too, but when pointing at an AWS resource, Alias — which is free and does health evaluation — is almost always better. The reflex "root domain + AWS resource = Alias" protects your score on the exam.

## Private Hosted Zone, Resolver, DNSSEC: Boundaries and Trust

Route 53 provides not only public-internet DNS but also **VPC-internal-only DNS**. A **Private Hosted Zone (PHZ)** is a namespace resolved only inside specific VPCs, giving internal services private names like `db.internal.example.com` — the same name isn't exposed to the internet. You can attach multiple VPCs to one PHZ, so it's used for internal service discovery in multi-VPC environments.

What bridges on-premises and AWS DNS is the **Route 53 Resolver Endpoint**. An **Inbound Endpoint** lets on-premises resolve AWS's private names (on-prem→AWS-direction queries), and an **Outbound Endpoint** lets AWS resources resolve on-premises DNS names (AWS→on-prem direction, using conditional forwarding rules). These two endpoints complete bidirectional name resolution in a hybrid environment.

Finally, **DNSSEC** protects the **integrity** of DNS answers. Natively DNS had no way to verify whether an answer truly came from the authoritative server, making it vulnerable to **cache poisoning (DNS spoofing)** — planting a fake answer in a cache to send users to a malicious site. DNSSEC attaches a public-key cryptographic signature to each answer so the resolver can verify "this answer wasn't tampered with and is genuinely from the authoritative server." To use DNSSEC in Route 53 you need both **enabling signing on the Hosted Zone** and **registering the DS record at the domain registrar** — do only one and the chain of trust breaks.

> 💡 **Related theory**: The problem DNSSEC solves is **Integrity** among security's **CIA triad (Confidentiality, Integrity, Availability)**. A common misconception is that "DNSSEC encrypts DNS queries," but it doesn't — DNSSEC **signs** answers to detect tampering only; the query/answer content is still plaintext, so who asks what is exposed (confidentiality is separately handled by DoH/DoT). This is a standard defined in RFC 4033–4035, and the starting point of trust is the **chain of trust** that begins at the root zone's key (the IANA-managed Root Zone KSK Ceremony) and descends to TLDs and domains. The reason you must do both Hosted Zone signing and registrar DS registration in Route 53 is precisely to link this chain without a break.

## Comparing Other Clouds' DNS and Traffic Routing

| Dimension | AWS | Azure | GCP |
|------|-----|-------|-----|
| Authoritative DNS | Route 53 | Azure DNS | Cloud DNS |
| Global traffic routing | Route 53 routing policies | Traffic Manager (DNS) + Front Door (L7) | Cloud Load Balancing (anycast IP) |
| Routing method | DNS answer manipulation (client resolves) | DNS-based (Traffic Manager) | Single anycast IP (BGP) |
| Zone apex handling | Alias record | Alias record | (Cloud DNS supports apex A) |

The most fundamental difference is **whether routing is done in DNS or in the network**. AWS Route 53 and Azure Traffic Manager **change the DNS answer** to send the client to a different endpoint — simple, but switching isn't instant because of TTL caching. GCP's global load balancer, by contrast, uses a **single anycast IP** and pulls traffic to the nearest Google edge via BGP, routing at the network layer independent of DNS caching — the AWS counterpart is Global Accelerator (anycast IP). If the problem is "failover is slow because of DNS caching," it's a signal to consider an anycast-based approach (Global Accelerator) instead of DNS policies.

## Getting Hands-On with the CLI

```bash
# Alias record: connect the root domain to CloudFront
aws route53 change-resource-record-sets --hosted-zone-id ZXYZ \
  --change-batch '{"Changes":[{
    "Action":"UPSERT",
    "ResourceRecordSet":{
      "Name":"example.com.","Type":"A",
      "AliasTarget":{"HostedZoneId":"Z2FDTNDATAQYW2",
        "DNSName":"d123.cloudfront.net.","EvaluateTargetHealth":true}
    }}]}'

# Health Check: HTTPS + response body string matching
aws route53 create-health-check --caller-reference hc-1 \
  --health-check-config 'Type=HTTPS_STR_MATCH,FullyQualifiedDomainName=api.example.com,Port=443,ResourcePath=/health,SearchString=healthy'

# Failover record (Primary): tied to a health check
aws route53 change-resource-record-sets --hosted-zone-id ZXYZ \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{
    "Name":"app.example.com.","Type":"A","SetIdentifier":"primary",
    "Failover":"PRIMARY","HealthCheckId":"hc-1",
    "AliasTarget":{"HostedZoneId":"Z35...","DNSName":"alb-a...","EvaluateTargetHealth":true}}}]}'

# Create a Private Hosted Zone (VPC-internal only)
aws route53 create-hosted-zone --name internal.example.com \
  --caller-reference phz-1 \
  --vpc VPCRegion=ap-northeast-2,VPCId=vpc-0abc \
  --hosted-zone-config PrivateZone=true
```

## Wrapping Up

Route 53 turns "one query for a name" into a global traffic control device. ① The **7 routing policies** are seven answers to "what decides the answer," and the distinctions of Latency (speed), Geolocation (location/regulation), Weighted (canary), and Failover (DR) are key, and Geolocation cuts off some users if it lacks a default record. ② **Health Checks** remove dead endpoints from the answer by majority vote of distributed health checkers, and express zombie states and composite dependencies with String Matching and Calculated, but excessive deep checks invite cascading failover. ③ **Alias** bypasses the zone apex CNAME constraint to connect the root domain to AWS resources for free. ④ **Private Hosted Zone + Resolver Endpoint** provide hybrid DNS, and **DNSSEC** provides the integrity that blocks cache poisoning. As the Dyn incident showed, DNS is the most frequently forgotten SPOF, and the exam asks for the ability to map keywords to policies and record types.

In the next article, we'll look at the **migration tools that actually move data and workloads** into this cloud, now equipped with routing — DMS, SCT, Snow Family, DataSync, and MGN.

---

## 📝 연습 문제

**문제 1.** A global SaaS wants to send traffic to the region with the **lowest network latency** for users worldwide. What is the most appropriate Route 53 routing policy?

A) Geolocation
B) Latency
C) Weighted
D) Simple

**정답: B**

해설: Latency routing measures the actual network latency from the user to each region and sends to the fastest region. Geolocation (A) sends by the user's geographic location, but near a border a geographically closer region may be slower on the network, so it doesn't guarantee "lowest latency." Weighted (C) is for weighted distribution (canary/testing), and Simple (D) is a fixed answer that can't optimize latency. The key distinction is "fastest/lowest latency" = Latency, "which country/continent" = Geolocation.

---

**문제 2.** A company wants to connect the root domain `example.com` to an Application Load Balancer, but the CNAME setting is rejected. What is the correct solution?

A) Enter the ALB's fixed IP in an A record
B) Use a Route 53 Alias record
C) Force-add a CNAME at the zone apex
D) Change the NS records

**정답: B**

해설: Per the DNS standard, a CNAME can't sit at the zone apex (root domain) — it conflicts with the required SOA and NS records. A Route 53 Alias record behaves like an A record while pointing at an AWS resource like an ALB, bypassing this constraint, and it's free and does health evaluation too. A is impossible because an ALB isn't a fixed IP but dynamic, C is rejected as a standard violation, and D is a delegation record and irrelevant. "Root domain + AWS resource" = Alias.

---

**문제 3.** You want to do a canary deployment at the DNS layer, exposing a new application version to only about 10% of all users to detect problems early. What is the appropriate policy?

A) Failover
B) Weighted (new version 10, existing 90)
C) Geolocation
D) Multi-value Answer

**정답: B**

해설: Weighted routing distributes queries by weight ratio, so setting the new version to 10 and the existing to 90 gives a canary where about 10% go to the new version. Failover (A) is Active-Passive switching for DR, Geolocation (C) is location-based, and Multi-value (D) is health-check-based round-robin, not ratio control. But it's worth remembering together that DNS Weighted is per-query + TTL caching so it isn't precise; for per-request fine-grained canaries, an ALB weighted target group is more suitable.

---

**문제 4.** After setting up Geolocation routing, reports come in that users in some regions can't reach the site at all. What is the most likely cause?

A) Health Check is disabled
B) There's no default record for users matching no location rule
C) The TTL is too long
D) DNSSEC isn't configured

**정답: B**

해설: Geolocation sends users matching no defined location rule (unregistered region, unknown location) to the default record, and without this default they get no answer at all and connection fails. A disabled Health Check (A) only fails to exclude the unhealthy — different from a total inability to connect; TTL (C) is just caching time and doesn't block reachability; and DNSSEC (D) is integrity verification and irrelevant. Geolocation must always have a default record.

---

**문제 5.** Servers in an on-premises data center must be able to resolve a private DNS name inside an AWS VPC (`db.internal.example.com`). What is the appropriate configuration?

A) Add records to a Public Hosted Zone
B) Route 53 Resolver Inbound Endpoint + Private Hosted Zone
C) Only a Route 53 Resolver Outbound Endpoint
D) A CloudFront distribution

**정답: B**

해설: AWS-internal private names are defined in a Private Hosted Zone, and for on-premises to resolve those names (on-prem→AWS-direction queries) you need a Route 53 Resolver **Inbound** Endpoint — the on-prem DNS sends queries to this endpoint. An Outbound Endpoint (C) is the reverse, used when AWS resolves on-prem names, so the direction is wrong. A Public Hosted Zone (A) exposes private names to the internet, so it's inappropriate, and CloudFront (D) is a CDN and irrelevant. Direction (Inbound = on-prem→AWS) is the key.

---

**문제 6.** A security team wants to prevent **cache poisoning** where DNS answers are tampered with to lure users to a malicious site. What is the appropriate control and its nature?

A) Enable DNSSEC — attach signatures to answers to verify integrity
B) Enable DNSSEC — encrypt DNS queries to ensure confidentiality
C) Switch to a Private Hosted Zone
D) Set the TTL to 0

**정답: A**

해설: DNSSEC attaches a public-key signature to each DNS answer so the resolver can verify the answer's integrity (untampered and genuinely from the authoritative server), blocking cache poisoning — it solves Integrity in CIA. B is a common misconception: DNSSEC does **not** encrypt queries/answers (confidentiality is the realm of DoH/DoT); it only signs. A Private Hosted Zone (C) is just an internal-only namespace, not tamper-prevention, and TTL 0 (D) only removes caching and can't block a forged answer itself. In Route 53 you must do both Hosted Zone signing and registrar DS registration to complete the chain of trust.

---

**문제 7.** An architect configured multi-region failover with a Route 53 Failover policy, but even when failover triggers, users keep connecting to the dead region for a while. What is the most appropriate action to make switching faster?

A) Disable the Health Check
B) Set the record's TTL short (e.g., 60 seconds), and if faster switching is needed, consider Global Accelerator (anycast)
C) Change the policy to Geolocation
D) Switch the Hosted Zone to Private

**정답: B**

해설: The switching speed of DNS-based failover is governed by the record TTL and client caching, so a short TTL lets resolvers pick up the new answer faster. If you need instant switching independent of DNS caching, consider Global Accelerator, which uses a single anycast IP for network-layer routing. Disabling the Health Check (A) removes unhealthy detection and actually blocks failover, Geolocation (C) is location-based and irrelevant to failover speed, and switching to Private (D) is internal DNS unrelated to public failover. TTL is the key variable of DNS failover speed.

---

## 📌 Key Takeaways

Route 53 steers global traffic by dynamically changing DNS answers based on location, latency, weight, and health. The 7 policies are answers to "what decides the answer," with Latency (speed), Geolocation (location/regulation, default record required), Weighted (canary), and Failover (DR) being key. Health Checks remove dead endpoints by majority vote of distributed checkers and express zombie/composite dependencies with String Matching and Calculated. Alias bypasses the zone apex CNAME constraint to connect the root domain to AWS resources for free. Private Hosted Zone + Resolver Endpoint (Inbound = on-prem→AWS, Outbound = AWS→on-prem) provide hybrid DNS, and DNSSEC provides cache-poisoning prevention (integrity, not encryption) via an RFC 4033-based chain of trust. As the 2016 Dyn incident showed, DNS is the most fatal SPOF, and if failover is slow due to DNS caching, anycast (Global Accelerator) is the alternative.
