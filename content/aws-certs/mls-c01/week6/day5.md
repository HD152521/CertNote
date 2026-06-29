# Day 5 - Week 6 종합 복습: 알고리즘 선택과 SageMaker 빌트인

이번 주는 MLS-C01 도메인 3(Modeling)의 출발점 — **알고리즘 선택**과 **SageMaker 빌트인** — 을 다뤘다. 시험에서 모델링 문제는 거의 항상 "문제 유형 식별 → 알고리즘 부류 → 구체적 빌트인" 순으로 좁혀진다. 오늘은 나흘 치를 하나의 의사결정 흐름으로 엮어 복습하고, 가장 헷갈리는 비교를 정리한다.

## 한 장 요약: 문제에서 빌트인까지

```text
[비즈니스 문제]
   │
   ├─ 1) 출력 형태로 ML 유형 판별 (Day1)
   │     범주 → 분류 | 수치 → 회귀 | 그룹발견 → 군집
   │     추천 → 추천 | 드문사건 → 이상탐지 | 주제 → 토픽모델
   │     (레이블 있으면 지도 / 없으면 비지도)
   │
   ├─ 2) 데이터 형태로 빌트인 좁히기 (Day2~4)
   │     정형  → XGBoost / Linear Learner / KNN / K-Means
   │     텍스트 → BlazingText
   │     이미지 → Image Classification
   │     시계열 → DeepAR
   │     희소추천 → Factorization Machines
   │     이상   → Random Cut Forest / IP Insights
   │     차원   → PCA
   │     주제   → LDA / NTM
   │
   └─ 3) 세부 결정
         스케일링 필요? (거리/선형=예, 트리=아니오)
         과적합/과소적합 조정, 입력 포맷(RecordIO-protobuf 등)
```

## 정형 데이터 4종 (Day2)

| 알고리즘 | 유형 | 스케일링 | 대표 단서 |
|------|------|------|------|
| XGBoost | 분류/회귀 | 불필요 | 정형·비선형·높은 정확도 |
| Linear Learner | 분류/회귀 | 필요 | 초대규모·고속·선형·해석 |
| K-Means | 군집(비지도) | 필요 | 세분화·그룹 발견 |
| KNN | 분류/회귀 | 필요 | 가장 비슷한 사례·이웃 |

## 특화 데이터 4종 (Day3)

| 데이터 | 빌트인 | 포인트 |
|------|------|------|
| 텍스트 분류 | BlazingText(supervised) | `__label__` 포맷 |
| 단어 임베딩 | BlazingText(Word2Vec) | cbow/skipgram |
| 이미지 분류 | Image Classification | 전이학습·증강 |
| 시계열 예측 | DeepAR | 다수 시계열·확률(P90) |
| 희소 추천 | Factorization Machines | RecordIO-protobuf |

## 비지도·이상탐지 4종 (Day4)

| 빌트인 | 과제 | 단서 |
|------|------|------|
| Random Cut Forest | 이상(일반 수치) | 드문 사건·실시간 |
| IP Insights | 이상(엔티티-IP) | 비정상 로그인 |
| PCA | 차원 축소 | 피처 너무 많음·압축 |
| LDA / NTM | 토픽 모델 | 주제 발견(LDA=단순, NTM=대규모·GPU) |

> 💡 **관련 이론**: 이번 주를 관통하는 단일 원칙은 **"데이터 형태와 출력 형태가 알고리즘을 결정한다"**이다. 같은 분류라도 정형이면 XGBoost, 텍스트면 BlazingText, 이미지면 Image Classification으로 갈리고, 같은 비지도라도 그룹 발견은 K-Means, 이상은 RCF, 차원 축소는 PCA, 주제는 LDA/NTM이다. 시험은 지문에 데이터 형태(표/텍스트/이미지/시계열/희소)와 목표(예측/그룹/이상/주제/압축)를 심어 두고, 그 조합으로 정확히 한 알고리즘을 가리킨다. 따라서 암기 대상은 "조합 → 빌트인" 매핑이다.

## 가장 헷갈리는 비교

| 비교 | 핵심 차이 |
|------|------|
| XGBoost vs Linear Learner | 비선형·정형=XGBoost / 초대규모·선형·해석=Linear |
| K-Means vs KNN | K-Means=비지도 군집 / KNN=지도 이웃 예측 |
| RCF vs IP Insights | 일반 수치 이상 / 엔티티-IP 관계 이상 |
| LDA(토픽) vs LDA(선형판별) | SageMaker LDA는 토픽 모델, 이름만 같음 |
| LDA vs NTM | 확률·단순·해석 / 신경망·대규모·GPU |
| DeepAR vs 일반 회귀 | 다수 관련 시계열·확률 예측 vs 단일 점추정 |
| BlazingText 두 모드 | supervised=문서 분류 / Word2Vec=단어 임베딩 |

> 💡 **관련 이론**: 스케일링 필요 여부는 알고리즘 부류로 즉답된다. **거리 기반(KNN, K-Means)과 선형 모델(Linear Learner), PCA**는 피처 스케일이 결과를 왜곡하므로 스케일링이 필수다. 반면 **트리 기반(XGBoost)**은 각 피처를 독립적으로 임계값 분할하므로 스케일에 불변이다. 시험에서 전처리와 알고리즘을 엮은 함정(예: "XGBoost인데 스케일링을 반드시 해야 한다")이 나오면 이 원칙으로 거른다.

## 자가 점검 질문

답을 머릿속으로 떠올려 보자.

1. 정형 데이터의 비선형 분류 기본값 빌트인은? → **XGBoost**
2. 수천 개 관련 시계열의 확률적 수요 예측? → **DeepAR**
3. 사용자-아이템 희소 행렬 추천의 권장 입력 포맷? → **RecordIO-protobuf**
4. KNN과 K-Means에 공통으로 필요한 전처리? → **피처 스케일링**
5. 계정이 평소와 다른 IP에서 접속하는 이상 탐지? → **IP Insights**
6. 문서 집합에서 주제 발견, 대규모·GPU 선호? → **NTM**
7. SageMaker "LDA"는 무엇? → **토픽 모델(Latent Dirichlet Allocation)**

## 시험 팁 종합

- **1단계**: 출력 형태(범주/수치/그룹/추천/이상/주제)와 레이블 유무로 ML 유형 확정.
- **2단계**: 데이터 형태(정형/텍스트/이미지/시계열/희소)로 빌트인 한 개로 좁힘.
- "텍스트/이미지/시계열"이라는 단어는 일반 XGBoost를 밀어내고 특화 빌트인으로 답을 민다.
- "레이블 없음 + 드문/새로운 이상"은 RCF, "엔티티-IP"는 IP Insights.
- 거리/선형/PCA에서 "스케일링 생략" 보기는 오답, XGBoost에 "스케일링 필수" 보기도 오답.
- 입력 포맷: 희소/대규모 효율은 **RecordIO-protobuf**, 토픽 모델은 **BoW**.

## 정리하며

Week 6은 "문제를 알고리즘으로 번역하는" 모델링의 첫 단계였다. 출력 형태로 ML 유형을 정하고, 데이터 형태로 SageMaker 빌트인을 한 개로 좁히며, 스케일링·입력 포맷·과적합 조정 같은 세부를 마무리한다. 핵심은 **"데이터 형태 × 출력 형태 → 빌트인"** 매핑의 암기와, 거리/선형/트리의 스케일링 원칙이다.

다음 주(Week 7)에서는 모델을 실제로 **학습·튜닝**하는 단계 — 학습 인프라, 하이퍼파라미터 최적화(Automatic Model Tuning), 정규화와 과적합 제어 — 로 넘어간다.

---

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
