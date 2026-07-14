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

## 📝 연습 문제

[Questions 1-5 in Korean, matching original...]
