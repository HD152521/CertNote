# Day 2 - Domain Review 2: Foundation Model Applications (AWS AI Services) Key Summary

## 📌 Key Takeaways

- AWS AI services come in three layers: (1) ready-to-use **AI services (APIs)**, (2) **SageMaker** for building models yourself, and (3) **Bedrock and Amazon Q** for generative AI.
- Even with the same data, the **verb** separates the services. Pulling out the text is Textract, analyzing the meaning is Comprehend, creating something new is Bedrock.
- "Just calling an API = AI service / borrowing an FM = Bedrock / building and controlling the model yourself = SageMaker."
- The ways to adapt an FM to your use get more expensive in this order: **prompt → RAG → fine-tuning → training from scratch**. Up-to-date and in-house knowledge calls for RAG; internalizing a tone and expertise calls for fine-tuning.
- FM evaluation is done with human evaluation, benchmark datasets, automatic metrics (ROUGE, BLEU, BERTScore), and a judge model.

## Layer 1: Ready-to-Use AI Services (Pretrained APIs)

Today we organize Domain 3 (foundation model applications, 28%), which carries the most weight, and the service selection that shows up across several domains. AIF-C01 endlessly asks "Which AWS service best fits this situation?" The ability to quickly recall pairs of a service name and its "one-line purpose" is the score itself.

The first layer is managed services you use just by calling an API, with no ML knowledge. Each does "one thing" well.

| Service | One-line purpose | Keywords |
|--------|-----------|--------|
| **Amazon Rekognition** | Image and video analysis | Face/object/inappropriate content recognition |
| **Amazon Textract** | Extract text, tables, and forms from documents | Scanned documents, OCR |
| **Amazon Comprehend** | Analyze sentiment, entities, and language of text | Natural language understanding, sentiment analysis |
| **Amazon Transcribe** | Speech → text (STT) | Meeting minutes, subtitles |
| **Amazon Polly** | Text → speech (TTS) | Voice announcements, audiobooks |
| **Amazon Translate** | Language translation | Multilingual |
| **Amazon Lex** | Conversational chatbots/voicebots | Intents, voice assistants |
| **Amazon Personalize** | Personalized recommendations | Recommendation engine |
| **Amazon Forecast** | Time-series demand forecasting | Inventory/sales forecasting |
| **Amazon Kendra** | Intelligent enterprise search | Searching internal documents |

What these services have in common is that "you borrow a model AWS has already trained." Users just call the API without worrying about data, infrastructure, or the training process. So when "a team without ML specialists wants to add a feature quickly" appears, a service from this layer is almost always the answer. Conversely, if "we must build a model that fits our own data exactly," you move on to the next layer (SageMaker).

- The list of in-scope services in the current exam guide (machine learning category) includes Bedrock, Bedrock AgentCore, Comprehend, Lex, Nova, Personalize, Polly, Rekognition, SageMaker AI, SageMaker JumpStart, Textract, Transcribe, Translate, and AWS Transform. The list explicitly states that it is "not exhaustive and may change," so even for Forecast and Kendra, which are not on the list, know their roles, but spend more review time on the services that are on the list.
- AWS documentation notes that Amazon Forecast is no longer available to new customers, while existing customers can keep using it. The pairing "time-series forecasting = Forecast" is still a clue for solving questions.

## Pairs That Get Confused Within Layer 1

| Confusing pair | The question that separates them | Answer |
|------|------|------|
| Textract vs Comprehend | Pull out the text, or analyze its meaning? | Extraction = Textract, analysis = Comprehend |
| Textract vs Rekognition | Text and tables in a document, or objects and faces in a photo? | Document = Textract, scene = Rekognition |
| Transcribe vs Polly | Convert speech to text, or text to speech? | Dictation = Transcribe, reading aloud = Polly |
| Transcribe vs Translate | Dictate in the same language, or render into another language? | Dictation = Transcribe, translation = Translate |
| Lex vs Polly/Transcribe | Manage the flow of a conversation, or only convert? | Conversation = Lex, conversion = Polly/Transcribe |
| Kendra vs Comprehend | Find documents, or analyze the meaning of documents? | Finding = Kendra, analysis = Comprehend |
| Personalize vs Forecast | Recommendations per user, or forecasting future numbers? | Recommendation = Personalize, forecast = Forecast |

- Services are often **chained together**. Call recording → Transcribe → Comprehend (sentiment); scanned document → Textract → Comprehend (entities); foreign-language speech → Transcribe → Translate → Polly. When a combination appears in the answer choices, check that the order of the arrows matches the changes in the form of the data (speech → text → analysis).

## Layer 2: SageMaker, for Building Models Yourself

**Amazon SageMaker** is a fully managed platform for **building, training, and deploying** ML models **yourself**. If the API services above are "off-the-shelf," SageMaker is a "custom workshop." It covers the entire ML lifecycle from data preparation through training, tuning, deployment, and monitoring. The current AWS documentation and exam guide write this service under the name **Amazon SageMaker AI**.

| Feature | Purpose |
|------|------|
| **SageMaker Studio** | Integrated development environment (notebooks, experiments) |
| **SageMaker JumpStart** | Quick start with pretrained models and solutions |
| **SageMaker Data Wrangler** | Data preparation and preprocessing |
| **SageMaker Clarify** | Bias detection and model explainability |
| **SageMaker Model Monitor** | Monitoring data drift after deployment |

The key distinction: "just calling an API = AI services layer / building and controlling the model yourself = SageMaker."

What SageMaker takes responsibility for is "automating the repetitive work of the ML lifecycle." Model training comes with endless data cleaning, algorithm selection, hyperparameter tuning, GPU infrastructure management, and deployment and monitoring. SageMaker bundles these stages as a managed service so data scientists can focus on the model itself. So when you see words like "custom model," "train it yourself," or "MLOps," think of SageMaker.

- JumpStart is easy to confuse between Bedrock and SageMaker. Both handle pretrained models, but the difference is that with JumpStart, **you host, fine-tune, and control it yourself** in the SageMaker environment.

## Layer 3: Generative AI — Bedrock and Amazon Q

**Amazon Bedrock** is a fully managed service that lets you **call foundation models from multiple companies through a single API**. You can use a variety of FMs, such as those from Anthropic, Meta, and Amazon (Titan, Nova), without managing infrastructure, and you can customize them with your own data or set up RAG and agents. If you want to "host and serve FMs" or "pick from several models," it is Bedrock.

**Amazon Q** is AWS's generative AI assistant. There are two branches.

| Service | Purpose |
|--------|------|
| **Amazon Q Business** | A work AI assistant based on in-house data (search, summarization, question answering) |
| **Amazon Q Developer** | Coding assistance (code generation, explanation, AWS operations support) |

When you set up RAG yourself on top of Bedrock, two things often appear together: **Knowledge Bases for Bedrock** (embeds documents and provides them as grounding for search) and **Agents for Bedrock** (automatically performs multi-step tasks). Their names in current documentation are **Amazon Bedrock Knowledge Bases** and **Amazon Bedrock Agents**, respectively. The safety feature likewise circulates under both its old name "Guardrails for Amazon Bedrock" and its current name **Amazon Bedrock Guardrails**. Whichever way it appears in a question, it is the same feature.

> 💡 **Related theory**: The relationship between Bedrock and Amazon Q is closer to "engine and finished product." Bedrock is a building block for taking an FM and building an app yourself, and Amazon Q is a product already completed on top of it in the form of an assistant. So if "a developer builds a generative AI app themselves," Bedrock is the answer, and if "a ready-to-use in-house AI assistant is needed," Amazon Q is the answer. The decisive difference from SageMaker is that both use off-the-shelf FMs without training a new model.

| Bedrock feature | One-line role | Clue in the question |
|------|------|------|
| Knowledge Bases | Splits documents into pieces, embeds and searches them, and provides them as grounding (RAG) | "answer from in-house documents," "latest information," "without retraining" |
| Agents | Reasons through multiple steps and calls APIs to carry out tasks | "look up an order, then file a refund," "multiple steps" |
| Guardrails | Filters harmful content, PII, and topics from inputs and outputs | "block profanity and personal information," "forbid a specific topic" |
| Model Evaluation | Compares and evaluates several FMs on the same criteria | "which model fits our task" |
| Prompt Management | Creates and stores prompts, compares variants, and manages them by version | "reuse prompts," "version control" |

- The current exam guide gives, as examples of AWS services for developing generative AI applications, Bedrock, SageMaker AI, and SageMaker JumpStart along with **Amazon Quick** (a work AI helper that supports research, business insights, and automation), **Kiro** (an AI-based development environment), **Strands Agents** (an open-source framework for building agents), and **Amazon Bedrock AgentCore** (a platform for securely deploying and operating agents built with any framework or model). Since this is an introductory exam, it is enough to be able to pair each name with a one-line purpose.

## Five Ways to Adapt an FM to Your Use

The central question of Domain 3 is "What do you use to adapt the model to our work, and at what cost?"

| Method | Model weights | Cost and effort | Suitable situation |
|------|------|------|------|
| Prompt engineering (including in-context learning) | Unchanged | Lowest | When clear instructions or a few examples solve it |
| RAG | Unchanged | Medium (building and running a search store) | When up-to-date information or in-house knowledge is needed and sources must be shown |
| Fine-tuning | Changed | High (labeled data, training cost) | When a specific domain's tone, format, and expertise must be deeply learned |
| Continued pre-training | Changed | High (large amounts of unlabeled domain data) | When you want the model to learn a field's knowledge more broadly |
| Pre-training from scratch | Newly created | Highest | Almost never chosen. It requires enormous data and compute |

- **Model distillation** goes in a different direction. It teaches a small, cheap model (the student) with the responses of a large, expensive model (the teacher), aiming to get similar quality at lower cost and latency. The clue is "we want to lower inference cost while keeping quality."
- Fine-tuning data needs curation, governance, sufficient size, accurate labels, and representativeness. A method that uses human evaluation as a reward signal to refine the model (RLHF) is also a term in the exam guide.
- Branches of fine-tuning include instruction tuning, which refines the model to fit an instruction format; domain adaptation to a specific domain; and transfer learning, which carries what was learned on one task over to another.

| Clue in the question | Correct answer | Eliminated choice and why |
|------|------|------|
| "It must answer using the in-house policy that changed yesterday" | RAG | Fine-tuning: it must be retrained every time the policy changes |
| "The source document for the answer must be shown too" | RAG | Fine-tuning: it cannot point to a source |
| "Make it write consistently in the style specific to legal documents" | Fine-tuning | RAG: it supplies knowledge but does not internalize the tone |
| "Only the output format needs to match" | Few-shot prompting | Fine-tuning: excessive cost |
| "Answer as well as a large model, but cheaper and faster" | Model distillation | Training from scratch: the most expensive |

## The Parts That Make Up RAG

- Flow: split documents into **chunks** → an **embedding model** turns the chunks into vectors → store them in a **vector database** → turn the question into a vector as well and find the nearest chunks → put the found chunks into the prompt and have the FM answer.
- The AWS services the exam guide gives as vector databases that store embeddings are Amazon OpenSearch Service, Amazon Aurora, Amazon Neptune, and Amazon RDS for PostgreSQL. The list of in-scope services also includes Amazon DocumentDB.
- Amazon Bedrock Knowledge Bases bundles this flow (chunking, embedding, storing, searching) as a managed service.
- RAG does not change the model. If you edit a document, it is reflected from the very next question. This is why RAG suits frequently changing knowledge.

## Prompt Engineering: Techniques and Risks

| Technique | Description | Suitable situation |
|------|------|------|
| zero-shot | Give only the instruction, with no examples | Simple, common tasks |
| single-shot / few-shot | Show one example / a few examples | When the output format or classification criteria must be matched |
| chain-of-thought | Have it write out its thinking step by step | Multi-step reasoning and calculation |
| Prompt template | A reusable frame with only the varying parts left blank | When repeating requests in the same format |
| Negative prompt | State what you do not want | Specifying elements to exclude in image generation |

| Risk | Description |
|------|------|
| Exposure | Sensitive information leaks out through prompts or responses |
| Poisoning | Malicious content is planted in training data or reference documents |
| Hijacking | Instructions hidden in the input take over the model's original instructions |
| Jailbreaking | Bypassing safeguards to elicit prohibited output |

- As components of a prompt, the exam guide lists context, instruction, and negative prompt. The principles of a good prompt are to be specific yet concise, and to refine it through experimentation.

## Choosing and Evaluating Models

- **Selection criteria**: cost, modality (text, images, etc.), latency, multilingual support, model size and complexity, whether it can be customized, input and output length, prompt caching.
- **Inference parameters**: questions ask about the effect of temperature and input/output length on the response (summarized yesterday).
- **Pricing methods**: there is pay-per-token pricing, and provisioned throughput, which reserves processing capacity in advance. If usage is uneven, the former; if steady, high throughput must be guaranteed, the latter.

| Evaluation method | Description | Suitable situation |
|------|------|------|
| Human evaluation (human-in-the-loop) | People read and grade the responses | Subjective quality such as tone and usefulness |
| Benchmark datasets | Score with standard problems that have answers | Objective comparison between models |
| Amazon Bedrock model evaluation | Provides automatic evaluation, human evaluation, and judge-model evaluation | When choosing a model or knowledge base in Bedrock |
| ROUGE | The degree of overlap between generated text and reference text. Mainly for **summarization** | "Summary quality" |
| BLEU | The degree of overlap between generated text and reference translation. Mainly for **translation** | "Translation quality" |
| BERTScore | Uses embeddings to look at **semantic similarity** | Whether the meaning is the same even if the wording differs |
| LLM-as-a-judge | Another LLM grades the response and gives reasons | When replacing human evaluation at large scale |

- A high metric is useless if it does not fit the business goal. The exam guide gives task completion rate, user satisfaction, and cost per interaction as metrics for alignment with business goals.

## Quick Selection Guide: Situation → Service

The exam is ultimately a "situation → service" mapping. Here are the representative patterns, condensed.

- Extract text and tables from scanned receipts/contracts → **Textract**
- Identify objects, faces, and inappropriate content in photos → **Rekognition**
- Analyze positive/negative sentiment in customer reviews → **Comprehend**
- Call center recordings to text → **Transcribe**; the reverse → **Polly**
- Build a customer service chatbot → **Lex** (or Q Business)
- Product recommendations for an online shop → **Personalize**
- Pick a multilingual FM and integrate it into an app → **Bedrock**
- Train and deploy a custom model yourself → **SageMaker**

> 💡 **Related theory**: Even with the same "text," a different task means a different service. "Pulling out" the text is Textract (document OCR), "analyzing the meaning" of the text is Comprehend (NLU), and "creating" text is Bedrock/an LLM. The exam traps hide in these subtle verb differences ("extract vs. analyze vs. generate"), so building the habit of catching the verb in the question first raises your accuracy a great deal.

## Three Questions to Decide Which Layer

```
① Is one ready-made function enough? (dictation, translation, OCR, recommendation...)
   └─ Yes ─► Layer 1 AI services

② Do you need to create new content or hold free-form conversation?
   ├─ A ready-to-use assistant is needed ─► Amazon Q (work = Q Business, coding = Q Developer)
   └─ You build the app yourself ──────────► Amazon Bedrock

③ Must you train, tune, deploy, and control the model itself with your own data?
   └─ Yes ─► Amazon SageMaker (quick start with pretrained models = JumpStart)
```

- Look from the layer with the least operational burden first. If ① works, ①; if not, ②; if that still does not work, ③. When a qualifier such as "with minimal ML expertise" is attached, ③ is almost always the wrong answer.

In the next piece, we will summarize **responsible AI and security/governance**, corresponding to Domains 4 and 5, focusing on the main text. "Safe and responsible" carries as much weight on the exam as the technology does.

## 📖 Glossary

- **OCR**: Technology that reads the text in images or scanned documents as text.
- **STT / TTS**: Converting speech to text / converting text to speech.
- **Intent**: The user's intention that a chatbot must identify. Example: "cancel an order."
- **RAG (Retrieval-Augmented Generation)**: A method that retrieves relevant documents, puts them into the prompt, and has the model answer based on them.
- **Vector database**: A store that holds embedding vectors and finds those that are close in meaning.
- **Fine-tuning**: Additionally training a pretrained model on our own data to change its weights.
- **Model distillation**: A method of teaching a small model with the responses of a large model to lower cost and latency.
- **chain-of-thought**: A prompt technique that has the model write out its reasoning step by step before giving an answer.
- **Provisioned throughput**: A pricing method where a fixed processing capacity is reserved in advance and used.
- **LLM-as-a-judge**: An evaluation method where one LLM grades the responses of another LLM.

## 📝 Practice Questions

**Question 1.** Auto-extract text, tables, input form fields from scanned paper contract. Most fitting service?

A) Amazon Comprehend  
B) Amazon Textract  
C) Amazon Polly  
D) Amazon Translate  

**Answer: B**  
Explanation: Core verb "extract" on document target = Textract. Comprehend analyzes text meaning/sentiment, Polly → text-to-speech, Translate does language translation — none match text·table extraction.

---

**Question 2.** Without ML experts, want to call several companies' foundation models via single API and build generative AI app. Most fitting service?

A) Amazon SageMaker  
B) Amazon Rekognition  
C) Amazon Bedrock  
D) Amazon Forecast  

**Answer: C**  
Explanation: Bedrock lets you call multiple-provider FMs without infrastructure management via single API and customize/assemble RAG/agents. SageMaker is direct-train platform, Rekognition is image analysis, Forecast is time-series prediction — none match.

---

**Question 3.** Data science team wants to directly train custom ML model with company data, tune it, deploy it, and post-deployment monitor drift. Most fitting?

A) Amazon SageMaker  
B) Amazon Q Business  
C) Amazon Lex  
D) Amazon Kendra  

**Answer: A**  
Explanation: Full ML lifecycle (data prep → train·tune·deploy·monitor) is SageMaker's domain. Q Business is work AI assistant, Lex is chatbot, Kendra is enterprise search — not custom-model-build purposes.

---

**Question 4.** Build customer voice/chat bot with intent recognition and conversation flow management specialization. What service?

A) Amazon Polly  
B) Amazon Transcribe  
C) Amazon Lex  
D) Amazon Personalize  

**Answer: C**  
Explanation: Lex is intent-slot-based conversation chatbot/voice bot builder. Polly = text-to-speech, Transcribe = speech-to-text conversion only, Personalize = recommendation engine — none handle conversation flow.

---

**Question 5.** Critical difference between Bedrock and SageMaker?

A) Bedrock uses ready-made foundation models, SageMaker builds custom models from scratch·training directly  
B) Identical, names only differ  
C) Bedrock image-only, SageMaker text-only  
D) SageMaker can't train models  

**Answer: A**  
Explanation: Bedrock borrows pre-trained FMs from multiple providers, SageMaker builds/trains custom models with own data. Completely different purposes (B wrong), no data-type exclusivity (C wrong), SageMaker core is training (D wrong).

---
