# Day 5 - Week 4 Comprehensive Review: Complete Map of AWS AI/ML Services

## 📌 Key Takeaways

- View AWS AI/ML services as **three layers of abstraction**: finished AI services where you only call a capability, SageMaker where you build the model yourself, and FM building blocks (Bedrock) plus the finished assistant (Amazon Q).
- Narrow a service question down in this order and one answer remains: **is it one defined task → what is the input → is generation needed → will you build it yourself?**
- Separate the confusing pairs with one word: Bedrock (rent) vs SageMaker (build), Rekognition (analyze) vs Textract (extract), Comprehend (analyze) vs Kendra (search), RAG (attach) vs fine-tuning (train).
- Services are used not alone but in **pipelines**. Transcribe→Comprehend, Textract→Comprehend, search→Bedrock (RAG).
- Traps usually come from an "excessive choice." Choosing SageMaker for work a finished service can complete, or fine-tuning for work prompts and RAG can complete, is a wrong answer.

## The Big Picture: Seeing It in 3 Layers

During Week 4 we swept across AWS's whole range of AI/ML services. We took the two axes of Bedrock and SageMaker, and below them the managed AI services you can use right away, and then the finished assistant Amazon Q. Today we tie all of this into **one map**, so that at the exam you can answer the question "what for this scenario?" immediately.

It becomes clear if you divide AWS AI/ML services into 3 layers by "level of abstraction."

| Layer | Nature | Representative services | Users |
|------|------|-------------|--------|
| AI services (finished APIs) | Do not worry about the model, just call the capability | Rekognition, Textract, Comprehend, Transcribe, Polly, Translate, Lex, Kendra, Personalize, Forecast | General developers |
| ML platform | Build, train, and deploy your own model | SageMaker | Data scientists / ML engineers |
| Generative AI / assistant | FM building block or finished product assistant | Bedrock, Amazon Q | Both |

The core intuition: **the higher up you go, the easier it is and the less control you have; the lower down you go, the harder it is and the more control you have.** The exam separates the layers by "how much control is needed / how much expertise is available / is an existing model enough."

> 💡 **Related theory**: AWS's design philosophy is "the customer chooses the level of abstraction they want." If you want to add a capability quickly, use a finished AI service; to assemble a generative app, use Bedrock; to control a custom model, use SageMaker. The key is reading which layer the clues in the exam question (expertise, control, willingness to manage infrastructure) point to.

## The Core Purpose-Mapping Table (Must Memorize)

| Task/scenario | Answer service |
|---------------|-------------|
| Detect objects, faces, and inappropriate content in images/video | Rekognition |
| Extract tables and key-values from documents (invoices, forms) | Textract |
| Text sentiment, entity, and language analysis (NLP) | Comprehend |
| Speech → text (transcription, captions) | Transcribe |
| Text → speech (voice guidance, audiobooks) | Polly |
| Translation between languages | Translate |
| Conversational chatbot based on intents/slots | Lex |
| Natural-language search over internal documents | Kendra |
| Personalized product and content recommendation | Personalize |
| Time-series demand and sales forecasting | Forecast |
| Several FMs through an API without management | Bedrock |
| Building a RAG chatbot on internal data | Bedrock + Knowledge Bases |
| Safety filtering of generative AI inputs and outputs | Bedrock Guardrails |
| A model performing real work across multiple steps | Bedrock Agents |
| Train and deploy a custom model on your own data | SageMaker |
| Quick start with a pre-trained model, fine-tuning | SageMaker JumpStart |
| Finished generative assistant for work | Amazon Q Business |
| Coding assistant for developers | Amazon Q Developer |

This one table is the key asset of Week 4. Reviewing just this right before the exam helps a great deal.

## Comparing Service Pairs That Are Easy to Confuse

The exam aims at the fine differences between services that look similar.

| Pair compared | Core of the difference |
|---------|-------------|
| Bedrock vs SageMaker | **Rent** an FM vs **build** a model yourself |
| Bedrock vs Amazon Q | Building block (API) vs finished assistant (product) |
| Rekognition vs Textract | **Analyzing** images/video vs **extracting data** from documents |
| Comprehend vs Kendra | Text **meaning analysis** vs document **search** |
| Transcribe vs Polly | Speech→text (STT) vs text→speech (TTS) |
| Lex vs Bedrock Agents | A structured intent/slot bot vs flexible multi-step work based on FM reasoning |
| Personalize vs Forecast | Personalized **recommendation** vs time-series **forecasting** |
| RAG vs fine-tuning | **Retrieving and attaching** external knowledge vs **additionally training** the model itself |

> 🔍 **Going deeper**: The pairs easiest to confuse are **Bedrock vs SageMaker**, and **Rekognition vs Textract**. Separate the former by "control, expertise, and willingness to manage infrastructure," and the latter by "general image analysis, or structured document extraction." One more, **RAG vs fine-tuning**: frequently changing facts and up-to-date information call for RAG, and changing the tone or a specific domain ability itself calls for fine-tuning.

## Decision Order: Ask Four Times and One Remains

Instead of memorizing the mapping table whole, if you internalize the order of the questions, you can solve a passage you are seeing for the first time.

```
① Is it one defined task? (sentiment classification, transcription, translation, recommendation…)
   ├─ Yes ─► ② What is the input?
   │          ├─ Photos, video ──────────► Rekognition
   │          ├─ Paperwork (tables, forms) ─► Textract
   │          ├─ Text (analysis) ────────► Comprehend      Text (translation) ─► Translate
   │          ├─ Sound → text ───────────► Transcribe      Text → sound ─► Polly
   │          ├─ Conversation with a set procedure ─► Lex
   │          └─ Behavior records, time series ─► Personalize (recommendation) / Forecast (numeric prediction)
   └─ No ──► ③ Must it newly create text or images, or answer open-ended questions?
              ├─ Yes ─► ④ Will you build it yourself, or use it right away?
              │          ├─ Assemble yourself ─► Bedrock (+knowledge = Knowledge Bases, +action = agents, +safety = Guardrails)
              │          └─ Use right away ───► Amazon Q (work = Q Business, coding = Q Developer)
              └─ No (my own prediction model on my data) ─► SageMaker (quick start = JumpStart)
```

- If you skip ①, you get it wrong. This is where the mistake of seeing "review sentiment classification" and going straight to Bedrock comes from. If a finished service exists for a defined task, it is the "least effort" answer.
- In ③, the signals for "generation" are words like summarize, draft, conversation, and question answering. Classification, extraction, and detection are not generation.
- The signals for ④ are staff and time. "A development team builds a custom app" means Bedrock, and "employees use it right away with no development" means Amazon Q.

## New Perspective 1: Who Takes On What

We place the same services again by "the scope I am responsible for." The further right you go, the more work is yours, and the more you can do it your way.

| Work taken on | Finished AI services | Amazon Q | Bedrock | SageMaker |
|------|------|------|------|------|
| Provisioning servers and GPUs | AWS | AWS | AWS | AWS (I choose instance type and count) |
| Model selection | AWS | AWS | **Me** | **Me** |
| Preparing training data | Not needed (only for custom features) | Not needed (connect internal documents) | Not needed (only for RAG and customization) | **Me** |
| Prompt and app design | Not needed | Almost not needed | **Me** | **Me** |
| Training, tuning, and deployment method | AWS | AWS | AWS | **Me** |
| Access permissions (IAM) and input data | **Me** | **Me** | **Me** | **Me** |

- The bottom row is my share at every layer. An option saying "it's managed, so AWS handles security too" is wrong. This is the point that leads into next week's shared responsibility model.
- "There are no ML experts" in a passage points to the left of the table, and "fine-grained control" points to the right.

## New Perspective 2: Where the Money Goes

| Service | Main billing basis | When not in use |
|------|------|------|
| Rekognition, Textract, Comprehend, Translate, Polly | Amount of images, documents, and text processed | No cost |
| Transcribe | Length of audio transcribed | No cost |
| Lex | Number of text and voice requests | No cost |
| Kendra | The index you keep up | **Billed continuously** |
| Bedrock (on-demand) | Input tokens + output tokens | No cost |
| Bedrock (Provisioned Throughput) | Throughput reserved × hours | **Billed continuously** |
| SageMaker real-time endpoint | Hours the instances are up | **Billed continuously** |
| SageMaker serverless inference, batch transform | As much as it processes | No cost |
| Amazon Q Business | User subscription + index capacity | Billed as long as the subscription is maintained |

- The exam's "cost efficiency" questions usually ask about the **shape of the traffic**. If it is intermittent, go with the pay-per-use side; if it is steady and large, go with the reserve-in-advance side.
- Cost-saving clues for generative AI: shorten prompts and responses, pick a smaller model suited to the task, use batch inference if no immediate answer is needed, and use prompt caching for long repeated prefixes.

## New Perspective 3: A Map of Changed Names

Even if an unfamiliar name appears in an option, if you read it by its role, it is the same slot.

| Role | Old or familiar name | Name in the latest exam guide and documentation |
|------|------|------|
| ML platform | Amazon SageMaker | Amazon SageMaker AI |
| Multi-step task agent | Amazon Bedrock Agents | Amazon Bedrock AgentCore (the existing one is Agents Classic), with Strands Agents as the framework |
| Generative assistant for work | Amazon Q Business | Amazon Quick |
| BI dashboards | Amazon QuickSight | Quick Sight in Amazon Quick |
| Coding assistant for developers | CodeWhisperer → Amazon Q Developer | Kiro |
| Internal document search | Amazon Kendra (not open to new customers) | Directed to Bedrock Knowledge Bases |
| Time-series forecasting | Amazon Forecast (not open to new customers) | Directed to SageMaker Canvas |

- The latest guide's list of in-scope ML services is Bedrock, Bedrock AgentCore, Comprehend, Lex, Nova, Personalize, Polly, Rekognition, SageMaker AI, SageMaker JumpStart, Textract, Transcribe, Translate, and AWS Transform. The guide states that the list is illustrative and may change.

## Service Combination (Pipeline) Patterns

In both practice and the exam, services are used **connected, not alone**. Representative patterns:

- **Call center analysis**: Transcribe (speech→text) → Comprehend (sentiment and entity analysis).
- **Simple interpretation**: Transcribe → Translate → Polly (convert to text, translate, then back to speech).
- **Generative Q&A**: Kendra/Knowledge Bases (search) → Bedrock (the FM generates the answer) = RAG.
- **Image review**: Rekognition (detect inappropriate content) → human review (only ambiguous cases).
- **Document automation**: Textract (extraction) → Comprehend (entity and PII analysis) → follow-up processing.

A pipeline question is solved by checking just **whether the output of the earlier step matches the input format of the later step**. Comprehend takes text, so what comes before it must be Transcribe or Textract, which output text. Polly takes text and produces sound, so it comes at the very end.

As a hypothetical example, an insurance company built a pipeline for claims processing that extracts forms with Textract, identifies and masks sensitive information (PII) with Comprehend, and then passes the result to an automatic entry system. The key is that it **assembled several AI services like Lego**, not a single service. When "processing that goes through several steps" appears on the exam, recall this kind of combination.

## Scenario Practice: From the Clue to the Answer

These are situations that do not overlap with the practice questions. Cover the decisive-clue column and answer first.

| Situation | Decisive clue | Answer | Eliminated option and why |
|------|------|------|------|
| An online shop wants to automatically write draft replies to product inquiries. There is no ML team | "Writes a draft," "no ML team" | Bedrock | SageMaker: there are no staff to build the model |
| The same shop wants replies to reflect the latest shipping policy | "Latest," "policy documents" | Knowledge Bases (RAG) | Fine-tuning: retrain every time the policy changes |
| Replies have started showing a customer's phone number as is | "Personal information in the output" | Guardrails | Knowledge Bases: it supplies knowledge and does not filter |
| A hospital wants to keep consultation recordings as text | "Recording → text" | Transcribe | Polly: the opposite direction |
| A bank wants to auto-fill the income and address fields from scanned loan applications | "Scanned," "fields" | Textract | Rekognition: it does not understand form structure |
| A news app shows each reader a different article list on the first screen | "Different for each reader" | Personalize | Forecast: it is for numeric prediction |
| A logistics company predicts next month's regional cargo volume to deploy vehicles | "Next month," "cargo volume" | Forecast | Personalize: it is for recommendations |
| A telecom handles plan changes through a phone voicebot | "Voicebot," "set procedure" | Lex | Polly: it only speaks and cannot lead a conversation |
| An insurer builds a fraud detection model from its own accident data and must explain the reasons for its decisions | "Own data," "explain the reasons" | SageMaker (+Clarify) | Bedrock: numeric judgments with regulation and explanation are traditional ML |
| A development team wants code suggestions and explanations inside the editor | "Inside the editor" | Q Developer (Kiro) | Q Business: for business use |
| Adopt an assistant that all employees can ask about the internal wiki, with no development | "No development," "all employees" | Q Business (Amazon Quick) | Lex: you would have to design the bot yourself |
| A travel app assistant proceeds on its own through checking the itinerary, changing seats, and even payment | "Multiple steps," "on its own" | Agent | Knowledge Bases: it only reads |

## Commonly Mistaken Thoughts → Corrections

| Easily mistaken thought | Correction |
|------|------|
| "For any AI problem, start with Bedrock" | If it is one defined task, a finished AI service comes first |
| "To raise accuracy, fine-tune" | The order is prompt → RAG → fine-tuning. Facts the model does not know are solved with RAG |
| "If text comes out, it's Textract" | A sign or license plate in a photo is Rekognition, and tables and forms in paperwork are Textract |
| "If it deals with documents, it's Kendra" | Finding is Kendra, pulling out sentiment and entities is Comprehend, writing an answer is RAG |
| "If it's a chatbot, it's Lex" | A set procedure is Lex, deciding on its own and using tools is an agent, a finished product is Amazon Q |
| "Guardrails also puts in internal knowledge" | It is a filtering mechanism. Knowledge Bases puts in knowledge |
| "SageMaker has nothing to do with generative AI" | You deploy and fine-tune FMs with JumpStart |
| "If it's managed, the cost drops by itself" | Endpoints, indexes, and Provisioned Throughput left up are billed even when not used |

## Exam Prep Closing Check

Questions to check yourself as you finish Week 4:

1. Can you tell Bedrock and SageMaker apart in one sentence? (rent vs build yourself)
2. What does each of RAG, Guardrails, and Agents solve?
3. Can you state the purpose of the 6 AI services (Rekognition/Textract/Comprehend/Transcribe/Polly/Translate) immediately?
4. What are the purposes of Lex/Kendra/Personalize/Forecast?
5. What is the difference between Amazon Q Business and Developer?
6. When do you use RAG and when fine-tuning?

If you can answer these 6 without hesitation, Week 4's goal is achieved.

From next week we cover the remaining domains such as responsible AI, security and governance, and cost and evaluation, completing the picture needed to pass.

## 📖 Glossary

- **Level of abstraction**: How much a service hides its internals. The higher it is, the easier it is, and the lower it is, the more you can control.
- **Finished AI service**: A service that hides a pre-trained model and exposes only capabilities as an API. Rekognition, Comprehend, and so on.
- **ML platform**: A collection of tools for building, training, and deploying your own models. SageMaker fits this.
- **Building block**: A component-type service you assemble to make a product. Bedrock is the representative example.
- **Pipeline**: A processing flow that chains the output of one service into the input of the next.
- **RAG**: A method of retrieving relevant documents and attaching them to the prompt so the model answers from them. The model is not changed.
- **Fine-tuning**: A method of changing the model itself through additional training. It builds tone and specialized-task performance into the model.
- **On-demand billing**: A pricing method in which you pay only for what you use, without reserving in advance.
- **Shared responsibility model**: The principle that AWS is responsible for infrastructure security, and the customer is responsible for access permissions and data.

## 📝 練習 問題

**Question 1.** When dividing AWS AI/ML services by abstraction level, which does NOT belong to "call completed functions via API without worrying about models"?

A) Amazon Rekognition  
B) Amazon Comprehend  
C) Amazon SageMaker  
D) Amazon Translate  

**Answer: C**  
Explanation: SageMaker is an ML platform layer where you train, deploy, and control models directly—not the finished API layer. A, B, D all belong to finished AI services where you call functions without worrying about models.

---

**Question 2.** You want your chatbot to answer with frequently changing internal latest info. Rather than retraining the model itself, what's the appropriate approach?

A) Fine-tune and retrain the model each time  
B) RAG to search external knowledge and attach to prompt  
C) Configure Guardrails  
D) Output via Polly  

**Answer: B**  
Explanation: Frequently changing facts and latest info suit RAG to search and attach externally without retraining costs. A is costly and inefficient for frequent changes. C is safety filtering. D is speech synthesis—both unrelated to reflecting latest knowledge.

---

**Question 3.** Which most accurately explains the difference between Rekognition and Textract?

A) Rekognition processes speech, Textract translates  
B) Rekognition analyzes images/video; Textract extracts structured data from documents  
C) They're completely identical services  
D) Textract does recommendations, Rekognition does forecasting  

**Answer: B**  
Explanation: Rekognition analyzes objects, faces, content in images and video; Textract specializes in extracting structured data like tables and key-values from documents. A describes unrelated functions. C is wrong—they're different services. D are Personalize and Forecast roles—unrelated.

---

**Question 4.** For a pipeline analyzing call center calls to understand customer sentiment, what's the most appropriate order?

A) Polly → Comprehend  
B) Transcribe → Comprehend  
C) Rekognition → Polly  
D) Translate → Forecast  

**Answer: B**  
Explanation: Converting speech to text with Transcribe, then analyzing sentiment with Comprehend is the appropriate flow. A illogically converts text to speech then analyzes. C combines images and speech synthesis. D mixes translation and forecasting—none fit call sentiment analysis.

---

**Question 5.** A team has data science expertise and wants to directly train, deploy, and monitor domain-specialized predictive models using their own data. Which is the most appropriate layer/service?

A) Finished AI services (e.g., Comprehend)  
B) Amazon Q Business  
C) Amazon SageMaker  
D) Amazon Bedrock alone  

**Answer: C**  
Explanation: Training, deploying, and monitoring custom models with own data under direct control requires SageMaker, the ML platform. A is finished API without model control. B is a business assistant product. D focuses on renting FMs, not building custom models directly.

---
