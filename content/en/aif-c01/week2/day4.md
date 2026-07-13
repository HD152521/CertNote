# Day 4 - The Human Role in ML Development: Labeling, Feedback, and Iterative Improvement

When people think of ML, they often get the impression that "machines do everything themselves." The reality is nearly the opposite. Behind every good ML system, **there is always a person**. People label data with correct answers (labeling), evaluate the model's responses and give feedback, and iteratively refine the model with that feedback (iterative improvement). Today we organize "the human role" that pervades the entire ML lifecycle.

AIF-C01 frequently asks about this topic in the context of "Human-in-the-loop" and Responsible AI.

## Why People Are Needed

We said models learn patterns from data. But **who tells the model "this photo is a cat"?** The machine doesn't know it from the start by itself. People must tell it. Furthermore, people ultimately judge whether the model's answers are correct or wrong, and what is inappropriate.

> 💡 **Related Theory**: ML learning methods broadly divide into **Supervised Learning** and **Unsupervised Learning**. Supervised learning learns from pairs of "input + correct answer (label)," while unsupervised learning learns from data structure alone without answers. Human labeling is particularly important for supervised learning. At exam entry level, remembering "with labels → supervised, without labels → unsupervised" is enough.

## 1. Data Labeling — Attaching Correct Answers

Data labeling is the work of attaching **"this is what"** labels to raw data. Supervised learning models learn patterns by seeing these labels.

| Data Type | Labeling Example |
|-----------|-----------------|
| Images | Mark "this photo is cat/dog," draw boxes around objects |
| Text | Mark "this review is positive/negative," tag person names |
| Audio | Listen to recording and transcribe to text |

Labeling is **slow, expensive, and labor-intensive**. Imagine attaching labels one by one to tens of thousands of photos. That's why managing label quality is a major challenge in ML projects.

> ⚠️ **Pitfall**: If labels are wrong, models learn wrong too. If a labeler wrongly marks a dog photo as "cat," the model learns that incorrect answer. That's why multiple people often label the same data to check agreement, or quality control stages are added to manage label quality.

> 📚 **Example**: AWS has a tool called **Amazon SageMaker Ground Truth** for labeling. It manages human labelers and provides features that automate some labeling to reduce human work. For the exam, it's enough to know "there are AWS services that help with labeling."

## 2. Feedback — Evaluating and Correcting the Model's Answers

When a model produces an answer, people **evaluate and correct** it. This feedback is the key fuel for improving the model. Especially in generative AI, human feedback plays a decisive role.

> 💡 **Related Theory**: A signature technique for refining generative AI (large language models) is **RLHF (Reinforcement Learning from Human Feedback)**. People evaluate which of several model responses is better, and based on that evaluation, the model is adjusted in the "direction humans prefer." This human feedback is core to making chatbots more helpful and less risky.

Feedback doesn't end once. The model answers → people evaluate → the model improves → answers again—this **loop** keeps turning.

## 3. Human-in-the-Loop — People in the Loop

**Human-in-the-loop (HITL)** refers to a design that intentionally weaves human judgment into ML system operations. When the model is uncertain, the decision is important, or risk is high, **we don't decide automatically but hand it to a person**.

| Situation | What HITL Does |
|-----------|----------------|
| Model uncertain about judgment | Request human review |
| High-risk decisions (loan denial, medical) | Human final approval |
| Model gets answer wrong | Person corrects → reflected in next training |
| Inappropriate or dangerous output | Person filters it out |

> 💡 **Related Theory**: HITL is a core safety mechanism for Responsible AI. If we let AI automatically decide everything, there's no way to filter out biased judgments or dangerous errors. Having people in the loop complements the model's limitations and clarifies responsibility for wrong decisions. The principle is "the more important or risky the decision, the stronger the human involvement."

> 🎯 **Scenario**: "AI automatically reviews loan applications, but rejection decisions greatly impact people's lives. How should we design this?" → Since it's a high-risk decision, we should apply Human-in-the-loop to ensure at least critical decisions like rejections undergo human final review and approval.

## 4. Iterative Improvement — ML Is Never Finished in One Pass

On Day 1 we said the ML lifecycle is a circular loop. A large part of the force that drives this circulation is **human iterative improvement**. After deploying a model, people observe actual use results, collect wrong cases, label new data, and retrain the model. Through this process, the model gradually improves.

```
[ The improvement loop humans drive ]

  Labeling → Training → Model answers → People evaluate/correct
    ▲                                    │
    │                                    ▼
    └──── Retrain reflecting new labels·feedback ◄───┘
```

The core insight is that **ML is not "completed" but "continuously improved."** Human labels, feedback, and review keep this improvement loop alive.

> ⚠️ **Pitfall**: The idea that "once we build a good model, people don't need to be involved anymore" is dangerous. Data changes (drift), new situations emerge, and models become outdated. Without continuous human monitoring and feedback, even a good model crumbles over time.

## Wrapping Up

Today's core can be summed in one sentence: "**ML is collaboration between humans and machines.**" Humans (1) attach correct answers to data (labeling, especially the foundation of supervised learning), (2) evaluate and correct the model's answers (feedback, in generative AI this is RLHF), (3) directly intervene in important or risky decisions (Human-in-the-loop), and (4) repeat this process to continuously improve the model. While machines learn patterns, it's always people who guide those patterns toward the right direction.

Tomorrow we recap all this week's content—the ML lifecycle and data—together and organize the points that frequently appear on the exam.

---

## 📝 연습 문제

**문제 1.** 지도 학습(Supervised Learning)에서 사람이 데이터에 "이것은 고양이/강아지"라는 정답을 붙이는 작업을 무엇이라 하는가?

A) Data Drift  
B) Data Labeling  
C) Overfitting  
D) Model Deployment  

**정답: B**  
해설: Attaching a label (correct answer showing "what this is") to raw data is data labeling, and supervised learning models learn patterns by seeing these labels. Data drift is distribution change, overfitting is memorizing training data, and deployment is uploading the model to services—all different concepts.

---

**문제 2.** 대규모 언어 모델(생성형 AI)을 사람이 선호하는 방향으로 다듬기 위해, 사람이 모델의 답변을 평가하고 그 평가를 학습에 반영하는 대표 기법은?

A) Data Leakage  
B) RLHF (Reinforcement Learning from Human Feedback)  
C) Unsupervised Learning  
D) Class Imbalance Handling  

**정답: B**  
해설: RLHF is a technique where people evaluate which of several model responses is better, and based on that feedback, the model is adjusted in directions humans prefer. This is core to making generative AI more useful and safe. Data leakage is evaluation contamination, unsupervised learning is learning without answers, and class imbalance handling is a separate data issue.

---

**문제 3.** 대출 거절처럼 사람의 삶에 큰 영향을 주는 고위험 결정에 대해, AI가 단독으로 자동 결정하지 않고 사람이 최종 검토·승인하도록 설계하는 접근을 무엇이라 하는가?

A) Data Labeling  
B) Human-in-the-loop  
C) Underfitting  
D) Data Drift  

**정답: B**  
해설: Human-in-the-loop is a design that intentionally weaves human judgment into ML system operations, where people conduct final review and approval of dangerous or critical decisions to complement model limitations and clarify responsibility. The other options are labeling, learning states, or distribution changes—different concepts.

---

**문제 4.** 데이터 라벨링 품질이 모델에 미치는 영향으로 가장 정확한 것은?

A) Even if labels are wrong, the model will learn correctly by itself  
B) Incorrect labels cause the model to learn those wrong answers as is  
C) Label quality is unrelated to model performance  
D) Labeling is only needed in unsupervised learning  

**정답: B**  
해설: Supervised learning models accept human-attached labels as correct answers and learn from them, so wrong labels result in learning those incorrect answers. Therefore, label quality directly affects model performance. Labeling is core for supervised learning where answers are needed, and unsupervised learning learns without answers, so D is also wrong.

---

**문제 5.** "모델을 한 번 잘 만들면 더 이상 사람의 개입이 필요 없다"는 주장에 대한 가장 적절한 반박은?

A) That's correct; well-built models remain accurate forever  
B) Because data changes and models become outdated, continuous monitoring, feedback, and retraining are necessary  
C) Human involvement only slows learning speed and doesn't help  
D) Unsupervised learning needs no people at all, so that's correct  

**정답: B**  
해설: Over time, data distribution changes (drift) and new situations emerge, making models outdated. Therefore, continuous human monitoring, feedback, and retraining are necessary for models to keep working well. There are no eternally accurate models so A is wrong, and human involvement is essential for model quality so C is wrong too.

---
