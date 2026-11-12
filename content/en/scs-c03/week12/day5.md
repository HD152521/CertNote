# Day 5 - D-Day Final: Exam Strategy, Keyword Translation, Trap Summary

This is the last day of the 12 weeks. Today is not about new knowledge but about organizing *the skill of converting what you know into score in the exam room*. SCS-C03 has 65 questions in 170 minutes, with a pass mark of 750/1000 (scaled). The final gate is moving what you know into answers *on time and while avoiding the traps*.

## Exam-Room Operating Strategy

- **Time allocation**: 65 questions / 170 minutes = about 2.6 minutes per question. If you get stuck on the first pass, *flag for review* and move on. Do not spend more than 4 minutes on any one question.
- **Two-pass method**: On the first pass, answer only what you are sure of and flag the rest. On the second pass, focus on the flagged questions. This spreads out the time pressure.
- **Question first, options later**: Reading the *last sentence* of the question (what is actually asked) first and then going back to the body reduces noise.
- **No blanks**: There is no penalty for wrong answers. If you don't know, eliminate and guess, flag it, and move on.
- **"MOST/BEST/LEAST" emphasis words**: When several answers work, the question asks about *degree*. Decide with the preference hierarchy (managed > self-managed, automated > manual, prevent > detect > respond).

The Specialty exam is not a "knowledge exam" but a "judgment exam." Even when two options both work, the answer is the one that better fits the principles of the AWS Well-Architected security pillar — *least privilege, layered defense, traceability, automated security, protection of data in transit and at rest*. The final two-way choice is almost always split by one of these principles.

### One-Page Summary of Qualifiers

A single word at the end of the question is the grading criterion. Skim this condensed version of yesterday's table once right before the exam.

| Qualifier | Direction the answer leans | Representative candidates |
|---|---|---|
| MOST cost-effective | Free, built-in, fewer calls | Gateway Endpoint, Parameter Store, S3 Bucket Keys |
| LEAST operational overhead | **Managed > self-built** | Secrets Manager rotation, managed rules, Control Tower |
| MOST secure | Narrower permissions, stronger immutability | Object Lock Compliance, SSE-KMS, PrivateLink |
| FASTEST to implement | Combinations of existing managed offerings | Control Tower, Conformance Pack |
| MINIMAL disruption | Non-invasive, phased | WAF count mode → block, warn then enforce |
| without changing the application | Solve at the infrastructure layer | Edge, endpoints, agents |
| automatically / immediately | Event-driven | EventBridge → Lambda/SSM |
| prevent | Make the action itself impossible | SCP Deny, proactive controls |
| all / future accounts | Organization tools | SCP/RCP, Firewall Manager, auto-enable |

## Keyword → Service Translation Dictionary

This is the reflex of instantly translating the wording in a stem into a service. It is the key to speed. It is divided by area.

### ① Detection, Investigation, Aggregation

| When the stem says something like this | Think of this service / pattern |
|---------------------------|---------------------|
| "Behavioral anomalies, malicious IPs, suspected data exfiltration, crypto mining" | GuardDuty |
| "Malware on an EBS volume" | GuardDuty Malware Protection |
| "Process-level behavior in containers and nodes" | GuardDuty Runtime Monitoring |
| "Root cause, breach scope, lateral movement, visual investigation" | Detective |
| "Vulnerabilities, CVEs, missing patches, network reachability" | Inspector |
| "Discover and classify PII, card numbers, and sensitive data in S3" | Macie |
| "Discover policies exposed externally or cross-account" | IAM Access Analyzer (external access) |
| "Clean up unused permissions and roles" | IAM Access Analyzer (unused access) |
| "Finding aggregation, CIS/PCI/FSBP scores" | Security Hub |
| "Source logs to a third-party SIEM" | Security Lake (OCSF) |
| "Too many findings, noise" | Security Hub automation rules + Insights |
| "Findings from multiple Regions on one screen" | Security Hub aggregation Region |
| "New accounts are automatically covered by detection" | Delegated administrator + auto-enable |

### ② Logging, Auditing, Monitoring

| When the stem says something like this | Think of this service / pattern |
|---|---|
| "Who called which API" | CloudTrail management events |
| "Which objects were downloaded or uploaded" | CloudTrail **data events** (enabled separately) |
| "Call volume or error rate spikes above normal" | CloudTrail Insights |
| "Centralize activity from all accounts" | Organization trail |
| "Prove logs have not been tampered with" | Log file validation (SHA-256 digest) |
| "Prevent deleting or turning them off" | SCP Deny + Log Archive account + Object Lock |
| "What state was this resource in at that time" | Config configuration item timeline |
| "Evaluate configuration compliance and drift" | AWS Config rules |
| "Multi-account, multi-Region Config data in one place" | Config aggregator |
| "IP flows, only allow/deny" | VPC Flow Logs |
| "Need to see the packet contents" | Traffic Mirroring |
| "Which domains were queried" | Route 53 Resolver query log |
| "Immediate alert on root login" | CloudTrail → CloudWatch Logs metric filter → alarm → SNS |
| "Investigate large volumes of logs with SQL" | Athena / CloudTrail Lake |

### ③ Network and Infrastructure

| When the stem says something like this | Think of this service / pattern |
|---|---|
| "S3/DynamoDB without going over the internet" + "minimal cost" | Gateway VPC Endpoint (free) |
| "Other services / my SaaS without going over the internet" | Interface Endpoint (PrivateLink) |
| "Bucket access only from this VPC" | Bucket policy `aws:SourceVpce` / `aws:SourceVpc` |
| "Block a specific IP range (subnet)" | NACL deny |
| "Per-instance allow list" | Security Group |
| "Inbound is open but responses don't come back" | NACL outbound ephemeral ports (1024–65535) |
| "Must cut off an in-progress connection immediately" | NACL (SGs are stateful) |
| "L7 SQLi/XSS/rate limit/geo blocking" | WAF |
| "L3/4 DDoS absorption, cost protection, response team" | Shield Advanced |
| "VPC IPS, domain control, central inspection" | Network Firewall (+ TGW appliance mode) |
| "DNS-based malware/exfiltration" | Route 53 Resolver DNS Firewall |
| "Prevent direct access to the origin" | CloudFront + OAC / secret header / prefix list |
| "Hub for many VPCs, transitive routing" | Transit Gateway (peering is not transitive) |
| "Dedicated on-premises bandwidth" | Direct Connect (+ VPN encryption) |
| "Third-party appliance inline" | Gateway Load Balancer |

### ④ Identity and Access

| When the stem says something like this | Think of this service / pattern |
|---|---|
| "Organization permission ceiling / prevent doing X" | SCP |
| "Block external access to organization resources" | RCP |
| "The delegate must not exceed their own permissions" | Permissions boundary |
| "Safe third-party delegation, confused deputy" | AssumeRole + trust policy + External ID |
| "IAM role for on-premises workloads" | IAM Roles Anywhere (X.509) |
| "Multi-account SSO, SAML/OIDC federation" | IAM Identity Center |
| "CI/CD without long-term keys" | OIDC federation role |
| "Authenticating the app's end users" | Cognito (User Pool) / temporary AWS credentials (Identity Pool) |
| "Credentials for EC2/EKS/ECS/Lambda" | Instance profile / IRSA·Pod Identity / task role / execution role |
| "Prevent metadata theft via SSRF" | IMDSv2 + hop limit |
| "Automatic rotation of DB credentials" | Secrets Manager |
| "Config values/secrets (no rotation needed, low cost)" | SSM Parameter Store (SecureString) |
| "Invalidate immediately" | Access key `Inactive` / `aws:TokenIssueTime` Deny |

### ⑤ Data Protection and Governance

| When the stem says something like this | Think of this service / pattern |
|---|---|
| "We solely own the key, dedicated HSM, FIPS L3" | CloudHSM / KMS custom key store |
| "With a key from an external key management system" | KMS External Key Store (XKS) |
| "Encryption with key-use auditing and policy control" | SSE-KMS + CloudTrail |
| "Dual-layer encryption" | DSSE-KMS |
| "The key is not kept in AWS" | SSE-C / client-side encryption |
| "SSE-KMS but KMS costs are excessive" | S3 Bucket Keys |
| "Use the key only when going through a specific service" | `kms:ViaService` |
| "Separate decryption per tenant" | `kms:EncryptionContext` |
| "Cannot be deleted or tampered with, WORM, ransomware protection" | S3 Object Lock + MFA Delete + versioning |
| "Nobody (root included) can delete for N years" | Object Lock **Compliance** |
| "Prevent mistakes, exceptions when needed" | Object Lock **Governance** |
| "Backups must not be erasable" | AWS Backup Vault Lock |
| "Deny plaintext HTTP" | Bucket policy `aws:SecureTransport` Deny |
| "Automatic certificate renewal" | ACM (CloudFront needs us-east-1; imported certificates are not renewed) |
| "Internal trust chain" | AWS Private CA |
| "Encrypt an EBS/RDS that already exists" | Snapshot → encrypted copy → restore |
| "Volumes created from now on are automatically encrypted" | Account- and Region-level EBS default encryption |
| "Centrally enforce organization WAF/SG/Shield" | Firewall Manager |
| "Automatic guardrails for new accounts, landing zone" | Control Tower |
| "Block in IaC before creation" | Proactive controls (CloudFormation Hooks) |
| "Deploy a bundle of rules to the organization at once" | Conformance Pack |
| "Evidence and reports for auditors" | Audit Manager |
| "Self-service of approved products only" | Service Catalog |
| "Share resources across accounts" | RAM |
| "Standardize tag notation" | Tag Policy |
| "Block creation without tags" | SCP (`aws:RequestTag` + Null) |
| "A spending spike is a breach signal" | Cost Anomaly Detection / Budgets |
| "Keep data from leaving the organization" | SCP (outbound door) + RCP (inbound door) + `aws:PrincipalOrgID` |

## Compilation of Easily Confused Pair Comparison Tables

Most points lost on the exam come not from *what you don't know* but from *blurry boundaries*. Re-reading only this section right before the exam is fine.

### GuardDuty vs Inspector vs Macie vs Detective vs Access Analyzer vs Security Hub

| Service | The question it answers | One word |
|---|---|---|
| GuardDuty | "Is a threat *behavior* happening right now?" | **Threat** |
| Inspector | "Are exploitable *vulnerabilities* left?" | **Weakness** |
| Macie | "What *data* is sensitive and where is it?" | **Data** |
| Detective | "How are these entities *connected*?" | **Relationships** |
| Access Analyzer | "What is *open to the outside*?" | **Exposure** |
| Security Hub | "How do I view all of this in *one form*?" | **Aggregation** |

### SCP vs RCP vs Permissions Boundary vs Resource Policy vs Session Policy

| Policy | Attached to | Grants permissions | Typical use |
|---|---|---|---|
| SCP | Root/OU/account | No | Organization ceiling — Region lock, protecting security services. **Does not apply to the management account** |
| RCP | Root/OU/account | No | Resource-side organization ceiling — blocking external principals. **Limited supported services** |
| Permissions boundary | An individual user or role | No | The ceiling for **a single principal** — so the delegator cannot exceed their permissions |
| Resource policy | S3, KMS, SQS, Lambda, etc. | **Yes** | Cross-account sharing, allowing service principals |
| Session policy | An AssumeRole session | No | Temporary narrowing of temporary credentials |

One-line discriminator: **if the scope is an account or OU, SCP; if a single principal, permissions boundary; if on the resource side, resource policy or RCP.**

### KMS Key Policy vs IAM Policy vs Grant

| Axis | Key policy | IAM policy | Grant |
|---|---|---|---|
| Sufficient on its own | **Yes** | No (depends on delegation from the key policy) | Yes (within the permitted scope) |
| Lifetime | Permanent | Permanent | **Temporary, revocable** |
| Typical use | Key ownership boundary | Usage permissions for people and apps | A service uses the key on behalf of a user |

**The answer to "I have AdministratorAccess but decryption fails" is usually the key policy.**

### Object Lock Governance vs Compliance vs Legal Hold

| Axis | Governance | Compliance | Legal Hold |
|---|---|---|---|
| Deletion during retention | **Possible** with a special permission | **Impossible (root included)** | Impossible until released |
| Period | Specified, can be shortened | Specified, **cannot be shortened** (only extended) | No period |
| When | Internal policy, preventing mistakes | **Regulatory requirement** | Freeze for litigation or investigation |

### SSE-S3 vs SSE-KMS vs DSSE-KMS vs SSE-C

| Axis | SSE-S3 | SSE-KMS | DSSE-KMS | SSE-C |
|---|---|---|---|---|
| Key control and auditing | Weak | **Key policy + CloudTrail** | Same | Entirely the customer's |
| Encryption layers | 1 | 1 | **2 (dual)** | 1 |
| The clue for choosing it | Default encryption | "Auditing and control" | "Dual-layer" | "Key not kept in AWS" |

### Config vs CloudTrail vs VPC Flow Logs

| Axis | Config | CloudTrail | Flow Logs |
|---|---|---|---|
| What it answers | "What **state** was it in then" | "Who **called what**" | "Where did it **flow**" |
| Unit | Resource configuration item | API event | ENI/subnet/VPC flow |
| Payload | — | — | **None** (metadata only) |
| Role in an investigation | When it changed | Who did it | Where it went out to |

### Shield vs WAF vs Network Firewall vs NACL/SG

| Threat / requirement | Answer |
|---|---|
| L3/4 volumetric flood, DDoS cost protection | **Shield Advanced** |
| L7 SQLi/XSS/bots/rate limit/geography | **WAF** |
| IPS, domains, and signatures inside the VPC and on egress | **Network Firewall** (routing enforcement required) |
| Subnet-level IP blacklist | **NACL deny** |
| Per-instance allow list | **Security Group** |

### Other Confused Pairs

- **Security Hub vs Security Lake**: aggregating findings (ASFF) vs supplying source logs (OCSF).
- **Conformance Pack vs Audit Manager**: deploying rules vs packaging evidence. **Audit Manager does not generate evidence.**
- **Tag Policy vs SCP**: standardizing notation vs **blocking creation**.
- **Control Tower vs StackSets**: a guardrail framework vs a deployment tool.
- **Secrets Manager vs Parameter Store**: automatic rotation vs low-cost configuration values.
- **Gateway vs Interface Endpoint**: free for S3 and DynamoDB vs paid for everything else.
- **Peering vs Transit Gateway**: not transitive vs hub-and-transitive.
- **Isolate vs terminate**: network blocking (preserves evidence) vs destroying evidence.
- **automation rules vs EventBridge**: changing fields inside Security Hub vs sending out to take action.

## Roundup of Commonly Missed Traps

Finally, here are the most expensive mistakes all in one place.

> ⚠️ **Logging and detection traps**:
> - CloudTrail management events **do not record S3 object or Lambda data access** → enable data events separately.
> - GuardDuty **consumes logs internally**, so there is no need to turn on Flow Logs/DNS logs separately for it — do not turn them off.
> - GuardDuty = threats, Inspector = vulnerabilities, Macie = data, Detective = investigation, Security Hub = aggregation. Do not confuse them.
> - VPC Flow Logs **do not look at the payload** (only allow/deny and metadata). For content, use packet mirroring or application logs.

> ⚠️ **IAM and governance traps**:
> - **SCPs and permissions boundaries do not grant permissions** — they only limit the ceiling.
> - Evaluation order: **an explicit Deny takes top priority**, then SCP, Allow, boundary, implicit Deny.
> - **Do not put long-term access keys on workloads** → use roles (instance profile/IRSA/execution role).
> - For cross-account delegation, use an **External ID** to prevent the confused deputy.
> - IAM roles = staff and workloads, **Cognito = app users**.

**Network traps**
- **NACLs are stateless** → separately allow outbound ephemeral ports (1024-65535).
- SGs have **no deny rules** (allow list only). To block an IP, use a NACL deny.
- Even after creating a VPC Endpoint, communication works only if **the endpoint/IAM policy allows it**.
- Network Firewall inspects only when **routing forces the traffic through it**.
- When doing stateful inspection with a TGW, omitting **appliance mode** causes asymmetric misbehavior.

**Data protection traps**
- **ACM certificates for CloudFront are issued only in us-east-1**.
- KMS uses **envelope encryption** (it does not directly encrypt bulk data).
- The KMS key policy must **trust the root for IAM policy delegation to work**.
- KMS key deletion has a **7–30 day wait** — until then you can recover by disabling.
- At-rest (SSE/KMS) and in-transit (TLS, `aws:SecureTransport`) are **separate controls** — you need both.
- SSE-S3 is weak on key auditing and policy control → when control is required, use **SSE-KMS**.

**Incident response traps**
- **Terminating** the compromised instance immediately destroys volatile evidence.
- Isolating **without detaching from the ASG or target group** → the ASG terminates it because of failing health checks.
- Not removing **the default outbound allow** from the new isolation SG, so exfiltration continues.
- Isolating only the instance and **not revoking the STS tokens** (they remain valid outside until they expire).
- **Deleting the exposed key before tracing**, losing the `accessKeyId` lookup axis.
- **Recovering without eradication**, so a backdoor lets the attacker back in.
- Putting **irreversible actions into unattended automation**, so a single false positive becomes an outage.
- Replacing only the SG while **an established C2 session** persists (NACL and ENI measures are needed as support).
- Trying to **restrict root with IAM policies or SCPs** (SCPs do not apply to management account principals).

**Governance and proof traps**
- **Audit Manager does not generate evidence** — Config/CloudTrail/Security Hub must be on beforehand.
- **Currently COMPLIANT is not proof over a period** — for history, use Config configuration history + CloudTrail.
- **Logs and evidence cannot be generated retroactively** — only what you turned on before the requirement arrived counts as evidence.
- **A Tag Policy cannot block creation without tags** — blocking is the SCP's job.
- **Manually changing a Control Tower-managed resource = drift** → re-apply the landing zone.
- **Firewall Manager requires Config**, and if `RemediationEnabled` is off it only reports.
- **auto-enable and delegated administrator are per service**.
- **Controls apply to OUs** — applying them to individual accounts misses new accounts.
- Omitting **the global-service and us-east-1 exceptions in a Region-lock SCP** breaks the console, CloudFront, and ACM.
- **Calls by service-linked roles are excluded from SCP evaluation** — the cause of "only a specific path keeps getting through."

> 🎯 **Decision rule for the final two-way choice**: If both answers work — (1) Is it more *managed*? (2) Is it more *automated*? (3) Is it more *least-privilege*? (4) Is it more *impossible to bypass*? (5) Is it earlier in the *prevent > detect > respond* hierarchy? (6) Can it *enforce across the whole organization*? (7) Is it *reversible* (for automated-response questions)? The one that satisfies more of these is the best.

### Decision Tree: The Order for Splitting the Final Two-Way Choice

```
Both options "work"
   │
   ├─① Is there a qualifier?  ── If so, that axis is the grading criterion. It ends here.
   │      MOST cost-effective → the free, built-in side
   │      LEAST operational overhead → the managed side
   │      MOST secure → the narrower, more immutable side
   │
   ├─② Does either side violate a constraint?
   │      "no internet" / "existing app" / "multi-account" / "regulatory"
   │      → Violating even one eliminates that option immediately
   │
   ├─③ Do the required verb and the control layer match?
   │      prevent → SCP, policy Deny, proactive control
   │      detect  → Config, GuardDuty, Access Analyzer
   │      respond → EventBridge, Lambda, SSM
   │      (An option that proposes to block with a detection tool is wrong)
   │
   ├─④ Is it a half-measure?
   │      Locks the path but leaves permissions as they are / contains but doesn't trace or eradicate
   │      → The side with the complete combination is best
   │
   ├─⑤ Is it an extreme statement?
   │      "automate everything" "do everything manually" "turn off detection" "revoke all permissions"
   │      → Extremes are usually wrong
   │
   └─⑥ If it still splits ── preference hierarchy
          managed > self-managed
          automated > manual
          prevent > detect > respond
          organization-wide enforcement > per-account
          reversible automation > irreversible automation
```

## The Day Before and Day Of

The knowledge is already done. What remains are your condition and procedure.

**What is good to do the day before** — do not open new material. Skim *only the comparison tables and trap lists* of today's document (new knowledge only adds anxiety). Check the venue, time, and the ID you need, and if you are taking the exam online, finish the system check and desk cleanup in advance. Sleep well — 170 minutes of concentration is decided in the last 20 questions, and accuracy in that stretch is directly proportional to sleep.

**Day-of operation** — right after starting, spend 30 seconds engraving *the checkpoint numbers* back into your head (85 minutes at question 33). Go fast on the first pass, focusing on confident questions, and always fill in a tentative answer on flagged questions before moving on. If you check the on-screen flag-for-review function and the remaining-time display early on, you won't wander in the middle. If you feel your pace has collapsed midway, go back to *the order in which you read the stem* — last sentence → constraints → options.

The exam looks not at "do you know this service" but at "do you choose *the right combination* in this situation." That is why it is the flow of *scenario decomposition → keyword translation → trap avoidance → applying the preference hierarchy*, rather than memorizing single answers, that makes the score. The decisiveness to flag an unknown question and move on protects the whole score. The pace across 65 questions, not the perfection of a single question, makes the pass. Simply apply the domain mental models you built over 12 weeks — the nervous system of detection and response (1, 2), dual control of path × permission (3, 4), and encryption × governance propagation (5, 6). And one more thing: **tension makes you read the stem too briefly.** The most common way to miss a question you know on the real exam is "skipping a single line of constraints." The place to speed up is eliminating options, not reading the stem.

If you recall in one line each the incidents from which the judgment this certification demands actually originated, the trap list stays with you as stories rather than memorization. **Code Spaces (2014)** — with the account taken over, *even the backups that lived in the same account* as the data were deleted, and the company shut down. → Put logs and backups in **an account that the party that created them cannot delete from**. **Capital One (2019)** — SSRF reached the instance metadata, the role's temporary credentials were obtained, and data was exfiltrated, and the company only became aware through an external tip. → **Isolation and credential revocation are separate**, IMDSv2 and least privilege are preparation items rather than response, and without your own detection loop even awareness is late. **Equifax (2017)** — entry came through a missed patch, and the certificate on a traffic-inspection device had expired and been left that way, so detection did not work for a long period. → A control must be confirmed not as "we installed it" but as **"it is working now."** **SolarWinds (2020)** — the intrusion came through a trusted supply chain and was finally exposed by a security company's own anomaly detection. → Trust boundaries must be drawn on the inside too, and the last line of defense is always *your own detection*. The reasons "a person checks periodically" is a wrong option in the exam and "keep it immutably in a separate account" is the right one are all contained in these four sentences.

## Final Checklist (Right Before the Exam)

- [ ] Can you instantly translate the core services of the six domains from keywords?
- [ ] Have you memorized the five traps (data events, SCPs don't grant, NACL ephemeral ports, ACM us-east-1, KMS waiting period)?
- [ ] Is the role distinction among GuardDuty/Inspector/Macie/Detective/Security Hub clear?
- [ ] Does the IAM evaluation order (Deny → SCP → Allow → Boundary) come to mind reflexively?
- [ ] Are you ready to manage time with the two-pass strategy and flag for review?
- [ ] Do you remember the final two-way decision rule (managed/automated/least-privilege/prevent)?

## Summary

Compress the 12 weeks into one sentence: **"Logs create evidence, detection creates judgment, boundaries and permissions limit the damage, and encryption and governance keep that state in place."**

There are only three things you actually use in the exam room.

1. **Translation** — move the wording of the stem to a service. "Cannot be tampered with" → Object Lock, "without the internet" → endpoint, "invalidate immediately" → disable the key or revoke the session, "existing software can't be replaced" → solve at the infrastructure layer, "minimal operational burden" → managed.
2. **Boundaries** — draw the line between confused pairs. Threat/weakness/data/relationships/exposure/aggregation, SCP/permissions boundary/resource policy, Governance/Compliance, Config/CloudTrail/Flow Logs.
3. **Hierarchy** — when both answers work, split them in the order qualifier → constraints → control layer → combination → preference hierarchy.

Once you have these three, the rest is a matter of pace. 85 minutes at question 33, 150 minutes for the first pass, 20 minutes for flagged questions. Leave no question blank.

One last thing. **Meeting a question you don't know is not a sign of failure; it is the normal distribution.** The pass mark is not a perfect score, and unscored questions are mixed in. The real danger is being shaken by one question and losing focus on the next five. Flag it, move on, and come back.

Decompose calmly, translate, and avoid the traps.

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
