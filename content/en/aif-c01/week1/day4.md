# Day 4 - Key Terms: Model, Training, Inference, Feature, Label, Overfitting

## 📌 Key Takeaways

- A **model** = a bundle of rules learned from data. **Training** = the process of building the model, and **inference** = the process of making predictions with the built model, which is served in **real-time, batch, asynchronous, or serverless** form depending on requirements.
- A **feature** = the input information, and a **label** = the correct answer to be predicted. Training needs both; inference needs only the features.
- Split data into **training, validation, and test** sets, and **never use the test data for training**.
- **Overfitting** = memorizing only the training data and doing poorly on new data. **Underfitting** = too little learning, so it does poorly on both.
- The ultimate goal is **generalization performance**: working well on new data too.

## Quick Reference Table of Key Terms

Machine learning terms mix English and Korean, and many words look alike. Matching up the pairs with the table below first makes the later explanations easier.

| Term | One-line definition |
|------|-----------|
| Model | A "bundle of rules" learned from data |
| Training | The process of building a model from data |
| Inference | The process of predicting answers for new data with a trained model |
| Feature | The input information (variable) used for prediction |
| Label | The correct answer the model must predict |
| Overfitting | Memorizing only the training data and doing poorly on new data |
| Underfitting | Too little learning, so it fails to capture even the patterns |

## 1. Model

- The product learned from data. A "learned bundle of rules" that takes an input and produces an output.
- Example: a function that takes the floor area of a house and outputs an expected price is a model.
- At first it is an empty state that knows nothing, and it gradually gets smarter through training.

## 2. Training and Inference

The work of machine learning is broadly split into two stages.

- **Training**: the process of building a model by showing it data. It takes a long time and uses a lot of resources.
- **Inference**: the process of feeding a **new input** to the finished model to get an answer. It is the stage users actually meet in a real service.
- Analogy: training is "the process of studying," and inference is "solving exam questions with what you learned."

Training is usually done once (or occasionally) as a heavy job, while inference is repeated countless times while the service runs. So the cost and speed requirements for training and inference are different.

### An Algorithm Is Not a Model

| Term | What it is | Cooking analogy | Example |
|------|---------|----------|-----|
| Algorithm | The **learning method** that finds rules in data | The recipe | "The procedure for finding the line that best fits area and price" |
| Model | The **result** obtained by running that method on actual data | The finished dish | A formula settled into "price = area × some amount + some amount" |

- Even with the same algorithm, **different data produces a different model**. A model trained on Seoul house prices and one trained on Busan house prices come from the same recipe but are different dishes.
- The numbers filled into the model through training are called **parameters**, and the settings a person decides before training (such as how long to train) are called **hyperparameters**. For the exam, you only need to tell them apart by "who decides."

### Training and Inference Side by Side

| Comparison axis | Training | Inference |
|---------|---------------|-----------------|
| What it does | Builds the model | Uses the built model |
| What goes in | Features + labels (large volume) | Features only (a new input) |
| What comes out | A model | A prediction result |
| Frequency | Occasionally, as one heavy job | Continuously while the service runs, each one light |
| What matters | Did it learn well (generalization) | How fast and how cheaply it answers |

### Four Ways to Serve Inference

How you serve inference depends on "**by when** the prediction is needed." The exam guide gives four examples: batch, real-time, asynchronous, and serverless. The table below follows the inference options of Amazon SageMaker AI (formerly named Amazon SageMaker).

| Method | When to use | Characteristics | Example |
|------|----------|------|-----|
| Real-time | When each request needs an immediate answer | An always-on endpoint responds with low latency | Fraud judgment at the moment of payment, product recommendations |
| Batch | Large amounts of data at once, not urgent | Runs a job without a standing endpoint and finishes | Computing churn scores for all customers every night |
| Asynchronous | When inputs are large and processing takes long | Requests are queued and processed, and it can scale down to zero when there are no requests | Analyzing long videos and large documents |
| Serverless | When requests are sparse or uneven | You do not manage instances and pay only for what you use (no charge for idle time) | An internal tool that is called now and then |

- Clues for telling them apart: "**immediate, low latency**" → real-time, "**bulk, periodic, offline**" → batch, "**large payload, long processing time**" → asynchronous, "**intermittent, unpredictable traffic**" → serverless.
- A common mistake is choosing a real-time endpoint for "produce scores for all customers once a day." You only pay for keeping it on all day.

## 3. Feature and Label

- **Feature**: the **input information** used for prediction. Also called a variable or an attribute.
- **Label**: the **correct answer** the model must predict. (Used in supervised learning from Day 2.)

| Item | Role | Example |
|------|------|------|
| Floor area, number of rooms, location | Features (input) | 84 m², 3 rooms, Gangnam |
| Actual transaction price | Label (answer) | 900 million KRW |

- During training, **both** features and labels are needed, and during inference you put in **only the features** and predict the label.

## 4. Splitting the Dataset: Training, Validation, Test

| Dataset | Purpose |
|----------|------|
| Training set | Used to train the model |
| Validation set | Used to check and tune the model during training |
| Test set | Used to evaluate final performance objectively |

- The key point is that **test data is never used for training**.
- If you evaluate with data used for training, it is like "taking an exam with questions you have already seen," so the performance is inflated.

> 💡 **Related theory**: The reason for splitting data into training, validation, and test sets is to honestly measure whether the model "works well on new data too (generalization)."

## 5. Overfitting and Underfitting

These are the representative problem concepts in machine learning.

### Overfitting

- A state where the model **memorized the training data too well** and performs poorly on new data.
- Analogy: "a student who memorized past exam questions word for word and cannot solve variations."
- Training data accuracy: very high / new (test) data accuracy: low

### Underfitting

- A state where learning was insufficient and the model **failed to capture even the patterns properly**.
- Analogy: "a student who barely studied and gets even basic problems wrong."
- Training data accuracy: low / new data accuracy: low

| State | Performance on training data | Performance on new data | Analogy |
|------|----------------|---------------|------|
| Underfitting | Low | Low | Not enough study |
| Appropriate | High | High | Understands and can apply |
| Overfitting | Very high | Low | Only memorized |

A good model works evenly well on both the training data and new data. Balancing between overfitting and underfitting is the core challenge of machine learning, and this is described as "improving generalization performance."

### Diagnosing and Prescribing from Scores

You have to put the two scores **side by side** to see the state. The training score alone tells you nothing.

| Training data accuracy | Test data accuracy | Diagnosis | How to read it |
|-------------------|---------------------|------|---------|
| 62% | 60% | Underfitting | Both are low. It has not learned properly yet |
| 91% | 89% | Appropriate | Both are high and the gap is small |
| 99% | 70% | Overfitting | A 29 percentage point gap. It only memorized and cannot apply |

| State | Common causes | Remedy |
|------|----------|------|
| Underfitting | The model is too simple, training is insufficient, there are no useful features | A more expressive model, more sufficient training, better features |
| Overfitting | The data is small or skewed to one side, the model is too complex, it was trained too long | More and more varied data, a simpler model, stop training at a suitable point |

- Do not mix up the direction: prescribing "train longer" for overfitting makes it **worse**. Overfitting is an excess, not a shortage.

> 💡 **Related theory**: The exam guide also asks about this phenomenon with the terms **bias** and **variance**. A model that is too simple and consistently misses the correct answer has **high bias → underfitting**, while one that is swayed sensitively even by small differences in the training data has **high variance → overfitting**. How well the model has been matched to the data overall is called its **fit**. Note that "bias" is also used in the sense of **fairness**, meaning a judgment skewed against a particular group (Week 5), so you must tell from context which one is meant.

## Why Keep Validation Data and Test Data Separate

- During training you change settings and compare "which is better" many times. What you use for this comparison is the **validation data**.
- If you keep picking with the same validation data, the model gets gradually tuned **in favor of the validation data** even though it was not trained on it. It is like taking the same mock exam many times and getting used to that mock exam.
- So after all the picking is finished, you measure the final score with **test data** that has never been used for any judgment. This score is the most honest estimate for "data it has never seen."

## Correcting Common Misconceptions

- **"High training accuracy means a good model"** → You have to look at the gap with the test score. A high training score can be a symptom of overfitting.
- **"Labels are needed at inference time too"** → Inference is done **because you do not know** the label. You put in only the features.
- **"Model = algorithm"** → The algorithm is the method, and the model is the result of learning from data with that method.
- **"If the test score is bad, just train again with the test data"** → The moment you do, the test data is no longer "data it has never seen." The score goes up but loses its meaning.
- **"Once training ends, the cost ends"** → Inference continues as long as the service is alive. For a service with many requests, inference cost can even exceed training cost.

## Understanding the Terms Together

The terms learned today connect into a single flow.

```
[Training data] containing features + labels
        ↓ (Training)
      [Model] completed
        ↓ (Inference)
New input (features) → predicted label
        ↓
Evaluate performance with [test data] → check for overfitting/underfitting
```

- If you can picture this flow in your head, the more complex content in later weeks becomes much easier to understand.

## 📖 Glossary

- **Model**: A "bundle of rules" after training is finished. Give it an input and it produces an answer.
- **Training**: The process of building a model by showing it data. Heavy and slow.
- **Inference**: The process of feeding a new input to the finished model to get an answer. Repeated continuously in a service.
- **Feature**: The input information used for prediction. For house price prediction, area, number of rooms, and location.
- **Label**: The correct answer the model must predict. For house price prediction, the actual transaction price.
- **Validation data**: Data used to check the model and adjust settings during training.
- **Test data**: Data used to give the final grade. Never used for training.
- **Overfitting**: A state of memorizing past exam questions word for word and being unable to solve variations.
- **Underfitting**: A state of not having studied enough and missing even basic problems.
- **Generalization**: The property of getting new data it did not see in training right. The goal of a good model.

## 📝 Practice Questions

**Question 1.** What is the process of feeding new input data to a completed model to obtain prediction results called?

A) Training  
B) Inference  
C) Labeling  
D) Overfitting  

**Answer: B**  
Explanation: The process of predicting answers for new data with a trained model is inference. Training is the process of building the model, labeling is the task of attaching answers, and overfitting refers to a problematic state of a model.

---

**Question 2.** In house price prediction, "floor area, number of rooms, location" are used as input, and "actual transaction price" is the answer to get right. Which terms correctly refer to each?

A) Floor area and number of rooms are labels; transaction price is a feature  
B) Floor area and number of rooms are features; transaction price is the label  
C) Both are labels  
D) Both are features  

**Answer: B**  
Explanation: The input information used for prediction is the feature, and the answer the model must get right is the label. Therefore floor area, number of rooms, and location are features, and the transaction price is the label.

---

**Question 3.** A model achieves very high accuracy on the training data but its performance drops sharply on new test data. Which term best describes this state?

A) Underfitting  
B) Overfitting  
C) Inference  
D) Generalization  

**Answer: B**  
Explanation: The state of getting the training data right but performing poorly on new data is overfitting. Underfitting is a state of poor performance even on the training data, inference is the prediction process, and generalization is the desirable property of also working well on new data.

---

**Question 4.** What is the main reason for splitting data into training, validation, and test sets in machine learning?

A) To make the data smaller and save storage space  
B) To honestly evaluate whether the model also works well on new data  
C) To use the test data one more time for training  
D) To remove the labels  

**Answer: B**  
Explanation: The core reason for splitting data is to objectively measure the model's generalization performance using data not used for training. Reusing test data for training inflates performance, so it is never done.

---

**Question 5.** What is the state in which learning was insufficient, patterns weren't properly captured even on the training data, and performance is also low on new data?

A) Overfitting  
B) Underfitting  
C) Inference  
D) Validation  

**Answer: B**  
Explanation: The state of low performance on both training data and new data, where even basic patterns weren't learned, is underfitting. Overfitting is the opposite situation of only getting the training data right, and inference and validation are processes unrelated to over/underfitting.

---
