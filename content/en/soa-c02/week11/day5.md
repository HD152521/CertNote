# Day 5 - Week 11 Database Operations Summary

Week 11 covered database management: RDS operations (backups, failover), performance optimization, scaling strategies, migration/replication, patching windows, availability architecture. Multi-AZ for HA, replicas for scaling, automated backups for recovery, DMS for migration.

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
