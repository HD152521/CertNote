# Day 5 - Final Review: Exam Scoring Mechanics, Item-Writer Psychology, Keyword Decoding, 12 Scenario Mock Questions + D-Day Strategy

This is the last of the 80 days. Today we learn no new concepts. Instead, we dissect **how the exam is scored and the psychology the item writer uses when planting wrong answers (distractors)**, compress the knowledge of the four domains you have built up into "keyword → direct answer" reflexes, and finish with 12 exam-length scenario mock questions. SAP-C02 is not a knowledge exam but a **judgment exam** — it measures your ability to pick, among answers that all look correct, "the single one that meets the requirements most precisely with the lowest operational burden."

## Internal Mechanics of Exam Scoring and Structure

> 🔍 **Going deeper**: SAP-C02 has **75 questions / 180 minutes**, and the passing line is **750 out of 1000 points** (about 75%). The key point is that it is a **scaled score** — not a simple percentage of correct answers but a score adjusted for item difficulty (based on IRT, Item Response Theory). Also, 10 of the 75 questions are **unscored questions** used to collect statistics on new items. Since you cannot tell which ones are unscored, you must treat every question the same way. There is no partial credit, and there is no penalty for a wrong answer (blank < guess). So **always guess on questions you do not know** — with four options the expected value is 25%, and if you eliminate two it becomes 50%.

There are patterns in how distractors are designed for multiple-choice exams. **"Plausible but misses one condition"**, **"correct but excessive (over-engineering)"**, and **"correct but with a heavy operational burden"** are the typical ones. Most traps in SAP-C02 are one of these three — for example, the correct answer is a managed service but a "build it yourself on EC2" option (excessive operational burden) is planted, or the correct answer is an SCP but an "IAM Policy" option (missing the condition that it cannot restrict root) is planted. So the scoring strategy is to **eliminate options not as "answer candidates" but by "which condition they violate."**

## Exam-Day Strategy

### One Week Before the Exam

- Quickly run through only the key keywords in each day's "wrap-up/summary" of the 80-day notes
- Pick one weak domain and concentrate on 30 scenario questions
- Redo the official AWS sample questions + Exam Readiness
- If your native language is not English, apply in advance for the **ESL +30 minute extension** (at the exam booking stage; it cannot be requested on the day)

### One Day Before the Exam

- No learning of new concepts — review only
- Sleep at least 6 hours (cognitive performance translates directly into score)
- Prepare two IDs (Pearson VUE: a government-issued photo ID + a secondary ID); for an online exam, complete the environment check beforehand

### The 3-Pass Strategy on Exam Day

1. **First pass**: Answer only what you can answer immediately, and if you hesitate, Mark for Review right away (do not burn time)
2. **Second pass**: Work calmly through the marked questions — this time, narrow down to two options using elimination
3. **Third pass**: Fill in blanks, and change answers carefully (your first instinct is statistically right more often — change only when you have clear grounds)
4. **Time allocation**: 75 questions / 180 minutes = an average of **144 seconds per question**. Answer 60% in the first pass and spend the remaining time on the hard questions

> ⚠️ **Trap**: Pro exam passages are **long and noisy**. They lay down irrelevant information such as "company revenue, headcount, history of past systems" and then ask about the key constraint. The strategy is to **read the actual question at the end of the passage first → extract the constraint keywords (RTO/RPO, operational burden, cost, isolation, regulation, downtime) → then scan the passage backward**. Reading every sentence in order will exceed 144 seconds.

## Keyword Decoding — Exam Language → Answer Signal

The Pro exam does not state the answer directly but signals it through **encoded keywords**. The decoding dictionary:

| Exam keyword | Answer signal |
|------------|----------|
| "Minimize operational burden / without management overhead" | Managed/Serverless (Lambda, Fargate, Aurora Serverless) |
| "Most cost-effective" | SP, Spot, Lifecycle, serverless, avoid On-Demand |
| "Isolate failures" | The AZ → Region → Account ladder |
| "Without human intervention / automatic recovery" | EventBridge, SSM Automation, Auto Scaling |
| "Must block even the root user" | SCP (not an IAM Policy) |
| "Absolutely no changes / regulation" | Object Lock/Vault Lock **Compliance** (not Governance) |
| "RPO of seconds/minutes, global SQL" | Aurora Global Database |
| "Local writes in each Region, eventual consistency OK" | DynamoDB Global Tables |
| "Minimum downtime, entire OS, one-time" | MGN (DRS if it is ongoing DR) |
| "Heterogeneous DB + schema conversion" | DMS + SCT |
| "Tens to hundreds of TB + slow line" | Snow Family + online delta |
| "SaaS → many customer VPCs, IP overlap irrelevant" | PrivateLink |
| "Fail over within 1 second on a DX failure" | BGP + BFD |
| "Highly reliable failover decided by a human" | Route 53 ARC Routing Control |

> 🎯 **Scenario**: If a passage says "a startup is growing fast, has only 3 engineers, and cannot spend time on operations," that is not about cost or scale — it is a code telling you to pick **"minimize operational burden → the most managed/serverless option."** For the same architecture, if it says "we have a dedicated SRE team and need fine-grained control," the answer leans toward more controllable options like EC2 and EKS. **Organizational context is the weighting of the answer.**

## The Four Domains Compressed Onto One Page

| Domain | Weight | Key tools | Answer reflex |
|--------|------|----------|----------|
| 1. Organizational Complexity | 26% | Org, SCP, Control Tower, TGW, DX, PrivateLink, Outposts | Account = isolation, SCP = ceiling, TGW = O(N), Snow = bandwidth |
| 2. New Solutions | 29% | Lambda, Fargate, Aurora, DynamoDB, EventBridge, Kinesis | CAP/PACELC, decoupling, fan-out |
| 3. Migration & Modernization | 20% | MGN, DMS+SCT, Snow, App2Container, Strangler Fig | Rehost first, zero-downtime CDC, no big bang |
| 4. Continuous Improvement | 25% | CloudWatch, SSM, CodeDeploy, FIS, Compute Optimizer | SRE, automate toil, gradual deployment, FinOps |

## Wrap-Up

SAP-C02 is an **"optimal solution" judgment exam**. All the depth of the 80 days converges into a single reflex — **read the question at the end of the passage first → extract constraint keywords → decode the keywords as answer signals → if two look equally correct, choose the one with lower operational burden**. Scoring is a scaled score (750/1000) and blanks are a loss, so always guess even on what you do not know. Passing is determined not by the amount of knowledge but by **the speed at which you read constraints and judge trade-offs**.

Now we work through 12 exam-length scenario questions to close out the 80 days. Each explanation also breaks down why the other options are wrong.

---

## 📝 Practice Questions

**Question 1.** 100 TB ERP in 6 months, global + security-first → **Rehost (MGN) + 3 months of parallel refactoring + FIS drill**

**Question 2.** $0 → 1M startup in 12 months → **Serverless (Lambda/DDB) + cost monitoring**

**Question 3.** Financial regulation + legacy monolith → **Rehost compute + refactor data (Aurora Global + KMS)**

**Question 4.** Legacy to be sunset in 2 years → **Retain (migration cost > refactor ROI)**

**Question 5.** RTO < 15 min → **Multi-AZ is sufficient; RTO < 5 min → Multi-Region; RTO = 0 → Multi-Site Active**

**Question 6.** Exam time management → **1 min read + 20 sec pillar + 40 sec tool + 10 sec decoy + 15 min review buffer**

---

**Question 7.** A multinational company operates more than 200 AWS accounts. The security team wants to block the use of Regions outside the EU in all accounts (including root), have new accounts automatically inherit standard logging and guardrails, and view the security findings of all accounts in one place. Which combination meets all of these requirements?
A) Region restriction with IAM policies in each account + manual account creation + GuardDuty operated separately per account
B) Control Tower (Account Factory, Guardrails) + SCP DenyRegions + Security Hub delegated administrator
C) SCP DenyRegions + logging deployed with StackSets + viewing findings from each account console
D) OU separation with Organizations alone + NACL Region blocking + CloudTrail per account

**Answer: B**

Explanation: Mapping each of the three requirements: (1) "block Regions outside the EU, including root" is possible only with an SCP DenyRegions (`aws:RequestedRegion`), which is the only control that blocks even root, (2) "new accounts automatically get the standard and guardrails" is Control Tower's Account Factory + Guardrails, and (3) "findings of all accounts in one place" is a Security Hub delegated administrator + auto-enrollment. B meets all three. A fails because IAM policies cannot block root, and manual creation and separate operation provide no automation or consolidation. C has the right SCP, but StackSets does not provide automatic guardrail inheritance, and checking each console individually falls short of the "one place" requirement. D fails because NACLs cannot prevent resource creation in a Region and per-account CloudTrail is not consolidated. Trap: for compound requirements, decompose each clause and choose the combination that satisfies all of them.

---

**Question 8.** A global SaaS reads and writes session data of users around the world from multiple Regions. Each Region must read and write with local latency (single-digit ms), and it is sufficient for changes in other Regions to be reflected eventually (strong consistency is not required). Operational burden must be minimal. Which design is most appropriate?
A) Single-Region Aurora + global Read Replicas
B) DynamoDB Global Tables (On-Demand)
C) Aurora Global Database
D) RDS per Region + bidirectional DMS replication

**Answer: B**

Explanation: "Local writes in each Region (active-active) + single-digit ms + eventual consistency allowed + minimal operational burden" is exactly the domain of DynamoDB Global Tables (serverless NoSQL). In PACELC terms it is PA/EL: it relaxes consistency for latency during normal operation, and each Region writes directly to its local replica (last-writer-wins). A and C (Aurora Global) allow writes in **only a single Region**, so they cannot meet the "local writes in each Region" requirement (writes must go to the primary, which adds latency). D (bidirectional DMS) has a heavy conflict resolution and operational burden and is not recommended. Trap: "local writes in each Region + eventual" is DynamoDB Global Tables, not Aurora Global.

---

**Question 9.** A company must move 100 TB of on-premises Oracle with a 6-month deadline. Only the core analytics DB will be converted to Aurora PostgreSQL to eliminate licensing, and the rest should be moved quickly and optimized gradually in the cloud. Which strategy is most appropriate?
A) Refactor all DBs to Aurora from the start
B) Rehost the rest to RDS Oracle, and Refactor only the core analytics DB with DMS + SCT
C) Ship everything with Snowball and restore manually on EC2
D) Retain everything (defer migration)

**Answer: B**

Explanation: When there is a time constraint, the Pro textbook approach is "**Rehost quickly, then refactor gradually in the cloud**." Refactoring all 100 TB to Aurora from the start would take months for schema conversion, application changes, and testing, missing the deadline. So most of it is Rehosted to RDS Oracle to move quickly, and only the core analytics DB with high business value is Refactored with DMS + SCT. A carries a large deadline risk. C is manual restoration, which is high risk and inefficient. D means not migrating at all. Trap: "deadline + gradual optimization" is Rehost first, then selective Refactor.

---

**Question 10.** An order system triggers 4 microservices (payment, inventory, shipping, and notification) for each order. Even if one service fails, the others must remain normal, and the failed service must process the backlog of messages without loss after it recovers. Which pattern is most appropriate?
A) The order service calls the 4 services with synchronous HTTP
B) SNS order topic fanning out to 4 SQS queues (each queue with a DLQ), with each service consuming its own queue
C) A single SQS queue consumed by all 4 services in a shared manner
D) EventBridge rules invoking the 4 Lambda functions directly

**Answer: B**

Explanation: "A failure in one service has no effect on the others + loss-free processing after recovery" is the textbook case for SNS fan-out + a dedicated SQS queue per service. SNS replicates to the 4 queues at the same time, and each queue becomes an independent buffer, so even if one service dies, messages pile up only in that queue and are consumed after recovery. A DLQ isolates repeated failures. A (synchronous calls) is temporal coupling in which one service's failure blocks everything. C (a single shared queue) lets only one consumer take each message, so fan-out does not work. D (direct Lambda) has no buffer, so there is a high risk of loss when a downstream service fails. Trap: "fan-out + isolated buffer per service" is SNS to multiple SQS.

---

**Question 11.** A financial regulator requires transaction audit logs to be retained for 7 years so that no one (including administrators and root) can modify or delete them. The logs are generated in all member accounts. Which design is most appropriate?
A) S3 Versioning + bucket policy in each account
B) CloudTrail Org Trail to S3 in a Log Archive account + Object Lock **Compliance** for 7 years
C) CloudTrail Org Trail to S3 + Object Lock **Governance** for 7 years
D) CloudTrail in each account to Glacier Deep Archive for 7 years

**Answer: B**

Explanation: Three requirements: (1) "logs from all member accounts" means a CloudTrail **Org Trail**, (2) "operators cannot delete" means a separate **Log Archive account** (separation of duties), and (3) "even root cannot modify" means Object Lock **Compliance** mode (even root cannot delete or modify during the retention period, satisfying SEC 17a-4 and SOX WORM). The **Governance** mode in C can be bypassed by anyone with the `s3:BypassGovernanceRetention` permission, so it falls short of "no one can"; this distinction is the key trap. A (Versioning) cannot prevent deletion itself. D is distributed per account, and Glacier itself does not guarantee immutability (Vault Lock is separate). Trap: "regulation, absolutely immutable" is Compliance, not Governance.

---

**Question 12.** A company has 200 VPCs across 3 Regions connected to 2 on-premises DCs, but direct communication between EU VPCs and Americas VPCs must be blocked. If a DX circuit fails, traffic must automatically switch to a backup VPN within 1 second. Which combination is most appropriate?
A) VPC Peering mesh + a single DX
B) A TGW per Region + multiple route tables + DX Gateway + 2 DX circuits + VPN + BGP/BFD
C) A single TGW route table + 2 VPNs only
D) PrivateLink mesh + a single DX

**Answer: B**

Explanation: Two requirements: (1) "large-scale VPC connectivity + isolation of some" means a TGW per Region + **multiple route tables** (separating routes per attachment to block EU to Americas), and (2) "automatic VPN switchover within 1 second" means 2 DX circuits + a VPN backup + **BGP + BFD (RFC 5880)**. A is impossible because a mesh of 200 VPCs is 19,900 connections, and a single DX is a SPOF. C (a single route table) provides no isolation, and VPN only loses DX's low latency. D (PrivateLink mesh) is unsuitable for integrated routing across all VPCs. Trap: compound requirements must satisfy both isolation (multiple route tables) and failover (BGP/BFD).

---

**Question 13.** Monthly security patches must be applied to 500 EC2 instances. Security policy prohibits SSH and bastion hosts, patches must be applied incrementally by group within defined time windows, and all access must leave an audit record. Which configuration is most appropriate?
A) Manual patching with Run Command + SSH with EC2 key pairs
B) SSM Patch Manager + Maintenance Window + Session Manager
C) yum-cron on each EC2 + CloudWatch logs
D) Replace instances with patched AMIs using CloudFormation

**Answer: B**

Explanation: Three requirements: (1) "patch automation, incremental by group" is Patch Manager (patch groups and baselines), (2) "time window control" is Maintenance Window, and (3) "SSH prohibited + audit" is Session Manager (access without SSH keys or a bastion, with every session recorded in CloudTrail and S3). A violates the SSH prohibition policy. C is weak on central control, time control, and auditing. D is an excessive instance replacement rather than patching. Trap: "SSH prohibited + patching + time control + audit" is the SSM trio.

---

**Question 14.** A mission-critical SQL workload must recover in another Region within an RPO of under 1 second and an RTO of 1 minute if the primary Region fails. During normal operation, the secondary Region shares the read load. Which design is most appropriate?
A) RDS Multi-AZ
B) Aurora Global Database
C) DynamoDB Global Tables
D) Cross-Region Read Replica with manual promotion

**Answer: B**

Explanation: "Global SQL + RPO under 1s + RTO in minutes + secondary Region shares reads" is Aurora Global Database: with asynchronous storage replication the RPO is under 1 second, and the secondary Region's read replicas share the load and are promoted within 1 minute during a disaster. A (Multi-AZ) is powerless against a Region failure. C is NoSQL and does not fit "SQL." D (manual promotion) cannot meet the RTO because of replication lag and manual promotion. Trap: "global SQL + RPO in seconds + fast promotion" is Aurora Global Database.

---

**Question 15.** A company wants to inject deliberate failures every quarter to verify resilience, with the experiment automatically stopping if the actual user impact exceeds a threshold, and with the experiment running on an automatic schedule. Which configuration is most appropriate?
A) AWS Backup recovery testing + manual execution
B) FIS (Fault Injection Service) + Stop Condition + EventBridge Scheduler
C) Resilience Hub static assessment only
D) Regular Trusted Advisor checks

**Answer: B**

Explanation: "Deliberate failure injection + automatic safety stop + automatic scheduled execution" is FIS + Stop Condition + EventBridge Scheduler. FIS injects the chaos experiment (a managed implementation of Netflix's Chaos Monkey), the Stop Condition automatically stops it when a CloudWatch alarm threshold is exceeded, and EventBridge Scheduler triggers the automatic quarterly run. A (Backup) is not failure injection. C (Resilience Hub) only statically assesses RTO/RPO and does not inject failures. D is a best-practice check. Trap: "failure injection + automatic stop + automatic schedule" is FIS + Stop Condition + Scheduler.

---

**Question 16.** A company wants to convert a 20-year-old Java EE monolith (sharing a single Oracle DB) into microservices. Rewriting everything at once carries a high risk of business interruption. What is the safest incremental strategy?
A) Rewrite everything to Lambda in a big bang
B) Strangler Fig pattern + API Gateway routing + microservices starting with new features + gradual DB separation with DMS
C) Put the monolith as is into a single container with App2Container
D) Rehost the monolith to EC2 and stop

**Answer: B**

Explanation: The safe standard approach for decomposing a monolith is the Strangler Fig pattern. API Gateway routes requests to the old monolith or the new services, new features are peeled off first, and for the shared DB, the data of each domain is gradually migrated to a new DB with DMS (database-per-service). Each step is reversible, so the risk is distributed. A (big bang) is a high-risk wrong-answer signal. C (containerizing the whole thing with A2C) is simple Replatform and falls short of the "microservice transition" goal. D (Rehost) is not modernization. Trap: "incremental decomposition + avoiding the big bang" is Strangler Fig.

---

**Question 17.** A SaaS wants to build a RAG chatbot that answers based on its own documents while minimizing operational burden. It does not want to operate model hosting or vector infrastructure itself. Which design is most appropriate?
A) Self-host an open-source LLM on SageMaker + a self-managed vector DB
B) Amazon Bedrock + Knowledge Base (managed vector and RAG)
C) Build an LLM + FAISS index directly on EC2
D) Use Amazon Kendra alone

**Answer: B**

Explanation: "Minimal operational burden + RAG + avoiding direct operation of model and vector infrastructure" is the textbook case for Amazon Bedrock + Knowledge Base: Bedrock provides foundation models serverlessly, and the Knowledge Base handles document embedding, vector storage, and retrieval-augmented generation (RAG) as a managed service. A and C run the model and vector infrastructure directly, directly contradicting "minimal burden." D (Kendra) is enterprise search and is not a complete answer for a generative RAG chatbot (it can be combined with Bedrock, but alone it lacks the generation part). Trap: "a RAG chatbot with minimal operational burden" is Bedrock + Knowledge Base.

---

**Question 18.** During a Region-wide failure, a company wants to avoid false positives from automatic health checks and have the operations team assess the situation and shift traffic to another Region with high reliability. At the same time, it wants to balance cost while keeping the RTO in minutes. Which combination is most appropriate?
A) Route 53 Health Check automatic Failover + Multi-Site Active-Active
B) Route 53 ARC Routing Control + Warm Standby
C) Global Accelerator automatic + Backup & Restore
D) A Lambda routing script + Pilot Light

**Answer: B**

Explanation: Two requirements: (1) "human judgment + avoiding false positives + a highly reliable manual switch" is Route 53 ARC Routing Control (a manual on/off switch with a distributed data plane that is itself highly available), and (2) "cost balance + RTO in minutes" is Warm Standby (a scaled-down copy running continuously, scaled up on failover). A (automatic Health Check) carries false-positive risk, and Active-Active goes against balancing cost. C (Backup & Restore) has an RTO in hours and cannot meet minutes. D (Lambda script) is weak on reliability and auditing, and Pilot Light has a longer RTO. Trap: "human-judged failover + cost balance + RTO in minutes" is ARC Routing Control + Warm Standby.

---

**Exam closes. You are ready. Trust your trade-off thinking, not memorization. Go Pro.**

---