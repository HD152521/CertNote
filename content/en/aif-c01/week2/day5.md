# Day 5 - Week 2 Summary: ML Lifecycle and Data at a Glance

This week we reviewed "how ML is actually built and operates" from a data perspective. Even without directly coding models, understanding the flow from model inception to operation and the principles of data supporting that flow lets us answer a substantial part of the AIF-C01 exam. Today we tie together four days of content and organize the points that frequently become pitfalls on the exam.

## Week 2 at a Glance

```
[ ML Lifecycle — a circular loop (Day 1) ]

 Data Collection → Data Preparation → Training → Evaluation → Deployment → Monitoring
      ▲                                                              │
      └──────── Return to beginning upon performance degradation ◄──┘

   ├─ Data (Day 2): Structured/Unstructured, Training·Validation·Test Split, Quality
   ├─ Evaluation (Day 3): Accuracy·Precision·Recall, Overfitting/Underfitting
   └─ People (Day 4): Labeling, Feedback (RLHF), Human-in-the-loop, Iterative Improvement
```

The one core message to take is this—**ML is a circle, not a line, and that circle is turned by people and data together.**

## Core Concepts Summary

| Topic | Core One-Liner | Frequent Pitfalls |
|-------|-----------------|-------------------|
| ML Lifecycle (Day 1) | Collection→Preparation→Training→Evaluation→Deployment→Monitoring, circular | Skipping "preparation" stage, mistaking deployment for the end |
| Structured/Unstructured (Day 2) | Structured=tables, Unstructured=images·audio·text | Confusing audio/images as structured |
| Data Split (Day 2) | Training/Validation/Test, test is hidden to the end | Data leakage (test mixed into training) |
| Data Quality (Day 2) | Lack of representativeness → bias | Misconception that only quantity matters |
| Accuracy (Day 3) | Proportion correct out of all | Fooled by accuracy on imbalanced data |
| Precision (Day 3) | Real proportion among what we caught, fears FP | Confusing with recall |
| Recall (Day 3) | Proportion we caught out of what's real, fears FN | Confusing with precision |
| Overfitting (Day 3) | Memorized training data, weak on new data | Judging as good based on training accuracy only |
| Underfitting (Day 3) | Too simple, fails to learn even training data | Confusing direction with overfitting |
| Human Role (Day 4) | Labeling·feedback·HITL·iterative improvement | Misconception that "machines do everything" |

## Easily Confused Pairs—Comparison Again

### Precision vs Recall — Once More

These are the most confused pair on exams. Remember by situation keywords.

| Situation Keyword | Priority Metric | Why |
|-------------------|-----------------|-----|
| "False alerts are costly," "wrongly catching is bad" | Precision | Must reduce false positives (FP) |
| "Never miss a case," "missing is critical" | Recall | Must reduce false negatives (FN) |
| "Balance both" | F1 Score | Harmonic mean of precision and recall |

> 💡 **Related Theory**: There's no single "right" answer between precision and recall. It's always the business or ethical question **"which error is more critical?"** that determines the choice. Spam filters typically prioritize precision, while cancer diagnosis and fraud detection prioritize recall.

### Overfitting vs Underfitting — Diagnosed by Scores

| Diagnosis | Training Score | Test Score | Treatment |
|-----------|-----------------|------------|-----------|
| Underfitting | Low | Low | More complex model, more training |
| Proper (Good Generalization) | High | High | That's good |
| Overfitting | Very high | Low (large gap) | More diverse data, simplify model |

> ⚠️ **Pitfall**: The most common mistake is looking only at training score and saying "99%! Excellent model." You must **see the gap between test and training scores together**. A large gap is an overfitting warning light.

### Data Drift vs Data Leakage

| Concept | When It Happens | Result |
|---------|-----------------|--------|
| Data Drift | After deployment, distribution changes over time | Performance degrades during operation → retraining needed |
| Data Leakage | Before training, test gets mixed into training | Evaluation score becomes unrealistically inflated |

These have similar names but opposite timing and outcomes. Drift is "the model becoming outdated during operation," leakage is "evaluation lying."

## Final Exam Checklist

> 🎯 **Scenario 1**: "We collected data, can we train the model right away?" → No. **Data preparation (cleaning, transforming, splitting)** is missing. This is the most time-consuming stage.

> 🎯 **Scenario 2**: "We built a model with 99.9% accuracy on data where fraud is 0.1%. Is it good?" → Can't say. **Accuracy is easy to fool on imbalanced data.** We must look at other metrics like recall.

> 🎯 **Scenario 3**: "We want to give AI full control of high-risk automated decisions." → Risky. We must use **Human-in-the-loop** so people review and approve critical decisions.

> 💡 **Related Theory**: This week's content naturally leads into next week (model types and AWS AI services). On top of today's "lifecycle, data, evaluation, and people" framework, next week we'll add "what types of AI/ML exist and what services does AWS provide?"

## Wrapping Up

Week 2 summarized in one sentence: **ML is a lifecycle flowing from data with circular structure, where data quality and splitting are the foundation for everything, models must be evaluated with appropriate metrics, and people drive all this through labeling, feedback, and review.** If you clearly grasp just these five points—the distinction between structured/unstructured, training·validation·test splitting, the difference between precision and recall, how to diagnose overfitting, and Human-in-the-loop—you've captured almost all the key points for this week's exam.

Next week we enter machine learning and deep learning, plus AWS's AI/ML service landscape. The foundation laid this week will be a solid platform.

---

## 📝 연습 문제

**문제 1.** ML 수명주기에 대한 설명으로 가장 정확한 것은?

A) Collection → Training → Deployment in one linear direction, then done  
B) Collection → Preparation → Training → Evaluation → Deployment → Monitoring, with circulation when performance degrades  
C) Deployment is the final step with no work after  
D) Data preparation stage can be skipped  

**정답: B**  
해설: The ML lifecycle goes through six stages: collection, preparation, training, evaluation, deployment, monitoring, and is circular—when performance degrades from drift, we return to the beginning. It's not one-way (A), deployment isn't the end (C), and data preparation is one of the most important stages and cannot be skipped (D).

---

**문제 2.** 다음 중 정밀도(Precision)를 우선해야 하는 상황으로 가장 적절한 것은?

A) Diagnosis model where we can't miss a single cancer patient  
B) Spam filter where wrongly classifying normal emails as spam is problematic  
C) Fraud detection system that must catch as much fraud as possible  
D) Missing person search system where we can't miss a single person  

**정답: B**  
해설: Wrongly flagging a normal email as spam is a false positive (FP), and precision focuses on reducing FP. Therefore, spam filters where false alarms are costly prioritize precision. The rest (cancer diagnosis, fraud detection, missing person search) are all "missing is critical" situations that prioritize recall to reduce false negatives.

---

**문제 3.** 학습 데이터 정확도는 98%로 매우 높지만 테스트 데이터 정확도는 64%로 크게 낮다. 이 현상과 그 진단으로 옳은 것은?

A) Underfitting — model is too simple  
B) Overfitting — model memorized training data and failed to generalize  
C) Evidence of no data leakage  
D) Means perfect class balance  

**정답: B**  
해설: A large gap where training score is very high but test score is much lower is a classic sign of overfitting—the model memorized training data and failed to generalize to unseen data. Underfitting would show low training scores too (A wrong), and C·D are statements unrelated to this symptom.

---

**문제 4.** 데이터 드리프트(Data Drift)와 데이터 누수(Data Leakage)를 구분한 설명으로 옳은 것은?

A) Both occur before training and are the same problem  
B) Drift is distribution change over time after deployment; leakage is test data mixing into training causing inflated evaluation scores  
C) Leakage is performance degradation during operation; drift is evaluation score inflation  
D) Both occur only at the model deployment stage  

**정답: B**  
해설: Data drift is an operational problem where data distribution changes after deployment, causing the model to become outdated. Data leakage is an evaluation problem where test data gets mixed into training, inflating evaluation scores unrealistically. They happen at opposite times with opposite results, so A·C·D are all wrong.

---

**문제 5.** 고위험 자동 의사결정 시스템에서 책임 있는 AI를 위해 권장되는 설계는?

A) Have AI handle all decisions independently and automatically  
B) Have people review and approve critical decisions through Human-in-the-loop  
C) Skip data labeling to speed things up  
D) Stop monitoring to reduce costs  

**정답: B**  
해설: For high-risk decisions, the danger of AI-only automation (inability to filter bias and errors) is large, so putting people in the loop (Human-in-the-loop) to review and approve critical decisions is a core safety mechanism of Responsible AI. Skipping labeling or stopping monitoring actually harms model quality and safety.

---
