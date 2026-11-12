# Day 2 - Backup: AWS Backup & Cross-Region Copy — Legal Origins of WORM, Vault Lock Irreversibility, Multi-Account Backup Governance

In the 1990s, a major Wall Street brokerage came under SEC investigation for allegedly deleting customer emails. This incident created **SEC Rule 17a-4(f)**, mandating "WORM (Write Once Read Many)" storage—once recorded, no one can erase or modify. What once required optical disks or special tape, AWS implemented via **Backup Vault Lock's Compliance mode**—activate it and even AWS's root user cannot delete backups.

In SAP-C02, backup isn't just "turn on snapshots." Pro perspective is a **governance problem: enforce backup policies centrally across dozens or hundreds of accounts scattered in different places, proving the irreversibility and isolation regulators demand**. Today we decompose WORM's legal roots, Vault Lock's two modes' irreversibility difference, and multi-account backup governance via AWS Organizations to tool level.

## AWS Backup — Consolidate Scattered Backups Into One Policy

Before AWS Backup, each service had its backup method. EBS used DLM (Data Lifecycle Manager) snapshots, RDS used automatic backup settings, DynamoDB used separate on-demand backups—each managed independently. As accounts grew to dozens, "which resources are backed up?" became unknowable. **AWS Backup unifies this fragmentation with a central policy engine.**

| Concept | Role |
|---------|------|
| **Backup Plan** | Policy defining schedule (cron), retention, copy rules |
| **Backup Vault** | KMS-encrypted Recovery Point repository |
| **Vault Lock** | Enforce WORM, deletion ban (Governance / Compliance) |
| **Backup Policy** | Organizations-level deploy Plan to all accounts |
| **Recovery Point** | Actual backup output (snapshot, image) |
| **Continuous Backup** | RDS, Aurora, S3 point-in-time recovery (PITR) support |

Service coverage is broad—EBS, EC2 (AMI), RDS, Aurora, DynamoDB, EFS, FSx, S3, DocumentDB, Neptune, Storage Gateway, Redshift, Timestream, SAP HANA on EC2. **Tag-based resource selection** auto-includes "all resources tagged Environment=prod" in one Plan; new resources auto-backup if tagged right.

> 💡 **Related Theory**: AWS Backup design follows **declarative policy** paradigm. Not imperative "backup this resource" but declaring desired state: "all resources with this tag should backup daily, retain 35 days, and replicate to another region"—the system maintains that state. Same philosophy as Kubernetes desired-state reconciliation or Terraform's declarative IaC. Strength: **new resources auto-enroll in policy**—imperative backup requires manual enabling per new resource, but tag-based declarative policy structurally prevents omission. In exams, "new resources auto-included in backup policy" signals tag-based selection.

> 🔍 **Deeper Dive**: AWS Backup and service-native backups coexist. RDS offers native automatic backup (up to 35 days) and PITR without AWS Backup; EBS can manage snapshots via DLM alone. When use AWS Backup? **When needing cross-service central policy, multi-account governance, Vault Lock WORM, Cross-Account Copy.** Single service/account suffices with native backup, but "enforce consistent policy across entire Organization and prove compliance" needs AWS Backup. Exams frequently test this boundary—"dozens of accounts' EBS, RDS, DDB unified policy" signals AWS Backup.

## Vault Lock — Two Levels of Irreversibility

Even existing backups won't protect if someone (malicious insider, ransomware, accident) can delete them. **Vault Lock** locks backups in a Vault with policy, preventing deletion and modification. The difference between two modes is exam-critical.

| Mode | Changeable After Lock | Use Case |
|------|----------------------|----------|
| **Governance** | Yes, if admin has IAM permissions (`backup:DeleteRecoveryPoint` etc.) | Internal governance, accident prevention |
| **Compliance** | No—**even AWS root cannot** change/delete after lock confirmation, immutable until retention ends | SEC, FINRA, HIPAA regulatory WORM |

Key is **Compliance mode's irreversibility**. Compliance Lock has `changeable-for-days` grace period; during it, settings can adjust/cancel, but once grace expires and lock confirms, **absolutely no one—not AWS headquarters root, not support—can delete backups or reduce retention**. This immutability itself becomes regulatory compliance evidence.

> 💡 **Related Theory**: Vault Lock Compliance's "even root can't change" design applies **immutability** and **separation of privilege** principles from security engineering to extremes. Normally root can do anything, but WORM requires **blocking even root**—else stolen root accounts or insider misuse could vaporize backups. This is core ransomware defense: even if ransomware steals admin powers, Compliance-locked backups remain untouchable—recovery without paying ransom becomes possible. Identical philosophy applies to S3 Object Lock Compliance mode.

> 📚 **Case Study**: The 2021 **Colonial Pipeline ransomware incident**—America's largest pipeline operator eventually paid ~$4.4M ransom in Bitcoin (part FBI recovered). Had all backups been isolated on immutable, unchangeable storage, recovery without ransom was possible. Post-incident, immutable backup (WORM) elevated from "nice to have" to "ransomware-era essential." AWS Backup Vault Lock Compliance + Cross-Account Copy combination is this scenario's answer architecture—backup stored in separate account (unreachable if workload account breached) immutably. In exams, "ransomware defense, even insiders can't delete" signals Compliance Lock + Cross-Account.

> ⚠️ **Pitfall**: Don't lump Governance and Compliance as "both prevent deletion." Governance mode lets **admins with proper IAM permissions override locks and delete**—prevents accidental deletion but not malicious admin or stolen credentials. True regulatory WORM (nobody can change) is Compliance mode only. In exams, "regulatory compliance, root can't change, 7-year retention" is Compliance; "accident prevention, admin can exceptionally release" is Governance—clear distinction.

## Cross-Region & Cross-Account Copy — Isolation Is Core

If backups live in same region or account, region-wide failure or account breach means backup disappears too. AWS Backup's **Copy Action** in Backup Plan auto-replicates Recovery Points to other regions or accounts' Vaults.

- **Cross-Region Copy**: Guard against region-wide failure. Need KMS key permissions on both sides.
- **Cross-Account Copy**: Store in dedicated **backup account** separate from workload. Workload account breach leaves backup safe.

> 🔍 **Deeper Dive**: Most common Cross-Account Copy failure point: **KMS key permissions**. Backups encrypt with Vault's KMS key; target account's Vault's KMS key policy must explicitly grant source account permissions to decrypt and copy. Target Vault's access policy (resource-based) must also allow source account's copy. Miss any link in this permission chain and copy silently fails. In exams, "Copy fails" scenario's answer almost always is "add permissions to KMS key policy or Vault access policy." Not simple IAM user permissions but **resource-based policies (KMS key policy, Vault policy)**—key pitfall.

## Multi-Account Governance — Organizations Backup Policy

Forcing dozens/hundreds of accounts to follow identical backup standards via manual per-account setup is impossible. **AWS Organizations Backup Policy** solves this. Management account (or delegated admin) defines Backup Policy, attaches to OU (Organizational Unit)—all accounts below inherit that backup policy.

```
[Management Account / Delegated Admin]
        │ Define and attach Backup Policy
        ▼
   [Root → OU: Production]
        ├── [App Account 1] EBS, RDS, DDB ──┐
        ├── [App Account 2] EBS, RDS, DDB ──┤ Each account auto-inherits Plan
        └── [App Account N] ...             │
                                            ▼ Cross-Account Copy
                          [Backup Account (isolated)]
                                            │ Cross-Region Copy
                                            ▼
                          [DR Region Vault + Compliance Lock]
```

> 💡 **Related Theory**: Organizations Backup Policy sits on same **policy inheritance** mechanism as **SCP (Service Control Policy)**. Where SCP pushes "what you cannot do (permission boundary)" down OU hierarchy, Backup Policy pushes "what you must backup (operational standard)" same way. Both inherit/combine from parent OU—following **centralized control + distributed execution** pattern for multi-account governance. With Control Tower Landing Zone, auto-deploy this backup policy as guardrail. In exams, "enforce backup standard across hundreds of accounts at once" signals Organizations Backup Policy.

> 🔍 **Deeper Dive**: **Backup Audit Manager** validates whether backups actually execute per policy. Define controls (rules) like "all prod resources: daily backup + 35-day retention + Cross-Region copy," then Audit Manager audits actual backup status against these controls, **auto-identifying non-compliant resources (missing backup, insufficient retention, missing copy)** and generating reports. Violations integrate into Security Hub for central alerting. Complete closed loop: "policy define (Backup Policy) → execute (Backup Plan) → validate (Audit Manager) → alert (Security Hub)." In exams, "auto-evaluate backups per policy, identify non-compliance" is Backup Audit Manager direct answer.

## Service-Specific Backup/Recovery Option Differences

Same "backup" differs by service in PITR support and retention limits. Exams often ask these numbers directly.

| Service | Backup/Recovery Option | Key Numbers |
|---------|------------------------|------------|
| **EBS** | Snapshot (DLM or AWS Backup) | Incremental snapshots |
| **RDS** | Auto backup + Manual Snapshot + PITR | Auto backup max **35 days** |
| **Aurora** | Continuous + Snapshot | PITR **1-second granularity** |
| **DynamoDB** | On-Demand + PITR | PITR max **35 days** |
| **S3** | Versioning + CRR + Object Lock | Object Lock = WORM |
| **EFS** | AWS Backup | - |

> ⚠️ **Pitfall**: S3 backup/protection differs from other services. S3 has native mechanisms first: **Versioning (version management), CRR (Cross-Region Replication), Object Lock (WORM)**—AWS Backup S3 support added recently. "S3 objects in WORM" is **S3 Object Lock Compliance mode**, not AWS Backup. "Async replicate S3 data to another region" is **CRR**, not AWS Backup. In exams, when S3 appears, recall S3 native features (Versioning, CRR, Object Lock) first, then AWS Backup.

## Summary

AWS Backup consolidates service/account-fragmented backups into **tag-based declarative policy** central governance engine. Vault Lock offers two irreversibility levels; Governance allows release by authorized admin, but **Compliance: root cannot change**—true WORM (SEC 17a-4, FINRA, HIPAA compliance). Cross-Region/Account Copy isolates backups against region failure, ransomware, account breach. Organizations Backup Policy enforces standards across hundreds of accounts; Backup Audit Manager validates compliance.

SAP exam frequent mappings: (1) "Unified backup policy across services, accounts" → **AWS Backup**, (2) "root can't change, regulatory 7-year retention" → **Vault Lock Compliance**, (3) "accident prevention, admin can release" → **Vault Lock Governance**, (4) "ransomware, account breach backup isolation" → **Cross-Account Copy + Compliance Lock**, (5) "force backup standard across hundreds of accounts" → **Organizations Backup Policy**, (6) "auto-evaluate backup policy compliance, identify non-compliance" → **Backup Audit Manager**, (7) "S3 object WORM" → **S3 Object Lock**, (8) "Cross-Account Copy fails" → **KMS key policy, Vault access policy permissions**. Next day digs beyond backup/restore into actively validating resilience (Resilience Hub, FIS, DRS).

---

## 📝 Practice Questions

**Question 1.** Under regulation (SEC Rule 17a-4), a financial firm must retain transaction backups for 7 years so that **no one — not even the AWS root user — can delete or modify them**. What is the most appropriate configuration?

A) Backup Vault Governance Lock

B) Backup Vault Compliance Lock

C) S3 Glacier Deep Archive

D) RDS automated backups for 35 days + Manual Snapshot

**Answer: B**

Explanation: Only Compliance mode guarantees true WORM, in which no one, including root, can delete or modify backups after the grace period ends, and this legally satisfies regulatory requirements such as SEC 17a-4 and FINRA 4511. A (Governance) can be lifted by an administrator with the appropriate IAM permissions, so it fails the "no one can" requirement. C (Glacier) is merely an inexpensive storage tier and does not itself enforce an immutability policy (Vault Lock can be applied to Glacier separately, but the intent of the choice is the storage). D is unsuitable for the 7-year irreversible requirement because of the 35-day limit and the possibility of modification. Trap: "even root cannot + regulatory compliance" is the direct answer for Compliance mode.

---

**Question 2.** In an Organization of 200 accounts, a company wants to enforce, across all accounts at once, that every production account follows the same backup policy (daily backups, 35-day retention, Cross-Region copy). What is the most efficient method?

A) Each account administrator creates a Backup Plan manually

B) Define an AWS Organizations Backup Policy and attach it to the Production OU

C) Trigger backups with a Lambda in each account

D) Check for missing backups with Trusted Advisor

**Answer: B**

Explanation: An Organizations Backup Policy is a mechanism in which the management account (or a delegated administrator) defines a policy and attaches it to an OU, and all accounts under it inherit the backup policy by force, following the same policy inheritance structure as SCPs. It controls 200 accounts centrally and at once, so it is the most efficient. A means 200 manual tasks, so omissions and drift are inevitable; C is an anti-pattern that reimplements the backup infrastructure by hand; and D is a checking tool that cannot enforce policy. Trap: "enforcing a standard at once across hundreds of accounts" is the direct answer for Organizations Backup Policy.

---

**Question 3.** A company wants to protect its backups so they remain recoverable even if a workload account is taken over by ransomware. What is the most robust architecture?

A) Only a Cross-Region Copy within the same account

B) Cross-Account Copy the backups to a separate backup account and apply Compliance Lock to the destination Vault

C) Turn on S3 Versioning

D) Apply a Governance Lock

**Answer: B**

Explanation: Even if ransomware steals administrator privileges in the workload account, if the backups are in a **separate account (Cross-Account)** and that Vault has a **Compliance Lock (not even root can delete)**, the attacker cannot touch the backups and you can recover without paying a ransom. With A, the backups in other Regions are also exposed if the account is taken over because they are in the same account. C (Versioning) only protects against overwrites and cannot prevent deletion when the account is compromised. D (Governance) is insufficient because a privileged (compromised) administrator can lift it. Trap: "preparing for account takeover and ransomware" is the combination signal of Cross-Account + Compliance Lock.

---

**Question 4.** A team set up AWS Backup Cross-Account Copy, but the copy keeps failing. What is the most likely cause and solution?

A) Grant the IAM user AdministratorAccess

B) Add the source account's permissions to the destination account Vault's KMS key policy and Vault access policy

C) Change the cron schedule of the Backup Plan

D) Change the source Region to us-east-1

**Answer: B**

Explanation: In Cross-Account Copy, the backup is encrypted with the destination Vault's KMS key, so you must explicitly grant the source account decrypt and copy permissions in the destination account's KMS key policy and allow the source account to copy in the destination Vault's access (resource-based) policy. If any one link in this chain of resource-based policies is missing, the copy fails silently. A is only an IAM user permission and does not solve the resource-based policy problem, and C and D are unrelated. Trap: a Cross-Account Copy failure is a problem with the "KMS key policy and Vault access policy (resource-based)," not "IAM permissions."

---

**Question 5.** An organization wants to automatically verify that "all prod resources are backed up daily, retained for 35 days, and copied Cross-Region" and to identify noncompliant resources. What is the most appropriate tool?

A) Trusted Advisor

B) Backup Audit Manager

C) AWS Config manual rules

D) CloudTrail

**Answer: B**

Explanation: When you define controls such as "daily backup + 35-day retention + Cross-Region copy," Backup Audit Manager compares the actual backup state against these controls, automatically identifies noncompliant resources, generates reports, and can integrate alerts with Security Hub. A (Trusted Advisor) has no capability to assess backup policy compliance, C (Config) is a general configuration evaluation tool that does not directly provide backup-specific controls, and D (CloudTrail) is merely an API audit log. Trap: "automatic assessment of backup policy compliance and identification of noncompliance" is the direct answer for Backup Audit Manager.

---

**Question 6.** A company wants all newly created EBS and RDS resources to be included in the backup policy automatically, without human intervention. What is the most appropriate approach?

A) An administrator manually adds each new resource to the Backup Plan

B) Use tag-based resource selection in the Backup Plan (for example, Environment=prod)

C) Configure each service's native backup individually

D) Specify the backup explicitly in CloudFormation every time

**Answer: B**

Explanation: AWS Backup's tag-based resource selection is a declarative policy that automatically includes "all resources with the Environment=prod tag" in the Plan. Even when new resources are created, they automatically become backup targets as long as the tag matches, structurally preventing the chronic "omission" problem of imperative backups (the same desired-state philosophy as Kubernetes and Terraform). A relies on manual work every time and has a high risk of omission, and C and D require configuring each resource by hand, so automatic inclusion does not happen. Trap: "new resources are also automatically included in the backup policy" is the direct answer for tag-based selection.

---