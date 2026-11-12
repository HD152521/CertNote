# Day 1 - Automated Response Pipeline: EventBridge + SSM Automation + Lambda for Auto-Remediation of Findings

Incident response maturity splits on *"how quickly, consistently, without human intervention"* threats are contained. If GuardDuty takes 5 minutes to detect C2 communication from a compromised EC2, but a person takes 30 minutes to read that finding on console and isolate the instance, the attacker has already completed lateral movement. The essence of an automated remediation pipeline is *event-driven automation that converts detection signals into deterministic actions*. The exam key is precisely drawing the flow: "what event, routed through what, executed by what engine, with what authority?"

This pipeline's standard skeleton has three parts: **Signal source (GuardDuty/Security Hub/Config/Inspector)** → **Router (EventBridge)** → **Executor (SSM Automation or Lambda)**. Each stage's responsibilities and pitfalls repeat on exams.

## Signal Source: Where Do Findings Come From and What Shape Are They?

Automation triggers are mostly events that security services publish to EventBridge. Signal sources differ in event pattern `source` and `detail-type`.

- **GuardDuty**: `source: aws.guardduty`, `detail-type: "GuardDuty Finding"`. `detail.severity` (0–10 scale), `detail.type` (e.g., `UnauthorizedAccess:EC2/SSHBruteForce`), `detail.resource` holds affected resource.
- **Security Hub**: `source: aws.securityhub`, `detail-type: "Security Hub Findings - Imported"`. ASFF (AWS Security Finding Format) normalized format lets you receive multiple signal sources in one shape — preferred as single entry point for automation.
- **AWS Config**: `source: aws.config`, `detail-type: "Config Rules Compliance Change"`. Triggers on compliance violation (NON_COMPLIANT) state change.
- **Inspector**: Vulnerability findings.

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

The pattern above selects *only* findings with severity ≥7 that are EC2 unauthorized access types. EventBridge patterns support content-based filtering like `numeric`, `prefix`, `anything-but` to reduce noise. Indiscriminate response to all findings causes false-positive incidents where normal workloads get isolated.

> 💡 **Related Theory**: This applies control theory's *feedback loop* to security. Sensor (GuardDuty) measures system state, controller (EventBridge rule) compares against threshold and fires actuators (SSM/Lambda). In industrial control, overly sensitive thresholds cause *hunting* (unnecessary oscillation); similarly, security automation over-reacts to normal variation without careful threshold (severity) and condition setting. That's why best practice is alert-only first (human-in-the-loop), then graduated to auto-remediation as trust builds.

## Router: Where Does EventBridge Send Events?

EventBridge rules *route events matching a pattern to one or more targets*. Common targets for auto-response:

- **SSM Automation Document (runbook)** — idempotent, multi-step remediation. EventBridge directly calls `StartAutomationExecution`.
- **Lambda function** — custom logic, API calls, conditional branching.
- **Step Functions** — multi-step workflows (approval gates, parallel actions, retries).
- **SNS** — notifications to people (paired with automation).

If target is SSM/Lambda, EventBridge must have the *IAM role to execute that action*. That role's permissions define automation's capability boundary — least privilege is critical.

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

`InputTransformer` extracts needed fields (instance ID) from event JSON and maps them to runbook parameters. This is the *signal → action target* connection point.

> ⚠️ **Trap**: Cross-region and cross-account routing. GuardDuty is a per-region service, so each region needs EventBridge rules. Multi-account environments either *forward member account findings to management account event bus* or aggregate via Security Hub then respond centrally. "One rule in one region protects everything" is a trap answer.

## Executor 1: SSM Automation Runbook

SSM Automation Documents are *declarative runbooks executing multiple AWS API calls and scripts in defined order*. Preferred for auto-response:

- **Idempotency and retries**: Per-step `onFailure`, `maxAttempts` control.
- **Approval gates**: `aws:approve` action inserts human approval mid-workflow (automation/human judgment boundary — Day 4 topic).
- **Auditability**: Every execution logged step-by-step in SSM console and CloudTrail.
- **AWS-managed runbooks**: `AWS-DisablePublicAccessForSecurityGroup`, `AWSConfigRemediation-*` etc., ready-to-use remediation documents.

```yaml
# Breach instance isolation runbook (SSM Automation, excerpt)
schemaVersion: '0.3'
description: "Replace EC2 instance with isolation security group"
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

Runbooks suit *ordered multi-step remediation*. They enforce "snapshot first (evidence preservation) → then isolate (security group swap) → then tag" sequence. Isolating first risks terminating the instance and losing volatile evidence (Day 2 detail).

## Executor 2: Lambda

*Conditional branching, external APIs, complex logic* difficult to express as runbooks fall to Lambda. Example: "different actions per finding type," "Slack/PagerDuty integration," "assemble STS roles across accounts for cross-account remediation."

```python
import boto3

def handler(event, context):
    finding = event["detail"]
    severity = finding["severity"]
    ftype = finding["type"]

    if severity >= 7 and ftype.startswith("UnauthorizedAccess:IAMUser"):
        # Disable leaked access key (Day 3 topic)
        iam = boto3.client("iam")
        key_id = finding["resource"]["accessKeyDetails"]["accessKeyId"]
        user = finding["resource"]["accessKeyDetails"]["userName"]
        iam.update_access_key(
            UserName=user, AccessKeyId=key_id, Status="Inactive"
        )
        return {"action": "key_disabled", "key": key_id}
    return {"action": "noop"}
```

Lambda's execution role permissions define automation's blast radius. Granting `iam:*` when only `iam:UpdateAccessKey` is needed creates a privilege escalation path if Lambda is compromised.

> 💡 **Related Theory**: SSM Automation vs Lambda choice is *declarative vs imperative* automation paradigm. Runbooks declare "what to do" as steps and the platform manages audit, approval, retries — advantageous for security controls where compliance and evidence matter. Lambda expresses "how to do" in code, flexible but must hand-code audit, retries, approval gates. Exam "best" answers split: *standard remediation + audit needed* → SSM, *complex logic, external integration* → Lambda.

## Permission Model: What Can Automation Do?

Auto-response security hinges on *execution role permission boundaries*. Two roles emerge:

1. **Role for EventBridge to call targets** — only `ssm:StartAutomationExecution` or `lambda:InvokeFunction`.
2. **Role for SSM/Lambda to perform actual remediation** — isolation, key disable, etc. — *actual change permissions*.

Overly broad second role makes the automation pipeline itself a target. Best practices:
- Role has *exactly needed actions* only (e.g., `ec2:ModifyInstanceAttribute`, `ec2:CreateSnapshot`).
- Resource and condition scoping (tags-based constraints in `Condition`).
- CloudTrail audits all automation role calls.

## Full Flow Summary

```
GuardDuty finding (severity≥7)
   │  (EventBridge publishes event)
   ▼
EventBridge rule (pattern matching + InputTransformer)
   ├──► SNS  → security team immediate notification (people)
   └──► SSM Automation runbook (invoked by EventBridge role)
            │  (executed by automation role)
            ├─ 1. Create snapshot (evidence preservation)
            ├─ 2. Replace with isolation SG (containment)
            ├─ 3. Tag QUARANTINE
            └─ 4. Step Functions for follow-up (launch forensics EC2, etc.)
```

Core insight: *Combine notification (people) and remediation (auto)*. Auto-containment buys time, people understand situation concurrently. High-impact actions risky to fully automate (e.g., terminate production instance) use `aws:approve` gates requiring human sign-off.

> 🔍 **Deeper**: Mature organizations tier automated response by *trust level*. Clear threats (successful brute-force on public RDP) → full auto-isolation, ambiguous signals (anomalous API pattern) → alert-only, high-impact action → approval gate. Called "graduated automation." Also, against automation failure, attach *dead-letter queue (DLQ)* to EventBridge targets to preserve failed events, escalate to humans if auto-remediation doesn't fire.

## One-Sentence Checklist

- [ ] Filter signal source (GuardDuty/Security Hub/Config) event pattern by severity and type
- [ ] EventBridge InputTransformer extracts target resource from event and maps to runbook
- [ ] Chose SSM Automation for standard, multi-step, audit-required fixes; Lambda for complex logic
- [ ] Separated EventBridge invocation role from actual remediation role, both least-privilege
- [ ] Paired auto-remediation with SNS alerts (people), approval gates on high-impact actions
- [ ] Multi-account/multi-region findings aggregated via Security Hub/central bus for consistent response
- [ ] Evidence preservation (snapshots) before containment (isolation)
- [ ] DLQ and escalation path for automation failures

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
