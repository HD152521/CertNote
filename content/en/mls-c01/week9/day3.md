# Day 3 - Regression Evaluation Metrics: RMSE, MAE, MAPE, R², and Residual Analysis

## 📌 Key Takeaways

- Every regression metric differs only in how it compresses the **residual `y − ŷ`**. Do you square it, take the absolute value, or use a ratio?
- **MAE is robust to outliers** and **RMSE is sensitive to large errors.** Both are in the same unit as the target, and always `RMSE ≥ MAE`.
- **MAPE is a scale-free relative error**, but it's unusable when actual values are near 0 because the denominator blows up.
- **R² is explanatory power relative to "predicting the target mean."** If it's negative, it's a strong warning that the model is worse than the mean.
- Even when the metric looks good, if the **residual plot shows a pattern (U-shape, funnel, skew)**, the model's assumptions are broken.

## Starting From the Error

If classification asks "was it right or wrong," regression measures "how far off was it." For each sample i, the error is as follows.

```text
residual_i = y_i (actual value) - ŷ_i (predicted value)
```

Every regression metric gathers these errors and compresses them into one score. The difference lies in how the error is handled — do you square it, take the absolute value, or look at it as a ratio?

## MAE and RMSE

```text
MAE  = (1/n) Σ |y_i - ŷ_i|
MSE  = (1/n) Σ (y_i - ŷ_i)²
RMSE = √[ (1/n) Σ (y_i - ŷ_i)² ]
```

| Item | MAE | RMSE |
|---|---|---|
| Error handling | Absolute value | Square, then square root |
| Unit | Same as target (e.g., dollars) | Same as target |
| Outlier sensitivity | **Low (robust)** | **High (amplifies)** |
| Treatment of all errors | Equal | Weights large errors |
| Suitable situation | When outliers are a data quality problem | When a single large mistake is fatal |
| What it optimizes | Conditional median | Conditional mean |

```text
Errors [1, 1, 1, 1, 6]
MAE  = (1+1+1+1+6)/5 = 2.0
RMSE = √((1+1+1+1+36)/5) = √8 = 2.83  ← the error of 6 stands out more
```

- Even for the same set of errors, **RMSE ≥ MAE**, and the larger the gap between them, the more it suggests large errors (outliers) exist.
- If all error magnitudes are equal, RMSE = MAE. In other words, the gap itself is a diagnostic signal.
- RMSE is often used as the default evaluation/tuning metric for SageMaker built-in regression (XGBoost, Linear Learner, etc.).

The choice between RMSE and MAE is a question of "how heavily do you penalize large errors." RMSE penalizes large errors strongly through squaring, so it fits problems where a single large mistake is fatal (stockouts from under-forecasting demand, etc.). MAE reflects large errors only proportionally, so it is stable when outliers are a data quality problem (sensor errors, etc.).

## MAPE: Mean Absolute Percentage Error

```text
MAPE = (100%/n) Σ |y_i - ŷ_i| / |y_i|
```

It converts the error into a ratio (%) of the actual value and averages it.

- **Scale-free**: lets you compare prediction performance across different units/scales (e.g., several stores with different sales volumes)
- **Relative error** perspective: predicting 1100 for 1000 gives a MAPE of 10%
- **Trap**: if the actual value `y_i` is 0 or close to 0, the denominator blows up or becomes undefined

```text
[How the same absolute error of 1.0 looks depending on the actual value]

Actual y = 1000, predicted 1001  →  |1|/1000  =   0.1%
Actual y =   10, predicted 11    →  |1|/10    =  10.0%
Actual y =    1, predicted 2     →  |1|/1     = 100.0%
Actual y =  0.1, predicted 1.1   →  |1|/0.1   = 1000.0%   ← a single case dominates the average
Actual y =    0, predicted 1     →  |1|/0     = undefined (∞)
```

- It's useful when comparing items of different scale like demand forecasting, but **it's unsuitable when there are many values near 0.** Data where actual values of 0 are common, such as stockouts, off-seasons, and new products, is the typical case.
- MAPE is also **asymmetric.** Under-prediction is capped at 100% (when you predict 0), but over-prediction has no upper limit. So minimizing MAPE can bias the model toward predicting low.

> ⚠️ **Trap**: Don't pick MAPE just because you see "I want to compare stores with different scales." If the passage also says "some stores' sales are close to 0" or "there are days with no demand," MAPE is the wrong answer, and if scale correction is needed, consider RMSLE or per-store normalization.

## R²: Coefficient of Determination

```text
R² = 1 - (SS_res / SS_tot)
SS_res = Σ (y_i - ŷ_i)²        (sum of squared model errors)
SS_tot = Σ (y_i - ȳ)²          (variance relative to the mean line)
```

It measures "what % of the target's variance the model explains."

| R² value | Meaning |
|---|---|
| **1.0** | Perfect prediction (SS_res = 0) |
| 0.7 ~ 0.9 | Considerable explanatory power |
| **0** | Same level as simply predicting the mean (ȳ) |
| **Negative** | A model worse than the mean — it captures no signal at all |

- It has no unit, which is good for comparing across different problems, but **it doesn't tell you the absolute size of the error.** Even with an R² of 0.9, the RMSE could be too large for the business to bear.
- So look at R² (relative explanatory power) and RMSE/MAE (absolute error) **together.**

### R² vs. Adjusted R²

Adding features raises R² even when it means nothing. Even an unrelated column reduces SS_res slightly by fitting the noise.

```text
Adjusted R² = 1 - (1 - R²) × (n - 1) / (n - p - 1)
   n = number of samples,  p = number of features (explanatory variables)
```

| Item | R² | Adjusted R² |
|---|---|---|
| When features are added | Never decreases | **Decreases** if there is no contribution |
| Range of values | Max 1 (can be negative) | Max 1, always less than or equal to R² |
| Use | Explanatory power of a single model | **Comparing models with different numbers of features** |
| Pitfall | Looks better just by adding features | Gets sharply worse when sample size n is small and p is large |

The key point is that R² measures "how much better than the baseline." The baseline is always the target mean (ȳ). So a negative R² means the model is worse than the simple mean, a strong warning that the model captured no signal at all. RMSE/MAE tell you the absolute size of the error, and R² tells you relative explanatory power, complementing each other.

## Regression Metric Selection Table

| Metric | Unit | Outlier sensitivity | When to use | When not to use |
|---|---|---|---|---|
| **MAE** | Same as target | Low | When outliers are noise, when an easily interpreted error is needed | When you want to penalize large errors especially |
| **RMSE** | Same as target | High | When large mistakes are fatal, as the default tuning metric | When outliers are a data quality problem such as sensor errors |
| **MSE** | Square of the target unit | Very high | As an optimization loss function | When reporting results to people (the unit can't be interpreted) |
| **MAPE** | % (unitless) | Medium | Comparing items of different scale, when relative error is meaningful | **When the actual value is 0 or near 0** |
| **R²** | Unitless | High (sum-of-squares based) | When reporting explanatory power as a ratio | Decisions where absolute error size matters |
| **Adjusted R²** | Unitless | High | When comparing models with different numbers of features | When samples are very few |
| **RMSLE** | Log scale | Low | When the target is heavily skewed and relative error matters | When there are negative targets |

```
You need to choose a regression metric
├─ Does the data have extreme outliers, and are they errors?
│    ├─ Yes → MAE (robust because it doesn't square)
│    └─ No ↓
├─ Is a single large error fatal to the business? (stockouts, overcharging, etc.)
│    ├─ Yes → RMSE (penalizes large errors by squaring)
│    └─ No ↓
├─ Must items of widely varying scale be compared with one metric?
│    ├─ No actual values near 0 → MAPE
│    └─ Actual values of 0 are common → No MAPE, use RMSE/MAE or normalization
└─ Must you report "how much it explains" as a ratio?
     ├─ Single model → R²
     └─ Comparing models with different numbers of features → Adjusted R²
```

## Residual Analysis: What a Single Number Hides

Even if one metric says the model is good, the model may have a systematic flaw. Drawing a **residual plot** (predicted value vs. residual) reveals it.

```text
① Ideal — constant variance, no pattern     ② Funnel — heteroscedasticity
 Residual                                    Residual
  +│  ·  ·   ·  ·   ·                         +│        ·      ·
   │ ·   ·  ·   ·  ·                           │     ·     ·  ·   ·
  0├──·──·───·──·───·──→ Predicted            0├──·──·───·───·────·──→
   │  ·  ·  ·   ·  ·                           │     ·    ·   ·   ·
  -│   ·   ·  ·   ·                            -│        ·      ·
   → centered on residual 0, constant width     → spreads out as the prediction grows

③ U-shape/curve — nonlinearity not captured ④ Skew — systematic bias
 Residual                                    Residual
  +│ ·                    ·                    +│  ·  ·  ·  ·  ·  ·
   │  ·                 ·                       │ ·  ·  ·  ·  ·  ·
  0├────·─────────·────────→                  0├──────────────────────→
   │      ·   ·   ·                             │
  -│        · · ·                               │  (almost all above 0)
   → limit of a linear model, needs feature     → consistently under-predicting
     transformation
```

| Pattern | Diagnosis | Action |
|---|---|---|
| Random scatter, constant width | Normal | Proceed as is |
| Curve/U-shape | Nonlinearity not captured | Feature transformation (square, log), nonlinear models (trees, boosting) |
| Funnel shape | Heteroscedasticity | Log-transform the target, weighted regression |
| Skewed to one side | Bias, systematic over/under-prediction | Recheck intercept/features, check for data shift |
| Autocorrelation along the time axis | Time-series structure not reflected | Lag features, time-series models |

```python
import matplotlib.pyplot as plt

residuals = y_true - y_pred
plt.scatter(y_pred, residuals, alpha=0.3)
plt.axhline(0, color="red", linestyle="--")
plt.xlabel("Predicted value")
plt.ylabel("Residual (actual - predicted)")
# Random scatter is good; if you see a pattern, the model's assumptions are violated
```

### Look at the Distribution of Residuals Too

- If the residual histogram is **symmetric around 0**, it's normal. A long tail on one side means big mistakes in a particular direction keep recurring.
- If the mean deviates from 0, it signals that the whole model is consistently over- or under-predicting.
- If the residual distribution deviates greatly from a normal distribution or shows a pattern, you need to reexamine the model form or features even if the metric looks good.

Even with a low RMSE, if the residuals have a pattern, the model can't be trusted. That's because a single metric averages the errors into one number and erases "where and how" it's wrong. The residual plot restores the structure that the average hid — nonlinearity, heteroscedasticity, bias. On the exam, a passage like "the metric is good but it keeps being wrong in a particular range" points toward residual analysis / checking the model form.

## Regression Metrics in SageMaker

Built-in regression algorithms emit RMSE as the default validation metric. An example of a regression objective metric in Automatic Model Tuning:

```python
tuner = HyperparameterTuner(
    estimator=xgb_estimator,
    objective_metric_name="validation:rmse",  # regression default
    objective_type="Minimize",                 # it's an error, so minimize
    hyperparameter_ranges=ranges,
)
```

> ⚠️ **Trap**: Classification is usually **Maximize** (accuracy/F1/AUC), and regression is **Minimize** (RMSE/MAE). If you set `objective_type` the wrong way around, the tuner picks the worst model. If you use a regression metric where larger is better like R², then it's Maximize.

## Passage Clue → Answer Mapping

| Passage clue | Answer to pick | Reason |
|---|---|---|
| "Extreme outliers from sensor errors are mixed in" | MAE | Robust to outliers because it doesn't square |
| "RMSE is markedly larger than MAE" | A few large errors (outlier-like residuals) exist | Only RMSE is amplified by squaring |
| "Stockouts are fatal, so large under-forecasts must be avoided" | RMSE | Strongly penalizes large errors |
| "Compare stores with different sales volumes" | MAPE | Scale-free relative error |
| "But some stores' sales are close to 0" | MAPE is unsuitable | Distorted by the denominator blowing up |
| "R² came out at -0.2" | Worse than predicting the mean | The baseline is the target mean (ȳ) |
| "I added features and only R² went up" | Compare with Adjusted R² | Penalizes the number of features |
| "RMSE is good but the residuals form a U-curve" | Nonlinearity not captured → feature transformation/nonlinear model | Violates the assumed model form |
| "Residuals spread out as the prediction grows" | Heteroscedasticity → consider a log transform of the target | Classic funnel pattern |
| "What objective_type for regression tuning?" | Minimize (RMSE/MAE basis) | For error metrics, smaller is better |

Tomorrow we move on to tools that look into why a model is wrong — SageMaker Debugger, Clarify (bias detection, SHAP explainability), and error analysis.

## 📖 Glossary

- **Residual** : actual value − predicted value. The raw material of every regression metric, and because it has a sign it distinguishes over- from under-prediction.
- **MAE (Mean Absolute Error)** : the mean of the absolute values of the errors. Same unit as the target and robust to outliers.
- **RMSE (Root Mean Squared Error)** : square the errors, average them, then take the square root. Penalizes large errors heavily. Always at least MAE.
- **MAPE (Mean Absolute Percentage Error)** : the mean of the relative error obtained by dividing the error by the actual value (%). Breaks down when actual values are near 0.
- **R² (Coefficient of Determination)** : the ratio of how much better the model is than the baseline of predicting the target mean. Can be negative.
- **Adjusted R²** : R² penalized for the number of features. Used when comparing models with different numbers of explanatory variables.
- **Heteroscedasticity** : the phenomenon where the spread of errors differs across the prediction range. The funnel shape in a residual plot.
- **Residual plot** : a scatter plot with predicted values on the x-axis and residuals on the y-axis. Revives the structural flaws that a single metric number erased.
- **RMSLE** : compute RMSE after taking the log of actual and predicted values. Used when the target is heavily skewed and relative error matters.
- **objective_type** : the value in SageMaker tuning that specifies whether to raise or lower the objective metric. Error metrics are Minimize; accuracy, AUC, and R² are Maximize.

## 📝 Practice Questions

**Question 1.** The data has a few extreme outliers caused by sensor errors, and you want an evaluation metric that doesn't overreact to them. What is the most appropriate choice?

A) RMSE  
B) MAE  
C) R²  
D) The maximum residual  

**Answer: B**  
Explanation: MAE doesn't square the errors, so it is robust to extreme outliers and less swayed by them. RMSE (A) amplifies large errors by squaring, R² (C) is also sensitive because it is sum-of-squares based, and the maximum residual (D) is dominated by a single outlier.

---

**Question 2.** On the same prediction results, RMSE came out markedly larger than MAE. What does this suggest?

A) The model has data leakage  
B) All errors are identical  
C) Some large errors (outlier-like large residuals) exist  
D) The target variable is categorical  

**Answer: C**  
Explanation: RMSE amplifies large errors by squaring, so a large gap between RMSE and MAE means a few large errors exist. It is unrelated to data leakage (A) or a categorical target (D), and if all errors were equal (B), the two metrics would be nearly the same.

---

**Question 3.** You want to compare the prediction performance of several stores with widely varying sales volumes regardless of scale. However, some stores have sales close to 0. Which statement about the caveat of this metric is correct?

A) MAPE is scale-free, but when actual values are close to 0 the denominator blows up and it can be unsuitable  
B) MAPE is always stable even when the actual value is 0  
C) MAPE is an absolute error, so it is unsuitable for scale comparison  
D) MAPE is a classification-only metric  

**Answer: A**  
Explanation: MAPE is a relative metric that divides the error by the actual value, so it is useful for scale comparison, but when the actual value is 0 or close to 0 the denominator blows up and distorts it. It is not stable at 0 (B), it is a ratio rather than an absolute error (C), and it is a regression metric (D is wrong).

---

**Question 4.** A regression model's R² was calculated as -0.2. What does this mean?

A) It's a calculation error, and R² cannot be negative  
B) The model explains 20% of the variance  
C) The model is perfect  
D) The model performs worse than predicting with the target mean  

**Answer: D**  
Explanation: R²<0 is a strong warning that the model is worse than the baseline of predicting with the simple mean line (ȳ). R² can be negative (A is wrong), and a negative value doesn't mean 20% explanatory power (B) or perfection (C).

---

**Question 5.** The RMSE is low and satisfying, but the residual plot (predicted value vs. residual) shows a clear U-shaped curve. What is the most reasonable interpretation and action?

A) The metric is good, so deploy as is  
B) Residual plots are meaningful only for classification, so ignore it  
C) The model isn't capturing nonlinearity, so consider feature transformation or a nonlinear model  
D) Shuffling the data randomly will make the curve disappear  

**Answer: C**  
Explanation: A U-shaped/curved pattern in the residuals is a signal that the model failed to capture a nonlinear relationship, so you should consider feature transformation or a nonlinear model. Deploying by trusting only the metric (A) is risky, residual analysis is a core diagnostic of regression (B is wrong), and shuffling doesn't remove the cause of the pattern (D).

---
