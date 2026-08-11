# Day 5 - Week 6 Comprehensive Review: Algorithm Selection and SageMaker Builtins

## 📌 핵심 정리

- Week 6을 관통하는 한 문장은 **"데이터 형태 × 출력 형태 → 빌트인"**이다. 이 조합 매핑을 외우면 대부분의 모델링 문항이 풀린다.
- 풀이는 항상 2단계다. **① 출력 형태 + 레이블 유무로 ML 유형 확정 → ② 데이터 형태로 빌트인을 하나로 좁힘.**
- "텍스트·이미지·시계열·희소"라는 단어는 일반 XGBoost를 밀어내고 전문 빌트인을 정답으로 만든다.
- 스케일링은 알고리즘 부류로 즉답한다. **거리(KNN, K-Means)·선형(Linear Learner)·PCA는 필수, 트리(XGBoost)는 불필요.**
- 입력 포맷도 단서다. **희소·대규모 효율은 RecordIO-protobuf, 토픽 모델은 BoW, DeepAR는 JSON Lines.**

## 한 장 요약: 문제에서 빌트인까지

이번 주는 MLS-C01 도메인 3(Modeling)의 출발점 — **알고리즘 선택**과 **SageMaker 빌트인** — 을 다뤘다. 시험의 모델링 문항은 거의 항상 "문제 유형 식별 → 알고리즘 부류 → 구체적 빌트인" 순으로 좁혀진다. 오늘은 나흘치를 하나의 의사결정 흐름으로 복습하고, 가장 헷갈리는 비교를 정리한다.

```text
[비즈니스 문제]
   │
   ├─ 1) 출력 형태로 ML 유형 식별 (Day1)
   │     범주 → 분류 | 수치 → 회귀 | 그룹 발견 → 군집
   │     추천 → 추천 | 희귀 사건 → 이상 탐지 | 주제 → 토픽 모델
   │     (레이블 있음 = 지도 / 없음 = 비지도)
   │
   ├─ 2) 데이터 형태로 빌트인 좁히기 (Day2~4)
   │     표 형식  → XGBoost / Linear Learner / KNN / K-Means
   │     텍스트   → BlazingText
   │     이미지   → Image Classification
   │     시계열   → DeepAR
   │     희소 추천 → Factorization Machines
   │     이상     → Random Cut Forest / IP Insights
   │     차원     → PCA
   │     주제     → LDA / NTM
   │
   └─ 3) 세부 확정
         스케일링이 필요한가 (거리/선형=필요, 트리=불필요)
         과적합/과소적합 조정, 입력 포맷(RecordIO-protobuf 등)
```

## Week 6 통합 매핑표

| 문제 | 빌트인 | 지도/비지도 | 입력 포맷 | 스케일링 |
|---|---|---|---|---|
| 정형 분류/회귀(비선형) | XGBoost | 지도 | CSV, libsvm, Parquet, RecordIO-protobuf | 불필요 |
| 정형 분류/회귀(초대규모·선형) | Linear Learner | 지도 | RecordIO-protobuf(권장), CSV | 필요 |
| 군집·세분화 | K-Means | 비지도 | RecordIO-protobuf, CSV | 필수 |
| 최근접 사례 기반 예측 | KNN | 지도 | RecordIO-protobuf, CSV | 필수 |
| 문서 분류 | BlazingText (supervised) | 지도 | 텍스트, `__label__` 형식 | 해당 없음 |
| 단어 임베딩 | BlazingText (Word2Vec) | 비지도 | 텍스트(공백 토큰화) | 해당 없음 |
| 이미지 분류 | Image Classification | 지도 | RecordIO 또는 이미지 + .lst | 컨테이너 처리 |
| 시계열 예측 | DeepAR | 지도 | JSON Lines(`start`,`target`,`cat`,`dynamic_feat`) | 해당 없음 |
| 희소 추천 | Factorization Machines | 지도 | RecordIO-protobuf (float32) | 수치 피처는 정리 권장 |
| 일반 수치 이상 탐지 | Random Cut Forest | 비지도 | CSV, RecordIO-protobuf | 권장 |
| 엔티티-IP 이상 탐지 | IP Insights | 비지도 | (entity, IP) CSV | 해당 없음 |
| 차원 축소 | PCA | 비지도 | RecordIO-protobuf, CSV | 필수 |
| 토픽 발견 | LDA / NTM | 비지도 | BoW | 해당 없음 |

> 💡 **관련 이론**: 이번 주를 관통하는 원칙은 하나다 — **"데이터 형태와 출력 형태가 알고리즘을 결정한다."** 같은 분류라도 정형이면 XGBoost, 텍스트면 BlazingText, 이미지면 Image Classification이다. 같은 비지도라도 그룹 발견이면 K-Means, 이상이면 RCF, 차원 축소면 PCA, 주제면 LDA/NTM이다. 시험은 데이터 형태(표/텍스트/이미지/시계열/희소)와 목표(예측/그룹/이상/주제/압축)를 시나리오에 심어 두고 그 조합으로 정확히 하나의 알고리즘으로 좁힌다. 그래서 "조합 → 빌트인" 매핑을 외우는 것이 가장 빠르다.

### 빌트인별 "이것만은" 하이퍼파라미터

보기에 파라미터 이름이 등장하면, 그 이름이 어느 알고리즘 소속인지만 알아도 답이 갈린다.

| 빌트인 | 반드시 아는 파라미터 | 역할 |
|---|---|---|
| XGBoost | `objective`, `num_round`, `max_depth`, `eta`, `scale_pos_weight` | 목적함수·라운드 수·복잡도·학습률·불균형 |
| Linear Learner | `predictor_type`, `num_classes`, `l1`/`wd`, `normalize_data` | 문제 유형·클래스 수·정규화·표준화 |
| K-Means | `k`, `init_method`, `extra_center_factor` | 클러스터 수·초기화·후보 중심 |
| KNN | `k`, `sample_size`, `dimension_reduction_type`, `predictor_type` | 이웃 수·샘플·차원 축소·분류/회귀 |
| Image Classification | `use_pretrained_model`, `augmentation_type`, `num_classes` | 전이 학습·증강·클래스 수 |
| DeepAR | `context_length`, `prediction_length`, `likelihood` | 과거 윈도·예측 윈도·출력 분포 |
| Factorization Machines | `num_factors`, `predictor_type` | 잠재 요인 차원·분류/회귀 |
| Random Cut Forest | `num_trees`, `num_samples_per_tree` | 트리 수·트리당 샘플 |
| PCA | `num_components`, `algorithm_mode`, `subtract_mean` | 성분 수·regular/randomized·중심화 |
| IP Insights | `num_entity_vectors`, `vector_dim` | 엔티티 해시 공간·임베딩 차원 |
| LDA / NTM | `num_topics` | 찾을 주제 개수 |

```
                       [지문 한 문장을 읽는다]
                                │
              "레이블"이라는 말이 있는가? ──아니오──┐
                                │예                │
                     출력이 무엇인가?          무엇을 하고 싶은가?
        ┌──────────┬────────────┼──────────┐      ├─ 그룹 → K-Means
      범주        수치        순위/선호    │      ├─ 이상 → RCF / IP Insights
        │           │            │         │      ├─ 압축 → PCA
   데이터 형태?  시계열인가?   Factorization│      └─ 주제 → LDA / NTM
   ├─ 표 → XGBoost / ├─ 예 → DeepAR  Machines
   │        Linear / │
   │        KNN      └─ 아니오 → XGBoost / Linear
   ├─ 텍스트 → BlazingText(supervised)
   └─ 이미지 → Image Classification
                  (위치까지면 Object Detection)
```

## 헷갈리는 짝 비교표

| 비교 | 핵심 차이 | 가르는 단서 |
|------|------|------|
| XGBoost vs Linear Learner | 비선형·정형 = XGBoost / 초대규모·선형·해석 = Linear Learner | "복잡한 상호작용" vs "수억 행·계수 해석" |
| K-Means vs KNN | K-Means = 비지도 군집 / KNN = 지도 이웃 예측 | 레이블 유무 |
| RCF vs IP Insights | 일반 수치 이상 / 엔티티-IP 관계 이상 | 데이터가 수치 벡터인가 (계정, IP) 쌍인가 |
| RCF vs 지도 이상 탐지 | 레이블 불필요·새 유형 대응 / 레이블 충분할 때 정밀 | "레이블이 거의 없다"가 있으면 RCF |
| LDA(토픽) vs LDA(선형판별분석) | SageMaker LDA는 토픽 모델, 이름 충돌 | 문맥이 문서·주제면 토픽 모델 |
| LDA vs NTM | 확률적·단순·해석 / 신경망·대규모·GPU | 데이터 규모와 GPU 언급 |
| DeepAR vs 일반 회귀 | 다수 관련 시계열·확률적 / 단일 점 추정 | "수천 개 시계열", "P90 구간" |
| BlazingText 두 모드 | supervised = 문서 분류 / Word2Vec = 단어 임베딩 | 레이블 유무 |
| FM vs 협업 필터링 | FM은 부가 피처까지 포함하는 일반화 | "맥락·시간 피처도 함께" |
| PCA vs K-Means | 축을 줄이는 것 / 행을 묶는 것 | "압축" vs "그룹" |
| Image Classification vs Object Detection | 라벨만 / 위치(바운딩 박스)까지 | "어디에 있는가"가 있으면 Detection |

> 💡 **관련 이론**: 스케일링 필요 여부는 알고리즘 부류에서 바로 답이 나온다. **거리 기반(KNN, K-Means), 선형 모델(Linear Learner), PCA**는 피처 스케일이 결과를 왜곡하므로 스케일링이 필수다. 반면 **트리 기반(XGBoost)**은 각 피처를 독립적으로 임계값 분할하므로 스케일에 불변이다. 시험의 전처리·알고리즘 함정(예: "XGBoost는 반드시 표준화해야 한다")은 이 원칙 하나로 걸러진다.

## 지문 단서 → 정답 매핑표 (통합)

| 지문 표현 | 정답 | 왜 |
|---|---|---|
| "레이블이 없다 / 그룹을 발견" | K-Means | 비지도 군집 |
| "레이블이 없다 / 희귀·새로운 이상" | Random Cut Forest | 비지도 이상 탐지 |
| "계정이 낯선 IP에서 로그인" | IP Insights | 엔티티-IP 특화 |
| "희소한 고차원 / 사용자-아이템" | Factorization Machines | 2차 상호작용, RecordIO-protobuf |
| "문서에서 주제를 추출" | LDA / NTM | 토픽 모델 |
| "피처가 수백 개, 입력을 줄여라" | PCA | 차원 축소(초대형이면 randomized) |
| "수천 개 관련 시계열 / 신제품 수요" | DeepAR | 시계열 공유 학습 |
| "확률 구간 P10/P50/P90이 필요" | DeepAR | 분위수 예측 |
| "이미지인데 라벨 데이터가 적다" | Image Classification + 전이 학습·증강 | 사전학습 가중치 활용 |
| "대규모 코퍼스를 매우 빠르게 문서 분류" | BlazingText supervised | fastText 기반, GPU 가속 |
| "정형 + 결측치 + 비선형 + 고정확도" | XGBoost | 결측 자체 처리, 비선형 포착 |
| "수억 행 + 빠름 + 계수 해석" | Linear Learner | 대규모 선형 |
| "실시간 스트림에서 이상" | Kinesis Data Analytics RCF | 스트림 내 SQL 함수 |
| "ML 인력 없이 빠르게 출시" | Comprehend / Rekognition / Forecast / Personalize | 관리형 AI 서비스 |

## 지표와 튜닝 방향 요약

| 상황 | 지표 선택 | 이유 |
|---|---|---|
| 클래스 불균형(양성 1% 미만) | Recall, PR-AUC | accuracy는 "전부 음성"으로도 99%가 나온다 |
| 오탐 비용이 큰 문제 | Precision | 잘못된 차단·발송의 대가가 크다 |
| 임계값 미정, 모델 비교 | ROC-AUC | 임계값과 무관한 분별력 |
| 회귀, 큰 오차가 치명적 | RMSE | 제곱으로 큰 오차를 크게 벌준다 |
| 회귀, 이상치가 많음 | MAE | 이상치에 강건 |
| 군집·토픽·차원 축소 | 실루엣·WCSS / 해석 가능성 / 설명 분산 | 정답 레이블이 없어 accuracy 불가 |

| 증상 | 조정 방향(XGBoost 기준) |
|---|---|
| 과적합 | `max_depth`↓, `eta`↓(+`num_round`↑), `subsample`↓, `gamma`/`lambda`/`alpha`↑ |
| 과소적합 | `max_depth`↑, `num_round`↑, 정규화↓ |
| 양성이 극히 드묾 | `scale_pos_weight`↑ (Linear Learner는 `balance_multiclass_weights`) |

## 자가 점검

정답을 머릿속으로 떠올려 본다.

1. 정형 데이터의 비선형 분류에서 기본이 되는 빌트인은? → **XGBoost**
2. 수천 개 관련 시계열의 확률적 수요 예측은? → **DeepAR**
3. 사용자-아이템 희소 추천의 권장 입력 포맷은? → **RecordIO-protobuf**
4. KNN과 K-Means가 공통으로 요구하는 전처리는? → **피처 스케일링**
5. 계정이 평소와 다른 IP에서 로그인하는 이상 탐지는? → **IP Insights**
6. 문서 집합에서 주제를 발견하되 대규모·GPU를 선호하면? → **NTM**
7. SageMaker의 "LDA"는 무엇인가? → **토픽 모델(Latent Dirichlet Allocation)**
8. K-Means에서 반드시 사전 지정해야 하는 값은? → **클러스터 수 `k`**
9. 이미지 데이터가 적을 때의 정석 조합은? → **전이 학습 + 데이터 증강**
10. 차원이 매우 큰 데이터의 PCA 모드는? → **`randomized`**

## 오답 노트 — 자주 걸리는 다섯 가지

| 함정 | 왜 틀리는가 | 올바른 판단 |
|---|---|---|
| "XGBoost도 반드시 스케일링해야 한다" | 트리는 스케일 불변 | 스케일링은 거리·선형·PCA에서만 필수 |
| "거리 기반인데 스케일링을 생략한다" | 큰 단위 피처가 거리를 지배 | KNN·K-Means는 스케일링 필수 |
| "SageMaker LDA는 선형판별분석이다" | 약어 충돌 | 빌트인 LDA는 토픽 모델 |
| "이상 탐지는 무조건 지도 분류" | 이상 레이블이 대개 부족 | 레이블 부족·패턴 변화면 RCF |
| "불균형 데이터를 accuracy로 평가" | 다수 클래스만 맞혀도 높게 나옴 | Recall·PR-AUC로 이동 |
| "희소 추천 데이터를 CSV로 넣는다" | 0이 대부분인 거대 밀집 표가 됨 | FM은 RecordIO-protobuf(float32) |
| "이미지 데이터가 적으니 더 깊은 모델을 처음부터" | 적은 데이터에서 과적합 | 전이 학습 + 증강 |

## 종합 시험 팁

- **1단계**: 출력 형태(범주/수치/그룹/추천/이상/주제)와 레이블 유무로 ML 유형을 확정한다.
- **2단계**: 데이터 형태(정형/텍스트/이미지/시계열/희소)로 빌트인을 하나로 좁힌다.
- "텍스트/이미지/시계열"이라는 단어는 일반 XGBoost를 밀어내고 전문 빌트인 답으로 민다.
- "레이블 없음 + 희귀/새로운 이상"은 RCF, "엔티티-IP"는 IP Insights.
- 거리/선형/PCA에서 "스케일링 생략" 보기는 오답이고, XGBoost에 "반드시 스케일링"도 오답이다.
- 입력 포맷: 희소·대규모 효율은 **RecordIO-protobuf**, 토픽 모델은 **BoW**, DeepAR는 **JSON Lines**.

다음 주(Week 7)는 실제로 모델을 **학습하고 튜닝**하는 단계로 넘어간다 — 학습 인프라, 하이퍼파라미터 최적화(Automatic Model Tuning), 정규화와 과적합 제어.

## 📖 용어

- **모델링 도메인(도메인 3)** : MLS-C01 시험 영역 중 알고리즘 선택·학습·튜닝·평가를 다루는 부분.
- **빌트인 알고리즘** : AWS가 컨테이너로 제공해 코드 없이 하이퍼파라미터만으로 학습시킬 수 있는 알고리즘.
- **RecordIO-protobuf** : 다수 빌트인이 권장하는 이진 입력 포맷. 희소·대규모 데이터에서 효율적이다.
- **BoW(Bag-of-Words)** : 단어 순서를 버리고 빈도만 세어 문서를 벡터로 만드는 표현. 토픽 모델의 입력.
- **JSON Lines** : 한 줄에 JSON 객체 하나를 담는 포맷. DeepAR가 시계열 하나를 한 줄로 받는다.
- **분위수 예측** : 단일 값이 아니라 P10/P50/P90처럼 확률 구간으로 미래를 예측하는 방식.
- **전이 학습** : 사전학습된 가중치에서 출발해 적은 데이터로 미세 조정하는 기법.
- **스케일 불변** : 값의 크기 순서만 유지되면 결과가 같은 성질. 트리 계열이 여기 해당한다.
- **잠재 요인** : 사용자·아이템을 설명하는 저차원 숨은 특성 벡터. FM의 `num_factors`가 차원을 정한다.
- **설명 분산 비율** : PCA에서 선택한 주성분이 원본 데이터의 분산을 얼마나 보존하는지 나타내는 비율.

## 📝 연습 문제

**문제 1.** 다음 중 "데이터 형태와 알고리즘"의 짝이 가장 적절한 것은?

A) 시계열 수요 예측 → BlazingText  
B) 정형 데이터 비선형 분류 → PCA  
C) 라벨 있는 이미지 분류 → Image Classification(전이학습)  
D) 단어 임베딩 → DeepAR  

**정답: C**  
해설: 라벨 있는 이미지 분류는 전이학습 기반 Image Classification이 정석이다. 시계열은 DeepAR(A는 틀림), 정형 비선형 분류는 XGBoost(B의 PCA는 차원축소), 단어 임베딩은 BlazingText Word2Vec(D의 DeepAR는 시계열)이다.

---

**문제 2.** 한 팀이 XGBoost로 정형 데이터 분류 모델을 만들면서 "거리 왜곡을 막기 위해 반드시 표준화해야 한다"고 주장한다. 이 주장에 대한 평가로 옳은 것은?

A) 옳다. 모든 알고리즘은 스케일링이 필수다  
B) 틀리다. XGBoost는 트리 기반이라 스케일에 불변이므로 스케일링이 필수가 아니다  
C) 옳다. XGBoost는 거리 기반 알고리즘이다  
D) 틀리다. XGBoost는 텍스트 전용이라 스케일 개념이 없다  

**정답: B**  
해설: XGBoost는 피처를 독립적으로 임계값 분할하는 트리 기반이라 스케일에 불변이며 스케일링이 필수가 아니다. 모든 알고리즘이 필수(A)는 거짓이고, XGBoost는 거리 기반이 아니며(C), 텍스트 전용(D)도 아니다.

---

**문제 3.** "레이블이 거의 없고 계속 새로운 형태로 나타나는 네트워크 트래픽 이상을, 일반 수치 메트릭에서 비지도로 탐지"하려 한다. 가장 적합한 빌트인은?

A) Random Cut Forest  
B) Factorization Machines  
C) Linear Learner 분류  
D) K-Means로 2개 군집  

**정답: A**  
해설: 레이블 없는 일반 수치 데이터의 이상 탐지는 RCF가 정석이며, 새로운 형태의 이상에도 점수로 반응한다. FM(B)은 추천, Linear Learner 분류(C)는 레이블이 필요하고, K-Means 2군집(D)은 이상 탐지 목적과 맞지 않는다.

---

**문제 4.** 다음 비교 중 설명이 틀린 것은?

A) K-Means는 비지도 군집, KNN은 지도 예측이다  
B) DeepAR는 다수 관련 시계열을 함께 학습하고 확률적 예측을 제공한다  
C) BlazingText supervised는 문서 분류, Word2Vec은 단어 임베딩이다  
D) IP Insights는 일반 수치 스트림의 스파이크 탐지에 특화된 알고리즘이다  

**정답: D**  
해설: IP Insights는 "엔티티-IP" 관계 이상에 특화돼 있고, 일반 수치 스트림 스파이크는 RCF가 담당한다. A·B·C는 모두 올바른 설명이다.

---

**문제 5.** 사용자-아이템 상호작용이 매우 희소한 추천 데이터에서 2차 상호작용을 효율적으로 학습하려 한다. 알고리즘과 권장 입력 포맷의 올바른 짝은?

A) XGBoost, CSV  
B) PCA, BoW  
C) Factorization Machines, RecordIO-protobuf  
D) DeepAR, JSON Lines  

**정답: C**  
해설: 초고차원·희소 상호작용 추천은 Factorization Machines가 적합하며 희소 데이터에 최적화된 RecordIO-protobuf를 권장한다. XGBoost+CSV(A)는 초고차원 희소에 비효율적, PCA(B)는 차원축소, DeepAR(D)는 시계열 예측이다.

---
