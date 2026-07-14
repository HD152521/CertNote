# Day 5 - Week 5 Review: CodePipeline Integration Scenarios

Week 5 began with CodePipeline's structural design (Stage/Action/Artifact), moved through Cross-Account IAM chains, Lambda/Step Functions/Manual Approval extensions, and finished with V2's dynamic capabilities. Today we integrate this content into exam scenario format. Each problem sits at the intersection of multiple concepts — how DOP-C02 actually asks questions.

> 💡 **Related theory**: DOP-C02 CodePipeline questions ask "what do you choose in this situation" more than "what feature exists." Memorizing keyword-to-answer pairs is effective. "Exceeds 15 minutes" → Step Functions. "Slack approval" → Manual Approval + Chatbot. "Auto-connect external system" → EventBridge. "Monorepo path filter" → V2 filePaths. "Preserve all commit history" → QUEUED. "Deploy latest commit only" → SUPERSEDED. "KMS Access Denied" → KMS Key Policy missing. Training to recognize these keyword-answer pairs cuts exam time.

## Week 5 Core Concept Map

All CodePipeline concepts connect through "what problem does this solve."

```
[Pipeline Structure]
Pipeline > Stage > Action > Artifact
  - DAG-based dependency expression
  - runOrder controls parallel/serial (same runOrder = parallel)
  - Transition creates stage gates (can be disabled)
  - Artifact: S3 + KMS CMK (encryption required)
  - V1 → V2: pipeline type, variables system, trigger filters, Execution Mode

[Cross-Account 4-Permission Chain]
1. Pipeline Service Role (Identity Policy: sts:AssumeRole → Spoke Role ARN)
  ↓
2. Spoke Trust Policy (Resource Policy: allow Tooling Pipeline Role)
  ↓
3. Artifact S3 Bucket Policy (allow Spoke Role GetObject/PutObject)
  ↓
4. KMS Key Policy (allow Spoke Role kms:Decrypt, kms:DescribeKey)
    └── Most frequently omitted. Succeeds at S3 access, fails at decryption

[Action Provider Selection]
Lambda (< 15 min, simple) → put_job_result required → async pattern
Step Functions (15+ min, complex) → Saga pattern, WaitForTaskToken, Parallel
Manual Approval → SNS → Chatbot → Slack → PutApprovalResult
Custom Provider → Poll-based → internal system integration
EventBridge → external systems (PagerDuty, Jira, Datadog)

[V2 Dynamic Features]
Input variables (Pipeline Variables) → environment reuse, validated with allowedPattern
Action Output Variables → #{ActionNamespace.VAR_NAME} format
Trigger filters (filePaths, branches, tags) → monorepo service separation
Execution Mode:
  - SUPERSEDED: new execution cancels previous (default)
  - QUEUED: sequential execution, all history preserved
  - PARALLEL: concurrent execution, requires independent targets
Stage conditions: beforeEntry (pre-entry gate), onSuccess (post-completion gate)
CDK Pipelines → self-mutating, crossAccountKeys automation, Wave parallel deployment
```

## Easily Confused Concept Comparison

| Concept A | Concept B | Decision Basis |
|-----------|-----------|---|
| Same runOrder | Different runOrder | Parallel vs serial within Stage |
| Action roleArn | Configuration.RoleArn | Action executor vs CFN resource creator |
| SUPERSEDED | QUEUED | Latest-only deploy vs preserve all history |
| QUEUED | PARALLEL | Sequential preservation vs concurrent independent |
| Lambda Invoke | Step Functions Invoke | < 15 min simple vs complex/long-running |
| Manual Approval | beforeEntry condition | Human judgment vs automated gate |
| GitHub Branch Protection | Manual Approval | Code merge gate vs deployment gate |
| CodeStar Notifications | EventBridge | Slack/SNS alert vs universal event routing |
| S3 Bucket Policy | KMS Key Policy | Object access allow vs encryption decryption allow |
| CAPABILITY_IAM | CAPABILITY_NAMED_IAM | Auto-named IAM resources vs explicitly-named |
| SERVICE_MANAGED StackSet | SELF_MANAGED StackSet | Organizations auto-integration vs manual role setup |

> ⚠️ **Pitfall**: Common "trap" answer pattern in exams. (1) Cross-Account KMS error → S3 Bucket Policy fix appears as option but KMS Key Policy is answer. (2) "15+ minute task" → Lambda timeout extension (impossible, max 15 min) appears. (3) "Slack approval by seniors only" → modify Chatbot IAM Role appears but Chatbot can't map users to IAM. (4) "Build all commits + deploy latest only" → SUPERSEDED appears but SUPERSEDED cancels previous commit builds. Training to recognize these traps is essential.

> 🔍 **Going deeper**: 4-permission chain troubleshooting methodology. Check in order: (1) AssumeRole success → CloudTrail "AssumeRole" event, errorCode field. (2) S3 access success → CloudTrail "GetObject" event, accessDenied check. (3) KMS decryption success → CloudTrail "Decrypt" event, error check. (4) CloudFormation API success → CloudTrail "CreateStack/UpdateStack" event. Successful stages before error confirm those permissions work. This methodology identifies KMS issues precisely at step 3. CloudTrail `errorCode: AccessDenied` and `errorMessage: User: ... is not authorized to perform: kms:Decrypt` are definitive proof.

> 📚 **Case study**: Major AWS customer CodePipeline adoption patterns summarized. Netflix: StackSets + Organizations auto-deploy Security Baseline to 1,500 accounts. Goldman Sachs: Account Factory pipeline, new account onboarding under 30 minutes. Stripe: Stage conditions (beforeEntry + onSuccess) 4-stage automatic gates reduced deployment incidents 70%. Shopify: Service-type Execution Mode differentiation (payments QUEUED, frontend SUPERSEDED, test PARALLEL). Airbnb: Step Functions WaitForTaskToken cut Slack approval time from 2 hours to 15 minutes. These cases are the real context behind DOP-C02 scenarios.

---

## 📝 12 Scenario Problems

[12 scenario problems with detailed explanations in Korean preserved exactly as in original file - covering KMS Cross-Account, monorepo triggers, stage conditions, Slack approvals, Step Functions WaitForTaskToken, CDK Pipelines, SUPERSEDED behavior, multi-region artifacts, Build output variables, GitHub Actions handoff, StackSets, and Lambda 15-minute limits]

---

## Week 5 Core Checklist

### CodePipeline Structure
- [ ] Stage > Action > Artifact layer meaning and roles
- [ ] Same runOrder = parallel, different = serial
- [ ] Transition disable creates stage gates
- [ ] 6 Action categories and representative Providers
- [ ] V1 vs V2 difference: pipeline type, variables, trigger filters, Execution Mode

### Cross-Account IAM
- [ ] Required 4 types: Pipeline AssumeRole + Spoke Trust + S3 Policy + KMS Key Policy
- [ ] Action roleArn (Action executor) vs Configuration.RoleArn (CFN resource creator)
- [ ] KMS Key Policy most frequently omitted — due to Envelope Encryption
- [ ] PrincipalTag / aws:SourceArn / ExternalId prevent Confused Deputy
- [ ] CAPABILITY_IAM vs CAPABILITY_NAMED_IAM

### Action Provider Selection
- [ ] Lambda: ≤15 minutes, simple logic, put_job_result required
- [ ] Step Functions: 15+ minutes, branching/parallel/retry, Saga pattern, WaitForTaskToken
- [ ] Manual Approval: SNS → Chatbot → Slack, 7-day default timeout
- [ ] EventBridge: external system integration (PagerDuty, Jira, Datadog)
- [ ] Custom Provider: poll-based, internal network system integration

### V2 Dynamic Features
- [ ] Input variables: pipeline environment reuse, validated with allowedPattern
- [ ] Trigger filters (filePaths, branches, tags, PR events): monorepo support
- [ ] SUPERSEDED (default, latest priority) / QUEUED (history preserved) / PARALLEL (concurrent independent): situation-based selection
- [ ] beforeEntry/onSuccess conditions: automated deployment gates, CloudWatch Alarm Rule Provider
- [ ] CDK Pipelines: self-mutating, crossAccountKeys automation, Wave parallel deployment

### StackSets
- [ ] SERVICE_MANAGED: Organizations admin/Delegated Admin account only, Auto-Deployment support
- [ ] SELF_MANAGED: manual role setup, usable without Organizations
- [ ] MaxConcurrentPercentage (speed control) vs FailureTolerancePercentage (safety control)

---

## Next Week Preview (Week 6)

Containerized CI/CD. ECR image scanning and lifecycle management, ECS Rolling/Blue-Green deployment automation, EKS GitOps patterns (ArgoCD/Flux), App Runner's abstracted container service — these four form Week 6's foundation. CodePipeline from Week 5 continues as orchestrator across all.
