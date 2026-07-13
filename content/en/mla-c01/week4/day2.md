# Day 2 - Built-in Algorithms: XGBoost, Linear Learner, Image·Text, Input Formats

Yesterday we looked at Training Job structure. Today we see the **built-in algorithms** you can run inside them. Built-in algorithms are pre-built containers from AWS—you don't write a single line of training code; just provide data in the right format and training happens. It's a choice between writing PyTorch from scratch or leveraging AWS-optimized algorithms.

In the MLA-C01 exam, built-in algorithms appear as keywords like "which algorithm for which problem", "input format (RecordIO vs CSV)", "characteristics of each algorithm". You don't need to memorize every algorithm; the key is problem-type mapping with representative algorithms and format rules.

## Why Use Built-in Algorithms

Built-in algorithms offer three advantages: ① **No code needed**: You don't write training scripts. ② **Optimization**: AWS pre-tunes distributed training and GPU utilization. ③ **Scalability**: Designed for large data (especially RecordIO format + Pipe mode).

```python
from sagemaker import image_uris

# Retrieve built-in algorithm container URI
container = image_uris.retrieve('xgboost', region, version='1.7-1')

estimator = Estimator(
    image_uri=container,   # Just specify the built-in container
    role=role,
    instance_count=1,
    instance_type='ml.m5.xlarge',
)
```

> 💡 **Related Theory**: Built-in algorithms implement "don't reinvent the wheel". XGBoost and logistic regression are algorithms already validated for decades; using AWS's container optimized for distribution, streaming, and GPU avoids bugs and inefficiencies from custom code. It's rational to drop to custom code only when truly novel architecture is required.

## Representative Algorithms and Problem-Type Mapping

The exam often asks "which built-in algorithm best fits this problem". Memorize the problem-type → algorithm mapping.

| Problem Type | Built-in Algorithm | Notes |
|---|---|---|
| Classification·Regression (tabular data) | **XGBoost** | Go-to versatile tree algorithm |
| Classification·Regression (linear) | **Linear Learner** | Logistic/linear regression, handles large scale |
| Image classification | **Image Classification** | CNN-based |
| Object detection | **Object Detection** | Location (bounding box) + class in image |
| Image segmentation | **Semantic Segmentation** | Per-pixel classification |
| Text classification·embedding | **BlazingText** | Word2Vec, ultra-fast |
| Clustering | **K-Means** | Unsupervised |
| Anomaly detection | **Random Cut Forest (RCF)** | Unsupervised anomalies |
| Dimensionality reduction | **PCA** | Feature compression |
| Recommendation | **Factorization Machines** | Sparse data recommendations |
| Time series forecasting | **DeepAR** | Multi-series deep learning |
| Topic modeling | **LDA / NTM** | Document topic extraction |

Rather than memorize all, lock down the **frequently tested core**: XGBoost for tabular classification/regression, Linear Learner for large-scale linear, RCF for anomaly detection, DeepAR for time series, Factorization Machines for sparse recommendations, BlazingText for fast text. Just these six unlock most problems.

## XGBoost and Linear Learner

**XGBoost** is a gradient boosting tree algorithm and effectively the default choice for classification and regression on structured data (tables). It's powerful for handling missing values, capturing non-linear relationships, and providing feature importance.

```python
estimator.set_hyperparameters(
    objective='binary:logistic',  # Binary classification
    num_round=100,                # Boosting rounds
    max_depth=5,                  # Tree depth
    eta=0.2,                      # Learning rate
    subsample=0.8,                # Row sampling ratio
)
```

**Linear Learner** is linear/logistic regression implemented for large-scale data. Simpler than XGBoost but suited when data is linearly separable, feature count is very high, or fast training is needed. It has a feature of training multiple models in parallel and automatically selecting the best.

> ⚠️ **Pitfall**: For "structured tabular classification", XGBoost is the safe answer. But if "features number in tens of thousands, sparse, and fast linear model needed", Linear Learner fits better. And for "very sparse recommendations like user-item", Factorization Machines. The trick is distinguishing the three by data shape in the scenario: dense table vs high-dimensional sparse vs recommendation sparse.

## Image and Text Algorithms

**Image** algorithms split three ways:

- **Image Classification**: Single label for entire image (this photo is a cat).
- **Object Detection**: Multiple object locations (bounding boxes) and classes in image (person here, car there).
- **Semantic Segmentation**: Class per pixel (this pixel is road, that's sky).

**Text** is represented by **BlazingText**. It trains Word2Vec embeddings and does text classification extremely fast (highly optimized implementation). Think BlazingText for "learn word embeddings fast" or "large-scale text classification".

```python
# BlazingText: supervised text classification mode
estimator.set_hyperparameters(
    mode='supervised',   # supervised=classification, skipgram/cbow=embedding
    epochs=10,
    word_ngrams=2,
)
```

> 💡 **Related Theory**: Word2Vec (BlazingText's embedding mode) is based on the distributional hypothesis: "words appearing together have similar meaning". Each word learns as a vector, enabling semantic operations like "king - male + female ≈ queen". This embedding is later reused as input features for classification, search, recommendation. Like CNN extracts visual features from pixels in images, embedding extracts semantic features from words—representation learning.

## Input Format: RecordIO-protobuf vs CSV

In built-in algorithms, **input format** is a frequent exam topic. Distinguish two:

| Format | Traits | Best For |
|---|---|---|
| **CSV** | Human-readable, simple | Small data, quick start |
| **RecordIO-protobuf** | Binary serialization, high-efficiency | Large data, Pipe mode streaming |

RecordIO-protobuf serializes data densely as binary, most efficient for streaming large data in Pipe mode. Many built-in algorithms (especially Linear Learner, Factorization Machines, K-Means, etc.) recommend or require this format. CSV is supported but slower at scale; RecordIO is faster.

```python
import sagemaker.amazon.common as smac
import io

# Serialize data to RecordIO-protobuf and upload to S3
buf = io.BytesIO()
smac.write_numpy_to_dense_tensor(buf, features, labels)
buf.seek(0)
```

XGBoost is an exception, predominantly using CSV and libsvm (tree algorithm nature). Also, when using CSV, a frequently tested rule is **first column is target (label) and no header row**.

> ⚠️ **Pitfall**: To "stream large data efficiently in Pipe mode", use **RecordIO-protobuf** format. CSV is text, big, and has parsing cost—inefficient for large streaming. Meanwhile, "XGBoost CSV training label position" → **first column**, no header. Remember format efficiency (RecordIO) and XGBoost's CSV label rule (first column, no header) separately.

## Summary

Remember built-in algorithms by three axes: ① **Why use**: No code, AWS optimization, scalability, reuse validated algorithms. ② **Problem-type mapping**: Tabular classification/regression=XGBoost, large linear/sparse=Linear Learner, anomaly=RCF, time series=DeepAR, sparse recommendation=Factorization Machines, fast text=BlazingText, image has 3 types: classification/detection/segmentation. ③ **Input format**: Large streaming→RecordIO-protobuf, small/simple→CSV, XGBoost CSV→first column is label, no header. In exams, "which algorithm" discriminates by data type and problem; "which format" discriminates by scale and streaming.

Next we see SageMaker AutoML, which automatically optimizes this chosen algorithm's hyperparameters.

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
