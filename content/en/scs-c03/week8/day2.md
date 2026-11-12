# Day 2 - Security Hub: Security Standards (CIS/FSBP), Consolidated Score, Finding Aggregation and Normalization (ASFF), Automated Response

Once you turn on several detectors, a new problem soon appears - GuardDuty pours out alerts in the GuardDuty format, Inspector in the Inspector format, Macie in yet another format, and once you add the configuration check results of IAM, S3, and CloudTrail, the operator can no longer answer the single question "is our account safe right now?" **AWS Security Hub** is the aggregation, normalization, and scoring plane that solves this fragmentation. On security exams, the essence of Security Hub is that it is not a tool that "*does* detection" but a meta-tool that "*collects, standardizes, and prioritizes* the results of multiple detectors."

## The Three Jobs of Security Hub

What Security Hub does divides clearly into three.

1. **Security Standards checks**: It automatically compares account and resource settings against best-practice benchmarks (CIS, FSBP, PCI DSS, NIST, etc.) and produces passing/failing controls. Internally it uses **AWS Config** rules.
2. **Finding aggregation and normalization (Aggregation)**: It receives findings from integrated services such as GuardDuty, Inspector, Macie, IAM Access Analyzer, and Firewall Manager, and from third parties, in a single format called **ASFF**, and gathers them in one place.
3. **Automated response (Automation)**: It sends findings to EventBridge or processes and suppresses them automatically with Automation Rules.

> ⚠️ **Pitfall**: The statement "Security Hub detects threats" is inaccurate. Threat *detection* is done by GuardDuty, vulnerability *scanning* by Inspector, and sensitive data *discovery* by Macie. Security Hub *aggregates* their results and separately performs *configuration checks (compliance)*. If an exam asks about "real-time detection of malicious behavior," it is GuardDuty; if it asks about "results of multiple security services on one dashboard," it is Security Hub.

Of these three, today we put the weight on **numbers 1 and 3**. Number 2 (finding aggregation, the anatomy of the ASFF schema, and the multi-account detection baseline) will be tied together in one picture in week 9, after we have learned all the detection services. Today's question is different - **how do we continuously measure "does our accounts' configuration meet the standard," how do we enforce that measurement across the whole organization, and how do we keep the flood of control results at an operable size.**

```
[ Standards check pipeline: the path by which configuration becomes a score ]

  Resource change            Configuration record     Control evaluation     Aggregation/presentation
 ┌──────────┐          ┌───────────────┐      ┌──────────────┐    ┌──────────────┐
 │ S3 bucket │          │  AWS Config   │      │ Security Hub │    │ Control      │
 │ IAM policy│──change─▶│  config       │──▶   │ standard     │──▶ │ results      │
 │ SG/EC2   │          │  recorder     │      │ control      │    │ (ASFF +      │
 └──────────┘          │ (resource     │      │ = Config rule│    │  Compliance) │
       ▲               │  snapshots)   │      └──────────────┘    └──────┬───────┘
       │               └───────────────┘                                  │
       │                       ▲                                          ▼
       │              **If this is off,**                        ┌──────────────┐
       │              **everything below silently stops**        │ Security     │
       │                                                         │ score (%)    │
  Remediation ◀──────── EventBridge ──── Automation ◀───────────│ managed as a │
                                                                 │ trend        │
                                                                 └──────────────┘
```

What matters in this diagram is that it is a **closed loop**: it flows once from the upper left to the lower right and then returns to the lower left. Posture management does not end at "measure → display." If the measurement does not come back as remediation, the score will still be in the same place six months later.

Around 2017, incidents in which S3 buckets were misconfigured as public and data was exposed were repeatedly reported at multiple organizations. What is interesting is that the cause of most of these incidents was not a *vulnerability* but **configuration** - there was no flaw in the software; the setting of a single bucket simply differed from what was intended. AWS subsequently introduced account-level Block Public Access, and later moved toward making Block Public Access and disabled ACLs the defaults for new buckets. This trajectory shows exactly why the field of posture management exists. **Risk exists even without an attack, and that risk usually takes the form of "someone configured it wrong."** A standard control is a device in which a machine counts the wrong settings before a human discovers them, and changing the default is a stronger device that makes it impossible to set it wrong in the first place. The answer to when an exam asks "which comes first, preventive or detective controls" is here.

## Security Standards: CIS vs. FSBP

Comparing the two main standards Security Hub provides makes the difference clear.

| Standard | Nature | Source |
|------|------|------|
| **CIS AWS Foundations Benchmark** | A core baseline based on external consensus (root MFA, multi-Region CloudTrail, risk alarms, etc.) | Center for Internet Security |
| **AWS Foundational Security Best Practices (FSBP)** | Broad per-service best practices defined directly by AWS | AWS |
| **PCI DSS** | Compliance for cardholder data environments | PCI SSC |
| **NIST SP 800-53** | US federal security controls | NIST |

- **CIS** is a narrow, core baseline at the level of "at the very least, keep these."
- **FSBP** is a *broad* check spanning services such as EC2, S3, RDS, and Lambda, so it has far more controls.

Each control is evaluated by an AWS Config rule, so **AWS Config must be enabled** for the standard controls to work. This is the key dependency.

```bash
# Enable Security Hub (you can also disable automatic enabling of the default standards and enable them explicitly)
aws securityhub enable-security-hub --enable-default-standards

# Subscribe to a specific standard
aws securityhub batch-enable-standards \
  --standards-subscription-requests \
    StandardsArn=arn:aws:securityhub:ap-northeast-2::standards/aws-foundational-security-best-practices/v/1.0.0

# Check the list of standards you can choose from in this Region right now
aws securityhub describe-standards \
  --query 'Standards[].{Name:Name,Arn:StandardsArn,Managed:EnabledByDefault}' --output table

# Standards you are subscribed to and their status
aws securityhub get-enabled-standards \
  --query 'StandardsSubscriptions[].{Arn:StandardsArn,Status:StandardsStatus}'
```

Security Hub's standards checks are an implementation of a "detective control" and of "continuous compliance." Traditionally, compliance audits were quarterly or annual snapshots, but Config rule-based checks are a *continuous audit* that re-evaluates on every resource change. This ties directly to NIST's concept of Continuous Monitoring (CM). On an exam, "continuously track compliance status" points to Config + Security Hub standards as the answer axis.

### Which Standard to Turn On: The Axes of Choice

If you turn on all the standards, controls overlap and results multiply several times over. Conversely, if you turn on only one, blind spots remain. The practical selection criterion is **"what question is this standard trying to answer?"**

| Standard | Question it tries to answer | Scope | When to turn it on |
|------|--------------|------|-----------|
| **CIS AWS Foundations** | "Have we kept the minimum basics?" | Narrow and deep. Account, IAM, logging, monitoring, network basics | **First.** New-account baseline |
| **FSBP** | "Are we following AWS-recommended per-service best practices?" | The broadest. Across services | After the basics. Kept on permanently |
| **PCI DSS** | "Do we satisfy the requirements of a cardholder data environment?" | Limited to payment environments | Only in accounts that handle card data |
| **NIST SP 800-53** | "Does it map to the federal control framework?" | Very broad and document-oriented | When a government or regulatory contract requires it |
| **AWS Resource Tagging Standard** | "Do we follow the tag rules?" | Tags only | When using tag-based governance |

The reading order is the adoption order. **Start with CIS, broaden to FSBP, and add PCI/NIST only when there is a regulatory requirement.** If you reverse this order and turn on NIST first, hundreds of FAILED controls pour in at once, the team reads it as "we have failed completely," and ends up not looking at the dashboard. The most common failure in adopting posture management is **turning on too much from the start**.

> ⚠️ **Pitfall**: The statement "we must comply with regulations, so turning on the PCI DSS standard means we are compliant" is a wrong answer. Security Hub's PCI/NIST standards evaluate **only the portion of the PCI DSS or NIST controls that can be checked automatically from AWS configuration**. Physical security, human controls, policy documents, and processes cannot be replaced by any automated control. If an exam text carries the nuance "turn on the standard and you get certified," that option is almost always wrong - automated controls are **part of the evidence** for certification, not certification itself.

### The Config Dependency: The Point Where Things Silently Collapse

The sentence "Config must be present" ends in one line on the exam, but in reality there are several layers of conditions.

- **The configuration recorder must be on.** And the **resource types the control targets must be included in what is recorded**. If you narrow it to record only certain resource types to save cost, the controls that look at those types are never evaluated at all.
- It is **separate per Region.** Security Hub and Config are Regional services, so a Region where you have not turned them on is a blind spot as a whole.
- A control that is not evaluated goes into the `NO_DATA` state and is **dropped from the denominator of the score calculation.** This is the dangerous point - the evaluation stopping does *not lower* the score; instead it is computed from only the remaining controls, so **the score may look like it went up.**

**"The score went up" is not necessarily good news.** It may really have risen because of improvement, but it may also be that (1) the Config recording scope narrowed so fewer things were evaluated, (2) controls with many FAILED results were disabled, or (3) resources were deleted so the evaluation targets themselves disappeared. The score must always be read **together with the number of evaluated controls**. The form in which exams pose this pitfall is "the security score improved but the actual posture got worse. What is the cause?", and the answer is usually a reduced evaluation scope or disabled controls.

## Security Score: Controls as a Single Number

Security Hub converts the pass rate of the controls of enabled standards into a **security score (%)**. The score calculation is simple.

```
Security score = (number of PASSED controls) / (PASSED + FAILED controls) × 100
```

- Disabled/no-data (`NOT_AVAILABLE`, `DISABLED`) controls are excluded from the denominator.
- Each control evaluates multiple resources, and if even one resource fails, that control is considered `FAILED` (the control status is an aggregation of resource results).

This score is an at-a-glance indicator of "how well are we keeping the baseline right now," and it can also be aggregated at the organization level.

### The Nature of the Score: One Resource Drags Down the Whole

The second rule - **if even one resource fails, the whole control is FAILED** - determines the character of score operations.

```
Control "S3 buckets should block public access"
  ├─ prod-uploads      PASSED
  ├─ prod-assets       PASSED
  ├─ ... (197 buckets)  PASSED
  └─ legacy-demo-site  FAILED  ◀── because of this one,
                                    control status = FAILED
                                    score contribution = 0
```

That is, the score says **not "what percentage of resources are safe" but "what percentage of rules are fully kept."** This property has two implications in practice.

- **The score does not rise easily.** Even if you fix 99% of the resources, if one remains, that control's score is 0. If you make only the score a KPI, the team becomes frustrated.
- **What to watch instead of the score is the trend in the number of FAILED resources.** The control-level score is for management reporting, and actual improvement is managed with resource-level counts.

```bash
# What is failing and how many - FAILED resource counts per control
aws securityhub get-findings \
  --filters '{
    "ComplianceStatus": [{"Value":"FAILED","Comparison":"EQUALS"}],
    "RecordState":      [{"Value":"ACTIVE","Comparison":"EQUALS"}],
    "WorkflowStatus":   [{"Value":"NEW","Comparison":"EQUALS"},
                         {"Value":"NOTIFIED","Comparison":"EQUALS"}]
  }' \
  --query 'Findings[].Compliance.SecurityControlId' --output text \
  | tr '\t' '\n' | sort | uniq -c | sort -rn | head -20
```

How to read this result matters. The controls at the top split into two types.

- **Hundreds of findings on one control** → usually an *organization-wide default problem*. For example, if "EBS volume encryption" has hundreds of findings, it is not a matter of fixing individual volumes; the answer is to **turn on account-level EBS default encryption**. Individual remediation is a bottomless pit, and the fundamental solution is to change the default.
- **The same resource repeated across several controls** → that one resource is likely abandoned legacy. In many cases **removing it** is faster than fixing it.

A common failure when using posture metrics as KPIs is **setting "a 100% score" as the goal**. 100% can be achieved in two ways - fix everything, or turn off the controls that cannot be fixed. Because the latter is much easier, when you set the score as the goal the organization naturally drifts toward the latter (exactly Goodhart's law: when a measure becomes a target, it ceases to be a good measure). So mature operations put **the number of disabled controls and the reasons** on the same screen as the score. A 100% in which you cannot see "what was turned off and why" carries no information at all.

## Control Operations: Disabling, Tuning, and Consolidating

After turning on a standard, what you actually spend time on is **fitting the controls to our environment**. Security Hub gives three knobs.

### (1) Disabling Controls - Leaving a Reason Is the Key

Controls that do not apply to our environment (for example, services we do not use) are right to turn off. Once off, they drop out of the score calculation and no findings are generated.

```bash
aws securityhub update-standards-control \
  --standards-control-arn "arn:aws:securityhub:ap-northeast-2:111122223333:control/aws-foundational-security-best-practices/v/1.0.0/Redshift.1" \
  --control-status DISABLED \
  --disabled-reason "This account does not use Redshift (platform team approval 2026-03, TICKET-4821)"
```

`--disabled-reason` looks optional but is **required when disabling**, and this reveals the design intent of the feature. Turning off a control is a *decision to reduce detection scope*, so the basis must be recorded. If you cannot answer "why is this control off" in an audit, that itself becomes a finding.

### (2) Adjusting Control Parameters - Fit Instead of Turning Off

Some controls let you change thresholds to match our policy. For example, you adjust the day-count criterion of controls such as "access key rotation period" or "log retention period" to organizational policy. **The question to ask before turning off a control is "does it truly not apply, or is the standard merely different from ours?"** If it is the latter, adjusting rather than turning off is right.

```bash
aws securityhub update-security-control \
  --security-control-id IAM.3 \
  --parameters '{"maxCredentialUsageAge":{"ValueType":"CUSTOM","Value":{"Integer":45}}}'
```

The difference between turning off and adjusting is decisive from an audit viewpoint. **A control that is off says "we do not look at this," while an adjusted control says "we look at this with a different standard."** The latter can be defended with a policy document, while the grounds for defending the former are much narrower.

### (3) Consolidated Control Findings

If you turn on CIS and FSBP at the same time, the same check (for example, "MFA on the root account") exists in both standards, so **findings are doubled.** If you turn on consolidated control findings, **one finding per security control ID** is generated regardless of the standard.

```bash
aws securityhub update-security-hub-configuration \
  --control-finding-generator SECURITY_CONTROL
```

| Axis | `STANDARD_CONTROL` (default) | `SECURITY_CONTROL` (consolidated) |
|----|--------------------------|--------------------------|
| Unit of finding generation | Standard × control | Security control ID |
| Duplication when 3 standards are active at once | Up to 3x | None |
| Control management | Turn on and off separately per standard | **Turning off once applies in all standards** |
| Finding volume | High | Low |

When consolidation is on, control enabling/disabling **applies across standard boundaries**. The requirement "turn it on in the PCI standard but off in CIS" does not hold in consolidated mode. Conversely, if you turn on three standards without consolidation, you see the same problem three times and alert fatigue sets in immediately. **If you turn on several standards, turning on consolidation as well is effectively the default setting** - that is how to remember it.

## Multi-Account Enforcement: Central Configuration

So far this has been the story of one account. At organizational scale, the real problem becomes "how do we apply the standard and control settings we have decided on identically to hundreds of accounts, and keep workload teams from turning them off arbitrarily?" **Central Configuration** is the answer.

```
[ How central configuration is applied ]

  Management account       Delegated administrator (Security Tooling)    Member accounts/OUs
 ┌──────────┐            ┌───────────────────────────┐        ┌────────────┐
 │ Designate │──────────▶ │ Write configuration       │        │ Standards  │
 │ delegation│            │   policies:               │─apply─▶│ auto-enabled│
 └──────────┘            │  · which standards to enable│        │ Control    │
                          │  · which controls to disable│        │ settings   │
                          │  · parameter values        │        │ locked     │
                          └────────────┬──────────────┘        └────────────┘
                                       │ association                  ▲
                                       └── root / OU / individual account ┘
                                            (hierarchical inheritance, can be overridden lower down)
```

```bash
# 1) (Management account) designate the delegated administrator
aws securityhub enable-organization-admin-account --admin-account-id 999988887777

# 2) (Delegated administrator) declare use of central configuration
aws securityhub update-organization-configuration \
  --auto-enable \
  --organization-configuration '{"ConfigurationType":"CENTRAL"}'

# 3) Write a configuration policy - what to turn on and what to turn off
aws securityhub create-configuration-policy \
  --name "baseline-prod" \
  --description "Standard baseline for the production OU" \
  --configuration-policy '{
    "SecurityHub": {
      "ServiceEnabled": true,
      "EnabledStandardIdentifiers": [
        "arn:aws:securityhub:ap-northeast-2::standards/aws-foundational-security-best-practices/v/1.0.0",
        "arn:aws:securityhub:ap-northeast-2::standards/cis-aws-foundations-benchmark/v/1.4.0"
      ],
      "SecurityControlsConfiguration": {
        "DisabledSecurityControlIdentifiers": ["Redshift.1"]
      }
    }
  }'

# 4) Associate with the OU
aws securityhub start-configuration-policy-association \
  --configuration-policy-identifier <policy-arn> \
  --target '{"OrganizationalUnitId":"ou-abc1-22334455"}'
```

> 🎯 **Scenario**: If the text says "Across hundreds of accounts, each team's Security Hub settings are all different, and some teams arbitrarily turn off inconvenient controls. We want to enforce the organization standard but allow exceptions for specific OUs," the answer is **central configuration + OU hierarchy association**. Distinguishing three wrong-answer candidates is the exam point here. (1) "Deploy the settings to each account with a script" - correct only at deployment time and does not prevent later changes. (2) "Block `securityhub:UpdateStandardsControl` with an SCP" - cannot express exceptions and blocks even legitimate adjustments. (3) "Keep local configuration and only audit" - not enforcement. Only central configuration satisfies **inheritance + exceptions + continuous enforcement** at the same time.

Central configuration is **managed from the delegated administrator's home Region**, and it is mutually exclusive with local configuration (each account setting itself). The moment you turn on central configuration, the member accounts' local settings are overwritten by the policy. The problem "I deployed centrally but the members do not stay that way" is usually a case where they remain in local configuration mode or where the association has not been propagated down to that OU.

## ASFF: The Common Language of All Findings

The most important concept in Security Hub is **ASFF (AWS Security Finding Format)**. Whether the source is GuardDuty, Inspector, or a third party, every finding comes in normalized into this JSON schema. Thanks to this, operators can search, filter, and route with *a single field system* without memorizing per-source formats.

The key fields of ASFF:

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/abc/finding/xyz",
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty",
  "GeneratorId": "guardduty",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:EC2-SSHBruteForce"],
  "Severity": { "Label": "HIGH", "Normalized": 70 },
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE",
  "Resources": [
    { "Type": "AwsEc2Instance", "Id": "arn:aws:ec2:...:instance/i-0123" }
  ],
  "Compliance": { "Status": "FAILED" },
  "ProductFields": { "aws/securityhub/CompanyName": "AWS" }
}
```

Two axes that matter especially in normalization:

- **Severity.Normalized**: a normalized severity from 0 to 100. It unifies the differing severity expressions of each source onto one scale. It maps to the labels (`INFORMATIONAL`/`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`).
- **Workflow.Status**: the *handling state* of the finding - `NEW` → `NOTIFIED` → `RESOLVED` / `SUPPRESSED`. It is the workflow state the operator deals with.
- **RecordState**: the *survival* state of the finding - `ACTIVE` / `ARCHIVED`. When the problem disappears it changes to ARCHIVED.

You must not confuse `Workflow.Status` and `RecordState`. `RecordState=ARCHIVED` means "the underlying problem has been resolved and the finding is no longer valid" (judged by the system), while `Workflow.Status=RESOLVED` means "the operator marked it as handled" (judged by a person/automation). Also, `SUPPRESSED` means "seen but intentionally ignored," so it drops out of scores and notifications while the record remains.

(The anatomy of each ASFF field, injecting custom findings, and the multi-account baseline that ties several detection services into one picture will be covered again in week 9, after we have learned all the detection tools. What we need today is just one fact: **control findings have different fields and a different lifecycle from threat findings**.)

### The Lifecycle of Control Findings Differs from Threat Findings

They use the same ASFF, but the two classes of findings **disappear in opposite ways**. If you do not know this difference, operations go awry.

| Axis | Threat findings (GuardDuty, etc.) | Control findings (standards checks) |
|----|------------------------|------------------------|
| What it says | "An event happened" | "The configuration deviated from the standard" |
| Deciding fields | `Types`, `Severity` | `Compliance.Status`, `SecurityControlId` |
| When it disappears | Automatically archived when the activity stops | **Regenerated as FAILED until you fix it** |
| How it is handled | Closed after investigation (RESOLVED) | Switches to PASSED only after the resource is fixed |
| If marked RESOLVED | Closed | **Returns to NEW at the next evaluation** |
| Appropriate metric | Event count, mean time to respond | Compliance rate, FAILED resource trend |

The fifth row causes accidents in practice. Even if you mark a control finding as "checked, so handling complete," **if the resource stays the same, the same finding comes back to life at the next Config evaluation.** This is not a bug but a design - posture findings are a *reflection of current state*, not a *record of past events*. There are only three ways to quiet a control finding: **fix it, turn off the control, or suppress it (SUPPRESSED).** And for the latter two, a reason must always be left.

## Finding Aggregation and Integrations

There are integrations that *send* findings into Security Hub and integrations that *take* Security Hub's findings out.

- **Inbound integrations (→ Security Hub)**: GuardDuty, Inspector, Macie, IAM Access Analyzer, Firewall Manager, Config, Health, and many third parties (Palo Alto, Splunk, etc.). When turned on, they come in automatically as ASFF.
- **Outbound/response integrations (Security Hub →)**: EventBridge (all findings are automatically published as events), ticketing (Jira/ServiceNow), SIEM.

In a multi-account environment, you designate a delegated administrator account through the **Organizations integration** to gather all members' findings in one place, and you consolidate findings from several Regions into a single aggregation Region with **Cross-Region Aggregation**.

> 🎯 **Scenario**: If the requirement is "see the security status of the whole organization (hundreds of accounts, multiple Regions) on a single screen and enforce consistent standards," the correct combination is (1) designate the Security Hub delegated administrator in Organizations → (2) deploy standards and controls to members in bulk with Central Configuration → (3) aggregate in one Region with Cross-Region Aggregation → (4) ensure Config is enabled in each member account. The key word is *central configuration*, not manual per-member setup.

## Automated Response: Automation Rules and EventBridge

Security Hub provides two automation paths.

1. **Security Hub Automation Rules**: *Inside* Security Hub, when a finding comes in and matches conditions (for example, a specific control ID + account), fields are updated automatically (raising/lowering severity, setting Workflow.Status to SUPPRESSED, etc.). It cannot take external actions, but it is strong for *noise cleanup and priority adjustment*.
2. **EventBridge-based response**: Every finding is automatically published to EventBridge. An EventBridge rule catches specific finding patterns and runs Lambda/Step Functions/SSM Automation to perform *actual remediation* (for example, blocking public access on an exposed S3 bucket).

```json
// EventBridge rule: catch only CRITICAL GuardDuty findings and respond
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": { "Label": ["CRITICAL"] },
      "ProductArn": [{ "prefix": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty" }],
      "Workflow": { "Status": ["NEW"] }
    }
  }
}
```

The combination of Security Hub + EventBridge + automatic remediation is the AWS-native implementation of SOAR (Security Orchestration, Automation and Response). AWS provides a prebuilt solution for this, **Automated Security Response on AWS (ASR, formerly SHARR)** - a collection of playbooks that receive Security Hub findings and automatically remediate them with SSM Automation documents. When an exam asks about "an automatic remediation solution for Security Hub findings," you should think of the EventBridge → SSM Automation path (or ASR).

### The Three Kinds of Events Security Hub Sends to EventBridge

To use finding routing accurately, you need to know that there are three `detail-type` values. If an exam requirement says "trigger a response after manual review," the third is the answer.

```json
// (1) Every finding is published automatically - the basic path for automated response
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Compliance":    { "Status": ["FAILED"] },
      "Severity":      { "Label": ["CRITICAL", "HIGH"] },
      "Workflow":      { "Status": ["NEW"] },
      "RecordState":   ["ACTIVE"],
      "ProductFields": { "aws/securityhub/ProductName": ["Security Hub"] }
    }
  }
}
```

```json
// (2) A custom action that an analyst explicitly runs from the console
//     (you must first create the action with create-action-target)
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Custom Action"],
  "resources": ["arn:aws:securityhub:ap-northeast-2:111122223333:action/custom/CreateJiraTicket"]
}
```

```json
// (3) Insight results - the output of periodic correlation views
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Insight Results"]
}
```

```bash
# Create a custom action - one console button becomes an EventBridge event
aws securityhub create-action-target \
  --name "Create Jira Ticket" \
  --description "Create an issue from the selected findings" \
  --id CreateJiraTicket
```

The reason custom actions exist is that **not every response should be automated**. Automated response is safe only when the conditions are clear and the action is reversible, and in other situations *human judgment + machine execution* is the best combination. A custom action fills exactly that gap - after an analyst looks at a finding and decides and then presses the button, the subsequent execution (ticket creation, isolation, evidence collection) is handled by automation. On exams, among options that look like a "automatic vs. manual" dichotomy, there are cases where this **semi-automatic (human-in-the-loop)** choice is the correct answer.

### Three Layers of Suppression: Where to Cut Down

Control findings grow linearly as resources grow. You must reduce the noise, but what you lose depends on the point where you reduce it. **Where you cut decides what you give up.**

```
 [ Generate ]        [ Store ]              [ Route ]             [ Reach ]
Control eval ──▶ Security Hub finding ──▶ EventBridge rule ──▶ SNS/ticket/on-call
    │                   │                    │                   │
    ①                   ②                    ③                   │
Disable control   Automation rule        Filter by pattern    Separate channels by severity
                  suppression
    │                   │                    │
Loses:              Loses:                Loses:
The evaluation      Alerts, score         Only that response
itself, score       inclusion             (findings and score
(blind spot)        (findings and         unchanged)
                    records remain)
```

| Layer | When to use | What remains | Risk |
|------|----------|---------|------|
| ① Disable control | When you do not use that service at all | Only the reason record | **The evaluation itself disappears.** A blind spot if you later start using that service |
| ② Automation rule suppression | Specific resources/accounts with an approved exception | Findings and audit records | A broad suppression scope creates a silent blind spot |
| ③ EventBridge filter | When you skip only the response but keep it on the dashboard | Findings, score, dashboard | The safest. But a person must look at the dashboard |

**The basic principle is "cut as far to the right as possible."** The further right you cut, the less you lose and the easier it is to undo. ① is the last resort, and when you use it, always leave a reason and a review date.

An option like "there are too many detection findings, so turn off the standards" is a wrong answer on exams. For the same reason, "the noise is heavy, so disable the Security Hub integration" is also wrong. The form of the correct answer is always **receive all detection findings but fold them down by suppression and routing**, and what was suppressed must be traceable. Conversely, "send all detection findings to on-call" is also wrong, because it looks technically safe but operationally **makes it so no one looks, which ends up the same as turning detection off**.

## Custom Insights: Turning Findings into Questions

Security Hub provides **Insights**, saved views that group and filter findings. In addition to the built-in insights (for example, "publicly accessible resources," "resources with the most findings"), you can create custom insights with ASFF fields. An insight gathers findings by a *grouping attribute* (for example, resource ID, account) to reveal "where the risk is concentrated."

```bash
# "Which account has the most CRITICAL FAILED findings" - prioritizing accounts for improvement
aws securityhub create-insight \
  --name "CRITICAL FAILED by account" \
  --group-by-attribute AwsAccountId \
  --filters '{
    "SeverityLabel":    [{"Value":"CRITICAL","Comparison":"EQUALS"}],
    "ComplianceStatus": [{"Value":"FAILED","Comparison":"EQUALS"}],
    "RecordState":      [{"Value":"ACTIVE","Comparison":"EQUALS"}]
  }'

# Bulk-close investigated findings (threat findings only - for control findings you must fix the resource)
aws securityhub batch-update-findings \
  --finding-identifiers '[{"Id":"<finding-id>","ProductArn":"<product-arn>"}]' \
  --workflow Status=RESOLVED \
  --note 'Text=INC-2026-0412 investigation complete,UpdatedBy=soc-analyst'
```

The real value of an insight lies not in the dashboard but in **the choice of grouping axis**. Grouping the same pile of findings by `AwsAccountId` shows "which team to help," grouping by `ResourceId` shows "which resource to get rid of," and grouping by `SecurityControlId` shows "which default to change." **Each of the three axes triggers a different organizational action** - when posture improvement stalls, it is usually because the wrong axis was chosen.

## 📌 Key Takeaways

If CloudWatch is threshold detection on a single signal, Security Hub is the *aggregation, normalization, and scoring of many signals*. Tied together as a flow: **standards (CIS/FSBP, Config-based) → control evaluation → score and FAILED trend → control tuning (off, fit, consolidate) → organizational enforcement via central configuration → noise management via suppression and routing → response via EventBridge**.

There are four points where the exam repeatedly pokes at today's material.

1. **Without Config there are no standards.** And if the Config recording scope is narrow, evaluation silently disappears, and then the score *looks like it went up.*
2. **The score is per control; improvement is per resource.** One resource makes the entire control FAILED.
3. **Control findings disappear only when you fix them.** A RESOLVED mark comes back to life at the next evaluation.
4. **Organizational enforcement is central configuration, not scripts or SCPs.** It is the only means that can express inheritance and exceptions at the same time.

And above all this sits one more judgment. **The goal of posture management is not the score but the improvement of defaults.** If the same control is failing hundreds of times, that is not hundreds of mistakes but one wrong default, and it will not grow again unless you fix account-level settings, service control policies, and IaC templates rather than remediating individually. No matter how refined the detection, **if the rate of creation is faster than the rate of remediation, posture gets worse** - this is the only arithmetic of CSPM operations.

### One-Line Summary Checklist

- [ ] Is the AWS Config recorder on in every Region and every account, recording the necessary resource types?
- [ ] Did you start with CIS and broaden to FSBP (not turning on all standards from the start)?
- [ ] Did you remove duplication across standards with consolidated control findings (`SECURITY_CONTROL`)?
- [ ] For each disabled control, did you leave the reason, approval, and review date in `--disabled-reason`?
- [ ] Before turning off, did you first check "is it solved by parameter adjustment?"
- [ ] Did you enforce the organization standard with central configuration + OU association and express exceptions explicitly?
- [ ] Are you looking at **the number of evaluated controls and the number of disabled controls** along with the score?
- [ ] Did you cut noise as far to the right (routing) as possible and keep control disabling as a last resort?
- [ ] Did you handle mass failures of the same control by **changing the default** rather than individual remediation?

---

## 📝 Practice Questions

**Question 1.** Which prerequisite service must be enabled for Security Hub security standards (CIS, FSBP) controls to be evaluated?

A) Amazon Macie  
B) AWS Config  
C) Amazon Inspector  
D) AWS Shield Advanced  

**Answer: B**  
Explanation: Security Hub standards controls internally evaluate resource settings with AWS Config rules, so Config must be enabled. Macie is sensitive data discovery, Inspector is vulnerability scanning, and Shield is DDoS protection, so none of them is a prerequisite for standards control evaluation.

---

**Question 2.** Which normalized format does Security Hub use to handle the different result formats of GuardDuty, Inspector, and Macie in a single scheme?

A) CloudTrail event schema  
B) ASFF(AWS Security Finding Format)  
C) VPC Flow Logs format  
D) Keep only the original OCSF format as-is  

**Answer: B**  
Explanation: Security Hub normalizes the results from all integrated sources into a single JSON schema called ASFF, so they can be searched and routed using the same fields (Severity.Normalized, Workflow.Status, etc.) regardless of origin. The CloudTrail/VPC Flow formats are different data, and OCSF is the format of Security Lake.

---

**Question 3.** After reviewing a particular finding, an operator wants to "intentionally ignore it but keep the record and exclude it from the security score and notifications." What value should be set in ASFF?

A) Set RecordState to ARCHIVED  
B) Set Workflow.Status to SUPPRESSED  
C) Set Severity.Normalized to 0  
D) Set Compliance.Status to PASSED  

**Answer: B**  
Explanation: Setting Workflow.Status to SUPPRESSED indicates the operator intentionally ignored it, and it is excluded from notifications and score aggregation while the record remains. RecordState=ARCHIVED is a value the system changes when it determines the underlying problem has been resolved, and arbitrarily manipulating severity or Compliance distorts the meaning.

---

**Question 4.** You want to apply Security Hub standards consistently across hundreds of member accounts and multiple Regions and view all findings in a single pane. What is the most appropriate approach?

A) Manually configure Security Hub individually in each account and Region  
B) Designate a delegated administrator in Organizations, deploy standards with Central Configuration, and aggregate into one Region with Cross-Region Aggregation  
C) Configure only SNS to forward all findings by email  
D) Simply turning on GuardDuty integrates everything automatically  

**Answer: B**  
Explanation: The answer for consistent multi-account, multi-Region operation is an Organizations delegated administrator + Central Configuration (bulk deployment of standards/controls) + Cross-Region Aggregation (a single aggregation Region). Per-account manual setup does not scale, SNS alone cannot enforce standards or aggregate, and GuardDuty is only a detector and does not replace standards checks or aggregation.

---

**Question 5.** When a CRITICAL finding arrives in Security Hub, you want to automatically perform actual remediation (for example, revoking an exposed security group rule). What is the standard architecture?

A) Directly modify the security group with a Security Hub Automation Rule  
B) Because findings are automatically published to EventBridge, match the pattern with an EventBridge rule and remediate with SSM Automation/Lambda  
C) A Config rule remediates automatically  
D) Macie remediates  

**Answer: B**  
Explanation: All Security Hub findings are automatically published to EventBridge, so the standard pattern (which AWS's ASR solution also follows) is to catch the CRITICAL pattern with an EventBridge rule and run actual remediation with an SSM Automation document or Lambda. Automation Rules only update or suppress finding fields and cannot directly change external resources, Config automatic remediation is at the Config rule level, and Macie is a data discovery tool.

---

