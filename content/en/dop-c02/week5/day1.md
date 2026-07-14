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

## 📝 연습 문제

**문제 1.** CodePipeline의 한 Stage 내에서 두 Action을 병렬로 실행하려면 어떻게 해야 하는가?

A) 두 Action을 서로 다른 Stage에 배치한다
B) 두 Action의 runOrder를 동일한 값으로 설정한다
C) Transition을 비활성화한다
D) Pipeline Execution Mode를 PARALLEL로 설정한다

**정답: B**
해설: runOrder는 Stage 내 Action의 실행 순서를 결정하는 정수값이다. 같은 runOrder를 가진 Action들은 병렬로 실행되고, 다른 runOrder를 가진 Action은 낮은 runOrder가 완료된 후 높은 runOrder가 실행된다. A는 Stage 간 관계이고(Stage 사이는 항상 직렬), C의 Transition 비활성화는 Stage 간 전이를 멈추는 것이며, D의 PARALLEL Execution Mode는 동일 Pipeline의 여러 실행을 동시에 허용하는 것이지 한 실행 내 Action 병렬화가 아니다.

---

**문제 2.** Tooling 계정의 CodePipeline이 Prod 계정 ECS에 배포한다. "S3 GetObject는 성공하지만 Artifact 압축 해제 시 AccessDenied가 발생한다"는 문제의 원인으로 가장 가능성 높은 것은?

A) S3 버킷 정책에 Prod 계정 Role이 누락
B) Prod 계정 CrossAccountDeployRole에 kms:Decrypt 권한 또는 KMS Key Policy에 해당 Role 누락
C) CodePipeline Service Role의 sts:AssumeRole 권한 부족
D) ECS Task Definition 형식 오류

**정답: B**
해설: S3 GetObject가 성공한다는 것은 S3 버킷 정책과 Prod 계정의 S3 접근 권한은 정상이라는 뜻이다. Artifact는 KMS로 암호화되어 있어서 다운로드 후 복호화가 필요하다. 복호화에는 kms:Decrypt 권한이 Prod 계정 Role의 IAM Policy에 있어야 하고, Tooling 계정의 KMS Key Policy에도 해당 Prod 계정 Role이 명시되어야 한다. 양쪽 중 하나라도 빠지면 "GetObject 성공, Decrypt 실패"가 된다. CloudTrail에서 `kms:Decrypt` AccessDenied 이벤트를 확인하면 즉시 진단된다.

---

**문제 3.** V2 Pipeline의 QUEUED Execution Mode가 필요한 시나리오로 가장 적절한 것은?

A) 빠른 main 브랜치 개발에서 최신 commit만 빌드하면 된다
B) 감사 요구사항으로 모든 commit의 배포 이력이 필요하고, 새 commit이 진행 중 빌드를 취소해서는 안 된다
C) 여러 PR 브랜치를 동시에 독립적으로 빌드해야 한다
D) Pipeline 실행 비용을 최소화해야 한다

**정답: B**
해설: QUEUED는 새 실행이 시작될 때 이전 실행을 취소하지 않고 큐에 추가해 FIFO 순서로 실행한다. 금융 규제나 SOC2 감사에서 "어떤 commit이 언제 prod에 배포됐는지"의 완전한 이력이 필요할 때 모든 commit 실행이 보장되어야 한다. A는 SUPERSEDED(기본)의 시나리오, C는 PARALLEL의 시나리오, D는 SUPERSEDED가 오히려 적게 실행되어 비용이 낮을 수 있다.

---

**문제 4.** CodePipeline에서 Artifact Store의 KMS 키를 Customer Managed Key(CMK)로 설정해야 하는 이유로 가장 적절한 것은?

A) CMK가 AWS 관리 키보다 저렴하다
B) Cross-Account 배포 시 KMS Key Policy에서 다른 계정 Role에게 권한을 부여할 수 있다
C) CMK가 더 강한 암호화 알고리즘을 사용한다
D) AWS 관리 키는 S3와 함께 사용할 수 없다

**정답: B**
해설: AWS 관리 키(aws/s3 등)는 Key Policy를 사용자가 수정할 수 없다. 따라서 다른 계정의 Role에게 Decrypt 권한을 부여하는 것이 불가능하다. CMK는 Key Policy를 완전히 제어할 수 있어서 Spoke 계정의 CrossAccountDeployRole을 Principal로 추가해 Decrypt를 허용할 수 있다. Cross-Account Artifact 공유를 위해 CMK가 필수인 이유다. 암호화 알고리즘(AES-256)은 동일하다.

---

**문제 5.** "주말 동안 prod 배포를 일시 중단하되, 빌드와 테스트는 계속 실행해야 한다"는 요구사항을 CodePipeline에서 구현하는 가장 적절한 방법은?

A) Pipeline 자체를 비활성화한다
B) Deploy Stage의 Inbound Transition을 비활성화한다
C) Deploy Stage의 Action을 삭제한다
D) IAM Role의 권한을 일시적으로 제거한다

**정답: B**
해설: Transition 비활성화는 특정 Stage로의 진입만 막는다. Deploy Stage의 Inbound Transition을 비활성화하면 Source→Build→Test Stage는 계속 정상 실행되지만, Test Stage 완료 후 Deploy Stage로 자동 전이가 차단된다. Pipeline 비활성화(A)는 모든 Stage를 멈추고, Action 삭제(C)는 되돌리기가 어려우며, IAM Role 수정(D)은 부작용이 크다. Transition은 `disable-stage-transition`과 `enable-stage-transition` API로 간단히 제어할 수 있다.

---

**문제 6.** Pipeline Execution Mode가 PARALLEL인 경우 발생할 수 있는 가장 심각한 문제는?

A) 파이프라인 실행이 느려진다
B) 두 실행이 동일한 prod 리소스(예: ECS Service, CloudFormation Stack)를 동시에 수정하려 할 때 충돌 또는 예측 불가능한 상태가 발생한다
C) Artifact 저장 비용이 두 배가 된다
D) IAM 권한이 자동으로 제한된다

**정답: B**
해설: PARALLEL 모드는 동시에 여러 Pipeline 실행을 허용하므로, 각 실행이 독립된 Artifact를 가지지만 대상 리소스(ECS Service, CloudFormation Stack, RDS)는 공유된다. 실행 A와 실행 B가 동시에 같은 ECS Service를 업데이트하려 하면 나중 업데이트가 먼저 업데이트를 덮어쓰거나 API 충돌이 발생한다. PARALLEL은 각 실행이 독립된 환경(별도 네임스페이스, 다른 리소스)을 대상으로 할 때만 안전하다—예: 각 PR이 독립된 스테이징 환경에 배포될 때.

---

**문제 7.** CodePipeline V2에서 Build Action(CodeBuild)이 생성한 IMAGE_TAG 값을 같은 Pipeline의 Deploy Stage에서 사용하려면 어떤 방법이 올바른가?

A) Lambda Invoke Action을 중간에 추가해서 S3에 저장하고 다음 Stage가 읽는다
B) CodeBuild의 exported-variables에 IMAGE_TAG를 정의하고 Deploy Action에서 `#{BuildVariables.IMAGE_TAG}`로 참조한다
C) Pipeline 변수(variables)를 미리 선언하고 CodeBuild가 그 값을 변경한다
D) buildspec.yml의 artifacts 섹션에 IMAGE_TAG를 포함시킨다

**정답: B**
해설: CodeBuild의 buildspec.yml에서 `exported-variables` 섹션에 변수 이름을 정의하면, 해당 환경 변수 값이 V2 Pipeline의 Action 출력 변수로 자동 노출된다. 다음 Stage의 Action에서 `#{BuildVariables.IMAGE_TAG}` 형식으로 참조한다. A의 S3 경유는 불필요한 복잡성이고, C의 방식은 Pipeline 변수를 런타임에 수정하는 것인데 이는 지원되지 않는다. D의 artifacts는 Artifact 파일을 지정하는 것이지 변수 노출이 아니다.

---
