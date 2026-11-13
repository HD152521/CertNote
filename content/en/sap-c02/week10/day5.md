# Day 5 - Week 10 Comprehensive Review: ML/AI Architecture Decisions + 12 Scenario Questions

Over the week we covered SageMaker (the ML platform), Bedrock (generative AI), Managed AI (pre-trained services), and MLOps (operations automation). Today, instead of memorizing these four areas separately, we integrate them into the decision flow of how the SAP-C02 exam actually asks - **"which ML/AI configuration is the correct answer for this business scenario?"** The exam traps in the ML/AI area almost always arise at the boundaries of "build it yourself vs. use a managed service" and "which of the similar services (Macie vs. Comprehend, Async vs. Batch, RAG vs. fine-tuning)."

Because this is a review day, rather than adding new services, the emphasis is on threading together in one breath **why** the concepts scattered across the week were designed the way they were - the historical background, internal behavior, differences from other clouds, and how real companies failed and fixed things. The exam does not test simple memorization but asks "under these conditions, what simultaneously satisfies operational burden, cost, and constraints," so you need to grasp the principle behind a service rather than its name to filter out the plausible wrong answers among the four options.

## How the ML/AI Service Stack Got This Shape - Historical Background

AWS's ML service layers were not designed all at once but stacked from the bottom up following market needs. At re:Invent 2016, AWS unveiled three "AI services": **Rekognition, Polly, and Lex**. The message at the time was clear - "for problems that are already solved, such as image recognition, speech synthesis, and conversational bots, do not build your own model; call an API." The following year, in 2017, **SageMaker** arrived. Organizations that wanted to train and serve custom models had to hand-build notebooks, training clusters, and inference servers on EC2, and this bundled that repetitive work into a managed service. Then, after the ChatGPT shock in 2023, **Bedrock** abstracted generative FMs into an API, completing the highest abstraction layer.

This chronology is today's decision tree. The further down you go, the greater the control and the greater the operational burden.

| Layer | Representative services | Appeared | Abstraction level | Operational burden |
|------|------------|------|-------------|-----------|
| **AI Services (already-solved problems)** | Rekognition, Textract, Comprehend, Transcribe | 2016~ | Result API | Nearly 0 |
| **Generative FM API** | Bedrock (Claude, Titan, Llama) | 2023~ | Model API | 0 (just call) |
| **ML platform** | SageMaker (training, inference, MLOps) | 2017~ | Model and infrastructure control | High |
| **Self-built** | EC2 + open-source frameworks | - | Full control | Very high |

This layered structure transplants the universal evolution pattern of computing directly onto ML. Computing evolved in the direction of reducing "the surface I manage": physical servers (IaaS) → virtualization → containers → functions (FaaS) → fully managed SaaS. ML climbed in abstraction in the same way: (directly operating model weights + infrastructure) → (managed training and serving) → (model API) → (result API). This is the fundamental reason the SAP exam treats "build-it-yourself answers" in ML scenarios as almost always wrong - the Operational Excellence pillar of AWS Well-Architected always says "leave undifferentiated heavy lifting to AWS." Operating model training infrastructure is not a differentiator for most companies.

## The Decision Flow - What to Ask First When Given a Problem

The order to go through in your head when solving an ML/AI scenario:

1. **Is it an already-solved problem?** (OCR, speech, sentiment, translation, recommendation) → a Managed AI service (do not build it yourself)
2. **Is it generative/conversational/internal knowledge?** → Bedrock. If based on internal documents, RAG (Knowledge Bases); fine-tuning is almost always wrong
3. **Do you need to train and serve a custom model?** → SageMaker. Decide the inference pattern (4 types) and training cost (Spot + Checkpoint)
4. **Is post-deployment quality or retraining the issue?** → MLOps (Model Monitor, Feature Store, Pipelines, Registry)

These four steps tie all of Week 10 into one decision tree.

This decision tree is essentially "a choice of abstraction level." It descends from the highest abstraction (Managed AI: a result API) to the lowest (SageMaker: direct control of model and infrastructure), and control and operational burden are inversely related. It is the ML version of the universal principle of cloud architecture - "if it can be solved with a managed service, use managed; go direct only when it cannot." This is why the SAP exam treats "build-it-yourself answers" in ML scenarios as almost always wrong. AWS always designs the correct answer to be the one that prefers "less operational burden" (the Well-Architected Operational Excellence pillar).

When several options are all "technically possible" on the exam, three criteria decide the answer - (1) **operational burden** (managed > self-built), (2) **cost** (zero idle > always-on billing), (3) **meeting the constraints** (explicit conditions in the sentence such as payload, latency, real-time requirements, no internet traversal). In particular, if you miss the "condition keywords" in (3), you end up choosing a plausible wrong answer. One word settles the answer, as in "no internet traversal" → PrivateLink, "minimal operational burden" → managed, "labels arrive late" → Data Quality, "without user impact" → Shadow.

It is important to ride the decision tree "top-down." Many candidates think of SageMaker first (because it is the most famous), but the correct order is always to ask "is it an already-solved problem?" first. For example, "license plate recognition" could be solved by training a vision model with SageMaker, but Rekognition solves it immediately. "Customer review sentiment analysis" also ends with Comprehend rather than a SageMaker classification model. Since the exam almost always makes a higher abstraction layer the correct answer, a habit of being suspicious of "the more managed one" among the options is what earns points.

## Comparison with Other Clouds - Why You Should Not Memorize Only AWS

The SAP exam is AWS-only, but knowing how GCP and Azure solve the same problems makes "what is the essence of this service" clear. If you know the essence, you find the answer even when names change.

| Functional area | AWS | Google Cloud | Microsoft Azure |
|-----------|-----|--------------|-----------------|
| **ML platform** | SageMaker | Vertex AI | Azure ML |
| **Generative FM API** | Bedrock | Vertex AI (Gemini) | Azure OpenAI Service |
| **Managed RAG** | Bedrock Knowledge Bases | Vertex AI Search | Azure AI Search |
| **OCR/documents** | Textract | Document AI | Document Intelligence |
| **Vision** | Rekognition | Vision AI | Computer Vision |
| **Speech to text** | Transcribe | Speech-to-Text | Speech Service |
| **Inference-dedicated chip** | Inferentia | TPU (both inference and training) | (Maia 100, 2024~) |

What the three clouds have in common is that the three layers of "AI services (result API) → FM API → ML platform" are almost identical. The differences are in the details. AWS positions Bedrock's **multi-vendor** approach (Anthropic, Meta, Mistral, Cohere, Amazon) under a single API to reduce vendor lock-in as a differentiator. Azure OpenAI, on the other hand, concentrates on OpenAI models, and GCP leans on its own Gemini. AWS also designed the training chip (Trainium) and the inference chip (Inferentia) separately, whereas Google's TPU does both with one. The reason "inference cost-reduction dedicated chip" is Inferentia on the exam is that AWS deliberately built a separate ASIC specialized for inference.

## The 4 Inference Endpoint Types - Why They Split into Four (Internal Behavior)

It is no coincidence that SageMaker inference is divided into four types rather than one. Inference workloads vary enormously along four axes - (1) payload size, (2) latency requirement, (3) traffic pattern, (4) synchronous/asynchronous - so a single endpoint cannot capture both cost and performance.

| Type | Characteristics | Limits/conditions | Internal behavior |
|------|------|-----------|-----------|
| **Real-Time** | Synchronous, low latency (tens of ms) | Payload 6 MB, 60 seconds, always-on cost | Instances stay resident, request → immediate response |
| **Serverless** | Variable, cold start OK, zero idle cost | Cold start, 6 MB, 60 seconds | Container starts on request, scales to 0 when idle |
| **Async** | Large payload (1 GB), long inference | Queue-based, can scale down to 0 | Enqueued in SQS → processed → result written to S3 |
| **Batch Transform** | Whole dataset in bulk | Not always-on serving | Instances start per job → terminate |

Internally, Real-Time and Serverless are synchronous request-response, so they are subject to the same physical constraints as the 6 MB and 30-60 second limits of API Gateway/Lambda. Async circumvents those constraints with a queue - upon receiving a request it immediately responds "accepted" (202), runs the actual inference in the background, and writes the result to S3. That is why an 800 MB payload and 5-minute inference are possible. Batch Transform is not "always-on serving" at all but a "one-off job" - you push the entire dataset in at once and take the instances down when it ends.

The cold start of Serverless Inference is the same mechanism as the cold start of Lambda. In exchange for scaling the container to 0 when idle to eliminate cost, when the first request arrives it takes time to load the model weights into memory (proportional to model size, hundreds of ms to a few seconds). So "latency-sensitive always-on traffic" fits Real-Time (resident), and "intermittent, cold tolerated" fits Serverless. This is exactly the same structure as the EC2 (resident) vs. Lambda (start on request) trade-off - ML inference is ultimately compute too, and follows the same cost-latency trade-off laws of compute.

> ⚠️ **Trap**: If you confuse Async and Batch, you get a whole question wrong. The key distinction is "request unit or dataset unit." A pattern where a user uploads a file and waits for its result (request-response, but slow) is **Async**. A pattern that scores 1 million records all at once every night (no always-on serving needed) is **Batch Transform**. "Per user upload + large file + long inference" is Async without exception; "nightly batch/whole dataset in bulk" is Batch. In the sentence, "per item/per request" versus "whole/in bulk" decides the answer.

## Training Cost - Why Spot Always Travels with Checkpoints

GPU training is the largest chunk of ML cost. An instance like ml.p4d costs tens of dollars per hour, and a multi-day training run makes the cost explode. So **Managed Spot Training** uses Spot capacity discounted by up to 90%. But Spot is reclaimed with a 2-minute notice when AWS needs the capacity. If a multi-day training run is reclaimed midway, do you start over from scratch? That is why **Checkpoints** are essential - the training progress state (weights, optimizer state) is periodically saved to S3 (`checkpoint_s3_uri`), so that when training resumes after reclamation it continues from the last saved point.

- **Managed Spot Training + Checkpoint** = up to 90% savings + interruption recovery (checkpoint is required)
- **Inferentia** (inference chip) / **Trainium** (training chip) / **Graviton** (general-purpose CPU)
- Multi-Model Endpoint = cost savings for many infrequently used models

Spot + Checkpoint is the ML version of the universal distributed systems pattern "checkpoint-restart." Large supercomputer simulations and HPC batch jobs do exactly the same - they split a long computation into small segments, periodically snapshot the state to disk, and when a node dies resume from the last snapshot. This is the general solution for "running reliable long-running work on unreliable resources." A long Spot training run without checkpoints loses everything on a single reclamation, so on the exam, when "Spot training + guaranteed completion of a long job" appears, an option missing Checkpoints is automatically wrong.

When OpenAI trained GPT-3 (2020) and GPT-4, it ran thousands of GPUs for weeks to months, and at this scale hardware failure is not an "exception" but "statistically certain" (with thousands of GPUs over several weeks, some will inevitably die). So large-scale training is impossible without checkpoints in the first place - if one node failure wipes out everything, training never finishes. In a retrospective on Llama 3 training (2024), Meta disclosed that on a 16,000-GPU cluster a failure occurred on average about once every 3 hours, and that frequent checkpointing and automatic recovery were the key to completing the training. SageMaker Managed Spot + Checkpoint bundles this industry-standard pattern as a managed service.

## Bedrock / Generative AI Essentials (Day 2 Summary)

- **Serverless FM API**, multi-vendor, no training on your data, PrivateLink
- **RAG** (embeddings + vector search + LLM) ↔ **Knowledge Bases** (managed RAG)
- **Agents** (Tool Use), **Guardrails** (PII, harmful content = a WAF for LLMs)
- **Provisioned Throughput** = throughput SLA + long-term discount
- RAG = knowledge injection, fine-tuning = behavior and format adjustment

> ⚠️ **Trap**: Choosing fine-tuning for an "internal-document-based chatbot" is wrong. (1) The documents change often, and retraining is slow and expensive, (2) fine-tuning is inefficient for knowledge injection and carries hallucination and overfitting risks, (3) it cannot cite sources. The correct answer is almost always RAG (Knowledge Bases). Fine-tuning is the answer only when there is an explicit condition to "learn a specific tone/format/domain behavior." OWASP classified prompt injection as LLM01 (the top risk) in its 2023 "Top 10 for LLM Applications"; Guardrails block some of it but are not a cure-all, and a layered defense of least privilege and output validation is needed.

## Managed AI Mapping (Day 3 Summary) - Distinguishing Similar Services Is the Heart of the Exam

| Scenario | Answer |
|----------|-----|
| OCR invoices, forms, IDs | Textract (AnalyzeExpense/Document/ID) |
| Image and video object and content moderation | Rekognition |
| Speech → text | Transcribe |
| Text → speech | Polly |
| Sentiment, entities, text PII | Comprehend |
| PII in data stored in S3 | **Macie** |
| Natural-language internal search | Kendra |
| Recommendations | Personalize / Fraud | Fraud Detector |
| Operational anomaly detection | DevOps Guru / Code | CodeGuru |

In PII detection, **Macie vs. Comprehend** is an easily confused trap. Both find PII, but their targets differ - **Macie** scans "data **stored** in S3 buckets" to discover and classify the location of sensitive information (for data governance and compliance). **Comprehend**'s DetectPiiEntities detects and masks PII in real time in "**arbitrary text** in flight" (for pipeline processing). If it is "understand the PII status of data accumulated in S3," Macie; if it is "mask PII in extracted/input text," Comprehend. PII in LLM responses, meanwhile, is yet another answer - **Guardrails**. Even for the same "PII," where the data lives decides the answer.

Textract is not simple OCR (reading characters) but "document structure understanding." AnalyzeExpense **semantically** extracts line items, amounts, and taxes from receipts and invoices, AnalyzeDocument understands the key-value relationships of tables and forms, and AnalyzeID pulls the name, date of birth, and number from IDs as fields. So an option that "builds it directly with Tesseract + regular expressions" is almost always wrong - regexes break when a form changes even slightly, cannot read tables or nested structures, and carry a heavy operational burden. On the exam, "extract structured data from invoices/forms/IDs + minimal operational burden" is answered by the dedicated Textract API.

## MLOps (Day 4 Summary) - Deployment Is Not the End of a Model

- **Pipelines** (ML-specific DAG, Lineage) / **Registry** (versions, approval) / **Feature Store** (Online DDB, Offline S3)
- **Model Monitor**: Data Quality (no labels) / Model Quality (labels) / Bias / Feature Attribution Drift
- Retraining loop: Monitor drift → EventBridge → re-run the Pipeline

The core difficulty of ML systems is that "a model quietly rots after deployment (model decay)." In traditional software, behavior stays the same if the code does not change, but an ML model loses accuracy **when the world changes** even if the code stays the same. This is called **drift**. There are two kinds - (1) **data drift**: the input distribution itself changes (e.g., consumption patterns changing sharply after COVID), (2) **concept drift**: the input-output relationship changes (same input but a different correct answer, e.g., evolving fraud techniques). In theory an ML model stands on the assumption that "training data and production data come from the same distribution (IID)," but the real world constantly breaks this assumption. MLOps is the infrastructure that detects this breakage and automatically updates the model.

The essential difference between the Data Quality and Model Quality monitors is "whether labels (ground truth) are needed." **Data Quality** only compares the statistical distribution of input data against a baseline, so no labels are needed - it quickly gives an "early warning" of data drift. **Model Quality** compares the model's predictions with the **actual answers** to catch declines in accuracy, precision, and recall (concept drift), so labels are required, and if labels arrive late, detection is late too. In practice the two are used together - get an immediate alert with Data Quality, then confirm the real accuracy decline with Model Quality when labels arrive. This is why "labels arrive late + automatic retraining" makes Data Quality the answer on the exam.

The problem Feature Store solves is **train-serve skew**. It is a notorious bug type in ML systems in which the feature computation logic used at training and the logic used at inference differ subtly, so accuracy quietly collapses (e.g., training computed "the average over the last 7 days" in batch, but inference computes it differently in real time). Feature Store **automatically synchronizes from a single definition** the Online store (DynamoDB, low latency, for inference) and the Offline store (S3, for training and analysis), ensuring that training and inference use the same features. This is the application of the distributed systems principle of a "single source of truth" to ML.

---

(Hypothetical case) An insurance company once restructured after designing all four areas wrong at once when adopting ML/AI. (1) It spent 6 months building its own vision model for accident photo analysis, then replaced it in 2 weeks with Rekognition Custom Labels (Managed AI), (2) it tried a policy-terms chatbot with GPT fine-tuning, but retraining cost accrued each time the terms were revised, so it switched to Bedrock Knowledge Bases (RAG) (generative), (3) it served a premium prediction model directly on EC2 and accuracy wobbled from train-serve skew, so it introduced SageMaker Feature Store (MLOps), (4) it failed to catch the model quietly aging and automated it with Model Monitor + an EventBridge retraining loop. Lesson: failures in ML/AI systems are decided less by the model itself than by "which abstraction level was chosen" and "whether operational infrastructure was in place." Exam scenarios ask precisely about these four branches.

Zillow's "Zillow Offers" (a home-buying business) is a famous incident in which an ML model failure led the company to shut down the business itself in 2021 and lay off about 25% of its workforce (over 2,000 people). It bought homes using its own price prediction model (based on the Zestimate), but as the real estate market shifted rapidly in 2021, the gap between the past patterns the model had learned and reality (data/concept drift) widened, purchases above market value accumulated, and it was left holding about 7,000 homes at a loss. The key lesson is that "a model must be validated not at the moment it is built but throughout its operation" - without drift detection like Model Monitor and a mechanism for fast retraining or halting, even a once-accurate model quietly ruins a company when the world changes. The practical reason SAP treats MLOps (drift detection + automatic retraining) as one pillar of ML scenarios lies in incidents like this.

> 🎯 **Scenario**: "You suspect a production fraud detection model's accuracy is degrading over time, because fraud techniques keep evolving. Whether a case is actually fraud (the label) is confirmed days later by investigation. How do you automatically detect model aging and retrain without human intervention when a threshold is exceeded?" - Since labels are late, immediate detection uses **Data Quality** (input distribution drift, no labels needed), and EventBridge catches the threshold breach and triggers a **SageMaker Pipeline re-run**, closing the retraining loop automatically. When labels arrive, **Model Quality** confirms the real accuracy decline after the fact. "Evolving fraud techniques" is classic concept drift, and "labels are late" is the keyword that settles Data Quality as the answer.

## Summary of Key Boundaries - One Page Right Before the Exam

Compressing all of the week's traps into "A vs. B" form gives this. Even recalling just this table in the exam room catches half.

| Confusing pair | A | B | Deciding keyword |
|-------------|---|---|---------------|
| **Large inference payload** | Async (per request) | Batch (whole dataset in bulk) | "per item/upload" vs. "whole/overnight" |
| **Generative data injection** | RAG (knowledge, up to date, sources) | Fine-tuning (behavior, format, tone) | "internal documents/latest" vs. "tone/JSON format" |
| **PII detection** | Macie (data stored in S3) | Comprehend (arbitrary text) | "accumulated in S3" vs. "text in flight" |
| **LLM response PII and harmful content** | Guardrails | (WAF/Macie are wrong) | "LLM input/output" |
| **Internal search** | Kendra (natural language, permissions) | OpenSearch (keywords, logs) | "Q&A/permissions" vs. "logs/keywords" |
| **Drift detection** | Data Quality (no labels, early) | Model Quality (labels, accuracy) | "labels late" vs. "labels available" |
| **Deployment validation** | Shadow (zero impact, mirroring) | A/B (real traffic split) | "without impact" vs. "to some users" |
| **In-house designed chip** | Inferentia (inference) | Trainium (training) | "inference cost" vs. "training cost" |
| **ML orchestrator** | SageMaker Pipelines (ML-specific) | Step Functions (general-purpose) | "Lineage/experiments/caching" vs. "general workflow" |

---

## 📝 12 Scenario Questions

**Question 1.** You are building a Q&A chatbot based on an internal wiki. You must minimize operational burden, the data must not traverse the internet, and customer PII must not be exposed in answers. The documents are updated frequently. What is the most suitable configuration?

A) Host an open-source LLM directly on a SageMaker Endpoint and fine-tune it with the wiki

B) Bedrock Knowledge Bases + Guardrails + VPC Interface Endpoint (PrivateLink)

C) Return search results with Amazon Kendra alone

D) Build your own RAG with OpenSearch + Lambda

**Answer: B**
Explanation: Knowledge Bases minimizes operational burden as managed RAG and reflects document updates immediately, Guardrails masks PII, and PrivateLink guarantees calls that do not traverse the internet. The three conditions (minimal operational burden, no internet traversal, PII blocking) map precisely to Knowledge Bases, PrivateLink, and Guardrails respectively. A (fine-tuning) is almost always wrong for an internal chatbot because retraining is slow and expensive for frequently updated documents and has source and hallucination problems. C (Kendra) gives only search results, not generative conversational answers. D builds RAG yourself, so operational burden is high. Trap: "internal-document chatbot + minimal operational burden" is Knowledge Bases; fine-tuning is wrong.

---

**Question 2.** You want to cut GPU training cost as much as possible, but a multi-day training run must complete even if Spot instances are reclaimed. How do you configure it?

A) Commit to a 1-year Reserved Instance training cluster to lower the hourly rate and complete without interruption

B) Managed Spot Training + Checkpoint (checkpoint_s3_uri)

C) Get a commitment discount with Compute Savings Plans and configure automatic fallback to On-Demand when reclaimed

D) Train on On-Demand but cache results every epoch to shorten restart time

**Answer: B**
Explanation: Managed Spot Training uses Spot discounted by up to 90%, and Checkpoint resumes from the last saved point upon reclamation so the long training completes. Spot training without checkpoints loses everything on a single reclamation in a long job and almost never completes, so the two are always used together (the checkpoint-restart pattern of distributed systems). A and C are commitment discounts that fall short of 90% and are unrelated to interruption recovery. D yields no cost savings. Trap: "training 90% savings + interruption recovery" is Spot + Checkpoint.

---

**Question 3.** A model analyzes 800 MB satellite images uploaded by users, and inference takes about 5 minutes. A synchronous response times out, and traffic is irregular. What is the most suitable inference option?

A) Real-Time Endpoint

B) Serverless Inference

C) Async Inference

D) Batch Transform

**Answer: C**
Explanation: Async Inference is queue-based, supports payloads up to 1 GB and long processing times, and writes results to S3. Internally it enqueues the request, gives an immediate acceptance response, and runs inference in the background, bypassing the synchronous timeout. 800 MB (> 6 MB) and 5 minutes (> 60 seconds) exceed the payload and timeout limits of Real-Time/Serverless. D (Batch Transform) is a whole-dataset bulk processing type, not a per-user-upload request-response type. Trap: "large payload + long inference + per request" is Async; "dataset in bulk" is Batch.

---

**Question 4.** Before replacing a production recommendation model with a new version, you want to validate the new model's behavior on real production traffic without affecting user responses at all. What strategy is it?

A) Canary deployment

B) A/B Test (Production Variants)

C) Shadow Endpoint (Shadow Testing)

D) Multi-Model Endpoint

**Answer: C**
Explanation: A Shadow Endpoint duplicates (mirrors) production traffic to the new model but does not return the output to users, so it validates the new model with zero impact. A (Canary) and B (A/B) have some users actually receive the new model's responses, contradicting the "no impact" condition. D is multi-model serving for cost optimization, not a deployment validation strategy. Trap: "mirror and compare without impact" is Shadow; "split real traffic" is A/B.

---

**Question 5.** You want to automatically detect the gradual decline of a production model's actual prediction accuracy. The actual answers (labels) can be obtained. Which monitoring is it?

A) Model Monitor Data Quality, comparing input feature distributions against a baseline to detect the accuracy decline

B) Model Monitor Model Quality

C) SageMaker Clarify's Bias Drift monitor tracking only per-group bias changes

D) Export prediction values only as a CloudWatch Custom Metric and set a threshold alarm

**Answer: B**
Explanation: Model Quality compares actual labels with predictions to detect declines in accuracy, precision, and recall (concept drift), and is used when labels can be obtained. A (Data Quality) looks only at input distributions and does not know actual accuracy (it is for early warning without labels). C is for bias, and D is not automatic ML drift detection. Trap: "actual accuracy decline + labels available" is Model Quality; "early detection without labels" is Data Quality.

---

**Question 6.** You are building a pipeline that automatically extracts line items, amounts, and taxes from tens of thousands of supplier PDF invoices per month, masks the contact person's PII in the extracted text, and stores it in DynamoDB. Which combination?

A) Rekognition + Macie

B) Textract AnalyzeExpense + Comprehend DetectPiiEntities

C) Comprehend + Kendra

D) Lambda Tesseract + regular expressions

**Answer: B**
Explanation: AnalyzeExpense is dedicated to invoices and receipts and semantically extracts line items, amounts, and taxes accurately, and PII in the extracted arbitrary text is detected and masked with Comprehend. A (Rekognition) is for image objects and Macie is for scanning data stored in S3, so they are unsuitable for in-flight text PII. C (Kendra) is for search. D has a build-it-yourself burden and inferior accuracy (regexes break when forms change). Trap: invoices = AnalyzeExpense (dedicated), text PII = Comprehend (if stored in S3, Macie).

---

**Question 7.** You must mask national ID numbers and card numbers in LLM chatbot responses and block violent and hateful expressions. What is the most suitable?

A) AWS WAF

B) Bedrock Guardrails

C) Amazon Macie

D) Comprehend + Lambda post-processing

**Answer: B**
Explanation: Bedrock Guardrails are safety filters specialized for LLM input and output, providing PII masking, harmful content filtering, denied topics, and prompt injection defense as a managed service (a "WAF for LLMs"). A (WAF) defends against HTTP web attacks, C (Macie) is for PII in S3, and D carries a large build burden and weak harmful-content detection. Even for the same "PII," the answer splits: for LLM responses it is Guardrails, for data stored in S3 it is Macie, and for text in flight it is Comprehend. Trap: "block PII and harmful content in LLM responses" is Guardrails.

---

**Question 8.** Which most accurately describes the difference between SageMaker Feature Store's Online Store and Offline Store?

A) Online = S3 for training, Offline = DynamoDB for inference

B) Online = DynamoDB-based low-latency for real-time inference, Offline = S3-based for training and analysis

C) The two are identical, only the names differ

D) Offline = real-time inference, Online = batch analysis

**Answer: B**
Explanation: The Online Store is DynamoDB-based and provides millisecond single-record lookups for real-time inference, while the Offline Store is S3 + Glue-based and holds large volumes of historical data for training, batch, and analysis. The two are automatically synchronized from a single feature definition, ensuring training/inference feature consistency (preventing train-serve skew). A has the uses swapped, and C and D are incorrect statements. Trap: Online = DDB low-latency inference, Offline = S3 training.

---

**Question 9.** When an automatically trained model passes an accuracy threshold (> 0.9), it must be registered in the registry, and when a data scientist approves it, it must be deployed to the endpoint automatically without human intervention. What is the configuration?

A) Operate every step manually

B) Model Registry approval status + EventBridge (Approved) → Lambda deployment

C) CodeDeploy manual approval

D) CloudFormation manual deployment

**Answer: B**
Explanation: Model Registry provides an approval gate (Pending/Approved/Rejected), and the Approved event is caught with EventBridge to automatically trigger a Lambda deployment. The hybrid governance of "human approval + automatic deployment after approval" is the ML deployment standard. A, C, and D either lack automation or miss model version and lineage governance. Trap: "review approval + automatic deployment" is Model Registry + EventBridge.

---

**Question 10.** Inference throughput is high, but to reduce cost you want to use AWS's own-designed inference-dedicated chip instead of NVIDIA GPUs. Which chip?

A) Trainium (Trn1)

B) Inferentia (Inf1/Inf2)

C) Graviton

D) F1 FPGA

**Answer: B**
Explanation: Inferentia is an inference-dedicated ASIC designed by AWS that delivers the same throughput at lower cost than GPUs. The fact that AWS deliberately designed the training chip (Trainium) and the inference chip (Inferentia) separately is the basis of the answer. A (Trainium) is training-only, C (Graviton) is a general-purpose ARM CPU (not inference-dedicated), and D (F1 FPGA) is for custom hardware acceleration, not an ML inference-dedicated chip. Trap: inference = Inferentia, training = Trainium, general-purpose CPU = Graviton.

---

**Question 11.** When a production model's input distribution deviates from the training baseline beyond a threshold, you want to run the retraining pipeline automatically without human intervention. Labels arrive late. What is the full connection?

A) Model Quality monitor → manual retraining

B) Model Monitor Data Quality (drift) → EventBridge → re-run SageMaker Pipeline

C) A Lambda cron that unconditionally retrains every day

D) Config rule → SNS notification only

**Answer: B**
Explanation: Because labels are late, input distribution drift is detected with Data Quality, which needs no labels, and when the threshold is exceeded, EventBridge triggers a SageMaker Pipeline re-run, closing the retraining loop automatically. A (Model Quality) needs labels, so it is late and manual. C is unconditional retraining unrelated to drift and wastes cost. D has only a notification and no retraining. Trap: "labels late + automatic retraining on drift" is Data Quality + EventBridge + Pipelines.

---

**Question 12.** You want to express an ML workflow flowing from preprocessing, training, tuning, evaluation, registration, and deployment as a DAG, and you need per-step lineage, experiment tracking, and caching of unchanged steps. What is the most suitable orchestrator?

A) AWS Step Functions

B) SageMaker Pipelines

C) Amazon MWAA (Airflow)

D) AWS Glue Workflow

**Answer: B**
Explanation: SageMaker Pipelines is an ML-specific DAG that provides training/tuning/evaluation/registration steps, Model Registry integration, automatic Lineage tracking, and step caching out of the box. A (Step Functions) is a general-purpose workflow with weak ML lineage and experiment tracking, C (MWAA) is for complex scheduling and Airflow migration, and D (Glue Workflow) is for ETL and has no ML lineage or experiment tracking. Trap: "ML workflow + Lineage/experiments/caching" is SageMaker Pipelines.

---

## 📌 Week 10 One-Line Summary

> "SageMaker = a custom ML platform (4 inference types, Spot training, dedicated chips), Bedrock = serverless generative AI (RAG, Guardrails), Managed AI = already-solved problems via API, MLOps = automating drift and retraining with Pipelines, Registry, Feature Store, and Monitor."

## 🎯 Key Boundaries (Last-Minute Check Before the Exam)

- **Async vs. Batch**: per-request large payload = Async / dataset in bulk = Batch
- **RAG vs. Fine-tuning**: knowledge, up to date, sources = RAG / behavior, format, tone = fine-tuning
- **Macie vs. Comprehend PII**: data stored in S3 = Macie / arbitrary text = Comprehend
- **Kendra vs. OpenSearch**: natural language, permissions = Kendra / keywords, logs = OpenSearch
- **Data Quality vs. Model Quality**: input drift without labels = Data / accuracy with labels = Model
- **Shadow vs. A/B**: mirroring with no impact = Shadow / real traffic split = A/B
- **Inferentia vs. Trainium**: inference chip = Inferentia / training chip = Trainium

---

## 🎯 Preview of Next Week (Week 11)

Advanced security - KMS (encryption and key management), Macie, GuardDuty, Inspector, Security Hub, WAF, Shield. The data protection and PII covered in ML/AI extends into the security domain.
