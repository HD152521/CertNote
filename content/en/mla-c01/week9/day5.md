# Day 5 - Week 9 Wrap-Up: Security, Governance, and Cost Review

## 📌 Key Takeaways

- Week 9 in one sentence: **don't trust defaults, narrow them explicitly**: permissions to the minimum, the network to isolation, data to encryption, and cost to removing idle resources.
- **Permissions** split into two paths. A failure when **creating** a job is the user policy (`sagemaker:*`, `iam:PassRole`), and a failure **while the job is running** is the execution role (S3, ECR, KMS).
- The **network** has 3 stages: VPC mode (traffic into my VPC) → VPC endpoints (reach AWS services without the internet) → `EnableNetworkIsolation` (block all outbound).
- **Encryption** has three branches: at-rest (KMS/CMK), in-transit (TLS, between nodes), and Secrets, and KMS requires passing through **both doors**, the IAM policy and the key policy.
- For **cost**: training = Spot + checkpoints, instances = fit to the workload, inference = zero idle, operations = auto shutdown, tags, and Budgets.

## The Four Axes at a Glance

The four branches of operating "safely, controllably, and cheaply" look separate, but in practice they are bound into a single operating policy.

| Axis | Core question | Main tools | Representative setting keys | Easy-to-confuse trap |
|----|-----------|-----------|--------------|----------------|
| Permissions (Day 1) | Who does what | Execution role, IAM policy, PassRole | `RoleArn`, `iam:PassRole` | "S3 denied" = an execution role problem, missing PassRole |
| Network (Day 2) | Where does traffic go | VPC mode, network isolation, VPC endpoints | `VpcConfig`, `EnableNetworkIsolation` | Missing endpoint = job hangs |
| Encryption (Day 3) | Protecting data and models | KMS (CMK), at-rest/in-transit, Secrets | `KmsKeyId`, `VolumeKmsKeyId` | Missing `kms:Decrypt` |
| Cost (Day 4) | How to save | Spot, right-sizing, serverless/batch, auto shutdown, tags | `EnableManagedSpotTraining`, `Tags` | Resources left on, Spot is for training only |

These four axes apply the security and cost optimization pillars of the AWS Well-Architected Framework to ML. The common philosophy is "don't trust defaults, narrow them explicitly." The exam asks you to pick the "most secure" or "most cost-effective" option, and almost always the narrowest, most explicit option is the answer. The four axes are not independent; they interlock. The execution role meets encryption at the KMS key policy and the STS endpoint, and the network meets cost in interface endpoint charges.

## Permissions Review: User Policy vs. Execution Role

The key is separating the two paths. The **user policy** decides API call permission (`sagemaker:CreateTrainingJob`) and `iam:PassRole`, and the **execution role** decides the S3, ECR, CloudWatch, and KMS that SageMaker touches during a job.

```text
[Path along which permissions flow]
  User / CI
      │ ① sagemaker:CreateTrainingJob  (user policy)
      │ ② iam:PassRole → SageMakerExecutionRole
      ▼
  SageMaker service
      │ ③ sts:AssumeRole  (the execution role's trust policy must allow it)
      ▼
  Execution role  ── ④ Access actual resources with the permissions policy
      ├──▶ S3 (Get/PutObject) · ECR (image pull) · CloudWatch Logs
      └──▶ KMS (Decrypt / GenerateDataKey) ← the key policy must also allow this role
```

If ① and ② are blocked, **the job isn't even created** (`is not authorized to perform: iam:PassRole`), and if ③ and ④ are blocked, **the job starts and then fails during execution** (S3/KMS `Access Denied`). The point at which the error appears is the first fork in diagnosis.

Least privilege is narrowed along three axes: **actions, resources, and conditions**. The managed `AmazonSageMakerFullAccess` is convenient for training but excessive for production, and guardrails are enforced with an explicit `Deny` (an explicit deny takes precedence over any allow). If you open PassRole's resource to `*` it becomes a privilege escalation path, so you specify the role ARN to be passed and pin down even the service it is passed to with `iam:PassedToService`.

## Network Review: Three Stages of Isolation

The three stages are not substitutes but **layers used together**. The further down you go, the stronger and the more constraining it is.

| Stage | Setting | What it does | Cost |
|------|------|-------------|------|
| ① VPC mode | `VpcConfig` (Subnets, SecurityGroupIds) | Attaches the container to customer VPC subnets (ENI) to apply VPC controls such as security groups and routing | You must provide the endpoints yourself |
| ② VPC endpoints | Gateway / Interface (PrivateLink) | Reach S3, SageMaker API, ECR, Logs, and STS without an internet gateway | Interface endpoints are charged |
| ③ Network isolation | `EnableNetworkIsolation: true` | Blocks **all** outbound from the container (including the internet and inside the VPC) | Dependencies must be pre-installed in the image |

| Aspect | Gateway endpoint | Interface endpoint (PrivateLink) |
|------|----------------------|------------------------------------|
| Target services | **Only** S3 and DynamoDB | Most others: SageMaker API/Runtime, ECR, Logs, STS, etc. |
| How it works | Adds a route to the route table | Creates an ENI in the subnet + assigns a private IP |
| Cost | None | Charged per hour and per data processed |
| Security group | Not attached (routing-based) | A security group attaches to the ENI |

```text
[Endpoints needed for VPC-mode training]
com.amazonaws.<region>.s3                  (gateway) → training data / artifacts
com.amazonaws.<region>.sagemaker.api       (interface) → job control
com.amazonaws.<region>.sagemaker.runtime   (interface) → inference calls
com.amazonaws.<region>.ecr.dkr / ecr.api   (interface) → container image pull
com.amazonaws.<region>.logs                (interface) → CloudWatch Logs
com.amazonaws.<region>.sts                 (interface) → role assume
```

A security group is an ENI-level firewall. The container SG has a **self-referencing inbound** rule (node-to-node communication) and 443 outbound (to the endpoint SG), and the endpoint SG has 443 inbound. Without the self-referencing rule, multi-node training won't start.

> ⚠️ **Trap**: "I switched to VPC mode and the job starts but doesn't progress and times out" is almost always not a hyperparameter problem but a **missing S3/ECR endpoint**. Conversely, if the job isn't created at all, look at permissions (PassRole), not the network.

## Encryption Review: At-Rest, In-Transit, and Secrets

Let's firm up what to apply where, by what is being protected.

| What is protected | Type | Where to apply |
|-----------|------|---------|
| S3 training data | at-rest | SSE-KMS (CMK recommended) + a bucket policy that `Deny`s unencrypted uploads |
| Training instance volume | at-rest | `ResourceConfig.VolumeKmsKeyId` (EBS/local storage) |
| Model artifacts | at-rest | `OutputDataConfig.KmsKeyId` (`model.tar.gz` is also intellectual property) |
| Between distributed training nodes | in-transit | `EnableInterContainerTrafficEncryption` (meaningful only for multi-node) |
| S3↔container and endpoint calls | in-transit | TLS/HTTPS (the hosting volume is at-rest via `KmsKeyId`) |
| DB passwords and API keys | Secrets | Secrets Manager / Parameter Store (no hardcoding) |

| Choice | When to pick it |
|--------|-------------|
| AWS managed key vs. **CMK** | If you just need simple setup, a managed key; if you need key policy control, CloudTrail auditing, and crypto-shredding, a CMK (the regulatory standard) |
| **Secrets Manager** vs. Parameter Store (SecureString) | If you need **automatic rotation**, Secrets Manager; for simple settings or tokens, Parameter Store (manual rotation) |

Permissions and encryption meet at KMS. To read encrypted data you need both `kms:Decrypt` in the IAM policy AND the role being allowed in the key policy, and for writing `kms:GenerateDataKey` is additionally required. That is why the answer to "I granted S3 but it still doesn't work" is KMS.

## Cost Review: Training, Inference, and Operations

| Area | Means | Effect | Where not to use it |
|------|------|------|-----------------|
| Training | Managed Spot + checkpoints | Up to 90% savings | Real-time endpoints (the service stops if reclaimed) |
| Instances | Tree/linear = CPU, deep learning training = GPU, deep learning inference = Inferentia | Eliminates over-provisioning and mismatch | A high-end GPU for XGBoost (no effect) |
| Instances | Inference Recommender | Recommends the optimal type via load tests | — |
| Inference | Serverless / asynchronous / batch transform | Brings idle-period cost close to 0 | Constant traffic (only the cold starts hurt) |
| Inference | Real-time + autoscaling + MME | Lowers unit cost for constant traffic | Workloads that are mostly idle |
| Operations | Auto shutdown of idle notebooks, endpoint cleanup, `MaxRuntimeInSeconds` | Blocks resources left on and runaway jobs | — |
| Operations | Tags + Cost Explorer + Budgets | Measure → attribute → budget → alert | — |
| Operations | Savings Plans / Reserved Instances | Commitment discounts for steady workloads | Intermittent workloads (only the commitment hurts) |

```text
[Inference cost decision tree]
Are there idle periods (zero traffic)?
 ├─ Yes ─▶ Is it OK to defer to batch processing?
 │         ├─ Yes ─▶ Batch transform (instances come down when the job ends → cheapest)
 │         └─ No ─▶ Is the payload large?
 │                       ├─ Yes ─▶ Asynchronous inference
 │                       └─ No ─▶ Serverless inference (accept the cold start)
 └─ No (constant) ─▶ Real-time + autoscaling + MME (many models) + Inferentia (deep learning)
```

> ⚠️ **Trap**: Don't pick Spot just because you see "reduce cost." Spot is only for **resumable training**, and the candidate answers for reducing real-time endpoint cost are switching to serverless, autoscaling, MME, Inferentia, and Savings Plans.

## Requirement Keyword → Feature Mapping

The keywords in exam questions almost directly point to the feature. Memorizing them whole is the fastest way.

| Keyword in the question | Feature it points to |
|-------------|---------------|
| "Must not go through the internet" | VPC mode + VPC endpoints (gateway for S3, interface for the rest) |
| "Completely block the container's external communication" | `EnableNetworkIsolation: true` + pre-installing dependencies in the image |
| "The customer must control and audit the keys" | Customer managed key (CMK) + CloudTrail |
| "Protect both data at rest and in transit" | SSE-KMS + TLS and `EnableInterContainerTrafficEncryption` |
| "Automatically rotate passwords periodically" | Secrets Manager (Parameter Store for simple settings) |
| "Block unencrypted uploads at the source" | A conditional explicit `Deny` in the bucket/IAM policy |
| "Choose the most secure policy" | The option with the narrowest actions and resources and a specific bucket ARN |
| "Minimize cost of resumable training" | Managed Spot + `CheckpointConfig` |
| "Traffic is zero at night and on weekends" | Serverless inference (asynchronous for large payloads, batch transform for batches) |
| "I want to see costs split by team and project" | Cost allocation tags + Cost Explorer (Budgets for budget-overrun alerts) |

## Symptom → Cause → Action

Week 9's debugging boils down to four branches: "user or execution role," "missing endpoint," "`kms:Decrypt`," and "resource left on."

| Symptom | Cause | Action |
|------|------|------|
| Job creation fails with an `iam:PassRole` error | The user policy has no PassRole | Add a PassRole that specifies the role ARN and `iam:PassedToService` |
| The job started but S3 `Access Denied` | The execution role has no bucket permission | Grant `s3:GetObject`/`PutObject` on that bucket ARN |
| Has S3 permission but reading an encrypted object fails | `kms:Decrypt` missing or the key policy doesn't allow it | Allow the execution role in **both** the IAM policy and the CMK key policy |
| After VPC mode the job hangs and times out | S3 gateway / ECR interface endpoints missing | Create the needed endpoints + check routing and security group 443 |
| Multi-node training doesn't start | Security group self-referencing inbound missing | Add an inbound rule with the same SG as its source |
| Spot training starts from scratch every time | `CheckpointConfig` not specified or no resume logic | Specify a checkpoint S3 path + add resume logic to the script |
| A Spot job ends without even starting | `MaxWaitTimeInSeconds` < `MaxRuntimeInSeconds` | Raise the wait time to at least the run time |
| Monthly cost spikes for an unknown reason | Neglected notebooks and endpoints, runaway training | Idle auto shutdown + endpoint cleanup + `MaxRuntimeInSeconds` |

## Integrated Scenario: Fraud Detection on Sensitive Financial Data

Decomposing the requirement "train and serve a deep learning fraud-detection model on sensitive financial data while controlling cost" along the 4 axes gives this.

```text
[Requirement] Sensitive data · no internet path · customer key control · cost savings

Permissions  A least-privilege execution role allowing only reading the data bucket / writing the artifact bucket
    │    + PassRole limited to that role + a Deny guardrail for unencrypted uploads
Network  VPC mode (private subnets) + 6 endpoints, no IGW
    │    + SG self-reference if distributed / network isolation for extreme sensitivity
Encryption    One CMK for volume and artifact at-rest + node-to-node in-transit
    │    + allow the execution role in the key policy / DB credentials in Secrets Manager
Cost     Spot + checkpoints / inference per traffic pattern / tags and idle auto shutdown
```

When you translate this into a single training job request, all four axes show up as parameters.

```python
import boto3
sm = boto3.client("sagemaker")

sm.create_training_job(
    TrainingJobName="fraud-dl-2026-01",
    RoleArn=EXEC_ROLE_ARN,                       # Permissions: least-privilege execution role
    OutputDataConfig={"S3OutputPath": "s3://ml-artifacts/fraud/",
                      "KmsKeyId": CMK_ARN},      # Encryption: artifacts at-rest
    ResourceConfig={"InstanceType": "ml.g5.xlarge", "InstanceCount": 2,
                    "VolumeKmsKeyId": CMK_ARN},  # Encryption: volume at-rest
    VpcConfig={"Subnets": ["subnet-0a1b2c3d", "subnet-4e5f6a7b"],
               "SecurityGroupIds": ["sg-0123456789abcdef0"]},   # Network
    EnableNetworkIsolation=True,                 # Network: block all outbound
    EnableInterContainerTrafficEncryption=True,  # Encryption: node-to-node in-transit
    EnableManagedSpotTraining=True,              # Cost: Spot
    CheckpointConfig={"S3Uri": "s3://ml-checkpoints/fraud/"},
    StoppingCondition={"MaxRuntimeInSeconds": 86400,
                       "MaxWaitTimeInSeconds": 90000},          # Cost: block runaway jobs
    Tags=[{"Key": "Team", "Value": "risk"},      # Governance: cost attribution
          {"Key": "Project", "Value": "fraud-ml"}],
)
```

You can confirm the savings from the difference between `TrainingTimeInSeconds` (actual training time) and `BillableTimeInSeconds` (billed time) in the `describe_training_job` response.

This snippet is the compressed version of Week 9: `RoleArn` (permissions) → `VpcConfig` and `EnableNetworkIsolation` (network) → `KmsKeyId` and `VolumeKmsKeyId` (encryption) → `EnableManagedSpotTraining` and `Tags` (cost and governance). When reading a question, if you ask yourself "which parameter does this requirement land on?", telling the options apart is over instantly.

With this we've gone one full lap through the operations area of ML solutions. Next is the stage of consolidating the knowledge built so far with a full-length mock exam.

## 📖 Glossary

- **Execution role**: The IAM role SageMaker assumes on your behalf. All access to S3, ECR, and KMS during a job is done with this role's permissions.
- **iam:PassRole**: The permission for the act of a user "handing over" a role to a service. The key point is that it is not the role's own permission but the permission to hand it over.
- **Trust policy**: The policy that defines "who can assume this role." For a SageMaker execution role, `sagemaker.amazonaws.com` must be in it.
- **VPC mode**: A setting that attaches the container to customer VPC subnets as an ENI so that familiar VPC controls such as security groups and routing apply.
- **EnableNetworkIsolation**: The strongest isolation, which cuts all of the container's outbound calls. In exchange, all dependencies must be put in the image beforehand.
- **VPC endpoint**: A pathway that reaches AWS services without going through the internet. S3 and DynamoDB use the free gateway type, and everything else uses the charged interface (PrivateLink) type.
- **Customer managed key (CMK)**: A KMS key you create yourself, control access to with the key policy, and audit with CloudTrail. The de facto standard in regulated environments.
- **crypto-shredding**: A way of making data effectively unreadable by cutting off key access rather than deleting the data. One reason to use a CMK.
- **Managed Spot Training**: Training by renting spare capacity cheaply (up to 90% savings). Since it can be reclaimed, checkpoints are its partner.
- **Cost allocation tags**: Tags like `Team` and `Project` that you attach to resources. Only with these can you split costs by team and project in Cost Explorer.

---

## 📝 Practice Questions

**Question 1.** In a workload training on sensitive data, you must simultaneously satisfy "the container must not be able to leak data over the internet" and "encrypt training data and artifacts with a key the customer controls." What is the most appropriate combination?

A) Public subnet + AWS managed key  
B) VPC mode (or network isolation) + at-rest encryption with a customer managed key (CMK)  
C) Add an internet gateway + no encryption  
D) Real-time endpoint + Spot  

**Answer: B**  
Explanation: VPC mode (or the stronger network isolation) blocks internet leakage, and encrypting the data and artifacts at rest with a CMK provides key encryption the customer controls, satisfying both requirements together. In A, a public subnet opens a leakage path and a managed key has weaker control; C violates both requirements; D is a training-cost option unrelated to the security requirements.

---

**Question 2.** A user has the `sagemaker:CreateTrainingJob` permission and the execution role has appropriate S3 permissions. But job creation fails with "is not authorized to perform: iam:PassRole." Which cause and fix is correct?

A) The execution role lacks KMS permission → add kms:Decrypt  
B) The user policy lacks `iam:PassRole` for that execution role → add PassRole  
C) There is no VPC endpoint → add endpoints  
D) The Spot setting is wrong → disable Spot  

**Answer: B**  
Explanation: When creating a job, the user must hand the execution role over to SageMaker, which requires `iam:PassRole`, so as the error message says, you add PassRole to the user policy. In A, a KMS permission problem shows up at decryption while the job is running; in C, a missing endpoint shows up as the job hanging; in D, Spot is unrelated to a PassRole error.

---

**Question 3.** Several data science teams use SageMaker in one account, and the monthly cost grows out of control and no one knows who spends how much. What is the most appropriate combination of actions to make cost visible and control it?

A) Delete all resources  
B) Aggregate in Cost Explorer by cost allocation tags (Team/Project) + limits and alerts with AWS Budgets + auto shutdown of idle resources  
C) Standardize all instances to GPU  
D) Keep all endpoints on at all times  

**Answer: B**  
Explanation: Tags that attribute cost to teams and projects with Cost Explorer for visibility, Budgets for limits and alerts, and auto shutdown of idle resources to prevent waste together satisfy measurement, attribution, budgeting, and blocking. A halts work, C increases cost, and D increases idle cost, making the problem worse.

---

**Question 4.** A VPC-mode training job tries to read S3 training data encrypted with SSE-KMS (a CMK). The execution role has S3 read permission, but the job fails with a KMS-related Access Denied. What is the most appropriate item to check?

A) The training algorithm's hyperparameters  
B) The execution role's `kms:Decrypt` permission and the role being allowed in that CMK's key policy  
C) The notebook instance type  
D) Cost Explorer tags  

**Answer: B**  
Explanation: Decrypting SSE-KMS data requires both `kms:Decrypt` in the IAM policy and the role being allowed in the key policy, so for a KMS Access Denied you must check whether one of these two is missing. A and C are unrelated to permission denials, and D is a cost tool unrelated to decryption permissions.

---

**Question 5.** Which of the following pairings of a scenario covered in Week 9 and its recommended action is incorrect?

A) Reducing the cost of resumable deep learning training → Managed Spot Training + checkpoints  
B) Cost of an intermittent endpoint with zero traffic at night → switch to serverless inference  
C) Automatic rotation of DB passwords → AWS Secrets Manager  
D) Reducing the cost of a real-time inference endpoint → run the endpoint on Spot instances  

**Answer: D**  
Explanation: For a real-time inference endpoint, the service stops if Spot is reclaimed, so Spot is inappropriate; Spot suits only resumable training. A, B, and C are each correct pairings: resumable training = Spot + checkpoints, zero-idle intervals = serverless, and auto-rotating credentials = Secrets Manager.

---
