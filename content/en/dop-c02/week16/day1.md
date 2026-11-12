# Day 1 - Domain 1+2 Integrated Review: SDLC Automation and IaC as One Thread

The first post of the final week, reached after running through sixteen weeks, carries the name "review," but it is not just a lineup of memorization cards. A real review is not about re-memorizing scattered service names; it is **threading together why those services sit where they do — what problems they were born to solve, which other tools they compete with, and which failures taught the lessons that shaped them into what they are now**. On the DOP-C02 exam, Domain 1 (SDLC Automation, 22%) and Domain 2 (IaC + Configuration Management, 17%) together make up 39%, the largest share. They are split into separate domains in the exam blueprint, but in practice they are not separate. The pipeline deploys infrastructure, the infrastructure defines the pipeline, and configuration flows between the two. Today we reconstruct this 39% as "the single flow of code going from commit to production," digging into the history, internals, and real-incident lessons laid along each stretch of that flow.

This integrated view matters because most of the Pro exam's traps sit at the points where they "cross domain boundaries." A question like "CodePipeline deploys CloudFormation StackSets, but a KMS error occurs cross-account" tangles Domain 1 (pipeline), Domain 2 (IaC), and Domain 6 (security) at the same time. Someone who memorized each service separately collapses at this intersection, while someone who understood it as a flow immediately spots "ah, the artifact encryption key policy is missing."

## The Lineage of SDLC Automation — Why Is the Code* Suite Split This Way

It is no accident that AWS's developer tools — CodeCommit, CodeBuild, CodeDeploy, CodePipeline — are split into four. This split directly reflects **the canonical stage model of a CI/CD pipeline**. The stages source → build → test → deploy come from the **Continuous Delivery** concept established by Jez Humble and David Farley in the mid-2000s, and their 2010 book *Continuous Delivery* popularized the term "deployment pipeline." AWS's Code* suite decomposes this book's pipeline model into managed services.

> Splitting a pipeline into stages is the same idea as the CS principle of **pipelining**. Just as a CPU divides instruction execution into fetch-decode-execute-writeback stages so that different instructions occupy each stage at the same time, a CI/CD pipeline that separates its stages lets commit B occupy the build stage while commit A is in the deploy stage (in theory). More important is **separation of concerns**. If you separate the responsibilities of build (compiling, testing, producing artifacts) from those of deploy (traffic shifting, rollback), each stage can be replaced, scaled, and retried independently. The power of this separation is that even if you swap CodeBuild for Jenkins or CodeDeploy for Spinnaker, the orchestrator called CodePipeline can stay as it is. A question on the exam like "what happens when a Stage in CodePipeline fails" presupposes this stage independence — if one Action fails, execution stops at that Stage, and the outputs of previous Stages are preserved.

> CodePipeline has two generations, V1 and V2, and this difference is within the Pro exam scope. V1 is the model from its 2015 launch, with simple triggers (any source change runs the whole pipeline) and no pipeline variables. V2 (introduced in 2023) supports **dynamic variables**, **fine-grained triggers (filePaths, branches, and tags filters)**, and **pipeline-level variable passing**. For example, to "run the payment pipeline only when the `services/payment/**` path changes in a monorepo," you need V2's `filePaths` trigger. V2 also lets you choose an execution mode (SUPERSEDED, QUEUED, PARALLEL), controlling whether to queue or run in parallel when concurrent commits pile up. The billing model also differs — V1 is a flat monthly fee per active pipeline, while V2 bills by execution time (action minutes), so V2 is cheaper for pipelines that rarely run. When the exam gives a "monorepo path filter" or "dynamic variable" clue, the answer is V2.

Knowing this lineage resolves one exam trap — **CodeCommit has been closed to new customers since July 2024.** AWS shifted its weight to integration with external Git hosting such as GitHub and GitLab (CodeConnections, formerly CodeStar Connections). So the latest Pro exam scenarios ask about external source + federation patterns such as "GitHub Actions deploys to AWS via OIDC." Before picking CodeCommit as the answer, you need the habit of checking "is this a new environment?"

## The Mathematics of Deployment Strategies — What Do Blue/Green, Canary, and Rolling Calculate Differently

Deployment strategy is the heart of the DOP exam. But if you memorize In-place / Blue/Green / Canary / Linear / Rolling only as "has downtime / doesn't," you will miss Pro questions. Each strategy is a different piece of mathematics that minimizes **"the number of users a bad deployment affects × how long that impact lasts"** in its own way.

| Strategy | Users affected (on a bad deployment) | Extra infrastructure cost | Rollback speed | Core mechanism |
|----------|------|------|------|------|
| All-at-once / In-place | 100% immediately | 0 | Slow (redeploy) | Replace everything at once |
| Rolling | Grows by batch percentage | 0 | Medium | Replace N instances at a time sequentially |
| Blue/Green | 0% (before the switch) / 100% (after the switch) | 2x (temporary) | Instant (route traffic back) | Two environments + routing switch |
| Canary | Only the canary percentage (e.g., 10%) | Slight | Automatic (alarm) | Two stages: minority → majority |
| Linear | Increases by incremental percentages | Slight | Automatic (alarm) | N% every N minutes |

> The name canary deployment comes from the **canary in a coal mine**. In the 19th century, miners took canary birds into the tunnels to detect carbon monoxide and methane, and the birds collapsed before the people did, warning of the danger. The canary group (a small share of traffic) in a canary deployment is exactly that bird — before all users are affected, a small number reveal the new version's problems first. Mathematically this is **sequential hypothesis testing**. You test the null hypothesis "the new version is healthy" with a small amount of traffic, and if the error rate or latency metrics (CloudWatch Alarm) cross a threshold, you reject the hypothesis and roll back automatically. The key insight: a canary minimizes the **expected loss of a bad deployment = fraction of users affected × exposure time**. If a 10% canary is exposed for just 5 minutes, the worst-case loss is bounded at "10% of all × 5 minutes." This contrasts with Blue/Green, where "exposure is 100% immediately after the switch, but rollback is also immediate."

> Even the same "Blue/Green" has completely different mechanisms on each platform. **Lambda**'s Blue/Green is **Alias + weighted routing** — the `prod` Alias distributes 90% to version 1 and 10% to version 2, and CodeDeploy shifts these weights over time (Canary/Linear). **ECS**'s Blue/Green is **two Target Groups on an ALB + two Listeners (production/test)** — CodeDeploy launches the new Task Set on the test listener to validate it, then switches the production listener to the new Target Group. **EC2**'s Blue/Green **launches a new Auto Scaling Group and swaps the ELB registration**. When the exam gives an "ECS Blue/Green" clue, the answer almost always includes "CodeDeploy + ALB Test/Prod Listener," and "Lambda 50% in two steps every 5 minutes" is `Canary50Percent5Minutes`, while "10% every 10 minutes" is `Linear10PercentEvery10Minutes`. You must distinguish the structural difference that Canary is **2 stages (minority→everything)** and Linear is **N stages of equal increments**.

> The failure of the 2017 IT migration at the UK's **TSB Bank** is often cited as a lesson in deployment strategy. TSB switched everything over to a new core banking platform in one go (big-bang), exposing 1.9 million customers at once to an unvalidated system. The result was weeks of outages, customers unable to access their funds, a loss of about £330 million, and regulatory penalties. Had they migrated in stages starting with a few branches and a few customers using a canary/gradual strategy, the blast radius would have been limited to that proportion. The core lesson of this incident matches the DOP exam's philosophy exactly — **"avoid irreversible big-bang deployments, expand the scope of impact gradually, and always have an automatic rollback path ready."** When the exam gives a "minimize risk" or "minimize user impact" clue, All-at-once is the wrong answer.

## Supply Chain Integrity — Why the Build Pipeline Becomes a Target

The build stage is not just a place that compiles code; it is **where the chain of trust begins**. Since the artifact produced here is deployed to production as-is, if the build pipeline is contaminated, everything downstream is contaminated.

> The 2020 **SolarWinds** incident is the textbook case of a supply chain attack. The attackers infiltrated SolarWinds' Orion software **build system** and injected malicious code (SUNBURST) during the compilation process. As a result, a backdoor was distributed through properly signed updates to about 18,000 customer organizations, and government agencies including the US Treasury and the Department of Homeland Security were breached. The core lesson: even if the source code repository is clean, **if the build environment is contaminated, the output is contaminated.** After this incident the industry created the **SLSA (Supply-chain Levels for Software Artifacts)** framework to tier build provenance, isolation, and signing, and the **SBOM (Software Bill of Materials)** — the list of every dependency included in an artifact — became a compliance requirement (US Executive Order 14028). On AWS, you raise the SLSA level with a combination of running CodeBuild in an isolated VPC, signing artifacts (Lambda, containers, AMIs) with **AWS Signer**, attaching **Notation/Notary** signatures to ECR images, and scanning for vulnerabilities based on SBOMs with Inspector.

> ⚠️ **Gotcha**: In a question asking about "preventing tampering with container images," choosing KMS or S3 ACLs is wrong. KMS provides **encryption (confidentiality)**, not **integrity or proof of origin**. What proves that an image is exactly as built and was made by a trusted party is **signing** — AWS Signer + ECR Image Signing + Notation verification at deployment. Confusing encryption with signing is the classic trap in the security area. By analogy, KMS is "putting a letter in an envelope and locking it," while signing is "stamping an unforgeable seal at the end of the letter."

## The Two Philosophies of IaC — Declarative Convergence, Imperative Procedure, and Drift

Moving to Domain 2, the core compresses into a single question. It is the declarative paradigm: **"declare the target state of the infrastructure as code, and the tool computes the difference from the current state and converges it."** CloudFormation, CDK, and Terraform all stand on this idea.

> The foundation of declarative IaC is the **reconciliation loop** — the same as feedback control in control theory. It computes the difference (error) between the "desired state" and the "observed state," and applies the actions that bring that difference to zero. Kubernetes controllers, Terraform's plan/apply, and CloudFormation's stack update are all this loop. This is the essence of the **declarative vs imperative** difference. With an imperative script ("run these commands in order"), humans bear responsibility for execution order, failure handling, and retrying after partial application, but a declarative system guarantees **idempotency** — applying the same code any number of times gives the same result. Idempotency is precisely why IaC can be trusted. Even if you apply the same template 100 times to 100 accounts (StackSets), each account converges to the same target state.

> **Drift** is the most subtle enemy of this paradigm. When someone opens a security group by hand in the console or deletes a tag, the "state the code declared" and the "actual state" diverge. CloudFormation **Drift Detection** compares each resource of the stack to its actual state and classifies it as MODIFIED, DELETED, or IN_SYNC. But what the exam asks is "how to detect and respond to drift **automatically**." The answer pattern: trigger periodic Drift Detection with an EventBridge **Scheduled Rule**, and when drift is found, hook up an SNS notification or an automatic redeployment (reverting to the code state with a stack update). For stronger governance, use the **AWS Config** `cloudformation-stack-drift-detection-check` rule to detect noncompliance and hook up Auto-Remediation. The key insight: drift is "the trace of an imperative change intruding into a declarative system," and the fundamental remedy is to **block console write permissions and let every change flow only through code** (read-only by default + pipeline-only write).

> The 2017 **AWS S3 us-east-1 major outage** shows the danger of imperative operations. While debugging the S3 billing subsystem, an engineer ran a **manual command (playbook)** that contained a typo removing more servers than intended, which triggered cascading restarts and paralyzed a significant part of us-east-1 for about 4 hours (many websites went down with it). One of AWS's follow-up actions was "add safety guardrails and phased application to such dangerous manual operations" — a direction that changes immediate imperative execution into declarative, gradual application. This incident left the lesson that "manual changes have an immediate, uncontrollable blast radius" and strengthened the justification for IaC + pipeline-based changes (code review → Change Set preview → gradual application).

## The Separation of Configuration Management — How Do Parameter Store, Secrets Manager, and AppConfig Differ

What flows between code and infrastructure is **configuration**. AWS provides it split three ways, and once you understand this split, the answers come instantly on the exam.

| Item | Parameter Store | Secrets Manager | AppConfig |
|------|------|------|------|
| Essence | Storing settings and parameters | Lifecycle management of secrets | Runtime dynamic configuration and feature flags |
| Automatic rotation | None (implement yourself) | **Built in** (Rotation Lambda) | Not applicable |
| Validation | None | None | **Validator** (JSON Schema/Lambda) |
| Gradual deployment | None | None | **Deployment Strategy** (gradual rollout + automatic rollback) |
| Cost | Standard tier free | ~$0.40 per secret per month | Based on configuration retrievals |
| Typical use | Non-secret settings and environment values | DB/external API credentials | Feature flags, dynamic thresholds |

> The separation of these three is a refinement of the 12-Factor App principle that **"config is not code."** The 12-Factor App (Heroku, 2011) said "values that vary per environment should be separated from code and kept in the environment," but modern systems split that "configuration" again into three kinds. (1) **Static settings** (rarely change, not secret) → Parameter Store. (2) **Secrets** (credentials that need rotation and auditing) → Secrets Manager. (3) **Dynamic behavior control** (changes at runtime, and is immediately dangerous if wrong) → AppConfig. What makes AppConfig special is that it **treats the configuration change itself like a deployment** — it pre-validates with a Validator, rolls out gradually with a Deployment Strategy, and rolls back automatically through CloudWatch Alarm integration. In other words, it prevents the incident that "one wrong line of a feature flag" could cause with the same safety net as a code deployment. On the exam, the clue "gradually roll out a feature flag + block wrong values in advance" has the three-piece set of AppConfig + Validator + Deployment Strategy as the answer.

> ⚠️ **Gotcha**: AppConfig is a **poll** model, not a push model. The application periodically retrieves the configuration through the AppConfig Agent (or the Lambda Extension) (the polling interval is configurable). An option stating "when the configuration changes, AWS immediately pushes it to the application" is a trap. Also, Parameter Store's SecureString does KMS encryption but **has no automatic rotation** — picking Parameter Store for "automatically rotate RDS credentials every 90 days" is wrong. If rotation is the key, it is always Secrets Manager + Rotation Lambda.

## The 39% as One — The Integrated Flow Diagram

If you don't separate Domains 1 and 2 and instead bundle them into a single flow of one commit going to production, you can see where every service belongs.

```
Developer commit (GitHub / CodeCommit-legacy)
   │  CodeConnections (OIDC, no static key)
   ▼
CodePipeline V2 (Tooling account Hub)
   ├─ Source   : Variables/triggers (filePaths, branch filter)
   ├─ Build    : CodeBuild (isolated VPC + VPC Endpoint)
   │              → CodeArtifact (packages) / ECR (images)
   │              → Inspector scan + Signer/Notation signing [supply chain integrity]
   ├─ Test     : Unit/integration + CodeGuru/SAST
   ├─ Deploy   : CloudFormation/CDK (Change Set preview)
   │              cross-account AssumeRole → Spoke
   │              [artifact S3 + KMS CMK key policy must allow the Spoke]
   │              CodeDeploy (Lambda Canary / ECS Blue-Green)
   │              + automatic rollback via CloudWatch Alarm integration
   └─ Config injection: Parameter Store (settings) / Secrets Manager (credentials) / AppConfig (flags)

Governance gates: SSM Change Calendar (freeze) · Manual Approval · Drift Detection (EventBridge)
```

> 🎯 **Scenario**: "A fintech runs 30 services in a monorepo. Requirements: ① Run the corresponding service's pipeline only when `services/X/**` paths change ② Prevent tampering with build artifacts ③ Lambda functions go to everything after a 10% canary for 5 minutes ④ At deployment, DB credentials rotate automatically every 90 days with no exposure in code ⑤ Block prod during change freeze periods." → ① CodePipeline **V2 + filePaths trigger**. ② **Signer/ECR signing + Inspector SBOM scan** (not KMS). ③ CodeDeploy **`Canary10Percent5Minutes`** + CloudWatch Alarm automatic rollback. ④ **Secrets Manager + Rotation Lambda** (not Parameter Store). ⑤ **SSM Change Calendar** gate. These five clues cross Domains 1, 6, 1, 2, and 1 respectively — only someone who memorized it as an integrated flow maps them all in one go.

## Summary

Today we bundled the 39% of Domains 1+2 into five threads. First, **the split of the Code* suite is Continuous Delivery's stage model + separation of concerns**, V2's variables, triggers, and execution modes are in the Pro exam scope, and CodeCommit is out for new environments. Second, **deployment strategy is the mathematics of minimizing "affected users × exposure time" in different ways**; the structural difference between Canary (2 stages) and Linear (equal increments) and the per-platform mechanism differences (Lambda Alias / ECS ALB Listener / EC2 ASG) are the key, and as in the lesson of TSB and big-bang, All-at-once is the wrong answer for risk-minimization clues. Third, **the build is the starting point of the chain of trust**, and in the context of SolarWinds, SLSA, and SBOM, integrity is guaranteed not by KMS (encryption) but by signing (Signer/Notation). Fourth, **IaC is a declarative reconciliation loop + idempotency**, and drift is the trace of an imperative change intruding, so detect and correct it automatically with EventBridge/Config. Fifth, **configuration is separated into Parameter Store (settings), Secrets Manager (rotation), and AppConfig (polling, validation, gradual rollout)**, and each clue is the answer itself.

In the next post, we re-thread Domain 3 (resilience) and Domain 4 (monitoring/logging) through the mathematics of RTO/RPO and the theory of observability.

---

## 📝 Practice Questions

**Question 1.** You want to run the payment pipeline only when the `services/payment/**` path changes in a monorepo, while queuing commits that arrive at the same time. What configuration is needed?

A) A simple CodePipeline V1 source trigger

B) A CodePipeline V2 `filePaths` trigger filter + an execution mode (QUEUED) setting

C) Parse the path yourself with a Lambda custom action

D) Receive every commit with EventBridge and run the entire pipeline

**Answer: B**

Explanation: CodePipeline V2 supports fine-grained triggers that V1 lacks (`filePaths`, branches, and tags filters) and execution modes (SUPERSEDED/QUEUED/PARALLEL). To run only when a specific path changes, you need V2's `filePaths` trigger, and queuing concurrent commits is the QUEUED execution mode. V1 (A) has no path filters or variables. Lambda parsing (C) and running everything through EventBridge (D) are anti-patterns that needlessly reimplement by hand what V2 provides natively.

---

**Question 2.** You want to configure a Lambda function with a two-step deployment: "route only 50% for 5 minutes, then switch to the remaining 50% if there are no problems." Another function requires "increase by 10% every 10 minutes." What deployment configuration fits each?

A) AllAtOnce for both

B) Two 50% steps = `Canary50Percent5Minutes`, 10% increments = `Linear10PercentEvery10Minutes`

C) Rolling for both

D) 50% = Linear, 10% increments = Canary

**Answer: B**

Explanation: Canary has a **two-step (a small percentage → all the rest)** structure, and Linear is **equal increments of N% every N minutes**. "Two steps of 50% over 5 minutes" fits the definition of Canary exactly (`Canary50Percent5Minutes`), and "10% every 10 minutes" is Linear (`Linear10PercentEvery10Minutes`). D, which swaps the structural difference between the two, is the typical wrong answer. AllAtOnce and Rolling (A, C) do not meet the gradual/two-step requirement. For Lambda, both strategies are combined with alias weighted routing + CloudWatch alarm automatic rollback.

---

**Question 3.** You want to verify at deployment time that a container image has not been tampered with since it was built and was created by a trusted principal. What is the most appropriate mechanism?

A) Encrypt the image with KMS

B) Sign with AWS Signer + ECR Image Signing and verify the signature with Notation at deployment

C) Restrict access with an S3 bucket ACL

D) Restrict push permission with an IAM policy

**Answer: B**

Explanation: Preventing tampering (proving integrity and provenance) is the domain of **signing**. If you sign artifacts with AWS Signer and verify the signature at deployment time with ECR Image Signing/Notation, it guarantees the image is exactly as built and was created by a trusted signer. KMS (A) provides confidentiality (encryption), not integrity or provenance — the lesson of supply chain attacks like SolarWinds is that "even an encrypted, signed channel is powerless if the build is contaminated," which is why SLSA/SBOM/signature verification became the standard. ACLs (C) and push restrictions (D) are only access control, not proof of integrity.

---

**Question 4.** You want to periodically and automatically detect the possibility that someone manually changed resources managed by CloudFormation in the console, and send a notification when found. What is the most appropriate pattern?

A) Create a change set every time

B) Run Drift Detection periodically with an EventBridge scheduled rule + SNS notification when drift is found (or a Config rule + auto-remediation)

C) Block all changes with a stack policy

D) Configure a rollback configuration

**Answer: B**

Explanation: Drift is "the difference between the declarative code state and the actual state," and automatic detection is a pattern of running Drift Detection periodically with an EventBridge scheduled rule and notifying the result through SNS, or using the AWS Config stack drift rule + auto-remediation to revert to the code state. A change set (A) is only a preview of changes before applying, not after-the-fact drift detection. A stack policy (C) protects specific resources during stack updates and does not detect manual console changes. A rollback configuration (D) is a rollback trigger when a deployment fails.

---

**Question 5.** You want to roll out an application's feature flags gradually, block incorrect configuration values before deployment, and roll back automatically when a problem occurs. What is the most appropriate combination?

A) Store the flags in Parameter Store SecureString

B) AppConfig + Validator (JSON Schema/Lambda) + Deployment Strategy (gradual rollout) + CloudWatch alarm automatic rollback

C) Store the flags in Secrets Manager and rotate them

D) Keep the flags in DynamoDB and have the application poll directly

**Answer: B**

Explanation: AppConfig is the only service that treats configuration changes "like deployments" — it provides pre-validation with a Validator (blocking incorrect values), gradual rollout with a Deployment Strategy, and automatic rollback through CloudWatch alarm integration. Parameter Store (A), Secrets Manager (C), and a homegrown DynamoDB approach (D) have no built-in validation, gradual deployment, or automatic rollback. However, remember that AppConfig is a polling model (not push).

---

**Question 6.** A CodePipeline in the Tooling (CICD) account tries to deploy a CloudFormation stack cross-account to a Spoke account, but fails with an "Access Denied (KMS)" error. What is the most common root cause?

A) The Spoke account lacks CloudFormation permissions

B) The artifacts are encrypted with the Tooling account's KMS CMK, but the KMS key policy does not allow the Spoke account's deployment role to decrypt with that key (both the S3 bucket policy and the KMS key policy must allow the Spoke)

C) The pipeline is V1

D) A change set was not created

**Answer: B**

Explanation: This is the classic trap of cross-account pipelines. If artifacts in the Tooling account's S3 are encrypted with a KMS CMK, then for the Spoke's deployment role to read them, (1) the S3 bucket policy must allow the Spoke and (2) **the KMS key policy must also allow the Spoke to decrypt**. If either is missing, a KMS Access Denied occurs. Beginners fix only S3 and forget KMS. CloudFormation permissions (A), whether it is V1 (C), and change sets (D) are not causes of a KMS error.

---

**Question 7.** In a new AWS environment, you want to configure GitHub Actions to deploy to AWS resources without static access keys. What is the most appropriate method?

A) Create an IAM user and store the access keys in GitHub Secrets

B) Register an IAM OIDC identity provider and configure GitHub Actions to obtain short-lived credentials through `AssumeRoleWithWebIdentity`

C) Use root account credentials

D) Migrate to CodeCommit

**Answer: B**

Explanation: Static keys are the source of leak and rotation burdens. GitHub Actions issues GitHub's OIDC token; if you register an OIDC identity provider in AWS and allow only a specific repo/branch in the trust policy, it can receive short-lived STS credentials through `AssumeRoleWithWebIdentity` and deploy — there are no long-term keys at all. IAM user keys (A) are the static key anti-pattern, root credentials (C) are a serious security violation, and migrating to CodeCommit (D) is inappropriate because new sign-ups are closed. For the same purpose (eliminating static keys) from on-premises machines, use IAM Roles Anywhere.

---

## 📌 Today's Summary

Today we tied 39% of Domains 1+2 into five threads. First, the split of the Code* product family is the Continuous Delivery stage model + separation of concerns; V2 variables, triggers, and execution modes are Professional favorites, and CodeCommit is excluded for new environments. Second, deployment strategy is the math of minimizing "affected users × exposure time" in different ways; the structural difference between Canary (two stages) and Linear (equal increments) and the per-platform mechanism differences (Lambda Alias / ECS ALB Listener / EC2 ASG) are the key, and as in the lessons of TSB and big-bang, All-at-once is the wrong answer whenever there is a risk-minimization clue. Third, the build is the starting point of the chain of trust, and in the context of SolarWinds, SLSA, and SBOM, integrity is guaranteed not by KMS (encryption) but by signing (Signer/Notation). Fourth, IaC is a declarative convergence loop + idempotency, and drift is detected and corrected automatically with EventBridge/Config. Fifth, configuration is separated into Parameter Store (settings), Secrets Manager (rotation), and AppConfig (polling, validation, gradual rollout), and each clue is itself the answer.
