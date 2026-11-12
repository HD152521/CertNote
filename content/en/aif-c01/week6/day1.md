# Day 1 - Domain Review 1: AI/ML Fundamentals + Generative AI Fundamentals: Critical Summary

## 📌 Key Takeaways

- **AI ⊃ ML ⊃ Deep Learning ⊃ Generative AI**. If a human writes the rules as code, it is a rule-based system, not ML.
- Learning methods split on whether answers (labels) exist: supervised (classification, regression), unsupervised (clustering, dimensionality reduction), reinforcement (reward).
- If the output is a **category, it is classification; if it is a continuous number, it is regression**. Pick an evaluation metric by asking "which kind of mistake is more costly?"
- Generative AI predicts the probability of the next **token**, one token at a time. Cost, limits, non-determinism, and hallucination all come from this.
- The order for trying to change model behavior is **prompt engineering → RAG → fine-tuning**, cheapest and fastest first.

## AI · ML · Deep Learning · Generative AI: Re-Drawing the Inclusion Relationships

This is the last week. The goal of a review week is not "learning something new" but "re-drawing the boundaries that blur together." Today we combine Domain 1 (AI/ML Fundamentals, 20%), the starting point of the exam, with Domain 2 (Generative AI Fundamentals, 24%). Together the two domains make up 44% of the scored questions, and the questions in the remaining domains are built on the vocabulary used here.

The first trap to flag at the fundamentals level is the inclusion relationship among four terms. Small circles sit inside bigger circles.

| Term | Definition | Inclusion relationship |
|------|-----------|-----------|
| **AI (Artificial Intelligence)** | Any technology that imitates intelligent human behavior | The broadest category |
| **ML (Machine Learning)** | A branch of AI that learns rules from data on its own | AI ⊃ ML |
| **Deep Learning** | ML with deeply stacked neural network layers | ML ⊃ Deep Learning |
| **Generative AI** | A deep learning application that creates new content | Deep Learning ⊃ Generative AI |

- "Generative AI is a kind of ML" is true, and "all ML is deep learning" is false.
- If a human writes the rules directly as code, it is not ML but a **rule-based** system.
- The current exam guide adds **agentic AI** to the comparison. Where generative AI "produces the content you ask for," agentic AI is where a model receives a goal, plans the steps itself, and calls tools to finish the job. It is less a new circle in the inclusion diagram than a way of using a generative AI model as an "acting subject."

> 💡 **Related Theory**: What fundamentally separates ML from traditional programming is "do humans write the rules, or are the rules extracted from data?" Traditional programming is `input + rules → output`, but ML learns it backwards: `input + output (answers) → rules (the model)`. That is why ML works well only when there is enough "data with answers attached," and if the data is biased, the model is biased too. This is why ML is the answer when the exam presents a situation like "spam rules keep changing and people cannot keep up by hand."

## Three Learning Methods: Supervised · Unsupervised · Reinforcement

ML learning methods split on "are there answers (labels)?"

| Method | Data | Representative tasks | Examples |
|------|--------|-----------|------|
| **Supervised learning** | Answers exist | Classification, regression | Spam/normal classification, house price prediction |
| **Unsupervised learning** | No answers | Clustering, dimensionality reduction | Customer segmentation, anomaly detection |
| **Reinforcement learning** | Reward signal | Sequential decision-making | Game AI, robot control |

- Supervised learning splits again. If the output is a **category** (spam/normal, dog/cat), it is **classification**; if the output is a **continuous number** (price, temperature), it is **regression**. This distinction decides the answer on the exam.
- Not everything that outputs a number is regression. Choosing from fixed slots, such as "one of grades 1 to 5," is classification. Conversely, "tomorrow's visitor count" is a countable value, but because it predicts a continuous magnitude, it is regression.

Saying that unsupervised learning "learns without answers" means it finds structure within the data (distance, density, distribution) on its own. Clustering, for example, builds groups using only the notion of distance, "group the close ones together." That is why unsupervised learning is strong in exploratory situations where "you don't know in advance what to look for" (detecting abnormal transactions, discovering customer groups). Conversely, if you "already know what the right answer is," supervised learning is the fit.

| Clue in the question | Learning method / task |
|------|------|
| "Past transactions are marked fraud/normal" | Supervised learning, classification |
| "Predict rent from floor area and location" | Supervised learning, regression |
| "Group similar customers without labels" | Unsupervised learning, clustering |
| "Find patterns that differ from usual; there are no fraud labels" | Unsupervised learning, anomaly detection |
| "Learn actions that maximize reward through trial and error" | Reinforcement learning |

## Four Things Easy to Miss in Domain 1

These are items you skip if you stop at inclusion relationships and learning methods. All of them are in the exam guide's Domain 1 tasks.

**① When not to use ML**

| Situation | Verdict | Reason |
|------|------|------|
| The rules are clear and never change (tax calculation) | ML not suitable | Writing them as code is cheaper and more accurate |
| The same single outcome must come out every time | ML not suitable | ML produces probabilistic predictions |
| There is almost no data | ML not suitable | There is nothing to learn from |
| Build and operating costs exceed the value gained | ML not suitable | The cost-benefit does not add up |
| There are too many rules, or they keep changing, and data is plentiful | ML suitable | People cannot keep up with the rules |

**② Traditional ML model or foundation model: which to use**

| Criterion | Where a traditional ML model fits | Where a foundation model fits |
|------|------|------|
| Task | Classification, regression, forecasting on tabular data | Text/image generation, summarization, conversation |
| Explainability requirement | Decision rationale must be shown to a regulator | Flexibility matters more than explanation |
| Operating constraints | Latency and cost are strict and the task is narrow | You want one model to handle many tasks |
| Data | You have enough labeled data of your own | You must start right away without training data |

- In a scenario like "decide whether to approve a loan and explain the reason for rejection," picking the newest large model by reflex is wrong. When you see regulation and explanation requirements, look at traditional ML first.

**③ Four inference methods**

| Method | When to use | Example |
|------|------|------|
| Real-time | A response is needed immediately for each request | Fraud judgment at the moment of payment |
| Batch | Large amounts of data at once, no immediate response needed | Computing churn scores for all customers every night |
| Asynchronous | Inputs are large or processing takes long, so requests are queued and processed | Analyzing long videos or large documents |
| Serverless | Requests arrive sporadically and an always-on server would be wasteful | An internal tool that is called only occasionally |

**④ Evaluation metrics**

- **Accuracy** is the share of correct predictions out of all predictions. When classes are heavily imbalanced (1% fraud), answering "normal" for everything still gives 99%, so it cannot be trusted.
- **Precision** is the share of true cases among those flagged (it reduces false alarms), and **recall** is the share of true cases that were caught (it reduces misses). For a spam filter, precision comes first; for cancer diagnosis, recall comes first.
- The **F1 score** looks at precision and recall together.
- Separately from model metrics, the exam guide also lists **business metrics** (cost per user, development cost, customer feedback, return on investment) as evaluation criteria. Even with high accuracy, a model is not a good one if its cost exceeds its revenue.

## Generative AI Fundamentals: Tokens · Embeddings · Foundation Models

- Generative AI handles text in **tokens**, not words. A token is a word fragment, and both model cost and context limits are counted in tokens. Input tokens + output tokens is the bill.
- An **embedding** converts text or images into a numeric vector that carries meaning. If the meanings are similar, the vectors are close. It is the basis of search, recommendation, and RAG.
- A **foundation model (FM)** is a large general-purpose model pretrained on massive data, and one model serves many tasks such as summarization, translation, and classification. The giant text-centered ones are **LLMs (large language models)**.

| Concept | One-line definition | Exam point |
|------|-----------|-------------|
| Token | The processing unit of text (a word fragment) | Basis for cost and context limit |
| Embedding | A numeric vector that carries meaning | Basis for semantic search and RAG |
| Foundation model | A large pretrained general-purpose model | Reused across many tasks |
| LLM | A large text-centered FM | Chatbots, summarization, translation |

The principle by which an LLM writes is "next-token probability prediction." Looking at the tokens so far, it picks the most plausible next token one at a time and appends it. Because of this probabilistic nature, the answer varies slightly even for the same question (non-determinism), and the model also makes up things it does not know in a plausible way, which is **hallucination**. Tokens, probability, and hallucination are concepts from the same root, so understand them together.

Here are the basic terms from the exam guide that are not in the table above, one line each.

| Term | One-line definition |
|------|------|
| Chunking | Splitting a long document into small pieces that are good for retrieval. It is the preparation step of RAG |
| Vector | The array of numbers that results from an embedding. Stored in a vector database to find nearby ones |
| Transformer | The neural network architecture underlying today's LLMs |
| Multimodal model | A model that handles several forms together, such as text, images, and audio |
| Diffusion model | A generative model that starts from noise and refines it step by step to produce an image |
| Context window | The maximum number of tokens a model can see at once. Input and output are counted together |

## Tokens Determine Cost and Performance

- Pricing is per **input tokens + output tokens**. A longer prompt raises input cost, and a longer answer raises output cost.
- A chatbot feeds the previous conversation back in as input on every turn. The longer the conversation, the more a single question costs, and once it exceeds the context window, the earliest part is cut off.
- The more tokens there are to process, the slower the response. Cost and latency usually move together.
- That is why **choosing what goes into the context** matters. The exam guide calls this context engineering. Of the instructions, retrieved documents, conversation history, and tool results, you include only what is needed right now, which raises quality and saves tokens.
- Ways to reduce: an output length cap (max tokens), retrieving and including only the necessary document pieces, and choosing a smaller model suited to the task.

## Inference Parameters and Prompts in One Page

The key parameters that control generation results and the prompting techniques are also in scope for the exam.

- **Temperature**: higher is more diverse and creative, lower is more consistent and conservative. Lower it when accuracy matters.
- **Top-p / Top-k**: sampling controls that narrow the range of next-token candidates.
- **Max tokens**: the output length cap (cost control).
- **Zero-shot**: instructions only, no examples. **Few-shot**: show the pattern with a few examples (no weight change, In-Context Learning).
- The order for trying to change model behavior is **prompt engineering → RAG → fine-tuning**, cheapest and fastest first.

> 💡 **Related Theory**: When temperature is close to 0, the model picks only the "highest-probability token" every time, so it behaves almost deterministically. That is why a low temperature suits tasks with a single right answer such as classification and extraction, and a high temperature suits tasks that need diversity such as brainstorming and copywriting. Remember it as a dial between "creativity and consistency."

| What you want to do | What to adjust | Direction |
|------|------|------|
| Always the same answer to the same question | temperature | Lower it |
| Many varied ad-copy candidates | temperature | Raise it |
| Answers are too long and costly | max tokens | Reduce it |
| The model cannot match the output format | prompt | Add examples (few-shot) |
| The model does not know the latest internal information | knowledge supply | RAG |
| The model must deeply learn a specialist field's tone and terminology | the model itself | Fine-tuning |

- Parameters cannot change what the model **knows**. No matter how you tune temperature, information the model does not have does not appear.

## Strengths and Weaknesses of Generative AI, and Choosing a Model

| Category | Item named in the exam guide | Meaning |
|------|------|------|
| Strength | Adaptability | One model is used across many tasks |
| Strength | Responsiveness | It produces results quickly on request |
| Strength | Conversational ability | You can ask and answer in natural language |
| Strength | Content generation ability | It creates new text, images, and code |
| Weakness | Hallucination | It outputs untrue content plausibly |
| Weakness | Lack of interpretability | It is hard to see why it gave that answer |
| Weakness | Inaccuracy | Wrong calculations and facts get mixed in |
| Weakness | Non-determinism | The output varies even for the same input |

- When choosing a model, look together at model type, performance requirements, capabilities, constraints, regulatory compliance, cost, latency, and model complexity. It is rare that "the biggest model" is the answer. The smallest, cheapest model that meets the requirements is usually the right one.
- Business value is measured with metrics such as efficiency, conversion rate, average revenue per user, accuracy, customer lifetime value, and return on investment.

## Basic Terms of Agentic AI

The current exam guide puts the basic concepts of agentic AI in Domain 2. Because this is an entry-level exam, being able to say each term in one line is enough.

| Term | One-line definition |
|------|------|
| Agent | An AI that receives a goal, decides the steps itself, and uses tools to carry out the work |
| Tool usage | The model calling external capabilities such as APIs, search, or a calculator |
| Memory management | Remembering what was learned during a conversation or task and using it in the next step |
| Workflow orchestration | Coordinating the order of multiple steps and tool calls |
| Multi-agent system | A structure in which several agents with different roles cooperate and divide up a complex job |
| MCP (Model Context Protocol) | A standard protocol for connecting agents to external systems and tools |

- What separates a chatbot from an agent is **action**. "Tell me the refund policy" is answering; "look up the order and file the refund" is an agent's job.

## Six Common Misconceptions

| Misconception | Reality |
|------|------|
| AI and ML mean the same thing | ML is a branch of AI. Rule-based systems also fall under AI |
| Deep learning is always better | With little data or a need for explanation, a simpler model is better |
| High accuracy means a good model | With imbalanced data you must look at precision and recall |
| Few-shot trains the model | It only puts examples in the prompt; the weights stay the same |
| Lowering temperature removes hallucination | Consistency goes up, but the model does not come to know what it does not know |
| A big context window means good memory | It is only how much can be seen at once; nothing remains after the conversation ends |

## Final Checklist for Domains 1 and 2

If you can complete the sentence aloud, that line passes.

```text
[Domain 1 — AI/ML Fundamentals]
□ What is the inclusion relationship of the four terms? (→ AI ⊃ ML ⊃ Deep Learning ⊃ Generative AI)
□ What separates classification from regression? (→ Is the output a category or a continuous number)
□ Which task finds groups without labels? (→ Clustering in unsupervised learning)
□ Two situations where ML is not suitable? (→ The rules are clear; a single fixed outcome is required)
□ Which metric takes priority when misses are unacceptable? (→ Recall)
□ Which inference method predicts in bulk overnight? (→ Batch inference)
□ Which model to consider first for a regulated task that requires explanation? (→ A traditional ML model)

[Domain 2 — Generative AI Fundamentals]
□ What is the unit of cost and limits? (→ Tokens, input + output)
□ Which numeric representation gets closer when meanings are similar? (→ Embedding)
□ Why does hallucination occur at root? (→ It predicts next-token probability rather than verifying facts)
□ What should temperature be when consistent answers are needed? (→ Lower it)
□ What does not change in few-shot? (→ The model weights)
□ In what order do you try to change model behavior? (→ Prompt → RAG → Fine-tuning)
□ What separates an answer from an agent? (→ Whether it actually acts by using tools)
```

In the next post, we cover **AWS's AI services (foundation model applications)** in one sweep on top of this foundation. The key is practicing quickly recalling "which service for which situation."

## 📖 Glossary

- **Rule-based system**: A system in which a person writes conditions and rules directly as code to make it work. It does not learn from data.
- **Label**: The correct answer attached to training data.
- **Classification / Regression**: A task that predicts a category / a task that predicts a continuous number.
- **Clustering**: An unsupervised learning task that groups similar things together without answers.
- **Token**: A word fragment, the unit in which a model handles text. It is the basis of cost and limits.
- **Embedding**: A numeric vector that converts text or images so that it carries meaning.
- **Foundation model (FM)**: A large model pretrained on massive data and reused for many tasks.
- **Hallucination**: The phenomenon of plausibly producing content that is not true.
- **In-Context Learning**: Getting the model to follow a pattern using only examples inside the prompt, without changing the weights.
- **Agentic AI**: AI in which a model plans on its own toward a goal and acts by using tools.

---

## 📝 Practice Questions

**Question 1.** Which correctly shows inclusion relationship of AI, ML, Deep Learning, Generative AI?

A) Generative AI ⊃ AI ⊃ ML ⊃ Deep Learning  
B) AI ⊃ ML ⊃ Deep Learning ⊃ Generative AI  
C) ML ⊃ AI ⊃ Deep Learning ⊃ Generative AI  
D) Deep Learning ⊃ AI ⊃ ML ⊃ Generative AI  

**Answer: B**  
Explanation: Broadest category is AI, within it data-learning ML, then deep-stacked neural networks Deep Learning, finally content-generating Generative AI are nested. Other choices mangle inclusion order.

---

**Question 2.** Predicting home sale price from square footage and room count (continuous number output) — task type?

A) Classification  
B) Regression  
C) Clustering  
D) Reinforcement Learning  

**Answer: B**  
Explanation: Continuous numeric output (price) is regression. Classification is category prediction (spam/normal etc.), clustering is label-less grouping, reinforcement learning is reward-driven sequential decision-making — none match.

---

**Question 3.** Most accurate about "token (token)" in generative AI?

A) File unit storing model weights  
B) Text processing unit (word fragment), basis for cost and context limit  
C) User authentication security credential  
D) Single image pixel  

**Answer: B**  
Explanation: Token is the basic LLM text-processing unit (word fragment), determining input/output token count → cost and context window limits. A is model file, C is auth token, D is pixel — all different concepts.

---

**Question 4.** Lower temperature setting (near 0) produces what output effect?

A) Output becomes more creative and varies greatly each time  
B) Output becomes more consistent and predictable  
C) Model understands info it never trained on accurately  
D) Token cost becomes free  

**Answer: B**  
Explanation: Lower temperature → model prefers high-probability tokens → consistent, conservative output. High temperature makes output diverse (opposite of A). Temperature unrelated to knowledge or cost (C, D wrong).

---

**Question 5.** Recommended sequence when adjusting model behavior?

A) Fine-tuning → RAG → Prompt Engineering  
B) RAG → Prompt Engineering → Fine-tuning  
C) Prompt Engineering → RAG → Fine-tuning  
D) Fine-tuning → Prompt Engineering → RAG  

**Answer: C**  
Explanation: Try cheapest/fastest Prompt Engineering first, then external/latest knowledge RAG, finally costly Fine-tuning if deep domain internalization needed. Leading with expensive Fine-tuning or scrambled order not recommended.

---
