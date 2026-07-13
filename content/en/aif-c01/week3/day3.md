# Day 3 - Prompt Engineering Basics: Good Prompts, Zero/Few-shot, and Limitations

The quality of answers varies greatly depending on "how you ask," even with the same model and same question. "Write something" and "Explain photosynthesis in a way a 4th grader can understand, in exactly 5 sentences, using friendly language" produce completely different results. This "skill of asking the model well" is called **prompt engineering**.

With generative AI, you can get a substantial portion of desired results without retraining the model—just by writing good prompts. Compared to training and fine-tuning, which are expensive and slow, prompts can be changed instantly and for free. So on the AIF exam, when asked "What is the fastest, least expensive way to improve?" prompt engineering is often the answer. Today we'll look at the components of good prompts, key techniques like Zero-shot and Few-shot, and limitations you can't overcome with prompts alone.

## Elements of a Good Prompt

Good prompts come from structure, not luck. They typically include the following elements clearly:

| Element | Description | Example |
|------|------|------|
| **Instruction** | What to do | "Classify the sentiment of the following review" |
| **Context** | Background information | "We are an appliance e-commerce platform" |
| **Input Data** | What to process | "Review: 'Delivery was too slow'" |
| **Output Format** | Shape of the answer | "Answer with only one word: positive/negative/neutral" |

A prompt with these elements filled in produces much more stable results than a vague "analyze this." A few core principles:

1. **Be specific and clear**: Rather than "short," say "within 3 sentences."
2. **Assign a persona (role)**: Giving a role like "You are a friendly customer service representative" helps establish tone.
3. **Specify output format**: Stating the desired format (JSON, table, bullet points, etc.) makes post-processing easier.
4. **Provide examples**: Showing samples of desired answers increases accuracy (Few-shot).

> 💡 **Related theory**: Prompt engineering works because LLMs are further trained to "follow instructions" (instruction-tuned). A raw model trained only on pre-training simply concatenates the next token, but models aligned through human feedback (RLHF—Reinforcement Learning from Human Feedback) have learned to "understand and follow requests." The clearer the instructions and format you give, the more the model aligns its responses to that pattern. A prompt doesn't change the model's weights—it just conditions "which output distribution to draw from."

## Zero-shot vs Few-shot: How Many Examples Do You Provide?

The AIF exam most frequently classifies prompt techniques by "how many examples (shots) do you provide?"

**Zero-shot**: Provide only instructions, no examples. The model solves using pre-training knowledge alone.

```
Classify the sentiment of the following sentence as positive or negative.
Sentence: "This movie was absolutely amazing!"
Sentiment:
```

**Few-shot**: Show a few examples of correct answers first, then ask the real question. The model sees the pattern and follows it.

```
Sentence: "The food was terrible" → Negative
Sentence: "The service was friendly" → Positive
Sentence: "This movie was absolutely amazing!" →
```

**One-shot** is when you provide exactly 1 example.

| Technique | Number of Examples | When to Use |
|------|-----------|-----------|
| Zero-shot | 0 | When the task is simple/general and the model already knows it well |
| One-shot | 1 | When showing the output format once is sufficient |
| Few-shot | typically 2-5 | When the format is special or Zero-shot accuracy is low |

Few-shot doesn't change model weights. It simply shows examples within the prompt, so it's also called **In-Context Learning**. Don't confuse it with real training (fine-tuning).

> 🔍 **Going deeper**: A more advanced technique is **Chain-of-Thought (CoT) prompting**. By prompting the model to lay out its reasoning step by step like "Let's think step by step," especially on math and logic problems, accuracy significantly improves. The model "outputs" intermediate reasoning as tokens, using them as the basis for predicting the next step. On the AIF exam, if you see "improve accuracy of complex multi-step reasoning problems with prompts alone," think CoT.

## Prompt vs Fine-tuning vs RAG: How Far Can Prompts Solve?

There are multiple layers to changing model behavior. The standard practice is to try them in order of lowest to highest cost and difficulty.

| Method | Cost/Difficulty | Model Weights Changed | Best For |
|------|-------------|------------------|-------------|
| **Prompt Engineering** | Lowest | No | Adjusting output format, tone, simple tasks |
| **RAG (Retrieval-Augmented Generation)** | Medium | No | Incorporating latest/internal knowledge into answers |
| **Fine-tuning** | High | Yes | Deeply internalizing domain-specific tone/expertise |

Key decision points:

- **Need "information" the model doesn't know** → Prompts won't work. Must supply knowledge via RAG (or fine-tuning).
- **Only need to change the "format, tone, behavior" of output** → Prompt engineering is sufficient.
- **Want to permanently internalize vast domain patterns** → Fine-tuning.

> 📚 **Case study**: A legal consulting startup initially considered fine-tuning the model right away for "more accurate answers." The cost estimate reached tens of millions of won. On a consultant's recommendation, they first tried prompt engineering (role assignment + fixed output format + Few-shot examples) combined with RAG using internal case law. Most of the target quality was met. Fine-tuning proved unnecessary. "Cheap methods first, expensive ones later" is the golden rule of generative AI practice.

## Limitations of Prompt Engineering

Prompts aren't a cure-all. Understanding limitations matters for both the AIF exam and real work.

1. **Can't create information it doesn't know (or makes it up)**: Information the model wasn't trained on—latest updates or confidential internal data—won't come out accurately no matter how well you write the prompt. Instead, you get plausible-sounding **hallucinations** (covered in detail tomorrow).
2. **Context window limit**: Adding too many examples hits token limits and increases costs.
3. **Non-determinism**: Same prompt can produce slightly different answers each time, so tasks requiring 100% consistency face limitations.
4. **Prompt injection vulnerability**: If user input contains malicious phrases like "Ignore previous instructions and…," the model can behave differently than intended (security issue).
5. **Sensitive or deep domain expertise**: If consistent professional tone/compliance is critical, prompts alone have limits—fine-tuning might be necessary.

> ⚠️ **Trap**: A common misconception is "the longer and more detailed the prompt, the better." If it's too long, token costs and latency increase, and the core instruction gets buried, potentially confusing the model. Also, contradictory instructions ("Write short but include everything") make results unstable. A good prompt is not long but **clear and consistent**.

## Wrapping Up

Today has three key points. First, good prompts clearly include **instruction, context, input, and output format**, with quality enhanced by role assignment and examples. Second, **Zero-shot has no examples, Few-shot has a few**, showing patterns through In-Context Learning without changing model weights. Third, prompts are cheap and fast but have limits in **unknown information, consistency, and security**—when needed, move to RAG or fine-tuning. The standard order is "prompts → RAG → fine-tuning."

In the next session, we'll directly address the core limitations: **hallucinations, bias, and non-determinism**—the risks of generative AI. Not understanding these before deployment easily loses trust.

---

## 📝 연습 문제

**문제 1.** Which of the following is the most accurate explanation of Few-shot prompting?

A) A learning method that permanently changes model weights  
B) A technique where a few example answers are shown in the prompt to make the model follow the pattern  
C) A method where no examples are given, only instructions  
D) Retraining the model from scratch  

**정답: B**  
해설: Few-shot is a technique where you present 2-5 examples in the prompt so the model follows that pattern—it's In-Context Learning that doesn't change weights. A and D describe fine-tuning/retraining, which is incorrect. C describes Zero-shot without examples, which is incorrect.

---

**문제 2.** Which of the following is NOT a recommendation for writing a good prompt?

A) Specify the desired output format (e.g., JSON, one word)  
B) Assign a persona (role) to establish tone  
C) Write as ambiguously and generally as possible  
D) Give specific and clear instructions  

**정답: C**  
해설: The core of a good prompt is clarity and specificity. Specifying output format, assigning roles, and giving specific instructions are all recommended. C's "write ambiguously and generally" is the opposite—it reduces result consistency and quality, so it's not a recommendation.

---

**문제 3.** You need to reflect the contents of the latest internal documents the model wasn't trained on in your answers. What is the most appropriate approach?

A) Solve it by strongly instructing "answer accurately" in the prompt  
B) Use RAG (Retrieval-Augmented Generation) to find relevant documents and provide them with the prompt  
C) Lowering temperature to 0 will make unknown information accurate  
D) Increasing Few-shot examples will make the model know internal documents  

**정답: B**  
해설: Information the model wasn't trained on can't be obtained through prompt instructions or temperature adjustment alone—it actually causes hallucination. RAG, which searches for relevant documents and includes them in the prompt, is appropriate. A, C, and D all fail to supply "missing knowledge," so they're incorrect.

---

**문제 4.** What is the general standard order to try methods of adjusting model behavior from lowest to highest cost/difficulty?

A) Fine-tuning → RAG → Prompt engineering  
B) Prompt engineering → RAG → Fine-tuning  
C) RAG → Fine-tuning → Prompt engineering  
D) Fine-tuning → Prompt engineering → RAG  

**정답: B**  
해설: The standard is to try cheapest and fastest prompt engineering first, move to RAG if external knowledge is needed, and finally consider fine-tuning if deep domain internalization is required. A and D try expensive fine-tuning first, which isn't recommended. C has the order mixed up.

---

**문제 5.** Which of the following is NOT a limitation of prompt engineering?

A) Information the model wasn't trained on is hard to answer accurately, and hallucinations can occur  
B) The same prompt can produce different outputs each time (non-determinism)  
C) There is prompt injection vulnerability from malicious user input  
D) Output format and tone cannot be adjusted  

**정답: D**  
해설: Adjusting output format and tone is what prompt engineering does best—not a limitation. Meanwhile, hallucinations from unknown information (A), non-determinism (B), and prompt injection vulnerability (C) are all real limitations. Therefore, the one that is NOT a limitation is D.

---
