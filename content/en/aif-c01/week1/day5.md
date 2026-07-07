# Day 5 - Week 1 Wrap-Up: AI/ML Fundamentals Review

## Introduction

This week we learned the most fundamental concepts of AI and machine learning step by step. Today we will weave together the content from Day 1 through Day 4 for review, and go over the parts most often confused on the exam once more.

Review is not mere memorization — it is a time to redraw "how the concepts connect." This week's core flow is as follows.

```
[Day1] The AI > ML > DL relationship
   ↓
[Day2] ML learning types (supervised, unsupervised, reinforcement)
   ↓
[Day3] Problems where ML fits vs. where it doesn't
   ↓
[Day4] Key terms (model, training, inference, feature, label, overfitting)
```

## Day 1 Review: The Relationship Between AI, ML, and DL

The first thing to remember is the nested relationship.

- **AI ⊃ Machine Learning ⊃ Deep Learning**
- AI: any technology that mimics intelligent behavior (including rule-based systems)
- Machine learning: a method of learning rules from data
- Deep learning: a type of machine learning that stacks neural networks deeply

All deep learning is machine learning, but not all AI is machine learning. A system whose rules were written directly by a human may be AI, but it is not machine learning.

## Day 2 Review: Learning Types

Machine learning is divided into three types by learning approach.

| Learning type | Answers (labels) | Representative tasks |
|-----------|-------------|----------|
| Supervised learning | Present | Classification (categories), regression (numbers) |
| Unsupervised learning | Absent | Clustering, dimensionality reduction |
| Reinforcement learning | Replaced by rewards | Games, robotics, control |

Let's revisit the two most commonly confused pairs.

- **Classification vs. regression**: If the output is a category, it's classification; if a number, regression.
- **Classification vs. clustering**: With answer labels, it's classification; without, clustering.

## Day 3 Review: Problems Where ML Fits

Machine learning is not a cure-all. Judge its suitability by the following criteria.

- **Traditional programming**: `data + rules → results`
- **Machine learning**: `data + results → rules`

| Machine learning fits | Machine learning doesn't fit |
|----------------|------------------|
| Rules are complex or hard to define | Rules are simple and clear |
| Data is plentiful | There is almost no data |
| Some margin of error is acceptable | 100% accuracy and full explainability are mandatory |

Remember that choosing the simplest method that is sufficient is good design.

## Day 4 Review: Key Terms

Let's redraw the machine learning flow in terms of the vocabulary.

```
Features + labels [training data]
   ↓ Training
[Model] completed
   ↓ Inference
New input (features) → predicted label
   ↓
Evaluate with [test data] → check for overfitting/underfitting
```

- **Model**: a learned bundle of rules
- **Training vs. inference**: the process of building the model vs. predicting with the built model
- **Feature vs. label**: input information vs. the answer to get right
- **Overfitting vs. underfitting**: memorizing only the training data vs. insufficient learning

> 💡 **Related theory**: This week's content is the foundation of the "AI/ML fundamental concepts" domain of the AIF-C01 exam. You need a clear grasp of this flow to comfortably follow the advanced topics ahead, such as generative AI and AWS AI services.

## Common Traps to Watch For

Here are the points where mistakes are easy to make on the exam.

| Trap | Correct understanding |
|------|------------|
| "Deep learning is the broadest concept" | AI is the broadest. Deep learning is the narrowest |
| "Classification and regression are the same" | Classification = categories, regression = numbers |
| "Classification and clustering are the same" | They differ in the presence of answer labels |
| "Machine learning is always better" | The traditional approach wins for simple problems |
| "It's fine to evaluate with training data" | Honest evaluation requires test data |
| "Overfitting = not enough learning" | Overfitting is actually memorizing too much |

## One-Sentence Summaries

Compressing this week into one sentence per day:

- **Day 1**: AI is the broadest, machine learning learns from data, and deep learning is neural network-based machine learning.
- **Day 2**: Learning types are divided into supervised, unsupervised, and reinforcement based on the presence of answers and the use of rewards.
- **Day 3**: Machine learning fits when the rules are complex and data is plentiful.
- **Day 4**: Train a model with features and labels, predict with inference, and watch out for overfitting.

## Next Week Preview

Starting next week, we go one step further on the foundation learned today. We will expand into how machine learning and deep learning are actually used, and into the concept of **generative AI**, which is drawing the most attention these days. Be sure to consolidate this week's core flow.

## 📝 연습 문제

**문제 1.** Which statement about the relationship between AI, machine learning, and deep learning and about learning types is correct?

A) Deep learning is a broader concept than AI  
B) Machine learning learns rules from data, and deep learning is the neural network-based approach within it  
C) Supervised learning trains on data with no answers at all  
D) Reinforcement learning learns by memorizing answer labels as-is  

**정답: B**  
해설: Machine learning is a method of learning rules from data, and deep learning is the approach within it that stacks neural networks deeply. Since AI is the broadest concept, the claim that deep learning is broader is wrong; supervised learning trains on data with answers, and reinforcement learning learns from rewards.

---

**문제 2.** "Automatically grouping customer data into similar tendencies without answers" and "predicting tomorrow's temperature as a number" are, respectively, which tasks?

A) Both are classification  
B) Clustering and regression  
C) Regression and clustering  
D) Both are reinforcement learning  

**정답: B**  
해설: Grouping similar data without answers is clustering, an unsupervised learning task, and predicting a continuous numeric value is regression, a supervised learning task. So, in order, they are clustering and regression.

---

**문제 3.** In a certain business task, the rules are very simple and clear ("amount × fixed tax rate"), and the results must always be 100% accurate. Which judgment is most appropriate?

A) There is plenty of data, so deep learning must be used no matter what  
B) Since the rules are simple and complete accuracy is required, traditional programming is more appropriate  
C) Using clustering solves it most accurately  
D) Machine learning is always more accurate, so machine learning should be used  

**정답: B**  
해설: For problems with simple, clear rules that demand 100% accuracy, traditional programming is more accurate and cheaper. Machine learning is not always more accurate, and clustering is unsupervised learning that groups without answers, so it does not fit this problem.

---

**문제 4.** A trained model is nearly perfect on the training data but its performance drops sharply on new data. You are also asked for the definitions of feature and label. Which statement is correct?

A) This state is underfitting, and a feature means the answer  
B) This state is overfitting; a feature is input information and a label is the answer to get right  
C) This state is inference, and a label means input information  
D) This state is an ideal, well-generalized model  

**정답: B**  
해설: The state of getting only the training data right while performance drops on new data is overfitting. A feature is the input information used for prediction, and a label is the answer the model must get right. Underfitting is a state of low performance even on the training data, and since performance on new data is low, it is not well generalized either.

---

**문제 5.** Putting together what was learned this week, which is the most appropriate judgment for using machine learning well?

A) Apply the most complex deep learning to every problem  
B) Look at the nature of the problem, the amount of data, and the accuracy requirements, and choose the simplest method that is sufficient  
C) Include the test data in training to boost accuracy  
D) Always use clustering on data that has answers  

**정답: B**  
해설: Good design means weighing the nature of the problem, the quantity and quality of the data, and the required level of accuracy, then choosing the simplest method that is sufficient. Unconditionally using deep learning, mixing test data into training, or using clustering despite having answers are all poor judgments.

---
