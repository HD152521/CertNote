# Day 4 - Edge Security Integration: CloudFront (OAC, Signed URLs), ACM Certificates, Perimeter Security Architecture

The WAF, Shield, and Network Firewall we've covered so far each defend a single layer. Today we integrate them into *one perimeter at the edge*. CloudFront is not just a CDN but, from a security perspective, "the first line of defense and the policy enforcement point." Here, TLS termination (ACM), origin protection (OAC), content access control (signed URLs/cookies), and WAF/Shield integration converge. Security exams ask "how do you combine these controls to minimize the attack surface?"

## CloudFront: The Hub of Security Controls

A single CloudFront distribution combines:
- **TLS Termination**: Enforce HTTPS between viewer and CloudFront (`Viewer Protocol Policy: redirect-to-https`); certificate from ACM.
- **WAF Web ACL**: Block L7 threats at the edge (Day 1).
- **Shield**: L3/L4 absorption; with Advanced, L7 integration (Day 2).
- **OAC (Origin Access Control)**: Lock S3/origin so only CloudFront can access.
- **Signed URLs/Signed Cookies**: Content-level access control.
- **Response Headers Policy**: Inject security headers like HSTS, X-Content-Type-Options.
- **Geo Restriction**: Allow/block by country.

> 💡 **Related Theory**: This is a design that *pushes the security perimeter to the network edge*. Traditionally, perimeters were at the data center entrance, but in the cloud/CDN era, the perimeter is the global edge. Filtering malicious requests at the edge before they reach the origin reduces origin load and attack surface while ensuring policies (certificates, headers, access control) are consistently enforced in one place. "Bringing the perimeter closer to users" is the key.

## OAC vs OAI: Locking Down the Origin

If you leave the S3 origin as a public bucket, anyone can access it directly by bucket URL, bypassing CloudFront (and WAF/signed URLs). **Origin Access Control (OAC)** prevents this by restricting bucket access to CloudFront only.

- **OAI (Origin Access Identity)**: Legacy mechanism. SigV2-based, SSE-KMS and some dynamic requests limited.
- **OAC (Origin Access Control)**: Current recommendation. SigV4 signing, SSE-KMS supported, all regions and dynamic requests supported, finer control. Use OAC for new configurations.

```json
// S3 bucket policy: Allow only specific CloudFront distribution
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

Using `AWS:SourceArn` to allow *only the specific distribution* is critical. Allowing only the Service principal could permit CloudFront from other accounts (preventing confused deputy issues). Best practice: keep the bucket's **Block Public Access enabled** and allow access only through OAC.

> ⚠️ **Trap**: Even if you set up OAC, if you don't update the S3 bucket policy, you'll get a 403. OAC only makes CloudFront *sign* the request with SigV4; the bucket policy provides the *allow*. Also, if the objects are encrypted with SSE-KMS, you must allow the CloudFront service principal's `kms:Decrypt` in the KMS key policy — omitting this causes access failures.

## Signed URLs / Signed Cookies: Content-Level Access Control

To grant access like "authenticated users only, for a limited time" (paid content, per-user downloads, time-limited links), use **signed URLs** (individual object) or **signed cookies** (multiple objects/paths).

- **Signed URL**: Time-limited access to one object. Example: download a single movie.
- **Signed Cookie**: Access to multiple objects under a path pattern. Example: allow subscribers full access to `/premium/*`. Use when you don't want to change URLs.

Constraints in the signing policy include:
- Expiration time (`DateLessThan`) — required
- Start time (`DateGreaterThan`)
- Source IP range (`IpAddress`) — valid only from specific IPs

The signing principal is a **trusted key group** (recommended: register public key to CloudFront, sign with private key) or legacy trusted signer (root account CloudFront key pair). Use key group for new work.

```python
# Signed URL generation (conceptual code, sign policy with RSA private key)
from datetime import datetime, timedelta
from botocore.signers import CloudFrontSigner

def rsa_signer(message):  # Sign with private key
    return private_key.sign(message, padding.PKCS1v15(), hashes.SHA1())

signer = CloudFrontSigner(KEY_PAIR_ID, rsa_signer)
url = signer.generate_presigned_url(
    "https://d123.cloudfront.net/premium/movie.mp4",
    date_less_than=datetime.utcnow() + timedelta(minutes=10)
)
```

> 🎯 **Scenario**: "Subscribers only, hundreds of videos under `/premium/`, 1 hour, but creating a new URL per object is tedious" is a common exam question. Answer: **signed cookies** (path pattern wildcard policy). For single, one-shot links: signed URL. The exam tests the choice criterion (single object vs. multiple/path).

> 🔍 **Deeper Insight**: Don't confuse CloudFront signed URLs with S3 presigned URLs. S3 presigned URLs are signed/verified by S3 directly, bypassing CloudFront, WAF, and edge caching. CloudFront signed URLs are verified at the edge, passing through all WAF, Shield, caching, and OAC protections. To gather all security and performance controls at the edge, signed CloudFront URLs + OAC lock is the answer; S3 presigned URLs skip those controls.

## ACM: Certificate Source and Constraints

**AWS Certificate Manager (ACM)** issues TLS certificates for free with automatic renewal. Two regional rules are decisive for edge security:

- **Certificates for CloudFront must be in us-east-1 (N. Virginia)**. Because CloudFront is a global edge service, certificates in other regions won't attach to CloudFront.
- **Certificates for ALB/API Gateway (regional resources) must be in that region**.

Validation methods:
- **DNS validation (recommended)**: Add a CNAME to Route 53, etc. ACM can continuously verify domain ownership for automatic renewal, enabling *fully automatic renewal*.
- **Email validation**: Manager's email approval. Auto-renewal is more fragile (manual intervention possible).

```bash
aws acm request-certificate \
  --domain-name example.com \
  --subject-alternative-names "*.example.com" \
  --validation-method DNS \
  --region us-east-1   # For CloudFront, must be us-east-1
```

The **private key of ACM-issued certificates cannot be extracted**. ACM is an integrated service (CloudFront, ALB, API Gateway) that safely distributes and uses the key; users never touch the private key — structurally removing key exposure risk. If you need a certificate to install directly on EC2, you must use (Private CA or) external certificates stored in IAM/Secrets, not ACM.

> 💡 **Related Theory**: ACM's design of "not exposing private keys" follows the principle of *minimizing key custody*. When private keys never reach user hands, exposure and misuse paths disappear. This mirrors HSM and KMS thinking: "don't handle secrets directly; let services use them." Combined with automatic renewal, it structurally reduces certificate-expiration outages (a common operational incident).

## TLS Policy and Security Headers

CloudFront's **Security Policy (Minimum Protocol Version)** rejects weak TLS (1.0/1.1) and weak ciphers, enforcing TLSv1.2_2021 and above. Use **Response Headers Policy** to inject:
- `Strict-Transport-Security` (HSTS): Enforce HTTPS, prevent downgrade
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options` / `Content-Security-Policy`: Mitigate clickjacking and XSS
- `Referrer-Policy`, `Permissions-Policy`

Injecting these headers from CloudFront applies them consistently without touching origin code.

## Perimeter Security Architecture: The Complete Picture

```
[User]
   │ HTTPS (TLSv1.2+, ACM certificate @us-east-1)
   ▼
[Route 53] ── DNS, Shield protection
   │
   ▼
[CloudFront Edge]
   ├─ WAF Web ACL (CLOUDFRONT scope): SQLi/XSS/rate-based
   ├─ Shield (Std automatic / Adv registered)
   ├─ Geo Restriction
   ├─ Signed URLs/Cookies: Content access control
   ├─ Response Headers Policy: HSTS/CSP
   └─ OAC: Origin lock
   │  (Origin SG = CloudFront prefix list, X-Origin-Verify header)
   ▼
[S3 (Block Public Access ON) / ALB → Origin]
```

Design principles summary:
1. **Force all entry through the edge** and block direct origin access (OAC, prefix list, secret header).
2. **Terminate and enforce TLS at the edge** with ACM auto-renewal certificates.
3. **Handle L7 threats with WAF, L3/4 with Shield** at the edge.
4. **Granulate content access with signed URLs/cookies**.
5. **Consistently inject security headers and TLS policy** at the edge.

> ⚠️ **Trap**: If WAF is on ALB and users bypass CloudFront to access ALB directly, some controls become ineffective. If the perimeter is "the edge," attach WAF to *CloudFront (CLOUDFRONT scope)*, and lock origin ALB to CloudFront prefix list, keeping the perimeter aligned on one line. Scattered control points create bypass paths.

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
