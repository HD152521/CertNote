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
