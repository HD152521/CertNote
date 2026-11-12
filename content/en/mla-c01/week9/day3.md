# Day 3 - Data and Model Protection: KMS Encryption and Secrets

## 📌 Key Takeaways

- Encryption has two axes: **at rest (KMS)** and **in transit (TLS, node-to-node)**. Regulated scenarios almost always require both.
- Three spots to memorize for training jobs: `OutputDataConfig.KmsKeyId` (artifacts), `ResourceConfig.VolumeKmsKeyId` (volumes), and `EnableInterContainerTrafficEncryption` (node-to-node).
- A **customer managed key (CMK)** lets you control access through the key policy, and you can audit it with CloudTrail and even disable it, which makes it the default in regulated environments.
- KMS access must pass **both the IAM policy and the key policy**. "I granted S3 permissions but still got Access Denied" is, most of the time, a missing `kms:Decrypt`.
- Keep credentials out of code: use **Secrets Manager** when you need automatic rotation, and **Parameter Store (SecureString)** for simple configuration values and tokens.

## Two Kinds of Encryption — At Rest vs In Transit

Permissions (Day 1) and networking (Day 2) controlled "who can access and where does traffic flow." Today we protect the data and the models themselves with encryption. Encryption splits by **where the data is**.

| Category | Encryption at rest | Encryption in transit |
|----------|--------------------|------------------------|
| What it protects | Data "sitting still" on disk or storage | Data "moving" across the network |
| Typical ML assets | S3 training data, EBS/local volumes, model artifacts | S3↔container, between distributed training nodes, endpoint invocations |
| How it is implemented | KMS keys (SSE-KMS, `VolumeKmsKeyId`) | TLS/HTTPS, `EnableInterContainerTrafficEncryption` |
| Threats it blocks | Leaked disks, snapshots, or buckets | Eavesdropping, man-in-the-middle |
| Easy to miss | Key-use permission is needed **separately** from storage permission | Node-to-node encryption is not the default; you must **set it explicitly** |

```text
[Data Flow and Encryption Points]
S3 (at-rest, SSE-KMS) ──TLS──▶ Training container
                                  │  EBS/local volume (at-rest, VolumeKmsKeyId)
                                  │  Node-to-node (in-transit, inter-container encryption)
                                  ▼
S3 model artifacts (at-rest, OutputDataConfig KmsKeyId)
                                  ▼
Endpoint volume (at-rest, EndpointConfig KmsKeyId) ──HTTPS──▶ Client
```

Encryption is complete only when it covers both "data standing still" and "data in motion." Encryption at rest keeps a stolen disk unreadable, and encryption in transit keeps a wiretapped network unreadable. Regulations (HIPAA, PCI, and so on) almost always require both. On the exam, answer choices that say "at-rest only" or "in-transit only" are usually incomplete.

## Where to Configure Encryption for Each Asset

What the exam really asks is "**which parameter** do I touch to encrypt this asset?"

| Asset | Where it is configured | What gets encrypted |
|-------|------------------------|----------------------|
| Training input data | S3 bucket default encryption / SSE-KMS at upload | The dataset stored in S3 |
| Training instance volume | `ResourceConfig.VolumeKmsKeyId` | EBS and local storage attached to the instance |
| Model artifact | `OutputDataConfig.KmsKeyId` | The S3 output where `model.tar.gz` is uploaded |
| Node-to-node communication | `EnableInterContainerTrafficEncryption: true` | Data moving between distributed training containers |
| Batch transform | `TransformOutput.KmsKeyId` / `TransformResources.VolumeKmsKeyId` | Batch inference results in S3 / the job volume |
| Inference endpoint | `KmsKeyId` in EndpointConfig | The volume attached to the hosting instance |

Here is how the three spots appear together in a training job request:

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

- `OutputDataConfig.KmsKeyId` → encrypts the model artifacts (S3 output)
- `ResourceConfig.VolumeKmsKeyId` → encrypts the EBS/local volume of the training instance
- `EnableInterContainerTrafficEncryption` → encrypts the data transferred between distributed training nodes

> ⚠️ **Trap**: Node-to-node encryption only matters with two or more instances, and turning it on can slow training because of communication overhead. It is also **a different setting from network isolation (`EnableNetworkIsolation`)** — isolation cuts off external communication, while this encrypts the content being transferred.

## KMS — The Center of Key Management

AWS KMS is the service that creates and manages encryption keys. Almost all SageMaker encryption works by specifying "which KMS key to use." There are two kinds of keys, and choosing between them is the fork in the road.

| Item | AWS managed key (`aws/sagemaker`, etc.) | Customer managed key (CMK) |
|------|------------------------------------------|----------------------------|
| Who creates it | The service creates it automatically in your account | You create and name it yourself |
| Key policy editing | Not possible | Possible — you directly control who can use it |
| Cross-account sharing | Not possible | Possible (allow other accounts through the key policy) |
| Disable / delete | Not possible | Possible → crypto-shredding |
| Auditing | Usage recorded in CloudTrail | CloudTrail + per-key access control |
| When to choose it | When you just need default encryption quickly | When regulation, auditing, cross-account use, or key control is required |

The real value of a CMK is that "the key policy controls access, and turning the key off locks the data." Without deleting the data itself, cutting off access to the key effectively makes the data unreadable (crypto-shredding). Key usage is also recorded in CloudTrail, so you can audit "who decrypted this data, and when." That is the core reason to use a CMK instead of an AWS managed key.

KMS does not encrypt large data directly (**envelope encryption**). Data is encrypted with a one-time data key obtained from `GenerateDataKey`, and that data key is wrapped with the KMS key and stored alongside it. When reading, the data key is unwrapped first with `Decrypt`. This is why permissions split in two — **`kms:GenerateDataKey` when writing, `kms:Decrypt` when reading**.

## Two Doors — The IAM Policy and the Key Policy

For training to read encrypted S3 data, the **execution role must be allowed to decrypt with the KMS key** (`kms:Decrypt`). To write encrypted output, it needs `kms:GenerateDataKey`. If either is missing, you get "S3 permission granted, but Access Denied because of KMS" — a trap that people often miss.

```text
Training container ──(1) s3:GetObject with the execution role──▶ S3 object (SSE-KMS)
                                                    │
              (2) The "encrypted data key" attached to the object must be unwrapped to read the body
                                                    ▼
                                                 KMS key
   Door A: IAM policy ── Does the execution role have kms:Decrypt attached?
   Door B: Key policy ── Does this key allow that role (or that account)?
   → Both must pass to succeed. If either one blocks, AccessDeniedException (KMS denied it)
```

Door A — the IAM policy on the execution role:

```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
}
```

Door B — the key policy. Here `"Resource": "*"` means "the very key this policy is attached to."

```json
{
  "Sid": "AllowSageMakerExecutionRole",
  "Effect": "Allow",
  "Principal": { "AWS": "arn:aws:iam::123456789012:role/SageMakerExecutionRole" },
  "Action": ["kms:Decrypt", "kms:GenerateDataKey", "kms:CreateGrant"],
  "Resource": "*"
}
```

- If the **default statement that allows the account root** is still in the key policy, the key delegates the decision to IAM, so the role's IAM policy alone is enough to pass. If you removed that statement, or the access is cross-account, you must write the Principal directly in the key policy.
- `kms:CreateGrant` is used when SageMaker is delegated use of the key for **volume encryption**. If you supplied `VolumeKmsKeyId` and the job cannot even start, suspect this.
- **Cross-account** access needs both sides — the key policy in the key-owning account must allow the using account, and the using account's IAM policy must also allow that key ARN.

To check which keys are actually in effect, use describe.

```python
import boto3

sm = boto3.client("sagemaker")
d = sm.describe_training_job(TrainingJobName="my-training-job")
print(d["OutputDataConfig"].get("KmsKeyId"))            # Artifact encryption key
print(d["ResourceConfig"].get("VolumeKmsKeyId"))        # Volume encryption key
print(d.get("EnableInterContainerTrafficEncryption"))   # Whether node-to-node encryption is on

kms = boto3.client("kms")
print(kms.describe_key(KeyId="alias/ml-artifacts")["KeyMetadata"]["KeyState"])  # Enabled / Disabled
```

KMS access must pass "both doors" — the IAM policy (the role allows the kms actions) and the key policy (the key allows that role). Having only one of them results in a denial. When S3 permissions are fine but reading encrypted data fails, it is almost always a KMS permission problem. On the exam, the answer to "I granted S3, so why does it still fail?" is very often a missing `kms:Decrypt`.

## S3 Data Protection

The S3 bucket that holds the training data is the first gate of protection. Start by separating the server-side encryption methods.

| Method | Who manages the key | Character |
|--------|---------------------|-----------|
| **SSE-S3** | Managed by S3 | Simple, but no key control or auditing |
| **SSE-KMS** | KMS (managed key or CMK) | Key policy control + CloudTrail auditing. **The ML standard** |
| **SSE-C** | The caller supplies the key with every request | AWS does not store the key. Heavy operational burden |

Things to set at the bucket level as well:

- **Bucket default encryption**: Once set, objects uploaded afterward are automatically encrypted with that method.
- **Deny unencrypted uploads with a bucket policy**: Use the `s3:x-amz-server-side-encryption` condition to `Deny` uploads of unencrypted objects (the pattern from Day 1).
- **Block Public Access**: A training data bucket must always block public access. **Versioning and Object Lock** also protect against accidental or malicious deletion.
- **Deny `aws:SecureTransport: false`**: Blocks HTTP (non-TLS) access to enforce encryption in transit.

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

> ⚠️ **Trap**: With SSE-KMS, a KMS call happens every time an object is read or written. If the training data is **millions of small files**, KMS request charges and throttling become a real problem. The answer is not to turn encryption off but to **enable S3 Bucket Keys** (reusing a bucket-level key to reduce KMS calls) and to merge files.

## Model Artifacts and Inference Endpoints

When training finishes, the model artifact (`model.tar.gz`) is stored in S3. It is also intellectual property, so it must be encrypted.

- For artifacts, specify output encryption with `OutputDataConfig.KmsKeyId`.
- For endpoints, `KmsKeyId` in EndpointConfig encrypts the hosting instance volume, and invocations are encrypted in transit with HTTPS (TLS).
- When you create an endpoint from an encrypted artifact, the **hosting execution role also** needs `kms:Decrypt` on that key. This is where cases come from in which training passes but deployment is blocked.

## Secrets Management — Do Not Bake Credentials into Code

Training and inference code may need passwords or API keys to reach an external DB, a third-party API, or a private data source. Never hardcode them in code or environment variables.

| Item | AWS Secrets Manager | SSM Parameter Store (SecureString) |
|------|---------------------|-------------------------------------|
| Main use | Real "secrets" such as DB credentials and API keys | Configuration values and parameters, lightweight secrets |
| **Automatic rotation** | **Supported** | None — manual updates |
| Encryption | Always encrypted with KMS | Encrypted with KMS when the type is SecureString |
| Cost | Monthly fee per secret + API calls | Standard parameters have no additional cost |
| Permissions needed | `secretsmanager:GetSecretValue` | `ssm:GetParameter` (+ `WithDecryption`) |
| When to choose it | When the requirements include **rotation** | When rotation is not needed and you want to save cost |

```python
# Fetch the secret at runtime in code (never hardcode)
import boto3, json
client = boto3.client("secretsmanager")
resp = client.get_secret_value(SecretId="prod/ml/db-credentials")
creds = json.loads(resp["SecretString"])
# creds["username"], creds["password"]

# Parameter Store is enough for lightweight configuration values and tokens
ssm = boto3.client("ssm")
token = ssm.get_parameter(Name="/ml/prod/api-token", WithDecryption=True)["Parameter"]["Value"]
```

The execution role needs the `secretsmanager:GetSecretValue` permission (scoped to the specific secret ARN) and, if the secret is encrypted with a CMK, `kms:Decrypt` on that key.

**Passing secrets as hyperparameters or environment variables** is just as dangerous as hardcoding. Hyperparameters appear as they are in the `describe_training_job` response, and if they get printed to logs they remain in plaintext in CloudWatch Logs. Fetch secrets through the API at runtime and use them only in memory.

Secrets Manager vs Parameter Store is an easy comparison to confuse. The key difference is "automatic rotation" — if you need periodic rotation, like a DB password, use Secrets Manager; for simple configuration values or tokens, use Parameter Store (SecureString) to save cost. What they share is "keep the secret outside the code and fetch it at runtime." When you see a situation with hardcoded credentials, the answer is almost always one of these two.

## When Encryption Blocks You: Symptom → Cause → Fix

Most encryption failures converge on "where did I forget to grant permission."

| Symptom | Common cause | Fix |
|---------|--------------|-----|
| AccessDenied even though S3 read permission exists | It is an SSE-KMS object and the role lacks `kms:Decrypt` | Add `kms:Decrypt` on that key ARN to the role policy |
| Denied even though kms permission was given in IAM | The key policy does not allow that role (or the account root) | Explicitly add the role Principal to the key policy |
| Fails to decrypt another account's encrypted data | Cross-account needs **both** the key policy and the IAM policy | Allow the using account in the key-owning account's key policy + grant kms permission to the using account's role |
| Fails only at the step that saves training results | Missing `kms:GenerateDataKey` on the output key | Add `kms:GenerateDataKey` to the role and key policy |
| A job with `VolumeKmsKeyId` cannot even start | `kms:CreateGrant` is missing or the key state is Disabled | After adding the permission, check `KeyState` with `describe_key` |
| Uploads are suddenly rejected | The bucket policy `Deny`s unencrypted uploads | Specify SSE-KMS on upload or set bucket default encryption |
| KMS request charges or throttling spike | Repeated SSE-KMS access to many small objects | Enable S3 Bucket Keys, merge files |

When you hit an access failure, **first separate "which service denied it."** The event source in CloudTrail reveals whether S3 or KMS blocked it, and that alone decides the fix. If you skip this distinction, you keep widening perfectly good S3 permissions and end up weakening security.

Tomorrow we move from security to cost — how to run ML workloads cheaply.

## 📖 Glossary

- **Encryption at rest** : Encrypting data stored on disk or storage. The targets are S3 objects, EBS volumes, and model artifacts.
- **Encryption in transit** : Encrypting data moving across the network. TLS/HTTPS and node-to-node traffic encryption belong here.
- **KMS** : AWS's key management service. SageMaker encryption works by specifying "which KMS key to use."
- **Customer managed key (CMK)** : A KMS key you create yourself and control with the key policy. It can be shared across accounts, disabled, and audited.
- **Key policy** : The policy attached to the KMS key itself. Even if the role has IAM permission, decryption is denied if the key policy blocks it.
- **Envelope encryption** : A method where data is encrypted with a one-time data key, and that data key is wrapped again with the KMS key and stored.
- **SSE-KMS / SSE-S3** : S3 server-side encryption methods. SSE-KMS allows key control and auditing; SSE-S3 is simple but you cannot control the key.
- **VolumeKmsKeyId** : The parameter that specifies the KMS key for encrypting the EBS/local volume attached to training and batch job instances.
- **EnableInterContainerTrafficEncryption** : The switch that encrypts data between nodes (containers) in distributed training. It is a different setting from network isolation.
- **crypto-shredding** : A technique that makes data effectively unreadable by destroying the encryption key or cutting off access to it instead of deleting the data.

---

## 📝 Practice Questions

**Question 1.** You granted the training job's execution role `s3:GetObject` on the training data bucket, but reading KMS-encrypted objects still produces Access Denied. What is the most appropriate fix?

A) Make the bucket public  
B) Grant the execution role `kms:Decrypt` on that KMS key, and also allow the role in the key policy  
C) Turn off S3 versioning  
D) Increase the instance type  

**Answer: B**  
Explanation: To read objects encrypted with SSE-KMS, besides S3 permissions, KMS key decrypt permission must be allowed in both the IAM policy and the key policy, so you must give the role `kms:Decrypt` and also allow the role in the key policy. A worsens security, and C and D are unrelated to decryption permission and do not solve the problem.

---

**Question 2.** Due to regulatory requirements, both model artifacts and the training instance volume must be encrypted with a key that the customer can control and audit. Which setting is the most appropriate?

A) Encrypt only the artifacts with an AWS managed key  
B) Specify a customer managed key (CMK) in `OutputDataConfig.KmsKeyId` and `ResourceConfig.VolumeKmsKeyId`  
C) Only tighten IAM policies without encryption  
D) Enable only encryption in transit  

**Answer: B**  
Explanation: For the customer to control access through the key policy and audit usage through CloudTrail, a CMK is required, and specifying it in `OutputDataConfig.KmsKeyId` for artifacts and `ResourceConfig.VolumeKmsKeyId` for the volume encrypts both at rest. A omits the volume and uses a managed key with weaker control, C has no encryption at all, and D does not meet the encryption-at-rest requirement.

---

**Question 3.** In distributed (multi-node) training, there is a requirement to encrypt even the data exchanged between nodes. Which setting is appropriate?

A) Set `EnableInterContainerTrafficEncryption` to true  
B) Set only `OutputDataConfig.KmsKeyId`  
C) Handle it with an S3 bucket policy  
D) Set `EnableNetworkIsolation` to true  

**Answer: A**  
Explanation: The dedicated setting for encrypting data transmitted between distributed training nodes (between containers) is `EnableInterContainerTrafficEncryption`. B is encryption of output artifacts (at rest), C concerns data stored in S3, and D blocks outbound traffic rather than encrypting node-to-node transmission.

---

**Question 4.** Training code needs to access an external database and therefore needs credentials. The DB password must be rotated automatically on a regular basis. Which is the most appropriate method?

A) Hardcode the DB password in the training code  
B) Store the credentials in AWS Secrets Manager, configure automatic rotation, and retrieve them at runtime  
C) Put it in an environment variable in plaintext  
D) Store it as a plaintext file in S3  

**Answer: B**  
Explanation: The service that keeps credentials out of code and supports automatic rotation is Secrets Manager, so storing them there and retrieving them through the API at runtime is appropriate. A, C, and D all expose the credentials in plaintext and have no rotation capability, directly violating security principles.

---

**Question 5.** There is a requirement to "prevent unencrypted objects from being uploaded" to the training data S3 bucket. What is the most effective measure?

A) Add a bucket policy condition that `Deny`s `s3:PutObject` when `s3:x-amz-server-side-encryption` is not `aws:kms`  
B) Enable versioning on the bucket  
C) Set up a CloudWatch alarm  
D) Manually encrypt the objects later  

**Answer: A**  
Explanation: A bucket policy that checks the encryption header on upload and rejects anything that is not KMS is the most effective way to block unencrypted object uploads at the source. B is deletion protection, not encryption enforcement, C is only after-the-fact detection, not blocking, and D is manual work after the data has already been stored in plaintext, so it does not prevent anything.

---
