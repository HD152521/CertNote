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

## 📝 연습 문제

**문제 1.** "사진 속에 차량과 보행자가 각각 몇 개 있고 어디에 위치하는지" 알아야 한다. 가장 적절한 과제 유형은?

A) 객체 탐지  
B) 이미지 분류  
C) 토픽 모델링  
D) 회귀  

**정답: A**  
해설: 여러 객체의 클래스와 위치(바운딩 박스)를 동시에 구하는 것은 객체 탐지(SSD/YOLO, SageMaker Object Detection)다. 이미지 분류(B)는 사진 1장당 레이블만, 토픽 모델링(C)은 텍스트, 회귀(D)는 연속값 예측이다.

---

**문제 2.** CNN에서 **풀링(pooling) 층**의 역할로 옳지 않은 것은?

A) 학습 가능한 가중치를 추가해 표현력을 높인다  
B) 특성 맵의 공간 크기를 줄인다  
C) 작은 위치 변화에 강인하게 만든다  
D) 연산량과 과적합을 줄인다  

**정답: A**  
해설: 풀링은 학습 파라미터가 없는 고정 연산이다(최댓값/평균). 다운샘플링(B)·위치 강인성(C)·연산 및 과적합 감소(D)는 풀링의 효과이지만, 가중치를 추가하는 것은 합성곱/Dense 층의 역할이다.

---

**문제 3.** 망을 100층 이상 매우 깊게 쌓아도 안정적으로 학습되도록 **잔차(skip) 연결**을 도입한 대표 구조는?

A) VGG  
B) AlexNet  
C) ResNet  
D) LeNet  

**정답: C**  
해설: ResNet은 입력을 출력에 더하는 잔차 연결로 기울기가 지름길로 흐르게 해 초심층 학습을 가능하게 했다. VGG(A)는 3×3을 깊게 쌓은 단순 구조, AlexNet(B)·LeNet(D)은 그 이전 세대 구조다.

---

**문제 4.** 완전연결(Dense) 신경망 대신 CNN이 이미지에 유리한 핵심 이유는?

A) 활성화 함수가 필요 없어서  
B) 손실 함수를 쓰지 않기 때문  
C) 역전파 없이 학습되기 때문  
D) 가중치 공유와 지역 수용영역으로 파라미터가 적고 이동 불변성을 갖기 때문  

**정답: D**  
해설: CNN은 작은 필터를 전 위치에 공유(가중치 공유)하고 지역 영역만 보아 파라미터를 크게 줄이며 이동 불변성을 얻는다. 활성화·손실·역전파(A·B·C)는 CNN도 동일하게 사용한다.

---

**문제 5.** 이미지 학습 데이터가 매우 적을 때 과적합을 줄이는 가장 적절한 1차 처방은?

A) 배치 크기를 0으로 설정  
B) 활성화 함수를 모두 제거  
C) 데이터 증강(회전·뒤집기·크롭)과 사전학습 가중치 전이학습 활용  
D) 출력층을 회귀로 변경  

**정답: C**  
해설: 데이터가 적으면 증강으로 다양성을 늘리고, ImageNet 사전학습 가중치를 전이학습해 적은 데이터로도 일반화를 높인다. 배치 0(A)은 불가능, 활성화 제거(B)는 표현력 상실, 출력 회귀 변경(D)은 분류 과제와 무관하다.

---
