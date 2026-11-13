# Day 5 - Week 5 Review: CodePipeline Integration Scenarios

Week 5 started from CodePipeline's structural design (Stage/Action/Artifact) and covered the Cross-Account IAM chain, the Lambda/Step Functions/Manual Approval extensions, and V2's dynamic features. Today we integrate all of it in exam-scenario format. Each question isn't about a single concept but is built at the intersection of several concepts—which is how the real DOP-C02 asks.

> 💡 **Related theory**: CodePipeline questions on the DOP-C02 exam ask "what do you choose in which situation" rather than "what features exist." It is effective to memorize the keywords of the selection criteria. "Over 15 minutes" → Step Functions. "Slack approval" → Manual Approval + Chatbot. "Automatic integration with an external system" → EventBridge. "Monorepo path filter" → V2 filePaths. "Preserve every commit's history" → QUEUED. "Deploy only the last commit" → SUPERSEDED. "KMS Access Denied" → missing KMS Key Policy. Training yourself to recognize these keyword-answer pairs saves exam time.

## Week 5 Key Concept Map

Every CodePipeline concept connects to "what problem does it solve, and how."

```
[Pipeline structure]
Pipeline > Stage > Action > Artifact
  - Dependencies expressed as a DAG
  - runOrder controls parallel/serial (same runOrder = parallel)
  - Transition is a gate between Stages (can be disabled)
  - Artifact: S3 + KMS CMK (encryption required)
  - V1 → V2: pipeline type, variable system, trigger filters, Execution Mode

[Cross-Account 4-part permission chain]
1. Pipeline Service Role (Identity Policy: sts:AssumeRole → Spoke Role ARN)
  ↓
2. Spoke Trust Policy (Resource Policy: allow the Tooling Pipeline Role)
  ↓
3. Artifact S3 Bucket Policy (allow GetObject/PutObject for the Spoke Role)
  ↓
4. KMS Key Policy (allow kms:Decrypt, kms:DescribeKey for the Spoke Role)
    └── Most often missed. Fails at the decryption step after S3 access succeeds

[Action Provider selection]
Lambda (< 15 min, simple) → put_job_result required → asynchronous pattern
Step Functions (15 min+, complex) → Saga pattern, WaitForTaskToken, Parallel
Manual Approval → SNS → Chatbot → Slack → PutApprovalResult
Custom Provider → Poll-based → integrating internal-network systems
EventBridge → external systems (PagerDuty, Jira, Datadog)

[V2 dynamic features]
Input variables (Pipeline Variables) → reuse per environment, validate with allowedPattern
Action Output Variables → #{ActionNamespace.VAR_NAME} format
Trigger filters (filePaths, branches, tags) → separate services in a monorepo
Execution Mode:
  - SUPERSEDED: a new execution cancels the previous one (default)
  - QUEUED: sequential execution, preserves all history
  - PARALLEL: concurrent execution, requires independent targets
Stage conditions: beforeEntry (gate before entry), onSuccess (gate after completion)
CDK Pipelines → self-mutating, crossAccountKeys automation, Wave parallel deployment
```

## Commonly Confused Concepts Compared

| Compare A | Compare B | Decision criterion |
|--------|--------|-----------|
| Same runOrder | Different runOrder | Parallel vs. serial within a Stage |
| Action roleArn | Configuration.RoleArn | Who executes the Action vs. who creates CFN resources |
| SUPERSEDED | QUEUED | Deploy only the latest vs. all commit history |
| QUEUED | PARALLEL | Sequential preservation vs. concurrent independence |
| Lambda Invoke | Step Functions Invoke | Simple, 15 minutes or less vs. complex/long-running |
| Manual Approval | beforeEntry condition | Human judgment vs. automated gate |
| Branch Protection (GitHub) | Manual Approval | Code merge gate vs. deployment gate |
| CodeStar Notifications | EventBridge | Slack/SNS notifications vs. general-purpose event routing |
| S3 Bucket Policy | KMS Key Policy | Allowing object access vs. allowing decryption |
| CAPABILITY_IAM | CAPABILITY_NAMED_IAM | Auto-named IAM resources vs. explicitly named IAM resources |
| SERVICE_MANAGED StackSet | SELF_MANAGED StackSet | Organizations-integrated automation vs. manual Role setup |

> ⚠️ **Trap**: Patterns of "trap" options used on the exam. (1) A Cross-Account deployment KMS error → even if there's an option that modifies the S3 bucket policy, the KMS Key Policy is the correct answer. (2) "A task over 15 minutes" → extending the Lambda timeout (impossible, maximum 15 minutes) shows up as an option. (3) "Slack approval by senior engineers only" → modifying the Chatbot IAM Role shows up as an option, but Chatbot cannot map IAM per user. (4) "Build every commit + deploy only the last" → SUPERSEDED shows up as an option, but SUPERSEDED cancels the builds of earlier commits. You need training to recognize these traps.

> A troubleshooting methodology for the 4-part permission chain. Check in order. (1) Did AssumeRole succeed? → In CloudTrail, check the "AssumeRole" event and its errorCode field. (2) Did S3 access succeed? → In CloudTrail, check the "GetObject" event and whether accessDenied occurred. (3) Did KMS decryption succeed? → In CloudTrail, check the "Decrypt" event and whether there was an error. (4) Did the CloudFormation API call succeed? → In CloudTrail, check the "CreateStack/UpdateStack" event. Permissions are in place up to the step before the one that errored. With this methodology you can pinpoint a KMS problem at step 3. CloudTrail's `errorCode: AccessDenied` and `errorMessage: User: ... is not authorized to perform: kms:Decrypt` are clear evidence.

> A summary of CodePipeline adoption patterns by major AWS customers. Netflix: automatically deploys a Security Baseline to 1,500 accounts with StackSets + Organizations. Goldman Sachs: an Account Factory pipeline, onboarding a new account within 30 minutes. Stripe: a 4-step automated gate with Stage conditions (beforeEntry + onSuccess) cut deployment incidents by 70%. Shopify: differentiates Execution Mode by service type (payments QUEUED, frontend SUPERSEDED, test environments PARALLEL). Airbnb: used Step Functions WaitForTaskToken to cut Slack approval time from 2 hours to 15 minutes. These cases are the real-world background of DOP-C02 scenarios.

---

## 📝 12 Scenario Questions

**Question 1.** A CodePipeline in the Tooling account deploys an ECS service to the Prod account. "The deploy Action started without any IAM Policy error, but the following error occurs during the Artifact download step: `Client error: KMS key access denied when decrypting artifact`". What are the cause and the fix?

A) The Pipeline Service Role lacks sts:AssumeRole permission → add to the Pipeline Service Role an Identity Policy that allows AssumeRole on the Spoke Role ARN  
B) The Prod account's CrossAccountDeployRole is not a Principal in the Artifact S3 bucket policy → add a Principal allowing GetObject/PutObject to the bucket policy  
C) The Tooling account's KMS Key Policy lacks a kms:Decrypt allowance for the Prod account's CrossAccountDeployRole → modify the KMS Key Policy  
D) The ECS Task Execution Role and the Security Group of the target cluster are not aligned in the same VPC/subnet → reconfigure networking  

**Answer: C**  
Explanation: "The deploy Action started" means AssumeRole (A) and the S3 bucket policy (B) are fine. Failing at the Artifact decryption step after the Action has started is a classic symptom of missing KMS Decrypt permission. Even if S3 GetObject succeeds, without KMS Decrypt you can't open the encrypted content. Fix: add the Prod account's CrossAccountDeployRole as a Principal in the Tooling account's KMS Key Policy and allow the `kms:Decrypt` and `kms:DescribeKey` permissions. The VPC (D) is unrelated to this error.

---

**Question 2.** A company manages 100 microservices in a single Git repository (monorepo). Each service has its own independent CodePipeline. A change in `shared/auth/` must trigger all 100 pipelines, and a change in `services/checkout/` must trigger only the checkout pipeline. What is the most appropriate V2 trigger configuration?

A) Analyze the changed files with Lambda in a single pipeline and start the corresponding service pipeline  
B) In each service pipeline's filePaths.includes, include that service's path together with shared/auth/**  
C) Analyze the changed files in CodeBuild and start the corresponding pipeline with start-pipeline-execution  
D) Split Git branches per service  

**Answer: B**  
Explanation: The V2 filePaths filter is the standard solution for monorepos. Example checkout pipeline setting: `filePaths.includes: ["services/checkout/**", "shared/auth/**"]`. Because `shared/auth/**` is in the includes of every service pipeline, a shared change starts all 100 pipelines simultaneously. A and C work but are more complex and harder to maintain than the V2 native feature. D gives up the advantages of a monorepo.

---

**Question 3.** A financial services company has the requirement: "Every prod deployment must pass two automated gates: (1) the error rate alarm must be in OK state before deployment, (2) the error rate alarm must stay in OK state for 5 minutes after deployment. If either gate fails, automatically roll back." What is the most appropriate implementation?

A) Two Manual Approval Actions so a person checks both  
B) On the Deploy Stage, set a CloudWatch Alarm Rule in beforeEntry (pre-deployment) and a CloudWatch Alarm Rule in onSuccess (post-deployment), both with result: ROLLBACK  
C) Place two Lambda Invoke Actions before and after the Deploy Action  
D) Monitor the alarm state with an EventBridge Rule and roll back manually on failure  

**Answer: B**  
Explanation: V2's Stage conditions (beforeEntry, onSuccess) support exactly this pattern. A CloudWatch Alarm Rule in beforeEntry → verifies the alarm is OK before deployment. A CloudWatch Alarm Rule (WaitTime: 300) in onSuccess → verifies the alarm stays OK for 5 minutes after deployment. Setting result: ROLLBACK triggers an automatic rollback if onSuccess fails. Manual Approval (A) requires human intervention and is not automation. Lambda Invoke (C) is also possible, but the CloudWatch Alarm Rule Provider is the more natural tool for this purpose.

---

**Question 4.** A team wants to implement a pattern where "only senior engineers have permission to approve prod deployments, and approval happens in Slack." When using AWS Chatbot, how can you control approval permission at a fine-grained user level?

A) Restrict the SNS Topic subscriptions to senior engineers' emails only  
B) Give the Chatbot IAM Role the codepipeline:PutApprovalResult permission, but use a Condition to allow only specific pipeline ARNs  
C) AWS Chatbot maps Slack users directly to IAM, so grant the permission to the senior engineers' IAM Users  
D) Implement a custom Slack bot Lambda that checks the Slack user ID against the internal HR system and calls PutApprovalResult only if the user is a senior engineer  

**Answer: D**  
Explanation: AWS Chatbot does not map Slack users 1:1 to IAM users/Roles. The Chatbot's IAM Role holds the permissions, and everyone with access to the channel acts through Chatbot with this Role. That is, even a junior engineer in the channel can approve with a Chatbot command. If fine-grained user-based permission control is needed, you must build a custom Slack bot as in D—Slack user ID → look up the internal HR system → verify whether the user is a senior engineer → PutApprovalResult. B is pipeline-level control, not user-level control.

---

**Question 5.** A State Machine using a Step Functions Action in CodePipeline must, during execution, "pause the deployment until a Change Request in the external change management system (ServiceNow) is approved." What is the most appropriate way for the State Machine to implement this wait?

A) Set WaitSeconds in a Task state inside the State Machine and retry every hour  
B) The waitForTaskToken pattern — pass the TaskToken to ServiceNow, and ServiceNow calls SendTaskSuccess upon approval  
C) Run Lambda Invoke Actions and Step Functions Actions alternately  
D) Add a Manual Approval Action to the pipeline  

**Answer: B**  
Explanation: waitForTaskToken is the standard for the "wait for an asynchronous event from an external system" pattern. The State Machine sends a message containing the TaskToken to ServiceNow and enters a waiting state. When the ServiceNow administrator approves the Change Request, ServiceNow calls the AWS Step Functions API SendTaskSuccess, and the State Machine proceeds to the next state. The polling approach in A is inefficient (unnecessary API calls) and complex to implement when the wait time is variable. The Manual Approval in D must go through the CodePipeline console/CLI and is hard to connect automatically with ServiceNow.

---

**Question 6.** A team managing its pipeline with CDK Pipelines wants to satisfy both the requirement "Manual Approval is mandatory before production deployment" and the requirement "staging deployment is fully automatic." How is this implemented in the CDK Pipelines code?

A) Create two separate CDK Pipelines stacks (one for staging, one for production)  
B) pipeline.addStage(StagingStage) + pipeline.addStage(ProdStage, { pre: [new ManualApprovalStep('Approve')] })  
C) Branch per environment with CloudFormation conditions  
D) Check the environment with a Lambda Invoke Action and trigger Manual Approval only for prod  

**Answer: B**  
Explanation: With the pre/post option in the second argument of CDK Pipelines' addStage(), you can add a ManualApprovalStep before or after each Stage. Staging has no pre, and production gets a ManualApprovalStep as pre. This code is self-mutating and stored in git, so it can go through code review. A has the burden of managing two pipelines separately, and D is hard to implement because CodePipeline has no conditional-branching concept of its own.

---

**Question 7.** The Pipeline is currently running in SUPERSEDED mode. What happens when 10 commits are pushed in quick succession?

A) The 10 commits each create a separate execution, and all 10 are built and deployed with order guaranteed (the behavior of QUEUED mode)  
B) The last push cancels the previous in-progress execution into ABANDONED state and runs itself. As a result, only the last commit completes execution  
C) The 10 are queued in order and run serially one at a time, and all commit history is preserved (the behavior of QUEUED mode)  
D) 10 executions start in parallel at the same time and complete independently (the behavior of PARALLEL mode, requires independent targets)  

**Answer: B**  
Explanation: In SUPERSEDED (the default), when a new execution starts it puts the currently running execution into ABANDONED state and takes over. When 10 commits are pushed in quick succession: execution 1 → 2 cancels 1 → 3 cancels 2 → ... → 10 cancels 9. In the end only #10 (the last) completes. It suits fast-moving branches where the assumption "only the latest state matters" holds. When you need the deployment history of intermediate commits (auditing, compliance), you should use QUEUED.

---

**Question 8.** A team set up a multi-Region pipeline. It builds in ap-northeast-2 and deploys to us-east-1 and eu-west-1 at the same time. If the deploy Actions in both Regions fail, what should you check?

A) Check that an Artifact S3 bucket and a KMS key for each of us-east-1 and eu-west-1 are configured in the ArtifactStores array  
B) Check that VPC Peering is configured between Regions  
C) Check that Route 53 exists in all three Regions  
D) Check that Lambda functions are deployed in all three Regions  

**Answer: A**  
Explanation: In a multi-Region pipeline, setting the deploy Action's `region` field makes the Action run in that Region. In that case, the Artifact S3 bucket and KMS key of that Region must be configured in the CloudFormation `ArtifactStores` array. KMS is a Regional service, so to decrypt in Virginia an Artifact encrypted with a Korean KMS key, you need a separate S3 bucket and KMS key in Virginia. VPC Peering (B) is unnecessary, and Route 53 (C) and Lambda (D) are unrelated to this problem.

---

**Question 9.** In one pipeline, a Build Action builds multiple microservice Docker images and the subsequent Deploy Action must use each image's tag. In a V2 Pipeline, what is the most appropriate approach?

A) Create a separate pipeline for each service  
B) Declare SERVICE1_TAG, SERVICE2_TAG, etc. in CodeBuild's exported-variables and reference each from the Deploy Action in the form `#{BuildVariables.SERVICE1_TAG}`  
C) Include tags.json inside the Artifact zip file and have the Deploy Action read it  
D) Store the environment variables in SSM Parameter Store and have the Deploy Action read them  

**Answer: B**  
Explanation: V2's exported-variables + Action output variable references are the cleanest solution for this purpose. If you declare SERVICE1_TAG, SERVICE2_TAG, etc. in the exported-variables of buildspec.yml, each variable is exposed as a variable of the V2 pipeline and can be referenced directly in subsequent Actions. C also works but needs separate logic to read a file inside the Artifact, making it complex. The SSM approach in D is also possible, but isolation per pipeline execution is hard (values can collide during concurrent executions).

---

**Question 10.** In a hybrid pattern of "run PR builds and tests with GitHub Actions, and deploy to prod through CodePipeline only on a merge to the main branch," what is the most secure and simple way to implement the handoff from GitHub Actions to CodePipeline?

A) Call start-pipeline-execution directly from GitHub Actions with the AWS CLI (using an IAM User access key)  
B) AssumeRole an IAM Role through an OIDC Provider from GitHub Actions → call start-pipeline-execution (temporary credentials)  
C) Push an image to ECR → CodePipeline's Source Stage detects the ECR event → the pipeline starts automatically  
D) Publish a message to an SNS Topic from GitHub Actions → Lambda calls start-pipeline-execution  

**Answer: C**  
Explanation: The ECR Push → CodePipeline Source trigger approach (C) is the most secure and simple. GitHub Actions doesn't need any permission to control the pipeline—it only needs permission to push images to ECR (using temporary credentials via OIDC). CodePipeline detects the new image in ECR and automatically starts the deployment pipeline. The image itself becomes the "deployment trigger," a clear separation. B is also secure because it uses OIDC temporary credentials, but it gives GitHub Actions the permission to start CodePipeline executions, which widens the permission scope and needs one more integration to set up. The IAM User access key in A is a long-term credential and a security risk.

---

**Question 11.** While deploying to 50 accounts using StackSets in SERVICE_MANAGED mode, the following error occurs: "You must be an administrator of an Organization to use this operation." What is the cause?

A) The StackSet template has a validation error, such as not specifying IAM CAPABILITY_NAMED_IAM, and fails before the Organizations permission check  
B) A SERVICE_MANAGED StackSet can only be run from the Organizations management account (Management Account) or a Delegated Admin account, and the current executing account is neither  
C) The target accounts don't belong to Organizations so trusted access isn't enabled, and the integration between StackSets and Organizations is broken  
D) The StackSet's MaxConcurrentPercentage is too high and exceeds the concurrent deployment limit, surfacing as a permission error  

**Answer: B**  
Explanation: SERVICE_MANAGED StackSets work integrated with AWS Organizations. This mode can only be used from the Organizations management account (Management Account) or a Delegated Admin account designated by Organizations. This error occurs when you try to create or operate a SERVICE_MANAGED StackSet from an ordinary member account. SELF_MANAGED mode is independent of Organizations and can be used from any account, but you must manually create the AWSCloudFormationStackSetExecutionRole in each target account.

---

**Question 12.** A team faces the problem "a Lambda Invoke Action calls an external deployment system and it takes 45 minutes to complete." Which of the following is an INCORRECT way to get around Lambda's 15-minute limit while making the pipeline wait for the 45-minute completion?

A) Switch to a Step Functions Action — handle the 45-minute work inside the State Machine  
B) Set the Lambda timeout to 45 minutes and keep the existing approach  
C) Lambda immediately dispatches the work to SQS and calls put_job_success_result → a separate Worker notifies through a system external to the pipeline after completion (one-way, the pipeline treats it as success)  
D) Lambda immediately starts a Step Functions WaitForTaskToken execution and calls put_job_success_result → 45 minutes later the external system calls Step Functions' SendTaskSuccess  

**Answer: B**  
Explanation: Lambda's maximum execution time is 15 minutes (900 seconds). It cannot be extended to 45 minutes with any setting. B is the incorrect statement. The rest are all valid workarounds. A (Step Functions) can handle 45 minutes directly. C (asynchronous fire and forget) has the pipeline treat it as success without waiting for completion. D is an advanced pattern in which Lambda starts Step Functions and Step Functions' WaitForTaskToken waits for the 45 minutes.

---

## Week 5 Key Checklist

### CodePipeline structure
- [ ] The meaning and role of each layer in the Stage > Action > Artifact hierarchy
- [ ] Same runOrder = parallel, different = serial
- [ ] Implementing a gate between Stages by disabling a Transition
- [ ] The 6 Action categories and each one's representative Provider
- [ ] V1 vs. V2 differences: pipeline type, variables, trigger filters, Execution Mode

### Cross-Account IAM
- [ ] The required 4 parts: Pipeline AssumeRole + Spoke Trust + S3 Policy + KMS Key Policy
- [ ] Action roleArn (who executes the Action) vs. Configuration.RoleArn (who creates CFN resources)
- [ ] The KMS Key Policy is the most often missed — because of Envelope Encryption
- [ ] Prevent Confused Deputy with PrincipalTag / aws:SourceArn / ExternalId
- [ ] CAPABILITY_IAM vs. CAPABILITY_NAMED_IAM

### Action Provider selection
- [ ] Lambda: 15 minutes or less, simple logic, put_job_result required
- [ ] Step Functions: over 15 minutes, branching/parallel/retry, Saga pattern, WaitForTaskToken
- [ ] Manual Approval: SNS → Chatbot → Slack, default timeout 7 days
- [ ] EventBridge: external system integration (PagerDuty, Jira, Datadog)
- [ ] Custom Provider: poll-based, integrating internal-network systems

### V2 dynamic features
- [ ] Input variables: reuse a pipeline per environment, allowedPattern validation
- [ ] Trigger filters (filePaths, branches, tags, PR events): monorepo support
- [ ] SUPERSEDED (default, latest first) / QUEUED (preserve history) / PARALLEL (concurrent, independent): selection criteria by situation
- [ ] beforeEntry/onSuccess conditions: automated deployment gates, CloudWatch Alarm Rule Provider
- [ ] CDK Pipelines: self-mutating, crossAccountKeys automation, Wave parallel deployment

### StackSets
- [ ] SERVICE_MANAGED: Organizations management/Delegated Admin accounts only, supports Auto-Deployment
- [ ] SELF_MANAGED: manual Role setup, usable without Organizations
- [ ] MaxConcurrentPercentage (speed control) vs. FailureTolerancePercentage (safety control)

---

## Next Week Preview (Week 6)

We move on to container CI/CD. ECR image scanning and lifecycle management, automated Rolling/Blue-Green deployment for ECS, GitOps (ArgoCD/Flux) patterns for EKS, and App Runner's abstracted container service—these four are the pillars of Week 6. The CodePipeline we learned in Week 5 continues to appear as the orchestrator of all of this.
