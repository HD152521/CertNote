# Day 5 - Final Review & Exam Simulation — Full-Stack Scenario, Trade-off Decision Under Constraints

Last day: **synthesize all 16 weeks into one decision-making engine.** Exam is fundamentally: (1) **Read scenario** (time constraint, business goal, data volume), (2) **Identify pillar weight** (Security > all for regulated, Cost for startup, Reliability for SaaS), (3) **Find hidden constraint** (data sovereignty, compliance, performance SLA), (4) **Eliminate decoys** (shiny service, overkill, underestimate), (5) **Select best trade-off** (not perfect, but **right for context**).

Scenario type:
- **Big Bang**: 100TB ERP migration, 6 months, multi-region, security-first → Rehost (MGN) + 3-month parallel refactor + FIS drills
- **Greenfield**: Startup $0→1M ARR, 12 months → Serverless autoscale (Lambda/DDB) + cost monitoring + manual governance
- **Hybrid**: Regulated financial with legacy monolith → Rehost compute, refactor data tier to Aurora Global + KMS + GuardDuty
- **Edge case**: Sunset legacy app, 2 years runway → Retain (no migration cost beats refactor ROI)

Final exam calibration:
- 130 questions, ~2 min average
- Scenario = 1 min read, constraint identification
- Pillar diagnosis = 20 sec
- Tool selection = 40 sec
- Decoy elimination = 10 sec
- **Review buffer = 15 min (last 15 questions re-check)**

Confidence heuristics:
- If two answers seem equally valid → **Hidden constraint exists**, re-read scenario
- If cost + compliance conflict → **Always compliance (regulatory > cost)**
- If performance + cost conflict → **Measure downtime cost; high margin → performance wins**
- If SLA says RTO<15min, Multi-AZ sufficient; RTO<5min → Multi-Region; RTO=0 → Multi-Site Active-Active

[6 EXERCISES: Full scenario 1 (ERP), Full scenario 2 (Startup), Full scenario 3 (Regulated), Hidden constraint extraction, confidence calibration, review strategy]

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