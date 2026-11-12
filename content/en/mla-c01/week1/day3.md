# Day 3 - AWS ML Stack at a Glance

## 📌 Key Takeaways

- The AWS ML stack has three layers: **AI services (API calls) → SageMaker (train it yourself) → infrastructure (manage compute yourself)**.
- Choosing a layer is a **trade-off between abstraction level and control** - higher is faster and easier but gives less control; lower is freer but carries a heavier burden.
- Standard tasks (image, speech, translation, OCR, sentiment) go to **AI services**, custom models go to **SageMaker**, and extreme cost or performance needs go to **infrastructure**.
- In the infrastructure layer, the chips are split: **Trainium is for training, Inferentia is for inference**.
- There are also **middle options between AI services and SageMaker**, such as Comprehend Custom and Rekognition Custom Labels.

## The Three-Layer Structure of the AWS ML Stack

AWS has dozens of ML-related services, so it feels overwhelming at first glance. But a single question - "Will you build the model yourself, call a finished model through an API, or work with the bare infrastructure from the ground up?" - sorts them neatly into three layers.

```
┌─────────────────────────────────────────────────┐  Abstraction ↑
│ Top: AI services (pre-trained models, API calls) │  Control ↓
│   Rekognition, Comprehend, Transcribe,           │  ML expertise ↓
│   Translate, Polly, Textract, Forecast, Bedrock  │  Implementation speed ↑
├─────────────────────────────────────────────────┤
│ Middle: ML platform (train and deploy yourself)  │
│   Amazon SageMaker (AI)                          │
├─────────────────────────────────────────────────┤
│ Bottom: ML infrastructure (manage compute)       │  Abstraction ↓
│   EC2(GPU), Inferentia, Trainium, EKS, ECS, FSx  │  Control ↑
└─────────────────────────────────────────────────┘  Operational burden ↑
```

Comparing the three layers in one table makes them quicker to tell apart.

| Criterion | AI services | SageMaker | ML infrastructure |
|------|----------|-----------|-----------|
| Who builds the model | AWS (pre-trained) | Customer (trains it) | Customer (everything) |
| ML expertise needed | Almost none | Medium to high | High |
| Implementation speed | Fastest | Medium | Slow |
| Customization | Limited | Flexible | Fully flexible |
| Operational burden | None | Managed (medium) | All on the customer |
| Typical cue phrase | "Standard task" | "Customize with our own data" | "Extreme cost/performance", "integrate with existing EKS" |

The deciding principle is the **trade-off between abstraction level and control**. An ML engineer picks like this: "if it is a standard task that needs no ML expertise, go to the top; if a custom model is needed, the middle; if extreme performance or cost optimization is needed, the bottom."

This is the ML version of the shared responsibility model. With AI services, AWS is responsible for everything down to model training and infrastructure, and the customer handles only API calls and data. With SageMaker, the model code and data belong to the customer, but AWS manages the infrastructure. With a self-built EC2 setup, the customer is responsible for almost everything. The principle applies as-is: the higher the abstraction, the higher the responsibility boundary moves.

## Top: AI Services - Using ML Features Without a Model

AI services let you use models that AWS has already trained with **a single API call**. You need almost no ML knowledge. Memorizing the mappings that commonly appear on the exam makes scenario questions easy.

| Service | Input → Output | Use | Scenario keywords |
|--------|-----------|------|----------------|
| Rekognition | Image/video → objects, faces, text | Image analysis, content moderation | "What can be seen in the photo" |
| Comprehend | Text → sentiment, entities, keywords | NLP, sentiment analysis | "Review sentiment", "extract entities" |
| Transcribe | Speech → text | Speech recognition (STT) | "Recording file to text" |
| Polly | Text → speech | Speech synthesis (TTS) | "Reads text aloud" |
| Translate | Text → translated text | Machine translation | "Multilingual support" |
| Textract | Document image → structured text | OCR, form and table extraction | "Scanned invoices and forms" |
| Forecast | Time series → future prediction | Demand forecasting | "Demand for next quarter" |
| Personalize | User behavior → recommendations | Recommendation system | "Personalized recommendations" |
| Bedrock | Prompt → generated result | Generative AI (LLM) | "Generate a summary", "chatbot" |

```python
import boto3

# Sentiment analysis with Comprehend - 0 lines of model training
comprehend = boto3.client("comprehend", region_name="ap-northeast-2")
resp = comprehend.detect_sentiment(
    Text="I am really satisfied with this product and the delivery was fast too!",
    LanguageCode="en",
)
print(resp["Sentiment"])         # POSITIVE
print(resp["SentimentScore"])    # {'Positive': 0.98, ...}
```

The code above has no training data and no model. It only calls AWS's pre-trained model. For a scenario saying "analyze the sentiment of customer reviews," answering that you would build a model with SageMaker is overkill - Comprehend is the correct answer.

**There are middle options too.** Between AI services and SageMaker, there is an option to "slightly adjust a pre-trained model with my own labels."

| Option | What it does | When to choose it |
|--------|-----------|------------|
| Basic AI service API | Pre-trained model as is | Standard task, no domain specificity |
| Comprehend Custom Classification/Entity | Fine-tunes classification and entity extraction with your own labels | A company-specific classification scheme is needed |
| Rekognition Custom Labels | Trains on objects of a specific domain | Objects a general model does not know, such as your own product's defects |
| SageMaker full custom | Full control of algorithm, data, and container | The above do not work, or you must design the performance and structure yourself |

The rule of thumb: "for standard sentiment analysis, basic Comprehend; if you need our company's own classification scheme, Custom." Custom options finish with far less effort than SageMaker full custom, so when the exam adds a condition like "domain-specific with minimal ML expertise," the Custom family is the answer candidate.

## Middle: SageMaker - Where You Build the Model Yourself

When you need a custom model that standard AI services cannot provide, the answer is **Amazon SageMaker**. It is an integrated platform that covers the entire ML lifecycle from data preparation through training, tuning, deployment, and monitoring, and it is effectively the protagonist of MLA-C01.

Looking at what SageMaker provides by lifecycle stage:

| Stage | Representative features | What they do |
|------|----------|--------|
| Data | Data Wrangler, Feature Store, Ground Truth | Preprocessing, feature storage, labeling |
| Training | Built-in algorithms, custom containers, distributed training | Model training |
| Tuning | Automatic Model Tuning | Hyperparameter optimization |
| Deployment | Real-time/serverless/batch/asynchronous, multi-model endpoints | Inference serving |
| Operations | Model Monitor, Model Registry, Pipelines | Drift detection, version management, MLOps |

```python
# SageMaker "trains it yourself" - the decisive difference from AI services
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", region, "1.7-1"),
    role=role, instance_count=1, instance_type="ml.m5.xlarge",
    hyperparameters={"objective": "binary:logistic", "num_round": 100},
)
estimator.fit({"train": "s3://my-bucket/train/", "validation": "s3://my-bucket/val/"})
predictor = estimator.deploy(initial_instance_count=1, instance_type="ml.t2.medium")
```

Compared with the AI service code, the difference is clear. Comprehend is a single `detect_sentiment()` line, but with SageMaker you specify the training data, algorithm, instance, and hyperparameters yourself. In exchange, you can build anything.

We will cover SageMaker in earnest tomorrow (Day 4). Today it is enough to fix its position: "SageMaker is the middle layer where you train and deploy custom models yourself."

## Bottom: ML Infrastructure - Tuning Performance and Cost Yourself

Beneath what SageMaker abstracts is the actual compute. You work with this layer directly when you need extreme performance or cost optimization, or when you must layer ML on top of existing EKS/ECS.

| Chip/resource | Use | Characteristics |
|----------|------|------|
| EC2 GPU (P5/P4, G5) | General-purpose training and inference | NVIDIA GPUs, the most flexible |
| AWS Trainium (Trn1) | **Training** of large-scale models | AWS's own chip, lower training cost |
| AWS Inferentia (Inf2) | Large-scale **inference** | AWS's own chip, lower inference cost and power |
| Elastic Inference | Attaches partial inference acceleration | Borrows only a fraction of a GPU to save cost |
| FSx for Lustre | High-speed training data | High-performance file system integrated with S3 |

The key distinction is that **Trainium is for training and Inferentia is for inference**. The two workloads differ in the nature of their computation itself.

| Aspect | Training | Inference |
|------|---------------|-----------------|
| Computation | Forward pass + backward pass (gradient computation) | Forward pass only |
| Batching | Large batches at once | Small batches, frequently |
| Optimization goal | Throughput | Latency |
| Frequency | Periodic (e.g., once a week) | Endlessly repeated on every request |
| AWS dedicated chip | Trainium | Inferentia |

Inference happens far more often than training, so reducing inference cost contributes more to total cost. That is why AWS built Inferentia, a chip dedicated to inference.

For services with heavy inference traffic, inference cost often overwhelms training cost. A model is trained once, but inference repeats endlessly with every user request. This is the background to AWS designing Inferentia, an inference-only chip, separately from GPUs, and the goal is to lower total cost of ownership by serving the same model at a lower unit price and lower power than GPUs. It is why an ML engineer needs the sense of "choosing training chips and inference chips separately."

Training computes gradients with a forward pass plus a backward pass and processes large batches at once (throughput-oriented), whereas inference does only the forward pass and processes small batches frequently with low latency (latency-oriented). Because of this difference, it is reasonable to separate Trainium (high-throughput training) and Inferentia (low-latency inference) at the chip level.

## Choosing a Layer from a Scenario

Exam questions are almost always scenarios. The decision flow is:

```
Read the scenario
   │
   ├─ Is it a standard task like image/speech/translation/OCR/sentiment?
   │     Yes → AI services (Rekognition, Comprehend, Textract ...)
   │           └─ Do we need our company's own classification/objects?
   │                 Yes → Comprehend Custom / Rekognition Custom Labels
   │
   ├─ Do we need to build a custom model with our own data?
   │     Yes → SageMaker (train → tune → deploy)
   │
   └─ Is it extreme cost/performance optimization or existing container integration?
         Yes → EC2 GPU / Trainium (training) / Inferentia (inference) / EKS·ECS
```

Quick mapping practice:

| Scenario | Answer direction |
|---------|----------|
| Extract line items from scanned invoices | Textract |
| Classify images of our own product's defects | Rekognition Custom Labels or SageMaker |
| Millions of inferences at minimum cost | Inferentia |
| Train a large-scale model at low cost | Trainium |
| Convert call center recordings to text and analyze sentiment | Transcribe + Comprehend combination |
| Generate chatbot answers from internal documents | Bedrock |

> ⚠️ **Trap**: "Training it yourself with SageMaker for a standard task" tends to be a wrong answer on the exam. Even if it is technically possible, the time, cost, and operational burden are excessive. Conversely, "using the basic AI service for domain-specific data" is also wrong. First look for the clue in the passage that separates **generality vs. uniqueness of the task**.

## Clues in the Passage That Separate the Layers

Scenario questions are ultimately decided by a few words. Learning the clues in a table in advance speeds up your reading.

| Clue in the passage | Layer it points to | Reason |
|----------|-----------|------|
| "No ML specialists" | AI services | API only, no training |
| "Launch as quickly as possible" | AI services | Shortest implementation time |
| "Standard image/speech/translation task" | AI services | A pre-trained model is enough |
| "Our company's own classification scheme" | Custom family or SageMaker | Domain labels are needed |
| "Train a model on our own data" | SageMaker | Custom training is the core |
| "Implement the algorithm ourselves" | SageMaker script mode/custom container | Code control is needed |
| "Minimize inference cost" | Inferentia | Inference-only chip |
| "Reduce large-scale training cost" | Trainium, Spot instances | Training-side optimization |
| "Already running EKS/ECS" | ML infrastructure layer | Integrates with the existing container platform |
| "Minimize operational burden" | Upper layers | The more managed, the lighter the burden |

## Losses from Choosing the Wrong Layer

| Wrong choice | Cost |
|-----------|------|
| Training standard sentiment analysis yourself with SageMaker | Labeling, training, and operations cost several times more, and accuracy tends to be lower than a pre-trained model |
| Domain-specific defect detection with basic Rekognition | The model does not know our product's defect types |
| Building EC2 GPUs yourself for small-scale inference | Idle cost and operations staff are wasted |
| Serving high-volume inference on GPUs only | Disadvantage in unit price and power compared with Inferentia |

> ⚠️ **Trap**: "The most accurate method" and "the most appropriate method" are different. The exam treats **the choice with the least effort and cost that satisfies the requirements** as the correct answer. When several answers are technically possible, filter them by operational burden.

In the next article, we dig into SageMaker, the center of this stack, and look at Studio, training, inference, built-in algorithms, and the domain and user profile structure.

## 📖 Glossary

- **AI services** : Top-layer services that let you use models AWS has pre-trained through API calls alone. No training is needed.
- **Pre-trained model** : A model that has already been trained on large amounts of data and is ready to use right away.
- **Abstraction level** : How much of the detail is hidden. The higher it is, the more convenient it is, but the less you can touch.
- **Customization** : Adapting a model to your own data and requirements. Limited with AI services, flexible with SageMaker.
- **Comprehend Custom** : A feature that fine-tunes Comprehend with your company's own labels to build custom classification and entity extraction.
- **Rekognition Custom Labels** : A feature that trains the service on images of specific-domain objects that a general model does not know.
- **Trainium (Trn1)** : AWS's training-only chip. Its goal is to lower the cost of training large-scale models.
- **Inferentia (Inf2)** : AWS's inference-only chip. It lowers the unit price and power of inference that repeats on every request.
- **Forward pass / backward pass** : Computation that flows the input through to produce a prediction / computation that sends the error backward to fix the weights.
- **Throughput vs. latency** : How much is processed per unit time / how quickly a single request finishes.

## 📝 Practice Questions

**Question 1.** For the standard requirement "analyze positive/negative sentiment in English customer review text," which AWS service is most appropriate?

A) Train a sentiment analysis model directly in SageMaker  
B) Call Amazon Comprehend's sentiment analysis API  
C) Build a custom model on EC2 GPU instances  
D) Amazon Polly  

**Answer: B**  
Explanation: Standard sentiment analysis is solved immediately with a Comprehend API call to a pre-trained model. Training directly in SageMaker or building on EC2 would be overkill, wasting time and cost. Polly converts text to speech (TTS), unrelated to sentiment analysis.

---

**Question 2.** Which correctly describes the characteristic as you move up the 3-layer AWS ML stack (toward AI Services)?

A) Control increases and more needs direct management  
B) Abstraction rises making it faster and easier, but control decreases  
C) Cost is always higher  
D) More ML expertise is required  

**Answer: B**  
Explanation: Moving up (toward AI Services) increases abstraction for faster, easier use but reduces control over customization. Control increases going down (toward infrastructure). Cost depends on workload, not layer. ML expertise is less needed for higher layers, not more.

---

**Question 3.** An ML engineer minimizing inference cost for massive traffic should consider which AWS custom chip?

A) AWS Trainium  
B) AWS Inferentia  
C) FSx for Lustre  
D) Elastic Block Store  

**Answer: B**  
Explanation: Inferentia (Inf2) is AWS's inference-specific chip designed to lower per-unit inference cost and power. Trainium is for training only. FSx for Lustre is a high-speed training data filesystem, and EBS is block storage — neither addresses inference cost reduction.

---

**Question 4.** What's the defining difference between SageMaker and AI Services (Rekognition, Comprehend, etc.)?

A) SageMaker only allows API calls  
B) SageMaker trains and tunes custom models directly on your data and deploys them  
C) SageMaker doesn't support model training  
D) AI Services always provide more control than SageMaker  

**Answer: B**  
Explanation: SageMaker is an ML platform managing the full pipeline — data prep, training, tuning, deployment, monitoring — with custom data. API calls only are AI Services' characteristic. SageMaker's core is training support. AI Services have less control than SageMaker.

---

**Question 5.** What makes it rational to design training and inference chips separately?

A) Training and inference have the same computational characteristics  
B) Training does forward+backward passes for throughput, inference does forward passes only for low latency — different characteristics justify separate chips  
C) Inference happens far less frequently than training  
D) To equalize chip prices  

**Answer: B**  
Explanation: Training includes backward passes for gradient computation, processes large batches for throughput. Inference does forward passes only, serves small batches frequently with low latency. This computational difference justifies Trainium (training) and Inferentia (inference) separation. Inference is actually more frequent (per request), not less. Chip separation optimizes for workload characteristics, not price parity.

---
