# Day 3 - Integrated Review Domains 5 & 6: Data Protection ↔ Security Foundations and Governance

Domains 5 (Data Protection, ~18%) and 6 (Security Foundations and Governance, ~14%) are the exam's final pair. Here is how they relate: **data protection covers "how do we encrypt, isolate, and retain data," while governance covers "how do we enforce, verify, and sustain those controls at multi-account scale."** Many Specialty answers take the form *"a control that is correct in one account, enforced automatically across the whole Organization."* Today we bind KMS-centered data protection and Organizations-centered governance into a single control-propagation model.

## Data Protection: KMS Is at the Center of Everything

| Key type | Who controls the key material | Rotation | Cost / purpose |
|---------|--------------|----------|-----------|
| AWS managed key | AWS | Automatic (1 year) | Free, service default |
| Customer managed key (CMK) | Customer (policy / grants) | Optional automatic / manual | When you need control over the key policy |
| Imported key material | Customer brings it in (BYOK) | Manual re-import | When you need control over key provenance |
| CloudHSM-backed (custom key store) | Customer HSM (FIPS 140-2 L3) | — | Regulated workloads, dedicated HSM |

The heart of KMS is *envelope encryption*. A KMS master key (KEK) encrypts a data key (DEK), and the actual bulk data is encrypted locally with the DEK. `GenerateDataKey` returns both a plaintext DEK (used immediately, kept only in memory) and an encrypted DEK (stored alongside the data). This way KMS keeps control of the key without you having to send large payloads to KMS every time. "Why doesn't KMS encrypt large files directly?" → because of envelope encryption.

### Key Policy vs IAM vs Grant

For KMS access, **the key policy is the primary source of authority** (which is what sets it apart from IAM). Key rules:
- The key policy must trust the account root before access can be delegated through IAM policies (`"Enable IAM policies"`).
- **Grant**: temporary, fine-grained delegation of permissions (a service uses the key on behalf of a user). It can expire or be revoked.
- A key cannot be deleted immediately — there is a *7–30 day waiting period*. Until then you can *disable* it so the deletion can be reversed.

| Axis | Key policy | IAM policy | Grant |
|---|---|---|---|
| Attached to | The key itself | A principal (user / role) | The key + the grantee principal |
| Sufficient on its own? | **Yes** (the only one that can stand alone) | No (depends on delegation from the key policy) | Yes (within the permitted scope) |
| Lifetime | Permanent | Permanent | **Temporary, revocable** |
| Typical use | Key ownership / administration boundary | Granting usage rights to people and apps | When an AWS service uses the key on behalf of a user |
| How the exam asks it | "I have AdministratorAccess, so why can't I decrypt?" | "Who gets usage permission?" | "Only temporarily, and revocable" |

There are two condition keys the exam is especially fond of. **`kms:ViaService`** restricts the key so that it can be used *only when called through* a specific AWS service (for example, only through S3). **`kms:EncryptionContext`** allows decryption only when the context supplied at encryption time matches (separating tenants or purposes). Both are answers to the requirement "narrow down how the key can be used."

> ⚠️ **Distinctions people often get wrong**:
> - **S3 SSE-S3 vs SSE-KMS vs SSE-C vs DSSE-KMS**: S3-managed keys / KMS keys (auditing and policy) / customer-provided keys / dual-layer KMS. If you need auditing and access control → SSE-KMS.
> - **CloudHSM vs KMS**: a dedicated single-tenant HSM (you operate it yourself, FIPS L3) vs a managed multi-tenant service. For regulation or sole ownership of keys → CloudHSM / custom key store.
> - **In transit vs at rest**: TLS (in transit) vs SSE/KMS (at rest). You need both.

### Easily Confused Pair: Comparing the Five S3 Encryption Methods

| Method | Key ownership / storage | Auditing of key use | Access control | When to choose it |
|---|---|---|---|---|
| **SSE-S3** | AWS | Weak (no per-key auditing) | Bucket policy only | Default encryption, no control requirements |
| **SSE-KMS** | Customer (CMK) | **Decrypt/GenerateDataKey via CloudTrail** | Key policy + IAM + grants | ★ The right answer most of the time — "auditing and policy control" |
| **DSSE-KMS** | Customer (CMK) | Same | Same | When **dual-layer encryption** is explicitly required |
| **SSE-C** | **Customer supplies it with every request** | AWS does not store the key | Only whoever knows the key | When the key must never be kept in AWS (heavy operational burden) |
| **Client-side (CSE)** | Customer (in the app) | Application's responsibility | Application's responsibility | When AWS must never see the plaintext |

There is also a cost axis. **S3 Bucket Keys** reduce the number of KMS calls when you use SSE-KMS, which lowers cost — the answer to a stem like "we use SSE-KMS but the KMS request charges are excessive."

One-line discriminator: **"audit and control who uses the key" → SSE-KMS**; **"dual-layer encryption" stated explicitly → DSSE-KMS**; **"the key is not kept in AWS" → SSE-C or client-side**; **"dedicated HSM, sole ownership, FIPS L3" → a custom key store backed by CloudHSM**.

### Easily Confused Pair: Object Lock Governance vs Compliance

This distinction appears in almost every exam sitting.

| Axis | Governance mode | Compliance mode | Legal Hold |
|---|---|---|---|
| Delete / overwrite during the retention period | **Possible** with a special permission (`s3:BypassGovernanceRetention`) | **Impossible — not even the root user can** | Locked indefinitely, with no period |
| Shortening the period | Possible with a special permission | **Impossible** (can only be extended) | Not applicable |
| Prerequisite | Versioning | Versioning | Versioning |
| When to choose it | Internal policy, preventing mistakes, when you want to leave room for exceptions | **When regulation requires that "no one can delete it"** | Freezing specific objects with no end date for litigation or investigations |

If the stem says **"including administrators, nobody," "regulatory requirement," or "immutable for N years,"** the answer is Compliance. If it says **"prevent accidental deletion but allow an exception when needed,"** it is Governance. All three **require versioning**, and Object Lock and **MFA Delete are different things** (the latter is a separate mechanism that requires MFA to delete versions or suspend versioning, and only the root user can set it, through the CLI/API).

The same concept exists on the backup side — **AWS Backup Vault Lock** provides WORM for backups. It is the answer to the requirement "backups must not be erasable by ransomware."

### Additional Data Protection Tools

- **S3 Object Lock (WORM)** + MFA Delete + versioning → prevents tampering and deletion (ransomware, regulation).
- **Bucket policy `aws:SecureTransport`** → enforces TLS (denies plaintext HTTP).
- **ACM** → certificate issuance and automatic renewal (CloudFront needs us-east-1; ALB needs the ALB's own Region). For a private trust chain, use **AWS Private CA**. *Imported certificates are not renewed automatically.*
- **Macie** → discovers sensitive data in S3 (ties back to Domain 1).
- **RDS/EBS/EFS encryption** → specify the KMS key at creation time (hard to turn on later → re-encrypt via snapshot).
- **S3 Replication (SRR/CRR)** → requires versioning. **Replicating to a different account** means a copy survives even if the source account is breached.

> ⚠️ **Trap**: For a requirement like "encrypt a resource that already exists," the **re-creation path** is almost always the answer. For an unencrypted EBS volume: *snapshot → encrypted copy → new volume*; for an unencrypted RDS instance: *snapshot → encrypted copy → restore*. An option saying "turn on encryption in the settings" is wrong. Conversely, turning on **account- and Region-level EBS default encryption** automatically encrypts everything created afterward — that is the answer on the preventive-control side.

### Data Protection Decision Tree

```
"How do we protect this data?"
   │
   ├─ At rest
   │    ├─ Need auditing and policy control? ──► SSE-KMS (CMK) + audit KMS API calls with CloudTrail
   │    ├─ Dual-layer explicitly required? ────► DSSE-KMS
   │    ├─ Key can't be kept in AWS? ─────────► SSE-C / client-side encryption
   │    ├─ Dedicated HSM, sole ownership? ────► CloudHSM-backed custom key store
   │    └─ KMS call costs too high? ──────────► S3 Bucket Keys
   │
   ├─ In transit ─────────────────► TLS + bucket policy aws:SecureTransport Deny
   │                                (ACM certificate — CloudFront needs us-east-1)
   │
   ├─ Preventing deletion / tampering
   │    ├─ Nobody (root included) ──► Object Lock **Compliance**
   │    ├─ Want to allow exceptions ─► Object Lock **Governance**
   │    ├─ Litigation freeze ───────► Legal Hold
   │    ├─ MFA on version deletes ──► MFA Delete
   │    └─ Lock the backup itself ──► Backup Vault Lock
   │
   ├─ Where is the sensitive data? ──► Macie
   │
   └─ Keep it from leaving the org ──► SCP (outbound door) + RCP (inbound door) + aws:PrincipalOrgID
```

> 🎯 **Integrated Scenario A**: "For regulatory reasons we must solely own and control the key material, S3 data must be encrypted with that key, and we must audit who used the key." Answer: a **CloudHSM-backed KMS custom key store** (sole ownership of key material, FIPS L3) → use that CMK for **S3 SSE-KMS** (access controlled through the key policy) → audit KMS API calls (`Decrypt`/`GenerateDataKey`) with **CloudTrail**. Key ownership (CloudHSM) + control (key policy) + auditing (CloudTrail) — a three-part answer.

## Governance: Enforcing Controls at Organization Scale

| Tool | Role |
|------|------|
| AWS Organizations | Foundation for the multi-account structure, OUs, and consolidated billing |
| SCP | Enforces a permission ceiling (guardrail) on OUs/accounts |
| Control Tower | Automates the landing zone, guardrails, and account factory |
| AWS Config | Configuration compliance evaluation, history, and automatic remediation |
| Conformance Pack | Deploys a bundle of Config rules across the organization |
| Firewall Manager | Centrally enforces WAF / SG / Shield policies |
| Service Catalog | Self-service of approved infrastructure products only |
| RAM | Cross-account resource sharing |

The spirit of governance is a combination of *preventive + detective + responsive* guardrails. **SCP = preventive** (it makes the action impossible in the first place), **Config rules = detective** (they notice when something drifts), **Config auto-remediation / EventBridge = responsive** (they put it back). Control Tower packages all three into the landing zone. On the exam, "enforce this control across the whole organization" → pick SCP (permissions), Firewall Manager (network/WAF), or a Config Conformance Pack (compliance).

### The Four-Layer Mental Model of Governance

Questions almost always test "which plane's tool is the answer."

```
① Permission-boundary plane — the ceiling on what can be done
      SCP / RCP        (a maximum boundary, not a grant of permission)
② Baseline plane — so accounts are born secure
      Control Tower    (landing zone · controls · account factory)
③ Proof plane — show with evidence that you are compliant
      Audit Manager ← Config / CloudTrail / Security Hub (evidence sources)
④ Operations plane — day-to-day enforcement, remediation, response
      Firewall Manager / tag and cost governance / EventBridge auto-remediation

Foundation: management account (billing and the organization only) · Audit account (detection and evidence) · Log Archive account (immutable logs)
            All security services run from the Audit account as delegated administrator
```

This order is both a *time axis* and a *cost axis*. If you stop a problem at prevention, the cost is close to zero; once it moves to detection, investigation and response costs attach; and if it is found at the proof stage, regulatory and contractual costs attach. That is why the governance design principle is "finish the job in the leftmost layer whenever possible."

Control Tower's controls are also split along this axis — **preventive (SCP)**, **detective (Config rules)**, and **proactive (CloudFormation Hooks — block at the IaC stage *before* the resource is created)**. "Stop it before it's created" is a proactive control, and "evaluate what has already been created" is a detective control.

### Typical SCP Guardrails

- Deny use of the root user, deny outside specific Regions, deny disabling CloudTrail, deny creating resources without tags, deny anything other than specific instance types, deny creating unencrypted volumes, deny sharing snapshots outside the organization. An SCP is **not a grant of permissions but a ceiling that limits them** (reviewed on Day 2).

If you memorize the shape of just three typical SCP statements, you can tell apart most of the answer options.

- **Region lock**: Deny when `aws:RequestedRegion` is outside the allowed list — but if you forget the **exceptions for global services and us-east-1**, the console, CloudFront, ACM, and IAM break.
- **Defense against detection evasion**: Deny `cloudtrail:StopLogging`, `DeleteTrail`, `guardduty:DeleteDetector`, `config:StopConfigurationRecorder`, and `securityhub:DisableSecurityHub` — but **leave one security-maintenance role as an exception using an `ArnNotLike` condition**, and monitor that role's use through CloudTrail.
- **Organization boundary**: Deny `ec2:ModifySnapshotAttribute`, `ModifyImageAttribute`, `ram:CreateResourceShare`, and similar actions when `aws:PrincipalOrgID` does not match.

### The Outbound Door and the Inbound Door: SCP vs RCP

```
        [ Our organization ]                 [ Outside ]

  Principal ──(snapshot share · data copy)──▶  External account
      └── Blocked by SCP + aws:PrincipalOrgID   (outbound door)

  Our resource ◀──(access via misconfigured resource policy)── External principal
      └── Blocked by RCP + aws:PrincipalOrgID   (inbound door)
```

It is easy to mistake SCP and RCP for "doing the same thing twice," but their directions are opposite. An SCP is based on *the account the principal belongs to*, so it locks **the door our people use to go out**; an RCP is based on *the account the resource belongs to*, so it locks **the door outsiders use to come in to our resources**. If you apply only one, the opposite direction stays open. This is why so many real exfiltration incidents take the form "we minimized permissions, but the resource policy was open" or "we locked down the resource, but an internal principal shared a snapshot." Note, however, that RCP supports a limited set of services, so services the RCP does not reach have to be covered with SCPs, resource policies, and **IAM Access Analyzer detection**. "We turned on RCP, so the organization boundary is done" is the most dangerous judgment.

### Easily Confused Pair: Governance Tools with Similar Names

| Requirement | Correct tool | Frequently confused with |
|---|---|---|
| "Maximum permission boundary / block Regions or services" | **SCP** | Config (detection only) |
| "Block external access to organization resources" | **RCP** | SCP (opposite direction) |
| "Quickly lay down a multi-account baseline" | **Control Tower** | StackSets (just a deployment tool) |
| "Block in IaC *before* a resource is created" | **Proactive control (CFN Hooks)** | Config (after-the-fact evaluation) |
| "Check whether created resources follow the rules" | **Config rules** | Security Hub standards |
| "Deploy a CIS/PCI rule set to many accounts at once" | **Conformance Pack** | Audit Manager |
| "Automatically collect evidence and reports for auditors" | **Audit Manager** | Conformance Pack |
| "Deploy WAF/SG/NFW consistently across accounts" | **Firewall Manager** | SCP |
| "Self-service only approved infrastructure" | **Service Catalog** | Control Tower |
| "Share resources across accounts" | **RAM** | Resource policy |
| "Standardize tag keys and values" | **Tag Policy** | SCP |
| "Block creation when tags are missing" | **SCP** (`aws:RequestTag` + Null) | Tag Policy |
| "Early warning of spending spikes (a breach signal)" | **Cost Anomaly Detection / Budgets** | GuardDuty |
| "Bring Config data from many accounts and Regions into one place" | **Config aggregator** | Security Hub |

Let us fix in memory the three pairs where mistakes cluster.

- **Conformance Pack vs Audit Manager**: both carry names like CIS and PCI. The one that *lays down rules to create a compliant state* is the Conformance Pack; the one that *packages an already-existing compliant state as evidence* is Audit Manager. **Audit Manager does not generate evidence** — Config, CloudTrail, and Security Hub must already be turned on.
- **Tag Policy vs SCP**: A Tag Policy checks *whether the standard is followed when a tag is applied*. It cannot stop *creating a resource without tags*. **If the goal is to block, it is always an SCP.**
- **Config vs CloudTrail**: "Is the state correct now / at that time?" is Config; "who called that change?" is CloudTrail. Auditors usually require both.

> 🎯 **Integrated Scenario B**: "In every account of the organization, (1) S3 buckets must enforce encryption and TLS, (2) nobody can turn off CloudTrail, and (3) violations must be discovered and remediated automatically." Answer: (1) deploy `s3-bucket-server-side-encryption-enabled` and `s3-bucket-ssl-requests-only` organization-wide with a **Config Conformance Pack** plus auto-remediation, (2) use an **SCP** to deny `cloudtrail:StopLogging` and `DeleteTrail` (preventive), (3) Config non-compliance → EventBridge → SSM/Lambda automatic remediation (responsive). Preventive (SCP), detective (Config), and responsive (auto-remediation) controls propagate across the whole organization.

## A Mental Model Linking the Two Domains

```
[Data protection: correct in one account]   [Governance: enforced org-wide]
KMS (envelope, key policy) ──┐
SSE-KMS / TLS enforcement    ├──► Correct control ──► SCP (preventive) ───────┐
Object Lock (WORM)           │                        Config (detect/fix) ────┼─► Propagated and
RDS/EBS encryption           ┘                        Control Tower           │   maintained in
                                                      Firewall Manager ───────┘   every account
Auditing: CloudTrail (KMS API) + Config (configuration history)
```

The real exam point of data protection and governance is *drift*. Even if you encrypt and lock things correctly once, controls collapse when someone turns them off or a new account is born empty. That is why a mature design is about "continuous enforcement," not "configuration" — Control Tower automatically applies guardrails to new accounts, Config continuously evaluates drift, and an SCP makes the violation impossible from the start. An answer that "enforces automatically and continuously at the organization level" is the Specialty best answer, rather than one that "sets it once." Conversely, touching a resource managed by Control Tower directly in the console *is itself drift* and blocks the application of later controls — the answer then is "re-apply the landing zone plus a rule against manual changes."

### Layered Defense Against Detection Evasion

"Administrators must not be able to turn off or delete logs" is a requirement that appears in almost every sitting. Mapping each attacker action to the layer that stops it makes clear why all four layers are needed.

| Attacker's attempt | Layer that stops it | If it were not stopped |
|---|---|---|
| Stop CloudTrail logging | SCP Deny | All later activity goes unrecorded |
| Delete the trail from a member account | **Organization trail** (members are not the owner) | Account-level evidence disappears |
| Delete or overwrite log objects in S3 | **Object Lock + MFA Delete** | Even the evidence already accumulated disappears retroactively |
| Delete the log KMS key or change its policy | Dedicated KMS + key policy + SCP | Logs remain but can't be decrypted |
| Stop the Config recorder | SCP + Control Tower mandatory controls | Configuration history breaks → a gap in audit evidence |
| Detach the SCP itself | **Management account access control + CloudTrail monitoring** | The ceiling itself disappears |

The last row is the vulnerable point. **What can protect an SCP is not an SCP but access control on the management account.** Hardware MFA on the management account root, minimal IAM principals in the management account, and real-time alerts on `organizations:DetachPolicy` and `DeletePolicy` calls — without these three, no matter how thick the layers below, everything can be peeled away wholesale from above.

## Domain 5 & 6 Keyword → Service Translation Table

| When the stem says something like this | Think of this service / pattern |
|---|---|
| "Encryption that requires key-use auditing and policy control" | SSE-KMS (CMK) + CloudTrail |
| "Dual-layer encryption" | DSSE-KMS |
| "The key is not stored in AWS" | SSE-C / client-side encryption |
| "Dedicated HSM, sole ownership, FIPS 140-2 L3" | CloudHSM / KMS custom key store |
| "With a key from an external key management system" | KMS External Key Store (XKS) |
| "SSE-KMS but KMS costs are excessive" | S3 Bucket Keys |
| "Same key across multiple Regions" | KMS multi-Region keys |
| "Use the key only when going through a specific service" | `kms:ViaService` condition |
| "Separate decryption by tenant or purpose" | `kms:EncryptionContext` condition |
| "Nobody (root included) can delete for N years" | S3 Object Lock **Compliance** |
| "Prevent mistakes, allow exceptions when needed" | S3 Object Lock **Governance** |
| "Freeze indefinitely for litigation or investigation" | Legal Hold |
| "Additional authentication for version deletion" | MFA Delete |
| "Backups must not be erasable" | AWS Backup Vault Lock |
| "Deny plaintext HTTP / enforce TLS" | Bucket policy `aws:SecureTransport` Deny |
| "Automatic certificate renewal" | ACM (CloudFront needs us-east-1; imported certificates are not auto-renewed) |
| "Certificates for an internal trust chain" | AWS Private CA |
| "Encrypt an EBS/RDS that already exists" | Snapshot → encrypted copy → restore / new volume |
| "Volumes created from now on are automatically encrypted" | Account- and Region-level EBS default encryption |
| "A copy survives even if the source account is breached" | S3 replication to another account / cross-account backup |
| "Forbid across the whole organization (preventive)" | SCP |
| "Block external access to organization resources" | RCP |
| "Automatic guardrails for new accounts / landing zone" | Control Tower (+ Account Factory) |
| "Block in IaC before creation" | Proactive controls (CloudFormation Hooks) |
| "Deploy a bundle of rules to the organization at once" | Conformance Pack |
| "Evidence for auditors / framework reports" | Audit Manager |
| "Consistently enforce WAF/SG/NFW across many accounts" | Firewall Manager |
| "Self-service of approved products only" | Service Catalog |
| "Share resources across accounts" | RAM |
| "Standardize tag keys and values" | Tag Policy |
| "Block creation without required tags" | SCP (`aws:RequestTag` + Null) |
| "A spending spike is a breach signal" | Cost Anomaly Detection / Budgets |
| "Multi-account Config data in one place" | Config aggregator |

## Domain 5 & 6 Trap Roundup

**Data protection traps**
- **ACM certificates for CloudFront must be in us-east-1** only. For an ALB, use the ALB's own Region.
- **Imported certificates are not renewed automatically.**
- KMS uses **envelope encryption** — it does not encrypt bulk data directly.
- **The key policy must trust the root** for IAM policy delegation to work.
- **Key deletion has a 7–30 day waiting period** — until then it can be recovered by canceling or disabling.
- At-rest (SSE/KMS) and in-transit (TLS, `aws:SecureTransport`) are **separate controls** — you need both.
- SSE-S3 is weak on key auditing and policy control → when control is required, use **SSE-KMS**.
- **An existing EBS/RDS cannot be encrypted by a setting** — use the snapshot re-encryption path.
- Object Lock, MFA Delete, and replication **require versioning**.
- **Compliance mode cannot be undone** — the period cannot be shortened, only extended.
- Snapshots encrypted with an AWS managed key **cannot be shared as-is with another account** (they must be re-encrypted with a customer managed key).

**Governance traps**
- **SCPs do not grant permissions** — they only limit the ceiling.
- **SCPs do not apply to principals in the management account** → no workloads in the management account.
- **Calls made by service-linked roles are excluded from SCP evaluation.**
- **RCP supports a limited set of services** — "enforce the organization boundary for every service" is an incorrect statement.
- In a Region-lock SCP, **omitting the exceptions for global services and us-east-1** breaks the console, CloudFront, and ACM.
- **Controls apply to OUs** — applying them to individual accounts misses new accounts.
- **Modifying a Control Tower-managed resource in the console = drift** → re-apply the landing zone.
- **Audit Manager does not generate evidence** — Config/CloudTrail/Security Hub must be enabled first.
- **Currently COMPLIANT is not proof over a period** — proving history requires Config configuration history + CloudTrail.
- **Logs and evidence cannot be generated retroactively** — only what you turned on before the audit requirement counts as evidence.
- **Firewall Manager requires Config**, and if `RemediationEnabled` is off it only reports.
- **A Tag Policy cannot block creation without tags** — blocking is the SCP's job.
- **auto-enable is per service** — if one is missed, only that service stays off in new accounts.

In June 2014, the incident at **Code Spaces**, a UK code-hosting company, began when an attacker gained access to the company's AWS console control panel and demanded money. When the company tried to regain control of the account, the attacker used a backup account created in advance to **delete most of the EBS snapshots, S3 buckets, AMIs, and instances**; because the data and the backups sat inside the same control plane, a single account takeover became the destruction of the entire company. The company shut down within days. The reason this incident is cited as a starting point in multi-account governance textbooks can be summed up in one sentence — **"Backups and logs must live somewhere the party that created them cannot delete them."** Today's answers are exactly that: separating out the Log Archive account, Object Lock / Vault Lock, cross-account backups, and a structure in which an SCP blocks the delete actions themselves. If you put a control in a *different permission within the same account*, it is breached the moment the account is breached; only when it sits in *a different permission in a different account* does a real boundary exist.

## Summary

Reduce Domains 5 and 6 to one sentence: **"Lock it correctly in one account, and make it so the entire organization cannot depart from that state."**

Let us press on the essence of governance once more. Governance is not *"the work of creating a good state"* but *"the work of making it impossible to leave the good state."* Setting up security correctly takes one person a day, but making hundreds of accounts keep that state years later is possible only through structure. The SCP forbids departure, Control Tower keeps accounts from being born in a departed state, Config and Audit Manager discover and prove departure, and Firewall Manager and automatic remediation put back whatever has departed.

That is why answer options of the form **"people follow the procedure," "check it periodically," or "each account administrator configures it"** are usually wrong. Conversely, when the stem shows **"all accounts," "the entire organization," "created in the future," or "new accounts,"** you should drop account-level tools and think of organization-level tools first. This one line automatically handles a good share of Domain 6 questions.

### One-Line Summary Checklist

- [ ] Can you explain the principle of envelope encryption (KMS encrypts the DEK, the DEK encrypts the data)?
- [ ] Do you know that the KMS key policy is the primary source of authority and that grants delegate temporarily?
- [ ] Can you distinguish SSE-S3/SSE-KMS/SSE-C/DSSE, CloudHSM vs KMS, and the custom key store?
- [ ] Can you block tampering and plaintext with S3 Object Lock (WORM), MFA Delete, and `aws:SecureTransport`?
- [ ] Can you distinguish SCP = preventive, Config = detective and remediation, Control Tower = landing zone guardrails?
- [ ] Can you enforce controls across the entire organization with Conformance Packs and Firewall Manager?
- [ ] Can you audit KMS API use with CloudTrail (and remember that key deletion means disable first, then wait)?

---

## 📝 Practice Questions

**Question 1.** Due to regulatory requirements, the organization must solely own and control the key material (a dedicated FIPS 140-2 Level 3 HSM), encrypt S3 with that key, and audit key usage. What is the most appropriate combination?

A) SSE-S3 + default key + Macie  
B) A CMK in a CloudHSM-backed KMS custom key store + S3 SSE-KMS + auditing KMS API calls with CloudTrail  
C) Use only SSE-C (customer-provided keys)  
D) AWS managed key + automatic rotation  

**Answer: B**

---

**Question 2.** What is the name of the approach in which KMS issues data keys instead of directly encrypting large S3 objects, and why is it used?

A) Symmetric key rotation — cost savings  
B) Envelope encryption — KMS encrypts the data key (DEK) with the master key, and the actual data is encrypted locally with the plaintext DEK, so large data is not sent to KMS while KMS still controls the key  
C) Client-side hashing — ensuring integrity  
D) TLS tunneling — transport protection  

**Answer: B**

---

**Question 3.** We want to ensure that no one in any account of the organization can turn off CloudTrail. What is the most effective preventive control?

A) Only detect after the fact with a Config rule  
B) Deny `cloudtrail:StopLogging` and `cloudtrail:DeleteTrail` with an SCP so it is impossible in the first place  
C) Manually attach policies to each IAM user  
D) Monitor with GuardDuty  

**Answer: B**

---

**Question 4.** We want to deny plaintext HTTP access to an S3 bucket and allow only TLS. What is the correct method?

A) Set the bucket to public  
B) Add a condition to the bucket policy that Denies when `aws:SecureTransport` is false  
C) Block port 80 with a NACL  
D) Turning on only SSE-KMS automatically enforces TLS  

**Answer: B**

---

**Question 5.** We want to quickly build a landing zone where standard guardrails (logging, encryption, Region restriction) are automatically applied to newly added accounts as well. What is the most appropriate service?

A) Manually configure Config and SCPs in each account  
B) AWS Control Tower — automatically apply controls to new accounts with a landing zone, guardrails, and Account Factory  
C) Use only CloudFormation StackSets  
D) Use only IAM Identity Center  

**Answer: B**

---

**Question 6.** You mistakenly requested deletion of a KMS CMK and then realized that data encrypted with that key still remains. What is the correct action to prevent data loss?

A) Immediately create a new key and replace it with the same ID  
B) Key deletion has a 7 to 30 day waiting period, so cancel the deletion within that period or revert it to disabled  
C) Give up, since the data cannot be recovered  
D) Modify the IAM policy  

**Answer: B**

---
