# Day 4 - AWS AI Services (2) + Amazon Q: Chatbots, Search, Recommendations, Forecasting, and Generative Assistant

## 📌 Key Takeaways

- **Lex** is a chatbot/voicebot service based on intents and slots, **Kendra** is natural-language search over internal documents, **Personalize** is personalized recommendation, and **Forecast** is time-series forecasting.
- **Amazon Q** is a finished generative assistant. It splits into **Q Business** for work, which answers from internal data, and **Q Developer** for developers, which helps with coding.
- Bedrock is a **building block** you assemble yourself, and Amazon Q is a **finished product assistant** you use right away. Lex is a bot with a set conversation flow, while an agent is flexible multi-step work driven by FM reasoning.
- "Finding" is Kendra, and "analyzing" is Comprehend. "What for whom" is Personalize, and "when and how much" is Forecast.
- Names and availability are changing. Kendra, Forecast, and Q Business are not open to new customers, and the successors pointed to are Bedrock Knowledge Bases, SageMaker Canvas, and **Amazon Quick**, with **Kiro** on the coding assistant side.

## Lex: Building Conversational Chatbots and Voicebots

Yesterday we looked at 6 AI services that handle images, documents, text, and speech. Today we look at the remaining core services, Lex (chatbots), Kendra (search), Personalize (recommendations), and Forecast (forecasting), along with AWS's generative AI assistant Amazon Q, and then tie together every service we have seen so far by the criterion of "what to choose." The core is still **purpose mapping**, that is, "which service fits this scenario?"

**Amazon Lex** is a service for building chatbots and voicebots. It has been introduced as the same family of conversational technology used in Amazon Alexa, offered as a service. Lex's two core concepts:

- **Intent**: What the user is trying to do (for example, "book a flight").
- **Slot**: The information needed to fulfill that intent (for example, departure, destination, date).

Lex works out the intent from what the user says, asks again for any missing slots, and leads the conversation. The actual processing (executing the booking) is connected through Lambda.

```
User: "Book me a flight to Busan tomorrow"
  └ Intent detection → book a flight
  └ Slot filling → destination=Busan, date=tomorrow, departure=(empty)
Lex : "Where will you be departing from?"          ← asks again for the empty slot
User: "Seoul"
  └ Slots complete → call Lambda (execute the booking) → "Your booking is complete"
```

- The person building the bot writes **a few example sentences** for each intent. Lex builds a language model from them, so it understands other phrasings such as "get me a ticket to Busan" as the same intent.
- For voice input, the speech recognition (ASR) inside Lex converts it to text before processing. You do not need to attach Transcribe separately when building a voicebot.
- The charge depends on the **number of requests** for text and voice processed.

> 💡 **Related theory**: Lex provides **NLU (natural language understanding)** that understands voice/text input, along with conversation management. The clue "I want to build a conversational bot that handles customer inquiries" is the Lex signal. It can be confused with Bedrock Agents, but Lex is strong at building structured, intent/slot-based conversation bots, whereas Bedrock Agents is strong at performing multi-step tasks more flexibly through FM reasoning.

## Kendra: Smart Internal Enterprise Search

**Amazon Kendra** is a machine learning-based **enterprise search** service. It indexes documents scattered across the internal wiki, PDFs, SharePoint, S3, and so on, and when an employee asks a question in natural language, it finds where the accurate answer is.

It is not simple keyword search. It understands "the meaning of the question" to find the answer. If you ask "How many days of vacation do I get?", it points to the exact paragraph of the relevant policy document.

- It connects several repositories through **connectors** and gathers them into one index.
- The organization's **access permissions** can be reflected in search results. Documents a user cannot view are filtered out of the search too.
- An index is billed from the moment you provision it, even if it is empty and even if there are no queries. It is closer to "as long as you keep it up" than to "as much as you use."
- **Current status**: Kendra is no longer open to new customers (existing customers continue to use it), and AWS points to **Amazon Bedrock Knowledge Bases** for a similar purpose. Kendra is also absent from the latest exam guide's list of in-scope services. Still, the pairing "natural-language search over internal documents = Kendra" remains widespread in past exam question types and study materials, so be aware of it.

> 🔍 **Going deeper**: Kendra can take on the "retrieval" part of RAG powerfully, so it is used together with Bedrock as the backend of generative Q&A. "Natural-language search across multiple internal documents" is Kendra. You must distinguish it from Comprehend (text meaning analysis): Kendra is "finding," and Comprehend is "analyzing."

## Personalize & Forecast: Recommendation and Forecasting

These two offer traditional ML tasks as managed services.

- **Amazon Personalize**: A real-time **recommendation system**. It turns Amazon.com's recommendation technology into a service, recommending "things that people who viewed this item might like."
- **Amazon Forecast**: **Time-series forecasting**. It predicts future demand, sales, and inventory from past data.

| Service | Task | Use cases |
|--------|------|-----------|
| Personalize | Personalized recommendation | Product and content recommendations, personalized search |
| Forecast | Time-series forecasting | Demand forecasting, inventory planning, sales outlook |

The two are confusing because they resemble each other in "producing something from past data." The data they feed on and the answers they give differ.

| Aspect | Personalize | Forecast |
|------|------|------|
| Main ingredient | **Records of users interacting** with items (clicks, purchases, views) | **Past figures** with dates attached (daily sales and so on) |
| Shape of the answer | A different list of items for each user | A number at a future point in time |
| Question it answers | "What should I show this person?" | "How many will sell next month?" |
| Other uses | Similar items, re-ranking search results, picking out a group of users who would react to a given item | Planning staffing, server capacity, and energy demand |

- Personalize uses both historical records uploaded as CSV and **real-time events** arriving from the app. That is why an item someone just viewed is reflected in recommendations right away.
- **Current status**: Forecast is no longer open to new customers, and AWS guides people to move to the time-series forecasting in **SageMaker Canvas**. It is also absent from the latest exam guide's list of in-scope services. The **task type** of "forecasting" itself is still within the exam scope.

As a hypothetical example, an e-commerce company used Forecast to predict demand by store and by product to optimize inventory, and used Personalize to provide per-user recommendations. Both were implemented with managed APIs without a data science team. If it is "predict a future figure," it is Forecast, and if it is "personalized recommendations for users," it is Personalize.

## Amazon Q: AWS's Generative AI Assistant

**Amazon Q** is a generative AI-based assistant. It splits into two branches by purpose.

| Aspect | Amazon Q Business | Amazon Q Developer |
|------|-------------------|--------------------|
| Audience | General employees and business work | Developers |
| What it does | Answers questions and summarizes based on internal data | Code generation, explanation, debugging, and AWS task support |
| Connects to | Internal systems such as wikis, documents, and apps | IDE, AWS console/CLI |

- **Amazon Q Business**: A business assistant that connects to internal data and, when an employee asks in natural language, answers with supporting sources. (It feels like an internal RAG chatbot delivered as a finished product.)
- **Amazon Q Developer**: A developer assistant that helps write, explain, and debug code and answers questions about AWS infrastructure. (The successor/extension of the former CodeWhisperer.)

Both products are built on top of Amazon Bedrock. Q Business has three characteristics.

- It attaches **sources (citations)** to answers.
- It uses as evidence only **the documents the person asking is permitted to view**. It will not answer from HR documents to an employee who cannot see them.
- With plugins, it even does **simple task handling** such as submitting a leave request.

Bedrock and Amazon Q are different in nature. Bedrock is "a building block (API) for building a generative app myself," and Amazon Q is "an already finished generative assistant product." If you will design and develop a chatbot yourself, it is Bedrock; if you need a work or development assistant you can use right away, it is Amazon Q.

## Names That Are Changing: Amazon Quick and Kiro

Product names change quickly in this area. Know both the names the latest edition of the exam guide uses and the old names.

| Role | Familiar name | Name now pointed to | Status |
|------|------|------|------|
| Generative assistant for work | Amazon Q Business | **Amazon Quick** | Q Business is not open to new customers |
| BI dashboards | Amazon QuickSight | The **Quick Sight** feature of Amazon Quick | Only the name changed; existing APIs stay the same |
| Coding assistant for developers | Amazon Q Developer (formerly CodeWhisperer) | **Kiro** | End of support has been announced for the Q Developer IDE plugin |
| Multi-step task agent | Amazon Bedrock Agents | **Amazon Bedrock AgentCore** | The existing one became Agents Classic and is not open to new customers |

- **Amazon Quick**: A service that does work automation, data analysis, research, and building simple web apps through natural-language chat. It brings together in one place an index that connects internal documents and data sources as the basis for answers (Quick Index), automation of recurring work (Quick Flows, Quick Automate), research reports with sources (Quick Research), and dashboards (Quick Sight).
- **Kiro**: An AI-based development environment. In the IDE and CLI, an agent writes code, and it uses a spec approach that plans a feature as requirements → design → task list.
- The latest exam guide gives as examples of services for building GenAI applications Bedrock, SageMaker AI, JumpStart, **Amazon Quick, Kiro**, Strands Agents, and Bedrock AgentCore. The guide's revision history also lists Amazon Q as an in-scope service. So whichever of the old or new names appears in an option, just read it by its **role**. The two slots, "finished assistant for employees" and "coding assistant for developers," stay the same.

## Telling Look-Alike Services Apart

**Three conversational services.** They all look like "chatbots," but how you build them differs.

| Aspect | Lex | Agents (Bedrock) | Amazon Q Business / Quick |
|------|------|------|------|
| What it is | A service for building bots | A building block for building agents | An already built assistant |
| What drives the conversation | Intents and slots I define | The FM's reasoning and tool selection | Behavior built into the product |
| Strength | Predictable, controlled flow; voice support | Responds flexibly even to requests not defined in advance | Adopted right away with no development |
| Cues that fit | "Inquiries with a set procedure such as booking or lookup," "phone handling" | "Judges several steps on its own and calls APIs" | "Employees ask questions about internal materials," "immediate adoption" |

**Four search and knowledge services.**

| Service | What it does | Output |
|------|------|------|
| Kendra | Indexes internal documents and **finds** them in natural language | Relevant documents and the passage containing the answer |
| Bedrock Knowledge Bases | Attaches what was found to an FM to **write an answer** (RAG) | A generated answer with citations |
| Q Business / Quick | Provides the above process as a **finished assistant** | A chat screen employees use right away |
| Comprehend | **Analyzes** the text it is given | Sentiment, entities, key phrases |

## Service Selection Criteria: On One Page

The most important thing on the exam is the "clue → service" connection.

| Scenario clue | Answer service |
|---------------|-------------|
| Several FMs through an API without management | Bedrock |
| Train and deploy a custom model on your own data | SageMaker |
| Image/video analysis | Rekognition |
| Extract data from documents (forms, tables) | Textract |
| Text sentiment and entity analysis (NLP) | Comprehend |
| Speech → text / text → speech | Transcribe / Polly |
| Language translation | Translate |
| Conversational chatbot, voicebot | Lex |
| Natural-language search over internal documents | Kendra |
| Personalized recommendation | Personalize |
| Time-series demand and sales forecasting | Forecast |
| Generative assistant for work (internal data) | Amazon Q Business |
| Coding assistant for developers | Amazon Q Developer |

This table is the conclusion of Week 4 and the key asset that decides your exam score. To prepare for when the clues in the table come out slightly twisted, here are the forks collected separately.

| Twisted clue | Answer | Eliminated option and why |
|------|------|------|
| "Take inquiries arriving by phone by voice and even handle the booking" | Lex | Transcribe: it only transcribes and cannot lead a conversation |
| "A chatbot judges requests outside a set procedure and calls several APIs" | Agent | Lex: it moves only within the intents you defined |
| "Employees ask questions about internal documents, adopted this month with no development staff" | Q Business (Amazon Quick) | Bedrock: you have to build it yourself |
| "Internal document search works, but I want the answer written as sentences" | Search + FM (RAG) | Kendra alone: it only finds |
| "Change the next screen's recommendations to reflect the item just viewed" | Personalize | Forecast: it does not build per-person lists |
| "Predict next quarter's sales by branch as numbers" | Forecast | Personalize: it does not predict figures |
| "Code autocompletion and security vulnerability checks in the IDE" | Q Developer (Kiro) | Q Business: a business assistant |
| "Pull out frequently mentioned topics and sentiment from review text" | Comprehend | Kendra: it is a finding service and does not analyze |

**Where the costs arise** also differs in character by service.

- Lex: Number of requests. There is no server to keep up.
- Kendra: Hours the index is kept up and document synchronization. It costs even when unused.
- Personalize: Data processing volume, model training time, and number of recommendation requests.
- Forecast: Training time, stored data, and number of forecasts generated.
- Q Business: A per-user subscription fee and index capacity. It differs from Bedrock in that it is based on **number of people**, not tokens.

Tomorrow we do a comprehensive review of all of Week 4. We will organize every AI/ML service at once into a purpose-mapping table and compare the service pairs that are easy to confuse on the exam.

## 📖 Glossary

- **Intent**: What the user is trying to do with that utterance. A unit of purpose such as "book" or "check balance."
- **Slot**: A value needed to execute an intent, such as a date, place, or quantity.
- **NLU (natural language understanding)**: Technology that works out the intent and needed information from a sentence.
- **Enterprise search**: Search that indexes and finds documents from several internal repositories at once.
- **Connector**: A channel that links an external repository such as SharePoint or S3 to the service and brings in documents.
- **Interaction data**: Records of users clicking, buying, or viewing items. It is the main ingredient of a recommendation model.
- **Time-series data**: Figures recorded in time order, such as daily sales or hourly traffic.
- **Building block**: A service of the nature of a component you assemble yourself to make a product. Bedrock is the representative example.
- **Amazon Quick**: A service for work automation, analysis, and research through chat. The old QuickSight became a feature inside it.
- **Kiro**: The AI development environment AWS points to as the successor to the Q Developer IDE plugin.

## 📝 連習 問題

**Question 1.** You want to build a conversational chatbot/voice bot handling customer inquiries using Intent and Slot concepts. Which is the most appropriate service?

A) Amazon Kendra  
B) Amazon Lex  
C) Amazon Forecast  
D) Amazon Polly  

**Answer: B**  
Explanation: Lex builds chatbots and voice bots using intent-based and slot-based concepts. A is document search, C is time series forecasting, D is speech synthesis—all different from conversation bot building.

---

**Question 2.** You want employees to search documents scattered across internal wikis, PDFs, and SharePoint with natural language questions and find exact answer locations. Which is the most appropriate service?

A) Amazon Comprehend  
B) Amazon Translate  
C) Amazon Kendra  
D) Amazon Personalize  

**Answer: C**  
Explanation: Kendra is ML-based enterprise search indexing documents from multiple sources, providing exact answer locations to natural language questions. A is text meaning analysis, B is translation, D is recommendations—searching isn't their primary business.

---

**Question 3.** You want to recommend "products users would like" in real time based on their past behavior. Which is appropriate?

A) Amazon Forecast  
B) Amazon Personalize  
C) Amazon Lex  
D) Amazon Textract  

**Answer: B**  
Explanation: Personalize is a real-time personalized recommendation system servicizing Amazon.com's recommendation technology. A (Forecast) is time series numeric prediction, C is chatbots, D is document extraction—all unrelated to recommendations.

---

**Question 4.** Developers want immediate help with code generation, explanation, debugging, and AWS-related questions inside their IDE. Which is the most appropriate?

A) Amazon Q Developer  
B) Amazon Q Business  
C) Amazon Forecast  
D) Amazon Comprehend  

**Answer: A**  
Explanation: Q Developer is a developer generative assistant supporting code writing, explanation, debugging, and AWS tasks. B (Q Business) is a business assistant for internal data—different target. C is forecasting, D is NLP—both unrelated to coding support.

---

**Question 5.** You want to immediately adopt a "complete, ready-made business generative assistant" without designing and developing a chatbot yourself, connecting to internal data to answer employee questions with evidence. Which is the most appropriate?

A) Amazon Bedrock  
B) Amazon Q Business  
C) Amazon SageMaker  
D) Amazon Lex  

**Answer: B**  
Explanation: Q Business is a ready-made generative business assistant connecting to internal data, usable immediately without development. A (Bedrock) is building blocks for creating apps directly, C is a model training platform, D is a chatbot service you build yourself—all distant from "immediate adoption."

---
