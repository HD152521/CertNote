# Day 3 - IAM Access Analyzer and Trusted Advisor: How to Prove Permissions with Code

The hardest question in permission management is not "who can do what" but "who can do **what they should not**." Reading IAM policies line by line and judging by eye whether something is exposed externally is practically impossible. When S3 bucket policies, KMS key policies, and IAM role trust policies get entangled, even the simple question "is this bucket open to an external account" cannot be answered reliably by human eyes. This is because the number of policy combinations explodes.

The essence of IAM Access Analyzer is an engine that **mathematically proves** this question. Instead of running the policy and observing the result (you cannot try every case that way), it converts the policy itself into a logical formula and solves "does an input exist that allows external access" with formal logic. This article follows why this is "proof" and not "detection," how a technique called automated reasoning decides an infinite number of cases in finite time, and how Trusted Advisor automatically checks best practices - why these tools are more than simple scanners.

## Not "Detection" but "Proof" - Why Access Analyzer Uses Formal Logic

Most security scanners work by pattern matching. They keep a list of rules saying "policies shaped like this are dangerous," and warn when a policy fits the pattern. The problem is that the policy language (IAM) is so expressive that you cannot enumerate every dangerous pattern. When combinations of `Condition` clauses, wildcards, and negation operators such as `NotPrincipal` and `NotAction` get entangled, countless policies that are "safe on the surface but actually open externally" can be created. A pattern list cannot catch all such workarounds.

Access Analyzer takes a fundamentally different approach. **Automated Reasoning** - it converts the policy into a formal logic proposition and solves the question "does an input exist that lets a principal outside the Zone of Trust access this resource?" with an **SMT (Satisfiability Modulo Theories) solver**. If the solver finds a solution saying "such an input exists," that is a finding, and if it proves "none exists," it asserts that the resource is safe. This is not trying things out but **mathematically deciding all possible cases at once**.

The difference is decisive. Pattern matching can only say "it did not match any dangerous pattern I know" - there may be workarounds I do not know. Formal proof asserts "an input that allows external access logically does not exist" - in principle there are no false negatives. AWS implemented this technology as an engine called Zelkova, developed by its in-house Automated Reasoning Group, and Access Analyzer, S3 Block Public Access, and some IAM validation all run on top of this engine.

An SMT solver extends the SAT (boolean satisfiability) problem with rich theories such as integers, strings, and sets. SAT is an NP-complete problem that asks "is there a variable assignment that makes this logical formula true," and since the DPLL algorithm of 1962, practical solvers (Z3, CVC, and others) have developed to the point of solving problems with millions of variables in seconds. Using SMT for IAM policy analysis means reducing "among the (Principal, Action, Resource, Condition) combinations that satisfy this policy, does one exist outside the Zone of Trust" to a satisfiability problem. The same technology is used for hardware verification (proving that a CPU circuit satisfies its specification) and program verification - Access Analyzer is a case of applying theorem proving to cloud permissions.

The Zelkova engine can also compare two IAM policies and decide "does policy A allow more access than policy B (A ⊇ B)." This is the basis of Policy Validation's check of "does this change broaden permissions," and the principle by which S3 Block Public Access instantly decides "does this bucket policy allow public access." The key is to express the allowed sets of the two policies as logical formulas and prove the containment relationship - it decides set containment in one go without substituting infinitely many requests one by one. For this reason Access Analyzer has no separate "scan cycle" and re-evaluates in near real time when a policy changes.

## Zone of Trust - How "External" Is Defined

Access Analyzer's External Access analysis reports only "access from outside the Zone of Trust" as findings. Access within the same account is considered normal and ignored. But what exactly is "external"? How you draw this boundary determines the meaning of the analysis.

When you create an Analyzer, you set the Zone of Trust at the **account level** or **Organization level**. An account-level Analyzer treats every principal outside that account as "external" - other AWS accounts, other Organizations, and anonymous access (`Principal: *`) are all finding targets. Sibling accounts within the same Organization are also caught as external. An Organization-level Analyzer takes the entire Organization as the trust boundary, treating access between accounts within the organization as normal and reporting only access outside the organization as findings.

This distinction matters because **the scope of "normal sharing" differs by governance model**. In a multi-account organization, S3 sharing between sibling accounts is often intended, normal behavior - viewed through an account-level Analyzer, a flood of normal sharing pours out as findings and becomes noise. If you set it at the Organization level, sharing within the organization passes quietly and only the real risk of "leaking outside the organization" remains. Conversely, if the goal is strict isolation of a single account, the account level is right. The Zone of Trust is a policy decision that defines "what to treat as normal," not a technical detail.

The analysis targets are resources where external exposure leads directly to data leakage - S3 buckets, IAM roles (trust policies), KMS keys, Lambda (resource policies), SQS queues, Secrets Manager secrets, EBS/RDS snapshots, ECR repositories, EFS, and so on. What they have in common is that they are all **resources whose resource-based policy can open external access**.

> ⚠️ **Pitfall**: Access Analyzer looks only at access **outside** the Zone of Trust. Excessive permissions inside an account (for example, one department accessing another department's data) are not caught by External Access analysis. Unused and excessive internal permissions are handled by a separate **Unused Access Analyzer**. On the exam, "detecting external exposure" is External, and "finding unused permissions and roles" is Unused. Also, Access Analyzer must be created per Region (it is not global), and multi-Region governance requires placing an Analyzer in each Region or consolidating with Security Hub.

## Unused Access - How to Fight the Entropy of Permissions

Permissions inevitably grow over time. You add permissions for a new feature, but even when the feature disappears, the permissions remain. Few people narrow a temporarily widened permission back down. As a result, the permissions of IAM roles and users increase monotonically, and they end up holding far more permissions than they actually use. This is called **permission creep** or the entropy of permissions - left alone, disorder grows.

Unused Access Analyzer measures this entropy. It analyzes CloudTrail activity records to find what was not actually used during a specified period (for example, 90 days) - IAM users with no activity, roles unused for over 90 days, API permissions that were granted but never called, and unused access keys. This list is the candidate set of "permissions that are safe to reduce."

Why is this important for security? Here lies the reason that practicing the **Principle of Least Privilege** was practically impossible. Everyone knows least privilege is right, but there was no way for a person to know "what is actually the minimum." People are afraid narrowing permissions might break working functionality, so no one touches them. Unused Access Analyzer provides the grounds "this was not used for 90 days, so it can be removed" from actual usage data, letting you reduce permissions based on data instead of guesswork.

The principle of least privilege is one of the eight security design principles established in Saltzer and Schroeder's classic 1975 paper "The Protection of Information in Computer Systems." "Every program and every user of the system should operate using the least set of privileges necessary to complete the job." The reason is simple - the fewer the permissions, the smaller the damage (blast radius) when that principal is compromised, and the lower the chance of accidents. The reason this 50-year-old principle has become newly difficult in the cloud is that the kinds and amount of permissions have exploded. Unused Access Analyzer + Policy Generation are tools that made this old principle practicable again through automation.

## Policy Generation - Automating "Broad First, Narrow Later"

When creating a new application or role, knowing in advance exactly which permissions are needed is nearly impossible. So real-world operation becomes "open it broadly with `*` and run it, and narrow it later once it works." The problem is that this "later" never comes. Narrowing is risky (narrow it wrongly and functionality breaks) and tedious, so the `*` permission stays in production as is.

Policy Generation automates this "narrow it later." When you specify a role, Access Analyzer scans **the last 90 days of CloudTrail activity**, picks out only the APIs that role actually called, and generates a least-privilege policy JSON. It analyzes not only the Actions but also which Resource ARNs were accessed under which Conditions to produce a specific policy. The operator reviews the generated policy and replaces the existing `*` policy.

What makes this flow elegant is that it **reverses the order of theory and reality**. The traditional approach is "design the needed permissions in advance → write the policy → deploy," but in reality the needed permissions cannot be known in advance, so it fails. Policy Generation automates the order that fits reality: "deploy broadly first → observe actual use → back-compute the policy from the usage data." Instead of designing by guesswork, it derives the policy from observed behavior.

For Policy Generation to be accurate, CloudTrail must have been on long enough (ideally 90 days), and **all normal paths of that role must have been executed** during the analysis period. If a batch job that runs only at quarter end did not run during the analysis period, that permission is missing from the generated policy, and after replacing the policy that batch breaks at quarter end. So do not apply a policy created with Policy Generation immediately - first cross-check it against IAM Access Advisor (service last accessed information), or set the analysis period long enough (so that rarely run jobs are included). Automatic generation is a starting point, not a final answer to trust as is.

A classic incident caused by permission creep is the 2019 Capital One data breach. An excessive S3 permission granted to a WAF role combined with an SSRF (Server-Side Request Forgery) attack, and the attacker used that role's temporary credentials to read S3 buckets holding about 106 million customers' information. One of the key lessons is that "that role did not need such broad S3 permissions" - with least privilege, far less data would have been readable through the compromised role. Policy Generation and Unused Access Analyzer are tools for finding and reducing exactly this kind of "broad permissions held without being used."

## Policy Validation - 100 Checks That Block at Authoring Time

Access Analyzer does not only detect after the fact; it also intervenes at policy **authoring time**. Policy Validation runs more than 100 checks in real time when you write or edit an IAM policy, raising security warnings, syntax errors, and improvement suggestions. It is automatically attached to the IAM console's policy editor, giving instant feedback such as "the wildcard in this policy is too broad" and "this Action does not apply to this Resource type."

The reason this is more valuable than after-the-fact detection is **shift left** - the earlier in the lifecycle you catch a problem, the cheaper it is to fix. It is far cheaper and safer to block "this is dangerous" at the moment of writing than to catch a dangerous policy as a finding after it has been deployed to production.

Custom Policy Checks (paid) go one step further, enforcing the company's own guardrails as code. You put rules such as "no policy may allow `s3:DeleteBucket`" and "this change must not broaden permissions compared with before" into the CI/CD pipeline, so that if a policy change PR violates a guardrail, the merge is blocked. This leverages the Zelkova policy comparison (A ⊇ B decision) ability seen above, formally proving "does this PR expand permissions" to block it.

Shift left comes from the rule of thumb in software quality engineering that "the later a defect is found, the more its fix cost rises exponentially" (Boehm's cost curve). It is a classic estimate that if the cost of fixing a design-stage defect is 1, the coding stage is ~6x, the testing stage ~15x, and production ~100x. Policy Validation (authoring time) and Custom Policy Checks (CI/CD) catch security defects at the far left (authoring and merge time), avoiding the expensive path of discovering them as findings in production and responding to an incident. It is a concrete implementation of the "put security in the pipeline (DevSecOps)" movement.

## Trusted Advisor - A System That Automatically Grades Best Practices

If Access Analyzer is formal verification of permissions, Trusted Advisor is an automatic best practice grader for the account as a whole. It turns the best practices AWS has accumulated from the operations of countless customers into rules, scans the account, and reports violations in five categories - Cost Optimization, Performance, Security, Fault Tolerance, Service Limits.

| Category | Check examples | Operational meaning |
|----------|-----------|-----------|
| Cost Optimization | Unused EBS volumes, idle EC2, unused RIs | Eliminate waste |
| Performance | Overloaded EBS, over-provisioned EC2, CloudFront not used | Find bottlenecks |
| Security | Root without MFA, public S3, 0.0.0.0/0 SG, exposed access keys | Risk exposure |
| Fault Tolerance | No Multi-AZ, RDS backups disabled, single-AZ ASG | Availability weaknesses |
| Service Limits | Reaching 80% of a limit | Advance warning before exceeding a limit |

The Service Limits check is especially useful operationally. Many AWS resources have per-account, per-Region limits (number of EC2 instances, number of EIPs, number of VPCs, and so on), and when you hit a limit, creating new resources fails - a classic incident is that a traffic surge makes Auto Scaling try to launch more instances but it is blocked by the limit and scaling stops. Trusted Advisor warns in advance when 80% of a limit is reached, so that you can submit a limit increase request before an incident.

The key constraint is that **the scope of access differs by Support plan**. The Basic/Developer plans can see only 7 core security checks and service limits, and the full set of 100+ checks opens only on the Business ($100/month) or Enterprise plan. On the exam, the answer to "to use the full Trusted Advisor checks?" is always "Business or higher Support."

Trusted Advisor goes beyond a tool you look at in the console, offering an API (`describe-trusted-advisor-checks`, `describe-trusted-advisor-check-result`) and EventBridge integration. When a check result changes (for example, when a new public S3 bucket appears), it publishes an EventBridge event that can trigger an SNS notification or a Lambda automatic response. You can also recheck immediately with `refresh-trusted-advisor-check`. However, Trusted Advisor only gives "recommendations" and does not fix things automatically - automatic remediation is implemented with AWS Config remediation actions or a separate Lambda. Trusted Advisor is a diagnostic tool that tells you "what is wrong," not a treatment tool.

## Access Analyzer vs Trusted Advisor vs Config - The Division of Labor Among the Three That Look Overlapping

All three tools look overlapping in that they "find misconfigurations," so they are often confused on the exam. The division of labor is clear. **Access Analyzer formally proves the external exposure of permissions**, **Trusted Advisor checks a broad range of best practices**, and **Config tracks changes to resource configuration and evaluates rules**.

Access Analyzer is a specialized tool that mathematically answers the permission question "is this resource open externally." It is narrow and deep. Trusted Advisor is a broad health checkup that covers cost, performance, security, availability, and limits - shallow in depth but wide in breadth. Config tracks and evaluates "what was this resource's configuration at time T" and "does the configuration follow rules (for example, all EBS must be encrypted)," and manages change history and compliance state (Security Hub in the next article consolidates these).

| Question | Suitable tool |
|------|-------------|
| Is this S3 bucket exposed to an external account | Access Analyzer (External) |
| Which IAM permissions and roles are unused | Access Analyzer (Unused) |
| Is this policy safe (at authoring time) | Access Analyzer (Validation) |
| Best practice violations such as root without MFA or public S3 | Trusted Advisor (Security) |
| Has the EC2 instance limit reached 80% | Trusted Advisor (Service Limits) |
| Are all EBS volumes encrypted, tracking rule violations | AWS Config |
| When and how did this resource's configuration change | AWS Config |

In addition, the **AWS Health Dashboard** is of a completely different nature - while the three above look at "customer configuration problems," the Health Dashboard notifies customers of "AWS-side issues" (scheduled instance retirement, EBS performance degradation, service deprecation). And **AWS Artifact** is not a checking tool but a window to download AWS's compliance reports (SOC, PCI, ISO, and so on) for free - you use it to submit evidence to an auditor that "the AWS infrastructure complies with this standard."

> ⚠️ **Pitfall**: In scenarios saying "compliance reports are needed," it is easy to confuse AWS Artifact with Audit Manager. AWS Artifact is where you get the reports such as SOC/PCI that **AWS complies with** (evidence of AWS's area of responsibility), and Audit Manager is a tool that collects evidence that **the customer's own** environment complies with a standard and builds an audit report (evidence of the customer's area of responsibility). In the shared responsibility model, Artifact proves "the AWS side," and Audit Manager proves "the customer side."

## Wrap-Up

The tools in this article all automate "questions that human eyes cannot answer reliably." Access Analyzer decides the external exposure of permissions with formal proof (automated reasoning) rather than pattern matching, eliminating false negatives in principle; Unused Access and Policy Generation make the 50-year-old principle of least privilege practicable with actual usage data; Policy Validation blocks risk at authoring time through shift left; and Trusted Advisor grades the whole account with AWS's accumulated best practices.

The five things for an operator to remember are these. ① Access Analyzer External detects only access outside the Zone of Trust (account or Organization), by formal proof. ② Unused Access Analyzer finds unused permissions, roles, and keys based on CloudTrail to strengthen least privilege. ③ Policy Generation back-computes a least-privilege policy from 90 days of CloudTrail activity, but watch for omission of rarely run jobs. ④ The 5 Trusted Advisor categories (Cost/Performance/Security/Fault Tolerance/Service Limits), with the full set requiring Business+ Support. ⑤ Distinguish Artifact (evidence of AWS compliance) vs Audit Manager (evidence of customer compliance), and Health Dashboard (AWS-side issues).

In the next article we move beyond static configuration checks to **real-time threats**. We look at four tools that detect whether someone is actually attacking (GuardDuty), whether the system has known vulnerabilities (Inspector), and whether sensitive information is exposed in data (Macie), and that consolidate all these findings in one place (Security Hub).

---

## 📝 Practice Questions

**Question 1.** The security team demands "prove that none of our S3 buckets is exposed to an external account." What is the fundamental reason IAM Access Analyzer is better than a pattern-based scanner?

A) It has a longer list of risk patterns
B) It converts policies to formal logic and uses an SMT solver to prove that "no input allowing external access exists," so in principle there are no false negatives
C) It tries every request in real time
D) AWS staff review manually

**Answer: B**

Explanation: A pattern matching scanner can only say "it did not match any dangerous pattern I know," so it can miss unknown workarounds (Condition combinations, NotPrincipal, and so on). Access Analyzer uses Automated Reasoning to convert the policy into a logical proposition and solves "does an input exist that lets a principal outside the Zone of Trust access it" with an SMT solver. If it proves none exists, it can assert safety, so in principle there are no false negatives. AWS's Zelkova engine implements this, and the same technology is used for hardware and program verification. Trying every request as in C is impossible because the number of cases is infinite.

---

**Question 2.** In a multi-account Organization, S3 sharing between sibling accounts is intended, normal behavior. To avoid seeing this normal sharing as noise in External Access findings?

A) Manually handle each bucket policy as an exception
B) Set the Analyzer's Zone of Trust at the Organization level - access within the organization is treated as normal and only access outside the organization is reported as findings
C) Turn off Access Analyzer and use only Trusted Advisor
D) Replace with GuardDuty

**Answer: B**

Explanation: The Zone of Trust is the trust boundary that defines "what to treat as normal." If set at the account level, sibling accounts of the same organization are also caught as external, and normal sharing floods out as findings. If set at the Organization level, access between accounts within the organization passes as normal and only the real risk leaking outside the organization remains. You must choose the Zone of Trust according to the governance model (single-account isolation vs organization-wide sharing), which is a policy decision, not a technical detail.

---

**Question 3.** You are running a new IAM role with `*` permission. To automatically shrink it to a least-privilege policy matching its actual usage pattern?

A) Manually trace all API calls and write the policy
B) Access Analyzer Policy Generation - picks out only the APIs, Resources, and Conditions actually called in the last 90 days of CloudTrail activity and back-computes a least-privilege policy JSON
C) Scan with Inspector
D) Trusted Advisor Security checks

**Answer: B**

Explanation: Policy Generation automates the realistic order "deploy broadly first → observe actual use → back-compute the policy from usage data." It scans 90 days of CloudTrail activity and generates a policy that includes only the APIs that role actually called. However, CloudTrail must have been on long enough and all normal paths (quarter-end batches, etc.) must have run during the analysis period for it to be accurate - if rarely run jobs are missing, things can break after the policy is replaced, so the auto-generated result is a starting point, not a final answer to trust as is.

---

**Question 4.** A company wants to enforce in CI/CD the guardrail "no IAM policy change may broaden permissions compared with before." Which feature is suitable?

A) Trusted Advisor
B) Access Analyzer Custom Policy Checks - uses Zelkova's policy comparison (A ⊇ B) ability to formally prove whether a change expands permissions and blocks the merge
C) GuardDuty
D) Config Rule

**Answer: B**

Explanation: Custom Policy Checks put the company's own guardrails (forbidding specific Actions, forbidding permission expansion, and so on) into CI/CD, blocking the merge if a policy change PR violates them. "Does this change broaden permissions" is formally proving the containment relationship (A ⊇ B) of the allowed sets of two policies, which the Zelkova engine decides. In line with the shift left principle, it blocks at merge time instead of the expensive path of discovering a finding in production.

---

**Question 5.** What is needed to access the full 100+ checks of Trusted Advisor?

A) The free Basic plan is enough
B) A Business or Enterprise Support plan (Basic/Developer get only 7 core security checks + service limits)
C) Sign up for the Free Tier
D) Enable GuardDuty

**Answer: B**

Explanation: The scope of Trusted Advisor access differs by Support plan. The Basic/Developer plans can see only 7 core security checks and service limits, and the full set of 100+ checks, including Cost Optimization, Performance, and Fault Tolerance, opens only on Business ($100/month) or higher. On the exam, the answer to "to use the full checks?" is always Business or higher Support.

---

**Question 6.** You want to know in advance the risk that Auto Scaling will be blocked during a traffic surge because you have reached 80% of the EC2 instance limit. Which tool and category?

A) Trusted Advisor - the Service Limits category warns when 80% of a limit is reached
B) GuardDuty
C) Access Analyzer
D) Macie

**Answer: A**

Explanation: Trusted Advisor's Service Limits category warns in advance when 80% of per-account, per-Region limits such as the number of EC2 instances, EIPs, and VPCs is reached. When you hit a limit, creating new resources fails, and a classic incident is Auto Scaling trying to launch more instances during a traffic surge but being blocked. With the advance warning, you can submit a limit increase request before an incident. With EventBridge integration, automatic notification when a check result changes is also possible.

---

**Question 7.** An external auditor demands evidence that "the AWS infrastructure complies with SOC 2." Separately, you must also gather evidence and build a report that our company's own environment complies with PCI-DSS. Which tool is for each?

A) Both are Trusted Advisor
B) Evidence of AWS infrastructure compliance is AWS Artifact (free download), and collecting and reporting evidence of customer environment compliance is Audit Manager
C) Both are Access Analyzer
D) Both are AWS Artifact

**Answer: B**

Explanation: In the shared responsibility model, AWS Artifact is the window to get, for free, the reports such as SOC/PCI/ISO that **AWS complies with** (evidence of AWS's area of responsibility), and Audit Manager is a tool that automatically collects evidence that **the customer's own** environment complies with a standard and builds an audit report (evidence of the customer's area of responsibility). Artifact proves "the AWS side," and Audit Manager proves "the customer side." The two deal with different responsibility boundaries, so you must distinguish them precisely depending on the scenario.

---
