# Day 4 - Full Mock Exam Pacing: A Cross-Domain Scenario Check Across the 6 Domains

Today is not about learning but about *real-exam pace training*. The actual SCS-C03 has 65 questions in 170 minutes, about 2.6 minutes per question. You are building the muscle to quickly *decompose* long, compound scenarios. After a short review, we work through comprehensive questions that cut across the 6 domains, centered on solving them. The weight of practice questions is the core of today.

## Time Allocation: Engrave the Numbers into Your Body

You must not do arithmetic during the exam. Memorize the checkpoints in advance, and each time you pass one, check only *whether you are ahead or behind*.

| Point | Target elapsed time | Time that should remain | Judgment |
|---|---|---|---|
| Question 13 (1/5) | About 34 min | About 136 min | If you're already behind here, change how you read passages |
| Question 22 (1/3) | About 57 min | About 113 min | Normal |
| Question 33 (halfway) | About 85 min | About 85 min | ★ The most important checkpoint |
| Question 44 (2/3) | About 113 min | About 57 min | If you're ahead here, the 2nd pass is comfortable |
| Question 55 | About 143 min | About 27 min | |
| Question 65 (end of 1st pass) | Target within about 150 min | **20 min or more** | All remaining time goes to flagged questions |

The core design is this: **finish the 1st pass within 150 minutes and leave 20 minutes for flagged questions.** The average is 2.6 minutes per question, but in reality *questions that finish within 1 minute* and *questions that need 4 minutes* are mixed together. Spending the time earned on short questions on long ones is all there is to pacing.

| Question type | Felt time | How to handle |
|---|---|---|
| Single-concept matching ("which service is this feature?") | 30-60 seconds | Answer immediately. Don't deliberate |
| Pitfall-check type ("which of the following is NOT true") | 1-1.5 min | Judge each option true/false one by one |
| Short scenario + single answer | 1.5-2 min | Required verb → 2 candidates → choose |
| Long multi-domain scenario | 3-4 min | Follow the decomposition procedure as is |
| Multiple answers (choose 2 or more) | 3-4 min | **There is no partial credit**: if unsure, flag and carry over |
| Ordering type ("what first?") | 2-3 min | Decide immediately by the reversibility and evidence-preservation axes |

The exam has 65 questions, but **some unscored questions are mixed in** (a common AWS exam practice, used to pre-validate future questions). The implication for the real exam is just one: *spending time on one or two unusually unfamiliar, difficult questions has low expected value.* That question may not even be scored, and even if it is, a single question is worth less than 2% of the total. The saying that **overall pace, not perfection on one question, makes the score** is not emotional comfort but arithmetic.

### The 3-Bucket Strategy

In the 1st pass, put every question into one of three buckets. Making this classification *immediately* is the key.

```
Read the question (last sentence → body → options)
   │
   ├─[A] Confident ───────► Answer and move on. Don't look back.
   │                          (60-70% of the 1st pass should be here)
   │
   ├─[B] Narrowed to 2 but can't pick ─► **Mark a tentative answer** and flag → 2nd pass
   │                          (Don't leave it blank: you may run out of time)
   │
   └─[C] No idea at all ───► Eliminate only the obvious wrong answers, guess, then flag → 3rd pass (if time remains)
                              Spending more than 2 minutes here is a loss
```

You only need to keep two rules. **① Always fill in an answer, whichever bucket** (there is no penalty for wrong answers). **② Rather than spend 4 minutes on [C], it is better to solve four more [A] questions more accurately.**

In the 2nd pass, look only at [B]. There is one highly effective habit here: **don't try to remember your 1st-pass judgment; re-read starting from the requirement sentence.** The cause of most [B] cases is not a lack of knowledge but *misreading the requirement*, and re-reading sometimes solves it. Conversely, if you get stuck in the same place even after re-reading, that is a knowledge gap, so split by the preference hierarchy and get out immediately.

> ⚠️ **Pitfall**: **Changing an answer without grounds** in the 2nd pass is the most common way to lose points. There are only three cases where changing is OK: ① you discover a constraint you missed in the 1st pass ("multi-account," "existing," "no internet"), ② you find a factual error in an option's wording, ③ another question reminded you of the basis for the answer. *"Somehow that one seems better"* is not grounds.

## Pacing Strategy: 6 Steps to Decompose a Scenario

For a long passage, extract the skeleton within 1 minute in the following order.

1. **Read the last sentence first**: what is actually being asked is there. Read the body afterward, so the noise gets filtered.
2. **Find the core verb of the requirement**: "automatically," "without managing servers (serverless)," "least privilege," "cannot be deleted (immutable)," "centrally," "private," "prevent," "detect," "investigate." The verb determines the answer's pattern.
3. **Mark the constraints**: "multi-account," "no internet," "regulatory," "cost-effective," "existing application (the existing software can't be replaced)," "minimal operational overhead," "no downtime." These are filters for screening out wrong answers.
4. **Check the qualifier**: if MOST / LEAST / BEST is attached, the question asks about *degree* rather than *whether it works* (table below).
5. **Eliminate 2 obvious wrong answers**: options that flatly violate the requirement (hardcoding keys, making things public, manual procedures, extreme wording) are dropped immediately.
6. **Choose the "best" of the remaining 2**: the one that is more automated, more managed, more least-privilege, more impossible to bypass.

Specialty questions usually distinguish not the "wrong answer" but the "less good answer." Even when both options work, AWS prefers *managed > self-managed*, *automated > manual*, *defense in depth > a single control*, and *prevent > detect > respond*. This is not a matter of taste but the result of the principles of the Well-Architected security pillar (least privilege, layered defense, traceability, automated security, protection of data in transit and at rest) being reflected in the answers. In a last-minute two-way choice, recall this preference hierarchy.

### How to Interpret Qualifiers

A single word at the end of the question moves the answer to the opposite side. If you memorize this table, it converts directly into points.

| Qualifier | What it asks | Direction the answer leans | Typical answer candidates |
|---|---|---|---|
| **MOST cost-effective** | Cost among several working answers | Free, included by default, fewer calls | Gateway Endpoint (free), Parameter Store, S3 Bucket Keys, SSE-S3 |
| **LEAST operational overhead** | Operational burden | **Managed > self-built**, automatic > manual | Secrets Manager rotation, managed rules, Control Tower, Config automatic remediation |
| **MOST secure** | Security strength | Narrower permissions, stronger immutability, less exposure | Object Lock Compliance, SSE-KMS (+ key policy), least-privilege roles, PrivateLink |
| **MOST resilient / highly available** | Availability | Multi-AZ, managed | Managed services, multi-AZ configurations |
| **FASTEST to implement** | Speed of setup | Combinations of existing managed offerings | Control Tower, managed rule sets, Conformance Packs |
| **MINIMAL disruption / no downtime** | Impact on existing operations | Non-invasive, parallel rollout | Detect first → enforce in stages, WAF in count mode, warn then enforce |
| **without changing the application** | Code can't be changed | Solve at the infrastructure/platform layer | ALB/CloudFront layer handling, sidecars/agents, endpoint policies |
| **cannot be modified or deleted** | Immutability | WORM | Object Lock Compliance, Vault Lock, log file validation |
| **immediately / in real time** | Immediacy | Event-driven | EventBridge, CloudWatch metric filter alarms |
| **automatically / without manual intervention** | Automation | Event-driven remediation | EventBridge → Lambda / SSM Automation, Config automatic remediation |
| **prevent** | Prevention | Make the action itself impossible | SCP Deny, proactive controls, resource policy Deny |
| **detect** | Detection | Discovery after the fact | Config rules, GuardDuty, Access Analyzer |
| **all accounts / future accounts** | Organization scale | Organization tools | SCP/RCP, Control Tower, Firewall Manager, Conformance Pack, auto-enable |

When two or more qualifiers are attached (for example, "MOST cost-effective way to privately access S3"), the **later constraint is often the stronger filter**. In the example above, "private" narrows the candidates to endpoints, and "cost-effective" picks the Gateway one among them.

> ⚠️ **Pitfall**: The typical way to lose points is, when a qualifier is present, *ignoring the qualifier* and choosing "the answer that looks safest." On a question with `MOST cost-effective`, choosing an Interface Endpoint (paid) or CloudHSM (high cost) is wrong even if that option is stronger for security. Conversely, with `MOST secure`, you must not choose a weak control on cost grounds. **The qualifier states the grading criterion explicitly.**

## Six Patterns by Which Wrong Answers Are Made

Reading speed on the options is as important as knowing the answer. The ways wrong answers are manufactured are narrow.

1. **Flip the order by one step.** "Terminate → snapshot," "recover → eradicate," "delete → trace." → *If an action that destroys evidence comes first, discard it.*
2. **Take only half the action.** It says only "isolate the instance" with no credential revocation. Only "create the endpoint" with no policy. → *An option with only containment and no tracing/eradication is usually wrong.*
3. **Demand enforcement with a non-enforcing means.** "Block with a detection tool," "restrict root with an IAM policy," "prevent untagged creation with a Tag Policy." → *If the required verb is block, choose a preventive control (SCP, policy Deny).*
4. **Get the scope wrong.** "A person checks the console account by account," "one rule in one Region protects everything." → *For multi-account/multi-Region, use organization tools and aggregation.*
5. **Present an extreme.** "Automate everything," "all manual," "turn off detection," "revoke all permissions." → *Extreme wording is usually wrong.* The answer usually takes the form of **dividing the boundary** (automatic if reversible, approval if irreversible).
6. **"AWS takes care of it."** "Support will handle it," "the default settings are enough." → *Under the shared responsibility model, credentials, configuration, and data are the customer's domain*, so this form is wrong.

## Domain Exam Map

Knowing which domain a question belongs to narrows the candidate services immediately. Here are the weight, typical forms, and answer candidates on one sheet.

| Domain | Weight | Typical question form | Answer-candidate services and patterns |
|---|---|---|---|
| **1. Detection** | ~16% | "This evidence isn't visible" / "tamper-proof central storage" / "immediate alert" / "to discover this" | CloudTrail (management, data, Insights), Config, Flow Logs, GuardDuty, Security Hub, Athena/Lake, metric filter alarms |
| **2. Incident Response** | ~14% | "You've detected it, what first?" / "to investigate scope and impact" / "to isolate automatically" | Detective, EventBridge→Lambda/SSM, isolation SG, snapshots, `aws:TokenIssueTime` Deny |
| **3. Infrastructure Security** | ~18% | "Only let this traffic through" / "without the internet" / "defend against compound threats" | SG/NACL, Gateway/Interface Endpoints, WAF, Shield Advanced, Network Firewall, TGW, CloudFront+OAC |
| **4. Identity and Access Management** | ~20% | "Why AccessDenied?" / "delegate safely" / "where to put keys" | Evaluation order, SCP and permission boundaries, AssumeRole+External ID, Identity Center, instance profiles, Roles Anywhere, Cognito |
| **5. Data Protection** | ~18% | "Choose the encryption method" / "immutable retention for N years" / "own the key exclusively" | SSE-KMS/DSSE/SSE-C, CloudHSM/custom key store, Object Lock, `aws:SecureTransport`, ACM, Macie |
| **6. Security Foundations and Governance** | ~14% | "Enforce across the organization" / "audit evidence" / "automatic for new accounts" | SCP/RCP, Control Tower, Config/Conformance Pack, Audit Manager, Firewall Manager, Service Catalog |

One reading tip. When a question contains **"all accounts," "the entire organization," "to be created in the future," or "new accounts,"** then whatever the domain, **a governance tool takes the answer slot.** Account-level tools (attaching WAF individually, manual per-account enablement, individual Config rules) are usually wrong in this case.

### The "Axis to Look at First" by Question Type

```
What does the last sentence of the question ask?
   │
   ├─ "What do you do first?" ────► Axis: **reversibility · evidence preservation**
   │     Evidence-destroying actions later, reversible actions first,
   │     the cause of spread (credentials, logging) before the effect (resources)
   │
   ├─ "Why doesn't it work?" ─────► Axis: **evaluation order · prerequisites**
   │     Explicit Deny → SCP → cross-account Allow on both sides → KMS key policy → condition keys
   │     (for networking) routing → endpoint policy → SG/NACL → ephemeral ports
   │
   ├─ "What is the most appropriate design?" ─► Axis: **required verb + qualifier**
   │     Is it prevent/detect/respond → that layer's tool
   │     Split the remaining two with a qualifier (cost/overhead/secure)
   │
   ├─ "Which service is it?" ─────► Axis: **the question it answers**
   │     Threats=GuardDuty, weaknesses=Inspector, data=Macie,
   │     exposure=Access Analyzer, relationships=Detective, aggregation=Security Hub
   │
   ├─ "Which is NOT true?" ───────► Axis: **check against the pitfall list**
   │     ACM us-east-1 / data events / NACL ephemeral ports /
   │     SCP doesn't grant / KMS waiting period / Gateway Endpoint is only S3·DDB
   │
   └─ "Across the organization" ──► Axis: **prevent > detect > respond**
         SCP (prevent) · Config (detect) · automatic remediation (respond) · Firewall Manager (enforced rollout)
```

## Calibrating Your Sense with Cross-Domain Cases

Real questions cut across domains. The three cases below show the passage form and the decomposition process as they are (we point only to the answer candidates, and the detailed solutions are covered in the practice section below).

> 🎯 **Case 1 (crossing Domains 1, 5, 6)**: *"A regulator requested all accounts' administrator activity for the past 3 years. The company has been keeping logs in S3, but there are signs that an administrator in one account deleted their own trail 6 months ago."* → Decomposed, there are three axes. ① **Proof axis**: evidence for a past period can't be generated retroactively, so what you can do now is to establish the *integrity-assured interval* using the remaining organization trail and log file validation digests. ② **Cause axis**: the fact that a member account administrator could delete the trail is itself a design flaw. An organization trail isn't owned by the member, so it can't be deleted. ③ **Recurrence prevention axis**: an SCP Deny on `StopLogging` and `DeleteTrail`, a separate Log Archive account, Object Lock. The wrong-answer options in this case are usually "turn on logs from now" (can't prove the past) or "extend CloudWatch Logs retention" (not the cause).

> 🎯 **Case 2 (crossing Domains 2, 3, 4)**: *"An application in a private subnet was compromised, and GuardDuty caught signs that the instance role's credentials were used from an external IP. The application can't be replaced."* → "Can't be replaced" is the decisive constraint. Every answer that requires code changes (SDK changes, changing how credentials are injected) is dropped, leaving only **infrastructure-layer solutions**. ① Containment is an isolation SG + **profile separation + `aws:TokenIssueTime` Deny** (network isolation alone can't stop a token being used from outside). ② Recurrence prevention is **enforcing IMDSv2 + hop limit**, reducing role permissions, and an `aws:SourceVpce` condition. ③ Investigation is an exhaustive trace in CloudTrail using that session ARN as the axis. It is the classic case of three domains each taking one layer in a single incident.

> 🎯 **Case 3 (crossing Domains 3, 6)**: *"ALBs exposed to the internet keep growing across 200 accounts. A standard WAF rule must be applied to all ALBs, applied automatically to those created in the future, and existing services must not be disrupted."* → There are three clues. "All accounts" and "to be created in the future" → **Firewall Manager** (manual per-account attachment is wrong). "Must not be disrupted" → deploy first in **count mode** to observe false positives, then switch to block. And the fact that Firewall Manager **requires Config** and only reports if `RemediationEnabled` is off is used as an option trap.

## Self-Diagnosis: Types of Mistakes → Where to Go Back

The purpose of mock solving is not the score but knowing *which axis is empty*.

| If you got it wrong this way | What is missing | Where to go back |
|---|---|---|
| Fooled by options that swapped service names | The "question it answers" for each service | Day 1's comparison table of the 6 detection services |
| Couldn't solve "why AccessDenied" | Evaluation order and condition keys | Day 2's 6 layers + diagnostic order |
| Split on choosing the encryption method | The 5 S3 encryption types and Object Lock modes | Day 3's comparison table |
| Got an ordering question wrong | The reversibility and evidence-preservation axis | Day 1's "what first" decision axis |
| Answered an organization-scale requirement with an account tool | The 4 layers of governance | Day 3's tool-matching table |
| Chose while ignoring the qualifier | Qualifier interpretation | Today's qualifier table |
| Ran out of time and couldn't see the later part | Pacing | Today's checkpoints and 3 buckets |

The most wasted time in mock solving is *reading the explanations of questions you got right*. Conversely, the most valuable time is spent reviewing **"questions you put in the [B] bucket but ended up getting right."** Those questions are points where you have the knowledge but *the judgment path isn't automated yet*, they are candidates for eating up time in the exam room, and they are the questions you'd get wrong on a bad day. Grading that counts only right and wrong makes this layer invisible. This is why you leave [A]/[B]/[C] marks when solving a mock: the score tells you the result, but the bucket distribution tells you *what to fix next*.

## Quick Keyword → Domain Mapping (Warm-Up)

| Passage keyword | Area it points to |
|-------------|---------------|
| "Suspected data exfiltration, communication with a malicious IP" | GuardDuty (detection) → Detective (investigation) |
| "Whether there is PII in S3" | Macie |
| "Serverless automatic remediation" | EventBridge → Lambda |
| "S3 without going through the internet" | VPC Gateway Endpoint |
| "We own the key exclusively" | CloudHSM/custom key store |
| "Enforce across the organization" | SCP / Firewall Manager / Conformance Pack |
| "Cannot be deleted or tampered with" | S3 Object Lock (WORM) + MFA Delete |
| "Safe cross-account delegation to a third party" | AssumeRole + External ID |
| "Automatic rotation of DB credentials" | Secrets Manager |
| "Automatic guardrails for new accounts" | Control Tower |
| "The existing application can't be changed" | Infrastructure-layer solution (edge, endpoint, agent) |
| "Must be invalidated immediately" | Disable the key / `aws:TokenIssueTime` Deny |
| "Minimal operational burden" | Managed services + automation |
| "Prove activity up to now" | CloudTrail (+ Config history): not retroactive |

"Issued only in us-east-1" (ACM for CloudFront), "data events enabled separately" (S3 object tracking), "NACL ephemeral ports" (stateless responses), "SCP doesn't grant permissions," "the KMS key policy must trust root for IAM delegation to work": these five are the distinctions that split the final two-way choice. Add two more and almost everything is covered: **Gateway Endpoints are only for S3 and DynamoDB**, and **Object Lock Compliance can't be deleted even by root**.

There is one fact repeatedly confirmed when exam candidates organize their wrong-answer notes: a large share of the questions missed in the real exam are not *services seen for the first time* but **known services put in the wrong place**. Putting GuardDuty in the vulnerability-scanning slot, Inspector in the breach-response slot, Config in the blocking slot, Tag Policy in the enforcement slot. The study strategy this implies is clear. In your remaining time, the expected value of **redrawing the boundaries of services you already know** is far higher than *memorizing more new services*. This is why today's and tomorrow's comparison tables are filled only with boundary lines, not new knowledge.

## Summary

Today is not a day to expand knowledge but a day to **raise the efficiency of converting knowledge into points**.

You only need to keep three things in your body. ① **Checkpoints**: 85 minutes at question 33. Check only whether you are ahead or behind. ② **3 buckets**: classify immediately into confident/narrowed/unknown, and fill in an answer in every case. ③ **Qualifiers**: when MOST/LEAST is attached, the grading criterion is stated explicitly, so split along that axis.

And after solving a mock, look not at the score but at **the bucket distribution and the types of mistakes**. Many [C] means knowledge gaps, many [B] means the judgment path isn't automated yet, and a wrong [A] means you misread the requirement sentence. The three causes all have different prescriptions: *review that week's material*, *repeat the comparison tables*, and *correct the order in which you read passages*, respectively.

---

## 📝 Practice Questions

**Question 1.** (Domains 1, 6) A company wants to centrally store all API activity of 200 accounts in a tamper-proof way, prevent any account from turning off logging, and have this apply automatically to new accounts too. What is the most appropriate design?

A) Each account administrator creates an individual trail and stores it in local S3  
B) An organization trail to a central S3 (in a different account, with log file validation and Object Lock) + an SCP denying StopLogging/DeleteTrail + Control Tower applying it automatically to new accounts  
C) Keep it in CloudWatch Logs for 90 days then delete automatically  
D) Collect logs with a Lambda in each account  

**Answer: B**  
Explanation: For multi-account central aggregation, an organization trail automatically includes even new accounts, and an S3 bucket in a separate logging account + log file validation + Object Lock (WORM) guarantees tamper-proofing. An SCP denying StopLogging/DeleteTrail prevents disabling, and Control Tower automatically applies guardrails to new accounts. Individual/local storage, short-term deletion, and custom Lambda collection fail to meet centralization, immutability, and automation all together.

---

**Question 2.** (Domains 1, 2) GuardDuty detected cryptocurrency-mining malware communication from an EC2 instance. The security team wants to (1) isolate the instance immediately, (2) investigate the scope of the compromise, and (3) automatically isolate the same finding in the future without human intervention. What is the most appropriate combination?

A) Terminate the instance and manually dig through the logs  
B) Swap to an isolation security group (+ snapshot) → investigate scope with Detective → EventBridge routes that finding type to Lambda/SSM automatic isolation  
C) Block all traffic with a NACL and be done  
D) Scan only for vulnerabilities with Inspector  

**Answer: B**  
Explanation: Isolation (not termination) preserves volatile evidence, a snapshot captures the evidence, Detective investigates the scope based on the behavior graph, and EventBridge routes that GuardDuty finding to Lambda/SSM Automation automatic isolation to remove human intervention in the future. Termination and manual work destroy evidence and aren't automated, a one-off NACL block has no investigation or automation, and Inspector is vulnerability scanning and not a breach-response tool.

---

**Question 3.** (Domains 3, 4) A Lambda in a private subnet must access DynamoDB and a specific S3 bucket without going through the internet, and hardcoding credentials is prohibited. You also want to minimize cost. What is the most appropriate design?

A) Put the Lambda in a public subnet and access through a NAT Gateway  
B) Configure S3 and DynamoDB Gateway Endpoints (free) in the VPC + grant the Lambda execution role least-privilege access to those resources + a SourceVpce condition in the bucket policy  
C) Store IAM access keys in the Lambda environment variables  
D) Use Interface Endpoints for S3 and DynamoDB  

**Answer: B**  
Explanation: S3 and DynamoDB support Gateway Endpoints (routing-based, free), which satisfy both no internet transit and minimal cost; the Lambda execution role provides temporary credentials, eliminating hardcoding; and the bucket policy SourceVpce condition locks down the access path. Going through NAT traverses the internet and costs money, storing keys in environment variables is prohibited, and Interface Endpoints for S3/DynamoDB are an unnecessary paid option.

---

**Question 4.** (Domain 5) Healthcare-regulated data is stored in S3, with requirements for (1) encryption both at rest and in transit, (2) auditing of key usage, and (3) no one (including administrators) able to delete or tamper with it for 7 years. What is the most appropriate combination?

A) SSE-S3 + versioning only  
B) SSE-KMS (CMK, key policy) + enforcing aws:SecureTransport in the bucket policy + CloudTrail KMS auditing + S3 Object Lock (Compliance mode, 7-year retention)  
C) SSE-C + MFA Delete  
D) Client-side encryption only  

**Answer: B**  
Explanation: Encryption at rest, auditing, and access control are met by SSE-KMS (CMK + key policy + CloudTrail KMS API auditing), encryption in transit by enforcing aws:SecureTransport, and "no one can delete or tamper, including administrators" by S3 Object Lock Compliance mode with 7-year retention. SSE-S3 has weak auditing and key control, SSE-C lacks key management and auditing, and a configuration without Object Lock can't fill the immutability requirement.

---

**Question 5.** (Domains 4, 6) A third-party security audit vendor must check the organization's 50 accounts read-only. You want to avoid sharing long-term keys, prevent the confused deputy problem, and manage it centrally. What is the most appropriate method?

A) Create an IAM user in each account and email the access keys to the vendor  
B) A cross-account read-only role + the vendor account Principal and an External ID condition in the trust policy, deployed to all 50 accounts at once with CloudFormation StackSets  
C) Share the root credentials  
D) Make the buckets public  

**Answer: B**  
Explanation: Safe cross-account access without long-term keys is a read-only role + AssumeRole, the External ID in the trust policy prevents the confused deputy, and StackSets deploys the role to the 50 accounts in bulk and centrally. Emailing access keys, sharing root, and making buckets public are all serious security violations and are dropped immediately.

---

**Question 6.** (Domain 3) A global web app receives (1) SQLi attempts, (2) login brute force, and (3) intermittent large L3/4 floods. Direct access to the origin must also be blocked. What is the most appropriate integrated design?

A) Attach WAF only to the ALB  
B) CloudFront in front + CLOUDFRONT-scope WAF (SQLi managed rules + a /login rate-based rule) + Shield Advanced + blocking direct origin access (prefix list/secret header)  
C) Only harden EC2 security groups  
D) Distribute traffic with Route 53 routing  

**Answer: B**  
Explanation: These are threats at different layers, so a combined control at the edge is the answer. CloudFront gathers the entry point, WAF handles SQLi (L7 filter) and login brute force (rate-based), Shield Advanced handles absorbing L3/4 floods and cost protection, and blocking direct origin access with a prefix list/secret header prevents bypass. ALB alone, hardening security groups, and traffic distribution can't stop this compound threat.

---

**Question 7.** (Domains 1, 5) The security team wants to automatically discover and classify "which S3 buckets contain sensitive data such as credit card numbers and national ID numbers" and gather the results in a central security dashboard. What is the most appropriate combination?

A) Download every object with a custom script and check with regular expressions  
B) Automatically discover and classify sensitive data in S3 with Amazon Macie → aggregate the findings into Security Hub  
C) Install GuardDuty on the S3 bucket  
D) Inspect object contents with a Config rule  

**Answer: B**  
Explanation: Automatic discovery and classification of PII and financial data in S3 is a dedicated Macie capability, and findings are normalized and aggregated in Security Hub to view in a central dashboard. Downloading and regular expressions are inefficient and risky, GuardDuty detects behavioral threats rather than classifying data content, and Config evaluates configuration and does not inspect object contents.

---

**Question 8.** (Domain 6) You want to enforce a standard WAF rule on all ALBs and CloudFront across the organization, apply it automatically to newly created resources, and make violations visible centrally. What is the most appropriate service?

A) Configure WAF manually in each account  
B) Define and enforce an organization-level WAF policy with AWS Firewall Manager (automatically applied to new resources)  
C) Enforce WAF with an SCP  
D) Detect only with a Config rule  

**Answer: B**  
Explanation: Firewall Manager integrates with Organizations to define WAF, Shield, and SG policies at the organization level, applies them automatically to newly created resources, and makes violations centrally visible. Manual configuration creates drift, an SCP is a permissions guardrail and not a tool for deploying WAF rules, and Config only detects and cannot enforce.

---

**Question 9.** (Domains 3, 4) An EC2 application must use RDS credentials. The credentials must be rotated automatically on a regular basis and must not be embedded in code. What is the most appropriate combination?

A) Store the RDS password in an environment variable  
B) Store the RDS credentials in Secrets Manager (automatic rotation with a Lambda rotator) + grant the EC2 instance role GetSecretValue permission on that secret  
C) Store it in SSM Parameter Store String (plaintext)  
D) Hardcode it in the code and change it manually on a regular basis  

**Answer: B**  
Explanation: For DB credentials that need automatic rotation, Secrets Manager replaces them periodically with a Lambda rotator, and granting the EC2 instance role only GetSecretValue achieves least privilege and no hardcoding. Environment variables, plaintext parameters, and hardcoding have no rotation or carry high exposure risk. (For a setting that doesn't need rotation, Parameter Store SecureString is also a candidate, but for an automatic rotation requirement, Secrets Manager is the answer.)

---

**Question 10.** (Domain 1) A team can't find "who downloaded an S3 object." Default CloudTrail is on. What is the cause?

A) VPC Flow Logs are off  
B) S3 object-level access is recorded only if CloudTrail data events are enabled separately (management events do not record it)  
C) GuardDuty is inactive  
D) Bucket logging is encrypted with KMS and so isn't visible  

**Answer: B**  
Explanation: Default CloudTrail management events do not record data-plane access such as S3 object GET/PUT, so object-level tracking requires explicitly enabling data events. Flow Logs can't identify objects, GuardDuty is not an audit source, and KMS encryption is unrelated to log visibility. Separately enabling data events is a frequently tested pitfall.

---
