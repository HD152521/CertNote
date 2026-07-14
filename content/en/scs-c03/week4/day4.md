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

## 📝 연습 문제

**문제 1.** S3를 오리진으로 하는 CloudFront 배포에서 사용자가 S3 버킷 URL로 직접 접근해 CloudFront(및 WAF)를 우회한다. 가장 적절한 대응은?

A) S3 버킷을 공개로 두고 ACL만 조정  
B) OAC를 구성하고 S3 버킷 정책에서 해당 CloudFront 배포(SourceArn)만 허용, Block Public Access는 켜둔다  
C) S3 presigned URL로 전환  
D) NACL로 S3 트래픽 차단  

**정답: B**  
해설: Origin Access Control(OAC)은 CloudFront가 SigV4로 서명해 S3에 요청하게 하고, 버킷 정책에서 `AWS:SourceArn`으로 특정 배포만 허용하면 다른 경로의 직접 접근이 차단된다. Block Public Access를 켜둔 채 OAC로만 접근하게 하는 것이 정석이다. 공개 버킷·NACL은 우회를 못 막고, presigned URL은 오히려 엣지 통제를 건너뛴다.

---

**문제 2.** 구독자에게 `/premium/` 하위 수백 개 객체를 1시간 동안 접근 허용하되, 객체마다 별도 링크를 만들고 싶지 않다. 가장 적절한 방법은?

A) CloudFront 서명 URL을 객체마다 생성  
B) CloudFront 서명 쿠키(경로 패턴 와일드카드 정책)  
C) S3 버킷을 공개로 전환  
D) OAI 적용  

**정답: B**  
해설: 서명 쿠키는 경로 패턴(`/premium/*`) 하위 다수 객체에 대한 시간 제한 접근을 단일 쿠키로 부여하므로 객체마다 URL을 만들 필요가 없다. 서명 URL은 단일 객체용이라 수백 개를 따로 만들어야 한다. 공개 전환은 통제를 없애고, OAI는 오리진 잠금 메커니즘이지 사용자 접근 통제가 아니다.

---

**문제 3.** CloudFront 배포에 ACM 인증서를 연결하려는데 발급한 인증서가 목록에 나타나지 않는다. 가장 가능성 높은 원인은?

A) 인증서가 us-east-1이 아닌 다른 리전에 발급되어 CloudFront에 붙지 않는다  
B) DNS 검증을 사용했기 때문  
C) 와일드카드 도메인이라서  
D) 인증서가 무료라서  

**정답: A**  
해설: CloudFront는 글로벌 엣지 서비스라서 연결할 ACM 인증서가 반드시 us-east-1(N. Virginia)에 있어야 한다. 다른 리전 인증서는 CloudFront 선택 목록에 나타나지 않는다. DNS 검증은 오히려 자동 갱신에 유리하고, 와일드카드·무료 여부는 연결 가능성과 무관하다.

---

**문제 4.** ACM이 발급한 인증서의 보안상 핵심 특성으로 옳은 것은?

A) 개인키를 다운로드해 EC2에 수동 설치할 수 있다  
B) 개인키를 추출할 수 없고 ACM이 통합 서비스(CloudFront/ALB/API Gateway)에 안전하게 배포·자동 갱신하므로 키 유출 경로가 제거된다  
C) 인증서가 1회용이라 매번 재발급해야 한다  
D) HTTP에서만 사용 가능하다  

**정답: B**  
해설: ACM 발급 인증서는 개인키가 사용자에게 노출되지 않으며, ACM이 지원 통합 서비스에 직접 배포하고 자동 갱신한다. 키를 직접 다루지 않으므로 유출·오용 경로가 구조적으로 사라지고, 자동 갱신으로 만료 장애도 줄인다. 그래서 EC2 직접 설치(개인키 필요)에는 ACM 발급 키를 쓸 수 없다는 점이 A를 틀리게 만든다.

---

**문제 5.** 엣지 경계를 한 줄로 정렬해 우회를 막으려 한다. WAF를 어디에 붙이고 오리진을 어떻게 보호해야 하는가?

A) WAF를 ALB에만 붙이고 ALB를 공개로 둔다  
B) WAF를 CloudFront(CLOUDFRONT scope)에 붙이고, 오리진 ALB는 CloudFront managed prefix list로 직접 접근을 차단하며 CloudFront 비밀 헤더를 검증한다  
C) WAF를 끄고 Security Group만 사용  
D) WAF를 CloudFront와 ALB 둘 다에 붙이되 오리진은 공개  

**정답: B**  
해설: 경계가 엣지라면 WAF를 CloudFront(CLOUDFRONT scope)에 붙여 모든 진입을 엣지에서 평가하고, 오리진 ALB는 CloudFront prefix list로 직접 접근을 차단하고 CloudFront가 주입한 비밀 헤더(X-Origin-Verify)를 검증해 엣지 우회를 막는다. ALB만 보호하거나 오리진을 공개로 두면 우회 경로가 남고, WAF를 끄면 L7 방어가 사라진다.

---
