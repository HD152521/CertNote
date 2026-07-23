# Day 2 - Domain Review 2: Foundation Model Applications (AWS AI Services) Critical Summary

Today we organize "most frequently appearing on the surface" exam area. **AWS AI/ML Services**, exactly. AIF-C01 endlessly asks "which service best fits this situation?" Service name-and-use-case quick-recall ability directly means points.

Services organize in three layers: ① **AI Services (APIs)** used immediately, ② **SageMaker** for building models yourself, ③ generative AI-based **Bedrock and Amazon Q**. Today compress all three layers at once.

## Layer 1: Ready-to-Use AI Services (Pretrained APIs)

Managed services you use via API calls alone without ML knowledge. Each does "one thing well." This mapping is half the exam.

| Service | One-Line Use Case | Keywords |
|--------|-----------|--------|
| **Amazon Rekognition** | Analyze images·videos | Face/object/inappropriate content recognition |
| **Amazon Textract** | Extract text·tables·forms from documents | Scanned docs, OCR |
| **Amazon Comprehend** | Analyze text sentiment·entities·language | Natural language understanding, sentiment analysis |
| **Amazon Transcribe** | Speech → Text (STT) | Meeting notes, subtitles |
| **Amazon Polly** | Text → Speech (TTS) | Voice guidance, audiobooks |
| **Amazon Translate** | Language translation | Multilingual |
| **Amazon Lex** | Conversational chatbot/voice bot | Intents, voice assistant |
| **Amazon Personalize** | Personalized recommendations | Recommendation engine |
| **Amazon Forecast** | Time-series demand prediction | Inventory/sales forecast |
| **Amazon Kendra** | Intelligent enterprise search | Internal document search |

> 💡 **Related Theory**: Common to these services: "AWS borrows you already-trained models." You don't fuss with data, infrastructure, training — just call the API. So "ML-less team wants quick feature" nearly always gets answer from this layer. Contrast: "must build model exactly fitting our data" → next layer (SageMaker).

## Layer 2: Build Models Yourself — SageMaker

**Amazon SageMaker** is the fully managed platform **building, training, deploying models yourself**. If Layer 1 is "off-the-shelf," SageMaker is "custom workshop." Handles data prep through training, tuning, deployment, monitoring — entire ML lifecycle.

Few key features worth exam memory:

| Feature | Purpose |
|------|------|
| **SageMaker Studio** | Integrated dev environment (notebook, experiments) |
| **SageMaker JumpStart** | Pretrained models, quick-start solutions |
| **SageMaker Data Wrangler** | Data prep, preprocessing |
| **SageMaker Clarify** | Bias detection, model explainability |
| **SageMaker Model Monitor** | Post-deployment data drift monitoring |

Core distinction: "API call only = AI Services layer / build model yourself and control = SageMaker."

> 💡 **Related Theory**: SageMaker responsibility is "automate repetitive ML lifecycle tasks." Training involves endless data cleanse, algorithm choice, hyperparameter tuning, GPU infrastructure management, deployment and monitoring. SageMaker bundles these managed, letting data scientists focus on the model itself. So "custom model," "direct training," "MLOps" keywords → think SageMaker.

## Layer 3: Generative AI — Bedrock and Amazon Q

Two core services for the generative AI era.

**Amazon Bedrock** is a fully managed service **calling multiple companies' foundation models via one API**. Use diverse FMs from Anthropic, Meta, Amazon(Titan) without infrastructure management, customize with your own data, or assemble RAG and agents. "Host/serve FMs" or "want choice of multiple models" → Bedrock.

**Amazon Q** is AWS's generative AI assistant. Two varieties:

| Service | Purpose |
|--------|------|
| **Amazon Q Business** | Work AI assistant based on internal data (search, summarization, Q&A) |
| **Amazon Q Developer** | Coding aid (code generation, explanation, AWS operations support) |

**Knowledge Bases for Bedrock** (embed documents, offer as search foundation) and **Agents for Bedrock** (auto-perform multi-step work) frequently appear alongside Bedrock RAG setup.

> 💡 **Related Theory**: Bedrock and Amazon Q relate as "engine to finished product." Bedrock is FM building block you build apps from directly, Amazon Q is already-complete-as-assistant product on top. So "developer builds generative AI app directly" → Bedrock, "immediately need in-company AI assistant" → Amazon Q. Critical difference from SageMaker: neither retrain models fresh — both leverage ready-made FMs.

## Quick Selection Guide: Situation → Service

Exams always ask "situation → service" mapping. Compress frequent patterns:

- Extract text·tables from scanned receipt/contract → **Textract**
- Identify object/face/inappropriate content in photo → **Rekognition**
- Analyze positive/negative sentiment in customer review → **Comprehend**
- Call center recording to text → **Transcribe**, reverse → **Polly**
- Build customer service chatbot → **Lex** (or Q Business)
- Recommend shopping products → **Personalize**
- Pick diverse FM, integrate into app → **Bedrock**
- Custom model train, deploy directly → **SageMaker**

> 💡 **Related Theory**: Same "text" but different task → different service. Pulling out text is Textract(document OCR), analyzing text meaning is Comprehend(NLU), generating text is Bedrock/LLM. Test trap hides in this subtle verb difference ("extract vs analyze vs create"). First-highlighting-problem-verb habit hugely boosts answer rate.

## Summary

Today organized AWS AI services into three layers. First, **ready-to-use API services** (Rekognition·Textract·Comprehend·Transcribe·Polly·Translate·Lex·Personalize·Forecast·Kendra) work one thing well with no ML knowledge. Second, **SageMaker** is the custom model direct-build platform. Third, **Bedrock** is the generative AI engine borrowing multiple FMs, **Amazon Q** is the completed AI assistant. "Situation's verb → service" mapping is the point essence.

Next text organizes **Responsible AI and Security/Governance** (Domains 3·4) mainly by document. Technology AND "safe·responsible" operation carry equal exam weight.

---

## 📝 Practice Questions

**문제 1.** Auto-extract text, tables, input form fields from scanned paper contract. Most fitting service?

A) Amazon Comprehend  
B) Amazon Textract  
C) Amazon Polly  
D) Amazon Translate  

**정답: B**  
해설: Core verb "extract" on document target = Textract. Comprehend analyzes text meaning/sentiment, Polly → text-to-speech, Translate does language translation — none match text·table extraction.

---

**문제 2.** Without ML experts, want to call several companies' foundation models via single API and build generative AI app. Most fitting service?

A) Amazon SageMaker  
B) Amazon Rekognition  
C) Amazon Bedrock  
D) Amazon Forecast  

**정답: C**  
해설: Bedrock lets you call multiple-provider FMs without infrastructure management via single API and customize/assemble RAG/agents. SageMaker is direct-train platform, Rekognition is image analysis, Forecast is time-series prediction — none match.

---

**문제 3.** Data science team wants to directly train custom ML model with company data, tune it, deploy it, and post-deployment monitor drift. Most fitting?

A) Amazon SageMaker  
B) Amazon Q Business  
C) Amazon Lex  
D) Amazon Kendra  

**정답: A**  
해설: Full ML lifecycle (data prep → train·tune·deploy·monitor) is SageMaker's domain. Q Business is work AI assistant, Lex is chatbot, Kendra is enterprise search — not custom-model-build purposes.

---

**문제 4.** Build customer voice/chat bot with intent recognition and conversation flow management specialization. What service?

A) Amazon Polly  
B) Amazon Transcribe  
C) Amazon Lex  
D) Amazon Personalize  

**정답: C**  
해설: Lex is intent-slot-based conversation chatbot/voice bot builder. Polly = text-to-speech, Transcribe = speech-to-text conversion only, Personalize = recommendation engine — none handle conversation flow.

---

**문제 5.** Critical difference between Bedrock and SageMaker?

A) Bedrock uses ready-made foundation models, SageMaker builds custom models from scratch·training directly  
B) Identical, names only differ  
C) Bedrock image-only, SageMaker text-only  
D) SageMaker can't train models  

**정답: A**  
해설: Bedrock borrows pre-trained FMs from multiple providers, SageMaker builds/trains custom models with own data. Completely different purposes (B wrong), no data-type exclusivity (C wrong), SageMaker core is training (D wrong).

---
