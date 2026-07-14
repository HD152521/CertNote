# Day 1 - Neural Network Foundations: Perceptron to Backpropagation

Week 7 covers the second pillar of Domain 3 (Modeling): **deep learning**. Unstructured data (images, text, audio) and complex nonlinear relationships are deep learning's domain. MLS-C01 doesn't probe framework-level coding but presumes conceptual understanding of **perceptron, activation functions, loss, backpropagation, hyperparameters**. Today we nail the big picture of how neural nets turn input into prediction, and how they learn.

## Perceptron: Neural Network's Minimal Unit

A perceptron takes weighted input, adds bias, and passes through activation function.

```text
z = w1*x1 + w2*x2 + ... + wn*xn + b
a = f(z)        # f = activation function
```

- **w (weights)**: Importance of each input. Core learnable parameters adjusted by training
- **b (bias)**: Shifts decision boundary
- **f (activation)**: Injects nonlinearity

Single perceptron can only do linear separation (can't solve XOR). This limitation motivates **stacking hidden layers** in multi-layer perceptron (MLP).

> 💡 **Related Theory**: Without activation functions, stacking layers makes just composed linear transformations → still one linear model. Nonlinear activation is how neural nets express curved decision boundaries and complex functions. This is why deep learning has "deep" expressiveness.

## Hidden Layers and Multi-Layer Perceptron (MLP)

Insert one or more **hidden layers** between input and output → networks can approximate nonlinear functions.

```text
Input layer  →  Hidden layer 1  →  Hidden layer 2  →  Output layer
(features)      (low-level         (high-level        (prediction)
                 patterns)          patterns)
```

- **Layer width** (neuron count) and **depth** (layer count) determine model capacity
- Deeper/wider = higher expressiveness, but overfitting/compute/vanishing gradient risk grows
- Universal approximation: Single hidden layer MLP with sufficient neurons approximates any continuous function. But "deep" networks often achieve same expressiveness with fewer parameters

## Activation Functions

Inject nonlinearity between layers. Three frequently tested, distinguish them:

| Function | Output Range | Main Use | Features |
|------|------|------|------|
| **Sigmoid** | (0, 1) | Binary classification output | Gradient vanishes at ends, output is probability |
| **Tanh** | (-1, 1) | Hidden layers (historically) | 0-centered → more stable than Sigmoid |
| **ReLU** | [0, ∞) | Hidden layers (default) | Compute simple, mitigates vanishing gradient, "dead ReLU" issue |
| **Softmax** | (0,1), sum=1 | Multi-class output | Produces probability distribution |

```python
# Conceptual definitions
relu(z)    = max(0, z)
sigmoid(z) = 1 / (1 + exp(-z))
softmax(z_i) = exp(z_i) / sum(exp(z_j) for all j)
```

Selection guide:
- **Hidden layers**: Default **ReLU** (or Leaky ReLU, GELU variants). Mitigates vanishing gradient, fast
- **Binary classification output**: **Sigmoid** single node
- **Multi-class output**: **Softmax** (one node per class)
- **Regression output**: No activation (linear) or output-range-appropriate

> 💡 **Related Theory**: Sigmoid/Tanh have derivatives near 0 at extremes → backprop shrinks gradients to nearly 0 in deep nets (vanishing gradient). ReLU's positive segment has derivative = 1 constantly → greatly mitigates. Downside: negative inputs always output 0 → "dead ReLU" permanently inactive neurons (Leaky ReLU addresses this)

## Forward Pass and Loss

Learning happens across two flows. First, **forward pass** creates predictions.

```text
Input → (weighted sum + activation) per layer → final prediction ŷ
```

**Loss function** quantifies difference between prediction ŷ and truth y.

- Regression: mean squared error (MSE)
- Binary classification: binary cross-entropy (BCE)
- Multi-class: categorical cross-entropy
- Lower loss = better model. Training goal: "find weights minimizing loss"

## Backpropagation

To reduce loss, need to know how much each weight contributes to loss. Backprop uses **chain rule** to propagate loss gradients backward from output to input.

```text
1. Forward pass: compute prediction ŷ
2. Compute loss: L(ŷ, y)
3. Backprop: compute ∂L/∂w via chain rule output→input direction
4. Update weights: w ← w - η * ∂L/∂w   (η = learning rate)
5. Repeat 1-4 per batch/epoch
```

- **Gradient**: says "if we increase this weight, loss changes in what direction/magnitude?"
- **Gradient descent**: step opposite gradient direction incrementally
- Repeat over data batches/epochs thousands to hundreds of thousands of times

Backprop pairs with optimizer (Day 4). Backprop calculates "which direction," optimizer determines "how far, how"

## Epochs, Batches, Iterations — Terminology

| Term | Meaning |
|------|------|
| **Epoch** | Pass through entire training dataset once |
| **Batch** | Sample group used in one weight update |
| **Batch size** | Samples per batch (memory/stability tradeoff) |
| **Iteration** | One batch processed = one weight update |

Example: 1000 samples, batch size 100 → one epoch = 10 iterations

> 💡 **Related Theory**: Large batch → stable gradient estimates, high GPU utilization, but less generalization. Small batch → noisy gradients help escape local minima sometimes. Test: "OOM (out of memory)" → reduce batch size is first fix

## Core Takeaway

- Perceptron = weighted sum + bias + activation. Single perceptron only linear separation
- Hidden layers + nonlinear activation → approximate complex nonlinear functions
- Hidden layer default: ReLU. Output: Sigmoid/Softmax/linear by task type
- Forward pass predicts, loss measures error, backprop computes gradients, gradient descent updates
- Epochs/batches/iterations: distinguish clearly

## 📝 연습 문제

**문제 1.** 다중 클래스(10개 클래스) 이미지 분류 신경망의 **출력층 활성화 함수**로 가장 적절한 것은?

A) ReLU  
B) Softmax  
C) Sigmoid  
D) Tanh  

**정답: B**  
해설: 다중 분류 출력은 클래스별 확률 분포(합=1)가 필요하므로 Softmax가 적합하다. ReLU/Tanh(A·D)는 은닉층용이고, Sigmoid(C)는 단일 노드 이진 분류 출력에 쓴다.

---

**문제 2.** 깊은 신경망의 은닉층에서 Sigmoid를 쓸 때 학습이 잘 안 되는 주된 이유와 일반적 처방은?

A) 출력이 음수라서 — Softmax로 교체  
B) 양 끝에서 도함수가 0에 가까워 기울기 소실 — ReLU 계열로 교체  
C) 확률을 출력하지 못해서 — 선형 함수로 교체  
D) 계산이 너무 빨라서 — Tanh로 교체  

**정답: B**  
해설: Sigmoid는 포화 구간에서 도함수가 0에 가까워 역전파 시 기울기가 소실된다. 은닉층 활성화를 ReLU 계열로 바꾸면 크게 완화된다. 출력이 음수(A)나 빠른 계산(D)은 사실과 다르며, 확률 출력 여부(C)는 은닉층 문제와 무관하다.

---

**문제 3.** 활성화 함수가 전혀 없는(선형만 있는) 다층 신경망의 표현력은?

A) 단일 선형 모델과 동등하다  
B) 임의의 비선형 함수를 근사할 수 있다  
C) 층 수에 비례해 비선형성이 증가한다  
D) XOR 문제를 풀 수 있다  

**정답: A**  
해설: 선형 변환의 합성은 여전히 선형 변환이므로, 비선형 활성화가 없으면 아무리 층을 쌓아도 단일 선형 모델과 같다. 따라서 비선형 함수 근사(B)나 XOR(D)는 불가능하고, 깊이만으로 비선형성이 생기지 않는다(C).

---

**문제 4.** 데이터 8000개, 배치 크기 200으로 5 에폭 학습할 때 전체 **가중치 갱신(이터레이션) 횟수**는?

A) 40  
B) 1000  
C) 200  
D) 8000  

**정답: C**  
해설: 한 에폭의 이터레이션 = 8000 / 200 = 40회이고, 5 에폭이면 40 × 5 = 200회의 가중치 갱신이 일어난다. 40(A)은 1 에폭 분량, 1000(B)·8000(D)은 계산과 무관한 값이다.

---

**문제 5.** 역전파(backpropagation)의 역할을 가장 정확히 설명한 것은?

A) 입력 데이터를 정규화한다  
B) 최적의 학습률을 자동으로 탐색한다  
C) 활성화 함수를 자동 선택한다  
D) 연쇄 법칙으로 손실에 대한 각 가중치의 기울기를 출력→입력 방향으로 계산한다  

**정답: D**  
해설: 역전파는 연쇄 법칙으로 손실의 기울기를 출력층에서 입력층 방향으로 전파해 계산하는 알고리즘이다. 정규화(A)·학습률 탐색(B)·활성화 선택(C)은 역전파의 역할이 아니다.

---
