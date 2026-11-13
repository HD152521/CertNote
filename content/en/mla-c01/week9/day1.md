# Day 1 - SageMaker IAM Security: Execution Roles and Least Privilege

## 📌 Key Takeaways

- SageMaker permissions split into two paths: the **user policy** (who calls the API) and the **execution role** (what the service does on your behalf).
- An `AccessDenied` during training is almost always a problem with the **execution role's** S3, ECR, or KMS permissions, not the user policy.
- A role works only if it has both a **trust policy** (who can assume it = `sagemaker.amazonaws.com`) and a **permission policy** (what it can do).
- On top of API call permissions, the user needs **`iam:PassRole`**. Missing this is a common cause of job creation failures.
- Least privilege is narrowed along three axes: **action, resource, and condition**, and guardrails are enforced with an explicit `Deny`.

## The Two Paths Permissions Flow Through

This week is about operating ML solutions "safely, responsibly, and cheaply," and the first day's topic is permissions. In SageMaker, **operations the user calls directly** and **operations SageMaker performs on the user's behalf** are separate. If you mix these two up, you will get permission scenarios wrong every time.

```text
[Person · CI pipeline · SDK caller]
        │  ① sagemaker:CreateTrainingJob        ← user IAM policy
        │  ② iam:PassRole  (hands over the role)  ← user IAM policy
        ▼
┌────────────────────────────┐
│     SageMaker service      │
└────────────────────────────┘
        │  ③ sts:AssumeRole                     ← the execution role's "trust policy"
        ▼
┌────────────────────────────┐
│   SageMaker execution role │
└────────────────────────────┘
        │  ④ actual resource access              ← the execution role's "permission policy"
        ├──▶ S3         : read training data / write model.tar.gz
        ├──▶ ECR        : pull the algorithm container image
        ├──▶ CloudWatch : log streams · training metrics
        └──▶ KMS        : use keys for encrypted buckets and EBS volumes
```

Paths ① and ② decide **whether the request is accepted**, and paths ③ and ④ decide **whether the job actually runs**. The symptom is completely different depending on where the chain breaks.

| Category | User (IAM principal) permissions | Execution role permissions |
|------|---------------------------|-------------------------------|
| Who uses it | The person, CI, or SDK caller themselves | The SageMaker service assumes and uses it |
| Representative actions | `sagemaker:CreateTrainingJob`, `sagemaker:CreateEndpoint`, `iam:PassRole` | `s3:GetObject`, `ecr:BatchGetImage`, `logs:PutLogEvents`, `kms:Decrypt` |
| When it is evaluated | The moment the API is called | When the job container actually touches the resources |
| When it blows up on failure | The job creation request itself is denied | The job was created but ends in `Failed` mid-run |
| Typical error text | `is not authorized to perform: sagemaker:...` / `iam:PassRole` | `AccessDenied` (S3 · ECR · KMS) |
| What it is attached to | IAM users, groups, the person's role | A single role. Specified via the SDK's `role=` parameter |

The key point is this - if a training job fails with "S3 access denied," it is not a user policy problem but an S3 permission problem on the **execution role**. The exam asks about this distinction repeatedly.

> 💡 **Related theory**: This structure comes from IAM's separation of "trust policy + permission policy." The user merely submits a **request** to SageMaker with their own permissions, and the data access that follows happens under the identity of the role the service took on. No matter how many S3 permissions the user has, training fails if the execution role lacks them, and conversely, no matter how powerful the execution role is, if the user does not have `CreateTrainingJob`, the job is never even created.

## Trust Policy vs Permission Policy - The Two Faces of a Role

A single role has two policies attached that answer different questions. Both must be present for the role to work.

| Axis | Trust policy | Permission policy |
|----|--------------------------|-------------------------------|
| Question it answers | Who can **assume** this role | What this role **can do** |
| Console location | Role → Trust relationships tab | Role → Permissions tab |
| Key elements | `Principal` + `sts:AssumeRole` | `Action` + `Resource` (+ `Condition`) |
| Value in SageMaker | `"Service": "sagemaker.amazonaws.com"` | S3, ECR, CloudWatch, KMS actions |
| Count | Exactly 1 per role | Several managed and inline policies can be attached |
| Symptom when missing | The job **cannot even start** (role assumption fails) | The job starts but gets `AccessDenied` during execution |

For the execution role to be assumed by SageMaker, the trust policy must contain the SageMaker service principal.

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

The point is that the `Principal` is a `Service`, not a person. If this line is missing, SageMaker cannot take on the role and the job does not even start.

## Building a Least-Privilege Execution Role

The `AmazonSageMakerFullAccess` that AWS provides is convenient for learning and hands-on labs but is **excessive** for production. You write the permission policy yourself so that it allows only the resources the job actually touches.

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

The parts deliberately narrowed are as follows. S3 is **restricted to specific bucket ARNs**, and the read bucket and write bucket are separated. Not putting `s3:DeleteObject` or `s3:*` on the data bucket is the heart of least privilege. The permissions a training job actually needs are organized into the five branches below.

| Resource | Why it is needed | Minimum actions | How to narrow further |
|--------|-------------|-----------|----------------|
| Training data S3 | Read data from the input channel | `s3:GetObject`, `s3:ListBucket` | Specify the bucket ARN + even the prefix |
| Artifact S3 | Upload `model.tar.gz` | `s3:PutObject` | Output bucket only. Separate from the read bucket |
| ECR | Pull the algorithm container image | `ecr:GetAuthorizationToken`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer` | For in-house images, restrict to the repository ARN |
| CloudWatch | Emit logs and training metrics | `logs:CreateLogStream`, `logs:PutLogEvents`, `cloudwatch:PutMetricData` | Restrict to the log group ARN |
| KMS | Use SSE-KMS buckets and encrypted volumes | `kms:Decrypt`, `kms:GenerateDataKey` | Specify the key ARN. The role must also be in the **KMS key policy** |

> ⚠️ **Pitfall**: KMS must be allowed in **both the role's IAM policy and the KMS key policy**. It is common to see cases where `kms:Decrypt` was put only in the IAM policy and the key policy was left alone, so access keeps being denied. If "listing S3 works but only reading objects fails," nine times out of ten it is the SSE-KMS key permission.

Least privilege is not just "only as much as needed." You narrow along three axes - ① **action** (only `GetObject` instead of `s3:*`), ② **resource** (a specific bucket ARN instead of `*`), ③ **condition** (use a `Condition` block to enforce a specific VPC, tag, or encryption). On the exam, if you are asked to pick "the most secure policy," the correct answer is usually the choice with the narrowest actions and resources.

## Narrowing One More Step with Condition

A `Condition` block restricts a policy depending on the situation. You can allow only jobs carrying a particular tag, or deny unencrypted uploads.

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
| `iam:PassedToService` | Limits the services a role can be passed to | `iam:PassRole` in the user policy |
| `s3:x-amz-server-side-encryption` | Blocks uploads without the encryption header | Execution role policy · bucket policy |
| `aws:RequestTag/*` · `aws:ResourceTag/*` | Lets people handle only jobs and resources carrying specific tags | User policy (separation by project/team) |
| `aws:SourceVpce` · `aws:SourceVpc` | Allows access only through a specified VPC endpoint | S3 bucket policy (directly tied to tomorrow's topic) |
| `sagemaker:VpcSubnets` · `sagemaker:VpcSecurityGroupIds` | Denies creating jobs that have no VPC settings | User policy |
| `sagemaker:NetworkIsolation` | Denies creating jobs with network isolation turned off | User policy |

The reason the last three rows matter is that they are a way of **blocking governance at creation time rather than checking after the fact**. Instead of announcing in a document "do not run training outside the VPC," if IAM denies the `CreateTrainingJob` request that has no VPC settings in the first place, there is no room to bypass the rule.

## User Policy and PassRole

When a user creates a training job, they "pass" the execution role to SageMaker. That is why the user policy needs `iam:PassRole`. Without it, even with permission to create jobs, they cannot attach the role and the request fails.

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
- Use the `iam:PassedToService` condition to restrict it to "this role can be passed only to SageMaker."
- If you drop both, it becomes a privilege escalation path - a weakly privileged user can pick a powerful role, load it onto a service, and run code under that role's identity.

`iam:PassRole` is within the exam scope. The answer to the scenario "the user has permission to create training jobs but it keeps failing" is usually a missing PassRole. PassRole is **a permission for "the act of handing off a role"**, not a permission of the role itself. The error message prints `iam:PassRole` as it is, so it is easy to identify.

## Permission Separation in Studio and Notebooks

SageMaker Studio and notebook instances also run with their own execution roles. When a data scientist runs training from a notebook, S3 access and training are performed with that notebook's execution role permissions. If you grant too broad permissions (for example, `AdministratorAccess`), the notebook becomes a backdoor.

| Subject | Which role it runs under | Common mistake |
|------|------------------|-----------|
| Studio domain | The default execution role specified when the domain was created | The whole team shares one role, so data boundaries collapse |
| Studio user profile | A per-profile execution role overrides the domain default | Profile roles are not separated, defeating least privilege |
| Notebook instance | The role specified when the instance was created | Granting `AdministratorAccess` → the notebook is effectively a backdoor |
| Training, processing, and batch jobs | The role passed with the SDK's `role=` | Reusing the notebook role as is mixes up permissions |
| Endpoint | The role specified when the model was created | Reusing the training role carries over unnecessary write permissions |

The standard is to separate roles by team and project, and have each role allow only the data buckets it needs. If you use tag-based `Condition`s, you can build a boundary like "you can only see jobs whose project tag is yours" with a single policy.

## The Order for Diagnosing Permission Problems

When a permission incident occurs, check first instead of guessing. The job description contains the role ARN actually used and the failure reason as they are.

```python
import boto3

sm = boto3.client('sagemaker')
desc = sm.describe_training_job(TrainingJobName='my-training-job')

print(desc['RoleArn'])        # the execution role this job actually used
print(desc['FailureReason'])  # for AccessDenied, which resource is printed here

# Check the policies actually attached to that role
iam = boto3.client('iam')
role_name = desc['RoleArn'].split('/')[-1]
print(iam.list_attached_role_policies(RoleName=role_name))  # managed policies
print(iam.list_role_policies(RoleName=role_name))           # inline policies
```

If the resource ARN printed in `FailureReason` differs from the policy's `Resource` by even one character (a typo in the bucket name, a missing prefix), that is the cause. If access is denied even though the policy is right, suspect an explicit `Deny`.

The IAM evaluation order is **explicit Deny > explicit Allow > implicit Deny**. Even if the role policy is perfect, if any one of the organization's SCP, the permissions boundary on the role, or the S3 bucket policy has a `Deny`, access is denied. The answer to "I granted everything, so why does it not work" is usually one of these three places.

## When Permissions Block: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| Job creation fails with an `iam:PassRole` denial | The user policy has no PassRole | Grant PassRole limited to that role ARN + the `iam:PassedToService` condition |
| The job fails immediately without even starting | The execution role's trust policy lacks `sagemaker.amazonaws.com` | Add the service principal + `sts:AssumeRole` to the trust relationship |
| S3 `AccessDenied` right after training starts | The execution role has no read permission on the data bucket, or the bucket/prefix does not match | Grant `s3:GetObject`+`s3:ListBucket` on the exact bucket ARN |
| Listing the bucket works but only reading objects fails | The bucket is SSE-KMS and there is no KMS permission | Grant `kms:Decrypt` and `kms:GenerateDataKey` + add the role to the **KMS key policy** too |
| Container image pull fails | ECR actions are missing, or the repository is in another account | Grant the ECR actions. For cross-account, also modify the repository policy |
| Logs and metrics do not appear in CloudWatch | `logs:CreateLogStream` and `PutLogEvents` are missing | Grant the log and metric actions. Without metrics, tuning and early stopping do not work either |
| Only the artifact upload is denied | It hits the encryption-enforcing `Deny` condition | Specify a KMS key on the job so it uploads with SSE-KMS |
| Still denied even after granting all policies | An explicit `Deny` somewhere in the SCP, permissions boundary, or bucket policy | The explicit Deny precedence rule. Check the three places in order |
| A user can view and stop jobs of other people's projects | The user policy is open with resource `*` | Set a project tag boundary with an `aws:ResourceTag` condition |

Tomorrow we cover network isolation - how to detach SageMaker from the internet with VPC mode.

## 📖 Glossary

- **Execution role**: The IAM role SageMaker takes on behalf of the user. All S3, ECR, and CloudWatch access during training happens under this role's identity.
- **Trust policy**: The policy that defines "who can assume this role." For a SageMaker role it contains `sagemaker.amazonaws.com`.
- **Permission policy**: The policy that defines "what this role can do." It consists of actions, resources, and conditions.
- **AssumeRole**: The act of a principal temporarily borrowing a role's identity. It is possible only if the trust policy allows it.
- **iam:PassRole**: The permission for the act of handing a role to another service. It is not a permission of the role itself but of the "handing off."
- **Least privilege**: The principle of allowing only the needed actions and resources. It is narrowed along three axes: action, resource, and condition.
- **Condition block**: The part that restricts the circumstances in which a policy applies. You can set conditions such as tags, encryption, and VPC.
- **Explicit Deny**: A denial written directly with `Effect: Deny`. It takes precedence over any `Allow`, so it is used for guardrails.
- **Permissions boundary**: The upper limit of the permissions a role can have. Even if a policy allows it, it is denied if it falls outside the boundary.
- **Privilege escalation**: A weakly privileged user getting hold of a powerful role. Unrestricted PassRole is the classic path.

---

## 📝 Practice Questions

**Question 1.** A SageMaker training job fails with "Access Denied" as soon as it starts because it cannot read the S3 data. The user does have the `sagemaker:CreateTrainingJob` permission. What is the most appropriate cause?

A) The user IAM policy lacks `s3:GetObject`  
B) The SageMaker execution role's permission policy lacks read permission on that S3 bucket  
C) The S3 bucket is in a different Region  
D) The training instance type is wrong  

**Answer: B**  
Explanation: S3 access while a training job runs is performed not by the user but with the permissions of the execution role that SageMaker took on, so if the execution role lacks bucket read permission, Access Denied occurs. A is wrong because the user policy does not directly determine S3 access while a training job runs, and C and D cause different kinds of errors rather than a permission denial (Access Denied).

---

**Question 2.** A data scientist has permission to create training jobs, but job creation fails with the error "is not authorized to perform: iam:PassRole." What is the most appropriate fix?

A) Add `s3:*` to the execution role  
B) Add the `iam:PassRole` permission for that execution role ARN to the user policy  
C) Remove SageMaker from the execution role's trust policy  
D) Grant the user `AdministratorAccess`  

**Answer: B**  
Explanation: When creating a training job, the user must pass the execution role to SageMaker, which requires the `iam:PassRole` permission, so adding PassRole as the error message says is the fix. A is an execution role permission and unrelated to the PassRole error, C breaks the role's trust and makes things worse, and D goes against the least privilege principle and, since the root cause is PassRole, is an overreaction.

---

**Question 3.** The security team wants to enforce the rule "only KMS-encrypted objects may be uploaded to the model artifact bucket." What is the most effective policy element to add to the execution role?

A) Broadly grant `s3:PutObject` as an `Allow`  
B) A conditional explicit deny that `Deny`s `s3:PutObject` unless `s3:x-amz-server-side-encryption` is `aws:kms`  
C) Set the bucket to public  
D) Remove `iam:PassRole`  

**Answer: B**  
Explanation: A policy that checks the encryption header condition and applies an explicit `Deny` when it is not KMS blocks unencrypted uploads at the source, and an explicit deny takes precedence over any allow, so it is powerful as a guardrail. A instead allows without constraint and nullifies the rule, C worsens security, and D is wrong because PassRole has nothing to do with upload encryption.

---

**Question 4.** What must be included in the trust policy of a SageMaker execution role?

A) A human user's ARN in the `Principal`  
B) `sagemaker.amazonaws.com` as the `Service` of the `Principal`, and the `sts:AssumeRole` action  
C) The `s3:GetObject` action  
D) A specific IP address in the `Condition`  

**Answer: B**  
Explanation: The trust policy defines "who can assume this role," and for SageMaker to take on the role, the service principal `sagemaker.amazonaws.com` must be able to perform `sts:AssumeRole`. A is wrong because a service role is assumed by a service, not a person, C goes in the permission policy rather than the trust policy, and D is not a required element.

---

**Question 5.** Which SageMaker execution role permission policy best conforms to the least privilege principle?

A) Use the `AmazonSageMakerFullAccess` managed policy as is  
B) Allow `s3:*` on all S3 buckets  
C) Allow only `s3:GetObject`/`s3:ListBucket` on the training data bucket and `s3:PutObject` on the artifact bucket, by specific ARNs  
D) Allow both `Action` and `Resource` as `*`  

**Answer: C**  
Explanation: A policy that restricts the actions the job actually needs to specific bucket ARNs and separates the read and write buckets is the narrowest on both the action and resource axes and so conforms to least privilege. A includes broad permissions unnecessary for training, and B and D have excessively broad actions and resources, the opposite of least privilege.

---
