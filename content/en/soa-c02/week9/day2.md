# Day 2 - Secrets Manager, Rotating Live System Secrets Without Downtime

Changing passwords is easy — console input, save, done. But when the application using that password runs 24/7, it's completely different. At that password change moment, dozens of app servers holding cached old password simultaneously emit auth failures. "Password rotation" seems simple but is actually one of distributed systems' thorniest concurrency problems.

Secrets Manager's value isn't just "secure secret storage vault" — Parameter Store SecureString does that too. Secrets Manager costs $0.40/month, much more than Parameter Store, because of **automating secret rotation in live systems without downtime**. Why 4 rotation stages, why alternating-user strategy guarantees zero-downtime, why multi-region replication reads-only — understanding these design decisions is this section's focus.

## Separating Secrets from Code — Real Problem Secrets Manager Solves

GitHub exposes AWS keys discovered in code daily. GitGuardian's annual report counts millions of hardcoded secrets exposed in public repositories yearly. Hardcoding passwords, API keys, tokens in source or config files is incident root cause. Once committed, secrets persist eternally in git history, replicated across every fork.

Secrets Manager separates secrets entirely from code. Applications know secret **names** only (`prod/web/db-password`), fetching actual values at runtime via API. Code holds no secrets, git has none, config files none. Secrets stay KMS-encrypted in Secrets Manager only, controlled by IAM who reads, audited by CloudTrail. Same as Parameter Store SecureString so far. Decisive difference next: **secrets aren't static.** Security best practice periodically changes secrets (90-day rotation common compliance requirement). Static storage delegates rotation to humans; Secrets Manager automates it. Price difference's core there — whether rotation is needed distinguishes the two services.

> 💡 **Related Theory**: Separating secrets from code formalized in 2011 Twelve-Factor App methodology's third factor "Config in the environment." Core: "strictly separate code and config (especially secrets), same code must operate different secrets (dev/staging/production) across environments." Putting secrets in environment variables or external storage lets same code image deploy everywhere, swap secrets without code redeploy on exposure. Secrets Manager elevates this beyond "environment variables" — same security principle, more sophisticated: encryption, audit, automatic rotation built-in service.

## Why Rotation Splits into Four Stages — Non-Atomic Secret Changes

Thinking password rotation as one operation traps you. "Change DB password, store in Secrets Manager." These two operations can't happen simultaneously. Change DB first, Secrets Manager still holds old secret, app fails auth; change Secrets Manager first, DB still old, fails auth with new value. Two distributed systems (secret store and secret user) can't atomic-update.

Secrets Manager's rotation Lambda splits into four stages — state machine handling non-atomicity safely. Each stage is separate Lambda call, version labels (`AWSCURRENT`, `AWSPENDING`, `AWSPREVIOUS`) track progress:

```
1. createSecret  : Generate new secret, store as AWSPENDING
                   (DB unchanged, app still uses AWSCURRENT)
2. setSecret     : Apply AWSPENDING secret to actual DB
                   (DB now accepts new secret)
3. testSecret    : Try DB connection with AWSPENDING secret, validate
                   (Fail here, rotation stops — AWSCURRENT unchanged, app safe)
4. finishSecret  : Move AWSCURRENT label to AWSPENDING version
                   (Old version becomes AWSPREVIOUS)
```

Four-stage separation's core: **stage 3 testSecret failure safely stops rotation.** AWSCURRENT keeps pointing old version, so even mid-rotation failure, applications still receive working old secret. If rotation were just "change DB → change store" two stages, DB changes, store update fails, entire system breaks. Four stages + label tracking design convergence to consistent state at any failure point — transaction-like safety.

> 💡 **Related Theory**: Four-stage rotation mirrors database's Two-Phase Commit (2PC) thinking. 2PC "prepare phase: all participants promise commit-ready, only then actual commit," preventing partial-failure. Secrets Manager's createSecret/setSecret/testSecret "prepare" role; finishSecret "commit" — only testSecret passed moves AWSCURRENT. Not true 2PC (no distributed transaction coordinator), but "validate then commit" core safety shared. AWSPENDING label equals 2PC's "prepared but not committed."

> 🔍 **Deeper Dive**: RDS, Aurora, DocumentDB, Redshift have AWS-provided rotation Lambdas — four stages implemented per-DB engine, no coding needed. Self-systems (legacy APIs, third-party SaaS tokens) require custom rotation Lambda implementing four-stage interface. AWS provides skeleton template (SAR, Serverless Application Repository); fill createSecret~finishSecret function bodies per target system. Exam trap: "RDS password rotation Lambda write from scratch?" — RDS AWS-provided, self-systems direct-write only.

## Single User vs Alternating Users — Real Zero-Downtime Secret

Four-stage rotation hides subtle risk: **setSecret (apply new secret to DB) and finishSecret (move AWSCURRENT) gap.** setSecret already changed DB password, finishSecret still pending, AWSCURRENT still old secret. That brief moment, new fetch app receives old secret, fails auth. Single User strategy can't eliminate this gap completely.

**Single User strategy** changes one DB account's password in-place. Simple but allows brief auth failures during gap and before cache refresh. Most apps retry logic, operationally OK, but strict zero-downtime insufficient.

**Alternating Users strategy** elegantly solves this. Keep **two** DB accounts (e.g., `app_user` / `app_user_clone`), rotate alternately. Rotate currently-unused account's password, finish validation, move AWSCURRENT to that account. Core: **rotation target account never used while rotating.**

```
Before:  AWSCURRENT → app_user (apps using)
During:  Change app_user_clone password (app_user untouched)
         → validate connect with app_user_clone (app_user users safe)
After:   AWSCURRENT → app_user_clone (new fetch uses clone)
         → next rotation: update app_user (clone using)
```

Old account (`app_user`) password stays valid temporarily, unrefreshed-cache apps work post-rotation briefly. Naturally transition to new secrets. **This is real zero-downtime** — rotation moment, no app encounters "just-invalidated secret." Trade-off: manage two DB accounts, operational complexity.

> 📚 **Case Study**: Zero-downtime rotation difficulty witnessed by major incidents. 2020 Microsoft Teams TLS certificate expiry hours-long global downtime — secret (certificate) lifecycle management failure. Certificates/passwords are "must-change eventually, change moment most risky" assets. Alternating Users pattern's grace period (old and new secret coexist) absorbs transition risk. Same thinking applies certificate rotation — deploy new cert first, validity overlap period, then retire old.

> ⚠️ **Trap**: Alternating Users requires rotation Lambda "master credential" accessing DB with power to change other account passwords. Separate master secret (`masterarn`) required, linked to rotation target secret. Missing this master link, rotation Lambda can't change other account password, rotation fails. Single User needs only self-password change, master unnecessary — this difference separates configuration complexity.

## Lambda Extension Caching — Reflecting Rotation Without API Hammering

Secrets Manager invoices sometimes show surprising API call costs. Usually from **fetching secret every request** code. Lambda function calling `get_secret_value` per invocation, function invoking thousands/sec calls API thousands/sec. Cost problem, latency grows, Secrets Manager API limit (call/sec) hits.

Natural solution: caching. Reuse once-fetched secret in memory. Then rotation conflict trap: **infinite caching never receives rotated new secret.** Secret rotates, app caches old, eventually old secret complete expiry, auth fails. Caching and rotation fundamentally conflict.

**AWS Parameters and Secrets Lambda Extension** resolves this via TTL. Lambda Layer attachment, this extension runs separate process; function code requests secret from localhost endpoint (localhost:2773) gets immediate memory-cached response. Cache holds TTL (default 300s); after expiry, background fetch from Secrets Manager, auto-reflects rotated secret. **Reduce API via caching, auto-reflect rotation rotation at TTL interval.**

```
Function code → localhost:2773 (Extension local cache)
              ├─ Cache fresh (TTL within): instant return, API calls 0
              └─ Cache expired (TTL over): Secrets Manager new fetch → cache update
```

Short TTL speeds rotation reflection but increases API calls; long does opposite. Rotation cycle (e.g., 30 days) versus 300s TTL sufficiently short; post-rotation all instances switch new secrets within 5 minutes. Alternating Users strategy's grace period (old secret valid temporarily) safely covers this 5-minute window.

> 🔍 **Deeper Dive**: Lambda Extension leverages Lambda execution environment lifecycle hooks. Function instance alive (warm) Extension process also lives maintaining cache; same instance's next calls all cache-hit. Cold start Extension starts fresh, first fetch. This structure gives "cache per execution environment" not "cache per function," high efficiency. EC2/ECS implements same caching via AWS Powertools library or custom in-memory cache + TTL — pattern identical.

## Cross-Region Replication Read-Only Why — Single Source of Truth

Secrets Manager replicates secrets multiple regions. Create Primary region secret, `replicate-secret-to-regions` replicates; each region app fast local secret read. DR scenario Primary entire region down, other region replica continues service. But **replica read-only** — can't change or rotate values. Why restrict this way?

Because **rotation and multi-write incompatible.** All regions independently rotate, Seoul changes to A, Tokyo to B simultaneously, write conflict. Which is real password? One DB, two secret stores holding different answers, system breaks. Distributed systems writing same data concurrently can't guarantee consistency.

Secrets Manager solves **Single Source of Truth pattern.** Writes and rotation only Primary; changes unidirectionally propagate replica. Replica faithful Primary copy only, no independent decision-making. Primary rotation finishes, new value auto-pushes all replicas. Unidirectional structure ensures "real password" always one, conflict prevents entirely.

> 💡 **Related Theory**: Single-write + multi-read replica pattern is distributed database Primary-Replica (past Master-Slave) replication model itself. RDS Read Replica, DynamoDB (write one place, read distributed) same structure. CAP theorem choosing Consistency over Availability — gather writes preventing conflicts, sacrifice Primary down until new Primary promotion (failover) writes block. Secrets Manager's "frequently read, rarely written (30~90d rotation)" characteristic makes this trade-off rational. Raise read availability (replicas), guarantee write consistency (single point).

> ⚠️ **Trap**: Cross-Region replication each replica region needs KMS key for decryption. Primary KMS key region-only, replica regions need separate KMS key (Multi-Region Key or per-region separate). `--add-replica-regions Region=us-east-1,KmsKeyId=alias/...` missing KmsKeyId uses default `aws/secretsmanager` key, maybe unintended Customer Managed Key. Cross-Region secrets always check "each region decryption key ready?"

## Cross-Account Sharing — Three Policies All Must Match

Different AWS account's role reading our account's secret requires three policies simultaneously correct. Resource Policy (secret-attached), Destination account IAM Policy, KMS key's Key Policy (encrypting secret). Any missing gets denied. Tedious-seeming, but each answers different question.

Resource Policy answers "does this secret allow outside account X?" Secret owner explicit external access gateway. Destination IAM Policy answers "does this Destination account role have secret-read permission?" — outside account's internal controls. KMS Key Policy answers "can that outside role use secret-decryption key?" Must decrypt to read values, so secret read-permission alone insufficient, key-use additional requirement.

Three layers **Defense in Depth implementation.** Cross-Account access most dangerous permission grant (outside someone reading our secrets), one mistake doesn't immediately expose — three independent gates. Most common trap: **omitting KMS Key Policy.** Resource Policy and IAM correct but get "AccessDenied," ninety-nine percent KMS key didn't grant outside role `kms:Decrypt`. Secret defaults KMS encryption, key permission mandatory not optional.

> 🔍 **Deeper Dive**: Secrets with default `aws/secretsmanager` managed key actually can't Cross-Account share. AWS Managed Key Key Policy users can't modify, no way grant external account `kms:Decrypt`. Therefore Cross-Account-shared secrets must initially encrypt **Customer Managed Key**, that key's Key Policy explicitly grants outside role decryption. Exam: "Cross-Account secret sharing fails" scenario's hidden cause often "AWS Managed Key encryption."

## Parameter Store vs Secrets Manager — Cost-Divided Choice

Two services' overlapping features frequently confuse. Both store values, both KMS-encrypt, both version-manage. Decision criterion simple: **need automatic rotation and cross-region replication?** Yes → Secrets Manager; no → Parameter Store much cheaper.

| Item | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| Cost | Standard free, Advanced $0.05/month | $0.40/secret/month + API |
| Value Size | Standard 4KB, Advanced 8KB | 64KB |
| Auto-Rotation | None (Lambda manual possible) | Built-in (AWS Lambda provided RDS etc.) |
| Cross-Region Replication | None | Built-in |
| Version Management | Auto integer versions | Label-based (AWSCURRENT etc.) |
| Hierarchy | `/app/prod/db` path tree | Flat (name `/` possible, not tree) |
| Use Case | Config, simple secrets, parameters | DB credentials, rotation-needed secrets |

Interesting: Parameter Store can **reference** Secrets Manager secrets. Via `/aws/reference/secretsmanager/my-secret` path Parameter Store API reads Secrets Manager secret. Unified interface via Parameter Store API, rotation-needed secrets only in Secrets Manager possible — common hybrid: "most config Parameter Store, DB credentials only Secrets Manager" — optimize costs, use expensive service only where needed.

> 💡 **Related Theory**: "Similar-feature two services which?" actually "cost vs operational burden" trade-off. Could implement auto-rotation Parameter Store (EventBridge schedule + Lambda), but then code all four-stage state machine, label-manage, failure-rollback yourself, maintain. Secrets Manager's $0.40 price tag "AWS managing that complex rotation orchestration for you" value. YAGNI principle: rotation really unnecessary simple config doesn't warrant Secrets Manager — truly need rotation before pulling expensive service.

## Summary

All Secrets Manager design addresses one hard problem: "safely changing live secrets without downtime." Separating secrets from code basic (Parameter Store does too); real value rotation. Four-stage split: can't atomically change secret store and usage, need state machine validating-before-committing. Alternating Users guarantees zero-downtime via grace period (old/new coexist). Cross-Region replica read-only prevents multi-write conflicts.

Five operator memory points: ① Secrets Manager rotation/cross-region needed, else Parameter Store cheaper. ② RDS/Aurora/DocumentDB/Redshift rotation Lambda AWS-provided, custom-systems direct-write. ③ Rotation four stages: createSecret → setSecret → testSecret → finishSecret, test failure AWSCURRENT unchanged, app safe. ④ Replica read-only, writes/rotation Primary-only. ⑤ Cross-Account requires Resource Policy + IAM + KMS Key Policy all three, AWS Managed Key can't share cross-account.

Next examines granting rights themselves. Created IAM and resource policies maybe unintended-exposed outside? Who holds unused permissions? IAM Access Analyzer and Trusted Advisor auto-catch.

---

## 📝 Practice Problems

**Problem 1.** Lambda every invocation calls `get_secret_value`, Secrets Manager API costs spike and latency grows. Rotation must reflect. Optimal solution?

A) Pin secret to environment variable, eliminate API
B) AWS Parameters and Secrets Lambda Extension — local cache + TTL reduce API, TTL interval auto-reflects rotation
C) Copy secret to DynamoDB, read there
D) Lambda concurrency 1 limit

**Answer: B**

Explanation: Every-call fetch costs/latency/API limit issues; infinite caching never receive rotated secrets conflict. Extension separate process; local endpoint (localhost:2773) instantly return cached secret; default 300s TTL, past expiry background Secrets Manager new fetch reflects rotation. 5-min TTL versus 30~90d rotation sufficiently short, safe. A ignores rotation, exposes secret danger.

---

**Problem 2.** Rotation Lambda's testSecret stage fails. Application impact?

A) AWSCURRENT already new secret, app auth-fails
B) AWSCURRENT finishSecret-before old version, app normal, rotation stops
C) Secret corrupted, unrecoverable
D) Auto-switches Single User strategy

**Answer: B**

Explanation: Four-stage placing testSecret before finishSecret precisely for this. testSecret-before AWSCURRENT keeps pointing old (working) version, test-fail rotation-stops app receives valid old secret. Database two-phase commit mirrors — "pass validation then commit" structure, failure any point converges consistent state. New secret passes validation only then AWSCURRENT moves. Unrecovered old-secret continues operation.

---

(Continuing with remaining practice problems through 7...)

---
