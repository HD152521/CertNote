# Day 2 - Amazon SageMaker: A Platform for Directly Training and Deploying ML Models

Yesterday's Bedrock was "a service renting large models others created." Today's **Amazon SageMaker** is the opposite character: **a fully managed ML platform where you directly create, train, and deploy machine learning models**.

The AIF-C01 exam doesn't ask deep technical details of SageMaker. Instead, it asks the big picture: **"When is it Bedrock and when is it SageMaker?"** and how SageMaker supports the entire ML lifecycle. Today we capture that big picture.

## SageMaker Covers the Entire ML Lifecycle

Traditional ML projects go through data prep → training → evaluation → deployment → monitoring. SageMaker provides tools at each stage.

| ML Stage | SageMaker Tool (Examples) | What It Does |
|---------|--------------------|---------|
| Data Preparation | Data Wrangler, Ground Truth | Data cleaning, labeling |
| Dev Environment | SageMaker Studio | Notebook-based integrated dev environment |
| Model Training | Training Jobs | Run training on managed infrastructure |
| Automation | Autopilot | Generate models automatically via AutoML |
| Deployment | Endpoints | Host real-time and batch inference |
| Operations | Model Monitor | Monitor deployed model quality and drift |

The key point: SageMaker is **"manages infrastructure but I control the model itself."** You set the algorithm, hyperparameters, and data for training.

> 💡 **Related theory**: SageMaker is "managed," not "serverless abstraction." With Bedrock, you just call an API without knowing the model interior, but with SageMaker, you design the ML workflow (data, training, evaluation) yourself. In exchange, SageMaker handles "tedious infrastructure work" like GPU cluster provisioning, distributed training setup, and scaling. This difference is the exam criterion separating the two services.

## SageMaker JumpStart: Providing a Starting Point

Building a model from scratch is intimidating. **SageMaker JumpStart** provides pre-trained models and solution templates in a catalog for fast starts.

What you can do with JumpStart:

- Deploy publicly available pre-trained models (image classification, text generation, etc.) in a few clicks
- Import foundation models and **fine-tune with my data**
- Use example templates for common ML solutions

JumpStart can feel like "a bridge between Bedrock and SageMaker." You work with FMs but **host and fine-tune them yourself in the SageMaker environment, with deeper control**, unlike pure Bedrock.

> 📚 **Case study**: A manufacturing company needed a defective product image classification model. Instead of designing a neural network from scratch, they brought a pre-trained image classification model from JumpStart and fine-tuned it with thousands of their own defective images. Days were sufficient, and they controlled their own data and model internally. This was a case where JumpStart answered "use FM but keep it under my control."

## Training and Deployment: Training Jobs and Endpoints

SageMaker's two pillars are **training** and **inference**.

- **Training Jobs**: Automatically spin up training instances, train a model, and clean up when done. You only pay during training.
- **Endpoints (Inference)**: Host trained models to receive prediction requests. Choose inference method by task nature.

| Inference Method | Characteristics | Best For |
|-----------|------|-------------|
| Real-time | Always-on endpoint, low latency | Immediate response needed (recommendations, fraud detection) |
| Serverless | Zero cost when no traffic | Sporadic, irregular traffic |
| Batch | Process large data at once | Nightly batch predictions |
| Asynchronous | Large input, long processing time OK | Large file processing |

> 🔍 **Going deeper**: Real-time endpoints cost money even idle. So for traffic that fluctuates, serverless inference is cost-effective; for daily scheduled data accumulation processing, batch transform is cost-efficient. On the exam, clues like "sporadic traffic" or "nightly bulk processing" indicate which inference method fits.

## So When Is It Bedrock and When Is It SageMaker?

This is today's essence and an exam classic.

| Criterion | Amazon Bedrock | Amazon SageMaker |
|------|----------------|------------------|
| Nature | Rent FM via API | Build and operate your own ML model |
| Infrastructure | Fully abstracted (serverless) | Managed but I design |
| Control Level | Low (prompts and settings only) | High (data, algorithm, deployment) |
| Required Expertise | Low | Relatively high (data science) |
| Representative Work | Chatbots, summaries, content generation | Custom predictive models, specialized model training |

The decision criterion is simple: **"Is an existing large model enough (Bedrock)?"** vs **"Do I need to build and control my own model with my data (SageMaker)?"** For fast generative AI features, use Bedrock; for domain-specific predictive models operated with fine control, use SageMaker.

> 💡 **Related theory**: They're complementary, not competing. Many enterprises run generative features via Bedrock and traditional ML like sales forecasting or anomaly detection via SageMaker together. On the exam, "manage multiple FMs without overhead" usually means Bedrock, while "deploy and monitor custom models trained on my data" usually means SageMaker.

## Wrapping Up

Today's picture is this: **SageMaker** is a platform supporting the entire ML lifecycle from data prep through training, deployment, and monitoring. **JumpStart** lets you quickly start or fine-tune pre-trained models, **Training Jobs** do the training, and **Endpoints** host inference. And the key: **Bedrock rents FMs; SageMaker builds and controls your own models**.

From next session, we'll see AWS's domain-specific managed AI services (Rekognition, Textract, Comprehend, Transcribe, Polly, Translate). These process images, documents, text, and speech with a single API call—no model building needed.

---

## 📝 연습 문제

**问题 1.** A team wants to directly train a custom predictive model using their company's unique data and continuously monitor model quality post-deployment. What is the most appropriate service?

A) Amazon Bedrock  
B) Amazon SageMaker  
C) Amazon Polly  
D) Amazon Translate  

**정답: B**  
해설: SageMaker covers the entire ML lifecycle from data prep to training, deployment, and monitoring, ideal for controlling custom models with your own data. A focuses on renting existing FMs via API. C is speech synthesis, D is translation—both unrelated to custom model training.

---

**문제 2.** Which most accurately explains the difference between Bedrock and SageMaker?

A) Bedrock trains models directly, SageMaker only calls APIs  
B) Bedrock rents FMs via API; SageMaker builds and operates your own models  
C) They're completely the same service  
D) SageMaker doesn't support generative AI at all  

**정답: B**  
해설: Bedrock is an abstracted-infrastructure FM rental service, while SageMaker is an ML platform where you control data, algorithms, and deployment. A reverses their roles. C is clearly different services. D is wrong because JumpStart handles FMs too.

---

**문제 3.** You want to quickly deploy pre-trained models and solution templates from a catalog or fine-tune them with your company's data. Which SageMaker feature is this?

A) Model Monitor  
B) JumpStart  
C) Data Wrangler  
D) Batch Transform  

**정답: B**  
해설: JumpStart provides pre-trained models and solution templates for fast starts and fine-tuning. A monitors quality/drift post-deployment. C cleans data. D is a batch inference method—all different from catalog-based starting.

---

**문제 4.** You want to process large accumulated data at a set time each night. What's the most cost-effective inference method?

A) Real-time endpoint  
B) Batch Transform  
C) Retrain the model each time  
D) Manually operate an always-on GPU instance  

**정答: B**  
해설: Batch Transform is cost-effective for regularly processing accumulated data at once. A stays on, incurring cost even idle. C is training, not inference. D carries operational burden and cost.

---

**問題 5.** Traffic is irregular and sporadic; you want costs near zero when there are no requests. What inference method suits this scenario?

A) Serverless inference  
B) Always-on real-time endpoint  
C) Batch Transform  
D) Asynchronous inference is the only option  

**정답: A**  
해설: Serverless inference incurs no cost when idle, fitting sporadic, irregular traffic. B incurs idle cost. C is for bulk batch processing. D is for large input/long processing—a separate method not precisely matching "sporadic traffic" cue.

---
