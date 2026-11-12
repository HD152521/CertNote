# Day 3 - AWS AI Services (1): Managed APIs Handling Images, Documents, Text, and Speech

## 📌 Key Takeaways

- AWS AI services hide pre-trained models behind the scenes and expose **only finished capabilities as APIs**. You do not need to build or choose a model.
- Purpose mapping: **Rekognition** for images and video, **Textract** for extracting tables and forms from documents, **Comprehend** for analyzing the meaning of text, **Transcribe** for speech→text, **Polly** for text→speech, and **Translate** for translation.
- Tell the confusing pairs apart by input and purpose. Objects and faces in a photo mean Rekognition, and pulling fields from paperwork means Textract. Analyzing text that already exists means Comprehend.
- Services are used **connected in pipelines**. Call→text→sentiment (Transcribe→Comprehend), speech→translation→speech (Transcribe→Translate→Polly).
- Where a general model is weak, such as on specialized terms or classifications, supplement it with each service's custom features, and if that is still not enough, move on to SageMaker.

## The 6 Services at a Glance

The Bedrock and SageMaker we have seen so far were services that deal with "the model itself." The services we look at today are of a different kind. They are managed AI services that **finish a specific task with a single API call, without even needing to build or choose a model**. AWS calls these "AI Services."

- They hide models that AWS has pre-trained behind the scenes and expose only **finished capabilities** such as "find text in an image" and "speech to text."
- The AIF-C01 exam relentlessly asks "which service for this task?" The goal is to pair the **purposes** of the 6 core services precisely.

| Service | Input → Output | One-line purpose |
|--------|-------------|------------|
| Rekognition | Image/video → analysis results | Detects objects, faces, text, and inappropriate content |
| Textract | Document image → structured text | Extracts text, tables, and forms from documents (OCR+) |
| Comprehend | Text → semantic analysis | Analyzes sentiment, entities, key phrases, and language (NLP) |
| Transcribe | Speech → text | Speech recognition (STT) |
| Polly | Text → speech | Speech synthesis (TTS) |
| Translate | Text → translated text | Translation between languages |

This table is the core of today. The trick for memorizing it is to look first at **what the input is**. Photos and video mean Rekognition, paperwork means Textract, writing means Comprehend or Translate, sound means Transcribe, and turning writing into sound means Polly.

## Rekognition: Eyes That See Images and Video

**Amazon Rekognition** is a computer vision service that analyzes images and video.

- **Object and scene detection**: What is in the photo (a car, a puppy, a beach).
- **Face analysis and comparison**: Detecting faces, comparing whether two faces are the same person, and estimating expression and age range.
- **Text extraction**: Reading text inside images (signs, license plates).
- **Inappropriate content detection (content moderation)**: Filtering violent and sexually explicit images.
- **Celebrity recognition, labeling**, and more.

Going a bit deeper, there are three more features likely to appear on the exam.

- **Custom Labels**: Trains the service on your own images so it can find things a general model does not know, such as your company's logo, products, or parts. It is the answer to "I want to find our company's products in images without ML expertise."
- **Protective equipment (PPE) detection**: Checks whether workers are wearing hard hats, masks, and so on.
- **Face Liveness**: During face authentication, tells whether a real person is in front of the camera or someone is trying to cheat with a photo or video.

As a hypothetical example, a social media platform had people inspect, one by one, millions of images that users uploaded for inappropriate content. After introducing first-pass automatic filtering with Rekognition's content moderation API, people only needed to review the ambiguous cases, and the review staff shrank considerably. When a clue says "you must understand images/video," it is Rekognition.

- Detection results come with a **confidence score**. A setup like the case above, where high-scoring items are handled automatically and humans look only at the ambiguous range, is the typical form of Human-in-the-loop.
- Face analysis is a feature that touches people's rights. From a responsible AI perspective, you must check its purpose and limits before using it, which connects to Week 5.

## Textract: Truly Reading Documents

**Amazon Textract** goes beyond simple OCR. If ordinary OCR extracts "only the characters," Textract understands **even the structure of tables and forms**. It recognizes key-value pairs such as "Total: $1,200" in an invoice and extracts tables accurately by rows and columns.

| Feature | What it extracts | Example |
|------|------|------|
| Text detection | Printed and handwritten characters | The body of a scanned contract |
| Form and table analysis | Key-value pairs, row and column structure | "Name: Jane Doe" on an application, a quote table |
| Queries | The value of an item you asked about in natural language | "When is the payment due?" |
| Expense document analysis | Vendor, total, and line items of invoices and receipts | Automating expense reports |
| Identity document analysis | Fields on driver's licenses and passports (for U.S. government-issued IDs) | Processing identity verification documents |

> 💡 **Related theory**: Rekognition also reads text inside images, but Textract specializes in **document processing**. Its purpose is to pull data out of "structured documents" such as receipts, tax forms, insurance claims, and ID cards and process them automatically. On the exam, split them like this: "extract fields from a scanned invoice/form and enter them automatically" is Textract, and "analyze objects or faces in a photo" is Rekognition.

Even for the same "reading text," the targets differ. **One line on a sign** in a street photo is Rekognition, and **which value is in which box** on one sheet of paperwork is Textract.

## Comprehend: Grasping the Meaning of Text

**Amazon Comprehend** is a natural language processing (NLP) service that analyzes the meaning of text.

- **Sentiment analysis**: Positive, negative, neutral, and mixed (a blend of the two).
- **Entity recognition**: Extracting people, places, dates, and organizations.
- **Key phrases**, **language detection**, **topic modeling**.
- **PII detection**: Identifying personal information in text.

There is also **Comprehend Medical**, specialized for medical text.

- **Targeted sentiment**: Looks at sentiment per entity rather than for the whole document. In "The food was great but the delivery was late," the food is positive and the delivery is negative.
- **Comprehend Custom**: With your own data, you build a **custom classification** that sorts documents into your own taxonomy and a **custom entity recognition** that finds terms unique to your industry. The service handles the model design for you.

> 🔍 **Going deeper**: Comprehend analyzes meaning "when the text already exists." It works like automatically tallying the sentiment of thousands of customer reviews, or pulling people and dates out of documents to index them. The clue "analyze the sentiment/entities/language of text" is the key signal.

Comprehend **does not write new text.** It only classifies and extracts. If you need to produce a summary or a reply, that is a job for generative AI (Bedrock).

## Transcribe & Polly: Moving Between Speech and Text

These two go in opposite directions.

- **Amazon Transcribe (STT, Speech-to-Text)**: Speech → text. Transcribing meeting recordings, logging call center calls, generating captions. It also supports speaker diarization (who spoke).
- **Amazon Polly (TTS, Text-to-Speech)**: Text → speech. Reads text aloud in a natural human voice. Audiobooks, voice guidance, accessibility.

| Aspect | Transcribe | Polly |
|------|-----------|-------|
| Direction | Speech → text | Text → speech |
| Abbreviation | STT | TTS |
| Uses | Captions, call records | Voice guidance, audiobooks |

- Transcribe supports both **batch** processing of files uploaded to S3 and real-time **streaming**. Organizing recorded files is batch, and live-broadcast captions are streaming.
- If it mis-transcribes technical terms or proper nouns, supplement it with a **custom vocabulary** or a custom language model. It also has features for masking personal information in the transcript and filtering inappropriate words.
- There are variants tuned for call center call analysis and medical dictation (Call Analytics, Transcribe Medical).
- Polly offers several kinds of voices, such as standard, neural, long-form, and generative, and adjusts pronunciation, pauses, and speed with SSML tags.

As a hypothetical example, a call center used Transcribe to convert calls to text, then fed that text into Comprehend to analyze customer sentiment. It automatically flagged calls with strong complaint signals and notified managers. It is a typical example of **connecting several AI services in a pipeline** (speech→text→sentiment).

## Translate: Crossing the Language Barrier

**Amazon Translate** is a neural network-based machine translation service. It translates text from one language to another in real time. It is used for multilingual websites, translating customer support messages, real-time chat interpretation, and so on.

Translate is also often combined with other services. For example, if you transcribe foreign-language speech with Transcribe → translate it with Translate → output it as speech again with Polly, you get a simple interpretation pipeline.

- Words that must not be translated, or must be rendered in a fixed expression, such as brand and product names, are pinned with a **custom terminology**.
- A combination that translates reviews arriving in several languages into one language and then analyzes them with Comprehend is also common (Translate→Comprehend).

What these 6 services have in common is that they **"expose pre-trained models as APIs."** Users can use them right away without ML knowledge. However, in very specialized domains (for example, specialized medical terms or a company's own product names), a general model may be weak, so some services offer **custom model / user dictionary** features. If you still need "to train it yourself," you must move on to SageMaker.

## Telling Look-Alike Features Apart

| Confusing pair | Question that separates them | Answer |
|------|------|------|
| Rekognition text detection vs Textract | Is it text in a photo, or the structure of paperwork? | Signs and license plates = Rekognition, forms and tables = Textract |
| Comprehend vs Translate | Does it analyze the meaning of the text, or move it to another language? | Sentiment and entities = Comprehend, translation = Translate |
| Comprehend vs Bedrock (FM) | Does it pull out set items, or write new text? | Classification and extraction = Comprehend, writing summaries and replies = FM |
| Transcribe vs Polly | Is sound the input or the output? | Input = Transcribe, output = Polly |
| Comprehend PII vs Macie | Does it analyze a single piece of text, or sweep an S3 repository? | PII inside text = Comprehend, discovering sensitive data in S3 = Macie |
| Comprehend PII vs Bedrock Guardrails | Is it general text analysis, or controlling generative AI inputs and outputs? | Document and log analysis = Comprehend, masking chatbot conversations = Guardrails |

**A finished AI service or a foundation model?** These days an FM can also read images and translate. Even so, the exam has you pick the finished service by the following criteria.

| Criterion | Finished AI service | FM (Bedrock) |
|------|------|------|
| Task | One defined scope (sentiment, OCR, STT, and so on) | Open-ended and many things |
| Output | A set structure and confidence score, the same form every time | Free-form, varies with the prompt |
| Preparation | Just call the API | Prompt design and validation |
| Cues that fit | "No ML expertise," "least effort," "a specific task" | "Summarize/generate," "conversation," "flexible instructions" |

## Customization and Cost

| Service | Supplement when the general model is weak | Billing basis |
|------|------|------|
| Rekognition | Custom Labels (trained on your images) | Number of images analyzed, amount of video |
| Textract | Queries, custom queries | Amount of documents analyzed (rates differ by feature) |
| Comprehend | Custom classification, custom entity recognition | Amount of text analyzed, custom model training, and hours a real-time endpoint is kept up |
| Transcribe | Custom vocabulary, custom language model | Length of audio transcribed (per second), extra charges for some features |
| Polly | SSML, choice of voice type | Amount of text synthesized into speech |
| Translate | Custom terminology | Amount of text translated |

- All six services are **pay-as-you-go**, and there is no server to keep running in advance. The closest thing to an exception is the real-time endpoint of a custom model, which is billed for the time it is kept up.
- A pipeline adds a charge at every step. If you run one minute of a call through Transcribe→Translate→Comprehend, the charges of all three services apply.

**Common misconceptions.**

- "You have to prepare training data to use an AI service too" → The basic features are called right away with no data. Only the custom features need data.
- "Rekognition reads text, so it can also process documents" → It reads the characters, but table and key-value structure is Textract's job.
- "Sentiment analysis needs generative AI" → Positive/negative classification is enough with Comprehend, and the shape of the result is also consistent.
- "Polly transcribes calls" → The direction is reversed. Transcription is Transcribe.

## Scenario → Answer Decision Table

| Clue in the question | Answer | Eliminated option and why |
|------|------|------|
| "Filter out violent or sexually explicit images from uploaded photos" | Rekognition | Comprehend: it is for text |
| "Find workers not wearing hard hats in factory photos" | Rekognition (PPE detection) | Textract: it is for documents |
| "Pick out only the photos showing our company logo" | Rekognition Custom Labels | Training from scratch on SageMaker: too much effort |
| "Extract the claim amount and tables from a scanned insurance claim" | Textract | Rekognition: it does not understand structure |
| "Pull only the merchant and total from a receipt photo for expense processing" | Textract (expense document analysis) | Comprehend: it cannot read images directly |
| "Tally whether customer reviews are positive or negative" | Comprehend | Translate: it only translates |
| "Find national ID numbers and phone numbers in consultation records" | Comprehend (PII detection) | Rekognition: it is for images |
| "Transcribe a meeting recording by speaker" | Transcribe | Polly: the opposite direction |
| "Provide an audio version that reads the article text aloud" | Polly | Transcribe: the opposite direction |
| "Transcribe a foreign-language call, render it in English, and even analyze sentiment" | Transcribe → Translate → Comprehend | A single service: one service cannot finish it |

Tomorrow we look at the remaining AI services (Lex, Kendra, Personalize, Forecast) and Amazon Q, then tie all the services together by the criterion of "which one to pick for which task."

## 📖 Glossary

- **Computer vision**: The AI field that recognizes objects, faces, text, and so on in images and video.
- **OCR**: Technology that reads characters in an image out as text. Textract adds an understanding of table and form structure to it.
- **Key-value pair**: An item name paired with its value, like "Total: 1,200." It is the basic structure of form documents.
- **NLP (natural language processing)**: Technology that lets computers analyze and understand human writing.
- **Entity recognition**: Finding names such as people, places, dates, and organizations in writing.
- **PII**: Information that can identify an individual, such as name, address, and account number.
- **STT / TTS**: Turning speech into text (Speech-to-Text) and turning text into speech (Text-to-Speech).
- **Speaker diarization**: Separating who spoke which part of a recording.
- **Content moderation**: The work of finding and filtering inappropriate images, video, and text.
- **Confidence score**: A value showing how sure the service is about its own judgment. If it is low, hand off to human review.

## 📝 Practice Questions

**Question 1.** You want to detect objects and faces in user-uploaded photos and automatically filter inappropriate content. Which is the most appropriate service?

A) Amazon Comprehend  
B) Amazon Rekognition  
C) Amazon Polly  
D) Amazon Translate  

**Answer: B**  
Explanation: Rekognition is a computer vision service providing object and face detection and inappropriate content filtering from images and video. A is text NLP, C is speech synthesis, D is translation—all unrelated to image analysis.

---

**Question 2.** You want to extract key-value pairs like "Total" and "Date" and table data from a scanned invoice image into structured form. Which is the most appropriate service?

A) Amazon Textract  
B) Amazon Transcribe  
C) Amazon Rekognition  
D) Amazon Polly  

**Answer: A**  
Explanation: Textract extracts not just text but table and form key-value structure—a document processing service. While C (Rekognition) reads text in images, Textract specializes in structured document extraction. B is speech recognition, D is speech synthesis—both unrelated.

---

**Question 3.** You want to automatically classify thousands of customer reviews as positive or negative and extract entities like people and places from text. Which service is appropriate?

A) Amazon Translate  
B) Amazon Comprehend  
C) Amazon Textract  
D) Amazon Lex  

**Answer: B**  
Explanation: Comprehend provides text meaning analysis (NLP): sentiment analysis, entity recognition, key phrase extraction. A is translation, C is document extraction. D (Lex), a chatbot building service, isn't primarily for bulk text meaning analysis.

---

**Question 4.** You want to convert call center recording to text and then analyze the text's customer sentiment. Which service combination is appropriate?

A) Polly → Translate  
B) Transcribe → Comprehend  
C) Rekognition → Textract  
D) Translate → Polly  

**Answer: B**  
Explanation: The pipeline is appropriate: Transcribe converts speech to text (STT), then Comprehend analyzes the text for sentiment. A is illogical (text to speech then translate). C is for images/documents. D is translation then speech synthesis—doesn't fit call sentiment analysis.

---

**Question 5.** You want to convert your website's guidance text to natural-sounding human voice and play it. Which is the most appropriate service?

A) Amazon Transcribe  
B) Amazon Polly  
C) Amazon Comprehend  
D) Amazon Rekognition  

**Answer: B**  
Explanation: Polly synthesizes text into natural-sounding speech—a TTS service. A (Transcribe) is the opposite, converting speech to text (STT). C is text meaning analysis, D is image analysis—both unrelated to speech synthesis.

---
