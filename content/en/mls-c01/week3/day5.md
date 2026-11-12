# Day 5 - Week 3 Comprehensive Review: Cleaning and Feature Engineering

## 📌 Key Takeaways

- Week 3 covered the first half of EDA — **data cleaning** and **feature engineering**. This is the core of MLS-C01 Domain 2.
- One principle runs through the whole week: **prevent data leakage**. Every transformation is **fit on the training set only**; everything else just gets `transform`.
- The second principle is **preprocessing matched to the model**. Linear models need scaling, one-hot encoding and binning; tree-based models mostly do not.
- The basics: missingness by mechanism (MCAR/MAR/MNAR), outliers by robust statistics (IQR), and duplicates cleaned before the split.
- Tool mapping: **visual preparation = Data Wrangler**, **large-scale code-based processing = Processing Job**, **feature reuse and consistency = Feature Store**.

## Flow Map: Cleaning → Feature Engineering → Tools

This week covered the first half of EDA, **data cleaning** and **feature engineering**. Both are central to MLS-C01 Domain 2 (Exploratory Data Analysis) and are the stages that most determine model performance in practice.

```text
[Raw Data]
   │
   ├─ 1) Cleaning (Day 1)
   │     Missing values: judge MCAR/MAR/MNAR → impute (mean/median/KNN/model)
   │     Outliers: detect with IQR/Z-score → delete/clip/transform/keep
   │     Duplicates & errors: clean before the split (prevent leakage)
   │
   ├─ 2) Feature Engineering (Day 2–3)
   │     Scaling: normalization/standardization/RobustScaler (not needed for trees)
   │     Encoding: Label/One-Hot/Target (decided by order and cardinality)
   │     Binning: nonlinearity and interpretability ↔ information loss
   │     Dates: component decomposition + sin/cos
   │     Text: BoW → TF-IDF → embeddings
   │     High cardinality: target/hashing/embeddings
   │
   └─ 3) AWS Tools (Day 4)
         Data Wrangler (visual) → Processing Job (scale) → Feature Store (reuse)
```

## Key Decision Points

### Missing Values: How Should You Impute?

| Situation | Recommendation |
|---|---|
| Right-skewed numeric | Median imputation |
| Symmetric numeric | Mean imputation |
| Categorical | Mode imputation |
| Strong correlation between variables | KNN or model-based |
| The missingness itself is a signal (MNAR) | Add an indicator variable |
| Missing rate is overwhelmingly high | Drop the column or keep only the flag |

### Scaling: Whether It Is Needed, by Algorithm

- **Needed**: KNN, K-means, linear/logistic regression, SVM, neural networks, PCA, Ridge/Lasso
- **Not needed**: Decision Tree, Random Forest, XGBoost, LightGBM (tree-based)
- **With many outliers**: RobustScaler

### Encoding: Decided by Order and Cardinality

```text
Is there an order?  ── Yes ──→ Ordinal/Label Encoding
        │
        └─ No ──→ Are there many unique values?
                        ├─ Few  → One-Hot
                        └─ Many → Target/Frequency/Hashing/Embedding
```

### Outliers: Detection and Treatment Are Separate

| Judgment | Treatment |
|---|---|
| Obvious data-entry error | Delete |
| You only want to reduce the extreme influence | Winsorizing (clipping) |
| Right-skewed, long-tailed distribution | Log transform |
| The outlier is the target (fraud, failure) | Keep it; approach as anomaly detection |

> 💡 **Concept**: One principle runs through this entire week: **preventing data leakage**. Imputation statistics (mean, median), scaler parameters (min/max/μ/σ), target-encoding statistics, the vocabulary of a text vectorizer — every one of these transformations must be **fit on the training data only**, and validation and test data get only `transform`. Duplicate removal belongs before the split, and time-series features must respect point-in-time. Leakage inflates offline performance unrealistically and then collapses in production; it is a trap in both exams and real work.

## Confusing Pairs Compared

| Pair | Key difference |
|---|---|
| Mean vs median imputation | Median is robust to outliers and skew |
| Z-score vs IQR | IQR is robust and needs no distribution assumption |
| Normalization vs standardization | Normalization gives a fixed [0,1] range; standardization gives mean 0 and variance 1; with outliers use RobustScaler |
| Label vs One-Hot | Ordinal → Label, nominal → One-Hot |
| One-Hot vs Target encoding | Safe for low cardinality vs compresses high cardinality (watch for leakage) |
| Target vs Hashing | Uses target information (leakage) vs no dictionary needed (collisions) |
| BoW vs TF-IDF | TF-IDF suppresses common words |
| TF-IDF vs embeddings | Treats words independently vs captures semantic similarity |
| Equal-width vs equal-frequency binning | Even value ranges vs even sample counts |
| Online vs Offline Store | Millisecond single-record inference vs bulk training reads |
| Data Wrangler vs Processing Job | Visual EDA vs code-based large-scale processing |
| Delete vs winsorizing | Discard the row vs cap it at the boundary value and keep it |

> 💡 **Concept**: Feature engineering and model selection cannot be separated. With the same data, a **linear model** needs scaling, binning and one-hot encoding to capture nonlinearity and scale explicitly, while a **tree or boosting model** needs no scaling and gains little from binning or one-hot (because trees capture nonlinearity through splits). The answer to "Which preprocessing is right?" depends on "Which model will you use?" The exam often exploits this, using the algorithm as a clue to narrow down the correct preprocessing.

## Typical Paths Where Leakage Occurs

Most questions that ask you to pick the "wrong procedure" are on this list.

| Wrong procedure | Why it is leakage | Correct approach |
|---|---|---|
| Compute the mean on all data, then split | Test statistics get mixed into training | Split first, fit only on the training set |
| Remove duplicates after the split | The same record is scattered across both sets | Clean by key before the split |
| Target-encode using all data | Answer information enters the feature | K-fold target encoding / smoothing |
| Split a time series randomly | Past is predicted using future data | Split chronologically |
| Use full-period aggregate features | Includes values after the prediction time | Point-in-time aggregation |
| Vocabulary that includes test documents | Test vocabulary is reflected in training | Fit the vectorizer on the training set only |
| Feature selection on all data | The selection itself sees the test set | Select within the training set |

## Week 3 Technique and Tool Map

| Role | Technique / tool | One line |
|---|---|---|
| Missing-value diagnosis | MCAR/MAR/MNAR | Why it is missing determines the treatment |
| Missing-value imputation | Mean, median, mode, KNN, MICE | Chosen by distribution and inter-variable relationships |
| Outlier detection | IQR, Z-score, Isolation Forest | Robust statistics are the default |
| Outlier treatment | Delete, clip, log transform, keep | Domain context decides |
| Scaling | Standard, MinMax, Robust, MaxAbs | Not needed for tree-based models |
| Encoding | Label, One-Hot, Ordinal, Target, Frequency | Decided by order and cardinality |
| High cardinality | Hashing, Embedding | No dictionary needed (collisions) / captures meaning |
| Binning | Equal-width, equal-frequency, domain binning | Nonlinearity ↔ information loss |
| Dates | Component decomposition, sin/cos, lag/rolling | Watch for point-in-time leakage |
| Text | BoW, TF-IDF, N-gram, embeddings | Steps of expressiveness and cost |
| NLP services | Amazon Comprehend, BlazingText | Managed extraction / built-in embeddings |
| Visual preparation | SageMaker Data Wrangler | 300+ transforms, quality reports, flow export |
| Large-scale processing | SageMaker Processing Job | Distributed container execution, auto-termination |
| Feature reuse | SageMaker Feature Store | Online/Offline, point-in-time |
| Bias diagnosis | SageMaker Clarify | Data and model bias, and explainability |

## Week 3 Wrong-Answer Notes

- **Fitting the scaler or imputer on all data** — the most common leakage. Fit on the training set only.
- **Choosing scaling as the answer for a tree model** — trees are invariant to monotonic transformations.
- **Label Encoding for nominal data** — it creates an order that does not exist and misleads linear models.
- **One-Hot for high cardinality** — dimensionality explosion. Look at target encoding, hashing and embeddings.
- **Removing outliers unconditionally** — in fraud and failure detection, they are the correct signal.
- **Removing duplicates after the split** — leakage has already happened.
- **Splitting a time series randomly** — the future ends up predicting the past.
- **Full-period aggregate features** — information from after the prediction time gets mixed in.
- **A vocabulary that includes test documents** — the vectorizer too must be fit on the training set only.
- **Confusing Online and Offline Store** — single-record low latency is Online; bulk training is Offline.

## Self-Check

Answer these in your head.

1. If you simply impute missing values in right-skewed income, mean or median? → **Median**
2. Does XGBoost need feature scaling? → **No**
3. Why is one-hot unsuitable for postal codes (thousands of values)? → **Dimensionality explosion**
4. What makes 23:00 and 0:00 adjacent? → **Sine/cosine transform**
5. What happens if you fit the scaler on all data? → **Data leakage**
6. Which Feature Store serves real-time single-record inference lookups? → **Online**
7. How do you detect outliers without distribution assumptions? → **IQR**
8. What about extreme transaction amounts in fraud detection? → **Do not remove them (they are the signal)**
9. How do you handle a streaming categorical feature with fixed memory and no dictionary? → **Feature Hashing**
10. Which text representation reduces the influence of common words? → **TF-IDF**
11. When do you clean user-level duplicates? → **Before the split**
12. Which service keeps training and inference feature definitions consistent? → **Feature Store**

## Question Clue → Answer Mapping

| Phrase in the question | What to recall immediately |
|---|---|
| "Right-skewed distribution" | Median imputation, log transform, RobustScaler |
| "Normal distribution cannot be assumed" | IQR-based outlier detection |
| "Whether a value is missing is itself meaningful" | Add an indicator variable (MNAR) |
| "Uses XGBoost / Random Forest" | Scaling options are usually wrong |
| "KNN / SVM / neural network / PCA" | Scaling is required |
| "Ordered grades" | Ordinal Encoding |
| "Unordered colors or regions" | One-Hot Encoding |
| "Thousands to millions of unique values" | Target / Hashing / Embedding |
| "New categories keep appearing in production" | Feature Hashing |
| "23:00 and 0:00 should be close" | sin/cos transform |
| "Want to reduce the influence of common words" | TF-IDF |
| "Want to group words with similar meanings" | Embeddings |
| "Extreme values in fraud detection" | Do not remove them |
| "No-code, quick preparation and diagnosis" | Data Wrangler |
| "Large-scale distributed processing with custom code" | Processing Job |
| "Consistent training and inference feature definitions" | Feature Store |
| "Millisecond single-record lookup" | Feature Store Online |
| "Only values as of the prediction time" | point-in-time lookup |

## Exam Tips

- When the question names an **algorithm**, the preprocessing options narrow (tree → scaling is usually wrong).
- "Millions of unique values" = one-hot is wrong → think target encoding, hashing and embeddings.
- "No-code / visual / quick preparation" = Data Wrangler; "large-scale custom code" = Processing Job.
- "Training-inference consistency," "feature reuse," "single-record low-latency lookup" = Feature Store.
- Preprocessing that violates the **fit on training → transform on test** rule is wrong.
- An option that says "remove all outliers" is wrong in an anomaly-detection context.

Next week (Week 4) covers the second half of EDA — data visualization, distribution and correlation analysis, and dimensionality reduction (PCA), the techniques for analysis and drawing insights.

## 📖 Glossary

- **EDA (Exploratory Data Analysis)**: The stage before modeling in which you examine the data's distributions, missing values, anomalies and relationships.
- **MCAR / MAR / MNAR**: Missing completely at random / missingness that depends on observed variables / missingness that depends on the value itself.
- **Imputation**: Filling in missing values with some value.
- **IQR (interquartile range)**: Q3 − Q1. A robust criterion for setting outlier boundaries without distribution assumptions.
- **Standardization / normalization**: Rescaling to mean 0 and variance 1 / squeezing into the [0,1] range.
- **Cardinality**: The number of unique values in a categorical variable. Thousands of values means high cardinality.
- **Target Encoding**: Encoding that replaces a category with the target mean of that category. Watch for leakage.
- **TF-IDF**: A text representation that multiplies term frequency by a document-rarity weight, suppressing common words.
- **Data leakage**: An accident in which information that would not have been known at training time leaks into the model.
- **point-in-time**: The principle of using only values that were actually knowable at the prediction time.

---

## 📝 Practice Questions

**Question 1.** You have decided to use a Random Forest model. Which of the following preprocessing steps has the **LEAST effect** on this model?

A) Missing value imputation  
B) Feature standardization (scaling)  
C) High-cardinality categorical encoding  
D) Removal of rows with obvious input errors  

**Answer: B**  
Explanation: Tree-based models (Random Forest) use only split points within a feature, so scaling is effectively unnecessary. Missing value imputation (A), categorical encoding (C; trees also need numeric input), and error removal (D) are still needed even for tree models.

---

**Question 2.** Which of the following is a faulty preprocessing procedure that causes data leakage?

A) Fit StandardScaler on the training set and apply only transform to the test set  
B) Impute missing values with the mean of the entire dataset and then split into train/test  
C) Clean up user-level duplicates before the split  
D) Compute target encoding statistics with K-fold  

**Answer: B**  
Explanation: Imputing with the mean of the entire data mixes test set information into the statistic, causing leakage into training. Fitting on the training set and transforming the test set (A), cleaning duplicates before the split (C), and K-fold target encoding (D) are all correct procedures that prevent leakage.

---

**Question 3.** There are three categorical variables: "gender (male/female)," "grade (low < medium < high)," and "city (thousands of values)." Which is the correct pairing of the most appropriate encoding for each?

A) Gender=One-Hot, grade=Ordinal, city=Target/Hashing  
B) Gender=Target, grade=One-Hot, city=Ordinal  
C) Gender=Hashing, grade=Target, city=One-Hot  
D) One-Hot for all three variables  

**Answer: A**  
Explanation: Gender is a low-cardinality nominal variable, so One-Hot; grade is ordinal, so Ordinal; and city is high-cardinality, so Target/Hashing is appropriate. B and C pair them inconsistently with order and cardinality, and One-Hot encoding city (C, D) would explode into thousands of dimensions.

---

**Question 4.** You want to prepare data visually and then export the transformation flow to a Processing Job for large-scale execution and to Feature Store. Which starting tool is MOST appropriate?

A) Amazon QuickSight  
B) Amazon Comprehend  
C) SageMaker Data Wrangler  
D) AWS Glue DataBrew only  

**Answer: C**  
Explanation: Data Wrangler can export a visually defined transformation flow to a Processing Job, a Pipeline, Feature Store, and Python code, bridging exploration and production. QuickSight (A) is BI visualization and Comprehend (B) is an NLP service, and the integration that directly exports a flow to a SageMaker Processing Job/Feature Store is a strength of Data Wrangler.

---

**Question 5.** There is a numeric variable with a distribution that is long-tailed to the right, and you plan to use a linear regression model. Which of the following is the MOST inappropriate treatment?

A) Compress the tail with a log transformation  
B) Impute missing values with the median  
C) Detect outlier boundaries with IQR  
D) Skip scaling because it is a tree model  

**Answer: D**  
Explanation: Saying "skip scaling because it is a tree model" when you plan to use linear regression has a wrong premise to begin with. Linear regression is sensitive to scale, so scaling is needed. A log transformation (A), median imputation (B), and IQR outlier detection (C) are all appropriate treatments for a skewed distribution.

---
