# Day 1 - SageMaker IAM Security: Execution Roles and Least Privilege

This week addresses "operating ML solutions safely, controllably, and affordably." The first day's topic is permissions. SageMaker separates work into two categories: actions users call directly and actions SageMaker performs on behalf of users. Confusing these two is why permission scenarios trip you up. Today we organize **execution roles** to distinguish user permissions from service permissions, and how to design least privilege.

## User Permissions vs Service Permissions — Separate the Two Paths

Permissions in SageMaker work through two paths.

- **User (IAM principal) permissions**: Whether a person or CI pipeline can call APIs like `sagemaker:CreateTrainingJob`, `sagemaker:CreateEndpoint`. Determined by IAM policies attached to the user.
- **Service (execution role) permissions**: When SageMaker actually runs a training job, it reads data from S3, writes model artifacts, sends CloudWatch logs. Determined by the **execution role that SageMaker assumes**.

```text
User → calls sagemaker:CreateTrainingJob (requires user IAM policy)
            │
            ▼
SageMaker service → AssumeRole with execution role
            │
            ▼
Execution role permissions perform S3 read/write, ECR pull, CloudWatch Logs, KMS, etc.
```

Core insight: If a training job fails with "S3 Access Denied," that's not a user policy problem — it's the **execution role's S3 permission** that's missing. The exam frequently tests this distinction.

> 💡 **Related Theory**: This structure comes from IAM's separation of "trust policy (who can assume this role) + permission policy (what this role can do)." The execution role's trust policy defines "who can assume it" (here: `sagemaker.amazonaws.com`), and the permission policy defines "what it can do." Both must be present for the role to work.

## Execution Role Trust Policy

For SageMaker to assume the execution role, the trust policy must include the SageMaker service principal.

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

The `Principal` is a `Service`, not a person. If this line is missing, SageMaker can't assume the role and the job won't start.

## Building a Least-Privilege Execution Role

AWS's built-in `AmazonSageMakerFullAccess` is convenient for learning but **overkill**. In production, write permission policies granting only what the job actually touches.

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

Notice the intentional narrowing: S3 is **restricted to specific bucket ARNs** (read and write buckets are separate), only needed actions included. Never add `s3:DeleteObject` or `s3:*` to the data bucket—that's the heart of least privilege.

> 💡 **Related Theory**: Least privilege isn't just "as much as needed." Narrow on three axes: ① **Actions** (use `GetObject` instead of `s3:*`), ② **Resources** (specific bucket ARN instead of `*`), ③ **Conditions** (`Condition` block for specific VPC, tags, encryption). On the exam, "most secure policy" almost always means the option with the narrowest actions and resources.

## Conditions for One More Layer of Narrowing

`Condition` blocks limit policies based on context. For example, enforce encryption or allow only tagged jobs.

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

This explicit `Deny` blocks uploads without KMS encryption. Explicit `Deny` overrides any `Allow`, making it powerful for enforcing guardrails.

## User Policy and PassRole

When a user creates a training job, they must "pass" the execution role to SageMaker. That's why user policy needs `iam:PassRole`. Without it, the user has job creation permission but can't attach the role — failure results.

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

The `iam:PassedToService` condition ensures "this role can only be passed to SageMaker." Unrestricted PassRole risks privilege escalation, so always narrow resource and condition.

> 💡 **Related Theory**: `iam:PassRole` is a frequent exam topic. The scenario "user has job creation permission but keeps failing" is usually due to missing PassRole. PassRole is permission to "hand over a role," not the role's own permissions—important distinction.

## Permissions in Studio and Notebooks

SageMaker Studio and notebook instances also run under execution roles. When a data scientist launches training from a notebook, that notebook's execution role permissions govern S3 access and training. Too-broad permissions (like `AdministratorAccess`) turn a notebook into a backdoor. Split roles by team or project, restricting to needed data buckets only.

## Summary

Today in one sentence: **SageMaker permissions split into "who calls what (user policy)" and "what the service does (execution role)."** Give users API call permissions and `iam:PassRole`, and give the execution role only the S3, ECR, CloudWatch, and KMS it truly needs. Narrow on actions, resources, and conditions; enforce guardrails with explicit `Deny`. Permission failures almost always trace to "execution role permission shortage" or "missing PassRole."

Tomorrow: network isolation — using VPC mode to isolate SageMaker from the internet.

---

## 📝 연습 문제

**문제 1-5** [Practice questions in Korean follow after marker]

---
