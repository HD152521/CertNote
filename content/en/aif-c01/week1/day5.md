# Day 5 - Week 1 Review: AI/ML Fundamentals

## 📌 Key Takeaways

- **Day 1**: AI ⊃ machine learning ⊃ deep learning. All deep learning is ML, but not all AI is ML.
- **Day 2**: Learning types split by whether answers exist and whether rewards exist into supervised (classification/regression), unsupervised (clustering/dimensionality reduction), and reinforcement.
- **Day 3**: Traditional programming is `data + rules → results`, and ML is `data + results → rules`. ML fits when the rules are complex and there is enough data.
- **Day 4**: You train on features + labels to build a model, predict through inference, and check for overfitting with test data.
- Traps that are easy to confuse on the exam: classification vs. regression (category/number), classification vs. clustering (whether labels exist), and overfitting (= memorization, not a lack of learning).

## This Week's Flow

Review is not memorization but a time to redraw **how the concepts connect**.

```
[Day1] The AI > ML > DL relationship
   ↓
[Day2] Learning types in ML (supervised, unsupervised, reinforcement)
   ↓
[Day3] Problems where ML fits vs. problems where it doesn't
   ↓
[Day4] Key terms (model, training, inference, feature, label, overfitting)
```

## Day 1 Review: The Relationship Among AI, ML, and DL

- **AI ⊃ machine learning ⊃ deep learning**
- **AI**: any technology that imitates intelligent behavior (including rule-based)
- **Machine learning**: a method of learning rules from data
- **Deep learning**: a type of machine learning that stacks neural networks deeply
- A system where a person wrote the rules directly may be AI, but it is not machine learning.

## Day 2 Review: Learning Types

| Learning type | Answer (label) | Representative tasks |
|-----------|-------------|----------|
| Supervised learning | Present | Classification (category), regression (number) |
| Unsupervised learning | Absent | Clustering, dimensionality reduction |
| Reinforcement learning | Replaced by a reward | Games, robots, control |

Let us sort out the two pairs that are often confused once more.

- **Classification vs. regression**: if the output is a category, it is classification; if a number, regression.
- **Classification vs. clustering**: if there are answer labels, it is classification; if not, clustering.

## Day 3 Review: Problems Where ML Fits

- **Traditional programming**: `data + rules → results`
- **Machine learning**: `data + results → rules`

| ML is a good fit | ML is a poor fit |
|----------------|------------------|
| The rules are complex or hard to define | The rules are simple and clear |
| There is enough data | There is almost no data |
| A small margin of error is acceptable | 100% accuracy and a complete explanation are mandatory |

- Choosing the simplest method that is still sufficient is good design.

## Day 4 Review: Key Terms

```
Features + labels [training data]
   ↓ Training
[Model] completed
   ↓ Inference
New input (features) → predicted label
   ↓
Evaluate with [test data] → check for overfitting/underfitting
```

- **Model**: a bundle of learned rules
- **Training vs. inference**: the process of building a model vs. the process of predicting with the built model
- **Feature vs. label**: the input information vs. the correct answer to predict
- **Overfitting vs. underfitting**: a state of having memorized only the training data vs. a state of insufficient learning

This week's content is the foundation of the "AI/ML fundamentals" domain of the AIF-C01 exam. Only if you understand this flow clearly can you follow later advanced topics such as generative AI and AWS AI services without strain.

## Summary of Frequently Missed Traps

| Trap | Correct understanding |
|------|------------|
| "Deep learning is the biggest concept" | AI is the biggest. Deep learning is the smallest |
| "Classification and regression are the same" | Classification = category, regression = number |
| "Classification and clustering are the same" | They differ in whether answer labels exist |
| "Machine learning is always better" | For simple problems, the traditional approach is better |
| "It's fine to evaluate with the training data" | You must evaluate with test data to be honest |
| "Overfitting = insufficient training" | Overfitting is rather a state of having memorized too much |

## The Order for Reading a Question: Ask Four Times and the Answer Is Left

The four days of content scatter if memorized separately, but when strung together in the **order of questions**, they become a single procedure for telling cases apart.

```
① Who created the rules?
   ├─ A person wrote the conditions directly ────► Rule-based (may be AI, but not ML)
   └─ Learned from data ─────────────────────────► Machine learning (go to ②)
                                                    └ If many layers of neural networks, deep learning

② What did it learn from?
   ├─ Data with answers (labels) attached ───────► Supervised learning (go to ③)
   ├─ Data without answers ──────────────────────► Unsupervised learning (clustering, dimensionality reduction, anomaly detection)
   └─ Rewards received as a result of actions ───► Reinforcement learning

③ What shape is the answer to be predicted?
   ├─ One of a fixed set of kinds ───────────────► Classification
   └─ A number whose magnitude has meaning ──────► Regression

④ When performance comes up, look at the two scores
   ├─ Training is low and test is low ───────────► Underfitting
   ├─ Only training is high and test drops sharply ► Overfitting
   └─ Both are high and the gap is small ────────► Generalizes well
```

- There is one more question that comes before ①: **"Is ML needed in the first place?"** (Day 3). If the rule is one line, a fixed outcome is needed, or there is no data, there is no reason to enter ①.
- Do not mix up ② and ③. If you pick classification just from seeing "divide into groups," you will be wrong. You must first check in ② whether labels exist to separate classification from clustering.

## Tying Four Days Together with One Case

An online bookstore says, "We want to find out in advance which orders will be returned." This one sentence touches everything from this week.

| Step | What happens at the bookstore | Concept involved |
|------|---------------------|------------|
| Judging necessity | A policy like "no returns under 30,000 KRW" is fine as code. But "which orders will be returned" cannot be written as rules, and there are hundreds of thousands of past order records | Day 3: conditions where ML fits |
| Technology level | It is tabular data such as order amount, delivery region, and purchase history. Deep learning is not necessarily needed | Day 1: distinguishing ML from deep learning |
| Learning type | Each past order has a "returned / not returned" record → supervised learning, and the answer is two categories → classification | Day 2: whether labels exist, category/number |
| Data composition | Order amount, region, and history are the features, and whether it was returned is the label | Day 4: features and labels |
| Building the model | Train on part of the records and score on the test data set aside. If training is 98% and test is 71%, it is overfitting | Day 4: data splitting, overfitting |
| Service | To learn the return likelihood immediately whenever an order comes in, use real-time inference; to check the day's orders in bulk every night, use batch inference | Day 4: training and inference, inference methods |

- Change the question slightly and the answer changes. "How much will the return **amount** be" → regression. "Let's split customers into types without return records" → clustering. "Let's learn which coupon to show for each order by watching the response" → reinforcement learning.

## Comprehensive Identification Table

| Scenario | Answer | Where it was learned |
|----------|-----|--------------|
| A comment-blocking feature where an administrator typed in a list of banned words | Rule-based. Not machine learning | Day 1 |
| A diagnostic aid trained on tens of thousands of X-ray images and their reading results | Deep learning, supervised learning (classification) | Day 1, 2 |
| Enter a sentence and it writes a draft of ad copy | Generative AI | Day 1 |
| Predicting parcel volume as a number by region | Supervised learning (regression) | Day 2 |
| Finding unusual access in access logs with no labels | Unsupervised learning (anomaly detection) | Day 2 |
| A game character learns on its own the moves that raise its score | Reinforcement learning | Day 2 |
| Calculating 10% VAT | Traditional programming | Day 3 |
| A screening score whose basis must be explained to a regulator | Explainable traditional ML (or rules) | Day 3 |
| Preparing a recommendation list for all members every dawn in advance | Batch inference | Day 4 |
| Training 60% / test 58% | Underfitting (high bias) | Day 4 |

## Commonly Confused Pairs, Told Apart by the Words in the Question

| Pair | Words pointing to the first | Words pointing to the second |
|-----|------------------------|------------------------|
| Rule-based vs. machine learning | "define conditions," "if-then" | "learn from past data," "patterns" |
| Machine learning vs. deep learning | "tabular data," "features chosen by people" | "many layers of neural networks," "raw images and audio" |
| Classification vs. regression | "whether," "kind," "grade" | "how much," "how many," "how many degrees" |
| Classification vs. clustering | "labeled," "with past outcomes" | "without labels," "similar ones together" |
| Training vs. inference | "build the model," "takes a long time" | "new input," "prediction," "response time" |
| Algorithm vs. model | "learning method," "procedure" | "learned product," "deploy" |
| Validation vs. test | "adjust during training," "choose settings" | "final evaluation," "only once" |
| Overfitting vs. underfitting | "only training is high," "gap," "memorized" | "both low," "too simple" |
| Real-time vs. batch inference | "immediate," "low latency" | "bulk," "periodic," "overnight" |

Next week, building on these fundamentals, we will cover the ML lifecycle (collect → prepare → train → evaluate → deploy → monitor), data, evaluation metrics, and the role of people.

## 📖 Glossary

- **AI ⊃ ML ⊃ DL**: A notation for the containment relationship: "machine learning is inside AI, and deep learning is inside machine learning."
- **Supervised learning**: A method that has the model learn by giving it problems together with answers.
- **Unsupervised learning**: A method that gives only data without answers and has the model find hidden structure on its own.
- **Reinforcement learning**: A method that gives rewards and penalties and has the model learn how to act through trial and error.
- **Classification vs. regression**: If the answer is a "kind," it is classification; if the answer is a "number," it is regression.
- **Clustering**: The task of automatically grouping similar data without answers.
- **Feature vs. label**: The input information fed in for prediction is the feature, and the correct answer to predict is the label.
- **Inference**: The stage of feeding a new input to the finished model to get an answer.
- **Overfitting**: A state of having memorized the training data whole and being weak on new data.
- **Generalization**: The property of getting data not seen in training right. The model's ultimate goal.

## 📝 Practice Questions

**Question 1.** Which statement about the relationship between AI, machine learning, and deep learning and about learning types is correct?

A) Deep learning is a broader concept than AI  
B) Machine learning learns rules from data, and deep learning is the neural network-based approach within it  
C) Supervised learning trains on data with no answers at all  
D) Reinforcement learning learns by memorizing answer labels as-is  

**Answer: B**  
Explanation: Machine learning is a method of learning rules from data, and deep learning is the approach within it that stacks neural networks deeply. Since AI is the broadest concept, the claim that deep learning is broader is wrong; supervised learning trains on data with answers, and reinforcement learning learns from rewards.

---

**Question 2.** "Automatically grouping customer data into similar tendencies without answers" and "predicting tomorrow's temperature as a number" are, respectively, which tasks?

A) Both are classification  
B) Clustering and regression  
C) Regression and clustering  
D) Both are reinforcement learning  

**Answer: B**  
Explanation: Grouping similar data without answers is clustering, an unsupervised learning task, and predicting a continuous numeric value is regression, a supervised learning task. So, in order, they are clustering and regression.

---

**Question 3.** In a certain business task, the rules are very simple and clear ("amount × fixed tax rate"), and the results must always be 100% accurate. Which judgment is most appropriate?

A) There is plenty of data, so deep learning must be used no matter what  
B) Since the rules are simple and complete accuracy is required, traditional programming is more appropriate  
C) Using clustering solves it most accurately  
D) Machine learning is always more accurate, so machine learning should be used  

**Answer: B**  
Explanation: For problems with simple, clear rules that demand 100% accuracy, traditional programming is more accurate and cheaper. Machine learning is not always more accurate, and clustering is unsupervised learning that groups without answers, so it does not fit this problem.

---

**Question 4.** A trained model is nearly perfect on the training data but its performance drops sharply on new data. You are also asked for the definitions of feature and label. Which statement is correct?

A) This state is underfitting, and a feature means the answer  
B) This state is overfitting; a feature is input information and a label is the answer to get right  
C) This state is inference, and a label means input information  
D) This state is an ideal, well-generalized model  

**Answer: B**  
Explanation: The state of getting only the training data right while performance drops on new data is overfitting. A feature is the input information used for prediction, and a label is the answer the model must get right. Underfitting is a state of low performance even on the training data, and since performance on new data is low, it is not well generalized either.

---

**Question 5.** Putting together what was learned this week, which is the most appropriate judgment for using machine learning well?

A) Apply the most complex deep learning to every problem  
B) Look at the nature of the problem, the amount of data, and the accuracy requirements, and choose the simplest method that is sufficient  
C) Include the test data in training to boost accuracy  
D) Always use clustering on data that has answers  

**Answer: B**  
Explanation: Good design means weighing the nature of the problem, the quantity and quality of the data, and the required level of accuracy, then choosing the simplest method that is sufficient. Unconditionally using deep learning, mixing test data into training, or using clustering despite having answers are all poor judgments.

---
