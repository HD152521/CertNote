# Day 4 - Full Mock Exam Pace: Five Domains Comprehensive Questions

## 📌 Key Takeaways

- The real exam does not ask questions in domain order. Get used to **domain jumps**: a foundations question, then security, then service mapping.
- The exam has 65 questions in 90 minutes, about 1 minute 20 seconds per question. Solve today's 8 questions within 11 minutes.
- For each question, first catch the **core verb or keyword** (extract, analyze, generate, recommend, predict, train directly).
- Settle three forks first and the choices are cut in half: "build it yourself vs. borrow it", "customer responsibility vs. AWS responsibility", and "which responsible AI principle is this?".
- After scoring, sort each miss into "didn't know / confused / misread". That sorting decides what to review for the rest of the day.

## Quick Pre-Solve Checklist

Today we stop studying new material and solve **a mixed set of questions across all 5 domains**, just like the real exam. The real AIF-C01 exam does not ask one domain at a time. A foundations question is followed suddenly by a security question, and then a service-mapping question. Getting comfortable with this "domain jump" is today's goal.

Keep two things in mind while solving.

- First, catch the **core verb or keyword in the question** ("extract", "recommend", "sentiment", "train directly").
- Second, the time pace. The real exam has 65 questions in 90 minutes, about 1 minute 20 seconds per question. Run through the 8 questions lightly, aiming to finish within 11 minutes. Check the explanations only after you have solved them.

Right before you start, ask yourself the following four things.

- Did I catch the verb? (extract / analyze / generate / recommend / predict)
- Did I distinguish "build it yourself vs. borrow it"? (SageMaker vs. AI services/Bedrock)
- For a security question, did I think of "customer responsibility vs. AWS responsibility"?
- For a value-judgment question, which responsible AI principle is it?

## The Shape of the Real Exam: Pace by the Numbers

| Item | Value | What it means for pacing |
|------|------|------|
| Total questions | 65 (50 scored + 15 unscored) | Unscored questions are not marked. Solve all of them the same way |
| Time | 90 minutes | About 83 seconds per question on average |
| Passing score | 700 on a scale of 100-1,000 | The line is "know it well enough", not a perfect score |
| No answer | Scored as incorrect | Never leave an answer blank |
| Guessing | No penalty for wrong answers | If you don't know, eliminate options and then choose |

Multiplying the domain weights by the 50 scored questions gives a rough question count. Today's 8 questions are also spread evenly across the five domains.

| Domain | Weight | Of 50 scored questions | Typical question |
|------|------|------|------|
| 1. AI/ML Fundamentals | 20% | About 10 questions | Terminology, learning methods, classification and regression |
| 2. Generative AI Fundamentals | 24% | About 12 questions | Tokens, embeddings, hallucination, inference parameters |
| 3. Applications of Foundation Models | 28% | About 14 questions | Choosing RAG vs. fine-tuning, prompting techniques, evaluation metrics |
| 4. Responsible AI | 14% | About 7 questions | Which principle, which tool |
| 5. Security, Compliance, and Governance | 14% | About 7 questions | Whose responsibility, which service |

- Domains 2 and 3 together make up more than half. If you are short on time, review the misses from these two domains first.
- Domains 4 and 5 have fewer questions, but once you lock in the direction (keep permissions narrow, keep records, put a human in the loop for high-risk cases), they are quick to solve and buy you time.

## Splitting the 90 Minutes into Three Passes

| Pass | Time | What to do |
|------|------|------|
| First pass | About 75 minutes | Pick a tentative answer for every question. If you get stuck, flag it and move on |
| Second review | About 10 minutes | Re-solve only the flagged questions |
| Final check | About 5 minutes | Confirm there are no blank answers and that multiple-response questions have the required number of selections |

- Set checkpoint targets in advance. If you are around **question 22 at 25 minutes and question 43 at 50 minutes**, you are on pace to finish the first pass within 75 minutes. If you fall five or more questions behind, read the question sentence first for the next questions and cut off at 90 seconds.
- If a question passes the 2-minute mark, pick the most plausible option now, flag it, and move on. Add the flag **after you have chosen a tentative answer**. If you flag a question without an answer, it stays unanswered when you run out of time.
- Finish short mapping questions ("Which service converts speech to text?") within 30 seconds so you save time for the long scenario questions.

## Switching Gears When the Domain Changes

As soon as you read a question, decide "what kind of question is this?". Once the kind is decided, the criteria to recall are decided too.

| Signal in the passage | Question type | Criterion to recall immediately |
|------|------|------|
| "Which learning method", "which type of task" | Concept distinction (Domain 1) | Are there labels? Is the output a category or a number? |
| "Token", "temperature", "different answer every time" | Generative AI behavior (Domain 2) | Probabilistic generation, direction of the parameter |
| "Which AWS service is most suitable" | Service mapping (Domains 1 and 3) | Verb to service, which of the three layers |
| "Answer from the latest internal documents", "learn the tone" | Choosing customization (Domain 3) | Knowledge means RAG; behavior or style means fine-tuning |
| "Disadvantages a specific group", "why this decision" | Responsible AI (Domain 4) | Which principle is broken, then which tool |
| "Whose responsibility", "restrict access", "audit" | Security and governance (Domain 5) | Shared responsibility model, least privilege, records |

- The same service shows up wearing a different domain's clothes. Comprehend appears as "sentiment analysis" (service mapping) and also as "PII masking" (security). Decide by **the job the question asks for**, not by the service name.

## The Four Question Types and How to Handle Them

The exam guide says four types of questions can appear. All the practice questions in this note are the first type, but you should know the rules of the other three types before you go in.

| Type | Format | Scoring rule | How to solve |
|------|------|------|------|
| Multiple choice | 1 correct answer, 3 incorrect | Score by getting the one right | Cross out the two obviously wrong options first |
| Multiple response | 2 or more correct answers among 5 or more options | You must choose **all** the correct answers to score | Judge each option true or false separately, then choose the required number |
| Ordering | Place 3-5 items in the correct order | Both the items **and** their order must be right to score | Decide the first and last first, then fill in the middle |
| Matching | Connect responses to 3-7 prompts | Every pair must be right to score | Connect the sure pairs first and match the rest among themselves |

- Ordering questions tend to come from **topics with stages**, such as the ML lifecycle (data collection → preprocessing → training → evaluation → deployment → monitoring) or the RAG flow (chunking → embedding → storing → retrieval → generation). When you review, say the order of the stages out loud.
- Matching is the type where the tables from this course become questions as they are, such as "service ↔ purpose" and "principle ↔ situation".
- With all three types, getting only some right earns no points. That means you must solve them more carefully, but spending 5 minutes on one question costs you three others. Apply the same time limit.

## Practicing Elimination: Following One Question to the End

Let's follow the solving process on a scenario that is not among the practice questions.

```text
Scenario: A hospital is building a patient information chatbot. The chatbot
          must answer only from the care guide documents that the hospital
          updates every week, and the hospital wants to avoid the burden of
          retraining the model. What is the most suitable approach?

Options: (a) Pretrain a model from scratch
         (b) Fine-tune every week
         (c) Use RAG to retrieve the care guide documents and provide them as grounding
         (d) Raise the temperature

1) Question sentence: "most suitable approach" + two conditions (updated weekly, avoid retraining burden)
2) Identify the type: choosing customization -> "knowledge means RAG; behavior or style means fine-tuning"
3) Eliminate: (a) is the most expensive. It directly contradicts the conditions
               (d) only raises diversity and does not supply knowledge
4) The remaining two: (b) retraining weekly = violates the "avoid the burden" condition
                      (c) just swap the documents and it is reflected immediately = meets both conditions
5) Answer: (c)
```

- Step 2 is the key. Once the type is decided, the elimination in step 3 is almost mechanical.
- In step 4, the remaining two are usually "both possible". The correct answer is **the one that meets more of the conditions**. The question asks "most suitable", not "possible".

## After Scoring: Sorting Misses into Three Reasons

After solving the 8 questions and checking the explanations, classify each question you got wrong or got right by guessing into one of the three below. The prescription differs by category.

| Miss type | How to tell | Prescription |
|------|------|------|
| Didn't know | The content is new even after reading the explanation | Go back to that week's note and reread that section |
| Confused | You narrowed it to two but the criterion separating them was blurry | Write the difference between the two concepts in one sentence yourself (e.g., "Textract extracts, Comprehend analyzes") |
| Misread | You know the content but missed a condition or a negation | Build the habit of reading the question sentence first and checking qualifiers such as "not" and "most" |

- **Negative questions** such as "Which is NOT correct?" or "Which action is LEAST appropriate?" are the ones people miss most when pressed for time. For a negative question, mark each option "this one is true" as you go and find the one that is not a true statement.
- Count questions you got right by guessing as misses. Luck will not follow you into the exam room.
- Also count the correct answers per domain. The domain is written at the head of each question stem below. If any domain has two or more misses out of the 8 questions, read that domain's review notes (Day 1-3) before looking at tomorrow's translation table.

| Today's result | What to do tomorrow |
|------|------|
| All 8 right with reasons, finished within 11 minutes | Only skim Day 5's translation table and list of pitfalls |
| Right, but took longer than 11 minutes | Practice solving mapping questions in 30 seconds. Cover the translation table and say the service name |
| Misses clustered in one domain | Reread that domain's review notes (Day 1-3) |
| Misses scattered across several domains, mostly "misread" | It is a problem of reading order, not knowledge. Practice reading the question sentence first |

If you are ready, begin. Tomorrow is the last day. We will put the exam structure, the keyword → service translation table, and the commonly missed pitfalls on a single page.

## 📖 Glossary

- **Domain jump**: Consecutive questions coming from different content areas. The real exam does not group questions by area.
- **Unscored question**: A question collected for statistics that does not count toward the score. Test takers cannot tell which questions they are.
- **Scaled score**: A score converted to the same standard after adjusting for the different difficulty of each exam form.
- **Multiple response**: A question type where you choose two or more correct answers from five or more options.
- **Ordering / matching**: A type where you place items in the correct order / a type where you connect prompts and responses to each other.
- **Elimination**: A solving method where you cross out clearly wrong options first and choose from what remains.
- **Flag**: A mark attached to a question so you can come back to it later.

## 📝 Practice Questions

**Question 1.** (Domain: AI/ML Fundamentals) Unlabeled customer transaction data — find naturally-occurring groups/segments. Learning mode?

A) Supervised — Classification  
B) Supervised — Regression  
C) Unsupervised — Clustering  
D) Reinforcement Learning  

**Answer: C**  
Explanation: Without answer labels, finding intrinsic data structure via groups is unsupervised clustering. Classification·Regression need answers (supervised), Reinforcement uses reward signals for sequential decisions — none match label-free segment discovery.

---

**Question 2.** (Domain: Generative AI Fundamentals) Same prompt multiple times → slightly different answers each time. Make output more consistent, deterministic?

A) Raise temperature  
B) Lower temperature (near 0)  
C) Increase max tokens  
D) Expand Top-k infinitely  

**Answer: B**  
Explanation: Lower temperature → model picks highest-probability tokens → consistent, deterministic. High temperature adds randomness/diversity (opposite A). Max tokens is length cap, Top-k expansion widens candidates — consistency direction opposite.

---

**Question 3.** (Domain: FM Application) Call-center recording files → convert to text, then analyze sentiment in that text. Service combo?

A) Polly → Translate  
B) Transcribe → Comprehend  
C) Textract → Rekognition  
D) Lex → Personalize  

**Answer: B**  
Explanation: Speech-to-text = Transcribe (STT), then text sentiment = Comprehend. Polly = text-to-speech, Translate = language translation, Textract = doc extraction, Rekognition = image analysis, Lex = chatbot, Personalize = recommendation — combo mismatch.

---

**Question 4.** (Domain: Responsible AI) Generative AI chatbot outputs factually false info plausibly (hallucination). Most effective mitigation?

A) Maximize temperature  
B) Supply trusted evidence documents letting model draw from them (RAG)  
C) Write longest prompts possible  
D) Set max tokens 0  

**Answer: B**  
Explanation: Hallucination stems from LLM "guessing plausibly," not fact-checking. Real evidence docs via RAG most effective — model answers within evidence instead of fabricating. Temperature hike feeds fabrication (A wrong), prompt length·max-tokens-0 don't reduce hallucination itself (C, D wrong).

---

**Question 5.** (Domain: Security·Governance) AWS shared responsibility: S3 stored data encryption enabling and access IAM permissions setting — who's responsible?

A) AWS  
B) Customer  
C) Region operator  
D) Open-source community  

**Answer: B**  
Explanation: Data encryption config and IAM access control are "in cloud" — customer responsibility. AWS handles "of cloud" infrastructure (data centers, hardware). Region operators/community aren't responsibility parties.

---

**Question 6.** (Domain: FM Application) Medical team wants to build custom diagnostic-assist model from own medical-image data, directly train, tune, deploy, and post-deploy monitor drift. Most fitting service?

A) Amazon Rekognition  
B) Amazon Q Developer  
C) Amazon SageMaker  
D) Amazon Translate  

**Answer: C**  
Explanation: Custom model full lifecycle (train·tune·deploy·monitor) = SageMaker. Rekognition = pre-made image analysis, Q Developer = coding assist, Translate = language translation — not custom-model direct-building.

---

**Question 7.** (Domain: Generative AI Fundamentals) Showed 2-5 prompt examples following pattern, posed real question — model followed the pattern. Weights unchanged. This technique?

A) Fine-tuning  
B) Few-shot Prompting  
C) Pre-training  
D) RAG  

**Answer: B**  
Explanation: Examples in prompt making model follow patterns without weight change = Few-shot (In-Context Learning). Fine-tuning/Pre-training alter weights, RAG supplies external doc-search — separate techniques.

---

**Question 8.** (Domain: Responsible AI/Governance) AWS managed AI service's intended use cases, limitations, fairness considerations organized to heighten transparency — document?

A) AWS AI Service Cards  
B) AWS Billing Report  
C) IAM Policy Document  
D) CloudFormation Template  

**Answer: A**  
Explanation: AI Service Cards organize service use·limits·fairness for transparency. Billing Report = cost invoice, IAM Policy = access definition, CloudFormation = infra provisioning — unrelated to transparency docs.

---
