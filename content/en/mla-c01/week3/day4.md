# Day 4 - Data Bias·Quality: Clarify, Class Imbalance Handling, Data Split

Even if features are well-engineered, if the data itself is biased in one direction, the model will learn that bias as-is. A loan approval model making unfavorable decisions for a particular gender, or a fraud detection model missing all fraud (only 0.1%) are typical examples. Today we look at tools and techniques for checking data fairness and quality.

The MLA-C01 exam increasingly emphasizes Responsible AI and data quality. Three axes — SageMaker Clarify's bias detection, class imbalance handling, train/validation/test split — are organized around evaluation criteria.

## SageMaker Clarify: Bias Detection and Explainability

**SageMaker Clarify** does two things: (1) Measure data bias **before** training, and (2) Analyze model prediction bias and feature contribution (explainability) **after** training.

The core concept is **sensitive attribute (facet)**. When you specify columns like gender, race, or age that require fairness consideration, Clarify shows metrics indicating whether data and predictions are balanced across those groups.

```python
from sagemaker import clarify

clarify_processor = clarify.SageMakerClarifyProcessor(
    role=role, instance_count=1, instance_type="ml.m5.xlarge", sagemaker_session=session
)

bias_config = clarify.BiasConfig(
    label_values_or_threshold=[1],      # Positive outcome (e.g., loan approval)
    facet_name="gender",                # Sensitive attribute
    facet_values_or_threshold=[0],      # Protected group
)

clarify_processor.run_pre_training_bias(   # Pre-training data bias
    data_config=data_config, data_bias_config=bias_config,
)
```

Remember just two representative bias metrics. **Class Imbalance (CI)** measures how skewed the sample size is across groups, and **Difference in Positive Proportions in Labels (DPL)** measures the difference in positive label proportions across groups.

> 💡 **Related Theory**: Machine learning bias starts with data. It's the fairness version of "garbage in, garbage out". If historical data contains social bias (e.g., low approval rate for a particular group), the model learns it as a "pattern" and automates and amplifies the bias. That's why pre-training bias measurement matters — if you don't fix data imbalance before building the model, even the most accurate model will quickly produce unfair decisions at scale.

> 🔍 **Deeper Dive**: Clarify's post-training analysis calculates **SHAP (SHapley Additive exPlanations)** values to measure "how much each feature contributed to the prediction". Derived from game theory's Shapley value, it calculates the fair share of prediction change by adding and removing features. In regulated industries (finance, healthcare) where you must explain "why was this customer rejected", feature importance based on SHAP becomes the justification.

## Handling Class Imbalance

When one class is extremely rare in classification data, this is a **class imbalance**. Cases like fraud (0.1%), rare disease, or equipment failure often have the important class as a minority. If left alone, the model achieves high accuracy just by predicting the majority class and ignores the minority class.

| Technique | Approach | Caution |
|-----------|----------|---------|
| Undersampling | Reduce majority class | Information loss possible |
| Oversampling (replication) | Replicate minority class | Risk of overfitting |
| SMOTE | Generate synthetic minority samples | Better generalization than simple replication |
| class weight | Large penalty for minority class errors | Doesn't increase data size |

```python
from imblearn.over_sampling import SMOTE

# SMOTE: Generate synthetic minority samples through interpolation
smote = SMOTE(random_state=42)
X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
print(y_resampled.value_counts())   # Two classes are now balanced
```

> ⚠️ **Pitfall**: Resampling must **always be applied only to training data after splitting**. If you run SMOTE on all data before splitting, the synthetic samples leak into validation and test sets, causing data leakage and overestimating performance. Validation and test sets should reflect actual production distribution (imbalance as-is) for honest evaluation.

> 💡 **Related Theory**: SMOTE (Synthetic Minority Over-sampling Technique) was proposed in 2002 and generates new synthetic samples by interpolating between minority class samples. Simple replication places the same point multiple times, causing the model to memorize it (overfitting), but SMOTE creates new points between neighboring samples, smoothing the decision boundary. However, it's not a silver bullet—if classes overlap in feature space, it may synthesize noise.

## train/validation/test Split

For honest model evaluation, data must be divided into three chunks. Each set has a different role.

| Set | Purpose | Ratio (example) |
|-----|---------|-----------------|
| Train | Learn model parameters | 70% |
| Validation | Hyperparameter tuning·model selection | 15% |
| Test | Final performance evaluation once (never used in training) | 15% |

**The test set is viewed only once at the end.** If you look at test results and start modifying the model, the test set becomes a de facto validation set, and you can no longer honestly measure generalization performance.

```python
from sklearn.model_selection import train_test_split

# First split: train+val vs test / Second split: train vs val (if imbalanced, use stratify to maintain ratios)
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.15, stratify=y, random_state=42
)
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.176, stratify=y_temp, random_state=42
)
```

`stratify=y` performs **stratified split**, maintaining each set's class proportions equal to the original. With imbalanced data, random splitting can result in almost no minority class in some sets, so stratification is mandatory.

> 🔍 **Deeper Dive**: For time series data, random splitting is a serious mistake. It causes look-ahead bias where the model learns from future data to predict the past. Time series should use temporal split based on time point: "past=train, future=test". Also, when data is scarce, instead of single split, **k-fold cross-validation** divides data k times to see average performance—reducing variation from split randomness.

## Summary

Data fairness and quality are checked along three axes. **Clarify** shows pre- and post-training bias (sensitive attribute facet, CI·DPL metrics) and explainability (SHAP), **class imbalance** is handled with SMOTE·class weight, etc., but must be applied only to training set after splitting, and **train/val/test split** uses stratification (for imbalance) and temporal split (for time series), viewing test only once. A fair and honestly evaluated model is more usable in practice than an accurate one.

Next, we'll comprehensively review this week's feature engineering and data quality — Data Wrangler, Feature Store, Clarify — and wrap up Week 3.

---

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
