# Day 1 - Amazon Bedrock: Fully Managed Service for Renting Foundation Models

## 📌 Key Takeaways

- **Amazon Bedrock** is a fully managed service that lets you rent foundation models (FMs) from multiple companies through an API, with no GPUs to buy and nothing to host.
- You choose a model not by a performance ranking but by the trade-off among **accuracy, cost, latency, modality, and context window**.
- To make the model answer from internal data, use **Knowledge Bases (RAG)**. To filter inputs and outputs safely, use **Guardrails**. To have the model carry out real multi-step work, use **agents (Bedrock Agents, AgentCore)**.
- RAG leaves the model as it is and attaches knowledge to it, whereas customization such as fine-tuning or distillation changes the model itself.
- Basic billing is per input and output token. You control cost with batch inference for large bulk jobs, Provisioned Throughput for guaranteed throughput, and prompt caching for long, repeated prefixes.

## What Is Amazon Bedrock?

In Week 3 we learned the principles of generative AI and the concepts of foundation models (FMs), prompt engineering, and RAG. This week we move to "how do you actually use them on AWS." This week ties directly to Domain 3, "Applications of Foundation Models" (28%), the heaviest domain, and a large share of exam questions ask "which AWS AI service fits this scenario?" At the center of that is Amazon Bedrock.

Bedrock's core value fits in one sentence: **"Use large foundation models through API calls alone, without buying GPUs or hosting models yourself."** It is **serverless**, so no infrastructure management is needed at all.

Bedrock is an "FM marketplace" that gathers models from several providers in one place.

| Provider | Representative models | Strength |
|--------|-----------|------|
| Anthropic | Claude | Reasoning, long context, conversation |
| Amazon | Titan, Nova | Text, image, and embeddings; cost-efficient |
| Meta | Llama | Open-weights family, customizable |
| Mistral AI | Mistral, Mixtral | Lightweight and fast |
| Cohere | Command, Embed | Embeddings and search |
| Stability AI | Stable Diffusion | Image generation |

- The list of providers and models keeps growing and changing. The exam does not ask for a specific model's name or ranking. It asks "which do you need: text generation, image generation, or embeddings?"
- **Amazon Nova**, Amazon's own model family, is on the exam guide's list of in-scope services.

> 💡 **Related theory**: Bedrock is the generative AI version of "Infrastructure as API." Traditionally, running a huge model required thousands of GPUs and an operations team. Bedrock abstracts all of that away, so a developer only has to think about "which model do I send which prompt to." On the exam, when a scenario says "I want to pick from several FMs and use them without managing infrastructure," Bedrock is the answer.

**Two common misconceptions.**

- "The model provider trains its model on the prompts I send to Bedrock" → No. According to the AWS documentation, the model is copied and deployed into an account operated by the Bedrock service team, and **the model provider cannot access that account, so it cannot see the customer's prompts and responses.**
- "If I use Bedrock, AWS takes care of all the security" → No. AWS is responsible for the infrastructure, while the customer is responsible for who can make calls (IAM) and what gets entered (the shared responsibility model).

## How Do You Choose a Model?

The criterion for picking one model among many is not a simple "performance ranking." The AIF exam asks about **trade-offs**.

- **Accuracy / reasoning ability**: If you need complex reasoning, code generation, or long context, use a high-performance model (for example, a large Claude model).
- **Cost**: The price per token differs by model. For simple classification or summarization, a cheap lightweight model is enough.
- **Latency**: A real-time chatbot needs fast responses, so a lightweight model may be the better fit.
- **Modality**: Text only? Image generation? Multimodal (image understanding)? Embeddings? You must pick the type that matches the task.
- **Context window**: If you need to feed in a long document at once, choose a model with a large context window.

The exam guide adds multilingual support, model size and complexity, whether customization is possible, regulatory compliance, and prompt caching support as selection criteria. To pick candidates on evidence rather than intuition, use **Amazon Bedrock Model Evaluation**.

| Evaluation method | Who scores | Fits when |
|------|------|------|
| Automatic (programmatic) evaluation | Computes predefined metrics | You want a quick comparison using a built-in dataset or your own prompt dataset |
| Human evaluation | Your employees or domain experts | The quality needs human judgment, such as tone or brand fit |
| Judge model evaluation (LLM-as-a-judge) | Another LLM assigns scores and reasons | You want judgments close to human evaluation, quickly and at scale |
| RAG evaluation | LLM-based metrics | You want to check whether the knowledge base finds relevant content and answers well |

As a hypothetical example, a customer support team first handled every inquiry with the top-performing model, and its costs exploded. On analysis, 80% of the inquiries were simple FAQs. Once they routed those to a cheap lightweight model and sent only the complex inquiries to the high-performance model, costs fell 60% while quality held. The key lesson is that "the most expensive model is not the best."

## RAG and Knowledge Bases: Attaching Your Company's Data to the Model

A foundation model knows only general knowledge up to the time it was trained. It does not know "our company's internal policies" or "the latest product manual." **RAG (Retrieval-Augmented Generation)** solves this.

The RAG flow looks like this.

```
User question → Search the company document DB for related content → Attach the search results to the prompt → The FM answers based on that evidence
```

Bedrock has a **Knowledge Bases** feature that automates this process. When we upload documents to S3, Bedrock splits them into small pieces on its own (chunking), converts them into **embeddings**, and stores them in a **vector database**. When a user asks a question, it finds the pieces with similar meaning and passes them to the model along with the question.

The work is split across two points in time.

| When | What happens | When it is redone |
|------|------|------|
| In advance (ingestion) | Read documents → split into chunks → embed → store in the vector store | Re-sync whenever the documents change |
| At question time (retrieval and generation) | Embed the question → search for nearby chunks → attach them to the prompt → generate the answer | On every request |

- You can attach a **citation** to the answer so the user can check the original source. That is why the requirement "you must cite sources" is solved by RAG.
- The data source is not limited to S3. A managed knowledge base offers connectors for SharePoint, Confluence, Google Drive, OneDrive, and a web crawler.
- There are two kinds of knowledge base. A **managed** one has Bedrock handle all of ingestion, indexing, storage, and retrieval infrastructure. A **customer-managed** one has you set up the vector store yourself (OpenSearch Serverless, Aurora, Neptune, and so on) and control the configuration. For "minimal operational burden," pick the former. For "direct control over the store and pipeline," pick the latter.
- If documents change and you do not re-sync, the chatbot answers with the old content. RAG removes model retraining, but **index refreshing** remains.

> 💡 **Related theory**: RAG is often compared with fine-tuning. **Fine-tuning** trains the model further to change its "ability/tone," while **RAG** leaves the model as it is and brings in "the latest knowledge/facts" from outside. RAG is advantageous for frequently changing internal data, when sources must be made explicit, and when you want to reduce hallucination. On the exam, if you see "I want it to answer with the latest information but retraining the model every time is a burden," the answer is RAG/Knowledge Bases.

## Guardrails: Putting Up Safety Fences

Putting generative AI into a real service brings risks: profanity, violent content, mentions of competitors, exposure of personal information, and drifting off to unrelated topics. **Amazon Bedrock Guardrails** is a safety mechanism that filters these inputs and outputs.

What Guardrails guards against:

| Protection area | What it does |
|-----------|---------|
| Harmful content filter | Blocks hate, insults, sexual content, violence, misconduct, and prompt attacks, with a strength level per category |
| Denied topics | Set the model not to answer specific topics (for example, medical advice or investment recommendations) |
| Sensitive information (PII) | Masks or blocks personal information such as national ID numbers and emails; custom patterns can be added with regular expressions |
| Word filter | Blocks banned words, profanity, and competitor names |
| Contextual grounding check (hallucination detection) | Filters out answers that stray from the supplied source documents or are irrelevant to the question |
| Automated Reasoning check | Verifies an answer against logical rules you have defined |

- The key point is that Guardrails is **independent of the model**. A guardrail you define once can be applied consistently to several models. With the `ApplyGuardrail` API, you can also apply just the guardrail, separately, without calling a model.
- The check is **bidirectional**. It is applied to both the user input and the model response. A jailbreak attempt is caught on the input side, and a personal-information leak is caught on the output side.
- "Can't I just write 'do not use profanity' in the prompt?" → A prompt instruction is a request the model can break, whereas a guardrail is a check enforced outside the model. When the exam adds "consistently" or "for all models," it is Guardrails.

## Agents: Letting the Model Carry Out Tasks Directly

A basic FM only "generates text" and cannot take real actions (looking up an order, changing a reservation). **Amazon Bedrock Agents** lets the model **reason across multiple steps while calling external APIs (Lambda and others) or a Knowledge Base** to complete an actual task.

For example, given the request "Change my flight to tomorrow," an Agent (1) calls the user's reservation lookup API → (2) checks whether a change is possible → (3) calls the change API → (4) reports the result in natural language. It plans and executes this kind of multi-step task by itself.

An Agent is a structure that combines "reasoning + tool use." The model judges "what should I do now," picks and calls the tool (API) it needs, looks at the result, and decides the next action. If Knowledge Bases is "reading (searching)," Agents goes as far as "acting (executing)." On the exam, if "the model must go beyond a simple answer and perform real work across multiple steps," the answer is Agents.

Be aware that the names are changing.

- The original Bedrock Agents is now called **Amazon Bedrock Agents Classic** and is not open to new customers. AWS points to **Amazon Bedrock AgentCore** as the successor.
- AgentCore is a platform for building, deploying, and operating agents. You can bring an agent built with any framework (for example, the open-source **Strands Agents**) and any model, and it provides components such as the Runtime, Memory, tool connection (Gateway), identity and permissions (Identity), Policy, and Observability.
- Gateway turns existing APIs and Lambda functions into **MCP (Model Context Protocol)**-compatible tools. MCP is a standard protocol for connecting agents to external systems.
- The latest exam guide lists AgentCore and Strands Agents as in-scope services. Whichever name appears in the options, if it is "**multiple steps + tool calls + real actions**," it belongs to the agent family.

## Telling Look-Alike Features Apart

| Feature | One word | Problem it solves | What it cannot solve |
|------|------|------|------|
| Knowledge Bases | Read | Internal and up-to-date knowledge the model lacks | Real actions such as changing an order |
| Agents | Act | Carrying out work that spans several steps | Blocking harmful output |
| Guardrails | Block | Harmful, sensitive, or off-topic inputs and outputs | Supplying knowledge |
| Model customization | Reshape | Building tone and specialized-task performance into the model | Reflecting facts that change daily |
| Prompt Management | Manage | Prompt reuse, versioning, and comparing variants | The model's lack of knowledge |
| Model evaluation | Measure | Comparing which model or configuration is better | Improving quality itself |

It is common to use three of them together. For a travel agency chatbot, the refund policy is read through Knowledge Bases, an agent executes reservation changes through APIs, and Guardrails is applied across the whole conversation.

**Customization** is the way to change the model itself within Bedrock.

- **Fine-tuning**: Further trains the model on labeled input-output examples to raise performance on a specific task.
- **Distillation**: Trains a small, fast student model on the answers of a large, smart teacher model. The goal is to lower cost and latency while preserving as much quality as possible.
- The exam guide also lists continuous pre-training, which keeps training on unlabeled domain documents (the Bedrock documentation spells it "continued pre-training").

## Where the Costs Come From

| Method | Billing basis | Fits when |
|------|------|------|
| On-demand | Input tokens + output tokens | The default. Traffic is uneven, or you are just starting |
| Batch inference | Upload multiple prompts to S3 and process them asynchronously in bulk | Large jobs that need no immediate answer (such as nightly summaries) |
| Provisioned Throughput | Model units (MU) × hours; the longer the commitment (none, 1 month, 6 months), the bigger the discount | You have steady, heavy traffic and need guaranteed throughput |
| Prompt caching | Tokens read from the cache are billed at a lower rate | Long documents or instructions repeat in every request |
| Model customization | Tokens processed for training + a monthly storage fee for the custom model | You do fine-tuning or distillation |

- The user guide says a customized model can be used only after you purchase Provisioned Throughput. This means fine-tuning does not end with the training cost: **it keeps costing money while you use it**.
- Provisioned Throughput is billed hourly even when unused, until you delete it.
- RAG increases input tokens by the amount of retrieved documents attached, and an agent calls the model several times per request, so both cost more than a plain call. Guardrails checks are also a separately billed item.

## Scenario → Answer Decision Table

| Clue in the question | Answer | Eliminated option and why |
|------|------|------|
| "Several FMs through a single API without managing infrastructure" | Amazon Bedrock | Install on EC2 yourself: you take on the infrastructure |
| "Answer from internal documents but avoid retraining" | Knowledge Bases (RAG) | Fine-tuning: retrain every time the documents change |
| "The answer must show its sources" | Knowledge Bases | Guardrails: it only filters, and does not supply evidence |
| "Block profanity, competitor names, and personal information consistently across all models" | Guardrails | Prompt instruction: it has no enforcement power |
| "Filter out content not found in the source documents" | Guardrails contextual grounding check | Adjusting temperature: it does no comparison against sources |
| "Look up an order, then also change the shipping address" | Agents | Knowledge Bases: it only reads |
| "Quality at the level of a large model, but cheaper and faster" | Distillation | Provisioned Throughput: it guarantees throughput and does not shrink the model |
| "Summarize 100,000 documents overnight, no immediate answer needed" | Batch inference | Provisioned Throughput: it buys always-on capacity |
| "Choose, with evidence, which of two models fits our work" | Model evaluation | Picking the bigger model by gut feeling |

Tomorrow we look at Amazon SageMaker, the partner of Bedrock and the service where you "train and deploy your own ML models," and learn to tell when to use Bedrock and when to use SageMaker.

## 📖 Glossary

- **Fully managed**: A way of using a service in which the service handles server provisioning, scaling, and patching so the user only uses the features.
- **Modality**: The kind of data a model handles, such as text, image, audio, or embeddings.
- **Chunking**: Splitting a long document into pieces of a size that works well for search.
- **Knowledge Bases**: Bedrock's managed RAG feature that handles document ingestion, embedding, storage, and retrieval for you.
- **Guardrails**: A safety mechanism that inspects model inputs and outputs against policy and blocks or masks them. It is defined separately from the model.
- **Agent**: A setup in which the model plans steps by itself and calls tools (APIs) to finish a task.
- **MCP (Model Context Protocol)**: A standard protocol that unifies how agents connect to external tools and data.
- **Distillation**: A method of teaching a small student model with the answers of a large teacher model to get a cheap, fast model.
- **Provisioned Throughput**: A purchasing method that reserves a fixed amount of throughput in advance at an hourly rate.
- **Prompt caching**: A feature that stores the repeated front portion of a prompt and reduces cost and latency when it is reused.

## 📝 Practice Questions

**Question 1.** A startup wants to call foundation models from multiple companies (Claude, Llama, Titan, etc.) through a single API without buying GPUs or hosting directly. What is the most appropriate service?

A) Install each model directly on Amazon EC2  
B) Amazon Bedrock  
C) Amazon S3  
D) AWS Glue  

**Answer: B**  
Explanation: Bedrock is a fully managed service providing FMs from multiple providers via a single API in a serverless manner. A requires direct infrastructure management, contradicting the requirement. C is object storage, D is a data integration (ETL) service—neither's primary business is providing FMs.

---

**Question 2.** You want a chatbot to answer with latest information based on internal company documents, but you want to avoid the cost of retraining the model every time. What is the most appropriate approach?

A) Configure Bedrock Guardrails  
B) Use Bedrock Knowledge Bases with RAG  
C) Train the model completely from scratch  
D) Manually edit model parameters  

**Answer: B**  
Explanation: Knowledge Bases automates RAG by embedding company documents, storing in a vector DB, and searching related content when queried to attach to the model. You can reflect latest knowledge without retraining. A is safety filtering, not knowledge injection. C is the high-cost approach you want to avoid. D is practically impossible.

---

**Question 3.** You want to consistently filter inputs and outputs of a generative AI chatbot to prevent profanity, competitor mentions, and personal info exposure. Which Bedrock feature should you use?

A) Knowledge Bases  
B) Agents  
C) Guardrails  
D) JumpStart  

**Answer: C**  
Explanation: Guardrails is a safety mechanism filtering harmful content, denied topics, sensitive info (PII), banned words, etc., independent of the model, consistently applicable to multiple models. A is search-based knowledge injection. B is multi-step task execution. D is SageMaker's pre-trained model catalog—all unrelated to this problem.

---

**Question 4.** You want the model to autonomously perform multi-step tasks in response to requests like "Check my order status and change shipping address if possible," calling external APIs to complete actual work. What is the appropriate feature?

A) Bedrock Agents  
B) Bedrock Guardrails  
C) Simple text generation call  
D) Amazon Polly  

**Answer: A**  
Explanation: Agents let models reason multi-step, calling external APIs like Lambda or Knowledge Bases to perform actual tasks. B is safety filtering. C is simple generation without external action. D is a text-to-speech service—unrelated.

---

**Question 5.** When choosing a model in Bedrock, which criterion is most distant from consideration?

A) Accuracy and reasoning ability needed for the task  
B) Cost per token and response latency  
C) Required modality (text, images, embeddings)  
D) Physical location of the GPU on which the model was trained  

**Answer: D**  
Explanation: Bedrock is serverless and abstracts infrastructure, so users needn't worry about GPU physical location. A, B, and C are all core trade-offs in actual model selection (accuracy, cost/latency, modality). The principle is "the most expensive model isn't always right."

---
