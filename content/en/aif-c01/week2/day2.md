# Day 2 - Data: Structured vs Unstructured, Splitting Data, and the Power of Quality

## 📌 Key Takeaways

- Data divides into **structured (tabular) and unstructured (images, audio, text)**, and most of the world's data is unstructured.
- There is only one reason to **split data into training/validation/test sets**: **fair evaluation**. The test set stays hidden until the very end.
- **Data leakage**, where test data gets mixed into training, inflates scores and then collapses in production.
- The 5 axes of **data quality**: accuracy, completeness, consistency, timeliness, and **representativeness**. Poor representativeness leads directly to **bias**.
- With **class imbalance**, plain accuracy is meaningless. A model that just answers "all normal" scores 99.9%.

## Structured Data vs Unstructured Data

The most basic way to categorize data is whether it has a fixed structure.

| Category | Structured data | Unstructured data |
|------|------------------------|----------------------------|
| Structure | Organized in rows and columns (tabular) | No fixed table structure |
| Examples | Excel sheets, database tables, CSV | Images, audio, video, free text |
| Handling | Relatively easy (already numbers/categories) | Hard (must be converted to numbers) |
| Share | A portion of all data | Most of the world's data |

- Structured: a **table with fixed columns**, like "customer ID, age, purchase amount."
- Unstructured: a single photo, an audio recording, or one line of a tweet, where **there are no fixed columns**.

There is also **semi-structured data**. JSON, XML, and log files are not full tables, but they carry some structure such as tags and keys. For the exam it is enough to know the two extremes, "structured vs unstructured," and that semi-structured sits in between.

A bank's transaction history (date, amount, account number) is classic structured data. A call-center recording or a free-form complaint written by a customer is unstructured data. Extracting meaning from unstructured data is exactly where deep learning and generative AI shine.

## Why Split Data into Three Pieces

You don't use all the data you collect for training. In a word, it is **"to take a fair exam."**

| Dataset | Role | Analogy |
|---------|------|------|
| Training | Used by the model to learn patterns | Studying from the textbook |
| Validation | Used mid-training to tune and check settings | Checking with a practice test |
| Test | Used once to measure final performance | The real exam |

- If a student saw the exam questions in advance, the score wouldn't show real ability.
- Likewise, measuring a model on the data it trained on only shows **"it repeated what it memorized"**, which is meaningless.
- That is why **test data is never used for training and is kept hidden until the end**.

The difference between validation and test is easy to confuse. Validation data is used during training to ask "is this setting good?" and to tune the model (the practice test). Test data is used only once, after all tuning is finished, to measure final ability (the real exam). Typical split ratios are about 60-80% training, 10-20% validation, and 10-20% test (there is no fixed right answer).

When test data gets mixed into training data, it is called **data leakage**. The evaluation score then comes out unrealistically high, and you end up with a model that performs poorly in actual operation. Keeping the three sets cleanly separated is the first condition of fair evaluation.

## Data Quality - What Decides a Model's Fate

"Garbage In, Garbage Out" - no matter how sophisticated the algorithm, **you can't build a good model from bad data**.

| Quality dimension | Meaning | What happens when it's poor |
|----------|------|------------------|
| Accuracy | Do the values match reality? | Typos and errors get learned, producing wrong patterns |
| Completeness | Are there missing values? | Many blanks distort patterns |
| Consistency | Are formats and units uniform? | Mixing "kg" and "g" causes confusion |
| Timeliness | Is the data up to date? | Stale data drifts from reality |
| Representativeness | Does it reflect reality evenly? | A biased model results |

- **Representativeness** is especially important and is emphasized on the exam.
- Example: if a face recognition model is trained only on photos of one ethnicity, it recognizes faces of other ethnicities poorly.
- When data doesn't capture reality evenly, the model ends up with **bias**.

Data bias is a core topic in Responsible AI. A model's bias mostly comes from its data. If the data is skewed to one side, the model's judgments are skewed too. So "collecting diverse and representative data" is not just a performance issue; it is also a fairness and ethics issue.

> 🎯 **Scenario**: "We built a model to evaluate job applications, but trained it on data where past hires were mostly one gender. What problem arises?" → The data lacks representativeness and fairness, so the model learns and reproduces past bias as-is. This is a textbook failure of data quality (especially representativeness).

## Data Quantity and Balance

- Generally, **the more data you have**, the more varied patterns the model can learn.
- For classification problems, **class balance** matters.
- Example: in fraud detection with 99.9% normal / 0.1% fraud, the model falls into the **trap of looking 99.9% "accurate" even when it answers "all normal"**.

> ⚠️ **Pitfall**: With such **imbalanced data**, plain accuracy is almost meaningless. A model that answers "all normal" gets 99.9% accuracy but catches none of the fraud it was supposed to catch. That is why metrics beyond accuracy (precision and recall) are needed, which we cover tomorrow in Day 3.

### Seeing the Imbalance Trap in Numbers

Suppose a model answers "all normal" on a dataset with 10 fraud cases (0.1%) out of 10,000 transactions.

| Item | Calculation | Value |
|------|------|-----|
| Correct count | 9,990 normal cases called normal | 9,990 |
| Accuracy | 9,990 ÷ 10,000 | **99.9%** |
| Fraud caught | 0 of 10 | **0%** |

- Accuracy is dragged along by "how well you got the majority right." The rarer the thing you are looking for, the less accuracy tells you about it.
- There are two responses. **Change the metric** (recall and precision, which you learn tomorrow). And **fix the data**: collect more examples of the rare class, or rebalance by raising the share of the rare class in the training data or reducing the common class.

## Data Types the Exam Guide Talks About

Besides structured/unstructured, the exam guide names data along several other axes. Because the axes differ, **one dataset can carry several names.**

| Type | What it looks like | Example | What to know |
|------|--------|-----|-----------|
| Labeled | Each input comes with an answer | Reviews marked "positive/negative" | Needed for supervised learning. Creating it takes human effort |
| Unlabeled | Inputs only | Raw review text piled up | Easy to obtain. Used for unsupervised learning |
| Tabular | Row = one record, column = one feature | Customer table | The typical structured data |
| Time-series | Values recorded in time order | Daily sales, sensor temperature | **The order itself is information** |
| Image | A grid of pixels | Product photos, X-rays | Unstructured. Mostly handled with deep learning |
| Text | A sequence of characters | Inquiries, contracts | Unstructured. The subject of natural language processing |

- They can be combined, as in "labeled images" or "unlabeled text." Data that is both structured and time-series (a daily sales table) is also common.

> ⚠️ **Pitfall**: Time-series data **must not be split by random shuffling.** If you shuffle, you can end up training on March data and testing on February data, so the model is evaluated as if it had "seen the future." Keep time order, **train on the past and test on the most recent period**, so the setup matches real usage.

## The Three Faces of Data Leakage

Leakage isn't only "test data was accidentally put into training." What they all share is one thing - **information that can't be known in production flowed into training.**

| Type | What happens | Example |
|------|------------|-----|
| Test data mixed in | Evaluation data goes straight into training | Trained on the entire dataset before splitting |
| Duplicates | The same record exists in both training and test | One customer's same order record stored twice and split across both |
| Features that reveal the answer | The input contains a value that only exists **after** the outcome | Predicting "refund or not" while a feature holds "refund processed date" |

- All three show the same symptom: **the test score is suspiciously high, and the real service never reaches that score.**
- The third is the hardest to find. The check question is "do we really know this value **at the moment of prediction**?"

## Quality Problems: From Symptom to Cause

| Symptom | Quality dimension to suspect | What to fix |
|-----------|---------------|---------|
| Predictions are badly wrong only for certain regions or age groups | Representativeness | Collect more data for that group |
| Weight predictions are off by 1,000x for some records | Consistency | Unify units and formats, such as kg and g |
| A model that was accurate last year is off this year | Timeliness | Retrain on recent data |
| The age column is about half empty | Completeness | Fill in blanks or exclude those records |
| The same photo is tagged both "dog" and "cat" | Accuracy (label error) | Re-audit the labels |
| It catches none of the rare cases | Balance | Reinforce the rare class and change the metric |

- In the Responsible AI domain, dataset characteristics are also asked about: **inclusion, diversity, curated sources, and balance**. Today's representativeness and balance are the foundation for that.
- AWS has **Amazon SageMaker Clarify**, which measures before training whether data is skewed toward certain groups (covered in Week 5).

## Clearing Up Common Misconceptions

- **"More data is always better"** → Collecting more skewed data only entrenches the bias. **Whether it covers things evenly** comes before quantity.
- **"If the test score is bad, just fix things and measure again on the same test data"** → The more you repeat, the more you fit to the test data. Do tuning with validation data, and use test data last.
- **"Unstructured data can't be used for machine learning"** → It just needs an extra step to convert it to numbers. It is actually where deep learning does best.
- **"Structured data has no quality concerns"** → Even when neatly in a table, values can be wrong, missing, or skewed to one side. Structure and quality are separate matters.
- **"Validation data and test data are the same thing"** → Validation is used for choosing; test is used once, after all choices are made.

Tomorrow we look at how to measure how well a model built from this prepared data performs: accuracy, precision, recall, and overfitting and underfitting.

## 📖 Glossary

- **Structured data**: Data in a table with fixed rows and columns. Excel, DB tables, and CSV are typical.
- **Unstructured data**: Data that is hard to fit into table cells. Photos, audio, video, free-form text, and so on.
- **Semi-structured data**: Data that isn't a full table but has some structure such as tags or keys. JSON, XML, log files.
- **Training data**: Data the model studies from. Equivalent to the textbook.
- **Validation data**: Data used during training to check "is this setting OK?" Equivalent to the practice test.
- **Test data**: Data used just once, after all tuning is done, to measure final ability. Equivalent to the real exam.
- **Data leakage**: An incident where test data that should have stayed hidden gets mixed into training and inflates the score.
- **Representativeness**: How evenly the data captures the various cases of reality. When lacking, the model skews to one side.
- **Bias**: A state where a model's judgments skew toward a particular group or direction. Mostly comes from data.
- **Class imbalance**: A state where one class among the classification targets is overwhelmingly common and another is extremely rare. It makes accuracy untrustworthy.

## 📝 Practice Questions

**Question 1.** Which of the following is unstructured data?

A) A customer database table organized in rows and columns  
B) A transaction-history CSV made of date, amount, and account number  
C) A free-form voice call recording left by a customer  
D) An Excel sheet with age and gender columns  

**Answer: C**  
Explanation: A voice call recording has no fixed row/column structure, so it is unstructured data. A database table, a transaction CSV, and an Excel sheet with defined columns are all structured data organized in rows and columns. A hallmark of unstructured data is that it needs extra processing to be converted into numbers.

---

**Question 2.** What is the most fundamental reason to split data into training, validation, and test sets?

A) To reduce data storage costs  
B) To evaluate performance fairly with data not used for training  
C) To speed up model training  
D) To encrypt the data  

**Answer: B**  
Explanation: Measuring a model on the data it trained on is like "repeating what it memorized," so you can't tell its real ability. Evaluating with data not used in training (the test set) is what fairly reveals true performance on unseen data. Storage cost, training speed, and encryption have nothing to do with the purpose of splitting data.

---

**Question 3.** What is it called when data set aside for testing gets mixed into the training data, producing unrealistically high evaluation scores?

A) Data Drift  
B) Data Leakage  
C) Underfitting  
D) Class Imbalance  

**Answer: B**  
Explanation: Test data that must not be used for training getting mixed into the training process is called data leakage, and it inflates evaluation scores so they diverge sharply from real operating performance. Data drift is a distribution change over time, underfitting is insufficient learning, and class imbalance is a skewed class ratio; all are different concepts.

---

**Question 4.** A face recognition model was trained only on photos of one ethnicity and then recognized faces of other ethnicities poorly. Which aspect of data quality was lacking?

A) Timeliness  
B) Consistency  
C) Representativeness  
D) Storage capacity  

**Answer: C**  
Explanation: When training data doesn't evenly capture the diverse subjects of reality (lack of representativeness), the model makes biased judgments about subjects not in the data. Timeliness is how current the data is and consistency is uniformity of formats and units; neither is the cause in this case. Storage capacity is not a quality dimension.

---

**Question 5.** When evaluating a fraud detection model on data that is 99.9% normal transactions and 0.1% fraudulent transactions, what is the best reason not to rely on plain accuracy alone?

A) Accuracy always comes out as 0  
B) Answering "all normal" gives 99.9% accuracy, so a model that catches no fraud can be mistaken for a good one  
C) The data is structured, so accuracy can't be calculated  
D) The fraud data is unstructured  

**Answer: B**  
Explanation: When classes are extremely imbalanced, even a meaningless model that always answers the majority class (normal) gets very high accuracy. Even if it detects none of the minority class (fraud) it was supposed to catch, accuracy still looks high, leading to a wrong assessment of the model. That is why additional metrics such as precision and recall are needed.

---
