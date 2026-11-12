# Day 5 - D-Day Wrap-Up: Exam Structure, Time Allocation, and a Final Check Checklist

At last, the final day. Rather than cramming in new knowledge, today we firm up the strategy for **how to take the exam**. Knowing the exam structure precisely, building a time-allocation plan, and holding an exam-day checklist in hand can earn you a higher score at the very same skill level.

## 📌 Key Takeaways

- Today is **not a day for putting in new knowledge but a day for getting ready to pull it out**. Cramming the night before usually raises anxiety more than it raises your score.
- 65 questions / 90 minutes. The basic skeleton is a 60-minute first pass, a 25-minute second pass for review, and a 5-minute final check.
- The passing line is **700** out of 1,000. You do not need to aim for a perfect score.
- A blank answer is always zero. Keep the last 5 minutes **reserved for filling in unanswered questions**.
- Physical condition is part of your ability too. Plan sleep, meals, and travel time ahead of the day before.

## Exam Structure (CLF-C02)

| Item | Details |
|------|------|
| Number of questions | 65 questions |
| Time | 90 minutes |
| Scored questions | 50 questions (15 are unscored evaluation questions) |
| Question types | Multiple choice (one correct option), multiple response (two or more options) |
| Score range | 100–1,000 |
| Passing line | 700 |
| Delivery | Test center or online proctored |
| Results | Usually a pass/fail notification within a few business days |

Of the 65 questions, 15 are unscored evaluation questions. Since you can't tell which ones are evaluation questions, you must answer **every question seriously**. Passing is based on 700 out of a maximum 1,000.

### How to Handle Each Question Type

| Type | What it looks like | Response |
|------|-------------|------|
| Multiple choice (one correct answer) | Pick one of four options | Eliminate the two clearly wrong options first |
| Multiple response (two or more) | "Choose two" format | Judge each option with a true/false mark |

On multiple-response questions you only earn credit if you **match the required number exactly**. Choosing just one or choosing three means the question cannot be saved. As soon as you read the question, check "how many was I asked to choose?" first.

### Walk In With the Domain Weights in Your Head

| Domain | Name | Weight |
|------|------|------|
| Domain 1 | Cloud Concepts | 24% |
| Domain 2 | Security and Compliance | 30% |
| Domain 3 | Cloud Technology and Services | 34% |
| Domain 4 | Billing, Pricing, and Support | 12% |

- Domain 3 (34%) and Domain 2 (30%) together make up **64% of the exam**. You can assume that two out of every three questions on the paper come from these two domains.
- Domain 4 is the smallest at 12%, but pricing models and cost tools are an area where **the answers are clear-cut**, so the return on investment is good. Dropping points here would be a waste.
- Use the weights not to decide "what more to study" but to **predict which domains will produce many questions** in the exam room. Today is already too late to expand your studying.

> ⚠️ **Pitfall**: It is a mistake to think "Domain 4 is only 12%, so I can skip it." On a 65-question exam, nearly ten questions come from here, and the margin above the passing line is not that large. On top of that, pricing models (On-Demand, commitment, Spot) and cost tools (up-front estimates, after-the-fact analysis, budget alerts) are the kind of material where **memorizing gets you the answer right away**, so there is no reason to give it up.

## Time Allocation Strategy

- 65 questions / 90 minutes = about **1 minute 23 seconds** per question
- **First pass**: Go through all questions once within 60 minutes. Answer easy ones immediately; flag and skip the ones you're unsure about.
- **Second pass**: Use the remaining 30 minutes to re-examine the flagged questions.
- **Final check**: Confirm every question has an answer (blanks are marked wrong, so fill them in even if it's a guess).

| Segment | Time | What to do |
|------|------|-------|
| 0–60 min | 60 min | First pass on all questions + flagging |
| 60–85 min | 25 min | Re-examine flagged questions |
| 85–90 min | 5 min | Check for unanswered questions, fill in guesses |

A blank is zero points, but a guessed answer has a chance of being right. If you eliminate two clearly wrong options from a four-option question, your odds of getting it right rise to 50%. You should always **fill in an answer for every question.**

### Set Your Midpoint Checkpoints in Advance

Watching the clock constantly actually makes you more anxious. Decide on **just two checkpoints** and look at the clock only then.

| Checkpoint | Where you should be | If you are behind |
|-----------|---------------------|---------|
| 30 minutes elapsed | About questions 22–25 | Flag questions you are unsure about more boldly and move on |
| 60 minutes elapsed | First pass on all 65 questions complete | Skim the remaining questions quickly and leave only flags |

### Recovery Order When Your Pace Falls Apart

There may come a moment in the exam room when you feel "I'm running out of time." At that point, move in the following order.

1. **Count the time remaining and the number of questions remaining.** Numbers are better than vague anxiety.
2. **Forget the flagged questions for a moment and start with the questions you haven't touched yet.** Unseen questions are more likely to be answered correctly than flagged ones.
3. **For long passages, read only the final question sentence and decide.** Even if you can't read all the conditions, you can still identify the category.
4. **If you are still short on time, fill in answers for the remaining questions for now.** If time is left after filling them in, go back.

### The Last 5-Minute Routine

- [ ] Check that there is not a single unanswered question
- [ ] Check that you matched the required number of answers on multiple-response questions
- [ ] Leave as they are any answers you feel like changing without a reason
- [ ] Even if time remains, do not forcibly flip answers; just submit

The point that people who have taken the exam most often regret is not "questions I got wrong because I didn't know" but **"questions I got wrong because I changed the answer at the end."** It is the case where you chose A on question 40, then in the last 3 minutes thought "it's probably C after all" and changed it, when A had been correct all along. There should be exactly one standard for changing an answer: **change it only when you discover a condition you did not notice at first.** "It just feels off" is not a reason.

## One Last Retrieval Before the Exam — One Sentence per Domain

Close the book and try answering the questions below first. If you get stuck on any item at this stage, it is enough to look at just that one line again and move on.

**Domain 1 — Cloud Concepts**

- What are the six advantages of the cloud? → Upfront investment becomes variable cost, economies of scale, no need to guess capacity, speed and agility, lower data center operating costs, deploying worldwide in minutes
- What is the difference between scalability and elasticity? → The ability to grow / the property of automatically growing and shrinking to match demand
- What are IaaS, PaaS, and SaaS? → Only the basic infrastructure / up to the application runtime environment / up to complete software
- What do you use to get high availability? → Spreading across multiple Availability Zones (AZs)

**Domain 2 — Security and Compliance**

- What is the Shared Responsibility Model in one line? → AWS is responsible for the cloud itself, the customer for what is "in" the cloud
- What is always the customer's responsibility no matter which service you use? → Data and access permissions
- What is the safe way for EC2 to access S3? → An IAM role
- What is the first step in account security? → Enable MFA on the root user + do not use it day to day
- What are CloudTrail / Config / CloudWatch? → Who did it / are the rules being followed / are the metrics normal
- What are Shield / WAF / GuardDuty? → DDoS protection / blocking web attacks / threat detection

**Domain 3 — Cloud Technology and Services**

- What are S3 / EBS / EFS? → Object storage / a disk attached to a single instance / a file system shared by multiple instances
- What are RDS / DynamoDB / Redshift? → Relational / serverless NoSQL / a data warehouse for analytics
- What is the difference between EC2 and Lambda? → A server I manage / a function that runs only when there is an event
- What are ELB and Auto Scaling? → Distributing traffic / increasing and decreasing the number of servers
- What is CloudFront? → Caches at the edge to deliver quickly to users worldwide

**Domain 4 — Billing, Pricing, and Support**

- When do you use On-Demand / commitment-based / Spot? → Unpredictable or short-term / steady use over a long period / when you can tolerate interruption
- What are Pricing Calculator / Cost Explorer / Budgets? → Future estimates / past analysis / current alerts
- What is the benefit of consolidated billing? → Combines the bills of multiple accounts into one and aggregates usage
- What are the branches of Support plans? → Basic / Developer / Business / Enterprise

## Final Check Checklist (Concepts)

- [ ] The six major cloud benefits and the distinction between IaaS/PaaS/SaaS
- [ ] The difference between Region / AZ / edge location
- [ ] Shared Responsibility Model: what is AWS's and what is the customer's responsibility
- [ ] IAM users, groups, roles, policies, least privilege, protecting the root user (MFA)
- [ ] The distinction between CloudTrail (auditing) / Config (configuration) / CloudWatch (monitoring)
- [ ] The distinction between Shield (DDoS) / WAF (web attacks) / GuardDuty (detection)
- [ ] Compute: EC2 / Lambda / Beanstalk / Fargate
- [ ] Storage: S3 / EBS / EFS / Glacier
- [ ] Databases: RDS / DynamoDB / Redshift / Aurora
- [ ] Networking: VPC / Route 53 / CloudFront / Direct Connect
- [ ] Pricing models: On-Demand / Reserved / Savings Plans / Spot
- [ ] Cost tools: Pricing Calculator / Cost Explorer / Budgets
- [ ] Support plan differences (Business = 24/7, Enterprise = TAM)
- [ ] Scalability vs. elasticity, and high availability vs. fault tolerance vs. disaster recovery
- [ ] The relationship between Organizations, consolidated billing, and SCPs
- [ ] The distinction between GuardDuty (behavior) / Inspector (vulnerabilities) / Macie (sensitive data)
- [ ] The distinction between Artifact (reports) / Config (configuration compliance) / Trusted Advisor (improvement recommendations)
- [ ] Services classified as serverless (Lambda, Fargate, DynamoDB, etc.)
- [ ] An intuitive sense of global services versus Regional services (IAM is global, etc.)

If three or four items are left unchecked, it is enough to look at **only the one-line definition** of each and move on. Today is not a day for opening a new chapter.

## 3-Second Tie-Breaking Rules for When You're Confused

These are short rules to pull out when you stall between two options in the exam room.

| Situation | 3-second tie-breaker |
|------|---------|
| AZ or Region? | If the passage has a "regional/geographic" expression, it's a Region; if not, it's an AZ |
| Auditing or monitoring? | If it's "who did it," it's auditing; if it's "how much is being used," it's monitoring |
| Estimate or analysis? | If you haven't used it yet, it's an estimate; if you already have, it's analysis |
| Can I choose Spot? | If there is an expression like "must not be interrupted," it's out |
| Serverless or not? | The moment you count instances yourself, it is not serverless |
| How do I grant permissions? | For people, users and groups; for services, a role |
| An option is tempting but I'm not sure | If it contains "always / unlimited / 100%," eliminate it |

Short rules like these are called **heuristics**. They are not perfect discriminators, but when you're short on time they act as **shortcuts that lower your chance of being wrong**. In the exam room there is no time to re-derive the theory from scratch. If you read this table a few times today, in front of the actual questions "agonizing" turns into "discriminating."

## Exam-Day Checklist (Practical)

- [ ] Have your ID ready (check that the name matches your registration information)
- [ ] For online proctoring, check the camera, microphone, internet, and a quiet space
- [ ] Rest well before the exam starts; no excessive cramming
- [ ] Arrive 30 minutes before the start (test center) or do a system pre-check (online)
- [ ] Submit after answering all questions

### The Night Before the Exam

- [ ] I re-confirmed the **date, time, and delivery method (test center/online)** I booked
- [ ] If testing at a test center, I confirmed the location, the travel route, and the expected travel time
- [ ] If testing online, I ran through the pre-check procedure in the exam instructions once in advance
- [ ] I took out my ID in advance and left it somewhere visible
- [ ] I did not grab onto new concepts; I only skimmed the Key Takeaways and the comparison tables
- [ ] I went to bed earlier than usual

### The Morning of the Exam

- [ ] I ate as usual (avoiding both overeating and an empty stomach)
- [ ] I had caffeine only in my usual amount
- [ ] I left with time to spare / if online, I turned on my equipment in advance
- [ ] Right before starting, I did not solve new questions and only skimmed my memorization cards

### Additionally, If You Are Taking the Exam Online With a Proctor

- [ ] I secured a quiet space where I will not be disturbed
- [ ] I cleared my desk (put away in advance any items the exam rules do not allow)
- [ ] I confirmed that my internet connection is stable
- [ ] If on a laptop, I plugged in the power
- [ ] Before starting, I completed the identity verification and environment check procedures per the instructions

> ⚠️ **Pitfall**: Opening new material in the hour or two right before the exam is mostly counterproductive. When a service name you've never seen comes up, the thought "I'm taking the exam and I don't even know this" chips away at your confidence, and that anxiety shakes your pace early in the exam. **Right before the exam, you should only check what you already know.** The loss from anxiety is greater than the expected gain from new knowledge.

### What to Do in the First 30 Seconds After the Exam Starts

- First find **where the remaining time is displayed** on the screen.
- Check **the question-flagging (marking) feature and how to jump through the question list.** You will need them on the second pass.
- Take one deep breath and go to question 1. Even if question 1 is hard, that is a coincidence. Just flag it and move on.

## Mindset

- It is better not to be shaken by one or two questions you don't know. Passing is 700, not a perfect score.
- If you read expressions like "most suitable / most cost-effective / least operational overhead" to the end and catch the key keywords, you will do well.
- The first answer that comes to mind is generally right. It is better not to change an answer without a reason.
- **Even if hard questions come up one after another, that is not a sign of failing.** Of the 65 questions, 15 are unscored evaluation questions, and unusually unfamiliar ones may be mixed in among them.
- The exam is not one that selects "perfect people" but one that **checks "whether you have the fundamentals."** You just answer within the scope you studied over six weeks.
- Nervousness is not something to eliminate but something to handle. If your hands shake, even just reading one line of the passage slowly and silently will settle your breathing.

## One-Sentence Memorization Cards to Pull Out in the Exam Room

- **Elasticity** — the property of automatically growing and shrinking to match demand.
- **High availability** — keeps running even if part of it dies. The answer is multiple AZs.
- **Disaster recovery** — preparation for a failure of an entire geographic area. The answer is multiple Regions.
- **Shared Responsibility Model** — AWS handles the cloud itself, the customer handles what is in the cloud.
- **Always the customer's responsibility** — data and access permissions.
- **IAM role** — lends temporary permissions without credentials.
- **Least privilege** — start narrow and widen when needed.
- **Serverless** — a candidate answer for "least operational overhead" questions.
- **CDN** — caches at the edge to reduce latency.
- **Spot** — use it only for work that can tolerate interruption.
- **Commitment discounts** — advantageous for workloads that run steadily for a long time.
- **Consolidated billing** — combines the bills of multiple accounts into one and aggregates usage.
- **CloudTrail for auditing, Config for configuration, CloudWatch for metrics.**
- **Shield for DDoS, WAF for web attacks.**
- **Blank is zero** — always fill in an answer for every question.

## 📖 Glossary

- **Evaluation questions** : The 15 of the 65 questions that are not scored. You can't tell which they are, so you must solve all of them diligently.
- **Passing line** : 700 on the 100–1,000 scale. There is no reason to aim for a perfect score.
- **Multiple-response question** : A type that requires you to choose two or more correct answers. You must match the number exactly.
- **First pass** : The stage of skimming through all questions quickly once, separating immediate answers from flagged ones.
- **Second pass** : The stage of returning to the flagged questions and judging again.
- **Flagging (marking)** : A feature that lets you check off, on the exam screen, the questions you want to look at again later.
- **Unanswered check** : The procedure of scanning at the end to make sure no question is left blank.
- **Heuristic** : A short rule that is not perfect but helps you decide quickly.
- **Online proctoring (proctored exam)** : A delivery method where you take the exam without going to a test center, supervised by camera.
- **Domain weight** : The proportion of questions per domain. Domain 3 is the largest at 34%.
- **Retrieval practice** : A study method of first recalling with the book closed, then checking. It is the most efficient right before the exam.
- **Condition management** : Preparation that includes sleep, meals, and travel planning. It affects your score with the same weight as your ability.

## 📝 Practice Questions

**Question 1.** Which of the following is correct for the passing score and score range of the CLF-C02 exam?

A) Range 0–100, pass 60  
B) Range 100–1,000, pass 700  
C) Range 0–500, pass 350  
D) Range 100–900, pass 750  

**Answer: B**  
Explanation: CLF-C02 is scored on a range of 100 to 1,000, with a passing line of 700. The score ranges and passing lines in the other options do not match the actual exam.

---

**Question 2.** The exam consists of 65 questions; how many of them are unscored evaluation questions?

A) 5 questions  
B) 10 questions  
C) 15 questions  
D) 25 questions  

**Answer: C**  
Explanation: Of the 65 questions, 15 are unscored evaluation questions and 50 count toward your actual score. Since you can't tell which are evaluation questions, you must answer every question diligently.

---

**Question 3.** In managing exam time, what is the most correct strategy regarding a question left blank?

A) If unsure, leave it blank to avoid a penalty  
B) Eliminate clearly wrong options and always fill in an answer, even a guess  
C) Skip hard questions from the start and never look at them again  
D) Fill in C for every question uniformly  

**Answer: B**  
Explanation: A blank always scores 0, but a guessed answer has a chance of being right, so after eliminating clearly wrong options you must fill in an answer. This exam has no penalty for wrong answers, so leaving a blank is disadvantageous, and permanently giving up on hard questions or blindly filling in one letter is not a good strategy either.

---

**Question 4.** When solving 65 questions in 90 minutes, which is the most appropriate recommended pacing strategy?

A) Stay on the first question until it's perfectly solved before moving on  
B) Handle easy questions quickly and flag hard ones to return to later  
C) Solve all questions at once in the final 10 minutes  
D) Solve the questions in random order  

**Answer: B**  
Explanation: Handling easy questions quickly to bank time and flagging hard ones to re-examine on a second pass is how you maximize your score in limited time. Lingering on one question or cramming everything at the end leads to running out of time.

---

**Question 5.** Which AWS Support plan is the first to offer 24/7 (around-the-clock) technical support?

A) Basic  
B) Developer  
C) Business  
D) Offered in all plans  

**Answer: C**  
Explanation: 24/7 phone·chat technical support is offered starting with the Business plan. Basic is free basic support, Developer is limited to email during business hours, and not all plans provide 24/7 support.

---
