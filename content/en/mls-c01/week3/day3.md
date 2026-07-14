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

## 📝 연습 문제

**문제 1.** 시(hour) 특성에서 23시와 0시를 모델이 인접하게 인식하도록 만드는 가장 적절한 변환은?

A) Min-Max 정규화  
B) 사인/코사인 변환  
C) One-Hot Encoding  
D) 로그 변환  

**정답: B**  
해설: 시간은 주기형 변수라 정수로는 23시와 0시가 멀어 보인다. 사인과 코사인 두 축으로 단위원에 매핑하면 23시와 0시가 인접한 좌표를 가져 주기적 거리가 보존된다. 정규화(A)·로그(D)는 단조 변환이라 주기성을 살리지 못하고, One-Hot(C)은 인접성 정보를 버린다.

---

**문제 2.** 문서 분류에서 "the", "is" 같이 모든 문서에 흔한 단어의 영향을 줄이고 변별력 있는 단어를 부각하려 한다. 가장 적절한 텍스트 벡터화 기법은?

A) TF-IDF  
B) 단순 Bag of Words 빈도  
C) 원-핫 인코딩  
D) Min-Max 정규화  

**정답: A**  
해설: TF-IDF의 IDF 항은 여러 문서에 흔히 등장하는 단어의 가중치를 낮춰(log가 0에 수렴) 변별력 있는 희귀 단어를 부각한다. 단순 BoW(B)는 빈도만 보아 흔한 단어를 과대평가한다. 원-핫(C)·정규화(D)는 텍스트 빈도 가중 기법이 아니다.

---

**문제 3.** 사전(vocabulary)을 미리 만들 수 없고 운영 중 새로운 범주가 계속 등장하는 스트리밍 환경에서 고차원 범주형을 고정 메모리로 처리하려 한다. 가장 적합한 기법은?

A) One-Hot Encoding  
B) Feature Hashing (해싱 트릭)  
C) Ordinal Encoding  
D) 표준화  

**정답: B**  
해설: 해싱 트릭은 해시 함수로 범주를 고정 크기 벡터에 매핑하므로 사전이 필요 없고 메모리가 고정되어 미지의 범주·스트리밍에 강하다(대가는 충돌). One-Hot(A)은 새 범주마다 차원이 늘고 사전이 필요하며, Ordinal(C)은 사전 매핑이 필요하고, 표준화(D)는 범주형 인코딩이 아니다.

---

**문제 4.** 다음 중 날짜·시간 컬럼의 특성 공학으로 **부적절한** 것은?

A) 요일(dayofweek), 시(hour) 등 성분으로 분해한다  
B) 주말 여부(is_weekend) 같은 플래그를 만든다  
C) 타임스탬프 원본 문자열을 그대로 모델 입력으로 넣는다  
D) 주기형 변수에 사인/코사인 변환을 적용한다  

**정답: C**  
해설: 원본 타임스탬프 문자열은 모델이 의미를 읽지 못하므로 그대로 넣는 것은 부적절하다. 성분 분해(A), 플래그 생성(B), 주기형 sin/cos 변환(D)은 모두 날짜를 의미 있는 수치 피처로 바꾸는 표준 기법이다.

---

**문제 5.** 수만 개의 고유 사용자 ID를 딥러닝 추천 모델에 입력하려 한다. 의미적 유사성까지 학습하면서 차원을 통제하는 가장 적절한 방법은?

A) One-Hot Encoding으로 수만 차원 생성  
B) 사용자 ID를 그대로 정수로 입력  
C) 사용자 ID를 삭제  
D) 임베딩 레이어로 저차원 밀집 벡터 학습  

**정답: D**  
해설: 임베딩 레이어는 각 사용자 ID를 저차원 밀집 벡터로 학습해 비슷하게 행동하는 사용자끼리 벡터 공간에서 가까워지므로, 차원을 통제하면서 의미적 유사성을 포착한다. One-Hot(A)은 차원이 폭발하고, 정수 그대로(B)는 가짜 순서를 부여하며, 삭제(C)는 중요한 신호를 버린다.

---
