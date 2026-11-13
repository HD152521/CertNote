# Day 5 - The D-Day Checklist: Operating the Exam, the Final System

We have arrived at the end of 12 weeks. The job on the last day is not to cram in new knowledge but to **organize what you already have so it is easy to pull out and use**. The exam itself is also something to operate: a limited resource called time (180 minutes), a queuing strategy called flagging, and infrastructure called your physical condition. Just as a CloudOps operator handles a system, if you see the exam as a matter of resource allocation and risk management, you stay calm.

This post contains the checklist from D-7 to D-Day, the time allocation and question-solving strategies that actually work in the exam room, and 20 questions for a final condition check. The explanations are written in depth so that you can engrave "why is that the answer" one more time.

---

## 🧩 Prerequisites (Exam Logistics)

- **Pearson VUE / PSI**: AWS exam vendors (chosen when you book)
- **Onsite vs OnVUE**: test center vs taking it online at home (webcam + remote proctoring)
- **65 questions / 130 minutes, scored + unscored mixed**: some are unscored questions for statistics gathering (they are not marked as such)
- **Passing score 720/1000**: not a simple percentage of correct answers but a scaled score that reflects question difficulty

> 💡 **Related theory**: The reason an AWS exam score is a **scaled score** rather than "correct answers ÷ total" is exam fairness. Each exam has a different set of questions with slightly different difficulty, and a candidate who got a harder set must not be disadvantaged. So the difficulty of each question is statistically calibrated (the item response theory, IRT, family) and converted to the same standard of 720. As a result, you can pass "even if you get all the easy questions right and miss a few hard ones," and because unscored questions (new questions being validated that do not count toward the score) are mixed in, you must treat every question with equal seriousness, since you cannot tell which ones are unscored.

---

## 1. D-7 to D-Day Checklist

In operations, changes are made gradually, and the riskier the change, the earlier it is made. Exam prep is the same: finish acquiring new knowledge (risky, high-load) early, and leave only stabilization (review, rest) for the final stretch.

### D-7 (One Week Before the Exam): Integrated Review

- [ ] Re-read the Day 1, 2, and 3 domains of this week (focused on data models and trade-offs)
- [ ] Go back over the weekly day.md files for the weak domains found in the Day 4 mock exam
- [ ] Read through the official AWS Exam Guide PDF: check that no service in the exam scope is missing
- [ ] Confirm your exam booking (date, time, language, vendor)
- [ ] Check the test center location or your OnVUE environment (webcam, network)

### D-3 (Three Days Before the Exam): Focus on Traps

- [ ] Check your memorization of the key mapping table (keyword → answer service)
- [ ] Sort out the confusing pairs: SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica, OAC/OAI
- [ ] Redo only the mock exam questions you got wrong (skip the ones you got right, for time efficiency)
- [ ] Taking the exam in Korean is recommended (avoids translation ambiguity). If you take it in English, check your familiarity with key terms

### D-1 (The Day Before the Exam): Stabilization Only

- [ ] **No new study** - only lightly go over your existing key cards
- [ ] Prepare 2 forms of ID (at a test center: 2 of resident registration card/driver's license/passport, and confirm the English name matches)
- [ ] For OnVUE: secure a working webcam, microphone, and network, and a quiet, clean desk (clear away surrounding items)
- [ ] Get enough sleep (7-8 hours): cognitive performance is directly tied to sleep

### D-Day (Exam Day): Execution

- [ ] Arrive at the test center 30 minutes early / check in for OnVUE 15 minutes early (identity check, room scan)
- [ ] A light meal + moderate caffeine (not too much: shaky hands, restroom trips)
- [ ] After starting, **set your pace with the first 5-10 questions** (relax)
- [ ] If you are unsure, **flag it and move on**: do not get stuck on a single question
- [ ] **Review in the last 10 minutes**: check for blank answers and marking mistakes

> ⚠️ **Pitfall**: Studying a new topic on D-1 is almost always counterproductive. A concept you first saw the day before comes back half-formed in the exam room and shakes answers you actually knew well (interference effect). For the last 24 hours, the standard is "block new input + reinforce the existing + rest." In operations terms, it is like not deploying an unverified change right before an important release: a change freeze.

---

## 2. Exam-Taking Strategy: Allocating the Resource Called Time

### Time Allocation (180 minutes)

| Phase | Time | Task |
|------|------|------|
| 1st pass | About 100 min | Go through all 65 questions once: answer the ones you know immediately, flag and skip the ones where you get stuck |
| Review | About 60 min | Re-examine the flagged questions (now without time pressure) |
| Final check | About 20 min | Confirm zero blank answers + a final check |

The key is **not to spend more than 90 seconds on any one question in the 1st pass**. Just as one slow request in a distributed system ruins overall throughput, clinging to one hard question costs you the time to solve the easy questions that follow. Flagging is an asynchronous strategy of "put this task in a queue and handle it later": do not block on a stuck task, skip past it, and handle it in the Review phase when you have spare resources (time).

### The 5 Steps of Solving a Question

1. **Read the question to the end**: qualifiers such as "MOST cost-effective," "LEAST operational overhead," and "MOST secure" decide the answer. If you miss the qualifier, you pick a wrong answer that "does work."
2. **Catch the scenario keywords**: "automatically," "auditable," "minimal operational overhead," "near real time," and so on point to specific services.
3. **Eliminate the obviously wrong options first**: in a four-choice question, usually 2 are clearly wrong. Focus on the remaining 2.
4. **Decide between the remaining 2 with the qualifier**: both are "possible," but the one that better fits the qualifier (cost? overhead? security?) is the answer.
5. **If you are not sure, flag it**: leave a tentative answer by intuition (no blanks), but flag it to look at later.

### Qualifier ↔ Answer Patterns

| Qualifier | Direction of the answer |
|--------|----------------------|
| "MOST cost-effective" | Gateway Endpoint (free) / Compute SP / S3 Intelligent-Tiering / Spot |
| "LEAST operational overhead" | Managed services (AWS Backup / Secrets Manager / Session Manager / Fargate) |
| "automatically" | Auto Scaling / DLM / Lifecycle / Config Remediation |
| "highly available" | Multi-AZ / Multi-Region / Route 53 Failover |
| "auditable" / "track who" | CloudTrail / Config / Audit Manager |
| "fastest recovery" | Multi-Site / Aurora Global → Warm Standby → Pilot Light, in that order |
| "real-time threat" | GuardDuty |
| "encrypt + rotate" | KMS + Secrets Manager |

That "LEAST operational overhead" almost always points to a managed service is no accident; it reflects the philosophy of AWS exams. AWS wants customers to delegate undifferentiated heavy lifting, such as patching, backups, scaling, and HA setup, to AWS and to focus on business logic. So the exam almost always prefers "use a managed service" over "install and operate it yourself on EC2." Self-managed EC2 < RDS < Aurora Serverless, hand-rolled cron < EventBridge Scheduler, bastion < Session Manager. When you see "minimal operational overhead," the most managed option is likely the answer.

---

## 3. Wrong-Answer Notebook Template

Organizing each wrong answer on one sheet in the template below structures your weaknesses. It is important to classify "why I got it wrong" into three types (confusion/qualifier/trap).

```
[Wrong-answer note #N]
=====================================
📅 Date written: YYYY-MM-DD
📚 Exam domain: Domain X (XX%)
🎯 Topic area: <e.g., CloudWatch Composite Alarm>

📝 Question summary
<1-2 lines of the core scenario>

❌ My answer: <option>
✅ Correct answer: <option>

🔍 Type of mistake (pick one)
□ Service confusion   □ Missed the qualifier   □ Trap option

💡 Key takeaway (a pattern to remember in one line)
<e.g., "minimal operational overhead" → managed (Session Manager)>

🔗 Related day.md
- weekN/dayM.md
=====================================
```

---

## 4. Final Memorization Cards (5-Minute Pass Right Before the Exam)

### Monitoring and Logging
- Memory/disk metrics = **CloudWatch Agent** (the hypervisor cannot see inside the guest)
- API actions = **CloudTrail**, resource state = **Config**
- Alarm consolidation = **Composite**, dynamic threshold = **Anomaly Detection**, logs → metrics = **Metric Filter**

### Reliability and BCP
- HA = **Multi-AZ** (synchronous, zero loss), read scaling = **Read Replica** (asynchronous, lag), global = **Aurora Global DB**
- The 4 DR coordinates = Backup & Restore / Pilot Light / Warm Standby / Multi-Site (RTO, RPO, cost)
- Object retention = **S3 Object Lock**, backup retention = **Vault Lock**

### Deployment and Automation
- Multi-account IaC = **StackSets**, change preview = **Change Set**, difference detection = **Drift Detection**
- Instant rollback = **Blue/Green**, safe replacement = **Immutable**
- Patching = **Patch Manager + MW**, access = **Session Manager**, DB secrets = **Secrets Manager**

### Security
- Org guardrail (ceiling) = **SCP**, entity ceiling = **Permission Boundary**, explicit Deny takes precedence
- Behavioral threats = **GuardDuty**, vulnerabilities = **Inspector**, S3 data = **Macie**, consolidation = **Security Hub**

### Networking
- **SG = Stateful** (responses automatic), **NACL = Stateless** (specify ephemeral ports)
- S3/DDB = **Gateway Endpoint** (free), others = **Interface Endpoint**
- Path diagnosis = **Reachability Analyzer**, HTTP caching = **CloudFront**, TCP/UDP = **Global Accelerator**

### Cost and Performance
- Right Sizing = **Compute Optimizer**, most flexible commitment = **Compute SP**, maximum discount = **Standard RI**
- 90% discount (reclaimable) = **Spot**, capacity guarantee (no discount) = **Capacity Reservation**
- ML anomaly detection = **Cost Anomaly Detection**, alert + automatic block = **Budgets + Action**

---

## ⭐ Final Key Points

1. ⭐ **CloudWatch + SSM are a major axis of the exam**: knowing these two services deeply brings you close to the passing line
2. ⭐ **Qualifiers are clues to the answer**: do not miss "MOST cost-effective" and "LEAST overhead"
3. ⭐ **A final check of the confusing pairs**: SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica, OAC/OAI
4. ⭐ **Time management = the flag async strategy**: do not get stuck on one question; put it in the queue and move on
5. ⭐ **D-1 is a change freeze**: no new study, just a pass through the key cards + enough sleep

---

## 📝 Short 20-Question Mock Exam (for a Condition Check)

These 20 questions are not a test of new knowledge but **retrieval practice**. In cognitive psychology, memory is strengthened by the very act of "recalling it again": pulling things out in an exam format is far more effective for long-term memory than just repeating reading (the testing effect). A light retrieval practice right before the exam raises both confidence and recall speed.

**Question 1.** To connect to EC2 without SSH keys and audit every session through CloudTrail?
A) Run Command  B) Session Manager  C) Patch Manager  D) State Manager

**Answer: B**

Explanation: Session Manager opens a shell over the outbound connection of the SSM Agent, so no inbound port or key pair is needed, it authorizes through IAM, and it records every session in CloudTrail. It removes the burdens of key management, port exposure, and auditing all at once.

---

**Question 2.** What is the current standard for protecting an S3 origin with CloudFront?
A) OAI (legacy)  B) OAC  C) Signed URL  D) Bucket Policy only

**Answer: B**

Explanation: OAC (Origin Access Control) is SigV4-signature-based, replaced OAI, and even supports KMS-encrypted objects. It keeps S3 private and forces access only through CloudFront. OAI is legacy.

---

**Question 3.** Which guardrail puts a permission ceiling on all accounts in the organization?
A) IAM Policy  B) SCP  C) Permission Boundary  D) Identity Center

**Answer: B**

Explanation: An SCP is a permission ceiling at the Organizations level. However, it only restricts and does not grant permissions, so actual permissions must be given separately through each account's IAM policies. An SCP Deny is an explicit Deny, so it beats every Allow.

---

**Question 4.** What is the most flexible commitment that applies to all of EC2, Fargate, and Lambda?
A) Standard RI  B) EC2 Instance SP  C) Compute Savings Plans  D) Convertible RI

**Answer: C**

Explanation: Compute SP commits only to an hourly amount regardless of service, family, or Region, so it is the most flexible (with a middle-level discount). Flexibility and discount are inversely related, so for a highly variable workload, Compute SP is the right choice.

---

**Question 5.** To statically diagnose the path between two resources without actual traffic?
A) VPC Flow Logs  B) Reachability Analyzer  C) Traffic Mirroring  D) ping

**Answer: B**

Explanation: Reachability Analyzer statically analyzes the SG, NACL, and route configuration and reports whether the destination is reachable and where it is blocked. It needs no real packets, so it suits pre-diagnosis. Flow Logs are a record made after actual traffic occurs.

---

**Question 6.** Which deployment has zero downtime + instant rollback as its key?
A) Rolling  B) All at once  C) Blue/Green  D) In-place

**Answer: C**

Explanation: Blue/Green switches to the new environment without deleting the old one, so in case of a problem a single action of routing back gives an instant rollback. With a DNS switch the TTL delay is the trap, and with a shared DB the schema compatibility is the trap.

---

**Question 7.** To automatically detect PII (sensitive information) stored in S3?
A) Inspector  B) GuardDuty  C) Macie  D) Detective

**Answer: C**

Explanation: Macie scans the content of S3 objects with ML to find the location and exposure of PII. It is the only service that looks at "the content of S3 data": Inspector looks at vulnerabilities and GuardDuty looks at behavioral threats.

---

**Question 8.** To deploy the same IaC in bulk to multiple accounts/Regions?
A) Nested Stack  B) StackSets  C) Change Set  D) Drift Detection

**Answer: B**

Explanation: StackSets deploys and manages one template to multiple accounts and Regions at the same time (for an organization baseline and so on). A Nested Stack is modularization within a single stack, so its scope is different.

---

**Question 9.** To set an alarm on a metric whose normal values change greatly by day of week and time of day?
A) Composite  B) Anomaly Detection  C) Standard  D) Metric Math

**Answer: B**

Explanation: Anomaly Detection learns past patterns with ML to draw a dynamic normal band and alarms when the metric leaves it. A fixed threshold cannot follow variations by time of day, so it yields many false positives and false negatives.

---

**Question 10.** To receive the 2-minute warning before a Spot reclaim and shut down gracefully?
A) CloudWatch Alarm  B) EventBridge (Spot Interruption Warning) → Lambda/Lifecycle Hook  C) Cron  D) SQS

**Answer: B**

Explanation: The Spot reclaim warning arrives as the EC2 Spot Instance Interruption Warning event, which you receive with EventBridge and then drain, checkpoint, and terminate with Lambda or a Lifecycle Hook. Spot presupposes a stateless, checkpointable workload.

---

**Question 11.** What is the commitment discount model for RDS PostgreSQL?
A) Compute SP  B) EC2 Instance SP  C) Reserved Instances (RDS RI)  D) Spot

**Answer: C**

Explanation: Savings Plans apply to EC2, Fargate, and Lambda and do not include RDS. RDS, Redshift, and ElastiCache each get commitment discounts through their own Reserved Instances. "RDS commitment = RDS RI."

---

**Question 12.** Which RDS configuration prepares for a whole-Region failure?
A) Multi-AZ  B) Cross-Region Read Replica / Aurora Global DB  C) Snapshot  D) Backup

**Answer: B**

Explanation: Multi-AZ is HA within a single Region, so it cannot protect against a whole-Region failure. Preparing for a Region failure means replication to another Region: for regular RDS, a Cross-Region Read Replica (promoted when needed), and for Aurora, Global Database is the answer.

---

**Question 13.** What is a characteristic of a Security Group?
A) Stateless  B) Stateful (responses automatically allowed)  C) Subnet level  D) Supports Deny rules

**Answer: B**

Explanation: An SG is stateful, so it automatically allows responses to outbound connections through the connection tracking table. It supports only allow rules, and its unit of application is the instance (ENI). Deny and subnet-level application are characteristics of the NACL.

---

**Question 14.** Which option gives free private connectivity to only S3 and DynamoDB?
A) Interface Endpoint  B) Gateway Endpoint  C) PrivateLink  D) NAT

**Answer: B**

Explanation: A Gateway Endpoint is dedicated to S3 and DynamoDB and is free (a route table entry). It bypasses NAT and eliminates the per-GB processing charge. For other services you use the paid Interface Endpoint (PrivateLink).

---

**Question 15.** To receive ML-based Right Sizing recommendations for EC2, EBS, and Lambda?
A) Trusted Advisor only  B) Compute Optimizer  C) Cost Explorer  D) Budgets

**Answer: B**

Explanation: Compute Optimizer analyzes the percentile distribution of 14+ days of metrics with ML, classifies resources as Over/Under/Optimized, and recommends suitable types. However, memory cannot be seen without the Agent, so the recommendation can be skewed.

---

**Question 16.** What is the mechanism by which a Config Rule automatically fixes non-compliant resources?
A) Lambda directly  B) SSM Automation Remediation  C) EventBridge  D) CloudFormation

**Answer: B**

Explanation: Config Remediation calls an SSM Automation Document to return the resource to the standard state. This fix must be idempotent (safe to run multiple times), and a declarative action that says "make it this state" satisfies that condition.

---

**Question 17.** To globally accelerate UDP game traffic and need static IPs?
A) CloudFront  B) Global Accelerator  C) Route 53 Latency  D) ALB

**Answer: B**

Explanation: CloudFront is dedicated to HTTP/S caching, so it cannot handle UDP. Global Accelerator accelerates TCP and UDP over the AWS private backbone, provides 2 static Anycast IPs, and does fast cross-Region failover.

---

**Question 18.** To rotate a DB password automatically with zero downtime?
A) Parameter Store SecureString  B) Secrets Manager + Lambda  C) KMS  D) IAM

**Answer: B**

Explanation: Automatic rotation is the core of Secrets Manager, performing a zero-downtime replacement in 4 steps: create → set → test → finish. Parameter Store SecureString stores encrypted values but has no rotation feature. More fundamentally, there is also the approach of eliminating the secret itself with RDS IAM authentication.

---

**Question 19.** To automatically stop EC2 or attach a restrictive SCP when a monthly budget threshold is reached?
A) Cost Anomaly Detection  B) Budgets + Budget Action  C) CloudWatch Alarm  D) Trusted Advisor

**Answer: B**

Explanation: Budget Action takes active measures when a threshold is reached, such as attaching an IAM policy/SCP or stopping EC2/RDS. Cost Anomaly Detection goes only as far as ML anomaly detection and alerts and has no automatic blocking action. "Alert + automatic block" is Budgets + Action.

---

**Question 20.** To automate PCI, SOC, and HIPAA compliance evidence collection and reporting?
A) Security Hub  B) Audit Manager  C) Config  D) Artifact

**Answer: B**

Explanation: Audit Manager automatically collects the evidence each framework requires and produces audit reports. Artifact is where you get AWS's own compliance documents (such as SOC reports), and Config is resource compliance evaluation. "Automating compliance reports for my environment" is Audit Manager.

---

## 📌 Final Summary

1. **CloudOps is an "operator's perspective" exam**: it asks which managed tool responds to which failure
2. **A final check of the confusing pairs**: SG/NACL, CloudTrail/Config, SP/RI, Multi-AZ/Read Replica, OAC/OAI
3. **Time = a resource, Flag = an asynchronous queue**: do not get stuck on one question; allocate calmly
4. **D-1 is a change freeze**: no new study, sleep well, and go in with a light condition
