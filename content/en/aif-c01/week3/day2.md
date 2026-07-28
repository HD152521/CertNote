# Day 2 - How LLMs Work: Tokens, Embeddings, Context Window, and Inference

Yesterday we learned that LLMs "probabilistically predict the next token." But a model is a computer. Computers don't understand letters. They only understand numbers. So how does a sentence like "The weather is nice today" become numbers that go into the model, and how does it come back out as letters?

Today we'll trace how text is processed inside an LLM using four core concepts: **Token → Embedding → Context Window → Inference**. These four terms appear directly on the AIF exam and are also the keys to understanding cost and performance. Our goal is to understand without formulas—like drawing a picture.

## Tokens: The Unit by Which Models Divide Text

LLMs don't receive sentences all at once. They cut them into small pieces called **tokens** and process them. A token can be a word, part of a word, or even a single letter.

```
"Generative AI is amazing"
→ Tokenization → ["Gener", "ative", " AI", " is", " amaz", "ing"]   (example)

"unbelievable"
→ ["un", "believ", "able"]   (English is typically broken into word pieces)
```

Why break it up this way rather than using whole words? Because it's impossible to put every word in the world into a dictionary. If only frequently used pieces (subwords) are in the dictionary, even new words can be expressed by combining pieces. This is called **subword tokenization**.

There are two reasons why tokens matter in practice:

1. **Cost**: Most LLM services, including Bedrock, charge based on **input tokens + output tokens**. Using fewer tokens reduces costs.
2. **Limits**: There's an upper bound on the number of tokens a model can process at once (the context window).

> 💡 **Related theory**: For English, there's a rough rule of thumb: "1 token ≈ 0.75 words" or "100 tokens ≈ 75 words." For Korean, Chinese, and Japanese, each character often breaks into multiple tokens, so the same meaning typically consumes more tokens than English. When estimating costs for multilingual applications, you need to account for language-specific token efficiency differences. On the AIF exam, when a "cost reduction" scenario appears, the textbook answer is to reduce prompt/response length to save tokens.

## Embeddings: Turning Tokens into "Meaning-Carrying Numbers"

Even though we've cut text into tokens, they're still letters. Now we convert each token into a **numeric vector**. This is called an **embedding**. Embeddings are usually lists of hundreds to thousands of numbers.

```
"king"  → [0.21, -0.47, 0.88, ... ]   (e.g., 1536 numbers)
"queen" → [0.19, -0.42, 0.91, ... ]   (positioned similarly to king)
"apple" → [-0.66, 0.13, -0.05, ... ]  (positioned far from king)
```

The key insight is that **words with similar meanings are positioned close together in vector space**. "king" and "queen" are close, while "king" and "apple" are far apart. The model calculates relationships between words in this numeric space. A famous example is the vector arithmetic "king - man + woman ≈ queen."

The primary applications using this "semantic distance" are **semantic search** and **RAG (Retrieval-Augmented Generation)**. By converting questions to embeddings and pre-embedding documents, you can find documents that are semantically similar, not just keyword-matching.

> 🔍 **Going deeper**: The main models for creating embeddings at AWS are **Amazon Titan Embeddings** or Cohere Embeddings, called through Bedrock. The created embedding vectors are stored in a **vector database** (e.g., Amazon OpenSearch's vector search, Aurora pgvector, Amazon Kendra) to perform similarity searches. How close two vectors are is usually measured by **cosine similarity**. On the AIF exam, when you see "a chatbot that answers based on internal documents," think of the embedding + vector DB + RAG combination.

## Context Window: The Model's "Working Memory" Limit

The **context window** is the maximum number of tokens a model can "see simultaneously" at once. The combined tokens of input (prompt) and output (response) cannot exceed this limit. For humans, it's like "how much information you can hold in your head at one time."

| Context Window | Approximate Size | Meaning |
|-----------------|-----------|------|
| 4K tokens | about 3,000 words | Short conversations, simple summaries |
| 32K tokens | about 24,000 words | Long document analysis |
| 200K tokens | about 150,000 words | Context comparable to an entire book |

Why the context window matters:

- **If too long**: Content beyond the limit gets cut off and the model "forgets." Also, more tokens increase cost and latency.
- **Conversation memory**: Chatbots resubmit the entire previous conversation as input each turn. Long conversations fill the context window, and eventually the earlier parts get cut off.

> ⚠️ **Trap**: A common misunderstanding is "the model remembers all our company's data." This is wrong. The model only knows what it saw during training plus what we provide in the context window each time. Content outside the window, it doesn't know. That's why when dealing with vast internal knowledge, instead of putting everything into the model, you use RAG to "select only the parts relevant to the question" to put in the window.

## Inference: The Process of a Trained Model Generating Answers

**Inference** is the process of inputting data into an already-trained model and receiving output. It's important to distinguish between training (learning) and inference.

| Aspect | Training | Inference |
|------|----------------|------------------|
| What it does | Adjust model parameters with data | Generate answers with a completed model |
| Frequency | Once (or occasionally retrained) | With every request |
| Cost structure | Massive one-time cost | Per-request token-based cost |
| Role in AIF | Mostly handled by FM providers | What users interact with daily |

When inferring, a key parameter that controls the "character" of the output is **temperature**.

- **Low temperature (e.g., 0.1)**: Conservatively selects the highest-probability token → Consistent and predictable answers. Suitable for fact-based work (classification, extraction).
- **High temperature (e.g., 0.9)**: Selects less probable tokens → High diversity but variable. Suitable for brainstorming and creative work.

Besides this, parameters like **Top-P (nucleus sampling)** and **Top-K** adjust the range of candidate tokens. Response length is limited by **max tokens**.

> 💡 **Related theory**: Temperature is a dial that makes the probability distribution "flat" or "sharp." When temperature approaches 0, the distribution becomes sharp, so almost always only the 1st-ranked token is selected (close to deterministic), and when temperature is high, the distribution becomes flat, increasing the probability of selecting lower-ranked tokens (higher diversity). A significant part of the non-determinism—getting different answers to the same prompt each time—comes from this sampling. For business automation where consistency matters, the standard practice is to set temperature low.

## Seeing the Entire Flow at Once

```
User input: "Summarize this email: ..."
   │
   ▼ ① Tokenization   → ["Sum", "mar", "ize", " this", " email", ...]
   │
   ▼ ② Embedding     → Convert each token to a meaning vector
   │
   ▼ ③ Within the context window, Transformer calculates relationships
   │
   ▼ ④ Inference (repeat next token prediction) — adjust character with temperature
   │
   ▼ Output: "This email notifies you of a change to the meeting schedule."
```

Understanding this flow explains all at once: "Why is a long prompt expensive (tokens ↑)," "Why are answers different to the same question (sampling)," and "Why can't we put all internal documents in (context window limit)."

> 📚 **Case study**: A fintech startup was building a customer terms-of-service Q&A chatbot and initially put the complete terms document into the prompt with every question. Tokens skyrocketed, costs soared, and response times slowed. Later, they divided the terms into chunks, stored them as embeddings in a vector DB, and switched to RAG to select only chunks semantically close to the question. Token usage dropped significantly, and both response speed and accuracy improved. Understanding tokens, embeddings, and context windows makes such design decisions natural.

## Wrapping Up

Today's framework has four stages. Cut text with **tokens**, convert meaning into numbers with **embeddings**, process within the working memory called the **context window**, and generate answers by repeatedly predicting the next token through **inference**. Costs depend on tokens, memory limits on the context window, and output diversity on temperature.

In the next session, we'll see "how to talk to this model to get the answers we want"—the basics of prompt engineering. The same model can produce completely different results depending on how you write your prompt.

---

## 📝 연습 문제

**문제 1.** Which of the following is the most accurate explanation of "token" in LLMs?

A) It always means exactly one word  
B) It is a unit into which a model divides text for processing, and can be a word, word fragment, or letter  
C) It is a security token used for user authentication  
D) It is a score representing model accuracy  

**정답: B**  
해설: A token is the basic unit by which a model processes text. In subword tokenization, it can be a complete word, a word fragment, or even a single letter. A is incorrect because tokens are not always words. C confuses it with tokens in security, and D is unrelated to accuracy. Most LLM services charge based on input + output token count, so it directly affects costs.

---

**문제 2.** Which of the following is a correct characteristic of embedding?

A) Words with similar meanings are positioned close together in vector space  
B) All words are converted to identical vectors  
C) Embedding compresses text into a summary that humans can read  
D) Embedding is used only for training and cannot be used for search  

**정답: A**  
해설: Embedding converts tokens/text into numeric vectors carrying meaning, positioning those with closer meaning nearer to each other. This property is used to implement semantic search and RAG. B is incorrect because each word has a different vector, C is incorrect because embeddings are numeric vectors, not human-readable summaries, and D is incorrect because embeddings are crucial for search, recommendation, and RAG.

---

**문제 3.** What does context window mean?

A) The time it takes to train a model  
B) The maximum number of input + output tokens a model can process simultaneously at once  
C) The size of the screen on which a model responds  
D) A permanent database that a model stores  

**정답: B**  
해설: The context window is the maximum number of tokens (prompt + response) that a model can see together at one time. Exceeding this causes older content to be cut off, and more tokens increase cost and latency. A is unrelated to training time, C is unrelated to the UI, and D is incorrect because models don't do permanent storage. Content exceeding the window must be selectively input using RAG or similar methods.

---

**문제 4.** You want to automate a fact-based, consistent classification task. What is the most appropriate temperature setting?

A) Set temperature high (e.g., 0.9) to increase diversity  
B) Set temperature low (e.g., 0.1) to encourage consistent and predictable output  
C) Temperature does not affect output  
D) Set temperature to a negative number  

**정답: B**  
해설: When temperature is low, the model conservatively selects high-probability tokens, producing consistent and predictable answers suitable for fact-based work like classification and extraction. Conversely, creative or brainstorming work benefits from high temperature. C is incorrect because temperature directly affects output diversity, and D is incorrect because typically only values 0 or above are valid.

---

**문제 5.** Which of the following is a correct difference between training and inference?

A) Training happens with every request, and inference happens only once  
B) Training is the process of adjusting model parameters with data, and inference is the process of generating answers with a trained model  
C) They are the same thing  
D) Inference modifies the model with data, and training only generates answers  

**정답: B**  
해설: Training is a one-time (or occasional) process of adjusting model parameters with data, and inference is a per-request process of inputting to an already-trained model to get output. A is incorrect because it reverses their frequency, C is incorrect because they are clearly different concepts, and D is incorrect because it reverses the roles of training and inference.

---
