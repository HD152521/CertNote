# Day 1 - Secrets Manager: Automatic Rotation (Lambda), Parameter Store Comparison, Cross-Account Secrets

A secret is "a credential that leads directly to a breach if exposed." DB passwords, API keys, OAuth tokens, and TLS private keys all belong here. From a security exam perspective, the essence of secret management is not merely "encryption at rest" but *control over the entire lifecycle*. Encryption when stored, IAM authorization when accessed, rotation after use, and a deletion grace period when discarded — you must manage all four stages. AWS Secrets Manager is a service designed to automate this lifecycle.

## Why You Must Not Hardcode Secrets in Code or Environment Variables

Hardcoding secrets in source code, Git repositories, EC2 user data, or container environment variables creates three problems. First, everyone with access to the code sees the secret (a least-privilege violation). Second, rotation is impossible — changing it requires a redeployment. Third, auditing is impossible — you cannot trace who read the secret and when. Secrets Manager solves all three: it envelope-encrypts with KMS, controls access with IAM and resource policies, and records `GetSecretValue` calls in CloudTrail.

Secret management comes down to the *secret zero* problem. It is an infinite regress: "To fetch a secret securely I need another credential, so how do I protect that credential?" AWS cuts this chain with IAM roles — EC2, Lambda, and ECS receive temporary credentials through instance metadata or task roles, and use those temporary credentials to call Secrets Manager. In other words, "machine identity" replaces secret zero. No persistent secret sits on disk.

## How Secrets Actually Leak

The need for secret management did not come from abstract principle but from repeated incidents. Leak paths converge on roughly four.

| Leak path | Typical form | Countermeasure |
|-----------|--------------|----------------|
| Source code and version control | Access keys embedded in Git commits, committed `.env` files | Externalize secrets, commit hooks and repository scanning |
| Build and CI logs | A pipeline prints environment variables straight into logs | Log masking, short-lived credentials via OIDC |
| Instance metadata | SSRF hits the IMDS and steals the role's temporary credentials | Enforce IMDSv2, minimize role permissions |
| Backups and artifacts | Credentials left in DB dumps or container image layers | Rotation, image scanning, no secrets at build time |

The 2019 Capital One breach is the standard textbook case of what happens when the boundary between secrets and machine identity collapses. The attacker exploited an SSRF vulnerability in an application to call the EC2 instance metadata service (IMDSv1), and used the EC2 role's temporary credentials obtained there to read S3 data. There are two lessons. First, removing secrets from code and switching to roles is not enough — you must also block *the path that lets someone extract the role credentials* (SSRF → IMDSv1). Second, if the permissions attached to the role are broad, a single theft spreads to all of the data. This incident is the background to AWS pushing IMDSv2, which requires a session token, afterwards, and to the exam repeatedly asking "SSRF defense = enforce IMDSv2 + least-privilege roles."

A long-standing incident pattern is a long-term AWS access key accidentally committed to a public repository, harvested by automated scanners, and abused immediately. To mitigate this, AWS continuously scans public repositories; when it detects an exposed key, it automatically attaches a managed quarantine policy (from the `AWSCompromisedKeyQuarantine` family) to the account and notifies the owner. However, this is only an after-the-fact safety net. The fundamental responses are two: "never issue long-term access keys in the first place" (roles and OIDC federation) and "move secrets out of the code." The exam also always sets the correct answer for an exposure incident as *rotate the key + remove long-term keys + switch to roles*.

## Secrets Manager's Storage and Encryption Model

Secret values are always stored encrypted with a KMS key. The default is the AWS managed key `aws/secretsmanager`, but what the exam recommends is a **customer managed KMS key (CMK)**. With a CMK, the key policy gives you additional control over "which principals can decrypt this secret," and it becomes mandatory for cross-account sharing.

```bash
aws secretsmanager create-secret \
  --name prod/db/mysql \
  --description "Production MySQL master credentials" \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234 \
  --secret-string '{"username":"admin","password":"P@ssw0rd!","host":"db.internal","port":3306}'
```

Storing the secret value as a JSON structure is the convention — the rotation Lambda and the RDS integration expect standard keys such as `username` and `password`.

### Versions and Staging Labels: A Secret Is Versioned, Not Overwritten

Secrets Manager does not overwrite values. Calling `PutSecretValue` creates a new **version (VersionId)**, and a **staging label** is attached to that version. When an application calls `GetSecretValue` without specifying a label, it receives the version carrying the `AWSCURRENT` label.

```
VersionId: 8f3c...   label: AWSPREVIOUS   ← previous value (basis for comparison and rollback)
VersionId: a91d...   label: AWSCURRENT    ← currently valid value (default lookup target)
VersionId: c5e7...   label: AWSPENDING    ← value awaiting verification during rotation
```

Labels are not fixed to a value; they **move between versions**. When rotation finishes, `AWSCURRENT` moves to the new version and `AWSPREVIOUS` attaches to the old one. Thanks to this structure, if a failure occurs right after rotation, you can narrow down the cause using the previous value as a basis. You can also attach a custom label (for example `CANARY`) yourself so that only some workloads use the new value first.

```bash
# Retrieve the current value (default = AWSCURRENT)
aws secretsmanager get-secret-value --secret-id prod/db/mysql

# Retrieve the previous value — used to compare causes when a failure occurs right after rotation
aws secretsmanager get-secret-value \
  --secret-id prod/db/mysql \
  --version-stage AWSPREVIOUS

# Check the current placement of versions and labels
aws secretsmanager list-secret-version-ids \
  --secret-id prod/db/mysql --include-deprecated
```

The fact that `GetSecretValue` is label-based is directly tied to caching design. If an application pins and caches a specific VersionId, it keeps holding the old value even after rotation happens, and authentication breaks the moment rotation completes and the old credential is invalidated. Conversely, if it looks up by label (`AWSCURRENT`) and sets the cache TTL sufficiently shorter than the rotation interval, rotation propagates to the application naturally. A large share of the operational symptom "rotation is on, but authentication errors pop up periodically" is a mistake on this caching axis, not a problem with the rotation logic itself.

## Access Control: IAM Policy + Resource Policy

Access to Secrets Manager is controlled on two axes. The **identity-based policy** (IAM) defines "what can this principal do to which secrets," and the **resource-based policy** (a policy attached directly to the secret) defines "who can access this secret." Cross-account access always requires a resource policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "AllowAppRoleRead",
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
    "Resource": "arn:aws:secretsmanager:ap-northeast-2:111122223333:secret:prod/db/mysql-*",
    "Condition": {
      "StringEquals": { "aws:PrincipalTag/team": "payments" }
    }
  }]
}
```

> ⚠️ **Pitfall**: Do not forget the 6-character random suffix (`-??????`) at the end of the secret ARN. To distinguish the case where a secret with the same name is deleted and recreated, Secrets Manager appends a 6-character random suffix to the end of the ARN. If you write only `prod/db/mysql` in the IAM policy Resource, it will not match — you need to add a wildcard such as `prod/db/mysql-*` so that it also matches the suffix.

## Automatic Rotation: Four Steps Based on Lambda

Rotation is the core value of Secrets Manager. If secrets are replaced automatically on a schedule, the valid lifetime of a leaked credential becomes short. Rotation is performed by a Lambda function, and AWS provides rotation Lambda templates for RDS, Redshift, and DocumentDB.

The rotation Lambda is invoked in **4 steps**:

```
createSecret  → Generate a new secret value and store it in the AWSPENDING version stage
setSecret     → Actually apply the new credential to the target service (e.g., DB) (ALTER USER, etc.)
testSecret    → Test an actual connection/query using the AWSPENDING credential
finishSecret  → Promote the AWSPENDING stage to AWSCURRENT (the previous CURRENT becomes AWSPREVIOUS)
```

```
[AWSPREVIOUS] ← [AWSCURRENT] ← [AWSPENDING]
 previous value   value in use   new value being rotated
```

These four steps imitate an *atomic swap*. The key is that finishSecret promotes only if testSecret succeeds — traffic is moved only after verifying that the new credential actually works. If setSecret has been applied to the DB but testSecret fails, AWSCURRENT still points to the old value, so the application does not stop. This is the same principle as a Blue/Green cutover in zero-downtime deployment — the traffic cutover is deferred until verification.

### Single-User vs. Alternating-Users Strategy

RDS rotation has two strategies:
- **single-user**: Changes only the password of the same DB user. It is simple, but a short authentication-failure window can occur between the password change and the application's cache refresh. The rotation Lambda rotates itself without using master credentials.
- **alternating-users**: Alternates between two users (for example `app_user_1` and `app_user_2`). During rotation it changes the password of the user that is not in use and then switches, so there is almost no downtime. However, the rotation Lambda must hold **master (superuser) credentials** as a separate secret (refer to `masterarn`).

> 🎯 **Scenario**: "No short authentication errors may occur during RDS password rotation (zero downtime)" is a typical scenario. The answer is the alternating-users strategy, and for it you must connect the master-credential secret to the rotation Lambda. single-user is easy to implement, but depending on the refresh timing a momentary authentication failure is possible.

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/db/mysql \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:111122223333:function:SecretsManagerRDSMySQLRotation \
  --rotation-rules '{"AutomaticallyAfterDays":30}'
```

Because the rotation Lambda must reach a private DB inside the VPC, it is usually placed in **the same VPC as the DB**, and to call the Secrets Manager API it needs **a VPC endpoint (or NAT)**. If this network path is missing, rotation fails with a timeout.

### Rotation Strategy Comparison

| Strategy | Behavior | Master secret reference | Authentication failure window | Suited for |
|----------|----------|------------------------|------------------------------|------------|
| single-user | Replaces the password of the same DB user | Not needed (rotates itself) | Possible (between change and cache refresh) | Batch jobs and internal tools that can tolerate a brief interruption |
| alternating-users | Uses two users alternately, updating the idle one first | **Required** (a superuser changes the other user's password) | Effectively none | Production that requires zero downtime |

alternating-users is not always superior. Because the master (superuser) credentials must be stored as a separate secret, you are effectively *creating one more powerful secret*, and if that secret is compromised the damage is far greater. So in practice the master secret is isolated by encrypting it with a separate CMK and allowing Decrypt only to the rotation Lambda's role. It is a trade-off between "do we need zero downtime" and "can we entrust master credentials to automation."

### Rotation Network Path: Most Failures Happen Here

```
[ Two paths the rotation Lambda needs ]

               ┌─────────────── VPC (private subnet) ────────────────┐
               │                                                     │
               │   Rotation Lambda ──(1) SQL: ALTER USER ...──→ RDS  │
  Secrets      │        │                                            │
  Manager ←────┼────────┘ (2) GetSecretValue / PutSecretValue        │
   API         │        └─→ Interface VPC Endpoint (secretsmanager)  │
               │             or NAT Gateway → via the internet       │
               └─────────────────────────────────────────────────────┘

  Only (1) works and (2) does not → timeout in createSecret/finishSecret
  Only (2) works and (1) does not → DB connection failure in setSecret/testSecret
```

The moment you attach a Lambda to a VPC, its default path to the public internet disappears. That is why forgetting the second path (the Secrets Manager API) is the most common cause of failure. When you use an interface endpoint, the endpoint's security group must allow port 443 from the Lambda ENI, and private DNS must be enabled so that `secretsmanager.<region>.amazonaws.com` resolves to the endpoint.

### How Do You Notice a Rotation Failure

Rotation happens in the background, so even failures are silent. Set up three observation surfaces in advance.

| Observation surface | What it shows | Meaning of the signal |
|---------------------|---------------|----------------------|
| CloudTrail | `RotationSucceeded` / `RotationFailed` events | Success or failure of the rotation attempt itself |
| Lambda CloudWatch logs | In which of the 4 steps the exception occurred | Pinpoints the failing step |
| `DescribeSecret` | `LastRotatedDate` / `NextRotationDate` | The scheduled time has passed but nothing updated = accumulating failures |

```bash
# Check rotation status — view the last rotation time and the rule together
aws secretsmanager describe-secret --secret-id prod/db/mysql \
  --query '{Rotation:RotationEnabled,LastRotated:LastRotatedDate,Next:NextRotationDate,Lambda:RotationLambdaARN}'

# Rotate once immediately regardless of the schedule (for verification)
aws secretsmanager rotate-secret --secret-id prod/db/mysql --rotate-immediately

# Clean up when rotation stalls midway and AWSPENDING is left behind
aws secretsmanager cancel-rotate-secret --secret-id prod/db/mysql
```

> 🎯 **Scenario**: "Rotation was enabled, but the value does not change and only `NextRotationDate` keeps being pushed back. Find the cause" is a typical diagnosis question. The inspection order is fixed — (1) Check `RotationFailed` in CloudTrail to see whether a rotation was attempted at all. (2) Check the Lambda logs to see in which step the exception occurred. (3) If it stopped at `setSecret`/`testSecret`, look at the Lambda→DB direction (security group, subnet routing, DB user permissions); if it stopped at `createSecret`/`finishSecret`, look at the Lambda→Secrets Manager direction (VPC endpoint, private DNS) and the execution role's `secretsmanager:PutSecretValue` and `UpdateSecretVersionStage`, plus KMS `Decrypt`/`GenerateDataKey` permissions. In the end the cause converges on one of two things: **the network path or permissions.**

## Comparison with Parameter Store: When to Use Which

AWS Systems Manager Parameter Store can also store secret values encrypted with KMS as `SecureString`. The exam asks for the selection criteria between the two.

| Item | Secrets Manager | Parameter Store (SecureString) |
|------|-----------------|--------------------------------|
| Automatic rotation | Built in (Lambda integration) | None (must implement yourself) |
| Cross-account sharing | Supports resource policies | Not supported for Standard parameters (limited for Advanced as well) |
| Cost | Monthly fee per secret + API calls | Standard is free, Advanced is paid |
| Size limit | Up to 64KB | Standard 4KB / Advanced 8KB |
| Random password generation | Built-in `GetRandomPassword` | None |
| RDS/Redshift integration | First-class integration | None |
| Use | Real secrets that need rotation or cross-account sharing | Configuration values, simple secrets that need no rotation, non-confidential configuration |

> ⚠️ **Pitfall**: If the requirement is "minimize cost + store a simple API key with no rotation needed," Parameter Store SecureString is the answer. Conversely, if "automatic DB password rotation" or "cross-account secret sharing" is required, it is Secrets Manager. Interestingly, Parameter Store can *reference* a Secrets Manager secret through the `/aws/reference/secretsmanager/{secret-name}` path, so a pattern that uses the two services together is also possible.

## How an Application Picks Up a Secret

The exam does not stop at "the secret was stored"; it asks "how does the runtime fetch it." Each injection method has a different exposure surface.

| Injection method | Behavior | Exposure surface |
|------------------|----------|------------------|
| Call `GetSecretValue` directly via the SDK | The application code looks it up at runtime | Narrowest. The value exists only in process memory |
| The `secrets` field in the ECS task definition | The ECS agent retrieves it and injects it as a container environment variable | Environment variables can be exposed via container metadata and crash dumps |
| Lambda extension (Parameters and Secrets Extension) | The extension serves cached values over a local HTTP endpoint | Narrow. Also improves call count and latency |
| EKS Secrets Store CSI driver | Mounts the secret as a volume file in the pod | Exposure depends on file permissions and node compromise |

Whichever method you use, the common principle is the same. Do not persist the value on disk, do not print it to logs, and keep the cache TTL shorter than the rotation interval.

"It's safe because I injected it as an environment variable" is a common misconception. An environment variable is not an encrypted store in itself but process context, and it can leak through container metadata lookups, crash dumps, and inheritance by child processes. Lambda environment variables are encrypted with KMS at rest but exist in plaintext in the process at run time. The accurate understanding is not "never use environment variables" but the ranking **"better than hardcoding in code, but a wider exposure surface than direct SDK lookup."**

## Cross-Account Secret Sharing

To let a role in account B read a secret in account A, **both** of the following are needed:

1. **Secret resource policy**: Allow the account B principal
2. **KMS key policy**: Allow the account B principal to decrypt with that key — the AWS managed key `aws/secretsmanager` does not allow its key policy to be modified, so it **must be a CMK**

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "CrossAccountRead",
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::444455556666:role/AppReader" },
    "Action": "secretsmanager:GetSecretValue",
    "Resource": "*"
  }]
}
```

You must also allow account B's `kms:Decrypt` in the KMS CMK key policy. The IAM policy of the account B role must also include `secretsmanager:GetSecretValue` and `kms:Decrypt` (the three policies are authorized as an intersection).

> 🎯 **Scenario**: The typical cause of "`AccessDeniedException` (KMS) in account B when sharing a secret cross-account" is that the secret is encrypted with an AWS managed key. A managed key's key policy cannot be edited, so there is no way to allow decryption by an external account. Solution: re-encrypt the secret with a CMK and add account B's Decrypt to the key policy.

```
[ Three gates a cross-account secret lookup must pass ]

Account B role ──GetSecretValue──→ ┌ (1) Account B IAM policy: may this role make the call?
                                   ├ (2) Account A secret resource policy: does it accept this principal?
                                   └ (3) Account A CMK key policy: may this principal decrypt?

  If any one of the three is missing, AccessDenied.
  However, if blocked at (3) the error points to KMS, and if blocked at (1) or (2) it points to Secrets Manager.
  ▶ Which service the error message points to is the first clue for diagnosis.
```

### Widening to the Organization Level: `aws:PrincipalOrgID`

A resource policy that enumerates accounts one by one must be edited every time an account is added. If you use Organizations, bind them all at once with an organization ID condition, and at the same time lock down access from outside the organization and non-TLS access with a Deny.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOrgReadOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "aws:PrincipalOrgID": "o-abcd1234ef" }
      }
    },
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "secretsmanager:*",
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

This form, which ties `Principal: "*"` to the organization through a condition, means "if the principal is inside the organization, and if its own account's IAM policy allows it." Do not misread it as a public policy just because you see `Principal: "*"` — authorization is decided jointly by the `Condition` and the requester account's IAM policy. Conversely, `Principal: "*"` with no condition is genuinely dangerous.

### Multi-Region Replication

If you replicate a secret to another Region with `ReplicateSecretToRegions`, the replica automatically follows when the primary Region's value changes. In a Region outage, the replica can be promoted to a standalone secret. Because the replica is re-encrypted with a KMS key in the destination Region, the destination Region also needs a corresponding CMK and its key policy.

```bash
aws secretsmanager replicate-secret-to-regions \
  --secret-id prod/db/mysql \
  --add-replica-regions \
    Region=ap-southeast-1,KmsKeyId=arn:aws:kms:ap-southeast-1:111122223333:key/wxyz-9876
```

You do not configure rotation separately on a replica. Rotation is performed only on the **primary Region secret**, and the result propagates to the replicas. An option saying "configure rotation independently in each Region" is wrong. Also, a replica is only a read target, so a design that tries `PutSecretValue` directly on a replica is also wrong.

## Deletion Grace Period and Recovery

`DeleteSecret` is not an immediate deletion; it places a **7 to 30 day recovery window** (30 days by default). During this period you can recover with `RestoreSecret`. It is a safeguard against accidental or malicious deletion. If immediate deletion is truly necessary, use `--force-delete-without-recovery`, but on the exam the default grace period is recommended for "preventing accidental deletion."

Secrets Manager has an automatic caching client library, so the application does not hit `GetSecretValue` on every call; it caches in memory and refreshes only when rotation occurs. This improves both cost (billed per API call) and availability (it keeps working with the cached value even during a Secrets Manager outage). The key is to set the cache TTL shorter than the rotation interval — only then does it pick up the rotated new credentials in time.

## Reading Secret Access from Logs

`GetSecretValue` is recorded by default as a CloudTrail **management event** (you do not need to enable a separate data event as with S3 object reads). The items to read from a single event are fixed.

```
eventName        : GetSecretValue           ← what was done
userIdentity     : AssumedRole + session name ← who (which role, which session)
sourceIPAddress  : 10.0.3.11 / public IP    ← from where
requestParameters.secretId                   ← which secret
errorCode        : AccessDeniedException     ← if it failed, why (if absent, it succeeded)
```

An investigator asks three questions of this event. (1) Is this role a principal that normally reads this secret — if not, it is a sign of privilege expansion. (2) Is `sourceIPAddress` the usual workload range — if it is a developer laptop or an unfamiliar public IP, suspect credential theft. (3) Is this a pattern of sweeping many secrets in a short time — this is typical of the credential harvesting stage after a breach.

If always-on monitoring with CloudTrail alone is hard, turn on GuardDuty. GuardDuty learns from CloudTrail events and raises "API calls from an unusual principal or location" as anomalous behavior. Routing those findings through EventBridge into automated response (invalidating the session, immediately rotating the relevant secret) is the standard wiring.

> 🎯 **Scenario**: When "There are signs that a developer account has been compromised. What is the immediate response order for secrets?" appears, the answer has an order — (1) Block the permissions of the suspected principal (modify the role trust policy, invalidate sessions), (2) **Immediately rotate** every secret that may have been exposed (`rotate-secret --rotate-immediately`), (3) Use CloudTrail to establish which secrets were actually read and narrow the blast radius, (4) Forcibly terminate the existing sessions of the target service (DB, etc.). "Delete the secret" is the wrong answer. Because of the recovery window, deletion has no immediate effect and only stops the application. **The antidote to a leaked credential is rotation, not deletion.**

## Summary

Secret management is not "encrypting it and putting it somewhere," but **automating the lifecycle of creation, distribution, rotation, auditing, and disposal**. Secrets Manager earns its price with two capabilities, rotation (Lambda 4 steps) and cross-account sharing (resource policy + CMK key policy), and if you need neither, Parameter Store SecureString is the cheaper and simpler correct answer. The fork on the exam always boils down to the same three questions — *Do you need rotation, is it cross-account, is cost the priority?*

---

## 📝 Practice Questions

**Question 1.** You want to automatically rotate the RDS MySQL master password, but not a single authentication failure may occur during rotation. What is the most appropriate rotation strategy?

A) Single-user rotation - replace only the same user's password  
B) Alternating-users rotation - alternate between two users and connect the master credentials secret to the rotation Lambda  
C) Disable rotation and rotate manually every quarter  
D) Move to Parameter Store SecureString and then rotate  

**Answer: B**  
Explanation: The alternating-users strategy first changes the password of the user that is not currently in use and then switches over, so there is effectively no authentication failure window. For this, the rotation Lambda must reference the superuser (master) credentials as a separate secret. Single-user can cause momentary failures between the password change and the cache refresh, manual rotation conflicts with the automation requirement, and Parameter Store has no automatic rotation feature at all.

---

**Question 2.** When an IAM role in Account B tries to read a secret in Account A, a KMS-related `AccessDeniedException` occurs. The secret is encrypted with the `aws/secretsmanager` managed key. What is the correct action?

A) Just adding `secretsmanager:GetSecretValue` to the Account B role is enough  
B) Encrypt the secret with a customer managed KMS key (CMK) and allow kms:Decrypt for Account B in that key's policy  
C) Extend the secret recovery window  
D) Replicate the secret to Account B  

**Answer: B**  
Explanation: Cross-account decryption requires all three: the secret resource policy, the KMS key policy, and the Account B IAM policy. The AWS managed key `aws/secretsmanager` has a key policy that cannot be edited, so there is no way to grant Decrypt to an external account. Therefore you must re-encrypt with a CMK and add kms:Decrypt for the Account B principal to the key policy. GetSecretValue alone is blocked at the decryption step, and the recovery window or replication is irrelevant.

---

**Question 3.** Among the four steps of the rotation Lambda, which mechanism guarantees that the new credentials are promoted to the current version only after being verified to actually work?

A) createSecret immediately updates AWSCURRENT  
B) testSecret verifies the connection with the AWSPENDING credentials, and only if it succeeds does finishSecret promote AWSPENDING to AWSCURRENT  
C) setSecret performs verification and promotion at the same time  
D) finishSecret promotes first and then testSecret verifies afterward  

**Answer: B**  
Explanation: Rotation proceeds in the order createSecret (create new, AWSPENDING) → setSecret (apply to the target) → testSecret (actually verify with AWSPENDING) → finishSecret (promote). Only if testSecret succeeds does finishSecret raise AWSPENDING to AWSCURRENT. If verification fails, AWSCURRENT keeps the old value, so the application does not stop. createSecret/setSecret do not promote, and promoting before verification would break the zero-downtime guarantee.

---

**Question 4.** You need no rotation and want to minimize cost while storing a single simple API key encrypted with KMS. What is the most appropriate service?

A) Secrets Manager - use it with rotation turned off  
B) A Parameter Store SecureString parameter (Standard tier)  
C) Store it as an S3 object with SSE-KMS  
D) Store it in plaintext in a DynamoDB item  

**Answer: B**  
Explanation: When rotation and cross-account sharing are unnecessary and cost is the priority, a Parameter Store SecureString (Standard tier, free) is optimal. It stores the value encrypted with KMS and controls access with IAM. Secrets Manager charges a monthly fee per secret, which is excessive for simple storage, and S3/DynamoDB have no secret-specific lifecycle features. Storing plaintext in DynamoDB is inappropriate from a security standpoint.

---

**Question 5.** Even though the IAM policy `Resource` is specified exactly as `arn:aws:secretsmanager:...:secret:prod/db/mysql`, `GetSecretValue` is denied. What is the most likely cause?

A) The 6-character random suffix at the end of the secret ARN does not match - you must add a wildcard such as `prod/db/mysql-*`  
B) The KMS key was disabled  
C) The secret is pending recovery  
D) The name conflicts with Parameter Store  

**Answer: A**  
Explanation: Secrets Manager appends `-` plus 6 random characters to the end of the ARN to distinguish when a secret with the same name is deleted and recreated. If the policy Resource uses only the exact name without the suffix, it does not match the actual ARN and is denied. You must include the suffix, as in `prod/db/mysql-*` or `prod/db/mysql-??????`. A disabled KMS key causes a different error at the decryption step, and pending recovery or a name conflict is not the cause of this symptom.

---
