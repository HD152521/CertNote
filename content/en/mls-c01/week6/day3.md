# Day 3 - SageMaker Builtin 2: Text, Images, Time Series, Recommendations

## 📌 Key Takeaways

- When a question mentions **text, images, time series, or sparse** data, the answer shifts away from XGBoost toward a **specialized builtin**.
- **BlazingText has two modes.** If you have labels and are classifying documents, use supervised mode; if you want word vectors without labels, use Word2Vec.
- The textbook answer for **images + insufficient data** is `use_pretrained_model=1` **transfer learning + data augmentation**. If you also need object locations, use Object Detection.
- **DeepAR** trains thousands of related time series together in one model so it can forecast new or short series too, and it outputs **P10/P50/P90 probability intervals** rather than point estimates.
- **Factorization Machines** is dedicated to second-order interactions in ultra-high-dimensional sparse data blown up by one-hot encoding, and its recommended input is **RecordIO-protobuf (float32)**.

## Data Shape Decides the Algorithm

Yesterday we covered tabular-data algorithms. Today we organize the specialized builtins used when the data has a special shape: **text, images, time series, and sparse interactions**.

| Data shape | Goal | Builtin | Input format | Reason |
|------|------|------|------|------|
| Text | Document classification | BlazingText (supervised) | Text file, `__label__<label> sentence` | Based on fastText, very fast on large corpora |
| Text | Word embeddings | BlazingText (Word2Vec) | Text file (whitespace-tokenized) | Learns a semantic space without labels |
| Image | Label classification | Image Classification | RecordIO or images (.jpg/.png) + .lst | ResNet-based CNN, supports transfer learning |
| Image | Object location | Object Detection | — | Location is needed, not just classification |
| Image | Pixel level | Semantic Segmentation | — | Assigns a class to every pixel |
| Time series | Forecast future values | DeepAR | JSON Lines | Shared learning across many related series, probabilistic forecasts |
| Sparse interactions | Recommendation, click prediction | Factorization Machines | RecordIO-protobuf (float32) | Optimized for sparse data |

```
                  [Data is not tabular]
                            │
        ┌───────────┬───────┴────────┬─────────────┐
      Text        Image          Time series     User-item
        │            │               │            (very sparse)
   Labels?      What do you        Many related      │
   ├─ Yes →     want?              series?       Factorization
   │  supervised ├─ Label only →   ├─ Yes →      Machines
   │  (document  │  Image          │  DeepAR    (RecordIO-protobuf)
   │  classif.)  │  Classification └─ No →
   └─ No →       ├─ Location too →    Single-series statistical
      Word2Vec   │  Object            method or Forecast
      (embedding)│  Detection
                 └─ Pixel level →
                    Semantic Segmentation
```

## BlazingText — Text Classification and Word Embeddings

A builtin that accelerates Word2Vec and text classification on GPUs. It has two modes.

- **Word2Vec (unsupervised)**: Embeds words as vectors. Used for finding similar words and generating features for downstream tasks
- **Text Classification (supervised)**: Document → label (sentiment, topic, etc.). Based on fastText

```text
Mode decision:
  Labels exist and you classify documents → supervised (text classification)
  No labels and you only need word vectors → Word2Vec (cbow / skipgram / batch_skipgram)
```

- **Input**: Text file (whitespace-tokenized). Supervised mode uses the `__label__<label> sentence` format
- **Strengths**: Overwhelming speed on large corpora, multilingual support, and handling of OOV (out-of-vocabulary) words through subwords

| Word2Vec mode | Training direction | Characteristics |
|---|---|---|
| cbow | Predict the center word from the surrounding context | Fast and strong on frequent words |
| skipgram | Predict the surrounding context from the center word | Better representations of rare words |
| batch_skipgram | Batched, distributed training version of skipgram | Scalability on large corpora |

BlazingText's Word2Vec places words with similar meanings close together in the vector space by either "guessing the center word from its context (CBOW)" or "guessing the context from the center word (skip-gram)." The learned embeddings themselves can be used for word similarity search, or passed to other models as input features. On the exam, "semantic similarity of words" / "embeddings" is the signal for Word2Vec mode, and "classify documents into categories" is the signal for supervised mode.

> ⚠️ **Trap**: In supervised mode, the label prefix in the training file must take the form `__label__`. An option that puts the label in a column like a regular CSV is wrong.

## Image Classification — Image Classification

A builtin that classifies images into one or multiple labels using a CNN (ResNet).

- **Use**: Single-label/multi-label image classification
- **Input**: RecordIO or images (.jpg/.png) + a .lst list file
- **Key technique**: **Transfer learning** — starting from ImageNet pretrained weights with `use_pretrained_model=1` gives good performance even with little data

```text
Key hyperparameters:
  num_classes, num_training_samples
  use_pretrained_model   0 (from scratch) | 1 (transfer learning)
  image_shape, learning_rate, mini_batch_size
  augmentation_type      image augmentation (crop/color, etc.)
```

- When data is scarce, transfer learning + data augmentation is the textbook approach.
- If you also need the **location** of objects, use the **Object Detection** builtin rather than classification; for pixel level, use **Semantic Segmentation**.

| Situation | Choice | Reason |
|---|---|---|
| Fewer than a few thousand labeled images | `use_pretrained_model=1` + `augmentation_type` | Training from scratch overfits |
| Very many labeled images and a specialized domain | Consider `use_pretrained_model=0` | When the domain differs greatly from the pretraining domain |
| "Does this photo have a defect?" | Image Classification | Only a label is needed |
| "Where is the defect?" | Object Detection | Bounding boxes are needed |
| "Paint the defect region pixel by pixel" | Semantic Segmentation | Pixel-level classes |

> ⚠️ **Trap**: Choosing "train a deeper network from scratch" for "images + insufficient data" is wrong. The less data you have, the more you should **borrow pretrained weights and expand the data with augmentation** rather than enlarge the model.

## DeepAR — Time Series Forecasting

An RNN-based time series forecasting builtin. Its key strength is that it does not model each series separately but **learns multiple related series together and shares patterns**.

- **Use**: Forecasting future values of demand, sales, and traffic, with probabilistic (quantile) forecasts
- **Input**: JSON Lines — each time series has `start`, `target`, and optionally `cat` (category) and `dynamic_feat` (covariates)
- **Strengths**: When there are many related series, such as thousands of stores, it is more accurate than modeling each one individually. New or short series (cold start) can also be forecast using patterns learned from similar series

```text
Key hyperparameters:
  context_length      length of the past input window
  prediction_length   length of the forecast window
  epochs, num_cells, num_layers
  likelihood          output distribution (Gaussian, etc.)
```

Traditional ARIMA and exponential smoothing model each time series separately, whereas DeepAR trains multiple related series in a single model and **cross-learns seasonality and trend**. That is why a new item with a short history can borrow the patterns of similar items. Because the output is a distribution (quantiles) rather than a point estimate, it provides uncertainty intervals in the form of P10/P50/P90. On the exam, "thousands of related time series" / "new product demand" / "probabilistic forecast intervals" are DeepAR signals. If you need something more managed, Amazon Forecast is the answer.

### Conditions Where DeepAR Beats Single-Series Techniques

| Condition | DeepAR | Single-series statistical techniques (ARIMA, etc.) |
|---|---|---|
| Thousands of related series | Advantageous (shares patterns) | A separate model must be built for each series |
| New or short history (cold start) | Advantageous (borrows from similar series) | Cannot estimate without data |
| Only a single time series | Small advantage | Competitive enough |
| Uncertainty intervals needed | Provides quantile forecasts | Separate interval estimation required |
| Reflecting covariates (promotions, price) | Fed in via `dynamic_feat` | Awkward to extend |

"Time series forecasting" does not automatically mean DeepAR. If there is only one series and the data is short, deep learning is overkill. DeepAR is confirmed only when there is a **clue such as "many related series" or "probability intervals needed."**

## Factorization Machines — Sparse High-Dimensional Recommendation

It efficiently models second-order interactions between features in data that is **very sparse and high-dimensional**, such as user-item data.

- **Use**: Recommendation (click prediction, rating prediction), sparse classification/regression
- **Input**: RecordIO-protobuf (float32). It is **optimized for sparse data**, so CSV is not recommended
- **Strengths**: It learns interactions efficiently even on ultra-high-dimensional sparse input blown up by one-hot encoding

```text
Key hyperparameters:
  num_factors        dimension of the latent factors
  predictor_type     binary_classifier | regressor
  bias/linear/factors   per-term regularization and initialization settings
```

In a recommendation context, FM is a generalization of collaborative filtering. If you feed in user ID and item ID as one-hot vectors, it behaves like matrix factorization, and you can also feed additional features (time, context) alongside them.

| Comparison | Factorization Machines | Classic collaborative filtering (matrix factorization) |
|---|---|---|
| Input | Arbitrary feature vector (one-hot + extra features) | Only the user-item matrix |
| Side information | Time, context, demographics can be added | Hard to add |
| Cold start | Partly mitigated by extra features | Weak on new users and items |
| Handling sparsity | Generalizes interactions through latent factors | Focuses on observed cells |

An option that says to use CSV with FM is a wrong-answer signal. Representing sparse high-dimensional data as CSV produces a huge dense table that is mostly zeros, which is inefficient. **RecordIO-protobuf (float32)** is the correct answer.

## Preprocessing and Evaluation Metrics

Specialized builtins have different preprocessing requirements from tabular algorithms. In some cases the very concept of "scaling" does not apply.

| Builtin | Preprocessing requirement | Scaling |
|---|---|---|
| BlazingText | Whitespace tokenization; `__label__` prefix for supervised | Not applicable (token input) |
| Image Classification | Resize (`image_shape`), augmentation, build RecordIO or .lst | Pixel normalization is handled by the container |
| DeepAR | Organize `start`/`target` per series, handle missing intervals, align covariates | Not applicable (series scale is normalized internally) |
| Factorization Machines | One-hot encode, then convert to a sparse representation | Scale cleanup recommended for numeric features |

| Task | Main metric | What it tells you | Trap |
|---|---|---|---|
| Text classification (imbalanced classes) | F1, macro F1 | Whether minority categories are also caught | Accuracy is pulled toward the majority category |
| Image classification (multi-label) | Per-label precision/recall | Performance variation across tags | Overall accuracy hides the variation |
| Time series forecasting (point estimate) | RMSE, MAE | Average size of the error | Says nothing about the quality of interval forecasts |
| Time series forecasting (probability interval) | Quantile loss family | Whether the P10/P50/P90 interval encloses the actual value | With RMSE alone you cannot tell if the interval is too wide |
| Recommendation (click prediction) | AUC, PR-AUC | Quality of click-probability ranking | Accuracy is meaningless when the click rate is under 1% |
| Recommendation (rating prediction) | RMSE | Rating error | A different matter from top-ranking quality |

Recommendation and click-prediction data is a classic imbalance case, with very few positives (clicks). An option that picks accuracy as the metric here is wrong; AUC, which looks at ranking quality, or PR-AUC, which is honest about the minority class, is the correct direction.

## Question Clue → Answer Mapping Table

| Question clue | Answer direction | Accompanying details |
|---|---|---|
| "Classify documents into categories" | BlazingText supervised | `__label__` format |
| "Semantic similarity of words / embeddings" | BlazingText Word2Vec | cbow / skipgram |
| "Images + little data" | Image Classification | Transfer learning + augmentation |
| "Object locations in images" | Object Detection | Not classification |
| "Separate regions pixel by pixel" | Semantic Segmentation | — |
| "Thousands of related series / new product demand / P90 interval" | DeepAR | JSON Lines, `context_length` |
| "Also reflect external variables such as promotions" | DeepAR `dynamic_feat` | Covariate channel |
| "User-item / very sparse / recommendation" | Factorization Machines | RecordIO-protobuf |
| "Fully managed and fast" | Comprehend / Rekognition / Forecast / Personalize | Not training it yourself |

Tomorrow we cover the unsupervised and anomaly-detection builtins that work without labels (RCF, PCA, IP Insights, LDA/NTM).

## 📖 Glossary

- **fastText**: A text classification and embedding technique that breaks words down into substrings (subwords). It is the basis of BlazingText's supervised mode.
- **OOV (out-of-vocabulary)**: A word that was not in the training vocabulary. With subword representations, a vector can be built even for a word seen for the first time.
- **cbow / skipgram**: A method of guessing the center word from its context / a method of guessing the context from the center word. These are the two training directions of Word2Vec.
- **Transfer learning**: A technique that starts from weights pretrained on large-scale data and fine-tunes them with a small amount of data.
- **Data augmentation**: A technique that artificially expands the training images through cropping, color changes, and similar operations to reduce overfitting.
- **.lst file**: A list file that records image paths and labels line by line, passed to Image Classification.
- **JSON Lines**: A format that holds one JSON object per line. It is how DeepAR receives one time series per line.
- **context_length / prediction_length**: The length of the past window DeepAR looks at / the length of the future window to forecast.
- **Quantile forecast (P10/P50/P90)**: A probabilistic forecast that returns the "10%, 50%, and 90% probability lines" together instead of a single value.
- **Latent factor**: A hidden low-dimensional feature vector that describes users and items. FM's `num_factors` sets its dimension.

## 📝 Practice Questions

**Question 1.** You have daily sales data for 1,000 stores and want to forecast the next 4 weeks of demand, as P10/P50/P90 intervals, for a newly opened store with a short data history. Which built-in algorithm is MOST suitable?

A) DeepAR  
B) XGBoost  
C) BlazingText  
D) K-Means  

**Answer: A**  
Explanation: DeepAR trains on many related time series together, so it can forecast new and short time series using patterns from other stores, and it provides quantile (P10/P50/P90) probabilistic forecasts. XGBoost (B) does not naturally handle time series structure, BlazingText (C) is for text, and K-Means (D) is for clustering.

---

**Question 2.** You want to train a model that classifies customer review documents as "positive/negative/neutral" on a large corpus very quickly. Which built-in algorithm and mode are MOST suitable?

A) Image Classification  
B) Factorization Machines  
C) BlazingText, supervised (text classification) mode  
D) PCA  

**Answer: C**  
Explanation: For the task of classifying labeled documents into categories, BlazingText's supervised mode (fastText-based) is suitable and is very fast on GPU. Images (A), sparse recommendation (B), and dimensionality reduction (D) do not fit a text classification task.

---

**Question 3.** You want to classify product defects using a small image dataset of about 2,000 images. With so little data, you are worried about performance. Which approach is MOST recommended?

A) Train a deep CNN from scratch (use_pretrained_model=0)  
B) Use transfer learning (use_pretrained_model=1) and data augmentation  
C) Feed pixels directly into Linear Learner  
D) Predict image sequences with DeepAR  

**Answer: B**  
Explanation: When data is scarce, transfer learning that starts from ImageNet pretrained weights plus augmentation is the standard approach. Training from scratch (A) easily overfits on little data, and feeding pixels directly to a linear model (C) or using DeepAR (D) is unsuitable for image classification.

---

**Question 4.** You one-hot encoded user ID, item ID, and context features to create very sparse, high-dimensional click-through-rate prediction data. Which built-in algorithm efficiently learns the interactions, and what is the recommended input format?

A) Factorization Machines, RecordIO-protobuf  
B) XGBoost, CSV  
C) K-Means, RecordIO-protobuf  
D) BlazingText, text file  

**Answer: A**  
Explanation: Factorization Machines efficiently model second-order interactions in ultra-high-dimensional sparse data, and RecordIO-protobuf (float32) input, optimized for sparse data, is recommended. XGBoost with CSV (B) is inefficient for ultra-high-dimensional sparse data, and K-Means (C) and BlazingText (D) are not for recommendation tasks.

---

**Question 5.** In which situation is it MOST appropriate to use BlazingText's Word2Vec mode?

A) When classifying documents into predefined categories  
B) When predicting future time series values  
C) When detecting objects in images  
D) When embedding words as vectors to find semantically similar words  

**Answer: D**  
Explanation: Word2Vec mode embeds words in a vector space without labels and is used for finding similar words or generating downstream features. Document classification (A) uses supervised mode, and time series (B) and images (C) are outside BlazingText's domain.

---
