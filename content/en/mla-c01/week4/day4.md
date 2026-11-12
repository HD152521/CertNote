# Day 4 - JumpStart·Pre-trained Models·Transfer Learning + Training Cost Optimization

So far we've covered training models from scratch with data. But training an image classifier or text generation model from the ground up every time requires massive data, time, and cost. Often it's far more sensible to use an already well-trained model and adjust it slightly for your problem. SageMaker **JumpStart** opens this path. Today we cover JumpStart and transfer learning, plus comprehensive training cost optimization.

In the MLA-C01 exam, this topic appears as keywords: "fast deploy of pre-trained models", "transfer learning to build models with little data and cost", "multiple ways to reduce training cost".

## JumpStart: Pre-trained Model Hub

**JumpStart** is a hub of hundreds of pre-trained models and solution templates. For image classification, object detection, text classification, summarization, text generation (including LLMs), and more, you can deploy verified models in a few lines or fine-tune them on your data.

```python
from sagemaker.jumpstart.model import JumpStartModel

# Deploy pre-trained model as-is
model = JumpStartModel(model_id='huggingface-text2text-flan-t5-base')
predictor = model.deploy()

response = predictor.predict({'inputs': 'Summarize this sentence: ...'})
```

```python
from sagemaker.jumpstart.estimator import JumpStartEstimator

# Fine-tune pre-trained model on your data
estimator = JumpStartEstimator(model_id='huggingface-text2text-flan-t5-base')
estimator.fit({'training': 's3://my-bucket/my-data/'})
fine_tuned = estimator.deploy()
```

Distinguish two JumpStart usage patterns: ① **Deploy as-is**: Use model for inference without additional training. ② **Fine-tune then deploy**: Train additional on your domain data for specialization. In exams, think JumpStart for "deploy verified model quickly with minimal code".

> 💡 **Related Theory**: JumpStart's value lies in "reusing learned representations". Models trained on massive data already know general features—image edges and textures, language grammar and semantics. This knowledge is commonly useful across most downstream tasks. So fetching an already-knowing model instead of learning from scratch achieves high performance with little data and cost.

## Transfer Learning

**Transfer learning** is a technique to apply knowledge learned in one task to a related task. JumpStart fine-tuning is exactly transfer learning's implementation. Typically the pre-trained model's early layers (general feature extractors) stay frozen, and only later layers (task-specific classifiers) retrain on your data.

Three key benefits:

- **Sufficient with little data**: From-scratch learning needs tens of thousands of samples; transfer learning needs hundreds to thousands.
- **Reduced training time and cost**: Since only some layers train, it's faster and cheaper.
- **High performance**: Inheriting large-scale pre-training knowledge, performs well even on small datasets.

> ⚠️ **Pitfall**: "Labeled training data scarce (e.g., hundreds per class) but accurate image classifier needed" → answer is **transfer learning (pre-trained model fine-tuning)**. Training a CNN from scratch lacks data entirely. Conversely, if "data extremely abundant and domain completely different from existing models", consider from-scratch or deeper fine-tuning. Data quantity and domain similarity are decision factors.

## Training Cost Optimization Comprehensive

Gathering cost-reduction measures scattered through this week in one place. Exams comprehensively ask "ways to reduce training cost".

| Measure | Effect | Key Condition |
|---|---|---|
| **Managed Spot Training** | Up to 90% savings | Can interrupt → checkpoint mandatory |
| **Transfer Learning / JumpStart** | Reduce training volume itself | Leverage pre-trained models |
| **Early Stopping (tuning)** | Stop hopeless training | early_stopping in AMT |
| **Appropriate Instance Selection** | Prevent over-provisioning | CPU/GPU matching algorithm |
| **Distributed Training Efficiency** | Reduce time | FSx for I/O bottleneck |
| **Input Mode Optimization** | Startup latency, disk savings | Pipe/Fast File for large data |
| **Data Format (RecordIO)** | I/O efficiency | Large-scale streaming |

The two most powerful measures are **Spot training** (infrastructure unit-cost reduction) and **transfer learning/JumpStart** (reducing training volume itself). These work on different axes, usable together—fine-tuning a pre-trained model on Spot instances compounds both reductions.

```python
# Cost optimization example combining transfer learning + Spot
estimator = JumpStartEstimator(
    model_id='huggingface-text2text-flan-t5-base',
    use_spot_instances=True,
    max_run=3600,
    max_wait=7200,
    checkpoint_s3_uri='s3://my-bucket/checkpoints/',
)
```

> 💡 **Related Theory**: Cost optimization divides into two streams clearly: ① **Lower unit cost**: Same work with cheaper resources—Spot, right instance size, input modes. ② **Reduce work volume**: Do less computing upfront—transfer learning (don't learn from scratch), early stopping (stop hopeless attempts). Distinguishing whether exam questions ask "cost" or "work volume" reveals answers quickly.

## Additional Cost Perspective: Monitoring and Auto-Termination

Unexpected training cost waste often comes from "resources that finished but didn't shut down" and "badly-configured training running forever". A few safeguards exist:

- **Set `max_run`**: Forcibly terminate training exceeding time limit, preventing runaway costs.
- **Notebook auto-termination**: SageMaker Studio/notebook instances' idle auto-shutdown (lifecycle config) prevents forgotten notebook charges.
- **Training job auto-instance termination**: Training Jobs auto-terminate instances when complete (as covered yesterday), so unlike endpoints, abandonment cost risk is small.

> 📚 **Case Study**: A team ran a GPU notebook instance for experiments, forgot to shut it Friday evening, and left it running through the weekend. Training jobs auto-terminate when done but notebook instances bill until someone shuts them, costing tens of thousands in one oversight. Later they applied idle auto-shutdown lifecycle config so the notebook auto-shuts after period of inactivity, preventing recurrence.

## Summary

Remember by three axes: ① **JumpStart**: Pre-trained model hub, deploy as-is or fine-tune on your data (fit→deploy). Deploy verified models quickly with minimal code. ② **Transfer learning**: Move pre-trained knowledge for high performance with little data, cost, time. "Scarce label data but accurate classifier needed" → transfer learning. ③ **Cost optimization**: Distinguish "lower unit cost" (Spot+checkpoints, right instances, input modes/RecordIO) from "reduce work volume" (transfer learning, early stopping), preventing abandonment charges with max_run and notebook auto-termination. Exams: Spot and transfer learning are the strongest reductions; combining them is key.

Next we comprehensively review this week (Model Development 1 — SageMaker Training) entirely.

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
