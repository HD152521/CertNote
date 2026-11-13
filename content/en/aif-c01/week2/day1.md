# Day 1 - ML Lifecycle Overview: One Full Cycle from Data to Operations

## 📌 Key Takeaways

- The ML lifecycle has six stages: **data collection → data preparation → model training → model evaluation → deployment → monitoring**.
- It is not a straight line but a **circle**. Deployment is not the end: monitoring leads back to retraining.
- The stage people skip most easily is **data preparation**. You must not train right after collecting data.
- Evaluation is only meaningful when done on **data that was not used for training and that the model has never seen**.
- The reason for the cycle is **data drift**: over time the data distribution changes and the model goes stale.

## Why Call It a "Lifecycle"?

- AIF-C01 does not expect you to code a model yourself. It asks **"which stages are there, and what is each stage responsible for?"**
- Ordinary software development: a relatively **linear** flow of `requirements → design → implementation → deployment`.
- ML: the output (the model) **learns patterns from data**, so when the data changes the model goes stale → a **loop** that keeps turning.

> 💡 **Related theory**: The key reason the ML lifecycle is circular is "data drift." The distribution of real-world data changes over time (for example, last year's shopping patterns ≠ this year's shopping patterns). A model built from the data available at training time gradually drifts away from reality, so you need a cycle of collecting data again and retraining.

## The Six Stages at a Glance

| Stage | One-line definition | Key question |
|------|-----------|----------|
| Data Collection | Gather raw data that fits the problem | "What data do we need?" |
| Data Preparation | Clean the data and turn it into a form that can be learned from | "Is the data clean and usable?" |
| Model Training | The algorithm learns patterns from the data | "Did the model learn the patterns well?" |
| Model Evaluation | Measure whether the model really predicts well | "Does it do well on data it has never seen?" |
| Deployment | Release the model so it can be used in a real service | "Can users actually use it?" |
| Monitoring | Watch whether model performance degrades in production | "Is it still working well?" |

- This **order is worth memorizing**. When a question asks "Can we just train right after collecting the data?", you should notice that **the 'preparation' stage in the middle is missing**.

## Walking Through Each Stage

### 1. Data Collection — The Starting Point of Everything

- A model cannot produce something it has never seen. A model that has never seen a single cat photo cannot recognize a cat.
- The first stage is **collecting data that fits the problem**.
- Sources: databases, logs, sensors, external APIs, user input, and so on.

To build a model that filters spam, you first need to collect lots of "emails classified as spam" and lots of "normal emails." If you cannot collect enough of both kinds, none of the later stages mean anything.

### 2. Data Preparation — The Stage That Takes the Most Time

- Real-world data is messy: missing values, duplicates, inconsistent formats, typos.
- What happens here: **cleaning** → filling in missing values → unifying formats → **converting to numeric form** that the model can understand.
- At this stage the data is also **split into training, validation, and test sets** (covered in detail on Day 2).

They say most of the time in an ML project goes into data preparation. As the maxim "Garbage In, Garbage Out" puts it, even the best algorithm cannot build a good model from bad data.

### 3. Model Training — The Stage Where Patterns Are Learned

- When you feed the prepared data to an algorithm, the algorithm **finds patterns (rules) on its own**. That is training.
- Example: a house-price prediction model learns from the data that "the larger the area and the closer to the station, the more expensive."
- Output: a **trained model**.

### 4. Model Evaluation — Measuring Real Ability

- Doing well on the training data is a given (the model has already seen it).
- What matters is **whether it does well on data it sees for the first time** → measure with **test data** that was not used for training.
- Metrics such as accuracy appear at this stage (the topic of Day 3).

> ⚠️ **Trap**: Judging "99% accuracy on the training data, so it's a good model" is dangerous. A model that has simply memorized the training data can be terrible on new data (overfitting). Evaluation is only meaningful when done on **data the model has never seen**.

### 5. Deployment — Releasing the Model to the World

- Connect the model that passed evaluation to a real service.
- Examples: a user uploads a photo in an app and the model classifies it; a user browses a product in a shop and the model recommends items.
- Definition: the stage where you **make the model callable and put it into the production environment**.

### 6. Monitoring — Not the End but a New Beginning

- A model in production can lose performance over time (data drift).
- What happens here: **watch whether the model is still working well**, and raise an alarm when performance drops.
- Then you go back to stage 1 (data collection) and retrain on new data → the circle closes.

## Seeing It as One Cycle

```
   ┌──────────────────────────────────────────────┐
   │                                                │
   ▼                                                │
[Data Collection] → [Data Preparation] → [Model Training] → [Model Evaluation]
                                                     │
                                                     ▼
                              [Monitoring] ◄──────── [Deployment]
                                  │
                                  └─ On detecting performance degradation, back to data collection
```

- The key point is that **this flow does not run in one direction only**.
- If evaluation shows poor performance → go back to data preparation or training.
- If monitoring finds a problem → go back to the beginning.
- ML is inherently **iterative and cyclical**.

> 🎯 **Scenario**: "The click-through rate of a recommendation model deployed 6 months ago keeps dropping. What should you do?" → This is a case where monitoring has detected performance degradation. The correct answer is to collect the latest data again and retrain the model, in other words to go around the lifecycle once more.

Tomorrow we take a deep look at "data" itself, the fuel of this lifecycle. We will cover the difference between structured and unstructured data, why data is split into three sets, and why data quality determines everything.

## 📖 Glossary

- **ML lifecycle**: The repeating loop in which you collect data, build and deploy a model, monitor it, and then return to the data.
- **Data drift**: The phenomenon where the nature of real data changes over time, so a model trained on old data fits less and less.
- **Data cleaning**: Fixing missing values, duplicates, typos, and inconsistent formats to make the data usable.
- **Training**: The process of feeding data to an algorithm so that it finds the rules inside the data on its own.
- **Trained model**: The output of training that is now ready to be used for predictions.
- **Test data**: Data that is held back and never used for training. It is used to measure the model's real ability.
- **Overfitting**: A state in which the model has memorized the training data, so it does well on that data but poorly on new data.
- **Deployment**: Putting the model you built into a form that can be called from a real service.
- **Monitoring**: Continuously watching whether the production model still predicts well, and alerting when it gets worse.
- **Garbage In, Garbage Out**: Bad data in means bad results out. A maxim that stresses the importance of data quality.

## 📝 Practice Questions

**Question 1.** In the ML lifecycle, which stage must you go through right after collecting data and before training the model?

A) Model deployment  
B) Data preparation (cleaning and transformation)  
C) Monitoring  
D) Model evaluation  

**Answer: B**  
Explanation: Real-world raw data is messy, with missing values, duplicates, and inconsistent formats, so before training you must go through the data preparation stage, which cleans the data and shapes it into a form that can be learned from. Deployment and monitoring come after training and evaluation, and evaluation is performed after training, so it is not the stage right before training.

---

**Question 2.** What is the main reason the ML lifecycle is seen as a cycle rather than a straight line that ends in one direction?

A) Once a model is deployed, it stays accurate forever  
B) Over time the data distribution changes (drift) and the model goes stale, so retraining is needed  
C) Because algorithms are reinvented every time  
D) Because the deployment stage takes the longest  

**Answer: B**  
Explanation: The distribution of real-world data changes over time (data drift), and a model built from the data available at training time gradually drifts away from reality. That is why, when monitoring detects performance degradation, a cycle of collecting data again and retraining is needed. A is wrong because a model does not stay accurate forever, and C and D have nothing to do with the fundamental reason for the cycle.

---

**Question 3.** Which data is most appropriate to use when measuring performance in the model evaluation stage?

A) The data used for training  
B) Data that was not used for training and that the model is seeing for the first time  
C) Raw data that has not been cleaned yet  
D) Only data collected after deployment  

**Answer: B**  
Explanation: Since it is a given that the model does well on its training data (it has already seen it), real ability must be measured on data that was not used for training and that the model sees for the first time. If you evaluate only on training data, you cannot tell whether the model memorized the answers or truly generalized. Uncleaned raw data is unsuitable for evaluation, and evaluation is performed before deployment.

---

**Question 4.** Which stage of the ML lifecycle does the maxim "Garbage In, Garbage Out" emphasize?

A) Deployment  
B) Monitoring  
C) Data collection and preparation (data quality)  
D) Model evaluation  

**Answer: C**  
Explanation: The maxim means that if the quality of the input data is poor, the result (the model) will be poor no matter how good the algorithm is, so it stresses the importance of the stages that collect and clean the data. Deployment, monitoring, and evaluation come after data quality has been secured, so they are not the direct target of this maxim.

---

**Question 5.** The accuracy of a model deployed 6 months ago keeps dropping in production. From the ML lifecycle perspective, what is the most appropriate response?

A) Immediately discard the model and stop using ML  
B) Do nothing; the model will recover on its own over time  
C) This is performance degradation detected by monitoring, so collect the latest data and retrain  
D) Only re-check the accuracy on the training data  

**Answer: C**  
Explanation: Performance degradation in production is the signal that the monitoring stage is meant to catch, and data drift is the likely cause. The standard approach is therefore to go around the lifecycle once more: collect the latest data and retrain. B is wrong because a model does not recover on its own, and D is also inappropriate because accuracy on the training data has nothing to do with the current production problem.

---
