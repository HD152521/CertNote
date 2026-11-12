# Day 2 - Amazon SageMaker: A Platform for Directly Training and Deploying ML Models

## 📌 Key Takeaways

- **Amazon SageMaker AI** (formerly Amazon SageMaker) is a fully managed ML platform that helps with the entire ML lifecycle, from data preparation through training, deployment, and monitoring.
- The service manages the infrastructure, but **you decide the data, the algorithm, and the deployment method.** Bedrock is about renting FMs, while SageMaker is about building and controlling your own models.
- **JumpStart** is a catalog of pre-trained models and solution templates. You pick one and deploy it right away, or fine-tune it on your own data.
- There are four inference methods. Use **real-time** for immediate responses, **serverless** for intermittent traffic, **asynchronous** for large inputs and long processing, and **batch transform** for processing accumulated data in bulk.
- Costs come from the instance hours while training and the hours an endpoint is up. A real-time endpoint is billed even when there are no requests.

## SageMaker Covers the Entire ML Lifecycle

Yesterday's Bedrock was a service for "renting a huge model someone else built." Today's SageMaker is the opposite in character: a platform where **you build, train, and deploy your own machine learning models**. The AIF-C01 exam does not ask about deep SageMaker technology. Instead it asks, as a big picture, **"when is it Bedrock and when is it SageMaker,"** and how SageMaker helps across the whole ML lifecycle.

- Let's sort out the name first. The current official name is **Amazon SageMaker AI**, and the exam guide uses this name. Even if a question or document says just "Amazon SageMaker," you can take it to mean the same ML platform.

A traditional ML project goes through a long journey: data preparation → training → evaluation → deployment → monitoring. SageMaker provides tools for each of these stages.

| ML stage | SageMaker tool (examples) | What it does |
|---------|--------------------|---------|
| Data preparation | Data Wrangler, Ground Truth | Data cleaning, labeling |
| Development environment | SageMaker Studio | Notebook-based integrated development environment |
| Model training | Training Jobs | Runs training on managed infrastructure |
| Automation | Autopilot | Automatically generates models with automated ML (AutoML) |
| Deployment | Endpoints | Hosts real-time and batch inference |
| Operations | Model Monitor | Watches model quality and drift after deployment |

The key point is that SageMaker **"manages the infrastructure for you, but I control the model itself."** You decide the algorithm, hyperparameters, and data used for training.

There are several more tools that the exam guide names directly. It is enough to pair each name with a one-line role.

| Tool | One-line role | Cue to recall |
|------|------|------|
| Feature Store | Stores and shares features so training and inference use the same features | "Feature reuse," "consistency between training and serving" |
| Clarify | Measures bias in data and models and explains the reasons for predictions | "Fairness," "explainability" |
| Model Cards | Records a model's purpose, limits, and evaluation results as a document | "Transparency," "model documentation," "governance" |
| Model Monitor | Watches for changes (drift) in data and quality in production | "Detecting performance degradation after deployment" |
| Canvas | A no-code tool for building models on screen without writing code | "Analysts who are not ML experts" |

> 💡 **Related theory**: SageMaker is "managed," not a "serverless abstraction." With Bedrock you only need to call an API without knowing anything about the model's internals, but with SageMaker you design the ML workflow (data, training, evaluation) yourself. In exchange, SageMaker takes over the "tedious infrastructure work" such as provisioning GPU clusters, configuring distributed training, and scaling. This difference is the criterion that separates the two services on the exam.

By analogy, Bedrock is **a restaurant where you order a finished dish**, and SageMaker is **a shared kitchen fully equipped with burners and cooking tools**. The kitchen maintains the equipment, but you bring the ingredients (data) and the recipe (algorithm), and in return you can make it to your own taste.

## SageMaker JumpStart: Providing a Starting Point

Building a model from scratch is a burden. **SageMaker JumpStart** offers pre-trained models and solution templates as a catalog so you can get started quickly.

What you can do with JumpStart:

- Deploy publicly available pre-trained models (image classification, text generation, and so on) in a few clicks
- Take a foundation model and **fine-tune it on your own data**
- Use example templates for common ML solutions

JumpStart may feel like "a bridge between Bedrock and SageMaker." It works with FMs, but the difference is that in the SageMaker environment **you host and fine-tune them yourself, with deeper control**.

| Aspect | Using an FM in Bedrock | Using an FM through JumpStart |
|------|------|------|
| Where the model runs | A shared service operated by AWS | A SageMaker endpoint in your account (on the instance you chose) |
| Billing | Mostly token usage | Instance hours while the endpoint is up |
| Operational burden | Almost none | You decide instance type, count, and scaling |
| Why you pick it | Fast start, minimal management | Using public (open-source) models, deep control over infrastructure and tuning |

- Whether fine-tuning and evaluation are possible differs by model, and for third-party models **the user must check the license terms**.
- The exam guide divides the ways of using an FM into a "managed API service" and a "self-hosted API." The former is Bedrock, and the latter is JumpStart and SageMaker endpoints.

As a hypothetical example, a manufacturing company needed a defective-product image classification model. Instead of designing a neural network from scratch, it took a pre-trained image classification model from JumpStart and fine-tuned it on several thousand of its own defect images. A few days were enough, and it could keep its own data and model inside the company under its own control. This is a case where JumpStart answered the requirement "I want to use an FM but keep it under my control."

## Training and Deployment: Training Jobs and Endpoints

SageMaker's two pillars are **training** and **inference**.

- **Training Jobs**: Automatically start training instances, train the model, and clean up the instances when finished. You pay only while training.
- **Endpoints (inference)**: Host the trained model and receive prediction requests. You choose the inference method according to the nature of the work.

| Inference method | Characteristics | Fits when |
|-----------|------|-------------|
| Real-time | Always-on endpoint, low latency | An immediate response is needed (recommendations, fraud detection) |
| Serverless | Zero cost when there is no traffic | Intermittent, irregular traffic |
| Batch (Batch Transform) | Processes a large amount of data at once | Nightly batch predictions |
| Asynchronous | Allows large inputs and long processing times | Processing large files |

A real-time endpoint is "always on," so it costs money even with no traffic. That is why serverless inference is cost-efficient when traffic is uneven, and batch transform is cost-efficient when you process data that accumulates at a fixed time each day all at once. When the exam gives clues such as "intermittent traffic" or "nightly bulk processing," it is asking which inference method applies.

The four methods are the items that the latest exam guide names directly as "types of inference" (batch, real-time, asynchronous, serverless). You do not need to memorize the numbers, but looking at the order of the limits' sizes shows why they are divided this way.

| Method | How you get the response | Size and time limit of one request | When there are no requests |
|------|------|------|------|
| Real-time | You get a response immediately on invocation | About 25 MB payload, about 60 seconds of processing | The instance stays up, so you are billed |
| Serverless | You get a response immediately on invocation | 4 MB payload, 60 seconds of processing | No charge during idle time |
| Asynchronous | The request is put in a queue and you receive the result later | 1 GB payload, up to 1 hour of processing | The instance can be scaled down to 0 |
| Batch transform | You run a job and receive result files | GB-scale datasets, even multi-day processing is possible | There is no always-on endpoint at all |

Two questions are enough to leave one answer.

```
① Do you need the answer right now?
   ├─ Yes ─► ② Is the traffic steady?
   │          ├─ Steady / latency is very important ──► Real-time
   │          └─ Occasional, irregular ───────────────► Serverless
   └─ No ──► ② Is all the data already accumulated?
              ├─ Accumulated (a bundle of files) ─────► Batch transform
              └─ Requests arrive one by one, large and slow ─► Asynchronous
```

- The cue that separates serverless from asynchronous is **size and time**. If there is only "intermittent," it is serverless; if "large file" or "tens of minutes of processing" is attached, it is asynchronous.
- A serverless endpoint that has been idle may incur a warm-up time (cold start) when it receives its first request. If you are very sensitive to latency, real-time is the right choice.
- The cue that separates asynchronous from batch transform is **the shape in which requests arrive**. If users upload items one at a time, it is asynchronous; if you run what has piled up in a warehouse all at once, it is batch.

## So When Is It Bedrock and When Is It SageMaker?

This distinction is the core of today.

| Criterion | Amazon Bedrock | Amazon SageMaker |
|------|----------------|------------------|
| Nature | Rent an FM through an API | Build and operate your own ML model |
| Infrastructure | Fully abstracted (serverless) | Managed, but I design it |
| Level of control | Low (prompts and settings only) | High (data, algorithm, deployment) |
| Expertise needed | Low | Relatively high (data science) |
| Representative work | Chatbots, summarization, content generation | Custom prediction models, training specialized models |

The decision criterion is simple. **"Is an existing huge model enough (Bedrock)"** vs **"Do I need to build and control my own model with my own data (SageMaker)."** If you want to quickly add a generative AI feature, use Bedrock. If you need to operate a domain-specific prediction model under fine-grained control, use SageMaker.

> 💡 **Related theory**: The two are complementary, not competing. Many companies run generative features on Bedrock and traditional ML such as sales forecasting and anomaly detection on SageMaker side by side. On the exam, splitting "several FMs without management" to Bedrock and "deploy and monitor a custom model trained on your own data" to SageMaker is usually right.

**Common misconceptions.**

- "SageMaker is only for traditional ML and has nothing to do with generative AI" → No. You deploy and fine-tune foundation models with JumpStart.
- "You cannot change the model at all in Bedrock" → No. Bedrock also has fine-tuning and distillation. The difference is **how deeply you control it**. If you must decide the training code, the algorithm, and even the instances yourself, it is SageMaker.
- "It is managed, so the cost is minimized automatically" → No. Endpoints and notebooks you leave on are billed even when not in use.
- "Even numeric prediction on tabular data is better with an FM these days" → The exam asks the opposite. Prediction under regulation, explainability, or operational constraints may suit a traditional ML model, and SageMaker is the stage for that.

## Where the Costs Come From

| Item | When it is billed | How to reduce it |
|------|------|------|
| Training (Training Jobs) | While the training instances are running | They are cleaned up automatically when the job ends. Do not pick an instance larger than needed |
| Real-time endpoint | The entire time it is up (even with 0 requests) | Switch to serverless if intermittent, or batch if bulk |
| Serverless inference | As much as it processes requests | Use it for intermittent traffic whose latency requirement is not strict |
| Asynchronous inference | Instance hours while processing | Configure it to scale down to 0 when there are no requests |
| Batch transform | While the job runs | No always-on endpoint is needed |
| Notebook and Studio | While they are on | Stop them when not in use |
| Storage | S3 capacity holding data and model artifacts | Clean up unneeded outputs |

## Scenario → Answer Decision Table

| Clue in the question | Answer | Eliminated option and why |
|------|------|------|
| "Train, deploy, and monitor a custom prediction model on your own data" | SageMaker | Bedrock: its focus is renting FMs |
| "Pick a pre-trained model from a catalog and quickly deploy or fine-tune it" | JumpStart | Model Monitor: a post-deployment monitoring tool |
| "Detect whether a deployed model's performance degrades over time" | Model Monitor | Clarify: a bias and explainability tool |
| "Check whether a loan model disadvantages a particular group and explain why" | Clarify | Model Monitor: drift monitoring |
| "Leave a model's purpose and limits as a document for auditing" | Model Cards | JumpStart: a model catalog |
| "Predict on a large volume of data accumulated each night all at once" | Batch transform | Real-time endpoint: billed even during idle time |
| "Traffic is irregular and we do not want to pay when there is none" | Serverless inference | Batch transform: not an immediate response |
| "Upload video files of several hundred MB one at a time and get results tens of minutes later" | Asynchronous inference | Serverless: exceeds the size and time limits |
| "An analyst who cannot code wants to build a prediction model" | Canvas | Configuring Training Jobs directly: requires expertise |

Starting tomorrow, we look at managed AI services (Rekognition, Textract, Comprehend, Transcribe, Polly, Translate) that process images, documents, text, and speech with a single API call, with no need to build a model.

## 📖 Glossary

- **ML lifecycle**: One full turn of a model, running through data preparation, training, evaluation, deployment, and monitoring.
- **Training Job**: SageMaker's unit of work that starts training instances, trains a model, and cleans up when finished.
- **Endpoint**: The address where a trained model is deployed and receives prediction requests.
- **JumpStart**: A catalog for picking, deploying, and fine-tuning pre-trained models and solution templates.
- **AutoML**: A method that automates algorithm selection and tuning. In SageMaker, Autopilot handles it.
- **Drift**: The phenomenon where the data coming in during operation or the model quality differs from what it was at training time.
- **Batch transform**: A method of predicting accumulated data all at once without an always-on endpoint.
- **Cold start**: The delay that occurs while an idle serverless resource is prepared to receive its first request.
- **Payload**: The data sent along with a single request.
- **MLOps**: A way of operating a model's experimentation, deployment, monitoring, and retraining as repeatable procedures.

## 📝 Practice Questions

**Question 1.** A team wants to directly train a custom predictive model using their company's unique data and continuously monitor model quality post-deployment. What is the most appropriate service?

A) Amazon Bedrock  
B) Amazon SageMaker  
C) Amazon Polly  
D) Amazon Translate  

**Answer: B**  
Explanation: SageMaker covers the entire ML lifecycle from data prep to training, deployment, and monitoring, ideal for controlling custom models with your own data. A focuses on renting existing FMs via API. C is speech synthesis, D is translation—both unrelated to custom model training.

---

**Question 2.** Which most accurately explains the difference between Bedrock and SageMaker?

A) Bedrock trains models directly, SageMaker only calls APIs  
B) Bedrock rents FMs via API; SageMaker builds and operates your own models  
C) They're completely the same service  
D) SageMaker doesn't support generative AI at all  

**Answer: B**  
Explanation: Bedrock is an abstracted-infrastructure FM rental service, while SageMaker is an ML platform where you control data, algorithms, and deployment. A reverses their roles. C is clearly different services. D is wrong because JumpStart handles FMs too.

---

**Question 3.** You want to quickly deploy pre-trained models and solution templates from a catalog or fine-tune them with your company's data. Which SageMaker feature is this?

A) Model Monitor  
B) JumpStart  
C) Data Wrangler  
D) Batch Transform  

**Answer: B**  
Explanation: JumpStart provides pre-trained models and solution templates for fast starts and fine-tuning. A monitors quality/drift post-deployment. C cleans data. D is a batch inference method—all different from catalog-based starting.

---

**Question 4.** You want to process large accumulated data at a set time each night. What's the most cost-effective inference method?

A) Real-time endpoint  
B) Batch Transform  
C) Retrain the model each time  
D) Manually operate an always-on GPU instance  

**Answer: B**  
Explanation: Batch Transform is cost-effective for regularly processing accumulated data at once. A stays on, incurring cost even idle. C is training, not inference. D carries operational burden and cost.

---

**Question 5.** Traffic is irregular and sporadic; you want costs near zero when there are no requests. What inference method suits this scenario?

A) Serverless inference  
B) Always-on real-time endpoint  
C) Batch Transform  
D) Asynchronous inference is the only option  

**Answer: A**  
Explanation: Serverless inference incurs no cost when idle, fitting sporadic, irregular traffic. B incurs idle cost. C is for bulk batch processing. D is for large input/long processing—a separate method not precisely matching "sporadic traffic" cue.

---
