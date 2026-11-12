# Day 3 - Time Series, Text Features, and High-Cardinality Categorical Handling

## 📌 Key Takeaways

- Don't feed a date in as-is; **decompose it into components** (year/month/day/day of week/hour/weekend-holiday flags, elapsed days).
- Cyclical variables (hour, day of week, month) must be mapped onto the unit circle with **two axes, sine and cosine**, so that 23:00 and 00:00 become neighbors.
- Text vectorization gains expressive power in the order **BoW → TF-IDF → embeddings**. TF-IDF suppresses common words.
- One-hot on a high-cardinality categorical explodes dimensionality. Control it with **target/frequency encoding, hashing, or embeddings**.
- Hashing needs no vocabulary, so it is **strong on unseen categories and streaming, but you accept collisions**.

## Derived Features from Dates and Times

Yesterday we covered numeric and general categorical data. Today we look at feature engineering for two specialized data types that need separate handling — **dates and times (time series)** and **text** — and at the perennial encoding problem of **high-cardinality categorical variables**. MLS-C01 often asks about this topic in the form "which transformation is appropriate for which data?"

Using a date column as-is (`2026-06-26 14:30:00`) leaves the model unable to read any meaning. A date must be **decomposed into components**.

| Derived feature | Example | Pattern captured |
|---|---|---|
| year / month / day | 2026, 6, 26 | Long-term trend, seasonality |
| dayofweek | 0 (Mon) – 6 (Sun) | Day-of-week effect |
| hour | 0 – 23 | Intra-day pattern |
| is_weekend | 0/1 | Weekend flag |
| is_holiday | 0/1 | Holiday effect |
| days_since_event | 90 | Elapsed time |
| week_of_year / quarter | 26, Q2 | Weekly and quarterly cycles |

```python
import pandas as pd

df["ts"] = pd.to_datetime(df["timestamp"])
df["month"] = df["ts"].dt.month
df["dayofweek"] = df["ts"].dt.dayofweek
df["hour"] = df["ts"].dt.hour
df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)
```

Cyclical variables hide a trap. Hour 23 and hour 0 are really 1 hour apart, but left as integers they look 23 apart. **Sine/cosine transformation** restores the circular structure.

```python
import numpy as np

df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
```

```
[Integer encoding]   0 ─ 1 ─ 2 ─ ... ─ 22 ─ 23        distance between 23 and 0 = 23 (wrong)

[sin/cos]            0:00
                  23 ╱ ╲ 1              23:00 and 00:00 are neighbors on the unit circle
                    │   │
                  18 ╲ ╱ 6              distance = short (correct)
                     12:00
```

The essence of sine/cosine encoding is to "**preserve periodic distance**." When you map hours as angles on the unit circle, 23:00 (345°) and 00:00 (0°) become adjacent on the circle, so the model treats them as close. Using sine alone creates ambiguity (12:00 and 00:00 get the same value), so sine and cosine must be used together for all 24 hours to have unique (x, y) coordinates. This technique applies to every cyclical variable, such as day of week and month.

### Features Specific to Time Series

- **Lag features**: Use past values directly as features, such as yesterday's sales or sales 7 days ago.
- **Rolling statistics**: Window statistics such as the 7-day moving average and moving standard deviation.
- **Difference**: The change from the previous day. Removes the trend to achieve stationarity.
- **Seasonal indicators**: Week of the year, quarter, promotion-period flags.

> ⚠️ **Pitfall**: Lag and rolling features are **instant leakage if data after the prediction time gets mixed in**. If a "last 7 days average" includes the prediction day itself or later values, you have trained on information that would not have been known in actual operation. Time series must also always be split in chronological order.

## Text Features: BoW, TF-IDF, Embeddings

Converting text into numeric vectors is called **vectorization**. Let's go through approaches from simplest to most sophisticated.

| Technique | Representation | Strengths | Limitations |
|---|---|---|---|
| **Bag of Words (BoW)** | Word frequency counts | Simple, fast | Ignores order/meaning, overweights common words |
| **TF-IDF** | Frequency × rarity weight | Suppresses common words | Still ignores order/meaning |
| **N-gram** | Groups of consecutive words | Captures some order | Dimensionality explosion |
| **Word Embedding** | Dense vectors (Word2Vec/GloVe) | Captures meaning and similarity | Requires a pretrained model |
| **Contextual Embedding** | BERT, etc. | Context-aware meaning | High computational cost |

TF-IDF fixes BoW's fundamental weakness. Words like "the" and "is" appear in every document and have no discriminative power, but BoW only counts frequency and so overweights them. TF-IDF **lowers the weight of words that appear in many documents**, bringing out rare but meaningful words.

```python
from sklearn.feature_extraction.text import TfidfVectorizer

vectorizer = TfidfVectorizer(
    max_features=5000,      # top 5000 words only
    ngram_range=(1, 2),     # unigrams + bigrams
    stop_words="english",   # remove stopwords
)
X_text = vectorizer.fit_transform(train_texts)
X_test_text = vectorizer.transform(test_texts)   # transform only
```

TF-IDF's IDF (inverse document frequency) = log(total number of documents / number of documents containing that word). A word that appears in every document has a ratio near 1, so its log approaches 0 and its weight vanishes, while a word appearing in only a few documents gets a large IDF. It implements the information-theoretic principle "ignore the common, highlight the rare" by multiplication. However, TF-IDF treats words independently, so it misses semantic similarity such as between "good" and "great." Embeddings overcome this by placing words in a dense vector space.

On AWS, instead of vectorizing text yourself, you can use **Amazon Comprehend** (entity, sentiment, and key-phrase extraction) or create embeddings with SageMaker's built-in **BlazingText** (a Word2Vec implementation).

### Other Things That Come Up in Text Preprocessing

- **Tokenization**: Cutting sentences into word or subword units.
- **Stopword removal**: Dropping function words such as particles in Korean or "the/is" in English.
- **Lemmatization and stemming**: Grouping "running/ran/runs" into one.
- **Lowercasing and special-character cleanup**: Prevents the same word from scattering into several forms.

> ⚠️ **Pitfall**: The vectorizer's vocabulary must also be **fit on the training set only**. Building the vocabulary with the test documents included is leakage. It is normal behavior for words seen for the first time in the test set to simply be ignored.

## High-Cardinality Categorical Handling

Categoricals with thousands to millions of unique values, such as cities, product IDs, and user IDs, explode in dimensionality if one-hot encoded. Here is a summary by strategy.

| Strategy | Method | Advantage | Drawback |
|---|---|---|---|
| **Target/frequency encoding** | Replace with the target mean or frequency | Keeps a single column | Leakage risk (target), collisions (frequency) |
| **Feature Hashing** | A hash function maps to fixed dimensions | Fixed memory, streaming-friendly | Collisions |
| **Embedding layer** | A neural network learns dense vectors | Captures semantic similarity | Needs training data and a network |
| **Group rare categories** | Merge low-frequency categories into "Other" | Simple, reduces dimensions | Information loss |

The hashing trick maps categories into a fixed-size vector with a hash function. No vocabulary has to be built in advance, so it is **strong on unseen categories and streaming data**. The price is collisions — different categories may land in the same slot.

```python
from sklearn.feature_extraction import FeatureHasher

hasher = FeatureHasher(n_features=256, input_type="string")
X_hashed = hasher.transform(df["city"].astype(str).apply(lambda x: [x]))
```

```
[One-hot]    5000 cities → 5000 columns (sparse, memory explosion)
[Hashing]    5000 cities → fixed 256 columns (accept collisions)
[Target]     5000 cities → 1 column (watch for leakage)
[Embedding]  5000 cities → 16-dimensional dense vector (obtained by learning)
```

An embedding learns a mapping from a high-dimensional sparse (one-hot) representation to a low-dimensional dense one. Each category is mapped to, say, a 16-dimensional real vector, and this vector is optimized together during model training. As a result, "**categories that behave similarly end up close in vector space**" (e.g., in a recommender system, users with similar tastes become adjacent). It is the same idea as word embeddings and is the standard in deep-learning recommendation and NLP. As a rule of thumb, the embedding dimension is often set to about the fourth root of the cardinality.

Blindly applying one-hot to a high-cardinality categorical blows up memory and, because of sparsity, makes training difficult too. When you see a description like "millions of unique values," one-hot is the wrong answer, and you should think of target encoding, hashing, and embeddings.

## Before Feeding a Time Series into a Model

Apart from derived date features, there are concepts worth knowing when handling the time series itself.

- **Trend**: A component that rises or falls over the long term.
- **Seasonality**: A component that repeats on a daily, weekly, monthly, or yearly basis.
- **Stationarity**: The property that mean and variance do not change over time. Many traditional time-series models assume it.
- **Differencing**: A transformation that takes the difference from the previous value to remove the trend and move closer to stationarity.

| Approach | Method | When |
|---|---|---|
| Convert the time series to supervised learning | Build lag/rolling features and treat it as a regression problem | When you want to use a general ML model (XGBoost, etc.) |
| Dedicated time-series model | A time-series algorithm such as DeepAR | When you train several series together and need interval forecasts |

The moment you shuffle time-series data randomly to split train/validation, you are predicting the past with the future. For time series, a **chronological split** is the rule, and cross-validation likewise slides the window from front to back.

## Example Text Processing Pipeline

Text has a long chain of transformation steps, so it is easy to get the order wrong. The typical order is as follows.

```
Raw text ─▶ Normalization (lowercasing, special-character cleanup)
         ─▶ Tokenization
         ─▶ Stopword removal
         ─▶ Lemmatization/stemming
         ─▶ Vectorization (TF-IDF or embeddings)   ← fit on the training set only
         ─▶ Dimensionality reduction (optional, SVD, etc.)
         ─▶ Model input
```

- In tasks where negation matters, such as sentiment analysis, remove the negation words from the stopword list.
- A TF-IDF result is a very sparse high-dimensional matrix, so add dimensionality reduction such as SVD if needed.
- If you use embeddings, much of this preprocessing is absorbed into the model.

## Transformation Summary by Data Type

| Data type | First transformation | Caution |
|---|---|---|
| Date/time | Component decomposition + sin/cos | Watch for time-point leakage in lag/rolling features |
| Text (short documents) | TF-IDF + n-gram | Vocabulary from the training set only |
| Text (meaning needed) | Embeddings (BlazingText, pretrained) | Computational cost |
| Low-cardinality categorical | One-Hot | Configure unknown-category handling |
| High-cardinality categorical | Target/hashing/embedding | Leakage, collisions |
| Image | Resize, normalize, augment | Preserve labels |

In the next note we look at the SageMaker tools that automate these transformations at scale — Data Wrangler, Processing Jobs, and Feature Store.

## 📖 Glossary

- **Derived feature**: A new feature computed from an original column. Date decomposition is the classic example.
- **Cyclical variable**: A variable whose end connects to its start, such as hour, day of week, or month. Needs sin/cos transformation.
- **Lag feature**: A value from a past time point brought into the current row as a feature.
- **Vectorization**: Converting non-numeric data such as text into numeric vectors.
- **Bag of Words**: The simplest text representation, which ignores word order and counts only occurrence frequency.
- **TF-IDF**: A representation that multiplies term frequency by a document-rarity weight to suppress common words.
- **Embedding**: A representation of a category or word as a low-dimensional dense vector. Obtained by learning.
- **Feature Hashing (hashing trick)**: An encoding that maps categories to fixed dimensions with a hash function. No vocabulary needed.
- **Collision**: The phenomenon of different categories being assigned to the same hash slot. The price of hashing.
- **IDF (inverse document frequency)**: A weight that grows as fewer documents contain the word. It dampens common words.

---

## 📝 Practice Questions

**Question 1.** Which transformation is MOST appropriate for making a model perceive 23:00 and 0:00 as adjacent in the hour feature?

A) Min-Max normalization  
B) Sine/cosine transformation  
C) One-Hot Encoding  
D) Log transformation  

**Answer: B**  
Explanation: Time is a cyclical variable, so as integers 23:00 and 0:00 appear far apart. Mapping to the unit circle with the two axes of sine and cosine gives 23:00 and 0:00 adjacent coordinates, preserving the cyclical distance. Normalization (A) and log (D) are monotonic transformations and cannot capture cyclicality, and One-Hot (C) discards adjacency information.

---

**Question 2.** In document classification, you want to reduce the influence of words that are common to all documents, such as "the" and "is," and emphasize discriminative words. Which text vectorization technique is MOST appropriate?

A) TF-IDF  
B) Simple Bag of Words frequency  
C) One-hot encoding  
D) Min-Max normalization  

**Answer: A**  
Explanation: The IDF term of TF-IDF lowers the weight of words that appear commonly across many documents (the log approaches 0) and emphasizes discriminative rare words. Simple BoW (B) looks only at frequency and overvalues common words. One-hot (C) and normalization (D) are not text frequency weighting techniques.

---

**Question 3.** In a streaming environment where a vocabulary cannot be built in advance and new categories keep appearing during operation, you want to handle high-dimensional categorical features with fixed memory. Which technique is MOST appropriate?

A) One-Hot Encoding  
B) Feature Hashing (hashing trick)  
C) Ordinal Encoding  
D) Standardization  

**Answer: B**  
Explanation: The hashing trick maps categories to a fixed-size vector with a hash function, so no vocabulary is needed and memory is fixed, making it robust to unseen categories and streaming (the trade-off is collisions). One-Hot (A) adds a dimension for each new category and requires a vocabulary, Ordinal (C) requires a vocabulary mapping, and standardization (D) is not categorical encoding.

---

**Question 4.** Which of the following is **INAPPROPRIATE** feature engineering for date/time columns?

A) Decompose into components such as day of week (dayofweek) and hour  
B) Create flags such as is_weekend  
C) Feed the raw timestamp string directly into the model as input  
D) Apply a sine/cosine transformation to cyclical variables  

**Answer: C**  
Explanation: A raw timestamp string has no meaning the model can read, so feeding it in as is is inappropriate. Component decomposition (A), flag creation (B), and cyclical sin/cos transformation (D) are all standard techniques for turning dates into meaningful numeric features.

---

**Question 5.** You want to feed tens of thousands of unique user IDs into a deep learning recommendation model. Which is the most appropriate method that learns even semantic similarity while controlling dimensionality?

A) Generate tens of thousands of dimensions with One-Hot Encoding  
B) Input the user ID as an integer as is  
C) Delete the user ID  
D) Learn low-dimensional dense vectors with an embedding layer  

**Answer: D**  
Explanation: An embedding layer learns each user ID as a low-dimensional dense vector so that users who behave similarly become close in vector space, capturing semantic similarity while controlling dimensionality. One-Hot (A) explodes the dimensionality, using the integer as is (B) imposes a false order, and deletion (C) discards an important signal.

---
