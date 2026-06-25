# Day 5 - Week 3 종합 — 특성 공학·데이터 품질 복습

이번 주는 준비된 데이터를 모델이 학습할 수 있는 형태로 다듬는 과정 — 특성 공학과 데이터 품질 — 을 다뤘다. MLA-C01 도메인 1의 후반부이자 모델 성능을 가장 크게 좌우하는 단계다. "알고리즘보다 데이터"라는 ML의 격언이 가장 잘 드러나는 영역이기도 하다.

오늘은 Data Wrangler·Feature Store·Clarify를 하나의 흐름으로 엮어 복습한다. 세 도구가 각각 변환·관리·점검을 맡고, 이어 붙으면 "raw 데이터에서 신뢰할 수 있는 학습 데이터셋"까지의 파이프라인이 된다.

## 특성 공학 파이프라인 한눈에

```
[raw 데이터 (S3)]
        │  ① 변환 (Data Wrangler)
        │     스케일링·인코딩·결측치·이상치 처리
        v
[변환된 특성]
        │  ② 관리 (Feature Store)
        │     온라인(추론) + 오프라인(학습) 동시 저장
        v
[Feature Group]
        │  ③ 점검 (Clarify)
        │     편향·불균형·설명가능성 분석
        v
[검증된 학습 데이터셋] → SageMaker 학습
```

핵심은 이 세 단계가 **일관성**으로 연결된다는 점이다. Data Wrangler에서 정의한 변환을 Feature Store가 학습·추론에 동일하게 공급하고, Clarify가 그 데이터의 공정성을 보증한다.

> 💡 **관련 이론**: 데이터 과학자가 시간의 70~80%를 특성 공학에 쓴다는 통계는 과장이 아니다. Google의 "Hidden Technical Debt in Machine Learning Systems" 논문이 강조하듯, 실제 ML 시스템에서 모델 코드는 작은 부분이고 데이터 수집·검증·특성 추출·일관성 유지가 대부분의 복잡도와 실패 원인을 차지한다. 이번 주 세 도구는 모두 그 데이터 측 복잡도를 길들이는 장치다.

## 특성 공학 4대 변환 (Day 1~2)

raw 데이터를 모델이 읽을 숫자로 바꾸는 핵심 변환을 다시 정리한다.

| 변환 | 언제 | 대표 기법 |
|------|------|----------|
| 스케일링 | 수치 범위가 제각각 | StandardScaler, MinMaxScaler |
| 인코딩 | 범주형(문자열) 컬럼 | One-Hot, Label, Target 인코딩 |
| 결측치 처리 | 값이 비어 있음 | 평균/중앙값 대치, 삭제 |
| 이상치 처리 | 극단값 존재 | 클리핑, robust 스케일링 |

판별의 핵심은 알고리즘 의존성이다. 거리·경사 기반(KNN, 신경망)은 스케일링이 필수지만 트리 기반(XGBoost)은 스케일에 둔감하다. 범주형은 순서가 없으면 One-Hot, 카디널리티가 매우 높으면 Target 인코딩을 고려한다.

```python
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer

# 수치는 표준화, 범주는 원-핫 — 한 변환기로 묶기
preprocessor = ColumnTransformer([
    ("num", StandardScaler(), ["age", "income"]),
    ("cat", OneHotEncoder(handle_unknown="ignore"), ["region"]),
])
X_train_t = preprocessor.fit_transform(X_train)
X_test_t = preprocessor.transform(X_test)   # test엔 fit 안 함 — 누수 방지
```

> ⚠️ **함정**: 스케일러·인코더는 **train에만 `fit`**하고 test에는 `transform`만 한다. test 통계로 fit하면 test 정보가 학습에 새어 데이터 누수가 된다. 이 원칙은 SMOTE 같은 리샘플링에도 똑같이 적용된다.

## Data Wrangler (Day 2)

**SageMaker Data Wrangler**는 코드 없이 시각적으로 데이터를 가져오고 변환·분석하는 도구다. 300개 이상의 내장 변환과 데이터 품질 리포트를 제공하고, 만든 흐름(flow)을 Processing Job·Pipeline·Feature Store로 내보낼 수 있다.

- **임포트**: S3, Athena, Redshift 등에서 데이터 로드
- **변환**: 결측·인코딩·스케일링 등을 클릭으로 적용
- **분석**: 데이터 품질·편향 인사이트, 빠른 시각화
- **내보내기**: 변환 흐름을 재사용 가능한 작업으로 변환

> 🔍 **더 깊이**: Data Wrangler의 가치는 "시각적 탐색"에서 끝나지 않고 그 변환을 **재현 가능한 코드로 내보낸다**는 데 있다. 노트북에서 손으로 짠 변환은 추론 시 재현하기 어렵지만, Data Wrangler flow는 Processing Job으로 내보내 학습·추론에서 같은 변환을 보장한다. 탐색과 운영을 잇는 다리다.

## Feature Store (Day 3)

**SageMaker Feature Store**는 특성을 중앙에서 저장·재사용·일관 제공하는 저장소다. 두 스토어가 핵심이다.

| 구분 | 온라인 스토어 | 오프라인 스토어 |
|------|--------------|----------------|
| 목적 | 실시간 추론 | 학습·배치 |
| 지연 | 밀리초(key-value) | 높음(S3 Parquet) |
| 조회 | 최신 1건 (GetRecord) | 전체 이력 (Athena) |

가장 큰 가치는 **training/serving skew 방지**다. 학습과 추론이 같은 특성 정의를 공유해, 두 곳의 계산이 미묘하게 달라 성능이 무너지는 문제를 원천 차단한다. Feature Group(Record Identifier + Event Time)이 단위이며, Event Time이 point-in-time 조회와 미래 누수 방지의 기준이 된다.

```python
# 학습: 오프라인 스토어를 Athena로 대량 조회
query = feature_group.athena_query()
query.run(query_string="SELECT * FROM customer_features WHERE ...",
          output_location="s3://my-bucket/query-results/")

# 추론: 온라인 스토어에서 최신 특성 1건 조회
record = featurestore_runtime.get_record(
    FeatureGroupName="customer-features",
    RecordIdentifierValueAsString="cust_12345",
)
```

## Clarify와 데이터 품질 (Day 4)

**SageMaker Clarify**는 학습 전후로 편향을 측정하고(민감 속성 facet, CI·DPL 지표) 예측의 특성 기여도를 SHAP으로 설명한다. 여기에 데이터 품질 점검 — 클래스 불균형 처리(SMOTE·class weight, 반드시 분할 후 학습 셋에만), train/val/test 분할(불균형은 층화, 시계열은 시간 분할, test는 단 한 번) — 이 더해져 신뢰할 수 있는 데이터셋이 완성된다.

> 💡 **관련 이론**: 이번 주를 관통하는 한 단어는 "누수(leakage)"다. fit을 test에 하면 변환 누수, 분할 전 리샘플링하면 합성 누수, 미래 값을 특성에 쓰면 미래 누수, Feature Store의 Event Time을 무시하면 look-ahead 누수다. 모든 누수는 "평가는 좋은데 배포는 실패"라는 같은 증상을 낳는다. 특성 공학·데이터 품질의 절반은 누수를 막는 일이다.

## 정리하며

Week 3의 그림은 **변환 → 관리 → 점검**의 파이프라인이다. 4대 변환(스케일링·인코딩·결측·이상치)을 train에만 fit해 적용하고, Data Wrangler로 시각적·재현 가능하게 만들며, Feature Store로 학습·추론에 일관 공급(온라인/오프라인, skew 방지)하고, Clarify와 데이터 품질 기법으로 편향·불균형·분할을 점검한다. 이 모든 과정의 공통 적은 데이터 누수이며, 그것을 막는 것이 좋은 학습 데이터셋의 조건이다.

다음 주(Week 4)에는 이렇게 준비한 데이터로 본격적인 모델 학습·튜닝·평가에 들어간다.

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
