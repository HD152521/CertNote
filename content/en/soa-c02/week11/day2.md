# Day 2 - Database Failover, Performance and Scaling

RDS failover: Multi-AZ standby (automatic failover <2min), read replicas manual promotion. Enhanced monitoring (OS-level metrics). Performance Insights shows database load. Slow query logs. Query Performance Insights.

Database scaling: vertical (instance class), horizontal (read replicas). RDS Proxy connection pooling. Aurora serverless auto-scaling capacity. DynamoDB read/write capacity.

---

## Practice Problems

**Question 1.** An operator must choose one of the options for a question asking about "the five categories of Trusted Advisor." Which is **NOT** one of the five categories?

A) Cost Optimization
B) Fault Tolerance
C) Compliance
D) Service Limits

**Answer: C**

Explanation: The five categories of Trusted Advisor are Cost Optimization / Performance / Security / Fault Tolerance / Service Limits, which turn the pillars of the AWS Well-Architected Framework into automated checks. Compliance is not among them; whether a specific regulatory clause is satisfied is the domain of AWS Config (custom rule evaluation) and Audit Manager (audit reports). Trusted Advisor checks "are best practices being followed," not "is a specific regulation satisfied."

---

**Question 2.** A company on the Basic Support plan wants to receive cost optimization recommendations in Trusted Advisor, such as "unused EBS volumes" and "underutilized EC2." What is required?

A) Just add IAM permissions
B) Upgrade to the Business or Enterprise Support plan; the full set of 100+ checks (including the cost category) is exclusive to paid plans
C) Change the Region to us-east-1
D) Install the CloudWatch Agent

**Answer: B**

Explanation: The core checks visible on the free tiers (Basic/Developer) are limited to some security checks and service limits, items that would harm the whole platform if left unattended. Cost optimization (unused resources, RI recommendations) is purely added value that saves the customer's money, so it is tied to paid Support plans of Business or higher. This boundary is created by the AWS Support business model, not by a technical constraint. To see all 100+ checks across the five categories, a plan upgrade is required.

---

**Question 3.** A company wants to make it so that if someone accidentally opens SSH to 0.0.0.0/0 in a security group, the rule is automatically closed within minutes and the operations team is notified. Which configuration is correct?

A) Check through a weekly manual review
B) Trusted Advisor check status change → EventBridge Rule (source: aws.trustedadvisor) → Lambda (remove the rule) + SNS (notification)
C) Read the CloudTrail logs daily
D) Only enable Config

**Answer: B**

Explanation: When a check's status changes, Trusted Advisor publishes an event with the `aws.trustedadvisor` source. Receiving it with an EventBridge rule and connecting it to Lambda (automatically removing the rule with `revoke-security-group-ingress`), SNS (immediate notification), SSM Automation (runbook), and OpsItem (tracking) creates an automated response pipeline. However, the scope of automatic remediation must be decided carefully: automatically blocking even intended temporary access can disrupt operations, so the mature pattern is to auto-remediate only clear, high-risk violations and limit ambiguous items to notification.

---

**Question 4.** During a traffic surge, Auto Scaling tried to add instances but hit the vCPU limit and the scale-out failed. How can this be prevented in advance?

A) Limits increase automatically, so just wait
B) Receive an alert at 80% with Trusted Advisor Service Limits and request an increase in advance through Service Quotas (approval takes time)
C) Make the instances larger
D) Switch to Spot

**Answer: B**

Explanation: Service limits do not increase automatically; they require a manual request plus AWS approval, which takes time. So requesting after hitting 100% is already too late. The Service Limits check in Trusted Advisor gives an early warning at 80%, so at that point you should request an increase in advance through the Service Quotas console or a Support case to secure headroom before hitting the limit. Some quotas can also have alarms set through the CloudWatch `AWS/Usage` namespace.

---

**Question 5.** AWS has notified a company that the physical host running its EC2 instance is scheduled for retirement (replacement), and the company wants to migrate in advance. Which service is correct?

A) Trusted Advisor
B) AWS Personal Health Dashboard (PHD) + EventBridge
C) CloudTrail
D) Inspector

**Answer: B**

Explanation: Trusted Advisor looks at "problems in my account's configuration," but "things happening on the AWS side" (host retirement, EBS performance degradation, RDS maintenance) are covered by the AWS Health Dashboard, and in particular the Personal Health Dashboard (PHD), which filters down to events that actually affect my account. By receiving PHD events with EventBridge and automating the advance migration, you can move instances without downtime before the retirement.

---

**Question 6.** A company's cost has not exceeded any fixed budget threshold, but data transfer cost has suddenly spiked to 3 times its usual pattern. What should it use to automatically detect this kind of pattern-based anomaly?

A) AWS Budgets (based on fixed thresholds)
B) Cost Anomaly Detection: learns the usual pattern with ML and detects statistical outliers (spikes)
C) Trusted Advisor Cost
D) CloudWatch Alarm

**Answer: B**

Explanation: Budgets is rule-based, alerting when a fixed threshold such as "$5,000 per month" is exceeded, so it cannot catch a sudden spike within the threshold. Cost Anomaly Detection learns the account's cost pattern with ML and statistically detects outliers compared with the usual, so it catches spikes that are "different from usual" even when no fixed threshold is crossed. The two are complementary. Note, however, that Anomaly Detection detects and notifies; it does not block. It cannot prevent the cost from being incurred in the first place.

---

**Question 7.** A company wants to continuously evaluate compliance with its own standard that "all EBS volumes must be encrypted," and to track when violations occurred and the change history. What should it use instead of Trusted Advisor?

A) The Trusted Advisor Security category
B) AWS Config + custom Config Rule (encrypted-volumes): custom rule definition and point-in-time configuration history tracking are possible
C) Cost Explorer
D) Compute Optimizer

**Answer: B**

Explanation: Trusted Advisor provides only the ruleset fixed by AWS, so you cannot define "rules unique to our company," and it does not track point-in-time configuration change history. Custom rule evaluation and change history are the unique domain of AWS Config: evaluate continuously with managed/custom Config Rules such as `encrypted-volumes`, and use the configuration timeline to track when and who put a resource into a violating state. "Do I need to define the rule myself?" is the question that separates Config from Trusted Advisor.

---
