# Day 4 - Migration & Rehost Strategies — 7Rs in Practice, Time + Data Volume Trade-offs

SAP-C02 requires deep comfort with the **7 migration strategies (7Rs)**: Rehost, Replatform, Refactor, Repurchase, Rehost+Refactor, Retire, Retain.

Core patterns:
- **Rehost (Lift-and-Shift)**: Copy OS + app as-is to EC2 or via MGN. Fastest (weeks), keeps old code debt. Best for "quick escape" from on-prem.
- **Replatform (Lift-Tinker-Shift)**: Migrate database to RDS/DynamoDB, app to EC2. Moderate effort, better resource utilization.
- **Refactor (Re-architect)**: Rewrite for cloud-native (Serverless, microservices). Slowest, highest benefit, requires investment.
- **Repurchase (SaaS)**: Swap Salesforce on-prem → Salesforce Cloud. Contracts change, but ops simplified.
- **Rehost+Refactor (Hybrid)**: Rehost fast, refactor over time.
- **Retire**: Old systems no longer needed, turn off.
- **Retain**: Keep on-prem if ROI unclear or regulated.

Time vs data volume: 100TB Oracle → rehost in weeks (MGN parallel conversion), refactor takes 6+ months.

Key mappings: (1) "100TB ERP, 6 month deadline" → **Rehost + Refactor post-go-live**, (2) "Serverless startup" → **Refactor greenfield**, (3) "Mainframe CICS app, low ROI to rewrite" → **Retain or Rehost**, (4) "License reduction goal" → **Repurchase SaaS**, (5) "Data classification 70% warm, 30% cold" → **Rehost compute, refactor data tier**.

[6 EXERCISES: 7Rs decision tree, MGN vs CloudEndure, time + cost ROI, data gravity impact, legacy dependency chains, post-migration optimization phases]

---

## 📝 Practice Questions

**Question 1.** 100 TB Oracle migration in 6 months → **Rehost (MGN) + Refactor afterward**

**Question 2.** New startup greenfield → **Refactor (Serverless)**

**Question 3.** Legacy CICS mainframe with low ROI → **Retain or Rehost**

**Question 4.** License cost first → **Repurchase (SaaS)**

**Question 5.** Choosing between MGN and CloudEndure → **MGN (AWS native), CloudEndure (multi-cloud)**

**Question 6.** Phasing of post-migration optimization → **1 week of stabilization + 1 month of priority performance work + quarterly continuous**

---

**Question 7.** Monthly security patches must be applied to 500 EC2 instances, but security policy prohibits SSH and bastion hosts. Patches must be applied incrementally by group within defined time windows. Which configuration is most appropriate?
A) Run manual patch commands in bulk with Run Command
B) SSM Patch Manager + Maintenance Window + Session Manager
C) Configure yum-cron on each EC2 instance
D) Replace the instances with CloudFormation

**Answer: B**

Explanation: "SSH prohibited + patch automation + time window control + incremental by group" is directly answered by the SSM trio. Patch Manager applies patches incrementally with patch baselines and patch groups, Maintenance Window controls the time window, and for debugging, Session Manager provides access without SSH keys or a bastion (audited through CloudTrail). A (manual Run Command) is weak on automation, time control, and incremental rollout. C (yum-cron) has no central control, auditing, or time control. D (instance replacement) is an excessive change rather than patching. Trap: "SSH prohibited + patching" is Patch Manager + Session Manager.

---

**Question 8.** You want to deploy Lambda function v2 by gradually increasing traffic starting at 1%, and automatically roll back to v1 if a CloudWatch alarm fires. Which is the most appropriate method?
A) Manually adjust the Lambda Alias weights
B) CodeDeploy Lambda Canary
C) Branch with API Gateway Stage variables
D) Control traffic with Step Functions

**Answer: B**

Explanation: CodeDeploy Lambda Canary gradually increases traffic from 1% to 10% to 100% (or Linear) while monitoring CloudWatch alarms, and automatically rolls back if an alarm fires. It automatically orchestrates the Lambda Alias weight shifts. A (manual Alias adjustment) requires a person to do the gradual shift and the automatic rollback, which is a heavy operational burden. C and D can split traffic, but alarm-linked automatic rollback and gradual deployment automation are not as smooth as with CodeDeploy. Trap: "Lambda gradual traffic + automatic rollback" is CodeDeploy Canary. Note: during a Canary, two versions run at the same time, so they must be backward-compatible.

---

**Question 9.** A service sets its availability SLO at 99.9% and wants to deploy new features quickly only while exceeding this target, and to stop deployments and focus on stabilization once the budget is exhausted. What is the name of this operating model and its key metric?
A) Chaos engineering: MTBF
B) Error Budget: (100% - SLO)
C) FinOps: unit cost
D) Blue/Green: rollback time

**Answer: B**

Explanation: This is the SRE **Error Budget** model. Error Budget = 100% - SLO, so with an SLO of 99.9%, the budget is about 43 minutes of allowed downtime per month. While budget remains, deploy features quickly (speed first), and once it is exhausted, stop deploying and stabilize (reliability first). It arbitrates the conflict between development velocity and operational stability with a number. A is a technique of deliberate failure injection, a different concept. C is a cost operations culture. D is a deployment strategy. Trap: "quantifying the reliability target + balancing speed and stability" is Error Budget (= 100% - SLO).

---

**Question 10.** You want to inject deliberate failures every quarter to verify system resilience, with the experiment automatically stopping if the actual user impact exceeds a threshold. Which tool and configuration are most appropriate?
A) Recovery testing with AWS Backup
B) FIS + Stop Condition (CloudWatch alarm)
C) Resilience Hub assessment only
D) Trusted Advisor checks

**Answer: B**

Explanation: Chaos engineering is provided as a managed service by **FIS (Fault Injection Service)**, and a **Stop Condition** is the safety net that monitors a CloudWatch alarm and automatically stops the experiment when a threshold is exceeded. It implements the spirit of Netflix's Chaos Monkey safely. A (Backup testing) is not resilience injection. C (Resilience Hub) only statically assesses the RTO/RPO gap and does not inject real failures. D is a best-practice check. Trap: "deliberate failure injection + automatic safety stop" is FIS + Stop Condition.

---

**Question 11.** You want to retain several years of application logs at low cost and occasionally analyze them ad hoc with SQL. You want to avoid the burden of operating a cluster. Which combination is most appropriate?
A) Permanent retention in CloudWatch Logs + Logs Insights
B) Keep logs in S3 + query with SQL using Athena
C) Index in an OpenSearch cluster
D) Load into Redshift

**Answer: B**

Explanation: "Low-cost long-term retention + occasional SQL analysis + minimal operational burden" is the textbook case for **S3 (cheap storage, Glacier tiering with Lifecycle) + Athena (serverless SQL, billed by data scanned)**. A (permanent retention in CloudWatch Logs) accumulates storage and Insights scan cost, which is expensive for several years of data. C (OpenSearch) is good for real-time search but carries the burden of running a cluster continuously and its cost. D (Redshift) is an always-on cluster, which is excessive for occasional log analysis. Trap: "low-cost retention + occasional SQL + serverless" is S3 + Athena, and "real-time search and dashboards" is OpenSearch.

---

**Question 12.** You want to be automatically detected and alerted when cost spikes abnormally compared with the usual pattern. It must also catch new anomalous patterns for which no absolute threshold can be known in advance. Which tool is most appropriate?
A) Absolute threshold alerts with Budgets
B) Cost Anomaly Detection (ML-based)
C) Trusted Advisor
D) Manual CUR analysis

**Answer: B**

Explanation: Cost Anomaly Detection uses ML to learn the usual cost pattern and detects and alerts on statistically abnormal spending, catching even "new anomalous patterns" for which no threshold is known in advance. A (Budgets) monitors only absolute thresholds set in advance and misses unforeseen patterns. C and D are not automatic ML detection. Trap: "no threshold possible in advance + automatic anomalous pattern detection" is Cost Anomaly Detection.

---

**Question 13.** In a multi-cloud environment (AWS + on-premises K8s), you want to collect distributed traces with the same instrumentation SDK to avoid vendor lock-in. Which is the most appropriate choice?
A) X-Ray SDK
B) ADOT (AWS Distro for OpenTelemetry)
C) CloudWatch Logs
D) A proprietary APM for each environment

**Answer: B**

Explanation: ADOT is the AWS distribution of the CNCF OpenTelemetry standard, and with the same SDK and instrumentation you can send telemetry anywhere, including AWS, GCP, Azure, on-premises, and third parties (such as Datadog), avoiding vendor lock-in. A (X-Ray) is an AWS-proprietary SDK with lower multi-cloud portability. C (Logs) is not tracing. D loses standardization and unified observability. Trap: "multi-cloud + vendor-neutral tracing" is ADOT (OpenTelemetry).

---

**Question 14.** During a Region failure, instead of failover based on automatic health checks, you want the operations team to assess the situation and shift traffic to another Region manually (but with high reliability). Which service is most appropriate?
A) Route 53 Health Check automatic Failover
B) Route 53 Application Recovery Controller (ARC) Routing Control
C) Global Accelerator automatic
D) Change routing with Lambda

**Answer: B**

Explanation: The **Routing Control** of Route 53 ARC is a high-reliability control panel where a person deliberately presses an on/off switch to shift traffic routing. It prevents automatic health checks from failing over incorrectly because of false positives, and the switch happens by a reviewed decision of the operations team (the data plane is distributed across multiple Regions, so it is itself highly available). A (automatic Health Check) involves no human judgment. C (Global Accelerator) is automatic endpoint failover. D is weak on reliability and auditing. Trap: "a highly reliable manual failover decided by a person" is Route 53 ARC Routing Control.

---