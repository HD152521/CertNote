# Day 3 - Managed AI Services Deep Dive: Pre-trained AI Selection Logic and Sync/Async Patterns

80% of ML projects don't actually need "building models from scratch." Extracting amounts from receipts, converting speech to text, filtering inappropriate images, analyzing text sentiment—these are already solved problems. Collecting data and training models for these is wasteful in time, cost, and expertise. AWS's **Managed AI (pre-trained AI) Services** let you solve these "already-solved problems" with a single API call. In SAP-C02 exams, this domain tests **instant-recall matching: "which service fits this scenario?"** more than deep theory. But traps abound—distinguishing between Macie vs Comprehend PII, or Kendra vs OpenSearch, requires precision.

Today, instead of listing services, we'll deconstruct the category logic that splits them, why sync/async/batch calling patterns differ, and where the exam's most confusing boundaries lie.

## Pre-trained AI Value — The Clear "Build vs Buy" Answer

Imagine building your own OCR model. Label tens of thousands of documents, design a CNN, train on GPUs for days, tune accuracy, build serving infrastructure. Months and hundreds of thousands of dollars later, your result almost certainly won't beat AWS Textract—Textract trained on hundreds of millions of documents and AWS continuously improves it. This is why pre-trained AI is "almost always buy" in the build-vs-buy decision.

These services share common traits: (1) **instant use via API call**, (2) **zero infrastructure/model management**, (3) **usage-based pricing** (per page/minute/image processed). Direct models are only needed for "domain problems AWS services can't solve," and even then **transfer-learning customization** (like Custom Labels for Rekognition) solves many with minimal data.

> 💡 **Related Theory**: Pre-trained AI services rest on **transfer learning** and large-scale pretraining. AWS trains models on huge general datasets (e.g., Rekognition's object recognition, Comprehend's language understanding), and you add small amounts of your data on top to adapt to your domain (Custom Labels). This requires 100-1000x less data than training from scratch. Pretrained representations already capture general features; you tune only the last layer for your problem. ImageNet pretraining democratized computer vision the same way.

## Category Matrix — What Goes Where

| Category | Service | Core Function |
|----------|---------|----------------|
| **NLP (Text Understanding)** | Comprehend | Sentiment, entities, language detect, PII detect, topic modeling |
| **NLP-Medical** | Comprehend Medical | Medical text NER (diagnoses, drugs, dosages) |
| **Translation** | Translate | Multilingual real-time translation |
| **Speech→Text (STT)** | Transcribe (+Medical) | Speech recognition, speaker separation, auto subtitles |
| **Text→Speech (TTS)** | Polly | Neural TTS voice synthesis |
| **Document OCR** | Textract | Forms, tables, signatures, receipts, IDs |
| **Images/Video** | Rekognition | Objects, faces, content moderation, text, liveness |
| **Search** | Kendra | Enterprise semantic (natural language) search |
| **Chatbot** | Lex | Voice/text bot (Alexa engine) |
| **Recommendation** | Personalize | Real-time personalized recommendations |
| **Fraud** | Fraud Detector | Online fraud scoring |
| **Code/Ops** | CodeGuru / DevOps Guru | Code review/profile / ops anomaly detection |
| **Healthcare** | HealthLake / HealthOmics | FHIR data lake / genomics analysis |

What the exam asks: "What's the input and output?" Input is speech → Transcribe. Input is images → Rekognition. Input is documents (with layout) → Textract. Input is free text → Comprehend. Output is speech → Polly. Output is recommendations → Personalize.

## Textract Deep Dive — Not Just OCR, But Structure Understanding

Textract differs from generic OCR: it **understands document structure (layout)**. Simple OCR extracts "text from image." But invoices, contracts, IDs matter because "this number is the total, this row/column is quantity"—structural meaning matters. Textract splits this into purpose-specific APIs.

- **DetectDocumentText**: Basic text extraction (basic OCR)
- **AnalyzeDocument**: Tables, forms (key-value), signatures, queries—structured documents
- **AnalyzeExpense**: Receipts/invoices (items, amounts, taxes auto-identified)
- **AnalyzeID**: IDs (passport, license)—field extraction
- **Async APIs (StartDocumentAnalysis)**: Large multi-page PDFs—S3 input, results after completion

> 🔍 **Deep Dive**: Async APIs exist separately because of processing time. Single-page receipts finish in ~100ms synchronously, but multi-hundred-page PDFs take tens of seconds to minutes—sync HTTP would timeout. So large jobs call `StartDocumentAnalysis` (returns JobId), then receive SNS notifications or poll `GetDocumentAnalysis` for results. This "sync for small, async for large" pattern repeats in Rekognition Video, Transcribe, Comprehend batch—whenever processing time exceeds HTTP timeout, it's async.

> 🎯 **Scenario**: "Process monthly tens of thousands of supplier invoice PDFs automatically, extract items/amounts/taxes, mask operator PII from extracted data, store in DB. Best combination?" — Answer: **Textract AnalyzeExpense (invoice items/amounts/taxes) + Comprehend DetectPiiEntities (text PII detect/mask) + DynamoDB**. AnalyzeExpense specializes in receipts/invoices, auto-identifying items/amounts/taxes (more accurate than generic AnalyzeDocument). Extracted text's PII gets detected/masked by Comprehend. Trap: invoices use AnalyzeExpense (specialized, more accurate than generic AnalyzeDocument), arbitrary text PII uses Comprehend (S3-stored data uses Macie).

## Comprehend vs Macie — PII Detection Boundary

This is exam's recurring trap. Both detect PII but **target differs**.

- **Comprehend DetectPiiEntities**: PII in **arbitrary text**. Send text to API, get PII locations (names, SSNs, card numbers). Real-time text inspection during application flow.
- **Macie**: PII in **S3 buckets**. Scans S3, finds objects with sensitive info, raises security alerts. Data governance/compliance (where's sensitive data stored?).

The key: "is the target flowing text or S3-stored data?"

> ⚠️ **Trap**: "Detect PII" problems without explicit target look ambiguous. Decision keyword: **S3**. "Identify/classify PII in S3 bucket data" = Macie. "Call center transcripts/document content/API text PII" = Comprehend. Using Macie for arbitrary text or Comprehend for S3 governance are both wrong. Bonus: GuardDuty (threat detect), Inspector (vulnerability scan) are unrelated to PII; if they appear in PII problems they're traps.

## Kendra vs OpenSearch — Semantic Search vs Keyword Search

Another recurring boundary. Both search, different mechanics.

- **Kendra**: **Semantic (natural language) search**. "What's last year Q4 vacation policy?" understands intent, answers meaningfully. Internal data source connectors (SharePoint, S3, Confluence) and document-level permissions (ACLs) make it enterprise-specialized. ML-based.
- **OpenSearch**: **Keyword/full-text search** (inverted index). Fast, flexible, but fundamentally word-matching. Add vector search and it becomes semantic too, but "managed natural language queries" is Kendra's instant answer.

> 💡 **Related Theory**: Kendra's semantic search and RAG (Day 2) are cousins. Both aim to "find documents matching question intent." Difference: Kendra returns search results (documents, excerpts) directly; RAG feeds retrieved documents to LLMs for generative answers. Actually, Kendra can be Bedrock Knowledge Bases' search backend (Kendra retriever). In exams: "natural language query over internal docs" = Kendra, "search + generative conversation answer" = Bedrock RAG (KB), "keyword/log search" = OpenSearch.

## Sync vs Async vs Batch — Calling Pattern Logic

Managed AI calling patterns split on **processing time and data size**.

- **Synchronous**: Small input, fast processing. API call returns result immediately (Comprehend single-text sentiment, Rekognition single image, Textract one-page receipt).
- **Asynchronous**: Large input, long processing. Start job (get JobId), results written to S3, SNS notification (Rekognition Video, Textract large PDFs, Transcribe long recordings).
- **Batch**: Bulk dataset processing (Comprehend batch analysis jobs).

> 🔍 **Deep Dive**: Rekognition is sync for images, async for videos because of fundamental timing. Single image analysis finishes in ~100-500ms, so sync response works. One-hour video means frame extraction, object/face/scene tracking—takes minutes to tens of minutes. So video APIs take S3 videos as input, `StartLabelDetection` starts the job, SNS notifies on completion. Event-driven architecture (S3 → Lambda → Rekognition async → SNS → post-processing) follows naturally. In exams: "long video/large document analysis" is the async + SNS pattern.

## Lex, Connect, Personalize, Fraud Detector — Other Key Boundaries

**Lex** is a voice/text conversational bot builder (intent/slot-based) using the Alexa engine. **Connect** is a cloud call center platform; they integrate (Connect builds IVR with Lex bots). Exams: "bot itself" = Lex, "call center infrastructure" = Connect. Meanwhile **Personalize** is Amazon.com's recommendation tech as API—real-time personalization engine—and **Fraud Detector** scores online transaction fraud. Both exemplify "already solved problems"; there's no reason to build recommendation algorithms or fraud models yourself.

> 🔍 **Deep Dive**: Lex bots extract **intent (user's goal)** and **slots (parameters)** from user utterances via NLU. "Book me a meeting tomorrow at 3 PM" has intent "book meeting" and slots date=tomorrow, time=3PM. This is fundamentally different from RAG/LLM chatbots—Lex is deterministic conversation flows matching predefined intents; Bedrock Agents use LLM's flexible reasoning. Structured business workflows (booking, ordering, FAQs) suit Lex; open-ended knowledge conversations suit Bedrock. Exams: "structured voice/text bot" = Lex, "internal-knowledge open-form chatbot" = Bedrock RAG.

## Summary

Managed AI's core: "already-solved ML problems don't require building—call the API." Map services by input/output type (voice→Transcribe, docs→Textract, images→Rekognition, text→Comprehend), precisely distinguish similar services (Macie=S3 vs Comprehend=arbitrary text, Kendra=semantic vs OpenSearch=keyword), and use async+SNS when processing time runs long.

SAP exam common mappings: (1) "extract receipts/invoices" → Textract AnalyzeExpense, (2) "call center speech→sentiment" → Transcribe + Comprehend, (3) "image inappropriate content" → Rekognition Content Moderation, (4) "S3 PII identify" → Macie / "text PII" → Comprehend, (5) "internal natural language search" → Kendra, (6) "ops anomaly detect" → DevOps Guru, (7) "long video/large PDF" → async API + SNS. Next day: MLOps automating all this ML.

---

## 📝 Practice Questions

**Question 1.** Employees must be able to search documents scattered across an internal wiki and SharePoint by asking natural-language questions such as "What was the travel expense reimbursement policy last year?", and per-document access permissions must be respected. Which service is the most appropriate?

A) Amazon OpenSearch
B) Amazon Kendra
C) Amazon Athena
D) S3 Select

**Answer: B**
Explanation: Kendra is an enterprise search service specialized in semantic (natural-language) search; it understands natural-language queries and supports connectors such as SharePoint and S3 along with document-level permissions (ACLs). A (OpenSearch) is fundamentally keyword/full-text search, with weak natural-language query and permission connectors (it is possible if you build vectors yourself, but managed natural-language search is Kendra). C and D are for structured-data queries, not document search. Trap: "natural-language queries + internal documents + permissions" is Kendra; "keyword/log search" is OpenSearch.

---

**Question 2.** You must automatically extract line items, amounts, and taxes from tens of thousands of supplier invoice PDFs per month. Which API is the most accurate and appropriate?

A) Rekognition DetectText
B) Textract AnalyzeExpense
C) Comprehend
D) Lambda + open-source Tesseract OCR

**Answer: B**
Explanation: Textract AnalyzeExpense is an API dedicated to receipts and invoices that structurally identifies line items, amounts, taxes, and vendors automatically. It is more accurate in the invoice domain than the general-purpose AnalyzeDocument or plain OCR. A (Rekognition DetectText) detects text in images and has no understanding of invoice structure. C (Comprehend) is for text understanding, not OCR/document extraction. D has a build burden and inferior accuracy. Trap: for invoices and receipts, the dedicated AnalyzeExpense is the correct answer.

---

**Question 3.** You want to analyze call center call recordings (audio files) to extract customer sentiment (positive/negative) and frequently mentioned topics. Which combination should you use?

A) Polly + Comprehend
B) Transcribe + Comprehend
C) Lex only
D) Connect only

**Answer: B**
Explanation: First convert the audio to text with Transcribe (STT), then use Comprehend for sentiment analysis (DetectSentiment) and topic extraction (topic modeling). A (Polly) is text-to-speech (TTS), which is the opposite direction. C (Lex) is a chatbot builder. D (Connect) is a contact center platform, not a standalone sentiment/topic analysis engine (Contact Lens uses Transcribe + Comprehend internally). Trap: audio analysis is Transcribe (to text) followed by Comprehend (analysis).

---

**Question 4.** You must identify and classify whether millions of objects stored in S3 buckets contain sensitive personal information (PII) in order to check regulatory compliance. Which service should you use?

A) Comprehend DetectPiiEntities
B) Amazon Macie
C) Amazon Inspector
D) Amazon GuardDuty

**Answer: B**
Explanation: Macie is a data security and governance service that scans data stored in S3 to identify and classify PII and sensitive information and raises security alerts. A (Comprehend PII) detects PII in arbitrary text passed through its API and is not for bulk scanning of S3. C (Inspector) scans EC2/containers for vulnerabilities, and D (GuardDuty) is threat detection; neither relates to PII. Trap: if the target is S3, Macie; if it is arbitrary text, Comprehend.

---

**Question 5.** You must automatically detect and block violent or adult content in photos uploaded by users. Which service/feature should you use?

A) Rekognition Content Moderation
B) Comprehend
C) Macie
D) Textract

**Answer: A**
Explanation: Rekognition Content Moderation detects and classifies violent, adult, and inappropriate content in images and videos using pretrained models. B (Comprehend) is text NLP, C (Macie) is S3 PII, and D (Textract) is document OCR; all are unrelated to image content moderation. Trap: "inappropriate content in images/videos" is Rekognition Content Moderation.

---

**Question 6.** In a production environment made up of EC2, RDS, and Lambda, you want to automatically detect abnormal metrics and signs of failure and receive root causes and recommendations. Which service should you use?

A) CloudWatch Alarm only
B) Amazon DevOps Guru
C) AWS Trusted Advisor
D) AWS Config

**Answer: B**
Explanation: DevOps Guru uses ML to automatically detect anomalous patterns in operational metrics and presents signs of failure, root causes, and recommendations; it is an operational anomaly detection service. A (CloudWatch Alarm) is a simple threshold-based alarm with no ML anomaly detection or root cause analysis. C (Trusted Advisor) checks best practices, and D (Config) evaluates configuration compliance; neither is operational anomaly detection. Trap: "automatic operational anomaly detection + root cause" is DevOps Guru.

---

**Question 7.** You must extract the objects, scenes, and text that appear in a one-hour lecture video. Processing takes several minutes. What is the correct invocation pattern?

A) Call the Rekognition image synchronous API for every frame
B) Rekognition Video asynchronous API (StartLabelDetection) + SNS notification
C) Textract asynchronous API
D) Comprehend batch job

**Answer: B**
Explanation: Analyzing a long video takes several minutes to tens of minutes, so a synchronous response is not possible; the standard pattern is to use the Rekognition Video asynchronous API (such as StartLabelDetection), which takes the video in S3, starts a job, and sends an SNS notification on completion. A (synchronous calls per frame) is inefficient and cannot track scenes or motion. C (Textract) is for document OCR. D (Comprehend) is for text analysis. Trap: "long video / large-volume processing" is asynchronous + SNS notification.

---

## 📌 Today's Summary

1. **Pre-trained AI = build-vs-buy buy** — Already-solved ML problems via API. Domain-specific via Custom Labels/Classification (transfer learning)
2. **Map by input/output** — speech→Transcribe, text→Comprehend, docs→Textract, images→Rekognition, recommendations→Personalize
3. **Textract 4 types** — DetectText (OCR) / AnalyzeDocument (tables/forms) / AnalyzeExpense (receipts) / AnalyzeID (IDs)
4. **Macie vs Comprehend PII** — S3 stored data=Macie, arbitrary text=Comprehend (decision keyword: S3)
5. **Kendra vs OpenSearch** — Semantic (NL) + permissions=Kendra, keyword + logs=OpenSearch
6. **DevOps Guru** = ops anomaly detect + root cause, **CodeGuru** = code review + profile
7. **Sync vs Async** — Small/fast=sync, large/long (video/big PDF)=async + SNS alert
