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

## 📝 Practice Questions

**Question 1.** What is the fundamental reason a simple RNN cannot make good use of information from the beginning of a long sentence at its end?

A) It has no activation function  
B) Vanishing/exploding gradients in backpropagation through time make long-term dependencies hard to learn  
C) It does not share weights  
D) The output layer is Softmax  

**Answer: B**  
Explanation: When an RNN is unrolled over time it becomes very deep, so gradients vanish/explode and information from the distant past is lost. RNNs do use activations (A), they share weights across time (C), and the output activation (D) is unrelated to long-term dependencies.

---

**Question 2.** Which of the following architectures processes sequences with **self-attention alone** and no RNN, making it strong in parallel training and long-range dependencies?

A) LSTM  
B) GRU  
C) Transformer  
D) seq2seq (RNN-based)  

**Answer: C**  
Explanation: The Transformer processes the entire sequence at once with self-attention and no recurrence, so it is strong in parallelism and long-range dependencies. LSTM and GRU (A, B) and RNN-based seq2seq (D) all use a sequential recurrent structure.

---

**Question 3.** You want to forecast future demand for many products (SKUs) at once. Which built-in algorithm in SageMaker is MOST suitable?

A) DeepAR  
B) BlazingText  
C) Image Classification  
D) K-Means  

**Answer: A**  
Explanation: DeepAR is a global model that trains on many related time series together, making it suitable for demand forecasting across many SKUs. BlazingText (B) is for text, Image Classification (C) is for images, and K-Means (D) is for clustering.

---

**Question 4.** What is the main benefit of adding **attention** to seq2seq?

A) It automatically adjusts the learning rate  
B) It dynamically references the entire input, easing the information bottleneck of a fixed context vector  
C) It makes training without labels possible  
D) It makes training possible without a GPU  

**Answer: B**  
Explanation: Attention lets the decoder weight-reference the relevant parts of the input at each output step, reducing the bottleneck that arises when compressing a long input into a single vector. It is unrelated to the learning rate (A), unsupervised learning (C), or hardware (D).

---

**Question 5.** Which statement about the general characteristics of a **GRU** compared with an LSTM is correct?

A) It has more gates and is therefore always more accurate  
B) It has no recurrent structure  
C) It cannot be used for time series  
D) It has fewer gates, so it is simpler and faster, with similar performance in many cases  

**Answer: D**  
Explanation: A GRU has fewer gates than an LSTM, so it has fewer parameters and is faster, with similar performance on many tasks. The claim that it has more gates (A) is the opposite, and a GRU also has a recurrent structure (B) and is widely used for time series (C).

---
