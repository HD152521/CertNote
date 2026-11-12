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