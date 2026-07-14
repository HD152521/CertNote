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

## 📝 연습 문제

**문제 1.** 양성 0.2%로 극도로 불균형한 사기 탐지 데이터에서, 모델 성능을 평가하는 지표로 가장 부적절한 것은?

A) 재현율(Recall)  
B) PR-AUC  
C) 정확도(Accuracy)  
D) F1 점수  

**정답: C**  
해설: 1:499 수준의 불균형에서는 "전부 음성"이라 답해도 정확도가 99% 이상으로 높게 나와 소수 클래스 성능을 전혀 반영하지 못하는 거짓 안심을 준다. 따라서 정확도가 가장 부적절하다. 재현율·PR-AUC·F1은 소수 클래스 검출 성능을 적절히 드러내므로 불균형 상황에 알맞다.

---

**문제 2.** SMOTE 기법이 단순 복제(중복 오버샘플링)와 구별되는 핵심 특징은?

A) 소수 클래스 샘플과 최근접 이웃 사이를 보간해 새로운 합성 샘플을 생성한다  
B) 다수 클래스를 무작위로 삭제한다  
C) 손실 함수의 가중치만 조정한다  
D) 평가 지표를 정확도로 고정한다  

**정답: A**  
해설: SMOTE는 소수 클래스 샘플과 그 최근접 이웃 사이를 보간(interpolation)해 새로운 점을 합성하므로, 단순 복제와 달리 다양성을 더해 과적합 위험을 줄인다. 다수 클래스 삭제(B)는 언더샘플링이고, 가중치 조정(C)은 알고리즘 수준 기법이며, D는 평가에 관한 것으로 SMOTE의 정의와 무관하다.

---

**문제 3.** 데이터 증강을 적용할 때 반드시 지켜야 하는 원칙으로 가장 옳은 것은?

A) 변형 강도를 최대로 높여 레이블이 바뀌어도 무방하다  
B) 항상 모든 종류의 변형을 동시에 적용한다  
C) 증강 데이터로만 검증하고 실데이터는 쓰지 않는다  
D) 도메인 의미와 레이블을 보존하는 범위 안에서 변형해야 한다  

**정답: D**  
해설: 증강은 입력은 다양화하되 정답(레이블)은 유지해야 한다. 예컨대 숫자 "6"을 180도 회전하면 "9"가 되어 레이블이 깨지고, 의료 영상 좌우 반전은 진단 의미를 훼손할 수 있으므로 도메인 의미를 보존하는 범위에서만 적용해야 한다. A·D는 레이블을 망가뜨릴 수 있고, C는 검증 원칙에 어긋난다.

---

**문제 4.** 실데이터가 극히 부족하거나 프라이버시 제약으로 실데이터를 직접 쓸 수 없을 때, 새로운 가상 데이터를 생성하는 접근으로 가장 적절한 것은?

A) 언더샘플링  
B) GAN이나 시뮬레이션 기반 데이터 합성  
C) 결정 임계값 조정  
D) 정확도 지표 사용  

**정답: B**  
해설: GAN, 시뮬레이션, 합성 정형 데이터 생성은 기존 데이터의 단순 변형을 넘어 새로운 가상 데이터를 만들어 내므로 실데이터 부족·프라이버시 제약 상황에 적합하다. 언더샘플링(A)은 다수 클래스를 줄이는 기법, 임계값 조정(C)은 알고리즘 수준 보정, 정확도(D)는 평가 지표로 데이터 합성과 무관하다.

---

**문제 5.** 합성 데이터로 학습한 모델을 운영에 투입하기 전 가장 중요하게 고려할 위험은?

A) 합성 데이터와 실제 분포 간 갭(distribution gap)으로 실세계 성능이 떨어질 수 있다  
B) 합성 데이터는 항상 실데이터보다 우수하므로 위험이 없다  
C) 합성 데이터는 레이블이 필요 없으므로 평가가 불가능하다  
D) 합성 데이터는 저장 비용이 0이라 무한 생성해도 된다  

**정답: A**  
해설: 합성 데이터가 실제 데이터 분포를 완벽히 재현하지 못하면 거기서 학습한 모델이 실세계에서 성능이 떨어지는 distribution gap 위험이 있다. 그래서 합성 데이터는 실데이터를 보완하는 용도로 쓰고 검증은 실데이터로 해야 한다. A·D는 잘못된 단정이고, 합성 데이터도 레이블·검증이 필요하므로 C도 틀렸다.

---
