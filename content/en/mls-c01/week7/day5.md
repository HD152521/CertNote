# Day 5 - Week 7 Synthesis: Deep Learning Summary

Week 7 progressed from neural network basics (Day 1) → CNN (Day 2) → RNN/sequences and Transformer (Day 3) → learning techniques and transfer learning (Day 4). Today we consolidate this progression into a single decision map and establish a thought framework for quickly narrowing down answers when encountering deep learning questions in the exam.

## Deep Learning Map at a Glance

```text
Select architecture by data type
  ├─ Structured/tabular data    → Usually XGBoost first, DNN secondary
  ├─ Images/video               → CNN (ResNet/SSD/U-Net)
  ├─ Sequences (time series, text) → RNN/LSTM/GRU, or Transformer
  └─ Large-scale language/generation → Transformer (BERT/GPT/T5)

Select output and loss by task type
  ├─ Regression    → Linear output + MSE/MAE
  ├─ Binary classification → Sigmoid + BCE
  └─ Multi-class classification → Softmax + categorical cross-entropy
```

> 💡 **Related Theory**: Deep learning isn't always the answer. On structured tabular data, tree ensembles like XGBoost often outperform with limited data and short training time. Deep learning shines with unstructured data (images, text, speech) and abundant data. Exam questions with "small tabular data" require the caution not to force neural networks.

## Day 1 Review: Neural Network Basics

- Perceptron = weighted sum + bias + activation. Single perceptron only separates linearly.
- Without nonlinear activation, stacking depth equals a linear model.
- Default hidden activation = **ReLU** (mitigates gradient vanishing, watch for dead ReLU).
- Output activation: binary=Sigmoid, multi=Softmax, regression=linear.
- Forward pass (prediction) → loss (error) → backprop (gradients) → gradient descent (update).
- Epochs/batches/iterations: iterations/epoch = data size / batch size.

## Day 2 Review: CNN

- Three core principles: local receptive fields, weight sharing, translation invariance.
- Convolution = pattern extraction, pooling = downsampling (no learnable parameters).
- ResNet's residual connections = solution for very deep learning.
- Task distinction: classification (labels) / detection (boxes+classes) / segmentation (pixels).
- SageMaker: Image Classification, Object Detection (SSD), Semantic Segmentation; labeling with Ground Truth.

## Day 3 Review: RNNs and Sequences

- RNN processes sequences via hidden state; suffers from long-term dependency and gradient issues.
- LSTM (gates+cell state) / GRU (simpler, faster) mitigate these.
- seq2seq (encoder-decoder) + attention resolves information bottleneck.
- Transformer = self-attention, parallel and long-range, modern NLP standard (BERT/GPT/T5).
- AWS: time series=DeepAR/Forecast, text=BlazingText/Comprehend, generation=JumpStart/Bedrock.

## Day 4 Review: Learning Techniques and Transfer Learning

- Loss: regression=MSE, classification=cross-entropy.
- Optimizer default=Adam, simple and robust=SGD (with Momentum).
- Learning rate is paramount: too high diverges, too low converges slowly → scheduling, warmup.
- Prevent overfitting: dropout, weight decay, batch normalization, augmentation, early stopping.
- Transfer learning: little data→freeze (feature extraction), much data→low learning rate finetuning.
- SageMaker: Script Mode, DLC, distributed training, JumpStart for TensorFlow/PyTorch integration.

## Symptom → Prescription Cheat Sheet

Exams present learning curves/symptoms and ask for remedies. Map them quickly.

| Symptom | Diagnosis | Remedy |
|---------|-----------|--------|
| Loss diverges/NaN | Learning rate too high | Lower learning rate |
| Convergence very slow | Learning rate too low | Raise learning rate/scheduling, Adam |
| Training loss down, validation up | Overfitting | Dropout, regularization, augmentation, early stopping |
| Both losses high | Underfitting | Increase model capacity, train longer, add features |
| OOM (out of memory) | Batch/model too large | Reduce batch size, model parallelism |
| Insufficient data | Poor generalization | Transfer learning, augmentation |
| Deep network fails to learn | Gradient vanishing | ResNet (residual), batch normalization, ReLU |

> 💡 **Related Theory**: SageMaker Automatic Model Tuning (Bayesian optimization) automatically searches hyperparameters like learning rate, batch size, layer count, dropout rate. Monitor training loss curves via CloudWatch; enable early stopping to save time and cost. Exam phrases like "find optimal hyperparameters efficiently" signal AMT as the answer.

## Closing Checklist

After Week 7, you should confidently answer:

- Can you pick architecture (CNN/RNN-Transformer/trees) by just seeing data type (images/sequences/tabular)?
- Can you pair output activation and loss to task type?
- Can you diagnose learning curve symptoms and decide whether to adjust learning rate, regularization, or transfer learning?
- Can you select SageMaker built-ins, JumpStart, or Script Mode appropriately?

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
