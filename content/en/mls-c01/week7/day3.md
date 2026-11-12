# Day 3 - RNNs and Sequence Models: From LSTM to Transformer

## 📌 Key Takeaways

- An RNN processes a sequence by accumulating the past in its **hidden state**, but it is weak at **long-term dependencies** because of vanishing and exploding gradients.
- LSTM (gates + cell state) / GRU (fewer gates, lighter and faster) mitigate that weakness.
- In seq2seq (encoder-decoder), the **information bottleneck** of the fixed context vector was the problem, and **attention** resolved it.
- The Transformer processes sequences with **self-attention** alone, with no recurrence, so it is strong at parallel training and long-range dependencies (BERT/GPT/T5).
- AWS mapping: time series = DeepAR/Forecast, text = BlazingText/Comprehend, generation = JumpStart/Bedrock.

## Data Where Order Creates Meaning

If images have spatial structure, then text, time series, speech, and logs have **sequential structure**. For this kind of data, where earlier inputs affect later outputs, we use recurrent neural networks (RNNs) and their successors, and today's mainstream, the Transformer.

| Data | Why order matters | If order is ignored |
|---|---|---|
| Text | Word order changes meaning | "The dog bit the man" and "The man bit the dog" become the same |
| Time series (demand, sales) | Trend and seasonality live on the time axis | The seasonal pattern is lost entirely |
| Speech | A run of phonemes forms a word | Shuffling the frames makes it nonsense |
| Logs, clickstreams | The order of actions reveals intent | The flow of the session disappears |

MLS-C01 asks about **the differences among RNN/LSTM/GRU, the seq2seq structure, the concepts of attention and the Transformer, and algorithm choices for time series and NLP**.

## The Basic Idea of RNNs

An RNN processes a sequence one time step at a time and accumulates past information in its **hidden state**.

```text
h_t = f(W_x * x_t + W_h * h_{t-1} + b)
The output y_t is computed from h_t
```

- `h_{t-1}`: the "memory" up to the previous step is passed on to the next computation.
- The weights are shared across all time steps (weight sharing along the time axis).
- It naturally handles variable-length sequences.

```text
 x_1        x_2        x_3        x_4
  │          │          │          │
  ▼          ▼          ▼          ▼
[RNN] ──h1─▶[RNN] ──h2─▶[RNN] ──h3─▶[RNN] ──▶ h4
  │          │          │          │
  ▼          ▼          ▼          ▼
 y_1        y_2        y_3        y_4
  └─ Every step shares the same weights W ─┘
```

Unrolled along the time axis, an RNN is equivalent to a very deep neural network. So during backpropagation (BPTT — backpropagation through time), gradients accumulate through multiplication and **vanishing/exploding gradients** become severe. As a result, a simple RNN suffers from the **long-term dependency** problem of being unable to remember information from the distant past. This limitation is the motivation for LSTM and GRU.

## Sequence Task Types

The structure differs depending on which side, input or output, is the sequence.

| Type | Input → output | Example | Typical structure |
|---|---|---|---|
| **one-to-many** | Single → sequence | Image captioning | CNN encoder + RNN decoder |
| **many-to-one** | Sequence → single | Sentiment classification, anomaly detection | RNN + last hidden state → classification head |
| **many-to-many (synchronous)** | Sequence → sequence of the same length | Named entity recognition, per-frame labeling | Output at every step |
| **many-to-many (asynchronous)** | Sequence → sequence of a different length | Machine translation, summarization | seq2seq (encoder-decoder) |

> ⚠️ **Trap**: If you see a clue that the input and output lengths **differ**, the answer is an **encoder-decoder (seq2seq)**, not a per-step output structure. Translation and summarization are the typical cases.

## LSTM and GRU

These are RNN variants that mitigate the long-term dependency problem with gate mechanisms.

| Model | Structure | Characteristic |
|-------|-----------|-----------------|
| **LSTM** | Input, forget, and output gates + cell state | Preserves long-term memory, many parameters |
| **GRU** | Update and reset gates | Simpler and faster than LSTM, often with similar performance |

- **Cell state**: the LSTM's "highway" that carries information over long distances. The gates control what to erase (forget), what to add (input), and what to emit (output).
- GRU reduces the gates so computation is lighter. It is a good LSTM alternative when data and resources are moderate.

Selection guide: use LSTM when long-term dependencies are decisive and resources are ample, and GRU when it must be lighter.

> ⚠️ **Trap**: The remedies for gradient **vanishing** and **exploding** differ. Vanishing is solved with structure (gates, residuals, ReLU). Exploding is handled with gradient clipping and a smaller learning rate. If the loss slowly stalls, suspect vanishing; if it suddenly jumps to NaN, suspect exploding.

```text
[LSTM cell]
  previous cell state c_{t-1} ──────┬──▶ c_t   (long-range information path)
                                     │
   input x_t ─┬─▶ forget gate → what to erase
   previous h_{t-1}├─▶ input gate → what to write anew
             └─▶ output gate → what to emit ──▶ h_t
```

## RNN · LSTM · GRU · Transformer Comparison

| Item | Simple RNN | LSTM | GRU | Transformer |
|---|---|---|---|---|
| Long-term dependencies | Weak | Strong (cell state) | Strong (slightly simpler than LSTM) | Very strong (direct connections) |
| Parallelism across time steps | Not possible (sequential) | Not possible | Not possible | **Possible** (processes everything at once) |
| Parameters / compute | Smallest | Many | Fewer than LSTM | Large, sensitive to sequence length |
| Position information | Inherent in the structure | Inherent in the structure | Inherent in the structure | **Injected separately via positional encoding** |
| Typical use | Short sequences, teaching | Time series, speech, long context | Lightweight LSTM alternative | Standard for NLP and generative AI |

In a question saying "I added GPUs but RNN training did not get faster," the cause is not the hardware but the **sequential processing structure** itself. If you want parallelism, you must move to the Transformer family.

## seq2seq (Encoder-Decoder)

A structure that maps an **input sequence → an output sequence (which may have a different length)**, as in machine translation.

```text
Input sequence → [Encoder RNN] → Context vector → [Decoder RNN] → Output sequence
"I am happy"                                                (Korean: "I am happy")
```

- The **encoder** compresses the whole input into a fixed-length context vector.
- The **decoder** generates tokens one at a time from that vector.
- Limitation: compressing a long input into a single vector loses information (a bottleneck).

## Attention

It appeared to resolve the seq2seq bottleneck. The decoder learns which part of the input to focus on at each output step.

```text
When the decoder generates the Korean word for "happy"
→ it assigns a high attention weight to "happy" in the input
```

```text
        Input:  I     am    happy
               │     │      │
               ▼     ▼      ▼
   [Encoder hidden states h1, h2, h3]
               │     │      │
        weight 0.1   0.2    0.7      ← similarity to the decoder's current state (query)
               └──┬──┴──────┘
                  ▼
          weighted sum = context for this step
                  ▼
             Decoder → the Korean word for "happy"
```

- Instead of a fixed context vector, it dynamically references the entire input.
- It reduces information loss on long sequences and gives interpretability of input-output relationships.

The core of attention is the "query, key, value" mechanism. Weights are computed from the similarity between the decoder's current state (query) and each encoder position (key), and the values are then summed using those weights. Applying this idea, without any RNN, **to every pair of positions inside a single sequence** is **self-attention**, which is the foundation of the Transformer.

## Transformer

"Attention Is All You Need" (2017) dropped the RNN and processed sequences with **self-attention alone**. It is today's standard for NLP and generative AI.

- **Parallel processing**: it does not process time steps sequentially like an RNN but handles the whole sequence at once, so GPU training is much faster.
- **Long-range dependencies**: distant tokens are connected directly through attention.
- **Positional encoding**: order information is injected separately (attention itself does not know position).
- Representative models: BERT (encoder, understanding), GPT (decoder, generation), T5 (encoder-decoder).

It is at the center of the **pretraining-fine-tuning paradigm** (large-scale pretraining + downstream fine-tuning), and AWS makes it easy to access through SageMaker JumpStart and Amazon Bedrock.

| Model family | Structure | Good at |
|---|---|---|
| **BERT** | Encoder | **Understanding** tasks such as classification and named entity recognition |
| **GPT** | Decoder | Text **generation** and completion |
| **T5** | Encoder-decoder | Sequence-to-sequence tasks such as translation and summarization |

## AWS Mapping for Time Series and NLP

| Task | Suitable choice |
|------|------|
| Demand and sales time-series forecasting | **DeepAR** (SageMaker), Amazon Forecast |
| Text classification and embeddings (traditional) | **BlazingText** (Word2Vec/classification) |
| Machine translation | **Seq2Seq** (SageMaker built-in), Amazon Translate if managed |
| Entity, sentiment, and key phrase extraction (managed) | **Amazon Comprehend** |
| Speech-to-text (managed) | **Amazon Transcribe** |
| Generation, summarization, QA (large language models) | SageMaker JumpStart, **Amazon Bedrock** |

### How to Turn Text into Numbers

To feed text into a sequence model, you first have to convert it into a representation.

| Representation | Method | Strength | Limitation |
|---|---|---|---|
| Bag-of-Words / TF-IDF | Word frequencies as a vector | Simple and fast, enough for traditional classification | **Discards word order entirely** |
| Word embeddings (Word2Vec, etc.) | Learn words as dense vectors | Words with close meanings get close vectors | Cannot distinguish polysemous words by context |
| Contextual embeddings (Transformer-based) | Reflect the context within the sentence | Strong on polysemy and context | High compute cost |

- SageMaker **BlazingText** supports both Word2Vec (embeddings) and text classification.
- For tasks where word order matters (translation, named entity recognition), the Bag-of-Words family is unsuitable.

### Training Your Own vs Managed AI Services

| Situation clue | Choice | Why |
|---|---|---|
| "We have no ML specialists," "we want to plug it in quickly" | Comprehend, Translate, Transcribe | API calls with no training |
| "We must recognize our domain terminology" | Custom training (BlazingText, Seq2Seq) or fine-tuning | A general model is not enough |
| "Demand for thousands of SKUs at once" | DeepAR / Forecast | Learns many time series together |
| "Generation tasks like summarization and question answering" | JumpStart / Bedrock | Uses large language models |

In time-series forecasting, DeepAR learns many related time series **together**, letting series with sparse data borrow patterns from other series (a global model). When there are many similar series (demand per store or per SKU), it is stronger than fitting ARIMA separately to each one. "Forecast demand for many products at once" is a DeepAR/Forecast signal.

### Reading Time-Series Regression Metrics

| Metric | What it tells you | When to prioritize | Trap |
|---|---|---|---|
| RMSE | Average error that penalizes large errors heavily | When big mistakes are costly | Swayed heavily by a single outlier |
| MAE | Average absolute error | When it must be robust to outliers | Treats large errors leniently |
| Convert to classification and use accuracy | (not recommended) | — | Meaningless on sparse series where demand is mostly 0 |

If you turn sparse demand data into a "sold/not sold" binary classification and evaluate it with accuracy, most values are 0, so predicting nothing at all still produces a high number. Evaluate regression tasks with RMSE and MAE, and imbalanced classification with recall and PR-AUC.

## Question Clue → Answer Mapping

| If the question says this | It points to |
|---|---|
| "It cannot remember information from the distant past" | Long-term dependency → LSTM/GRU |
| "Input and output lengths differ" | seq2seq (encoder-decoder) |
| "Quality drops only on long inputs" | Context bottleneck → attention |
| "We want to cut time by training in parallel" | Transformer (self-attention) |
| "Thousands of time series in one model" | DeepAR / Amazon Forecast |
| "Extract sentiment and entities right away, without training" | Amazon Comprehend |
| "Recorded audio files to text" | Amazon Transcribe |
| "Quickly use a pretrained large model" | JumpStart / Bedrock |

"It's the latest technology, so always Transformer" is a wrong path. If the question has clues such as "managed and fast" or "no ML staff," the answer is not a model structure but a **managed AI service**.

## Symptom → Cause → Remedy

| Symptom | Cause | First remedy |
|---|---|---|
| Cannot use information from the start of a long sentence | Long-term dependency failure (vanishing gradients) | LSTM/GRU, or Transformer |
| Loss suddenly explodes during training | Exploding gradients | Gradient clipping, smaller learning rate |
| Translation quality is bad only on long sentences | Fixed context vector bottleneck | Introduce attention |
| Adding GPUs does not speed up training | The sequential processing structure of RNNs | Switch to the Transformer family |
| Building a separate model per time series is unmanageable | Individual-model approach | Global model with DeepAR/Forecast |
| Almost no labeled text | Insufficient supervised data | Fine-tune a pretrained model (JumpStart) |

The next post covers how these structures are actually **trained** — loss, optimizers, learning rate, regularization, and transfer learning.

## 📖 Glossary

- **Sequence data**: data where the order itself carries meaning. Text, time series, speech, and logs qualify.
- **Hidden state**: the RNN's memory vector that carries information up to the previous step and passes it to the next.
- **BPTT**: applying backpropagation to an RNN unrolled along the time axis. The reason vanishing and exploding gradients get severe.
- **Long-term dependency**: the property that information from the distant past must be reflected in the current output. A point where simple RNNs are weak.
- **Cell state / gates**: the path the LSTM uses to carry information over long distances / switches learned to control what to erase, add, and emit.
- **seq2seq (encoder-decoder)**: a structure that compresses an input sequence into a vector and then generates an output sequence of a different length.
- **Attention**: a mechanism that references the relevant parts of the input by weighting them at each output step. It resolves the bottleneck.
- **Self-attention**: attention applied to every pair of positions inside a single sequence. The foundation of the Transformer.
- **Positional encoding**: a device that separately adds the order information attention does not know to the input.
- **DeepAR**: a SageMaker built-in time-series forecasting algorithm that learns many related time series together.

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
