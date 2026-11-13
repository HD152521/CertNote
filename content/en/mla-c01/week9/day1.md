# Day 1 - SageMaker IAM Security: Execution Roles and Least Privilege

## 📌 Key Takeaways

- SageMaker permissions split into two paths: the **user policy** (who calls the API) and the **execution role** (what the service does on your behalf).
- An `AccessDenied` during training is almost always a problem with the **execution role's** S3, ECR, or KMS permissions, not the user policy.
- A role works only when it has both a **trust policy** (who can assume it = `sagemaker.amazonaws.com`) and a **permission policy** (what it can do).
- In addition to API call permissions, the user needs **`iam:PassRole`**. A missing PassRole is a common cause of job creation failures.
- Least privilege narrows along three axes: **action, resource, and condition**, and guardrails are enforced with an explicit `Deny`.

## The Two Paths Permissions Flow Through

This week covers operating ML solutions "safely, responsibly, and cheaply," and the first day's topic is permissions. In SageMaker, **actions the user calls directly** are separated from **actions SageMaker performs on the user's behalf**. If you confuse the two, you will get permission scenarios wrong every time.

```text
[Person · CI pipeline · SDK caller]
        │  ① sagemaker:CreateTrainingJob        ← user IAM policy
        │  ② iam:PassRole  (hands over the role) ← user IAM policy
        ▼
┌────────────────────────────┐
│     SageMaker service      │
└────────────────────────────┘
        │  ③ sts:AssumeRole                     ← execution role "trust policy"
        ▼
┌────────────────────────────┐
│  SageMaker execution role  │
└────────────────────────────┘
        │  ④ actual resource access             ← execution role "permission policy"
        ├──▶ S3         : read training data / write model.tar.gz
        ├──▶ ECR        : pull the algorithm container image
        ├──▶ CloudWatch : log streams · training metrics
        └──▶ KMS        : use keys for encrypted buckets and EBS volumes
```

Paths ① and ② decide **whether the request is accepted**, and paths ③ and ④ decide **whether the job actually runs**. The symptoms differ completely depending on where the chain breaks.

| Category | User (IAM principal) permissions | Execution role permissions |
|------|---------------------------|-------------------------------|
| Who uses it | The person, CI, or SDK caller themselves | The SageMaker service assumes and uses it |
| Representative actions | `sagemaker:CreateTrainingJob`, `sagemaker:CreateEndpoint`, `iam:PassRole` | `s3:GetObject`, `ecr:BatchGetImage`, `logs:PutLogEvents`, `kms:Decrypt` |
| When it is evaluated | The moment the API is called | When the job container actually touches resources |
| When failure surfaces | The job creation request itself is denied | The job is created but ends in `Failed` mid-run |
| Typical error text | `is not authorized to perform: sagemaker:...` / `iam:PassRole` | `AccessDenied` (S3 · ECR · KMS) |
| Attached to | IAM users, groups, or the person-side role | A single role, specified with the SDK's `role=` parameter |

The key point is this: if a training job fails with "S3 access denied," it is not a user policy problem but a problem with the **execution role's** S3 permissions. The exam asks about this distinction repeatedly.

> 💡 **Related Theory**: This structure comes from IAM's separation of "trust policy + permission policy." The user only submits a **request** to SageMaker with their own permissions, and the data access that follows happens under the identity of the role the service has taken on. No matter how many S3 permissions the user has, training fails if the execution role lacks them; conversely, no matter how powerful the execution role is, the job is never even created if the user lacks `CreateTrainingJob`.

## Trust Policy vs Permission Policy — The Two Faces of a Role

Two policies answering different questions attach to a single role. Both must be present for the role to work.

| Axis | Trust policy | Permission policy |
|----|--------------------------|-------------------------------|
| Question it answers | Who can **assume** this role | What this role can **do** |
| Console location | Role → Trust relationships tab | Role → Permissions tab |
| Key elements | `Principal` + `sts:AssumeRole` | `Action` + `Resource` (+ `Condition`) |
| Value for SageMaker | `"Service": "sagemaker.amazonaws.com"` | S3, ECR, CloudWatch, and KMS actions |
| Count | Exactly 1 per role | Multiple managed and inline policies can be attached |
| Symptom when missing | The job **cannot even start** (role assumption fails) | The job starts but gets `AccessDenied` mid-run |

For SageMaker to assume the execution role, the trust policy must contain the SageMaker service principal.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "sagemaker.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

The point is that the `Principal` is a `Service`, not a person. If this line is missing, SageMaker cannot take on the role, and the job does not even start.

## Building a Least-Privilege Execution Role

The `AmazonSageMakerFullAccess` policy that AWS provides is convenient for learning and labs but is **excessive** for production. Write your own permission policy that allows only the resources the job actually touches.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadTrainingData",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::ml-train-data-prod",
        "arn:aws:s3:::ml-train-data-prod/*"
      ]
    },
    {
      "Sid": "WriteModelArtifacts",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::ml-model-artifacts-prod/*"
    },
    {
      "Sid": "PullContainerImage",
      "Effect": "Allow",
      "Action": ["ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage", "ecr:GetAuthorizationToken"],
      "Resource": "*"
    },
    {
      "Sid": "WriteLogsAndMetrics",
      "Effect": "Allow",
      "Action": ["logs:CreateLogStream", "logs:PutLogEvents", "cloudwatch:PutMetricData"],
      "Resource": "*"
    }
  ]
}
```

The deliberately narrowed parts are as follows. S3 is **restricted to specific bucket ARNs**, and the read bucket and write bucket are separated. Not putting `s3:DeleteObject` or `s3:*` on the data bucket is the heart of least privilege. The permissions a training job actually needs fall into the five groups below.

| Resource | Why it is needed | Minimum actions | How to narrow further |
|--------|-------------|-----------|----------------|
| Training data S3 | Read data from the input channel | `s3:GetObject`, `s3:ListBucket` | Specify the bucket ARN plus the prefix |
| Artifact S3 | Upload `model.tar.gz` | `s3:PutObject` | Output bucket only. Keep it separate from the read bucket |
| ECR | Pull the algorithm container image | `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` | For in-house images, restrict to the repository ARN |
| CloudWatch | Emit logs and training metrics | `logs:CreateLogStream`, `logs:PutLogEvents`, `cloudwatch:PutMetricData` | Restrict to the log group ARN |
| KMS | Use SSE-KMS buckets and encrypted volumes | `kms:Decrypt`, `kms:GenerateDataKey` | Specify the key ARN. The role must also be in the **KMS key policy** |

> ⚠️ **Pitfall**: KMS must be allowed in **both the role's IAM policy and the KMS key policy**. It is common to add `kms:Decrypt` only to the IAM policy, leave the key policy untouched, and keep getting denied. If "listing S3 works but reading objects fails," it is almost certainly an SSE-KMS key permission problem.

Least privilege is not just "only as much as needed." You narrow along three axes: ① **action** (only `GetObject` instead of `s3:*`), ② **resource** (a specific bucket ARN instead of `*`), and ③ **condition** (enforce a specific VPC, tag, or encryption with a `Condition` block). When the exam asks you to pick the "most secure policy," the answer is usually the option with the narrowest actions and resources.

## Narrowing One More Step with Condition

A `Condition` block restricts a policy depending on the situation. You can allow only jobs carrying a specific tag, or deny uploads that are not encrypted.

```json
{
  "Sid": "DenyUnencryptedUploads",
  "Effect": "Deny",
  "Action": "s3:PutObject",
  "Resource": "arn:aws:s3:::ml-model-artifacts-prod/*",
  "Condition": {
    "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
  }
}
```

This `Deny` blocks uploads without KMS encryption at the source. An explicit `Deny` takes precedence over any `Allow`, so it is powerful for enforcing guardrails.

| Condition key | What it enforces | Where it is typically attached |
|--------------|-----------------|----------------|
| `iam:PassedToService` | Limits which services the role can be passed to | `iam:PassRole` in the user policy |
| `s3:x-amz-server-side-encryption` | Blocks uploads without an encryption header | Execution role policy · bucket policy |
| `aws:RequestTag/*` · `aws:ResourceTag/*` | Lets users handle only jobs and resources with a specific tag | User policy (separation by project or team) |
| `aws:SourceVpce` · `aws:SourceVpc` | Allows access only through a designated VPC endpoint | S3 bucket policy (directly tied to tomorrow's topic) |
| `sagemaker:VpcSubnets` · `sagemaker:VpcSecurityGroupIds` | Denies creating jobs that have no VPC configuration | User policy |
| `sagemaker:NetworkIsolation` | Denies creating jobs with network isolation turned off | User policy |

The last three rows matter because they **block governance violations at creation time rather than checking after the fact**. Instead of announcing in a document "do not run training outside the VPC," denying the `CreateTrainingJob` request without a VPC configuration in IAM itself leaves no room to bypass the rule.

## User Policy and PassRole

When a user creates a training job, they "pass" the execution role to SageMaker. That is why the user policy needs `iam:PassRole`. Without it, even a user who has job creation permission cannot attach the role, and the call fails.

```json
{
  "Effect": "Allow",
  "Action": "iam:PassRole",
  "Resource": "arn:aws:iam::123456789012:role/SageMakerExecutionRole",
  "Condition": {
    "StringEquals": { "iam:PassedToService": "sagemaker.amazonaws.com" }
  }
}
```

- Pin the `Resource` to a specific role ARN. `"Resource": "*"` effectively means any role in the account can be loaded onto a service.
- Use the `iam:PassedToService` condition to limit it so that "this role can be passed only to SageMaker."
- If you omit both, it becomes a privilege escalation path: a weakly privileged user picks a powerful role, sends it to the service, and can run code under that role's identity.

`iam:PassRole` is within the exam scope. The answer to the scenario "the user has permission to create training jobs but keeps failing" is usually a missing PassRole. PassRole is **permission for the act of handing a role over**, not a permission of the role itself. The error message prints `iam:PassRole` as-is, so it is also easy to identify.

## Permission Separation in Studio and Notebooks

SageMaker Studio and notebook instances also run with their own execution roles. When a data scientist runs training from a notebook, S3 access and training are performed with that notebook's execution role permissions. If you grant too broad permissions (for example, `AdministratorAccess`), the notebook becomes a backdoor.

| Subject | Which role it runs under | Common mistake |
|------|------------------|-----------|
| Studio domain | The default execution role specified when the domain was created | The whole team shares one role, collapsing the data boundary |
| Studio user profile | A per-profile execution role overrides the domain default | Profile roles are not split, which defeats least privilege |
| Notebook instance | The role specified when the instance was created | Granting `AdministratorAccess` turns the notebook into a de facto backdoor |
| Training, processing, and batch jobs | The role passed through the SDK's `role=` | Reusing the notebook role as-is mixes up permissions |
| Endpoint | The role specified when the model was created | Reusing the training role carries over unnecessary write permissions |

The standard is to separate roles by team and project, with each role allowing only the data buckets it needs. Tag-based `Condition` lets you build a boundary like "you can see only jobs whose project tag is yours" with a single policy.

## The Order for Diagnosing Permission Problems

When a permission incident occurs, check first instead of guessing. The job description contains the role ARN actually used and the failure reason as-is.

```python
import boto3

sm = boto3.client('sagemaker')
desc = sm.describe_training_job(TrainingJobName='my-training-job')

print(desc['RoleArn'])        # the execution role this job actually used
print(desc['FailureReason'])  # for AccessDenied, the resource is printed here

# Check the policies actually attached to that role
iam = boto3.client('iam')
role_name = desc['RoleArn'].split('/')[-1]
print(iam.list_attached_role_policies(RoleName=role_name))  # managed policies
print(iam.list_role_policies(RoleName=role_name))           # inline policies
```

If the resource ARN printed in `FailureReason` differs from the policy's `Resource` by even one character (a bucket name typo, a missing prefix), that is the cause. If access is denied even though the policy is correct, suspect an explicit `Deny`.

The IAM evaluation order is **explicit Deny > explicit Allow > implicit Deny**. Even if the role policy is perfect, access is denied if any one of the organization's SCPs, the permissions boundary on the role, or the S3 bucket policy has a `Deny`. The answer to "I granted every permission, so why does it fail?" is usually one of these three places.

## When Permissions Block You: Symptom → Cause → Fix

| Symptom | Common cause | Fix |
|------|-----------|------|
| Job creation fails with an `iam:PassRole` denial | The user policy has no PassRole | Grant PassRole limited to that role ARN + the `iam:PassedToService` condition |
| The job fails immediately without even starting | The execution role's trust policy lacks `sagemaker.amazonaws.com` | Add the service principal + `sts:AssumeRole` to the trust relationship |
| S3 `AccessDenied` right after training starts | The execution role has no read permission on the data bucket, or the bucket or prefix does not match | Grant `s3:GetObject` + `s3:ListBucket` on the exact bucket ARN |
| Bucket listing works but only object reads fail | The bucket uses SSE-KMS and there is no KMS permission | Grant `kms:Decrypt` and `kms:GenerateDataKey` + add the role to the **KMS key policy** too |
| Container image pull fails | Missing ECR actions, or the repository is in another account | Grant the ECR actions. For cross-account, also modify the repository policy |
| Logs and metrics do not show up in CloudWatch | Missing `logs:CreateLogStream` and `PutLogEvents` | Grant the log and metric actions. Without metrics, tuning and early stopping do not work either |
| Only the artifact upload is rejected | Caught by the encryption-enforcing `Deny` condition | Specify a KMS key on the job so the upload goes out as SSE-KMS |
| Still denied even though all policies are granted | An explicit `Deny` somewhere in an SCP, permissions boundary, or bucket policy | Explicit Deny takes precedence. Check the three places in order |
| A user can view or stop jobs in other people's projects | The user policy is open to resource `*` | Set a project tag boundary with an `aws:ResourceTag` condition |

Tomorrow we cover network isolation — how to cut SageMaker off from the internet with VPC mode.

## 📖 Glossary

- **Execution role** : The IAM role SageMaker takes on for the user. All S3, ECR, and CloudWatch access during training happens under this role's identity.
- **Trust policy** : The policy that defines "who can assume this role." For a SageMaker role, `sagemaker.amazonaws.com` goes here.
- **Permission policy** : The policy that defines "what this role can do." It consists of actions, resources, and conditions.
- **AssumeRole** : The act of a principal temporarily borrowing a role's identity. It is possible only if the trust policy permits it.
- **iam:PassRole** : The permission for the act of handing a role to another service. It is not a permission of the role itself but a permission for "passing it."
- **Least privilege** : The principle of allowing only the necessary actions and resources. You narrow along the three axes of action, resource, and condition.
- **Condition block** : The part that restricts when a policy applies. You can set conditions such as tags, encryption, and VPC.
- **Explicit Deny** : A denial written directly with `Effect: Deny`. It takes precedence over any `Allow`, so it is used for guardrails.
- **Permissions boundary** : The upper limit of the permissions a role can have. Even if a policy allows something, it is denied if it falls outside the boundary.
- **Privilege escalation** : A weakly privileged user getting hold of a powerful role. Unrestricted PassRole is a typical path.

---

## 📝 Practice Questions

**Question 1.** A SageMaker training job fails with "Access Denied" as soon as it starts, because it cannot read the S3 data. The user has the `sagemaker:CreateTrainingJob` permission. What is the most likely cause?

A) The user's IAM policy lacks `s3:GetObject`  
B) The SageMaker execution role's permission policy lacks read permission for that S3 bucket  
C) The S3 bucket is in a different Region  
D) The training instance type is wrong  

**Answer: B**  
Explanation: S3 access while a training job runs is performed with the permissions of the execution role that SageMaker assumes, not the user's, so Access Denied occurs if the execution role lacks bucket read permission. A is wrong because the user's policy does not directly determine S3 access during job execution, and C and D cause other kinds of errors rather than Access Denied.

---

**Question 2.** A data scientist has permission to create training jobs, but job creation fails with "is not authorized to perform: iam:PassRole." What is the most appropriate fix?

A) Add `s3:*` to the execution role  
B) Add the `iam:PassRole` permission for that execution role's ARN to the user's policy  
C) Remove SageMaker from the execution role's trust policy  
D) Grant the user `AdministratorAccess`  

**Answer: B**  
Explanation: When creating a training job, the user must pass the execution role to SageMaker, and this requires the `iam:PassRole` permission, so adding PassRole as the error message indicates resolves it. A concerns the execution role's permissions and is unrelated to the PassRole error, C breaks the role's trust and makes things worse, and D violates the principle of least privilege and is an overreaction since the root cause is PassRole.

---

**Question 3.** The security team wants to enforce the rule that "only KMS-encrypted objects may be uploaded to the model artifact bucket." Which policy element is the most effective to add to the execution role?

A) Broadly grant `s3:PutObject` with `Allow`  
B) A conditional explicit deny that `Deny`s `s3:PutObject` when `s3:x-amz-server-side-encryption` is not `aws:kms`  
C) Make the bucket public  
D) Remove `iam:PassRole`  

**Answer: B**  
Explanation: A policy that checks the encryption header condition and applies an explicit `Deny` when it is not KMS blocks unencrypted uploads at the source, and because an explicit deny takes precedence over any allow, it is a strong guardrail. A allows without constraints and defeats the rule, C worsens security, and D is wrong because PassRole is unrelated to upload encryption.

---

**Question 4.** What must be included in the trust policy of a SageMaker execution role?

A) The ARN of a human user in `Principal`  
B) `sagemaker.amazonaws.com` as the `Service` in `Principal`, and the `sts:AssumeRole` action  
C) The `s3:GetObject` action  
D) A specific IP address in `Condition`  

**Answer: B**  
Explanation: The trust policy defines "who can assume this role," and for SageMaker to assume the role, the service principal `sagemaker.amazonaws.com` must be able to perform `sts:AssumeRole`. A is wrong because a service role is assumed by a service, not a person, C belongs in the permission policy, not the trust policy, and D is not a required element.

---

**Question 5.** Which SageMaker execution role permission policy best follows the principle of least privilege?

A) Use the `AmazonSageMakerFullAccess` managed policy as is  
B) Allow `s3:*` on all S3 buckets  
C) Allow only `s3:GetObject`/`s3:ListBucket` on the training data bucket and `s3:PutObject` on the artifact bucket, using specific ARNs  
D) Allow `*` for both `Action` and `Resource`  

**Answer: C**  
Explanation: A policy that limits the actions the job actually needs to specific bucket ARNs and separates the read and write buckets is the narrowest on both actions and resources and therefore best follows least privilege. A includes broad permissions unnecessary for training, and B and D are excessively broad in actions and resources, the exact opposite of least privilege.

---
