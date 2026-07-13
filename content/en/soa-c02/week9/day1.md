# Day 1 - KMS, Managing Keys Without Ever Seeing Them

Encryption ultimately reduces to key management. AES-256 encryption algorithms are solved since 1990s and never broken. Incidents stem from keys, not algorithms. Hardcoded in code pushed to GitHub, stored plaintext in S3, no tracking who used keys when, departed employee's laptop holding key copies. Overwhelmingly, security breaches are "where did we put the key" problems.

KMS's core design philosophy is simple: **users must never see raw key material.** You can create, rotate, schedule deletion of keys, but no API exists to download plaintext master key bytes. This section follows why this design, how HSM hardware enables it, why Envelope Encryption is necessary, why Key Policy takes precedence over IAM — understanding these decisions.

## A System Where Keys Can't Download — Why KMS Emerged

Early AWS made encryption entirely customer responsibility. Uploading to S3 required client-side encryption; key custody was your problem. The problem: key custody is harder than encryption itself. Where put keys? Environment variables? Every process reading that variable sees keys. Files? Disk images include keys. Encrypt keys with another key? Where put that key? This infinite regress ("turtles all the way down") is key management's essence.

KMS breaks this regress **in hardware.** Top-level master keys exist only inside FIPS 140-2 certified HSM (Hardware Security Module); physically impossible for plaintext to leave HSM. HSM detects key extraction attempts and self-destructs keys via tamper-resistant circuits. Users send "encrypt this data with this key" requests, receive encrypted results. Key bytes never transit networks.

This model's name: **"keys never leave the HSM unencrypted."** Before 2014 KMS launch, this isolation level required buying HSM hardware for datacenter — thousands of dollars per device. KMS made it a $1/month API service. Exam question "why use KMS, encrypt directly?" isn't convenience — **making keys untouchable is security's foundation**.

> 💡 **Related Theory**: KMS's trust model implements "minimize Trusted Computing Base (TCB)" security engineering principle. TCB is component set responsible for system security; smaller TCB means easier verification and narrower attack surface. KMS reduces TCB to HSM hardware + internal firmware. Even if OS, application code, network stacks all compromised, master keys never leave HSM — TCB intact. Orange Book (TCSEC) established this 1980s concept, foundational to modern cloud KMS.

> 🔍 **Deeper Dive**: KMS HSM doesn't store master keys plaintext on disk. All master keys stay encrypted with domain key (KMS-operated) in durable storage, decrypted only in HSM memory at use time. Domain key itself accessible only via quorum method across multiple HSMs, so stealing one HSM can't recover master keys. AWS validated this design via public whitepaper (KMS Cryptographic Details), proving mathematically plaintext keys never cross HSM boundary from creation through destruction.

## Envelope Encryption — Why KMS Handles Only 4KB

Maximum data KMS directly encrypts is 4KB. Send 1GB file to KMS for encryption, you get error. Initially seems like constraint, actually **intentional design** with Envelope Encryption solution.

Why 4KB limit? First, large data sent to KMS slows per-size round-trip — sending 1GB via KMS API nonsensical. Second, processing all bytes through HSM makes HSM throughput bottleneck. Third, most importantly, **encrypting large data directly with master key exposes same key to excessive ciphertexts, broadening cryptanalysis attack surface.**

Envelope Encryption solves this two-stage: large data encrypts quickly locally with one-time **Data Encryption Key (DEK)**, then encrypt only short DEK with master key, store together with data. Letter in envelope, sealed with master key.

```
GenerateDataKey(KeyId) call
   → KMS creates one DEK, returns two forms:
       Plaintext DEK  (memory-only, destroy after encryption)
       Encrypted DEK  (master-key encrypted, store with data)

Encrypt: Plaintext DEK locally AES-256 encrypt 1GB data → destroy DEK in memory
Store:   (Encrypted data, Encrypted DEK) bundle together
Decrypt: Send Encrypted DEK to KMS Decrypt → recover Plaintext DEK → local decryption
```

Core: **destroy Plaintext DEK from memory after use.** Disk holds only encrypted data and encrypted DEK; together, unrecoverable without master key. S3 SSE-KMS, EBS encryption, RDS encryption all internally use this pattern. EBS creates separate DEK per volume, encrypts with assigned KMS key, attaches to volume metadata.

> 💡 **Related Theory**: Envelope Encryption isn't new invention — PGP (Pretty Good Privacy, 1991) established hybrid encryption 30 years ago. PGP encrypts messages with fast symmetric key (session key), encrypts only that session key with slow recipient public key (RSA), sends together. Symmetric fast but hard to exchange; asymmetric easy to exchange but slow — hybrid combines both strengths. KMS's master key isn't asymmetric but hierarchical "slow secure top key + fast bottom data key" identical. TLS session key negotiation follows same principle.

> ⚠️ **Trap**: `GenerateDataKey` gives both Plaintext and Encrypted DEK, but `GenerateDataKeyWithoutPlaintext` gives only Encrypted DEK. Latter for "not encrypting now, pre-generate DEK for later decryption" patterns (e.g., daily key pre-generation). Exam: "generate DEK without plaintext" → `WithoutPlaintext` version. Common mistake: storing Plaintext DEK to disk — that moment, all Envelope Encryption security collapses. Plaintext DEK lives in memory only.

## Key Policy Takes Precedence over IAM — Two Lambda Bots Deadlock

KMS has unique permission rule absent from other AWS services: **every KMS key must have Key Policy, and unless explicitly allowed by Key Policy, IAM permissions however broad can't use that key.** S3 buckets work with IAM alone without bucket policy; KMS differs. Why?

Reason: **contain key compromise blast radius.** If KMS used IAM-only, someone stealing `kms:*` permission admin role instantly uses all account keys. Mandating Key Policy, each key specifies its usable subjects on itself — key owns defense line. Security's most sensitive assets (keys) enforce resource-based policy, preventing all keys compromise from single IAM break.

Default Key Policy's key line achieves this:

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

`root` means **"entire account"** not root user. This line permits "if this account's IAM policy allows it, use key" — normal IAM permission management works. Remove this line, IAM becomes powerless; only Key Policy subjects can use key. Most dreaded ops accident: accidentally remove default Key Policy's root line without specifying yourself — **that key becomes unusable by anyone, recoverable only via AWS Support ticket.** Operator locks their own key out.

> 🔍 **Deeper Dive**: KMS permission evaluation proceeds Key Policy → IAM Policy → Grant → Encryption Context. Precisely, "does Key Policy trust IAM?" determines first, delegated then either IAM/Grant permission allows passes. Any explicit Deny at any stage immediately rejects — "explicit deny wins" principle common across IAM. Grant provides temporary permissions without modifying Key Policy, useful for automation — AWS services (EBS, RDS) internally issue Grants when using keys on user behalf. Creating encrypted EBS volume automatically attaches Grant to key, visible via `list-grants`.

> 📚 **Case Study**: 2017, SaaS company managing KMS key policies via IaC (Terraform) omitted root delegation line in template, deployed to production, locked key. RDS and S3 data encrypted with that key became temporarily inaccessible; AWS Support took hours recovering key policy. Two lessons: always explicitly specify key management subject (usually security team role) separate from root delegation; require explicit approval step in IaC for key deletion/policy changes. That company later gated key policy changes with SCP (Service Control Policy).

## Key Rotation — backing key changes, Key ID stays

Key rotation initially seems counterintuitive. "Rotate key, decrypt old data how?" Change keys yearly but old data reads fine. Secret: KMS keys are **containers holding multiple backing keys (actual crypto material).**

Enable `enable-key-rotation`, KMS generates new backing key yearly (currently default 365 days, adjustable 90~2560 days via configuration). But **Key ID and ARN, alias stay unchanged.** Newly encrypted data uses latest backing key; past encrypted data uses backing key ID recorded with that data, decrypted with that time's old backing key. KMS permanently retains all backing keys so past data always reads. User sees one key unchanged; inside, material quietly refreshes.

This design's advantage: **applications never worry about rotation.** Code calls `alias/myapp` only; doesn't matter if internal backing keys multiply. Manual rotation (create new key, move alias) requires old key staying active to decrypt old data — management burden. Symmetric keys thus default automatic rotation; manual rotation only for asymmetric or imported key material impossible to auto-rotate.

| Key Type | Auto-Rotation | Rotation Period | Notes |
|---------|-----------|-----------|------|
| Customer Managed (Symmetric) | Optional (toggle) | Default 365d, adjustable 90~2560d | backing keys accumulate, Key ID immutable |
| AWS Managed | Forced (can't disable) | 365d (older 1095d) | user uncontrolled |
| Imported (BYOK) | Impossible | - | manual re-import only, expiry settable |
| Asymmetric | Impossible | - | manual rotation only |

> ⚠️ **Trap**: Auto-rotation changes only encryption backing key. If **key permissions compromised or key suspected damaged, rotation doesn't solve it.** Rotation just replaces crypto material, old backing keys permanently kept so old data stays decryptable. Real damage requires disabling key and re-encrypting data with new key. Exam trap: "key seems compromised, rotate?" — No. Rotation prevents future problems, not past ones.

## Multi-Region Key — The Only Exception Breaking Region Isolation

Normal KMS keys strictly region-bound. Data encrypted with Seoul region key absolutely can't decrypt via Tokyo region KMS. Key ARN contains region; backing material exists only in that region's HSMs. Intentional — region isolation underlies AWS availability and compliance; keys crossing regions break isolation.

Cross-Region scenarios make this isolation problematic. Global DynamoDB Table replicates data across regions; A region key-encrypted data needs same key in B region for reading. S3 Cross-Region Replication with SSE-KMS encrypted objects must find decryption keys in destination region.

**Multi-Region Key** creates this exception. Create Primary key, create replicas in other regions, both keys share **same Key ID (precisely `mrk-` prefix shared identifier) and same backing material.** Decrypt data encrypted in one region via another region's replica key unchanged. But exceptional tool — key material crosses regions reducing isolation; one region's compromise affects all replicas. Thus "use only when Cross-Region decryption truly necessary."

> 🔍 **Deeper Dive**: Multi-Region Key backing material replication doesn't transit plaintext networks. Primary region's HSM and replica region's HSM establish mutually authenticated secure channel, transmit key material encrypted, decrypt only inside destination HSM. "Keys never leave HSM unencrypted" principle maintained cross-region replication. Replica keys independently rotate and manage policies post-creation but share backing material identification scheme. Can promote Primary to another region's replica for DR scenarios.

## KMS vs CloudHSM — Multitenant HSM vs Sole HSM Divergence

If KMS runs on HSM, why CloudHSM separately? Difference: **share HSM with other customers or rent entire HSM solo.** KMS's HSM AWS-operated, multiple customer keys (logically isolated) co-housed multitenant. CloudHSM customers solely lease HSM devices, controlling everything inside.

This difference determines certification level. KMS uses FIPS 140-2 Level 3 certified HSM but entire service multitenant-operated, typically described Level 2 context (HSM module itself Level 3); CloudHSM sole-occupied achieves **complete FIPS 140-2 Level 3.** Some regulated industries (specific finance, government contracts) mandate "keys on sole HSM only our access" — KMS can't satisfy, CloudHSM only answer.

| Item | KMS | CloudHSM |
|------|-----|----------|
| HSM Occupation | Multitenant (AWS-operated) | Sole (customer leased) |
| FIPS 140-2 | Module L3, service L2 context | L3 (sole) |
| Key Control | AWS operates, customer policy-controls | Customer 100% (AWS can't access) |
| Cost | $1/month/key + API | $1.45+/hour (continuous) |
| Integration | AWS services native | Standard PKCS#11/JCE/OpenSSL |
| AWS Key Recovery | Impossible (customer locks, Support limit) | Impossible (customer loses, permanent loss) |
| Use Case | Most encryption | Strict regulation, sole control required |

CloudHSM's frightening aspect: **AWS can't recover keys.** Lose CloudHSM cluster admin credentials, keys permanently gone, AWS can't help. Complete control's price is complete responsibility. Bridge connecting both worlds: **KMS Custom Key Store** — enjoy KMS API convenience but backing keys reside in customer CloudHSM cluster, hybrid configuration.

> 💡 **Related Theory**: KMS vs CloudHSM choice exemplifies cloud security's fundamental trade-off: "control vs operational burden." Shared Responsibility Model — higher customer control (CloudHSM) means higher security incident responsibility. KMS delegates key availability, durability, physical security to AWS accepting multitenancy; CloudHSM opposite. "More secure always better" wrong thinking — "does regulation mandate sole HSM, or operational simplicity more valuable?" Most workloads answer KMS correctly; CloudHSM reserve for regulation-forced scenarios.

## Key Deletion Waiting Period — Brake on Irreversible Operations

KMS keys can't delete immediately. Call `schedule-key-deletion`, 7~30 day waiting period sets (default 30d), actual deletion after period passes. During wait, key stays `Pending Deletion` state, disabled rejecting any encryption/decryption. Why enforce this inconvenient delay?

**Key deletion directly means data permanent loss, irreversible operation.** Data encrypted with key can't decrypt without that key ever. Accidentally delete one key, terabytes of S3, RDS, EBS data instantly become digital garbage. If backups encrypted with same key, backups useless too. Different magnitude than file trash deletion.

Waiting period **forcefully brakes this irreversible operation, safety mechanism.** During 7~30 days anyone can `cancel-key-deletion`, rollback during monitoring "Pending Deletion key decryption attempts" with CloudWatch catch "oh, this key still in use" and cancel. Operational best practice: before deleting, first **disable** key, operate days/weeks and if no problems, then schedule deletion — disable immediately reversible, essentially free rehearsal.

> 📚 **Case Study**: KMS's 7~30 day waiting period design learns from industry's many "irreversible delete" incidents. Pre-waiting-period database/storage services enabled "instant permanent delete"; operator typos (`DELETE` wrong target, script variable unset) evaporated production data repeatedly. 2017 code hosting company dropping production DB accidentally with broken backups left "irreversible operations need delay and confirmation stages" lesson industry-wide. KMS embedded this lesson into key deletion — longest safety delay at highest-cost-mistake point.

> ⚠️ **Trap**: Also memorize Encryption Context. Encryption with `--encryption-context "Project=Web"` key-value pairs means **exactly same context required for decryption** or rejected. Works as Additional Authenticated Data (AAD) binding ciphertext to intended context only. E.g., S3 SSE-KMS automatically uses object ARN as context, preventing ciphertext-from-one-object-to-another-location decryption attempts. Exam: "decryption fails, permissions all correct" scenarios' hidden cause often Encryption Context mismatch.

## Summary

All KMS design decisions derive from one principle: "never let people touch keys." No key download API because keys only exist inside HSM; 4KB limit forces Envelope Encryption avoiding large data direct master-key exposure; Key Policy precedes IAM limiting blast radius per-key compromise; 7~30 deletion wait gates irreversible data loss.

Five operator memory points: ① Envelope Encryption — big data local DEK encryption, KMS seals DEK only. ② Key Policy priority — never casually delete default policy's root delegation line. ③ Auto-rotation changes backing key, Key ID immutable, not damage response. ④ Cross-Region decryption only via Multi-Region Key. ⑤ Key deletion 7~30 day wait, rehearse with pre-deletion disable. These five cover most KMS problems.

Next covers KMS's most demanding encryption target — automatically-rotating secrets. Secrets Manager's password rotation 4-step dance and Cross-Region shared secrets.

---

## 📝 Practice Problems

**Problem 1.** Encrypt 1GB log file with KMS, get 4KB limit error. Standard solution?

A) Split file 4KB chunks, encrypt each separately with KMS
B) Envelope Encryption — GenerateDataKey for DEK, locally encrypt file, store encrypted DEK with encrypted data
C) Use CloudHSM instead for direct encryption
D) Bypass with S3 bucket policy

**Answer: B**

Explanation: KMS's 4KB limit is intentional design. Master key encrypting large data causes network bottleneck, HSM throughput limits, expanded cryptanalysis surface. Envelope Encryption uses one-time DEK for large local data fast encryption, seals only short DEK with master key, stores together. Plaintext DEK destroyed from memory after use; disk holds only encrypted data and encrypted DEK. S3 SSE-KMS, EBS, RDS encryption all internally use this pattern.

---

**Problem 2.** IAM user has `kms:*` permission yet specific KMS key use denied. Highest-probability cause?

A) MFA unauthenticated
B) Key Policy doesn't allow account/subject — KMS Key Policy resource-based policy takes precedence over IAM
C) Key in different region
D) API call limit exceeded

**Answer: B**

Explanation: KMS uniquely requires all keys have Key Policy; without explicit Key Policy permission (or IAM delegation), no IAM permission width grants access. Keys' blast radius containment design. Default Key Policy includes `Principal: arn:aws:iam::account:root` line "delegate to this account's IAM" — without this, IAM powerless. Accidentally deleting root delegation without specifying yourself locks key, AWS Support-only recovery.

---

**Problem 3.** Security team: "Key seems compromised, enable auto-rotation?" Correct judgment?

A) Yes, enable auto-rotation immediately invalidates compromised key
B) Auto-rotation adds new backing key only, doesn't discard old, not damage response — disable key then re-encrypt data with new key
C) Just delete key immediately
D) Switch to Multi-Region Key

**Answer: B**

Explanation: Auto-rotation is preventive, not remedial. Rotation changes encryption backing key, but past data decryption requires permanent old backing key preservation, so old-key decryption ability remains. Real compromise requires disable key then completely re-encrypt all that key's data with new key. Immediate deletion (C) enforces 7~30 day wait and permanent data loss risk — inappropriate.

---

**Problem 4.** Global DynamoDB Table across Seoul and Tokyo, decrypt same KMS key both regions. What key type?

A) General Customer Managed Key separately per region
B) Multi-Region Key — Primary with replicas share same ID, backing material, Cross-Region decryption possible
C) AWS Managed Key
D) CloudHSM sole cluster

**Answer: B**

Explanation: General KMS keys region-bound; one region's encryption can't decrypt via another region's key. Key ARN contains region; backing material exists only that region's HSMs. Multi-Region Key exception: Primary and replica keys share same identifier (`mrk-`) and backing material enabling Cross-Region decryption. Backing material replication via encrypted HSM-to-HSM channel preserving plaintext never leaves HSM principle. Global Table, S3 CRR (SSE-KMS), multi-region backup typical use cases.

---

**Problem 5.** Finance regulation mandates "keys on sole HSM only our access, AWS can't access." Which service?

A) KMS Customer Managed Key + auto-rotation
B) KMS Multi-Region Key
C) CloudHSM — sole-leased HSM, FIPS 140-2 Level 3, AWS can't access
D) Secrets Manager

**Answer: C**

Explanation: KMS's HSM multitenant (multiple customers shared) structure can't satisfy "sole HSM" requirement. CloudHSM customers lease entire HSM device controlling 100%, fully satisfies FIPS 140-2 Level 3, AWS can't access keys. Trade-off: lose admin credentials, AWS can't recover keys, permanent loss — complete control means complete responsibility. For KMS convenience + CloudHSM control, use KMS Custom Key Store.

---
