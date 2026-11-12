# Day 5 - Week 5 Synthesis: Integrated Review of Encryption and Key Management Scenarios

This week covered the first pillar of data protection: *encryption and key management*. We studied KMS key types and the dual permission model (Day 1), envelope encryption with data keys and encryption contexts (Day 2), key policies, grants, cross-account use, and ViaService (Day 3), and encryption in transit/at rest plus key rotation (Day 4). Today we tie these into a single decision framework. The exam asks less about isolated facts than *"for this data protection requirement, which key, which permission mechanism, and which encryption location do you choose?"* The core axes are three-dimensional: **key control level × permission mechanism × encryption location (transit/at rest/layer)**.

Before starting the review, let us confirm the one thesis that ran through the entire week. **Encryption itself almost never fails.** Neither AES-256, nor KMS's HSMs, nor TLS 1.3 has been broken to cause an incident. Every failure we saw this week happened, without exception, *around* the encryption: leaving a plaintext data key on disk, putting secrets in the encryption context, deleting the delegation statement from a key policy, configuring only one side in a cross-account setup, failing to delete an unencrypted snapshot, or destroying an old key in haste. That is why SCS data protection questions ask not "what do you encrypt with?" but **"where do the operations and permissions around the encryption break?"**

## The Weekly Map: Four Days in One Picture

```
                          ┌──────────────────────────────┐
                          │      KMS key (CMK)           │  ← Day 1
                          │  · AWS owned / managed / CMK │
                          │  · Symmetric / asymmetric / HMAC │
                          │  · Key material never leaves the HSM │
                          └───────────┬──────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────────┐
        │                             │                              │
   [ Who uses it ]  Day 3       [ How it is used ] Day 2       [ Where it is used ] Day 4
        │                             │                              │
  ┌─────┴──────┐              ┌───────┴────────┐             ┌───────┴────────┐
  │ Key policy (required)│    │ GenerateDataKey│             │ At rest: SSE-KMS │
  │ IAM  (delegated)     │    │  → plaintext DEK │           │      EBS/RDS   │
  │ Grant (temporary)    │    │  → ciphertext DEK│           │ In transit: enforce TLS │
  │ SCP (guardrail)      │    │ Encryption context │         │ Rotation: auto/manual │
  └─────┬──────┘              └───────┬────────┘             └───────┬────────┘
        │                             │                              │
        └────────────┬────────────────┴──────────────┬───────────────┘
                     ▼                               ▼
            [ Narrow it with conditions ]     [ Prove it with logs ]
        ViaService · CallerAccount        CloudTrail (Decrypt/GenerateDataKey/
        EncryptionContext · PrincipalOrgID  CreateGrant/PutKeyPolicy)
        ResourceTag · RequestedRegion       AWS Config · Security Hub
```

The two boxes at the bottom of this picture are the substance of this week. The three branches at the top (key type, permission mechanism, encryption location) are *choices*, while the two boxes below (narrowing with conditions and proving with logs) are **common requirements that attach to whatever choice you make**. When you pick the "most appropriate action" on the exam and two options look similar, the one that **narrows the scope with conditions and also proves it with logs** is usually the answer.

## Integrated Decision Matrix: Requirement → Choice

| Requirement/situation | Key choice | Reason |
|-----------------------|------------|--------|
| Edit the key policy, control rotation, share cross-account | customer managed key | AWS managed key policies are fixed |
| An external party without KMS call permissions encrypts | Asymmetric key (public distribution) | Private key stays inside KMS |
| Digital signing/verification | Asymmetric key (SIGN_VERIFY) | Private signing, public verification |
| Encrypt large data | Envelope encryption (GenerateDataKey) | KMS has a 4 KB limit |
| Separate key generation from encryption | GenerateDataKeyWithoutPlaintext | Minimize plaintext key exposure |
| Bind ciphertext to a specific context | Encryption context (AAD) | Integrity + permission conditions |
| Temporary, fine-grained, revocable permission | grant | Prevents policy bloat |
| Use a grant immediately after creating it | Include the grant token | Works around eventual-consistency propagation delay |
| Allow grants only via AWS services | `kms:GrantIsForAWSResource` | CreateGrant is a privilege-escalation path |
| Restrict key use to a specific service | `kms:ViaService` condition | Blocks direct calls |
| Cross-account key use | Key policy allow + IAM in the using account | Both sides are required |
| Share an encrypted snapshot with another account | **Encrypt with a customer managed key** + key policy delegation | AWS managed keys cannot be shared |
| Decrypt the same ciphertext across Regions | Multi-Region key (MRK) | Per-Region keys cannot interoperate on ciphertext |
| Per-Region data sovereignty/isolation requirement | Independent per-Region keys | An MRK's key material exists in multiple Regions |
| Organization-wide key guardrails | SCP + `aws:PrincipalOrgID` | Blocks deletion and external sharing |
| Permission distribution in an environment with hundreds of keys | ABAC (`aws:ResourceTag` matching) | Prevents an explosion of policy documents |
| Enforce S3 transit encryption | `aws:SecureTransport` Deny | Blocks HTTP at the source |
| Force S3 to use only a specific KMS key | Bucket default encryption + `s3:x-amz-server-side-encryption-aws-kms-key-id` condition | Blocks storing with another key |
| Encrypt an existing unencrypted RDS/EBS | Snapshot → encrypted copy → restore | No toggle |
| Regular rotation with no operational burden | Symmetric CMK automatic rotation | Only the key material is renewed transparently |
| Rotate an asymmetric/BYOK key | Manual (new key + alias update) | Automatic rotation is unsupported |
| Fully cut the dependency on the old key | `ReEncrypt` batch | Rotation does not move past data |
| Reduce KMS API cost/throttling | S3 Bucket Key / DEK caching | Fewer calls |
| Per-object KMS audit logs are mandatory | **Turn off** Bucket Key | The context changes to the bucket level |
| Immediately and reversibly neutralize a suspect key | Disable the key | Deletion is irreversible and has a waiting period |
| Permanently destroy only a specific customer's data | Per-customer key + `ScheduleKeyDeletion` | crypto-shredding |
| Minimize certificate private key exposure risk | ACM-issued certificate | The key cannot be extracted |

The basis of this matrix is the principle that *"whoever controls the key controls the data."* Because encryption algorithms are standardized and fixed, almost all the variables in security design lie in *key ownership, access, lifetime, and usage path*. The exam's "best" answer is usually the choice that satisfies the required control level *exactly* while minimizing operational burden and exposure surface.

## Decision Tree: From the Requirement Sentence to the Answer

In the exam room there is no time to skim the matrix. We lay down the path in advance so that two or three branches, driven by the *verbs and constraints* of the sentence, lead to the answer.

```
Read the question
  │
  ├─ Does it say "must change the key policy" / "cross-account" / "must set the rotation period"?
  │    └─ YES → Keep only customer managed key options
  │             (AWS managed / AWS owned key options are eliminated immediately)
  │
  ├─ Is the data larger than 4 KB? / Does it mention "large", "file", "volume"?
  │    └─ YES → Envelope encryption (GenerateDataKey). Options that call Encrypt directly are eliminated
  │
  ├─ Does it mention "a party without KMS call permissions" / "signing and verification"?
  │    └─ YES → Asymmetric key. Options that share a symmetric key are eliminated
  │
  ├─ Does it mention "temporary" · "revocable" · "without modifying the policy"?
  │    └─ YES → grant
  │
  ├─ Is it "block direct calls" · "only through <service>"?
  │    └─ YES → kms:ViaService (+ kms:CallerAccount)
  │
  ├─ Is it "isolate per tenant/context"?
  │    ├─ Logical isolation is enough → single key + encryption context condition
  │    └─ Requires "individual destruction" · "cryptographic isolation" → per-tenant keys
  │
  ├─ Does it mention "enforce" · "ensure" · "without exception"?
  │    └─ YES → Not an option that turns something on, but a Deny policy / SCP / default + Config combination
  │
  ├─ Is it "immediately" + "reversibly"?
  │    ├─ YES → DisableKey
  │    └─ "permanently" · "unrecoverable" → ScheduleKeyDeletion
  │
  └─ Is it "in another Region too"?
       ├─ Decryption is also needed → Multi-Region key
       └─ Region isolation is required → per-Region keys + re-encryption
```

The most frequently used branches in this tree are the first and the seventh from the top. **"Is it a customer managed key?"** and **"is it enforcement or configuration?"** Filtering on these two alone removes two of the four options.

## Integrated Scenarios

> 🎯 **Scenario A — Protecting multi-tenant SaaS data**: "We store large files for many tenants in S3. We must isolate decryption per tenant, manage KMS call cost, audit all key use, and rotate keys regularly." Answer: (1) **SSE-KMS** with a customer managed key (auditing and control), (2) put `tenant=<id>` in the per-object **encryption context** and isolate tenants with a `kms:EncryptionContext:tenant` condition in IAM/key policies, (3) enable the **S3 Bucket Key** to reduce KMS call cost and throttling, (4) use **automatic key rotation** for regular rotation with no operational burden, (5) audit all KMS use with **CloudTrail**. The concepts from this week's four days cooperate in a single design.

> ⚠️ **Trap**: Scenario A hides a quiet conflict. When you turn on the **Bucket Key in (3), the encryption context sent to KMS becomes the bucket ARN rather than the object ARN.** If you designed tenant isolation to depend on the object path in `aws:s3:arn`, that condition breaks the moment you enable the Bucket Key. So the isolation in Scenario A must be anchored in **an explicit `tenant` context, not the path**, and if the question adds the clue "per-object KMS audit logs are a regulatory requirement," the Bucket Key itself becomes the wrong answer. Remember that *cost optimization and audit resolution are two ends of the same axis*.

> 🎯 **Scenario B — Cross-account data sharing + governance**: "The security account owns and manages the KMS key, and workload accounts write data encrypted with that key, but ordinary accounts must not be able to delete the key or change its policy." Answer: (1) in the security account's **key policy**, allow `Decrypt`/`GenerateDataKey` for the workload account roles, plus an **IAM** allowance on the key ARN in the workload account (both sides), (2) restrict to inside the organization with `aws:PrincipalOrgID`, (3) use an **SCP** to Deny `kms:ScheduleKeyDeletion` and `kms:PutKeyPolicy` for ordinary accounts, (4) grant key administration permissions only to the security team's role. Three-layer governance of key policy (fine-grained) + IAM (delegation) + SCP (guardrail).

Moving this design into a single key policy gives the following. You can see the condition keys learned this week each taking on its own role within one document.

```json
{
  "Version": "2012-10-17",
  "Id": "shared-workload-key",
  "Statement": [
    {
      "Sid": "KeyAdministrationBySecurityTeamOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::999988887777:role/SecurityKeyAdmin" },
      "Action": [
        "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*",
        "kms:Put*", "kms:Update*", "kms:Revoke*", "kms:Disable*",
        "kms:ScheduleKeyDeletion", "kms:CancelKeyDeletion"
      ],
      "Resource": "*"
    },
    {
      "Sid": "AllowWorkloadUseWithinOrganizationViaS3Only",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": ["kms:Decrypt", "kms:GenerateDataKey*", "kms:DescribeKey"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-exampleorgid",
          "kms:ViaService": "s3.ap-northeast-2.amazonaws.com"
        }
      }
    },
    {
      "Sid": "AllowServiceCreatedGrantsOnly",
      "Effect": "Allow",
      "Principal": { "AWS": "*" },
      "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-exampleorgid" },
        "Bool": { "kms:GrantIsForAWSResource": "true" }
      }
    },
    {
      "Sid": "DenyAnyUseWithoutTenantContext",
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["kms:Encrypt", "kms:Decrypt", "kms:GenerateDataKey*"],
      "Resource": "*",
      "Condition": {
        "Null": { "kms:EncryptionContext:tenant": "true" }
      }
    }
  ]
}
```

The four statements each play a different role. ① **narrows administrative permissions to one role** (Day 3); ② **doubly confines use by organization boundary + service path** (Day 3); ③ **limits the permission redistribution path to AWS service integrations only** (Day 3); and ④ **forbids the very omission of the context** so tenant isolation cannot be bypassed (Day 2). Note that `Principal: "*"` is used together with conditions. Without the conditions this statement would be public to the whole world, but because `aws:PrincipalOrgID` is attached, the real scope is inside the organization.

> 🎯 **Scenario C — External partner encryption + signing**: "A partner without KMS call permissions must encrypt data and send it to us, and the partner must be able to verify the integrity of documents we issue." Answer: (1) an **asymmetric key (encrypt/decrypt)** for partner encryption — distribute the public key, and only we decrypt with the private key, (2) an **asymmetric key (SIGN_VERIFY)** for document signing — we sign with the private key and the partner verifies with the public key. This is a requirement a symmetric key cannot satisfy.

> 🎯 **Scenario D — DR for encrypted data against a Region failure**: "We replicate encrypted S3 data and a DynamoDB table from the Seoul Region to Tokyo. Even if the entire Seoul Region becomes unavailable, service must continue immediately from Tokyo, and if the recovery procedure includes a re-encryption step we cannot meet the recovery time objective." Answer: (1) create a **Multi-Region key** and place a replica in Tokyo — the Tokyo replica decrypts ciphertext created in Seoul as is. (2) Because the replica's **key policy is not synchronized automatically**, manage the policies of both Regions together with IaC. (3) In S3 cross-Region replication (CRR), specify the destination bucket's encryption key, and give the replication role `Decrypt` on the source key and `GenerateDataKey` on the destination key. (4) Run DR drills that regularly verify that decryption actually works **in Tokyo alone**. Here (4) is the practical core — key policy drift shows no symptoms in normal times and reveals itself only at the moment of failure.

> ⚠️ **Trap**: In Scenario D, do not assume that "because we used a Multi-Region key, cross-Region access happens automatically." An MRK shares only the *key material*; **the key policy, grants, and aliases are independent per Region**. This independence is the classic cause of a workload that ran fine in Seoul returning `AccessDenied` in Tokyo. Conversely, the independence is also an advantage — you can narrow the Tokyo replica so that only the DR role can access it, reducing exposure in normal times.

> 🎯 **Scenario E — A report of suspected key compromise**: "A report comes in that a developer laptop was compromised and that credentials on that laptop may have been used on a production KMS key. The service must keep running." The difficulty of this requirement is that *neutralization* and *availability* collide head-on. Disabling the key blocks things for certain, but the service dies with it. So the order is the answer: **cut off the culprit, keep the key alive.** (1) First invalidate the compromised principal's credentials, (2) revoke the grants attached to that principal with `RevokeGrant`, (3) remove that role's statement from the key policy or narrow its conditions, (4) check for actual traces of use in CloudTrail, and (5) if exposure is confirmed, perform rotation (on-demand rotation for a symmetric key, a new key + alias update for an asymmetric one). `DisableKey` on the key itself is a last resort, used only when "a full block is judged better than a service outage."

## Incident Response Playbook: Commands and Logs

Translating Scenario E into real commands strings together the CLIs we saw this week into one thread.

```bash
# ① Immediately find out who has what permissions on this key
aws kms get-key-policy --key-id alias/prod-data --policy-name default
aws kms list-grants     --key-id alias/prod-data

# ② Forcibly revoke the grant held by the compromised principal (revoke, not retire)
aws kms revoke-grant --key-id alias/prod-data --grant-id 0c237476b39f8bc4...

# ③ Last resort — immediate, reversible full block (only when you accept a service outage)
aws kms disable-key --key-id alias/prod-data
#    If it turns out to be a false positive, you can restore immediately
aws kms enable-key  --key-id alias/prod-data

# ④ Once exposure is confirmed, swap the key material (symmetric CMK)
aws kms rotate-key-on-demand --key-id alias/prod-data
aws kms list-key-rotations   --key-id alias/prod-data
```

And "was it actually used?" can only be answered from CloudTrail. The form used when querying the trail with Athena is as follows.

```sql
-- What did a specific role do with this key over the last 7 days?
SELECT eventtime,
       eventname,
       useridentity.arn                    AS principal,
       sourceipaddress,
       json_extract_scalar(requestparameters, '$.encryptionContext.tenant') AS tenant
FROM   cloudtrail_logs
WHERE  eventsource = 'kms.amazonaws.com'
  AND  eventname IN ('Decrypt','GenerateDataKey','GenerateDataKeyWithoutPlaintext','CreateGrant')
  AND  useridentity.arn LIKE '%role/SuspectRole%'
ORDER  BY eventtime DESC;
```

| What you saw in CloudTrail | What it says | Next action |
|----------------------------|--------------|-------------|
| `Decrypt` from a human IP, with `sourceIPAddress` **not** a service domain | A direct KMS call. Not the normal app path | The `kms:ViaService` condition is missing or has been bypassed — check the policy |
| `Decrypt` count tens of times the usual, object paths in the context are sequential | Signs of bulk exfiltration | Invalidate credentials immediately + scope the damage |
| `CreateGrant` where the grantee is an **external account** | An act of sending permissions outside the organization | `RevokeGrant` + enforce `aws:PrincipalOrgID` |
| A new principal's `Decrypt` succeeds right after `PutKeyPolicy` | Privilege escalation by opening the door for itself | Block `PutKeyPolicy` with an SCP + roll back the policy |
| Only `GetKeyPolicy` and `ListGrants` repeatedly | Reconnaissance of the permission structure | Not yet used — a chance to block preemptively |
| Many `Decrypt` failures (`KMSInvalidStateException`) | Still referencing a key that is pending deletion or disabled | Decide whether to cancel deletion, identify dependent workloads |
| Events on the target key are **0** for months | An unused key | A cleanup candidate. But always check for quarterly/annual batches |

The craft of practice lies in the last two rows forming a pair. The judgment "there are zero events, so it is safe to delete" holds *only when the observation period is long enough*. That is because there are **workloads whose call cycle is longer than the observation window**, such as quarter-end closing batches, year-end settlement jobs, and long-term archive restores. So the standard procedure for key cleanup is "① check at least one year of CloudTrail → ② disable first with `DisableKey` → ③ observe for several weeks that no `KMSInvalidStateException` occurs → ④ only then `ScheduleKeyDeletion`." **Using disable as a rehearsal before deletion** — making a reversible action the safety device for an irreversible one — is a general principle that applies outside KMS as well.

## Condition Keys Summary

The condition keys that appeared this week are themselves part of the exam scope. Grouping each by *what it narrows* keeps them from getting confused.

| Condition key | What it narrows | Typical use |
|---------------|-----------------|-------------|
| `kms:ViaService` | **Path** — through which service it came | Block direct calls, S3/EBS-only keys |
| `kms:CallerAccount` | **The principal's account** | Paired with ViaService to block other accounts' services |
| `kms:EncryptionContext:<key>` | **Context** — with what context it was called | Tenant/object-level isolation |
| `kms:GrantIsForAWSResource` | **Origin of the grant** — whether a service created it | Block `CreateGrant` privilege escalation |
| `kms:GrantOperations` | The set of operations a grant allows | Allow only "a grant containing only Decrypt" |
| `aws:PrincipalOrgID` | **Organization boundary** | Limit cross-account sharing to inside the organization |
| `aws:PrincipalARN` | A specific role/user | Exempt only the admin role in an SCP |
| `aws:RequestedRegion` | **Region** | Block key creation outside approved Regions |
| `aws:ResourceTag/<tag>` | **Tag** | ABAC — the policy stays the same as keys grow |
| `aws:SecureTransport` | **Transport layer** — whether it is TLS | Block S3/EFS plaintext access |
| `s3:x-amz-server-side-encryption` | The encryption-at-rest **method** | Reject storage that is not SSE-KMS |
| `s3:x-amz-server-side-encryption-aws-kms-key-id` | The **key** used for storage | Reject use of any key other than the approved one |

*Applying* a condition key is different from *enforcing the existence* of a condition key. If you place only a value condition on `kms:EncryptionContext:tenant`, a call that supplies no context at all never has that condition evaluated and can pass through another statement. That is why the value condition (`StringEquals`) and the omission ban (a Deny with `Null: true`) must be used **as a pair** for isolation to be complete. This "value condition + omission ban" pattern is a way of thinking that recurs throughout SCS.

## Distinctions That Are Often Missed

**Key policy vs IAM vs grant** — The key policy is required, permanent, and resource-based (the primary source of permissions); IAM is identity-based when delegated; a grant is temporary, fine-grained, and programmatic. For cross-account use, both the key policy and IAM are needed.

**GenerateDataKey vs Encrypt** — Large data uses envelope encryption (`GenerateDataKey` + local encryption); only small secrets of 4 KB or less use `Encrypt` directly.

**The encryption context is not encrypted** — Use it only as AAD for integrity and permission conditions, and do not put secrets in it (it is recorded in plaintext in CloudTrail).

**Encryption at rest vs in transit** — SSE-KMS/EBS/RDS are at rest; enforcing TLS (`aws:SecureTransport`/`force_ssl`/redirect-to-https) is in transit. They are separate and both are needed.

**Automatic vs manual rotation** — Automatic renews only the key material (identifier kept, symmetric CMK) and does not re-encrypt old data. Manual means a new key + alias update (asymmetric, BYOK).

**Rotation vs re-encryption** — Rotation changes the key material for *ciphertext to be created from now on*, and `ReEncrypt` moves *ciphertext that already exists* to a new key. A requirement like "I want to delete the old key" belongs to re-encryption, not rotation.

**revoke vs retire** — `RevokeGrant` is a **forced revocation** by the managing party (incident response), and `RetireGrant` is a **voluntary return** by the grantee/retiring principal (normal termination). The two permissions are given to different principals.

**disable vs deletion** — Disable is immediate and reversible; deletion has a 7 to 30 day wait and is irreversible (crypto-shredding).

**Deleting an alias is not a control** — An alias is only a pointer, so even if you delete it, every operation remains possible through the key ID.

**SSE-S3 vs SSE-KMS** — With SSE-S3, S3 manages the key (no auditing or control); SSE-KMS gives KMS control, CloudTrail auditing, and cross-account use.

**Multi-Region key vs per-Region key** — An MRK shares key material so ciphertext is interoperable across Regions, but the key policy is independent per Region. For data sovereignty requirements, use independent per-Region keys.

**Context isolation vs key isolation** — A context is *logical isolation enforced by policy*, while splitting keys is *cryptographic isolation*. If "individual destruction (crypto-shredding)" is required, you must split the keys.

**Collection of traps**
- Deleting `Enable IAM User Permissions` from the key policy leaves the key orphaned.
- In cross-account use, setting only the key policy or only IAM and missing the other side.
- Trying to share a snapshot encrypted with an AWS managed key to another account (impossible because the policy cannot be fixed).
- Putting secrets in the encryption context, exposing them in plaintext in CloudTrail.
- Applying only a context value condition and omitting the omission ban (`Null` Deny).
- Applying `kms:ViaService` as a Deny on all actions, blocking key management operations too.
- Calling right after creating a grant without a grant token, failing because of eventual consistency.
- Applying `EncryptionContextEquals` to a flow that goes through an AWS service, so everything is rejected because of the context the service appended.
- Trying to "encrypt with a toggle" an existing unencrypted RDS/EBS (going through a snapshot is the answer).
- Not deleting the unencrypted original and intermediate snapshots after conversion, leaving a plaintext copy.
- Misunderstanding that automatic rotation re-encrypts existing data.
- Deleting the old key after manual rotation, making past data permanently unrecoverable.
- Trying to enable automatic rotation on an asymmetric/BYOK key.
- Choosing deletion to neutralize a suspect key immediately (disable is the answer).
- Deleting only the alias and believing the key is blocked.
- Trying to decrypt data encrypted with a single-Region key as is in another Region (a Multi-Region key is needed).
- An MRK replica's key policy diverging from the original, causing AccessDenied only at the moment of failure.
- Encrypting SQS/SNS with a CMK and not granting key permissions to the service principal, so message delivery fails.

## Visibility: Proving Encryption

Data protection must also be *proven*. **CloudTrail** records all KMS APIs (Encrypt/Decrypt/GenerateDataKey/grant changes/key policy changes), **AWS Config** continuously evaluates encryption compliance (`encrypted-volumes`, `s3-bucket-server-side-encryption-enabled`, `rds-storage-encrypted`), and **Security Hub** aggregates encryption non-compliance as findings. Turning on a control is only the start; verifying and auditing the control with data is the body of operational security.

The roles of the three tools do not overlap. You need to be able to state this division of labor precisely to solve "what should be added?" type questions.

| Tool | Question it answers | Tense | Limit |
|------|---------------------|-------|-------|
| **CloudTrail** | "Who used this key, when, and how?" | **Past** (events) | Does not tell you whether the configuration is correct |
| **AWS Config** | "Is this resource following the rule right now?" | **Present** (state) + change history | Does not tell you who the actor was |
| **Security Hub** | "What is out of line across the whole organization?" | Aggregation | Cannot block anything by itself |
| **SCP / key policy** | "Make it impossible in the first place" | **Prevention** | Cannot handle what has already happened |
| **EventBridge** | "Immediately notify of a risky action that just happened" | Real time | Only a notification; blocking is separate |

```
[ The four-stage composition that completes one control — none can replace the others ]

  Prevent (SCP · key policy · Deny)  ─▶  Detect (Config · Security Hub)
          ▲                                      │
          │                                      ▼
   Correct (automated remediation)  ◀─  Respond (EventBridge → Lambda/SNS)

  If an exam question says "it was detected but keeps recurring" → prevention (SCP/policy) is missing
     "the configuration is correct but misuse is not caught"   → detection/response (CloudTrail analysis) is missing
```

The Uber breach disclosed in November 2017 drives the final nail into this week's content. The attacker found AWS credentials in a private GitHub repository used by Uber engineers, used those credentials to access backup data in S3, and took the information of about 57 million riders and drivers. The incident happened in 2016 but was not disclosed for over a year, and once it became known that Uber paid the attacker 100,000 dollars disguised as a bug bounty and that its former chief security officer was later prosecuted, the "cover-up" itself became the bigger problem. Technically the core of this incident is simple — **there was nothing wrong with the encryption; the credentials were the problem.** Even if encryption at rest had been on, it provides no defense against a party holding legitimate credentials. That is why this week's tools are needed: bind use to "only through S3" with `kms:ViaService`, narrow the access scope to the tenant level with encryption context conditions, open permissions only at the moment they are needed with grants, and detect `Decrypt` surges in CloudTrail. And then make sure credentials never sit in a code repository in the first place — that is the topic of next week's Secrets Manager. When you see the sentence "it leaked even though it was encrypted" on the exam, the answer is never *stronger encryption* but *control of credentials and key usage permissions*.

## Keyword → Answer Mapping for the Exam Room

The wording of a question often points almost directly to the answer. If you memorize the mappings below, they become instant answers.

| Expression in the question | What to recall immediately |
|----------------------------|----------------------------|
| "must edit the key policy", "cross-account sharing" | customer managed key |
| "several GB", "large file", "the entire volume" | Envelope encryption / `GenerateDataKey` |
| "an external party without KMS access", "distribute a public key" | Asymmetric key |
| "sign and verify" | Asymmetric key (SIGN_VERIFY) |
| "without modifying the policy", "temporarily", "revocably" | grant |
| "block direct calls", "only through <service>" | `kms:ViaService` |
| "thousands of tenants", "cannot add more keys" | Encryption context isolation |
| "permanently destroy only a specific customer's data", "immutable backup" | Per-customer key + crypto-shredding |
| "without exception", "guarantee", "enforce" | Deny policy / SCP / default + Config |
| "immediately" + "reversibly" | `DisableKey` |
| "permanently unrecoverable" | `ScheduleKeyDeletion` |
| "replace regularly with no operational burden" | Symmetric CMK automatic rotation |
| "replace an asymmetric key" | Manual rotation (new key + alias update) |
| "stop using the old key any longer" | `ReEncrypt` |
| "throttling", "KMS cost spike" | S3 Bucket Key / DEK caching |
| "per-object audit logs are needed" | **Disable** Bucket Key |
| "decrypt in another Region too" | Multi-Region key |
| "data must not leave the Region" | Independent per-Region keys + `aws:RequestedRegion` |
| "without exposing the certificate private key" | ACM |

## Summary

- [ ] If there is a governance requirement (policy, rotation, cross-account), did you choose a customer managed key?
- [ ] Did you choose envelope encryption for large data and an asymmetric key for external encryption/signing?
- [ ] Did you use the encryption context for context binding and permission conditions without putting secrets in it?
- [ ] Did you apply an *omission ban* Deny as a pair with the context value condition?
- [ ] Did you use a grant for temporary, fine-grained permission and `kms:ViaService` to restrict the key use path?
- [ ] Did you narrow the `CreateGrant` permission with `kms:GrantIsForAWSResource`?
- [ ] For cross-account use, did you configure both the key policy and IAM, and did you encrypt any snapshot to be shared with a CMK?
- [ ] For requirements that cross Regions, did you use an MRK while also managing the replica key policy?
- [ ] Did you *enforce* encryption in transit (blocking HTTP) and turn on the encryption-at-rest default?
- [ ] After an encryption conversion, did you destroy the unencrypted original and the intermediate snapshots?
- [ ] Did you configure regular rotation correctly as automatic (symmetric) or manual (asymmetric/BYOK), and avoid deleting the old key in haste?
- [ ] Did you respond to a suspect key with disable (reversible), and did you run a disable rehearsal before deletion?
- [ ] Do you audit all KMS use with CloudTrail and continuously evaluate with Config and Security Hub?

### Closing Thoughts

This week's conclusion compresses into one sentence. **Encryption is not a control but the *precondition* for a control.** The moment you encrypt data, the security question merely shifts from "who can read this data?" to "who can use this key?" It does not disappear. So throughout this week the real subject was not the algorithm but the **ownership, path, lifetime, and evidence of the key**.

From an exam-prep perspective, three things remain. First, the criterion for choosing a key type is *the need for control and auditing*, and if that need is mentioned even slightly, it is a customer managed key. Second, understand permissions in the layers of key policy (primary source) → IAM (delegation) → grant (temporary), with SCP guardrails and condition keys on top — in particular `ViaService`, `EncryptionContext`, and `PrincipalOrgID` are conditions that almost literally translate the requirement sentence in a question. Third, for sentences that demand "enforcement," the answer is a Deny rather than an option; for "immediate and reversible," disable; and for "permanent destruction," scheduled deletion.

Next week continues with the second pillar of data protection — Secrets Manager, certificates, and advanced S3 protection. As the last case today showed, every control this week stands on the assumption that *credentials are managed safely*, and next week is exactly the layer that holds up that assumption.

---

## 📝 Practice Questions

**Question 1.** A multi-tenant SaaS stores large per-tenant files in S3. Which design satisfies per-tenant decryption isolation, KMS cost management, full auditing, and regular rotation?

A) SSE-S3 + a separate KMS key for each object  
B) SSE-KMS (customer managed key) + per-object encryption context `tenant=<id>` with a `kms:EncryptionContext` condition + S3 Bucket Key + automatic rotation + CloudTrail  
C) Clients upload in plaintext and control access with IAM only  
D) All tenants share an AWS managed key  

**Answer: B**  
Explanation: SSE-KMS based on a customer managed key provides auditing, control, and rotation; the tenant condition on the encryption context isolates decryption per tenant; the S3 Bucket Key eases KMS call cost and throttling; automatic rotation provides regular replacement without operational burden; and CloudTrail handles full auditing. SSE-S3 has no auditing or control, plaintext upload gives up encryption at rest, and sharing an AWS managed key makes policy and isolation control impossible.

---

**Question 2.** A security account owns and manages a KMS key and workload accounts use it, but regular accounts must be prevented from deleting the key or changing its policy. What is the most appropriate combination?

A) Configure only the workload accounts' IAM policies  
B) Security account key policy allow + workload account IAM allow (both sides) + restriction with `aws:PrincipalOrgID` + SCP that Denies deletion and policy changes  
C) Replicate the key to all accounts  
D) Switch to an AWS managed key  

**Answer: B**  
Explanation: The correct answer is three-layer governance: cross-account use requires both the key policy and the using account's IAM to allow it, `aws:PrincipalOrgID` limits it to within the organization, and an SCP adds a guardrail that Denies `kms:ScheduleKeyDeletion` and `kms:PutKeyPolicy` for regular accounts. IAM alone fails because there is no delegation, and replicating the key or switching to an AWS managed key conflicts with the central control requirement.

---

**Question 3.** An external partner without KMS call permission must encrypt data and send it to us, and at the same time the partner must be able to verify the integrity of documents we issue. What is the most appropriate key configuration?

A) Share a single symmetric key  
B) An asymmetric key for encryption/decryption (public key distributed to the partner) + an asymmetric key for signing/verification (we sign with the private key, the partner verifies with the public key)  
C) SSE-S3  
D) Grant a grant to the partner's account  

**Answer: B**  
Explanation: To let the partner only encrypt without KMS call permission, use an asymmetric key (public key distributed, private key inside KMS), and for document integrity verification use an asymmetric signing key (private-key signing, public-key verification). Sharing a symmetric key exposes decryption permission as well, SSE-S3 is unrelated to external encryption and signing, and a grant is unsuitable for a partner who has no KMS call permission at all.

---

**Question 4.** Which of the following is NOT frequently cited as a *pitfall* in this week's data protection design?

A) Trying to turn on encryption for an existing unencrypted RDS instance with an "encryption toggle"  
B) Mistakenly believing that automatic rotation re-encrypts existing data with the new key  
C) Configuring *both* the key policy and the using account's IAM in a cross-account setup  
D) Putting a password in the encryption context so it is exposed in plaintext in CloudTrail  

**Answer: C**  
Explanation: Cross-account KMS access requires *both* the key policy allow and the using account's IAM allow, so configuring both is not a pitfall but the correct design. The rest are all genuinely frequent pitfalls: RDS cannot be encrypted with a toggle (it must go through a snapshot), automatic rotation does not re-encrypt existing data, and the encryption context is not encrypted, so putting secrets in it exposes them in plaintext. Because the question asks you to choose what is *not* a pitfall, the answer is configuring both sides.

---

**Question 5.** You must neutralize a customer managed key suspected of being compromised immediately, while being able to recover quickly if it turns out to be a false positive. What is the most appropriate action?

A) Schedule deletion in 7 days with `ScheduleKeyDeletion`  
B) Disable the key, revoke related grants and policies, and investigate - disable takes effect immediately and is reversible  
C) Delete only the key alias  
D) Create a multi-Region replica  

**Answer: B**  
Explanation: Disabling a key takes effect immediately and is reversible, so it suits emergency, recoverable neutralization in a suspected-compromise situation, and revoking grants and policies in parallel reduces exposure. `ScheduleKeyDeletion` is an irreversible deletion after a waiting period, so the data can never be decrypted; deleting an alias does not stop key usage; and creating a replica is unrelated to neutralization.

---
