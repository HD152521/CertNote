# Day 3 - S3 Security: The Layered Structure of Access Control, Encryption Key Management, and Data Exfiltration Prevention

Most S3 security incidents come from misconfiguration. From 2017 to 2023, dozens of large-scale data breaches were caused by "misconfigured S3 buckets." US military classified documents, a major airline's customer data, and the medical records of millions of people were exposed from S3 buckets left open to the public. In many of these cases, the cause was granting Allow in the bucket policy while turning off Block Public Access.

This article follows the internal logic of how S3's five access-control layers are evaluated, and covers the key-management structure and real differences of each encryption method. It also covers the pattern for preventing data exfiltration with a VPC Endpoint policy, and how to leverage S3 Access Points in a multi-tenant environment.

## The History of S3 Access Control: Why Is It So Complex?

When S3 first launched (2006), access control was just an ACL (Access Control List). It defined in XML who could access an S3 bucket and object. This was AWS's very first access-control mechanism.

When IAM (Identity and Access Management) launched in 2008, a way to attach policies to users and groups was added. S3 now began to support IAM policies too. But IAM policies define who (identity) can do what, while ACLs define whose access is allowed to a specific bucket/object. Using both together made rules conflict or grow complex.

In 2012, the Bucket Policy was added. As a JSON-based resource policy, it allowed more fine-grained conditions (IP, VPC, whether encrypted, etc.).

And after thousands of public-bucket exposure incidents, in 2018 AWS launched **Block Public Access (BPA)**. It was a last-resort safeguard that "forcibly blocks even if a policy or ACL has a Public Allow, once you flip this switch."

This is the historical reason S3 access control today consists of five layers.

## Access Evaluation Layers: Understanding Them in Order

When an S3 request comes in, AWS evaluates whether to allow access in the following order.

```
[ S3 access evaluation layers (evaluation order) ]

1. Block Public Access (BPA)
   → Blocks Public ACLs/policies. If Deny, reject immediately.

2. SCP (Service Control Policy)
   → Organization-level guardrail of AWS Organizations

3. VPC Endpoint Policy
   → For access via a VPC Endpoint

4. IAM Identity Policy
   → The requester's (user/role) policy

5. Bucket Policy (Resource-based Policy)
   → The JSON policy attached to the bucket

6. Object ACL (depending on object ownership settings)
   → Ignored if Bucket Owner Enforced

7. KMS Key Policy (if SSE-KMS)
   → Whether there is access permission to the KMS key
```

The core evaluation principle: **an explicit Deny at any layer means immediate rejection**. Only when Allow (or implicit Allow) is confirmed at every layer is access finally granted.

For cross-account access, both layers are required. For account A's EC2 to access account B's S3 bucket, account A's IAM role must allow s3:GetObject, and account B's bucket policy must trust account A's role. Just one of them is not enough.

> 💡 **Related theory**: This multi-layered access-control structure implements the **Defense in Depth** principle of information security. It realizes, layer by layer, the "Principle of Least Privilege" and "Separation of Duties" emphasized in the "Access Control (AC)" control family of NIST SP 800-53. BPA is an implementation of the "Fail-Safe Default" principle that catches accidental misconfiguration at the very end.

## Block Public Access: The Detailed Meaning of the Four Options

BPA consists of four independent switches.

| Option | Role |
|------|------|
| `BlockPublicAcls` | Blocks adding new Public ACLs. Existing Public ACLs may still work. |
| `IgnorePublicAcls` | Ignores existing Public ACLs. Blocks access from current Public ACLs. |
| `BlockPublicPolicy` | Blocks adding/modifying a bucket policy that makes the bucket Public. |
| `RestrictPublicBuckets` | Blocks the effect of an existing Public bucket policy. Nullifies it even if a Public policy already exists. |

Recommended setting: **all four true**. The default for a new bucket is all true.

If you enable BPA at the account level (the entire AWS account), it applies to all buckets in the account. Even if you disable BPA on an individual bucket, account-level BPA blocks it. It's a hierarchical relationship.

> 📚 **Case study**: After the 2019 Capital One data breach, AWS provides the AWS Config rule `s3-bucket-public-access-prohibited` to automatically detect buckets with BPA disabled. This check is also included in AWS Security Hub's "S3 controls" standard. Many enterprises use an AWS Organizations SCP to enforce specific settings of `s3:PutBucketPublicAccessBlock` so that BPA can never be disabled.

## S3 Encryption: The Key-Management Structure of Four Types

Encryption is distinguished by **who controls the encryption key**. The algorithm (AES-256) is the same in all of them.

### SSE-S3: AWS Manages Everything

```
[ SSE-S3 encryption flow ]

1. Client makes a PutObject request
2. S3 automatically generates a data key (DEK)
3. Encrypts the data with the DEK using AES-256
4. Encrypts the DEK with a master key managed by S3
5. Stores the encrypted DEK together with the encrypted data
6. On a GetObject request, S3 decrypts the DEK, decrypts the data, and returns it
```

Since 2023, **SSE-S3 is applied by default to all new S3 objects**. Data at rest is encrypted with no additional configuration. AWS fully manages the keys, so the customer doesn't need to do key management. The downside is there's no key-access audit log, and fine-grained access control via a key policy is not possible.

### SSE-KMS: Encryption Using a KMS Key

```
[ SSE-KMS envelope encryption flow ]

1. On PutObject, S3 calls the KMS API (GenerateDataKey)
2. KMS returns the DEK (plaintext) and the encrypted DEK
3. S3 encrypts the data with the plaintext DEK, then deletes the plaintext DEK from memory
4. Stores the encrypted DEK together with the encrypted data

5. On GetObject, S3 calls the KMS API (Decrypt)
6. KMS decrypts the DEK and returns it
7. S3 decrypts the data with the DEK and returns it
```

Advantages of SSE-KMS:
- Fine-grained control over who can use which key via the **KMS key policy**
- **CloudTrail logs of KMS API calls** → auditable record of who accessed which object and when
- **Automatic key rotation**: KMS-managed keys rotate automatically each year
- **Key disabling**: disabling a specific key makes all data encrypted with that key inaccessible (a data-retention-termination mechanism)

Downside: **the cost of KMS API calls**. Since KMS is called every time an object is written and read, if thousands of S3 requests occur per second, KMS call costs climb too.

**S3 Bucket Keys**: a feature to reduce this cost. A Bucket Key temporarily caches, at the S3 level, a data encryption key (DEK) generated by KMS, so that instead of calling KMS on every object request, it generates DEKs from the Bucket Key. It can reduce the number of KMS calls by 99%.

> 🔍 **Going deeper**: Envelope Encryption is the approach recommended in NIST SP 800-57. A master key (the KMS CMK) encrypts a data key (DEK), and the DEK encrypts the actual data. The master key never leaves KMS. The benefit of this structure is that you can encrypt countless objects with independent DEKs without ever exposing the master key. To rotate the master key, you just re-encrypt the existing DEKs with the new key — there's no need to re-encrypt the data itself.

### SSE-C: The Customer Provides the Key

```
[ SSE-C flow ]

PUT request headers:
  x-amz-server-side-encryption-customer-algorithm: AES256
  x-amz-server-side-encryption-customer-key: [Base64-encoded 256-bit key]
  x-amz-server-side-encryption-customer-key-MD5: [MD5 of the key]

S3 encrypts the data with the provided key, then immediately discards the key (doesn't store it)
→ decryption is impossible without the same key
```

With SSE-C, AWS does not store the key. The customer manages the key directly and must include it in the header on every request. Lose the key and you lose the data permanently. HTTPS is required (plaintext transmission is not allowed).

It satisfies regulatory requirements that "the encryption key must not exist on AWS infrastructure," but the key-management burden is heavy. In practice, it's used integrated with an in-house HSM (Hardware Security Module) or key-management system.

### CSE: Client-Side Encryption

The client (SDK, app) encrypts the data and then uploads it to S3. S3 merely receives and stores an already-encrypted Blob. Neither S3 nor AWS can see the plaintext data.

It's the strongest security, but application code complexity is high, and you can't use S3's server-side features (Object Lambda, S3 Select, etc.). It's used in the most heavily regulated environments requiring an HSM at FIPS 140-3 Level 3 or above.

> 💡 **Related theory**: The comparison of encryption methods is organized by the concept of the **Trust Boundary**. SSE-S3 trusts the entire AWS infrastructure. SSE-KMS trusts the AWS infrastructure but restricts key access with IAM + KMS policies. SSE-C trusts the S3 service but never puts the key on AWS. CSE doesn't trust the AWS service itself. This spectrum connects to the Zero Trust security model's principle that "no one is trusted by default."

### DSSE-KMS: Double Encryption

DSSE-KMS encrypts data twice with KMS keys. It was designed for FIPS 140-3 regulations and certain data requirements of US government agencies. For an ordinary enterprise it's overkill.

## Object Ownership: The End of ACLs

Historically, S3 ACLs were used to solve the ownership problem of objects uploaded by a different AWS account. When account B uploaded an object to account A's bucket, for account A to read or delete that object, the ACL had to grant permission to account A.

To simplify this, AWS introduced the **Object Ownership** setting.

- `BucketOwnerPreferred`: if another account includes the `bucket-owner-full-control` ACL on upload, the bucket owner owns the object.
- **`BucketOwnerEnforced` (recommended)**: fully disables ACLs. The bucket owner owns all objects. Access control is via the bucket policy only.

`BucketOwnerEnforced` removes the legacy ACL mechanism and simplifies access control down to a single bucket policy. AWS strongly recommends this mode.

## S3 Access Points: Multi-Tenant Access Control

When multiple teams access a large data-lake bucket, each team should access only its own prefix (/team-a/, /team-b/). Putting every team's rules into a single bucket policy makes the policy too complex, and management gets harder as teams grow.

S3 Access Points are named network endpoints for a bucket. You can attach a policy to each Access Point, and the bucket policy can allow access only through the Access Points.

```
[ S3 Access Points structure ]

S3 bucket (data-lake)
  │
  ├─ Access Point: team-a-ap
  │     Policy: s3:Get* on arn:...data-lake/team-a/*
  │     VPC restriction: vpc-aaa
  │
  ├─ Access Point: team-b-ap
  │     Policy: s3:Get* s3:Put* on arn:...data-lake/team-b/*
  │
  └─ Access Point: analytics-ap
        Policy: s3:Get* on arn:...data-lake/*
        VPC restriction: vpc-analytics
```

A special type of Access Point, the **Multi-Region Access Point**, presents buckets in multiple regions as a single global endpoint. Based on Route 53 Anycast, it routes to the nearest region's bucket.

## VPC Endpoint and S3: Preventing Data Exfiltration

S3 is accessed over the internet by default. When EC2 accesses S3, it also goes through a NAT Gateway or internet gateway. On this path, data can leave the AWS network, and outbound transfer costs are incurred too.

**VPC Gateway Endpoint for S3**: provides a path to access S3 directly from within the VPC, without the internet. No additional cost. Add S3's Prefix List to the Route Table and S3 traffic automatically uses this path.

**Endpoint policy**: by attaching a policy to the VPC Endpoint, you can restrict "this VPC can access only specific buckets." It's key to preventing data exfiltration.

```json
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:*",
    "Resource": [
      "arn:aws:s3:::company-data-bucket",
      "arn:aws:s3:::company-data-bucket/*"
    ]
  }]
}
```

Combine this Endpoint policy with a bucket policy that allows access only through a specific VPC Endpoint via the `aws:SourceVpce` condition, and access to S3 over the internet is blocked.

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::company-data-bucket/*"],
  "Condition": {
    "StringNotEquals": {
      "aws:SourceVpce": "vpce-1234abcd"
    }
  }
}
```

> 📚 **Case study**: Financial services companies often use this pattern to ensure a data-analytics instance accesses only approved data buckets and cannot exfiltrate data to a personal S3 account or an external bucket. Setting the VPC Endpoint policy to "allow only buckets of a specific account" blocks sending data to another account's S3, even within the same AWS service.

## CORS Configuration: Interaction with the Browser's Security Policy

CORS (Cross-Origin Resource Sharing) is an HTTP mechanism that governs the browser's Same-Origin Policy. When JavaScript loaded from `https://app.example.com` accesses a file at `https://my-bucket.s3.amazonaws.com`, the browser checks the CORS policy.

An S3 bucket's CORS configuration:
```json
[{
  "AllowedHeaders": ["*"],
  "AllowedMethods": ["GET", "PUT"],
  "AllowedOrigins": ["https://app.example.com"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

CORS configuration is essential in the direct-browser-upload pattern via a Presigned URL. The browser sends an `OPTIONS` preflight request before the PUT, and S3 responds whether it's allowed based on the CORS configuration.

## Static Website Hosting: Integration with OAC

S3 static website hosting makes a bucket behave like an HTTP server. But exposing it directly requires disabling BPA, and it doesn't support HTTPS either.

The modern pattern is the **CloudFront + OAC (Origin Access Control)** combination.

```
[ CloudFront + OAC architecture ]

User (HTTPS) → CloudFront
                   ├─ cache HIT: respond immediately
                   └─ cache MISS: OAC-signed request → S3 bucket (Private)
                                   ← S3 response → CloudFront cache → user

Bucket policy: allow only the CloudFront OAC Principal
BPA: fully enabled (blocks direct external access)
```

OAC (Origin Access Control) is the successor to OAI (Origin Access Identity); when CloudFront accesses S3, it sends a request signed with AWS Signature V4. The S3 bucket sets its bucket policy to allow only requests from this specific CloudFront Distribution.

> ⚠️ **Pitfall**: OAI (Origin Access Identity) is legacy, and OAC (Origin Access Control) is recommended. OAC also supports S3 buckets encrypted with SSE-KMS and supports S3 in all regions. If an exam question asks about the latest capability, OAC is the right answer.

## Cementing It with the CLI

```bash
# Enable all four Block Public Access settings
aws s3api put-public-access-block \
  --bucket my-bucket \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,\
    BlockPublicPolicy=true,RestrictPublicBuckets=true

# Enable account-level BPA
aws s3control put-public-access-block \
  --account-id 123456789012 \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,\
    BlockPublicPolicy=true,RestrictPublicBuckets=true

# Set SSE-KMS default encryption (with Bucket Keys)
aws s3api put-bucket-encryption \
  --bucket my-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-northeast-2:123456789012:key/abc123"
      },
      "BucketKeyEnabled": true
    }]
  }'

# HTTPS-enforcing bucket policy
aws s3api put-bucket-policy \
  --bucket my-bucket \
  --policy '{
    "Statement": [{
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::my-bucket",
        "arn:aws:s3:::my-bucket/*"
      ],
      "Condition": {
        "Bool": {"aws:SecureTransport": "false"}
      }
    }]
  }'

# Object Ownership = BucketOwnerEnforced (disable ACLs)
aws s3api put-bucket-ownership-controls \
  --bucket my-bucket \
  --ownership-controls '{
    "Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]
  }'

# Create an S3 Access Point (VPC restriction)
aws s3control create-access-point \
  --account-id 123456789012 \
  --name team-a-access-point \
  --bucket my-data-lake \
  --vpc-configuration VpcId=vpc-12345678

# Set the Access Point policy
aws s3control put-access-point-policy \
  --account-id 123456789012 \
  --name team-a-access-point \
  --policy '{
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::123456789012:role/team-a-role"},
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:ap-northeast-2:123456789012:accesspoint/team-a-access-point/object/team-a/*"
    }]
  }'
```

## Wrapping Up

S3 security is not a single setting but layered Defense in Depth. BPA blocks accidental public exposure, IAM + bucket policy controls normal access, the VPC Endpoint policy restricts the network path, and KMS protects the data itself.

For encryption, "who controls the key" is the crux. If you need an audit trail and fine-grained key access control, SSE-KMS; if you need cost optimization, Bucket Keys; if you don't want to put the key on AWS, SSE-C; if you want full control, CSE.

---

## 📝 연습 문제

**문제 1.** A security audit team must audit all data access on an S3 bucket (who read which object and when). For compliance, automatic annual rotation of the encryption key is also required. What is the most suitable encryption method?

A) SSE-S3 (default encryption)
B) SSE-KMS (customer-managed KMS key, CloudTrail logging enabled)
C) SSE-C (customer-provided key)
D) CSE (client-side encryption)

**정답: B**
해설: SSE-KMS records KMS API calls in CloudTrail, providing an audit log of who did what, when, and with which key. A KMS customer-managed key (CMK) can be configured for automatic annual rotation. SSE-S3 has AWS fully manage the keys, so audit logs and key-rotation control are not possible. SSE-C doesn't store the key on AWS, so the CloudTrail audit trail is weak. CSE means the S3 service itself can't see the data, so S3-level access auditing is limited.

---

**문제 2.** A company's central data-lake S3 bucket is accessed by a data-analytics team (prefix: /analytics/), a marketing team (prefix: /marketing/), and an HR team (prefix: /hr/). Each team should access only its own prefix, and access paths should be managed independently per team. How do you keep the bucket policy simple?

A) Create a separate S3 bucket for each team
B) Create S3 Access Points per team and set a prefix-restriction policy on each Access Point
C) Add per-team conditions into a single bucket policy
D) Control per-team access with ACLs

**정답: B**
해설: S3 Access Points give each team an independent endpoint and policy. As teams grow, you just add an Access Point, and the bucket policy stays simple as "allow only access through the Access Points." A scatters the data, making cross-analysis hard. C makes the bucket policy more complex as teams grow. D relies on legacy ACLs and makes fine-grained per-prefix control hard.

---

**문제 3.** A data-analytics EC2 instance reads sensitive data from an S3 bucket. The security team wants to prevent data exfiltration over the internet and stop this instance from accessing any S3 outside the approved bucket. How do you configure it?

A) Add the EC2 instance's IP to a whitelist in the S3 bucket policy
B) VPC Gateway Endpoint for S3 + Endpoint policy (allow only specific buckets) + S3 bucket policy (allow access only from the VPC Endpoint)
C) NAT Gateway + Security Group to restrict traffic
D) Restrict S3 access with CloudFront OAC

**정답: B**
해설: A VPC Gateway Endpoint provides a path to access S3 without the internet. Allowing only specific buckets in the Endpoint policy blocks access to other S3 buckets. Allowing only this VPC Endpoint via the `aws:SourceVpce` condition in the S3 bucket policy also blocks access over the internet. A fails because EC2 IPs can change and a NAT Gateway IP is shared by multiple instances. C doesn't stop traffic from reaching S3 over the internet. D is for static content distribution, not data-exfiltration prevention.

---

**문제 4.** A dev team hosts a React app in an S3 bucket and distributes it via CloudFront. To block direct (public) access to the S3 bucket and allow access only through CloudFront, what do you do?

A) Set the S3 bucket to Public + place CloudFront in front
B) Configure OAC (Origin Access Control) on the CloudFront Distribution + fully enable BPA on the S3 bucket + allow only the CloudFront OAC Principal in the bucket policy
C) Configure OAI (Origin Access Identity) on the CloudFront Distribution + disable BPA on the S3 bucket
D) S3 Transfer Acceleration + distribute directly without CloudFront

**정답: B**
해설: OAC is OAI's latest successor and supports SSE-KMS buckets too. Fully enabling BPA blocks direct access to the S3 bucket. Allowing CloudFront's OAC Service Principal (`cloudfront.amazonaws.com`) in the bucket policy lets only CloudFront access S3. A requires opening S3 to the public. C's OAI is legacy, and disabling BPA opens up the possibility of public access via other paths.

---

**문제 5.** A company wants to allow only HTTPS on all S3 requests and block access over HTTP. How do you configure it?

A) Configure an HTTP-to-HTTPS redirect in CloudFront
B) Add a Deny statement with the `aws:SecureTransport: "false"` condition to the bucket policy
C) Check the "disable HTTP" option in the S3 bucket settings
D) Block port 80 traffic with a security group

**정답: B**
해설: A Deny with the `aws:SecureTransport: "false"` condition blocks all S3 requests that arrive without TLS (HTTPS). Add this policy to the bucket policy and SDK, CLI, and direct HTTP requests are all blocked. A only redirects traffic that goes through CloudFront and doesn't stop direct S3 API calls. S3 has no "disable HTTP" option. S3 is a public service, so there are no security groups.

---

**문제 6.** There is an analytics workload reading more than 10,000 objects per second from an SSE-KMS-encrypted S3 bucket. KMS API call costs are higher than expected. How do you reduce the KMS cost while keeping encryption?

A) Change the encryption method to SSE-S3
B) Enable the S3 Bucket Keys feature
C) Decrypt the data locally and store it in a cache
D) Delete the KMS key and create a new key every week

**정답: B**
해설: S3 Bucket Keys cache a temporary key generated by KMS at the S3 level, so instead of calling the KMS API on every object request, DEKs are generated from the Bucket Key. It can reduce the number of KMS calls by up to 99%. SSE-KMS and its audit-trail features are retained as is. A loses the KMS audit trail and fails the compliance requirement. C carries the security risk of keeping plaintext data in a local cache. D risks making existing data undecryptable.

---

**문제 7.** Select all cases below where an "explicit Deny" occurs in S3 access evaluation.

A) Deny s3:DeleteObject in an SCP
B) Deny a request with aws:SecureTransport=false in the bucket policy
C) The IAM policy has no s3:PutObject (no Allow)
D) Accessing a BPA-enabled bucket with a Public ACL
E) A VPC Endpoint policy allows only a specific bucket and access is made to a different bucket

**정답: A, B, D, E**
해설: A - an SCP Deny is an explicit Deny applied across the whole organization. B - a Deny statement in the bucket policy. D - BPA forcibly blocks the Public ACL, so it has an explicit-Deny effect. E - a bucket not permitted by the VPC Endpoint policy is treated as Deny. C is not an "explicit Deny" but an "implicit Deny (absence of Allow)." Lacking an Allow in the IAM policy is not an explicit Deny, and access may still be possible if there's an Allow at another layer (the bucket policy). Note, however, that for cross-account access, Allow is required on both sides.
