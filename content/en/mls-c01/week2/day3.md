# Day 3 - Data Augmentation and Synthesis: Handling Scarce and Imbalanced Data

## 📌 Key Takeaways

- **Augmentation** = transforming existing data to diversify it. The golden rule is "**only transformations that do not change the label**."
- **Synthesis** = generating data that did not exist before (GANs, simulation, synthetic tabular data). It addresses privacy and scarce data.
- The biggest risk of synthetic data is the **distribution gap**. Use it as a supplement, and **always validate with real data**.
- Handling imbalance has three layers: the **data layer** (over/undersampling, SMOTE), the **algorithm layer** (class weights, threshold), and the **evaluation layer** (no accuracy; recall, F1, PR-AUC).
- **SMOTE** is different from simple duplication. It creates new points by **interpolating between** a minority sample and its nearest neighbors.

## Why This Problem Arises

Building a good model requires enough balanced data, but reality is different. Rare disease diagnosis data has extremely few positive samples, fraudulent transactions are 0.1% of the total, and some image classes have only a handful of pictures. Left as is, the model gets the majority class right and misses the minority class that actually matters.

MLS-C01 asks not about code implementation but "**which technique fits which situation**."

| Situation | First response | Second response |
|---|---|---|
| The total amount of data is small | Transfer learning, data augmentation | Supplement with synthetic data |
| Only a specific class is scarce | Oversampling/SMOTE, class weights | Threshold adjustment |
| Real data cannot be used (privacy) | Synthetic tabular data | Anonymization, differential privacy |
| There are no examples of rare or dangerous situations | Simulation | Domain-rule-based generation |
| Labels are scarce | Active learning, weak supervision | Semi-supervised learning |

## What Is Data Augmentation

Data augmentation is a technique that **creates new training samples by transforming existing data**. Without collecting new data, it increases the diversity and quantity of the dataset, improving generalization and reducing overfitting.

The core principle of augmentation is "**a transformation that does not change the label**." A cat photo flipped horizontally is still a cat. In other words, you should apply only transformations that preserve the correct answer (the label) while diversifying just the input. Through this, the model learns invariance: "the essence is the same even when position, angle, or brightness differ."

### Image Augmentation

Images are the area where augmentation is most active.

| Transformation family | Examples | Invariance the model gains |
|---|---|---|
| Geometric transforms | Horizontal/vertical flip, rotation, translation, scaling, crop | Changes in position, angle, and size |
| Color/brightness transforms | Brightness, contrast, saturation adjustment, color jitter | Differences in lighting and cameras |
| Noise/masking | Gaussian noise, region occlusion (Cutout) | Partial occlusion, degraded quality |
| Mixing | Blending two images (Mixup/CutMix) | Smoother decision boundaries |

```python
# Image augmentation (conceptual example - torchvision transforms)
from torchvision import transforms

augment = transforms.Compose([
    transforms.RandomHorizontalFlip(p=0.5),   # horizontal flip
    transforms.RandomRotation(degrees=15),    # rotate by ±15 degrees
    transforms.ColorJitter(brightness=0.2,    # brightness/contrast changes
                           contrast=0.2),
    transforms.RandomResizedCrop(224),        # random crop, then resize
])
```

> ⚠️ **Pitfall**: Indiscriminate augmentation ruins labels. In digit recognition, rotating a "6" by 180 degrees makes it a "9," breaking the label. In medical imaging, a horizontal flip swaps left and right organs and damages the diagnostic meaning. Augmentation must be applied **only within the range that preserves domain meaning**.

### Text and Audio Augmentation

- **Text** is trickier than images (a single word can change the meaning).
  - **Synonym replacement**: swap some words with synonyms
  - **Back-translation**: round-trip Korean → English → Korean to diversify the phrasing
  - **Random insertion, deletion, and swap**: insert or remove some words, or swap their positions
  - **Embedding-based replacement and contextual models**: generate natural variations with a pretrained language model
- **Audio** uses speed changes, pitch shifts, added background noise, and time/frequency masking.

> ⚠️ **Pitfall**: In text augmentation, touching a negation word ("not," "no") flips the label to the opposite. Applying heavy random deletion to sentiment analysis data actually lowers performance.

## Data Synthesis: Creating Data That Does Not Exist

If augmentation is "transforming existing data," synthesis is closer to **generating entirely new virtual data**. It is used when real data is extremely scarce or cannot be used because of privacy.

| Method | Description | Typical use |
|---|---|---|
| **GAN** | A generator and a discriminator compete to produce realistic data | Image generation, supplementing rare cases |
| **Simulation** | Creates situations with a physics or rule engine | Dangerous scenarios for autonomous driving, robotics |
| **Synthetic tabular data** | Mimics statistical distributions to create a fake table with no personal information | Privacy protection, external sharing |

Synthetic data is powerful, but it carries the risk of a "**distribution gap**." If synthetic data cannot perfectly reproduce the real data distribution, a model trained on it performs worse in the real world. So use synthetic data to **supplement** real data, and always validate with real data.

## Handling Imbalanced Data

Class imbalance is an easily confusing topic on the ML exam. In fraud detection with positive:negative = 1:999, a model that answers "all negative" gets 99.9% accuracy but is a useless model that catches no fraud at all.

The response strategy has three broad layers.

```
[Data layer]       Oversampling / Undersampling / SMOTE
      ▼
[Algorithm layer]  Class weights / Decision threshold adjustment / Cost-sensitive learning
      ▼
[Evaluation layer] No accuracy → recall · F1 · PR-AUC
```

### 1. Data Layer: Resampling

| Technique | Behavior | Advantage | Risk |
|---|---|---|---|
| **Oversampling (duplication)** | Increases the minority class by duplicating it | No information loss | Repeating the same points → overfitting |
| **Undersampling** | Reduces the majority class to balance | Faster training | Loss of majority class information |
| **SMOTE** | Generates new points by interpolating between a minority sample and its nearest neighbors | Secures diversity, mitigates overfitting | Wrong synthesis in boundary and noisy regions |

```python
# Synthetic oversampling of the minority class with SMOTE (conceptual example - imbalanced-learn)
from imblearn.over_sampling import SMOTE

smote = SMOTE(random_state=42)
X_balanced, y_balanced = smote.fit_resample(X_train, y_train)
# Synthetic samples interpolated between minority-class samples are added so the class ratio is balanced
```

Unlike simple duplication (which risks overfitting from repeats), SMOTE **creates new points** on the line connecting an existing minority sample and its nearest neighbors. As a result, the model learns a more generalized decision boundary. However, with noisy data or ambiguous class boundaries it can create wrong synthetic samples, so caution is needed.

Resampling must be applied **only to the training set**. If you balance the validation and test sets too, they differ from the real operating distribution and the performance is inflated. Even when using cross-validation, run SMOTE only on the training portion of each fold.

### 2. Algorithm Layer: Weights and Thresholds

- **Class weights**: put a larger penalty on minority-class errors in the loss function. XGBoost's `scale_pos_weight` is the typical example.
- **Decision threshold adjustment**: lower the default 0.5 to catch the minority class better. Set the threshold by looking at the precision-recall curve and matching it to business cost.
- **Cost-sensitive learning**: optimize by explicitly including the real costs of false positives and false negatives.

### 3. Evaluation Layer: Change the Metric First

On imbalanced data, **accuracy gives false reassurance**. A 99.9% accuracy on 1:999 data is virtually meaningless. Instead, you must evaluate minority-class performance properly with **precision, recall, F1, PR-AUC, and ROC-AUC**. In problems where the minority class matters, such as fraud or disease, **recall** and **PR-AUC** are the key.

## When and Where to Apply Augmentation

Even the same augmentation changes in character depending on when it is applied.

| Approach | When it is created | Advantage | Disadvantage |
|---|---|---|---|
| **Pre-generated (offline)** | Created and stored in advance before training | No CPU load during training, easy to reproduce | More storage, diversity is fixed |
| **Real-time (on-the-fly)** | Random transformation each time a batch is built | Different transformations every epoch → greater diversity | The data loader can become a bottleneck |

- **Do not apply augmentation to the validation and test sets.** Evaluation must be done on the real input distribution.
- There is an exceptional technique (test-time augmentation) that averages the predictions of several transformations at inference time, but this does not enlarge the evaluation data; it is a separate technique that stabilizes predictions.

You should not be reassured just by a statement like "we lacked training data, so we expanded it 10x with augmentation." Augmentation **cannot create new information.** If the original is 100 images, however much you expand it, you cannot get more diversity than those 100 images contain. The fundamental solutions are data collection or transfer learning.

## Other Paths When Labels Are Scarce

Separate from imbalance, there are also situations where "the labels themselves are scarce."

- **Transfer learning**: take a model pretrained on large data and retrain only the last layers on our data. It greatly reduces the amount of labels needed.
- **Semi-supervised learning**: use a small amount of labeled data together with a large amount of unlabeled data.
- **Active learning**: pick only the samples the model is confused about and ask humans to label them.
- **Weak supervision**: generate a large number of rough labels with rules and heuristics, then train accepting the noise.

All four of these attack the same goal, "reduce the number of labels humans must attach," from different directions. Transfer learning reduces the problem on the **model side**, augmentation on the **input side**, active learning on the **selection side**, and weak supervision on the **label-generation side**. When "reducing labeling cost" appears on the exam, the answer is often one of these four.

## Application in the AWS Context

- **SageMaker Processing / Data Wrangler**: run resampling and augmentation logic in the preprocessing stage.
- **Weight options in built-in algorithms**: for example, correct imbalance with XGBoost's `scale_pos_weight`.
- **GAN training**: train a generative model with a SageMaker training job to create synthetic data.

> 🎯 **Scenario**: "Credit card fraud detection data is extremely imbalanced at 0.2% positive. The model almost never catches fraud." → (1) Correct the imbalance with oversampling such as SMOTE or with class weights, (2) evaluate with recall and PR-AUC instead of accuracy, and (3) adjust the decision threshold toward fraud detection.

Tomorrow we cover **how to feed prepared data efficiently into training** (Pipe/File mode, FSx for Lustre, sharding).

## 📖 Glossary

- **Data augmentation**: A technique that increases training samples by transforming existing data without changing the labels.
- **Invariance**: The property of giving the same answer even when position, angle, or brightness changes. Augmentation instills it in the model.
- **Back-translation**: A text augmentation that diversifies sentence phrasing by translating into another language and back.
- **Data synthesis**: Creating data that did not actually exist. GANs, simulation, and so on.
- **GAN**: A neural network architecture in which a generator and a discriminator compete while learning to produce realistic data.
- **Distribution gap**: The risk that the distribution of synthetic or augmented data deviates from the real distribution, degrading real-world performance.
- **Class imbalance**: A state where the number of samples per class is extremely skewed, such as 0.2% fraud.
- **SMOTE**: An oversampling technique that synthesizes new samples by interpolating between a minority-class sample and its nearest neighbors.
- **Class weights**: A setting that puts a larger penalty on minority-class errors in the loss function.
- **Decision threshold**: The cutoff that separates probabilities into positive/negative. The default 0.5 is shifted to match cost.

## 📝 Practice Questions

**Question 1.** On extremely imbalanced fraud detection data with 0.2% positives, which is the least appropriate metric for evaluating model performance?

A) Recall  
B) PR-AUC  
C) Accuracy  
D) F1 score  

**Answer: C**  
Explanation: With imbalance on the order of 1:499, even answering "all negative" yields an accuracy above 99%, which reflects none of the minority-class performance and gives false reassurance. Therefore accuracy is the least appropriate. Recall, PR-AUC, and F1 properly reveal minority-class detection performance, so they suit imbalanced situations.

---

**Question 2.** What is the key characteristic that distinguishes SMOTE from simple duplication (duplicate oversampling)?

A) It generates new synthetic samples by interpolating between a minority-class sample and its nearest neighbors  
B) It randomly deletes the majority class  
C) It only adjusts the weights in the loss function  
D) It fixes the evaluation metric to accuracy  

**Answer: A**  
Explanation: SMOTE synthesizes new points by interpolating between a minority-class sample and its nearest neighbors, so unlike simple duplication it adds diversity and reduces the risk of overfitting. Deleting the majority class (B) is undersampling, adjusting weights (C) is an algorithm-level technique, and D concerns evaluation and has nothing to do with the definition of SMOTE.

---

**Question 3.** Which is the most correct principle that must be followed when applying data augmentation?

A) Raise the transformation strength to the maximum, even if the label changes  
B) Always apply every kind of transformation at the same time  
C) Validate only with augmented data and do not use real data  
D) Transform only within the range that preserves domain meaning and labels  

**Answer: D**  
Explanation: Augmentation must diversify the input while keeping the correct answer (the label). For example, rotating the digit "6" by 180 degrees makes it a "9," breaking the label, and a left-right flip of a medical image can damage the diagnostic meaning, so it must be applied only within the range that preserves domain meaning. A and B can ruin labels, and C violates the validation principle.

---

**Question 4.** When real data is extremely scarce or cannot be used directly because of privacy constraints, which approach for generating new virtual data is the most appropriate?

A) Undersampling  
B) Data synthesis based on GANs or simulation  
C) Decision threshold adjustment  
D) Using the accuracy metric  

**Answer: B**  
Explanation: GANs, simulation, and synthetic tabular data generation go beyond simple transformation of existing data to create new virtual data, so they suit situations of real-data scarcity or privacy constraints. Undersampling (A) is a technique that reduces the majority class, threshold adjustment (C) is an algorithm-level correction, and accuracy (D) is an evaluation metric unrelated to data synthesis.

---

**Question 5.** Before putting a model trained on synthetic data into production, which is the most important risk to consider?

A) The gap between the synthetic data and the real distribution (distribution gap) may degrade real-world performance  
B) Synthetic data is always better than real data, so there is no risk  
C) Synthetic data does not need labels, so evaluation is impossible  
D) Synthetic data has zero storage cost, so it can be generated without limit  

**Answer: A**  
Explanation: If synthetic data cannot perfectly reproduce the real data distribution, there is a distribution gap risk that a model trained on it performs worse in the real world. That is why synthetic data should be used to supplement real data, with validation done on real data. A and D are wrong assertions, and synthetic data also needs labels and validation, so C is wrong as well.

---
