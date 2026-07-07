# Day 4 - Key Terms: Model, Training, Inference, Feature, Label, Overfitting

## Introduction

When studying machine learning, the same concepts get referred to with a mix of English and Korean terms, and many words look similar, which can be confusing. Today we will precisely sort out the **foundational vocabulary** you must know for the AIF-C01 exam and for real-world conversations.

The terms we will cover today are: model, training, inference, feature, label, datasets (training/validation/test), and overfitting and underfitting.

## Quick Reference Table of Key Terms

| Term | English | One-line definition |
|------|------|-----------|
| Model | Model | A "bundle of rules" learned from data |
| Training | Training | The process of building a model from data |
| Inference | Inference | The process of predicting answers for new data using a trained model |
| Feature | Feature | Input information (variables) used for prediction |
| Label | Label | The answer the model must get right |
| Overfitting | Overfitting | A state of memorizing only the training data and performing poorly on new data |
| Underfitting | Underfitting | A state of insufficient learning where even the patterns aren't captured |

## 1. Model

A **model** is the artifact learned from data. Think of it as a "learned bundle of rules" that takes input and produces output. For example, a function that takes a house's floor area as input and outputs an estimated price is a model.

A model itself starts out as a blank state that knows nothing, and it gradually becomes smarter through training.

## 2. Training & Inference

Machine learning work is broadly divided into two stages.

- **Training**: The process of building the model by showing it data. It takes a long time and consumes a lot of resources.
- **Inference**: The process of feeding **new input** to the finished model to get an answer. This is the stage users encounter in an actual service.

By analogy, training is "the process of studying," and inference is "solving exam problems with what you've learned."

> 💡 **Related theory**: Training is usually performed heavily once (or occasionally), while inference is repeated countless times during service. That is why the cost and speed requirements of training and inference differ from each other.

## 3. Feature & Label

- **Feature**: The **input information** used for prediction. Also called variables or attributes.
- **Label**: The **answer** the model must get right. (Used in supervised learning from Day 2.)

Using the house price prediction example:

| Item | Role | Example |
|------|------|------|
| Floor area, number of rooms, location | Features (input) | 84㎡, 3 rooms, Gangnam |
| Actual transaction price | Label (answer) | 900 million KRW |

Training requires both features and labels, while inference feeds in only features to predict the label (answer).

## 4. Splitting Datasets: Training, Validation, Test

To build a model properly, the available data is usually split into three parts.

| Dataset | English | Purpose |
|----------|------|------|
| Training data | Training set | Used to train the model |
| Validation data | Validation set | Used to check and tune the model during training |
| Test data | Test set | Used to objectively evaluate final performance |

The key point is that **test data is never used for training**. Evaluating with data used for training is like "taking an exam with questions you've already seen," so performance gets inflated.

> 💡 **Related theory**: The reason for splitting data into training/validation/test is to honestly measure whether the model "also works well on new data (generalization)."

## 5. Overfitting & Underfitting

These are the most frequently encountered problem concepts in machine learning.

### Overfitting

A state where the model has **memorized the training data too well**, and as a result performs poorly on new data. It is likened to "a student who memorizes past exam papers wholesale and can't solve variations."

- Training data accuracy: very high
- New (test) data accuracy: low

### Underfitting

A state where the model has learned too little and **failed to even capture the patterns**. It is likened to "a student who studied so little that they get even the basic questions wrong."

- Training data accuracy: low
- New data accuracy: low

| State | Training data performance | New data performance | Analogy |
|------|----------------|---------------|------|
| Underfitting | Low | Low | Not enough studying |
| Just right | High | High | Understands and can apply |
| Overfitting | Very high | Low | Only memorized |

> 💡 **Related theory**: A good model performs consistently well on both training data and new data. Striking the balance between overfitting and underfitting is the central challenge of machine learning, and this is described as "improving generalization performance."

## Understanding the Terms as a Connected Flow

The terms learned today don't stand alone — they connect into a single flow.

```
[Training data] containing features + labels
        ↓ (Training)
      [Model] completed
        ↓ (Inference)
New input (features) → predicted label
        ↓
Evaluate performance with [test data] → check for overfitting/underfitting
```

If you can picture this flow in your head, the more complex content in later weeks will be much easier to understand.

## Today's Summary

- A model is a "bundle of rules" learned from data.
- Training is the process of building the model; inference is the process of predicting with the built model.
- Features are input information; labels are the answers to get right.
- Data is split into training, validation, and test sets, and test data is not used for training.
- Overfitting is a state of memorizing only the training data; underfitting is a state of insufficient learning.

## 📝 연습 문제

**문제 1.** What is the process of feeding new input data to a completed model to obtain prediction results called?

A) Training  
B) Inference  
C) Labeling  
D) Overfitting  

**정답: B**  
해설: The process of predicting answers for new data with a trained model is inference. Training is the process of building the model, labeling is the task of attaching answers, and overfitting refers to a problematic state of a model.

---

**문제 2.** In house price prediction, "floor area, number of rooms, location" are used as input, and "actual transaction price" is the answer to get right. Which terms correctly refer to each?

A) Floor area and number of rooms are labels; transaction price is a feature  
B) Floor area and number of rooms are features; transaction price is the label  
C) Both are labels  
D) Both are features  

**정답: B**  
해설: The input information used for prediction is the feature, and the answer the model must get right is the label. Therefore floor area, number of rooms, and location are features, and the transaction price is the label.

---

**문제 3.** A model achieves very high accuracy on the training data but its performance drops sharply on new test data. Which term best describes this state?

A) Underfitting  
B) Overfitting  
C) Inference  
D) Generalization  

**정답: B**  
해설: The state of getting the training data right but performing poorly on new data is overfitting. Underfitting is a state of poor performance even on the training data, inference is the prediction process, and generalization is the desirable property of also working well on new data.

---

**문제 4.** What is the main reason for splitting data into training, validation, and test sets in machine learning?

A) To make the data smaller and save storage space  
B) To honestly evaluate whether the model also works well on new data  
C) To use the test data one more time for training  
D) To remove the labels  

**정답: B**  
해설: The core reason for splitting data is to objectively measure the model's generalization performance using data not used for training. Reusing test data for training inflates performance, so it is never done.

---

**문제 5.** What is the state in which learning was insufficient, patterns weren't properly captured even on the training data, and performance is also low on new data?

A) Overfitting  
B) Underfitting  
C) Inference  
D) Validation  

**정답: B**  
해설: The state of low performance on both training data and new data, where even basic patterns weren't learned, is underfitting. Overfitting is the opposite situation of only getting the training data right, and inference and validation are processes unrelated to over/underfitting.

---
