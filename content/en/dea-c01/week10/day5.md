# Day 5 - D-Day Wrap-Up: Exam Structure, Time Allocation, and Scenario Decomposition Strategy

## 📌 Key Takeaways

- DEA-C01 has 65 questions (50 scored + 15 unscored) and takes 130 minutes; 720 on a 100-1,000 scale is the passing score. The domain weights are 34/26/22/18%.
- That is about 2 minutes per question. Split the time into a 90-minute first pass, 30 minutes to review flagged questions, and 10 minutes for a final check, and never stay on one question for more than 3 minutes.
- Unanswered questions are scored as wrong, and there is no penalty for a wrong guess. Do not leave any answer blank.
- Decompose a scenario in the order question → constraint keywords → eliminate wrong answers → optimize for the constraints. For multiple-response questions, choose exactly the number requested.
- Use D-Day not for new study but for reviewing the translation table (Day 4) and your wrong-answer notes, and for managing your condition. If you fail, you can retake after 14 days.

## The Exam Structure at a Glance

This is the last day. Rather than cramming in new knowledge, we organize the **exam structure, time management, and question decomposition** so you can perform at your true level in the exam room. In DEA-C01, what separates pass from fail is less the depth of knowledge than "the speed and composure to translate a requirement into the right service."

| Item | Details |
|------|------|
| Number of questions | 65 (50 scored + 15 unscored) |
| Time | 130 minutes |
| Passing score | 720 / 1000 (100-1000 scale) |
| Question types | Multiple choice (1 correct answer out of 4 options), multiple response (2 or more correct answers out of 5 or more options) |
| Domain 1 (ingestion and transformation) | 34% |
| Domain 2 (store management) | 26% |
| Domain 3 (operations and support) | 22% |
| Domain 4 (security and governance) | 18% |
| Exam fee | 150 USD |
| Exam languages | English, Korean, Japanese, Simplified Chinese |
| Delivery method | Pearson VUE test center or online proctored exam |
| Certification validity | 3 years |

> 💡 **Related theory**: The 15 unscored questions are not marked. So do not assume "a hard question might not count toward my score"; treat every question the same, but if you get stuck, flag it and move on.

## How the Score Is Calculated

The exam guide states five scoring rules. Knowing the rules settles what you do not need to worry about during the exam.

| Rule | Details | What it means in the exam room |
|------|------|------|
| Scaled score | Results are reported as a scaled score from 100 to 1,000. Difficulty differs slightly between exam forms, and the scaling is meant to adjust for that difference | 720 does not mean "a 72% correct rate." Do not try to work backward from the number of correct answers to whether you passed |
| Compensatory scoring | There is no passing mark per domain (section); only the overall score counts | A strong domain can make up for a weak one |
| Unscored questions | 15 questions are for collecting statistics for future exams and are not marked | Do not get shaken by unfamiliar or excessively hard questions |
| Unanswered | A question left unanswered is scored as wrong | Do not leave any answer blank |
| Guessing | There is no penalty for a wrong answer | If you do not know, eliminate and guess |

- The score report may show a table of performance levels by domain. Because each domain has a different number of questions, the assessment of a domain with few questions is easily skewed, so the exam guide also tells you to interpret section-level feedback carefully.
- Multiplying the domain weights by the 50 scored questions gives roughly 17, 13, 11, and 9 questions. Since Domains 1 and 2 account for about 30 questions, split your final review time by the same ratio.

## Time Allocation Strategy

- **130 minutes total / 65 questions = about 2 minutes per question.** Finish simple mapping questions in 30 to 60 seconds to bank time for the hard ones.
- **First pass (about 90 minutes)**: Solve quickly, flag any question you get stuck on, and move on immediately. Do not get held up on one question for more than 3 minutes.
- **Second review (about 30 minutes)**: Solve the flagged questions again and lock in answers starting with the ones you are confident about.
- **Third buffer (about 10 minutes)**: Recheck the "choose exactly N" condition on multiple-response questions and check that no answers are blank.

> 💡 **Related theory**: A blank answer cannot earn points, so always guess at least one choice even on questions you do not know. If there is a risk of running out of time, filling in all the unanswered questions at the very end with the most plausible choice raises your expected score.

- Add the flag **after you have chosen a tentative answer**. If you flag a question without an answer, it stays unanswered when you run out of time.
- Decide in advance the criterion for changing an answer in the second review. Change it only when you newly find a condition you missed in the stem, and do not change it out of vague anxiety.

## The 4 Steps for Decomposing Scenario Questions

This is how to avoid panicking in front of a long question.

1. **Read the question sentence first**: "Most cost-effective," "with the least operational overhead," and "in real time" are the real scoring criteria.
2. **Underline the constraint keywords**: serverless/real time/batch/cost/security and encryption/minimal code.
3. **Eliminate two wrong answers**: Remove choices whose service purpose clearly does not fit (for example, DynamoDB for analytic SQL).
4. **Choose by optimizing the constraints**: Of the remaining two, the one that best satisfies the constraints. Not "possible" but "most suitable."

```text
Example) "Load tens of thousands of streaming records per second into S3 as Parquet with minimal operations"
  Question criterion → minimal operations (serverless)
  Keywords           → streaming / managed-free loading / S3
  Eliminate          → always-on EMR, EC2 cron (operational burden)
  Choose             → Data Firehose (buffering, transformation, automatic delivery)
```

## Cautions for Multiple-Response Questions

- Follow a condition like "Choose **two**" exactly. The exam guide does not mention partial credit, so prepare on the assumption that you score only if you get every requested choice right.
- Judge each choice independently as true or false, and then combine them.
- When the question has two requirements, the correct answers often correspond one to each requirement. If it is "column access control + decryption auditing," choose two choices that satisfy different requirements, such as Lake Formation and SSE-KMS, and be suspicious of two choices that satisfy the same requirement twice.

## What Changed in Version 1.1 of the Exam Guide

The exam guide was revised to version 1.1 on December 12, 2025. The announcement says the revisions are reflected on the exam about a month after publication. These are items that will feel unfamiliar to candidates who looked only at old summaries of past questions.

| Category | Details |
|------|------|
| Newly added technical items | LLM integration in data processing, managing open table formats (Apache Iceberg), vector index types (HNSW, IVF), vectorization concepts (Amazon Bedrock knowledge bases), business data catalog (Amazon SageMaker Catalog), domains and projects in SageMaker Unified Studio, governance frameworks and data sharing patterns |
| Services added to scope | Amazon Aurora, Amazon Q, Amazon Bedrock, Amazon Kendra, AWS Data Exchange, Amazon S3 Tables |
| Services removed from scope | AWS Cloud9, AWS CodeCommit, AWS Schema Conversion Tool (removed from the list, but still mentioned as an example in the schema conversion technical item) |
| Deleted technical items | None (existing knowledge items were merged into technical items) |

- The new vector-related items are written as "Describe." You do not need to know how to tune a vector index; it is enough to be able to say in one sentence how HNSW and IVF differ and why Iceberg is needed (see the table on Day 1).
- There are also job tasks the exam guide states are **out of scope**. They are performing ML model training and inference, knowledge of the syntax of a specific programming language, and drawing business conclusions from data. Even when code appears, it asks what the code does, not its syntax.

## Final Checklist by Domain

If you can complete the sentence out loud, that line passes. Go back to the relevant week only for the lines where you get stuck.

```text
[Domain 1 - Ingestion and Transformation]
□ The one word that separates Streams from Firehose? (→ direct consumption, reprocessing)
□ The cause of a hot shard and the only fundamental fix? (→ key skew, redesign the partition key)
□ The three conditions for a bookmark to work? (→ Enable, transformation_ctx, job.commit())
□ The difference between a bookmark and CDC? (→ new rows only / including UPDATEs and DELETEs)
□ The criterion for a transformation Lambda cannot handle? (→ over 15 minutes)
□ Three cues for choosing EMR over Glue? (→ large scale, fine-grained tuning and Spot, existing Spark/Hive)
□ The cue that separates Step Functions from MWAA? (→ existing Airflow assets)

[Domain 2 - Store Management]
□ The four things to fix when Athena is slow or expensive? (→ format, compression, partitions, file size)
□ What do DISTKEY and SORTKEY each reduce? (→ shuffle / scan)
□ The targets of Spectrum and federated queries? (→ S3 / operational DB)
□ The constraint of partition projection? (→ Athena only)
□ The minimum storage duration by S3 class? (→ IA 30 days, Glacier 90 days, Deep Archive 180 days)
□ What does Iceberg solve? (→ ACID, row-level updates, and time travel on the lake)

[Domain 3 - Operations and Support]
□ The tools for alerts / root cause tracing / caller tracing? (→ Alarm / Logs Insights / CloudTrail)
□ The mechanism that blocks bad data before loading? (→ Glue Data Quality inside the ETL job)
□ What happens when retries are placed in several layers? (→ they multiply; put them in one layer only)
□ The principle that prevents duplicates when rerunning? (→ idempotency: overwrite, MERGE)
□ Which of provisioned and serverless favors a steady all-day load? (→ provisioned)

[Domain 4 - Security and Governance]
□ What do IAM / Lake Formation / KMS each protect? (→ APIs and resources / tables, columns, rows / keys)
□ The cue for choosing SSE-KMS? (→ key control, rotation, auditing)
□ Why an AWS managed key does not work for cross-account sharing? (→ the key policy cannot be changed)
□ To record object-level access for S3? (→ CloudTrail data events)
□ The difference between Macie and GuardDuty? (→ sensitive data discovery / threat detection)
□ Automatic credential rotation? (→ Secrets Manager)
```

## Registration Procedures and Policies

There are cases where people lose out by not knowing the procedures as much as the exam content. This is based on the AWS certification policies page.

| Item | Details |
|------|------|
| Rescheduling and cancellation | Allowed up to 24 hours before the scheduled time, and one booking can be changed only twice. If you cancel within 24 hours, the exam fee is not refunded |
| ESL +30 | An accommodation that gives 30 extra minutes to candidates whose native language is not English when they take the exam **in English**. If you apply once **before** registering for the exam, it applies to later registrations. It does not apply if you take the exam in Korean |
| ID | Government-issued ID is required. Requirements differ between online and test centers, so check in the booking instructions |
| Result notification | Posted to your AWS certification account within 5 business days after the exam ends |
| If you fail | You can retake after waiting 14 days (calendar days). There is no limit on the number of attempts, but you pay the full exam fee each time |

- Whether taking the exam in Korean or in English (+30 minutes) is more advantageous differs from person to person. If the Korean translation of a stem feels awkward, recall the English original of the service names and feature terms to cross-check.
- The online proctored exam has a procedure to check your testing environment before it starts. Log in earlier than the time stated in the access instructions, and clear your desk in advance.

## D-Day Condition Checklist

- The day before the exam: no new concepts; review only the translation table (Day 4) and your wrong-answer notes lightly.
- Check your ID, reservation time, and test center (or the online proctor environment).
- If taking it online, check your desk setup, webcam, and network in advance.
- Get enough sleep. During the exam, do not be shaken by the first time you get stuck, and keep your pace.

The passing line (720) is a line that proves you "know enough," not a perfect score. Rather than losing your pace trying to solve one or two questions perfectly, securing every question you are sure of without gaps is better for the overall score.

## Rules for When You Get Shaken During the Exam

If you have rules decided in advance, you can save the energy you would spend on judgment during the exam.

| Situation | Rule |
|------|------|
| A service name you have never seen appears in a choice | Judge the three choices you know first. Pick the unknown choice only when all three violate the conditions |
| Questions on unfamiliar topics come one after another | They may be unscored questions. Pick a tentative answer and move on |
| Two choices both look correct | Reread the qualifiers in the question sentence. It usually splits on operational burden or cost |
| 3 minutes have passed on one question | Pick the most plausible choice now, flag it, and move on |
| You are more than 5 questions behind at the midpoint check | For the next 20 questions, read long stems starting from the question sentence and cut off at 2 minutes |
| Unanswered questions remain with 5 minutes left | Do not read the stems; fill in answers for all the remaining questions |
| You want to change an answer in the second review | Change it only when you have found a condition you missed |

What you built over 10 weeks is not a list of services but "the order of reading a requirement and choosing a design that fits the conditions." Just solve the 65 questions in that order.

## 📖 Glossary

- **Scaled score**: A score converted to the same standard after adjusting for the different difficulty of each exam form. It does not equal the percentage of correct answers.
- **Compensatory scoring**: A method that decides passing by the overall score only, with no passing mark per area.
- **Unscored question**: A question for collecting statistics that does not count toward the score. Candidates cannot tell which questions they are.
- **Multiple response**: A question type in which you choose two or more correct answers from five or more options.
- **Flag for review**: A mark placed on a question so you can come back to it later.
- **Online proctored exam**: An exam taken at your own location while a proctor watches through your webcam and screen sharing.
- **ESL +30**: An accommodation, which non-native English speakers can apply for, that extends the time by 30 minutes when they take the exam in English.
- **Exam guide**: The official document of exam scope published by AWS. It lists the domain weights, technical items, and the services in and out of scope.

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
