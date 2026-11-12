# Day 5 - Week 3 Comprehensive Review: Cleaning and Feature Engineering

This week, we covered the first half of EDA—**data cleaning** and **feature engineering**. Both are central to MLS-C01 Domain 2 (Exploratory Data Analysis) and are the stages most critical to model performance in practice. Today, we knit together four days of content into one workflow, review it holistically, and clarify the decision points that confuse exam takers most.

## One-Page Summary: Cleaning → Feature Engineering → Tools

```text
[Raw Data]
   │
   ├─ 1) Cleaning (Day 1)
   │     Missing values: Assess MCAR/MAR/MNAR → Impute (mean/median/KNN/model)
   │     Outliers: Detect via IQR/Z-score → Delete/clip/transform/keep
   │     Duplicates & errors: Clean before split (prevent leakage)
   │
   ├─ 2) Feature Engineering (Day 2–3)
   │     Scaling: Normalization/Standardization/RobustScaler (trees unnecessary)
   │     Encoding: Label/One-Hot/Target (decide by order & cardinality)
   │     Binning: Nonlinearity & interpretability ↔ information loss
   │     Dates: Decompose components + sin/cos
   │     Text: BoW → TF-IDF → embeddings
   │     High-cardinality: Target/hashing/embeddings
   │
   └─ 3) AWS Tools (Day 4)
         Data Wrangler (visual) → Processing Job (scale) → Feature Store (reuse)
```

## Key Decision Points

### Missing Values: How to Impute?

| Scenario | Recommendation |
|------|------|
| Right-skewed numeric | Median imputation |
| Symmetric numeric | Mean imputation |
| Categorical | Mode imputation |
| Strong inter-variable correlation | KNN or model-based |
| Missing value itself is a signal (MNAR) | Add indicator variable |

### Scaling: Algorithm-Specific Requirement

- **Required**: KNN, K-means, linear/logistic regression, SVM, neural networks, PCA, Ridge/Lasso
- **Unnecessary**: Decision Tree, Random Forest, XGBoost, LightGBM (tree-based)
- **With many outliers**: RobustScaler

### Encoding: Decide by Order and Cardinality

```text
Is there an order?  ── Yes ──→ Ordinal/Label Encoding
        │
        └─ No ──→ Many unique values?
                        ├─ Few → One-Hot
                        └─ Many → Target/Frequency/Hashing/Embedding
```

> 💡 **Key Theory**: One principle threads through this entire week: **preventing data leakage**. All transformations—imputation statistics (mean, median), scaler parameters (min/max/μ/σ), target encoding statistics, text vectorizer vocabulary—must **fit only on training data**; validation and test sets get only `transform`. Duplicate removal must happen before split; time-series features must respect point-in-time. Leakage inflates offline performance unrealistically and collapses in production—it's a perennial trap in exams and real work alike.

## Confusing Pairs Compared

| Pair | Key Difference |
|------|------|
| Mean vs median imputation | Median robust to outliers and skew |
| Z-score vs IQR | IQR is robust without distribution assumptions |
| Normalization vs standardization | Normalization: fixed [0,1] range; standardization: mean 0, variance 1; outliers: use RobustScaler |
| Label vs One-Hot | Ordinal → Label; nominal → One-Hot |
| BoW vs TF-IDF | TF-IDF suppresses common words |
| Online vs Offline Store | Online: ms single-record inference; Offline: bulk training |
| Data Wrangler vs Processing Job | Visual EDA vs code-based large-scale processing |

> 💡 **Key Theory**: Feature engineering and model choice are inseparable. With identical data, **linear models** need scaling, binning, and one-hot to explicitly capture nonlinearity and scale; **tree/boosting models** don't need scaling and gain little from binning/one-hot because trees capture nonlinearity via splits. The answer to "which preprocessing is correct?" depends on "which model will we use?" Exam questions often exploit this—using the algorithm as a clue to narrow the preprocessing answer.

## Self-Check Questions

Try to answer these mentally:

1. For right-skewed income with missing values using simple imputation, mean or median? → **Median**
2. Is feature scaling needed for XGBoost? → **No**
3. Why is one-hot inappropriate for postal codes (thousands of values)? → **Dimensionality explosion**
4. What makes hour 23 and hour 0 adjacent? → **Sin/cos transform**
5. What problem arises when fitting a scaler to all data? → **Data leakage**
6. For real-time single-record inference, which Feature Store? → **Online**

## Exam Tips

- If the problem names an **algorithm**, preprocessing options narrow (tree → scaling likely wrong).
- "Millions of unique values" = one-hot is wrong → think target encoding, hashing, or embeddings.
- "No-code/visual/quick prep" = Data Wrangler; "large-scale custom code" = Processing Job.
- "Training-inference consistency," "feature reuse," "single-record low-latency lookup" = Feature Store.
- Any preprocessing that violates the **train fit → test transform** rule is nearly always wrong.

## Summary

Week 3 transformed "dirty raw data" into "trusted features that models can learn from." Cleaning (missing, outliers, duplicates), feature engineering (scaling, encoding, binning, dates, text, high-cardinality), and SageMaker tools for scale—these form a unified workflow. Two principles run through all: **leakage prevention** and **choosing preprocessing to match your model**.

Next week (Week 4) covers the second half of EDA: data visualization, distribution and correlation analysis, dimensionality reduction (PCA), and other analytical and insight-generating techniques.

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
