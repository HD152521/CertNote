# Day 3 - Regression Evaluation Metrics: RMSE, MAE, MAPE, R² and Residual Analysis

## 📌 Key Takeaways

- Regression metrics all differ only in how they compress the **residual `y − ŷ`**: squared, absolute, or as a ratio.
- **MAE is robust to outliers** and **RMSE is sensitive to large errors**. Both are in the same units as the target, and always `RMSE ≥ MAE`.
- **MAPE is a scale-free relative error**, but if actual values are near 0 the denominator explodes and it cannot be used.
- **R² is explanatory power relative to "predicting the target mean."** A negative value is a strong warning that the model is even worse than the mean.
- Even when a metric looks good, if the **residual plot shows a pattern (U-shape, funnel, skew)**, the model's assumptions are broken.

## Starting from the Error

If classification asks "right or wrong?", regression measures "how far off?" For each sample i, the error is as follows.

```text
residual_i = y_i (actual value) - ŷ_i (predicted value)
```

Every regression metric gathers these errors and compresses them into a single score. The difference lies in how the errors are treated: squared, taken as absolute values, or viewed as a ratio.

## MAE and RMSE

```text
MAE  = (1/n) Σ |y_i - ŷ_i|
MSE  = (1/n) Σ (y_i - ŷ_i)²
RMSE = √[ (1/n) Σ (y_i - ŷ_i)² ]
```

| Item | MAE | RMSE |
|---|---|---|
| Error handling | Absolute value | Square, then square root |
| Units | Same as target (e.g., dollars) | Same as target |
| Outlier sensitivity | **Low (robust)** | **High (amplified)** |
| Treatment of all errors | Equal | Weights large errors |
| Suitable situation | When outliers are a data quality problem | When a single big mistake is fatal |
| Optimization target | Conditional median | Conditional mean |

```text
Errors [1, 1, 1, 1, 6]
MAE  = (1+1+1+1+6)/5 = 2.0
RMSE = √((1+1+1+1+36)/5) = √8 = 2.83  ← the error of 6 stands out more
```

- Even for the same set of errors, **RMSE ≥ MAE**, and the larger the gap between them, the more it suggests large errors (outliers) exist.
- If all error magnitudes are equal, RMSE = MAE. In other words, the gap itself is a diagnostic signal.
- RMSE is often the default evaluation/tuning metric for SageMaker built-in regression (XGBoost, Linear Learner, etc.).

Choosing between RMSE and MAE is a question of "how heavily do you penalize large errors?" RMSE penalizes large errors strongly through squaring, so it suits problems where a single big mistake is fatal (such as stockouts caused by under-forecasting demand). MAE reflects large errors only proportionally, so it is stable when outliers are a data quality problem (such as sensor errors).

## MAPE: Mean Absolute Percentage Error

```text
MAPE = (100%/n) Σ |y_i - ŷ_i| / |y_i|
```

It converts the error into a percentage of the actual value and averages it.

- **Scale-free**: lets you compare predictive performance across different units/scales (e.g., several stores with different sales volumes)
- From a **relative error** viewpoint: predicting 1100 for 1000 gives a MAPE of 10%
- **Trap**: if the actual value `y_i` is 0 or close to 0, the denominator explodes or is undefined

```text
[How the same absolute error of 1.0 looks depending on the actual value]

Actual y = 1000, predicted 1001  →  |1|/1000  =   0.1%
Actual y =   10, predicted 11    →  |1|/10    =  10.0%
Actual y =    1, predicted 2     →  |1|/1     = 100.0%
Actual y =  0.1, predicted 1.1   →  |1|/0.1   = 1000.0%   ← one case dominates the average
Actual y =    0, predicted 1     →  |1|/0     = undefined (∞)
```

- It is useful for comparing items of different scales, such as demand forecasting, but **unsuitable when many values are near 0**. Data where an actual value of 0 is common — stockouts, off-season, new products — is the typical case.
- MAPE is also **asymmetric**. Under-forecasting is capped at 100% (when predicting 0), but over-forecasting has no upper limit. So minimizing MAPE can bias the model toward predicting low.

> ⚠️ **Trap**: Do not choose MAPE just from "we want to compare stores of different scales." If the passage also says "some stores' sales are near 0" or "there are days with no demand," MAPE is the wrong answer; if scale correction is needed, consider RMSLE or per-store normalization.

## R²: Coefficient of Determination

```text
R² = 1 - (SS_res / SS_tot)
SS_res = Σ (y_i - ŷ_i)²        (sum of squared model errors)
SS_tot = Σ (y_i - ȳ)²          (variance relative to the mean line)
```

It measures "what percentage of the target variance the model explains."

| R² value | Meaning |
|---|---|
| **1.0** | Perfect prediction (SS_res = 0) |
| 0.7 ~ 0.9 | Considerable explanatory power |
| **0** | Same level as simply predicting the mean value (ȳ) |
| **Negative** | A model worse than the mean — captures no signal at all |

- It is unitless, which is good for comparing across different problems, but it **does not tell you the absolute error size**. Even with R² of 0.9, RMSE may be a size the business cannot tolerate.
- So R² (relative explanatory power) and RMSE/MAE (absolute error) are viewed **together**.

### R² vs Adjusted R²

When you add features, R² rises even when it is meaningless. Even an unrelated column reduces SS_res a little by fitting the noise.

```text
Adjusted R² = 1 - (1 - R²) × (n - 1) / (n - p - 1)
   n = number of samples,  p = number of features (explanatory variables)
```

| Item | R² | Adjusted R² |
|---|---|---|
| When a feature is added | Never decreases | **Decreases** if it contributes nothing |
| Range of values | Max 1 (can be negative) | Max 1, always less than or equal to R² |
| Use | Explanatory power of a single model | **Comparing models with different numbers of features** |
| Trap | Looks better just by adding features | Worsens sharply when sample size n is small and p is large |

The key point of R² is that it measures "how much better than a baseline." The baseline is always the target mean (ȳ). So a negative R² means the model is worse than the simple mean, a strong warning that the model captured no signal at all. RMSE/MAE tell you the absolute error size, and R² tells you the relative explanatory power, complementing each other.

## Regression Metric Selection Table

| Metric | Units | Outlier sensitivity | When to use | When not to use |
|---|---|---|---|---|
| **MAE** | Same as target | Low | When outliers are noise, when an easy-to-interpret error is needed | When you want to penalize large errors specially |
| **RMSE** | Same as target | High | When big mistakes are fatal, default tuning metric | When outliers are a data quality problem such as sensor errors |
| **MSE** | Square of the target units | Very high | As an optimization loss function | When reporting results to people (units cannot be interpreted) |
| **MAPE** | % (unitless) | Medium | Comparing items of different scales, when relative error is meaningful | **When actual values are 0 or near 0** |
| **R²** | Unitless | High (sum-of-squares based) | When reporting explanatory power as a ratio | Decisions where absolute error size matters |
| **Adjusted R²** | Unitless | High | When comparing models with different numbers of features | When samples are very few |
| **RMSLE** | Log scale | Low | When the target is heavily skewed and relative error matters | When there are negative targets |

```
You need to choose a regression metric
├─ Does the data have extreme outliers, and are they errors?
│    ├─ Yes → MAE (robust since it does not square)
│    └─ No ↓
├─ Is a single large error fatal to the business? (stockouts, overcharging, etc.)
│    ├─ Yes → RMSE (penalizes large errors by squaring)
│    └─ No ↓
├─ Do you need one metric to compare items of widely varying scale?
│    ├─ No actual values near 0 → MAPE
│    └─ Actual values of 0 are common → MAPE forbidden, RMSE/MAE or normalization
└─ Do you need to report "how much it explains" as a ratio?
     ├─ Single model        → R²
     └─ Comparing models with different numbers of features → Adjusted R²
```

## Residual Analysis: What a Single Number Hides

Even when you judge a model good by one metric, it can have systematic flaws. Drawing a **residual plot** (predicted value vs residual) reveals them.

```text
① Ideal — constant variance, no pattern     ② Funnel — heteroscedasticity
 Residual                                    Residual
  +│  ·  ·   ·  ·   ·                         +│        ·      ·
   │ ·   ·  ·   ·  ·                           │     ·     ·  ·   ·
  0├──·──·───·──·───·──→ Predicted            0├──·──·───·───·────·──→
   │  ·  ·  ·   ·  ·                           │     ·    ·   ·   ·
  -│   ·   ·  ·   ·                            -│        ·      ·
   → Centered on residual 0, constant width    → Spreads as the predicted value grows

③ U-shape/curve — nonlinearity not captured ④ Skew — systematic bias
 Residual                                    Residual
  +│ ·                    ·                    +│  ·  ·  ·  ·  ·  ·
   │  ·                 ·                       │ ·  ·  ·  ·  ·  ·
  0├────·─────────·────────→                  0├──────────────────────→
   │      ·   ·   ·                             │
  -│        · · ·                               │  (almost all above 0)
   → Limit of a linear model, feature            → Consistently under-predicting
     transformation needed
```

| Pattern | Diagnosis | Action |
|---|---|---|
| Random scatter, constant width | Normal | Proceed as is |
| Curve/U-shape | Nonlinearity not captured | Feature transformation (square, log), nonlinear model (trees, boosting) |
| Funnel shape | Heteroscedasticity | Log-transform the target, weighted regression |
| Skewed to one side | Bias, systematic over/under-prediction | Recheck intercept/features, check for data shift |
| Autocorrelation along the time axis | Time-series structure not reflected | Lag features, time-series model |

```python
import matplotlib.pyplot as plt

residuals = y_true - y_pred
plt.scatter(y_pred, residuals, alpha=0.3)
plt.axhline(0, color="red", linestyle="--")
plt.xlabel("Predicted value")
plt.ylabel("Residual (actual - predicted)")
# Random scatter is good; if a pattern appears, the model's assumptions are violated
```

### Also Look at the Distribution of Residuals

- If the residual histogram is **symmetric around 0**, it is normal. A long tail on one side means big mistakes in a particular direction repeat.
- If the mean deviates from 0, it is a signal that the model as a whole consistently over- or under-predicts.
- If the residual distribution deviates greatly from a normal distribution or shows a pattern, you must reexamine the model form or features even if the metric looks good.

Even with a low RMSE, if the residuals show a pattern, the model cannot be trusted. A single metric averages errors into one number and erases "where and how" the model is wrong. The residual plot restores the structure that average hid: nonlinearity, heteroscedasticity, and bias. On the exam, a passage like "the metric is good but it keeps being wrong in a certain range" points to residual analysis / checking the model form.

## Regression Metrics in SageMaker

Built-in regression algorithms emit RMSE as the default validation metric. An example regression objective metric in Automatic Model Tuning:

```python
tuner = HyperparameterTuner(
    estimator=xgb_estimator,
    objective_metric_name="validation:rmse",  # regression default
    objective_type="Minimize",                 # it is an error, so minimize
    hyperparameter_ranges=ranges,
)
```

> ⚠️ **Trap**: Classification is usually **Maximize** (accuracy/F1/AUC), and regression is **Minimize** (RMSE/MAE). If you set `objective_type` the other way around, the tuner picks the worst model. If you use a regression metric where larger is better, like R², then it is Maximize.

## Passage Clue → Answer Mapping

| Passage clue | Answer to choose | Reason |
|---|---|---|
| "Extreme outliers from sensor errors are mixed in" | MAE | Robust to outliers since it does not square |
| "RMSE is markedly larger than MAE" | A few large errors (outlier-like residuals) exist | Only RMSE is amplified by squaring |
| "Stockouts are fatal, so large under-forecasts must be avoided" | RMSE | Penalizes large errors strongly |
| "Comparing stores with different sales volumes" | MAPE | Scale-free relative error |
| "However, some stores' sales are near 0" | MAPE unsuitable | Distorted by the exploding denominator |
| "R² came out at -0.2" | Worse than predicting the mean | The baseline is the target mean (ȳ) |
| "We added features and only R² went up" | Compare with Adjusted R² | Penalizes the number of features |
| "RMSE is good but the residuals form a U-curve" | Nonlinearity not captured → feature transformation/nonlinear model | Violation of the model form assumption |
| "Residuals spread as the predicted value grows" | Heteroscedasticity → consider log-transforming the target | Classic funnel pattern |
| "What is objective_type for regression tuning?" | Minimize (for RMSE/MAE) | Error metrics are better when smaller |

Tomorrow we move on to tools that look into why a model is wrong: SageMaker Debugger, Clarify (bias detection, SHAP explainability), and error analysis.

## 📖 Glossary

- **Residual**: Actual value − predicted value. The raw material of all regression metrics; being signed, it distinguishes over- from under-prediction.
- **MAE (mean absolute error)**: The mean of absolute errors. Same units as the target and robust to outliers.
- **RMSE (root mean squared error)**: Square the errors, average them, then take the square root. It penalizes large errors heavily. Always greater than or equal to MAE.
- **MAPE (mean absolute percentage error)**: The mean (%) of the relative error obtained by dividing the error by the actual value. It breaks down when actual values are near 0.
- **R² (coefficient of determination)**: The ratio of how much better the model is than the baseline of predicting the target mean. It can be negative.
- **Adjusted R²**: R² with a penalty for the number of features. Used when comparing models with different numbers of explanatory variables.
- **Heteroscedasticity**: The phenomenon where the spread of errors differs across the prediction range. The funnel shape in a residual plot.
- **Residual plot**: A scatter plot with predicted values on the horizontal axis and residuals on the vertical axis. It revives the structural flaws that a single metric number erased.
- **RMSLE**: Compute RMSE after taking the log of the actual and predicted values. Used when the target is heavily skewed and relative error matters.
- **objective_type**: The value in SageMaker tuning that specifies whether to maximize or minimize the objective metric. Error metrics are Minimize; accuracy, AUC, and R² are Maximize.

## 📝 Practice Questions

**Question 1.** The data contains a few extreme outliers caused by sensor errors, and you want an evaluation metric that does not react too sensitively to them. Which is the most appropriate?

A) RMSE  
B) MAE  
C) R²  
D) Maximum of the residuals  

**Answer: B**  
Explanation: MAE does not square the errors, so it is robust to extreme outliers and is less swayed by them. RMSE (A) amplifies large errors by squaring, R² (C) is also sensitive because it is based on sums of squares, and the maximum residual (D) is determined by a single outlier.

---

**Question 2.** On the same predictions, RMSE came out noticeably larger than MAE. What does this imply?

A) The model has data leakage  
B) All errors are identical  
C) Some large errors (large outlier-like residuals) exist  
D) The target variable is categorical  

**Answer: C**  
Explanation: RMSE amplifies large errors by squaring, so a large gap between RMSE and MAE means a few large errors exist. It is unrelated to data leakage (A) or a categorical target (D), and if all errors were equal (B), the two metrics would be nearly the same.

---

**Question 3.** You want to compare forecast performance across several stores with very different sales scales, regardless of scale. However, some stores have sales close to 0. Which is a correct caveat for this metric?

A) MAPE is scale-independent, but when actual values are close to 0 the denominator blows up and it may be unsuitable  
B) MAPE is always stable even when actual values are 0  
C) MAPE is an absolute error, so it is unsuitable for scale comparison  
D) MAPE is a classification-only metric  

**Answer: A**  
Explanation: MAPE is a relative metric that divides the error by the actual value, so it is useful for scale comparison, but when the actual value is 0 or close to 0, the denominator blows up and distorts it. It is not stable at 0 (B), it is a ratio rather than an absolute error (C), and it is a regression metric (D is wrong).

---

**Question 4.** A regression model's R² was calculated as -0.2. What does this mean?

A) It is a calculation error, and R² cannot be negative  
B) The model explains 20% of the variance  
C) The model is perfect  
D) The model performs worse than simply predicting the target mean  

**Answer: D**  
Explanation: R² < 0 is a strong warning that the model is worse than the baseline of predicting with the simple mean line (ȳ). R² can be negative (A is wrong), and a negative value does not mean 20% explanatory power (B) or perfection (C).

---

**Question 5.** RMSE is low and satisfying, but the residual plot (predicted values vs. residuals) shows a clear U-shaped curve. What is the most reasonable interpretation and action?

A) The metric is good, so deploy as is  
B) Ignore it, since residual plots are meaningful only for classification  
C) The model is failing to capture nonlinearity, so consider feature transformations or a nonlinear model  
D) Shuffling the data randomly will make the curve disappear  

**Answer: C**  
Explanation: A U-shaped/curved pattern in the residuals is a signal that the model has not captured a nonlinear relationship, so you should consider feature transformations or a nonlinear model. Deploying based on the metric alone (A) is risky, residual analysis is a core diagnostic for regression (B is wrong), and shuffling does not remove the cause of the pattern (D).
