# Day 2 - Feature Selection: Filter, Wrapper, Embedded, Importance, Multicollinearity

If Day 1's dimensionality reduction was "creating new synthetic axes," **feature selection** is "keeping only useful existing features." Both reduce dimensions, but selection preserves the **interpretability of original features**.

Today we cover three major approaches to selection—**filter, wrapper, and embedded**—feature importance methods, and **multicollinearity**, which complicates selection decisions.

## Why Feature Selection?

- Reduces overfitting: Irrelevant features train the model on noise
- Speeds up training and inference
- Increases interpretability: fewer features make model explanation easier
- Mitigates curse of dimensionality

> 💡 **Key Theory**: Feature selection and PCA both reduce dimensions but differ philosophically. PCA linearly combines all original features to create new axes, losing physical meaning of results. Selection retains a subset of original features, making it preferred in regulated industries (finance, healthcare) where you must explain "which variables were used in the prediction."

## Three Approaches

| Approach | How It Works | Strengths | Weaknesses | Examples |
|------|-----------|------|------|------|
| **Filter** | Score features by statistical metrics independent of model | Fast, model-agnostic | Ignores feature interactions | Correlation, chi-square, variance threshold, mutual information |
| **Wrapper** | Repeatedly train/evaluate model on feature subsets | Captures interactions, accurate | Very slow, overfitting risk | Forward selection, backward elimination, RFE |
| **Embedded** | Selection built into model training | Efficient and accurate balance | Model-dependent | Lasso (L1), tree feature importance |

### Filter Methods

Evaluate each feature independently by its relationship to the target. No model training, so it's fastest.

```python
from sklearn.feature_selection import SelectKBest, f_classif, mutual_info_classif

# Select top k features using ANOVA F-test
selector = SelectKBest(score_func=f_classif, k=20)
X_filtered = selector.fit_transform(X_train, y_train)

# For nonlinear relationships, use mutual information
mi_selector = SelectKBest(score_func=mutual_info_classif, k=20)
```

### Wrapper Methods: RFE

RFE (Recursive Feature Elimination) trains the model, removes the weakest feature, and repeats.

```python
from sklearn.feature_selection import RFE
from sklearn.ensemble import RandomForestClassifier

rfe = RFE(estimator=RandomForestClassifier(), n_features_to_select=15)
rfe.fit(X_train, y_train)
selected = X_train.columns[rfe.support_]
```

### Embedded Methods: L1 Regularization

```python
from sklearn.linear_model import Lasso

lasso = Lasso(alpha=0.01)
lasso.fit(X_scaled, y_train)
# Features with coefficient = 0 are automatically removed
selected = X_train.columns[lasso.coef_ != 0]
```

> 💡 **Key Theory**: Lasso achieves feature selection through L1 penalty geometry. The L1 constraint region is diamond-shaped; loss contours are likely to meet at vertices (axes, i.e., coefficient = 0). L2 (Ridge) is circular, shrinking coefficients toward zero but rarely to exactly zero. Hence "sparse solutions need L1."

## Feature Importance

Tree-based models provide feature importance after training.

| Method | Description | Caution |
|------|------|--------|
| Impurity-based (Gini/MDI) | Sum of impurity decrease from splits | Biased toward high-cardinality features |
| Permutation Importance | Shuffle feature, measure performance drop | Model-agnostic, but double-counts correlated features |
| SHAP Values | Game theory-based contribution | High computational cost, most consistent |

```python
import shap
explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X_test)
shap.summary_plot(shap_values, X_test)   # Visualize feature contributions
```

> 💡 **Key Theory**: Impurity-based importance exhibits bias toward high-cardinality features (continuous, multi-category) with many split candidates. Permutation importance randomly shuffles features in a trained model and measures performance drop, avoiding this bias. SHAP additively decomposes feature contributions for each prediction, providing both global and local explanations, but is computationally expensive. For exams, remember: "impurity-based biased toward high-cardinality; permutation and SHAP are more trustworthy."

## Multicollinearity

When two or more features are strongly correlated, **multicollinearity** arises. Linear models suffer unstable coefficients and distorted interpretation.

Diagnostic metrics:

| Metric | Threshold |
|------|------|
| Correlation matrix | \|r\| > 0.8–0.9 suspicious |
| VIF (Variance Inflation Factor) | VIF > 5 (caution), > 10 (severe) |

```python
from statsmodels.stats.outliers_influence import variance_inflation_factor
import pandas as pd

vif = pd.DataFrame()
vif["feature"] = X.columns
vif["VIF"] = [variance_inflation_factor(X.values, i) for i in range(X.shape[1])]
```

Remedies: remove one correlated feature, combine via PCA, or soften via L2 regularization (Ridge).

> 💡 **Key Theory**: VIF is calculated as VIF = 1/(1−R²), where R² comes from regressing one feature against all others. As R² approaches 1 (feature nearly perfectly predicted by others), VIF explodes. **Note: Tree-based models are insensitive to multicollinearity**—splits use one feature at a time. Multicollinearity is fatal for linear models where coefficient interpretation matters.

## Summary

- **Filter** (fast, model-agnostic) / **Wrapper** (accurate, slow) / **Embedded** (balanced, Lasso, trees)
- **Feature importance**: Impurity-based (biased), Permutation/SHAP (more reliable)
- **Multicollinearity**: Diagnose via correlation/VIF, deadly for linear models, ignorable for trees

## 📝 연습 문제

**문제 1.** 수천 개의 특성을 가진 데이터에서 모델을 학습하기 전에 가장 빠르게 무관한 특성을 1차로 걸러내고 싶다. 어떤 접근이 가장 적합한가?

A) 래퍼 방법(RFE)으로 부분집합을 반복 탐색  
B) 필터 방법(상호정보량·F-검정)으로 점수화  
C) 모든 특성 조합을 완전 탐색  
D) t-SNE로 2차원 축소  

**정답: B**  
해설: 필터 방법은 모델을 학습하지 않고 통계 지표로 점수화하므로 대규모 특성의 1차 선별에 가장 빠르다. RFE(A)와 완전 탐색(C)은 반복 학습으로 매우 느리고, t-SNE(D)는 특성 선택이 아니라 시각화 기법이다.

---

**문제 2.** 선형 회귀 모델에서 정확히 일부 특성의 계수를 0으로 만들어 자동 특성 선택 효과를 얻으려 한다. 적절한 규제는?

A) L2(Ridge) 규제  
B) 규제 없음  
C) 드롭아웃  
D) L1(Lasso) 규제  

**정답: D**  
해설: L1(Lasso) 규제는 마름모형 제약 기하 때문에 일부 계수를 정확히 0으로 만들어 희소 해를 유도한다. L2(A)는 계수를 줄이지만 0으로 만들지 않고, 규제 없음(B)은 선택 효과가 없으며, 드롭아웃(C)은 신경망 정규화 기법이다.

---

**문제 3.** 두 특성의 상관계수가 0.95이고 선형 회귀 계수가 불안정하다. 가장 적절한 진단·처리는?

A) VIF로 다중공선성을 확인하고 상관 특성 중 하나를 제거한다  
B) 두 특성을 모두 제곱해 다항 특성을 추가한다  
C) 타깃 변수를 로그 변환한다  
D) 학습률을 낮춘다  

**정답: A**  
해설: 강한 상관과 불안정한 계수는 다중공선성의 전형적 증상이므로 VIF로 확인하고 중복 특성을 제거(또는 PCA·Ridge로 완화)하는 것이 정석이다. 다항 특성 추가(B)는 상관을 악화시키고, 타깃 로그 변환(C)·학습률(D)은 다중공선성과 무관하다.

---

**문제 4.** 트리 기반 모델의 불순도 기반 특성 중요도에 대한 설명으로 옳은 것은?

A) 항상 가장 신뢰할 수 있는 중요도 지표다  
B) 모델과 무관하게 계산되는 모델 독립 지표다  
C) 고카디널리티(분할 후보가 많은) 특성을 과대평가하는 편향이 있다  
D) 선형 모델에서만 사용할 수 있다  

**정답: C**  
해설: 불순도 기반(MDI) 중요도는 분할 후보가 많은 고카디널리티 특성을 과대평가하는 편향이 알려져 있어, 순열 중요도나 SHAP이 더 신뢰된다. 따라서 항상 신뢰(A)는 틀리고, 모델 학습에 종속되므로 모델 독립(B)이 아니며, 트리 모델 지표이므로 선형 전용(D)도 틀리다.

---

**문제 5.** 규제 산업에서 "어떤 변수가 예측에 사용되었는지"를 설명해야 한다. PCA와 비교해 특성 선택을 선호하는 이유로 가장 적절한 것은?

A) 특성 선택이 항상 더 높은 정확도를 보장한다  
B) PCA는 분산을 보존하지 못한다  
C) 특성 선택은 표준화가 필요 없다  
D) 특성 선택은 원본 특성을 유지해 해석 가능성을 보존한다  

**정답: D**  
해설: PCA는 원본 특성을 선형 결합해 의미를 잃지만, 특성 선택은 원본 특성의 부분집합을 그대로 남기므로 "어떤 변수를 썼는지" 설명할 수 있다. 정확도 보장(A)은 사실이 아니고, PCA는 분산을 보존하며(B 오류), 표준화 필요 여부(C)는 선호 이유가 아니다.

---
