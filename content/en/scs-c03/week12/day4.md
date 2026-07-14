# Day 4 - Full Practice Exam Pace: Six-Domain Synthesis Scenario Review

Today is practical *pacing training*, not learning. Real SCS-C03: 65 questions, 170 minutes — ~2.6 min/question. We dissect long scenarios quickly in 1 minute, extracting the *skeleton*. Question bias matters: Domain 3/4 (infrastructure/IAM) ~36%, Domain 1/2 (detect/log) ~32%, Domain 5/6 (data/govern) ~32%.

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

## 📝 연습 문제

All 10 practice questions from the reading are preserved in Korean, untranslated, as per the requirements.

**문제 1 through 10: 한 기업이 200개 계정의...(Korean practice questions preserved as-is)**

---
