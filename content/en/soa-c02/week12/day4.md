# Day 4 - Disaster Recovery Architecture, RTO/RPO

DR strategies: backup-restore (high RPO/RTO), pilot light (minimal standby), warm standby (scaled for partial load), multi-site active-active.

RTO (Recovery Time Objective) — acceptable downtime. RPO (Recovery Point Objective) — acceptable data loss. Inverse relationship: higher availability costs more.

Implementation: Aurora Global Database (cross-region replication), DMS continuous replication, backup automation, traffic failover via Route 53. Runbooks and automation reduce manual recovery time.

---

## Practice Problems

**Question 1.** How is the EC2 memory utilization metric collected?

A) Included in the default metrics
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

Explanation: A Composite Alarm combines multiple alarms with AND/OR so that it fires only when, for example, "CPU is high AND memory is high," preventing an alarm storm. Anomaly Detection is a dynamic threshold, and Metric Math is metric computation.

---

**Question 3.** Which service tracks API call history?

A) CloudWatch Logs
B) CloudTrail
C) VPC Flow Logs
D) Config

**Answer: B**

Explanation: CloudTrail is an audit service that records "who called what API and when" as an event stream. Logs = application logs, VPC Flow Logs = network metadata, Config = resource state.

---

**Question 4.** How do you view the change history of an SG in chronological order?

A) Query CloudTrail `AuthorizeSecurityGroupIngress` events
B) Config (configuration history timeline)
C) Trend of the rule count in CloudWatch metrics
D) Analyze denied-traffic logs in VPC Flow Logs

**Answer: B**

Explanation: A trick question. CloudTrail also records SG change APIs (`AuthorizeSecurityGroupIngress`, etc.), but it is Config that shows "what rule set existed at each point in time" on a timeline, because it is a state-based model that accumulates configuration snapshots in chronological order. "Who changed it" is CloudTrail, and "what state it was in at that time" is Config.

---

**Question 5.** Which Logs Insights query aggregates specific error logs in 5-minute buckets?

A) `count(*) by error`
B) `stats count(*) by @message`
C) `filter @message like /ERROR/ | stats count() as cnt by bin(5m)`
D) `select count(*)`

**Answer: C**

Explanation: Logs Insights uses a pipe (|) based language, not SQL. Use `filter` to select ERROR and `stats count() by bin(5m)` to aggregate in 5-minute buckets; `bin(5m)` is the key function. The others are not valid syntax.

---

**Question 6.** How can a Config Rule automatically remediate noncompliant resources?

A) Directly attach a Lambda ARN to the Config Rule to invoke it
B) Remediation Action (SSM Automation Document)
C) Receive the noncompliance event with an EventBridge rule and run a workflow
D) Redeploy the resource with a CloudFormation stack update

**Answer: B**

Explanation: Config's Remediation invokes an SSM Automation Document to return the resource to the standard state. Because it is idempotent ("make it this state"), it is safe against duplicate execution. EventBridge can also do it, but Config's built-in mechanism is the Remediation Action.

---

**Question 7.** How do you set an alarm on a metric for which a static threshold is hard to determine (strong day-of-week and time-of-day patterns)?

A) Standard Alarm
B) Composite Alarm
C) Anomaly Detection (ML-learned band)
D) Metric Filter

**Answer: C**

Explanation: Anomaly Detection learns historical data with ML, draws a dynamic "normal band," and alarms when the metric leaves it. For metrics whose normal values change, such as weekday/weekend and day/night, a fixed threshold produces many false positives and false negatives, but the band follows the pattern and is suitable.

---

**Question 8.** How do you view the CloudWatch metrics and logs of multiple accounts on a single dashboard?

A) Separately in each account
B) Cross-Account Observability (Source + Monitoring accounts)
C) CloudTrail
D) Config Aggregator

**Answer: B**

Explanation: CloudWatch Cross-Account Observability lets a single monitoring account query the metrics, logs, and traces of multiple source accounts in an integrated way. Config Aggregator (D) consolidates configuration compliance, which is a different matter.

---

**Question 9.** How do you convert the number of occurrences of the word "ERROR" in a Log Group into a metric and set an alarm?

A) Subscription Filter
B) Metric Filter
C) Insights Query
D) EMF

**Answer: B**

Explanation: A Metric Filter matches a log pattern (ERROR), converts it into a CloudWatch metric, and lets you set an alarm on it. A Subscription Filter is real-time delivery to Kinesis/Lambda, Insights is an interactive query, and EMF is a metric embedding format. "Logs → metric + alarm" is the Metric Filter.

---

**Question 10.** What is the purpose of CloudTrail Lake?

A) Real-time notification
B) Long-term retention of trail data in a data lake searchable with SQL
C) Replacing Config
D) Replacing Logs

**Answer: B**

Explanation: Regular CloudTrail just accumulates events in S3 and searching them is cumbersome. CloudTrail Lake retains events long term in a managed data lake and lets you query them directly with SQL (for example, "a specific user's DeleteBucket calls over the past year" in one line). It is for auditing, forensics, and long-term analysis.

---

**Question 11.** What is the main purpose of RDS Multi-AZ?

A) Improving read performance
B) HA (automatic failover)
C) Backup
D) Cost reduction

**Answer: B**

Explanation: Multi-AZ is a high-availability feature that replicates synchronously to a standby in another AZ and fails over automatically when the primary fails. The standby does not normally receive traffic, so it does not improve read performance (A); read scaling is the job of a Read Replica.

---

**Question 12.** How do you scale RDS read performance?

A) Multi-AZ
B) Read Replica
C) Snapshot
D) RI

**Answer: B**

Explanation: A Read Replica keeps multiple asynchronous replicas and distributes read traffic. However, because it is asynchronous there is replication lag, so reads where consistency is important, such as reading data immediately after writing it (read-after-write), must be sent to the primary.

---

**Question 13.** What is the global deployment of Aurora for Region outage preparedness?

A) Aurora Global Database
B) Multi-AZ
C) Cross-Region Snapshot
D) RDS Proxy

**Answer: A**

Explanation: Aurora Global Database replicates from the primary Region to secondary Regions over dedicated infrastructure (RPO is usually within 1 second), and recovers by promoting a secondary during a Region outage. Multi-AZ (B) is single-Region HA and cannot protect against a full Region outage.

---

**Question 14.** What is the lightest way to implement daily automatic EBS snapshots with a retention policy?

A) Configure an EBS backup plan and retention rules with AWS Backup
B) Data Lifecycle Manager (DLM)
C) Define snapshot resources with CloudFormation and deploy them daily
D) Manually call `CreateSnapshot` with an EventBridge schedule + Lambda

**Answer: B**

Explanation: A trick question. AWS Backup (A) is also possible, but if the requirement is "EBS only, as lightly as possible," DLM is the direct answer: it is a dedicated lightweight tool that automates EBS snapshots, AMIs, and retention based on tags. AWS Backup is for integrating multiple services (RDS, EFS, DynamoDB).

---

**Question 15.** Which DR strategy has an RTO in minutes with moderate cost?

A) Backup & Restore
B) Pilot Light
C) Warm Standby
D) Multi-Site Active-Active

**Answer: B**

Explanation: Pilot Light continuously replicates only the core (DB) and keeps the application and web tiers off, turning them on during an outage, giving an RTO in minutes at moderate cost. Warm Standby (C) runs a scaled-down full stack at all times for an RTO within minutes, which is faster but more expensive. "Minutes + moderate cost" is Pilot Light.

---

**Question 16.** How do you automatically replicate S3 objects to another Region?

A) S3 Lifecycle
B) Cross-Region Replication (CRR)
C) Snowball
D) Storage Gateway

**Answer: B**

Explanation: CRR asynchronously and automatically replicates objects from one bucket to a bucket in another Region (for Region outage preparedness, reduced latency, and regulatory requirements). Lifecycle (A) is storage class transition and expiration, not replication.

---

**Question 17.** How do you configure Active/Passive in Route 53 (Primary normally, Secondary during an outage)?

A) Weighted
B) Failover (Primary + Secondary + Health Check)
C) Latency
D) Geolocation

**Answer: B**

Explanation: Failover routing attaches a health check to the Primary record and sends traffic to the Primary if it is healthy and to the Secondary if it is unhealthy, a typical Active/Passive setup. Weighted (A) distributes by weight (A/B testing, canary), and Latency (C) is the nearest Region.

---

**Question 18.** What is the purpose of AWS Backup Vault Lock?

A) Cost reduction
B) Preventing backup deletion (WORM, regulatory requirements)
C) Encryption
D) Compression

**Answer: B**

Explanation: Vault Lock applies a WORM (Write Once Read Many) policy to a backup vault so that backups cannot be deleted or modified during the retention period (defense against ransomware, insiders, and mistakes; regulatory requirements). For reference, retention of S3 objects themselves is S3 Object Lock, while retention of backup resources is Vault Lock; do not confuse the two.

---

**Question 19.** How do you review changes in advance before applying them in CloudFormation?

A) Compare the differences between actual resources and the template in advance with Drift Detection
B) Change Set
C) Configure automatic rollback on failure with a Rollback Configuration
D) Isolate the impact of changes by module with Nested Stacks

**Answer: B**

Explanation: A Change Set shows in advance which resources a template change will actually add, modify, or delete before it is applied. It is a safeguard that catches unintended deletions (for example, data loss from resource replacement) beforehand. Drift Detection (A) looks at the difference between actual resources and the template after the fact.

---

**Question 20.** How do you deploy the same IaC in bulk to multiple accounts/Regions?

A) Nested Stack
B) StackSets
C) Cross-Stack Reference
D) Change Set

**Answer: B**

Explanation: StackSets deploys and manages a single template to multiple accounts and multiple Regions at once (for example, applying the same security baseline across an entire organization). A Nested Stack (A) is modularization within a stack, and a Cross-Stack Reference (C) refers to outputs between stacks.

---

**Question 21.** Which deployment offers zero downtime and an immediate rollback if there is a problem?

A) All at once
B) Rolling
C) Blue/Green
D) In-place

**Answer: C**

Explanation: Blue/Green brings up the new environment (green) while leaving the old environment (blue) in place, switches traffic, and rolls back immediately in a single step by returning to blue if there is a problem. However, with a DNS switch the TTL delay is a pitfall, and with a shared DB schema compatibility is a pitfall.

---

**Question 22.** How do you automatically apply OS patches to 100 EC2 instances on a regular monthly basis with SSM?

A) Run Command manually
B) Patch Manager + Maintenance Window
C) State Manager only
D) Automation only

**Answer: B**

Explanation: Patch Manager defines the patch Baseline (approval delay by classification and severity), and the Maintenance Window runs the job on a regular schedule such as "a specific time every month." Run Command (A) is a one-off immediate execution and has no recurrence.

---

**Question 23.** How do you connect to EC2 securely without SSH keys or port 22?

A) Bastion
B) Session Manager
C) VPN
D) Direct Connect

**Answer: B**

Explanation: Session Manager opens a shell over the SSM Agent's outbound connection, so inbound ports can be zero, access is authorized by IAM, and every session is audited with CloudTrail. A Bastion (A) is yet another thing to manage and expose, so the operational burden is high.

---

**Question 24.** How do you periodically rotate a DB master password automatically without downtime?

A) Parameter Store SecureString
B) Secrets Manager + Lambda Rotation
C) KMS only
D) IAM

**Answer: B**

Explanation: Automatic rotation is a core feature of Secrets Manager (built-in RDS rotation or Lambda rotation). Parameter Store SecureString (A) stores data encrypted but has no automatic rotation. "DB password rotation = Secrets Manager" is the reflex answer.

---

**Question 25.** How do you detect differences between a CloudFormation template and the actual resources?

A) Compare the resource impact of the next change in advance with a Change Set
B) Drift Detection
C) Trigger automatic rollback when a threshold is exceeded with a Rollback Trigger
D) Compare Nested Stack output values against actual resource IDs

**Answer: B**

Explanation: Drift Detection reports the difference when someone modifies a resource outside the stack via the console or CLI and the actual state diverges from the template (drift). It is the feature that exposes the diff between desired (template) and actual (real). A Change Set (A) is a preview of changes before applying.

---

**Question 26.** How do you let users safely deploy approved IaC through self-service?

A) CloudFormation console only
B) Service Catalog
C) Proton
D) Beanstalk

**Answer: B**

Explanation: Service Catalog lets administrators create a catalog of approved IaC products, and users deploy through self-service only from within it (governance + autonomy). Proton (C) is a tool for a platform team's standard container and serverless stacks, which is a different matter.

---

**Question 27.** How do you immediately run a one-time command on 100 EC2 instances?

A) Run Command
B) State Manager
C) Patch Manager
D) Maintenance Window

**Answer: A**

Explanation: Run Command immediately runs a one-off command on many instances. State Manager (B) continuously maintains a desired state (periodic application), and Patch Manager (C) is dedicated to patching. "Immediate, one-off" is Run Command.

---

**Question 28.** How do you apply permission guardrails to all accounts at the Organizations level?

A) IAM Policy
B) Permission Boundary
C) SCP
D) Identity Center

**Answer: C**

Explanation: An SCP is a permission ceiling (guardrail) applied to Organizations OUs/accounts. However, an SCP does not grant permissions and only restricts; actual permissions must be given separately through each account's IAM policies. A Permission Boundary (B) works at the level of individual IAM entities, so its scope is different.

---

**Question 29.** How do you set, individually, the maximum permission ceiling that an IAM role or user can have?

A) SCP
B) Permission Boundary
C) Resource Policy
D) Session Policy

**Answer: B**

Explanation: A Permission Boundary defines the permission ceiling of a specific IAM entity (role/user). For example, it allows permissions to be delegated to a developer while preventing the roles they create from ever exceeding administrator permissions. An SCP (A) works at the whole-account level, so the granularity is different.

---

**Question 30.** How do you automatically detect PII (sensitive information) stored in S3?

A) Inspector
B) Macie
C) GuardDuty
D) Security Hub

**Answer: B**

Explanation: Macie scans the contents of S3 objects with ML to find where PII such as national ID numbers and card numbers is located and whether it is exposed. Inspector (A) looks at software vulnerabilities and GuardDuty (C) at behavior-based threats, so neither looks at data content. "S3 data content = Macie."

---

**Question 31.** How do you scan EC2, ECR images, and Lambda for known vulnerabilities (CVEs)?

A) GuardDuty
B) Inspector
C) Macie
D) Detective

**Answer: B**

Explanation: Inspector compares the software packages of EC2, container images, and Lambda against the CVE database to find unpatched vulnerabilities. "Vulnerability scan = Inspector" is the reflex answer.

---

**Question 32.** How do you detect in-progress threats by analyzing VPC Flow Logs, DNS, and CloudTrail?

A) Macie
B) GuardDuty
C) Inspector
D) Config

**Answer: B**

Explanation: GuardDuty correlates these three log streams to detect in-progress threats such as communication with malicious IPs, abnormal API patterns, and credential theft. Because it is a service that looks at behavior (logs), it catches "attacks happening right now."

---

**Question 33.** How do you gather the findings of multiple security services in one place and score them against standards (CIS, PCI)?

A) GuardDuty
B) Security Hub
C) Detective
D) Config

**Answer: B**

Explanation: Security Hub collects findings from GuardDuty, Inspector, Macie, and Config in an integrated way and assigns compliance scores against security standards such as CIS, PCI-DSS, and NIST. The key is not individual detection but an "integrated dashboard."

---

**Question 34.** How do you automatically detect unintended access to IAM and resources exposed externally (to other accounts or the public)?

A) IAM Access Analyzer
B) GuardDuty
C) Config
D) Trusted Advisor

**Answer: A**

Explanation: IAM Access Analyzer analyzes resource policies (S3, roles, KMS) with automated reasoning (formal logic) to find access paths exposed externally. GuardDuty (B) is about behavioral threats, which is a different matter.

---

**Question 35.** How do you automate the collection of compliance evidence and report creation for PCI-DSS, SOC, and HIPAA?

A) Export Security Hub compliance scores as evidence
B) Audit Manager
C) Replace the report with AWS certificates obtained from Artifact
D) Manually compile Config rule compliance status and document it

**Answer: B**

Explanation: Audit Manager automatically collects evidence per framework (CloudTrail, Config, and so on) and produces audit reports. Artifact (C) is where you obtain AWS's own compliance documents, which is different. "Automating reports for my environment" is Audit Manager.

---

**Question 36.** What is a characteristic of a Security Group?

A) Stateless
B) Stateful (responses are automatically allowed)
C) Subnet-level
D) Supports Deny rules

**Answer: B**

Explanation: An SG is stateful, so it automatically allows the responses to outgoing connections using a connection tracking table. Therefore you only need to write inbound rules, it supports only allow rules (no deny), and it applies at the instance (ENI) level, not the subnet.

---

**Question 37.** Which option provides private connectivity for S3 and DynamoDB only, free of charge?

A) Interface Endpoint
B) Gateway Endpoint
C) PrivateLink
D) NAT Gateway

**Answer: B**

Explanation: A Gateway Endpoint is dedicated to S3 and DynamoDB and is free: it sends traffic directly into AWS through a route table entry. Interface Endpoint/PrivateLink (A, C) support most services but have hourly plus per-GB charges.

---

**Question 38.** How do you statically analyze the network path between two resources without actual traffic?

A) VPC Flow Logs
B) Reachability Analyzer
C) Traffic Mirroring
D) Network Access Analyzer

**Answer: B**

Explanation: Reachability Analyzer statically analyzes the configuration of SGs, NACLs, routes, and so on, and reports whether the destination is reachable and where it is blocked (no actual packets needed). VPC Flow Logs (A) are records after actual traffic has occurred.

---

**Question 39.** How do you globally accelerate UDP game traffic?

A) CloudFront
B) Global Accelerator
C) Route 53
D) ALB

**Answer: B**

Explanation: CloudFront is dedicated to HTTP/S caching and cannot handle UDP. Global Accelerator accelerates TCP and UDP over the AWS private backbone and provides static Anycast IPs. "Global acceleration for UDP and non-HTTP = Global Accelerator."

---

**Question 40.** What is the current standard for blocking direct S3 access in CloudFront?

A) OAI (legacy)
B) OAC (Origin Access Control)
C) Signed URL only
D) Bucket Policy only

**Answer: B**

Explanation: OAC is the standard that replaced OAI in 2022; it is based on SigV4 signing and even supports KMS-encrypted objects. It keeps S3 private and enforces that only CloudFront accesses it through OAC. OAI is classified as legacy.

---

**Question 41.** How do you connect many VPCs in a hub-and-spoke topology?

A) VPC Peering
B) Transit Gateway
C) Direct Connect
D) VPN

**Answer: B**

Explanation: VPC Peering is 1:1 and non-transitive (even with A↔B and B↔C, A↔C is not possible). Transit Gateway connects many VPCs, VPNs, and DX through a central hub and manages N:N. For multi-VPC scale, TGW is the standard.

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

A) It records only allow/deny traffic metadata, not packet payloads
B) It fully captures every packet including payloads, so it is costly
C) It supports only IPv4 and cannot record IPv6 ENI traffic
D) It has no real-time stream and is aggregated only in 24-hour batches

**Answer: A**

Explanation: VPC Flow Logs leave only metadata such as the 5-tuple (source and destination IP/port, protocol) and the allow/deny result; there is no actual packet content (payload). If you need to see the payload, use Traffic Mirroring. "What communicated" is Flow Logs, and "what was exchanged" is Mirroring.

---

**Question 44.** What is commonly used as a backup connection for Direct Connect?

A) Another DX
B) Site-to-Site VPN
C) NAT
D) TGW

**Answer: B**

Explanation: DX is a dedicated line and stable, but with a single circuit it goes down on failure. Keep an inexpensive and quick Site-to-Site VPN as a backup so that traffic automatically fails over when DX fails (DX is used normally). Another DX (A) is expensive and takes a long time to set up.

---

**Question 45.** What is the most flexible commitment that applies to all of EC2, Fargate, and Lambda?

A) Standard RI
B) Compute Savings Plans
C) EC2 Instance SP
D) Convertible RI

**Answer: B**

Explanation: Compute SP commits only to an hourly amount regardless of family, Region, or service (EC2/Fargate/Lambda), so it is the most flexible. In exchange, the discount is moderate (flexibility and discount are inversely related). If workloads change frequently, Compute SP is suitable.

---

**Question 46.** How do you respond to the 2-minute Spot reclamation notice and terminate gracefully?

A) Cron
B) EventBridge → Lambda / Lifecycle Hook
C) CloudWatch Alarm
D) SQS polling

**Answer: B**

Explanation: The 2-minute Spot reclamation warning arrives as an EC2 Spot Instance Interruption Warning event, and with EventBridge → Lambda / Lifecycle Hook you drain, checkpoint, and then terminate. Spot presupposes a workload that is stateless or can checkpoint.

---

**Question 47.** How do you get ML-based Right Sizing recommendations for EC2, EBS, and Lambda?

A) Trusted Advisor only
B) Compute Optimizer
C) Cost Explorer
D) Budgets

**Answer: B**

Explanation: Compute Optimizer analyzes the percentile distribution of 14 or more days of metrics with ML, classifies Over/Under/Optimized, and recommends a more suitable type. Trusted Advisor (A) performs broad checks, but its per-instance ML recommendations are weak.

---

**Question 48.** How do you automatically detect abnormal cost surges with ML?

A) Budgets
B) Cost Anomaly Detection
C) Trusted Advisor
D) CloudWatch Alarm

**Answer: B**

Explanation: Cost Anomaly Detection learns spending patterns with ML and automatically detects and notifies on surges that differ from usual. Budgets (A) is based on fixed thresholds set by the user, so ML-based Anomaly Detection is better at catching "unexpected abnormal patterns."

---

**Question 49.** How do you guarantee capacity for a new instance type in a specific AZ (a discount is not needed)?

A) Standard RI
B) EC2 Capacity Reservation
C) Spot
D) Compute SP

**Answer: B**

Explanation: A Capacity Reservation is insurance that guarantees "capacity is definitely there when needed," not a discount (the price is On-Demand). It is used when securing capacity itself is what matters, as in preparing for large events or DR. RI/SP are for discounts, and capacity guarantee is not their core (the two are separate concepts).

---

**Question 50.** How do you automatically stop EC2 or attach a restrictive SCP when the monthly budget threshold is reached?

A) Send an SNS notification after detecting a surge with Cost Anomaly Detection
B) Budgets + Budget Action
C) Configure a Lambda trigger with a CloudWatch billing metric Alarm
D) Receive the Trusted Advisor cost check results and respond manually

**Answer: B**

Explanation: A Budget Action takes proactive measures when a budget threshold is reached, such as automatically attaching an IAM/SCP policy or stopping EC2/RDS. Cost Anomaly Detection (A) goes only as far as detection and notification and has no automatic blocking action. "Notification + automatic blocking" is Budgets + Action.

---
