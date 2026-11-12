# Day 2 - Systems Manager Automation: Codifying Runbooks and the Operator's Disappearance

Operations teams have run playbooks for decades — step-by-step instructions when something breaks. "If replication lag > 30s, restart the replica. If it doesn't come up, failover to standby. Alert on-call. Log incident." A human followed these steps, checking conditions and branching based on outcomes. Errors and delays came from human interpretation and manual actions.

**AWS Systems Manager Automation** turns this runbook into code — a YAML/JSON document that AWS runs, not a human. Each step is an action (call Lambda, run shell, wait for condition, ask for approval, call API), and the workflow branches on results. When GuardDuty detects a compromise, Automation automatically isolates the EC2 instance, collects evidence, and notifies security. When database CPU spikes, Automation scales read replicas before paging on-call. Runbooks survive their authors — knowledge is captured, repeatably executed, auditable.

Today we explore five things. First, the **Automation Document structure** — how AWS encodes procedures (steps, parameters, outputs). Second, **control flow and step actions** — the vocabulary of automated procedures (invoke Lambda, run shell, wait, approve, call API). Third, **human-in-the-loop with approval steps** and the async-grant pattern. Fourth, **Automation triggers** — CloudWatch alarms, EventBridge rules, API calls — integrating Automation into the reaction loop. Fifth, how Automation underpins **incident response and remediation at scale**.

## Runbook as Code — History and Automation Document

Before AWS Automation (2016), operational playbooks lived in wikis or design docs — inherently version-untracked, hard to test, often stale. Splunk, PagerDuty, and other incident platforms supported webhooks, so teams wired alerts to Lambda functions that executed procedures. But those Lambda functions mixed procedural logic with retry/error-handling/logging cruft. The abstraction leaked.

**Automation Document** is AWS's attempt to separate procedural logic from plumbing. It's a declarative schema (YAML) describing *what* actions to take and *how* they flow, while Systems Manager handles *how* to retry, log, rollback on failure. Think of it as Terraform but for procedures instead of infrastructure.

```yaml
schemaVersion: '0.3'
description: 'Auto-remediate EC2 security groups after GuardDuty finding'

assumeRole: '{{ AutomationAssumeRole }}'

parameters:
  InstanceId:
    type: String
    description: EC2 instance to remediate
  AutomationAssumeRole:
    type: String
    default: 'arn:aws:iam::123456789012:role/AutomationRole'

outputs:
  - RemediateInstance.RemediationStatus
  - CollectEvidence.EvidenceLocation

mainSteps:
  - name: IsolateInstance
    action: 'aws:executeAwsApi'
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: '{{ InstanceId }}'
      SourceDestCheck:
        Value: false
  
  - name: CheckIsolation
    action: 'aws:waitForAwsResourceProperty'
    inputs:
      Service: ec2
      Api: DescribeInstances
      InstanceIds:
        - '{{ InstanceId }}'
      PropertySelector: '$.Reservations[0].Instances[0].SourceDestCheck.Value'
      DesiredValues:
        - 'false'
  
  - name: CollectEvidence
    action: 'aws:executeScript'
    inputs:
      Runtime: python3.8
      Handler: collect_handler
      Script: |
        def collect_handler(events, context):
          instance_id = events['InstanceId']
          # ... forensics logic ...
          return {'EvidenceLocation': 's3://bucket/path'}
      InputPayload:
        InstanceId: '{{ InstanceId }}'
    outputs:
      - Name: EvidenceLocation
        Selector: $.EvidenceLocation
        Type: String
  
  - name: NotifySecurityTeam
    action: 'aws:executeAwsApi'
    inputs:
      Service: sns
      Api: Publish
      TopicArn: arn:aws:sns:us-east-1:123456789012:SecurityAlerts
      Message: 'Remediation completed for {{ InstanceId }}'
    
mainSteps:
  - name: WaitForApproval
    action: 'aws:approve'
    inputs:
      Approvers:
        - 'arn:aws:iam::123456789012:role/OnCallRole'
      Message: 'Proceed with production database failover?'
      MinRequiredApprovals: 1
```

## Step Actions — The Vocabulary of Automation

An Automation Document is a DAG (directed acyclic graph) of **steps** chained by data and control flow. Each step is an action, and AWS Systems Manager defines dozens, but several are core.

| Action | Purpose | Example |
|--------|---------|---------|
| `aws:executeAwsApi` | Call any AWS API | Modify security group, scale ASG, invoke Lambda |
| `aws:executeScript` | Inline Python/Node.js script | Custom logic, parsing, transformations |
| `aws:executeCommand` | Run SSM Session Manager command on EC2 | Shell scripts, log collection, patch application |
| `aws:waitForAwsResourceProperty` | Poll and wait for resource state | Wait for instance to stop, ASG capacity to match target |
| `aws:sleep` | Delay | Backoff before retry, cool-down |
| `aws:branch` | Conditional branching | "If replication lag > 30s, go to FailoverPath; else Success" |
| `aws:approve` | Wait for human approval | Require on-call to approve critical changes |
| `aws:executeChangeManagerChangeRequest` | Submit a Change Manager CR | For regulated environments; require change approval |

Data flows between steps via **inputs and outputs**. Each step declares output variables, and downstream steps reference them with `{{ StepName.OutputVariable }}`. This dataflow is how parameters from initial invoke propagate through the procedure.

```yaml
mainSteps:
  - name: GetInstanceInfo
    action: 'aws:executeAwsApi'
    outputs:
      - Name: PrivateIpAddress
        Selector: $.Reservations[0].Instances[0].PrivateIpAddress
        Type: String
    
  - name: ConnectAndDiagnose
    action: 'aws:executeCommand'
    inputs:
      InstanceIds:
        - '{{ GetInstanceInfo.PrivateIpAddress }}'  # Output from prior step
      DocumentName: AWS-RunShellScript
      Parameters:
        command:
          - 'df -h'
          - 'free -m'
```

> 🔍 **Going deeper**: The step action set reflects distributed-systems operations theory. `aws:executeAwsApi` is synchronous RPC (call and wait). `aws:executeScript` is "compute on demand" (Lambda embedded in workflow). `aws:waitForAwsResourceProperty` captures **polling with exponential backoff** — SSM polls the resource state until it reaches the desired value or timeout (classic distributed-systems waiter pattern). `aws:branch` is **conditional control flow** without requiring Lambda for branching logic. `aws:approve` is **human-in-the-loop**, the async gate. Together, these actions cover the spectrum of operational procedures — from pure API calls to integration of human judgment.

## Human-in-the-Loop — The `aws:approve` Step

No automation is 100% safe; production failovers, account suspension, data deletion need human sign-off. **`aws:approve` step** pauses the execution, notifies approvers (via SNS or caller's CloudTrail), waits for approval, and resumes or aborts based on response.

```yaml
- name: RequestApprovalForFailover
  action: 'aws:approve'
  inputs:
    Approvers:
      - 'arn:aws:iam::123456789012:role/DatabaseTeam'
      - 'arn:aws:iam::123456789012:role/OnCall'
    Message: |
      Failover from primary ({{ PrimaryDatabaseEndpoint }}) to standby ({{ StandbyDatabaseEndpoint }})?
      Failover is **irreversible**. Standby becomes new primary.
    MinRequiredApprovals: 1
    NotificationArn: 'arn:aws:sns:us-east-1:123456789012:DBTeamAlerts'
```

Approvers receive an SNS message with a link to approve/reject. Behind the scenes, Automation stores the approval request in Systems Manager's approval queue, and on approval, resumes from where it paused. If rejection, the execution stops with a Failure status.

This is the **async-grant pattern** — the gate doesn't block the entire workflow; it's a discrete step in the DAG. Other parallelizable steps can run concurrently (e.g., collect evidence in parallel with waiting for approval). Real-world operations aren't serial; good automation reflects that.

> 💡 **Related theory**: `aws:approve` is a form of **Raft consensus or quorum-based decision** scaled to human approval. The `MinRequiredApprovals` parameter is exactly a quorum check — if approvers are an authoritative committee, require 2 out of 3 signatures. This formalizes the principle of **separation of duty** (SOD) — no single person can approve+execute risky changes. Ops teams have historically done this via email or ticketing; `aws:approve` makes it built-in and auditable.

## Triggers — Wiring Automation into the Reaction Loop

An Automation Document is inert code unless **triggered**. Systems Manager exposes multiple trigger mechanisms.

| Trigger | Source | Use Case |
|---------|--------|----------|
| **EventBridge rule** | CloudWatch alarms, CloudTrail, GuardDuty, EventBridge events | Auto-react to infrastructure/security/application changes |
| **Direct API call** | SDK/CLI, EventBridge Target | On-demand execution, Lambda orchestration |
| **CloudWatch alarm** | CloudWatch Alarms (via SNS/Lambda) | React to metric thresholds |
| **Change Calendar** | Maintenance windows, deployment freeze dates | Suppress automation during critical periods |

Most powerful is **EventBridge rule targeting Automation**. When CloudWatch detects high memory, it emits an event → EventBridge rule matches the event → Automation Document executes.

```bash
# Create EventBridge rule to trigger Automation on GuardDuty findings
aws events put-rule --name guardduty-remediation-rule \
  --event-pattern '{
    "source": ["aws.guardduty"],
    "detail-type": ["GuardDuty Finding"],
    "detail": {"severity": [7, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 8, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9]}
  }' --state ENABLED

aws events put-targets --rule guardduty-remediation-rule \
  --targets 'Id=1,Arn=arn:aws:ssm:us-east-1:123456789012:automation-definition/GuardDutyRemediation:$DEFAULT,RoleArn=arn:aws:iam::123456789012:role/EventBridgeAutomationRole,Input={...}'
```

> 💡 **Related theory**: This pattern — **event-driven automation** — is the natural evolution of **incident response automation** (IRA). Traditional IRA was alert-driven and synchronous (alert fires, on-call runs playbook manually). Event-driven IRA is reactive and autonomous — GuardDuty emits event → Automation auto-isolates instance → Automation notifies on-call *after* containment. On-call's job shifts from firefighting to decision-making and post-mortems, not keystroke repetition.

## Automation Execution — Idempotency and Rollback

**Critical property**: Automation steps should be **idempotent** — running twice is same as running once. If a step modifies a security group and the step re-runs (due to transient API error), the group should not be modified twice. Idempotency hinges on the step action.

```yaml
# IDEMPOTENT: If rule exists, API ignores and succeeds
- name: AddSecurityGroupRule
  action: 'aws:executeAwsApi'
  inputs:
    Service: ec2
    Api: AuthorizeSecurityGroupIngress
    GroupId: '{{ SecurityGroupId }}'
    IpPermissions:
      - IpProtocol: tcp
        FromPort: 443
        ToPort: 443
        IpRanges:
          - CidrIp: 10.0.0.0/8

# NON-IDEMPOTENT: Decrement always subtracts
- name: DecreaseASGCapacity
  action: 'aws:executeAwsApi'
  inputs:
    Service: autoscaling
    Api: SetDesiredCapacity
    AutoScalingGroupName: '{{ ASGName }}'
    DesiredCapacity: 2  # Set to fixed value (idempotent), not decrement
```

If a step fails mid-execution, Systems Manager can **rollback** the automation by running an optional rollback document. For complex automations, rollback is critical — if isolation step succeeds but evidence collection fails, rollback re-enables networking to prevent permanent lockout.

```yaml
rollbackSteps:
  - name: ReenableSourceDestCheck
    action: 'aws:executeAwsApi'
    inputs:
      Service: ec2
      Api: ModifyInstanceAttribute
      InstanceId: '{{ InstanceId }}'
      SourceDestCheck:
        Value: true
```

## Automation Patterns in Real Scenarios

**Scenario 1: Auto-Remediation on GuardDuty Finding**

GuardDuty detects EC2 instance compromise (suspicious process spawned). Its finding emits an event → EventBridge rule → Automation Document executes:
1. Snapshot the instance and AMI for forensics
2. Isolate by modifying security groups
3. Stop the instance
4. Notify security team
5. Create Change Manager ticket for review

**Scenario 2: Database Failover with Human Approval**

CloudWatch detects primary database unavailable (3 failed health checks). EventBridge → Automation:
1. Verify standby is healthy
2. Check for in-flight transactions (via custom Lambda script)
3. **Ask for approval** (aws:approve step) — waits 10 minutes for on-call to confirm
4. On approval: promote standby, update DNS, re-enable replication monitoring
5. On rejection: alert escalates to management

**Scenario 3: Patch Rollout with Staged Rollback**

Patch management Automation runs weekly:
1. For each ASG in prod: drain connections (aws:executeCommand) → terminate old instances (aws:executeAwsApi) → new instances launch (ASG) → health checks pass (aws:waitForAwsResourceProperty)
2. If health check fails, branch to rollback
3. Rollback: scale ASG back to old capacity, re-register instances

## Wrapping Up

Today we covered five things. First, **Automation Documents codify operational runbooks**, separating procedural logic from infrastructure plumbing. Second, **step actions** (executeAwsApi, executeScript, approve, branch) provide the vocabulary for procedures — from API calls to human gates. Third, **aws:approve** implements human-in-the-loop via quorum-based sign-off, supporting separation of duty. Fourth, **EventBridge-triggered Automation** wires procedures into the reaction loop — from alert to auto-remediation without human keystroke. Fifth, **idempotency and rollback** make procedures safe to retry and revert.

Automation Documents are the bridge between infrastructure-as-code (Terraform) and the emerging **procedures-as-code** paradigm. As cloud operations scale, runbooks must scale too — from wikis to executable code that AWS runs.

The next article explores **auto-healing and control theory** — how to feedback systems that learn and self-correct.

---

## 📝 Practice Questions

**Question 1.** What is the mechanism for passing data between the steps of an Automation Document?

A) Global variables

B) Declare each step's outputs by name, and the next step references them in the form `{{ StepName.OutputVariable }}`

C) Environment variables

D) Store in a central result store (DynamoDB)

**Answer: B**

Explanation: An Automation Document passes data between the steps of a DAG by connecting outputs → inputs. An output declared in each step is referenced by the next step with the `{{ StepName.OutputName }}` syntax, and SSM injects the value. Global variables (A) and environment variables (C) do not exist in this structure, and DynamoDB (D) is overhead.

---

**Question 2.** What are the 3 key characteristics of the `aws:approve` step?

A) Synchronously blocks until the on-call engineer is waiting, with approval via a browser popup

B) Asynchronously sends an SNS notification + registers in the approval queue + checks a quorum with MinRequiredApprovals, and resumes the next step on approval

C) Automatically rolls back when approval is denied

D) Approval timeout cannot be configured

**Answer: B**

Explanation: `aws:approve` is an asynchronous in-the-loop step that sends an SNS message to the approvers, registers the request in the Systems Manager approval queue, and then waits. MinRequiredApprovals is a quorum check, such as "signatures from 2 or more people required," following the separation of duties (SOD) principle. Other parallelizable steps run concurrently, and execution resumes from that step on approval. A rejection terminates the workflow as failed (it is not an automatic rollback as in C), but explicit rollback is possible through the optional rollbackSteps.

---

**Question 3.** The ideal property of an Automation Document is **idempotency**. Which of the following is NOT idempotent?

A) AuthorizeSecurityGroupIngress — if the rule already exists, it is ignored and succeeds

B) SetDesiredCapacity = 2 — fixes the desired capacity at 2 (idempotent)

C) Subtract 1 from the previous value (DesiredCapacity - 1) — it is subtracted again on every re-run (not idempotent)

D) ModifyInstanceAttribute SourceDestCheck = false — if already false, it is ignored and succeeds

**Answer: C**

Explanation: Idempotency means f(f(x)) = f(x) — execution must converge to the same state. State-based (target-value) APIs are idempotent (A, B, D), but relative changes (C) are not. Because automation must be prepared for retries and re-runs, state-based configuration is essential.

---

**Question 4.** GuardDuty has reported a severe security finding. You must isolate the EC2 instance immediately, but policy states that it must not go as far as suspending the account without legal team approval. Which design is MOST suitable?

A) Automation: GuardDuty → isolation step → account suspension step (sequential)

B) Automation: GuardDuty → isolation step → aws:approve (legal team) → account suspension step (branching)

C) Call Lambda directly for isolation, and check with the legal team by email

D) Drop the account suspension and automate only isolation

**Answer: B**

Explanation: A risky action (account suspension) requires an authorized decision, while fast containment (isolation) must happen without delay. Therefore, the isolation step runs automatically and immediately, and then an approval gate must follow. Since aws:approve is asynchronous, other investigation steps can also run in parallel after isolation. An email check (C) is not automated, and isolation only (D) is incomplete.

---

**Question 5.** When an Automation Document step is re-run, the same step gets called twice. How can you ensure there are no side effects?

A) Wrap each step in a Lambda function and add duplicate-check logic inside

B) Disable retries altogether

C) Design the step action itself to be idempotent (state-based) (SetDesiredCapacity, PutItem with if-not-exists, and so on)

D) Impossible — at-least-once, like EventBridge delivery, is unavoidable

**Answer: C**

Explanation: Idempotency comes from the design of the step action. Since most AWS APIs are state-based (a no-op if the state is already X), they are automatically idempotent when used properly. Lambda wrapping (A) adds complexity, disabling retries (B) causes excessive failures, and at-least-once (D) is partly true, but in practice you can design for idempotency.

---

**Question 6.** A complex Automation failed midway — some steps succeeded. You must return to the state before the failure. What is the mechanism?

A) Re-run the whole Automation from the beginning

B) Define optional rollbackSteps in the Automation Document, and SSM runs them in reverse order

C) It happens automatically like a CloudFormation stack rollback (no explicit definition needed)

D) Manually revert in the EC2 console

**Answer: B**

Explanation: An Automation Document can have an optional `rollbackSteps` block, and on failure SSM runs the rollback steps in reverse order. This requires explicit definition (not A or C) and is a safety net for complex operations.

---

**Question 7.** When an EventBridge rule points to an Automation Document as its Target, it invokes the Automation each time. Each invocation gets a new ExecutionId — is each one a separate, individual execution?

A) No — it is just the same invocation being retried

B) Yes — each invocation is an independent Automation execution (a different ExecutionId)

C) Yes for periodic triggers, no for one-off events

D) The Execution ID does not matter

**Answer: B**

Explanation: One EventBridge event produces one Automation execution. Each execution has an independent ExecutionId, and logs, monitoring, and retries are tracked individually. A "retry" is different from step-level retries inside the Automation (the retries specified for aws:waitForAwsResourceProperty).

---

## 📌 Today's Summary

There are five key takeaways today. First, an Automation Document is a schema that declares operational procedures as code, separating procedural logic from infrastructure plumbing. Second, step actions (executeAwsApi, executeScript, approve, branch, and so on) are the vocabulary of a procedure, offering a spectrum from APIs to human gates. Third, aws:approve implements the separation of duties (SOD) principle through quorum-based human approval. Fourth, Automation triggered by EventBridge connects procedures to a reaction loop and achieves automated response without human intervention. Fifth, idempotency and optional rollback steps make procedure re-runs and recovery safe.
