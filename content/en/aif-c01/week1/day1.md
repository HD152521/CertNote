# Day 1 - The Relationship and Differences Between AI, Machine Learning, and Deep Learning

## Introduction

The AWS Certified AI Practitioner (AIF-C01) exam starts with understanding the fundamental concepts of AI and machine learning. Today we will clearly sort out the relationship between three of the most easily confused terms: **Artificial Intelligence (AI)**, **Machine Learning (ML)**, and **Deep Learning (DL)**.

These three words are used almost interchangeably in news and advertising, but in reality they are distinct concepts that sit in a nested relationship. Understanding this difference precisely will help you speak much more clearly not only on exam questions but also in real-world conversations.

## The Nested Relationship of the Three Concepts

The first picture to remember is a structure of "smaller circles inside a bigger circle."

```
┌─────────────────────────────────────┐
│ Artificial Intelligence (AI)         │
│  ┌────────────────────────────────┐  │
│  │ Machine Learning (ML)           │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │ Deep Learning (DL)        │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
└─────────────────────────────────────┘
```

- **Artificial Intelligence (AI)**: The broadest concept. Any technology that mimics intelligent human behavior.
- **Machine Learning (ML)**: One way of implementing AI. A technique that "learns" rules from data.
- **Deep Learning (DL)**: A type of machine learning. A technique that learns by stacking artificial neural networks in multiple layers.

In other words, **all deep learning is machine learning, and all machine learning is AI**, but the reverse does not hold.

## 1. What Is Artificial Intelligence (AI)?

Artificial intelligence is the broadest field, aiming to "make machines think or act like humans." It includes not only machine learning but also approaches where humans write the rules one by one themselves (rule-based systems).

For example, an automatic thermostat that operates only on human-made rules such as "if the temperature exceeds 28 degrees, turn on the air conditioner" can be seen, in a broad sense, as an early form of AI. It does not need to learn from data.

> 💡 **Related theory**: The term AI was first officially used at the Dartmouth Conference in 1956. Early AI mostly took a "rule-based (expert system)" approach in which humans defined the rules directly.

## 2. What Is Machine Learning (ML)?

Machine learning is a method where, instead of a human writing out every rule, **you show the machine data and let it find the rules (patterns) on its own**.

The key differences can be compared as follows.

| Aspect | Rule-based programming | Machine learning |
|------|---------------------|----------|
| Who creates the rules | Humans | The machine learns them from data |
| Input | Data + rules | Data + answers (examples) |
| Output | Results | Rules (a model) |
| Adapting to new situations | Rules must be rewritten | Can be retrained on new data |

For example, consider the problem "filter out spam email." A rule-based approach has a human write conditions directly, such as "if the subject contains 'free,' it is spam." But when spammers change their wording, the rules must keep being revised. With machine learning, if you show it tens of thousands of spam/legitimate emails, it learns on its own which characteristics indicate spam.

> 💡 **Related theory**: The classic definition of machine learning is "a field of study that gives computers the ability to learn without being explicitly programmed" (Arthur Samuel, 1959).

## 3. What Is Deep Learning (DL)?

Deep learning is a branch of machine learning that learns complex patterns by stacking **artificial neural networks** in many layers (hence "deep"). The idea was inspired by the neuron structure of the human brain.

Deep learning is especially powerful with highly complex, unstructured data such as images, speech, and natural language. However, it has the following characteristics.

- It requires **large amounts of data**.
- It requires **powerful computing resources (such as GPUs)**.
- The learning process often looks like a "black box," making the results hard for humans to interpret.

The **generative AI** making headlines today (ChatGPT, image generation, etc.) is also entirely based on deep learning. We will cover this in more detail in later weeks.

> 💡 **Related theory**: The decisive moment when deep learning went mainstream was in 2012, when a neural network-based model showed overwhelming performance at the ImageNet image recognition competition. The combination of massive data and GPU computing was the key.

## Summarizing with Everyday Examples

| Example | Category | Reason |
|------|------|------|
| An automatic thermostat operating on rules | AI (not machine learning) | Operates only on human-made rules |
| Email spam filter | Machine learning | Learns spam patterns from data |
| Smartphone face-recognition unlock | Deep learning | Recognizes face images with a neural network |
| Speech recognition in voice assistants (Siri, Alexa) | Deep learning | Converts speech to text with a neural network |
| Product recommendations in an online store | Machine learning | Learns preference patterns from purchase data |

Looking at this table, the nested relationship — "deep learning is a special case of machine learning, and machine learning is one method of AI" — becomes intuitive.

## Why This Distinction Matters

On the exam, you will see questions like "Which technology does this scenario correspond to?" or "How does deep learning differ from machine learning?" It is also the foundation for judging, in practice, "Does our problem really need deep learning, or is simple machine learning — or plain rules — enough?"

The key point is that **more complex technology is not always better**. Solving simple problems with simple methods is advantageous in terms of cost and maintenance.

## Today's Summary

- Remember the nested relationship: AI ⊃ Machine Learning ⊃ Deep Learning.
- AI is the broadest: "any technology that mimics intelligent behavior."
- Machine learning is a method that "learns rules from data."
- Deep learning is a type of machine learning that "stacks neural networks deeply."
- All deep learning is machine learning, but not all AI is machine learning.

## 📝 Practice Questions

**Question 1.** Which statement most accurately describes the relationship between Artificial Intelligence (AI), Machine Learning (ML), and Deep Learning (DL)?

A) The three concepts are completely independent and do not overlap  
B) Deep learning is the broadest concept, containing machine learning and AI within it  
C) AI is the broadest, machine learning is contained within it, and deep learning is contained within machine learning  
D) Machine learning and deep learning mean the same thing and are unrelated to AI  

**Answer: C**  
Explanation: AI is the largest category, machine learning is one way of implementing AI, and deep learning is a type of machine learning. Therefore the nested relationship is AI ⊃ ML ⊃ DL. Claims that the three concepts are independent, that deep learning is the broadest, or that machine learning and deep learning are identical all misunderstand this nested relationship.

---

**Question 2.** Which statement is correct about a system that operates entirely on rules a human wrote by hand, such as "if the subject contains a specific word, process it"?

A) It learns rules from data, so it is a typical example of machine learning  
B) It uses a neural network, so it is deep learning  
C) Since a human created the rules directly, it is hard to consider it machine learning  
D) It is just ordinary software with no connection to AI at all  

**Answer: C**  
Explanation: The essence of machine learning is that the machine learns rules on its own from data. A system whose rules were written directly by a human has no learning process, so it is hard to consider it machine learning. It does not use a neural network, so it is not deep learning either. However, a rule-based system that mimics intelligent behavior can still fall within the broad category of AI.

---

**Question 3.** Compared with traditional machine learning, what does deep learning generally require more of?

A) Explicit rules written directly by humans  
B) Large amounts of data and powerful computing resources  
C) An environment that uses no data at all  
D) An environment that uses only small amounts of simple tabular data  

**Answer: B**  
Explanation: Because deep learning stacks neural networks deeply to learn complex patterns, it generally requires large amounts of data and powerful computing resources such as GPUs. Explicit rules written by humans are a characteristic of the rule-based approach, and the claim of using no data contradicts the very nature of machine learning.

---

**Question 4.** Which of the following data types does deep learning generally show its greatest strength with?

A) Simple calculations easily handled by fixed rules  
B) Complex, unstructured data such as images, speech, and natural language  
C) Small-scale environments with almost no data  
D) Problems where humans can clearly define every rule  

**Answer: B**  
Explanation: Deep learning is especially powerful with unstructured data where humans struggle to define clear rules and patterns are complex, such as image recognition, speech recognition, and natural language processing. Its advantages are hard to realize on simple problems easily handled by rules or in environments with very little data.

---
