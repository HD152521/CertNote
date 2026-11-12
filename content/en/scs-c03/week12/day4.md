# Day 4 - Full Practice Exam Pace: Six-Domain Synthesis Scenario Review

Today is not about learning; it is *real-exam pace training*. The actual SCS-C03 has 65 questions in 170 minutes — about 2.6 minutes per question. We build the muscle for quickly *decomposing* long, compound scenarios. After a short review, we work through comprehensive questions that cut across all six domains, centered on solving them. The weight of the questions is the heart of today.

## Time Allocation: Engrave the Numbers into Your Body

You must not do arithmetic during the exam. Memorize the checkpoints in advance, and each time you pass one, check *only whether you are ahead or behind*.

| Point | Target elapsed time | Time that should remain | Judgment |
|---|---|---|---|
| Question 13 (1/5) | About 34 min | About 136 min | If you are already behind here, change how you read the stem |
| Question 22 (1/3) | About 57 min | About 113 min | Normal |
| Question 33 (halfway) | About 85 min | About 85 min | ★ The most important checkpoint |
| Question 44 (2/3) | About 113 min | About 57 min | If you are ahead here, the second pass will be comfortable |
| Question 55 | About 143 min | About 27 min | |
| Question 65 (end of first pass) | Aim for within 150 min | **20 min or more** | Spend all the remaining time on flagged questions |

The core design is this — **finish the first pass within 150 minutes and leave 20 minutes for flagged questions.** The average is 2.6 minutes per question, but in reality *questions that finish in 1 minute* and *questions that need 4 minutes* are mixed together. Spending the time you earn on short questions on the long ones is the whole of pacing.

| Question type | Felt time | How to handle it |
|---|---|---|
| Single-concept matching ("which service does this feature belong to") | 30–60 sec | Answer instantly. Don't deliberate |
| Trap-check ("which of the following is NOT true") | 1–1.5 min | Judge each option true or false one by one |
| Short scenario + single answer | 1.5–2 min | Required verb → 2 candidates → choose |
| Long multi-domain scenario | 3–4 min | Follow the decomposition procedure exactly |
| Multiple answers (choose 2 or more) | 3–4 min | **There is no partial credit** — if unsure, flag it and carry it over |
| Ordering ("what should be done first") | 2–3 min | Decide immediately on the reversibility and evidence-preservation axes |

The exam has 65 questions, but **some unscored questions are mixed in** (as is common across AWS exams, used to pre-validate future items). The implication for the real exam is just one — *spending time on one or two unusually unfamiliar, hard questions has a low expected value.* That question may not be scored at all, and even if it is, a single question is worth less than 2% of the total. The saying that **"overall pace, not the perfection of a single question, makes your score"** is not emotional comfort; it is arithmetic.

### The 3-Bucket Strategy

On the first pass, put every question into one of three buckets. Making this classification *immediately* is the key.

```
Read the question (last sentence → body → options)
   │
   ├─[A] Confident ───────► Answer and move on. Don't look back.
   │                          (60–70% of the first pass should be here, normally)
   │
   ├─[B] Narrowed to 2 but can't choose ─► **Mark a tentative answer** and flag → 2nd pass
   │                          (Don't leave it blank — you may run out of time)
   │
   └─[C] No idea at all ───► Eliminate only the obviously wrong ones, guess, then flag → 3rd pass (if time remains)
                              Spending more than 2 minutes here is a loss
```

You only need to keep two rules. **① Fill in an answer no matter which bucket** (there is no penalty for wrong answers). **② Rather than spend 4 minutes on [C], it is better to solve four [A] questions more accurately.**

On the second pass, look only at [B]. One habit pays off a lot here — **don't try to remember your first-pass judgment; re-read starting from the requirement sentence.** The cause of most [B] cases is not a lack of knowledge but *misreading the requirement*, and re-reading sometimes resolves it. Conversely, if you get stuck at the same spot even after re-reading, that is a gap in knowledge, so split it with the preference hierarchy and get out immediately.

> ⚠️ **Trap**: **Changing an answer without grounds** on the second pass is the most common way to lose points. There are only three cases where changing is acceptable — ① you discovered a constraint you missed on the first pass ("multi-account," "existing," "no internet"), ② you found a factual error in an option's statement, ③ another question reminded you of the basis for the correct answer. *"Somehow that one seems better"* is not grounds.

## Pace Strategy: Six Steps to Decompose a Scenario

Extract the skeleton of a long stem within 1 minute in this order.

1. **Read the last sentence first** — what is actually being asked is there. Reading the body afterward filters out the noise.
2. **Find the key verb of the requirement** — "automatically (automation)", "without managing servers (serverless)", "least privilege", "cannot be deleted (immutable)", "centrally", "private", "prevent", "detect", "investigate". The verb determines the pattern of the answer.
3. **Mark the constraints** — "multi-account", "no internet", "regulatory", "cost-effective", "existing application (existing software can't be replaced)", "minimal operational overhead", "no downtime". These are filters for discarding wrong answers.
4. **Check the qualifier** — if MOST / LEAST / BEST is attached, the question asks about *degree*, not *whether it works* (see the table below).
5. **Eliminate the 2 obviously wrong options** — options that directly violate the requirement (hardcoded keys, making things public, manual procedures, extreme statements) are out immediately.
6. **Choose the "best" of the remaining 2** — the one that is more automated, more managed, more least-privilege, more impossible to bypass.

Specialty questions usually distinguish not the "wrong answer" but the "less good answer." Even when both options work, AWS prefers *managed > self-managed*, *automated > manual*, *defense in depth > a single control*, and *prevent > detect > respond*. This is not taste; it is the result of the principles of the Well-Architected security pillar (least privilege, layered defense, traceability, automated security, protecting data in transit and at rest) being reflected in the answers. In the final two-way choice, recall this preference hierarchy.

### How to Interpret Qualifiers

A single word at the end of the question moves the correct answer to the opposite side. Memorize this table and it translates directly into points.

| Qualifier | What it asks | Direction the answer leans | Typical answer candidates |
|---|---|---|---|
| **MOST cost-effective** | Cost, among several working answers | Free, built-in, fewer calls | Gateway Endpoint (free), Parameter Store, S3 Bucket Keys, SSE-S3 |
| **LEAST operational overhead** | Operational burden | **Managed > self-built**, automated > manual | Secrets Manager rotation, managed rules, Control Tower, Config auto-remediation |
| **MOST secure** | Strength of security | Narrower permissions, stronger immutability, less exposure | Object Lock Compliance, SSE-KMS (+ key policy), least-privilege roles, PrivateLink |
| **MOST resilient / highly available** | Availability | Multi-AZ, managed | Managed services, multi-AZ configurations |
| **FASTEST to implement** | Speed of build | Combinations of existing managed offerings | Control Tower, managed rule sets, Conformance Pack |
| **MINIMAL disruption / no downtime** | Impact on existing operations | Non-invasive, parallel introduction | Detect first → phased enforcement, WAF in count mode, warn then enforce |
| **without changing the application** | Code cannot be modified | Solve at the infrastructure/platform layer | Handle at the ALB/CloudFront layer, sidecars/agents, endpoint policies |
| **cannot be modified or deleted** | Immutability | WORM | Object Lock Compliance, Vault Lock, log file validation |
| **immediately / in real time** | Immediacy | Event-driven | EventBridge, CloudWatch metric filter alarms |
| **automatically / without manual intervention** | Automation | Event-driven remediation | EventBridge → Lambda / SSM Automation, Config auto-remediation |
| **prevent** | Prevention | Make the action itself impossible | SCP Deny, proactive controls, resource policy Deny |
| **detect** | Detection | After-the-fact discovery | Config rules, GuardDuty, Access Analyzer |
| **all accounts / future accounts** | Organization scale | Organization tools | SCP/RCP, Control Tower, Firewall Manager, Conformance Pack, auto-enable |

When two or more qualifiers are attached (for example, "MOST cost-effective way to privately access S3"), **the constraint attached later is often the stronger filter.** In the case above, "private" narrows the candidates to endpoints, and "cost-effective" picks the Gateway endpoint among them.

> ⚠️ **Trap**: A typical way to lose points is to *ignore the qualifier* and choose "the answer that looks safest." On a question with `MOST cost-effective`, choosing an Interface Endpoint (paid) or CloudHSM (high cost) is wrong even if that option is stronger from a security standpoint. Conversely, when `MOST secure` is attached, you must not choose a weaker control on the grounds of cost. **The qualifier states the grading criterion explicitly.**

## Six Patterns by Which Wrong Answers Are Made

The speed at which you read options is as important as knowing the answer. The ways wrong answers are manufactured are narrow.

1. **Flip the order by one step.** "Terminate → snapshot," "recover → eradicate," "delete → trace." → *If a step that destroys evidence comes first, discard it.*
2. **Take only half the action.** It stops at "isolate the instance" with no credential revocation. It stops at "create the endpoint" with no policy. → *An option with containment but no tracing or eradication is usually wrong.*
3. **Demand enforcement with a tool that cannot enforce.** "Block with a detection tool," "restrict root with an IAM policy," "prevent untagged creation with a Tag Policy." → *If the required verb is block, pick a preventive control (SCP, policy Deny).*
4. **Get the scope wrong.** "A person checks each account in the console," "one rule in one Region protects everything." → *For multi-account or multi-Region, use organization tools and aggregation.*
5. **Present an extreme.** "Automate everything," "do everything manually," "turn off detection," "revoke all permissions." → *Extreme statements are usually wrong.* The correct answer is usually the form that **divides the boundary** (automatic if reversible, approval if irreversible).
6. **"AWS takes care of it."** "Support handles it," "the default settings are enough." → Under the shared responsibility model, *credentials, configuration, and data are the customer's domain*, so this form is wrong.

## Question Map by Domain

If you know which domain a question belongs to, the candidate services narrow immediately. This table ties together weights, typical forms, and candidate answers on one page.

| Domain | Weight | Typical question form | Candidate services / patterns |
|---|---|---|---|
| **1. Detection** | ~16% | "This evidence isn't visible" / "tamper-proof central storage" / "immediate alert" / "to discover this" | CloudTrail (management, data, Insights), Config, Flow Logs, GuardDuty, Security Hub, Athena/Lake, metric filter alarms |
| **2. Incident Response** | ~14% | "We detected it, what first?" / "to investigate scope and impact" / "to isolate automatically" | Detective, EventBridge→Lambda/SSM, isolation SG, snapshots, `aws:TokenIssueTime` Deny |
| **3. Infrastructure Security** | ~18% | "Only this traffic passes" / "without the internet" / "defend against compound threats" | SG/NACL, Gateway and Interface Endpoints, WAF, Shield Advanced, Network Firewall, TGW, CloudFront+OAC |
| **4. Identity and Access Management** | ~20% | "Why AccessDenied?" / "delegate safely" / "where do the keys go" | Evaluation order, SCP and permissions boundaries, AssumeRole+External ID, Identity Center, instance profiles, Roles Anywhere, Cognito |
| **5. Data Protection** | ~18% | "Choose an encryption method" / "immutable retention for N years" / "solely own the key" | SSE-KMS/DSSE/SSE-C, CloudHSM and custom key store, Object Lock, `aws:SecureTransport`, ACM, Macie |
| **6. Security Foundations and Governance** | ~14% | "Enforce across the whole organization" / "audit evidence" / "automatic for new accounts" | SCP/RCP, Control Tower, Config and Conformance Pack, Audit Manager, Firewall Manager, Service Catalog |

One reading tip. When a question contains **"all accounts," "the entire organization," "created in the future," or "new accounts,"** then whatever the domain, **a governance tool takes the answer slot.** Account-level tools (attaching individual WAFs, manually enabling per account, individual Config rules) are usually wrong in that case.

### The "Axis to Look at First" by Question Type

```
What does the last sentence of the question ask?
   │
   ├─ "What should be done first" ────► Axis: **reversibility · evidence preservation**
   │     Evidence-destroying actions go later, reversible actions go earlier,
   │     the cause of spread (credentials, logging) before the result (resources)
   │
   ├─ "Why doesn't it work" ──────────► Axis: **evaluation order · prerequisites**
   │     Explicit Deny → SCP → both sides of cross-account Allow → KMS key policy → condition keys
   │     (if networking) routing → endpoint policy → SG/NACL → ephemeral ports
   │
   ├─ "What is the most appropriate design" ─► Axis: **required verb + qualifier**
   │     Which of prevent/detect/respond → the tool of that layer
   │     Split the remaining two by the qualifier (cost/overhead/secure)
   │
   ├─ "Which service is it" ──────────► Axis: **the question it answers**
   │     Threat = GuardDuty, weakness = Inspector, data = Macie,
   │     exposure = Access Analyzer, relationships = Detective, aggregation = Security Hub
   │
   ├─ "Which is NOT true" ────────────► Axis: **check against the trap list**
   │     ACM us-east-1 / data events / NACL ephemeral ports /
   │     SCP doesn't grant / KMS waiting period / Gateway Endpoint is S3·DDB only
   │
   └─ "Across the whole organization" ─► Axis: **prevent > detect > respond**
         SCP (prevent) · Config (detect) · auto-remediation (respond) · Firewall Manager (enforced rollout)
```

## Calibrating Your Sense with Cross-Domain Cases

Real questions cut across domains. The three cases below show the form of the stem and the decomposition process as they are (we point only to the answer candidates; the detailed solutions are covered in the practice below).

> 🎯 **Case 1 (crossing Domains 1, 5, and 6)**: *"A regulator requested administrator activity in all accounts over the past three years. The company has kept logs in S3, but there are signs that an administrator in one account deleted their own trail six months ago."* → Decomposed, there are three axes. ① **Proof axis** — evidence for a past period cannot be generated retroactively, so what can be done now is to establish *the interval whose integrity is guaranteed* from the organization trail that remains and the log file validation digests. ② **Cause axis** — the very fact that a member-account administrator could delete the trail is a design flaw. An organization trail cannot be deleted by members because they are not its owner. ③ **Recurrence-prevention axis** — an SCP denying `StopLogging` and `DeleteTrail`, separating out the Log Archive account, Object Lock. The wrong options in this case are usually "turn logging on from now" (cannot prove the past) or "extend the CloudWatch Logs retention" (not the cause).

> 🎯 **Case 2 (crossing Domains 2, 3, and 4)**: *"An application in a private subnet was compromised, and GuardDuty caught signs that the instance role's credentials were used from an external IP. The application cannot be replaced."* → "Cannot be replaced" is the decisive constraint. Every answer that requires code changes (changing the SDK, changing how credentials are injected) is eliminated, leaving only **infrastructure-layer solutions**. ① Containment is an isolation SG + **profile separation + an `aws:TokenIssueTime` Deny** (network isolation alone cannot stop a token being used from outside). ② Prevention of recurrence is **enforcing IMDSv2 + hop limit**, reducing role permissions, and an `aws:SourceVpce` condition. ③ Investigation is exhaustive tracing in CloudTrail using that session ARN as the axis. This is the classic case where three domains each take one layer of a single incident.

> 🎯 **Case 3 (crossing Domains 3 and 6)**: *"Internet-facing ALBs keep multiplying across 200 accounts. A standard WAF rule must be applied to every ALB, automatically applied to those created in the future as well, and existing services must not be interrupted."* → There are three clues. "All accounts" and "created in the future" → **Firewall Manager** (attaching manually per account is wrong). "Must not be interrupted" → deploy in **count mode** at first to observe false positives, then switch to block. And the fact that Firewall Manager **requires Config** and only reports when `RemediationEnabled` is off is used as a trap in the options.

## Self-Diagnosis: Wrong Type → Where to Go Back

The purpose of a mock exam is not the score but knowing *which axis is empty*.

| If you missed it like this | What is missing | Where to go back |
|---|---|---|
| You were fooled by an option that swapped in a different service name | The "question it answers" for each service | Day 1's six-way detection comparison table |
| You couldn't solve "why AccessDenied" | Evaluation order and condition keys | Day 2's six layers + diagnosis order |
| You split on choosing an encryption method | The five S3 encryption methods and Object Lock modes | Day 3's comparison tables |
| You got an ordering question wrong | The reversibility and evidence-preservation axes | Day 1's "what first" decision axis |
| You answered an organization-scale requirement with an account tool | The four governance layers | Day 3's tool-matching table |
| You chose while ignoring the qualifier | Qualifier interpretation | Today's qualifier table |
| You ran out of time and couldn't see the later questions | Pace | Today's checkpoints and 3 buckets |

The most wasted time in a mock exam is *reading the explanations of questions you got right*. Conversely, the most valuable time is spent reviewing **"questions you put in the [B] bucket but ended up getting right."** Those questions are points where you have the knowledge but *the judgment path is not yet automated*, they are candidates to eat time in the exam room, and they are the questions you will miss on a day when you are in poor condition. Grading that counts only right and wrong makes this layer invisible. That is why you leave [A]/[B]/[C] marks when doing a mock — the score tells you the result, but the bucket distribution tells you *what to fix next*.

## Quick Keyword → Domain Mapping (Warm-Up)

| Stem keyword | Area it points to |
|-------------|---------------|
| "Suspected data exfiltration / communication with a malicious IP" | GuardDuty (detection) → Detective (investigation) |
| "Whether there is PII in S3" | Macie |
| "Serverless automatic remediation" | EventBridge → Lambda |
| "S3 without going over the internet" | VPC Gateway Endpoint |
| "We solely own the key" | CloudHSM / custom key store |
| "Enforce across the whole organization" | SCP / Firewall Manager / Conformance Pack |
| "Cannot be deleted or tampered with" | S3 Object Lock (WORM) + MFA Delete |
| "Safe cross-account delegation to a third party" | AssumeRole + External ID |
| "Automatic rotation of DB credentials" | Secrets Manager |
| "Automatic guardrails for new accounts" | Control Tower |
| "The existing application can't be changed" | Infrastructure-layer solution (edge, endpoint, agent) |
| "Must be invalidated immediately" | Disable the key / `aws:TokenIssueTime` Deny |
| "Minimal operational burden" | Managed service + automation |
| "Prove activity up to now" | CloudTrail (+ Config history) — not retroactive |

"Issued only in us-east-1" (ACM for CloudFront), "data events must be enabled separately" (tracing S3 objects), "NACL ephemeral ports" (stateless responses), "SCPs don't grant permissions," "the KMS key policy must trust the root for IAM delegation" — these five are the distinctions that decide the final two-way choice. Adding two more blocks almost everything: **Gateway Endpoints are for S3 and DynamoDB only**, and **Object Lock Compliance cannot be deleted even by root**.

There is one fact that repeatedly shows up when certification candidates organize their wrong-answer notes — a large share of the questions missed on the real exam are not *services seen for the first time* but **services you know placed in the wrong slot.** GuardDuty in the vulnerability-scanning slot, Inspector in the breach-response slot, Config in the blocking slot, Tag Policy in the enforcement slot. The learning strategy this implies is clear. With the time left, the expected value of **redrawing the boundaries of services you already know** is far greater than *memorizing more new services*. This is why today's and tomorrow's comparison tables are filled not with new knowledge but only with boundary lines.

## Summary

Today is not a day to increase knowledge but **a day to raise the efficiency of converting knowledge into score**.

You only need to retain three things. ① **Checkpoint** — 85 minutes at question 33. Look only at whether you are ahead or behind. ② **3 buckets** — classify confident / narrowed / don't know immediately, and fill in an answer in every case. ③ **Qualifiers** — when MOST/LEAST is attached, the grading criterion is stated explicitly, so split on that axis.

And after solving a mock, look not at the score but at **the bucket distribution and the types you missed**. If [C] is large, it is a knowledge gap; if [B] is large, the judgment path is not yet automated; and if it was [A] but wrong, you misread the requirement sentence. The prescriptions for the three causes are all different — respectively *review of the relevant week*, *repeating the comparison tables*, and *correcting the order in which you read the stem*.

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
