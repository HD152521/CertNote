# Day 5 - Week 2 Wrap-Up: ML Lifecycle and Data at a Glance

## 📌 Key Takeaways

- ML is a cycle that runs through **collection → preparation → training → evaluation → deployment → monitoring**, and people and data turn that circle together.
- **Quality and separation** of data are the foundation. Insufficient representativeness leads to bias, and leaked test data (leakage) produces inflated scores.
- Choose metrics by **which mistake is more expensive**. If false alarms are expensive, precision; if misses are expensive, recall; for balance, F1. Never trust accuracy on imbalanced data.
- **Overfitting** shows up as a gap between training and test scores, **drift** as degradation over time after deployment, and **leakage** as unrealistically high evaluation scores.
- People step in through **labeling (before training) · feedback (while refining) · HITL review (during operation)**. The higher the risk of a decision, the more a person's final approval is required.

## Week 2 on One Page

This week we covered what you need to know even without coding a model yourself: the flow from a model's birth to its operation, and the principles of the data that supports that flow. Today we weave the four days together into one.

```
[ ML lifecycle — a circle that repeats (Day 1) ]

 Data collection → Data preparation → Training → Evaluation → Deployment → Monitoring
      ▲                                                                       │
      └──────── Back to the start when performance degrades ◄─────────────────┘

   ├─ Data (Day 2): structured/unstructured, train/validation/test split, quality
   ├─ Evaluation (Day 3): accuracy, precision, recall, overfitting/underfitting
   └─ People (Day 4): labeling, feedback (RLHF), Human-in-the-loop, iterative improvement
```

If you take away just one key message, it is this — **ML is not a straight line but a circle, and people and data turn that circle together.**

## Core Concepts Summary

| Topic | Key one-liner | Easily confused pitfall |
|------|-----------|-----------------|
| ML lifecycle (Day 1) | Collection→preparation→training→evaluation→deployment→monitoring, a cyclical structure | Forgetting the "preparation" step, thinking deployment is the end |
| Structured/unstructured (Day 2) | Structured = tables, unstructured = images, audio, text | Mistaking audio or images for structured |
| Data split (Day 2) | Train/validation/test; keep the test set hidden to the end | Data leakage (test data mixed into training) |
| Data quality (Day 2) | Insufficient representativeness → bias | Thinking that just adding more volume is enough |
| Accuracy (Day 3) | Proportion correct out of all | Being fooled by accuracy on imbalanced data |
| Precision (Day 3) | Real ones among what was caught; fears FP | Confusing it with recall |
| Recall (Day 3) | Caught ones among what's real; fears FN | Confusing it with precision |
| Overfitting (Day 3) | Memorized training data, weak on new data | Judging a model good by looking only at training accuracy |
| Underfitting (Day 3) | Too simple, fails even to learn | Confusing the direction with overfitting |
| Role of people (Day 4) | Labeling, feedback, HITL, iterative improvement | The misconception that "machines do everything" |

## Comparing Easily Confused Pairs

### Precision vs Recall — One More Time

These two are an easily confused pair on the exam. Tell them apart by situation keywords.

| Situation keyword | Priority metric | Reason |
|------------|----------|------|
| "wrong alerts are expensive," "wrongly catching is a problem" | Precision | Need to reduce False Positives (FP) |
| "must never miss," "a miss is critical" | Recall | Need to reduce False Negatives (FN) |
| "both in balance" | F1 score | Harmonic mean of precision and recall |

> 💡 **Related Theory**: There is no single right answer about which of precision and recall is correct. The choice is always decided by a business and ethical judgment of **"which mistake is more critical?"** Prioritizing precision for spam filters and recall for cancer diagnosis and fraud detection is typical.

### Overfitting vs Underfitting — Diagnosing by Scores

| Diagnosis | Training score | Test score | Remedy |
|------|----------|------------|------|
| Underfitting | Low | Low | A more complex model, more training |
| Proper (good generalization) | High | High | Fine as is |
| Overfitting | Very high | Low (large gap) | More and more diverse data, simplify the model |

> ⚠️ **Pitfall**: Looking only at the training score and judging "99%! An excellent model" is the classic mistake. You must always look at **the gap against the test score** as well. A large gap is the warning light for overfitting.

### Data Drift vs Data Leakage

| Concept | When it happens | Result |
|------|--------------|------|
| Data drift | After deployment, as the distribution changes over time | Performance degradation in operation → retraining needed |
| Data leakage | Before training, test data mixed into training | Evaluation scores become unrealistically inflated |

The two have similar names, but their timing and results are the exact opposite. Drift is "the problem of a model growing stale in operation," and leakage is "the problem of the evaluation lying."

## Final Check for the Exam

> 🎯 **Scenario 1**: "We've collected the data, so can we train the model right away?" → No. **Data preparation (cleaning, transformation, splitting)** was skipped. It is the step that takes the most time.

> 🎯 **Scenario 2**: "We built a model with 99.9% accuracy on data where fraudulent transactions are 0.1%. Is that good?" → We can't conclude so. **Accuracy is easy to be fooled by on imbalanced data.** We have to look at other metrics such as recall.

> 🎯 **Scenario 3**: "We want to leave a high-risk automated decision entirely to the AI." → Dangerous. **Human-in-the-loop** should be used so that people review and approve significant decisions.

## Reading the Lifecycle Backward: From Symptom to Stage

So far we followed the stages from the front. The exam and real work come the other way around — **the symptom is given first, and you must pinpoint which stage the problem belongs to.**

| Symptom | Stage to suspect | Real cause | Action |
|------|------------|----------|------|
| The evaluation score was very high, but it is a mess **right from** launch | Data preparation | Data leakage — the evaluation was false from the start | Redo the split, and remove features that can't be known at prediction time |
| It was good at launch but **gradually worsens over several months** | Monitoring | Data drift — the world changed | Collect the latest data and retrain |
| Only the training score is high and the test score drops sharply | Training | Overfitting | More and more diverse data, simplify the model |
| Even the training score is low | Training | Underfitting (or there are no usable features) | A more expressive model, better data |
| The overall score is good but it often errs only on a specific group | Data collection | Insufficient representativeness → bias | Supplement data for that group and measure metrics separately per group |
| Accuracy is high but it fails to catch the very thing we wanted to find | Evaluation | The wrong metric was chosen for imbalanced data | Re-evaluate with recall, precision, and F1 |
| Correct answers for the same kind of input were learned in a jumbled way | Data preparation (labeling) | Label errors | Review, and combine several people's answers to settle them |
| The model is accurate, but a wrong automated decision caused an incident | Deployment design | No human review for high-risk decisions | Add Human-in-the-loop |

- The clue that separates the first two rows is **time**. If "it never fit from the start," it is leakage; if "it gradually came to not fit," it is drift.
- The clue that separates the third and fourth rows is the **training score**. A high training score means overfitting; a training score that is low from the start means underfitting.

## Going Around Once with One Case

Let's follow an insurance company building a "model that screens out fraudulent claims." At each of the six stages, one concept from this week comes into play.

| Stage | What is done in this case | Concept involved |
|------|-------------------|------------|
| Collection | Collect 20,000 past claims. Claim form fields (structured) are mixed with accident scene photos and consultation recordings (unstructured) | Structured/unstructured, representativeness |
| Preparation | The investigation team marks each claim "fraudulent/normal." Remove duplicates and split into training, validation, and test sets. Drop fields such as "investigation completion date" that are created after the outcome is known | Labeling, splitting, leakage |
| Training | Train the model on the prepared data | Overfitting/underfitting |
| Evaluation | Calculate metrics on the held-out test data (below) | Accuracy, precision, recall |
| Deployment | Claims the model suspects as fraudulent are not automatically denied but handed to an investigator | Human-in-the-loop |
| Monitoring | When a new scheme appears, performance drops. Collect the cases the investigators corrected and retrain | Drift, iterative improvement |

**The numbers at the evaluation stage.** Among 20,000 claims, 200 (1%) are actually fraudulent. The model flagged 250 as fraudulent, and 150 of those were real.

| Actual \ Predicted | Predicted fraudulent | Predicted normal | Total |
|------------|------------|--------------|------|
| **Actually fraudulent** | TP 150 | FN 50 | 200 |
| **Actually normal** | FP 100 | TN 19,700 | 19,800 |

| Metric | This model | A model that only answers "everything is normal" |
|------|--------|-------------------------------|
| Accuracy | (150 + 19,700) ÷ 20,000 = 99.25% | 19,800 ÷ 20,000 = 99.0% |
| Recall | 150 ÷ 200 = 75% | 0 ÷ 200 = 0% |
| Precision | 150 ÷ 250 = 60% | Cannot be calculated (nothing was caught) |

- By accuracy, the two models differ by only 0.25 percentage points. By recall, it is 0% versus 75%. **Why accuracy is useless on imbalanced data** is in this single line.
- Precision of 60% means that 100 of the 250 caught claims are perfectly legitimate. That is why they are handed to **human review** rather than being automatically denied. It is a structure in which people filter out the false alarms of a model with low precision.
- If you judge that the cost of missing a fraudulent claim is high and set the threshold loosely, recall rises and precision falls. The investigators' review workload grows by that much. The choice of metric becomes **workforce planning**.

## Which AWS Tool Attaches to Each Stage

We lay the services named this week on top of the lifecycle. Details are covered in Weeks 4 and 5.

| Stage | Service/feature | What it does |
|------|------------|--------|
| Preparation (labeling) | Amazon SageMaker Ground Truth | Builds labeled datasets with a human workforce and automatic labeling |
| Preparation/evaluation (bias check) | Amazon SageMaker Clarify | Measures bias in pre-training data and the post-training model, and explains which features contributed to a prediction |
| Training/deployment | Amazon SageMaker AI (formerly Amazon SageMaker) | Trains models and serves them as inference endpoints |
| Human review in operation | Amazon Augmented AI (Amazon A2I) | Routes low-confidence predictions to human review |
| Monitoring | Amazon SageMaker Model Monitor | Watches a deployed model for data quality, model quality, bias drift, and feature attribution drift, and alerts when they deviate |

- AWS documentation currently states that Ground Truth, Clarify, A2I, and Model Monitor are not open to new customers and that only existing customers can continue to use them. For exam preparation, remember "**which stage's job each tool takes on**."
- **MLOps** is the approach of operating this cycle by **automating it into repeatable procedures** instead of having people turn it by hand every time. The exam guide lists concepts of MLOps such as experimentation, repeatable processes, scalable systems, model monitoring, and model retraining.

## Separating Confusing Pairs with One Question

| Pair | Question that separates them | If the answer is this |
|-----|-----------|------------|
| Drift vs leakage | When did the problem first appear? | Gradually → drift / From the start → leakage |
| Overfitting vs underfitting | Is the training score high? | High → overfitting / Low → underfitting |
| Precision vs recall | What is the denominator? | What the model caught → precision / What actually existed → recall |
| Validation vs test | Do you fix the model after looking at that score? | You fix it → validation / You only measure at the end → test |
| Representativeness vs balance | What is lacking? | Some real-world group is missing → representativeness / One side of the category being predicted is too small → balance |
| Labeling vs HITL review | What are people handling? | Data to learn from → labeling / Predictions the model produced → HITL review |
| Model metrics vs business metrics | Whose question does it answer? | "Does it get things right?" → model metrics / "Is it profitable?" → business metrics |

Next week we move into generative AI basics. We'll cover what a foundation model is, how LLMs work, and how to write prompts.

## 📖 Glossary

- **ML lifecycle**: One full turn of the repeating sequence collection → preparation → training → evaluation → deployment → monitoring.
- **Data drift**: The phenomenon in which, as time passes after deployment, the character of real data changes and the model gradually stops fitting.
- **Data leakage**: An incident in which information that cannot be known in real use (test data, or values created after the outcome) flows into training and inflates the evaluation score.
- **Representativeness**: The degree to which data covers the various groups and cases of reality evenly. Bias arises when it is lacking.
- **Precision / Recall**: The proportion of real ones among what the model caught / the proportion caught among what actually existed.
- **Threshold**: The line a person sets for what score the model must reach before judging "positive." Moving it trades precision against recall.
- **Human-in-the-loop (HITL)**: A design that inserts human review into important decisions or cases the model is unsure about.
- **Active learning**: A way of reducing labeling cost by handling what the model is confident about automatically and asking people only about what is confusing.
- **MLOps**: An approach to operating the ML lifecycle as repeatable, automated procedures. It includes monitoring and retraining.
- **Business metrics**: Yardsticks such as cost per user, ROI, and customer feedback that measure whether a model is profitable for the business.

## 📝 Practice Questions

**Question 1.** Which statement about the ML lifecycle is most accurate?

A) Collection → Training → Deployment in one linear direction, then done  
B) Collection → Preparation → Training → Evaluation → Deployment → Monitoring, with circulation when performance degrades  
C) Deployment is the final step with no work after  
D) Data preparation stage can be skipped  

**Answer: B**  
Explanation: The ML lifecycle goes through six stages: collection, preparation, training, evaluation, deployment, monitoring, and is circular—when performance degrades from drift, we return to the beginning. It's not one-way (A), deployment isn't the end (C), and data preparation is one of the most important stages and cannot be skipped (D).

---

**Question 2.** Which of the following is the most appropriate situation in which precision should be prioritized?

A) Diagnosis model where we can't miss a single cancer patient  
B) Spam filter where wrongly classifying normal emails as spam is problematic  
C) Fraud detection system that must catch as much fraud as possible  
D) Missing person search system where we can't miss a single person  

**Answer: B**  
Explanation: Wrongly flagging a normal email as spam is a false positive (FP), and precision focuses on reducing FP. Therefore, spam filters where false alarms are costly prioritize precision. The rest (cancer diagnosis, fraud detection, missing person search) are all "missing is critical" situations that prioritize recall to reduce false negatives.

---

**Question 3.** Training data accuracy is very high at 98%, but test data accuracy is much lower at 64%. Which option correctly states this phenomenon and its diagnosis?

A) Underfitting — model is too simple  
B) Overfitting — model memorized training data and failed to generalize  
C) Evidence of no data leakage  
D) Means perfect class balance  

**Answer: B**  
Explanation: A large gap where training score is very high but test score is much lower is a classic sign of overfitting—the model memorized training data and failed to generalize to unseen data. Underfitting would show low training scores too (A wrong), and C·D are statements unrelated to this symptom.

---

**Question 4.** Which statement correctly distinguishes data drift from data leakage?

A) Both occur before training and are the same problem  
B) Drift is distribution change over time after deployment; leakage is test data mixing into training causing inflated evaluation scores  
C) Leakage is performance degradation during operation; drift is evaluation score inflation  
D) Both occur only at the model deployment stage  

**Answer: B**  
Explanation: Data drift is an operational problem where data distribution changes after deployment, causing the model to become outdated. Data leakage is an evaluation problem where test data gets mixed into training, inflating evaluation scores unrealistically. They happen at opposite times with opposite results, so A·C·D are all wrong.

---

**Question 5.** What design is recommended for responsible AI in a high-stakes automated decision-making system?

A) Have AI handle all decisions independently and automatically  
B) Have people review and approve critical decisions through Human-in-the-loop  
C) Skip data labeling to speed things up  
D) Stop monitoring to reduce costs  

**Answer: B**  
Explanation: For high-risk decisions, the danger of AI-only automation (inability to filter bias and errors) is large, so putting people in the loop (Human-in-the-loop) to review and approve critical decisions is a core safety mechanism of Responsible AI. Skipping labeling or stopping monitoring actually harms model quality and safety.

---
