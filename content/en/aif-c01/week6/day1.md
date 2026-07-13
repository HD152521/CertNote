# Day 1 - Domain Review 1: AI/ML Fundamentals + Generative AI Fundamentals: Critical Summary

Finally, the last week. Over the last 5 weeks' content recompressed through an exam lens. Today we organize the two foundational areas of the exam — **AI/ML Fundamental Concepts** and **Generative AI Fundamentals**. These two areas carry the most weight in AIF-C01 (combined ~half), and every other domain's questions are built on vocabulary used here. Solidify this foundation and the rest becomes easier.

Review week's goal is not "learning new things" but "re-drawing blurry boundaries." Redraw the **distinction lines** the exam loves — AI vs ML vs Deep Learning, supervised vs unsupervised, classification vs regression — clearly again.

## AI · ML · Deep Learning · Generative AI: Re-Drawing Inclusion Relationships

The most-common foundational trap is the inclusion relationship of these four terms. Big circle inside small: concentric structure.

| Term | Definition | Inclusion Relationship |
|------|------|-----------|
| **AI (Artificial Intelligence)** | All technology imitating human intelligent behavior | Broadest category |
| **ML (Machine Learning)** | AI that learns rules from data itself — one branch | AI ⊃ ML |
| **Deep Learning** | ML with deeply stacked neural network layers | ML ⊃ Deep Learning |
| **Generative AI** | Deep Learning application generating new content | Deep Learning ⊃ Generative AI |

So "generative AI is a type of ML" is true, but "all ML is deep learning" is false. If rules are coded directly by humans, it's **rule-based** systems, not ML.

> 💡 **Related Theory**: What makes ML fundamentally different from traditional programming is "humans write rules OR we extract rules from data?" Traditional programming is `input + rules → output`, but ML reverses to `input + output(answers) → rules(model)` learned backwards. So ML requires "sufficient data with correct answers attached" to work well, and if data is biased, the model becomes biased too. In the exam, when you see "spam rules keep changing and humans can't keep up," ML becomes the answer — because of this essence.

## Three Learning Modes: Supervised · Unsupervised · Reinforcement

ML learning modes split by "does correct answer exist?"

| Mode | Data | Representative Task | Example |
|------|--------|-----------|------|
| **Supervised Learning** | Answers exist | Classification, Regression | Spam/normal classification, house price prediction |
| **Unsupervised Learning** | No answers | Clustering, Dimensionality Reduction | Customer segmentation, anomaly detection |
| **Reinforcement Learning** | Reward signal | Sequential decision-making | Game AI, robot control |

Within supervised, there's further split: **classification** if output is **categories** (spam/normal, dog/cat), **regression** if output is **continuous numbers** (price, temperature). This classification vs regression split appears almost every exam with one question.

> 💡 **Related Theory**: "Unsupervised learning works without correct answers" means the algorithm finds structure within data itself (distance, density, distribution). For example, clustering finds "groups of similar things" using only distance concept. So unsupervised is strong in exploratory situations (detecting unusual transactions, discovering customer groups) where you don't know in advance what to find. Conversely, if you already know "what's the correct answer," supervised is appropriate.

## Generative AI Fundamentals: Tokens · Embeddings · Foundation Models

Generative AI handles text not by word but by **token** units. Tokens are word fragments, and both model cost and context limit are calculated in tokens. Input tokens + output tokens = your bill.

**Embeddings** convert text/images into meaning-laden numeric vectors. Similar meaning means vectors are close. Forms the foundation of search, recommendation, RAG.

**Foundation Models (FM)** are large general-purpose models pretrained on massive data, where one model handles multiple tasks like summarization, translation, classification. The text-focused massive-scale model type is **LLM (Large Language Model)**.

| Concept | One-Line Definition | Exam Point |
|------|-----------|-------------|
| Token | Text processing unit (word fragment) | Basis for cost·context limit |
| Embedding | Numeric vector carrying meaning | Foundation for semantic search·RAG |
| Foundation Model | Large pretrained general-purpose model | Reusable across multiple tasks |
| LLM | Text-centric large FM | Chatbots, summaries, translations |

> 💡 **Related Theory**: How LLMs write is "next-token probability prediction." Looking at tokens so far, pick the most plausible next token and string them together one by one. This probabilistic nature makes answers slightly different each query (non-determinism) and the model fabricates unknown things plausibly (hallucination). Token, probability, hallucination are rooted in the same concept — understand together.

## Inference Parameters and Prompts: One-Line Each

Generation result manipulation via core parameters and prompt techniques are exam regulars too.

- **Temperature**: Higher = more diverse·creative, Lower = consistent·conservative. Importance accuracy → lower it.
- **Top-p / Top-k**: Next-token candidate range narrowing — sampling adjustment.
- **Max tokens**: Output length cap (cost control).
- **Zero-shot**: Instruction only, no examples. **Few-shot**: Example pattern display (no weight change, In-Context Learning).

The order of attempting behavior change is **Prompt Engineering → RAG → Fine-tuning** — cheapest and fastest first.

> 💡 **Related Theory**: At temperature near 0, the model picks "highest probability token only" each time, so behavior becomes nearly deterministic. High temperature for classification·extraction where answers are singular, high temperature for brainstorming·copywriting needing diversity. "Creativity ↔ Consistency" is the dial.

## Summary

Today re-solidified test foundation. First, **AI ⊃ ML ⊃ Deep Learning ⊃ Generative AI** inclusion and ML's essence of extracting rules from data vs human-coding them. Second, **supervised (classification/regression)·unsupervised·reinforcement** learning mode boundaries. Third, **tokens, embeddings, foundation models/LLMs** and inference parameter core. Stable terminology means remaining domain problems flow naturally.

Next text organizes AWS AI services (foundation model applications) over this foundation. Quick-recall "which situation needs which service" practice becomes the core.

---

## 📝 Practice Questions

**문제 1.** Which correctly shows inclusion relationship of AI, ML, Deep Learning, Generative AI?

A) Generative AI ⊃ AI ⊃ ML ⊃ Deep Learning  
B) AI ⊃ ML ⊃ Deep Learning ⊃ Generative AI  
C) ML ⊃ AI ⊃ Deep Learning ⊃ Generative AI  
D) Deep Learning ⊃ AI ⊃ ML ⊃ Generative AI  

**정답: B**  
해설: Broadest category is AI, within it data-learning ML, then deep-stacked neural networks Deep Learning, finally content-generating Generative AI are nested. Other choices mangle inclusion order.

---

**문제 2.** Predicting home sale price from square footage and room count (continuous number output) — task type?

A) Classification  
B) Regression  
C) Clustering  
D) Reinforcement Learning  

**정답: B**  
해설: Continuous numeric output (price) is regression. Classification is category prediction (spam/normal etc.), clustering is label-less grouping, reinforcement learning is reward-driven sequential decision-making — none match.

---

**문제 3.** Most accurate about "token (token)" in generative AI?

A) File unit storing model weights  
B) Text processing unit (word fragment), basis for cost and context limit  
C) User authentication security credential  
D) Single image pixel  

**정답: B**  
해설: Token is the basic LLM text-processing unit (word fragment), determining input/output token count → cost and context window limits. A is model file, C is auth token, D is pixel — all different concepts.

---

**문제 4.** Lower temperature setting (near 0) produces what output effect?

A) Output becomes more creative and varies greatly each time  
B) Output becomes more consistent and predictable  
C) Model understands info it never trained on accurately  
D) Token cost becomes free  

**정답: B**  
해설: Lower temperature → model prefers high-probability tokens → consistent, conservative output. High temperature makes output diverse (opposite of A). Temperature unrelated to knowledge or cost (C, D wrong).

---

**문제 5.** Recommended sequence when adjusting model behavior?

A) Fine-tuning → RAG → Prompt Engineering  
B) RAG → Prompt Engineering → Fine-tuning  
C) Prompt Engineering → RAG → Fine-tuning  
D) Fine-tuning → Prompt Engineering → RAG  

**정답: C**  
해설: Try cheapest/fastest Prompt Engineering first, then external/latest knowledge RAG, finally costly Fine-tuning if deep domain internalization needed. Leading with expensive Fine-tuning or scrambled order not recommended.

---
