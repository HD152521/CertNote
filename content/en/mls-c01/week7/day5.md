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

## 📝 연습 문제

**문제 1.** 표 형태의 정형 데이터 5,000행으로 이진 분류를 한다. 학습 시간과 데이터가 제한적이다. 1차로 시도할 가장 합리적인 접근은?

A) XGBoost 같은 트리 앙상블  
B) 매우 깊은 CNN을 처음부터 학습  
C) Transformer 사전학습 모델 파인튜닝  
D) LSTM seq2seq  

**정답: A**  
해설: 정형 표 데이터·적은 양·짧은 시간에는 트리 앙상블(XGBoost)이 보통 가장 효율적이고 강력하다. CNN(B)은 이미지용, Transformer(C)는 대규모 텍스트, LSTM(D)은 시퀀스용으로 과제와 맞지 않는다.

---

**문제 2.** 학습 손실과 검증 손실이 **둘 다 높은 채로 정체**된다. 가장 적절한 진단과 대응은?

A) 과적합 — 드롭아웃 추가  
B) 과소적합 — 모델 용량을 키우거나 더 오래/특성 보강해 학습  
C) 학습률 과대 — 학습률을 0으로  
D) 데이터 누수 — 데이터를 삭제  

**정답: B**  
해설: 두 손실이 모두 높으면 모델이 데이터를 충분히 학습하지 못한 과소적합이다. 모델을 키우거나 더 학습/특성을 보강한다. 과적합 처방(A)은 반대 상황, 학습률 0(C)은 학습 정지, 데이터 삭제(D)는 부적절하다.

---

**문제 3.** 손글씨가 아닌 **위성 이미지에서 건물 영역을 픽셀 단위로 구분**해야 한다. 가장 적합한 과제·서비스 조합은?

A) 이미지 분류 — Image Classification  
B) 객체 탐지 — Object Detection  
C) 시맨틱 세그멘테이션 — Semantic Segmentation  
D) 토픽 모델링 — LDA  

**정답: C**  
해설: 픽셀 단위로 클래스를 부여하는 것은 시맨틱 세그멘테이션이며 SageMaker Semantic Segmentation이 적합하다. 분류(A)는 이미지당 레이블, 탐지(B)는 바운딩 박스, LDA(D)는 텍스트 주제 발견이다.

---

**문제 4.** 하이퍼파라미터(학습률·배치·드롭아웃)를 효율적으로 자동 탐색하려 한다. SageMaker에서 적절한 기능은?

A) Ground Truth  
B) Feature Store  
C) Model Monitor  
D) Automatic Model Tuning(베이지안 최적화)  

**정답: D**  
해설: SageMaker Automatic Model Tuning은 베이지안 최적화로 하이퍼파라미터를 효율적으로 탐색한다. Ground Truth(A)는 라벨링, Feature Store(B)는 특성 저장, Model Monitor(C)는 운영 중 드리프트 감시용이다.

---

**문제 5.** 매우 깊은 신경망을 학습하는데 층이 깊어질수록 오히려 학습이 나빠진다. 가장 효과적인 구조적 처방은?

A) 잔차(skip) 연결을 도입(ResNet 계열)  
B) 활성화 함수를 모두 제거  
C) 배치 크기를 1로 고정  
D) 출력층을 회귀로 변경  

**정답: A**  
해설: 깊은 망의 기울기 소실로 인한 성능 저하는 잔차 연결(ResNet)로 기울기가 지름길로 흐르게 해 완화한다. 활성화 제거(B)는 표현력 상실, 배치 1(C)·출력 변경(D)은 깊이 문제의 해법이 아니다.

---
