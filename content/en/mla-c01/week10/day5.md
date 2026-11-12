# Day 5 - D-Day Finale: Exam Structure, Time Management, Scenario Breakdown Strategy

Final day of 10 weeks. Today isn't new knowledge but **exam technique**. Same skill level rises or falls based on time budgeting and problem breakdown. Know MLA-C01's structure precisely, use 130 minutes wisely, decompose long scenarios quickly, check everything pre-exam. Strong prep deserves confidence today.

## Exam Structure — What You Face

| Item | Detail |
|------|--------|
| Questions | 65 (50 scored + 15 unscored) |
| Time | 130 min |
| Question Types | Multiple choice single/multi, scenario, sequencing |
| Pass Score | 720 / 1000 (scaled) |
| Scoring | 50 scored questions only (15 unscored = experimental) |

Domain weights: **1 Data Prep 28% · 2 Model Dev 26% · 3 Deploy/Orch 22% · 4 Monitor/Security 24%**. No domain is skippable; Domains 1&2 top-heavy, so stability there = foundation passed.

> 💡 **Related Theory**: 15 unscored are test questions for future exams—you don't know which are unscored. Treat all equally. Pass line ~720 = ~70% of 50 scored. Goal isn't perfection but "majority solid + trap-dodge."

## Time Budgeting — Using 130 Minutes

65 questions / 130 minutes = **2 minutes average per question**. Recommended pace:

- **Pass 1 (~90–100 min)**: All questions once. Stuck >2 min? Mark/flag and move. **Never spend 5+ on one question.** All questions worth equal points.
- **Pass 2 (~25–30 min)**: Return to flagged questions calmly. Other questions seen in Pass 1 often hint at answers.
- **Pass 3 (~5 min)**: Empty answers? Multi-answer count correct? Final check.

> ⚠️ **Trap**: Common failure: "spent 10 min on one hard question, ran out of time for easy later ones." Flag and move. Also: **never leave blanks**. No wrong-answer penalty, so unanswered = pure loss.

## Scenario Decomposition — Disassemble Long Problems

Long scenario questions: read in this order.

1. **Read the final question first.** "Most cost-efficient?" "Most appropriate inference option?" — know what you're solving before diving into context.
2. **Mark decision keywords.** Real-time/sporadic, imbalanced, time series, drift, no internet, encrypt, etc.
3. **Decide answer before seeing options.** Use Day 4's translation table.
4. **Eliminate traps via option scan.** Cross out any option breaking even one requirement.

> 🔍 **Deeper**: Multi-answer ("select TWO") needs exact count—one right, one wrong = zero credit. Watch **superlatives** ("MOST secure", "LEAST overhead", "MOST cost-efficient"). Many options work technically, but superlative criterion picks one winner. Miss the superlative, choose "works but not best" trap.

## Pre-Exam Quick Checks

Night before and morning of: rapidly review this.

| Area | One-Line Check |
|------|---------|
| Inference Options | Real-time/serverless/async/batch by immediacy, traffic, payload |
| Algorithms | DeepAR time series, RCF anomaly, XGBoost tabular, BlazingText text, Factorization Machines sparse |
| Evaluation Metrics | Imbalance=F1/AUC, miss=Recall, false alarm=Precision, regression=RMSE |
| Monitoring | Input drift=Data Quality, performance=Model Quality+labels |
| Bias/Explainability | Clarify pre/post bias, SHAP |
| Security | IAM least privilege, VPC Endpoint, KMS at-rest, CloudTrail audit |
| MLOps | Pipelines + Registry + EventBridge trigger |
| Cost | MME, Inferentia, serverless, Spot, auto-shutdown, tags |

> 💡 **Related Theory**: Pre-exam review isn't learning new stuff—it's **sharpening recall paths** for known concepts. Saying keywords→function mappings aloud (active recall) helps more than re-reading. Sleep well, arrive early, don't panic if early questions feel hard (common test design).

## Summary — 10 Weeks Closing

MLA-C01 is fundamentally **translating requirements into SageMaker functions.** 65 questions/130 minutes, pass 720, 2-min discipline, flag-and-move discipline, superlative reading — these exam techniques turn 10 weeks of knowledge into scored points. Domains 1&2 foundation = majority secure. Domains 3&4 keyword mapping = reflex recall.

You've traversed data collection → feature engineering → Feature Store → Clarify, training → tuning → evaluation, inference options → Pipelines/MLOps, Model Monitor → IAM/VPC/KMS. One rotation complete.

Trust your prep. Answer calmly. Good luck.

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
