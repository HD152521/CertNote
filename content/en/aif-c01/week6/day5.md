# Day 5 - D-Day Wrap-Up: Exam Structure, Keyword → Service Translation Table, Frequently-Missed Traps

## 📌 Key Takeaways

- AIF-C01 has 65 questions (50 scored + 15 unscored), lasts 90 minutes, and the passing mark is **700 points** on a 100 to 1,000 scale. There are five domains, weighted 20/24/28/14/14%.
- That is about 1 minute 20 seconds per question. If you get stuck, pick a tentative answer, flag it, and move on. An unanswered question counts as wrong, and a wrong answer carries no penalty.
- Questions always describe a "situation." Underline the **verb** (extract, analyze, convert, generate, recommend, predict) rather than the noun, and translate it into a service.
- Most traps are "two choices that look alike but differ." If both seem plausible, go back to the question sentence and recheck the task it asks for.
- The day before the exam, review the translation table, the trap list, and your wrong-answer notes instead of new material. If you fail, you can retake it after 14 days.

## Exam Structure: What You Will Face

The six-week journey is over. This last piece is not a time for "learning more" but for making the **one-page summary** you carry into the exam room. The day before the exam, it pays more to review the **boundaries and mappings** of the concepts you have built so far than to cram in new material.

The basic format of the AWS Certified AI Practitioner (AIF-C01) is as follows.

| Item | Details |
|------|------|
| **Number of questions** | 65 questions (15 of which are unscored, used for evaluation) |
| **Time** | 90 minutes |
| **Passing score** | **700 points** out of 1,000 (100 to 1,000 scale) |
| **Question formats** | Multiple choice (single answer), multiple response, ordering, matching |
| **Level** | Foundational |
| **Exam fee** | 100 USD |
| **How to take it** | A Pearson VUE test center or an online proctored exam |
| **Certification validity** | 3 years |

The key is that "you only need to get the 50 scored questions right." The strategy that decides a pass is not to spend all your time on one or two questions you do not know, but to secure the ones you know quickly first.

The reason 15 of the 65 questions are unscored is that AWS pre-tests new questions for future exams. Since which questions are for evaluation is not marked, the right approach is to treat every question with equal seriousness while not clinging too long to any one. With 90 minutes for 65 questions, it is about 1 minute 20 seconds per question, so pacing matters: flag what stumps you, move on, and come back at the end.

- The list of languages the exam is offered in may change. The exam is offered in Korean, and you should check the exact list on the official page when you book the exam.
- The exam guide describes the target candidate as someone with up to about six months of exposure to AI/ML technologies on AWS, and someone who **uses rather than builds** AI/ML solutions. It states that coding models, tuning hyperparameters, building pipelines, and mathematical analysis are out of scope. Even questions that seem to demand calculation or code actually ask you to distinguish concepts.

## How the Score Is Calculated

| Rule | Details | What it means in the exam room |
|------|------|------|
| Scaled score | The result comes out as a scaled score from 100 to 1,000. It is meant to adjust for the slightly different difficulty of each exam form | 700 points does not mean "70% correct." Do not work backward from the number you got right to a pass |
| Compensatory scoring | There is no per-domain passing mark; only the overall score counts | A weak domain can be made up for by a strong one |
| Unscored questions | The 15 questions are for gathering statistics and are not marked | Do not get shaken by unfamiliar, hard questions |
| No answer | A question left unanswered is wrong | Do not leave any answer blank |
| Guessing | A wrong answer carries no penalty | If you do not know, eliminate and then choose |
| Multiple response, ordering, matching | You must get all of it right to score | Check the required number and order to the end |

- The score report may show a table of performance levels by domain. Because the number of questions differs by domain, the assessment of a domain with few questions is prone to swing, so the exam guide also says to interpret per-domain feedback with caution.

## Exam Weighting by Domain

The exam is made up of 5 domains with different weights. It is reasonable to spend more review time where the weight is larger.

| Domain | Weight | Based on 50 scored questions |
|--------|-------------|------|
| 1. Fundamentals of AI and ML | 20% | About 10 questions |
| 2. Fundamentals of Generative AI | 24% | About 12 questions |
| 3. Applications of Foundation Models | 28% | About 14 questions |
| 4. Guidelines for Responsible AI | 14% | About 7 questions |
| 5. Security, Compliance, and Governance for AI Solutions | 14% | About 7 questions |

Generative AI fundamentals and their applications (Domains 2 and 3) together make up 52%, and responsible AI plus security and governance (Domains 4 and 5) together make up 28%. The translation table and trap summary in this piece aim right at that core.

## The "Keyword → Service" Translation Table

Exam questions always describe a "situation." Engrave in your mind the table that translates the keywords in that situation into a service. This is the most powerful weapon.

| Keyword in the question | Correct service |
|----------------|-------------|
| **Extract** text and tables from documents/scans, OCR | **Amazon Textract** |
| **Recognize** objects/faces/inappropriate content in images and video | **Amazon Rekognition** |
| Text **sentiment analysis**, entity/language extraction | **Amazon Comprehend** |
| **Speech → text** (STT), call transcripts | **Amazon Transcribe** |
| **Text → speech** (TTS), voice announcements | **Amazon Polly** |
| Language **translation** | **Amazon Translate** |
| **Chatbot**/voicebot, intent recognition | **Amazon Lex** (or Amazon Q Business) |
| **Personalized recommendations** of products/content | **Amazon Personalize** |
| Time-series **demand and sales forecasting** | **Amazon Forecast** |
| **Intelligent search** of in-house documents | **Amazon Kendra** |
| **Hosting** several **FMs**, calling them through a single API | **Amazon Bedrock** |
| **Training a custom model yourself**, deployment, MLOps | **Amazon SageMaker** |
| A **work AI assistant** based on in-house data | **Amazon Q Business** |
| **Coding assistance**, code generation and explanation | **Amazon Q Developer** |
| Model/data **bias detection and explainability** | **SageMaker Clarify** |
| **Safety policies** for generative AI output (harmful/PII/hallucination) | **Guardrails for Amazon Bedrock** |
| **Transparency documentation** of a model's purpose, limits, and fairness | **AWS AI Service Cards** |

> 💡 **Related theory**: Even with the same data type, the "verb" separates the services. If you **pull out** the text it is Textract, if you **analyze** it Comprehend, if you **generate** it Bedrock/an LLM. So when reading a question, the habit of underlining the verb ("extract," "analyze," "convert," "generate," "recommend," "predict") before the noun ("document," "speech") raises your accuracy the most.

- Some things circulate under two names. **Guardrails for Amazon Bedrock = Amazon Bedrock Guardrails**, and **Amazon SageMaker = Amazon SageMaker AI**. Whichever way it appears, it is the same thing.

The other half of the translation table is the **methods** of generative AI and security/governance.

| Keyword in the question | Correct answer |
|------|------|
| Answer from up-to-date or in-house documents, without retraining, showing sources | **RAG** (Amazon Bedrock Knowledge Bases) |
| Call APIs across multiple steps to carry out an actual task | **Amazon Bedrock Agents** (agents) |
| Internalize a specific domain's tone and format into the model | **Fine-tuning** |
| Put a few examples in the prompt so it follows the pattern | **Few-shot prompting** |
| Have it write out its reasoning step by step | **Chain-of-thought** |
| Summary quality / translation quality / semantic similarity metrics | **ROUGE / BLEU / BERTScore** |
| Quickly start with a pretrained model in SageMaker | **SageMaker JumpStart** |
| Monitor a deployed model for drift and quality degradation | **SageMaker Model Monitor** |
| Document our model's purpose, risks, and evaluation results | **SageMaker Model Cards** |
| Who can do what, least privilege | **IAM** |
| Managing keys for encrypting data at rest | **AWS KMS** |
| Detecting sensitive data stored in S3 | **Amazon Macie** |
| Keep traffic from crossing the public internet | **AWS PrivateLink** |
| An API audit record of who did what and when | **AWS CloudTrail** |
| Checking operational status with metrics, logs, and alarms | **Amazon CloudWatch** |
| Evaluating whether resource configuration conforms to rules | **AWS Config** |
| Downloading AWS's SOC and ISO reports | **AWS Artifact** |

Kendra, Forecast, Q Business, and Bedrock Agents in the table are currently closed to new customers, and the latest exam guide names AgentCore, Amazon Quick, and Kiro (Week 4 Day 4 and 5). Both old and new names may appear in the answer choices.

## Summary of Frequently Missed Traps

These are the traps that are easy to fall into at the foundational level.

- **Textract vs Comprehend**: "Extracting" the text is Textract; "analyzing the meaning or sentiment" of the text is Comprehend. If confused, look at the verb.
- **SageMaker vs Bedrock**: If you "build the model yourself," SageMaker; if you "borrow an FM," Bedrock. If you see "custom training," SageMaker.
- **Few-shot vs fine-tuning**: Few-shot is examples inside the prompt (no change to weights); fine-tuning changes the weights. If it says "show examples," Few-shot.
- **Direction of temperature**: lower is consistent and deterministic, higher is creative and varied. Accuracy needed → lower it.
- **Shared responsibility model**: data, permissions, and encryption settings are almost always the "customer's" responsibility.
- **Hallucination mitigation**: not a bigger model but **RAG** (providing grounding) is the standard answer.
- **RAG vs fine-tuning**: if you need "information" the model does not know, RAG; if you want to internalize deep "tone and domain behavior," fine-tuning.
- **Lex vs Polly vs Transcribe**: conversation (chatbot) = Lex, producing speech = Polly, dictating speech = Transcribe.
- **AI services vs SageMaker**: "quickly, without ML experts" means managed AI services; "direct control, custom" means SageMaker.

> 💡 **Related theory**: Trap questions mostly put "two choices that look alike but differ" side by side. The question writer separates the correct answer with a single keyword (for example, "extract" vs "analyze"). So when two services both seem plausible in the exam room, the safest check is to go back to the question sentence and recheck the verb for "exactly what task is being asked."

Here are additional things often missed in Domains 4 and 5.

- **Clarify vs Model Monitor**: measuring bias and explaining predictions is Clarify; keeping watch on changes after deployment is Model Monitor. Model Monitor only alerts; it does not fix.
- **AI Service Cards vs Model Cards**: a document AWS wrote about its own services / a document we wrote about our own model.
- **CloudTrail vs CloudWatch**: who did what / how the system is behaving.
- **Macie vs Comprehend vs Guardrails (PII)**: data stored in S3 / text you hand over / the input and output of generative AI.
- **Encryption vs PrivateLink**: protects the content / protects the path. Neither can substitute for the other.
- **Transparency vs explainability**: disclosing what the system is / explaining why this decision came out.

## Qualifiers Change the Answer

Even for the same situation, the answer changes with the qualifier in the question sentence. This is why you must read the question sentence first.

| Qualifier | Direction to lean | Example |
|------|------|------|
| "With minimal ML expertise" | Managed AI services, Bedrock, Amazon Q | Choices that train it yourself are eliminated |
| "Most cost-effectively" | Cheaper methods first (prompt → RAG → fine-tuning) | Training from scratch is eliminated |
| "Minimize operational overhead" | Fully managed, serverless | Choices that stand up servers yourself are eliminated |
| "Launch the fastest" | Pretrained models and finished services | Choices that start with data collection are eliminated |
| "Fully control the model and data" | Host and train yourself in SageMaker | A finished assistant is eliminated |
| "Explain the basis of decisions for regulation" | Easily explained models, explanation tools, human review | A high-performing black box is eliminated |
| "Which is NOT," "least appropriate" | Cross out the three true statements and take the one left | Choosing a true statement is wrong |

## What Changed in Version 1.1 of the Exam Guide

The exam guide's change history says version 1.1 was published on April 30, 2026. It states that the revisions are reflected in the exam from about a month after publication. These are items a candidate who has seen only old summary materials may find unfamiliar.

| Category | Details |
|------|------|
| Newly added objectives | Judging which of a traditional ML model and an FM fits, the effect of token-based pricing on cost and performance, the role of context engineering, basic concepts of agentic AI (multi-agent patterns, MCP, memory management, tool use, workflow orchestration), prompt version management with Amazon Bedrock Prompt Management, metrics aligned with business goals (task completion rate, user satisfaction, cost per interaction), hallucination detection and grounding techniques |
| Objectives with more examples | Asynchronous and serverless added to inference types, precision and recall to evaluation metrics, model distillation to FM customization, LLM-as-a-judge to FM evaluation, and to security considerations: data leakage prevention, output filtering and validation, audit trails and logging of AI interactions, and toxicity |
| Services added to scope | Amazon Aurora, Amazon Bedrock AgentCore, Kiro, Strands Agents, Amazon Q, Amazon SageMaker JumpStart, AWS Transform |
| Services removed from scope | Amazon MemoryDB |

- Most new objectives are at the level of "define" and "explain." It is enough to be able to say in one sentence how an agent differs from a chatbot and what MCP connects, not how to implement an agent (see the tables in Day 1 and 2).
- The list of in-scope services says it is "not exhaustive and may change." Even if a service name not on the list appears in the choices, do not panic; judge the choices you know first.

## Final Checklist by Domain

If you can complete the sentence below out loud, that line passes. Go back to the relevant review piece only for the lines where you get stuck.

```text
[Domain 1 — AI/ML fundamentals]
□ What is the containment relationship among AI, ML, deep learning, and generative AI? (→ AI ⊃ ML ⊃ deep learning ⊃ generative AI)
□ What separates classification from regression? (→ whether the output is a category or a continuous number)
□ What finds groups in unlabeled data? (→ clustering in unsupervised learning)
□ When does ML not fit? (→ the rules are clear, a single fixed result is needed)

[Domain 2 — Generative AI fundamentals]
□ What is the unit of cost and context limits? (→ the token)
□ What is the root cause of hallucination? (→ next-token probability prediction, not fact verification)
□ If consistent answers are needed, what do you do with temperature? (→ lower it)
□ What are embeddings used for? (→ semantic search, RAG)

[Domain 3 — Foundation model applications]
□ In what order do you try changing model behavior? (→ prompt → RAG → fine-tuning)
□ What separates RAG from fine-tuning? (→ supplying knowledge, or internalizing tone and behavior)
□ What does not change in few-shot? (→ the model weights)
□ What are the automatic evaluation metrics for summarization and translation? (→ ROUGE, BLEU)
□ What separates Bedrock from SageMaker? (→ borrowing, or building yourself)

[Domain 4 — Responsible AI]
□ What is the relationship between bias and fairness? (→ bias is the cause, unfairness is the result)
□ What is the difference between transparency and explainability? (→ disclosing what it is / explaining why)
□ What tool does both bias measurement and explanation? (→ SageMaker Clarify)
□ What filters the input and output of generative AI by policy? (→ Amazon Bedrock Guardrails)
□ What is the safeguard for high-risk decisions? (→ Human-in-the-Loop)

[Domain 5 — Security, compliance, governance]
□ Whose responsibility are data, permission, and encryption settings? (→ the customer)
□ What are the means for encryption at rest and in transit? (→ KMS / TLS)
□ What keeps traffic off the public internet? (→ PrivateLink)
□ What records who did what? (→ CloudTrail)
□ Where do you get AWS's compliance reports? (→ AWS Artifact)
```

## Exam Procedure and Policies

There are cases where people lose out by not knowing the procedure as much as the exam content. This follows the AWS certification policy page.

| Item | Details |
|------|------|
| Rescheduling and cancellation | You can change it up to 24 hours before the booked time, and a single booking can be changed only twice. If you cancel within 24 hours or do not show up, the exam fee is not refunded |
| ESL +30 | An accommodation giving 30 extra minutes to candidates whose first language is not English when they take the exam **in English**. You only need to apply once **before** registering for the exam. It does not apply if you take the exam in Korean |
| ID | A government-issued ID is required. The requirements differ between online and test centers, so check the booking instructions |
| Result notification | You can check it within 5 business days after finishing the exam |
| If you fail | You can retake it after waiting 14 days (calendar days). There is no limit on attempts, but you pay the full exam fee each time |

- If a Korean-translated passage feels awkward, recall the English original of the service names and feature terms and compare. This is why you learned the service names in the translation table in English.
- The online proctored exam has a procedure for checking your test environment before it starts. Log in with time to spare before the stated time, and clear your desk in advance.

## Rules for When You Get Shaken During the Exam

Having rules decided in advance saves the energy you would spend on judgment during the exam.

| Situation | Rule |
|------|------|
| A service name you have never seen is among the choices | Judge the three choices you know first. Pick the unknown choice only when all three violate the conditions |
| Questions on unfamiliar topics come one after another | They may be unscored questions. Pick a tentative answer and move on |
| Both choices seem right | Reread the verb and the qualifier in the question sentence |
| Two minutes have passed on one question | Pick the most plausible choice now, flag it, and move on |
| Unanswered questions remain with 5 minutes left | Do not read the passages fully; fill in answers for all the remaining questions first |
| You want to change an answer while reviewing | Change it only when you newly find a condition you missed in the passage |

To sum up the six weeks: build the foundation with **basic concepts (containment relationships, learning methods, tokens/embeddings)**, catch the surface-level questions with the **AWS AI service mapping**, and catch the value-judgment questions with **responsible AI, security, and governance**. For a question you do not know, do not cling to it; catch the verb and translate it into a service. Skim the translation table and the trap list one more time before you walk into the exam room.

## 📖 Glossary

- **Scaled score**: A score converted to the same standard after adjusting for the different difficulty of each exam form. It does not match the percentage correct.
- **Compensatory scoring**: A method where a pass is decided only by the overall score, without a per-area passing mark.
- **Unscored questions**: Questions for gathering statistics that are not reflected in the score. The candidate cannot tell which questions they are.
- **Multiple response**: A question type where you choose two or more correct answers from five or more choices.
- **Ordering / matching**: A type where you place items in the correct order / a type where you connect prompts and responses.
- **Qualifier**: An expression that sets the criterion for the correct answer, such as "most cost-effective" or "with minimal operational overhead."
- **Online proctored exam**: An exam taken at your own location while a proctor watches via webcam and screen sharing.
- **ESL +30**: An accommodation that gives a 30-minute extension, which non-English-speaking candidates can apply for when taking the exam in English.
- **Exam guide**: AWS's official published document of the exam scope. It lists domain weights and objectives, and the services in and out of scope.

## 📝 Practice Questions

**Question 1.** AIF-C01 exam structure: correct?

A) 100 questions, 60 min, 800 passing  
B) 65 questions, 90 min, 700 passing (1000 total)  
C) 50 questions, 120 min, 600 passing  
D) 30 questions, 45 min, 900 passing  

**Answer: B**  
Explanation: AIF-C01 is 65 questions in 90 minutes, passing 700/1000. ~15 unscored evaluation. Other choices wrong on count, time, or score.

---

**Question 2.** "Auto-extract amount and item table from scanned invoice" — core verb catches what service?

A) Amazon Comprehend  
B) Amazon Textract  
C) Amazon Lex  
D) Amazon Polly  

**Answer: B**  
Explanation: Verb "extract" on scanned doc = Textract. Comprehend analyzes meaning/sentiment, Lex is chatbot, Polly is voice synth — doc text·table extraction mismatch.

---

**Question 3.** SageMaker and Bedrock both look plausible. Problem says "train model from scratch with company data directly." Correct answer?

A) Bedrock — borrows ready FM  
B) SageMaker — custom model direct training·deployment  
C) Both correct  
D) Neither has training  

**Answer: B**  
Explanation: "Train from scratch" = custom building = SageMaker. Bedrock leverages ready FM (not direct-training), so clearly differ. Both aren't correct (C wrong), SageMaker core is training (D wrong).

---

**Question 4.** Generative AI hallucination cut, most fitting approach?

A) Infinitely scale model parameters  
B) Supply trusted docs grounding answers (RAG)  
C) Temperature maximum-high  
D) Unconditionally lengthen prompts  

**Answer: B**  
Explanation: Hallucination fix's standard: real evidence docs (RAG) — model answers within evidence, not fabricate. Model scaling doesn't guarantee hallucination reduction, high temperature feeds freedom to invent (C opposite), prompt length doesn't reduce hallucination itself (D wrong).

---

**Question 5.** Two services (e.g., Textract vs Comprehend) both seem fitting. Safest verification when picking between them?

A) Pick first alphabetically  
B) Problem's core **verb** recheck to distinguish task type  
C) Pick pricier service  
D) Always newest service  

**Answer: B**  
Explanation: Trap questions split on one keyword — problem core verb recheck ("extract/analyze/generate" etc.) distinguishing work type is most reliable. Alphabet order, pricing, release date are task-fitness unrelated.

---
