# Day 3 - ML Security: IAM Execution Roles, VPC Isolation, KMS Encryption

ML systems concentrate sensitive training data, valuable model artifacts, and broad permissions in one place. If these leak, data theft, model stealing, and privilege abuse follow. Today we cover SageMaker-focused three pillars protecting ML workloads — IAM execution roles (who can do what), VPC isolation (where communication goes), KMS encryption (protect data at rest/in transit).

## IAM Execution Roles: Least Privilege Principle

SageMaker training jobs and endpoints operate with **Execution Role** permissions, not user credentials. Over-permissioning this role magnifies breach damage. Grant only minimum privileges to needed S3 paths and KMS keys.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": [
        "arn:aws:s3:::ml-train-bucket/data/*",
        "arn:aws:s3:::ml-train-bucket/output/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt", "kms:GenerateDataKey"],
      "Resource": "arn:aws:kms:us-east-1:111122223333:key/abcd-efgh"
    }
  ]
}
```

Trust Policy further restricts who can assume this role.

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "sagemaker.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

> 💡 **Related Theory**: On exams, "training job can't access S3 (AccessDenied)" is almost always **execution role permission shortage**, not user permissions. Conversely, "role can access all buckets" = least privilege violation. Remember the permission principal is the execution role.

## VPC Isolation: Training Without Internet

By default, SageMaker jobs can access the internet from AWS-managed networks. Sensitive data must block this. Use `VpcConfig` to place jobs in user VPC private subnets, access S3 etc. via **VPC Endpoints** without internet.

```python
estimator = Estimator(
    image_uri=image, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    subnets=["subnet-priv-a", "subnet-priv-b"],
    security_group_ids=["sg-0123456789"],
    encrypt_inter_container_traffic=True,   # encrypt distributed training nodes
    enable_network_isolation=True,          # block container external network
)
```

- **Network Isolation**: Block any network calls from container (isolate-run external code/models).
- **VPC Endpoint (Gateway)**: S3, DynamoDB via gateway endpoints for private access.
- **VPC Endpoint (Interface/PrivateLink)**: SageMaker API/Runtime, CloudWatch via interface endpoints.

```text
[Private Subnet]
  Training container ──(VPC Gateway Endpoint)──▶ S3
       │
       └──(Interface Endpoint/PrivateLink)──▶ SageMaker API
  (no internet gateway route)
```

## KMS Encryption: Protect at Rest and in Transit

Encrypt data and models both at rest and in transit. KMS customer-managed keys (CMK) control who can decrypt.

```python
estimator = Estimator(
    ...,
    output_kms_key="arn:aws:kms:us-east-1:111122223333:key/abcd-efgh",   # encrypt model artifacts
    volume_kms_key="arn:aws:kms:us-east-1:111122223333:key/wxyz-1234",   # encrypt training EBS
)
```

| Protection Point | Method |
|-----------|------|
| Training data/models in S3 | SSE-KMS (CMK) encrypt bucket/objects |
| Training instance storage | `volume_kms_key` encrypts EBS |
| Model artifact output | `output_kms_key` |
| Distributed training traffic between nodes | `encrypt_inter_container_traffic=True` |
| Endpoint communication | TLS (in-transit encryption default) |

> 💡 **Related Theory**: "Encryption is on, but who can use the key?" is the real control point. KMS **key policy** and IAM work together; if key policy denies, decryption fails even with IAM permission. Patterns like separate CMK per team/project for data isolation appear frequently on exams.

## Data & Model Protection Support Services

```text
- Amazon Macie: Auto-detect/classify PII and sensitive info in S3
- SageMaker Clarify: Detect data/model bias (security-adjacent, responsible AI)
- AWS PrivateLink: Private SageMaker calls without internet
- Secrets Manager: Manage external DB/API credentials outside code
- CloudTrail: Audit all API calls (covered tomorrow)
```

## Summary

ML security's three pillars are clear. IAM execution roles enforce least privilege. VPC isolation (private subnets, VPC Endpoints, network isolation) keep data off internet. KMS encrypts data at rest/in transit and model artifacts, with key policy controlling decryption principals. Macie, PrivateLink, Secrets Manager reinforce these.

Tomorrow: the other half of operations — cost optimization, CloudWatch/CloudTrail logging & audit, disaster recovery.

---

## 📝 Practice Questions

**Question 1.** Due to regulatory requirements, a training job must never have access to the internet, and it must access the S3 bucket holding the training data without traversing the internet. Which configuration is MOST appropriate?

A) Place it in a public subnet and only strengthen the security group  
B) Route all traffic through a NAT gateway  
C) Private subnet + VPC (gateway) endpoint for S3 + network isolation  
D) Assign a public IP to the endpoint  

**Answer: C**  
Explanation: Placing the job in a private subnet, accessing S3 privately through an S3 VPC endpoint, and blocking outbound calls with network isolation together satisfy the no-internet-access requirement. Public subnets/IPs (A, D) and NAT (B) all create an internet path.

---

**Question 2.** A SageMaker training job receives AccessDenied when accessing an S3 bucket. The user can read the same bucket in the console without problems. What is the MOST likely cause?

A) The user's IAM permissions are insufficient  
B) The training job's execution role does not have the relevant S3 permissions  
C) The Region is wrong  
D) The instance type is too small  

**Answer: B**  
Explanation: A training job runs with the permissions of its execution role, not the user's credentials, so even if the user has access, the job is denied if the execution role lacks permissions. User permissions (A) are unrelated to job execution, and the Region (C) and instance (D) are not causes of AccessDenied.

---

**Question 3.** You want to isolate training data and model artifacts by project team so that teams cannot decrypt each other's data. Which approach is MOST effective?

A) All teams share the same AWS managed key  
B) Turn off encryption and use only bucket policies  
C) Leave the data in plaintext but only separate IAM users  
D) Use a separate KMS customer managed key (CMK) for each team and separate access with key policies  

**Answer: D**  
Explanation: Separating even who can decrypt with per-team CMKs and key policies enforces data isolation, because access is blocked by the key policy even if IAM permissions exist. A shared key (A) fails isolation, and disabling encryption (B, C) gives up protection of data at rest.

---

**Question 4.** In distributed training, you want to ensure that training data passing between nodes does not flow over the network in plaintext. Which option should you set on the SageMaker Estimator?

A) enable_network_isolation=True  
B) Specify output_kms_key  
C) encrypt_inter_container_traffic=True  
D) sampling_percentage=100  

**Answer: C**  
Explanation: encrypt_inter_container_traffic encrypts traffic between distributed training containers. network_isolation (A) blocks external network access, output_kms_key (B) encrypts stored artifacts, and sampling (D) is a Data Capture option.

---

**Question 5.** You want to automatically detect and classify whether PII such as credit card numbers is unintentionally included in a training dataset stored in S3. Which service is MOST appropriate?

A) Amazon Macie  
B) AWS KMS  
C) Amazon Comprehend Medical  
D) AWS Shield  

**Answer: A**  
Explanation: Macie is a data security service that uses machine learning to automatically detect and classify PII and sensitive information in S3. KMS (B) manages encryption keys, Comprehend Medical (C) extracts medical text, and Shield (D) provides DDoS protection.

---
