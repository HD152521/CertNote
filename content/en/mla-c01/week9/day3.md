# Day 3 - Protecting Data and Models: KMS Encryption and Secrets

## 📌 Key Takeaways

- Encryption has two axes, **at rest (KMS)** and **in transit (TLS, between nodes)**, and regulatory scenarios almost always require both.
- Three spots to memorize in a training job: `OutputDataConfig.KmsKeyId` (artifacts) · `ResourceConfig.VolumeKmsKeyId` (volumes) · `EnableInterContainerTrafficEncryption` (between nodes).
- A **customer managed key (CMK)** controls access through a key policy and can be audited and even disabled via CloudTrail, making it the default in regulated environments.
- KMS access must pass through **both the IAM policy and the key policy**. "I granted S3 permission but get Access Denied" is mostly a missing `kms:Decrypt`.
- Keep credentials out of code — if automatic rotation is needed use **Secrets Manager**; for simple configuration values or tokens use **Parameter Store (SecureString)**.

## Two Kinds of Encryption — At Rest vs. In Transit

If permissions (Day 1) and networking (Day 2) controlled "who accesses and where it flows," today we protect the data and the model themselves with encryption. Encryption splits by **where the data is.**

| Category | Encryption at rest | Encryption in transit |
|------|--------------------------|------------------------------|
| What it protects | Data "sitting still" on disk/storage | Data "moving" across the network |
| Typical ML assets | S3 training data, EBS/local volumes, model artifacts | S3↔container, between distributed training nodes, endpoint invocations |
| Implementation | KMS key (SSE-KMS, `VolumeKmsKeyId`) | TLS/HTTPS, `EnableInterContainerTrafficEncryption` |
| Threat it blocks | Disk, snapshot, or bucket leaks | Eavesdropping, man-in-the-middle |
| Easy to miss | Key usage permission is needed **separately** from storage permission | Inter-node encryption is not the default but an **explicit setting** |

```text
[Data flow and encryption points]
S3 (at-rest, SSE-KMS) ──TLS──▶ Training container
                                  │  EBS/local volume (at-rest, VolumeKmsKeyId)
                                  │  Between nodes (in-transit, inter-container encryption)
                                  ▼
S3 model artifact (at-rest, OutputDataConfig KmsKeyId)
                                  ▼
Endpoint volume (at-rest, EndpointConfig KmsKeyId) ──HTTPS──▶ Client
```

Encryption is complete only when it covers both "when data is still" and "when it moves." Encryption at rest keeps data unreadable even if someone steals the disk, and encryption in transit keeps it unreadable even if the network is tapped. Regulations (HIPAA, PCI, etc.) almost always require both. On the exam, "at-rest only" or "in-transit only" options are usually incomplete answers.

## Where to Configure Encryption by Target

What's actually asked is "**which parameter** do you touch to encrypt this asset."

| Asset | Where to configure | What gets encrypted |
|------|-----------|----------------|
| Training input data | S3 bucket default encryption / SSE-KMS at upload | The dataset stored in S3 |
| Training instance volume | `ResourceConfig.VolumeKmsKeyId` | EBS and local storage attached to the instance |
| Model artifact | `OutputDataConfig.KmsKeyId` | The S3 output where `model.tar.gz` is uploaded |
| Node-to-node communication | `EnableInterContainerTrafficEncryption: true` | Data transferred between distributed training containers |
| Batch transform | `TransformOutput.KmsKeyId` / `TransformResources.VolumeKmsKeyId` | Batch inference results in S3 / the job volume |
| Inference endpoint | `KmsKeyId` in EndpointConfig | Volumes attached to the hosting instance |

How the three spots appear together in a training job request:

```json
{
  "OutputDataConfig": {
    "S3OutputPath": "s3://ml-artifacts/output/",
    "KmsKeyId": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
  },
  "ResourceConfig": {
    "InstanceType": "ml.m5.xlarge",
    "InstanceCount": 2,
    "VolumeKmsKeyId": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
  },
  "EnableInterContainerTrafficEncryption": true
}
```

- `OutputDataConfig.KmsKeyId` → encrypts the model artifact (S3 output)
- `ResourceConfig.VolumeKmsKeyId` → encrypts the training instance's EBS/local volume
- `EnableInterContainerTrafficEncryption` → encrypts transfers between distributed training nodes

> ⚠️ **Trap**: Inter-node encryption only matters with 2 or more instances, and turning it on can slow training because of communication overhead. It is also a **different setting from network isolation (`EnableNetworkIsolation`)** — isolation cuts off external communication, while this encrypts the content being transferred.

## KMS — The Center of Key Management

AWS KMS is the service that creates and manages encryption keys. Almost all SageMaker encryption works by specifying "which KMS key to use." There are two kinds of keys, and which one you choose is the fork in the road.

| Item | AWS managed key (`aws/sagemaker`, etc.) | Customer managed key (CMK) |
|------|-----------------------------------|----------------------|
| Created by | Automatically created by the service in your account | You create and name it yourself |
| Edit key policy | Not possible | Possible — directly control who can use it |
| Cross-account sharing | Not possible | Possible (allow other accounts via the key policy) |
| Disable/delete | Not possible | Possible → crypto-shredding |
| Auditing | Usage recorded in CloudTrail | CloudTrail + per-key access control |
| When to pick it | When you just need basic encryption quickly | When regulation, auditing, cross-account use, or key control is required |

The real value of a CMK is that "you control access with the key policy, and turning the key off locks the data." Without deleting the data itself, cutting off key access can effectively make the data unreadable (crypto-shredding). Key usage is also recorded in CloudTrail, so you can audit "who decrypted this data and when." This is the core reason to use a CMK over an AWS managed key.

KMS doesn't directly encrypt large data (**envelope encryption**). It encrypts the data with a one-time data key received from `GenerateDataKey`, and stores that data key wrapped by the KMS key alongside it. When reading, it first unwraps the data key with `Decrypt`. This is why permissions split into two — **`kms:GenerateDataKey` when writing, `kms:Decrypt` when reading**.

## Two Doors — The IAM Policy and the Key Policy

For training to read encrypted S3 data, **the execution role must have permission to decrypt with the KMS key** (`kms:Decrypt`). And to write encrypted output, `kms:GenerateDataKey` is needed. If this is missing, you get "I granted S3 permission but get Access Denied because of KMS" — a frequently missed trap.

```text
Training container ──(1) s3:GetObject with the execution role──▶ S3 object (SSE-KMS)
                                                    │
              (2) the "encrypted data key" attached to the object must be unwrapped to read the body
                                                    ▼
                                                 KMS key
   Door A: IAM policy ── Does the execution role have kms:Decrypt attached?
   Door B: Key policy ── Does this key allow that role (or that account)?
   → Both must pass to succeed. If either is blocked, AccessDeniedException (KMS denied it)
```

Door A — the execution role's IAM policy:

```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
}
```

Door B — the key policy. Here `"Resource": "*"` means "the key this policy is attached to."

```json
{
  "Sid": "AllowSageMakerExecutionRole",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::123456789012:role/SageMakerExecutionRole" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey", "kms:CreateGrant"],
  "Resource": "*"
}
```

- If the **default statement that allows the account root** remains in the key policy, the key delegates the decision to IAM, so the role's IAM policy alone is enough to pass. If you deleted that statement or it's cross-account, you must write the Principal directly in the key policy.
- `kms:CreateGrant` is used when SageMaker is delegated use of the key for **volume encryption**. If you gave `VolumeKmsKeyId` and the job can't even start, suspect this.
- **Cross-account** needs both sides — the key policy in the key-owning account must allow the using account, and the using account's IAM policy must also allow that key ARN.

You can check which key is actually applied with describe.

```python
import boto3

sm = boto3.client("sagemaker")
d = sm.describe_training_job(TrainingJobName="my-training-job")
print(d["OutputDataConfig"].get("KmsKeyId"))            # artifact encryption key
print(d["ResourceConfig"].get("VolumeKmsKeyId"))        # volume encryption key
print(d.get("EnableInterContainerTrafficEncryption"))   # whether inter-node encryption is on

kms = boto3.client("kms")
print(kms.describe_key(KeyId="alias/ml-artifacts")["KeyMetadata"]["KeyState"])  # Enabled / Disabled
```

KMS access must pass "both doors" — the IAM policy (allow kms actions for the role) and the key policy (the key allows that role). If only one exists, it's denied. When S3 permissions are fine but reading encrypted data fails, it is almost always a KMS permission problem. On the exam, the answer to "I granted S3 access, so why doesn't it work" is very often a missing `kms:Decrypt`.

## Protecting S3 Data

The S3 bucket where training data lives is the first line of protection. Let's first split out the server-side encryption methods.

| Method | Who manages the key | Character |
|------|-------------------|------|
| **SSE-S3** | S3 manages it | Simple, but no key control or auditing |
| **SSE-KMS** | KMS (managed or CMK) | Key policy control + CloudTrail auditing. **The ML standard** |
| **SSE-C** | The caller provides the key on every request | AWS doesn't store the key. Heavy operational burden |

Things to set together at the bucket level:

- **Bucket default encryption**: once set, objects uploaded afterward are automatically encrypted that way.
- **Deny unencrypted uploads with a bucket policy**: `Deny` uploads of unencrypted objects using the `s3:x-amz-server-side-encryption` condition (the pattern from Day 1).
- **Block Public Access**: training data buckets must have public access blocked. **Versioning and Object Lock** also guard against accidental or malicious deletion.
- **Deny `aws:SecureTransport: false`**: blocks HTTP (non-TLS) access to enforce encryption in transit.

```json
{
  "Sid": "RequireKmsEncryption",
  "Effect": "Deny",
  "Principal": "*",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::ml-train-data/*",
  "Condition": {
    "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
  }
}
```

> ⚠️ **Trap**: SSE-KMS makes a KMS call every time an object is read or written. If the training data is **millions of small files**, KMS request charges and throttling become real problems. The answer is not removing encryption but **enabling S3 Bucket Keys** (reusing a bucket-level key to reduce KMS calls) and merging files.

## Model Artifacts and Inference Endpoints

When training finishes, the model artifact (`model.tar.gz`) is stored in S3, and since it is also intellectual property, it must be encrypted.

- For artifacts, specify output encryption with `OutputDataConfig.KmsKeyId`.
- For endpoints, `KmsKeyId` in EndpointConfig encrypts the hosting instance volume, and invocations are encrypted in transit with HTTPS (TLS).
- When creating an endpoint from an encrypted artifact, the **hosting execution role also** needs `kms:Decrypt` on that key. This is where the case of passing only training but getting blocked at deployment comes from.

## Secrets Management — Don't Bake Credentials Into Code

When training/inference code accesses an external DB, a third-party API, or a private data source, it may need passwords and API keys. These must not be hardcoded in code or environment variables.

| Item | AWS Secrets Manager | SSM Parameter Store (SecureString) |
|------|---------------------|-------------------------------------|
| Main use | Real "secrets" such as DB credentials and API keys | Configuration values/parameters, light secrets |
| **Automatic rotation** | **Supported** | None — manual update |
| Encryption | Always encrypted with KMS | Encrypted with KMS when SecureString type |
| Cost | Monthly fee per secret + API calls | No additional cost for standard parameters |
| Required permission | `secretsmanager:GetSecretValue` | `ssm:GetParameter` (+ `WithDecryption`) |
| When to pick it | When the requirement includes **rotation** | When rotation isn't needed and you want to save cost |

```python
# Fetch the secret at runtime from code (no hardcoding)
import boto3, json
client = boto3.client("secretsmanager")
resp = client.get_secret_value(SecretId="prod/ml/db-credentials")
creds = json.loads(resp["SecretString"])
# creds["username"], creds["password"]

# Parameter Store is enough for light configuration values and tokens
ssm = boto3.client("ssm")
token = ssm.get_parameter(Name="/ml/prod/api-token", WithDecryption=True)["Parameter"]["Value"]
```

The execution role needs the `secretsmanager:GetSecretValue` permission (restricted to the specific secret ARN) and, if the secret is encrypted with a CMK, `kms:Decrypt` on that key.

**Passing secrets as hyperparameters or environment variables** is as risky as hardcoding. Hyperparameters show up as-is in the `describe_training_job` response, and if printed to logs they remain in plaintext in CloudWatch Logs. Fetch the secret through an API at runtime and use it only in memory.

Secrets Manager vs. Parameter Store is an easily confused comparison. The key difference is "automatic rotation" — if periodic rotation is needed like a DB password, use Secrets Manager; for simple configuration values or tokens, save cost with Parameter Store (SecureString). What they share is "keep the secret outside code and fetch it at runtime." A situation where you see hardcoded credentials almost always has one of these two as the answer.

## When Encryption Gets Blocked: Symptom → Cause → Action

Encryption failures mostly converge on "where did we not grant permission."

| Symptom | Common cause | Action |
|------|-----------|------|
| AccessDenied despite having S3 read permission | The object is SSE-KMS but the role lacks `kms:Decrypt` | Add `kms:Decrypt` on the key ARN to the role policy |
| Denied even though kms permission was given in IAM | The key policy doesn't allow that role (or account root) | Explicitly add the role Principal to the key policy |
| Failure to decrypt another account's encrypted data | Cross-account needs **both** the key policy and the IAM policy | Allow the using account in the key-owning account's key policy + kms permission on the using account's role |
| Fails only at the step that saves the training result | Missing `kms:GenerateDataKey` on the output key | Add `kms:GenerateDataKey` to the role and key policy |
| A job with `VolumeKmsKeyId` can't even start | Missing `kms:CreateGrant`, or the key state is Disabled | Add the permission, then check `KeyState` with `describe_key` |
| Uploads are suddenly denied | A bucket policy `Deny`s unencrypted uploads | Specify SSE-KMS at upload or set bucket default encryption |
| KMS request charges/throttling spike | Repeated access to many small objects with SSE-KMS | Enable S3 Bucket Keys, merge files |

When you hit an access failure, **first sort out "which service denied it."** Looking at the event source in CloudTrail reveals whether S3 or KMS blocked it, and that alone determines the action. Skipping this distinction leads to widening perfectly fine S3 permissions over and over, weakening security as well.

Tomorrow we move from security to cost — how to run ML workloads cheaply.

## 📖 Glossary

- **Encryption at rest** : encrypting data stored on disk/storage. S3 objects, EBS volumes, and model artifacts are the targets.
- **Encryption in transit** : encrypting data moving across the network. TLS/HTTPS and inter-node traffic encryption belong here.
- **KMS** : AWS's key management service. SageMaker encryption works by specifying "which KMS key to use."
- **Customer managed key (CMK)** : a KMS key you create yourself and control with a key policy. Cross-account sharing, disabling, and auditing are possible.
- **Key policy** : the policy attached to the KMS key itself. Even if a role has IAM permission, decryption is denied if the key policy blocks it.
- **Envelope encryption** : a method where data is encrypted with a one-time data key, and that data key is wrapped again with a KMS key and stored.
- **SSE-KMS / SSE-S3** : S3 server-side encryption methods. SSE-KMS allows key control and auditing, while SSE-S3 is simple but you can't control the key.
- **VolumeKmsKeyId** : a parameter that specifies the KMS key to encrypt the EBS/local volume attached to training/batch job instances.
- **EnableInterContainerTrafficEncryption** : a switch that encrypts data between nodes (containers) in distributed training. It is a different setting from network isolation.
- **crypto-shredding** : a technique of making data effectively unreadable by destroying the encryption key or cutting off access instead of deleting the data.

---

## 📝 Practice Questions

**Question 1.** Even though the training job's execution role was granted `s3:GetObject` on the training data bucket, Access Denied occurs when reading a KMS-encrypted object. What is the most appropriate solution?

A) Switch the bucket to public  
B) Grant the execution role `kms:Decrypt` on the KMS key, and also allow that role in the key policy  
C) Turn off S3 versioning  
D) Increase the instance type  

**Answer: B**  
Explanation: To read an object encrypted with SSE-KMS, besides S3 permission, the KMS key decryption permission must be allowed in both the IAM policy and the key policy, so you must grant `kms:Decrypt` to the role and also allow the role in the key policy. A worsens security, and C and D are unrelated to decryption permission and don't solve the problem.

---

**Question 2.** Regulatory requirements say both the model artifact and the training instance volume must be encrypted with a key the customer can control and audit. What is the most appropriate setting?

A) Encrypt only the artifact with an AWS managed key  
B) Specify a customer managed key (CMK) in `OutputDataConfig.KmsKeyId` and `ResourceConfig.VolumeKmsKeyId`  
C) Only strengthen IAM policies without encryption  
D) Enable only encryption in transit  

**Answer: B**  
Explanation: For the customer to control access with a key policy and audit usage with CloudTrail, a CMK is required, and specifying it in `OutputDataConfig.KmsKeyId` for the artifact and `ResourceConfig.VolumeKmsKeyId` for the volume encrypts both at rest. A leaves out the volume and uses a managed key with weaker control, C has no encryption at all, and D doesn't meet the encryption-at-rest requirement.

---

**Question 3.** In distributed (multi-node) training, there is a requirement to encrypt even the communication data between nodes. What is the appropriate setting?

A) Set `EnableInterContainerTrafficEncryption` to true  
B) Set only `OutputDataConfig.KmsKeyId`  
C) Handle it with an S3 bucket policy  
D) Set `EnableNetworkIsolation` to true  

**Answer: A**  
Explanation: The dedicated setting that encrypts data transferred between distributed training nodes (between containers) is `EnableInterContainerTrafficEncryption`. B is output artifact (at rest) encryption, C concerns data stored in S3, and D blocks outbound traffic but is not encryption of inter-node transfers.

---

**Question 4.** Training code needs to access an external database, so it needs credentials. The DB password must be rotated automatically on a regular basis. What is the most appropriate method?

A) Hardcode the DB password in the training code  
B) Store the credentials in AWS Secrets Manager, configure automatic rotation, and fetch them at runtime  
C) Put it in an environment variable in plaintext  
D) Store it as a plaintext file in S3  

**Answer: B**  
Explanation: The service that keeps credentials outside code and also supports automatic rotation is Secrets Manager, so storing them there and fetching them through the API at runtime is appropriate. A, C, and D all expose credentials in plaintext and have no rotation capability, directly contradicting security principles.

---

**Question 5.** For the training data S3 bucket, there is a requirement to "block uploads of unencrypted objects." What is the most effective measure?

A) Add a condition to the bucket policy that `Deny`s `s3:PutObject` when `s3:x-amz-server-side-encryption` is not `aws:kms`  
B) Enable versioning on the bucket  
C) Set a CloudWatch alarm  
D) Manually encrypt the objects later  

**Answer: A**  
Explanation: A bucket policy that checks the encryption header at upload and denies if it isn't KMS is the most effective way to block uploads of unencrypted objects at the source. B is deletion protection, not enforcing encryption; C is only after-the-fact detection, not blocking; and D is manual work after the data has already been stored in plaintext, so it doesn't prevent anything.

---
