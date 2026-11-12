# Day 2 - Trusted Advisor, the Five Eyes with Which AWS Inspects Your Account on Your Behalf

There is a limit to the number of best practices a single operator can hold in their head. "Is SSH open to 0.0.0.0/0 in a security group? Is the RDS instance Multi-AZ? Has an IAM access key gone more than 90 days without rotation? Are EBS volume limits filling up?" — these checks number in the hundreds, and once accounts grow to dozens, human memory cannot possibly keep up. **Trusted Advisor** has AWS do these checks for you. AWS knows better than anyone how millions of customers break things on its own platform — Trusted Advisor is that collective wisdom coded into automated checks.

The key point is that Trusted Advisor looks into an account through five lenses — cost, performance, security, fault tolerance, and service limits. It is no coincidence that these five nearly overlap the pillars of the AWS Well-Architected Framework. Trusted Advisor is, in effect, a tool that reduces part of Well-Architected to checks that can be run automatically. This note digs into what each of the five categories looks at, why the scope of checks splits by Support plan, and how to connect check results to automated response.

## The Five Categories Are the Shadow of Well-Architected

If you merely memorize Trusted Advisor's five categories you will pass the exam but miss the essence. These five are the five (later six) pillars of the **Well-Architected Framework** that AWS published in 2015 — operational excellence, security, reliability, performance efficiency, and cost optimization — carried over into a form that can be checked automatically. If Well-Architected is a qualitative framework that "people assess by answering questions in a workshop," Trusted Advisor is a tool that picks out only the items that can be judged automatically by code and turns them into "real-time automated checks."

| Category | What it looks at | Representative checks |
|----------|------------------|-----------------------|
| **Cost Optimization** | Where money leaks | Unused EBS, EIPs, and LBs, underutilized EC2, gp2 → gp3, RI/SP utilization |
| **Performance** | Bottlenecks and overload | Overutilized EC2/EBS, bloated security groups, CloudFront cache efficiency |
| **Security** | Exposure and violations | 0.0.0.0/0 SSH/RDP, public S3, Root without MFA, unrotated keys |
| **Fault Tolerance** | Single points of failure | RDS without Multi-AZ, missing snapshots, single AZ, Route 53 health checks |
| **Service Limits** | Limits approaching | Warning at 80% of each service quota |

Knowing this mapping resolves one of the exam's confusing traps — **Compliance is not among the five categories.** Compliance is not Trusted Advisor's domain but that of AWS Config (custom rule evaluation) and Audit Manager (audit reports). Trusted Advisor looks at "are best practices being followed," not "is a specific regulatory clause satisfied."

The way Trusted Advisor works is the same idea as **static analysis and linting** in software engineering. Just as ESLint or SonarQube can flag "SQL injection risk here" or "unused variable here" without running the code, Trusted Advisor scans configuration without executing anything in the account and catches anti-patterns. Both are rule-based engines that match a "ruleset of known bad patterns" against the input. The only difference is whether the target is source code or cloud resource configuration. Policy as Code (OPA, AWS Config Rules) is this idea extended across the cloud, and Trusted Advisor is the version that delivers a ruleset AWS has written in advance as a managed service.

## Why the Support Plan Splits the Scope of Checks: A Business-Model Boundary

The most frequently tested trap in Trusted Advisor is that "a free account cannot see cost optimization checks." This is not a technical constraint but a boundary created by the **AWS Support business model**. The full set of Trusted Advisor checks is effectively a consulting service, and AWS ties this added value to the paid Support plans (Business and above).

| Plan | Trusted Advisor access |
|------|------------------------|
| **Basic / Developer** | Core checks only (some security + service limits) |
| **Business / Enterprise On-Ramp / Enterprise** | All 100+ checks (all 5 categories) |

The core checks visible on the free tier (Basic/Developer) concentrate on security and service limits — these are items that "would harm the whole AWS platform if left unattended," so AWS warns about them even for free. A publicly exposed S3 bucket, specific ports open to 0.0.0.0/0, Root without MFA, public EBS/RDS snapshots, service limits approaching — leaving these as they are leads to security incidents or operational outages, which also costs AWS. Cost optimization (cleaning up unused resources, RI recommendations), on the other hand, is purely added value that saves the customer's money, so it is placed in the paid tier.

Trusted Advisor checks have an **automatic refresh interval** that differs by category. Some refresh automatically at intervals from 5 minutes to 1 week, while others need a manual refresh (`refresh-trusted-advisor-check`) before the result is reflected immediately. The reason this matters in operations is the situation where "I just fixed the security group but Trusted Advisor is still red" — the setting was changed but the check has not refreshed yet. Enterprise Support customers additionally receive **Trusted Advisor Priority**, which is a set of prioritized recommendations curated by the AWS TAM (Technical Account Manager), where a person picks out "what you need to look at right now" from hundreds of checks. It is a layer of human judgment on top of automated checks.

## From Check to Action: Building an Automated Response Pipeline with EventBridge

If Trusted Advisor stays a mere "report dashboard," you are using only half its value. Real operations lies in **connecting check results to automated response**. If someone accidentally opens SSH to 0.0.0.0/0 in a security group, it should be **closed automatically within minutes**, not discovered by an operator during the weekly review.

The center of this pipeline is **EventBridge**. When a check's status changes, Trusted Advisor publishes an event with the `aws.trustedadvisor` source, and an EventBridge rule receives it and triggers the response action.

```
Trusted Advisor check status change (e.g., SG with 0.0.0.0/0 SSH detected → status: ERROR)
   │
   ▼
EventBridge Rule (source: aws.trustedadvisor, detail.status: [ERROR, WARN])
   │
   ├──► SNS          → immediate notification to the operations team
   ├──► Lambda       → automatically remove the SG rule (revoke-security-group-ingress)
   ├──► SSM Automation → run a standard recovery runbook
   └──► OpsCenter OpsItem → create a trackable work item
```

Here one design judgment splits — **how far to take auto-remediation.** "Automatically closing 0.0.0.0/0 SSH" looks safe, but if it was intended temporary access, the automatic block disrupts operations. So mature organizations usually auto-remediate only "high-risk, clear violations (public S3, no Root MFA)" and, for ambiguous items, stop at notification + OpsItem creation to leave room for human judgment.

The common cause of numerous large data leak incidents — the 2017 consulting firm Accenture, 2017 Verizon, a 2019 US telecom, and others — was an **S3 bucket wrongly configured as public**. A bucket holding sensitive data was exposed to the internet, and security researchers or attackers found it by scanning. The lesson of these incidents is that "misconfigurations will inevitably happen," which is why **public S3 bucket detection** is included in Trusted Advisor's free checks. AWS then went on to release S3 Block Public Access (account- and bucket-level blocking), Access Analyzer (external access analysis), and Macie (automatic detection of sensitive data) in succession. Trusted Advisor's public S3 check is the outermost, cheapest first net of this defensive layering — and if you also wire up automatic notification through EventBridge, the operations team knows the moment an exposure occurs.

## Service Limits: The Value of an Early Warning That Rings at 80%

Of the five categories, the one operators underestimate most is **Service Limits** (service quotas). Every AWS service has a per-account limit — number of VPCs, number of EIPs, number of security group rules, number of running instances, and so on. When you hit one of these limits, creating a new resource simply fails. The problem is that it blows up at the **worst possible timing** — at the very moment a traffic surge makes Auto Scaling try to launch more instances, it hits the vCPU limit and the scale-out is blocked.

Trusted Advisor's Service Limits check **warns in advance when a limit reaches 80%**. This "80% early warning" is the key — a limit increase request is not processed immediately but goes through AWS approval and can take time, so requesting after you hit 100% is already too late. Getting the alert at 80% and raising the limit in advance is the proactive response.

> ⚠️ **Pitfall**: "Service limits increase automatically" is **wrong.** Increasing a limit almost always requires a **manual request + AWS approval** (the Service Quotas console or a Support case). Trusted Advisor only tells you that you have reached 80% and does not increase it automatically. If the exam presents "scale-out failed because of hitting a limit," the answer is "get an early warning at 80% from Trusted Advisor Service Limits and request an increase in advance through Service Quotas." In addition, some quotas can also be monitored and alarmed through metrics in the CloudWatch `AWS/Usage` namespace.

## Boundaries with Similar Tools: What Looks at What, and How Far

Trusted Advisor is broad but not all-purpose. The exam sets questions that precisely separate "in this situation it is X, not Trusted Advisor." It is important to know each tool's **unique domain**.

| Tool | Unique role | Difference from Trusted Advisor |
|------|-------------|---------------------------------|
| **Trusted Advisor** | Automated checks of AWS best practices (5 categories) | The broadest; the rules are fixed and provided by AWS |
| **Config** | Resource configuration change tracking + custom rule evaluation | You can define your own rules, tracks history point by point |
| **Security Hub** | Integrates findings from multiple security sources + evaluates standards (CIS, PCI) | Security specialist, multi-source aggregation |
| **Compute Optimizer** | ML-based right-sizing recommendations | Precise per-instance recommendations (TA is a coarse check) |
| **Cost Explorer** | Multidimensional cost analysis and visualization | An analysis tool, not a check |

The question that separates them is "do I need to define the rule myself?" If it is "a custom rule that fits the company standard (for example, all EBS must be encrypted)," it is a Config Rule. "The history of configuration changes point by point and who changed it" is also Config. Trusted Advisor provides only the ruleset fixed by AWS, so it cannot be customized. On the other hand, for "AWS best practices at a glance," Trusted Advisor is the broadest.

The relationship among Trusted Advisor, Config, and Security Hub can be seen as the **collect-evaluate-aggregate** layered structure of observability. Config collects the source data of resource configuration (point-in-time snapshots), Config Rules and Trusted Advisor perform rule evaluation on top of that, and Security Hub normalizes multiple evaluation results (GuardDuty, Inspector, Macie, Config, and others) into a single finding format (ASFF, AWS Security Finding Format) and aggregates them. This is the same structure as an observability pipeline that collects logs, metrics, and traces and performs correlation analysis above them. Rather than memorizing each tool separately, if you understand it as the flow "source (Config) → evaluation (TA/Rules) → aggregation (Security Hub)," what the answer is in which situation separates naturally.

## A Side Branch, but Often Asked Together: Health Dashboard and Cost Anomaly Detection

Two services appear on exams alongside Trusted Advisor in the operational-check context. **AWS Health Dashboard** points in the opposite direction from Trusted Advisor — whereas Trusted Advisor looks at "problems in my account's settings," Health Dashboard looks at "**what is happening on the AWS side**." The public Service Health Dashboard shows outages across all services, while the **Personal Health Dashboard (PHD)** filters down to only the events that actually affect my account — the scheduled retirement of my EC2 host, performance degradation of my EBS volume, the maintenance window of my RDS. You also receive these through EventBridge and automate advance response (migrating the instance beforehand).

**Cost Anomaly Detection** is the ML version of cost checking. Whereas Trusted Advisor's cost checks are rule-based static checks such as "unused resources," Cost Anomaly Detection learns the account's cost pattern and **statistically detects spikes that differ from usual**. If data transfer cost suddenly becomes 3 times the usual, it tells you "this is abnormal" even if no fixed threshold was crossed. The key distinction is that this is **detection, not blocking** — it only gives an alert and does not prevent the cost from being incurred. Blocking is the job of Budgets Action in the next note.

> ⚠️ **Pitfall**: Do not confuse Cost Anomaly Detection with Budgets. Budgets is rule-based: you set a "fixed threshold" ($5,000 per month) and it alerts when it is exceeded, while Cost Anomaly Detection catches "outliers relative to the usual pattern" with ML. Anomaly does not catch normally rising costs but Budgets catches them once the threshold is crossed; conversely, Budgets cannot catch a sudden spike within the threshold but Anomaly can. The two are complementary. And both, like PHD, are "detection and notification"; "blocking" is possible only with Budgets Action.

## Summary

Trusted Advisor is a tool that codes the best practices AWS learned from the failures of millions of customers into automated checks in five categories. Once you know those five overlap the pillars of Well-Architected, the essence shows — it turns a qualitative framework into a linter that can be checked automatically.

The five things an operator should remember are these. ① The five categories are Cost / Performance / Security / Fault Tolerance / Service Limits — Compliance is not here and is the domain of Config and Audit Manager. ② The full set of checks is the paid added value of Business and above Support, and the free tier (Basic/Developer) sees only the core security and limit checks that would harm the platform if left alone. ③ Connect check results with EventBridge to SNS, Lambda, SSM, and OpsItem to build an automated response pipeline, but decide the scope of auto-remediation carefully. ④ For Service Limits the 80% early warning is the key — limits do not increase automatically and need a manual request and approval. ⑤ Health Dashboard (AWS-side events) and Cost Anomaly Detection (ML cost anomaly detection) are detection and notification, not blocking.

In the next note we cover the internals of Cost Explorer, which analyzes cost across multiple dimensions, Budgets, which sets budgets and even applies automatic blocking when they are exceeded, and Cost Allocation Tags, which divide cost by team and project.

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
