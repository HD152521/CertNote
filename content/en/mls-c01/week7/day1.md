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

## 📝 Practice Questions

**Question 1.** Which is the MOST appropriate **output layer activation function** for a multiclass (10-class) image classification neural network?

A) ReLU  
B) Softmax  
C) Sigmoid  
D) Tanh  

**Answer: B**  
Explanation: Multiclass output needs a per-class probability distribution (summing to 1), so Softmax is appropriate. ReLU/Tanh (A, D) are for hidden layers, and Sigmoid (C) is used for single-node binary classification output.

---

**Question 2.** What is the main reason training goes poorly when using Sigmoid in the hidden layers of a deep neural network, and what is the usual remedy?

A) The output is negative - replace with Softmax  
B) The derivative is close to 0 at both ends, causing vanishing gradients - replace with a ReLU-family function  
C) It cannot output probabilities - replace with a linear function  
D) The computation is too fast - replace with Tanh  

**Answer: B**  
Explanation: Sigmoid's derivative is close to 0 in the saturated regions, so gradients vanish during backpropagation. Replacing the hidden-layer activation with a ReLU-family function greatly mitigates this. The output being negative (A) or fast computation (D) is not true, and whether it outputs probabilities (C) is unrelated to the hidden-layer problem.

---

**Question 3.** What is the representational power of a multilayer neural network with no activation functions at all (only linear)?

A) Equivalent to a single linear model  
B) Can approximate any nonlinear function  
C) Nonlinearity increases in proportion to the number of layers  
D) Can solve the XOR problem  

**Answer: A**  
Explanation: A composition of linear transformations is still a linear transformation, so without nonlinear activations, no matter how many layers you stack, it is equivalent to a single linear model. Therefore approximating nonlinear functions (B) or XOR (D) is impossible, and depth alone does not create nonlinearity (C).

---

**Question 4.** When training for 5 epochs with 8,000 samples and a batch size of 200, what is the total number of **weight updates (iterations)**?

A) 40  
B) 1000  
C) 200  
D) 8000  

**Answer: C**  
Explanation: Iterations per epoch = 8000 / 200 = 40, so for 5 epochs there are 40 × 5 = 200 weight updates. 40 (A) is the amount for 1 epoch, and 1000 (B) and 8000 (D) are values unrelated to the calculation.

---

**Question 5.** Which BEST describes the role of backpropagation?

A) Normalizes the input data  
B) Automatically searches for the optimal learning rate  
C) Automatically selects the activation function  
D) Uses the chain rule to compute the gradient of the loss with respect to each weight, in the output-to-input direction  

**Answer: D**  
Explanation: Backpropagation is an algorithm that uses the chain rule to propagate and compute the loss gradients from the output layer toward the input layer. Normalization (A), learning rate search (B), and activation selection (C) are not roles of backpropagation.

---
