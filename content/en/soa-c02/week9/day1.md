# Day 1 - KMS: How to Manage Keys Without Ever Seeing Them

Encryption ultimately comes down to a key management problem. The algorithm for encrypting data with AES-256 was a finished story back in the 1990s, and it has never been broken. Incidents come not from the algorithm but from the keys. A key gets hardcoded and pushed to GitHub, a key gets uploaded to S3 in plaintext, nobody can trace who used a key and when, a copy of a key remains on the laptop of an employee who left. The overwhelming majority of security incidents are a question of "where did you put the key?"

KMS's core design philosophy is simple. **Never let users see the key material.** You can create keys, rotate them, and schedule them for deletion, but there is no API for downloading the plaintext master key bytes. This post follows the reasons behind these decisions: why it was designed this way, how a physical device called an HSM guarantees it, why Envelope Encryption is needed, and why the Key Policy takes precedence over IAM.

## A System Where Keys Can't Be Downloaded: Why KMS Appeared

In the early days of AWS, encryption was entirely the customer's responsibility. To upload data to S3, you had to encrypt it on the client yourself and store the key on your own. The problem is that storing the key is much harder than the encryption itself. Where do you put the key? In an environment variable? Then every process that can read that variable sees the key. In a file? Then taking a disk image carries the key along with it. Encrypt the key with another key? Then where do you put that key? This infinite regress (turtles all the way down) is the fundamental difficulty of key management.

KMS **cuts this regress in hardware.** The top-level master key exists only inside an HSM (Hardware Security Module) certified to FIPS 140-2, and it is physically impossible for it to leave the HSM in plaintext. The HSM has tamper-resistant circuitry that destroys the key by itself if it detects an attempt to extract it externally. The user only sends a request, "encrypt this data with this key," and receives only the encrypted result. The key bytes themselves never travel over the network.

The name of this model is **"keys never leave the HSM unencrypted."** Before KMS launched in 2014, this level of key isolation was possible only by buying HSM equipment yourself and installing it in a data center, and a single unit cost tens of thousands of dollars. KMS turned it into an API service at $1 a month. The answer on the exam to "why use KMS, why not just encrypt directly?" is not mere convenience: **making the key impossible for people to touch is itself the core of security.**

KMS's trust model is an implementation of the security engineering principle of "minimize the Trusted Computing Base (TCB)." The TCB is the set of components responsible for a system's security, and the smaller it is, the easier it is to verify and audit and the narrower the attack surface. KMS shrinks the TCB to the HSM hardware plus the firmware inside it. Even if the operating system, application code, and network stack are all compromised, the master key does not leave the HSM, so the TCB is not broken. This concept, established in the 1980s Orange Book (TCSEC), is the foundation of modern cloud KMS.

The KMS HSM does not store master keys on disk in plaintext. Every master key is encrypted with a domain key operated by KMS and kept in durable storage, and is decrypted in HSM memory only at the moment of use. The domain key itself is accessible only through a quorum spread across multiple HSMs, so stealing a single HSM can't restore the master key. AWS had this design validated in a public whitepaper (KMS Cryptographic Details), which shows mathematically that from the moment a key is created until it is destroyed, there is never a single moment when it crosses the HSM boundary in plaintext.

## Envelope Encryption: Why KMS Handles Only 4 KB

The maximum data you can encrypt directly with KMS is 4 KB. If you try to send a 1 GB file to KMS for encryption, you get an error. At first this looks like a limitation, but in fact it is **intentional design**, and the solution is Envelope Encryption.

Why limit it to 4 KB? First, sending large data to KMS makes the network round trip slower in proportion to the data size: round-tripping 1 GB through the KMS API makes no sense. Second, doing so would force every byte through the HSM, making the HSM a throughput bottleneck. Third, and most importantly, **directly encrypting a large amount of data with a master key exposes the same key to too many ciphertexts, widening the attack surface for cryptanalysis.**

Envelope Encryption solves this problem in two steps. Large data is encrypted quickly and locally with a one-time **Data Encryption Key (DEK)**, and only that short DEK is encrypted with the master key and stored alongside the data. The picture is putting a letter (the data) in an envelope and sealing the envelope with the master key.

```
Call GenerateDataKey(KeyId)
   → KMS creates one DEK and returns it in two forms:
       Plaintext DEK  (in memory only, discarded immediately after use for encryption)
       Encrypted DEK  (encrypted with the master key, stored together with the data)

Encrypt: Encrypt 1 GB of data locally with AES-256 using the Plaintext DEK → destroy the DEK in memory
Store:   Store (encrypted data, Encrypted DEK) as one bundle
Decrypt: Send the Encrypted DEK to KMS Decrypt → recover the Plaintext DEK → decrypt locally
```

The key point is that **the Plaintext DEK is erased from memory right after use.** All that remains on disk is the encrypted data and the encrypted DEK, and even combining the two, you can't decrypt without the master key. S3 SSE-KMS, EBS encryption, and RDS encryption all use this pattern internally. EBS creates a separate DEK for each volume, encrypts that DEK with the designated KMS key, and attaches it to the volume metadata.

Envelope Encryption is not a new invention but the hybrid encryption pattern that PGP (Pretty Good Privacy, 1991) established 30 years ago. PGP encrypts the message with a fast symmetric key (a session key) and encrypts only that session key with the recipient's slow public key (RSA), sending them together. Symmetric keys are fast but key exchange is hard, and asymmetric keys make key exchange easy but are slow; the essence of hybrid encryption is taking only the strengths of both. KMS's master key is not asymmetric, but the hierarchical structure of "a slow, secure upper key + a fast lower data key" is the same. TLS session key negotiation follows the same principle.

> ⚠️ **Pitfall**: `GenerateDataKey` gives you both the Plaintext and Encrypted DEK, but `GenerateDataKeyWithoutPlaintext` gives only the Encrypted DEK. The latter is used for the pattern of "not encrypting right now, but creating in advance a DEK to use when decrypting later" (for example, pre-generating daily keys). When the exam describes "create a DEK but don't receive the plaintext," it's the `WithoutPlaintext` version. Another common mistake is saving the Plaintext DEK to disk: at that moment all the security of Envelope Encryption collapses. The Plaintext DEK must live only in memory.

## Why the Key Policy Takes Precedence Over IAM: The Deadlock of Two Lambda Bots

KMS has a unique permission rule that other AWS services lack. **Every KMS key must have a Key Policy, and unless the Key Policy explicitly allows it, you cannot use that key no matter how broad your IAM permissions are.** An S3 bucket can be accessed with IAM alone even without a bucket policy, but KMS is different. Why was it designed this way?

The reason is **to limit the blast radius if a key is stolen**. If KMS could be accessed with IAM alone, the moment someone stole an administrator role with `kms:*` permissions they could use every key in the account. By enforcing a Key Policy, each key states on the key itself which principals can use it: the key has its own line of defense. For the most security-sensitive asset (the key), a policy attached to the resource itself (a resource-based policy) is mandatory, so that even if IAM is breached in one place, all keys are not exposed at once.

One line in the default Key Policy creates this structure.

```json
{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::123456789012:root" },
  "Action": "kms:*",
  "Resource": "*"
}
```

`root` does not mean the root user but **"this entire account."** With this one line, it becomes "if this account's IAM policy allows it, you can use the key," so you can manage permissions with IAM as usual. If you remove this line, IAM becomes powerless and only the principals named in the Key Policy can use the key. This is the scariest of the operational accidents: if you accidentally delete the root line from the default Key Policy and don't name yourself either, **no one can use that key and the only way to undo it is an AWS Support ticket.** This is because the operator who locked the key also loses permissions on the key itself.

KMS permission evaluation is reviewed cumulatively in the order Key Policy → IAM Policy → Grant → Encryption Context. More precisely, "did the Key Policy delegate trust to IAM?" is decided first, and if delegated, passing requires just one of IAM/Grant to allow it. However, an explicit Deny at any stage is rejected immediately: this is the "explicit deny wins" principle common to all of IAM. A Grant is a device for giving temporary permissions without modifying the Key Policy, so it is useful for automation, and when AWS services (EBS, RDS, and so on) use a key on a user's behalf, they internally issue a Grant. That is why, when you create an encrypted EBS volume, you can see with `list-grants` that a Grant is automatically attached to the key.

Suppose a SaaS company manages its KMS key policy with IaC (Terraform), deploys a template with the root delegation line missing, and locks its production key. The RDS and S3 data encrypted with that key becomes inaccessible, and the company needs AWS Support's help to restore the key policy. This hypothetical case has two lessons. First, always name in the Key Policy the principal that will manage the key (usually the security team role), separately from the root delegation. Second, place an explicit human approval step even in IaC for KMS key deletion and policy changes. To prevent a recurrence, you can put a guardrail on Key Policy changes with an SCP (Service Control Policy).

## Key Rotation: The Backing Key Changes but the Key ID Stays the Same

Key rotation has a counterintuitive part the first time you meet it. "If you rotate the key, how do you decrypt the old data?" You change the key every year, yet data encrypted last year can still be read. The secret is that a KMS key is actually **a container holding multiple backing keys (the actual cryptographic material)**.

When you turn on `enable-key-rotation`, KMS creates a new backing key every year (currently 365 days by default, adjustable from 90 to 2,560 days by setting). But **the Key ID, ARN, and alias stay the same.** Newly encrypted data is processed with the latest backing key, and data encrypted in the past is decrypted with the old backing key from that time, by looking at the backing key identifier recorded with the data. KMS keeps all backing keys permanently, so past data can always be read. From the user's perspective, the one key stays as is while only the material inside is quietly renewed.

The advantage of this design is that **the application doesn't need to care about rotation at all.** The code just calls `alias/myapp`, and it doesn't matter how many backing keys grow inside. In contrast, with manual rotation (creating a new key and moving the alias), the moment you move the alias, you have to keep the old key explicitly alive to decrypt data encrypted with it, which is a heavy management burden. That is why automatic rotation is the standard for symmetric keys, and manual rotation is used only where automatic rotation is impossible, such as asymmetric keys or imported key material.

| Key type | Automatic rotation | Rotation period | Notes |
|---------|-----------|-----------|------|
| Customer Managed (symmetric) | Optional (on/off) | 365 days by default, adjustable 90-2,560 days | Backing keys accumulate, Key ID unchanged |
| AWS Managed | Forced (can't be turned off) | 365 days (1,095 days for older ones) | Not user-controllable |
| Imported (BYOK) | Not possible | - | Manual re-import only, expiration date can be set |
| Asymmetric | Not possible | - | Manual rotation only |

> ⚠️ **Pitfall**: Automatic rotation changes only the backing key used for encryption. **In a situation where the key's permissions (the Key Policy) have leaked or you suspect the key is compromised, rotation is not the solution.** Rotation merely swaps the cryptographic material for a new one and doesn't discard the old backing keys, so the ability to decrypt old data remains. In a real compromise you must disable the key and re-encrypt the data with a new key. On the exam, "the key seems to have leaked, will rotating fix it?" is a trap: rotation is preventive, not a post-incident response.

## Multi-Region Key: The Only Exception That Breaks Regional Binding

Ordinary KMS keys are strictly bound to a Region. Data encrypted with a key created in the Seoul Region can never be decrypted by KMS in the Tokyo Region. This is because the Region is embedded in the key ARN, and the key's backing material exists only in that Region's HSM. This is intentional: Regional isolation is the foundation of AWS availability and regulatory compliance, and if keys crossed Regions that isolation would break.

But in cross-Region scenarios, this isolation becomes an obstacle. A Global DynamoDB Table replicates data across several Regions, and to read data encrypted with Region A's key in Region B, the same key is needed in Region B too. When S3 Cross-Region Replication replicates SSE-KMS-encrypted objects to another Region, there must be a key to decrypt them in the destination Region.

**Multi-Region Key** creates this exception. When you create a primary key and create a replica in another Region, the two keys share **the same Key ID (more precisely, a common key identifier starting with `mrk-`) and the same backing material**. Data encrypted in one Region can be decrypted as is with the replica key in another Region. However, this is strictly an exceptional tool: because key material is replicated across Regions, isolation weakens, and if the key is compromised in one Region, all replicas are affected. That is why it is recommended to use it "only when cross-Region decryption is truly needed."

The replication of a Multi-Region Key's backing material does not travel over the network in plaintext. The primary Region's HSM and the replica Region's HSM establish an authenticated secure channel with each other, transmit the key material in encrypted form, and decrypt it only inside the destination HSM. That is, the principle "keys never leave the HSM unencrypted" is maintained even in cross-Region replication. After it is created, a replica key is rotated and policy-managed independently, but it shares the backing material identification scheme. You can also promote the primary to a replica in another Region, which is used in DR scenarios.

## KMS vs CloudHSM: The Fork Between Multi-Tenant HSM and Dedicated HSM

If KMS also runs on HSMs in the end, why does CloudHSM exist separately? The difference is **whether you share the HSM with other customers or rent it whole.** KMS's HSMs are operated by AWS and are a multi-tenant structure that holds multiple customers' keys together (logically isolated). With CloudHSM, the customer rents the HSM device itself exclusively and directly controls everything inside it.

This difference splits the certification level. KMS uses HSMs validated at FIPS 140-2 Level 3, but as a whole service, because of the multi-tenant operating model, it is usually described in a Level 2 context (the HSM module itself is Level 3), while CloudHSM, being exclusively occupied by the customer, **fully meets FIPS 140-2 Level 3**. Some regulated industries (certain financial and government contracts) explicitly require "the key must be in a dedicated HSM that only we can access," and in that case KMS can't satisfy compliance and CloudHSM is the only answer.

| Item | KMS | CloudHSM |
|------|-----|----------|
| HSM occupancy | Multi-tenant (AWS-operated) | Dedicated (customer-rented) |
| FIPS 140-2 | Module L3, service context L2 | L3 (dedicated) |
| Key control | AWS operates, customer controls policy | Customer 100% (even AWS can't access) |
| Cost | $1/month/key + API | $1.45+ per hour (always billed) |
| Integration | Native to AWS services | Standard PKCS#11/JCE/OpenSSL |
| AWS key recovery | Not possible (within Support limits if the customer locks it) | Not possible (permanent loss if the customer loses it) |
| Use cases | Most encryption | Strict regulation, requirement for dedicated control |

The scary thing about CloudHSM is that **even AWS can't recover the key.** If you lose the administrator credentials of a CloudHSM cluster, the keys inside are permanently gone and AWS can't help either. The price of complete control is complete responsibility. The bridge connecting the two worlds is the **KMS Custom Key Store**, a hybrid configuration that uses the convenience of the KMS API as is, but keeps the actual backing keys in the customer's CloudHSM cluster.

The choice between KMS and CloudHSM is the classic case of the fundamental cloud security trade-off, "control vs operational burden." In the Shared Responsibility Model, the more control the customer takes (CloudHSM), the more responsibility for security incidents also lands on the customer. KMS delegates key availability, durability, and physical security to AWS in exchange for accepting multi-tenancy, and CloudHSM is the opposite. The question isn't "safer is unconditionally better" but "does regulation mandate a dedicated HSM, or is operational simplicity more valuable?" For most workloads KMS is the answer, and CloudHSM is a card you pull out only when regulation compels it.

## Key Deletion Waiting Period: A Design That Puts a Brake on an Irreversible Operation

A KMS key can't be deleted immediately. When you call `schedule-key-deletion`, a waiting period of 7 to 30 days (30 days by default) is set, and it is actually deleted only after that period passes. While waiting, the key is disabled in the `Pending Deletion` state and rejects any encryption or decryption. Why enforce such an inconvenient delay?

The reason is that **key deletion is an irreversible operation that leads directly to permanent data loss.** Data encrypted with a key can never be decrypted without that key. If you delete a key by mistake, terabytes of S3, RDS, and EBS data encrypted with it turn into digital garbage in an instant. If even the backups are encrypted with the same key, the backups are useless too. This is an accident on a different scale from deleting a file from the recycle bin.

The waiting period is **a safety device that forcibly puts a brake on this irreversible operation.** For 7 to 30 days anyone can undo it with `cancel-key-deletion`, and in the meantime, if you monitor "decryption attempts against a Pending Deletion key" with CloudWatch, you can notice "oh, this key was still in use" and cancel the deletion. The operational best practice is to first **disable** the key before deleting it, run for a few days to weeks, and schedule deletion only if there's no problem: disabling can be undone immediately, so it is effectively a free rehearsal.

KMS's 7-30 day waiting period is a safeguard against "irreversible deletion" incidents. In the days when "immediate permanent deletion" was possible in database and storage services, incidents repeated in which production data evaporated in an instant from an operator's single-line typo (specifying the wrong `DELETE` target, an unset script variable, and so on). The 2017 incident in which a code hosting company accidentally dropped its production DB and found even its backups broken left the industry the lesson that "irreversible operations must have a delay and confirmation step." KMS nailed this lesson into key deletion: it placed the longest safety delay at the point where the most expensive mistake can occur.

You should memorize Encryption Context as well. If you give a key-value pair at encryption time, such as `--encryption-context "Project=Web"`, decryption succeeds **only if you present exactly the same context**. It works as Additional Authenticated Data (AAD), binding the ciphertext so that it can be unlocked only in its intended context. For example, S3 SSE-KMS automatically uses the object ARN as the context, preventing attempts to move one object's ciphertext to another location and decrypt it. In an exam scenario of "decryption fails though the permissions are all correct," the hidden cause is often an Encryption Context mismatch.

## Summary

Every KMS design decision derives from a single principle: "keep people from touching the key." There is no API to download a key because the key exists only inside the HSM; there is a 4 KB limit because Envelope Encryption is enforced to avoid exposing large data directly to the master key; the Key Policy takes precedence over IAM to limit the blast radius so that one breached key doesn't expose everything; and deletion takes 7 to 30 days as a safety device that puts a brake on irreversible data loss.

The five things for an operator to remember are these. ① Envelope Encryption: encrypt large data locally with a DEK, and KMS only seals the DEK. ② Key Policy first: never casually delete the root delegation line of the default policy. ③ Automatic rotation changes only the backing key and leaves the Key ID unchanged; it is not a remedy for compromise. ④ Multi-Region Key is the only path for cross-Region decryption. ⑤ Key deletion has a 7-30 day wait; rehearse by disabling first. These five cover most KMS questions.

In the next post, we cover the trickiest thing KMS encrypts: secrets that have to change automatically. It's the 4-step dance by which Secrets Manager rotates a password with zero downtime, and how to share the same secret across multiple Regions.

---

## 📝 Practice Questions

**Question 1.** You tried to encrypt a 1 GB log file with KMS and got a 4 KB limit error. What is the standard solution?

A) Split the file into 4 KB pieces and encrypt each with KMS
B) Envelope Encryption: receive a DEK with GenerateDataKey, encrypt the file locally, and store the encrypted DEK together with the data
C) Encrypt directly with CloudHSM instead of KMS
D) Work around it with an S3 bucket policy

**Answer: B**

Explanation: KMS's 4 KB limit is intentional design. Directly encrypting large data with a master key causes three problems: a network bottleneck, HSM throughput limits, and an expanded cryptanalysis surface. Envelope Encryption encrypts large data quickly and locally with a one-time DEK and seals only the short DEK with the master key, storing them together. The Plaintext DEK must be discarded from memory right after use, and only the encrypted data and encrypted DEK remain on disk. S3 SSE-KMS, EBS, and RDS encryption all use this pattern internally.

---

**Question 2.** An IAM user was granted `kms:*` permissions, yet use of a particular KMS key is denied. What is the most likely cause?

A) MFA not authenticated
B) The Key Policy doesn't allow that account/principal: KMS is a resource-based policy in which the Key Policy takes precedence over IAM
C) The key is in a different Region
D) API call limit exceeded

**Answer: B**

Explanation: Unlike other services, KMS requires a Key Policy on every key, and unless the Key Policy explicitly allows it (or delegates to IAM), the request is denied no matter how broad the IAM permissions are. This is a design to limit the blast radius even if one key is breached. The default Key Policy has a line with `Principal: arn:aws:iam::account:root` that "delegates to this account's IAM policies," and without this line IAM becomes powerless. If you accidentally delete this root line and don't name yourself either, the key is locked and can be recovered only through AWS Support.

---

**Question 3.** The security team asks, "This key seems to have leaked, so can't we just turn on automatic rotation?" What is the correct judgment?

A) Yes, turning on automatic rotation immediately invalidates the leaked key
B) Automatic rotation only adds a new backing key and doesn't discard the old backing keys, so it is not a compromise remedy: you must disable the key and re-encrypt the data with a new key
C) Instead of rotating, just delete the key immediately
D) Switching to a Multi-Region Key fixes it

**Answer: B**

Explanation: Automatic rotation is a preventive device, not a post-incident response. Rotation swaps the backing key used for encryption for a new one, but it keeps the old backing keys permanently to decrypt past data, so the ability to decrypt data with the old key remains. If the key is really compromised, you must disable the key and fully re-encrypt the data encrypted with it under a brand-new key (re-encrypt). Immediate deletion in C is inappropriate because a 7-30 day wait is enforced and there is a risk of permanent data loss.

---

**Question 4.** You operate a Global DynamoDB Table in the Seoul and Tokyo Regions and need to decrypt data on both sides with the same KMS key. What key type is needed?

A) Create an ordinary Customer Managed Key separately in each Region
B) Multi-Region Key: create a primary and place a replica in the other Region, and with the same key identifier and backing material, cross-Region decryption is possible
C) AWS Managed Key
D) A dedicated CloudHSM cluster

**Answer: B**

Explanation: An ordinary KMS key is bound to a Region, so data encrypted in one Region can't be decrypted with a key in another Region. This is because the Region is embedded in the key ARN and the backing material exists only in that Region's HSM. Multi-Region Key is the exception to this isolation: the primary key and replica key share the same key identifier (`mrk-`) and backing material, enabling cross-Region decryption. The replication of backing material also happens over an encrypted channel between HSMs, so no plaintext travels over the network. Global Tables, S3 CRR (SSE-KMS), and Multi-Region backups are representative use cases.

---

**Question 5.** A financial regulatory requirement explicitly states that "the key must be in a dedicated HSM accessible only to the company, and even AWS must not be able to access it." Which service is needed?

A) KMS Customer Managed Key + automatic rotation
B) KMS Multi-Region Key
C) CloudHSM: a customer-exclusive rented HSM, FIPS 140-2 Level 3, and even AWS can't access the keys
D) Secrets Manager

**Answer: C**

Explanation: KMS's HSMs are multi-tenant (shared by multiple customers), so they can't satisfy a "dedicated HSM" requirement. With CloudHSM the customer rents the whole HSM device with 100% control, it fully meets FIPS 140-2 Level 3, and even AWS can't access the keys. However, the price is that if the customer loses the administrator credentials, even AWS can't recover the keys and they are permanently lost: complete control comes with complete responsibility. To combine KMS's convenience with CloudHSM's control, use the KMS Custom Key Store.

---

**Question 6.** An operator wants to delete a KMS key because it's no longer used. What is the safest procedure?

A) Schedule immediate deletion with `schedule-key-deletion` and be done
B) First disable the key and run for a few days to weeks, then schedule deletion after confirming there are no decryption attempts
C) Remove all permissions from the Key Policy
D) Delete only the alias attached to the key

**Answer: B**

Explanation: Key deletion is irreversible, and all data encrypted with that key (including backups) becomes permanently undecryptable. This risk is also why KMS enforces a 7-30 day waiting period. The safe procedure is to first disable the key (immediately reversible), monitor decryption attempts with CloudWatch while running, and, if there is no problem for a while, schedule deletion with `schedule-key-deletion`. Disabling serves as a free rehearsal. Even during the waiting period you can undo it with `cancel-key-deletion`.

---

**Question 7.** Permissions and key state are both normal, yet decryption of a particular ciphertext keeps failing. Besides permissions, what cause should you suspect?

A) Key rotation is in progress, so it's temporarily blocked
B) The Encryption Context used at encryption does not match the context presented at decryption
C) It isn't a Multi-Region Key
D) The DEK has expired

**Answer: B**

Explanation: Encryption Context is a key-value pair passed along at encryption time and works as Additional Authenticated Data (AAD). Decryption succeeds only if you present **exactly the same context**, and if even one character differs, decryption is rejected even with perfect permissions. S3 SSE-KMS automatically uses the object ARN as the context to prevent attempts to move ciphertext to another location and decrypt it. Key rotation (A) doesn't block decryption, since the backing key identifier is recorded with the data and the old key is found automatically. When permissions are right but decryption fails, suspect an Encryption Context mismatch first.

---
