# Day 5 - Final D-Day Prep: Exam Structure, Time Management & Scenario Breakdown Strategy

This is our last day. Instead of cramming new concepts, today we lock in **exam structure, time strategy, and problem-solving technique** so you walk into the test room confident and composed. DEA-C01 tests not the depth of your knowledge but your **speed and poise in translating requirements into the right AWS service**. Today is your final checklist.

## Exam Structure at a Glance

| Aspect | Details |
|------|------|
| Total questions | 65 (50 scored + 15 unscored) |
| Time | 130 minutes |
| Passing score | 720 / 1000 (scaled score on 100–1000 scale) |
| Question types | Single-select (4 choices), multi-select (5+ choices, select 2–3) |
| Domain 1 (Ingestion & Transformation) | ~34% |
| Domain 2 (Storage Management) | ~26% |
| Domain 3 (Operations & Support) | ~22% |
| Domain 4 (Security & Governance) | ~18% |

> 💡 **Related theory**: Scores are scaled — each question has a different weight, and you won't know which 15 of the 65 are unscored. Don't assume "this hard one might not count." Treat every question equally. If you get stuck, flag it and move on.

## Time Management Strategy

- **Total 130 minutes ÷ 65 questions = ~2 minutes per question.** Simple mapping questions take 30–60 seconds; save time for the hard ones.
- **First pass (~90 minutes)**: Solve quickly. Stuck questions get flagged for review; move to the next immediately. Never spend more than 3 minutes on one question.
- **Second pass (~30 minutes)**: Revisit flagged questions. Confirm answers you feel confident about.
- **Third pass (~10 minutes)**: Final check—verify multi-select questions have the right *number* of selections, no blank answers.

> 💡 **Related theory**: A blank answer is a guaranteed zero. Even if you're unsure, always select *something*. Running short on time? In your final minutes, fill all blanks with your best guess for each question—this raises your expected score.

## 4-Step Scenario Breakdown

Master this technique to stay calm with long, complex problems.

1. **Read the question sentence first**: "Most cost-efficient," "minimal operational overhead," "real-time"—these are the *actual* scoring criteria.
2. **Underline constraint keywords**: serverless/real-time/batch/cost/security·encryption/minimal code.
3. **Cross out 2 obvious wrong answers**: Services whose purpose clearly doesn't fit (e.g., DynamoDB for analytical SQL).
4. **Pick the best-fit constraint**: Of the remaining two, which satisfies the constraints *best*? Not "possible"—"most appropriate."

```text
Example: "Ingest tens of thousands of events/sec with minimal ops, store as Parquet in S3"
  Scoring criteria  → minimal ops (serverless)
  Keywords         → streaming / managed ingestion / S3
  Cross out        → always-on EMR, EC2 cron (too much ops)
  Answer           → Data Firehose (automatic buffering, transformation, delivery)
```

## Multi-Select Questions: Critical Details

- Respect the exact count: "select **two** of the following" is strict. If only one or three is correct, partial credit doesn't exist — it's wrong.
- Evaluate each option independently (true/false), then combine.

## D-Day Wellness Checklist

- Night before: No new concepts. Light review of your Day 4 quick-reference sheet and error log only.
- Confirm ID, reservation time, test center (or online proctor environment setup).
- If testing online: clear desk, test webcam, verify network connection beforehand.
- Get adequate sleep. During the test, don't panic at the first difficult question—maintain your pace.

> 💡 **Related theory**: 720 is not "perfect"—it's "competent." Don't lose pace trying to perfect 1–2 questions. Secure the questions you know cold; that's your path to 720+.

## Key Takeaways

- 65 questions / 130 minutes / 720 passing score. Domain weights: 34/26/22/18%.
- ~2 minutes per question. Stuck? Flag it and move. Recovery in pass 2.
- Blanks = automatic fail. Always answer, even if guessing.
- Scenarios: read question → extract constraints → eliminate obvious wrongs → pick best-fit.
- D-Day: review, not learn. Stay rested and composed.

## 📝 Practice Questions

**Question 1.** Which of the following correctly describes the structure of the DEA-C01 exam?

A) 100 questions, 180 minutes, passing score 600  
B) 40 questions, 90 minutes, passing score 800  
C) 65 questions (50 scored + 15 unscored), 130 minutes, passing score 720  
D) 75 questions, 120 minutes, passing score 700  

**Answer: C**  
Explanation: DEA-C01 has a total of 65 questions (50 scored, 15 unscored) to be completed in 130 minutes, and the passing score is 720 on a scale of 1000. The others do not match the actual structure.

---

**Question 2.** During the exam, you have been stuck on one question for 4 minutes. What is the best course of action?

A) Stay on it until you find the answer  
B) Leave the question blank  
C) Guess the same option for all remaining questions  
D) Select a tentative answer, flag it for review, and move on to the next question  

**Answer: D**  
Explanation: To keep an average pace of 2 minutes per question, mark a tentative answer for a question you are stuck on, move on, and revisit it during a second review. Staying indefinitely makes you miss easy questions, and leaving it blank forfeits the chance to recover.

---

**Question 3.** In a multiple-response question that says "Choose TWO," what is the most appropriate response when you are confident about only one answer?

A) Select only one and submit  
B) Evaluate each of the remaining options independently as true or false and also select the most plausible second one  
C) Always select three  
D) Leave the question blank  

**Answer: B**  
Explanation: A multiple-response question receives credit only if you select exactly the required number of options. You should evaluate each option independently to build the most plausible combination, and selecting too few or too many options, or leaving it unanswered, is scored as incorrect.

---

**Question 4.** What is the correct order for breaking down a long scenario question most efficiently?

A) Read the question (last sentence) first → extract constraint keywords → eliminate clearly wrong answers → choose the option that best optimizes for the constraints  
B) Read the passage thoroughly from beginning to end, then look at the options  
C) Memorize the options first  
D) Choose the longest option as the answer  

**Answer: A**  
Explanation: Reading the question first to identify the scoring criteria (cost, operations, real-time, and so on), eliminating wrong answers using constraint keywords, and then choosing the option that best satisfies the constraints improves time efficiency and accuracy. The length of an option has nothing to do with the correct answer.

---

**Question 5.** There are 3 unanswered questions left with 5 minutes remaining in the exam. What is the most reasonable action?

A) There is no time, so submit as is  
B) Carefully solve only one question and leave the rest blank  
C) Fill in answers for all remaining questions by choosing the most plausible option for each  
D) Erase all the answers you have already given  

**Answer: C**  
Explanation: A blank answer is a guaranteed wrong answer, so even when time is short you should fill in every unanswered question with the most plausible option to raise your expected score. Leaving them blank or erasing existing answers loses points.

---
