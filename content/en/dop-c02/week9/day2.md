# Day 2 - State Manager·Inventory·Compliance: The Abstraction of Desired State

(Translated main content in English, with all Korean practice problems preserved below)

After 6 months of CloudFormation use, one weakness emerges: **Run Command is one-time execution**. Restart nginx fleet-wide today; 30 minutes later new ASG instance boots untouched. CloudWatch Agent deployed everywhere; next week someone deletes it from one instance, that one silently drifts. Fleet is living organism; one command doesn't maintain state.

State Manager solves with **"desired state"** abstraction. Not "run this command once" but "this state must always be true," let SSM periodically reconcile actual to declared. Deep connection to Kubernetes/Puppet/Chef desired-state models through this lens.

---

## 📝 Practice Questions

(All practice problems in Korean as required by rules)

**Question 1.** An ASG launches and terminates instances constantly. A security agent must always be installed on every instance and must be automatically restored if anyone removes it. What is an approach other than AMI baking?

A) Run an install script with cron on each instance
B) Declare a tag-based package installation with a State Manager association + periodic execution — automatically applied to new instances + automatic drift remediation
C) Run Run Command once
D) Connect over SSH hourly with Lambda to install

**Answer: B**

Explanation: State Manager declares a desired state and reconciles it periodically. New instances are included automatically as long as the tags match, and if anyone removes it, it is reinstalled in the next cycle. Cron (A) is not automatically deployed to new instances and has no central compliance. Run Command (C) is one-time, so it does not apply to new instances. Lambda+SSH (D) is an inefficient reinvention of what SSM already provides.

---

**Question 2.** An urgent vulnerability like Log4Shell has been disclosed. To instantly answer "where in the fleet are the instances with the vulnerable library version installed" at a scale of hundreds of thousands of instances, what should be prepared in advance?

A) SSH into every instance and grep
B) Collect SSM Inventory + Resource Data Sync → S3 → Athena, and query with SQL during an incident
C) CloudWatch Logs Insights
D) Trusted Advisor

**Answer: B**

Explanation: If Inventory collects application and library versions in advance and loads them into an S3 data lake, then during an incident a single line of Athena SQL such as `WHERE name='log4j-core' AND version<'2.17.0'` immediately narrows down the affected instances. Data collection in peacetime determines incident response speed. SSH grep (A) is impossible at scale, Logs Insights (C) is for log analysis and not inventory queries, and Trusted Advisor (D) is a best practice check, not a fleet inventory.

---

**Question 3.** Which of the following is not a decisive difference between a State Manager association and cron?

A) New instances are applied automatically when tags match
B) Success/failure is reported automatically to central compliance
C) Drift is automatically remediated in the next cycle
D) Instance types are changed automatically

**Answer: D**

Explanation: State Manager is a tool that enforces software state (package installation, configuration) and does not change infrastructure attributes such as the instance type. A (automatic application to new instances), B (central compliance), and C (automatic drift remediation) are all key advantages of State Manager over cron. Changing instance types is in the domain of EC2/CloudFormation/ASG.

---

**Question 4.** What does SSM Inventory not collect?

A) Installed applications and versions
B) Running services
C) Network interface information
D) The list of IAM users and roles in the account

**Answer: D**

Explanation: Inventory collects software, service, and network information "inside" the managed instances. Account-level AWS resources such as IAM users and roles are not in the scope of Inventory — AWS Config or IAM Access Analyzer handles those. The boundary that Inventory is inside the instance and Config is AWS resources is an exam point.

---

**Question 5.** What data pattern does the Resource Data Sync → S3 → Athena pipeline follow?

A) A schema-on-write data warehouse
B) A schema-on-read data lake (ELT) — load raw JSON into S3 and apply the schema at query time
C) An in-memory cache
D) A graph database

**Answer: B**

Explanation: The inventory JSON is first loaded raw into S3 (Load), and the schema is applied at Athena query time (schema-on-read) for analysis. It is a typical data lake + ELT pattern. The same structure is used for CloudTrail, VPC Flow Logs, and ALB log analysis. At large scale, Parquet conversion + partitioning reduce Athena scan cost.

---

**Question 6.** How do you deploy a self-developed security agent to the entire fleet and manage its version uniformly?

A) Install manually on each instance
B) Define the package with Distributor, then deploy with the version pinned through a State Manager association — the version becomes the fleet single source of truth
C) Upload it to S3 and let instances fetch it on their own
D) Bake it into the AMI only

**Answer: B**

Explanation: Distributor defines your own software as an SSM package, and State Manager pins the version and deploys it as the desired state. When you change the version, the entire fleet is rolling-upgraded in the next cycle and new instances are included automatically. AMI baking alone (D) makes runtime enforcement and version updates difficult.

---

**Question 7.** How do you view SSM patch compliance on the same dashboard as other security findings and even connect it to automated response?

A) Poll with Lambda each time
B) Enable the SSM Patch integration in Security Hub → aggregate findings → EventBridge through a custom action → automated response with Lambda
C) Save results to S3 and review manually
D) A CloudWatch dashboard widget

**Answer: B**

Explanation: SSM compliance is natively integrated with Security Hub and gathers on the same dashboard as GuardDuty, Inspector, and Config findings. If a Security Hub custom action triggers EventBridge and Lambda responds automatically, the detect-assess-respond closed loop is complete. Each stage (assess/aggregate/respond) has separated responsibilities, so it is easy to scale. Manual polling (A) or manual review (C) loses the benefit of automation.

---

## 📌 Today's Summary

The five key takeaways from today are as follows. First, the State Manager association is a desired state abstraction (declarative and idempotent) with the same roots as Kubernetes and Puppet, and automatic application to new instances and automatic drift remediation are the decisive differences over cron. Second, Inventory collects software, services, and network information inside the instances and can capture company-specific items with custom inventory, but it does not include account resources such as IAM (that is Config's domain). Third, Resource Data Sync → S3 → Athena is a schema-on-read data lake pattern that narrows down the affected instances with a single line of SQL during an incident. Fourth, Distributor deploys your own packages through State Manager so that the version becomes the fleet single source of truth. Fifth, Compliance → Security Hub → EventBridge → Lambda is a governance closed loop that separates the responsibilities of detect-assess-respond, and Change Calendar codifies freezes on the time axis.
