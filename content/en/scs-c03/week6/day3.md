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

## 📝 연습 문제

**문제 1.** 한 버킷에 IAM 정책은 GetObject를 Allow하지만 버킷 정책에 동일 객체에 대한 명시적 Deny가 있다. 최종 결과는?

A) IAM Allow가 우선하므로 접근 허용  
B) 명시적 Deny가 모든 Allow를 뒤엎으므로 접근 거부  
C) 두 정책이 충돌해 평가 오류  
D) 더 최근에 만들어진 정책이 우선  

**정답: B**  
해설: IAM 평가 모델에서 명시적 Deny는 어떤 Allow보다 항상 우선한다. IAM 정책의 Allow가 있어도 버킷 정책에 명시적 Deny가 있으면 요청은 거부된다. 정책 충돌은 오류가 아니라 Deny 우선 규칙으로 결정론적으로 해결되며, 생성 시점은 평가에 영향을 주지 않는다.

---

**문제 2.** 모든 PutObject가 반드시 특정 CMK로만 암호화되도록 강제하려 한다. 버킷 기본 암호화만으로 충분한가, 아니면 무엇이 필요한가?

A) 버킷 기본 암호화만으로 충분하다  
B) 버킷 정책에 SSE-KMS가 아니면 Deny, 그리고 지정 KMS 키 ID가 아니면 Deny하는 두 조건을 추가한다  
C) ACL을 BucketOwnerEnforced로 설정한다  
D) Block Public Access를 켠다  

**정답: B**  
해설: 버킷 기본 암호화는 헤더 없이 올린 객체에 기본값을 적용할 뿐, 클라이언트가 *다른 키*를 명시해 올리는 것을 막지 못한다. 특정 CMK 강제는 `s3:x-amz-server-side-encryption`과 `s3:x-amz-server-side-encryption-aws-kms-key-id` 조건으로 두 개의 Deny를 걸어야 완성된다. ACL 비활성화와 BPA는 암호화 강제와 무관하다.

---

**문제 3.** 회사 데이터가 담긴 버킷에 대해, 지정된 VPC 엔드포인트를 경유하지 않은 모든 접근(인터넷·타 VPC·타 계정)을 차단하려 한다. 올바른 조건 키는?

A) `aws:SecureTransport`  
B) `s3:x-amz-server-side-encryption`  
C) `aws:SourceVpce`를 StringNotEquals로 Deny  
D) `s3:max-keys`  

**정답: C**  
해설: `aws:SourceVpce` 조건으로 "지정한 VPC 엔드포인트가 아니면 Deny"를 걸면, 그 엔드포인트를 경유하지 않은 모든 경로(인터넷, 다른 VPC, 다른 계정)의 접근이 차단되어 데이터 유출을 막는다. `aws:SecureTransport`는 HTTPS 강제, 암호화 헤더 조건은 저장 암호화 강제, `s3:max-keys`는 페이지네이션 제어로 네트워크 경로 통제와 무관하다.

---

**문제 4.** 교차계정 업로드를 받는 버킷에서, 업로더 계정이 객체를 소유해 버킷 소유자가 객체를 읽지 못한다. 가장 권장되는 해결책은?

A) 업로더에게 매번 `bucket-owner-full-control` ACL을 요청한다  
B) Object Ownership을 BucketOwnerEnforced로 설정해 ACL을 비활성화하고 모든 객체를 버킷 소유자 소유로 만든다  
C) 버킷을 공개로 전환한다  
D) 버전 관리를 켠다  

**정답: B**  
해설: Object Ownership을 BucketOwnerEnforced로 설정하면 ACL이 완전히 비활성화되고 모든 객체를 버킷 소유자가 소유하므로 교차계정 소유권 문제가 근본적으로 사라진다. ACL 강제 방식은 레거시이고 누락 위험이 있으며, 공개 전환은 심각한 보안 위반, 버전 관리는 소유권과 무관하다.

---

**문제 5.** 거대한 공유 데이터 레이크 버킷에서 애플리케이션마다 접근 정책이 달라 단일 버킷 정책이 비대해지고 관리가 어렵다. 가장 적절한 접근은?

A) 모든 권한을 버킷 정책에 계속 누적한다  
B) 애플리케이션별 S3 Access Point를 만들어 각자 고유 정책과 VPC 제한을 부여한다  
C) 버킷을 애플리케이션 수만큼 복제한다  
D) 객체 ACL로 애플리케이션별 권한을 부여한다  

**정답: B**  
해설: S3 Access Point는 하나의 버킷에 여러 명명된 진입점을 두고 각자 작고 명확한 정책과 네트워크 출처(VPC 전용 등)를 부여해, 비대한 단일 정책을 분할 통치한다. 버킷 정책 누적은 관리성과 가독성을 악화시키고, 버킷 복제는 데이터 중복·비용·정합성 문제를 낳으며, ACL은 레거시로 중앙 가시성이 없다.

---
