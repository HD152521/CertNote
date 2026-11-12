# Day 3 - Full Mock Exam Pace: All Four Domains Combined

Today we solve problems the way the real exam does, mixing all four domains together. The goal is to build a **sense of pace**: choosing an answer within about a minute per question. Practice the habit of just flagging questions you don't know, moving on, and coming back later. There are eight questions today, more than usual.

## 📌 Key Takeaways

- Today's goal is **not to put in more knowledge but to pull out what you already know, faster**. What separates scores in the exam room is retrieval speed, more than the amount of knowledge.
- 65 questions / 90 minutes means about **1 minute 23 seconds** per question. Finish easy questions in 30 seconds so you have room to spend 2-3 minutes on hard ones.
- Read each question **starting from the last line**. That is where "what you are being asked to choose" lives.
- **Crossing out the 2 obviously wrong options first** out of 4 is faster and safer than hunting for the right answer directly.
- **Flag and move on** from questions you don't know. Staying on a single question for more than 3 minutes is the same as throwing away two or three later questions.
- A blank is always 0 points. Always spend the last 5 minutes on **filling in unanswered questions**.

## Mock Exam Solving Strategy

| Situation | Action |
|------|------|
| Answer is immediately obvious | Select it right away and move on |
| Uncertain | Eliminate the two clearly wrong options first |
| No idea at all | Flag it, move on, and return if time remains |
| "Most appropriate / most cost-effective" questions | Narrow it down to a single core keyword |

CLF-C02 requires answering 65 questions in 90 minutes, which is an average of about 1 minute 23 seconds per question. Handling easy questions quickly to bank time for the hard ones is the key to a passing pace.

### 1 Minute 23 Seconds Does Not Mean "1 Minute 23 Seconds on Every Question"

If you misread an average of 1 minute 23 seconds as "I must spend 1 minute 23 seconds on every question", your pace will actually fall apart. A real exam is not evenly difficult.

| Question type | Target time | Explanation |
|-----------|---------------|------|
| Quick-recall (term definitions, service name matching) | 20-40 seconds | Short answers such as "What is a CDN?". This is where you must earn time |
| Standard (short situation + choose a service) | About 1 minute | Most questions belong here |
| Scenario (long passage, several conditions) | 2-3 minutes | The more conditions there are, the more the answer actually narrows down |
| Multiple response (choose 2 or more) | About 2 minutes | You must judge every option as true or false |

The key is **to give the time saved on quick-recall questions to the scenario questions**. If you finish quick-recall questions in 40 seconds, you have about 40 seconds left over per question, and that surplus adds up to rescue a few hard questions.

A marathon runner does not sprint the first kilometer. If you spend all your energy early, you end up walking in the second half. The exam is the same. If you spend 5 minutes on question 1 until you are "perfectly certain", those 5 minutes come straight out of three or four later questions. Think of the early part as a stretch where you **pass through quickly and leave flags**.

### The 4-Step Order for Reading a Question

If you read an exam question from the beginning in order, you get dragged around by the passage. Reading in the following order is much faster.

1. **Read the last line (the question sentence) first.** Pin down "what is being asked" first. "What is the most cost-effective option?", "Whose responsibility is it?", "Which service should be used?"
2. **Mark the qualifiers.** "MOST", "LEAST", "NOT", "Select TWO". Missing even one of these words makes you get a question wrong that you actually know.
3. **Pull out only the signal words from the passage.** There is no need to savor the whole passage. Words like "milliseconds", "long-term retention", "multiple AZs", and "minimal operational overhead" decide the answer.
4. **Scan the options, marking them O / X / triangle.** Don't look for the right answer from the start. Cross out the sure X's first.

```
   [4-step reading]
   Question sentence → Qualifiers → Passage signal words → Eliminate options
      ↑                                                         │
      └────── If the answer doesn't narrow down, go back up ────┘
```

> ⚠️ **Pitfall**: People get questions wrong not because they don't know the material but because they **read the question backwards**. In a negative question such as "Which of the following is NOT AWS's responsibility?", you can read the passage closely, miss the final "NOT", and pick a wrong answer instead of the right one. When you see a negative or superlative word, build the habit of reading it once more aloud in your head.

### The Elimination Method: Narrowing by Crossing Out

CLF-C02 options are usually made up of the following four kinds.

| Option nature | Characteristic | Response |
|-----------|------|------|
| Correct answer | Matches the passage's signal words exactly | Select |
| Tempting wrong answer | Another service in the same category (e.g., Shield in WAF's place) | Recheck the signal words |
| Wrong answer from a different category | The question asks about storage but a DNS service shows up | Eliminate immediately |
| Nonexistent or nonsensical option | Absolute expressions such as "unlimited free" or "never fails" | Eliminate immediately |

In other words, 2 of the 4 can usually be **crossed out as soon as you read them**. Among the remaining 2, you can settle it with a single signal word.

Here are quick rules you can use for elimination.

- **An option that contains an absolute expression is usually wrong.** Examples: "always", "never", "in all cases", "100% guaranteed", "unlimited free".
- **An option from the wrong category needs no second look at the passage.** If the question says "choose a database" and one of the options is a networking service, that one is an X on the spot.
- **In security questions, it is safer to treat "use the root user", "hardcode access keys", and "give everyone administrator permissions" as wrong answers.** These three phrases are practically a marker saying "exclude from the correct answer".
- **In cost questions, options like "buy a bigger instance in advance" are usually wrong.** The cloud's answer is usually on the side of "adjust to match demand".

### Three Habits That Eat Your Time

1. **Double-checking questions you know.** If you spend 30 seconds each re-reading "just in case" even when you are confident, 30 minutes vanish across 65 questions.
2. **Gripping a question you don't know and squeezing your memory.** If it doesn't come to you within 30 seconds, it usually won't come even after 2 more minutes. Flag it and move on.
3. **Changing an answer without grounds.** Change it only when you have found new grounds. "I just feel uneasy" is not grounds.

## One-Line Keyword Review by Domain

- **Domain 1**: Elasticity, economies of scale, high availability via AZs, IaaS/PaaS/SaaS
- **Domain 2**: Shared responsibility, least-privilege IAM, CloudTrail (audit) / Config (configuration)
- **Domain 3**: EC2/Lambda, S3/EBS/EFS, RDS/DynamoDB/Redshift, CloudFront (CDN)
- **Domain 4**: On-Demand/RI/Spot, Budgets/Cost Explorer, Support plans

### Retrieval Check by Domain: Answer First Instead of Reading

The items below are not for "reading and understanding". They are for **answering out loud first and then checking**. If an answer does not come within 3 seconds, that item is what you should review today.

**Domain 1 (Cloud Concepts, 24%)**

- [ ] I can name all 6 benefits of the cloud in any order
- [ ] I can state the difference between scalability and elasticity in one sentence
- [ ] I can tell IaaS / PaaS / SaaS apart, with example services
- [ ] I can choose among public / private / hybrid deployment models by situation
- [ ] I can say what regions / Availability Zones (AZs) / edge locations are each for
- [ ] I can explain the difference between high availability, fault tolerance, and disaster recovery

**Domain 2 (Security and Compliance, 30%)**

- [ ] I can name the two things that are "always the customer's responsibility" in the shared responsibility model (data, access permissions)
- [ ] I can tell the uses of IAM users / groups / roles / policies apart in one line each
- [ ] I can state the three recommendations for the root user
- [ ] I can explain what the principle of least privilege is and why you "start narrow"
- [ ] I can tell what Shield / WAF / GuardDuty each cover
- [ ] I can tell which question each of CloudTrail / Config / CloudWatch answers
- [ ] I can say what Artifact provides

**Domain 3 (Cloud Technology and Services, 34%)**

- [ ] I can order EC2 / Lambda / Elastic Beanstalk / Fargate by "management burden"
- [ ] I can tell S3 / EBS / EFS apart by "who attaches and uses them, and how"
- [ ] I can state the use of RDS / DynamoDB / Redshift / Aurora in one line each
- [ ] I can say what VPC / Route 53 / CloudFront / Direct Connect each do
- [ ] I can explain how the jobs of ELB and Auto Scaling differ
- [ ] I can recall several items that count as "global services" (IAM, Route 53, CloudFront, etc.)

**Domain 4 (Billing, Pricing, and Support, 12%)**

- [ ] I can choose among On-Demand / Reserved Instances / Savings Plans / Spot by situation
- [ ] I can tell Pricing Calculator and Cost Explorer apart as "before / after"
- [ ] I can say when Budgets is used
- [ ] I can state the benefit of consolidated billing in Organizations
- [ ] I can list the main Support plan tiers (Basic / Developer / Business / Enterprise) in order

**Retrieval practice** holds memory far longer than "rereading". Reading the textbook one more time strengthens the feeling that you know it, but it adds little to your ability to pull the answer out in the real exam room. Conversely, if you close the book, **recall first, and then check**, that item sticks much better. In the last few days before the exam, spend your time on "closing and recalling" rather than reading.

## Translating Scenario Descriptions into an Answer Direction

In CLF-C02 scenario questions, in the end **one or two words in the sentence decide the answer direction**. Below are typical scenario phrases and the direction that should light up in your head at that moment.

| If the passage contains this expression | Think in this direction |
|---------------------------|----------------------|
| "I don't want to manage servers", "minimal operational overhead" | Serverless / managed services |
| "most cost-effectively" | Commitment discounts / cheaper storage tiers / interruptible workloads |
| "the service must keep running even if one machine dies" | Spread across multiple Availability Zones (AZs) |
| "must recover even if an entire region goes down" | Multiple Regions |
| "fast for users around the world" | Edge locations / CDN |
| "need to check later who did what" | Audit logs |
| "keep checking that configuration follows the rules" | Configuration tracking |
| "alert when a threshold is exceeded" | Metric monitoring + alarms |
| "without putting credentials in code" | IAM roles |
| "certification reports to submit to auditors" | Compliance report portal |
| "millisecond responses", "key-value" | NoSQL |
| "collect years of data for complex analysis" | Data warehouse |
| "rarely retrieved but cannot be discarded" | Archive storage tier |
| "a stable dedicated connection to on-premises" | Dedicated line |

Here is a situation: "To prepare for an accounting audit, the company must check which employees changed which resources over the past year." The words that should light up here are **"who"** and **"check"**. It is not a performance metric and not compliance with configuration rules. It asks for "the actor and the time", so it points to audit logs. Conversely, if the same sentence changes to "The company must continuously verify that every S3 bucket maintains its encryption setting", this time it is not "who" but **"does the state follow the rules"**, so the answer moves to configuration tracking. The key point is that **the one changed word**, not the whole sentence, changes the answer.

## How to Handle Multiple Response Questions

CLF-C02 mixes in multiple response questions of the form "Select TWO". This type is easy to slip on.

- **Check first how many you are told to choose.** If it asks for two and you choose only one, that question earns no points.
- **Don't try to find two correct answers; judge each option as true or false.** It is faster to test the five options one by one with "is this a true statement?".
- **Don't expect partial credit.** You must match the required number exactly.
- **If you are not sure of either, lock in the one you are sure of and compare only the other.**

> ⚠️ **Pitfall**: Choosing "the two most plausible" in a multiple response question is likely to go wrong. Question writers usually place **two or three plausible wrong answers from the same category** together. For example, a question asking you to choose two security services will show four security services. In that case, you must fit each option one by one to **the conditions the passage explicitly requires**, not to "plausibility".

## Wrong-Answer Pitfalls and Why They Happen

Mistakes follow patterns. You need to look at "why you get it wrong" as well in the list below to avoid getting it wrong next time.

| Pitfall | Why you get it wrong | Correction |
|------|------|------|
| Choosing "multiple Regions" for a high availability question | Regions look more powerful | If the problem is surviving a failure within one Region, multiple **AZs** is the answer |
| Choosing "multiple AZs" for a disaster recovery question | The AZ answer feels familiar | For protection against a failure of an entire area, it is multiple **Regions** |
| Choosing monitoring when audit logs were asked | Both look like "records" | "Who did what" is audit; "how much is being used" is monitoring |
| Swapping the pre-estimate tool and the post-analysis tool | Both names relate to cost | Calculating what you haven't used yet is estimation; looking at what you already used is analysis |
| Choosing Spot as "always the cheapest, so correct" | Looking only at the cost keyword | Spot suits only workloads that **can be interrupted** |
| Choosing EC2 Auto Scaling for a serverless question | Because of the word "automatic" | Auto Scaling still runs servers (EC2) in the end |
| Choosing OS patching as the customer's responsibility for a managed service | Memorized only "OS patching = customer" | In cases such as managed databases, AWS handles the underlying OS |
| Choosing "unlimited" or "always free" options | They sound attractive | Absolute expressions are a wrong-answer signal |
| Knowing the service name but confusing its category | Memorized only the name | Always memorize **"what it is for"** next to the name |

## One-Sentence Memory Cards

These are arranged one sentence at a time so you can skim them right before the exam. Look at the front of the card (left) and check whether the back (right) comes to mind.

- **Elasticity**: The property of automatically growing and shrinking to match demand.
- **Scalability**: The ability to grow itself, which does not need to be automatic.
- **High availability**: The service keeps going even if part of it fails. The answer is usually multiple AZs.
- **Fault tolerance**: Keeps operating as is, without performance degradation, even when a failure occurs.
- **Disaster recovery**: A plan for recovering after a major incident; the answer is usually multiple Regions.
- **Shared responsibility model**: AWS is responsible for the cloud itself; the customer is responsible for what is in the cloud.
- **Always the customer's responsibility**: Data and access permissions.
- **IAM role**: A way to lend temporary permissions without credentials.
- **Least privilege**: Start narrow and widen when needed.
- **CDN**: Caches near users to reduce latency.
- **Serverless**: You do not manage servers. It becomes an answer candidate in "minimal operational overhead" questions.
- **On-Demand**: Pay for what you use with no commitment. For unpredictable workloads.
- **Commitment discounts**: Advantageous for workloads that run steadily for a long time.
- **Spot**: Use only for jobs that can withstand interruption.
- **Consolidated billing**: Bundles several accounts into one invoice and combines their usage.

## What Matters More Is After You Solve the Mock Exam

Sorting out **why you got questions wrong** raises your score more than solving questions does. After scoring, divide the missed questions into the following four categories.

| Category | Symptom | Prescription |
|------|------|------|
| 1. Didn't know | You are seeing the service itself for the first time | Memorize only a one-line summary of that concept |
| 2. Confused | You picked wrong between two services | Build a comparison table and separate the signal words |
| 3. Misread | You missed a negation or qualifier | A reading-habit problem, so apply the 4-step reading |
| 4. Ran out of time | You guessed in a rush at the end | A pace problem, so raise your speed in the early part |

Categories 3 and 4 are **habit problems, not knowledge problems**. If the exam is only a few days away, fixing these two gives a bigger score gain than memorizing new concepts.

A wrong-answer notebook is not "rewriting the missed question" but **writing down why you missed it**. Don't spend time copying the question; just leave one line such as "missed the negation" or "confused AZ and Region". A few days later, when you look at that list, you will see your pattern of mistakes narrow to two or three.

## Today's Self-Check Checklist

- [ ] I actually applied the habit of reading the question's final question sentence first
- [ ] I checked qualifiers such as "MOST / LEAST / NOT" on every question
- [ ] I flagged and moved on from uncertain questions instead of holding onto them
- [ ] I crossed out at least 2 of the 4 options with a reason
- [ ] I filled in an answer for every question with no blanks
- [ ] I sorted the missed questions into the four categories above (didn't know / confused / misread / time)
- [ ] I wrote down separately the items in the four-domain retrieval check that I could not answer within 3 seconds

## 📖 Glossary

- **Retrieval practice**: A study method where you close the book, recall first, and then check. Memory lasts longer than with rereading.
- **Pace**: The rhythm of time spent per question. With 65 questions in 90 minutes, it averages about 1 minute 23 seconds.
- **Qualifier**: A word that decides the answer, such as "MOST", "LEAST", "NOT", or "two".
- **Signal word**: A word in the passage that points to the correct service, such as "milliseconds", "long-term retention", or "minimal operational overhead".
- **Elimination**: A method of narrowing the choices by crossing out the obviously wrong answers before looking for the right one.
- **Multiple response question**: A type that asks you to choose two or more correct answers. You must match the number exactly.
- **Unscored question**: The 15 of the 65 questions that are not graded. You cannot tell which they are, so you must solve them all earnestly.
- **Wrong-answer notebook**: A record that collects **why you missed** questions, not the missed questions themselves.
- **Quick-recall question**: A short question that directly asks for a term definition or a service name. It is the stretch where you earn time.
- **Scenario question**: A question that describes a situation at length and asks for the best choice. The more conditions there are, the more the answer narrows.
- **Absolute expression**: Words such as "always", "unlimited", and "100% guaranteed". If they are in an option, it is likely wrong.
- **Flagging (marking)**: The feature on the exam screen for checking off a question to revisit later.

## 📝 Practice Questions

**Question 1.** What is the cloud characteristic called that automatically adds EC2 instances when traffic spikes and removes them when it drops?

A) Durability  
B) Elasticity  
C) Failover  
D) Multi-tenancy  

**Answer: B**  
Explanation: Elasticity is the ability to automatically scale resources up and down in response to changing demand, with Auto Scaling as the prime example. Durability is the degree of protection against data loss, failover is switching to a standby during a failure, and multi-tenancy is the concept of multiple customers sharing infrastructure.

---

**Question 2.** Which service should you use to protect a web application from SQL injection and cross-site scripting (XSS) attacks?

A) AWS Shield  
B) Amazon GuardDuty  
C) AWS WAF  
D) AWS KMS  

**Answer: C**  
Explanation: AWS WAF is a web application firewall that filters Layer 7 attacks such as SQL injection and XSS. Shield is for DDoS protection, GuardDuty is for threat detection, and KMS is an encryption key management service.

---

**Question 3.** Which is most appropriate as a serverless NoSQL database that needs fast, single-digit-millisecond responses?

A) Amazon RDS  
B) Amazon DynamoDB  
C) Amazon Redshift  
D) Amazon Aurora  

**Answer: B**  
Explanation: DynamoDB is a fully managed serverless NoSQL database that delivers consistent single-digit-millisecond performance. RDS and Aurora are relational databases, and Redshift is an analytics data warehouse — all serving different purposes.

---

**Question 4.** Which service should you use to cache content at edge locations to deliver videos and images to users worldwide with low latency?

A) Amazon Route 53  
B) AWS Direct Connect  
C) Amazon CloudFront  
D) Amazon VPC  

**Answer: C**  
Explanation: CloudFront is a content delivery network (CDN) that caches content at edge locations to reduce latency. Route 53 is DNS, Direct Connect is a dedicated line, and VPC is an isolated virtual network.

---

**Question 5.** What should you use to combine the billing of multiple AWS accounts into one and share volume discount benefits?

A) Consolidated Billing in AWS Organizations  
B) AWS Budgets  
C) Savings Plans  
D) AWS Cost Explorer  

**Answer: A**  
Explanation: Consolidated Billing in AWS Organizations aggregates usage across multiple accounts into a single bill and shares volume-based discounts. Budgets is for budget alerts, Savings Plans is a usage-commitment discount, and Cost Explorer is a cost analysis tool.

---

**Question 6.** Which PaaS-style service automatically handles capacity provisioning, load balancing, and scaling when you upload your code?

A) Amazon EC2  
B) AWS Lambda  
C) AWS Elastic Beanstalk  
D) Amazon ECS  

**Answer: C**  
Explanation: Elastic Beanstalk is a PaaS service that automatically handles infrastructure configuration and scaling when you upload your code. EC2 is IaaS that you manage yourself, Lambda is function-level serverless, and ECS is container orchestration.

---

**Question 7.** Which service do you use to directly download the compliance reports (SOC, PCI DSS, etc.) that AWS provides?

A) AWS Config  
B) AWS Artifact  
C) AWS Trusted Advisor  
D) AWS CloudTrail  

**Answer: B**  
Explanation: AWS Artifact is a portal that provides AWS compliance reports such as SOC and PCI DSS on demand. Config tracks resource configuration, Trusted Advisor checks best practices, and CloudTrail is an API audit log service.

---

**Question 8.** For a stable, continuously running workload, which EC2 pricing model is most appropriate if you want the maximum discount in exchange for a 1–3 year commitment?

A) On-Demand Instances  
B) Spot Instances  
C) Reserved Instances  
D) Dedicated Instances  

**Answer: C**  
Explanation: Reserved Instances (or Savings Plans) provide a large discount in exchange for committing to 1–3 years of usage, making them suitable for continuous, predictable workloads. On-Demand has no commitment or discount, Spot is for interruptible work, and Dedicated Instances are for isolation requirements.

---
