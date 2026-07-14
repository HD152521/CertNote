# Day 3 - RNNs and Sequences: From LSTM to Transformer

If images have spatial structure, text, time series, speech, and logs have **sequential structure**. For such data where previous input affects next output, we use Recurrent Neural Networks (RNN) and their advanced forms, and today's mainstream Transformer. MLS-C01 asks about **RNN/LSTM/GRU differences, seq2seq architecture, attention and Transformer concepts, and algorithm selection in time series and NLP**.

## The Basic Idea of RNN

RNN processes sequences one time step at a time, accumulating past information in **hidden state**.

```text
h_t = f(W_x * x_t + W_h * h_{t-1} + b)
Output y_t is computed from h_t
```

- `h_{t-1}`: The "memory" up to the previous time step is passed to the next computation.
- Weight sharing across all time steps (temporal weight sharing).
- Naturally handles variable-length sequences.

> 💡 **Related Theory**: When unrolled along the time axis, an RNN is like a very deep neural network. Therefore, during backpropagation (BPTT—backpropagation through time), gradients accumulate via multiplication, causing severe **gradient vanishing/explosion**. As a result, simple RNNs suffer from **long-term dependency** problems, failing to remember distant past information. This limitation motivates LSTM and GRU.

## LSTM and GRU

RNN variants that mitigate long-term dependency via gate mechanisms.

| Model | Structure | Characteristics |
|-------|-----------|-----------------|
| **LSTM** | Input, forget, and output gates + cell state | Long-term memory preservation, many parameters |
| **GRU** | Update and reset gates | Simpler and faster than LSTM, similar performance |

- **Cell state**: LSTM's "highway" for carrying information over long distances. Gates control what to erase (forget), add (input), and output.
- GRU reduces gates for lighter computation. A good LSTM alternative when data and resources are moderate.

Selection guide: Use LSTM if long-term dependencies are critical and resources sufficient; use GRU for lighter needs.

## seq2seq (Encoder-Decoder)

A structure mapping **input sequence → output sequence** (possibly different lengths), like machine translation.

```text
Input Sequence → [Encoder RNN] → Context Vector → [Decoder RNN] → Output Sequence
"I am happy"                                                      "I am happy"
```

- **Encoder** compresses the entire input into a fixed-length context vector.
- **Decoder** generates output one token at a time from that vector.
- Limitation: Compressing long input into one vector causes information loss (bottleneck).

## Attention

Emerged to solve seq2seq's bottleneck. The decoder learns to weight which parts of the input to focus on at each output time step.

```text
When decoder generates "happy"
→ Assigns high attention weight to input "happy"
```

- Dynamically references entire input instead of fixed context vector.
- Reduces information loss in long sequences and provides interpretability of input-output relationships.

> 💡 **Related Theory**: Attention's core is "query, key, value" mechanism. Weight is derived from similarity between decoder's current state (query) and encoder positions (keys), then values are weighted summed. Applying this idea to all position pairs within a sequence without RNN is **self-attention**, the foundation of Transformer.

## Transformer

"Attention Is All You Need" (2017) dropped RNN and processes sequences using **self-attention alone**. Today's standard in NLP and generative AI.

- **Parallel processing**: Doesn't sequentially process time steps like RNN but handles entire sequence at once → much faster GPU training.
- **Long-range dependencies**: Distant tokens connect directly via attention.
- **Positional encoding**: Injects order information separately (attention itself doesn't know position).
- Representative models: BERT (encoder, understanding), GPT (decoder, generation), T5 (encoder-decoder).

Central to the **pretraining-finetuning paradigm** (large-scale pretraining + downstream finetuning), and AWS provides SageMaker JumpStart and Amazon Bedrock for easy access.

## AWS Mapping for Time Series and NLP

| Task | Suitable Choice |
|------|------|
| Demand/revenue time series forecasting | **DeepAR** (SageMaker), Amazon Forecast |
| Text classification/embedding (traditional) | **BlazingText** (Word2Vec/classification) |
| Machine translation | **Seq2Seq** (SageMaker built-in) |
| Entity, sentiment, key phrase extraction (managed) | **Amazon Comprehend** |
| Generation, summarization, QA (large language models) | SageMaker JumpStart, **Amazon Bedrock** |

> 💡 **Related Theory**: In time series forecasting, DeepAR learns multiple related time series together so a sparse time series borrows patterns from others (global model). This is more powerful than fitting ARIMA separately to each product for many similar time series (demand by store or SKU). "Forecast demand across many products at once" signals DeepAR/Forecast.

## Key Summary

- RNN processes sequences via hidden state but suffers from long-term dependency and gradient issues.
- LSTM/GRU improve long-term memory via gates (GRU is lighter).
- seq2seq (encoder-decoder) maps input→output sequences; attention resolves bottleneck.
- Transformer uses self-attention for parallel and long-range processing → modern NLP standard (BERT/GPT/T5).
- AWS: time series=DeepAR/Forecast, text=BlazingText/Comprehend, generation=JumpStart/Bedrock.

## 📝 연습 문제

**문제 1.** 단순 RNN이 긴 문장의 앞부분 정보를 뒷부분에서 잘 활용하지 못하는 근본 원인은?

A) 활성화 함수가 없어서  
B) 시간축 역전파에서 기울기 소실/폭발로 장기 의존성을 학습하기 어려워서  
C) 가중치를 공유하지 않아서  
D) 출력층이 Softmax라서  

**정답: B**  
해설: RNN을 시간축으로 펼치면 매우 깊어져 기울기가 소실/폭발하고 먼 과거 정보가 사라진다. RNN도 활성화를 쓰고(A), 시간축 가중치를 공유하며(C), 출력 활성화(D)는 장기 의존성과 무관하다.

---

**문제 2.** 다음 중 RNN 없이 **셀프 어텐션만으로** 시퀀스를 처리해 병렬 학습과 장거리 의존성에 강한 구조는?

A) LSTM  
B) GRU  
C) Transformer  
D) seq2seq(RNN 기반)  

**정답: C**  
해설: Transformer는 순환 구조 없이 셀프 어텐션으로 전체 시퀀스를 한 번에 처리해 병렬성과 장거리 의존성에 강하다. LSTM·GRU(A·B)·RNN 기반 seq2seq(D)는 모두 순차적 순환 구조를 사용한다.

---

**문제 3.** 다수의 상품(SKU)에 대해 미래 수요를 한꺼번에 예측하려 한다. SageMaker에서 가장 적합한 빌트인 알고리즘은?

A) DeepAR  
B) BlazingText  
C) Image Classification  
D) K-Means  

**정답: A**  
해설: DeepAR은 여러 관련 시계열을 함께 학습하는 글로벌 모델로 다수 SKU 수요 예측에 적합하다. BlazingText(B)는 텍스트, Image Classification(C)은 이미지, K-Means(D)는 군집용이다.

---

**문제 4.** seq2seq에 **어텐션**을 추가하면 얻는 주된 이점은?

A) 학습률을 자동 조정한다  
B) 입력 전체를 동적으로 참조해 고정 컨텍스트 벡터의 정보 병목을 완화한다  
C) 레이블 없이 학습할 수 있게 된다  
D) GPU 없이 학습이 가능해진다  

**정답: B**  
해설: 어텐션은 디코더가 출력 시점마다 입력의 관련 부분을 가중 참조하게 해, 긴 입력을 하나의 벡터로 압축할 때 생기는 병목을 줄인다. 학습률(A)·비지도화(C)·하드웨어(D)와는 무관하다.

---

**문제 5.** LSTM과 비교한 **GRU**의 일반적 특징으로 옳은 것은?

A) 게이트가 더 많아 항상 더 정확하다  
B) 순환 구조가 없다  
C) 시계열에는 쓸 수 없다  
D) 게이트 수가 적어 더 단순하고 빠르며 성능은 유사한 경우가 많다  

**정답: D**  
해설: GRU는 LSTM보다 게이트가 적어 파라미터가 적고 빠르며, 많은 과제에서 성능이 비슷하다. 게이트가 더 많다는 설명(A)은 반대이고, GRU도 순환 구조를 가지며(B) 시계열에 널리 쓰인다(C).

---
