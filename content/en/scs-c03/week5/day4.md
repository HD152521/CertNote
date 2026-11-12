# Day 4 - Encryption at Rest/in Transit: TLS, Service-Specific Encryption, Key Rotation

Encryption splits in two according to the *state* of the data. **Encryption at rest** protects data that sits on disk or in storage, and **encryption in transit** protects data moving across the network. SCS-C03 asks concretely "which service encrypts at rest, and how?", "how do you *enforce* encryption in transit?", and "how does key rotation work?" Today we organize these three topics service by service.

Let us first set out one thesis that runs through the whole day. **Encryption is not a question of "on or off" but of "who can turn it on, and what happens if they don't."** When an exam question uses verbs like *ensure*, *enforce*, *guarantee*, or *prevent* instead of the word `enable`, the correct answer is never an option that merely switches something on; it is a **control that makes the request fail if encryption is not used**. This instinct underlies every question we cover today.

```
[ The three segments a piece of data travels through, and the control for each ]

  Client ──①in transit──▶ Edge/LB ──②in transit──▶ App ──③in transit──▶ Storage
                                                                            │
                                                                            ▼
                                                                      ④ At rest
                                                                  (envelope encryption)

  ① Enforce TLS : CloudFront viewer-protocol / ALB redirect / minimum TLS version
  ② Backend re-encryption : origin-protocol=https-only, target group protocol HTTPS
  ③ Per-service enforcement : S3 aws:SecureTransport / RDS force_ssl / EFS -o tls
  ④ Encryption at rest : SSE-KMS · EBS default encryption · set at RDS creation

  "End-to-end encryption" means ①②③ are all unbroken.
  If even one segment is plaintext, that segment becomes the security level of the whole path.
```

## Encryption in Transit: TLS and Enforcement Techniques

TLS is the de facto standard for encryption in transit. What matters is that "*supporting* TLS" is different from "*refusing* plaintext connections." Security exams always ask about **enforcement**.

- **S3**: Block HTTP by denying requests where `aws:SecureTransport` is `false` in the bucket policy.

```json
{
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:*",
  "Resource": ["arn:aws:s3:::my-bucket", "arn:aws:s3:::my-bucket/*"],
  "Condition": { "Bool": { "aws:SecureTransport": "false" } }
}
```

- **ALB/CloudFront**: Redirect the HTTP listener to HTTPS and set the viewer protocol policy to `redirect-to-https`. Enforce a minimum TLS version (for example, TLS 1.2+) through the security policy.
- **RDS**: Enforce SSL connections with `rds.force_ssl=1` in the parameter group (PostgreSQL) or a per-user `REQUIRE SSL` (MySQL). RDS provides a certificate bundle (rds-ca).
- **API Gateway**: Set a minimum TLS version and expose HTTPS only.

`aws:SecureTransport` is a global condition key that indicates *whether the request arrived over TLS*. Using it as a Deny condition in S3 shuts off plaintext HTTP access at the source. The correct answer to an exam question that says "*enforce* encryption in transit for S3" is almost always this bucket policy Deny. It is not simply "use HTTPS"; it is "block HTTP."

### Transit Encryption Enforcement at a Glance, by Service

The exam asks about "the *exact* knob that enforces TLS in this service." The source of the traps is that the knob sits in a different place for each service.

| Service | Enforcement knob | Where it lives |
|---------|------------------|----------------|
| S3 | Deny when `aws:SecureTransport: false` | **Bucket policy** (resource policy) |
| CloudFront | Viewer protocol policy = `redirect-to-https` or `https-only`, minimum protocol version | Distribution behavior settings |
| ALB | Redirect the HTTP:80 listener to HTTPS + minimum TLS version via security policy | Listener settings |
| API Gateway | Security policy of the custom domain (TLS 1.2) | Domain settings |
| RDS PostgreSQL | `rds.force_ssl = 1` | **Parameter group** |
| RDS MySQL/MariaDB | `require_secure_transport = ON` or per-user `REQUIRE SSL` | Parameter group / DB user definition |
| Redshift | `require_SSL = true` | Cluster parameter group |
| EFS | `-o tls` at mount time, plus an `aws:SecureTransport` Deny in the file system policy | Client option + **resource policy** |
| ElastiCache | In-transit encryption (at creation) + AUTH/RBAC | Cluster creation option |
| API-style services such as DynamoDB / SQS / SNS | HTTPS-only endpoint + an `aws:SecureTransport` condition in IAM/resource policies | Policy condition |

There is a pattern to read here. **Services whose enforcement mechanism is a "resource policy" (S3, EFS) have the server reject the connection no matter which client connects**, whereas **services whose mechanism is a "client option" (the EFS mount option, ElastiCache connections) depend on the client to cooperate.** That is why EFS appears in both rows. If you rely only on the mount option, the moment someone mounts without it the traffic becomes plaintext, so the setup is complete only when the server side is nailed down with a Deny in the file system policy.

```json
// EFS file system policy — the server rejects clients that mount without TLS
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyNonTlsMounts",
      "Effect": "Deny",
      "Principal": { "AWS": "*" },
      "Action": "*",
      "Resource": "*",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

> ⚠️ **Trap**: If you cannot distinguish "we turned TLS on" from "we blocked plaintext," you will be pulled toward the wrong answer. Even if you *add* an HTTPS listener to an ALB, plaintext access remains possible as long as the HTTP:80 listener is alive. The same is true if you leave the CloudFront viewer protocol policy at `HTTP and HTTPS`. Enforcement means **removing or redirecting the plaintext path**, not adding an encrypted path.

### Minimum TLS Version: Cutting Off Old Protocols

Not all TLS is equal just because you use TLS. SSLv3, TLS 1.0, and TLS 1.1 are excluded from regulatory requirements (for example, card-payment-related standards) because of known vulnerabilities. AWS provides this control as predefined bundles called **security policies**.

```bash
# Replace the ALB listener's security policy with one that allows TLS 1.2 and above only
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:ap-northeast-2:111122223333:listener/app/... \
  --ssl-policy ELBSecurityPolicy-TLS13-1-2-2021-06

# Check the minimum viewer TLS version of a CloudFront distribution
aws cloudfront get-distribution-config --id E1234ABCDEFGH \
  --query "DistributionConfig.ViewerCertificate.MinimumProtocolVersion"
```

Raising the minimum TLS version is not a purely security decision; it is a **trade against compatibility**. If you cut off anything below TLS 1.2, very old clients (legacy embedded devices, old Java runtimes, payment terminals that were never updated) can no longer connect. So the practical order is not "cut first, then look at the problems" but **"observe first, then cut."** CloudFront standard logs and ALB access logs contain fields for the negotiated TLS protocol and cipher suite, so you aggregate the last 30 days with Athena to learn the share and identity of the clients connecting with TLS 1.0/1.1 before anything else. Changing the policy without this data turns a security improvement into an outage. On the exam, too, when a clue says "there are legacy clients," the right answer is often not a blanket block but an option that *separates them onto a different distribution/listener and sets a deadline*.

### The Internal Network Segment: What AWS Already Does

The claim that "encryption isn't needed because it's inside the VPC" is half right and half wrong. AWS encrypts inter-Region traffic that travels across its global network at the physical layer, and it also encrypts VPC traffic between Nitro-based instances at the hardware level. But this is **baseline protection that AWS provides**, not a control that your application can prove.

What a regulatory audit usually asks for is encryption "that we configured and that we can prove." So the defense-in-depth answer is always the same: do not lean on the baseline layer's protection; **keep TLS end to end at the application layer** and continuously evaluate that configuration with Config and Security Hub.

## Encryption at Rest: Mechanisms by Service

Most AWS storage services encrypt at rest by using envelope encryption (Day 2) internally. What differs is *who gets to choose the key* and *the defaults*.

### S3
Three SSE options plus client-side encryption:
- **SSE-S3** (`AES256`): S3 fully manages the key. No KMS control or auditing. Currently applied by default to all new objects.
- **SSE-KMS** (`aws:kms`): Envelope encryption with a KMS key. Key policies, CloudTrail auditing, and cross-account control are available. Use a Bucket Key to optimize cost.
- **SSE-C**: The customer supplies the key with every request (S3 does not store it).
- **CSE**: Encrypt on the client, then upload.

Even if bucket default encryption is on, a requirement such as "data must be stored *only* with *our* KMS key" needs policy enforcement.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyWrongEncryptionMethod",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::regulated-bucket/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    },
    {
      "Sid": "DenyWrongKmsKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::regulated-bucket/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id":
            "arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-..."
        }
      }
    }
  ]
}
```

The first statement says "deny anything that is not SSE-KMS," and the second says "deny anything that is not the specified key." Without the second, a user could encrypt with *another key in their own account*, and the data would end up bound to a key the organization does not control.

> ⚠️ **Trap**: A header-based Deny policy like the one above **interacts with bucket default encryption.** When default encryption is on, S3 encrypts on its own even if the client sends no encryption header, but the policy above rejects *requests that have no header*. The result is a situation where "the request would have been encrypted correctly but fails because of the policy." If the intent of the control is "always make them use this key," the primary mechanism is **setting the bucket default encryption to that key**, and it is safer to design the policy Deny as a secondary mechanism that blocks *attempts to explicitly specify a different key*.

### EBS
- Encryption is an option at volume creation. You can enforce *default encryption* per account and Region (`Enable EBS encryption by default`).
- Snapshots, restored volumes, and copies of an encrypted volume are *automatically encrypted*.
- You cannot convert an unencrypted volume to an encrypted one directly; use the snapshot → encrypted copy → new volume path.

```bash
# Region-level default encryption (applies to new volumes; existing volumes are unchanged)
aws ec2 enable-ebs-encryption-by-default
aws ec2 modify-ebs-default-kms-key-id \
  --kms-key-id arn:aws:kms:ap-northeast-2:111122223333:key/1234abcd-...
aws ec2 get-ebs-encryption-by-default

# Copy an unencrypted snapshot as an encrypted copy (the key step of the conversion)
aws ec2 copy-snapshot \
  --source-region ap-northeast-2 --source-snapshot-id snap-0abc \
  --encrypted --kms-key-id alias/app-data-key \
  --description "encrypted copy of snap-0abc"
```

### RDS / Aurora
- You can turn encryption on only when you create the DB instance (it cannot be toggled afterward).
- To encrypt an existing unencrypted DB, use the path of *restoring from an encrypted snapshot*.
- When encryption is on, storage, automated backups, Read Replicas, and snapshots are all encrypted.

### Others
- **DynamoDB**: Encryption at rest is always on (default AWS owned key) and can be switched to a customer managed key.
- **EFS**: Encryption at rest is set at creation; encryption in transit uses the mount option (`-o tls`).
- **Redshift / SQS / SNS / CloudWatch Logs / Secrets Manager**: All support KMS-based encryption at rest.

### Encryption-at-Rest Comparison by Service

| Service | Default | Key choice | Can you enable it later? | Caveat |
|---------|---------|------------|--------------------------|--------|
| **S3** | New objects automatically encrypted with SSE-S3 | SSE-S3 / SSE-KMS / SSE-C / CSE | Yes (existing objects must be re-uploaded or copied) | Default encryption is *not applied retroactively to existing objects* |
| **EBS** | Follows the per-Region default-encryption setting | AWS managed (`aws/ebs`) or CMK | Not on the volume itself → go through a snapshot | A snapshot encrypted with the AWS managed key cannot be shared cross-account |
| **RDS/Aurora** | Off | AWS managed (`aws/rds`) or CMK | Cannot toggle on the instance → go through a snapshot | Turning encryption on encrypts backups, replicas, and snapshots as well |
| **DynamoDB** | **Always on** (AWS owned key) | AWS owned / AWS managed / CMK | The key type can be switched | Switching to a CMK incurs KMS calls and cost |
| **EFS** | Off (chosen at creation) | AWS managed or CMK | Cannot be changed after the file system is created | To convert, copy to a new file system with DataSync or similar |
| **CloudWatch Logs** | AWS-managed encryption | A CMK can be associated with the log group | Yes (`associate-kms-key`) | If you delete the key, the logs become unreadable |
| **SQS / SNS** | Off (SSE option) | AWS managed or CMK | Yes | **For another service to put messages in, that service's principal needs key permissions** |

"Encrypt an existing unencrypted RDS instance" → you cannot modify the instance directly. You create a snapshot, *copy it as an encrypted copy*, and then restore from that snapshot. EBS follows a similar snapshot-based path. An option saying "just turn on the encryption toggle" is wrong.

A common incident is that after an SQS queue is encrypted with a CMK, "messages no longer arrive from the SNS subscription or the EventBridge rule." The cause is not the queue but the **key policy**. The principals putting messages in are AWS services (`sns.amazonaws.com`, `events.amazonaws.com`), so those service principals must be allowed `kms:GenerateDataKey*` and `kms:Decrypt`. The general lesson of this pattern is that the moment you turn encryption on, **the key policy becomes a new point of failure**.

> 🎯 **Scenario**: "Ensure that all new EBS volumes in the organization are encrypted." → Turn on *EBS encryption by default* in each Region, and detect and remediate gaps with an SCP or Config rules (`ebs-encryption-by-default`, `encrypted-volumes`).

### The Standard Path for Converting Existing Unencrypted Resources

Because "there is no toggle," conversion always goes through a *copy*. This one diagram covers both EBS and RDS questions.

```
[ The common skeleton of unencrypted → encrypted conversion ]

  ① Create snapshot        ② Copy as encrypted         ③ Restore
  ─────────────            ───────────────────         ────────
  Unencrypted resource ──▶ snapshot (unencrypted) ──▶ snapshot (encrypted) ──▶ New resource (encrypted)
                                                 copy --encrypted           restore
                                                 --kms-key-id CMK

  EBS  : create-snapshot → copy-snapshot --encrypted → create-volume → swap the volume
  RDS  : create-db-snapshot → copy-db-snapshot --kms-key-id → restore-db-instance-from-db-snapshot
  Common: after ③ you must switch the endpoint/mount, so **a downtime plan always follows**
          (an option saying "convert to encryption with zero downtime" is usually a wrong-answer signal)
```

What is often forgotten on this path is the **lifetime of the intermediate artifacts**. The *unencrypted snapshot* created in ① remains in place even after ② and ③ are finished, and it is itself a complete copy of the plaintext data. If you close out the conversion as "done once the new resource is up," unencrypted copies of data quietly accumulate in the organization. The last step of a conversion procedure must always be **destroying the original and the intermediate snapshots**, and audits ask for the records of that destruction as well. Setting up a Config rule that continuously evaluates "existence of unencrypted snapshots" is a practical device for catching this omission.

## Key Rotation: Automatic vs Manual

Key rotation means *renewing the key material used for encryption while keeping the same logical key*. The exam asks about the difference in behavior between automatic and manual rotation.

Start with why rotation is needed. There are two reasons. One is **cryptographic**: the more data you encrypt with a single key, the more material there is for analysis, so periodically changing the key material is standard hygiene. The other is far more practical, **response to exposure**: if the key material leaked at some point, rotation draws a line saying "data created after this point is safe." The second reason is the core value of rotation, and it is also where rotation's limit comes from. **Rotation cannot rescue the past.**

**Automatic key rotation**
- Can be enabled on a customer managed key (`enable-key-rotation`). The default is *every year* (you can set the period between 90 and 2560 days if you want).
- KMS creates new key material, and the *key ID, ARN, and alias stay the same*. The old key material is retained, so *old data can still be decrypted*.
- No application change is needed at all. It has the lowest operational burden.
- For an **AWS managed key**, rotation is *automatic and fixed* (it cannot be turned off or have its period changed).
- **Asymmetric keys, EXTERNAL (BYOK) keys, and CloudHSM keys cannot use automatic rotation.**

```bash
aws kms enable-key-rotation --key-id alias/app-data-key
aws kms get-key-rotation-status --key-id alias/app-data-key
```

There are also commands for specifying the period, or for rotating once right now regardless of the schedule (for example, when exposure is suspected).

```bash
# Set the rotation period to 180 days
aws kms enable-key-rotation \
  --key-id alias/app-data-key \
  --rotation-period-in-days 180

# Rotate once immediately regardless of the schedule (there is a cap on how many times per key)
aws kms rotate-key-on-demand --key-id alias/app-data-key

# Check the history of when this key was rotated — used as audit evidence
aws kms list-key-rotations --key-id alias/app-data-key
```

```
[ Internal state of the key after automatic rotation ]

  KMS key  (key ID, ARN, alias = unchanged)
    ├── key material v1  ── still used to decrypt ciphertext created in 2024 (retained)
    ├── key material v2  ── ciphertext from 2025 (retained)
    └── key material v3  ── currently active. All new encryption goes here  ◀── active

  · The application still calls the same ARN → 0 code changes
  · Old ciphertext is decrypted with the old key material automatically → 0 migration
  · But the old data is still encrypted under v1 → this is not re-encryption
```

**Manual rotation**
- Create a new KMS key and *update the alias to point to the new key*. Use it for keys that cannot use automatic rotation (asymmetric, BYOK) or when you want to change the key ID itself.
- Old data must be decrypted with the old key, so keep both keys. If you reference the key through an alias, new encryption goes to the new key.

```bash
# ① Create a new key → ② update the alias to the new key → ③ leave the old key for decryption only
NEW_KEY=$(aws kms create-key --description "app-data-key 2026H2" \
          --query KeyMetadata.KeyId --output text)
aws kms update-alias --alias-name alias/app-data-key --target-key-id "$NEW_KEY"
# Do not delete the old key — past ciphertext is still bound to that key
```

| Aspect | Automatic rotation | Manual rotation | Re-encryption (ReEncrypt) |
|--------|--------------------|-----------------|---------------------------|
| What changes | **Key material only** | **The key itself** (new key ID/ARN) | The **key wrapping the data key** changes |
| Key ID/ARN | Retained | Changed (absorbed by the alias) | The key ARN of the target ciphertext changes |
| Application impact | None | None if you were already using an alias | A batch job is needed |
| Old data | Still decrypted with old key material | The old key must be kept to decrypt | **Fully moved to the new key** |
| Supported key types | Symmetric CMKs only | All types (including asymmetric and BYOK) | KMS ciphertext in general |
| Operational burden | Lowest | Medium (alias and old key management) | Highest |
| When to choose it | "Regular rotation with no operational burden" | "Rotate an asymmetric/BYOK key", "the key must be replaced" | "Must completely cut the dependency on the old key" |

Automatic rotation is transparent because *only the key material* changes and the key identifier stays the same. Manual rotation changes *the key itself*, so it requires updating the alias and keeping the old key. If an exam question says "rotate an asymmetric key," automatic rotation is not possible, so manual rotation (new key + alias update) is the answer. "Regular rotation with no operational burden" → automatic rotation of a symmetric CMK.

Turning on automatic rotation does *not re-encrypt old data*. Old data is decrypted with the retained old key material, and only new data after rotation is encrypted with the new key material. Watch out for options that target the misconception that "after rotation, existing data is re-encrypted with the new key."

**Deleting the old key** is the most fatal mistake in manual rotation. Once you move the alias to the new key, new encryption works fine, so it is easy to conclude "we don't need the old key anymore," but past ciphertext is still bound to the old key. The moment you delete the old key, that data becomes permanently unrecoverable. To clean up an old key, first move all ciphertext to the new key with `ReEncrypt`, confirm in CloudTrail that `Decrypt` calls on that key have been zero for long enough, and only then schedule deletion.

> 🎯 **Scenario**: "A regulator requires that 'encryption keys be replaced at least once a year and that the history be provable.' The application team says it cannot afford code changes or data migration." → **Turn on automatic rotation** for the symmetric customer managed key, and submit evidence from `GetKeyRotationStatus`, `ListKeyRotations`, and the CloudTrail `EnableKeyRotation` and rotation events. Automatic rotation keeps the key ARN, so there are 0 code changes, and the old key material is retained, so there is 0 migration as well. If you add AWS Config to continuously evaluate "CMKs without rotation enabled," both *evidence* and *drift detection* are solved at once.

### Reading Rotation and Encryption Activity from CloudTrail

Whether encryption and rotation are really working must be proven with logs. The KMS calls made by the services we covered today leave characteristic traces.

```json
// When an EBS volume is attached — EC2 requests a data key on the user's behalf
{
  "eventName": "GenerateDataKeyWithoutPlaintext",
  "eventSource": "kms.amazonaws.com",
  "sourceIPAddress": "ec2.amazonaws.com",
  "requestParameters": {
    "encryptionContext": { "aws:ebs:id": "vol-0a1b2c3d4e5f" },
    "keySpec": "AES_256"
  }
}
```

```json
// The act of turning on rotation is itself evidence
{
  "eventName": "EnableKeyRotation",
  "eventSource": "kms.amazonaws.com",
  "userIdentity": { "arn": "arn:aws:iam::111122223333:role/SecurityKeyAdmin" },
  "requestParameters": { "keyId": "1234abcd-...", "rotationPeriodInDays": 365 }
}
```

| Observation | Interpretation |
|-------------|----------------|
| `GenerateDataKeyWithoutPlaintext` + `aws:ebs:id` in the context | EBS encryption at rest is actually working. Direct evidence of encryption |
| `sourceIPAddress` is `ec2/rds/s3.amazonaws.com` | A service-integration path. A person did not call it directly |
| `EnableKeyRotation` / `DisableKeyRotation` | A change to the rotation control. **Disable is always an alarm target** |
| A surge of `Decrypt` failures (`DisabledException`) | The key is disabled or pending deletion — the cause of a service outage |
| `Decrypt` failures (`KMSInvalidStateException`) | A sign that something keeps using a key scheduled for deletion. A metric you must check before deleting |
| Calls to a specific key are 0 for months | An unused key. A cleanup candidate, but there may be a *quarterly batch*, so check over a one-year window |

## TLS Certificate Management: ACM

Certificates for encryption in transit are managed with ACM (AWS Certificate Manager). ACM-issued certificates renew automatically through *DNS validation*, their *private keys cannot be extracted*, and they integrate with CloudFront (us-east-1), ALB, API Gateway, and others. You can also import certificates issued elsewhere, but automatic renewal applies only to ACM-issued certificates. (We covered the ACM Region rule in Week 4, Day 4.)

Reading these three properties again from a security perspective makes the meaning of each clear.

| ACM property | Security meaning | Contrasting situation |
|--------------|------------------|-----------------------|
| The private key cannot be extracted | There is no path at all for the certificate key to leak onto a developer laptop, into Git, or onto a wiki | A key you issued yourself exists as a plaintext file somewhere in the deployment process |
| DNS validation + automatic renewal | The outage risk from expiry and the risk of "nobody responsible for renewal" disappear | Manual renewal depends on a person's calendar |
| Direct binding to AWS services | Replacing a certificate does not require deploying files to servers | The moment you swap files server by server, drift appears |

An imported certificate loses all three of these benefits. So the practical rule is clear: **obtain public certificates that attach in front of AWS services from ACM whenever possible.** If a regulatory situation forces you to use an external CA, at the very least set up expiry monitoring (ACM's expiring-soon event and the `DaysToExpiry` metric). When your organization needs its own CA, as with mTLS between internal services, **AWS Private CA** fills that role.

The 2014 OpenSSL Heartbleed vulnerability (CVE-2014-0160) was caused by a missing bounds check in the TLS heartbeat extension, which let attackers read a server process's memory piece by piece, and what made the incident severe was that those pieces **could include the server's private key**. What operators around the world did then was not only patch. Because they could not rule out that keys had leaked, they had to **reissue every certificate and revoke the existing ones**, and organizations that managed keys by hand spent days to weeks on it. Here today's two topics meet. First, **rotation is not routine hygiene but a recovery tool for incidents.** An organization whose rotation procedure is not automated *cannot* rotate when an incident occurs. Second, **a design that makes keys impossible to take out reduces leakage itself** — this is exactly why ACM and KMS never let private keys out across the service boundary. It is also the basis for ACM being the correct answer when an exam says "minimize the risk of certificate private key exposure."

The history of TLS vulnerabilities also explains why the control of "enforcing a minimum version" is needed. The 2014 POODLE attack went after how SSL 3.0 handles CBC padding, and as a result SSL 3.0 was effectively retired. The problem was that many servers at the time **allowed downgrading to SSL 3.0 for compatibility with old clients**. In other words, merely *supporting* modern TLS is not enough; you are safe only when you *close* the path that lets a connection fall back to an old version. The earlier thesis of today, "support and enforcement are different," repeats at the level of protocol versions. The security policies of ALB and CloudFront are exactly the knobs that close that downgrade path.

## Summary

Today's backbone compresses into three sentences.

First, **the core of encryption in transit is enforcement.** It is not turning TLS on but eliminating the plaintext path, and the knob for that sits in a different place for each service: for S3 it is the `aws:SecureTransport` Deny in the bucket policy; for RDS it is `force_ssl`/`require_secure_transport` in the parameter group; for ALB and CloudFront it is the redirect plus the minimum TLS version; for EFS it is the combination of the mount option and the file system policy. Wherever a resource policy can block it, you always block it with the resource policy.

Second, **for encryption at rest, the defaults and the conversion path are what matter.** Some services are always on like DynamoDB, some are on by default like S3, and some can be decided only at creation like RDS and EFS. A service that cannot be enabled later follows the common skeleton of *snapshot → encrypted copy → restore*, and the last step of that procedure is always destroying the unencrypted original and the intermediate snapshots. And the moment you turn encryption on, the key policy becomes a new point of failure — when SQS, SNS, or CloudWatch Logs show the symptom "another service can't use it," the cause is usually the key, not the queue.

Third, **with rotation, it is important to know exactly what changes.** Automatic rotation swaps only the key material and leaves the key ARN and old data untouched, so the operational burden is 0, but it works only on symmetric CMKs and does not re-encrypt past data. Asymmetric and BYOK keys use manual rotation (a new key + an alias update), and deleting the old key at that point kills the past data. If you truly want to cut the dependency on the old key, you need a `ReEncrypt` batch. Finally, entrust certificates to ACM, which does not let private keys be taken out, and continuously prove expiry and rotation status with Config and CloudTrail.

---

## 📝 Practice Questions

**Question 1.** You are asked to *enforce encryption in transit* for an S3 bucket. What is the most accurate implementation?

A) Set the bucket default encryption to SSE-KMS  
B) Deny requests in the bucket policy where `aws:SecureTransport` is `false` to block plaintext HTTP access  
C) Put CloudFront in front  
D) Apply SSE-C to the objects  

**Answer: B**  
Explanation: Enforcing encryption in transit means *rejecting* plaintext (HTTP) connections. Denying `aws:SecureTransport: false` in the bucket policy blocks non-TLS requests. SSE-KMS and SSE-C are encryption *at rest* methods and are unrelated to transport, and placing CloudFront in front does not enforce blocking HTTP.

---

**Question 2.** You want to enable encryption at rest for an RDS MySQL instance that has been running without encryption. What is the correct procedure?

A) Turn on the encryption toggle in the instance settings  
B) Create a snapshot, *copy it as an encrypted copy*, and then restore a new instance from that snapshot  
C) Turn on `force_ssl` in the parameter group  
D) Migrate to DynamoDB  

**Answer: B**  
Explanation: RDS encryption can be configured only when the instance is created and cannot be toggled later. An existing unencrypted instance is encrypted via the path of snapshot, encrypted copy, and restore. `force_ssl` enforces encryption *in transit*, not encryption at rest, and migrating to DynamoDB is an unnecessary overreaction.

---

**Question 3.** You want to rotate a symmetric customer managed key regularly without operational burden. Which statement about automatic key rotation is most accurate?

A) Rotation changes the key ID and ARN, so applications must be modified  
B) Only the key material is refreshed while the key ID, ARN, and alias are retained, and the old key material is kept so existing data can still be decrypted  
C) Rotation automatically re-encrypts existing data with the new key  
D) Asymmetric keys are also rotated automatically in the same way  

**Answer: B**  
Explanation: Automatic rotation transparently refreshes only the key material while the key identifier stays the same, so no application change is needed, and the old key material is retained so past data can still be decrypted. It does not re-encrypt existing data with the new key. Automatic rotation is not possible for asymmetric keys or BYOK.

---

**Question 4.** You must replace an asymmetric KMS key, which cannot be rotated automatically, on a regular basis. What is the most appropriate method?

A) Call `enable-key-rotation`  
B) Perform manual rotation: create a new asymmetric key, update the alias to point to the new key, and keep the old key for decrypting past data  
C) Convert the key to symmetric  
D) Do nothing because rotation is impossible  

**Answer: B**  
Explanation: Asymmetric keys do not support KMS automatic rotation, so you perform manual rotation: create a new key, update the alias so that new encryption goes to the new key, and keep the old key to decrypt past data. `enable-key-rotation` does not apply to asymmetric keys, the key type cannot be converted, and from a security standpoint you must not neglect a key that needs regular replacement.

---

**Question 5.** You want to guarantee that all new EBS volumes in the organization are encrypted at rest without exception. What is the most effective combination?

A) Instruct users to check the encryption checkbox  
B) Enable EBS encryption by default in each Region, and detect and remediate unencrypted volumes with AWS Config rules (such as `encrypted-volumes`)  
C) Apply SSE-C to each volume  
D) Control it with an S3 bucket policy  

**Answer: B**  
Explanation: EBS encryption by default per Region automatically encrypts new volumes, and the prevention-plus-detection combination of using Config rules to detect and remediate omissions and drift fits the guarantee requirement. User guidance has no enforcement power, SSE-C is an S3 object encryption method, and S3 bucket policies are unrelated to EBS.

---
