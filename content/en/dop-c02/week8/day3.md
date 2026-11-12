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

## 📝 Practice Questions

(All practice problems in Korean - preserved from original)

**Question 1.** What happens if a custom resource Lambda fails to send a response to the ResponseURL in any branch?

A) It is treated as an automatic success
B) CFN waits for 1 hour by default (up to 3 days if configured) and then marks the stack as failed — meanwhile the entire stack is stuck in IN_PROGRESS
C) Automatic retry 3 times
D) Automatically bypassed through a layer

**Answer: B**

Explanation: This is the core of the asynchronous response protocol between CFN and Lambda. Whichever path it is — Lambda timeout, exception, or a missing return — if no response arrives, CFN keeps polling the ResponseURL. A response must be guaranteed in every try/finally branch, and AWS recommends using the `cfn-response` module or the CDK Provider framework. If the stack gets stuck, other changes are blocked too, leading to an operational incident.

---

**Question 2.** What does CFN do when the Lambda returns a new PhysicalResourceId on a custom resource update?

A) A normal update of the same resource
B) CFN calls Delete with the previous PhysicalResourceId + Create with the new ID — interpreted as a resource replacement
C) The stack fails
D) No change in behavior

**Answer: B**

Explanation: PhysicalResourceId is the identity key of the external resource. If the key changes, it is considered a different resource and is replaced automatically. It is the same model as how changing an RDS DBInstanceIdentifier triggers replacement. It is the same pattern as the 2020 fintech payment API key automatic rotation incident — if you write it to create a new key on every update, the previous resource is deleted automatically and in-flight transactions fail. In the update branch, keeping `event['PhysicalResourceId']` is the standard.

---

**Question 3.** What problem does the isComplete handler of the CDK Provider framework solve?

A) Automatic IAM creation
B) The 15-minute Lambda timeout limit — it gracefully handles long-running work (cross-Region RDS snapshot copy, ECR replication, and so on) with Step Functions polling
C) Cost savings
D) Automatic drift detection

**Answer: B**

Explanation: A Lambda invocation is at most 15 minutes, but operations on external resources can take longer. onEventHandler starts the work, and isCompleteHandler periodically checks whether it has completed. CDK automatically creates Step Functions to encapsulate the polling infrastructure. Use queryInterval/totalTimeout to adjust the polling interval and the maximum wait time. This shows the value of an abstraction that spares you from writing Step Functions manually.

---

**Question 4.** What is the most accurate difference between CloudFormation Hooks and AWS Config rules?

A) Both are evaluated at the same time
B) Hooks block before the change (pre-provision) as proactive prevention, while Config rules evaluate/alarm/auto-remediate after the change (post-provision) as reactive detection
C) Hooks are IAM only
D) Config rules are more expensive

**Answer: B**

Explanation: The key difference is before versus after. Hooks are an admission control pattern like the K8s ValidatingAdmissionWebhook — they block violating changes so they never happen. Config rules evaluate changes that have already happened and respond afterward with alarms or remediation actions. It implements the NIST SP 800-204C recommendation of "policy-as-code with admission control." Control Tower proactive guardrails use Hooks internally.

---

**Question 5.** What is the most appropriate pattern for prod CFN changes to meet the change management control requirements of SOC 2 / PCI-DSS?

A) Automate with the single line `aws cloudformation deploy`
B) A 3-stage CodePipeline setup of CreateChangeSet → Manual Approval → ExecuteChangeSet, with a human reviewing and approving the replacement information in the change set
C) Only strengthen IAM permissions
D) Drift detection alone is enough

**Answer: B**

Explanation: `aws cloudformation deploy` executes immediately without showing the change set information → it misses risky changes such as Replacement=True (the 2021 SaaS RDS engine incident). The standard pattern is three stages: preview with a change set → human review → execute upon approval. The manual approval action enforces a human confirmation step and automatically satisfies the SOC 2 CC8.1 (change management) requirement. Drift detection is after-the-fact detection, not change control.

---

**Question 6.** Which of the changes that drift detection cannot detect is the most dangerous?

A) Deleting an S3 bucket in the console
B) An external change to a resource in an external system created by a custom resource (a Slack channel, a GitHub webhook, and so on) — CFN does not know the state of external systems so it cannot detect it, and a separate audit log is needed
C) Changing an EC2 instance type
D) Rotating an RDS password

**Answer: B**

Explanation: CFN drift detection compares only the properties of AWS resources that CFN tracks. A custom resource records only the PhysicalResourceId of the external system resource and does not track the actual resource state. Even if a Slack channel is archived externally or its permissions change, CFN drift does not catch it. You must separately send the external system audit log streams (Slack audit log, GitHub audit log) to a SIEM. A and C can both be detected by CFN drift, and D falls under the plaintext protection area of dynamic references.

---

**Question 7.** What is the most appropriate safe rollout strategy when introducing CFN Hooks?

A) Apply to all resources in FAIL mode from the start
B) Start in WARN mode to measure baseline violations → resolve the violations → switch to FAIL mode (graceful rollout)
C) Enable all hooks at once
D) Disable the hooks

**Answer: B**

Explanation: WARN only logs/alarms the violation and lets the change proceed, while FAIL blocks it. If FAIL from the start, all changes to existing non-compliant resources are blocked and operations are paralyzed. The standard is a phased approach: measure the baseline with WARN → clean up existing violations → switch to FAIL. K8s OPA Gatekeeper also recommends the same dryrun → warn → deny rollout pattern. It is a general principle of governance adoption.

---

## 📌 Today's Summary

The five key takeaways from today are as follows. First, a custom resource is a mechanism that extends CFN into a declarative lifecycle engine, the same abstraction as a K8s CRD + operator. Second, you must understand exactly the asynchronous nature of the ResponseURL/PhysicalResourceId protocol and the meaning of identity to operate without incidents. Third, isComplete of the CDK Provider framework automatically creates Step Functions to get around the Lambda 15-minute limit. Fourth, Hooks are pre-change validation (the same pattern as the K8s ValidatingAdmissionWebhook) and complement the after-the-fact response of Config rules. Fifth, change set + manual approval is the automation standard for SOC 2/PCI governance requirements and is mandatory for prod.
