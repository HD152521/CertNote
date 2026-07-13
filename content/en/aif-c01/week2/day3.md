# Day 3 - Model Evaluation Basics: Accuracy, Precision, Recall, and Overfitting/Underfitting

If we've built a model, the next question is simple—**"Does this model really perform well?"** Yesterday we saw the pitfall where simple accuracy on imbalanced data misleads us about a model's quality. Today, moving beyond that pitfall, we'll learn three basic evaluation metrics (accuracy, precision, recall) as easily as possible, and address two typical symptoms of wrong learning (overfitting and underfitting).

AIF-C01 doesn't expect you to memorize complex formulas for these metrics. Instead, it asks for intuition about "what does precision care about, and what does recall care about?"

## Four Categories of Classification Results

To understand the metrics, we first need to know that a classifier's answers fall into four types. For example, think of a model that judges "Is this email spam?"

| Actual \ Predicted | Predicted Spam | Predicted Not Spam |
|-------------------|-----------------|-------------------|
| **Actually Spam** | True Positive (TP) ✅ Correctly caught | False Negative (FN) ❌ Missed |
| **Actually Normal** | False Positive (FP) ❌ Wrongly caught | True Negative (TN) ✅ Correctly passed |

The key is the two types of errors. **False Positive (FP)** is mistakenly catching something fine (normal email as spam), and **False Negative (FN)** is missing something that should be caught (spam passing as normal). Which error is more critical depends on the situation.

> 💡 **Related Theory**: This 2×2 table is called a **Confusion Matrix**. Accuracy, precision, and recall are all calculated from the numbers in these four cells. You don't need to memorize the table, but sensing the difference between "wrongly catching (FP)" and "missing (FN)" is core to both the exam and practical work.

## Three Metrics, Explained Simply

### Accuracy — The Proportion of Correct Classifications Out of All

The most intuitive metric. **"How many out of all judgments did we get right?"** If we correctly classified 90 out of 100, accuracy is 90%. It's simple and easy to understand, but as we saw yesterday, **it's easy to be misled by imbalanced data**.

### Precision — "The Real Proportion Among What We Caught"

Precision asks **"Among things the model flagged as spam, what proportion are actually spam?"** Low precision means lots of legitimate emails are wrongly flagged as spam (FP).

> 📚 **Example**: In spam filters, precision matters. If an important work email gets wrongly classified as spam (FP), it's a disaster. The precision-centric thinking is "if we caught it, it must really be spam."

### Recall — "The Proportion We Caught Out of What's Real"

Recall asks **"Out of all real spam emails, how many did the model actually catch?"** Low recall means lots of real spam gets missed (FN).

> 📚 **Example**: In cancer diagnosis models, recall is critical. Missing a real cancer patient (FN) is life-threatening. Suspecting a healthy person and sending them for extra tests (FP) is far less critical. The recall-centric thinking is "we must never miss a real case."

### Precision vs Recall — A Trade-off Relationship

| Metric | One-Line Definition | What We Fear | When It Matters |
|--------|---------------------|--------------|-----------------|
| Precision | Real proportion among what we caught | False alarms (FP) | Spam filters, when wrong alerts are costly |
| Recall | Proportion we caught out of what's real | Missing cases (FN) | Cancer diagnosis, fraud detection, when missing is critical |

These two usually have a **trade-off relationship**. If we flag everything as spam, recall hits 100% (we miss nothing) but precision bottoms out (we also catch legitimate stuff). The opposite is true too. That's why to see the balance between them as one number, we sometimes use the **F1 Score**, a harmonic mean.

> 💡 **Related Theory**: The F1 score is the harmonic mean of precision and recall, summarizing the balance between them as one value. For the exam, it's enough to know "F1 is the metric that considers both precision and recall together." Which metric to prioritize is always determined by the business question: **"which error is more critical?"**

## Overfitting and Underfitting — Two Directions Learning Goes Wrong

A good model applies patterns learned from training data **well to unseen data too**. This ability is called generalization. Generalization breaks in two directions: overfitting and underfitting.

| Symptom | What Happened | Analogy |
|---------|---------------|---------|
| Underfitting | Failed to learn the pattern even from training data | Didn't study enough and got all test questions wrong |
| Overfitting | Memorized training data entirely | Memorized the answer key; weak on new questions |

**Underfitting** occurs when the model is too simple or training is insufficient to even capture the data's patterns. Performance is poor on both training and test data.

**Overfitting** is the opposite—the model memorized training data too thoroughly (even noise). It performs near-perfectly on training data, but **performance plummets on unseen test data**. This is the most common and dangerous pitfall.

```
[ Analogy of drawing a line through data ]

Underfitting       Proper (Good Generalization)    Overfitting
  ─────            ～～～～                      ∿∿∿∿∿∿
One straight line  Smooth curve follows            Forcing a line through
passes roughly      the trend well               every single point
(too simple)        (just right)                  (memorizing noise)
```

> 💡 **Related Theory**: The easiest signal to diagnose overfitting is a **large gap: "high training score but low test score."** Conversely, with underfitting both training and test scores are low. Ways to reduce overfitting include obtaining more data, simplifying the model, and regularization. At exam level, remembering "more diverse data helps" is enough.

> 🎯 **Scenario**: "A model has 99% accuracy on training data but 62% on test data. What happened?" → The large gap between training and test scores indicates overfitting. The model memorized the data but failed to generalize.

## Wrapping Up

Today's core points fall into two bundles. First, evaluation metrics are **accuracy (proportion correct out of all), precision (real proportion among what we caught, fears FP), and recall (proportion we caught out of what's real, fears FN)**. Which to prioritize is determined by "which error is more critical?" (spam→precision, cancer diagnosis→recall). Second, learning goes wrong in two directions: **underfitting (too simple, even fails to learn) and overfitting (memorizes entirely, weak on new data)**, and overfitting is diagnosed by a large gap between training and test scores.

Tomorrow we cover the role humans play in all this—data labeling, feedback, and iterative improvement. ML never runs without people.

---

## 📝 연습 문제

**문제 1.** 정상 메일을 스팸으로 잘못 분류하는 실수를 줄이는 것이 가장 중요한 스팸 필터에서, 우선적으로 높여야 할 지표는?

A) Recall  
B) Precision  
C) Training data accuracy  
D) Model training speed  

**정답: B**  
해설: Wrongly flagging normal emails as spam is a false positive (FP), and precision focuses on "real proportion among what we caught" to reduce FP. Therefore, spam filters where false alarms are costly prioritize precision. Recall is a metric for reducing missed cases (FN) and has different priorities. Training accuracy and speed are unrelated to this goal.

---

**문제 2.** 암 진단 모델에서 실제 암 환자를 놓치는 것이 가장 치명적이다. 우선적으로 높여야 할 지표는?

A) Precision  
B) Recall  
C) Training speed  
D) Data storage efficiency  

**정답: B**  
해설: Missing a real cancer patient is a false negative (FN), and recall focuses on "proportion we caught out of what's real" to reduce FN. In a life-or-death situation, missing a patient (FN) is far more critical than sending a healthy person for extra tests (FP), so recall takes priority. Precision has a different focus on reducing false alarms.

---

**문제 3.** 어떤 모델이 학습 데이터에서는 정확도 99%를 보이지만 처음 보는 테스트 데이터에서는 60%로 크게 떨어졌다. 이 모델의 문제는?

A) Underfitting  
B) Overfitting  
C) No data leakage at all  
D) Perfect class balance  

**정답: B**  
해설: A large gap where training score is very high but test score is much lower is a classic sign of overfitting. The model memorized the training data and failed to generalize. Underfitting would show low training scores too. C and D are unrelated statements to this symptom.

---

**문제 4.** 정밀도와 재현율을 하나의 값으로 균형 있게 요약하는 지표는?

A) Accuracy  
B) F1 Score  
C) Learning Rate  
D) Data leakage rate  

**정답: B**  
해설: F1 score is the harmonic mean of precision and recall, expressing the balance between the two metrics as one number. Accuracy is the proportion of correct classifications overall and doesn't reflect the balance between them. Learning rate is a training hyperparameter, and data leakage rate is not an evaluation metric.

---

**문제 5.** 모델이 너무 단순해 학습 데이터에서도, 테스트 데이터에서도 성능이 모두 낮은 상태를 무엇이라 하는가?

A) Overfitting  
B) Underfitting  
C) Data Drift  
D) High Recall  

**정답: B**  
해설: Poor performance on both training and test data indicates underfitting—the model failed to learn even the training data's patterns. Overfitting is the opposite symptom: high training score but low test score. Data drift is distribution change during operation, and high recall is unrelated to performance degradation.

---
