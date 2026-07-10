# Day 3 - Management & Monitoring Tools: Watching and Tracing Your Systems

Once you build and start running systems, new questions arise. "The server is slow right now — is the CPU high?" "Who changed this security setting yesterday?" "Are our resources following company rules?" "Can't we patch 100 servers all at once?" The tools that answer these four questions are today's topic — CloudWatch, CloudTrail, Config, and Systems Manager.

At first the names all look similar, but **what each one watches** is different. CloudWatch watches performance, CloudTrail watches who did what, Config watches configuration state, and Systems Manager handles operational tasks. Nailing this one-line distinction is today's goal.

## Amazon CloudWatch: The Eye That Watches Performance and Health

**Amazon CloudWatch** is a monitoring service that gathers and displays the **metrics, logs, and alarms** of your AWS resources and applications. It graphs numbers over time — EC2 CPU utilization, RDS connection counts, Lambda execution time — and, when a threshold is crossed, sends notifications or takes automated action.

- **Metrics**: Collects numeric data such as CPU, network, and disk as time series.
- **Logs**: Gathers application and system logs in one place for searching.
- **Alarms**: Threshold-based alerts like "notify when CPU exceeds 80%." Can also trigger Auto Scaling.
- **Dashboards**: Multiple metrics on a single screen.

> 💡 **Related theory**: CloudWatch is a core tool for the **Operational Excellence** pillar of Well-Architected. It forms the foundation of "observability" — the ability to understand a system's internal state from the outside. When you see "performance metrics," "threshold alarms," or "log collection," it's CloudWatch.

## AWS CloudTrail: Who, When, and What Did They Do

**AWS CloudTrail** is a service that records the **API calls and activity (audit logs)** that occur within your account. If someone terminated an EC2 instance, changed an S3 bucket policy, or created an IAM user — who did it, when, from where (IP), and what they did is all recorded.

If CloudWatch watches "how the system behaves (performance)," CloudTrail watches "what people and services did (actions)." It's central to security audits, incident investigation, and compliance evidence.

| Item | CloudWatch | CloudTrail |
|------|------------|------------|
| Watches | Performance metrics, logs, alarms | API call/activity records |
| Question | "Is it running well right now?" | "Who did what?" |
| Use | Monitoring, alerting, auto-scaling | Auditing, security investigation, compliance |

> 💡 **Related theory**: When you see "trace who performed this action," "audit," "security incident investigation," or "compliance evidence," it's CloudTrail. To avoid confusing it with CloudWatch (performance), distinguish them as "performance vs. record of actions."

## AWS Config: Does the Configuration Follow the Rules

**AWS Config** is a service that **records the configuration state of resources and evaluates whether they follow defined rules**. For example, you can create rules like "every S3 bucket must be encrypted" or "no security group may open SSH to 0.0.0.0/0," and it automatically finds resources that violate them.

It also keeps a **history** of how resource configurations changed over time. You can look back and ask, "What state was this security group in a week ago?"

```
CloudTrail : "Who made the change"   (action/who)
AWS Config : "Does the current config follow the rules, and how has it changed"  (state/compliance)
```

> 💡 **Related theory**: When you see "check configuration compliance," "resource configuration history," or "detect rule violations," it's Config. It pairs with CloudTrail ("who did it") to form security and governance, but Config differs in that it focuses on **whether the resulting state matches the rules**.

## AWS Systems Manager: Operational Tasks in One Place

**AWS Systems Manager (SSM)** is a suite of tools for **operating and managing EC2 instances and on-premises servers at scale**. Instead of SSH-ing into each server one by one, you can issue commands and manage configuration from a central place.

A few frequently mentioned features:

- **Patch Manager**: Applies OS patches to large numbers of servers in bulk.
- **Session Manager**: Securely accesses a server shell without SSH keys or open ports (includes audit logs).
- **Parameter Store**: Securely stores and shares configuration values, passwords, DB connection strings, and the like.
- **Run Command**: Runs a command across many servers at once.

> 💡 **Related theory**: When you see "bulk-patch many servers," "secure access without SSH keys," "central storage of config values/secrets," or "operational automation," it's Systems Manager. Session Manager in particular is often mentioned under Security (the Security pillar) because it connects without opening port 22.

## Distinguishing the Four Tools on One Page

| Signal (keywords) | Service |
|--------------|--------|
| Performance metrics, alarms, logs, dashboards | CloudWatch |
| Who did what, auditing, security investigation | CloudTrail |
| Configuration compliance, config history, rule violations | AWS Config |
| Bulk server operations, patching, secure access, secret storage | Systems Manager |

The CLF exam frequently mixes these four to trip you up. The fastest way to tell them apart is **"what it watches / does."** Watch performance → CloudWatch, watch actions → CloudTrail, watch configuration compliance → Config, perform operational tasks → Systems Manager.

## Wrapping Up

Today we looked at four tools for watching over and managing systems. CloudWatch (performance monitoring), CloudTrail (action auditing), Config (configuration compliance), and Systems Manager (large-scale operations). They aren't used separately but together — catch anomalies with CloudWatch, trace the causing action with CloudTrail, find rule violations with Config, and apply fixes in bulk with Systems Manager.

In the next article, we'll look at how to **automatically generate and deploy this infrastructure with code** — CloudFormation, Elastic Beanstalk, and containers/serverless.

---

## 📝 연습 문제

**문제 1.** You want to track an EC2 instance's CPU utilization as a time series and send a notification when it exceeds 80%. Which service is most appropriate?

A) AWS CloudTrail  
B) Amazon CloudWatch  
C) AWS Config  
D) AWS Systems Manager  

**정답: B**  
해설: CloudWatch is a monitoring service that collects performance metrics and provides threshold-based alarms. CloudTrail is for API activity records (auditing), Config is for configuration compliance, and Systems Manager is for operational tasks, so none are meant for performance alarms.

---

**문제 2.** For a security investigation, you need to determine "who, when, and from which IP changed an S3 bucket policy." Which service is most appropriate?

A) Amazon CloudWatch  
B) AWS Config  
C) AWS CloudTrail  
D) Amazon SNS  

**정답: C**  
해설: CloudTrail is an audit-log service that records API calls and activity within the account, tracing who did what and when. CloudWatch is for performance monitoring, Config evaluates configuration state, and SNS sends notifications, so none are suited to tracing actions.

---

**문제 3.** You want to automatically detect resources that violate the company rule "every S3 bucket must be encrypted" and track configuration history. Which service is most appropriate?

A) AWS Config  
B) Amazon CloudWatch  
C) AWS Systems Manager  
D) Amazon SQS  

**정답: A**  
해설: AWS Config records resource configurations, evaluates compliance against rules (e.g., bucket encryption), and keeps configuration history. CloudWatch is for performance, Systems Manager is for operational tasks, and SQS is a message queue, so none have configuration-compliance evaluation capability.

---

**문제 4.** You want to apply OS patches in bulk to hundreds of EC2 instances without SSH keys or open ports. Which service is most appropriate?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS Systems Manager  
D) AWS Config  

**정답: C**  
해설: Systems Manager is an operational tool suite that applies large-scale patches in bulk via Patch Manager and connects securely without keys/ports via Session Manager. CloudWatch, CloudTrail, and Config are for monitoring, auditing, and configuration evaluation respectively, and don't perform bulk operational tasks.

---

**문제 5.** Which is the most accurate description of the difference in roles between CloudWatch and CloudTrail?

A) CloudWatch records API actions, and CloudTrail monitors performance  
B) CloudWatch is performance metrics/logs/alarms, and CloudTrail is the activity record of who did what  
C) Both only evaluate configuration compliance  
D) Both automate server patching  

**정답: B**  
해설: CloudWatch watches performance (metrics, logs, alarms), while CloudTrail records actions (who did what). A swaps the two; configuration compliance is Config's role and server patching is Systems Manager's role.

---
