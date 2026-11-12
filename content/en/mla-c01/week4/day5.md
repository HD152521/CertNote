# Day 5 - Week 4 Comprehensive Review: Model Development 1 — SageMaker Training

This week covered the entire training stage: "transforming data to models". From Training Job structure, through built-in algorithms that run inside them, automatic hyperparameter tuning via AMT, to not training from scratch but using pre-trained models via JumpStart·transfer learning and cost optimization. Today we weave these four pieces into one flow for quick review right before the exam.

## This Week at a Glance

```
[Data (S3/FSx)]
      │ Input Channel (File / Pipe / Fast File)
      ▼
[Training Job]  ← Estimator (container·role·instance·hyperparameters)
      │           ├─ Built-in Algorithms (XGBoost, Linear Learner, ...)
      │           ├─ Framework Estimator (entry_point=my script)
      │           └─ JumpStart (pre-trained model fine-tune)
      │ Instance: CPU (traditional ML) / GPU (deep learning) / Distributed (instance_count↑)
      │ Cost savings: Managed Spot + Checkpoints
      ▼
[Model Artifact (model.tar.gz, S3)]
      ▲
[AMT Tuning] ── Auto-run multiple Training Jobs (Bayesian / Early Stop / Warm Start)
```

This diagram contains all of this week. Data enters via input channels, trains in Training Job (defined by Estimator), model saves to S3, and AMT above runs multiple jobs to find optimal hyperparameters.

## Daily Essentials at a Glance

**Day 1 — Training Job**: Basic training unit. Spin up instances, train in container, save model to S3, auto-terminate instances. **Estimator** is the blueprint (for your script, use Framework Estimator's `entry_point`). Pass input channels to `fit()`, input modes are File (download all)·Pipe (stream)·Fast File. Multi-TB repeated reads → **FSx for Lustre**. Instances: traditional ML=CPU, deep learning=GPU, insufficient capacity→distributed. **Managed Spot Training**: up to 90% savings but can interrupt → **checkpoints** required, `max_wait >= max_run`.

**Day 2 — Built-in Algorithms**: Use AWS-optimized algorithms without code. Problem-type mapping is key: tabular classification/regression=**XGBoost**, large-scale linear/sparse=**Linear Learner**, anomaly=**RCF**, time series=**DeepAR**, sparse recommendation=**Factorization Machines**, fast text=**BlazingText**, image has 3 types: classification/detection/segmentation. Input formats: large streaming=**RecordIO-protobuf**, small=CSV, XGBoost CSV=**first column is label, no header**.

**Day 3 — AMT (Hyperparameter Tuning)**: Objective metric + ranges + strategy auto-run multiple jobs. Strategies: base **Bayesian** (smart from prior results, sequential), independent parallel=Random, exhaustive=Grid (categorical only), long deep learning early-stop=**Hyperband**. **Early stopping** (`early_stopping_type='Auto'`) stops hopeless jobs, **Warm Start** reuses prior tuning results (identical=IDENTICAL_DATA_AND_ALGORITHM, data changed=TRANSFER_LEARNING).

**Day 4 — JumpStart·Transfer Learning·Cost**: **JumpStart** is pre-trained model hub (deploy as-is or fit→deploy). **Transfer learning** achieves high performance with little data, cost, time → answer for "accurate classifier with scarce labels". Cost optimization splits into **lower unit cost** (Spot, right instances, input modes/RecordIO) and **reduce work volume** (transfer learning, early stopping). Spot + transfer learning combinable.

> 💡 **Related Theory**: This week's through-line is "compute only as much as needed, as efficiently as possible". Training uses expensive GPU time, so ① compute less initially (transfer learning), ② search smartly (Bayesian+early stopping), ③ use cheap resources (Spot), ④ auto-shut when done. ML knowledge and cloud cost-efficiency thinking converge at the training stage.

## Frequently Confused Distinctions

Exam-tricky boundaries organized:

| Situation | Answer | Confusing Wrong Choice |
|---|---|---|
| Large data repeated I/O bottleneck | FSx for Lustre | S3 File mode |
| Large streaming input format | RecordIO-protobuf | CSV |
| Cost cut + restart after interruption | Spot + checkpoint | Spot alone |
| Efficient hyperparameter search | Bayesian | Grid (exhaustive) |
| Long deep learning tuning early stop | Hyperband | Random |
| Reuse prior tuning results | Warm Start | New tuning |
| Classifier with scarce labels | Transfer learning | Train from scratch |
| Fast deploy verified model | JumpStart | Custom container |
| Train my PyTorch script | Framework Estimator | Built-in container |
| Tabular classification | XGBoost | BlazingText |

Concentrating on how "answer" keywords appear in problem statements (data size/form, interruption tolerable, budget, training time) solves most.

> ⚠️ **Pitfall**: Most common mistakes: seeing only "cost cut" and picking Spot while forgetting checkpoints, and thinking "tuning" = Grid Search. Spot pairs with checkpoints due to interruption risk; efficient tuning's foundation isn't Grid's exhaustive search but Bayesian. Also common: choosing built-in containers for custom scripts—custom code uses Framework Estimator's `entry_point`.

## Next Week Preview

This week was "building" models. Next week (Model Development 2) continues to **evaluate and analyze** created models. Learning curves and overfitting/underfitting diagnosis, evaluation metrics (accuracy, precision, recall, F1, AUC), and SageMaker Debugger and Experiments for inspecting and comparing training. Today's "how to train models" becomes next week's "was that model trained well" foundation.

## Summary

Week 4 compresses SageMaker training into four axes: ① **Training Job**: spin up instances, train, save to S3, auto-terminate; Estimator is blueprint; input channels and modes; Spot+checkpoints save cost. ② **Built-in Algorithms**: problem-type algorithm mapping, input formats (RecordIO vs CSV). ③ **AMT**: Bayesian default, early stop and warm start for efficiency and reuse. ④ **JumpStart·Transfer Learning·Cost**: pre-trained models achieve high performance with little data and cost; cost splits into unit-cost and work-volume axes. Reviewing the boundary table above once more before exam handles most multiple-choice in this week's scope reliably.

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
