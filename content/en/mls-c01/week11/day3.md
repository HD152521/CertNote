# Day 3 - ML Security: IAM Execution Roles, VPC Isolation, KMS Encryption

## 📌 Key Takeaways

- ML security rests on three pillars: **IAM execution roles** (who does what), **VPC isolation** (where traffic goes), and **KMS encryption** (who can unlock it).
- SageMaker training jobs and endpoints run with an **Execution Role, not the user's credentials**. When you see `AccessDenied`, suspect the execution role first.
- A requirement that "it must never reach the internet" is met by the combination of **private subnets + VPC endpoints + `enable_network_isolation`**.
- With encryption, the key question is not turning it on but **who can use the key**. Decryption works only when the **KMS key policy and the IAM policy both allow it**.
- Separating CMKs per team or project enforces data isolation: even with IAM permissions, the key policy blocks access.

## The Three Security Pillars at a Glance

An ML system gathers sensitive training data, expensive model artifacts, and broad permissions in one place. If it leaks, data theft, model theft, and permission abuse all happen at once.

```text
                    ┌──────────────────────────────────┐
                    │  SageMaker training / inference   │
                    │            workloads              │
                    └────────────────┬─────────────────┘
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
  ① IAM execution role         ② VPC isolation              ③ KMS encryption
  "who does what"              "where it communicates"      "who can unlock it"
        │                            │                            │
  - least-privilege policy     - private subnets            - S3 SSE-KMS
  - trust policy               - VPC endpoints              - volume_kms_key
  - scoped to S3/KMS paths     - security groups            - output_kms_key
                               - network isolation          - inter-node traffic encryption
```

## IAM Execution Roles: The Principle of Least Privilege

SageMaker training jobs and endpoints run with the permissions of an **Execution Role**. If you grant this role too much, the damage from a breach grows accordingly. Give least privilege only for the S3 paths and KMS keys that are needed.

| Aspect | User credentials | SageMaker execution role |
|---|---|---|
| Who uses it | People using the console, CLI, or SDK | Training containers, endpoints, processing jobs |
| When it is evaluated | When `CreateTrainingJob` is called | When accessing S3, KMS, and ECR **while the job runs** |
| Required permissions | `sagemaker:CreateTrainingJob`, `iam:PassRole` | `s3:GetObject`, `kms:Decrypt`, `ecr:GetAuthorizationToken`, etc. |
| Common symptom | Job creation itself fails | The job starts but fails when reading data |

If a user can read the bucket fine in the console but only the training job gets `AccessDenied`, it is almost always an execution role problem. For a user to pass a role to a service, **`iam:PassRole`** is also required separately.

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

- The key point is that it is narrowed **by prefix**, not to the whole bucket.
- For an SSE-KMS bucket, S3 permissions alone are not enough. You need **`kms:Decrypt` for reads and `kms:GenerateDataKey` for writes** as well.

The Trust Policy separately restricts "who can assume this role."

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

### AccessDenied Diagnosis Flow

```text
Training job gets AccessDenied on S3
        │
① Are you looking at the "execution role" permissions, not the user's?
     └ No → check the execution role ARN first
        │
② Does the execution role policy include that bucket/prefix?
     └ No → fix the s3:GetObject resource scope
        │
③ Is there an explicit Deny in the bucket policy?
     └ Yes → Deny always wins. Fix the bucket policy
        │
④ Is the object SSE-KMS?
     └ Yes → check kms:Decrypt / GenerateDataKey + the key policy
        │
⑤ Is the job running inside a VPC?
     ├ Yes → check the VPC endpoint policy, routing, and security groups
     └ No  → check organization SCPs and the Permissions Boundary
```

On the exam, "the training job cannot access S3 (AccessDenied)" is usually **insufficient execution role permissions**, not a user permission problem. Conversely, "the role can access all buckets" violates least privilege. Remember that the principal of the permissions is the execution role.

> ⚠️ **Pitfall**: In IAM, an explicit `Deny` takes precedence over any `Allow`. If even one of the role policy, bucket policy, or SCP denies, opening up everything else will not let the request through.

## VPC Isolation: Training Without the Internet

By default, SageMaker jobs can reach the internet from the AWS-managed network. For sensitive data you must block this. Use `VpcConfig` to place the job in a private subnet of your own VPC, and use **VPC endpoints** to reach S3 and other services without the internet.

```python
estimator = Estimator(
    image_uri=image, role=role,
    instance_count=1, instance_type="ml.m5.xlarge",
    subnets=["subnet-priv-a", "subnet-priv-b"],
    security_group_ids=["sg-0123456789"],
    encrypt_inter_container_traffic=True,   # encrypt traffic between distributed training nodes
    enable_network_isolation=True,          # block the container's external network access
)
```

### What Each Isolation Option Blocks

| Option | What it does | What it blocks | What it does not block |
|---|---|---|---|
| `subnets` | Attaches the job to an ENI in the specified VPC subnets | Arbitrary paths through the managed network | If the subnet has an internet route, traffic still goes out |
| `security_group_ids` | Instance-level inbound/outbound filter | Ports and destinations that are not allowed | Exfiltration to destinations that are already allowed |
| `enable_network_isolation` | Blocks **all** network calls from the container | All outbound communication from the container code | Input download and artifact upload done by the platform on its behalf |
| `encrypt_inter_container_traffic` | Encrypts traffic between distributed training nodes | Plaintext transfer between nodes | Data at rest (a separate KMS setting is needed) |

When you run untrusted third-party code or models, turning on network isolation is the default.

### Two Kinds of VPC Endpoints

| Aspect | Gateway endpoint | Interface endpoint (PrivateLink) |
|---|---|---|
| Supported services | Two: **S3 and DynamoDB** | SageMaker API/Runtime, CloudWatch, ECR, STS, etc. |
| How it works | Adds a route to the route table | An ENI (private IP) in the subnet + private DNS |
| Pricing | No additional charge | Hourly + data processing charges |
| Access scope | Same Region, inside the same VPC | Also reachable from on premises (Direct Connect, VPN) |
| Access control | Endpoint policy | Endpoint policy + security group |

A gateway endpoint is "a routing change that diverts the path to S3 inside AWS," while an interface endpoint is "creating a private-IP entry point for the service inside my subnet."

```text
        [VPC]
 ┌────────────────────────────────────────────────────────────┐
 │  [Private Subnet A]                    [Private Subnet B]  │
 │   training container (ENI) ◀─ distributed training (SG self-reference) ─▶ training container │
 │        │     │                                             │
 │        │     └─(Interface Endpoint)─▶ SageMaker API        │
 │        │                              CloudWatch Logs      │
 │        └─(Gateway Endpoint · routing)─▶ S3 / DynamoDB      │
 │                                                            │
 │   ✗ No internet gateway           ✗ No NAT gateway         │
 └────────────────────────────────────────────────────────────┘
```

- With distributed training, the security group needs a **rule that references itself**, because the nodes must communicate with each other.
- Place at least two subnets in different AZs and keep spare IP addresses. Without spare IPs, instance placement fails.

> ⚠️ **Pitfall**: With `enable_network_isolation=True`, the **code inside** the container cannot call S3 directly. Training still runs because **the platform, outside the container,** handles the input channel download and artifact upload on its behalf. If the training script does a pip install at runtime or fetches more data from an external URL or S3, it fails at that point.

If you only place the job in a private subnet and do not create an S3 gateway endpoint, training cannot receive its data and stalls. "The job will not start after I isolated it" is usually a missing endpoint.

## KMS Encryption: Protection at Rest and in Transit

Encrypt data and models both at rest and in transit. A KMS customer managed key (CMK) controls **who can decrypt**.

```python
estimator = Estimator(
    ...,
    output_kms_key="arn:aws:kms:us-east-1:111122223333:key/abcd-efgh",   # encrypt model artifacts
    volume_kms_key="arn:aws:kms:us-east-1:111122223333:key/wxyz-1234",   # encrypt training EBS
)
```

| Protection point | Method | Notes |
|---|---|---|
| Training data and models in S3 | Encrypt the bucket/objects with SSE-KMS (CMK) | Read: `kms:Decrypt`, write: `kms:GenerateDataKey` |
| Training instance storage | Encrypt EBS with `volume_kms_key` | Not applicable to local NVMe storage types |
| Model artifact output | `output_kms_key` | `model.tar.gz` is encrypted with the specified CMK |
| Traffic between distributed training nodes | `encrypt_inter_container_traffic=True` | Encryption in transit |
| Endpoint communication | TLS (encryption in transit by default) | Applied with no extra setup |
| Endpoint and processing job volumes | `KmsKeyId` in the endpoint configuration / Processing | Inference and preprocessing follow the same principle |

### The Double Gate: Key Policy + IAM Policy

![A double gate: decryption succeeds only when both the KMS key policy and the IAM permission policy allow it](/diagrams/kms-double-gate.svg)

- Most resources are accessed with an IAM policy alone, but **for KMS the key policy is the primary gate**. If the key policy does not delegate to IAM, decryption does not work even with administrator permissions.

### Per-Team CMK Isolation Pattern

| Asset | Key | Principals allowed by the key policy | Effect |
|---|---|---|---|
| Team A data and models | `cmk-team-a` | Team A execution role and data scientists | Team B cannot decrypt even with IAM permissions |
| Team B data and models | `cmk-team-b` | Team B execution role and data scientists | A breach of Team A does not spread to Team B |
| Shared audit logs | `cmk-audit` | Security team only | Operators cannot read or delete the logs |

If you share an AWS managed key, there is effectively no isolation within the account. Remember: **isolation requirement = CMK + separate key policies**.

"Encryption is on, but who can use that key?" is the real control point. The KMS **key policy** and IAM work together, and if the key policy denies, decryption fails even with IAM permissions. The pattern of splitting CMKs per team or project to isolate data is within exam scope.

## Supporting Services for Data and Model Protection

| Service | Role | Typical stem |
|---|---|---|
| **Amazon Macie** | Automatically detects and classifies PII and sensitive information in S3 using ML | "Find out whether credit card numbers are mixed into the dataset" |
| **SageMaker Clarify** | Detects bias in data and models, explains predictions | "Provide evidence of responsible AI and fairness" |
| **AWS PrivateLink** | Calls SageMaker privately without the internet | "Call from on premises without going through the internet" |
| **Secrets Manager** | Manages and rotates external DB and API credentials outside the code | "A DB password is hardcoded in the notebook code" |
| **CloudTrail** | Audit log of all API calls | "Who deleted the endpoint and when" (next post) |
| **Permissions Boundary / SCP** | A permission ceiling that a role cannot exceed | "Keep teams from widening their own permissions" |

## SageMaker Studio and Notebook Security Options

| Target | Option | Effect |
|---|---|---|
| Studio domain | Set the network access mode to **VPC only** | Studio traffic flows only into the user's VPC |
| Studio domain | Separate execution roles per user profile | Separates each user's data access scope |
| Notebook instance | Disable direct internet access | Uses only the endpoint/NAT path |
| Notebook instance | Disable root access + lifecycle configuration | Enforces standard security settings at startup |

**Security Review Checklist**

- [ ] Is the execution role restricted by prefix rather than to the whole bucket?
- [ ] For an SSE-KMS bucket, are `kms:Decrypt` and `kms:GenerateDataKey` both present?
- [ ] Is there an S3 gateway endpoint in the private subnet?
- [ ] For distributed training, does the security group have a self-referencing rule?
- [ ] Are notebooks and Studio not directly exposed to the internet?

## Stem Clue → Answer Mapping

| Stem clue | Answer to choose | Why |
|---|---|---|
| "Only the training job gets AccessDenied; the user reads fine" | Add S3 permissions to the execution role | The job runs with the execution role's permissions |
| "Training must never reach the internet" | Private subnet + VPC endpoint + network isolation | Only all three together remove the internet path |
| "Only S3 and DynamoDB need private access" | Gateway endpoint | Dedicated to those two services, no extra charge |
| "Call the SageMaker API privately from on premises" | Interface endpoint (PrivateLink) | ENI-based, so reachable from Direct Connect/VPN |
| "Data between distributed training nodes flows in plaintext" | `encrypt_inter_container_traffic=True` | The encryption-in-transit option |
| "Encrypt model artifacts with a specific key" | `output_kms_key` | The parameter dedicated to output artifacts |
| "Encrypt the training instance disk" | `volume_kms_key` | Encrypts the attached EBS volume |
| "Keep teams from decrypting each other's data" | Per-team CMK + separate key policies | IAM alone cannot prevent key use |
| "Decryption fails even though IAM permissions were granted" | Check the KMS key policy | Both the key policy and IAM must allow it |
| "Automatically detect whether PII is mixed into the dataset" | Amazon Macie | Dedicated to detecting and classifying sensitive data in S3 |
| "Run an untrusted third-party model" | `enable_network_isolation=True` | Fully blocks the container's external communication |

In the next post, we cover the other half of operations: cost optimization, CloudWatch/CloudTrail logging and auditing, and disaster recovery.

## 📖 Glossary

- **Execution Role**: The IAM role that a training job or endpoint uses "on its own behalf." It is separate from a person's credentials.
- **Trust Policy**: The role-side policy that defines "who can assume this role." It pairs with the permission policy.
- **iam:PassRole**: The permission that lets a user hand a role to a service. Without it, job creation itself is blocked.
- **Network Isolation**: A setting that prevents the container from making any outbound network calls. The platform moves inputs and outputs on its behalf.
- **VPC endpoint**: A private channel that reaches AWS services without going through the internet. There is a gateway type for S3 and DynamoDB and an ENI-based interface type.
- **Customer managed key (CMK)**: A KMS key that you create yourself and whose key policy you also control. It is the core tool for per-team isolation.
- **Key Policy**: The resource policy attached to a KMS key. Separate from IAM permissions; if it blocks here, decryption does not happen.
- **SSE-KMS**: A method where S3 performs server-side encryption of objects with a KMS key. Reading and writing also require KMS permissions.
- **Encryption in transit**: Encryption while data flows over the network. Endpoints use TLS, and traffic between distributed training nodes is enabled with a separate option.

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
