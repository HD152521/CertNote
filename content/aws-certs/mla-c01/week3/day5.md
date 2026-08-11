# Day 5 - Week 3 종합 — 특성 공학·데이터 품질 복습

## 📌 핵심 정리

- Week 3의 그림은 **변환(Data Wrangler) → 관리(Feature Store) → 점검(Clarify)** 파이프라인이다.
- 4대 변환은 **스케일링·인코딩·결측치·이상치**. 알고리즘 의존성(거리/경사 vs 트리)이 선택을 가른다.
- Feature Store의 두 스토어 — **온라인(밀리초 추론)** / **오프라인(S3 학습 이력)**.
- Clarify로 **학습 전 편향(CI·DPL)**과 **학습 후 설명(SHAP)**을 본다.
- 이번 주를 관통하는 한 단어는 **누수(leakage)** — 변환·합성·미래·평가 누수를 모두 막아야 한다.

## 특성 공학 파이프라인 한눈에

이번 주는 준비된 데이터를 모델이 학습할 수 있는 형태로 다듬는 과정을 다뤘다. "알고리즘보다 데이터"라는 ML의 격언이 가장 잘 드러나는 영역이다.

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

| 단계 | 도구 | 해결하는 문제 |
|------|------|-------------|
| 변환 | Data Wrangler | 손코딩의 느림과 재현 불가 |
| 관리 | Feature Store | 특성 중복 제작, training/serving skew |
| 점검 | Clarify + 품질 기법 | 편향, 불균형, 누수 |

> 💡 **관련 이론**: 데이터 과학자가 시간의 70~80%를 특성 공학에 쓴다는 통계는 과장이 아니다. Google의 "Hidden Technical Debt in Machine Learning Systems" 논문이 강조하듯, 실제 ML 시스템에서 모델 코드는 작은 부분이고 데이터 수집·검증·특성 추출·일관성 유지가 대부분의 복잡도와 실패 원인을 차지한다. 이번 주 세 도구는 모두 그 데이터 측 복잡도를 길들이는 장치다.

## 특성 공학 4대 변환 (Day 1)

raw 데이터를 모델이 읽을 숫자로 바꾸는 핵심 변환을 다시 정리한다.

| 변환 | 언제 | 대표 기법 | 판별 포인트 |
|------|------|----------|------------|
| 스케일링 | 수치 범위가 제각각 | StandardScaler, MinMaxScaler, RobustScaler | 거리·경사 기반이면 필수, 트리면 불필요 |
| 인코딩 | 범주형(문자열) 컬럼 | One-Hot, Ordinal, Target 인코딩 | 순서 없으면 One-Hot, 고카디널리티면 Target |
| 결측치 처리 | 값이 비어 있음 | 평균/중앙값/최빈값 대치, KNN, 삭제 | 이상치 있으면 중앙값, 결측이 의미면 플래그 |
| 이상치 처리 | 극단값 존재 | IQR·Z-score 탐지, 클리핑, 로그 변환 | 탐지 대상이면 절대 제거 금지 |

판별의 핵심은 알고리즘 의존성이다. 거리·경사 기반(KNN, 신경망, 선형회귀)은 스케일링이 필수지만 트리 기반(XGBoost, Random Forest)은 스케일에 둔감하다.

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

| 단계 | 내용 |
|------|------|
| 임포트 | S3, Athena, Redshift, Snowflake, Feature Store에서 로드 |
| 변환 | 결측·인코딩·스케일링 등 300+ 내장 변환을 클릭으로 |
| 분석 | Data Quality 리포트, Quick Model, Target Leakage, Bias, 다중공선성 |
| 내보내기 | Processing Job, Feature Store, Pipelines, 코드, S3 |

> 🔍 **더 깊이**: Data Wrangler의 가치는 "시각적 탐색"에서 끝나지 않고 그 변환을 **재현 가능한 코드로 내보낸다**는 데 있다. 노트북에서 손으로 짠 변환은 추론 시 재현하기 어렵지만, Data Wrangler flow는 Processing Job으로 내보내 학습·추론에서 같은 변환을 보장한다. 탐색과 운영을 잇는 다리다.

> ⚠️ **함정**: 화면에서 보는 데이터는 **샘플**이다. 전체 데이터에 적용하려면 flow를 Processing Job으로 export해 실행해야 한다.

## Feature Store (Day 3)

**SageMaker Feature Store**는 특성을 중앙에서 저장·재사용·일관 제공하는 저장소다. 두 스토어가 핵심이다.

| 구분 | 온라인 스토어 | 오프라인 스토어 |
|------|--------------|----------------|
| 목적 | 실시간 추론 | 학습·배치 |
| 지연 | 밀리초(key-value) | 높음(S3 Parquet) |
| 조회 | 최신 1건 (GetRecord) | 전체 이력 (Athena) |
| 비용 | 상대적으로 높음 | 저렴 |

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

**SageMaker Clarify**는 학습 전후로 편향을 측정하고(민감 속성 facet, CI·DPL 지표) 예측의 특성 기여도를 SHAP으로 설명한다. 여기에 데이터 품질 점검이 더해져 신뢰할 수 있는 데이터셋이 완성된다.

| 점검 항목 | 기법 | 지켜야 할 순서 |
|----------|------|--------------|
| 편향 | Clarify pre/post-training bias | 학습 전에 먼저 본다 |
| 설명가능성 | SHAP 특성 기여도 | 학습 후 |
| 클래스 불균형 | SMOTE, class weight, 언더/오버샘플링 | **분할 후 학습 셋에만** |
| 데이터 분할 | 층화(불균형), 시간 분할(시계열) | 리샘플링·변환보다 먼저 |
| 최종 평가 | test 셋 | **단 한 번만** |

> 💡 **관련 이론**: 이번 주를 관통하는 한 단어는 "누수(leakage)"다. fit을 test에 하면 변환 누수, 분할 전 리샘플링하면 합성 누수, 미래 값을 특성에 쓰면 미래 누수, Feature Store의 Event Time을 무시하면 look-ahead 누수다. 모든 누수는 "평가는 좋은데 배포는 실패"라는 같은 증상을 낳는다. 특성 공학·데이터 품질의 절반은 누수를 막는 일이다.

## 누수 유형 총정리

| 누수 유형 | 언제 생기나 | 증상 | 예방 |
|----------|-----------|------|------|
| 변환 누수 | 전체 데이터로 스케일러·인코더 fit | 검증 성능 과대평가 | 분할 후 train에만 fit |
| 합성 누수 | 분할 전 SMOTE 등 리샘플링 | 테스트에 합성 샘플 혼입 | 분할 후 학습 셋에만 |
| 타깃 누수 | 타깃 정보를 담은 특성 사용 | 상관 0.99, 배포 시 무용 | Target Leakage 분석, 도메인 검토 |
| 미래 누수 | 예측 시점 이후 값을 특성으로 | 백테스트만 좋음 | Event Time, point-in-time 조인 |
| 평가 누수 | test로 모델을 반복 수정 | 일반화 추정 왜곡 | test는 마지막 한 번 |

## Week 3 한 줄 체크리스트

| 물음 | 답 |
|------|-----|
| XGBoost에 스케일링이 필요한가? | 아니다. 트리는 임계값 비교라 단위와 무관 |
| 도시명을 0/1/2로 인코딩하면? | 없는 순서를 학습한다. One-Hot이 정석 |
| 결측이 40%인 컬럼은? | 제거하거나 "결측 여부" 플래그로 전환 |
| 사기 탐지에서 이상치를 제거하면? | 정답 신호를 지우는 것. 보존해야 한다 |
| 밀리초 특성 조회는 어느 스토어? | 온라인 스토어 GetRecord |
| 학습 데이터셋 대량 조회는? | 오프라인 스토어 + Athena |
| 학습 전 성별 간 편향 측정은? | Clarify pre-training bias (CI·DPL) |
| SMOTE는 언제 적용하나? | train/test 분할 후 학습 셋에만 |
| 불균형 데이터 분할은? | 층화 분할(stratify) |
| 시계열 데이터 분할은? | 시간 순 분할. 무작위는 금물 |

## 시나리오로 Week 3 점검하기

| 상황 | 판단 | 근거 |
|------|------|------|
| KNN에서 연봉이 거리 계산을 지배한다 | 스케일링 적용 | 거리 기반은 단위에 민감 |
| XGBoost 성능을 위해 스케일링을 고민 중 | 불필요 | 분할 임계값 비교라 단위 무관 |
| 도시명을 0/1/2로 넣었더니 선형 모델이 이상하다 | One-Hot으로 교체 | 없는 순서를 학습했음 |
| 우편번호가 수천 종이라 One-Hot이 부담 | 타깃/빈도 인코딩, 임베딩 | 차원 폭발 회피 |
| 소득 분포가 오른쪽으로 길다 | `log1p` 변환 | 선형 모델 적합도 개선 |
| 면적 컬럼에 99999가 있다 | 데이터 사전 확인 후 결측 처리 | sentinel value 가능성 |
| 사기 거래가 IQR 기준 이상치로 잡힌다 | 제거하지 않고 보존 | 이상치가 곧 정답 신호 |
| 코드 없이 시각적으로 전처리 설계 | Data Wrangler | GUI + 300+ 변환 |
| 설계한 변환을 수백 GB에 적용 | Processing Job으로 export | 화면은 샘플일 뿐 |
| "마지막 로그인일"의 예측력이 비정상적으로 높다 | Target Leakage 의심 | 타깃 시점 정보가 섞임 |
| 추론 서버가 특성을 따로 계산해 성능 저하 | Feature Store로 정의 통합 | training/serving skew |
| 실시간으로 사용자 최신 특성이 필요 | 온라인 스토어 GetRecord | 밀리초 단건 조회 |
| 학습셋을 위해 전체 이력이 필요 | 오프라인 스토어 + Athena | 대량 이력 조회 |
| 대출 모델의 성별 간 공정성 확인 | Clarify pre-training bias | CI·DPL 측정 |
| 왜 거절됐는지 설명해야 한다 | SHAP 특성 기여도 | 규제 산업의 설명 요구 |
| 사기 0.2% 데이터의 소수 클래스를 늘리고 싶다 | 분할 후 학습 셋에만 SMOTE | 합성 누수 방지 |
| 시계열 데이터를 나누려 한다 | 시간 순 분할 | 무작위는 미래 누수 |
| 검증 정확도 99%인데 배포하면 무너진다 | 누수 계열 전수 점검 | 이번 주의 공통 증상 |

## 변환·관리·점검을 하나로 잇기

```
[raw]
  │  Data Wrangler flow (설계)
  │      └─ export → Processing Job (전체 적용)
  v
[특성]
  │  Feature Store ingest
  │      ├─ 오프라인 → 학습셋 (Athena, point-in-time)
  │      └─ 온라인   → 추론 (GetRecord)
  v
[점검]
  │  Clarify: 학습 전 편향(CI·DPL) / 학습 후 SHAP
  │  품질: 불균형 처리(분할 후), 층화·시간 분할, test 1회
  v
[신뢰할 수 있는 학습 데이터셋]
```

> ⚠️ **함정**: 이 그림에서 어느 한 화살표라도 손코딩으로 끊기면 재현성과 일관성이 함께 무너진다. "노트북에서만 잘 되는 전처리"는 배포 시점에 반드시 문제를 일으킨다. 시험에서 "재현 가능하게", "학습과 추론이 동일하게"라는 문구가 보이면 export·Feature Store·Pipelines 방향이 정답이다.

## Week 3을 한 문장으로

**"train에만 fit하고, 분할을 가장 먼저 하고, 특성은 한 곳에서 정의해 학습과 추론이 함께 읽고, 편향은 만들기 전에 측정한다."**

| 원칙 | 어기면 |
|------|-------|
| 분할을 가장 먼저 | 변환·합성 누수 |
| train에만 fit | 검증 성능 과대평가 |
| 특성 정의는 한 곳에 | training/serving skew |
| Event Time 기준 조인 | 미래 누수 |
| test는 단 한 번 | 일반화 추정 왜곡 |
| 편향은 학습 전에 측정 | 불공정을 자동화·증폭 |
| 평가 셋은 운영 분포 그대로 | 현실과 무관한 지표 |

## Week 4로 넘어가기 전 확인

| 물음 | 답할 수 있어야 한다 |
|------|------------------|
| 어떤 모델이 스케일링을 요구하나 | 거리·경사 기반. 트리 계열은 불필요 |
| 고카디널리티 범주를 어떻게 다루나 | 타깃·빈도 인코딩 또는 임베딩 |
| Feature Store의 두 스토어 차이는 | 온라인=밀리초 단건, 오프라인=S3 이력 |
| 편향을 언제 측정하나 | 학습 전(데이터)과 학습 후(예측) 모두 |
| 누수를 막는 첫 번째 행동은 | 무엇보다 먼저 데이터를 분할하는 것 |

다음 주(Week 4)에는 이렇게 준비한 데이터로 본격적인 모델 학습·튜닝·평가에 들어간다.

## 📖 용어

- **특성 공학** : raw 데이터를 모델이 학습 가능한 숫자 표현으로 바꾸는 작업 전체.
- **ColumnTransformer** : 수치 컬럼과 범주 컬럼에 서로 다른 변환을 한 번에 적용하는 파이프라인 도구.
- **handle_unknown="ignore"** : 학습 때 못 본 새 범주가 들어와도 에러 없이 0으로 처리하는 인코더 옵션.
- **flow** : Data Wrangler에서 변환 순서를 고정해 담아둔 청사진. 재현성의 핵심.
- **Feature Group** : Feature Store의 저장 단위. Record Identifier와 Event Time이 필수다.
- **Event Time** : 특성 값이 기록된 시각. 과거 시점 재구성과 미래 누수 방지의 기준이 된다.
- **training/serving skew** : 학습과 추론의 특성 계산이 달라 모델이 조용히 나빠지는 현상.
- **facet(민감 속성)** : 공정성을 따져야 할 컬럼. Clarify 편향 분석의 기준축.
- **CI / DPL** : 그룹 간 표본 수 불균형 / 그룹 간 긍정 레이블 비율 차이를 재는 편향 지표.
- **SHAP** : 각 특성이 예측에 기여한 몫을 공정하게 배분해 계산한 설명 지표.

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
