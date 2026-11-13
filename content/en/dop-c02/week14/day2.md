# Day 2 - Security Hub: The SIEM Principles of Normalizing, Aggregating, and Auto-Remediating Security Data

Anyone who has turned on several detection tools at once soon runs into the real problem. GuardDuty pours out alarms in the GuardDuty format, Inspector in the Inspector format, and Macie in yet another. When three tools each raise a differently shaped alert about the same S3 bucket, the operator can't even tell whether they are the same issue or different ones. "Unify security signals from multiple sources into one language, remove duplicates, prioritize them, and hook automatic remediation on top." Security Hub solves this problem, and it is a cloud-native reimplementation of the decades-old SIEM (Security Information and Event Management). In the console, Security Hub looks like "a dashboard that shows a security score," but underneath lies the classic SIEM design of data normalization, correlation, deduplication, and rule-based automation. Today we dig into how this dashboard unifies the output of different tools into ASFF, how it evaluates compliance standards, and whether to hook automatic remediation with a Custom Action, an Automation Rule, or EventBridge.

On the DOP exam, Security Hub appears as the "single source of truth" for security posture, in scenarios like "to see Findings from multiple accounts and tools in one place," "to automatically fix a specific compliance violation without a human," and "to manually trigger a response only for the Findings the operator selects in the console." Once you distinguish Custom Action (manual), Automation Rule (automatic), and the two EventBridge event types (Imported vs Custom Action), the answer becomes clear.

## Why SIEM Exists: The History of Normalization and Correlation

SIEM's roots lie in the merger of SIM (Security Information Management: long-term log storage and analysis) and SEM (Security Event Management: real-time monitoring and correlation) from the late 1990s to the early 2000s (Gartner established the term SIEM in 2005). Products like ArcSight, Splunk, and QRadar were all solving the same problem: "gather the logs that dozens of security tools emit in different formats into one analysis plane and correlate them."

The core is two steps. **Normalization** converts firewall logs, IDS alarms, and OS audit logs into a common schema, putting "apples and oranges in the same unit." **Correlation** cross-references the normalized events and combines individually weak signals into a strong conclusion, such as "a port scan on the firewall + an IDS exploit alarm right after + abnormal outbound traffic from that host = a breach in progress."

Security Hub implements exactly this SIEM model AWS-natively. ASFF handles normalization, automatic integration (GuardDuty, Inspector, Macie, and others send Findings with no extra setup) handles source consolidation, and the Security Hub engine handles prioritization and deduplication.

> SIEM correlation analysis is essentially an application of **event correlation**, a field that first developed in network management (diagnosing telecom network faults). Individual events can be noise, but grouped by time, resource, and attack stage they gain meaning. In modern security, this grouping is mapped to the Tactics and Techniques of the **MITRE ATT&CK** framework: each Finding is placed on the attack chain of "Initial Access → Privilege Escalation → Lateral Movement → Exfiltration" (the kill chain, a lineage going back to the Cyber Kill Chain that Lockheed Martin formalized in 2011). That is why ASFF's `Types` field carries ATT&CK tactics in the form `TTPs/Initial Access/...`: it places each Finding at an attack stage so you can read "how far along the attack is."

## ASFF: The Common Language of Security Findings

ASFF (AWS Security Finding Format) is the standard JSON schema that every Finding follows. Looking at the key fields shows what gets standardized.

```json
{
  "SchemaVersion": "2018-10-08",
  "Id": "...",
  "ProductArn": "arn:aws:securityhub:...:product/aws/guardduty",
  "GeneratorId": "guardduty/finding-id",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Initial Access/UnauthorizedAccess:EC2-SSHBruteForce"],
  "Severity": {"Label": "HIGH", "Normalized": 70},
  "Resources": [{"Type": "AwsEc2Instance", "Id": "i-..."}],
  "Compliance": {"Status": "FAILED"},
  "Workflow": {"Status": "NEW"},
  "RecordState": "ACTIVE"
}
```

What to notice here is the **dual representation of Severity**. `Label` (CRITICAL/HIGH/MEDIUM/LOW/INFORMATIONAL) is for humans to read, and `Normalized` (an integer from 0 to 100) is for machines to compare and sort. Even if different sources report severity on their own scales (GuardDuty 1-10, Inspector CVSS 0-10), once they come in through ASFF they are normalized to 0-100 and can be lined up and compared.

> Behind Severity normalization is **CVSS (Common Vulnerability Scoring System)**. CVSS is the standard vulnerability severity scoring system created by FIRST (Forum of Incident Response and Security Teams), and v3.1/v4.0 are currently in use. It combines attack vector (network/local), attack complexity, privileges required, user interaction, and impact (confidentiality, integrity, availability) to produce a score from 0.0 to 10.0. Inspector v2 Findings carry this CVSS score as is, and ASFF maps it to `Normalized` 0-100 (roughly CVSS × 10). That is why, in Security Hub, you can put GuardDuty's behavior-based threats and Inspector's CVE vulnerabilities in the same priority queue and compare them. Without normalization, a machine could not decide "which to look at first: a threat scored 8.5 or a vulnerability with CVSS 9.1."

> ⚠️ **Pitfall**: Don't confuse ASFF's `Workflow.Status` with `RecordState`. **RecordState** (ACTIVE/ARCHIVED) indicates whether the Finding is still valid: when the problem is resolved, the source changes it to ARCHIVED. **Workflow.Status** (NEW/NOTIFIED/RESOLVED/SUPPRESSED) is the workflow stage at which an operator/automation handles this Finding. "Suppressing" a Finding means changing `Workflow.Status` to SUPPRESSED; it does not delete the Finding or ARCHIVE it, and the data remains for after-the-fact auditing. On the exam, the answer to "hide an accepted risk only from the dashboard while preserving the record" is to set Workflow to SUPPRESSED.

## Security Standards: Evaluating Compliance as Code

When you enable a predefined security standard (Security Standards), Security Hub automatically evaluates your account's resources against that standard's controls.

- **AWS Foundational Security Best Practices (FSBP)**: AWS-defined baseline security recommendations. The broadest.
- **CIS AWS Foundations Benchmark**: a consensus-based benchmark from CIS (Center for Internet Security).
- **PCI DSS**: the Payment Card Industry Data Security Standard.
- **NIST 800-53**: the US federal catalog of security controls for information systems.

Each control evaluates a resource as PASS/FAILED/NOT_AVAILABLE, and these results are combined into a **security score (%)**.

> Knowing the numbering and origin of these standards helps on the exam. The **CIS Benchmark** is a **consensus-based** recommendation from the security professional community, an industry consensus of "at least do this." **NIST SP 800-53** is a catalog of security and privacy controls for federal information systems published by the US NIST (National Institute of Standards and Technology), and it is the basis of FedRAMP (federal cloud certification). **PCI DSS** is managed by the PCI SSC (Security Standards Council) and is mandatory for every organization that handles card data. They come from different authorities (industry consensus / government standard / industry regulation), but Security Hub breaks all of them into per-control units and runs them through the same PASS/FAIL evaluation engine: an implementation of **Compliance as Code**, which reduces regulations to "controls that can be evaluated by code."

> Many of Security Hub's standard controls **use AWS Config Rules internally** (Day 3). When you turn on Security Hub, the necessary Config Rules are deployed automatically to evaluate resource changes, and the results come up as PASS/FAIL for Security Hub controls. In other words, Security Hub Standards = a curated bundle of Config Rules + an ASFF-integrated dashboard. That is why there is a prerequisite that "Config must be enabled to use Security Hub standards"; if you don't know this dependency, you fall into the trap of "I turned on Security Hub, so why are the controls NO_DATA?" Some controls also use direct API checks besides Config.

## Multi-Account Aggregation: Delegated Administrator

Like GuardDuty, Security Hub integrates with Organizations. When you designate a **Delegated Administrator** account (usually Audit), Findings from all member accounts are centrally aggregated into that account, standards are enabled in bulk, and new accounts are enrolled automatically. The operator sees the security posture of the whole organization on one screen.

```bash
aws securityhub enable-organization-admin-account --admin-account-id AUDIT-ACCT
aws securityhub update-organization-configuration --auto-enable
```

## Multi-Region Aggregation: Region Aggregator

Security Hub is a Regional service. An organization with resources spread across several Regions would have to look at the Security Hub console separately in each Region, and **Cross-Region Aggregation** prevents this. When you choose one **aggregation Region** and link the other Regions as **linked Regions**, the Findings of all Regions are replicated to the aggregation Region and visible in one place.

> ⚠️ **Pitfall**: Multi-account and multi-Region are **two orthogonal axes**. Delegated Administrator is integration along the **account** dimension, and Region Aggregator is integration along the **Region** dimension. When you need both (many accounts × many Regions), you must set up both together. On the exam, the answer to "see Findings from us-east-1 and eu-west-1 on one screen" is Region Aggregator, not Delegated Administrator, and the answer to "see Findings from accounts A, B, and C on one screen" is the opposite.

## Auto-Remediation: Three Paths

On top of Security Hub, "what to do automatically when a Finding appears" splits into three approaches. Distinguishing these three is the heart of the DOP exam.

### 1. Custom Action: Operator Triggers Manually from the Console

A **Custom Action** works like this: when an operator selects a Finding in the console and clicks "run this action," that event is published to EventBridge. It is "semi-automatic," triggered by a human's judgment.

```bash
aws securityhub create-action-target \
  --name "Quarantine EC2" --description "Move EC2 to quarantine SG" --id quarantine-ec2
```

The event EventBridge receives in this case is of type **`Security Hub Findings - Custom Action`**.

```json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Custom Action"],
  "resources": ["arn:aws:securityhub:...:action/custom/quarantine-ec2"]
}
```

### 2. Automatic (at Scale): Catch Every Finding with the Imported Event

To automatically handle every newly arriving Finding without going through a person, use the **`Security Hub Findings - Imported`** event type. All new/updated Findings flow through this event, so you narrow them with a filter and send them to Lambda/SSM.

```json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": {"Label": ["CRITICAL", "HIGH"]},
      "Compliance": {"Status": ["FAILED"]},
      "GeneratorId": [{"prefix": "aws-foundational-security-best-practices/v/1.0.0/S3"}]
    }
  }
}
```

### 3. Automation Rule: Rule-Based Handling Without Lambda (2023+)

The **Automation Rule**, added in 2023, is Security Hub's built-in automation, which updates Finding fields with rules alone, without EventBridge or Lambda. Example: "automatically suppress Low Findings in the Dev account."

```bash
aws securityhub create-automation-rule \
  --rule-name "Auto-suppress dev low" \
  --criteria '{"AwsAccountId":[{"Value":"DEV-ACCT","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"LOW","Comparison":"EQUALS"}]}' \
  --actions '[{"Type":"FINDING_FIELDS_UPDATE","FindingFieldsUpdate":{"Workflow":{"Status":"SUPPRESSED"}}}]'
```

> These three paths map exactly onto the classic spectrum of automation: **manual (human-in-the-loop) → rule-based → fully automatic (event-driven)**. Custom Action is HITL that explicitly inserts human judgment (safe for destructive operations that are hard to undo), Automation Rule is a rules engine suited to deterministic handling such as simple labeling and suppression, and Imported→Lambda is fully automatic for cases needing complex logic. Good security automation mixes the three according to the **risk and reversibility** of the task: safe, reversible actions such as "blocking S3 public access" are fully automatic, while high-impact ones such as "isolating a production instance" insert human approval through a Custom Action. The industry term SOAR (Security Orchestration, Automation and Response) refers to this orchestration.

> Don't confuse Automation Rule with Imported→Lambda. **An Automation Rule only updates a Finding's fields** (change Severity, suppress Workflow, add a note); **it cannot fix the actual resource**. Resource fixes such as "actually making an S3 bucket private" must go through EventBridge (Imported) → Lambda/SSM Automation. On the exam, "suppress or label a Finding without Lambda" is Automation Rule, but "actually modify the resource" can't be done with an Automation Rule, and the answer is EventBridge + Lambda/SSM.

## Auto-Remediation Example: A Public S3 Bucket

The typical auto-remediation flow goes like this. When FSBP's `S3.1` (S3 Block Public Access violation) control returns FAILED → that Finding is published as an Imported event → EventBridge filters it and invokes Lambda → Lambda enforces Block Public Access on the bucket.

```bash
aws events put-rule --name SecHubS3Public \
  --event-pattern '{"source":["aws.securityhub"],"detail-type":["Security Hub Findings - Imported"],"detail":{"findings":{"Compliance":{"Status":["FAILED"]},"GeneratorId":[{"prefix":"aws-foundational-security-best-practices/v/1.0.0/S3.1"}]}}}'
```

> Misconfigured public S3 buckets are a leading cause of cloud data leaks. In 2017, a contractor of INSCOM (the US Army Intelligence and Security Command), tied to the US Department of Defense, kept classified data in a publicly exposed S3 bucket and it was found by a security researcher, and in the same year NICE Systems, a Verizon contractor, exposed about 6 million customer records in a public S3 bucket. As such incidents repeated, AWS introduced the **S3 Block Public Access** feature in 2018 and later changed new buckets to block public access by default. The lesson: security must be not "configure it correctly once" but a closed loop that continuously detects and automatically corrects misconfigurations. The Security Hub FSBP S3.1 control + an auto-remediation Lambda implements exactly this closed loop.

## Insights: Querying Saved Findings

**Insights** is a feature that saves and groups frequently used Finding filters. Once you define a query such as "view Critical-severity S3-related Findings grouped by resource," you can check it repeatedly from the dashboard.

```bash
aws securityhub create-insight --name "Critical S3 Findings" \
  --filters '{"ResourceType":[{"Value":"AwsS3Bucket","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"CRITICAL","Comparison":"EQUALS"}]}' \
  --group-by-attribute ResourceId
```

## Differences from Trusted Advisor

| | Security Hub | Trusted Advisor |
|---|--------------|-----------------|
| Purpose | Aggregating security Findings + automation | AWS best-practice recommendations |
| Scope | Security-focused | Five axes: cost, performance, security, fault tolerance, service limits |
| Data | ASFF Findings | AWS's own check results |
| Automation | EventBridge, Custom Action, Automation Rule | Limited (some EventBridge) |

Some Trusted Advisor results can also be sent to Security Hub, but the two have different roles: Trusted Advisor offers broad recommendations, while Security Hub is the integration and automation hub for security operations.

> 🎯 **Scenario**: "An organization has 50 accounts × 3 Regions. See the GuardDuty, Inspector, and Macie Findings from all accounts and Regions on one screen, evaluate FSBP and CIS standard violations, immediately and automatically correct S3 public violations without a human, run production EC2 isolation only after operator approval, and automatically suppress Low Findings in the Dev account." → ① Designate the Audit account as the Security Hub Delegated Administrator + auto-enable (integrating the 50 accounts), ② consolidate the 3 Regions into the aggregation Region with Region Aggregator, ③ enable the FSBP and CIS Standards (internal Config Rules are deployed automatically), ④ S3 public: EventBridge `Findings - Imported` filter (GeneratorId prefix S3) → Lambda auto-remediation (fully automatic), ⑤ production EC2 isolation: create a Custom Action → operator selects and triggers it from the console → EventBridge `Findings - Custom Action` → SSM Runbook (HITL), ⑥ Dev Low suppression: Workflow=SUPPRESSED through an Automation Rule (no Lambda needed).

## Summary

Today's picture has four parts. First, **Security Hub is a cloud-native reimplementation of SIEM**: it follows the classic SIEM model of normalization (ASFF), aggregation, prioritization, and automation, and places Findings on the ATT&CK attack chain. Second, **ASFF normalizes the severity of different sources to 0-100** (a CVSS lineage) so threats and vulnerabilities can be compared in one queue, and Workflow.Status (handling stage) and RecordState (validity) are different axes. Third, **security standards (FSBP, CIS, PCI, NIST) are Compliance as Code**, and many of them use Config Rules internally to evaluate PASS/FAIL, so there is a Config dependency. Fourth, **auto-remediation has three paths: Custom Action (manual HITL), Automation Rule (rule-based field updates, cannot modify resources), and Imported→Lambda/SSM (fully automatic resource modification)**, chosen and mixed according to the risk and reversibility of the task. Multi-account is handled by Delegated Administrator and multi-Region by Region Aggregator, two orthogonal axes.

In the next post, we take a deep look at **AWS Config**, the engine behind this standards evaluation: resource compliance evaluation and auto-remediation.

---

## 📝 Practice Questions

**Question 1.** What is the mechanism by which ASFF makes the severity of different sources, such as GuardDuty (1-10 scale) and Inspector (CVSS 0-10), comparable in one priority queue?

A) Forcibly convert every source to the GuardDuty scale

B) Represent Severity dually as Label (CRITICAL/HIGH/... for humans) and Normalized (an integer 0-100 for machine comparison), normalizing the different scales to 0-100

C) Ignore severity and sort only by time

D) Separate each source into its own dashboard

**Answer: B**

Explanation: ASFF's Severity is represented dually as Label (CRITICAL/HIGH/MEDIUM/LOW, read by humans) and Normalized (an integer 0-100, compared and sorted by machines). When different scales such as GuardDuty's 1-10 and Inspector's CVSS 0-10 come in through ASFF, they are normalized to 0-100 and lined up for comparison (roughly CVSS × 10). Without normalization, a machine could not decide "which to look at first: a threat scored 8.5 or a vulnerability with CVSS 9.1." Forcing a single scale (A), time ordering (C), and separation (D) all run counter to the purpose of normalization.

---

**Question 2.** In Security Hub, you want to hide an accepted risk from the dashboard while preserving the record for later auditing. What is the correct action?

A) Change the Finding's RecordState to ARCHIVED

B) Change the Finding's Workflow.Status to SUPPRESSED: the data is preserved and hidden only from the dashboard

C) Delete the Finding

D) Turn off the source tool (GuardDuty)

**Answer: B**

Explanation: In ASFF, RecordState (ACTIVE/ARCHIVED) indicates whether the Finding is still valid, and Workflow.Status (NEW/NOTIFIED/RESOLVED/SUPPRESSED) indicates the handling workflow stage. "Suppressing" means setting Workflow.Status to SUPPRESSED: the Finding data is preserved for after-the-fact auditing and is hidden only from the dashboard/notifications. RecordState ARCHIVED (A) has a different meaning, "validity ended," and deletion (C) or disabling the source (D) conflicts with the requirement to preserve the record.

---

**Question 3.** You enabled Security Hub security standards (FSBP, CIS, and so on), but many controls show a no-data (NO_DATA) status. What is the most likely cause?

A) Security Hub does not support the Region

B) Many standard controls use AWS Config Rules internally, so Config must be enabled, but the Config Recorder is inactive

C) The account has no resources at all

D) The ASFF version is too old

**Answer: B**

Explanation: Many controls in Security Hub Standards use AWS Config Rules internally to evaluate resource changes and bring the results up as PASS/FAIL. In other words, Security Hub Standards = a curated bundle of Config Rules + an ASFF dashboard, so the Config Recorder must be on for controls to be evaluated. If Config is inactive, controls remain NO_DATA. If you don't know this dependency, you fall into the trap. Unsupported Region (A), no resources (C), and ASFF version (D) are not common causes.

---

**Question 4.** An operator wants to select a specific Finding in the Security Hub console and trigger a response directly (a destructive action that requires human judgment). What is the correct configuration, and which EventBridge event type is published?

A) Automation Rule: `Security Hub Findings - Imported`

B) Create a Custom Action → operator selects and triggers it → `Security Hub Findings - Custom Action` event → EventBridge → Lambda/SSM

C) Insight: `Security Hub Insight` event

D) Enable a Standard: `Compliance Change` event

**Answer: B**

Explanation: A Custom Action is a human-in-the-loop method in which the operator selects a Finding in the console and triggers it manually; on trigger, a `Security Hub Findings - Custom Action` event is published to EventBridge and invokes a Lambda/SSM Runbook. It is suited to inserting human approval for destructive, irreversible operations. Automatic handling of every new Finding without a person is `Security Hub Findings - Imported` (the event type in A is for the automatic flow). Insight (C) is a saved query and Standard (D) is compliance evaluation, so neither is a trigger mechanism.

---

**Question 5.** What is the correct implementation of "automatically suppress Low Findings in the Dev account without Lambda" and "actually fix a public S3 bucket to be private"?

A) Both with an Automation Rule

B) Both with EventBridge → Lambda

C) Suppression with an Automation Rule (field update), the actual resource fix with EventBridge (Imported) → Lambda/SSM Automation

D) Suppression with a Custom Action, the fix with an Insight

**Answer: C**

Explanation: An Automation Rule (2023+) only updates a Finding's fields (change Severity, suppress Workflow, add a note) without Lambda or EventBridge. So "suppress Dev Low" is correctly an Automation Rule. However, an Automation Rule cannot fix the actual resource: "actually making an S3 bucket private" must go through EventBridge (`Findings - Imported`) → Lambda/SSM Automation. This distinction is the key pitfall. Doing both the same way (A, B) or a wrong mapping (D) is incorrect.

---

**Question 6.** You want to see Findings from three Regions, us-east-1, eu-west-1, and ap-northeast-2, on one screen (with a single account). What is the correct setup?

A) Designate a Delegated Administrator

B) Choose an aggregation Region with Cross-Region Aggregation and link the others as linked Regions

C) Create a Custom Action

D) Create an Insight

**Answer: B**

Explanation: Security Hub is a Regional service. To see Findings from several Regions in one place, you must choose one aggregation Region with Cross-Region Aggregation and link the other Regions as linked Regions. Delegated Administrator (A) is account-level integration, a different, orthogonal axis: "multiple accounts" means A, "multiple Regions" means B. If you need both, set them up together. Custom Action (C) and Insight (D) have nothing to do with aggregation.

---

**Question 7.** Why is ASFF's `Types` field expressed in the form `TTPs/Initial Access/...`, and how is it used?

A) Simply for alphabetical sorting

B) To map Findings to MITRE ATT&CK Tactics and Techniques, placing each Finding at an attack chain (kill chain) stage so you can read "how far along the attack is"

C) To specify where the Finding is stored

D) For billing classification

**Answer: B**

Explanation: ASFF's Types field maps Findings to the Tactics (Initial Access, Privilege Escalation, Lateral Movement, Exfiltration, and so on) and Techniques of the MITRE ATT&CK framework. In the lineage of Lockheed Martin's Cyber Kill Chain, it places each Finding at an attack stage and lets SIEM correlation analysis read "how far the attack has progressed." Combining individually weak signals into an attack chain is the core of SIEM correlation. It has nothing to do with sorting (A), storage location (C), or billing (D).

---

## 📌 Today's Summary

There are four key points today. First, Security Hub is a cloud-native reimplementation of SIEM and follows the classic SIEM model of normalization (ASFF), aggregation, prioritization, correlation (ATT&CK mapping), and automation. Second, ASFF unifies the severity of different sources into Normalized 0-100 (a CVSS lineage) so threats and vulnerabilities can be compared in one queue, and Workflow.Status (handling stage; SUPPRESSED = hidden but preserved) and RecordState (validity) are different axes. Third, security standards (FSBP, CIS, PCI, NIST) are Compliance as Code, and many are evaluated using Config Rules internally, so there is a Config dependency. Fourth, auto-remediation has three paths: Custom Action (manual HITL, Custom Action event), Automation Rule (rule-based field updates, cannot modify resources), and Imported→Lambda/SSM (fully automatic resource modification); multi-account is integrated with Delegated Administrator and multi-Region with Region Aggregator, orthogonal axes.
