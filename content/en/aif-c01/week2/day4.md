# Day 4 - The Human Role in ML Development: Labeling, Feedback, and Iterative Improvement

## 📌 Key Takeaways

- ML is **collaboration between people and machines**. The impression that "the machine does everything by itself" is nearly the opposite of reality.
- **Labeling**: People attach correct answers to data. It is the **foundation of supervised learning**, and if the labels are wrong, the model learns wrongly too.
- **Feedback**: People evaluate and correct the model's answers. In generative AI, **RLHF** is the representative technique.
- **Human-in-the-loop (HITL)**: The more important or risky a decision, the more a person does the final review and approval. It is a core safeguard of responsible AI.
- ML is not "completed" but **"continuously improved."** Take people out and the model grows stale through drift.

## Why People Are Needed

- AIF-C01 asks about this topic in the context of the **"Human-in-the-loop" (a loop in which people intervene)** concept and responsible AI.
- **Who tells the model "this photo is a cat"?** The machine doesn't know it from the start; people have to tell it.
- **Ultimately judging** whether the model's answers are right or wrong, and what is inappropriate, is also **done by people**.

Of the three learning types from Week 1 (supervised, unsupervised, reinforcement), the one that directly depends on human labeling is **supervised learning**. Supervised learning learns from "input + correct answer (label)" pairs, while unsupervised learning learns from the structure of the data alone, without answers. At exam entry level, remembering "with labels → supervised, without labels → unsupervised" is enough.

## 1. Data Labeling — Attaching Correct Answers

- The work of attaching **a "this is what" answer key (label)** to raw data.
- A supervised learning model learns patterns by looking at these labels.

| Data type | Labeling examples |
|------------|-----------|
| Image | Marking "this photo is a cat/dog," drawing boxes around objects in a photo |
| Text | Marking "this review is positive/negative," tagging people's names within sentences |
| Audio | Listening to a recording and transcribing it into text |

- Labeling is **slow, expensive, and labor-intensive** (think of attaching labels one by one to tens of thousands of photos).
- That is why **labeling quality control** is a major challenge in ML projects.

> ⚠️ **Pitfall**: If the labels are wrong, the model learns wrongly too. If a labeler mistakenly tags a photo of a dog as "cat," the model learns that wrong answer as it is. That is why quality is managed by having several people label the same data and checking their agreement, or by adding a review step.

AWS has a labeling tool called **Amazon SageMaker Ground Truth**. It manages human labelers and provides features that lighten the people's workload through automatic labeling. For the exam, it is enough to know that "there is an AWS service that helps with labeling."

## 2. Feedback — Evaluating and Correcting the Model's Answers

- When the model produces an answer, people **evaluate and correct** it. This feedback is the key fuel for improving the model.
- Human feedback is especially **decisive in generative AI**.
- Feedback doesn't end after one round: the **loop** of the model answers → people evaluate → the model improves → it answers again keeps turning.

The representative technique for refining generative AI (large language models) is **RLHF (Reinforcement Learning from Human Feedback)**. When people evaluate which of the model's several answers is better, the model is adjusted toward "the direction people prefer" based on that evaluation. This human feedback is the key to making a chatbot answer in a more helpful and less risky way.

## 3. Human-in-the-loop — A Person Is Inside the Loop

- **HITL** is a **design that deliberately inserts human judgment** into the operation of an ML system.
- When the model is unsure, the decision is important, or the risk is high → **don't decide automatically; hand it to a person**.

| Situation | What HITL does |
|------|---------------|
| A judgment the model is unsure about | Request review by a person |
| A high-risk decision (loan denial, medical) | A person gives the final approval |
| The model gave a wrong answer | A person corrects it → it is reflected in the next training |
| Inappropriate or dangerous output | A person filters it out |

HITL is a core safeguard of Responsible AI. If you let AI decide everything automatically, there is no way to catch biased judgments or dangerous mistakes. Keeping a person in the loop compensates for the model's limitations and also makes it clear who is accountable for a wrong decision. The principle is "the more important or risky the decision, the stronger the human involvement."

> 🎯 **Scenario**: "An AI automatically reviews loan applications, and a denial decision has a major impact on people's lives. How should it be designed?" → Because it is a high-risk decision, apply Human-in-the-loop so that, at minimum, significant decisions such as denials are given a final review and approval by a person.

## 4. Iterative Improvement — ML Is Not Completed in One Go

- A large part of the force that turns the cyclical lifecycle from Day 1 is **iterative improvement by people**.
- After deployment, people look at real usage results → collect the wrong cases → attach labels to new data → retrain.

![An improvement loop that goes from labeling through training, model responses, and human evaluation, then back to training](/diagrams/en/ml-feedback-loop.svg)

- The key point: **ML is not "completed" but "continuously improved."** Human labels, feedback, and review keep this loop alive.

> ⚠️ **Pitfall**: The thought that "once you build a good model, it needs no more human effort" is dangerous. Data changes (drift), new situations appear, and the model grows stale. Without continuous human monitoring and feedback, even a good model collapses over time.

## Labeling, Feedback, and Review Happen at Different Points in Time

All three share the fact that "people step in," but they differ in **when and on what** they step in. The exam mixes up these timings when asking.

| Category | When | What people do | Output |
|------|------|---------------|--------|
| Data labeling | **Before** training | Attach correct answers to raw data | Labeled training data |
| Feedback (RLHF, etc.) | **While refining** the model | Evaluate the model's answers and rank them | A model that reflects human preferences |
| Human evaluation | Evaluation **before** deployment | People directly score the quality of the model's output | Grounds for deciding whether to deploy |
| HITL review | Inference time **during** operation | Check, approve, or correct individual predictions the model produced | A reviewed final decision + corrected cases |
| Human audit | **Periodically** during operation | Draw a sample and check for bias and errors | Problems found → a trigger for retraining |

- If the passage says "prepare the training data," it is labeling; if it says "pick the better of the model's responses," it is feedback; if it says "a staff member checks the prediction before it goes out to the user," it is HITL review.
- The responsible AI domain lists **label quality analysis, human audits, and subgroup analysis** (measuring performance separately for each group) as means of finding bias. All three involve human judgment.

## How Does SageMaker Ground Truth Lighten the Human Workload?

Amazon SageMaker Ground Truth is a service that builds labeled datasets using "people + machine learning." There are three things to know.

**1) Who does the labeling — three kinds of workforce**

| Workforce | Who they are | Suitable situation |
|------|---------|--------------|
| Amazon Mechanical Turk | Public workers around the world | Large volumes of non-sensitive data, quickly |
| Private workforce | Our company's employees and contractors | Data that must not be exposed externally, work requiring in-house expertise |
| Vendor | Specialist labeling companies on AWS Marketplace | When handing the whole job to a professional workforce |

- Clue for telling them apart: when **the data is sensitive**, such as "patient records" or "confidential internal documents," choose a **private workforce**.

**2) Automatic labeling — only the uncertain items go to people**

```
① People label a portion of the sample
        ↓
② Train a labeling model with those results
        ↓
③ The model assigns labels and confidence scores to the remaining data
        ├─ Confidence at or above the threshold → label is confirmed automatically
        └─ Confidence is low                    → send to a person
        ↓
④ Improve the model with the labels people attached, and repeat from ②
```

- This approach is called **active learning**. Machines handle the easy items and people handle the confusing ones, reducing labeling time and cost.
- People are not removed entirely. The starting sample and the difficult cases remain people's job to the end.

**3) Combining several people's answers into one — annotation consolidation**

- Give the same data to two or more people and combine their answers to settle on a single label. This prevents one person's mistake or subjectivity from becoming the correct answer as is.
- Adding more workers raises label accuracy but also raises cost. It is a trade-off between quality and cost.

- Note: AWS documentation currently states that Ground Truth is not open to new customers and that only existing customers can continue to use it. For the exam, remember it by its role: "**the service that helps with labeling = Ground Truth**."

## In What Order Does RLHF Proceed?

We'll grasp only the flow, without equations.

| Step | What is done | Role of people |
|------|--------|------------|
| ① | Collect questions and model answers | People write good answers themselves |
| ② | Fine-tune the language model on those model answers using supervised learning | — |
| ③ | Rank the model's several answers to the same question. Train a separate **reward model** with this preference data | People choose which answer is better |
| ④ | Adjust the language model in the direction that raises the scores the reward model assigns | — |

- Step ③ is the key. Since people cannot score every answer one by one, we build a **scorer that imitates human taste** (the reward model) and have that scorer give the scores instead.
- Connecting this to the reinforcement learning of Week 1, the difference is that the reward is given not by the environment but by **a model that learned from human evaluations**.

## HITL Does Not Mean "People See Everything"

- If people review every prediction, automation is pointless. The actual design is **deciding the conditions for which cases get sent to people**.
- There are two representative conditions: cases where the model's **confidence is below the threshold**, and a **randomly drawn sample** for quality checks.

As a hypothetical example, a model that reads items from loan documents processes 10,000 per day. The 9,200 cases with confidence of 90% or higher pass straight through, and only the 800 cases (8%) below that are sent to a staff member. The staff member looks at just 8% of the total while still filtering out the cases most likely to be wrong. Blurry scans and hard-to-read handwriting mostly end up in these 800.

- The AWS service that provides this structure is **Amazon Augmented AI** (Amazon A2I). It builds the flow that routes low-confidence predictions from Amazon Textract and Amazon Rekognition, or predictions from your own model, to human review (according to its documentation, A2I is also currently not open to new customers).

| Situation | Suitable human involvement |
|------|----------------|
| Tens of thousands of product photos need defect/normal marking | Data labeling (with automatic labeling alongside) |
| Labeling data that must not leak externally, such as medical images | Labeling with a private workforce |
| Refining chatbot answers to be more helpful and less risky | Human feedback (RLHF) |
| Checking only the low-confidence cases among document extraction results | HITL review (confidence condition) |
| A high-impact decision such as a loan denial | HITL — a person gives the final approval |
| Checking whether a model in operation is unfavorable to a specific group | Human audit + subgroup analysis |

## Correcting Common Misconceptions

- **"HITL = people review every prediction"** → Only the cases that are high risk or that the model is unsure about are selected and sent.
- **"If you use automatic labeling, people are not needed"** → People label the initial sample and the low-confidence cases. The human workload merely shrinks.
- **"Unsupervised learning needs no people"** → It just doesn't need labels. People interpret and verify whether the results are usable.
- **"Adding more labelers automatically raises quality"** → If the guidelines are ambiguous, each person labels differently. Clear labeling criteria and review come first.
- **"A person reviewed it, so there is no bias"** → Human judgment has bias too, and if it enters the labels, the model learns it as is.

Tomorrow we bring together everything from this week — the ML lifecycle and data — for a review and organize the points the exam asks about.

## 📖 Glossary

- **Data labeling**: The work of people attaching a "this is what" correct answer to raw data.
- **Label**: The answer key attached to data. The value the model uses as its reference when learning.
- **Supervised learning**: A way of learning from data in which inputs and correct answers are paired. Labels are essential.
- **Unsupervised learning**: A way of learning by looking only at the structure or groupings of the data itself, without answers.
- **RLHF**: A technique in which people evaluate how good or bad the model's answers are, and the model is adjusted by that evaluation in the direction people want.
- **Human-in-the-loop (HITL)**: A design that doesn't let AI decide alone and inserts human judgment at important points.
- **Responsible AI**: A collective term for the principles and practices that aim to make AI fair, safe, and explainable.
- **Amazon SageMaker Ground Truth**: An AWS labeling service that manages human labelers and also helps with automatic labeling.
- **Iterative improvement**: Making a model a little better by continually cycling through deploy → observe usage results → incorporate labels and feedback → retrain.
- **Label agreement**: How often the same answer was attached when several people labeled the same data. A way of measuring label quality.

## 📝 Practice Questions

**Question 1.** In supervised learning, what is the task of attaching correct answers such as "this is a cat/dog" to data by humans called?

A) Data Drift  
B) Data Labeling  
C) Overfitting  
D) Model Deployment  

**Answer: B**  
Explanation: Attaching a label (correct answer showing "what this is") to raw data is data labeling, and supervised learning models learn patterns by seeing these labels. Data drift is distribution change, overfitting is memorizing training data, and deployment is uploading the model to services—all different concepts.

---

**Question 2.** Which technique is representative for refining a large language model (generative AI) in the direction humans prefer, by having humans rate the model's responses and reflecting those ratings in training?

A) Data Leakage  
B) RLHF (Reinforcement Learning from Human Feedback)  
C) Unsupervised Learning  
D) Class Imbalance Handling  

**Answer: B**  
Explanation: RLHF is a technique where people evaluate which of several model responses is better, and based on that feedback, the model is adjusted in directions humans prefer. This is core to making generative AI more useful and safe. Data leakage is evaluation contamination, unsupervised learning is learning without answers, and class imbalance handling is a separate data issue.

---

**Question 3.** What is the approach called in which, for high-stakes decisions that greatly affect people's lives such as loan denials, AI does not make the decision on its own but is designed so that a human gives final review and approval?

A) Data Labeling  
B) Human-in-the-loop  
C) Underfitting  
D) Data Drift  

**Answer: B**  
Explanation: Human-in-the-loop is a design that intentionally weaves human judgment into ML system operations, where people conduct final review and approval of dangerous or critical decisions to complement model limitations and clarify responsibility. The other options are labeling, learning states, or distribution changes—different concepts.

---

**Question 4.** Which statement most accurately describes the effect of data labeling quality on a model?

A) Even if labels are wrong, the model will learn correctly by itself  
B) Incorrect labels cause the model to learn those wrong answers as is  
C) Label quality is unrelated to model performance  
D) Labeling is only needed in unsupervised learning  

**Answer: B**  
Explanation: Supervised learning models accept human-attached labels as correct answers and learn from them, so wrong labels result in learning those incorrect answers. Therefore, label quality directly affects model performance. Labeling is core for supervised learning where answers are needed, and unsupervised learning learns without answers, so D is also wrong.

---

**Question 5.** What is the most appropriate rebuttal to the claim that "once a model is built well, no more human involvement is needed"?

A) That's correct; well-built models remain accurate forever  
B) Because data changes and models become outdated, continuous monitoring, feedback, and retraining are necessary  
C) Human involvement only slows learning speed and doesn't help  
D) Unsupervised learning needs no people at all, so that's correct  

**Answer: B**  
Explanation: Over time, data distribution changes (drift) and new situations emerge, making models outdated. Therefore, continuous human monitoring, feedback, and retraining are necessary for models to keep working well. There are no eternally accurate models so A is wrong, and human involvement is essential for model quality so C is wrong too.

---
