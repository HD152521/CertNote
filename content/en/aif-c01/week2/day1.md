# Day 1 - ML Lifecycle Overview: One Complete Cycle from Data to Operations

A machine learning (ML) model is not "build once and done." A good model, like a living product, **is born, learns, is evaluated, goes into the world, and continues to be monitored**. This entire flow is called the ML Lifecycle. The AIF-C01 exam does not expect you to code models directly. Instead, it requires you to clearly understand "what stages does the journey from data to operations involve, and what is each stage responsible for?"

Today we organize the six stages of the ML lifecycle—Data Collection → Data Preparation → Model Training → Model Evaluation → Deployment → Monitoring—into one circular diagram.

## Why Call It a "Lifecycle"?

Software development typically follows a relatively linear flow: "requirements → design → implementation → deployment." ML, however, is different. ML's output (a model) **learns patterns from data**, so when data changes, the model becomes outdated. That's why it's not a straight line that ends after one pass, but rather a **loop that continuously repeats**.

> 💡 **Related Theory**: The core reason the ML lifecycle has a circular structure is "Data Drift." The distribution of data in the world changes over time (e.g., last year's shopping patterns ≠ this year's shopping patterns). A model built from training data becomes misaligned with reality over time, making continuous cycles of data collection and retraining necessary.

## Six Stages at a Glance

| Stage | One-Line Definition | Key Question |
|-------|---------------------|--------------|
| Data Collection | Gather raw data suited to the problem | "What data do we need?" |
| Data Preparation | Clean the data and transform it into a learnable form | "Is the data clean and usable?" |
| Model Training | The algorithm learns patterns from the data | "Did the model learn the patterns well?" |
| Model Evaluation | Measure whether the model really predicts well | "Does it generalize to unseen data?" |
| Deployment | Export the model so it can be used in real services | "Can users actually use it?" |
| Monitoring | Watch whether model performance degrades during operation | "Is it still working well?" |

The order in this table is worth memorizing. When the exam asks "Can we just train the model right after collecting data?", you should recognize that **the middle 'preparation' stage is missing**.

## Diving Into Each Stage

### 1. Data Collection — The Starting Point of Everything

A model cannot create what it has never seen. A model that has never seen a single cat photo cannot recognize cats. So the first stage is **gathering data suited to the problem**. Data comes from various sources: databases, logs, sensors, external APIs, user input, and more.

> 📚 **Example**: To build a model that filters spam emails, you must first gather a large amount of "emails classified as spam" and "legitimate emails." If you don't collect both types sufficiently, nothing in the subsequent stages will be meaningful.

### 2. Data Preparation — The Most Time-Consuming Stage

Real-world data is messy. Values might be missing, duplicated, in various formats, or contain typos. In the data preparation stage, we **clean** it, fill in missing values, standardize formats, and transform it into numerical forms the model can understand. Additionally, at this stage we **split the data into training, validation, and test sets** (covered in detail on Day 2).

> 💡 **Related Theory**: It's said that 70-80% of ML project time in practice is spent on this data preparation. The adage "Garbage In, Garbage Out" drives home the essence of ML—no matter how good the algorithm, you cannot build a good model with bad data.

### 3. Model Training — The Stage of Learning Patterns

When we feed prepared data into an algorithm, the algorithm **finds patterns (rules) in the data by itself**. This is "training." For example, a house price prediction model learns from data that "the wider the area and the closer to the station, the more expensive." After training, we have a "trained model" in our hands.

### 4. Model Evaluation — Measuring True Performance

It's natural that the model fits well on training data (we've already seen it). What really matters is **whether it also performs well on unseen data**. So we measure the model's performance using "test data" that was not used in training. This is where metrics like accuracy come in (Day 3's topic).

> ⚠️ **Pitfall**: Saying "the model is 99% accurate on training data, so it's good" is risky. A model that merely memorizes training data might perform terribly on new data (overfitting). Evaluation is meaningful only if it's done **on unseen data**.

### 5. Deployment — Taking the Model to the World

The model that passes evaluation is connected to a real service. When users upload a photo in an app, the model classifies it; when they view products in a mall, the model recommends them. Deployment is the stage of "making the model callable and uploading it to the production environment."

### 6. Monitoring — Not an Ending, but a New Beginning

Deployment is not the end. A model in operation can degrade in performance over time (the data drift we saw earlier). The monitoring stage **watches to ensure the model is still working well** and raises an alert if performance drops. Then we go back to stage 1 (data collection) and retrain with new data—this is how the loop closes.

## Seeing the Complete Circular Flow

```
   ┌──────────────────────────────────────────────┐
   │                                                │
   ▼                                                │
[Data Collection] → [Data Preparation] → [Model Training] → [Model Evaluation]
                                                     │
                                                     ▼
                              [Monitoring] ◄──────── [Deployment]
                                  │
                                  └─ Return to Data Collection upon performance degradation
```

The key insight is that **this flow does not proceed in only one direction**. If evaluation shows poor performance, we go back to data preparation or training. If monitoring discovers a problem, we return to the beginning. ML is inherently iterative and circular.

> 🎯 **Scenario**: "The click-through rate of a recommendation model deployed 6 months ago is steadily declining. What should we do?" → This is a situation where monitoring has detected performance degradation. The correct answer is to recollect recent data and retrain the model—completing another cycle of the lifecycle.

## Wrapping Up

The ML lifecycle we examined today is a **circular loop** of six stages. It starts with data collection, goes through preparation, training, and evaluation, then deploys, monitors, and returns to the beginning if performance drops. The most commonly skipped stage is "data preparation," and the most frequently misunderstood point is "evaluation must be done on unseen data." Remember that ML is a circle, not a straight line—deployment is not the end.

Tomorrow we dive deeper into "data" itself, the fuel of this lifecycle. We'll cover the difference between structured and unstructured data, why we split data into sets, and why data quality determines everything.

---

## 📝 Practice Questions

**Question 1.** In the ML lifecycle, which step must be performed right after collecting data and before training a model?

A) Model Deployment  
B) Data Preparation (cleaning and transformation)  
C) Monitoring  
D) Model Evaluation  

**Answer: B**  
Explanation: Current raw data is messy due to missing values, duplicates, and format inconsistencies, so the data preparation stage of cleaning and transforming it into a learnable form must be completed before training. Deployment and monitoring are stages after training and evaluation, and evaluation occurs after training, so neither is the stage immediately before training.

---

**Question 2.** What is the main reason the ML lifecycle is viewed as a repeating cycle rather than a one-way straight line?

A) Once a model is deployed, it remains accurate forever  
B) Because data distribution changes over time (drift), causing the model to become outdated, making retraining necessary  
C) Because new algorithms are invented each time  
D) Because the deployment stage takes the longest  

**Answer: B**  
Explanation: The distribution of data in the world changes over time (data drift), and models built from training data become increasingly misaligned with reality. That's why when monitoring detects performance degradation, we need to recollect data and retrain in a circular process. A models do not remain accurate forever, so A is incorrect. C and D are unrelated to the fundamental reason for the circular nature.

---

**Question 3.** Which data is most appropriate to use when measuring performance in the model evaluation stage?

A) Data used in training  
B) Unseen data that was not used in training  
C) Raw data that has not been cleaned yet  
D) Data collected only after deployment  

**Answer: B**  
Explanation: It's natural that a model fits well on training data (since we've already seen it), so true performance must be measured on unseen data that was not used in training. Evaluating only on training data makes it impossible to distinguish between memorization and true generalization. Raw uncleaned data is unsuitable for evaluation, and evaluation is performed before deployment.

---

**Question 4.** Which stage of the ML lifecycle does the adage "Garbage In, Garbage Out" emphasize?

A) Deployment  
B) Monitoring  
C) Data Collection and Preparation (data quality)  
D) Model Evaluation  

**Answer: C**  
Explanation: This adage means that no matter how good the algorithm, poor input data quality results in poor output (model). It emphasizes the importance of the stages of collecting and cleaning data. Deployment, monitoring, and evaluation are stages after data quality is established, so they are not direct targets of this adage.

---

**Question 5.** The accuracy of a model deployed six months ago is gradually declining in production. From the ML lifecycle perspective, what is the most appropriate response?

A) Immediately discard the model and stop using ML  
B) Take no action; the model will recover automatically over time  
C) Because this is performance degradation detected by monitoring, collect recent data and retrain  
D) Simply re-check the accuracy on training data  

**Answer: C**  
Explanation: Performance degradation during operation is a signal that the monitoring stage should catch, and data drift is likely the cause. Therefore, the correct approach is to complete another cycle of the lifecycle by collecting recent data and retraining. Since the model does not recover automatically, B is incorrect. Training data accuracy is irrelevant to the current operational problem, so D is also inappropriate.

---
