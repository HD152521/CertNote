# Day 2 - AWS Config: Configuration Items and Records, Rules (Managed/Custom Lambda), Conformance Pack, Auto-Remediation

If CloudTrail records "who did what" (activity), **AWS Config** records "what state a resource is in *now* and *at each point in the past*" (configuration). The two are complementary. In a breach investigation, CloudTrail shows the `AuthorizeSecurityGroupIngress` call, while AWS Config shows the resulting *state and timeline*: the security group was opened to *0.0.0.0/0:22* and stayed that way for days.

In security exams, Config is a core tool for "compliance evaluation," "configuration drift detection," and "enforcing the desired state (auto-remediation)."

A large share of the publicly reported large-scale cloud data exposure incidents were not vulnerability exploits but **configuration mistakes**. A wrongly opened storage bucket, a database exposed to the internet, a management port opened to 0.0.0.0/0: the recurring pattern is always the same. And the more painful fact these incidents showed in common is that the offending setting had been **in that state for weeks or months before the incident became known**. In other words, the failure occurs not at "the moment of misconfiguration" but in "the period during which the wrong state persisted, visible to no one." This is exactly why AWS Config exists: it treats configuration not as an *event* but as a *persisting state*, and from the moment that state deviates from the baseline it keeps flagging it red. CloudTrail answers "who opened it and when," but it is Config that answers "is it still open?"

### The Question Each of the Three Logs Answers

This week's tools look like they overlap, but they ask different questions. It is faster to get this table into your head first and then read the rest.

| | CloudTrail | AWS Config | VPC Flow Logs |
|---|-----------|-----------|---------------|
| Unit of record | One API call (an event) | A point-in-time snapshot of one resource (a state) | One network flow (a communication) |
| Question it answers | "Who did what?" | "What state is it in now / was it in then?" | "What traffic went back and forth?" |
| Time axis | A point | A line (an interval) | A point (an aggregation window) |
| What you cannot do without it | Identify the actor | Calculate how long the exposure lasted | Estimate the scale of exfiltration |
| Representative fields | `userIdentity`, `eventName` | `configuration`, `relationships` | `action`, `bytes`, `pkt-srcaddr` |
| Typical misconception | "Everything is kept" (data events are separate) | "It's a real-time blocking tool" (no, it's an evaluation tool) | "Packet contents are kept" (metadata only) |

The third row is the key. **CloudTrail draws points, and Config draws lines.** Only Config lets you write in a breach report, "the security group was opened at 14:02 on June 12 and closed at 09:30 on June 19, an exposure of 7 days and 7 hours." In regulatory response, the *duration* of exposure directly affects notification obligations and the calculation of fines, so this is not an academic distinction but a practical difference.

## Configuration Item and Configuration Recorder

Config's basic unit is the **Configuration Item (CI)**. A CI is a snapshot of one resource at a particular point in time, containing its attributes, relationships, related events, and metadata. Every time a resource changes, a new CI is created, forming a **configuration timeline**.

```json
{
  "configurationItemCaptureTime": "2026-06-24T08:00:00Z",
  "resourceType": "AWS::EC2::SecurityGroup",
  "resourceId": "sg-0abc123",
  "configurationItemStatus": "OK",
  "configuration": {
    "ipPermissions": [
      { "ipProtocol": "tcp", "fromPort": 22, "toPort": 22,
        "ipRanges": [{ "cidrIp": "0.0.0.0/0" }] }
    ]
  },
  "relationships": [
    { "resourceType": "AWS::EC2::Instance", "resourceId": "i-0def456",
      "relationshipName": "Is associated with" }
  ]
}
```

### How to Read a CI to the End

The example above is shortened for understanding, and a real CI has more fields that are decisive in an investigation.

| Field | Meaning | Why it matters |
|-------|---------|----------------|
| `configurationItemStatus` | `OK` / `ResourceDiscovered` / `ResourceDeleted` / `ResourceNotRecorded`, etc. | The moment a resource is deleted is also left as a CI — "when did the evidence disappear?" |
| `configurationStateId` | A sequence identifier for the state | A fixed reference to a particular state in the timeline |
| `relatedEvents` | **The CloudTrail event ID that made this change** | The bridge connecting Config ↔ CloudTrail |
| `relationships` | Connections to other resources | Tracing lateral movement paths and blast radius |
| `supplementaryConfiguration` | Additional settings that do not fit in the main configuration | Bucket policies, ACLs, lifecycles, and the like go here |
| `tags` | A snapshot of tags | Identifying owning team and environment, evaluating tag-based policies |
| `resourceCreationTime` | The time the resource was created | "Since when has it existed?" |

`relatedEvents` is the most valuable field in practice. After finding in Config that "this security group was opened at 14:02," you can jump straight to "the call that caused that change and its caller" using the CloudTrail event ID held in this field. The two services are connected **exactly by ID**, rather than being roughly matched by time.

> ⚠️ **Trap**: If you do not know `supplementaryConfiguration`, you will wander in an S3 bucket investigation. If you open only `configuration` in an S3 bucket's CI, you cannot see the bucket policy, because things like the policy, ACL, public access block settings, and lifecycle are held in `supplementaryConfiguration`. Before concluding that "Config has no bucket policy history," check this block first.

### The `configurationItemDiff` Carried in Change Notifications

A CI itself is "the full state at that point in time," but a configuration change notification (the message sent out through SNS or EventBridge) also carries **the difference showing what changed and how**. This is the form a person actually ends up reading.

```json
{
  "configurationItemDiff": {
    "changeType": "UPDATE",
    "changedProperties": {
      "Configuration.IpPermissions.0": {
        "changeType": "CREATE",
        "updatedValue": {
          "ipProtocol": "tcp",
          "fromPort": 3389,
          "toPort": 3389,
          "ipv4Ranges": [{ "cidrIp": "0.0.0.0/0" }]
        },
        "previousValue": null
      }
    }
  },
  "configurationItem": {
    "resourceType": "AWS::EC2::SecurityGroup",
    "resourceId": "sg-0abc123",
    "configurationItemCaptureTime": "2026-06-24T14:02:11Z",
    "awsRegion": "ap-northeast-2",
    "relatedEvents": ["9a1b2c3d-4e5f-6789-abcd-ef0123456789"],
    "tags": { "Environment": "prod", "Owner": "payments-team" }
  },
  "notificationCreationTime": "2026-06-24T14:02:47Z",
  "messageType": "ConfigurationItemChangeNotification"
}
```

Nearly everything an investigation needs is in this one block: **what** (inbound 3389 opened to the whole world), **when** (14:02:11), **on which resource** (sg-0abc123), **owned by whom** (payments-team), and even **by which API call** it happened (the CloudTrail event ID in `relatedEvents`).

> 🎯 **Scenario**: "Receive an immediate alert when a configuration change occurs, but receive only *changes that affect security*, not every change." The correct structure is to **filter Config's change notifications with an EventBridge rule**. Config sends two kinds of events to EventBridge, `Config Configuration Item Change` and `Config Rules Compliance Change`, and if you filter the latter to `NON_COMPLIANT` only, you receive just the "changes that violated a rule." A setup that streams every CI change as is to an SNS topic becomes a channel nobody looks at within a day.

```json
{
  "source": ["aws.config"],
  "detail-type": ["Config Rules Compliance Change"],
  "detail": {
    "messageType": ["ComplianceChangeNotification"],
    "newEvaluationResult": {
      "complianceType": ["NON_COMPLIANT"]
    },
    "configRuleName": ["restricted-common-ports", "s3-bucket-public-read-prohibited",
                       "encrypted-volumes", "iam-root-access-key-check"]
  }
}
```

The **Configuration Recorder** decides which resource types to record. You configure recording of all resources, only specific types, and whether to include global resources (such as IAM). The recorded CIs, snapshots, and the history of recording changes are stored in an S3 bucket through the **delivery channel** and notified via SNS.

```bash
# Recorder setup — all resources + global resources included
aws configservice put-configuration-recorder \
  --configuration-recorder name=default,roleARN=arn:aws:iam::111122223333:role/aws-service-role/config.amazonaws.com/AWSServiceRoleForConfig \
  --recording-group allSupported=true,includeGlobalResourceTypes=true

# Delivery channel — S3 (original retention) + SNS (change notifications)
aws configservice put-delivery-channel \
  --delivery-channel '{
    "name": "default",
    "s3BucketName": "central-config-logs",
    "snsTopicARN": "arn:aws:sns:ap-northeast-2:999988887777:config-changes",
    "configSnapshotDeliveryProperties": { "deliveryFrequency": "TwentyFour_Hours" }
  }'

# Start recording — if you skip this, nothing is kept even though you created the recorder
aws configservice start-configuration-recorder --configuration-recorder-name default

# Is it recording now? (the first command checked during an audit)
aws configservice describe-configuration-recorder-status
```

> ⚠️ **Trap**: If you run only `put-configuration-recorder` and omit `start-configuration-recorder`, the recorder *exists but is stopped*. In the console it looks like "Config is set up," yet not a single CI accumulates. Just as CloudTrail has `IsLogging=false`, Config has `recording=false`, and in an audit the two values are a pair that must be checked together. "Turned on" and "running" are different things.

Config is a *per-Region service*. You must turn on a recorder in each Region for it to record that Region's resources. Also, global resources such as IAM and CloudFront are set to be recorded in only one Region (usually us-east-1) to avoid duplication. "I turned on Config but resources in another Region are not being evaluated" is caused by not setting up a recorder in each Region.

Config's idea is *infrastructure as a state machine*. Every resource is a state machine whose state changes over time, and Config records those state transitions like event sourcing. Thanks to this, you can query "what state was this resource in two weeks ago?" like time travel, and this becomes the foundation of compliance audits and incident investigation.

## Config Rules: Compliance Evaluation

A **Config Rule** evaluates whether a resource satisfies the desired state and marks it `COMPLIANT` / `NON_COMPLIANT`. There are two evaluation triggers:
- **Configuration change triggered**: Evaluated when a CI is created or changed.
- **Periodic**: Evaluated at a set interval (1 hour to 24 hours).

Rules come from three sources:
1. **AWS Managed Rules**: Hundreds of predefined rules provided by AWS (for example, `s3-bucket-public-read-prohibited`, `encrypted-volumes`, `iam-password-policy`, `restricted-ssh`).
2. **Custom Lambda Rules**: Write the evaluation logic yourself in a Lambda function.
3. **Custom Policy Rules**: Write them with Guard (a policy language) without code.

```python
# Custom Lambda rule: evaluate whether an EBS volume is encrypted with a specific KMS key
import boto3, json

REQUIRED_KEY = "arn:aws:kms:ap-northeast-2:111122223333:key/aaaa-bbbb"

def lambda_handler(event, context):
    invoking = json.loads(event["invokingEvent"])
    ci = invoking["configurationItem"]
    config = boto3.client("config")

    compliance = "NOT_APPLICABLE"
    if ci["resourceType"] == "AWS::EC2::Volume":
        cfg = ci["configuration"]
        if cfg.get("encrypted") and cfg.get("kmsKeyId") == REQUIRED_KEY:
            compliance = "COMPLIANT"
        else:
            compliance = "NON_COMPLIANT"

    config.put_evaluations(
        Evaluations=[{
            "ComplianceResourceType": ci["resourceType"],
            "ComplianceResourceId": ci["resourceId"],
            "ComplianceType": compliance,
            "OrderingTimestamp": ci["configurationItemCaptureTime"],
        }],
        ResultToken=event["resultToken"],
    )
```

> 🎯 **Scenario**: "Evaluate an organization-specific rule that an AWS managed rule cannot express (for example, all EBS volumes must be encrypted with a *specific* CMK)." The answer is a Custom Lambda rule or a Custom Policy (Guard) rule. If it is only "whether it is encrypted," the managed `encrypted-volumes` is enough, but enforcing a *specific key* requires a custom rule.

Writing the same rule with **Guard (a Custom Policy rule)** without Lambda looks like this. There is no code and no function to deploy, so the maintenance burden is much smaller.

```
# Guard: every EBS volume must be encrypted with the designated CMK
let volumes = Resources.*[ Type == 'AWS::EC2::Volume' ]

rule ebs_must_use_corporate_cmk when %volumes !empty {
  %volumes.Properties.Encrypted == true
    <<violation: the EBS volume is not encrypted>>
  %volumes.Properties.KmsKeyId == "arn:aws:kms:ap-northeast-2:111122223333:key/aaaa-bbbb"
    <<violation: an unapproved KMS key is being used>>
}
```

The choice among the three rule sources is a *trade between expressiveness and operational burden*. Managed rules carry zero burden, but what they can express is limited to what AWS predefined; Guard can express organization-specific conditions within a declarative syntax; and Lambda can do anything, but **the function itself becomes something to manage and an attack surface.** In practice, a custom Lambda rule is an asset easily neglected over time: the runtime expires, the owner leaves, and one day it quietly starts throwing errors and turns every resource into `INSUFFICIENT_DATA`. So the default for the choice is to **step down in the order managed → Guard → Lambda, and never step down if the level above can express it.** "You can" and "you should" are different.

### There Are Four Evaluation Results

| Status | Meaning | Commonly misunderstood point |
|--------|---------|------------------------------|
| `COMPLIANT` | Meets the criteria | — |
| `NON_COMPLIANT` | Violates the criteria | It looks like the only state requiring a response, but it is not |
| `NOT_APPLICABLE` | A resource that is not an evaluation target of the rule | Normal |
| `INSUFFICIENT_DATA` | **Could not be evaluated** | Gray, neither green nor red — effectively a blind spot |

`INSUFFICIENT_DATA` is the trap. This state occurs when a custom Lambda throws an error, when the recorder does not record that resource type, or when the rule was just created and has not yet been evaluated. If you remove these items from the denominator when viewing the compliance rate on a dashboard, **the number "98% compliant" actually means "98% of what was evaluated,"** and the rest that was not evaluated is quietly at risk outside the statistics. The first thing to check when reading a compliance report is not the number of violations but the *number not evaluated*.

### Detective Evaluation and Proactive Evaluation

The default behavior of a Config rule is to evaluate **resources that already exist** (detective). However, some rules support a **proactive evaluation mode** in which you can ask *before* a resource is created whether its configuration would pass the rule. If you call this evaluation in the deployment pipeline or at the IaC stage, you can prevent violating configurations from being created in the first place.

```
[ Same rule, different points in time ]

  Write IaC template ─▶ Deployment pipeline ─▶ Create resource ─▶ In operation
        │                     │                     │                │
        │             Proactive evaluation          │       Detective evaluation
        │             "Would this violate           │       "Is the current state
        │              the rule if created           │        in violation?"
        │              as is?"                       │                │
        └─ Preventive control ┘                     └─ Detective control ┴─ Auto-remediation (response)
```

Proactive evaluation is **not supported by every rule.** And passing proactive evaluation does not automatically exempt a resource from detective evaluation. They are separate controls that apply the same criteria at different points in time, and a resource created directly in the console, bypassing the pipeline, never goes through proactive evaluation. So the judgment "we introduced proactive evaluation, so we can turn off the detective rules" is always wrong: the moment a bypass route exists, a control becomes a supplementary measure.

### Working with Rules: CLI

```bash
# Summary of compliance status by rule
aws configservice describe-compliance-by-config-rule \
  --config-rule-names restricted-common-ports encrypted-volumes

# List of resources violating a specific rule — "what needs fixing?"
aws configservice get-compliance-details-by-config-rule \
  --config-rule-name restricted-common-ports \
  --compliance-types NON_COMPLIANT \
  --query 'EvaluationResults[].EvaluationResultIdentifier.EvaluationResultQualifier'

# A resource's configuration history in time order — the core command of an investigation
aws configservice get-resource-config-history \
  --resource-type AWS::EC2::SecurityGroup \
  --resource-id sg-0abc123 \
  --earlier-time 2026-06-01T00:00:00Z \
  --later-time  2026-06-30T00:00:00Z \
  --query 'configurationItems[].{t:configurationItemCaptureTime,s:configurationItemStatus,e:relatedEvents}'

# Force an immediate re-evaluation (when checking after remediation)
aws configservice start-config-rules-evaluation \
  --config-rule-names restricted-common-ports

# Run manual remediation
aws configservice start-remediation-execution \
  --config-rule-name s3-bucket-public-read-prohibited \
  --resource-keys resourceType=AWS::S3::Bucket,resourceId=corp-sensitive
```

`get-resource-config-history` is the command that best shows why this service exists. It lays out every state change of one resource in time order and links straight to CloudTrail events through each item's `relatedEvents`. When you are asked in a breach investigation for "the last month of this security group," you start with this one line.

## Conformance Pack: Bundled Deployment of Rules and Remediation

Deploying and managing rules one by one is inefficient across multiple accounts and Regions. A **Conformance Pack** is a unit that bundles Config rules and remediation actions into **a single YAML template** for batch deployment and management. AWS provides **sample conformance packs** corresponding to PCI-DSS, HIPAA, NIST, CIS, FedRAMP, and more.

```yaml
Resources:
  S3PublicReadProhibited:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: s3-bucket-public-read-prohibited
      Source:
        Owner: AWS
        SourceIdentifier: S3_BUCKET_PUBLIC_READ_PROHIBITED
  EncryptedVolumes:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: encrypted-volumes
      Source:
        Owner: AWS
        SourceIdentifier: ENCRYPTED_VOLUMES
```

Combined with Organizations, an **organization conformance pack** deploys the same rule set to all member accounts, and the delegated administrator views the aggregated compliance state.

A conformance pack template can hold not only rules but also **remediation actions and parameters**. In other words, you bundle "the criteria for judging compliance with this regulation and the action to take on violation" into one file and version it.

```yaml
Parameters:
  RestrictedPortsParam:
    Type: String
    Default: '3389,23,3306,5432'

Resources:
  RestrictedCommonPorts:
    Type: AWS::Config::ConfigRule
    Properties:
      ConfigRuleName: restricted-common-ports
      Source:
        Owner: AWS
        SourceIdentifier: RESTRICTED_INCOMING_TRAFFIC
      InputParameters:
        blockedPort1: 3389
        blockedPort2: 23
      Scope:
        ComplianceResourceTypes: [ "AWS::EC2::SecurityGroup" ]

  RestrictedCommonPortsRemediation:
    Type: AWS::Config::RemediationConfiguration
    Properties:
      ConfigRuleName: restricted-common-ports
      TargetType: SSM_DOCUMENT
      TargetId: AWSConfigRemediation-RemoveUnrestrictedSourceInSecurityGroup
      Automatic: false          # Run it manually first, then automate
      MaximumAutomaticAttempts: 3
      RetryAttemptSeconds: 60
      Parameters:
        AutomationAssumeRole:
          StaticValue:
            Values: [ "arn:aws:iam::111122223333:role/ConfigRemediationRole" ]
        GroupId:
          ResourceValue: { Value: RESOURCE_ID }
```

### Not Confusing Config Rules, Conformance Packs, and Security Hub Standards

| | Config Rule | Conformance Pack | Security Hub security standard |
|---|------------|------------------|--------------------------------|
| Unit | One rule | A bundle of rules + remediation (a template) | A set of controls (CIS, FSBP, etc.) |
| Deployment method | Created individually | Batch deployment of a YAML template | Enable the standard |
| Organization deployment | Individual / CFN StackSets | **Organization conformance pack** | Security Hub delegated administrator |
| Remediation included | Linked separately | Can be included in the template | Not direct remediation (centered on aggregating results) |
| Custom rules | Possible | Possible (included in the template) | The standard itself is fixed |
| What it produces | Per-resource compliance state | Pack-level compliance score | Per-control results and an overall security score |

The relationship among the three is a **layered relationship, not a containment relationship.** Many Security Hub controls judge internally on the basis of Config rules, so if the Config recorder is off, those controls are not evaluated properly. When the exam says "we turned on Security Hub but many controls produce no results," it is usually **because Config is not recording in that Region.** The misunderstanding in the opposite direction is also common: Config is the compliance *evaluation engine*, and Security Hub is the layer that gathers results from multiple sources and *shows them on one screen*. Deployment and judgment happen in Config; aggregation and prioritization happen in Security Hub.

A conformance pack is an implementation of *compliance as code*. Instead of people checking regulatory controls against a checklist, it turns them into code that machines evaluate continuously. This is *continuous compliance*: not an annual audit snapshot but evaluation at every moment a change occurs. It ties directly to the ISCM (Information Security Continuous Monitoring) concept of NIST 800-137.

A failure pattern that has repeated for a long time in the audit practice of regulated industries is the so-called "audit week phenomenon." When an audit is announced, settings are tidied up only that week, and once the auditor leaves they revert one by one for operational convenience. Audits based on paper checklists structurally cannot see this reversion, **because they see only a point (the audit date) and not the line (the year).** What the combination of conformance packs and the Config timeline changes is exactly this. You can ask not "were you compliant on the audit date?" but "how many days of the last year did you spend in a violating state?", and at that moment compliance becomes a state rather than an event. This is the only reason cloud regulatory response can become stronger than a paper audit.

## Auto Remediation: Going Beyond Detection to Correction

A rule need not stop at finding `NON_COMPLIANT`; it can enforce the desired state through **auto-remediation**. Config calls an **SSM Automation document** as the remediation action. You attach an AWS-provided document (for example, `AWS-DisableS3BucketPublicReadWrite`, `AWS-DetachIAMPolicy`) or a custom document.

```yaml
RemediationConfiguration:
  ConfigRuleName: s3-bucket-public-read-prohibited
  TargetType: SSM_DOCUMENT
  TargetId: AWS-DisableS3BucketPublicReadWrite
  Automatic: true
  MaximumAutomaticAttempts: 3
  RetryAttemptSeconds: 60
  Parameters:
    AutomationAssumeRole:
      StaticValue: { Values: ["arn:aws:iam::111122223333:role/ConfigRemediationRole"] }
    S3BucketName:
      ResourceValue: { Value: "RESOURCE_ID" }
```

With `Automatic: true`, remediation runs immediately when a violation is detected (if manual, it is triggered by a button in the console). The IAM role for remediation (`AutomationAssumeRole`) must have the actual permission to make the fix.

Auto-remediation is powerful, but it can cause *loops* or *service outages*. For example, if it automatically closes a 0.0.0.0/0 rule that is operationally necessary, an outage occurs. Also, when remediation changes a resource, a new CI is created and the rule is evaluated again, so a poor design runs a change → evaluate → remediate loop. In production it is safer to first validate with manual remediation or alerts only and then automate.

> 🎯 **Scenario**: "Automatically block an S3 bucket if one that is publicly readable is created." Answer: connect the Config rule `s3-bucket-public-read-prohibited` + the SSM Automation remediation `AWS-DisableS3BucketPublicReadWrite` with `Automatic: true`. You could also block it with an SCP, but Config remediation is a detective-and-response control that *reverts* resources that *have already been created*, while an SCP is a preventive control that *blocks it in the first place*. Distinguishing the two layers (detective vs preventive) is the exam point.

### The Order for Safely Turning On Auto-Remediation

Auto-remediation is one of the easiest features to cause an incident with in production. There is an adoption order that has been proven in practice.

```
Stage 1  Deploy rules only        → just observe NON_COMPLIANT (days to weeks)
Stage 2  Clean up false positives → filter exceptions with tags/Scope
Stage 3  Manual remediation       → Automatic: false. A person presses the button and checks the result
Stage 4  Non-production automation→ Automatic: true only in dev/stage accounts
Stage 5  Production automation    → together with change notifications and a rollback procedure
```

The "exception handling" in Stage 2 is especially important. A Config rule's `Scope` can specify not only resource types but also **tag keys and values**, so you can exclude resources carrying a tag such as `Exception=approved` from evaluation. However, this mechanism is a double-edged sword, because whoever can attach the tag can neutralize the rule. That is why organizations that use exception tags almost without exception **separately monitor "the act of attaching that tag itself"** (alarms on CloudTrail's `CreateTags`/`TagResource` events). When you build a door that bypasses a control, you must put a camera on that door too.

The permissions of the remediation role (`AutomationAssumeRole`) tend to bloat quietly. Each time you add one remediation document, the required permissions grow, and eventually a "role that can fix almost anything in this account" is created. But this role is **a role that SSM Automation can assume without human approval.** That is, taking over the remediation pipeline immediately gives you those permissions. When designing auto-remediation, you should assign a separate least-privilege role for each rule, or at the very least apply `aws:SourceAccount` and `ssm.amazonaws.com` restrictions to the role's trust policy. It is a common irony that an asset built for a security control becomes a new privilege escalation path.

## Config Aggregator: Aggregation Across Accounts and Regions

A **Configuration Aggregator** gathers Config data from multiple accounts and Regions into a single view. With an Organizations-based aggregator, you see the rule compliance status and resource inventory of the entire organization in one place. The security team can query "where is unencrypted EBS across the whole organization?" in one go.

```
[ Layout of organization-wide configuration visibility ]

  Account A (ap-northeast-2, us-east-1, eu-west-1)
  Account B (ap-northeast-2, us-east-1)          A recorder must run in every Region
  Account C (ap-northeast-2)                      ← A Region not turned on = missing wholesale from the inventory
     │  │  │
     └──┴──┴────────▶ Configuration Aggregator (security account)
                        ├─ Organization-based: no per-account approval needed, new accounts auto-included
                        ├─ Individual-account-based: each account needs PutAggregationAuthorization
                        └─ Query the whole organization at once with Advanced Query
```

An aggregator **only gathers; it does not turn anything on.** If the recorder is off in some account or Region, the resources in that scope appear in the aggregated view as neither *violating nor compliant* but simply as if they did not exist. This is the most dangerous failure mode in a multi-account environment, because the dashboard may be green not "because it is safe" but "because nobody is looking." So, paradoxically, the first Config rule at the organization level should be one that checks **"is the Config recorder turned on in every account and Region?"**

```sql
-- Aggregator advanced query: security groups with management ports open to the world across the organization
SELECT accountId, awsRegion, resourceId, resourceName, tags
WHERE resourceType = 'AWS::EC2::SecurityGroup'
  AND configuration.ipPermissions.ipRanges.cidrIp = '0.0.0.0/0'
  AND configuration.ipPermissions.fromPort IN (22, 3389, 3306, 5432)

-- Unencrypted EBS volumes across the organization
SELECT accountId, awsRegion, resourceId, configuration.size
WHERE resourceType = 'AWS::EC2::Volume'
  AND configuration.encrypted = false
```

> 🎯 **Scenario**: "40 accounts of an acquired affiliate have just joined the organization. The security team must paint a picture of 'what is where and what is at risk' within a day." The order is (1) enable the Config recorder in every account and Region, (2) create an organization aggregator in the security account, (3) obtain the inventory and the list of exposed resources with advanced queries, (4) deploy baseline rules in bulk with an organization conformance pack. If you skip (1) and start from (2), you will see an empty dashboard. Config knows only the world *from the point it began recording*, just like CloudTrail.

Config's real value lies in *advanced query* and the *relationship graph*. Because Config records relationships between resources (`relationships`), you can trace "all resources that use this KMS key" and "all ENIs this security group is attached to." Config advanced query looks up inventory with a SQL-like syntax:

```sql
SELECT resourceId, resourceName
WHERE resourceType = 'AWS::EC2::SecurityGroup'
  AND configuration.ipPermissions.ipRanges.cidrIp = '0.0.0.0/0'
```

This relationship graph is decisive when reconstructing "lateral movement" paths in a breach investigation. Crossing CloudTrail's activity log with Config's state and relationship graph paints the full picture of the attack, and this leads into tomorrow's (Day 3) network logging and Day 5's synthesis.

## Where Costs Leak When Using Config

Config billing has two main branches: **the number of configuration items recorded** and **the number of rule evaluations**. Both are proportional to "how often resources change," so resource types with heavy churn dominate the bill.

| Cause of cost spikes | Why it happens | Response |
|----------------------|----------------|----------|
| Mass creation and deletion of ENIs and instances due to Auto Scaling and containers | A CI accumulates on every creation and deletion | Exclude those types from the recording scope or consider daily recording |
| Recording global resources in every Region | IAM and the like are recorded redundantly in as many Regions as exist | Set `includeGlobalResourceTypes=true` in only one Region |
| Applying change-triggered rules to high-frequency resources | Evaluated every time a CI is created | Switch to periodic evaluation or narrow the `Scope` |
| Remediation loop | Remediate → new CI → re-evaluate → remediate … | Confirm the remediation logic is idempotent, cap the maximum attempts |

Narrowing the resource types to record in order to cut cost is also **a decision to reduce visibility.** In particular, IAM-related types (`AWS::IAM::Role`, `AWS::IAM::Policy`), network boundary types (`AWS::EC2::SecurityGroup`, `AWS::EC2::NetworkAcl`), and data store types (`AWS::S3::Bucket`, `AWS::RDS::DBInstance`) are the three groups referenced most often in breach investigations, so they must not be made targets of cost optimization. If you must cut, the principle is to start with high-frequency, low-value types (such as transient ENIs). **The decision of "what to look at" is a risk decision disguised as a budget question.**

## Summary

If CloudTrail leaves *events*, AWS Config leaves *state and its duration*. This one difference separates "who opened it" from "how long was it open," and the latter drives regulatory notification and damage assessment. Using Config in practice means making four decisions. **What to record** (the recorder's scope: it must be turned on in every Region, global resources in only one Region, and if you create it and forget `start`, nothing is kept), **what to judge against** (step down in the order managed → Guard → Lambda, but do not step down if the level above can express it), **how far to revert automatically** (turn remediation on only in the order observe → manual → non-production automatic → production automatic), and **how to see the whole organization on one screen** (deploy with an organization conformance pack and gather with an aggregator). And above all of this sits one warning: the green of a compliance dashboard may not mean safety. `INSUFFICIENT_DATA` and Regions with the recorder off are not counted as violations and are simply invisible, so when reading a report **look at the number not evaluated before the number of violations.**

---

## 📝 Practice Questions

**Question 1.** Which statement most accurately distinguishes the roles of AWS Config and CloudTrail?

A) Both record only API calls in the same way, so turning on one is enough  
B) CloudTrail records "who did what" (activity), while Config records "what state a resource was in at each point in time" (configuration state and history)  
C) Config records real-time API calls, while CloudTrail records periodic snapshots  
D) Config records network traffic, while CloudTrail records configuration changes  

**Answer: B**  
Explanation: CloudTrail records API call activity (who/when/what), while Config records the state at each point in time, the configuration timeline, and relationships between resources through the resource's configuration items (CIs). The two are complementary and must be used together to cross-analyze activity and state. Their roles are not the same, and traffic logging is the domain of VPC Flow Logs.

---

**Question 2.** You must evaluate an organization-specific requirement that cannot be expressed with AWS managed rules: "all EBS volumes must be encrypted with a specific CMK (a designated KMS key ARN)." What is an appropriate method?

A) Use only the managed rule `encrypted-volumes`  
B) Evaluate a match of the specific key ARN with a Custom Lambda rule or a Custom Policy (Guard) rule  
C) Evaluate with CloudTrail data events  
D) Block EBS creation with an SCP  

**Answer: B**  
Explanation: The managed `encrypted-volumes` rule only checks *whether* a volume is encrypted. Enforcing encryption with a *specific key* requires custom evaluation logic, so you compare `configuration.kmsKeyId` against the designated ARN with a Custom Lambda rule (or a codeless Custom Policy/Guard rule). CloudTrail records activity and is not a compliance evaluation engine, and an SCP is a preventive control that has difficulty expressing the "encrypted with a specific key" evaluation.

---

**Question 3.** You want to consistently deploy and manage many Config rules and remediations for multiple standards (CIS, PCI-DSS) across a multi-account organization. What is most appropriate?

A) Create the rules one by one in the console in each account  
B) Use an Organization Conformance Pack to bundle the rules and remediations into a YAML template and deploy it to all member accounts  
C) Write a separate Lambda rule for each account  
D) Set up only a Config Aggregator  

**Answer: B**  
Explanation: A conformance pack is a unit that bundles many Config rules and remediation actions into one YAML template for deployment and management; an organization conformance pack deploys it in bulk to all member accounts in the organization, and a delegated administrator views the aggregated compliance status. Individual creation lacks consistency and scalability, and an Aggregator is merely a tool for *aggregating and viewing* data and does not deploy rules.

---

**Question 4.** When a publicly readable S3 bucket is created, you want to block it automatically without human intervention. How do you implement this with Config?

A) Attach SSM Automation remediation (`AWS-DisableS3BucketPublicReadWrite`) to the `s3-bucket-public-read-prohibited` rule with `Automatic: true`  
B) Turn on CloudTrail integrity validation  
C) Set up a Config Aggregator  
D) Create a rule and review it manually every day  

**Answer: A**  
Explanation: When a Config rule detects a violation, it invokes the attached SSM Automation document as the remediation action, and with `Automatic: true` it runs automatically as soon as the violation is detected. `AWS-DisableS3BucketPublicReadWrite` is an AWS-provided document that blocks public access. Integrity validation and an Aggregator are unrelated to remediation, and manual review does not satisfy the "without human intervention" requirement.

---

**Question 5.** What is the biggest risk to watch for when introducing Config automatic remediation into a production environment?

A) Config is automatically replicated across Regions, doubling the cost  
B) When remediation changes a resource, a new CI is created and the rule is re-evaluated, so a poor design can cause a change → evaluate → remediate loop or an operational outage  
C) Remediation works without an IAM role, so permission control is impossible  
D) Automatic remediation applies only to global resources  

**Answer: B**  
Explanation: When remediation modifies a resource, a new configuration item is created and the rule is evaluated again; if the design is wrong, an evaluate-remediate loop can run, or a setting that is operationally necessary (for example, an intentionally public rule) can be closed, causing an outage. That is why it is safer to validate with manual remediation and notifications first, then automate. Remediation permissions are controlled through `AutomationAssumeRole`, and there is no behavior such as automatic Region replication or global-only restriction.

---
