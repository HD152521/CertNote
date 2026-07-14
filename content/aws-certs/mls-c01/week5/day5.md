# Day 5 - Week 5 Comprehensive Review: Statistics and Validation Design

This week covered the second half of EDA — **statistical foundation** and **validation design**. Honestly summarizing data (statistics), reading relationships between variables (correlation), avoiding pitfalls that contaminate evaluation (leakage), and reliably estimating generalization performance (validation). These four form the final gate of MLS-C01 Domain 2 and hide the answer to the practical question "why does my model fail in production?" Today we review four days as one integrated flow.

## One-Page Summary: Statistics → Correlation → Leakage → Validation

```text
[Data]
   │
   ├─ 1) Statistical Foundations (Day1)
   │     Distribution: Check skew/kurtosis first (Anscombe's quartet)
   │     Center: Median if skewed, mean if symmetric
   │     Spread: std/IQR, robustness = IQR
   │     Transform: Linear (standardization) = shape unchanged, log/Box-Cox = reduce skew
   │     Sample ↔ Population: CLT, suspect representativeness/bias
   │
   ├─ 2) Correlation and Relationships (Day2)
   │     Pearson (linear) vs Spearman (monotonic, robust)
   │     Correlation ≠ causation: reverse causation, confounders, chance
   │     Multicollinearity: VIF>5~10, linear model coefficients unstable (trees robust)
   │     Categorical: chi-square / Cramér's V
   │
   ├─ 3) Data Leakage (Day3)
   │     Target leakage: result info enters → splitting misses it, check timing
   │     Time series leakage: forbid random split, future windows
   │     Train-test contamination: after split, fit only on training, wrap with Pipeline
   │
   └─ 4) Validation Design (Day4)
         3-way split: test sealed until end, seen once only
         k-fold: conserve data, mean ± std (k=5/10)
         Stratified: essential for imbalanced classification
         Time series: TimeSeriesSplit (past → future)
```

## Core Decision-Making Summary

### Center·Spread: What Do We Report?

| Situation | Center | Spread |
|------|------|------|
| Symmetric distribution | Mean | Std deviation |
| Skew, outliers | Median | IQR |
| Categorical | Mode | — |

### Transformation: Change the Shape?

| Treatment | Distribution Shape |
|------|------|
| Standardization, min-max (linear) | **Unchanged** (skew preserved) |
| Log, square root (nonlinear) | Reduce right skew |
| Box-Cox, Yeo-Johnson | Closer to normal |

### Correlation Coefficient: What to Use?

| Relationship·Data | Recommended |
|------|------|
| Linear, continuous | Pearson |
| Nonlinear, monotonic, outliers | Spearman |
| Two categorical | Chi-square / Cramér's V |
| Multicollinearity diagnosis | Correlation heatmap + VIF |

### Leakage Prevention: Golden Rules

| Principle | Implementation |
|------|------|
| Split first | Priority over preprocessing |
| Fit only on training | Scaler, encoder, imputer |
| Use Pipeline | Auto-isolation per fold |
| Time series time-ordered | No random split |
| Audit feature creation | "Knowable at prediction?" |

### Validation Strategy Selection

| Data Characteristic | Recommended Validation |
|------|------|
| General classification, sufficient data | Stratified 3-way split |
| Data limited | Stratified k-fold |
| Class imbalance | Must stratify |
| Time series | TimeSeriesSplit |
| Group structure (users, patients) | GroupKFold |

## Most Confusing Exam Points

> 💡 **Related Theory**: This week's content converges on one question — **"Can I trust my validation score?"** Statistics (distribution, samples) ensure data represents the population, correlation analysis prevents mistaking correlation for causation, leakage checks prevent future/outcome information seeping, and validation design ensures the test set is truly independent. If any one of these four breaks down, validation scores aren't generalization — they're illusions.

Integrated checklist:

```python
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_val_score

# Block leakage + handle imbalance together: Pipeline + StratifiedKFold
pipe = Pipeline([
    ("impute", SimpleImputer(strategy="median")),  # median for skew
    ("scale", StandardScaler()),                    # fit only on fold training portion
    ("clf", LogisticRegression(class_weight="balanced")),
])
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(pipe, X, y, cv=skf, scoring="f1")
print(f"F1: {scores.mean():.3f} ± {scores.std():.3f}")
```

> ⚠️ **Pitfall Summary**: ① Standardization removes skew (no, shape unchanged). ② Strong correlation means causation (no, suspect confounders). ③ Good splitting eliminates leakage (no, target leakage escapes). ④ Scale entire data then split (no, leakage). ⑤ Random split time series (no, time order). ⑥ Random split imbalanced data (no, stratify). ⑦ Tune on test set (no, seal once only).

## Next Week Preview

Next week we move beyond EDA to **Modeling (Domain 3)**. On the foundation of statistics and validation we've built, we'll see how algorithm choice, training, and evaluation work. If you've mastered validation design, you'll be able to judge "should I trust this score?" on your own during modeling.

## Summary

This week in one sentence: **"Honest validation scores rest only on good statistics, relationship understanding, leakage blocking, and validation design."** Check distribution first (skew, robust statistics), don't mistake correlation for causation (confounders), audit leakage by timing (target, time series, preprocessing), and design validation matching data (stratification, cross-validation, time series split). When all four are in place, every decision in model selection becomes trustworthy.

---

## 📝 연습 문제

**문제 1.** 오른쪽으로 치우친 변수를 표준화(StandardScaler)했더니 평균이 0, 표준편차가 1이 됐다. 분포의 치우침은 어떻게 됐는가?

A) 왜도가 그대로 유지된다 — 선형 변환은 모양을 바꾸지 않는다  
B) 치우침이 사라지고 정규분포가 됐다  
C) 왼쪽 치우침으로 뒤집힌다  
D) 첨도만 0이 된다  

**정답: A**  
해설: 표준화는 선형 변환으로 위치와 척도만 바꾸고 왜도·첨도 같은 분포의 모양은 보존한다. 따라서 치우침은 그대로다. 치우침을 완화하려면 로그·Box-Cox 같은 비선형 변환이 필요하다. 정규화된다(B)거나 뒤집힌다(C), 첨도만 변한다(D)는 모두 선형 변환의 성질에 어긋난다.

---

**문제 2.** 검증 정확도와 테스트 정확도는 모두 98%인데 프로덕션 성능은 60%로 떨어졌다. 분할은 깨끗했다. 가장 유력한 원인은?

A) 데이터가 너무 많다  
B) k가 너무 크다  
C) 특성에 결과 정보가 포함된 타깃 누수  
D) 학습률이 낮다  

**정답: C**  
해설: 분할이 깨끗한데도 검증·테스트가 모두 높고 프로덕션만 낮다면, 누수가 특성 안에 들어 있어 모든 분할이 똑같이 오염된 타깃 누수가 가장 유력하다. 타깃 누수는 분할로 잡히지 않으며 각 특성의 생성 시점을 점검해야 한다. 데이터 양(A), k(B), 학습률(D)로는 이 패턴이 설명되지 않는다.

---

**문제 3.** 두 변수의 Pearson 상관이 0.9로 매우 높다. 올바른 해석은?

A) 한 변수가 다른 변수의 원인임이 입증됐다  
B) 강한 선형 관계가 있으나 인과는 별개이며 교란변수·역인과를 의심해야 한다  
C) 두 변수는 반드시 독립이다  
D) 비선형 관계가 강하다  

**정답: B**  
해설: 높은 Pearson 상관은 강한 선형 관계를 의미할 뿐 인과를 입증하지 못한다. 교란변수·역인과·우연 가능성을 따져야 한다(A는 오류). 상관이 높으므로 독립이 아니며(C), Pearson은 선형 관계를 측정하므로 비선형이 강하다는 해석(D)도 틀리다.

---

**문제 4.** 클래스가 95:5로 불균형한 분류 데이터를 5-fold 교차검증한다. 일부 fold에서 소수 클래스가 거의 없어 지표가 왜곡됐다. 해결책은?

A) 일반 KFold를 그대로 쓴다  
B) TimeSeriesSplit으로 바꾼다  
C) StratifiedKFold로 각 fold에 클래스 비율을 유지한다  
D) fold 수를 2로 줄인다  

**정답: C**  
해설: 불균형 데이터의 교차검증은 각 fold에서 클래스 비율을 원본과 동일하게 유지하는 StratifiedKFold가 정답이다. 일반 KFold(A)는 소수 클래스가 일부 fold에 부족해지는 문제를 그대로 두고, TimeSeriesSplit(B)은 시계열 전용이며, fold 수를 줄이는 것(D)은 비율 문제를 해결하지 못한다.

---

**문제 5.** scikit-learn에서 결측 대치와 스케일링을 교차검증 시 누수 없이 적용하려 한다. 가장 적절한 구성은?

A) 전체 데이터로 대치·스케일링한 뒤 cross_val_score 호출  
B) 테스트 fold의 통계로 전처리한다  
C) 전처리를 생략하고 원본으로 학습한다  
D) 대치·스케일링·분류기를 Pipeline에 넣어 cross_val_score에 전달  

**정답: D**  
해설: 전처리 단계를 Pipeline으로 묶어 교차검증에 전달하면 각 fold의 학습 부분에서만 `fit`이 일어나고 검증 부분에는 `transform`만 적용돼 누수가 차단된다. 전체 데이터로 미리 전처리(A)하거나 테스트 fold 통계를 쓰면(B) 누수가 발생하고, 전처리 생략(C)은 해결책이 아니다.

---
