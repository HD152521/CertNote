# Day 2 - Startup Serverless-First Architecture — Cost-Zero Scaling, No Ops Overhead, Function Composition Limits

[WEEK 15 DAY 2 COMPREHENSIVE SCENARIO: SERVERLESS STARTUP FROM $0 TO 100X]

Extreme opposite of Day 1 enterprise: 3-person startup, $0 cloud budget, viral growth risk, zero ops team. Pro design here means **pure serverless-first**—Lambda, DynamoDB, API Gateway, S3—every choice optimized to avoid provisioning.

Core principles:
- **Consumption model**: Pay only for invocations/GB-months, autoscale to infinity
- **No cold start killers**: Provisioned concurrency, reserved capacity where needed
- **Function composition**: Lambda→SQS→Lambda pipelines, not monoliths
- **DynamoDB on-demand**: Autoscale throughput, pay-per-request

Example architecture: HTTP request → API Gateway → Lambda → DynamoDB on-demand → S3 → SNS → Lambda async processor. Every component scales from 0 to millions without operator touch.

Gotchas:
- Lambda timeout 15 min—can't run long batch
- DynamoDB on-demand costlier at scale than provisioned
- Cold starts matter under 50ms SLA (need provisioned concurrency)
- Cross-AZ DynamoDB consistency window ~1ms (eventual, not strong)

Scenarios: "SaaS landing page with no ops", "user uploads trigger batch resize", "viral spike from 0 to 1M requests/day"—all serverless-first wins.

SAP mappings: (1) "Cost $0 ramp→scale 100x" → **Serverless(Lambda+DDB)**, (2) "No ops, no capacity planning" → **Managed services**, (3) "Pay-per-request" → **DynamoDB on-demand**, (4) "Async jobs, no orchestration" → **SQS+Lambda**, (5) "Global CDN, zero origin calls" → **CloudFront+S3**.

---

## 📝 Practice Questions

**Question 1.** An architecture for a startup that starts with a $0 initial budget and scales automatically if it grows virally.

A) EC2 Auto Scaling Group
B) Serverless: Lambda + DynamoDB On-Demand + API Gateway
C) RDS + Auto Scaling replicas
D) Single-instance monitoring

**Answer: B**

Explanation: Serverless follows a consumption model where you pay only per invocation, and automatic scaling withstands millions of requests without operations work. A incurs the cost of holding EC2 nodes, C incurs RDS provisioning costs, and D is a single point of failure. "Initial $0 + automatic scaling" is the direct answer for serverless.

---

**Question 2.** A Lambda function needs long-running batch processing.

A) Set the Lambda timeout to 1 hour
B) Orchestrate with Step Functions + split into 15-minute Lambda pieces
C) Run the long job on EC2 Spot
D) RDS stored procedure

**Answer: B**

Explanation: The maximum Lambda timeout is 15 minutes. For long runs, split the work by invoking Lambda multiple times with Step Functions. A ignores the Lambda constraint, C increases cost, and D burdens the DB.

---

**Question 3.** Minimize DynamoDB charges.

A) On-Demand by default
B) Provisioned + Auto Scaling
C) On-Demand for low load, Provisioned for high load
D) DynamoDB Accelerator (DAX) is mandatory

**Answer: B**

Explanation: If the load is predictable, Provisioned is cheaper; if it is unpredictable, On-Demand. The Pro approach is for an early-stage startup to begin with On-Demand and switch to Provisioned after seeing the pattern. DAX is an additional cost and unnecessary at the start.

---

**Question 4.** Automatically generate thumbnails when a viral video is uploaded.

A) Synchronous Lambda POST /upload response
B) S3 upload → S3 event → asynchronous Lambda processing
C) EC2 batch cron
D) Manual user request

**Answer: B**

Explanation: Event-driven asynchronous processing does not affect the user experience and scales automatically for spikes. A hits the 15-minute timeout, and C adds operational burden. "Automatic processing after upload" is S3 event → Lambda.

---

**Question 5.** Global content delivery with minimal load on the origin server.

A) Use the EC2 origin server directly
B) S3 + CloudFront CDN
C) RDS replication
D) Synchronous API Gateway

**Answer: B**

Explanation: CloudFront caches at the edge, so requests to the S3 origin are reduced dramatically. "Minimal latency + minimal load" is the essence of a CDN.

---

**Question 6.** Why should a startup avoid a microservices architecture at the beginning?

A) Complex networking
B) Operational overhead and a small early team
C) High cost
D) Cannot scale

**Answer: B**

Explanation: For an early team of three, operating microservices (deployment, monitoring, and logging for each) is unrealistic. The Pro approach is to start with a monolith and break it apart when scaling problems appear. It is an implementation of "YAGNI: don't build what you don't need right now."
---

**Question 7.** A seed-stage SaaS has almost no traffic at night but highly variable traffic during the day. It wants compute cost to be exactly proportional to usage and to drop to zero when there is no traffic. Which compute option is most appropriate?
A) EC2 t3.micro running 24/7
B) AWS Lambda
C) ECS on EC2 (always-on cluster)
D) EC2 Auto Scaling (min 1)

**Answer: B**

Explanation: Lambda runs only when there are requests and is billed per invocation plus execution time (GB-seconds), so when traffic is 0 the cost is also 0, and cost tracks usage linearly. A, C, and D all keep at least one instance running at all times and incur idle cost (in particular, an ASG with min 1 keeps one instance even at zero traffic). In the early startup stage, this idle cost raises the burn rate. Trap: "cost is 0 when traffic is 0" is the direct signal for serverless (Lambda).

---

**Question 8.** A production workload needs a relational database, has highly variable usage, and wants seamless per-second scaling. Which is the most appropriate choice?
A) RDS Provisioned (fixed instance)
B) Aurora Serverless v2
C) Aurora Serverless v1
D) DynamoDB

**Answer: B**

Explanation: Aurora Serverless **v2** scales **seamlessly (in-place) per second** in 0.5 ACU increments, which suits production workloads with large variability. **v1** in C has a temporary pause when scaling, slower scaling, and cold start latency, so it is inferior to v2 for handling production variability. This v1/v2 distinction is the key trap. A has fixed capacity and is inefficient for variable load. D is NoSQL and does not fit the premise "a relational database is needed." Trap: "relational + production + variable" is Aurora Serverless v2.

---

**Question 9.** After a 100x traffic surge, Lambda frequently hits "too many connections" errors when connecting to RDS. What is the most appropriate solution?
A) Increase the RDS instance size
B) Introduce connection pooling with RDS Proxy
C) Increase Lambda memory
D) Increase the Lambda timeout

**Answer: B**

Explanation: Lambda opens a DB connection for every concurrently running instance, so during a surge thousands of connections exceed the RDS connection limit. This is the classic case of serverless getting blocked at the weakest link downstream. **RDS Proxy** pools and reuses connections, greatly reducing the number of actual DB connections and solving this problem. A relieves it partially but is not a root fix and is expensive. C and D are unrelated to the number of connections. Trap: "Lambda + RDS + connection explosion when scaling" is RDS Proxy.

---

**Question 10.** After growing 100x, Lambda and Fargate costs have reached tens of thousands of dollars per month. The company wants to cut cost with a commitment discount while keeping the serverless architecture, and also wants the flexibility to change instance families and Regions. Which is the most appropriate?
A) EC2 Instance Savings Plans
B) Compute Savings Plans
C) Standard Reserved Instances
D) Spot Instances

**Answer: B**

Explanation: **Compute Savings Plans** cover not only EC2 but also **Fargate and Lambda**, and are the most flexible commitment model, applying regardless of Region, instance family, and OS. You get a commitment discount (up to about 66%) while leaving the serverless architecture as is. EC2 Instance SP in A and RI in C apply **only to EC2** and cannot cover Lambda or Fargate. Spot in D is not a commitment discount but interruptible spare capacity, so it is a different kind of option. Trap: "reduce Lambda and Fargate cost + flexibility" is the direct answer of Compute SP.

---

**Question 11.** A GitHub Actions pipeline must deploy to AWS. The security team requires that no long-term access keys be stored anywhere. What is the most appropriate method?
A) Store IAM User access keys in GitHub Secrets
B) Assume an IAM Role through OIDC federation (keyless)
C) Create a shared IAM User for the team to share
D) Store the access keys in SSM Parameter Store

**Answer: B**

Explanation: GitHub Actions can issue an **OIDC (OpenID Connect)** token, and by assuming an IAM Role whose trust policy is configured for it (AssumeRoleWithWebIdentity), you deploy with short-term credentials **without long-term access keys**. The token is valid only for the duration of the workflow run and expires automatically, which fundamentally eliminates the risk of leakage. A, C, and D are all anti-patterns that store long-term keys somewhere, which exposes permanent privileges if leaked and creates a heavy rotation burden. Trap: "external CI + no long-term keys" is OIDC + IAM Role.

---

**Question 12.** A DynamoDB table has plenty of capacity overall, but throttling occurs only on a specific partition key. Which statement about the cause and solution is most accurate?
A) Insufficient capacity for the whole table; increase capacity
B) A hot partition; redesign the partition key to distribute evenly (write sharding)
C) A missing GSI; add an index
D) A Region outage; move to another Region

**Answer: B**

Explanation: DDB distributes data by the hash of the partition key, and when traffic concentrates on a specific key, it is blocked by the **throughput limit of that partition (about 3,000 RCU / 1,000 WCU)** and throttled, even if the table as a whole has headroom. This is the hot partition problem. The solution is write sharding, which adds a distribution factor to the partition key (such as a date plus a random suffix) to spread traffic evenly across multiple partitions. A is ineffective because the overall capacity is not the problem. C and D are unrelated to the nature of the throttle. Trap: "throttling on only some keys" is a hot partition, not insufficient capacity.

---

**Question 13.** You know that synchronous API traffic will spike to 100x instantly because of a marketing campaign. You are worried about Lambda concurrency throttling and protecting downstream resources. Which buffering design is most appropriate?
A) Remove API Gateway and expose Lambda directly
B) Receive requests in SQS and have Lambda consume them at its own pace (buffer and decouple)
C) Set Lambda memory to the maximum
D) Replace DynamoDB with RDS

**Answer: B**

Explanation: If you accept a synchronous surge as is, the Lambda concurrency limit and downstream resources collapse at the same time. **Buffering requests in SQS** lets the queue absorb the surge and Lambda consume at its own processing speed (decoupling), so requests are handled smoothly without loss. This is the classic buffer and decouple pattern. A removes the protection layer and becomes more vulnerable. C is unrelated to concurrency and downstream issues. D moves to RDS, which has connection limits, and makes things worse. Trap: "absorbing a predicted surge" is SQS buffering.

---
---