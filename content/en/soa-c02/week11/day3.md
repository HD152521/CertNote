# Day 3 - Data Migration, Replication, Cross-Region Backup

Database migration: AWS DMS (Database Migration Service) replicates on-premises/other cloud databases. Heterogeneous conversion (MySQL→Aurora), homogeneous replication. Continuous replication possible.

Cross-Region replication: Aurora Global Database, RDS read replicas (cross-region). Asynchronous replication. RPO considerations. S3 Cross-Region Replication (CRR) automatic object replication.

Backup strategies: automated retention, manual snapshots, backup automation scripts, AWS Backup service central orchestration.

---

## Practice Problems

**Question 1.** A company tagged all of its resources with a `Project` tag, but `Project` does not appear in Cost Explorer's Group by Tag. What is the cause and the fix?

A) Cost Explorer does not support grouping by tag
B) Tagging alone is not enough; the tag key must be explicitly activated as a Cost Allocation Tag to become a billing dimension (reflected 24-48 hours after activation)
C) IAM permissions are insufficient
D) The tag values contain Korean characters

**Answer: B**

Explanation: Attaching a tag to a resource and using that tag as a cost dimension are separate things. Automatically turning every tag into a billing dimension would make the data explode, so AWS has you explicitly activate the tag keys you want to use for cost analysis as Cost Allocation Tags. It usually takes 24-48 hours after activation for the tag to appear in billing, and more importantly, activation is not retroactive, so the dimension is populated only with data from after activation. That is why you should activate the tag keys as soon as you have settled on a tagging standard.

---

**Question 2.** Monthly cost suddenly jumped to 3 times its usual level. What is the best approach for systematically finding the cause with Cost Explorer?

A) Exhaustively investigate the CUR with Athena
B) Drill down by narrowing the dimensions: Group by Service to identify the service, then Linked Account, then Tag (Project), then Usage Type
C) Terminate all instances
D) Create a budget

**Answer: B**

Explanation: Cost Explorer treats cost as a multidimensional OLAP cube, so tracing the cause of a spike is a drill-down by nature. First use Group by Service to see which service surged, narrow to that service, and then narrow the dimensions in turn: Linked Account (which account), Tag (which project), and Usage Type (data transfer, storage, or compute) to pinpoint the culprit. For example, if the Out-Bytes of EC2-DataTransfer surged, outbound data transfer is the cause. An exhaustive CUR investigation (A) is for heavier, deeper analysis.

---

**Question 3.** A company wants to automatically prevent new EC2 instances from being created when the monthly budget of $10,000 is reached (without human intervention). Which tool or feature should it use?

A) Cost Explorer
B) AWS Budgets + Budgets Action (attach an IAM Deny policy or apply an SCP)
C) Cost Anomaly Detection
D) Trusted Advisor

**Answer: B**

Explanation: Only Budgets Action can automatically "block" spending. When a threshold is reached, it can attach a Deny policy to specific users or roles (IAM Action), apply an SCP to an OU, or automatically stop EC2/RDS instances. Cost Explorer (A) only analyzes, and Cost Anomaly Detection (C) only detects and alerts; neither can block. However, an SCP is a blunt instrument that affects the entire OU, so it is safer to keep broad actions on a MANUAL approval model.

---

**Question 4.** A company needs to know exactly how much a single EC2 instance spent per hour, and also needs custom SQL analysis that converts cost per user according to the company's own criteria. Which data source should it use?

A) The Cost Explorer console
B) Cost and Usage Report (CUR) + S3 + Athena: arbitrary SQL over raw hourly, resource-level data
C) Budgets
D) Trusted Advisor Cost

**Answer: B**

Explanation: Cost Explorer is a fast summary over predefined dimensions, so it cannot perform arbitrary complex joins or custom aggregations over raw hourly, resource-level data. The most detailed source of truth is the CUR: every hourly, resource-level row is stored in S3 as Parquet, and you run arbitrary SQL with Athena. Thanks to columnar Parquet, only the needed columns are scanned, which makes queries fast and cheap. Custom analyses such as internal cost tools, showback, and applying exchange rates are the domain of the CUR.

---

**Question 5.** A company started a new workload in a newly created account, and Cost Explorer's cost forecast and the Budgets FORECASTED threshold keep missing the mark. What is the cause and the remedy?

A) A Cost Explorer bug; restart it
B) The forecasting ML model lacks the historical data to learn from; until history accumulates, also set an ACTUAL threshold as a safety net
C) The Region is wrong
D) An IAM permission problem

**Answer: B**

Explanation: A cost forecast is an extrapolation by an ML model that learned past patterns, so it misses widely when there is no history to learn from, as with a new account or a new workload (a reliable forecast usually needs several months of history). A forecast also cannot foresee abrupt changes that never occurred in the past. So when history is thin, do not rely on FORECASTED alone; set an ACTUAL threshold alongside it to provide a safety net based on measured spend. The forecast line is a statistical estimate with a confidence interval, not a certain future.

---

**Question 6.** A company wants to create a Budgets Action that uses an SCP to block EC2 creation across an entire OU when the budget is exceeded. Which setting deserves the most careful consideration?

A) Setting the threshold to 0%
B) The approval model: an SCP is a broad action affecting the entire OU, so set it to MANUAL so that a person approves it before it runs
C) The notification email address
D) The budget name

**Answer: B**

Explanation: Applying an SCP automatically is powerful, but it is a blunt instrument that affects every account and every user in the OU, and it can block even urgent operational work. In the Budgets Action approval model, `AUTOMATIC` runs immediately, while `MANUAL` runs only after a person approves it in the console. The standard practice is to set irreversible or broad actions (SCPs) to MANUAL to reduce the risk of malfunction, and to set only safe, localized actions to AUTOMATIC.

---
