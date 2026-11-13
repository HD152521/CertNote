# Day 2 - Secrets Manager: How to Change the Passwords of a Living System Without Downtime

Changing a password is easy. You go into the console, type the new password, save it, and you're done. But if the application using that password runs 24 hours a day, the story is completely different. In the instant you change the password, dozens of app servers that cached the old password all spit out authentication failures at once. That is why the seemingly simple operational task of "password rotation" is actually one of the trickiest concurrency problems in distributed systems.

The reason Secrets Manager exists is not merely to be "a vault that stores secrets safely." Parameter Store SecureString does that too. The reason Secrets Manager charges $0.40 a month, far more than Parameter Store, is **the orchestration that rotates the secrets of a living system without downtime**. This post follows the reasons behind these designs: why rotation is split into 4 steps, why the strategy of alternating two users guarantees zero downtime, and why multi-Region replication is read-only.

## Pulling Secrets Out of Code: The Real Problem Secrets Manager Solves

Incidents where AWS keys are found in code pushed to GitHub still happen every day. GitGuardian's annual report counts millions of hardcoded secrets exposed in public repositories every year. The practice of embedding passwords, API keys, and tokens in source code or configuration files is the root of the incidents. Once a secret is committed, it stays in the git history forever and is copied onto the disk of everyone who forked the repository.

Secrets Manager pulls secrets completely out of the code. The application knows only the **name of the secret** (`prod/web/db-password`) instead of the password, and fetches the actual value through the API at runtime. The secret is not in the code, not in git, and not in a configuration file. The secret is encrypted with KMS and exists only in Secrets Manager, who can read it is controlled with IAM, and who read it and when is audited with CloudTrail.

Up to here, Parameter Store SecureString does the same. The decisive difference comes next: **secrets are not static.** Security best practice says to change passwords periodically (90-day rotation is a common compliance requirement). A static secret store pushes the job of "changing" onto people, but Secrets Manager automates that rotation. This is the core of the price difference, and "is rotation needed?" is the deciding criterion that separates the two services.

The principle of separating secrets from code was codified in the third factor, "Config in the environment," of the Twelve-Factor App methodology established in 2011. The core claim is "strictly separate code and config (especially secrets), because the same code must run with different secrets in different environments (development, staging, production)." If you keep secrets in environment variables or an external store, you can deploy the same code image to every environment, and if a secret is exposed you can replace just the secret without redeploying code. Secrets Manager raises this principle one level safer than "environment variables," into a dedicated service with encryption, auditing, and automatic rotation attached.

## Why Rotation Is Split into 4 Steps: A Secret That Can't Be Changed Atomically

If you think of password rotation as a single action, you fall into a trap. "Change the DB password to the new one, and also store the new one in Secrets Manager." The problem is that these two operations cannot happen at the same time. If you change the DB first, Secrets Manager still holds the old secret, so the app fails authentication, and if you change Secrets Manager first, the DB still has the old secret, so authentication with the new value fails. An atomic update is impossible between two distributed systems (the secret store and where the secret is used).

The splitting of Secrets Manager's rotation Lambda into 4 steps is a state machine for handling this non-atomicity safely. Each step runs as a separate Lambda invocation, and version labels (`AWSCURRENT`, `AWSPENDING`, `AWSPREVIOUS`) track how far it has progressed.

```
1. createSecret  : Generate a new password and store it with the AWSPENDING label
                   (not yet applied to the DB, the app still uses AWSCURRENT)
2. setSecret     : Apply the new password in AWSPENDING to the actual DB
                   (now the DB accepts the new password)
3. testSecret    : Try a DB connection with the AWSPENDING password to verify
                   (if it fails, stop here; AWSCURRENT is unchanged, so the app is safe)
4. finishSecret  : Move the AWSCURRENT label to the version AWSPENDING pointed to
                   (the old version is demoted to AWSPREVIOUS)
```

The key to this 4-step separation is that **if the verification in step 3 fails, the whole rotation stops safely**. Since the AWSCURRENT label keeps pointing to the old version to the end, even if the rotation breaks midway the application still receives the old, working secret. If rotation were only two steps, "change the DB → change the store," the moment the DB changed but the store update failed, the entire system would fall into being unable to authenticate. The 4 steps + label tracking is a kind of transaction imitation designed to converge to a consistent state no matter where it fails.

The 4-step rotation resembles the idea of a database transaction's Two-Phase Commit (2PC). 2PC is a protocol in which "in the prepare phase all participants promise they can commit, and only then is the actual commit made," preventing partial failure where only some commit. In Secrets Manager, createSecret/setSecret/testSecret play the "prepare" role and finishSecret plays the "commit" role: only after passing testSecret is AWSCURRENT moved. It is not true 2PC (there is no distributed transaction coordinator), but it shares the core safety of "verify and then commit." The AWSPENDING label corresponds to 2PC's "prepared but not committed" state.

For RDS, Aurora, DocumentDB, and Redshift, AWS provides the rotation Lambda off the shelf: the 4 steps above are already implemented for each DB engine, so users don't need to write a single line of code. For your own systems (legacy APIs, tokens of third-party SaaS, and so on), by contrast, you must write a Custom Rotation Lambda that implements the 4-step interface yourself. AWS provides a skeleton template for this Lambda (SAR, Serverless Application Repository), so you only need to fill in the bodies of the createSecret to finishSecret functions to fit the target system. On the exam, "Do I have to write the RDS password rotation Lambda myself?" is a trap: RDS is provided by AWS, and only your own systems require writing it yourself.

## Single User vs. Alternating Users: The Real Secret of Zero Downtime

There is one more subtle risk hidden in the 4-step rotation. It is **the gap between setSecret (applying the new secret to the DB) and finishSecret (moving AWSCURRENT)**. There is a brief moment when the DB password has already been changed to the new one by setSecret but finishSecret hasn't run yet, so AWSCURRENT still points to the old secret. An app that fetches the secret anew at this moment receives the old secret and fails authentication. The Single User strategy cannot completely eliminate this gap.

The **Single User strategy** changes the single password of one DB account in place. It is simple, but brief authentication failures can occur during the gap above and until apps refresh their caches. Most apps have connection retry logic, so it is not a big problem in practice, but it falls short when strict zero downtime is required.

The **Alternating Users strategy** solves this problem elegantly. You keep **two** accounts in the DB (for example `app_user` / `app_user_clone`) and rotate them in turn. When rotating, you change the password of the account that is **not** currently in use, and when verification finishes you move AWSCURRENT to that account. During the rotation, **the account being rotated is not used by anyone**.

```
Before rotation:  AWSCURRENT → app_user (in use by the apps)
During rotation:  Set a new password for app_user_clone (app_user is untouched)
                  → verify the connection with app_user_clone (apps using app_user are safe)
After rotation:   AWSCURRENT → app_user_clone (new fetches now use the clone)
                  → at the next rotation, update app_user (this time the clone is in use)
```

The old account's (`app_user`) password remains valid for a while, so even apps that haven't yet refreshed their cache keep working normally for a time right after rotation. Then they naturally move to the new secret. **This is real zero downtime**: at the moment of rotation, no app meets a "just invalidated secret." The price is the operational complexity of managing two DB accounts.

Why zero-downtime rotation is hard is testified by the major outages that secret rotation caused. In 2020, Microsoft Teams went down worldwide for several hours when a TLS certificate used for authentication expired: it was a failure of lifecycle management of a secret (a certificate). Certificates and passwords are assets that "must be changed someday, and the moment of change is the riskiest." The Alternating Users pattern absorbs the risk of this transition by providing "a grace period in which the old secret and the new secret coexist for a while." The same idea is used in certificate rotation: deploy the new certificate first to have a period when both are valid, then retire the old certificate afterward.

> ⚠️ **Trap**: To use the Alternating Users strategy, the rotation Lambda must connect to the DB with "master credentials" and have permission to change the password of the other account. That is, you must keep a separate secret for the rotation Lambda (`masterarn`) and link this master secret to the secret being rotated. If you omit this master link, the rotation Lambda can't change the other account's password and the rotation fails. Single User only needs to change its own password, so it needs no master; this difference separates the setup complexity of the two strategies.

## Lambda Extension Caching: Reflecting Rotation Without Hammering the API

When you look at your Secrets Manager bill, API calls ($0.05 per 10,000) sometimes account for a surprisingly large share. The cause is usually **code that fetches the secret on every request**. If a Lambda function calls `get_secret_value` on every invocation, a function invoked thousands of times a second hits the API thousands of times a second. Cost is a problem, but latency also increases, and you may hit the Secrets Manager API limit (calls-per-second limit).

The obvious solution is caching. Just keep the fetched secret in memory and reuse it. But there is a trap here that conflicts with rotation: **if you cache indefinitely, you never receive the rotated new secret.** The secret is rotated, but the app keeps using the old secret it cached, and at some point when the old secret is fully invalidated, authentication fails. Caching and reflecting rotation are inherently in conflict.

The **AWS Parameters and Secrets Lambda Extension** resolves this conflict with a TTL. This extension, attached as a Lambda Layer, runs as a separate process, and when the function code requests a secret from the local HTTP endpoint (`localhost:2773`), it returns it immediately from the in-memory cache. The cache has a TTL (default 300 seconds), and once that time has passed, the next request fetches anew from Secrets Manager in the background. It **reduces API calls through caching while automatically reflecting the rotated secret on the TTL cycle**.

```
Function code → localhost:2773 (the Extension's local cache)
              ├─ Cache fresh (within TTL): return immediately, 0 API calls
              └─ Cache expired (TTL exceeded): fetch anew from Secrets Manager → refresh the cache
```

A short TTL reflects rotation quickly but increases API calls, and a long one is the opposite. Compared with the rotation period (for example, 30 days), a 300-second TTL is short enough that after rotation all instances move to the new secret within at most 5 minutes. The grace period of the Alternating Users strategy (the old secret staying valid for a while) safely covers these 5 minutes.

The Lambda Extension makes use of the lifecycle hooks of the Lambda execution environment. While the function instance is alive (warm), the Extension process stays alive too and maintains the cache, so all subsequent invocations on the same instance are cache hits. The Extension starts anew and the first fetch happens only on a cold start. Thanks to this structure it is a "cache per execution environment" rather than a "cache per function," so efficiency is high. On EC2/ECS, the same caching is implemented with the AWS Powertools library or your own in-memory cache + TTL; the pattern is the same.

## Why Cross-Region Replication Is Read-Only: A Single Source of Truth

Secrets Manager can replicate secrets to multiple Regions. If you create a secret in the Primary Region and replicate it with `replicate-secret-to-regions`, apps in each Region read the secret quickly and locally. In a DR scenario, even if the Primary Region goes down entirely, you can continue service from the replicas in other Regions. But **a replica is read-only**: you cannot change or rotate the secret value on a replica. Why was this constraint put in place?

The reason is **that rotation and multiple write points are incompatible**. If the secret could be rotated independently in every Region, a write conflict would arise: changing the password to A in Seoul and at the same time to B in Tokyo. Which one is the real password? There is one DB, and if the secret stores hold two different answers, the system breaks. In a distributed system, when the same data is written in several places at once, consistency can't be guaranteed.

Secrets Manager solves this problem with the **Single Source of Truth** pattern. Writes and rotation happen only on the Primary, and changes propagate one-way to the replicas. A replica is just a faithful copy of the Primary and makes no independent judgment. When rotation finishes on the Primary, the new value is automatically pushed to all replicas. Thanks to this one-way structure, there is always only one "correct password," and conflicts are blocked at the source.

The single write point + multiple Read Replicas pattern is the Primary-Replica (formerly Master-Slave) replication model of distributed databases itself. RDS Read Replicas and DynamoDB (writes in one place, reads distributed) use the same structure. This model is a choice that prioritizes Consistency over availability in the CAP theorem: in exchange for gathering writes in one place to eliminate conflicts, if the Primary dies, writes are blocked until a new Primary is promoted (failover). Because secrets have the character of being "read often but written rarely (rotation period 30 to 90 days)," this trade-off is reasonable. It raises read availability (replicas) and guarantees write consistency through a single point.

> ⚠️ **Trap**: With Cross-Region replication, each replica Region needs a KMS key to decrypt the secret. The Primary's KMS key exists only in that Region, so for replica Regions you must specify a separate KMS key (a Multi-Region Key or a separate per-Region key). If you omit KmsKeyId in `--add-replica-regions Region=us-east-1,KmsKeyId=alias/...`, that Region's default `aws/secretsmanager` key is used, which may conflict with the intent of encrypting with a Customer Managed Key. For a Cross-Region secret, you must always check together "is the decryption key in each Region ready?"

## Cross-Account Sharing: Why All Three Policies Must Be Right

For a role in another AWS account to read a secret in our account, three policies must be right at the same time: the Resource Policy (the policy attached to the secret), the Destination account's IAM Policy, and the Key Policy of the KMS key that encrypted the secret. If even one is missing, access is denied. This looks cumbersome, but each answers a different question.

The Resource Policy answers "does this secret allow external account X?" It is the gate by which the secret owner explicitly opens external access. The Destination IAM Policy answers "within account X, does this role have permission to read the secret?", which is permission control inside the external account. The KMS Key Policy answers "can that external role use the key to decrypt the secret?" Since reading the secret value requires decrypting it, permission to read the secret alone is not enough, and permission to use the key is additionally needed.

These three layers are an implementation of **Defense in Depth**. Cross-Account access is one of the riskiest permission grants (someone outside our account reads our secrets), so three independent gates are placed so that a mistake in one place doesn't immediately lead to exposure. The classic trap is **omitting the KMS Key Policy**: if you got the Resource Policy and IAM right but "AccessDenied" appears, nine times out of ten it's because the KMS key doesn't allow the external role's `kms:Decrypt`. Since secrets are KMS-encrypted by default, key permission is not optional but mandatory.

A secret encrypted with the default `aws/secretsmanager` managed key actually cannot be shared Cross-Account. This is because for an AWS Managed Key the user can't modify the Key Policy, so there is no way to grant `kms:Decrypt` to an external account. Therefore a secret to be shared Cross-Account must be encrypted with a **Customer Managed Key** from the start, and the external role's decryption permission must be stated explicitly in that key's Key Policy. On the exam, the hidden cause of a scenario like "Cross-Account secret sharing doesn't work" is often "because it was encrypted with an AWS Managed Key."

## Parameter Store vs. Secrets Manager: A Choice Split by Cost

The two services look like their features overlap, so they are often confused. Both store values, both encrypt with KMS, and both manage versions. The deciding criterion is simple: **do you need automatic rotation and Cross-Region replication?** If so, Secrets Manager; otherwise, Parameter Store is much cheaper.

| Item | Parameter Store | Secrets Manager |
|------|-----------------|-----------------|
| Cost | Standard is free, Advanced $0.05/month | $0.40/secret/month + API |
| Value size | Standard 4KB, Advanced 8KB | 64KB |
| Automatic rotation | None (can be implemented yourself with Lambda, but unmanaged) | Built in (AWS-provided Lambda for RDS, etc.) |
| Cross-Region replication | None | Built in |
| Version management | Automatic integer versions | Label-based (AWSCURRENT, etc.) |
| Hierarchy | `/app/prod/db` path tree | Flat (names can contain `/` but it isn't a tree) |
| Use cases | Settings, simple secrets, parameters | DB credentials, secrets that need rotation |

An interesting point is that Parameter Store can **reference** Secrets Manager secrets. You can read a Secrets Manager secret through the Parameter Store API at the path `/aws/reference/secretsmanager/my-secret`. So a mixed pattern is possible in which code uses a unified interface of a single Parameter Store API while only the secrets that need rotation are kept in Secrets Manager. In practice, "most settings in Parameter Store, only DB credentials in Secrets Manager" is common: optimize cost while using the expensive service only where rotation is needed.

"Which of the two services with similar features should I use" is actually a trade-off question of cost vs. operational burden. You can implement automatic rotation yourself in Parameter Store (EventBridge schedule + Lambda), but then you have to write and maintain the 4-step state machine, label management, and failure rollback seen above yourself. Secrets Manager's $0.40 is "the price for AWS to manage that complex rotation orchestration for you." In line with the YAGNI (You Aren't Gonna Need It) principle, using Secrets Manager for simple settings that truly don't need rotation is overkill: it is cost-efficient to pull out Secrets Manager only when the requirement for rotation actually exists.

## Summary

Every design of Secrets Manager converges on one hard problem: "safely change a living secret." Pulling secrets out of code is the basics (Parameter Store does that too), and the real value lies in rotation. Rotation is split into 4 steps because the secret store and the place of use can't be changed atomically, so a state machine that verifies and then commits is needed; the Alternating Users strategy guarantees zero downtime with a coexistence period of the old and new secrets; and Cross-Region replicas are read-only to block multi-write conflicts at the source.

The five things for an operator to remember: ① Secrets Manager when you need rotation or Cross-Region, otherwise Parameter Store is cheaper. ② Rotation Lambdas for RDS, Aurora, DocumentDB, and Redshift are provided by AWS, and only your own systems require writing one. ③ The 4 rotation steps are createSecret → setSecret → testSecret → finishSecret, and if verification fails AWSCURRENT is unchanged so the app is safe. ④ Replicas are read-only, and rotation and writes happen only on the Primary. ⑤ Cross-Account needs all three of Resource Policy + IAM + KMS Key Policy to be right, and Cross-Account sharing is impossible with an AWS Managed Key.

In the next post we move on to tools that inspect the permissions themselves. Are the IAM policies and resource policies we've created exposed externally contrary to intent, and who holds permissions they don't use? IAM Access Analyzer and Trusted Advisor catch these automatically.

---

## 📝 Practice Questions

**Question 1.** A Lambda function calls `get_secret_value` on every invocation, and Secrets Manager API cost and latency have surged. Rotated secrets must also be reflected. What is the best solution?

A) Embed the secret in an environment variable to eliminate API calls
B) The AWS Parameters and Secrets Lambda Extension: reduces API calls with a local cache + TTL while automatically reflecting rotation on the TTL cycle
C) Copy the secret into DynamoDB and read it from there
D) Limit Lambda concurrency to 1

**Answer: B**

Explanation: Fetching on every invocation causes cost, latency, and API limit problems, but indefinite caching has the conflict of never receiving a rotated secret. The Lambda Extension runs as a separate process and immediately returns the cached secret from a local endpoint (localhost:2773), and once the default 300-second TTL passes it fetches anew in the background to reflect rotation. Compared with the rotation period (30 to 90 days), a 5-minute TTL is short enough to be safe. A can't reflect rotation and carries a high risk of secret exposure.

---

**Question 2.** Among the 4 steps of the rotation Lambda, testSecret failed. What is the effect on the application?

A) AWSCURRENT has already changed to the new secret, so the app fails authentication
B) AWSCURRENT points to the old version until finishSecret, so the app works normally and only the rotation stops
C) The secret is corrupted and cannot be recovered
D) It automatically switches to the Single User strategy

**Answer: B**

Explanation: This is exactly why the 4-step rotation places verification (testSecret) before finishSecret. Up to testSecret, the AWSCURRENT label keeps pointing to the old (working) version to the end, so even if verification fails and the rotation stops, the application still receives the valid old secret. Like a database two-phase commit, it is a structure in which "only after passing verification does it commit (finishSecret)," so it converges to a consistent state wherever it fails. If the new secret doesn't pass verification, operation continues with the old secret as is.

---

**Question 3.** There is a strict zero-downtime requirement under which not a single authentication failure is allowed even at the moment of password rotation. Which rotation strategy is suitable?

A) Single User: it is simple and therefore safest
B) Alternating Users: keep two DB accounts and rotate the one not in use, guaranteeing zero downtime with a grace period in which the old and new secrets coexist
C) Turn off rotation and change it only manually
D) Cross-Region Replication

**Answer: B**

Explanation: With Single User, brief authentication failures can occur in the gap between setSecret and finishSecret and until caches are refreshed. Alternating Users keeps two accounts (app_user / app_user_clone) and rotates the account not currently in use, so the account being rotated is not used by anyone during the rotation. The old account's password stays valid for a while, so even apps that haven't yet refreshed their cache work normally: this coexistence grace period creates true zero downtime. The price is managing two DB accounts and setting up master credentials.

---

**Question 4.** You tried to rotate the password directly on a replica secret created by Cross-Region Replication, but it was denied. Why?

A) Insufficient IAM permissions
B) A replica is read-only: writes and rotation are possible only on the Primary, a single-source-of-truth design to prevent multi-write conflicts
C) Because there is no KMS key
D) A replica becomes writable only after 30 days

**Answer: B**

Explanation: If rotation were independent in every Region, a write conflict of changing to A in Seoul and to B in Tokyo would arise, making it ambiguous what the "real password" is. Secrets Manager prevents this with the Single Source of Truth pattern, which gathers writes and rotation on the Primary in one place and propagates changes one-way to the replicas. It is a Primary-Replica replication model like RDS Read Replicas and DynamoDB, and it is a reasonable trade-off given that secrets are read often and written rarely.

---

**Question 5.** A role in another account (222233334444) must read a secret encrypted with a Customer Managed Key in our account. What settings are all needed?

A) Only the secret's Resource Policy
B) The secret's Resource Policy + the Destination account's IAM Policy + allowing the external role's Decrypt in the KMS Key Policy
C) Only the Destination account's IAM Policy
D) VPC Peering

**Answer: B**

Explanation: Cross-Account secret reading must pass all three gates: the Resource Policy ("does this secret allow the external account?"), the Destination IAM Policy ("within the external account, does this role have permission to read?"), and the KMS Key Policy ("can that role use the decryption key?"). Since secrets are KMS-encrypted by default, decryption permission is mandatory. The most common mistake is omitting the KMS Key Policy. Also, with an AWS Managed Key (`aws/secretsmanager`) the Key Policy can't be modified, so Cross-Account sharing itself is impossible, and you must encrypt with a Customer Managed Key from the start.

---

**Question 6.** You manage 200 application settings and 5 DB credentials. You want to automatically rotate only the DB credentials while minimizing cost. What is the best configuration?

A) Store everything in Secrets Manager
B) The 200 settings in Parameter Store (mostly free), and only the 5 DB credentials that need rotation in Secrets Manager
C) Store everything in Parameter Store and give up on rotation
D) Manage everything with environment variables

**Answer: B**

Explanation: Secrets Manager costs $0.40 per secret per month, and Parameter Store Standard is free. It is cost-efficient to use Secrets Manager only when automatic rotation or Cross-Region is needed and Parameter Store otherwise (putting 200 settings in Secrets Manager would be $80 a month). Putting only the 5 DB credentials in Secrets Manager automates rotation at a cost of about $2 a month. Parameter Store can also reference Secrets Manager secrets through the `/aws/reference/secretsmanager/` path, which is also good for unifying the interface. In line with the YAGNI principle, use the expensive service only where rotation is actually needed.

---

**Question 7.** You want to automatically rotate the master password of an RDS MySQL every 30 days. Do you have to write the rotation Lambda yourself?

A) Yes, you must implement all 4 steps createSecret to finishSecret yourself
B) No, AWS provides rotation Lambdas off the shelf for RDS, Aurora, DocumentDB, and Redshift, so you only specify that Lambda ARN and the interval in `rotate-secret`
C) RDS does not support automatic rotation
D) It is possible only with Parameter Store

**Answer: B**

Explanation: AWS provides rotation Lambdas off the shelf for RDS/Aurora/DocumentDB/Redshift (for both the Single User and Alternating Users strategies). The 4-step state machine is already implemented for each DB engine, so users don't need to write code: you just specify the Lambda ARN and `AutomaticallyAfterDays=30` in `rotate-secret`. Writing it yourself is needed only for your own systems where AWS provides no ready-made Lambda, such as legacy APIs and third-party SaaS tokens, and even then AWS provides a skeleton template.

---
