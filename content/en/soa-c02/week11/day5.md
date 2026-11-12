# Day 5 - Week 11 Review: Cost and Performance Operations as a Single Decision Flow

The tools covered in Week 11 — Compute Optimizer, Trusted Advisor, Cost Explorer, Budgets, Savings Plans, Spot — look separate on their own, but in practice they connect into one flow. Cost optimization is not about pulling out tools at random; it is a **pipeline with an order**. First you match the size of the container (Right Sizing), then you cut the stable usage with a commitment, then you handle the variable portion with Spot, and finally you analyze, control, and check all of it. If you reverse this order — for example, committing before Right Sizing — you make the expensive mistake of committing to the wrong size for three years.

This note organizes Week 11 along two axes. The first is compressing each tool's role into one sentence and cementing the "exam keyword → correct service" mapping; the second is seeing how the tools are woven into a single decision flow. After that, 12 practical scenario questions check your intuition. On the exam, cost and performance questions usually take the form "pick the single tool best suited to this situation," and that choice comes down to knowing each tool's **unique domain** precisely.

## Week 11 One-Sentence Summary and Keyword Mapping

| Day | Core tool | One sentence |
|-----|-----------|--------------|
| Day 1 | **Compute Optimizer** | Analyzes 14 days of metrics with ML and recommends Right Sizing for EC2/ASG/EBS/Lambda |
| Day 2 | **Trusted Advisor** | Automatically checks best practices across five categories (cost/performance/security/fault tolerance/limits) |
| Day 3 | **Cost Explorer / Budgets / Tag** | Multi-dimensional cost analysis, budget control, and tag-based allocation |
| Day 4 | **SP / RI / Spot** | Commitment discounts for the stable baseline, Spot for the stateless variable portion |

The exam distinguishes tools by situational keywords. This mapping is the core.

| Exam keyword | Answer |
|--------------|--------|
| "Recommend instance/volume size", "right sizing", "identify over-provisioned" | Compute Optimizer |
| "Automatically check cost, performance, security, and fault tolerance at once" | Trusted Advisor |
| "Warn when a service limit (quota) reaches 80%" | Trusted Advisor Service Limits |
| "Break down and visualize cost by service, account, or project" | Cost Explorer |
| "Group cost by team/project" | Cost Allocation Tag + Cost Explorer |
| "Automatically block when a budget threshold is reached (EC2 stop, IAM/SCP)" | AWS Budgets + Budgets Action |
| "Cost spikes abnormally versus the usual pattern (ML detection)" | Cost Anomaly Detection |
| "Raw data per hour/resource + SQL analysis" | CUR + Athena |
| "Commitment free of family/Region", "workload fluctuates" | Compute Savings Plans |
| "Fixed to a specific family, maximum discount" | EC2 Instance SP / Standard RI |
| "RDS, Redshift, ElastiCache commitment" | Reserved Instances (SP not supported) |
| "Stateless batch, tolerates interruption, maximum discount" | Spot + capacityOptimized |
| "Handle the 2-minute Spot interruption notice" | EventBridge → Lambda / Lifecycle Hook |
| "Guarantee capacity in a specific AZ (not a discount)" | EC2 Capacity Reservation |
| "AWS-side host retirement/maintenance notification" | Personal Health Dashboard |
| "Check actual usage rate/coverage ratio of commitments" | Cost Explorer Utilization / Coverage |

> 💡 **Related theory**: The foundation of this tool classification is the operational **OODA loop** (Observe-Orient-Decide-Act). Observation (Observe) is handled by CloudWatch, Cost Explorer, and CUR; judgment (Orient) by Compute Optimizer, Trusted Advisor, and Anomaly Detection; decision (Decide) by purchasing commitments and changing families; and action (Act) by Budgets Action, Spot interruption handling, and automatic recovery. Instead of memorizing tools by function, if you classify them as "is this observation, judgment, or action?", the answer for any given situation narrows down naturally. For example, the distinction between "only detects and cannot block" (Anomaly Detection) and "actually blocks" (Budgets Action) is exactly the difference between Orient and Act.

## The Right Order of Cost Optimization — Why Right Sizing Comes First

Knowing the cost optimization tools is different from **applying them in the right order**. If the order is wrong, the savings are halved or you even take a loss.

```
Step 1 ─ Right Sizing (match the container size)
        Compute Optimizer recommendations → downsize, change family
        gp2 → gp3, io1 → gp3 migration
        ※ Must come first! Committing to a wrong size locks in the wrong cost for 3 years

Step 2 ─ Commitment discounts (cut the stable baseline)
        24/7 always-on workloads 60~70% → Compute SP 3-year
        Only for the minimum usage that never drops

Step 3 ─ Variable workloads (On-Demand + Spot)
        Hard-to-predict variable portion → On-Demand 20~30%
        Stateless, tolerates interruption → Spot 10~20% (capacityOptimized)

Step 4 ─ Continuous monitoring (observe and control)
        Cost Explorer analysis / Budgets control / Anomaly detection
        Check SP/RI Utilization and Coverage
```

**The reason Step 1 must come first** is that commitments are irreversible. Suppose an m5.4xlarge is actually fine as an m5.large. If you place a 3-year Standard RI on this large instance without Right Sizing, then even if you want to downsize after a year, you are tied to the commitment and cannot reduce it. The proper order is to find the right size first, then place the commitment on the baseline of that right size. A commitment is the last step that discounts the "already optimized size," not the first step.

> ⚠️ **Pitfall**: Besides reversing the order of Right Sizing and commitments, another common mistake is "committing above the baseline." If you commit to match the peak of a workload whose traffic fluctuates, you pay for a large part of the commitment without using it during the troughs (low Utilization). Always place commitments only on the "floor line of the graph (the part that never shrinks)" and support everything above it with On-Demand and Spot. On the exam, for "highly variable workload + cost savings," a full-commitment Standard RI is likely a wrong answer, and the combination of Compute SP (baseline) + Spot (variable) is the right direction.

## Frequently Confused Boundaries — The Distinctions the Exam Targets

Most exam questions in the cost and performance area ask you to pick "one of two similar-looking tools." Here are the key boundaries.

**Detection vs blocking**: Cost Anomaly Detection **detects and notifies** about abnormal cost with ML but cannot stop the cost. The only thing that actually **blocks** is Budgets Action (EC2 stop, IAM/SCP). If the keyword is "block automatically," it is Budgets Action; if it is "notice the abnormality," it is Anomaly Detection.

**Fixed threshold vs pattern anomaly**: Budgets notifies you when a fixed threshold such as "$5,000 per month" is crossed. Cost Anomaly Detection catches outliers versus the usual pattern. A sudden spike within the threshold is something Budgets cannot catch and Anomaly Detection can — they are complementary.

**Right Sizing recommendation vs best-practice check**: Compute Optimizer produces precise per-instance sizing recommendations. Trusted Advisor is a coarse best-practice check across the account. "Reduce which instance to which type" is Compute Optimizer; "overall cost, security, and fault-tolerance check" is Trusted Advisor.

**Discount vs capacity guarantee**: SP/RI are discounts and do not guarantee capacity. Capacity Reservation is a capacity guarantee and is not a discount. If it says "must be able to launch," it is Capacity Reservation; if it says "cheaply," it is SP/RI.

**My configuration vs an AWS-side event**: Trusted Advisor looks at problems in my account's configuration; Personal Health Dashboard looks at events on the AWS side (retirement, maintenance).

**Quick summary vs raw data**: Cost Explorer is a quick pre-aggregated summary (console); CUR is raw data at hour/resource level (S3 + Athena with arbitrary SQL).

The fundamental reason these boundaries exist is that each tool is optimized for **a different data resolution and a different time of operation**. Cost Explorer is pre-aggregated at day/hour level, so it is fast but coarse, while CUR is raw at resource/hour level, so it is precise but heavy. Anomaly Detection is asynchronous ML inference, so it is strong at detection but cannot block in real time, while Budgets Action is based on threshold triggers, so it blocks immediately but cannot see patterns. When memorizing tools, if you ask "what resolution of data does this process, and at what point in time?", you can see why each tool is good at only its job — the reason no single tool does everything is the trade-off between data resolution and latency.

## Commitment Check Metrics — What Utilization and Coverage Mean

Buying a commitment (SP/RI) is not the end. Workloads change, so you must **continuously check** whether the commitment is still appropriate, and the core metrics for that are Cost Explorer's **Utilization** and **Coverage**. Confusing these two leads to wrong decisions.

- **Utilization**: The share of purchased commitment that was actually used and earned a discount. At 90%, you are using 90% of the commitment; at 60%, you are throwing away 40% (over-commitment). **If low, you should reduce the commitment.**
- **Coverage**: The share of total On-Demand-eligible usage that the commitment covers. At 50%, half of your usage is still being paid at the list price (On-Demand). **If low, there is room to commit more** (an additional savings opportunity).

You must look at both together — if Coverage is low and Utilization is high, "you would use it all even if you bought more," so an additional commitment is safe. If Coverage is high but Utilization is low, you are already over-committed, so you must not buy more.

According to industry surveys by the FinOps Foundation, the major sources of cloud cost waste are (1) idle resources that were not turned off and (2) wrongly purchased commitments. Many organizations, thinking "committing is always cheaper," bought large quantities of RIs to match peak usage, and then suffered failures where, after the workload shrank or the family changed, Utilization fell below 50% — the unused commitments became more expensive than On-Demand. From this lesson, the industry made "conservative commitment + regular Utilization/Coverage checks" the standard, and AWS also released Convertible RIs and the flexible Compute SP to ease the rigidity of commitments. A commitment is not something to be done at the moment of purchase but something to be managed during operation.

## Summary

The Week 11 tools implement the operational loop of "observe → judge → decide → act" in the cost and performance area. Whether on the exam or in practice, the key is each tool's unique domain and the order that ties them together.

Compressed into five points: (1) Compute Optimizer = Right Sizing recommendations (14 days of metrics, memory requires the Agent), Step 1 of cost optimization. (2) Trusted Advisor = best-practice checks in five categories (the full set requires Business+ Support, limits get an advance warning at 80%). (3) Cost Explorer (multi-dimensional analysis) + Budgets (blocking via Action) + Tag (allocation, activation is not retroactive) + Anomaly Detection (ML detection, not blocking). (4) Commitments only on the baseline (Compute SP flexible / EC2 Instance SP and Standard RI locked in / RDS and Redshift use RI), checked with Utilization and Coverage. (5) Spot is only for stateless, interruption-tolerant workloads (capacityOptimized, handle the 2-minute notice), and Capacity Reservation is a capacity guarantee, not a discount. Applying them in this order — Right Sizing → commitments → Spot → monitoring — is the textbook approach to cost optimization.

---

## 📝 Scenario Practice Questions (Week 11 Comprehensive, 12 Questions)

**Question 1.** A company operates 200 EC2 instances and wants to know precisely, per instance, which instances are over-provisioned. Which tool is most suitable?

A) Display per-instance CPU and memory graphs on a CloudWatch Dashboard and have operators manually identify over-provisioned instances
B) Compute Optimizer: analyzes the percentile distribution of 14 days of metrics with ML and presents Over/Under/Optimized per instance along with a recommended type
C) Use the Trusted Advisor Performance category to check for underutilized instances across the account against best practices
D) Break down cost by instance type in Cost Explorer and assume the instances with high spend are over-provisioned

**Answer: B**

Explanation: Precise per-instance sizing recommendations are the unique domain of Compute Optimizer. It learns from the distribution of 14 days of metrics such as CPU and network with ML, classifies each instance as Over/Under/Optimized, and presents the type to downsize to along with the expected savings. Trusted Advisor (C) is a coarse, account-wide best-practice check, so its per-instance recommendations are weak, and Cost Explorer (D) is an analysis tool, not a recommendation tool. Note that for workloads that need memory metrics, installing the CloudWatch Agent determines the accuracy of the recommendations.

---

**Question 2.** An operations team sets a $5,000 monthly budget and wants a notification at 80% and automatic stopping of some EC2 instances at 100%, without human intervention.

A) Monitor monthly spend in Cost Explorer and have an operator manually stop EC2 instances once it exceeds 80%
B) AWS Budgets + Budgets Action (80% notification; at 100%, stop EC2 or attach an IAM Deny)
C) Detect cost surges with Cost Anomaly Detection and automatically stop EC2 after an SNS notification
D) Set a CloudWatch Alarm on the billing metric (EstimatedCharges) and stop EC2 with Lambda when the threshold is reached

**Answer: B**

Explanation: Only Budgets Action can perform automatic blocking that actually "stops" cost. When a threshold is reached, it can automatically stop EC2/RDS, attach an IAM Deny policy, or apply an SCP. The typical setup is an FORECASTED or ACTUAL notification for 80% and an ACTUAL blocking Action for 100%. Cost Anomaly Detection (C) only detects and notifies and cannot block, and Cost Explorer (A) only analyzes.

---

**Question 3.** A company wants to track the costs of the CloudOps team and the DevOps team separately. What is the lightest-weight method?

A) Create a separate AWS account for each team and separate the costs per account with Organizations consolidated billing
B) Assign a `Team` tag to resources + activate the Cost Allocation Tag + Cost Explorer Group by Tag
C) Create a Budget for each team and track each team's cost separately per budget
D) Download the CUR to S3 and manually analyze cost per team daily with Athena or a spreadsheet

**Answer: B**

Explanation: The standard for allocating cost per team is tag-based. Attach a `Team` tag to resources, explicitly activate that key as a Cost Allocation Tag (do it early because it is not retroactive), and then view it in Cost Explorer with Group by Tag. Separating accounts (A) is an excessive change, and tags are the lightest option. Note that past data from before activation is not grouped, it takes 24-48 hours after activation, and resources missing tags fall into untagged, so enforcing tags with a Tag Policy improves accuracy.

---

**Question 4.** A company will run EC2 stably for the next 3 years, but it changes families and Regions often. How can it get the maximum discount without code changes?

A) Standard RI for 3 years: commit to a specific instance family for the maximum discount and repurchase the RI when the family changes
B) Compute Savings Plans for 3 years: apply automatically to all Regions, families, and EC2/Fargate/Lambda up to the committed amount
C) Run On-Demand, keeping the freedom to change families and Regions but giving up the discount
D) Run on Spot to get up to a 90% discount, with automatic replacement by another family when reclaimed

**Answer: B**

Explanation: Compute SP commits to hourly spend rather than to instances, so the commitment follows even when you change families or Regions. Standard RI (A) gives a larger discount but is tied to a specific type, so the commitment becomes useless when the family changes. If you need commitment flexibility in a variable environment, Compute SP is the answer. On-Demand (C) has no discount, and the reclamation risk of Spot (D) is unsuitable for stably operated workloads.

---

**Question 5.** A company runs an EMR batch on 100 nodes only at night. It is stateless, and if instances are reclaimed the job can be rerun. What minimizes cost?

A) 100 On-Demand instances launched at list price for each nightly batch and terminated afterward, operating flexibly without a commitment
B) 100 Standard RIs on a 3-year commitment to apply the maximum discount to the batch nodes
C) Spot Fleet + capacityOptimized: the best fit for stateless, interruption-tolerant batch, with up to a 90% discount plus stability
D) Compute Savings Plans committing to the nightly batch's hourly spend to get a discount

**Answer: C**

Explanation: Stateless, interruption-tolerant, distributable batch is the textbook target for Spot. With capacityOptimized you take instances from pools with more spare capacity to reduce reclamation while getting up to a 90% discount. RI (B) and SP (D) are for 24/7 always-on workloads, so for a job that runs only at night most of the commitment goes unused and is wasted, and On-Demand (A) is list price.

---

**Question 6.** A company wants to receive an automatic warning when the limit (quota) of any AWS service approaches 80%.

A) Publish per-service usage directly as CloudWatch Custom Metrics and manually configure an 80% threshold alarm
B) Trusted Advisor Service Limits + EventBridge notification (Business+ Support)
C) Track the number of resources of each service with a Config Rule and evaluate whether usage exceeds 80% of the limit
D) Periodically check the usage rate of each quota manually in the Service Quotas console

**Answer: B**

Explanation: The Service Limits check in Trusted Advisor automatically checks when a limit reaches 80%, and EventBridge automates the notification. Because limits do not increase automatically, the key is to receive the 80% early warning and request an increase in advance through Service Quotas. Note that full Trusted Advisor requires Business or higher Support. Some quotas can also have alarms set through the CloudWatch `AWS/Usage` namespace.

---

**Question 7.** One day a company's cost jumped to 3 times its usual pattern. It did not exceed the fixed budget threshold. How can this kind of anomaly be detected automatically?

A) Set many finely divided monthly fixed thresholds in AWS Budgets so that a deviation from the pattern is caught as a threshold breach
B) Cost Anomaly Detection: learns the usual pattern with ML and detects statistical outliers
C) Use the Trusted Advisor Cost category to check for wasted resources and find the cause of the cost surge
D) Set a CloudWatch Alarm on the billing metric (EstimatedCharges) to detect a surge compared with usual

**Answer: B**

Explanation: Budgets alerts only when a fixed threshold (monthly $X) is exceeded, so it cannot catch a sudden spike within the threshold. Cost Anomaly Detection learns the cost pattern with ML and catches outliers compared with the usual, so it alerts on abnormal spikes even when no fixed threshold is crossed. The two are complementary, and Anomaly Detection detects and notifies; it does not block.

---

**Question 8.** A company wants to secure the ability to always launch new m7i instances immediately in a specific AZ for BCP. The goal is availability, not cost savings.

A) Standard RI (gives a discount but does not guarantee capacity)
B) EC2 Capacity Reservation: secures capacity in a specific AZ; the discount is separate (combine with SP/RI)
C) Secure capacity in that AZ in advance with Spot and immediately re-request if reclaimed
D) Launch On-Demand instances in advance for BCP, keep them in a stopped state, and start them when needed

**Answer: B**

Explanation: A Capacity Reservation buys the guarantee that "an instance can definitely be launched at that moment"; its purpose is a capacity guarantee, not a discount. Its exact use cases are AZ capacity shortages for new types and guaranteeing immediate availability for DR. SP/RI (A) are only discounts and do not guarantee capacity, and Spot (C) can be reclaimed, so it is the opposite of availability. If you also want a discount, combine SP/RI with the Capacity Reservation.

---

**Question 9.** A company runs RDS PostgreSQL 24/7 and wants a commitment discount.

A) Compute Savings Plans committing to hourly spend, applying the discount to RDS instances as well
B) EC2 Instance Savings Plans committing to a specific instance family to discount compute including RDS
C) Reserved Instances (RDS RI)
D) Launch the RDS instance on Spot to get the maximum discount, while preparing for reclamation

**Answer: C**

Explanation: Savings Plans apply only to EC2/Fargate/Lambda. RDS, Redshift, ElastiCache, and OpenSearch have no SP, so you commit with each service's Reserved Instances. For a DB that runs stably 24/7, RDS RI is the answer. Spot (D) is unsuitable for a stateful DB.

---

**Question 10.** A company wants to automatically identify candidates for migrating gp2 to gp3 to reduce EBS cost.

A) Query the type and IOPS of every volume with the CLI and manually select gp2 volumes in a spreadsheet
B) Compute Optimizer EBS Volume recommendations + the Trusted Advisor Cost category
C) Break down EBS cost by volume type in Cost Explorer and assume volumes with high gp2 spend are candidates
D) Mark gp2 volumes as noncompliant with a Config Rule to generate a list of migration candidates

**Answer: B**

Explanation: Compute Optimizer analyzes EBS volumes and recommends gp3 conversion candidates with the expected savings, and the Trusted Advisor Cost category also detects over-provisioned/idle EBS. gp3 is about 20% cheaper per GB, guarantees IOPS and throughput independently of size, and can be converted without downtime with `modify-volume`. These two tools are the standard for identifying candidates.

---

**Question 11.** The Cost Explorer Utilization of a Compute SP that a company purchased a year ago is a low 55%. What does this mean, and what action should be taken?

A) It is a signal that the commitment is insufficient, so increase the baseline and buy additional SP to widen the discount scope
B) It is over-committed: 45% of the commitment is going unused and wasted, so scale the next commitment down to match the baseline that never drops
C) The situation is low Coverage rather than Utilization, so buy more commitment to cover the usage still paid at On-Demand
D) Utilization fluctuates a lot over time and is an unreliable metric, so judge by Coverage only

**Answer: B**

Explanation: Utilization is the proportion of the purchased commitment that was actually used and benefited from the discount. At 55%, it is over-commitment: you pay for 45% of the commitment without using it. SP and RI are use-it-or-lose-it, so the money goes out even if unused; you underestimated the variability and committed above the baseline. The action is to scale the next commitment down to match the minimum usage (baseline). Only when Coverage (the proportion covered by commitments) is low is there room for additional commitment; the two must not be confused.

---

**Question 12.** An operations team's API server running on a t3.large has steadily growing traffic, response times drop sharply every afternoon, and the CPU hits a ceiling at a certain value. What is the correct action considering both cost and performance?

A) Enlarge the instance to t3.2xlarge
B) The cause is CPU credit exhaustion, so change to an m/c family (e.g., m6i) suited to steady load and confirm the right size with Compute Optimizer
C) Change the volume to gp3
D) Switch to Spot

**Answer: B**

Explanation: The T family is a burstable model that can burst above baseline only with accumulated CPU credits; when a load that steadily exceeds baseline is applied, the credits are exhausted and the instance is held to baseline, so the CPU hits a ceiling, which is the classic cause of a sharp drop in performance every afternoon. Enlarging within the same T family (A) only gives larger credits, is not a fundamental fix, and raises cost. For steady operational load, the m/c families, where baseline is the full performance, are the standard choice, and confirming the right size with Compute Optimizer avoids over- and under-provisioning. Right Sizing (correcting the family) is the key.

---

## Next: Week 12 Enterprise Operations

---
