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

## 📝 연습 문제

**문제 1.** GuardDuty가 심각도 8의 EC2 C2 통신 핀딩을 생성할 때만 자동으로 인스턴스를 격리하고, 동시에 보안팀에 알리고 싶다. 가장 적절한 구성은?

A) Lambda를 1분마다 실행해 GuardDuty API를 폴링하고 조건을 검사  
B) EventBridge 규칙(severity≥7 + type 필터)을 두 타깃(SSM Automation 격리 런북 + SNS 알림)에 연결  
C) GuardDuty 콘솔에서 핀딩을 보고 사람이 수동 격리  
D) Config 규칙으로 인스턴스를 평가  

**정답: B**  
해설: EventBridge 규칙은 이벤트 패턴으로 심각도·타입을 필터링하고, 하나의 규칙을 여러 타깃에 라우팅할 수 있다. SSM Automation 런북으로 격리를 자동 실행하고 SNS로 동시에 알림을 보내면 봉쇄와 통보가 병행된다. Lambda 폴링은 지연·비용·중복 처리 문제가 있고, 수동 격리는 자동화가 아니며, Config는 구성 규정 준수용이지 위협 핀딩 트리거가 아니다.

---

**문제 2.** 자동 대응 파이프라인에서 SSM Automation 런북을 Lambda보다 선호하게 되는 결정적 요인은?

A) Lambda보다 항상 더 빠르게 실행되므로  
B) 다단계 교정의 순서 보장, 단계별 재시도, 사람 승인 게이트(aws:approve), CloudTrail 단계별 감사가 플랫폼 제공되므로  
C) Lambda는 AWS API를 호출할 수 없으므로  
D) 런북은 IAM 권한이 필요 없으므로  

**정답: B**  
해설: SSM Automation은 선언적 다단계 런북으로 순서·재시도·승인 게이트·감사 기록을 플랫폼이 관리해, 증거 능력과 규정 준수가 중요한 보안 교정에 유리하다. 실행 속도가 항상 빠른 것은 아니고, Lambda도 당연히 AWS API를 호출하며, 런북 역시 assumeRole로 IAM 권한이 필요하다.

---

**문제 3.** 자동 교정 역할에 `ec2:*`, `iam:*` 같은 광범위 권한을 부여한 설계의 가장 큰 위험은?

A) 비용이 증가한다  
B) 자동화 파이프라인이나 실행기가 침해되면 광범위 권한이 권한 상승·측면 이동 경로가 되어 폭발 반경이 커진다  
C) 런북이 실행되지 않는다  
D) EventBridge 패턴이 매칭되지 않는다  

**정답: B**  
해설: 자동 교정 역할의 권한은 곧 자동화의 폭발 반경이다. 광범위 권한은 파이프라인이 표적이 됐을 때 공격자에게 강력한 권한을 넘겨준다. 정확히 필요한 액션(예: ec2:ModifyInstanceAttribute)만, 태그·리소스 조건으로 범위를 제한하는 최소 권한이 정답이다. 권한 폭은 비용·런북 실행·이벤트 매칭과 직접 관련이 없다.

---

**문제 4.** 침해 인스턴스 격리 런북에서 단계 순서를 설계할 때 모범은?

A) 인스턴스를 즉시 종료한 뒤 스냅샷을 생성  
B) 스냅샷(증거 보존)을 먼저 만든 뒤 격리 보안 그룹으로 교체하고 태깅  
C) 격리만 하고 증거는 보존하지 않음  
D) 태깅만 하고 봉쇄는 사람이 나중에  

**정답: B**  
해설: 휘발성·디스크 증거 보존을 위해 스냅샷을 먼저 생성한 뒤 보안 그룹 교체로 봉쇄하고 태깅하는 순서가 모범이다. 인스턴스를 먼저 종료하면 메모리 등 휘발성 증거가 소실되고, 증거 미보존이나 봉쇄 누락은 포렌식·대응 실패로 이어진다.

---

**문제 5.** 다계정·다리전 환경에서 GuardDuty 핀딩에 일관된 자동 대응을 적용하려 한다. 가장 적절한 접근은?

A) 한 리전에 EventBridge 규칙 하나만 만든다  
B) 멤버 계정 핀딩을 Security Hub로 집계(또는 중앙 이벤트 버스로 전달)하고 각 리전 규칙을 IaC로 일관 배포해 중앙에서 대응  
C) 계정마다 사람이 수동으로 콘솔을 확인  
D) GuardDuty를 끄고 Config만 사용  

**정답: B**  
해설: GuardDuty는 리전별 서비스라 리전마다 규칙이 필요하고, 다계정은 Security Hub 집계나 중앙 이벤트 버스 전달로 단일 대응 지점을 만든 뒤 IaC로 일관 배포하는 것이 정답이다. 한 리전 규칙 하나로는 전체가 보호되지 않고, 수동 확인은 자동화가 아니며, GuardDuty 비활성화는 탐지 자체를 포기하는 것이다.

---
