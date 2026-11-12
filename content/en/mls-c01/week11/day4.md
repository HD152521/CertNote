# Day 4 - Operations & Cost: Cost Optimization, Logging/Audit, Disaster Recovery

## 📌 Key Takeaways

- Operations rests on three pillars: **cost**, **audit**, and **resilience**. An ML workflow keeps spending money on data pipelines, training GPUs, and always-on endpoints.
- The economics of training and inference are opposites. You cut training by **tolerating interruption (Spot)**, and you cut inference by **eliminating idle cost**.
- Managed Spot Training saves up to **90%**, but **saving checkpoints is practically mandatory**.
- "Why did it fail / how slow is it" is **CloudWatch**; "who did what, and when" is **CloudTrail**.
- DR plans for three assets separately: **data → model → endpoint**. An endpoint must be re-creatable from code (IaC) plus the Model Registry.

## Cost Optimization: Training and Inference Have Different Economics

| Aspect | Training | Inference |
|---|---|---|
| Nature of the job | Batch, runs once and ends | Always waiting, must be ready to receive requests |
| Interruption tolerance | Possible (resume from a checkpoint) | Hard (requests fail immediately) |
| Main waste | Oversized instances, running hopeless attempts to the end | **Time switched on while nobody calls it** |
| Typical savings tools | Managed Spot, early stopping, right-sizing | Serverless, Async, Batch Transform, Auto Scaling |
| Cost unit | Instance hours × number of jobs | Instance hours × 24 hours × 365 days |

- For training, the problem is the **total volume**; for inference, the problem is **idle time**. This difference separates the answer options.
- If usage is stable over the long term, a 1-year or 3-year commitment discount such as SageMaker Savings Plans is also a candidate.

### Reducing Training Cost

- **Managed Spot Training**: Uses spare capacity in exchange for possible interruption. Saves up to **90%**.
- **Right-sizing**: Don't use a GPU if a CPU is enough, and turn on distributed training only when needed.
- **AMT early stopping**: Drops hopeless trials early in hyperparameter tuning.
- **Maximum runtime limit**: Cuts off an infinite loop or a diverged training run that would spin all night, using `max_run`.
- **Warm-start tuning**: Inherits the results of a previous tuning job to reduce the number of search trials.

#### Managed Spot Training in Detail

```python
estimator = Estimator(
    ...,
    use_spot_instances=True,
    max_run=3600,        # maximum time allowed for the actual training
    max_wait=7200,       # total allowed time, waiting + training (must be >= max_run)
    checkpoint_s3_uri="s3://ml-train-bucket/checkpoints/job-01/",
)
```

| Parameter | Meaning | If you omit it |
|---|---|---|
| `use_spot_instances` | Whether to use Spot capacity | You pay the On-Demand rate as is |
| `max_run` | Maximum runtime of the training itself | A runaway job keeps getting billed |
| `max_wait` | Total allowed time including the wait for Spot capacity | Must be set when using Spot, and must not be smaller than `max_run` |
| `checkpoint_s3_uri` | Save checkpoints to S3 | On interruption, training restarts **from scratch** |

```text
[Spot training timeline]
  Wait for capacity ──▶ Training starts ──▶ Checkpoint saved ──▶ ✗ Interruption
                                     │
                                     └─▶ Capacity recovers ──▶ Resume from checkpoint ──▶ Done
  ◀────────────────── max_wait (wait + all of training) ──────────────────▶
                      ◀──────── max_run (training time) ────────▶
```

> ⚠️ **Pitfall**: The answer to "How do you cut cost with Spot without losing progress?" is always **checkpoints**. Network isolation, KMS, and sampling options have nothing to do with recovering from an interruption.

### Reducing Inference Cost: Four Deployment Options

| Option | Billing method | Idle cost | Scale to zero | Suitable traffic |
|---|---|---|---|---|
| **Real-time Endpoint** | Instance hours (always on) | Yes | Not possible (default) | Steady, latency-sensitive traffic |
| **Serverless Inference** | Based on invocations and execution time | None | Possible | Intermittent, unpredictable traffic where cold starts are tolerable |
| **Asynchronous Inference** | Instance hours while processing | Down to 0 if there are no requests | Possible | Large payloads, long processing, no immediate answer needed |
| **Batch Transform** | Only the job run time | None (there is no endpoint at all) | Not applicable | Periodically scoring an entire dataset in bulk |

| Supplementary tool | What it does | When |
|---|---|---|
| **Multi-Model Endpoint (MME)** | Hosts thousands of models on one endpoint, loading from S3 on request | Many models with similar structure, each invoked rarely |
| **Auto Scaling** | Increases and decreases the instance count with traffic | Real-time traffic with large day/night swings |
| **Inference Recommender** | Recommends a suitable instance type and count via load testing | When you don't know which instance to use |

- **Serverless**: No billing while idle, but if there are no invocations for a long time a **cold start** delay occurs.
- **Async**: Puts requests in a queue and writes results to S3. When the queue is empty, instances can be scaled down to 0.
- **Batch Transform**: No endpoint is created at all, so the always-on cost is 0. If you don't need real-time responses, it is the cheapest.
- **MME**: The model is loaded into memory on the first call, so only that request is slow. It is unsuitable if you are extremely latency-sensitive.

### Cost Selection Decision Tree

```text
Need to reduce inference cost
├─ Is a real-time response needed?
│    ├─ No ↓
│    │    ├─ Periodically score the entire dataset → Batch Transform (always-on cost 0)
│    │    └─ Per-request but no immediate answer needed, large payload → Asynchronous Inference
│    └─ Yes ↓
├─ Is the traffic intermittent and hard to predict?
│    ├─ Yes → Serverless Inference (idle cost 0, tolerate cold starts)
│    └─ No ↓
├─ Are there very many models, each invoked rarely?
│    ├─ Yes → Multi-Model Endpoint (share one endpoint)
│    └─ No ↓
└─ Steady but with large time-of-day swings?
     ├─ Yes → Real-time + Auto Scaling
     └─ No → Real-time (right-sizing + consider a commitment discount)
```

## Logging and Audit: CloudWatch vs CloudTrail

| Service | What it records | Question it answers |
|------|------|------|
| **CloudWatch Logs** | Application and job logs, container stdout/stderr | "Why did training fail? What was the loss?" |
| **CloudWatch Metrics** | CPU, GPU, memory, invocation count, latency | "Was the endpoint healthy? Were there spikes?" |
| **CloudTrail** | **Every AWS API call** | "Who deleted this? When?" |

```text
Training loss curve, container stdout   → CloudWatch Logs
Endpoint latency, error rate            → CloudWatch Metrics
"User alice called DeleteEndpoint at 3:14 UTC" → CloudTrail
```

### Where Logs and Metrics Go

| Signal | Destination | Typical items |
|---|---|---|
| Training container stdout/stderr | CloudWatch Logs (`/aws/sagemaker/TrainingJobs`) | Stack traces, epoch progress |
| Training loss and accuracy | CloudWatch Metrics (extracted from logs with a regular expression) | Custom metrics such as `train:loss`, `validation:accuracy` |
| Endpoint container logs | CloudWatch Logs (`/aws/sagemaker/Endpoints/...`) | Inference exceptions, model loading failures |
| Endpoint invocations and latency | CloudWatch Metrics | `Invocations`, `ModelLatency`, `OverheadLatency`, `Invocation4XXErrors` |
| Instance resources | CloudWatch Metrics | `CPUUtilization`, `MemoryUtilization`, `GPUUtilization` |
| Management API calls | CloudTrail | `CreateTrainingJob`, `DeleteEndpoint`, `UpdateEndpoint` |
| Raw inference inputs and outputs | S3 (Data Capture) | Input for Model Monitor baselines and drift analysis |

- CloudTrail lets you view recent events directly in the console, but **long-term retention and auditing require a Trail that exports to S3**.
- CloudTrail logs accumulated in S3 are protected from tampering by bucket policies and Object Lock, and are queried with Athena and similar tools to serve as audit evidence.
- Old audit logs are moved to low-cost storage classes with S3 lifecycle rules to reduce retention cost.

"Debugging performance" = CloudWatch. "Proving compliance" = CloudTrail. CloudTrail records the who, what, when, and where of every API, and is the foundation for regulatory response.

> ⚠️ **Pitfall**: CloudTrail records management (control plane) APIs. Don't try to count high-frequency data plane calls like `InvokeEndpoint`, which arrive thousands of times per second, as audit logs. Invocation volume and latency are viewed with **CloudWatch metrics**.

## Disaster Recovery: Data → Model → Endpoint

Three assets need a recovery plan.

| Asset | If lost | Recovery strategy | Key tools |
|---|---|---|---|
| **Data** | Retraining itself becomes impossible | S3 cross-Region replication, versioning, immutable lock | S3 CRR / Versioning / Object Lock |
| **Model artifacts** | Retraining takes time and cost | S3 versions + copy to another Region, track approved versions | S3 / SageMaker Model Registry |
| **Endpoint** | Service outage | Re-create from code, multi-AZ, redeploy to another Region or account | CloudFormation, CDK, Pipelines |

### Data
- Replicate training data with S3 cross-Region replication (CRR). **For replication, versioning must be enabled on both the source and destination buckets.**
- Versioning and Object Lock prevent accidental deletion and ransomware-style overwrites.

### Model
- Make artifacts redundant with S3 versioning plus cross-Region copy.
- Use Model Registry to track **which version must be restored** (including approval status).

### Endpoint
- Re-create it as is in another Region or account with IaC (CloudFormation, SageMaker Pipelines).
- Survive a single-AZ failure with multi-AZ (`instance_count` ≥ 2).

| Strategy | RTO/RPO | Cost | Always-running resources |
|------|------|------|------|
| Backup & Restore | Slow (hours) | Low | None (only backups kept) |
| Pilot Light | Medium (tens of minutes) | Medium | Data replication + minimal core setup |
| Warm Standby | Fast (minutes) | High | Always running at reduced scale |
| Multi-Region Active | Immediate (seconds) | Highest | Both sides running at full scale |

- **RTO** is "the time it takes to recover," and **RPO** is "the time range of data you can afford to lose." You must decide both first to determine the strategy.
- **Key point**: An endpoint must be re-creatable from code plus the Model Registry. A hand-built endpoint is not a recovery target but a cause of the incident.

### Availability and Automation

| Measure | Failure it prevents | Notes |
|---|---|---|
| Endpoint Auto Scaling | Latency and errors from traffic surges | A target-tracking policy maintains invocations per instance |
| Multi-AZ (`instance_count` ≥ 2) | Single-AZ failure | With two or more instances, they are automatically spread across AZs |
| EventBridge + Lambda | Delayed manual response after detecting a failure | Responds automatically to training job failures and endpoint state changes |
| CloudWatch alarms | Silent performance degradation | Notifies and takes automatic action when latency or error-rate thresholds are exceeded |
| Deployment guardrails (canary/linear) | Full rollout of a bad model | Automatic rollback when an alarm fires |
| S3 CRR + Model Registry | Whole-Region failure | Immediate restoration in another Region |

## Question Stem Clue → Answer Mapping

| Clue in the stem | Answer to pick | Reason |
|---|---|---|
| "Invoked only briefly during the day, zero traffic the rest of the time" | Serverless Inference | No idle cost, billed only on request |
| "Train on Spot without losing progress" | Set `checkpoint_s3_uri` | Resume from the checkpoint after an interruption |
| "Cut training cost by up to 90%" | Managed Spot Training | Best for batch jobs that can tolerate interruption |
| "Large payload and long processing time, no immediate answer needed" | Asynchronous Inference | Queue-based, scales down to 0 when idle |
| "Score the entire dataset every night" | Batch Transform | No endpoint, so always-on cost is 0 |
| "Thousands of models, each invoked rarely" | Multi-Model Endpoint | Share one endpoint to cut cost |
| "Prove who deleted the endpoint and when" | CloudTrail | Records the actor and time of every API call |
| "Want to see the stack trace of why training failed" | CloudWatch Logs | Container stdout/stderr accumulates there |
| "Monitor whether endpoint latency spikes" | CloudWatch Metrics + alarm | Based on metrics such as `ModelLatency` |
| "Retain audit logs for years without tampering" | CloudTrail → S3 (versioning, Object Lock) | Secures long-term retention and immutability |
| "Inference must continue even through a single-AZ failure" | `instance_count` ≥ 2 | Automatically spread across multiple AZs |
| "Immediately restore data and models even through a Region failure" | S3 CRR + versioning + Model Registry | Asset replication + tracking the version to restore |
| "Recovery may take several hours, minimize cost" | Backup & Restore | No always-running resources, so cheapest |
| "Fail over within seconds on a failure" | Multi-Region Active | Both sides running, highest cost |

In the next note we wrap up Week 11 by tying monitoring, operations, and governance together.

## 📖 Glossary

- **Managed Spot Training**: A training mode that uses spare capacity cheaply. It can be interrupted, so checkpoints are practically mandatory.
- **Checkpoint**: A snapshot of the state saved to S3 during training. Even after an interruption, training continues from here.
- **max_run / max_wait**: Respectively "the maximum time allowed for training" and "the total allowed time including waiting for capacity."
- **Cold start**: The phenomenon where, after a long period without calls, preparation time is added when it is called again and the first response is slow.
- **Multi-Model Endpoint**: A mode where one endpoint loads multiple models from S3 when needed. The more models, the greater the advantage.
- **Batch Transform**: A batch inference job that scores an entire dataset at once without an endpoint.
- **CloudTrail Trail**: A setting that persistently stores API call records in S3. It becomes the basis for long-term auditing.
- **RTO / RPO**: The time allowed until recovery / the time range of data you can afford to lose. The two criteria for choosing a DR strategy.
- **S3 cross-Region replication (CRR)**: A feature that automatically replicates objects to a bucket in another Region. Both buckets require versioning.
- **Model Registry**: A catalog that manages model versions and approval status. During a failure, it tells you "what to roll back."

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
