# Day 3 - Time Series, Text Features, and High-Cardinality Categorical Handling

Yesterday we covered numeric and general categorical data. Today we explore feature engineering for two specialized data types—**dates and times (time series)** and **text**—that require custom handling. Finally, we'll address the perpetual challenge in encoding: managing **high-cardinality categorical features** through dimensionality reduction and hashing techniques.

This topic appears frequently in MLS-C01 exams in the form "which transformation is appropriate for what data?"

## Derived Features from Dates and Times

Using a date column as-is (e.g., `2026-06-26 14:30:00`) leaves the model unable to extract meaning. The date must be **decomposed** into meaningful components.

| Derived Feature | Example | Pattern Captured |
|------|------|------|
| year / month / day | 2026, 6, 26 | Long-term trends, seasonality |
| dayofweek | 0 (Mon) – 6 (Sun) | Day-of-week effects |
| hour | 0 – 23 | Intra-day patterns |
| is_weekend | 0/1 | Weekend flag |
| is_holiday | 0/1 | Holiday effects |
| days_since_event | 90 | Elapsed time |

```python
import pandas as pd

df["ts"] = pd.to_datetime(df["timestamp"])
df["month"] = df["ts"].dt.month
df["dayofweek"] = df["ts"].dt.dayofweek
df["hour"] = df["ts"].dt.hour
df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)
```

Cyclical variables present a hidden challenge. Hour 23 and hour 0 are actually 1 hour apart, but as integers they appear 23 units away. **Sine/cosine transformation** restores the circular structure.

```python
import numpy as np

df["hour_sin"] = np.sin(2 * np.pi * df["hour"] / 24)
df["hour_cos"] = np.cos(2 * np.pi * df["hour"] / 24)
```

> 💡 **Key Theory**: The essence of sine/cosine encoding is to "preserve periodic distance." By mapping hours as angles on the unit circle, hour 23 (345°) and hour 0 (0°) become adjacent on the circle—the model now treats them as close. Using only sine creates ambiguity (hours 12 and 0 get the same value), so both sine and cosine are necessary to give all 24 hours unique (x, y) coordinates. This universal technique applies to any periodic variable (days, months, etc.).

## Text Features: BoW, TF-IDF, Embeddings

Converting text to numeric vectors is called **vectorization**. Let's review approaches from simplest to most sophisticated.

| Technique | Representation | Strengths | Limitations |
|------|------|------|------|
| **Bag of Words (BoW)** | Word frequency counts | Simple, fast | Ignores order/meaning; overweights common words |
| **TF-IDF** | Frequency × sparsity weight | Suppresses common words | Still ignores order/meaning |
| **N-gram** | Consecutive word groups | Captures some order | Dimensionality explosion |
| **Word Embedding** | Dense vectors (Word2Vec/GloVe) | Captures semantics and similarity | Requires pretrained models |
| **Contextual Embedding** | BERT, etc. | Context-aware semantics | Computationally heavy |

TF-IDF addresses BoW's fundamental weakness. Words like "the" and "is" appear in all documents but carry no discriminative signal; BoW naively overweights them by counting frequency alone. TF-IDF **reduces weights for words appearing in many documents**, elevating rare but meaningful words.

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

> 💡 **Key Theory**: TF-IDF's IDF (inverse document frequency) = log(total documents / documents containing that word). Words appearing in all documents have a ratio near 1, making their log approach 0 (weight vanishes); words appearing in few documents get large IDF. This implements an information-theoretic principle ("ignore common, highlight rare") via multiplication. However, TF-IDF treats words independently, missing semantic similarities like "good" and "great." Embeddings overcome this by placing words in dense vector space, where Word2Vec learns by predicting center words from context.

On AWS, instead of vectorizing text directly, you can use **Amazon Comprehend** (entity, sentiment, key phrase extraction) or SageMaker's built-in **BlazingText** (Word2Vec implementation) to generate embeddings.

## High-Cardinality Categorical Handling

Categories with thousands or millions of unique values—cities, product IDs, user IDs—explode in dimensionality if one-hot encoded. Here's the strategy breakdown:

| Strategy | Method | Advantage | Drawback |
|------|------|------|------|
| **Target/Frequency Encoding** | Replace with target mean or frequency | Maintains single column | Risk of leakage |
| **Feature Hashing** | Hash function maps to fixed dimensions | Fixed memory, streaming-friendly | Collision |
| **Embedding Layer** | Neural network learns dense vectors | Captures semantics | Requires training data and network |
| **Group Rare Categories** | Lump low-frequency categories into "Other" | Simple, reduces dimensions | Information loss |

The hashing trick maps categories to fixed-size vectors using a hash function. Since no vocabulary is needed upfront, it's robust to **unseen categories and streaming data**. The tradeoff is collision—different categories may hash to the same slot.

```python
from sklearn.feature_extraction import FeatureHasher

hasher = FeatureHasher(n_features=256, input_type="string")
X_hashed = hasher.transform(df["city"].astype(str).apply(lambda x: [x]))
```

> 💡 **Key Theory**: Embeddings learn a mapping from high-dimensional sparse (one-hot) to low-dimensional dense representations. Each category is mapped to, say, a 16-dimensional real vector, which is jointly optimized during model training. The result: "similar-behaving categories" cluster together in vector space (e.g., in recommendation systems, users with similar preferences become adjacent). This mirrors word embeddings and is the standard in deep learning recommendation and NLP. The embedding dimension is often chosen as the fourth root of cardinality by rule of thumb.

> ⚠️ **Pitfall**: Blindly applying one-hot encoding to high-cardinality categories causes memory explosion and makes model training difficult due to sparsity. If you see "millions of unique values," one-hot is likely wrong—think target encoding, hashing, or embeddings instead.

## Summary

Key points for specialized data feature engineering: (1) **Dates** are decomposed into components; periodicity uses sine/cosine; (2) **Text** progresses from BoW → TF-IDF → embeddings in rising complexity and expressiveness; TF-IDF suppresses common words; (3) **High-cardinality categories** use target encoding, hashing, or embeddings instead of one-hot to control dimensions.

Next, we'll see SageMaker tools that automate all these transformations at scale: Data Wrangler, Processing Jobs, and Feature Store.

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
