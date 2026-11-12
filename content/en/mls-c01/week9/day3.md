# Day 3 - Regression Evaluation Metrics: RMSE, MAE, MAPE, R² and Residual Analysis

Where classification asks "right or wrong?", regression asks "how far off?" **Residual** (prediction error) is raw material for all metrics. Today covers **RMSE, MAE, MAPE, R²** computation, character, meaning, plus **residual plots** revealing model flaws hiding in single scores.

## Residual: Starting Point

Per sample i, residual is the gap:

```text
residual_i = y_i (truth) - ŷ_i (prediction)
```

All regression metrics compress these gaps into one number. Difference: how errors are handled — squared?, absolute?, ratio?

## MAE: Mean Absolute Error

```text
MAE = (1/n) Σ |y_i - ŷ_i|
```

Absolute error average. Traits:

- **Intuitive unit**: Same as target (predict price → MAE in dollars)
- **Robust to outliers**: No squaring → one/two large errors don't explode score
- Treats errors equally

When data has outliers but we don't want oversensitivity, MAE shines.

## RMSE: Root Mean Squared Error

```text
RMSE = √[ (1/n) Σ (y_i - ŷ_i)² ]
```

Square errors, average, square-root back. Traits:

- **Interpretable unit** (square root keeps scale) → understandable
- **Sensitive to large errors**: Squared magnifies big mistakes
- For penalizing catastrophic misses

```text
Errors [1, 1, 1, 1, 6]
MAE  = (1+1+1+1+6)/5 = 2.0
RMSE = √((1+1+1+1+36)/5) = √8 = 2.83  ← 6 gets amplified
```

Same error set → RMSE ≥ MAE, gap size hints outliers. SageMaker builtin regression (XGBoost, Linear Learner) commonly use RMSE as default eval/tuning metric.

> 💡 **Related Theory**: RMSE vs MAE choice is "how much do we penalize large errors?" RMSE squares → hard penalty, one catastrophic miss matters. MAE proportional → outliers are data quality issues (sensor error). Match metric to what breaks your system.

## MAPE: Mean Absolute Percentage Error

```text
MAPE = (100%/n) Σ |y_i - ŷ_i| / |y_i|
```

Error as % of truth. Traits:

- **Scale-agnostic**: Compare across different units (sales at branches with different volumes)
- **Relative error**: 1000→1100 prediction = 10% error
- **Trap**: y_i near 0 or 0 → denominator explodes or undefined

Comparing different-scale items → MAPE useful. Lots of near-zero values → problematic.

## R²: Coefficient of Determination

```text
R² = 1 - (SS_res / SS_tot)
SS_res = Σ (y_i - ŷ_i)²        (model error sum-of-squares)
SS_tot = Σ (y_i - ȳ)²          (variance around mean)
```

"What % of target variance does model explain?" Traits:

- **R² = 1**: Perfect prediction
- **R² = 0**: Same as predicting mean ȳ
- **R² < 0**: Worse than mean
- **No units** → clean comparison, but hides absolute error size

Adding features inflates R² pointlessly → use **Adjusted R²** with feature-count penalty.

> 💡 **Related Theory**: R² is "better than baseline (mean)?" Baseline = always predict ȳ. Negative R² means model worse than baseline — red flag that model catches no signal. RMSE/MAE show absolute error size, R² shows relative explanatory power — both inform

## Residual Analysis: What Single Score Hides

Good metrics don't guarantee good model. **Residual plots** reveal systematic failures.

```text
Ideal: residuals scatter randomly around 0 (no patterns, constant spread)

Problem signals:
- Curved/U-shaped  → nonlinearity not captured (add features, nonlinear model)
- Funnel shape     → heteroscedasticity (variance changes with prediction size)
- Bias (one-sided) → systematic over/under-prediction
- Time-series auto-correlation → temporal structure missed
```

```python
import matplotlib.pyplot as plt

residuals = y_true - y_pred
plt.scatter(y_pred, residuals, alpha=0.3)
plt.axhline(0, color="red", linestyle="--")
plt.xlabel("prediction")
plt.ylabel("residual")
# Random scatter = good. Patterns = model assumption broken
```

Residuals' distribution far from normal → reassess model form/features.

> 💡 **Related Theory**: RMSE low but residual plots show patterns = **model assumptions broken**. Single score averages away "where" errors cluster. Residual plot restores it. "Metrics good but fails certain range?" → residual analysis target

## SageMaker Regression Metrics

Builtins output RMSE default for validation/tuning. Regression AMT example:

```python
tuner = HyperparameterTuner(
    estimator=xgb_estimator,
    objective_metric_name="validation:rmse",  # regression default
    objective_type="Minimize",                 # errors so minimize
    hyperparameter_ranges=ranges,
)
```

Classification uses Maximize (accuracy/F1/AUC), regression uses Minimize (RMSE/MAE).

## Summary

Regression metrics compress residuals into numbers. MAE robust to outliers, RMSE penalizes big errors, MAPE scale-agnostic, R² explains % of variance. Single score hides patterns — always plot residuals. Good RMSE + patterns in residuals = model form wrong.

Next: Tools diving in — Debugger, Clarify (bias detection, SHAP explanations), error analysis.

---

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
