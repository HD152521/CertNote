# Day 3 - Full-Length Practice Exam Pace: 65 Questions in 130 Minutes, Time Allocation and Scenario Strategy

## 📌 Key Takeaways

- The real exam is 65 questions in 130 minutes, an average of 2 minutes per question. Today's goal is to solve 8 integrated scenario questions within 16 minutes.
- Read the question (the last sentence) first, extract the constraint keywords, cross out the 2 options whose purpose does not fit, and then choose whichever of the remaining two satisfies the constraints better.
- Choose the "most suitable answer", not a "possible answer". What separates the correct answer is usually a single qualifier such as minimal operations, lowest cost, or real-time.
- Even when domains are mixed, each sentence asks about exactly one slot (ingestion, storage, operations, security). Assign each sentence to a slot and you are back to keyword → service mapping.
- After scoring, classify why you missed questions. The prescription differs depending on whether it was a knowledge gap, a missed qualifier, or confusing look-alike services.

## Breaking 65 Questions in 130 Minutes into Numbers

Today is real-exam mode. You solve integrated scenarios that mix the 4 domains and get a feel for the **exam pace**. The point is less to get the answers right than to sharpen the "requirement keyword → service mapping" reflex. First, turn the time into numbers.

| Pass | Allocated time | Per question | Checkpoint |
|------|------|------|------|
| First pass (all 65 questions once each) | About 90 minutes | About 83 seconds | Around question 22 at 30 minutes, around question 43 at 60 minutes |
| Second review (flagged questions) | About 30 minutes | Depends on the number of flagged questions | If you flagged 15 questions, 2 minutes each |
| Third check | About 10 minutes | n/a | Number of selections in multiple response, blank answers |

- An average of 2 minutes does not mean "2 minutes on every question". You have to finish one-line mapping questions in 30-60 seconds to be able to spend 3 minutes on a long scenario.
- If at a checkpoint time you are 5 or more questions behind, then in the next stretch, pick a tentative answer for any question you get stuck on, flag it, and move on immediately.
- Of the 65 questions, 50 are scored and 15 are unscored. Since it is not shown which are unscored, solve every question with equal weight.

Multiplying the domain weights by the 50 scored questions gives a rough question count. Since the weights are "the ratio among scored questions", treat them only as approximations.

| Domain | Weight | Approximate share of the 50 scored questions |
|------|------|------|
| 1. Ingestion and Transformation | 34% | 17 questions |
| 2. Data Store Management | 26% | 13 questions |
| 3. Operations and Support | 22% | 11 questions |
| 4. Security and Governance | 18% | 9 questions |

- The passing score of 720 applies only to the overall score. There is no per-domain passing line (compensatory scoring), so a strong domain can make up for a weak one. Still, it is hard to pass while neglecting Domains 1 and 2, which account for 30 questions.

## Scenario Solving Strategy

Break a long question down in the following order.

1. Read the **last sentence (the question)** first to grasp "what is being asked."
2. Extract **constraint keywords** from the body: serverless/minimal operations, real-time/batch, minimal cost, minimal code, security/encryption.
3. **Cross out 2 obviously wrong options** from the choices first (service purpose mismatch).
4. Of the remaining 2, choose the one that **best satisfies the constraints**.

> 💡 **Related theory**: Most wrong answers are "technically possible but violate the requirements in operational burden, cost, or real-time capability." The heart of the Associate exam is choosing "most suitable", not "can do".

## Options That Qualifiers Cross Out

Before a qualifier in the question sentence is a criterion for choosing the answer, it is a **tool for crossing out options**. For each qualifier, the shape of the option that drops out first is predictable.

| Qualifier | Options to cross out first | Side that survives |
|------|------|------|
| Minimal operational overhead | Installing directly on EC2, always-on clusters, hand-written consumers and schedulers | Firehose, Glue, Athena, Lambda, Step Functions |
| Minimal cost (intermittent use) | Provisioned resources running all day | Pay-per-use serverless, S3 tiering |
| Minimal cost (constant, heavy use) | Configurations where scanned-data or request-count charges grow without bound | Provisioned capacity, format and partition optimization |
| Real-time (within seconds) | Batch schedules, load paths with large buffers | Stream + Flink/Lambda |
| Near-real-time (minutes allowed) | Hand-built stream processing | Firehose, micro-batching |
| Minimal code changes | Rewriting for a different engine | Compatible services (MSK, EMR, MWAA) |
| Keep existing data / no downtime | Dump and restore, one-time copy | DMS full load + CDC |
| Least privilege | Wildcard policies, long-term access keys | Roles, narrowly scoped policies, Lake Formation |

- "Minimal cost" has two directions. For occasional use serverless is cheaper, and for all-day use provisioned is cheaper. You must also read the usage-frequency clues in the passage (occasionally, temporary, all day, hundreds of people).

## Integrated Patterns

| Scenario signal | Typical answer combination |
|--------------|-----------------|
| Real-time clickstream → zero-management loading → SQL analysis | Kinesis Firehose → S3 → Athena |
| Hourly incremental ETL → load into DW | Glue (bookmarks) → Redshift |
| Real-time replication of DB changes | DMS (CDC) → S3/Redshift |
| Coordinating heterogeneous stages + retries | Step Functions |
| Sensitive data discovery + column access control | Macie + Lake Formation |

Even the same pattern changes its combination when one more condition is attached. Integrated questions ask about this "swap of one slot".

| Base combination | Added condition | Slot that changes |
|------|------|------|
| Firehose → S3 → Athena | Other apps also read the same events in real time | Put Kinesis Data Streams in front, and Firehose becomes one of its consumers |
| Firehose → S3 → Athena | Keyword search and second-level dashboards are needed | Make the destination OpenSearch Service |
| Glue (bookmarks) → Redshift | Source rows are updated and deleted | DMS CDC instead of bookmarks |
| Glue (bookmarks) → Redshift | Processing tens of TB with existing Hive scripts | EMR instead of Glue |
| DMS (CDC) → S3 | Also doing real-time aggregation in 5-minute windows | DMS → Kinesis Data Streams → Managed Service for Apache Flink |
| Chaining Glue jobs with Step Functions | Hundreds of Airflow DAGs already exist | MWAA |
| Querying S3 with Athena | Hundreds of people view the same dashboard all day | Redshift (Spectrum for cold data) |
| Lake Formation column permissions | You don't even know where the PII is | Put Macie in front |
| SSE-S3 | Audit key usage and block decryption per role | SSE-KMS customer managed key |

## Worked Demonstration: Actually Walking Through the Four Steps

Below are three passages that do not overlap with the practice questions, broken down in four steps. Don't just read them; cover each step and answer it yourself first.

```text
Passage A) A retailer collects sales events generated at store POS terminals. An
           inventory alert app and a pricing analytics app must each read the events
           independently, and if there is a bug in the processing logic, the past
           3 days must be reprocessed. What is the most suitable ingestion service?

  1) Question  -> one ingestion service
  2) Keywords  -> two consumers reading independently / reprocess 3 days
  3) Eliminate -> SQS (one message goes to one consumer, no replay), Firehose (no reprocessing)
  4) Choose    -> Kinesis Data Streams + extend retention to 3 days or more
                  (the default 24 hours does not satisfy "3 days")
```

```text
Passage B) An analytics team converts the previous day's orders (CSV) in S3 to Parquet
           every morning and loads them into Redshift. If the conversion fails, the
           load must be skipped and the owner notified. They don't want to operate
           servers. What is the configuration with the least operational overhead?

  1) Question  -> the configuration with the least operational overhead
  2) Keywords  -> daily batch / order (convert -> load) / notify on failure / no servers
  3) Eliminate -> EC2 cron (server operations, doesn't know whether the earlier step succeeded),
                  MWAA (cost of an always-on environment, no mention of existing Airflow assets)
  4) Choose    -> EventBridge schedule -> Step Functions runs the Glue job -> COPY in order,
                  SNS notification in Catch
```

```text
Passage C) Several research teams query a medical data lake with Athena. Patient
           identifier columns must be visible only to approved teams, and it must be
           possible to audit who decrypted data with which key. Which combination
           meets the requirements? (Choose two)

  1) Question  -> a combination, two items
  2) Keywords  -> column-level access control / decryption auditing
  3) Eliminate -> S3 bucket policy (cannot hide columns), SSE-S3 (key usage cannot be audited),
                  GuardDuty (threat detection)
  4) Choose    -> Lake Formation column permissions + SSE-KMS customer managed key
                  (key usage recorded by CloudTrail)
```

- Lesson from Passage A: Even if you identify the correct service, when **the default does not meet the requirement**, the option comes with a setting attached. Choose the option that includes the setting, such as "extend the retention period".
- Lesson from Passage C: In multiple response questions, the two requirements often map one-to-one to the two correct answers. Count the requirements first and assign them to the options.

## How to Read Questions That Mix Domains

An integrated scenario looks long, but each sentence asks about only one slot. Write the slot beside each sentence and it turns into four short problems.

| Sentence in the passage | Slot | Candidates it narrows to |
|------|------|------|
| "Thousands of sensor events arrive per second" | Ingestion (Domain 1) | Kinesis Data Streams, Firehose, MSK |
| "Store it in S3 as Parquet and query it by date" | Storage (Domain 2) | Date partitions, Glue Data Catalog, Athena |
| "An alert is needed if loading stops for more than an hour" | Operations (Domain 3) | CloudWatch alarm, SNS |
| "The equipment location column must be visible only to the operations team" | Security (Domain 4) | Lake Formation column permissions |

- Check **which of the four slots** the question sentence asks about. The other three slots are just background for crossing out options. The most common mistake is choosing an option that is a plausible ingestion service when the question is asking about "alerting".
- If every option is a combination of several services, compare only **the slots that differ** among the combinations. If all four options use S3, S3 is not material for the decision.

## Target Time by Question Type

| Type | What it looks like | Target time | How to solve |
|------|------|------|------|
| Simple mapping | One or two sentences, "Which service is most suitable?" | 30-60 seconds | Decide by a single keyword |
| Look-alike service comparison | Two or more services of the same category among the options | 1-2 minutes | Separate them with a single distinguishing axis (reprocessing or not, who operates it, etc.) |
| Failure diagnosis | "These symptoms appear. What is the cause/action?" | 2 minutes | Trace backward in the order symptom → cause → action. Cross out first the options that cite a control the service doesn't have |
| Design combination | Long passage, options that are combinations of several services | 2-3 minutes | Assign sentences to slots and compare only the other slots |
| Multiple response | "Choose two/three" | 2-3 minutes | Count the required number and judge each option true or false one by one |

## Post-Scoring Review: Sorting Misses into Five Reasons

If you score today's 8 questions and end with "I'll read the missed ones again", the same mistake will repeat in the exam room. You have to classify the reasons to get a prescription.

| Reason for the miss | Diagnostic question | Prescription |
|------|------|------|
| Knowledge gap | Even after the explanation, is it the first time you've heard of that feature? | Go back to that week's main note |
| Missed qualifier | Was the answer you chose functionally possible? | Keep to the order of reading the question sentence first |
| Confused look-alike services | Were the correct answer and your answer a pair in the same category? | Say the distinguishing axis in one word from Day 4's service pair tables |
| Chose an over-engineered design | Did you choose the more powerful service? | Be suspicious of "Flink for simple loading" and "Redshift for occasional queries" |
| Time pressure | Would you have gotten it right if time had remained? | Set checkpoint times and practice flagging and moving on |

- Even for questions you got right, say in one line each "why the other three options are wrong". A correct answer for which you cannot give the elimination grounds will be missed next time.
- If you went over 16 minutes, compare the types where you spent time against the target times in the table. Usually the cause is not saving time on simple mapping questions.

Tomorrow we put together the "requirement → service" translation table and the commonly missed pitfalls to look at right before the exam.

## 📖 Glossary

- **Qualifier**: A condition in the question sentence such as "minimal operational overhead" or "most cost-effective". It separates one among the surviving options.
- **Elimination**: A solving method that crosses out options whose purpose does not fit or that violate the conditions first, leaving the correct answer.
- **Flag**: A mark attached to a question so you can look at it again later. Add it after you have chosen a tentative answer.
- **Unscored question**: A question that is not reflected in the score and only collects statistics for future exams. You cannot tell which question it is.
- **Compensatory scoring**: A method where passing is decided only by the overall score, with no per-domain passing line. A strong area can make up for a weak one.
- **Over-engineering**: Choosing a service more powerful and complex than the requirement. It works functionally but violates the operational burden or cost conditions.
- **Integrated pattern**: A typical service combination that fills the ingestion, storage, operations, and security slots. When one condition changes, one slot is swapped.

## 📝 Practice Questions

**Question 1.** You must receive a mobile app's clickstream in real time, load it into S3 as Parquet without managing additional servers, and let analysts query it with ad hoc SQL. Which combination is the most suitable?

A) Kinesis Data Firehose → S3(Parquet) → Athena  
B) RDS → EC2 cron → manual CSV download  
C) DynamoDB → DAX → QuickSight direct  
D) Always-on EMR cluster → HDFS → local Presto  

**Answer: A**  
Explanation: Firehose is fully managed; it buffers the stream, converts it to Parquet, and loads it into S3, and Athena provides ad hoc querying with serverless SQL. RDS, EC2, and an always-on EMR cluster have a heavy operational burden and are unsuitable for real-time ingestion, and DynamoDB is not intended for analytical SQL.

---

**Question 2.** You must continuously replicate changes from an on-premises PostgreSQL database to an AWS analytics environment in near real time. After the initial full load, ongoing CDC is required. Which service is the most suitable?

A) AWS Glue crawler  
B) AWS DMS (full load + CDC)  
C) S3 batch upload script  
D) Amazon Athena federated queries only  

**Answer: B**  
Explanation: AWS DMS can continuously replicate changes from the source database using change data capture (CDC) after the initial full load. A Glue crawler infers schemas, S3 batch uploads are not real-time CDC, and federated queries perform ad hoc querying rather than replication.

---

**Question 3.** You need to run multiple Lambda functions and Glue jobs in sequence, with per-step branching, automatic retries, and visual execution tracking. You want to minimize operational overhead by running serverless. Which service is the most suitable?

A) AWS Step Functions  
B) A single EC2 instance with cron configured  
C) S3 event notifications only  
D) A single DynamoDB Streams trigger  

**Answer: A**  
Explanation: Step Functions is a serverless state machine that provides step coordination, branching, automatic retries, and visual execution tracking. EC2 cron has a heavy operational burden, and S3 events or DynamoDB Streams alone make it difficult to build multi-step branching and retry orchestration.

---

**Question 4.** Several departments in a data lake use the same table, but only the HR team may view the salary column and it must be masked for other teams. You want to control permissions centrally at the column level. Which service is the most suitable?

A) S3 bucket ACL  
B) AWS Lake Formation column-level permissions  
C) Security Group rules  
D) CloudFront geo restriction  

**Answer: B**  
Explanation: Lake Formation centrally manages permissions at the table, column, row, and cell level, making it suitable for column-level access control. S3 ACLs apply only down to the object level, Security Groups are for networking, and CloudFront geo restriction is for content distribution, so none of them relate to controlling data columns.

---

**Question 5.** Redshift dashboard queries frequently access only the last 30 days of data, while cold data older than one year is queried only occasionally. You want to reduce cost while still being able to query the cold data with SQL when needed. Which approach is the most suitable?

A) Keep all data permanently on Redshift nodes  
B) Delete the cold data  
C) Keep the cold data in S3 and query it with Redshift Spectrum  
D) Move the cold data to DynamoDB  

**Answer: C**  
Explanation: Keeping hot data in the Redshift cluster and cold data in inexpensive S3, and querying it with SQL through Redshift Spectrum without loading it, reduces storage cost while preserving accessibility. Keeping everything increases cost, deleting makes the data unqueryable, and DynamoDB is unsuitable for analytical SQL.

---

**Question 6.** A Glue ETL job occasionally fails and is rerun, but the same data ends up loaded into the target more than once. Which design principle should be prioritized to make retries safe?

A) Disable job retries entirely  
B) Lower the log level  
C) Design the job to be idempotent so that rerunning it does not create duplicates  
D) Manually empty the target table every time  

**Answer: C**  
Explanation: In distributed, retry-prone environments, jobs should be designed to be idempotent (for example, upsert/MERGE, or overwrite based on a deterministic key) so that rerunning them produces the same result. Disabling retries undermines resilience, and manual cleanup or log adjustments are not a root-cause fix.

---

**Question 7.** You are building a serverless ETL that processes only the new logs arriving hourly in the S3 raw zone and converts them into the curated zone (Parquet). Files that have already been processed must not be read again. Which combination is the most suitable?

A) Glue job + job bookmarks  
B) Always-on EMR cluster + full reprocessing  
C) Regenerate everything every time with Athena CTAS  
D) Scan the entire bucket every time with Lambda  

**Answer: A**  
Explanation: Glue is the default for serverless ETL, and job bookmarks track data that has already been processed so that only new data is processed incrementally. An always-on EMR cluster, full reprocessing, and full scans violate the incremental requirement and cost and operational efficiency.

---

**Question 8.** You must aggregate sales totals per store in real time over 5-minute windows from a stream of order events. You want to handle the window aggregation using SQL. Which service is the most suitable?

A) A one-off Amazon Athena query  
B) AWS Glue batch job  
C) Amazon QuickSight  
D) Amazon Managed Service for Apache Flink(Kinesis Data Analytics)  

**Answer: D**  
Explanation: Managed Service for Apache Flink processes tumbling/sliding window aggregations on streaming data in real time using SQL/Flink. Athena and Glue are batch-oriented and unsuitable for real-time 5-minute window aggregation, and QuickSight is a visualization tool.

---
