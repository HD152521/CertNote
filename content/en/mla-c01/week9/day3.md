# Day 3 - Data and Model Protection: KMS Encryption and Secrets

You've controlled access (Day 1) and network paths (Day 2). Now protect the data and models themselves through encryption. ML pipelines have assets everywhere needing protection — training data in S3, running disks/volumes, node-to-node communication, model artifacts in S3, external credentials. Today: **encryption at rest**, **encryption in transit**, **KMS key management**, **Secrets management**.

## Two Types of Encryption — At-Rest vs In-Transit

Encryption splits by data location.

- **Encryption at rest**: Data "sitting still" on disk/storage. S3 objects, EBS volumes, local training instance storage. Protected by KMS keys.
- **Encryption in transit**: Data "moving" over networks. S3↔container, distributed training node-to-node communication. Protected by TLS/HTTPS and node encryption.

```text
[Data Flow and Encryption Points]
S3 (at-rest, SSE-KMS) ──TLS──▶ Training container
                                  │  EBS/local volume (at-rest, VolumeKmsKeyId)
                                  │  Node-to-node (in-transit, inter-container encryption)
                                  ▼
S3 Model Artifacts (at-rest, OutputDataConfig KmsKeyId)
```

> 💡 **Related Theory**: Complete encryption blocks data "standing still" AND "moving." At-rest prevents disk theft; in-transit prevents network eavesdropping. Regulations (HIPAA, PCI) require both. Exam questions with "at-rest only" or "in-transit only" are typically incomplete answers.

## KMS — The Key Management Center

AWS KMS creates and manages encryption keys. Nearly all SageMaker encryption works by specifying KMS keys.

- **AWS-managed keys** (`aws/sagemaker`, etc.): Built-in, simple setup, but fine-grained key policy control is hard.
- **Customer-managed keys (CMK)**: Keys you create. **Key policies control who uses the key**, enable rotation/deletion/audit. Regulated environments almost always use CMK.

Training job encryption locations:

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

- `OutputDataConfig.KmsKeyId` → model artifacts (S3 output) encryption
- `ResourceConfig.VolumeKmsKeyId` → training instance EBS/local volume encryption
- `EnableInterContainerTrafficEncryption` → distributed training node-to-node encryption

> 💡 **Related Theory**: CMK's real value: "key policies control access, and turning off the key locks data." Without deleting data, cutting key access makes it unreadable (crypto-shredding). Key usage appears in CloudTrail: "who decrypted this data when?" This audit trail is why CMK beats AWS-managed keys in regulated environments.

## S3 Data Protection

Training data's S3 is the first line of defense.

- **SSE-KMS**: Server-side encryption with KMS. CMK means key access control too. ML standard.
- **SSE-S3**: S3-managed keys. Simple but no key control.
- **Bucket policy blocking unencrypted uploads**: Use `s3:x-amz-server-side-encryption` condition to `Deny` non-encrypted object uploads.
- **Block Public Access**: Training data buckets must block public access.
- **Versioning, object lock**: Protect against accidental/malicious deletion.

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

## Execution Role Needs KMS Permissions

To read encrypted S3 data, the **execution role needs `kms:Decrypt`** permission. To write encrypted output, needs `kms:GenerateDataKey`. Missing this causes "S3 access okay, but KMS Access Denied"—a common trap.

```json
{
  "Effect": "Allow",
  "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
  "Resource": "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
}
```

Additionally, the **CMK's key policy** must allow the execution role (KMS uses both IAM policy and key policy).

> 💡 **Related Theory**: KMS access is a "two-door" check — IAM policy (role has kms action) AND key policy (key allows that role). Missing either = denied. "S3 given but still denied" on encrypted data almost always means missing `kms:Decrypt`. Very common exam scenario.

## Model Artifact Encryption

After training, model artifacts (`model.tar.gz`) save to S3 as intellectual property and need encryption. Inference endpoints also encrypt hosting instance volumes via `KmsKeyId` and use HTTPS (TLS) for call encryption.

## Secrets Management — Never Hardcode Credentials

Training/inference code may need external DB passwords, third-party API keys, private data source auth. Never hardcode these in code or env vars.

- **AWS Secrets Manager**: Stores passwords, API keys, DB credentials. Supports **automatic rotation**. Code fetches at runtime via API.
- **SSM Parameter Store (SecureString)**: Lighter config values and secrets. KMS-encrypted. Manual rotation.

```python
# Fetch secrets at runtime (never hardcode)
import boto3, json
client = boto3.client("secretsmanager")
resp = client.get_secret_value(SecretId="prod/ml/db-credentials")
creds = json.loads(resp["SecretString"])
# creds["username"], creds["password"]
```

Execution role needs `secretsmanager:GetSecretValue` (scoped to specific secret ARN) and, if secret uses CMK, that key's `kms:Decrypt`.

> 💡 **Related Theory**: Secrets Manager vs Parameter Store is an exam classic. Key difference: **automatic rotation**. DB passwords need periodic rotation? → Secrets Manager. Simple config or token? → Parameter Store (save cost). Both mean "keep secrets outside code, fetch at runtime." Hardcoded credentials → almost always the answer is one of these.

## Summary

Today in one sentence: **Protect data at rest (KMS) and in transit (TLS, node encryption) both; manage keys with CMK for control and audit; keep credentials out of code via Secrets Manager/Parameter Store.** In training jobs, remember `OutputDataConfig.KmsKeyId` (artifacts), `VolumeKmsKeyId` (volumes), `EnableInterContainerTrafficEncryption` (node-to-node). Encrypted data read failures trace to execution role missing `kms:Decrypt` or key policy not allowing the role.

Tomorrow: cost optimization—bringing it all together with Spot training, right-sizing, and budget controls.

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
