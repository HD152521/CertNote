# Day 4 - CloudFront and Storage Gateway: The Internal Structure of a CDN and Hybrid Storage Patterns

CloudFront is not a simple cache server. Since its launch in 2008, it has expanded to more than 400 edge PoPs (Points of Presence), and beyond an HTTP cache it handles edge computing, TLS termination, WAF, signature-based authentication, and dynamic content acceleration. Netflix being able to stream video to 100 million concurrent viewers, and Amazon Prime Video keeping low latency worldwide, are both thanks to the CloudFront architecture.

This article covers CloudFront's cache-layer structure (PoP → Regional Edge Cache → Origin Shield), OAC's signing mechanism, the difference in execution location between Lambda@Edge and CloudFront Functions, and the internal behavior of Storage Gateway's four modes. And it lays out the criteria for when to use DataSync, when to use Storage Gateway, and when to use the Snow Family.

## CloudFront's Three-Layer Cache Structure

CloudFront isn't adequately described by "it caches at the edge." In reality, it operates in a three-layer structure.

```
[ CloudFront cache layers ]

User (Seoul)
    ↓
PoP (Edge Location) - Seoul PoP
    ↓ (on cache miss)
Regional Edge Cache (REC) - ap-northeast region REC
    ↓ (on REC miss too)
Origin Shield (optional additional layer)
    ↓ (on Origin Shield miss too)
Origin (S3, ALB, EC2, etc.)
```

**PoP (Point of Presence, Edge Location)**: closest to the user. 400+ cities worldwide. Cache capacity is small, so it holds only frequently requested popular content.

**Regional Edge Cache (REC)**: a few placed per geographic region (Asia-Pacific, North America, Europe, etc.). It has a larger cache than a PoP, so it holds less-popular content longer. When a PoP misses, it checks the REC first, which greatly reduces origin load.

**Origin Shield**: an optional intermediate cache layer. Place it in a specific AWS region and all RECs' cache-miss requests go to the origin through Origin Shield. It consolidates traffic hitting the same origin from various regions into a single path, minimizing the number of concurrent requests to the origin. It's especially effective when a multinational media company distributes globally from a single origin server.

> 💡 **Related theory**: This three-layer cache structure is an implementation of **Hierarchical Caching**. In CDN theory, a hierarchical cache follows the pattern L1 (small, fast, short TTL) → L2 (large, slightly slow, long TTL) → Origin. The higher the Cache Hit Ratio at each layer, the lower the origin load and cost. Looking at `CacheHitRate` in CloudFront's Metrics lets you measure the effect of each layer.

> 📚 **Case study**: Airbnb serves listing images to travelers worldwide via CloudFront and Origin Shield. It placed Origin Shield in us-east-1 to consolidate miss requests from all global RECs. This reduced requests to the origin image server by over 90% and cut page load times worldwide by an average of 40%. (Based on an AWS re:Invent 2021 talk.)

## Cache Behavior: CloudFront's Core Configuration Unit

A Cache Behavior is a configuration unit that applies different cache rules per URL pattern. You can set multiple Cache Behaviors on a single CloudFront Distribution.

```
[ Cache Behavior pattern example ]

Distribution: https://cdn.example.com

Behavior 1: /api/*
  - Origin: ALB (dynamic content)
  - TTL: 0 (no caching)
  - Forward all headers/cookies to origin

Behavior 2: /static/*
  - Origin: S3 bucket
  - TTL: 86400 (1 day)
  - Ignore headers/cookies (simplify cache key)

Behavior 3: /images/*.jpg
  - Origin: S3 bucket
  - TTL: 604800 (7 days)
  - Include query parameters "width", "format" in the cache key

Default: /
  - Origin: S3 bucket (SPA)
  - TTL: 3600 (1 hour)
```

**Cache Policy**: defines the cache key (what determines whether two requests share the same cache) and the TTL. The crux is which of headers, cookies, and query parameters to include in the cache key. Including a cookie in the cache key means the same URL is treated as a different cache if the cookie differs. This is why you must be careful when caching personalized content.

**Origin Request Policy**: defines which headers/cookies/query parameters to include when sending a request to the origin. It customizes the origin request independently of the cache key.

> 🔍 **Going deeper**: CloudFront's TTL determination goes through several layers. Priority: (1) `Cache-Control: no-cache/no-store` header → no caching. (2) `Cache-Control: max-age=X` or `Expires` header → use that value. (3) Cache Policy's Default TTL → used when neither is present. A Cache Policy has a Min TTL (at least this value even if the origin specifies a shorter TTL), a Max TTL (at most this value even if the origin specifies a longer TTL), and a Default TTL (when the origin has no TTL).

## OAC vs OAI: The Evolution of S3 Protection

**OAI (Origin Access Identity)** is a legacy approach introduced in 2009. It created a special CloudFront-only IAM Principal and allowed only that Principal in the S3 bucket policy. Downsides: it doesn't support SigV4, so it can't be used with SSE-KMS-encrypted buckets; and it's limited in some regions.

**OAC (Origin Access Control)** is the latest recommended approach, released in 2022.

```
[ OAC signing flow ]

User request → CloudFront edge
On cache miss:
  When CloudFront requests from S3, it signs with AWS Signature V4

Items included in the signature:
  - HTTP method
  - Request URI
  - Request headers (host, x-amz-date)
  - Request body hash
  - CloudFront Distribution ARN

S3 bucket policy verification:
  - Principal: cloudfront.amazonaws.com
  - Condition: aws:SourceArn = Distribution ARN
  → allow only requests from this Distribution
```

Advantages of OAC:
- **Supports SSE-KMS-encrypted S3 buckets** (OAI cannot)
- **Supports S3 in all AWS regions** (OAI is limited in some regions)
- SigV4 signing → stronger authentication
- Distribution ARN condition → accessible only from a specific Distribution

> ⚠️ **Pitfall**: If you use an S3 static-hosting endpoint (`bucket.s3-website-region.amazonaws.com`) as the origin, OAC does not work. OAC works only with an S3 REST endpoint (`bucket.s3.region.amazonaws.com`). If you need static-hosting features (custom error pages, index document settings), use a REST-endpoint-based S3 as the origin and handle them at CloudFront with `CustomErrorResponse`.

## Edge Computing: Lambda@Edge vs CloudFront Functions

CloudFront has two edge-computing options. The difference is **where, and how heavy a logic, you run**.

```
[ Execution location comparison ]

User
  ↓
PoP (Edge Location) ← CloudFront Functions run here
  ↓ (cache miss)
Regional Edge Cache ← Lambda@Edge runs here
  ↓
Origin Shield
  ↓
Origin
```

**CloudFront Functions**:
- Run on 400+ PoPs → closest to the user
- Runtime: JavaScript ES5 (limited API)
- Memory: 2MB, execution time: under 1ms
- Cold start: virtually none (under 100μs)
- Cost: about 1/6 of Lambda@Edge
- Supported events: Viewer Request, Viewer Response only

**Lambda@Edge**:
- Run on 13 Regional Edge Caches
- Runtime: Node.js 16.x, Python 3.11 (full runtime)
- Memory: up to 10GB, execution time: up to 30 seconds (Origin events)
- Cold start: tens to hundreds of ms
- Cost: Lambda@Edge pricing (more expensive)
- Supported events: Viewer Request, Viewer Response, Origin Request, Origin Response — all of them

```
[ Event locations ]

User → [Viewer Request] → CloudFront → [Origin Request] → Origin
User ← [Viewer Response] ← CloudFront ← [Origin Response] ← Origin
```

**Good uses for CloudFront Functions**:
- URL rewrite/redirect
- Adding/modifying request headers (e.g., `X-Custom-Header`)
- Simple authentication-token validation
- Query-parameter normalization (cache-key optimization)

**Good uses for Lambda@Edge**:
- JWT token validation (calling an external IAM or OAuth server)
- A/B testing (reading experiment settings from a DB/ElastiCache)
- Dynamic content personalization
- Origin response transformation (JSON → HTML)
- Image optimization (using the Sharp library)

> 💡 **Related theory**: Edge computing is the concept of extending **FaaS (Function as a Service)** to the CDN edge. Traditional serverless (Lambda) runs within a region, but Lambda@Edge and CloudFront Functions run close to the user to reduce RTT (Round-Trip Time). This can be seen as the cloud implementation of the **Fog Computing** architecture (an intermediate layer between edge and cloud).

## Signed URL and Signed Cookie: Content Protection

For paid video, user-only files, and time-limited downloads, use Signed URLs and Signed Cookies.

**Signed URL**: time-limited access to a single file.
- Can include an expiry (Expire), IP restriction (CIDR), and specific-path restriction
- Signed with the RSA private key of the CloudFront Signer (Key Group)
- Use case: "download this report PDF for 1 hour"

**Signed Cookie**: time-limited access to multiple files.
- One cookie grants access to all URLs matching a pattern
- Use case: "when a premium subscriber logs in, grant 24-hour access to all videos"

```
[ Signed URL generation flow ]

1. Register the RSA public key in a CloudFront Key Group
2. The server generates a signature with the RSA private key:
   - Policy: {"Resource":"https://cdn.example.com/video/*",
              "Condition":{"DateLessThan":{"AWS:EpochTime":1735689600}}}
   - Signature: Base64(RSA_SHA1(Policy))
3. Signed URL = CloudFront URL + ?Policy=...&Signature=...&Key-Pair-Id=...
4. User accesses via the Signed URL → CloudFront verifies the signature → returns content if valid
```

> 📚 **Case study**: Netflix's content distribution is based on CloudFront Signed URLs. When a user hits the play button, the Netflix backend checks that user's subscription status and issues a Signed URL valid within a time window. The video segments are fetched from CloudFront via this URL and played. It's the core mechanism preventing others from watching for free by sharing a URL.

## CloudFront + WAF: Integrated Edge Security

Attach AWS WAF to CloudFront and requests are filtered at the edge. Malicious traffic is blocked before it ever reaches the origin.

WAF's main capabilities:
- **SQL Injection, XSS detection**: OWASP Top 10-based managed rule groups
- **Rate Limiting**: limit requests per second from the same IP
- **IP whitelist/blacklist**: block malicious IPs
- **Geo restriction (Geo Match)**: block specific countries
- **Bot Control**: block known bots, CAPTCHA for unknown bots

WAF at the CloudFront level is a **global WAF** — the same rules apply at every edge. WAF at the ALB level applies only to a specific region.

> ⚠️ **Pitfall**: CloudFront Geo Restriction blocks only at the country level. Restrictions based on a specific IP range or ASN (Autonomous System Number) require WAF IP Sets or a Rate Based Rule.

## The Four Storage Gateways: Designing Hybrid Storage

Storage Gateway is a virtual appliance (a VM or hardware appliance) you install on an on-premises server. On-premises applications use it like a local file system / block storage, but the data is stored on AWS.

### S3 File Gateway: NFS/SMB → S3

An on-premises server mounts it over NFS or SMB and reads/writes files. Files are synced to S3 in the background. Frequently used files are in the gateway's local cache for a fast response.

```
[ S3 File Gateway behavior ]

On-premises server
    ↓ NFS/SMB mount
File Gateway (VM)
    ├─ local cache (frequently used files)
    └─ HTTPS → S3 bucket
               (files stored as S3 objects)
```

Use cases: backing up an on-premises file server, automatically storing on-premises-generated data in S3, accessing shared data from multiple sites.

### FSx File Gateway: SMB → FSx for Windows File Server

On-premises Windows clients access files over SMB. The File Gateway's local cache gives fast access to frequently used files, while less-used files are fetched directly from FSx for Windows File Server. You can keep using Active Directory integration as is.

Use case: solving the problem of a branch office slowly accessing headquarters' FSx for Windows File Server over the WAN. The local cache provides fast file access within the branch.

### Volume Gateway: iSCSI → S3 + EBS Snapshots

Provides iSCSI block volumes to on-premises servers. Two modes:

**Cached Volumes**: all data is stored in S3, and frequently used data is in the local cache. Minimizes on-premises local storage.

**Stored Volumes**: all data is local, and backed up to S3 asynchronously (as EBS snapshots). Local access is always fast, but local storage is required.

Use cases: backing up an on-premises DB's block storage to S3/EBS snapshots; keeping DR snapshots on AWS to restore on EC2 when needed.

### Tape Gateway: iSCSI VTL → S3/Glacier

On-premises backup software such as Veritas Backup Exec, Veeam, or IBM Spectrum Protect recognizes it as a tape library. In reality, the data is stored in S3 or Glacier.

Use cases: migrating physical tape infrastructure to the cloud without replacement; removing physical tape management while keeping tape-based regulatory retention.

## Choosing a Data-Movement Tool: DataSync vs Storage Gateway vs Snow

The three services get confusing because they all relate to "on-premises ↔ AWS data movement." But their purposes differ.

| | DataSync | Storage Gateway | Snow Family |
|--|---------|----------------|-------------|
| Main purpose | migration/sync | permanent hybrid access | offline bulk transfer |
| Connection | internet/Direct Connect | internet/Direct Connect | physical device shipping |
| Storage type | file, object | file, block, tape | any data |
| Real-time sync | scheduled/real-time | continuous cache sync | N/A |
| Offline capable | no | no | yes |
| Suitable scale | TB to hundreds of TB | any scale | PB scale |

**Choose DataSync**: to bulk-transfer data from an on-premises file server → S3/EFS/FSx, or to copy data between AWS services. "Migration" is the crux.

**Choose Storage Gateway**: when an on-premises app must keep using AWS storage "as if local." "Permanent hybrid operation" is the crux.

**Choose Snow Family**: when internet bandwidth is too narrow and transfer would take weeks or more. Remote areas with no internet, internet transfer barred for security, petabyte-plus volumes. "Offline physical transfer" is the crux.

> 💡 **Related theory**: The need for the Snow Family comes from the gap between the **law of storage (Kryder's Law)** and the **growth rate of network bandwidth**. HDD density grows about 40% a year, but network bandwidth growth can't keep up. Transferring 1PB of data over a 1Gbps internet link takes about 12 days. A Snowball Edge can move 100TB in 2-3 days by shipping. This problem, first analyzed in Jim Gray's paper (2003, "Distributed Computing Economics"), still holds today.

## CloudFront Compared with Other Clouds

| Feature | AWS CloudFront | GCP Cloud CDN | Azure CDN |
|------|---------------|--------------|-----------|
| Edge PoP count | 400+ | 127+ | 150+ |
| Edge computing | Functions + Lambda@Edge | Cloud Run Edge | Azure Functions Edge |
| WAF integration | AWS WAF (global) | Google Cloud Armor | Azure WAF |
| Origin Shield | Yes | Yes (Cloud CDN Tiered Caching) | Limited |
| Origin types | S3, ALB, EC2, API GW, custom | GCS, LB, custom | Blob, LB, custom |
| Signed URL | Yes | Yes (Cloud CDN Signed URLs) | Yes |
| HTTP/3 | Yes | Yes | Partial |

GCP Cloud CDN leverages Google's global network (SDN-based) directly, giving high infrastructure efficiency. But its edge-computing capabilities are less mature than CloudFront Functions/Lambda@Edge.

## Cementing It with the CLI

```bash
# Create an OAC
OAC_ID=$(aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "site-oac-2026",
    "Description": "OAC for static site",
    "SigningProtocol": "sigv4",
    "SigningBehavior": "always",
    "OriginAccessControlOriginType": "s3"
  }' \
  --query 'OriginAccessControl.Id' --output text)

# Create a CloudFront Distribution (S3 + OAC)
aws cloudfront create-distribution \
  --distribution-config '{
    "Origins": {
      "Items": [{
        "Id": "s3-origin",
        "DomainName": "my-site.s3.ap-northeast-2.amazonaws.com",
        "S3OriginConfig": {"OriginAccessIdentity": ""},
        "OriginAccessControlId": "'"$OAC_ID"'"
      }]
    },
    "DefaultCacheBehavior": {
      "TargetOriginId": "s3-origin",
      "ViewerProtocolPolicy": "redirect-to-https",
      "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
      "AllowedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]}
    },
    "Enabled": true,
    "DefaultRootObject": "index.html"
  }'

# Create a CloudFront Function (URL normalization)
aws cloudfront create-function \
  --name normalize-uri \
  --function-config '{"Comment":"Remove trailing slash","Runtime":"cloudfront-js-2.0"}' \
  --function-code 'function handler(event) {
    var request = event.request;
    var uri = request.uri;
    if (uri.endsWith("/") && uri !== "/") {
      request.uri = uri.slice(0, -1);
    }
    return request;
  }'

# Enable Origin Shield (Distribution update)
aws cloudfront update-distribution \
  --id E1234ABCD \
  --distribution-config '{
    "Origins": {
      "Items": [{
        "Id": "s3-origin",
        "OriginShield": {
          "Enabled": true,
          "OriginShieldRegion": "ap-northeast-2"
        }
      }]
    }
  }'

# Storage Gateway: create an S3 File Gateway cache volume
aws storagegateway create-nfs-file-share \
  --gateway-arn arn:aws:storagegateway:ap-northeast-2:123456789012:gateway/sgw-xxx \
  --location-arn arn:aws:s3:::my-data-bucket \
  --role arn:aws:iam::123456789012:role/storagegateway-role \
  --client-token $(date +%s) \
  --nfs-file-share-defaults ReadOnly=false
```

## Wrapping Up

CloudFront efficiently distributes global content with a three-layer cache structure (PoP → REC → Origin Shield). For S3 protection, OAC + a private bucket is the current standard. For edge computing, choose CloudFront Functions for lightweight URL manipulation and Lambda@Edge for complex business logic.

Storage Gateway is a hybrid structure where an on-premises app uses AWS storage permanently as if it were local. DataSync is for migration/replication work, and the Snow Family is for petabyte-scale offline transfer. These three serve different purposes, so it's important to find the keyword in the scenario.

---

## 📝 연습 문제

**문제 1.** A media company streams 4K video to users worldwide. The origin server is overloaded, and the same video is requested repeatedly from various edges around the world. Which setting minimizes origin load and raises the cache hit ratio?

A) Set the CloudFront Distribution TTL to 0
B) Enable CloudFront Origin Shield in a region close to the origin
C) Block some countries with CloudFront Geo Restriction
D) Forward all requests to the origin with Lambda@Edge

**정답: B**
해설: Origin Shield consolidates the cache-miss requests of all the world's Regional Edge Caches into a single path to the origin. Even if a cache miss occurs among worldwide requests for the same video, Origin Shield requests the origin only once. TTL=0 disables the cache. Geo Restriction blocks access. Forwarding to the origin with Lambda@Edge actually raises the load.

---

**문제 2.** A streaming service must serve content only to premium subscribers, and non-subscribers must not access it. When a subscriber logs in, they must be able to access thousands of video files while their subscription is valid. Which CloudFront feature is most suitable?

A) CloudFront Signed URL (per file)
B) CloudFront Signed Cookie (whole pattern)
C) CloudFront WAF IP whitelist
D) S3 Presigned URL (directly from S3)

**정답: B**
해설: A Signed Cookie grants access with a single cookie to all files matching a pattern (`/videos/*`). When a subscriber logs in, the server issues a Signed Cookie valid until the subscription's expiry, and the user accesses all videos with that cookie. A Signed URL applies to only one file, so you'd have to create an individual URL for thousands of files. A WAF IP whitelist is unsuitable for dynamic per-user access control.

---

**문제 3.** A company wants to send 10% of requests to a new-version origin at CloudFront for A/B testing. At the same time, it must pass the user's location info to the origin. What is the suitable solution?

A) CloudFront Functions (Viewer Request event)
B) Lambda@Edge (Origin Request event) + forward the `CloudFront-Viewer-Country` header from CloudFront
C) ALB Weighted Target Group
D) Route 53 Weighted policy

**정답: B**
해설: A/B-test logic (reading experiment settings from a DB/ElastiCache, splitting off 10%) needs Lambda@Edge's ability to run complex business logic. CloudFront automatically adds the `CloudFront-Viewer-Country` header, and you configure the Origin Request Policy to forward this header to the origin. Lambda@Edge can read this header to select the origin or pass it to the origin. CloudFront Functions can't call external systems, so its ability to implement A/B-test logic is limited.

---

**문제 4.** A manufacturer's factory has an on-premises Windows file server. It wants to migrate files to AWS while the factory's existing Windows apps keep accessing files over SMB. It wants to manage files on AWS while retaining Active Directory authentication. What is the most suitable solution?

A) AWS DataSync + S3 (direct S3 access after a one-time migration)
B) AWS Storage Gateway FSx File Gateway + Amazon FSx for Windows File Server
C) AWS Storage Gateway S3 File Gateway + S3 bucket
D) Migrate files with AWS Snowball Edge, then access S3

**정답: B**
해설: FSx File Gateway provides an SMB interface to on-premises Windows clients while connecting a local cache and FSx for Windows File Server (with AD-integration support) as the backend. Existing Windows apps keep their SMB connections while data is stored in FSx. A's S3 doesn't support SMB directly. C's S3 File Gateway supports NFS/SMB, but its AD integration isn't as native as FSx for Windows. D is a one-time migration, not permanent hybrid operation.

---

**문제 5.** A company wants to keep using its on-premises Veeam backup software while moving backup data to AWS. It wants to remove the physical tape infrastructure but can't easily replace the backup software. What is the most suitable solution?

A) Sync backup files to S3 with AWS DataSync
B) AWS Storage Gateway Tape Gateway (iSCSI VTL → S3/Glacier)
C) Replace Veeam with AWS Backup
D) Set up S3 on-premises with Amazon S3 on Outposts

**정답: B**
해설: Tape Gateway appears as a tape library to on-premises backup software (Veeam, Veritas, etc.) via an iSCSI virtual tape library (VTL). Without replacing the backup software, backups are stored in AWS S3/Glacier instead of on physical tape. DataSync is a file-migration tool and doesn't integrate directly with Veeam. AWS Backup is a separate tool, which would mean replacing Veeam. Outposts places AWS infrastructure on-premises and is unrelated to backup-software integration.

---

**문제 6.** Choose the suitable tool between Lambda@Edge and CloudFront Functions.

Situation A: Normalize the order of query parameters on requests coming into CloudFront to raise the cache hit ratio (?b=2&a=1 → ?a=1&b=2)
Situation B: Validate a user's JWT token and return 401 if invalid. JWT validation must call an external JWKS endpoint.

A) Situation A: Lambda@Edge / Situation B: CloudFront Functions
B) Situation A: CloudFront Functions / Situation B: Lambda@Edge
C) Both CloudFront Functions
D) Both Lambda@Edge

**정답: B**
해설: Situation A is lightweight URL manipulation that only reorders query parameters, ideal for CloudFront Functions (under 1ms, 2MB memory). Situation B requires an external JWKS-endpoint HTTP call, which CloudFront Functions don't support. Lambda@Edge has full Node.js/Python runtimes and external network access, so it can validate the JWT with a JWKS call. The crux is choosing the tool that fits in terms of cost and latency.
