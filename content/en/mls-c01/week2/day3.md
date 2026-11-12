# Day 3 - Data Augmentation and Synthesis: Addressing Insufficient and Imbalanced Data

Building a good model requires sufficient and balanced data. However, reality is often different. Rare disease diagnostic data has very few positive samples, fraudulent transactions represent only 0.1% of the total, and certain classes of images may have only a handful of examples. If this situation is left unchanged, the model will only match the majority class well and miss the important minority class.

Today, we cover the concepts of **data augmentation** and **synthesis**, as well as techniques for handling **imbalanced data** (such as SMOTE). The MLS-C01 exam asks not so much about code implementation, but rather "which technique is appropriate for which situation."

## What is Data Augmentation?

Data augmentation is a technique that **transforms existing data to create new training samples**. Without collecting new data, it increases the diversity and volume of a dataset, improving the model's generalization performance and reducing overfitting.

> 💡 **Related Theory**: The core principle of augmentation is "transformation that does not change the label." Flipping a cat photo horizontally still leaves it a cat. In other words, only transformations that diversify the input while preserving the correct answer (label) should be applied. Through this, the model learns invariance—that "the essence is the same even if position, angle, or brightness differ."

### Image Augmentation

Images are the most active domain for augmentation. Representative transformations include:

- **Geometric transformations**: Horizontal/vertical flips, rotation, translation, scaling, cropping
- **Color and brightness transformations**: Adjusting brightness, contrast, saturation; color jitter
- **Noise and masking**: Adding Gaussian noise, masking regions (Cutout), mixing two images (Mixup/CutMix)

```python
# Image augmentation (conceptual example — torchvision transforms)
from torchvision import transforms

augment = transforms.Compose([
    transforms.RandomHorizontalFlip(p=0.5),   # horizontal flip
    transforms.RandomRotation(degrees=15),    # ±15 degree rotation
    transforms.ColorJitter(brightness=0.2,    # brightness and contrast changes
                           contrast=0.2),
    transforms.RandomResizedCrop(224),        # random crop then resize
])
```

> ⚠️ **Pitfall**: Indiscriminate augmentation can corrupt labels. For example, in digit recognition, rotating "6" by 180 degrees becomes "9," corrupting the label. Additionally, in medical imaging, horizontal flipping can swap left/right organs and compromise diagnostic meaning. Augmentation should be applied **only within the bounds of preserving domain meaning**.

### Text Augmentation

Text is more challenging than images (changing a single word can change meaning). Still, commonly used techniques include:

- **Synonym replacement**: Replacing some words with synonyms
- **Back-translation**: Translating Korean → English → Korean to diversify expressions
- **Random insertion, deletion, and swap**: Adding, removing, or rearranging some words
- **Embedding-based substitution and contextual model usage**: Creating natural variations using pre-trained language models

## Data Synthesis — Creating Data That Doesn't Exist

If augmentation is "transformation of existing data," synthesis is closer to **generating completely new virtual data**. It is used when real data is extremely scarce or when real data cannot be used due to privacy concerns.

- **GAN (Generative Adversarial Network)**: A generator and discriminator compete to produce realistic images.
- **Simulation and synthetic datasets**: Generating rare or dangerous scenarios via simulation, as in autonomous driving.
- **Synthetic tabular data**: Generating fake table data without personal information by mimicking statistical distributions (privacy protection).

> 💡 **Related Theory**: Synthetic data is powerful but carries the risk of "distribution gap." If synthetic data fails to perfectly reproduce the actual data distribution, models trained on it will show degraded performance in the real world. Therefore, synthetic data is typically used to **supplement** real data, and validation must always be done on real data.

## Handling Imbalanced Data

Class imbalance is a recurring topic in ML exams. In fraud detection, where positive:negative = 1:999, a model that answers "all negative" achieves 99.9% accuracy—but it's a useless model that catches no fraud.

The response strategy has three major approaches.

### 1. Data Level — Resampling

- **Oversampling**: Duplicating and augmenting minority class samples to increase them.
- **Undersampling**: Reducing majority class samples to balance (risks data loss).
- **SMOTE (Synthetic Minority Over-sampling Technique)**: Interpolating between minority class samples to **generate new synthetic samples**. Unlike simple duplication, it adds diversity.

```python
# Synthetic minority oversampling with SMOTE (conceptual example — imbalanced-learn)
from imblearn.over_sampling import SMOTE

smote = SMOTE(random_state=42)
X_balanced, y_balanced = smote.fit_resample(X_train, y_train)
# Synthetic samples interpolated between minority class samples are added, balancing class ratios
```

> 💡 **Related Theory**: Unlike simple duplication (which risks overfitting from duplication), SMOTE **creates new points** along the line between existing minority samples and their nearest neighbors. This helps the model learn a more generalized decision boundary. However, caution is needed as it can create incorrect synthetic samples in noisy or ambiguous class boundary data.

### 2. Algorithm Level — Weights and Thresholds

- **Class weights**: Applying larger penalties for minority class errors in the loss function.
- **Decision threshold adjustment**: Moving the threshold from the default 0.5 to better capture the minority class.

### 3. Evaluation Metric Level

> ⚠️ **Pitfall**: With imbalanced data, **accuracy provides false reassurance**. 99.9% accuracy on 1:999 data is essentially meaningless. Instead, metrics like **precision, recall, F1, PR-AUC, ROC-AUC** should be used to properly evaluate minority class performance. Especially for fraud and disease where the minority class is critical, **recall** and **PR-AUC** are key.

## Application in AWS Context

- **SageMaker Processing / Data Wrangler**: Execute resampling and augmentation logic during preprocessing.
- **Weight options in SageMaker built-in algorithms**: For example, using XGBoost's `scale_pos_weight` to correct imbalance.
- **GAN training**: Train generative models through SageMaker training jobs to create synthetic data.

> 🎯 **Scenario**: "Credit card fraud detection data is extremely imbalanced at 0.2% positive rate. The model barely catches fraud." → (1) Correct imbalance with oversampling like SMOTE or class weights, (2) evaluate using recall and PR-AUC instead of accuracy, and (3) adjust the decision threshold toward fraud detection.

## Summary

Today we learned how to handle situations with insufficient or imbalanced data. **Augmentation diversifies existing data through label-preserving transformations** (image flipping/rotation, text back-translation, etc.), while **synthesis generates new virtual data** (GANs, simulation, synthetic tabular data). For imbalanced data, use **resampling (SMOTE), class weights, and threshold adjustment**, but evaluate using **recall, F1, and PR-AUC** rather than accuracy. Remember the principle that validation of synthesized and augmented data must always be done on real data.

Tomorrow we will cover **how to efficiently store and read large-scale data during training** (Pipe/File mode, FSx for Lustre, sharding).

---

## 📝 Practice Questions

**Question 1.** In fraud detection data that is extremely imbalanced with 0.2% positives, which metric is MOST inappropriate for evaluating model performance?

A) Recall  
B) PR-AUC  
C) Accuracy  
D) F1 score  

**Answer: C**  
Explanation: With an imbalance on the order of 1:499, even answering "all negative" yields accuracy above 99%, giving false reassurance that does not reflect minority-class performance at all. Therefore accuracy is the most inappropriate. Recall, PR-AUC, and F1 appropriately reveal minority-class detection performance and are therefore suitable for imbalanced situations.

---

**Question 2.** What is the key characteristic that distinguishes the SMOTE technique from simple duplication (duplicate oversampling)?

A) It generates new synthetic samples by interpolating between a minority-class sample and its nearest neighbors  
B) It randomly deletes majority-class samples  
C) It only adjusts the weights of the loss function  
D) It fixes the evaluation metric to accuracy  

**Answer: A**  
Explanation: SMOTE synthesizes new points by interpolating between a minority-class sample and its nearest neighbors, so unlike simple duplication it adds diversity and reduces the risk of overfitting. Deleting majority-class samples (B) is undersampling, weight adjustment (C) is an algorithm-level technique, and D concerns evaluation and is unrelated to the definition of SMOTE.

---

**Question 3.** Which is the most correct principle that must be followed when applying data augmentation?

A) Maximize the transformation strength, even if the label changes  
B) Always apply all kinds of transformations at the same time  
C) Validate only with augmented data and do not use real data  
D) Transform only within the range that preserves the domain meaning and the label  

**Answer: D**  
Explanation: Augmentation must diversify the input while keeping the answer (label) intact. For example, rotating the digit "6" by 180 degrees turns it into "9", breaking the label, and horizontally flipping a medical image can corrupt its diagnostic meaning, so augmentation must be applied only within a range that preserves the domain meaning. A and D can ruin the label, and C violates validation principles.

---

**Question 4.** When real data is extremely scarce or cannot be used directly because of privacy constraints, which approach to generating new virtual data is MOST appropriate?

A) Undersampling  
B) GAN- or simulation-based data synthesis  
C) Decision threshold adjustment  
D) Using the accuracy metric  

**Answer: B**  
Explanation: GANs, simulation, and synthetic structured data generation go beyond simple transformations of existing data to create new virtual data, so they suit situations of real-data scarcity or privacy constraints. Undersampling (A) is a technique that reduces the majority class, threshold adjustment (C) is an algorithm-level correction, and accuracy (D) is an evaluation metric unrelated to data synthesis.

---

**Question 5.** What is the most important risk to consider before putting a model trained on synthetic data into production?

A) A gap between the synthetic data and the real distribution (distribution gap) can degrade real-world performance  
B) Synthetic data is always better than real data, so there is no risk  
C) Synthetic data does not need labels, so evaluation is impossible  
D) Synthetic data has zero storage cost, so it can be generated without limit  

**Answer: A**  
Explanation: If synthetic data cannot perfectly reproduce the real data distribution, there is a distribution gap risk that a model trained on it performs worse in the real world. Therefore synthetic data should be used to supplement real data, and validation should be done with real data. A and D are incorrect assertions, and synthetic data also needs labels and validation, so C is also wrong.

---
