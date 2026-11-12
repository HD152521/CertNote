# Day 5 - Week 7 Synthesis: Deep Learning Summary

## 📌 Key Takeaways

- **Data shape determines architecture**: tabular = tree ensembles, images = CNN, sequences = RNN/LSTM/GRU or Transformer.
- **Task type determines the output layer and loss**: regression = linear + MSE, binary = Sigmoid + BCE, multi-class = Softmax + cross-entropy.
- Deep learning is not always the best choice. **On small structured datasets, XGBoost is usually better.**
- You should be able to pull out the remedy immediately from learning-curve symptoms alone (divergence = lower the learning rate, overfitting = regularization, underfitting = more capacity).
- When you see a clue that data is scarce, the answer is not a bigger architecture but **transfer learning + data augmentation**.

## Week 7 on One Page

Week 7 progressed from neural network basics (Day 1) → CNN (Day 2) → RNN/sequences and Transformer (Day 3) → training techniques and transfer learning (Day 4). Today we tie this flow into a single decision map and build a mental framework for narrowing down answers quickly when you meet a deep learning question on the exam.

```text
Choose the architecture by data shape
  ├─ Structured/tabular data      → Usually XGBoost first, DNN second
  ├─ Images/video                 → CNN (ResNet/SSD/U-Net)
  ├─ Sequences (time series, text) → RNN/LSTM/GRU, or Transformer
  └─ Large-scale language/generation → Transformer (BERT/GPT/T5)

Choose the output and loss by task type
  ├─ Regression            → Linear output + MSE/MAE
  ├─ Binary classification → Sigmoid + BCE
  └─ Multi-class classification → Softmax + categorical cross-entropy
```

```text
                 ┌──────────────── Week 7 Overall Map ──────────────┐
                 │                                                  │
  [Day 1 Basics] Perceptron → Activation → Loss → Backprop → Gradient descent
                 │              │                       │
                 │              │ (extend to images)    │ (extend to order)
                 ▼              ▼                       ▼
  [Day 2 CNN]   Convolution/Pooling   [Day 3 Sequences] RNN → LSTM/GRU → seq2seq
                 Backbone + head                         → Attention → Transformer
                 │                                      │
                 └──────────────┬───────────────────────┘
                                ▼
  [Day 4 Training] Optimizer · Learning rate · Regularization · Transfer learning · SageMaker integration
                                ▼
                  Whatever the architecture, "how to run training" is common
```

Deep learning is not always the answer. On structured tabular data, when data is limited and training time is short, tree ensembles such as XGBoost often perform better. Deep learning shines with unstructured data (images, text, audio) and when data is abundant. On the exam, a "small structured dataset" passage asks for the restraint not to push a neural network where it does not belong.

## Data Shape → Architecture Decision Table

| Data shape | First choice | Alternative | When to avoid this choice |
|---|---|---|---|
| Structured (tabular), small | Tree ensembles such as XGBoost | Shallow MLP | Applying it to image or sequence data |
| Structured (tabular), large with complex interactions | Tree ensemble | DNN | When interpretability is the top priority |
| Image classification | CNN (ResNet, etc.) | Transfer learning + augmentation | Training from scratch with only a few dozen training images |
| Image location/count | Object detection (SSD/YOLO) | — | When pixel-level precision is needed |
| Image pixel level | Semantic segmentation (U-Net/FCN) | — | When only a simple category is needed |
| Many time series | DeepAR / Amazon Forecast | LSTM | When there is only a single, very short time series |
| Text classification (traditional) | BlazingText | Comprehend (managed) | Generation tasks where word order is key |
| Text generation/summarization/QA | Transformer (JumpStart/Bedrock) | — | When simple keyword extraction is enough |

## Task Type → Output Layer · Loss · Metric

| Task | Output layer | Loss | Metrics usually watched |
|---|---|---|---|
| Regression | Linear (no activation) | MSE / MAE | RMSE, MAE |
| Binary classification (balanced) | Sigmoid, 1 node | BCE | Accuracy, F1, ROC-AUC |
| Binary classification (imbalanced) | Sigmoid, 1 node | BCE (or Focal family) | **Recall, PR-AUC** |
| Multi-class (mutually exclusive) | Softmax, K nodes | Categorical cross-entropy | Accuracy, macro F1 |
| Multi-label | Sigmoid, K nodes | Per-label BCE | Per-label precision/recall |

> ⚠️ **Trap**: On imbalanced data, accuracy is a trap. If positives are 1%, predicting "all negative" already gives 99%. When the passage says "defects are rare" or "fraud is 0.x% of the total," discard the accuracy option first and look at recall and PR-AUC.

## Recap of Days 1–4

### Day 1 — Neural Network Basics

- Perceptron = weighted sum + bias + activation. A single perceptron can only separate data linearly.
- Without a nonlinear activation, stacking depth is no different from a linear model.
- Default hidden-layer activation = **ReLU** (mitigates vanishing gradients; watch out for dying ReLU).
- Output activation: binary = Sigmoid, multi-class = Softmax, regression = linear.
- Forward pass (prediction) → loss (error) → backpropagation (gradients) → gradient descent (update).
- Epoch, batch, iteration: iterations per epoch = number of samples ÷ batch size.

### Day 2 — CNN

- Three core principles: local receptive fields, weight sharing, translation invariance.
- Convolution = pattern extraction, pooling = downsampling (no learnable parameters).
- ResNet's residual connection = the solution for training very deep networks.
- Task distinction: classification (label) / detection (box + class) / segmentation (pixel).
- SageMaker: Image Classification, Object Detection (SSD), Semantic Segmentation; labeling with Ground Truth.

### Day 3 — RNN and Sequences

- An RNN processes a sequence through a hidden state but suffers from long-term dependency and gradient problems.
- LSTM (gates + cell state) / GRU (simpler, faster) mitigate this.
- seq2seq (encoder-decoder) + attention removes the information bottleneck.
- Transformer = self-attention, parallel, long-range, the modern NLP standard (BERT/GPT/T5).
- AWS: time series = DeepAR/Forecast, text = BlazingText/Comprehend, generation = JumpStart/Bedrock.

### Day 4 — Training Techniques and Transfer Learning

- Loss: regression = MSE, classification = cross-entropy.
- Default optimizer = Adam; simple and robust = SGD (+ Momentum).
- The learning rate comes first: too large diverges, too small is slow → scheduling and warmup.
- Overfitting prevention: dropout, weight decay, batch normalization, augmentation, early stopping.
- Transfer learning: little data → freeze (feature extraction), more data → fine-tune with a low learning rate.
- SageMaker: Script Mode, DLC, distributed training, and JumpStart to integrate TensorFlow/PyTorch.

## Commonly Confused Pairs

| Pair | Decisive difference | Which to pick |
|---|---|---|
| **CNN vs RNN** | Spatial structure vs sequential structure | Images = CNN, time series/text = RNN family |
| **LSTM vs GRU** | 3 gates + cell state vs 2 gates | Long-term memory matters and resources are ample = LSTM, lightweight = GRU |
| **RNN vs Transformer** | Sequential processing vs fully parallel processing | Parallel training/long-range dependencies = Transformer |
| **Batch normalization vs dropout** | Training stability/speed vs overfitting suppression | Unstable = BatchNorm, overfitting = Dropout |
| **Transfer learning vs training from scratch** | Reusing prior knowledge vs random initialization | Little data = transfer learning; very large data and a different domain = consider scratch |
| **Feature extraction vs fine-tuning** | Frozen backbone vs training together at a low learning rate | Tiny data = freeze, a moderate amount = fine-tune |
| **Adam vs SGD** | Adaptive step size vs fixed rate | Default starting point = Adam, final fine-tuning of large models = SGD |
| **Classification vs detection vs segmentation** | Label vs box vs pixel | The passage's "what / where and how many / pixel level" |
| **Attention vs self-attention** | Decoder referring to encoder vs referring within the same sequence | Improving seq2seq = attention, foundation of Transformer = self-attention |
| **MSE vs cross-entropy** | For regression vs for probabilistic classification | MSE for classification is the wrong answer |

Most pairs in this table are trade-offs of "what do you gain and what do you give up." GRU gives up a little expressiveness to gain speed, freezing gives up flexibility to gain overfitting defense, and Adam gives up a bit of final generalization to gain tuning convenience. Exam passages always drop clues about which side's cost is bigger — data volume, time constraints, and resource limits are those clues.

## Symptom → Remedy Cheat Sheet

The exam presents learning curves or symptoms and asks for the remedy. You need to pair symptom and remedy instantly.

| Symptom | Diagnosis | Remedy |
|---------|-----------|--------|
| Loss diverges / NaN | Learning rate too high | Lower the learning rate |
| Very slow convergence | Learning rate too low | Raise the learning rate / scheduling, Adam |
| Training loss ↓, validation loss ↑ | Overfitting | Dropout, regularization, augmentation, early stopping |
| Both losses high | Underfitting | Increase model capacity, train longer, add features |
| OOM (out of memory) | Batch/model too large | Reduce batch size, model parallelism |
| Not enough data | Failure to generalize | Transfer learning, data augmentation |
| Deep network will not train | Vanishing gradients | ResNet (residual), batch normalization, ReLU |
| Loss suddenly explodes | Exploding gradients | Gradient clipping, reduce learning rate |
| Adding GPUs does not speed it up | Sequential structure of RNN | Switch to the Transformer family |
| Hidden-layer outputs stay at 0 | Dying ReLU | Replace with Leaky ReLU, etc. |
| Too many hyperparameter combinations | Limits of manual search | Automatic Model Tuning |

SageMaker Automatic Model Tuning (Bayesian optimization) automatically searches hyperparameters such as learning rate, batch size, number of layers, and dropout rate. Monitor the training loss curve with CloudWatch, and turning on early stopping saves time and cost. The phrase "efficiently find the optimal hyperparameters" is a signal pointing to AMT.

## Passage Clue → Answer Mapping

| If the passage says | It points to |
|---|---|
| "Thousands of rows of tabular data, limited training time" | Tree ensembles such as XGBoost |
| "Only a few hundred training images" | Transfer learning + data augmentation |
| "Need to know the location and the count" | Object detection |
| "Distinguish regions at the pixel level" | Semantic segmentation |
| "Demand for many products at once" | DeepAR / Forecast |
| "Quickly, without ML specialists" | Managed AI services (Comprehend, etc.) |
| "Making the network deeper made training worse" | Residual (skip) connections |
| "Defects/fraud are under 1% of the total" | Recall · PR-AUC (not accuracy) |
| "Efficiently find the optimal hyperparameters" | Automatic Model Tuning |
| "Run my own PyTorch script in a managed way" | Script Mode |

## Frequent Wrong-Answer Patterns

| Wrong-answer pattern | Why it is wrong | Correct thinking |
|---|---|---|
| "The newest architecture is the best" | Ignores data and time constraints | With small structured data, use a tree ensemble |
| "Data is scarce, so let's enlarge the model" | Pushes toward more overfitting | Transfer learning + augmentation first |
| "Accuracy is low, so let's add epochs" | It gets worse if the problem is overfitting | Distinguish training/validation curves first |
| "MSE can be used for classification too" | Slow and unstable learning | Cross-entropy is the standard |
| "Pooling increases expressiveness" | It has no learnable parameters | Expressiveness comes from convolution/Dense |
| "Adding GPUs makes an RNN faster" | The sequential structure is the bottleneck | If you need parallelism, use a Transformer |
| "Transfer learning retrains everything" | Destroys prior knowledge | Freeze or use a low learning rate |
| "High accuracy means a good model" | Meaningless under imbalance | Re-check with recall · PR-AUC |

> ⚠️ **Trap**: In a passage with several overlapping constraints, the answer is **not the flashiest technology but the choice that satisfies all constraints at once**. When "little data + no time + a similar domain" appear together, the answer is not a large model trained from scratch but a frozen pretrained backbone.

## AWS Services Roundup

| Situation | Choice |
|---|---|
| Training image classification/detection/segmentation | SageMaker built-in (Image Classification / Object Detection / Semantic Segmentation) |
| Labeled data is needed | SageMaker Ground Truth |
| Time series forecasting | DeepAR (built-in) or Amazon Forecast (managed) |
| Text embedding/classification | BlazingText |
| Entity/sentiment extraction without training | Amazon Comprehend |
| Deploying/fine-tuning pretrained models | SageMaker JumpStart |
| Using large language models | Amazon Bedrock |
| Training your own TF/PyTorch script | Script Mode + Deep Learning Containers |
| Automatic hyperparameter search | Automatic Model Tuning |
| Distributing large-scale training | Data parallel / model parallel distributed training |

## Self-Check

Having finished Week 7, you should be able to answer the following with confidence.

| Check item | Criterion |
|---|---|
| Can you pick the architecture from the data shape alone? | Images = CNN, sequences = RNN/Transformer, tables = trees |
| Can you pair the output activation and loss with the task type? | Binary = Sigmoid + BCE, multi-class = Softmax + cross-entropy, regression = linear + MSE |
| Can you diagnose learning-curve symptoms? | Decide whether it is learning-rate adjustment / regularization / transfer learning |
| Can you tell the SageMaker options apart? | The boundaries between built-in · JumpStart · Script Mode |
| Do you know when not to use deep learning? | Tree ensembles on small structured data |

## 📖 Glossary

- **Inductive bias**: An assumption built into the model architecture itself. The translation invariance of a CNN is the classic example.
- **Backbone / head**: The front part that extracts features / the back part that produces the final prediction. Transfer learning reuses the backbone.
- **Freeze**: Fixing pretrained weights so they are not updated. The default strategy when data is very scarce.
- **Fine-tuning**: Retraining pretrained weights together at a low learning rate.
- **Vanishing / exploding gradients**: Gradients disappearing to zero or diverging during backpropagation. The remedies differ.
- **Residual (skip) connection**: A structure that adds the input directly to the output, creating a shortcut for gradients. The key to very deep training.
- **Self-attention**: A mechanism in which every pair of positions within a single sequence refers to each other. The foundation of the Transformer.
- **Global model**: An approach that trains multiple time series together in one model. DeepAR is an example.
- **Automatic Model Tuning**: A SageMaker feature that automatically searches hyperparameters using Bayesian optimization.
- **Script Mode**: A way to run your own TensorFlow/PyTorch script in a SageMaker training container.

## 📝 Practice Questions

**Question 1.** You are doing binary classification on 5,000 rows of tabular structured data. Training time and data are limited. What is the most reasonable first approach to try?

A) A tree ensemble such as XGBoost  
B) Train a very deep CNN from scratch  
C) Fine-tune a pretrained Transformer model  
D) LSTM seq2seq  

**Answer: A**  
Explanation: For structured tabular data, small volume, and short time, a tree ensemble (XGBoost) is usually the most efficient and powerful. A CNN (B) is for images, a Transformer (C) is for large-scale text, and an LSTM (D) is for sequences, so none fit the task.

---

**Question 2.** Both the training loss and the validation loss **plateau at high values**. What is the most appropriate diagnosis and response?

A) Overfitting - add dropout  
B) Underfitting - increase model capacity, or train longer/add features  
C) Learning rate too high - set the learning rate to 0  
D) Data leakage - delete the data  

**Answer: B**  
Explanation: If both losses are high, the model has not learned the data sufficiently, which is underfitting. Increase the model size, train longer, or add features. The overfitting remedy (A) is for the opposite situation, a learning rate of 0 (C) stops training, and deleting data (D) is inappropriate.

---

**Question 3.** You need to **segment building regions pixel by pixel in satellite images**, not handwriting. Which combination of task and service is MOST suitable?

A) Image classification - Image Classification  
B) Object detection - Object Detection  
C) Semantic segmentation - Semantic Segmentation  
D) Topic modeling - LDA  

**Answer: C**  
Explanation: Assigning a class to each pixel is semantic segmentation, and SageMaker Semantic Segmentation is suitable. Classification (A) gives one label per image, detection (B) gives bounding boxes, and LDA (D) discovers topics in text.

---

**Question 4.** You want to automatically and efficiently search hyperparameters (learning rate, batch size, dropout). Which SageMaker feature is appropriate?

A) Ground Truth  
B) Feature Store  
C) Model Monitor  
D) Automatic Model Tuning (Bayesian optimization)  

**Answer: D**  
Explanation: SageMaker Automatic Model Tuning efficiently searches hyperparameters using Bayesian optimization. Ground Truth (A) is for labeling, Feature Store (B) is for storing features, and Model Monitor (C) is for monitoring drift in production.

---

**Question 5.** While training a very deep neural network, training actually gets worse as layers get deeper. What is the MOST effective structural remedy?

A) Introduce residual (skip) connections (ResNet family)  
B) Remove all activation functions  
C) Fix the batch size at 1  
D) Change the output layer to regression  

**Answer: A**  
Explanation: Performance degradation caused by vanishing gradients in deep networks is mitigated by residual connections (ResNet), which let gradients flow through shortcuts. Removing activations (B) destroys expressive power, and a batch size of 1 (C) and changing the output (D) are not solutions to the depth problem.

---
