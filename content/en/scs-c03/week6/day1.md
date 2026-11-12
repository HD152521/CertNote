# Day 1 - Secrets Manager: Automatic Rotation (Lambda), Parameter Store Comparison, Cross-Account Secrets

A secret is "a credential that leads directly to a breach if exposed." This includes DB passwords, API keys, OAuth tokens, and TLS private keys. From a security exam perspective, the essence of secret management is not merely "encryption at rest" but *full lifecycle control*. Encryption during storage, IAM authorization on access, rotation after use, and deletion during discard — you must manage all four stages. AWS Secrets Manager is a service designed to automate this lifecycle.

## Why Hardcoding Secrets in Code/Environment Variables Is Wrong

Hardcoding secrets in source code, Git repositories, EC2 user data, or container environment variables creates three problems. First, everyone with code access sees the secret (least privilege violation). Second, rotation is impossible — you must redeploy to change it. Third, auditing is absent — you cannot track who accessed the secret or when. Secrets Manager solves all three: it encrypts with KMS envelope encryption, controls access via IAM/resource policies, and logs `GetSecretValue` calls to CloudTrail.

> 💡 **Related Theory**: Secret management ultimately reduces to the *secret zero* problem. "To securely retrieve a secret, I need another credential—how is that credential protected?" This is infinite regression. AWS breaks this with IAM roles — EC2/Lambda/ECS receive temporary credentials from instance metadata or task roles, which they then use to call Secrets Manager. In other words, "machine identity" replaces secret zero. There is no persistent secret on disk.

## Secrets Manager's Storage and Encryption Model

Secret values are always encrypted with a KMS key at rest. The default is the AWS-managed key `aws/secretsmanager`, but the exam-recommended approach is a **customer-managed KMS key (CMK)**. Using a CMK allows you to further control via key policy "which principals can decrypt this secret," and it becomes mandatory for cross-account sharing.

```bash
aws secretsmanager create-secret \
  --name prod/db/mysql \
  --description "Production MySQL master credentials" \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234 \
  --secret-string '{"username":"admin","password":"P@ssw0rd!","host":"db.internal","port":3306}'
```

Secret values are conventionally stored as JSON structures — rotation Lambdas and RDS integration expect standard keys like `username` and `password`.

## Access Control: IAM Policy + Resource Policy

Secrets Manager access is controlled on two axes. **Identity-based policies** (IAM) define "what can this principal do to which secrets," while **resource-based policies** (policies attached directly to the secret) define "who can access this secret." Cross-account access requires a resource policy.

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

> ⚠️ **Pitfall**: Do not forget the 6-character random suffix at the end of the secret ARN. Secrets Manager appends a 6-character random suffix to the ARN to distinguish between deletion and recreation of secrets with the same name. If an IAM policy Resource specifies only `prod/db/mysql`, it won't match — you must use a wildcard like `prod/db/mysql-*` to include the suffix.

## Automatic Rotation (Rotation): Lambda-Based 4-Step Process

Rotation is the core value of Secrets Manager. If secrets are automatically rotated periodically, the effective lifetime of a leaked credential becomes very short. Rotation is performed by a Lambda function, and AWS provides rotation Lambda templates for RDS, Redshift, and DocumentDB.

The rotation Lambda is invoked in **4-step stages**:

```
createSecret  → Create a new secret value, store in AWSPENDING version stage
setSecret     → Actually apply the new credential to the target service (e.g., DB via ALTER USER)
testSecret    → Test the AWSPENDING credential with real connection/query
finishSecret  → Promote AWSPENDING stage to AWSCURRENT (previous CURRENT becomes AWSPREVIOUS)
```

```
[AWSPREVIOUS] ← [AWSCURRENT] ← [AWSPENDING]
   Previous value   Current value   New value being rotated
```

> 💡 **Related Theory**: This 4-step mimics *atomic swap*. The key insight is that finishSecret only runs if testSecret succeeds — traffic switches only after the new credential is validated to work. If setSecret applies to the DB but testSecret fails, AWSCURRENT still points to the old value, so the application doesn't break. This is the same principle as blue/green deployment — defer traffic cutover until after validation.

### Single-User vs. Alternating-User Strategy

RDS rotation has two strategies:
- **single-user**: Only change the password of the same DB user. Simple, but there can be a brief authentication failure window between password change and application cache refresh. The rotation Lambda doesn't use master credentials — it rotates itself.
- **alternating-users**: Use two users (e.g., `app_user_1`, `app_user_2`) alternately. During rotation, change the password of the user not currently in use, then switch — this results in virtually no downtime. However, the rotation Lambda must retrieve **master (superuser) credentials** from a separate secret (`masterarn` parameter).

> 🎯 **Scenario**: "During RDS password rotation, no authentication errors must occur (zero-downtime)" is a common exam question. The answer is the alternating-users strategy, which requires connecting the rotation Lambda to a master credential secret. single-user is simpler to implement but can suffer brief authentication failures depending on timing.

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/db/mysql \
  --rotation-lambda-arn arn:aws:lambda:ap-northeast-2:111122223333:function:SecretsManagerRDSMySQLRotation \
  --rotation-rules '{"AutomaticallyAfterDays":30}'
```

The rotation Lambda must access the private DB inside a VPC, so it is typically **deployed in the same VPC as the DB**, and to call the Secrets Manager API it needs **a VPC endpoint (or NAT)**. Omitting this network path will cause rotation to fail with a timeout.

## Parameter Store Comparison: When to Use What

AWS Systems Manager Parameter Store can also store secrets as `SecureString`, encrypting them with KMS at rest. The exam tests the selection criteria between the two.

| Item | Secrets Manager | Parameter Store (SecureString) |
|------|-----------------|--------------------------------|
| Automatic Rotation | Built-in (Lambda integration) | None (manual implementation required) |
| Cross-Account Sharing | Resource policy support | Standard unsupported (Advanced limited) |
| Cost | Monthly per-secret fee + API calls | Standard free, Advanced paid |
| Size Limit | Up to 64KB | Standard 4KB / Advanced 8KB |
| Random Password Generation | Built-in `GetRandomPassword` | None |
| RDS/Redshift Integration | First-class integration | None |
| Use Case | Secrets requiring rotation/cross-account sharing | Config values, simple secrets not needing rotation, non-confidential configuration |

> ⚠️ **Pitfall**: "Minimize cost + no rotation needed for a simple API key" → Parameter Store SecureString is the answer. Conversely, "auto-rotate DB password" or "cross-account secret sharing" is required → Secrets Manager. Interestingly, Parameter Store can *reference* Secrets Manager secrets via `/aws/reference/secretsmanager/{secret-name}` path, enabling a hybrid pattern.

## Cross-Account Secret Sharing

To allow an IAM role in account B to read a secret in account A, **both** of the following are required:

1. **Secret Resource Policy**: Allow the principal in account B
2. **KMS Key Policy**: Allow the principal in account B to decrypt with that key — AWS-managed key `aws/secretsmanager` cannot have its key policy modified, so it **must be a CMK**

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

The KMS CMK key policy must also allow account B's `kms:Decrypt`. The IAM policy of account B's role must have both `secretsmanager:GetSecretValue` and `kms:Decrypt` (all three policies must intersect for authorization to succeed).

> 🎯 **Scenario**: "Cross-account secret sharing results in `AccessDeniedException` (KMS) in account B" — the typical cause is that the secret is encrypted with an AWS-managed key. Managed keys cannot have their key policies edited, so there is no way to allow external account decryption. Solution: re-encrypt the secret with a CMK and add account B's Decrypt to the key policy.

## Deletion Grace Period and Recovery

`DeleteSecret` does not immediately delete but rather imposes a **7-30 day recovery grace period** (30 days by default). You can restore with `RestoreSecret` during this period. It's a safeguard against accidental or malicious deletion. If immediate deletion is truly necessary, use `--force-delete-without-recovery`, but the exam recommends the default grace period for "accidental deletion prevention."

> 🔍 **Deeper Dive**: Secrets Manager provides an automatic caching client library that allows applications to avoid calling `GetSecretValue` on every request by caching in memory and refreshing only at rotation time. This improves both cost (charged per API call) and availability (application continues with cached value even if Secrets Manager is unavailable). The key is making the cache TTL shorter than the rotation period — that way, rotated new credentials are fetched on time.

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
