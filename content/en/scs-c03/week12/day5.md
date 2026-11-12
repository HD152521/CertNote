# Day 5 - D-Day Final: Exam Strategy, Keyword Translation, Trap Summary

The 12 final week is here. Today isn't new knowledge but *converting exam knowledge to score*. SCS-C03: 65 questions, 170 minutes, pass mark 750/1000 (scaled). Converting *what you know* to *timely answers* while *avoiding traps* is the last gatekeep.

## Exam Operations Strategy

- **Time**: 65 / 170min = 2.6min/question. If stuck past 4min → *flag for review*, move on. Never spend 4+ on one.
- **2-Pass Strategy**: 1st pass answer confident ones, flag rest. 2nd pass focus flagged. Spreads time pressure.
- **Text First Then Choices**: Read question's *last sentence* (actual ask) first, then body → less noise.
- **No Blanks**: No deduction for wrong. Guess after elimination, flag, move.
- **"MOST/BEST/LEAST" Emphasis**: Plural choices work; *degree* is tested. Hierarchy: managed>self, automated>manual, prevent>detect>respond.

> 💡 **Theory**: Specialty ≠ knowledge test but *judgment* test. Two choices both work; AWS Well-Architected Security Pillar rules winnow — *least privilege, multi-layer defense, traceability, automated security, protect transit and rest*. Last 2-choice almost always hinges on one.

## Keyword→Service Translation Dictionary

Core reflex: Text expression → Service instant translation. Speed-maker:

| Phrase | Service |
|---|---|
| "Anomalous behavior · malicious IP communication · data exfiltration" | GuardDuty |
| "Root cause · blast radius · visual investigation" | Detective |
| "Vulnerability · CVE · missing patch · network exposure" | Inspector |
| "S3 PII · sensitive data discovery · classification" | Macie |
| "Find policies exposed externally or cross-account" | IAM Access Analyzer |
| "Finding aggregation · CIS/PCI/FSBP score" | Security Hub |
| "Automated response · remediation with no human intervention" | EventBridge → Lambda / SSM |
| "Configuration compliance · change history · drift" | AWS Config |
| "Org-wide permission ceiling · make it impossible to do X" | SCP |
| "Central org-wide enforcement of WAF/SG/Shield" | Firewall Manager |
| "Automatic guardrails on new accounts · landing zone" | Control Tower |
| "Reach S3/DynamoDB without traversing the internet" | Gateway VPC Endpoint |
| "Reach other services without traversing the internet" | Interface Endpoint |
| "Block a specific IP range at the subnet" | NACL deny |
| "Automatic rotation of DB credentials" | Secrets Manager |
| "Config values/secrets with no rotation needed" | SSM Parameter Store |
| "We must exclusively own the keys · FIPS L3" | CloudHSM / KMS custom key store |
| "Audited key usage · policy-controlled encryption" | SSE-KMS + CloudTrail |
| "Cannot be deleted or altered · WORM" | S3 Object Lock + MFA Delete |
| "Safe delegation to a third party · confused deputy" | AssumeRole + External ID |
| "IAM role for an on-premises workload" | IAM Roles Anywhere |
| "Multi-account SSO · SAML federation" | IAM Identity Center |
| "Application end-user authentication" | Cognito |

## Trap Consolidation

> ⚠️ **Logging·Detection**:
> - CloudTrail management events **do not record S3 object or Lambda data access** → enable data events separately.
> - GuardDuty **consumes the logs internally**, so you don't need to turn on Flow Logs/DNS logs separately — and don't turn them off.
> - GuardDuty=threats, Inspector=vulnerabilities, Macie=data, Detective=investigation, SecurityHub=aggregation. Don't confuse them.
> - VPC Flow Logs **do not see the payload** (allow/deny and metadata only). For content, use packet mirroring or app logs.

> ⚠️ **IAM·Governance**:
> - **SCPs and Permission Boundaries grant nothing** — they only cap the ceiling.
> - Evaluation order: **explicit Deny wins first**, then SCP, Allow, Boundary, implicit Deny.
> - **Never place long-lived access keys on a workload** → use roles (instance profile/IRSA/execution role).
> - Prevent the confused deputy problem in cross-account delegation with an **External ID**.
> - IAM roles=employees and workloads, **Cognito=application users**.

> ⚠️ **Network**:
> - **NACLs are stateless** → allow outbound ephemeral ports (1024-65535) separately.
> - SGs have **no deny rules** (allow-list only). Blocking an IP is a NACL deny.
> - Even with a VPC Endpoint created, **the endpoint and IAM policies must allow it** for traffic to flow.
> - Network Firewall only inspects traffic if you **force it through via routing**.
> - For stateful inspection through TGW, omitting **appliance mode** causes asymmetric-routing failures.

> ⚠️ **Data Protection**:
> - **ACM certificates for CloudFront are issued only in us-east-1**.
> - KMS uses **envelope encryption** (it does not encrypt large objects directly).
> - The KMS key policy **must trust root for IAM policy delegation to work**.
> - KMS key deletion has a **7-30 day waiting period** — until then, disable is recoverable.
> - at-rest (SSE/KMS) and in-transit (TLS · `aws:SecureTransport`) are **separate controls** — you need both.
> - SSE-S3 is weak on key auditing and policy control → when control is required, use **SSE-KMS**.

> 🎯 **Last 2-Choice Rule**: If both answers work — (1) which is more *managed*? (2) more *automated*? (3) more *least-privilege*? (4) more *impossible to bypass*? (5) higher in the *prevent > detect > respond* hierarchy? (6) enforceable *org-wide*? Pick whichever satisfies more of these.

## D-Day Mindset

> 🔍 **Deeper**: Apply the per-domain mental models built over these 12 weeks exactly as they are — the detection and response nervous system (1·2), dual control over path × permission (3·4), and encryption × governance propagation (5·6). Move what you know into answers, on time, avoiding the traps. Stay calm, decompose, translate, dodge the traps. Good luck on the exam.

---

## 📝 Practice Questions

**Question 1.** During the exam, you have been unable to decide between two options on one question for 4 minutes. What is the most reasonable action?

A) Keep holding on until the answer comes to you
B) Mark it with flag for review, move on to the next question, and revisit it in the second pass
C) Leave it blank
D) End the exam early

**Answer: B**
Explanation: The average is about 2.6 minutes per question, so spending too much time on one question breaks your overall pace. The standard strategy is to mark it with flag for review, move on, and focus on it in the second pass. Holding on costs a lot of time, there is no penalty for wrong answers so leaving it blank is a loss, and ending early throws away the chance to review.

---

**Question 2.** The passage says "automatically, without manual intervention, remediate non-compliant resources." What typical pattern does this keyword point to?

A) A person checks the console every day
B) Config/GuardDuty finding -> EventBridge -> Lambda or SSM Automation automated remediation
C) An IAM policy review meeting
D) A weekly Trusted Advisor report

**Answer: B**
Explanation: "Automatic remediation without human intervention" almost always points to event-driven automation (Config/finding -> EventBridge -> Lambda/SSM Automation). Manual console checks, review meetings, and weekly reports are all manual and after-the-fact, so they do not match the automatic remediation requirement. The reflex of translating keywords into patterns creates speed.

---

**Question 3.** The requirement is "prevent any account in the organization from performing a specific action." When the two options are (A) detect with a Config rule and (B) Deny with an SCP, which is best?

A) Config rule - because it finds violations
B) SCP Deny - a preventive control that makes the action impossible in the first place (prevent > detect)
C) Both are the same
D) Manually attach IAM policies in each account

**Answer: B**
Explanation: "Prevent from doing" is a preventive control requirement. An SCP Deny makes the action impossible in the first place at the organization/OU level, and in the security hierarchy, prevent comes before detect. Config is only after-the-fact detection, and manually attaching IAM policies causes drift at multi-account scale. Settle last-minute two-way choices with the hierarchy prevent > detect > respond.

---

**Question 4.** Both options work: (A) a script that rotates keys directly with cron on EC2, and (B) Secrets Manager automatic rotation. Which answer is preferred in SCS-C03, and why?

A) The custom script - because it is more flexible
B) Secrets Manager automatic rotation - managed and automated solutions are preferred over self-implementation (managed > self-managed)
C) Both are the same
D) Key rotation is unnecessary

**Answer: B**
Explanation: Even when both approaches work, AWS prefers managed, automated solutions over self-implementation (in terms of operational burden, errors, and auditing). Secrets Manager's built-in rotation is best. A custom script carries high maintenance and failure risk, and key rotation is necessary for security. This is a typical application of the managed > self-managed preference hierarchy.

---

**Question 5.** Which of the following trap statements is *not true*?

A) CloudTrail management events do not record S3 object-level access
B) An SCP does not grant permissions; it only limits the maximum
C) An ACM certificate for CloudFront may be issued in any Region
D) A NACL is stateless, so outbound ephemeral ports must be allowed separately

**Answer: C**
Explanation: An ACM certificate to be attached to CloudFront must be issued in us-east-1 (N. Virginia), so "in any Region" is not true. The rest are all true, frequently tested traps: data events must be enabled separately, an SCP does not grant permissions (it limits the maximum), and NACLs are stateless with ephemeral ports. Because this question asks for the *incorrect* statement, the answer is the ACM Region statement.

---

**Question 6.** The requirement is "access S3 from a private subnet in the MOST cost-effective way." Which answer does the emphasis phrase "MOST cost-effective" decide?

A) Through a NAT Gateway (billed per hour and per data processed)
B) An S3 Gateway VPC Endpoint (free)
C) An Interface Endpoint (billed per hour and per data)
D) Assign a public IP

**Answer: B**
Explanation: S3 supports Gateway Endpoints, which are free, so the emphasis phrase "most cost-effective" decides the answer. A NAT Gateway and an Interface Endpoint both have hourly and data charges, and assigning a public IP violates the private and security requirements. An emphasis phrase (MOST cost-effective) makes you pick the best among several working answers by the cost criterion.

---

**Question 7.** Which is the most inappropriate exam mindset?

A) Identify the last sentence of the question (what is actually being asked) first
B) Hold on to a question you do not know until you solve it, then move on
C) When two answers both work, decide using the preference hierarchy (managed/automated/least-privilege/prevent)
D) Immediately eliminate options that clearly violate the requirements (hardcoding keys, making things public)

**Answer: B**
Explanation: Holding on to a question you do not know until the end is a wrong strategy that breaks your overall pace; the right move is to flag for review and move on. The rest (last sentence first, applying the preference hierarchy, immediately eliminating clearly wrong answers) are all recommended exam techniques. Passing comes from the pace across 65 questions, not from perfecting one question.

---

**Question 8.** Which option correctly links the two requirements "automatically discover whether credit card numbers are stored in S3" and "assess whether EC2 has unpatched CVEs" to the right services?

A) GuardDuty for both
B) The former is Macie (S3 sensitive data classification), the latter is Inspector (vulnerability/CVE assessment)
C) The former is Inspector, the latter is Macie
D) Config for both

**Answer: B**
Explanation: Discovering and classifying sensitive data such as credit card numbers in S3 is a dedicated Macie capability, and CVE/vulnerability assessment of EC2/ECR/Lambda is Inspector's role. GuardDuty detects behavioral threats and Config assesses configuration compliance, so both are unsuitable for these requirements. Distinguishing the service roles (data = Macie, vulnerabilities = Inspector) is a frequently tested essential.

---
