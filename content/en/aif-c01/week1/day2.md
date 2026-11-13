# Day 2 - Learning Types: Supervised, Unsupervised, and Reinforcement Learning

## 📌 Key Takeaways

- Machine learning has three learning types: **supervised, unsupervised, and reinforcement learning**.
- **Supervised learning**: has answers (labels) → **classification** (predict a category) / **regression** (predict a number).
- **Unsupervised learning**: has no answers → **clustering** (group similar items) / **dimensionality reduction** (reduce the number of variables).
- **Reinforcement learning**: instead of answers, it receives **rewards** and learns the best actions through trial and error.
- Watch out for the mix-ups: classification vs. regression comes down to **whether the output is a category or a number**; classification vs. clustering comes down to **whether answer labels exist**.

## Learning Types at a Glance

Machine learning is divided by "how it learns." There are two forks in the road: **whether there are answers (labels)** and **how the learning signal is received**.

| Learning type | Answers (labels) | Key question | Representative tasks |
|-----------|-------------|----------|----------|
| Supervised learning | Present | "How do we learn to predict when the answers are known?" | Classification, regression |
| Unsupervised learning | Absent | "How do we find hidden structure without answers?" | Clustering, dimensionality reduction |
| Reinforcement learning | Replaced by rewards | "How do we learn the best actions through trial and error?" | Control, games, robotics |

## 1. Supervised Learning

- It learns from **data in which inputs and answers (labels) are given together**. Think of it as a "teacher teaching while providing the correct answers."
- Example: if you train a model on dog and cat photos that each come with their answer, the model can look at a new photo and predict which one it is.
- Supervised learning is divided into two types: **classification** and **regression**.

### Classification

Used when **the answer is one of a fixed set of categories (kinds)**. The output is a category.

- Is an email spam or not (2 categories)
- Is the animal in the photo a dog, a cat, or a bird (multiple categories)
- Is a credit card transaction legitimate or fraudulent

### Regression

Used when **the answer is a continuous numeric value**. The output is a quantity.

- What will tomorrow's temperature be
- What is the expected price of this house
- What will next month's sales be

The easiest way to tell classification and regression apart is to ask: "Is the output a category or a number?" "Spam / legitimate" is classification; "price prediction" is regression.

## 2. Unsupervised Learning

- It finds hidden structure or patterns on its own in **data that has no answers (labels)**. It is like being told to "organize this data without an answer key."

### Clustering

- The task of automatically grouping similar data together. It differs from classification in that there are no predefined answer groups.
- Automatically sorting customers into similar groups based on their purchasing tendencies
- Automatically grouping news articles by topic
- Example: if you say "split the customers into 3 groups," the model groups similar people together without being told in advance who belongs to which group.

### Dimensionality Reduction

- The task of reducing the number of variables while keeping as much of the important information as possible, when the data has too many features (variables).
- It simplifies the data and makes it easier to visualize.

> 💡 **Related theory**: Classification (supervised) and clustering (unsupervised) are easy to confuse because "both split data into groups." The decisive difference is **whether answer labels exist**. Classification sorts into groups that have answers; clustering groups similar items without answers.

## 3. Reinforcement Learning

- It learns through **trial and error and rewards**.
- Instead of giving the answer directly, it gives a reward when the result of an action is good and a penalty when it is bad, so the learner gradually picks better actions.
- It is similar to "training a puppy by giving it a treat when it does well."

| Term | Meaning | Analogy |
|------|------|------|
| Agent | The entity that learns and acts | The game player |
| Environment | The world the agent interacts with | The game screen |
| Action | A choice the agent makes | Pressing a button |
| Reward | A score for an action (good/bad) | Gaining or losing points |

- Typical examples: game AI (Go, chess), robot control, autonomous driving control.

Reinforcement learning has no pre-prepared answer data. Instead, the agent interacts with the environment and learns an action strategy that maximizes the rewards it receives. This is fundamentally different from supervised and unsupervised learning.

## Comparing the Three Learning Types: Examples

Even with the same "customer data," the learning type changes depending on the goal.

| Goal | Learning type | Reason |
|------|----------|------|
| Predict whether this customer will churn (yes/no) | Supervised (classification) | Learns from past churn outcomes (the answers) |
| Predict this customer's spending next month | Supervised (regression) | Predicts a numeric value |
| Group similar customers together | Unsupervised (clustering) | Groups by similarity without answers |
| Learn the best recommendation order per customer from rewards | Reinforcement learning | Learns a strategy through trial and error and rewards |

## Start with the Data: Does It Have Labels?

The first question when choosing a learning type is not the algorithm but **whether the data you have right now comes with answers attached**.

| Data you have | What it is called | Learning you can use | Example |
|-------------|------------|----------------|-----|
| Every input has an answer attached | Labeled data | Supervised learning | 100,000 emails marked "spam / legitimate" |
| Only inputs, no answers | Unlabeled data | Unsupervised learning | A customer list with only accumulated purchase records |
| Instead of data, an environment to try things in | (an environment, not a dataset) | Reinforcement learning | A robot arm simulator, a game |

- Labels do not appear on their own. People attach them (labeling, covered in Week 2 Day 4) or they come from past records. A record saying "this customer actually canceled" is itself a label.
- That is why the biggest cost of supervised learning is usually **getting the labels**, and the advantage of unsupervised learning is that you can start right away without labels.

## Comparing the Three Types by Cost and Validation

| Comparison axis | Supervised learning | Unsupervised learning | Reinforcement learning |
|---------|----------|-----------|----------|
| What you need | Inputs + answer labels | Input data only | An environment + reward rules |
| Biggest burden | Obtaining labels | Interpreting what the results mean | Huge amounts of trial and error (time, compute) |
| How to check it did well | Compare against the answers | No answers, so a person looks at the results and judges | Check whether cumulative reward is growing |
| Output | A model that predicts the answer for new inputs | Groups, reduced variables, unusual data | An action strategy that decides what to do in each situation |

- **Clustering results have no names.** The model just splits the data into "group 1, 2, 3"; whether a group is the "thrifty customer" type or the "impulse buyer" type is something a person looks at and labels.
- Another use of unsupervised learning is **anomaly detection**: picking out items far from most of the data. Even without a "fraud" label, you can find "transactions that differ from the usual."
- Because it is hard to do trial and error directly in the real world where failure is costly (real roads, real factories), reinforcement learning is often trained first in a **simulation environment**.

## How Reinforcement Learning Works

```
1. The agent observes the current state        (robot vacuum: there is a wall ahead)
        ↓
2. It picks one action                         (turn left)
        ↓
3. The environment returns a reward and the next state   (no collision +1 / collision -5)
        ↓
4. It adjusts its strategy to choose high-reward actions more often
        ↓
   Go back to 1 and repeat countless times
```

- This "rulebook of what to do in each situation" is called a **policy**. The goal of reinforcement learning is to find the policy that maximizes **the total reward collected to the end**, not a single reward.
- Difference from supervised learning: supervised learning tells you "the answer for this situation is this" every time, whereas reinforcement learning tells you **only a score after you have tried**. It never tells you what the right answer was.

## Identifying the Type from Scenarios

| Scenario | Answer | Reasoning |
|----------|-----|----------|
| Decide whether a product review is positive or negative (past reviews are marked) | Supervised / classification | Labels exist, output is a category |
| Predict next week's order volume per store | Supervised / regression | Output is a continuous number |
| Judge "yes/no" whether a loan applicant will default | Supervised / classification | Even if the model outputs a probability of 0.87, the final answer is a category |
| Split unlabeled survey respondents by tendency | Unsupervised / clustering | There are no predefined answer groups |
| Boil a 200-question survey down to a few core tendency axes | Unsupervised / dimensionality reduction | Reduces the number of variables |
| Find unusual values from equipment sensors that contain only normal records | Unsupervised / anomaly detection | Finds outliers without labels |
| A warehouse robot learns the fastest collision-free route | Reinforcement learning | Repeated action → reward |
| Identify whether the animal in a photo is a dog, cat, or bird | Supervised / classification (multi-class) | Still classification even with three or more categories |

## Correcting Common Misconceptions

- **"If the output is a number, it is regression"** → It is regression **only when the magnitude of the number has meaning**. A postal code or a grade code (1 = legitimate, 2 = spam) is a category even though it is written as a number, so it is classification.
- **"Two categories means classification, many categories means clustering"** → The number of categories is irrelevant. Two is binary classification and three or more is multi-class classification; the difference from clustering is still **whether labels exist**.
- **"Unsupervised learning needs no people"** → Only the learning needs no answers; judging whether the resulting groups are useful and naming them is still a person's job.
- **"Reinforcement learning reward = supervised learning label"** → A label is the answer itself, whereas a reward is the score for the action just taken. You only receive a reward by performing the action.
- **"We have a little answer data, so it must be supervised learning"** → If there are too few labels, the model will not learn properly. A common order is to explore the structure with clustering first, add more labels, and then move on to classification.

## 📖 Glossary

- **Label**: The answer attached to the data in advance, such as "this photo is a cat."
- **Supervised learning**: A method that gives problems together with answers for the model to learn from. It is like a teacher teaching while providing the answers.
- **Unsupervised learning**: A method that gives only data without answers and has the model find hidden structure on its own.
- **Reinforcement learning**: A method that gives a reward for doing well and a penalty for doing badly, so the model picks up the knack through trial and error.
- **Classification**: A task used when the answer is "one of a fixed set of kinds." Spam / legitimate, dog / cat / bird.
- **Regression**: A task used when the answer is a continuous number, as in "how much?" Predicting price or temperature.
- **Clustering**: The task of automatically grouping similar data together without answers.
- **Dimensionality reduction**: The task of reducing the number of variables (features) while keeping the important information, when there are too many.
- **Agent**: In reinforcement learning, the entity that actually acts and learns. In a game, the player.
- **Reward**: In reinforcement learning, the score that tells whether the action just taken was good or bad.

## 📝 Practice Questions

**Question 1.** Which approach trains a model on input data given together with answers (labels), so that the model learns to predict those answers?

A) Unsupervised learning  
B) Supervised learning  
C) Reinforcement learning  
D) Transfer learning  

**Answer: B**  
Explanation: The approach in which inputs and answers are given as pairs and the model learns to predict the answers is supervised learning. Unsupervised learning has no answers, and reinforcement learning uses rewards instead of answers.

---

**Question 2.** You want to take a house's floor area, number of rooms, and so on as input and predict the "expected sale price (a number in KRW)." Which task is the most appropriate?

A) Classification  
B) Clustering  
C) Regression  
D) Dimensionality reduction  

**Answer: C**  
Explanation: Since the output is a continuous numeric value, a price, this is regression. Classification is for predicting categories, and clustering and dimensionality reduction are unsupervised learning tasks with no answers.

---

**Question 3.** You want to automatically group customers with similar tendencies from customer data that has no answer labels at all. Which task is the most suitable?

A) Regression  
B) Clustering  
C) Classification  
D) Reinforcement learning  

**Answer: B**  
Explanation: Grouping similar data without answers is clustering, an unsupervised learning task. Classification and regression are supervised learning with answers, and reinforcement learning is a reward-based trial-and-error approach.

---

**Question 4.** Which best describes how reinforcement learning learns?

A) It memorizes pre-prepared answer data as it is  
B) It learns through trial and error to maximize the rewards received as a result of its actions  
C) It groups data into similar groups without answers  
D) It predicts numeric values by looking at input-answer pairs  

**Answer: B**  
Explanation: In reinforcement learning, the agent interacts with the environment and learns an action strategy through trial and error to maximize the rewards it receives. Memorizing answers or learning from input-answer pairs is supervised learning, and grouping into clusters is unsupervised learning.

---

**Question 5.** What is the most essential difference between classification (supervised) and clustering (unsupervised)?

A) Classification predicts numbers and clustering predicts categories  
B) Classification uses answer labels, whereas clustering groups by similarity without answers  
C) Classification uses rewards and clustering uses answers  
D) Both use answer labels, so there is no difference  

**Answer: B**  
Explanation: Classification is supervised learning that learns from answers in fixed categories, and clustering is unsupervised learning that groups similar data without answers. Both split data into groups, but the key difference is whether answer labels exist. Predicting numbers is regression, and rewards are a characteristic of reinforcement learning.

---
