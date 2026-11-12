# Day 4 - Detection Integration: GuardDuty + Security Hub + Detective + Inspector One Picture, Multi-Account Detection Baseline

Over the past three days we looked at the individual tools of the detection layer: GuardDuty (threat detection), Detective (investigation), and Inspector (vulnerabilities). In real security operations, however, these are not used *separately* — if each pours out its own findings, an analyst moves between four consoles and sees the same incident four times. Today's topic is binding these tools into **one coherent detection architecture**. The glue is **AWS Security Hub**.

The key insight: GuardDuty, Inspector, Detective, Macie, IAM Access Analyzer, and the rest are each *specialist detectors*, while Security Hub is the **aggregation and orchestration hub** that *gathers their output in a standard format and prioritizes, correlates, and automates it in one view*. The exam repeatedly asks "how do you consolidate these signals into a single operations pane?"

## Security Hub: The Center of Aggregation and ASFF

Security Hub's two functions:

```
1) Security Standards: Automatically evaluates compliance controls of
   CIS, AWS FSBP, PCI DSS, NIST, and others → "does the configuration meet best practice?"

2) Findings aggregation: Standardizes the findings of integrated services into
   ASFF (AWS Security Finding Format) and collects them in one place
```

**ASFF (AWS Security Finding Format)** is the key to integration. GuardDuty detection findings, Inspector findings, and Macie findings originally come in different formats, and Security Hub normalizes them into a *common JSON schema (ASFF)*. Thanks to this, even when the sources differ, you can search, filter, and correlate with the same fields (severity, resource, type).

```
GuardDuty ─┐
Inspector ─┤
Macie     ─┼─▶ Security Hub ─(ASFF normalization)─▶ Single findings view
Access Analyzer ┤                                    ├─ Sort/filter by severity and resource
Third party (partners) ┘                             ├─ Insights (correlation groups)
                                                     └─ Published to EventBridge
```

This is a cloud-native implementation of the *SIEM/SOAR* paradigm. SIEM (Security Information and Event Management) *normalizes and aggregates* scattered security events, and SOAR (Security Orchestration, Automation and Response) layers *automated response* on top. Security Hub normalizes with ASFF (the normalization layer of a SIEM) and triggers response (SOAR) with EventBridge and automation rules. Without a standard schema, correlation and automation are impossible because every tool has a different format — ASFF is that common language.

### ASFF in the Flesh: Same Incident, Different Shell, Same Schema

What the GuardDuty finding seen on day1 looks like once it enters Security Hub is the substance of integration.

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/12abc.../finding/ac1b2c...",
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty",
  "GeneratorId": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/12abc34d567e8fa901bc2d34e56789f0",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:IAMUser-InstanceCredentialExfiltration.OutsideAWS"],
  "CreatedAt": "2026-03-14T02:11:07Z",
  "UpdatedAt": "2026-03-14T02:29:52Z",
  "Severity": { "Label": "HIGH", "Normalized": 80, "Original": "8" },
  "Title": "Credentials created exclusively for an EC2 instance are being used from an external IP address.",
  "Resources": [
    {
      "Type": "AwsIamAccessKey",
      "Id": "AWS::IAM::AccessKey:ASIAEXAMPLEKEYID",
      "Region": "ap-northeast-2",
      "Details": {
        "AwsIamAccessKey": {
          "PrincipalId": "AROAEXAMPLE:i-0abc123def4567890",
          "PrincipalType": "AssumedRole",
          "PrincipalName": "app-server-role"
        }
      }
    }
  ],
  "ProductFields": {
    "aws/guardduty/service/action/awsApiCallAction/api": "ListBuckets",
    "aws/guardduty/service/action/awsApiCallAction/remoteIpDetails/ipAddressV4": "198.51.100.24",
    "aws/securityhub/ProductName": "GuardDuty"
  },
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE"
}
```

The grammar of integration is revealed here.

| ASFF field | What it does in integration |
|------------|-----------------------------|
| `ProductArn` | **Which detector created it.** This one field distinguishes GuardDuty, Inspector, Macie, and third parties, and becomes the basis for filtering and routing. |
| `Types` | Re-expresses the original service's type name in a **common taxonomy**. GuardDuty's `UnauthorizedAccess:...` maps to `TTPs/Initial Access/...`. Even when the sources differ, they can be sorted along the same axis. |
| `Severity.Normalized` | **A 0–100 normalized score.** GuardDuty uses 0.1–8.9 and Inspector uses CVSS 0–10, and these must be placed on one scale to sort "what is riskiest right now." The original value is preserved in `Original`. |
| `Resources[]` | Expresses **which resource it is** with standard types (`AwsIamAccessKey`, `AwsEc2Instance`, `AwsS3Bucket`…). The key to correlation that groups the findings of different detectors by the *same resource*. |
| `ProductFields` | A place to hold the original service's unique information so it is not lost. A guarantee that normalization does not discard information. |
| `Workflow.Status` | `NEW` → `NOTIFIED` → `RESOLVED`/`SUPPRESSED`. Attaches an **operational state** to the finding so it can be used like a ticketing system. |
| `RecordState` | `ACTIVE`/`ARCHIVED`. Beware of confusing it with `Workflow` above — this one is the *survival of the finding itself*, and that one is the *human's processing state*. |

The `Severity.Normalized` scale is a value to memorize: INFORMATIONAL 0, LOW 1–39, MEDIUM 40–69, HIGH 70–89, CRITICAL 90–100. You use these numbers when setting a threshold in an EventBridge rule such as "auto-respond only at 70 or above."

> ⚠️ **Pitfall**: Swapping `Workflow.Status` and `RecordState` is a common mistake. What an analyst marks as "done" is `Workflow.Status = RESOLVED`, and folding away noise is `SUPPRESSED`. `RecordState = ARCHIVED` is the state in which the finding provider (GuardDuty, etc.) has judged it no longer valid and folded it. When you try to kill noise with an automation rule by touching `RecordState`, it does not behave as intended.

### Custom Findings: ASFF Is Not Just for AWS Services

The true extensibility of ASFF lies in the fact that **you can push the findings of your own tools into the same schema**. If you put the results of an in-house static analyzer, your own threat intelligence, or a third-party scanner into Security Hub, the same dashboard and the same automation apply as is.

```bash
aws securityhub batch-import-findings --findings '[
  {
    "SchemaVersion": "2018-10-08",
    "Id": "internal-scanner/2026-03-14/finding-001",
    "ProductArn": "arn:aws:securityhub:ap-northeast-2:111122223333:product/111122223333/default",
    "GeneratorId": "internal-iac-scanner",
    "AwsAccountId": "111122223333",
    "Types": ["Software and Configuration Checks/Vulnerabilities"],
    "CreatedAt": "2026-03-14T05:00:00Z",
    "UpdatedAt": "2026-03-14T05:00:00Z",
    "Severity": { "Label": "HIGH", "Normalized": 75 },
    "Title": "Terraform module allows inbound SSH from 0.0.0.0/0",
    "Description": "In modules/network/sg.tf the management port is defined as open to everyone",
    "Resources": [
      { "Type": "AwsEc2SecurityGroup", "Id": "sg-0a1b2c3d4e5f", "Region": "ap-northeast-2" }
    ],
    "Workflow": { "Status": "NEW" },
    "RecordState": "ACTIVE"
  }
]'
```

What the `ProductArn` format for custom findings (`.../product/<account-ID>/default`) means is that **the account itself is registered as a "product."** Thanks to this design, even as in-house tools multiply, there is no need to change the Security Hub structure, and tools are distinguished by `GeneratorId`. The point where this pays off in practice is not the *dashboard* but the **reuse of automation**. If you already have a pipeline of "if Normalized ≥ 70, page on-call + create a ticket," then when attaching a new tool you do not rewrite the pipeline; you just push into ASFF. The cost savings of an integrated architecture come not from screen consolidation but from **unifying the automation surface**.

## How the Four Tools Cooperate on One Incident

Let us see the four tools collaborate through a single compromise scenario:

```
[Prevention]  Inspector: "This EC2's OpenSSL is vulnerable to a critical CVE + reachable from the internet"
                 │ (Security Hub aggregation — priority patch target)
                 ▼ (attacked before patching)
[Detection]   GuardDuty: "UnauthorizedAccess:EC2/SSHBruteForce → then anomalous outbound"
                 │ (Security Hub aggregation, severity High)
                 ▼
[Investigation] Detective: "This instance's role started IAM API reconnaissance from a new region,
                           the same IP also communicated with other instances — suspected lateral movement"
                 ▼
[Response]    Security Hub → EventBridge → Lambda/SSM:
                 Move instance to isolation SG + forensic snapshot + revoke credentials + ticket
```

- **Inspector** marks the weakness in advance (patch priority).
- **GuardDuty** detects the actual attack.
- **Detective** investigates the root cause and blast radius.
- **Security Hub** gathers all of this on one screen and triggers automated response with **EventBridge**.

> ⚠️ **Pitfall**: GuardDuty and Inspector findings are **automatically integrated** into Security Hub, but you must *enable* the integration (turn it on). Also, Security Hub does not do *investigation* (that is Detective) and does not directly do *threat detection* (that is GuardDuty/Inspector). Security Hub is *aggregation, standardization, and automation orchestration*. Confusing the roles is an easy trap.

## Security Hub Insights and Correlation

Security Hub **Insights** are *saved filters/correlation views* that group findings by a particular criterion. Example: gather findings that are "publicly exposed + critical severity + a specific account" and look at the trend. There are managed Insights, and you can create custom ones. This is a correlation tool that picks out "what is riskiest right now" from thousands of findings.

Also, Security Hub **automation rules** automatically adjust severity, suppress, and update fields according to finding attributes (for example, automatically suppress findings from a known test account). This is an operational device that reduces alert fatigue.

```bash
# Automatically suppress MEDIUM and lower findings in the dev account (noise reduction)
aws securityhub create-automation-rule \
  --rule-name suppress-dev-noise \
  --rule-order 1 \
  --rule-status ENABLED \
  --description "Automatically suppress medium and lower findings in the dev account" \
  --criteria '{
    "AwsAccountId": [{"Value":"444455556666","Comparison":"EQUALS"}],
    "SeverityLabel": [{"Value":"MEDIUM","Comparison":"EQUALS"},
                      {"Value":"LOW","Comparison":"EQUALS"}]
  }' \
  --actions '[{
    "Type":"FINDING_FIELDS_UPDATE",
    "FindingFieldsUpdate":{
      "Workflow":{"Status":"SUPPRESSED"},
      "Note":{"Text":"dev account auto-suppression rule","UpdatedBy":"automation-rule"}
    }
  }]'

# Conversely: raise the severity of findings on resources tagged production to pull them forward
aws securityhub create-automation-rule \
  --rule-name escalate-prod \
  --rule-order 2 --rule-status ENABLED \
  --description "Raise severity of production resource findings" \
  --criteria '{
    "ResourceTags": [{"Key":"Env","Value":"prod","Comparison":"EQUALS"}],
    "SeverityLabel": [{"Value":"HIGH","Comparison":"EQUALS"}]
  }' \
  --actions '[{"Type":"FINDING_FIELDS_UPDATE",
               "FindingFieldsUpdate":{"Severity":{"Label":"CRITICAL"}}}]'
```

Automation rules are **applied at the moment a finding arrives** and are evaluated in `rule-order`. They do not retroactively change past findings that are already stored — that must be done separately with `batch-update-findings`. Also, applying suppression rules broadly creates the illusion that "it got quiet, so it got safer." Suppression is an operational improvement **only when exactly what was folded away and why is documented**; otherwise it is the same as turning off detection. This is why you must always fill in the `Note` field.

> 🎯 **Scenario**: If it says "Findings number in the thousands a day, so analysts cannot process anything. Reduce noise but do not create blind spots," the answer is **suppress/raise with automation rules + extract top risks with Insights**. There are two wrong-answer candidates here. (1) "Put it in the GuardDuty Trusted IP list" — that *does not generate* findings, so it creates a blind spot. (2) "Turn off the integration to reduce the inflow of findings" — a choice that discards source visibility. The form of the correct answer is always **receive all findings but fold them by priority**.

## Multi-Account Detection Baseline: A One-Page Blueprint

The recommended configuration of a detection baseline in an enterprise multi-account setup:

```
AWS Organizations
  │
  ├─ Management account — delegation only, minimal operational burden
  │
  ├─ Security Tooling account ◀── Align the delegated administrator of all detection services
  │     ├─ GuardDuty delegated administrator (organization + auto-enable)
  │     ├─ Security Hub delegated administrator (organization + standards + aggregation)
  │     ├─ Detective delegated administrator (single behavior graph)
  │     ├─ Inspector delegated administrator (EC2/ECR/Lambda continuous scanning)
  │     ├─ Macie / IAM Access Analyzer delegated administrator
  │     └─ Central EventBridge bus → response automation (Lambda/SSM/Step Functions)
  │
  ├─ Log Archive account — immutable retention of CloudTrail/Config/logs (write-once)
  │
  └─ Workload accounts — detection members (cannot turn it off), findings flow to Security Tooling
```

Key principles:
- **Align the delegated administrator of all detection services to the same Security Tooling account** (consistency of data, permissions, and investigation experience).
- **Automatically include new accounts with auto-enable** — no blind spots.
- Use **Security Hub cross-Region aggregation (aggregation Region)** to view findings from multiple Regions in a single Region.
- **Retain logs immutably in a separate Log Archive account** (separate from the detection account — separation of privilege).

This is a core pattern of the AWS *Security Reference Architecture (SRA)*. Delegating security tools to a dedicated account separate from workloads establishes *separation of duties* — workload teams cannot turn off their own detection or delete findings, and logs are retained immutably in a separate account the intruder cannot reach. The SRA emphasizes "do not burden the management account with operations; delegate," because the management account concentrates organization root privilege and is the thing most needing protection.

Security Hub findings are **per Region**. In a multi-Region environment, looking only at one Region's console misses threats in other Regions — you must designate an **aggregation Region** and turn on cross-Region aggregation. Also, designating the delegated administrator must be done *for each service* (GuardDuty delegation separately, Security Hub delegation separately). It is not all delegated at once.

### Standing Up the Baseline with the CLI

```bash
# 1) Turn on Security Hub + automatically enable the default standards (FSBP, etc.)
aws securityhub enable-security-hub --enable-default-standards

# 2) (Management account) Designate the Security Hub delegated administrator — the same account as GuardDuty
aws securityhub enable-organization-admin-account --admin-account-id 999988887777

# 3) (Delegated administrator) Automatically enroll organization accounts
aws securityhub update-organization-configuration --auto-enable --auto-enable-standards DEFAULT

# 4) (Run in the aggregation Region) Gather all Regions' findings into this Region
aws securityhub create-finding-aggregator --region-linking-mode ALL_REGIONS

# 5) Filter to the riskiest things in the organization right now
aws securityhub get-findings \
  --filters '{
    "SeverityLabel":  [{"Value":"CRITICAL","Comparison":"EQUALS"}],
    "WorkflowStatus": [{"Value":"NEW","Comparison":"EQUALS"}],
    "RecordState":    [{"Value":"ACTIVE","Comparison":"EQUALS"}]
  }' \
  --query 'Findings[].{Acct:AwsAccountId,Product:ProductFields."aws/securityhub/ProductName",
                       Title:Title,Res:Resources[0].Id}'

# 6) Close out investigated cases in bulk
aws securityhub batch-update-findings \
  --finding-identifiers '[{"Id":"<finding-id>","ProductArn":"<product-arn>"}]' \
  --workflow Status=RESOLVED \
  --note 'Text=Handled under incident INC-2026-0314,UpdatedBy=soc-analyst'
```

The `create-finding-aggregator` in step 4 **must be run in the Region that will be the aggregation Region**. It is common to run it in any Region and then ask "why isn't it gathering in Seoul?" And aggregation **copies findings over**; it does not replace the Security Hub in the source Region — Security Hub itself must be turned on in each Region, and so the same principle as GuardDuty's "turn it on even in Regions you don't use" holds here too.

### Standards Checks (CSPM) Are a Different Axis from Detection

The side of Security Hub's two faces that is often underestimated is **standards checks**. When you turn on bundles of controls such as the CIS Benchmark, AWS Foundational Security Best Practices (FSBP), PCI DSS, and NIST 800-53, it continuously evaluates whether the account configuration passes each control and produces **control findings**. These findings are also ASFF, but they decisively have different fields.

```json
{
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/securityhub",
  "Types": ["Software and Configuration Checks/Industry and Regulatory Standards/AWS-Foundational-Security-Best-Practices"],
  "Title": "S3.8 S3 general purpose buckets should block public access",
  "Severity": { "Label": "HIGH", "Normalized": 70 },
  "Compliance": { "Status": "FAILED", "SecurityControlId": "S3.8" },
  "Resources": [{ "Type": "AwsS3Bucket", "Id": "arn:aws:s3:::prod-uploads" }],
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE"
}
```

`Compliance.Status` (PASSED/FAILED/WARNING/NOT_AVAILABLE) and `SecurityControlId` are fields that threat findings do not have. That is, it says **"the configuration has deviated from the standard," not "an attack occurred."** The response differs too — not paging on-call but correcting the configuration.

| Axis | Threat finding (GuardDuty, etc.) | Control finding (standards check) |
|------|----------------------------------|-----------------------------------|
| What it says | An incident occurred | The configuration deviated from the standard |
| Key fields | `Types: TTPs/...`, `Severity` | `Compliance.Status`, `SecurityControlId` |
| Condition for disappearing | Archived once the activity stops | **Stays FAILED until fixed** |
| Responder | SOC, on-call | Platform and workload teams |
| Nature of the metric | Number of incidents | **Compliance rate (%)** — managed by trend |

These two axes are *detection* and *posture management (CSPM)*, respectively. Posture management deals with "risks that exist even without an attack," so the metric is not the number of incidents but the **compliance rate**, and improvement is measured linearly. Conversely, if you treat a detection metric like a compliance rate (aiming for zero findings), a wrong optimization of suppression and disabling occurs. **The two axes are gathered on the same screen but must be managed with different KPIs** — this is the first principle to collapse when operating an integrated dashboard.

There is a sentence that recurs in post-mortem reports of major cloud breaches — "the relevant signals were already in the logs." In the 2019 Capital One incident too, what was pointed out as the problem was not only the breach itself but *the time it took to learn of it through an outside tip*, and the 2020 SolarWinds supply chain attack also came to light ultimately when a security firm found an anomaly in its own environment. The common lesson of the two incidents is not the absence of tools but **the absence of a path for signals to reach people**. Even if a detector produces findings, if they are not normalized so they cannot be prioritized, are scattered across consoles and uncorrelated, and do not automatically enter a response queue — it is effectively the same as not having detected. These cases say that the reason for Security Hub-centered integration is not "it's convenient to have one screen" but that it **guarantees a single path for signals to reach people and automation.**

## From Finding to Response: Integrated Automation

The exit of an integrated architecture is always *automated response*:

```
Security Hub (aggregation) ──▶ EventBridge (custom event bus)
                          ├─▶ Lambda: isolate/tag resources, revoke credentials
                          ├─▶ SSM Automation: patch/configuration remediation
                          ├─▶ Step Functions: multi-step response workflow
                          ├─▶ SNS: on-call notification (Slack/PagerDuty)
                          └─▶ Jira/ServiceNow: ticket creation
```

Security Hub publishes the findings of all integrated services as a single EventBridge stream, so *one* response automation can cover multiple detectors — there is no need to write automation separately for each tool (the operational benefit of integration).

Drawing the whole wiring on one page gives the following. This is the picture week9 arrives at.

```
[ 4 detectors → ASFF aggregation → response pipeline: full wiring ]

  ┌─────────────── Workload accounts (members, cannot turn off) ───────────────┐
  │                                                                             │
  │  GuardDuty        Inspector        Macie           Access Analyzer          │
  │  (threat behavior) (vulnerabilities) (sensitive data) (externally exposed   │
  │                                                         permissions)        │
  │      │                │               │               │                     │
  └──────┼────────────────┼───────────────┼───────────────┼─────────────────────┘
         │                │               │               │
         └────────┬───────┴───────┬───────┴───────┬───────┘
                  ▼               ▼               ▼
        ┌─────────────────────────────────────────────────────────┐
        │   Security Hub (Security Tooling account, delegated admin) │
        │   ├─ ASFF normalization: ProductArn / Types / Severity    │
        │   │                Normalized (0–100) / Resources         │
        │   ├─ Standards checks (CSPM): Compliance.Status·ControlId │
        │   ├─ automation rules: suppress · raise · update fields   │
        │   ├─ Insights: correlation views                          │
        │   └─ finding aggregator: all Regions → aggregation Region │
        └───────────────────────┬─────────────────────────────────┘
                                │ Single EventBridge stream
                                ▼
                    ┌───────────────────────┐
                    │  EventBridge rules     │  ← Branch by Severity.Normalized, ProductArn,
                    │  (central event bus)   │     Types, ResourceTags
                    └───┬────┬────┬────┬────┘
                        │    │    │    │
   Reversible auto-action ┘    │    │    └── SNS → on-call (Slack/PagerDuty)
   Lambda: move to isolation SG │    └─────── Jira/ServiceNow ticket
           invalidate session   │
           tag · snapshot       └── SSM Automation: patch · configuration remediation
                                    Step Functions: multi-step response needing an approval gate
                                │
                                ▼
                   ┌─────────────────────────────┐
                   │ Detective (same delegated account) │ ← Human investigation entry point
                   │ Single behavior graph              │   "why, how far"
                   └─────────────────────────────┘

  ┌─ Log Archive account ───────────────────────────────────────────────┐
  │  CloudTrail (organization trail) · Config · VPC Flow → immutable retention │
  │  (separate from the detection account = neither intruder nor operator can delete) │
  └──────────────────────────────────────────────────────────────────────┘
```

There are four points in this diagram that the exam keeps poking. (1) **Many detectors, one aggregation** — a design that writes automation separately per tool is wrong. (2) **Designate the delegated administrator per service but align them to the same account** — distributed delegation is wrong. (3) Without an **aggregation Region**, a multi-Region blind spot. (4) **Logs go to a separate Log Archive account, not the detection account** — separation of privilege.

The criterion for what can and cannot go into the "automatic action" box in the diagram above is **reversibility**. Moving to an isolation SG, tagging, snapshots, and session invalidation can be undone even if the finding was a false positive, but **terminating an instance, deleting a volume, and deleting a role** cannot be undone and also destroy forensic evidence. On the exam, the wrong options in "automated response design" questions are usually those that put irreversible actions into unattended automation. Route irreversible actions through an approval step in Step Functions or a ticket so that they **pass through a human once**.

The real value of integration is not the slogan "single pane of glass" but *correlation* and the *unification of automation*. If you operate the four tools separately, (1) you see the same incident four times, (2) you maintain four sets of automation, one per tool, and (3) you must piece together the whole picture of the incident (vulnerability → attack → impact) by hand. Security Hub-centered integration binds correlation via ASFF, unification of automation via EventBridge, and investigation depth via the Detective link into one pipeline. The answer to the "best detection architecture" that SCS-C03 asks about is almost always *this integration pattern + delegation to the Security Tooling account*.

## Distinctions Often Gotten Wrong

- **Security Hub vs GuardDuty/Inspector**: The latter are *detectors* (generating findings), Security Hub is an *aggregator and orchestrator*. Security Hub does not directly detect threats (it exceptionally evaluates its own standards check controls).
- **Security Hub vs Detective**: Security Hub is *aggregation/standardization*, Detective is *deep investigation*. Wide and shallow vs narrow and deep.
- **ASFF**: The *common schema* of findings — the prerequisite for integration, correlation, and automation.
- **Delegated administrator alignment**: All detection services to the *same* Security Tooling account — the baseline correct answer on the exam.
- **Security Hub vs Security Lake**: Security Hub gathers *detection findings* into ASFF, and Security Lake gathers *logs* (source data) into OCSF and supplies them to external analysis tools. If it is "hand the source logs to a third-party SIEM," it is Security Lake; if it is "prioritize and automate detection findings in one place," it is Security Hub.
- **automation rules vs EventBridge rules**: The former changes finding fields *inside* Security Hub (suppress, raise), the latter sends findings *outside* to take action. Noise cleanup is automation rules; actual response is EventBridge.

## Integration Architecture Checklist: What Is Missing Means What Goes Unseen

Integration is established by multiple prerequisites overlapping, not by "on/off." If even one is missing, a quiet blind spot arises, and exam questions point at exactly that blank.

| What is missing | The blind spot that arises | Symptom |
|-----------------|----------------------------|---------|
| Integration not enabled | That detector's findings do not reach Security Hub | "GuardDuty shows it, but Security Hub doesn't" |
| Aggregation Region not designated | Findings from other Regions | "We learned of the critical later" |
| auto-enable not configured | All new accounts | "The new team's account was outside detection" |
| Delegated administrators scattered | Investigation context broken | "Findings in account A, graph in account B" |
| Detective not enabled | Root cause, lateral movement | "Cannot reconstruct what happened" |
| Logs retained in the detection account | Separation of privilege fails | Evidence can be tampered with in a compromise |
| Inactive Regions not covered | All activity in that Region | Mining and reconnaissance in unused Regions |

## Summary

Today's material, condensed into one sentence, is **"specialist detectors each discover, ASFF becomes the common language, EventBridge becomes the single exit, and the Security Tooling account owns it all."**

It is important not to misunderstand the value of integration. The "single pane" is a result, not a purpose. The real gains are three. **Correlation** — being able to group the detection findings of different detectors by the same resource and same principal (the story is complete only when Inspector's vulnerability and GuardDuty's attack point to the same instance). **Unifying the automation surface** — the response pipeline stays one even as detectors increase. **Governance** — an account structure that makes it impossible for workload teams to turn off detection or delete logs.

And the last piece of integration is always the **reversibility judgment**. The more powerful automation becomes, the greater the damage a false positive creates, so put only reversible actions into unattended automation and route the rest through a human once. On day5 we run this whole picture through again in scenario form.

### One-Line Summary Checklist

- [ ] Did you turn on Security Hub and enable the integrations with GuardDuty, Inspector, Macie, and others?
- [ ] Did you align the delegated administrator of all detection services to the same Security Tooling account?
- [ ] Did you include new accounts automatically with auto-enable, eliminating blind spots?
- [ ] Did you aggregate multi-Region findings into a single Region with an aggregation Region?
- [ ] Did you unify response automation through Security Hub → EventBridge?
- [ ] Did you retain logs immutably in a separate Log Archive account to separate privilege?

---

## 📝 Practice Questions

**Question 1.** The security team views the findings of GuardDuty, Inspector, and Macie separately because of their different formats, making correlation analysis and automation difficult. How can they be gathered in one place in a standard format and responded to with a single automation?

A) Bookmark each service's console and switch between them  
B) Enable Security Hub to normalize and aggregate findings in ASFF and unify the response with EventBridge  
C) Investigate all findings with Detective  
D) Store all findings in CloudWatch Logs  

**Answer: B**  
Explanation: Security Hub normalizes the findings of integrated services into the common schema ASFF, aggregates them in one pane, and publishes them as a single EventBridge stream so that one automation covers multiple detectors. Bookmarking consoles is not integration, Detective is an in-depth investigation tool rather than an aggregator, and simply storing logs provides no standardization, correlation, or automation.

---

**Question 2.** What is the recommended multi-account baseline when operating GuardDuty, Security Hub, Detective, and Inspector in a 50-account organization?

A) Distribute by delegating each detection service to a different account  
B) Align the delegated administrator of all detection services to the same Security Tooling account and turn on auto-enable  
C) Operate all detection services directly in the management account  
D) Turn on all services individually in each workload account and manage them separately  

**Answer: B**  
Explanation: The AWS SRA recommended pattern is to align the delegated administrator of all detection services, such as GuardDuty, Security Hub, Detective, and Inspector, to a dedicated Security Tooling account for consistent data, permissions, and investigation experience, and to include new accounts automatically with auto-enable. Distributing services across accounts fragments investigation, operating directly in the management account burdens an account with concentrated root privileges, and per-account individual operation creates blind spots.

---

**Question 3.** An organization operating in multiple Regions looked only at the Security Hub console in one Region and missed critical findings in another Region. What is the correct configuration?

A) Move all workloads to one Region  
B) Designate a Security Hub aggregation Region to aggregate findings from multiple Regions into a single Region cross-Region  
C) Have a separate security team in each Region  
D) Turn on only GuardDuty in multiple Regions  

**Answer: B**  
Explanation: Security Hub findings exist per Region, so you must designate an aggregation Region to view and manage findings from multiple Regions in a single Region and eliminate multi-Region blind spots. Moving workloads is impractical, separating teams per Region does not provide unified visibility, and turning on only GuardDuty does not solve the Security Hub aggregation problem.

---

**Question 4.** Which statement about the role of Security Hub is most accurate?

A) It directly inspects network traffic and blocks malicious connections  
B) It is a hub that standardizes and aggregates the findings of integrated detection services in ASFF and orchestrates correlation and automation, and it also evaluates standards compliance controls  
C) It classifies PII in S3  
D) It scans EBS volumes for malware  

**Answer: B**  
Explanation: Security Hub normalizes the findings of GuardDuty, Inspector, Macie, and others into the common ASFF schema and aggregates them, orchestrates correlation and response automation with Insights, automation rules, and EventBridge, and also evaluates standards controls such as CIS and FSBP. Traffic blocking, PII classification (Macie), and malware scanning (GuardDuty Malware Protection) are the roles of other services.

---

**Question 5.** In an integrated detection architecture, which option correctly matches the role of each service when a breach occurs?

A) Inspector=investigation, GuardDuty=aggregation, Detective=vulnerabilities, Security Hub=blocking  
B) Inspector=proactive vulnerability identification, GuardDuty=threat detection, Detective=root cause investigation, Security Hub=aggregation and automation orchestration  
C) All services detect and block threats in the same way  
D) Security Hub=investigation, Detective=aggregation, GuardDuty=vulnerabilities, Inspector=blocking  

**Answer: B**  
Explanation: In an integrated pipeline, Inspector proactively identifies exploitable vulnerabilities, GuardDuty detects actual threat activity, Detective investigates root cause and scope of impact, and Security Hub aggregates and standardizes all of this and orchestrates the response through EventBridge. The other options are wrong because they mix up the roles or treat all services as identical.

---
