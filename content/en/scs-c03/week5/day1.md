# Day 1 - AWS KMS Fundamentals: CMK Types, Key Policy vs IAM, Symmetric/Asymmetric Keys

The essence of encryption is not "making data unreadable" but "controlling the keys." Data encrypted with AES-256 is a meaningless lump of bytes without the key, but whoever holds the key sees the data in plaintext. So in cloud security, discussions of encryption almost always come down to *key management* - who creates the keys, who uses them, and who audits that use. AWS Key Management Service (KMS) is a managed key management service that controls these three things through IAM, key policies, and CloudTrail.

The core concept of KMS is the **KMS key (formerly called the CMK, Customer Master Key)**. This key *never leaves* the boundary of KMS's FIPS 140-2 validated HSM (Hardware Security Module) *in plaintext*. What we send to KMS is an API call saying "please encrypt/decrypt this data," and KMS performs the operation only inside the HSM and returns the result. The fact that the key itself cannot be downloaded underpins the entire security model of KMS.

## The Key Hierarchy: Why Are There Multiple Layers of Keys?

When designing a cryptographic system, "encrypt everything with a single key" is the worst structure. If that key leaks, everything collapses; rotating that key means re-encrypting all the data; and every principal that uses that key has the same permissions. That is why modern key management uses a **hierarchy**. A key in an upper layer protects only the keys in the layer below, and the actual data is encrypted by the key at the very bottom.

```
[ AWS KMS key hierarchy ]

  ┌──────────────────────────────────────────────┐
  │  AWS KMS domain key (inside AWS, invisible to customers) │
  │  · The top-level protection key shared by the whole HSM fleet │
  │  · Isolated per Region, rotated periodically by AWS │
  └────────────────────┬─────────────────────────┘
                       │ encrypts (wrap)
                       ▼
  ┌──────────────────────────────────────────────┐
  │  KMS key (CMK) — the top-level key customers see │
  │  · No plaintext leaves the HSM boundary       │
  │  · Use controlled by key policy + IAM + grants │
  │  · Every use is recorded in CloudTrail        │
  └────────────────────┬─────────────────────────┘
                       │ encrypts (wrap)  ← GenerateDataKey
                       ▼
  ┌──────────────────────────────────────────────┐
  │  Data Key (DEK) — the key that encrypts the actual data │
  │  · The plaintext exists only briefly in the caller's memory │
  │  · Stored next to the data in ciphertext form │
  └────────────────────┬─────────────────────────┘
                       │ encrypts
                       ▼
              [ Actual data (S3 object / EBS block / RDS page) ]
```

This diagram is the map for the whole week. Day 2 covers the bottom two layers (data key ↔ data), Day 3 covers access control for the middle layer (key policies and grants), and Day 4 covers how this hierarchy is implemented in each service.

NIST SP 800-57 (Recommendation for Key Management) recommends layering keys by purpose and assigning a different **cryptoperiod** to each layer. Upper-layer keys (KEKs, Key Encryption Keys) have a small exposure surface and can be used for a long time, while lower-layer keys (DEKs, Data Encryption Keys) are exposed frequently and are renewed often. A KMS key corresponds to a KEK, and a data key corresponds to a DEK. Thanks to this separation, both "rotating the KEK does not require re-encrypting the data" (Day 4's automatic rotation) and "destroying the KEK locks every DEK" (crypto-shredding) hold at the same time.

The key material of a KMS key is durably replicated across an HSM fleet spanning multiple AZs, but even those replicas remain encrypted under the domain key. The system is designed so that even AWS operators cannot access plaintext key material, and administrative actions on the HSMs are possible only through quorum-based multi-party approval. So the requirement "back up the KMS key" does not hold - because it cannot be exported. Instead, AWS is responsible for durability, and if a customer wants to hold the key material themselves, they choose `EXTERNAL` (BYOK) or an external key store (XKS) and take that responsibility over.

## The Three Kinds of KMS Keys

KMS keys fall into three kinds depending on *who owns and manages the key*. The exam asks about this distinction and about whether the key policy can be controlled for each.

| Kind | Who creates/manages | Key policy editing | Rotation | Billing | Cross-account sharing |
|------|--------------------|--------------------|----------|---------|-----------------------|
| AWS managed key (`aws/service-name`) | AWS creates it on behalf of the service | Not allowed (read-only) | Automatic every year (fixed) | The key itself is free; usage is billed | Not possible |
| Customer managed key (CMK) | Created and owned by the customer | Full control | Optional (automatic/manual) | \$1/month per key + usage | Possible (via key policy) |
| AWS owned key | AWS, shared across many accounts | Not visible | Managed by AWS | Free | Not applicable |

When the exam presents a requirement such as "we want to edit the key policy directly to apply fine-grained access control, control the key rotation period, and share the key cross-account," the answer is almost always the **customer managed key**. An AWS managed key is convenient, but its key policy is fixed by AWS, so it cannot meet governance requirements. An AWS owned key is not even visible in the console and is not something you control.

A key that has an alias such as `aws/s3`, `aws/ebs`, or `aws/rds` is an AWS managed key. These are used automatically when the user turns on "default encryption" without specifying a separate key. A CMK, by contrast, is created by the user with `kms create-key` and referenced explicitly by `key-id`/`alias`.

There are four forms of identifier for referring to a key, and which form you use in policies and the CLI is a cause of real-world incidents.

```
key ID    : 1234abcd-12ab-34cd-56ef-1234567890ab
key ARN   : arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...
alias name: alias/app-data-key
alias ARN : arn:aws:kms:ap-northeast-2:111122223333:alias/app-data-key

A multi-Region key's key ID starts with mrk-:
            mrk-1234abcd12ab34cd56ef1234567890ab
```

> ⚠️ **Pitfall**: In the `Resource` of an IAM policy you can write **only the key ARN**; an alias ARN does not work as a resource. To control access by alias, you must use the `kms:ResourceAliases` (aliases attached to the key) or `kms:RequestAlias` (the alias used in the request) condition key. Also, an alias *can be changed to point to a different key at any time*, so alias-based control becomes a bypass route unless you also control the "permission to change the alias."

### Key State: Why Does It Suddenly Stop Working?

A KMS key has a state machine, and the allowed APIs differ by state. The exam asks about this table in forms such as "encryption works but decryption doesn't" and "the key exists but I get `KMSInvalidStateException`."

| State | Meaning | Can encrypt/decrypt? | Reversible? |
|-------|---------|----------------------|-------------|
| `Enabled` | Normal | Yes | — |
| `Disabled` | Disabled by an administrator | **No** (`DisabledException`) | Yes — restored immediately with `enable-key` |
| `PendingDeletion` | Scheduled for deletion (7-30 day wait) | **No** | Yes — `CancelKeyDeletion` during the wait |
| `PendingImport` | An `EXTERNAL` key whose key material has not been imported | **No** | Yes — import the key material |
| `Unavailable` | The connection to a custom key store (CloudHSM/XKS) is lost | **No** | Yes — reconnect the key store |

The key point is that **`Disabled` and `PendingDeletion` only block the API; they do not erase the key material.** That is why they are reversible. Only at the moment the wait period ends and the key is actually deleted is the key material destroyed, and from that point decryption is physically impossible.

### Creating and Checking a Key with the CLI

```bash
# 1) Create a customer managed symmetric key
aws kms create-key \
  --description "app-data-key" \
  --key-usage ENCRYPT_DECRYPT \
  --key-spec SYMMETRIC_DEFAULT \
  --tags TagKey=Environment,TagValue=prod

# Response (excerpt)
# {
#   "KeyMetadata": {
#     "KeyId": "1234abcd-12ab-34cd-56ef-1234567890ab",
#     "Arn": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...",
#     "KeyState": "Enabled",
#     "KeyUsage": "ENCRYPT_DECRYPT",
#     "KeySpec": "SYMMETRIC_DEFAULT",
#     "Origin": "AWS_KMS",
#     "MultiRegion": false,
#     "KeyManager": "CUSTOMER"        ← "AWS" for an AWS managed key
#   }
# }

# 2) Attach a human-readable name (alias)
aws kms create-alias \
  --alias-name alias/app-data-key \
  --target-key-id 1234abcd-12ab-34cd-56ef-1234567890ab

# 3) Tell at a glance whether a given key is customer managed or AWS managed
aws kms describe-key --key-id alias/aws/s3 \
  --query 'KeyMetadata.[KeyManager,KeyState,Origin]' --output text
# AWS   Enabled   AWS_KMS
```

If the `KeyManager` field is `AWS`, it is an AWS managed key. These keys appear in the "AWS managed keys" tab in the console, but the key policy edit button is disabled. Interestingly, an AWS managed key is also a *real key* in your account, and its usage is recorded in CloudTrail. In other words, auditing itself is possible. What is impossible is *editing the policy, sharing cross-account, and changing the rotation period*. Do not confuse "can't be audited" with "can't be controlled" - an AWS owned key is not visible in your account at all, so it can be neither audited nor controlled.

The 2019 Capital One breach is the clearest public example of the limits of encryption. The attacker reached the EC2 instance metadata service (IMDSv1) through an SSRF vulnerability in a WAF configuration and obtained the temporary credentials of the instance role, then used those credentials to take data from S3 buckets. The target data had encryption at rest applied, but because the stolen role **legitimately held decryption permission**, encryption did not serve as a line of defense. There are two lessons. First, encryption at rest only prevents "physical leakage of disks and backup media" and "direct storage access by unauthorized principals"; it does not prevent the case where permissions have been stolen. Second, therefore, the value of KMS lies not in encryption itself but in *narrowing the principals who can decrypt with a key policy* (Day 3's `kms:ViaService` and condition keys) and *detecting anomalous decryption with CloudTrail*.

## Key Policy vs IAM Policy: KMS's Own Permission Model

For most AWS services, access is decided by IAM policies alone, but **KMS uses a dual permission model in which IAM and the key policy work together.** This is the key reason KMS permission debugging is difficult.

- **Key policy**: a resource-based policy that must be attached to every KMS key. It is the *primary source of permission* over the key.
- **IAM policy**: an identity-based policy attached to a principal (user/role) in the account.

The rule: **unless the key policy delegates to IAM, an IAM policy alone cannot grant use of the key.** When a key is first created, most of the time the following statement goes into the default key policy.

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

This statement is the delegation that says "allow IAM policies in this account to grant KMS permissions." `root` does not mean only the root user; it means *delegating permission decisions for the whole account to IAM*. If you delete this statement, no one not named in the key policy (not even an administrator) can use the key, and the key can become "orphaned."

> ⚠️ **Pitfall**: The scenario "I deleted the `Enable IAM User Permissions` statement from the key policy and now nobody can access the key." In this case you add a principal directly to the key policy, or as a last resort contact AWS Support. You must not carelessly empty out a key policy.

Evaluation flow: a KMS request passes when (1) the key policy explicitly allows it, or delegates to IAM and IAM allows it, and (2) there is no explicit Deny in any policy. An explicit Deny always takes precedence.

```
[ KMS request permission evaluation order ]

  kms:Decrypt request (Principal = role/app)
        │
        ▼
  ① Deny in an SCP (Organizations)?  ──── yes ──→ denied
        │ no
        ▼
  ② Explicit Deny in the key policy?  ──── yes ──→ denied
        │ no
        ▼
  ③ Does the key policy directly Allow the principal? ─── yes ──→ go to ⑥
        │ no
        ▼
  ④ Does the key policy delegate to the account root (kms:*)? ─ no ─→ denied (no matter how open IAM is, it is useless)
        │ yes
        ▼
  ⑤ Does an IAM identity-based policy Allow? ── no ─→ denied
        │ yes
        ▼
  ⑥ Does it pass the grant or Condition check? ─ no ─→ denied
        │ yes
        ▼
       allowed → decrypt in the HSM → recorded in CloudTrail
```

Step ④ is the unique point of KMS. In other services, "if IAM is open, access works" is the norm, but in KMS **the resource side must open the door first** for IAM to matter. An S3 bucket policy is also resource-based, but S3 access can be established with IAM alone within the same account - KMS is the exception.

### The Full Shape of an Actual Default Key Policy

When you create a key in the console, a policy with three blocks like the one below is generated. The exam asks about the **separation of roles** among these three blocks.

```json
{
  "Version": "2012-10-17",
  "Id": "key-default-1",
  "Statement": [
    {
      "Sid": "Enable IAM User Permissions",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "kms:*",
      "Resource": "*"
    },
    {
      "Sid": "Allow access for Key Administrators",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/KeyAdmin" },
      "Action": [
        "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*",
        "kms:Put*", "kms:Update*", "kms:Revoke*", "kms:Disable*",
        "kms:Get*", "kms:Delete*", "kms:TagResource", "kms:UntagResource",
        "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Allow use of the key",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/AppRole" },
      "Action": [
        "kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*",
        "kms:GenerateDataKey*", "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

What stands out is that the action lists of the second and third blocks **do not overlap**. A Key Administrator can create keys, change the policy, and schedule deletion, but has no `Encrypt`/`Decrypt`. A Key User only encrypts and decrypts and cannot change the policy. This is a textbook implementation of **Separation of Duties**, and it is a pattern the SCS exam loves.

Separation of duties is rooted in the "Separation of privilege" principle from Saltzer & Schroeder's 1975 security design principles. It means splitting permissions so that no single principal can cause total damage alone. The reason this principle matters especially in KMS is that with key administrator permission (`kms:PutKeyPolicy`), one can *add decryption permission to oneself*. In other words, separating administrative and usage permissions is not a perfect bulkhead but a control that "forces an additional step that leaves a trace in CloudTrail in order to bypass it." That is why an EventBridge alarm on `kms:PutKeyPolicy` calls is the standard practical companion.

### Comparing the Three Permission Mechanisms

| Item | Key Policy | IAM policy | Grant |
|------|-----------|------------|-------|
| Type | Resource-based | Identity-based | Temporary permission-granting object |
| Required? | **Exactly one per key, mandatory** | Optional | Optional |
| Scope | That one key | Multiple keys via wildcards | That key + a specific grantee |
| Cross-account | **Possible** (specify external account principals) | Not possible (only principals in its own account) | Possible |
| How it is created | Edit the policy document | Edit the policy document | `CreateGrant` API |
| How it is revoked | Rewrite the policy | Rewrite the policy | `RevokeGrant` / `RetireGrant` |
| Condition keys | Supported | Supported | Only encryption context constraints |
| Main use | Key ownership and governance | Everyday permissions for people and apps | Delegation to AWS services, short-term tasks |

An answer choice saying "grant cross-account KMS permission with an IAM policy" is wrong. An IAM policy only grants permissions *to principals in its own account*; it cannot open a key in another account. Only a resource-based policy (the key policy) can open the door to an external account. Day 3's "both sides are required" rule comes from here.

> 🎯 **Scenario**: "The audit team must be able to verify the existence and configuration of KMS keys, but must not be able to decrypt data under any circumstances." → Grant the audit role only `kms:DescribeKey`, `kms:GetKeyPolicy`, `kms:GetKeyRotationStatus`, and `kms:ListResourceTags`, and exclude `kms:Decrypt`/`kms:ReEncrypt*`. Going further, put an **explicit Deny** on `kms:Decrypt` for the audit role in the key policy or an SCP - even if someone later adds the permission to IAM by mistake, the Deny wins. An answer choice that attaches the `ReadOnlyAccess` managed policy because it says "grant read-only permission" can be a trap, so get into the habit of checking at the action level.

## Symmetric Keys vs. Asymmetric Keys

KMS keys are divided into symmetric and asymmetric according to the key spec. Because their uses are completely different, the exam often asks you to tell them apart.

**Symmetric keys (default)** — AES-256. The same key encrypts and decrypts. Because the plaintext of the key never leaves KMS, it is used only through the `Encrypt`/`Decrypt`/`GenerateDataKey` APIs. The integrated encryption of every AWS service, such as EBS, S3, and RDS, uses symmetric keys. It is also **the foundation of envelope encryption (Day 2)**.

**Asymmetric keys** — an RSA or ECC key pair. The public key can be downloaded, and the private key stays only inside KMS.
- **Encrypt/decrypt use**: an external system encrypts with the public key → KMS decrypts with the private key.
- **Sign/verify use**: KMS signs with the private key → anyone can verify with the public key.

```bash
# Create a symmetric key (default)
aws kms create-key --description "app-data-key"

# Create an asymmetric key for signing
aws kms create-key \
  --key-spec RSA_2048 \
  --key-usage SIGN_VERIFY \
  --description "doc-signing-key"
```

When do you use an asymmetric key? When a system outside AWS (or a principal without permission to call KMS) must encrypt but must not be given decryption permission, or when digital signing/verification is needed. If every principal can call the KMS API and the goal is the integrated encryption of AWS services, a symmetric key is simpler and more cost-efficient. On the exam, "a partner without permission to call KMS encrypts data and sends it" → an asymmetric key.

### Key Specs and Supported Operations at a Glance

| Key Spec | Key Usage | Supported APIs | Characteristics / exam points |
|----------|-----------|----------------|-------------------------------|
| `SYMMETRIC_DEFAULT` (AES-256-GCM) | `ENCRYPT_DECRYPT` | `Encrypt`/`Decrypt`/`GenerateDataKey`/`ReEncrypt` | The default. **The integrated encryption of AWS services supports only this** |
| `RSA_2048` / `RSA_3072` / `RSA_4096` | `ENCRYPT_DECRYPT` or `SIGN_VERIFY` | The above + `Sign`/`Verify`/`GetPublicKey` | The public key can be distributed. The plaintext length limit is small |
| `ECC_NIST_P256/P384/P521` | **Only** `SIGN_VERIFY` | `Sign`/`Verify`/`GetPublicKey` | ECDSA signing. **Cannot be used for encryption** |
| `ECC_SECG_P256K1` | `SIGN_VERIFY` only | Same as above | Signing for the blockchain (secp256k1) family |
| `HMAC_256`, etc. | `GENERATE_VERIFY_MAC` | `GenerateMac`/`VerifyMac` | Symmetric MAC. Not encryption/decryption |

Three things are commonly confused. ① **ECC keys cannot be used for encryption** - they are signing-only. An answer choice saying "encrypt data with an elliptic curve" is wrong in KMS. ② **Asymmetric keys cannot be used for the integrated encryption of AWS services (S3, EBS, RDS, and so on)** - those services call `GenerateDataKey`, which asymmetric keys do not support. ③ **`KeyUsage` cannot be changed after creation** - you cannot turn an RSA key created for encryption into one for signing, so you have to create a new key.

The plaintext length limit of asymmetric encryption is a mathematical constraint. RSA-OAEP can hold only the modulus size minus the padding overhead, so with the RSA_2048 + `RSAES_OAEP_SHA_256` combination the plaintext limit is a mere 190 bytes (446 bytes for RSA_4096). That is far smaller than the 4,096-byte limit of a symmetric key's `Encrypt`. That is why a design that "encrypts a file" with an asymmetric key does not exist; in practice you use a hybrid structure in which *an asymmetric key wraps a symmetric key and the symmetric key encrypts the data*. This is the pattern that TLS handshakes and PGP have used for decades, and it is a cousin of envelope encryption (Day 2).

```bash
# Sign — the private key stays only inside KMS, and only the signature comes out
aws kms sign \
  --key-id alias/doc-signing-key \
  --message fileb://contract.pdf \
  --message-type RAW \
  --signing-algorithm RSASSA_PSS_SHA_256 \
  --query Signature --output text > contract.sig

# Verify — it works with KMS, and it also works externally with the public key
aws kms verify \
  --key-id alias/doc-signing-key \
  --message fileb://contract.pdf \
  --message-type RAW \
  --signing-algorithm RSASSA_PSS_SHA_256 \
  --signature fileb://contract.sig
# { "KeyId": "...", "SignatureValid": true, "SigningAlgorithm": "RSASSA_PSS_SHA_256" }

# Distribute the public key — with just this, a partner can verify/encrypt without KMS
aws kms get-public-key \
  --key-id alias/doc-signing-key \
  --query PublicKey --output text | base64 -d > pubkey.der
```

The 2010 breach of Sony's PlayStation 3 code-signing scheme is a classic example of what happens when "the private key is handled outside the system." Sony's signing implementation used the same value every time for the random number (nonce) required for ECDSA signatures, and by comparing just two different signatures one could algebraically recover the private key. As a result, anyone could produce valid signatures in Sony's name. KMS's `Sign` API handles random number generation, padding, and algorithm selection inside the HSM and never exports the private key. The exam's advice to use KMS `Sign` instead of "implementing signing yourself" aims to structurally eliminate this class of implementation mistake.

> 🎯 **Scenario**: "We want to code-sign firmware images, but the signing key must not be stored on developer laptops or CI runners, and an audit log must show who signed what and when." → Create an asymmetric KMS key for `SIGN_VERIFY` and grant the CI role only `kms:Sign` (`kms:GetPublicKey` goes to the deployment pipeline). The private key never leaves the HSM, and every `Sign` call is recorded in CloudTrail with the principal and time. Only the public key is distributed to the verification side, so verifiers cannot forge signatures. An answer choice saying "put the key in Secrets Manager and have CI retrieve it" does not meet the requirement because the key would exist in plaintext in process memory.

## Key Material Origin: Where Is the Key Generated?

When you create a CMK, you can decide the origin of the key material.

- **AWS_KMS** (default): the KMS HSM generates the key material. The simplest.
- **EXTERNAL**: the customer generates and imports the key material (BYOK, Bring Your Own Key). You control the key lifecycle directly, but the customer also bears responsibility for backup and re-import. Automatic rotation is not possible.
- **AWS_CLOUDHSM**: key material is stored in a CloudHSM cluster (a custom key store). For when there is a regulatory requirement for dedicated HSMs.
- **EXTERNAL_KEY_STORE (XKS)**: the key is kept in an external key manager (such as an on-premises HSM) and KMS acts as a proxy.

> 🎯 **Scenario**: "Because of regulation, we must generate and control the key material ourselves, and AWS must not generate the key." → BYOK with the key material origin set to `EXTERNAL`, or, for a stronger requirement, a CloudHSM custom key store/XKS. Note, however, the trade-off that an EXTERNAL key *cannot be automatically rotated*.

| Requirement wording | Correct Origin | Reason |
|---------------------|----------------|--------|
| "Standard encryption with no operational burden" | `AWS_KMS` | The default, and automatic rotation is possible |
| "We generate the key material and import it" | `EXTERNAL` (BYOK) | The customer is responsible for generating and backing up the key material |
| "The key must be kept in a dedicated (single-tenant) HSM" | `AWS_CLOUDHSM` | A CloudHSM custom key store |
| "The key must be outside AWS (an on-premises HSM)" | `EXTERNAL_KEY_STORE` (XKS) | KMS is a proxy; the real key is external |

BYOK (`EXTERNAL`) has two frequently tested pitfalls. ① You **can set an expiration time** on the imported key material, and when it expires the key state falls to `PendingImport` and decryption stops immediately - this can be the cause of the scenario "decryption suddenly stopped." ② If you lose the key material, AWS cannot recover it for you. The essence of this option is that the moment you choose BYOK, *the responsibility for backing up the key material passes to the customer*. Choosing BYOK when there is no regulatory wording like "AWS must not generate the key" is a choice that takes on unnecessary operational risk.

With XKS (External Key Store), KMS does not perform cryptographic operations itself but forwards requests to the external key manager through the XKS proxy. The price of this structure is **availability coupling.** If the external HSM or proxy goes down, encryption and decryption fail for every AWS service that uses that key - S3 reads, EBS volume access, and even RDS startup stop together. Understanding the trade-off that you gain "ultimate control over the key" at the cost of "stepping outside AWS's availability SLA" is the judgment the exam wants. Choose XKS only when the regulatory wording contains an expression such as "keys must remain outside the cloud provider."

## Multi-Region Keys

By default, a KMS key is tied to a *single Region*, and data encrypted with a key in one Region cannot be decrypted in another Region (because the key cannot leave that Region). A multi-Region key is a primary/replica key set that replicates *the same key material and key ID* across multiple Regions, so data encrypted in one Region can be decrypted with the identical key in another Region. It is used for DynamoDB global tables and cross-Region DR scenarios. Note, however, that key policies are managed independently per Region.

To copy an EBS snapshot encrypted with an ordinary (single-Region) KMS key to another Region, *re-encryption* with a key in the destination Region is required. Unless it is a multi-Region key, the key itself cannot cross Regions.

A multi-Region key is not a "global key." The primary and replica share *the same key material and the same key ID*, but **the key policy, grants, alias, and tags are completely independent per Region.** Opening the key policy of the Seoul Region replica does not open the Virginia primary, and the reverse is also true. "I used a multi-Region key but got AccessDenied in the other Region" is a typical scenario caused by not replicating the policy. Also, you turn on automatic rotation only on the primary, and the rotated key material propagates to the replicas.

> 🎯 **Scenario**: "We run a DynamoDB global table in two Regions, Seoul and Tokyo, encrypt at rest with customer managed keys in both Regions, and must be able to read the data from either side in a DR situation." → Create a multi-Region key as the primary in Seoul, create a replica in Tokyo, and then **configure the key policies of both Regions identically.** Creating two separate single-Region keys fails, because the ciphertext of items replicated between Regions cannot be decrypted in the other Region. Conversely, if "data never moves between Regions at all," a multi-Region key actually widens the exposure surface of the key material, so a single-Region key is right.

## Reading KMS Usage in CloudTrail

Whether KMS's controls actually work can be proven only by logs. Every KMS API call is recorded as a CloudTrail management event, and **plaintext data and plaintext keys are never recorded.** Instead, "who, when, which key, in what context" is left behind.

```json
{
  "eventTime": "2026-03-14T02:11:07Z",
  "eventSource": "kms.amazonaws.com",
  "eventName": "Decrypt",
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::111122223333:assumed-role/AppRole/i-0abc123",
    "sessionContext": { "sessionIssuer": { "userName": "AppRole" } }
  },
  "sourceIPAddress": "10.0.12.44",
  "requestParameters": {
    "encryptionContext": { "tenant": "acme", "purpose": "invoice" },
    "encryptionAlgorithm": "SYMMETRIC_DEFAULT"
  },
  "responseElements": null,
  "resources": [
    { "ARN": "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...",
      "accountId": "111122223333", "type": "AWS::KMS::Key" }
  ],
  "readOnly": true,
  "eventType": "AwsApiCall"
}
```

What to read from this single event:

- `userIdentity.arn` is `assumed-role/AppRole/i-0abc123` → an **EC2 instance role** made the call. It is a workload, not a person. If you see an `IAMUser` or an unfamiliar instance ID here, it warrants investigation.
- `requestParameters.encryptionContext` → you can see directly which tenant's data was decrypted. As Day 2 covers, **the context is not encrypted**, so it can be read in logs, which is why you must not put secrets in it.
- `responseElements: null` → the decryption result (plaintext) is not in the log. KMS does not record sensitive responses.
- `sourceIPAddress` is a VPC private IP → the call came through a VPC endpoint. If you see an internet IP, it is a signal that the key is being used through an unexpected path.

KMS events carry clues that identify the case where another service called *on your behalf*. In the `GenerateDataKey` event left when S3 stores an object with SSE-KMS, the calling principal appears as the user's role but `sourceIPAddress` is recorded as a service name such as `s3.amazonaws.com`, and the bucket ARN and object key go into the encryption context of the request parameters. In other words, you can tell from the logs alone "was this decryption done through S3, or did a person run `aws kms decrypt` directly?" The condition key that turns this distinction from *after-the-fact detection* into *advance blocking* is Day 3's `kms:ViaService`.

In 2014, Code Spaces went out of business within days after an attacker stole AWS console credentials and mass-deleted resources, including backups. After this incident, "separation of delete/destroy-class permissions" and "a window of time to reverse things" became standard requirements in cloud security. The design of KMS bears its mark too - a key is not deleted immediately but is forced through a waiting period of at least 7 and at most 30 days, during which `CancelKeyDeletion` can reverse it, and attempts to use it during the waiting period keep being recorded in CloudTrail. From an incident response standpoint, this waiting period is "the only window in which defenders can intervene when an attacker tries to destroy data through crypto-shredding." That is why a real-time alarm on `ScheduleKeyDeletion` events is a baseline item in KMS operations.

KMS permissions can be narrowed not only by *who* but by *which path and in what context* the call was made, through conditions (`kms:ViaService`, `kms:EncryptionContext:*`, `kms:CallerAccount`, and so on). Those condition keys are covered with actual policy documents on Day 3.

## Summary

KMS "provides only operations without taking the key out of the HSM," controls its use with a *key policy (mandatory, resource-based) + IAM (when delegated) + grants (temporary)*, and records all use in CloudTrail. Keys form a hierarchy running KMS key (KEK) → data key (DEK) → data, and thanks to this hierarchy rotation is transparent and destruction is immediate. If you need governance, the starting point is a customer managed key; if you need external encryption or signing, it is an asymmetric key. And as the Capital One case shows, **encryption does not prevent permission theft** - the real defensive strength of KMS is narrowing the principals who can decrypt with key policies and catching anomalous use with logs.

---

## 📝 Practice Questions

**Question 1.** The security team requires: "We must edit the key policy directly to apply fine-grained access control, control the key rotation period, and share the key with other accounts." Which type of key should be used?

A) AWS owned key  
B) AWS managed key (`aws/s3`)  
C) Customer managed key  
D) S3 managed key (SSE-S3)  

**Answer: C**  
Explanation: Editing the key policy, controlling the rotation period, and cross-account sharing are all possible only with a customer managed key that the customer owns and manages. For an AWS managed key, the key policy is fixed by AWS and cannot be edited, and cross-account sharing is not possible. An AWS owned key is not even visible in the console and is not under your control. SSE-S3 is not a KMS key but a separate method managed by S3, and it has no concept of a key policy.

---

**Question 2.** An administrator accidentally deleted the `Enable IAM User Permissions` statement (Principal is the account root, Action `kms:*`) from the default key policy of a KMS key. Even users with IAM administrator permissions can no longer use the key. What is the most accurate cause?

A) IAM policies always take precedence over KMS, so it is irrelevant  
B) Unless the key policy delegates permissions to IAM, IAM policies alone cannot grant access to the key  
C) The key was automatically disabled  
D) CloudTrail was disabled  

**Answer: B**  
Explanation: KMS uses a dual model in which the key policy and IAM work together. The `Enable IAM User Permissions` statement in the key policy is the key delegation that says "delegate permission decisions to IAM policies in this account." If it is deleted, no principal that is not explicitly named in the key policy (administrators included) can use the key. The explanation that IAM always takes precedence over KMS is wrong, and key disablement or CloudTrail is unrelated to this symptom.

---

**Question 3.** A partner system outside AWS must encrypt data and send it to our account. The partner must not be given KMS API call permission or decryption permission. What is the most appropriate key configuration?

A) Create a symmetric customer managed key and grant the partner `kms:Encrypt` permission  
B) Create an asymmetric KMS key (encrypt/decrypt usage), distribute the public key to the partner, and perform decryption with the private key inside KMS  
C) Issue S3 presigned URLs to the partner  
D) Share an AWS managed key  

**Answer: B**  
Explanation: An asymmetric key is suitable when you want the partner to only encrypt without granting KMS call permission. If you distribute the public key, the partner can encrypt locally without the KMS API, and the private key never leaves KMS, so only KMS in our account performs decryption. Granting `kms:Encrypt` on a symmetric key would require the partner to call the KMS API, which violates the requirement. Presigned URLs or sharing a managed key do not fit this requirement.

---

**Question 4.** You want to copy an EBS snapshot encrypted with a single-Region customer managed key from us-east-1 to us-west-2 and use it. What is the most accurate statement?

A) The same key ID can decrypt in any Region, so no additional work is needed  
B) When copying the snapshot, it must be re-encrypted with a key in the destination Region (a single-Region key cannot cross Regions). If cross-Region operations are frequent, consider a multi-Region key  
C) Converting to an asymmetric key resolves this automatically  
D) You must switch to an AWS owned key  

**Answer: B**  
Explanation: Because the key material of a regular KMS key cannot leave its Region, using the snapshot in another Region requires re-encrypting it with a key in the destination Region. To perform cross-Region decryption with the same key, a multi-Region key, which replicates the same key material across multiple Regions, is the design answer. Converting to asymmetric or switching to an AWS owned key does not solve this problem.

---
