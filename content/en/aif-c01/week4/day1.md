# Day 1 - Amazon Bedrock: Fully Managed Service for Renting Foundation Models

In Week 3, we learned principles of generative AI, foundation models (FMs), prompt engineering, and RAG concepts. Now we move to "how to actually use this in AWS." Week 4 is the **highest-weight section** of the AIF-C01 exam. Many exam questions ask "which AWS AI service is appropriate for this scenario?"

At the center is **Amazon Bedrock**. Bedrock is a fully managed service that lets you rent large foundation models from multiple companies through a **single API**. Today we'll organize what Bedrock does, how to choose models, and key features like RAG, Guardrails, and Agents from an exam perspective.

## What Is Amazon Bedrock?

Bedrock's core value summarizes in one sentence: **"Use large foundation models via API calls without buying GPUs or self-hosting models."** It's **serverless**—no infrastructure management needed.

Bedrock is an "FM marketplace" gathering models from multiple providers.

| Provider | Representative Models | Strength |
|--------|-----------|------|
| Anthropic | Claude | Reasoning, long context, conversation |
| Amazon | Titan, Nova | Text, images, embeddings, cost-efficient |
| Meta | Llama | Open weights lineage, customizable |
| Mistral AI | Mistral, Mixtral | Lightweight, fast |
| Cohere | Command, Embed | Embeddings, search |
| Stability AI | Stable Diffusion | Image generation |

> 💡 **Related theory**: Bedrock is the generative AI version of "Infrastructure as API." Traditionally, running large models required thousands of GPUs and operations staff. Bedrock abstracts all this away—developers only need to think "which model and what prompt to send." On the exam, when you see "I want to pick and use multiple FMs without infrastructure management," Bedrock is almost always the answer.

## How to Choose a Model

Choosing one model from many isn't just "performance ranking." The AIF exam asks about **trade-offs**.

- **Accuracy/reasoning ability**: For complex reasoning, code generation, or long contexts, choose high-performance models (e.g., larger Claude models).
- **Cost**: Token prices differ per model. Simple classification or summary work can use cheaper lightweight models.
- **Latency**: Real-time chatbots need fast response—lightweight models can be advantageous.
- **Modality**: Text-only? Image generation? Multimodal (image understanding)? Embeddings? Pick the type fitting your task.
- **Context window**: If you must input long documents at once, choose a large context window model.

> 📚 **Case study**: A customer support team initially processed all inquiries with the highest-performance model—costs exploded. Analysis showed 80% of inquiries were simple FAQs. Routing those to cheap lightweight models and sending complex inquiries to high-performance ones cut costs 60% while maintaining quality. The key lesson: "The most expensive model isn't always right."

## RAG and Knowledge Bases: Attaching Your Company Data to the Model

Foundation models only know general knowledge up to their training date. They don't know "our company's internal policies" or "latest product manual." This is solved by **RAG (Retrieval-Augmented Generation)**.

RAG's flow looks like this:

```
User question → Search company document DB for related content → Attach search results to prompt → FM answers based on that evidence
```

Bedrock has a **Knowledge Bases** feature that automates this process. Upload documents to S3, and Bedrock automatically chunks them, converts them to **embeddings**, and stores them in a **vector database**. When a user asks, it finds semantically similar chunks and passes them to the model together.

> 💡 **Related theory**: RAG is often compared to fine-tuning. **Fine-tuning** does additional training to change the model's "ability/tone," while **RAG** leaves the model as-is and attaches "latest knowledge/facts" from outside. For frequently changing internal data, when source clarity matters, or when you want to reduce hallucination, RAG is advantageous. On the exam, if you see "I want it to answer with latest info but don't want the burden of retraining the model every time," RAG/Knowledge Bases is the answer.

## Guardrails: Building Safety Fences

When you attach generative AI to real services, risks follow: profanity, violent content, competitor mentions, personal info exposure, drifting to wrong topics. **Amazon Bedrock Guardrails** is a safety mechanism filtering such inputs and outputs.

What Guardrails blocks:

| Protection Area | What It Does |
|-----------|---------|
| Harmful content filter | Blocks hate, violence, sexual content, etc. |
| Denied topics | Configure model to not answer certain topics (e.g., medical advice) |
| Sensitive info (PII) | Mask/block personal info like ID numbers, emails |
| Word filter | Blocks banned words, profanity, competitor names |
| Hallucination detection | Filters unsupported answers (context drift) |

The key point: Guardrails is **independent from the model**. Once defined, you can consistently apply one guardrail to multiple models.

## Agents: Making the Model Perform Tasks Directly

Basic FMs only "generate text"—they can't act (check orders, change reservations). **Amazon Bedrock Agents** lets models **call external APIs (Lambda, etc.) or Knowledge Bases through multi-step reasoning** to complete actual tasks.

For example, a request like "Change my flight to tomorrow" has an Agent (1) call user's reservation lookup API → (2) check if change is possible → (3) call change API → (4) guide with natural language. It plans and executes these multi-step tasks autonomously.

> 🔍 **Going deeper**: Agents' essence is "reasoning + tool use." The model judges "what should I do now," selects and calls needed tools (APIs), sees results, and decides next actions. If Knowledge Bases is "reading (searching)," Agents is "acting (executing)." On the exam, if you see "the model must perform actual work over multiple steps beyond simple answering," Agents is the answer.

## Wrapping Up

Today's key picture is this: **Amazon Bedrock** is a fully managed service to rent FMs from multiple companies through a single API, without infrastructure management. Choose models by accuracy, cost, latency, and modality. Use **Knowledge Bases (RAG)** to answer with internal data, **Guardrails** to block safely, and **Agents** to execute multi-step actual tasks.

Next, we'll see **Amazon SageMaker**—the service where you "train and deploy ML models directly," and clarify "when to use Bedrock vs when to use SageMaker."

---

## 📝 연습 문제

**문제 1.** A startup wants to call foundation models from multiple companies (Claude, Llama, Titan, etc.) through a single API without buying GPUs or hosting directly. What is the most appropriate service?

A) Install each model directly on Amazon EC2  
B) Amazon Bedrock  
C) Amazon S3  
D) AWS Glue  

**정답: B**  
해설: Bedrock is a fully managed service providing FMs from multiple providers via a single API in a serverless manner. A requires direct infrastructure management, contradicting the requirement. C is object storage, D is a data integration (ETL) service—neither's primary business is providing FMs.

---

**문제 2.** You want a chatbot to answer with latest information based on internal company documents, but you want to avoid the cost of retraining the model every time. What is the most appropriate approach?

A) Configure Bedrock Guardrails  
B) Use Bedrock Knowledge Bases with RAG  
C) Train the model completely from scratch  
D) Manually edit model parameters  

**정답: B**  
해설: Knowledge Bases automates RAG by embedding company documents, storing in a vector DB, and searching related content when queried to attach to the model. You can reflect latest knowledge without retraining. A is safety filtering, not knowledge injection. C is the high-cost approach you want to avoid. D is practically impossible.

---

**문제 3.** You want to consistently filter inputs and outputs of a generative AI chatbot to prevent profanity, competitor mentions, and personal info exposure. Which Bedrock feature should you use?

A) Knowledge Bases  
B) Agents  
C) Guardrails  
D) JumpStart  

**정답: C**  
해설: Guardrails is a safety mechanism filtering harmful content, denied topics, sensitive info (PII), banned words, etc., independent of the model, consistently applicable to multiple models. A is search-based knowledge injection. B is multi-step task execution. D is SageMaker's pre-trained model catalog—all unrelated to this problem.

---

**문제 4.** You want the model to autonomously perform multi-step tasks in response to requests like "Check my order status and change shipping address if possible," calling external APIs to complete actual work. What is the appropriate feature?

A) Bedrock Agents  
B) Bedrock Guardrails  
C) Simple text generation call  
D) Amazon Polly  

**정答: A**  
해설: Agents let models reason multi-step, calling external APIs like Lambda or Knowledge Bases to perform actual tasks. B is safety filtering. C is simple generation without external action. D is a text-to-speech service—unrelated.

---

**問題 5.** When choosing a model in Bedrock, which criterion is most distant from consideration?

A) Accuracy and reasoning ability needed for the task  
B) Cost per token and response latency  
C) Required modality (text, images, embeddings)  
D) Physical location of the GPU on which the model was trained  

**정답: D**  
해설: Bedrock is serverless and abstracts infrastructure, so users needn't worry about GPU physical location. A, B, and C are all core trade-offs in actual model selection (accuracy, cost/latency, modality). The principle is "the most expensive model isn't always right."

---
