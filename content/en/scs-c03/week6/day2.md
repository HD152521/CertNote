# Day 2 - S3 Data Protection: SSE-S3/SSE-KMS/DSSE, Bucket Keys, Object Lock, Versioning, Block Public Access

S3 is essentially an infinitely scalable object storage and the most common site of data breaches in AWS. "Accidentally misconfigured public S3 bucket" is a regular headline in security news. From a security exam perspective, S3 data protection splits into two axes — **encryption at rest** and **access control and exposure prevention**. Today we address encryption, integrity, and exposure prevention mechanisms; tomorrow (day 3) covers advanced access control policies in depth.

## Encryption at Rest: Three (Effectively Four) Modes

All new objects in S3 are encrypted by default with **SSE-S3 (AES-256)** (default-enabled since 2023). The exam tests the differences and selection criteria among four modes.

| Mode | Key Management | Key Policy Control | Audit (CloudTrail) | Use Case |
|------|-----------------|---------------------|-------------------|----------|
| **SSE-S3** | AWS (internal) | Not possible | No key usage logs | Default encryption, operational simplicity |
| **SSE-KMS** | KMS CMK | Via key policy | Records kms:Decrypt etc. | Key access control and audit needed |
| **DSSE-KMS** | KMS CMK (dual-layer) | Via key policy | Records | Regulatory dual-encryption requirement |
| **SSE-C** | Customer-supplied key | Customer responsibility | Key itself not stored | When not entrusting key to AWS |

```bash
# Upload object with SSE-KMS
aws s3api put-object \
  --bucket my-secure-bucket \
  --key reports/2026-q2.csv \
  --body ./report.csv \
  --server-side-encryption aws:kms \
  --ssekms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234
```

> 💡 **Related Theory**: The decisive difference between SSE-S3 and SSE-KMS is not *encryption itself* but *separation of access control for keys*. SSE-S3 encrypts data, but the person seeing the key and the person seeing the data are both "S3 access holders" — there is no independent key access control. SSE-KMS separates data access (s3:GetObject) and key access (kms:Decrypt) into **two independent authorization gates**. Even with S3 permissions, if the KMS key policy blocks it, decryption fails. This *separation of duties* makes SSE-KMS preferred in regulated environments.

### DSSE-KMS: Why Encrypt Twice?

DSSE-KMS (Dual-layer SSE) encrypts an object with **two independent layers of KMS data keys**. Some regulations like U.S. Department of Defense IL explicitly mandate "two independent encryption layers." There are performance and cost overheads, so unless the regulation explicitly requires it, SSE-KMS is sufficient.

> ⚠️ **Pitfall**: If you see keywords "dual-layer encryption regulation compliance," the answer is DSSE-KMS. For just "strong encryption" or "key control," it's SSE-KMS. Using DSSE everywhere introduces unnecessary cost and latency.

### SSE-C: Bring Your Own Key

SSE-C requires the customer to provide the encryption key in the header of each request, and S3 encrypts/decrypts with that key but **does not store the key** (only the HMAC for validation). Use it only if you absolutely refuse to have AWS manage keys. If you lose the key, data is irrecoverably lost, and HTTPS is mandatory (because the key is transmitted in a header).

## S3 Bucket Key: Mitigating KMS Cost and Throttle

The problem with SSE-KMS is that it calls `GenerateDataKey` / `Decrypt` to KMS per object, stressing KMS request throttle limits and cost. **S3 Bucket Key** retrieves a short-lived bucket-level key from KMS once, then S3 locally derives data keys for multiple objects from that key. This results in reducing KMS API calls by up to 99%.

```bash
aws s3api put-bucket-encryption \
  --bucket my-secure-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyID": "arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234"
      },
      "BucketKeyEnabled": true
    }]
  }'
```

> 🎯 **Scenario**: "High-traffic bucket with SSE-KMS sees KMS ThrottlingException and cost explosion" → the answer is **enable S3 Bucket Key**. The key is reducing the number of KMS calls themselves, not changing key policy or IAM. Remember: DSSE-KMS is not compatible with Bucket Key.

## Object Lock: WORM and Immutability

S3 Object Lock follows the **WORM (Write Once Read Many)** model, blocking **deletion and overwriting** of object versions for a specified period or indefinitely. It is used for ransomware defense, regulatory retention (e.g., SEC 17a-4), and immutable audit log storage. Object Lock works only on **versioning-enabled buckets** and must be **enabled at bucket creation** (existing buckets require a support request).

Two retention modes:
- **Governance Mode**: A special principal with `s3:BypassGovernanceRetention` permission can override retention and delete. Preserves operational flexibility.
- **Compliance Mode**: **Even the root account** cannot delete or modify within the retention period. True immutability. Used for regulatory compliance, but if misconfigured, it cannot be undone, so be careful.

Additionally, **Legal Hold** locks an object until explicitly released, regardless of retention period.

```bash
aws s3api put-object-retention \
  --bucket compliance-logs \
  --key audit/2026.log \
  --retention '{"Mode":"COMPLIANCE","RetainUntilDate":"2033-01-01T00:00:00Z"}'
```

> 💡 **Related Theory**: Object Lock is an implementation of *immutable infrastructure* and *append-only audit logs* in storage. What ransomware attackers target is "encrypt or delete even the backup to prevent recovery," but Compliance-mode Object Lock physically protects data within the retention period even if credentials are compromised (root cannot override it). This goes beyond "permission-based control (IAM)" to "immutability guarantee of the data itself," and is the last layer of defense in depth.

## Versioning: Recovery from Deletion and Overwriting

Versioning preserves previous versions when an object is overwritten or deleted. On deletion, instead of actually removing data, a **delete marker** becomes the latest version — previous versions remain and are recoverable. Once versioning is enabled, it cannot be *disabled*, only *suspended*.

Adding **MFA Delete** requires MFA for permanent version deletion or versioning status changes — preventing a compromised credential alone from deleting versions (only the root account can configure this).

> ⚠️ **Pitfall**: In a versioning-enabled bucket, "I deleted an object but storage costs didn't decrease" — because previous versions remain. You must use **lifecycle policy** to expire noncurrent versions after a certain number of days. Delete markers can also be configured for automatic cleanup.

## Block Public Access (BPA): The Last Safety Belt

Most S3 data breaches are from unintentional public settings. **Block Public Access** is a top-level override that *neutralizes* ACL and bucket policy public settings, with four options:

```
BlockPublicAcls          → Block new public ACL grants
IgnorePublicAcls         → Ignore existing public ACLs
BlockPublicPolicy        → Block public bucket policy application
RestrictPublicBuckets    → Restrict cross-account/anonymous access even if public policy exists
```

You can set it at both account and bucket levels, and **account-level BPA overrides bucket settings** (the stronger one wins). New accounts have all 4 enabled by default.

> 🎯 **Scenario**: "I allowed public read in the bucket policy but anonymous access is still denied" — almost certainly BPA is enabled. BPA is a *pre-evaluation* guard rail, not evaluated within policy logic. Even for truly public static websites, the recommended pattern is to keep BPA enabled and serve the private S3 **via CloudFront + OAC (Origin Access Control)**. Direct public access is the last resort.

> 🔍 **Deeper Dive**: S3 can validate checksums (MD5, CRC32, CRC32C, SHA-1, SHA-256) during upload to ensure object integrity, and can detect in-transit corruption with `Content-MD5` or `x-amz-checksum-*` headers. To enforce HTTPS, add a condition `aws:SecureTransport: false` to Deny in the bucket policy (covered in day 3 with encryption enforcement). All four layers — encryption, integrity, exposure prevention, access control — are needed to complete "S3 data protection."

---

## 📝 연습 문제

**문제 1.** SSE-S3 대신 SSE-KMS를 선택해야 하는 가장 본질적인 이유는?

A) SSE-KMS가 더 강한 암호화 알고리즘을 쓰기 때문  
B) 데이터 접근(s3:GetObject)과 키 접근(kms:Decrypt)을 독립된 인가 게이트로 분리해 키 사용을 별도 통제·감사할 수 있기 때문  
C) SSE-KMS가 더 저렴하기 때문  
D) SSE-S3는 버전 관리를 지원하지 않기 때문  

**정답: B**  
해설: 두 모드 모두 AES-256을 쓰므로 알고리즘 강도는 같다. 차이는 키 접근 통제의 분리다. SSE-KMS는 KMS 키 정책으로 복호화 권한을 S3 권한과 별개로 통제하고, CloudTrail에 키 사용을 기록해 감사할 수 있다. SSE-KMS는 KMS 호출 비용이 추가되므로 더 저렴하지 않으며, 버전 관리는 암호화 모드와 무관하다.

---

**문제 2.** SSE-KMS를 사용하는 고트래픽 버킷에서 KMS ThrottlingException과 비용 급증이 발생한다. 가장 적절한 해결책은?

A) 암호화를 SSE-S3로 변경  
B) S3 Bucket Key를 활성화해 객체별 KMS 호출을 버킷 수준 키 파생으로 대체  
C) KMS 키를 비활성화  
D) DSSE-KMS로 전환  

**정답: B**  
해설: S3 Bucket Key는 버킷 수준 단기 키를 KMS에서 한 번 받아 객체별 데이터 키를 S3가 로컬에서 파생하므로 KMS API 호출을 최대 99% 줄인다 — 스로틀과 비용을 동시에 완화한다. SSE-S3로 바꾸면 키 통제·감사를 잃고, DSSE-KMS는 오히려 KMS 호출이 늘며 Bucket Key와 호환되지 않는다. 키 비활성화는 복호화를 막아버린다.

---

**문제 3.** 규제상 "권한 있는 누구도(루트 계정 포함) 보존 기간 내에는 객체를 삭제·변경할 수 없어야 한다"는 요구가 있다. 올바른 구성은?

A) 버킷 정책으로 Delete를 Deny  
B) 버전 관리 + Object Lock의 Governance 모드  
C) 버전 관리 + Object Lock의 Compliance 모드  
D) MFA Delete만 활성화  

**정답: C**  
해설: Compliance 모드 Object Lock은 루트 계정조차 보존 기간 내 삭제·변경할 수 없는 진정한 불변성을 제공한다. Governance 모드는 `BypassGovernanceRetention` 권한자가 우회할 수 있어 "누구도"라는 요구에 미달한다. 버킷 정책 Deny는 권한 변경으로 우회 가능하고, MFA Delete는 MFA를 가진 루트가 여전히 삭제할 수 있다.

---

**문제 4.** 버킷 정책에 익명 공개 읽기(`Principal: *`, `s3:GetObject`)를 허용했는데도 외부에서 접근이 거부된다. 가장 가능성 높은 원인은?

A) SSE-KMS 암호화 때문  
B) 계정/버킷 수준의 Block Public Access가 활성화되어 공개 정책을 무력화하고 있다  
C) 버전 관리가 꺼져 있어서  
D) 객체 잠금이 걸려 있어서  

**정답: B**  
해설: Block Public Access는 ACL·버킷 정책의 공개 설정보다 우선 적용되는 상위 가드레일이다. BPA의 `BlockPublicPolicy`/`RestrictPublicBuckets`가 켜져 있으면 공개 버킷 정책이 무시되어 익명 접근이 거부된다. 암호화·버전 관리·객체 잠금은 익명 읽기 차단의 원인이 아니다. 권장 패턴은 BPA를 유지하고 CloudFront+OAC로 비공개 S3를 서빙하는 것이다.

---

**문제 5.** 버전 관리가 켜진 버킷에서 객체를 다수 삭제했는데 스토리지 비용이 줄지 않는다. 가장 적절한 조치는?

A) 버전 관리를 비활성화한다  
B) 수명주기 정책으로 비현행 버전(noncurrent version)과 만료된 delete marker를 일정 일수 후 만료·정리한다  
C) BPA를 활성화한다  
D) Object Lock Compliance를 적용한다  

**정답: B**  
해설: 버전 관리 버킷에서 삭제는 실제 데이터를 지우지 않고 delete marker를 추가하며, 이전 버전들은 그대로 남아 비용을 차지한다. 수명주기 정책으로 비현행 버전을 만료시키고 만료된 delete marker를 정리해야 실제 스토리지가 회수된다. 버전 관리는 비활성화할 수 없고(suspend만 가능), BPA·Object Lock은 비용 회수와 무관하며 Object Lock은 오히려 삭제를 막는다.

---
