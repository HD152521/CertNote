# Day 5 - Week 9 Review: Security, Governance, and Cost

## 📌 Key Takeaways

- Week 9 in one sentence: **do not trust the defaults; narrow them explicitly** — permissions to the minimum, networking to isolation, data to encryption, and cost to idle removal.
- **Permissions** split into two paths. A job **creation** failure points to the user policy (`sagemaker:*` · `iam:PassRole`), and a failure **during job execution** points to the execution role (S3 · ECR · KMS).
- **Networking** has three levels — VPC mode (traffic into my VPC) → VPC endpoints (reach AWS services without the internet) → `EnableNetworkIsolation` (block all outbound).
- **Encryption** has three branches: at-rest (KMS/CMK), in-transit (TLS · node-to-node), and Secrets; and KMS requires passing **both doors**, the IAM policy and the key policy.
- **Cost**: training = Spot + checkpoints, instances = matched to the workload, inference = zero idle, operations = auto-shutdown, tags, and Budgets.

## The Four Axes at a Glance

The four branches of operating "safely, controllably, and cheaply" look separate, but in practice they are bound into a single operating policy.

| Axis | Key question | Main tools | Representative setting keys | Easy-to-confuse pitfall |
|----|-----------|-----------|--------------|----------------|
| Permissions (Day 1) | Who does what | Execution role, IAM policy, PassRole | `RoleArn`, `iam:PassRole` | "S3 denied" = execution role problem; missing PassRole |
| Networking (Day 2) | Where traffic goes | VPC mode, network isolation, VPC endpoints | `VpcConfig`, `EnableNetworkIsolation` | Missing endpoint = job hangs |
| Encryption (Day 3) | Protecting data and models | KMS (CMK), at-rest/in-transit, Secrets | `KmsKeyId`, `VolumeKmsKeyId` | Missing `kms:Decrypt` |
| Cost (Day 4) | How to save | Spot, right-sizing, serverless/batch, auto-shutdown, tags | `EnableManagedSpotTraining`, `Tags` | Resources left on, Spot is for training only |

These four axes apply the security and cost optimization pillars of the AWS Well-Architected Framework to ML. The shared philosophy is "do not trust the defaults; narrow them explicitly." The exam asks you to pick the "most secure" or "most cost-effective" option, and almost always the narrowest, most explicit option is the answer. The four axes are not independent but interlock: the execution role meets KMS at the key policy and the STS endpoint, and networking meets cost in interface endpoint billing.

## Permissions Review — User Policy vs Execution Role

The key is separating the two paths. The **user policy** decides API call permission (`sagemaker:CreateTrainingJob`) and `iam:PassRole`, and the **execution role** decides the S3, ECR, CloudWatch, and KMS that SageMaker touches during a job.

```text
[Path permissions flow through]
  User / CI
      │ ① sagemaker:CreateTrainingJob  (user policy)
      │ ② iam:PassRole → SageMakerExecutionRole
      ▼
  SageMaker service
      │ ③ sts:AssumeRole  (the execution role's trust policy must allow it)
      ▼
  Execution role  ── ④ accesses actual resources with its permission policy
      ├──▶ S3 (Get/PutObject) · ECR (image pull) · CloudWatch Logs
      └──▶ KMS (Decrypt / GenerateDataKey) ← the key policy must also allow this role
```

If ① and ② are blocked, **the job is not even created** (`is not authorized to perform: iam:PassRole`); if ③ and ④ are blocked, **the job starts and then fails during execution** (S3/KMS `Access Denied`). The point at which the error appears is the first fork in diagnosis.

Least privilege narrows along three axes: **action, resource, and condition**. The managed `AmazonSageMakerFullAccess` is convenient for learning but excessive for production, and guardrails are enforced with an explicit `Deny` (an explicit deny takes precedence over any allow). If you open PassRole's resource to `*`, it becomes a privilege escalation path, so you specify the role ARN to be passed and pin down the service it can be passed to with `iam:PassedToService`.

## Networking Review — Three Levels of Isolation

The three levels are not substitutes but **layers used on top of each other**. The further down, the stronger and the more constraining.

| Level | Setting | What it does | Cost |
|------|------|-------------|------|
| ① VPC mode | `VpcConfig` (Subnets · SecurityGroupIds) | Attaches the container to customer VPC subnets (ENI) so VPC controls such as security groups and routing apply | You must provide the endpoints yourself |
| ② VPC endpoints | Gateway / interface (PrivateLink) | Reach S3, SageMaker API, ECR, Logs, and STS without an internet gateway | Interface endpoints are billed |
| ③ Network isolation | `EnableNetworkIsolation: true` | Blocks **all** outbound from the container (including the internet and inside the VPC) | Dependencies must be pre-installed in the image |

| Category | Gateway endpoint | Interface endpoint (PrivateLink) |
|------|----------------------|------------------------------------|
| Target services | **Dedicated** to S3 and DynamoDB | Most others, such as SageMaker API/Runtime, ECR, Logs, and STS |
| How it works | Adds a route to the route table | Creates an ENI in the subnet + assigns a private IP |
| Cost | None | Billed per hour and per data processed |
| Security group | Not attached (routing-based) | A security group attaches to the ENI |

```text
[Endpoints required for VPC-mode training]
com.amazonaws.<region>.s3                  (gateway)   → training data / artifacts
com.amazonaws.<region>.sagemaker.api       (interface) → job control
com.amazonaws.<region>.sagemaker.runtime   (interface) → inference calls
com.amazonaws.<region>.ecr.dkr / ecr.api   (interface) → container image pull
com.amazonaws.<region>.logs                (interface) → CloudWatch Logs
com.amazonaws.<region>.sts                 (interface) → role assumption
```

A security group is an ENI-level firewall. The container SG has a **self-referencing inbound** rule (node-to-node traffic) and 443 outbound (to the endpoint SG), and the endpoint SG has 443 inbound. Without the self-referencing rule, multi-node training does not start.

> ⚠️ **Pitfall**: "After switching to VPC mode, the job starts but makes no progress and times out" is almost never a hyperparameter problem but a **missing S3/ECR endpoint**. Conversely, if the job is not created at all, look at permissions (PassRole), not networking.

## Encryption Review — At-Rest, In-Transit, and Secrets

Lock in what to apply where for each protection target.

| Protection target | Type | Where to apply |
|-----------|------|---------|
| S3 training data | at-rest | SSE-KMS (CMK recommended) + a bucket policy that `Deny`s unencrypted uploads |
| Training instance volumes | at-rest | `ResourceConfig.VolumeKmsKeyId` (EBS/local storage) |
| Model artifacts | at-rest | `OutputDataConfig.KmsKeyId` (`model.tar.gz` is also an intellectual asset) |
| Between distributed training nodes | in-transit | `EnableInterContainerTrafficEncryption` (meaningful only with multiple nodes) |
| S3↔container and endpoint calls | in-transit | TLS/HTTPS (hosting volumes are at-rest via `KmsKeyId`) |
| DB passwords and API keys | Secrets | Secrets Manager / Parameter Store (no hardcoding) |

| Choice | When to pick it |
|--------|-------------|
| AWS managed key vs **CMK** | If you just need simple setup, the managed key; if you need key policy control, CloudTrail auditing, and crypto-shredding, the CMK (the regulatory standard) |
| **Secrets Manager** vs Parameter Store (SecureString) | If you need **automatic rotation**, Secrets Manager; for plain config values or tokens, Parameter Store (manual rotation) |

Permissions and encryption meet at KMS. To read encrypted data, you need both `kms:Decrypt` in the IAM policy AND the role's allowance in the key policy, and writing additionally needs `kms:GenerateDataKey`. That is why the answer to "I granted S3 but it still fails" is KMS.

## Cost Review — Training, Inference, and Operations

| Area | Means | Effect | Where not to use |
|------|------|------|-----------------|
| Training | Managed Spot + checkpoints | Up to 90% savings | Real-time endpoints (service interruption on reclaim) |
| Instances | Tree/linear = CPU, deep learning training = GPU, deep learning inference = Inferentia | Eliminates overprovisioning and mismatch | A high-end GPU for XGBoost (no effect) |
| Instances | Inference Recommender | Recommends the optimal type via load testing | — |
| Inference | Serverless / asynchronous / batch transform | Brings idle-period cost close to 0 | Constant traffic (only the cold starts hurt) |
| Inference | Real-time + autoscaling + MME | Reduces unit cost for constant traffic | Workloads that are mostly idle |
| Operations | Auto-shutdown of idle notebooks, endpoint cleanup, `MaxRuntimeInSeconds` | Blocks resources left on and runaway jobs | — |
| Operations | Tags + Cost Explorer + Budgets | Measure → attribute → budget → alert | — |
| Operations | Savings Plans / reserved instances | Commitment discounts for steady workloads | Intermittent workloads (only the commitment hurts) |

```text
[Inference cost decision tree]
Are there idle periods (zero traffic)?
 ├─ Yes ─▶ Can it be deferred to bulk processing?
 │         ├─ Yes ─▶ Batch transform (instances shut down when the job ends → cheapest)
 │         └─ No ─▶ Is the payload large?
 │                       ├─ Yes ─▶ Asynchronous inference
 │                       └─ No ─▶ Serverless inference (accept cold starts)
 └─ No (constant) ─▶ Real-time + autoscaling + MME (many models) + Inferentia (deep learning)
```

> ⚠️ **Pitfall**: Do not pick Spot just because you see "reduce cost." Spot is only for **resumable training**, and the answer candidates for reducing real-time endpoint cost are a serverless switch, autoscaling, MME, Inferentia, and Savings Plans.

## Requirement Keywords → Feature Mapping

The keywords in exam passages almost literally point to the feature. Memorizing them whole is the fastest way.

| Passage keyword | Feature it points to |
|-------------|---------------|
| "Must not traverse the internet" | VPC mode + VPC endpoints (gateway for S3, interface for the rest) |
| "Completely block the container's external communication" | `EnableNetworkIsolation: true` + pre-installing dependencies in the image |
| "The customer must control and audit the key" | Customer managed key (CMK) + CloudTrail |
| "Protect both data at rest and in transit" | SSE-KMS + TLS · `EnableInterContainerTrafficEncryption` |
| "Automatically rotate passwords periodically" | Secrets Manager (Parameter Store for plain config values) |
| "Block unencrypted uploads at the source" | A conditional explicit `Deny` in the bucket/IAM policy |
| "Choose the most secure policy" | The option with the narrowest actions and resources and a specific bucket ARN |
| "Minimize the cost of resumable training" | Managed Spot + `CheckpointConfig` |
| "Zero traffic at night and on weekends" | Serverless inference (asynchronous for large payloads, batch transform for bulk) |
| "Want to split cost by team and project" | Cost allocation tags + Cost Explorer (Budgets for budget-overrun alerts) |

## Symptom → Cause → Fix

Week 9 debugging reduces to four branches — "is it the user or the execution role," "is it a missing endpoint," "is it `kms:Decrypt`," or "is it a resource left on."

| Symptom | Cause | Fix |
|------|------|------|
| Job creation fails with an `iam:PassRole` error | The user policy has no PassRole | Add a PassRole that specifies the role ARN and `iam:PassedToService` |
| The job started but S3 `Access Denied` | The execution role has no bucket permission | Grant `s3:GetObject`/`PutObject` on that bucket ARN |
| S3 permission exists but reading encrypted objects fails | `kms:Decrypt` missing or not allowed in the key policy | Allow the execution role in **both** the IAM policy and the CMK key policy |
| The job hangs and times out after switching to VPC mode | S3 gateway and ECR interface endpoints missing | Create the needed endpoints + check routing and security group 443 |
| Multi-node training does not start | Security group self-referencing inbound missing | Add an inbound rule with the same SG as its source |
| Spot training restarts from scratch every time | `CheckpointConfig` not specified or no resume logic | Specify the checkpoint S3 path + add resume logic to the script |
| A Spot job ends without even starting | `MaxWaitTimeInSeconds` < `MaxRuntimeInSeconds` | Raise the wait time to at least the run time |
| Monthly cost spikes for unknown reasons | Abandoned notebooks and endpoints, runaway training | Idle auto-shutdown + endpoint cleanup + `MaxRuntimeInSeconds` |

## Integrated Scenario — Fraud Detection on Sensitive Financial Data

Decomposing the requirement "train and serve a deep learning fraud detection model on sensitive financial data while controlling cost" along the four axes gives this.

```text
[Requirements] sensitive data · no internet traversal · customer key control · cost savings

Permissions   A least-privilege execution role allowing only reading the data bucket / writing the artifact bucket
    │         + PassRole limited to that role + a Deny guardrail for unencrypted uploads
Networking    VPC mode (private subnets) + 6 kinds of endpoints, no IGW
    │         + SG self-reference if distributed / network isolation for extreme sensitivity
Encryption    One CMK for volume and artifact at-rest + node-to-node in-transit
    │         + the execution role allowed in the key policy / DB credentials in Secrets Manager
Cost          Spot + checkpoints / inference per traffic pattern / tags and idle auto-shutdown
```

Translating this into a single training job request, all four axes show up as parameters.

```python
import boto3
sm = boto3.client("sagemaker")

sm.create_training_job(
    TrainingJobName="fraud-dl-2026-01",
    RoleArn=EXEC_ROLE_ARN,                       # permissions: least-privilege execution role
    OutputDataConfig={"S3OutputPath": "s3://ml-artifacts/fraud/",
                      "KmsKeyId": CMK_ARN},      # encryption: artifacts at-rest
    ResourceConfig={"InstanceType": "ml.g5.xlarge", "InstanceCount": 2,
                    "VolumeKmsKeyId": CMK_ARN},  # encryption: volumes at-rest
    VpcConfig={"Subnets": ["subnet-0a1b2c3d", "subnet-4e5f6a7b"],
               "SecurityGroupIds": ["sg-0123456789abcdef0"]},   # networking
    EnableNetworkIsolation=True,                 # networking: block all outbound
    EnableInterContainerTrafficEncryption=True,  # encryption: node-to-node in-transit
    EnableManagedSpotTraining=True,              # cost: Spot
    CheckpointConfig={"S3Uri": "s3://ml-checkpoints/fraud/"},
    StoppingCondition={"MaxRuntimeInSeconds": 86400,
                       "MaxWaitTimeInSeconds": 90000},          # cost: block runaway jobs
    Tags=[{"Key": "Team", "Value": "risk"},      # governance: cost attribution
          {"Key": "Project", "Value": "fraud-ml"}],
)
```

You verify the savings from the difference between `TrainingTimeInSeconds` (actual training time) and `BillableTimeInSeconds` (billed time) in the `describe_training_job` response.

This snippet is the compressed version of Week 9 — `RoleArn` (permissions) → `VpcConfig` · `EnableNetworkIsolation` (networking) → `KmsKeyId` · `VolumeKmsKeyId` (encryption) → `EnableManagedSpotTraining` · `Tags` (cost and governance). When reading a passage, if you recall "which parameter does this requirement map to," identifying the right option finishes immediately.

That completes a full lap through the operations domain of ML solutions. Next comes the stage of consolidating all the knowledge built up so far with full-length practice exams.

## 📖 Glossary

- **Execution role** : The IAM role SageMaker takes on for the user. All S3, ECR, and KMS access during a job happens with this role's permissions.
- **iam:PassRole** : The permission for the act of the user "handing" a role to a service. The key point is that it is the permission to pass, not a permission of the role itself.
- **Trust policy** : The policy that defines "who can assume this role." For a SageMaker execution role, `sagemaker.amazonaws.com` must be included.
- **VPC mode** : A setting that attaches the container to customer VPC subnets as an ENI so that familiar VPC controls such as security groups and routing apply.
- **EnableNetworkIsolation** : The strongest isolation, cutting off all outbound calls from the container. In return, you must put all dependencies into the image beforehand.
- **VPC endpoint** : A pathway to reach AWS services without crossing the internet. S3 and DynamoDB use the free gateway type, and everything else uses the billed interface (PrivateLink) type.
- **Customer managed key (CMK)** : A KMS key you create yourself, controlling access with a key policy and auditing with CloudTrail. The de facto standard in regulated environments.
- **crypto-shredding** : A method of making data effectively unreadable by cutting off key access instead of deleting the data. One of the reasons to use a CMK.
- **Managed Spot Training** : Training by renting spare capacity cheaply (up to 90% savings). Because it can be reclaimed, checkpoints are its partner.
- **Cost allocation tags** : Tags such as `Team` and `Project` attached to resources. Only with these can you split cost by team and project in Cost Explorer.

---

## 📝 Practice Questions

**Question 1.** For a workload that trains on sensitive data, you must satisfy both "the container must not be able to exfiltrate data to the internet" and "encrypt training data and artifacts with a customer-controlled key." Which combination is the most appropriate?

A) Public subnet + AWS managed key  
B) VPC mode (or network isolation) + at-rest encryption with a customer managed key (CMK)  
C) Add an internet gateway + no encryption  
D) Real-time endpoint + Spot  

**Answer: B**  
Explanation: Blocking internet exfiltration is handled by VPC mode (or the stronger network isolation), and customer-controlled key encryption is handled by encrypting data and artifacts at rest with a CMK, which together satisfy both requirements. In A, a public subnet opens an exfiltration path and a managed key gives weaker control, C violates both requirements, and D is a training cost option unrelated to the security requirements.

---

**Question 2.** The user has the `sagemaker:CreateTrainingJob` permission, and the execution role also has appropriate S3 permissions. However, job creation fails with "is not authorized to perform: iam:PassRole." Which cause and fix are correct?

A) The execution role lacks KMS permission → add kms:Decrypt  
B) The user's policy lacks `iam:PassRole` for that execution role → add PassRole  
C) There is no VPC endpoint → add an endpoint  
D) The Spot configuration is wrong → disable Spot  

**Answer: B**  
Explanation: When creating a job, the user must pass the execution role to SageMaker, and this requires `iam:PassRole`, so adding PassRole to the user's policy as the error message indicates resolves it. In A, KMS permission problems appear during decryption while the job runs, in C a missing endpoint shows up as the job hanging, and in D Spot is unrelated to the PassRole error.

---

**Question 3.** Multiple data science teams use SageMaker in one account, and monthly costs are growing out of control with no way to know who spends how much. Which combination of measures is the most appropriate to make costs visible and control them?

A) Delete all resources  
B) Aggregate in Cost Explorer with cost allocation tags (Team/Project) + limits and alerts with AWS Budgets + automatic shutdown of idle resources  
C) Standardize all instances on GPU  
D) Keep all endpoints running at all times  

**Answer: B**  
Explanation: Tags that attribute cost to teams and projects with visibility in Cost Explorer, limits and alerts with Budgets, and automatic shutdown of idle resources to prevent waste together cover measurement, attribution, budgeting, and prevention. A halts work, C increases cost, and D increases idle cost and worsens the problem.

---

**Question 4.** A VPC mode training job tries to read S3 training data encrypted with SSE-KMS (CMK). The execution role has S3 read permission, but the job fails with a KMS-related Access Denied. Which item is the most appropriate to check?

A) The training algorithm's hyperparameters  
B) The execution role's `kms:Decrypt` permission and the role's allowance in that CMK's key policy  
C) The notebook instance type  
D) Cost Explorer tags  

**Answer: B**  
Explanation: Decrypting SSE-KMS data requires both `kms:Decrypt` in the IAM policy and the role's allowance in the key policy, so for a KMS Access Denied you should check whether either of these two is missing. A and C are unrelated to permission denial, and D is a cost tool with no relation to decrypt permission.

---

**Question 5.** Which of the following incorrectly pairs a Week 9 scenario with its recommended measure?

A) Reducing cost of resumable deep learning training → Managed Spot Training + checkpoints  
B) Cost of an intermittent endpoint with zero traffic at night → switch to serverless inference  
C) Automatic DB password rotation → AWS Secrets Manager  
D) Reducing real-time inference endpoint cost → run the endpoint on Spot instances  

**Answer: D**  
Explanation: If Spot capacity is reclaimed, a real-time inference endpoint's service is interrupted, so Spot is inappropriate, and Spot suits only resumable training. A, B, and C are all correct pairings: resumable training = Spot + checkpoints, zero-idle periods = serverless, and automatically rotated credentials = Secrets Manager.

---
