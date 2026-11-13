# Day 4 - The Full 50-Question Mock Exam, and What Your Wrong Answers Tell You

The value of a mock exam is not the score but the **pattern in your wrong answers**. The ways people miss questions on SOA-C02 are consistent: confusing two similar services (CloudTrail/Config, SG/NACL), overlooking a qualifier ("MOST cost-effective", "LEAST operational overhead"), or failing to tell apart an option that "works" from the option that is "the most suitable." These 50 questions deliberately lay out those traps. Do not just get them right and move on; check which pattern each missed question falls into. The short note at the start of each domain group points to "where wrong answers cluster."

---

## 🧩 Exam-Taking Guide

- **Recommended time**: 90 minutes (half the pace of the real 180 minutes). **Scoring**: correct/50×100, with around 80% as the sense of a passing line
- **Marking**: if you are unsure, mark with a star (★) and review later, which practices the real exam's flag feature. **Handling wrong answers**: classify each missed question as "confusion / missed qualifier / trap" and record it

---

## 📝 50-Question Mock Exam

### Domain 1: Monitoring, Logging, and Remediation (10 questions)

The 2019 Capital One breach is a representative incident showing the value of this domain. A former AWS employee launched an SSRF attack through a misconfigured WAF, stole the IAM credentials from the EC2 metadata, and used those permissions to pull data on about 106 million people out of S3. In the post-incident investigation, the abnormal `ListBuckets` and bulk `GetObject` patterns in the CloudTrail logs became the key evidence for sizing the breach. If CloudTrail had been off, tracing would have been impossible, and if GuardDuty had been in place, it would have caught this pattern while the attack was in progress. Almost all wrong answers in this domain come from confusing "types of records" (CloudTrail = actions, Config = state, Logs = application logs, Flow Logs = traffic), so the order of business is to first classify "what is the question asking a record of."

**Question 1.** How do you collect the EC2 memory utilization metric?
A) It is included in the default metrics
B) The CloudWatch Agent must be installed
C) CloudTrail
D) Config

**Answer: B**

Explanation: The hypervisor cannot see inside the guest OS, so memory and disk utilization are not in the standard metrics. You must install the CloudWatch Agent on the OS and push `mem_used_percent`. "Memory = Agent" is the reflex answer.

---

**Question 2.** Which feature combines multiple alarms to prevent an alarm storm?
A) Anomaly Detection
B) Composite Alarm
C) Metric Math
D) Dashboard

**Answer: B**

Explanation: A Composite Alarm combines multiple alarms with AND/OR so that it fires only when, say, "CPU is high AND memory is high," preventing an alarm storm. Anomaly Detection is a dynamic threshold, and Metric Math is metric arithmetic.

---

**Question 3.** Which service tracks the history of API calls?
A) CloudWatch Logs
B) CloudTrail
C) VPC Flow Logs
D) Config

**Answer: B**

Explanation: CloudTrail is the audit service that leaves an event stream of "who called what API and when." Logs = application logs, VPC Flow Logs = network metadata, Config = resource state.

---

**Question 4.** How do you view the change history of a security group in chronological order?
A) Look up the `AuthorizeSecurityGroupIngress` events in CloudTrail
B) Config (the configuration history timeline)
C) The trend in the number of rules in CloudWatch metrics
D) Analyze the rejected-traffic logs in VPC Flow Logs

**Answer: B**

Explanation: A trap question. CloudTrail also records SG change APIs (`AuthorizeSecurityGroupIngress` and so on), but showing "what rule set was in place at each point in time" as a timeline is Config, because it is a state-based model that stacks configuration snapshots in chronological order. "Who changed it" is CloudTrail, and "what was the state at that time" is Config.

---

**Question 5.** Which query in Logs Insights aggregates a specific error log in 5-minute buckets?
A) `count(*) by error`
B) `stats count(*) by @message`
C) `filter @message like /ERROR/ | stats count() as cnt by bin(5m)`
D) `select count(*)`

**Answer: C**

Explanation: Logs Insights uses a pipe (|) based language, not SQL. You filter for ERROR with `filter` and aggregate into 5-minute buckets with `stats count() by bin(5m)`, and `bin(5m)` is the key function. The rest are not valid syntax.

---

**Question 6.** How can a Config Rule automatically fix a non-compliant resource?
A) Directly attach a Lambda ARN to the Config Rule and invoke it
B) Remediation Action (SSM Automation Document)
C) Receive the non-compliance event with an EventBridge rule and run a workflow
D) Redeploy the resource with a CloudFormation stack update

**Answer: B**

Explanation: Config's Remediation invokes an SSM Automation Document to return the resource to its standard state. It is idempotent ("make it be in this state"), so it is safe against duplicate execution. EventBridge could also do it, but Config's built-in mechanism is the Remediation Action.

---

**Question 7.** How do you set an alarm on a metric where a static threshold is hard to define (strong day-of-week and time-of-day patterns)?
A) A standard Alarm
B) Composite Alarm
C) Anomaly Detection (ML-trained band)
D) Metric Filter

**Answer: C**

Explanation: Anomaly Detection trains on historical data with ML to draw a dynamic "normal band" and alarms when the metric leaves it. For metrics whose normal values change, such as weekday/weekend and day/night, a fixed threshold produces many false positives and false negatives, whereas a band follows the pattern and fits well.

---

**Question 8.** How do you view CloudWatch metrics and logs from multiple accounts on a single dashboard?
A) Keep each account separate
B) Cross-Account Observability (Source + Monitoring accounts)
C) CloudTrail
D) Config Aggregator

**Answer: B**

Explanation: CloudWatch Cross-Account Observability lets one monitoring account view the metrics, logs, and traces of multiple source accounts in an integrated way. Config Aggregator (D) consolidates configuration compliance, so it is a different kind of thing.

---

**Question 9.** How do you turn the number of occurrences of the word "ERROR" in a Log Group into a metric and set an alarm on it?
A) Subscription Filter
B) Metric Filter
C) Insights Query
D) EMF

**Answer: B**

Explanation: A Metric Filter matches a log pattern (ERROR), converts it into a CloudWatch metric, and lets you set an alarm. A Subscription Filter is real-time delivery to Kinesis/Lambda, Insights is an interactive query, and EMF is a metric-embedding format. "Log → metric + alarm" is a Metric Filter.

---

**Question 10.** What is the purpose of CloudTrail Lake?
A) Real-time alerts
B) Long-term retention of trail data in a data lake searchable with SQL
C) Replacing Config
D) Replacing Logs

**Answer: B**

Explanation: Regular CloudTrail just accumulates in S3 and is cumbersome to search. CloudTrail Lake retains events long term in a managed data lake and lets you query them directly with SQL ("a specific user's DeleteBucket over the past year" in one line). It is for auditing, forensics, and long-term analysis.

---

### Domain 2: Reliability and BCP (8 questions)

> 🔍 **Going deeper**: Replication wrong answers come from confusing "purpose." Multi-AZ (synchronous, HA, zero loss) and Read Replica (asynchronous, read scaling, lag) differ starting from the replication method. Underneath is the **CAP theorem**: synchronous replication prioritizes consistency (C) so there is zero loss but write latency grows, while asynchronous prioritizes availability and performance and tolerates weak consistency during replication lag. So if you send a read-after-write workload ("read what was just written right away") to a Read Replica, you get a bug where it reads old data. The four DR strategies are RTO/RPO coordinates, and the boundary between Pilot Light (app tier turned off, RTO tens of minutes) and Warm Standby (a scaled-down full stack always running, RTO within minutes) is a perennial trap.

**Question 11.** What is the main purpose of RDS Multi-AZ?
A) Improving read performance
B) HA (automatic failover)
C) Backup
D) Cost reduction

**Answer: B**

Explanation: Multi-AZ is a high-availability feature that replicates synchronously to a standby in another AZ and fails over automatically when the primary fails. The standby receives no traffic in normal operation, so it is not for improving read performance (A); read scaling is a Read Replica.

---

**Question 12.** How do you scale RDS read performance?
A) Multi-AZ
B) Read Replica
C) Snapshot
D) RI

**Answer: B**

Explanation: A Read Replica sets up multiple asynchronous replicas and distributes read traffic. Because it is asynchronous, though, there is replication lag, so reads that must see just-written data right away (read-after-write) and where consistency matters should go to the primary.

---

**Question 13.** What is the global Aurora deployment for protection against a Region failure?
A) Aurora Global Database
B) Multi-AZ
C) Cross-Region Snapshot
D) RDS Proxy

**Answer: A**

Explanation: Aurora Global Database replicates from the primary Region to secondary Regions over dedicated infrastructure (RPO is typically within 1 second), and on a Region failure you promote a secondary to recover. Multi-AZ (B) is single-Region HA, so it cannot protect against a whole-Region failure.

---

**Question 14.** What is the lightest way to implement daily automatic EBS snapshots with a retention policy?
A) Configure an AWS Backup plan and retention rule for EBS backups
B) Data Lifecycle Manager (DLM)
C) Define a snapshot resource in CloudFormation and deploy it daily
D) EventBridge schedule + Lambda manually calling `CreateSnapshot`

**Answer: B**

Explanation: A trap question. AWS Backup (A) is also possible, but if the requirement is "EBS only, the lightest way," DLM is the direct answer, a dedicated lightweight tool that automates EBS snapshots, AMIs, and retention based on tags. AWS Backup is for integration across multiple services (RDS, EFS, DynamoDB).

---

**Question 15.** Which DR strategy has an RTO in the minutes range with moderate cost?
A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**Answer: B**

Explanation: Pilot Light keeps only the core (DB) continuously replicated and leaves the app and web tiers off until a failure, giving an RTO in minutes and mid-range cost. Warm Standby (C) keeps a scaled-down full stack always running for an RTO within minutes, which is faster but more expensive. "Minutes + moderate cost" is Pilot Light.

---

**Question 16.** How do you automatically replicate S3 objects to another Region?
A) S3 Lifecycle
B) Cross-Region Replication (CRR)
C) Snowball
D) Storage Gateway

**Answer: B**

Explanation: CRR asynchronously and automatically replicates the objects in one bucket to a bucket in another Region (for Region-failure protection, lower latency, and regulatory requirements). Lifecycle (A) is storage class transition and expiration, not replication.

---

**Question 17.** In Route 53, which gives an Active/Passive setup (Primary normally, Secondary on failure)?
A) Weighted
B) Failover (Primary + Secondary + Health Check)
C) Latency
D) Geolocation

**Answer: B**

Explanation: Failover routing attaches a health check to the Primary record and sends traffic to the Primary if it is healthy and to the Secondary if it is not, which is the classic Active/Passive. Weighted (A) is weighted distribution (A/B tests, canaries), and Latency (C) is nearest Region.

---

**Question 18.** What is the purpose of AWS Backup Vault Lock?
A) Cost reduction
B) Preventing backup deletion (WORM, regulatory requirement)
C) Encryption
D) Compression

**Answer: B**

Explanation: Vault Lock applies a WORM (Write Once Read Many) policy to a backup vault so that backups cannot be deleted or changed during the retention period (defense against ransomware, insiders, and mistakes, and a regulatory requirement). As a side note, retaining S3 objects themselves is S3 Object Lock, while retaining backup resources is Vault Lock, so do not confuse the two.

---

### Domain 3: Deployment and Automation (9 questions)

> 🔍 **Going deeper**: SSM components split into one-shot (Run), maintain (State), scheduled (Patch + MW), and connect (Session). The mechanism by which Session Manager replaces SSH is a perennial topic, and the key point is that **it opens no inbound ports at all**: the SSM Agent opens an outbound connection to the SSM endpoint and the session flows over it (authentication = IAM, auditing = CloudTrail/Logs, key management disappears). In a private subnet you need the ssm, ssmmessages, and ec2messages Interface Endpoints. And automatic remediation must be **idempotent**: as RFC 9110 defines, EventBridge and SQS deliver at-least-once so duplicates are possible, which means it is safe only if it is declarative ("ensure this state") rather than "append."

**Question 19.** How do you review changes before applying them in CloudFormation?
A) Use Drift Detection to compare actual resources against the template beforehand
B) Change Set
C) Configure automatic rollback on failure with a Rollback Configuration
D) Isolate the change's impact by module with a Nested Stack

**Answer: B**

Explanation: A Change Set shows in advance, before applying, which resources a template change will actually add, modify, or delete. It is a safeguard that catches unintended deletions (for example, data loss caused by resource replacement) beforehand. Drift Detection (A) looks at the difference between actual resources and the template after the fact.

---

**Question 20.** How do you deploy the same IaC to multiple accounts/Regions in bulk?
A) Nested Stack
B) StackSets
C) Cross-Stack Reference
D) Change Set

**Answer: B**

Explanation: StackSets deploys and manages one template across multiple accounts and multiple Regions at once (for example, applying the same security baseline across an entire organization). A Nested Stack (A) is modularization within one stack, and a Cross-Stack Reference (C) is referencing outputs between stacks.

---

**Question 21.** Which deployment offers zero downtime and instant rollback if there is a problem?
A) All at once
B) Rolling
C) Blue/Green
D) In-place

**Answer: C**

Explanation: Blue/Green keeps the old environment (blue) while bringing up the new environment (green), switches traffic over, and rolls back instantly with a single switch back to blue if there is a problem. The traps are TTL delay if the switch is DNS-based, and schema compatibility if the DB is shared.

---

**Question 22.** How do you automatically apply OS patches to 100 EC2 instances on a monthly schedule with SSM?
A) Run Command manually
B) Patch Manager + Maintenance Window
C) State Manager only
D) Automation only

**Answer: B**

Explanation: Patch Manager defines the patch baseline (approval delay by classification and severity), and the Maintenance Window runs the task on a recurring schedule such as "a specific time each month." Run Command (A) is one-shot immediate execution, so it has no recurrence.

---

**Question 23.** How do you connect to EC2 securely without SSH keys or port 22?
A) Bastion
B) Session Manager
C) VPN
D) Direct Connect

**Answer: B**

Explanation: Session Manager opens a shell through the SSM Agent's outbound connection, so inbound ports can be zero, authorizes through IAM, and audits every session through CloudTrail. A Bastion (A) is one more thing to manage and expose, so the operational load is large.

---

**Question 24.** How do you automatically rotate a DB master password periodically with no downtime?
A) Parameter Store SecureString
B) Secrets Manager + Lambda Rotation
C) KMS only
D) IAM

**Answer: B**

Explanation: Automatic rotation is a core feature of Secrets Manager (built-in for RDS, or Lambda rotation). Parameter Store SecureString (A) stores encrypted values but has no automatic rotation. "DB password rotation = Secrets Manager" is the reflex answer.

---

**Question 25.** How do you detect differences between a CloudFormation template and the actual resources?
A) Use a Change Set to preview the resource impact of the next change
B) Drift Detection
C) Trigger an automatic rollback with a Rollback Trigger when a threshold is exceeded
D) Compare Nested Stack output values against actual resource IDs

**Answer: B**

Explanation: Drift Detection reports the difference (drift) when someone modified a resource outside the stack through the console or CLI so that the actual state no longer matches the template. It is the feature that exposes the diff between desired (template) and actual (real). A Change Set (A) is a preview of changes before applying.

---

**Question 26.** How do you let users safely self-service deploy approved IaC?
A) The CloudFormation console only
B) Service Catalog
C) Proton
D) Beanstalk

**Answer: B**

Explanation: Service Catalog lets administrators build a catalog of approved IaC products, and users self-service deploy only from within it (governance + autonomy). Proton (C) is a platform team's tool for standard container and serverless stacks, so it is a different kind of thing.

---

**Question 27.** How do you immediately run a one-time command on 100 EC2 instances?
A) Run Command
B) State Manager
C) Patch Manager
D) Maintenance Window

**Answer: A**

Explanation: Run Command runs an immediate one-shot command on many instances. State Manager (B) continuously maintains a desired state (applied periodically), and Patch Manager (C) is patch-specific. "Immediate, one-shot" is Run Command.

---

### Domain 4: Security and Compliance (8 questions)

> 💡 **Related theory**: Security service wrong answers happen from not asking "what does it look at?": GuardDuty = behavior (logs), Inspector = vulnerabilities, Macie = data (S3), Security Hub = aggregation. Permissions are the AND intersection of SCP (ceiling), Permission Boundary (ceiling), and Identity (grant), and an explicit Deny beats all of them.

**Question 28.** How do you apply a permission guardrail to all accounts at the organization (Organizations) level?
A) IAM Policy
B) Permission Boundary
C) SCP
D) Identity Center

**Answer: C**

Explanation: An SCP is a permission ceiling (guardrail) applied to OUs/accounts in Organizations. However, an SCP does not grant permissions, it only restricts; the actual permissions must be granted separately through each account's IAM policies. A Permission Boundary (B) works at the level of an individual IAM entity, so its scope is different.

---

**Question 29.** How do you individually set a ceiling on the maximum permissions an IAM role or user can have?
A) SCP
B) Permission Boundary
C) Resource Policy
D) Session Policy

**Answer: B**

Explanation: A Permission Boundary defines the permission ceiling for a specific IAM entity (role/user). For example, it lets you delegate permissions to a developer while preventing the roles they create from ever exceeding administrator permissions. An SCP (A) works on a whole-account basis, so its granularity is different.

---

**Question 30.** How do you automatically detect PII (sensitive information) stored in S3?
A) Inspector
B) Macie
C) GuardDuty
D) Security Hub

**Answer: B**

Explanation: Macie scans the contents of S3 objects with ML to find where PII such as national ID numbers and card numbers is located and whether it is exposed. Inspector (A) is software vulnerabilities and GuardDuty (C) is behavior-based threats, so neither looks at data contents. "S3 data contents = Macie."

---

**Question 31.** How do you scan EC2, ECR images, and Lambda for known vulnerabilities (CVEs)?
A) GuardDuty
B) Inspector
C) Macie
D) Detective

**Answer: B**

Explanation: Inspector compares the software packages of EC2, container images, and Lambda against the CVE database to find unpatched vulnerabilities. "Vulnerability scanning = Inspector" is the reflex answer.

---

**Question 32.** How do you detect in-progress threats by analyzing VPC Flow Logs, DNS, and CloudTrail?
A) Macie
B) GuardDuty
C) Inspector
D) Config

**Answer: B**

Explanation: GuardDuty correlates these three log streams to detect in-progress threats such as communication with malicious IPs, abnormal API patterns, and credential theft. It is a service that looks at behavior (logs), so it catches "the attack happening now."

---

**Question 33.** How do you collect findings from multiple security services in one place and score them against standards (CIS, PCI)?
A) GuardDuty
B) Security Hub
C) Detective
D) Config

**Answer: B**

Explanation: Security Hub aggregates the findings from GuardDuty, Inspector, Macie, and Config and assigns compliance scores against security standards such as CIS, PCI-DSS, and NIST. The key is the "consolidated dashboard," not individual detection.

---

**Question 34.** How do you automatically detect IAM and resource access that is unintentionally exposed externally (other accounts or the public)?
A) IAM Access Analyzer
B) GuardDuty
C) Config
D) Trusted Advisor

**Answer: A**

Explanation: IAM Access Analyzer analyzes resource policies (S3, roles, KMS) with automated reasoning (formal logic) to find access paths exposed externally. GuardDuty (B) is behavioral threats, so it is a different kind of thing.

---

**Question 35.** How do you automate evidence collection and report generation for PCI-DSS, SOC, and HIPAA compliance?
A) Export the Security Hub compliance score as evidence
B) Audit Manager
C) Substitute AWS certificates obtained from Artifact for the report
D) Manually compile and document Config rule compliance status

**Answer: B**

Explanation: Audit Manager automatically collects evidence per framework (CloudTrail, Config, and so on) and produces audit reports. Artifact (C) is where you get AWS's own compliance documents, so it is different. "Automating reports for my own environment" is Audit Manager.

---

### Domain 5: Networking and Content Delivery (9 questions)

> ⚠️ **Pitfall**: Networking wrong answers cluster around confusing SG/NACL stateful/stateless and around Endpoint types. Packets are inspected in the order IGW → Route → NACL → SG, the NACL is stateless so you must explicitly allow outbound ephemeral ports (1024-65535), and the free Gateway Endpoint is for S3/DDB only.

**Question 36.** What is a characteristic of a Security Group?
A) Stateless
B) Stateful (responses automatically allowed)
C) Subnet-level
D) Supports Deny rules

**Answer: B**

Explanation: An SG is stateful, so it uses a connection tracking table to automatically allow the responses to outbound connections. That is why you only need to write inbound rules, it supports only allow rules (no deny), and it applies at the instance (ENI) level, not the subnet.

---

**Question 37.** Which option gives free private connectivity to S3 and DynamoDB only?
A) Interface Endpoint
B) Gateway Endpoint
C) PrivateLink
D) NAT Gateway

**Answer: B**

Explanation: A Gateway Endpoint is dedicated to S3 and DynamoDB and is free; it sends traffic straight into AWS through a route table entry. Interface Endpoints/PrivateLink (A, C) support most services but charge per hour plus per GB.

---

**Question 38.** How do you statically analyze the network path between two resources without actual traffic?
A) VPC Flow Logs
B) Reachability Analyzer
C) Traffic Mirroring
D) Network Access Analyzer

**Answer: B**

Explanation: Reachability Analyzer statically analyzes the configuration of SGs, NACLs, routes, and so on, and reports whether the destination is reachable and where it is blocked (no actual packets needed). VPC Flow Logs (A) are a record after actual traffic has occurred.

---

**Question 39.** How do you accelerate UDP game traffic globally?
A) CloudFront
B) Global Accelerator
C) Route 53
D) ALB

**Answer: B**

Explanation: CloudFront is dedicated to HTTP/S caching, so it cannot handle UDP. Global Accelerator accelerates TCP and UDP over the AWS private backbone and provides static Anycast IPs. "UDP / non-HTTP global acceleration = Global Accelerator."

---

**Question 40.** What is the current standard for blocking direct S3 access in CloudFront?
A) OAI (legacy)
B) OAC (Origin Access Control)
C) Signed URL only
D) Bucket Policy only

**Answer: B**

Explanation: OAC is the standard that replaced OAI in 2022, is based on SigV4 signing, and supports even KMS-encrypted objects. You keep S3 private and force access through CloudFront only via OAC. OAI is classified as legacy.

---

**Question 41.** How do you connect many VPCs in a hub-and-spoke topology?
A) VPC Peering
B) Transit Gateway
C) Direct Connect
D) VPN

**Answer: B**

Explanation: VPC Peering is 1:1 and not transitive (even with A↔B and B↔C, A↔C is not possible). Transit Gateway connects many VPCs, VPNs, and DX through a central hub and manages N:N. At multi-VPC scale, TGW is the standard.

---

**Question 42.** How do you route users to the nearest (lowest-latency) Region?
A) Failover
B) Latency-based Routing
C) Weighted
D) Simple

**Answer: B**

Explanation: Latency-based Routing sends users to the fastest Region based on measured latency from the user to each Region. Do not confuse it with Geolocation (which country/continent); Latency is based on "lowest measured latency."

---

**Question 43.** What is a limitation of VPC Flow Logs?
A) They record only metadata of allowed/rejected traffic, not packet payloads
B) They fully capture every packet including payloads, so the cost is high
C) They support only IPv4 and cannot record IPv6 ENI traffic
D) They have no real-time stream and are aggregated only in 24-hour batches

**Answer: A**

Explanation: VPC Flow Logs keep only metadata such as the 5-tuple (source and destination IP/port, protocol) and the allow/reject outcome, not the actual packet contents (payload). If you need to see the payload, use Traffic Mirroring. "What communicated" is Flow Logs, and "what was exchanged" is Mirroring.

---

**Question 44.** What is commonly used as a backup connection for Direct Connect?
A) Another DX
B) Site-to-Site VPN
C) NAT
D) TGW

**Answer: B**

Explanation: DX is a dedicated line and so is stable, but with a single circuit it goes down when it fails. You keep an inexpensive, quick-to-set-up Site-to-Site VPN as a backup so traffic automatically routes around a DX failure (DX in normal times). Another DX (A) is expensive and takes a long time to build.

---

### Domain 6: Cost and Performance Optimization (6 questions)

> ⚠️ **Pitfall**: Cost tools divide in role into analysis (Cost Explorer), alerts + Actions (Budgets), ML anomaly detection (Cost Anomaly Detection), and right-sizing recommendations (Compute Optimizer). The real trap with commitments is the scope of application: Savings Plans apply only to EC2, Fargate, and Lambda and **do not apply to RDS, Redshift, or ElastiCache** (you must use each service's Reserved Instances). That is why the answer to "commitment discount for RDS" is RDS RI, not Compute SP. For commitments, flexibility and discount are inversely proportional, and for Spot it is interruption risk versus a 90% discount.

**Question 45.** Which is the most flexible commitment, applying to all of EC2, Fargate, and Lambda?
A) Standard RI
B) Compute Savings Plans
C) EC2 Instance SP
D) Convertible RI

**Answer: B**

Explanation: Compute SP is the most flexible because you commit only a dollar amount per hour regardless of family, Region, or service (EC2/Fargate/Lambda). In exchange the discount is moderate (flexibility and discount are inversely proportional). If the workload changes often, Compute SP is suitable.

---

**Question 46.** How do you shut down gracefully in response to the 2-minute Spot interruption notice?
A) Cron
B) EventBridge → Lambda / Lifecycle Hook
C) CloudWatch Alarm
D) SQS polling

**Answer: B**

Explanation: The 2-minute Spot interruption warning arrives as an EC2 Spot Instance Interruption Warning event, and with EventBridge → Lambda/Lifecycle Hook you drain, checkpoint, and then terminate. Spot assumes stateless or checkpointable workloads.

---

**Question 47.** How do you get ML-based right-sizing recommendations for EC2, EBS, and Lambda?
A) Trusted Advisor only
B) Compute Optimizer
C) Cost Explorer
D) Budgets

**Answer: B**

Explanation: Compute Optimizer analyzes the percentile distribution of at least 14 days of metrics with ML, classifies resources as Over/Under/Optimized, and recommends a better-fitting type. Trusted Advisor (A) does broad checks but is weak on per-instance ML recommendations.

---

**Question 48.** How do you automatically detect abnormal spikes in cost with ML?
A) Budgets
B) Cost Anomaly Detection
C) Trusted Advisor
D) CloudWatch Alarm

**Answer: B**

Explanation: Cost Anomaly Detection learns spending patterns with ML and automatically detects and alerts on spikes that differ from the norm. Budgets (A) is based on fixed thresholds the user sets, so an "unexpected abnormal pattern" is caught better by ML-based Anomaly Detection.

---

**Question 49.** How do you guarantee capacity for a new instance type in a specific AZ (no discount needed)?
A) Standard RI
B) EC2 Capacity Reservation
C) Spot
D) Compute SP

**Answer: B**

Explanation: A Capacity Reservation is not a discount but insurance that "capacity is definitely there when needed" (the price is On-Demand). It is used when securing capacity itself matters, such as for large events or DR preparedness. RI/SP are about discounts, and guaranteeing capacity is not their core (they are separate concepts).

---

**Question 50.** How do you automatically stop EC2 or attach a restrictive SCP when a monthly budget threshold is reached?
A) Detect the spike with Cost Anomaly Detection and send an SNS notification
B) Budgets + Budget Action
C) Configure a CloudWatch billing metric Alarm that triggers Lambda
D) Receive Trusted Advisor cost check results and respond manually

**Answer: B**

Explanation: A Budget Action takes active measures when a budget threshold is reached, such as automatically attaching an IAM/SCP policy or stopping EC2/RDS. Cost Anomaly Detection (A) stops at detection and notification and has no automatic blocking action. "Alert + automatic blocking" is Budgets + Action.

---

## 📊 Scoring and Weakness Analysis

> 💡 **Related theory**: Per-domain accuracy must be read together with the weighting: 5 questions in 20% Domain 1 and 5 questions in 12% Domain 6 carry different score weight. Prioritize weaknesses by "number missed × weighting."

### Per-Domain Accuracy Record

| Domain | Questions | Correct | Accuracy | Weight |
|--------|---------|---------|--------|------|
| Domain 1 (Monitoring, Logging) | 10 | __/10 | __ % | 20% |
| Domain 2 (Reliability, BCP) | 8 | __/8 | __ % | 16% |
| Domain 3 (Deployment, Automation) | 9 | __/9 | __ % | 18% |
| Domain 4 (Security, Compliance) | 8 | __/8 | __ % | 16% |
| Domain 5 (Networking) | 9 | __/9 | __ % | 18% |
| Domain 6 (Cost, Performance) | 6 | __/6 | __ % | 12% |
| **Total** | **50** | **__/50** | **__ %** | 100% |

### Diagnosis by Score Band

| Accuracy | Diagnosis | Prescription |
|--------|------|------|
| ≥ 90% | Solid pass range | Time management + review only the trap questions |
| 80-89% | Passing line | Re-read the day.md files of your weak domains |
| 70-79% | At risk | Focus on 2 weak domains + extra questions |
| < 70% | Insufficient | Quickly re-read the key points of weeks 1 to 12 |

### Self-Diagnosis by Type of Wrong Answer

Classify missed questions into the three types below and the nature of your weakness becomes visible:

| Wrong-answer type | Symptom | Prescription |
|-----------|------|------|
| **Service confusion** | Swapping two similar ones (CloudTrail/Config, etc.) | Organize the confusing pairs in a table and memorize the "reason" for the difference |
| **Missed qualifier** | Ignoring a condition like "MOST cost-effective" | The habit of reading the question to the end and underlining qualifiers |
| **Trap option** | Choosing an option that "works but is not the best" | Re-evaluate every option not as "is it possible" but as "is it the most suitable" |

### Prescriptions by Weak Domain

- **Weak in Domain 1** → Re-read Weeks 2, 3, 4 + this week's Day 1, and the data-model differences among CloudWatch/CloudTrail/Config
- **Weak in Domain 2** → Week 10 + Day 1, RDS Multi-AZ (synchronous) / Read Replica (asynchronous) / Aurora Global + the RTO/RPO coordinates of the 4 DR strategies
- **Weak in Domain 3** → Weeks 5, 6, 7 + Day 2, declarative IaC + deployment policy trade-offs + the 7 major SSM components
- **Weak in Domain 4** → Weeks 1 and 9 + Day 2, the IAM decision tree (explicit Deny wins) + "what does it look at" for security services
- **Weak in Domain 5** → Week 8 + Day 3, packet inspection order + stateful/stateless + Endpoint types
- **Weak in Domain 6** → Week 11 + Day 3, commitment flexibility versus discount + the role split among cost tools

---

## 📌 Today's Summary

1. Read a mock exam not by the score but by the **pattern of wrong answers**, classified into three types: service confusion / missed qualifier / trap option
2. Prioritize weaknesses by "number missed × domain weighting"; Domain 1 at 20% and Domain 6 at 12% carry different weight
3. The most frequent confusion pairs: **CloudTrail (actions) / Config (state)**, **SG (stateful) / NACL (stateless)**, **Multi-AZ (synchronous) / Read Replica (asynchronous)**, **SP (flexible) / RI (discount)**
4. Scenario qualifiers ("MOST cost-effective", "LEAST operational overhead", "automatically") are clues to the answer, so read the question to the end
5. Tomorrow (Day 5), adjust your condition with the D-Day checklist + a short 20-question mock exam
