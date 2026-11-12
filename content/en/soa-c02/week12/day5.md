# Day 5 - Week 12 Enterprise Operations and SOA Exam Synthesis

Week 12 completed enterprise operations: Organizations multi-account governance, Control Tower compliance automation, standardized tagging, disaster recovery strategies. Combined with prior weeks: network architecture (Week 8), security operations (Week 9), operational monitoring (Week 10), database management (Week 11).

## Complete 12-Week SOA-C02 Map

**Weeks 1-3**: Foundational AWS (compute, storage, network)
**Weeks 4-5**: High-availability and deployment
**Week 6**: Monitoring and management  
**Week 7**: Automation and administration
**Week 8**: VPC networking deep-dive (routing, firewalls, DNS, multi-VPC)
**Week 9**: Security operations (encryption, secrets, threat detection)
**Week 10**: Observability and cost (CloudWatch, scaling, budgets)
**Week 11**: Database operations (backups, failover, replication)
**Week 12**: Enterprise governance (organizations, compliance, DR)

Exam focus: Operational decisions under constraints (cost, time, resources). Each scenario tests multiple domains simultaneously. Practice full-length exams to develop decision-speed.

---

## Final Synthesis Practice (Enterprise Scenarios)

**Question 1.** How do you connect to EC2 without SSH keys and audit every session with CloudTrail?

A) Run Command
B) Session Manager
C) Patch Manager
D) State Manager

**Answer: B**

Explanation: Session Manager opens a shell over the SSM Agent's outbound connection, so no inbound ports or key pairs are needed, access is authorized by IAM, and every session is recorded in CloudTrail. It eliminates the key management, port exposure, and audit burden all at once.

---

**Question 2.** What is the current standard for protecting an S3 origin in CloudFront?

A) OAI (legacy)
B) OAC
C) Signed URL
D) Bucket Policy only

**Answer: B**

Explanation: OAC (Origin Access Control) is based on SigV4 signing, replaced OAI, and even supports KMS-encrypted objects. It keeps S3 private and enforces that only CloudFront can access it. OAI is legacy.

---

**Question 3.** Which guardrail applies a permission ceiling to all accounts in an organization?

A) IAM Policy
B) SCP
C) Permission Boundary
D) Identity Center

**Answer: B**

Explanation: An SCP is a permission ceiling at the Organizations level. However, it does not grant permissions and only restricts, so actual permissions must be given separately through each account's IAM policies. An SCP Deny is an explicit Deny and beats every Allow.

---

**Question 4.** What is the most flexible commitment that applies to all of EC2, Fargate, and Lambda?

A) Standard RI
B) EC2 Instance SP
C) Compute Savings Plans
D) Convertible RI

**Answer: C**

Explanation: Compute SP commits only to an hourly amount regardless of service, family, or Region, so it is the most flexible (with a moderate discount). Because flexibility and discount are inversely related, Compute SP fits workloads with high variability.

---

**Question 5.** How do you statically diagnose the path between two resources without actual traffic?

A) VPC Flow Logs
B) Reachability Analyzer
C) Traffic Mirroring
D) ping

**Answer: B**

Explanation: Reachability Analyzer statically analyzes the SG, NACL, and route configuration and reports whether the destination is reachable and where it is blocked. It needs no actual packets, so it is suitable for pre-diagnosis. Flow Logs are records after actual traffic has occurred.

---

**Question 6.** Which deployment has zero downtime and immediate rollback as its core?

A) Rolling
B) All at once
C) Blue/Green
D) In-place

**Answer: C**

Explanation: Blue/Green switches to the new environment without deleting the old one, so if there is a problem, a single step of reverting the routing rolls back immediately. With a DNS switch the TTL delay is a pitfall, and with a shared DB schema compatibility is a pitfall.

---

**Question 7.** How do you automatically detect PII (sensitive information) stored in S3?

A) Inspector
B) GuardDuty
C) Macie
D) Detective

**Answer: C**

Explanation: Macie scans the contents of S3 objects with ML to find the location and exposure of PII. It is the only service that looks at "S3 data content"; Inspector looks at vulnerabilities and GuardDuty at behavioral threats.

---

**Question 8.** How do you deploy the same IaC in bulk to multiple accounts/Regions?

A) Nested Stack
B) StackSets
C) Change Set
D) Drift Detection

**Answer: B**

Explanation: StackSets deploys and manages a single template to multiple accounts and Regions at the same time (for example, an organization baseline). A Nested Stack is modularization within a single stack, so its scope is different.

---

**Question 9.** How do you set an alarm on a metric whose normal values change greatly by day of week and time of day?

A) Composite
B) Anomaly Detection
C) Standard
D) Metric Math

**Answer: B**

Explanation: Anomaly Detection learns past patterns with ML, draws a dynamic normal band, and alarms when the metric leaves it. A fixed threshold cannot follow time-of-day variation and produces many false positives and false negatives.

---

**Question 10.** How do you receive the 2-minute Spot reclamation warning and terminate gracefully?

A) CloudWatch Alarm
B) EventBridge (Spot Interruption Warning) → Lambda/Lifecycle Hook
C) Cron
D) SQS

**Answer: B**

Explanation: The Spot reclamation warning arrives as an EC2 Spot Instance Interruption Warning event; receive it with EventBridge and use Lambda or a Lifecycle Hook to drain, checkpoint, and then terminate. Spot presupposes a workload that is stateless or can checkpoint.

---

**Question 11.** What is the commitment discount model for RDS PostgreSQL?

A) Compute SP
B) EC2 Instance SP
C) Reserved Instances (RDS RI)
D) Spot

**Answer: C**

Explanation: Savings Plans target EC2, Fargate, and Lambda and do not include RDS. RDS, Redshift, and ElastiCache get commitment discounts through their own Reserved Instances. "RDS commitment = RDS RI."

---

**Question 12.** Which RDS configuration prepares for a full Region outage?

A) Multi-AZ
B) Cross-Region Read Replica / Aurora Global DB
C) Snapshot
D) Backup

**Answer: B**

Explanation: Multi-AZ is HA within a single Region and cannot protect against a full Region outage. Preparing for a Region outage means replicating to another Region: for regular RDS, a Cross-Region Read Replica (promoted when needed), and for Aurora, Global Database is the answer.

---

**Question 13.** What is a characteristic of a Security Group?

A) Stateless
B) Stateful (responses are automatically allowed)
C) Subnet-level
D) Supports Deny rules

**Answer: B**

Explanation: An SG is stateful, so it automatically allows the responses to outgoing connections via a connection tracking table. It supports only allow rules and applies at the instance (ENI) level. Deny rules and subnet-level scope are characteristics of a NACL.

---

**Question 14.** Which option provides private connectivity for S3 and DynamoDB only, free of charge?

A) Interface Endpoint
B) Gateway Endpoint
C) PrivateLink
D) NAT

**Answer: B**

Explanation: A Gateway Endpoint is dedicated to S3 and DynamoDB and is free (a route table entry). It bypasses NAT and eliminates the per-GB processing charge. Other services use the paid Interface Endpoint (PrivateLink).

---

**Question 15.** How do you get ML-based Right Sizing recommendations for EC2, EBS, and Lambda?

A) Trusted Advisor only
B) Compute Optimizer
C) Cost Explorer
D) Budgets

**Answer: B**

Explanation: Compute Optimizer analyzes the percentile distribution of 14 or more days of metrics with ML, classifies Over/Under/Optimized, and recommends a suitable type. Note, however, that memory cannot be seen without the Agent, so the recommendations can be skewed.

---

**Question 16.** What is the mechanism by which a Config Rule automatically remediates noncompliant resources?

A) Lambda directly
B) SSM Automation Remediation
C) EventBridge
D) CloudFormation

**Answer: B**

Explanation: Config Remediation invokes an SSM Automation Document to return the resource to the standard state. This remediation must be idempotent (safe to run multiple times), and a declarative action that says "make it this state" satisfies that condition.

---

**Question 17.** How do you globally accelerate UDP game traffic when static IPs are needed?

A) CloudFront
B) Global Accelerator
C) Route 53 Latency
D) ALB

**Answer: B**

Explanation: CloudFront is dedicated to HTTP/S caching and cannot handle UDP. Global Accelerator accelerates TCP and UDP over the AWS private backbone, provides 2 static Anycast IPs, and performs fast failover between Regions.

---

**Question 18.** How do you rotate a DB password automatically without downtime?

A) Parameter Store SecureString
B) Secrets Manager + Lambda
C) KMS
D) IAM

**Answer: B**

Explanation: Automatic rotation is the core of Secrets Manager, performing a zero-downtime replacement in four steps: create → set → test → finish. Parameter Store SecureString stores data encrypted but has no rotation feature. More fundamentally, there is also the approach of eliminating the secret itself with RDS IAM authentication.

---

**Question 19.** How do you automatically stop EC2 or attach a restrictive SCP when the monthly budget threshold is reached?

A) Cost Anomaly Detection
B) Budgets + Budget Action
C) CloudWatch Alarm
D) Trusted Advisor

**Answer: B**

Explanation: A Budget Action takes proactive measures when the threshold is reached, such as attaching an IAM/SCP policy or stopping EC2/RDS. Cost Anomaly Detection goes only as far as ML anomaly detection and notification and has no automatic blocking action. "Notification + automatic blocking" is Budgets + Action.

---

**Question 20.** How do you automate the collection of compliance evidence and reports for PCI, SOC, and HIPAA?

A) Security Hub
B) Audit Manager
C) Config
D) Artifact

**Answer: B**

Explanation: Audit Manager automatically collects the evidence needed per framework and creates audit reports. Artifact is where you obtain AWS's own compliance documents (such as SOC reports), and Config is resource compliance evaluation. "Automating compliance reports for my environment" is Audit Manager.

---

End of 12-Week SOA-C02 Study Plan.

---
