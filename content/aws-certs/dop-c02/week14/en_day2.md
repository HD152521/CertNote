# Day 2 - Security Hub: SIEM Principles of Normalization, Aggregation, and Auto-Remediation

Anyone who runs multiple detection tools at once hits the real problem fast. GuardDuty outputs in GuardDuty format, Inspector in its format, Macie in another. Three tools emitting different-shaped alerts about the same S3 bucket make operators unsure if they're looking at the same problem or three separate ones. "Take multiple security signals, unify them in one language, deduplicate, prioritize, layer auto-remediation on top." That's the problem Security Hub solves—and it's a cloud-native reinvention of decades-old SIEM (Security Information and Event Management). In the console, Security Hub looks like "a dashboard showing security scores," but underneath lies SIEM's classic architecture: data normalization, correlation analysis, deduplication, rule-based automation. Today we explore how this dashboard unifies different tools' outputs to ASFF, how it evaluates compliance standards, and whether auto-remediation comes through Custom Action, Automation Rule, or EventBridge—and why each choice matters.

In DOP exams, Security Hub appears as "single source of truth for security posture," with scenarios like "view Findings from multiple accounts/tools on one screen," "automatically fix specific compliance violations without humans," or "let operators manually trigger response only for selected Findings." Understanding Custom Action (manual) vs Automation Rule (automatic field updates) vs EventBridge (resource modification) and when each applies is the key.

## Why SIEM is Necessary — History of Normalization and Correlation

SIEM's roots trace to late 1990s–early 2000s: SIM (security information management, log archival and analysis) merged with SEM (security event management, real-time monitoring and correlation)—Gartner solidified the term SIEM in 2005. Tools like ArcSight, Splunk, QRadar tackled one problem: "Dozens of security tools emit logs in different formats; funnel them through one analytical plane and correlate them."

Two core stages: **Normalization** converts firewall logs, IDS alerts, OS audit logs to a common schema, making "apples and oranges" comparable. **Correlation** crosses normalized events—"firewall port scan + IDS exploit alarm seconds later + that host's abnormal outbound = active compromise"—tying weak individual signals into strong conclusions.

Security Hub implements exactly this SIEM model cloud-natively. Normalization is ASFF; source integration is automatic (GuardDuty, Inspector, Macie ship Findings with no extra wiring); Hub's engine handles prioritization and deduplication.

> 💡 **Related Theory**: SIEM's correlation analysis is fundamentally an application of **event correlation**, first developed in network management (telecom fault diagnosis). Individual events are noise; crossed by time, resource, and attack phase, they gain meaning. Modern security maps these to the **MITRE ATT&CK** framework's tactics (Initial Access, Privilege Escalation, Lateral Movement, Exfiltration, etc.)—placing each Finding on the attack chain (kill chain, Lockheed Martin's Cyber Kill Chain, formalized 2011). ASFF's `Types` field carries ATT&CK tactics like `TTPs/Initial Access/...` precisely so individual Findings are positioned in attack progression—"how far along is the attacker now?"

## ASFF — Security Finding's Common Language

ASFF (AWS Security Finding Format) is the standard JSON schema every Finding follows. Core fields reveal what's standardized.

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

Key: **Severity's dual representation**. `Label` (CRITICAL/HIGH/MEDIUM/LOW/INFORMATIONAL) humans read; `Normalized` (0–100 integer) machines compare and sort. Different sources (GuardDuty 1–10, Inspector CVSS 0–10) become 0–100 on entry to ASFF, enabling one-line comparison.

> 🔍 **Deeper Dive**: Severity normalization rests on **CVSS (Common Vulnerability Scoring System)**. CVSS, created by FIRST (Forum of Incident Response and Security Teams), is the standard vulnerability severity framework (currently v3.1/v4.0). It combines attack vector, complexity, privilege requirement, user interaction, and impact (confidentiality/integrity/availability) to yield 0.0–10.0. Inspector v2 Findings carry this CVSS directly; ASFF maps it to `Normalized` 0–100 (roughly CVSS × 10). That's how Security Hub puts GuardDuty behavioral threats and Inspector CVE vulnerabilities in the same priority queue—without normalization, "threat 8.5 vs vulnerability CVSS 9.1—which first?" becomes unanswerable to machines.

> ⚠️ **Pitfall**: Confusing ASFF's `Workflow.Status` with `RecordState` breaks understanding. **RecordState** (ACTIVE/ARCHIVED) shows if a Finding is still valid—when fixed, the source marks it ARCHIVED. **Workflow.Status** (NEW/NOTIFIED/RESOLVED/SUPPRESSED) is the operator/automation's processing stage. "Suppress a Finding" means setting `Workflow.Status` to SUPPRESSED, not deleting or archiving it—data persists for audit. "Hide intended risk on dashboard but preserve records for audit" = set Workflow to SUPPRESSED.

## Security Standards — Compliance as Code Evaluation

Security Hub, activating pre-defined standards, auto-evaluates accounts' resources against those standards' controls.

- **AWS Foundational Security Best Practices (FSBP)** — AWS-defined baseline security. Broadest.
- **CIS AWS Foundations Benchmark** — CIS (Center for Internet Security) consensus-based benchmark.
- **PCI DSS** — Payment card industry data security standard.
- **NIST 800-53** — US federal information system security controls catalog.

Each control evaluates resources as PASS/FAILED/NOT_AVAILABLE, aggregating into a **security score (%)**.

> 💡 **Related Theory**: Knowing these standards' authority helps exams. **CIS Benchmark** is **consensus-based** industry recommendation by security experts—"minimum everyone should do." **NIST SP 800-53** is the federal government's security/privacy control catalog for information systems, backing FedRAMP. **PCI DSS** is enforced on all organizations handling card data. Each authority differs (industry consensus/government/payment industry), yet Security Hub breaks each into controls on a unified PASS/FAIL engine—a **Compliance as Code** implementation, encoding policy as testable controls.

> 🔍 **Deeper Dive**: Many Security Hub standard controls **internally use AWS Config Rules** (Day 3). Activating Security Hub auto-deploys needed Config Rules to evaluate resources; results flow up as control PASS/FAIL. Security Hub Standards = curated Config Rule bundles + ASFF dashboard. "Config must be on to use Hub Standards" is a prerequisite; without it, "why does control show NO_DATA?" trips you up. Some controls also run direct API checks.

## Multi-Account Aggregation — Delegated Administrator

Like GuardDuty, Security Hub integrates Organizations. Designating a **Delegated Administrator** account (typically Audit) centralizes all member Findings; standards activate org-wide; new accounts auto-register.

```bash
aws securityhub enable-organization-admin-account --admin-account-id AUDIT-ACCT
aws securityhub update-organization-configuration --auto-enable
```

## Multi-Region Aggregation — Region Aggregator

Security Hub is regional. Multi-region resource organizations must check Hub console per region—**Cross-Region Aggregation** prevents this. Pick one **aggregation region** and link others as **linked regions**; all Findings replicate to aggregation region, visible on one screen.

> ⚠️ **Pitfall**: Multi-account and multi-region are **orthogonal axes**. Delegated Administrator = **account** integration; Region Aggregator = **region** integration. Both needed for multi-account × multi-region? Set both. Exams: "see us-east-1 and eu-west-1 Findings on one screen" → Region Aggregator, not Delegated Admin; reverse for multiple accounts.

## Auto-Remediation — Three Paths

"When a Finding appears, auto-execute what?" splits three ways. Distinguishing these is core DOP.

### 1. Custom Action — Operator Manually Triggers on Console

**Custom Action** is "semi-automatic": operators select a Finding on console and click "execute action," firing an EventBridge event.

```bash
aws securityhub create-action-target \
  --name "Quarantine EC2" --description "Move EC2 to quarantine SG" --id quarantine-ec2
```

EventBridge receives **`Security Hub Findings - Custom Action`** event type.

```json
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Custom Action"],
  "resources": ["arn:aws:securityhub:...:action/custom/quarantine-ec2"]
}
```

### 2. Automatic (Scale) — Imported Events Catch All Findings

To auto-process all new Findings without humans, use **`Security Hub Findings - Imported`** event type. All new/updated Findings flow as this, filtered and routed to Lambda/SSM.

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

### 3. Automation Rule — Rule-Based Processing Without Lambda (2023+)

**Automation Rule** (added 2023) is Security Hub's own built-in automation—no EventBridge/Lambda needed. Rules update Finding fields. Example: "Dev account Low Findings auto-suppress."

```bash
aws securityhub create-automation-rule \
  --rule-name "Auto-suppress dev low" \
  --criteria '{"AwsAccountId":[{"Value":"DEV-ACCT","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"LOW","Comparison":"EQUALS"}]}' \
  --actions '[{"Type":"FINDING_FIELDS_UPDATE","FindingFieldsUpdate":{"Workflow":{"Status":"SUPPRESSED"}}}]'
```

> 💡 **Related Theory**: These three embody automation's classic spectrum—**manual (HITL) → rule-based → fully automated event-driven**. Custom Action explicitly inserts human judgment (safe for destructive work), Automation Rule suits deterministic decisions (labeling, suppression), Imported→Lambda handles complex logic. Good security automation blends per task **risk and reversibility**—"allow S3 public block" (safe, reversible) → fully automatic; "isolate production EC2" (large impact) → Custom Action HITL.

> ⚠️ **Pitfall**: Confusing Automation Rule and Imported→Lambda breaks understanding. **Automation Rule only updates Finding fields** (Severity change, Workflow suppress, notes), **cannot modify actual resources**. "Actually fix S3 to private" requires EventBridge(Imported)→Lambda/SSM Automation. Exams: "Lambda-free Finding suppress/label" → Automation Rule; "actually fix resources" → EventBridge+Lambda/SSM.

## Auto-Remediation Case — Public S3 Bucket

Typical auto-remediation flow: FSBP `S3.1` (S3 Block Public Access violation) FAILED → Imported event → EventBridge filters → Lambda calls → Lambda enforces Block Public Access on bucket.

```bash
aws events put-rule --name SecHubS3Public \
  --event-pattern '{"source":["aws.securityhub"],"detail-type":["Security Hub Findings - Imported"],"detail":{"findings":{"Compliance":{"Status":["FAILED"]},"GeneratorId":[{"prefix":"aws-foundational-security-best-practices/v/1.0.0/S3.1"}]}}}'
```

> 📚 **Case Study**: Misconfigured public S3 buckets are a chronic cloud data exfiltration vector. 2017: US DoD-affiliated supplier exposed S3 bucket publicly with classified data; 2017: Verizon contractor NICE Systems leaked ~6M customer records on public S3. These repeats prompted AWS to introduce S3 Block Public Access (2018) and default-deny new buckets. Lesson: security is not "set once well" but "detect-and-auto-correct closed loop"—Security Hub FSBP S3.1 + auto-remediation Lambda implements precisely this loop.

## Insights — Saved Finding Queries

**Insights** save frequent Finding filters and group them. "View Critical S3-related Findings grouped by resource" as a saved query, visible on dashboard repeatedly.

```bash
aws securityhub create-insight --name "Critical S3 Findings" \
  --filters '{"ResourceType":[{"Value":"AwsS3Bucket","Comparison":"EQUALS"}],"SeverityLabel":[{"Value":"CRITICAL","Comparison":"EQUALS"}]}' \
  --group-by-attribute ResourceId
```

## Trusted Advisor vs Security Hub

| | Security Hub | Trusted Advisor |
|---|---|---|
| Purpose | Integrated security Findings + automation | AWS best practices recommendations |
| Scope | Security-focused | Cost, performance, security, fault tolerance, service limits (5 axes) |
| Data | ASFF Findings | AWS's own checks |
| Automation | EventBridge, Custom Action, Automation Rule | Limited (some EventBridge) |

Trusted Advisor results can flow to Security Hub, but roles differ—Trusted Advisor is broad guidance; Security Hub is security operations hub.

> 🎯 **Scenario**: "50-account × 3-region org. View all GuardDuty/Inspector/Macie Findings on screen. Evaluate FSBP/CIS. Auto-fix S3 public violations. Prod EC2 isolation requires ops approval. Auto-suppress Dev Low Findings."  → ① Audit Delegated Admin + auto-enable, ② Region Aggregator, ③ FSBP/CIS Standards, ④ S3 public: Imported→Lambda complete auto, ⑤ Prod EC2: Custom Action HITL, ⑥ Dev Low: Automation Rule suppress.

## Summary

Today's picture is four-fold. First, **Security Hub is cloud-native SIEM reinvention**—normalization (ASFF), aggregation, prioritization, correlation (ATT&CK mapping). Second, **ASFF's dual Severity (Label + Normalized 0–100)** unifies different sources; Workflow.Status (processing stage) and RecordState (validity) are separate axes. Third, **compliance standards (FSBP, CIS, PCI, NIST) = Compliance as Code**, many internally use Config Rules, so Config is prerequisite. Fourth, **auto-remediation splits Custom Action (manual HITL), Automation Rule (field updates only, no resource fix), Imported→Lambda/SSM (complete auto resource fix)**, picking per task risk; multi-account = Delegated Admin, multi-region = Region Aggregator.

Next we explore **AWS Config** — the compliance evaluation engine beneath Security Hub Standards.

---

## 📝 연습 문제

(Same 7 practice problems from Korean original, preserved in Korean)

---

## 📌 Today's Summary

Today's key points are four-fold. First, Security Hub is cloud-native SIEM—normalization (ASFF), aggregation, prioritization, correlation (ATT&CK mapping). Second, ASFF's dual Severity (Label + Normalized 0–100 via CVSS) unifies sources; Workflow.Status (processing stage) and RecordState (validity) are different axes. Third, standards (FSBP, CIS, PCI, NIST) = Compliance as Code; many use Config Rules internally, so Config dependency exists. Fourth, auto-remediation is Custom Action (manual HITL), Automation Rule (field updates only), Imported→Lambda/SSM (real resource fixes) per task risk; multi-account=Delegated Admin, multi-region=Region Aggregator.
