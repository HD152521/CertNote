# Day 1 - KMS: Why Key Management Is the Root of Cloud Security

Encryption is the word that comes up most often in cloud security, but the point where systems actually collapse is almost never "the encryption itself" — it's "who handles the keys, how, and where." AES-256 itself looks unbreakable for the next several decades even once quantum computers arrive, yet if you look at AWS security incidents, 90%+ happen because "keys and credentials were exposed the wrong way." The 2017 Verizon Wireless S3 bucket exposure, the 2019 Capital One SSRF + IAM Role theft, the 2022 Uber MFA bombing — in every case the core wasn't "the encryption algorithm was broken" but "the key management scheme fell apart."

Against this backdrop, AWS launched **KMS (Key Management Service)** at re:Invent in November 2014. Before that, each service did its own encryption and the user had to manage keys directly. The operational burden was so high that in practice many companies either "didn't encrypt at all" or "pretended to turn it on while storing the key in plaintext." KMS solved this with "managed keys + per-call billing + standard SDK integration," and once nearly every AWS service (S3, EBS, RDS, DynamoDB, Lambda, Secrets Manager, etc.) integrated with KMS, it effectively became the root of AWS security. In this article we look at which cryptographic and operational trade-offs KMS chose, why envelope encryption is nearly the only right answer, and the scenarios you frequently run into on both the exam and the job.

## The 4 Categories of KMS Keys and the Question Each One Answers

The classification that splits KMS keys into "AWS Owned / AWS Managed / Customer Managed / CloudHSM" is not a mere list of options — it defines four points on a spectrum of "how much key control who gets to hold." The far left end (Owned) means AWS decides everything and you don't have to think about it, but you also have zero control; the far right end (CloudHSM) means you operate a dedicated FIPS 140-2 Level 3-certified HSM yourself, at a very high operational cost.

| Category | Who creates it | Who writes the policy | Cost | Rotation | Typical use |
|------|------------|------------------|------|------|-------------|
| AWS Owned | AWS | Not exposed to the user | Free | AWS automatic | DynamoDB default encryption |
| AWS Managed (`aws/<service>`) | AWS auto-creates on first use | AWS fixed policy | Free | Every 1 year, automatic | S3 default SSE-KMS, EBS default |
| Customer Managed (CMK) | You | You, freely | $1/month + $0.03/10k calls | Optional (1 year, or 90 days–7 years) | Compliance / fine-grained control |
| CloudHSM (linked to KMS via XKS) | Your HSM | You | HSM instance hourly cost | Manual | Regulated industries |

The most important exam keyword in this classification is "who can write the policy." An AWS Managed Key is visible in the console, but you can't modify its key policy. So when you need finer granularity like "only this specific IAM Role may decrypt with this key," you have to switch to a Customer Managed Key (CMK). A common anti-pattern in practice is the case where "SSE-KMS is turned on for S3 but the default key (`aws/s3`) is used as-is, so there's no permission separation." If every IAM user can decrypt with the same key, half the meaning of encryption is gone.

> 💡 **Related theory**: The spectrum of key control is a question of who is responsible for the key management lifecycle in NIST SP 800-57 (generation, distribution, use, rotation, destruction). AWS Owned means AWS handles all 5 stages, Customer Managed means the customer owns policy/rotation/destruction, and CloudHSM means the customer owns everything from creation to destruction. When a compliance auditor demands "an audit trail of key creation events," AWS Owned/Managed can't answer it — only CMK and above show up clearly in CloudTrail.

> 🔍 **Going deeper**: KMS itself also runs on top of HSMs internally. To be precise, it's a **multi-tenant FIPS 140-2 Level 3** HSM cluster operated by AWS (see the official whitepaper "AWS KMS Cryptographic Details"). In other words, even a KMS CMK is ultimately stored inside an HSM, and the key material never leaves the HSM. The difference from CloudHSM is multi-tenant vs. single-tenant, and whether the compliance certification is held in AWS's name or the customer's. So unless you have a regulatory requirement that "my key must not sit in the same HSM as another customer's," you don't really need CloudHSM.

## Envelope Encryption: Why Almost Every AWS Service Uses It

KMS's most important operational pattern — and the concept that appears most often on the exam — is **envelope encryption**. The name is simple, but understanding the trade-off hiding behind it is half of the SAA security domain.

The KMS `Encrypt` API accepts at most **4KB** of data at a time. So how do you encrypt a 4MB PDF or a 4TB EBS volume? If the answer were "call the KMS API a million times, 4KB at a time," a single 4TB EBS encryption would run up more than $30,000 in KMS call charges alone, and throughput would hit the KMS API limits (thousands to tens of thousands per second per region), making it practically impossible. AWS solves this with envelope encryption.

```
[ Envelope encryption flow ]

1) The app calls KMS GenerateDataKey(KeyId=CMK, KeySpec=AES_256)
   ← {plaintext DEK (32 bytes), encrypted DEK (~150 bytes)}

2) The app encrypts the 4MB PDF directly with the plaintext DEK using AES-256-GCM
   → ciphertext (4MB)

3) Wipe the plaintext DEK from memory immediately (zero-out)

4) Store ciphertext + encrypted DEK together in S3

Decryption:
1) Read ciphertext + encrypted DEK from S3
2) KMS Decrypt(encrypted DEK) → plaintext DEK
3) Decrypt ciphertext with the plaintext DEK → original 4MB PDF
4) Zero-out the plaintext DEK
```

There are two key insights. First, **the KMS call happens only "once for the key" and the actual data encryption is done by the app directly with a fast symmetric key**. So whether it's 4MB or 4TB, the KMS call happens exactly once. Second, **the plaintext DEK is never stored on disk**. Only the encrypted DEK is stored alongside the data, so even if the entire disk leaks, you can't decrypt it without `kms:Decrypt` permission.

S3, EBS, RDS, and DynamoDB all use this pattern internally. As a user you just say "I'll turn on SSE-KMS" and you're done, but under the hood a DEK is generated per object (or per chunk) and wrapped in an envelope. **S3 Bucket Keys**, released in April 2020, optimizes envelope encryption one step further with the idea: "instead of calling KMS GenerateDataKey per object, reuse the same intermediate key at the bucket level for a short window (about 1 week)." Turning this on can reduce KMS call costs by up to 99% when using SSE-KMS. If you see the keyword "reduce SSE-KMS cost" on the exam, Bucket Keys is the answer.

> 🔍 **Going deeper**: Envelope encryption isn't unique to AWS — it's a generalization of the hybrid encryption that PGP/GPG first popularized in the 1990s. PGP encrypts a message with a random symmetric key and then encrypts that symmetric key with the recipient's RSA public key. It's exactly the same idea; KMS just substitutes the KMS CMK for the RSA public key and the "S3 object" for the "user's email." Google Cloud KMS and Azure Key Vault use the same pattern too.

> ⚠️ **Pitfall**: The most common mistake in envelope encryption is "leaving the plaintext DEK in logs or debug output." To prevent this, the AWS Encryption SDK doesn't expose the plaintext DEK as a raw `ByteArray` — it wraps it in a wrapping object. If you implement envelope encryption by calling the KMS API directly, you always have to be careful about where and how you release the plaintext DEK variable. In Python there's also the problem of it lingering in memory until `gc` reclaims it, so the standard is to explicitly zero it out with the `bytearray` + `[:] = b'\x00' * len(...)` pattern.

## Key Policy + IAM Policy + Grant: The Trap of Three-Tier Evaluation

KMS permission evaluation works with three things acting together — "key policy → IAM policy → grant" — and **unlike every other AWS service, the key policy comes first, and if the key policy doesn't explicitly allow it, an IAM policy alone can never use the key**. This is the most important asymmetry of the KMS security model, and the trap that appears most often on the exam.

In most AWS services, "if the IAM policy allows it, you're OK." S3's default is that the bucket policy and IAM policy work as a union (absent an explicit Deny). But KMS is different. Only when the key policy explicitly says "this Principal may use this key" can an IAM policy then grant additional permissions. If there's nothing in the key policy, even a `kms:Decrypt` in the IAM policy is useless.

```
[ KMS permission evaluation flow ]

Requester: arn:aws:iam::111:role/app-role calls Decrypt

Step 1: Evaluate the Key Policy
   ├─ Does the Principal include app-role, or root, or "AWS:*"?
   │  YES → next step
   │  NO  → DENY (doesn't even check the IAM policy)
   │
   └─ Is there an "Enable IAM permissions" statement?
      ("Principal":"AWS":"arn:aws:iam::111:root", "Action":"kms:*")
      YES → delegation to IAM policy OK

Step 2: Evaluate the IAM Policy (only if Step 1 delegated)
   ├─ Does app-role's IAM policy Allow kms:Decrypt?
   │  YES → next step
   │  NO  → DENY

Step 3: Evaluate Grants (optional)
   ├─ Has an AWS service created a grant?
   │  (e.g., RDS auto-creates a KMS grant during backup)
```

The `"Principal":"AWS":"arn:aws:iam::111:root", "Action":"kms:*"` statement that gets added automatically to the default key policy is precisely the heart of "delegate to the IAM policy." Without this statement, you'd have to enumerate every user directly in the key policy. So if you accidentally omit this statement when creating a key, you end up in a state where the key can't be used no matter how much permission you later grant via IAM policy. Even more dangerous is the case where you "remove even root's permission from the key policy" — this turns the key into a **zombie key whose policy nobody can modify**. It can only be recovered by opening a ticket with AWS Support.

A grant is a "temporary delegation." For example, when RDS creates an automated backup of an encrypted instance, it needs KMS permission. Instead of adding permission to an IAM Role every time, the RDS service creates a grant to temporarily grant permission to itself. A grant works independently of the key policy and stays alive until the creating party explicitly retires it or the key is deleted. A standard security-ops checklist item is to periodically review CloudTrail `CreateGrant` events for "any grant I didn't create."

> 📚 **Case study**: The 2019 Capital One incident isn't directly related to the KMS permission model, but during the incident analysis it was emphasized that "even though the S3 objects were encrypted with SSE-KMS, the data was read as-is because the IAM Role held KMS Decrypt permission." SSE-KMS blocks the "entire disk leaks" scenario but doesn't block the "a legitimate IAM Role is stolen" scenario. So to add security depth you need extra guardrails — putting a `kms:ViaService` condition on the key policy to restrict "this key can only be used via the S3 call path," or allowing only the VPC Endpoint path with `aws:SourceVpce`.

## Key Rotation and the Time Constraints of Key Deletion

Automatic key rotation is often cited as a security best practice, but KMS's rotation model is commonly misunderstood. KMS's automatic rotation **generates new key material but keeps the keyId the same**. That is, even after rotation you can encrypt/decrypt with the same alias or keyId, and data encrypted before rotation is automatically decrypted with the old key material (KMS internally retains all past key material). So rotating does not require you to re-encrypt existing data.

| Key type | Automatic rotation | Interval | Manual rotation |
|---------|----------|------|----------|
| AWS Owned | Automatic | AWS decides | Not possible |
| AWS Managed | Automatic | 1 year | Not possible |
| Customer Managed (Symmetric) | Optional | **1 year, or 90–2,560 days (custom)** | Possible (update the alias) |
| Customer Managed (Asymmetric) | Not possible | - | Update the alias |
| External key (imported) | Not possible | - | Import a new key |

The **90–2,560 day custom rotation interval** is a relatively new feature released in November 2022. Before that it was fixed at 1 year, but it was added because some regulations like PCI DSS require "rotation every 90 days." When you see "automatic rotation interval" in an exam question, "1 year" is usually the answer, but in the latest exams there are also cases where "custom, between 90 days and 2,560 days" is the answer.

There's a reason asymmetric keys can't be rotated automatically. Rotating an asymmetric key means the public key changes, which means every system that used to verify signatures with that public key would have to switch to the new public key simultaneously. That's practically impossible in a distributed system, so KMS doesn't automate asymmetric key rotation and instead recommends the pattern of creating a new key and shifting gradually by just repointing the alias.

Key deletion has a similar safety mechanism. KMS **refuses immediate deletion** and always imposes a **pending deletion window** of 7–30 days. During that period the key is disabled and can't perform any encryption/decryption, but if the operator realizes the mistake, they can recover it with cancel-key-deletion. This safety mechanism didn't exist in the early days after the 2014 launch, and there were several incidents of "accidentally deleting a key and rendering petabytes of data undecryptable" — the feature was added as a result.

> ⚠️ **Pitfall**: For a "I need to block the key immediately" scenario, the answer is not "delete" but **disable**. Disable takes effect immediately and blocks all encryption/decryption, and you can recover later with enable. Deletion runs 7–30 days later, so it can't be the answer to "block immediately." When the exam says "immediately suspend a key suspected of being compromised," disable is the answer.

> 📚 **Case study**: In 2017, an operator at a fintech company thought a key was a "test key" and requested deletion, but it was actually a CMK in use on 30 production EBS volumes. During the 7-day pending window, an alarm fired off the CloudTrail `ScheduleKeyDeletion` event, and they caught it on day 6 and recovered with cancel-key-deletion. After this incident, the company standardized an internal policy of "automatically send a PagerDuty + Slack #security notification whenever a production key deletion is requested." Since all KMS API calls land in CloudTrail, you should catch all risky events like `ScheduleKeyDeletion` / `DisableKey` / `PutKeyPolicy` with an EventBridge rule.

## Multi-Region Keys and Cross-Account / Cross-Region

KMS keys are region-bound by default. A key created in one region can't be used directly in another region. So when designing multi-region DR, a common problem arises: "I replicated an S3 object encrypted in us-east-1 to ap-northeast-2, but I can't read the replica because there's no key to decrypt it."

To solve this, AWS released **Multi-Region Keys** in June 2021. The core idea is to "replicate the same key material to multiple regions but have it appear with the same keyId (prefix `mrk-`) in each region." Data encrypted in us-east-1 can be decrypted with the identical keyId in ap-northeast-2, and the policy can be managed independently in each region. Note that the key material is replicated synchronously, so rotation in one region is automatically applied to the others.

For cross-account use, explicit allows are required on both the key policy and the IAM policy. In the key-owning account, allow the other account's root in the key policy with `"Principal":"AWS":"arn:aws:iam::222:root"`, and in the other account, grant `kms:Decrypt` permission to the IAM Role/User. Only the intersection of the two policies becomes the effective permission.

```
[ Multi-region + cross-account scenario ]

Account A (us-east-1, key owner)
   ├─ Multi-Region CMK (mrk-1234)
   │   Key Policy: allow Decrypt to Account B root
   │
   └─ ap-northeast-2 replica (same keyId mrk-1234)
       Key Policy: ap-northeast-2-specific (managed independently)

Account B (ap-northeast-2, user)
   ├─ IAM Role: allow kms:Decrypt + Resource = mrk-1234
   │
   └─ Decrypt S3 object → KMS endpoint (VPC Endpoint recommended)
                          → callable with the same keyId
```

Using a VPC Endpoint (KMS is an Interface Endpoint) keeps KMS API calls off the internet and entirely on the AWS internal network. It's a must in environments with strict security requirements, and if you add an `aws:SourceVpce` condition to the key policy, you can even enforce "this key can only be used through this VPC Endpoint."

> 💡 **Related theory**: Multi-Region Keys is an asymmetric model of "shared key material + region-specific independent policy." Viewed through the CAP theorem, the key material itself gives up strong consistency and is replicated with eventual consistency (replication lag of tens of seconds to a few minutes). So if you try to decrypt newly created data in another region immediately, you can rarely hit a "key not found" error. AWS recommends handling it with retry + exponential backoff.

## Hands-On with the CLI

```bash
# Create a CMK (symmetric, for encrypt/decrypt)
aws kms create-key \
  --description "saa-app-encryption-key" \
  --key-spec SYMMETRIC_DEFAULT \
  --key-usage ENCRYPT_DECRYPT \
  --tags TagKey=Environment,TagValue=production

# Assign an alias (the key ID is a UUID, unsuitable for operations)
aws kms create-alias \
  --alias-name alias/saa-app \
  --target-key-id 1234abcd-12ab-34cd-56ef-1234567890ab

# Enable automatic rotation (1 year by default)
aws kms enable-key-rotation --key-id alias/saa-app

# Custom rotation interval (90 days)
aws kms enable-key-rotation \
  --key-id alias/saa-app \
  --rotation-period-in-days 90

# Generate a DEK for envelope encryption
aws kms generate-data-key \
  --key-id alias/saa-app \
  --key-spec AES_256
# → Plaintext (base64, 32 bytes) + CiphertextBlob (encrypted DEK)

# Add a kms:ViaService condition to the key policy (usable only from S3)
aws kms put-key-policy --key-id alias/saa-app \
  --policy-name default \
  --policy '{
    "Version":"2012-10-17",
    "Statement":[{
      "Sid":"AllowS3Only",
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::111:role/app-role"},
      "Action":["kms:Decrypt","kms:GenerateDataKey"],
      "Resource":"*",
      "Condition":{"StringEquals":{"kms:ViaService":"s3.ap-northeast-2.amazonaws.com"}}
    }]
  }'

# Disable the key (block use immediately)
aws kms disable-key --key-id alias/saa-app

# Schedule key deletion (7–30 day wait)
aws kms schedule-key-deletion \
  --key-id alias/saa-app \
  --pending-window-in-days 30

# Cancel if you scheduled it by mistake
aws kms cancel-key-deletion --key-id alias/saa-app

# Create a Multi-Region key
aws kms create-key \
  --multi-region \
  --description "mrk for DR" \
  --region us-east-1

# Create a replica in another region
aws kms replicate-key \
  --key-id mrk-1234abcd... \
  --replica-region ap-northeast-2
```

## Wrapping Up

KMS is the root of AWS security, and it holds the largest share of the security domain (30%) on the SAA exam. The core boils down to these five points. ① The 4 key categories are a spectrum of "control vs. operational burden," and to write policies freely you need a CMK. ② Envelope encryption is the standard pattern for efficiently handling large data with "one key call + direct data encryption," and S3 Bucket Keys optimizes it one step further. ③ KMS permissions put the key policy first, and without the "Enable IAM permissions" statement, an IAM policy alone can't use the key. ④ Automatic rotation is 1 year (or 90–2,560 days custom); asymmetric keys can't be rotated automatically. ⑤ Key deletion has a 7–30 day pending window, and if you need to "block immediately," disable is the answer.

In the next article we look at the secret-management services that sit one layer above KMS — Secrets Manager and Parameter Store — and CloudHSM for when a dedicated HSM is required. If KMS is the tool for handling "keys," Secrets Manager is the tool for handling "credentials like passwords and API keys," and its core value is automatic rotation and RDS integration.

---

## 📝 연습 문제

**문제 1.** A company encrypts objects with S3 SSE-KMS, but KMS call costs got too high and exceeded $50,000/month. What is the best way to cut costs the most while maintaining security?

A) Turn off SSE-KMS and switch to SSE-S3
B) Enable S3 Bucket Keys
C) Envelope-encrypt every object directly on the client side
D) Switch to the AWS Managed Key (`aws/s3`)

**정답: B**

해설: S3 Bucket Keys, released in April 2020, reuses the same intermediate key at the bucket level for a short window (about 1 week) instead of calling KMS GenerateDataKey per object. It reduces the number of KMS calls by up to 99%, dramatically lowering cost while preserving the security characteristics of SSE-KMS (per-key policies, CloudTrail auditing, etc.). A is a security downgrade (no permission separation via key policy). C carries a heavy operational burden and doesn't achieve the same effect. D has little security impact but also negligible cost savings.

---

**문제 2.** An IAM Role received `kms:Decrypt` permission via an IAM policy, but the role is not listed in the KMS key policy. The key policy also has no "Enable IAM permissions" statement (root + kms:*). Can this role call Decrypt?

A) Yes. The IAM policy grants the permission
B) No. The key policy comes first, and without an explicit allow, an IAM policy alone isn't enough
C) Yes. KMS evaluates as a union with IAM
D) Yes, but only a warning is logged in CloudTrail

**정답: B**

해설: Unlike other AWS services, KMS puts the key policy first. For an IAM policy to delegate permission, the key policy must either explicitly allow the Principal or contain the "Enable IAM permissions" statement (`"Principal":"AWS":"arn:aws:iam::ACCT:root", "Action":"kms:*"`). With neither present, even a `kms:Decrypt` in the IAM policy is void. This is the biggest asymmetry of the KMS security model and a perennial exam trap. C is the rule that applies to most services other than KMS — KMS is different.

---

**문제 3.** A SecOps team suspects a KMS key has been compromised. They want to block the impact immediately while preserving the key material for later analysis. What is the most appropriate action?

A) `schedule-key-deletion --pending-window-in-days 7`
B) `disable-key`, then run breach analysis and migrate to a new key if needed
C) Remove all Principals from the key policy
D) Request immediate deletion from AWS Support

**정답: B**

해설: Disabling the key (disable-key) takes effect immediately and blocks all encryption/decryption. The key material is preserved inside KMS, so you can later recover it with enable or use it to analyze the scope of the breach. A does disable it for 7 days but ultimately leads to deletion, risking the loss of analysis material. C is possible, but if you mistakenly remove even "root permission" the key becomes a zombie key with an unmodifiable policy, requiring AWS Support intervention. D isn't supported — immediate deletion doesn't exist (minimum 7-day pending).

---

**문제 4.** You encrypt a 4TB EBS volume with KMS. How many times does the KMS API get called?

A) 4TB / 4KB = about 1 billion times
B) A very small number, independent of volume size (envelope encryption)
C) 4TB / 64MB (EBS block) = about 65,536 times
D) Once per read/write

**정답: B**

해설: EBS uses envelope encryption. It fetches a DEK from KMS once at volume creation, and the EBS host encrypts/decrypts data blocks directly with that DEK. KMS calls happen only in limited moments like volume attach. So whether it's 4TB or 40TB, the KMS call cost is nearly identical. A is a calculation that misunderstands the definition of envelope encryption, and C and D likewise assume KMS is called for every block, which it isn't.

---

**문제 5.** A company runs active-active across two regions, us-east-1 and ap-northeast-2. When an S3 object encrypted with SSE-KMS in one region is replicated (CRR) to the other, they want it to be immediately decryptable. What is the most suitable solution?

A) Create a separate CMK in each region and re-encrypt on replication
B) Use Multi-Region Keys to synchronize the same keyId (mrk-) to both sides
C) Call the us-east-1 key directly from ap-northeast-2
D) Enable S3 Bucket Keys

**정답: B**

해설: Multi-Region Keys (released 2021) were designed for exactly this scenario. They replicate the same key material synchronously across multiple regions while exposing it with the same keyId (prefix `mrk-`). An object replicated via CRR is immediately decryptable with the same keyId in the replica region. A works but carries high re-encryption cost and complexity. C fails because KMS keys are region-bound and can't be called directly. D is just a cost-optimization feature, unrelated to the multi-region problem.

---

**문제 6.** A fintech company was required by a compliance audit to "notify SecOps within 5 seconds of every key creation, deletion, and policy-change event." KMS records all APIs in CloudTrail. What is the most suitable automation pattern?

A) CloudTrail → S3 → daily batch analysis
B) CloudTrail → EventBridge rule (CreateKey/ScheduleKeyDeletion/PutKeyPolicy, etc.) → SNS → SecOps
C) Manual CloudWatch Logs Insights queries
D) Config rules only

**정답: B**

해설: CloudTrail events are delivered to EventBridge in near real time, and an EventBridge rule can pattern-match specific KMS API events and dispatch immediately to targets like SNS/Lambda/Slack/PagerDuty. This is the standard pattern that satisfies the "notify within 5 seconds" requirement. A has too much latency, C is manual rather than automated, and D can do state checks but isn't event-driven alerting.

---

**문제 7.** A SaaS company operates a multi-tenant system and was given the requirement: "each customer's data must be encrypted with a customer-dedicated key, so that one IAM Role can never decrypt another customer's data." What is the most suitable design?

A) One common CMK for all customers + separation via IAM policy
B) A separate CMK per customer + key policy allowing only that customer's dedicated IAM Role + enforce customer ID via kms:EncryptionContext
C) S3 SSE-S3 is sufficient
D) A single CloudHSM key + application-level separation

**정답: B**

해설: A per-tenant independent key is the standard pattern for isolating the "blast radius" to the tenant level. If the key policy allows only that tenant's IAM Role, a wrongful call by another tenant's Role is rejected at the key-policy stage. Additionally, forcing the tenant ID into `kms:EncryptionContext` (AAD) creates a double guardrail — even Roles holding the same key fail to decrypt if the context differs. A is a single key, so one mistake in permission separation exposes every tenant. C can't separate keys at all, and D imposes excessive operational burden.

---

해설 보강: KMS is the security service that appears most often on the exam, and in practice every other AWS service's encryption goes through KMS, so if you accurately understand the four things — envelope encryption, key policy evaluation, rotation, and deletion safeguards — half the security domain is handled. The Secrets Manager, Parameter Store, and CloudHSM in the next article all work together with KMS, so if you're fuzzy on the KMS permission model, the entire next topic gets tangled.
