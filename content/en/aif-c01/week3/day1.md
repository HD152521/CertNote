# Day 1 - What Is Generative AI: Difference from Traditional ML, and Foundation Models

Through Week 2, we've seen the world of "traditional" machine learning. Collect data, attach labels, train a model to solve one specific problem. Spam or not? Is this photo a cat or dog? What will next month's revenue be? Each model does just one job well. Then at the end of 2022, ChatGPT appeared and the world changed. Writing, coding, drawing, summarizing—one model does dozens of jobs. This is **Generative AI**.

Generative AI is the largest area in the AIF-C01 exam. Today, we aim not just to memorize terms but to truly understand "what exactly makes Generative AI different from traditional ML?" and what **Foundation Models (FM)** and **Large Language Models (LLM)** at their core really are.

## Traditional ML vs Generative AI: What Does the Model "Output"?

The simplest distinction is "what does the model produce?"

| Category | Traditional ML | Generative AI |
|----------|----------------|---------------|
| Output Character | **Judgment/Prediction** (numbers, classification labels) | **New Content** (sentences, images, code) |
| Typical Question | "Is this email spam?" | "Write me a reply to this email" |
| Training Data | Usually labeled data | Massive unlabeled data |
| One Model's Use | Usually one task | Various tasks (general-purpose) |
| Output Determinism | Same input → same output tendency | Same input → can be different each time |

Traditional ML often uses **discriminative models**. They draw boundaries for "which category does given data belong to?" Generative AI, by contrast, are **generative models** that learn "the probability distribution itself from which this data is created" and sample new examples from that distribution. This is how they can create sentences or pictures never seen before.

> 💡 **Related Theory**: Discriminative models learn conditional probability P(label | data), while generative models learn joint probability P(data, label) or the data's own distribution P(data). Finding "probability of spam" is discriminative; "writing a new spam email" is generative. Generative AI seems like "creation" because it samples plausible samples from learned probability distributions, not because it has human intention.

## Foundation Model (FM): A Base Created Once, Used in Many Places

The biggest cost in traditional ML was "training a new model from scratch for each problem." The innovation of generative AI comes from the **Foundation Model** concept. Literally, a model that serves as "foundation."

The core idea has three stages:

1. **Pre-training**: Train one huge model on internet-scale massive data. This stage costs enormously (millions of dollars, thousands of GPUs).
2. **Versatility**: The resulting model is not for specific tasks but becomes a "universal foundation" that has learned general patterns of language and images.
3. **Adaptation**: On this foundation, adding just a prompt or minor additional training (fine-tuning) allows reuse for many tasks—translation, summarization, classification, chatbots, etc.

The term "Foundation Model" was established by Stanford's HAI research team in 2021. The core is the economics of **creating one expensive model and reusing it for many downstream tasks**. Like building one deep foundation and then putting multiple floors on top when constructing a building.

> 🔍 **Deeper Dive**: AWS's flagship service for using foundation models is **Amazon Bedrock**. Bedrock is a "fully managed FM marketplace" that lets users call FMs from multiple companies (Anthropic Claude, Amazon Titan, Meta Llama, Mistral, AI21, Cohere) through a single API. Users don't need to buy GPUs or train models themselves—they just rent massive models via API calls. This is the generative AI version of "Infrastructure as API." When the AIF exam shows a scenario like "I want to choose among several FMs and don't want to manage infrastructure," Bedrock is the answer.

## LLM (Large Language Model): Foundation Models for Language

Foundation models exist for images, audio, text, and more, but the one that handles **text (language)** is the **LLM (Large Language Model)**. ChatGPT, Claude, and Llama are all LLMs.

What an LLM does is surprisingly simple to explain. **"Given text so far, probabilistically predict what word (token) comes next."** Repeat this and you create a sentence.

```
Input: "Today's weather is really"
Model prediction: "good" (45%), "cold" (20%), "cloudy" (15%), ...
→ Pick "good"
→ Input: "Today's weather is really good" → predict next token → repeat
```

"Just predicting the next word, how does it write code and reason?" you might wonder. The key is **scale**. When model size (number of parameters) and training data cross a threshold, simple next-word-prediction alone produces "emergent abilities" like translation, summarization, and reasoning. OpenAI formalized this in 2020 as **Scaling Laws**.

> 💡 **Related Theory**: The foundation of LLM is the **Transformer** architecture published by Google in 2017 (the "Attention Is All You Need" paper). Before that, RNN/LSTM processed sentences sequentially from start to finish, making them slow and difficult to remember long context. Transformer's **self-attention** looks at all words in a sentence simultaneously, computing weights for "how related is word A to word B." This enables parallel processing on GPUs for fast training and handles long context well. Nearly all modern LLMs are Transformer-based.

## What Kinds of Content Does Generative AI Create?

LLM handles text, but generative AI isn't just text. The AIF exam frequently asks "which model/service is best for this task?"

| Generated Content | Example Models/Services | Use Cases |
|-------------------|------------------------|-----------|
| Text | Claude, Titan Text, Llama | Chatbots, summarization, translation, writing |
| Images | Stable Diffusion, Titan Image | Marketing images, design concepts |
| Code | Amazon Q Developer, Claude | Code auto-completion, bug fixing |
| Multimodal | Claude, Titan Multimodal | Describe images, analyze documents |
| Embeddings | Titan Embeddings, Cohere | Search, recommendations, RAG |

**Multimodal** means models that handle multiple input types simultaneously, like text + images. "Describe what's in this photo" is a typical multimodal task.

> 📚 **Example**: In 2023, a global media company was running customer support ticket classification with traditional ML models, then switched to generative AI. Previously, each new category required collecting data and retraining, but with FM-based approach, just describing the category in the prompt enabled instant new classification. The retraining cycle went from "weeks" to "one prompt edit." This is the economic power of Foundation Model reuse.

## So When Use Generative AI and When Use Traditional ML?

Generative AI isn't a cure-all. The AIF exam constantly asks about "choosing the right tool."

- **Traditional ML is better for**: Accurate numerical prediction (revenue, pricing), tasks with clear classification boundaries and obvious correct answers, environments requiring determinism and explainability (regulatory: loan approval, etc.).
- **Generative AI is better for**: Free text/image generation, doing many tasks with one model quickly, situations where it's hard to gather labeled data, conversational interfaces with people.

The core decision criterion is **"do we need to create new content, or just make judgments/predictions?"** If we need to write a reply, use generative AI. If we just need to flag spam, use traditional ML.

## Wrapping Up

Three key pictures to grasp today. First, traditional ML **makes judgments/predictions** while generative AI **generates new content**. Second, a **Foundation Model** is expensively created once then reused for many tasks, and at AWS we use **Amazon Bedrock** to rent it. Third, an **LLM** is an FM for language whose essence is "predict the next token," but as scale grows, abilities like reasoning and translation emerge.

Tomorrow we'll explore when LLM "predicts the next token," what that token really is and how text becomes numbers inside the model—tokens, embeddings, context windows, and inference, all explained simply.

---

## 📝 연습 문제

**문제 1.** 다음 중 생성형 AI와 전통 머신러닝의 가장 본질적인 차이를 가장 잘 설명한 것은?

A) Generative AI uses GPUs while traditional ML uses only CPUs  
B) Generative AI creates new content, while traditional ML mainly makes judgments/predictions  
C) Generative AI doesn't need data  
D) Traditional ML is always more accurate than generative AI  

**정답: B**  
해설: The core difference is the nature of output. Traditional ML (especially discriminative models) outputs classification/prediction like "is this spam?", while generative AI creates new content like "write me a reply." A is wrong because both can use GPUs. C is wrong because both learn from data. D can't be generalized as it depends on the task.

---

**문제 2.** 파운데이션 모델(Foundation Model)의 핵심 경제적 이점은 무엇인가?

A) Must train new models from scratch for each task  
B) Expensively pre-train one model once, then reuse for many downstream tasks  
C) Training costs nothing  
D) Can only be used for image generation  

**정답: B**  
해설: Foundation Model's core is pre-training one large model on internet-scale data as a base, then reusing it for various tasks via prompts or fine-tuning, greatly reducing the cost of training from scratch per task. A is the opposite, C is wrong because pre-training is very expensive, and D is wrong because FMs work with text, images, multimodal, etc.

---

**문제 3.** LLM(대규모 언어 모델)이 문장을 생성하는 기본 원리는 무엇인가?

A) Searches database for pre-written answers  
B) Repeatedly predicts probabilistically what token comes next based on text so far  
C) Always guarantees 100% same output for same input  
D) Human programmers hard-code grammar rules  

**정답: B**  
해설: LLM's essence is predicting "probability of next token given previous text" and repeating to complete a sentence. A is wrong because it generates, not retrieves. C is wrong because LLMs are non-deterministic—same input can produce different outputs. D is the old rule-based approach; modern LLMs learn patterns from data.

---

**문제 4.** 여러 회사의 파운데이션 모델(Claude, Titan, Llama 등)을 인프라 관리 없이 단일 API로 호출하고 싶다. 가장 적합한 AWS 서비스는?

A) Install models directly on Amazon EC2  
B) Amazon Bedrock  
C) Amazon S3  
D) AWS Lambda alone  

**정답: B**  
해설: Amazon Bedrock is a fully managed service that calls FMs from multiple providers through a single API, letting you use massive models via API only, without buying GPUs or hosting. A requires managing infrastructure yourself, contradicting the requirement. C is object storage, D is serverless computing—neither provides FM services as their primary business.

---

**문제 5.** 다음 중 생성형 AI보다 전통 ML이 더 적합한 작업은?

A) Writing natural reply sentences to customer inquiries  
B) Generating marketing images  
C) Predicting next quarter's revenue with precise numbers  
D) Summarizing long reports  

**정답: C**  
해설: Accurate numerical prediction is an area where traditional ML like regression excels, where determinism and accuracy matter. A, B, D all involve creating new text/images, suited to generative AI. The decision criterion is "create new content needed? (generative) or just accurate judgment/prediction? (traditional ML)"

---
