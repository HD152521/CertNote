# Day 3 - Data Leakage: Causes, Detection, Prevention; Time Series Leakage; Target Leakage

Validation scores look perfect, but in production the model fails miserably. Almost always, there's one culprit — **data leakage**. Leakage occurs when a model gains access to information at training time that it **wouldn't actually have at prediction time**, artificially inflating evaluation scores.

MLS-C01 obsesses over leakage. Scenarios like "validation is 99% but production is 60%?" are almost always answered by leakage. Today we cover the **causes, detection, and prevention** of leakage, and two most common types: **target leakage** and **time series leakage**.

## What Is Data Leakage?

Leakage is "information that a model couldn't possibly have at prediction time leaking into training." There are two main categories.

| Type | Definition | Result |
|------|------|------|
| **Target leakage** | Target information directly/indirectly included in features | Both training and validation unrealistically high |
| **train-test contamination** | Test information enters training through preprocessing/splitting | Validation high but production low |

The core question is always the same: **"At the moment we make a prediction, could we really know this value?"** If not, it's leakage.

> 💡 **Related Theory**: Leakage is fundamentally like cheating on an exam — the model has already seen the answer key. Statistically, it violates the **independence assumption of the validation set**. For validation scores to estimate generalization on unseen data, the validation set must be completely independent of the training process. With leakage, validation scores measure not generalization but "ability to reproduce already-seen information," contaminating all model selection and hyperparameter tuning decisions.

## Target Leakage: Future/Result Information Mixing In

Target leakage occurs when **information about the target being predicted is included in features**. It's the most subtle and common.

Typical cases:

| Scenario | Leaking Feature | Why Leakage? |
|------|------|------|
| Disease diagnosis prediction | `medication_taken` | Medication only taken **after** diagnosis |
| Churn prediction | `cancellation_reason_code` | Generated after churn is confirmed |
| Loan default prediction | `delinquencies_count` (future periods included) | Accumulated after default occurs |
| Revenue prediction | `current_month_final_revenue` | The target itself |

Signs of target leakage:
- A single feature's correlation/importance is **abnormally high** (one variable explains 95% of accuracy)
- Features are created **at the same time or after** the target
- Answer to "Can we really know this value at prediction time?" is "No"

```python
# Check suspicion of target leakage: verify single feature explains target
import pandas as pd

corr_with_target = (
    df.corr(numeric_only=True)["churned"]
    .abs()
    .sort_values(ascending=False)
)
print(corr_with_target.head(10))
# If any feature correlation is 0.95+, suspect "Can we know this at prediction time?"
```

> ⚠️ **Trap**: Target leakage isn't caught even if you split train/validation/test perfectly **because leakage is built into the features themselves**. All splits are equally contaminated. That's why splitting alone isn't enough—you must examine **when each feature is created (timestamp) and its relationship to prediction time** using domain knowledge. "Validation high and test high but production low?" → suspect target leakage as #1.

## Time Series Leakage: Future Leaking Into Past

The most common leakage in time series data is **future information being used to predict the past**.

Causes:
- **Random splitting**: Shuffling time series mixes future data into training, past into testing → predicting past from future
- **Future window aggregation**: Computing "last 30 days average" including data after prediction time
- **Using global statistics**: Normalizing by overall average → future information seeps into past rows
- **lag/rolling boundary errors**: Shifts wrong, putting t+1 value into time t

```python
import pandas as pd

df = df.sort_values("date")

# Correct: rolling that only looks at past (exclude current row with shift)
df["sales_ma7"] = df["sales"].shift(1).rolling(7).mean()  # t-1 ~ t-7

# Time series needs time-ordered split (no random splitting)
cutoff = "2025-01-01"
train = df[df["date"] < cutoff]
test = df[df["date"] >= cutoff]
```

> 💡 **Related Theory**: Random splitting is fatal in time series because of **temporal dependency**. Regular data assumes rows are independent, but time series have strong correlation between adjacent time points. Random shuffling lets models "predict" t by looking at t+1 patterns — effectively learning impossible time reversal. That's why time series validation must always follow "train on past, evaluate on future (forward-chaining)" principle, leading to Day 4's time series splitting.

## train-test Contamination: Leakage Through Preprocessing

Even with correct splitting, if **preprocessing is done on the entire dataset before splitting**, test information leaks into training.

| Wrong Approach | Leakage Path |
|------|------|
| Fit scaler on entire dataset | Test mean·std reflected in training scale |
| Calculate imputation statistics on entire dataset | Test distribution enters imputation values |
| Target encoding on entire dataset | Test target average included in encoding |
| Forget deduplication before splitting | Same record appears in both train and test |
| Oversample (SMOTE) before splitting | Synthetic samples span train and test |

Solution is **Pipeline that locks preprocessing inside split/cross-validation**.

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

# Pipeline: fit only happens in each fold's training portion, blocking leakage
pipe = Pipeline([
    ("impute", SimpleImputer(strategy="median")),
    ("scale", StandardScaler()),
    ("clf", LogisticRegression()),
])

# Each fold's preprocessing is fit on training portion only
scores = cross_val_score(pipe, X, y, cv=5)
```

> ⚠️ **Trap**: "Can't we scale on entire data then split?" is a frequent test question. No. If StandardScaler `fit`s on the whole dataset, test statistics leak into training scale, and validation scores become optimistically inflated. You must `fit` only on train portion, `transform` on test only. In cross-validation, Pipeline ensures this rule automatically per fold.

## Data Leakage Prevention Checklist

Consistent procedure to prevent leakage in practice:

1. **Split first**: Do train/test split before any preprocessing
2. **Fit only training**: Scaler/encoder/imputer `fit` on train portion only
3. **Use Pipeline**: Lock preprocessing inside cross-validation loop
4. **Time series time-ordered split**: No random splitting, lag/rolling only look at past
5. **Audit feature generation time**: Confirm each feature is knowable at prediction time
6. **Suspect high validation**: If scores are too good, suspect leakage first

## Summary

Today's essence: (1) Leakage is "information a model couldn't have at prediction time entering training," (2) **Target leakage** is when result information enters features — invisible to splitting and needs time inspection, (3) **Time series leakage** comes from random splitting/future windows → fixed by time-ordered splitting and past-only aggregation, (4) **train-test contamination** is preprocessing on entire data before splitting → fixed by splitting first and fitting only train portion with Pipeline.

Next post covers the principles in practice: **validation design — splitting, cross-validation, stratification, time series splitting**.

---

## 📝 Practice Questions

**Question 1.** In a churn prediction model, the importance of one feature, `termination_reason_code`, is abnormally high and the validation accuracy is 99%. What is the MOST likely cause of this phenomenon?

A) Target leakage - information generated after churn is confirmed is included in the features  
B) The model is underfitted  
C) The learning rate is too high  
D) The sample is too small  

**Answer: A**  
Explanation: `termination_reason_code` is a value filled in only after churn has already been confirmed, so it is future/outcome information that is not known at prediction time. When it enters the features, the model sees the answer in advance, which is target leakage. An abnormally high single-feature importance and validation score are the classic signs. It is unrelated to underfitting (B), learning rate (C), or sample size (D).

---

**Question 2.** You randomly shuffled a daily sales time series and split it into train/test; the validation score was very high, but real future predictions were terrible. What is the correct action?

A) Keep the random split and increase the sample size  
B) Split chronologically, training on the past and evaluating on the future  
C) Mix the test set with the training set  
D) Normalize the sales  

**Answer: B**  
Explanation: Time series have temporal dependence, so a random split causes time-series leakage, predicting the past with future data. A chronological split (forward-chaining) that trains on the past and evaluates on the future is the answer. Increasing the sample (A) leaves the leakage structure unchanged, mixing (C) worsens the leakage, and normalization (D) is unrelated to the split problem.

---

**Question 3.** What is the safest way in scikit-learn to apply preprocessing (scaling, imputation) during cross-validation without leakage?

A) Fit the scaler on the entire dataset, then cross-validate  
B) Put the preprocessing in a Pipeline so it is fit only on the training portion of each fold  
C) Preprocess using the test set's statistics  
D) Skip preprocessing  

**Answer: B**  
Explanation: When preprocessing is put in a Pipeline, `fit` happens only on the training portion of each cross-validation fold and only `transform` is applied to the validation portion, blocking leakage. Fitting on the entire dataset in advance (A) or using test statistics (C) leaks test information and inflates the score. Skipping preprocessing (D) is not a solution.

---

**Question 4.** Which type of leakage will NOT be detected even if the train/validation/test split is done cleanly?

A) Train-test preprocessing contamination  
B) Failure to remove duplicates before splitting  
C) Target leakage, where outcome information is contained in a feature itself  
D) Scaling the entire dataset before splitting  

**Answer: C**  
Explanation: In target leakage, the leaked information is inside the feature, so every split is contaminated equally regardless of how you split, and split-based validation alone cannot catch it. You must examine, for each feature, whether the value is known at prediction time. The others (A, B, D) are contamination types that can be prevented by fixing the preprocessing and splitting procedure.

---

**Question 5.** When creating a `7-day moving average` feature in a time series model, what is the correct way to avoid leakage?

A) Use a 7-day average that includes the target prediction time point  
B) Use the average of the next 7 days  
C) Normalize by the average over the entire period  
D) Apply shift and then rolling so that only the past (before t-1) is included, excluding the current time point  

**Answer: D**  
Explanation: A moving average feature must include only past values that are actually known at prediction time. Leakage is avoided only by aggregating the past while excluding the present and future, as in `shift(1)` followed by `rolling(7)`. Including the current time point (A) or using a future average (B) lets future information in, and an entire-period average (C) also leaks the future into past rows.

---
