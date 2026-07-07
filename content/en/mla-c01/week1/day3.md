# Day 3 - The AWS ML Stack at a Glance

Having identified the ML problem, it is now time to choose the tools. AWS has dozens of ML-related services, which feels overwhelming at first. But in fact they organize neatly into **three layers**. Answering the question "Will you build the model yourself, call a finished model via API, or manage the underlying infrastructure directly?" determines which layer to use.

Today we take a bird's-eye view of this three-layer stack — AI services, the ML platform (SageMaker), and infrastructure — look at when an ML engineer chooses each layer, and how to determine "what should be used for this scenario" on the exam.

## The Three-Layer Structure of the AWS ML Stack

```
┌─────────────────────────────────────────────────┐
│ Top: AI services (pre-trained models, API calls only) │
│   Rekognition, Comprehend, Transcribe,           │
│   Translate, Polly, Textract, Forecast, Bedrock  │
├─────────────────────────────────────────────────┤
│ Middle: ML platform (train & deploy yourself)     │
│   Amazon SageMaker (AI)                          │
├─────────────────────────────────────────────────┤
│ Bottom: ML infrastructure (manage compute directly) │
│   EC2(GPU), Inferentia, Trainium, EKS, ECS, FSx  │
└─────────────────────────────────────────────────┘
```

The guiding principle is the **trade-off between abstraction level and control**. The higher you go, the faster and easier it is but with less control; the lower you go, the more freedom you have but the more you must manage yourself. The ML engineer chooses: "for standard tasks that require no ML expertise, go up; if a custom model is needed, go middle; if extreme performance/cost optimization is required, go down."

> 💡 **Related theory**: This is the ML version of the shared responsibility model we saw on Day 1. With AI services, AWS is responsible for everything up to model training and infrastructure, while the customer handles only API calls and data; with SageMaker, the customer owns the model code and data but AWS manages the infrastructure; with self-built EC2, the customer is responsible for almost everything. The principle that the responsibility boundary moves up as abstraction increases applies exactly here.

## Top Layer: AI Services — Using ML Capabilities Without a Model

AI services let you use models that AWS has pre-trained with **a single API call**. Almost no ML knowledge is required. Memorizing the mappings that frequently appear on the exam makes scenario questions easy.

| Service | Input → Output | Use case |
|--------|-----------|------|
| Rekognition | Images/video → objects, faces, text | Image analysis, content moderation |
| Comprehend | Text → sentiment, entities, key phrases | NLP, sentiment analysis |
| Transcribe | Speech → text | Speech recognition (STT) |
| Polly | Text → speech | Speech synthesis (TTS) |
| Translate | Text → translated text | Machine translation |
| Textract | Document images → structured text | OCR, form extraction |
| Forecast | Time series → future predictions | Demand forecasting |
| Personalize | User behavior → recommendations | Recommendation systems |
| Bedrock | Prompt → generated output | Generative AI (LLMs) |

```python
import boto3

# Sentiment analysis with Comprehend — zero lines of model training
comprehend = boto3.client("comprehend", region_name="ap-northeast-2")
resp = comprehend.detect_sentiment(
    Text="This product is really satisfying and shipping was fast too!",
    LanguageCode="en",
)
print(resp["Sentiment"])         # POSITIVE
print(resp["SentimentScore"])    # {'Positive': 0.98, ...}
```

There is no training data and no model in the code above. It merely calls AWS's pre-trained model. If the scenario is "analyze customer review sentiment" and you answer "build a model with SageMaker," that is overkill — Comprehend is the correct answer.

> 🔍 **Going deeper**: Some AI services can be customized. Comprehend supports **Custom Classification/Entity Recognition** for fine-tuning with your own labels, and Rekognition supports **Custom Labels** for training on domain-specific objects. The decision rule is: "for standard sentiment analysis, use base Comprehend; if your company needs its own classification taxonomy, use Custom." Even then, it takes far less effort than a full custom build on SageMaker.

## Middle Layer: SageMaker — Where You Build Models Yourself

When you need a custom model that standard AI services cannot provide, the answer is **Amazon SageMaker**. It is an integrated platform covering the entire ML lifecycle, from data preparation through training, tuning, deployment, and monitoring. It is the de facto protagonist of MLA-C01 — most exam questions ask about some SageMaker capability.

What SageMaker provides, organized by lifecycle stage:

- **Data**: Data Wrangler (preprocessing), Feature Store (feature storage), Ground Truth (labeling)
- **Training**: 17 built-in algorithms, custom containers, distributed training, Automatic Model Tuning
- **Deployment**: Real-time endpoints, batch transform, serverless inference, multi-model endpoints
- **Operations**: Model Monitor (drift), Model Registry, Pipelines (MLOps)

```python
# SageMaker "trains directly" — the decisive difference from AI services
from sagemaker.estimator import Estimator

estimator = Estimator(
    image_uri=sagemaker.image_uris.retrieve("xgboost", region, "1.7-1"),
    role=role, instance_count=1, instance_type="ml.m5.xlarge",
    hyperparameters={"objective": "binary:logistic", "num_round": 100},
)
estimator.fit({"train": "s3://my-bucket/train/", "validation": "s3://my-bucket/val/"})
predictor = estimator.deploy(initial_instance_count=1, instance_type="ml.t2.medium")
```

We cover SageMaker in depth tomorrow (Day 4). For today, it is enough to fix its position: "SageMaker is the middle layer where you train and deploy custom models yourself."

## Bottom Layer: ML Infrastructure — Squeezing Performance and Cost Directly

Beneath what SageMaker abstracts away lies the actual compute. You work at this layer directly when you need extreme performance/cost optimization or need to run ML on existing EKS/ECS.

| Chip/Resource | Use case | Characteristics |
|----------|------|------|
| EC2 GPU (P5/P4, G5) | General-purpose training & inference | NVIDIA GPUs, most flexible |
| AWS Trainium (Trn1) | Large-scale model training | AWS custom chip, lower training cost |
| AWS Inferentia (Inf2) | Large-scale inference | AWS custom chip, lower inference cost & power |
| Elastic Inference | Partial inference acceleration attachment | Rent only a slice of GPU to cut cost |
| FSx for Lustre | High-speed training data | S3-integrated high-performance file system |

The key distinction is that **Trainium is for training and Inferentia is for inference**. Inference happens far more often than training (on every request), so reducing inference cost contributes more to total cost. That is why AWS built Inferentia, a dedicated inference chip.

> 📚 **Case study**: For services with large inference traffic, inference cost often dwarfs training cost. A model is trained once, but inference repeats endlessly with every user request. This is the background for AWS designing Inferentia — a dedicated inference chip separate from GPUs — with the goal of serving the same model at a lower unit cost and power draw than GPUs, thereby lowering total cost of ownership. This is why an ML engineer needs the instinct of "choosing training chips and inference chips separately."

> 💡 **Related theory**: Training and inference have different computational characteristics. Training computes gradients via forward + backward passes and processes large batches at once (throughput-oriented), whereas inference performs only forward passes and frequently processes small batches at low latency (latency-oriented). Because of this difference, separating Trainium (high-throughput training) and Inferentia (low-latency inference) at the chip level makes sense.

## Choosing a Layer by Scenario

Exam questions are almost always scenarios. The decision flow, summarized:

1. **Is it a standard task (image/speech/translation/OCR/sentiment)?** → AI services (Rekognition, Comprehend...)
2. **Is a custom model needed?** → SageMaker
3. **Extreme performance/cost, or integration with existing containers?** → EC2/Inferentia/Trainium/EKS

Examples: "Extract line items from scanned invoices" → Textract. "Classify images of our proprietary product defects" → Rekognition Custom Labels or SageMaker. "Run millions of inferences at minimum cost" → Inferentia.

## Wrapping Up

Two key takeaways today. First, the AWS ML stack has three layers — **AI services (API calls) → SageMaker (train yourself) → infrastructure (manage compute directly)** — and you choose based on the trade-off between abstraction level and control. Second, at the infrastructure layer the chips are split: **Trainium for training, Inferentia for inference**.

In the next article we dive fully into SageMaker, the center of this stack, and look at Studio, training, inference, built-in algorithms, and the domain and user profile structure.

---

## 📝 연습 문제

**문제 1.** For the standard requirement "analyze the positive/negative sentiment of English review text left by customers," which AWS service is most appropriate?

A) Train a sentiment analysis model directly in SageMaker  
B) Call Amazon Comprehend's sentiment analysis API  
C) Build a model directly on an EC2 GPU instance  
D) Amazon Polly  

**정답: B**  
해설: Standard sentiment analysis is solved immediately by calling the API of Comprehend, a pre-trained model. Training directly in SageMaker or building on EC2 is overkill for a standard task and wastes time and money. Polly is a text-to-speech (TTS) service and has nothing to do with sentiment analysis.

---

**문제 2.** In the three-layer AWS ML stack, which characteristic appears as you move up (toward AI services)?

A) Control increases and you have more to manage yourself  
B) Abstraction increases, making things fast and easy, but control decreases  
C) It is always more expensive  
D) More ML expertise is required  

**정답: B**  
해설: The higher you go (toward AI services), the higher the abstraction, making things fast and easy to use, but control — such as model customization — decreases. Increasing control is the downward (infrastructure) direction, cost depends on the workload, and higher-level services require less ML expertise.

---

**문제 3.** An ML engineer needs to minimize the cost of large-scale inference traffic. Which AWS custom chip should be considered?

A) AWS Trainium  
B) AWS Inferentia  
C) FSx for Lustre  
D) Elastic Block Store  

**정답: B**  
해설: Inferentia (Inf2) is an AWS chip designed exclusively for inference, lowering inference unit cost and power draw. Trainium is a training-only chip, FSx for Lustre is a file system for high-speed training data, and EBS is block storage — none of them targets inference cost reduction.

---

**문제 4.** What is the decisive difference that distinguishes SageMaker from AI services (Rekognition, Comprehend, etc.)?

A) SageMaker only allows API calls  
B) SageMaker trains, tunes, and deploys models directly with custom data  
C) SageMaker does not support model training  
D) AI services always offer more control than SageMaker  

**정답: B**  
해설: SageMaker is an ML platform that handles the whole cycle — data preparation, training, tuning, deployment, and monitoring — with full customization. Calling APIs only is the hallmark of AI services, SageMaker supports training as its core capability, and SageMaker offers more control than AI services, not less.

---

**문제 5.** Which is the correct reason it makes sense to design separate chips for training and for inference?

A) Because training and inference have identical computational characteristics  
B) Because training is a high-throughput workload that includes backpropagation, while inference is a low-latency workload that runs only forward passes — their characteristics differ  
C) Because inference happens far less often than training  
D) To make the two chips the same price  

**정답: B**  
해설: Training computes gradients through forward and backward passes and processes large batches (throughput-oriented), while inference runs only forward passes and frequently processes small batches at low latency (latency-oriented). This difference in computational characteristics is why Trainium (training) and Inferentia (inference) are separated. Inference actually happens more frequently, repeating with every user request, and the purpose of separating chips is per-workload optimization, not price uniformity.

---
