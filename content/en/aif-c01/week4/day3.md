# Day 3 - AWS AI Services (1): Managed APIs Handling Images, Documents, Text, and Speech

So far, Bedrock and SageMaker dealt with "models themselves." Today's services are different. **You don't even need to build or choose models—one API call finishes specific tasks**—these are managed AI services. AWS calls them "AI Services."

They hide models AWS pre-trained behind the scenes and expose only **finished capabilities** like "find text in images" or "speech to text." The AIF-C01 exam obsessively asks "which service for this task?" Today's goal is precisely memorizing the **purposes** of 6 core services.

## 6 Services at a Glance

| Service | Input → Output | One-line Purpose |
|--------|-------------|------------|
| Rekognition | Image/video → Analysis | Detect objects, faces, text, inappropriate content |
| Textract | Document image → Structured text | Extract text, tables, forms from documents (OCR+) |
| Comprehend | Text → Semantic analysis | Analyze sentiment, entities, key phrases, language (NLP) |
| Transcribe | Speech → Text | Speech recognition (STT) |
| Polly | Text → Speech | Speech synthesis (TTS) |
| Translate | Text → Translated text | Translate between languages |

This table is today's essence. Let's explore each one.

## Rekognition: Eyes for Seeing Images and Video

**Amazon Rekognition** is a computer vision service analyzing images and video.

- **Object and scene detection**: What's in a photo (cars, dogs, beaches).
- **Face analysis and comparison**: Detect faces, compare if two faces are the same person, estimate emotion and age range.
- **Text extraction**: Read text in images (signs, license plates).
- **Inappropriate content detection (content moderation)**: Filter violence and explicit images.
- **Celebrity recognition, labeling**, etc.

> 📚 **Case study**: An SNS platform had people manually review millions of user-uploaded images for inappropriate content. After implementing Rekognition's content moderation API for first-pass auto-filtering, humans only reviewed ambiguous cases—review staff dropped dramatically. "Understand images/video" is the Rekognition cue.

## Textract: Really Reading Documents

**Amazon Textract** goes beyond simple OCR. While basic OCR "extracts only text," Textract understands **table and form structure**. It recognizes key-value pairs like "Total: $1,200" in invoices and accurately extracts tables by row and column.

> 💡 **Related theory**: Rekognition also reads text in images, but Textract specializes in **document processing**. The goal is extracting data from structured documents like receipts, tax forms, insurance claims, ID cards for automatic processing. On the exam, "extract fields from scanned invoice/form for auto-entry" is Textract; "analyze objects or faces in photos" is Rekognition.

## Comprehend: Understanding Text Meaning

**Amazon Comprehend** is a natural language processing (NLP) service analyzing text meaning.

- **Sentiment analysis**: Positive/negative/neutral.
- **Entity recognition**: Extract people, places, dates, organizations.
- **Key phrases, language detection, topic modeling**.
- **PII detection**: Identify personal information in text.

There's also **Comprehend Medical**, specialized for medical text.

> 🔍 **Going deeper**: Comprehend analyzes meaning "when text already exists." Auto-aggregate sentiment from thousands of customer reviews or extract people and dates from documents for indexing. "Analyze sentiment/entities/language of text" is the key signal.

## Transcribe & Polly: Moving Between Speech and Text

These two work opposite directions.

- **Amazon Transcribe (STT, Speech-to-Text)**: Speech → Text. Meeting recording transcription, call center recording, caption generation. Supports speaker separation (who said it).
- **Amazon Polly (TTS, Text-to-Speech)**: Text → Speech. Reads text in natural human voice. Audiobooks, voice guidance, accessibility.

| Distinction | Transcribe | Polly |
|------|-----------|-------|
| Direction | Speech → Text | Text → Speech |
| Acronym | STT | TTS |
| Use Cases | Captions, call records | Voice guidance, audiobooks |

> 📚 **Case study**: A call center converted calls to text with Transcribe, then fed the text to Comprehend to analyze customer sentiment. It auto-flagged calls with strong dissatisfaction signals and alerted managers. A typical example of **connecting AI services in a pipeline** (speech→text→sentiment).

## Translate: Crossing Language Barriers

**Amazon Translate** is a neural-network-based machine translation service. It translates text from one language to another in real time. Used for multilingual websites, translating customer support messages, real-time chat interpretation, etc.

Translate also frequently combines with other services. For example, Transcribe foreign speech to text → Translate it → Polly outputs it as speech again—a simple interpretation pipeline.

> 💡 **Related theory**: The common point in these 6 services is they **"expose pre-trained models as APIs."** Users can use them immediately without ML knowledge. However, very specialized domains (e.g., specialized medical terms, company product names) might be weak for general models, so some services offer **custom model/user dictionary** features. If you still need "direct training," you move to SageMaker.

## Wrapping Up

Today's essence is **mapping purposes**. Images and video → **Rekognition**, extract documents (forms, tables) → **Textract**, text meaning analysis (NLP) → **Comprehend**, speech→text → **Transcribe**, text→speech → **Polly**, translation → **Translate**. And you can **connect them in pipelines** for more powerful flows (call→text→sentiment, speech→translation→speech).

Next, we'll see remaining AI services (Lex, Kendra, Personalize, Forecast) and **Amazon Q**, then tie all services by the criterion of "what to choose for what task."

---

## 📝 연習 問題

**問題 1.** You want to detect objects and faces in user-uploaded photos and automatically filter inappropriate content. Which is the most appropriate service?

A) Amazon Comprehend  
B) Amazon Rekognition  
C) Amazon Polly  
D) Amazon Translate  

**정답: B**  
해설: Rekognition is a computer vision service providing object and face detection and inappropriate content filtering from images and video. A is text NLP, C is speech synthesis, D is translation—all unrelated to image analysis.

---

**問題 2.** You want to extract key-value pairs like "Total" and "Date" and table data from a scanned invoice image into structured form. Which is the most appropriate service?

A) Amazon Textract  
B) Amazon Transcribe  
C) Amazon Rekognition  
D) Amazon Polly  

**정답: A**  
해설: Textract extracts not just text but table and form key-value structure—a document processing service. While C (Rekognition) reads text in images, Textract specializes in structured document extraction. B is speech recognition, D is speech synthesis—both unrelated.

---

**問題 3.** You want to automatically classify thousands of customer reviews as positive or negative and extract entities like people and places from text. Which service is appropriate?

A) Amazon Translate  
B) Amazon Comprehend  
C) Amazon Textract  
D) Amazon Lex  

**정답: B**  
해설: Comprehend provides text meaning analysis (NLP): sentiment analysis, entity recognition, key phrase extraction. A is translation, C is document extraction. D (Lex), a chatbot building service, isn't primarily for bulk text meaning analysis.

---

**問題 4.** You want to convert call center recording to text and then analyze the text's customer sentiment. Which service combination is appropriate?

A) Polly → Translate  
B) Transcribe → Comprehend  
C) Rekognition → Textract  
D) Translate → Polly  

**정답: B**  
해설: The pipeline is appropriate: Transcribe converts speech to text (STT), then Comprehend analyzes the text for sentiment. A is illogical (text to speech then translate). C is for images/documents. D is translation then speech synthesis—doesn't fit call sentiment analysis.

---

**問題 5.** You want to convert your website's guidance text to natural-sounding human voice and play it. Which is the most appropriate service?

A) Amazon Transcribe  
B) Amazon Polly  
C) Amazon Comprehend  
D) Amazon Rekognition  

**정答: B**  
해説: Polly synthesizes text into natural-sounding speech—a TTS service. A (Transcribe) is the opposite, converting speech to text (STT). C is text meaning analysis, D is image analysis—both unrelated to speech synthesis.

---
