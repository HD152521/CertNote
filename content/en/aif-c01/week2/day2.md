# Day 2 - Data: Structured vs Unstructured, Data Splitting, and the Power of Quality

The fuel of ML is data. The entire lifecycle we saw yesterday ultimately depends on "what data we have and how we handle it." So today we tackle data itself head-on. We'll organize what kinds of data exist (structured/unstructured), why we don't use data as one chunk but split it into three pieces (training/validation/test), and why "data quality" determines the fate of a model.

These three topics appear frequently in AIF-C01, both directly and in scenario form.

## Structured Data vs Unstructured Data

The most basic way to divide data is whether it has a predefined structure.

| Category | Structured Data | Unstructured Data |
|----------|-----------------|-------------------|
| Structure | Organized in rows and columns (table form) | No fixed table structure |
| Examples | Excel tables, database tables, CSV | Images, audio, video, free text |
| Handling | Relatively easy (already numeric/categorical) | Difficult (conversion to numbers needed) |
| Proportion | A portion of all data | Most of the world's data |

Structured data is like thinking of a table with fixed columns like "Customer ID, Age, Purchase Amount." Unstructured data, on the other hand, like a single photo, audio recording, or a tweet, has **no fixed columns**.

> 💡 **Related Theory**: One more thing to know is **semi-structured data (Semi-structured)**. This includes data like JSON, XML, or log files that aren't complete tables but have some structure through tags or keys. For the exam, it's enough to know the two extremes of "structured ↔ unstructured" and that semi-structured exists in between.

> 📚 **Example**: A bank's transaction history (date, amount, account number) is typical structured data. Meanwhile, call center audio recordings or free-form customer complaints are unstructured data. Deep learning and generative AI particularly shine in extracting meaning from unstructured data.

## Why We Split Data Into Three Pieces

In ML, once we've collected data, we don't use all of it for training. We typically divide it into three bundles: **Training / Validation / Test**. Why split at all? In one word: **"to take a fair test"**.

| Dataset | Role | Analogy |
|---------|------|---------|
| Training | The model uses this to learn patterns | Studying with textbooks |
| Validation | Mid-training to adjust and check settings | Checking with practice exams |
| Test | Final performance measurement taken once | The real standardized test |

If a student previewed exam questions before studying, that test score wouldn't show their true ability. Similarly, if we measure model performance using data it trained on, it's just "regurgitating what it memorized"—meaningless. That's why **we never use test data for training and keep it hidden until the end**.

> 💡 **Related Theory**: The difference between validation and test data is easy to confuse. Validation data is used during training to check "is this setting good?" and adjust the model (practice exams), while test data is used after all adjustments are complete to measure final performance just once (the real test). A typical split ratio is about 60-80% training, 10-20% validation, and 10-20% test (there's no fixed answer).

> ⚠️ **Pitfall**: When test data accidentally gets mixed into training data, it's called **data leakage**. This makes evaluation scores unrealistically high, and results in a terrible model in actual operation. Cleanly separating the three sets is the first condition for fair evaluation.

## Data Quality — What Determines a Model's Fate

The adage "Garbage In, Garbage Out" we saw yesterday takes on full significance here. No matter how sophisticated the algorithm, **you cannot build a good model with bad data**. Data quality is usually evaluated across several dimensions.

| Quality Dimension | Meaning | What Happens When Poor |
|-------------------|---------|------------------------|
| Accuracy | Do values match reality? | Typos and errors get learned, creating wrong patterns |
| Completeness | Are there no missing values? | Many blanks distort patterns |
| Consistency | Are formats and units unified? | Mixing "kg" and "g" creates confusion |
| Timeliness | Is it recent data? | Old data diverges from reality |
| Representativeness | Does it broadly reflect reality? | Creates a biased model |

The last one, "representativeness," is particularly important and stressed on the exam. If you train a facial recognition model only on photos of one race, it won't recognize faces of other races well. If data doesn't represent reality broadly, the model becomes **biased**.

> 💡 **Related Theory**: Data bias is a core topic in Responsible AI. Most model bias comes from data—if data is skewed toward one side, the model's decisions will also be skewed. That's why "collecting diverse and representative data" is not just a performance issue but also a fairness and ethics issue.

> 🎯 **Scenario**: "We built a model to evaluate job applications, but it was trained on data where most past hires were a particular gender. What problem arises?" → The data lacks representativeness and fairness, so the model learns and reproduces the past bias. This is a classic failure of data quality (especially representativeness).

## Data Quantity and Balance

Alongside quality, **quantity and balance** matter too. Generally, the more data, the more diverse patterns a model can learn. Also, in classification problems, **class balance** is important. For example, in fraud detection where normal transactions are 99.9% and fraud is 0.1%, if one side is extremely scarce, the model falls into a trap where just answering "all normal" appears "correct" 99.9% of the time.

> ⚠️ **Pitfall**: In such **imbalanced data**, simple accuracy is nearly meaningless. A model that just answers "all normal" also gets 99.9% accuracy, but can't catch any of the fraud it should detect. That's why metrics beyond accuracy (precision and recall) are needed, which we'll cover on Day 3 tomorrow.

## Wrapping Up

Today's core points are three. First, data divides into **structured (table form) and unstructured (images, audio, text)**, and most of the world's data is unstructured. Second, data must be **split into training, validation, and test** to ensure fair evaluation, and we must prevent data leakage where test data gets mixed into training. Third, **data quality** (accuracy, completeness, consistency, timeliness, and representativeness) determines a model's fate, and especially, lack of representativeness leads to bias.

Tomorrow, we'll cover how to measure whether models built with this prepared data are "well-made"—accuracy, precision, recall, overfitting, and underfitting.

---

## 📝 연습 문제

**문제 1.** 다음 중 비정형 데이터(Unstructured Data)에 해당하는 것은?

A) Rows and columns organized in a customer database table  
B) Transaction history CSV consisting of date, amount, and account number  
C) Customer-left free-form voice call recording  
D) Excel spreadsheet with Age and Gender columns  

**정답: C**  
해설: Voice call recordings are unstructured data with no fixed row-column structure. Database tables, transaction history CSV, and Excel spreadsheets with defined columns are all structured data organized in rows and columns. Unstructured data requires additional processing to convert to numbers.

---

**문제 2.** 데이터를 학습용·검증용·테스트용으로 나누는 가장 근본적인 이유는?

A) To reduce data storage costs  
B) To fairly evaluate performance on data not used in training  
C) To speed up model training  
D) To encrypt the data  

**정답: B**  
해설: If we measure model performance on data it trained on, it's just "answering what it memorized," so we can't know its true ability. Therefore, evaluation on unseen data (test set) lets us fairly know the true performance on new data. Storage costs, training speed, and encryption are unrelated to data splitting's purpose.

---

**문제 3.** 테스트용으로 따로 떼어 둔 데이터가 학습 데이터에 섞여 들어가 평가 점수가 비현실적으로 높게 나오는 현상을 무엇이라 하는가?

A) Data Drift  
B) Data Leakage  
C) Underfitting  
D) Class Imbalance  

**정답: B**  
해설: When test data that shouldn't be used in training accidentally gets mixed in during training, it's called data leakage. In this case, evaluation scores become inflated, diverging greatly from actual operational performance. Data drift is distribution change over time, underfitting is insufficient training, and class imbalance is skewed class ratios—all different concepts.

---

**문제 4.** 얼굴 인식 모델을 특정 인종의 사진으로만 학습시켰더니 다른 인종 얼굴을 잘 인식하지 못했다. 이는 데이터 품질의 어떤 측면이 부족했기 때문인가?

A) Timeliness  
B) Consistency  
C) Representativeness  
D) Storage capacity  

**정답: C**  
해설: When training data doesn't broadly represent diverse subjects in reality (lack of representativeness), the model makes biased judgments about subjects not included in the data. Timeliness means data's recency, consistency means format and unit unification—neither is the cause here. Storage capacity is not a quality dimension.

---

**문제 5.** 정상 거래 99.9%, 사기 거래 0.1%인 데이터로 사기 탐지 모델을 평가할 때, 단순 정확도(Accuracy)만 보면 안 되는 이유로 가장 적절한 것은?

A) Because accuracy always comes out as 0  
B) Because just answering "all normal" yields 99.9% accuracy, potentially leading to misinterpreting a model that can't detect fraud as good  
C) Because the data is structured so accuracy cannot be calculated  
D) Because fraud data is unstructured  

**정답: B**  
해설: With extremely imbalanced classes, an even meaningless model that always answers the majority class (normal) gets very high accuracy. In this case, even if it completely fails to detect the minority class (fraud) it should catch, accuracy still appears high, leading to incorrect model evaluation. That's why additional metrics like precision and recall are needed.

---
