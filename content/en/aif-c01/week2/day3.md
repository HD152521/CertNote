# Day 3 - Model Evaluation Basics: Accuracy, Precision, Recall, and Overfitting/Underfitting

## 📌 Key Takeaways

- A classifier's answers fall into four cells (**TP/FP/FN/TN**). There are two kinds of mistakes: **false alarms (FP)** and **misses (FN)**.
- **Accuracy** = the proportion of all judgments that were correct. It is easy to be fooled by it on imbalanced data.
- **Precision** = the proportion of real cases among what was caught (fears FP) / **Recall** = the proportion of real cases that were caught (fears FN).
- Which metric to prioritize is decided by **"which mistake is more critical?"** Spam filter → precision, cancer diagnosis → recall.
- **Underfitting** means both training and test scores are low; **overfitting** means only the training score is high and the test score drops sharply (diagnosed by the gap).

## Four Categories of Classification Results

AIF-C01 doesn't ask you to memorize complex formulas. It asks for the intuition of **"what does precision care about, and what does recall care about?"** For example, think of a model that judges "Is this email spam?"

| Actual \ Predicted | Predicted spam | Predicted normal |
|------------|--------------|--------------|
| **Actually spam** | True Positive (TP) ✅ Correctly caught | False Negative (FN) ❌ Missed |
| **Actually normal** | False Positive (FP) ❌ Wrongly caught | True Negative (TN) ✅ Correctly passed |

- **False Positive (FP)**: Mistakenly catching something that is fine (a normal email flagged as spam).
- **False Negative (FN)**: Missing something that should have been caught (spam passing through as normal).
- Which mistake is more critical **differs from situation to situation**.

This 2×2 table is called a **Confusion Matrix**. Accuracy, precision, and recall are all calculated from the numbers in these four cells. You don't need to memorize the table, but a feel for the difference between "wrongly catching (FP)" and "missing (FN)" matters on the exam and in practice alike.

## Three Metrics, Explained Simply

### Accuracy — The Proportion Correct Out of All

- **"How many out of all judgments did we get right?"** If 90 out of 100 were classified correctly, accuracy is 90%.
- It is simple and easy to understand, but **it is easy to be fooled by it on imbalanced data**.

### Precision — "The Real Proportion Among What We Caught"

- **"Among the emails the model flagged as spam, how many are actually spam?"**
- Low precision = many legitimate emails are wrongly flagged as spam (**FP**).

> 📚 **Example**: Precision matters in a spam filter. If an important work email is wrongly classified as spam (FP), it is a big problem. The precision-centric way of thinking is "if we caught it, it must definitely be spam."

### Recall — "The Proportion We Caught Out of What's Real"

- **"Out of all the actual spam, how much did the model catch?"**
- Low recall = many real spam emails are missed (**FN**).

> 📚 **Example**: Recall is decisive in a cancer diagnosis model. Missing a patient who really has cancer (FN) is life-threatening. Suspecting a healthy person and sending them for additional tests (FP) is far less critical. The recall-centric way of thinking is "we must never miss a real case."

### Precision vs Recall — A Tug-of-War Relationship

| Metric | One-line definition | What it fears | When it matters |
|------|-----------|------------------|------------|
| Precision | Real proportion among what we caught | False alarms (FP) | Spam filters, cases where wrong alerts are costly |
| Recall | Proportion we caught out of what's real | Misses (FN) | Cancer diagnosis, fraud detection, cases where a miss is critical |

- The two usually have a **tug-of-war relationship**.
- If you flag everything as spam → recall is 100% (nothing is missed) while precision hits rock bottom (perfectly fine emails are caught too). The opposite holds as well.
- That is why the **F1 Score**, a harmonic mean, is sometimes used to see the balance between the two as a single number.

The F1 score is the harmonic mean of precision and recall, summarizing the balance between them in one value. For the exam, it is enough to know that "the metric that considers precision and recall together is F1." Which metric to prioritize is decided by the business question: **"which mistake is more critical?"**

## Working Through the Numbers

Suppose 1,000 emails (100 actual spam, 900 normal) are fed into a spam filter. It flags 90 emails as spam, and 80 of them are real spam.

| Actual \ Predicted | Predicted spam | Predicted normal | Total |
|------------|--------------|--------------|------|
| **Actually spam** | TP 80 | FN 20 | 100 |
| **Actually normal** | FP 10 | TN 890 | 900 |
| Total | 90 | 910 | 1,000 |

| Metric | How to read it | Calculation | Value |
|------|---------|------|-----|
| Accuracy | Correct ones out of all | (80 + 890) ÷ 1,000 | 97.0% |
| Precision | Look at the **predicted column**: real spam among the 90 caught | 80 ÷ 90 | about 88.9% |
| Recall | Look at the **actual row**: caught ones among the 100 real spam | 80 ÷ 100 | 80.0% |
| F1 score | Harmonic mean of precision and recall | 2 × 80 ÷ (2 × 80 + 10 + 20) | about 84.2% |

- A tip for remembering: the denominator of precision is **what the model caught** (TP + FP), and the denominator of recall is **what actually existed** (TP + FN). The numerator is TP for both.
- Accuracy of 97% alone looks excellent, but one out of every five spam emails still lands in the inbox (recall 80%). Each metric shows a different side.

### What Happens When You Move the Threshold

A model usually outputs a score such as "X% likelihood of being spam," and a person decides **from what percentage upward to flag something as spam**. With the same model and the same 1,000 emails, we recalculate by changing only this threshold.

| Threshold | Number flagged as spam | TP | FP | FN | Precision | Recall |
|--------|-----------------|-----|-----|-----|--------|--------|
| Strict (flag only when sure) | 60 | 58 | 2 | 42 | about 96.7% | 58.0% |
| Middle | 90 | 80 | 10 | 20 | about 88.9% | 80.0% |
| Loose (flag on the slightest suspicion) | 200 | 95 | 105 | 5 | 47.5% | 95.0% |

- With a strict threshold, false alarms (FP) drop to 2 emails but 42 spam emails are missed. With a loose threshold, only 5 are missed but 105 normal emails go into the spam folder.
- This is the reality of the tug-of-war. Without changing the model, **a single threshold lets you trade precision for recall**, and where to set it is decided by "which mistake is more expensive?"

### Looking at Imbalanced Data Again

Take yesterday's fraud detection example (10 fraud cases among 10,000 transactions). Put a model that answers "everything is normal" into the four cells: TP 0, FP 0, FN 10, TN 9,990.

- Accuracy = 9,990 ÷ 10,000 = **99.9%**
- Recall = 0 ÷ 10 = **0%** — the fact that it caught not a single fraud case is revealed immediately.
- Precision has a denominator (what was caught) of 0, so there is not even a value to calculate.

The advice that for problems of finding rare targets you should look at recall, precision, and F1 instead of accuracy comes from this calculation.

## Choosing a Metric by Scenario

First decide **what the "positive" is**. Positive does not mean good; it means **the target the model is trying to find**. In cancer diagnosis, "has cancer" is the positive.

| Scenario | More expensive mistake | Priority metric |
|----------|-------------|----------|
| A spam filter where important work email must not land in the spam folder | False alarm (FP) | Precision |
| A disease screening test where patients must not be missed | Miss (FN) | Recall |
| A detection system that must catch fraudulent transactions as completely as possible | Miss (FN) | Recall |
| Security screening where dangerous items must not get through | Miss (FN) | Recall |
| A video classifier that attaches a "safe for children" label | False alarm (FP) — a harmful video labeled safe | Precision |
| Selecting recipients of a high-value coupon that costs a lot for every one sent | False alarm (FP) — sending to people who won't respond | Precision |
| Positive cases are rare and both mistakes are burdensome | Both | F1 score |
| The two categories have similar proportions and the cost of mistakes is similar | No distinction | Accuracy is enough |

- Words to look for in the question: "**must not miss, without exception**" → recall. "**wrongly catching is a problem, only the certain ones**" → precision. "**balance**" → F1.

## Model Metrics and Business Metrics Are Different

The exam guide divides the yardsticks for evaluating a model into two groups.

| Group | Examples | Question it answers |
|------|-----|---------------|
| Model performance metrics | Accuracy, precision, recall, F1 score | "How well does the model get things right?" |
| Business metrics | Cost per user, development cost, customer feedback, return on investment (ROI) | "So is it profitable for the business?" |

- If a new model whose recall rose by 3 percentage points doubles operating costs, it is an improvement by the model metrics but may be a step backward by the business metrics.
- Conversely, if the model metrics stay the same but responses become faster and customer complaints decrease, it is an improvement by the business metrics. **Only by looking at both groups together** can you decide whether to deploy.
- For reference, today's metrics are all for **classification**. Regression, which predicts numbers such as price or demand, is evaluated not by "right or wrong" but by **how far the predicted value deviates from the actual value**.

## Correcting Common Misconceptions

- **"High accuracy means a good model"** → When the data is skewed to one side, even a model that catches nothing has high accuracy.
- **"Just make both precision and recall 100%"** → When you move the threshold, one goes up while the other goes down. To raise both together, the model or the data itself has to get better.
- **"100% recall means a perfect model"** → If you answer that everything is positive, recall is 100%. It is meaningless unless you look at precision too.
- **"F1 score is another name for accuracy"** → F1 does not include TN (correctly passed items) in its calculation. That is why it is more honest than accuracy in problems where the target is rare.
- **"Precision and accuracy are the same thing"** → For accuracy the denominator is all judgments; for precision the denominator is only what the model caught.

## Overfitting and Underfitting — Two Directions Learning Goes Wrong

A good model applies the patterns learned from training data **well to unseen data too**. This ability is generalization.

| Symptom | What happened | Analogy |
|------|------------------|------|
| Underfitting | Failed to learn properly even from the training data | Didn't study enough and got every test question wrong |
| Overfitting | Memorized the training data wholesale | Memorized the answer key; weak on new questions |

- **Underfitting**: The model is too simple or training is insufficient, so it fails even to capture the patterns → performance is **poor on both training and test data**.
- **Overfitting**: The model memorized the training data too closely (noise included) → it is nearly perfect on training data but **drops sharply on test data**. This is a dangerous pitfall.

```
[ Analogy of drawing a line through data ]

Underfitting      Proper (good generalization)   Overfitting
  ─────            ～～～～                ∿∿∿∿∿∿
One straight      Smooth curve that         Forcing the line through
line passes       follows the trend         every single point
roughly           well                      (memorizing noise)
(too simple)      (just right)
```

The easiest signal for diagnosing overfitting is a large gap: **"a very high training score but a low test score."** Conversely, with underfitting both the training score and the test score are low. Ways to reduce overfitting include obtaining more data, simplifying the model, and regularization; at exam level, remembering that "more and more diverse data helps" is enough.

> 🎯 **Scenario**: "A model has 99% accuracy on training data and 62% accuracy on test data. What happened?" → The gap between the training and test scores is large, so it is overfitting. It is a sign that the model merely memorized the training data and failed to generalize.

Tomorrow we cover the human role in all of this — data labeling, feedback, and iterative improvement. ML never runs without people.

## 📖 Glossary

- **Confusion matrix**: A 2×2 table that sorts a model's answers into four cells: "correctly caught / false alarm / miss / correctly passed."
- **True Positive (TP)**: A case where something that is truly positive was also correctly flagged as positive by the model.
- **False Positive (FP)**: A case where something that is not positive was wrongly flagged as positive. A "false alarm."
- **False Negative (FN)**: A case where something that is positive was let through as negative. A "miss."
- **Accuracy**: The proportion of all judgments that were correct. Hard to trust when one side of the data is overwhelmingly larger.
- **Precision**: Among what the model flagged as positive, the proportion that was actually positive. Look at it when false alarms are unwelcome.
- **Recall**: Among what is actually positive, the proportion the model caught. Look at it when misses are unacceptable.
- **F1 score**: A value that summarizes precision and recall as one balanced number (harmonic mean).
- **Generalization**: The ability to apply learned patterns well to new data never seen during training.
- **Overfitting/Underfitting**: A state of memorizing the training data wholesale and being weak on new data / a state of not having learned properly at all.

## 📝 Practice Questions

**Question 1.** For a spam filter where it is most important to reduce mistakes that misclassify legitimate email as spam, which metric should be raised first?

A) Recall  
B) Precision  
C) Training data accuracy  
D) Model training speed  

**Answer: B**  
Explanation: Wrongly flagging normal emails as spam is a false positive (FP), and precision focuses on "real proportion among what we caught" to reduce FP. Therefore, spam filters where false alarms are costly prioritize precision. Recall is a metric for reducing missed cases (FN) and has different priorities. Training accuracy and speed are unrelated to this goal.

---

**Question 2.** In a cancer diagnosis model, missing an actual cancer patient is the most critical failure. Which metric should be raised first?

A) Precision  
B) Recall  
C) Training speed  
D) Data storage efficiency  

**Answer: B**  
Explanation: Missing a real cancer patient is a false negative (FN), and recall focuses on "proportion we caught out of what's real" to reduce FN. In a life-or-death situation, missing a patient (FN) is far more critical than sending a healthy person for extra tests (FP), so recall takes priority. Precision has a different focus on reducing false alarms.

---

**Question 3.** A model shows 99% accuracy on the training data, but its accuracy drops sharply to 60% on unseen test data. What is the problem with this model?

A) Underfitting  
B) Overfitting  
C) No data leakage at all  
D) Perfect class balance  

**Answer: B**  
Explanation: A large gap where training score is very high but test score is much lower is a classic sign of overfitting. The model memorized the training data and failed to generalize. Underfitting would show low training scores too. C and D are unrelated statements to this symptom.

---

**Question 4.** Which metric summarizes precision and recall into a single balanced value?

A) Accuracy  
B) F1 Score  
C) Learning Rate  
D) Data leakage rate  

**Answer: B**  
Explanation: F1 score is the harmonic mean of precision and recall, expressing the balance between the two metrics as one number. Accuracy is the proportion of correct classifications overall and doesn't reflect the balance between them. Learning rate is a training hyperparameter, and data leakage rate is not an evaluation metric.

---

**Question 5.** What is it called when a model is too simple and performs poorly on both the training data and the test data?

A) Overfitting  
B) Underfitting  
C) Data Drift  
D) High Recall  

**Answer: B**  
Explanation: Poor performance on both training and test data indicates underfitting—the model failed to learn even the training data's patterns. Overfitting is the opposite symptom: high training score but low test score. Data drift is distribution change during operation, and high recall is unrelated to performance degradation.

---
