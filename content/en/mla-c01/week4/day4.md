# Day 4 - JumpStart·Pre-trained Models·Transfer Learning + Training Cost Optimization

## 📌 Key Takeaways

- **JumpStart** is a hub of pre-trained models. There are two ways to use it — **deploy** as is, or **fit → deploy** with your own data (fine-tuning).
- **Transfer learning** inherits the general features of a model trained at large scale to achieve high performance with **little data, short time, and low cost**.
- "I have little labeled data but need an accurate classifier" → the answer is not training from scratch but **transfer learning (fine-tuning)**.
- Training cost is split along two axes — **lowering the unit price** (Spot + checkpoints, appropriate instances, input mode/RecordIO) and **reducing the amount of work** (transfer learning, early stopping).
- The two most powerful means, **Spot** and **transfer learning**, are on different axes, so they can be **applied together**.

## JumpStart: A Hub of Pre-trained Models

Training an image classifier or a text generation model from scratch every time costs enormous amounts of data, time, and money. **JumpStart** is a hub collecting hundreds of pre-trained models and solution templates, where you can deploy proven models for image classification, object detection, text classification, summarization, text generation (including LLMs), and more in a few lines, or fine-tune them with your own data.

```python
from sagemaker.jumpstart.model import JumpStartModel

# Deploy the pre-trained model as is
model = JumpStartModel(model_id='huggingface-text2text-flan-t5-base')
predictor = model.deploy()

response = predictor.predict({'inputs': 'Summarize this sentence: ...'})
```

```python
from sagemaker.jumpstart.estimator import JumpStartEstimator

# Fine-tune the pre-trained model with my data
estimator = JumpStartEstimator(model_id='huggingface-text2text-flan-t5-base')
estimator.fit({'training': 's3://my-bucket/my-data/'})
fine_tuned = estimator.deploy()
```

JumpStart splits into two usage modes.

| Usage mode | Call flow | What is needed | When to choose |
|-----------|-----------|-----------|-------------|
| **Deploy as is** | `JumpStartModel(...).deploy()` | Nothing | When model performance is already sufficient for a general task |
| **Fine-tune then deploy** | `JumpStartEstimator(...).fit()` → `.deploy()` | My domain's labeled data | When domain specialization is needed, such as technical terms or in-house data |

On the exam, "quickly start with a proven model with almost no code" calls to mind JumpStart. If "specialize with my domain data" is added, it is `fit → deploy`.

The value of JumpStart lies in "reuse of representation learning". A model trained on large-scale data already knows general features (edges and textures in images, grammar and meaning in language). This knowledge is commonly useful for most downstream tasks. So instead of making it learn from scratch, bringing in a model that already knows is the key reason you get high performance even with little data and cost.

## Transfer Learning

**Transfer learning** is a technique that carries knowledge learned in one task over to another related task. JumpStart fine-tuning is exactly an implementation of transfer learning. Typically, the front part of the pre-trained model (the general feature extractor) is left as is, and only the back part (the task-specific classification layer) is retrained with my data.

```text
[Pre-trained model]  already trained on large-scale data
   Lower layers  : general features like lines·edges·textures   → freeze
   Middle layers : partial shapes·structures                    → freeze or partially unfreeze
   Output layer  : classes of the original task                 → cut off and replace
                                                    │
                                                    ▼
[My task]  new output layer matching my number of classes ── train with my data
                                                    │
                                                    ▼
                             High performance with little data and short time
```

There are three key benefits.

- **Little data is enough**: Training from scratch may need hundreds of thousands of images, but transfer learning is fine with hundreds to thousands.
- **Saves training time and cost**: Only some layers are trained, so it is fast and cheap.
- **High performance**: It inherits the knowledge of large-scale pre-training and works well even on small datasets.

How deeply to fine-tune splits on two factors: **the amount of my data** and **domain similarity**.

| Amount of labeled data | Similarity to the pre-training domain | Recommended approach |
|----------------|---------------------------|-----------|
| Small (hundreds per class) | High | Freeze the feature extractor and train only the output layer |
| Small | Low | Fine-tune some upper layers as well + use data augmentation together |
| Large | High | Fine-tune all layers with a low learning rate |
| Large | Low | Deep fine-tuning; in some cases training from scratch is also a candidate |

The reason for freezing the lower layers is that the knowledge those parts learn is **reusable regardless of the task**. Edges and textures in images and grammatical structure in language are needed in any task. Conversely, the output layer is tied directly to "the answer list of the original task" and cannot be reused, so it is cut off and a new one is attached. The less data you have, the more you must narrow the part you train anew to avoid overfitting.

Laying the three approaches out by cost and data requirements makes the selection criteria clear.

| Approach | Labeled data needed | Training cost·time | Domain specialization |
|------|-------------------|----------------|-------------|
| **Deploy the pre-trained model as is** | None | Training cost 0 (inference cost only) | None |
| **Fine-tuning (transfer learning)** | Hundreds ~ thousands | Low ~ medium | High |
| **Training from scratch** | Tens of thousands ~ hundreds of thousands | High | Best only when data is sufficient |

> ⚠️ **Pitfall**: The answer to the scenario "I have little labeled training data (e.g., hundreds of images per class) but need an accurate image classifier" is **transfer learning (fine-tuning a pre-trained model)**. Training a CNN from scratch would leave you far short of data. Conversely, if "data is very abundant and the domain is completely different from existing models", consider training from scratch or deeper fine-tuning. The amount of data and domain similarity are the decision criteria.

## Training Cost Optimization Summary

Here we gather in one place the cost-saving means that appeared scattered through this week. The exam asks comprehensively about "ways to reduce training cost".

```text
Training cost  =  (resource unit price)  ×  (amount of work to do)
                       │                          │
                       │                          └─ Reduce the amount of work
                       │                               ├─ Transfer learning / JumpStart  (don't learn from scratch)
                       │                               ├─ Early stopping (AMT)           (stop hopeless trials)
                       │                               └─ max_run ceiling                (block runaway training)
                       │
                       └─ Lower the unit price
                            ├─ Managed Spot Training (+ checkpoints)
                            ├─ Instances matched to the algorithm (CPU / GPU)
                            ├─ Input mode (Pipe / Fast File)
                            └─ RecordIO-protobuf format
```

| Means | Effect | Key condition |
|------|------|-----------|
| **Managed Spot Training** | Up to 90% savings | Can be interrupted → checkpoints required |
| **Transfer learning / JumpStart** | Reduces the amount of training itself | Use a pre-trained model |
| **Early stopping (tuning)** | Stops hopeless training | Early stopping in AMT |
| **Appropriate instance selection** | Prevents over-provisioning | CPU/GPU matched to the algorithm |
| **Distributed training efficiency** | Shortens time | FSx when I/O is the bottleneck |
| **Input mode optimization** | Reduces startup delay·disk | Pipe/Fast File for large volumes |
| **Data format (RecordIO)** | I/O efficiency | Large-volume streaming |

The two most powerful means are **Spot training** (reducing infrastructure unit price) and **transfer learning/JumpStart** (reducing the amount of training itself). These two are on different axes, so they can be used together — fine-tuning a pre-trained model on Spot instances stacks both savings.

```python
# Example of cost optimization combining transfer learning + Spot
estimator = JumpStartEstimator(
    model_id='huggingface-text2text-flan-t5-base',
    use_spot_instances=True,
    max_run=3600,
    max_wait=7200,
    checkpoint_s3_uri='s3://my-bucket/checkpoints/',
)
```

> ⚠️ **Pitfall**: In "How do you reduce cost?", options to switch to a smaller instance are often mixed in. But if training takes proportionally longer, the total cost stays about the same or can even rise. Cost is **unit price × time**, so choosing by unit price alone is wrong. Conversely, moving up to a bigger GPU while GPU utilization is low is another classic wrong answer that spends money without shortening time.

Cost optimization becomes clear if you think of it in two branches. ① **Lower the unit price**: do the same work with cheaper resources — Spot, appropriate instance size, input mode. ② **Reduce the amount of work**: compute less in the first place — transfer learning (don't learn from scratch), early stopping (stop hopeless trials). If you distinguish whether an exam question is asking about "unit price" or "amount of work", the answer shows up quickly.

## Additional Cost Perspective: Monitoring and Automatic Shutdown

Surprisingly common waste in training cost is "resources left on after finishing" and "training that runs endlessly because of a wrong configuration". There are several safeguards.

- **Set `max_run`**: Force-terminates training that exceeds a certain time to block runaway cost.
- **Automatic notebook shutdown**: Idle auto-shutdown (lifecycle config) for SageMaker Studio/notebook instances prevents billing for notebooks left on and forgotten.
- **Automatic instance shutdown for training jobs**: A Training Job takes its instances down automatically when finished (the flow we saw in Day 1), so unlike an endpoint the risk of billing from neglect is small.

Long-running training jobs can be checked periodically with code.

```python
import boto3
from datetime import datetime, timedelta, timezone

sm = boto3.client('sagemaker')

# Training jobs in progress for more than 24 hours = runaway cost candidates
resp = sm.list_training_jobs(StatusEquals='InProgress', MaxResults=100)
cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

for job in resp['TrainingJobSummaries']:
    if job['CreationTime'] < cutoff:
        print('Long-running:', job['TrainingJobName'], job['CreationTime'])
```

One team launched a GPU notebook instance to experiment, forgot to turn it off on Friday evening, and left it running all weekend. A training job shuts down automatically when it finishes, but a notebook instance keeps billing until a person turns it off, so a single lapse burned hundreds of thousands of Korean won. Afterward, they applied an idle auto-shutdown lifecycle config so that the notebook turns itself off after a period of inactivity, preventing a recurrence.

## When Cost and Performance Diverge: Symptom → Cause → Action

| Symptom | Common cause | Action |
|------|-----------|------|
| Trained from scratch with few labels and accuracy is poor | Overfitting from insufficient data | Switch to fine-tuning a pre-trained model (transfer learning) |
| Performance actually dropped after fine-tuning | Shook all layers heavily with little data | Freeze the lower layers and lower the learning rate |
| Training cost keeps exceeding the budget | Only the unit price was addressed, the amount of work is unchanged | Reduce the training amount itself with transfer learning and add early stopping |
| Spot is on but the total elapsed time grew greatly | Retraining from scratch every time after reclamation | Specify `checkpoint_s3_uri` + check the script's resume logic |
| Charges keep coming though nobody is using anything | A notebook instance left on and neglected | Apply an idle auto-shutdown lifecycle config |
| Training has not finished for days | Training that does not converge because of a configuration error keeps running | Set a ceiling with `max_run` and periodically check in-progress jobs |

In the next post, we do a comprehensive review of this whole week (Model Development 1 — SageMaker Training).

## 📖 Glossary

- **JumpStart**: SageMaker's model hub collecting proven pre-trained models and solution templates.
- **Pre-trained model**: A model that has already finished training on large-scale data. Use it as is or train it a bit more.
- **Fine-tuning**: Training a pre-trained model a bit more with my data to tailor it to my task.
- **Transfer learning**: A technique that carries knowledge learned in one task over to another related task. Fine-tuning is its representative implementation.
- **Freeze**: Removing some layers of a pre-trained model from training so their values stay fixed and do not change.
- **Feature extractor / output layer**: The feature extractor is the front part of the model that pulls general features (edges, textures, grammatical structure, etc.) from the input, and the output layer is the last part that turns those features into actual answer classes. When the task changes, the output layer is what gets replaced.
- **Data augmentation**: A technique that increases training data by creating variants of the same data through rotation, cropping, adding noise, etc.
- **lifecycle config**: A configuration script that runs automatically when a SageMaker notebook or Studio starts or becomes idle.
- **Idle auto-shutdown**: A setting that makes a notebook instance turn itself off after a period of no use. Prevents billing from neglect.
- **max_run**: The maximum time a training job can run. If exceeded, it is force-terminated, blocking runaway cost.

---

## 📝 Practice Questions

**Question 1.** You want to quickly deploy a validated text summarization model as an inference endpoint with almost no coding. What is the most suitable SageMaker feature?

A) Train the built-in K-Means from scratch  
B) Select and deploy a pretrained model from JumpStart  
C) Load the model into Feature Store  
D) Transform the data with Data Wrangler  

**Answer: B**  
Explanation: JumpStart provides hundreds of pretrained models that can be deployed or fine-tuned in a few lines without additional training, so it suits getting started quickly with a validated model. A trains an unrelated clustering algorithm from the ground up, C is a feature store, and D is a data preprocessing tool, both far from model deployment.

---

**Question 2.** You must build an accurate image classifier from a small number of labeled images, on the order of a few hundred per class. What is the most suitable approach?

A) Train a deep CNN from scratch with random initialization  
B) Use transfer learning: take a pretrained model and fine-tune it on your data  
C) Discard all the data and classify with rules  
D) Cluster with K-Means without training  

**Answer: B**  
Explanation: Transfer learning inherits the general features of a model trained at large scale and achieves high performance even with little data, so it suits image classification with little labeled data. A is prone to overfitting because of the lack of data, C can hardly guarantee classification accuracy, and D is an unsupervised approach that cannot use the labels.

---

**Question 3.** You want to fine-tune a pretrained LLM on your domain data while cutting training cost as much as possible. Training can be resumed even if interrupted. What is the most effective combination?

A) On-Demand Instances + a larger GPU  
B) JumpStart fine-tuning + Managed Spot Training + checkpoints  
C) Pretrain the LLM from scratch  
D) Launch multiple inference endpoints  

**Answer: B**  
Explanation: Transfer learning (JumpStart fine-tuning) reduces the amount of training itself, and Spot plus checkpoints lowers infrastructure unit cost by up to 90% with the ability to resume on interruption, so applying both savings axes together cuts cost substantially. A raises cost, C incurs enormous cost, and D increases inference cost rather than training cost.

---

**Question 4.** When dividing training cost optimization measures into "lowering the unit price" and "reducing the amount of work itself," which of the following belongs to reducing the amount of work?

A) Managed Spot Training  
B) Choosing an appropriate instance type  
C) Transfer learning (using a pretrained model)  
D) Pipe input mode  

**Answer: C**  
Explanation: Transfer learning reuses pretrained knowledge instead of learning from scratch, reducing the amount of computation required itself. A, B, and D are means of lowering the unit price by performing the same work on cheaper resources or with efficient I/O.

---

**Question 5.** You want to prevent the problem of continued billing while a GPU notebook instance launched for experiments sits unused because you forgot to shut it down. What is the most suitable measure?

A) Set the training job's max_run to 0  
B) Apply an idle auto-shutdown lifecycle config to the notebook instance  
C) Launch the notebook on Spot Instances  
D) Disable Feature Store  

**Answer: B**  
Explanation: An idle auto-shutdown lifecycle config shuts the notebook instance down on its own after a period of inactivity, preventing billing for resources that were left on and forgotten. A is an incorrect setting that stops training immediately, C increases the risk of the notebook being interrupted, and D has nothing to do with the cost problem.

---
