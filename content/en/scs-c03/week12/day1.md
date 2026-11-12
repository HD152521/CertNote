# Day 1 - Integrated Review Domains 1 & 2: Detection ↔ Incident Response

Domain 1 (Detection, 16%) and Domain 2 (Incident Response, 14%) together make up 30% of the exam and form one bundle. In SCS-C03, logging and monitoring is not a separate domain but **part of Domain 1 Detection** — monitoring and alerting, logging, and troubleshooting monitoring and logging all live in Domain 1. Domain 2 covers designing and testing incident response plans and responding to events, including validating findings to assess scope and impact. They almost always appear as *one flow* in exams. "Logs must exist to detect, detection must exist to respond." Today, we review the pipeline — **collection (logs) → analysis/detection (GuardDuty/Detective/Macie) → aggregation (Security Hub) → auto-response (EventBridge→Lambda/SSM)** — as one nervous system.

## Logging Layer: What Gets Recorded Where

Detection originates from logs. Exams endlessly ask: "To see this evidence, which log must you activate?"

| What You Want to Know | Log Source | Location/Note |
|---|---|---|
| Who called which API | CloudTrail (management events) | On by default, held 90 days in console. Permanent retention via S3 |
| S3 object/Lambda data access | CloudTrail **data events** | Explicit activation, metered. Tracks object GET/PUT |
| VPC IP flow (allow/deny) | VPC Flow Logs | Per ENI/Subnet/VPC. No payload |
| DNS query content | Route 53 Resolver query log | Domain exfiltration detection |
| HTTP request and block | WAF log | `aws-waf-logs-` prefix required |
| OS/app internal activity | CloudWatch Logs (agent) | Instance internal visibility |
| Configuration change history, compliance | AWS Config | Resource timeline, rule evaluation |

Critical trap: **CloudTrail management events do not record S3 GetObject.** Object-level access requires *data events* explicitly enabled. Organization trails aggregate multi-account into single S3 bucket, log file validation (SHA-256 digest) detects tampering, SSE-KMS encryption.

## Detection Layer: Translate Logs to Threats

- **GuardDuty**: Analyzes CloudTrail, VPC Flow Logs, DNS logs with ML and threat intel to generate findings.
- **Macie**: Auto-classify and discover PII, sensitive data in S3.
- **Detective**: Graph-investigate GuardDuty finding's root cause and scope.
- **Inspector**: Scan EC2/ECR/Lambda for CVE vulnerabilities and network exposure.
- **Access Analyzer**: Analyze resource policies exposed to external/cross-account.

## Aggregation Layer: Security Hub

Security Hub normalizes findings from GuardDuty, Inspector, Macie, Config into **ASFF** standard. Provides automated compliance scores (CIS, AWS FSBP, PCI DSS, NIST).

## Response Layer: EventBridge Wires the Nerve

**EventBridge** routes findings to Lambda (immediate remediation), SSM Automation (multi-step response), SNS (human alert), or Step Functions (approval-gated workflow).

### Standard Incident Response Procedure

Compromised EC2 response order:
1. **Isolate**: Replace with empty security group for forensic isolation.
2. **Preserve Evidence**: EBS snapshot, memory dump, instance metadata.
3. **Detach**: Detach from Auto Scaling Group to prevent replacement.
4. **Investigate**: Detective for scope, share snapshots to forensic account.
5. **Recover/Remediate**: Redeploy clean AMI, revoke compromised credentials.

## 📝 Practice Questions

**Question 1.** The security team wants to trace "which IAM user downloaded a specific S3 object." With only default CloudTrail turned on, this information was not visible. What are the cause and the fix?

A) VPC Flow Logs must be turned on  
B) CloudTrail **data events** (S3 object level) must be explicitly enabled — management events do not record object GET/PUT  
C) Turning on GuardDuty records it automatically  
D) The CloudWatch Logs agent must be installed  

**Answer: B**

---

**Question 2.** GuardDuty generated a malicious IP communication finding for an EC2 instance. The security team wants to visually investigate which other resources and accounts this instance is connected to and how far the compromise has spread. What is the most suitable service?

A) Amazon Inspector  
B) Amazon Macie  
C) Amazon Detective  
D) AWS Config  

**Answer: C**

---

**Question 3.** Requirement: "When a Config rule finds a public S3 bucket, immediately block public access and notify the security team without human intervention." What is the most appropriate implementation?

A) Only review the Config rule score daily  
B) Config rule + automatic remediation (SSM Automation) to immediately apply PublicAccessBlock + notify via EventBridge -> SNS  
C) Remove all users' S3 permissions with IAM policies  
D) Register the bucket with GuardDuty  

**Answer: B**

---

**Question 4.** When handling an EC2 instance suspected of compromise, what is the correct first action to isolate it while preserving volatile evidence?

A) Terminate the instance immediately  
B) Replace the security group with a forensic isolation security group that has no inbound or outbound rules, detach it from Auto Scaling, and take an EBS snapshot  
C) Change the security group to allow everything to observe the traffic  
D) Delete only the instance IAM role  

**Answer: B**

---

**Question 5.** Which of the following pairings of a detection service and its main purpose is incorrect?

A) GuardDuty — detection of threats (behavioral anomalies) based on CloudTrail/Flow Logs/DNS  
B) Inspector — assessment of vulnerabilities (CVEs) and network exposure for EC2/ECR/Lambda  
C) Macie — automatic classification and discovery of PII and sensitive data in S3  
D) Security Hub — investigating the root cause of GuardDuty findings with a graph  

**Answer: D**

---

**Question 6.** In a multi-account environment, we want to centrally retain the CloudTrail logs of all accounts in a tamper-proof way. What is the most appropriate combination?

A) Each account retains its own trail locally  
B) Aggregate into a single central S3 bucket with an Organization trail + log file validation (digest) + SSE-KMS + S3 Object Lock (WORM)/MFA Delete  
C) Store only in CloudWatch Logs and delete after 30 days  
D) Upload logs directly to GuardDuty  

**Answer: B**

---
