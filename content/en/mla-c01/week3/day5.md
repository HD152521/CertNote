# Day 5 - Week 3 Comprehensive Review — Feature Engineering·Data Quality

This week covered the process of refining prepared data into a form that models can learn — feature engineering and data quality. It's the latter part of MLA-C01 Domain 1 and the stage that most significantly determines model performance. It's also the domain where ML's maxim "data over algorithm" shines most brightly.

Today we weave Data Wrangler·Feature Store·Clarify into a single flow and review them together. The three tools handle transformation·management·validation respectively, and when linked together, they form a pipeline "from raw data to a trustworthy training dataset".

## Feature Engineering Pipeline at a Glance

```
[raw data (S3)]
        │  ① Transform (Data Wrangler)
        │     Scaling·Encoding·Missing values·Outliers
        v
[Transformed features]
        │  ② Manage (Feature Store)
        │     Online (inference) + Offline (training) simultaneous storage
        v
[Feature Group]
        │  ③ Validate (Clarify)
        │     Bias·Imbalance·Explainability analysis
        v
[Validated training dataset] → SageMaker Training
```

The key point is that these three stages are connected by **consistency**. Data Wrangler defines the transformation, Feature Store supplies it identically to both training and inference, and Clarify guarantees data fairness.

> 💡 **Related Theory**: The statistic that data scientists spend 70–80% of their time on feature engineering is not an exaggeration. As Google's "Hidden Technical Debt in Machine Learning Systems" paper emphasizes, in actual ML systems, model code is a small part, while data collection, validation, feature extraction, and consistency maintenance account for most complexity and failure causes. All three tools this week are mechanisms to tame that data-side complexity.

## Four Major Feature Engineering Transformations (Day 1–2)

Here we review the core transformations that turn raw data into numbers the model can read.

| Transformation | When | Representative Techniques |
|---|---|---|
| Scaling | Numeric ranges vary widely | StandardScaler, MinMaxScaler |
| Encoding | Categorical (string) columns | One-Hot, Label, Target encoding |
| Missing value handling | Values are empty | Mean/median imputation, deletion |
| Outlier handling | Extreme values exist | Clipping, robust scaling |

The discrimination key is algorithm dependency. Distance/gradient-based algorithms (KNN, neural networks) require scaling, but tree-based algorithms (XGBoost) are insensitive to scale. Categorical features use One-Hot if order-agnostic, or consider Target encoding if cardinality is very high.

```python
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer

# Numeric: standardize, categorical: one-hot — bundle in one transformer
preprocessor = ColumnTransformer([
    ("num", StandardScaler(), ["age", "income"]),
    ("cat", OneHotEncoder(handle_unknown="ignore"), ["region"]),
])
X_train_t = preprocessor.fit_transform(X_train)
X_test_t = preprocessor.transform(X_test)   # test: transform only, not fit — prevents leakage
```

> ⚠️ **Pitfall**: Scalers and encoders are **only fit on train**, and only transform is applied to test. Fitting on test statistics leaks test information into training, causing data leakage. This principle applies equally to resampling like SMOTE.

## Data Wrangler (Day 2)

**SageMaker Data Wrangler** is a tool for visually importing, transforming, and analyzing data without code. It offers over 300 built-in transformations and data quality reports, and the created flow can be exported to Processing Job, Pipeline, or Feature Store.

- **Import**: Load data from S3, Athena, Redshift, etc.
- **Transform**: Apply missing value, encoding, scaling, etc. by clicking
- **Analyze**: Data quality, bias insights, quick visualization
- **Export**: Convert the transformation flow into reusable jobs

> 🔍 **Deeper Dive**: Data Wrangler's value doesn't end at "visual exploration"—it **exports those transformations as reproducible code**. Hand-coded transformations in notebooks are hard to reproduce at inference time, but Data Wrangler flows are exported as Processing Jobs to guarantee the same transformation in both training and inference. It's the bridge linking exploration and production.

## Feature Store (Day 3)

**SageMaker Feature Store** is a repository for centrally storing, reusing, and consistently serving features. Two stores are key.

| Aspect | Online Store | Offline Store |
|---|---|---|
| Purpose | Real-time inference | Training·batch |
| Latency | Milliseconds (key-value) | High (S3 Parquet) |
| Query | Latest single record (GetRecord) | Full history (Athena) |

The greatest value is **preventing training/serving skew**. Training and inference share the same feature definition, eliminating problems where the two compute slightly differently and performance collapses. The Feature Group (Record Identifier + Event Time) is the unit, and Event Time is the basis for point-in-time queries and preventing look-ahead leakage.

```python
# Training: bulk query offline store via Athena
query = feature_group.athena_query()
query.run(query_string="SELECT * FROM customer_features WHERE ...",
          output_location="s3://my-bucket/query-results/")

# Inference: query latest single feature from online store
record = featurestore_runtime.get_record(
    FeatureGroupName="customer-features",
    RecordIdentifierValueAsString="cust_12345",
)
```

## Clarify and Data Quality (Day 4)

**SageMaker Clarify** measures bias before and after training (sensitive attribute facet, CI·DPL metrics) and explains prediction feature importance via SHAP. Combined with data quality checks—class imbalance handling (SMOTE·class weight, applied only to training set after split), train/val/test split (stratified for imbalance, temporal for time series, test viewed only once)—a trustworthy dataset is complete.

> 💡 **Related Theory**: One word pierces this week: "leakage". Leakage from fitting on test, leakage from resampling before split, future leakage from using future values as features, look-ahead leakage from ignoring Feature Store's Event Time. Every leakage produces the same symptom: "good evaluation but deployment failure". Half of feature engineering and data quality is preventing leakage.

## Summary

Week 3's structure is **transform → manage → validate** pipeline. Apply the four transformations (scaling·encoding·missing·outliers) by fitting only on train, make them visual and reproducible with Data Wrangler, supply them consistently to training and inference via Feature Store (online/offline, skew prevention), and validate bias·imbalance·split with Clarify and data quality techniques. The common thread through all these processes is data leakage, and preventing it is the condition for a good training dataset.

Next week (Week 4) we begin full model training, tuning, and evaluation with the data we've prepared.

---

## 📝 연습 문제

**문제 1.** 데이터 과학자가 코드를 거의 작성하지 않고 S3·Athena 데이터를 임포트해 결측·인코딩·스케일링을 시각적으로 적용하고, 그 변환 흐름을 재현 가능한 Processing Job으로 내보내려 한다. 가장 적합한 도구는?

A) Amazon Athena  
B) SageMaker Data Wrangler  
C) Amazon Kinesis  
D) AWS DMS  

**정답: B**  
해설: Data Wrangler는 코드 없이 데이터 임포트·변환·분석을 시각적으로 수행하고, 그 흐름을 Processing Job·Pipeline·Feature Store로 내보내 재현성을 보장한다. Athena(A)는 SQL 쿼리 도구, Kinesis(C)는 스트림 수집, DMS(D)는 DB 복제로 시각적 특성 변환 용도가 아니다.

---

**문제 2.** 학습 파이프라인과 추론 서버가 "최근 30일 평균 구매액"을 각각 계산하다 미묘한 차이로 성능이 저하됐다. 두 곳이 동일한 특성 정의를 공유하게 해 이를 근본적으로 막는 서비스는?

A) Amazon Athena  
B) SageMaker Feature Store  
C) SageMaker Model Monitor  
D) AWS Glue Crawler  

**정답: B**  
해설: Feature Store는 특성을 한 번 정의·저장해 학습(오프라인)과 추론(온라인)이 같은 값을 공유하게 함으로써 training/serving skew를 원천 차단한다. Athena(A)는 쿼리, Model Monitor(C)는 배포 후 드리프트 감지, Glue Crawler(D)는 스키마 추론으로 특성 일관성 보장과 목적이 다르다.

---

**문제 3.** 수치 특성에 StandardScaler를 적용할 때 데이터 누수를 막는 올바른 방법은?

A) train과 test 전체에 함께 fit한다  
B) train에만 fit하고 test에는 transform만 적용한다  
C) test에 fit하고 train에 transform한다  
D) 매번 새로 fit한다  

**정답: B**  
해설: 스케일러는 train 데이터의 통계(평균·표준편차)로만 fit하고 test에는 그 통계로 transform만 해야, test 정보가 학습에 새는 누수를 막는다. 전체에 fit(A)이나 test에 fit(C)은 누수를 일으키고, 매번 새로 fit(D)하면 train/test 변환 기준이 달라진다.

---

**문제 4.** SageMaker Clarify가 학습 전(pre-training)에 수행하는 분석으로 옳은 것은?

A) 엔드포인트 지연시간 측정  
B) 민감 속성(facet) 기준으로 그룹 간 데이터 편향(CI, DPL 등)을 측정  
C) 모델을 자동으로 배포  
D) 인스턴스 비용을 계산  

**정답: B**  
해설: Clarify의 학습 전 분석은 성별·인종 같은 민감 속성(facet)을 지정해 그룹 간 표본 불균형(Class Imbalance)과 긍정 레이블 비율 차이(DPL) 등 데이터 편향 지표를 측정한다. 지연시간(A)·비용(D) 측정이나 자동 배포(C)는 Clarify의 편향 분석 기능이 아니다.

---

**문제 5.** 이번 주 전반에서 "평가는 좋은데 배포 시 성능이 무너지는" 문제의 공통 원인으로 가장 적절한 것은?

A) 인스턴스 타입이 작아서  
B) 데이터 누수(변환 누수, 분할 전 리샘플링, 미래 값 사용 등)  
C) 모델 파라미터 수가 적어서  
D) S3 버킷 이름이 길어서  

**정답: B**  
해설: test에 fit하는 변환 누수, 분할 전 리샘플링, 미래 값을 특성에 쓰는 미래 누수 등 데이터 누수는 모두 학습·검증에서는 높은 성능을 보이나 배포에서 무너지는 같은 증상을 낳는다. 인스턴스 타입(A)·파라미터 수(C)·버킷 이름(D)은 이 일반화 실패의 원인과 무관하다.

---
