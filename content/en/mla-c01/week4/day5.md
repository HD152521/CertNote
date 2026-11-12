# Day 5 - Week 4 Comprehensive Review: Model Development 1 — SageMaker Training Review

## 📌 Key Takeaways

- A **Training Job** launches instances to train, saves `model.tar.gz` to S3, and then shuts down automatically. The blueprint is the **Estimator**, and your own script is the `entry_point`.
- **Algorithm mapping**: tabular = XGBoost, high-dimensional sparse = Linear Learner, anomaly detection = RCF, time series = DeepAR, sparse recommendation = Factorization Machines, text = BlazingText.
- **Input**: for large data read repeatedly with an I/O bottleneck use **FSx for Lustre**; for large streaming formats use **RecordIO-protobuf**; XGBoost CSV has the label in the first column and no header.
- **AMT**: Bayesian is the default, Hyperband for long deep learning jobs, early stopping to cut cost, and warm start to reuse results.
- **Cost**: lowering the unit price (Spot + checkpoints) and reducing the amount of work (transfer learning/JumpStart) are **on different axes, so they can be applied together**.

## The Week on One Page

This week covered the whole training stage, where "data is turned into a model." We tie the four lessons into a single flow so you can skim them quickly right before the exam.

```
[Data (S3/FSx)]
      │ Input channel (File / Pipe / Fast File)
      ▼
[Training Job]  ← Estimator (container, role, instance, hyperparameters)
      │           ├─ Built-in algorithms (XGBoost, Linear Learner, ...)
      │           ├─ Framework Estimator (entry_point=my script)
      │           └─ JumpStart (fine-tune a pretrained model)
      │ Instance: CPU (traditional ML) / GPU (deep learning) / distributed (instance_count↑)
      │ Cost saving: Managed Spot + checkpoints
      ▼
[Model artifact (model.tar.gz, S3)]
      ▲
[AMT tuning] ── automatically runs many Training Jobs (Bayesian / early stopping / warm start)
```

This one diagram holds the whole week. Data enters through the input channel and is trained in a Training Job (defined by an Estimator), the model is stored in S3, and on top of that AMT launches many training runs to find the best hyperparameters.

## Day-by-Day Essentials at a Glance

**Day 1 — Training Job**

- The basic unit of training. It launches instances, trains in a container, saves the model to S3, and then shuts the instances down automatically.
- The **Estimator** is the blueprint. For your own script, use the framework Estimator's `entry_point`.
- Input channels are passed through `fit()`. The input modes are File (download everything), Pipe (streaming), and Fast File.
- For an I/O bottleneck from repeatedly reading large data, use **FSx for Lustre**.
- For instances: traditional ML = CPU, deep learning = GPU, and if one machine is not enough, go distributed (`instance_count`↑).
- **Managed Spot Training** saves up to 90% but can be interrupted → **checkpoints** are required, and `max_wait >= max_run`.

**Day 2 — Built-in Algorithms**

- Use AWS-optimized algorithm containers without writing code.
- Mapping the type is the key — tabular classification/regression = **XGBoost**, large-scale linear/sparse = **Linear Learner**, anomaly detection = **RCF**, time series = **DeepAR**, sparse recommendation = **Factorization Machines**, fast text = **BlazingText**.
- Image algorithms come in three kinds: classification (one label), detection (location + class), and segmentation (pixel level).
- For input format: large streaming = **RecordIO-protobuf**, small data = CSV.
- XGBoost CSV has the **label in the first column and no header**.

**Day 3 — AMT (Hyperparameter Tuning)**

- With an objective metric + ranges + a strategy, it automatically runs many training jobs to find the best combination.
- On strategies: the default is **Bayesian** (reflects earlier results, sequentially dependent), independent parallel = Random, exhaustive = Grid (categorical), and early stopping for long deep learning = **Hyperband**.
- **Early stopping** (`early_stopping_type='Auto'`) stops hopeless training jobs and saves cost.
- **Warm start** reuses earlier tuning results (same data = IDENTICAL_DATA_AND_ALGORITHM, changed data = TRANSFER_LEARNING).

**Day 4 — JumpStart, Transfer Learning, Cost**

- **JumpStart** is a hub of pretrained models. Either `deploy` as is, or `fit → deploy` (fine-tuning).
- **Transfer learning** gives high performance with little data, cost, and time → it is the answer for "an accurate classifier with few labels."
- Cost splits into **lowering the unit price** (Spot, suitable instances, input mode/RecordIO) and **reducing the amount of work** (transfer learning, early stopping).
- Spot and transfer learning are on different axes and can be combined. `max_run` and automatic notebook idle shutdown prevent charges for forgotten resources.

## The Order for Reading a Passage and Narrowing the Answer

Exam passages usually state first "what you want to save" or "what is lacking." Once you catch that clue, the choices sort themselves out quickly.

```text
What is the most emphasized constraint in the passage?
├─ Cost
│   ├─ Interruption is fine as long as it can resume  → Spot + checkpoints
│   ├─ Tuning cost is large                           → early stopping
│   └─ Want to reduce the training amount itself      → transfer learning / JumpStart
├─ Time / speed
│   ├─ Long wait before training starts               → Pipe / Fast File mode
│   ├─ I/O bottleneck every epoch                     → FSx for Lustre
│   └─ One machine is too slow                        → distributed training (instance_count↑)
├─ Data
│   ├─ Few labels                                     → transfer learning (fine-tuning)
│   ├─ High-dimensional sparse                        → Linear Learner
│   └─ Large streaming                                → RecordIO-protobuf
└─ Performance / accuracy
    ├─ Hyperparameters don't fit                      → AMT (Bayesian)
    ├─ One training run takes hours                   → Hyperband
    └─ Continue from a previous tuning                → warm start
```

> 💡 **Related theory**: The big picture running through this week is "compute only as much as needed, as efficiently as possible." Training uses expensive GPU time, so you ① compute less to begin with (transfer learning), ② search smartly (Bayesian + early stopping), ③ use cheap resources (Spot), and ④ shut down automatically when finished (automatic shutdown). The training stage is exactly where ML knowledge from model development and cost-efficiency thinking from the cloud come together.

## Boundaries That Are Often Confused

We organize the choices that are easy to confuse on the exam as boundaries.

| Situation | Correct answer | Confusing wrong answer |
|------|------|----------------|
| I/O bottleneck reading large data repeatedly | FSx for Lustre | S3 File mode |
| Large streaming input format | RecordIO-protobuf | CSV |
| Cost saving + resume after interruption | Spot + checkpoints | Spot only |
| Efficient hyperparameter search | Bayesian | Grid (exhaustive) |
| Early stopping for long deep learning tuning | Hyperband | Random |
| Reuse earlier tuning results | Warm start | New tuning |
| Classifier with little labeled data | Transfer learning | Training from scratch |
| Quickly deploy a verified model | JumpStart | Custom container |
| Train my PyTorch script | Framework Estimator | Built-in container |
| Structured tabular classification | XGBoost | BlazingText |
| Tens of thousands of features, sparse classification | Linear Learner | XGBoost |
| User × item sparse recommendation | Factorization Machines | K-Means |
| Need object locations within an image | Object Detection | Image Classification |
| Long wait before training starts | Pipe / Fast File mode | Instance upgrade |
| Charges for an idle notebook | Idle auto-shutdown lifecycle config | Spot notebook |
| Runaway training that never ends | Set a `max_run` cap | Manual monitoring |

Focus on which clues (data volume/shape, whether interruption is allowed, budget, training time) in the passage point to the keywords on the "correct answer" side of this table, and most questions will be solved.

## This Week's Concepts in One Script

The concepts of the four lessons connect in real code as a single flow. Pointing out which day each line of this snippet comes from makes for a good review.

```python
from sagemaker.pytorch import PyTorch
from sagemaker.tuner import HyperparameterTuner, ContinuousParameter, IntegerParameter
from sagemaker.inputs import TrainingInput

estimator = PyTorch(                       # Day 1: framework Estimator
    entry_point='train.py',                # Day 1: my training script
    role=role,
    instance_type='ml.g5.xlarge',          # Day 1: deep learning, so GPU
    instance_count=1,
    use_spot_instances=True,               # Day 1, 4: lower the unit price
    max_run=3600,
    max_wait=7200,                         # Day 1: max_wait >= max_run
    checkpoint_s3_uri='s3://my-bucket/ckpt/',   # Day 1: prepare for interruption
)

tuner = HyperparameterTuner(               # Day 3: AMT
    estimator=estimator,
    objective_metric_name='validation:auc',
    objective_type='Maximize',
    hyperparameter_ranges={
        'lr': ContinuousParameter(1e-4, 1e-2),
        'batch_size': IntegerParameter(16, 128),
    },
    max_jobs=20,
    max_parallel_jobs=3,                   # Day 3: too high reduces the Bayesian advantage
    strategy='Bayesian',
    early_stopping_type='Auto',            # Day 3, 4: reduce the amount of work
)

tuner.fit({                                # Day 1, 2: input channels and format
    'train': TrainingInput('s3://my-bucket/train/', input_mode='Pipe'),
    'validation': TrainingInput('s3://my-bucket/valid/', input_mode='Pipe'),
})
```

> ⚠️ **Pitfall**: The easy traps are picking Spot just because you see "cost saving" while forgetting checkpoints, and thinking of Grid unconditionally whenever you see "tuning." Spot is paired with checkpoints because it can be interrupted, and the basis of efficient tuning is Bayesian, not the exhaustive Grid. Another frequent mistake is choosing a built-in container for "training my own script" — custom code is the framework Estimator's `entry_point`.

## This Week's Troubleshooting Roundup: Symptom → Cause → Action

We gathered the diagnostic tables from the four lessons in one place. Exam passages are usually a variation of one of the symptoms below.

| Symptom | Cause | Action | Related |
|------|------|------|------|
| Long wait before training starts | File mode downloads all the large data | Pipe / Fast File mode | Day 1 |
| I/O is the bottleneck every epoch | Repeated retransfer from S3 | FSx for Lustre | Day 1 |
| Spot restarts from scratch every time | No checkpoint configured, no resume logic | `checkpoint_s3_uri` + script resume handling | Day 1 |
| Switching to GPU doesn't make it faster | The bottleneck is I/O, not computation | Improve data loading first with input mode/FSx | Day 1 |
| XGBoost predictions are meaningless | CSV header left in, or label in the last column | Remove the header, put the label in the first column | Day 2 |
| Training is a struggle on high-dimensional sparse data | Tree splits are poorly suited to sparse features | Switch to Linear Learner | Day 2 |
| Performance doesn't improve however much tuning is run | The search range misses the optimum | Widen the range + search on a log scale | Day 3 |
| Bayesian is no different from Random | `max_parallel_jobs` is excessive | Lower the parallelism to regain the sequential advantage | Day 3 |
| Performance drops when deployed after tuning | Overfitting to the validation set | Do a final check on a test set not used for tuning | Day 3 |
| Accuracy is poor because there are few labels | Overfitting from too little data | Fine-tune a pretrained model (transfer learning) | Day 4 |
| It got worse after fine-tuning | Shaking all layers with little data | Freeze lower layers + lower the learning rate | Day 4 |
| Charges appear though nobody is using it | Notebook instance left running | Idle auto-shutdown lifecycle config | Day 4 |

## Next Week Preview

If this week was the stage of "building" the model, next week (Model Development 2) continues into the stage of **evaluating and analyzing** the model you built. It covers learning curves and overfitting/underfitting diagnosis, evaluation metrics (accuracy, precision, recall, F1, AUC), and the tools that let you look into and compare the training process with SageMaker Debugger and Experiments. Today's "how do we train a model" becomes the foundation for next week's "was that model trained well?"

## 📖 Glossary

- **Training Job**: The basic unit that runs model training in SageMaker. It launches instances and takes them down by itself when finished.
- **Estimator**: A blueprint object that holds what to train, where, and how. It is the way to define a training job in code.
- **Input mode**: The method that decides how data is brought into the instance. File (download everything) / Pipe (streaming) / Fast File.
- **FSx for Lustre**: An ultra-high-performance parallel file system. When you read large data repeatedly, it is much faster than S3.
- **RecordIO-protobuf**: A format that stores training data densely in binary. It is small and fast to parse, which suits large streaming.
- **Managed Spot Training / checkpoint**: Spot is a way of training on AWS's spare capacity at a low price, up to 90% cheaper, but it can be reclaimed midway. A checkpoint saves the intermediate training state to S3, so that even after an interruption training resumes from the last point.
- **AMT (Automatic Model Tuning)**: A feature that automatically runs many training jobs to find the best hyperparameter combination.
- **Bayesian optimization / Hyperband**: Bayesian is a strategy that estimates promising regions from the results so far to pick the next trial, and Hyperband is a strategy that trains many configurations a little, quickly eliminates the poor performers, and concentrates the remaining resources on the rest.
- **Warm start**: A feature that inherits the results of earlier tuning jobs and continues a new tuning from that point.
- **JumpStart / transfer learning**: JumpStart is SageMaker's model hub collecting verified pretrained models and solution templates. Transfer learning is a technique that carries knowledge from a model trained at large scale over to your task, achieving high performance even with little data.

---

## 📝 Practice Questions

**Question 1.** Which of the following is correct about SageMaker Training Jobs and built-in algorithms?

A) A Training Job keeps the instance running even after training ends  
B) A Training Job saves model.tar.gz to S3 after training and automatically terminates the instance, and your own script is trained as the entry_point of a framework Estimator  
C) Built-in algorithms always require you to build a custom container yourself  
D) XGBoost is an algorithm dedicated to image segmentation  

**Answer: B**  
Explanation: After training completes, a Training Job saves the model to S3 and automatically brings down the instance, and the user's script runs as the entry_point of a framework Estimator. A is wrong in saying the instance is kept, C is the opposite of the fact that built-ins are prebuilt containers, and D conflicts with XGBoost being for classification/regression on structured data.

---

**Question 2.** Across several scenarios aimed at reducing training cost, which pairing is most appropriate?

A) Need to resume after interruption → enable Spot only  
B) Classifier with little labeled data → train from scratch  
C) Need to resume after interruption → Spot + checkpoints; classifier with little labeled data → transfer learning  
D) Efficient hyperparameter search → Grid Search  

**Answer: C**  
Explanation: Because Spot can be interrupted, it must be used with checkpoints to guarantee resumption, and transfer learning suits cases with little labeled data. A can lose progress due to missing checkpoints, B is prone to overfitting due to insufficient data, and D conflicts with the fact that the basis of efficient search is Bayesian rather than exhaustive enumeration.

---

**Question 3.** In distributed training that repeatedly reads several TB of data over many epochs, I/O is the bottleneck, and you want to feed the input data efficiently as large-volume streaming. What is the most appropriate combination?

A) FSx for Lustre + RecordIO-protobuf  
B) S3 File mode + CSV  
C) Local disk + JSON  
D) DynamoDB + XML  

**Answer: A**  
Explanation: FSx for Lustre resolves the I/O bottleneck of repeatedly reading large data, and RecordIO-protobuf is the most efficient format for large-volume streaming input. B is inefficient because of downloading everything at each start and text parsing, C does not fit the scale of large distributed training, and D is unsuitable as a training data source/format.

---

**Question 4.** Which is correct about AMT (hyperparameter tuning)?

A) Bayesian uses previous trial results to choose the next trial, and early stopping can halt hopeless training jobs to reduce cost  
B) Grid Search is the strategy that finds the optimum with the fewest runs  
C) Warm start can always be used only when the data is identical  
D) Increasing max_parallel_jobs enlarges the sequential learning benefit of Bayesian  

**Answer: A**  
Explanation: Bayesian uses previous results to choose the next trial intelligently, and early stopping cuts off hopeless in-progress training jobs to save cost. B is inefficient because Grid is exhaustive enumeration, C is wrong because warm start is possible with the TRANSFER_LEARNING type even when the data changes, and D is the opposite of the fact that raising parallelism actually reduces the sequential dependency benefit.

---

**Question 5.** You want to fine-tune a validated pretrained text model on your domain data and deploy it quickly and cheaply. What is the most suitable approach?

A) Train the built-in K-Means from scratch  
B) Fine-tune a JumpStart pretrained model with fit, then deploy  
C) Load the model into Feature Store and deploy it  
D) Tune only the hyperparameters with AMT  

**Answer: B**  
Explanation: JumpStart provides pretrained models that you can fine-tune (transfer learning) on your data with fit and then deploy with deploy, which is fast and cheap. A is training an unrelated clustering model from the ground up, C is a feature store and not a means of model deployment, and D only tunes without using a pretrained model, so it fails to meet the requirement.

---
