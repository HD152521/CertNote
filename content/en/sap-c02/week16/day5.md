# Day 5 - Final Wrap-Up: Exam Scoring Mechanics, Item-Writer Psychology, Keyword Decoding, a 12-Question Scenario Mock Exam + D-Day Strategy

It's the last day of the 80 days. Today we don't learn new concepts. Instead, we break down **how the exam is scored and the psychology with which question writers lay out wrong answers (distractors)**, compress the knowledge of the four domains you've built up into "keyword → direct answer" reflexes, and finish with a 12-question scenario mock exam of real-exam length. SAP-C02 is not a knowledge exam but a **judgment exam** — it measures your ability to pick, from among answer choices that all look correct, "the single one that meets the requirements most precisely with the lowest operational overhead."

## Internal Mechanics of Exam Scoring and Structure

> 🔍 **Going deeper**: SAP-C02 is **75 questions / 180 minutes**, and the passing mark is **750 out of 1000** (about 75%). The key point is that it is a **scaled score** — not a simple percentage of correct answers but a score adjusted for question difficulty (based on IRT, Item Response Theory). Also, 10 of the 75 questions are **unscored questions** used to gather statistics on new items. You can't tell which ones are unscored, so you must treat every question the same. There is no partial credit, and there is no penalty for wrong answers (blank < guess). So **always guess on questions you don't know** — a 4-choice question has an expected value of 25%, and if you eliminate 2, it's 50%.

There are patterns in how distractors are designed in a multiple-choice exam. Typical ones are **"plausible but missing one condition,"** **"correct but excessive (over-engineering),"** and **"correct but with high operational overhead."** Most of SAP-C02's traps are one of these three — for example, the correct answer is a managed service but they lay out "build it yourself on EC2" (excessive operational overhead), or the correct answer is an SCP but they lay out "IAM Policy" (missing the condition that it can't restrict root). So the scoring strategy is to **eliminate choices not by treating them as answer candidates but by "which condition they violate."**

## Exam-Day Strategy

### The Week Before the Exam

- Quickly run through only the key keywords from each day's "wrap-up/summary" in the 80-day notes
- Pick one weak domain and focus on 30 scenario questions
- Redo the official AWS sample questions + Exam Readiness
- If English is not your native language, apply in advance for the **ESL +30 minutes extension** (at the exam booking stage; you can't apply on the day)

### The Day Before the Exam

- No learning new concepts — review only
- Sleep 6 hours or more (cognitive performance is directly tied to the score)
- Prepare 2 IDs (Pearson VUE: a government-issued photo ID + a secondary ID); for an online exam, complete the environment check beforehand

### The Exam-Day 3-Pass Strategy

1. **First pass**: Answer only those you can answer immediately, and if you hesitate, Mark for Review right away (don't burn time)
2. **Second pass**: Handle the Marked questions calmly — this time narrow down to 2 choices by elimination
3. **Third pass**: Fill in blanks + change answers carefully (your first instinct is statistically right more often — change only when you have clear grounds)
4. **Time allocation**: 75 questions / 180 minutes = an average of **144 seconds per question**. Answer 60% in the first pass and distribute the remaining time to the hard questions

> ⚠️ **Trap**: Pro exam question stems are **long and noisy**. They plant irrelevant information such as "company revenue, number of employees, history of past systems" and then ask about the key constraint. The strategy is to **read the actual question at the end of the stem first → extract the constraint keywords (RTO/RPO, operational overhead, cost, isolation, regulation, downtime) → then scan the stem in reverse**. If you read every sentence in order, you'll exceed 144 seconds.

## Keyword Decoding — Question Language → Answer Signals

The Pro exam doesn't state the answer directly; it signals with **encoded keywords**. The decoding dictionary:

| Question keyword | Answer signal |
|------------|----------|
| "Minimal operational overhead / no management overhead" | Managed/Serverless (Lambda, Fargate, Aurora Serverless) |
| "Most cost-effective" | SP, Spot, Lifecycle, serverless, avoid On-Demand |
| "Isolate failures" | The AZ → Region → Account ladder |
| "Without human intervention / automatic recovery" | EventBridge, SSM Automation, Auto Scaling |
| "Must block even the root user" | SCP (not IAM Policy) |
| "Absolutely no changes / regulation" | Object Lock/Vault Lock **Compliance** (not Governance) |
| "RPO in seconds/minutes, global SQL" | Aurora Global Database |
| "Local writes in each Region, eventual OK" | DynamoDB Global Tables |
| "Minimal downtime, whole OS, one-time" | MGN (DRS if it's ongoing DR) |
| "Heterogeneous DB + schema conversion" | DMS + SCT |
| "Tens to hundreds of TB + slow line" | Snow Family + online delta |
| "SaaS → many customer VPCs, IP conflicts irrelevant" | PrivateLink |
| "DX failure failover within 1 second" | BGP + BFD |
| "Highly reliable failover where a human decides" | Route 53 ARC Routing Control |

> 🎯 **Scenario**: When a stem says "a startup is growing fast, has only 3 engineers, and can't spend time on operations," this is a code not about cost or scale but telling you to pick **"minimal operational overhead → the most managed/serverless choice."** Even for the same architecture, if "there is a dedicated SRE team and fine-grained control is needed," it tilts toward more controllable choices like EC2 and EKS. **Organizational context is the weight on the correct answer.**

## The Four Domains Compressed onto One Page

| Domain | Weight | Key tools | Answer reflex |
|--------|------|----------|----------|
| 1. Organizational complexity | 26% | Org, SCP, Control Tower, TGW, DX, PrivateLink, Outposts | Account = isolation, SCP = ceiling, TGW = O(N), Snow = bandwidth |
| 2. New solutions | 29% | Lambda, Fargate, Aurora, DynamoDB, EventBridge, Kinesis | CAP/PACELC, decoupling, fan-out |
| 3. Migration and modernization | 20% | MGN, DMS+SCT, Snow, App2Container, Strangler Fig | Rehost first, CDC for zero downtime, no big bang |
| 4. Continuous improvement | 25% | CloudWatch, SSM, CodeDeploy, FIS, Compute Optimizer | SRE, automate toil, gradual deployment, FinOps |

## Summary

SAP-C02 is an **"optimal solution" judgment exam**. All the depth of the 80 days converges into one reflex — **read the question at the end of the stem first → extract the constraint keywords → decode the keywords into answer signals → if two look equally correct, pick the one with lower operational overhead**. Scoring is a scaled score (750/1000) and a blank is a loss, so always guess even on what you don't know. Passing is decided not by the amount of knowledge but by **the speed of reading constraints and judging trade-offs**.

Now we solve 12 scenario questions of real-exam length to wrap up the 80 days. Each explanation breaks down even why the other choices are wrong.

---

## 📝 Final Scenario Mock Exam: 12 Questions

**Question 1.** A multinational company operates more than 200 AWS accounts. The security team wants to block use of non-EU Regions in all accounts (including root), have new accounts automatically inherit standard logging and guardrails, and view security findings from all accounts in one place. Which of the following combinations meets all of these requirements?

A) Region restriction with IAM Policy in each account + manual account creation + GuardDuty operated individually per account

B) Control Tower (Account Factory, Guardrails) + SCP DenyRegions + Security Hub delegated administrator

C) SCP DenyRegions + logging deployed with StackSets + viewing findings in each account's console

D) OU separation with Organizations alone + NACL Region blocking + CloudTrail per account

**Answer: B**

Explanation: Mapping the three requirements one by one — (1) "block non-EU Regions, including root": only an SCP DenyRegions (`aws:RequestedRegion`) can block even root; (2) "new accounts automatically get the standard and guardrails": Control Tower's Account Factory + Guardrails; (3) "findings from all accounts in one place": Security Hub delegated administrator + auto-enable. B meets all three. A fails because an IAM Policy can't block root, and manual creation and individual operation provide no automation or consolidation. C has the right SCP but StackSets doesn't provide automatic guardrail inheritance, and checking console by console falls short of the "one place" requirement. D fails because a NACL can't block Region resource creation and per-account CloudTrail isn't consolidated. Trap: for compound requirements, break down each clause and pick the combination that satisfies all of them.

---

**Question 2.** A global SaaS reads and writes users' session data from multiple Regions around the world. Each Region must read and write with local latency (single-digit ms), and it is enough for changes from other Regions to be reflected eventually (strong consistency is not needed). Operational overhead must be minimal. What is the most suitable design?

A) Single-Region Aurora + global Read Replicas

B) DynamoDB Global Tables (On-Demand)

C) Aurora Global Database

D) Per-Region RDS + DMS bidirectional replication

**Answer: B**

Explanation: "Local writes in each Region (active-active) + single-digit ms + eventual consistency acceptable + minimal operational overhead" is the exact domain of DynamoDB Global Tables (serverless NoSQL). In PACELC terms it is PA/EL — under normal operation it relaxes consistency for latency, and each Region writes directly to its local replica (last-writer-wins). A and C (Aurora Global) allow writes in **only one Region**, so they can't meet the "local writes in each Region" requirement (writes must go to the primary, adding latency). D (DMS bidirectional) has heavy conflict resolution and operational overhead and is not recommended. Trap: "local writes in each Region + eventual" is DynamoDB Global Tables, not Aurora Global.

---

**Question 3.** You must migrate 100TB of on-premises Oracle within a 6-month deadline. You want to convert only the core analytics DB to Aurora PostgreSQL to eliminate licensing, and move the rest quickly and then optimize gradually in the cloud. What is the most suitable strategy?

A) Refactor all DBs to Aurora from the start

B) Rehost the rest to RDS Oracle, and Refactor only the core analytics DB with DMS+SCT

C) Ship everything by Snowball and restore manually on EC2

D) Retain everything (defer migration)

**Answer: B**

Explanation: When there's a time constraint, the Pro-exam standard is "**Rehost quickly, then Refactor gradually in the cloud**." Refactoring the entire 100TB to Aurora from the start would take months for schema conversion, application changes, and testing, missing the deadline. So most of it is Rehosted to RDS Oracle to move quickly, and only the high-business-value core analytics DB is Refactored with DMS+SCT. A carries large deadline risk. C is manual restoration, which is high-risk and inefficient. D means not migrating. Trap: "deadline + gradual optimization" is Rehost first, selective Refactor.

---

**Question 4.** An order system triggers 4 microservices for each order: payment, inventory, shipping, and notification. If one service fails, the others must remain healthy, and the failed service must process the backlog of messages without loss after recovery. What is the most suitable pattern?

A) The order service calls all 4 with synchronous HTTP

B) SNS order topic → fan-out to 4 SQS queues (a DLQ on each queue), each service consuming its own queue

C) All 4 services share and consume a single SQS queue

D) An EventBridge rule directly invokes 4 Lambdas

**Answer: B**

Explanation: "One service's failure doesn't affect the others + lossless processing after recovery" is the textbook case for SNS fan-out + a dedicated SQS queue per service. SNS replicates to the 4 queues simultaneously and each queue becomes an independent buffer, so even if one service dies, messages pile up only in that queue and are consumed after recovery. The DLQ isolates repeated failures. A (synchronous calls) is temporal coupling in which one service's failure blocks everything. C (shared single queue) means only one consumer takes each message, so there is no fan-out. D (direct Lambda) has no buffer, so there is a high risk of loss when a downstream fails. Trap: "fan-out + per-service isolation buffer" is SNS → multiple SQS.

---

**Question 5.** A financial regulator requires transaction audit logs to be retained for 7 years so that no one (including administrators and root) can modify or delete them. Logs are generated in all member accounts. What is the most suitable design?

A) S3 Versioning + bucket policy in each account

B) CloudTrail Org Trail → S3 in the Log Archive account + Object Lock **Compliance** for 7 years

C) CloudTrail Org Trail → S3 + Object Lock **Governance** for 7 years

D) CloudTrail in each account → Glacier Deep Archive for 7 years

**Answer: B**

Explanation: Three requirements — (1) "logs from all member accounts" is a CloudTrail **Org Trail**; (2) "operators can't delete" is a separate **Log Archive account** (separation of duties); (3) "not even root can change it" is Object Lock **Compliance** mode (within the retention period, even root can't delete or change, meeting SEC 17a-4 and SOX WORM). C's **Governance** mode can be bypassed by anyone with the `s3:BypassGovernanceRetention` permission, falling short of "no one can" — the distinction between these two is the key trap. A (Versioning) can't prevent deletion itself. D is distributed per account, and Glacier itself doesn't guarantee immutability (Vault Lock is separate). Trap: "regulation, absolutely unchangeable" is Compliance, not Governance.

---

**Question 6.** You have 200 VPCs across 3 Regions connected to 2 on-premises data centers, but direct communication between EU VPCs and US VPCs must be blocked. If a DX circuit fails, traffic must automatically switch to the backup VPN within 1 second. What is the most suitable combination?

A) VPC Peering mesh + a single DX

B) Per-Region TGW + multiple route tables + DX Gateway + 2 DX circuits and VPN + BGP/BFD

C) A single TGW route table + 2 VPNs only

D) PrivateLink mesh + a single DX

**Answer: B**

Explanation: Two requirements — (1) "large-scale VPC connectivity + partial isolation" is per-Region TGW + **multiple route tables** (separating routes per attachment to block EU↔US); (2) "automatic VPN failover within 1 second" is 2 DX circuits + VPN backup + **BGP + BFD (RFC 5880)**. A is impossible because a 200-VPC mesh needs 19,900 connections, and a single DX is a SPOF. C (a single route table) provides no isolation, and VPN alone loses DX's low latency. D (PrivateLink mesh) is unsuitable for unified routing across all VPCs. Trap: compound requirements must satisfy both isolation (multiple route tables) and failover (BGP/BFD).

---

**Question 7.** You must apply security patches monthly to 500 EC2 instances. Security policy prohibits SSH and bastions, patches are applied incrementally by group within set time windows, and all access must leave an audit record. What is the most suitable configuration?

A) Manual patching with Run Command + SSH with EC2 key pairs

B) SSM Patch Manager + Maintenance Window + Session Manager

C) yum-cron on each EC2 + CloudWatch logs

D) Replace instances with patched AMIs using CloudFormation

**Answer: B**

Explanation: Three requirements — (1) "patch automation, incremental by group" is Patch Manager (patch groups and baselines); (2) "time-window control" is Maintenance Window; (3) "SSH prohibited + audit" is Session Manager (access without SSH keys or bastions, with every session recorded to CloudTrail and S3). A violates the SSH prohibition policy. C is weak on central control, time control, and audit. D is excessive instance replacement rather than patching. Trap: "SSH prohibited + patching + time control + audit" is the SSM trio.

---

**Question 8.** A mission-critical SQL workload must recover in another Region with RPO under 1 second and RTO within 1 minute if the primary Region fails. Normally the secondary Region shares the read load. What is the most suitable design?

A) RDS Multi-AZ

B) Aurora Global Database

C) DynamoDB Global Tables

D) Cross-Region Read Replica with manual promotion

**Answer: B**

Explanation: "Global SQL + RPO<1s + RTO in minutes + secondary Region sharing reads" is Aurora Global Database — storage-level asynchronous replication gives an RPO under 1 second, and the secondary Region's read replicas share the load and then promote within minutes during a disaster. A (Multi-AZ) is powerless against a Region failure. C is NoSQL, which doesn't fit "SQL." D (manual promotion) can't meet the RTO because of replication lag and manual promotion. Trap: "global SQL + RPO in seconds + fast promotion" is Aurora Global Database.

---

**Question 9.** You want to verify resilience by injecting deliberate failures every quarter, with the experiment automatically stopping if real user impact exceeds a threshold, and the experiment must run on an automatic schedule. What is the most suitable configuration?

A) AWS Backup recovery testing + manual execution

B) FIS (Fault Injection Service) + Stop Condition + EventBridge Scheduler

C) Resilience Hub static assessment only

D) Trusted Advisor periodic checks

**Answer: B**

Explanation: "Deliberate failure injection + automatic safety stop + automatic scheduled execution" is FIS + Stop Condition + EventBridge Scheduler. FIS injects the chaos experiment (a managed implementation of Netflix's Chaos Monkey), the Stop Condition automatically halts it when a CloudWatch alarm threshold is exceeded, and EventBridge Scheduler triggers the quarterly automatic run. A (Backup) isn't failure injection. C (Resilience Hub) only statically assesses RTO/RPO and doesn't inject failures. D is a best-practice check. Trap: "failure injection + automatic stop + automatic schedule" is FIS + Stop Condition + Scheduler.

---

**Question 10.** A company wants to convert a 20-year-old Java EE monolith (sharing a single Oracle DB) into microservices. Rewriting everything at once carries a large risk of business disruption. What is the safest incremental strategy?

A) Big-bang rewrite of everything in Lambda

B) Strangler Fig pattern + API Gateway routing + microservices starting with new features + gradual DB separation with DMS

C) Put the monolith as is into a single container with App2Container

D) Rehost the monolith on EC2 and stop there

**Answer: B**

Explanation: The safe standard for decomposing a monolith is the Strangler Fig pattern. API Gateway routes requests to the old monolith or the new services, new features are carved off first, and the shared DB is gradually migrated by domain to new DBs with DMS (database-per-service) — each step is reversible, so risk is spread out. A (big bang) is a high-risk wrong-answer signal. C (wrapping the whole thing in a container with A2C) is a simple Replatform and falls short of the "microservices conversion" goal. D (Rehost) is not modernization. Trap: "incremental decomposition + avoid big bang" is Strangler Fig.

---

**Question 11.** A SaaS company wants to build a RAG chatbot that answers based on its own documents while minimizing operational overhead. It doesn't want to run model hosting or vector infrastructure itself. What is the most suitable design?

A) Self-hosting an open-source LLM on SageMaker + its own vector DB

B) Amazon Bedrock + Knowledge Base (managed vector and RAG)

C) Building an LLM + FAISS index directly on EC2

D) Using Amazon Kendra only

**Answer: B**

Explanation: "Minimal operational overhead + RAG + avoiding running model and vector infrastructure yourself" is the textbook case for Amazon Bedrock + Knowledge Base — Bedrock provides foundation models serverlessly, and Knowledge Base handles document embedding, vector storage, and retrieval-augmented generation (RAG) as a managed service. A and C run the model and vector infrastructure themselves, directly violating "minimal overhead." D (Kendra) is enterprise search and not a complete answer for a generative RAG chatbot (it can be combined with Bedrock, but on its own the generation part is missing). Trap: "minimal-overhead RAG chatbot" is Bedrock + Knowledge Base.

---

**Question 12.** In the event of a full Region failure, you want to avoid false positives from automatic health checks and have the operations team assess the situation and shift traffic to another Region reliably. At the same time, cost should be a compromise, but RTO must be in minutes. What is the most suitable combination?

A) Route 53 Health Check automatic failover + Multi-Site Active-Active

B) Route 53 ARC Routing Control + Warm Standby

C) Global Accelerator automatic + Backup & Restore

D) Lambda routing script + Pilot Light

**Answer: B**

Explanation: Two requirements — (1) "human judgment + avoiding false positives + reliable manual switchover" is Route 53 ARC Routing Control (a manual on/off switch with high availability of its own thanks to a distributed data plane); (2) "cost compromise + RTO in minutes" is Warm Standby (a scaled-down version always running, scaled up on failover). A (automatic Health Check) carries false-positive risk, and Active-Active goes against the cost compromise. C (Backup & Restore) has an RTO in hours, so it can't meet minutes. D (Lambda script) is weak on reliability and auditing, and Pilot Light has a longer RTO. Trap: "human-judged failover + cost compromise + RTO in minutes" is ARC Routing Control + Warm Standby.

---

## 📌 The 80 Days in One Line

> **"SAP-C02 is an 'optimal solution judgment' exam. Read the question at the end of the stem first → extract the constraint keywords (operational overhead, cost, RTO/RPO, isolation, regulation, downtime) → decode the keywords into answer signals → if two look equally correct, pick the one with lower operational overhead. A blank is a loss, so always guess even on what you don't know."**

---

## 🏆 80 Days of Study Complete

- Weeks 1-4: SAA review · multi-account · networking · hybrid
- Weeks 5-9: global · migration · containers · serverless · data
- Weeks 10-12: ML/AI · security · cost
- Weeks 13-14: Well-Architected · DR
- Weeks 15-16: case studies · domain wrap-up · mock exam

**After the exam, set either a Specialty (Security, Networking, DB, ML) or hands-on depth as your next goal.**
