# Day 2 - Trusted Advisor, the Five Eyes with Which AWS Inspects Your Account for You

There is a limit to how many best practices a single operator can hold in their head. "Is SSH open to 0.0.0.0/0 in a security group? Is RDS Multi-AZ? Has an IAM access key gone more than 90 days without rotation? Are EBS volume limits filling up?" - there are hundreds of such check items, and once accounts grow to dozens, human memory simply can't keep up. **Trusted Advisor** is where AWS does these checks for you. AWS knows better than anyone how millions of customers break on its own platform - Trusted Advisor is that collective wisdom codified as automated checks.

The key is that Trusted Advisor looks into your account through five lenses - cost, performance, security, fault tolerance, and service limits. It is no coincidence that these five nearly overlap the pillars of the AWS Well-Architected Framework. Trusted Advisor is in effect a tool that reduces part of Well-Architected into automatically checkable checks. This article digs into what each of those five categories looks at, why the check scope differs by Support plan, and how to connect check results to automated responses.

## The Five Categories Are the Shadow of Well-Architected

If you just memorize the five Trusted Advisor categories, you'll pass the exam but miss the essence. These five are the **Well-Architected Framework** that AWS published in 2015, with its five (later six) pillars - operational excellence, security, reliability, performance efficiency, and cost optimization - moved into an automatically checkable form. If Well-Architected is a qualitative framework in which "people evaluate by answering questions in a workshop," Trusted Advisor is a tool that picks out only the items that can be judged automatically by code and turns them into "real-time automated checks."

| Category | What it looks at | Representative checks |
|----------|-------------|-----------|
| **Cost Optimization** | Where money leaks | Unused EBS, EIPs, LBs, underutilized EC2, gp2→gp3, RI/SP utilization |
| **Performance** | Bottlenecks, overload | Overutilized EC2/EBS, bloated security groups, CloudFront cache efficiency |
| **Security** | Exposure, violations | 0.0.0.0/0 SSH/RDP, public S3, Root without MFA, unrotated keys |
| **Fault Tolerance** | Single points of failure | RDS without Multi-AZ, missing snapshots, single AZ, Route 53 health checks |
| **Service Limits** | Approaching limits | Warning at 80% of each service quota |

Knowing this mapping resolves one confusing trap on the exam - **Compliance is not among the five categories.** Compliance is the territory not of Trusted Advisor but of AWS Config (custom rule evaluation) and Audit Manager (audit reports). Trusted Advisor looks at "are you following best practices," not "do you satisfy a specific regulatory clause."

The way Trusted Advisor works is the same idea as **static analysis and linting** in software engineering. Just as ESLint or SonarQube catch "SQL injection risk here" or "unused variable here" without running the code, Trusted Advisor scans the configuration and catches anti-patterns without running the account settings. Both are rule-based engines that match a "ruleset of known bad patterns" against the input. The only difference is whether the target is source code or cloud resource configuration. This idea extended across the cloud is Policy as Code (OPA, AWS Config Rules), and Trusted Advisor is the version that provides a ruleset pre-written by AWS as a managed service.

## Why Support Plans Split the Check Scope - The Boundary of the Business Model

The most commonly tested trap in Trusted Advisor is that "a free account can't see cost optimization checks." This is not a technical constraint but a boundary created by the **AWS Support business model**. The full set of Trusted Advisor checks is effectively a consulting service, and AWS ties this added value to paid Support plans (Business and above).

| Plan | Trusted Advisor access |
|------|----------------------|
| **Basic / Developer** | Core checks only (some security + service limits) |
| **Business / Enterprise On-Ramp / Enterprise** | All 100+ checks (all 5 categories) |

The core checks visible on the free tier (Basic/Developer) are concentrated on security and service limits - these are items that "if left alone, harm the AWS platform as a whole," so AWS warns about them even for free. Public S3 buckets, specific ports open to 0.0.0.0/0, Root without MFA, public EBS/RDS snapshots, approaching service limits - left as is, these lead to security incidents or outages, which costs AWS too. Cost optimization (cleaning up unused resources, RI recommendations), on the other hand, is purely added value that saves the customer's money, so it is placed in the paid tier.

Trusted Advisor checks have **different automatic refresh intervals** per category. Some refresh automatically at intervals of 5 minutes to 1 week, but some need a manual refresh (`refresh-trusted-advisor-check`) for results to show up immediately. This matters in operations because of the situation "I just fixed the security group but Trusted Advisor is still red" - the setting is changed but the check hasn't refreshed yet. Enterprise Support customers additionally get **Trusted Advisor Priority**, which is priority recommendations curated by AWS's TAM (Technical Account Manager), where a person picks "what you should look at right now" out of hundreds of checks. It is a layer of human judgment on top of automated checks.

## Turning Checks into Action - Building an Automated Response Pipeline with EventBridge

If Trusted Advisor stays a mere "report dashboard," you're using half its value. Real operations lie in **connecting check results to automated responses**. If someone mistakenly opens SSH to 0.0.0.0/0 in a security group, it shouldn't be discovered by an operator at the weekly review but **closed automatically within minutes**.

The center of this pipeline is **EventBridge**. Trusted Advisor publishes an event with the `aws.trustedadvisor` source when a check's status changes, and an EventBridge rule receives it and triggers a response action.

```
Trusted Advisor check status change (e.g., SG with 0.0.0.0/0 SSH detected → status: ERROR)
   │
   ▼
EventBridge Rule (source: aws.trustedadvisor, detail.status: [ERROR, WARN])
   │
   ├──► SNS          → Immediate alert to the ops team
   ├──► Lambda       → Automatically remove the SG rule (revoke-security-group-ingress)
   ├──► SSM Automation → Run a standard recovery runbook
   └──► OpsCenter OpsItem → Create a trackable work item
```

Here a design judgment splits - **how far to take auto-remediation.** "Automatically closing 0.0.0.0/0 SSH" seems safe, but if it was an intended temporary access, automatic blocking disrupts operations. So mature organizations usually auto-remediate only "high-risk and clear violations (public S3, no Root MFA)" and leave ambiguous items at alerts + OpsItem creation, preserving human judgment.

A common cause of many large breaches, such as the 2017 consulting firm Accenture, 2017 Verizon, and a 2019 US telecom, was an **S3 bucket misconfigured as public**. Buckets containing sensitive data were exposed to the internet, and security researchers or attackers discovered them by scanning. The lesson of these incidents is that "configuration mistakes will inevitably happen," which is why **public S3 bucket detection** is included in Trusted Advisor's free checks. Furthermore, AWS subsequently released S3 Block Public Access (account- and bucket-level blocking), Access Analyzer (external access analysis), and Macie (automatic sensitive data detection) in succession. Trusted Advisor's public S3 check is the outermost, cheapest first net of this defense layer - if you also attach automatic alerts through EventBridge, the ops team knows the moment an exposure occurs.

## Service Limits - The Value of an Early Warning at 80%

Among the five categories, the one operators underestimate most is **Service Limits** (service quotas). Every AWS service has per-account limits - number of VPCs, number of EIPs, number of security group rules, number of running instances, and so on. When you hit such a limit, creating new resources simply fails. The problem is that this blows up at the **worst possible timing** - at the very moment traffic surges and Auto Scaling tries to launch more instances, it hits the vCPU limit and scale-out is blocked.

Trusted Advisor's Service Limits check **warns in advance when 80% of a limit is reached**. This "80% early warning" is the key - a limit increase request isn't processed immediately but goes through AWS approval and can take time, so requesting after hitting 100% is already too late. Getting an alert at 80% and increasing the limit in advance is the proactive response.

> ⚠️ **Pitfall**: "Service limits increase automatically" is **wrong.** Limit increases almost always require a **manual request + AWS approval** (Service Quotas console or a Support case). Trusted Advisor only tells you when 80% is reached and does not increase it automatically. If the exam presents "scale-out failed from hitting a limit," the answer is "get an early warning at 80% with Trusted Advisor Service Limits and request an increase in advance with Service Quotas." Also, some quotas can be monitored and alarmed through CloudWatch's `AWS/Usage` namespace metrics.

## Boundaries with Similar Tools - What Looks at What

Trusted Advisor is broad but not a cure-all. The exam asks questions that precisely distinguish "in this situation, it's X, not Trusted Advisor." It is important to know each tool's **unique territory**.

| Tool | Unique role | Difference from Trusted Advisor |
|------|-----------|--------------------------|
| **Trusted Advisor** | Automated checks of AWS best practices (5 categories) | Broadest, rules fixed and provided by AWS |
| **Config** | Resource configuration change tracking + custom rule evaluation | Can define your own rules, tracks point-in-time history |
| **Security Hub** | Consolidates findings from multiple security sources + evaluates standards (CIS, PCI) | Security-specialized, multi-source aggregation |
| **Compute Optimizer** | ML-based right-sizing recommendations | Precise per-instance recommendations (TA is a coarse check) |
| **Cost Explorer** | Multi-dimensional cost analysis and visualization | An analysis tool, not a check |

The question that draws the boundary is "do I need to define the rules?" If it's "a custom rule matching company standards (e.g., all EBS must be encrypted)," it's a Config Rule. "The point-in-time history of configuration changes and who changed it" is also Config. Trusted Advisor provides only the ruleset fixed by AWS, so it cannot be customized. On the other hand, "all AWS best practices at a glance" is where Trusted Advisor is broadest.

The relationship among Trusted Advisor, Config, and Security Hub can be viewed as the **collect-evaluate-aggregate** layered structure of observability. Config collects the source data of resource configuration (point-in-time snapshots), on top of it Config Rules and Trusted Advisor perform rule evaluation, and Security Hub normalizes multiple evaluation results (GuardDuty, Inspector, Macie, Config, etc.) into a single finding format (ASFF, AWS Security Finding Format) and aggregates them. This is the same structure as an observability pipeline that collects logs, metrics, and traces and correlates them at a higher level. Rather than memorizing each tool separately, if you understand the flow "source (Config) → evaluation (TA/Rules) → aggregation (Security Hub)," which is the answer in which situation splits naturally.

## Two Side Branches That Are Often Bundled - Health Dashboard and Cost Anomaly Detection

Two services appear together with Trusted Advisor in operational check contexts. **AWS Health Dashboard** points the opposite direction from Trusted Advisor - while Trusted Advisor looks at "problems with my account's settings," Health Dashboard looks at "**what is happening on the AWS side**." The public Service Health Dashboard shows overall service outages, and the **Personal Health Dashboard (PHD)** filters only the events that actually affect my account - scheduled retirement of my EC2 host, performance degradation of my EBS volume, my RDS maintenance window. These too are received via EventBridge to automate proactive responses (migrating instances ahead of time).

**Cost Anomaly Detection** is the ML version of cost checks. If Trusted Advisor's cost checks are rule-based static checks like "unused resources," Cost Anomaly Detection learns the account's cost patterns and **statistically detects spikes that differ from usual**. If data transfer cost suddenly becomes 3 times the usual, it flags "this is abnormal" even if it hasn't exceeded any fixed threshold. The key distinction is that this is **detection, not blocking** - it only alerts and doesn't prevent costs from being incurred. Blocking is the job of the next article's Budgets Action.

> ⚠️ **Pitfall**: Don't confuse Cost Anomaly Detection with Budgets. Budgets is rule-based: you set a "fixed threshold" (monthly $5,000) and it alerts when exceeded, while Cost Anomaly Detection catches "outliers relative to the usual pattern" with ML. Anomaly doesn't catch normally rising cost, but Budgets catches it when it exceeds the threshold; conversely, Budgets can't catch a sudden spike within the threshold, but Anomaly does. The two are complementary. And both, like PHD, are "detection and alerts," and "blocking" is possible only with Budgets Action.

## Summary

Trusted Advisor is a tool that codifies the best practices AWS learned from millions of customers' failures as automated checks across five categories. Once you know those five overlap Well-Architected's pillars, the essence appears - it turns a qualitative framework into a linter that can be checked automatically.

Here are the five things an operator should remember. (1) The five categories are Cost / Performance / Security / Fault Tolerance / Service Limits - Compliance is not here and is the territory of Config and Audit Manager. (2) The full set of checks is paid added value of Business and above Support, and free (Basic/Developer) sees only the core security and limit checks that would harm the platform if left alone. (3) Connect check results through EventBridge to SNS, Lambda, SSM, and OpsItem to build an automated response pipeline, but decide the scope of auto-remediation carefully. (4) For Service Limits the 80% early warning is the key - limits don't increase automatically and require a manual request and approval. (5) Health Dashboard (AWS-side events) and Cost Anomaly Detection (ML cost anomaly detection) are detection and alerts, not blocking.

In the next article we cover the internals of Cost Explorer, which analyzes cost across multiple dimensions, Budgets, which sets budgets and even applies automatic blocking when exceeded, and Cost Allocation Tags, which split cost by team and project.

---

## 📝 Practice Questions

**Question 1.** An operator must pick one of the choices in a question asking about "the five categories of Trusted Advisor." Which one is **not included** in the five categories?

A) Cost Optimization

B) Fault Tolerance

C) Compliance

D) Service Limits

**Answer: C**

Explanation: The five Trusted Advisor categories are Cost Optimization / Performance / Security / Fault Tolerance / Service Limits, which move the pillars of the AWS Well-Architected Framework into an automated check form. Compliance is not here - whether a specific regulatory clause is satisfied is the territory of AWS Config (custom rule evaluation) and Audit Manager (audit reports). Trusted Advisor looks at "are you following best practices," not "do you satisfy a specific regulation."

---

**Question 2.** A company on the Basic Support plan wants to receive cost optimization recommendations such as "unused EBS volumes" and "underutilized EC2" in Trusted Advisor. What is needed?

A) Just add IAM permissions

B) Upgrade to the Business or Enterprise Support plan - the full 100+ checks (including the cost category) are exclusive to paid plans

C) Change the Region to us-east-1

D) Install the CloudWatch Agent

**Answer: B**

Explanation: The core checks visible on the free tier (Basic/Developer) are limited to some security and service limits - items that would harm the whole platform if left alone. Cost optimization (unused resources, RI recommendations) is purely added value that saves the customer's money, so it is tied to paid Support plans of Business and above. This is not a technical constraint but a boundary created by the AWS Support business model. To see all 100+ checks across 5 categories, a plan upgrade is required.

---

**Question 3.** You want to make it so that if someone mistakenly opens SSH to 0.0.0.0/0 in a security group, it is closed automatically within minutes and the ops team is notified. Which configuration is correct?

A) Check with a weekly manual review

B) Trusted Advisor check status change → EventBridge Rule (source: aws.trustedadvisor) → Lambda (remove rule) + SNS (notification)

C) Read CloudTrail logs every day

D) Enable only Config

**Answer: B**

Explanation: Trusted Advisor publishes an event with the `aws.trustedadvisor` source when a check's status changes. Receiving it with an EventBridge rule and connecting it to Lambda (automatically removing the rule with `revoke-security-group-ingress`), SNS (immediate alert), SSM Automation (runbook), and OpsItem (tracking) forms an automated response pipeline. However, the scope of auto-remediation must be decided carefully - automatically blocking even intended temporary access can disrupt operations, so the mature pattern is to auto-remediate only clear high-risk violations and leave ambiguous items at alerts.

---

**Question 4.** Due to a traffic surge, Auto Scaling tried to add instances but hit the vCPU limit and scale-out failed. How do you prevent this in advance?

A) Limits increase automatically, so just wait

B) Get an alert at 80% with Trusted Advisor Service Limits and request an increase in advance with Service Quotas (approval takes time)

C) Make the instances larger

D) Switch to Spot

**Answer: B**

Explanation: Service limits don't increase automatically - they require a manual request + AWS approval and take time. So requesting after hitting 100% is already too late. Trusted Advisor's Service Limits check gives an early warning at 80%, so at that point you should request an increase in advance via the Service Quotas console or a Support case to secure headroom before hitting the limit. Some quotas can also be alarmed through the CloudWatch `AWS/Usage` namespace.

---

**Question 5.** AWS has notified you that the physical host running your EC2 instance is scheduled for retirement (replacement), and you want to migrate in advance. Which service is right?

A) Trusted Advisor

B) AWS Personal Health Dashboard (PHD) + EventBridge

C) CloudTrail

D) Inspector

**Answer: B**

Explanation: Trusted Advisor looks at "problems with my account's settings," but "what is happening on the AWS side" (host retirement, EBS performance degradation, RDS maintenance) is covered by AWS Health Dashboard, and within it the Personal Health Dashboard (PHD), which filters only the events that actually affect my account. If you receive PHD events via EventBridge and automate the advance migration, you can move instances without downtime before retirement.

---

**Question 6.** The company's cost hasn't exceeded any fixed budget threshold, but data transfer cost suddenly jumped to 3 times its usual pattern. How do you automatically detect such pattern-based anomalies?

A) AWS Budgets (fixed-threshold based)

B) Cost Anomaly Detection - learns the usual pattern with ML and statistically detects outliers (spikes)

C) Trusted Advisor Cost

D) CloudWatch Alarm

**Answer: B**

Explanation: Budgets is rule-based, alerting when a fixed threshold like "monthly $5,000" is exceeded, so it can't catch a sudden spike within the threshold. Cost Anomaly Detection learns the account's cost patterns with ML and statistically detects outliers relative to the usual, so it catches spikes that are "different from usual" even without exceeding a fixed threshold. The two are complementary. However, Anomaly Detection is detection and alerting, not blocking - it cannot prevent the cost from being incurred.

---

**Question 7.** A company wants to continuously evaluate compliance with its own standard that "all EBS volumes must be encrypted" and to track violation times and change history. What should it use instead of Trusted Advisor?

A) Trusted Advisor Security category

B) AWS Config + a custom Config Rule (encrypted-volumes) - custom rule definition and point-in-time configuration history tracking are possible

C) Cost Explorer

D) Compute Optimizer

**Answer: B**

Explanation: Trusted Advisor provides only the ruleset fixed by AWS, so you can't define "our company's own custom rules," and it doesn't track the point-in-time change history of configuration. Custom rule evaluation and change history are AWS Config's unique territory - evaluate continuously with a managed/custom Config Rule such as `encrypted-volumes`, and use the configuration timeline to track when and who put a resource into a violating state. "Do I need to define the rules?" is the question that separates Config from Trusted Advisor.

---

## 📌 Today's Summary

1. Trusted Advisor's five categories (Cost/Performance/Security/Fault Tolerance/Service Limits) move the Well-Architected pillars into an automated check linter - Compliance is not here and is the territory of Config and Audit Manager
2. The full 100+ checks are the paid added value of Business and above Support, while free sees only the core security and limit checks that would harm the platform if left alone
3. Connect EventBridge (source: aws.trustedadvisor) to SNS, Lambda, SSM, and OpsItem to build an automated response pipeline, and be careful with the scope of auto-remediation
4. For Service Limits the 80% early warning is the key - limits don't increase automatically and need a manual request and approval
5. Health Dashboard (PHD) is AWS-side events, Cost Anomaly Detection is ML cost anomaly detection - both are detection and alerts, not blocking
