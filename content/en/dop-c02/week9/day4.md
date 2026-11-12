# Day 4 - Secrets Manager and Parameter Store: Lifecycle and Rotation

Secrets — database passwords, API keys, TLS certificates — are the highest-stakes configuration. Wrong rotation loses audit compliance (SOC 2, PCI). Unrotated secrets lingering after employee departure. API key from GitHub public repo. AWS Secrets Manager and Parameter Store together solve secret lifecycle: **storage + versioning + rotation + audit**.

## Parameter Store vs Secrets Manager

| Aspect | Parameter Store | Secrets Manager |
|---|---|---|
| **Purpose** | Configuration values (app settings, flags) | Secrets (passwords, keys, tokens) |
| **Versioning** | Implicit, unlimited | Explicit versions, CURRENT/PREVIOUS/STAGING/AWSPENDING |
| **Rotation** | Manual or Lambda | Built-in scheduler + lambda-backed rotation |
| **Encryption** | KMS optional | KMS mandatory |
| **Pricing** | Free tier (100), then cheap | ~$0.4/secret/month + rotation call |
| **CloudTrail** | All GetParameter calls logged | All calls logged + rotation events |
| **Cost at 10k secrets** | ~$40/month | ~$4000/month + rotation |

**Operational split**: AppConfig/Parameter Store = app configuration (feature flags, endpoints, timeouts). Secrets Manager = passwords/keys (MySQL root, Datadog API key, TLS cert).

## Secrets Manager Rotation Mechanics

Rotation is **Lambda-driven state machine**. Secrets Manager doesn't directly change database password; it calls your Lambda with instructions.

1. **createSecret** → Secrets Manager creates version, labels it AWSPENDING, calls Lambda with `"Step": "create"`
2. Lambda connects to database with **old password** (AWSCURRENT), changes database password
3. Lambda updates secret's AWSPENDING version to new password
4. Secrets Manager calls Lambda again with `"Step": "finish"`, moves AWSPENDING → AWSCURRENT

Throughout, **old applications still working**: they read AWSCURRENT (old password), database accepts it. New password already in database but not yet live in secret. One application crashes during rotation = doesn't matter; old password still valid on database.

```json
{
  "ClientRequestToken": "ab123-xyz",
  "SecretId": "prod/mysql/root",
  "ClientSecret": "...(encrypted)...",
  "Step": "create",
  "SecretVersionStage": ["AWSPENDING"]
}
```

The Lambda receives the secret already decrypted (IAM + KMS permission). It decrypts, connects to target system (RDS, API service), performs rotation.

```python
def lambda_handler(event, context):
    secret_id = event['SecretId']
    client = secretsmanager_client
    
    if event['Step'] == 'create':
        # Get old secret
        old_secret = client.get_secret_value(
            SecretId=secret_id,
            VersionId=event['ClientRequestToken'],
            VersionStage='AWSCURRENT'
        )['SecretString']
        
        # Generate new password
        new_password = generate_password()
        
        # Connect to RDS with old password, change to new
        conn = mysql.connect(..., password=old_secret)
        conn.execute(f"ALTER USER 'root'@'localhost' IDENTIFIED BY '{new_password}'")
        conn.close()
        
        # Store new password in AWSPENDING version
        client.put_secret_value(
            ClientRequestToken=event['ClientRequestToken'],
            SecretId=secret_id,
            ClientSecret=new_password,
            VersionStages=['AWSPENDING']
        )
    
    elif event['Step'] == 'finish':
        # Move AWSPENDING → AWSCURRENT (Lambda just signals completion)
        client.update_secret_version_stage(
            SecretId=secret_id,
            VersionStage='AWSCURRENT',
            MoveToVersionId=event['ClientRequestToken']
        )
```

**Critical detail**: Between steps, old password is AWSCURRENT (all apps read it), new password is AWSPENDING (only new apps know it). If old app crashes mid-rotation, it reconnects, reads AWSCURRENT (old password), succeeds. Zero downtime rotation.

## Rotation Timing and Failures

```bash
aws secretsmanager rotate-secret \
  --secret-id prod/mysql/root \
  --rotation-lambda-arn arn:aws:lambda:...:rotation-function \
  --rotation-rules '{"AutomaticallyAfterDays": 30, "Duration": "2h", "ScheduleExpression": "rate(30 days)"}'
```

`AutomaticallyAfterDays: 30` = rotate every 30 days. `Duration: 2h` = complete rotation within 2 hours. If Lambda hangs > 2 hours, rotation marked FAILED, human must investigate.

Failures are common: target system unreachable, validation failed, human deleted the database user. When rotation fails, **secret remains in old state** — applications still work, but rotation is broken. CloudWatch alarm fires. On-call must fix Lambda code or target system, then re-run rotation.

> 💡 **Related Theory**: Rotation is **"backward-compatible change"** pattern. Database password rotation is hard precisely because **old apps can't instantly know new password**. Solution: label-based versioning (AWSCURRENT/AWSPENDING) + gradual cutover. Similar to DNS TTL (old TTL, new record, queries gradual migrate), or Kubernetes rolling deployment (old pods, new pods, services cut over gradually).

> 🔍 **Deeper**: Secrets Rotation at scale (10k secrets, 30-day cycle) = 333 rotations/day. If each rotation takes 30 seconds, that's 166 minutes/day (2.75 hours) of Lambda invocations, purely for rotation. Lambda pricing ≈ $400/month at scale, plus network I/O to target systems. Team must ask: "Is monthly rotation **operational value** worth the infrastructure cost?" For passwords: yes (breach risk, compliance). For API keys: maybe (less sensitive). For TLS certs: auto-rotation via ACM or external tools, not Secrets Manager (cert management is different lifecycle).

## Dynamic References and Cross-Account Rotation

CloudFormation dynamic references:

```yaml
DBInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    MasterUserPassword: !Sub '{{resolve:secretsmanager:${DBSecret}:SecretString:password}}'
```

RDS consumes password from Secrets Manager. When password rotates, RDS is unaware — CloudFormation doesn't re-apply. RDS must be able to read the latest secret itself at runtime (not typical). **Better pattern**: Applications read secret, connect to RDS with secret. RDS doesn't change, but app connection credentials rotate.

Cross-account rotation: Secrets Manager in account A, RDS in account B. Rotation Lambda in A must assume role in B to access RDS. Role trust policy must allow Lambda principal from A.

## Summary

**Parameter Store** = app config (feature flags, endpoints, timeouts), cheap, optional encryption. **Secrets Manager** = passwords/keys/tokens, mandatory encryption, rotation automation, expensive. Rotation is **Lambda-driven state machine** with AWSCURRENT/AWSPENDING labels enabling zero-downtime cutover. Failures are common; human must fix and rerun. Costs scale with secret count and rotation frequency.

---

## 📝 Practice Questions

**Question 1.** The MySQL root password must be rotated automatically every 30 days. Existing applications must keep their connections during rotation. What is the core of the Secrets Manager rotation mechanism?

A) Immediately update all applications with the new password → momentary connection loss
B) A phased transition based on AWSCURRENT/AWSPENDING labels — during rotation the app connects with AWSCURRENT (the old password), and after rotation completes the AWSCURRENT label moves
C) Temporarily block all connections during rotation
D) Set the new password and have applications reconnect periodically

**Answer: B**

Explanation: The core of Secrets Manager rotation is the labels. During rotation, AWSCURRENT points to the old password and AWSPENDING points to the new one. Applications read only AWSCURRENT, so they keep connecting with the old password even during rotation. After rotation completes (the Lambda finish step), when the AWSCURRENT label moves to the new password version, the application reads the new password on its next restart. This is the key to zero-downtime replacement.

---

**Question 2.** What happens if a Secrets Manager rotation Lambda does not complete within 2 hours?

A) It automatically rolls back to the previous password
B) The rotation status is shown as FAILED, the secret keeps its old state, and manual operator intervention is required
C) The application is automatically blocked
D) The new password is forcibly applied

**Answer: B**

Explanation: When the duration limit is exceeded, the rotation is in the FAILED state. The secret is kept as it was, so applications keep working, but rotation is broken. The operator must check the Lambda logs to identify the cause of failure (database unreachable, validation failure, and so on), fix it, and retry. A rollback (A) is not possible automatically because the change may already have been made on the database system side, and forced application (D) does not exist.

---

**Question 3.** You manage 10,000 application configuration values (database endpoints, timeouts, feature flags), and they change only once or twice a year. What is the cost optimization approach?

A) Use Secrets Manager for everything ($4,000 per month)
B) Use Parameter Store (about $40 per month)
C) Bake everything into containers as environment variables
D) Store in DynamoDB

**Answer: B**

Explanation: These are configuration values, not secrets, so Parameter Store is appropriate. The free tier includes up to 100, and even beyond that it is very cheap. Since rotation is not needed, it saves 100 times the cost of Secrets Manager. Baking in environment variables (C) requires redeploying containers on change and does not allow dynamic changes. At large scale, Parameter Store is an essential pattern.

---

**Question 4.** A CloudFormation RDS resource uses a Secrets Manager password dynamic reference, and a rotation occurred. Is the RDS master user password updated automatically?

A) Yes, the latest password is applied automatically thanks to the dynamic reference
B) No. CloudFormation resolves the reference only at deployment time and does not update RDS directly after rotation. RDS still has the pre-rotation password
C) RDS itself polls Secrets Manager and synchronizes automatically
D) A stack update must be run every day

**Answer: B**

Explanation: A dynamic reference is resolved only at CloudFormation **deployment time**. At stack creation, it reads the AWSCURRENT password and puts it into the RDS MasterUserPassword. Even if a rotation occurs, CloudFormation does not run again, so the password stored in RDS stays as it was. The correct pattern: the application polls Secrets Manager at runtime to read the latest password and connect. The RDS master password cannot be rotated this way — the database itself keeps its original password, and only the password used for app connections can be rotated.

---

**Question 5.** A Secrets Manager password rotation Lambda must access an RDS database in account B across accounts. What are the required permission settings?

A) Grant the account B RDS permissions directly to the Lambda execution role
B) The Lambda execution role assumes a cross-account role in account B, and that role holds the RDS permissions. The trust policy of the account B role explicitly allows the account A Lambda principal
C) Fundamentally impossible (only the same account is possible)
D) Authenticate with an API key

**Answer: B**

Explanation: The standard pattern for cross-account access. For the Lambda role (A) to AssumeRole into a role in account B, the trust policy of B must name A explicitly. Debugging tip: when you see 403 Access Denied, it is mostly a failure during the assume role. Check whether the Lambda principal is missing from the trust policy.

---

**Question 6.** How do you store a new TLS certificate in Secrets Manager and have an ALB use the automatically renewed certificate every month?

A) Write a Secrets Manager rotation Lambda → the ALB uses a dynamic reference
B) Use AWS Certificate Manager (ACM), with automatic renewal and direct ALB binding (Secrets Manager is not needed)
C) Update the ALB manually every month
D) Upload multiple certificates to the ALB

**Answer: B**

Explanation: ACM is the expert at TLS certificate management. ACM provides automatic renewal + expiry tracking + direct ALB binding. Secrets Manager is for managing sensitive data (passwords and API keys). Leaving certificate management to ACM keeps operations simple. Certificates from outside ACM must be renewed outside AWS and uploaded manually (the complexity of D).

---

**Question 7.** API key rotation must be automated every 30 days. Which is more suitable, Parameter Store or Secrets Manager, and why?

A) Parameter Store, for cost savings
B) Secrets Manager, because API keys are sensitive information + automatic rotation is built in + detailed CloudTrail audit logging
C) They are the same
D) Manual management

**Answer: B**

Explanation: API keys are sensitive information and fall in the Secrets Manager category. Rotation is not a one-time but a periodic requirement, so Secrets Manager, which has automatic rotation, is the standard. The cost ($0.4/month) is cheap relative to the operational value of rotation. Implementing it with Parameter Store requires writing your own Lambda, and its audit capabilities are also weaker.

---

## 📌 Today's Summary

Secrets Manager was designed around rotation capability and label-based version management. The AWSCURRENT/AWSPENDING duality enables **zero-downtime replacement**. Parameter Store is cheap and simple but has no rotation and weak secret management features. At the scale of 1000+ secrets, the automatic rotation of Secrets Manager shows its cost-effectiveness for audit compliance (SOC 2, PCI).
