# Day 5 - Healthcare & Public Sector — HIPAA/GxP/FEDRAMP, Immutable Audit, Highly Regulated Compliance

Healthcare and government: **compliance non-negotiable**. HIPAA demands encryption, audit trails, Business Associate Agreements. GxP (FDA pharma) requires 21 CFR Part 11 electronic records. FedRAMP demands Impact Levels.

Pro design: KMS encryption all data, Secrets Manager rotation, Backup Vault Compliance Lock (immutable 7+ years), GuardDuty org-wide, AWS CloudHSM for FIPS 140-2, separate compliance account, regular FIS validation.

Core: **Audit > Availability. Security > Performance. Cost last.**

Key mappings: (1) "Patient data HIPAA compliance" → **KMS encryption + Secrets Manager + BAA**, (2) "21 CFR Part 11 audit trail" → **CloudTrail + Object Lock Compliance 7 years**, (3) "FedRAMP IL4 HSM requirement" → **CloudHSM FIPS 140-2**, (4) "Patient privacy + access control" → **IAM + ABAC + Permission Boundary**, (5) "Incident response <1 hour" → **GuardDuty + Security Hub + Incident Manager**.

[6 EXERCISES: KMS key policies, Secrets Manager auto-rotation with Lambda, HIPAA audit log retention, FedRAMP control mapping, Business Associate Agreement scope, Incident response SLA]

---

## 📝 Practice Questions

**Question 1.** HIPAA patient data encryption → **KMS encryption**

**Question 2.** Pharmaceutical audit logs under 21 CFR Part 11 → **Object Lock Compliance for 7 years**

**Question 3.** HSM required by FedRAMP signing → **CloudHSM FIPS 140-2**

**Question 4.** Detect and report a medical incident within 1 hour → **GuardDuty + Security Hub + Incident Manager**

**Question 5.** Least-privilege patient access control → **IAM ABAC Permission Boundary**

**Question 6.** Required scope of a BAA (Business Associate Agreement) → **Data processing, subprocessors, liability**
---

**Question 7.** A health insurer processes PHI in a standard commercial Region (us-east-1) and wants to block, at the organization level, any PHI from entering services that are not HIPAA Eligible. Which control is most appropriate?
A) Restrict service usage per user and role with IAM policies
B) Deny non-HIPAA-Eligible services with an SCP
C) Detect and record use of non-Eligible services with a Config rule
D) Monitor abnormal service calls with GuardDuty

**Answer: B**

Explanation: HIPAA requires that PHI be processed only in HIPAA Eligible services (the scope of the BAA), and to enforce this **preventively** across the whole organization, you use an SCP to Deny the APIs of non-Eligible services, which even root cannot bypass. A does not apply to root and makes account-wide enforcement difficult. C and D are detection and monitoring (after the fact), not up-front blocking. Trap: "block usage itself at the source" is a preventive SCP.

---

**Question 8.** You want to automatically extract and de-identify PHI such as patient names and diagnoses from clinical notes (free text). Which service is most appropriate?
A) Amazon Comprehend (general NLP entity extraction)
B) Amazon Comprehend Medical
C) Amazon Macie (sensitive data discovery and classification in S3)
D) Amazon Textract (extracting text and tables from documents)

**Answer: B**

Explanation: **Comprehend Medical** specializes in medical text and extracts PHI entities (names, dates, diagnoses, medications, and so on) and medical terminology to support de-identification. General Comprehend in A is not specialized for medical entities. Macie in C is for discovering sensitive information in data stored in S3, not for extracting medical entities from text. Textract in D extracts text and tables from documents and does not identify PHI. Trap: "extracting PHI from medical text" is Comprehend Medical, and "discovering sensitive data in S3" is Macie.

---

**Question 9.** A government agency must meet FedRAMP High and DoD IL5, and its systems must be operated only by U.S. citizens (including ITAR-related data). Which environment is most appropriate?
A) Standard us-east-1 + HIPAA Eligible services + BAA
B) AWS GovCloud (US)
C) eu-west-1 (a Region separated for data sovereignty)
D) Local Zones (low-latency edge compute)

**Answer: B**

Explanation: **GovCloud (US)** is an isolated, separate partition that meets FedRAMP High and DoD SRG IL2-5, is **operated and accessed only by U.S. citizens and permanent residents**, and satisfies ITAR requirements (separate Region, accounts, and console). The standard Regions in A and C cannot meet FedRAMP High or the ITAR personnel restrictions. D is low-latency edge compute, not a compliance-isolated environment. Trap: "FedRAMP High, DoD, U.S.-person operation, ITAR" is GovCloud.

---

**Question 10.** You want to build a data lake that stores and analyzes PHI in the healthcare interoperability standard (FHIR R4) format. Which service is most appropriate?
A) Amazon Athena (serverless SQL queries over S3)
B) Amazon HealthLake
C) Amazon Redshift (columnar data warehouse)
D) AWS Lake Formation (data lake governance and permissions)

**Answer: B**

Explanation: **HealthLake** is a managed data lake that stores, structures, and analyzes healthcare data in the **FHIR R4** standard, specialized for healthcare interoperability. A, C, and D are general-purpose analytics, warehouse, and governance tools and are not specialized for FHIR-standard healthcare data. Trap: "a FHIR R4 healthcare data lake" is HealthLake.

---

**Question 11.** You must store transaction logs for 30 years at the lowest cost, and no one (including root) may modify or delete them. Which combination is most appropriate?
A) S3 Standard + Versioning to preserve versions
B) S3 Glacier Deep Archive + Object Lock Compliance (or Vault Lock Compliance)
C) S3 Glacier Deep Archive alone as a low-cost archive
D) Keep EBS snapshots for 30 years and copy them periodically

**Answer: B**

Explanation: For ultra-long 30-year retention, **Glacier Deep Archive** (the cheapest archive) addresses cost, and **Object Lock Compliance** (or Vault Lock Compliance for backups) applies WORM that even root cannot modify or delete. "Where to store it cheaply" and "enforcing immutability" are two orthogonal controls. A is too costly and insufficient at preventing deletion, C has no immutability guarantee, and D is unsuitable for 30-year WORM. Trap: "30 years, lowest cost, immutable" is the combination of Glacier Deep Archive + Compliance Lock.

---

**Question 12.** A global OTT service broadcasts live sports. It must stay uninterrupted even if an encoder fails, and it must receive camera feeds securely over the public internet. Which combination covers the input-to-encoding stage?
A) MediaConvert + S3 (file-based VOD transcoding)
B) MediaConnect (input redundancy) + MediaLive (pipeline redundancy)
C) MediaPackage + CloudFront (packaging and delivery stage)
D) Kinesis Video Streams + Lambda (data stream processing)

**Answer: B**

Explanation: **MediaConnect** receives live feeds over the public network securely and reliably with SRT/Zixi/RIST (input redundancy), and **MediaLive** runs two pipelines at once so that encoding continues without interruption even if an encoder fails. A is for VOD. C is the packaging and delivery stage, not input and encoding. D is a data stream, not video encoding. Trap: "secure live input + uninterrupted encoding" is MediaConnect + MediaLive.

---

**Question 13.** A seed-stage SaaS needs a relational database, has many hours when traffic is 0, and sometimes surges suddenly. It wants cost proportional to usage and seamless scaling. Which is the most appropriate choice?
A) RDS Provisioned Multi-AZ (fixed capacity + synchronous standby)
B) Aurora Serverless v2
C) Redshift (analytics columnar warehouse)
D) DynamoDB (key-value NoSQL, On-Demand billing)

**Answer: B**

Explanation: **Aurora Serverless v2** is a relational database that scales seamlessly per second in 0.5 ACU increments and bills in proportion to usage, which suits workloads with large variability. A has fixed capacity and therefore a large idle cost. C is an analytics warehouse. D does not fit the premise "a relational database is needed." Trap: "relational + variable + cost proportional" is Aurora Serverless v2.

---

**Question 14.** A global manufacturer wants to enforce that data from EU workloads cannot leave for Regions outside the EU. Even the account root must not be able to create resources in non-EU Regions. Which control is most appropriate?
A) Add a Region condition to IAM policies to restrict per user
B) SCP DenyRegions (`aws:RequestedRegion`)
C) Block network traffic to non-EU Regions with NACLs
D) Detect resources in non-EU Regions with a Config rule (detection only)

**Answer: B**

Explanation: An SCP is a permission ceiling that blocks even root (except for the management account), so blocking the APIs of non-EU Regions with a DenyRegions rule using the `aws:RequestedRegion` condition means no one can create resources in those Regions. A does not apply to root, C is at the network layer and cannot prevent resource creation, and D is only after-the-fact detection. Trap: "Region enforcement that blocks even root" is an SCP.

---

**Question 15.** A bank must inspect all inter-VPC and internet traffic centrally with IDS/IPS and TLS inspection. Which pattern is most appropriate?
A) Inspect L7 HTTP traffic with WAF alone
B) Transit Gateway + Inspection VPC + Network Firewall
C) Allow/deny by IP and port with NACLs on each subnet
D) Restrict inbound by tightening Security Group rules

**Answer: B**

Explanation: **TGW + Inspection VPC + Network Firewall** is a pattern that forces all east-west and north-south traffic through a central inspection point and performs Suricata-based IDS/IPS, domain filtering, and TLS inspection. WAF in A is limited to L7 HTTP, and C and D are simple allow/deny and are not IDS/IPS. Trap: "central IDS/IPS and TLS inspection for all traffic" is Inspection VPC + Network Firewall.

---

**Question 16.** A financial company wants to inject deliberate failures every quarter to prove that its DR meets its RTO/RPO, and to run this on an automatic schedule. Which combination is most appropriate?
A) Check the fault tolerance category with Trusted Advisor
B) AWS FIS + EventBridge Scheduler (+ evaluate with Resilience Hub)
C) Manually run a Backup Restore every quarter to confirm recovery
D) Monitor failure metrics with CloudWatch Alarms

**Answer: B**

Explanation: **AWS FIS (Fault Injection Service)** injects controlled failures (chaos engineering) to verify recovery, **EventBridge Scheduler** runs it automatically every quarter, and **Resilience Hub** evaluates resilience against the RTO/RPO policy. This automates the "DR proof" that regulators require. A and D are not DR proof tools, and C is manual, so it is not regular automatic verification. Trap: "deliberate failure injection, DR proof, automation" is FIS + Scheduler.

---

**Question 17.** A startup grew 100x, and its Lambda and Fargate cost reached tens of thousands of dollars per month. It wants a commitment discount while keeping serverless, and also wants flexibility to change Regions and families. Which is the most appropriate?
A) EC2 Instance Savings Plans (fixed Region and family)
B) Compute Savings Plans
C) Standard Reserved Instances (EC2 family and OS fixed)
D) Spot Instances (immediate discount with reclaim risk)

**Answer: B**

Explanation: **Compute Savings Plans** cover EC2, **Fargate, and Lambda**, and are the most flexible commitment, applying regardless of Region, family, and OS, so you get a discount while keeping serverless. A and C apply only to EC2 and cannot cover Lambda or Fargate. D is not a commitment discount. Trap: "Lambda and Fargate savings + flexibility" is Compute SP.

---

**Question 18.** A single scenario presents "PHI processing + FedRAMP High + 30-year WORM retention + a global live patient-monitoring stream" at the same time. What is the most correct approach?
A) Simplify it to a single case and apply only GovCloud
B) Decompose the constraints independently: GovCloud + HIPAA Eligible + BAA (compliance), Glacier Deep Archive + Vault Lock Compliance (30-year WORM), MediaLive/Connect (live, verify GovCloud support)
C) Use a standard Region for cost reasons
D) Store all data in a single S3 bucket

**Answer: B**

Explanation: The key to the Pro exam is to **decompose mixed constraints independently**. PHI + FedRAMP High maps to GovCloud + HIPAA Eligible + BAA, 30-year WORM maps to Glacier Deep Archive + Vault Lock Compliance, and live maps to MediaLive/Connect (but verify service support in that environment); each constraint is mapped to a different service. A is the classic trap of simplifying to one case and missing the other constraints, C violates FedRAMP High and PHI requirements, and D ignores isolation, WORM, and access control. Trap: "multiple constraints at once" calls for independent decomposition, not simplification.

---
---