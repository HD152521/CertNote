# Day 4 - AWS AI Services (2) + Amazon Q: Chatbots, Search, Recommendations, Forecasting, and Generative Assistant

Yesterday we saw 6 AI services handling images, documents, text, and speech. Today we cover the remaining core services—**Lex (chatbots), Kendra (search), Personalize (recommendations), Forecast (predictions)**—and AWS's generative AI assistant, **Amazon Q**. Finally, we'll tie all services by the criterion "which to choose?"

This area has the highest exam weight in AIF-C01. The essence remains **mapping purposes**: "Which service for this scenario?"

## Lex: Building Conversational Chatbots and Voice Bots

**Amazon Lex** is a service for building chatbots and voice bots. It uses the same engine underlying Amazon Alexa. Lex's two core concepts:

- **Intent**: The user's intended action (e.g., "book a flight").
- **Slot**: Information needed to fulfill that intent (e.g., departure, arrival, date).

Lex grasps the user's intent from speech, asks for missing slots, and guides conversation. Actual processing (executing a booking) connects to Lambda.

> 💡 **Related theory**: Lex provides **NLU (natural language understanding)** of voice/text input and conversation management. "Build a conversational bot to handle customer inquiries" is the Lex signal. You might confuse it with Bedrock Agents—Lex excels at structured intent/slot-based conversation bots, while Bedrock Agents perform flexible multi-step tasks through FM reasoning.

## Kendra: Intelligent Enterprise Internal Search

**Amazon Kendra** is a machine learning-based **enterprise search** service. It indexes documents scattered across internal wikis, PDFs, SharePoint, S3, etc. When employees ask in natural language, it finds the exact location with answers.

It's not simple keyword search—it understands "the meaning of the question" to find answers. Ask "How many days vacation?" and it pinpoints the exact paragraph in relevant policy documents.

> 🔍 **Going deeper**: Kendra powerfully handles the "retrieval" part of RAG, often used combined with Bedrock as the backend for generative Q&A. "Search across multiple company documents in natural language" is Kendra. Distinguish from Comprehend (text meaning analysis)—Kendra is "finding," Comprehend is "analyzing."

## Personalize & Forecast: Recommendations and Predictions

These two provide traditional ML work as managed services.

- **Amazon Personalize**: Real-time **recommendation system**. Servicized Amazon.com's recommendation tech—recommends "what people who saw this product would like."
- **Amazon Forecast**: **Time series prediction**. Forecasts future demand, sales, inventory based on past data.

| Service | Task | Use Cases |
|--------|------|-----------|
| Personalize | Personalized recommendations | Product/content recommendations, customized search |
| Forecast | Time series prediction | Demand forecasting, inventory planning, sales projection |

> 📚 **Case study**: An e-commerce company used Forecast to predict demand per store and product for inventory optimization, and Personalize for user-specific recommendations. Both implemented as managed APIs without a data science team. "Predict future numbers" is Forecast; "personalized recommendation per user" is Personalize.

## Amazon Q: AWS's Generative AI Assistant

**Amazon Q** is a generative AI-based assistant. It divides into two directions by use case.

| Distinction | Amazon Q Business | Amazon Q Developer |
|------|-------------------|--------------------|
| Target | General employees, business | Developers |
| Does | Question-answer and summarize based on internal data | Code generation, explanation, debugging, AWS task support |
| Connects To | Internal systems: wikis, documents, apps | IDE, AWS console/CLI |

- **Amazon Q Business**: A business assistant connecting to internal data—employees ask in natural language and get answers with evidence. (Feels like a ready-made enterprise RAG chatbot.)
- **Amazon Q Developer**: A developer assistant helping code writing, explanation, debugging, and answering AWS infrastructure questions. (Successor/expansion of past CodeWhisperer.)

> 💡 **Related theory**: Catch the Bedrock difference. Bedrock is "building blocks where I directly build generative apps (APIs)"; Amazon Q is "already-finished generative assistant products." If you'll design and develop a chatbot directly, use Bedrock; if you need a ready-to-use business/developer assistant, use Amazon Q.

## Service Selection Criteria: Organized in One Sheet

The most important thing in exams is the "clue → service" connection.

| Scenario Clue | Answer Service |
|---------------|-------------|
| Multiple FMs via API without overhead | Bedrock |
| Train and deploy custom model with own data | SageMaker |
| Analyze images/video | Rekognition |
| Extract data from documents (forms, tables) | Textract |
| Analyze text sentiment, entities (NLP) | Comprehend |
| Speech → text / Text → speech | Transcribe / Polly |
| Language translation | Translate |
| Conversational chatbot, voice bot | Lex |
| Enterprise internal natural language search | Kendra |
| Personalized recommendations | Personalize |
| Time series demand, sales prediction | Forecast |
| Business generative assistant (internal data) | Amazon Q Business |
| Developer coding assistant | Amazon Q Developer |

This table is Week 4's conclusion and the core asset affecting exam scores.

## Wrapping Up

Today added services: **Lex** (chatbots/voice bots with intent·slot), **Kendra** (enterprise natural language search), **Personalize** (recommendations), **Forecast** (time series predictions). And **Amazon Q** is a complete generative assistant, dividing into business-focused **Q Business** and developer-focused **Q Developer**. If Bedrock is "building blocks," Q is "complete product assistant."

Next, we'll comprehensively review all of Week 4. We'll organize all AI/ML services in one purpose mapping table and compare service pairs that confuse exams.

---

## 📝 連習 問題

**문제 1.** You want to build a conversational chatbot/voice bot handling customer inquiries using Intent and Slot concepts. Which is the most appropriate service?

A) Amazon Kendra  
B) Amazon Lex  
C) Amazon Forecast  
D) Amazon Polly  

**정답: B**  
해설: Lex builds chatbots and voice bots using intent-based and slot-based concepts. A is document search, C is time series forecasting, D is speech synthesis—all different from conversation bot building.

---

**문제 2.** You want employees to search documents scattered across internal wikis, PDFs, and SharePoint with natural language questions and find exact answer locations. Which is the most appropriate service?

A) Amazon Comprehend  
B) Amazon Translate  
C) Amazon Kendra  
D) Amazon Personalize  

**정답: C**  
해설: Kendra is ML-based enterprise search indexing documents from multiple sources, providing exact answer locations to natural language questions. A is text meaning analysis, B is translation, D is recommendations—searching isn't their primary business.

---

**문제 3.** You want to recommend "products users would like" in real time based on their past behavior. Which is appropriate?

A) Amazon Forecast  
B) Amazon Personalize  
C) Amazon Lex  
D) Amazon Textract  

**정답: B**  
해설: Personalize is a real-time personalized recommendation system servicizing Amazon.com's recommendation technology. A (Forecast) is time series numeric prediction, C is chatbots, D is document extraction—all unrelated to recommendations.

---

**문제 4.** Developers want immediate help with code generation, explanation, debugging, and AWS-related questions inside their IDE. Which is the most appropriate?

A) Amazon Q Developer  
B) Amazon Q Business  
C) Amazon Forecast  
D) Amazon Comprehend  

**정답: A**  
해설: Q Developer is a developer generative assistant supporting code writing, explanation, debugging, and AWS tasks. B (Q Business) is a business assistant for internal data—different target. C is forecasting, D is NLP—both unrelated to coding support.

---

**문제 5.** You want to immediately adopt a "complete, ready-made business generative assistant" without designing and developing a chatbot yourself, connecting to internal data to answer employee questions with evidence. Which is the most appropriate?

A) Amazon Bedrock  
B) Amazon Q Business  
C) Amazon SageMaker  
D) Amazon Lex  

**정답: B**  
해설: Q Business is a ready-made generative business assistant connecting to internal data, usable immediately without development. A (Bedrock) is building blocks for creating apps directly, C is a model training platform, D is a chatbot service you build yourself—all distant from "immediate adoption."

---
