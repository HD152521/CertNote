# Day 3 - S3 Access Control in Depth: Bucket Policies, ACLs, Access Points, Enforcing Encryption, Data Exfiltration Prevention

Yesterday (day 2) we covered *how to encrypt and retain* S3 data. Today we dig deep into the authorization layers that determine *who gets access*. S3 access control is evaluated as several overlapping mechanisms, and the exam constantly asks "what is the final result when multiple policies exist at the same time?" The core is the IAM evaluation model in which *an explicit Deny always wins*, and the pattern of *enforcing encryption, transport security, and network path through policy conditions*.

## The Landscape of S3 Access Control Mechanisms

A request to access a single S3 object is evaluated as a combination of the following mechanisms:

- **IAM identity policies**: policies attached to the calling principal (role/user)
- **Bucket policies (resource-based)**: policies attached to the bucket. The core of cross-account and anonymous access
- **Object/bucket ACLs**: a legacy mechanism. Now discouraged
- **S3 Access Points**: named access entry points to a bucket, each with its own policy
- **VPC endpoint policies**: control at the network-path level
- **Block Public Access**: a guardrail that nullifies public settings

```
Request → [final authorization = (union of Allows from all applicable policies) - (Deny from any policy)]
        If even one explicit Deny exists → denied (all other Allows ignored)
        If cross-account → Allow is required in both policies (owner and requester)
```

S3 authorization follows IAM's *default-deny + explicit-deny-wins* model. Every request starts from default deny, and if any one applicable policy Allows, it becomes a candidate for permission, but a single explicit Deny overturns all Allows. This asymmetry (Deny takes precedence) is the foundation of guardrail design: if you nail down "what must never happen" with a Deny, no lower-level Allow can break through it. Enforcing encryption and enforcing transport security are both implemented with this Deny pattern.

### The Actual Evaluation Order: How to Find Where It Was Blocked

To pinpoint the cause from a single `AccessDenied`, you need to know in what order evaluation takes place. A single request passes through the following gates in turn.

```
S3 request
  │
  ├─(1) Organizations SCP        ← ceiling on the whole account's permissions. If Deny, it ends here
  ├─(2) VPC endpoint policy       ← can this resource be reached via this path?
  ├─(3) Resource-based policy (bucket/AP)  ← does this resource accept this principal?
  ├─(4) Permissions boundary
  ├─(5) Session policy (inline policy passed at AssumeRole)
  ├─(6) Identity-based policy (IAM)
  └─(7) Block Public Access       ← if judged anonymous/public, nullified here
        ↓
    Final allow
```

The exam targets two points. First, **an explicit Deny anywhere results in denial without looking at the rest**. Second, **a cross-account request needs an Allow in both accounts**: both the bucket policy in the resource-owning account and the IAM policy in the requester's account must allow it. In contrast, within the same account, **either one** of the bucket policy or the IAM policy allowing is enough. This asymmetry is the identity of the symptom "the same policy works inside the account but not outside."

| Symptom | First place to suspect |
|------|--------------------|
| Denied even within the same account | Explicit Deny (bucket policy, SCP) or KMS key policy |
| Denied only from another account | Missing Allow for the other account in the bucket policy |
| Denied only from a specific network | `aws:SourceVpce` / `aws:SourceIp` condition |
| Only anonymous requests are denied | Block Public Access |
| The error points to KMS | Key policy or `kms:ViaService` condition |
| Everything denied in an organization with SCPs | SCP Deny or omission from the allow list |

## Why ACLs Are Discouraged

S3 ACLs are a legacy control from the era of object/bucket ownership. The problems are that they are scattered per object with *no central visibility*, and granting to the "AllUsers"/"AuthenticatedUsers" groups makes unintended exposure easy. AWS recommends setting **S3 Object Ownership to "Bucket owner enforced"** to **disable ACLs entirely** and control only through bucket policies. With this setting, the bucket owner owns every object, and ACL-based permissions are ignored.

```bash
aws s3api put-bucket-ownership-controls \
  --bucket my-secure-bucket \
  --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
```

> ⚠️ **Trap**: The classic problem in a bucket that receives cross-account uploads, where "the uploader account owns the object so the bucket owner cannot read it," is solved by BucketOwnerEnforced. In the past you enforced the `bucket-owner-full-control` ACL, but now the Object Ownership setting is the answer.

### Comparing the Four Control Mechanisms

| Item | IAM policy | Bucket policy | ACL (legacy) | Access Point |
|------|----------|-----------|-------------|--------------|
| Attached to | Principal (role/user) | Bucket | Bucket/individual object | Named entry point to a bucket |
| Allows anonymous/cross-account | No | Yes | Yes (hence dangerous) | Yes (via policy) |
| Condition keys | Yes | Yes | **No** | Yes |
| Size limit | Per-policy limits | **20KB** | Limit on number of grants | Separate policy per AP |
| Central visibility | Yes | Yes | **None** (scattered per object) | Yes |
| Network origin restriction | Via condition keys | Via condition keys | No | **Make the AP itself VPC-only** |
| Current recommendation | Default | Default | **Disable recommended** | Large shared buckets |

> ⚠️ **Trap**: The bucket policy's **20KB limit** shows up on the exam and in practice. If you keep appending Statements every time teams and applications grow, you eventually hit the limit, and at that point the answer is not "compress the policy further" but to **split with Access Points** or **replace enumeration with condition keys (tags, organization ID)**. Using `aws:PrincipalTag` or `aws:PrincipalOrgID` means you do not have to list principals one by one, so the policy does not grow as accounts increase.

## Enforcing Encryption: Blocking Unencrypted Uploads

Even if bucket default encryption is on, the exam asks about the pattern of *enforcing* a specific encryption through policy. You put a conditional Deny in the bucket policy to reject PutObject requests lacking the desired encryption header.

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

> 🎯 **Scenario**: When "force every object to be encrypted only with a specific CMK" comes up, combine two Denies: (1) reject if not SSE-KMS, (2) reject if not the specified KMS key ID. Using `StringNotEqualsIfExists` handles both the case where the header is absent altogether and the case where it is a different key. Bucket default encryption alone cannot prevent "use of a different key."

We should point out why the condition operators differ in the two Deny statements. The first uses `StringNotEquals`, so **if the header is absent, the condition matches and the Deny applies** (when the key does not exist, `StringNotEquals` evaluates to true). The second uses `StringNotEqualsIfExists`, so **if the header is absent, the condition is skipped**. Only this combination makes it hold that "if the encryption header is absent altogether, deny in the first statement; if the header is present but a different key, deny in the second statement." If the second were also written with `StringNotEquals`, a request uploaded without the SSE-KMS header would be caught by both statements and the behavior would look the same, but conversely if the first were written with `IfExists`, a plaintext upload without a header would get through. The key lesson of this pattern is that **the presence or absence of `IfExists` in the condition operator determines the enforcing power of the policy**.

Incidents in which personal data is exposed en masse from misconfigured public S3 buckets are not about any particular company but a structural pattern that has repeated since the early days of the cloud. The causes commonly pointed to in incident reports are three: (1) briefly made public for development/testing and never reverted, (2) misunderstanding the `AuthenticatedUsers` ACL as "users of our company" (it actually means *anyone in the world who has an AWS account*), and (3) the bucket was locked down but another path that uses that bucket as its origin was left open. The controls that block these three are exactly Block Public Access (cannot be public in the first place even if not reverted), Object Ownership = BucketOwnerEnforced (nullifies ACLs themselves), and IAM Access Analyzer (continuously analyzes the external-access possibility of every path). The history of incidents is the reason these features were designed.

## Enforcing Encryption in Transit (Enforcing HTTPS)

To block plaintext HTTP requests, Deny non-TLS requests with the `aws:SecureTransport` condition.

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

You must put **both** the bucket ARN (`:::bucket`) and the object ARN (`:::bucket/*`) in Resource. This is because bucket-level actions (ListBucket) and object-level actions (GetObject) evaluate different ARNs. If you include only one, some actions escape the enforcement.

## S3 Access Points: Divide and Govern Access

For large shared buckets (data lakes, etc.), a single bucket policy becomes bloated and hard to manage. An **S3 Access Point** is a named access entry point to a bucket, each with its own policy and network origin (VPC-only/internet). If you give each application its own Access Point, you can separate into *small, clear policies* instead of one giant policy.

```bash
aws s3control create-access-point \
  --account-id 111122223333 \
  --name finance-ap \
  --bucket data-lake \
  --vpc-configuration VpcId=vpc-0abc123 \
  --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
```

If you provide `--vpc-configuration`, that Access Point is accessible **only from inside that VPC**; access via the internet is blocked at the source. A **Multi-Region Access Point** reaches buckets in multiple Regions through a single global endpoint and provides automatic routing and failover.

What you must understand alongside introducing Access Points is the **delegation structure**. An Access Point policy alone does not create permissions. Only when the bucket policy declares "I delegate access decisions for this bucket to Access Points in my account" does the Access Point policy actually take effect.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DelegateToAccessPoints",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::data-lake",
        "arn:aws:s3:::data-lake/*"
      ],
      "Condition": {
        "StringEquals": {
          "s3:DataAccessPointAccount": "111122223333"
        }
      }
    },
    {
      "Sid": "DenyDirectBucketAccessOutsideAccessPoints",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::data-lake/*",
      "Condition": {
        "Null": { "s3:DataAccessPointArn": "true" },
        "StringNotEquals": { "aws:PrincipalArn": "arn:aws:iam::111122223333:role/DataPlatformAdmin" }
      }
    }
  ]
}
```

The second statement is the heart of this pattern. `s3:DataAccessPointArn` being `Null` (absent from the request) means "the bucket was accessed **directly** by its name." If you leave only one administrator role as an exception and Deny all other direct access, you can make **all data access necessarily pass through an Access Point**. Then each Access Point policy becomes the real boundary, and the bucket policy stays thin.

| Condition key | Meaning | Used for |
|---------|------|-----------|
| `s3:DataAccessPointArn` | ARN of the Access Point the request went through | Enforcing a specific AP, blocking direct access (`Null`) |
| `s3:DataAccessPointAccount` | The account that owns the Access Point | Bucket → AP delegation declaration |
| `s3:AccessPointNetworkOrigin` | `Internet` or `VPC` | Allow only VPC-origin APs |

**S3 Object Lambda Access Point** is a form that goes one step further in access control. Whereas a regular Access Point only decides "do we allow this request," Object Lambda runs a Lambda function before the GetObject response reaches the client to **transform the content itself**. For example, for the same object, it returns a version with national ID numbers masked to the analytics team and the original to the audit team. It is an approach of placing views over a single original rather than replicating and managing two copies of the data, and when "provide results of different sensitivity by role for the same data" comes up, this is the answer. It ties in with the principle that the more copies of data there are, the larger the exfiltration surface.

Access Points are an application of *capability segregation*. If you place multiple entry points on a single resource (bucket) and grant least privilege to each, one application's abuse of permissions does not spread to other entry points. This resembles the Interface Segregation Principle (ISP) of object orientation: clients access the resource through a narrow interface that shows only the capabilities they use.

## Data Exfiltration Prevention: VPC Endpoint Conditions

One S3 data exfiltration (exfiltration) scenario is copying company data *over the public internet* to an external account's bucket with stolen credentials, or reading it from outside the company network. The key condition keys that block this are:

- `aws:SourceVpce`: allow only requests that go through a specific VPC endpoint
- `aws:SourceVpc`: allow only a specific VPC origin
- `aws:SourceIp`: allow only specific IP ranges
- `s3:DataAccessPointAccount`: allow only access via Access Points of a specific account

Enforce "deny unless via the designated VPC endpoint" with a bucket policy:

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

This policy denies all access that does not go through the designated VPC endpoint (via the internet, another VPC, another account). It nails down that data flows only within a network boundary the company controls.

> 🎯 **Scenario**: When "ensure company data can never leave the company VPC" comes up, create an S3 gateway VPC endpoint and put a conditional `aws:SourceVpce` Deny in the bucket policy. At the same time, put "allow access only to company buckets" in the VPC endpoint policy to seal *in both directions*: the bucket policy says "my bucket only through this VPCe," and the endpoint policy says "this VPCe only to company buckets." This combination is the standard for data exfiltration prevention.

To extend this pattern across the whole organization, AWS uses **`aws:PrincipalOrgID` or `aws:ResourceOrgID` conditions in the VPC endpoint policy**. For example, if you enforce "S3 access through this VPC endpoint is possible only to buckets belonging to our Organization," you prevent employees from siphoning data from the company network to an outside personal bucket. This is the core implementation of the *data perimeter*, built by combining three conditions: trusted identities, trusted resources, and trusted networks.

### The Three Axes of the Data Perimeter and a Condition-Key Map

The data perimeter nails down three questions, each with a policy. If you memorize these three axes as condition keys, scenario questions get solved much faster.

| Axis | Question | Where it is applied | Condition keys |
|----|------|--------------|---------|
| Trusted identities | Do only principals of our organization access our resources? | Resource policy (bucket policy) | `aws:PrincipalOrgID`, `aws:PrincipalArn`, `aws:PrincipalIsAWSService` |
| Trusted resources | Do our principals access only our resources? | SCP, VPC endpoint policy | `aws:ResourceOrgID`, `s3:ResourceAccount` |
| Trusted networks | Does traffic go only over paths we control? | Resource policy, SCP | `aws:SourceVpce`, `aws:SourceVpc`, `aws:SourceIp`, `aws:ViaAWSService` |

Why the "trusted resources" axis is needed is the part beginners grasp least. If you lock only identities and networks, you block *outsiders reading our data* but not *our employees copying data from the company network to their own personal bucket*. If you put `aws:ResourceOrgID` in the VPC endpoint policy as below, buckets outside the organization cannot be reached at all over that path.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyOrgOwnedBuckets",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:ResourceOrgID": "o-abcd1234ef",
          "aws:PrincipalOrgID": "o-abcd1234ef"
        }
      }
    }
  ]
}
```

The same idea can be enforced across an entire account with an SCP. It is a way of using `s3:ResourceAccount` as a condition in the SCP to nail down that "no principal in this account may call S3 buckets of unapproved accounts." However, in this case legitimate access to public buckets owned by AWS services (for example, some services' distribution artifacts) may also be blocked, so exceptions must be opened carefully.

You must not confuse `aws:SourceIp` and `aws:SourceVpce`. When a request **goes through a VPC endpoint, `aws:SourceIp` does not match**, because traffic via the endpoint has no public source IP. If you set a policy that allows only the company office IP ranges and later introduce a VPC endpoint, every workload is blocked at that moment. The standard is to split the conditions, `aws:SourceIp` for on-premises/office and `aws:SourceVpce` for in-VPC workloads, and open them with `OR` (separate Statements or an `ArnLike` array, not multiple keys within the same Condition block).

## The Order for Diagnosing AccessDenied

A good share of exam questions ask "I configured everything, so why does it not work?" Narrowing in the following order catches most of them.

```
1. Is the error message from S3 or KMS?
      KMS → key policy / kms:ViaService / missing cross-account Decrypt
2. Is it an anonymous (unauthenticated) request?
      Yes → check Block Public Access, IsPublic in bucket-policy-status
3. Same account or another account?
      Another account → Allow needed on both sides (bucket policy + the other side's IAM)
4. By what path did it come?
      VPC endpoint → aws:SourceVpce condition, endpoint policy
5. Does the organization have SCPs?
      Yes → is an SCP Deny cutting the whole account's ceiling?
6. Are Access Points used?
      Yes → check both the bucket's delegation declaration (s3:DataAccessPointAccount) and the AP policy
```

```bash
# Simulate whether a specific principal can perform a specific action (evaluated without a real call)
aws iam simulate-principal-policy \
  --policy-source-arn arn:aws:iam::111122223333:role/AnalyticsRole \
  --action-names s3:GetObject \
  --resource-arns arn:aws:s3:::corp-sensitive/reports/q2.csv

# Check the policy actually attached to the bucket and its public determination
aws s3api get-bucket-policy --bucket corp-sensitive --output text
aws s3api get-bucket-policy-status --bucket corp-sensitive

# List Access Points and check each one's network origin
aws s3control list-access-points --account-id 111122223333 --bucket data-lake
```

> 🎯 **Scenario**: When "even though the analytics team role was granted `s3:GetObject`, it cannot read objects in an SSE-KMS bucket" comes up, the answer is almost always **a missing KMS key policy or the role's `kms:Decrypt`**. S3 permissions and KMS permissions are separate gates, and checking whether the error message points to KMS is the first clue. If a `kms:ViaService` condition is applied, you should also check whether its value matches the S3 service principal of the relevant Region.

## Checking Exposure with S3 Access Analyzer

IAM Access Analyzer analyzes bucket policies, ACLs, and Access Points to automatically detect "buckets accessible from outside (outside the account/public)." It catches exposure caused by configuration mistakes beforehand and continuously rather than after the fact. When "continuously verify which S3 buckets are exposed externally" is required, Access Analyzer is the answer.

Access Analyzer sets a **zone of trust** as the account or organization, and finds resources accessible from outside it through automated reasoning. Unlike a person reading a policy by eye to judge "is this public?", it logically resolves even combinations of condition keys to reach a conclusion. The tools with similar names are easy to confuse in role, so let us distinguish them.

| Tool | What it answers |
|------|-----------------|
| IAM Access Analyzer (external access) | "Is this bucket/key/role accessible from outside the organization?" |
| IAM Access Analyzer (unused access) | "Which permissions were granted but are not actually used?" |
| Macie | "Is there sensitive data in this bucket?" (covered tomorrow) |
| AWS Config | "Does this bucket comply with the defined configuration rules?" (encryption on, BPA on, etc.) |
| GuardDuty (S3 protection) | "Is the access pattern for this bucket anomalous?" |
| CloudTrail data events | "Who actually read which object?" |

Exam questions require exactly one of these six. "Continuous check of exposure" is Access Analyzer, "configuration compliance evaluation and automatic remediation" is Config (+ remediation rules), "discovering sensitive data" is Macie, "anomalous behavior detection" is GuardDuty, and "after-the-fact tracking of who read" is CloudTrail data events. Getting just this mapping right turns a good share of the data protection domain's questions into instant answers.

> 🎯 **Scenario**: When "you must serve a static website, but never make the bucket public" comes up, the answer is **CloudFront + OAC (Origin Access Control)**. Keep BPA on for the bucket, allow the CloudFront service principal (`cloudfront.amazonaws.com`) in the bucket policy, and narrow it with an `AWS:SourceArn` condition so it accepts **only requests from a specific distribution**. If you omit the condition, you get a confused deputy problem in which any CloudFront distribution can use that bucket as its origin. The reason to use OAC instead of the older OAI (Origin Access Identity) is SSE-KMS object support and the signing method, and an answer that picks OAI for a new configuration is treated as wrong.

## 📌 Key Takeaways

The grammar of S3 access control compresses into three sentences. **One, an explicit Deny always wins**: so enforcement (encryption, HTTPS, network path) is all implemented as conditional Denies. **Two, cross-account needs an Allow on both sides**: carrying over same-account intuition unchanged will always be wrong. **Three, as scale grows, do not grow the policy; split the entry points**: Access Points are the answer, and the bucket policy stays thin, leaving only the delegation declaration. Layer the three data perimeter axes (trusted identities, trusted resources, trusted networks) on top and you also block exfiltration where "the permissions are right but the path is wrong."

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
