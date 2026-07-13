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

## 📝 연습 문제

**문제 1.** 사내 위키와 SharePoint에 흩어진 문서를 직원이 "작년 출장비 정산 규정이 뭐야?" 같은 자연어로 질문해 검색하게 하고, 문서별 접근 권한도 반영해야 한다. 가장 적합한 서비스는?

A) Amazon OpenSearch
B) Amazon Kendra
C) Amazon Athena
D) S3 Select

**정답: B**
해설: Kendra는 시맨틱(자연어) 검색에 특화된 엔터프라이즈 검색 서비스로, 자연어 질의를 이해하고 SharePoint·S3 등 커넥터와 문서 수준 권한(ACL)을 지원한다. A(OpenSearch)는 기본이 키워드·풀텍스트 검색으로 자연어 질의·권한 커넥터가 약하다(벡터를 직접 구성하면 가능하나 관리형 자연어 검색은 Kendra). C·D는 정형 데이터 쿼리용이지 문서 검색이 아니다. 함정: "자연어 질의 + 사내 문서 + 권한"은 Kendra, "키워드·로그 검색"은 OpenSearch.

---

**문제 2.** 월 수만 건의 공급사 청구서 PDF에서 품목·금액·세금을 자동 추출해야 한다. 가장 정확하고 적합한 API는?

A) Rekognition DetectText
B) Textract AnalyzeExpense
C) Comprehend
D) Lambda + 오픈소스 Tesseract OCR

**정답: B**
해설: Textract AnalyzeExpense는 영수증·청구서 전용 API로 품목·금액·세금·공급사를 구조적으로 자동 식별한다. 범용 AnalyzeDocument나 단순 OCR보다 청구서 도메인에서 정확하다. A(Rekognition DetectText)는 이미지 속 텍스트 검출용이지 청구서 구조 이해가 없다. C(Comprehend)는 텍스트 이해용이지 OCR/문서 추출이 아니다. D는 직접 구축 부담·정확도 열위. 함정: 청구서·영수증은 전용 AnalyzeExpense가 정답.

---

**문제 3.** 콜센터 통화 녹취(음성 파일)를 분석해 고객 감정(긍/부정)과 자주 언급되는 주제를 추출하려 한다. 어떤 조합인가?

A) Polly + Comprehend
B) Transcribe + Comprehend
C) Lex만
D) Connect만

**정답: B**
해설: 음성을 먼저 Transcribe(STT)로 텍스트화한 뒤, Comprehend로 감정 분석(DetectSentiment)과 주제 추출(토픽 모델링)을 한다. A(Polly)는 텍스트→음성(TTS)이라 방향이 반대. C(Lex)는 챗봇 봇 빌더. D(Connect)는 콜센터 플랫폼이지 자체 감정·주제 분석 엔진이 아니다(Contact Lens가 내부적으로 Transcribe+Comprehend를 쓴다). 함정: 음성 분석은 Transcribe(텍스트화) 후 Comprehend(분석).

---

**문제 4.** S3 버킷에 저장된 수백만 개 객체에 민감한 개인정보(PII)가 들어 있는지 식별하고 분류해 규정 준수를 점검해야 한다. 어떤 서비스인가?

A) Comprehend DetectPiiEntities
B) Amazon Macie
C) Amazon Inspector
D) Amazon GuardDuty

**정답: B**
해설: Macie는 S3에 저장된 데이터를 스캔해 PII·민감 정보를 식별·분류하고 보안 알림을 내는 데이터 보안·거버넌스 서비스다. A(Comprehend PII)는 API로 들어온 임의 텍스트의 PII 탐지용이지 S3 대량 스캔용이 아니다. C(Inspector)는 EC2/컨테이너 취약점 스캔, D(GuardDuty)는 위협 탐지로 PII와 무관. 함정: 대상이 S3면 Macie, 임의 텍스트면 Comprehend.

---

**문제 5.** 사용자가 업로드하는 사진에서 폭력·성인 콘텐츠를 자동으로 탐지해 차단해야 한다. 어떤 서비스/기능인가?

A) Rekognition Content Moderation
B) Comprehend
C) Macie
D) Textract

**정답: A**
해설: Rekognition Content Moderation(콘텐츠 검수)은 이미지·영상에서 폭력·성인·부적절 콘텐츠를 사전 학습된 모델로 탐지·분류한다. B(Comprehend)는 텍스트 NLP, C(Macie)는 S3 PII, D(Textract)는 문서 OCR로 모두 이미지 콘텐츠 검수와 무관. 함정: "이미지·영상 부적절 콘텐츠"는 Rekognition Content Moderation.

---

**문제 6.** EC2·RDS·Lambda로 구성된 운영 환경에서 비정상 지표·장애 징후를 자동으로 탐지하고 근본 원인과 권고를 받고 싶다. 어떤 서비스인가?

A) CloudWatch Alarm만
B) Amazon DevOps Guru
C) AWS Trusted Advisor
D) AWS Config

**정답: B**
해설: DevOps Guru는 ML로 운영 지표의 이상 패턴을 자동 탐지해 장애 징후·근본 원인·권고를 제시하는 운영 이상 탐지 서비스다. A(CloudWatch Alarm)는 임계값 기반 단순 알람으로 ML 이상 탐지·근본 원인 분석이 없다. C(Trusted Advisor)는 모범 사례 점검, D(Config)는 구성 규정 준수 평가로 운영 이상 탐지가 아니다. 함정: "운영 이상 자동 탐지 + 근본 원인"은 DevOps Guru.

---

**문제 7.** 1시간 분량의 강의 영상에서 등장하는 객체·장면·텍스트를 추출해야 한다. 처리에 수 분이 걸린다. 올바른 호출 패턴은?

A) Rekognition 이미지 동기 API를 프레임마다 호출
B) Rekognition Video 비동기 API(StartLabelDetection) + SNS 알림
C) Textract 비동기 API
D) Comprehend 배치 작업

**정답: B**
해설: 긴 비디오 분석은 처리에 수 분~수십 분이 걸려 동기 응답이 불가하므로, Rekognition Video 비동기 API(StartLabelDetection 등)로 S3의 비디오를 받아 작업을 시작하고 완료 시 SNS로 알림받는 패턴이 정석이다. A(프레임마다 동기 호출)는 비효율적이고 장면·움직임 추적이 안 된다. C(Textract)는 문서 OCR용. D(Comprehend)는 텍스트 분석용. 함정: "긴 비디오/대용량 처리"는 비동기 + SNS 알림.

---

## 📌 Today's Summary

1. **Pre-trained AI = build-vs-buy buy** — Already-solved ML problems via API. Domain-specific via Custom Labels/Classification (transfer learning)
2. **Map by input/output** — speech→Transcribe, text→Comprehend, docs→Textract, images→Rekognition, recommendations→Personalize
3. **Textract 4 types** — DetectText (OCR) / AnalyzeDocument (tables/forms) / AnalyzeExpense (receipts) / AnalyzeID (IDs)
4. **Macie vs Comprehend PII** — S3 stored data=Macie, arbitrary text=Comprehend (decision keyword: S3)
5. **Kendra vs OpenSearch** — Semantic (NL) + permissions=Kendra, keyword + logs=OpenSearch
6. **DevOps Guru** = ops anomaly detect + root cause, **CodeGuru** = code review + profile
7. **Sync vs Async** — Small/fast=sync, large/long (video/big PDF)=async + SNS alert
