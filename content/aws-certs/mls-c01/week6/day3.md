# Day 3 - SageMaker 빌트인 2: 텍스트·이미지·시계열·추천

어제는 정형 데이터 알고리즘을 다뤘다. 오늘은 데이터 형태가 특별할 때 — **텍스트, 이미지, 시계열, 희소 상호작용** — 쓰는 특화 빌트인 네 가지를 본다. 시험은 "데이터가 텍스트/이미지/시계열이다"라는 단서로 일반 XGBoost가 아니라 이들 특화 알고리즘으로 답을 민다.

## BlazingText — 텍스트 분류와 단어 임베딩

Word2Vec과 텍스트 분류를 GPU로 매우 빠르게 처리하는 빌트인. 두 가지 모드가 있다.

- **Word2Vec(비지도)**: 단어를 벡터로 임베딩. 유사 단어 탐색, 다운스트림 피처 생성.
- **Text Classification(지도)**: 문서 → 레이블(감성/주제 등). fastText 기반.

```text
모드 결정:
  레이블이 있고 문서를 분류 → supervised (text classification)
  레이블 없이 단어 벡터만   → Word2Vec (cbow / skipgram / batch_skipgram)
```

- **입력**: 텍스트 파일(공백 토큰화). 지도 모드는 `__label__<레이블> 문장` 형식.
- **강점**: 대규모 코퍼스에서 압도적 속도, 다국어, OOV(미등록 단어) 대응(subword).

> 💡 **관련 이론**: BlazingText의 Word2Vec은 "주변 단어로 중심 단어를 맞히거나(CBOW) 중심 단어로 주변을 맞히는(skip-gram)" 방식으로 의미가 비슷한 단어를 벡터 공간에서 가깝게 배치한다. 이렇게 학습된 임베딩은 그 자체로 단어 유사도 검색에 쓰이거나, 다른 모델의 입력 피처가 된다. 시험에서 "단어 간 의미적 유사도" / "임베딩"이 핵심이면 Word2Vec 모드, "문서를 카테고리로 분류"이면 supervised 모드로 갈린다.

## Image Classification — 이미지 분류

이미지를 하나 이상의 레이블로 분류하는 CNN(ResNet) 기반 빌트인.

- **용도**: 단일/다중 레이블 이미지 분류.
- **입력**: RecordIO 또는 이미지(.jpg/.png) + .lst 리스트 파일.
- **핵심 기법**: **전이 학습(Transfer Learning)** — `use_pretrained_model=1`로 ImageNet 사전학습 가중치에서 시작해 적은 데이터로도 좋은 성능.

```text
주요 하이퍼파라미터:
  num_classes, num_training_samples
  use_pretrained_model   0(처음부터) | 1(전이학습)
  image_shape, learning_rate, mini_batch_size
  augmentation_type      이미지 증강 (crop/color 등)
```

- 데이터가 적을 때: 전이 학습 + 데이터 증강이 정석.
- 객체 위치까지 필요하면 분류가 아니라 **Object Detection** 빌트인, 픽셀 단위는 **Semantic Segmentation**.

## DeepAR — 시계열 예측

RNN 기반 시계열 예측 빌트인. 단일 시계열이 아니라 **여러 관련 시계열을 함께 학습**해 패턴을 공유하는 것이 핵심 강점이다.

- **용도**: 수요/매출/트래픽 등 미래 값 예측, 확률적(분위수) 예측.
- **입력**: JSON Lines — 각 시계열의 `start`, `target`, 선택적 `cat`(범주), `dynamic_feat`(공변량).
- **강점**: 많은 유사 시계열(예: 매장 수천 곳)에서 개별 학습보다 정확. 신규/짧은 시계열(콜드 스타트)도 다른 시계열에서 배운 패턴으로 예측.

```text
주요 하이퍼파라미터:
  context_length      과거 입력 구간 길이
  prediction_length   예측 구간 길이
  epochs, num_cells, num_layers
  likelihood          출력 분포(가우시안 등)
```

> 💡 **관련 이론**: 전통적 ARIMA/지수평활은 시계열 하나씩 따로 모델링하지만, DeepAR는 수많은 관련 시계열을 한 모델로 학습해 **계절성·추세를 교차 학습**한다. 그래서 데이터가 짧은 신규 항목도 비슷한 항목의 패턴을 빌려 예측할 수 있다. 또 점 추정이 아니라 분포(분위수)를 내놓아 P10/P50/P90 같은 불확실성 구간을 제공한다. 시험에서 "수천 개의 관련 시계열" / "신규 상품 수요" / "확률적 예측 구간"이 보이면 DeepAR가 단서다. 더 관리형이 필요하면 Amazon Forecast.

## Factorization Machines — 희소 고차원 추천

사용자-아이템처럼 **매우 희소하고 고차원**인 데이터에서 피처 간 상호작용(2차)을 효율적으로 모델링한다.

- **용도**: 추천(클릭률 예측, 평점 예측), 희소 분류/회귀.
- **입력**: RecordIO-protobuf(float32). **희소 데이터에 최적화**되어 CSV는 비권장.
- **강점**: One-Hot으로 폭발한 초고차원·희소 입력에서도 상호작용을 효율적으로 학습.

```text
주요 하이퍼파라미터:
  num_factors        잠재 요인(latent) 차원
  predictor_type     binary_classifier | regressor
  bias/linear/factors 각 항의 정규화·초기화 설정
```

추천 맥락에서 FM은 협업 필터링을 일반화한다: 사용자 ID·아이템 ID를 One-Hot으로 넣으면 행렬 분해와 유사하게 동작하고, 추가 피처(시간·맥락)도 함께 넣을 수 있다.

## 데이터 형태별 매핑 요약

| 데이터 형태 | 과제 | 빌트인 | 포인트 |
|------|------|------|------|
| 텍스트 | 분류 | BlazingText(supervised) | `__label__` 포맷 |
| 텍스트 | 임베딩/유사도 | BlazingText(Word2Vec) | cbow/skipgram |
| 이미지 | 분류 | Image Classification | 전이학습·증강 |
| 이미지 | 위치 탐지 | Object Detection | 분류 아님 |
| 시계열 | 예측 | DeepAR | 다수 시계열 공유, 확률 예측 |
| 희소 상호작용 | 추천 | Factorization Machines | RecordIO-protobuf, 희소 최적 |

## 시험 팁

- "텍스트를 카테고리로" → BlazingText supervised, "단어 의미 유사도/임베딩" → Word2Vec.
- "이미지 + 데이터가 적음" → Image Classification + **전이 학습/증강**.
- "이미지에서 물체 위치까지" → Object Detection(분류 아님).
- "수천 개 관련 시계열 / 신규 항목 수요 / P90 구간" → DeepAR.
- "사용자-아이템 / 매우 희소 / 추천" → Factorization Machines(+ RecordIO-protobuf).

## 정리하며

오늘은 데이터 형태가 특수할 때의 빌트인을 정리했다. 텍스트(BlazingText), 이미지(Image Classification, 전이학습), 시계열(DeepAR, 다수 시계열·확률 예측), 희소 추천(Factorization Machines, RecordIO-protobuf)이 각각의 정답 신호다. 내일은 비지도·이상탐지 계열(RCF, PCA, IP Insights, LDA/NTM)을 다룬다.

---

## 📝 연습 문제

**문제 1.** 1,000개 매장의 일별 판매 데이터가 있고, 최근 오픈해 데이터가 짧은 신규 매장의 향후 4주 수요를 P10/P50/P90 구간으로 예측하려 한다. 가장 적합한 빌트인은?

A) DeepAR  
B) XGBoost  
C) BlazingText  
D) K-Means  

**정답: A**  
해설: DeepAR는 다수의 관련 시계열을 함께 학습해 신규·짧은 시계열도 다른 매장 패턴으로 예측하며, 분위수(P10/P50/P90) 확률 예측을 제공한다. XGBoost(B)는 시계열 구조를 자연히 다루지 못하고, BlazingText(C)는 텍스트, K-Means(D)는 군집용이다.

---

**문제 2.** 고객 리뷰 문서를 "긍정/부정/중립"으로 분류하는 모델을 대규모 코퍼스로 매우 빠르게 학습하려 한다. 가장 적합한 빌트인과 모드는?

A) Image Classification  
B) Factorization Machines  
C) BlazingText, supervised(text classification) 모드  
D) PCA  

**정답: C**  
해설: 레이블이 있는 문서를 카테고리로 분류하는 과제는 BlazingText의 supervised 모드(fastText 기반)가 적합하며 GPU로 매우 빠르다. 이미지(A), 희소 추천(B), 차원축소(D)는 텍스트 분류 과제와 맞지 않는다.

---

**문제 3.** 약 2,000장의 작은 이미지 데이터셋으로 제품 결함 유무를 분류하려 한다. 데이터가 적어 성능이 걱정된다. 가장 권장되는 접근은?

A) 처음부터(use_pretrained_model=0) 깊은 CNN 학습  
B) 전이 학습(use_pretrained_model=1)과 데이터 증강 사용  
C) Linear Learner로 픽셀을 그대로 입력  
D) DeepAR로 이미지 시퀀스 예측  

**정답: B**  
해설: 데이터가 적을 때는 ImageNet 사전학습 가중치에서 시작하는 전이 학습과 증강이 정석이다. 처음부터 학습(A)은 적은 데이터에서 과적합되기 쉽고, 픽셀을 선형 모델에 직접(C)·DeepAR(D)는 이미지 분류에 부적합하다.

---

**문제 4.** 사용자 ID·아이템 ID·맥락 피처를 One-Hot으로 인코딩해 매우 희소하고 고차원인 클릭률 예측 데이터를 만들었다. 상호작용을 효율적으로 학습할 빌트인과 권장 입력 포맷은?

A) Factorization Machines, RecordIO-protobuf  
B) XGBoost, CSV  
C) K-Means, RecordIO-protobuf  
D) BlazingText, 텍스트 파일  

**정답: A**  
해설: Factorization Machines는 초고차원·희소 데이터의 2차 상호작용을 효율적으로 모델링하며, 희소 데이터에 최적화된 RecordIO-protobuf(float32) 입력을 권장한다. XGBoost+CSV(B)는 초고차원 희소 데이터에 비효율적이고, K-Means(C)·BlazingText(D)는 추천 과제용이 아니다.

---

**문제 5.** BlazingText의 Word2Vec 모드를 사용하는 가장 적절한 상황은?

A) 문서를 사전 정의된 카테고리로 분류할 때  
B) 시계열 미래 값을 예측할 때  
C) 이미지에서 객체를 탐지할 때  
D) 단어들을 벡터로 임베딩해 의미적으로 유사한 단어를 찾을 때  

**정답: D**  
해설: Word2Vec 모드는 레이블 없이 단어를 벡터 공간에 임베딩해 유사 단어 탐색이나 다운스트림 피처 생성에 쓴다. 문서 분류(A)는 supervised 모드, 시계열(B)·이미지(C)는 BlazingText의 영역이 아니다.

---
