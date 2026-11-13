# Day 1 - Domains 1 & 2 Integrated Review: The Principle That Threads SDLC Automation and IaC Together

The first post of the final week, after sixteen weeks of running, carries the label "review," but it is not a simple lineup of flash cards. A real review is not about re-memorizing scattered service names. It is about **threading those services into one line: why each one sits where it does, what problem it was born to solve, which other tools it competes with, and which failures taught the lessons that shaped it into what it is today.** On the DOP-C02 exam, Domain 1 (SDLC Automation, 22%) and Domain 2 (IaC + Configuration Management, 17%) together make up 39%, the largest share. The exam blueprint splits them into separate domains, but in practice they are not separate. Pipelines deploy infrastructure, infrastructure defines pipelines, and configuration flows between the two. Today we reorganize this 39% into "the single flow by which code travels from commit to production," and along the way we dig into the history, internals, and real incident lessons that sit at each point on that flow.

This integrated view matters because most Pro-exam traps sit at the points that "cross domain boundaries." A question like "CodePipeline deploys CloudFormation StackSets, but a KMS error occurs cross-account" tangles Domain 1 (pipelines), Domain 2 (IaC), and Domain 6 (security) all at once. Someone who memorized each service separately falls apart at this intersection, while someone who understands them as a flow immediately spots, "Ah, the artifact encryption key policy is missing."

## The Lineage of SDLC Automation: Why Is the Code* Family Split This Way?

It is no accident that AWS's developer tools (CodeCommit, CodeBuild, CodeDeploy, and CodePipeline) are split into four. This split directly reflects **the canonical stage model of a CI/CD pipeline**. The stages source → build → test → deploy come from the **Continuous Delivery** concept that Jez Humble and David Farley established in the mid-2000s, and their 2010 book *Continuous Delivery* popularized the term "deployment pipeline." AWS's Code* family breaks this book's pipeline model apart into managed services.

> Splitting a pipeline into stages is the same idea as **pipelining** in computer science. Just as a CPU divides instruction execution into fetch-decode-execute-writeback stages so that different instructions occupy each stage at the same time, a CI/CD pipeline that separates its stages lets commit B occupy the build stage while commit A is in the deploy stage (in theory). More important is **separation of concerns**. If you separate the responsibilities of build (compiling, testing, producing artifacts) from those of deployment (traffic shifting, rollback), you can replace, scale, and retry each stage independently. The power of this separation is that you can swap CodeBuild for Jenkins or CodeDeploy for Spinnaker while leaving the orchestrator, CodePipeline, as it is. Questions on the exam like "What happens when a stage in CodePipeline fails?" presuppose this stage independence: if one action fails, execution stops at that stage, and the outputs of earlier stages are preserved.

> CodePipeline has two generations, V1 and V2, and this difference falls within the Pro exam scope. V1 is the model from its 2015 launch, with simple triggers (any source change runs the whole pipeline) and no pipeline variables. V2 (introduced in 2023) supports **dynamic variables (variables)**, **fine-grained triggers (filePaths, branches, and tags filters)**, and **pipeline-level variable passing**. For example, to "run the payment pipeline only when the `services/payment/**` path changes in a monorepo," you need V2's `filePaths` trigger. V2 also lets you choose an execution mode (SUPERSEDED, QUEUED, PARALLEL), controlling whether concurrent commits are queued or run in parallel when many arrive together. The billing model differs too: V1 charges a flat monthly fee per active pipeline, while V2 charges by execution time (action minutes), so V2 is cheaper for pipelines that rarely run. When the exam gives a "monorepo path filter" or "dynamic variables" clue, the answer is V2.

Knowing this lineage resolves one exam trap: **CodeCommit has been closed to new customers since July 2024.** AWS has shifted its weight toward integration with external Git hosting such as GitHub and GitLab (CodeConnections, formerly CodeStar Connections). So the latest Pro-exam scenarios ask about patterns of external source + federation, such as "GitHub Actions deploys to AWS via OIDC." Before choosing CodeCommit as the answer, you need the habit of checking "Is this a new environment?"

## The Math of Deployment Strategies: What Do Blue/Green, Canary, and Rolling Calculate Differently?

Deployment strategies are the heart of the DOP exam. But if you memorize In-place / Blue/Green / Canary / Linear / Rolling only as "has downtime / has no downtime," you will miss Pro questions. Each strategy is a different piece of math that minimizes **"the number of users a bad deployment affects × how long that impact lasts"** in a different way.

| Strategy | Users affected (on a bad deployment) | Extra infrastructure cost | Rollback speed | Core mechanism |
|------|------|------|------|------|
| All-at-once / In-place | 100% immediately | 0 | Slow (redeploy) | Replace everything at once |
| Rolling | Grows by the batch percentage | 0 | Medium | Replace N at a time, sequentially |
| Blue/Green | 0% (before the switch) / 100% (after the switch) | 2x (temporary) | Immediate (traffic reverted) | Two environments + routing switch |
| Canary | Only the canary percentage (e.g., 10%) | Slight | Automatic (alarm) | Two steps: a few → the rest |
| Linear | Grows by incremental percentages | Slight | Automatic (alarm) | N% every N minutes |

> The name canary deployment comes from the **canary in a coal mine**. In the 19th century, miners took canaries into the shafts to detect carbon monoxide and methane, and the birds collapsed before the people did, warning of danger. The canary group (the small share of traffic) in a canary deployment is exactly that bird: a few users reveal the new version's problems before all users are affected. Mathematically this is **sequential hypothesis testing**. You test the null hypothesis "the new version is healthy" with a small amount of traffic, and if error-rate or latency metrics (CloudWatch Alarm) cross a threshold, you reject the hypothesis and roll back automatically. The key insight: a canary minimizes the **expected loss of a bad deployment = fraction of affected users × exposure time**. If a 10% canary is exposed for only 5 minutes, the worst-case loss is bounded to "10% of everyone × 5 minutes." Contrast this with Blue/Green, where "100% is exposed immediately after the switch, but rollback is also immediate."

> Even under the same name "Blue/Green," the mechanism is completely different on each platform. Blue/Green on **Lambda** is **Alias + weighted routing**: the `prod` Alias distributes 90% to version 1 and 10% to version 2, and CodeDeploy shifts these weights over time (Canary/Linear). Blue/Green on **ECS** is **two Target Groups on an ALB + two Listeners (production/test)**: CodeDeploy launches the new Task Set on the test listener, validates it, then switches the production listener to the new Target Group. Blue/Green on **EC2** **launches a new Auto Scaling Group and swaps the ELB registration**. When the exam gives an "ECS Blue/Green" clue, the answer almost always includes "CodeDeploy + ALB Test/Prod Listener," and for Lambda, "50% in two steps every 5 minutes" is `Canary50Percent5Minutes`, while "10% every 10 minutes" is `Linear10PercentEvery10Minutes`. You must be sure to distinguish the structural difference: Canary is **two steps (a few → all)**, and Linear is **N steps of equal increments**.

> The failed IT migration of the UK's **TSB Bank** in 2017 is often cited as a deployment-strategy lesson. TSB switched everything to a new core banking platform in one go (big-bang), exposing 1.9 million customers at once to an unverified system. The result was weeks of outages, customers unable to access their funds, roughly 330 million pounds in losses, and regulatory sanctions. Had they migrated in stages with a canary/gradual strategy, starting with a few branches and a few customers, the blast radius would have been limited to that proportion. The key lesson of this incident matches the DOP exam's philosophy exactly: **"Avoid irreversible big-bang deployments, grow the scope of impact gradually, and always have an automatic rollback path ready."** When the exam gives a "minimize risk" or "minimize user impact" clue, All-at-once is the wrong answer.

## Supply Chain Integrity: Why Build Pipelines Become Targets

The build stage is not merely where code is compiled; it is **where the chain of trust begins**. The artifacts made here are deployed to production as they are, so if the build pipeline is contaminated, everything downstream is contaminated.

> The 2020 **SolarWinds** incident is the textbook case of a supply chain attack. The attackers penetrated the **build system** of SolarWinds' Orion software and injected malicious code (SUNBURST) during compilation. As a result, a backdoor was delivered to about 18,000 customer organizations through properly signed updates, and government agencies including the US Treasury and the Department of Homeland Security were breached. The key lesson: even if the source code repository is clean, **if the build environment is contaminated, the output is contaminated.** After this incident, the industry created the **SLSA (Supply-chain Levels for Software Artifacts)** framework to tier build provenance, isolation, and signing, and the **SBOM (Software Bill of Materials)**, a list of all dependencies contained in an artifact, became a compliance requirement (US Executive Order 14028). On AWS, you raise your SLSA level with a combination of running CodeBuild in an isolated VPC, signing artifacts (Lambda, containers, AMIs) with **AWS Signer**, attaching **Notation/Notary** signatures to ECR images, and scanning for vulnerabilities based on the SBOM with Inspector.

> ⚠️ **Trap**: In a question asking about "preventing tampering with a container image," choosing KMS or an S3 ACL is wrong. KMS provides **encryption (confidentiality)**, not **integrity or proof of origin**. What proves that the image is exactly as built and was made by a trusted principal is **signing**: AWS Signer + ECR Image Signing + Notation verification at deploy time. Confusing encryption with signing is the classic trap in the security area. By analogy, KMS is "putting a letter in an envelope and locking it," while signing is "stamping an unforgeable seal at the end of the letter."

## The Two Philosophies of IaC: Declarative Convergence vs. Imperative Procedure, and Drift

Moving to Domain 2, the essence boils down to a single question. It is the declarative paradigm: **"declare the target state of the infrastructure as code, and the tool computes the difference from the current state and converges it."** CloudFormation, CDK, and Terraform all stand on this idea.

> The foundation of declarative IaC is the **reconciliation loop**, the same as feedback control in control theory. It computes the difference (error) between the "desired state" and the "observed state" and applies actions that drive that difference to zero. Kubernetes controllers, Terraform's plan/apply, and CloudFormation stack updates are all this loop. This is the essence of the **declarative vs. imperative** difference. With an imperative script ("run these commands in order"), a person is responsible for execution order, failure handling, and retrying after a partial application, but a declarative system guarantees **idempotency**: applying the same code any number of times gives the same result. Idempotency is precisely why IaC can be trusted. Even if you apply the same template 100 times to 100 accounts (StackSets), each account converges to the same target state.

> **Drift** is the most subtle enemy of this paradigm. If someone opens a security group by hand in the console or deletes a tag, the "state the code declares" and the "actual state" diverge. CloudFormation **Drift Detection** compares each resource in the stack with its actual state and classifies it as MODIFIED, DELETED, or IN_SYNC. But what the exam asks is "how do you detect and respond to drift **automatically**?" The answer pattern: trigger periodic Drift Detection with an EventBridge **Scheduled Rule**, and when drift is found, hook up an SNS notification or an automatic redeployment (a stack update that returns things to the code state). Stronger governance uses the **AWS Config** `cloudformation-stack-drift-detection-check` rule to detect non-compliance and hooks up Auto-Remediation. The key insight: drift is "the trace of an imperative change intruding on a declarative system," and the fundamental fix is to **block console write permissions and let every change flow only through code** (read-only by default + pipeline-only write).

> The 2017 **AWS S3 us-east-1 outage** shows the danger of imperative operations. While debugging the S3 billing subsystem, an engineer ran a **manual command (playbook)** that contained a typo removing more servers than intended, which triggered cascading restarts and paralyzed a significant part of us-east-1 for about 4 hours (many websites went down with it). One of AWS's follow-up actions was to "add safety guardrails and staged application to such dangerous manual work," which is exactly the direction of replacing immediate imperative execution with declarative, gradual application. This incident left the lesson that "manual changes have an immediate, uncontrollable blast radius," and it strengthened the case for IaC + pipeline-based change (code review → Change Set preview → gradual application).

## Separating Configuration Management: How Do Parameter Store, Secrets Manager, and AppConfig Differ?

What flows between code and infrastructure is **configuration**. AWS offers it in three branches, and understanding this separation lets you answer instantly on the exam.

| Item | Parameter Store | Secrets Manager | AppConfig |
|------|------|------|------|
| Essence | Storing settings and parameters | Lifecycle management of secrets | Runtime dynamic configuration and feature flags |
| Automatic rotation | None (implement it yourself) | **Built in** (Rotation Lambda) | N/A |
| Validation | None | None | **Validator** (JSON Schema/Lambda) |
| Gradual deployment | None | None | **Deployment Strategy** (gradual rollout + automatic rollback) |
| Cost | Standard is free | ~$0.40/month per secret | Based on configuration retrievals |
| Typical use | Non-secret settings and environment values | DB/external API credentials | Feature flags and dynamic thresholds |

> The separation of these three is a refinement of the 12-Factor App principle that **"config is not code."** The 12-Factor App (Heroku, 2011) said "separate values that change per environment from the code and keep them in the environment," but modern systems split that "configuration" into three kinds again. (1) **Static settings** (rarely change, not secret) → Parameter Store. (2) **Secrets** (credentials that need rotation and auditing) → Secrets Manager. (3) **Dynamic behavior control** (changes at runtime and is immediately dangerous if wrong) → AppConfig. What makes AppConfig special is that it **treats the configuration change itself like a deployment**: it validates in advance with a Validator, rolls out gradually with a Deployment Strategy, and rolls back automatically through CloudWatch Alarm integration. In other words, it guards against the incident that "one wrong line of a feature flag" could cause with the same safety net as a code deployment. When the exam gives a clue like "roll out a feature flag gradually + block bad values in advance," the three-piece set of AppConfig + Validator + Deployment Strategy is the answer.

> ⚠️ **Trap**: AppConfig is a **poll model, not push**. The application periodically fetches configuration through the AppConfig Agent (or the Lambda Extension) (the polling interval is configurable). An option stating "when configuration changes, AWS immediately pushes it to the application" is a trap. Also, Parameter Store's SecureString does use KMS encryption but has **no automatic rotation**: choosing Parameter Store for "automatically rotate RDS credentials every 90 days" is wrong. If rotation is the key requirement, it is always Secrets Manager + Rotation Lambda.

## The 39% as One: The Integrated Flow Diagram

If you stop separating Domains 1 and 2 and tie them into the single flow by which one commit travels to production, the place of every service becomes visible.

```
Developer commit (GitHub / CodeCommit-legacy)
   │  CodeConnections (OIDC, no static keys)
   ▼
CodePipeline V2 (Hub in the Tooling account)
   ├─ Source   : variables/triggers (filePaths, branch filters)
   ├─ Build    : CodeBuild (isolated VPC + VPC Endpoint)
   │              → CodeArtifact (packages) / ECR (images)
   │              → Inspector scan + Signer/Notation signing [supply chain integrity]
   ├─ Test     : unit/integration + CodeGuru/SAST
   ├─ Deploy   : CloudFormation/CDK (Change Set preview)
   │              cross-account AssumeRole → Spoke
   │              [artifact S3 + KMS CMK key policy must allow the Spoke]
   │              CodeDeploy (Lambda Canary / ECS Blue-Green)
   │              + automatic rollback via CloudWatch Alarm integration
   └─ Config injection: Parameter Store (settings) / Secrets Manager (credentials) / AppConfig (flags)

Governance gates: SSM Change Calendar (freeze) · Manual Approval · Drift Detection (EventBridge)
```

> 🎯 **Scenario**: "A fintech runs 30 services in a monorepo. Requirements: ① run a service's pipeline only when `services/X/**` paths change ② prevent tampering with build artifacts ③ for Lambda functions, 10% canary for 5 minutes and then everything ④ at deploy time, DB credentials are never exposed in code and are rotated automatically every 90 days ⑤ prod is blocked during change freeze periods." → ① CodePipeline **V2 + filePaths trigger**. ② **Signer/ECR signing + Inspector SBOM scan** (not KMS). ③ CodeDeploy **`Canary10Percent5Minutes`** + automatic rollback by CloudWatch Alarm. ④ **Secrets Manager + Rotation Lambda** (not Parameter Store). ⑤ **SSM Change Calendar** gate. These five clues cross Domains 1, 6, 1, 2, and 1 respectively; only someone who memorized them as an integrated flow maps them in one pass.

## Summary

Today we tied the 39% of Domains 1+2 into five threads. First, **the split of the Code\* family is the stage model of Continuous Delivery + separation of concerns**, V2's variables, triggers, and execution modes fall within the Pro exam scope, and CodeCommit is out for new environments. Second, **deployment strategies are math that minimizes "affected users × exposure time" in different ways**; the key points are the structural difference between Canary (two steps) and Linear (equal increments) and the per-platform mechanism differences (Lambda Alias / ECS ALB Listener / EC2 ASG), and, as the TSB big-bang lesson shows, All-at-once is wrong for risk-minimization clues. Third, **the build is the starting point of the chain of trust**, and in the context of SolarWinds, SLSA, and SBOM, integrity is guaranteed by signing (Signer/Notation), not by KMS (encryption). Fourth, **IaC is a declarative convergence loop + idempotency**, and drift is the trace of an imperative change intruding, so you detect and correct it automatically with EventBridge/Config. Fifth, **configuration is separated into Parameter Store (settings), Secrets Manager (rotation), and AppConfig (polling, validation, gradual rollout)**, and each clue is the answer itself.

In the next post, we thread Domain 3 (resilience) and Domain 4 (monitoring/logging) together again through the math of RTO/RPO and observability theory.

---

## 📝 Practice Questions

**Question 1.** In a monorepo, you want to run the payment pipeline only when the `services/payment/**` path changes, and to queue commits that arrive at the same time. What configuration is needed?

A) A simple source trigger in CodePipeline V1

B) A `filePaths` trigger filter in CodePipeline V2 + the execution mode (QUEUED) setting

C) Parse the path yourself with a Lambda Custom Action

D) Receive every commit through EventBridge and run the whole pipeline

**Answer: B**

Explanation: CodePipeline V2 supports fine-grained triggers (`filePaths`, branches, and tags filters) and execution modes (SUPERSEDED/QUEUED/PARALLEL) that V1 lacks. To run only when a specific path changes you need V2's `filePaths` trigger, and queuing concurrent commits is the QUEUED execution mode. V1 (A) has no path filter or variables. Lambda parsing (C) and EventBridge running everything (D) are anti-patterns that needlessly reimplement by hand what V2 provides natively.

---

**Question 2.** You want to configure a Lambda function with a two-step deployment: "route only 50% for 5 minutes, then switch to the remaining 50% if there are no problems." Another function requires "increase by 10% every 10 minutes." What are the respective deployment configurations?

A) Both AllAtOnce

B) 50% in two steps = `Canary50Percent5Minutes`, increase by 10% = `Linear10PercentEvery10Minutes`

C) Both Rolling

D) 50% = Linear, 10% increments = Canary

**Answer: B**

Explanation: Canary has a **two-step (a small percentage → all the rest)** structure, and Linear is an **equal increment of N% every N minutes**. "50% for 5 minutes in two steps" fits the definition of Canary exactly (`Canary50Percent5Minutes`), and "10% every 10 minutes" is Linear (`Linear10PercentEvery10Minutes`). D, which swaps the structural difference between the two, is the classic wrong answer. AllAtOnce and Rolling (A, C) do not meet the gradual/two-step requirement. For Lambda, both strategies are combined with Alias weighted routing + automatic rollback by CloudWatch Alarm.

---

**Question 3.** You want to verify at deployment time that a container image has not been tampered with since it was built and was made by a trusted principal. What is the most appropriate mechanism?

A) Encrypt the image with KMS

B) Sign with AWS Signer + ECR Image Signing and verify the signature with Notation at deployment

C) Restrict access with an S3 bucket ACL

D) Restrict push permission with an IAM policy

**Answer: B**

Explanation: Preventing tampering (integrity and proof of origin) is the domain of **signing**. If you sign artifacts with AWS Signer and verify the signature at deployment with ECR Image Signing/Notation, you are assured that the image is exactly as built and was made by a trusted signer. KMS (A) is confidentiality (encryption), not integrity or origin. The lesson of supply chain attacks like SolarWinds is precisely that "even an encrypted, signed channel is powerless if the build is contaminated," which is why SLSA/SBOM/signature verification became standard. An ACL (C) and push restrictions (D) are only access control, not proof of integrity.

---

**Question 4.** You want to automatically detect on a regular basis the possibility that someone manually changed a resource managed by CloudFormation in the console, and to send a notification when found. What is the most appropriate pattern?

A) Create a Change Set every time

B) Run Drift Detection periodically with an EventBridge Scheduled Rule + SNS notification when drift is found (or a Config rule + Auto-Remediation)

C) Block all changes with a Stack Policy

D) Configure a Rollback Configuration

**Answer: B**

Explanation: Drift is "the difference between the declared code state and the actual state," and automatic detection is the pattern of running Drift Detection periodically with an EventBridge Scheduled Rule and announcing the result through SNS, or using an AWS Config stack drift rule + Auto-Remediation to return to the code state. A Change Set (A) is only a preview of changes before applying, not after-the-fact drift detection. A Stack Policy (C) protects specific resources during stack updates and does not detect manual console changes. A Rollback Configuration (D) is a rollback trigger for a failed deployment.

---

**Question 5.** You want to roll out an application's feature flags gradually, block bad configuration values before deployment, and roll back automatically when a problem occurs. What is the most appropriate combination?

A) Store the flags in a Parameter Store SecureString

B) AppConfig + Validator (JSON Schema/Lambda) + Deployment Strategy (gradual rollout) + automatic rollback by CloudWatch Alarm

C) Store the flags in Secrets Manager and rotate them

D) Keep the flags in DynamoDB and have the application poll directly

**Answer: B**

Explanation: AppConfig is the only service that treats a configuration change "like a deployment": it provides advance validation with a Validator (blocking bad values), gradual rollout with a Deployment Strategy, and automatic rollback through CloudWatch Alarm integration. Parameter Store (A), Secrets Manager (C), and your own DynamoDB (D) do not have validation, gradual deployment, or automatic rollback built in. Remember, though, that AppConfig is a polling model (not push).

---

**Question 6.** CodePipeline in the Tooling (CICD) account tries to deploy a CloudFormation stack cross-account to a Spoke account but fails with an "Access Denied (KMS)" error. What is the most common root cause?

A) The Spoke account lacks CloudFormation permissions

B) The artifact is encrypted with the Tooling account's KMS CMK, and the KMS key policy does not give the Spoke account's deployment Role permission to decrypt with that key (both the S3 bucket policy and the KMS key policy must allow the Spoke)

C) The pipeline is V1

D) A Change Set was not created

**Answer: B**

Explanation: This is the classic trap of cross-account pipelines. If the artifact in the Tooling account's S3 is encrypted with a KMS CMK, then for the Spoke's deployment Role to read it, (1) the S3 bucket policy must allow the Spoke and (2) **the KMS key policy must also allow the Spoke to decrypt**. If either is missing, you get KMS Access Denied. Beginners fix only S3 and forget KMS. CloudFormation permissions (A), whether it is V1 (C), and Change Sets (D) are not causes of a KMS error.

---

**Question 7.** In a new AWS environment, you want to configure GitHub Actions to deploy to AWS resources without static access keys. What is the most appropriate method?

A) Create an IAM User and store the access key in GitHub Secrets

B) Register an IAM OIDC Identity Provider and configure GitHub Actions to get short-lived credentials through `AssumeRoleWithWebIdentity`

C) Use the root account credentials

D) Migrate to CodeCommit

**Answer: B**

Explanation: Static keys are the source of leakage and rotation burden. GitHub Actions issues GitHub's OIDC token, and if you register an OIDC Identity Provider in AWS and allow only a specific repo/branch in the trust policy, it can obtain short-lived STS credentials through `AssumeRoleWithWebIdentity` and deploy, with no long-term keys at all. IAM User keys (A) are the static-key anti-pattern, root credentials (C) are a serious security violation, and migrating to CodeCommit (D) is inappropriate because new sign-ups are closed. For the same purpose (removing static keys) on an on-premises machine, you use IAM Roles Anywhere.

---

## 📌 Today's Summary

1. Domains 1+2 (39%) are not two separate domains but a single "commit → production" flow, and the traps sit at the points where domain boundaries cross (pipeline + IaC + KMS).
2. The Code* split is the Continuous Delivery stage model + separation of concerns, V2 variables, triggers, and execution modes are Pro favorites, and CodeCommit is excluded from new environments.
3. Deployment strategies are the math of "affected users × exposure time": distinguish Canary (two steps) from Linear (equal increments), know the per-platform mechanisms, and avoid big-bang (the TSB lesson).
4. The build is the starting point of the chain of trust: integrity comes from Signer/Notation signing + Inspector SBOM, not KMS (encryption) (the SolarWinds/SLSA context).
5. IaC is a declarative convergence loop and idempotency, drift is detected automatically with EventBridge/Config, and configuration is separated into Parameter Store/Secrets Manager/AppConfig.
