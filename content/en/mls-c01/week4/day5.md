# Day 5 - Week 4 Comprehensive Review: Dimensionality, Feature Selection, Visualization, Imbalance

Week 4 covered the second cluster of EDA—**techniques for handling high dimensions and class imbalance**. Today we knit four days into one workflow, review holistically, and highlight exam traps.

## Week 4 at a Glance

| Day | Topic | Essentials |
|-----|------|------|
| 1 | Dimensionality reduction | Curse of dimensionality, PCA (variance preservation, standardization mandatory), t-SNE (visualization only) |
| 2 | Feature selection | Filter, wrapper, embedded; feature importance; multicollinearity (VIF) |
| 3 | Data visualization | Distribution, correlation charts; QuickSight; Anscombe's lesson |
| 4 | Class imbalance | Accuracy paradox; SMOTE, undersampling; class weights; PR-AUC |

## Unified Workflow

Typical EDA and preprocessing order for high-dimensional, imbalanced data.

```python
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline

# 1) Split first—all fit on train only (prevent leakage)
X_tr, X_te, y_tr, y_te = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42)

# 2) Visualize distribution, correlation, imbalance (on train)
#    Histograms/boxplots, correlation heatmap, class distribution bar

# 3) Standardize → dimensionality reduce (or feature selection)
# 4) Resample in train only, within Pipeline
pipe = Pipeline([
    ("scaler", StandardScaler()),
    ("pca", PCA(n_components=0.95)),
    ("smote", SMOTE(random_state=42)),
])
X_tr_proc, y_tr_proc = pipe.fit_resample(X_tr, y_tr)
```

> 💡 **Key Theory**: This workflow's binding principle: "**split first, fit training set only**." Standardization, PCA, SMOTE, feature selection, imputation—all data-dependent transformations must learn statistics/rules from the training set and apply only to test. This one principle threads from Week 3 (cleaning, encoding) through Week 4 (dimensionality, imbalance).

## Confusing Comparisons

### PCA vs Feature Selection

| Distinction | PCA | Feature Selection |
|------|-----|-----------|
| Result features | Synthetic axes (meaning lost) | Original subset (interpretability kept) |
| Type | Unsupervised | Both supervised and unsupervised |
| Multicollinearity | Resolved via orthogonal axes | Remove correlated features |
| Regulated industry | Hard to explain | Explainable, preferred |

### PCA vs t-SNE

- **PCA**: Linear, preserves global variance, `transform` new data possible, suitable for model preprocessing
- **t-SNE**: Nonlinear, preserves local structure, requires retraining, **visualization-only**

### Imbalance Response Choices

- Data modifiable + diversity needed → **SMOTE**
- Huge data + speed matters → **Undersampling**
- Keep data unchanged → **Class weights** / **Threshold tuning**

> 💡 **Key Theory**: Three frequent exam traps: (1) "Use t-SNE embeddings as classifier input" → wrong (visualization only). (2) "Accuracy 99% in imbalanced data is good" → accuracy paradox. (3) "Apply SMOTE/scaling before split" → data leakage. Mastering these three solidifies EDA section scores.

## AWS Service Mapping Review

| Task | Service/Tool |
|------|-------------|
| Large-scale PCA | SageMaker built-in PCA (`randomized` mode) |
| Visual data prep and distribution reports | SageMaker Data Wrangler |
| Code-based EDA visualization | SageMaker notebook (seaborn/matplotlib) |
| BI dashboards and ML Insights | Amazon QuickSight |
| Serverless SQL analysis on S3 | Amazon Athena (+ QuickSight) |
| Pre-training bias and distribution check | SageMaker Clarify |

## Exam Prep Summary

- **Curse of dimensionality**: High dimensions lose distance discriminability → distance-based (KNN, K-means) vulnerable
- **PCA**: Preserve variance, standardization mandatory, select k by explained variance ratio
- **t-SNE**: Visualization-only, inter-cluster distance meaningless
- **Feature selection 3 types**: Filter (fast, independent) / Wrapper (accurate, slow) / Embedded (Lasso, trees)
- **Multicollinearity**: VIF > 5–10 caution; deadly for linear, ignorable for trees
- **Visualization**: Don't trust summary stats alone—visualize (Anscombe); Pearson is linear-only
- **Imbalance**: Accuracy paradox; SMOTE on training set only; PR-AUC; class weights/threshold tuning

## 📝 연습 문제

**문제 1.** Week 3·4를 관통하는, 표준화·PCA·SMOTE·결측 대치에 공통으로 적용되는 누수 방지 원칙은?

A) 모든 변환을 전체 데이터에 한 번에 적용한다  
B) 테스트셋에서 통계량을 계산해 학습에 적용한다  
C) 변환 순서는 중요하지 않다  
D) 데이터를 먼저 분할하고 모든 fit은 학습셋에서만 수행한다  

**정답: D**  
해설: 데이터 의존 변환은 학습셋에서 학습한 통계/규칙을 테스트에 적용만 해야 누수가 없다 — "분할 먼저, fit은 학습셋에서만"이 일관된 원칙이다. 전체 적용(A)·테스트 통계 사용(B)은 누수를 일으키고, 순서 무관(C)도 틀리다.

---

**문제 2.** 규제 산업에서 어떤 변수가 예측에 사용되었는지 설명해야 하고 다중공선성도 다뤄야 한다. PCA 대신 더 적절한 접근은?

A) t-SNE 임베딩을 입력으로 사용  
B) 상관·VIF 기반 특성 선택으로 해석 가능한 부분집합 유지  
C) 무작위로 절반의 특성을 버림  
D) 모든 특성을 그대로 사용  

**정답: B**  
해설: 특성 선택은 원본 특성을 유지해 해석 가능성을 보존하면서 상관·VIF로 다중공선성도 처리한다. t-SNE(A)는 시각화 전용·해석 불가, 무작위 제거(C)는 정보 손실, 전부 사용(D)은 다중공선성을 방치한다.

---

**문제 3.** 다음 중 옳은 설명은?

A) t-SNE는 학습된 매핑으로 새 데이터를 변환할 수 있다  
B) 불균형 데이터에서는 항상 정확도가 최선의 지표다  
C) PCA는 적용 전 표준화가 권장되며 새 데이터를 transform할 수 있다  
D) SMOTE는 데이터 분할 전에 전체에 적용해야 한다  

**정답: C**  
해설: PCA는 분산 기반이라 표준화가 권장되고, 학습된 주성분으로 새 데이터를 transform할 수 있다. t-SNE는 새 데이터 변환 불가(A), 불균형에서 정확도는 오해를 부르며(B), SMOTE는 분할 후 학습셋에만 적용해야 한다(D).

---

**문제 4.** 코드를 작성하지 않는 비즈니스 사용자가 S3 데이터의 대시보드에서 자동 이상 탐지·예측을 원한다. 가장 적절한 도구는?

A) SageMaker 내장 PCA  
B) Amazon QuickSight(ML Insights)  
C) imblearn Pipeline  
D) statsmodels VIF  

**정답: B**  
해설: QuickSight ML Insights는 코드 없이 대시보드에서 이상 탐지·예측을 제공해 비즈니스 사용자에게 맞다. PCA(A)는 차원 축소, imblearn(C)은 불균형 처리, VIF(D)는 다중공선성 진단 도구다.

---

**문제 5.** 매우 큰 다수 클래스와 희소한 소수 클래스를 가진 데이터에서, 학습 속도를 위해 데이터 양 자체를 줄이면서 불균형을 완화하려 한다. 가장 적절한 방법은?

A) 무작위 언더샘플링으로 다수 클래스를 줄인다  
B) 소수 클래스를 수십 배 복제한다  
C) 모든 특성을 다항 확장한다  
D) 차원의 저주를 무시한다  

**정답: A**  
해설: 데이터가 매우 크고 속도가 중요하면 다수 클래스를 줄이는 언더샘플링이 불균형 완화와 학습 가속을 동시에 달성한다. 대량 복제(B)는 데이터를 오히려 키우고 과적합 위험이 크며, 다항 확장(C)은 차원을 늘리고, (D)는 해결책이 아니다.

---
