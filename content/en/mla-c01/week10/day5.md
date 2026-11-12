# Day 5 - D-Day Wrap-Up: Exam Format·Time Allocation·Scenario Decomposition Strategy

## 📌 Key Takeaways

- MLA-C01 is **65 questions (50 scored + 15 unscored) / 130 minutes / passing score 720 (out of 1000)**. You cannot tell which questions are unscored.
- About **2 minutes** per question on average. Keep this pace: first pass 90–100 minutes → second review 25–30 minutes → third wrap-up 5 minutes.
- If stuck, give a tentative answer + flag it and move on. Every question is worth the same, and **since there is no penalty for wrong answers, a blank is a pure loss**.
- Decompose long case questions in this order: the last question → condition keywords → think of the answer before the options → eliminate traps.
- Always read the superlative qualifier (MOST/LEAST). Even if several options work, only the best one by that criterion is correct.

## Exam Format — What You Will Face

It is the last day of the 10 weeks. Today covers not new knowledge but **the skill of taking the exam**. Even with the same ability, time allocation and problem-decomposition strategy decide pass or fail.

| Item | Details |
|------|---------|
| Number of questions | 65 (50 scored + 15 unscored) |
| Time | 130 minutes |
| Question types | Multiple choice (single/multiple response), case-based, ordering, etc. |
| Passing score | 720 / 1000 (scaled score) |
| Result | Computed from the 50 scored questions (the 15 unscored do not count toward the score) |

The domain weights are as follows.

```text
 Domain 1  Data preparation          ████████████████████████████  28%
 Domain 2  Model development         ██████████████████████████    26%
 Domain 4  Monitoring·security       ████████████████████████      24%
 Domain 3  Deployment·orchestration  ██████████████████████        22%
                                    └ 1+2 = 54%  ·  3+4 = 46% ┘
```

You cannot abandon any one domain, but since 1 and 2 exceed half, the stability of the data and model areas is the foundation of passing.

The 15 unscored questions are trial questions for future exams, and you cannot tell which ones they are. So do not guess "this one must be unscored"; treat every question equally. The passing line of 720 is a scaled score adjusted for question difficulty, so it cannot be converted directly into a percentage correct (how many percent you must get right). Therefore the goal is not perfection but "a solid majority + avoiding traps."

## Time Allocation — How to Use the 130 Minutes

With 65 questions in 130 minutes, you have **an average of 2 minutes per question**. We recommend this pace.

- **First pass (about 90–100 minutes)**: Solve every question once. If you are stuck for more than 2 minutes, mark a tentative answer, **flag** it, and move on. Never spend more than 5 minutes on a single question.
- **Second review (about 25–30 minutes)**: Return to the flagged questions and work through them calmly. Other questions you saw in the first pass often give hints.
- **Third wrap-up (about 5 minutes)**: Check that no answer is blank and that you picked the right number of options on multiple-response questions.

This is a reference table for mid-exam checks. By comparing it with the time remaining on the actual exam screen, you can immediately tell whether your pace has slipped.

| Elapsed time | You should be about here | Action if behind |
|--------------|--------------------------|------------------|
| 30 min | About 15 questions | Tighten the flag-and-move-on threshold from 2 minutes to 90 seconds |
| 60 min | About 30 questions | For long case questions, read only the question and qualifier and win by elimination |
| 90 min | About 45 questions | Be prepared to cut review time to 15 minutes |
| 100 min | First pass of all 65 done | Start reviewing in order of flagged questions |
| 125 min | Review finished | Final check of blanks and multiple-response counts |

```text
[130-minute allocation]
├──────────── First pass 90–100 min ────────────┤── Second review 25–30 min ──┤─ Third 5 min ─┤
   Every question once · guess and flag if stuck     Re-review flagged questions    Blanks·counts
```

> ⚠️ **Gotcha**: The most common failure is "pouring 10 minutes into one hard question and then being unable to solve the easy later ones." Every question is worth the same. The discipline of guessing, flagging, and moving on immediately protects your score. And always guess on a question with no answer — there is no penalty for wrong answers, so a blank is a pure loss.

## Scenario Decomposition Strategy — Breaking Down Long Questions

Decompose a long case question in this order.

1. **Read the final question sentence first.** "What is the most cost-effective?", "What is the most appropriate inference option?" — knowing first what is being asked makes clear what to look for in the body.
2. **Mark the decision keywords.** Real-time/intermittent, imbalance, time series, drift, internet blocking, encryption, etc.
3. **Think of the answer before looking at the options.** Apply the Day 4 translation table.
4. **Eliminate traps from the options.** Strike out any option that violates even one requirement.

```text
[4-step decomposition]
  ① Last question ─▶ "What am I being asked to choose" + qualifier (MOST/LEAST)
        ▼
  ② Scan the body  ─▶ Number the condition keywords  (conditions ①②③)
        ▼
  ③ Answer before options ─▶ Write the feature name in your head using the translation table
        ▼
  ④ Eliminate options   ─▶ Remove options that break any condition → one remains
```

## Responding by Question Type

| Type | Characteristics | Response |
|------|-----------------|----------|
| Single-answer multiple choice | 1 of 4 options | Think of the answer first with the translation table, then find it among the options |
| Multiple-response (TWO, etc.) | You must pick the exact number, with no partial credit | Check the count first, lock in the certain ones, then compare the rest |
| Long case question | 2–3 condition keywords scattered around | Question·qualifier first → number the conditions → the option that satisfies all conditions |
| Matching/ordering | Pair items or arrange a sequence | Fix the pairs you are sure of first and fill the rest by elimination |
| "Which is incorrect?" | Negative question | Always check whether the question has a negation. Find the three correct ones and eliminate |

> ⚠️ **Gotcha**: If you miss a negative ("NOT," "which is incorrect"), you pick the opposite even though you know the answer. It is an easy mistake to make the more rushed you read. The habit of giving negations and qualifiers (MOST·LEAST·TWO) a second look when reading the question sentence prevents this loss.

Multiple-response questions (choosing two or more) need their own strategy. If the question states "TWO" or "TWO actions," you must pick exactly that number, and even if only one is right there is no partial credit. Also, **superlative qualifiers** such as "MOST cost-effective," "LEAST operational overhead," and "MOST secure" are the key. Even if several options technically work, only the one that is best by the qualifier's criterion (cost, operational burden, security) is correct. If you miss the qualifier, you pick a trap option that "works but is not the best."

## Final Check — What to Skim Right Before the Exam

The day before and the morning of, quickly review the following.

| Area | One-line check |
|------|----------------|
| Inference options | Separate real-time/serverless/asynchronous/batch by immediacy·traffic·payload |
| Advanced deployment | Many of the same kind = MME, a few of different frameworks = MCE, preprocessing chain = inference pipeline |
| Algorithms | Time series = DeepAR, anomalies = RCF, tabular = XGBoost, recommendation = FM, text = BlazingText |
| Evaluation metrics | Imbalance = F1/AUC, misses = Recall, false positives = Precision, regression = RMSE |
| Training infrastructure | Large data = Pipe/FastFile, repeated reads = FSx, cost = Spot + checkpoints |
| Tuning | Few attempts = Bayesian, early stopping = Hyperband |
| Data preparation | Visual = Data Wrangler, script = Processing Job, ETL = Glue, querying = Athena |
| Features | Training-inference consistency = Feature Store (online single record/offline bulk) |
| Monitoring | Input drift = Data Quality, performance degradation = Model Quality (+ labels) |
| Bias·explanation | Clarify (pre/post-training bias, SHAP), continuous monitoring in production is Model Monitor |
| Security | IAM least privilege · VPC endpoints (S3 = Gateway, others = Interface) · isolation · KMS |
| Governance | Who = CloudTrail, metrics = CloudWatch, provenance = Lineage, documentation = Model Cards |
| MLOps | EventBridge → Pipelines (ConditionStep) → Model Registry |
| Cost | MME · Inferentia · serverless/asynchronous · Spot · batch transform |

Right before the exam, rather than cramming in new concepts, **strengthening the retrieval paths of what you already know** is more effective. Retrieval practice, in which you say the table above aloud mapping keyword → feature, helps recall in the exam room far more than reading the information anew. Sleep enough, arrive at the test center early, and do not be shaken even if you get stuck on the first few questions — hard questions clustering at the front is just a common arrangement.

## Exam Day Checklist

This is a check of items to bring and the environment, so you do not lose points for reasons outside your knowledge. Detailed rules differ by how you take the exam (test center / online proctoring), so treat the instructions in your booking confirmation email as the final authority.

| Category | Check item |
|----------|------------|
| The day before | Get enough sleep. Do not start a new course or a new workbook |
| The day before | Reconfirm the booking time, delivery method, and location (or online proctoring procedure) |
| Items for the day | The ID specified in the booking confirmation. Check that the name matches the booking |
| Test center | Arrive with time to spare. Check the rules for storing belongings |
| Online exam | Run the system check in advance, clear your desk, secure a quiet, uninterrupted space |
| Right after starting | First locate where the remaining time is shown and the flag button |
| During the exam | Compare progress at the 30/60/90-minute marks. If behind, adjust your pace immediately |
| Before finishing | Submit after confirming 0 blanks and that multiple-response counts match |

## Final Retrieval Cards — Answer Out Loud

Do not read; **say the answer first**, then check the right-hand side. If any cell stumps you, review only that week's content again.

| Question | Answer |
|----------|--------|
| Which inference option does not scale to 0? | Real-time (keeps at least 1 instance) |
| An individual request that is large and slow? | Asynchronous inference |
| Scoring the whole dataset at once? | Batch transform |
| Thousands of models of the same framework? | Multi-model endpoint (MME) |
| To reuse training-time preprocessing in inference as is? | Inference pipeline or Feature Store |
| Finding outliers without labels? | Random Cut Forest |
| Forecasting the future of several related time series? | DeepAR |
| Performance metric for 99% normal data? | F1·AUC·Recall (not Accuracy) |
| Metric for a problem where you must not miss cases? | Recall |
| The monitor that runs only with ground-truth labels? | Model Quality |
| The monitor that watches input distribution change? | Data Quality |
| One-time pre-deployment bias check? | Clarify |
| To reach S3 without the internet? | Gateway VPC endpoint |
| To reach ECR without the internet? | Interface endpoint (PrivateLink) |
| To cut off the container's external communication? | EnableNetworkIsolation |
| To find out "who deleted it"? | CloudTrail |
| To trigger retraining when new data arrives? | EventBridge → Pipelines |
| To block registration of a model that misses the threshold? | ConditionStep |
| Lower training cost but be able to resume? | Managed Spot + checkpoints |
| Find hyperparameters with few attempts? | Bayesian |

The reason the cards above are effective is that their format matches the exam. What you need in the exam room is not "knowledge you can explain" but **the speed to pull out a single name from a short cue**. Rereading material makes you feel as though you know it (the illusion of familiarity), but actually pulling it out reveals the cells where you get stuck. The final review must be of the pulling-out kind.

## Five Final Disciplines

- Do not spend more than 5 minutes on a single question. Every question is worth the same.
- Do not leave blanks. Since there is no penalty for wrong answers, guessing is always a gain.
- Read the qualifiers (MOST·LEAST·TWO) as if aloud. The most questions are decided here.
- Count the conditions, and mark how many of them each option satisfies.
- Do not overturn your first instinct without grounds. To overturn it, you must be able to say "because of which condition."

## Closing the 10 Weeks

MLA-C01 is, in the end, **an exam of translating requirements into SageMaker features**. Over 10 weeks we went around the full loop: from ingestion, feature engineering, Feature Store, and Clarify to training, tuning, and evaluation, inference options and advanced deployment, Pipelines and MLOps, and Model Monitor, IAM, VPC, and KMS. With the stability of data preparation (Domain 1) and model development (Domain 2) as the foundation, you just need to recall the keyword mappings of deployment (Domain 3) and monitoring·security (Domain 4) reflexively.

## 📖 Glossary

- **Scaled score**: A score converted to a 100–1000 range after adjusting for question difficulty. The MLA-C01 passing line is 720.
- **Unscored questions**: 15 questions mixed in for future exams. Since you cannot tell which they are, treat all of them the same.
- **Flag**: A feature that bookmarks a question on the exam screen to revisit later. A key tool of the first pass.
- **First pass / second review**: The stage of skimming every question once / the stage of re-solving only the flagged questions. The backbone of time allocation.
- **Multiple-response question**: A question that asks you to pick an exact number, such as "TWO." If the count is wrong, it is marked incorrect with no partial credit.
- **Superlative qualifier**: An expression that specifies the comparison criterion, such as MOST cost-effective or LEAST operational overhead.
- **Retrieval practice**: A review method of pulling things from memory instead of rereading the material. The most effective for last-minute review.
- **Decision keyword**: A word in a scenario that separates the answer (intermittent, bulk, imbalance, time series, drift, internet blocking, etc.).

---

## 📝 Practice Questions

**Question 1.** Which statement about the MLA-C01 exam structure is most accurate?

A) All 65 questions are scored, and you must answer 80 of 100 questions correctly  
B) 65 questions in total (50 scored + 15 unscored), 130 minutes, a passing scaled score of 720, and unscored questions do not count toward the score  
C) 50 questions in 60 minutes, with a passing score of 600  
D) The number of questions and time vary randomly for each candidate  

**Answer: B**  
Explanation: MLA-C01 has 65 questions (50 scored + 15 unscored) to be completed in 130 minutes, the passing score is 720 out of 1000, and the 15 unscored questions do not count toward the score. A is wrong about the scored/unscored distinction and the scoring criteria, C is wrong on the number of questions, time, and passing score, and D is untrue because the exam structure is standardized.

---

**Question 2.** During the first pass, you cannot be confident of the answer to a scenario question after 2 minutes. What is the most recommended action?

A) Stay on that question until you feel confident  
B) Tentatively select the most plausible answer, flag it, move on to the next question, and revisit it in the review phase  
C) Leave that question blank and move on  
D) End the exam early  

**Answer: B**  
Explanation: Since every question is worth the same, the strategy that protects your score is not to spend too much time on one question, but to choose a tentative answer, flag it, move on, and revisit it in the review phase. A makes you miss easy questions later on, C is a pure loss because there is no penalty for wrong answers so leaving it blank gains nothing, and D means giving up on the remaining questions.

---

**Question 3.** What is the most appropriate recommended order for solving a long case-style question efficiently?

A) Read the passage thoroughly from beginning to end and read the question last  
B) Read the final question (what is being asked) first, find the decision keywords in the passage, think of the answer before looking at the options, and then eliminate the trap options  
C) Memorize the four options first, then read the passage  
D) Ignore the keywords and choose by intuition alone  

**Answer: B**  
Explanation: Reading the question first makes clear what to look for in the passage, and the most efficient order is to settle on the answer first through keyword-to-feature translation and then eliminate the options that violate the requirements. A wastes time by reading closely without knowing what to look for, C is inefficient, and D makes it easy to fall into traps.

---

**Question 4.** When solving a question that contains a superlative qualifier such as "Which of the following is the MOST cost-effective option?", what is the key point to watch for?

A) Pick any option that technically works  
B) Even if several options work, only the one that is best on the qualifier's criterion (cost) is correct, so compare and choose based on the qualifier  
C) The qualifier can be ignored  
D) The most expensive option is always the answer  

**Answer: B**  
Explanation: In questions with a superlative qualifier, even if several options are technically feasible, only the one that is best on that criterion (cost, operational overhead, security) is correct, so you must use the qualifier as the explicit comparison criterion. A and C ignore the qualifier and lead you to choose the "works but is not the best" trap, and D is the exact opposite of cost efficiency.

---

**Question 5.** What is the most effective way to do a final review right before the exam?

A) Read long documentation for new services you have never seen to add knowledge  
B) Practice retrieval of keyword-to-feature mappings you already know (saying the mappings aloud) to strengthen recall pathways  
C) Stay up all night rewatching all the lectures  
D) Rely only on intuition with no preparation  

**Answer: B**  
Explanation: Right before the exam, practicing retrieval (active recall) of what you have already learned is most effective for recall in the exam room, rather than adding new information. A is hard to absorb in a short time, C hurts your condition through sleep deprivation, and D fails to make use of your preparation.

---


## 📝 Practice Questions

**Questions 1-5** [Practice questions in Korean follow after marker]

---
