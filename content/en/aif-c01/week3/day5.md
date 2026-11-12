# Day 5 - Week 3 Comprehensive Review: Tying Together Generative AI Basics at a Glance

## 📌 Key Takeaways

- Generative AI consists of FMs/LLMs that create new content, and it works in the order **token → embedding → context window → inference**.
- The ways of handling a model get more expensive in the order **prompt → RAG → fine-tuning**. Format and tone are for prompts, information the model doesn't know is for RAG, and deep internalization is for fine-tuning.
- Few-shot and RAG both **leave the weights unchanged.** They merely insert examples or documents into the prompt. Only fine-tuning changes the weights.
- The risks are hallucination, bias, and non-determinism, and each symptom has a different remedy. Hallucination is handled with grounding (RAG) and review, bias with measurement (Clarify), and non-determinism with inference parameters and a verification step.
- For high-risk decisions, place a final human review (Human-in-the-loop). The output of generative AI is a draft, not verified fact.

## Week 3 on One Page

This week we passed through AIF-C01 Domain 2, "Fundamentals of Generative AI" (24% of scored questions). Domain 3, "Applications of Foundation Models" (28%), the heaviest domain, stands on these fundamentals too, so more than half of the two domains combined hinges on this week's concepts.

- Monday: Started with "How is generative AI different from traditional ML?" and grasped foundation models and LLMs.
- Tuesday: Opened them up and looked at tokens, embeddings, the context window, and inference.
- Wednesday: How to talk to a model well (prompt engineering).
- Thursday: Its limits and risks (hallucination, bias, non-determinism).

Since the exam tends to weave concepts together as "What is the right choice for this scenario?" rather than ask about them separately, grasping the connections between concepts is the key.

```
[Day1] Generative AI = creating new content (≠ traditional ML's judgment/prediction)
          └ Foundation: Foundation Model (FM) → FM for language = LLM
                                          └ AWS: invoked through Amazon Bedrock
                    │
[Day2] Inside an LLM:  text → [tokenization] → [embedding (semantic vector)]
                          → [processing within the context window] → [inference (next-token prediction)]
                    └ cost = tokens, memory limit = window, diversity = temperature
                    │
[Day3] Using it well:   Prompt engineering (instruction, context, input, format)
                    └ Zero-shot / Few-shot (In-Context Learning) / CoT
                    └ Order to try: prompt → RAG → fine-tuning
                    │
[Day4] Risks:      hallucination · bias · non-determinism (+ privacy, copyright, toxicity, injection)
                    └ Responsible AI: Clarify (bias) / Guardrails (safety) / AI Service Cards (transparency)
                    └ Human-in-the-loop for high-risk areas
```

This one flow reviews 80% of Week 3. If you can explain "why" for each arrow, you are ready for the exam.

## Quick Summary of Key Terms

| Term | One-line definition |
|------|-----------|
| Generative AI | AI that creates new content (text, images, code) |
| Foundation Model (FM) | A huge foundation model pretrained once and reused for many tasks |
| LLM | An FM that handles language; at its core, next-token prediction |
| Transformer | The core LLM architecture based on self-attention |
| Token | The unit into which a model cuts text (the basis for billing and limits) |
| Embedding | Text/tokens converted into numeric vectors that carry meaning |
| Context window | The maximum of input + output tokens that can be processed at one time |
| Inference | The process of generating an answer with a trained model (on every request) |
| temperature | Controls the diversity/creativity of the output (lower is more consistent) |
| Zero/Few-shot | A prompt technique giving 0 examples / a few examples |
| RAG | A technique that retrieves external/in-house documents and reflects them in the answer |
| Fine-tuning | Adjusting model weights to a domain through additional training |
| Hallucination | The phenomenon of plausibly inventing content that is not factual |
| Bias | Learning the prejudices of the data and producing unfair output |
| Non-determinism | The property that the output can differ even for the same input |

Rather than memorizing these terms separately, hanging them on two axes, "the journey of text through the model" and "the ladder of ways to handle a model (prompt → RAG → fine-tuning)," makes them last longer. Finding where the question's situation falls on these two axes gives you a clue to solving it.

## Comparison Summary

- **Traditional ML vs generative AI**: If it is judgment/prediction, traditional ML; if it is generating new content, generative AI.
- **Prompt vs RAG vs fine-tuning**:
  - Changing only format and tone → prompt (cheapest and fastest).
  - Supplying information the model doesn't know (latest, in-house) → RAG (no weight change).
  - Deeply internalizing domain patterns → fine-tuning (expensive, changes weights).
- **Zero-shot vs Few-shot**: 0 examples vs a few. Both are In-Context Learning, so they don't change weights (distinguish from fine-tuning).
- **Low vs high temperature**: Low is consistent and fact-based; high is diverse and creative.

> ⚠️ **Pitfall**: Three points that are especially confusing on the exam. ① "Few-shot = training" is wrong. Examples are merely shown in the prompt; the weights do not change. ② "RAG = fine-tuning" is wrong. RAG is not training but "inserting reference material." ③ "A longer prompt = a better answer" is wrong. Clarity matters more than length.

## New Perspective 1: How a Single Question Becomes an Answer

We rebuild what we learned by day of the week as **the life of a single request**. The situation is asking an internal policy chatbot, "What is the business trip expense limit?"

| Order | What happens | Day learned | Where money and limits are involved |
|------|------|------|------|
| ① | Convert the question into an embedding and find nearby policy fragments in the vector store | Day 2 | Embedding calls, vector store operation |
| ② | Assemble the instruction + retrieved fragments + question into one prompt | Day 3 | **Input tokens** for the assembled length |
| ③ | The entire prompt must fit inside the context window | Day 2 | If it overflows, it is cut off or the request is rejected |
| ④ | The model picks the next token one at a time to build the answer | Day 1·2 | **Output tokens** for the answer length; temperature sets the diversity |
| ⑤ | Check that the answer matches the source documents and contains no harmful or sensitive content | Day 4 | Guardrail checks |
| ⑥ | A person confirms high-impact items such as refunds or disciplinary actions | Day 4 | People's time |

- Without ①, the model doesn't know the policy and **makes up a plausible number** at ④. This is the typical path of hallucination.
- If you attach too many documents at ②, you hit the limit at ③ and the cost rises. That is why RAG inserts "only the relevant fragments," not "everything."
- A chatbot re-inserts the previous conversation into ② on every turn. The longer the conversation, the larger the input tokens on every turn.
- The exam guide calls this work of "designing what goes into the window" **context engineering**. It is a broader concept than polishing prompt sentences, and deals with the allocation of instructions, retrieval results, conversation history, and tool results.

## New Perspective 2: Telling Similar Concepts Apart

**Embedding · vector store · RAG** appear together in one sentence and look like the same thing, but their roles differ.

| Concept | What it is | Analogy |
|------|------|------|
| Embedding | The **result** of converting text into a numeric vector that carries meaning (and the model that converts) | A coordinate attached to each book |
| Vector store (vector DB) | A **repository** that stores those vectors and finds the nearby ones | A bookshelf where you find books by coordinates |
| RAG | The **whole method** of attaching the retrieved content to the prompt and having the model answer | A librarian's procedure of opening the books and answering |

**temperature · Top-P · Top-K** all set "how boldly to pick the next token," but they act on different places. We borrow an example from AWS documentation. Suppose the candidates for "I hear hoofbeats. That is a ___" are horse 0.7, zebra 0.2, unicorn 0.1.

| Parameter | What it does | In the example above |
|------|------|------|
| temperature | Changes the **shape** of the probability distribution. Low makes it sharp, high makes it flat | Raising it increases the chance that unicorn is picked |
| Top-K | Keeps only the top **K** by probability as candidates | With K=2, only horse and zebra are candidates |
| Top-P | Keeps candidates only **until the cumulative probability reaches P** | With P=0.7, only horse; with 0.9, horse and zebra |
| Max tokens (response length) | Limits the length of the answer | Unrelated to diversity; directly tied to cost and latency |

- Lowering any of the three makes output consistent, and raising it makes it diverse. Since the direction is the same, on the exam you answer "consistency needed → lower it, creativity needed → raise it."
- None of the parameters **makes the model know a fact it doesn't know.** Even with temperature at 0, knowledge it lacks does not appear.

## New Perspective 3: From Symptom to Remedy

| Symptom | Cause | What to do first | Remedies that don't work |
|------|------|------|------|
| It answers the latest internal policy wrongly | The model has never seen that information | Supply documents with RAG | Lowering temperature, an "answer accurately" instruction |
| It cites papers or cases that don't exist | Hallucination | Provide source documents, require citations, human review | Merely swapping in a bigger model |
| The answer format differs every time | Output format not specified | Specify the format, examples (Few-shot) | Trying fine-tuning first |
| Answers differ for the same question, making testing hard | Non-determinism of sampling | Lower temperature and Top-P, add a verification step | Writing a longer prompt |
| It forgets earlier content after a long conversation | Context window exceeded | Summarize the conversation, re-insert only the relevant parts | Adjusting temperature |
| The bill is larger than expected | Too many input and output tokens | Shorten prompt and response length, consider a smaller model | Adding more examples |
| Answers that disadvantage a specific group appear | Bias in the training data | Measure results by group, human oversight | Merely adding banned words to a guardrail |
| Profanity or personal information gets mixed into answers | No output control | Filter/mask with Guardrails | Adding Few-shot examples |

## AWS Service Mapping (Connections AIF Asks About)

| Need | AWS service/feature |
|------|-----------------|
| Call multiple FMs as managed through a single API | Amazon Bedrock |
| Generate embeddings | Amazon Titan Embeddings and other Bedrock embedding models |
| Store embeddings and similarity search (RAG) | Amazon OpenSearch Service, Amazon Aurora and RDS for PostgreSQL (pgvector), Amazon Neptune |
| RAG as managed, all at once | Amazon Bedrock Knowledge Bases |
| Harmful content filtering, PII masking, topic restriction | Amazon Bedrock Guardrails |
| Measuring data and model bias, explainability | Amazon SageMaker Clarify |
| Public documentation of an AI service's intended use, limits, and fairness | AWS AI Service Cards |
| Code generation and autocomplete assistance | Amazon Q Developer, Kiro |

- The four services in the vector store row are ones the exam guide itself cites as examples of "services that store embeddings in a vector database." Amazon Kendra is not a vector DB but a managed search service that can take on the retrieval step of RAG, and it is currently not open to new customers.
- Coding assistance is in the middle of being renamed. End of support has been announced for the Amazon Q Developer IDE plugin, and AWS points to **Kiro** as the successor. The latest exam guide also lists Kiro as an in-scope service.

> 🔍 **Going Deeper**: Exam scenarios usually ask "requirement → suitable service." For "an in-house document-based chatbot," it is Bedrock + embeddings + a vector DB (RAG); for "profanity and personal information must be blocked in the output," Guardrails; for "check whether the model is fair," Clarify; for "transparency and accountability documentation is needed," AI Service Cards. If you memorize the keyword and service pairs, variant questions can be solved too.

## Self-Check (Answer in Your Head)

1. How would you distinguish traditional ML and generative AI in one sentence?
2. Why are foundation models economically advantageous?
3. How are tokens connected to cost?
4. What role do embeddings play in RAG?
5. What happens when you exceed the context window?
6. What is the difference between Zero-shot and Few-shot, and why are neither fine-tuning?
7. What is the standard order for adjusting model behavior (cheapest first)?
8. How would you explain hallucination, bias, and non-determinism in one line each?
9. What are two ways to reduce hallucination?
10. What safeguard is essential for high-risk decision-making?

If any item stumps you, go back to the write-up for that day. If the answers come easily, you have mastered the Week 3 scope well enough.

As a hypothetical case, when a company introduced "automating customer support with generative AI," the team followed the order learned in Week 3 exactly. ① They rented an FM through Bedrock, ② set the tone and format with prompt engineering, ③ embedded the in-house FAQ and raised accuracy with RAG, ④ blocked sensitive information and harmful expressions with Guardrails, and ⑤ handed high-risk requests such as refunds and account deletion over to people through Human-in-the-loop. It was not flashy new technology but the basic principle of "cheap things first, control the risks" that was the key to success.

Next week, building on these fundamentals, we look into AWS's concrete generative AI services (especially Amazon Bedrock and its surrounding tools) and move on to how to combine them into real solutions.

## 📖 Glossary

- **Foundation Model (FM)**: A large model pretrained once on vast data and reused for many tasks.
- **Token**: The unit into which a model cuts text. The basis for counting charges and limits.
- **Embedding**: Text meaning converted into a numeric vector. If meanings are similar, the vectors are close.
- **Vector store**: A repository that stores embeddings and finds nearby vectors.
- **Context window**: The maximum number of tokens the model can see at one time. Input and output are counted together.
- **Context engineering**: Designing what to put into the limited window among instructions, documents, and conversation history.
- **Top-P / Top-K**: Inference parameters that trim the candidates for the next token by cumulative probability or by count.
- **RAG**: A method that retrieves relevant documents and attaches them to the prompt for the model to answer. The model is left as it is.
- **Hallucination**: The phenomenon of plausibly producing content that is not factual.
- **Human-in-the-loop**: Putting a person into the procedure so that important outputs get a final human check.

## 📝 Practice Questions

**Question 1.** When synthesizing Week 3's essence, which correctly orders methods of adjusting model behavior from lowest to highest cost/difficulty?

A) Fine-tuning → RAG → Prompt engineering  
B) Prompt engineering → RAG → Fine-tuning  
C) RAG → Prompt engineering → Fine-tuning  
D) The three methods have no cost difference  

**Answer: B**  
Explanation: The standard is to try cheapest and fastest prompt engineering first, move to RAG if external/internal knowledge is needed, then consider fine-tuning if deep domain internalization is required. A and C have the order wrong. D is incorrect because fine-tuning is most expensive.

---

**Question 2.** Which pairing of AWS service and its purpose is correct?

A) Amazon SageMaker Clarify—measuring data/model bias and explainability  
B) Amazon Bedrock Guardrails—improving model training speed  
C) AWS AI Service Cards—storing embedding vectors  
D) Amazon Bedrock—only image compression  

**Answer: A**  
Explanation: SageMaker Clarify provides bias metrics and feature importance (explainability). B's Guardrails is a safety tool for filtering harmful content and masking PII, unrelated to training speed. C's AI Service Cards document transparency on intended use, limitations, and fairness—not vector storage. D's Bedrock calls multiple FMs and isn't primarily for image compression.

---

**Question 3.** What is the most important difference between "Few-shot prompting" and "Fine-tuning"?

A) Few-shot doesn't change model weights; fine-tuning does change them  
B) Few-shot is always more expensive than fine-tuning  
C) Both retrain the model from scratch  
D) Fine-tuning means inserting examples into the prompt  

**Answer: A**  
Explanation: Few-shot is In-Context Learning showing examples in the prompt—no weight change. Fine-tuning changes weights through additional training. B is generally wrong because fine-tuning is more expensive. C is incorrect—neither is from-scratch retraining. D describes Few-shot, not fine-tuning.

---

**Question 4.** You want to build a chatbot that answers accurately based on latest internal policy documents and reduce hallucination. What's the most appropriate combination?

A) Maximize temperature and increase examples  
B) Embed internal documents, store in vector DB, provide related documents via RAG  
C) Just increase model size and it solves itself  
D) Write the longest prompt possible  

**Answer: B**  
Explanation: Unknown company info requires RAG to search related documents and include them in the prompt—this improves accuracy and reduces hallucination. A increases hallucination by raising temperature. C doesn't guarantee internal knowledge. D doesn't guarantee accuracy.

---

**Question 5.** Which risk and its explanation are incorrectly paired?

A) Hallucination—plausibly generating false content  
B) Bias—learning data prejudice to produce unfair output  
C) Non-determinism—same input can produce different outputs  
D) Hallucination—model permanently refuses to respond  

**Answer: D**  
Explanation: Hallucination is generating false content as if true, not refusing to respond. So D is the incorrect pairing. A is hallucination, B is bias, C is non-determinism—all correctly paired.

---
