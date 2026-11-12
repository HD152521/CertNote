# Day 3 - S3 Access Control Deep Dive: Bucket Policies, ACLs, Access Points, Encryption Enforcement, Exfiltration Prevention

Yesterday (day 2) covered *how to encrypt and preserve* S3 data. Today we dig deep into the authorization layer that determines *who accesses it*. S3 access control involves multiple mechanisms evaluated together, and the exam relentlessly asks "given multiple policies exist simultaneously, what is the final result?" The core principle is *explicit Deny always wins* (IAM evaluation model) and *enforcing encryption, transmission security, and network paths via policy conditions*.

## S3 Access Control Mechanisms: The Landscape

A request to access a single S3 object is evaluated by combining these mechanisms:

- **IAM Identity Policy**: Policy attached to the calling principal (role/user)
- **Bucket Policy (resource-based)**: Policy attached to the bucket. Key for cross-account and anonymous access
- **Object/Bucket ACL**: Legacy mechanism. Now discouraged
- **S3 Access Points**: Named access entry points to a bucket, each with its own policy
- **VPC Endpoint Policy**: Network path-level control
- **Block Public Access**: Public setting override guard rail

```
Request → [Final authorization = (Union of all Allow from applicable policies) - (Any Deny)]
          If even one explicit Deny exists → Denied (other Allow ignored)
          For cross-account → Both owner and requestor policies must Allow
```

> 💡 **Related Theory**: S3 authorization follows IAM's *default-deny + explicit-deny-wins* model. All requests start from default denial, and any applicable policy's Allow becomes a candidate for allowance, but a single explicit Deny overrides all Allow. This asymmetry (Deny priority) is the foundation of guard rail design — if you hard-code "this must never happen" with Deny, no subordinate Allow can breach it. Encryption enforcement and transmission security enforcement are both implemented via this Deny pattern.

## Why ACLs Are Discouraged

S3 ACL is a legacy access control from the object/bucket ownership era. The problem is that permissions are scattered per-object, resulting in *no centralized visibility*, and "AllUsers"/"AuthenticatedUsers" group grants easily create unintended public access. AWS recommends setting **S3 Object Ownership to "BucketOwnerEnforced"** to **completely disable ACLs** and control solely via bucket policy. Under this setting, all objects are owned by the bucket owner, and ACL-based permissions are ignored.

```bash
aws s3api put-bucket-ownership-controls \
  --bucket my-secure-bucket \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

> ⚠️ **Pitfall**: The classic problem in cross-account upload buckets where "the uploader account owns the object and the bucket owner cannot read it" is solved by BucketOwnerEnforced. Previously, `bucket-owner-full-control` ACL was forced, but now Object Ownership setting is the answer.

## Encryption Enforcement: Blocking Unencrypted Uploads

Even if bucket default encryption is enabled, the exam tests "enforcing specific encryption *via policy*." Add conditional Deny to the bucket policy to reject PutObject without the desired encryption header.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::my-secure-bucket/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    },
    {
      "Sid": "DenyWrongKMSKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::my-secure-bucket/*",
      "Condition": {
        "StringNotEqualsIfExists": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
        }
      }
    }
  ]
}
```

> 🎯 **Scenario**: "All objects must be encrypted with only a specific CMK" → combine two Deny conditions: (1) reject if not SSE-KMS, (2) reject if not the specified KMS key ID. Use `StringNotEqualsIfExists` to handle both missing headers and wrong keys. Bucket default encryption alone cannot prevent "use of a different key."

## Enforcing In-Transit Encryption (Forcing HTTPS)

To block plaintext HTTP requests, use the `aws:SecureTransport` condition to Deny non-TLS requests.

```json
{
  "Sid": "DenyInsecureTransport",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::my-secure-bucket",
    "arn:aws:s3:::my-secure-bucket/*"
  ],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

> ⚠️ **Pitfall**: Include **both** bucket ARN (`:::bucket`) and object ARN (`:::bucket/*`) in Resource. Bucket-level operations (ListBucket) and object-level operations (GetObject) evaluate different ARNs. If you omit one, some operations will escape enforcement.

## S3 Access Points: Divide and Conquer Access

Large shared buckets (data lakes etc.) cause single bucket policies to bloat and become hard to manage. **S3 Access Point** is a named entry point to a bucket, each with its own policy and network origin (VPC-only or internet). Giving a separate Access Point to each application allows *many small, clear policies* instead of a giant single policy.

```bash
aws s3control create-access-point \
  --account-id 111122223333 \
  --name finance-ap \
  --bucket data-lake \
  --vpc-configuration VpcId=vpc-0abc123 \
  --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
```

Providing `--vpc-configuration` makes that Access Point accessible **only from within that VPC** — internet-based access is blocked at the source. **Multi-Region Access Point** provides a single global endpoint for multi-region bucket access with automatic routing and failover.

> 💡 **Related Theory**: Access Points apply *capability segregation*. By placing multiple entry points on one resource and granting minimal permissions to each, one application's permission misuse cannot spread to other entry points. This resembles Object-Oriented Interface Segregation Principle — a client sees only the narrow interface of capabilities it uses, accessing the resource through that tight contract.

## Data Exfiltration Prevention: VPC Endpoint Conditions

One data exfiltration scenario is a compromised credential copying company data to an external account bucket *via public internet*, or reading it from outside the company network. The key condition keys to block this are:

- `aws:SourceVpce`: Allow only requests through a specific VPC endpoint
- `aws:SourceVpc`: Allow only a specific VPC source
- `aws:SourceIp`: Allow only specific IP ranges
- `s3:DataAccessPointAccount`: Allow only through an Access Point of a specific account

Enforce via bucket policy: "if not the specified VPC endpoint, Deny"

```json
{
  "Sid": "RestrictToVPCE",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": [
    "arn:aws:s3:::corp-sensitive",
    "arn:aws:s3:::corp-sensitive/*"
  ],
  "Condition": {
    "StringNotEquals": { "aws:SourceVpce": "vpce-0a1b2c3d4e" }
  }
}
```

This policy blocks all access not through the specified VPC endpoint (internet, other VPC, other account), ensuring data flows only within the company-controlled network boundary.

> 🎯 **Scenario**: "Company data must never leave the company VPC" → create an S3 gateway VPC endpoint and place a `aws:SourceVpce` Deny condition in the bucket policy. Simultaneously, add "access only company buckets" to the VPC endpoint policy — *bidirectional* lockdown. Bucket policy: "my bucket only via this VPCe," endpoint policy: "this VPCe only to company buckets." This dual combination is the standard for exfiltration prevention.

> 🔍 **Deeper Dive**: To scale this pattern across the organization, AWS uses **`aws:PrincipalOrgID` or `aws:ResourceOrgID` conditions in the VPC endpoint policy**. For example, "S3 access via this VPC endpoint only to buckets in our Organization" prevents employees on the company network from exfiltrating data to personal buckets outside the company. This is the core implementation of *data perimeter* — combining three conditions: trusted identity (PrincipalOrgID), trusted resource (ResourceOrgID), and trusted network (SourceVpce).

## S3 Access Analyzer: Check for Exposure

IAM Access Analyzer analyzes bucket policies, ACLs, and Access Points to automatically detect "buckets accessible from outside (outside account / public)." It catches exposure mistakes proactively and continuously, not post-facto. If asked "continuously verify which S3 buckets are exposed externally," Access Analyzer is the answer.

---

## 📝 Practice Questions

**Question 1.** On a bucket, an IAM policy Allows GetObject, but the bucket policy has an explicit Deny for the same object. What is the final result?

A) The IAM Allow takes precedence, so access is allowed  
B) An explicit Deny overrides all Allows, so access is denied  
C) The two policies conflict, causing an evaluation error  
D) The more recently created policy takes precedence  

**Answer: B**  
Explanation: In the IAM evaluation model, an explicit Deny always takes precedence over any Allow. Even if the IAM policy has an Allow, the request is denied if the bucket policy has an explicit Deny. A policy conflict is not an error but is resolved deterministically by the Deny-first rule, and creation time has no effect on evaluation.

---

**Question 2.** You want to force every PutObject to be encrypted only with a specific CMK. Is bucket default encryption alone sufficient, or what else is needed?

A) Bucket default encryption alone is sufficient  
B) Add two conditions to the bucket policy: Deny if it is not SSE-KMS, and Deny if it is not the specified KMS key ID  
C) Set ACLs to BucketOwnerEnforced  
D) Turn on Block Public Access  

**Answer: B**  
Explanation: Bucket default encryption merely applies a default to objects uploaded without a header; it does not prevent a client from uploading while specifying a *different key*. Enforcing a specific CMK is completed only by applying two Denies using the `s3:x-amz-server-side-encryption` and `s3:x-amz-server-side-encryption-aws-kms-key-id` conditions. Disabling ACLs and BPA are unrelated to enforcing encryption.

---

**Question 3.** For a bucket containing company data, you want to block all access that does not come through a designated VPC endpoint (internet, other VPCs, other accounts). What is the correct condition key?

A) `aws:SecureTransport`  
B) `s3:x-amz-server-side-encryption`  
C) Deny with `aws:SourceVpce` using StringNotEquals  
D) `s3:max-keys`  

**Answer: C**  
Explanation: Applying "Deny unless it is the designated VPC endpoint" with the `aws:SourceVpce` condition blocks access from every path that does not go through that endpoint (internet, other VPCs, other accounts), preventing data exfiltration. `aws:SecureTransport` enforces HTTPS, the encryption header conditions enforce encryption at rest, and `s3:max-keys` controls pagination, none of which relate to network path control.

---

**Question 4.** In a bucket that receives cross-account uploads, the uploader account owns the objects, so the bucket owner cannot read them. What is the most recommended solution?

A) Ask the uploader to include the `bucket-owner-full-control` ACL every time  
B) Set Object Ownership to BucketOwnerEnforced to disable ACLs and make the bucket owner the owner of all objects  
C) Switch the bucket to public  
D) Turn on versioning  

**Answer: B**  
Explanation: Setting Object Ownership to BucketOwnerEnforced completely disables ACLs and makes the bucket owner own all objects, so the cross-account ownership problem disappears at its root. Forcing ACLs is a legacy approach with a risk of omission, switching to public is a serious security violation, and versioning is unrelated to ownership.

---

**Question 5.** In a huge shared data lake bucket, access policies differ per application, so the single bucket policy has become bloated and hard to manage. What is the most appropriate approach?

A) Keep accumulating all permissions in the bucket policy  
B) Create an S3 Access Point for each application and give each its own policy and VPC restriction  
C) Duplicate the bucket for each application  
D) Grant per-application permissions with object ACLs  

**Answer: B**  
Explanation: S3 Access Points provide multiple named entry points to a single bucket, each with its own small, clear policy and network origin (such as VPC-only), dividing and governing the bloated single policy. Accumulating bucket policy statements worsens manageability and readability, duplicating buckets causes data duplication, cost, and consistency problems, and ACLs are legacy with no central visibility.

---
