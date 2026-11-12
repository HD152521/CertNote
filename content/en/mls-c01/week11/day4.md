# Day 4 - Operations & Cost: Cost Optimization, Logging/Audit, Disaster Recovery

ML workflows cost continuously (data pipelines, training GPUs, always-on endpoints). Regulation demands "who did what when." Infrastructure fails. Today's three pillars: **cost**, **audit**, **resilience**.

## Cost Optimization: Training vs Inference Split

Learning and serving have opposite economics.

### Training Cost Cuts
- **Managed Spot Training**: 90% cheaper, checkpoint on interruption
- **Right-sizing**: No GPU if CPU suffices, distributed only if needed
- **Early stopping in AMT**: Discard hopeless trials early

### Inference Cost Cuts
- **Serverless**: Sparse traffic → pay-per-call, zero idle
- **Multi-Model Endpoint**: 1000s models on single endpoint
- **Asynchronous**: Big payload, no urgency → queue, 0-scale
- **Auto Scaling**: Busy → add instances, idle → shrink

## Logging & Audit: CloudWatch vs CloudTrail

| Service | Records | Question |
|------|------|------|
| **CloudWatch Logs** | App/job logs, metrics | "Why did training fail? What was loss?" |
| **CloudWatch Metrics** | CPU, GPU, latency | "Was endpoint healthy? Spike?" |
| **CloudTrail** | **All AWS API calls** | "Who deleted this? When?" |

```text
Training loss curves, container stdout → CloudWatch Logs
Endpoint latency, errors → CloudWatch Metrics
"User alice called DeleteEndpoint at 3:14 UTC" → CloudTrail
```

CloudTrail to S3 (permanent, tamper-proof, audit).

> 💡 **Related Theory**: "Debug performance" = CloudWatch. "Prove compliance" = CloudTrail. CloudTrail is who-what-when-where of every API — regulatory bedrock.

## Disaster Recovery: Data → Model → Endpoint

Three assets need recovery plans.

### Data
- S3 Cross-Region Replication: train data redundant
- Versioning + immutable locks

### Models
- S3 versions + cross-region copy
- Model Registry: which version to restore

### Endpoints
- IaC (CloudFormation/Pipelines): recreate in alt region/account
- Multi-AZ (instance_count ≥ 2): survive single-AZ failure

| Strategy | RTO/RPO | Cost |
|------|------|------|
| Backup & Restore | Slow | Low |
| Pilot Light | Medium | Medium |
| Warm Standby | Fast | High |
| Multi-Region Active | Instant | Highest |

**Key**: Endpoint recreatable from code + Model Registry.

### Availability & Automation
- Endpoint Auto Scaling: handle traffic spikes
- Multi-AZ: instance_count ≥ 2
- EventBridge + Lambda: auto-respond to failures

## Summary

Operations three pillars: (1) Cost = training (Spot, early-stop), inference (Serverless, Async, MME, scaling). (2) Audit = CloudWatch (debug), CloudTrail (compliance). (3) Resilience = data/model/endpoint replication, IaC, multi-AZ, auto-scale.

Tomorrow: Week 11 wrap — monitoring, operations, governance integrated.

## 📝 Practice Questions

**Question 1.** An inference endpoint is invoked only intermittently during a short period of the day and receives no traffic the rest of the time. Which option is MOST appropriate for eliminating idle cost?

A) An always-on large GPU real-time endpoint  
B) Serverless Inference  
C) Fix instance_count at 10  
D) Managed Spot Training  

**Answer: B**  
Explanation: Serverless Inference bills only when there are requests and has zero cost when idle, so it is optimal for intermittent traffic. Always-on endpoints (A, C) incur idle cost, and Spot Training (D) reduces training cost, not inference cost.

---

**Question 2.** To reduce cost, you want to run a GPU training job on Spot, but without losing progress if it is interrupted. What must you configure?

A) Save checkpoints with checkpoint_s3_uri  
B) enable_network_isolation=True  
C) output_kms_key  
D) sampling_percentage=100  

**Answer: A**  
Explanation: Because Spot can be interrupted, you must save checkpoints with checkpoint_s3_uri so that progress can be restored on resume. Network isolation (B) and KMS (C) are security settings, and sampling (D) is a monitoring option; none of them is related to interruption recovery.

---

**Question 3.** In a security audit, you must prove "who deleted the production endpoint last week." Which service should you check?

A) CloudWatch Logs  
B) CloudWatch Metrics  
C) AWS CloudTrail  
D) SageMaker Debugger  

**Answer: C**  
Explanation: CloudTrail records all AWS API calls (who called DeleteEndpoint, when, and from where), supporting auditing and compliance. CloudWatch Logs/Metrics (A, B) are for performance and failure debugging, and Debugger (D) is a tool for analyzing training tensors.

---

**Question 4.** What is the simplest measure to keep a real-time inference endpoint running even if a single Availability Zone (AZ) fails?

A) Set instance_count to 2 or more to distribute across multiple AZs  
B) Keep instance_count at 1 and use a larger instance  
C) Switch to Asynchronous Inference  
D) Enable S3 versioning  

**Answer: A**  
Explanation: If the instance count is 2 or more, SageMaker automatically distributes instances across multiple AZs and withstands a single-AZ failure. A single instance (B) is vulnerable to an AZ failure, Async (C) is for asynchronous processing, and S3 versioning (D) protects data and is unrelated to endpoint availability.

---

**Question 5.** To prepare for a failure of an entire Region, you want to be able to immediately restore training data and model artifacts in another Region as well. Which combination is MOST appropriate?

A) Keep data only on local disks  
B) S3 Cross-Region Replication + versioning + tracking versions with Model Registry  
C) Replace the endpoint with a larger instance  
D) Add only CloudWatch alarms  

**Answer: B**  
Explanation: Replicating data and models to another Region with S3 Cross-Region Replication and versioning, and tracking the version to restore with Model Registry, makes recovery possible even from a Regional failure. Local storage (A) cannot be restored, and replacing instances (C) or adding alarms (D) does not solve DR itself.

---
