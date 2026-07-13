# Day 5 - Week 10 Comprehensive Review: ML/AI Architecture Decision-Making + 12 Scenario Problems

One week covered SageMaker (ML platform), Bedrock (generative AI), Managed AI (pre-trained services), MLOps (operations automation). Today we integrate these four domains—not as separate rote memorization but as **the decision flow the SAP-C02 exam actually tests: "given this business scenario, which ML/AI stack is correct?"** Traps in ML/AI almost always cluster around "build vs buy?", "which service among similar ones?" (Macie vs Comprehend, Async vs Batch, RAG vs fine-tuning).

Comprehension day prioritizes not new services but seeing how scattered concepts from the week **"why design this way?"**—historical background, internal mechanics, cloud comparison, how real companies failed then fixed—in one breath. The exam tests not rote names but "which choice meets ops burden, cost, and constraints simultaneously," so mastering principles behind names lets you filter credible answers among four plausible-sounding choices.

## ML/AI Service Stack Evolution — Historical Backdrop

AWS's ML service layers didn't emerge at once but stacked bottom-up as markets demanded. 2016 re:Invent: AWS unveiled **Rekognition, Polly, Lex**—three "AI services." Message was clear: "already-solved problems like image recognition, voice synthesis, conversational bots don't require building models—call the API." 2017 brought **SageMaker**. Organizations needing custom models had to wire up notebooks, training clusters, inference servers on EC2 manually—this repeated work got bundled managed. Then 2023 post-ChatGPT, **Bedrock** abstracted generative FMs as API, completing the highest abstraction layer.

This chronology is today's decision tree. Lower levels mean more control, more operations burden.

| Layer | Representative Services | Debut | Abstraction | Operations Burden |
|-------|-------------------------|-------|------------|-------------------|
| **AI Services (solved)** | Rekognition, Textract, Comprehend, Transcribe | 2016~ | Result API | Nearly 0 |
| **Generative FM API** | Bedrock (Claude, Titan, Llama) | 2023~ | Model API | 0 (calls only) |
| **ML Platform** | SageMaker (train, serve, MLOps) | 2017~ | Model/infrastructure control | High |
| **Self-built** | EC2 + open-source frameworks | — | Total control | Very high |

> 💡 **Related Theory**: This hierarchy mirrors computing's universal evolution pattern. Computing: physical servers (IaaS) → virtualization → containers → functions (FaaS) → fully managed SaaS, shrinking "your management surface." ML likewise: (model weights+infrastructure direct ops) → (managed train/serve) → (model API) → (result API). SAP exams nearly never mark "build it yourself" as correct in ML scenarios because AWS Well-Architected's Operational Excellence pillar always says "offload undifferentiated heavy lifting." Model infrastructure ops aren't differentiation for most firms.

## Decision Flow — What Questions First When Facing Problems

When solving ML/AI scenarios, mental checklist:

1. **Already-solved problem?** (OCR, voice, sentiment, translation, recommendations) → Managed AI Service (don't build)
2. **Generative/conversation/internal knowledge?** → Bedrock. Internal docs mean RAG (Knowledge Bases); fine-tuning almost always wrong
3. **Need custom train/serve?** → SageMaker. Choose inference pattern (4 types) and training cost (Spot+Checkpoint)
4. **Post-deployment quality/retraining problem?** → MLOps (Model Monitor, Feature Store, Pipelines, Registry)

This 4-step tree integrates all of Week 10.

> 💡 **Related Theory**: This tree is fundamentally "abstraction level choice." Highest abstraction (Managed AI: result API) down to lowest (SageMaker: model/infrastructure direct control), with control/operations burden inversely related. Cloud architecture's universal principle—"use managed where possible, direct only when necessary"—applies to ML. SAP exams favor answers with less operations burden (Well-Architected's Operational Excellence pillar). AWS designs "fewer ops" as correct.

> 🔍 **Deep Dive**: When multiple choices look "technically possible," three criteria break ties: (1) **operations burden** (managed > self-built), (2) **cost** (zero-idle > always-billed), (3) **constraint fulfillment** (payload/latency/real-time/internet-free conditions in problem statement). Keyword spotting at (3) especially—miss one word and you pick plausible-sounding wrong answer. "Internet-free" → PrivateLink, "minimal ops" → managed, "label-latency" → Data Quality, "no user impact" → Shadow.

> 🔍 **Deep Dive**: Top-down decision tree traversal matters. Many test-takers think SageMaker first (most famous), but correct order always asks "already solved?" first. Examples: license plate recognition seems like a SageMaker vision project until you realize Rekognition solves it instantly. Customer review sentiment analysis seems like SageMaker classification until Comprehend finishes it. Exams almost always mark higher-abstraction as correct, so "if choices include more-managed version, suspect it"—that wins.

## Cloud Comparison — Why AWS-Only Knowledge Isn't Enough

SAP tests AWS alone, but seeing how GCP and Azure solve identical problems clarifies "what is this service's essence?" Names change; essence persists.

| Capability | AWS | Google Cloud | Microsoft Azure |
|-----------|-----|--------------|-----------------|
| **ML Platform** | SageMaker | Vertex AI | Azure ML |
| **Generative FM API** | Bedrock | Vertex AI (Gemini) | Azure OpenAI Service |
| **Managed RAG** | Bedrock Knowledge Bases | Vertex AI Search | Azure AI Search |
| **OCR/Docs** | Textract | Document AI | Document Intelligence |
| **Vision** | Rekognition | Vision AI | Computer Vision |
| **Speech→Text** | Transcribe | Speech-to-Text | Speech Service |
| **Inference Chip** | Inferentia | TPU (inference+train) | (Maia 100, 2024~) |

> 🔍 **Deep Dive**: Three clouds share "AI services → FM API → ML platform" nearly identically. Differences hide in detail. AWS differentiates Bedrock on **multi-vendor** (Anthropic, Meta, Mistral, Cohere, Amazon) in one API, reducing lock-in. Azure commits to OpenAI, GCP to Gemini. AWS split training (Trainium) and inference (Inferentia) chips; Google TPU does both. "Inference cost chip specialist" is Inferentia because AWS deliberately designed inference-specific ASIC.

## 4 Inference Endpoint Types — Why Four (Internal Mechanics)

SageMaker inference splitting into four isn't accident. Inference workloads differ on four axes: (1) payload size, (2) latency demand, (3) traffic pattern, (4) sync/async. One endpoint can't optimize all.

| Type | Traits | Limits/Conditions | Internal |
|------|--------|------------------|----------|
| **Real-Time** | Sync, low-latency (~tens ms) | 6MB payload, 60s timeout, always costs | Instances resident, request→immediate response |
| **Serverless** | Variable, cold-start OK, idle cost 0 | Cold spin-up latency, 6MB/60s | Container boots on request, scales to 0 idle |
| **Async** | Large payload (1GB), long inference | Queue-based, 0-scalable | SQS queue holds request→background process→S3 result |
| **Batch Transform** | Full-dataset one-shot | No always-on serving | Instances boot per job→terminate after |

Real-Time and Serverless are sync request-response, subject to 6MB/30-60s physics constraints (API Gateway/Lambda limits). Async sidesteps via queue—accept request instantly (202), run inference in background, write results to S3. Supports 800MB payload and 5-minute inference. Batch Transform isn't "always-on serving"—it's one-time work—whole dataset fed once, instances shut down after.

> 🔍 **Deep Dive**: Serverless cold starts mirror Lambda cold starts. Idle → scales to 0, cost zeros. First request → load model weights (time proportional to size, 100ms to seconds). "Real-time, latency-sensitive always-on" needs Real-Time (resident). "Sporadic, cold-start tolerable" suits Serverless. This is EC2 (resident) vs Lambda (on-demand) economics applied identically—ML inference is ultimately computing, same cost/latency tradeoffs apply.

> ⚠️ **Trap**: Async vs Batch confused costs full problems. Core: "per-request vs full-dataset?" Users upload one file, await result (request-response, long-wait) = **Async**. Nightly batch-score 1M records (no real-time serving needed) = **Batch Transform**. "per-request + large file + long" → always Async. "entire-dataset one-shot/nightly" → Batch. "per-request/one-time" vs "batch/full-dataset" are keywords deciding answers.

## Training Cost — Why Spot Pairs with Checkpoint Always

GPU training dominates ML cost bills. ml.p4d costs ~$37/hour; days-long training explodes spend. **Managed Spot Training** uses Spot capacity (max 90% discount). Spot risk: AWS reclaims with 2-minute notice. Multi-day training interrupted halfway? Starts over—catastrophic. **Checkpoint** fixes it—periodically save training state (weights, optimizer) to S3 (`checkpoint_s3_uri`); reclaim means resume from last save.

- **Managed Spot Training + Checkpoint** = max 90% savings + interrupt recovery (checkpoint essential)
- **Inferentia** (inference chip) / **Trainium** (training chip) / **Graviton** (general CPU)
- Multi-Model Endpoint = thousands of infrequent-use models cost slash

> 💡 **Related Theory**: Spot+Checkpoint is ML's version of distributed systems' universal "checkpoint-restart" pattern. Supercomputer multi-week simulations, HPC batch jobs use it—break long runs into segments, periodically disk-snapshot state; node death means resume from last snapshot. This is "run reliable work on unreliable infrastructure" general solution. Spot without checkpoint on long jobs nearly never completes—one reclaim wipes everything. Exams: "Spot training + long job completion guarantee" means Checkpoint is mandatory; missing-checkpoint answers auto-wrong.

> 📚 **Case Study**: OpenAI trained GPT-3 (2020) and GPT-4 on thousands of GPUs for weeks/months—at scale hardware failure is statistical certainty (thousands GPUs × weeks = some definitely die). Without checkpointing, one node failure → entire run wasted → never finishes. Meta's Llama 3 training (2024) retrospective: 16,000 GPU cluster averaged one failure every ~3 hours, frequent checkpoints and auto-recovery were retraining completion keystones. SageMaker Managed Spot+Checkpoint packages this industry-standard pattern managed.

## Bedrock / Generative AI Core (Day 2 Summary)

- **Serverless FM API**, multi-vendor, no data retraining, PrivateLink
- **RAG** (embeddings+vector search+LLM) ↔ **Knowledge Bases** (managed RAG)
- **Agents** (Tool Use), **Guardrails** (PII/harm = LLM WAF)
- **Provisioned Throughput** = throughput SLA + long-term discount
- RAG = knowledge inject, fine-tuning = behavior/format adjust

> ⚠️ **Trap**: "Internal-doc chatbot" + fine-tuning = almost always wrong. (1) Docs change frequently; retraining slow/costly, (2) fine-tuning inefficient at knowledge-inject, risks hallucination/overfitting, (3) no source attribution. Answer almost always RAG (Knowledge Bases). Fine-tuning correct only when explicitly "learn domain behavior/format/style." OWASP's 2023 "Top 10 for LLM Applications" ranks prompt injection LLM01 (top risk); Guardrails blocks some but isn't panacea—defense-in-depth (least privilege, output validation) required.

## Managed AI Mapping (Day 3 Summary) — Similar Service Distinction Exam Core

| Scenario | Answer |
|----------|--------|
| OCR receipts/forms/IDs | Textract (AnalyzeExpense/Document/ID) |
| Image/video objects/content mod | Rekognition |
| Speech → text | Transcribe |
| Text → speech | Polly |
| Sentiment/entities/text PII | Comprehend |
| **S3 stored data PII** | **Macie** |
| Natural language internal search | Kendra |
| Recommendations | Personalize / Fraud | Fraud Detector |
| Ops anomaly detect | DevOps Guru / Code | CodeGuru |

> ⚠️ **Trap**: **Macie vs Comprehend PII** single most-common trap. Both find PII but targets differ — **Macie** scans "**stored** S3 data," identifies/classifies sensitive locations (data governance/compliance—where's sensitive data?). **Comprehend** DetectPiiEntities real-time detects/masks "**flowing arbitrary text**" (pipeline processing). "S3-accumulated data PII status?" = Macie. "Extract/input text PII mask?" = Comprehend. LLM response PII is yet another—**Guardrails**. Same "PII" word; data location decides answer.

> 🔍 **Deep Dive**: Textract isn't "read text"—"understand structure." AnalyzeExpense **semantically** extracts items/amounts/taxes from receipts/invoices; AnalyzeDocument parses table relationships/form key-values; AnalyzeID fields from IDs. "Direct Tesseract+regex" answer almost always wrong—regex breaks on layout change, can't read tables/nesting, high ops burden. Exams: "extract structured data from receipts/forms/IDs + minimal ops" = Textract specialized APIs.

## MLOps (Day 4 Summary) — Models Aren't Deploy End-State

- **Pipelines** (ML-specific DAG, Lineage) / **Registry** (versioning, approval) / **Feature Store** (Online DDB, Offline S3)
- **Model Monitor**: Data Quality (no labels) / Model Quality (labels) / Bias / Feature Attribution Drift
- Retraining loop: Monitor drift → EventBridge → Pipeline re-run

> 💡 **Related Theory**: ML's core hard problem: "models silently decay after deploy (model decay)." Traditional software: unchanged code = unchanged behavior. ML: unchanged code + world-changing = accuracy drop. **Drift** catches this. Two types: (1) **data drift**: input distribution changes (post-pandemic consumption shifted), (2) **concept drift**: input-output relationship changes (fraud methods evolve). Theoretically ML assumes "training/production data same distribution (IID)," but real world constantly breaks it. MLOps detects breaks, auto-updates models.

> 🔍 **Deep Dive**: Data Quality vs Model Quality's core: "do labels matter?" **Data Quality** compares input statistics against baseline—no labels needed—early warning on data drift. **Model Quality** compares predictions vs **actual ground truth**, catching concept drift, requires labels, delayed. Teams use both—Data Quality instant alert, Model Quality post-label confirmation. "Labels lag + auto-retrain" exams map to Data Quality.

> 💡 **Related Theory**: Feature Store solves **train-serve skew** — ML's infamous debug nightmare. Training feature-calc code subtly differs from inference code, model gets "never-trained input," accuracy silently crashes. Feature Store defines features once, ensures training/inference read synchronized, identical features from Online (DynamoDB low-latency) and Offline (S3 high-volume). Single source of truth for features—distributed systems' foundational principle applied to ML.

---

> 📚 **Case Study**: Insurance firm botched all four domains, rebuilt: (1) Built 6-month proprietary vision model for accident photos until **Rekognition Custom Labels** (Managed AI) did it in 2 weeks. (2) Tried GPT fine-tuning for policy chatbots; policy changes meant retraining costs each time → **Bedrock Knowledge Bases** (RAG) solved. (3) Hosted price prediction model on EC2 direct, train-serve skew tangled accuracy → **SageMaker Feature Store** stabilized. (4) Models silently aged undetected until **Model Monitor + EventBridge** auto-retraining loop launched. Lesson: ML/AI failure hinges not on model itself but "which abstraction level chosen?" and "ops infrastructure present?" Exam scenarios exactly ask these four forks.

> 📚 **Case Study**: Zillow Offers (2021) famously failed—ML-based home-buying business wound down, 2,000 jobs cut. Zestimate model bought homes too expensively when 2021 real estate market shifted; training-era patterns (data/concept drift) diverged from reality. Accumulated 7,000-home loss. Core lesson: "models need validation throughout operation, not at deploy." Without Model Monitor-like drift detection and fast retrain/halt mechanisms, previously-accurate models silently tank companies. SAP's MLOps (drift+auto-retrain) emphasis traces to real incidents like this.

> 🎯 **Scenario**: "Production fraud model accuracy suspected dropping. Fraud methods evolve constantly. Actual fraud confirmed days post-chargeback. Auto-detect model decay without labels, auto-retrain unsupervised?" — Use **Data Quality** (input-distribution drift, no-labels, early warning) immediately, **EventBridge** catches threshold breach, **SageMaker Pipeline re-run** auto-retrains. Later when chargebacks arrive → **Model Quality** confirms real accuracy drop. "Fraud method evolution" = concept drift example; "labels lag" = Data Quality answer-key word.

## Core Boundaries Compressed — Pre-Exam Single Page

Week's all traps compressed into "A vs B" form—memorize this table, solve half the problems.

| Confusing Pair | A | B | Deciding Keyword |
|---|---|---|---|
| **Inference big payload** | Async (per-request) | Batch (full-dataset) | "per-request/upload" vs "full/nightly" |
| **Generative data inject** | RAG (knowledge/fresh/source) | Fine-tuning (behavior/format/tone) | "internal docs/updated" vs "tone/JSON" |
| **PII detect** | Macie (S3 stored) | Comprehend (flowing text) | "S3-accumulated" vs "flowing" |
| **LLM response PII/harm** | Guardrails | (WAF/Macie wrong) | "LLM I/O" |
| **Internal search** | Kendra (NL/permissions) | OpenSearch (keyword/logs) | "Q&A/permissions" vs "logs/keyword" |
| **Drift detect** | Data Quality (no labels, fast) | Model Quality (labels, accuracy) | "labels lag" vs "labels present" |
| **Deploy validate** | Shadow (impact 0, mirror) | A/B (real traffic split) | "no impact" vs "some users" |
| **Self-design chips** | Inferentia (inference) | Trainium (training) | "inference cost" vs "training cost" |
| **ML orchestrator** | SageMaker Pipelines (ML) | Step Functions (general) | "Lineage/experiments/caching" vs "general" |

---

## 📝 12 Scenario Problems

**Problem 1.** "Internal wiki Q&A chatbot. Minimal ops. Data doesn't transit internet. PII can't leak. Docs update often. Best stack?"

A) SageMaker Endpoint + wiki fine-tune  
B) **Bedrock Knowledge Bases + Guardrails + VPC Interface Endpoint**  
C) Kendra search-only  
D) OpenSearch + self-RAG

**Answer: B** — Knowledge Bases (managed RAG, auto docs), Guardrails (PII mask), PrivateLink (no internet). Three conditions each map exactly. Fine-tuning (A) = doc retraining slow/expensive. Kendra (C) = search, not generative. Self-RAG (D) = ops burden.

---

**Problem 2.** "GPU training cost max cut. Spot reclaim risk. Multi-day train must complete. How?"

A) 1-year Reserved Instance, no interruption  
B) **Managed Spot Training + Checkpoint**  
C) Compute Savings Plans + auto On-Demand fallback  
D) On-Demand + epoch caching

**Answer: B** — Spot max 90% discount, Checkpoint ensures completion. (A/C) discounts don't hit 90%, no interrupt recovery. (D) no cost cut.

---

**Problem 3.** "User uploads 800MB satellite image. ~5min inference. Sync timeout. Traffic irregular. Best?"

A) Real-Time Endpoint  
B) Serverless  
C) **Async Inference**  
D) Batch Transform

**Answer: C** — Async handles 1GB payload, long inference, skips sync timeout via queue. (A/B) fail 6MB/60s limits. (D) batch, not per-user.

---

**Problem 4.** "Validate new recommendation model on live traffic. Zero user impact. Which strategy?"

A) Canary  
B) A/B  
C) **Shadow Endpoint**  
D) Multi-Model

**Answer: C** — Shadow mirrors traffic to new model, doesn't return output to users → zero impact. (A/B) = some users see new model → impact. (D) = cost optimization, not validation.

---

**Problem 5.** "Detect production model accuracy drop over time. Actual labels available. Which monitor?"

A) Data Quality  
B) **Model Quality**  
C) Clarify Bias  
D) Metrics only

**Answer: B** — Model Quality compares predictions vs actual labels for accuracy/precision/recall drop. (A) = distribution only, not accuracy. (C) = bias-focused. (D) = no ML drift detection.

---

**Problem 6.** "Process monthly supplier invoice PDFs. Extract items/amounts/taxes. Mask PII in text. Save to DB. Stack?"

A) Rekognition + Macie  
B) **Textract AnalyzeExpense + Comprehend**  
C) Comprehend + Kendra  
D) Lambda Tesseract + regex

**Answer: B** — AnalyzeExpense (invoice items/tax specialty), Comprehend (text PII mask). (A) = Rekognition object, Macie S3 scan. (C) = Kendra search, not extraction. (D) = direct build burden.

---

**Problem 7.** "Block PII and violence in LLM chatbot responses. Solution?"

A) AWS WAF  
B) **Bedrock Guardrails**  
C) Macie  
D) Comprehend + Lambda

**Answer: B** — Guardrails = LLM I/O safety filter (PII, violence, etc.). (A) = HTTP layer. (C) = S3 scan. (D) = text, not LLM-specific.

---

**Problem 8.** "Chatbot must call order-lookup API, analyze response, conditionally refund-call. Autonomous. Feature?"

A) Knowledge Bases  
B) **Bedrock Agents**  
C) Lambda  
D) Step Functions

**Answer: B** — Agents = LLM Tool Use orchestration. (A) = search. (C/D) = manual code/flow build.

---

**Problem 9.** "Predict variable traffic. Need throughput SLA. Long-term cut price. Which Bedrock plan?"

A) On-Demand  
B) **Provisioned Throughput**  
C) Spot  
D) Savings Plans

**Answer: B** — Provisioned reserves throughput, SLA, long-term discount. (A) = pay-per-token, no SLA. (C) = not applicable. (D) = compute, not Bedrock.

---

**Problem 10.** "1M customer photos flagged for violence/adult content. Auto-moderate? Strategy?"

A) Rekognition sync per-image  
B) **Rekognition async (StartContentModeration) + SNS**  
C) Lambda frame-process  
D) Comprehend batch

**Answer: B** — Async APIs (start job, results to S3, SNS notification) for bulk image processing. (A) = sync, slow for millions. (C) = inefficient. (D) = text.

---

**Problem 11.** "New model deployed; old still serving. Real traffic mirrored new model. Compare latency/error/predictions without user impact. Strategy?"

A) **Shadow Endpoint (Shadow Testing)**  
B) A/B (90:10 split)  
C) Canary (1% ramp)  
D) Blue/Green

**Answer: A** — Shadow mirrors traffic, doesn't return new model output → zero user impact for comparison. (B/C/D) = users receive new model → impact.

---

**Problem 12.** "Model retraining auto-trigger on drift. Retrain unsupervised when threshold breached. Approve before deploy. Workflow?"

A) CloudWatch → manual retrain  
B) **Model Monitor drift → EventBridge → SageMaker Pipeline → Model Registry approval → Lambda deploy**  
C) Lambda daily retrain  
D) Config compliance

**Answer: B** — Monitor drift-detect, EventBridge trigger auto-Pipeline retrain, Registry gate human approval, EventBridge (Approved) trigger Lambda deploy. Hybrid auto+governance. (A) = manual. (C) = unconditional. (D) = config.

---

## 📌 Week 10 Summary

1. **Abstraction levels** — Managed AI (result API) → Bedrock (model API) → SageMaker (model/infrastructure) → self-build
2. **ML/AI decision tree** — (1) Already solved? Managed AI. (2) Generative? Bedrock RAG. (3) Custom train/serve? SageMaker. (4) Post-ops? MLOps
3. **4 inference types** — Real-Time (resident, 6MB/60s), Serverless (cold-start, idle→0), Async (queue, 1GB payload), Batch (one-shot)
4. **Cost optimization** — Spot+Checkpoint (90% train cut), Inferentia (inference chip), Multi-Model Endpoint (long-tail sharing)
5. **Managed AI boundaries** — Macie=S3 PII vs Comprehend=text PII; Kendra=semantic vs OpenSearch=keyword; Textract AnalyzeExpense=receipts specialist
6. **MLOps runloop** — Data/Concept drift→Monitor→EventBridge→auto-Pipeline retrain→Model Registry approval→auto-deploy
7. **Feature Store** — Train-serve skew prevention; Online/Offline auto-sync; point-in-time correctness
