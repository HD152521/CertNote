# Day 3 - Data Leakage: Causes, Detection, Prevention, and Time-Series and Target Leakage

## 📌 Key Takeaways

- Leakage is **information that would not have been known at prediction time getting into training.** Only the validation score inflates, and the model collapses in real production.
- **Target leakage** has outcome information baked into the feature itself, so **no matter how well you split, it is not caught.** You must examine when each feature is generated.
- **Time-series leakage** comes from random splits and aggregation over future windows. Prevent it with chronological splits and past-only aggregation (rolling after shift).
- **Train-test contamination** arises from preprocessing before the split. **Split first and fit only on the training part**, and enforce this with a Pipeline.
- The diagnostic question is always one: **"At the very moment of prediction, could we really have known this value?"** If not, it is leakage.

## What Is Data Leakage?

The validation score is perfect, yet the model fails miserably in real production. The culprit is almost always one thing: **data leakage**. Leakage is the phenomenon where a model gains access to **information it could not actually have had at training time**, so the evaluation score is artificially inflated.

MLS-C01 is obsessed with leakage. The answer to a scenario like "99% on validation but 60% in production?" is almost always leakage.

| Type | Definition | Result |
|---|---|---|
| **Target leakage** | Information about the target is directly or indirectly included in the features | Training and validation are **both** unrealistically high |
| **Train-test contamination** | Test information flows into training via preprocessing or splitting | Validation is high but production is low |

The key question is always the same. **"At the moment the prediction is made, could we really have known this value?"** If not, it is leakage.

Leakage is essentially the same as cheating on an exam: the model has already seen the answer sheet. Statistically, it violates the **independence assumption of the validation set**. For a validation score to estimate generalization performance on unseen data, the validation set must be completely independent of the training process. With leakage, the validation score measures not generalization but "the ability to reproduce information already seen," and every model-selection and hyperparameter-tuning decision made on top of it is contaminated.

### Leakage Type → Symptom → Detection → Prevention (Key Table)

| Leakage type | Typical cause | Symptom | Detection method | Prevention |
|---|---|---|---|---|
| **Target leakage** | A value generated after the outcome is settled is included in the features | Training, validation, and test are all high; only production is low | Abnormally high single-feature importance or correlation; audit feature generation time | Check each feature's timestamp; remove data from after the prediction time |
| **Time-series leakage** | Random split, window aggregation that includes the future | Backtest looks good but real future prediction is poor | Check whether the training period is later than the validation period | Chronological split; `shift(1)` then rolling |
| **Train-test contamination** | Scaling, imputation, or encoding before the split | The validation score is not reproducible | Check whether preprocessing code runs before the split | Split first → fit only on the training part → Pipeline |
| **Group leakage** | Rows from the same user or patient are scattered across training and validation | Personalization performance is overestimated | Check whether group IDs appear in both splits | GroupKFold / group-level split |
| **Duplicate-row leakage** | Deduplication missed before the split | The same record exists in both training and test | Count duplicate keys | Deduplicate **before** the split |
| **Sampling leakage** | Oversampling such as SMOTE before the split | Synthetic samples straddle both sides | Check when resampling happens | Apply resampling to the training part only |

## Target Leakage: Future and Outcome Information Gets Mixed In

Target leakage occurs when **information about the target being predicted is included in the features**. It is the most insidious and the most common.

| Scenario | Leaking feature | Why it is leakage |
|---|---|---|
| Disease diagnosis prediction | `medication_given` | Medication is given **only after** the diagnosis is made |
| Churn prediction | `cancellation_reason_code` | Generated after the churn is confirmed |
| Loan default prediction | `overdue_count` (including future periods) | Accumulates after the default occurs |
| Sales prediction | `final_sales_for_the_month` | The target itself |
| Churn prediction | `support_center_cancellation_inquiries` | An event that occurs after the customer expresses intent to cancel |

Signs of target leakage:

- A single feature's correlation or importance is **abnormally high** (one variable explains 95% of the accuracy).
- The feature is created **at the same time as or after** the target.
- The answer to "Can we really know this value at prediction time?" is "No."

```python
# Check for suspected target leakage: does a single feature explain the target too well?
import pandas as pd

corr_with_target = (
    df.corr(numeric_only=True)["churned"]
    .abs()
    .sort_values(ascending=False)
)
print(corr_with_target.head(10))
# If any feature's correlation is 0.95 or higher, first ask "Is this a value we could know at prediction time?"
```

> ⚠️ **Pitfall**: Target leakage is **not caught even if you split train/validation/test perfectly, because the leakage is baked into the feature itself**. Every split is contaminated equally. So splitting alone is not enough; you must use domain knowledge to examine **when each feature is generated (timestamp) and how that relates to the prediction time**. "Validation is high and test is high, but only production is low?" → Suspect target leakage first.

### Leakage Suspicion Signal Table

| Observation | Interpretation | Next action |
|---|---|---|
| Validation accuracy 99%+ on an inherently hard problem | If it looks too good, be suspicious | Check per-feature importance first |
| Performance collapses when one feature is removed | That feature contains the answer | Audit that feature's generation time |
| Training-validation gap is nearly 0 | Validation may not be independent | Check the order of splitting and preprocessing |
| Validation and test high, only production low | Target leakage | Audit feature timestamps |
| Validation high, test low from the start | Train-test contamination | Check where preprocessing is fit |
| Backtest good, real future prediction poor | Time-series leakage | Check the split method and window definitions |

## Time-Series Leakage: The Future Seeps into the Past

The most common leakage in time-series data is **predicting the past with future information**.

Causes:

- **Random split**: Shuffling a time series puts future data in training and past data in test → predicting the past with the future
- **Window aggregation that includes the future**: Computing a "30-day average" that includes data after the prediction time
- **Using global statistics**: Normalizing with the overall mean → future information seeps into past rows
- **lag/rolling boundary errors**: A wrong shift puts the t+1 value into time t

```
[Wrong random split]                    [Correct chronological split]
Time axis ───────────────────▶          Time axis ───────────────────▶
 T T V T V T T V T V T T V T             T T T T T T T T | V V V | E E
 └─ training (T) and validation (V)       training          validation  evaluation
    are mixed                             └── always from past → future ──┘
    → model sees t+1 and "predicts" t     (forward-chaining, same as the deployment situation)
    → training backward in time = leakage
```

```python
import pandas as pd

df = df.sort_values("date")

# Correct approach: rolling that looks only at the past (shift excludes the current row)
df["sales_ma7"] = df["sales"].shift(1).rolling(7).mean()  # t-1 ~ t-7

# Split time series chronologically (no random split)
cutoff = "2025-01-01"
train = df[df["date"] < cutoff]
test = df[df["date"] >= cutoff]
```

The reason a random split is fatal for time series is **temporal dependence**. Ordinary data assumes rows are independent, but a time series has strong correlation between adjacent points in time. If you shuffle randomly, the model sees the pattern at t+1 and "predicts" t, learning a backward-in-time relationship that is impossible in reality. So time-series validation must always follow the principle "train on the past and evaluate on the future (forward-chaining)," which leads into Day 4's time-series splitting.

## Train-Test Contamination: Leakage Through Preprocessing

Even if you split properly, if you **preprocess on the entire dataset before splitting**, test information leaks into training.

| Wrong approach | Leakage path |
|---|---|
| Fit the scaler on the entire dataset | The test mean and standard deviation are reflected in the training scale |
| Compute imputation statistics on the entire dataset | The test distribution enters the imputed values |
| Target-encode on the entire dataset | The test target mean is included in the encoding |
| Missing deduplication before the split | The same record appears in both training and test |
| Oversampling (SMOTE) before the split | Synthetic samples straddle training and test |
| Feature selection on the entire dataset | Features are chosen after seeing test information, causing selection bias |

The solution is a **Pipeline that confines preprocessing inside the split and cross-validation**.

```
[Order that leaks]                     [How a Pipeline prevents it]
Entire dataset                          Entire dataset
   │                                       │
   ▼ fit(scaler) ← includes test stats     ▼ split
Scale everything                        training fold │ validation fold
   │                                       │         │
   ▼ split                            fit+transform  transform only
training │ test                            │         │  (uses training fold statistics only)
   └─ already contaminated                 └─ train model ▶ evaluate
```

```python
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

# Pipeline: fit happens only on each fold's training part, blocking leakage
pipe = Pipeline([
    ("impute", SimpleImputer(strategy="median")),
    ("scale", StandardScaler()),
    ("clf", LogisticRegression()),
])

# Each fold's preprocessing is fit on the training part only
scores = cross_val_score(pipe, X, y, cv=5)
```

> ⚠️ **Pitfall**: "Can't I scale on the entire dataset and then split?" is an easy question to get confused about. No, you can't. If StandardScaler is `fit` on the entire dataset, test statistics leak into the training scale and the validation score is optimistically inflated. You must **`fit` only on the training part and apply only `transform` to the test**. In cross-validation, a Pipeline enforces this rule automatically for every fold.

## Leakage and Metrics: Why a "Too-Good Score" Is a Warning Sign

| Observed metric pattern | Plausible cause | What to check |
|---|---|---|
| Accuracy 99% on imbalanced data | The illusion of getting only the majority class right (may not be leakage) | Re-examine with PR-AUC and recall |
| Even PR-AUC and recall are all perfect | High likelihood of leakage | Single-feature contribution, feature generation time |
| ROC-AUC ≈ 1.0 | Suspect a feature that contains the target as-is | Top of the feature-target correlation list |
| Validation score variance is almost 0 | Information shared across folds (duplicate or group leakage) | Duplicate rows, group ID distribution |
| Score swings widely with each retraining | More likely insufficient data or an unstable split than leakage | Check the mean and variance with k-fold |

High accuracy on imbalanced data may be **majority-class bias**, not leakage. To tell the two causes apart, you must look at minority-class metrics (recall, PR-AUC). Both concluding "it's leakage" from accuracy alone and feeling reassured that "it's fine" are wrong.

## Data Leakage Prevention Checklist

A consistent procedure for preventing leakage in practice:

1. **Split first**: Do the train/test split before any preprocessing
2. **Fit on the training part only**: `fit` scalers, encoders, and imputers on the training part only
3. **Use a Pipeline**: Confine preprocessing inside the cross-validation loop
4. **Split time series chronologically**: No random splits; lag/rolling reference only the past
5. **Audit feature generation time**: Confirm that each feature is a value knowable at prediction time
6. **Be suspicious of high validation scores**: If the score is too good, suspect leakage first
7. **Clean up groups and duplicates**: Handle the same user and duplicate records before splitting

### AWS Service Mapping Table

| Situation | AWS service / feature | Reason |
|---|---|---|
| Fix preprocessing logic identically for training and inference | SageMaker Processing Job + saved preprocessing script | Eliminating ad hoc notebook preprocessing reduces both training-serving skew and leakage |
| Manage feature definitions and values centrally | SageMaker Feature Store | Training and inference share the same feature definitions, reducing point-in-time mismatch |
| Bundle preprocessing → training → evaluation into steps for reproducibility | SageMaker Pipelines | The step order is fixed in code, structurally preventing the "preprocessing before split" mistake |
| Monitor whether the production input distribution has diverged from training | SageMaker Model Monitor | Catches the validation-vs-production performance gap early |
| Check which features dominate the prediction | SageMaker Clarify (feature attribution) | If a single feature monopolizes the prediction, it is a sign of target leakage |
| Visually track data transformation history | SageMaker Data Wrangler | Leaves a flow of which transformation was applied when, so it can be audited |

### Question Clue → Answer Mapping Table

| Phrase in the question | Signal to read | Answer to pick |
|---|---|---|
| "Validation and test are high, only production is low" | Leakage that splitting does not catch | Target leakage |
| "Validation is high but test is low from the start" | Preprocessing contamination | After splitting, fit on the training part only |
| "The time series was shuffled and split" | Backward in time | Chronological split (forward-chaining) |
| "Scaling was done on all the data and then it was split" | Test statistics flowed in | Fit inside each fold with a Pipeline |
| "Performance collapses if just one feature is removed" | A feature that contains the answer | Audit that feature's generation time |
| "There are multiple test records for the same patient" | Group structure | GroupKFold, group-level split |
| "SMOTE was used to balance before the split" | Synthetic samples straddle both sides | Resample the training part only |
| "The cancellation reason code is the most important feature" | A value generated after the outcome | Target leakage, remove the feature |

The next article is the practical companion to these principles: **validation design: splitting, cross-validation, stratification, and time-series splits**.

## 📖 Glossary

- **Data leakage**: An accident in which information that would not have been known at prediction time flows into training and inflates performance.
- **Target leakage**: Leakage in which outcome information about the prediction target is contained in a feature. It is not caught by splitting.
- **Train-test contamination**: The phenomenon in which preprocessing the entire dataset before splitting lets test information leak into training.
- **Time-series leakage**: Leakage in which future data is used to predict the past. Random splitting is the main culprit.
- **Group leakage**: The phenomenon in which rows from the same user or patient are split between training and validation, so performance is overestimated.
- **forward-chaining**: A time-series validation method that always trains on the past and evaluates on the future.
- **Rolling after shift**: A technique that computes moving statistics using only past values, excluding the current row, to prevent leakage.
- **Pipeline**: A structure that bundles preprocessing and the model together and forces `fit` to occur only on each fold's training part.
- **fit / transform distinction**: The step that learns statistics (fit) versus the step that applies them (transform). Use only transform on the test set.
- **Validation set independence**: The principle that for a validation score to estimate generalization performance, the validation data must be completely separated from the training process.

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
