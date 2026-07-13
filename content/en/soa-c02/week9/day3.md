# Day 3 - IAM Access Analyzer and Trusted Advisor, Proving Permissions with Code

Security's hardest question isn't "who can do what" but "who can do **what they shouldn't**?" Manually reading IAM policies line-by-line for external exposure is impossible. S3 bucket policy, KMS key policy, IAM role trust policy intertwining make "is this bucket open to outside?" unanswerable by human eyes alone. Policy combination permutations explode.

IAM Access Analyzer's essence: **mathematically proving** this question. Not executing policies observing results (can't try all cases), but converting policies to logic formulae asking "does input allowing external access exist?" using formal logic. Why this "proof" not "detection," how automated reasoning handles infinite cases finitely, why Trusted Advisor auto-checks best practices — understanding these tools transcend simple scanners.

## "Detection" Not "Proof" — Why Access Analyzer Uses Formal Logic

Most security scanners pattern-match. Hold rule list "this policy shape is dangerous," flag matching patterns. Problem: IAM language expressiveness prevents enumerating all risky patterns. Condition clause combinations, wildcards, NotPrincipal, NotAction negation intertwining create "looks-safe actually-external-open" policies infinitely. Pattern lists miss these bypasses.

Access Analyzer uses fundamentally different approach: **Automated Reasoning** — convert policies to formal logic propositions, ask "does principal outside Zone of Trust exist that can access this resource?" via **SMT (Satisfiability Modulo Theories) solver**. Solver finding "such input exists" is finding; proving "not exists" means safe. This **mathematically judges all possible cases once**, not tries them.

Difference decisive: pattern matching says "didn't hit known dangers" — unknown bypass might exist. Formal proof asserts "input enabling external access logically doesn't exist" — false negatives impossible in principle. AWS implements this with Zelkova engine (company's Automated Reasoning Group), running in Access Analyzer, S3 Block Public Access, some IAM validation.

> 💡 **Related Theory**: SMT solver extends SAT (boolean satisfiability) NP-complete "do boolean variable assignments make this formula true?" to rich theories (integers, strings, sets). Post-1962 DPLL algorithm practical solvers (Z3, CVC) evolved solving millions-variables. Applying SMT to IAM means "does (Principal, Action, Resource, Condition) combo satisfying this policy exist outside Zone of Trust?" becomes satisfiability problem. Same technique applies hardware verification (CPU circuit meets spec), program verification — Access Analyzer applies theorem-proving to cloud permissions.

> 🔍 **Deeper Dive**: Zelkova compares two policies: "does policy A allow more access than policy B (A ⊇ B)?" Set containment proof via logic conversion — no infinite-request substitution, just set containment. This underlies Policy Validation "does this change widen permissions?", S3 Block Public Access "does this policy allow public access?" instant determination. Access Analyzer lacks "scan period" — evaluates near real-time on policy change.

## Zone of Trust — Defining "Outside"

Access Analyzer's External Access reports only findings "outside Zone of Trust." Same-account access considered normal, ignored. Precisely what "outside" means? This boundary determines analysis meaning.

Creating Analyzer, define Zone of Trust **account-level** or **Organization-level**. Account Analyzer treats all outside that account "outside" — other AWS accounts, Organizations, anonymous access (`Principal: *`) all findings. Same-Organization sibling accounts caught external. Organization Analyzer treats entire Organization as trust boundary; within-organization access normal, outside-organization findings only.

Distinction matters: **governance model determines "normal sharing" scope.** Multi-account organizations often intentionally share S3 between sibling accounts — this account-level Analyzer makes legitimate sharing noise-findings. Organization-level finds only "real leaks" out-organization. Single-account strict isolation? Account-level correct. Zone of Trust defines "what counts normal" — policy decision not technical detail.

Analysis targets: S3 buckets, IAM roles (trust policy), KMS keys, Lambda (resource policy), SQS queues, Secrets Manager, EBS/RDS snapshots, ECR repositories, EFS — all can open external access via resource-based policy.

> ⚠️ **Trap**: Analyzer sees only Zone of Trust **outside**. Account internal excessive permissions (department accessing another's data) doesn't trigger External analysis. Internal unused/excess permissions handled separately by **Unused Access Analyzer**. Exam: "external exposure detect" = External, "unused permissions/roles find" = Unused. Access Analyzer per-region (not global); multi-region governance requires analyzer per-region or Security Hub integration.

## Unused Access — Fighting Permission Entropy

Permissions always increase over time. Add for new features; when features disappear, permissions remain. Rarely someone narrows permissions back. Result: IAM role/user permissions monotonically increase; hold far more than actually use. Called **permission creep** or permission entropy — left alone, disorder grows.

Unused Access Analyzer measures entropy. CloudTrail activity analysis finds 90-day unused: inactive IAM users, 90+ days unused roles, API permissions never called, unused access keys. This list candidates for "safe-to-remove permissions."

Why security-critical? **Principle of Least Privilege** practically impossible executing — everyone knows it's right but "what's actually minimal?" no way to know. Narrow permissions risking breaking functionality; nobody touches. Unused Access provides data: "unused 90 days, safe to remove," making data-based narrowing possible, not guessing.

> 💡 **Related Theory**: Least Privilege from 1975 Saltzer-Schroeder classic "Protection of Information in Computer Systems" — one of eight design principles. "All programs and users must operate only minimal permission to complete tasks." Reason simple — less permission means smaller damage (blast radius) if compromised. 50-year-old principle newly challenging in cloud: permission types/quantity exploded. Unused Access Analyzer + Policy Generation automate this ancient principle.

## Policy Generation — Automating "Broad First, Narrow Later"

Creating new app/role, knowing exactly needed permissions almost impossible. Reality: "broaden with `*`, see if it works, narrow later." Problem: "later" never comes. Narrowing risky (wrong narrowing breaks functionality), tedious; `*` stays production.

Policy Generation automates "narrow later." Specify role, Access Analyzer scans **90 days CloudTrail activity**, extracts actually-called APIs, generates minimal-permission policy JSON. Analyzes not just Actions but which Resource ARNs, which Conditions. Operator reviews, replaces `*` policy.

This flow elegant: **inverts theory/practice order.** Traditional: "design needed permissions → write policy → deploy" — fails because can't know permissions upfront. Generation: "deploy broad → observe real usage → reverse-engineer policy from data" — reality-aligned. Extract policy from observed behavior, not design assumptions.

> 🔍 **Deeper Dive**: Policy Generation accuracy requires CloudTrail kept sufficiently long (ideally 90d), period analysis includes role's **all normal paths**. Quarter-end batch job not running during analysis period means permission omitted, post-replacement quarter-end breaks. Generated policies need validation against Access Advisor, sufficiently-long analysis period (rare-run tasks included). Auto-generation is starting point, not final answer.

> 📚 **Case Study**: Permission creep's typical incident: 2019 Capital One breach. Excessive S3 permissions on WAF role, combined with SSRF, let attackers read 100M+ customer records via temp credentials. Key lesson: "role didn't need such broad S3 access" — minimal privilege would limit breach scope. Unused Access Analyzer and Policy Generation find exactly "unused-held broad permissions."

## Policy Validation — 100+ Checks at Write-Time

Access Analyzer intervenes not just post-detection but policy **write-time**. Validation runs 100+ checks real-time on write/modify, presenting security warnings, syntax errors, improvement suggestions. Auto-attached to IAM console policy editor; instant feedback "wildcard too broad," "Action doesn't apply to Resource type."

More valuable than post-detection because **shift left** — earlier lifecycle problem-catch cheaper fix. Risky policy post-deployment caught as finding much worse than write-moment prevention.

Custom Policy Checks (paid) further enforce company guardrails via code. "No policy ever allows `s3:DeleteBucket`", "change doesn't widen permissions" — enforce in CI/CD pipeline. Policy change PR violating guardrails blocks merge. Leverages Zelkova's policy-comparison ability (A ⊇ B determination), formally proving "does this PR expand permissions?" to block.

> 💡 **Related Theory**: Shift left from software quality "defects cost exponentially more if found late" (Boehm cost curve). Design defect fix cost = 1; coding ~6x, testing ~15x, production ~100x. Validation (write-time) and Custom Checks (CI/CD) catch security defects leftmost (write/merge), avoiding expensive production-incident remediation path.

## Trusted Advisor — Automatically Scoring Best Practices

Where Access Analyzer formally-validates permissions, Trusted Advisor auto-scores account-wide best practices. AWS rule-codes accumulated customer operations, scans account, reports violations five categories: Cost Optimization, Performance, Security, Fault Tolerance, Service Limits.

Service Limits especially operationally useful. Most AWS resources have account/region limits (EC2 count, EIP count, VPC count); hitting limit blocks new resources — traffic spike autoscaling tries launching instances but hits limit, scaling stops. Advisor warns at 80%, prompting pre-incident limit increase requests.

Core constraint: **access scope varies by Support plan.** Basic/Developer: 7 security checks + service limits only; 100+ checks Business ($100/month) or Enterprise only. Exam: "whole Trusted Advisor?" → "Business+ Support."

> 🔍 **Deeper Dive**: Beyond console, Trusted Advisor exposes API (`describe-trusted-advisor-checks`, `describe-trusted-advisor-check-result`), EventBridge integration. Result change (new public S3) issues event triggering SNS/Lambda. `refresh-trusted-advisor-check` immediate re-check possible. Trusted Advisor "recommends," doesn't auto-fix — auto-remediation via AWS Config remediation or Lambda. Advisor diagnoses, doesn't treat.

## Access Analyzer vs Trusted Advisor vs Config — Three Tools' Roles

All three find "wrong config" seeming overlap, frequently confused in exams. Roles clear: **Access Analyzer formally-proves permission external exposure**, **Trusted Advisor checks broad best practices**, **Config tracks resource configuration changes and rule evaluation.**

Analyzer specialists in "resource open to outside?" — narrow deep. Advisor broad health-check (cost/performance/security/availability/limit) — broad shallow. Config "resource config at time T?", "follows rule (e.g., all EBS encrypted)?" tracks history, compliance state (next section's Security Hub integrates).

| Question | Best Tool |
|------|-------------|
| S3 exposed to outside account? | Access Analyzer (External) |
| Unused IAM permissions/roles? | Access Analyzer (Unused) |
| Policy safe (write-time)? | Access Analyzer (Validation) |
| MFA root absence, public S3, best-practice violations? | Trusted Advisor (Security) |
| EC2 limit 80%? | Trusted Advisor (Service Limits) |
| All EBS encrypted, rule-violation track? | AWS Config |
| Resource config changed when/how? | AWS Config |

Plus **AWS Health Dashboard** entirely different — Advisor/Analyzer/Config see "customer config issues," Health sees "AWS-side issues" (instance retirement, EBS performance, deprecation). And **AWS Artifact** not checking tool but AWS compliance-report (SOC, PCI, ISO) free download — provide "AWS infrastructure meets standard" evidence to auditors.

> ⚠️ **Trap**: "Need compliance report" confuses Artifact and Audit Manager. Artifact is **AWS complies** SOC/PCI reports (AWS responsibility proof); Audit Manager is **customer** standards compliance evidence gathering (customer responsibility). Shared Responsibility: Artifact "AWS side," Audit Manager "customer side."

## Summary

All tools automate "questions humans can't reliably answer." Analyzer proves external exposure not pattern-matching, no false negatives; Unused/Generation make 50-year Least Privilege principle data-driven; Validation shift-left risk write-time; Advisor scores account best-practices AWS-accumulated.

Five operator memory points: ① Analyzer External formally-proves Zone of Trust outside-access. ② Unused finds unused permissions/roles/keys CloudTrail-based, reinforce least-privilege. ③ Generation reverse-engineers policy CloudTrail 90d, watch rare-job omission. ④ Advisor five categories (Cost/Performance/Security/Fault Tolerance/Service Limits), full Business+ Support. ⑤ Artifact (AWS proof) vs Audit Manager (customer proof), Health Dashboard (AWS issues) distinct.

Next shifts from static setting checks to **real-time threats**: someone actually attacking? (GuardDuty), known vulnerabilities? (Inspector), sensitive data exposed? (Macie), integrating all findings (Security Hub).

---

## 📝 Practice Problems

**Problem 1.** Prove "no outside-exposed S3 buckets." Why IAM Access Analyzer better than pattern-scanner?

A) More danger patterns
B) Formal-logic policy conversion + SMT solver proves "no outside-access input exists," zero false negatives
C) Try all requests real-time
D) AWS staff manual review

**Answer: B**

---

**Problem 2.** Multi-account Organization intentional sibling sharing. Prevent in findings?

A) Manual bucket policy exceptions
B) Zone of Trust Organization-level — inside-organization normal, outside-organization findings
C) Disable Analyzer, use Trusted Advisor
D) Replace with GuardDuty

**Answer: B**

---

**Problem 3.** New IAM role `*` permissions, operating. Auto-shrink to actual minimal?

A) Manually track API calls, write policy
B) Policy Generation — CloudTrail 90d activity extracts actual APIs/Resources/Conditions, reverse-engineers minimal policy JSON
C) Inspector scan
D) Trusted Advisor Security

**Answer: B**

---

(Continue through Problem 7 similarly...)

---
