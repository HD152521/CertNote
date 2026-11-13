# Day 5 - Week 11 Review: Cost and Performance Operations as One Decision Flow

The tools covered in Week 11 - Compute Optimizer, Trusted Advisor, Cost Explorer, Budgets, Savings Plans, Spot - look separate on their own, but in practice they connect into a single flow. Cost optimization is not about pulling tools out at random but is an **ordered pipeline**. First you match the size of the container (Right Sizing), then you cut the stable usage with commitments, handle the variable portion with Spot, and analyze, control, and check the whole thing. If you reverse this order - for example, locking in commitments before Right Sizing - you make the expensive mistake of committing to the wrong size for 3 years.

This article organizes Week 11 along two axes. First, compress each tool's role into one sentence and solidify the "exam keyword → correct service" mapping; second, see how the tools tie together into one decision flow. Then we check your instincts with 12 practical scenario questions. On the exam, cost and performance questions are usually in the form of picking "the single tool best suited to this situation," and that choice hinges on knowing exactly each tool's **own domain**.

## Week 11 One-Sentence Summary and Keyword Mapping

| Day | Key tool | One sentence |
|-----|-----------|---------|
| Day 1 | **Compute Optimizer** | Analyzes 14 days of metrics with ML and recommends Right Sizing for EC2/ASG/EBS/Lambda |
| Day 2 | **Trusted Advisor** | Automatically checks best practices across five categories (cost/performance/security/fault tolerance/limits) |
| Day 3 | **Cost Explorer / Budgets / Tag** | Multi-dimensional cost analysis, budget control, and tag-based allocation |
| Day 4 | **SP / RI / Spot** | Commitment discounts for the stable baseline, Spot for the stateless variable portion |

The exam picks out the tool through situational keywords. This mapping is the key.

| Exam keyword | Answer |
|-------------|------|
| "Instance/volume size recommendations," "right sizing," "identify over-provisioned" | Compute Optimizer |
| "Automatically check cost, performance, security, and fault tolerance at once" | Trusted Advisor |
| "Warning at 80% of a service limit (quota)" | Trusted Advisor Service Limits |
| "Break down and visualize cost by service, account, and project" | Cost Explorer |
| "Cost grouping by team/project" | Cost Allocation Tag + Cost Explorer |
| "Automatically block when a budget threshold is reached (EC2 stop, IAM/SCP)" | AWS Budgets + Budgets Action |
| "Cost spikes abnormally against the usual pattern (ML detection)" | Cost Anomaly Detection |
| "Raw data at the hour/resource level + SQL analysis" | CUR + Athena |
| "Commitment free of family and Region," "workload fluctuation" | Compute Savings Plans |
| "Fixed to a specific family, maximum discount" | EC2 Instance SP / Standard RI |
| "Commitment for RDS, Redshift, ElastiCache" | Reserved Instances (SP not supported) |
| "Stateless batch, tolerates reclamation, maximum discount" | Spot + capacityOptimized |
| "Handle the 2-minute Spot reclamation notice" | EventBridge → Lambda / Lifecycle Hook |
| "Guarantee capacity in a specific AZ (not a discount)" | EC2 Capacity Reservation |
| "Notice of AWS-side host retirement/maintenance" | Personal Health Dashboard |
| "Check actual commitment usage rate / coverage ratio" | Cost Explorer Utilization / Coverage |

> 💡 **Related theory**: Underlying this tool classification is the operational **OODA loop** (Observe-Orient-Decide-Act). Observation (Observe) is handled by CloudWatch, Cost Explorer, and CUR; judgment (Orient) by Compute Optimizer, Trusted Advisor, and Anomaly Detection; decision (Decide) by purchasing commitments and changing families; and action (Act) by Budgets Action, Spot reclamation handling, and automatic recovery. If, instead of memorizing tools by function, you classify them as "is this observing, judging, or acting," what is the answer in which situation narrows down naturally. For example, the distinction between "only detects and cannot block" (Anomaly Detection) and "actually blocks" (Budgets Action) is exactly the difference between Orient and Act.

## The Right Order of Cost Optimization - Why Right Sizing Comes First

Knowing the cost optimization tools is different from **applying them in the right order**. If the order is wrong, the savings are halved or you even lose money.

```
Step 1 ─ Right Sizing (match the container size)
        Compute Optimizer recommendation → downsize, change family
        gp2 → gp3, io1 → gp3 migration
        ※ Must come first! Committing to a wrong size locks in the wrong cost for 3 years

Step 2 ─ Commitment discounts (cut the stable baseline)
        24/7 always-on workload 60-70% → Compute SP 3-year
        Only for the minimum usage that never shrinks

Step 3 ─ Variable workloads (On-Demand + Spot)
        Hard-to-predict variable portion → On-Demand 20-30%
        Stateless, tolerates reclamation → Spot 10-20% (capacityOptimized)

Step 4 ─ Continuous monitoring (observation and control)
        Cost Explorer analysis / Budgets control / Anomaly detection
        Check SP/RI Utilization and Coverage
```

**The reason Step 1 must come first** is that commitments are irreversible. If an m5.4xlarge would really be fine as an m5.large, and you put a 3-year Standard RI on this large instance without Right Sizing, then even if you want to downsize a year later, you cannot because you are tied to the commitment. The order is to find the right size first, and then place the commitment on the baseline of that right size. A commitment is the last step that cuts the "already optimized size," not the first step.

> ⚠️ **Pitfall**: Besides the mistake of reversing the order of Right Sizing and commitments, the mistake of "committing above the baseline" is also common. If you commit to match the peak of a workload whose traffic surges and dips, you pay for a considerable part of the commitment without using it during the trough hours (low Utilization). Always place commitments only on "the floor line of the graph (the part that never shrinks)" and support everything above it with On-Demand and Spot. On the exam, for "highly variable workload + cost savings," a full Standard RI commitment is likely the wrong answer, and the Compute SP (baseline) + Spot (variable) combination is the right direction.

## Frequently Confused Boundaries - The Distinctions the Exam Targets

Most exam questions in the cost and performance area make you pick "one of two similar-looking tools." Here are the key boundaries.

**Detection vs blocking**: Cost Anomaly Detection **detects and alerts** on abnormal cost with ML but cannot stop the cost. The only thing that actually **blocks** is Budgets Action (EC2 stop, IAM/SCP). If the keyword is "block automatically," it is Budgets Action, and if it is "notice the abnormality," it is Anomaly Detection.

**Fixed threshold vs pattern anomaly**: Budgets alerts when a fixed threshold like "$5,000 per month" is exceeded. Cost Anomaly Detection catches outliers against the usual pattern. A sudden spike within the threshold is not caught by Budgets but is caught by Anomaly - they are complementary.

**Right Sizing recommendations vs best practice checks**: Compute Optimizer produces precise size recommendations per instance. Trusted Advisor is a coarse best practice check across the account. "Shrink which instance to which type" is Compute Optimizer, and "an overall check of cost, security, and fault tolerance" is Trusted Advisor.

**Discount vs capacity guarantee**: SP/RI are discounts and do not guarantee capacity. Capacity Reservation guarantees capacity and is not a discount. If it is "must be able to launch," it is Capacity Reservation, and if it is "cheaply," it is SP/RI.

**My settings vs AWS-side events**: Trusted Advisor looks at problems in my account's settings, and Personal Health Dashboard looks at AWS-side events (retirement, maintenance).

**Quick summary vs raw data**: Cost Explorer is a pre-aggregated quick summary (console), and CUR is raw data at the hour/resource level (S3 + Athena with arbitrary SQL).

The fundamental reason these boundaries exist is that each tool is optimized for **a different data resolution and a different time of operation**. Cost Explorer is pre-aggregated by day/hour so it is fast but coarse, and CUR is raw at the resource/hour level so it is precise but heavy. Anomaly Detection is asynchronous ML inference so it is strong at detection but cannot block in real time, and Budgets Action is based on threshold triggers so it blocks immediately but cannot see patterns. When memorizing tools, if you ask "what resolution of data does this process, and at what point in time," you can see why that tool does only that job well - the reason there is no single tool that does everything is the trade-off between data resolution and latency.

## Commitment Check Metrics - The Meaning of Utilization and Coverage

Buying a commitment (SP/RI) is not the end of it. Workloads change, so you must **continuously check** whether the commitment is still right, and the key metrics for that are Cost Explorer's **Utilization** and **Coverage**. If you mix these two up, you make the wrong decision.

- **Utilization**: The ratio of the purchased commitment that was actually used and received the discount. At 90% you are using 90% of the commitment, and at 60% you are wasting 40% (over-commitment). **If low, you should reduce the commitment.**
- **Coverage**: The ratio of total On-Demand-eligible usage that the commitment covers. At 50%, half of the usage is still paid at list price (On-Demand). **If low, there is room to commit more** (an additional savings opportunity).

You must look at both together - if Coverage is low and Utilization is high, "you would use it all even if you bought more commitment," so an additional commitment is safe. If Coverage is high but Utilization is low, you are already over-committed, so you should not buy more.

According to industry surveys by the FinOps Foundation, the major axes of cloud cost waste are ① idle resources that were not turned off and ② wrongly purchased commitments. Many organizations, thinking "committing is always cheaper," bought large amounts of RIs matched to peak usage, then suffered failures where the workload shrank or the family changed and Utilization fell below 50% - the unused commitment became even more expensive than On-Demand. With this lesson, the industry made "conservative commitments + regular Utilization/Coverage checks" the standard, and AWS also eased the rigidity of commitments by introducing Convertible RIs and the flexible Compute SP. A commitment is not something at the moment of purchase but something you manage while operating.

## Wrap-Up

The Week 11 tools implement the operational loop of "observe → judge → decide → act" in the cost and performance area. Whether on the exam or in practice, the key is each tool's own domain and the order in which they are tied together.

Compressed to five points: ① Compute Optimizer = Right Sizing recommendations (14 days of metrics, memory requires the Agent), Step 1 of cost optimization. ② Trusted Advisor = best practice checks in five categories (all of them require Business+ Support, limits give an advance warning at 80%). ③ Cost Explorer (multi-dimensional analysis) + Budgets (blocks via Action) + Tag (allocation, activation is not retroactive) + Anomaly Detection (ML detection, not blocking). ④ Commitments only on the baseline (Compute SP flexible / EC2 Instance SP and Standard RI tied down / RDS and Redshift use RIs), checked with Utilization and Coverage. ⑤ Spot is only for stateless workloads that tolerate reclamation (capacityOptimized, handle the 2-minute notice), and Capacity Reservation guarantees capacity rather than a discount. Applying them in this order - Right Sizing → commitments → Spot → monitoring - is the canonical way of cost optimization.

---

## 📝 Scenario Practice Questions (Week 11 Comprehensive, 12 Questions)

**Question 1.** You operate 200 EC2 instances and want to know precisely, per instance, which instances are over-provisioned. What is the most suitable tool?

A) Put per-instance CPU and memory graphs on a CloudWatch Dashboard and have operators manually identify over-provisioned ones

B) Compute Optimizer - analyzes the percentile distribution of 14 days of metrics with ML and presents Over/Under/Optimized per instance along with the recommended type

C) Check for low-utilization instances across the account against best practices with the Trusted Advisor Performance category

D) Break down cost by instance type in Cost Explorer and presume the instances with large spend are over-provisioned

**Answer: B**

Explanation: Precise per-instance size recommendations are Compute Optimizer's own domain. It learns the distribution of 14 days of metrics such as CPU and network with ML, judges each instance as Over/Under/Optimized, and even presents the type to shrink to and the expected savings. Trusted Advisor (C) is a coarse best practice check across the account, so per-instance recommendations are weak, and Cost Explorer (D) is an analysis tool, not a recommendation tool. However, for workloads that need memory metrics, installing the CloudWatch Agent determines the accuracy of the recommendations.

---

**Question 2.** The operations team sets a $5,000 monthly budget and wants an alert at 80% and some EC2 instances automatically stopped at 100%. Without human intervention.

A) Monitor monthly spending in Cost Explorer and have an operator manually stop EC2 once it passes 80%

B) AWS Budgets + Budgets Action (alert at 80%, EC2 stop or IAM Deny attachment at 100%)

C) Detect the cost surge with Cost Anomaly Detection, send an SNS alert, and automatically stop EC2

D) Put a CloudWatch Alarm on the billing metric (EstimatedCharges) and stop EC2 with Lambda when the threshold is reached

**Answer: B**

Explanation: Automatic blocking that actually "stops" cost can only be done by Budgets Action. When the threshold is reached it can automatically stop EC2/RDS, attach an IAM Deny policy, or apply an SCP. The typical setup is 80% as a FORECASTED or ACTUAL alert and 100% as an ACTUAL blocking Action. Cost Anomaly Detection (C) only detects and alerts and cannot block, and Cost Explorer (A) only analyzes.

---

**Question 3.** You want to track the cost of the CloudOps team and the DevOps team separately. What is the lightest method?

A) Create a separate AWS account for each team and separate the cost by account using Organizations consolidated billing

B) Assign a `Team` tag to resources + activate the Cost Allocation Tag + Cost Explorer Group by Tag

C) Create a Budget for each team and track each team's cost separately by budget

D) Download CUR to S3 and manually analyze cost by team daily with Athena or spreadsheets

**Answer: B**

Explanation: The standard for per-team cost allocation is tag-based. You add a `Team` tag to resources, explicitly activate that key as a Cost Allocation Tag (it is not retroactive, so do it soon), and then view it in Cost Explorer with Group by Tag. Separating accounts (A) is an excessive change, and tags are the lightest. However, past data from before activation is not grouped and it takes 24-48 hours after activation, and resources missing tags fall into untagged, so enforcing with a Tag Policy raises accuracy.

---

**Question 4.** A company will run EC2 stably for the next 3 years but changes families and Regions often. To get the maximum discount without code changes?

A) Standard RI 3-year - commit to a specific instance family for the maximum discount and repurchase the RI when changing families

B) Compute Savings Plans 3-year - applies automatically within the committed amount across all Regions, families, and EC2/Fargate/Lambda

C) Run On-Demand, keeping the freedom to change families and Regions but giving up the discount

D) Run on Spot to get up to a 90% discount, automatically substituting another family on reclamation

**Answer: B**

Explanation: A Compute SP commits to hourly spend rather than an instance, so the commitment follows you even when you change family or Region. Standard RI (A) trades a bigger discount for being tied to a specific type, and the commitment becomes useless when the family changes. If you need commitment flexibility in a volatile environment, Compute SP is the answer. On-Demand (C) has no discount, and Spot (D) has reclamation risk unsuitable for a stably operated workload.

---

**Question 5.** You run an EMR batch with 100 nodes only at night. It is stateless and can simply be rerun if reclaimed. How do you minimize cost?

A) Launch 100 On-Demand instances at list price for each nightly batch and terminate them, operating flexibly without commitments

B) Commit to 100 Standard RIs for 3 years to apply the maximum discount to the batch nodes

C) Spot Fleet + capacityOptimized - the best for stateless, reclamation-tolerant batch, up to a 90% discount + stability

D) Commit to the hourly spend of the nightly batch with Compute Savings Plans to receive a discount

**Answer: C**

Explanation: Stateless, interruption-tolerant, distributable batch is the textbook target for Spot. With capacityOptimized, you pull from pools with ample spare capacity to reduce reclamation while getting up to a 90% discount. RI (B) and SP (D) are for 24/7 always-on workloads, so for work that runs only at night most of the commitment goes unused and is wasted, and On-Demand (A) is list price.

---

**Question 6.** You want to automatically receive a warning when the limits (quotas) of all AWS services approach 80%.

A) Publish per-service usage directly as CloudWatch Custom Metrics and manually configure an 80% threshold alarm

B) Trusted Advisor Service Limits + EventBridge notification (Business+ Support)

C) Track the number of resources per service with Config Rules and evaluate whether it exceeds 80% of the limit

D) Manually check each quota's utilization regularly in the Service Quotas console

**Answer: B**

Explanation: Trusted Advisor's Service Limits check automatically checks for reaching 80% of the limit, and EventBridge automates the notification. Limits do not increase automatically, so the key is to receive the 80% advance warning and request an increase in advance with Service Quotas. However, the full Trusted Advisor requires Business or higher Support. Some quotas can also have alarms set through the CloudWatch `AWS/Usage` namespace.

---

**Question 7.** One day the company's cost spiked to 3 times the usual pattern. It did not exceed the fixed budget threshold. To automatically detect such an anomaly?

A) Slice the monthly fixed threshold finely with AWS Budgets to catch the pattern deviation as a threshold breach

B) Cost Anomaly Detection - learns the usual pattern with ML and detects statistical outliers

C) Check for wasted resources with the Trusted Advisor Cost category to find the cause of the cost surge

D) Put a CloudWatch Alarm on the billing metric (EstimatedCharges) to detect a surge against the usual

**Answer: B**

Explanation: Budgets alerts only when a fixed threshold (monthly $X) is exceeded, so it cannot catch a sudden spike within the threshold. Cost Anomaly Detection learns the cost pattern with ML and catches outliers against the usual, so it alerts on an abnormal spike even if the fixed threshold is not exceeded. The two are complementary, and Anomaly Detection detects and alerts, it does not block.

---

**Question 8.** You want to secure new m7i instances so they can always be launched immediately in a specific AZ for BCP. The goal is availability, not cost savings.

A) Standard RI (gives a discount but does not guarantee capacity)

B) EC2 Capacity Reservation - secures capacity in a specific AZ, the discount is separate (combine with SP/RI)

C) Secure it in advance on Spot in that AZ and re-request immediately when reclaimed

D) Pre-launch On-Demand instances for BCP, keep them in the stopped state, and start them when needed

**Answer: B**

Explanation: Capacity Reservation buys "the guarantee that an instance can definitely be launched at that moment," and its purpose is capacity assurance, not a discount. AZ capacity shortages of new types and immediate-availability guarantees for DR are the exact use cases. SP/RI (A) are only discounts and do not guarantee capacity, and Spot (C) can be reclaimed, the exact opposite of availability. If you want a discount too, combine SP/RI with the Capacity Reservation.

---

**Question 9.** You run RDS PostgreSQL 24/7 and want a commitment discount.

A) Commit to hourly spend with Compute Savings Plans to apply a discount to the RDS instance as well

B) Commit to a specific instance family with EC2 Instance Savings Plans to discount compute including RDS

C) Reserved Instances (RDS RI)

D) Launch the RDS instance on Spot for the maximum discount while preparing for reclamation

**Answer: C**

Explanation: Savings Plans apply only to EC2/Fargate/Lambda. RDS, Redshift, ElastiCache, and OpenSearch have no SP, so you commit with each service's Reserved Instances. For a DB operated stably 24/7, RDS RI is the answer. Spot (D) is unsuitable for a stateful DB.

---

**Question 10.** To cut EBS cost, you want to automatically identify candidates for gp2 → gp3 migration.

A) Query the type and IOPS of all volumes with the CLI and manually select gp2 volumes in a spreadsheet

B) Compute Optimizer EBS Volume recommendations + Trusted Advisor Cost category

C) Break down EBS cost by volume type in Cost Explorer and presume the volumes with large gp2 spend as candidates

D) Mark gp2 volumes as noncompliant with a Config Rule to generate a migration candidate list

**Answer: B**

Explanation: Compute Optimizer analyzes EBS volumes and recommends gp3 conversion candidates and expected savings, and the Trusted Advisor Cost category also detects over-provisioned/idle EBS. gp3 is about 20% cheaper per GB, guarantees IOPS and throughput independently of size, and converts without downtime with `modify-volume`. The two tools are the standard for candidate identification.

---

**Question 11.** The Cost Explorer Utilization of a Compute SP the company bought a year ago is a low 55%. What does it mean and what is the action?

A) It is a signal that the commitment is insufficient, so enlarge the baseline and buy additional SP to widen the discount range

B) Over-commitment - 45% of the commitment is being wasted unused, so size the next commitment down to match the baseline that never shrinks

C) Since it is Coverage and not Utilization that is low, buy more commitment to cover the usage still paid On-Demand

D) Utilization varies too much by point in time to be a reliable metric, so judge by Coverage alone

**Answer: B**

Explanation: Utilization is the ratio of the purchased commitment that was actually used and received the discount. At 55%, 45% of the commitment is paid for without being used, an over-commitment. SP and RI are use-it-or-lose-it, so money goes out even if unused, meaning you underestimated the variability and committed above the baseline. The action is to size the next commitment down to the minimum usage (baseline). Only when Coverage (the ratio the commitment covers) is low is there room for an additional commitment - you must not mix the two up.

---

**Question 12.** An API server the operations team was running on a t3.large has steadily growing traffic, and every afternoon response times plunge and CPU hits a ceiling at a fixed value. What is the correct action considering both cost and performance?

A) Scale the instance up to t3.2xlarge

B) The cause is CPU credit exhaustion, so change to an m/c family suited to steady load (for example, m6i) and verify the right size with Compute Optimizer

C) Change the volume to gp3

D) Switch to Spot

**Answer: B**

Explanation: The T family is a burstable model that bursts above the baseline only with accumulated CPU credits, and when a load that steadily exceeds the baseline is applied, the credits are exhausted and you are tied to the baseline, so CPU hits a ceiling - the typical pattern of a daily afternoon performance plunge. Scaling up within the same T family (A) only gives a larger credit balance, which is not a fundamental fix and also raises cost. For steady operational load, the m/c families, where the baseline is the full performance, are the canonical choice, and you verify the right size with Compute Optimizer to avoid over- and under-provisioning. Right Sizing (correcting the family) is the key.

---

## 📌 Today's Summary

1. Cost optimization is an ordered pipeline - Right Sizing (step 1) → commitments (baseline) → Spot (variable) → monitoring. Match the size before committing so you do not commit to the wrong cost
2. Keyword mapping: size recommendations→Compute Optimizer, 5-category checks→Trusted Advisor, automatic blocking→Budgets Action, ML detection→Anomaly Detection, capacity guarantee→Capacity Reservation
3. Boundaries: detection (Anomaly) vs blocking (Budgets Action), quick summary (Cost Explorer) vs raw data (CUR), discount (SP/RI) vs capacity guarantee (Capacity Reservation), my settings (TA) vs AWS side (PHD)
4. Commitments only on the baseline, Compute SP (flexible) / EC2 Instance SP and Standard RI (tied down) / RDS and Redshift use RIs, check suitability with Utilization and Coverage
5. Spot is only for stateless, reclamation-tolerant workloads (capacityOptimized, handle the 2-minute notice), and T family credit exhaustion is corrected with the m/c families
