# Day 3 - AWS Config: Closed-Loop Control Principles for State Recording, Drift Detection, and Automated Remediation

The day after infrastructure is defined as code and deployed, someone in the console changes a line in a security group by hand. That one line becomes an incident days later. The most persistent problem in cloud operations is this: "The declared state (desired state) and actual state (actual state) diverge over time" — this is drift. AWS Config addresses this problem directly: "Record every change in every resource without exception, continuously evaluate whether it complies with policy, and when it deviates, automatically restore it." From the console, Config looks like a "service that shows resource inventory and compliance scores," but beneath that lie the concepts of feedback control from control theory, the history of configuration management, and declarative policy evaluation. Today we examine how Config records every change as Configuration Items, how Rules evaluate compliance, how Remediation uses SSM Automation to auto-correct drift, and where the costs and pitfalls lie.

In the DOP exam, Config appears as the core of "compliance evaluation + automated drift remediation," with scenarios like "to instantly correct specific policy violations without human intervention," "to deploy multiple standards at once across the organization," and "to view compliance across multiple accounts and regions from one place." Distinguishing the 3 Rule types (Managed/Custom Lambda/Custom Policy), connecting Remediation to SSM Automation, and understanding Conformance Packs and Aggregators reveals the answers.

## Configuration Management and Closed-Loop Control — Config's Philosophical Roots

Config's concept is not new. **Configuration Management** originated as a discipline in the 1950s U.S. defense and aerospace industries: "track the state of all components in complex systems and maintain control so that they never deviate from the approved baseline." Transitioning to software, tools like CFEngine (1993), Puppet (2005), Chef (2009), and Ansible (2012) implemented this by "converging and maintaining servers toward their declared state."

The common principle underlying these tools is **closed-loop control**. In control theory, a closed-loop (feedback control) system ①compares the goal state (setpoint) with ②the measured actual state, ③calculates the error, and ④manipulates in the direction that reduces that error. A thermostat is the classic example — it compares the set temperature with actual temperature and turns the heater on and off.

AWS Config applies this closed loop to infrastructure precisely. The **goal state** is the Config Rule (policy), the **measurement** is the Configuration Recorder (state recording), the **error judgment** is Rule evaluation (COMPLIANT/NON_COMPLIANT), and the **manipulation** is Remediation (automated correction). When drift occurs, an error is detected and Remediation restores the actual state to the goal — just as a thermostat restores a room to its set temperature.

> 💡 **Related Theory**: Configuration management tools broadly share **convergent** and **idempotent** semantics. Idempotency is the property that "applying the same operation multiple times produces the same result as applying it once" (mathematically, `f(f(x)) = f(x)`), as in Ansible's "if already at goal state, do nothing." Config's Remediation must also be idempotent — executing the SSM document that corrects NON_COMPLIANT states multiple times must have no side effects. Another key distinction is **imperative ("execute these commands") vs. declarative ("reach this state")**. Config is strictly declarative — it declares only the goal "S3 must be encrypted," leaving how to reach it to Remediation. Declarativeness's advantage is that it converges toward the goal regardless of the current state.

## Configuration Item — Point-in-Time Snapshots of Every Change

The foundation of Config is the **Configuration Item (CI)**. A CI is a snapshot capturing a resource's state at one point in time — including attributes, relationships (which SG, subnet, and EBS this EC2 is attached to), metadata, and even the CloudTrail event that triggered the change. Each time a resource changes, a new CI is created, forming a **Configuration History**. This history is stored in S3 and can trigger SNS notifications on change.

CIs are powerful because of the **time axis**. "What state was this security group in 6 months ago?" and "what changed just before this modification?" become answerable. This is the foundation for incident forensics and change auditing.

> 🔍 **Deeper**: Config recording **relationships** between resources is more important than just recording attributes. A CI captures graph structure: "EC2 i-xxx is attached to SG sg-yyy, located in subnet subnet-zzz, has EBS vol-www attached." This constructs a **resource dependency graph** rather than a simple list. Queries like "what resources are affected if we delete this SG?" and "what is in this subnet?" become possible. This is Config's cloud-native implementation of a **CMDB (Configuration Management Database)** — the central repository of IT assets and relationships defined by ITIL. This is why Advanced Query (coming next) can query this graph with SQL.

> ⚠️ **Pitfall**: Don't confuse Config with CloudTrail. **CloudTrail** records "who called what API when" (behavior/audit log), while **Config** records "what state did the resource end up in as a result" (state/configuration). "Who changed this SG?" is CloudTrail; "what rules did this SG have then and now?" is Config. They're complementary — CIs link to the CloudTrail events that caused the change, giving you the complete picture: "who → did what → to what state." In exams: "track resource state changes and compliance" is Config; "audit API calls and users" is CloudTrail.

## Config Rule — Three Types of Policy Evaluation

Config Rules evaluate whether resources comply with policy. There are three types, and this distinction appears directly in exams.

| Type | Defined How | When |
|------|----------|------|
| **AWS Managed Rule** | AWS-provided (hundreds) | Standard policies — review first |
| **Custom Lambda Rule** | Evaluation logic written in Lambda | Complex custom logic, external calls needed |
| **Custom Policy Rule** | Guard DSL declaratively defined policy | Policy expressed as code without Lambda (2021+) |

Representative Managed Rules: `s3-bucket-public-read-prohibited`, `encrypted-volumes`, `iam-password-policy`, `restricted-ssh`, `root-account-mfa-enabled`, `rds-storage-encrypted`.

Evaluation triggers are two-fold. A **Configuration change trigger** evaluates every time a resource changes (near-real-time), while a **Periodic trigger** evaluates on a fixed schedule (e.g., 24 hours). Rules depending on external state should use periodic evaluation, while rules that need to catch violations immediately should use change triggers.

> 🔍 **Deeper**: Why **Custom Policy Rule's Guard DSL** matters. **CloudFormation Guard** is a domain-specific language expressing policy declaratively (policy-as-code) like `Resources.*[ Type == "AWS::S3::Bucket" ] { Properties.BucketEncryption EXISTS }` saying "resources of this type must have this property." It's in the lineage of Kubernetes's **OPA (Open Policy Agent)/Rego**, HashiCorp's **Sentinel**, and other policy engines. The key value is "instead of writing evaluation logic in Lambda code (imperative), express policy declaratively so humans can read, verify, and version-control it." Guard rules can be reused in both pre-deployment (checking templates with `cfn-guard validate` in CI/CD) and post-deployment (evaluating real resources as Config Custom Policy Rules), unifying "shift-left" (blocking before deploy) and "runtime evaluation" under one policy language.

```
rule s3_bucket_must_be_encrypted {
  Resources.*[ Type == "AWS::S3::Bucket" ] {
    Properties.BucketEncryption EXISTS
  }
}
```

## Conformance Pack — Bundled Policy Deployment

Deploying rules one-by-one isn't realistic for dozens of rules across hundreds of accounts. A **Conformance Pack** bundles multiple Config Rules + Remediation into a single YAML and deploys them all at once. Pre-defined packs are provided (PCI DSS, NIST 800-53, FedRAMP, HIPAA, AWS Well-Architected, etc.), and custom YAMLs are also supported.

```yaml
Resources:
  S3PublicProhibitedRead:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-public-read
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
      Scope:
        ComplianceResourceTypes: [AWS::S3::Bucket]
```

```bash
aws configservice put-conformance-pack --conformance-pack-name security-baseline \
  --template-s3-uri s3://conformance-packs/security-baseline.yaml
```

> 🔍 **Deeper**: Conformance Pack **internally uses CloudFormation StackSets** for org-wide deployment. That is, "define a rule bundle, then StackSets pushes it identically to each account and region." So Conformance Pack inherits StackSets' deployment model (parallel/sequential, failure tolerance thresholds). To clarify the relationship: **StackSets** is a general-purpose tool for multi-account deployment of any CloudFormation resources, while **Conformance Pack** is a specialized abstraction on top for "Config Rule + Remediation bundles." In exams: "deploy PCI/NIST compliance bundles org-wide" is Conformance Pack; "deploy arbitrary infrastructure resources multi-account" is StackSets.

## Auto-Remediation — The Manipulation Phase That Closes the Loop

Evaluation alone doesn't close the loop. When NON_COMPLIANT is found, it must actually be fixed. Config's **Remediation** links a Rule to an **SSM Automation Document**, executing that document when a violation is found to correct the state.

```bash
aws configservice put-remediation-configurations \
  --remediation-configurations '[{
    "ConfigRuleName":"s3-bucket-public-read-prohibited",
    "TargetType":"SSM_DOCUMENT",
    "TargetId":"AWS-DisableS3BucketPublicReadWrite",
    "Parameters":{
      "AutomationAssumeRole":{"StaticValue":{"Values":["arn:aws:iam::...:role/RemediationRole"]}},
      "S3BucketName":{"ResourceValue":{"Value":"RESOURCE_ID"}}
    },
    "Automatic":true,
    "MaximumAutomaticAttempts":5,
    "RetryAttemptSeconds":60
  }]'
```

If `Automatic: true`, violations are corrected immediately upon detection; if `false`, an operator triggers correction manually from the console. `MaximumAutomaticAttempts` and `RetryAttemptSeconds` control retry behavior.

> ⚠️ **Pitfall**: Auto-Remediation has dangerous scenarios — **fix-violate loops (flapping)**. If some external process keeps returning a resource to NON_COMPLIANT state (e.g., another automation opens an SG, Config closes it, another opens it again...), Config attempts endless corrections, causing API throttling, cost explosion, and noise. `MaximumAutomaticAttempts` is the safety valve that stops this loop. Also, Remediation can be **destructive** — "force S3 buckets private" can break legitimate public website buckets. So production often puts exception tags on important resources or makes destructive remediations `Automatic:false` requiring human approval. In exams, "auto-remediation repeats endlessly" usually answers to "external process keeps violating + MaximumAutomaticAttempts not set."

> 📚 **Case Study**: A famous incident illustrating drift and bad remediation is GitLab's 2017 database deletion. An engineer manually deleting a production database directory while responding to a replication delay found that all five backup mechanisms failed, losing ~6 hours of data. The core lesson: "manual intervention is the enemy of configuration management, and safety nets (backups, validation) must be verified to actually work at all times." This is Config's value — it constantly evaluates that safety nets themselves (backup settings, encryption, replication) are enabled (e.g., `db-instance-backup-enabled` rule), catching NON_COMPLIANT immediately and auto-correcting. The philosophy is "don't trust that safety nets are on; prove they're on at all times" — this is the spirit of closed-loop compliance.

## Aggregator — Unified Multi-Account, Multi-Region View

Since Config is per-account and per-region, viewing organization-wide compliance requires an **Aggregator**. Create an Aggregator in the Audit account with Organization as source, and all member accounts' Config data across all regions becomes unified.

```bash
aws configservice put-configuration-aggregator --configuration-aggregator-name org-aggregator \
  --organization-aggregation-source RoleArn=arn:aws:iam::...:role/AWSConfigOrgRole,AllAwsRegions=true
```

## Advanced Queries — SQL Queries Over Inventory

**Advanced Query** queries Config data with SQL DSL. Similar syntax to CloudWatch Logs Insights, and cross-account queries are possible via Aggregator.

```sql
SELECT
  configuration.targetResource.resourceType,
  COUNT(*) as count
WHERE configuration.complianceType = 'NON_COMPLIANT'
GROUP BY configuration.targetResource.resourceType
```

This is the interface that makes the resource dependency graph (CMDB) queryable — "how many unencrypted EBS volumes are in which accounts" is answered in one query.

## Config + EventBridge — Routing Compliance Changes

Config emits events to EventBridge when compliance state changes. These can be routed to Slack alerts, Lambda, or SSM (a more flexible path than Remediation alone).

```json
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {"newEvaluationResult": {"complianceType": ["NON_COMPLIANT"]}}
}
```

## Cost Control — recordingMode

Config charges **per resource change (CI creation)**. Frequently-changing resources (e.g., EC2 constantly spawned and terminated by Auto Scaling, frequently-refreshed metadata) drive up costs. **recordingMode** controls whether to record all resources, only certain types, or bundle high-frequency resources by day.

> 💡 **Related Theory**: This cost structure exemplifies **observability's fundamental tradeoff** — "the more you record, the better you see, but the more it costs" — the same thinking as **sampling** in distributed tracing (keeping only some traces). With Config, you must choose between "record every change flawlessly (full audit trail, high cost)" and "record only important resources (low cost, blind spots)." The practical pattern is: record must-comply resources (IAM, S3, SG) completely, and exclude noisy, regulation-agnostic resources. The principle "observability isn't free" sits at the core of Config's cost design.

## Config vs Security Hub Standards

| | AWS Config | Security Hub Standards |
|---|-----------|------------------------|
| Role | Resource state recording + rule evaluation + auto-remediation engine | Curated, integrated Config Rules into security dashboard |
| Relationship | Underlying engine | Leverages Config Rules internally |
| Standalone | Yes | Depends on Config |

As seen in Day 2, many Security Hub Standards controls run Config Rules internally. Config is the evaluation engine, and Security Hub is the layer above that consolidates and visualizes results in ASFF.

> 🎯 **Scenario**: "Organization-wide (OU): ① all S3 buckets in all new/existing accounts must not be public and must be encrypted, auto-corrected instantly; ② EBS must be encrypted ③ view non-compliant resources across all accounts/regions in Audit account; ④ custom policy (tags mandatory) without Lambda; ⑤ protect against endless auto-remediation loops." → ① S3 public/encryption Managed Rules bundled in Conformance Pack deployed to OU via StackSets + SSM Automation Remediation (`Automatic:true`) on each rule; ② `encrypted-volumes` Managed Rule + Remediation; ③ Audit account Organization Aggregator (AllAwsRegions) + Advanced Query; ④ tag-mandatory policy as Custom Policy Rule (Guard DSL); ⑤ Remediation with `MaximumAutomaticAttempts`/`RetryAttemptSeconds` + exception tags on justified resources. Compliance changes routed via EventBridge to Slack alerts.

## Summary

Today we saw four key points. First, **Config applies closed-loop control to infrastructure** — goal (Rule), measurement (Recorder), error judgment (evaluation), and manipulation (Remediation) following the thermostat model, standing in the lineage of declarative, idempotent configuration management (Puppet/Chef/Ansible). Second, **Configuration Item records resource point-in-time state and relationship graph (CMDB)**. This complements CloudTrail's API-call focus by handling resource state. Third, **Rules come in 3 types: Managed/Custom Lambda/Custom Policy (Guard DSL, OPA/Sentinel lineage)**; Conformance Packs bundle via StackSets; Remediation closes the loop via SSM Automation, preventing flapping and destructive fixes with `MaximumAutomaticAttempts` and exception tags. Fourth, **Aggregator unifies multi-account/region**, Advanced Query enables SQL, recordingMode manages observability cost tradeoffs, and Security Hub Standards leverages Config as the underlying evaluation engine.

Next we'll extend compliance into **automated audit evidence collection, data classification, and vulnerability scanning** via Audit Manager, Macie, and Inspector.

---

## 📝 Practice Questions

**Question 1.** What is the control-theoretic name for the structure that AWS Config implements: "compare the desired state (Rule) with the actual state (Recorder), detect the error (NON_COMPLIANT), and automatically correct it (Remediation)"?

A) Open-loop control

B) Closed-loop (feedback) control — like a thermostat, comparing target and measurement and acting to reduce the error

C) Stateless processing

D) Batch processing

**Answer: B**

Explanation: Config applies closed-loop (feedback) control to infrastructure. The desired state (Config Rule), measurement (Configuration Recorder), error determination (COMPLIANT/NON_COMPLIANT evaluation), and actuation (Remediation) map directly onto the thermostat model — when drift occurs the error is detected and Remediation converges the actual state to the desired state. This is the philosophy of declarative, idempotent configuration management (the Puppet/Chef/Ansible lineage). Open-loop (A) is control without feedback, and stateless (C) and batch (D) are unrelated.

---

**Question 2.** Which services answer, respectively, "who changed this security group and when" and "what rules did that security group have 6 months ago"?

A) CloudTrail for both

B) Config for both

C) "Who changed it" is CloudTrail (API call and action auditing); "what was the past state" is Config (resource state and configuration recording)

D) GuardDuty for both

**Answer: C**

Explanation: CloudTrail records "who called which API and when" (action and audit logs), and Config records "what state the resource ended up in as a result" (state and configuration, Configuration History). The two are complementary: Config's CI links the CloudTrail event that caused the change, giving the full picture of "who → did what → resulting in which state." "Resource state changes and compliance" is Config, and "API calls and user tracking" is CloudTrail. A, B, and D, which treat them as a single service, are wrong.

---

**Question 3.** You want to express policy as declarative code and evaluate it with a Config Rule without writing a Lambda function. What is the correct choice and its lineage?

A) Custom Lambda Rule

B) Custom Policy Rule (CloudFormation Guard DSL) — in the same policy-as-code lineage as OPA/Rego and HashiCorp Sentinel, the same rules can be reused for pre-deployment checks (cfn-guard) and runtime evaluation

C) Only Managed Rules are possible

D) Conformance Pack

**Answer: B**

Explanation: A Custom Policy Rule describes policy declaratively with the CloudFormation Guard DSL (`Resources.*[Type=="AWS::S3::Bucket"]{Properties.BucketEncryption EXISTS}`). It belongs to the same policy-as-code lineage as Kubernetes' OPA/Rego and HashiCorp Sentinel, and can be read by people and version-controlled without Lambda code (imperative). The same Guard rules are reused for pre-deployment template checks (cfn-guard, shift-left) and post-deployment runtime evaluation. Custom Lambda (A) requires writing code, and a Conformance Pack (D) is a deployment unit for bundles of rules, not an evaluation method.

---

**Question 4.** You want to deploy a bundle of compliance rules such as PCI DSS and NIST 800-53 to the entire organization (OU) at once. What is the correct tool and its internal mechanism?

A) Manually create the rules one by one in each account

B) Conformance Pack — bundles multiple Config Rules + Remediations in YAML and internally deploys to the entire OU through CloudFormation StackSets

C) Aggregator

D) Advanced Query

**Answer: B**

Explanation: A Conformance Pack is a unit that bundles multiple Config Rules and Remediations into a single YAML for deployment, supporting both predefined packs (PCI/NIST/HIPAA/FedRAMP, etc.) and custom ones. Internally it uses CloudFormation StackSets to push identically to each account and Region, so it inherits the StackSets deployment model. "A compliance bundle to the whole OU" is a Conformance Pack, while "multi-account deployment of arbitrary infrastructure resources" is StackSets. Manual creation (A) is impractical, an Aggregator (C) consolidates queries, and Advanced Query (D) is SQL querying, not a deployment tool.

---

**Question 5.** After enabling automatic Remediation, the same resource repeatedly cycles between being fixed and violating again (flapping), causing API throttling and a cost surge. What are the cause and the safeguard?

A) It is normal behavior, so ignore it

B) The cause is an external process that keeps reverting the resource to NON_COMPLIANT combined with MaximumAutomaticAttempts not being set — limit retries with MaximumAutomaticAttempts and RetryAttemptSeconds, and use an exclusion tag for legitimate exceptions

C) Turn off Config

D) Change the Region

**Answer: B**

Explanation: If some external automation keeps reverting a resource to a violating state, Config tries to fix it endlessly and flapping occurs. MaximumAutomaticAttempts and RetryAttemptSeconds are the safeguards that break this loop. Also, to keep Remediation from breaking legitimate resources (for example, an intentionally public website bucket), use an exception tag, or insert human approval with Automatic:false for destructive fixes. The answer to "automatic fixing repeats endlessly" is usually "an external process keeps violating + MaximumAutomaticAttempts not set." Disabling Config (C) or changing Regions (D) is not a solution.

---

**Question 6.** You want to view NON_COMPLIANT resources across 50 accounts × all Regions on a single screen in the Audit account, and answer "how many unencrypted EBS volumes are in which account" with one query. What is the correct combination?

A) Check each account console one by one

B) Set up an Organization Aggregator (AllAwsRegions) in the Audit account + cross-account queries with Advanced Query (SQL DSL)

C) Deploy only a Conformance Pack

D) Create only an EventBridge rule

**Answer: B**

Explanation: Config is per Region and per account, so an Aggregator is needed for consolidated queries. Creating an Organization-source Aggregator in the Audit account and covering all Regions with AllAwsRegions consolidates the data from all accounts and Regions. On top of that, Advanced Query (SQL DSL) runs a cross-account query at once, such as "COUNT resources with complianceType='NON_COMPLIANT' by type." This is the interface that makes the resource dependency graph (CMDB) queryable. Manual checking (A) is impractical, a Conformance Pack (C) is for deployment, and EventBridge (D) is for routing, so none is a tool for consolidated querying.

---

**Question 7.** The AWS Config bill came out much higher than expected. EC2 instances that are constantly created and deleted by Auto Scaling and frequently updated metadata appear to be the main culprits. What is the correct control?

A) Turn Config off completely

B) Adjust the recording scope with recordingMode — record resources subject to compliance enforcement (IAM, S3, SG) without gaps, and exclude noisy, regulation-irrelevant, frequently changing resources or batch them daily

C) Increase the instance type

D) Reduce the number of Regions

**Answer: B**

Explanation: Config bills per resource change (CI creation), so frequently changing resources drive up cost. This is the fundamental trade-off of observability ("the more you record the better you see, but the more it costs," the same idea as sampling in distributed tracing). Using recordingMode to choose between recording all resources, selective recording, and batching high-frequency resources daily, the practical pattern is to record regulated resources without gaps and exclude regulation-irrelevant noise. Disabling Config (A) creates a compliance blind spot, and instance type (C) and reducing Regions (D) are unrelated to the root cause.

---

## 📌 Today's Summary

Today's key points were four-fold. First, Config applies closed-loop (feedback) control to infrastructure — goal (Rule), measurement (Recorder), error judgment (evaluation), and manipulation (Remediation) follow the thermostat model, standing in the lineage of declarative, idempotent configuration management. Second, Configuration Item records both point-in-time resource state and relationship graph (CMDB), complementing CloudTrail's audit of "API calls" with management of "resource state." Third, Rules come in 3 types: Managed/Custom Lambda/Custom Policy (Guard DSL, OPA/Sentinel lineage); Conformance Pack bundles via StackSets; Remediation closes the loop via SSM Automation while preventing flapping and destructive fixes with `MaximumAutomaticAttempts` and exception tags. Fourth, Aggregator unifies multi-account/region viewing, Advanced Query enables SQL querying, recordingMode controls observability cost tradeoffs, and Security Hub Standards uses Config as the underlying evaluation engine.
