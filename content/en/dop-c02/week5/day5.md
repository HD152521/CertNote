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

**Question 1.** A CodePipeline in the Tooling account deploys an ECS service to the Prod account. "The deploy action started without any IAM policy error, but the following error occurs during the artifact download step: `Client error: KMS key access denied when decrypting artifact`." What is the cause and the solution?

A) The pipeline service role lacks the sts:AssumeRole permission → add an identity policy to the pipeline service role that allows AssumeRole on the Spoke role ARN
B) The Prod account's CrossAccountDeployRole is not a principal in the artifact S3 bucket policy → add a principal that allows GetObject/PutObject to the bucket policy
C) The Tooling account's KMS key policy does not allow kms:Decrypt for the Prod account's CrossAccountDeployRole → modify the KMS key policy
D) The ECS task execution role and the target cluster's security group are not aligned in the same VPC/subnet → reconfigure the networking

**Answer: C**

Explanation: "The deploy action started" means AssumeRole (A) and the S3 bucket policy (B) are fine. Failing at the artifact decryption step after the action has started is the classic symptom of a missing KMS Decrypt permission. Even if S3 GetObject succeeds, the encrypted content cannot be opened without KMS Decrypt. Fix: add the Prod account's CrossAccountDeployRole as a principal in the Tooling account's KMS key policy and allow the `kms:Decrypt` and `kms:DescribeKey` permissions. The VPC (D) is unrelated to this error.

---

**Question 2.** A company manages 100 microservices in a single Git repository (monorepo). Each service has its own independent CodePipeline. A change to `shared/auth/` must trigger all 100 pipelines, and a change to `services/checkout/` must trigger only the checkout pipeline. What is the MOST appropriate V2 trigger configuration?

A) In a single pipeline, analyze the changed files with Lambda and start the corresponding service pipeline
B) In each service pipeline's filePaths.includes, include that service's path together with shared/auth/**
C) Analyze the changed files in CodeBuild and start the corresponding pipeline with start-pipeline-execution
D) Split the Git branches by service

**Answer: B**

Explanation: The V2 filePaths filter is the standard solution for a monorepo. Example configuration for the checkout pipeline: `filePaths.includes: ["services/checkout/**", "shared/auth/**"]`. Because `shared/auth/**` is in the includes of every service pipeline, a shared change starts all 100 pipelines simultaneously. A and C work, but they are more complex and harder to maintain than the native V2 feature. D gives up the advantages of a monorepo.

---

**Question 3.** A financial services company has the requirement: "Every prod deployment must pass two automated gates: (1) the error rate alarm must be in the OK state before deployment, and (2) the error rate alarm must stay in the OK state for 5 minutes after deployment. If either gate fails, roll back automatically." What is the MOST appropriate implementation?

A) Two Manual Approval actions so that a person checks both
B) Set a CloudWatch Alarm rule in the Deploy stage's beforeEntry (pre-deployment) and a CloudWatch Alarm rule in onSuccess (post-deployment), both with result: ROLLBACK
C) Place two Lambda Invoke actions before and after the Deploy action
D) Monitor the alarm state with an EventBridge rule and roll back manually on failure

**Answer: B**

Explanation: V2 stage conditions (beforeEntry, onSuccess) support exactly this pattern. A CloudWatch Alarm rule in beforeEntry → verifies the alarm is OK before deployment. A CloudWatch Alarm rule in onSuccess (WaitTime: 300) → verifies the alarm stays OK for 5 minutes after deployment. Setting result: ROLLBACK triggers an automatic rollback when onSuccess fails. Manual Approval (A) requires human intervention and is not automation. Lambda Invoke (C) is also possible, but the CloudWatch Alarm rule provider is the more natural tool for this purpose.

---

**Question 4.** A team wants to implement a pattern where "only senior engineers are allowed to approve prod deployments, and approval is done in Slack." When using AWS Chatbot, how can you control approval permission at a fine-grained, per-user level?

A) Limit the SNS topic subscriptions to senior engineers' email addresses only
B) Grant the Chatbot IAM role the codepipeline:PutApprovalResult permission, but use a Condition to allow only specific pipeline ARNs
C) Because AWS Chatbot maps Slack users directly to IAM, grant the permission to the senior engineers' IAM users
D) Implement a custom Slack bot Lambda that checks the Slack user ID against the company HR system and calls PutApprovalResult only if the user is a senior engineer

**Answer: D**

Explanation: AWS Chatbot does not map Slack users directly 1:1 to IAM users/roles. The Chatbot's IAM role holds the permissions, and everyone who can access the channel acts through Chatbot with that role. In other words, a junior engineer in the channel can also approve using Chatbot commands. If fine-grained user-based permission control is required, you must build a custom Slack bot as in D — Slack user ID → look up the company HR system → verify senior engineer status → PutApprovalResult. B is pipeline-level control, not user-level control.

---

**Question 5.** A state machine using a Step Functions action in CodePipeline must, during execution, "pause the deployment until a change request in an external change management system (ServiceNow) is approved." What is the MOST appropriate way for the state machine to implement this wait?

A) Set WaitSeconds in a Task state inside the state machine and retry every hour
B) The waitForTaskToken pattern — pass the TaskToken to ServiceNow, and ServiceNow calls SendTaskSuccess when approved
C) Alternate Lambda Invoke actions and Step Functions actions
D) Add a Manual Approval action to the pipeline

**Answer: B**

Explanation: waitForTaskToken is the standard pattern for "waiting for an asynchronous event from an external system." The state machine sends ServiceNow a message that includes the TaskToken and enters a waiting state. When a ServiceNow administrator approves the change request, ServiceNow calls SendTaskSuccess in the AWS Step Functions API, and the state machine moves on to the next state. The polling approach in A is inefficient (unnecessary API calls) and complex to implement when the wait time varies. The Manual Approval in D must go through the CodePipeline console/CLI and is hard to connect automatically to ServiceNow.

---

**Question 6.** A team managing pipelines with CDK Pipelines must satisfy both "manual approval is required before production deployment" and "staging deployment is fully automatic." How do you implement this in the CDK Pipelines code?

A) Create two separate CDK Pipelines stacks (one for staging, one for production)
B) pipeline.addStage(StagingStage) + pipeline.addStage(ProdStage, { pre: [new ManualApprovalStep('Approve')] })
C) Branch by environment using CloudFormation conditions
D) Use a Lambda Invoke action to check the environment and trigger Manual Approval only for prod

**Answer: B**

Explanation: With the pre/post options in the second argument of CDK Pipelines' addStage(), you can add a ManualApprovalStep before or after each stage. Staging has no pre; for production, add a ManualApprovalStep as pre. This code is self-mutating and stored in git, so it can go through code review. A burdens you with managing two pipelines separately, and D is hard to implement because CodePipeline has no native concept of conditional branching.

---

**Question 7.** A pipeline is currently running in SUPERSEDED mode. What happens when 10 commits are pushed in quick succession?

A) Each of the 10 commits creates a separate execution, and all 10 are built and deployed in order (this is QUEUED mode behavior)
B) The last push cancels the in-progress earlier execution by setting it to ABANDONED and runs itself. As a result, only the last commit completes execution
C) The 10 commits are queued in order and executed serially one at a time, preserving the history of every commit (this is QUEUED mode behavior)
D) 10 executions start in parallel at the same time and complete independently (this is PARALLEL mode behavior, which requires independent targets)

**Answer: B**

Explanation: In SUPERSEDED (the default), when a new execution starts, it puts the current in-progress execution into the ABANDONED state and takes over. When 10 commits are pushed rapidly: execution 1 → execution 2 cancels 1 → execution 3 cancels 2 → ... → execution 10 cancels 9. In the end only execution 10 (the last) completes. It suits fast-moving branches where the assumption that "only the latest state matters" holds. When the deployment history of intermediate commits is needed (auditing, compliance), use QUEUED.

---

**Question 8.** A team built a multi-Region pipeline. It builds in ap-northeast-2 and deploys to us-east-1 and eu-west-1 simultaneously. If the deploy actions in both Regions fail, what should you check?

A) Check that an artifact S3 bucket and KMS key for each of us-east-1 and eu-west-1 are configured in the ArtifactStores array
B) Check that VPC peering is configured between the Regions
C) Check that Route 53 exists in all three Regions
D) Check that Lambda functions are deployed in all three Regions

**Answer: A**

Explanation: In a multi-Region pipeline, setting the `region` field of a deploy action makes the action run in that Region. The artifact S3 bucket and KMS key in that Region must be configured in the CloudFormation `ArtifactStores` array. Because KMS is a Regional service, decrypting an artifact encrypted with a Seoul KMS key in Virginia requires a separate S3 bucket and KMS key in Virginia. VPC peering (B) is unnecessary, and Route 53 (C) and Lambda (D) are unrelated to this problem.

---

**Question 9.** In a pipeline, a Build action builds Docker images for several microservices, and the tag of each image must be used by subsequent Deploy actions. What is the MOST appropriate approach in a V2 pipeline?

A) Create a separate pipeline for each service
B) Declare SERVICE1_TAG, SERVICE2_TAG, and so on in CodeBuild's exported-variables, and reference each in the Deploy action in the form `#{BuildVariables.SERVICE1_TAG}`
C) Include a tags.json file inside the artifact zip and have the Deploy action read it
D) Store the environment variables in SSM Parameter Store and have the Deploy action read them

**Answer: B**

Explanation: V2's exported-variables plus referencing action output variables is the cleanest solution for this purpose. If you declare SERVICE1_TAG, SERVICE2_TAG, and so on in the exported-variables of buildspec.yml, each variable is exposed as a V2 pipeline variable and can be referenced directly in subsequent actions. C also works, but it requires separate logic to read the file inside the artifact, which is complex. The SSM approach in D is also possible, but isolation per pipeline execution is difficult (values can collide during concurrent executions).

---

**Question 10.** In a hybrid pattern where "GitHub Actions runs PR builds and tests, and CodePipeline deploys to prod only when merged to the main branch," what is the MOST secure and simple way to implement the handoff from GitHub Actions to CodePipeline?

A) Call start-pipeline-execution directly with the AWS CLI from GitHub Actions (using IAM user access keys)
B) Assume an IAM role from GitHub Actions through an OIDC provider → call start-pipeline-execution (temporary credentials)
C) Push the image to ECR → the CodePipeline source stage detects the ECR event → the pipeline starts automatically
D) Publish a message from GitHub Actions to an SNS topic → Lambda calls start-pipeline-execution

**Answer: C**

Explanation: The ECR push → CodePipeline source trigger approach (C) is the most secure and simple. GitHub Actions does not need any AWS credentials at all — it only needs permission to push images to ECR (using temporary credentials through OIDC). CodePipeline detects the new image in ECR and starts the deployment pipeline automatically. This is a clear separation in which the image itself becomes the "deployment trigger." B is also secure, but it adds the complexity of GitHub Actions holding CodePipeline API permissions. The IAM user access keys in A are long-term credentials and a security risk.

---

**Question 11.** While deploying to 50 accounts using StackSets in SERVICE_MANAGED mode, the following error occurs: "You must be an administrator of an Organization to use this operation." What is the cause?

A) The StackSet template has a validation error, such as a missing IAM CAPABILITY_NAMED_IAM, so it fails before the Organizations permission check
B) A SERVICE_MANAGED StackSet can only be run from the Organizations management account or a delegated administrator account, and the current account is neither
C) The target accounts do not belong to Organizations, so trusted access is not enabled, and the integration between StackSets and Organizations is broken
D) The StackSet's MaxConcurrentPercentage is too high, exceeding the concurrent deployment limit, which surfaces as a permission error

**Answer: B**

Explanation: SERVICE_MANAGED StackSets work integrated with AWS Organizations. This mode can only be used from the Organizations management account or a delegated administrator account designated through Organizations. This error occurs if you try to create or operate a SERVICE_MANAGED StackSet from an ordinary member account. SELF_MANAGED mode is independent of Organizations and can be used from any account, but you must manually create the AWSCloudFormationStackSetExecutionRole in every target account.

---

**Question 12.** A team faces the problem that "a Lambda Invoke action calls an external deployment system and takes 45 minutes to complete." Which of the following is an INCORRECT way to work around Lambda's 15-minute limit while having the pipeline wait for the 45-minute completion?

A) Switch to a Step Functions action — handle the 45-minute job inside a state machine
B) Set the Lambda timeout to 45 minutes and keep the existing approach
C) Lambda immediately dispatches the job to SQS and calls put_job_success_result → a separate worker sends a notification through a system outside the pipeline after completion (one-way; the pipeline treats it as a success)
D) Lambda immediately starts a Step Functions WaitForTaskToken execution and calls put_job_success_result → after 45 minutes the external system calls Step Functions' SendTaskSuccess

**Answer: B**

Explanation: Lambda's maximum execution time is 15 minutes (900 seconds). No setting can extend it to 45 minutes. B is the incorrect statement. The rest are all valid workarounds. A (Step Functions) can handle the 45 minutes directly. C (asynchronous fire and forget) has the pipeline treat it as a success without waiting for completion. D is an advanced pattern in which Lambda starts Step Functions and Step Functions WaitForTaskToken waits the 45 minutes.

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
