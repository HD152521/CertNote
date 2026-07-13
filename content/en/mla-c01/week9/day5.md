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

## 📝 연습 문제

**문제 1-5** [Practice questions in Korean follow after marker]

---
