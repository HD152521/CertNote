# Day 3 - S3 Security: Bucket Policies, Encryption, and the Layered Structure of Access Control

A significant share of AWS security incidents starts with S3. From 2017 to 2022, about 35% of publicly disclosed data breaches were related to misconfigured S3 buckets. Verizon, Twitch, Toyota, GoDaddy — companies you know by name exposed tens of millions of records of personal information through S3 configuration mistakes. This day is about understanding the layered structure of the S3 security model, digging into the technical differences among encryption methods, and pointing out the traps that commonly arise in practice.

## The Layered Structure of S3 Access Control — In What Order Is It Evaluated?

A request to S3 is evaluated in the following order. If there is even a single Deny, the final result is denial.

```
Request arrives
    ↓
① Account-level Block Public Access → if Deny, immediate denial
    ↓
② Bucket-level Block Public Access → if Deny, immediate denial
    ↓
③ Explicit Deny (bucket policy, SCP, IAM policy) → if Deny, immediate denial
    ↓
④ IAM policy Allow + bucket policy Allow → allow
   or when there is only a resource-based policy → allow
    ↓
⑤ ACL (ignored if Bucket Owner Enforced)
    ↓
Default deny
```

In this structure, the most powerful is Block Public Access. Even if the bucket policy allowed public access with `"Principal": "*"`, public access is blocked if Block Public Access is enabled.

> 💡 **Related theory**: S3's policy evaluation logic is based on AWS IAM's general policy evaluation model (explicit Deny > explicit Allow > implicit Deny). S3 adds an additional layer on top of this, called Block Public Access. This layered structure aligns with the **Defense in Depth** principle of computer security — overlapping multiple independent security layers so that a single mistake does not collapse the entire security posture.

## The 4 Options of Block Public Access

Block Public Access consists of four independent settings. Since 2023, all four are enabled by default on every new bucket.

| Option | What it blocks |
|------|------------|
| BlockPublicAcls | Blocks public grants in new ACLs |
| IgnorePublicAcls | Ignores public grants in existing ACLs |
| BlockPublicPolicy | Blocks public grants in new bucket policies |
| RestrictPublicBuckets | Blocks anonymous/cross-account-external access even if the bucket policy allows public |

It can also be set at the account level, and the account-level setting takes precedence over the bucket level. You can also use an AWS Organizations SCP to enforce "never allowed to turn off Block Public Access" — a method that large-enterprise security teams prefer.

> 📚 **Case study**: In the 2019 Capital One data breach, the attacker read EC2 metadata via an SSRF vulnerability in the WAF, stole IAM credentials, and then read the data in an S3 bucket. The bucket was not public at the time, but the stolen IAM role had excessive S3 read permissions. The card-application data of 106 million people was exposed. This incident shows that Block Public Access alone is not enough — the **principle of Least Privilege** and IMDSv2 configuration are needed together.

## Bucket Policies — The Power of Resource-Based Policies

Unlike an IAM policy, a bucket policy is a **policy attached to a resource**. It can grant permissions even to a different AWS account that has no IAM user, or to public internet users. It is the key tool for cross-account access.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOrganizationReadOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject", "s3:GetObjectVersion"],
      "Resource": "arn:aws:s3:::my-company-data/*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-xxxxxxxxxxxx"
        }
      }
    },
    {
      "Sid": "DenyHTTP",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::my-company-data",
        "arn:aws:s3:::my-company-data/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

The `aws:PrincipalOrgID` condition is a powerful pattern that allows access only from accounts belonging to a specific AWS Organization. An external IP or account outside the organization is denied by this condition even with `"Principal": "*"`.

Denying HTTP with the `aws:SecureTransport` condition forces all S3 communication to use HTTPS. This is the basic protection of data in transit.

> ⚠️ **Trap**: Placing a Deny on `aws:SecureTransport: false` is different from placing an Allow on `aws:SecureTransport: true`. The Deny approach is the correct one. If you only place an Allow, HTTP does not fall through to default deny — it can be allowed together when there is another Allow rule. Enforcing HTTPS must always be configured as a Deny on the `false` condition.

## ACLs — Why They Became Legacy and the Currently Recommended Setting

An ACL (Access Control List) is an access-control method that existed since S3's early design. It can be granted on buckets and on objects individually, and it was a simple way to grant specific permissions to another AWS account. However, in 2021 AWS shifted, through the Object Ownership setting, toward effectively deprecating ACLs.

The three current Object Ownership options:
- **Bucket Owner Enforced (recommended)**: ACLs completely disabled. Control by IAM and bucket policy only. The default for new buckets since 2023.
- **Bucket Owner Preferred**: ACLs allowed, but a PUT with the bucket-owner-full-control header is owned by the bucket owner.
- **Object Writer (legacy)**: The principal that did the PUT is the object owner. Ownership disputes can arise on cross-account uploads.

> 🔍 **Going deeper**: The representative pattern where ACLs caused problems was cross-account uploads. When account A uploads an object to account B's bucket, in Object Writer mode account A becomes the owner of that object. Even though the object is in its own bucket, account B ends up in a situation where it cannot delete or change the tags of the object at will. Setting Bucket Owner Enforced makes the bucket owner always the owner of all objects, resolving this problem.

## The 4 Methods of S3 Encryption — The Difference in Who Manages the Key

The key to understanding S3 encryption is **"who manages the encryption key."**

**SSE-S3 (Server-Side Encryption with S3 Managed Keys)**:
AWS fully manages the keys. Key generation, rotation, and storage are all AWS's responsibility. Header: `x-amz-server-side-encryption: AES256`. No additional cost. The default for all new objects since 2023.

**SSE-KMS (Server-Side Encryption with KMS Keys)**:
The customer manages the keys in AWS KMS. Header: `x-amz-server-side-encryption: aws:kms`. Fine-grained access control is possible through KMS key policies, and all key usage is logged in CloudTrail. The downside is that it calls the KMS API on every encryption/decryption — there is a limit of 5,500–30,000 requests per second, which becomes a bottleneck in high-performance environments.

**DSSE-KMS (Dual-layer SSE with KMS)**:
Applies two independent encryption layers. It is a defense/government option that meets FIPS 140-3 Level 3 requirements.

**SSE-C (Server-Side Encryption with Customer Keys)**:
The customer provides the key and AWS performs the encryption. AWS does not store the key. You must pass the key in a header on every request. **HTTPS is required** — sending the key over HTTP exposes it on the network. The key is verified with a SHA-256 hash and discarded immediately after encryption.

**CSE (Client-Side Encryption)**:
The client encrypts the data before uploading. AWS only sees the encrypted data and cannot access the key. It is the strongest security, but the client-code complexity is high.

| Method | Key management | Audit log | HTTPS required | KMS cost | Extra code |
|------|---------|----------|-----------|---------|---------|
| SSE-S3 | AWS fully managed | ❌ | ❌ | ❌ | ❌ |
| SSE-KMS | KMS (customer-configured) | ✅ CloudTrail | ❌ | ✅ | ❌ |
| DSSE-KMS | KMS dual | ✅ CloudTrail | ❌ | ✅✅ | ❌ |
| SSE-C | Customer-provided | ❌ | **✅ required** | ❌ | Key management needed |
| CSE | Customer directly | ❌ | Recommended | ❌ | Encryption code |

> 💡 **Related theory**: Among the design principles of modern encryption systems, "Key Separation" means storing the encryption key and the encrypted data on physically different systems. SSE-KMS implements this principle — the data is stored in S3 and the key in KMS, separately, and KMS provides independent key auditing and access control. In SSE-S3, the key and the data reside within the same system (the S3 service), so this separation is not complete.

## S3 Bucket Key — How to Cut KMS Costs by 99%

The biggest downside of SSE-KMS is that it calls the KMS GenerateDataKey API on every object encryption/decryption. If 10,000 requests per second come into the bucket, 10,000 API calls per second are generated to KMS as well. The KMS API has a per-region limit, so throttling occurs and costs surge.

**S3 Bucket Key** solves this problem. It generates a bucket-level key once from KMS and uses this bucket key to encrypt individual objects. The KMS calls are reduced to one per bucket. According to AWS's announcement, enabling Bucket Key cuts KMS costs by **up to 99%**.

Exam scenario: "While using SSE-KMS, S3 requests fail because the KMS API limit is exceeded" → the answer is to enable the S3 Bucket Key or to request a KMS service quota increase. Bucket Key is the better solution that both reduces cost and resolves throttling.

> 🔍 **Going deeper**: The operating principle of S3 Bucket Key leverages the key hierarchy. The KMS CMK (Customer Master Key) generates a DEK (Data Encryption Key); regular SSE-KMS receives a new DEK from KMS for each object. In Bucket Key mode, a bucket-level key is created once from the CMK, and this bucket key generates individual DEKs within the S3 infrastructure. KMS is called only when creating/rotating the bucket key. Note, however, that an object's ETag changes after enabling Bucket Key, so a workflow that uses the ETag for integrity verification requires caution.

## VPC Endpoint — Accessing S3 Without the Internet

There are two ways for an EC2 instance or a Lambda function to access S3.

**Via the internet gateway**: Going out from the VPC to the internet and accessing the S3 public endpoint. Incurs NAT Gateway cost + data transfer cost.

**Via a VPC Endpoint**: Accessing S3 over the AWS internal network. Does not go out to the internet.

There are two kinds of VPC Endpoints.

| Type | Cost | Address | On-premises access | Cross-region |
|------|------|------|---------------|---------|
| Gateway Endpoint | Free | Added to the routing table | ❌ | ❌ (same region only) |
| Interface Endpoint (PrivateLink) | Hourly fee + data processing fee | ENI + private IP | ✅ (Direct Connect/VPN) | ✅ |

Exam scenario: "Access S3 from EC2 without a NAT Gateway" → Gateway Endpoint (free). "Access S3 from on-premises via a private IP" → Interface Endpoint.

## The Hidden Trap of Cross-Account KMS Encryption

When uploading or downloading an SSE-KMS-encrypted object from a different account, additional permission configuration is required.

Scenario: You want to upload an object encrypted with account A's KMS key to account B's S3 bucket, and have a user in account B download it.

Required permissions:
1. Add account B's role/user as a Principal in account A's KMS key policy
2. Add `kms:Decrypt` permission to account B's IAM policy
3. For CRR replication: add `kms:Encrypt` permission for the replication role to the destination-region KMS key

If you do not configure all three of these, an "AccessDenied" or "KMS key access denied" error occurs. On the exam, when a "cross-account KMS encryption problem" scenario appears, you must check both layers (bucket policy + KMS key policy).

> ⚠️ **Trap**: The KMS key policy and the IAM policy must **both** have an Allow. If you allow it only in the key policy and there is no allow in the IAM policy, access is denied (KMS requires the intersection of both policies). Conversely, if you allow it only in the IAM policy and there is no allow in the key policy, it is also denied.

## S3 Access Point — Simplifying Complex Bucket Policies

When multiple teams access a single S3 bucket with different permissions, managing this with a single bucket policy makes the policy grow to thousands of lines in complexity. An S3 Access Point creates multiple virtual entrances to a bucket, letting you manage independent access policies per team.

```
[Bucket: company-data]
    ↑
    ├── [Access Point: finance-ap] → finance team only (finance/ prefix)
    ├── [Access Point: hr-ap] → HR team only (hr/ prefix, VPC-only)
    └── [Access Point: engineering-ap] → engineering team (engineering/ prefix)
```

Each Access Point has its own DNS name and policy. If you create a VPC-restricted Access Point, it is accessible only from within that VPC, and internet access is blocked at the source.

Exam scenario: "Multiple teams must access one bucket with their own different permissions" → S3 Access Points is the answer.

> 💡 **Related theory**: The Access Point pattern is similar to the **Facade Pattern** in software design. It wraps a complex internal structure (bucket policy, thousands of objects) in a simple interface (the Access Point) and exposes it to users. Each team only needs to know its own Access Point and does not need to know the entire bucket structure.

## CORS — The Setting Needed When Accessing S3 Directly from the Browser

When a web browser sends a request directly to S3 with JavaScript (e.g., uploading a file with a Pre-signed URL), the browser's Same-Origin Policy blocks the request. You must add a CORS configuration to the S3 bucket.

```json
[{
  "AllowedOrigins": ["https://myapp.example.com"],
  "AllowedMethods": ["GET", "PUT", "POST"],
  "AllowedHeaders": ["Content-Type", "x-amz-server-side-encryption"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3000
}]
```

Exam scenario: "A CORS error occurs when uploading directly to S3 from client-side JavaScript" → add a CORS configuration to the bucket.

The S3 security layers we looked at today — Block Public Access, bucket policies, ACLs, encryption methods, Access Points — are all independent yet cooperating defense layers. In the next day, we look at the performance optimization techniques for uploading and downloading large volumes of data to and from S3 quickly.

## 📝 연습 문제

**문제 1.** Which of the following is the correct way to configure a bucket policy to allow only HTTPS in S3?

A) Add an Allow on `aws:SecureTransport: true`
B) Add a Deny on `aws:SecureTransport: false`
C) Enable the bucket's SSL setting
D) Enable the HTTP-blocking option in Block Public Access

**정답: B**
해설: To enforce HTTPS, you must explicitly deny HTTP requests. If you place `"Effect": "Deny"` on `"Condition": {"Bool": {"aws:SecureTransport": "false"}}`, requests where SecureTransport (HTTPS) is false — that is, HTTP requests — are denied. If, as in A, you only place an Allow on `true`, HTTP can be allowed in combination with another Allow policy. The separate bucket option "enable SSL setting" in C does not exist. Block Public Access has nothing to do with HTTP/HTTPS.

---

**문제 2.** On an S3 bucket using SSE-KMS encryption, a KMS API limit error occurs at thousands of requests per second. What is the most effective solution?

A) Change the encryption method to SSE-S3
B) Distribute the bucket across multiple regions
C) Enable the S3 Bucket Key
D) Submit only a KMS service quota increase request

**정답: C**
해설: Enabling the S3 Bucket Key generates a bucket-level key once and reuses it for individual object encryption, dramatically reducing KMS API calls (up to 99% reduction). Changing to SSE-S3 (A) means giving up KMS audit logs and fine-grained key control. Region distribution (B) does not solve the KMS limit. A quota increase request (D) alone will hit the same problem again when traffic grows over the long term. Bucket Key resolves the root cause while keeping the encryption method.

---

**문제 3.** When a user in a different AWS account tries to download an SSE-KMS-encrypted S3 object, an AccessDenied error occurs. What settings must you check?

A) Only the Block Public Access setting
B) Only that the account is Allowed in the bucket policy
C) Both the Principal Allow for that account in the KMS key policy and the kms:Decrypt permission in that account's IAM policy
D) Change the encryption method to SSE-C

**정답: C**
해설: To download an SSE-KMS-encrypted object from a different account, permissions at two layers are both required. ① In the KMS key policy, the other account's user/role must be allowed as a Principal — the key policy is evaluated independently of the IAM policy. ② The other account's IAM policy must have the `kms:Decrypt` permission. Configuring only the bucket policy and omitting the KMS key policy is the most common mistake. You must have both S3 access to the bucket and KMS access to the KMS key.

---

**문제 4.** A company has a requirement where three teams (finance, HR, dev) must access different prefixes in an S3 bucket, and the HR team must access only from within the VPC. What is the most suitable solution?

A) Create a separate S3 bucket per team
B) Handle all conditions with a single complex bucket policy
C) Create an S3 Access Point per team and set a VPC restriction on the HR Access Point
D) Manage with IAM policies only

**정답: C**
해설: S3 Access Points are optimized for managing independent access policies per team. Attach a policy that accesses only the relevant prefix to each team's Access Point, and add a VPC restriction (vpc-restriction) to the HR Access Point. Separate buckets per team (A) scatter the data and make management complex. A single complex bucket policy (B) can become thousands of lines with a high risk of mistakes. With IAM policies alone (D), it is hard to express resource-level conditions such as VPC-based access restriction.

---

**문제 5.** Which is the correct description of SSE-C encryption?

A) AWS securely stores the customer's key in KMS
B) The key is passed in the request header, and AWS does not store the key. HTTPS is required.
C) It can be used over HTTP too, and AWS manages key rotation
D) Key usage history is automatically recorded in CloudTrail

**정답: B**
해설: In SSE-C, the customer provides the encryption key in a header (`x-amz-server-side-encryption-customer-key`) on every request. AWS uses this key for encryption/decryption and then discards it immediately, without storing it. Therefore, if you lose the key, the data cannot be recovered. HTTPS is required to prevent the key from being exposed in plaintext on the network when it is transmitted as an HTTP header. Because AWS cannot access the key itself, key usage history is not recorded in CloudTrail.

---

**문제 6.** With account-level Block Public Access enabled on an S3 bucket, you allowed GetObject with `"Principal": "*"` in the bucket policy. What happens when you access that object from the internet?

A) The bucket policy takes precedence, so access is allowed
B) The account-level Block Public Access takes precedence, so access is denied
C) The policy applied last takes precedence
D) The two settings conflict, so an error occurs

**정답: B**
해설: Account-level Block Public Access takes precedence over the bucket policy. Even if the bucket policy allowed public (`"Principal": "*"`), public access is blocked if account-level or bucket-level Block Public Access is enabled. This is why Block Public Access acts as the "last line of defense" — even if you accidentally open the bucket policy to public, Block Public Access stops it. Since 2023, all four Block Public Access settings are enabled by default on every new bucket.

---

**문제 7.** Which of the following is correct regarding the post-2023 changes to S3 encryption?

A) SSE-KMS is the default encryption method for all new objects
B) SSE-S3 (AES-256) is the default encryption method for all new objects
C) Encryption is still optional and disabled by default
D) CSE (client-side encryption) is the default

**정답: B**
해설: Since 2023, all new objects in new S3 buckets are automatically encrypted with SSE-S3 (AES-256). Previously encryption was optional, but now it is the default behavior. There is no option to disable encryption. Existing objects already stored without encryption are unaffected, and if you need stronger encryption you can change the bucket's default encryption setting to SSE-KMS. On the exam, for the question "Are S3 objects encrypted?", the answer since 2023 is "Yes, always encrypted with SSE-S3 or stronger."

---
