# Day 4 - Content Delivery and DNS: CloudFront, Route 53, Edge Services

Through yesterday we looked at the "internal infrastructure" of servers, storage, and networking. Today it's the outward-facing services that **deliver the content that infrastructure produces to users worldwide, fast**. There are two core questions — "how do we serve even a faraway user quickly (CloudFront)" and "when a user types a domain name, where do we send them (Route 53)." Together, these two form the "Edge" services.

Today we'll lay out, at an intro level, how a CDN works (CloudFront), how DNS works (Route 53), and how the two collaborate.

## The Problem of Distance: Why the Edge Is Needed

If the server is in Virginia in the U.S. and the user is in Seoul, the data has to make a round trip across the Pacific. Even the speed of light has a limit, so physical distance directly becomes latency. Fetching an image, video, or web page from the other side of the globe every time is slow.

The solution is simple — **pre-position the content close to the user.** For this, AWS operates hundreds of small outposts worldwide called **Edge Locations**. Instead of the faraway origin server, users receive content from the nearest edge.

> 💡 **Related theory**: An edge location is a different concept from a Region or an Availability Zone (AZ). Regions and AZs are the large data-center clusters where the actual data and computation live, while edge locations are far smaller and far more numerous outposts that cache (temporarily store) content to deliver it close to users.

## CloudFront: AWS's CDN

CloudFront is AWS's **CDN (Content Delivery Network)**. A CDN is a service that caches content at edge locations worldwide and delivers it to users quickly from a nearby location.

Seen as a single flow, its operation is:

1. A user requests content (e.g., an image).
2. If the nearest edge location has that content in its cache, it serves it immediately (cache hit).
3. If not, the edge fetches it once from the origin (e.g., an S3 bucket or EC2), serves it to the user, and simultaneously stores it in the cache.
4. The next user receives it quickly from the edge's cache.

| Concept | Meaning |
|------|------|
| Origin | The original source of the content (S3, EC2, ALB, etc.) |
| Edge Location | An outpost that caches content and delivers it close to users |
| Cache Hit/Miss | Content is present/absent at the edge |
| TTL | How long to keep the cache (Time To Live) |

CloudFront's benefits aren't just speed. It also reduces the load on the origin server (the edge absorbs the requests) and provides security features like HTTPS and DDoS protection (AWS Shield) at the edge.

> 📚 **Case study**: A video-streaming service wants to serve popular videos to the whole world quickly. Put the original videos in S3 and place CloudFront in front, and a Seoul user receives them from an edge near Seoul, while a London user receives them from an edge near London. The origin S3 bears the load only once each at first, and afterward the edge absorbs most of the traffic.

> 💡 **Related theory**: CloudFront can deliver not only **static content (images, video, CSS)** but also **dynamic content**, and combined with AWS Shield (DDoS protection) and AWS WAF (web firewall), it also acts as a security layer. At an intro level, remember "CloudFront = fast delivery + origin protection."

## Route 53: AWS's DNS

Users find sites by names like `example.com`, not IP addresses like `54.239.28.85`. The **phone book that translates this domain name into an actual IP address** is DNS (Domain Name System), and AWS's DNS service is **Route 53**.

The three big things Route 53 does:

| Function | Description |
|------|------|
| Domain registration | Directly purchase and register domains like `example.com` |
| DNS routing | Connect a domain name to an IP or AWS resource (records) |
| Health Check | Check whether a target is alive, and if it's dead, send traffic elsewhere |

> 💡 **Related theory**: The 53 in the name "Route 53" comes from the standard port number DNS uses (port 53). DNS is one of the most fundamental pieces of internet infrastructure — the first step in turning a name into an address.

### Routing Policies — The Rules That Decide Where to Send

Route 53 doesn't stop at turning a name into an address; it provides policies for **"sending the same domain to different places depending on the situation."** At an intro level, you just need to know that these types exist.

| Routing policy | Concept |
|-------------|------|
| Simple | One domain to one target |
| Weighted | Distribute traffic by ratio (e.g., 90% server A, 10% new version) |
| Latency | To the region fastest for the user |
| Failover | Switch to a standby server if the primary dies |
| Geolocation | To different places based on the user's location |

> 🎯 **Scenario**: "I have servers in both the U.S. and Europe, and I want to send each user to whichever is fastest." → Route 53's Latency-based routing. It automatically connects a user to the region with the fastest response. If instead you want to "fail over to a standby if the primary dies," that's the Failover policy.

## CloudFront + Route 53: The Picture of Working Together

The two services aren't used separately — they're usually used together. Let's combine the flow.

```
[ User enters www.example.com ]
            │
            ▼
   ┌──────────────────┐
   │  Route 53 (DNS)  │  name → directs to CloudFront address
   └──────────────────┘
            │
            ▼
   ┌──────────────────┐
   │   CloudFront     │  responds from the nearest edge
   │   (edge/CDN)     │  instantly if cached, else from origin
   └──────────────────┘
            │ (only on cache miss)
            ▼
   ┌──────────────────┐
   │ Origin (S3/EC2)  │  original content
   └──────────────────┘
```

When a user enters a domain → Route 53 directs "this name goes to CloudFront" → CloudFront serves the content from the nearest edge → and only when it's not at the edge does it go to the origin (S3/EC2). With this combination, the division of roles is complete: "name resolution by Route 53, fast delivery by CloudFront, original storage by S3."

> ⚠️ **Pitfall**: It's easy to confuse CloudFront (CDN) and Route 53 (DNS). CloudFront "delivers content fast," and Route 53 "translates a name into an address." Both use edge infrastructure, but they do different jobs. "Caching content to reduce latency" = CloudFront, "routing a domain to the nearest region" = Route 53.

## Wrapping Up

Today's two protagonists are a pair that solves the distance problem. CloudFront is a **CDN** — it caches content at edge locations worldwide to deliver it quickly from a location near the user, while simultaneously protecting the origin server. Route 53 is **DNS** — it turns a domain name into an IP or AWS resource, and with routing policies like weighted, latency, and failover, it sends traffic intelligently. The two usually collaborate in the form of "Route 53 directs and CloudFront delivers."

Tomorrow we'll tie the Core Services 1 we learned this week (compute, storage, networking, edge) into a single big picture for review.

---

## 📝 연습 문제

**문제 1.** To deliver images and videos to users worldwide with low latency, you want to cache content at outposts close to users. Which service is the best fit?

A) Amazon Route 53  
B) Amazon CloudFront  
C) Amazon EBS  
D) AWS Lambda  

**정답: B**  
해설: CloudFront is AWS's CDN, caching content at edge locations worldwide to deliver it quickly from a location near the user. Route 53 is a DNS (name → address) service, EBS is block storage, and Lambda is serverless compute — all with roles different from content caching and delivery.

---

**문제 2.** Which AWS service connects a domain name a user entered (`example.com`) to an actual IP address or AWS resource?

A) Amazon CloudFront  
B) Amazon S3  
C) Amazon Route 53  
D) Amazon VPC  

**정답: C**  
해설: Route 53 is AWS's DNS service, which translates (routes) a domain name into an IP address or AWS resource and also provides domain registration and health checks. CloudFront is content delivery (CDN), S3 is object storage, and VPC is a virtual network — none of which is the agent of name-to-address translation.

---

**문제 3.** You have servers in the U.S. and Europe, and you want to automatically connect each user to the region with the fastest response. Which Route 53 routing policy is the best fit?

A) Simple routing  
B) Latency-based routing  
C) Weighted routing  
D) Failover routing  

**정답: B**  
해설: Latency-based routing is a policy that sends traffic to the region with the fastest response for the user, well-suited to reducing latency in multi-region deployments. Simple routing sends to only one target, weighted distributes by ratio, and failover is for primary/standby switching — none of which meets the "fastest region" condition.

---

**문제 4.** Which is the most accurate description of an Edge Location?

A) A large data center identical to a Region or Availability Zone  
B) An outpost, widely distributed worldwide, that caches content to deliver it close to users  
C) Dedicated storage for permanently storing databases  
D) The basic unit for running EC2 instances  

**정답: B**  
해설: An edge location is an outpost, far smaller and far more widely distributed than a Region or AZ, for caching content and delivering it close to users. It is not a large data center identical to a Region or AZ (A is wrong), nor a permanent data store (C) or an EC2 execution unit (D).

---

**문제 5.** Which most accurately distinguishes the roles of CloudFront and Route 53?

A) Both translate a domain name into an IP  
B) CloudFront caches and delivers content, and Route 53 translates a domain name into an address  
C) CloudFront is DNS and Route 53 is a CDN  
D) Both provide block storage  

**정답: B**  
해설: CloudFront is a CDN that caches content at the edge to deliver it fast, and Route 53 is a DNS that translates a domain name into an address. C, which describes the roles reversed, is wrong, and neither A ("both translate a name into an IP") nor D ("both provide block storage") is true.

---
