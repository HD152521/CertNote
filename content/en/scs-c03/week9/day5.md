# Day 5 - Week 9 Synthesis: Integrated Review of Threat Detection Scenarios

This week covered the entire threat detection layer: GuardDuty (agentless threat detection), Detective (finding investigation and root cause), Inspector (vulnerability scanning), and the integrated architecture centered on Security Hub. Today we bind them into a single decision framework. The exam asks less about individual service features and more about *"in this situation, which detection tool, in which role, deployed where?"* The key is two-dimensional thinking: **purpose (what do you want to know?) × integration (how do you bind it into one pipeline?)**.

## Unified Decision Matrix: Requirement → Tool

| Requirement / Situation | Primary tool | Key reason |
|-----------|----------|-----------|
| Detect credential misuse and malicious communication in real time | GuardDuty (foundation) | Agentless; analyzes CloudTrail/Flow/DNS |
| Malicious process/file behavior inside a host | GuardDuty Runtime Monitoring | Runtime visibility (lightweight agent) |
| Scan an EC2 instance suspected of malware infection | GuardDuty Malware Protection (EBS) | Snapshot-based, no agent required |
| Find CVE vulnerabilities in EC2/ECR/Lambda | Inspector | Continuous scanning + contextual prioritization |
| Track images against CVEs published after the push | Inspector ECR continuous scanning | Re-evaluation after push |
| Investigate a finding's root cause, blast radius, and lateral movement | Detective | Behavior graph, baselines |
| Group related findings to reduce alert fatigue | Detective finding groups | Campaign-level grouping |
| Normalize and aggregate results from multiple tools | Security Hub (ASFF) | Single pane of glass + correlation |
| Evaluate compliance controls (CIS/FSBP) | Security Hub standards checks | Configuration best-practice evaluation |
| View multi-Region findings in one place | Security Hub aggregation Region | Cross-Region aggregation |
| Detection → automated response (isolate/patch/ticket) | Security Hub → EventBridge → Lambda/SSM | Unified SOAR |
| Automatically include new accounts in detection | Delegated administrator + auto-enable | Eliminates blind spots |
| Classify sensitive S3 data (PII) | Macie | Data classification (not threat detection) |

The foundation of this matrix is the *Detect* function of the NIST CSF and the division of labor among *prevent-detect-respond*. Assuming prevention (IAM, encryption, WAF) will eventually be bypassed, the detection layer finds "threats (GuardDuty) + vulnerabilities (Inspector)", gives them meaning through investigation (Detective), and operationalizes them through aggregation and automation (Security Hub + EventBridge). The "best" answer on the exam is usually *a purpose-fit specialist tool + Security Hub integration + delegation to the Security Tooling account*.

## Data Source Reverse Mapping: "If This Data Is Missing, What Can't Be Seen?"

Days 1-4 followed the direction from tool to data. For exam preparation, the **opposite direction** is more useful, because questions usually take the form "because of this configuration, something is invisible."

| Data / Precondition | What is invisible without it | How to recover |
|-------------|---------------------------|-----------|
| VPC default Route 53 Resolver | All of GuardDuty's **DNS-based findings** (`!DNS`, DNS exfiltration, mining domains) | Use the default resolver, or configure Route 53 Resolver query logging separately |
| Runtime Monitoring agent | **Processes, files, and command execution** inside hosts/containers | Enable Runtime Monitoring |
| S3 data events (S3 Protection) | **Object-level** anomalous S3 access | Enable GuardDuty S3 Protection |
| EKS audit logs (EKS Protection) | **API-level** Kubernetes abuse | Enable EKS Protection |
| SSM managed state (or agentless) | Inspector's **EC2 package CVEs** | SSM Agent, instance profile, SSM VPC endpoints |
| ECR continuous scanning | **CVEs published after the push** | Enable enhanced/continuous scanning |
| `lambdaCode` scanning | Vulnerabilities and hardcoded secrets in the **Lambda code itself** | Enable code scanning separately |
| Detective pre-activation | **Baselines and past behavior before the incident** | Enable always-on before an incident (cannot be recovered afterward) |
| Detection in inactive Regions | **All activity** occurring in that Region | Enable in all Regions + restrict Regions with SCPs |
| Aggregation Region | **All Security Hub findings** from other Regions | Configure a finding aggregator |
| Auto-enable | **All new accounts** | Per-service, per-feature auto-enable |

> ⚠️ **Pitfall**: In this table there is **one item that cannot be undone**: Detective pre-activation. For everything else, turning it on now lets you see the future; Detective does not backfill the period before activation. A design like "a breach is suspected, so I'll enable Detective now and investigate last month's activity" does not work, and answer choices of this shape are wrong on the exam. For the same reason, **log retention is decided in peacetime, not during an incident**.

## Purpose-Driven Thinking: "Detect" vs "Investigate" vs "Block"

The same incident leads to different answers depending on the *verb*. Read the verb in the question first:

- **"Detect"** → GuardDuty (threats) or Inspector (vulnerabilities). Tools that *generate* findings.
- **"Investigate" / "root cause"** → Detective. A tool that *explains* findings (it does not generate them).
- **"Aggregate / standardize / single pane"** → Security Hub. A tool that *collects* findings.
- **"Block" (prevent/block)** → WAF/SG/NACL/Network Firewall. Detection tools *do not block*.
- **"Respond automatically"** → EventBridge + Lambda/SSM/Step Functions.

> ⚠️ **Collection of pitfalls**:
> - Mistaking Detective for a "detection tool" (it actually investigates; it does not generate findings).
> - Mistaking Security Hub for a "threat detection tool" (it actually aggregates and orchestrates).
> - Mistaking GuardDuty/Inspector for "blocking tools" (they only detect; blocking requires separate automation).
> - Assuming GuardDuty sees inside the host (the foundation covers only network/API; Runtime Monitoring is needed).
> - Assuming Inspector EC2 scanning works without SSM management (agent-based scanning requires SSM).
> - Assuming GuardDuty DNS findings appear with a custom DNS resolver (the VPC default resolver is required).
> - Assuming ECR on-push alone catches CVEs published later (continuous is required).
> - Assuming Security Hub findings are global (they are per Region; an aggregation Region is required).

## Result-Reading Drill: Reconstruct the Situation from the JSON

This week's practical skill is not memorizing finding names but **reading a finding and stating what happened**. We take three real-world fragments and, for each, work out what it means and what to do first.

### Case 1 - Is the Instance the "Doer" or the "Victim"?

```json
{
  "Type": "Backdoor:EC2/C&CActivity.B!DNS",
  "Severity": 8,
  "Resource": { "ResourceType": "Instance",
    "InstanceDetails": { "InstanceId": "i-0abc123", "Tags": [{"Key":"Env","Value":"prod"}] } },
  "Service": {
    "ResourceRole": "ACTOR",
    "Action": { "ActionType": "DNS_REQUEST",
      "DnsRequestAction": { "Domain": "cdn-update.example-c2.net", "Blocked": false } },
    "Count": 88,
    "EventFirstSeen": "2026-03-12T18:04:00Z",
    "EventLastSeen": "2026-03-14T09:41:00Z"
  }
}
```

The reading order is always **Type → ResourceRole → Action → Count/time**.

- `Backdoor` + `C&CActivity` - a backdoor has already been planted and the instance is **trying to communicate with a command-and-control server**. This is a post-intrusion stage.
- `ResourceRole: ACTOR` - our instance is the *acting party*. In other words, our side is already infected.
- `!DNS` + `Blocked: false` - the domain query succeeded and was not blocked by any DNS control.
- `Count: 88`, spanning two days - this is a **persistent beacon**. The chance of a one-off false positive is very low.
- `Env: prod` - the blast radius is production.

First-line response: **move to an isolation SG (do not terminate) → EBS snapshot → Malware Protection scan → trace the initial intrusion path → check other instances that queried the same domain.** The last item is important: if one instance is infected, siblings from the same AMI and the same deployment are also suspects.

### Case 2 - Separating "Now" from "Next" in a Vulnerability Finding

```json
{
  "type": "PACKAGE_VULNERABILITY",
  "severity": "CRITICAL",
  "inspectorScore": 9.6,
  "exploitAvailable": "NO",
  "fixAvailable": "NO",
  "resources": [{ "type": "AWS_EC2_INSTANCE", "id": "i-0def456",
                  "details": { "awsEc2Instance": { "subnetId": "subnet-private-1" } } }]
}
```

Even with the same CRITICAL rating, the judgment goes in opposite directions.

- `exploitAvailable: NO` - no public exploit exists yet. Imminence is low.
- `fixAvailable: NO` - **no patch exists.** So "patch quickly" cannot be the answer.
- Private subnet - reachability is low.

The correct answer for this combination is not patching but a **compensating control**: narrowing exposure paths (SG, NACL), network segmentation, WAF/Network Firewall rules, and stronger monitoring until the vendor patch is released. On the exam, `fixAvailable: NO` is a signal that eliminates every "patch priority" style choice.

### Case 3 - S3 Exfiltration or a Normal Batch Job?

```json
{
  "Type": "Exfiltration:S3/AnomalousBehavior",
  "Severity": 5,
  "Resource": { "ResourceType": "S3Bucket",
    "S3BucketDetails": [{ "Name": "customer-exports", "PublicAccess": { "EffectivePermission": "NOT_PUBLIC" } }] },
  "Service": {
    "ResourceRole": "TARGET",
    "Action": { "ActionType": "AWS_API_CALL",
      "AwsApiCallAction": { "Api": "GetObject", "CallerType": "Remote IP" } },
    "Count": 2417
  }
}
```

- `Severity: 5` (Medium) - not automatically top priority. But there is a reason below why you must not move on just because of the severity.
- `NOT_PUBLIC` - the bucket is not public. This means **a principal with legitimate permissions read it**, which is not grounds for reassurance but suggests an *insider or stolen credentials*.
- `Count: 2417` - the volume is outside the range of normal reads.
- Bucket name `customer-exports` - the data is likely highly sensitive.

What is needed here is **combination with information from other axes**. (1) Check the bucket's sensitivity with Macie, (2) look at the principal's first appearance, location, and user agent in Detective, and (3) correlate with the same principal's other findings in Security Hub. **If you set priority by a single finding's severity alone, cases like this get buried** - that is why day 4's automation rule "raise severity for findings on resources tagged as sensitive data" is put in place.

> 🎯 **Scenario**: When the question says "Dozens of Medium-severity S3 anomalous access findings arrive each day, so the SOC skips them all. How do we avoid missing real exfiltration?", the shape of the correct answer is to **reflect resource sensitivity (Macie classification/tags) in severity** and **group findings by principal** (Detective finding groups / Security Hub Insights) so they appear as a single incident. "Lower the severity threshold to see everything" is wrong - it increases noise and ends up missing more. **An answer that solves a prioritization problem by adjusting a threshold is usually wrong.**

## Integrated Scenario A: Full Pipeline for a Single Breach

> 🎯 **Scenario A**: "An internet-exposed EC2 instance appears to be compromised. We should have known its weaknesses in advance, detect the attack, investigate the root cause, and automatically isolate it and open a ticket. It is a 50-account organization."
>
> **Answer**:
> 1. **Inspector**: Identify the exposed EC2 instance's critical CVEs in advance through continuous scanning (prioritized by reachability and exploit weighting).
> 2. **GuardDuty**: Detect `UnauthorizedAccess:EC2/SSHBruteForce` + abnormal outbound traffic. Use Runtime Monitoring if in-host activity is suspected and Malware Protection if malware is suspected.
> 3. **Detective**: Investigate the compromised instance role's reconnaissance from a new location and with new APIs, and communication with other instances from the same IP (lateral movement).
> 4. **Security Hub**: Aggregate the results of 1-3 in ASFF → **EventBridge** → Lambda (move to isolation SG + snapshot + revoke credentials) + Jira ticket.
> 5. **Baseline**: Align the delegated administrator of every service to the Security Tooling account + auto-enable.

## Integrated Scenario B: Multi-Account, Multi-Region Detection Baseline

> 🎯 **Scenario B**: "Hundreds of accounts, several Regions. We want new accounts included automatically, workload teams unable to turn off detection, all findings in a single pane, and logs stored where an intruder cannot touch them."
>
> **Answer**:
> - Align the **Security Tooling account** as the **common delegated administrator** for GuardDuty, Security Hub, Detective, Inspector, Macie, and Access Analyzer.
> - Organization mode + **auto-enable** to include new accounts automatically; members cannot turn it off.
> - Use the Security Hub **aggregation Region** to aggregate multi-Region findings into a single Region.
> - Store CloudTrail/Config logs immutably (write-once) in the **Log Archive account** - separated from the detection account (separation of privilege).
> - Central EventBridge bus → unified response automation.

## Integrated Scenario C: Detection Blind Spots on a Container Platform

> 🎯 **Scenario C**: "Hundreds of services run on EKS. We want to see image vulnerabilities, cluster API abuse, and malicious processes running inside pods. Right now only the GuardDuty foundation is enabled."
>
> **Answer**: These requirements sit at different layers, so no single switch solves them.
> 1. **Image vulnerabilities** → Inspector **ECR scanning (on-push + continuous)** + a CI gate to block deployment.
> 2. **Cluster API abuse** (privileged containers, anonymous access allowed, exec in `kube-system` pods, etc.) → GuardDuty **EKS Protection** (audit log analysis).
> 3. **Processes/files inside pods/nodes** → GuardDuty **Runtime Monitoring** (agent).
> 4. Aggregation and automation → Security Hub → EventBridge → pod isolation, node cordon, ticket.
>
> There are two types of wrong answers: "Enable Inspector and it also sees runtime threats" (Inspector covers vulnerabilities only) and "The GuardDuty foundation sees Kubernetes API abuse" (EKS Protection is required). The principle that **different layers mean different data sources** applies here directly.

The mining incident in Tesla's AWS environment, disclosed in 2018, is the real-world example of this scenario. It started from a Kubernetes administration console exposed to the internet without authentication; the attackers obtained the cloud credentials stored inside it and ran mining workloads. Mapping this path onto the detection layer, each stage is caught by a different tool - the **exposed administrative endpoint** by Inspector's network reachability analysis and Security Hub standard controls, **cluster API abuse** by EKS Protection, **mining domain queries** by the GuardDuty foundation's DNS analysis, and the **mining process inside the pod** by Runtime Monitoring. It is also important that the attackers evaded detection by keeping CPU usage low and using non-standard ports - **detection that depends on a single signal gets evaded.** Judgment can be made only when weak signals from several layers converge on one resource, and what makes that convergence possible is ASFF-based aggregation.

## Integrated Scenario D: Questions Involving Delegation and Separation of Privilege

> 🎯 **Scenario D**: "An audit pointed out that 'workload teams can turn off detection or delete logs in their own accounts.' Make that structurally impossible."
>
> **Answer**: This is a matter of **account structure and delegation**, not features.
> - Run all detection services in **Organizations organization mode + Security Tooling account as delegated administrator**. In organization mode, member accounts cannot turn off their own detectors.
> - Send logs to a **separate Log Archive account** through an organization trail, with a bucket policy that workload accounts cannot access + Object Lock (immutable retention).
> - In addition, deny `guardduty:DeleteDetector`, `cloudtrail:StopLogging`, `config:DeleteConfigurationRecorder`, and similar actions organization-wide with an **SCP**.
>
> "Prohibit it with an IAM policy in each account" is the wrong answer here - because the account administrator can delete that policy themselves. **A control inside an account cannot stop that account's administrator.** Only organization-level SCPs and account separation give a structural guarantee.

## Deployment Status Check: One Lap with the CLI

This is the minimal set of commands to confirm that "detection is deployed properly." Which blind spot each command targets is, in effect, this week's summary.

```bash
# GuardDuty: is organization auto-enable and are protection plans turned on?
DET=$(aws guardduty list-detectors --query 'DetectorIds[0]' --output text)
aws guardduty describe-organization-configuration --detector-id "$DET" \
  --query '{AutoEnable:autoEnableOrganizationMembers,Features:features[].{N:name,A:autoEnable}}'

# Inspector: assets that are not being scanned, and why
aws inspector2 list-coverage \
  --query 'coveredResources[?scanStatus.statusCode!=`ACTIVE`].{Id:resourceId,Why:scanStatus.reason}'

# Detective: does a behavior graph exist in this Region? (if not, no investigation is possible)
aws detective list-graphs --query 'GraphList[].{Arn:Arn,Created:CreatedTime}'

# Security Hub: is cross-Region aggregation configured?
aws securityhub list-finding-aggregators
aws securityhub get-finding-aggregator --finding-aggregator-arn <arn> \
  --query '{Region:FindingAggregationRegion,Mode:RegionLinkingMode}'

# Security Hub: which detectors are actually sending findings? (check for missing integrations)
aws securityhub get-findings --max-items 200 \
  --query 'Findings[].ProductFields."aws/securityhub/ProductName"' | sort -u
```

The last command is especially useful. **If a product that should be sending findings is missing from the list, that integration is turned off**, and this is a blind spot that the mere fact of "we enabled Security Hub" in the console does not reveal.

## Complete Summary of Common Confusions

**GuardDuty vs Inspector** - threats (actual malicious activity, detection) vs vulnerabilities (exploitable weaknesses, preventive). The timing differs.

**GuardDuty vs Detective** - detection (generating findings) vs investigation (explaining findings). Detective does not create findings.

**Detective vs Security Hub** - deep investigation (narrow and deep, behavior graph) vs aggregation and standardization (wide and shallow, ASFF). Complementary.

**Security Hub vs GuardDuty/Inspector** - an aggregation and orchestration hub vs specialist detectors. Security Hub does not detect threats directly (standards control evaluation is the exception).

**Detection tools vs prevention tools** - GuardDuty/Inspector/Detective/Security Hub do *detection, investigation, and aggregation* only. Blocking is the job of WAF/SG/NACL/Network Firewall + automation.

**GuardDuty Malware Protection vs Inspector** - the former scans for *malware* (malicious files), the latter scans for *CVE vulnerabilities*. Different targets.

**Macie vs detection tools** - Macie does *sensitive data classification* (PII) for S3; it is not threat detection.

## Visibility and Operations: Detection Is Completed as a Pipeline

Detection maturity is determined not by "do detection results appear?" but by "do detection results flow into *correlation, investigation, and response*?":

```
[Prevention bypassed] → Inspector (weaknesses) + GuardDuty (threats) → Security Hub (aggregation, ASFF)
                                                       ├─ Detective (investigation)
                                                       └─ EventBridge → automated response
                                                            (isolate/patch/ticket/notify)
```

Signals and integrations of each tool:
- **GuardDuty**: findings → EventBridge (real time) + automatic Security Hub integration.
- **Inspector**: findings → Security Hub + EventBridge → SSM Patch Manager (remediation).
- **Detective**: investigation - entered from a finding via "Investigate in Detective".
- **Security Hub**: ASFF aggregation + Insights correlation + automation rules + a single EventBridge publication.

These signals connect to *actual isolation, forensics, and recovery* workflows next week (incident response) - detection is the entrance to response.

If you summarize the entire detection layer in one sentence: *"Discover with specialist tools, integrate with ASFF, investigate with Detective, respond with EventBridge, and delegate to the Security Tooling account."* On the exam, the "best" answer for detection questions is almost always one piece of this integrated pattern. The traps are usually role confusion (investigation as detection, aggregation as detection, detection as blocking) or a missing activation precondition (no SSM management, custom DNS, on-push only, auto-enable not set, aggregation Region not specified). Read the verb and the preconditions first.

## Question-Solving Order: Decision Flowchart

Fixing the procedure you will actually run in the exam room as a flow keeps you steady.

```
Read the question
   │
   ├─① Find the verb ──────────────────────────────────────────┐
   │    detect           → GuardDuty (threats) / Inspector (vulnerabilities) │
   │    investigate      → Detective                           │
   │    aggregate/standardize → Security Hub (ASFF)            │
   │    block            → SG/NACL/WAF/Network Firewall        │
   │    automated response → EventBridge → Lambda/SSM/StepFn   │
   │    data classification → Macie                            │
   │                                                            │
   ├─② Look at the target layer ───────────────────────────────┤
   │    network/API      → GuardDuty foundation                 │
   │    inside the host  → Runtime Monitoring                   │
   │    malicious file on disk → Malware Protection             │
   │    K8s API          → EKS Protection                       │
   │    packages/images  → Inspector                            │
   │                                                            │
   ├─③ Check whether a precondition is broken ─────────────────┤
   │    Custom DNS? → no DNS findings                           │
   │    Not SSM-managed? → no Inspector EC2 scan                │
   │    On-push only? → later CVEs missed                       │
   │    Detective enabled after the fact? → no past data        │
   │                                                            │
   ├─④ Look at the scale conditions ───────────────────────────┤
   │    "multiple accounts" → delegated admin + auto-enable     │
   │    "multiple Regions"  → aggregation Region / enable in all Regions │
   │    "new accounts"      → auto-enable                       │
   │    "cannot turn off"   → organization mode + SCP + account separation │
   │                                                            │
   └─⑤ Look at the reversibility of the action ───────────────┘
        Unattended automation OK: isolation SG, tagging, snapshots, session invalidation
        Human in the loop needed: termination, deletion, permanent permission revocation
```

Skipping step ③ is the most common way to lose points. All the answer choices sound plausible, but somewhere in the question stem there is **a single sentence that breaks a precondition**, such as "the organization uses a custom DNS server," "the instance is in a subnet without internet access," "the image was pushed six months ago," or "the tool was enabled after the breach was suspected." That sentence decides the answer. When the stem mentions a technical configuration, it is not background; it is a **condition**.

## 📌 Key Takeaways

Week 9 was not the week of learning "four detection services" but the week of learning **how the detection function is assembled**. We close with three levels of summary.

**First, separation of roles.** GuardDuty looks at behavior and Inspector looks at weaknesses. Detective explains without creating, and Security Hub collects without detecting. And none of these four blocks anything. A single verb in an exam question decides the answer on top of this separation, and the wrong answer choices are usually these boundaries shifted by one notch.

**Second, the fragility of preconditions.** Turning a service on is different from what it is actually seeing. A single custom DNS resolver wipes out GuardDuty's entire DNS family of detections, and a single broken SSM connectivity path wipes out Inspector's EC2 scanning. And Detective's past data has no way to be recovered after the fact. **Detection failures usually come not as "we didn't turn it on" but as "we turned it on, yet couldn't see."**

**Third, time is damage.** In Capital One, in Codecov, and in the mining in Tesla's account, what the post-incident reports commonly pointed out was not the sophistication of the attack but **the time it took to notice and respond**. That is why the last piece of a detection architecture is always automation, and the last piece of automation is the reversibility judgment - entrust reversible actions to machines to shorten the time, and route irreversible actions through a human to prevent the cost of a misjudgment.

Next week (incident response) starts at the exit of the pipeline drawn today. Isolation, forensics, eradication, recovery, and then post-incident improvement - **detection is the entrance to response, and detection without response is observation, not control.**

### One-Sentence Checklist

- [ ] Did you read the question's verb (detect/investigate/aggregate/block/respond) first to choose the tool?
- [ ] Did you distinguish the GuardDuty foundation from protection plans (Runtime/Malware) according to the situation?
- [ ] Did you check Inspector's scanning preconditions (SSM management, ECR continuous)?
- [ ] Did you position Detective accurately as an investigation tool, not a detection tool?
- [ ] Did you understand Security Hub as an aggregation and orchestration hub (ASFF)?
- [ ] Did you align the delegated administrator of every detection service to the Security Tooling account + auto-enable?
- [ ] Did you bind multi-Region and automated response together with an aggregation Region and EventBridge automation?

---

## 📝 Practice Questions

**Question 1.** An internet-exposed EC2 instance appears to be compromised. In a 50-account organization, you want to (a) know weaknesses in advance, (b) detect attacks, (c) investigate the root cause, and (d) automatically isolate and create tickets. What is the most appropriate integrated design?

A) Turn on only GuardDuty and handle the rest manually  
B) Inspector (vulnerabilities) + GuardDuty (threats) + Detective (investigation) + Security Hub aggregation → EventBridge → Lambda/SSM automatic response, all delegated to the Security Tooling account  
C) Handle everything with only WAF and Shield  
D) Have people analyze by manually querying CloudTrail logs with Athena  

**Answer: B**  
Explanation: The four requirements correspond to different detection capabilities, so specialized tools must be integrated. Inspector handles weaknesses in advance, GuardDuty handles attacks, and Detective handles root cause; Security Hub aggregates in ASFF and triggers isolation and ticket automation via EventBridge; and delegating all services to the Security Tooling account provides multi-account consistency. GuardDuty alone, WAF/Shield (prevention), and manual Athena analysis cannot satisfy this integrated requirement.

---

**Question 2.** An analyst designed "detect threats in real time and block malicious traffic with Amazon Detective." What is the error in this design?

A) Detective does not work in multi-account setups  
B) Detective neither detects nor blocks; it is a tool for investigating and analyzing the root cause of existing findings and logs - detection is GuardDuty's role and blocking is WAF/SG's role  
C) Detective supports only EC2  
D) Detective is too expensive  

**Answer: B**  
Explanation: Detective does not generate findings or block traffic; it is an investigation-only tool that analyzes the findings and logs created by GuardDuty and others as a behavior graph to answer "why, how far, and how." Threat detection is GuardDuty, and blocking is the role of WAF/SG/NACL. Detective supports multi-account and handles various entities beyond EC2, so the other options are wrong.

---

**Question 3.** After you turned on Inspector, some EC2 instances are not scanned, and GuardDuty does not detect malicious processes inside the host. What is the correct combination of fixes for the two problems?

A) For Inspector, check the SSM managed state (or agentless); for GuardDuty, enable Runtime Monitoring  
B) Storing VPC Flow Logs in S3 solves both  
C) For Inspector, turn on ECR continuous; for GuardDuty, add a Trusted IP  
D) Simply turning on Security Hub solves both automatically  

**Answer: A**  
Explanation: Inspector's agent-based EC2 scanning requires the instance to be managed by SSM, so check the SSM status (or use agentless), and since basic GuardDuty sees only network/API, visibility into processes inside the host is obtained with Runtime Monitoring. Storing Flow Logs, ECR continuous (for images), Trusted IP (finding suppression), and Security Hub (aggregation) are not direct fixes for these two problems.

---

**Question 4.** In a multi-Region, multi-account organization, you want new accounts to be automatically included in detection, to view all Region findings in a single pane, and to prevent workload teams from turning detection off. What is the most appropriate baseline?

A) Manually turn on services in each account and Region and switch between consoles  
B) Delegate detection services to the Security Tooling account + auto-enable + configure a Security Hub aggregation Region  
C) Operate everything directly in the management account  
D) Receive findings only by email  

**Answer: B**  
Explanation: A delegated administrator (Security Tooling account) + organization mode auto-enable achieves both automatic inclusion of new accounts and prevention of members disabling arbitrarily, and the Security Hub aggregation Region aggregates multi-Region findings into a single Region. Manual activation and console hopping create blind spots, operating directly in the management account risks concentrating privileges, and merely receiving email makes integration and automation impossible.

---

**Question 5.** Which of the following is NOT frequently cited as a "pitfall" in this week's detection integration?

A) Mistaking Detective for a threat detection and blocking tool  
B) Assuming basic GuardDuty alone sees processes inside the host  
C) Aligning the delegated administrator of all detection services to the same Security Tooling account and turning on auto-enable  
D) Assuming Security Hub findings are visible globally across all Regions  

**Answer: C**  
Explanation: Delegating all detection services to the same Security Tooling account and turning on auto-enable is not a pitfall but the *recommended baseline* - it ensures consistency of data, permissions, and investigation, and automatic inclusion of new accounts. The rest are all genuinely frequent pitfalls: Detective is an investigation tool and not for detection or blocking, basic GuardDuty cannot see inside the host (Runtime Monitoring is needed), and Security Hub findings are per Region, so an aggregation Region is needed. Because the question asks you to choose what is *not* a pitfall, the answer is the delegated alignment configuration.

---
