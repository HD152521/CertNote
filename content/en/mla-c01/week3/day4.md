# Day 4 - Data Bias·Quality: Clarify, Class Imbalance Handling, Data Split

## 📌 Key Takeaways

- **SageMaker Clarify** analyzes data bias **before** training, and prediction bias and explainability (SHAP) **after** training.
- The basis of bias analysis is the **sensitive attribute (facet)**. The representative metrics are **CI (sample imbalance between groups)** and **DPL (difference in positive label proportions)**.
- Class imbalance is handled with **under/oversampling, SMOTE, and class weights**. Apply them **only to the training set, after splitting**.
- Split into three sets: train/validation/test. Look at **the test set only once, at the very end**.
- For imbalanced data, use a **stratified split**; for time series, a **time-based split**. With little data, use **k-fold cross-validation**.

## SageMaker Clarify: Bias Detection and Explainability

Even if you engineer features well, if the data itself is skewed to one side, the model learns that bias as it is. Typical examples are a loan approval model making unfavorable decisions for a particular gender, or a fraud detection model missing every single case of fraud that makes up only 0.1%.

**SageMaker Clarify** does two things.

| Timing | What it analyzes | Representative output |
|------|---------------|------------|
| **Before** training (pre-training) | Imbalance between groups in the data itself | Bias metrics such as CI and DPL |
| **After** training (post-training) | Differences in model predictions between groups, feature contributions | Prediction bias metrics, SHAP values |

The core concept is the **sensitive attribute (facet)**. When you specify a column on which fairness should be examined, such as gender, race, or age, Clarify shows with metrics whether the data and predictions between those groups are balanced.

```python
from sagemaker import clarify

clarify_processor = clarify.SageMakerClarifyProcessor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge", sagemaker_session=session
)

bias_config = clarify.BiasConfig(
    label_values_or_threshold=[1],      # Positive outcome (e.g., loan approved)
    facet_name="gender",                # Sensitive attribute
    facet_values_or_threshold=[0],      # Protected group
)

clarify_processor.run_pre_training_bias(   # Pre-training data bias
    data_config=data_config, data_bias_config=bias_config,
)
```

There are two representative bias metrics.

| Metric | What it measures | When high |
|------|-----------|--------|
| **Class Imbalance (CI)** | How skewed the sample counts are between groups | One group has far less data |
| **Difference in Positive Proportions in Labels (DPL)** | Difference in positive label proportions between groups | Only one group received favorable outcomes often |

Machine learning bias starts with the data. It is the fairness version of "garbage in, garbage out." If past data contains social bias (for example, a low approval rate for a particular group), the model learns it as a "pattern" and automates and amplifies the bias. This is why measuring bias before training matters — if you do not catch the data imbalance before building the model, even the most accurate model makes unfair decisions quickly and in bulk.

Clarify's post-training analysis computes "how much each feature contributed to the prediction" with **SHAP (SHapley Additive exPlanations)** values. The concept comes from the Shapley value in game theory, which allocates a fair share of the change in prediction by adding and removing features. In regulated industries (finance, healthcare), when you must explain "why was this customer rejected," SHAP-based feature contributions serve as that basis.

## Handling Class Imbalance

In classification data, one class being extremely small is **class imbalance**. Often the side that actually matters is the minority, as with fraud (0.1%), rare diseases, and equipment failures. If left as is, the model gets high accuracy by just guessing the majority class and ignores the minority class.

| Technique | Method | Data volume | Caution |
|------|------|----------|--------|
| Undersampling | Reduce the majority class | Decreases | May lose information |
| Oversampling (duplication) | Duplicate the minority class | Increases | Repeats the same points → overfitting risk |
| SMOTE | Generate synthetic minority samples | Increases | Better generalization than plain duplication; synthesizes noise if classes overlap |
| class weight | Large penalty for minority class mistakes | Unchanged | Does not grow the data, saving memory and time |

```python
from imblearn.over_sampling import SMOTE

# SMOTE: generate synthetic minority samples by interpolation
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
print(y_resampled.value_counts())   # The two classes are balanced
```

```
[Original]       Majority ●●●●●●●●●●●●●●●●  Minority ▲▲
[Undersampling]  Majority ●●●●             Minority ▲▲     ← Discards the majority (information loss)
[Duplication]    Majority ●●●●●●●●●●●●●●●●  Minority ▲▲▲▲▲▲▲▲  ← Repeats the same points
[SMOTE]          Majority ●●●●●●●●●●●●●●●●  Minority ▲△△▲△△▲△  ← △ are interpolated points between neighbors
```

> ⚠️ **Trap**: Apply resampling **only to the training data, after splitting**. If you run SMOTE on the full data before splitting, synthesized samples get mixed into the validation and test sets, causing data leakage and overestimated performance. The validation and test sets must reflect the actual production distribution (imbalanced as it is) for the evaluation to be honest.

SMOTE (Synthetic Minority Over-sampling Technique) is a technique proposed in 2002 that creates new synthetic samples by interpolating between minority class samples. Plain duplication places the same point several times so that the model memorizes it (overfitting), but SMOTE creates new points between neighboring samples, smoothing the decision boundary. However, it is not a cure-all, because if the classes overlap in feature space it can synthesize noise.

**Handling imbalance is not only about resampling** — you also adjust metrics and thresholds.

| Axis | Action |
|----|------|
| Data | Under/oversampling, SMOTE |
| Loss function | class weight, scale_pos_weight |
| Evaluation metric | PR-AUC, F1, Recall instead of Accuracy |
| Threshold | Adjust to business cost instead of 0.5 |

## train/validation/test Split

For honest model evaluation you must divide the data into three chunks. Each set has a different role.

| Set | Purpose | Ratio (example) | Times used |
|----|------|-----------|----------|
| Train | Learn model parameters | 70% | Every epoch |
| Validation | Hyperparameter tuning and model selection | 15% | Many times |
| Test | Evaluate final performance once (never used in training) | 15% | **Only once** |

Look at the **test set only once, at the very end**. If you start fixing the model after seeing test results, the test set effectively becomes a validation set, and you can no longer measure generalization performance honestly.

```python
from sklearn.model_selection import train_test_split

# Step 1: train+val vs test / Step 2: train vs val (stratify keeps the ratio if imbalanced)
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.15, stratify=y, random_state=42
)
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.176, stratify=y_temp, random_state=42
)
```

`stratify=y` is a **stratified split** that keeps the class ratio of each set the same as the original when splitting. With imbalanced data, a random split can leave almost no minority class in some set, so always stratify.

**Split method by data nature**

| Data nature | Split method | Reason |
|-----------|----------|------|
| General structured, balanced | Random split | Simple and sufficient |
| Class imbalance | Stratified split (stratify) | Keeps the class ratio in each set |
| Time series | Time-based split (past = train, future = test) | Predicting the past from the future leaks |
| Grouped (several rows from the same user) | Split by group | If the same user is scattered, performance is inflated |
| Little data | k-fold cross-validation | Reduces variation from the luck of the split |

```
[Correct time series split]
  ──────── train ────────┤── val ──┤── test ──▶ time
                     (train on the past, evaluate on the future)

[Wrong time series split — random]
  ░█░░█░█░░█░█░█░░█░█░  ← Future pieces mixed into train cause look-ahead bias
```

A random split is forbidden for time series data. This is because future leakage (look-ahead bias) occurs, training on future data to predict the past. For time series, use a time-based split that divides by point in time into "past = train, future = test." Also, when data is small, instead of a single split use **k-fold cross-validation**, which divides the data k times and looks at the average performance.

## Order Mistakes That Create Leakage

A theme repeated throughout this week is "get the order wrong and leakage occurs."

| Wrong order | What leakage | Correct order |
|-----------|----------|------------|
| Fit the scaler on everything → split | Transformation leakage | Split → fit on train only |
| SMOTE on everything → split | Synthesis leakage | Split → SMOTE on train only |
| Feature selection on everything → split | Selection leakage | Split → select based on train |
| Using future values as features | Future leakage | Point-in-time by Event Time |
| Keep fixing the model using test | Evaluation leakage | Test only once, at the end |

> ⚠️ **Trap**: All five of these produce the same symptom — **validation performance is excellent but it collapses once deployed**. When the exam gives a passage like "offline metrics were good but performance does not hold up in the live service," you should almost always suspect the leakage family.

## At Which Stage Is Bias Handled

Bias mitigation is not a job for a single point. You can intervene at three points — data, training, and prediction — and the exam makes you distinguish "which stage's action is this."

| Timing | What changes | Example | Pros and cons |
|------|-------------|-----|-------|
| Before training (pre-processing) | The data itself | Resampling, boosting samples per group, removing bias-inducing features | Fundamental, but requires obtaining data |
| During training (in-processing) | The training objective | class weight, reflecting fairness constraints in the loss | No need to change the data, complex to implement |
| After training (post-processing) | The prediction results | Adjusting thresholds per group | Quick to apply, the root cause remains |

Clarify's role among these is to measure **pre-training data bias** and **post-training prediction bias**. You must distinguish that measurement and mitigation are different jobs.

## How to Read Bias Metrics

| Observation | Interpretation | Next action |
|------|------|----------|
| CI is large | One group's samples are markedly few | Boost data, stratified sampling |
| DPL is large | Past decisions favored one group | Review the label creation process, reexamine features |
| Balanced before training but biased after training | The model or features created the bias | Check feature contributions (SHAP) |
| A feature's SHAP is strongly associated with a sensitive attribute | Possibly a proxy variable | Consider removing that feature |

The idea that deleting the sensitive attribute column from the data makes things fair is a common misconception. If a **proxy variable** strongly associated with the sensitive attribute, such as postal code or occupation, remains, the model still learns the same bias. What is needed is not deleting but an approach of measuring and verifying.

## Imbalance and Split Order Summary

```
① Obtain data
   │
② Split (stratified / time-based / group)          ← First of all!
   │
   ├─ train ─→ ③ Fit transformer  ─→ ④ Resampling (SMOTE etc.)  ─→ ⑤ Train
   │
   ├─ validation ─→ Transformer transform only ─→ Hyperparameter selection
   │
   └─ test ──────→ Transformer transform only ─→ Final one-time evaluation
```

| If you break this order | Result |
|----------------|------|
| ③ before ② | Transformation leakage |
| ④ before ② | Synthesis leakage |
| Repeatedly adjusting ⑤ using test | Evaluation leakage |
| Random ② for time series | Future leakage |

## The Evaluation Set Must Reflect the Production Distribution

- You may balance the training set, but the **validation and test sets must be left as imbalanced as what you actually meet in production**.
- If you balance even the test set, you are measuring performance in a "world where half of all transactions are fraud," which yields numbers unrelated to reality.
- Threshold decisions must also be made on the production distribution so that the actual precision and recall come out as predicted.

In the next lesson we wrap up Week 3 with a comprehensive review of this week's feature engineering and data quality as a whole — Data Wrangler, Feature Store, and Clarify.

## 📖 Glossary

- **SageMaker Clarify** : A tool that measures bias in data and predictions before and after training and explains the basis for predictions.
- **Sensitive attribute (facet)** : A column on which fairness should be examined, such as gender, race, or age. It becomes the reference axis for bias analysis.
- **CI (Class Imbalance)** : A bias metric measuring how skewed the sample counts are between sensitive attribute groups.
- **DPL** : The difference in positive label proportions between groups. Shows whether past decisions favored one side.
- **SHAP** : An explanation metric computed by fairly allocating, in a game-theoretic way, the share each feature contributed to the prediction.
- **Explainability** : The property of making it possible for humans to understand why a model predicted what it did.
- **Class imbalance** : A state in which one class is extremely small. Makes the accuracy metric meaningless.
- **Undersampling / oversampling** : Reducing the majority class / increasing the minority class.
- **SMOTE** : An oversampling technique that creates new synthetic samples by interpolating between minority class samples.
- **class weight** : A setting that assigns a larger loss when the minority class is wrong so the model pays attention to it.

## 📝 Practice Questions

**Question 1.** Before building a loan approval model, you want to measure whether the data is balanced across gender groups and whether the positive label rate differs. What are the appropriate tool and stage?

A) Measure latency with Model Monitor after training  
B) Measure pre-training bias with SageMaker Clarify  
C) Calculate data volume with Athena  
D) Train automatically with SageMaker Autopilot  

**Answer: B**  
Explanation: Clarify's pre-training bias analysis is appropriate because you specify the sensitive attribute (facet) and it measures sample imbalance between groups (CI) and the difference in positive label proportions (DPL). Model Monitor (A) is post-deployment operational monitoring, and Athena volume calculation (C) and Autopilot training (D) have different purposes from bias measurement.

---

**Question 2.** In an imbalanced dataset where fraudulent transactions are only 0.2% of the total, you want to generate synthetic samples of the minority class by interpolation to improve generalization over simple duplication. Which technique is appropriate?

A) Undersampling  
B) SMOTE  
C) Delete all data  
D) Duplicate the majority class  

**Answer: B**  
Explanation: SMOTE creates new synthetic samples by interpolating between minority class samples, which smooths the decision boundary and reduces overfitting more than simple duplication that places the same points repeatedly. Undersampling (A) reduces the majority class and loses information, deleting data (C) is inappropriate, and duplicating the majority class (D) worsens the imbalance.

---

**Question 3.** You want to apply SMOTE to imbalanced data. What is the correct order to prevent data leakage?

A) Apply SMOTE to the entire dataset first, then split into train/test  
B) Split into train/test first, then apply SMOTE to the training set only  
C) Apply SMOTE to the test set only  
D) Apply it to everything without splitting  

**Answer: B**  
Explanation: Splitting first and resampling only the training set keeps synthetic samples from leaking into the validation and test sets, so the evaluation stays honest. Applying it to everything before splitting (A, D) mixes synthetic samples into the evaluation set and causes leakage, and applying it only to test (C) distorts the evaluation distribution.

---

**Question 4.** In a train/validation/test split, what is the correct principle for using the test set?

A) Use it repeatedly for evaluation every time you tune hyperparameters  
B) Use it to evaluate the generalization performance of the final model only once  
C) Use it directly to update training parameters  
D) Use it to compute the loss at every epoch  

**Answer: B**  
Explanation: The test set is used only once, at the very end, to honestly evaluate final performance. If you tweak the model through repeated evaluation (A), the test set effectively becomes a validation set and the generalization estimate is distorted, and updating training parameters (C) and per-epoch loss (D) are the roles of train/validation.

---

**Question 5.** When splitting heavily imbalanced data into train/test, you want each set to preserve the class proportions of the original. Which method is appropriate?

A) Fully random split  
B) Stratified split (stratify option)  
C) Split in chronological order  
D) Ignore the classes and split alphabetically  

**Answer: B**  
Explanation: A stratified split keeps each set's class proportions identical to the original, preventing the problem in imbalanced data where the minority class almost disappears from a particular set. A random split (A) can make the proportions fluctuate, a chronological split (C) is only for time series, and an alphabetical split (D) has nothing to do with guaranteeing proportions.

---
