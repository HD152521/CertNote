# Day 2 - 빌트인 알고리즘: XGBoost, Linear Learner, 이미지·텍스트, 입력 포맷

## 📌 핵심 정리

- **빌트인 알고리즘**은 AWS가 미리 만들어둔 컨테이너다. 학습 코드를 안 짜도 데이터만 올바른 포맷으로 주면 학습이 된다.
- 시험의 핵심은 **문제 유형 → 알고리즘 매핑** — 테이블 분류/회귀=XGBoost, 대규모 선형/희소=Linear Learner, 이상 탐지=RCF, 시계열=DeepAR, 추천 희소=Factorization Machines, 고속 텍스트=BlazingText.
- 이미지 계열은 **분류(라벨 하나) / 탐지(위치+클래스) / 분할(픽셀 단위)** 세 갈래로 구분한다.
- **입력 포맷**: 대용량 스트리밍은 **RecordIO-protobuf**, 소량·단순은 CSV.
- **XGBoost의 CSV 규칙** — 첫 열이 타깃(label), 헤더 행 없음. 매년 나오는 단골이다.

## 빌트인 알고리즘을 왜 쓰는가

직접 PyTorch를 짜는 것과, AWS가 최적화해둔 알고리즘을 가져다 쓰는 것 사이의 선택이다. 빌트인 쪽 이점은 세 가지다.

- **코드 불필요**: 학습 스크립트를 안 짜도 된다.
- **최적화**: AWS가 분산 학습·GPU 활용을 미리 튜닝해뒀다.
- **확장성**: 대용량 데이터에 맞게 설계됐다(특히 RecordIO 포맷 + Pipe 모드).

같은 학습이라도 "무엇을 가져다 쓰느냐"에 따라 손이 가는 정도가 다르다.

| 접근 | 내가 짜는 코드 | 유연성 | 고르는 상황 |
|------|----------------|--------|-------------|
| **빌트인 알고리즘** | 없음(하이퍼파라미터만) | 낮음 | 표준적인 문제, 빠르게 베이스라인이 필요할 때 |
| **프레임워크 Estimator** | 학습 스크립트(`entry_point`) | 중간 | 내 모델 구조·손실 함수를 직접 정의해야 할 때 |
| **JumpStart 사전학습 모델** | 거의 없음(미세조정 데이터만) | 중간 | 검증된 모델을 적은 데이터로 특화할 때 |
| **커스텀 컨테이너** | 코드 + Dockerfile | 높음 | 특수 라이브러리·사내 런타임이 필요할 때 |

```python
from sagemaker import image_uris

# 빌트인 알고리즘 컨테이너 URI 조회
container = image_uris.retrieve('xgboost', region, version='1.7-1')

estimator = Estimator(
    image_uri=container,   # 빌트인 컨테이너만 지정하면 끝
    role=role,
    instance_count=1,
    instance_type='ml.m5.xlarge',
)
```

> 💡 **관련 이론**: 빌트인 알고리즘은 "바퀴를 다시 발명하지 말라"는 원칙의 구현이다. XGBoost나 로지스틱 회귀는 이미 수십 년간 검증된 알고리즘이고, AWS가 분산·스트리밍·GPU까지 최적화해둔 컨테이너를 쓰면 직접 짤 때 생기는 버그와 비효율을 피한다. 진짜 새로운 아키텍처가 필요할 때만 커스텀 코드로 내려가는 게 합리적이다.

## 대표 알고리즘과 문제 유형 매핑

시험은 "이 문제에 가장 적합한 빌트인 알고리즘은?"을 자주 묻는다. 문제 유형 → 알고리즘 매핑을 외워두자.

| 문제 유형 | 빌트인 알고리즘 | 비고 |
|-----------|-----------------|------|
| 분류·회귀(테이블 데이터) | **XGBoost** | 가장 많이 쓰는 만능 트리 알고리즘 |
| 분류·회귀(선형) | **Linear Learner** | 로지스틱 회귀/선형 회귀, 대규모에 강함 |
| 이미지 분류 | **Image Classification** | CNN 기반 |
| 객체 탐지 | **Object Detection** | 이미지 내 위치+클래스 |
| 이미지 분할 | **Semantic Segmentation** | 픽셀 단위 분류 |
| 텍스트 분류·임베딩 | **BlazingText** | Word2Vec, 고속 |
| 군집화 | **K-Means** | 비지도 |
| 이상 탐지 | **Random Cut Forest (RCF)** | 비지도 이상치 |
| 차원 축소 | **PCA** | 특성 압축 |
| 추천 | **Factorization Machines** | 희소 데이터 추천 |
| 시계열 예측 | **DeepAR** | 다중 시계열 딥러닝 |
| 토픽 모델링 | **LDA / NTM** | 문서 주제 추출 |

전부 암기하기보다, **자주 나오는 핵심**을 확실히 잡는다. 테이블 분류/회귀는 XGBoost, 대규모 선형은 Linear Learner, 이상 탐지는 RCF, 시계열은 DeepAR, 추천 희소데이터는 Factorization Machines, 고속 텍스트는 BlazingText. 이 여섯 개만 확실히 알아도 상당수 선택지가 정리된다.

지문에 나오는 단서를 따라가면 대체로 한 갈래로 좁혀진다.

```text
데이터가 무엇인가?
├─ 표(테이블)
│   ├─ 정답 라벨 있음
│   │   ├─ 밀집 특성, 비선형 관계        → XGBoost
│   │   ├─ 특성 수만 개·희소, 빠른 선형   → Linear Learner
│   │   └─ 사용자×아이템처럼 매우 희소   → Factorization Machines
│   └─ 정답 라벨 없음
│       ├─ 비슷한 것끼리 묶기            → K-Means
│       ├─ 드문 이상치 찾기              → Random Cut Forest
│       └─ 특성 수 줄이기                → PCA
├─ 시계열 (여러 계열을 함께)              → DeepAR
├─ 텍스트
│   ├─ 임베딩·고속 분류                  → BlazingText
│   └─ 문서의 숨은 주제 추출             → LDA / NTM
└─ 이미지
    ├─ 사진 한 장에 라벨 하나            → Image Classification
    ├─ 객체 위치 + 클래스                → Object Detection
    └─ 픽셀마다 클래스                   → Semantic Segmentation
```

## XGBoost와 Linear Learner

**XGBoost**는 그래디언트 부스팅 트리 알고리즘으로, 정형 데이터(테이블) 분류·회귀에서 사실상 기본 선택이다. 결측치 처리, 비선형 관계 포착, 특성 중요도 제공 등 실무에서 강력하다.

```python
estimator.set_hyperparameters(
    objective='binary:logistic',  # 이진 분류
    num_round=100,                # 부스팅 라운드 수
    max_depth=5,                  # 트리 깊이
    eta=0.2,                      # 학습률
    subsample=0.8,                # 행 샘플링 비율
)
```

**Linear Learner**는 선형/로지스틱 회귀를 대규모 데이터에 맞게 구현한 것이다. XGBoost보다 단순하지만, 데이터가 선형적으로 잘 분리되거나 특성 수가 매우 많을 때, 그리고 빠른 학습이 필요할 때 적합하다. 여러 모델을 병렬로 학습해 가장 좋은 것을 자동 선택하는 특성도 있다.

정형 데이터 3종의 경계는 **데이터의 생김새**로 갈린다.

| 알고리즘 | 모델 성격 | 잘 맞는 데이터 | 대표 상황 |
|----------|-----------|----------------|-----------|
| **XGBoost** | 그래디언트 부스팅 트리(비선형) | 특성 수십~수백 개의 밀집 테이블 | 이탈 예측, 신용 평가, 수요 예측 |
| **Linear Learner** | 선형·로지스틱 회귀 | 특성이 수만 개로 많고 희소, 선형 분리 가능 | 대규모 텍스트 특성 분류, 빠른 베이스라인 |
| **Factorization Machines** | 잠재 요인 기반 상호작용 모델 | 사용자×아이템처럼 극도로 희소한 행렬 | 추천, 클릭률 예측 |

> ⚠️ **함정**: "정형 테이블 데이터 분류"에서 무난한 답은 XGBoost다. 다만 "특성이 수만 개로 매우 많고 희소하며 빠른 선형 모델이 필요"하다면 Linear Learner가 더 맞는다. 또 "사용자-아이템처럼 매우 희소한 추천"이면 Factorization Machines다. 셋의 경계를 시나리오의 데이터 형태(밀집 테이블 vs 고차원 희소 vs 추천 희소)로 구분하는 게 요령이다.

## 이미지와 텍스트 알고리즘

**이미지** 계열은 "출력의 세밀함"이 커지는 순서로 세 가지를 구분한다.

| 알고리즘 | 출력 단위 | 결과물 | 예시 요구사항 |
|----------|-----------|--------|---------------|
| **Image Classification** | 이미지 1장 | 라벨 하나 | "이 사진이 불량품인가" |
| **Object Detection** | 객체 | 바운딩 박스 + 클래스 | "사진 속 사람과 차량이 각각 어디 있나" |
| **Semantic Segmentation** | 픽셀 | 픽셀별 클래스 맵 | "도로와 하늘 영역을 픽셀 단위로 나눠라" |

지문에 **"위치(where)"**가 나오면 Image Classification은 탈락이고, **"픽셀 단위·영역 경계"**까지 요구하면 Semantic Segmentation이다.

**텍스트**는 **BlazingText**가 대표다. Word2Vec 임베딩 학습과 텍스트 분류를 매우 빠르게(고도 최적화된 구현) 처리한다. "단어 임베딩을 빠르게 학습"이나 "대규모 텍스트 분류"면 BlazingText를 떠올린다.

```python
# BlazingText: 텍스트 분류 모드
estimator.set_hyperparameters(
    mode='supervised',   # supervised=분류, skipgram/cbow=임베딩
    epochs=10,
    word_ngrams=2,
)
```

> 💡 **관련 이론**: Word2Vec(BlazingText의 임베딩 모드)은 "함께 등장하는 단어는 의미가 비슷하다"는 분포 가설에 기반한다. 각 단어를 벡터로 학습해 "왕 - 남자 + 여자 ≈ 여왕" 같은 의미 연산이 가능해진다. 이 임베딩은 이후 분류·검색·추천의 입력 특성으로 재사용된다. 이미지의 CNN이 픽셀에서 시각 특징을 추출하듯, 임베딩은 단어에서 의미 특징을 추출하는 표현 학습이다.

## 입력 포맷: RecordIO-protobuf vs CSV

빌트인 알고리즘에서 **입력 포맷**은 시험 단골이다. 두 가지를 구분한다.

| 포맷 | 특징 | 적합한 경우 |
|------|------|-------------|
| **CSV** | 사람이 읽기 쉬움, 간단 | 작은 데이터, 빠른 시작 |
| **RecordIO-protobuf** | 이진 직렬화, 고효율 | 대용량, Pipe 모드 스트리밍 |

RecordIO-protobuf는 데이터를 이진으로 빽빽이 직렬화해, 대용량을 Pipe 모드로 스트리밍할 때 가장 효율적이다. 많은 빌트인 알고리즘(특히 Linear Learner, Factorization Machines, K-Means 등)이 이 포맷을 권장 또는 요구한다. CSV도 지원하지만 대용량에서는 RecordIO가 빠르다.

```python
import sagemaker.amazon.common as smac
import io

# 데이터를 RecordIO-protobuf로 직렬화해 S3 업로드
buf = io.BytesIO()
smac.write_numpy_to_dense_tensor(buf, features, labels)
buf.seek(0)
```

XGBoost는 예외적으로 CSV와 libsvm을 주로 쓴다(트리 알고리즘 특성). 또 CSV로 줄 때 **첫 열이 타깃(label)**이고 헤더가 없어야 한다는 규칙이 자주 출제된다.

포맷과 입력 모드는 채널을 만들 때 함께 지정한다.

```python
from sagemaker.inputs import TrainingInput

# XGBoost + CSV (첫 열이 라벨, 헤더 없음)
csv_input = TrainingInput(
    's3://my-bucket/train/train.csv',
    content_type='text/csv',
)

# 대용량은 RecordIO-protobuf + Pipe 모드
pipe_input = TrainingInput(
    's3://my-bucket/train/',
    content_type='application/x-recordio-protobuf',
    input_mode='Pipe',
)

estimator.fit({'train': csv_input})
```

알고리즘별로 기대하는 입력이 다르므로, 대표 알고리즘의 포맷은 묶어서 기억해 둔다.

| 알고리즘 | 주로 쓰는 입력 포맷 |
|----------|---------------------|
| **XGBoost** | CSV, libsvm — CSV는 **첫 열이 라벨, 헤더 없음** |
| **Linear Learner** | RecordIO-protobuf 권장, CSV도 지원 |
| **Factorization Machines** | RecordIO-protobuf |
| **K-Means / PCA** | RecordIO-protobuf 권장, CSV도 지원 |
| **BlazingText** | 한 줄에 한 문장인 텍스트 파일(지도 분류 모드는 `__label__` 접두어) |
| **DeepAR** | JSON Lines |
| **Image Classification** | RecordIO 또는 이미지 파일 + 목록 파일 |

> 💡 **개념**: 포맷 논쟁의 본질은 "파싱 비용"이다. CSV는 숫자를 사람이 읽는 문자열로 적어두므로, 학습 인스턴스가 매번 문자열을 숫자로 되돌리는 일을 반복한다. RecordIO-protobuf는 처음부터 기계가 읽는 이진 표현이라 이 변환이 없고 크기도 작다. 데이터가 작으면 이 차이가 안 보이지만, 수백 GB를 스트리밍하면 파싱이 GPU를 놀게 만드는 병목이 된다.

## 알고리즘·포맷을 잘못 골랐을 때: 증상 → 원인 → 조치

시험은 "이렇게 했는데 결과가 이상하다"는 상황으로 알고리즘·포맷 지식을 확인한다.

| 증상 | 흔한 원인 | 조치 |
|------|-----------|------|
| XGBoost 학습은 도는데 예측이 무의미하다 | CSV에 헤더 행이 남았거나 라벨이 마지막 열에 있음 | 헤더 제거, 라벨을 **첫 열**로 이동 |
| 대용량 학습에서 데이터 로딩이 병목 | CSV 파싱 비용 + File 모드 전체 다운로드 | RecordIO-protobuf로 변환 후 Pipe 모드 사용 |
| 특성이 수만 개인데 학습이 느리고 메모리를 넘긴다 | 고차원 희소 데이터가 트리 분기에 불리 | Linear Learner로 교체 |
| 추천 모델 성능이 좀처럼 오르지 않는다 | 사용자×아이템 희소 행렬을 일반 분류기로 처리 | Factorization Machines로 교체 |
| BlazingText 분류가 학습되지 않는다 | 지도 분류 모드인데 라벨 표기 형식이 맞지 않음 | `mode='supervised'`와 `__label__` 접두어 형식 확인 |
| 사진 속 여러 객체를 못 잡는다 | Image Classification은 이미지당 라벨을 하나만 낸다 | Object Detection으로 교체 |

> ⚠️ **함정**: "대용량 데이터를 Pipe 모드로 스트리밍하며 효율적으로 학습"하려면 **RecordIO-protobuf** 포맷이다. CSV는 텍스트라 크고 파싱 비용이 있어 대용량 스트리밍에 비효율적이다. 한편 "XGBoost로 CSV 학습 시 라벨 위치"를 묻는다면 **첫 번째 열**이고 헤더가 없어야 한다. 포맷 효율(RecordIO)과 XGBoost의 CSV 라벨 규칙(첫 열, 헤더 없음)을 따로 기억하자.

다음 글에서는 이렇게 고른 알고리즘의 하이퍼파라미터를 자동으로 최적화하는 SageMaker AMT를 본다.

## 📖 용어

- **빌트인 알고리즘** : AWS가 미리 만들어 둔 학습 컨테이너. 코드를 짜지 않고 데이터와 하이퍼파라미터만 주면 학습된다.
- **XGBoost** : 작은 결정 트리를 여러 개 이어 붙여 오차를 줄여 나가는 알고리즘. 표 형태 데이터의 사실상 기본 선택.
- **그래디언트 부스팅** : 앞선 모델이 틀린 부분을 다음 모델이 집중해 바로잡는 방식으로 여러 모델을 쌓는 기법.
- **Linear Learner** : 선형·로지스틱 회귀를 대규모 데이터용으로 구현한 빌트인 알고리즘. 특성이 아주 많을 때 강하다.
- **Factorization Machines / 희소 데이터** : 희소 데이터란 값 대부분이 0이나 빈칸인 데이터(사용자×아이템 구매 행렬이 대표적). FM은 이런 극도로 희소한 데이터에서 항목 간 상호작용을 잠재 요인으로 학습하는 추천용 알고리즘이다.
- **Random Cut Forest (RCF)** : 정답 라벨 없이 "유난히 튀는" 데이터를 찾아내는 이상 탐지 알고리즘.
- **DeepAR** : 여러 시계열을 한꺼번에 학습해 서로의 패턴을 빌려 쓰는 딥러닝 기반 수요·수치 예측 알고리즘.
- **BlazingText / 임베딩** : 임베딩은 단어나 항목을 숫자 벡터로 바꾼 것으로, 의미가 비슷하면 벡터도 가까워진다. BlazingText는 이 단어 임베딩(Word2Vec) 학습과 텍스트 분류를 매우 빠르게 처리하도록 최적화한 알고리즘이다.
- **바운딩 박스** : 이미지 안에서 객체를 감싸는 사각 영역. 객체 탐지의 출력 형태다.
- **RecordIO-protobuf / libsvm** : RecordIO-protobuf는 학습 데이터를 이진으로 빽빽이 저장하는 포맷으로 크기가 작고 파싱이 빨라 대용량 스트리밍에 유리하다. libsvm은 `라벨 인덱스:값` 형태로 0이 아닌 값만 적는 희소 데이터용 텍스트 포맷으로 XGBoost가 지원한다.

---

## 📝 연습 문제

**문제 1.** 100개의 특성을 가진 정형 테이블 데이터로 고객 이탈 여부(이진 분류)를 예측하려 한다. 별도 코드 작성 없이 빠르게 강력한 모델을 만들려면 가장 적합한 빌트인 알고리즘은?

A) Semantic Segmentation  
B) XGBoost  
C) BlazingText  
D) DeepAR  

**정답: B**  
해설: XGBoost는 정형 테이블 데이터의 분류·회귀에서 사실상 기본 선택으로, 비선형 관계와 결측치를 잘 다루며 코드 작성 없이 빌트인으로 쓸 수 있다. A는 이미지 픽셀 분할, C는 텍스트, D는 시계열 예측용이라 정형 분류 문제에 부적합하다.

---

**문제 2.** 수백 GB의 학습 데이터를 Pipe 모드로 스트리밍하면서 가장 효율적으로 빌트인 알고리즘에 입력하려 한다. 권장 데이터 포맷은?

A) CSV  
B) JSON  
C) RecordIO-protobuf  
D) XML  

**정답: C**  
해설: RecordIO-protobuf는 데이터를 이진으로 압축 직렬화해 대용량 데이터를 Pipe 모드로 스트리밍할 때 가장 효율적이며 다수 빌트인 알고리즘이 권장한다. A는 텍스트라 크고 파싱 비용이 있으며, B·D는 빌트인 학습 입력 포맷으로 부적합하다.

---

**문제 3.** 이미지 안에 등장하는 여러 객체의 위치(bounding box)와 각 객체의 클래스를 동시에 알아내야 한다. 적합한 빌트인 알고리즘은?

A) Image Classification  
B) Object Detection  
C) K-Means  
D) PCA  

**정답: B**  
해설: Object Detection은 이미지 내 여러 객체의 위치와 클래스를 함께 예측하므로 이 요구에 정확히 부합한다. A는 이미지 전체에 라벨 하나만 부여하고, C는 군집화, D는 차원 축소로 객체 위치 탐지와 무관하다.

---

**문제 4.** XGBoost 빌트인 알고리즘에 CSV 형식으로 학습 데이터를 제공할 때 올바른 형식 규칙은?

A) 첫 번째 열이 타깃(label)이고 헤더 행이 없어야 한다  
B) 마지막 열이 타깃이고 헤더가 반드시 있어야 한다  
C) 타깃 열을 별도 파일로 분리해야 한다  
D) 모든 값을 이진으로 변환해야 한다  

**정답: A**  
해설: XGBoost는 CSV 입력 시 첫 번째 열을 타깃으로 간주하며 헤더 행이 없어야 한다. B는 위치와 헤더 규칙이 모두 반대이고, C는 빌트인 XGBoost의 입력 방식이 아니며, D는 CSV가 아닌 다른 포맷에 대한 설명이다.

---

**문제 5.** 대규모 텍스트 코퍼스로부터 단어 임베딩(Word2Vec)을 매우 빠르게 학습하려 한다. 가장 적합한 빌트인 알고리즘은?

A) Linear Learner  
B) Random Cut Forest  
C) BlazingText  
D) Factorization Machines  

**정답: C**  
해설: BlazingText는 Word2Vec 임베딩 학습과 텍스트 분류를 고도로 최적화해 매우 빠르게 처리하는 빌트인 알고리즘이다. A는 선형 모델, B는 이상 탐지, D는 희소 추천용으로 단어 임베딩 학습 목적과 맞지 않는다.

---
