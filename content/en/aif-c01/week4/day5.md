# Day 5 - Week 4 Comprehensive Review: Complete Map of AWS AI/ML Services

During Week 4, we skimmed the highest-weight area of the AIF-C01 exam—AWS's entire AI/ML service portfolio. We grasped Bedrock and SageMaker as two axes, saw managed AI services immediately usable below, and covered complete assistant Amazon Q.

Today we tie everything into **one sheet map**. In the exam, to instantly answer "what for this scenario," we'll organize purpose mapping and commonly confused pairs. This session is **review and integration**, not new concepts.

## Big Picture: Three-Layer View

AWS AI/ML services clarify when divided into 3 layers by "abstraction level."

| Layer | Character | Representative Services | Users |
|------|------|-------------|--------|
| AI Services (finished APIs) | Don't think about models, just call functions | Rekognition, Textract, Comprehend, Transcribe, Polly, Translate, Lex, Kendra, Personalize, Forecast | General developers |
| ML Platform | Build, train, deploy models directly | SageMaker | Data scientists/ML engineers |
| Generative AI / Assistants | FM building blocks or finished assistant | Bedrock, Amazon Q | Both |

Core intuition: **Higher = easier with less control; lower = harder with more control.** The exam distinguishes layers by "how much control needed / how much expertise / are existing models enough?"

> 💡 **Related theory**: AWS's design philosophy is "customers choose their abstraction level." Want quick feature attachment? Use finished AI services. Want to assemble generative apps? Use Bedrock. Want to control custom models? Use SageMaker. Reading which layer exam clues (expertise, control, infrastructure management willingness) point to is key.

## Core Purpose Mapping Table (Memorize)

| Task/Scenario | Answer Service |
|---------------|-------------|
| Detect objects, faces, inappropriate content in images/video | Rekognition |
| Extract tables, key-value pairs from documents (invoices, forms) | Textract |
| Analyze text sentiment, entities, language (NLP) | Comprehend |
| Speech → Text (transcription, captions) | Transcribe |
| Text → Speech (voice guidance, audiobooks) | Polly |
| Translate between languages | Translate |
| Intent/slot-based conversational chatbot | Lex |
| Enterprise internal document natural language search | Kendra |
| Personalized product/content recommendations | Personalize |
| Time series demand, sales forecasting | Forecast |
| Call multiple FMs via API without overhead | Bedrock |
| Build RAG chatbot with internal data | Bedrock + Knowledge Bases |
| Safe filtering of generative AI input/output | Bedrock Guardrails |
| Model performs multi-step actual tasks | Bedrock Agents |
| Train and deploy custom model with own data | SageMaker |
| Fast start and fine-tuning with pre-trained models | SageMaker JumpStart |
| Business-focused complete generative assistant | Amazon Q Business |
| Developer coding assistant | Amazon Q Developer |

This one sheet is Week 4's core asset. Reviewing it alone before the exam helps.

## Comparing Commonly Confused Service Pairs

Exams target subtle differences between similar-looking services.

| Comparison Pair | Difference Essence |
|---------|-------------|
| Bedrock vs SageMaker | **Rent** FMs vs **build** models directly |
| Bedrock vs Amazon Q | Building blocks (API) vs complete assistant (product) |
| Rekognition vs Textract | Image/video **analysis** vs document **data extraction** |
| Comprehend vs Kendra | Text **meaning analysis** vs document **search** |
| Transcribe vs Polly | Speech→Text (STT) vs Text→Speech (TTS) |
| Lex vs Bedrock Agents | Structured intent/slot bots vs FM reasoning flexible multi-step tasks |
| Personalize vs Forecast | Personalized **recommendations** vs time series **predictions** |
| RAG vs Fine-tuning | External knowledge **search and attach** vs model itself **additional training** |

> 🔍 **Going deeper**: Most frequently confused pairs: **Bedrock vs SageMaker** and **Rekognition vs Textract**. The former is distinguished by "control, expertise, infrastructure management willingness"; the latter by "generic image analysis / structured document extraction." One more: **RAG vs fine-tuning**—frequently changing facts or latest info use RAG; changing tone or domain ability itself use fine-tuning.

## Service Combination (Pipeline) Patterns

In practice and exams, services are **connected, not used alone**. Frequent patterns:

- **Call center analysis**: Transcribe (speech→text) → Comprehend (sentiment, entity analysis).
- **Simple interpretation**: Transcribe → Translate → Polly (convert, translate, reconvert to speech).
- **Generative Q&A**: Kendra/Knowledge Bases (search) → Bedrock (FM generates answer) = RAG.
- **Image review**: Rekognition (inappropriate content detection) → Human review (ambiguous cases only).
- **Document automation**: Textract (extraction) → Comprehend (entity/PII analysis) → downstream processing.

> 📚 **Case study**: An insurance company built a pipeline for claim processing: Textract extracts forms, Comprehend identifies and masks sensitive info (PII), then passes to auto-entry system. Not a single service but multiple AI services **assembled like Lego**. On the exam, when multi-step processing appears, recall this combination.

## Exam Prep Final Checklist

Self-check questions wrapping Week 4:

1. Can you distinguish Bedrock and SageMaker in one sentence? (Rent vs build directly)
2. What do RAG, Guardrails, and Agents each solve?
3. Can you immediately name the purpose of 6 AI services (Rekognition/Textract/Comprehend/Transcribe/Polly/Translate)?
4. Purpose of Lex/Kendra/Personalize/Forecast?
5. Difference between Amazon Q Business and Developer?
6. When to use RAG vs fine-tuning respectively?

If you answer these 6 without hesitation, Week 4's goal is achieved.

## Wrapping Up

Week 4's conclusion is clear. Understand AWS AI/ML services by **three abstraction layers** (finished AI services / SageMaker / generative/assistants), connect "clue → service" instantly with **purpose mapping tables**, catch differences between **confused service pairs**, and develop instinct for **combining services in pipelines**.

With this, we've conquered the exam's highest-weight section. From next week, we cover remaining domains: responsible AI, security/governance, and cost/evaluation, completing the picture needed to pass.

---

## 📝 練習 問題

**問題 1.** When dividing AWS AI/ML services by abstraction level, which does NOT belong to "call completed functions via API without worrying about models"?

A) Amazon Rekognition  
B) Amazon Comprehend  
C) Amazon SageMaker  
D) Amazon Translate  

**정答: C**  
해説: SageMaker is an ML platform layer where you train, deploy, and control models directly—not the finished API layer. A, B, D all belong to finished AI services where you call functions without worrying about models.

---

**問題 2.** You want your chatbot to answer with frequently changing internal latest info. Rather than retraining the model itself, what's the appropriate approach?

A) Fine-tune and retrain the model each time  
B) RAG to search external knowledge and attach to prompt  
C) Configure Guardrails  
D) Output via Polly  

**정答: B**  
해説: Frequently changing facts and latest info suit RAG to search and attach externally without retraining costs. A is costly and inefficient for frequent changes. C is safety filtering. D is speech synthesis—both unrelated to reflecting latest knowledge.

---

**問題 3.** Which most accurately explains the difference between Rekognition and Textract?

A) Rekognition processes speech, Textract translates  
B) Rekognition analyzes images/video; Textract extracts structured data from documents  
C) They're completely identical services  
D) Textract does recommendations, Rekognition does forecasting  

**정答: B**  
解說: Rekognition analyzes objects, faces, content in images and video; Textract specializes in extracting structured data like tables and key-values from documents. A describes unrelated functions. C is wrong—they're different services. D are Personalize and Forecast roles—unrelated.

---

**問題 4.** For a pipeline analyzing call center calls to understand customer sentiment, what's the most appropriate order?

A) Polly → Comprehend  
B) Transcribe → Comprehend  
C) Rekognition → Polly  
D) Translate → Forecast  

**정답: B**  
해説: Converting speech to text with Transcribe, then analyzing sentiment with Comprehend is the appropriate flow. A illogically converts text to speech then analyzes. C combines images and speech synthesis. D mixes translation and forecasting—none fit call sentiment analysis.

---

**問題 5.** A team has data science expertise and wants to directly train, deploy, and monitor domain-specialized predictive models using their own data. Which is the most appropriate layer/service?

A) Finished AI services (e.g., Comprehend)  
B) Amazon Q Business  
C) Amazon SageMaker  
D) Amazon Bedrock alone  

**정答: C**  
解說: Training, deploying, and monitoring custom models with own data under direct control requires SageMaker, the ML platform. A is finished API without model control. B is a business assistant product. D focuses on renting FMs, not building custom models directly.

---
