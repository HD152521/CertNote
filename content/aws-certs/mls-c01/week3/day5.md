# Day 5 - Week 3 Comprehensive Review: Cleaning and Feature Engineering

This week, we covered the first half of EDA—**data cleaning** and **feature engineering**. Both are central to MLS-C01 Domain 2 (Exploratory Data Analysis) and are the stages most critical to model performance in practice. Today, we knit together four days of content into one workflow, review it holistically, and clarify the decision points that confuse exam takers most.

## One-Page Summary: Cleaning → Feature Engineering → Tools

```text
[Raw Data]
   │
   ├─ 1) Cleaning (Day 1)
   │     Missing values: Assess MCAR/MAR/MNAR → Impute (mean/median/KNN/model)
   │     Outliers: Detect via IQR/Z-score → Delete/clip/transform/keep
   │     Duplicates & errors: Clean before split (prevent leakage)
   │
   ├─ 2) Feature Engineering (Day 2–3)
   │     Scaling: Normalization/Standardization/RobustScaler (trees unnecessary)
   │     Encoding: Label/One-Hot/Target (decide by order & cardinality)
   │     Binning: Nonlinearity & interpretability ↔ information loss
   │     Dates: Decompose components + sin/cos
   │     Text: BoW → TF-IDF → embeddings
   │     High-cardinality: Target/hashing/embeddings
   │
   └─ 3) AWS Tools (Day 4)
         Data Wrangler (visual) → Processing Job (scale) → Feature Store (reuse)
```

## Key Decision Points

### Missing Values: How to Impute?

| Scenario | Recommendation |
|------|------|
| Right-skewed numeric | Median imputation |
| Symmetric numeric | Mean imputation |
| Categorical | Mode imputation |
| Strong inter-variable correlation | KNN or model-based |
| Missing value itself is a signal (MNAR) | Add indicator variable |

### Scaling: Algorithm-Specific Requirement

- **Required**: KNN, K-means, linear/logistic regression, SVM, neural networks, PCA, Ridge/Lasso
- **Unnecessary**: Decision Tree, Random Forest, XGBoost, LightGBM (tree-based)
- **With many outliers**: RobustScaler

### Encoding: Decide by Order and Cardinality

```text
Is there an order?  ── Yes ──→ Ordinal/Label Encoding
        │
        └─ No ──→ Many unique values?
                        ├─ Few → One-Hot
                        └─ Many → Target/Frequency/Hashing/Embedding
```

> 💡 **Key Theory**: One principle threads through this entire week: **preventing data leakage**. All transformations—imputation statistics (mean, median), scaler parameters (min/max/μ/σ), target encoding statistics, text vectorizer vocabulary—must **fit only on training data**; validation and test sets get only `transform`. Duplicate removal must happen before split; time-series features must respect point-in-time. Leakage inflates offline performance unrealistically and collapses in production—it's a perennial trap in exams and real work alike.

## Confusing Pairs Compared

| Pair | Key Difference |
|------|------|
| Mean vs median imputation | Median robust to outliers and skew |
| Z-score vs IQR | IQR is robust without distribution assumptions |
| Normalization vs standardization | Normalization: fixed [0,1] range; standardization: mean 0, variance 1; outliers: use RobustScaler |
| Label vs One-Hot | Ordinal → Label; nominal → One-Hot |
| BoW vs TF-IDF | TF-IDF suppresses common words |
| Online vs Offline Store | Online: ms single-record inference; Offline: bulk training |
| Data Wrangler vs Processing Job | Visual EDA vs code-based large-scale processing |

> 💡 **Key Theory**: Feature engineering and model choice are inseparable. With identical data, **linear models** need scaling, binning, and one-hot to explicitly capture nonlinearity and scale; **tree/boosting models** don't need scaling and gain little from binning/one-hot because trees capture nonlinearity via splits. The answer to "which preprocessing is correct?" depends on "which model will we use?" Exam questions often exploit this—using the algorithm as a clue to narrow the preprocessing answer.

## Self-Check Questions

Try to answer these mentally:

1. For right-skewed income with missing values using simple imputation, mean or median? → **Median**
2. Is feature scaling needed for XGBoost? → **No**
3. Why is one-hot inappropriate for postal codes (thousands of values)? → **Dimensionality explosion**
4. What makes hour 23 and hour 0 adjacent? → **Sin/cos transform**
5. What problem arises when fitting a scaler to all data? → **Data leakage**
6. For real-time single-record inference, which Feature Store? → **Online**

## Exam Tips

- If the problem names an **algorithm**, preprocessing options narrow (tree → scaling likely wrong).
- "Millions of unique values" = one-hot is wrong → think target encoding, hashing, or embeddings.
- "No-code/visual/quick prep" = Data Wrangler; "large-scale custom code" = Processing Job.
- "Training-inference consistency," "feature reuse," "single-record low-latency lookup" = Feature Store.
- Any preprocessing that violates the **train fit → test transform** rule is nearly always wrong.

## Summary

Week 3 transformed "dirty raw data" into "trusted features that models can learn from." Cleaning (missing, outliers, duplicates), feature engineering (scaling, encoding, binning, dates, text, high-cardinality), and SageMaker tools for scale—these form a unified workflow. Two principles run through all: **leakage prevention** and **choosing preprocessing to match your model**.

Next week (Week 4) covers the second half of EDA: data visualization, distribution and correlation analysis, dimensionality reduction (PCA), and other analytical and insight-generating techniques.

---

## 📝 연습 문제

**문제 1.** Random Forest 모델을 사용하기로 했다. 다음 전처리 중 이 모델에서 **효과가 가장 작은** 것은?

A) 결측치 대치  
B) 피처 표준화(스케일링)  
C) 고카디널리티 범주형 인코딩  
D) 명백한 입력 오류 행 제거  

**정답: B**  
해설: 트리 기반 모델(Random Forest)은 피처 내 분할 기준점만 사용하므로 스케일링이 사실상 불필요하다. 결측치 대치(A), 범주형 인코딩(C, 트리도 숫자 입력 필요), 오류 제거(D)는 트리 모델에서도 여전히 필요하다.

---

**문제 2.** 다음 중 데이터 누수를 일으키는 잘못된 전처리 절차는?

A) 학습셋으로 StandardScaler를 fit하고 테스트셋엔 transform만 적용  
B) 전체 데이터셋의 평균으로 결측치를 대치한 뒤 학습/테스트로 분할  
C) 사용자 단위 중복을 분할 이전에 정리  
D) 타깃 인코딩 통계를 K-fold로 산출  

**정답: B**  
해설: 전체 데이터의 평균으로 대치하면 테스트셋 정보가 통계량에 섞여 학습에 새어 들어가는 누수가 발생한다. 학습셋 fit/테스트 transform(A), 분할 전 중복 정리(C), K-fold 타깃 인코딩(D)은 모두 누수를 방지하는 올바른 절차다.

---

**문제 3.** "성별(남/여)", "등급(낮음<중간<높음)", "도시(수천 종)" 세 범주형이 있다. 각각에 가장 적절한 인코딩 짝으로 옳은 것은?

A) 성별=One-Hot, 등급=Ordinal, 도시=Target/Hashing  
B) 성별=Target, 등급=One-Hot, 도시=Ordinal  
C) 성별=Hashing, 등급=Target, 도시=One-Hot  
D) 세 변수 모두 One-Hot  

**정답: A**  
해설: 성별은 저카디널리티 명목형이라 One-Hot, 등급은 순서형이라 Ordinal, 도시는 고카디널리티라 Target/Hashing이 적절하다. B·C는 순서·카디널리티에 맞지 않게 짝지었고, 도시를 One-Hot(C, D)하면 수천 차원으로 폭발한다.

---

**문제 4.** 시각적으로 데이터를 준비한 뒤 그 변환 흐름을 대규모 실행용 Processing Job과 Feature Store로 내보내려 한다. 시작 도구로 가장 적절한 것은?

A) Amazon QuickSight  
B) Amazon Comprehend  
C) SageMaker Data Wrangler  
D) AWS Glue DataBrew 전용  

**정답: C**  
해설: Data Wrangler는 시각적으로 정의한 변환 흐름을 Processing Job, Pipeline, Feature Store, Python 코드로 내보낼 수 있어 탐색과 프로덕션을 잇는다. QuickSight(A)는 BI 시각화, Comprehend(B)는 NLP 서비스이며, 흐름을 SageMaker Processing Job/Feature Store로 직접 익스포트하는 통합은 Data Wrangler의 강점이다.

---

**문제 5.** 오른쪽으로 길게 치우친 분포의 수치 변수가 있고, 선형 회귀 모델을 쓸 예정이다. 다음 중 가장 부적절한 처리는?

A) 로그 변환으로 꼬리를 압축한다  
B) 결측은 중앙값으로 대치한다  
C) 이상치 경계를 IQR로 탐지한다  
D) 트리 모델이므로 스케일링을 생략한다  

**정답: D**  
해설: 선형 회귀를 쓸 예정인데 "트리 모델이므로 스케일링 생략"은 전제 자체가 틀렸다. 선형 회귀는 스케일에 민감하므로 스케일링이 필요하다. 로그 변환(A), 중앙값 대치(B), IQR 이상치 탐지(C)는 치우친 분포에 모두 적절한 처리다.

---
