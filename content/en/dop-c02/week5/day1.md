# Day 1 - CodePipeline Architecture: Understanding Why Stage, Action, and Artifact Were Designed This Way

When developers first encounter CodePipeline, it looks like Jenkins wrapped in a web UI. If you start learning with that understanding, you'll hit a wall at exam questions. What DOP-C02 asks about pipelines is not "how to use it" but rather "why designed this way, what combination is correct for this scenario." To reach that answer, you must understand what problem the CodePipeline hierarchy was designed to solve.

When Jenkins launched in 2004 under the name Hudson, a pipeline was simply a chain of jobs. "When A finishes, start B." The problem emerges as organizations grow. A multi-account environment where you build in Dev and deploy in Prod, branching logic where some branches deploy and others only build, gates where approval is required before the next stage—express all of this as a Jenkins job chain and you get spaghetti code. The Stage/Action/Artifact hierarchy of CodePipeline was designed to transform this spaghetti into an explicit graph.

## The Background Behind CodePipeline: Expressing CI/CD as a DAG

A pipeline is mathematically a DAG (Directed Acyclic Graph). The nodes are tasks, edges are dependencies, and the absence of cycles is key. Makefile (1976), Ant (2000), and Maven (2004) are all variations of this idea. The modern form of CI/CD, Pipeline-as-Code, is an evolution of methods to express DAGs in code.

> 💡 **Related theory**: A DAG uses the Topological Sort algorithm to determine execution order. Kahn's Algorithm (1962) and DFS-based methods are typical. CodePipeline's runOrder is an explicit expression of topological sorting—Actions with the same runOrder run in parallel (same layer), Actions with different runOrder run sequentially (different layers). GitHub Actions' `needs:` keyword and GitLab CI's `stages:` keyword are different syntaxes for the same DAG expression.

The decisive difference between CodePipeline and Jenkins is **the service owns the state**. Jenkins keeps state on the Jenkins server's file system. If the server crashes, state is lost and reproduction becomes difficult. CodePipeline keeps state in AWS services (S3 Artifact, internal DynamoDB state). Even if someone changes an Action's IAM Role while the pipeline is executing, the currently running instance is unaffected. This durability and isolation is the core reason enterprises choose CodePipeline.

> 🔍 **Deeper**: The Jenkins file system state dependency was a serious problem for large organizations in the early 2010s. "Jenkins Restart of Death"—where all running builds disappear when Jenkins restarts—was common. When AWS designed CodePipeline, it applied this lesson by delegating all state to S3 and DynamoDB. This design decision explains why CodePipeline is not merely "the cloud version of Jenkins." In distributed systems theory, this is called the **State Externalization** pattern—a stateless execution engine delegates state to an external durable storage.

## Pipeline Hierarchy: Why This Breakdown

```
Pipeline (entire workflow — owns IAM, Artifact Store, KMS)
├── Stage 1: Source
│   ├── Action: SourceCheckout (runOrder 1, Source category)
│   └── Action: FetchConfigs  (runOrder 1, parallel)
│
├── [Transition — optional disable gate]
│
├── Stage 2: Build
│   ├── Action: BuildApp    (runOrder 1, Build category)
│   └── Action: BuildDocs   (runOrder 1, parallel)
│
├── Stage 3: Test
│   ├── Action: UnitTest    (runOrder 1)
│   └── Action: Integration (runOrder 2, sequential)
│
├── Stage 4: Approve
│   └── Action: ManualApproval
│
└── Stage 5: Deploy
    └── Action: DeployToProd
```

**Stage** bundles a single concern (Source/Build/Test/Deploy). Within a Stage, Actions execute in parallel or sequentially based on runOrder. **Between Stages is Transition, and by disabling this Transition you can create operational gates like "deployment freeze on weekends."** When a Stage succeeds, automatic transition to the next—this is the essence of "pipeline."

**Artifact** is the data unit that moves between Stages. Source code, compiled binaries, test reports—all are stored as Artifacts in S3 and encrypted with KMS. The important point is **Artifact is the Action contract**. An Action declares "I receive Artifact named X and output Artifact named Y," and CodePipeline guarantees this name-based connection.

> 💡 **Related theory**: The Artifact pattern resembles pure functions from functional programming. Each Action is defined as input Artifact → processing → output Artifact, with side effects isolated inside the Action. This makes each stage of the pipeline **reproducible** and **testable**. In Jenkins's "shared workspace" model, one Job could directly modify another Job's files, breaking reproducibility.

> 📚 **Case study**: Capital One's 2019 re:Invent presentation on multi-account pipelines. They managed 300+ microservices each with independent CodePipeline, while keeping Artifact S3 bucket and KMS key in central Tooling account and only CrossAccountDeployRole in Spoke accounts. The most frequent problem in this pattern was "S3 works but KMS fails"—Artifact decryption failures, solved by explicitly adding all Spoke account Roles to the KMS Key Policy.

## 6 Action Categories: The Logic Behind Classification

CodePipeline's 6 Action categories (Source/Build/Test/Deploy/Approval/Invoke) are not arbitrary. Each category has different responsibility models and execution environments.

| Category | Execution | Result | Representative Provider |
|----------|-----------|--------|------------------------|
| **Source** | External source system | SourceArtifact | CodeCommit, GitHub (CodeStar Connections), S3, ECR, Bitbucket |
| **Build** | Compute (CodeBuild) | BuildArtifact | CodeBuild, Jenkins, GitHub Actions |
| **Test** | Compute | TestReport | CodeBuild, Ghost Inspector, Runscope |
| **Deploy** | Deploy service | Infrastructure state change | CodeDeploy, CloudFormation, ECS, Elastic Beanstalk, S3, AppConfig |
| **Approval** | Person | Approval/rejection | Manual (SNS notification) |
| **Invoke** | Lambda/Step Functions | Arbitrary result | Lambda, Step Functions |

Source category exists separately because the source system is outside CodePipeline and requires special integration—Webhook/polling to detect changes. Deploy category has many Providers because "deployment" means entirely different things depending on target—deploying to EC2 vs updating CloudFormation Stack vs refreshing ECS Service are completely different API calls.

> 🔍 **Deeper**: Lambda and Step Functions in Invoke category mean more than simply "execute custom logic." Lambda has a 15-minute limit while Step Functions can theoretically run for 1 year (365 days). The **Saga pattern** from AWS's distributed systems papers (Amazon Builders' Library's "Using sagas for data consistency")—handling complex distributed transactions with compensating transactions—is implemented via Step Functions Invoke Action. A typical case is rolling back an already-deployed region when another region fails in multi-region deployment.

## Artifact Storage: Specific Behavior of S3 + KMS

Artifacts are stored in the Pipeline-specified S3 bucket in the structure `<pipeline-name>/<stage-name>/<action-name>/<execution-id>/`. They are compressed (zip) and encrypted with server-side encryption using the Pipeline's KMS CMK (or AWS-managed key).

```
s3://tooling-artifacts-bucket/
└── checkout-pipeline/
    ├── Source/
    │   └── SourceArtifact/
    │       └── abc123def.zip   ← git checkout result
    ├── Build/
    │   └── BuildArtifact/
    │       └── abc123def.zip   ← compile result
    └── Test/
        └── TestReport/
            └── abc123def.zip   ← test report
```

When an Action receives InputArtifact, CodePipeline downloads the corresponding zip from S3, decrypts it, and provides it to the Action's execution environment. When an Action creates OutputArtifact, the execution environment compresses it to zip, uploads it to S3, and encrypts with KMS. **This S3 + KMS combination is the critical friction point for Cross-Account deployment.**

> ⚠️ **Pitfall**: The most common mistake in Cross-Account deployment is providing only S3 bucket policy while omitting KMS Decrypt. Even if the Spoke account Role has S3 GetObject permission, if it lacks KMS Decrypt permission, the object can be downloaded but decryption fails. The error message looks like "Access Denied" but the actual cause is KMS Policy. During troubleshooting, first check CloudTrail for `kms:Decrypt` AccessDenied events. AWS-managed keys (aws/s3) don't permit Cross-Account decryption, so Cross-Account pipelines must use CMK (Customer Managed Key).

> 💡 **Related theory**: When using KMS CMK in Cross-Account, both policies must align. **KMS Key Policy** (resource-based policy) and **IAM Identity Policy** (principal-based policy). KMS's unique characteristic is that external accounts can only use it when explicitly permitted in Key Policy—unlike S3 bucket policy, IAM Policy alone is insufficient to use another account's KMS key. This dual policy requirement causes confusion of "I gave permission but it doesn't work."

## V1 vs V2 Pipeline: Why Migration Is Necessary

The V2 Pipeline introduced at the end of 2023 is not merely a feature addition but an evolution in design philosophy.

| Functional Area | V1 | V2 |
|----------------|----|----|
| **Variable System** | Limited (environment variables only) | Rich (input variables, Action output variables, meta variables) |
| **Trigger** | Entire branch | Branch/tag/path filter (monorepo support) |
| **Execution Mode** | SUPERSEDED only | SUPERSEDED + QUEUED + PARALLEL |
| **Stage Conditions** | None | beforeEntry/success/failure conditions |
| **Action Retry** | None | Auto-retry configurable |
| **Cost** | Active pipeline $1/month | Per-execution pricing (pipeline count × execution count) |

V2's Execution Mode is particularly important. **SUPERSEDED** (default) invalidates previous in-progress execution when a new one starts—assumes that in rapid main branch development "the latest commit matters and previous ones can be discarded." **QUEUED** enqueues all executions in FIFO order for sequential execution—when audit or compliance requires complete deployment history for every commit. **PARALLEL** allows multiple executions simultaneously—when each PR branch needs independent test environment.

> 📚 **Case study**: Netflix faced the "build pollution" problem in 2012 with Jenkins-based pipelines—multiple branch builds would overwrite each other's Artifacts. Solution was transitioning to completely isolated Artifact namespace for each build execution. CodePipeline V2's Execution ID-based Artifact isolation provides exactly this pattern as an official service. In PARALLEL mode, even two executions running the same Stage have Artifacts isolated by Execution ID.

## EventBridge-Based Triggering: Polling vs Event

V1 CodePipeline was fundamentally polling-based. Periodically check CodeCommit repositories for new commits, start pipeline if found. This still applies to S3 Source and ECR Source. V2 + CodeStar Connections-based GitHub Source switched to Webhook method—GitHub sends push events to AWS, EventBridge receives and starts pipeline.

```json
{
  "source": ["aws.codecommit"],
  "detail-type": ["CodeCommit Repository State Change"],
  "detail": {
    "event": ["referenceUpdated"],
    "referenceType": ["branch"],
    "referenceName": ["main"]
  }
}
```

> 💡 **Related theory**: The fundamental difference between Polling vs Push (Webhook) is who has initiative. Polling—recipient (CodePipeline) takes initiative and periodically checks; unnecessary API calls occur even without new events (Busy Waiting). Push—sender (GitHub) immediately notifies when event occurs; no unnecessary API calls and lower latency. Internally, EventBridge acts as event bus so CodeCommit state changes become EventBridge events that CodePipeline Rule receives. This is also the standard pattern for CloudTrail → EventBridge → automation.

## IAM Role Structure: Pipeline Service Role and Action Role

CodePipeline uses two different IAM Role concepts. This is a frequent source of confusion.

**Pipeline Service Role**: The Role used by CodePipeline service itself. Here are the permissions to start CodeBuild projects, store Artifacts in S3, and initiate CodeDeploy deployments. This is the Role specified when creating a Pipeline.

**Action Role (roleArn)**: The Role assumed by a specific Action when executed. Essential for Cross-Account Actions. Pipeline Service Role first AssumeRoles this Action Role, then accesses Spoke account resources with Action Role's permissions.

```
Pipeline Service Role
    ↓ sts:AssumeRole
Action Role (Spoke account's CrossAccountDeployRole)
    ↓ Exercise permissions
CloudFormation, ECS, Lambda (Spoke account resources)
```

> 🔍 **Deeper**: IAM Role's AssumeRole chain has no explicit depth limit, but STS token session duration maxes at 12 hours and deeper chains accumulate original Role's Permission Boundary cumulatively. AWS best practices (AWS Well-Architected Framework Security Pillar) recommend separate Role per Action with Permission Boundary setting maximum permission ceiling. The reason Action Role exists separately is exactly this Least Privilege principle.

> 🎯 **Scenario**: A team using CodePipeline V1 wanted to "trigger checkout service and inventory service separately in a monorepo, each with independent pipeline." Impossible with V1—V1 triggers entire branch without path filter. Upgrade to V2 and set each pipeline's `filePaths.includes` to service directory. If one commit touches both services, both pipelines start simultaneously. This is not PARALLEL Execution Mode—PARALLEL is multiple executions of same pipeline. Different pipelines always execute independently.

## Comparison with Other CI/CD Tools

Choosing CodePipeline vs GitHub Actions vs GitLab CI is often a test topic.

| Characteristic | CodePipeline | GitHub Actions | GitLab CI |
|---|---|---|---|
| **Pipeline Definition** | JSON/CloudFormation | YAML (.github/workflows/) | YAML (.gitlab-ci.yml) |
| **Execution Environment** | CodeBuild (managed) | Runner (GitHub Hosted/Self-hosted) | Runner (GitLab Hosted/Self-hosted) |
| **AWS Integration** | Native (IAM, KMS, S3) | OIDC federation required | OIDC federation required |
| **Cross-Account** | Built-in support | Separate configuration | Separate configuration |
| **Approval Gate** | Manual Approval Action | Environment Protection Rules | Protected Environments |
| **Cost Model** | Per-pipeline + per-execution | Per-minute (commit-free included) | Per-minute (commit-free included) |
| **Monorepo** | V2 filePath filter | on.push.paths | rules:changes |
| **Matrix Build** | Awkward (Action repetition) | Native support | Native support |

"GitHub Actions + CodePipeline hybrid" frequently appears as the correct answer in DOP-C02 because it's realistic. PR build and test feel more natural with GitHub Actions, while prod deployment is safer integrated with AWS's permission model via CodePipeline. Mixing both is the practical best practice.

> ⚠️ **Pitfall**: There's a "because it's AWS, always use CodePipeline" pitfall. Matrix build (OS × runtime version combo testing), PR status display (build results auto-shown on PR), diverse language-specific Action marketplace—if these features are needed, GitHub Actions is practically more suitable. When exam scenarios say "independent build per PR + status display + multi-OS test," look toward GitHub Actions options.

## Defining Pipeline with CloudFormation

```yaml
Resources:
  MyPipeline:
    Type: AWS::CodePipeline::Pipeline
    Properties:
      Name: checkout-pipeline
      PipelineType: V2
      ExecutionMode: QUEUED
      RoleArn: !GetAtt PipelineRole.Arn
      ArtifactStore:
        Type: S3
        Location: !Ref ArtifactBucket
        EncryptionKey:
          Id: !GetAtt ArtifactKMSKey.Arn
          Type: KMS
      Triggers:
        - ProviderType: CodeStarSourceConnection
          GitConfiguration:
            SourceActionName: SourceCheckout
            Push:
              - Branches:
                  Includes: [main, release/*]
                FilePaths:
                  Includes: ["src/**", "lib/**"]
                  Excludes: ["docs/**", "*.md"]
      Stages:
        - Name: Source
          Actions:
            - Name: SourceCheckout
              ActionTypeId:
                Category: Source
                Owner: AWS
                Provider: CodeStarSourceConnection
                Version: 1
              OutputArtifacts:
                - Name: SourceArtifact
              Configuration:
                ConnectionArn: !Ref GitHubConnection
                FullRepositoryId: my-org/checkout-service
                BranchName: main
                OutputArtifactFormat: CODEBUILD_CLONE_REF
        - Name: Build
          Actions:
            - Name: BuildApp
              ActionTypeId:
                Category: Build
                Owner: AWS
                Provider: CodeBuild
                Version: 1
              InputArtifacts:
                - Name: SourceArtifact
              OutputArtifacts:
                - Name: BuildArtifact
              Configuration:
                ProjectName: checkout-build
                EnvironmentVariables: |
                  [{"name":"ENV","value":"#{variables.Environment}","type":"PLAINTEXT"}]
              RunOrder: 1
            - Name: BuildDocs
              ActionTypeId:
                Category: Build
                Owner: AWS
                Provider: CodeBuild
                Version: 1
              InputArtifacts:
                - Name: SourceArtifact
              Configuration:
                ProjectName: docs-build
              RunOrder: 1   # parallel with BuildApp
        - Name: Deploy
          BeforeEntry:
            Conditions:
              - Result: FAIL
                Rules:
                  - Name: AlarmCheck
                    RuleTypeId:
                      Category: Rule
                      Owner: AWS
                      Provider: LambdaInvoke
                      Version: 1
                    Configuration:
                      FunctionName: PreDeployAlarmGate
          Actions:
            - Name: DeployProd
              ActionTypeId:
                Category: Deploy
                Owner: AWS
                Provider: CloudFormation
                Version: 1
              InputArtifacts:
                - Name: BuildArtifact
              Configuration:
                ActionMode: CREATE_UPDATE
                StackName: checkout-prod
                TemplatePath: BuildArtifact::template.yaml
                RoleArn: !Sub "arn:aws:iam::${ProdAccountId}:role/CloudFormationExecutionRole"
```

## Actual Execution Flow: How Artifacts Move

```bash
# 1) Pipeline Service Role initializes S3 Artifact Store
# 2) Source Action fetches code from GitHub, uploads as SourceArtifact.zip to S3 + KMS encryption
# 3) Build Action downloads SourceArtifact.zip from S3 + KMS decryption → unzips to CodeBuild environment
# 4) CodeBuild executes build → uploads result as BuildArtifact.zip to S3 + KMS encryption
# 5) Deploy Action downloads BuildArtifact.zip from S3 → passes to CloudFormation/ECS

# Check Artifact size (5GB limit)
aws s3 ls s3://tooling-artifacts-bucket/checkout-pipeline/Build/BuildArtifact/ --human-readable

# Disable Transition (weekend deployment freeze)
aws codepipeline disable-stage-transition \
  --pipeline-name checkout-pipeline \
  --stage-name Deploy \
  --transition-type Inbound \
  --reason "Weekend deployment freeze - re-enable Monday 09:00 KST"

# Restore
aws codepipeline enable-stage-transition \
  --pipeline-name checkout-pipeline \
  --stage-name Deploy \
  --transition-type Inbound
```

> 💡 **Related theory**: The 5GB Artifact limit is not merely a size constraint but reflects design philosophy. Pipeline Artifacts are "delivery medium for build results," not "bulk data storage." If build results are several GB, the pattern is typically to put only image URI or S3 path "pointer" in Artifact and store actual bulk output separately in ECR or S3. This pointer pattern is "Configuration as Data" approach, keeping pipeline Artifacts small and fast while storing actual bulk output separately—separation of concerns principle.

> 🎯 **Scenario**: A financial services company wanted to implement "prod deployment only between 9 AM-6 PM KST, but Build/Test stages continue running outside those hours." Implementation: (1) Lambda function triggered by EventBridge schedule—at 6 PM disable Deploy Stage Inbound Transition with `disable-stage-transition`, at 9 AM re-enable with `enable-stage-transition`. (2) While disabled, Source/Build/Test stages continue normally, pre-built Artifacts wait for Transition re-enablement. When Transition re-enables, the most recent waiting Artifact automatically proceeds to Deploy Stage.

## Summary

Today's core takeaways are three. First, CodePipeline's Stage/Action/Artifact hierarchy is not arbitrary design but DAG-based explicit dependency expression, and Artifact is immutable contract between Actions. Second, S3 + KMS combination ensures Artifact durability and security, with KMS Key Policy required for Cross-Account. Third, V2 Pipeline is the modern standard supporting Execution Mode (SUPERSEDED/QUEUED/PARALLEL), Trigger Filter (branch/path), and Stage conditions (beforeEntry) for monorepo and enterprise needs.

Next article explores how Tooling and Spoke accounts connect via IAM/S3/KMS combination—concrete configuration of Cross-Account pipelines.

---

## 📝 Practice Questions

**Question 1.** How do you run two actions in parallel within a single stage of CodePipeline?

A) Place the two actions in different stages
B) Set the runOrder of the two actions to the same value
C) Disable the transition
D) Set the pipeline execution mode to PARALLEL

**Answer: B**
Explanation: runOrder is an integer that determines the execution order of actions within a stage. Actions with the same runOrder run in parallel, and for actions with different runOrder values, the higher runOrder runs after the lower runOrder completes. A concerns the relationship between stages (stages are always sequential), C, disabling the transition, stops the transition between stages, and D, PARALLEL execution mode, allows multiple executions of the same pipeline at the same time; it is not parallelization of actions within a single execution.

---

**Question 2.** A CodePipeline in the Tooling account deploys to ECS in the Prod account. What is the most likely cause of the problem "S3 GetObject succeeds, but AccessDenied occurs when decrypting the artifact"?

A) The Prod account role is missing from the S3 bucket policy
B) The Prod account CrossAccountDeployRole lacks the kms:Decrypt permission, or the role is missing from the KMS key policy
C) The CodePipeline service role lacks the sts:AssumeRole permission
D) An ECS task definition format error

**Answer: B**
Explanation: The fact that S3 GetObject succeeds means the S3 bucket policy and the Prod account S3 access permissions are fine. The artifact is encrypted with KMS, so it must be decrypted after download. For decryption, the kms:Decrypt permission must be in the IAM policy of the Prod account role, and that Prod account role must also be explicitly listed in the KMS key policy of the Tooling account. If either side is missing, the result is "GetObject succeeds, Decrypt fails." Checking CloudTrail for the `kms:Decrypt` AccessDenied event diagnoses it immediately.

---

**Question 3.** Which scenario most appropriately requires the QUEUED execution mode of a V2 pipeline?

A) In fast main branch development, building only the latest commit is enough
B) Audit requirements need the deployment history of every commit, and a new commit must not cancel an in-progress build
C) Multiple PR branches must be built independently at the same time
D) Pipeline execution cost must be minimized

**Answer: B**
Explanation: QUEUED does not cancel the previous execution when a new one starts; it adds the new execution to a queue and runs executions in FIFO order. When financial regulation or a SOC 2 audit requires a complete history of "which commit was deployed to prod and when," every commit execution must be guaranteed. A is the SUPERSEDED (default) scenario, C is the PARALLEL scenario, and for D, SUPERSEDED may actually run fewer executions and cost less.

---

**Question 4.** In CodePipeline, what is the most appropriate reason to set the artifact store KMS key to a customer managed key (CMK)?

A) A CMK is cheaper than an AWS managed key
B) For cross-account deployments, the KMS key policy can grant permissions to roles in other accounts
C) A CMK uses a stronger encryption algorithm
D) AWS managed keys cannot be used with S3

**Answer: B**
Explanation: With AWS managed keys (such as aws/s3), the user cannot modify the key policy. Therefore it is impossible to grant Decrypt permission to a role in another account. With a CMK you have full control of the key policy, so you can add the spoke account CrossAccountDeployRole as a principal and allow Decrypt. This is why a CMK is required for cross-account artifact sharing. The encryption algorithm (AES-256) is the same.

---

**Question 5.** What is the most appropriate way to implement the requirement "suspend prod deployments over the weekend, but keep running builds and tests" in CodePipeline?

A) Disable the pipeline itself
B) Disable the inbound transition of the Deploy stage
C) Delete the actions in the Deploy stage
D) Temporarily remove the permissions of the IAM role

**Answer: B**
Explanation: Disabling a transition only blocks entry into a specific stage. If you disable the inbound transition of the Deploy stage, the Source→Build→Test stages continue to run normally, but the automatic transition to the Deploy stage after the Test stage completes is blocked. Disabling the pipeline (A) stops all stages, deleting the actions (C) is hard to undo, and modifying the IAM role (D) has large side effects. Transitions can be controlled simply with the `disable-stage-transition` and `enable-stage-transition` APIs.

---

**Question 6.** What is the most serious problem that can occur when the pipeline execution mode is PARALLEL?

A) Pipeline executions become slower
B) When two executions try to modify the same prod resource (for example, an ECS service or CloudFormation stack) at the same time, conflicts or unpredictable states occur
C) Artifact storage cost doubles
D) IAM permissions are automatically restricted

**Answer: B**
Explanation: PARALLEL mode allows multiple pipeline executions at the same time, so each execution has its own independent artifact, but the target resources (ECS service, CloudFormation stack, RDS) are shared. If execution A and execution B try to update the same ECS service at the same time, the later update overwrites the earlier one or an API conflict occurs. PARALLEL is safe only when each execution targets an independent environment (separate namespace, different resources) — for example, when each PR deploys to its own independent staging environment.

---

**Question 7.** In CodePipeline V2, which method is correct for using the IMAGE_TAG value generated by a build action (CodeBuild) in the Deploy stage of the same pipeline?

A) Add a Lambda invoke action in between, store it in S3, and have the next stage read it
B) Define IMAGE_TAG in the CodeBuild exported-variables and reference it in the Deploy action as `#{BuildVariables.IMAGE_TAG}`
C) Declare pipeline variables in advance and have CodeBuild change their value
D) Include IMAGE_TAG in the artifacts section of buildspec.yml

**Answer: B**
Explanation: If you define a variable name in the `exported-variables` section of the CodeBuild buildspec.yml, the value of that environment variable is automatically exposed as an action output variable of the V2 pipeline. Reference it in the next stage action in the form `#{BuildVariables.IMAGE_TAG}`. Going through S3 in A is unnecessary complexity, and the approach in C modifies a pipeline variable at runtime, which is not supported. The artifacts in D specify artifact files; they do not expose variables.

---
