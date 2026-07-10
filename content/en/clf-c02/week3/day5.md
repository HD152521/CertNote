# Day 5 - Week 3 Synthesis — Core Services 2 Review

If last week was the skeleton of "servers, storage, and networking," this week we learned the "operations layer" on top of it — handling data, letting services communicate, and monitoring and automating the whole. Databases, application integration (messaging), management and monitoring tools, and IaC for building infrastructure as code. Today, with no new concepts, we review by tying these pieces together with comparison tables and selection criteria.

The core is still **"when to choose what."** The answer depends on the shape of the data, the form of the communication, and the kind of information you want to see.

## Core Services 2 Map at a Glance

| Category | Representative service | One-line definition |
|------|-------------|------------|
| Database | RDS | Managed relational DB (SQL) |
| Database | Aurora | RDS-compatible high-performance cloud DB |
| Database | DynamoDB | Managed NoSQL (key-value/document) |
| Database | Redshift | Data warehouse (for analytics) |
| Integration | SQS | Message queue (async queue) |
| Integration | SNS | Publish/subscribe notifications (fan-out) |
| Integration | EventBridge | Event bus (connecting services) |
| Management | CloudWatch | Metrics, logs, alarms (monitoring) |
| Management | CloudTrail | API call audit records (who did what) |
| Management | Config | Resource configuration change tracking, compliance |
| IaC | CloudFormation | Define and deploy infrastructure as code (templates) |

> 💡 **Related theory**: The common keyword for this week's services is "Managed." AWS takes on operational burdens like patching, backups, and scaling, while users focus on data and logic. This shifts things in the direction where AWS's share of the shared responsibility model grows larger.

## Database Review: RDS vs. DynamoDB vs. Aurora vs. Redshift

All four are for "storing data," but the shape and purpose of the data differ.

| Item | RDS | Aurora | DynamoDB | Redshift |
|------|-----|--------|----------|----------|
| Type | Relational (SQL) | Relational (SQL) | NoSQL (key-value/document) | Data warehouse |
| Characteristic | Supports various engines | MySQL/PostgreSQL compatible, high performance | Millisecond responses, auto-scaling | Large-scale analytical queries |
| Suitable when | General transactional apps | High-performance relational workloads | Ultra-fast, large-scale simple lookups | Aggregating and analyzing large data volumes |

> 🎯 **Scenario**: "I need to read and write millions of users' shopping carts in milliseconds" → DynamoDB, the auto-scaling NoSQL. "I want to move an existing MySQL app somewhere faster and more reliable" → Aurora. "I run complex aggregate analysis over years of sales data" → Redshift.

> ⚠️ **Pitfall**: Distinguish "relational vs. NoSQL" from "transactional vs. analytical." RDS/Aurora are for relational transactions, DynamoDB is NoSQL, and Redshift is for analytics (OLAP). Choosing Redshift for "fast key lookups" or DynamoDB for "complex analysis" is a wrong answer.

> 💡 **Related theory**: Aurora is a member of the RDS family — an engine that is compatible with MySQL and PostgreSQL while being redesigned by AWS for the cloud. Remember RDS as "the managed relational DB bundle" and Aurora as "the high-performance option among them."

## Integration Review: SQS vs. SNS vs. EventBridge

These are tools for connecting services loosely (decoupling) instead of binding them together directly.

| Item | SQS | SNS | EventBridge |
|------|-----|-----|-------------|
| Method | Queue | Publish/subscribe (fan-out) | Event bus (routing) |
| Analogy | Stand in one line, processed in turn | Broadcast once, many receive at once | Distribute events by rules |
| Suitable when | Process work in order, slowly | Notify multiple targets of one event at once | Connect various events by condition |

> 🎯 **Scenario**: "Even when orders surge, I want to digest payment processing one at a time, reliably" → SQS, which piles them in a queue for sequential processing. "When a single order comes in, I want to notify the notification, inventory, and shipping systems at once" → SNS, which publishes once and fans out to multiple subscribers.

> 💡 **Related theory**: SQS is a "pull" queue, and SNS is "push" publish/subscribe. The "fan-out pattern" — combining the two so SNS fans out and each SQS queue receives — is also common. EventBridge is a higher-level tool that adds "rule-based routing by event content" on top of this.

## Management & Monitoring Review: CloudWatch vs. CloudTrail vs. Config

All three "observe," but **what** they watch is different. Distinguishing these three is a regular on the exam.

| Item | CloudWatch | CloudTrail | Config |
|------|------------|------------|--------|
| What it watches | Performance metrics, logs, alarms | API calls (who, when, what) | Resource configuration, change history |
| Question | "Is it running well right now?" | "Who performed this action?" | "Does this resource follow the rules?" |
| Use | Monitoring, alerting | Auditing, security tracing | Compliance, configuration tracking |

> ⚠️ **Pitfall**: "Alarm when CPU utilization is high" = CloudWatch, "trace who deleted this S3 bucket" = CloudTrail, "check whether every EBS volume is encrypted" = Config. All three "observe," which is confusing, but their roles split into **performance, auditing, and configuration compliance**.

> 💡 **Related theory**: CloudTrail records nearly all API activity within the account, making it the primary evidence for security incident investigation and auditing. It's easy to tell them apart with the analogy: CloudWatch is a "health monitor," CloudTrail is an "entry/exit log," and Config is a "compliance checklist."

## IaC Review: CloudFormation

CloudFormation is an IaC (Infrastructure as Code) service that **defines infrastructure as templates (code) to automatically create and manage it** rather than clicking by hand. It can reproduce the same environment repeatedly without mistakes.

| Concept | Meaning |
|------|------|
| Template | A code file (JSON/YAML) describing the resources to build |
| Stack | The bundle of resources created together from a template |
| Benefit | Reproducibility, version control, bulk create/delete |

> 🎯 **Scenario**: "I need to build three identical environments for dev, test, and prod." → Building each by clicking invites mistakes, so you repeatedly create stacks from a single CloudFormation template. Deletion is also cleaned up in one go, per stack.

> 💡 **Related theory**: With CloudFormation, you declare "the final state I want," and AWS creates and changes resources to reach that state. Thanks to this declarative approach, the same template produces the same result whenever you run it.

## Wrapping Up

To re-etch Core Services 2: **Databases** split by data shape into RDS/Aurora (relational), DynamoDB (NoSQL), and Redshift (analytics); **integration** loosely connects services with SQS (queue), SNS (fan-out), and EventBridge (event routing); **management** differs by what it watches with CloudWatch (performance), CloudTrail (auditing), and Config (configuration compliance); and **IaC** reproduces infrastructure as code with CloudFormation.

Remember again that the exam asks "situation → most appropriate service." In particular, the CloudWatch/CloudTrail/Config distinction and the SQS/SNS difference are frequently tested. Next week we move on to the operations and governance area — security, pricing, support, and more.

---

## 📝 연습 문제

**문제 1.** You must read and write the session information of millions of users quickly, in milliseconds, and it must scale automatically even during traffic spikes. Which database is most appropriate?

A) Amazon Redshift  
B) Amazon DynamoDB  
C) Amazon RDS for MySQL  
D) AWS CloudFormation  

**정답: B**  
해설: DynamoDB is a managed NoSQL database that provides millisecond responses and automatic scaling, making it suitable for large-scale, high-speed key-value lookups. Redshift is an analytical data warehouse with a different response orientation, RDS's auto-scaling is not as flexible as NoSQL, and CloudFormation is an IaC service, not a database.

---

**문제 2.** When a single order occurs, you want to send the same message simultaneously to the notification system, the inventory system, and the shipping system. Which service is most appropriate?

A) Amazon SQS  
B) Amazon SNS  
C) Amazon RDS  
D) Amazon CloudWatch  

**정답: B**  
해설: SNS is a publish/subscribe (fan-out) service that delivers a single message to multiple subscribers simultaneously, making it suitable for notifying many systems at once. SQS is a queue that piles messages in one line for sequential processing, RDS is a relational DB, and CloudWatch is a monitoring service, so none are meant for simultaneous fan-out notification.

---

**문제 3.** You want to trace after the fact when a specific user called which AWS API to delete a resource, for a security audit. Which service is most appropriate?

A) Amazon CloudWatch  
B) AWS CloudTrail  
C) AWS Config  
D) Amazon EventBridge  

**정답: B**  
해설: CloudTrail records "who, when, and what" for API calls within the account, making it suitable for security auditing and incident investigation. CloudWatch is for performance metric/log monitoring, Config tracks resource configuration and compliance, and EventBridge is used for event routing, so tracing the caller is not their main role.

---

**문제 4.** You want to continuously check compliance with resource configuration rules — such as "whether every EBS volume is encrypted" — and track change history. Which service is most appropriate?

A) AWS Config  
B) Amazon CloudWatch  
C) Amazon SQS  
D) Amazon Aurora  

**정답: A**  
해설: Config tracks resource configuration state and change history and detects violations of compliance rules. CloudWatch is for performance/log monitoring, SQS is a message queue, and Aurora is a database, so their roles differ from configuration-compliance checking.

---

**문제 5.** You want to repeatedly create a completely identical infrastructure environment for dev, test, and prod without mistakes, and delete it all at once when it's no longer needed. Which service is most appropriate?

A) Amazon CloudWatch  
B) AWS CloudFormation  
C) Amazon DynamoDB  
D) Amazon SNS  

**정답: B**  
해설: CloudFormation is an IaC service that defines infrastructure as templates (code) and creates/deletes it in bulk per stack, making it suitable for repeatedly building identical environments. CloudWatch is for monitoring, DynamoDB is a NoSQL DB, and SNS is a notification service, so none are meant for automatic infrastructure provisioning.

---
