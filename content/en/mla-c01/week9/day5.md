# Day 5 - Week 9 Summary: Security, Governance, and Cost Review

This week addressed operating ML safely, controllably, affordably. Permissions (Day 1), networking (Day 2), encryption (Day 3), cost (Day 4) seem separate but combine into one operational policy. Today synthesize Days 1–4 into one decision flow for the exam.

## Four Axes at a Glance

| Axis | Core Question | Main Tools | Exam Traps |
|------|-----------|-----------|-------|
| Permissions (Day 1) | Who does what | Execution role, IAM policy, PassRole | "S3 denied"=execution role, PassRole missing |
| Networking (Day 2) | Where traffic flows | VPC mode, network isolation, VPC Endpoint | Missing endpoint=job hangs |
| Encryption (Day 3) | Data and model protection | KMS (CMK), at-rest/in-transit, Secrets | `kms:Decrypt` missing |
| Cost (Day 4) | How to save | Spot, right-size, serverless/batch, auto-shutdown, tags | Forgotten resources, Spot inference |

> 💡 **Related Theory**: These four axes are AWS Well-Architected Security and Cost Optimization pillars applied to ML. Common thread: "don't trust defaults; tighten explicitly." Permissions narrow, networking isolates, data encrypts, cost cuts. Exam asks "most secure" or "most cost-efficient"—almost always the narrowest/most explicit option wins.

## Permissions Recap — User vs Execution Role

Split into two paths. **User policy** = API call permission + `iam:PassRole`. **Execution role** = S3, ECR, CloudWatch, KMS used during job execution.

```text
Permission Debug Flow
"Job creation fails" → check user policy sagemaker:* and PassRole
"Job starts, S3 denied" → check execution role S3 permission
"Encrypted data read denied" → check execution role kms:Decrypt + key policy
```

Least privilege: narrow by action, resource, condition. Guardrails enforce with explicit `Deny`.

## Networking Recap — Isolation Three Steps

1. **VPC mode**: Attach containers to customer VPC subnet (ENI) with VPC controls.
2. **VPC Endpoints**: Access S3 (gateway) and SageMaker/ECR/Logs/STS (interface/PrivateLink) without internet.
3. **Network isolation (`EnableNetworkIsolation`)**: Block all container outbound (hardest).

```text
Networking Debug Flow
"VPC training hangs" → check S3/ECR VPC Endpoint
"Distributed training no node comms" → check security group self-reference inbound
"Block all external calls" → EnableNetworkIsolation=true + embed dependencies
```

## Encryption Recap — at-rest, in-transit, Secrets

Protect standing data (KMS) and moving data (TLS, node encryption). Training jobs three spots:

- `OutputDataConfig.KmsKeyId` → artifacts
- `ResourceConfig.VolumeKmsKeyId` → volumes
- `EnableInterContainerTrafficEncryption` → node-to-node

CMK = key policy control, audit, crypto-shredding. Credentials → Secrets Manager (auto-rotate) or Parameter Store (manual).

> 💡 **Related Theory**: Permissions and encryption meet at KMS. Encrypted data read needs IAM `kms:Decrypt` AND key policy allowance—both required. Networking and encryption separate: isolation is path control, encryption is content protection. One axis alone leaves gaps.

## Cost Recap — Training, Inference, Operations

- **Training**: Spot + checkpoints max 90% off. Spot training only; never inference.
- **Instances**: Tree=CPU, DL train=GPU, DL inference=Inferentia.
- **Inference**: Idle windows → serverless/async/batch. Always traffic → real-time + autoscaling + MME + Inferentia.
- **Operations**: Auto-shutdown (idle timer, MaxRuntime, scale-in) stops forgotten resources. Tags + Budgets + Cost Explorer = visibility.

## Integration Scenario Mapping

Map exam keywords directly to answers:

- "Training S3 Access Denied" → execution role S3 (not user)
- "Create job iam:PassRole error" → add PassRole to user policy
- "VPC training hangs" → add S3/ECR VPC Endpoint
- "Block all external" → EnableNetworkIsolation=true
- "Encrypted data can't read" → execution role kms:Decrypt + key policy
- "Customer key control needed" → CMK
- "DB password auto-rotate" → Secrets Manager
- "Cheap resumable training" → Spot + CheckpointConfig
- "Nighttime traffic =0 endpoint" → serverless
- "Forgotten resource cost spike" → auto-shutdown + cleanup
- "Team cost split" → cost allocation tags
- "XGBoost cost cut" → CPU (not GPU)

## One Scenario End-to-End

"Secure fintech fraud detection: deep learning training on sensitive data, no internet exposure, cost-controlled."

1. **Permissions**: Execution role reads data bucket, writes artifact bucket (S3 narrow), has PassRole for user.
2. **Networking**: VPC mode + S3/ECR/SageMaker endpoints, no internet gateway, security group outbound to endpoints only.
3. **Encryption**: CMK for data (at-rest), CMK for artifacts, node-to-node encryption, DB creds via Secrets Manager.
4. **Cost**: Spot training + checkpoints, serverless inference (variable fraud-detection load), tags for team tracking, auto-shutdown unused resources.

## Summary

Week 9 in one sentence: **Tighten defaults — permissions minimal (execution role, PassRole), networking isolated (VPC mode, endpoints, isolation), data encrypted (CMK at-rest, TLS in-transit, Secrets), costs cut (Spot, right-size, serverless/batch, auto-shutdown, tags).** Four axes meet at KMS and execution role; debug branches: "user vs execution role," "endpoint missing," "kms:Decrypt," "forgotten resource." These mappings solve security, governance, cost scenarios almost completely.

You've now completed operations knowledge. Next: synthesis with deployment and monitoring.

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
