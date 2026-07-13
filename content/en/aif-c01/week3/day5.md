# Day 5 - Week 3 Comprehensive Review: Wrapping Up Generative AI Fundamentals at a Glance

This week we covered the highest-weight section of AIF-C01: the fundamentals of generative AI. Monday started with "how is generative AI different from traditional ML," where we captured foundation models and LLMs. Tuesday we opened them up to see tokens, embeddings, context windows, and inference. Wednesday we learned how to communicate well with models (prompt engineering), and Thursday we addressed its limits and risks (hallucinations, bias, non-determinism).

Today we tie scattered pieces into one big picture. Exams ask less "define this concept separately" and more "which choice fits this scenario?"—so catching connections between concepts is key. Rather than new material, we'll re-thread the essentials and organize frequently appearing comparisons, traps, and service mappings.

## Week 3 in One Sheet

```
[Day1] Generative AI = Creates new content (≠ Traditional ML's judge/predict)
          └ Foundation: Foundation Model (FM) → FM for language = LLM
                                          └ AWS: Call via Amazon Bedrock
                    │
[Day2] Inside LLM: Text → [Tokenization] → [Embedding (meaning vectors)]
                          → [Process in context window] → [Inference (predict next token)]
                    └ Cost=tokens, memory limit=window, diversity=temperature
                    │
[Day3] Writing well: Prompt Engineering (instruction·context·input·format)
                    └ Zero-shot / Few-shot(In-Context Learning) / CoT
                    └ Order to try: Prompts → RAG → Fine-tuning
                    │
[Day4] Risks: Hallucination · Bias · Non-determinism (+privacy·copyright·toxicity·injection)
                    └ Responsible AI: Clarify(bias) / Guardrails(safety) / AI Service Cards(transparency)
                    └ Human-in-the-loop for high-risk areas
```

This flow alone reviews 80% of Week 3. If you can explain "why" for each arrow, you're exam-ready.

## Core Terms Quick Reference

| Term | One-line Definition |
|------|-----------|
| Generative AI | AI that creates new content (text, images, code) |
| Foundation Model (FM) | A massive foundational model pre-trained once and reused across tasks |
| LLM | An FM handling language, essence is predicting next token |
| Transformer | Self-attention-based core architecture of LLMs |
| Token | Unit by which model divides text (basis for charge and limits) |
| Embedding | Converting tokens/text into numeric vectors carrying meaning |
| Context Window | Maximum input + output tokens processable at once |
| Inference | Process of generating answers with a trained model (per request) |
| Temperature | Controls output diversity/creativity (lower = more consistent) |
| Zero/Few-shot | Prompt technique giving 0 or a few examples |
| RAG | Technique to search external/internal documents and reflect in answers |
| Fine-tuning | Additional training to adjust model weights for a domain |
| Hallucination | Phenomenon of plausibly generating false content |
| Bias | Learning data prejudice to produce unfair output |
| Non-determinism | Property where same input can produce different outputs |

> 💡 **Related theory**: Rather than memorizing these terms separately, anchor them on two axes: "the journey of text passing through the model" and "the ladder of methods to handle the model (prompts → RAG → fine-tuning)." Most exam questions point to one location on these two axes.

## Frequently Appearing Comparisons

**Traditional ML vs Generative AI**: If judge/predict, traditional ML; if generate new content, generative AI.

**Prompt vs RAG vs Fine-tuning**:
- Change only format/tone → Prompts (cheapest and fastest).
- Supply unknown information (latest, internal) → RAG (no weight change).
- Deeply internalize domain patterns → Fine-tuning (expensive, weights change).

**Zero-shot vs Few-shot**: 0 examples vs a few. Both are In-Context Learning so don't change weights (distinguish from fine-tuning).

**Low vs High temperature**: Low = consistent, fact-based; High = diverse, creative.

> ⚠️ **Traps**: Two most confusing things on exams. ① "Few-shot ≠ learning." You show examples in the prompt but don't change weights. ② "RAG ≠ fine-tuning." RAG isn't learning—it's "inserting reference material." ③ "Longer prompt ≠ better answer." Clarity matters more than length.

## AWS Service Mapping (Connections AIF Frequently Tests)

| Need | AWS Service/Feature |
|------|-----------------|
| Manage multiple FMs with single managed API | Amazon Bedrock |
| Generate embeddings | Amazon Titan Embeddings (Bedrock) |
| Store embeddings·similarity search (RAG) | OpenSearch vectors, Aurora pgvector, Kendra |
| Filter harmful content·mask PII·restrict topics | Amazon Bedrock Guardrails |
| Measure data/model bias, provide explainability | Amazon SageMaker Clarify |
| Public documentation of AI service intent·limits·fairness | AWS AI Service Cards |
| Code generation·autocomplete assistance | Amazon Q Developer |

> 🔍 **Going deeper**: Exam scenarios usually ask "requirements → appropriate service." "Chatbot based on internal documents" = Bedrock + embeddings + vector DB (RAG); "block profanity and personal info in output" = Guardrails; "check if model is fair" = Clarify; "need transparency and responsibility documents" = AI Service Cards. Memorizing these keyword-service pairs helps you solve variations.

## Self-Check (Answer These Mentally)

1. In one sentence, how do you distinguish traditional ML from generative AI?
2. Why is foundation model economically advantageous?
3. How do tokens connect to cost?
4. What role does embedding play in RAG?
5. What happens when you exceed the context window?
6. Difference between Zero-shot and Few-shot, and why neither is fine-tuning?
7. Standard order to try model adjustment methods (cheapest first)?
8. Explain hallucination, bias, and non-determinism each in one line?
9. Two ways to reduce hallucination?
10. What's the essential safeguard for high-risk decisions?

If you're stuck on any, go back to that day's reading. If answers flow smoothly, Week 3 is passing.

> 📚 **Case study**: When a company introduced "generative AI for customer support automation," the team followed the sequence from Week 3 exactly. ① Rented FM via Bedrock, ② refined tone/format through prompt engineering, ③ embedded internal FAQs and raised accuracy via RAG, ④ blocked sensitive info and toxic language with Guardrails, ⑤ escalated high-risk requests like refunds and account deletion to humans via Human-in-the-loop. Not fancy new tech—the core was fundamental principles: "cheap methods first, control risks." That's what made it succeed.

## Wrapping Up—and Next Week

In Week 3, we completed a full circle on "what (concepts)," "how (operation and use)," and "what to watch (risks)" of generative AI. The essence compresses to three sentences: **Generative AI is an FM/LLM that creates new content, operates via tokens·embeddings·context·inference, and is handled by the order prompts → RAG → fine-tuning, with hallucinations·bias·non-determinism controlled by responsible AI tools and human review.**

On this foundation, starting next week we'll zoom into AWS's specific generative AI services (especially Amazon Bedrock and its surrounding tools) and move into actually combining solutions. Today's big picture becomes the coat rack on which all that detail hangs.

---

## 📝 연습 문제

**문제 1.** When synthesizing Week 3's essence, which correctly orders methods of adjusting model behavior from lowest to highest cost/difficulty?

A) Fine-tuning → RAG → Prompt engineering  
B) Prompt engineering → RAG → Fine-tuning  
C) RAG → Prompt engineering → Fine-tuning  
D) The three methods have no cost difference  

**정답: B**  
해설: The standard is to try cheapest and fastest prompt engineering first, move to RAG if external/internal knowledge is needed, then consider fine-tuning if deep domain internalization is required. A and C have the order wrong. D is incorrect because fine-tuning is most expensive.

---

**문제 2.** Which pairing of AWS service and its purpose is correct?

A) Amazon SageMaker Clarify—measuring data/model bias and explainability  
B) Amazon Bedrock Guardrails—improving model training speed  
C) AWS AI Service Cards—storing embedding vectors  
D) Amazon Bedrock—only image compression  

**정답: A**  
해설: SageMaker Clarify provides bias metrics and feature importance (explainability). B's Guardrails is a safety tool for filtering harmful content and masking PII, unrelated to training speed. C's AI Service Cards document transparency on intended use, limitations, and fairness—not vector storage. D's Bedrock calls multiple FMs and isn't primarily for image compression.

---

**문제 3.** What is the most important difference between "Few-shot prompting" and "Fine-tuning"?

A) Few-shot doesn't change model weights; fine-tuning does change them  
B) Few-shot is always more expensive than fine-tuning  
C) Both retrain the model from scratch  
D) Fine-tuning means inserting examples into the prompt  

**정답: A**  
해설: Few-shot is In-Context Learning showing examples in the prompt—no weight change. Fine-tuning changes weights through additional training. B is generally wrong because fine-tuning is more expensive. C is incorrect—neither is from-scratch retraining. D describes Few-shot, not fine-tuning.

---

**문제 4.** You want to build a chatbot that answers accurately based on latest internal policy documents and reduce hallucination. What's the most appropriate combination?

A) Maximize temperature and increase examples  
B) Embed internal documents, store in vector DB, provide related documents via RAG  
C) Just increase model size and it solves itself  
D) Write the longest prompt possible  

**정답: B**  
해설: Unknown company info requires RAG to search related documents and include them in the prompt—this improves accuracy and reduces hallucination. A increases hallucination by raising temperature. C doesn't guarantee internal knowledge. D doesn't guarantee accuracy.

---

**문제 5.** Which risk and its explanation are incorrectly paired?

A) Hallucination—plausibly generating false content  
B) Bias—learning data prejudice to produce unfair output  
C) Non-determinism—same input can produce different outputs  
D) Hallucination—model permanently refuses to respond  

**정답: D**  
해설: Hallucination is generating false content as if true, not refusing to respond. So D is the incorrect pairing. A is hallucination, B is bias, C is non-determinism—all correctly paired.

---
