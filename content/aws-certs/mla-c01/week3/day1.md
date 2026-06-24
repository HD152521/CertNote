# Day 1 - 특성 공학: 모델이 읽을 수 있는 숫자로 바꾸는 기술

모델 학습에서 데이터 과학자가 시간의 70~80%를 쓰는 곳은 화려한 알고리즘 튜닝이 아니라 특성 공학(feature engineering)이다. raw 데이터는 결측치가 뚫려 있고, 단위가 제각각이며, "서울/부산/대구" 같은 문자열이 섞여 있다. 모델은 이걸 그대로 못 읽는다. 특성 공학은 이 raw 데이터를 알고리즘이 패턴을 학습할 수 있는 수치 표현으로 변환하는 작업 전체를 말한다.

MLA-C01 시험은 "이 데이터에 어떤 변환을 적용해야 하는가"를 시나리오로 끊임없이 묻는다. 알고리즘 이름보다 **언제 어떤 변환을 고르는가**가 핵심이다. 오늘은 스케일링, 인코딩, 결측치, 이상치라는 4대 변환을 본다.

## 왜 스케일링이 필요한가

연봉(예: 50,000,000)과 나이(예: 35)를 같은 모델에 넣으면, 거리 기반 알고리즘(KNN, K-Means)이나 경사하강법 기반 모델(선형회귀, 신경망)은 단위가 큰 연봉에 압도된다. 두 점 사이 유클리드 거리를 계산하면 나이 차이는 무시되고 연봉 차이만 반영된다. 스케일링은 모든 수치 특성을 비슷한 범위로 맞추는 작업이다.

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler

# 표준화(Standardization): 평균 0, 표준편차 1로 변환
# z = (x - mean) / std
scaler = StandardScaler()
X_std = scaler.fit_transform(X_train)

# 정규화(Normalization): [0, 1] 범위로 변환
# x' = (x - min) / (max - min)
minmax = MinMaxScaler()
X_norm = minmax.fit_transform(X_train)
```

표준화(StandardScaler)는 데이터가 정규분포에 가깝거나 이상치가 있을 때 견고하다. 정규화(MinMaxScaler)는 값의 범위가 명확히 정해진 경우(예: 이미지 픽셀 0~255)나 신경망 입력에 자주 쓴다. 이상치가 심하면 둘 다 흔들리므로 RobustScaler(중앙값과 IQR 사용)를 쓴다.

> 💡 **관련 이론**: 경사하강법은 손실 함수 표면을 따라 내려가는데, 특성 스케일이 제각각이면 손실 표면이 길쭉한 타원(elongated contour)이 된다. 이러면 gradient가 최저점을 향해 직선으로 못 가고 지그재그로 진동하며 수렴이 느려진다. 스케일링으로 모든 축을 비슷한 범위로 맞추면 손실 표면이 동심원에 가까워져 수렴이 빨라진다. 트리 기반 모델(XGBoost, Random Forest)은 분할 기준이 임계값 비교라서 스케일에 영향받지 않는다는 점도 기억하자.

> ⚠️ **함정**: 스케일러는 반드시 **train 데이터로만 `fit`**하고, 그 통계량으로 validation/test를 `transform`해야 한다. test 데이터까지 포함해 `fit`하면 test 정보가 학습에 새어 들어가는 데이터 누수(data leakage)가 발생한다. `scaler.fit_transform(X_train)` 후 `scaler.transform(X_test)`가 정답이다.

## 범주형 변수 인코딩

"색상: 빨강/파랑/초록" 같은 범주형 데이터는 숫자로 바꿔야 한다. 방법 선택이 모델 성능을 크게 가른다.

```python
import pandas as pd
from sklearn.preprocessing import OneHotEncoder, LabelEncoder

# One-Hot Encoding: 각 범주를 별도 이진 열로
# 빨강 -> [1,0,0], 파랑 -> [0,1,0], 초록 -> [0,0,1]
ohe = pd.get_dummies(df['color'])

# Label Encoding: 각 범주에 정수 부여
# 빨강 -> 0, 파랑 -> 1, 초록 -> 2
le = LabelEncoder()
df['color_encoded'] = le.fit_transform(df['color'])
```

**One-Hot 인코딩**은 순서가 없는 명목형(nominal) 범주에 쓴다. 빨강·파랑·초록 사이엔 크기 관계가 없으므로, Label 인코딩으로 0/1/2를 주면 모델이 "초록(2) > 파랑(1)"이라는 잘못된 순서를 학습한다. **Label/Ordinal 인코딩**은 순서가 있는 서열형(ordinal) 범주(예: 저/중/고, S/M/L)에 적합하다.

문제는 범주가 수천 개일 때(예: 우편번호, 상품 ID)다. One-Hot으로 펼치면 차원이 폭발(curse of dimensionality)한다. 이럴 땐 **타깃 인코딩**(범주별 타깃 평균값으로 치환), **빈도 인코딩**(범주 등장 빈도로 치환), 또는 임베딩(딥러닝)을 쓴다.

> 🔍 **더 깊이**: 타깃 인코딩은 강력하지만 데이터 누수에 취약하다. "범주 A의 타깃 평균"을 계산할 때 그 행 자신의 타깃을 포함하면 정답을 미리 본 셈이 된다. 이를 막으려면 K-fold 방식으로 다른 fold의 통계만 쓰거나, 스무딩(smoothing)을 적용해 표본이 적은 범주는 전체 평균 쪽으로 끌어당긴다.

## 결측치 처리

현실 데이터엔 빈 칸이 흔하다. 대부분의 알고리즘(XGBoost 등 일부 제외)은 NaN을 못 받으므로 채우거나 제거해야 한다.

```python
from sklearn.impute import SimpleImputer, KNNImputer

# 평균/중앙값/최빈값으로 대치
imp = SimpleImputer(strategy='median')  # mean, median, most_frequent, constant
X_filled = imp.fit_transform(X)

# KNN: 유사한 행들의 값으로 대치
knn_imp = KNNImputer(n_neighbors=5)
X_knn = knn_imp.fit_transform(X)
```

선택 기준은 결측의 양과 성격이다. 결측이 5% 미만이고 무작위라면 행 삭제도 가능하다. 수치형은 중앙값(이상치에 강함), 범주형은 최빈값으로 대치하는 것이 기본이다. 결측 자체가 의미를 가질 때(예: "소득 미기재"가 특정 집단을 뜻함)는 "결측 여부" 플래그 열을 추가로 만들기도 한다.

> 💡 **관련 이론**: 결측 메커니즘은 통계학에서 3가지로 나뉜다. **MCAR**(Missing Completely At Random, 완전 무작위), **MAR**(Missing At Random, 다른 관측 변수에 의존), **MNAR**(Missing Not At Random, 결측값 자체에 의존). MCAR이면 단순 삭제도 편향을 안 만들지만, MNAR(예: 고소득자가 소득을 안 적는 경향)이면 단순 대치가 심각한 편향을 만든다. 시험에선 "왜 평균 대치가 분포를 왜곡하는가"를 묻기도 하는데, 평균 대치는 분산을 인위적으로 줄여 상관관계를 약화시킨다.

## 이상치 처리

이상치(outlier)는 측정 오류일 수도, 진짜 드문 사건(사기 거래)일 수도 있다. 무조건 제거하면 안 된다. 탐지 방법으로는 IQR 기준과 Z-score 기준이 대표적이다.

```python
import numpy as np

# IQR 방법: Q1 - 1.5*IQR 미만, Q3 + 1.5*IQR 초과를 이상치로
Q1, Q3 = np.percentile(data, [25, 75])
IQR = Q3 - Q1
lower, upper = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
outliers = data[(data < lower) | (data > upper)]

# Z-score 방법: |z| > 3 을 이상치로
z = (data - data.mean()) / data.std()
outliers_z = data[np.abs(z) > 3]
```

IQR 방법은 분포 가정이 없어 견고하고, Z-score는 정규분포 가정에 의존한다. 처리 방법은 제거, 캡핑(winsorizing, 상하한값으로 자르기), 변환(로그·제곱근으로 분포를 압축) 중 도메인에 맞게 고른다. 사기 탐지에서는 이상치가 곧 정답이므로 절대 제거하지 않는다.

> 📚 **사례**: 부동산 가격 예측 모델에서 "면적" 열에 99999가 들어 있었다. 이는 결측을 99999로 코딩한 sentinel value였는데, 팀이 모르고 그대로 학습시켜 모델이 모든 집을 초고가로 예측했다. raw 데이터의 코딩 규약(데이터 사전, data dictionary)을 먼저 확인하는 것이 특성 공학의 0단계다.

## 수치형 변환과 구간화

치우친(skewed) 분포는 로그 변환으로 정규분포에 가깝게 만들면 선형 모델 성능이 오른다. 연속형을 구간(bin)으로 나누는 binning은 나이를 "10대/20대/30대"로 묶어 비선형 관계를 단순화하거나 이상치 영향을 줄인다.

```python
import numpy as np
import pandas as pd

# 로그 변환: 오른쪽으로 긴 꼬리(소득, 가격)를 압축
df['log_income'] = np.log1p(df['income'])  # log(1+x), 0 처리 안전

# 구간화(binning): 연속형 -> 범주형
df['age_group'] = pd.cut(df['age'], bins=[0, 18, 35, 60, 100],
                          labels=['청소년', '청년', '중년', '노년'])
```

> 🔍 **더 깊이**: SageMaker 빌트인 알고리즘 중 일부는 특정 형식을 요구한다. Linear Learner나 XGBoost는 보통 CSV/libsvm/RecordIO-protobuf를 받는데, 대규모 학습에서는 RecordIO-protobuf가 효율적이다. 또 XGBoost는 결측치를 내부적으로 학습 가능한 기본 방향으로 처리하므로 사전 대치가 항상 필요하진 않다. 알고리즘별 입력 요구사항을 아는 것도 특성 공학의 일부다.

## 정리하며

특성 공학은 4개 축으로 외우면 시험이 쉬워진다. ① **스케일링**(표준화 vs 정규화 vs 로버스트), ② **인코딩**(One-Hot=명목형, Ordinal=서열형, 타깃/임베딩=고차원), ③ **결측치**(평균/중앙값/최빈값/KNN, 결측 메커니즘 고려), ④ **이상치**(IQR vs Z-score, 제거·캡핑·변환). 그리고 모든 변환은 **train으로만 fit하고 test는 transform**한다는 누수 방지 원칙이 모든 문제의 밑바탕에 깔린다.

다음 글에서는 이 변환들을 코드 없이 시각적으로 적용하는 SageMaker Data Wrangler를 본다.

---

## 📝 연습 문제

**문제 1.** KNN 분류 모델에서 "연봉(단위: 원, 수백만~수천만)"과 "근속연수(0~30)" 두 특성을 쓰는데 근속연수가 예측에 거의 반영되지 않는다. 가장 적절한 조치는?

A) 근속연수 특성을 제거한다  
B) 두 특성에 StandardScaler 또는 MinMaxScaler를 적용해 스케일을 맞춘다  
C) 연봉을 범주형으로 One-Hot 인코딩한다  
D) 더 많은 데이터를 수집한다  

**정답: B**  
해설: KNN은 유클리드 거리 기반이라 단위가 큰 연봉이 거리 계산을 지배하고 근속연수는 묻힌다. 스케일링으로 두 특성을 같은 범위로 맞추면 둘 다 거리에 공정하게 기여한다. A는 유용한 정보를 버리는 잘못된 선택이고, C는 연속형 수치를 불필요하게 범주화해 정보를 잃으며, D는 스케일 불균형 문제 자체를 해결하지 못한다.

---

**문제 2.** "도시: 서울/부산/대구/광주" 명목형 범주를 LabelEncoder로 0/1/2/3으로 변환해 선형회귀에 넣었더니 성능이 이상하다. 원인으로 가장 적절한 것은?

A) LabelEncoder는 결측치를 처리하지 못한다  
B) 선형 모델이 정수 인코딩을 순서(광주 3 > 서울 0)로 해석해 존재하지 않는 크기 관계를 학습한다  
C) 도시는 항상 타깃 인코딩만 써야 한다  
D) LabelEncoder는 4개 이하 범주만 지원한다  

**정답: B**  
해설: 명목형 범주에는 순서가 없는데 정수 인코딩은 인위적 서열을 부여한다. 선형 모델은 이를 "광주가 서울보다 3배 크다"는 식으로 잘못 학습한다. 명목형은 One-Hot 인코딩이 정석이다. A는 LabelEncoder의 핵심 문제가 아니고, C는 타깃 인코딩이 한 대안일 뿐 유일한 답은 아니며, D는 범주 개수 제한이라는 잘못된 주장이다.

---

**문제 3.** 데이터 누수를 피하면서 StandardScaler를 적용하는 올바른 절차는?

A) 전체 데이터(train+test)로 fit한 뒤 train과 test를 각각 transform한다  
B) train으로 fit_transform하고, 같은 scaler로 test를 transform한다  
C) train과 test를 각각 독립적으로 fit_transform한다  
D) test로 fit하고 train을 transform한다  

**정답: B**  
해설: 스케일러는 train 데이터의 통계량(평균·표준편차)만으로 fit해야 하고, 그 통계량으로 test를 transform해야 한다. A는 test 정보가 fit 단계에 새어 들어가는 누수이고, C는 train과 test가 서로 다른 기준으로 변환되어 분포가 어긋나며, D는 train/test 역할이 뒤바뀐 명백한 누수다.

---

**문제 4.** 소득 데이터가 오른쪽으로 길게 치우쳐 있고(소수의 초고소득자) 선형회귀 성능이 낮다. 분포를 개선하기 위한 변환으로 가장 적절한 것은?

A) One-Hot 인코딩  
B) log(1+x) 로그 변환  
C) Label 인코딩  
D) 모든 값에 동일 상수를 더한다  

**정답: B**  
해설: 로그 변환은 오른쪽으로 긴 꼬리를 압축해 분포를 정규분포에 가깝게 만들어 선형 모델 적합도를 높인다. `log1p`는 0 값도 안전하게 처리한다. A와 C는 범주형 인코딩이라 연속형 소득 분포 개선과 무관하고, D는 상수를 더해도 분포 모양이 그대로라 치우침이 해결되지 않는다.

---

**문제 5.** 사기 탐지 데이터셋에서 IQR 기준으로 이상치를 탐지했더니 사기 거래 대부분이 이상치로 분류됐다. 이때 적절한 처리는?

A) 탐지된 이상치를 모두 제거한다  
B) 이상치가 곧 탐지 대상(정답)이므로 제거하지 않고 보존하며, 필요시 별도 처리한다  
C) 이상치를 중앙값으로 대치한다  
D) IQR 배수를 0으로 낮춰 더 많이 제거한다  

**정답: B**  
해설: 사기 탐지에서 이상치는 노이즈가 아니라 모델이 잡아내야 할 정답 신호다. 이를 제거하거나 대치하면 양성 클래스가 사라져 모델이 사기를 학습할 수 없게 된다. A·C·D는 모두 핵심 신호를 파괴하는 처리다. 이상치 처리는 항상 도메인 맥락에서 그 값이 오류인지 의미 있는 사건인지 판단해야 한다.

---
