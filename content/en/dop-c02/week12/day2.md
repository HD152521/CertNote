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

## 📝 연습 문제

**문제 1.** Automation Document의 단계(step)들 간에 데이터를 전달하는 메커니즘은?

A) 전역 변수

B) 각 step의 outputs를 이름으로 선언하고, 다음 step은 `{{ StepName.OutputVariable }}` 형태로 참조

C) 환경 변수

D) 중앙 결과 저장소(DynamoDB)에 저장

**정답: B**

해설: Automation Document는 DAG의 단계 간에 outputs → inputs 연결로 데이터를 전달한다. 각 step에서 선언한 output이 다음 step에서 `{{ StepName.OutputName }}` 문법으로 참조되며, SSM이 값을 주입한다. 전역 변수(A)나 환경 변수(C)는 이 구조에 없고, DynamoDB(D)는 오버헤드다.

---

**문제 2.** `aws:approve` 스텝의 핵심 특징 3가지는?

A) 동기적으로 on-call이 대기할 때까지 블로킹, 브라우저 팝업으로 승인

B) 비동기적으로 SNS 알림 + 승인 큐에 등록 + MinRequiredApprovals로 쿼럼 검사, 승인 시 다음 step 재개

C) 승인 거부 시 자동 롤백

D) 승인 타임아웃 설정 불가

**정답: B**

해설: `aws:approve`는 비동기 인-루프 단계로, 승인자들에게 SNS 메시지를 보내고 Systems Manager 승인 큐에 요청을 등록한 뒤 대기한다. MinRequiredApprovals는 분리된 의무(SOD) 원칙으로, "2명 이상 서명 필요"같은 쿼럼 검사다. 다른 병렬화 가능한 step은 동시 실행되고, 승인 시 해당 step에서 재개된다. 승인 거부는 workflow를 실패로 종료하지만(C처럼 자동 롤백은 아니고) 선택적 rollbackSteps으로 명시적 롤백은 가능하다.

---

**문제 3.** Automation Document의 이상적 특성은 **멱등성**이다. 다음 중 아닌 것은?

A) AuthorizeSecurityGroupIngress — 규칙이 이미 있으면 무시하고 성공

B) SetDesiredCapacity = 2 — 원하는 용량을 2로 고정(멱등)

C) 이전 값에서 1을 뺀다 (DesiredCapacity - 1) — 재실행 시마다 또 빠진다(멱등 X)

D) ModifyInstanceAttribute SourceDestCheck = false — 이미 false면 무시하고 성공

**정답: C**

해설: 멱등성은 f(f(x)) = f(x) — 동일한 상태로 수렴해야 한다. 상태(목표값) 기반 API는 멱등(A, B, D)이지만, 상대적 변경(C)은 멱등이 아니다. 자동화의 재시도나 재실행에 대비해야 하므로, 상태 기반 설정이 필수다.

---

**문제 4.** GuardDuty가 심각한 보안 발견을 보고했다. 즉시 EC2 인스턴스를 격리하되, 법무팀 승인 없이는 계정 정지까지 가면 안 된다는 정책이 있다. 가장 적합한 설계는?

A) Automation: GuardDuty → 격리 step → 계정 정지 step (순차)

B) Automation: GuardDuty → 격리 step → aws:approve (법무팀) → 계정 정지 step (분기)

C) 격리는 Lambda 직접 호출, 법무팀은 이메일로 체크

D) 계정 정지를 빼고 격리만 자동

**정답: B**

해설: 위험한 작업(계정 정지)은 인가된 결정이 필요하고, 빠른 containment(격리)는 지체 없어야 한다. 따라서 격리 step은 자동으로 즉시, 이후 ap승인 gate를 거쳐야 한다. aws:approve는 비동기이므로, 격리 이후 다른 추적 step을 병렬로 실행할 수도 있다. 이메일 체크(C)는 비자동화, 격리만(D)은 미완성.

---

**문제 5.** Automation Document에서 step 재실행 시 다시 같은 step을 두 번 호출하게 되는데, 부작용이 없도록 하려면?

A) 각 step을 하나의 Lambda로 래핑해 내부에 중복 검사 로직 추가

B) 재시도 자체를 비활성화

C) Step action 자체가 멱등(상태 기반)하도록 설계 (SetDesiredCapacity, PutItem with if-not-exists 등)

D) 불가능 — EventBridge 전달처럼 at-least-once는 필연적

**정답: C**

해설: 멱등성은 step action의 설계에서 나온다. AWS API 대부분이 상태 기반이므로(이미 상태 X면 no-op), 제대로 사용하면 자동으로 멱등이다. Lambda 래핑(A)은 추가 복잡도고, 재시도 비활성화(B)는 과도한 실패, at-least-once(D)는 일부 맞지만 실제로는 멱등하게 설계 가능하다.

---

**문제 6.** 복잡한 Automation이 중간에 실패했다 — 일부 step은 성공했다. 실패 전 상태로 되돌려야 한다. 메커니즘은?

A) Automation 전체를 다시 처음부터 실행

B) 선택적 rollbackSteps을 Automation Document에 정의하고, SSM이 역순으로 실행

C) CloudFormation 스택 롤백처럼 자동 수행 (명시 불필요)

D) 수동으로 EC2 콘솔에서 되돌리기

**정답: B**

해설: Automation Document는 선택적 `rollbackSteps` 블록을 가지며, 실패 시 SSM이 롤백 단계를 역순으로 실행한다. 이는 명시적 정의가 필요하고(A, C 아님), 복잡한 작업의 안전망이다.

---

**문제 7.** EventBridge 규칙이 Automation Document를 Target으로 가리킬 때, 매번 Automation을 호출한다. 각 호출마다 새로운 ExecutionId가 생기고, 또 다른 개별 실행인가?

A) 아니다 — 같은 호출이 재시도되는 것뿐

B) 맞다 — 각 호출마다 독립적인 Automation 실행(ExecutionId 다름)

C) 주기적 트리거면 yes, 단발 이벤트면 no

D) Execution ID는 중요하지 않음

**정답: B**

해설: EventBridge 이벤트 하나당 Automation 실행 하나다. 각 실행은 독립적 ExecutionId를 가지고, 로그·모니터링·재시도도 개별적으로 추적된다. "재시도"는 Automation 내부의 step-level 재시도(aws:waitForAwsResourceProperty에 지정된 재시도)와 다르다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Automation Document는 운영 절차를 코드로 선언하는 스키마로, 절차 로직을 인프라 배관에서 분리한다. 둘째, step action(executeAwsApi, executeScript, approve, branch 등)은 절차의 어휘로, API부터 인간 게이트까지 스펙트럼을 제공한다. 셋째, aws:approve는 쿼럼 기반 인사 승인으로 분리된 의무(SOD) 원칙을 구현한다. 넷째, EventBridge 트리거된 Automation은 절차를 반응 루프에 연결해 인간의 손가락 움직임 없이 자동 대응을 이룬다. 다섯째, 멱등성과 선택적 롤백 step은 절차 재실행과 복구를 안전하게 만든다.
