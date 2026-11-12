# Day 2 - CNN: Convolutional Neural Networks and Computer Vision

Images/video have enormous pixel counts — feeding directly to fully connected (Dense) neural nets causes parameter explosion and fails to learn translation invariance. **Convolutional Neural Networks (CNN)** solve this by sliding small filters across the entire image to extract local patterns. MLS-C01 asks not CNN's internal equations but **convolution/pooling roles, image classification vs object detection, SageMaker builtin/architecture choices**.

## Why Convolution, Not Fully Connected?

A 224×224×3 color image flattened to a Dense layer has ~150k input nodes. First hidden layer of 1000 nodes = 150M weights — explosion. CNN solves this with three ideas.

- **Local receptive field**: One neuron sees small region, not whole image
- **Weight sharing**: Reuse same filter across all image locations → parameter collapse
- **Translation invariance**: Detect cat anywhere with same filter

> 💡 **Related Theory**: Weight sharing assumes "cat-ear-detecting filter" works identically anywhere in image. This cuts learnable parameters and generalizes well on limited data. It encodes the property "image meaning preserved under spatial translation" as inductive bias directly into structure.

## Convolution Layer

Slide small **filter (kernel)** over input, compute dot products to create **feature maps**.

```text
Input image  *  Filter (e.g., 3x3)  →  Feature maps
(emphasize edges, texture, shape patterns)
```

Core hyperparameters:
- **Number of filters**: Output channels = variety of patterns detected
- **Kernel size**: 3×3, 5×5, etc. Smaller = finer detail
- **Stride**: Filter movement step. Larger = smaller output
- **Padding**: Pad edges with 0s to preserve size (`same`) or shrink (`valid`)

Stacking layers deepens abstraction: low-level (edges) → mid-level (texture, parts) → high-level (whole objects)

## Pooling Layer

Reduce feature map spatial size, lower computation, robust to small position changes.

| Type | Operation | Feature |
|------|------|------|
| **Max Pooling** | Take max in region | Preserve strongest features, most common |
| **Average Pooling** | Average in region | Smooth downsampling |
| **Global Average Pooling** | Average all channels | Replace Dense, cut parameters |

Pooling has no learnable parameters (fixed operation). Downsampling widens receptive field, reduces overfitting.

## Typical CNN Architecture

```text
[Conv → ReLU → Pool] × N  →  Flatten/GAP  →  Dense  →  Softmax
   Feature extraction (backbone)          Classification head
```

- Front part (conv/pool blocks) = **feature extractor (backbone)**
- Back part (Dense + Softmax) = **classification head**
- Transfer learning (Day4) often reuses backbone, trains only head

## Representative Architectures

Know names/flow on exam.

| Architecture | Key Idea |
|------|------|
| **LeNet** | Early CNN (handwritten digits) |
| **AlexNet** | ReLU, dropout, GPU revived deep learning (2012) |
| **VGG** | Stack 3×3 filters deep, simple, regular structure |
| **ResNet** | Residual connections (skip) enable very deep training |
| **Inception** | Parallel combine multiple kernel sizes |

> 💡 **Related Theory**: Deeper networks showed vanishing gradient paradox — training got worse. ResNet's **residual/skip connection** adds input directly to output (`H(x)=F(x)+x`), creating gradient shortcut, enabling 100+ layer stable training. "Deep network training failure" solution is frequent exam topic.

## Image Classification vs Object Detection vs Segmentation

Distinguishing CNN applications precisely is exam core.

| Task | Output | Question |
|------|------|------|
| **Image Classification** | 1 (or multiple) label per image | "What is this photo?" |
| **Object Detection** | Class + bounding box for multiple objects | "Where, what, how many?" |
| **Semantic Segmentation** | Pixel-level class | "Which object does each pixel belong to?" |

Representative algorithms:
- Classification: General CNN like ResNet/VGG, SageMaker **Image Classification**
- Detection: **SSD**, **YOLO**, Faster R-CNN, SageMaker **Object Detection**
- Segmentation: U-Net, FCN, SageMaker **Semantic Segmentation**

## SageMaker Builtins and Data Format

- **Image Classification**: Single/multi-label classification. ResNet-based. Supports transfer learning mode
- **Object Detection**: SSD-based. Outputs box + class
- **Semantic Segmentation**: Pixel classification
- Input usually **RecordIO (recommended, fast)** or image files + annotations. Large data: **Pipe mode** streaming
- Labeling: **SageMaker Ground Truth** (provides bounding box, segmentation task templates)

> 💡 **Related Theory**: Limited images → **data augmentation** (rotate, flip, crop, color shift) increases training diversity, reduces overfitting. SageMaker Image Classification/Object Detection have built-in augmentation options. Also, **transfer learning** using ImageNet pre-trained weights beats training from scratch on limited data, shorter time (Day4 connection).

## Key Summary

- CNN = local receptive field + weight sharing + translation invariance for efficient image processing
- Convolution extracts patterns, pooling downsamples (no parameters)
- Classification (labels) / Detection (boxes+classes) / Segmentation (pixels) — distinguish precisely
- ResNet residual connections = solution for very deep network training
- SageMaker provides Image Classification, Object Detection, Semantic Segmentation builtins + Ground Truth labeling

## 📝 Practice Questions

**Question 1.** You need to know "how many vehicles and pedestrians are in the photo and where they are located." Which task type is MOST appropriate?

A) Object detection  
B) Image classification  
C) Topic modeling  
D) Regression  

**Answer: A**  
Explanation: Obtaining the classes and locations (bounding boxes) of multiple objects at the same time is object detection (SSD/YOLO, SageMaker Object Detection). Image classification (B) gives only a label per photo, topic modeling (C) is for text, and regression (D) predicts continuous values.

---

**Question 2.** Which of the following is NOT a role of the **pooling layer** in a CNN?

A) Adds learnable weights to increase expressive power  
B) Reduces the spatial size of the feature map  
C) Makes the network robust to small positional changes  
D) Reduces computation and overfitting  

**Answer: A**  
Explanation: Pooling is a fixed operation (max/average) with no learnable parameters. Downsampling (B), positional robustness (C), and reduced computation and overfitting (D) are effects of pooling, but adding weights is the role of convolution/Dense layers.

---

**Question 3.** Which representative architecture introduced **residual (skip) connections** so that networks can be trained stably even when stacked more than 100 layers deep?

A) VGG  
B) AlexNet  
C) ResNet  
D) LeNet  

**Answer: C**  
Explanation: ResNet's residual connections add the input to the output so that gradients flow through shortcuts, enabling ultra-deep training. VGG (A) is a simple structure stacking 3×3 convolutions deeply, and AlexNet (B) and LeNet (D) are earlier-generation architectures.

---

**Question 4.** What is the key reason a CNN is advantageous for images compared with a fully connected (Dense) neural network?

A) It does not need activation functions  
B) It does not use a loss function  
C) It is trained without backpropagation  
D) Weight sharing and local receptive fields give it fewer parameters and translation invariance  

**Answer: D**  
Explanation: A CNN shares small filters across all positions (weight sharing) and looks only at local regions, greatly reducing parameters and gaining translation invariance. Activations, loss, and backpropagation (A, B, C) are used by CNNs in the same way.

---

**Question 5.** When image training data is very scarce, what is the MOST appropriate first remedy for reducing overfitting?

A) Set the batch size to 0  
B) Remove all activation functions  
C) Use data augmentation (rotation, flipping, cropping) and transfer learning from pretrained weights  
D) Change the output layer to regression  

**Answer: C**  
Explanation: With little data, augmentation increases diversity, and transfer learning from ImageNet pretrained weights improves generalization even with little data. A batch size of 0 (A) is impossible, removing activations (B) destroys expressive power, and changing the output to regression (D) is unrelated to the classification task.

---
