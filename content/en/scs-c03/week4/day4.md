# Day 4 - Edge Security Integration: CloudFront (OAC, Signed URLs), ACM Certificates, Perimeter Security Architecture

So far WAF, Shield, and Network Firewall each defended one layer. Today we bind them together *at the edge into a single perimeter*. CloudFront is not just a CDN; from a security viewpoint it is "the line of defense that stands at the very front and the point where policy is enforced." TLS termination (ACM), origin protection (OAC), content access control (signed URLs/cookies), and WAF/Shield integration all come together here. The security exam asks "how do you combine these controls to minimize the attack surface."

## CloudFront: The Gathering Point of Security Controls

A single CloudFront distribution combines the following:
- **TLS termination**: Forces the viewer ↔ CloudFront segment to HTTPS (`Viewer Protocol Policy: redirect-to-https`), with the certificate from ACM.
- **WAF Web ACL**: Blocks L7 threats at the edge (Day 1).
- **Shield**: Absorbs L3/L4, and with Advanced, L7 integration (Day 2).
- **OAC (Origin Access Control)**: Locks S3/the origin so that only CloudFront can access it.
- **Signed URLs/signed cookies**: Per-content access control.
- **Response headers policy**: Injects security headers such as HSTS and X-Content-Type-Options.
- **Geo Restriction**: Country-level allow/block.

This is a design that pushes the *security perimeter* out to the edge of the network. The traditional perimeter was the data center entrance, but the perimeter in the era of cloud and CDNs is the global edge. If you filter malicious requests at the edge before they reach the origin, the origin's load and attack surface shrink, and at the same time policy (certificates, headers, access control) is enforced consistently in one place. "Bring the perimeter closer to the user" is the key.

### Four Tools for Access Control

CloudFront has four access controls whose similar names are confusing. They are **not substitutes for one another; they answer different questions.** This distinction is the foundation of Day 4's questions.

| Tool | Question it answers | Direction it controls | Target | Status |
|------|-------------|---------------|------|------|
| **OAI** (Origin Access Identity) | Who accesses the origin | CloudFront → S3 | S3 origins only | Legacy (SigV2, SSE-KMS limitations) |
| **OAC** (Origin Access Control) | Who accesses the origin | CloudFront → S3, Lambda URL, MediaStore, etc. | A wider range of origins | **Currently recommended** (SigV4, SSE-KMS support) |
| **Signed URL** | Is this user entitled to view this **one object** | Viewer → CloudFront | A single URL | Current |
| **Signed cookie** | Is this user entitled to view this **entire path** | Viewer → CloudFront | A path pattern (wildcard) | Current |

**The key is direction.** OAC/OAI are controls that *lock the back door* (blocking direct access to the origin), and signed URLs/cookies are controls that *check tickets at the front door* (who is entitled to receive the content). If you do only one of the two, a hole is sure to remain.

- If you use only signed URLs and omit OAC → users can simply download directly from the S3 bucket URL.
- If you use only OAC and omit signed URLs → anyone who knows the CloudFront URL receives the paid content.

> 🎯 **Scenario**: "We serve videos that only paying members can watch through CloudFront. Even if a member shares the link, others must not be able to watch, and at the same time no one must be able to download the original directly from the S3 bucket." If this comes up, the answer is a three-layer combination of **signed URLs (or cookies) + OAC + Block Public Access.** Options that pick only one are all wrong, and "put an IP restriction condition in the signing policy" can be offered alongside as a supplementary measure that strengthens prevention of link sharing.

## OAC vs OAI: Locking the Origin

If you leave an S3 origin as a public bucket, anyone can access it directly via the bucket URL and bypass CloudFront (and WAF/signed URLs). The mechanism that prevents this is **Origin Access Control (OAC)** — it restricts, via the bucket policy, so that only CloudFront can access S3.

- **OAI (Origin Access Identity)**: The old mechanism. Based on SigV2, with some limits on SSE-KMS and dynamic requests.
- **OAC (Origin Access Control)**: Currently recommended. SigV4 signing, SSE-KMS support, support for all Regions and dynamic requests, finer-grained control. Use OAC for new configurations.

```json
// S3 bucket policy: allow only a specific CloudFront distribution
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowCloudFrontOAC",
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::my-bucket/*",
    "Condition": {
      "StringEquals": {
        "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E123ABC"
      }
    }
  }]
}
```

It is important to allow *only a specific distribution* with `AWS:SourceArn`. If you allow only the service principal, CloudFront in other accounts may also become able to access it (confused deputy prevention). The standard practice is to **keep the bucket's Block Public Access on** and allow access through OAC only.

> ⚠️ **Pitfall**: Even if you set up OAC, if you don't update the S3 bucket policy you get a 403. OAC only makes CloudFront *sign its requests* with SigV4; the *allowing* is done by the bucket policy. Also, if the objects are SSE-KMS encrypted, you must allow the CloudFront service principal's `kms:Decrypt` in the KMS key policy — if you omit this, access fails.

The KMS key policy statement needed along with it when using an SSE-KMS bucket as the origin looks like this. Here too, the trick is to limit it to **only the specific distribution** with `AWS:SourceArn`, and this is the real thing of confused deputy defense.

```json
{
  "Sid": "AllowCloudFrontOACDecrypt",
  "Effect": "Allow",
  "Principal": { "Service": "cloudfront.amazonaws.com" },
  "Action": ["kms:Decrypt", "kms:DescribeKey"],
  "Resource": "*",
  "Condition": {
    "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/E123ABC"
    }
  }
}
```

The `AWS:SourceArn` condition repeated twice here is precisely the standard solution to the **confused deputy problem.** The structure of the problem is this — when you grant permission to a service principal (`cloudfront.amazonaws.com`), that permission is granted to "the service called CloudFront," not to "my CloudFront distribution." Without a condition, **someone in another account could read my data merely by creating their own distribution and pointing my bucket as the origin.** The service borrows my permissions to carry out someone else's request on their behalf — hence "confused deputy." The solution is always the same: **when granting permission to a service principal, always pin down the caller with `aws:SourceArn` or `aws:SourceAccount`.** This pattern appears identically not only in S3 and KMS but across the resource policies of SNS, SQS, Lambda, and EventBridge, so once you understand it, it pays off across every area of the exam.

```bash
# Create the OAC → attach it to the distribution → update the bucket policy; it works only after all three steps are done
aws cloudfront create-origin-access-control \
  --origin-access-control-config '{
    "Name": "s3-oac-prod",
    "OriginAccessControlOriginType": "s3",
    "SigningBehavior": "always",
    "SigningProtocol": "sigv4"
  }'

# Check in the distribution config that the OAC is attached to the origin (if it isn't attached, it doesn't sign at all)
aws cloudfront get-distribution-config --id E123ABC \
  --query 'DistributionConfig.Origins.Items[].{Domain:DomainName,OAC:OriginAccessControlId,OAI:S3OriginConfig.OriginAccessIdentity}'

# Check the guardrails on the bucket side — BPA should be on as the standard practice
aws s3api get-public-access-block --bucket my-bucket
aws s3api get-bucket-policy --bucket my-bucket --query Policy --output text
```

> ⚠️ **Pitfall**: When migrating from OAI to OAC, **you must not delete the existing OAI from the bucket policy right away.** This is because, while the distribution config propagates to the edges worldwide, some edges still make requests the old way. The correct order is (1) *add* an OAC allow statement to the bucket policy, (2) attach the OAC to the distribution and confirm propagation is complete, (3) only then remove the OAI allow statement. The classic way a security-hardening task causes an outage is **"turning off the old one before turning on the new one,"** and this sense of order is required in just the same way in many topics of this exam, such as certificate replacement and key rotation.

## Signed URLs / Signed Cookies: Per-Content Access Control

To allow access "only to authenticated users, only for a certain time" — as with paid content, per-user downloads, and time-limited links — use a **signed URL** (an individual object) or a **signed cookie** (multiple objects/paths).

- **Signed URL**: Time-limited access to a single object. E.g., a download link for one movie.
- **Signed cookie**: Access to many objects under a path pattern. E.g., allow subscribers all of `/premium/*`. When you don't want to change the URL.

Constraints that can be included in the signing policy:
- Expiration time (`DateLessThan`) — required
- Start time (`DateGreaterThan`)
- Source IP range (`IpAddress`) — valid only from specific IPs

The signer is a **trusted key group** (recommended; register the public key in CloudFront and sign with the private key) or the old trusted signer (the root account's CloudFront key pair). Use a key group for new setups.

The real thing of a custom policy looks like the following. The result of signing this JSON with the private key becomes the `Policy` and `Signature` parameters of a signed URL, or the `CloudFront-Policy` and `CloudFront-Signature` values of signed cookies.

```json
{
  "Statement": [
    {
      "Resource": "https://d123abcdef.cloudfront.net/premium/*",
      "Condition": {
        "DateLessThan":    { "AWS:EpochTime": 1785000000 },
        "DateGreaterThan": { "AWS:EpochTime": 1784996400 },
        "IpAddress":       { "AWS:SourceIp": "203.0.113.0/24" }
      }
    }
  ]
}
```

The three conditions each cover a different risk. `DateLessThan` cuts off **the lifetime of the link**, preventing a leaked URL from being valid forever (the only required condition), `DateGreaterThan` creates scheduled release (issued in advance and valid from a specific time), and `IpAddress` **discourages link sharing.** However, with `IpAddress`, legitimate users get cut off when their IP changes on a mobile network, and behind a corporate NAT hundreds of people share the same IP so the control's effect is diluted — **the better the control, the more you weigh the usage context before turning it on.**

```bash
# 1) Register the public key (the server keeps the private key and never distributes it)
aws cloudfront create-public-key \
  --public-key-config 'CallerReference=key-2026-07,Name=signing-key-2026-07,EncodedKey=file://public_key.pem'

# 2) Bundle into a key group — having 2 keys in the group enables zero-downtime rotation
aws cloudfront create-key-group \
  --key-group-config 'Name=premium-signers,Items=K1ABCDEF,K2GHIJKL'

# 3) Check which cache behaviors require signature verification
aws cloudfront get-distribution-config --id E123ABC \
  --query 'DistributionConfig.CacheBehaviors.Items[].{Path:PathPattern,TrustedKeyGroups:TrustedKeyGroups.Items}'
```

There is a reason for the design that manages signing keys as a **group.** If the private key used for signing leaks, every link made with that key can be forged and must be replaced immediately, but if there is only one key, the moment you replace it every legitimate link already issued dies. If you keep the new and old keys in the key group at the same time, a zero-downtime rotation is possible: **start signing with the new key, wait for the existing links to expire, and then remove the old key.** This "overlap and switch over" form is a pattern that repeats identically in KMS key rotation, certificate replacement, and API key rotation. **Rotatability is secured at design time; it is not built after an incident.**

Signed URLs/cookies **interact with the cache key.** If the signature parameters are included in the cache key, every user gets a different URL, the cache hit ratio collapses, and the origin load surges. CloudFront handles this by excluding signature parameters from the cache key, but if you misconfigure the custom query string forwarding policy, the same problem reappears. Also, **if you configure signed cookies to be forwarded to the origin, cache fragmentation occurs too** — the default is to finish access control at the edge and not forward it to the origin.

```python
# Generating a signed URL (conceptual code, signing the policy with an RSA private key)
from datetime import datetime, timedelta
from botocore.signers import CloudFrontSigner

def rsa_signer(message):  # sign with the private key
    return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())

signer = CloudFrontSigner(KEY_PAIR_ID, rsa_signer)
url = signer.generate_presigned_url(
    "https://d123.cloudfront.net/premium/movie.mp4",
    date_less_than=datetime.utcnow() + timedelta(minutes=10)
)
```

> 🎯 **Scenario**: "Subscribers only get access to hundreds of videos under `/premium/` for one hour, and generating a new URL for every object is cumbersome" is a classic scenario. The answer is a **signed cookie** (a path-pattern wildcard policy). For a one-off link limited to a single object, a signed URL. The question asks about the criterion for choosing between the two (a single object vs many/a path).

You must not confuse a signed URL with an S3 presigned URL. An S3 presigned URL is signed and verified by S3 directly and bypasses CloudFront, WAF, and edge caching. A CloudFront signed URL is verified at the edge and goes through all of WAF, Shield, caching, and OAC protection. If you want to gather security and performance controls at the edge, CloudFront signed URLs + OAC lockdown is the answer, and S3 direct presigned URLs skip those controls.

## TLS Termination at the Edge: Where to Attach the Certificate and Where to Cut

> The *lifecycle management* of certificates (issuance methods, DNS/Email validation, conditions for automatic renewal, Private CA, renewal-failure monitoring) is covered separately on **week 6 day 4**. What we cover today is the architectural decision of **how to place that certificate at the edge and in which segment to terminate TLS.**

What is decisive about ACM in edge security is two things: the **Region rule** and the **termination point.**

- **A certificate for CloudFront must be in us-east-1 (N. Virginia).** This is because it is a global edge service. If you issue it in another Region, it doesn't appear in CloudFront's selection list at all.
- **A certificate for ALB/API Gateway (Regional resources) must be in that Region.** That is, in a CloudFront + ALB configuration, **two certificates are needed** — one for viewers (us-east-1) and one for the origin (the service Region).

```bash
# For the edge: must be us-east-1
aws acm request-certificate \
  --domain-name cdn.example.com \
  --validation-method DNS \
  --region us-east-1

# For the origin ALB: the service Region
aws acm request-certificate \
  --domain-name origin.example.com \
  --validation-method DNS \
  --region ap-northeast-2
```

The **private key of a certificate issued by ACM cannot be extracted.** ACM distributes it securely to integrated services (CloudFront, ALB, API Gateway) and users cannot touch the private key — structurally eliminating the risk of key leakage. If you need a certificate to install directly on EC2, an ACM public certificate won't work and you must use another route (the detailed fork is in week 6 day 4).

ACM's design of "not exposing the private key" is the principle of minimizing *key custody.* If the private key never reaches the user's hands, the paths for leakage and misuse disappear. This is the same philosophy as HSMs and KMS — "don't handle secrets directly; let the service use them on your behalf." Combined with automatic renewal, it also structurally reduces outages caused by certificate expiry (a common operational accident).

### Two Segments, Two Protocol Policies

There are two TLS segments CloudFront is involved in, and each is controlled by a separate setting. If you mistake the two for one, you get the confusion of "we're using HTTPS, so why do they say there's a plaintext segment?"

```
[ The two TLS segments of an edge configuration ]

  Viewer ──①──→ [CloudFront edge] ──②──→ [ALB/origin] ──③──→ [EC2]

  ① Viewer Protocol Policy        : viewer ↔ CloudFront
      - allow-all           (plaintext allowed)          ← not used
      - redirect-to-https   (steers plaintext requests via 301/302)  ← common
      - https-only          (rejects plaintext with 403)         ← strongest
    + Security Policy (Minimum Protocol Version) sets the floor for TLS version and ciphers
    + Certificate: ACM @ us-east-1

  ② Origin Protocol Policy        : CloudFront ↔ origin
      - http-only           (plaintext all the way to the origin)     ← a problem in regulated environments
      - https-only          (re-encryption)            ← the key to full-path encryption
      - match-viewer        (follows what the viewer used) ← risk of unintended plaintext
    + Certificate: a Regional certificate on the origin side (public trust required)

  ③ Inside the origin             : ALB ↔ backend
      - If the target group protocol is HTTPS, this is encrypted too
      - A requirement for "end-to-end encryption" means all of ①②③
```

`match-viewer` looks convenient but is a risky choice. If the viewer connects over HTTP, **CloudFront also requests the origin over HTTP**, so the origin segment quietly becomes plaintext. If you use `redirect-to-https` together with `match-viewer`, this can happen on the first request before the redirect. In an environment where regulation requires "encryption in transit," the standard practice is to **pin it explicitly: viewer to `https-only` or `redirect-to-https`, origin to `https-only`.**

> 🎯 **Scenario**: "An audit requires 'full-path encryption.' Currently CloudFront uses HTTPS but forwards to the origin ALB over HTTP." If this comes up, the answer is **change the Origin Protocol Policy to `https-only` and attach that Region's ACM certificate to the origin**, and if the ALB-to-backend segment is also required, raise the target group protocol to HTTPS. An option like "we're using HTTPS on CloudFront so it's already satisfied" misses segment ② and is wrong, and an option like "do TLS passthrough with an NLB" loses WAF and path routing, so it is usually not appropriate in this context.

### Alternate Domain Names (CNAME) and Domain Fronting

To attach your own domain (`cdn.example.com`) to a CloudFront distribution, you must register an **Alternate Domain Name (CNAME)** and attach a certificate that includes that name. Two security implications come from this.

First, **a domain name can be registered to only one distribution.** So in principle it is impossible for another account to secretly register a domain the organization owns to its own distribution and hijack it. However, **if you delete an unused CloudFront distribution but leave its DNS record behind**, that DNS name ends up pointing to no distribution and creates the risk of **subdomain takeover.** Cleaning up DNS together when deleting a resource is not hygiene but a security measure.

Second, there is the property that the **SNI of the viewer request (the domain in the TLS handshake) and the Host header can differ.** The technique that abuses this to bypass censorship and filters is **domain fronting** — on the surface it looks like connecting to an allowed domain, but the request is actually forwarded to a different destination.

Domain fronting was once used as a censorship-circumvention tool, but at the same time it was widely abused by attackers as **a means of hiding C2 (command and control) communication behind a reputable CDN domain.** In spring 2018, major CDN and cloud providers blocked this behavior one after another, and requests with mismatched SNI and Host headers no longer pass. There are two lessons from this event. First, **reputation-based controls (domain allowlists) can't see what is behind that domain** — exactly the same point as the fundamental limitation of Day 3's SNI-based filtering. Second, so outbound control must not rely on a single domain list but **should layer DNS-layer control, connection-layer control, and behavior-based detection.** The lesson running through this whole week is that no single identifier (domain, IP, UA) is strong enough to serve as the basis of trust.

## TLS Policy and Security Headers

Use CloudFront's **Security Policy (Minimum Protocol Version)** to reject weak TLS (1.0/1.1) and weak ciphers and enforce TLSv1.2_2021 or higher. Inject the following with a **Response Headers Policy**:
- `Strict-Transport-Security` (HSTS): force HTTPS, prevent downgrades
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` / `Content-Security-Policy`: mitigate clickjacking and XSS
- `Referrer-Policy`, `Permissions-Policy`

If you inject these headers at CloudFront, they are applied consistently without touching origin code.

```bash
aws cloudfront create-response-headers-policy \
  --response-headers-policy-config '{
    "Name": "secure-baseline",
    "SecurityHeadersConfig": {
      "StrictTransportSecurity": {
        "Override": true,
        "AccessControlMaxAgeSec": 31536000,
        "IncludeSubdomains": true,
        "Preload": true
      },
      "ContentTypeOptions": { "Override": true },
      "FrameOptions": { "Override": true, "FrameOption": "DENY" },
      "ReferrerPolicy": { "Override": true, "ReferrerPolicy": "strict-origin-when-cross-origin" },
      "ContentSecurityPolicy": {
        "Override": true,
        "ContentSecurityPolicy": "default-src '\''self'\''; object-src '\''none'\''; frame-ancestors '\''none'\''"
      }
    }
  }'

# Audit the viewer segment's TLS floor and protocol policy together
aws cloudfront get-distribution-config --id E123ABC \
  --query 'DistributionConfig.{
    MinTLS:ViewerCertificate.MinimumProtocolVersion,
    SNI:ViewerCertificate.SSLSupportMethod,
    Viewer:DefaultCacheBehavior.ViewerProtocolPolicy,
    WebACL:WebACLId,
    Geo:Restrictions.GeoRestriction.RestrictionType
  }'
```

`preload` in `Strict-Transport-Security` is **very hard to undo.** Once listed in the browser preload list, that domain, including all subdomains, is forced to HTTPS-only, and it takes a long time to be removed from the list. If an internal tool or legacy system has a subdomain still served over HTTP, `includeSubDomains` and `preload` kill them all at once. **The stronger a security header, the better is not the rule; the right approach is to turn on the reversible ones first, in order** — starting with a short max-age and increasing it gradually is the standard procedure.

The decision to inject security headers at CloudFront has a hidden trade-off. The advantage is clear — even if there are several origins (S3, ALB, Lambda URL), the headers are applied consistently in one place, and application teams don't each need to implement them. The disadvantage is that **the policy drifts apart from the application.** CSP in particular depends heavily on which scripts and styles the application uses, and that knowledge lives in the application, not at the edge. So the practical compromise is **to enforce headers unrelated to the application, such as HSTS, nosniff, and frame-options, at the edge, and for application-dependent headers such as CSP, to have the application emit them while the edge doesn't overwrite them (`Override: false`).** Where you place a control should follow "where the knowledge is."

## Perimeter Security Architecture: The Integrated Picture

```
[User]
   │ HTTPS (TLSv1.2+, ACM certificate @us-east-1)
   ▼
[Route 53] ── DNS, Shield protection
   │
   ▼
[CloudFront edge]
   ├─ WAF Web ACL (CLOUDFRONT scope): SQLi/XSS/rate-based
   ├─ Shield (Std automatic / Adv registered)
   ├─ Geo Restriction
   ├─ Signed URLs/cookies: content access control
   ├─ Response Headers Policy: HSTS/CSP
   └─ OAC: origin lockdown
   │  (origin SG = CloudFront prefix list, X-Origin-Verify header)
   ▼
[S3 (Block Public Access ON) / ALB → origin]
```

Summary of design principles:
1. **Force every entry to the edge** and block direct access to the origin (OAC, prefix list, secret header).
2. **Terminate and enforce TLS at the edge**, with certificates auto-renewed by ACM.
3. **L7 threats are handled by WAF, L3/4 by Shield**, at the edge.
4. **Segment content access with signed URLs/cookies.**
5. **Inject security headers and TLS policy** consistently at the edge.

If you attach WAF to the ALB and a user bypasses CloudFront to access the ALB directly, some controls can be neutralized. If the perimeter is "the edge," attach WAF to *CloudFront (CLOUDFRONT scope)*, and block direct access to the origin ALB with the CloudFront prefix list to line up the perimeter in a single line. If control points are scattered, bypass paths appear.

### Five Paths Through Which the Perimeter Leaks

When reviewing a perimeter architecture, first count not "what did we turn on" but **"where can things slip out."** The leak paths found repeatedly in actual audits are these five.

| Leak path | How it arises | How to block it |
|-----------|---------------|-----------|
| Direct origin access | ALB/EC2 is open to the internet | CloudFront prefix list SG + `X-Origin-Verify` header verification |
| Direct S3 access | The bucket is public or the policy is loose | OAC + `AWS:SourceArn` + Block Public Access |
| Old DNS records | The previous origin name remains in DNS/CT logs | Clean up unused records, replace the origin name after moving to the edge |
| Another CloudFront distribution | Only the service principal is allowed, so another account's distribution gets access | `AWS:SourceArn` mandatory in the resource policy |
| Alternate entry points | Separate public endpoints such as API Gateway, Lambda URL, NLB | List all public endpoints and apply the same controls |

The last row is especially important. Even in an organization with a well-built CloudFront perimeter, it is common for a Lambda function URL or a separate ALB that a team hurriedly created to exist outside control. **The perimeter is determined by the level of its weakest entry point.** So the last task of perimeter design is always to count "how many endpoints in our account are reachable from the internet," and the tools that answer this question are the detection and asset-visibility services we will cover in week 5.

```bash
# A sweep for perimeter checks — count what faces the internet
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?Scheme==`internet-facing`].{Name:LoadBalancerName,DNS:DNSName,Type:Type}'

aws cloudfront list-distributions \
  --query 'DistributionList.Items[].{Id:Id,Aliases:Aliases.Items,WebACL:WebACLId,Enabled:Enabled}'

aws lambda list-function-url-configs --function-name my-func \
  --query 'FunctionUrlConfigs[].{Url:FunctionUrl,Auth:AuthType}'
```

In `lambda list-function-url-configs`, an item with `AuthType` of `NONE` is an **endpoint open to the internet without authentication.** It is the first value to check in a perimeter audit, and if necessary you can put CloudFront + OAC in front of the function URL as well to bring it inside the same perimeter.

## Wrapping Up

Reduce today's theme to one sentence and it is **"gather every entry into a single door, and hang every control on that door."** Before being a CDN, CloudFront is that door, and TLS termination, WAF, Shield, access control, security headers, and geo restriction all attach to it at once.

There are only two conditions that make this design hold. **First, is the door actually the only one?** If the origin is directly open, old DNS is alive, or another team's endpoint is outside control, the door becomes decoration. OAC, the prefix list, the secret header, and BPA are all different locks for this one purpose. **Second, what do you inspect at the door?** If origin lockdown is "blocking the back door," signed URLs/cookies are "checking tickets at the front door," and the two do not substitute for each other.

Regarding TLS, **the habit of looking at it segment by segment** produces the answer. The viewer segment and the origin segment have separate policies and separate certificates, and a requirement for "full-path encryption" means both segments. Certificates for CloudFront in us-east-1, for Regional resources in that Region — this one line is worth one question on the exam every time. *How to issue and renew* certificates is for week 6 day 4, and today's theme was *where to attach them and where to cut.*

Finally, this week's four days merge into a single sentence. **WAF reads the meaning of requests (Day 1), Shield absorbs the scale (Day 2), Network/DNS Firewall controls the ways out from inside (Day 3), and CloudFront and origin lockdown line up the perimeter in a single line so that none of these controls can be bypassed (Day 4).** The essence of edge and perimeter defense is that if any one is missing, the range that the others protect shrinks along with it.

---

## 📝 Practice Questions

**Question 1.** In a CloudFront distribution that uses S3 as the origin, users access the S3 bucket URL directly and bypass CloudFront (and WAF). What is the most appropriate response?

A) Leave the S3 bucket public and only adjust the ACL  
B) Configure OAC and allow only that CloudFront distribution (SourceArn) in the S3 bucket policy, keeping Block Public Access turned on  
C) Switch to S3 presigned URLs  
D) Block S3 traffic with a NACL  

**Answer: B**  
Explanation: Origin Access Control (OAC) makes CloudFront sign requests to S3 with SigV4, and allowing only a specific distribution through `AWS:SourceArn` in the bucket policy blocks direct access through any other path. The standard approach is to keep Block Public Access on and allow access only through OAC. A public bucket or a NACL cannot prevent the bypass, and presigned URLs actually skip edge controls.

---

**Question 2.** You want to grant subscribers access to hundreds of objects under `/premium/` for one hour without creating a separate link for each object. What is the most appropriate method?

A) Generate a CloudFront signed URL for each object  
B) CloudFront signed cookies (policy with a path-pattern wildcard)  
C) Switch the S3 bucket to public  
D) Apply OAI  

**Answer: B**  
Explanation: Signed cookies grant time-limited access to many objects under a path pattern (`/premium/*`) with a single cookie, so there is no need to create a URL for each object. Signed URLs are for a single object, so hundreds would have to be created separately. Making the bucket public removes control, and OAI is an origin-locking mechanism, not user access control.

---

**Question 3.** You are trying to attach an ACM certificate to a CloudFront distribution, but the certificate you issued does not appear in the list. What is the most likely cause?

A) The certificate was issued in a Region other than us-east-1, so it cannot be attached to CloudFront  
B) DNS validation was used  
C) It is a wildcard domain  
D) The certificate is free  

**Answer: A**  
Explanation: CloudFront is a global edge service, so the ACM certificate you attach must be in us-east-1 (N. Virginia). Certificates in other Regions do not appear in the CloudFront selection list. DNS validation actually helps with automatic renewal, and whether the certificate is a wildcard or free has no bearing on whether it can be attached.

---

**Question 4.** Which statement about the key security characteristic of certificates issued by ACM is correct?

A) You can download the private key and manually install it on EC2  
B) The private key cannot be extracted, and ACM securely deploys and automatically renews the certificate on integrated services (CloudFront/ALB/API Gateway), so the key leakage path is eliminated  
C) The certificate is single-use and must be reissued every time  
D) It can be used only over HTTP  

**Answer: B**  
Explanation: With ACM-issued certificates, the private key is never exposed to the user, and ACM deploys the certificate directly to supported integrated services and renews it automatically. Because you never handle the key directly, the leakage and misuse paths structurally disappear, and automatic renewal also reduces outages caused by expiration. That is why A is wrong: an ACM-issued key cannot be used for direct installation on EC2 (which requires the private key).

---

**Question 5.** You want to align the edge boundary in a single line to prevent bypass. Where should WAF be attached, and how should the origin be protected?

A) Attach WAF only to the ALB and leave the ALB public  
B) Attach WAF to CloudFront (CLOUDFRONT scope), block direct access to the origin ALB with the CloudFront managed prefix list, and validate a CloudFront secret header  
C) Turn off WAF and use only Security Groups  
D) Attach WAF to both CloudFront and the ALB but leave the origin public  

**Answer: B**  
Explanation: If the boundary is the edge, attach WAF to CloudFront (CLOUDFRONT scope) so that all entry is evaluated at the edge, block direct access to the origin ALB with the CloudFront prefix list, and validate the secret header (X-Origin-Verify) injected by CloudFront to prevent edge bypass. Protecting only the ALB or leaving the origin public leaves a bypass path, and turning off WAF removes L7 defense.

---
