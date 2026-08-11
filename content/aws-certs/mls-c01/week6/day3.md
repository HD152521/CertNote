# Day 3 - SageMaker Builtin 2: Text, Image, Time Series, Recommendation

## 📌 핵심 정리

- 지문에 **텍스트·이미지·시계열·희소**라는 단어가 보이면 XGBoost가 아니라 **전문 빌트인**으로 답이 밀린다.
- **BlazingText는 두 모드**다. 레이블이 있고 문서를 분류하면 supervised, 레이블 없이 단어 벡터를 얻으면 Word2Vec.
- **이미지 + 데이터 부족**의 정석은 `use_pretrained_model=1` **전이 학습 + 데이터 증강**이다. 객체 위치까지 필요하면 Object Detection.
- **DeepAR**는 관련 시계열 수천 개를 한 모델로 함께 학습해 신규·짧은 시계열까지 예측하고, 점 추정이 아니라 **P10/P50/P90 확률 구간**을 낸다.
- **Factorization Machines**는 원핫으로 폭발한 초고차원 희소 데이터의 2차 상호작용 전용이며, 입력은 **RecordIO-protobuf(float32)**를 권장한다.

## 데이터 형태가 알고리즘을 정한다

어제는 정형 데이터 알고리즘을 다뤘다. 오늘은 데이터 형태가 특수할 때 — **텍스트, 이미지, 시계열, 희소 상호작용** — 쓰는 전문 빌트인을 정리한다.

| 데이터 형태 | 목표 | 빌트인 | 입력 포맷 | 이유 |
|------|------|------|------|------|
| 텍스트 | 문서 분류 | BlazingText (supervised) | 텍스트 파일, `__label__<label> 문장` | fastText 기반, 대규모 코퍼스에서 매우 빠름 |
| 텍스트 | 단어 임베딩 | BlazingText (Word2Vec) | 텍스트 파일(공백 토큰화) | 레이블 없이 의미 공간 학습 |
| 이미지 | 라벨 분류 | Image Classification | RecordIO 또는 이미지(.jpg/.png) + .lst | ResNet 기반 CNN, 전이 학습 지원 |
| 이미지 | 객체 위치 | Object Detection | — | 분류가 아니라 위치까지 필요 |
| 이미지 | 픽셀 단위 | Semantic Segmentation | — | 픽셀마다 클래스 부여 |
| 시계열 | 미래 값 예측 | DeepAR | JSON Lines | 다수 관련 시계열 공유 학습, 확률 예측 |
| 희소 상호작용 | 추천·클릭 예측 | Factorization Machines | RecordIO-protobuf (float32) | 희소 데이터에 최적화 |

```
                  [데이터가 표 형식이 아니다]
                            │
        ┌───────────┬───────┴────────┬─────────────┐
      텍스트       이미지          시계열       사용자-아이템
        │            │               │            (매우 희소)
   레이블 있나?   무엇을 원하나?   관련 시계열      │
   ├─ 예 →       ├─ 라벨만 →      다수인가?    Factorization
   │  supervised │  Image          ├─ 예 →      Machines
   │  (문서 분류) │  Classification │  DeepAR   (RecordIO-protobuf)
   └─ 아니오 →   ├─ 위치까지 →     └─ 아니오 →
      Word2Vec   │  Object            단일 통계 기법
      (임베딩)   │  Detection         또는 Forecast
                 └─ 픽셀 단위 →
                    Semantic Segmentation
```

## BlazingText — 텍스트 분류와 단어 임베딩

Word2Vec과 텍스트 분류를 GPU로 가속하는 빌트인. 두 가지 모드가 있다.

- **Word2Vec(비지도)**: 단어를 벡터로 임베딩한다. 유사 단어 탐색, 다운스트림 피처 생성에 쓴다
- **Text Classification(지도)**: 문서 → 레이블(감성, 주제 등). fastText 기반

```text
모드 결정:
  레이블이 있고 문서를 분류한다 → supervised (text classification)
  레이블이 없고 단어 벡터만 필요 → Word2Vec (cbow / skipgram / batch_skipgram)
```

- **입력**: 텍스트 파일(공백 토큰화). supervised 모드는 `__label__<label> sentence` 형식
- **강점**: 대규모 코퍼스에서 속도가 압도적, 다국어 지원, subword로 OOV(사전에 없는 단어) 처리

| Word2Vec 모드 | 학습 방향 | 특징 |
|---|---|---|
| cbow | 주변 문맥 → 중심 단어 예측 | 빠르고 빈출 단어에 강함 |
| skipgram | 중심 단어 → 주변 문맥 예측 | 희귀 단어 표현이 좋음 |
| batch_skipgram | skipgram의 배치·분산 학습 버전 | 대규모 코퍼스에서 확장성 |

> 💡 **관련 이론**: BlazingText의 Word2Vec은 "문맥으로 중심 단어를 맞히기(CBOW)" 또는 "중심 단어로 문맥을 맞히기(skip-gram)"를 통해 의미가 비슷한 단어를 벡터 공간에서 가깝게 배치한다. 학습된 임베딩 자체를 단어 유사도 검색에 쓰거나, 다른 모델의 입력 피처로 넘긴다. 시험에서 "단어의 의미적 유사도" / "임베딩"은 Word2Vec 모드 신호, "문서를 카테고리로 분류"는 supervised 모드 신호다.

> ⚠️ **함정**: supervised 모드에서 학습 파일의 레이블 접두사는 반드시 `__label__` 형태여야 한다. 일반 CSV처럼 컬럼으로 레이블을 넣는 보기는 오답이다.

## Image Classification — 이미지 분류

CNN(ResNet) 기반으로 이미지를 하나 또는 여러 레이블로 분류하는 빌트인이다.

- **용도**: 단일/다중 레이블 이미지 분류
- **입력**: RecordIO 또는 이미지(.jpg/.png) + .lst 목록 파일
- **핵심 기법**: **전이 학습(Transfer Learning)** — `use_pretrained_model=1`로 ImageNet 사전학습 가중치에서 시작하면 데이터가 적어도 좋은 성능이 난다

```text
핵심 하이퍼파라미터:
  num_classes, num_training_samples
  use_pretrained_model   0(처음부터) | 1(전이 학습)
  image_shape, learning_rate, mini_batch_size
  augmentation_type      이미지 증강 (crop/color 등)
```

- 데이터가 적으면 전이 학습 + 데이터 증강이 정석이다.
- 객체의 **위치**까지 필요하면 분류가 아니라 **Object Detection** 빌트인, 픽셀 단위면 **Semantic Segmentation**이다.

| 상황 | 선택 | 이유 |
|---|---|---|
| 라벨 이미지 수천 장 미만 | `use_pretrained_model=1` + `augmentation_type` | 처음부터 학습하면 과적합 |
| 라벨 이미지가 매우 많고 도메인이 특수 | `use_pretrained_model=0` 검토 | 사전학습 도메인과 차이가 클 때 |
| "이 사진에 결함이 있는가" | Image Classification | 라벨만 필요 |
| "결함이 어디에 있는가" | Object Detection | 바운딩 박스 필요 |
| "결함 영역을 픽셀로 칠해라" | Semantic Segmentation | 픽셀 단위 클래스 |

> ⚠️ **함정**: "이미지 + 데이터가 부족"에 "더 깊은 네트워크를 처음부터 학습"을 고르면 오답이다. 데이터가 적을수록 모델을 키우는 게 아니라 **사전학습 가중치를 빌려오고 증강으로 데이터를 늘린다.**

## DeepAR — 시계열 예측

RNN 기반 시계열 예측 빌트인. 핵심 강점은 시계열 하나를 따로 모델링하는 게 아니라 **관련된 여러 시계열을 함께 학습해 패턴을 공유**하는 것이다.

- **용도**: 수요·매출·트래픽의 미래 값 예측, 확률적(분위수) 예측
- **입력**: JSON Lines — 각 시계열이 `start`, `target`, 선택적으로 `cat`(카테고리), `dynamic_feat`(공변량)를 가진다
- **강점**: 수천 개 매장처럼 관련 시계열이 많을 때 개별 모델링보다 정확하다. 신규·짧은 시계열(콜드 스타트)도 유사 시계열에서 배운 패턴으로 예측할 수 있다

```text
핵심 하이퍼파라미터:
  context_length      과거 입력 윈도의 길이
  prediction_length   예측 윈도의 길이
  epochs, num_cells, num_layers
  likelihood          출력 분포 (Gaussian 등)
```

> 💡 **관련 이론**: 전통적인 ARIMA·지수평활은 시계열 하나하나를 따로 모델링하지만, DeepAR는 여러 관련 시계열을 한 모델로 학습해 **계절성·추세를 교차 학습**한다. 그래서 이력이 짧은 신규 아이템도 유사 아이템의 패턴을 빌려 쓸 수 있다. 출력이 점 추정이 아니라 분포(분위수)이므로 P10/P50/P90 형태의 불확실성 구간을 준다. 시험에서 "수천 개의 관련 시계열" / "신제품 수요" / "확률적 예측 구간"은 DeepAR 신호다. 더 관리형이 필요하면 Amazon Forecast다.

### DeepAR가 단일 시계열 기법보다 유리한 조건

| 조건 | DeepAR | 단일 시계열 통계 기법(ARIMA 등) |
|---|---|---|
| 관련 시계열이 수천 개 | 유리(패턴 공유) | 시계열마다 모델을 따로 만들어야 함 |
| 신규·짧은 이력(콜드 스타트) | 유리(유사 시계열에서 차용) | 데이터가 없어 추정 불가 |
| 시계열이 단 하나뿐 | 이점이 작음 | 충분히 경쟁력 있음 |
| 불확실성 구간이 필요 | 분위수 예측 제공 | 별도 구간 추정 필요 |
| 공변량(프로모션·가격) 반영 | `dynamic_feat`로 투입 | 확장이 번거로움 |

> ⚠️ **함정**: "시계열 예측"이라고 무조건 DeepAR가 정답은 아니다. 시계열이 하나뿐이고 데이터도 짧다면 딥러닝은 과한 선택이다. **"관련 시계열 다수" 또는 "확률 구간 필요"라는 단서**가 있어야 DeepAR로 확정된다.

## Factorization Machines — 희소 고차원 추천

사용자-아이템처럼 **매우 희소하고 고차원인** 데이터에서 피처 간 2차 상호작용을 효율적으로 모델링한다.

- **용도**: 추천(클릭 예측, 평점 예측), 희소 분류/회귀
- **입력**: RecordIO-protobuf(float32). **희소 데이터에 최적화**되어 있어 CSV는 권장하지 않는다
- **강점**: 원핫 인코딩으로 폭발한 초고차원 희소 입력에서도 상호작용을 효율적으로 학습한다

```text
핵심 하이퍼파라미터:
  num_factors        잠재 요인(latent factor) 차원
  predictor_type     binary_classifier | regressor
  bias/linear/factors   항별 정규화·초기화 설정
```

추천 맥락에서 FM은 협업 필터링의 일반화다. 사용자 ID와 아이템 ID를 원핫으로 넣으면 행렬 분해처럼 동작하고, 여기에 추가 피처(시간, 맥락)를 함께 넣을 수도 있다.

| 비교 | Factorization Machines | 고전 협업 필터링(행렬 분해) |
|---|---|---|
| 입력 | 임의의 피처 벡터(원핫 + 부가 피처) | 사용자-아이템 행렬만 |
| 부가 정보 | 시간·맥락·인구통계 추가 가능 | 추가가 어렵다 |
| 콜드 스타트 | 부가 피처로 일부 완화 | 신규 사용자·아이템에 취약 |
| 희소성 처리 | 잠재 요인으로 상호작용 일반화 | 관측된 셀 위주 |

> ⚠️ **함정**: FM에 CSV를 쓰겠다는 보기는 오답 신호다. 희소 고차원 데이터를 CSV로 표현하면 0이 대부분인 거대한 밀집 표가 되어 비효율적이다. **RecordIO-protobuf(float32)**가 정답이다.

## 전처리와 평가 지표

전문 빌트인은 정형 알고리즘과 전처리 요구가 다르다. "스케일링" 개념 자체가 성립하지 않는 경우도 있다.

| 빌트인 | 전처리 요구 | 스케일링 |
|---|---|---|
| BlazingText | 공백 토큰화, supervised는 `__label__` 접두사 | 해당 없음(토큰 입력) |
| Image Classification | 리사이즈(`image_shape`), 증강, RecordIO 또는 .lst 구성 | 픽셀 정규화는 컨테이너가 처리 |
| DeepAR | 시계열별 `start`/`target` 정리, 결측 구간 처리, 공변량 정렬 | 해당 없음(시계열 스케일은 내부 정규화) |
| Factorization Machines | 원핫 인코딩 후 희소 표현으로 변환 | 수치 피처는 스케일 정리 권장 |

| 과제 | 주 지표 | 무엇을 말하는가 | 함정 |
|---|---|---|---|
| 텍스트 분류(불균형 클래스) | F1, macro F1 | 소수 카테고리도 잡는지 | accuracy는 다수 카테고리에 끌려간다 |
| 이미지 분류(다중 레이블) | 레이블별 precision/recall | 태그별 성능 편차 | 전체 accuracy가 편차를 감춘다 |
| 시계열 예측(점 추정) | RMSE, MAE | 평균적 오차 크기 | 구간 예측의 품질은 말해주지 않는다 |
| 시계열 예측(확률 구간) | 분위수 손실 계열 | P10/P50/P90 구간이 실제를 감싸는지 | RMSE만 보면 구간이 너무 넓어도 모른다 |
| 추천(클릭 예측) | AUC, PR-AUC | 클릭 확률 랭킹 품질 | 클릭률이 1% 미만이면 accuracy 무의미 |
| 추천(평점 예측) | RMSE | 평점 오차 | 상위 랭킹 품질과는 다른 이야기 |

> ⚠️ **함정**: 추천·클릭 예측 데이터는 양성(클릭)이 극히 드문 전형적 불균형이다. 여기서 accuracy를 지표로 고르는 보기는 오답이며, 랭킹 품질을 보는 AUC나 소수 클래스에 정직한 PR-AUC가 정답 방향이다.

## 지문 단서 → 정답 매핑표

| 지문 단서 | 정답 방향 | 함께 나오는 세부 |
|---|---|---|
| "문서를 카테고리로 분류" | BlazingText supervised | `__label__` 형식 |
| "단어의 의미적 유사도 / 임베딩" | BlazingText Word2Vec | cbow / skipgram |
| "이미지 + 데이터가 적다" | Image Classification | 전이 학습 + 증강 |
| "이미지에서 객체 위치" | Object Detection | 분류가 아님 |
| "픽셀 단위로 영역 구분" | Semantic Segmentation | — |
| "수천 개 관련 시계열 / 신제품 수요 / P90 구간" | DeepAR | JSON Lines, `context_length` |
| "프로모션 같은 외부 변수도 반영" | DeepAR `dynamic_feat` | 공변량 채널 |
| "사용자-아이템 / 매우 희소 / 추천" | Factorization Machines | RecordIO-protobuf |
| "완전 관리형으로 빠르게" | Comprehend / Rekognition / Forecast / Personalize | 직접 학습이 아님 |

내일은 레이블 없이 다루는 비지도·이상 탐지 빌트인(RCF, PCA, IP Insights, LDA/NTM)을 다룬다.

## 📖 용어

- **fastText** : 단어를 부분 문자열(subword)까지 쪼개 표현하는 텍스트 분류·임베딩 기법. BlazingText supervised 모드의 기반이다.
- **OOV(out-of-vocabulary)** : 학습 사전에 없던 단어. subword 표현을 쓰면 처음 보는 단어도 벡터를 만들 수 있다.
- **cbow / skipgram** : 문맥으로 중심 단어를 맞히는 방식 / 중심 단어로 문맥을 맞히는 방식. Word2Vec의 두 학습 방향이다.
- **전이 학습(transfer learning)** : 대규모 데이터로 미리 학습된 가중치에서 출발해 적은 데이터로 미세 조정하는 기법.
- **데이터 증강(augmentation)** : 자르기·색 변형 등으로 학습 이미지를 인위적으로 늘려 과적합을 줄이는 기법.
- **.lst 파일** : 이미지 경로와 레이블을 줄 단위로 적어 Image Classification에 넘기는 목록 파일.
- **JSON Lines** : 한 줄에 JSON 객체 하나씩 담는 포맷. DeepAR가 시계열 하나를 한 줄로 받는 방식이다.
- **context_length / prediction_length** : DeepAR가 참고하는 과거 구간의 길이 / 예측할 미래 구간의 길이.
- **분위수 예측(P10/P50/P90)** : 하나의 값이 아니라 "10%·50%·90% 확률선"을 함께 내주는 확률적 예측.
- **잠재 요인(latent factor)** : 사용자·아이템을 설명하는 보이지 않는 저차원 특성 벡터. FM의 `num_factors`가 그 차원을 정한다.

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
