# Day 3 - Amazon Inspector: EC2/ECR/Lambda Vulnerability Scanning, CVE, Automated Assessment

If GuardDuty sees "someone is performing malicious activity right now," Amazon Inspector sees "where are we weak *before* we are exploited." That is, if GuardDuty is *threat* detection, Inspector is *vulnerability* detection. The two points in time differ — a vulnerability is a potential weakness, and a threat is the actual activity targeting that weakness (or entering by another path). Security operations needs both: reduce weaknesses (Inspector), and catch it when breached (GuardDuty).

The essence of Inspector (the current Amazon Inspector, commonly called "Inspector v2") is that it "**automatically and continuously** scans resources to find known vulnerabilities (CVEs) and dangerous exposures, and assigns a **priority score** that reflects environmental context." Unlike the old v1, where you ran assessments manually, once enabled it rescans on its own as new resources and new CVE disclosures arrive.

## What It Scans: Three Targets

```
Amazon Inspector scan targets
  ├─ EC2 instances         → OS package CVEs + network reachability
  ├─ ECR container images  → OS/language package CVEs in image layers
  └─ Lambda functions      → Function code + dependency package CVEs (+ code vulnerabilities)
```

- **EC2**: Looks at two things — (1) **CVEs** in installed OS/application packages, and (2) **network reachability analysis** (can this port be reached from the internet?). A reachable vulnerability is more dangerous.
- **ECR**: Scans pushed container images. **on-push** (once at push) + **continuous (ongoing rescan)** options. When a new CVE is disclosed, it re-evaluates images that were already pushed.
- **Lambda**: Vulnerabilities in the function's dependency packages (standard scanning) + optionally vulnerabilities in the code itself (code scanning, e.g., hardcoded secrets, injection patterns).

### The Questions Each Detection Service Answers

The four services of week9 look at the same account yet answer completely different questions. You must place Inspector on this coordinate system to avoid wrong answers on the exam.

| Service | What it looks at | Question it answers | When the signal arises |
|---------|------------------|---------------------|------------------------|
| **Inspector** | Packages, image layers, function dependencies, network reachability | "Where can we **be exploited**?" | At resource creation + when a new CVE is disclosed |
| **GuardDuty** | CloudTrail, VPC Flow, DNS, (optional) runtime | "Is there **malicious activity** right now?" | The moment the activity happens |
| **Macie** | The content of S3 objects | "Where is the **sensitive data**?" | When a scan job runs |
| **Detective** | A graph connecting the signals above + logs | "**Why and how far** did it spread?" | When investigating |

The key contrast is **"weakness vs behavior."** An Inspector finding exists even if no one is attacking, and a GuardDuty finding arises only when someone does something. So the count of Inspector findings has the character of *debt that keeps accumulating if you do not patch*, while GuardDuty findings have the character of *events*. The operating mode differs too — the former is managed as a backlog, the latter is handled by on-call.

> ⚠️ **Pitfall**: "The EC2 instance seems compromised, so scan it with Inspector" is wrong. Inspector does not tell you *whether it has been compromised* — it only gives a list of vulnerable packages. Finding malicious files on an already infected host is **GuardDuty Malware Protection**, and catching malicious behavior is foundational GuardDuty/Runtime Monitoring. Conversely, choosing GuardDuty for "check whether our assets are exposed to a newly disclosed CVE" is also wrong.

## How It Scans: SSM Agent and Agentless

There are two methods for scanning EC2:
- **Agent-based**: Collects the in-instance package inventory through the **SSM Agent** (Systems Manager). If the instance is managed by SSM, it works with no additional installation.
- **Agentless**: Takes an EBS snapshot and analyzes it (also covers instances without SSM). Inspector chooses appropriately in a hybrid fashion.

> ⚠️ **Pitfall**: A common cause of "I registered the EC2 instance with Inspector but it isn't being scanned" is **the SSM Agent not being installed/not being managed**. Agent-based scanning requires the instance to be managed by SSM (SSM Agent running + an appropriate instance profile IAM role + SSM connectivity). On the exam, "Inspector cannot scan the instance → check SSM managed status" is a classic question.

```
EC2 ── SSM Agent ── Systems Manager ── Inspector (collect package inventory, evaluate CVEs)
      or
EC2 ── (no SSM) ── Inspector agentless (EBS snapshot analysis)
```

Vulnerability management belongs to NIST's *Identify (ID.RA, risk assessment)* function. The core is the continuous loop of "discover → assess → prioritize → remediate → verify." The old Inspector did *periodic assessments*, but the current Inspector is *continuous* — and this matters because the vulnerability landscape is not static. An image that was clean yesterday can become vulnerable today through a new CVE disclosure. Only continuous scanning keeps up with "new risk in already deployed assets."

## CVE and Prioritization: Inspector score vs CVSS

Inspector attaches a **CVE** identifier and a **CVSS** base score to discovered vulnerabilities. But prioritizing by plain CVSS alone is noisy. Inspector computes its own **Inspector score** that reflects environmental context:

```
Inspector priority = CVSS base score
                   × network reachability (can it be reached from the internet?)
                   × exploitability (does a known exploit exist?)
                   × ... environmental context
```

Example: even for the same CVSS 9.0, (a) a vulnerability reachable from a port exposed to the internet with a public exploit is the top priority, and (b) an unreachable vulnerability in an isolated subnet is lower priority. This *context-based prioritization* tells the analyst "what to patch first."

This is *risk-based vulnerability management*. Since you cannot patch thousands of vulnerabilities at once, you weight risk by "exploitability × exposure × impact" to set priority. CVSS is the severity of the vulnerability *itself*, and the Inspector score is the risk *in our environment* — external signals such as EPSS (Exploit Prediction Scoring System) and KEV (Known Exploited Vulnerabilities) are also used in this weighting.

### Reading a Real Finding Line by Line — The Fields That Decide What to Patch First

An Inspector finding does not end at "there is a CVE." **Which fields you look at to set priority** is the substance of practice and the exam.

```json
{
  "findingArn": "arn:aws:inspector2:ap-northeast-2:111122223333:finding/0a1b2c3d4e5f",
  "awsAccountId": "111122223333",
  "type": "PACKAGE_VULNERABILITY",
  "severity": "CRITICAL",
  "status": "ACTIVE",
  "title": "CVE-2021-44228 - org.apache.logging.log4j:log4j-core",
  "firstObservedAt": "2026-02-11T03:20:11Z",
  "lastObservedAt": "2026-03-14T01:02:44Z",
  "inspectorScore": 9.8,
  "inspectorScoreDetails": {
    "adjustedCvss": {
      "score": 9.8,
      "scoringVector": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H",
      "adjustments": [
        { "metric": "Attack Vector", "reason": "Reachable from the internet" }
      ]
    }
  },
  "exploitAvailable": "YES",
  "fixAvailable": "YES",
  "epss": { "score": 0.9741 },
  "packageVulnerabilityDetails": {
    "vulnerabilityId": "CVE-2021-44228",
    "source": "NVD",
    "vulnerablePackages": [
      {
        "name": "log4j-core", "version": "2.14.1",
        "packageManager": "JAR", "filePath": "/opt/app/lib/log4j-core-2.14.1.jar",
        "fixedInVersion": "2.15.0",
        "remediation": "Update log4j-core to 2.15.0 or later"
      }
    ]
  },
  "resources": [
    {
      "type": "AWS_ECR_CONTAINER_IMAGE",
      "id": "arn:aws:ecr:ap-northeast-2:111122223333:repository/payments-api/sha256:abcd...",
      "details": { "awsEcrContainerImage": { "repositoryName": "payments-api", "imageTags": ["prod", "v2026.02.10"] } }
    }
  ]
}
```

| Field | Why this field changes priority |
|-------|---------------------------------|
| `type: PACKAGE_VULNERABILITY` | It is one of three types — `PACKAGE_VULNERABILITY` (package CVE), `NETWORK_REACHABILITY` (a reachable open path), `CODE_VULNERABILITY` (the Lambda code itself). The responsible teams differ: patching team / network team / development team. |
| `severity: CRITICAL` vs `inspectorScore: 9.8` | severity is a label, while `inspectorScore` is the **environment-adjusted score**. Even the same CVE can have different scores per instance. |
| `adjustments[].reason: "Reachable from the internet"` | **Why the score was adjusted is stated explicitly.** This one sentence is the basis for "ahead of the same CVE in an isolated subnet." |
| `exploitAvailable: "YES"` | A public exploit exists. It is not a theoretical risk but a **risk anyone can execute**. |
| `fixAvailable: "YES"` | A way to fix it *exists*. If `NO`, the direction changes from patching to mitigation (WAF rules, configuration changes, isolation). If `PARTIAL`, only some packages can be fixed. |
| `epss.score: 0.9741` | An estimate of the probability of actual exploitation in the future. **0.97 is close to "it will be attacked soon."** If CVSS is severity, EPSS is imminence. |
| `vulnerablePackages[].fixedInVersion` + `filePath` | **Exactly what to upgrade, where, and to which version.** Information that goes straight into the ticket. |
| `resources[].imageTags: ["prod", ...]` | This image **carries a production tag**. Even for the same CVE, it takes precedence over an image with a dev tag. |
| `firstObservedAt` vs `lastObservedAt` | A month has passed since first discovery and it is still `ACTIVE` — it reveals an **SLA-violating backlog**. |

The judgment from this one case is much more concrete than "it's CRITICAL so it's urgent": *internet reachable + public exploit exists + EPSS 0.97 + production tag + a fix version exists*. All four weighting factors are at their worst and the solution is clear, so this is **top priority without debate**. Conversely, even for the same CVE, if it is `exploitAvailable: NO`, in an isolated subnet, with a dev tag, it can be deferred to the next regular patch cycle.

CVSS, EPSS, and KEV are not substitutes for one another but **three indicators answering different questions**. CVSS says "how bad is it if breached" (impact), EPSS says "what is the probability of actually being breached" (likelihood), and KEV (the Known Exploited Vulnerabilities catalog) says "is it already being used in real attacks" (reality). The typical way vulnerability management fails is lining everything up by CVSS alone — there are thousands of vulnerabilities in the CVSS 9 range, but only a tiny fraction of them are actually exploited. If you call everything urgent, it is the same as nothing being urgent. This is exactly why the Inspector score multiplies in reachability and exploit existence, and **the ability to prioritize is vulnerability management competence**.

A detection finding of type `NETWORK_REACHABILITY` does not mean "there is a CVE." **It occurs even without a vulnerability** — for example, the very fact that an SG leaves a management port open to 0.0.0.0/0 becomes a finding. This is the answer to the situation "Inspector says there is nothing to patch but a finding appeared," and the response is not patching but **fixing the network configuration**. This type is more accurate than a simple SG audit in that it computes "can this port actually be reached from the internet" by combining SGs, NACLs, routing, and the IGW.

The 2017 Equifax breach is the standard textbook for a vulnerability management failure. The cause was not a zero-day but an **Apache Struts vulnerability (CVE-2017-5638) for which a patch was already available**, and despite the advisory, it was left unpatched in an internet-facing application. The point of failure was not "we didn't know about the vulnerability" but an inventory gap: **"we didn't know which assets had that component installed."** The reason security teams around the world stayed up for several nights during Log4Shell (CVE-2021-44228) in 2021 is the same — most of the time went not to the vulnerability itself but to answering "where in our estate is log4j?" The problem Inspector's continuous scanning solves is exactly this point. When a new CVE is disclosed, it **retroactively re-evaluates already deployed assets and already pushed images** and automatically answers "which of ours are affected." The lesson is that **the bottleneck of vulnerability management is not patching but inventory**.

## Automated Assessment and Integration

Inspector's operational value comes from *automation*:

```
Inspector (continuous scanning)
   │  Finding
   ├─▶ Security Hub (automatic integration, ASFF standardization)
   ├─▶ EventBridge ──▶ Lambda/SSM (automatic patch, ticket, isolation)
   └─▶ Inspector console (dashboard, sorted by risk score)
```

- New resource (EC2 launch, ECR push, Lambda deployment) → automatic scan.
- New CVE disclosure → automatic re-evaluation of affected existing assets.
- Finding → automatic aggregation in Security Hub + response automation via EventBridge (for example, automatic patching with SSM Patch Manager, or Jira ticket creation).

If you turn on **only on-push** for ECR scanning, you miss images that were clean at *push time* but became vulnerable to a CVE disclosed *afterward*. The answer to "keep up with new vulnerabilities in old images" is enabling **continuous (enhanced) scanning** + setting a retention period.

### Real CLI: Enabling, Querying, Gating

```bash
# 1) Turn on Inspector in this account and Region — explicitly choose the scan targets
aws inspector2 enable \
  --resource-types EC2 ECR LAMBDA LAMBDA_CODE

# 2) Check scan coverage = the first command for "why isn't that instance being scanned"
aws inspector2 list-coverage \
  --filter-criteria '{"resourceType":[{"comparison":"EQUALS","value":"AWS_EC2_INSTANCE"}]}' \
  --query 'coveredResources[].{Id:resourceId,Status:scanStatus.statusCode,
                               Reason:scanStatus.reason,Type:scanType}'
```

The `scanStatus.reason` in `list-coverage` is the heart of diagnosis. `UNMANAGED_EC2_INSTANCE` means it is not in SSM managed state, `NO_INVENTORY` means SSM is attached but inventory collection has not happened yet, and `SCAN_ELIGIBILITY_EXPIRED`, `RESOURCE_TERMINATED`, and the like are problems on the asset side. **When you receive a report that "Inspector isn't scanning," run this command first, not the console.**

```bash
# 3) Filter to only what must be handled right now:
#    Critical + exploit exists + a fix is available
aws inspector2 list-findings \
  --filter-criteria '{
    "severity":         [{"comparison":"EQUALS","value":"CRITICAL"}],
    "exploitAvailable": [{"comparison":"EQUALS","value":"YES"}],
    "fixAvailable":     [{"comparison":"EQUALS","value":"YES"}]
  }' \
  --sort-criteria '{"field":"INSPECTOR_SCORE","sortOrder":"DESC"}'

# 4) Export a report for audit and reporting (requires S3 + KMS)
aws inspector2 create-findings-report \
  --report-format CSV \
  --s3-destination bucketName=sec-reports-111122223333,keyPrefix=inspector/,kmsKeyArn=arn:aws:kms:ap-northeast-2:111122223333:key/abcd-1234
```

Organization deployment follows the same two-step pattern as GuardDuty, but differs in that **auto-enable is specified separately for each scan type**.

```bash
# (Management account) Designate the Inspector delegated administrator
aws inspector2 enable-delegated-admin-account \
  --delegated-admin-account-id 999988887777

# (Delegated administrator) Include new accounts automatically + which scans to turn on
aws inspector2 update-organization-configuration \
  --auto-enable ec2=true,ecr=true,lambda=true,lambdaCode=true
```

In `--auto-enable`, `lambda` and `lambdaCode` are **different things**. `lambda` is vulnerabilities in the function's *dependency packages* (standard scanning), and `lambdaCode` is vulnerabilities in the *function code itself* (hardcoded secrets, injection patterns, and so on). The cause of the symptom "I turned on Lambda scanning but it doesn't find credentials embedded in the code" is here. Likewise, turning on EC2 does not turn on ECR — **each scan target is enabled independently.**

### CI/CD Gating: Don't Let Vulnerabilities Reach Production

The point at which Inspector's value is greatest is not discovery but **blocking deployment**. Right after an ECR push, the pipeline reads the scan results and fails the deployment if the criteria are exceeded.

```
[ Shift-left gating pipeline ]

  Developer push
      │
      ▼
  CI build ──▶ ECR push
                │  (Inspector on-push scan runs automatically)
                ▼
        EventBridge: ECR Image Scan complete event
                │
                ├── Critical & exploitAvailable=YES  ──▶ Deployment pipeline FAIL
                │                                        + automatically create a dev team ticket
                └── Pass                              ──▶ Deployment proceeds
                                                          │
                                                          ▼
                                             Continuous scanning keeps watching
                                             (re-evaluates already deployed images when a new CVE is disclosed)
                                                          │
                                                          └─▶ Security Hub → EventBridge
                                                                 → SSM Patch Manager / rebuild trigger
```

The point of this diagram is that **both the left gate and the right watch are needed**. With only the gate, you miss an image that was clean at deploy time becoming vulnerable a month later (the state with only on-push turned on), and with only the watch, you keep pushing already known vulnerabilities into production. This is why you turn on `on-push + continuous` together.

> 🎯 **Scenario**: If it says "Block production deployment if a container image has a critical CVE, do not miss CVEs newly disclosed after deployment, and automatically patch the affected EC2 instances," the answer is a **combination of three pieces**. (1) ECR **on-push scan + CI gate** to block deployment (shift-left), (2) ECR **continuous scan** to retroactively re-evaluate CVEs disclosed afterward, (3) EC2 findings → **Security Hub → EventBridge → SSM Patch Manager** to automate remediation. Here the option "Inspector patches directly" is wrong — Inspector only diagnoses, and SSM does the prescribing. Also "block deployment with GuardDuty" is wrong (GuardDuty does not look at vulnerabilities).

The hardest decision in practice when setting a deployment gate is **where to set the baseline**. If you start with "fail if there is even one critical," most base images get caught immediately and the pipeline stops, and the team soon creates ways around the gate — then the control exists but does not work. A realistic path in is (1) first only *warn* while measuring the current state, (2) make only findings with `exploitAvailable=YES` **and** `fixAvailable=YES` the blocking targets (block only what can be fixed but wasn't), (3) replace base images with minimal images to reduce the number of packages in the first place, and (4) tighten the criteria in stages. **A gate that blocks deployment over vulnerabilities that cannot be fixed does not raise security; it creates a culture of circumvention** — this is why policy design in vulnerability management is as important as tool selection.

## Multi-Account: Delegated Administrator Consistency

Inspector also follows the **Organizations + delegated administrator** pattern. Aligning the **same Security Tooling account** as the Inspector delegated administrator as for GuardDuty/Detective/Security Hub is the recommended configuration of the multi-account baseline:

```
Management account ──designates──▶ Inspector delegated administrator (Security Tooling account)
                          ├─ Enable Inspector in all organization accounts + auto-enable
                          ├─ Central policy for per-account scan targets (EC2/ECR/Lambda)
                          └─ Centrally aggregate all findings
```

If you see Inspector as a standalone vulnerability scanner, it becomes "yet another report generator." It must be connected to the *remediation loop* — Inspector finding → Security Hub aggregation → EventBridge → SSM Patch Manager (automatic patching) or an ECR image rebuild pipeline (blocking vulnerable image deployment in CI/CD). In particular, using ECR scan results as a gate in CI/CD (fail the deployment if there is a critical CVE) becomes shift-left that blocks "before vulnerabilities reach production."

## Distinctions Often Gotten Wrong

- **Inspector vs GuardDuty**: Inspector covers *vulnerabilities* (exploitable weaknesses, proactive prevention), GuardDuty covers *threats* (actual malicious activity, detection). The timing and target differ.
- **Inspector vs Patch Manager (SSM)**: Inspector does *discovery* (what is vulnerable), Patch Manager does *remediation* (applying patches). Inspector diagnoses, Patch Manager prescribes. Connect the two with EventBridge.
- **Inspector vs Config**: Config checks *configuration compliance* (do the settings conform to policy), Inspector checks *software vulnerabilities* (CVEs). Different axes.
- **Inspector v1 vs current**: v1 is agents, manual assessments, and rules packages; the current version is SSM/agentless, continuous scanning, automatic. The current one is the default.
- **Inspector vs ECR basic scanning**: ECR's own basic scanning is a limited scan mostly of OS packages, and Inspector integration (enhanced scanning) provides language packages, continuous re-evaluation, and context scoring. If "CVEs disclosed afterward" is the condition, it is the enhanced one.
- **Inspector vs Macie**: Vulnerabilities (weaknesses in code and packages) vs sensitive data (content). That Lambda code scanning finds "hardcoded secrets" does not replace Macie's role — the target is Lambda code, not S3 objects.

## Prerequisites by Scan Target at a Glance

How the exam asks "why isn't it being scanned" differs per target. Memorizing the prerequisites separately per target is safest.

| Target | To be scanned, it needs | Typical cause when it isn't |
|--------|-------------------------|-----------------------------|
| **EC2 (agent-based)** | SSM Agent running + an instance profile with SSM permissions + SSM connectivity (endpoint reachability) | Instance profile not attached, no SSM VPC endpoint in a private subnet |
| **EC2 (agentless)** | Supported OS and volume state, EBS snapshot access | Insufficient permissions on a customer managed KMS key |
| **ECR** | Enhanced scanning configured on the repository | Only on-push turned on (misses later CVEs), excluded by the scan target filter |
| **Lambda** | The function is on a supported runtime | For code vulnerabilities, `lambdaCode` must be turned on separately |

The real cause of an EC2 instance in a private subnet not being scanned is usually not the "Inspector settings" but the **SSM connectivity path**. For the SSM Agent to reach the Systems Manager endpoints, a NAT gateway or the `ssm`, `ssmmessages`, and `ec2messages` VPC endpoints are needed. No matter how you change settings in the Inspector screen, the inventory will not come up without this path. When the exam adds the condition "a subnet with no internet access," you should recall this chain.

## Summary

Inspector is summarized in the one line "a CVE scanner," but what the exam actually asks is what comes before and after it.

- **Boundary** — Inspector looks at *weaknesses* and does not see *behavior*. Whether a compromise occurred, malicious files, and sensitive data are the respective domains of GuardDuty, Malware Protection, and Macie. And it only discovers and **does not fix** — remediation is done by SSM Patch Manager or an image rebuild pipeline.
- **Prerequisites** — EC2 managed by SSM (or agentless), ECR continuous, Lambda code scanning enabled separately. The problem "I turned it on but nothing shows up" is almost always one of these prerequisites missing.
- **Priority** — Lining up by CVSS alone fails. The intent of the Inspector score is to multiply reachability, exploit existence, fixability, and production tag to convert to *risk in our environment*, and that is the way of judging in practice.
- **Loop** — There must be a cycle that closes through finding → Security Hub aggregation → EventBridge → automated remediation → rescan for the vulnerability count to fall. A state where only reports pile up and the backlog grows is a failure of process, not of the tool.

For both Equifax and Log4Shell, the problem was not "there was no patch" but **"not knowing where it was."** The essence of continuous scanning is automatically answering the inventory question each time a new CVE appears, and so Inspector is, before being a scanner, an **asset visibility tool**.

### One-Line Summary Checklist

- [ ] Did you turn on EC2/ECR/Lambda scanning as needed, and verify SSM managed status (or agentless) for EC2?
- [ ] Does ECR use continuous scanning to keep up with CVEs disclosed afterward?
- [ ] Do you handle reachable and exploitable vulnerabilities first, using the Inspector score (context-based priority)?
- [ ] Did you automate remediation by connecting findings to Security Hub, EventBridge, and SSM Patch Manager?
- [ ] Did you align the organization delegated administrator (Security Tooling account) with the other detection services?

---

## 📝 Practice Questions

**Question 1.** The security team registered EC2 instances with Amazon Inspector, but some instances are not being scanned. When using agent-based scanning, what should be checked first?

A) Whether the instance's security group opens all ports  
B) Whether the instance is in a Systems Manager managed state, with the SSM Agent running and an appropriate IAM instance profile  
C) Whether the instance has a public IP  
D) Whether the instance is in us-east-1  

**Answer: B**  
Explanation: Inspector's agent-based EC2 scanning can collect the package inventory only if the instance is managed by SSM. Therefore, first check whether the SSM Agent is running, the instance profile with SSM permissions, and the SSM connection status (or substitute agentless scanning). Open security groups, public IPs, and specific Regions are not key conditions for scannability.

---

**Question 2.** A container image stored in ECR had no vulnerabilities when pushed but has since become vulnerable to a newly published CVE. How can this be caught up automatically?

A) Enable ECR scanning on-push only (one time)  
B) Enable ECR continuous scanning so that existing images are automatically re-evaluated when a new CVE is published  
C) Manually push the image again each time  
D) Turn on GuardDuty Malware Protection  

**Answer: B**  
Explanation: On-push scanning evaluates only at push time, so it misses CVEs published afterward. Continuous scanning automatically re-evaluates already-pushed images when a new CVE appears, catching up with post-push vulnerabilities. Manual re-pushing is impractical, and GuardDuty Malware Protection is malware scanning, not CVE vulnerability management.

---

**Question 3.** Of two vulnerabilities that both have a CVSS of 9.0, you are asked to patch only one first. Which one does Amazon Inspector rank at a higher priority?

A) A vulnerability in an isolated private subnet that cannot be reached from the internet  
B) A vulnerability exposed on a port reachable from the internet with a public exploit available  
C) The priority of the two vulnerabilities is always the same  
D) The more recently discovered vulnerability always takes priority  

**Answer: B**  
Explanation: The Inspector score weights risk by multiplying the CVSS base score by environmental context such as network reachability and exploitability. Even with the same CVSS, a vulnerability that is internet-reachable and has a public exploit carries much greater real risk, so it has higher priority. An unreachable vulnerability is lower priority, and priority is not determined merely by when it was discovered.

---

**Question 4.** You want to build a remediation pipeline that receives Inspector vulnerability findings and automatically applies patches to the affected EC2 instances. What is the most appropriate integration?

A) Inspector finding → EventBridge → automatic patching with SSM Patch Manager  
B) Inspector patches the instance directly  
C) Inspector finding → Macie → automatic patching  
D) Inspector → Detective → automatic patching  

**Answer: A**  
Explanation: Inspector only discovers (diagnoses); remediation is done by other services. The canonical remediation automation pipeline receives the finding through EventBridge and applies patches automatically with SSM Patch Manager (or Lambda). Inspector does not patch directly, and Macie is data classification and Detective is an investigation tool, both unrelated to patch remediation.

---

**Question 5.** Which statement most accurately describes the difference between the roles of Amazon Inspector and GuardDuty?

A) Both block malicious traffic in real time in the same way  
B) Inspector proactively discovers exploitable vulnerabilities (CVEs, etc.), and GuardDuty detects actual malicious activity (threats)  
C) Inspector handles threats, and GuardDuty handles vulnerabilities  
D) Inspector classifies S3 PII, and GuardDuty scans for CVEs  

**Answer: B**  
Explanation: Inspector proactively finds and prioritizes vulnerabilities (weaknesses) in EC2/ECR/Lambda, while GuardDuty detects actual threat activity such as credential misuse and malicious communication - a complementary relationship of prevention (reducing weaknesses) and detection (catching attacks). C has the roles reversed, neither blocks traffic, and PII classification belongs to Macie.

---
