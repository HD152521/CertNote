# Day 4 - Full Practice Exam Pace: Six-Domain Synthesis Scenario Review

Today is practical *pacing training*, not learning. Real SCS-C03: 65 questions, 170 minutes — ~2.6 min/question. We dissect long scenarios quickly in 1 minute, extracting the *skeleton*. Question bias matters: Domain 3/4 (infrastructure/IAM) ~38%, Domain 1/2 (detection/incident response) ~30%, Domain 5/6 (data/governance) ~32%.

## Pacing Strategy: 4-Step Scenario Breakdown

Long text in 1 minute:

1. **Find the core verb** — "automatically," "without managing," "least privilege," "cannot be deleted," "centrally," "private." Verb shapes answer pattern.
2. **Mark constraints** — "multi-account," "no internet," "regulatory," "cost-effective," "existing X." Filters wrong answers.
3. **Kill 2 obvious losers** — Requirements directly violated (hardcode keys, public, manual) → immediate elimination.
4. **Choose "best" from 2 remaining** — More managed? More auto? More least-priv? More un-bypassable? More preventive > detective? More org-wide?

> 💡 **Theory**: Specialty tests not "right vs wrong" but "better vs worse." Two choices both work; AWS prefers *managed > self, automated > manual, preventive > detect > respond, defense-in-depth > single control, org-wide > per-account*. Final 2-choice comes down to preference hierarchy.

## Quick Keyword→Service Mapping

| Phrase | Service |
|---|---|
| "行为异常·恶意IP" | GuardDuty |
| "根本原因·范围" | Detective |
| "CVE·补丁" | Inspector |
| "S3 PII发现" | Macie |
| "自动无人干预" | EventBridge → Lambda |
| "无互联网S3" | Gateway VPC Endpoint |
| "我们独占HSM" | CloudHSM/custom key store |
| "删除·变改不可" | S3 Object Lock + MFA Delete |
| "第三方安全交接" | AssumeRole + External ID |
| "组织全体强制" | SCP / Firewall Manager / Conformance Pack |

## Traps (5 Expensive Mistakes)

- **CloudTrail管理事件 ≠ S3对象访问** → 数据事件单独激活.
- **SCP不授予权限** → 仅上限.
- **NAC L无状态** → 出站临时端口单独允许.
- **CloudFront ACM=us-east-1** → 其他区域失败.
- **KMS密钥删除=7-30天等待** → 前disable复原.

## Exam Mindset (30 Seconds Before Bell)

> 🔍 **Deeper**: Specialty tests "right *combination* in this situation," not "know this service." Scenario dissection → keyword translation → trap avoidance → preference hierarchy. One question perfection < 65-question pacing = pass. 12 weeks of domain mental models — apply them unchanged.

---

## 📝 Practice Questions

**Question 1.** (Domains 1, 6) A company wants to centrally retain all API activity from 200 accounts in a tamper-proof way, prevent any account from turning off logging, and have this applied automatically to new accounts. What is the most appropriate design?

A) Each account administrator creates an individual trail and stores it in a local S3 bucket
B) An organization trail to a central S3 bucket (in a different account, with log file validation and Object Lock) + an SCP that denies StopLogging/DeleteTrail + Control Tower to apply it automatically to new accounts
C) Retain in CloudWatch Logs for 90 days, then delete automatically
D) Collect logs with a Lambda function in each account

**Answer: B**
Explanation: For multi-account central aggregation, an organization trail automatically includes new accounts, and a separate logging-account S3 bucket + log file validation + Object Lock (WORM) guarantees tamper-proofing. An SCP that denies StopLogging/DeleteTrail prevents disabling, and Control Tower automatically applies guardrails to new accounts. Individual or local retention, short-term deletion, and custom Lambda collection fail to satisfy centralization, immutability, and automation all together.

---

**Question 2.** (Domains 1, 2) GuardDuty detects cryptocurrency-mining malware communication from an EC2 instance. The security team wants to (1) isolate the instance immediately, (2) investigate the scope of the compromise, and (3) automatically isolate the same finding in the future without human intervention. What is the most appropriate combination?

A) Terminate the instance and manually search through the logs
B) Replace the security group with an isolation security group (+ snapshot) -> investigate the scope with Detective -> EventBridge routes that finding type to Lambda/SSM automated isolation
C) Block all traffic with a NACL and stop there
D) Only scan for vulnerabilities with Inspector

**Answer: B**
Explanation: Isolating (not terminating) preserves volatile evidence, a snapshot captures the evidence, Detective investigates the scope based on its behavior graph, and EventBridge routes that GuardDuty finding to Lambda/SSM Automation automated isolation so that no human intervention is needed in the future. Terminating and manual work destroy evidence and are not automated, a one-off NACL block has no investigation or automation, and Inspector is a vulnerability scanner, not an incident response tool.

---

**Question 3.** (Domains 3, 4) A Lambda function in a private subnet must access DynamoDB and a specific S3 bucket without going through the internet, and hardcoding credentials is prohibited. You also want to minimize cost. What is the most appropriate design?

A) Place the Lambda function in a public subnet and access through a NAT Gateway
B) Configure S3 and DynamoDB Gateway Endpoints (free) in the VPC + grant least-privilege permissions on those resources to the Lambda execution role + a SourceVpce condition in the bucket policy
C) Store IAM access keys in Lambda environment variables
D) Use Interface Endpoints for S3 and DynamoDB

**Answer: B**
Explanation: S3 and DynamoDB support Gateway Endpoints (routing-based, free), which satisfy both no internet traversal and minimal cost; the Lambda execution role provides temporary credentials, removing hardcoding; and the bucket policy SourceVpce condition locks down the access path. Going through NAT traverses the internet and costs money, storing keys in environment variables is prohibited, and Interface Endpoints for S3/DynamoDB are an unnecessary paid option.

---

**Question 4.** (Domain 5) Healthcare-regulated data is stored in S3, and the requirements are (1) encryption both at rest and in transit, (2) auditing of key usage, and (3) no one (including administrators) can delete or tamper with it for 7 years. What is the most appropriate combination?

A) SSE-S3 + versioning only
B) SSE-KMS (CMK, key policy) + bucket policy enforcing aws:SecureTransport + CloudTrail KMS auditing + S3 Object Lock (Compliance mode, 7-year retention)
C) SSE-C + MFA Delete
D) Client-side encryption only

**Answer: B**
Explanation: Encryption at rest, auditing, and access control are met by SSE-KMS (CMK + key policy + CloudTrail auditing of KMS API calls), encryption in transit by enforcing aws:SecureTransport, and "no one can delete or tamper, including administrators" by S3 Object Lock Compliance mode with 7-year retention. SSE-S3 is weak in auditing and key control, SSE-C lacks key management and auditing, and any setup without Object Lock cannot satisfy the immutability requirement.

---

**Question 5.** (Domains 4, 6) A third-party security audit firm must inspect the organization's 50 accounts with read-only access. You want to avoid sharing long-term keys, prevent the confused deputy problem, and manage this centrally. What is the most appropriate approach?

A) Create an IAM user in each account and email the access keys to the firm
B) A cross-account read-only role + the firm's account Principal and an External ID condition in the trust policy, deployed to all 50 accounts at once with CloudFormation StackSets
C) Share the root credentials
D) Make the buckets public

**Answer: B**
Explanation: Secure cross-account access without long-term keys is a read-only role + AssumeRole; the External ID in the trust policy prevents the confused deputy problem, and StackSets deploys the role to the 50 accounts in bulk and centrally. Emailing access keys, sharing root, and making buckets public are all serious security violations and are eliminated immediately.

---

**Question 6.** (Domain 3) A global web app receives (1) SQLi attempts, (2) login brute force, and (3) intermittent large-scale L3/4 floods. Direct access to the origin must also be blocked. What is the most appropriate integrated design?

A) Attach WAF only to the ALB
B) CloudFront in front + a CLOUDFRONT-scope WAF (SQLi managed rules + a rate-based rule on /login) + Shield Advanced + blocking direct origin access (prefix list/secret header)
C) Only harden the EC2 security groups
D) Distribute traffic with Route 53 routing

**Answer: B**
Explanation: Because the threats are at different layers, combined controls at the edge are the answer. CloudFront consolidates the entry point, WAF handles SQLi (L7 filtering) and login brute force (rate-based), Shield Advanced handles L3/4 flood absorption and cost protection, and blocking direct origin access with a prefix list/secret header prevents bypass. ALB alone, hardening security groups, and traffic distribution cannot stop this combined threat.

---

**Question 7.** (Domains 1, 5) The security team wants to automatically discover and classify "which S3 buckets contain sensitive data such as credit card numbers and resident registration numbers" and aggregate the results in a central security dashboard. What is the most appropriate combination?

A) Download all objects with your own script and check them with regular expressions
B) Use Amazon Macie to automatically discover and classify sensitive data in S3 -> aggregate findings in Security Hub
C) Install GuardDuty on the S3 buckets
D) Inspect object contents with Config rules

**Answer: B**
Explanation: Automatic discovery and classification of PII and financial data in S3 is a dedicated Macie capability, and findings are normalized and aggregated in Security Hub for viewing in a central dashboard. Downloading and regex checking is inefficient and risky, GuardDuty detects behavioral threats and does not classify data contents, and Config evaluates configuration and does not inspect object contents.

---

**Question 8.** (Domain 6) You want to enforce a standard WAF rule on every ALB and CloudFront distribution across the organization, apply it automatically to newly created resources, and make violations visible centrally. What is the most appropriate service?

A) Configure WAF manually in each account
B) Define and enforce organization-wide WAF policies with AWS Firewall Manager (automatically applied to new resources)
C) Enforce WAF with an SCP
D) Detect only with Config rules

**Answer: B**
Explanation: Firewall Manager integrates with Organizations to define WAF, Shield, and security group policies at the organization level, automatically applies them to newly created resources, and makes violations centrally visible. Manual configuration causes drift, an SCP is a permissions guardrail and not a tool for deploying WAF rules, and Config only detects and cannot enforce.

---

**Question 9.** (Domains 3, 4) An EC2 application must use RDS credentials. The credentials must be rotated automatically on a regular schedule and must not be embedded in code. What is the most appropriate combination?

A) Store the RDS password in an environment variable
B) Store the RDS credentials in Secrets Manager (automatic rotation with a Lambda rotator) + grant the EC2 instance role GetSecretValue permission on that secret
C) Store it in SSM Parameter Store as a String (plaintext)
D) Hardcode it in the code and change it manually on a regular basis

**Answer: B**
Explanation: For DB credentials that need automatic rotation, Secrets Manager rotates them periodically with a Lambda rotator, and granting the EC2 instance role only GetSecretValue achieves least privilege and no hardcoding. Environment variables, plaintext parameters, and hardcoding have no rotation or a high exposure risk. (For configuration values that do not need rotation, Parameter Store SecureString is also a candidate, but for an automatic rotation requirement, Secrets Manager is the answer.)

---

**Question 10.** (Domain 1) A team cannot find out "who downloaded an S3 object." Default CloudTrail is on. What is the cause?

A) VPC Flow Logs are turned off
B) S3 object-level access is recorded only when CloudTrail data events are separately enabled (management events do not record it)
C) GuardDuty is disabled
D) The bucket logs are encrypted with KMS and cannot be seen

**Answer: B**
Explanation: Default CloudTrail management events do not record data-plane access such as S3 object GET/PUT, so object-level tracking requires explicitly enabling data events. Flow Logs cannot identify objects, GuardDuty is not an audit source, and KMS encryption is unrelated to log visibility. Enabling data events separately is a frequently tested trap.

---
