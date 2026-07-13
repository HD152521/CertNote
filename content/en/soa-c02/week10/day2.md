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

## 📝 연습 문제

**문제 1.** 회사가 RDS·EBS·DynamoDB·EFS를 하나의 정책으로 통합 백업하고 컴플라이언스 보고서까지 자동 생성하려 한다. 가장 적합한 도구는?

A) DLM(Data Lifecycle Manager)
B) AWS Backup — Backup Plan으로 멀티 서비스 통합, Backup Audit Manager Framework로 컴플라이언스 자동 검증
C) 서비스별 수동 스냅샷
D) Lambda 커스텀 스크립트

**정답: B**

해설: DLM은 EBS/AMI 전용이라 RDS·DynamoDB·EFS를 다루지 못한다. AWS Backup은 EBS/RDS/Aurora/DynamoDB/EFS/FSx/S3 등을 하나의 Backup Plan으로 통합 백업하고, Backup Audit Manager의 Control 기반 Framework로 "모든 prod 리소스가 백업되는가, 보존 기간이 충분한가" 등을 지속 검증해 컴플라이언스 리포트를 자동 생성한다.

---

**문제 2.** Ransomware 공격자가 운영 계정의 관리자 권한을 탈취해 백업까지 삭제하는 시나리오를 막아야 한다. 가장 강력한 구조는?

A) 운영 계정 내 IAM 정책으로 삭제 권한만 제거
B) Cross-Account로 백업을 별도 중앙 계정 Vault에 복제하고, 그 금고에 Compliance 모드 Vault Lock을 적용
C) 백업 빈도를 높임
D) MFA를 모든 사용자에게 강제

**정답: B**

해설: 운영 계정이 통째로 침해되면 그 계정 내 IAM 정책(A)은 공격자가 우회한다. 진짜 방어는 백업을 다른 보안 경계(별도 계정)에 두는 것이다. 멤버 계정의 CopyAction이 중앙 백업 계정 금고로 복제하고, 그 금고에 Compliance Vault Lock을 걸면 멤버 계정의 어떤 권한으로도, 심지어 중앙 계정 루트로도 보존 기간 내 복구 지점을 삭제할 수 없다. "관리자도 못 지운다"가 곧 "공격자도 못 지운다"다.

---

**문제 3.** 운영자가 Vault Lock을 Compliance 모드로 적용한 직후 보존 기간 설정이 잘못됐음을 깨달았다. 되돌릴 수 있나?

A) IAM 권한이 있으면 언제든 가능
B) changeable-for-days(cooling-off, 최소 3일) 기간 내라면 변경·해제 가능하지만, 그 기간이 지나면 루트·AWS를 포함해 영구히 불가
C) AWS Support에 요청하면 해제해 준다
D) 절대 불가능, 적용 즉시 영구

**정답: B**

해설: Compliance Vault Lock은 `changeable-for-days`로 지정한 cooling-off 기간(최소 3일) 동안만 변경·해제할 수 있고, 그 기간이 지나면 발급자·루트 계정·AWS 누구도 풀 수 없는 진짜 불변 상태가 된다. 이 유예 기간은 비가역적 영구화 전에 설정을 검증하고 되돌릴 마지막 창이다. Governance 모드는 권한자가 언제든 해제 가능해 이 제약이 없다.

---

**문제 4.** 오후 2시 30분에 실행된 잘못된 DELETE 쿼리 직전 상태로 RDS를 되돌려야 한다. 어제 새벽 스냅샷밖에 없으면 하루치를 잃는다. 어떤 기능이 필요한가?

A) Manual Snapshot 복원
B) Point-in-Time Recovery(PITR) — 베이스 스냅샷 복원 후 트랜잭션 로그를 지정 시각까지 재생해 임의의 초 단위 시점으로 새 인스턴스 복원
C) Read Replica promote
D) Multi-AZ 페일오버

**정답: B**

해설: PITR은 주기적 베이스 스냅샷 + 연속 트랜잭션 로그(binlog/WAL) 조합으로 동작한다. 지정한 시각을 주면 그 직전 베이스 스냅샷을 복원한 뒤 로그를 그 시각까지 재생해 임의 시점 상태를 새 인스턴스로 재구성한다. 항상 새 리소스로 복원하므로 원본은 보존된다. 단 PITR은 자동 백업 보존 기간(기본 1~35일) 내에서만 작동한다.

---

**문제 5.** Backup Plan에서 백업을 90일 후 Cold Storage로 옮기고 100일 후 삭제하도록 설정하려 했더니 정책이 거부된다. 이유는?

A) Cold Storage는 RDS 백업을 지원하지 않는다
B) Cold Storage로 이동한 백업은 최소 90일을 Cold에 머물러야 하므로, 이동 시점과 삭제 시점의 차이가 90일 미만이면 거부된다
C) 보존 기간은 365일 이상이어야 한다
D) Cold Storage 이동은 180일 후에만 가능하다

**정답: B**

해설: AWS Backup은 Cold Storage로 옮긴 복구 지점이 최소 90일간 Cold에 머물도록 강제한다. 따라서 `MoveToColdStorageAfterDays`와 `DeleteAfterDays`의 차이가 최소 90일 이상이어야 한다. 90일 이동 후 100일 삭제는 차이가 10일뿐이라 거부된다. Cold는 Warm보다 약 75% 저렴하지만 복원이 느리므로, RTO가 빡빡한 백업은 Warm에 둬야 한다.

---

**문제 6.** 수백 개 prod 리소스 중 일부가 백업 계획에서 누락됐는지를 장애 전에 자동으로 탐지하려 한다. 어떤 도구가 적합한가?

A) CloudWatch 알람
B) Backup Audit Manager Framework — BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN 등 Control로 미보호 리소스를 지속 평가
C) 수동 태그 점검
D) S3 Inventory

**정답: B**

해설: Backup Audit Manager는 Control 기반으로 환경을 지속 평가한다. `BACKUP_RESOURCES_PROTECTED_BY_BACKUP_PLAN` Control은 지정 범위(예: prod 태그) 리소스 중 백업 계획에 포함되지 않은 것을 찾아내고, 다른 Control은 보존 기간·Cross-Region 복사·Vault Lock 여부를 검증한다. 내부적으로 AWS Config 평가 엔진 위에서 동작해 새 리소스 등장 직후 미보호 상태를 감지하므로, 누락이 장애 때가 아니라 발생 즉시 드러난다.

---

**문제 7.** 회사가 매일 백업은 잘 돌고 있다고 믿었는데, 실제 장애 시 복원이 IAM 권한·의존 리소스 문제로 실패했다. 이를 사전에 방지하려면?

A) 백업 빈도를 더 높인다
B) Restore Testing Plan으로 정기적 자동 복원 테스트를 수행해 백업이 실제 복원 가능한지 검증한다
C) Vault Lock을 적용한다
D) Cold Storage로 옮긴다

**정답: B**

해설: Backup Plan은 백업 생성만 자동화하고 복원 가능 여부는 검증하지 않는다. 손상된 백업, 복원 시 IAM 권한 부족, 보안 그룹·서브넷 등 의존 리소스 누락으로 정작 장애 때 복원이 실패할 수 있다. Restore Testing Plan은 정기적으로 실제 복원을 자동 수행해 "백업이 진짜 살아 있는지"를 증명한다. 복원해본 적 없는 백업은 백업이 없는 것과 크게 다르지 않다.

---
