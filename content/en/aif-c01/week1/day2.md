# Day 2 - Learning Types: Supervised, Unsupervised, and Reinforcement Learning

## Introduction

Yesterday we looked at the relationship between AI, machine learning, and deep learning. Today we will learn the three major learning types into which machine learning is divided based on "how it learns."

- **Supervised Learning**
- **Unsupervised Learning**
- **Reinforcement Learning**

These three appear frequently on the exam, and the key differences are "whether there are answers (labels)" and "how the learning signal is received." We will also cover basic task concepts such as classification, regression, and clustering.

## Learning Types at a Glance

| Learning type | Answers (labels) | Key question | Representative tasks |
|-----------|-------------|----------|----------|
| Supervised learning | Present | "How do we learn to predict when the answers are known?" | Classification, regression |
| Unsupervised learning | Absent | "How do we find hidden structure without answers?" | Clustering, dimensionality reduction |
| Reinforcement learning | Replaced by rewards | "How do we learn the best actions through trial and error?" | Control, games, robotics |

## 1. Supervised Learning

Supervised learning trains on **data where inputs and answers (labels) are given together**. Think of it as a "teacher teaching while providing the correct answers."

For example, if you train a model on dog/cat photos each labeled "dog" or "cat," the model learns to predict which one a new photo shows.

Supervised learning is broadly divided into two types.

### Classification

Used when **the answer is one of a fixed set of categories (kinds)**. The output is categorical, like "is it this or that?"

- Is an email spam or not (2 categories)
- Is the animal in the photo a dog, cat, or bird (multiple categories)
- Is a credit card transaction legitimate or fraudulent

### Regression

Used when **the answer is a continuous numeric value**. The output is a quantity, like "how much?"

- What will tomorrow's temperature be
- What is the estimated price of this house
- What will next month's revenue be

> 💡 **Related theory**: The easiest criterion for distinguishing classification from regression is "is the output a category or a number?" "Spam/legitimate" is classification; "price prediction" is regression.

## 2. Unsupervised Learning

Unsupervised learning finds hidden structure or patterns on its own in **data without answers (labels)**. The approach is "organize the data without an answer key."

### Clustering

The task of automatically grouping similar data together. It differs from classification in that there are no predefined answer groups.

- Automatically grouping customers into similar segments by purchasing tendency
- Automatically grouping news articles by topic

For example, if you say "divide the customers into 3 groups," unsupervised learning groups similar people together without ever being told in advance who belongs to which group.

### Dimensionality Reduction

When data has too many features (variables), this task reduces the number of variables while preserving as much important information as possible. It simplifies the data and makes it easier to visualize.

> 💡 **Related theory**: Classification (supervised) and clustering (unsupervised) are easy to confuse because "both divide things into groups." The decisive difference is the **presence or absence of answer labels**. Classification assigns to groups with known answers; clustering groups similar items together without answers.

## 3. Reinforcement Learning

Reinforcement learning learns through **trial and error and rewards**. Instead of being given answers directly, the agent receives a reward when an action's outcome is good and a penalty when it is bad, gradually learning better behavior. It is similar to "training a dog by giving treats when it does well."

The core components are as follows.

| Term | Meaning | Analogy |
|------|------|------|
| Agent | The entity that learns and acts | Game player |
| Environment | The world the agent interacts with | Game screen |
| Action | The choice the agent makes | Pressing a button |
| Reward | A score for the action (good/bad) | Gaining/losing points |

Representative examples include game AI (Go, chess), robot control, and autonomous driving control.

> 💡 **Related theory**: Reinforcement learning has no prepared answer data. Instead, the agent learns an action strategy that maximizes the rewards it receives while interacting with the environment. This is fundamentally different from supervised/unsupervised learning.

## Comparing the Three Learning Types with Examples

Even with the same "customer data," the learning type differs depending on the objective.

| Objective | Learning type | Reason |
|------|----------|------|
| Predicting whether a customer will churn (yes/no) | Supervised learning (classification) | Learns from past churn outcomes (answers) |
| Predicting this customer's spending next month | Supervised learning (regression) | Predicts a numeric value |
| Grouping similar customers together | Unsupervised learning (clustering) | Groups by similarity without answers |
| Learning the optimal recommendation order per customer via rewards | Reinforcement learning | Learns a strategy through trial and error and rewards |

## Today's Summary

- Machine learning's learning types are divided into supervised, unsupervised, and reinforcement learning.
- Supervised learning has answers (labels) and is divided into classification (category prediction) and regression (number prediction).
- Unsupervised learning has no answers; clustering and dimensionality reduction are its representative tasks.
- Reinforcement learning learns optimal actions through trial and error driven by rewards.
- Be sure to remember that the difference between classification and clustering is "the presence or absence of answer labels."

## 📝 Practice Questions

**Question 1.** Which approach trains a model on input data given together with answers (labels), so that the model learns to predict those answers?

A) Unsupervised learning  
B) Supervised learning  
C) Reinforcement learning  
D) Transfer learning  

**Answer: B**  
Explanation: The approach in which inputs and answers are given as pairs and the model learns to predict the answers is supervised learning. Unsupervised learning has no answers, and reinforcement learning uses rewards instead of answers.

---

**Question 2.** You want to take inputs such as a house's floor area and number of rooms and predict its "expected sale price (a numeric amount)." Which task is most appropriate?

A) Classification  
B) Clustering  
C) Regression  
D) Dimensionality Reduction  

**Answer: C**  
Explanation: Since the output is a continuous numeric value — a price — this is regression. Classification is for predicting categories, and clustering and dimensionality reduction are unsupervised learning tasks with no answers.

---

**Question 3.** You want to automatically group customers with similar tendencies from customer data that has no answer labels at all. Which task is most suitable?

A) Regression  
B) Clustering  
C) Classification  
D) Reinforcement learning  

**Answer: B**  
Explanation: Grouping similar data without answers is clustering, an unsupervised learning task. Classification and regression are supervised learning with answers, and reinforcement learning is a reward-based trial-and-error approach.

---

**Question 4.** Which statement best describes how reinforcement learning works?

A) It memorizes prepared answer data as-is  
B) It learns through trial and error to maximize the rewards received as a result of its actions  
C) It groups data into similar clusters without answers  
D) It predicts numeric values by looking at input-answer pairs  

**Answer: B**  
Explanation: In reinforcement learning, the agent learns an action strategy through trial and error to maximize the rewards received while interacting with the environment. Memorizing answers or learning from input-answer pairs is supervised learning, and grouping into clusters is unsupervised learning.

---

**Question 5.** What is the most essential difference between classification (supervised learning) and clustering (unsupervised learning)?

A) Classification predicts numbers, clustering predicts categories  
B) Classification uses answer labels, while clustering groups by similarity without answers  
C) Classification uses rewards, clustering uses answers  
D) There is no difference since both use answer labels  

**Answer: B**  
Explanation: Classification is supervised learning trained on predefined answer categories, while clustering is unsupervised learning that groups similar data without answers. Both divide things into groups, but the presence or absence of answer labels is the key difference. Predicting numbers is regression, and rewards are a feature of reinforcement learning.

---
