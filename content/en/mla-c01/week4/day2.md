# Day 2 - Built-in Algorithms: XGBoost, Linear Learner, Image·Text, Input Formats

## 📌 Key Takeaways

- **Built-in algorithms** are containers AWS has prebuilt. You do not write training code — if you give the data in the correct format, training works.
- The heart of the exam is the **problem type → algorithm mapping** — tabular classification/regression = XGBoost, large-scale linear/sparse = Linear Learner, anomaly detection = RCF, time series = DeepAR, sparse recommendation = Factorization Machines, fast text = BlazingText.
- Image algorithms split into three branches: **classification (one label) / detection (location + class) / segmentation (pixel level)**.
- **Input formats**: large-volume streaming uses **RecordIO-protobuf**; small and simple uses CSV.
- **XGBoost's CSV rule** — the first column is the target (label), and there is no header row. This is a rule you need to know for the exam.

## Why Use Built-in Algorithms

It is a choice between writing PyTorch yourself and using an algorithm AWS has optimized. The built-in side has three advantages.

- **No code needed**: You do not have to write a training script.
- **Optimization**: AWS has pre-tuned distributed training and GPU utilization.
- **Scalability**: Designed for large data (especially the RecordIO format + Pipe mode).

Even for the same training, the amount of hands-on work differs depending on "what you pick up and use".

| Approach | Code I write | Flexibility | When to choose |
|------|----------------|--------|-------------|
| **Built-in algorithm** | None (hyperparameters only) | Low | Standard problems, when a baseline is needed quickly |
| **Framework Estimator** | Training script (`entry_point`) | Medium | When you must define your own model structure and loss function |
| **JumpStart pre-trained model** | Almost none (fine-tuning data only) | Medium | When specializing a proven model with a small amount of data |
| **Custom container** | Code + Dockerfile | High | When you need special libraries or an in-house runtime |

```python
from sagemaker import image_uris

# Look up the built-in algorithm container URI
container = image_uris.retrieve('xgboost', region, version='1.7-1')

estimator = Estimator(
    image_uri=container,   # just specify the built-in container and you're done
    role=role,
    instance_count=1,
    instance_type='ml.m5.xlarge',
)
```

Built-in algorithms are an implementation of the principle "don't reinvent the wheel". XGBoost and logistic regression are algorithms validated over decades, and using a container where AWS has optimized distribution, streaming, and even GPU avoids the bugs and inefficiencies that arise when you write it yourself. It is reasonable to drop down to custom code only when you truly need a new architecture.

## Representative Algorithms and Problem-Type Mapping

The exam asks "Which built-in algorithm is best suited to this problem?" The problem type → algorithm mapping is as follows.

| Problem Type | Built-in Algorithm | Notes |
|-----------|-----------------|------|
| Classification·regression (tabular data) | **XGBoost** | The most widely used all-purpose tree algorithm |
| Classification·regression (linear) | **Linear Learner** | Logistic/linear regression, strong at large scale |
| Image classification | **Image Classification** | CNN-based |
| Object detection | **Object Detection** | Location + class within an image |
| Image segmentation | **Semantic Segmentation** | Pixel-level classification |
| Text classification·embedding | **BlazingText** | Word2Vec, fast |
| Clustering | **K-Means** | Unsupervised |
| Anomaly detection | **Random Cut Forest (RCF)** | Unsupervised outliers |
| Dimensionality reduction | **PCA** | Feature compression |
| Recommendation | **Factorization Machines** | Recommendation on sparse data |
| Time series forecasting | **DeepAR** | Deep learning across multiple time series |
| Topic modeling | **LDA / NTM** | Extracting document topics |

Rather than memorizing everything, firmly grasp the **core algorithms**. Tabular classification/regression is XGBoost, large-scale linear is Linear Learner, anomaly detection is RCF, time series is DeepAR, sparse-data recommendation is Factorization Machines, and fast text is BlazingText. Knowing just these six for sure clears up a good share of the answer choices.

Following the clues in the question stem generally narrows things down to one branch.

```text
What is the data?
├─ Table (tabular)
│   ├─ Labels (answers) available
│   │   ├─ Dense features, non-linear relationships   → XGBoost
│   │   ├─ Tens of thousands of features, sparse, fast linear   → Linear Learner
│   │   └─ Very sparse like user×item                 → Factorization Machines
│   └─ No labels
│       ├─ Group similar things together              → K-Means
│       ├─ Find rare outliers                         → Random Cut Forest
│       └─ Reduce the number of features              → PCA
├─ Time series (several series together)              → DeepAR
├─ Text
│   ├─ Embeddings·fast classification                 → BlazingText
│   └─ Extract hidden topics of documents             → LDA / NTM
└─ Image
    ├─ One label per photo                            → Image Classification
    ├─ Object location + class                        → Object Detection
    └─ A class for every pixel                        → Semantic Segmentation
```

## XGBoost and Linear Learner

**XGBoost** is a gradient boosting tree algorithm and is effectively the default choice for classification and regression on structured (tabular) data. It is powerful in practice thanks to missing-value handling, capturing non-linear relationships, and providing feature importance.

```python
estimator.set_hyperparameters(
    objective='binary:logistic',  # binary classification
    num_round=100,                # number of boosting rounds
    max_depth=5,                  # tree depth
    eta=0.2,                      # learning rate
    subsample=0.8,                # row sampling ratio
)
```

**Linear Learner** implements linear/logistic regression for large-scale data. It is simpler than XGBoost, but suits cases where the data is well separated linearly or has a very large number of features, and where fast training is needed. It also has the property of training several models in parallel and automatically selecting the best one.

The boundaries among the three structured-data algorithms are drawn by **the shape of the data**.

| Algorithm | Model nature | Data it fits | Typical situation |
|----------|-----------|----------------|-----------|
| **XGBoost** | Gradient boosting trees (non-linear) | Dense tables with tens to hundreds of features | Churn prediction, credit scoring, demand forecasting |
| **Linear Learner** | Linear·logistic regression | Tens of thousands of sparse features, linearly separable | Large-scale text-feature classification, fast baseline |
| **Factorization Machines** | Latent-factor interaction model | Extremely sparse matrices like user×item | Recommendation, click-through rate prediction |

> ⚠️ **Pitfall**: For "classification of structured tabular data", the safe answer is XGBoost. However, if "there are tens of thousands of features, very sparse, and a fast linear model is needed", Linear Learner fits better. And for "very sparse recommendation like user-item", it is Factorization Machines. The trick is to separate the three by the data shape in the scenario (dense table vs. high-dimensional sparse vs. recommendation-sparse).

## Image and Text Algorithms

The **image** family distinguishes three algorithms in the order of increasing "fineness of output".

| Algorithm | Output unit | Result | Example requirement |
|----------|-----------|--------|---------------|
| **Image Classification** | One image | A single label | "Is this photo a defective product?" |
| **Object Detection** | Object | Bounding box + class | "Where are the people and vehicles in the photo?" |
| **Semantic Segmentation** | Pixel | Per-pixel class map | "Divide the road and sky regions at the pixel level" |

If the question stem mentions **"location (where)"**, Image Classification is out, and if it demands even **"pixel-level, region boundaries"**, it is Semantic Segmentation.

For **text**, **BlazingText** is the representative. It handles Word2Vec embedding training and text classification very quickly (a highly optimized implementation). For "train word embeddings quickly" or "large-scale text classification", think of BlazingText.

```python
# BlazingText: text classification mode
estimator.set_hyperparameters(
    mode='supervised',   # supervised=classification, skipgram/cbow=embedding
    epochs=10,
    word_ngrams=2,
)
```

Word2Vec (BlazingText's embedding mode) is based on the distributional hypothesis that "words that appear together have similar meanings". It learns each word as a vector, making semantic arithmetic like "king - man + woman ≈ queen" possible. These embeddings are later reused as input features for classification, search, and recommendation. Just as a CNN in images extracts visual features from pixels, embeddings are representation learning that extracts semantic features from words.

## Input Formats: RecordIO-protobuf vs CSV

For built-in algorithms, the **input format** is within the exam scope. Distinguish two.

| Format | Characteristics | Suitable when |
|------|------|-------------|
| **CSV** | Human-readable, simple | Small data, quick start |
| **RecordIO-protobuf** | Binary serialization, highly efficient | Large volume, Pipe-mode streaming |

RecordIO-protobuf serializes data densely in binary, making it the most efficient when streaming large volumes in Pipe mode. Many built-in algorithms (especially Linear Learner, Factorization Machines, K-Means, etc.) recommend or require this format. CSV is also supported, but for large volumes RecordIO is faster.

```python
import sagemaker.amazon.common as smac
import io

# Serialize data to RecordIO-protobuf and upload to S3
buf = io.BytesIO()
smac.write_numpy_to_dense_tensor(buf, features, labels)
buf.seek(0)
```

XGBoost is an exception, mainly using CSV and libsvm (a property of tree algorithms). The exam also asks about the rule that when giving CSV, the **first column is the target (label)** and there must be no header.

The format and input mode are specified together when creating the channel.

```python
from sagemaker.inputs import TrainingInput

# XGBoost + CSV (first column is the label, no header)
csv_input = TrainingInput(
    's3://my-bucket/train/train.csv',
    content_type='text/csv',
)

# Large volume: RecordIO-protobuf + Pipe mode
pipe_input = TrainingInput(
    's3://my-bucket/train/',
    content_type='application/x-recordio-protobuf',
    input_mode='Pipe',
)

estimator.fit({'train': csv_input})
```

Because the expected input differs by algorithm, remember the formats of the representative algorithms as a group.

| Algorithm | Commonly used input format |
|----------|---------------------|
| **XGBoost** | CSV, libsvm — for CSV, **first column is the label, no header** |
| **Linear Learner** | RecordIO-protobuf recommended, CSV also supported |
| **Factorization Machines** | RecordIO-protobuf |
| **K-Means / PCA** | RecordIO-protobuf recommended, CSV also supported |
| **BlazingText** | A text file with one sentence per line (`__label__` prefix for supervised classification mode) |
| **DeepAR** | JSON Lines |
| **Image Classification** | RecordIO, or image files + a list file |

The essence of the format debate is "parsing cost". CSV writes numbers as human-readable strings, so the training instance repeatedly converts strings back to numbers. RecordIO-protobuf is a machine-readable binary representation from the start, so this conversion is absent and the size is smaller too. With small data the difference is invisible, but when streaming hundreds of GB, parsing becomes a bottleneck that leaves the GPU idle.

## When You Pick the Wrong Algorithm or Format: Symptom → Cause → Action

The exam checks algorithm and format knowledge with situations like "I did this, but the result is strange".

| Symptom | Common cause | Action |
|------|-----------|------|
| XGBoost training runs but predictions are meaningless | A header row remains in the CSV, or the label is in the last column | Remove the header, move the label to the **first column** |
| Data loading is the bottleneck in large-scale training | CSV parsing cost + File-mode full download | Convert to RecordIO-protobuf and use Pipe mode |
| Tens of thousands of features make training slow and exceed memory | High-dimensional sparse data is bad for tree splits | Switch to Linear Learner |
| A recommendation model's performance barely improves | A user×item sparse matrix is being handled by a generic classifier | Switch to Factorization Machines |
| BlazingText classification does not learn | Supervised classification mode but the label notation format is wrong | Check `mode='supervised'` and the `__label__` prefix format |
| It cannot catch multiple objects in a photo | Image Classification outputs only one label per image | Switch to Object Detection |

> ⚠️ **Pitfall**: To "train efficiently by streaming large data in Pipe mode", the format is **RecordIO-protobuf**. CSV is text, so it is large and has parsing cost, making it inefficient for large-volume streaming. On the other hand, if asked "the label position when training XGBoost with CSV", it is the **first column** and there must be no header. Keep format efficiency (RecordIO) and XGBoost's CSV label rule (first column, no header) separate.

In the next post, we look at SageMaker AMT, which automatically optimizes the hyperparameters of the algorithm you chose this way.

## 📖 Glossary

- **Built-in algorithm**: A training container AWS has prebuilt. Training works by giving only data and hyperparameters, without writing code.
- **XGBoost**: An algorithm that chains many small decision trees to reduce error step by step. The de facto default choice for tabular data.
- **Gradient boosting**: A technique that stacks multiple models so that each next model focuses on correcting what the previous models got wrong.
- **Linear Learner**: A built-in algorithm implementing linear·logistic regression for large-scale data. Strong when there are very many features.
- **Factorization Machines / sparse data**: Sparse data is data where most values are 0 or blank (a user×item purchase matrix is the classic example). FM is a recommendation algorithm that learns interactions between items as latent factors from such extremely sparse data.
- **Random Cut Forest (RCF)**: An anomaly detection algorithm that finds data that "stands out unusually" without any labels.
- **DeepAR**: A deep-learning-based demand/numeric forecasting algorithm that trains many time series at once and borrows patterns from one another.
- **BlazingText / embedding**: An embedding turns a word or item into a numeric vector, where similar meanings give nearby vectors. BlazingText is an algorithm optimized to handle this word embedding (Word2Vec) training and text classification very quickly.
- **Bounding box**: A rectangular region enclosing an object within an image. The output form of object detection.
- **RecordIO-protobuf / libsvm**: RecordIO-protobuf is a format that stores training data densely in binary, with a small size and fast parsing, favorable for large-volume streaming. libsvm is a text format for sparse data that writes only non-zero values in the form `label index:value`, and XGBoost supports it.

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
