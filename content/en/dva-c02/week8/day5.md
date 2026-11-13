# Day 5 - Week 8 Comprehensive Review: Running the CI/CD Pipeline End to End in Your Head

At the start of this week, "there are five Code* services" was probably a burden, but looking back after a week you can see that the five services are really five stages of one flow. CodeCommit receives the code, CodeBuild builds it, CodeDeploy deploys it, CodePipeline strings the whole thing together, and Elastic Beanstalk abstracts all of it at once. If you can draw this flow in your head without getting stuck, the CI/CD area of the DVA-C02 is effectively done.

This article is not a simple summary. We **compare each service in depth once more**, **line up this week's easily confused pitfalls in a row**, and check with **12 exam-style scenario questions**. The final check is not "getting the answer right" but a self-grading of "can I explain why the other choices are wrong?"

## The Essence of the 5 Services in One Line

Here is a one-line summary of what problem each of the five services was built to solve.

| Service | Problem it solves | Core abstraction |
|--------|-------------|------------|
| **CodeCommit** | "IAM-integrated Git hosting that satisfies enterprise compliance" | Repository = IAM resource |
| **CodeBuild** | "Done with a single buildspec, without managing build infrastructure yourself" | Build = ephemeral container |
| **CodeDeploy** | "Break the risky moment of deployment into small steps and verify" | Deployment = lifecycle hooks |
| **CodePipeline** | "A workflow engine that automatically connects multiple tools in order" | Pipeline = stage + action |
| **Elastic Beanstalk** | "A PaaS that automatically configures the entire infrastructure when you just hand over code" | Environment = CloudFormation stack |

> 💡 **Related theory**: The separation of these five services is a system-level application of the "Single Responsibility Principle." Instead of building a monolith where one service does everything, each service has just one responsibility and is designed to be connected through well-defined interfaces (IAM, S3 artifacts, EventBridge). That is why it is possible to use any one of them on its own (for example, using only CodeBuild, with Jenkins for the other CI and GitHub Actions for deployment). A choice saying "the Code* series must be used together" is wrong.

## 25 Easily Confused Pairs

This collects every pair of easily confused concepts from this week's study. For a last check right before the exam.

| A | B | Key difference |
|---|---|----------|
| CodeCommit | GitHub | IAM integration vs OAuth/PAT |
| CodeCommit Triggers | Notifications | SNS/Lambda vs AWS Chatbot (Slack/Chime) |
| buildspec.yml | appspec.yml | CodeBuild build definition vs CodeDeploy deployment definition |
| install | pre_build | Install runtimes/dependencies vs work right before the build (tests, authentication) |
| build | post_build | Main build vs post-build cleanup/push |
| `variables` | `parameter-store` | Plaintext vs SSM SecureString (KMS) |
| `parameter-store` | `secrets-manager` | Manual rotation vs automatic rotation |
| BUILD_GENERAL1_* | BUILD_LAMBDA_* | EC2 container vs Firecracker microVM |
| Cache LOCAL | Cache S3 | Limited to host reuse vs permanently shared |
| In-Place | Blue/Green | Replace files on the same instances vs a new environment |
| AllAtOnce | OneAtATime | Fast/risky vs slow/safe |
| Canary | Linear | Hold at 10% then jump to 100% vs even increments |
| ApplicationStop | ApplicationStart | Script from the previous revision vs script from the current revision |
| ValidateService | AfterAllowTraffic | In-Place validation vs validation after Blue/Green traffic shift |
| EC2 CodeDeploy | ECS CodeDeploy | In-Place or B/G vs Blue/Green only |
| ECS rolling | ECS CodeDeploy B/G | The ECS service itself vs using CodeDeploy |
| Pipeline V1 | V2 | Simple stage/action vs variables + filters + execution modes |
| Pipeline SUPERSEDED | QUEUED | A new execution cancels the old one vs in order |
| Action runOrder same | Different | Parallel vs sequential |
| Source category | Invoke category | Fetch code vs run an arbitrary function |
| Manual Approval | Lambda Invoke validation | A human decision vs automated validation |
| Beanstalk Rolling | Immutable | Sequential in the same ASG vs a whole new ASG |
| Beanstalk Web | Worker | ALB + HTTP vs SQS Daemon + background |
| .ebextensions | .platform | AL1 traditional vs AL2/AL2023 recommended |
| Beanstalk Blue/Green | Traffic Splitting | Manual URL swap vs automatic ALB weighted |

## 20 Pitfalls of the Week

These are the subtle pitfalls you must distinguish on the exam. Each one could be a standalone question.

1. **CodeCommit has not accepted new sign-ups since July 2024** - but existing customers keep using it, and it is still tested on the exam.
2. **HTTPS Git Credentials are separate from the IAM console sign-in password** - they must be issued separately.
3. **The Credential Helper generates a new password with SigV4 on every git operation** - automatic authentication with the EC2 instance profile.
4. **CodeBuild uses a fresh container for every build** - startup 10-30s, and the LOCAL cache works only when the host is reused.
5. **CodeBuild environment variables under `variables` are plaintext** - use parameter-store (SecureString) or secrets-manager for secrets.
6. **privileged: true is required for Docker builds in CodeBuild** - the DinD pattern.
7. **CodeBuild VPC mode adds +30s to startup because of ENI provisioning** - internet outbound disappears, so various endpoints are needed.
8. **post_build in buildspec.yml runs even when build fails** - branch on the `CODEBUILD_BUILD_SUCCEEDING` variable.
9. **exported-variables in buildspec.yml are passed to subsequent stages** - `#{BuildVariables.X}` in CodePipeline.
10. **CodeDeploy EC2 deployments require the Agent** - Lambda/ECS have no Agent.
11. **For ECS, only Blue/Green is possible with CodeDeploy** - In-Place is the ECS service's own rolling.
12. **On EC2, ApplicationStop runs the script from the previous revision** - the new script runs at the next deployment.
13. **An AllAtOnce deployment is a deployment success even if only 1 instance succeeds** - service availability is a separate matter.
14. **The decisive difference between Lambda Canary and Linear is "100% in one step vs even increments."**
15. **The Lambda BeforeAllowTraffic/AfterAllowTraffic hooks must call PutLifecycleEventHookExecutionStatus** - otherwise a 1-hour timeout.
16. **CodePipeline V2 trigger filters support only CodeStar Source Connection** - for CodeCommit, use an EventBridge rule.
17. **The CodePipeline artifact bucket must be in the same Region as the pipeline** - for Cross-Region, a separate one in each Region.
18. **Manual Approval is automatically rejected if there is no response in 7 days.**
19. **If you create RDS inside a Beanstalk environment, it is deleted along with the environment** - keep production outside.
20. **A Beanstalk Worker has no ALB, and the SQS Daemon converts to HTTP** - the application is a regular HTTP server.

## DVA-C02-Specific Topics: 5 Depth Points

### 1. Lambda Firecracker and CodeBuild Lambda compute

The CodeBuild BUILD_LAMBDA compute type (released in late 2023) internally brings up the build container on top of a Firecracker microVM. Firecracker is a KVM-based microVM monitor that AWS open-sourced in 2018, boasting boot within 100ms and a 5MB memory footprint. It is the isolation technology that Lambda and Fargate use internally, designed to aim "between an ultra-light VM and a container."

> 🔍 **Going deeper**: What differs between Firecracker and an ordinary Docker container is **isolation at the hardware virtualization (KVM) level**. Docker isolates with Linux namespaces + cgroups, so it shares the kernel, but with Firecracker each VM has its own kernel. So in multi-tenant environments (running multiple customers' code on the same host), the security boundary is much stronger. This is the secret of how Lambda was safe from the start while running other customers' function code on the same host.

### 2. DynamoDB partitions and hot partitions (tested indirectly)

The hot partition problem appears on the exam in the pattern where CodeBuild stores results in DynamoDB, or in the common Lambda + DynamoDB combination. DynamoDB distributes data by the hash of the partition key, and if all writes pile onto a single partition key, only that partition is throttled. The fixes are ① write sharding (add a suffix) ② enable Adaptive Capacity (default) ③ rethink the partition key design.

### 3. API Gateway and SigV4

When you set up IAM authentication on API Gateway, the client must sign every request with SigV4. When calling API Gateway from CodeBuild, SigV4 signing can happen automatically (handled by boto3/aws-sdk). There is a "Lambda → IAM authentication when calling API Gateway" scenario.

### 4. SQS at-least-once and the Beanstalk Worker

The SQS Daemon in a Beanstalk Worker environment exposes SQS's **at-least-once delivery** directly to the application. That is, the same message can be processed twice, and the application must guarantee idempotency. The standard pattern is to record the message ID or deduplication ID in DynamoDB to prevent duplicate processing.

### 5. X-Ray sampling and CI/CD pipelines

If you add X-Ray instrumentation to an application being built, traces are collected in production, and sampling every request makes cost balloon. X-Ray's default sampling rule is "the first 1 request per second + 5% additional sampling." When "reduce X-Ray cost" appears on the exam, adjusting the sampling rule is the answer.

## Drawing the Whole CI/CD Flow at Once

Drawing a production-grade CI/CD in which all of this week's services work together at once looks like this.

```
[Developer] git push origin feature/new-api
              │
              ▼
[CodeCommit (or GitHub via Code Connection)]
              │
              │ EventBridge triggers immediately
              ▼
[CodePipeline V2 "myapp-pipeline"]
   │
   ├── Stage 1: Source
   │     Action: CodeCommit Source (output: SourceOutput)
   │
   ├── Stage 2: Validate (parallel execution, runOrder=1)
   │     Action A: CodeBuild "lint" (input: SourceOutput)
   │     Action B: CodeBuild "security-scan" (Snyk, Bandit)
   │     Action C: CodeBuild "unit-test" (output: TestReport)
   │
   ├── Stage 3: Build
   │     Action: CodeBuild "build"
   │             - install: nodejs 20, docker
   │             - pre_build: ECR login, IMAGE_TAG export
   │             - build: docker build & push to ECR
   │             - post_build: imagedefinitions.json
   │             (output: BuildOutput with imagedefinitions.json)
   │
   ├── Stage 4: Deploy-Staging
   │     Action: ECS CodeDeploy Blue/Green
   │             - Deploy Green tasks with the new task definition
   │             - Smoke test via the ALB Test Listener
   │             - Production Listener swap
   │             - Terminate Blue tasks after 5 minutes
   │
   ├── Stage 5: Integration Test
   │     Action: CodeBuild "integration-test"
   │             - Postman/Pytest against the staging endpoint
   │
   ├── Stage 6: Manual Approval
   │     Action: Manual Approval
   │             - SNS notification → Slack via Chatbot
   │             - 7-day timeout
   │
   └── Stage 7: Deploy-Production
         Action: ECS CodeDeploy Blue/Green
                 - Lambda hook BeforeAllowTraffic: contract test
                 - 10% canary for 10 minutes → 100% (LambdaCanary10Percent10Minutes pattern)
                 - Automatic rollback when a CloudWatch Alarm is breached
```

## Equivalent Services in Other Clouds

| AWS | GCP | Azure |
|-----|-----|-------|
| CodeCommit | Cloud Source Repositories | Azure Repos |
| CodeBuild | Cloud Build | Azure Pipelines (Build) |
| CodeDeploy | (none, Cloud Deploy launching) | Azure Pipelines (Release) |
| CodePipeline | Cloud Build triggers + Cloud Deploy | Azure Pipelines |
| Elastic Beanstalk | App Engine / Cloud Run | Azure App Service |
| CodeArtifact | Artifact Registry | Azure Artifacts |

## Wrap-Up

The heart of CI/CD is a single promise: "the release procedure that people used to do manually every time, once defined, flows automatically from then on." The concrete implementation of that promise is this week's 5 services, and each service does just one role well in its own place.

Check points right before the DVA-C02 exam: ① the one-line role mapping of the 5 services ② the trade-offs of each CodeDeploy deployment strategy ③ the 9 predefined Lambda deployment configurations ④ the 6 Beanstalk deployment strategies ⑤ the new CodePipeline V2 features. You should be able to explain these 5 in your own words within 30 seconds.

Next week we look at data security, IAM, KMS, and Secrets Manager - the security area that is another core axis of the DVA-C02.

---

## 📝 Comprehensive Scenario Practice Questions (12 questions)

**Question 1.** A fintech company wants to run ① a security scan (Snyk) ② unit tests ③ lint **in parallel** for every code change, and requires all three to pass before moving to the next step. Which CodePipeline configuration is correct?

A) Place the three tasks in separate stages and set up automatic transitions between each stage
B) Put three actions in one stage and assign runOrder 1, 2, 3 to specify the dependency order
C) Put all three actions in one stage with runOrder=1
D) Separate the three tasks into separate pipelines and build a gate by aggregating completion with EventBridge

**Answer: C**

Explanation: Actions with the same runOrder within the same stage run in parallel, and all must succeed for the stage itself to be treated as successful. A) Separate stages always run sequentially, so parallelism is impossible. B) Different runOrders run sequentially 1 → 2 → 3. D) Separate pipelines make it hard to build an integrated pass gate. The standard answer for "run multiple validations in parallel in one step" on the exam.

---

**Question 2.** An e-commerce company wants to deploy a Lambda-based payment processing function. Because a bad new version leads directly to payment failures, it **must receive only 10% of traffic for the first 10 minutes and then, after automated validation, move gradually to 100%**. Also, if the CloudWatch Alarm `ErrorRate > 1%` fires, it must roll back automatically. What is the most suitable configuration?

A) `LambdaCanary10Percent10Minutes` + Auto Rollback (DEPLOYMENT_STOP_ON_ALARM)
B) `LambdaLinear10PercentEvery1Minute` + Auto Rollback (DEPLOYMENT_FAILURE)
C) `LambdaAllAtOnce` + post-hoc monitoring
D) `LambdaCanary10Percent5Minutes` + Manual Approval

**Answer: A**

Explanation: The question is "hold 10% for 10 minutes then 100% in one step" + "automatic rollback by Alarm." A) Canary10Percent10Minutes matches the scenario exactly, and AutoRollback's DEPLOYMENT_STOP_ON_ALARM creates an automatic rollback when a CloudWatch Alarm is breached. B) Linear is an even increase, which conflicts with the "100% in one step" condition, and DEPLOYMENT_FAILURE alone does not give Alarm-based rollback. C) AllAtOnce has no gradual shift. D) 5 minutes does not match the time condition, and Manual Approval is not automatic. Distinguishing Canary from Linear is the key.

---

**Question 3.** You want to deploy an ECS Fargate-based microservice with CodeDeploy Blue/Green. Which of the following is **NOT a required prerequisite**?

A) Set the ECS service's deploymentController.type to CODE_DEPLOY
B) Configure 2 ALB Target Groups (Production + Test) and two listeners (Production listener + Test listener)
C) Specify the TaskDefinition, LoadBalancerInfo, and ContainerName/ContainerPort in appspec.json (or appspec.yaml)
D) Add a CodeDeploy Agent sidecar to the container in the Fargate task definition and mount lifecycle hook scripts

**Answer: D**

Explanation: ECS (Fargate or EC2) **does not need the CodeDeploy Agent**. The ECS service handles the task definition swap and the target group switch, and CodeDeploy handles that orchestration. The Agent is needed only for EC2/on-premises deployments. A/B/C are all required. On the exam, a choice with "ECS + Agent" is almost always a trap.

---

**Question 4.** CodeBuild must connect to an Aurora cluster in a private subnet to run a DB migration. The current build runs in the default environment (an AWS managed VPC) and cannot reach Aurora. What is the most suitable fix?

A) Change the Aurora cluster to public
B) Switch the CodeBuild project to user VPC mode, specify appropriate subnets + security groups, and configure VPC Endpoints for ECR/S3/Secrets Manager
C) Work around it through a Lambda function that CodeBuild calls
D) Run the DB migration manually from an EC2 bastion

**Answer: B**

Explanation: Default CodeBuild runs in an AWS managed VPC and cannot access the user's private resources. Switching to VPC mode creates an ENI in the specified subnet, enabling access to private resources. However, since internet outbound disappears, you must create VPC Endpoints for ECR pull, S3 artifacts, CloudWatch Logs send, Secrets Manager fetch, and so on. A) Public exposure is a security anti-pattern. C) The Lambda workaround is unnecessary complexity. D) Manual work violates the principle of automation. On the exam, when you see "CodeBuild accessing private resources," VPC mode + endpoints is the answer.

---

**Question 5.** You are deploying a new version to a Beanstalk environment and need **zero downtime with the fastest possible rollback**, **production instance capacity must never decrease**, and **a temporary doubling of cost is acceptable**. What is the most suitable deployment strategy?

A) Rolling
B) Rolling with Additional Batch
C) Immutable
D) All at once

**Answer: C**

Explanation: The one that satisfies all of ① no downtime ② fast rollback ③ no capacity reduction ④ 2x cost allowed is Immutable. It brings up a whole new ASG, deploys v2, and swaps after validation. On failure, you just delete the new ASG and you are done (fast rollback). The existing ASG stays as it is throughout the deployment, so capacity is maintained. A) Rolling causes capacity reduction. B) Rolling with Additional Batch maintains capacity, but rollback is a redeployment and therefore slow. D) AllAtOnce has downtime. On the exam, when you see this bundle of 4 conditions, Immutable is the answer.

---

**Question 6.** A SaaS company runs CodePipeline in the Source account and wants to deploy to an ECS service in the **Prod account**. Which of the following configurations are needed? Select **all** that apply.

A) sts:AssumeRole permission on the Prod account cross-account role for the Source account pipeline service role
B) Create a CrossAccountDeployRole in the Prod account that trusts the Source account
C) Permissions for both accounts in the Key Policy of the KMS CMK for the artifact S3 bucket
D) Read permission for the Prod account in the artifact S3 bucket policy
E) Install the Agent on the Prod account ECS service

**Answer: A, B, C, D**

Explanation: The canonical chain for cross-account deployment. A) The Source pipeline role must be able to assume the Prod role. B) A role in Prod that trusts Source. C) The KMS CMK that encrypts the artifacts must be usable cross-account - if only one account has permission, the other account cannot decrypt. D) Read permission for the Prod account in the artifact bucket's bucket policy. E) is unrelated to ECS - the Agent is only for EC2/on-premises. This chain of 4 is a staple answer on the exam.

---

**Question 7.** You noticed that SQS messages are **intermittently processed twice** in a Beanstalk Worker environment. What are the cause and the fix?

A) SQS is at-least-once delivery, so this is normal behavior, and the application must implement idempotency
B) It is a bug in Beanstalk's SQS Daemon, so contact AWS Support
C) The Auto Scaling Group has launched too many instances, so reduce the instance count
D) Set the SQS visibility timeout to 0

**Answer: A**

Explanation: An SQS Standard Queue uses an at-least-once delivery model, so the same message can be delivered more than once. Since the SQS Daemon in the Beanstalk Worker environment passes this straight to the application over HTTP, the application must implement duplicate-processing prevention (idempotency) by recording the message ID or deduplication ID in DynamoDB. This is the standard pattern for distributed systems. B) It is not an AWS bug. C) Unrelated to the instance count. D) A visibility timeout of 0 makes the message visible again immediately, causing even more duplicates. Switching to a FIFO queue is also one way, but because of the throughput limit (300 per second), most cases use the Standard + idempotency pattern.

---

**Question 8.** Whenever a CodePipeline pipeline fails a production deployment, you want to **automatically create an incident ticket in JIRA**. What is the most suitable configuration?

A) CodeStar Notifications → AWS Chatbot → a person registers it in JIRA from Slack
B) EventBridge rule (detect FAILED state) → Lambda → call the JIRA REST API
C) Query failure logs every 5 minutes in CloudWatch Logs Insights and register in JIRA
D) Enable the JIRA integration option in the CodePipeline console

**Answer: B**

Explanation: "Complex conditional automation" like automatic JIRA ticket creation uses the standard pattern of detecting state changes with an EventBridge rule and calling an external API with Lambda. A) requires manual work by a person. C) is very inefficient polling. D) There is no JIRA integration option in the console. CodeStar Notifications suits predefined channels such as Slack/Chime, and for integrating an arbitrary system like JIRA, EventBridge + Lambda is the answer.

---

**Question 9.** You want to **pass an `IMAGE_TAG` value determined dynamically during the build in CodeBuild to the CodeDeploy action in the next stage**. What is the suitable mechanism?

A) Specify `IMAGE_TAG` in `env.exported-variables` of buildspec.yml → reference `#{BuildVariables.IMAGE_TAG}` in CodePipeline
B) Define it statically in `env.variables` of buildspec.yml
C) Store it in DynamoDB and look it up in the next stage
D) Save it as a text file in S3 and download it in the next stage

**Answer: A**

Explanation: CodeBuild's `exported-variables` is the standard mechanism for passing environment variables exported during the build to subsequent CodePipeline stages. If you run `export IMAGE_TAG=$(git rev-parse --short HEAD)` in a build phase and then declare the export in buildspec, the next stage can reference it as `#{BuildVariables.IMAGE_TAG}`. B) is a static value, so it cannot be determined dynamically. C/D) are possible but need extra permissions and code, so they are inefficient. The standard answer for "pass a variable from build to deploy" on the exam.

---

**Question 10.** A CloudWatch Alarm `ErrorRate > 5%` fired on a fleet (100 instances) undergoing an In-Place deployment to EC2 with CodeDeploy. Which combination of settings is needed for automatic rollback to work?

A) Register the alarm in the DeploymentGroup's AlarmConfiguration + include DEPLOYMENT_STOP_ON_ALARM in AutoRollbackConfiguration.Events
B) Register the CodeDeploy stop API directly as a CloudWatch Alarm action
C) Create a Lambda function that manually calls stop when the alarm fires
D) Change the ASG's health check type to ELB

**Answer: A**

Explanation: CodeDeploy automatic rollback works only when both settings are enabled. ① The alarm to monitor must be registered in AlarmConfiguration so that CodeDeploy polls/subscribes to the alarm state ② `DEPLOYMENT_STOP_ON_ALARM` must be in AutoRollbackConfiguration.Events for an automatic rollback when the alarm fires. B) A CloudWatch Alarm directly supports only SNS/EC2 actions and cannot call the CodeDeploy API directly. C) Possible but inefficient and prone to race conditions. D) Unrelated. A staple answer for the "alarm during deployment → automatic rollback" scenario on the exam.

---

**Question 11.** A company uses an external RDS as the production DB for a Beanstalk environment. It injects the DB endpoint and password through environment variables, and wants to rotate the password automatically every 30 days while having the application automatically receive the new password. What is the most suitable configuration?

A) Store the password in plaintext in `option_settings` of .ebextensions and update it manually on a regular basis
B) Store the DB credentials in AWS Secrets Manager + enable automatic rotation, inject only the endpoint through an SSM Parameter Store reference in .ebextensions, and fetch the password from the application code with the Secrets Manager API
C) Store the password file in an S3 bucket and have the instances download it periodically
D) Hardcode the password in EC2 user data

**Answer: B**

Explanation: Secrets Manager provides native automatic rotation (Lambda-based) for RDS/Aurora credentials. The application fetches the password in real time with the SDK, so it can use the new value immediately after a rotation. With .ebextensions you inject only the endpoint or the secret name, and the actual password is looked up dynamically in application code. A) Storing in plaintext violates security, and rotation is manual. C) An S3 file makes rotation hard to automate. D) Hardcoding makes rotation impossible. On the exam, when "automatic rotation" is the keyword, Secrets Manager is almost always the answer.

---

**Question 12.** You want to visualize the unit test results (JUnit XML) of a Java application being built with CodeBuild in the CodeBuild console. What buildspec.yml setting is needed?

A) Add the XML file to `artifacts.files` and specify the S3 output path with `artifacts.name`
B) Specify the file-format as JUNITXML in the `reports` section and give the file path
C) Add the XML path to `cache.paths` and set cache.type to LOCAL_CUSTOM_CACHE
D) Add JUNIT_XML to `env.exported-variables` and reference it as `#{BuildVariables.JUNIT_XML}` in a later stage

**Answer: B**

Explanation: CodeBuild's `reports` section processes test results separately and visualizes them in the console. It supports 5 formats including JUnit XML, Cucumber JSON, TestNG, NUnit, and Visual Studio TRX, with a default retention period of 30 days. A) artifacts is general storage of build output and does not visualize tests. C) cache is a dependency cache. D) exported-variables is for passing variables. On the exam, when you see "visualize test results" + buildspec, the reports section is the answer.

```yaml
reports:
  jest_reports:
    files:
      - 'junit.xml'
    file-format: JUNITXML
    base-directory: 'test-results'
```
