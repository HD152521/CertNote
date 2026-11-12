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

## 📝 Practice Questions

**Question 1.** You want to predict customer churn (binary classification) from structured tabular data with 100 features. Which built-in algorithm is most suitable for quickly building a strong model without writing custom code?

A) Semantic Segmentation  
B) XGBoost  
C) BlazingText  
D) DeepAR  

**Answer: B**  
Explanation: XGBoost is effectively the default choice for classification and regression on structured tabular data, handles nonlinear relationships and missing values well, and can be used as a built-in without writing code. A is for image pixel segmentation, C is for text, and D is for time series forecasting, so they are unsuitable for a structured classification problem.

---

**Question 2.** You want to feed hundreds of GB of training data into a built-in algorithm as efficiently as possible while streaming it in Pipe mode. What is the recommended data format?

A) CSV  
B) JSON  
C) RecordIO-protobuf  
D) XML  

**Answer: C**  
Explanation: RecordIO-protobuf compresses and serializes data in binary, making it the most efficient for streaming large data in Pipe mode, and many built-in algorithms recommend it. A is text, so it is large and incurs parsing cost, and B and D are unsuitable as built-in training input formats.

---

**Question 3.** You need to determine both the locations (bounding boxes) of multiple objects appearing in an image and the class of each object. Which built-in algorithm is suitable?

A) Image Classification  
B) Object Detection  
C) K-Means  
D) PCA  

**Answer: B**  
Explanation: Object Detection predicts the locations and classes of multiple objects in an image together, so it exactly matches this requirement. A assigns only a single label to the whole image, C is clustering, and D is dimensionality reduction, all unrelated to detecting object locations.

---

**Question 4.** When providing training data in CSV format to the XGBoost built-in algorithm, what is the correct format rule?

A) The first column must be the target (label) and there must be no header row  
B) The last column must be the target and a header must be present  
C) The target column must be split into a separate file  
D) All values must be converted to binary  

**Answer: A**  
Explanation: For CSV input, XGBoost treats the first column as the target and requires that there be no header row. B reverses both the position and the header rule, C is not how built-in XGBoost takes input, and D describes a format other than CSV.

---

**Question 5.** You want to train word embeddings (Word2Vec) from a large text corpus very quickly. Which built-in algorithm is most suitable?

A) Linear Learner  
B) Random Cut Forest  
C) BlazingText  
D) Factorization Machines  

**Answer: C**  
Explanation: BlazingText is a built-in algorithm highly optimized for Word2Vec embedding training and text classification, processing them very quickly. A is a linear model, B is anomaly detection, and D is for sparse recommendation, none of which matches the goal of training word embeddings.

---
