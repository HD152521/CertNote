# Day 3 - AWS ML Stack at a Glance

Now that you've identified the ML problem, it's time to choose your tools. AWS has dozens of ML-related services, which feels overwhelming at first. But in reality, they're organized cleanly into **three layers**. Answer the question "Will you build a model from scratch, call pre-trained models via API, or manage bare infrastructure?" and you'll know which layer to use.

Today, we'll survey this 3-layer stack — AI Services, ML Platform (SageMaker), and Infrastructure — see when ML engineers choose each layer, and learn how to identify in exam scenarios "which tool should we use?"

## AWS ML Stack: The 3-Layer Structure

```
┌─────────────────────────────────────────────────┐
│ Top: AI Services (Pre-trained models, API calls only)│
│   Rekognition, Comprehend, Transcribe,           │
│   Translate, Polly, Textract, Forecast, Bedrock  │
├─────────────────────────────────────────────────┤
│ Middle: ML Platform (Train & deploy directly)    │
│   Amazon SageMaker (AI)                          │
├─────────────────────────────────────────────────┤
│ Bottom: ML Infrastructure (Direct compute mgmt)  │
│   EC2(GPU), Inferentia, Trainium, EKS, ECS, FSx  │
└─────────────────────────────────────────────────┘
```

The selection principle is the **tradeoff between abstraction level and control**. Go higher and it's faster and easier, but less control. Go lower and you're more free, but you handle more directly. ML engineers choose: "Top for standard tasks that don't need ML expertise, Middle for custom models, Bottom for extreme performance/cost optimization."

> 💡 **Related Theory**: This is the ML version of the shared responsibility model from Day 1. AI Services have AWS handling model training and infrastructure; the customer calls APIs and provides data. SageMaker has the customer handling model code and data while AWS manages infrastructure. Self-managed EC2 puts almost everything on the customer. As abstraction rises, the responsibility boundary moves up.

## Top Layer: AI Services — ML Capabilities Without Models

AI Services use pre-trained models **with a single API call**. You need almost no ML knowledge. Memorizing common mappings helps exam scenario questions.

| Service | Input → Output | Use Case |
|--------|-----------|------|
| Rekognition | Image/Video → Objects, Faces, Text | Image Analysis, Content Moderation |
| Comprehend | Text → Sentiment, Entities, Keywords | NLP, Sentiment Analysis |
| Transcribe | Audio → Text | Speech Recognition (STT) |
| Polly | Text → Speech | Text-to-Speech (TTS) |
| Translate | Text → Translated Text | Machine Translation |
| Textract | Document Image → Structured Text | OCR, Form Extraction |
| Forecast | Time Series → Future Prediction | Demand Forecasting |
| Personalize | User Behavior → Recommendations | Recommendation System |
| Bedrock | Prompt → Generated Content | Generative AI (LLM) |

## Summary

Two key takeaways today. First, the AWS ML stack is **AI Services (API calls) → SageMaker (train directly) → Infrastructure (direct compute)**, with tradeoffs between abstraction and control. Second, at the infrastructure layer, chips are split: **Trainium for training, Inferentia for inference**.

Tomorrow we'll dive deep into the heart of this stack — SageMaker itself.

---

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
