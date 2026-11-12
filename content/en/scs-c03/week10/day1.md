# Day 1 - Automated Response Pipeline: EventBridge + SSM Automation + Lambda for Auto-Remediation of Findings

The maturity of incident response is decided by *how fast, how consistently, and without human hands* a threat is contained. Even if GuardDuty takes 5 minutes to detect command-and-control (C2) traffic from an EC2 instance, if it then takes a person 30 minutes to read the finding in the console and take an isolation action, the attacker has already finished lateral movement. The essence of an automated remediation pipeline is *event-driven automation that converts a detection signal into a deterministic action*. From the exam's perspective, the key is to draw the flow precisely: which event, through which routing, by which execution engine, with which permissions, is remediated.

The standard skeleton of this pipeline has three parts: **signal sources (GuardDuty/Security Hub/Config/Inspector)** → **router (EventBridge)** → **executor (SSM Automation or Lambda)**. The responsibilities and traps of each stage are tested repeatedly.

## Signal Sources: Where Findings Come From and What They Look Like

The trigger for automated response is mostly an event that a security service emits to EventBridge. The `source` and `detail-type` of the event pattern differ by signal source.

- **GuardDuty**: `source: aws.guardduty`, `detail-type: "GuardDuty Finding"`. `detail.severity` (0-10 scale), `detail.type` (e.g., `UnauthorizedAccess:EC2/SSHBruteForce`), and the affected resource in `detail.resource`.
- **Security Hub**: `source: aws.securityhub`, `detail-type: "Security Hub Findings - Imported"`. Because it is the normalized ASFF (AWS Security Finding Format), it can receive *multiple signal sources in one shape*; it is preferred as the single entry point for automation.
- **AWS Config**: `source: aws.config`, `detail-type: "Config Rules Compliance Change"`. Triggers on a transition to non-compliance (NON_COMPLIANT).
- **Inspector**: vulnerability findings.

```json
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }],
    "type": [{ "prefix": "UnauthorizedAccess:EC2" }]
  }
}
```

The event pattern above selects only findings *with severity 7 or higher that belong to the EC2 unauthorized-access family*. EventBridge patterns support content-based filtering such as `numeric`, `prefix`, and `anything-but` to reduce noise. If you respond indiscriminately to every finding, false positives lead to incidents in which healthy workloads are isolated.

This is the *feedback loop* of control theory applied to security. The sensor (GuardDuty) measures the state of the system, and the controller (EventBridge rule) compares it against a threshold and activates the actuator (SSM/Lambda). Just as in industrial control a threshold set too sensitively causes *hunting* (needless oscillation), security automation also overreacts to normal fluctuation unless the threshold (severity) and conditions are set carefully. That is why the standard approach is to start with notifications only (human-in-the-loop) and move in stages to automated remediation as trust builds.

### Comparing Signal Sources: What to Use as the Trigger

Even for the same incident, the shape of the pipeline changes depending on which signal you choose as the trigger. If a choice contains wording like "handle findings from multiple accounts and multiple tools with a single automation," the answer is almost always Security Hub aggregation.

| Signal source | `source` | Representative `detail-type` | Nature of the signal | Place in automated response |
|---|---|---|---|---|
| GuardDuty | `aws.guardduty` | `GuardDuty Finding` | Detects threat *behavior* | Immediate containment such as isolation and session revocation |
| Security Hub | `aws.securityhub` | `Security Hub Findings - Imported` | Multi-source aggregation (ASFF) | Organization-wide single entry point |
| Security Hub custom action | `aws.securityhub` | `Security Hub Findings - Custom Action` | An analyst presses a button in the console | Semi-automatic: *a human pulls the trigger* |
| AWS Config | `aws.config` | `Config Rules Compliance Change` | Deviation in configuration *state* | Remediation that restores configuration |
| Inspector | `aws.inspector2` | `Inspector2 Finding` | Vulnerabilities and CVEs | Patch orchestration |
| Macie | `aws.macie` | `Macie Finding` | Sensitive data exposure | Bucket lockdown, permission reduction |
| API calls via CloudTrail | Each service (`aws.s3`, `aws.iam`, etc.) | `AWS API Call via CloudTrail` | Audit event | Detecting root usage and policy changes |

The fourth column of the table is the axis of design judgment. **GuardDuty speaks of "behavior" and Config speaks of "state."** A behavior signal is time-sensitive, so immediate containment is the answer, and a state signal calls for remediation that returns the setting to its original value. "Automatically close an S3 bucket that became public" is the Config path, and "this instance is communicating with C2 right now" is the GuardDuty path. When the two are mixed in the choices, first decide whether the verb in the requirement is *contain* or *restore*.

`Security Hub Findings - Custom Action` is an often overlooked card that is useful on the exam. When an analyst selects a finding in the console and presses a custom action button, that action itself becomes an EventBridge event. It is the answer to a requirement such as "fully automatic is risky, but we want analysts to run the standard response with one click": this is the point where AWS offers the **middle ground between automation and manual work** as a product.

### ASFF: Why Make Security Hub the Single Entry Point

Security Hub normalizes findings from GuardDuty, Inspector, Macie, Config, and third parties into a single JSON schema called **ASFF (AWS Security Finding Format)**. From the automation code's standpoint this is decisive: the branching statements that parse different field paths for each signal source disappear.

```json
// ASFF core fields (excerpting only the parts automation actually reads)
{
  "SchemaVersion": "2018-10-08",
  "Id": "arn:aws:guardduty:ap-northeast-2:111122223333:detector/abc/finding/xyz",
  "ProductArn": "arn:aws:securityhub:ap-northeast-2::product/aws/guardduty",
  "AwsAccountId": "111122223333",
  "Types": ["TTPs/Command and Control/UnauthorizedAccess:EC2-MaliciousIPCaller.Custom"],
  "Severity": { "Label": "HIGH", "Normalized": 70 },
  "Resources": [
    { "Type": "AwsEc2Instance", "Id": "arn:aws:ec2:ap-northeast-2:111122223333:instance/i-0deadbeef",
      "Details": { "AwsEc2Instance": { "IamInstanceProfileArn": "arn:aws:iam::111122223333:instance-profile/app-role" } } }
  ],
  "Workflow": { "Status": "NEW" },
  "RecordState": "ACTIVE"
}
```

Remember three things. ① **Severity is expressed twice**: GuardDuty's 0.1-10 scale (typically Low 1.0-3.9, Medium 4.0-6.9, High 7.0-8.9) is re-expressed in Security Hub as `Severity.Label` (INFORMATIONAL/LOW/MEDIUM/HIGH/CRITICAL) and `Severity.Normalized` (0-100). If you mix the two paths, the thresholds go out of alignment. ② `Resources[].Id` is an **ARN**, so a runbook that needs only the instance ID needs one more round of parsing. ③ `Workflow.Status` and `RecordState` are the **key to preventing duplicate execution** in automation: to avoid reprocessing findings already moved to `NOTIFIED`/`RESOLVED`, filter with `Workflow.Status: ["NEW"]` in the event pattern.

```json
// Security Hub entry-point pattern: severity + signal source + unprocessed state at once
{
  "source": ["aws.securityhub"],
  "detail-type": ["Security Hub Findings - Imported"],
  "detail": {
    "findings": {
      "Severity": { "Label": ["HIGH", "CRITICAL"] },
      "Workflow": { "Status": ["NEW"] },
      "RecordState": ["ACTIVE"],
      "ProductName": ["GuardDuty"]
    }
  }
}
```

### Event Pattern Syntax: Operators That Reduce Noise

EventBridge patterns support content-based filtering beyond simple value matching. If you don't know these operators, you drift toward the inefficient design of "filter with an if statement inside Lambda," and such choices are placed as wrong answers on the exam too.

| Operator | Example | Use |
|---|---|---|
| `numeric` | `{"numeric": [">=", 7]}` | Severity threshold |
| `prefix` | `{"prefix": "UnauthorizedAccess:"}` | Grouping a family of finding types |
| `anything-but` | `{"anything-but": ["ap-northeast-2"]}` | Only activity outside approved Regions |
| `exists` | `{"exists": true}` | Only events that have a specific field |
| `cidr` | `{"cidr": "10.0.0.0/8"}` | Distinguishing internal and external IPs |

```json
// Select only "outside approved Regions, severity 7 or higher, credential family"
{
  "source": ["aws.guardduty"],
  "detail-type": ["GuardDuty Finding"],
  "region": [{ "anything-but": ["ap-northeast-2", "us-east-1"] }],
  "detail": {
    "severity": [{ "numeric": [">=", 7] }],
    "type": [{ "prefix": "UnauthorizedAccess:IAMUser" }, { "prefix": "CredentialAccess:" }],
    "resource": { "accessKeyDetails": { "accessKeyId": [{ "exists": true }] } }
  }
}
```

**The principle is to finish filtering at the router.** The very fact that an event reached the executor (Lambda/SSM) should mean "this is a response target"; that keeps the executor code simple and the audit log clean. A design that discards most events with conditional branches inside the executor increases invocation cost, concurrency, and the chance of malfunction.

In June 2014, the UK code-hosting company **Code Spaces** had its AWS console access taken over and was then asked for a ransom. When the operators tried to regain control of the account, the attacker switched to a backup account prepared in advance and mass-deleted EBS volumes, S3 buckets, AMIs, snapshots, and, **because the backups were in the same account, even the backup copies**. The company effectively shut down its business within a day. This incident is a textbook counterexample of automated response design for three reasons. ① The response was entirely in the form of *a human competing with the attacker in the console*, while the attacker deleted with scripts; a human cannot win a race of speed. ② The first containment measure should have been *neutralizing the credentials*, and that came late. ③ A **design that put backups and evidence in the same account** erased the very possibility of recovery. The reason for the pipeline we learn today is ①, and the forensic account separation in Day 2 is the answer to ③.

## Router: Where EventBridge Sends Events

An EventBridge rule *routes events matching a pattern to one or more targets*. Targets commonly used in automated response:

- **SSM Automation Document (runbook)**: idempotent, multi-step remediation. EventBridge calls `StartAutomationExecution` directly.
- **Lambda function**: custom logic, API calls, conditional branching.
- **Step Functions**: multi-step workflows (approval gates, parallel actions, retries).
- **SNS**: notifying people (in parallel with automation).

If the target is SSM/Lambda, you must give EventBridge *an IAM role to execute that action*. This role's permissions are the scope of what the automation can do, so least privilege is the key.

```yaml
# EventBridge Rule → SSM Automation target (CloudFormation excerpt)
GuardDutyToIsolation:
  Type: AWS::Events::Rule
  Properties:
    EventPattern:
      source: ["aws.guardduty"]
      detail-type: ["GuardDuty Finding"]
      detail:
        severity: [{ "numeric": [">=", 7] }]
    Targets:
      - Arn: !Sub "arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:automation-definition/IsolateInstance"
        RoleArn: !GetAtt EventBridgeSsmRole.Arn
        Id: "isolate-target"
        InputTransformer:
          InputPathsMap:
            instanceId: "$.detail.resource.instanceDetails.instanceId"
          InputTemplate: '{"InstanceId": [<instanceId>]}'
```

`InputTransformer` extracts the needed field (the instance ID) from the event JSON and maps it to a runbook parameter. This is the joint that connects *signal → action target*.

> ⚠️ **Trap**: Cross-Region and cross-account routing. GuardDuty is a Regional service, so each Region needs its own EventBridge rule. In a multi-account environment, you either *forward the member accounts' findings to the management account's event bus* or aggregate them in Security Hub and respond centrally. "Create one rule in one Region and everything is protected" is a wrong answer.

### The Actual Structure of a Multi-Account, Multi-Region Response Hub

The fastest way to erase the wrong answer "one rule protects the whole organization" is to hold the actual deployment picture in your head. Organization-scale automated response takes the form of **one aggregation point + many execution points**.

```
[ Workload accounts (dozens to hundreds) ]            [ Security account ]
  Region A        Region B                            Central response hub
  GuardDuty       GuardDuty                           │
     │ finding       │ finding                        │
     ▼               ▼                                │
  Security Hub (per Region) ──── Region aggregation ─▶ Security Hub
     │                                                │ (delegated administrator)
     │  or an EventBridge rule                        ▼
     └── PutEvents to the central event bus ───▶  EventBridge (central bus)
                                                      │
                          ┌───────────────────────────┼───────────────────┐
                          ▼                           ▼                   ▼
                    SSM Automation            Lambda (orchestrator)    SNS/Slack
                    (cross-account run)               │ sts:AssumeRole    (people)
                          │                           │
                          └────────── In each workload account ────┐
                                      IR-RemediationRole           │
                                          │                        │
                                          ▼                        ▼
                              Isolation, snapshot, session revocation   Update Workflow.Status
                                                                        in Security Hub with the result

Premise ①: IR-RemediationRole must be deployed in each target account *before the incident*
Premise ②: The central event bus needs a resource policy that allows member accounts to PutEvents
Premise ③: GuardDuty is a Regional service; deploy rules and detectors per Region with IaC
```

The point the exam aims at in this picture is **Premise ①**. For the automation Lambda to do anything in a compromised account, it must assume *a role that already exists in that account* with `sts:AssumeRole`. You cannot create the role after the incident (because the permission to create it would itself have to be in that account). So "pre-deployment of the IR response role" belongs to NIST's *Preparation* phase, and we meet it again in Day 4.

```bash
# Allow the central event bus to receive events from the organization's member accounts
aws events put-permission \
  --event-bus-name central-security-bus \
  --statement-id AllowOrgMembers \
  --action events:PutEvents \
  --principal '*' \
  --condition Type=StringEquals,Key=aws:PrincipalOrgID,Value=o-exampleorgid

# Workload account: the local rule forwards events to the central bus
aws events put-targets --rule GuardDutyToCentral --targets \
  'Id=central,Arn=arn:aws:events:ap-northeast-2:222233334444:event-bus/central-security-bus,RoleArn=arn:aws:iam::111122223333:role/EventBridgeCrossAccountRole'
```

The `aws:PrincipalOrgID` condition is the key. With only `Principal: "*"`, any account can push forged events onto our security bus and **remotely trigger automated response**: an injection attack against the automation pipeline itself. The organization ID condition creates that boundary.

> ⚠️ **Trap**: An automated response pipeline easily creates **a recursive loop that triggers itself**. If the remediation Lambda changes a security group, that change triggers another Config rule evaluation, and that evaluation calls remediation again. There are three defenses. ① Leave a tag (e.g., `IR-Automated=true`) on changes made by remediation and exclude it with `anything-but` in the event pattern. ② Filter calls made by the remediation role using `userIdentity`. ③ Always set an attempt cap such as SSM Automation's `MaximumAutomaticAttempts`. An infinite loop worsens the incident in both cost and API throttling, producing the worst combination in which the real findings get throttled and go unprocessed.

## Executor 1: SSM Automation Runbooks

An SSM Automation Document is *a declarative runbook that runs multiple AWS API calls and scripts in a defined order*. Why it is preferred for automated response:

- **Idempotency and retries**: per-step `onFailure` and `maxAttempts` control.
- **Approval gates**: the `aws:approve` action inserts a human approval in the middle (the boundary between automation and human judgment, the topic of Day 4).
- **Auditability**: every execution is recorded step by step in the SSM console and CloudTrail.
- **AWS managed runbooks**: many ready-to-use remediation documents such as `AWS-DisablePublicAccessForSecurityGroup` and `AWSConfigRemediation-*`.

```yaml
# Compromised instance isolation runbook (SSM Automation, excerpt)
schemaVersion: '0.3'
description: "Replace the EC2 instance's security group with an isolation security group"
assumeRole: "{{ AutomationAssumeRole }}"
parameters:
  InstanceId: { type: String }
  IsolationSgId: { type: String }
mainSteps:
  - name: snapshotVolumes
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateSnapshot
      VolumeId: "{{ ... }}"
  - name: replaceSecurityGroup
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: "{{ InstanceId }}"
      Groups: ["{{ IsolationSgId }}"]
  - name: tagForensic
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateTags
      Resources: ["{{ InstanceId }}"]
      Tags: [{ Key: "Status", Value: "QUARANTINE" }]
```

A runbook suits *multi-step remediation where order matters*. It enforces the order "snapshot first (preserve evidence) → then isolate (replace the security group) → tag." If you isolate first, the instance may terminate and the volatile evidence can disappear (details in Day 2).

Raise a runbook to production quality and every step gets *failure handling* and *branching*. The following is the real thing behind the "multi-step, order-guaranteed, auditable" the exam asks for.

```yaml
schemaVersion: '0.3'
description: "Standard response for a compromised EC2: preserve evidence → isolate → revoke sessions → tag"
assumeRole: "{{ AutomationAssumeRole }}"
parameters:
  InstanceId:      { type: String }
  IsolationSgId:   { type: String }
  CaseId:          { type: String, default: "INC-UNSPECIFIED" }
mainSteps:
  # Step 1: Evidence first. Even on failure the next step (containment) must proceed, so Continue.
  - name: snapshotAllVolumes
    action: aws:executeAwsApi
    onFailure: Continue
    timeoutSeconds: 600
    maxAttempts: 3
    inputs:
      Service: ec2
      Api: CreateSnapshots
      InstanceSpecification: { InstanceId: "{{ InstanceId }}", ExcludeBootVolume: false }
      Description: "Forensic image {{ CaseId }}"

  # Step 2: If it has a production tag, contain differently (branching)
  - name: checkEnvironment
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: DescribeTags
      Filters: [{ Name: "resource-id", Values: ["{{ InstanceId }}"] }]
    outputs:
      - { Name: TagList, Selector: "$.Tags", Type: MapList }

  # Step 3: Replace with the isolation SG; if it fails, stop immediately and hand over to a human
  - name: isolate
    action: aws:executeAwsApi
    onFailure: Abort
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: "{{ InstanceId }}"
      Groups: ["{{ IsolationSgId }}"]

  # Step 4: Case tagging, the reference point for all later automation and queries
  - name: tagForensic
    action: aws:executeAwsApi
    inputs:
      Service: ec2
      Api: CreateTags
      Resources: ["{{ InstanceId }}"]
      Tags:
        - { Key: "IR-Status", Value: "QUARANTINE" }
        - { Key: "IR-Case",   Value: "{{ CaseId }}" }
        - { Key: "IR-Automated", Value: "true" }
```

Giving `onFailure` a different value for each step is the heart of the design. **A failure to collect evidence is not a reason to stop the response (Continue), but a failure to contain is a reason to stop (Abort).** If containment fails and the runbook still ends as "success," no one knows that the instance is still communicating. The most dangerous state in automation is not failure but *the state of having failed while looking like success*.

The final `IR-Automated=true` tag is also the marker that blocks the recursive loop mentioned earlier.

## Executor 2: Lambda

Lambda takes *conditional branching, external APIs, and complex logic* that are awkward to express as runbooks. Examples: "different actions depending on the finding type," "Slack/PagerDuty integration," "assembling STS roles across multiple accounts for cross-account remediation."

```python
import boto3

def handler(event, context):
    finding = event["detail"]
    severity = finding["severity"]
    ftype = finding["type"]

    if severity >= 7 and ftype.startswith("UnauthorizedAccess:IAMUser"):
        # Deactivate the leaked access key (Day 3 topic)
        iam = boto3.client("iam")
        key_id = finding["resource"]["accessKeyDetails"]["accessKeyId"]
        user = finding["resource"]["accessKeyDetails"]["userName"]
        iam.update_access_key(
            UserName=user, AccessKeyId=key_id, Status="Inactive"
        )
        return {"action": "key_disabled", "key": key_id}
    return {"action": "noop"}
```

The permissions of Lambda's execution role are the blast radius of the automation. If you grant `iam:*` when only `iam:UpdateAccessKey` is needed, it becomes a privilege escalation path if the Lambda is compromised.

Choosing between SSM Automation and Lambda is a choice between *declarative and imperative* automation paradigms. A runbook declares "what to do" as steps, and the platform manages auditing, approval, and retries, which favors security actions where compliance and evidentiary value matter. Lambda expresses "how to do it" in code and is flexible, but you must implement auditing, retries, and approval gates yourself. The exam's "best" answer splits as SSM when it is *standard remediation + auditing needed* and Lambda when it is *complex logic or external integration*.

### Executor Selection Table: SSM Automation vs Lambda vs Step Functions

| Axis | SSM Automation | Lambda | Step Functions |
|---|---|---|---|
| Form of expression | Declarative steps (YAML/JSON) | Code | State machine (ASL) |
| Order and retries | Provided by the platform (`onFailure`, `maxAttempts`) | Implemented yourself | Provided by the platform (`Retry`, `Catch`) |
| Human approval | **`aws:approve` built in** | None | `.waitForTaskToken` callback |
| Execution time limit | Favorable for long-running executions | Bound to the function timeout | Favorable for long workflows |
| Audit record | Step-level execution history in SSM and CloudTrail | Mostly CloudWatch Logs | Visualized execution history |
| AWS managed assets | Many ready-made documents such as `AWSConfigRemediation-*` | None | None |
| Best use | **Standard remediation, evidence needed** | Conditional branching, external APIs, cross-account assembly | Multi-step approval, parallelism, long waits |

Reading the signal in an exam sentence is simple. **When "approval," "step-by-step audit," or "managed remediation document" appears, SSM**; **when "Slack/PagerDuty/ticketing system integration" or "different logic per finding type" appears, Lambda**; **when "sequential approval by multiple teams" or "waiting several hours" appears, Step Functions.** The three are not competitors but sit at different layers; in practice a common combination is Step Functions as the orchestrator calling SSM runbooks and Lambda inside it.

### Automatic Execution vs Approval Gate: Where to Draw the Boundary

Most failures of automated response come not from *lack of technique* but from *mistakes in setting the boundary*. There are four axes of judgment.

| Axis of judgment | Conditions under which automatic execution is fine | Conditions under which an approval gate is needed |
|---|---|---|
| **Reversibility** | Can be undone (key `Inactive`, swapping to the isolation SG, creating a snapshot) | Cannot be undone (terminating an instance, deleting a volume, deleting a user) |
| **Signal confidence** | Deterministic evidence (successful port scan, communication with a known C2 IP) | Statistical or behavior-based anomalies (abnormal API pattern, first-use Region) |
| **Scope of impact** | A single resource, non-production tag | Shared infrastructure, `Environment=prod` |
| **Time pressure** | Seconds decide the amount of damage (credential revocation) | Quality of analysis matters more (determining the scope of data exfiltration) |

If all four axes lean "automatic," go automatic; if even one leans "approval," the safe default is to place a gate. And **the reversibility axis overwhelms the other three**: a reversible action is restored within minutes even if it was a false positive, whereas for an irreversible action a single false positive becomes an outage or data loss as is. Day 4's graduated automation is this table hardened into organizational policy.

> 🎯 **Scenario**: The week after automation was turned on to unconditionally isolate any instance with GuardDuty severity 7 or higher, an internal vulnerability assessment server running a security scanner triggered a large volume of findings in the `Recon:EC2/PortProbeUnprotectedPort` family, and the automation **isolated six payment API servers at once**, stopping payments for 30 minutes. What went wrong and how do you fix it? → The mistake was "splitting automatic from manual by severity alone." The order of fixes is ① **Immediate mitigation**: restore the isolation SG (it matters that this was possible because the action was reversible) and temporarily disable the automation rule. ② **Narrow the scope**: add a finding `type` condition to the event pattern to exclude the reconnaissance (`Recon:`) family from automatic isolation, and handle known scanner resources as exceptions by tag. ③ **Reset the boundary**: put a branch in the runbook so that instances tagged `Environment=prod` go through an `aws:approve` gate instead of automatic isolation. ④ **Add observation**: send an SNS notification every time the automation runs, so that the next false positive is noticed by a human in 30 seconds rather than 30 minutes. The point of the order is **restore → narrow scope → redesign boundary → strengthen observation**, and the common mistake is to skip ② and turn the automation off entirely. Turning automation off immediately returns MTTR to its pre-incident level.

## Permission Model: What Can the Automation Do

The security of automated response depends on *the permission boundary of the execution roles*. Two roles appear:

1. **The role EventBridge uses to call the target**: only `ssm:StartAutomationExecution` or `lambda:InvokeFunction`.
2. **The role SSM/Lambda uses to perform the actual remediation**: the *real change permissions* such as isolation and key deactivation.

If the second role is broad, the automation pipeline itself becomes an attack target. Best practices:
- Only *exactly the needed actions* for the role (e.g., `ec2:ModifyInstanceAttribute`, `ec2:CreateSnapshot`).
- Limit scope by resource and condition (tag-based constraints in `Condition`).
- Audit every call by the automation role with CloudTrail.

```json
// Permission policy of the remediation role: narrow permission that "can only swap to the isolation SG"
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EvidenceFirst",
      "Effect": "Allow",
      "Action": ["ec2:CreateSnapshot", "ec2:CreateSnapshots", "ec2:CreateTags", "ec2:DescribeInstances", "ec2:DescribeTags", "ec2:DescribeVolumes"],
      "Resource": "*"
    },
    {
      "Sid": "IsolateOnlyWithApprovedSG",
      "Effect": "Allow",
      "Action": "ec2:ModifyInstanceAttribute",
      "Resource": "arn:aws:ec2:*:*:instance/*"
    },
    {
      "Sid": "DenyAnySecurityGroupExceptIsolation",
      "Effect": "Deny",
      "Action": "ec2:ModifyInstanceAttribute",
      "Resource": "arn:aws:ec2:*:*:security-group/*",
      "Condition": {
        "ArnNotEquals": {
          "ec2:SecurityGroupID": "arn:aws:ec2:ap-northeast-2:111122223333:security-group/sg-forensic-isolation"
        }
      }
    },
    {
      "Sid": "NeverTerminate",
      "Effect": "Deny",
      "Action": ["ec2:TerminateInstances", "ec2:StopInstances", "ec2:DeleteSnapshot", "ec2:DeleteVolume"],
      "Resource": "*"
    }
  ]
}
```

The final `NeverTerminate` Statement is the quintessence of this policy. **If you give the automation role no permission for irreversible actions at all, an instance cannot be deleted by a code bug or by a false positive.** An approval gate is a procedural control, but this Deny is a structural control; when termination is truly needed, have *a separate, stronger role* perform it after approval. If the exam asks for "the most effective way to reduce the automation's blast radius," narrowing permissions is a higher answer than notifications or monitoring.

```json
// Trust policy of the IR response role in a workload account: only a specific execution role in the security account can assume it
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::222233334444:role/IR-Orchestrator-Lambda" },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": { "sts:ExternalId": "ir-2026-shared-secret-from-secrets-manager" },
      "ArnLike": { "aws:PrincipalArn": "arn:aws:iam::222233334444:role/IR-*" }
    }
  }]
}
```

A cross-account response role is **one of the most powerful channels** in the organization. If you open the trust policy at the account level (`"AWS": "222233334444"`), any principal in that account obtains incident response permissions. The standard is three layers: narrow it to a role ARN, block modification and deletion of that role with an SCP, and monitor `sts:AssumeRole` calls with a CloudTrail alarm. **The permissions of response automation set the upper limit of the organization's security.**

```bash
# How to verify automation without an incident: don't wait for a real compromise, fire a sample finding
aws guardduty create-sample-findings \
  --detector-id <detector-id> \
  --finding-types "UnauthorizedAccess:EC2/MaliciousIPCaller.Custom"

# Run only the runbook by hand to check the step-by-step results
aws ssm start-automation-execution \
  --document-name "IsolateCompromisedInstance" \
  --parameters '{"InstanceId":["i-0deadbeef"],"IsolationSgId":["sg-forensic"],"CaseId":["DRILL-001"]}'

aws ssm describe-automation-step-executions \
  --automation-execution-id <execution-id> --output table

# Whether the rule actually matched / whether the target invocation failed is seen in metrics
aws cloudwatch get-metric-statistics --namespace AWS/Events \
  --metric-name FailedInvocations --statistics Sum --period 300 \
  --start-time 2026-07-01T00:00:00Z --end-time 2026-07-02T00:00:00Z \
  --dimensions Name=RuleName,Value=GuardDutyToIsolation
```

`create-sample-findings` is a card that shows up in both the exam and practice. **Automated response is complete not at "we built it" but at "we confirmed it flows all the way through on a real event."** A sample finding is the standard means of checking the entire path (pattern match → InputTransformer → execution role → runbook steps) without a real threat, and it connects directly to Day 4's game day exercises.

## Putting the Whole Flow Together

```
GuardDuty finding (severity>=7)
   │  (EventBridge event published)
   ▼
EventBridge rule (pattern match + InputTransformer)
   ├──► SNS  → immediate notification to the security team (humans)
   └──► SSM Automation runbook (invoked with the EventBridge role)
            │  (runs with the automation role)
            ├─ 1. Create snapshots (preserve evidence)
            ├─ 2. Replace with the isolation SG (containment)
            ├─ 3. Tag QUARANTINE
            └─ 4. Follow-up through Step Functions (launch a forensic EC2, etc.)
```

The key insight: *run notification (human) and remediation (automatic) in parallel*. Automatic containment buys time while people assess the situation at the same time. For high-impact actions where full automation is risky (e.g., terminating a production instance), obtain human approval through an `aws:approve` gate.

Mature organizations *differentiate automated response by trust level*. Clear threats (a successful brute force against an exposed RDP) get fully automatic isolation, ambiguous signals (abnormal API call patterns) get notification only, and high-impact actions get an approval gate. This is called "graduated automation." In addition, to prepare for failure of the automation itself, attach a *dead-letter queue (DLQ)* to the EventBridge target to preserve failed events, and keep a safety net that escalates to a human when automated remediation did not work.

## The Order for Building the Pipeline: What Comes First

What the exam asks about relentlessly this week is always **order**. There is an order for building an automated response pipeline too, and if you break it you get a pipeline that "looks like it works but can do nothing during an incident."

```
① Secure the logging and detection foundation     CloudTrail (all accounts, all Regions) · GuardDuty · Security Hub aggregation
     │  ← Why first: with no signal there is nothing to trigger. If you turn it on after an incident you cannot see the past.
     ▼
② Pre-deploy the response roles     IR-RemediationRole in each workload account (least privilege + irreversible-action Deny)
     │  ← Why now: after an incident there may be no means to create roles in the compromised account.
     ▼
③ Prepare isolation infrastructure   isolation SG, isolation subnet, forensic account, evidence S3 (Object Lock)
     │  ← Why now: if the runbook has nothing to reference, it fails at execution time.
     ▼
④ Write the runbook and verify manually   SSM Automation document + run it directly with start-automation-execution
     │  ← Why now: before attaching a trigger, first confirm the action itself is correct.
     ▼
⑤ Wire for notification only       EventBridge rule → connect only SNS (human-in-the-loop)
     │  ← Why now: harmlessly measure whether the pattern really matches and how much noise there is.
     ▼
⑥ Connect reversible actions automatically   Add rule → SSM runbook (isolation, key deactivation), set DLQ and retries
     │  ← Why now: build trust starting from actions with a low false-positive cost.
     ▼
⑦ Irreversible actions get an approval gate  Insert human judgment with aws:approve / Step Functions callback
     │
     ▼
⑧ Drill and measure               Sample findings, game day, track MTTD/MTTR → feed back to ①
```

Skipping ⑤ and going straight from ① to ⑥ is the most common failure in practice. **The notification stage is not a waste but a noise-measurement interval**, and the false-positive rate that comes out of it is the only basis for "is it OK to automate this finding type?"

### Safety Nets for Automation: What Happens When It Fails

Automated response must be designed *on the assumption of failure*. At least four safety nets are needed.

1. **DLQ (Dead-Letter Queue)**: if an EventBridge target invocation still fails after retries, send the event to SQS. Without a DLQ, a failed finding *disappears without a trace*.
2. **Retry policy**: state the maximum number of retries and the maximum event age explicitly. Infinite retries cause throttling, and no retries cause missed responses from transient errors.
3. **Idempotency**: the result must be the same even if the same finding arrives twice. Swapping an isolation SG and deactivating a key are inherently idempotent, but "creating a snapshot" is not; add a step that first checks for an existing snapshot by case tag.
4. **Making failure visible**: set a CloudWatch alarm on the `FailedInvocations` metric and send the alarm to the *security channel*. The reason a silently dead automation is more dangerous than no automation is that nobody knows no response is happening.

```bash
# Attach a DLQ and a retry cap to the target together
aws events put-targets --rule GuardDutyToIsolation --targets '[{
  "Id": "isolate-target",
  "Arn": "arn:aws:ssm:ap-northeast-2:111122223333:automation-definition/IsolateCompromisedInstance",
  "RoleArn": "arn:aws:iam::111122223333:role/EventBridgeSsmRole",
  "DeadLetterConfig": { "Arn": "arn:aws:sqs:ap-northeast-2:111122223333:ir-dlq" },
  "RetryPolicy": { "MaximumRetryAttempts": 3, "MaximumEventAgeInSeconds": 3600 }
}]'
```

An automated response pipeline is itself an **attack surface**. From the attacker's perspective, this pipeline can be abused in two ways. First, *hijacking the remediation role*: an IR response role deployed across the organization is a rare asset holding powerful permissions across many accounts, so compromising a single orchestrator Lambda yields multi-account permissions at once. So the orchestrator must be treated with a separate account, least privilege, code signing, and immutable deployment. Second, *automation baiting*: the attacker deliberately generates a large volume of low-severity findings to exhaust the response team and the automation, and hides the real activity in that noise. This is the classic evasion technique of the IDS era carried over to the cloud. The defenses are *per-finding-type throughput caps*, *concurrent execution limits*, and a **meta-detection rule** such as "N or more in a short time in the same account." Automation sees only individual findings, but humans must see the *pattern* of findings.

## Trap Summary

- Creating one rule in one Region and believing the whole organization is protected; GuardDuty is a Regional service.
- Leaving out the `Workflow.Status: NEW` condition in the event pattern, so response runs repeatedly for findings that were already processed.
- Mixing GuardDuty's original severity (0-10) with Security Hub's normalized severity (0-100) and setting the threshold wrong.
- Filtering inside the executor code, inviting invocation cost, malfunction, and audit log pollution.
- Leaving only `Principal: "*"` on the central event bus and omitting the `aws:PrincipalOrgID` condition, which allows forged events.
- Not preventing a recursive loop in which a change made by remediation triggers remediation again (tag exclusion and an attempt cap are needed).
- Giving the automation role broad permissions such as `ec2:*` or `iam:*`, so the pipeline itself becomes a privilege escalation path.
- Leaving irreversible-action (terminate, delete) permissions on the automation role; they must be removed structurally with an explicit Deny.
- Opening the cross-account response role's trust policy at the *account level*, giving response permissions to every principal in that account.
- With no DLQ, retries, or `FailedInvocations` alarm, the automation is silently dead and nobody knows.
- Skipping the notification-only stage and turning on automatic isolation from the start, causing a production outage from a false positive.
- Putting a non-idempotent step such as snapshot creation into a runbook without duplicate-execution prevention.
- Trying to deploy the response role *after* the incident; there may be no means to create a role in the compromised account.
- Building the automation but not verifying it by flowing a sample finding or a game day all the way through.

## Summary

- [ ] Did you filter the signal source (GuardDuty/Security Hub/Config) event patterns by severity and type?
- [ ] Did you make Security Hub the single entry point and prevent duplicate processing with `Workflow.Status: NEW`?
- [ ] Did you filter at the router with the event pattern operators (`numeric`, `prefix`, `anything-but`, `exists`)?
- [ ] Did you block forged events by putting an `aws:PrincipalOrgID` condition on the central event bus?
- [ ] Did you structurally remove irreversible actions from the remediation role with an explicit Deny?
- [ ] Did you narrow the cross-account response role's trust policy to a specific role ARN?
- [ ] Did you set `onFailure` for each runbook step as intended (Continue for evidence, Abort for containment)?
- [ ] Do you detect the silence of automation with a DLQ, a retry cap, and a `FailedInvocations` alarm?
- [ ] Did you put in a recursive-loop blocking marker (such as an `IR-Automated` tag) and an attempt cap?
- [ ] Did you verify the entire path by flowing a sample finding all the way through?
- [ ] Did you extract the target resource from the event with the EventBridge InputTransformer and map it to the runbook?
- [ ] Did you choose SSM Automation when remediation is standard, multi-step, and needs auditing, and Lambda when the logic is complex?
- [ ] Did you separate the EventBridge invocation role from the actual remediation role and limit both with least privilege?
- [ ] Do you run automated remediation and human notification (SNS) in parallel and put an approval gate on high-impact actions?
- [ ] Do you aggregate multi-account, multi-Region findings in Security Hub or a central bus for consistent response?
- [ ] Do you preserve evidence (snapshot) before containment (isolation)?
- [ ] Is there a DLQ and escalation path in case the automation itself fails?

---

## 📝 Practice Questions

**Question 1.** We want to automatically isolate an instance only when GuardDuty generates a severity 8 EC2 C2 communication finding, and notify the security team at the same time. What is the most appropriate configuration?

A) Run Lambda every minute to poll the GuardDuty API and check the conditions  
B) Connect an EventBridge rule (severity>=7 + type filter) to two targets (an SSM Automation isolation runbook + SNS notification)  
C) View the finding in the GuardDuty console and have a person isolate manually  
D) Evaluate the instance with an AWS Config rule  

**Answer: B**  
Explanation: An EventBridge rule filters on severity and type with an event pattern and can route a single rule to multiple targets. Running the isolation automatically with an SSM Automation runbook while sending a notification through SNS at the same time makes containment and notification happen in parallel. Lambda polling has latency, cost, and duplicate-processing problems, manual isolation is not automation, and Config is for configuration compliance, not a trigger for threat findings.

---

**Question 2.** In an automated response pipeline, what is the deciding factor for preferring an SSM Automation runbook over Lambda?

A) It always runs faster than Lambda  
B) The platform provides ordering guarantees for multi-step remediation, per-step retries, a human approval gate (aws:approve), and per-step CloudTrail auditing  
C) Lambda cannot call AWS APIs  
D) Runbooks do not require IAM permissions  

**Answer: B**  
Explanation: SSM Automation uses declarative multi-step runbooks, and the platform manages ordering, retries, approval gates, and audit records, which is advantageous for security remediation where evidentiary value and compliance matter. It is not always faster, Lambda can of course call AWS APIs, and a runbook also needs IAM permissions through assumeRole.

---

**Question 3.** What is the biggest risk of a design that grants broad permissions such as `ec2:*` and `iam:*` to the automated remediation role?

A) Costs increase  
B) If the automation pipeline or executor is compromised, the broad permissions become a privilege escalation and lateral movement path, enlarging the blast radius  
C) The runbook does not run  
D) The EventBridge pattern does not match  

**Answer: B**  
Explanation: The permissions of the automated remediation role are the blast radius of the automation. Broad permissions hand an attacker powerful privileges when the pipeline is targeted. Least privilege is the correct answer: only the exact actions needed (for example, ec2:ModifyInstanceAttribute), scoped with tag and resource conditions. Permission breadth has no direct relation to cost, runbook execution, or event matching.

---

**Question 4.** What is the best practice for designing the step order in a runbook that isolates a compromised instance?

A) Terminate the instance immediately, then create a snapshot  
B) Create a snapshot first (to preserve evidence), then replace the security group with an isolation security group and add tags  
C) Isolate only, without preserving evidence  
D) Add tags only, and have a person contain it later  

**Answer: B**  
Explanation: The best-practice order is to create a snapshot first to preserve volatile and disk evidence, then contain by replacing the security group, and then tag. Terminating the instance first destroys volatile evidence such as memory, and failing to preserve evidence or omitting containment leads to forensic and response failure.

---

**Question 5.** We want to apply a consistent automated response to GuardDuty findings in a multi-account, multi-Region environment. What is the most appropriate approach?

A) Create only one EventBridge rule in one Region  
B) Aggregate member account findings in Security Hub (or forward them to a central event bus), deploy the rules in each Region consistently with IaC, and respond centrally  
C) Have people manually check the console for each account  
D) Turn off GuardDuty and use only AWS Config  

**Answer: B**  
Explanation: GuardDuty is a Regional service, so a rule is needed in every Region. For multiple accounts, the correct answer is to create a single response point by aggregating in Security Hub or forwarding to a central event bus, and then deploy consistently with IaC. A single rule in one Region does not protect everything, manual checking is not automation, and disabling GuardDuty gives up detection itself.

---
