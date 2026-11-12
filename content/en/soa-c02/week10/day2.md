# Day 2 - AWS Backup: Making Backups Undeletable Even by Administrators

The paradox of backup is this: if someone can delete a backup, that person's account compromise means the backup vanishes too. And the operators who create backups almost always hold the power to delete them. As ransomware evolves, attackers zero in on exactly this point—deleting backups before encrypting data. Recovery becomes impossible, leverage for extortion established. Code Spaces' collapse in Day 1 was precisely this scenario.

AWS Backup's real value isn't convenience—"backup multiple services under one policy"—that DLM does for EBS alone. AWS Backup's essence is **creating an isolated vault (Vault) that even the backup creator cannot delete, placing that vault in a separate account so backups survive even if the operations account is wholly compromised**. This article dives into how the 3-layer structure of Plan/Vault/Selection creates that immutability, why Compliance mode Vault Lock can't be unlocked by even the issuer, and how PITR recovers to "5 seconds ago."

## Why Separate Plan / Vault / Selection—Orthogonal Decomposition of Policy, Storage, and Target

AWS Backup's structure looks complicated at first—three terms: **Backup Plan** (when and how long to keep), **Backup Vault** (where to store), **Backup Selection** (what to back up). Splitting into three instead of one is deliberate **separation of concerns** design. Backup policy (frequency, retention), storage location (vault, encryption key, access policy), and backup targets (resources) change at different frequencies by different people. Security teams manage Vault encryption keys and locks, operations teams change target resource tags, governance teams set retention periods. Bundle these into one unit and everyone's change shakes everything.

- **Backup Plan** holds one or more **Rules**. Each Rule defines "schedule (cron) + retention period + Warm→Cold transition + Cross-Region/Cross-Account copy (CopyAction)." A single Plan can hold both "Daily (35-day retention)" and "Monthly (7-year retention)" Rules.
- **Backup Vault** is the container where recovery points actually live. Encrypted with its own KMS key, controlled via **Vault Access Policy** (resource-based policy) determining who can write/read this vault.
- **Backup Selection** specifies which resources to back up, by tag or ARN. Tag-based means new resources later bearing the same tag auto-include in backup scope—no manual addition needed.

The benefit of orthogonal decomposition is clear. Lock a Vault immutable while Plans remain freely changeable; add targets via tags while Plan and Vault stay static. Segregate KMS keys per Vault—"operations backup vault" and "audit backup vault" encrypt with different keys so one key breach doesn't compromise the other.

> 💡 **Related Theory**: Vault Access Policy existing separately from IAM mirrors Week 9's KMS Key Policy security principle—the most sensitive assets (here, backups) mandate **resource-based policies**, so if IAM is breached, the asset maintains self-defense. IAM (identity-based) answers "what can this principal do"; resource policy answers "who can access this resource." Cross-validated, so attackers need both IAM permission and resource policy allowance. Central vault Cross-Account backup leveraging "only this source account can copy to me" via Vault policy is this model's key application.

## Vault Lock—Governance and Compliance, and the Irreversible 3 Days

Vault Lock makes all recovery points inside a vault **unchangeable and undeletable**—a WORM (Write Once Read Many) mechanism. The crux is mode distinction; this is where exams and operations most often stumble.

**Governance mode** permits `backup:DeleteRecoveryPoint` and Lock unlock only to subjects with specific IAM permissions (`backup:PutBackupVaultLockConfiguration`, etc.). It's a guardrail against accidental deletion, but sufficiently privileged admins can unlock. **Compliance mode** is different. Once set, **only during cooling-off period (changeable-for-days, min 3 days) can it be unlocked/relaxed, and after expiry, not even the root account, AWS itself, or anyone can unlock it.** Min/max retention periods become permanently fixed; no recovery point inside can be deleted before its retention period. Even account closure preserves the lock.

```bash
# Compliance mode - permanent lock after 3-day cooling-off
aws backup put-backup-vault-lock-configuration \
  --backup-vault-name prod-vault \
  --min-retention-days 30 \
  --max-retention-days 2555 \
  --changeable-for-days 3
```

Why the 3-day cooling-off exists is core to the design. Compliance Lock is irreversible—if it immediately locked, one operator typo could permanently lock the company into wrong retention forever (e.g., accidentally setting `max-retention` too short, permanently violating regulations). The 3-day grace is "really freeze like this forever?" verification and the last undo window. Once this window closes, the vault becomes truly immutable.

> ⚠️ **Trap**: Compliance mode's "absolutely can't unlock" is a double-edged sword. Just as attackers can't delete backups, operators can't undo mistakes. Set min-retention too long (e.g., 7 years) and that vault can't delete a single backup for 7 years, accumulating storage costs eternally. That's why Compliance Lock must undergo cooling-off-period test runs before finalization. Exam question "applied Vault Lock in Compliance, regrets, can undo?" is solvable within cooling-off (3 days), unsolvable after. Governance mode avoids this trap since authorized personnel can always unlock.

> 🔍 **Deeper Dive**: AWS Backup Vault Lock complies with WORM storage rules demanded by US SEC, FINRA, CFTC, **verified by third-party assessor Cohasset Associates**. This isn't just a feature—it's regulatory audit defensibility: "this backup is tamper-proof" becomes legally justified. The same WORM model appears at three places across resources—EBS Snapshot Lock (Day 1), S3 Object Lock (Day 4), and here Backup Vault Lock. All three share the philosophy "trust is established when you prove not even admins can touch this," recreating 1990s financial WORM physical optical disc (SEC Rule 17a-4) in software.

## Cross-Account Backup—A Copy That Survives Even Whole Operations Account Compromise

Vault Lock makes the vault immutable, but one scenario remains: **if attackers seize full admin powers of the operations account**, unless Vault Lock is Compliance mode, they can unlock or tamper. Real defense is keeping backups **physically in a different account**. With operations and backup accounts under different security boundaries, credentials, and permission systems, even if the operations account is wholly breached, attackers can't touch the backup account's vault.

The standard AWS Organizations pattern is this: each member account (Prod, Dev, etc.) Backup Plan **CopyAction** auto-replicates backups to a **central backup account (separate OU) Vault**. The central vault locks via Vault Access Policy: "only these source accounts can copy to me, no one deletes from here," plus adds Compliance Vault Lock. Member account operators (or attackers stealing their credentials) lack deletion rights to the central vault, so even if member accounts are ransomware-devastated, the central copy survives intact.

```bash
# Central account vault permits only source account copy
aws backup put-backup-vault-access-policy \
  --backup-vault-name central-vault \
  --policy '{
    "Version":"2012-10-17",
    "Statement":[{
      "Effect":"Allow",
      "Principal":{"AWS":"arn:aws:iam::SOURCE-ACCOUNT:root"},
      "Action":["backup:CopyIntoBackupVault"],
      "Resource":"*"
    }]
  }'
```

This structure is the cloud version of the 3-2-1 backup rule. **3 copies** (original + operations vault + central vault), **2 different boundaries** (operations account + backup account), **1 offsite/isolated copy** (add Cross-Region for a different-region central vault). Cross-Account + Cross-Region together withstand both account breach and region outage.

| Threat | Defense |
|--------|---------|
| Operator accidental deletion | Governance Vault Lock, Recycle Bin |
| Credentials stolen, backup deleted | Compliance Vault Lock (issuer can't unlock) |
| Whole operations account breached | Cross-Account central vault (different boundary) |
| Region-scale outage | Cross-Region CopyAction |
| Regulatory WORM requirement | Compliance Lock (Cohasset-verified) |

> 📚 **Case Study**: Post-2021 major ransomware incidents (including Colonial Pipeline infrastructure attacks) repeatedly taught: "if backups live under the same domain/credentials as operations, backups encrypt and delete together." Attackers gaining domain admin rights target backup servers first. AWS's Cross-Account + Compliance Vault Lock combination is cloud-native answer—central backup accounts can't be accessed/deleted by any member account power, and Compliance-locked vaults can't be unlocked even by central account root. So even if attackers control all member accounts + central root, Compliance-locked recovery points survive retention periods. "Admin can't delete" means "attacker can't delete."

## Continuous Backup and PITR—How to Return to "5 Seconds Ago"

Regular backups restore to snapshot-taken moments only—"yesterday 3 AM." But if wrong `DELETE` query ran at 2:30 PM, restoring to yesterday loses an entire day. **PITR (Point-in-Time Recovery)** returns to "any second before disaster." This RDS/Aurora/DynamoDB/S3-supported capability's secret is **snapshot + transaction log combination**.

The principle: periodically create full snapshots (base), continuously record all changes between them in **transaction logs** (RDS binlog/WAL, DynamoDB change streams). "Restore to 2:30:11 PM" and the system restores the nearest preceding base snapshot, then **replays transaction logs to 2:30:11 PM**. Snapshot is departure point; logs carry you to target time. PITR's precision depends on log granularity—RDS typically second~5-minute, Aurora finer.

```bash
# Restore RDS to precise moment (new instance)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier prod-db \
  --target-db-instance-identifier prod-db-restored \
  --restore-time 2026-05-22T14:30:11Z
```

PITR always **restores to new resources.** Never overwrites originals; creates separate instances/tables—miss the disaster time and original stays safe for retry. PITR window operates within RDS automatic backup retention (default 1~35 days); beyond that requires Manual Snapshots or AWS Backup long-term retention.

> 💡 **Related Theory**: PITR's "snapshot + log replay" applies database recovery theory's **WAL (Write-Ahead Logging)** and **log-structured recovery** directly to backups. Databases continuously write all changes to logs before data files (write-ahead). Post-outage restart replays from last checkpoint (=base snapshot) to consistent state. PITR extends this across time—not "last" but "any second I specify" replays logs. Event Sourcing architecture "state = initial state + replay all events" to reconstruct arbitrary past states uses the same principle exactly. Separating state as snapshot and changes as logs lets you traverse time freely.

## Warm/Cold Lifecycle and Restore Time—Tradeoff Between Cost and Speed

Backups fade in value over time while stockpiling. AWS Backup **Lifecycle** auto-migrates recovery points **Warm Storage → Cold Storage** over time, lowering cost. Warm enables instant restore at premium price; Cold costs ~75% less but restore takes hours.

```json
"Lifecycle": {
  "MoveToColdStorageAfterDays": 90,
  "DeleteAfterDays": 2555
}
```

A frequent constraint trip: **backups moved to Cold Storage must stay Cold minimum 90 days.** So `MoveToColdStorageAfterDays` (90) to `DeleteAfterDays` difference must be 90+ days—move to Cold in 90 days, delete in 100, that's 10-day gap, policy rejects it. Restore speed varies per tier. Warm is instant; Cold takes hours by option. DR system with tight RTO having its backups in Cold to save cost means restore delays missing RTO. **Recent backups with restore-likely scenarios should be Warm; old backups kept only for regulations go Cold.**

> ⚠️ **Trap**: "backup created" and "restore succeeds" are different things. AWS Backup Plan automates backup **creation** only; it doesn't verify restore success. Corrupted backups, missing IAM restore permissions, missing dependent resources (security groups, subnets) cause restore to fail when disaster strikes. Use **Restore Testing Plan** to auto-test restores regularly, proving "backup is really alive." Backup never restored is nearly equivalent to backup never made—DR is DR only when restore is proven.

## Backup Audit Manager—Rules Enforce Backup Policy Compliance, Not People

In hundreds of accounts and thousands of resources, checking "every prod resource really backs up daily?" by hand is impossible. One EC2 tagged wrongly slips backup scope; you discover "no backup" at disaster time. **Backup Audit Manager** automates this surveillance via **Controls (rules)**. Define Controls in a Framework and AWS Backup continuously evaluates environment, reporting violations.

```bash
aws backup create-framework \
  --framework-name DailyBackupCompliance \
  --framework-controls '[
    {
      "ControlName":"BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN",
      "ControlScope":{"Tags":{"Environment":"prod"}}
    },
    {
      "ControlName":"BACKUP_RECOVERY_POINT_MINIMUM_RETENTION_CHECK",
      "ControlInputParameters":[{"ParameterName":"requiredRetentionDays","ParameterValue":"30"}]
    }
  ]'
```

Representative Controls ask straightforward questions—"any prod-tagged resource outside backup plan?", "backup shorter than 30 days retention?", "backup missing Cross-Region copy?", "vault locked?" Violations surface as non-compliant resource lists and compliance CSV reports. This mirrors Week 4's Config/Audit Manager "declarative compliance verification" philosophy—declare desired state as rules, system perpetually aligns reality to rules.

> 🔍 **Deeper Dive**: Backup Audit Manager Controls run internally on AWS Config evaluation engine. Config tracks resource state changes; Controls evaluate those states from backup perspective. This enables near-real-time backup protection detection—new resource appears, Config spots it, Control instantly evaluates "is it in backup scope?" This layering reveals backup gaps not at disaster time but moment of violation. Declarative compliance's power is alerting "at violation instant," not "after incident."

## Wrapping Up

All AWS Backup design flows from two goals: "make backups undeletable even by creator" and "survive even operations account wholesale compromise." Plan/Vault/Selection split into three enables independent policy/storage/target control; Vault Access Policy separate from IAM gives backups self-defense; Compliance Vault Lock unlockable by no one means attackers can't either; Cross-Account is standard because only different security boundaries survive wholesale breach.

Five key takeaways for operators: ① AWS Backup is multi-service integration + compliance; DLM is EBS/AMI-only. ② Compliance Vault Lock after cooling-off (3 days) is forever—issuer/AWS/root all can't unlock—so verify before permanence. ③ Cross-Account central vault is real defense against wholesale breach—cloud version of 3-2-1. ④ PITR is snapshot + transaction log replay for arbitrary-point restore, always new resources. ⑤ Backup creation and restore success are separate—Restore Testing Plan proves viability; Cold is slow so check RTO before placement.

In the next article, we'll transcend backup/restore units, exploring how databases **never stop even mid-fault**, via RDS Multi-AZ synchronous replication and Aurora's distributed storage architecture.

---

## 📝 Practice Questions

**Question 1.** A company wants to back up RDS, EBS, DynamoDB, and EFS under a single policy and automatically generate compliance reports. Which tool is most suitable?

A) DLM(Data Lifecycle Manager)
B) AWS Backup: integrates multiple services through a Backup Plan, and automatically verifies compliance with Backup Audit Manager frameworks
C) Manual snapshots per service
D) Custom Lambda scripts

**Answer: B**

Explanation: DLM is dedicated to EBS/AMI and cannot handle RDS, DynamoDB, or EFS. AWS Backup backs up EBS, RDS, Aurora, DynamoDB, EFS, FSx, S3, and more under one Backup Plan, and with Backup Audit Manager's control-based frameworks it continuously verifies conditions such as "are all prod resources backed up and is the retention period sufficient" and automatically generates compliance reports.

---

**Question 2.** You must prevent a ransomware scenario in which an attacker steals administrator privileges in the production account and deletes the backups as well. What is the strongest architecture?

A) Remove only the delete permission with an IAM policy inside the production account
B) Replicate backups cross-account to a vault in a separate central account and apply Vault Lock in Compliance mode to that vault
C) Increase the backup frequency
D) Enforce MFA for all users

**Answer: B**

Explanation: If the production account is fully compromised, an IAM policy (A) inside that account is bypassed by the attacker. The real defense is to keep backups in a different security boundary (a separate account). The member account's CopyAction replicates to the vault in the central backup account, and if Compliance Vault Lock is applied to that vault, no permission in the member account, not even the central account's root, can delete recovery points within the retention period. "Even an administrator cannot delete it" means "an attacker cannot delete it either."

---

**Question 3.** Right after applying Vault Lock in Compliance mode, an operator realizes the retention period setting was wrong. Can it be reverted?

A) Yes, at any time if you have IAM permissions
B) Within the changeable-for-days (cooling-off, minimum 3 days) period it can be changed or removed, but after that period it is permanently impossible, including for the root account and AWS
C) AWS Support will remove it on request
D) Never possible; it is permanent immediately upon application

**Answer: B**

Explanation: Compliance Vault Lock can be changed or removed only during the cooling-off period specified by `changeable-for-days` (minimum 3 days); after that period it becomes truly immutable and no one, neither the issuer, the root account, nor AWS, can lift it. This grace period is the last window to verify the setting and revert it before it becomes irreversibly permanent. Governance mode can be removed at any time by authorized principals, so it has no such constraint.

---

**Question 4.** You need to roll RDS back to the state just before an erroneous DELETE query that ran at 2:30 PM. If you only have yesterday's early-morning snapshot, you lose a day of data. Which feature is needed?

A) Restore from a manual snapshot
B) Point-in-Time Recovery (PITR): restore a base snapshot and then replay transaction logs up to the specified time, restoring to a new instance at any point in time down to the second
C) Read Replica promote
D) Multi-AZ failover

**Answer: B**

Explanation: PITR works by combining periodic base snapshots with continuous transaction logs (binlog/WAL). Given a specific time, it restores the base snapshot immediately before that time, replays the logs up to that time, and reconstructs the state at that arbitrary point into a new instance. Because it always restores to a new resource, the original is preserved. However, PITR works only within the automated backup retention period (default 1 to 35 days).

---

**Question 5.** When configuring a Backup Plan to move backups to Cold Storage after 90 days and delete them after 100 days, the policy is rejected. Why?

A) Cold Storage does not support RDS backups
B) Backups moved to Cold Storage must stay in Cold for at least 90 days, so the policy is rejected if the difference between the transition time and the deletion time is less than 90 days
C) The retention period must be at least 365 days
D) Moving to Cold Storage is possible only after 180 days

**Answer: B**

Explanation: AWS Backup enforces that a recovery point moved to Cold Storage stays in Cold for at least 90 days. Therefore the difference between `MoveToColdStorageAfterDays` and `DeleteAfterDays` must be at least 90 days. Moving after 90 days and deleting after 100 days has a difference of only 10 days, so it is rejected. Cold is about 75% cheaper than Warm but restores more slowly, so backups with tight RTOs should stay in Warm.

---

**Question 6.** Among hundreds of prod resources, you want to automatically detect, before an outage, whether some have been left out of the backup plan. Which tool is suitable?

A) CloudWatch alarms
B) Backup Audit Manager framework: continuously evaluates unprotected resources with controls such as BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN
C) Manual tag checks
D) S3 Inventory

**Answer: B**

Explanation: Backup Audit Manager continuously evaluates the environment based on controls. The `BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN` control finds resources in the specified scope (for example, those with a prod tag) that are not included in a backup plan, and other controls verify retention period, cross-Region copy, and Vault Lock. Internally it runs on the AWS Config evaluation engine and detects the unprotected state right after a new resource appears, so gaps are revealed as soon as they occur rather than during an outage.

---

**Question 7.** A company believed daily backups were running fine, but in an actual outage the restore failed because of IAM permission and dependent-resource problems. How can this be prevented in advance?

A) Increase the backup frequency
B) Use a Restore Testing Plan to run regular automated restore tests and verify that backups can actually be restored
C) Apply Vault Lock
D) Move backups to Cold Storage

**Answer: B**

Explanation: A Backup Plan automates only the creation of backups and does not verify that they can be restored. Corrupted backups, insufficient IAM permissions at restore time, or missing dependent resources such as security groups and subnets can cause a restore to fail precisely during an outage. A Restore Testing Plan automatically performs real restores on a regular basis to prove that "the backup is truly alive." A backup that has never been restored is not much different from having no backup.

---
