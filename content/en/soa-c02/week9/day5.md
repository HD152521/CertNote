# Day 5 - Week 9 Comprehensive Review: How Keywords Point to Answers

Over the past week, we've surveyed the full terrain of security and encryption—from KMS key isolation through GuardDuty, Inspector, Macie, and Security Hub's detection divisions. On the exam, problems in this domain almost always follow the pattern: **"one or two keywords in the scenario point to the answer."** If you see "decryption across regions," think Multi-Region Key. If "automatic rotation" appears, think Secrets Manager. If "detect threats without agents," think GuardDuty. This article solidifies that keyword-to-answer mapping in one sweep.

The core of review is not memorization, but **grasping why each answer is correct.** KMS limits itself to 4KB not randomly, but because Envelope Encryption forces a design that doesn't expose the master key to large data. Key Policy takes precedence over IAM not as arbitrary hierarchy, but because limiting blast radius—if one key is compromised, not everything leaks—is a design principle. Understand the "why" and you solve novel variations. Below, one-line summaries and comparison tables build the skeleton; 12 scenario problems add the flesh.

## Week 9 Core Concepts: One-Line Summary

1. **KMS Key Types** — AWS Owned (free, invisible) / AWS Managed (`aws/` prefix, forced rotation) / Customer Managed ($1/month, policy & rotation control). Key material never downloadable.
2. **Envelope Encryption** — Bypass KMS's 4KB limit. Get DEK via GenerateDataKey, encrypt data locally, store encrypted DEK with data. Plaintext DEK exists in memory only.
3. **Key Policy Takes Precedence** — Even with `kms:*` in IAM, Key Policy must delegate or deny. Remove the `root` delegation line from default policy and the key locks.
4. **Key Rotation** — Auto-rotation adds backing keys only; Key ID unchanged. Preventive, not breach response.
5. **Key Deletion** — 7–30 day wait mandatory. Permanent decryption loss risk. Pre-test with disable first.
6. **Multi-Region Key** — Only path for cross-region decryption. Required for Global Table, S3 CRR (SSE-KMS).
7. **Encryption Context** — Works as AAD. Decrypt requires exact match. First suspect when permissions are correct but decryption fails.
8. **Secrets Manager vs Parameter Store** — Auto-rotation + Cross-Region: Secrets Manager only. Parameter Store: plain settings, free.
9. **IAM Access Analyzer** — Auto-detects exposure outside Zone of Trust + CloudTrail 90-day data for least-privilege policy generation.
10. **GuardDuty (behavior/threat) + Inspector (software/vulnerability) + Macie (data/sensitive) + Security Hub (aggregation/standard)** — Each tool sees a different layer.
11. **CloudHSM** — Dedicated HSM, FIPS 140-2 L3, AWS has no key access. Only when regulation mandates it.
12. **Auto-Response Skeleton** — Security tool → EventBridge → Lambda/SSM Automation. Polling is wrong.

> 💡 **Related Theory**: One principle threads through all 12 concepts: **"Defense in Depth."** Don't rely on a single control; build multiple independent defensive layers so if one fails, the next holds. Military strategy roots this concept. KMS Key Policy (separate line of defense even if IAM is breached), Envelope Encryption (minimize master key exposure), deletion waiting period (human error brakes), four detection tools at different layers (behavior/software/data/configuration each watched separately)—all embody this principle. On the exam, "most secure configuration" questions usually reward "add one more layer" answers.

## Comparison Tables: Common Confusion Points

### KMS vs CloudHSM

| Item | KMS | CloudHSM |
|---|---|---|
| HSM Tenancy | Multi-tenant (AWS-managed) | Dedicated (customer-leased) |
| FIPS 140-2 | Module L3, service context L2 | L3 (dedicated) |
| Key Control | AWS operates, customer policies | Customer 100%, AWS no access |
| Cost | $1/month/key + API | $1.45+/hour always-on |
| Key Recovery | Within Support limits | Lost = permanently gone |
| Use Case | Most workloads | Regulation mandates dedicated HSM |

### Parameter Store vs Secrets Manager

| Item | Parameter Store | Secrets Manager |
|---|---|---|
| Cost | Standard free / Advanced cheap | $0.40/secret/month + API |
| Auto-Rotation | ❌ | ✅ (AWS-provided Lambda for RDS) |
| Cross-Region Replication | ❌ | ✅ |
| Size Limit | Standard 4KB / Advanced 8KB | 64KB |
| Use Case | General settings, plaintext params | DB credentials, rotation-required secrets |

### Four Detection Tools

| Item | GuardDuty | Inspector v2 | Macie | Security Hub |
|---|---|---|---|---|
| Layer | Behavior (threats) | Software (vulnerabilities) | Data (sensitive info) | Aggregation·standards |
| Scope | Account activity | EC2/ECR/Lambda | S3 object body | All findings |
| Agent | ❌ (Runtime only ✅) | SSM Agent | ❌ | ❌ |
| Data Source | Flow Logs/CloudTrail/DNS | OS packages/images/code | S3 object contents | ASFF findings |
| Billing | Events analyzed | Resources scanned | Data bytes scanned | Finding count |

> 🔍 **Deeper Dive**: When memorizing comparison tables, attach "why is this different?" and you become resistant to variation questions. Example: only Secrets Manager supports auto-rotation because it orchestrates a 4-step lifecycle (createSecret → setSecret → testSecret → finishSecret) via Lambda; Parameter Store is a simple key-value store with no orchestration concept. Only Macie bills by data bytes because it's the only tool reading object body (others see metadata), making large-scale scan cost control a Macie-specific exam point.

> ⚠️ **Pitfall**: Two frequent confusion points in comparison tables. First: "rotate DB password free and automatic" is a contradiction answer—auto-rotation is Secrets Manager only ($0.40/month), so if "free" and "auto-rotation" sit together in one choice, it's wrong. Second: tool layer substitution like "GuardDuty scans OS vulnerabilities" or "Inspector detects malicious domain communication"—these swap tool responsibilities. GuardDuty watches behavior, Inspector watches software. Answers blurring this boundary are frequent traps.

## 12 Scenario Problems

**Problem 1.** An IAM user has `kms:*` permission yet a specific KMS key denies with `AccessDenied`. Most likely cause?

A) IAM policy has MFA condition (`aws:MultiFactorAuthPresent`) but session lacks MFA
B) Key Policy doesn't delegate to this account/principal—KMS Key Policy (resource-based) beats IAM
C) Key is in another region; endpoint mismatch prevents find; cross-region keys don't auto-route
D) Hit `kms:RequestAlias` quota or per-second API limit; ThrottlingException blocks

**Answer: B**

Explanation: KMS's most distinctive trait. Every key requires Key Policy, and if Key Policy doesn't explicitly allow or delegate to IAM (Principal: arn:aws:iam::account:root), IAM permissions count for nothing. This is blast-radius design: if one key leaks, not everything leaks. Remove the `root` delegation line from default policy and IAM becomes powerless.

---

**Problem 2.** Encrypting a 1GB log file with KMS hits a 4KB limit error. Standard fix?

A) Split file into 4KB chunks, call Encrypt API per chunk, concatenate results
B) Envelope Encryption—GenerateDataKey for DEK, encrypt file locally, store encrypted DEK with data
C) Use CloudHSM cluster instead; send 1GB to HSM directly in one call
D) Add SSE enforcement rule to S3 bucket policy to bypass the 4KB limit

**Answer: B**

Explanation: The 4KB limit is intentional design. Direct master key encryption of large data = network bottleneck, HSM throughput ceiling, expanded cryptanalytic surface. Envelope Encryption: ephemeral DEK encrypts large data fast locally; short DEK alone gets sealed by master key, stored alongside data. Plaintext DEK discarded post-use. S3 SSE-KMS, EBS, RDS all use this internally.

---

**Problem 3.** Auto-rotate RDS MySQL master password every 30 days without writing rotation Lambda. Best approach?

A) Parameter Store SecureString + EventBridge schedule running monthly password polling Lambda
B) Secrets Manager + AWS-provided RDS Rotation Lambda (blueprint)
C) Custom Lambda on cron; ALTER USER monthly to change password
D) Enable KMS auto key rotation (annual backing key swap) so password rotates automatically

**Answer: B**

Explanation: Parameter Store lacks auto-rotation. Secrets Manager orchestrates 4-step rotation lifecycle, and AWS provides pre-built rotation Lambdas for RDS, Redshift, DocumentDB—no coding needed. KMS key rotation (D) swaps encryption keys, not passwords—unrelated.

---

**Problem 4.** During Secrets Manager's RDS password rotation, running apps must not see auth failures. What mechanism enables zero-downtime?

A) DB switches to read-only during rotation
B) Rotation's 4-step flow (createSecret→setSecret→testSecret→finishSecret) creates new secret under AWSPENDING label, sets it in DB, validates it, then moves AWSPENDING→AWSCURRENT label only after validation passes
C) Apps restart at rotation time
D) Use two passwords simultaneously

**Answer: B**

Explanation: Zero-downtime rotation uses staging labels (AWSCURRENT/AWSPENDING) and 4-step lifecycle. New password born under AWSPENDING, deployed to DB (setSecret), validated (testSecret), then label-flipped (finishSecret). Validation completes before current password changes, so apps always hold valid credentials. No DB pause, no app restart.

---

**Problem 5.** Seoul-region data replicates to Tokyo via S3 CRR with SSE-KMS encryption. Destination decryption requires?

A) Use Seoul KMS key directly from Tokyo
B) Multi-Region Key—primary (Seoul) and replica (Tokyo) share key ID and backing material; both regions decrypt
C) Create independent Tokyo KMS key; disable replication
D) Switch to CloudHSM dedicated cluster

**Answer: B**

Explanation: Regular KMS keys are region-locked (ARN contains region; backing material in that region's HSM only). Seoul key's ciphertext can't decrypt with Tokyo key. Multi-Region Key is the sole exception: primary and replica share key ID (mrk-*) and backing material, enabling cross-region decryption. Use case: Global DynamoDB, S3 CRR (SSE-KMS).

---

**Problem 6.** Operator concludes a KMS key is unused and deletes it. Minimize permanent data loss. Best procedure?

A) Call schedule-key-deletion immediately
B) First disable key (immediately reversible); run operationally for days/weeks, CloudWatch-monitor for zero decryption attempts; then schedule deletion
C) Remove all permissions from Key Policy
D) Delete only the alias

**Answer: B**

Explanation: Key deletion is irreversible; all data encrypted with that key (including backups) becomes permanently unrecoverable. KMS enforces 7–30 day waiting. Safe procedure: disable first (free, instant undo), run live while monitoring decryption attempts, see zero activity for a period, then schedule deletion. Disable = free rehearsal; during wait window, `cancel-key-deletion` is available.

---

**Problem 7.** Permissions, key state, region all correct yet a ciphertext decrypts with `InvalidCiphertext`. After permissions, suspect #1?

A) Key rotation in progress; temporary block
B) Encryption Context mismatch—Encryption Context must match exactly between encrypt and decrypt
C) Not a Multi-Region Key
D) DEK expired

**Answer: B**

Explanation: Encryption Context is AAD (Additional Authenticated Data). Encrypt sends key-value pairs; decrypt must send identical pairs or fail, regardless of permissions. S3 SSE-KMS auto-uses object ARN as context, preventing ciphertext move-and-decrypt attempts. Key rotation (A) logs old key IDs in ciphertext, auto-finds them; doesn't block decryption.

---

**Problem 8.** EC2 instance communicates with known C&C domain. Detect without agents. Which tool and why?

A) Inspector—scans OS vulnerabilities
B) GuardDuty—analyzes Flow Logs/CloudTrail/DNS Logs; Threat Intel `Backdoor:EC2/C&CActivity.B!DNS` finding auto-generated
C) Macie—scans S3 data
D) Config—tracks config changes

**Answer: B**

Explanation: GuardDuty works agent-free, analyzing AWS internal streams (Flow/CloudTrail/DNS). C&C domain communication caught via DNS Logs cross-referenced against Threat Intel DB, typical DNS-based finding. Inspector watches software (behavior is different), Macie watches data body. External DNS circumvents Route 53 Resolver, creating GuardDuty blind spot; DNS Firewall blocks it.

---

**Problem 9.** Inspector v2 running on ECR a month. Clean image last week; today Critical finding appears; image unchanged. Correct interpretation?

A) Image was tampered with
B) New CVE published to NVD; Inspector v2's continuous scan auto-re-evaluates old resources—expected behavior
C) Inspector bug; ignore finding
D) Re-push image to refresh scan

**Answer: B**

Explanation: Inspector v2 doesn't scan-once-done; it continuously re-evaluates EC2/ECR/Lambda when new CVEs publish. Yesterday-clean image can surface findings today due to newly-public CVE—intended behavior. Log4Shell (CVE-2021-44228) proved value: auto-listed vulnerable versions in environment instantly. Not tampering, not bug.

---

**Problem 10.** 80TB S3 data lake; find cards/SSNs but control scan costs. Best approach?

A) Macie full 80TB precision scan at once
B) Macie auto-sensitive-data-discovery (sampling) maps risky buckets cheaply; then precision-scan high-risk only
C) GuardDuty scan S3
D) Inspector scan S3

**Answer: B**

Explanation: Macie bills by scanned data bytes—80TB precision = cost bomb. Auto-sensitive-data-discovery intelligently samples objects, mapping "which bucket is risky" cheaply. Then precision classification jobs on high-risk buckets control cost while catching risk. Luhn algorithm checksum reduces false positives. GuardDuty/Inspector don't see S3 object body sensitive data.

---

**Problem 11.** Company wants all-member-account GuardDuty/Inspector/Macie/Access Analyzer/third-party findings on one dashboard, identical format, and auto-score CIS·PCI-DSS compliance. Which service and prerequisite?

A) CloudWatch Dashboard
B) Security Hub—ASFF normalizes all findings, auto-scores standards. Standards use Config Rules internally; Config must be enabled
C) Audit Manager
D) Config alone

**Answer: B**

Explanation: Security Hub doesn't detect; it collects findings from multiple tools, normalizes to ASFF JSON schema (same fields, severity system, resource format), and auto-scores FSBP/CIS/PCI-DSS/NIST 800-53 via Config Rules. Standard evaluation requires Config enabled. Organizations integration: Delegated Administrator sees all accounts; Cross-Region Aggregation brings multiple regions to one.

---

**Problem 12.** GuardDuty detects severity 8.2 suspicious instance. Auto-respond: immediately swap to isolation SG, no human touch. AWS standard flow?

A) Lambda polls GuardDuty every minute for findings
B) GuardDuty Finding → EventBridge Rule (severity ≥ 7.0 filter) → SSM Automation Runbook `AWS-IsolateEC2InstanceFromGuardDutyFinding`(or Lambda) swaps SG
C) Config Rule auto-terminates instance
D) Inspector auto-patches instance

**Answer: B**

Explanation: AWS security auto-response skeleton: "security tool → EventBridge → SSM Automation/Lambda." GuardDuty publishes findings to EventBridge; severity-filtered rules trigger SSM Automation Runbook, which swaps instance SG to isolation SG. AWS provides standard Runbooks for this. Polling (A) = low real-time quality, non-event-driven. Config termination, Inspector patching wrong tool.

---

## Next Week Preview (Week 10)

Week 10: **Backup & DR Operations**—Snapshot, AWS Backup, Multi-AZ, Cross-Region.

- Day 1: EBS Snapshot, AMI, DLM (Data Lifecycle Manager)
- Day 2: AWS Backup—Plan, Vault, Cross-Region/Cross-Account
- Day 3: RDS Multi-AZ vs Read Replica, Aurora Global DB
- Day 4: S3 Replication (CRR/SRR), Storage Gateway, Elastic Disaster Recovery
- Day 5: Week 10 review + 10 scenario problems

> 💡 Reliability & BCP domain (16%). RTO/RPO scenarios frequent; "time to recover vs point in time" trade-off is a perennial exam point.
