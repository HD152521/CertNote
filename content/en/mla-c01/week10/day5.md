# Day 5 - D-Day Wrap-Up: Exam Structure, Time Management, and Scenario Decomposition Strategy

## 📌 Key Takeaways

- MLA-C01 is **65 questions (50 scored + 15 unscored) / 130 minutes / passing score 720 (out of 1000)**. You can't tell which questions are unscored.
- On average, **2 minutes** per question. Keep this pace: first pass 90-100 minutes → second review 25-30 minutes → third wrap-up 5 minutes.
- If you get stuck, put a tentative answer, flag it, and move on. Every question is worth the same, and **since there is no penalty for wrong answers, a blank is a pure loss**.
- Decompose long case-based questions in this order: last question → condition keywords → recall the answer before looking at the options → eliminate traps.
- Always read the superlative qualifiers (MOST/LEAST). Even if several options work, only the single best one by that criterion is the answer.

## Exam Structure - What You'll Face

It's the last day of the 10 weeks. Today we cover not new knowledge but the **skill of taking the exam**. Even at the same skill level, pass or fail is decided by time management and question decomposition strategy.

| Item | Details |
|------|------|
| Number of questions | 65 questions (50 scored + 15 unscored) |
| Time | 130 minutes |
| Question types | Multiple choice (single/multiple answer), case-based, ordering, etc. |
| Passing score | 720 / 1000 (scaled score) |
| Result | Calculated from the 50 scored questions (the 15 unscored are not reflected in the score) |

The domain weights are as follows.

```text
 Domain 1  Data Preparation              ████████████████████████████  28%
 Domain 2  Model Development            ██████████████████████████    26%
 Domain 4  Monitoring and Security       ████████████████████████      24%
 Domain 3  Deployment and Orchestration  ██████████████████████        22%
                                        └ 1+2 = 54%  ·  3+4 = 46% ┘
```

You can't abandon any one domain, but since Domains 1 and 2 make up more than half, stability in the data and model areas is the foundation of passing.

The 15 unscored questions are trial questions for future exams, and you can't tell which ones they are. So don't guess "this one must be unscored"; treat every question equally. The passing mark of 720 is a scaled score adjusted for question difficulty, so it can't be converted directly into a percentage of correct answers. Therefore the goal is not perfection but "a solid majority + avoiding traps."

## Time Management - How to Use the 130 Minutes

With 65 questions in 130 minutes, you have **2 minutes per question on average**. We recommend the following pace.

- **First pass (about 90-100 minutes)**: Solve every question once. If you're stuck for more than 2 minutes, put in a tentative answer, **flag** it, and move on. Never spend more than 5 minutes on a single question.
- **Second review (about 25-30 minutes)**: Go back to the flagged questions and solve them calmly. Other questions you saw in the first pass often give hints.
- **Third wrap-up (about 5 minutes)**: Check that there are no blank answers and that you picked the right number in multiple-answer questions.

This is a checkpoint table for mid-exam checks. By comparing it with the remaining time on the actual exam screen, you can tell right away whether you've fallen behind.

| Elapsed time | You should be done through here | Action if you're behind |
|-----------|------------------------|----------------|
| 30 min | About 15 questions | Tighten the flag-and-move-on threshold from 2 minutes to 90 seconds |
| 60 min | About 30 questions | For long case-based questions, read only the question and qualifiers and win by elimination |
| 90 min | About 45 questions | Be prepared to cut review time down to 15 minutes |
| 100 min | First pass of 65 questions complete | Start reviewing in order of flagged questions |
| 125 min | Review ends | Final check of blanks and multiple-answer counts |

```text
[130-minute allocation]
├──────────── First pass 90-100 min ────────────┤── Second review 25-30 min ──┤─ Third 5 min ─┤
   All questions once · guess and flag if stuck      Re-review flagged questions    Blanks · counts
```

> ⚠️ **Trap**: The most common failure is "pouring 10 minutes into one hard question and then not being able to solve the easy ones later." Every question is worth the same. The discipline of guessing, flagging, and moving on immediately when stuck protects your score. Also, always guess on a question you have no answer for — there is no penalty for wrong answers, so a blank is a pure loss.

## Scenario Decomposition Strategy - Taking Apart Long Questions

Decompose long case-based questions in the following order.

1. **Read the last question sentence first.** "What is the MOST cost-effective?", "What is the most appropriate inference option?" — once you know what's being asked, it becomes clear what to look for in the body.
2. **Mark the decision keywords.** Real-time/intermittent, imbalance, time series, drift, internet blocked, encryption, and so on.
3. **Recall the answer before looking at the options.** Apply Day 4's translation table.
4. **Eliminate the traps from the options.** Cross out any option that violates even one requirement.

```text
[4-step decomposition]
  ① Last question ─▶ "What am I being asked to choose" + qualifier (MOST/LEAST)
        ▼
  ② Scan the body ─▶ Number the condition keywords  (conditions ①②③)
        ▼
  ③ Answer before options ─▶ Write the feature name in your head using the translation table
        ▼
  ④ Eliminate options ─▶ Remove options that break any condition → the one remaining
```

## Handling by Question Type

| Type | Characteristics | Approach |
|------|------|------|
| Single-answer multiple choice | 1 of 4 options | Recall the answer first with the translation table, then find it among the options |
| Multiple-answer (TWO, etc.) | You must pick the exact number and there is no partial credit | Check the count first, lock in the sure ones, then compare the rest |
| Long case-based | 2-3 condition keywords are scattered | Question and qualifier first → number the conditions → the option that satisfies all conditions |
| Matching/ordering | Pair items or arrange an order | Fix the pairs you're confident about and fill in the rest by elimination |
| "Which is incorrect?" | Negative question | Always check whether the question contains a negative. Find the 3 correct ones and eliminate them |

> ⚠️ **Trap**: If you miss a negative ("NOT", "which is incorrect"), you pick the opposite even though you know the answer. It's a mistake that is easier to make the more hurriedly you read. The habit of giving a second look to negatives and qualifiers (MOST, LEAST, TWO) when reading the question sentence prevents this loss.

Multiple-answer questions (pick 2 or more) need a separate strategy. When a question explicitly says "TWO" or "TWO actions," you must pick exactly that number, and getting only one right earns no partial credit. Also, **superlative qualifiers** such as "MOST cost-effective," "LEAST operational overhead," and "MOST secure" are the key. Even if several options technically work, only the single best one by the qualifier's criterion (cost, operational burden, security) is the answer. If you miss the qualifier, you pick a trap option that "works but isn't the best."

## Last-Minute Check - What to Skim Right Before the Exam

The day before and the morning of the exam, quickly review the following.

| Area | One-line check |
|------|-----------|
| Inference options | Separate real-time/serverless/asynchronous/batch by immediacy, traffic, and payload |
| Advanced deployment | Many similar models = MME, a few models from different frameworks = MCE, preprocessing chain = inference pipeline |
| Algorithms | Time series = DeepAR, anomaly = RCF, tabular = XGBoost, recommendation = FM, text = BlazingText |
| Evaluation metrics | Imbalance = F1/AUC, missed cases = Recall, false alarms = Precision, regression = RMSE |
| Training infrastructure | Large data = Pipe/FastFile, repeated reads = FSx, cost = Spot + checkpoints |
| Tuning | Few trials = Bayesian, early stopping = Hyperband |
| Data preparation | Visual = Data Wrangler, script = Processing Job, ETL = Glue, querying = Athena |
| Features | Training-inference consistency = Feature Store (online single record/offline bulk) |
| Monitoring | Input drift = Data Quality, performance degradation = Model Quality (+labels) |
| Bias and explainability | Clarify (pre/post-training bias, SHAP), ongoing monitoring in production is Model Monitor |
| Security | IAM least privilege · VPC endpoints (S3 = Gateway, the rest = Interface) · isolation · KMS |
| Governance | Who = CloudTrail, metrics = CloudWatch, lineage = Lineage, documentation = Model Cards |
| MLOps | EventBridge → Pipelines (ConditionStep) → Model Registry |
| Cost | MME · Inferentia · serverless/asynchronous · Spot · batch transform |

Right before the exam, **solidifying the retrieval paths of what you already know** is more effective than cramming in new concepts. Retrieval practice, in which you map the table above out loud from keyword → feature, helps with recall in the exam room far more than reading the information anew. Sleep enough, arrive at the exam site early, and don't be shaken even if you get stuck on the first few questions — hard questions clustered at the front is just a common arrangement.

## Exam-Day Checklist

This is a check of the items to bring and the environment, so you don't lose points for reasons outside knowledge. The detailed rules differ depending on how you take the exam (test center / online proctored), so treat the instructions in your booking confirmation email as the final authority.

| Category | Check item |
|------|-----------|
| The day before | Get enough sleep. Don't start a new course or a new problem book |
| The day before | Recheck the booked time, exam delivery method, and location (or the online proctoring procedure) |
| What to bring on the day | The ID specified in the booking confirmation. Check that the name spelling matches the booking |
| Test center | Arrive with time to spare. Check the rules for storing belongings |
| Online exam | Run the system check beforehand, tidy your desk, and secure a quiet, undisturbed space |
| Right after starting | First check where the remaining time is displayed and where the flag button is |
| During the exam | Compare your progress at the 30/60/90-minute marks. If you're behind, adjust your pace immediately |
| Before finishing | Confirm 0 blanks and matching counts on multiple-answer questions, then submit |

## Final Retrieval Cards - Answer Out Loud

Don't read; **say the answer first**, then check the right side. If any row stalls you, review only that week's content again.

| Question | Answer |
|------|-----|
| Which inference option doesn't scale to 0? | Real-time (keeps at least 1 instance) |
| Individual requests that are large and take a long time? | Asynchronous inference |
| Scoring the whole dataset at once? | Batch transform |
| Thousands of models on the same framework? | Multi-model endpoint (MME) |
| To reuse the training-time preprocessing as is at inference? | Inference pipeline or Feature Store |
| Finding outliers without labels? | Random Cut Forest |
| Forecasting the future of multiple related time series? | DeepAR |
| Performance metric for 99% normal data? | F1, AUC, Recall (not Accuracy) |
| Metric for a problem you can't afford to miss? | Recall |
| Which monitor only runs when ground-truth labels exist? | Model Quality |
| Which monitor watches input distribution changes? | Data Quality |
| One-time bias check before deployment? | Clarify |
| To reach S3 without the internet? | Gateway VPC endpoint |
| To reach ECR without the internet? | Interface endpoint (PrivateLink) |
| To cut off a container's outbound communication? | EnableNetworkIsolation |
| To check "who deleted it"? | CloudTrail |
| To trigger retraining when new data arrives? | EventBridge → Pipelines |
| To block registration of a model that misses the bar? | ConditionStep |
| To cut training cost but still be able to resume? | Managed Spot + checkpoints |
| To find hyperparameters with few trials? | Bayesian |

The reason the cards above work is that their format is the same as the exam's. What you need in the exam room is not "knowledge you can explain" but **the speed of pulling out a single name from a short cue**. Rereading material makes you feel like you know it (the illusion of familiarity), but when you actually try to pull it out, the rows where you stall are revealed. The final review must be done by pulling things out.

## Five Final Disciplines

- Don't spend more than 5 minutes on a single question. Every question is worth the same.
- Never leave a blank. Since there is no penalty for wrong answers, guessing is always a gain.
- Read the qualifiers (MOST, LEAST, TWO) as if reading them aloud. The most questions are decided here.
- Count the conditions, and mark how many of them each option satisfies.
- Don't reverse your first instinct without grounds. To reverse it, you should be able to say "because of which condition."

## Closing the 10 Weeks

MLA-C01 is ultimately **an exam about translating requirements into SageMaker features**. Over 10 weeks we've gone full circle, from collection, feature engineering, Feature Store, and Clarify through training, tuning, and evaluation, inference options and advanced deployment, Pipelines and MLOps, and Model Monitor, IAM, VPC, and KMS. With stability in data preparation (Domain 1) and model development (Domain 2) as your foundation, you just need to recall the keyword mappings for deployment (Domain 3) and monitoring and security (Domain 4) reflexively.

## 📖 Glossary

- **Scaled score**: A score converted to a 100-1000 range after adjusting for question difficulty. The MLA-C01 passing mark is 720.
- **Unscored questions**: 15 questions mixed in for future exams. Since you can't tell which ones they are, you must treat them all the same.
- **Flag**: A feature that bookmarks a question on the exam screen to revisit later. The key tool for the first pass.
- **First pass / second review**: The stage of skimming through all questions once / the stage of re-solving only the flagged questions. The skeleton of time management.
- **Multiple-answer question**: A question like "TWO" that tells you to pick an exact number. If the count is wrong, it is marked incorrect with no partial credit.
- **Superlative qualifier**: An expression that specifies the comparison criterion, such as MOST cost-effective or LEAST operational overhead.
- **Retrieval practice**: A review method of pulling things out of memory instead of rereading material. The most effective kind of review right before the exam.
- **Decision keyword**: A word in a scenario that decides the answer (intermittent, bulk, imbalance, time series, drift, internet blocked, etc.).

---

## 📝 Practice Questions

**Question 1.** Which statement about the MLA-C01 exam structure is most accurate?

A) All 65 questions are scored, and you need to get 80 out of 100 right  
B) A total of 65 questions (50 scored + 15 unscored), 130 minutes, passing scaled score of 720, and unscored questions are not reflected in the score  
C) 50 questions in 60 minutes, passing score of 600  
D) The number of questions and time differ randomly for each test taker  

**Answer: B**  
Explanation: MLA-C01 has 65 questions (50 scored + 15 unscored) solved over 130 minutes, the passing mark is 720 out of 1000, and the 15 unscored questions are not reflected in the score. A is wrong on the scored/unscored distinction and the scoring basis, C is wrong on the question count, time, and passing mark, and D is not true because the structure is standardized.

---

**Question 2.** During the first pass, you can't be sure of the answer to a scenario question after 2 minutes. What is the most recommended action?

A) Keep staying on that question until you are confident  
B) Tentatively pick the most plausible answer, flag it, move on to the next question, and look at it again in the review stage  
C) Leave that question blank and move on  
D) End the exam early  

**Answer: B**  
Explanation: Since every question is worth the same, the strategy that protects your score is not to spend too much time on one question, but to put in a tentative answer + flag, move on, and look at it again in the review stage. A makes you miss the easy questions later, C is a pure loss since there is no penalty for wrong answers, and D means giving up the remaining questions.

---

**Question 3.** Which is the most appropriate recommended order for solving a long case-based question efficiently?

A) Read the body closely from start to finish, then read the question at the end  
B) Read the last question (what is being asked) first, find the decision keywords in the body, recall the answer before looking at the options, then eliminate the trap options  
C) Memorize the 4 options first and then read the body  
D) Ignore the keywords and choose by intuition alone  

**Answer: B**  
Explanation: Reading the question first makes it clear what to look for in the body, and the most efficient order is to settle the answer first through keyword → feature translation and then eliminate options that violate the requirements. A wastes time by reading closely without knowing what to look for, C is inefficient, and D makes it easy to fall into traps.

---

**Question 4.** What is the key point of caution when solving a question that includes a superlative qualifier such as "Which of the following is the MOST cost-effective option?"

A) Pick any option that technically works  
B) Even if several options work, only the single best one by the qualifier's criterion (cost) is the answer, so compare and choose based on the qualifier  
C) The qualifier can be ignored  
D) The most expensive option is always the answer  

**Answer: B**  
Explanation: In superlative-qualifier questions, even if several options are technically possible, only the single best one by that criterion (cost, operational burden, security) is the answer, so you must use the qualifier as the explicit comparison criterion. A and C ignore the qualifier and lead you to pick a trap that "works but isn't the best," and D is the exact opposite of cost-effectiveness.

---

**Question 5.** What is the most effective final review method right before the exam?

A) Read at length the documentation of a new service you've never seen to add knowledge  
B) Solidify recall paths by doing retrieval practice (mapping out loud) on keyword → feature mappings you already know  
C) Stay up all night rewatching all the lectures  
D) Rely only on intuition with no preparation  

**Answer: B**  
Explanation: Right before the exam, practicing retrieval (active recall) of what you've already learned is more effective for recall in the exam room than adding new information. A is hard to absorb in a short time, C hurts your condition through lack of sleep, and D is a way of not making use of your preparation.

---
