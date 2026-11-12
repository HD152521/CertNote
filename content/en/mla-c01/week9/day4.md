# Day 4 - ML Cost Optimization: Spot Training to Cost Monitoring

## 📌 Key Takeaways

- Training can save up to 90% with **Managed Spot + checkpoints**. `MaxWaitTimeInSeconds ≥ MaxRuntimeInSeconds` is the pair to remember.
- Match the instance to the workload — **trees and linear models = CPU, deep learning training = GPU, deep learning inference unit cost = Inferentia**.
- The essence of inference cost is **idle-period cost**. When traffic drops to zero, use serverless, asynchronous, or batch to bring that period close to zero.
- The culprit behind cost spikes is usually **resources that were never turned off** — idle notebooks, forgotten endpoints, training that never ends. Let the system prevent this with automatic shutdown.
- Splitting cost by team or project is answered by **cost allocation tags + Cost Explorer**, and limit management by **Budgets**.

## Three Axes Where Cost Leaks

If everything so far was about being safe (security), today is about being cheap. ML workloads see costs balloon quickly because of GPU instances, large-scale training, and always-on endpoints. The levers fall into three axes.

| Axis | Main levers | One-line gist |
|------|-------------|---------------|
| **Training** | Managed Spot + checkpoints · right-sizing · early stopping for tuning · `MaxRuntimeInSeconds` | These are batch jobs you use briefly and discard, so discounts and caps work well |
| **Inference** | Serverless · asynchronous · batch transform · MME · Inferentia · Auto Scaling | The key is eliminating the always-on cost of idle time |
| **Operations** | Auto-shutdown of idle notebooks · cleaning up unused endpoints · Savings Plans · tags/Budgets/Cost Explorer | Catch resources that were left on, and make what you spent visible |

## Managed Spot Training — Cut Training Cost by Up to 90%

Training is usually a job that runs once and ends (and can be resumed even if interrupted), so it pairs well with Spot instances. **Managed Spot Training** has SageMaker manage the Spot capacity and cuts cost by up to 90%.

```json
{
  "EnableManagedSpotTraining": true,
  "StoppingCondition": {
    "MaxRuntimeInSeconds": 86400,
    "MaxWaitTimeInSeconds": 90000
  },
  "CheckpointConfig": {
    "S3Uri": "s3://ml-checkpoints/job-123/"
  }
}
```

In the Python SDK, you give the same settings as Estimator parameters.

```python
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=container,
    role=role,
    instance_count=1,
    instance_type="ml.g5.xlarge",
    use_spot_instances=True,                           # Turn on Spot training
    max_run=86400,                                     # Maximum time for the training itself (seconds)
    max_wait=90000,                                    # Maximum time including Spot waiting (seconds)
    checkpoint_s3_uri="s3://ml-checkpoints/job-123/",  # Checkpoints in case of reclamation
)
```

- `MaxWaitTimeInSeconds` (`max_wait`) must be **greater than or equal to** `MaxRuntimeInSeconds` (`max_run`) — because it includes the time spent waiting for Spot capacity.
- **Checkpoints are the key**: Spot can be reclaimed (interrupted) at any moment. If you save progress to S3 with `CheckpointConfig`, then after a reclamation the job resumes from the checkpoint instead of from the beginning. Using Spot without checkpoints means retraining from scratch on every reclamation.
- Saving alone is not enough. The training script must be written to **read that path on restart and pick up where it left off** for resumption to actually happen.

Check whether the savings actually materialized in the job description.

```python
import boto3

sm = boto3.client("sagemaker")
d = sm.describe_training_job(TrainingJobName="job-123")
print(d["TrainingTimeInSeconds"])   # Time actually spent training
print(d["BillableTimeInSeconds"])   # Billed time — with Spot, this one is much smaller
```

Spot suits training because "training is a batch job that can be resumed idempotently." Even if reclaimed, continuing from the checkpoint gives the same result. Conversely, a real-time inference endpoint loses service when reclaimed, so Spot is inappropriate — "Spot for training, not for real-time inference" is the basic exam principle.

> ⚠️ **Trap**: For "training with a tight deadline that must never be delayed," Spot is the wrong answer. Spot may wait for capacity and may be reclaimed, so it **does not guarantee a completion time.** Even in a cost question, if a "guaranteed deadline" is attached to the conditions, On-Demand is the answer.

## Choosing the Right Instance (Right-sizing)

Choosing the wrong instance wastes money. There are two directions of waste — too big (over-provisioning), or the wrong kind for the task.

| Workload | What to choose | Why |
|----------|----------------|-----|
| Traditional ML training (XGBoost, linear, etc.) | **CPU (m5/c5)** | Tree and linear models gain almost nothing from a GPU. Attaching a p4d is a waste of money |
| Deep learning training | **GPU (g5/p4d)** | The larger the model, the more GPU memory and parallel compute performance matter |
| Lowering deep learning inference unit cost | **Inferentia (inf1/inf2)** | An inference-only accelerator that lowers the unit cost |
| When you do not know which inference instance fits | **Inference Recommender** | Recommends the cost- and latency-optimal instance through load testing |

There is no automatic recommendation for training, so run a trial with a small amount of data, look at metrics (GPU utilization, throughput), and adjust.

The principle of right-sizing is "the minimum sufficient size for the workload's characteristics." A GPU earns its keep only in parallel matrix computation (deep learning) and is nearly useless for tree models. In cost scenarios, "GPU for XGBoost" tends to be a wrong answer, and "Inferentia for deep learning inference" becomes a candidate for the right answer.

## Hyperparameter Tuning Cost — It Grows by Multiplication

Tuning means running training jobs many times, so cost grows as **number of jobs × cost per job**. The money that leaks here is surprisingly large.

```python
from sagemaker.tuner import HyperparameterTuner

tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name="validation:auc",
    hyperparameter_ranges=ranges,
    max_jobs=20,                 # Total number of training jobs = cost ceiling
    max_parallel_jobs=2,         # Number running concurrently (too large reduces search efficiency)
    early_stopping_type="Auto",  # Stop jobs that have no prospects early
)
```

- `max_jobs` is effectively the tuning **budget ceiling**. Narrowing the ranges and reducing the number of jobs is the surest saving.
- Turning on `early_stopping_type` cuts jobs whose objective metric has no prospects partway through, preventing waste.
- Spot can also be applied to the individual training jobs inside tuning (if you set it on the Estimator, the tuning follows that setting).
- Detecting training that diverges or heads toward overfitting by rule and **stopping the job automatically** is another device for cutting waste (Debugger rules).

## Eliminating Idle Cost with Inference Options

The big picture of inference cost is "eliminating the always-on cost during periods when traffic is zero" (it connects to the Week 6 review).

| Option | What is billed | When traffic is 0 | Suitable situation |
|--------|----------------|-------------------|--------------------|
| **Real-time endpoint** | Instance hours while running | Cost of at least one instance keeps accruing | Steady traffic, low latency is mandatory |
| **Serverless inference** | Invocation processing time and memory | 0 | Intermittent, hard-to-predict traffic. Accept cold starts |
| **Asynchronous inference** | Instance hours | Can scale down to 0 when the queue is empty | Large payloads, long processing, no immediate answer needed |
| **Batch transform** | Only while the job runs | 0 (instances terminate when the job ends) | Bulk scoring. The cheapest |
| **MME (multi-model endpoint)** | Shared instance hours | Instance cost still accrues | When there are very many models and each is invoked rarely |

```text
Cost optimization decision
Are there idle periods?
 ├─ Yes → Can it be processed in bulk? → Yes: batch transform / No: serverless (small payloads) or asynchronous (large payloads)
 └─ No (constant traffic) → real-time + autoscaling + MME (many models) + Inferentia (deep learning)
```

Decision-making from the cost viewpoint: **if there are periods when traffic drops to zero**, use serverless, asynchronous, or batch to bring the cost of those periods close to zero. **If traffic is always present**, lower the unit cost with real-time + Auto Scaling + (for many models) MME + (for deep learning) Inferentia.

> ⚠️ **Trap**: The habit of creating one endpoint per model quietly eats away at cost. When there are dozens or hundreds of models and each is invoked infrequently, the answer is not shrinking instances but **consolidating with MME**. Conversely, if every model has constant high traffic, MME actually makes them compete for resources.

## Auto-Shutdown — Catching Resources Left On

The hidden culprit of cost is resources that were "used and never turned off."

- **Studio/notebook auto-shutdown**: Idle notebooks are shut down automatically after a set time through lifecycle configurations (LCC) or Studio's idle-shutdown setting. This prevents the cost of data scientists leaving things on when they go home.
- **Training job `MaxRuntimeInSeconds`**: Cuts off endlessly running jobs by time. Prevents the accident where a training job stuck on a bug burns GPUs for days.
- **Endpoint cleanup**: An unused real-time endpoint keeps incurring always-on cost, so delete it or switch it to serverless.
- **Auto Scaling + scale-in**: When traffic drops, reduce instances (down to the minimum capacity) to lower cost.
- **S3 lifecycle**: Move old datasets, old artifact versions, and logs to infrequent-access/archive tiers or expire them. Storage cost keeps accumulating even after training ends.

ML cost incidents usually come from "resources that were not turned off" — idle notebooks, forgotten endpoints, infinite-loop training. Auto-shutdown (idle timers, MaxRuntime, autoscaling scale-in) is a device that prevents human error with a system. On the exam, the answer to "unexpected cost spike" is usually related to this auto-shutdown/cleanup.

## Cost Monitoring and Governance

You can only control cost once you make it visible.

| Tool | What it is used for | When to choose it |
|------|---------------------|-------------------|
| **Cost allocation tags** | Attribute cost with `Project`, `Team`, `Environment` | When you want to see "who spent how much" separately |
| **Cost Explorer** | Cost trend and composition analysis, aggregation by tag | To find which services and instances eat the money |
| **AWS Budgets** | Set budget limits, alerts based on thresholds and forecasts | When you want to set a limit and be alerted when it is exceeded |
| **Cost Anomaly Detection** | Automatically detects cost spikes that differ from normal | When you want to catch warning signs early, before the budget |
| **CloudWatch** | Utilization metrics such as `Invocations` and `ModelLatency` | When proving idle or over-provisioned resources with evidence |
| **Savings Plans / Reserved Instances** | A commitment for lower rates than On-Demand | When usage is predictable, such as always-on endpoints and regular training |

```text
[Cost Governance Cycle]
Apply tags ──▶ Confirm attribution in Cost Explorer ──▶ Limits and alerts with Budgets ──▶ Act on the cause of overruns
    ▲                                                                        │
    └──────────── Enforce tags on newly created resources too (policy/automation) ◀───────────┘

Tag example (cost allocation)
TrainingJob tags: { "Project": "fraud-ml", "Team": "risk", "Environment": "prod" }
→ In Cost Explorer, filter by Project to aggregate only the fraud-ml cost
```

There is a situation where you applied tags but they do not show up in Cost Explorer. Tagging is not enough on its own — you must **activate them as "cost allocation tags" in the Billing console** for them to appear in cost reports, and they are aggregated only from usage after activation. Remember also that past costs are not retroactively covered.

Cost governance is a cycle of "measure → attribute → budget → alert." Only when tags attribute (allocate) cost to teams and projects can you see who spends how much, and Budgets sets a limit and notifies when it is exceeded. The answer to the scenario "I want to see cost split by team" is almost always cost allocation tags.

## When Cost Leaks: Symptom → Cause → Fix

| Symptom | Common cause | Fix |
|---------|--------------|-----|
| This month's cost suddenly spikes | A notebook left on, a forgotten endpoint | Set idle auto-shutdown, delete unused endpoints, Cost Anomaly Detection alerts |
| The endpoint is up but is barely invoked | A real-time endpoint is used for intermittent traffic | Switch to serverless, asynchronous, or batch; lower the Auto Scaling minimum capacity |
| Spot training restarts from scratch every time | `CheckpointConfig` is not specified, or the script does not read the checkpoint | Specify a checkpoint path + implement resume logic |
| A Spot job ends without even starting | `MaxWaitTimeInSeconds` is smaller than `MaxRuntimeInSeconds` | Raise the cap including waiting to at least the training cap |
| Training has not finished for days | Failure to converge or a runaway due to a bug | Cap with `MaxRuntimeInSeconds`, rule-based automatic stop |
| Switched to GPU and only the cost went up | It is a tree-based model, so a GPU brings no benefit | Go back to CPU (m5/c5) |
| Tuning cost is several times the expectation | Too many jobs and too many concurrent runs | Reduce `max_jobs`, narrow the search range, enable early stopping |
| Cannot tell who spends how much per team | No tags, or cost allocation tags not activated | Apply tags + activate in Billing, then aggregate in Cost Explorer |
| A workload that always runs is still billed at On-Demand rates | No commitment discount applied | If usage is stable, consider Savings Plans |

Tomorrow we bring all of Week 9 (security, governance, cost) together into a single decision flow.

## 📖 Glossary

- **Managed Spot Training** : A training mode where SageMaker manages Spot capacity for you. Up to 90% cheaper, but it can be reclaimed midway.
- **Checkpoint (CheckpointConfig)** : The intermediate training state saved to S3. It lets you resume from that point after a Spot reclamation instead of from the start.
- **MaxRuntimeInSeconds / MaxWaitTimeInSeconds** : The maximum time for the training itself / the maximum time including Spot waiting. The latter must be greater than or equal to the former.
- **Right-sizing** : Choosing the minimum sufficient instance size for the workload. Over-provisioning and picking the wrong type are the two main wastes.
- **Inferentia (inf1/inf2)** : An AWS accelerator dedicated to inference. Used to lower the unit cost of deep learning inference.
- **Inference Recommender** : A feature that runs load tests and recommends an inference instance by cost and latency criteria.
- **Idle cost** : Cost incurred because instances are running even though there is no traffic. Serverless, asynchronous, and batch bring this close to zero.
- **MME (multi-model endpoint)** : A way of loading multiple models onto one endpoint instance and sharing it. Advantageous when there are many models and invocations are rare.
- **Cost allocation tags** : Tags attached to resources to attribute cost to teams and projects. They must be activated in Billing to be aggregated in reports.
- **Savings Plans** : A way of committing to a certain level of usage and receiving lower rates than On-Demand. Used when usage is stable.

---

## 📝 Practice Questions

**Question 1.** You want to cut the cost of a deep learning training job that takes several days as much as possible. The job can be interrupted and resumed. Which configuration is the most appropriate?

A) Run only on On-Demand GPU with no checkpoints  
B) Turn on Managed Spot Training and save checkpoints to S3 with `CheckpointConfig`  
C) Train with a real-time endpoint  
D) Train deep learning on CPU instances  

**Answer: B**  
Explanation: Resumable training fits well with Spot and can save up to 90%, and the key is saving checkpoints to S3 so that training does not restart from scratch when Spot capacity is reclaimed. A has no means of saving cost, C is wrong because endpoints are not for training, and D runs deep learning on CPU, which makes training inefficiently slow.

---

**Question 2.** An internal ML tool's inference endpoint is called only occasionally during business hours, and traffic is 0 at night and on weekends. What is the most appropriate way to reduce cost?

A) A real-time endpoint that always keeps 8 instances  
B) Switch to serverless inference that scales to 0  
C) Buy Reserved Instances on a 1-year commitment  
D) Replace with GPU instances  

**Answer: B**  
Explanation: For an intermittent workload whose traffic drops to 0, idle periods are the biggest waste, so serverless inference that scales to 0 eliminates the cost of those periods. A keeps paying for 8 instances even when idle, C is a commitment suited to always-on workloads and loses money on an intermittent pattern, and D actually increases cost.

---

**Question 3.** Monthly ML costs greatly exceeded expectations, and the investigation found that data scientists left notebook instances and some real-time endpoints running after use. What is the most effective measure to prevent recurrence?

A) Stop all training  
B) Configure notebook idle auto-shutdown, clean up unused endpoints, and set `MaxRuntimeInSeconds` on training jobs  
C) Change the instance types to larger ones  
D) Delete the S3 buckets  

**Answer: B**  
Explanation: Always-on resources left running are the cause of the cost spike, so using automatic shutdown mechanisms such as idle notebook auto-shutdown, unused endpoint cleanup, and a maximum training runtime limit lets the system prevent human error. A is an overreaction that halts work, C increases cost, and D loses data and is unrelated to the cause.

---

**Question 4.** Multiple teams use SageMaker in a shared AWS account, and you want to see separately how much ML cost each team and project is incurring. What is the most appropriate method?

A) Use a separate Region for each team  
B) Attach `Team` and `Project` cost allocation tags to training jobs and endpoints, and aggregate by tag in Cost Explorer  
C) Unify all resources under a single name  
D) Look only at CloudWatch logs  

**Answer: B**  
Explanation: To attribute cost by team and project, the standard approach is to attach cost allocation tags to resources and filter and aggregate by tag in Cost Explorer. A is wrong because separating Regions is not the right way to attribute cost, C removes the distinction instead, and D is only logs and not a cost aggregation tool.

---

**Question 5.** Which of the following incorrectly pairs an instance choice with cost efficiency?

A) XGBoost training → CPU (m5/c5) instances  
B) Large-scale deep learning training → GPU (g5/p4d) instances  
C) Reducing deep learning inference cost → AWS Inferentia (inf1/inf2)  
D) Reducing XGBoost inference cost → switch to high-performance GPU (p4d)  

**Answer: D**  
Explanation: XGBoost, a tree-based model, gains almost nothing from GPU parallelization, so switching to a high-performance GPU only increases cost without benefit, and CPU is appropriate. A, B, and C are all correct cost-efficiency pairings: traditional ML = CPU, deep learning training = GPU, and deep learning inference acceleration = Inferentia.

---
