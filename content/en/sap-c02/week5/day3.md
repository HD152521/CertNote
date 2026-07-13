# Day 3 - CloudFront Advanced: Why CDN Is More Than Simple Caching

When an internet user sends a request from Seoul to a US East server, ~180ms round-trip latency results. The speed of light limit. CDN's (Content Delivery Network) origin was circumventing this physical law. When Akamai first launched commercial CDN in 1998, the idea was simple: "Copy content close to users." Yet 2024's CloudFront far exceeds simple caching. It's an **edge platform integrating security layer (WAF, Shield, OAC), compute layer (Lambda@Edge, CloudFront Functions), and access control (Signed URL/Cookie, Field-Level Encryption)**.

In SAP-C02, CloudFront appears standalone but more often in combination scenarios with WAF, Shield, S3, API Gateway, ALB. Understanding the historical and technical context of why each feature exists lets you solve new combination problems from principles.

## CloudFront Physical Structure: PoP and Region Edge

CloudFront's network isn't single-layer. It comprises three tiers.

```
User
  │
  ▼
Edge Location (PoP) — 400+ locations, city-level worldwide
  │ On Cache Miss
  ▼
Regional Edge Cache — 12 regions, large cache
  │ On Cache Miss
  ▼
Origin Shield — optional additional cache tier (1 specific AWS region)
  │ On Cache Miss
  ▼
Origin (S3, ALB, API Gateway, Custom HTTP, etc.)
```

**Why are these tiers critical?** Without Origin Shield, all 400 PoPs call Origin directly, causing 400 requests to flood Origin on simultaneous Cache Miss. Origin Shield acts as additional caching layer, reducing Origin load up to 99%. This is why global services use Origin Shield.

> 💡 **Related Theory**: Cache Stampede (Thundering Herd) problem. When popular cache item expires simultaneously, many requests flood Origin. Solutions: (1) Cache-Control stale-while-revalidate: serve stale response after expiration while revalidating in background. (2) Request Collapsing: CloudFront collapses simultaneous Cache Miss into "single Origin request" (default behavior). (3) Origin Shield absorbs regional Cache Miss at one layer.

> 📚 **Case Study**: 2022 World Cup Final broadcast. During Argentina vs France match, tens of millions watched simultaneously worldwide. Streaming services using AWS CloudFront managed Origin server load and maintained >99% Cache Hit Ratio via Origin Shield. When Edge Locations cached HLS segments (10-second .ts files), Origin load occurred only at cache expiration intervals despite high concurrent viewers.

## Origin Access Control (OAC): S3 Security Standard

Why is restricting S3 bucket access to CloudFront only important? If S3 bucket is public, anyone can access directly, bypassing CloudFront's WAF, geo-restriction, Signed URL protections. Forcing access through CloudFront only makes all security layers meaningful.

**OAI (Origin Access Identity) - Legacy**:
- CloudFront accesses S3 via special IAM-like identity (OAI)
- S3 Bucket Policy: `Principal: { "CanonicalUser": "<OAI>" }`
- Limitation: No SigV4 support, SSE-KMS buckets unavailable in certain regions (ap-southeast-2, etc.)

**OAC (Origin Access Control) - Current Standard**:
- SigV4 signature support (signs all S3 requests)
- All AWS regions supported (including new ones)
- Complete SSE-KMS encrypted bucket support
- Bucket Policy: `Principal: { "Service": "cloudfront.amazonaws.com" }` + `Condition: { "ArnLike": { "aws:SourceArn": "arn:aws:cloudfront::ACCOUNT:distribution/DIST_ID" } }`

> 🔍 **Deeper Dive**: Why OAC's SigV4 support matters. S3 requires SigV4 signature in request headers when decrypting GetObject requests on SSE-KMS buckets via KMS. OAI lacking SigV4 support causes `AccessDenied` on KMS bucket access. OAC has CloudFront sign S3 requests with SigV4, fully functioning with SSE-KMS buckets.

```
# OAC Bucket Policy Example
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "cloudfront.amazonaws.com"},
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*",
    "Condition": {
      "StringEquals": {
        "aws:SourceArn": "arn:aws:cloudfront::123456789012:distribution/EXXXXXXXX"
      }
    }
  }]
}
```

## Origin Failover: CloudFront-Level High Availability

CloudFront Origin Group bundles Primary and Secondary Origins providing automatic failover. Difference from Route 53 Failover is operating layer.

| Item | CloudFront Origin Failover | Route 53 Failover |
|-----|-------------------------|-----------------|
| Operating Location | CDN edge (HTTP response code-based) | DNS layer |
| Failover Trigger | HTTP 4xx/5xx response | Health Check failure |
| Failover Speed | Immediate per-request | DNS TTL + Health Check interval |
| Caching | Primary response cached | DNS response cached |

Origin Failover actual operation:
1. CloudFront requests Primary Origin (e.g., ap-northeast-2 ALB)
2. Returns 5xx or configured error code
3. Automatically retries same request to Secondary Origin (e.g., us-east-1 ALB)
4. User receives Secondary response without delay

> ⚠️ **Pitfall**: Origin Failover is "per-request." CloudFront doesn't remember state, retrying Primary on next request. If Primary continues failing, every request goes through Primary attempt → failure → Secondary conversion's 2-hop. If this delay becomes problematic, combine with Route 53 Failover to completely disable Primary at DNS level.

## Lambda@Edge vs CloudFront Functions: Edge Computing

CloudFront can execute code at 4 points in request/response flow.

```
User ──── Viewer Request ──► CloudFront ──── Origin Request ──► Origin
         (1)                              (3)
User ◄─── Viewer Response ── CloudFront ◄─── Origin Response ── Origin
         (2)                              (4)
```

**Lambda@Edge**: Supports all 4 events. Node.js, Python. Runs at Regional Edge Cache.

**CloudFront Functions**: Supports Viewer Request(1) and Viewer Response(2) only. JavaScript (lightweight). Runs at Edge Location.

| Item | CloudFront Functions | Lambda@Edge |
|-----|---------------------|-------------|
| Execution Location | Edge Location (400+) | Regional Edge Cache (12) |
| Supported Events | Viewer Req/Res | All 4 |
| Max Execution Time | <1ms | Viewer: 5 sec, Origin: 30 sec |
| Max Memory | 2MB | 128MB~10GB |
| Network Calls | ❌ | ✅ |
| Cost (1M calls) | $0.10 | $0.60+ |
| Use Cases | URL rewrite, header manipulation, simple auth | A/B testing, dynamic rendering, external API calls |

> 💡 **Related Theory**: V8 Isolates (basis of Cloudflare Workers, CloudFront Functions). Traditional serverless (Lambda) has "cold start" of hundreds of ms starting VM or container. CloudFront Functions execute code in Chromium's V8 JavaScript engine as Isolates. Isolates isolate only memory space within same process with <1ms startup overhead. Network calls forbidden because Isolate environment is extremely restricted.

CloudFront Functions example (URL rewrite):

```javascript
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  
  // SPA routing: /products/123 → /index.html
  if (uri.match(/^\/products\/\d+$/)) {
    request.uri = '/index.html';
  }
  
  // Add security header (in Viewer Response)
  // response.headers['strict-transport-security'] = {value: 'max-age=31536000'};
  
  return request;
}
```

Lambda@Edge example (A/B testing):

```javascript
// Cookie-based A/B branching in Origin Request event
exports.handler = async (event) => {
  const request = event.Records[0].cf.request;
  const cookie = request.headers.cookie;
  
  if (cookie && cookie[0].value.includes('experiment=B')) {
    request.origin.custom.domainName = 'b-version-origin.example.com';
  }
  
  return request;
};
```

> 🔍 **Deeper Dive**: Lambda@Edge region constraint. Lambda@Edge functions **must deploy in us-east-1 region**. CloudFront replicates function to Regional Edge Caches worldwide. This constraint makes using environment variables difficult (require embedding values directly in function code or reading SSM Parameter Store in us-east-1). Some improvements via Lambda@Edge Functions URL since 2023, but fundamental constraint remains.

## Content Protection: Signed URL vs Signed Cookies

Two mechanisms protect premium content (paid videos, personalized documents) via CloudFront.

**Signed URL**:
- Signature, expiration time, IP restrictions included in URL itself
- One Signed URL per file
- Use cases: download links, shared links

**Signed Cookies**:
- Signature information stored in cookie
- Single cookie issuance allows multiple file access
- Use cases: media streaming (HLS: apply same cookie to hundreds of .ts segments)

```
# Signed URL structure example
https://cdn.example.com/video.mp4
  ?Expires=1700000000
  &Signature=XXXXXXXX
  &Key-Pair-Id=KPXXXXXXXX

# Signed Cookies (3-cookie set)
CloudFront-Policy: base64(policy JSON)
CloudFront-Signature: RSA signature
CloudFront-Key-Pair-Id: key ID
```

**Key Group**: New method managing RSA keys for signing via Key Group instead of AWS CloudFront Key Pair. Manageable via IAM without account root keys.

> ⚠️ **Pitfall**: Signed URL/Cookies are meaningful only combined with OAC or OAI when Origin is S3. Even if CloudFront requires Signed URL, public S3 bucket access bypasses this via direct S3 URL. Complete protection requires private S3 bucket with OAC restricting CloudFront-only access.

## Field-Level Encryption: Field-Level Protection

HTTPS encrypts data in transit but decrypts at CloudFront Edge → Origin span. Sensitive data like credit card numbers, ID numbers exist briefly as plaintext in CloudFront memory.

Field-Level Encryption (FLE) **additionally encrypts specific form fields at CloudFront Edge using asymmetric key (RSA public key)**. Remains encrypted to Origin, decryptable only by services (e.g., payment processor) possessing private key.

```
User → HTTPS → CloudFront Edge
           │ FLE: encrypt card_number with RSA public key
           ▼
  Origin (ALB) → receive encrypted card_number
           │ only payment service decrypts with private key
```

Application targets: maximum 10 specific fields in POST requests.
Standard: RSA with OAEP (SHA-256).

> 💡 **Related Theory**: End-to-End Encryption (E2EE) vs Point-to-Point Encryption. HTTPS is Point-to-Point with encryption-decryption at each hop (client→CloudFront, CloudFront→Origin). FLE is E2EE where no one between client and final decryption service sees plaintext. PCI-DSS recommends E2EE for card data; FLE is AWS standard pattern meeting this requirement.

## Geo Restriction (Geographic Restriction)

CloudFront Distribution level allows (Allowlist) or blocks (Blocklist) specific countries. Country determination uses CloudFront's internal GeoIP database.

- **Allowlist**: allow specified countries only (block others)
- **Blocklist**: block specified countries only (allow others)

Difference from Route 53 Geolocation: Geolocation is routing (where to send), Geo Restriction is blocking (allow/deny access).

> 📚 **Case Study**: Netflix regional content unlock avoidance (2016). Netflix began blocking VPN users due to content licensing. Specific movies available on Netflix in US but licensed exclusively to other platforms in Korea. CloudFront Geo Restriction blocking Korean IPs ensures license compliance. Completely preventing VPN users is impossible, but Geo Restriction demonstrates license compliance effort with legal significance.

## Real-Time Logs and Standard Logs

**Standard Logs** (Access Logs): Store in S3, hours delay. Query via Athena.

**Real-time Logs**: Stream immediately to Kinesis Data Streams. Seconds delay. Select desired fields only.

```
CloudFront → Kinesis Data Streams → Kinesis Data Firehose → S3/Redshift
                                 → Lambda (real-time processing)
                                 → OpenSearch (real-time search, dashboards)
```

Real-time log use cases: detect DDoS patterns immediately, monitor A/B test results real-time, block abnormal User-Agent.

## Caching Strategy: Cache-Control and Invalidation

CloudFront caching behavior determined jointly by Origin HTTP headers and CloudFront settings.

**Priority** (higher = first):
1. CloudFront Behavior TTL setting (Maximum/Minimum/Default TTL)
2. Origin's `Cache-Control: max-age=<seconds>`
3. Origin's `Expires` header

**Cache Invalidation**: Immediately invalidate already-cached files. Use `/*` pattern for complete invalidation or specific paths only. First 1,000 paths free, $0.005 per path thereafter.

**Cache Key Customization**: By default, URL only is Cache Key. Adding specific headers, cookies, query strings to Cache Key creates separate cache entry per combination. Trade-off between Cache Hit Ratio and personalization.

> 🔍 **Deeper Dive**: Adding headers to Cache Key lowers Cache Hit Ratio. Example: adding `Accept-Language` to Cache Key means `en-US`, `ko-KR`, `fr-FR` users each use different cache entries, reducing Hit Ratio to 1/language count. Conversely, can cache different responses per language. Origin returning `Vary: Accept-Language` has same effect. Must decide trade-off based on cache efficiency vs personalization degree.

## CloudFront + WAF + Shield: Multi-Layer Security

```
Internet Traffic
    │
    ▼
AWS Shield Advanced (L3/L4 DDoS auto-mitigation)
    │
    ▼
AWS WAF (L7 web attack blocking)
    │ SQL Injection, XSS, Rate Limiting, IP Blacklist, Managed Rules
    ▼
CloudFront Distribution
    │ Geo Restriction, Signed URL, Caching
    ▼
Origin (S3, ALB, API Gateway)
```

WAF + CloudFront combination benefit: WAF filters worldwide traffic at CloudFront's single entry point. More efficient and consistent than attaching WAF to each ALB.

> 💡 **Related Theory**: DDoS mitigation layers. Layer 3 (Network): IP Spoofing, ICMP flood → Shield handles. Layer 4 (Transport): SYN flood, UDP flood → Shield handles. Layer 7 (Application): HTTP flood, SQL Injection, CC attacks → WAF handles. CloudFront distributes traffic via BGP Anycast, naturally absorbing volumetric attacks.

> 📚 **Case Study**: 2020 GitHub DDoS incident (1.35Tbps). Memcached reflection amplification attack generated 1.35Tbps traffic. GitHub maintained service using Cloudflare (CDN similar to AWS) Anycast network distributing traffic across multiple PoPs. CloudFront + Shield Advanced combination defends similar attacks this way.

## Architecture Diagram: CloudFront Comprehensive Pattern

```
User ──► [Shield Advanced] ──► CloudFront Distribution
                                 │
                         ┌───────┴───────┐
                  WAF Rule Group    Geo Restriction
                  (SQL, XSS, Rate)  (blocked countries)
                         │
                ┌────────┴────────┐
       Behavior (static)    Behavior (dynamic)
         /images/*             /api/*
            │                    │
       Origin Shield        (no Origin Shield)
            │                    │
     Origin Group A        Origin Group B
       │        │             │        │
     Primary  Secondary    Primary  Secondary
     (S3+OAC) (S3+OAC)    (ALB-1) (ALB-2)
                              │
                       Lambda@Edge
                       (Origin Request:
                        A/B testing)
```

## 📝 연습 문제

**문제 1.** CloudFront is serving S3 Private bucket (SSE-KMS encrypted) content. Currently using OAI, getting AccessDenied on KMS bucket. How to resolve?

A) Change S3 bucket encryption to SSE-S3
B) Switch from OAI to OAC (SigV4 support)
C) Attach KMS permission IAM Role to CloudFront
D) Lambda@Edge handles KMS decryption

**정답: B**
해설: OAI doesn't support SigV4, causing AccessDenied on SSE-KMS bucket access. OAC signs S3 requests with SigV4, fully functioning with KMS buckets. Switch to OAC and configure S3 Bucket Policy with CloudFront Service Principal + SourceArn condition.

---

**문제 2.** Global media streaming service wants reduce Origin server load. Problem: all 400 PoPs' Cache Miss hit Origin directly. Most effective solution?

A) Increase CloudFront TTL
B) Enable Origin Shield
C) Add Lambda@Edge to Origin Request
D) Block excessive requests via WAF

**정답: B**
해설: Origin Shield places additional cache tier between Regional Edge Cache and Origin, absorbing all 400 PoPs' Cache Miss at one regional Origin Shield. Reduces Origin load up to 99%. Raising TTL improves cache efficiency but creates freshness issues.

---

**문제 3.** CloudFront must handle URL rewrite (SPA routing) and add security headers. Request rate is hundreds of millions per second, cost is critical. Most cost-efficient method?

A) Lambda@Edge (Origin Request)
B) CloudFront Functions (Viewer Request/Response)
C) ALB Lambda Target
D) API Gateway + Lambda

**정답: B**
해설: CloudFront Functions: <1ms execution + $0.10 per 1M calls, 6x cheaper than Lambda@Edge ($0.60+). URL rewrite and header manipulation are typical CloudFront Functions use cases. Lambda@Edge for external API calls or complex logic.

---

**문제 4.** Paid video streaming service delivers content via HLS (HTTP Live Streaming). Each HLS segment (.ts file) number hundreds, allow only subscribers. Most suitable method?

A) Issue Signed URL for each .ts file
B) Issue Signed Cookies (once at login)
C) CloudFront Functions handle authentication
D) Public S3 bucket, Lambda handles auth

**정답: B**
해설: HLS streaming generates hundreds of .ts segment file requests. Issuing Signed URL per file creates extreme server load and complexity. Signed Cookies issued once at login automatically include in all segment requests, highly efficient.

---

**문제 5.** Payment form credit card field needs additional encryption passing through CloudFront. HTTPS alone insufficient as CloudFront edge decrypts—requires End-to-End protection per security team. Which feature?

A) HTTPS Certificate Manager
B) Field-Level Encryption
C) WAF SQL Injection rules
D) S3 Server-Side Encryption

**정답: B**
해설: Field-Level Encryption additionally encrypts specific form fields at CloudFront Edge with RSA public key, transmitting encrypted to Origin. Only payment service with private key can decrypt, providing End-to-End protection meeting PCI-DSS requirements via AWS standard pattern.

---

**문제 6.** CloudFront must implement A/B testing. Route users to version A or B Origin based on cookie, call external experiment service API. Which compute option suitable?

A) CloudFront Functions (Viewer Request)
B) Lambda@Edge (Origin Request)
C) CloudFront Functions (Origin Request)
D) AWS Step Functions

**정답: B**
해설: External API calls impossible in CloudFront Functions (network calls forbidden). Lambda@Edge in Origin Request event enables external API calls, dynamically changing Origin based on cookies. CloudFront Functions unsuitable due to 1ms limit and network call prohibition.

---

**문제 7.** SaaS company operates CloudFront with us-east-1 ALB and eu-west-1 ALB as Origins. When us-east-1 ALB returns 5xx errors, auto-failover to eu-west-1. Which configuration needed?

A) Route 53 Failover routing only
B) CloudFront Origin Group (Primary: us-east-1 ALB, Secondary: eu-west-1 ALB)
C) Lambda@Edge error detection then Origin change
D) CloudFront + Route 53 Health Check combination

**정답: B**
해설: CloudFront Origin Group provides Origin Failover automatically retrying Secondary Origin on Primary 5xx response. Switches immediately based on HTTP response code without DNS TTL delay.

---
