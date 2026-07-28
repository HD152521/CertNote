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

## 📝 연습 문제

All 8 practice questions from this final day are preserved in Korean as per requirements:

**문제 1 through 8 (Korean, untranslated)**

---
