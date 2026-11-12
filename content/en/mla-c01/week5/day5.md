# Day 5 - Week 5 Comprehensive: Model Development 2 Review

This week covered "train with my code, scale training, look inside training, evaluate results correctly"—the second half of model development. Moving beyond built-in algorithms into custom training expands choices; judgments of "how much freedom vs how much managed services" become critical. Today we re-weave four topics into one flow.

## Week 5 at a Glance

```
[Custom Training]      How far to bring my code
   Script mode → requirements extension → BYOC

[Distributed Training] What to split
   Data parallel (slow) ↔ Model parallel (doesn't fit)

[Debugging·Profiling]   Look inside training
   Debugger (model tensors) ↔ Profiler (resources)

[Model Evaluation]      Is result truly good
   Metric selection + overfitting diagnosis + cross-validation
```

Penetrating principle: **Go down only as much needed, pick tools and metrics for the problem**. Custom training defaults to "minimum effort" (script mode); distributed by symptom (slow vs OOM); observation by concern (model vs resources); evaluation by problem character (imbalance, outliers).

## Custom Training Review

Spectrum of "how far to bring my code":

| Method | Bring | Fits |
|---|---|---|
| Script mode | train.py | Standard PyTorch/TF code, minimum effort |
| requirements extension | train.py + Python packages | Only additional pip packages |
| BYOC | Entire Docker image | System packages, special runtime |

Remember conventions: data is `SM_CHANNEL_<channelname>`, model save is `SM_MODEL_DIR` (`/opt/ml/model`). BYOC: input at `/opt/ml/input/data/<channelname>/`, run convention `train`.

> 💡 **Related Theory**: This layer is separation of concerns. Split training logic from execution environment; standard environment swap only code (script mode), special environment build it (BYOC). Exam emphasizing "minimum effort" → pick upper, "system dependencies/unsupported framework" → pick lower.

## Distributed Training Review

Splits by "what to divide":

- **Data parallel**: Divide data per GPU, train with model replicas, all-reduce average gradients. Solves = **speed (throughput)**. SMDDP. Warning: effective batch increases → adjust learning rate.
- **Model parallel**: Divide model itself across GPUs, shard. Solves = **OOM (model doesn't fit)**. SMP.
- **Infrastructure**: Inter-node comms = EFA, data supply = FSx for Lustre.

> ⚠️ **Pitfall**: Answer trying to solve OOM with data parallel (add GPUs) is wrong. Data parallel keeps full replicas on each GPU—if model doesn't fit, adding GPUs doesn't help, same OOM. OOM solved by model parallel/sharding. Conversely "slow" is data parallel.

## Debugging·Profiling Review

View training internals from two angles:

| Tool | Observes | Typical Symptom |
|---|---|---|
| Debugger | Model tensors (gradient·loss·weight) | Gradient vanishing/exploding, loss stalled, overfitting |
| Profiler | System resources (GPU/CPU, I/O) | GPU underutil, data loading·CPU bottleneck |
| CloudWatch | Overall metrics·logs·alarms | Operations monitoring |

Remember: Debugger rules fundamentally detect·report only; to auto-stop, attach **action(StopTraining)**. GPU underutil solved via data pipeline (increase workers, FSx cache, prefetch).

> 💡 **Related Theory**: Debugger watches mathematical process (model)'s internal state, Profiler watches physical resources' usage pattern that process runs on. Viewing both layers solves "why training fails" and "why expensive" together.

## Model Evaluation Review

Measure "generalization" via "problem-fitting metrics":

- **Classification**: Confusion matrix → precision (suppress false alarm), recall (prevent miss), F1, AUC. **Imbalanced = no accuracy**, F1·recall·AUC-PR.
- **Regression**: RMSE (large error sensitive), MAE (outlier insensitive), R².
- **Overfitting**: Diagnose by train-validation gap → regularization·dropout·augment·early stop.
- **Cross-validation**: k-fold reduces eval variance. Imbalanced = stratified, time-series = time-split.

> 📚 **Case**: Team boasted "98% accuracy" fraud model but actually caught almost no fraud (imbalance). Recall was 12%. Switched eval metrics to F1·recall, validated with stratified k-fold, adjusted threshold and class weights, lifted recall. Lesson: don't trust one number (accuracy)—judge by metrics for problem character.

## Comprehensive Decision Flow

Whole week as one decision tree:

```
When Training
 ├─ Code type?        Standard framework → script mode
 │                    +Python package → requirements
 │                    +System package → BYOC
 ├─ Scale?            Slow → data parallel / OOM → model parallel
 └─ Problems?         Model anomaly → Debugger / resource waste → Profiler

When Evaluating
 ├─ Classification?  Imbalanced → F1·recall·AUC / Balanced → accuracy OK
 ├─ Regression?      Large error matters → RMSE / Outlier insensitive → MAE
 ├─ Generalization? Train-val gap big → overfitting → regularize·augment·early-stop
 └─ Limited data?    k-fold cross-validation (imbalanced=stratified, time-series=time-split)
```

## Summary

Week 5 was model development's second half. **Custom training** splits by code extent (script mode → BYOC), **distributed** by what divides (data parallel=speed, model parallel=OOM), **observation** by what seen (Debugger=model, Profiler=resource), **evaluation** by problem (imbalance→F1·recall, outlier→RMSE/MAE, overfitting→gap diagnosis). Exams repeatedly ask boundary judgments: "minimum effort", "OOM vs slow", "detection≠auto-stop", "accuracy trap". Mapping these four forks to keywords instantly means model development area is well covered.

Next week covers deploying trained models to production—inference.

---

## 📝 Practice Questions

**Question 1.** You want to run PyTorch training code on SageMaker with minimal effort, and only the transformers Python package is additionally needed. There are no system packages. What is the most suitable approach?

A) Build a Docker image yourself with BYOC  
B) Script mode + add transformers to requirements.txt in source_dir  
C) Switch to a built-in algorithm  
D) Enable model parallelism  

**Answer: B**  
Explanation: Since you only need to add Python packages to a standard framework, script mode with requirements.txt is sufficient and Docker is not needed. A is excessive work when there are no system dependencies, C cannot use your own code, and D is a distributed strategy unrelated to adding packages.

---

**Question 2.** A model with billions of parameters does not fit in single-GPU memory and hits OOM. Adding nodes with data parallelism repeats the same OOM. What is the correct solution?

A) Increase the number of data-parallel GPUs further  
B) Split and shard the model across GPUs with SageMaker model parallelism (SMP)  
C) Increase the batch size  
D) Enabling Profiler makes the OOM disappear  

**Answer: B**  
Explanation: OOM is a problem where the model replica does not fit on one GPU, so the model must be split across GPUs with model parallelism/sharding, and data parallelism does not solve it because it places a full replica on each GPU. A repeats the same OOM, C uses even more memory, and D is only a diagnostic tool and does not increase memory.

---

**Question 3.** Debugger's loss_not_decreasing rule detected a loss plateau, but training ran to the end and only incurred cost. How can you prevent the cost with automatic stopping?

A) Just add more rules  
B) Attach a StopTraining action to the rule  
C) Switch to Profiler  
D) Change instance_type to a larger one  

**Answer: B**  
Explanation: Debugger rules by default only detect and report, so to stop automatically you must explicitly attach an action such as StopTraining. A still only reports even with more rules, C is a resource analysis tool unrelated to stopping training, and D actually increases cost.

---

**Question 4.** On an imbalanced dataset where only 0.5% of transactions are fraudulent, a model is reported with "99.5% accuracy." What is the correct judgment about the evaluation?

A) With 99.5% accuracy, it is an excellent model  
B) Accuracy can be distorted by the imbalance, so re-evaluate with F1, recall, and AUC-PR  
C) Evaluate with the regression metric RMSE  
D) Cross-validation is unnecessary  

**Answer: B**  
Explanation: With a 0.5% positive imbalance, simply predicting "everything is legitimate" yields 99.5% accuracy, so accuracy cannot be trusted and you must look at rare-positive detection ability with F1, recall, and AUC-PR. A falls into the accuracy trap, C is an error of using a regression metric for classification, and D is a wrong judgment that gives up stable evaluation.

---

**Question 5.** You are training on an ml.p4d instance, but training is slower than expected and GPU utilization is low. What is the most appropriate diagnosis of the cause and first improvement direction?

A) Look at gradients with Debugger's vanishing_gradient rule  
B) Diagnose bottlenecks with Profiler, and if it is a data loading bottleneck, improve it with more DataLoader workers, an FSx cache, and prefetching  
C) Enable model parallelism unconditionally  
D) Raise the learning rate by 10x  

**Answer: B**  
Explanation: Low GPU utilization and slow training are resource efficiency problems, so find the bottleneck with Profiler and, if it is a data loading bottleneck, improve the data supply pipeline to raise GPU utilization. A is a tool that looks at model tensors and is unrelated to utilization, C is an excessive measure when there is no OOM, and D only changes convergence behavior and is unrelated to improving utilization.

---
