# Day 2 - SageMaker 빌트인 1: XGBoost, Linear Learner, K-Means, KNN

어제 매핑 표에서 가장 자주 등장하는 **정형 데이터(tabular)** 알고리즘 네 개를 오늘 깊이 본다. 이들은 시험 출제 빈도가 가장 높은 빌트인이며, 각각이 잘하는 문제·입력 포맷·핵심 하이퍼파라미터를 구분하는 것이 핵심이다.

## XGBoost — 정형 데이터의 기본기

그래디언트 부스팅 트리. 분류·회귀 모두 강력하고, 캐글·실무·시험에서 정형 데이터의 사실상 기본값이다.

- **용도**: 이진/다중 분류, 회귀, 랭킹.
- **입력 포맷**: CSV, libsvm, Parquet, RecordIO-protobuf. (CSV는 첫 열이 레이블)
- **강점**: 결측치 자체 처리, 비선형·상호작용 자동 포착, 스케일링 불필요(트리 계열).

핵심 하이퍼파라미터:

```text
objective         binary:logistic | multi:softmax | reg:squarederror
num_round         부스팅 라운드 수 (트리 개수)
max_depth         트리 깊이 — 클수록 복잡/과적합 위험
eta               학습률 (작을수록 천천히, 보통 0.01~0.3)
subsample         행 샘플링 비율 (과적합 억제)
colsample_bytree  열 샘플링 비율
gamma, lambda, alpha   정규화 (과적합 억제)
scale_pos_weight  클래스 불균형 보정
```

> 💡 **관련 이론**: XGBoost의 과적합 제어는 "모델을 단순하게" 미는 손잡이들의 조합이다. `max_depth`를 줄이고, `eta`를 낮추되 `num_round`를 늘리고, `subsample`·`colsample_bytree`로 무작위성을 주고, `gamma`/`lambda`/`alpha`로 정규화를 거는 식이다. 시험에서 "검증 손실은 오르는데 학습 손실만 계속 내려간다(과적합)"는 지문이 나오면, 정답 보기는 보통 `max_depth`↓ / `eta`↓ / 정규화↑ / `subsample`↓ 방향이다. 반대로 과소적합이면 그 반대 방향이다.

## Linear Learner — 선형 모델, 대규모·고속

선형/로지스틱 회귀를 SageMaker가 분산·최적화한 버전. 분류와 회귀를 모두 지원한다.

- **용도**: 이진/다중 분류, 회귀.
- **입력 포맷**: RecordIO-protobuf(권장, 효율적), CSV.
- **강점**: 매우 큰 데이터에서 빠르고, 여러 모델을 동시에 학습해 자동으로 최적을 고름. 해석이 쉬움.
- **주의**: 선형 모델이므로 **피처 스케일링이 중요**(빌트인이 normalize 옵션 제공).

핵심 하이퍼파라미터:

```text
predictor_type        binary_classifier | multiclass_classifier | regressor
num_classes           다중분류 시 클래스 수
mini_batch_size       미니배치 크기
learning_rate         학습률
l1, wd(L2)            정규화
normalize_data        입력 표준화 여부
balance_multiclass_weights   불균형 보정
```

XGBoost vs Linear Learner: **비선형 관계가 중요하면 XGBoost, 관계가 대체로 선형이고 초대규모·해석성이 중요하면 Linear Learner.**

## K-Means — 비지도 군집

레이블 없이 데이터를 k개 그룹으로 나눈다. 고객 세분화 등.

- **용도**: 군집(비지도).
- **입력 포맷**: RecordIO-protobuf, CSV.
- **핵심**: 클러스터 수 `k`를 미리 지정해야 한다.
- **주의**: 거리 기반이므로 **스케일링 필수**.

핵심 하이퍼파라미터:

```text
k                 클러스터 수 (필수)
feature_dim       피처 차원
mini_batch_size   미니배치 크기
init_method       random | kmeans++ (초기 중심 선택)
extra_center_factor   후보 중심 추가 생성 후 축소
```

k 선택: 정답이 없으므로 엘보우(WCSS 꺾이는 지점), 실루엣 계수로 결정한다. SageMaker K-Means는 `k`를 키워 후보 중심을 만든 뒤 줄이는 방식으로 안정적인 군집을 찾는다.

## KNN — 거리 기반 분류/회귀

가장 가까운 k개 이웃의 다수결(분류) 또는 평균(회귀)으로 예측한다.

- **용도**: 분류, 회귀.
- **입력 포맷**: RecordIO-protobuf, CSV.
- **핵심**: 학습이라기보다 "기억". 추론 시 이웃 탐색 비용이 큼 → SageMaker는 차원 축소(sample_size, dimension_reduction)로 가속.
- **주의**: 거리 기반이므로 **스케일링 필수**, 고차원에서 성능 저하(차원의 저주).

핵심 하이퍼파라미터:

```text
k                 참조할 이웃 수
sample_size       학습에 사용할 샘플 수
dimension_reduction_type   sign | fjlt (차원 축소)
predictor_type    classifier | regressor
```

> 💡 **관련 이론**: 거리 기반 알고리즘(KNN, K-Means)과 선형 모델(Linear Learner)은 **피처 스케일이 결과를 직접 왜곡**하므로 스케일링이 필수다. 예컨대 "연봉(수천만 단위)"과 "나이(수십 단위)"를 그대로 두면 유클리드 거리가 연봉에 지배당한다. 반면 트리 기반(XGBoost)은 각 피처를 독립적으로 임계값 분할하므로 스케일에 불변이다. 시험에서 "스케일링이 필요한가"를 물으면 알고리즘이 거리/선형 계열인지(필요) 트리 계열인지(불필요)로 즉답할 수 있다.

## 네 알고리즘 비교 요약

| 알고리즘 | 유형 | 스케일링 | 강점 | 대표 단서 |
|------|------|------|------|------|
| XGBoost | 지도(분류/회귀) | 불필요 | 정형 데이터 만능, 비선형 | "표 형식 / 높은 정확도 / 캐글류" |
| Linear Learner | 지도(분류/회귀) | 필요 | 초대규모·고속·해석성 | "매우 큰 데이터 / 선형 / 빠르게" |
| K-Means | 비지도(군집) | 필요 | 그룹 자동 발견 | "세분화 / 그룹 발견 / 레이블 없음" |
| KNN | 지도(분류/회귀) | 필요 | 단순·비모수 | "가장 비슷한 사례 / 이웃 기반" |

## 공통 운영 팁

- **RecordIO-protobuf**는 대부분의 빌트인에서 가장 효율적인 입력 포맷(파이프 모드로 스트리밍 학습 가능).
- 대용량 데이터는 **Pipe mode**로 S3에서 스트리밍하면 디스크 복사 없이 학습 시작이 빨라진다.
- 하이퍼파라미터는 SageMaker **Automatic Model Tuning**으로 탐색할 수 있다(Week 7 주제).

## 시험 팁

- "정형 데이터 + 높은 정확도"는 거의 XGBoost.
- "초대규모 + 빠름 + 선형/해석"은 Linear Learner.
- "그룹/세분화 발견 + 레이블 없음"은 K-Means.
- 과적합 지문이면 XGBoost는 `max_depth`↓·`eta`↓·정규화↑.
- 거리/선형 계열(KNN, K-Means, Linear)에서 "스케일링 생략" 보기는 오답 신호.

## 정리하며

오늘은 정형 데이터의 4대 빌트인을 정리했다. XGBoost(비선형 트리, 스케일링 불필요), Linear Learner(대규모 선형), K-Means(비지도 군집), KNN(이웃 기반) — 각각의 문제 유형·스케일링 필요성·핵심 하이퍼파라미터를 구분하는 것이 시험의 요점이다. 내일은 텍스트·이미지·시계열·추천을 위한 특화 빌트인을 다룬다.

---

## 📝 연습 문제

**문제 1.** 중간 규모의 정형(표 형식) 데이터로 이진 분류를 하는데, 피처 간 비선형 상호작용이 중요하고 결측치도 일부 있다. 가장 적합한 빌트인은?

A) K-Means  
B) XGBoost  
C) PCA  
D) DeepAR  

**정답: B**  
해설: 정형 데이터의 비선형·상호작용 포착과 결측치 자체 처리가 강점인 XGBoost가 적합하다. K-Means(A)는 비지도 군집, PCA(C)는 차원 축소, DeepAR(D)는 시계열 예측이라 이진 분류 과제와 맞지 않는다.

---

**문제 2.** XGBoost 학습 중 학습 손실은 계속 낮아지지만 검증 손실은 상승하는 과적합이 관찰된다. 다음 중 과적합을 완화하는 조정으로 적절하지 않은 것은?

A) max_depth를 낮춘다  
B) eta(학습률)를 낮춘다  
C) lambda/alpha 정규화를 강화한다  
D) max_depth를 크게 높인다  

**정답: D**  
해설: max_depth를 높이면 트리가 더 복잡해져 과적합이 심해진다. max_depth↓(A), eta↓(B), 정규화 강화(C)는 모두 모델을 단순화해 과적합을 줄이는 올바른 방향이다.

---

**문제 3.** 다음 중 거리 기반이어서 학습 전 피처 스케일링이 특히 중요한 빌트인 알고리즘은?

A) XGBoost  
B) K-Means  
C) Random Cut Forest  
D) BlazingText  

**정답: B**  
해설: K-Means는 유클리드 거리로 클러스터를 형성하므로 스케일이 큰 피처가 거리를 지배하지 않도록 스케일링이 필수다. XGBoost(A)는 트리라 스케일 불변이고, RCF(C)·BlazingText(D)는 이 맥락의 정답이 아니다.

---

**문제 4.** 수억 행 규모의 매우 큰 데이터로, 관계가 대체로 선형이며 빠른 학습과 모델 해석이 중요하다. 가장 적합한 빌트인은?

A) Linear Learner  
B) KNN  
C) Factorization Machines  
D) Image Classification  

**정답: A**  
해설: Linear Learner는 초대규모 데이터에서 빠르고, 선형 모델이라 계수 해석이 쉬우며 여러 모델을 동시에 학습해 최적을 고른다. KNN(B)은 대규모 추론 비용이 크고, FM(C)은 희소 상호작용 추천에 특화, Image Classification(D)은 이미지 전용이다.

---

**문제 5.** K-Means를 사용할 때 사용자가 반드시 사전에 지정해야 하는 핵심 하이퍼파라미터는?

A) objective  
B) predictor_type  
C) k (클러스터 수)  
D) num_round  

**정답: C**  
해설: K-Means는 데이터를 몇 개 그룹으로 나눌지(k)를 사전에 지정해야 한다. objective·num_round(A, D)는 XGBoost, predictor_type(B)은 Linear Learner/KNN의 파라미터다.

---
