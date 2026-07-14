# Day 3 - Custom Resource·Hooks·Change Set: CloudFormation's Extension and Validation Mechanisms

Around the 6-month mark of CloudFormation use, everyone hits the same wall. "I want to auto-create Slack channels, but there's no `AWS::Slack::Channel`", "I want to register GitHub webhooks, but CFN has no resource", "Newly launched AWS services aren't supported in CFN yet." The tool filling this gap, introduced in 2015, is **Custom Resource**, and built on top of that in 2021 was **CloudFormation Hooks**, a pre-change validation mechanism. Though these tools do different work on the surface, they share the same deep philosophy — **turning CloudFormation from a closed resource set into an extensible workflow engine**.

Today we examine why Custom Resource Lambda's ResponseURL is designed that way, why PhysicalResourceId becomes the lifecycle key, how CDK Provider framework handles long-running work with isComplete pattern, how CloudFormation Hooks resembles OPA/Gatekeeper, and how Change Set combines with manual approval in CI/CD. DOP tests frequently ask about Custom Resource "timeout if response doesn't arrive in 1 hour" and similar details, making internal mechanism understanding valuable.

## CloudFormation's Limitations — Why Extension is Needed

CloudFormation's resource catalog exceeds 1500, but that catalog has (1) only AWS services, (2) average 3-6 month lag after new service launch, (3) some deep features never supported. For example, newly launched AWS Bedrock lacks CFN support immediately or only partial attribute support, and full parameter exposure takes time after GA. This gap leaves operations teams mixing "code-defined parts" with "console/CLI post-processing parts," failing to maintain true IaC.

Custom Resource bridges this gap through a general mechanism. **You embed arbitrary Lambda into CFN's lifecycle (Create/Update/Delete), letting it call external systems, run internal logic, invoke new APIs — anything**. CloudFormation becomes "infrastructure management tool" extended to "declarative lifecycle engine."

```yaml
# Standard CFN resource (within AWS catalog)
S3Bucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: my-bucket

# Custom Resource (Lambda does anything)
SlackChannel:
  Type: Custom::SlackChannel
  Properties:
    ServiceToken: !GetAtt SlackProvisionerFn.Arn
    ChannelName: !Sub 'alerts-${Environment}'
    SlackToken: '{{resolve:secretsmanager:slack/token:SecretString:bot}}'
```

> 💡 **Related Theory**: Custom Resource is exactly the Kubernetes Custom Resource Definition (CRD) + Operator pattern. K8s adds user-defined resources (Certificate, IstioVirtualService, ArgoCDApplication) to its own catalog via CRD, with Operators running reconciliation loops — the same abstraction pattern as CFN Custom Resource + Lambda Provider. Both combine **declarative definition + imperative reconciler**. Terraform External Provider, Pulumi Dynamic Provider follow the same lineage.

## Custom Resource Lambda's Response Protocol

The communication between CFN and Lambda has interesting asymmetric design. When CFN invokes Lambda with an event, **Lambda doesn't return the response as function return value but sends results via PUT to a pre-signed S3 URL (ResponseURL)**. Why this design?

The answer is **asynchronous long-running work**. Lambda invocation itself maxes at 15 minutes, but Custom Resource work may exceed that — ECR image replica, RDS snapshot copy, large S3 object handling. If Lambda timeout terminates and exits (or Step Function continues work in background), final results just go to S3 URL via PUT and CFN polling waits for ResponseURL results.

```python
import json, urllib.request

def handler(event, context):
    request_type = event['RequestType']  # Create / Update / Delete
    response_url = event['ResponseURL']  # pre-signed S3 PUT URL
    physical_id = event.get('PhysicalResourceId', 'slack-channel-default')

    response = {
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'PhysicalResourceId': physical_id,
    }

    try:
        if request_type == 'Create':
            channel_id = slack_create_channel(event['ResourceProperties']['ChannelName'])
            response['PhysicalResourceId'] = channel_id  # Update to real ID
            response['Status'] = 'SUCCESS'
            response['Data'] = {'ChannelId': channel_id}
        elif request_type == 'Update':
            slack_update_channel(physical_id, event['ResourceProperties'])
            response['Status'] = 'SUCCESS'
        elif request_type == 'Delete':
            slack_archive_channel(physical_id)
            response['Status'] = 'SUCCESS'
    except Exception as e:
        response['Status'] = 'FAILED'
        response['Reason'] = str(e)

    req = urllib.request.Request(
        response_url,
        data=json.dumps(response).encode('utf-8'),
        method='PUT',
        headers={'Content-Type': ''}  # Empty headers important for S3 signature validation
    )
    urllib.request.urlopen(req)
```

> ⚠️ **Pitfall**: If Lambda fails to send response through any exception path, CFN waits **1 hour by default** (configurable up to 3 days). That entire time the Stack remains `CREATE_IN_PROGRESS` or `UPDATE_IN_PROGRESS`, blocking other changes. So all Custom Resource Lambdas must **guarantee response in try/finally**. AWS official guides recommend using `cfn-response` Python module or `aws-cdk-lib` Provider framework, both abstracting boilerplate for response guarantee.

## PhysicalResourceId — The Key to Resource Identity

The most subtle behavior in Custom Resource is PhysicalResourceId meaning. CFN manages LogicalResourceId (name in template) and PhysicalResourceId (ID in external system) separately, but **when Lambda returns PhysicalResourceId changed during Update, CFN interprets that as "resource replacement."**

```
Create call   → Lambda returns PhysicalResourceId = "slack-CH001" → CFN records
Update call   → Lambda returns same "slack-CH001"              → Normal Update
Update call   → Lambda returns different "slack-CH002"         → CFN auto-calls Delete on previous "slack-CH001"
```

This is intentional design. **When the key to the same external resource changes, the resource itself replaced**, like RDS DBInstanceIdentifier change triggering replacement. Ignoring this causes accidents — unintended resource deletion via Custom Resource logic errors.

```python
# Wrong pattern — Create new ID on Update
def handler(event, context):
    if event['RequestType'] == 'Update':
        # Generate new UUID every time → Always causes resource replacement
        physical_id = f"slack-{uuid.uuid4()}"  # ⚠️ Dangerous

# Correct pattern — Maintain identity key
def handler(event, context):
    if event['RequestType'] == 'Update':
        physical_id = event['PhysicalResourceId']  # Use previous ID
```

> 🔍 **Deeper**: When PhysicalResourceId changes during Update, CFN's Delete call uses the **previous ID**. That is, if Update response has PhysicalResourceId="new," CFN calls Delete with "old" — so Lambda's Delete branch always uses `event['PhysicalResourceId']` as the resource key, not the newly generated one. This asymmetry often causes accidents initially.

> 📚 **Case Study**: In 2020 a fintech built Custom Resource creating/rotating external payment gateway API keys, updating PhysicalResourceId to the new key ID on Update. Result was automatic deletion of previous key each Stack update, causing in-flight transactions to fail with 401. After patch, fixed by keeping PhysicalResourceId as external resource name (e.g., `payment-gateway-prod`) and handling key rotation as internal logic only.

## CDK Provider Framework — isComplete Pattern

CDK provides `Provider` class reducing Custom Resource Lambda boilerplate burden. Strongest feature is the `isComplete` handler for **splitting long-running work into two functions**.

```typescript
import { Provider } from 'aws-cdk-lib/custom-resources';

const onEvent = new lambda.Function(this, 'OnEvent', {
  // Start work (e.g., trigger ECR image copy)
  // Return: { Status: 'IN_PROGRESS', Data: { CopyId: 'xxx' } }
});

const isComplete = new lambda.Function(this, 'IsComplete', {
  // Check if work finished (e.g., poll ECR copy status)
  // Return: { IsComplete: true/false, Data: { Result: '...' } }
});

const provider = new Provider(this, 'Provider', {
  onEventHandler: onEvent,
  isCompleteHandler: isComplete,
  queryInterval: cdk.Duration.minutes(1),    // Poll isComplete every 1 min
  totalTimeout: cdk.Duration.hours(2),       // Max 2 hour wait
});

new CustomResource(this, 'EcrReplica', {
  serviceToken: provider.serviceToken,
  properties: { SourceImage: '...' },
});
```

Internally Provider framework auto-creates Step Functions. onEvent starts work, Step Functions periodically calls isComplete polling, when complete sends result to CFN ResponseURL. Operators write only two Lambdas without manually building Step Functions — **cleanest pattern bypassing Lambda's 15-minute limit**.

> 🎯 **Scenario**: "Custom Resource copies RDS snapshot to different region then wait until Stack completes. Snapshot copy takes 1+ hour." — Answer is CDK Provider + isComplete pattern. Call `copy-db-snapshot` in onEvent, check `describe-db-snapshots` in isComplete. queryInterval=2min, totalTimeout=2hrs. Direct implementation impossible due to Lambda 15-min limit, manual Step Functions adds complexity.

## CloudFormation Hooks — Proactive Guardrail

2021 launch of Hooks pursues completely different direction from Custom Resource. Custom Resource is "add features," Hooks is "validate changes before execution." **Before CFN creates/updates resources, Hook invokes for evaluation, and FAIL return blocks that resource operation itself.**

```python
# Hook handler (registered via Resource Type Provider)
def handler(session, request, callback_context):
    target = request.hook_context.target_name  # e.g., 'AWS::S3::Bucket'
    properties = request.hook_context.target_model.resource_properties

    if target == 'AWS::S3::Bucket':
        encryption = properties.get('BucketEncryption')
        if not encryption:
            return ProgressEvent.failed(
                error_code=HandlerErrorCode.NonCompliant,
                message='S3 bucket must have encryption enabled'
            )

    return ProgressEvent.success()
```

| Tool | Timing | Action |
|------|--------|--------|
| **CFN Hook** | Pre-provision (before changes) | Proactive prevention — block violations |
| **AWS Config Rule** | Post-provision (after changes) | Reactive detection — alert/auto-fix |
| **SCP** | API call time | Block call itself (account-wide) |
| **IAM Policy** | API call time | Deny permission |
| **Stack Policy** | Stack Update time | Deny specific resource changes |

Hooks back Control Tower's Proactive Guardrails, letting registrations enforce company policies. E.g. "all RDS multi-AZ mandatory", "all S3 BlockPublicAccess mandatory", "all EC2 IMDSv2 mandatory" — blocking changes before they happen.

> 💡 **Related Theory**: Hooks follow Kubernetes's ValidatingAdmissionWebhook pattern. K8s admission controller calls webhook when resource create/update arrives, webhook evaluates and denies the request if it fails. OPA (Open Policy Agent) + Gatekeeper is K8s ecosystem's standard policy engine, while CFN Hooks is the AWS equivalent. NIST SP 800-204C recommends "policy-as-code with admission control," and Hooks are its AWS implementation.

> 🔍 **Deeper**: Hooks specify `INVOCATION_POINT` on registration — where invocation happens — `PRE_PROVISION` (before resource create), `PRE_UPDATE` (before update), `PRE_DELETE` (before delete). Each invocation point can have modes WARN (log only, proceed) or FAIL (block). Early adoption uses WARN to measure baseline, then transitions to FAIL — standard graceful rollout.

## Change Set + CI/CD — Standard for Safe Changes

Change Set "previews" CFN changes. Before applying, it shows what resources add/modify/delete, **especially if Modify causes Replacement (auto-swapped resources) — a downtime or data-loss signal**.

```
$ aws cloudformation describe-change-set --change-set-name v2 --stack-name myapp
{
  "Changes": [
    {
      "Type": "Resource",
      "ResourceChange": {
        "Action": "Modify",
        "LogicalResourceId": "ProdDatabase",
        "PhysicalResourceId": "myapp-prod-db",
        "ResourceType": "AWS::RDS::DBInstance",
        "Replacement": "True",                  # ⚠️ Resource replacement occurs
        "Scope": ["Properties"],
        "Details": [{
          "Target": {
            "Attribute": "Properties",
            "Name": "Engine",
            "RequiresRecreation": "Always"
          },
          "ChangeSource": "DirectModification"
        }]
      }
    }
  ]
}
```

Humans judge "is this change safe" from this info. Standard CI/CD integration:

```yaml
# CodePipeline example
Stages:
  - Name: Source
    Actions: [...]
  - Name: Build
    Actions:
      - Name: BuildTemplate
        ActionTypeId: { Category: Build, Provider: CodeBuild }
  - Name: CreateChangeSet
    Actions:
      - Name: CreatePrChangeSet
        ActionTypeId: { Category: Deploy, Provider: CloudFormation }
        Configuration:
          ActionMode: CHANGE_SET_REPLACE
          StackName: myapp-prod
          ChangeSetName: pipeline-changes
          TemplatePath: BuildArtifact::packaged.yaml
          Capabilities: CAPABILITY_NAMED_IAM
  - Name: Approval
    Actions:
      - Name: ManualApproval
        ActionTypeId: { Category: Approval, Provider: Manual }
        Configuration:
          CustomData: 'Review Change Set in CFN console before approving'
  - Name: ExecuteChangeSet
    Actions:
      - Name: Execute
        ActionTypeId: { Category: Deploy, Provider: CloudFormation }
        Configuration:
          ActionMode: CHANGE_SET_EXECUTE
          StackName: myapp-prod
          ChangeSetName: pipeline-changes
```

Pipeline creates Change Set only then stops → operator reviews in CFN console → Approval triggers execution. **Forces manual confirmation on all prod changes**, a governance pattern satisfying SOC 2, PCI-DSS "change management" audit requirements.

> 📚 **Case Study**: 2021 SaaS pushed prod changes directly via `aws cloudformation deploy` without Change Set review, mismodifying RDS Engine causing 6-hour downtime. Engine change triggers Replacement=True but deploy command doesn't show this info and executes immediately. Company standard became "all prod CFN changes use Change Set + Manual Approval" afterward, preventing same-pattern recurrence.

## Drift Detection's True Meaning and Limits

Covered Day 1 but worth re-emphasizing in Custom Resource·Hooks context. **Drift Detection compares only attributes CFN knows**. External system resources created by Custom Resource (Slack channels, GitHub webhooks) changes aren't caught by CFN drift. Hook-blocked change attempts appear in CloudTrail but unrelated to drift.

| Change Type | Caught by CFN Drift | Other Tool Needed |
|---|---|---|
| AWS resource property console direct edit | ✅ | - |
| AWS resource console deletion | ✅ | - |
| Custom Resource external system change | ❌ | External system audit log |
| Lambda code direct update-function-code | ❌ (CFN doesn't compare zip hash) | CloudTrail |
| New resource external addition | △ (partial additional drift) | AWS Config |
| Hook-blocked attempt | ❌ | CloudTrail |

This limit creates "Drift Detection as first defense, AWS Config + CloudTrail as second defense" governance pattern. Drift Detection alone can't guarantee prod security.

> 🎯 **Scenario**: "Track who changed Slack channel permissions that Custom Resource created." — Answer is Slack Audit Log Streaming (Enterprise Grid feature) to S3 or SIEM, EventBridge Rule or separate workflow for evaluation. CFN Drift Detection can't catch external system changes so irrelevant here.

## Summary

Today's picture has five parts. First, **Custom Resource extends CFN's lifecycle engine** mirroring K8s CRD + Operator. Second, **ResponseURL and PhysicalResourceId handle asynchronicity and identity** — no response = 1-hour timeout, changed PhysicalResourceId = auto-recreation. Third, **CDK Provider's isComplete pattern** auto-creates Step Functions gracefully bypassing Lambda 15-minute limit. Fourth, **Hooks provide pre-deployment validation** (admission control like K8s) complementing Config Rules' post-deployment evaluation. Fifth, **Change Set + Manual Approval enforces SOC 2/PCI governance** for prod change control.

Next we explore **CDK** itself. SAM applied Transform Macro abstraction over YAML; CDK goes one level higher using generic languages (TypeScript/Python/Java) to synthesize CFN, a higher abstraction tier.

---

## 📝 연습 문제

(All practice problems in Korean - preserved from original)

**문제 1.** Custom Resource Lambda가 어떤 분기에서도 ResponseURL에 응답을 보내지 못하면 발생하는 일은?

A) 자동 성공으로 처리
B) CFN이 기본 1시간(설정 시 최대 3일) 대기 후 Stack을 실패 처리 — 그동안 전체 Stack이 IN_PROGRESS로 묶임
C) 자동 재시도 3회
D) Layer로 자동 우회

**정답: B**

해설: CFN과 Lambda 간 비동기 응답 프로토콜의 핵심. Lambda timeout, 예외, return 누락 어떤 경로든 응답이 안 오면 CFN은 ResponseURL polling을 계속한다. 모든 try/finally 분기에 응답 보장이 필수이고, AWS는 `cfn-response` 모듈 또는 CDK Provider framework 사용을 권장한다. Stack이 묶이면 다른 변경도 막혀 운영 사고로 이어짐.

---

**문제 2.** Custom Resource Update 시 Lambda가 새 PhysicalResourceId를 반환하면 CFN의 동작은?

A) 동일 자원의 정상 Update
B) CFN이 이전 PhysicalResourceId로 Delete 호출 + 새 ID로 Create — 자원 교체로 해석
C) Stack 실패
D) 동작 변화 없음

**정답: B**

해설: PhysicalResourceId가 외부 자원의 동일성 키. 키가 바뀌면 다른 자원으로 간주해 자동 교체. RDS DBInstanceIdentifier 변경이 교체를 유발하는 것과 같은 모델. 2020년 핀테크 결제 API key 자동 회전 사고와 같은 패턴 — 매 Update마다 새 키 생성하도록 짜면 이전 자원이 자동 삭제되어 진행 중인 트랜잭션 실패. Update 분기에선 `event['PhysicalResourceId']` 유지가 표준.

---

**문제 3.** CDK Provider framework의 isComplete 핸들러가 풀어주는 문제는?

A) IAM 자동 생성
B) Lambda 15분 timeout 한계 — 장시간 작업(RDS 스냅샷 크로스 리전 복사, ECR 복제 등)을 Step Functions polling으로 우아하게 처리
C) 비용 절감
D) 자동 Drift Detection

**정답: B**

해설: Lambda invocation은 최대 15분이지만 외부 자원 작업은 더 길 수 있음. onEventHandler는 작업 시작, isCompleteHandler는 주기적으로 완료 여부 확인. CDK가 Step Functions를 자동 생성해 polling 인프라를 캡슐화. queryInterval/totalTimeout으로 polling 주기와 최대 대기 시간 조절. 수동으로 Step Functions를 작성하지 않아도 되는 추상화의 가치.

---

**문제 4.** CloudFormation Hooks와 AWS Config Rules의 가장 정확한 차이는?

A) 둘 다 동일한 시점에 평가
B) Hooks는 변경 전(pre-provision) 차단(proactive prevention), Config Rules는 변경 후(post-provision) 평가/알람/자동 수정(reactive detection)
C) Hooks는 IAM 전용
D) Config Rules는 비용이 더 비쌈

**정답: B**

해설: 사전 vs 사후가 핵심 차이. Hooks는 K8s ValidatingAdmissionWebhook과 같은 admission control 패턴 — 위반 변경이 절대 발생하지 않게 차단. Config Rules는 일어난 변경을 평가하고 알람 또는 Remediation Action으로 사후 대응. NIST SP 800-204C의 "policy-as-code with admission control" 권고 구현. Control Tower Proactive Guardrails가 내부적으로 Hooks 사용.

---

**문제 5.** prod CFN 변경에 SOC 2 / PCI-DSS의 change management 통제 요건을 충족하려면 가장 적절한 패턴은?

A) `aws cloudformation deploy` 한 줄로 자동화
B) CodePipeline에 CreateChangeSet → Manual Approval → ExecuteChangeSet 3단계 구성 + Change Set의 Replacement 정보를 사람이 검토 후 승인
C) IAM 권한만 강화
D) Drift Detection만으로 충분

**정답: B**

해설: `aws cloudformation deploy`는 Change Set 정보를 보여주지 않고 바로 실행 → Replacement=True 같은 위험 변경을 놓침(2021년 SaaS RDS Engine 사고). 표준 패턴은 Change Set으로 미리보기 → 사람 검토 → 승인 시 실행 3단계. ManualApproval Action이 사람의 한 단계 확인을 강제해 SOC 2 CC8.1(Change Management) 요건 자동화 충족. Drift Detection은 사후 감지이지 변경 통제 아님.

---

**문제 6.** Drift Detection이 감지하지 못하는 변경 중 가장 위험한 것은?

A) S3 버킷 콘솔 삭제
B) Custom Resource로 만든 외부 시스템(Slack 채널, GitHub webhook 등) 자원의 외부 변경 — CFN은 외부 시스템 상태를 모르므로 감지 불가, 별도 audit log 필요
C) EC2 인스턴스 타입 변경
D) RDS 비밀번호 회전

**정답: B**

해설: CFN Drift Detection은 CFN이 추적하는 AWS 리소스 속성만 비교. Custom Resource는 외부 시스템 자원의 PhysicalResourceId만 기록하고 실제 자원 상태는 추적하지 않음. Slack 채널이 외부에서 archive되거나 권한이 변경돼도 CFN drift로 잡히지 않음. 외부 시스템 audit log streaming(Slack Audit Log, GitHub Audit Log)을 별도로 SIEM에 보내야 함. A/C는 모두 CFN drift로 감지 가능, D는 동적 참조 평문 보호 영역.

---

**문제 7.** CFN Hooks를 도입할 때 안전한 rollout 전략으로 가장 적절한 것은?

A) 처음부터 FAIL 모드로 모든 리소스에 적용
B) WARN 모드로 시작해 베이스라인 위반 측정 → 위반 해소 → FAIL 모드로 전환 (graceful rollout)
C) 한 번에 모든 hook 활성화
D) Hook 비활성화

**정답: B**

해설: WARN은 위반을 로그/알람만 남기고 변경 진행, FAIL은 차단. 처음부터 FAIL이면 기존 비준수 리소스의 모든 변경이 차단되어 운영 마비. WARN으로 베이스라인 측정 → 기존 위반 정리 → FAIL 전환의 단계적 접근이 표준. K8s OPA Gatekeeper도 동일한 dryrun → warn → deny rollout 패턴 권장. 거버넌스 도입의 일반 원칙.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, Custom Resource는 CFN을 선언적 라이프사이클 엔진으로 확장하는 메커니즘이고 K8s CRD + Operator와 같은 추상화. 둘째, ResponseURL/PhysicalResourceId 프로토콜의 비동기성과 동일성 의미를 정확히 알아야 사고 없이 운영. 셋째, CDK Provider framework의 isComplete가 Step Functions를 자동 생성해 Lambda 15분 한계 우회. 넷째, Hooks는 변경 사전 검증(K8s ValidatingAdmissionWebhook과 같은 패턴)으로 Config Rules의 사후 대응과 보완. 다섯째, Change Set + Manual Approval은 SOC 2/PCI 거버넌스 요건의 자동화 표준이며 prod에 필수.
