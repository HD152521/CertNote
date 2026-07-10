# Day 5 - What the Exam Asks to the End Is "the Speed of Translating Keywords into Services"

This is the final day of the 12-week SAA-C03 journey. This article is not a place to add new knowledge but to compress the scattered domains into **a single judgment system that works in the exam room**. The essence of the SAA exam is simple — read a long, complex scenario prompt, grab the **signal words** hidden inside, and translate them into the correct-answer service. 65 questions in 130 minutes, about 2 minutes each. Under this time pressure, what separates a pass is not the volume of knowledge but the speed of classifying, within one second, "which axis is this prompt ultimately asking about?"

The four domains the exam covers carry different weights — security 30%, resilience 26%, high performance 24%, cost 20%. But actual questions cross these boundaries. "Deliver content to global users at low latency while also cutting cost" folds high performance and cost into one sentence. So the final checkpoint should not be per-domain memorization but engraving into your mind **a signal-word dictionary that runs through scenarios**. This article organizes that dictionary and closes the translation training with a real-exam-style mock test.

> 💡 **Related theory**: SAA exam scoring mixes **scaled scoring** (100–1000, passing at 720) with **unscored questions that aren't graded**. AWS excludes about 15 of the 65 questions from grading as **pretest questions** for future exams — and the candidate can't tell which are graded. The implication of this design is clear. **Pouring time into one or two unknown questions and wrecking your overall pace is the biggest loss** — that question may well be unscored anyway, and because of scaled scoring with per-question difficulty adjustment, "reliably getting all the easy questions right" is safer than clutching a few hard ones. Time management is score management.

## The Signal-Word Dictionary: One Word in the Prompt Decides the Answer

90% of SAA questions bind the correct-answer service 1:1 to a specific signal word. Automate this mapping and you solve in 30 seconds, not 2 minutes.

Start with **performance/latency signal words**. "Microsecond (μs) DynamoDB response" is **DAX** (DynamoDB-dedicated cache), "millisecond general cache" is **ElastiCache**, "global low-latency caching of static/dynamic content" is **CloudFront**, and "global acceleration of TCP/UDP non-HTTP traffic + fixed IP" is **Global Accelerator**. The decisive signal word separating CloudFront and Global Accelerator is **protocol** — HTTP(S) content caching is CloudFront, and UDP/TCP acceleration like games and VoIP is Global Accelerator.

**Resilience/DR signal words** split by replication mode and RTO/RPO. "Automatic failover within a single region" is **Multi-AZ**, "global active-active relational" is **Aurora Global Database**, and "global active-active NoSQL" is **DynamoDB Global Tables**. The 4 DR tiers are a cost/recovery-speed spectrum — Backup & Restore (cheapest, slowest) → Pilot Light → Warm Standby → **Multi-Site Active-Active** (most expensive, RTO/RPO ≈ 0). "RPO ≈ 0, RTO ≈ 0" is unconditionally Active-Active.

**Security/messaging/network signal words** organize too. "Block SQL injection/XSS" is **WAF**, "EC2 accesses an API" is **IAM Role + IMDSv2**, "automatic secret rotation" is **Secrets Manager**, "multiple consumers replay the same stream" is **Kinesis Data Streams**, "decouple with a loosely-coupled queue" is **SQS**, "fan-out (one message, many subscribers)" is **SNS**, "50 VPCs + on-premises routing hub" is **Transit Gateway**, and "IAM permissions for EKS Pods" is **IRSA**.

> 🔍 **Going deeper**: The cognitive-science background of why signal-word mapping works is experts' **chunking** and **pattern recognition**. Studying chess grandmasters in 1973, Chase and Simon showed that experts are faster not because they have better memory than novices, but because they perceive scattered information as meaningful chunks — a grandmaster sees the board not as 64 squares but as a few "familiar patterns." SAA high scorers are the same. They don't read the long sentence "private-subnet EC2 accesses S3 in bulk through NAT with high cost" letter by letter, but instantly recognize it as the single chunk **"S3 Gateway Endpoint pattern."** This is why the true goal of 12 weeks of study is not knowledge accumulation but forming this chunking ability. So the final checkpoint should be spent automating signal-word → service mapping through repetition, not learning new material.

> ⚠️ **Pitfall**: The exam deliberately juxtaposes pairs whose signal words look similar. ① **CloudFront vs. Global Accelerator** — both are "global, low-latency," but split by HTTP caching (CloudFront) vs. UDP/TCP acceleration + fixed IP (GA). ② **DAX vs. ElastiCache** — both are caches, but DynamoDB-dedicated microsecond is DAX, general-purpose millisecond is ElastiCache. ③ **Secrets Manager vs. Parameter Store** — both store secrets, but if automatic rotation is needed it's Secrets Manager. ④ **SQS vs. Kinesis** — both are messaging, but "replay / multiple consumers / order / sharding" is Kinesis, "simple decoupling / task queue" is SQS. Finding this distinguishing signal word in the prompt is the key to avoiding the trap.

## Meta-Principles That Cross Domains: The Same Question Repeats in Every Area

The four domains differ on the surface, but beneath them flow a few meta-principles running through the whole exam. Grasp these and you can solve even a first-seen scenario.

First, the **Shared Responsibility Model** permeates every domain — the sliding rule "the more managed the service, the larger AWS's responsibility" works the same way in security (patching responsibility), resilience (availability SLA), and cost (zero idle billing). Second, **fail-safe defaults** (the default is deny/block) — IAM's implicit deny, S3 Block Public Access, and the whitelist of NACL/SG are all one principle: "block by default, open explicitly." Third, **loose coupling** — separating components with SQS/SNS/EventBridge is simultaneously a solution for resilience (one part's failure doesn't propagate), scalability (independent scaling), and cost (process only when needed).

> 💡 **Related theory**: These meta-principles all derive from the six pillars of the **AWS Well-Architected Framework** — operational excellence, security, reliability, performance efficiency, cost optimization, and sustainability. The core design principles this framework emphasizes (assume failure, automate, eliminate single points of failure, scale elastically) become the grounds for "why the correct answer is correct." For example, "if a single NAT Gateway is in only one AZ, that AZ's failure cuts internet for other AZs → put a NAT in each AZ" is a direct application of the reliability pillar's "eliminate single points of failure." Because SAA is by definition a "solutions architect" certification, it's designed to measure the ability to judge trade-offs by these architectural principles rather than individual-service knowledge. When you hit an unknown question, return to "which option is most robust/efficient under Well-Architected principles" and a path appears.

## D-Day Operations Checklist: Environment and Pace Protect the Score

Even with sufficient knowledge, you fail if you collapse on exam environment and time management. The final things to control are condition and pace.

**The day before**, prepare two IDs (including one with English lettering, mandatory for OnVUE remote proctoring), and if using OnVUE, pre-check webcam, microphone, internet, and a quiet private space. All items on the desk must be cleared (the remote proctor checks 360 degrees), and sleeping enough matters more than solving one more question.

The core of **in-exam strategy** is the **2-minute rule** — if you exceed 2 minutes on a question, flag it, move on, and revisit later. Since every question is worth the same, securing five easy questions beats clutching one hard question for 5 minutes, overwhelmingly. If two options are clearly wrong, remove them to narrow to 50:50, and **don't change your first answer without solid new information** (the first instinct is statistically more often right). And don't miss **qualifiers** like "shared responsibility," "default," "most cost-effective," and "least operational burden" — the same scenario can flip its answer on one such qualifier.

> 📚 **Case study**: The pattern in which many candidates fail SAA is not "lack of knowledge" but **"failed time allocation."** The typical failure scenario is this — they clutch two or three hard scenarios in the first 10 questions, spending 5–7 minutes each, realize around question 50 that only 20 minutes remain, and rush-guess the back half. Here they miss even the easy questions clustered at the end, and the score collapses. This is why passers commonly recommend the three-stage pace **"first pass (65 questions fast in 90 minutes, flag the hard ones) → second revisit (30 minutes on flagged questions) → third check (10 minutes)."** Considering that unscored questions are mixed in, "don't fixate on a stuck question" is not mere advice but a statistically optimal strategy for protecting the score.

## The Final One-Line Dictionary

| Signal word | Correct-answer service |
|--------|------------|
| Microsecond DynamoDB | DAX |
| Millisecond general cache | ElastiCache |
| HTTP global caching | CloudFront |
| UDP/TCP acceleration, fixed IP | Global Accelerator |
| Single-region automatic failover | Multi-AZ |
| Global active-active NoSQL | DynamoDB Global Tables |
| RPO/RTO ≈ 0 | Multi-Site Active-Active |
| SQL injection / XSS | WAF |
| EC2 → API access | IAM Role + IMDSv2 |
| Automatic secret rotation | Secrets Manager |
| Replayable multi-consumer stream | Kinesis Data Streams |
| Fan-out notification | SNS |
| 50 VPCs + on-prem hub | Transit Gateway |
| EKS Pod IAM | IRSA |
| Private EC2 → S3 cost ↓ | S3 Gateway Endpoint |
| Unknown-pattern S3 | Intelligent-Tiering |
| Auto-block on budget reached | Budgets Actions |

---

## 📝 최종 모의고사 (시나리오 12문항)

**문제 1.** A global multiplayer game provides UDP-based real-time communication to players worldwide. It must minimize latency and needs a fixed entry IP for clients to reference. What is the most appropriate service?

A) CloudFront

B) Global Accelerator

C) Route 53 latency-based routing

D) NAT Gateway

**정답: B**

해설: **Global Accelerator** accelerates traffic at the edge over AWS's global network backbone and provides **UDP/TCP non-HTTP traffic** support and a **fixed Anycast IP**, suiting games, VoIP, and IoT. CloudFront (A) is dedicated to HTTP(S) content caching, unsuited to UDP game traffic. Route 53 latency routing (C) is only DNS-level distribution and doesn't accelerate the packet path or give a fixed IP. D is an outbound internet gateway, irrelevant. Signal words "UDP + fixed IP + global acceleration" = Global Accelerator.

---

**문제 2.** An e-commerce app uses DynamoDB, its read traffic is surging, and **microsecond-level** read latency is required. What is the most appropriate method?

A) Place ElastiCache for Redis in front

B) DynamoDB Accelerator (DAX)

C) Add a read replica

D) Migrate to Aurora

**정답: B**

해설: **DAX (DynamoDB Accelerator)** is a DynamoDB-dedicated in-memory cache that provides **microsecond-level** read responses with almost no application code change. ElastiCache (A) is a general-purpose cache in the millisecond range, doesn't map directly to a microsecond requirement, and needs separate cache logic. Read replicas (C) are an RDS/Aurora concept, and D is an over-change turning NoSQL into relational. "DynamoDB + microseconds" = DAX is the 1:1 answer.

---

**문제 3.** A financial company requires disaster recovery of **RPO ≈ 0, RTO ≈ 0** across two regions. Which DR strategy?

A) Backup & Restore

B) Pilot Light

C) Warm Standby

D) Multi-Site Active-Active

**정답: D**

해설: The 4 DR tiers are a cost/recovery-speed spectrum — Backup & Restore (cheapest, slowest) → Pilot Light → Warm Standby → **Multi-Site Active-Active** (most expensive but both regions process traffic simultaneously, RPO/RTO ≈ 0). "RPO ≈ 0, RTO ≈ 0 / zero downtime" is unconditionally Active-Active. A takes hours to recover, B keeps only the core on and scales, and C is a reduced-scale always-on, so none has RTO 0. Active-Active buys immediate recovery at the price of cost.

---

**문제 4.** An application collects clickstream data, and **multiple independent consumers** must process the same data each at a different rate and be able to **replay** past data. What is the appropriate service?

A) Amazon SQS Standard

B) Amazon Kinesis Data Streams

C) Amazon SNS

D) Amazon MQ

**정답: B**

해설: **Kinesis Data Streams** stores data for the retention period so that **multiple consumers can read independently and replay past data** — the standard for clickstream, logs, and real-time analytics. SQS (A) deletes a message once consumed, unsuited to replay and multiple independent consumers (task-queue model). SNS (C) is a fan-out push with no storage/replay, and MQ (D) is for migrating existing protocols (AMQP, etc.). "Replay + multiple consumers + stream" = Kinesis is the key signal.

---

**문제 5.** An EC2 application needs to access S3. Along with security best practice, it wants to prevent credential theft via SSRF attacks. What is the correct configuration?

A) Inject access keys as environment variables

B) Attach an IAM Role to the instance and enforce IMDSv2

C) Set the S3 bucket to public-read

D) Store credentials in Secrets Manager and retrieve by key

**정답: B**

해설: When EC2 calls an API, receive temporary credentials automatically via an **IAM Role (instance profile)** instead of hardcoding keys, and **enforce IMDSv2** to block the path by which an SSRF attack steals metadata credentials (the 2019 Capital One incident was the IMDSv1 + SSRF combination). A risks key exposure, C exposes all data, and D still requires separate key management, weaker than the Role approach. "EC2 → API = IAM Role + IMDSv2" is a security-domain regular answer.

---

**문제 6.** A company wants to **automatically and periodically rotate** the master password of RDS PostgreSQL. What is the appropriate service?

A) Systems Manager Parameter Store

B) AWS Secrets Manager

C) AWS KMS

D) IAM database authentication

**정답: B**

해설: **Secrets Manager** stores secrets and has built-in **Lambda-based automatic rotation**, periodically auto-replacing RDS/Redshift/DocumentDB passwords. Parameter Store (A) can store SecureStrings but has no automatic rotation (simpler, cheaper). KMS (C) is encryption-key management, not secret rotation, and IAM DB authentication (D) is token-based access, not a password-rotation mechanism. When the "automatic rotation" signal word appears, go straight to Secrets Manager.

---

**문제 7.** A startup stores data in S3 with an **unpredictable access pattern** and no staff to manage classes manually. To optimize cost automatically?

A) S3 Standard

B) S3 Intelligent-Tiering

C) S3 Glacier Deep Archive

D) S3 One Zone-IA

**정답: B**

해설: **S3 Intelligent-Tiering** monitors per-object access patterns and **automatically moves to the appropriate tier**, optimizing cost automatically when the pattern is unknown or there's no management staff (bearing only a small monitoring fee). A is over-cost for infrequently viewed data, C is for long-term rarely-retrieved archival (large retrieval latency), and D is for single-AZ storage of regeneratable data, unsuited to "unknown pattern." "Unknown access pattern = Intelligent-Tiering" is an overwhelming regular.

---

**문제 8.** A company wants to connect 50+ VPCs and an on-premises data center via **routing from a central hub**. It wants to avoid VPC Peering's N² complexity. What is the appropriate service?

A) VPC Peering mesh

B) AWS Transit Gateway

C) Internet Gateway

D) VPN only

**정답: B**

해설: **Transit Gateway** is a cloud router that **routes many VPC and on-premises connections from a single hub**, simplifying VPC Peering's N×(N-1)/2 full-mesh complexity into hub-and-spoke. A Peering mesh (A) needs 1000+ connections for 50 VPCs, unmanageable; C is an internet gateway, irrelevant to internal routing; and VPN alone (D) can't be a VPC-to-VPC routing hub. "Many VPCs + on-prem + central hub routing" = Transit Gateway.

---

**문제 9.** A team wants to grant S3-access IAM permission only to a **specific Pod** in an EKS cluster, applying per-Pod least privilege rather than the whole node. What is the appropriate method?

A) Grant permission to the EC2 node's Instance Profile

B) IRSA (IAM Roles for Service Accounts)

C) Inject access keys into the Pod

D) Use a KMS Grant

**정답: B**

해설: **IRSA (IAM Roles for Service Accounts)** links a Kubernetes ServiceAccount to an IAM Role to grant **per-Pod least-privilege** IAM (based on OIDC federation). An Instance Profile (A) makes all Pods on the node share the same permission, violating least privilege; C is key hardcoding, a security anti-pattern; and a KMS Grant (D) delegates encryption keys, not Pod IAM. "Per-Pod EKS IAM" = IRSA is the answer.

---

**문제 10.** A global SaaS wants to deliver static web content worldwide at low latency while ensuring the origin S3 bucket is accessed **only through CloudFront, with no direct public exposure**. What is the correct configuration?

A) Open S3 static website hosting to public

B) CloudFront + OAC (Origin Access Control) + S3 Block Public Access

C) Serve static files with ALB + EC2

D) Serve directly via a Lambda function URL

**정답: B**

해설: The **CloudFront + OAC (Origin Access Control)** configuration keeps the S3 bucket **private with Block Public Access** while letting only CloudFront access the origin through OAC-signed requests — satisfying global low latency (edge caching) + origin non-exposure simultaneously. A opens the bucket directly to public with high exposure risk, C is over-infrastructure for static content, and D lacks the global caching benefit. "Global caching + private S3 origin" = CloudFront + OAC is the current standard (the successor to the former OAI).

---

**문제 11.** To cut cost, a company wants to apply the maximum discount to an **EC2 workload running steadily 24/7** (fixed to a specific family). No refund is needed. What is the appropriate commitment?

A) On-Demand

B) EC2 Instance Savings Plan

C) Spot Instance

D) Compute Optimizer

**정답: B**

해설: An **EC2 Instance Savings Plan** commits to a specific instance family/region in exchange for the **highest discount rate (up to 72%)**, optimal for a family-fixed 24/7 workload. The more flexible Compute SP has a lower discount rate, so for "specific family, maximum discount" the EC2 SP fits. A is the most expensive, C is for interruptible workloads (unsuited to stable 24/7 operation), and D is not a discount commitment but a right-sizing recommendation tool. "Specific family fixed + maximum discount" = EC2 SP.

---

**문제 12.** An operations team wants to **loosely couple multiple microservices** so that even if one service goes down messages aren't lost, and to buffer against traffic spikes. What is the appropriate service?

A) Amazon SQS

B) Direct HTTP calls (synchronous)

C) Amazon Kinesis Data Streams

D) AWS Step Functions

**정답: A**

해설: **SQS (Simple Queue Service)** places a message queue between components to provide **loose coupling (decoupling)** — even if a consumer goes down, messages remain in the queue and aren't lost, and on a traffic spike the queue acts as a **buffer** to protect downstream. Synchronous calls (B) propagate one service's failure immediately and have no buffer. Kinesis (C) is for streaming/replay, over-spec for a simple task queue, and Step Functions (D) is workflow orchestration, not a message buffer. "Decoupling + message-loss prevention + buffer" = SQS is the key signal.

---

## 📌 Pre-Exam Message

You've come this far through 12 weeks. There are just four things to remember in the exam room.

First, **translating scenario signal words into services** is the essence of SAA — recognize them as chunks, like "microsecond → DAX," "UDP acceleration → Global Accelerator," "automatic rotation → Secrets Manager." Second, keep the **2-minute rule** — flag a stuck question, move on, and revisit. Since every question is worth the same and unscored questions are mixed in, securing the easy questions is statistically more favorable than fixating on the hard ones. Third, **qualifiers** ("most cost-effective," "least operational burden," "default," "shared responsibility") flip the answer — don't miss them. Fourth, **don't change your first answer without certainty**.

Grasp the four domains along the four axes — "security → IAM/KMS/WAF," "resilience → Multi-AZ + 4 DR tiers," "high performance → CDN/Cache/right service," "cost → SP/Spot/Intelligent-Tiering" — and 80% is solved. For the rest, return to Well-Architected principles (eliminate single points of failure, automate, elasticity) and judge from there.

**Fighting!! Wishing you a pass.**
