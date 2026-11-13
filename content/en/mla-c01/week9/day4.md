# Day 4 - ML Cost Optimization: From Spot Training to Cost Monitoring

## 📌 Key Takeaways

- Training can save up to 90% with **Managed Spot + checkpoints**. `MaxWaitTimeInSeconds ≥ MaxRuntimeInSeconds` is the matching pair.
- Pick instances to fit the workload: **tree and linear = CPU, deep learning training = GPU, deep learning inference unit cost = Inferentia**.
- The essence of inference cost is **idle-period cost**. When traffic drops to zero, use serverless, asynchronous, or batch to bring that period close to zero.
- The culprit behind cost spikes is usually **resources left on**: idle notebooks, forgotten endpoints, training that never ends. Let the system block this with automatic shutdown.
- Separating costs by team/project is **cost allocation tags + Cost Explorer**, and limit management is **Budgets**.

## The Three Axes Where Cost Leaks

If everything so far was about being safe (security), today is about being cheap. ML workloads see costs balloon quickly because of GPU instances, large-scale training, and always-on endpoints. The levers fall into three axes.

| Axis | Main levers | One-line gist |
|----|---------|------------|
| **Training** | Managed Spot + checkpoints · right-sizing · early stopping for tuning · `MaxRuntimeInSeconds` | These are batch jobs you use briefly and discard, so discounts and caps work well |
| **Inference** | Serverless · asynchronous · batch transform · MME · Inferentia · Auto Scaling | The key is eliminating always-on cost during idle time |
| **Operations** | Idle auto-shutdown for notebooks · clean up unused endpoints · Savings Plans · tags/Budgets/Cost Explorer | Catch resources left on and make usage visible |

## Managed Spot Training: Cut Training Cost by Up to 90%

Training is usually a job that runs once and ends (and can be resumed if interrupted), so it pairs well with Spot Instances. **Managed Spot Training** has SageMaker manage the Spot capacity and cuts cost by up to 90%.

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
    max_run=86400,                                     # Max time for the training itself (seconds)
    max_wait=90000,                                    # Max time including Spot waiting (seconds)
    checkpoint_s3_uri="s3://ml-checkpoints/job-123/",  # Checkpoint in case of reclamation
)
```

- `MaxWaitTimeInSeconds` (`max_wait`) must be **greater than or equal to** `MaxRuntimeInSeconds` (`max_run`), because it includes the time spent waiting for Spot capacity.
- **Checkpoints are the key**: Spot can be reclaimed (interrupted) midway. If you save progress to S3 with `CheckpointConfig`, then after a reclamation it resumes from the checkpoint rather than from the beginning. Using Spot without checkpoints means retraining from scratch every time it is reclaimed.
- Saving alone is not enough. The training script must be written to **read that path on restart and pick up from it** for the job to actually resume.

You can verify whether the savings actually materialized in the job description.

```python
import boto3

sm = boto3.client("sagemaker")
d = sm.describe_training_job(TrainingJobName="job-123")
print(d["TrainingTimeInSeconds"])   # Time actually spent training
print(d["BillableTimeInSeconds"])   # Billed time: with Spot, this is much smaller
```

The reason Spot suits training is that "training is a batch job that can be resumed idempotently." Even if reclaimed, continuing from a checkpoint yields the same result. Conversely, a real-time inference endpoint cuts off service when reclaimed, so Spot is inappropriate for it. "Spot for training, not for real-time inference" is the exam's basic principle.

> ⚠️ **Pitfall**: For "training with a tight deadline that must never be delayed," Spot is the wrong answer. Spot may wait for capacity and may be reclaimed, so it **does not guarantee a completion time.** Even in a cost question, if "deadline guarantee" is attached as a condition, On-Demand is the answer.

## Choosing the Right Instance (Right-sizing)

Choosing the wrong instance wastes money. There are two directions of waste: too big (over-provisioning), or the wrong kind for the job.

| Workload | Choose | Reason |
|----------|---------|------|
| Traditional ML training (XGBoost, linear, etc.) | **CPU (m5/c5)** | Tree and linear models gain almost nothing from a GPU. Attaching a p4d is a waste of money |
| Deep learning training | **GPU (g5/p4d)** | The larger the model, the more GPU memory and parallel compute performance matter |
| Reducing deep learning inference unit cost | **Inferentia (inf1/inf2)** | An inference-dedicated accelerator that lowers the unit cost |
| When you don't know which inference instance fits | **Inference Recommender** | Recommends the cost- and latency-optimal instance through load testing |

For training there is no automatic recommendation, so run a trial with a small amount of data, look at the metrics (GPU utilization, throughput), and adjust.

The principle of right-sizing is "the minimum sufficient size that fits the workload's characteristics." A GPU pays off only in parallel matrix operations (deep learning) and is nearly useless for tree models. In cost scenarios, "GPU for XGBoost" tends to be a wrong answer, and "Inferentia for deep learning inference" is a candidate for the right answer.

## Hyperparameter Tuning Cost: It Grows by Multiplication

Tuning runs training jobs many times, so the cost grows as **number of jobs × cost per job**. The money that leaks here is surprisingly large.

```python
from sagemaker.tuner import HyperparameterTuner

tuner = HyperparameterTuner(
    estimator=estimator,
    objective_metric_name="validation:auc",
    hyperparameter_ranges=ranges,
    max_jobs=20,                 # Total training jobs = cost ceiling
    max_parallel_jobs=2,         # Concurrent runs (too many reduces search efficiency)
    early_stopping_type="Auto",  # Stop hopeless jobs early
)
```

- `max_jobs` is effectively the tuning **budget ceiling**. Narrowing the ranges and reducing the number of jobs is the surest saving.
- Turning on `early_stopping_type` cuts jobs whose objective metric is hopeless midway to prevent waste.
- You can also apply Spot to each individual training job in tuning (if you set it on the Estimator, tuning follows that setting).
- Detecting by rule that training is diverging or heading toward overfitting and **automatically stopping the job** is also a mechanism to cut waste (Debugger rules).

## Eliminating Idle Cost with Inference Options

The big picture of inference cost is "eliminating the always-on cost of periods with zero traffic" (connected to the Week 6 review).

| Option | What is billed | When traffic is 0 | Suitable situation |
|------|-----------|-----------------|--------------|
| **Real-time endpoint** | Time the instances are up | At least 1 instance's cost keeps accruing | Steady traffic, low latency essential |
| **Serverless inference** | Invocation processing time and memory | 0 | Intermittent, hard-to-predict traffic. Accept cold starts |
| **Asynchronous inference** | Instance time | Can scale down to 0 when the queue is empty | Large payloads, long processing, no immediate response needed |
| **Batch transform** | Only while the job runs | 0 (instances terminate when the job ends) | Bulk scoring. Cheapest |
| **MME (multi-model endpoint)** | Shared instance time | Instance cost still accrues | Very many models, each invoked rarely |

```text
Cost optimization decision
Is there an idle period?
 ├─ Yes → Can it be batch processed? → Yes: batch transform / No: serverless (small payload) or asynchronous (large payload)
 └─ No (constant traffic) → real-time + autoscaling + MME (many models) + Inferentia (deep learning)
```

Cost-perspective decision: **if there is a period when traffic drops to zero**, use serverless, asynchronous, or batch to bring that period's cost close to zero. **If traffic is always full**, lower the unit cost with real-time + Auto Scaling + (for many models) MME + (for deep learning) Inferentia.

> ⚠️ **Pitfall**: The habit of creating one endpoint per model quietly eats away at cost. If you have dozens or hundreds of models each invoked infrequently, the answer is not shrinking instances but **consolidating them with MME**. Conversely, if all models always have high traffic, MME actually makes them compete for resources.

## Automatic Shutdown: Catching Resources Left Running

The hidden culprit of cost is resources that were "used and not turned off."

- **Studio/notebook auto-shutdown**: Idle notebooks shut down automatically after a set time through Lifecycle Configurations (LCC) or Studio's idle shutdown setting. This prevents the cost of data scientists leaving them on when they go home.
- **Training job `MaxRuntimeInSeconds`**: Cuts off a job that would run indefinitely, by time. Prevents the accident of a training job stuck by a bug burning a GPU for days.
- **Endpoint cleanup**: An unused real-time endpoint keeps incurring always-on cost, so delete it or switch it to serverless.
- **Auto Scaling + scale-in**: When traffic drops, reduce instances (down to the minimum capacity) to lower cost.
- **S3 lifecycle**: Move old datasets, old-version artifacts, and logs to an infrequent-access/archive tier or expire them. Storage costs keep accumulating even after training ends.

ML cost incidents usually come from "resources that weren't turned off": idle notebooks, forgotten endpoints, infinite-loop training. Automatic shutdown (idle timers, MaxRuntime, autoscaling scale-in) is a mechanism to block human error with the system. On the exam, the answer to "unexpected cost spike" is usually related to this automatic shutdown/cleanup.

## Cost Monitoring and Governance

You must make cost visible to control it.

| Tool | What it's for | When to pick it |
|------|-------------|-------------|
| **Cost allocation tags** | Attribute costs by `Project`, `Team`, `Environment` | When you want to see "who spent how much" separately |
| **Cost Explorer** | Cost trend and composition analysis, aggregation by tag | Figure out which services/instances eat the money |
| **AWS Budgets** | Set budget limits, alerts based on thresholds and forecasts | When you want to set a limit and get alerted when it's exceeded |
| **Cost Anomaly Detection** | Automatically detect cost spikes unlike the usual | When you want to catch anomalies early, before the budget |
| **CloudWatch** | Utilization metrics such as `Invocations` and `ModelLatency` | When proving idle or over-provisioning with evidence |
| **Savings Plans / Reserved Instances** | Lower rates than On-Demand through commitment | When usage is predictable, such as always-on endpoints and regular training |

```text
[Cost governance cycle]
Apply tags ──▶ Confirm attribution with Cost Explorer ──▶ Limits/alerts with Budgets ──▶ Act on the cause of overruns
    ▲                                                                        │
    └──────────── Enforce tags on newly created resources too (policy/automation) ◀───────────┘

Tag example (cost allocation)
TrainingJob tags: { "Project": "fraud-ml", "Team": "risk", "Environment": "prod" }
→ In Cost Explorer, filter by Project to aggregate only fraud-ml costs
```

There are situations where you applied tags but they don't show up in Cost Explorer. Tags aren't done just by attaching them: you must **activate them as "cost allocation tags" in the Billing console** for them to appear in cost reports, and they are aggregated from usage after activation. Remember also that past costs are not retroactively covered.

Cost governance is a cycle of "measure → attribute → budget → alert." You must attribute (allocate) costs to teams and projects with tags to see who spends how much, and set limits with Budgets and get alerted when exceeded. The answer to a "split costs by team" scenario is almost always cost allocation tags.

## When Cost Leaks: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| This month's cost suddenly spikes | Notebooks left on, forgotten endpoints | Set idle auto-shutdown, delete unused endpoints, Cost Anomaly Detection alerts |
| The endpoint is up but is barely invoked | A real-time endpoint used for intermittent traffic | Switch to serverless/asynchronous/batch, lower the Auto Scaling minimum capacity |
| Spot training restarts from scratch every time | `CheckpointConfig` not specified, or the script doesn't read the checkpoint | Specify the checkpoint path + implement resume logic |
| A Spot job ends without even starting | `MaxWaitTimeInSeconds` is smaller than `MaxRuntimeInSeconds` | Raise the ceiling including waiting to at least the training ceiling |
| Training hasn't finished for days | Runaway from failure to converge or a bug | Cap with `MaxRuntimeInSeconds`, rule-based automatic stop |
| Switched to GPU but cost just went up | Tree-family model gains nothing from a GPU | Return to CPU (m5/c5) |
| Tuning cost is several times what was expected | Too many jobs/concurrent runs | Reduce `max_jobs`, narrow the search range, enable early stopping |
| Can't tell who spends how much per team | No tags, or cost allocation tags not activated | Apply tags + activate in Billing, then aggregate in Cost Explorer |
| An always-running workload still pays On-Demand rates | Commitment discounts not applied | If usage is stable, consider Savings Plans |

Tomorrow we tie all of Week 9 (security, governance, cost) into a single decision flow.

## 📖 Glossary

- **Managed Spot Training**: A training method in which SageMaker manages Spot capacity for you. Up to 90% cheaper, but can be reclaimed midway.
- **Checkpoint (CheckpointConfig)**: Intermediate training state saved to S3. It lets you resume from that point after a Spot reclamation rather than from the start.
- **MaxRuntimeInSeconds / MaxWaitTimeInSeconds**: The max time for the training itself / the max time including Spot waiting. The latter must be greater than or equal to the former.
- **Right-sizing**: Choosing the minimum sufficient instance size that fits the workload. Over-provisioning and choosing the wrong type are the two major wastes.
- **Inferentia (inf1/inf2)**: An AWS accelerator dedicated to inference. Used to lower the unit cost of deep learning inference.
- **Inference Recommender**: A feature that runs load tests and recommends an inference instance by cost and latency criteria.
- **Idle cost**: Cost incurred because instances are up even with no traffic. Serverless, asynchronous, and batch bring this close to zero.
- **MME (multi-model endpoint)**: A way of loading several models onto one endpoint instance and sharing it. Advantageous when there are many models and invocations are rare.
- **Cost allocation tag**: A tag attached to resources to attribute costs to teams and projects. Must be activated in Billing to be aggregated in reports.
- **Savings Plans**: A way of committing to a certain amount of usage and receiving lower rates than On-Demand. Used when usage is stable.

---

## 📝 Practice Questions

**Question 1.** You want to cut the cost of a deep learning training job that takes several days as much as possible. The job can be resumed after interruption. What is the most appropriate configuration?

A) Run only on On-Demand GPU with no checkpoints  
B) Turn on Managed Spot Training and save checkpoints to S3 with `CheckpointConfig`  
C) Train with a real-time endpoint  
D) Train deep learning on a CPU instance  

**Answer: B**  
Explanation: Resumable training pairs well with Spot and can save up to 90%, and the key is saving checkpoints to S3 so you don't start over when Spot is reclaimed. A has no means of savings, C is wrong because endpoints are not for training, and D runs deep learning on a CPU, making training inefficiently slow.

---

**Question 2.** The inference endpoint of an internal ML tool is invoked only occasionally during business hours, and traffic is 0 at night and on weekends. What is the most appropriate way to reduce cost?

A) A real-time endpoint that always keeps 8 instances  
B) Switch to serverless inference that scales to 0  
C) Buy Reserved Instances on a 1-year commitment  
D) Replace with a GPU instance  

**Answer: B**  
Explanation: For an intermittent workload whose traffic drops to 0, idle-period cost is the biggest waste, so it is appropriate to eliminate that period's cost with serverless inference that scales to 0. A keeps paying for 8 instances even when idle, C is a commitment suited to always-on workloads and is a loss for an intermittent pattern, and D actually increases cost.

---

**Question 3.** ML costs exceed expectations by a large margin every month, and an investigation shows that data scientists leave notebook instances and some real-time endpoints running after use. What is the most effective action to prevent recurrence?

A) Stop all training  
B) Set up idle auto-shutdown for notebooks, clean up unused endpoints, and apply `MaxRuntimeInSeconds` to training jobs  
C) Change the instance type to a larger one  
D) Delete the S3 bucket  

**Answer: B**  
Explanation: Neglected always-on resources are the cause of the cost spike, so it is effective to let the system block human error with automatic shutdown mechanisms such as idle notebook auto-shutdown, cleanup of unused endpoints, and a maximum runtime limit for training. A is an overreaction that halts work, C increases cost, and D loses data and is unrelated to the cause.

---

**Question 4.** Several teams use SageMaker in a shared AWS account, and you want to see separately how much ML cost each team and project spends. What is the most appropriate method?

A) Use a separate Region for each team  
B) Attach `Team` and `Project` cost allocation tags to training jobs and endpoints and aggregate by tag in Cost Explorer  
C) Unify all resources under a single name  
D) Look only at CloudWatch logs  

**Answer: B**  
Explanation: To attribute costs by team and project, the standard approach is to attach cost allocation tags to resources and filter and aggregate by tag in Cost Explorer. A is wrong because separating Regions is not the right means for cost attribution, C actually erases the distinctions, and D is just logs and not a cost aggregation tool.

---

**Question 5.** Which of the following is an incorrect pairing of instance choice and cost efficiency?

A) XGBoost training → CPU (m5/c5) instance  
B) Large-scale deep learning training → GPU (g5/p4d) instance  
C) Reducing deep learning inference cost → AWS Inferentia (inf1/inf2)  
D) Reducing XGBoost inference cost → switch to a high-performance GPU (p4d)  

**Answer: D**  
Explanation: XGBoost, a tree-based model, gains almost nothing from GPU parallelization, so switching to a high-performance GPU only raises cost with no effect, and CPU is appropriate. A, B, and C are each correct cost-efficiency pairings: traditional ML = CPU, deep learning training = GPU, deep learning inference acceleration = Inferentia.

---
