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

## 📝 연습 문제

**문제 1.** 한 금융사가 규제(SEC Rule 17a-4)에 따라 거래 백업을 7년간 **누구도 — AWS root 사용자조차 — 삭제·변경할 수 없게** 보관해야 한다. 가장 적합한 구성은?

A) Backup Vault Governance Lock

B) Backup Vault Compliance Lock

C) S3 Glacier Deep Archive

D) RDS 자동 백업 35일 + Manual Snapshot

**정답: B**

해설: Compliance 모드만이 유예 기간 종료 후 root를 포함한 누구도 백업을 삭제·변경할 수 없는 진짜 WORM을 보장하며, 이것이 SEC 17a-4·FINRA 4511 같은 규제 요구를 법적으로 충족한다. A(Governance)는 적절한 IAM 권한을 가진 관리자가 해제할 수 있어 "누구도 불가" 요건을 못 맞춘다. C(Glacier)는 저렴한 저장 계층일 뿐 변경 불가 정책 자체를 강제하지 않는다(Glacier에 Vault Lock을 별도로 걸 수는 있으나 보기의 의도는 저장소). D는 35일 한계와 변경 가능성 때문에 7년 불가역 요건에 부적합하다. 함정: "root도 불가·규제 준수"는 Compliance 모드의 직답이다.

---

**문제 2.** 한 기업이 200개 계정으로 구성된 Organization에서 모든 production 계정이 동일한 백업 정책(매일 백업·35일 보존·Cross-Region 복사)을 따르도록 일괄 강제하려 한다. 가장 효율적인 방법은?

A) 각 계정 관리자가 수동으로 Backup Plan을 생성한다

B) AWS Organizations Backup Policy를 정의해 Production OU에 부착한다

C) 계정마다 Lambda로 백업을 트리거한다

D) Trusted Advisor로 백업 누락을 점검한다

**정답: B**

해설: Organizations Backup Policy는 관리 계정(또는 위임 관리자)이 정책을 정의해 OU에 부착하면 그 아래 모든 계정이 백업 정책을 강제 상속하는 메커니즘으로, SCP와 같은 정책 상속 구조를 따른다. 200개 계정을 중앙에서 일괄 통제하므로 가장 효율적이다. A는 200번 수동 작업으로 누락·드리프트가 불가피하고, C는 백업 인프라를 손수 재구현하는 안티패턴이며, D는 점검 도구일 뿐 정책을 강제하지 못한다. 함정: "수백 계정에 표준 일괄 강제"는 Organizations Backup Policy의 직답이다.

---

**문제 3.** 한 회사가 워크로드 계정이 랜섬웨어로 탈취되더라도 백업만은 복구 가능하도록 보호하려 한다. 가장 견고한 아키텍처는?

A) 같은 계정의 다른 리전에 Cross-Region Copy만 한다

B) Backup을 별도 백업 계정으로 Cross-Account Copy하고 대상 Vault에 Compliance Lock을 적용한다

C) S3 Versioning을 켠다

D) Governance Lock을 적용한다

**정답: B**

해설: 랜섬웨어가 워크로드 계정의 관리자 권한을 탈취해도, 백업이 **별도 계정(Cross-Account)**에 있고 그 Vault가 **Compliance Lock(root도 삭제 불가)**이면 공격자가 백업에 손댈 수 없어 몸값 없이 복구할 수 있다. A는 같은 계정이라 계정이 탈취되면 다른 리전 백업도 함께 노출된다. C(Versioning)는 객체 덮어쓰기 보호일 뿐 계정 탈취 시 삭제를 막지 못한다. D(Governance)는 권한 있는(탈취된) 관리자가 해제할 수 있어 부족하다. 함정: "계정 탈취·랜섬웨어 대비"는 Cross-Account + Compliance Lock의 조합 신호다.

---

**문제 4.** 한 팀이 AWS Backup의 Cross-Account Copy를 설정했으나 복사가 계속 실패한다. 가장 가능성 높은 원인과 해법은?

A) IAM 사용자에게 AdministratorAccess를 부여한다

B) 대상 계정 Vault의 KMS 키 정책과 Vault 액세스 정책에 소스 계정 권한을 추가한다

C) Backup Plan의 cron 일정을 변경한다

D) 소스 리전을 us-east-1로 바꾼다

**정답: B**

해설: Cross-Account Copy는 백업이 대상 Vault의 KMS 키로 암호화되므로, 대상 계정의 KMS 키 정책에 소스 계정의 복호화·복사 권한을, 대상 Vault의 액세스(리소스 기반) 정책에 소스 계정의 복사 허용을 명시해야 한다. 이 리소스 기반 정책 체인 중 하나라도 빠지면 복사가 조용히 실패한다. A는 IAM 사용자 권한일 뿐 리소스 기반 정책 문제를 해결하지 못하고, C·D는 무관하다. 함정: Cross-Account Copy 실패는 "IAM 권한"이 아니라 "KMS 키 정책·Vault 액세스 정책(리소스 기반)" 문제다.

---

**문제 5.** 한 조직이 "모든 prod 리소스가 매일 백업되고 35일 보존되며 Cross-Region 복사되는지" 자동으로 검증하고 미준수 리소스를 식별하려 한다. 가장 적합한 도구는?

A) Trusted Advisor

B) Backup Audit Manager

C) AWS Config 수동 규칙

D) CloudTrail

**정답: B**

해설: Backup Audit Manager는 "매일 백업 + 35일 보존 + Cross-Region 복사" 같은 컨트롤을 정의하면 실제 백업 상태를 이 컨트롤과 대조해 미준수 리소스를 자동 식별하고 리포트를 생성하며, Security Hub로 알림을 통합할 수 있다. A(Trusted Advisor)는 백업 정책 준수 평가 기능이 없고, C(Config)는 일반 구성 평가 도구로 백업 전용 컨트롤을 직접 제공하지 않으며, D(CloudTrail)는 API 감사 로그일 뿐이다. 함정: "백업 정책 준수 자동 평가·미준수 식별"은 Backup Audit Manager의 직답이다.

---

**문제 6.** 한 회사가 새로 생성되는 모든 EBS·RDS 리소스가 사람의 개입 없이 자동으로 백업 정책에 포함되기를 원한다. 가장 적합한 접근은?

A) 리소스가 생길 때마다 관리자가 수동으로 Backup Plan에 추가한다

B) Backup Plan에서 태그 기반 리소스 선택(예: Environment=prod)을 사용한다

C) 각 서비스의 네이티브 백업을 개별 설정한다

D) CloudFormation으로 매번 백업을 명시한다

**정답: B**

해설: AWS Backup의 태그 기반 리소스 선택은 "Environment=prod 태그를 가진 모든 리소스"를 Plan에 자동 편입하는 선언적 정책이다. 새 리소스가 생겨도 태그만 맞으면 자동으로 백업 대상이 되어, 명령형 백업의 고질적 문제인 "누락"을 구조적으로 방지한다(Kubernetes·Terraform과 같은 desired-state 사상). A는 매번 수동 작업으로 누락 위험이 크고, C·D는 리소스마다 손수 설정해야 해 자동 편입이 안 된다. 함정: "새 리소스도 자동으로 백업 정책에 포함"은 태그 기반 선택의 직답이다.

---